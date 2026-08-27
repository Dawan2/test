/* ============ store.js 全局状态与持久化 ============ */
(function () {
  const KEY = 'mv_hujing_state_v1';
  const TOKEN_KEY = 'mv_hujing_token';
  const REV_KEY = 'mv_hujing_rev'; // rev 随 state 持久化,避免刷新后乐观锁必 409

  const blank = () => ({
    schemaVersion: 1,     // state 结构版本(load 时补齐;后续结构迁移以此判定)
    users: [],            // {id, username, password, accountType:'personal'|'company', credits, createdAt}
    session: null,        // userId
    creditLogs: [],       // {id, userId, type:'gain'|'spend'|'refund'|'recharge', amount, balance, reason, time}
    orders: [],           // {id, userId, orderNo, amountYuan, credits, gifted, channel, time}
    projects: [],         // 见 projects.js
    assets: { subjects: [], groups: [] },
    favorites: [],        // {id, userId, projectId, episodeId, shotId, prompt, model, time}
    materials: [],        // 素材库 {id, userId, name, kind:'audio'|'image', data, size, time}
    fileFavs: {},         // 文件资产收藏 {url: true}(文件列表来自 GET /api/uploads)
    assetReviews: [],     // 本地可用性检查记录 {id, userId, name, url, status:'pending'|'local_available'|'approved'(真实审核预留)|'rejected', reason, time, doneAt}
    portraitCerts: [],    // 肖像白名单认证 {id, name, idNo, relation, time}(见 compliance.js)
    settings: {},         // 全局配置(见 gsettings.js)
    tasks: [],            // 任务监控(见 tasks.js,最多 200 条)
    team: { members: [], inviteCode: null },  // members: {id,name,role,status,credits,used,deleted}
    trash: [],            // 回收站 {id, kind:'project'|'asset', name, data(完整快照), deletedAt}(软删除保留 7 天,见 trashPurge)
  });

  /* 主体防崩坏一致性前缀(单一来源:镜头组 shotgroups.js 与节拍板 beatboard.js 共用) */
  window.CONSIST_PREFIX = '面部五官清晰稳定不变形,同一角色全程外貌一致。人体结构正常比例自然,动作连续不跳帧。视频全程同一时刻只有一个角色本体,不出现重复人物、分身或双胞胎效果。';

  /* 在线判定:指纹/就绪函数的环境参数(domain.js 不读 window,经参数显式传入) */
  const _online = () => !!(window.Media && Media.isReady());

  const Store = {
    state: null,
    rev: 0,               // 与服务端同步的版本号
    _syncTimer: null,
    _pulling: false,
    load() {
      try {
        const raw = localStorage.getItem(KEY);
        this.state = raw ? JSON.parse(raw) : blank();
      } catch (e) { this.state = blank(); }
      try { this.rev = parseInt(localStorage.getItem(REV_KEY), 10) || 0; } catch (_) { this.rev = 0; }
      // 兼容补字段(顶层 + assets 嵌套:旧数据可能缺 assets.groups)
      const b = blank();
      for (const k in b) if (this.state[k] === undefined) this.state[k] = b[k];
      this.state.assets = Object.assign({ subjects: [], groups: [] }, this.state.assets);
      this.trashPurge(); // 加载即清理回收站到期条目(保留 7 天)
      this.sweepStale(); // 断点闭环:清扫页面刷新前悬挂的运行中任务/生成中镜头(回退为失败)
      this.migrateInputHash(); // 存量 inputHash v1→v2 原位升级(输入未变的镜头不误报"素材已更新")
      return this.state;
    },
    save() {
      // 本地落盘防抖 250ms:286 处调用点含逐键输入,同步 stringify+setItem 会卡输入并放大 IO;
      // 页面隐藏/卸载时 flushNow 兜底,云端同步(scheduleSync)不受影响
      this._dirty = true; // R18:未落盘修改标记(跨标签页采纳判定:脏时不被他页覆盖)
      clearTimeout(this._saveTimer);
      this._saveTimer = setTimeout(() => this.flushNow(), 250);
      this.scheduleSync();
    },
    /* 本地持久化:大 dataURL(>64KB)标记化离线到 IndexedDB,localStorage 只留 'idb:' 引用;
     * 受限环境(file:// 等 IDB 打不开)自动退化为纯 JSON 全量落盘。云端同步始终推全量值(跨设备不破坏)。 */
    persistLocal() {
      try {
        const useIdb = window.IDB && IDB.ok;
        if (useIdb && IDB.beginPersist) IDB.beginPersist(); // 两阶段提交:先重试失败写入,未确认键保留原值不落标记
        localStorage.setItem(KEY, JSON.stringify(this.state, useIdb ? IDB.markerReplacer : null));
        return true;
      } catch (e) { return false; }
    },
    /* 项目脏标记:相对推送基线变化的项目盖 updatedAt 时间戳(供 409 三方合并"较新者胜") */
    touchProjects() {
      if (!this._pushBase) return;
      (this.state.projects || []).forEach(p => {
        if (this._pushBase.projects[p.id] !== JSON.stringify(p)) p.updatedAt = Date.now();
      });
    },
    /* 立即落盘(防抖冲刷/关键节点调用) */
    flushNow() {
      clearTimeout(this._saveTimer);
      // 连续性:save 前为每个改动项目盖 __ver/__lastSaved(200ms 窗口内幂等),并广播跨 Tab
      if (window.Continuity && typeof Continuity.bumpVer === 'function' && Array.isArray(this.state.projects)) {
        const changed = [];
        if (!this._pushBase) {
          this.state.projects.forEach(p => { Continuity.bumpVer(p); changed.push(p); });
        } else {
          this.state.projects.forEach(p => {
            if (this._pushBase.projects[p.id] !== JSON.stringify(p)) {
              Continuity.bumpVer(p);
              changed.push(p);
            }
          });
        }
        changed.forEach(p => { try { Continuity.broadcastSave(p, null); } catch (_) {} });
      }
      this.touchProjects();
      if (this.persistLocal()) { this._dirty = false; return; }
      // 本地存储写满(占位图 dataURL 体积大)时不阻断业务流程:仅提示一次,云端同步照常
      if (!this._quotaWarned && window.U) {
        this._quotaWarned = true;
        U.toast(this.getToken()
          ? '本地存储空间已满,修改将只保留在当前会话与云端,建议登录后端使用'
          : '本地存储空间已满,修改可能无法保存,建议清理素材或启动后端同步', 'error', 4000);
      }
    },
    uid(p) { return (p || 'id') + '_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7); },
    now() { return new Date().toLocaleString('zh-CN', { hour12: false }); },

    /* R18 IDB 引用清扫(标记-清扫):收集活引用键(内存全量值的内容寻址键 + 本地落盘快照/冲突备份中的
     * 'idb:' 标记),IDB 中其余键为孤儿 blob(已删项目/镜头/回收站过期残留),后台回收;
     * 24h 节流,全程静默失败(GC 是优化不是主流程)。调用方:启动水合完成后(app.js boot) */
    async gcIdb() {
      if (!window.IDB || !IDB.ok || !IDB.gc) return;
      try {
        const last = +(localStorage.getItem('mv_hujing_idb_gc_at') || 0);
        if (Date.now() - last < 24 * 3600 * 1000) return;
        localStorage.setItem('mv_hujing_idb_gc_at', String(Date.now()));
        const keep = new Set();
        const collect = (node) => {
          if (!node || typeof node !== 'object') return;
          if (Array.isArray(node)) { node.forEach(collect); return; }
          for (const k in node) {
            const v = node[k];
            if (typeof v === 'string') {
              if (IDB.isBig(v)) keep.add(IDB.keyOf(v));
              else if (v.startsWith(IDB.MARK)) keep.add(v.slice(IDB.MARK.length));
            } else if (v && typeof v === 'object') collect(v);
          }
        };
        collect(this.state);
        try { collect(JSON.parse(localStorage.getItem(KEY) || 'null')); } catch (_) {}
        try { (JSON.parse(localStorage.getItem('mv_hujing_conflict_bak') || '[]')).forEach(b => collect(b)); } catch (_) {}
        await IDB.gc(keep);
      } catch (_) { /* GC 失败静默,下轮再试 */ }
    },

    /* ---- 后端 token 与同步(离线时自动静默) ---- */
    getToken() { try { return localStorage.getItem(TOKEN_KEY) || ''; } catch (_) { return ''; } },
    setToken(t) {
      try { localStorage.setItem(TOKEN_KEY, t); }
      catch (e) {
        // 对齐 save() 的配额处理:写满不阻断,仅提示
        if (window.U) U.toast('本地存储空间已满,登录状态可能无法保存,建议清理后重试', 'error', 4000);
      }
    },
    clearToken() { localStorage.removeItem(TOKEN_KEY); },
    scheduleSync() {
      // M4:_pulling 期间也允许入队(syncPush 会顺延重排),否则拉取窗口内的保存会丢失
      if (!this.getToken()) return;
      clearTimeout(this._syncTimer);
      this._syncTimer = setTimeout(() => this.syncPush(), 1000); // 防抖 1s
    },
    /* 推送基线快照(增量同步用):meta=除 projects 外的整树,projects 按 id 分桶,各存 JSON 串 */
    _snapshotBase() {
      const meta = Object.assign({}, this.state); delete meta.projects;
      const projects = {};
      (this.state.projects || []).forEach(p => { projects[p.id] = JSON.stringify(p); });
      return { meta: JSON.stringify(meta), projects };
    },
    /* R17:带超时的 fetch(默认 30s)——服务端挂起/半开连接时 syncPush 的 _pushing 不再永久卡死,
     * 超时走 catch 提示并由 finally 复位,下一轮 scheduleSync 自动重试 */
    _fetchTimeout(url, opts, ms) {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), ms || 30000);
      return fetch(url, Object.assign({}, opts, { signal: ctrl.signal })).finally(() => clearTimeout(timer));
    },
    async syncPush() {
      const token = this.getToken();
      if (!token) return;
      if (this._pulling) { this.scheduleSync(); return; } // M4 修复:拉取期间入队重排,而非静默丢弃
      if (this._pushing) { this._pushAgain = true; return; } // 在途守卫:本次结束后补推一次
      this._pushing = true;
      try {
        // 增量同步:有基线时只推变化的项目/元数据桶(大 state 不再每次全量 PUT);无变化直接跳过
        // _forceFullPush(409 合并后置位):合并树必须强制整树回写云端一次,成功后才重建基线——
        // 否则基线=合并树会让下次增量判定"无变化",云端永远停留在合并前的旧版本
        let bodyObj = { rev: this.rev, state: this.state };
        if (this._pushBase && !this._forceFullPush) {
          const meta = Object.assign({}, this.state); delete meta.projects;
          const metaStr = JSON.stringify(meta);
          const changes = { projects: {}, deletedProjects: [] };
          if (metaStr !== this._pushBase.meta) changes.meta = meta;
          const curIds = new Set();
          (this.state.projects || []).forEach(p => {
            curIds.add(p.id);
            const ps = JSON.stringify(p);
            if (this._pushBase.projects[p.id] !== ps) changes.projects[p.id] = p;
          });
          Object.keys(this._pushBase.projects).forEach(id => { if (!curIds.has(id)) changes.deletedProjects.push(id); });
          if (!changes.meta && !Object.keys(changes.projects).length && !changes.deletedProjects.length) return; // 无变化
          bodyObj = { rev: this.rev, changes };
        }
        const res = await this._fetchTimeout('/api/state', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
          body: JSON.stringify(bodyObj),
        });
        if (res.status === 409) {
          this.backupOnConflict(); // 合并前留档(回收站页可恢复):双改落败方有完整找回途径
          if (await this.mergeCloud()) {
            if (window.U) U.toast('云端有更新,已按项目智能合并:同一项目本机与云端都改过时,按分集/主体逐级三方合并(各改各的互不覆盖);无法细分的字段保留较新一方,另一方可从回收站「本地冲突备份」找回', 'info', 5000);
            if (window.__reroute) window.__reroute(); // 当前页立即呈现合并结果
            this.scheduleSync(); // 推送合并树,云端同步收敛
            return;
          }
          await this.pullState();
          // 合并失败(网络等)才整树拉取覆盖
          if (window.U) U.toast('云端数据较新,已以云端为准覆盖本地;原本地数据已备份,可在回收站页「本地冲突备份」找回', 'info', 4500);
          return;
        }
        if (res.status === 401) {
          // 八轮:统一走 U.authExpired(清 token+session+对账 guard,防"清了 token 留旧 session"的假登录态)
          if (window.U && U.authExpired) U.authExpired();
          else this.clearToken();
          return;
        }
        if (res.ok) {
          const j = await res.json();
          if (j.code === 0) {
            this.rev = j.data.rev; this._syncWarned = false;
            this._pushBase = this._snapshotBase(); // 记录推送基线,下次只推增量(合并树回写成功后才重建)
            this._forceFullPush = false;
            try { localStorage.setItem(REV_KEY, String(this.rev)); } catch (_) { /* 本地已满 */ }
          }
        } else {
          // M5 修复:非 409/401 失败(如 413 数据过大)提示一次
          throw new Error('sync http ' + res.status);
        }
      } catch (_) {
        if (!this._syncWarned && window.U) {
          this._syncWarned = true;
          U.toast('云端同步失败(网络异常或数据过大),当前为本地模式,稍后将自动重试', 'error', 4000);
        }
      } finally {
        this._pushing = false;
        if (this._pushAgain) { this._pushAgain = false; this.scheduleSync(); }
      }
    },
    /* 通用三方合并(基线 b / 本地 l / 云端 c):单侧未动取对端;双改时对象按键递归、
     * id 数组按项递归(单侧删除对端未改才生效,删除遇修改保留修改),叶子冲突取根对象 updatedAt 较新一端。
     * 用于双改项目的 episode→shot/subject 级合并,替代整项目较新者胜(两端改不同分集不再互相覆盖) */
    _merge3(b, l, c, lr, cr) {
      lr = (lr === undefined) ? l : lr; cr = (cr === undefined) ? c : cr; // 根对象(叶子冲突按其 updatedAt 裁决)
      const ls = JSON.stringify(l), cs = JSON.stringify(c), bs = JSON.stringify(b);
      if (ls === cs) return l; // 两端一致(含同删/同改)
      if (ls === bs) return c; // 本地未动 → 云端
      if (cs === bs) return l; // 云端未动 → 本地
      const isObj = v => v && typeof v === 'object' && !Array.isArray(v);
      if (isObj(b) && isObj(l) && isObj(c)) {
        const out = {};
        new Set([...Object.keys(b), ...Object.keys(l), ...Object.keys(c)]).forEach(k => {
          const v = this._merge3(b[k], l[k], c[k], lr, cr);
          if (v !== undefined) out[k] = v;
        });
        return out;
      }
      if (Array.isArray(b) && Array.isArray(l) && Array.isArray(c)
        && [b, l, c].every(a => a.every(x => x == null || (typeof x === 'object' && x.id)))) {
        // id 数组(episodes/shots/subjects/groups 等):基线序为骨,新增云端序优先、本地追加
        const bm = new Map(b.filter(x => x && x.id).map(x => [x.id, x]));
        const lm = new Map(l.filter(x => x && x.id).map(x => [x.id, x]));
        const cm = new Map(c.filter(x => x && x.id).map(x => [x.id, x]));
        const out = [], taken = new Set();
        bm.forEach((bi, id) => {
          const m = this._merge3(bi, lm.has(id) ? lm.get(id) : undefined, cm.has(id) ? cm.get(id) : undefined, lr, cr);
          if (m !== undefined) { out.push(m); taken.add(id); }
        });
        cm.forEach((ci, id) => { if (!bm.has(id) && !taken.has(id)) { out.push(ci); taken.add(id); } }); // 云端新增
        lm.forEach((li, id) => { if (!bm.has(id) && !taken.has(id)) { out.push(li); taken.add(id); } });   // 本地新增
        return out;
      }
      // 无法细分的叶子双改:删除让位修改;标量/异构按根对象 updatedAt 较新一端(缺省本地)
      if (l === undefined) return c;
      if (c === undefined) return l;
      return (((lr && lr.updatedAt) || 0) >= ((cr && cr.updatedAt) || 0)) ? l : c;
    },
    /* 409 三方合并(本地/云端/上次推送基线)——替代整树覆盖,多端编辑不再互相冲掉:
     * 项目桶:仅本地改→本地;仅云端改→云端;双方都改→项目内部三方合并(episode→shot/subject 逐级);删除vs修改→修改胜;
     * meta 键级三方:云端为底,本地相对基线改过的键覆盖(计费键天然来自云端,服务端权威);
     * 回收站按 id 并集。失败返回 false(调用方回退整树拉取)。 */
    async mergeCloud() {
      const token = this.getToken();
      if (!token) return false;
      let j = null;
      try {
        const res = await this._fetchTimeout('/api/state', { headers: { Authorization: 'Bearer ' + token } }, 20000);
        if (res.status === 401) {
          // 八轮:401 统一走 U.authExpired(此前被当普通网络错误吞掉)
          if (window.U && U.authExpired) U.authExpired();
          return false;
        }
        if (!res.ok) return false;
        j = await res.json();
      } catch (_) { return false; }
      if (!j || j.code !== 0 || !j.data || !j.data.state) return false;
      const cloud = j.data.state;
      const local = this.state;
      const base = this._pushBase || { meta: '{}', projects: {} };
      let baseMeta = {};
      try { baseMeta = JSON.parse(base.meta || '{}'); } catch (_) {}

      /* 1) meta 键级三方(七轮细化):id 数组键(favorites/materials/assetReviews/assets.subjects/groups 等)走 _merge3
       * 逐项合并(两端各收藏/各传素材互不覆盖);其余键保持"云端为底,本地相对基线改过/新增的键覆盖"
       * (计费键天然来自云端,服务端权威;settings/team 等整体键沿用覆盖语义) */
      const META_MERGE_KEYS = ['favorites', 'materials', 'assetReviews', 'portraitCerts', 'fileFavs'];
      /* R17 合并后对账:users/creditLogs/orders/session 为服务端权威键(钱包账本为准),
       * 本地消费/退费造成的视图漂移不得借"相对基线改过"覆盖刚拉回的云端值——
       * 否则合并树本地余额与服务端钱包漂移,要等下次全量拉取才自愈 */
      const BILLING_SERVER_KEYS = ['users', 'creditLogs', 'orders', 'session'];
      const out = Object.assign({}, cloud);
      for (const k in local) {
        if (k === 'projects') continue;
        if (BILLING_SERVER_KEYS.includes(k) && cloud[k] !== undefined) continue; // 保留云端(服务端权威),本地漂移以钱包对账收敛;云端缺键才落本地兜底
        if (META_MERGE_KEYS.includes(k)) {
          if (Array.isArray(local[k]) && Array.isArray(cloud[k])) {
            out[k] = this._merge3(Array.isArray(baseMeta[k]) ? baseMeta[k] : [], local[k], cloud[k]);
            continue;
          }
          if (k === 'fileFavs' && local[k] && typeof local[k] === 'object' && cloud[k] && typeof cloud[k] === 'object') {
            // 键值对象三方合并(八轮):本地取消收藏(基线有、本地无)不再被云端并回;
            // 云端新增/本地新增都保留,双方都有的键取本地(最近编辑)
            const bf = (baseMeta[k] && typeof baseMeta[k] === 'object' && !Array.isArray(baseMeta[k])) ? baseMeta[k] : {};
            const o = {};
            for (const fk in cloud[k]) {
              if (!(fk in local[k]) && (fk in bf)) continue; // 本地已删除该收藏:不并回
              o[fk] = cloud[k][fk];
            }
            Object.assign(o, local[k]);
            out[k] = o;
            continue;
          }
        }
        if (k === 'assets' && local.assets && cloud.assets) {
          out.assets = {
            subjects: this._merge3(Array.isArray((baseMeta.assets || {}).subjects) ? baseMeta.assets.subjects : [],
              Array.isArray(local.assets.subjects) ? local.assets.subjects : [], Array.isArray(cloud.assets.subjects) ? cloud.assets.subjects : []),
            groups: this._merge3(Array.isArray((baseMeta.assets || {}).groups) ? baseMeta.assets.groups : [],
              Array.isArray(local.assets.groups) ? local.assets.groups : [], Array.isArray(cloud.assets.groups) ? cloud.assets.groups : []),
          };
          continue;
        }
        if (JSON.stringify(local[k]) !== (k in baseMeta ? JSON.stringify(baseMeta[k]) : undefined)) out[k] = local[k];
      }
      /* 回收站按 id 并集(本地删除/云端删除都保留,deletedAt 较新者优先) */
      const trashMap = {};
      (cloud.trash || []).forEach(t => { if (t && t.id) trashMap[t.id] = t; });
      (local.trash || []).forEach(t => { if (!t || !t.id) return; const c = trashMap[t.id]; if (!c || (t.deletedAt || 0) >= (c.deletedAt || 0)) trashMap[t.id] = t; });
      out.trash = Object.values(trashMap);

      /* 2) 项目桶三方合并(保云端序,本地新增追加) */
      const lm = {}, cm = {};
      (local.projects || []).forEach(p => { lm[p.id] = p; });
      (cloud.projects || []).forEach(p => { cm[p.id] = p; });
      const merged = [];
      const taken = new Set();
      (cloud.projects || []).forEach(c => {
        const l = lm[c.id];
        const bS = base.projects[c.id] || null;
        const lS = l ? JSON.stringify(l) : null;
        const cChg = JSON.stringify(c) !== bS;
        const lChg = lS !== bS;
        let win = c;
        if (!l && bS && !cChg) win = null; // 本地删除且云端未改 → 维持删除
        else if (l && lChg && !cChg) win = l; // 仅本地改 → 本地
        else if (l && lChg && cChg) {
          // 双改同项目:项目内部三方合并(episode→shot/subject 逐级递归),
          // 两端各改不同分集/主体时互不覆盖;基线缺失或损坏才回退整项目较新者胜
          let bObj = null;
          try { bObj = bS ? JSON.parse(bS) : null; } catch (_) { bObj = null; }
          if (bObj && typeof bObj === 'object') {
            win = this._merge3(bObj, l, c);
            if (win && typeof win === 'object') win.updatedAt = Math.max(l.updatedAt || 0, c.updatedAt || 0); // 合并后视为最新,后续同步以整体为新基线
          } else win = ((l.updatedAt || 0) >= (c.updatedAt || 0)) ? l : c;
        }
        if (win) { merged.push(win); taken.add(win.id); }
      });
      (local.projects || []).forEach(l => {
        if (taken.has(l.id)) return;
        const bS = base.projects[l.id] || null;
        if (!cm[l.id]) { // 云端已删:本地改过或本地新增 → 保本地(删除vs修改,修改胜)
          if (JSON.stringify(l) !== bS || !bS) merged.push(l);
        }
      });
      out.projects = merged;

      /* 3) 生效:切换到合并树并强制整树回写(2026-08 六轮修复):
       * 基线置空 + _forceFullPush → 随后的 syncPush 按最新云端 rev 全量提交合并树,成功后才重建基线;
       * 原实现基线=合并树,会让下次增量判定"无变化",云端停留在合并前旧版本(第三端拉取拿不到合并结果) */
      this.state = out;
      const b = blank();
      for (const k in b) if (this.state[k] === undefined) this.state[k] = b[k];
      this.state.assets = Object.assign({ subjects: [], groups: [] }, this.state.assets);
      this.rev = j.data.rev || 0;
      try { localStorage.setItem(REV_KEY, String(this.rev)); } catch (_) { /* 本地已满 */ }
      this._pushBase = null;
      this._forceFullPush = true;
      this.persistLocal();
      return true;
    },

    /* 拉取云端 state:返回 'ok'(已拉取) / 'empty'(服务端明确无数据) / 'error'(网络或服务异常)。
       调用方仅在 'empty' 时才可新建空树;'error' 必须保留本地数据(离线账号/离线创作不可静默清空) */
    async pullState() {
      const token = this.getToken();
      if (!token) return 'error';
      this._pulling = true;
      try {
        const res = await this._fetchTimeout('/api/state', { headers: { 'Authorization': 'Bearer ' + token } }, 20000);
        if (res.status === 401) {
          // 八轮:401 统一走 U.authExpired(此前被当普通网络错误吞掉,假登录态反复重试)
          if (window.U && U.authExpired) U.authExpired();
          return 'error';
        }
        if (res.ok) {
          const j = await res.json();
          if (j.code === 0 && j.data) {
            this.rev = j.data.rev || 0;
            try { localStorage.setItem(REV_KEY, String(this.rev)); } catch (_) { /* 本地已满 */ }
            if (j.data.state) {
              this.state = j.data.state;
              const b = blank();
              for (const k in b) if (this.state[k] === undefined) this.state[k] = b[k];
              this.state.assets = Object.assign({ subjects: [], groups: [] }, this.state.assets); // 嵌套防御:旧 state 可能缺 assets.groups
              this.migrateInputHash(); // 云端拉回的旧 inputHash 同样原位升级 v3
              this.sweepStale(); // 云端树可能带着别端悬挂的 generating 镜头:拉取后立即清扫(七轮)
              try { this.persistLocal(); } catch (_) { /* 本地已满,以云端为准 */ }
              this._pushBase = this._snapshotBase(); // 以云端为基线,之后只推增量
              return 'ok';
            }
            return 'empty'; // 服务端 200 且明确无 state
          }
        }
      } catch (_) { /* 离线 */ }
      finally { this._pulling = false; }
      return 'error';
    },
    /* 登录后服务端无 state 时:为该用户建一棵新树并推送 */
    freshStateFor(user) {
      this.state = blank();
      // 对齐服务端 blankStateFor:注册赠送 100 积分 + 流水一条,避免 rev=0 空树推上去抹掉服务端积分
      this.state.users = [{ id: user.id, username: user.username, password: '', accountType: user.accountType, phone: user.phone || '', credits: 100, createdAt: user.createdAt || this.now() }];
      this.state.session = user.id;
      this.state.creditLogs = [{ id: this.uid('log'), userId: user.id, type: 'gain', amount: 100, balance: 100, reason: '新用户注册赠送', time: this.now() }];
      this.rev = 0;
      this.persistLocal();
      localStorage.setItem(REV_KEY, '0');
      this.scheduleSync();
    },

    /* ---- 认证 ---- */
    currentUser() { return this.state.users.find(u => u.id === this.state.session) || null; },
    register(username, password, accountType) {
      if (this.state.users.some(u => u.username === username)) return { ok: false, msg: '用户名已存在' };
      const u = { id: this.uid('u'), username, password, accountType, credits: 0, createdAt: this.now() };
      this.state.users.push(u);
      this.state.session = u.id;
      this.gain(100, '新用户注册赠送'); // gain 内含 save
      return { ok: true, user: u };
    },
    login(username, password) {
      const u = this.state.users.find(x => x.username === username && x.password === password);
      if (!u) return { ok: false, msg: '用户名或密码错误' };
      this.state.session = u.id;
      this.save();
      return { ok: true, user: u };
    },
    logout() {
      const t = this.getToken();
      if (t) fetch('/api/auth/logout', { method: 'POST', headers: { 'Authorization': 'Bearer ' + t } }).catch(() => { /* 离线忽略,服务端会话 7 天自过期 */ });
      this.state.session = null; this.clearToken(); this.save();
    },

    /* ---- 积分 ---- */
    credits() { const u = this.currentUser(); return u ? u.credits : 0; },
    logCredits(userId, type, amount, reason) {
      const u = this.state.users.find(x => x.id === userId);
      this.state.creditLogs.unshift({
        id: this.uid('log'), userId, type, amount,
        balance: u ? u.credits : 0, reason, time: this.now(),
      });
      // R17:本地流水截断(对齐服务端投影 500 条上限)——高频创作下 creditLogs 不再无限膨胀撑爆 413
      if (this.state.creditLogs.length > 500) this.state.creditLogs.length = 500;
    },
    // 扣积分，不足或非法数值返回 false(M8 修复:防御 NaN/非正积分)
    spend(n, reason) {
      const u = this.currentUser();
      if (!u) return false;
      if (!isFinite(n) || n <= 0) return false;
      if (u.credits < n) return false;
      u.credits -= n;
      this.logCredits(u.id, 'spend', n, reason);
      this.save();
      return true;
    },
    refund(n, reason) {
      const u = this.currentUser();
      if (!u) return;
      if (!isFinite(n) || n <= 0) return;
      u.credits += n;
      this.logCredits(u.id, 'refund', n, '创作失败自动返还：' + reason);
      this.save();
    },
    gain(n, reason) {
      const u = this.currentUser();
      if (!u) return;
      if (!isFinite(n) || n <= 0) return;
      u.credits += n;
      this.logCredits(u.id, 'gain', n, reason);
      this.save();
    },
    recharge(amountYuan, planName, channel, giftPct) {
      const u = this.currentUser();
      if (!u) return null;
      const base = Math.round(amountYuan * 10); // 1毛钱 = 1积分
      const gifted = Math.round(base * (giftPct || 0));
      const total = base + gifted;
      u.credits += total;
      const order = {
        id: this.uid('od'), userId: u.id,
        orderNo: 'MV' + Date.now() + Math.floor(Math.random() * 900 + 100),
        amountYuan, credits: base, gifted, planName, channel, time: this.now(),
      };
      this.state.orders.unshift(order);
      this.logCredits(u.id, 'recharge', total, `充值「${planName}」¥${amountYuan}${gifted ? '（含赠送' + gifted + '）' : ''}`);
      this.save();
      return order;
    },

    /* ---- 项目 ---- */
    /* 统一写分镜提示词:旧值 unshift 进 promptHistory(上限 20 条,空值/相同不记),再保存 */
    setShotPrompt(s, v) {
      v = String(v == null ? '' : v);
      if (s.prompt && s.prompt !== v) {
        s.promptHistory = s.promptHistory || [];
        s.promptHistory.unshift({ prompt: s.prompt, time: this.now() });
        if (s.promptHistory.length > 20) s.promptHistory.length = 20;
      }
      s.prompt = v;
      this.save();
    },
    myProjects() {
      const u = this.currentUser();
      return this.state.projects.filter(p => p.userId === (u && u.id));
    },
    getProject(id) { return this.state.projects.find(p => p.id === id) || null; },
    /* 按名称查找项目主体,支持多形态全称"角色名-形态名";命中返回 {s, form},否则 null。
     * 实现已下沉 domain.js(双端单一来源,含曾用名/别名兜底),此处仅委托保持签名不变 */
    findSubject(p, name) {
      return Domain.findSubject(p, name);
    },
    /* 主体改名领域命令(十三轮):旧名入 formerNames(兜底解析),级联更新镜头与镜头组的名称引用。
     * 此前 Agent 直接改 s.name,镜头 characters/scene/props 与镜头组 assets 键仍持旧名 →
     * findSubject 失联,丢参考图/形态/音色/素材版本检测。返回 {ok,msg} */
    renameSubject(p, sub, newName) {
      newName = String(newName || '').trim();
      if (!newName) return { ok: false, msg: '名称不能为空' };
      if (!sub || !p || !p.subjects || !p.subjects.includes(sub)) return { ok: false, msg: '主体不存在' };
      if (newName === sub.name) return { ok: true, msg: '' };
      if (p.subjects.some(x => x !== sub && x.name === newName)) return { ok: false, msg: `已有同名主体「${newName}」` };
      const old = sub.name;
      sub.formerNames = sub.formerNames || [];
      if (!sub.formerNames.includes(old)) sub.formerNames.push(old);
      if (sub.formerNames.length > 10) sub.formerNames.splice(0, sub.formerNames.length - 10); // 上限防膨胀
      sub.name = newName;
      /* 级联 1:镜头 characters/scene/props(含"名-形态"全称) */
      const mapRef = ref => {
        if (ref === old) return newName;
        if (ref && ref.startsWith(old + '-')) return newName + ref.slice(old.length);
        return ref;
      };
      (p.episodes || []).forEach(ep => {
        (ep.shots || []).forEach(s => {
          if (Array.isArray(s.characters)) s.characters = s.characters.map(mapRef);
          if (Array.isArray(s.props)) s.props = s.props.map(mapRef);
          if (s.scene != null) s.scene = mapRef(s.scene);
        });
        /* 级联 2:镜头组(存于分集)scene/chars/assets 键(assets 按出场名挂图) */
        (ep.groups || []).forEach(g => {
          if (g.scene === old) g.scene = newName;
          if (Array.isArray(g.chars)) g.chars = g.chars.map(mapRef);
          if (g.assets && typeof g.assets === 'object') {
            const na = {};
            Object.entries(g.assets).forEach(([k, v]) => { na[mapRef(k)] = v; });
            g.assets = na;
          }
          /* 签名同步重算(规则同 shotgroups.js sigOf):改名后自动分组仍能命中旧组,不新建同语义组留幽灵组 */
          g.sig = (g.scene || '未知场景') + '|' + (g.chars || []).slice().sort().join('、');
        });
      });
      this.save();
      return { ok: true, msg: `主体「${old}」已改名为「${newName}」,引用已级联更新` };
    },
    /* 主体(或形态)的展示图 */
    subjectImage(p, name) {
      const r = this.findSubject(p, name);
      if (!r) return '';
      return (r.form && r.form.image) || r.s.image || '';
    },

    /* ---- 素材版本(imgVer,改资产→引用联动):形象变更打点,已生成视频仅提示需重做 ---- */
    /* 主体/形态图片变更统一打点:imgVer 记当前时间戳并保存 */
    touchSubject(s) {
      if (!s) return;
      s.imgVer = Date.now();
      this.save();
    },
    /* 该镜引用主体(含形态,按主体计)的 imgVer 最大值;无引用或未打点则为 0(实现下沉 domain.js) */
    shotAssetVer(p, s) {
      return Domain.shotAssetVer(p, s);
    },
    /* 视频已生成,但生成后 引用素材更新过 或 提示词/台词等输入变化 → 建议重生成(不自动重做/不重扣费;实现下沉 domain.js) */
    shotVideoStale(p, s) {
      return Domain.shotVideoStale(p, s, _online());
    },
    /* 生成输入全量签名(2026-08 六轮 v3):实现下沉 domain.js——canonical 生成请求 Domain.buildVideoRequest
     * 与真实发送完全同一构造点,哈希与生成逻辑不再两处维护字段清单;CLI 经 require 复用同一实现 */
    buildGenerationSignature(p, s) {
      return Domain.buildGenerationSignature(p, s);
    },
    /* 镜头生成输入指纹(v3):buildGenerationSignature 的散列;存于 s.video.inputHash,输入变化即判过期 */
    shotInputHash(p, s) {
      return Domain.shotInputHash(p, s);
    },
    /* v1 指纹(旧算法,仅用于存量迁移比对:v1 相等说明输入未变,原位升级 v3,避免全量误报"素材已更新") */
    _shotInputHashV1(p, s) {
      return Domain.shotInputHashV1(p, s);
    },
    /* 存量 inputHash 迁移:与 v1 吻合(输入未变)则升级为 v3;不吻合则保留旧值(stale 提示本就正确) */
    migrateInputHash() {
      (this.state.projects || []).forEach(p => (p.episodes || []).forEach(ep => (ep.shots || []).forEach(s => {
        if (s.video && s.video.inputHash && !String(s.video.inputHash).startsWith('v3:')
          && s.video.inputHash === this._shotInputHashV1(p, s)) {
          s.video.inputHash = this.shotInputHash(p, s);
        }
        /* 二十二轮:无指纹的存量 done 镜回填基线(此前 inputHash 缺失恒不判过期——老项目改提示词/换参考图后
         * 旧片冒充新成果);以当前输入为基线(原生成输入不可考,不回溯误报),此后输入再变即正常判过期 */
        if (s.video && s.video.status === 'done' && !s.video.inputHash) {
          s.video.inputHash = this.shotInputHash(p, s);
          if (s.video.assetVer === undefined) s.video.assetVer = Domain.shotAssetVer(p, s);
        }
      })));
    },
    /* ---- 剧本→下游失效传播(十轮):剧本是理解/分镜/审片/成片的源头 ----
     * ep.contentRev 在每次正文被修改时递增;下游产物记录生成时的 contentRev(sourceRev),
     * 判旧函数据此提示"源剧本已变化,建议更新"。旧成果保留可用,但不再静默显示为"最新"。
     * 统一入口 updateEpisodeContent:分集正文编辑/AI 策划应用/整集改写/Agent 修改正文都走此函数 */
    updateEpisodeContent(ep, text, label) {
      if (!ep || ep.content === text) return false;
      ep.content = String(text == null ? '' : text);
      ep.contentRev = (ep.contentRev || 0) + 1;
      this.save();
      return true;
    },
    /* 本集理解是否对应当前剧本(十一轮判旧规则;实现下沉 domain.js) */
    understandingStale(ep) {
      return Domain.understandingStale(ep);
    },
    /* 分镜表是否拆自当前剧本与事件图谱(shotsSourceRev/shotsGraphRev 判旧;实现下沉 domain.js) */
    shotsStale(ep) {
      return Domain.shotsStale(ep);
    },
    /* 整集审片是否基于当前剧本与图谱(sourceRev/graphRev 判旧;实现下沉 domain.js) */
    reviewStaleByScript(ep) {
      return Domain.reviewStaleByScript(ep);
    },
    /* 成片是否基于当前剧本与图谱(composedSourceRev/composedGraphRev 判旧;实现下沉 domain.js) */
    composedStaleByScript(ep) {
      return Domain.composedStaleByScript(ep);
    },
    /* 视频就绪(真实):done 且非"离线模拟冒充"(实现下沉 domain.js,online 经 _online 传入) */
    shotVideoReady(s) {
      return Domain.shotVideoReady(s, _online());
    },
    /* 成片就绪(真实,八轮强化 + 剧本/图谱维度并入):
     * composed 且非离线模拟 且 合成输入指纹未变 且 剧本/图谱仍为合成时版本——
     * 技术上存在成片文件 ≠ 业务上仍是最新成片(原 composedStaleByScript 维度已并入 domain.js 实现);
     * 无指纹的旧成片一律判未就绪,无 rev 记录的旧数据保持原语义(迁移兼容) */
    epComposedReady(ep) {
      return Domain.epComposedReady(ep, _online());
    },
    /* canonical 合成快照(实现下沉 domain.js):sb-io.doCompose 与 composedInputHash 共用同一份序列 */
    composeSeqOf(ep) {
      return Domain.composeSeqOf(ep, _online());
    },
    /* 成片合成输入指纹(实现下沉 domain.js):与合成 items 完全同源;CLI 经 require 算出同一值 */
    composedInputHash(ep) {
      return Domain.composedInputHash(ep, _online());
    },
    /* 成片字幕文本/时长指纹(实现下沉 domain.js):合成时记录,改台词/旁白/时长 → 成片判未就绪(无记录的旧数据不比对) */
    composedDialogueSig(ep) {
      return Domain.composedDialogueSig(ep, _online());
    },
    /* 烧录字幕单条硬上限(取自 domain.js:合成截断口径与字幕质检判据同一常量) */
    SUB_BURN_MAX: Domain.SUB_BURN_MAX,
    /* 成片时间轴单段时长(实现下沉 domain.js):合成 items 与字幕时间轴共用同一口径 */
    segDurationOf(s, hasVideo) {
      return Domain.segDurationOf(s, hasVideo);
    },
    /* 成片字幕时间轴段(实现下沉 domain.js):SRT 产出与字幕质检共用同一份切段 */
    subtitleSegs(ep) {
      return Domain.subtitleSegs(ep, _online());
    },
    /* 节拍板出片就绪(真实):与 shotVideoReady 同语义的节拍段版本(实现下沉 domain.js) */
    beatVideoReady(b) {
      return Domain.beatVideoReady(b, _online());
    },
    /* 全项目符合"素材已更新"条件的已生成视频镜头数 */
    staleVideoCount(p) {
      let n = 0;
      ((p && p.episodes) || []).forEach(ep => (ep.shots || []).forEach(s => { if (this.shotVideoStale(p, s)) n++; }));
      return n;
    },

    /* ---- 本地冲突备份(409 被云端覆盖前自动留档,回收站页可恢复/导出;保留最近 3 份) ---- */
    backupOnConflict() {
      try {
        const raw = localStorage.getItem(KEY);
        if (!raw) return;
        const BAK_KEY = 'mv_hujing_conflict_bak';
        const list = JSON.parse(localStorage.getItem(BAK_KEY) || '[]');
        list.unshift({ time: Date.now(), state: JSON.parse(raw) });
        localStorage.setItem(BAK_KEY, JSON.stringify(list.slice(0, 3)));
      } catch (_) { /* 配额满等异常忽略:备份失败不阻断拉取云端 */ }
    },
    conflictBackups() {
      try { return JSON.parse(localStorage.getItem('mv_hujing_conflict_bak') || '[]'); } catch (_) { return []; }
    },
    removeConflictBackup(i) {
      try {
        const list = this.conflictBackups();
        list.splice(i, 1);
        localStorage.setItem('mv_hujing_conflict_bak', JSON.stringify(list));
      } catch (_) {}
    },
    /* 恢复冲突备份到本机(云端账号:恢复后可先导出再决定;离线账号:直接生效) */
    restoreConflictBackup(i) {
      const list = this.conflictBackups();
      const bak = list[i];
      if (!bak) return false;
      this.state = bak.state;
      const b = blank();
      for (const k in b) if (this.state[k] === undefined) this.state[k] = b[k];
      this.flushNow();
      if (window.IDB) IDB.hydrate(this.state).catch(() => {}); // 备份取自本地落盘(可能含 idb: 标记),恢复后水合回原值
      return true;
    },

    /* ---- 资产库 ---- */
    myAssets() {
      const u = this.currentUser();
      return this.state.assets.subjects.filter(a => a.userId === (u && u.id));
    },
    myGroups() {
      const u = this.currentUser();
      return this.state.assets.groups.filter(g => g.userId === (u && u.id));
    },

    /* ---- 回收站(项目/资产软删除,保留 7 天) ---- */
    trashPut(kind, name, data) {
      this.state.trash = this.state.trash || [];
      this.state.trash.unshift({ id: this.uid('tr'), kind, name, data, deletedAt: Date.now() });
      this.save();
    },
    /* 还原:project 回 state.projects,asset 回 assets.subjects,episode 回所属项目的 episodes;
       id 冲突时换新 id 并标记 renamed;episode 所属项目已不存在时返回 null(无法恢复) */
    trashRestore(id) {
      const t = (this.state.trash || []).find(x => x.id === id);
      if (!t) return null;
      let renamed = false;
      if (t.kind === 'project') {
        if (this.state.projects.some(p => p.id === t.data.id)) { t.data.id = this.uid('p'); renamed = true; }
        this.state.projects.unshift(t.data);
      } else if (t.kind === 'episode') {
        const proj = this.state.projects.find(x => x.id === t.data.projectId);
        if (!proj) return null; // 所属项目已删除,分集无处安放
        proj.episodes = proj.episodes || [];
        if (proj.episodes.some(e => e.id === t.data.ep.id)) { t.data.ep.id = this.uid('ep'); renamed = true; }
        proj.episodes.push(t.data.ep);
        proj.episodes.sort((a, b) => (a.order || 0) - (b.order || 0));
      } else if (t.kind === 'asset') {
        if (this.state.assets.subjects.some(a => a.id === t.data.id)) { t.data.id = this.uid('as'); renamed = true; }
        this.state.assets.subjects.unshift(t.data);
      }
      this.state.trash = this.state.trash.filter(x => x.id !== id);
      this.save();
      // 八轮:恢复的快照可能带着 generating 状态的镜头/节拍(删除前在途),且全局 __jobsReconciled
      // 已为 true 不会再对账 → 重置标记并立即对账一次,恢复的在途任务重新接上(不悬挂、不漏恢复)
      const hasPending = (function scan(node) {
        if (!node || typeof node !== 'object') return false;
        if (Array.isArray(node)) return node.some(scan);
        if (node.status === 'generating') return true;
        return Object.keys(node).some(k => node[k] && typeof node[k] === 'object' && scan(node[k]));
      })(t.data);
      if (hasPending && window.Media && Media.reconcileJobs) {
        window.__jobsReconciled = false;
        try { Media.reconcileJobs(); } catch (_) { /* 会话未就绪:下次路由再试 */ }
      }
      return { kind: t.kind, name: t.name, renamed };
    },
    /* 回收站保留 7 天:清理 deletedAt 超过 7 天的条目(到期自动彻底清除) */
    trashPurge() {
      const TTL = 7 * 24 * 3600 * 1000; // 保留 7 天
      const now = Date.now();
      const list = this.state.trash || [];
      const kept = list.filter(t => now - (t.deletedAt || 0) < TTL);
      if (kept.length !== list.length) { this.state.trash = kept; this.save(); }
    },

    /* 断点闭环:页面刷新/关闭会中断所有异步链——启动时把悬挂的 running 任务与 generating
       镜头/节拍回退为失败。不自动退费(上游可能已成功,自动退费会双重得利);
       携带 upstreamId 的镜头保留恢复标记,再点「生成」时优先断点续查原上游任务 */
    sweepStale() {
      const now = Date.now();
      let dirty = false;
      (this.state.tasks || []).forEach(t => {
        if (t && t.status === 'running') {
          t.status = 'failed';
          t.reason = '页面刷新中断,请重试';
          t.finishedAt = now; t.durationMs = now - (t.startedAt || now);
          dirty = true;
        }
        // 十轮:background(上游仍在生成)刷新后标 failed——upstreamId 已落实体,重试/登录对账会续查恢复,
        // 不再永久挂后台态(与服务端任务中心对账收敛)
        if (t && t.status === 'background') {
          t.status = 'failed';
          t.reason = '页面刷新中断(上游任务可能仍在生成,重试可免费续查)';
          t.finishedAt = now; t.durationMs = now - (t.startedAt || now);
          dirty = true;
        }
      });
      (this.state.projects || []).forEach(p => (p.episodes || []).forEach(ep => {
        (ep.shots || []).forEach(s => {
          if (s.video && s.video.status === 'generating') {
            s.video = { status: 'failed', error: '页面刷新中断,可再点生成尝试恢复', model: s.video.model, upstreamId: s.video.upstreamId, resumable: !!s.video.upstreamId };
            dirty = true;
          }
        });
        (ep.beats || []).forEach(b => {
          if (b.video && b.video.status === 'generating') {
            b.video = { status: 'failed', error: '页面刷新中断,请重试', upstreamId: b.video.upstreamId, resumable: !!b.video.upstreamId };
            dirty = true;
          }
        });
      }));
      if (dirty) this.save();
    },
  };

  Store.load();
  window.Store = Store;
  /* 页面隐藏/卸载时冲刷防抖中的本地落盘,防最后 250ms 内的改动丢失 */
  window.addEventListener('pagehide', () => Store.flushNow());
  window.addEventListener('beforeunload', () => Store.flushNow());
  /* R18 跨标签页:他页改写本地 state(storage 事件不回报本页写入,天然区分内外)——
   * 本页干净(无未落盘修改且无在飞任务)则采纳他页版本并重渲,双标签页实时一致;
   * 本页脏/有在飞任务(异步链持有旧树引用,换树会孤儿化其写回)则不采纳,提示一次由用户抉择;
   * 云端账号另有 rev 乐观锁+三方合并兜底,此层主要兜离线双开互相覆盖 */
  window.addEventListener('storage', (e) => {
    if (!Store.state || e.key !== KEY) return;
    const busy = Store._dirty || (window.Tasks && Tasks.running && Tasks.running() > 0);
    if (busy) {
      const now = Date.now();
      if (!Store._xtabWarnedAt || now - Store._xtabWarnedAt > 60000) {
        Store._xtabWarnedAt = now;
        if (window.U) U.toast('检测到另一标签页修改了数据,本页有进行中的更改/任务,建议完成后刷新页面同步', 'info', 5000);
      }
      return;
    }
    Store.load(); // 重新解析(含 trashPurge/sweepStale 等加载期规整)
    const reroute = () => { if (window.__reroute) window.__reroute(); };
    if (window.IDB && IDB.hydrate) IDB.hydrate(Store.state).then(reroute).catch(reroute);
    else reroute();
  });
})();
