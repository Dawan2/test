/* ============ tasks.js 全局任务登记中心 + 任务监控页 ============ */
(function () {
  window.Views = window.Views || {};
  const MAX = 200;

  function list() {
    if (!Store.state.tasks) Store.state.tasks = [];
    return Store.state.tasks;
  }
  const notify = () => { try { window.dispatchEvent(new Event('tasks-changed')); } catch (_) {} };

  const Tasks = {
    /** 登记一个任务:返回 task 对象(调用方持有,结束时 done/fail) */
    start({ type, model, target, projectId, episodeId, shotId, cost, download }) {
      const u = Store.currentUser();
      const t = {
        id: Store.uid('tk'), type, model: model || '本地', target: target || '',
        name: `${type}-${model || '本地'}-${target || ''}`,
        status: 'running', reason: '', cost: cost || 0,
        startedAt: Date.now(), finishedAt: 0, durationMs: 0,
        projectId: projectId || null, episodeId: episodeId || null, shotId: shotId || null,
        creator: u ? u.username : '-', download: download || null,
      };
      const arr = list();
      arr.unshift(t);
      if (arr.length > MAX) arr.length = MAX; // 裁剪最早的
      Store.save();
      notify();
      return t;
    },
    _fin(t, status, reason) {
      t.status = status;
      t.finishedAt = Date.now();
      t.durationMs = t.finishedAt - t.startedAt;
      if (reason) t.reason = reason;
      Store.save();
      notify();
    },
    done(t, download) {
      if (!t) return;
      if (download) t.download = download;
      this._fin(t, 'done');
    },
    fail(t, reason) {
      if (!t) return;
      this._fin(t, 'failed', reason || '未知原因');
    },
    /* 十轮:后台态——前端等待结束(如视频 10 分钟超时)但上游任务仍在运行。
     * 语义:不计入"运行中"侧栏徽标的等待数,但计入删除/覆盖拦截(在飞)——
     * 后台任务完成后仍要往实体落片,实体被删会变孤儿;刷新后由 sweepStale 收敛为 failed
     * (服务端任务中心对账会给出终态),窗口期内拦截保护。 */
    background(t, reason) {
      if (!t) return;
      this._fin(t, 'background', reason || '上游仍在生成,可续查');
    },
    running() { return list().filter(t => t.status === 'running').length; },
    /** 服务端任务快照(十二轮):canDeleteScope/Media.reconcileJobs 每次拉取 /api/jobs 时刷新,
     * 供同步路径(runningInScope → Agent ops 应用器等无法 await 的删除点)共享远端在飞判定;
     * 快照 2 分钟内有效——UI 异步守卫仍是权威,缓存只是同步路径的保守补充 */
    _remoteJobs: [], _remoteJobsAt: 0,
    _cacheRemoteJobs(list) { this._remoteJobs = Array.isArray(list) ? list : []; this._remoteJobsAt = Date.now(); },
    _freshRemoteJobs() {
      if (Date.now() - this._remoteJobsAt > 120 * 1000) return [];
      return this._remoteJobs.filter(j => j.status === 'running' || j.status === 'needs_reconcile');
    },
    /** 按作用域查在飞任务(八轮;十轮补 background;十二轮补远端快照):删除项目/分集/分镜、覆盖导入、
     * 重新拆分前的统一拦截。running(前端等待中)与 background(前端已放弃等待但上游仍在跑)都算在飞;
     * 十二轮:近 2 分钟内的服务端任务快照(running/needs_reconcile)同样计入——Agent ops 应用器是
     * 同步路径无法 await canDeleteScope,靠快照兜住"刷新后本地已 failed 但服务端仍在生成"的删除。
     * scope 任一维度命中即算;返回在飞任务数组(空数组=可安全删除),调用方据此弹提示阻断 */
    runningInScope({ projectId, episodeId, shotId } = {}) {
      const local = list().filter(t => {
        if (t.status !== 'running' && t.status !== 'background') return false;
        if (projectId != null && t.projectId === projectId) return true;
        if (episodeId != null && t.episodeId === episodeId) return true;
        if (shotId != null && t.shotId === shotId) return true;
        return false;
      });
      const remote = this._freshRemoteJobs().filter(j => {
        if (projectId != null && j.projectId === projectId) return true;
        if (episodeId != null && j.episodeId === episodeId) return true;
        if (shotId != null && j.shotId === shotId) return true;
        return false;
      }).map(j => ({ type: '服务端生成:' + (j.status === 'needs_reconcile' ? '待对账' : '进行中'), _remote: true }));
      return local.concat(remote);
    },
    /** 异步领域守卫(十一轮;十二轮收紧):本地在飞任务 + 服务端任务中心 running/needs_reconcile
     * jobs 合并判定。刷新后本地 background 已被 sweepStale 收敛为 failed,但服务端 job 可能仍在
     * 生成——此前删除入口只查本地列表,刷新一次即可删掉仍有上游任务在跑的实体(孤儿上游成本)。
     * 返回 {local, remote}:local=本地任务数组,remote=服务端匹配 job 数(带 type 标注);
     * 两者皆空才可安全删除。十二轮:已登录后端但 /api/jobs 查询失败 → remote=null(调用方须阻断,
     * 后端临时断线时不再放行删除在途实体);未登录后端(离线)本就无服务端任务,照常只看本地。 */
    async canDeleteScope({ projectId, episodeId, shotId } = {}) {
      const local = this.runningInScope({ projectId, episodeId, shotId });
      let remote = [];
      if (window.Media && Media.isReady() && Media._req) {
        try {
          const jobs = ((await Media._req('/api/jobs', null, 15000)) || {}).list || [];
          this._cacheRemoteJobs(jobs); // 十二轮:刷新同步路径共享的远端快照
          remote = jobs.filter(j => {
            if (j.status !== 'running' && j.status !== 'needs_reconcile') return false;
            if (projectId != null && j.projectId === projectId) return true;
            if (episodeId != null && j.episodeId === episodeId) return true;
            if (shotId != null && j.shotId === shotId) return true;
            return false;
          });
        } catch (_) { return { local, remote: null, unreachable: true }; } // 查询失败:保守拒绝(调用方按 remote==null 阻断)
      }
      return { local, remote };
    },
    /** 任务生命周期五件套封装(C 批收敛):登记 → (cost>0 时)扣费 → work(tk) → done/fail
     * 扣费失败:Tasks.fail('积分不足') 返回 null;work 抛错:退费+刷新侧栏+fail,按约定返回 null;
     * 成功:work 返回值(对象)作为下载物优先于 opts.download,返回 work 的结果。
     * err.__pending(十轮):上游仍在后台生成——任务转 background 态(计入删除拦截),不退费不标失败 */
    async run({ type, model, target, cost, actionName, projectId, episodeId, shotId, download }, work) {
      const tk = this.start({ type, model, target, cost, projectId, episodeId, shotId, download });
      if (cost > 0 && !U.charge(cost, actionName || type)) { this.fail(tk, '积分不足'); return null; }
      try {
        const out = await work(tk);
        this.done(tk, (out && typeof out === 'object') ? out : download);
        return out === undefined ? null : out;
      } catch (err) {
        // err.__opId:资源层(media.js)失败时附带的计费操作键 → 镜像退费关联同一 operation(服务端按原账单退);
        // err.__noRefund(九轮):任务仍在后台生成等场景,失败语义下不退本地镜像(服务端终态兜底)
        // R15:opId 落任务——任务中心「领取结果」按此找回服务端已交付但前端未收到的结果
        if (err && err.__opId) tk.opId = err.__opId;
        if (cost > 0 && !(err && err.__noRefund)) U.refund(cost, actionName || type, err && err.__opId);
        if (err && err.__pending) this.background(tk, '上游仍在生成,稍后重试可免费续查结果');
        else this.fail(tk, (err && err.message) || '未知原因');
        return null;
      }
    },
    /** 批量五件套(P2 收敛):逐条 登记→扣费→执行→失败退费,替代各处手写的"整批预扣+逐镜退费"。
     * 逐条扣费:余额不足仅该条失败(不阻断其余),批量中断不搁浅未执行条目的积分;
     * worker 抛错=该条失败并退该条费用(err.refundReason 可覆盖退费事由,保持账本逐镜可读);
     * err.stopBatch=true 时终止剩余条目(剩余条目不扣费,标"已取消");
     * opts: 单条任务字段(type/cost=单条/actionName/...),或传函数 optsOf(item,i) 返回逐条覆盖(target/model/shotId 等);
     * worker(item, tk) 返回对象=该条下载物(同 run 契约);onEach(item, ok, out|err, tk, i) 逐条回调(更新 dock 行/即时渲染);
     * 返回 {ok, fail, cancelled, results}(results 与 items 对齐,失败/取消位 null) */
    async runBatch(opts, items, worker, onEach) {
      const base = typeof opts === 'function' ? {} : (opts || {});
      const optsOf = typeof opts === 'function' ? opts : base.optsOf;
      const arr = Array.isArray(items) ? items : [];
      const sum = { ok: 0, fail: 0, cancelled: 0, results: [] };
      const cancelledErr = () => { const e = new Error('已取消'); e.cancelled = true; return e; };
      for (let i = 0; i < arr.length; i++) {
        const item = arr[i];
        const o = Object.assign({}, base, optsOf ? optsOf(item, i) : null);
        const tk = this.start(o);
        if ((o.cost || 0) > 0 && !U.charge(o.cost, o.actionName || o.type)) {
          this.fail(tk, '积分不足');
          sum.fail++; sum.results.push(null);
          if (onEach) onEach(item, false, new Error('积分不足'), tk, i);
          continue;
        }
        try {
          const out = await worker(item, tk);
          this.done(tk, (out && typeof out === 'object') ? out : o.download);
          sum.ok++; sum.results.push(out === undefined ? null : out);
          if (onEach) onEach(item, true, out, tk, i);
        } catch (err) {
          if (err && err.__opId) tk.opId = err.__opId; // R15:结果认领键(同 run)
          if ((o.cost || 0) > 0 && !(err && err.__noRefund)) U.refund(o.cost, (err && err.refundReason) || o.actionName || o.type, err && err.__opId);
          this.fail(tk, (err && err.message) || '未知原因');
          sum.fail++; sum.results.push(null);
          if (onEach) onEach(item, false, err, tk, i);
          if (err && err.stopBatch) { // 剩余条目整体终止:不扣费不登记,逐条回调标"已取消"
            for (let j = i + 1; j < arr.length; j++) {
              sum.cancelled++; sum.results.push(null);
              if (onEach) onEach(arr[j], false, cancelledErr(), null, j);
            }
            break;
          }
        }
      }
      return sum;
    },
    /** 部分退费(P2 收敛):聚合任务(整集审片等)按未交付条数退费,并核减任务登记成本——
     * 任务页"今日消耗"只计已交付部分,取消/部分失败不再虚增;返回退费积分数 */
    partialRefund(tk, n, per, reason, opId) {
      if (!tk || !(n > 0) || !(per > 0)) return 0;
      const amt = Math.round(per * n);
      U.refund(amt, reason || (tk.type + '·部分退费×' + n), opId); // 八轮:opId 关联服务端原 operation(镜像幂等,无对应扣费时服务端自然 0)
      tk.cost = Math.max(0, (tk.cost || 0) - amt);
      Store.save();
      return amt;
    },
  };
  window.Tasks = Tasks;

  /* ================= 结果领取(R15) =================
   * 失败任务的断点闭环:同步生成端点(TTS/FFmpeg)客户端超时/断线时,服务端可能已交付(结果保留 7 天)。
   * 任务中心「⇩ 领取」按 opId(单键 t.opId||t.id;批量内层键 t.opIds)查询服务端结果日志,
   * 命中可打开/下载;镜头归属明确的类型(生成音频/合成音视频)可一键应用回分镜。
   * 账目无需手工处理:服务端已交付的 operation 拒绝退款(403),refundMirror 已按服务端余额回写本地。 */
  function claimableIds(t) {
    if (Array.isArray(t.opIds) && t.opIds.length) return t.opIds;
    return [{ opId: t.opId || t.id, shotId: t.shotId, label: '' }];
  }
  function canApply(t, f) {
    if (!f.rec.payload || !f.rec.payload.url) return false;
    if (t.type !== '生成音频' && t.type !== '合成音视频') return false;
    return !!(f.shotId || t.shotId) && !!t.episodeId && !!t.projectId;
  }
  function applyRecovered(t, f) {
    const shotId = f.shotId || t.shotId;
    const p = Store.state.projects.find(x => x.id === t.projectId);
    const ep = p && (p.episodes || []).find(e => e.id === t.episodeId);
    const s = ep && (ep.shots || []).find(x => x.id === shotId);
    if (!s) { U.toast('找不到对应分镜(可能已删除),请改用下载手动处理', 'error', 3000); return false; }
    const url = f.rec.payload.url;
    if (t.type === '生成音频') {
      s.audio = true; s.audioUrl = url;
      s.history = s.history || [];
      s.history.unshift({ type: '音频', model: '任务中心领取', time: Store.now() });
    } else if (t.type === '合成音视频') {
      s.merged = true; s.mergedUrl = url;
    } else return false;
    t.reason = (t.reason || '').replace(/\(结果已领取并应用\)/g, '') + '(结果已领取并应用)';
    Store.save();
    U.toast('已应用到镜头' + (s.order + 1), 'success');
    return true;
  }
  async function claimResult(t) {
    if (!t) return;
    if (!window.Media || !Media.isReady()) return U.toast('未登录后端,无法领取服务端结果', 'error', 2500);
    const ids = claimableIds(t);
    U.toast('正在向服务端查询可领取结果…', 'info', 1200);
    const found = [];
    for (const it of ids) {
      if (!it.opId) continue;
      const rec = await Media.recoverResult(it.opId);
      if (rec) found.push({ rec, shotId: it.shotId || null, label: it.label || '' });
    }
    if (!found.length) return U.toast('服务端没有该任务的可领取结果(未交付或已过 7 天保留期)', 'info', 3000);
    U.openModal({
      title: `领取结果(${found.length} 条)`,
      body: `<p class="small muted" style="margin-bottom:10px;line-height:1.8">该任务前端判定失败/超时,但服务端已完成交付(积分已按交付计费)。结果可直接打开/下载;配音与合成类结果可一键应用回对应分镜。</p>` +
        found.map((f, i) => `
        <div class="card" style="padding:10px 12px;margin-bottom:8px">
          <div class="row wrap" style="justify-content:space-between;gap:8px">
            <div class="small"><b>${U.esc(f.label || f.rec.action || '结果')}</b> <span class="muted">${U.esc(f.rec.endpoint || '')} · ${new Date(f.rec.savedAt).toLocaleString('zh-CN', { hour12: false })}</span></div>
            <div class="row" style="gap:6px">
              <a class="btn sm" href="${U.esc(f.rec.payload.url || '#')}" target="_blank" rel="noopener">打开</a>
              <a class="btn sm" href="${U.esc(f.rec.payload.url || '#')}" download>下载</a>
              ${canApply(t, f) ? `<button class="btn sm primary" data-apply="${i}">应用到镜头</button>` : ''}
            </div>
          </div>
        </div>`).join(''),
      onMount(m) {
        m.querySelectorAll('[data-apply]').forEach(btn => btn.onclick = () => {
          const f = found[+btn.dataset.apply];
          if (applyRecovered(t, f)) { btn.disabled = true; btn.textContent = '✓ 已应用'; }
        });
      },
    });
  }

  /* ================= 任务监控页 ================= */
  const fmtDur = ms => {
    if (!ms) return '—';
    const s = Math.round(ms / 1000);
    if (s < 60) return s + '秒';
    if (s < 3600) return Math.floor(s / 60) + '分' + String(s % 60).padStart(2, '0') + '秒';
    return Math.floor(s / 3600) + '时' + String(Math.floor((s % 3600) / 60)).padStart(2, '0') + '分';
  };
  const fmtTime = ts => new Date(ts).toLocaleString('zh-CN', { hour12: false, month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
  const dayStart = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d.getTime(); };
  const RANGES = [['all', '全部时间'], ['today', '今天'], ['7d', '最近7天'], ['30d', '最近30天']];

  Views.tasks = function (main, embedded) {
    // embedded=true 时作为「数据看板」二级页嵌入:隐藏自身页头标题,保留状态徽标行
    clearTimeout(window.__tasksTimer);
    if (!main.isConnected) return;
    const u = Store.currentUser();
    let fProject = '', fType = '', fStatus = '', fRange = '7d', page = 1;
    const PER = 20;

    function filtered() {
      const arr = list();
      const now = Date.now();
      return arr.filter(t => {
        if (fProject && t.projectId !== fProject) return false;
        if (fType && t.type !== fType) return false;
        if (fStatus && statusOf(t) !== fStatus) return false;
        if (fRange === 'today' && t.startedAt < dayStart()) return false;
        if (fRange === '7d' && t.startedAt < now - 7 * 86400000) return false;
        if (fRange === '30d' && t.startedAt < now - 30 * 86400000) return false;
        return true;
      });
    }
    // background 归入"进行中"筛选(同一等待语义的不同阶段)
    function statusOf(t) { return t.status === 'background' ? 'running' : t.status; }

    function render() {
      clearTimeout(window.__tasksTimer);
      const all = list();
      const types = [...new Set(all.map(t => t.type))];
      const projects = Store.state.projects.filter(p => p.userId === u.id);
      const rows = filtered();
      const pages = Math.max(1, Math.ceil(rows.length / PER));
      page = Math.min(page, pages);
      const shown = rows.slice((page - 1) * PER, page * PER);
      const running = all.filter(t => t.status === 'running').length;
      const bg = all.filter(t => t.status === 'background').length;
      const todayDone = all.filter(t => t.status === 'done' && t.finishedAt >= dayStart()).length;
      const todayCost = all.reduce((a, t) => a + (t.status === 'done' && t.startedAt >= dayStart() ? (t.cost || 0) : 0), 0); // 只计成功:失败任务已退费,口径与积分余额一致
      const failed = all.filter(t => t.status === 'failed' && t.finishedAt >= dayStart()).length;

      main.innerHTML = `
      <div class="page"${embedded ? ' style="padding:0;max-width:none"' : ''}>
        <div class="page-head">
          ${embedded ? `<div></div>` : `<div>
            <div class="page-title">任务监控</div>
            <div class="page-sub">所有 AI 生成任务的实时状态与耗时 · 共 ${all.length} 条记录</div>
          </div>`}
          <div class="row wrap" style="gap:14px">
            <span class="tag ${running ? 'cyan' : ''}">${running ? '<span class="spinner" style="width:10px;height:10px"></span> ' : ''}进行中 ${running}</span>
            ${bg ? `<span class="tag yellow" title="前端已停止等待,上游仍在生成(可续查)">后台生成 ${bg}</span>` : ''}
            <span class="tag green">今日完成 ${todayDone}</span>
            <span class="tag yellow">今日消耗 ${todayCost} 积分</span>
            <span class="tag red">失败 ${failed}</span>
          </div>
        </div>
        <div class="card" style="margin-bottom:14px;padding:10px 14px">
          <div class="row wrap" style="gap:8px">
            <select class="select small" data-f="project" style="width:auto"><option value="">全部项目</option>${projects.map(p => `<option value="${p.id}" ${fProject === p.id ? 'selected' : ''}>${U.esc(p.name)}</option>`).join('')}</select>
            <select class="select small" data-f="type" style="width:auto"><option value="">所有类型</option>${types.map(t => `<option ${fType === t ? 'selected' : ''}>${U.esc(t)}</option>`).join('')}</select>
            <select class="select small" data-f="status" style="width:auto"><option value="">所有状态</option><option value="running" ${fStatus === 'running' ? 'selected' : ''}>进行中</option><option value="done" ${fStatus === 'done' ? 'selected' : ''}>已完成</option><option value="failed" ${fStatus === 'failed' ? 'selected' : ''}>失败</option></select>
            <select class="select small" data-f="range" style="width:auto">${RANGES.map(([v, n]) => `<option value="${v}" ${fRange === v ? 'selected' : ''}>${n}</option>`).join('')}</select>
            <button class="btn sm" data-x="clear">清除筛选</button>
            <button class="btn sm primary" data-x="refresh">↻ 刷新</button>
          </div>
        </div>
        ${!shown.length ? `<div class="empty"><div class="ico">📋</div><p>${all.length ? '没有匹配筛选条件的任务' : '暂无任务,去创作吧'}</p></div>` : `
        <div class="card" style="padding:0;overflow:hidden">
        <table class="tbl">
          <thead><tr><th>任务</th><th>状态</th><th>失败原因</th><th>消耗</th><th>实际耗时</th><th>所属项目·分集</th><th>创建者</th><th>创建时间</th><th>操作</th></tr></thead>
          <tbody>
            ${shown.map(t => `
            <tr>
              <td class="small"><b>${U.esc(t.name)}</b></td>
              <td>${t.status === 'done' ? '<span class="tag green">已完成</span>'
          : t.status === 'running' ? '<span class="tag cyan"><span class="spinner" style="width:9px;height:9px"></span> 进行中</span>'
            : t.status === 'background' ? '<span class="tag yellow" title="前端已停止等待,上游任务仍在生成;重试可免费续查结果">⏳ 后台生成中</span>'
              : '<span class="tag red">失败</span>'}</td>
              <td class="small" style="max-width:140px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${U.esc(t.reason || '')}">${U.esc(t.reason || '—')}</td>
              <td class="small">${t.cost ? t.cost + ' 积分' : '—'}</td>
              <td class="small">${t.status === 'running' || t.status === 'background' ? fmtDur(Date.now() - t.startedAt) : fmtDur(t.durationMs)}</td>
              <td class="small muted">${projLabel(t)}</td>
              <td class="small muted">${U.esc(t.creator)}</td>
              <td class="small muted">${fmtTime(t.startedAt)}</td>
              <td><div class="row" style="gap:2px">
                <button class="btn ghost sm" title="查看" data-view="${t.id}">👁</button>
                ${t.status === 'failed' || t.status === 'background' ? `<button class="btn ghost sm" title="重试:失败≠白做,先看状态再重试(后台任务重试=免费续查)" data-retry="${t.id}">↻</button>` : ''}
                ${t.status === 'failed' ? `<button class="btn ghost sm" title="领取结果:前端超时/断线但服务端可能已交付,点此按计费键找回结果" data-claim="${t.id}">⇩</button>` : ''}
                ${t.download ? `<button class="btn ghost sm" title="下载" data-dl="${t.id}">⬇</button>` : ''}
              </div></td>
            </tr>`).join('')}
          </tbody>
        </table></div>
        <div class="row" style="justify-content:center;margin-top:16px;gap:14px">
          <span class="small muted">共 ${rows.length} 条</span>
          <span class="tag">20条/页</span>
          <button class="btn sm" data-x="prev" ${page <= 1 ? 'disabled' : ''}>‹</button>
          <span class="tag cyan">${page}</span>
          <button class="btn sm" data-x="next" ${page >= pages ? 'disabled' : ''}>›</button>
        </div>`}
      </div>`;

      main.querySelector('[data-f=project]').onchange = e => { fProject = e.target.value; page = 1; render(); };
      main.querySelector('[data-f=type]').onchange = e => { fType = e.target.value; page = 1; render(); };
      main.querySelector('[data-f=status]').onchange = e => { fStatus = e.target.value; page = 1; render(); };
      main.querySelector('[data-f=range]').onchange = e => { fRange = e.target.value; page = 1; render(); };
      main.querySelector('[data-x=clear]').onclick = () => { fProject = fType = fStatus = ''; fRange = '7d'; page = 1; render(); };
      main.querySelector('[data-x=refresh]').onclick = () => { render(); U.toast('已刷新', 'info', 900); };
      const pv = main.querySelector('[data-x=prev]'); if (pv) pv.onclick = () => { page--; render(); };
      const nx = main.querySelector('[data-x=next]'); if (nx) nx.onclick = () => { page++; render(); };
      main.querySelectorAll('[data-view]').forEach(b => b.onclick = () => jumpTo(list().find(t => t.id === b.dataset.view)));
      // 失败任务领取服务端已交付结果(R15)
      main.querySelectorAll('[data-claim]').forEach(b => b.onclick = () => claimResult(list().find(t => t.id === b.dataset.claim)));
      // 失败任务重试:分镜级任务直接重跑,其余跳转对应页面
      main.querySelectorAll('[data-retry]').forEach(b => b.onclick = () => {
        const t = list().find(x => x.id === b.dataset.retry);
        if (!t) return;
        if (window.__retryShotTask && window.__retryShotTask(t)) { U.toast('已重新发起任务', 'success'); return; }
        U.toast('该类型任务请在对应页面重新发起,已为你跳转', 'info', 3000);
        jumpTo(t);
      });
      main.querySelectorAll('[data-dl]').forEach(b => b.onclick = () => {
        const t = list().find(x => x.id === b.dataset.dl);
        if (!t || !t.download) return;
        if (t.download.regenType) { Exporter.redownload(t); return; } // 大文件不存 state,重新生成
        if (t.download.dataURL) U.downloadDataURL(t.download.filename, t.download.dataURL);
        else U.downloadText(t.download.filename, t.download.text || '');
        U.toast('已开始下载', 'success');
      });

      // 有进行中任务时每 3s 自动刷新
      if (running) window.__tasksTimer = setTimeout(() => { if (main.isConnected) render(); }, 3000);
    }

    function projLabel(t) {
      const p = Store.state.projects.find(x => x.id === t.projectId);
      if (!p) return t.type.includes('工具') || t.type.includes('音效') ? '便捷工具' : '—';
      const ep = (p.episodes || []).find(e => e.id === t.episodeId);
      return U.esc(p.name) + (ep ? ' · ' + U.esc(ep.title) : '');
    }

    function jumpTo(t) {
      if (!t) return;
      if (t.shotId && t.episodeId && t.projectId) { location.hash = `#/project/${t.projectId}/episode/${t.episodeId}`; return; }
      if (t.episodeId && t.projectId) { location.hash = `#/project/${t.projectId}/episode/${t.episodeId}`; return; }
      if (t.projectId && ['文生图(主体图)', '剧本解析', '主体提取'].some(x => t.type.includes(x))) { location.hash = '#/project/' + t.projectId + '/roles'; return; }
      if (t.projectId) { location.hash = '#/project/' + t.projectId; return; }
      location.hash = '#/tools';
    }

    render();
  };
})();
