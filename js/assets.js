/* ============ assets.js 资产库 ============ */
(function () {
  window.Views = window.Views || {};
  const KIND_NAME = { character: '角色', scene: '场景', prop: '道具', keyframe: '关键帧' }; // 与主体页命名对齐

  /* ---------- 官方资产库(任务4:平台版权素材) ----------
   * 仅限平台内调用,禁止下载导出;不占用户存储、不进回收站。缩略图为内联 SVG data URI,零外部依赖。 */
  const OFFICIAL_ASSETS = [
    { id: 'of-c1', kind: 'character', name: '玄衣剑客', prompt: '玄衣古装剑客,负手立于檐角,墨色衣袂翻飞,冷峻侧脸,武侠风', tags: ['主角', '武侠'], official: true, pal: ['#1e293b', '#6366f1'] },
    { id: 'of-c2', kind: 'character', name: '民国女记者', prompt: '民国短发女记者,呢子大衣配围巾,手持相机,眼神坚毅,复古胶片色调', tags: ['主角', '民国'], official: true, pal: ['#57534e', '#d6d3d1'] },
    { id: 'of-c3', kind: 'character', name: '机甲少女', prompt: '银发机甲少女,蓝白涂装外骨骼,悬浮于霓虹都市夜空,科幻赛博风', tags: ['主角', '科幻'], official: true, pal: ['#0f172a', '#22d3ee'] },
    { id: 'of-s1', kind: 'scene', name: '云海仙山', prompt: '云海之上的仙山群峰,古松悬空亭阁,晨雾缭绕,国风水墨意境', tags: ['核心场景', '仙侠'], official: true, pal: ['#134e4a', '#99f6e4'] },
    { id: 'of-s2', kind: 'scene', name: '深夜霓虹街', prompt: '雨后深夜霓虹小街,积水倒映粉紫光斑,蒸汽波氛围', tags: ['核心场景', '都市'], official: true, pal: ['#2e1065', '#f472b6'] },
    { id: 'of-s3', kind: 'scene', name: '末日废土', prompt: '末日废土城市残骸,断裂高架与枯黄尘雾,夕阳余晖,苍凉史诗感', tags: ['核心场景', '废土'], official: true, pal: ['#431407', '#fbbf24'] },
    { id: 'of-p1', kind: 'prop', name: '青铜古剑', prompt: '饕餮纹青铜古剑,剑身泛幽绿铜锈,剑柄缠褪色红绳,文物特写质感', tags: ['关键道具', '古风'], official: true, pal: ['#14532d', '#4ade80'] },
    { id: 'of-p2', kind: 'prop', name: '黄铜怀表', prompt: '雕花黄铜怀表,表盖半开,指针停在午夜,复古暖光特写', tags: ['关键道具', '复古'], official: true, pal: ['#78350f', '#fcd34d'] },
    { id: 'of-p3', kind: 'prop', name: '符咒纸鸢', prompt: '贴满朱红符咒的纸鸢,夜空中拖出微光长尾,民俗志怪风', tags: ['关键道具', '志怪'], official: true, pal: ['#7f1d1d', '#fca5a5'] },
  ];
  /* 官方资产缩略图:按类别给渐变配色+简笔元素,人物=剪影、场景=山/日、道具=物件轮廓 */
  const OF_EL = {
    character: '<circle cx="40" cy="16" r="8" fill="#eef2ff"/><path d="M22 48 Q22 28 40 28 Q58 28 58 48 Z" fill="#eef2ff"/>',
    scene: '<path d="M0 41 L18 20 L32 34 L47 13 L80 43 L80 48 L0 48 Z" fill="rgba(0,0,0,.28)"/><circle cx="63" cy="11" r="6" fill="#fde68a"/>',
    prop: '<path d="M40 8 L52 20 L46 40 L34 40 L28 20 Z" fill="none" stroke="#fff" stroke-width="2.4"/><circle cx="40" cy="24" r="4" fill="#fff"/>',
  };
  function officialThumb(a) {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="80" height="48" viewBox="0 0 80 48"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${a.pal[0]}"/><stop offset="1" stop-color="${a.pal[1]}"/></linearGradient></defs><rect width="80" height="48" fill="url(#g)"/>${OF_EL[a.kind] || OF_EL.prop}</svg>`;
    return 'data:image/svg+xml,' + encodeURIComponent(svg);
  }

  /* ---------- 队友共享给我的资产(团队↔资产贯通) ----------
   * 数据在服务端按 teams.json 队友关系 + 属主 state 共享声明跨账号聚合(GET /api/assets/shared);
   * 本地缓存 + 渲染时异步刷新(15s 节流),离线/后端不可达时保持现有缓存 */
  const __sharedMine = { list: [], at: 0, loading: false };
  async function refreshSharedMine(rerender) {
    if (!Store.getToken() || __sharedMine.loading) return;
    if (Date.now() - __sharedMine.at < 15000) return;
    __sharedMine.loading = true;
    try {
      const res = await fetch('/api/assets/shared', { headers: { Authorization: 'Bearer ' + Store.getToken() } });
      const j = await res.json().catch(() => null);
      if (j && j.code === 0 && j.data && Array.isArray(j.data.list)) {
        __sharedMine.list = j.data.list;
        __sharedMine.at = Date.now();
        if (rerender) { try { rerender(); } catch (_) { } } // 首渲先用旧缓存,拉到后重渲
      }
    } catch (_) { /* 离线/网络抖动:保持现有缓存 */ }
    finally { __sharedMine.loading = false; }
  }

  /* ---------- 从项目保存主体到资产库(供 roles.js 调用) ---------- */
  window.saveSubjectToAssets = function (p, sid, done) {
    const s = p.subjects.find(x => x.id === sid);
    if (!s) return;
    const groups = Store.myGroups();
    U.openModal({
      title: '保存主体到资产库 · ' + s.name,
      body: `
      <label class="field"><span>选择标签</span>
        <div class="model-row">
          ${['主角', '配角', '反派', '核心场景', '关键道具'].map((t, i) => `<div class="model-opt ${i === 0 ? 'sel' : ''}" data-tag="${t}">${t}</div>`).join('')}
        </div>
      </label>
      <label class="field"><span>选择分组</span>
        <select class="select" data-f="group">
          <option value="">未分组</option>
          ${groups.map(g => `<option value="${g.id}">${U.esc(g.name)}</option>`).join('')}
        </select>
        <div class="hint">没有合适分组?可先在资产库「新建分组」。</div>
      </label>`,
      footer: `<button class="btn" data-x="cancel">取消</button><button class="btn primary" data-x="ok">保存主体</button>`,
      onMount(m, close) {
        let tag = '主角';
        m.querySelectorAll('[data-tag]').forEach(o => o.onclick = () => { tag = o.dataset.tag; m.querySelectorAll('[data-tag]').forEach(x => x.classList.toggle('sel', x === o)); });
        m.querySelector('[data-x=cancel]').onclick = close;
        m.querySelector('[data-x=ok]').onclick = () => {
          const u = Store.currentUser();
          const item = {
            id: Store.uid('as'), userId: u.id, kind: s.kind, name: s.name,
            image: s.image, prompt: s.prompt, tags: [tag],
            forms: (s.forms || []).map(f => ({ id: Store.uid('fm'), name: f.name, image: f.image || '', time: f.time || Store.now() })), // 形态随主体一并入资产库(重新发 id)
            groupId: m.querySelector('[data-f=group]').value || null,
            fromProject: p.name, time: Store.now(),
          };
          Store.state.assets.subjects.push(item);
          Store.save(); close();
          U.toast(`「${s.name}」已保存到资产库,已自动提交报白审核`, 'success');
          // 任务4:入库即报白——自动提交一次模拟审核(见 humanreview.js submitAsset,完结回写 item.review)
          if (window.HumanReview) HumanReview.submitAsset(item, done);
          else done && done();
        };
      },
    });
  };

  /* ---------- 资产库主页 ---------- */
  Views.assets = function (main) {
    let tab = 'all', filterGroup = '';
    // 文件资产 tab 状态(数据来自 GET /api/uploads)
    const filesState = { data: null, err: '', kind: 'all', favOnly: false };

    async function loadFiles() {
      filesState.err = '';
      const token = Store.getToken();
      if (!token) { filesState.data = null; filesState.err = '未连接服务端:启动 node server.js 并登录后,才能管理云端文件资产'; if (tab === 'files') render(); return; }
      try {
        const res = await fetch('/api/uploads', { headers: { 'Authorization': 'Bearer ' + token } });
        const j = await res.json();
        if (j.code === 0) filesState.data = j.data;
        else { filesState.data = null; filesState.err = j.message || '文件列表加载失败'; }
      } catch (_) { filesState.data = null; filesState.err = '服务端不可达,当前为离线模式'; }
      if (tab === 'files') render();
    }

    const FILE_KIND = name => {
      const ext = (name.split('.').pop() || '').toLowerCase();
      if (['png', 'jpg', 'jpeg', 'webp', 'gif'].includes(ext)) return 'image';
      if (['mp3', 'wav', 'm4a', 'ogg', 'aac'].includes(ext)) return 'audio';
      if (['mp4', 'webm', 'mov', 'mkv'].includes(ext)) return 'video';
      return 'other';
    };
    const KIND_LABEL = { image: '图片', audio: '音频', video: '视频', other: '其他' };
    const fmtSize = b => b > 1048576 ? (b / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(b / 1024)) + ' KB';
    const dlUrl = (url, name) => { const a = document.createElement('a'); a.href = url; a.download = name || ''; a.target = '_blank'; document.body.appendChild(a); a.click(); a.remove(); };


    function render() {
      const u = Store.currentUser();
      const all = Store.myAssets();
      const groups = Store.myGroups();
      const favs = Store.state.favorites.filter(f => f.userId === u.id);
      const mats = (Store.state.materials || []).filter(x => x.userId === u.id);
      const films = [];
      Store.myProjects().forEach(p => (p.episodes || []).forEach(ep => {
        if (Store.epComposedReady(ep)) films.push({ p, ep }); // 统一就绪判定:离线模拟合成在线时不算真实成片
      }));

      let list = all;
      if (tab !== 'all' && tab !== 'fav' && tab !== 'film' && tab !== 'official') list = all.filter(a => a.kind === tab);
      if (filterGroup) list = list.filter(a => a.groupId === filterGroup);
      /* 协作者共享视图(团队↔资产贯通):服务端按队友关系+共享声明跨账号拉取,
       * 仅 本地可用(local_available)/无 review 字段/存量 approved 的可见(pending/rejected 不下发,只读) */
      refreshSharedMine(render); // 异步刷新共享列表,拉到后重渲
      let sharedList = __sharedMine.list;
      if (tab !== 'all') sharedList = sharedList.filter(a => a.kind === tab);

      main.innerHTML = `
      <div class="page">
        <div class="page-head">
          <div>
            <div class="page-title">资产库</div>
            <div class="page-sub">统一管理全项目资产 · 共 ${all.length} 个资产主体</div>
          </div>
          <div class="row">
            <button class="btn" data-x="newgroup">📁 新建分组</button>
            <button class="btn primary" data-x="create">＋ 创建主体</button>
          </div>
        </div>
        <div class="tabs">
          ${[['all', '全部'], ['character', '角色'], ['scene', '场景'], ['prop', '道具'], ['keyframe', '关键帧'], ['official', `🏅 官方资产(${OFFICIAL_ASSETS.length})`], ['material', `🎵 素材库(${mats.length})`], ['files', '☁️ 文件资产'], ['reviews', `🧑 真人审核(${(Store.state.assetReviews || []).filter(r => r.userId === u.id).length})`], ['fav', `⭐ 我的收藏(${favs.length})`], ['film', `🎞 成片库(${films.length})`]].map(([k, t]) =>
            `<div class="tab ${tab === k ? 'active' : ''}" data-tab="${k}">${t}</div>`).join('')}
        </div>
        ${tab === 'material' ? renderMaterials(mats) : tab === 'files' ? renderFiles() : tab === 'reviews' ? renderReviews() : tab === 'fav' ? renderFavs(favs) : tab === 'film' ? renderFilms(films) : tab === 'official' ? renderOfficial() : `
        <div class="row wrap" style="margin-bottom:14px">
          <span class="small muted">分组:</span>
          <span class="tag ${!filterGroup ? 'cyan' : ''}" style="cursor:pointer" data-fg="">全部</span>
          ${groups.map(g => `
          <span class="tag ${filterGroup === g.id ? 'cyan' : ''}" style="cursor:pointer" data-fg="${g.id}">${U.esc(g.name)}${g.shared && g.shared.length ? ' 👥' : ''}
            <b style="margin-left:4px;cursor:pointer" data-gmenu="${g.id}">⋯</b></span>`).join('')}
        </div>
        ${list.length === 0 ? '<div class="empty"><div class="ico">🗂️</div><p>暂无资产,点击「创建主体」上传,或在项目角色页将主体保存到资产库</p></div>' : `
        <div class="grid subj-grid">
          ${list.map(a => `
          <div class="card subj-card">
            <div class="imgbox">${a.image ? `<img src="${U.thumb(a.image)}">` : '<span class="muted small">无图片</span>'}</div>
            <div class="row" style="justify-content:space-between;margin-bottom:6px">
              <b>${U.esc(a.name)}</b>
              <span class="tag ${a.kind === 'character' ? 'cyan' : a.kind === 'scene' ? 'green' : 'yellow'}">${KIND_NAME[a.kind]}</span>
              ${(a.forms || []).length ? `<span class="tag cyan" title="含 ${a.forms.length} 个形态">🧩 ${a.forms.length} 形态</span>` : ''}
            </div>
            <div class="row wrap" style="gap:4px;margin-bottom:8px">
              ${(a.tags || []).map(t => `<span class="tag purple">${U.esc(t)}</span>`).join('')}
              ${a.groupId ? `<span class="tag">${U.esc((groups.find(g => g.id === a.groupId) || {}).name || '')}</span>` : ''}
              ${a.review ? `<span class="tag ${a.review === 'local_available' || a.review === 'approved' ? 'green' : a.review === 'pending' ? 'yellow' : 'red'}">${{ pending: '⏳ 本地检查中', local_available: '✓ 本地可用', approved: '✓ 已审核', rejected: '✕ 未通过' }[a.review] || a.review}</span>` : ''}
            </div>
            <div class="hint" style="margin:0 0 8px">来源:${U.esc(a.fromProject || '本地上传')} · ${U.esc(a.time || '')}</div>
            ${a.review === 'rejected' && window.HumanReview ? `<div class="hint" style="margin:0 0 8px;color:var(--red)">驳回原因:${U.esc((HumanReview.assetRecordOf(a.id) || {}).reason || '审核未通过')}</div>` : ''}
            <div class="row" style="gap:5px">
              ${a.image ? `<button class="btn sm" data-dl="${a.id}">⬇ 下载</button>` : ''}
              ${(a.forms || []).length ? `<button class="btn sm" data-aforms="${a.id}" title="查看该主体的各形态图">🧩 形态</button>` : ''}
              ${a.review === 'rejected' ? `<button class="btn sm" data-rereview="${a.id}">↻ 重新检查</button>` : ''}
              <button class="btn sm danger" data-rm="${a.id}">删除</button>
            </div>
          </div>`).join('')}
        </div>`}
        ${sharedList.length ? `
        <div class="row" style="margin:16px 0 10px;align-items:baseline;gap:10px">
          <b class="small">👥 协作者共享给我的资产</b>
          <span class="hint" style="margin:0">来自同项目组成员 · 本地可用/无需检查的资产 · 只读,可复制到我的资产库</span>
        </div>
        <div class="grid subj-grid">
          ${sharedList.map(a => `
          <div class="card subj-card">
            <div class="imgbox">${a.image ? `<img src="${U.thumb(a.image)}">` : '<span class="muted small">无图片</span>'}</div>
            <div class="row" style="justify-content:space-between;margin-bottom:6px">
              <b>${U.esc(a.name)}</b>
              <span class="tag ${a.kind === 'character' ? 'cyan' : a.kind === 'scene' ? 'green' : 'yellow'}">${KIND_NAME[a.kind]}</span>
              <span class="tag cyan">👥 共享</span>
            </div>
            <div class="row wrap" style="gap:4px;margin-bottom:8px">
              ${(a.tags || []).map(t => `<span class="tag purple">${U.esc(t)}</span>`).join('')}
            </div>
            <div class="hint" style="margin:0">来自 ${U.esc(a.ownerUsername || '队友')} 的共享分组「${U.esc(a.sharedGroup || '')}」 · ${U.esc(a.time || '')}</div>
            <div class="row" style="gap:5px">
              <button class="btn sm" data-scopy="${a.id}" title="复制为我的资产(引用队友文件,共享取消后可能失效)">＋ 复制到我的资产库</button>
            </div>
          </div>`).join('')}
        </div>` : ''}`}
      </div>`;

      main.querySelectorAll('[data-tab]').forEach(t => t.onclick = () => {
        tab = t.dataset.tab; filterGroup = '';
        if (tab === 'files' && !filesState.data && !filesState.err) loadFiles();
        render();
      });
      main.querySelectorAll('[data-fg]').forEach(t => t.onclick = e => {
        if (e.target.dataset.gmenu) return;
        filterGroup = t.dataset.fg; render();
      });
      main.querySelectorAll('[data-gmenu]').forEach(b => b.onclick = () => openGroupMenu(b.dataset.gmenu, render));
      /* 共享资产复制入库:引用队友文件路径(经 sharedPathsFor 服务端授权放行);共享取消后可能失效,卡片留提示 */
      main.querySelectorAll('[data-scopy]').forEach(b => b.onclick = () => {
        const src = __sharedMine.list.find(x => x.id === b.dataset.scopy);
        if (!src) return;
        Store.state.assets.subjects.push({
          id: Store.uid('as'), userId: u.id, kind: src.kind, name: src.name,
          image: src.image, imgRef: src.imgRef, prompt: src.prompt, tags: (src.tags || []).slice(),
          forms: (src.forms || []).map(f => ({ id: Store.uid('fm'), name: f.name, image: f.image || '', time: f.time || Store.now() })),
          refAudio: src.refAudio || undefined,
          groupId: null, fromProject: '团队共享·' + (src.ownerUsername || ''), time: Store.now(), sharedCopy: true,
        });
        Store.save();
        U.toast(`「${src.name}」已复制到我的资产库(未分组)`, 'success');
        render();
      });
      main.querySelector('[data-x=newgroup]').onclick = () => {
        U.openModal({
          title: '新建分组',
          body: `<label class="field"><span>分组名称</span><input class="input" data-f="gn" placeholder="如:第一季角色组"></label>`,
          footer: `<button class="btn" data-x="cancel">取消</button><button class="btn primary" data-x="ok">保存</button>`,
          onMount(m, close) {
            m.querySelector('[data-x=cancel]').onclick = close;
            m.querySelector('[data-x=ok]').onclick = () => {
              const name = m.querySelector('[data-f=gn]').value.trim();
              if (!name) return U.toast('请输入分组名称', 'error');
              Store.state.assets.groups.push({ id: Store.uid('grp'), userId: Store.currentUser().id, name, shared: [], time: Store.now() });
              Store.save(); close(); U.toast('分组已创建', 'success'); render();
            };
          },
        });
      };
      main.querySelector('[data-x=create]').onclick = () => openCreateSubject(render);
      main.querySelectorAll('[data-rm]').forEach(b => b.onclick = () => {
        U.confirm('确定删除该资产主体吗?删除后可在回收站恢复(保留 7 天)。', () => {
          const a = Store.state.assets.subjects.find(x => x.id === b.dataset.rm);
          if (a) Store.trashPut('asset', a.name, a); // 软删除:完整快照进回收站(官方资产本就不在此处,不经回收站)
          Store.state.assets.subjects = Store.state.assets.subjects.filter(a => a.id !== b.dataset.rm);
          Store.save(); U.toast('已删除,可在回收站恢复(保留 7 天)', 'success'); render();
        }, '删除');
      });
      /* 被驳回资产重新报白(任务4) */
      main.querySelectorAll('[data-rereview]').forEach(b => b.onclick = () => {
        const a = Store.state.assets.subjects.find(x => x.id === b.dataset.rereview);
        if (a && window.HumanReview) HumanReview.submitAsset(a, render);
      });
      main.querySelectorAll('[data-dl]').forEach(b => b.onclick = () => {
        const a = all.find(x => x.id === b.dataset.dl);
        U.downloadDataURL(a.name + '.png', a.image);
        U.toast('已下载', 'success');
      });
      /* ---- 资产形态查看:入资产库的形态图只读预览(导入项目后按「名-形态名」引用) ---- */
      main.querySelectorAll('[data-aforms]').forEach(b => b.onclick = () => {
        const a = all.find(x => x.id === b.dataset.aforms);
        if (!a) return;
        U.openModal({
          title: '🧩 形态 · ' + a.name,
          wide: true,
          body: `
          <div class="hint" style="margin:0 0 10px">导入项目后按「${U.esc(a.name)}-形态名」在分镜/镜头组中引用。</div>
          <div class="row wrap" style="gap:10px">
            ${(a.forms || []).map(f => `
            <div style="text-align:center">
              <div style="width:96px;height:96px;border-radius:8px;overflow:hidden;background:var(--bg2);border:1px solid var(--border2);display:flex;align-items:center;justify-content:center">
                ${f.image ? `<img src="${U.thumb(f.image)}" style="width:100%;height:100%;object-fit:cover">` : '<span class="small muted">无图</span>'}
              </div>
              <div class="small" style="margin-top:4px;max-width:96px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${U.esc(a.name + '-' + f.name)}">${U.esc(f.name)}</div>
            </div>`).join('')}
          </div>`,
          footer: `<button class="btn primary" data-x="ok">关闭</button>`,
          onMount(m, close) { m.querySelector('[data-x=ok]').onclick = close; },
        });
      });
      main.querySelectorAll('[data-unfav]').forEach(b => b.onclick = () => {
        Store.state.favorites = Store.state.favorites.filter(f => f.id !== b.dataset.unfav);
        Store.save(); U.toast('已取消收藏', 'success'); render();
      });
      main.querySelectorAll('[data-film]').forEach(c => c.onclick = e => {
        if (e.target.closest('[data-exp]')) return;
        const [fpid, feid] = c.dataset.film.split('/');
        location.hash = `#/project/${fpid}/episode/${feid}`;
      });
      main.querySelectorAll('[data-exp]').forEach(b => b.onclick = e => {
        e.stopPropagation();
        const [fpid, feid] = b.dataset.exp.split('/');
        const proj = Store.getProject(fpid);
        const ep2 = proj && (proj.episodes || []).find(x => x.id === feid);
        if (ep2) Exporter.dropdown(b, { p: proj, ep: ep2 });
      });
      main.querySelectorAll('[data-mat-up]').forEach(b => b.onclick = async () => {
        const kind = b.dataset.matUp;
        const f = await U.readAndUpload(kind === 'audio' ? 'audio/*' : 'image/*');
        if (!f) return;
        if (!f.server && f.size > 2 * 1024 * 1024) return U.toast('离线模式素材不能超过 2MB(localStorage 限制);启动 node server.js 后可传 10MB', 'error');
        Store.state.materials = Store.state.materials || [];
        Store.state.materials.unshift({ id: Store.uid('mt'), userId: Store.currentUser().id, name: f.name, kind, data: f.url, size: f.size, time: Store.now() });
        Store.save(); render();
      });
      main.querySelectorAll('[data-mat-rm]').forEach(b => b.onclick = () => {
        Store.state.materials = Store.state.materials.filter(x => x.id !== b.dataset.matRm);
        Store.save(); U.toast('素材已删除', 'success'); render();
      });
      main.querySelectorAll('[data-mat-dl]').forEach(b => b.onclick = () => {
        const mt = (Store.state.materials || []).find(x => x.id === b.dataset.matDl);
        if (mt) { U.downloadDataURL(mt.name, mt.data); U.toast('已下载', 'success'); }
      });
      /* ---- 文件资产 tab 事件 ---- */
      main.querySelectorAll('[data-fkind]').forEach(t => t.onclick = () => { filesState.kind = t.dataset.fkind; render(); });
      const favOnlyBtn = main.querySelector('[data-favonly]');
      if (favOnlyBtn) favOnlyBtn.onclick = () => { filesState.favOnly = !filesState.favOnly; render(); };
      const frefresh = main.querySelector('[data-frefresh]');
      if (frefresh) frefresh.onclick = () => { filesState.data = null; filesState.err = ''; loadFiles(); render(); };
      const fretry = main.querySelector('[data-fretry]');
      if (fretry) fretry.onclick = () => { filesState.err = ''; loadFiles(); };
      main.querySelectorAll('[data-ffav]').forEach(b => b.onclick = () => {
        const url = b.dataset.ffav;
        Store.state.fileFavs = Store.state.fileFavs || {};
        if (Store.state.fileFavs[url]) delete Store.state.fileFavs[url]; else Store.state.fileFavs[url] = true;
        Store.save(); render();
      });
      main.querySelectorAll('[data-fdl]').forEach(b => b.onclick = () => dlUrl(b.dataset.fdl, b.dataset.fname));
      main.querySelectorAll('[data-ftolib]').forEach(b => b.onclick = () => {
        const f = (filesState.data ? filesState.data.files : []).find(x => x.url === b.dataset.ftolib);
        if (!f) return;
        Store.state.materials = Store.state.materials || [];
        Store.state.materials.unshift({ id: Store.uid('mt'), userId: Store.currentUser().id, name: f.name, kind: FILE_KIND(f.name) === 'audio' ? 'audio' : 'image', data: f.url, size: f.size, time: Store.now() });
        Store.save(); U.toast('已存入素材库,可在「素材库」tab 查看', 'success');
      });
      main.querySelectorAll('[data-fhr]').forEach(b => b.onclick = () => {
        const f = (filesState.data ? filesState.data.files : []).find(x => x.url === b.dataset.fhr);
        if (f) HumanReview.submit({ name: f.name, url: f.url }, render);
      });
      main.querySelectorAll('[data-frm]').forEach(b => b.onclick = () => {
        const res409 = j => j && j.code === 409; // fail() 响应 {code:409,...}(引用拦截)
        const del = (force) => fetch('/api/uploads/' + encodeURIComponent(b.dataset.frm) + (force ? '?force=1' : ''), { method: 'DELETE', headers: { 'Authorization': 'Bearer ' + Store.getToken() } })
          .then(r => r.json()).catch(() => null);
        U.confirm('确定从服务端删除该文件吗?删除后无法恢复。', async () => {
          try {
            let j = await del(false);
            if (j && res409(j)) { // 引用拦截(七轮):列出引用位置,由用户选择强制删除
              const refs = String(j.message || '').replace(/^文件仍被以下位置引用:?/, '');
              U.confirm(`该文件仍被引用,删除后引用处将显示“媒体缺失”:\n${refs}\n\n仍要强制删除吗?`, async () => {
                const j2 = await del(true);
                if (j2 && j2.code === 0) { U.toast('文件已强制删除(引用处已缺失)', 'success'); filesState.data = null; loadFiles(); }
                else U.toast((j2 && j2.message) || '删除失败', 'error', 4000);
              }, '仍要强制删除');
              return;
            }
            if (j && j.code === 0) { U.toast('文件已删除', 'success'); filesState.data = null; loadFiles(); }
            else U.toast((j && j.message) || '删除失败', 'error');
          } catch (_) { U.toast('服务端不可达,删除失败', 'error'); }
        }, '删除');
      });
      /* ---- 真人审核记录 tab 事件 ---- */
      main.querySelectorAll('[data-hrretry]').forEach(b => b.onclick = () => {
        const r = (Store.state.assetReviews || []).find(x => x.id === b.dataset.hrretry);
        if (!r) return;
        if (r.kind === 'asset') { // 资产报白记录:重新报白需回写资产条目 review,走 submitAsset
          const a = Store.state.assets.subjects.find(x => x.id === r.assetId);
          if (a) HumanReview.submitAsset(a, render);
          else U.toast('该资产已删除,无法重新报白', 'error');
        } else HumanReview.submit({ name: r.name, url: r.url }, render);
      });
      /* ---- 素材库「标记为资产」入口(任务4:第二条入库路径,保存后自动报白) ---- */
      main.querySelectorAll('[data-mat-asset]').forEach(b => b.onclick = () => {
        const mt = (Store.state.materials || []).find(x => x.id === b.dataset.matAsset);
        if (mt) openMarkAsset(mt, render);
      });
      /* ---- 官方资产:调用到项目 / 收藏(不渲染下载,禁止导出) ---- */
      main.querySelectorAll('[data-ofuse]').forEach(b => b.onclick = () => {
        const a = OFFICIAL_ASSETS.find(x => x.id === b.dataset.ofuse);
        if (!a) return;
        const projs = Store.myProjects();
        if (!projs.length) return U.toast('暂无项目,请先在「项目管理」创建项目', 'info');
        U.openModal({
          title: '＋ 调用官方资产到项目 · ' + a.name,
          body: `
          <label class="field"><span>选择项目</span>
            <select class="select" data-f="proj">${projs.map(p => `<option value="${p.id}">${U.esc(p.name)}</option>`).join('')}</select>
          </label>
          <div class="hint">官方资产将以主体形式加入项目角色页(带「官方版权」标记随行),仅限平台内使用,禁止下载导出。</div>`,
          footer: `<button class="btn" data-x="cancel">取消</button><button class="btn primary" data-x="ok">调用到项目</button>`,
          onMount(m, close) {
            m.querySelector('[data-x=cancel]').onclick = close;
            m.querySelector('[data-x=ok]').onclick = () => {
              const p = Store.getProject(m.querySelector('[data-f=proj]').value);
              if (!p) return;
              p.subjects = p.subjects || [];
              p.subjects.push({ id: Store.uid('sj'), name: a.name, kind: a.kind, image: officialThumb(a), prompt: a.prompt, tags: (a.tags || []).slice(), forms: [], official: true, fromOfficial: a.id, time: Store.now() });
              Store.save(); close();
              U.toast(`官方资产「${a.name}」已调用到项目「${p.name}」`, 'success');
            };
          },
        });
      });
      main.querySelectorAll('[data-offav]').forEach(b => b.onclick = () => {
        const a = OFFICIAL_ASSETS.find(x => x.id === b.dataset.offav);
        if (!a) return;
        const uid = Store.currentUser().id;
        if (Store.state.favorites.some(f => f.kind === 'official' && f.assetId === a.id && f.userId === uid)) return U.toast('已收藏过该官方资产', 'info');
        Store.state.favorites.unshift({ id: Store.uid('fv'), userId: uid, kind: 'official', assetId: a.id, name: a.name, prompt: a.prompt, time: Store.now() });
        Store.save(); U.toast('已收藏,可在「我的收藏」tab 查看', 'success'); render();
      });
      main.querySelectorAll('[data-hrrm]').forEach(b => b.onclick = () => {
        Store.state.assetReviews = (Store.state.assetReviews || []).filter(x => x.id !== b.dataset.hrrm);
        Store.save(); U.toast('审核记录已删除', 'success'); render();
      });
      /* ---- 肖像白名单认证入口 ---- */
      const certAddBtn = main.querySelector('[data-x=certadd]');
      if (certAddBtn && window.Compliance) certAddBtn.onclick = () => Compliance.certModal(render);
      const certsBtn = main.querySelector('[data-x=certs]');
      if (certsBtn && window.Compliance) certsBtn.onclick = () => Compliance.certListModal(render);
    }

    /* ---------- 文件资产 tab(消费 GET /api/uploads) ---------- */
    function renderFiles() {
      if (filesState.err) return `<div class="empty"><div class="ico">☁️</div><p>${U.esc(filesState.err)}</p><button class="btn sm" data-fretry>↻ 重试</button></div>`;
      if (!filesState.data) return '<div class="empty"><div class="spinner"></div><p>文件列表加载中…</p></div>';
      const { files, usedBytes, quotaMB } = filesState.data;
      const favs = Store.state.fileFavs || {};
      const usedMB = usedBytes / 1048576;
      const pct = Math.min(100, Math.round(usedMB / quotaMB * 100));
      let list = files;
      if (filesState.kind !== 'all') list = list.filter(f => FILE_KIND(f.name) === filesState.kind);
      if (filesState.favOnly) list = list.filter(f => favs[f.url]);
      return `
      <div class="row" style="margin-bottom:12px;justify-content:space-between">
        <span class="small muted">服务端上传文件统一管理 · 已用 ${usedMB.toFixed(1)} / ${quotaMB} MB</span>
        <button class="btn sm" data-frefresh>↻ 刷新</button>
      </div>
      <div class="quota-bar" style="margin-bottom:14px"><div class="quota-fill ${pct > 85 ? 'warn' : ''}" style="width:${pct}%"></div></div>
      <div class="row wrap" style="margin-bottom:14px;gap:6px">
        ${[['all', '全部'], ['image', '图片'], ['audio', '音频'], ['video', '视频'], ['other', '其他']].map(([k, t]) =>
          `<span class="tag ${filesState.kind === k ? 'cyan' : ''}" style="cursor:pointer" data-fkind="${k}">${t}</span>`).join('')}
        <span class="tag ${filesState.favOnly ? 'yellow' : ''}" style="cursor:pointer" data-favonly>★ 只看收藏</span>
      </div>
      ${!list.length ? '<div class="empty"><div class="ico">☁️</div><p>暂无文件,在素材库/角色页上传文件后即出现在这里</p></div>' : `
      <div class="grid" style="grid-template-columns:repeat(auto-fill,minmax(230px,1fr))">
        ${list.map(f => {
          const kind = FILE_KIND(f.name);
          return `
          <div class="card" style="padding:14px">
            <div class="row" style="justify-content:space-between;margin-bottom:8px">
              <b class="small" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${U.esc(f.name)}">${U.esc(f.name)}</b>
              <span style="cursor:pointer;font-size:15px" data-ffav="${U.esc(f.url)}" title="收藏">${favs[f.url] ? '★' : '☆'}</span>
            </div>
            ${kind === 'image'
              ? `<img src="${U.esc(f.url)}" style="width:100%;height:110px;object-fit:cover;border-radius:8px;margin-bottom:8px">`
              : kind === 'audio'
                ? `<audio controls src="${U.esc(f.url)}" style="width:100%;height:32px;margin-bottom:8px"></audio>`
                : `<div style="width:100%;height:110px;border-radius:8px;margin-bottom:8px;display:flex;align-items:center;justify-content:center;background:var(--bg2);font-size:30px">${kind === 'video' ? '🎞' : '📄'}</div>`}
            <div class="row" style="gap:4px;margin-bottom:6px">
              <span class="tag ${kind === 'image' ? 'green' : kind === 'audio' ? 'cyan' : 'purple'}">${KIND_LABEL[kind]}</span>
              ${kind === 'image' && window.HumanReview ? HumanReview.badge(f.url) : ''}
            </div>
            <div class="hint" style="margin:0 0 8px">${fmtSize(f.size)} · ${U.esc((f.mtime || '').slice(0, 16).replace('T', ' '))}</div>
            <div class="row wrap" style="gap:5px">
              <button class="btn sm" data-fdl="${U.esc(f.url)}" data-fname="${U.esc(f.name)}">⬇ 下载</button>
              ${kind === 'image' || kind === 'audio' ? `<button class="btn sm" data-ftolib="${U.esc(f.url)}">📥 存入素材库</button>` : ''}
              ${kind === 'image' && window.HumanReview ? `<button class="btn sm" data-fhr="${U.esc(f.url)}">🧑 真人审核</button>` : ''}
              <button class="btn sm danger" data-frm="${U.esc(f.name)}">删除</button>
            </div>
          </div>`;
        }).join('')}
      </div>`}`;
    }

    /* ---------- 真人审核记录 tab ---------- */
    function renderReviews() {
      const list = (Store.state.assetReviews || []).filter(r => r.userId === Store.currentUser().id);
      // 肖像白名单认证状态区(报白先认证:未认证须先完成认证才能提交真人审核)
      const certs = (Store.state.portraitCerts || []);
      const certBlock = window.Compliance ? `
      <div class="card" style="padding:14px;margin-bottom:12px;display:flex;gap:12px;align-items:center">
        <span style="font-size:22px">🪪</span>
        <div class="grow" style="min-width:0">
          <b class="small">肖像白名单认证</b>
          <div class="hint" style="margin:2px 0 0">${certs.length ? `已认证 ${certs.length} 人:${U.esc(certs.map(c => c.name).join('、'))}` : '未认证 · 含真人肖像的素材须先完成认证,才能提交报白审核'}</div>
        </div>
        <button class="btn sm" data-x="certs">管理认证</button>
        <button class="btn sm primary" data-x="certadd">＋ 新增认证</button>
      </div>` : '';
      if (!list.length) return certBlock + `
      <div class="empty"><div class="ico">🧑</div><p>暂无审核记录</p>
      <p class="small muted">含真人人脸的参考素材(角色照/站位图等)需先通过预审,再用于视频生成,<br>可避免正式任务因素材审核失败浪费积分。到「☁️ 文件资产」tab 对图片点「🧑 真人审核」即可提交。</p></div>`;
      return certBlock + `
      <div class="hint" style="margin:0 0 12px">真人素材先审后用:预审通过的素材在文生视频/批量生成时直接放行;审核中需确认;未通过会被阻止生成。</div>
      ${list.map(r => `
      <div class="card" style="padding:12px;margin-bottom:10px;display:flex;gap:12px;align-items:center">
        <img src="${U.esc(r.url)}" style="width:72px;height:72px;object-fit:cover;border-radius:8px;flex:none">
        <div class="grow" style="min-width:0">
          <div class="row" style="gap:8px;margin-bottom:4px">
            <b class="small" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${U.esc(r.name)}</b>
            ${r.kind === 'asset' ? '<span class="tag cyan">资产检查</span>' : ''}
            <span class="tag ${r.status === 'local_available' || r.status === 'approved' ? 'green' : r.status === 'pending' ? 'yellow' : ''}">🧑 ${{ pending: '检查中', local_available: '本地可用', approved: '已审核', rejected: '未通过' }[r.status] || r.status}</span>
          </div>
          <div class="hint" style="margin:0">${U.esc(r.reason || '检查进行中,请稍候…')}</div>
          <div class="hint" style="margin:2px 0 0">提交:${U.esc(r.time)}${r.doneAt ? ' · 完成:' + U.esc(r.doneAt) : ''}</div>
        </div>
        <div class="row" style="gap:5px;flex:none">
          ${r.status === 'rejected' ? `<button class="btn sm" data-hrretry="${r.id}">↻ 重新提交</button>` : ''}
          <button class="btn sm danger" data-hrrm="${r.id}">删除记录</button>
        </div>
      </div>`).join('')}`;
    }

    function renderMaterials(mats) {
      return `
      <div class="row" style="margin-bottom:14px;justify-content:space-between">
        <span class="small muted">上传的音效/图片素材统一管理(对应真实站 /materials)</span>
        <div class="row">
          <button class="btn sm" data-mat-up="audio">🎵 上传音效</button>
          <button class="btn sm" data-mat-up="image">🖼 上传图片</button>
        </div>
      </div>
      ${!mats.length ? '<div class="empty"><div class="ico">🎵</div><p>暂无素材,点击右上角上传音效或图片</p></div>' : `
      <div class="grid" style="grid-template-columns:repeat(auto-fill,minmax(220px,1fr))">
        ${mats.map(mt => `
        <div class="card" style="padding:14px">
          <div class="row" style="justify-content:space-between;margin-bottom:8px">
            <b class="small" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${U.esc(mt.name)}</b>
            <span class="tag ${mt.kind === 'audio' ? 'cyan' : 'green'}">${mt.kind === 'audio' ? '音效' : '图片'}</span>
          </div>
          ${mt.kind === 'image'
            ? `<img src="${U.thumb(mt.data)}" style="width:100%;height:110px;object-fit:cover;border-radius:8px;margin-bottom:8px">`
            : `<audio controls src="${mt.data}" style="width:100%;height:32px;margin-bottom:8px"></audio>`}
          <div class="hint" style="margin:0 0 8px">${((mt.size || 0) / 1024).toFixed(0)} KB · ${U.esc(mt.time || '')}</div>
          <div class="row wrap" style="gap:5px">
            <button class="btn sm" data-mat-dl="${mt.id}">⬇ 下载</button>
            ${mt.kind === 'image' ? `<button class="btn sm" data-mat-asset="${mt.id}" title="转为资产库主体并自动提交报白审核">🏷 标记为资产</button>` : ''}
            <button class="btn sm danger" data-mat-rm="${mt.id}">删除</button>
          </div>
        </div>`).join('')}
      </div>`}`;
    }

    function renderFavs(favs) {
      if (!favs.length) return '<div class="empty"><div class="ico">⭐</div><p>暂无收藏,在分镜卡片点亮五角星即可收藏提示词,官方资产卡片点「☆ 收藏」收资产</p></div>';
      return favs.map(f => f.kind === 'official' ? `
      <div class="card" style="margin-bottom:10px">
        <div class="row" style="justify-content:space-between;margin-bottom:6px">
          <span class="tag purple">🏅 官方资产收藏 · ${U.esc(f.name || '')}</span>
          <span class="small muted">${U.esc(f.time)}</span>
        </div>
        <div class="small" style="line-height:1.7">${U.esc(f.prompt || '')}</div>
        <div class="hint" style="margin:6px 0 0">官方资产仅限平台内使用,禁止下载导出</div>
        <div class="row" style="margin-top:8px;justify-content:flex-end">
          <button class="btn sm danger" data-unfav="${f.id}">取消收藏</button>
        </div>
      </div>` : `
      <div class="card" style="margin-bottom:10px">
        <div class="row" style="justify-content:space-between;margin-bottom:6px">
          <span class="tag yellow">⭐ 分镜提示词收藏</span>
          <span class="small muted">${U.esc(f.model)} · ${U.esc(f.time)}</span>
        </div>
        <div class="small" style="line-height:1.7">${U.esc(f.prompt)}</div>
        <div class="row" style="margin-top:8px;justify-content:flex-end">
          <button class="btn sm danger" data-unfav="${f.id}">取消收藏</button>
        </div>
      </div>`).join('');
    }

    /* ---------- 官方资产 tab:只读,「＋ 调用到项目」/「☆ 收藏」,不渲染下载按钮 ---------- */
    function renderOfficial() {
      return `
      <div class="hint" style="margin:0 0 12px">平台官方版权资产,一键调用到项目使用;官方资产仅限平台内使用,禁止下载导出,不占用你的存储空间、不进回收站。</div>
      <div class="grid subj-grid">
        ${OFFICIAL_ASSETS.map(a => `
        <div class="card subj-card">
          <div class="imgbox"><img src="${officialThumb(a)}"></div>
          <div class="row" style="justify-content:space-between;margin-bottom:6px">
            <b>${U.esc(a.name)}</b>
            <span class="tag ${a.kind === 'character' ? 'cyan' : a.kind === 'scene' ? 'green' : 'yellow'}">${KIND_NAME[a.kind]}</span>
            <span class="tag purple">🏅 官方版权</span>
          </div>
          <div class="row wrap" style="gap:4px;margin-bottom:8px">
            ${(a.tags || []).map(t => `<span class="tag purple">${U.esc(t)}</span>`).join('')}
          </div>
          <div class="hint" style="margin:0 0 8px">${U.esc(a.prompt)}</div>
          <div class="hint" style="margin:0 0 8px">官方资产仅限平台内使用,禁止下载导出</div>
          <div class="row" style="gap:5px">
            <button class="btn sm primary" data-ofuse="${a.id}">＋ 调用到项目</button>
            <button class="btn sm" data-offav="${a.id}">☆ 收藏</button>
          </div>
        </div>`).join('')}
      </div>`;
    }

    /* ---------- 素材库「标记为资产」:素材 → 资产库主体,保存后自动报白(任务4 第二条入库路径) ---------- */
    function openMarkAsset(mt, done) {
      let kind = 'prop';
      U.openModal({
        title: '🏷 标记为资产 · ' + mt.name,
        body: `
        <div style="text-align:center;margin-bottom:10px"><img src="${U.thumb(mt.data)}" style="max-height:90px;border-radius:8px"></div>
        <label class="field"><span>资产类型</span>
          <div class="model-row">${['character', 'scene', 'prop'].map(k => `<div class="model-opt ${k === 'prop' ? 'sel' : ''}" data-k="${k}">${KIND_NAME[k]}</div>`).join('')}</div>
        </label>
        <label class="field"><span>资产名称</span><input class="input" data-f="name" value="${U.esc(mt.name.replace(/\.[^.]+$/, ''))}"></label>
        <div class="hint">保存后将自动提交报白审核;通过后资产可共享给协作者并用于全平台生成。</div>`,
        footer: `<button class="btn" data-x="cancel">取消</button><button class="btn primary" data-x="ok">标记并报白</button>`,
        onMount(m, close) {
          m.querySelectorAll('[data-k]').forEach(o => o.onclick = () => { kind = o.dataset.k; m.querySelectorAll('[data-k]').forEach(x => x.classList.toggle('sel', x === o)); });
          m.querySelector('[data-x=cancel]').onclick = close;
          m.querySelector('[data-x=ok]').onclick = () => {
            const name = m.querySelector('[data-f=name]').value.trim();
            if (!name) return U.toast('请输入资产名称', 'error');
            const item = {
              id: Store.uid('as'), userId: Store.currentUser().id, kind, name,
              image: mt.data, prompt: '', tags: ['素材标记'],
              groupId: null, fromProject: '素材库', time: Store.now(),
            };
            Store.state.assets.subjects.push(item);
            Store.save(); close();
            U.toast(`「${name}」已标记为资产,已自动提交报白审核`, 'success');
            if (window.HumanReview) HumanReview.submitAsset(item, done);
            else done && done();
          };
        },
      });
    }

    function renderFilms(films) {
      if (!films.length) return '<div class="empty"><div class="ico">🎞</div><p>暂无成片,在分集工作区「合成成片」后自动归档</p></div>';
      return `<div class="grid proj-grid">${films.map(({ p, ep }) => `
      <div class="card proj-card" data-film="${p.id}/${ep.id}">
        <div class="proj-cover" style="background:linear-gradient(135deg,hsl(${U.hashColor(ep.title)},68%,92%),hsl(${(U.hashColor(ep.title) + 40) % 360},72%,87%));height:110px"><div class="ph">🎞</div></div>
        <div class="proj-body">
          <div class="proj-name">${U.esc(p.name)} · ${U.esc(ep.title)}</div>
          <div class="row" style="justify-content:space-between;margin-top:6px">
            <span class="tag green">已合成</span>${ep.composedVia === 'shots' ? '<span class="tag cyan" title="由分镜表合成">分镜表</span>' : ep.composedVia === 'beats' ? '<span class="tag yellow" title="由节拍板五段合成">节拍板</span>' : ''}
            <div class="row" style="gap:6px;align-items:center">
              <span class="small muted">${U.esc(ep.composedAt || '')}</span>
              <button class="btn sm btn-export" data-exp="${p.id}/${ep.id}" style="padding:3px 10px">导出 ⬇</button>
            </div>
          </div>
        </div>
      </div>`).join('')}</div>`;
    }

    render();
  };

  function openCreateSubject(done) {
    let kind = 'character', image = null;
    U.openModal({
      title: '创建主体(上传资产)',
      body: `
      <label class="field"><span>主体类型</span>
        <div class="model-row">${Object.entries(KIND_NAME).map(([k, v], i) => `<div class="model-opt ${i === 0 ? 'sel' : ''}" data-k="${k}">${v}</div>`).join('')}</div>
      </label>
      <label class="field"><span>主体名称</span><input class="input" data-f="name" placeholder="如:林雪 / 深夜咖啡馆 / 青铜古剑"></label>
      <label class="field"><span>上传图片</span><div class="dropzone" data-x="img">点击上传主体图片</div></label>
      <label class="field"><span>描述提示词(可选)</span><textarea class="input" data-f="prompt" rows="2"></textarea></label>`,
      footer: `<button class="btn" data-x="cancel">取消</button><button class="btn primary" data-x="ok">保存主体</button>`,
      onMount(m, close) {
        m.querySelectorAll('[data-k]').forEach(o => o.onclick = () => { kind = o.dataset.k; m.querySelectorAll('[data-k]').forEach(x => x.classList.toggle('sel', x === o)); });
        m.querySelector('[data-x=img]').onclick = async () => {
          const f = await U.readAndUpload('image/*');
          if (!f) return;
          image = f.url;
          m.querySelector('[data-x=img]').innerHTML = `<img src="${U.thumb(image)}" style="max-height:80px;border-radius:6px">`;
        };
        m.querySelector('[data-x=cancel]').onclick = close;
        m.querySelector('[data-x=ok]').onclick = () => {
          const name = m.querySelector('[data-f=name]').value.trim();
          if (!name) return U.toast('请输入主体名称', 'error');
          Store.state.assets.subjects.push({
            id: Store.uid('as'), userId: Store.currentUser().id, kind, name,
            image: image || PH.subject(name, kind), prompt: m.querySelector('[data-f=prompt]').value.trim(),
            tags: [], groupId: null, fromProject: '本地上传', time: Store.now(),
          });
          Store.save(); close(); U.toast('主体已创建', 'success'); done();
        };
      },
    });
  }

  function openGroupMenu(gid, done) {
    const g = Store.state.assets.groups.find(x => x.id === gid);
    U.openModal({
      title: '分组 · ' + g.name,
      body: `
      <div class="check-line" data-x="share">👥 共享分组 — 邀请协作者${g.shared && g.shared.length ? '(已共享:' + g.shared.join('、') + ')' : ''}</div>
      <div class="check-line" data-x="rename">✏ 编辑分组名称</div>
      <div class="check-line" data-x="del" style="color:var(--red)">🗑 删除分组</div>`,
      onMount(m, close) {
        m.querySelector('[data-x=share]').onclick = () => {
          // 团队↔资产贯通:共享对象限同项目组成员(与服务端 /api/assets/shared 的队友聚合口径一致)
          (async () => {
            const me = Store.currentUser();
            let mates = [];
            if (Store.getToken()) {
              try {
                const res = await fetch('/api/team', { headers: { Authorization: 'Bearer ' + Store.getToken() } });
                const j = await res.json().catch(() => null);
                if (j && j.code === 0 && Array.isArray(j.data && j.data.teams))
                  mates = [...new Set(j.data.teams.flatMap(t => (t.members || []).map(mm => mm.username).filter(n => n && n !== me.username)))];
              } catch (_) { /* 离线/后端不可达:按无队友处理 */ }
            }
            U.openModal({
              title: '邀请协作者',
              body: `<label class="field"><span>项目组成员用户名(多个用逗号分隔)</span><input class="input" data-f="who" placeholder="${mates.length ? '如:' + mates.slice(0, 3).join(',') : '暂无其他成员'}"></label>
              <div class="hint">${mates.length
                ? `你的项目组成员:${U.esc(mates.join('、'))}。共享仅限同项目组成员;对方将在其资产库看到该分组内「本地可用/无需检查」的资产(只读,可复制到自己的库后用于生成)。`
                : '你还没有项目组或组内暂无其他成员。团队资产共享需先在「团队管理」创建/加入项目组并邀请成员(公司主体账号)。'}</div>`,
              footer: `<button class="btn" data-x="no">取消</button><button class="btn primary" data-x="yes">确定邀请</button>`,
              onMount(m2, close2) {
                m2.querySelector('[data-x=no]').onclick = close2;
                m2.querySelector('[data-x=yes]').onclick = () => {
                  const who = m2.querySelector('[data-f=who]').value.split(/[,，]/).map(x => x.trim()).filter(Boolean);
                  if (!who.length) return U.toast('请输入成员用户名', 'error');
                  const bad = who.filter(w => !mates.includes(w));
                  if (bad.length) return U.toast('以下用户名不在你的项目组内,无法共享:' + bad.join('、'), 'error', 4000);
                  g.shared = (g.shared || []).concat(who.filter(w => !(g.shared || []).includes(w)));
                  Store.save(); close2(); close();
                  U.toast('已邀请 ' + who.length + ' 位成员共享该分组', 'success'); done();
                };
              },
            });
          })();
        };
        m.querySelector('[data-x=rename]').onclick = () => {
          U.openModal({
            title: '编辑分组名称',
            body: `<label class="field"><span>新名称</span><input class="input" data-f="nn" value="${U.esc(g.name)}"></label>`,
            footer: `<button class="btn primary" data-x="ok">保存</button>`,
            onMount(m2, close2) {
              m2.querySelector('[data-x=ok]').onclick = () => {
                const n = m2.querySelector('[data-f=nn]').value.trim();
                if (n) { g.name = n; Store.save(); }
                close2(); close(); U.toast('已保存', 'success'); done();
              };
            },
          });
        };
        m.querySelector('[data-x=del]').onclick = () => {
          close();
          U.confirm('删除分组后,组内资产将移至「未分组」。确定删除吗?', () => {
            Store.state.assets.subjects.forEach(a => { if (a.groupId === gid) a.groupId = null; });
            Store.state.assets.groups = Store.state.assets.groups.filter(x => x.id !== gid);
            Store.save(); U.toast('分组已删除', 'success'); done();
          }, '删除');
        };
      },
    });
  }
  /* ---------- 回收站(任务5:项目/资产软删除,保留 7 天可恢复) ---------- */
  Views.trash = function (main) {
    Store.trashPurge(); // 渲染前清理到期条目(保留 7 天,见 store.js trashPurge)
    const list = Store.state.trash || [];
    const DAY = 24 * 3600 * 1000;
    const leftDays = t => Math.max(0, Math.ceil((7 * DAY - (Date.now() - (t.deletedAt || 0))) / DAY));
    const fmtTime = ts => new Date(ts || 0).toLocaleString('zh-CN', { hour12: false });
    main.innerHTML = `
    <div class="page">
      <div class="page-head">
        <div>
          <div class="page-title">回收站</div>
          <div class="page-sub">删除的项目/分集与资产在此保留 7 天,到期自动清除 · 共 ${list.length} 条</div>
        </div>
      </div>
      ${!list.length ? '<div class="empty"><div class="ico">🗑</div><p>回收站为空,删除的项目/分集与资产会在此保留 7 天</p></div>' : list.map(t => `
      <div class="card" style="padding:12px 14px;margin-bottom:10px;display:flex;gap:12px;align-items:center">
        <span style="font-size:22px;flex:none">${t.kind === 'project' ? '🎬' : t.kind === 'episode' ? '🎞️' : '🗂️'}</span>
        <div class="grow" style="min-width:0">
          <div class="row" style="gap:8px;margin-bottom:4px">
            <b class="small" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${U.esc(t.name)}</b>
            <span class="tag ${t.kind === 'project' ? 'cyan' : t.kind === 'episode' ? 'yellow' : 'green'}">${t.kind === 'project' ? '项目' : t.kind === 'episode' ? '分集' : '资产'}</span>
          </div>
          <div class="hint" style="margin:0">删除时间:${U.esc(fmtTime(t.deletedAt))} · 剩余 ${leftDays(t)} 天</div>
        </div>
        <div class="row" style="gap:5px;flex:none">
          <button class="btn sm primary" data-restore="${t.id}">↩ 恢复</button>
          <button class="btn sm danger" data-purge="${t.id}">彻底删除</button>
        </div>
      </div>`).join('')}
    </div>`;
    /* ---- 本地冲突备份(409 被云端覆盖前自动留档,最近 3 份):恢复到本机/导出 JSON/删除 ---- */
    const baks = Store.conflictBackups();
    main.insertAdjacentHTML('beforeend', `
    <div class="page-head" style="margin-top:22px">
      <div>
        <div class="page-title" style="font-size:16px">🔀 本地冲突备份</div>
        <div class="page-sub">云端版本较新覆盖本地前自动留档(最近 3 份) · 共 ${baks.length} 份</div>
      </div>
    </div>
    ${!baks.length ? '<div class="empty"><div class="ico">🔀</div><p>暂无冲突备份;当云端同步发生版本冲突时,被覆盖的本地数据会自动留存于此</p></div>' : baks.map((b, i) => `
    <div class="card" style="padding:12px 14px;margin-bottom:10px;display:flex;gap:12px;align-items:center">
      <span style="font-size:22px;flex:none">💾</span>
      <div class="grow" style="min-width:0">
        <b class="small">备份于 ${U.esc(new Date(b.time || 0).toLocaleString('zh-CN', { hour12: false }))}</b>
        <div class="hint" style="margin:2px 0 0">${(b.state && b.state.projects ? b.state.projects.length : 0)} 个项目 · schema v${(b.state && b.state.schemaVersion) || '-'}</div>
      </div>
      <div class="row" style="gap:5px;flex:none">
        <button class="btn sm primary" data-bak-restore="${i}">↩ 恢复到本机</button>
        <button class="btn sm" data-bak-dl="${i}">⬇ 导出 JSON</button>
        <button class="btn sm danger" data-bak-del="${i}">删除</button>
      </div>
    </div>`).join('')}
    ${baks.length ? '<div class="hint" style="margin-top:6px">「恢复到本机」会替换当前本地数据(云端账号下次同步仍以云端为准,建议先导出 JSON 留底再恢复)</div>' : ''}`);
    main.querySelectorAll('[data-bak-restore]').forEach(b => b.onclick = () => {
      U.confirm('确定用该备份替换当前本机数据吗?云端账号下次同步仍以云端为准;建议先「导出 JSON」留底。', () => {
        if (Store.restoreConflictBackup(+b.dataset.bakRestore)) { U.toast('已恢复到本机', 'success'); Views.trash(main); }
        else U.toast('备份已不存在', 'error');
      }, '恢复');
    });
    main.querySelectorAll('[data-bak-dl]').forEach(b => b.onclick = () => {
      const bak = Store.conflictBackups()[+b.dataset.bakDl];
      if (!bak) return U.toast('备份已不存在', 'error');
      U.downloadText(`冲突备份_${new Date(bak.time || 0).toISOString().slice(0, 19).replace(/[T:]/g, '-')}.json`, JSON.stringify(bak.state));
    });
    main.querySelectorAll('[data-bak-del]').forEach(b => b.onclick = () => {
      Store.removeConflictBackup(+b.dataset.bakDel);
      U.toast('备份已删除', 'success');
      Views.trash(main);
    });
    main.querySelectorAll('[data-restore]').forEach(b => b.onclick = () => {
      const r = Store.trashRestore(b.dataset.restore);
      if (!r) return U.toast('该条目已不存在或所属项目已删除,无法恢复', 'error');
      U.toast(`「${r.name}」已恢复${r.renamed ? '(原 id 冲突,已分配新 id)' : ''}`, 'success');
      Views.trash(main);
    });
    main.querySelectorAll('[data-purge]').forEach(b => b.onclick = () => {
      const t = (Store.state.trash || []).find(x => x.id === b.dataset.purge);
      U.confirm(`彻底删除「${t ? t.name : ''}」后无法恢复,确定吗?`, () => {
        Store.state.trash = Store.state.trash.filter(x => x.id !== b.dataset.purge);
        Store.save(); U.toast('已彻底删除', 'success'); Views.trash(main);
      }, '彻底删除');
    });
  };
})();
