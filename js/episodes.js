/* ============ episodes.js 分集管理 / 剧本拆分集 / 主体提取 ============ */
(function () {
  window.Views = window.Views || {};

  /* 剧本解析/主体提取/分集工具域(启发式解析、LLM 提取、规范文本信息提取、LLM 分集)
   * 已拆至 episode-util.js,经 window.EpisodeUtil 调用;执行侧入口由 proj-upload.js 增补 */

  /* ---------- 分集管理页 ---------- */
  Views.projectDetail = function (main, pid) {
    const p = Store.getProject(pid);
    if (!p) { location.hash = '#/projects'; return; }
    let tab = '分集', search = '', page = 1, asc = true;
    if (window.__projTab) { tab = window.__projTab; window.__projTab = null; } // 工作区步骤条带 tab 目标回项目页
    const PER = 20;
    const TABS = ['制片', '剧本', '导演', '主体', '分集', '成片库', '剧壳', '切片']; // 分镜工作台从「分集」列表对应分集进入;实验室/AI策划/剧本译制已迁至「百宝箱 → 项目实验台」

    function render() {
      let eps = p.episodes.slice().sort((a, b) => asc ? a.order - b.order : b.order - a.order);
      if (search) eps = eps.filter(e => e.title.toLowerCase().includes(search.toLowerCase()));
      const pages = Math.max(1, Math.ceil(eps.length / PER));
      page = Math.min(page, pages);
      const shown = eps.slice((page - 1) * PER, page * PER);

      // 流程进度并入 tab 行(顶栏流程 tag 条已按需求移除):完成板块 tab 名带绿色 ✓
      const stepDone = {};
      if (window.Pipeline && Pipeline.calc) Pipeline.calc(p).forEach(s => { stepDone[s.key] = s.done; });
      const TAB_STEP = { 制片: 'prod', 剧本: 'script', 导演: 'director', 主体: 'subjects', 分集: 'eps', 成片库: 'film', 剧壳: 'shell', 切片: 'clips' };
      const pm = (p.shell && p.shell.prodMode) || '分镜表';
      main.innerHTML = `
      <div class="page">
        <div class="crumb" onclick="location.hash='#/projects'">‹ 返回项目管理</div>
        <div style="text-align:center;margin-bottom:6px">
          <div class="page-title" style="font-size:18px">${U.esc(p.name)}</div>
        </div>
        <div class="row" style="gap:0;border-bottom:1px solid var(--border);margin-bottom:16px;overflow-x:auto">
          <button class="btn ghost sm" onclick="location.hash='#/projects'" style="flex:none">‹</button>
          ${TABS.map(t => `<div class="tab ${tab === t ? 'active' : ''}" data-tab="${t}" style="flex:none">${t}${stepDone[TAB_STEP[t]] ? '<span style="color:var(--green);margin-left:3px">✓</span>' : ''}</div>`).join('')}
          <span style="flex:none;margin:0 6px;border-left:1px solid var(--border)"></span>
          ${pm === '一键跑批' ? '<span class="tag cyan" style="flex:none;align-self:center" title="一键跑批项目:Agent 全自动量产(创建时选定,不可修改)">🏭 一键跑批</span>' : ''}
          <span class="grow"></span>
          ${tab === '分集' ? `
          <select class="select small" data-x="sort" style="width:auto;flex:none"><option value="asc" ${asc ? 'selected' : ''}>排序:正序</option><option value="desc" ${!asc ? 'selected' : ''}>排序:倒序</option></select>
          <input class="input" data-x="search" placeholder="搜索分集名称(回车搜索)" value="${U.esc(search)}" style="width:190px;flex:none">` : ''}
        </div>
        ${tab === '导演' ? renderConcept() : tab === '剧本' ? renderScript() : tab === '分集' ? renderEpisodes(shown, eps, pages) : tab === '主体' ? '<div data-roles-host></div>' : tab === '制片' ? renderProduction() : tab === '成片库' ? ProjTabs.films.render(p) : tab === '剧壳' ? ProjTabs.shell.render(p) : tab === '切片' ? ProjTabs.clips.render(p) : ''}
      </div>`;

      main.querySelectorAll('[data-tab]').forEach(t => t.onclick = () => openTab(t.dataset.tab));
      // 「量产跑批」入口已从项目页移除(保留在分镜工作台顶部「🏭 一键跑批」与分镜表模式内)
      if (tab === '导演') bindConcept();
      if (tab === '制片') bindProduction();
      if (tab === '分集') bindEpisodes();
      if (tab === '剧壳') ProjTabs.shell.bind(p, main, render);
      if (tab === '切片') ProjTabs.clips.bind(p, main, render);
      if (tab === '剧本') bindScriptTab();
      if (tab === '主体') Views.roles(main.querySelector('[data-roles-host]'), p.id, true); // 页内嵌主体管理,顶栏不动
      // 主线步骤点击 + 下一步引导
      if (window.Pipeline) Pipeline.bind(main, p);
      // 顶部进度序列:页内展开对应界面(顶栏不动);分镜/生成直达对应分集工作区(保持默认跳转)
      const stepTab = { prod: '制片', director: '导演', subjects: '主体', eps: '分集', film: '成片库', shell: '剧壳', clips: '切片' };
      main.querySelectorAll('[data-step]').forEach(t => {
        if (t.dataset.step === 'script') t.onclick = () => {
          // 已有剧本:页内打开剧本页;首次(无剧本)才弹上传窗
          if (p.script) openTab('剧本');
          else { openTab('分集'); EpisodeUtil.openUploadScript(p, main); }
        };
        else if (t.dataset.step === 'shots') t.onclick = () => { window.__epView = 'board'; location.hash = Pipeline.hashOf(p, 'shots'); }; // 分镜 → 脚本创作层
        else if (t.dataset.step === 'gen') t.onclick = () => { window.__epView = 'cut'; location.hash = Pipeline.hashOf(p, 'gen'); }; // 剪辑 → 剪辑台(转场/合成)
        else if (stepTab[t.dataset.step]) t.onclick = () => openTab(stepTab[t.dataset.step]);
      });
      main.querySelectorAll('[data-exp]').forEach(b => b.onclick = e => {
        e.stopPropagation();
        const ep2 = p.episodes.find(x => x.id === b.dataset.exp);
        if (ep2) Exporter.dropdown(b, { p, ep: ep2 });
      });
      main.querySelectorAll('[data-playfilm]').forEach(b => b.onclick = e => {
        e.stopPropagation();
        const ep2 = p.episodes.find(x => x.id === b.dataset.playfilm);
        if (ep2) ProjTabs.films.play(p, ep2);
      });
    }

    /* ---- 分集管理内容 ---- */
    function renderEpisodes(shown, eps, pages) {
      return `
      ${p.subjects.length ? [
        ['角色', 'character', 'cyan'],
        ['场景', 'scene', 'green'],
        ['道具', 'prop', 'yellow'],
      ].map(([label, kind, color]) => {
        const arr = p.subjects.filter(s => s.kind === kind);
        return arr.length ? `
      <div class="row wrap" style="margin-bottom:10px;gap:6px">
        <span class="small muted" style="flex:none">${label}:</span>
        ${arr.slice(0, 10).map(s => `<span class="tag ${color}" data-subj="${s.id}" style="cursor:pointer" title="点击到「主体」页编辑 ${U.esc(s.name)}">${s.image ? '🖼 ' : ''}${U.esc(s.name)}</span>`).join('')}
        ${arr.length > 10 ? `<span class="small muted">等 ${arr.length} 个</span>` : ''}
      </div>` : '';
      }).join('') : ''}
      <div class="grid proj-grid">
        <div class="card dash-card">
          <div class="dash-cell" data-x="newep"><span style="font-size:22px;color:var(--accent)">＋</span><span>新建分集</span></div>
        </div>
        ${shown.map(ep => {
        /* 进度信息(EP 卡片):分镜 N 镜 / 镜头组 N 组 / 视频 x/y / 已合成;未拆镜时按剧本体量预估(约 55 字/镜、4 镜/组) */
        const shots = ep.shots || [];
        const vDone = shots.filter(s => s.video && Store.shotVideoReady(s)).length;
        const vGen = shots.filter(s => s.video && s.video.status === 'generating').length;
        const vTag = shots.length && vDone === shots.length ? 'green' : (vDone || vGen) ? 'cyan' : '';
        const estN = Math.max(2, Math.min(40, Math.round((ep.content || '').replace(/\s/g, '').length / 55) || 0));
        const gCnt = (ep.groups || []).length;
        const estG = Math.max(1, Math.round(estN / 4));
        return `
        <div class="card proj-card" data-ep="${ep.id}">
          <div class="proj-cover" style="height:110px;background:linear-gradient(135deg,hsl(${U.hashColor(ep.title)},68%,92%),hsl(${(U.hashColor(ep.title) + 40) % 360},72%,87%))">
            <div style="text-align:center"><div class="ph" style="font-size:30px">🎬</div></div>
            <button class="btn ghost sm ep-menu" data-menu="${ep.id}" style="position:absolute;top:6px;right:6px">⋯</button>
          </div>
          <div class="proj-body">
            <div class="proj-name">${U.esc(ep.title)}</div>
            <div class="proj-desc">${U.esc((ep.content || '').slice(0, 50))}${(ep.content || '').length > 50 ? '…' : ''}</div>
            <div class="row" style="margin-top:6px;justify-content:space-between">
              <span class="small muted">${(ep.content || '').length} 字</span>
              ${(ep.content || '').length > 2000 ? '<span class="tag yellow" title="单集过长可能影响生成质量,建议拆分">超 2000 字</span>' : ''}
            </div>
            <div class="row wrap" style="margin-top:8px;gap:6px">
              ${shots.length ? `<span class="tag green">分镜 ${shots.length} 镜</span>` : `<span class="tag" title="按剧本体量预估,拆镜后以实际为准">分镜 预估${estN} 镜</span>`}
              ${gCnt ? `<span class="tag purple">镜头组 ${gCnt} 组</span>` : shots.length ? '<span class="tag">镜头组 未分组</span>' : `<span class="tag" title="按约 4 镜一组预估,自动分组后以实际为准">镜头组 预估${estG} 组</span>`}
              ${shots.length ? `<span class="tag ${vTag}">视频 ${vDone}/${shots.length}</span>` : ''}
              ${Store.epComposedReady(ep) ? '<span class="tag green">已合成</span>' : (ep.composedUrl ? '<span class="tag yellow" title="合成输入已变化(调序/裁剪/换素材/改转场等),旧成片保留可看,重新合成后恢复">成片待更新</span>' : '')}
            </div>
            <div class="row" style="margin-top:8px;gap:6px">
              <button class="btn sm" data-enter="board:${ep.id}" title="分镜表模式:逐镜精修(分镜脚本/分镜视频)">📋 分镜表</button>
              <button class="btn sm" data-enter="bb:${ep.id}" title="节拍板模式:5 段式长段落量产(节拍板/镜头组)">🥁 节拍板</button>
              ${shots.length ? `<button class="btn sm primary" data-produce="${ep.id}" title="批量生成 → 智能审片 → 合成成片" style="margin-left:auto;padding:2px 10px">⚡ 一键成片</button>` : ''}
            </div>
          </div>
        </div>`;
      }).join('')}
      </div>
      ${!shown.length ? '<div class="empty"><div class="ico">📖</div><p>没有匹配的分集,点击左侧虚线卡新建分集或上传剧本</p></div>' : ''}
      <div class="row" style="justify-content:center;margin-top:22px;gap:14px">
        <span class="small muted">共 ${eps.length} 条</span>
        <span class="tag">20条/页</span>
        <button class="btn sm" data-x="prev" ${page <= 1 ? 'disabled' : ''}>‹</button>
        <span class="tag cyan">${page}</span>
        <button class="btn sm" data-x="next" ${page >= pages ? 'disabled' : ''}>›</button>
      </div>`;
    }

    function bindEpisodes() {
      main.querySelector('[data-x=newep]').onclick = () => openNewEpisode(p, main);
      // 主体分类 tag:点击跳「主体」tab 定位到该主体卡片(经 __roleFocus 传递,roles.js 消费)
      main.querySelectorAll('[data-subj]').forEach(t => t.onclick = e => {
        e.stopPropagation();
        window.__roleFocus = t.dataset.subj;
        openTab('主体');
      });
      main.querySelector('[data-x=sort]').onchange = e => { asc = e.target.value === 'asc'; render(); };
      main.querySelector('[data-x=search]').onkeydown = e => { if (e.key === 'Enter') { search = e.target.value; page = 1; render(); } };
      const pv = main.querySelector('[data-x=prev]'); if (pv) pv.onclick = () => { page--; render(); };
      const nx = main.querySelector('[data-x=next]'); if (nx) nx.onclick = () => { page++; render(); };
      main.querySelectorAll('[data-ep]').forEach(c => c.onclick = e => {
        if (e.target.closest('[data-menu]')) return;
        if (e.target.closest('[data-produce]')) return;
        if (e.target.closest('[data-enter]')) return;
        location.hash = `#/project/${p.id}/episode/${c.dataset.ep}`;
      });
      // 分镜表/节拍板双入口:写入目标视图后进入分集工作区(两个独立生成模式各自的页面)
      main.querySelectorAll('[data-enter]').forEach(b => b.onclick = e => {
        e.stopPropagation();
        const [vm, eid] = b.dataset.enter.split(':');
        const ep0 = p.episodes.find(x => x.id === eid);
        // 分镜表入口:已拆镜直达分镜视频页,未拆镜先进分镜脚本创作层
        window.__epView = vm === 'board' ? (ep0 && (ep0.shots || []).length ? 'shots' : 'board') : 'bb';
        location.hash = `#/project/${p.id}/episode/${eid}`;
      });
      // ⚡ 一键成片:跳分集工作区后自动执行 批量生成→智能审片→合成
      main.querySelectorAll('[data-produce]').forEach(b => b.onclick = e => {
        e.stopPropagation();
        const ep = p.episodes.find(x => x.id === b.dataset.produce);
        if (!ep || !window.SB || !SB.oneClickProduce) return U.toast('功能未就绪', 'error');
        location.hash = `#/project/${p.id}/episode/${ep.id}`;
        setTimeout(() => SB.oneClickProduce(p, ep, document.getElementById('main')), 500);
      });
      main.querySelectorAll('[data-menu]').forEach(b => b.onclick = e => {
        e.stopPropagation();
        const ep = p.episodes.find(x => x.id === b.dataset.menu);
        document.querySelectorAll('.cv-ctx').forEach(x => x.remove());
        const menu = document.createElement('div');
        menu.className = 'cv-ctx';
        const r = b.getBoundingClientRect();
        menu.style.left = (r.right - 140) + 'px'; menu.style.top = (r.bottom + 4) + 'px';
        menu.innerHTML = `<button data-m="rename">✏ 重命名</button><button data-m="del" style="color:var(--red)">🗑 删除</button>`;
        document.body.appendChild(menu);
        menu.querySelector('[data-m=rename]').onclick = () => {
          menu.remove();
          U.openModal({
            title: '重命名分集',
            body: `<label class="field"><span>分集标题</span><input class="input" data-f="t" value="${U.esc(ep.title)}"></label>`,
            footer: `<button class="btn primary" data-x="ok">保存</button>`,
            onMount(m2, close2) {
              m2.querySelector('[data-x=ok]').onclick = () => {
                const t = m2.querySelector('[data-f=t]').value.trim();
                if (t) { ep.title = t; Store.save(); }
                close2(); U.toast('已重命名', 'success'); render();
              };
            },
          });
        };
        menu.querySelector('[data-m=del]').onclick = async () => {
          menu.remove();
          // 在飞拦截(十一轮):本地任务 + 服务端 running jobs 合并判定(防刷新后孤儿上游任务)
          const guard = window.Tasks ? await Tasks.canDeleteScope({ episodeId: ep.id }) : { local: [], remote: [] };
          if (guard.remote == null) return U.toast('任务中心暂时不可达,无法确认是否有在途生成任务,请稍后重试', 'error');
          if (guard.local.length) return U.toast(`该分集有 ${guard.local.length} 个任务正在进行(${guard.local[0].type} 等),请等待完成后再删除`, 'error');
          if (guard.remote.length) return U.toast(`服务端仍有 ${guard.remote.length} 个生成任务在跑,请等待完成或超时后再删除`, 'error');
          if (window.__epReviewEpId === ep.id) return U.toast('该分集整集审片进行中,请等待完成或先取消审片', 'error');
          const shotCnt = (ep.shots || []).length;
          const doneCnt = (ep.shots || []).filter(s => s.video && Store.shotVideoReady(s)).length;
          U.confirm(`确定删除分集「${U.esc(ep.title)}」吗?将同时删除 ${shotCnt} 个分镜${doneCnt ? `与 ${doneCnt} 个已生成视频` : ''};已进入回收站,7 天内可恢复。`, () => {
            Store.trashPut('episode', ep.title, { projectId: p.id, ep }); // 软删除:完整快照进回收站
            p.episodes = p.episodes.filter(x => x.id !== ep.id);
            p.episodes.forEach((x, i) => x.order = i);
            Store.save(); U.toast('分集已删除,可在回收站恢复', 'success'); render();
          }, '删除');
        };
        setTimeout(() => document.addEventListener('mousedown', function h(ev) {
          if (!menu.contains(ev.target)) { menu.remove(); document.removeEventListener('mousedown', h); }
        }), 10);
      });
    }

    /* ---- 成片库 ---- */
    /* 剧壳 tab(renderShellEp/bindShellEp)已拆至 proj-shell.js(ProjTabs.shell);
     * 切片 tab(renderClips/bindClips)与成片库(renderFilms/playFilm)已拆至 proj-clips.js(ProjTabs.clips/.films)。 */

    /* ---- 🧪 实验室已迁至「百宝箱 → 项目实验台」(tools.js) ---- */

    /* ================= 📖 剧本页(页内展示;首次上传才用弹窗) ================= */
    /* 基础信息粗提取 deriveScriptMeta(p) 已拆至 episode-util.js */
    let scriptSub = '内容'; // 内容 | 围读记录 | 图谱 | 旁白稿

    function renderScript() {
      if (!p.script) return `<div class="empty"><div class="ico">📄</div><p>还没有剧本,点击下方「上传剧本」开始(支持整部剧本,txt/doc/docx/pdf)</p><button class="btn primary" data-x="script-upload" style="margin-top:14px">⬆ 上传剧本</button></div>`;
      const meta = EpisodeUtil.deriveScriptMeta(p);
      const chars = p.subjects.filter(s => s.kind === 'character');
      const readings = p.scriptReadings || [];
      const eg = p.eventGraph || [];
      return `
      <div class="tabs" style="margin-bottom:14px">
        <div class="tab ${scriptSub === '内容' ? 'active' : ''}" data-ssub="内容">📖 剧本内容</div>
        <div class="tab ${scriptSub === '围读' ? 'active' : ''}" data-ssub="围读">🔍 围读记录(${readings.length})</div>
        <div class="tab ${scriptSub === '图谱' ? 'active' : ''}" data-ssub="图谱">🧩 事件图谱${eg.length ? `(${eg.reduce((n, g) => n + g.events.length, 0)})` : ''}</div>
        <div class="tab ${scriptSub === '旁白稿' ? 'active' : ''}" data-ssub="旁白稿">🎙 旁白稿${p.episodes.some(e => e.narrationContent) ? `(${p.episodes.filter(e => e.narrationContent).length})` : ''}</div>
        <span class="grow"></span>
        <button class="btn sm" data-x="script-upload">⬆ 重新上传剧本</button>
        <button class="btn sm primary" data-x="script-reading">🔍 发起剧本围读</button>
      </div>
      ${scriptSub === '围读' ? renderReadings(readings) : scriptSub === '图谱' ? renderEventGraph(eg) : scriptSub === '旁白稿' ? renderNarration() : renderScriptContent(meta, chars)}`;
    }

    /* 章节事件图谱:每集剧情事件结构化,供拆节拍/分镜精准调用;事件可编辑 */
    function renderEventGraph(eg) {
      return `
      <div class="card" style="padding:16px;margin-bottom:14px">
        <div class="row" style="justify-content:space-between;flex-wrap:wrap;gap:8px">
          <b>🧩 章节事件图谱${eg.length ? `(共 ${eg.reduce((n, g) => n + g.events.length, 0)} 个事件)` : ''}</b>
          <button class="btn sm primary" data-x="eg-gen">${eg.length ? '↻ 重新生成' : '✨ AI 生成事件图谱'}</button>
        </div>
        <div class="hint" style="margin-top:6px">把每集剧情拆成结构化事件(谁/在哪/发生了什么/结果与钩子)。AI 拆节拍、生成分镜时按事件精准调用上下文,长剧本不丢信息。全部可编辑。</div>
      </div>
      ${eg.length ? eg.map((g, gi) => `
      <div class="card" style="padding:12px 16px;margin-bottom:10px">
        <div class="row" data-eg-fold="${gi}" style="cursor:pointer;gap:8px;align-items:center">
          <b>${U.esc(g.title)}</b><span class="tag cyan">${g.events.length} 事件</span><span class="grow"></span><span class="small muted">折叠/展开 ▾</span>
        </div>
        <div data-eg-body="${gi}" style="margin-top:8px">
          ${g.events.map((ev, ei) => `
          <div class="card" style="padding:8px 10px;margin-bottom:6px;background:var(--panel2)">
            <div class="row" style="gap:6px;margin-bottom:4px">
              <span class="tag purple" style="flex:none">E${ei + 1}</span>
              <input class="input small" data-eg="${gi}_${ei}_who" value="${U.esc(ev.who)}" placeholder="谁(人物)" style="width:150px">
              <input class="input small" data-eg="${gi}_${ei}_where" value="${U.esc(ev.where)}" placeholder="在哪(场景)" style="width:150px">
              <span class="grow"></span>
              <button class="btn ghost sm danger" data-egdel="${gi}_${ei}" title="删除该事件">✕</button>
            </div>
            <input class="input small" data-eg="${gi}_${ei}_what" value="${U.esc(ev.what)}" placeholder="发生了什么(事件)" style="margin-bottom:4px">
            <input class="input small" data-eg="${gi}_${ei}_result" value="${U.esc(ev.result)}" placeholder="结果/钩子(对后续的影响)">
          </div>`).join('')}
          <button class="btn ghost sm" data-egadd="${gi}">＋ 添加事件</button>
        </div>
      </div>`).join('') : '<div class="empty"><div class="ico">🧩</div><p>还没有事件图谱。点上方「AI 生成事件图谱」,按集自动拆解剧情事件。</p></div>'}`;
    }

    function renderScriptContent(meta, chars) {
      return `
      <div class="card" style="padding:16px;margin-bottom:14px">
        <div class="row" style="justify-content:space-between">
          <b>剧本基础信息</b>
          <button class="btn sm" data-x="script-ai">✨ AI 生成卖点/梗概/集纲</button>
        </div>
        <div class="kv" style="margin-top:10px">
          <span class="k">剧名</span><span><b>${U.esc(meta.title)}</b></span>
          ${meta.positioning ? `<span class="k">版本定位</span><span>${U.esc(meta.positioning)}</span>` : ''}
          ${meta.totalEps ? `<span class="k">总集数</span><span>${U.esc(meta.totalEps)} 集(已分集 ${p.episodes.length})</span>` : ''}
          ${meta.duration ? `<span class="k">单集时长</span><span>${U.esc(meta.duration)}</span>` : ''}
          ${meta.theme ? `<span class="k">核心命题</span><span>${U.esc(meta.theme)}</span>` : ''}
        </div>
        <label class="field" style="margin-top:10px"><span>一句话卖点(可编辑)</span>
          <input class="input" data-f="logline" value="${U.esc(meta.logline)}" placeholder="如:东方皮影照见真相 | 规则智斗清算强权"></label>
        <label class="field"><span>故事梗概${meta.synopsis ? '' : '(点「AI 生成」获取)'}</span>
          <textarea class="input" rows="3" data-f="synopsis" placeholder="故事梗概…">${U.esc(meta.synopsis)}</textarea></label>
        <label class="field" style="margin-bottom:0"><span>故事大纲${meta.outline ? '' : '(点「AI 生成」获取)'}</span>
          <textarea class="input" rows="4" data-f="outline" placeholder="起承转合的故事大纲…">${U.esc(meta.outline)}</textarea></label>
      </div>
      ${chars.length ? `
      <div class="card" style="padding:16px;margin-bottom:14px">
        <b>人物小传(${chars.length})</b>
        <div class="grid" style="grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:10px;margin-top:10px">
          ${chars.map(c => `
          <div class="card" style="padding:10px;background:var(--panel2)">
            <div class="row" style="gap:8px;align-items:center">
              ${c.image ? `<img src="${U.thumb(c.image)}" style="width:40px;height:40px;border-radius:8px;object-fit:cover;flex:none">` : '<div style="width:40px;height:40px;border-radius:8px;background:var(--bg2);flex:none"></div>'}
              <b>${U.esc(c.name)}</b>
            </div>
            <div class="small muted" style="margin-top:6px;line-height:1.7">${U.esc(c.persona ? Object.values(c.persona).filter(Boolean).join('·').slice(0, 90) : (c.description || c.evidence || '').slice(0, 90)) || '暂无小传'}</div>
          </div>`).join('')}
        </div>
      </div>` : ''}
      <div class="card" style="padding:16px;margin-bottom:14px">
        <div class="row" style="justify-content:space-between">
          <b>集纲(${p.episodes.length} 集)</b>
          ${!p.episodes.length && p.script ? '<button class="btn sm primary" data-x="dosplit">⚙ 解析分集(生成每集正文)</button>' : ''}
        </div>
        <div style="margin-top:8px">
          ${p.episodes.length ? p.episodes.map((e, i) => `
          <div class="row" style="gap:8px;padding:6px 0;border-bottom:1px dashed var(--border2);align-items:baseline">
            <span class="tag cyan" style="flex:none">${i + 1}</span>
            <input class="input small" data-eoutline="${i}" style="flex:1" value="${U.esc((p.epOutline && p.epOutline[i]) || '')}" placeholder="${U.esc((e.content || '').split(/\n/)[0].slice(0, 50) || '本集一句话集纲…')}">
            <span class="small muted" style="flex:none">${(e.content || '').length} 字</span>
          </div>`).join('') : `<div class="hint">${p.script ? '尚未分集:点上方「解析分集」按剧情拆分剧本,自动产出每集正文与集纲' : '上传剧本并分集后,这里会列出每集集纲(可直接编辑,失焦即存)'}</div>`}
        </div>
      </div>
      <div class="card" style="padding:16px">
        <div class="row" style="justify-content:space-between">
          <b>每集正文(可编辑,失焦即存)</b>
          ${!p.episodes.length && p.script ? '<button class="btn sm primary" data-x="dosplit">⚙ 解析分集(生成每集正文)</button>' : ''}
        </div>
        ${p.episodes.map((e, i) => `
        <div style="margin-top:12px">
          <div class="row" style="gap:8px;margin-bottom:4px">
            <span class="tag purple">${U.esc(e.title)}</span>
            <span class="small muted">${(e.content || '').length} 字</span>
            <span class="grow"></span>
            <button class="btn sm" data-narr-rewrite="${e.id}" title="消耗 2 积分,把本集正文改写为旁白解说体剧本(不改动原正文)">🎙 改写为旁白型</button>
          </div>
          <textarea class="input small" rows="4" data-epcontent="${e.id}" style="font-size:12.5px;line-height:1.8">${U.esc(e.content || '')}</textarea>
        </div>`).join('') || '<div class="hint" style="margin-top:8px">尚未分集</div>'}
      </div>`;
    }

    /* 旁白稿二级页:旁白解说体剧本,供解说模式项目使用;改写不改动原正文 */
    function renderNarration() {
      const done = p.episodes.filter(e => e.narrationContent);
      const todo = p.episodes.filter(e => !e.narrationContent);
      return `
      <div class="card" style="padding:16px;margin-bottom:14px">
        <b>🎙 旁白稿(${done.length}/${p.episodes.length} 集)</b>
        <div class="hint" style="margin-top:6px">旁白解说体剧本供解说模式项目使用:以第三人称旁白转述剧情与台词。「改写为旁白型」不改动原正文,可随时回到「内容」页继续编辑。</div>
      </div>
      ${done.length ? done.map(e => `
      <div class="card" style="padding:14px 16px;margin-bottom:10px">
        <div class="row" style="gap:8px;margin-bottom:6px;flex-wrap:wrap">
          <span class="tag purple" style="flex:none">${U.esc(e.title)}</span>
          <span class="small muted">${(e.narrationContent || '').length} 字</span>
          <span class="grow"></span>
          <button class="btn sm" data-narr-rewrite="${e.id}" title="按当前正文重新改写,覆盖现有旁白稿">↻ 从正文重新改写</button>
          <button class="btn sm" data-narr-export="${e.id}">⬇ 导出 .txt</button>
          <button class="btn sm ghost danger" data-narr-clear="${e.id}">🗑 清除旁白稿</button>
        </div>
        <textarea class="input small" rows="6" data-narrcontent="${e.id}" style="font-size:12.5px;line-height:1.8">${U.esc(e.narrationContent)}</textarea>
      </div>`).join('') : '<div class="empty"><div class="ico">🎙</div><p>暂无旁白稿,到「内容」页点「🎙 改写为旁白型」生成</p></div>'}
      ${todo.length && done.length ? `
      <div class="card" style="padding:12px 16px;margin-bottom:10px">
        <div class="row" data-narr-fold style="cursor:pointer;gap:8px;align-items:center">
          <b>未生成分集(${todo.length})</b><span class="grow"></span><span class="small muted">折叠/展开 ▾</span>
        </div>
        <div data-narr-foldbody style="display:none;margin-top:8px">
          ${todo.map(e => `
          <div class="row" style="gap:8px;padding:6px 0;border-bottom:1px dashed var(--border2);align-items:center">
            <span class="tag cyan" style="flex:none">${U.esc(e.title)}</span>
            <span class="small muted" style="flex:1">${(e.content || '').length} 字正文</span>
            <button class="btn sm" data-narr-rewrite="${e.id}">🎙 改写为旁白型</button>
          </div>`).join('')}
        </div>
      </div>` : ''}`;
    }

    /* 把单集正文改写为旁白解说体剧本(消耗 2 积分,失败退费);不改动原正文,结果存 ep.narrationContent */
    function rewriteNarration(ep, btn) {
      if (!(ep.content || '').trim()) return U.toast(ep.title + ' 正文为空,请先在「内容」页写正文', 'error');
      if (!API.isReady()) return U.toast('改写为旁白型需要真实 LLM,请先配置/登录后端', 'error', 3500);
      U.confirm(`将把「${ep.title}」正文改写为旁白解说体剧本(第三人称旁白转述,剧情节点与分集结构不变),消耗 2 积分。${ep.narrationContent ? '\n该集已有旁白稿,改写将覆盖现有内容。' : ''}确定改写吗?`, async () => {
        // 统一五件套:登记→扣费→执行→失败退费(原为裸 U.charge,无任务登记,任务监控不可对账)
        const tk = Tasks.start({ type: '旁白改写', model: 'LLM', target: ep.title, cost: 2, projectId: p.id, episodeId: ep.id });
        if (!U.charge(2, '改写为旁白型剧本', tk.id)) { Tasks.fail(tk, '积分不足'); return; }
        const label = btn ? btn.innerHTML : '';
        if (btn) { btn.disabled = true; btn.innerHTML = '<span class="spinner"></span> 改写中…'; }
        try {
          const out = await API.chatJSON({
            model: (Store.state.settings || {}).defLLM || API.getConfig().model,
            system: '你是资深短剧解说编剧,擅长把短剧剧本改写成旁白解说体(解说模式)。',
            billingAction: 'llm.narration', operationId: tk.id,
            messages: [{ role: 'user', content: `把以下短剧单集剧本改写为旁白解说体剧本,返回 JSON {"narration":"改写后的旁白稿全文"}。
要求:以第三人称旁白叙述为主;保留全部剧情节点与关键信息(不遗漏转折与钩子);角色台词转化为旁白转述(如"他怒吼着让她滚开"而非直接引用对白);分集结构不变,仍是这一集的完整内容;语言口语流畅,适合配音解说。
集标题:${ep.title}
剧本正文:
${(ep.content || '').slice(0, 8000)}` }],
            temperature: 0.5, max_tokens: 6000,
          });
          const narration = String(out && out.narration || '').trim();
          if (!narration) throw new Error('返回为空');
          ep.narrationContent = narration;
          Store.save();
          Tasks.done(tk, { filename: `${ep.title}_旁白稿.txt`, text: narration });
          U.toast(ep.title + ' 旁白稿已生成,可到「剧本 → 旁白稿」查看', 'success', 3500);
          render();
        } catch (e) {
          U.refund(2, '改写为旁白型剧本失败:' + (e.message || '未知错误'));
          Tasks.fail(tk, e.message);
          U.toast('改写失败:' + e.message + '(已退回 2 积分)', 'error', 3500);
          if (btn) { btn.disabled = false; btn.innerHTML = label; }
        }
      });
    }

    /* ================= 💡 构思(导演定调) =================
     * AI 导演对剧本解析后的整体创作思考:在主体/分镜生成前完成定调,
     * 保存后可注入生成链路(conceptInject)。结构参考导演阐述(Director's Treatment)实践:
     * 定调陈述 → 核心定位 → 视觉定调 → 画幅平台 → 叙事节奏 → 表演声音 → 落地约束 */
    function conceptOf() {
      p.concept = p.concept || {};
      return p.concept;
    }
    function renderConcept() {
      const c = conceptOf();
      const RATIOS = ['16:9', '9:16', '1:1'];
      const PLATFORMS = ['抖音', '快手', '红果', '视频号', 'TikTok(出海)', '其他'];
      const field = (k, label, ph, rows) => `<label class="field" style="margin-bottom:8px"><span>${label}</span>
        ${rows ? `<textarea class="input small" rows="${rows}" data-cf="${k}" placeholder="${ph}">${U.esc(c[k] || '')}</textarea>`
          : `<input class="input small" data-cf="${k}" value="${U.esc(c[k] || '')}" placeholder="${ph}">`}</label>`;
      return `
      <div class="card" style="padding:18px;margin-bottom:14px;border-color:var(--accent)">
        <div class="row" style="justify-content:space-between;flex-wrap:wrap;gap:8px">
          <b>🎬 导演 · 创作定调</b>
          <div class="row" style="gap:8px">
            <button class="btn sm primary" data-x="cc-gen">✨ AI 生成构思(读剧本出定调,-1积分)</button>
            <button class="btn sm" data-x="cc-save">💾 保存定调</button>
          </div>
        </div>
        <div class="hint" style="margin:6px 0 10px">在生成主体图与分镜视频之前,先完成本剧的整体创作定调;保存后自动注入后续生成链路(可随时关闭注入)。</div>
        <label class="field" style="margin-bottom:0"><span>🎬 导演阐述(一句话定调,全片的创作原点)</span>
          <textarea class="input" rows="2" data-cf="statement" placeholder="如:用东方皮影的诡谲美学,讲一个底层小人物以智取胜的复仇爽剧">${U.esc(c.statement || '')}</textarea></label>
      </div>
      <div class="dash-cols" style="margin-bottom:14px">
        <div class="card" style="padding:16px">
          <b>🎯 核心定位</b>
          <div style="margin-top:10px">
            ${field('positioning', '题材定位', '如:古装悬疑复仇 / 都市甜宠')}
            ${field('audience', '目标受众', '如:18-35 岁女性,下沉市场爽剧受众')}
            ${field('reference', '美学参考(作品/美学参照)', '如:快节奏复仇剧的叙事节奏 + 皮影戏的剪影美学', 2)}
          </div>
        </div>
        <div class="card" style="padding:16px">
          <b>🎨 视觉定调</b>
          <div style="margin-top:10px">
            <label class="field" style="margin-bottom:8px"><span>项目风格(画面风格,注入所有生成;新建项目默认漫剧)</span>
              <div class="model-row">${['漫剧', '动漫', '写实'].map(st2 => `<div class="model-opt ${(c.styleMain || p.style || '漫剧') === st2 ? 'sel' : ''}" data-cpstyle="${st2}">${st2}</div>`).join('')}</div></label>
            <label class="field" style="margin-bottom:8px"><span>生产模式</span>
              <div class="small muted">默认剧情模式(重台词表演);需解说剧(重旁白)请到「偏好学习 → 专家雇佣」雇佣「🎙️ 出海解说剧导演」</div></label>
            ${field('artStyle', '美术风格(叠加在项目风格之上)', '如:漫剧,日系唯美,线条流畅,色彩明快')}
            <label class="field" style="margin-bottom:8px"><span>影调(保存后写入项目影调,注入生成)</span>
              <div class="model-row wrap">${(window.TONE_PRESETS || ['无']).map(t => `<div class="model-opt ${(c.palette || p.tone || '无') === t ? 'sel' : ''}" data-cptone="${t}">${t}</div>`).join('')}</div></label>
            ${field('lighting', '光影基调', '如:高对比低调光,关键情绪点聚光;夜戏冷蓝、回忆暖黄', 2)}
          </div>
        </div>
      </div>
      <div class="dash-cols" style="margin-bottom:14px">
        <div class="card" style="padding:16px">
          <b>📐 画幅与平台</b>
          <div style="margin-top:10px">
            <label class="field" style="margin-bottom:8px"><span>画幅(保存后同步为本集分镜合成比例)</span>
              <div class="model-row">${RATIOS.map(r => `<div class="model-opt ${(c.ratio || '16:9') === r ? 'sel' : ''}" data-cpratio="${r}">${r}</div>`).join('')}</div></label>
            <label class="field" style="margin-bottom:8px"><span>发布平台</span>
              <div class="model-row wrap">${PLATFORMS.map(x => `<div class="model-opt ${(c.platform || '') === x ? 'sel' : ''}" data-cpplatform="${x}">${x}</div>`).join('')}</div></label>
            ${field('epDur', '单集时长目标', '如:60-90 秒 / 2 分钟')}
          </div>
        </div>
        <div class="card" style="padding:16px">
          <b>✂ 叙事与剪辑节奏</b>
          <div style="margin-top:10px">
            ${field('editPace', '整体剪辑节奏', '如:前 3 秒强钩子,中段快切,高潮长镜,结尾戛然而止留卡点', 2)}
            ${field('hookSec', '开场钩子时长', '如:前 3 秒必须抛出悬念/冲突')}
            ${field('epStruct', '单集结构', '如:钩子→铺垫→反转→卡点;每集结尾留悬念', 2)}
            ${field('emotion', '情绪总谱', '如:压抑→蓄力→爆发→释然,逐集抬升', 2)}
          </div>
        </div>
      </div>
      <div class="dash-cols" style="margin-bottom:14px">
        <div class="card" style="padding:16px">
          <b>🎭 表演与声音定调</b>
          <div style="margin-top:10px">
            ${field('performance', '表演气质', '如:克制内敛,眼神与停顿传递信息;反派外放夸张', 2)}
            ${field('voiceMusic', '配音与音乐音效基调', '如:旁白冷静旁观感;配乐以氛围电子为主,高潮转鼓点', 2)}
          </div>
        </div>
        <div class="card" style="padding:16px">
          <b>🔒 落地约束(生成侧执行标准)</b>
          <div style="margin-top:10px">
            ${field('density', '分镜密度', '如:紧凑(每 2-3 句一镜)/ 舒展(每场 3-5 镜)')}
            ${field('maxShot', '单镜时长上限', '如:单镜 ≤ 5 秒,长镜头仅高潮用')}
            ${field('continuity', '一致性约束', '如:主体全程锁定参考图;相邻镜头首尾帧衔接;同场景光线方向一致', 2)}
          </div>
        </div>
      </div>
      <div class="card" style="padding:12px 18px">
        <div class="check-line" data-x="cc-inject"><span class="switch ${c.inject !== false ? 'on' : ''}"></span><span class="small">注入后续生成链路(分镜/主体生成提示词自动携带本定调)</span></div>
      </div>`;
    }

    function bindConcept() {
      const c = conceptOf();
      // 文本域即改即存(失焦)
      main.querySelectorAll('[data-cf]').forEach(el => el.onchange = () => { c[el.dataset.cf] = el.value; Store.save(); U.toast('已保存', 'success', 900); });
      // 点选类(影调/画幅/平台)
      main.querySelectorAll('[data-cptone]').forEach(o => o.onclick = () => { c.palette = o.dataset.cptone; main.querySelectorAll('[data-cptone]').forEach(x => x.classList.toggle('sel', x === o)); });
      main.querySelectorAll('[data-cpratio]').forEach(o => o.onclick = () => { c.ratio = o.dataset.cpratio; main.querySelectorAll('[data-cpratio]').forEach(x => x.classList.toggle('sel', x === o)); });
      main.querySelectorAll('[data-cpplatform]').forEach(o => o.onclick = () => { c.platform = o.dataset.cpplatform; main.querySelectorAll('[data-cpplatform]').forEach(x => x.classList.toggle('sel', x === o)); });
      main.querySelectorAll('[data-cpstyle]').forEach(o => o.onclick = () => { c.styleMain = o.dataset.cpstyle; main.querySelectorAll('[data-cpstyle]').forEach(x => x.classList.toggle('sel', x === o)); });
      // 注入开关
      const inj = main.querySelector('[data-x=cc-inject]');
      if (inj) inj.onclick = () => { c.inject = c.inject === false; Store.save(); inj.querySelector('.switch').classList.toggle('on', c.inject !== false); };
      // 保存:同步影调/画幅到真实项目字段
      main.querySelector('[data-x=cc-save]').onclick = () => {
        main.querySelectorAll('[data-cf]').forEach(el => { c[el.dataset.cf] = el.value; });
        if (c.palette) p.tone = c.palette;
        if (c.styleMain) p.style = c.styleMain;
        if (c.ratio) p.episodes.forEach(e => { e.sbConfig = Object.assign(window.SB && SB.defaultSBConfig ? SB.defaultSBConfig(p) : {}, e.sbConfig || {}, { ratio: c.ratio }); });
        c.time = Store.now();
        Store.save();
        U.toast('构思定调已保存' + (c.palette ? ',影调已更新' : '') + (c.ratio ? ',分镜合成比例已同步 ' + c.ratio : ''), 'success', 3200);
      };
      // AI 生成构思(八轮计费贯通:1 积分/次,失败退费;服务端 llm.agent 白名单计费,任务 id 作 operationId)
      main.querySelector('[data-x=cc-gen]').onclick = async () => {
        if (!p.script) return U.toast('请先上传剧本(剧本页)', 'error', 3000);
        if (!API.isReady()) return U.toast('AI 生成构思需要真实 LLM(请登录后端)', 'error', 3000);
        const btn = main.querySelector('[data-x=cc-gen]');
        btn.disabled = true; btn.innerHTML = '<span class="spinner"></span> AI 导演定调中…';
        const tk = Tasks.start({ type: 'AI 构思定调', model: 'LLM', target: p.name, cost: 1, projectId: p.id });
        if (!U.charge(1, 'AI 生成构思', tk.id)) { Tasks.fail(tk, '积分不足'); btn.disabled = false; btn.textContent = '✨ AI 生成构思(读剧本出定调,-1积分)'; return; }
        try {
          const out = await API.chatJSON({
            model: (Store.state.settings || {}).defLLM || API.getConfig().model,
            system: '你是资深短剧/漫剧导演,在项目开拍前做导演阐述(Director Treatment)。',
            messages: [{ role: 'user', content: `通读以下短剧剧本信息,为这部剧做开拍前的整体创作定调,返回 JSON:
{"statement":"导演阐述(一句话定调,有美学主张)","positioning":"题材定位","audience":"目标受众","reference":"美学参考(作品/美学)","artStyle":"美术风格(具体可执行)","palette":"影调(从 ${(window.TONE_PRESETS || []).join('/')} 中选最贴合的一个)","lighting":"光影基调","ratio":"画幅(16:9 或 9:16 或 1:1,按发布平台惯用)","platform":"发布平台(抖音/快手/红果/视频号/TikTok(出海))","epDur":"单集时长目标","editPace":"整体剪辑节奏","hookSec":"开场钩子时长","epStruct":"单集结构","emotion":"情绪总谱","performance":"表演气质","voiceMusic":"配音与音乐音效基调","density":"分镜密度","maxShot":"单镜时长上限","continuity":"一致性约束"}
要求:具体可执行、风格统一、贴合剧本题材;所有字段为中文短句。
项目风格:${p.style}(${window.projType && projType() === 'narration' ? '解说模式(重旁白叙述,出海解说剧导演雇佣中)' : '剧情模式(重台词表演)'})${p.globalSetting ? ';全局设定:' + p.globalSetting : ''}
一句话卖点:${(p.scriptMeta && p.scriptMeta.logline) || '(无)'}
剧本节选:${(p.script || '').slice(0, 5000)}` }],
            temperature: 0.6, max_tokens: 4000,
            billingAction: 'llm.agent', operationId: tk.id,
          });
          if (!out || !out.statement) throw new Error('LLM 返回结构不完整');
          ['statement', 'positioning', 'audience', 'reference', 'artStyle', 'palette', 'lighting', 'ratio', 'platform', 'epDur', 'editPace', 'hookSec', 'epStruct', 'emotion', 'performance', 'voiceMusic', 'density', 'maxShot', 'continuity']
            .forEach(k => { if (out[k] !== undefined) c[k] = String(out[k]); });
          c.time = Store.now();
          Store.save();
          Tasks.done(tk);
          U.toast('AI 构思已生成,请审阅后「保存定调」生效', 'success', 3000);
          render();
        } catch (e) {
          U.refund(1, 'AI 生成构思失败退费', tk.id);
          Tasks.fail(tk, e.message);
          U.toast('AI 生成构思失败:' + e.message, 'error', 3500);
          btn.disabled = false; btn.textContent = '✨ AI 生成构思(读剧本出定调,-1积分)';
        }
      };
    }

    /* ================= 🎬 制片(制片总表/连场组/服装连续性/道具清单/角色统计/光影总控) =================
     * 数据自动派生:场次=分镜脚本层 scriptBoard;角色/道具=主体名文本匹配;进度=分镜视频状态;光影=AI 按场景生成(走构思定调) */
    let prodSub = '智能体'; // 智能体 | 总表 | 连场组 | 服装 | 道具 | 角色 | 光影
    function prodState() { p.production = p.production || { lightCtl: {}, costumeNotes: {}, sceneNotes: {} }; return p.production; }

    function prodRows() {
      const chars = p.subjects.filter(s => s.kind === 'character').map(s => s.name);
      const propNames = p.subjects.filter(s => s.kind === 'prop').map(s => s.name);
      const rows = [];
      p.episodes.forEach(ep => {
        const bd = ep.scriptBoard && ep.scriptBoard.scenes ? ep.scriptBoard : (window.SB && SB.deriveBoard ? SB.deriveBoard(ep) : { scenes: [] });
        bd.scenes.forEach((sc, si) => {
          const all = [sc.title, sc.text, ...sc.beats.map(b2 => (b2.plot || '') + ' ' + (b2.shot || ''))].join(' ');
          // 场号/场景/日夜/内外:兼容「1-1 现代老宅戏台 夜/内」与「第X集…」标题
          const m = sc.title.match(/^(\d+[-–]\d+)\s+(.+?)(?:\s+(日|夜|晚|晨|黄昏)[\/／](内|外))?$/) || [];
          const code = m[1] || (ep.title + '-' + (si + 1));
          const loc = (m[2] || sc.title || '').trim();
          const dayNight = m[3] || ((/夜|晚/.test(sc.title) ? '夜' : /晨|黄昏/.test(sc.title) ? '晨昏' : '日'));
          const inOut = m[4] || '内';
          const shotsIn = ep.shots.filter(s => s.scene && (loc.includes(s.scene) || s.scene.includes(loc)));
          const vDone = shotsIn.filter(s => s.video && Store.shotVideoReady(s)).length;
          rows.push({
            ep, epId: ep.id, si, code, loc, dayNight, inOut,
            chars: chars.filter(n => all.includes(n)),
            props: propNames.filter(n => all.includes(n)),
            point: ((sc.beats[0] && (sc.beats[0].plot || sc.beats[0].shot)) || sc.text || '').slice(0, 60),
            shotCnt: shotsIn.length, vDone,
            key: ep.id + '_' + si,
          });
        });
      });
      return rows;
    }

    function renderProduction() {
      const rows = prodRows();
      const ps = prodState();
      const totalShots = p.episodes.reduce((n, e) => n + e.shots.length, 0);
      const doneShots = p.episodes.reduce((n, e) => n + e.shots.filter(s => s.video && Store.shotVideoReady(s)).length, 0);
      // 连场组:同 场景+日夜 的相邻场次归并(集中拍摄/生成)
      const groups = [];
      rows.forEach(r => {
        const key = r.loc + '|' + r.dayNight;
        const last = groups[groups.length - 1];
        if (last && last.key === key) last.rows.push(r);
        else groups.push({ key, name: r.loc + ' ' + r.dayNight + '连场', rows: [r] });
      });
      // 道具清单:道具主体 → 涉及场次
      const propMap = {};
      p.subjects.filter(s => s.kind === 'prop').forEach(s2 => { propMap[s2.name] = []; });
      rows.forEach(r => r.props.forEach(n => { if (propMap[n]) propMap[n].push(r.code); }));
      // 角色统计:出现场数
      const charStat = p.subjects.filter(s => s.kind === 'character').map(s2 => ({
        name: s2.name, cnt: rows.filter(r => r.chars.includes(s2.name)).length,
      })).sort((a, b) => b.cnt - a.cnt);
      const maxChar = charStat.length ? charStat[0].cnt : 1;

      const SUBS = [['概况', '📋 项目概况'], ['智能体', '🤖 智能体分工'], ['总表', '📋 制片总表'], ['连场组', '🔗 连场组'], ['服装', '👗 服装连续性'], ['道具', '🧰 道具清单'], ['角色', '👤 角色统计'], ['光影', '💡 光影总控']];
      let bodyHtml = '';

      if (prodSub === '概况') {
        /* 项目概况(剧壳基础信息):新建项目时填写,这里可查可改;失焦即存 */
        const sh = p.shell = p.shell || {};
        const PLATFORMS2 = ['抖音', '快手', '红果', '视频号', 'TikTok(出海)', '其他'];
        const LANGS2 = ['中文', 'English', '日韩语', '其他小语种'];
        const chip = (kind, cur, list) => `<div class="model-row wrap">${list.map(x => `<div class="model-opt ${cur === x ? 'sel' : ''}" data-ov="${kind}" data-v="${x}">${x}</div>`).join('')}</div>`;
        bodyHtml = `
        <div class="card" style="padding:16px;margin-bottom:14px">
          <div class="row" style="justify-content:space-between;flex-wrap:wrap;gap:8px;margin-bottom:10px">
            <b>📋 项目概况(剧壳基础信息)</b>
            <span class="small muted">创建于 ${U.esc(p.createdAt || '-')} · 全部可改,失焦即存</span>
          </div>
          <div class="grid" style="grid-template-columns:1fr 1fr;gap:12px 20px">
            <label class="field"><span>剧名</span><input class="input" data-sh="name" value="${U.esc(p.name)}"></label>
            <label class="field"><span>项目负责人</span><input class="input" data-sh="owner" value="${U.esc(sh.owner || '')}"></label>
          </div>
          <label class="field"><span>简介</span><textarea class="input" rows="2" data-sh="desc">${U.esc(p.desc || '')}</textarea></label>
          <label class="field"><span>核心卖点</span><input class="input" data-sh="selling" value="${U.esc(sh.selling || '')}" placeholder="如:皮影照妖×契约复仇,3 秒一个钩子"></label>
          <label class="field"><span>目标受众</span><input class="input" data-sh="audience" value="${U.esc(sh.audience || '')}" placeholder="如:18-35 岁女性,下沉市场爽剧受众"></label>
          <div class="grid" style="grid-template-columns:1fr 1fr 1fr;gap:12px 16px">
            <label class="field"><span>立项日期</span><input class="input" type="date" data-sh="startDate" value="${U.esc(sh.startDate || '')}"></label>
            <label class="field"><span>交片日期</span><input class="input" type="date" data-sh="dueDate" value="${U.esc(sh.dueDate || '')}"></label>
            <label class="field"><span>关键时间节点</span><input class="input" data-sh="milestones" value="${U.esc(sh.milestones || '')}" placeholder="如:围读 8/20 · 定稿 8/25"></label>
          </div>
          <label class="field"><span>面向发行平台</span>${chip('platform', sh.platform || '抖音', PLATFORMS2)}</label>
          <label class="field"><span>基础语言</span>${chip('lang', sh.lang || '中文', LANGS2)}</label>
          <label class="field"><span>制作模式(创建时选定,不可修改)</span><div><span class="tag cyan">${sh.prodMode === '一键跑批' ? '🏭 一键跑批' : '📋 标准工作区'}</span></div></label>
          <div class="row" style="gap:14px;align-items:flex-end">
            <label class="field" style="margin-bottom:0"><span>封面</span>
              <div class="dropzone" data-x="ovcover" style="padding:10px">${p.cover ? `<img src="${U.thumb(p.cover)}" style="max-height:64px;border-radius:6px">` : '点击上传封面'}</div>
            </label>
            <span class="small muted">项目风格/影调/节奏等创作定调在「导演」页;场次与生产管理见右侧各子页。</span>
          </div>
        </div>`;
      } else if (prodSub === '智能体') {
        /* 智能体分工看板:每个功能板块一个 Agent,人+板块 Agent 协作完成 生成→审核→定稿;阶段与审核意见落 p.boards */
        p.boards = p.boards || {};
        if (p.boards['构思']) { p.boards['导演'] = Object.assign({}, p.boards['构思']); delete p.boards['构思']; Store.save(); } // 板块改名迁移
        const totalShots2 = p.episodes.reduce((n, e) => n + e.shots.length, 0);
        const vDone2 = p.episodes.reduce((n, e) => n + e.shots.filter(s => s.video && Store.shotVideoReady(s)).length, 0);
        const finalCnt = p.episodes.reduce((n, e) => n + e.shots.filter(s => s.final).length, 0);
        const composedCnt = p.episodes.filter(e => Store.epComposedReady(e)).length; // 统一就绪判定(七轮:输入变化/模拟合成的集不计入)
        const subjImg = p.subjects.filter(s => s.image).length;
        const progressOf = {
          导演: p.concept && p.concept.statement ? '已定调 · ' + (p.concept.time || '') : '未定调(先去导演页定调)',
          剧本: p.script ? `已上传 · ${(p.scriptReadings || []).length} 次围读 · ${(p.eventGraph || []).reduce((n, g) => n + g.events.length, 0)} 事件` : '未上传剧本',
          主体: `${subjImg}/${p.subjects.length} 主体已出图`,
          分集: `${p.episodes.length} 集 · ${p.episodes.filter(e => (e.content || '').trim()).length} 集有正文`,
          分镜: `${totalShots2} 镜 · ${finalCnt} 镜定稿`,
          生成: `${vDone2}/${totalShots2} 已出片`,
          成片: `${composedCnt}/${p.episodes.length} 集已合成`,
        };
        bodyHtml = `
        <div class="card" style="padding:10px 14px;margin-bottom:10px"><span class="small muted">每个板块由专属智能体负责:点「💬 协作」与该板块 Agent 对话推进;阶段与审核意见随项目留存;板块记忆自动沉淀,越用越懂你。</span></div>
        ${(window.AGENT_BOARDS || []).map((b2, bi) => {
          const bd = p.boards[b2.key] || {};
          // 上游状态链(定稿传导可视化):展示本板块之前各环节的阶段
          const ups = (window.AGENT_BOARDS || []).slice(0, bi);
          const upsHtml = ups.length ? `<div class="row wrap" style="gap:4px;margin-bottom:6px;align-items:center">
            <span class="small muted" style="flex:none">上游:</span>
            ${ups.map(u2 => {
              const st2 = (p.boards[u2.key] || {}).stage || '未开始';
              const cls = st2 === '已定稿' ? 'green' : st2 === '进行中' || st2 === '待审核' ? 'yellow' : '';
              return `<span class="tag ${cls}" style="font-size:10px" title="${u2.key} · ${u2.agent}">${st2 === '已定稿' ? '✓ ' : ''}${u2.key}</span>`;
            }).join('')}
            ${ups.every(u2 => (p.boards[u2.key] || {}).stage === '已定稿') ? '<span class="tag green" style="font-size:10px">上游全部定稿,可安全定稿本板块</span>' : ''}
          </div>` : '';
          return `
        <div class="card" style="padding:14px 16px;margin-bottom:10px">
          ${upsHtml}
          <div class="row" style="gap:10px;align-items:center;flex-wrap:wrap">
            <span style="font-size:20px">${b2.ico}</span>
            <b>${b2.key}</b>
            <span class="tag purple">${b2.agent}</span>
            <span class="small muted">${U.esc(progressOf[b2.key] || '')}</span>
            <span class="grow"></span>
            <select class="select small" data-bstage="${b2.key}" style="width:auto;padding:3px 8px">
              ${['未开始', '进行中', '待审核', '已定稿'].map(st2 => `<option ${bd.stage === st2 ? 'selected' : ''}>${st2}</option>`).join('')}
            </select>
            <button class="btn sm primary" data-bchat="${b2.key}">💬 协作</button>
          </div>
          <div class="row" style="gap:8px;margin-top:8px;align-items:center">
            <span class="small muted" style="flex:none">审核意见:</span>
            <input class="input small grow" data-bnote="${b2.key}" value="${U.esc(bd.note || '')}" placeholder="该板块的审核意见/修改要求(失焦即存)">
            ${bd.time ? `<span class="small muted" style="flex:none">${U.esc(bd.time)}</span>` : ''}
          </div>
          <div class="row" style="gap:8px;margin-top:8px;align-items:center">
            <span class="small muted" style="flex:none">板块专家:</span>
            <select class="select small" data-bexpert="${b2.key}" style="width:auto;padding:3px 8px">
              <option value="">不雇佣(板块 Agent 默认能力)</option>
              ${(window.allExperts ? allExperts() : (window.EXPERT_DIRECTORS || [])).map(e => `<option value="${e.id}" ${bd.expert === e.id ? 'selected' : ''}>${e.ico} ${e.name}${e.kind === 'function' ? '(功能)' : ''}</option>`).join('')}
            </select>
            ${bd.expert ? `<span class="tag green" style="font-size:10px">已雇佣:${U.esc(((window.allExperts ? allExperts() : (window.EXPERT_DIRECTORS || [])).find(e => e.id === bd.expert) || {}).name || '')}</span>` : '<span class="small muted">雇佣后本板块 Agent 获得该专家人设与能力</span>'}
          </div>
        </div>`; }).join('')}`;
      } else if (prodSub === '总表') {
        bodyHtml = `
        <div class="card" style="padding:10px 14px;margin-bottom:10px"><span class="small muted">每行=一个可生产单元(集-场);光影色调来自「光影总控」(可按场景 AI 生成);备注可编辑,失焦即存。</span></div>
        <div style="overflow-x:auto"><table class="tbl"><thead><tr>
          <th>场次</th><th>场景</th><th>内外</th><th>日夜</th><th>角色</th><th>道具</th><th>剧情/调度要点</th><th>光影色调</th><th>分镜进度</th><th>备注</th>
        </tr></thead><tbody>
        ${rows.map(r => {
          const lc = ps.lightCtl[r.loc];
          return `<tr>
          <td style="white-space:nowrap"><span class="tag cyan" style="font-size:10px">${U.esc(r.ep.title)}</span> ${U.esc(r.code)}</td>
          <td>${U.esc(r.loc)}</td>
          <td>${r.inOut}</td><td>${r.dayNight}</td>
          <td class="small">${r.chars.map(n => U.esc(n)).join('、') || '—'}</td>
          <td class="small">${r.props.map(n => U.esc(n)).join('、') || '—'}</td>
          <td class="small muted" title="${U.esc(r.point)}">${U.esc(r.point.slice(0, 24))}${r.point.length > 24 ? '…' : ''}</td>
          <td class="small">${lc ? lc.palette.map(h2 => `<span class="tag" style="font-size:10px" title="${U.esc(h2)}"><i style="display:inline-block;width:9px;height:9px;border-radius:2px;background:${U.esc(h2)};margin-right:3px"></i>${U.esc(h2)}</span>`).join('') : '<span class="muted small">未生成</span>'}</td>
          <td style="white-space:nowrap">${r.shotCnt ? `${r.vDone}/${r.shotCnt} 镜` : '<span class="muted small">未拆镜</span>'}${r.shotCnt && r.vDone === r.shotCnt ? ' <span class="tag green" style="font-size:10px">齐</span>' : ''}</td>
          <td><input class="input small" data-pnote="${r.key}" value="${U.esc(ps.sceneNotes[r.key] || '')}" placeholder="备注" style="min-width:90px;padding:2px 6px"></td>
        </tr>`; }).join('') || '<tr><td colspan="10" class="muted" style="text-align:center;padding:20px">暂无场次数据(请先在分镜脚本层做 AI 拆解)</td></tr>'}
        </tbody></table></div>`;
      } else if (prodSub === '连场组') {
        bodyHtml = `<div class="card" style="padding:10px 14px;margin-bottom:10px"><span class="small muted">同场景同日夜的相邻场次自动归并为连场组,建议集中生产:同一组内保持服装、妆造、道具位置、光线方向和表演情绪连续;组内分镜优先用「首尾帧衔接」保持画面连贯。</span></div>
        <div class="grid proj-grid">
        ${groups.map((g, i) => `
        <div class="card" style="padding:14px 16px">
          <div class="row" style="gap:8px;align-items:center;margin-bottom:6px">
            <span class="tag purple">C${String(i + 1).padStart(2, '0')}</span><b>${U.esc(g.name)}</b>
            <span class="tag cyan">${g.rows.length} 场</span>
          </div>
          <div class="small muted" style="line-height:1.8">连场:${g.rows.map(r => r.code).join('、')}</div>
          <div class="small" style="margin-top:4px">出场:${[...new Set(g.rows.flatMap(r => r.chars))].join('、') || '—'}</div>
        </div>`).join('') || '<div class="empty"><p class="small muted">暂无场次数据</p></div>'}
        </div>`;
      } else if (prodSub === '服装') {
        // 服装组:每 5 集一组,聚合组内出场角色;连续性要求可编辑
        const egroups = [];
        for (let i = 0; i < p.episodes.length; i += 5) egroups.push(p.episodes.slice(i, i + 5));
        bodyHtml = `<div class="card" style="padding:10px 14px;margin-bottom:10px"><span class="small muted">按每 5 集剧情阶段拆服装组;同一组内保持角色基础服装/妆发/伤妆状态连续。连续性要求可编辑,失焦即存。</span></div>
        ${egroups.map((eps2, gi) => {
          const epIds = eps2.map(e => e.id);
          const gChars = [...new Set(rows.filter(r => epIds.includes(r.epId)).flatMap(r => r.chars))];
          return `
        <div class="card" style="padding:14px 16px;margin-bottom:10px">
          <div class="row" style="gap:8px;align-items:center;margin-bottom:6px">
            <span class="tag yellow">服装组${gi + 1}</span><b>第${eps2[0] ? eps2[0].title.replace(/第|集/g, '') : ''}-${eps2[eps2.length - 1].title.replace(/第|集/g, '')}集</b>
            <span class="small muted">涉及角色:${gChars.join('、') || '—'}</span>
          </div>
          <textarea class="input small" rows="2" data-cnote="${gi}" placeholder="连续性要求:本组内各角色的服装代码/妆发/伤妆递进说明…">${U.esc(ps.costumeNotes[gi] || '')}</textarea>
        </div>`; }).join('') || '<div class="empty"><p class="small muted">暂无分集</p></div>'}`;
      } else if (prodSub === '道具') {
        bodyHtml = `<div class="card" style="padding:10px 14px;margin-bottom:10px"><span class="small muted">道具主体清单(主体页登记的「道具」),自动汇总涉及场次;备注可编辑。开拍/开生成前按连场组打包检查。</span></div>
        <table class="tbl"><thead><tr><th>道具/资产</th><th>图片</th><th>涉及场次</th><th>备注</th></tr></thead><tbody>
        ${Object.keys(propMap).map(n => {
          const sj = p.subjects.find(s => s.kind === 'prop' && s.name === n);
          return `<tr>
          <td><b>${U.esc(n)}</b></td>
          <td>${sj && sj.image ? `<img src="${U.thumb(sj.image)}" style="width:56px;height:40px;object-fit:cover;border-radius:6px">` : '<span class="muted small">未生成</span>'}</td>
          <td class="small">${propMap[n].join('、') || '—'}</td>
          <td><input class="input small" data-pnote="prop_${n}" value="${U.esc(ps.sceneNotes['prop_' + n] || '')}" placeholder="备注" style="min-width:90px;padding:2px 6px"></td>
        </tr>`; }).join('') || '<tr><td colspan="4" class="muted" style="text-align:center;padding:20px">暂无道具主体(主体页添加「道具」类主体)</td></tr>'}
        </tbody></table>`;
      } else if (prodSub === '角色') {
        bodyHtml = `<div class="card" style="padding:10px 14px;margin-bottom:10px"><span class="small muted">按出场场数排序:主线重点角色优先保障形象一致性与参考图质量。</span></div>
        <table class="tbl"><thead><tr><th>角色</th><th>形象</th><th>出现场数</th><th>占比</th><th>定位</th></tr></thead><tbody>
        ${charStat.map(c2 => {
          const sj = p.subjects.find(s => s.kind === 'character' && s.name === c2.name);
          return `<tr>
          <td><b>${U.esc(c2.name)}</b></td>
          <td>${sj && sj.image ? `<img src="${U.thumb(sj.image)}" style="width:56px;height:40px;object-fit:cover;border-radius:6px">` : '<span class="muted small">未生成</span>'}</td>
          <td>${c2.cnt}</td>
          <td style="min-width:140px"><div class="progress"><i style="width:${Math.round(c2.cnt / maxChar * 100)}%"></i></div></td>
          <td>${c2.cnt >= Math.max(10, maxChar * 0.4) ? '<span class="tag cyan">主线重点角色</span>' : '<span class="tag">功能/单元角色</span>'}</td>
        </tr>`; }).join('') || '<tr><td colspan="5" class="muted" style="text-align:center;padding:20px">暂无角色主体</td></tr>'}
        </tbody></table>`;
      } else if (prodSub === '光影') {
        const locs = [...new Set(rows.map(r => r.loc))];
        bodyHtml = `
        <div class="card" style="padding:12px 16px;margin-bottom:10px">
          <div class="row" style="justify-content:space-between;flex-wrap:wrap;gap:8px">
            <b>💡 光影总控(按场景)</b>
            <button class="btn sm primary" data-x="light-gen" ${locs.length ? '' : 'disabled'}>✨ AI 生成全剧光影总控</button>
          </div>
          <div class="hint" style="margin-top:6px">AI 按「构思」页定调 + 剧本氛围,为每个场景生成主色卡(HEX)与执行要点;生成后自动出现在制片总表的「光影色调」列。</div>
        </div>
        <div class="grid proj-grid">
        ${locs.map(loc => {
          const lc = ps.lightCtl[loc];
          return `
        <div class="card" style="padding:14px 16px">
          <b>${U.esc(loc)}</b>
          ${lc ? `
          <div class="row wrap" style="gap:6px;margin:8px 0">
            ${lc.palette.map(h2 => `<span class="tag" style="font-size:11px"><i style="display:inline-block;width:10px;height:10px;border-radius:2px;background:${U.esc(h2)};margin-right:4px"></i>${U.esc(h2)}</span>`).join('')}
          </div>
          <div class="small muted" style="line-height:1.8">${U.esc(lc.keys)}</div>` : '<div class="hint" style="margin-top:8px">未生成,点上方「AI 生成全剧光影总控」</div>'}
        </div>`; }).join('') || '<div class="empty"><p class="small muted">暂无场次数据</p></div>'}
        </div>`;
      }

      return `
      <div class="grid stat-grid" style="margin-bottom:14px">
        <div class="card stat-card"><div class="stat-num">${p.episodes.length}</div><div class="stat-label">总集数</div></div>
        <div class="card stat-card"><div class="stat-num">${rows.length}</div><div class="stat-label">总场次(生产单元)</div></div>
        <div class="card stat-card"><div class="stat-num">${groups.length}</div><div class="stat-label">连场组</div></div>
        <div class="card stat-card"><div class="stat-num">${doneShots}/${totalShots}</div><div class="stat-label">分镜出片进度</div></div>
      </div>
      <div class="tabs" style="margin-bottom:12px">
        ${SUBS.map(([k, lb]) => `<div class="tab ${prodSub === k ? 'active' : ''}" data-psub="${k}">${lb}</div>`).join('')}
      </div>
      ${bodyHtml}`;
    }

    function bindProduction() {
      const ps = prodState();
      main.querySelectorAll('[data-psub]').forEach(t => t.onclick = () => { prodSub = t.dataset.psub; render(); });
      // 项目概况:剧壳字段失焦即存 + 点选类 + 封面上传
      const sh = p.shell = p.shell || {};
      main.querySelectorAll('[data-sh]').forEach(inp => inp.onchange = () => {
        const k = inp.dataset.sh;
        if (k === 'name') { const v = inp.value.trim(); if (!v) return U.toast('剧名不能为空', 'error'); p.name = v; document.title = v; }
        else if (k === 'desc') p.desc = inp.value.trim();
        else sh[k] = inp.value.trim();
        Store.save(); U.toast('已保存', 'success', 900);
      });
      main.querySelectorAll('[data-ov]').forEach(o => o.onclick = () => {
        sh[o.dataset.ov] = o.dataset.v; Store.save();
        main.querySelectorAll(`[data-ov="${o.dataset.ov}"]`).forEach(x => x.classList.toggle('sel', x === o));
        U.toast('已保存', 'success', 900);
      });
      const ovc = main.querySelector('[data-x=ovcover]');
      if (ovc) ovc.onclick = async () => {
        const f = await U.readFile('image/*', true);
        if (f) { p.cover = f.data; Store.save(); render(); U.toast('封面已更新', 'success'); }
      };
      // 智能体分工:阶段/审核意见落库 + 💬 打开板块 Agent 协作
      p.boards = p.boards || {};
      const BOARD_ORDER = (window.AGENT_BOARDS || []).map(b2 => b2.key);
      main.querySelectorAll('[data-bstage]').forEach(sel => sel.onchange = () => {
        const key = sel.dataset.bstage, val = sel.value;
        // 软闸门:上游未定稿时提醒(不阻断)
        const idx = BOARD_ORDER.indexOf(key);
        if ((val === '待审核' || val === '已定稿') && idx > 0) {
          const unDone = BOARD_ORDER.slice(0, idx).filter(k => (p.boards[k] || {}).stage !== '已定稿');
          if (unDone.length) U.toast(`注意:上游「${unDone.join('、')}」尚未定稿,本板块的审核/定稿可能需返工`, 'info', 3500);
        }
        p.boards[key] = Object.assign(p.boards[key] || {}, { stage: val, time: Store.now() });
        // 定稿传导:本板块定稿 → 下游第一个未开始板块自动进入「进行中」
        if (val === '已定稿' && idx >= 0 && idx < BOARD_ORDER.length - 1) {
          const next = BOARD_ORDER.slice(idx + 1).find(k => !p.boards[k] || !p.boards[k].stage || p.boards[k].stage === '未开始');
          if (next) {
            p.boards[next] = Object.assign(p.boards[next] || {}, { stage: '进行中', time: Store.now() });
            U.toast(`✓「${key}」已定稿,传导生效:下游「${next}」自动进入进行中`, 'success', 3000);
          } else {
            U.toast(`✓「${key}」已定稿并传导下游`, 'success', 2500);
          }
        } else {
          U.toast(key + '板块 → ' + val, 'success', 1200);
        }
        Store.save();
        render(); // 泳道上游状态链联动刷新
      });
      main.querySelectorAll('[data-bnote]').forEach(inp => inp.onchange = () => {
        p.boards[inp.dataset.bnote] = Object.assign(p.boards[inp.dataset.bnote] || {}, { note: inp.value.trim(), time: Store.now() });
        Store.save(); U.toast('审核意见已保存', 'success', 900);
      });
      main.querySelectorAll('[data-bchat]').forEach(b => b.onclick = () => { if (window.Agent && Agent.openBoard) Agent.openBoard(b.dataset.bchat); });
      main.querySelectorAll('[data-bexpert]').forEach(sel => sel.onchange = () => {
        p.boards[sel.dataset.bexpert] = Object.assign(p.boards[sel.dataset.bexpert] || {}, { expert: sel.value || null, time: Store.now() });
        Store.save();
        U.toast(sel.value ? '已为该板块雇佣专家,板块 Agent 获得其专业能力' : '已取消该板块专家雇佣', 'success', 2200);
        render();
      });
      main.querySelectorAll('[data-pnote]').forEach(inp => inp.onchange = () => { ps.sceneNotes[inp.dataset.pnote] = inp.value.trim(); Store.save(); U.toast('备注已保存', 'success', 900); });
      main.querySelectorAll('[data-cnote]').forEach(t => t.onchange = () => { ps.costumeNotes[t.dataset.cnote] = t.value.trim(); Store.save(); U.toast('连续性要求已保存', 'success', 900); });
      const lg = main.querySelector('[data-x=light-gen]');
      if (lg) lg.onclick = async () => {
        const rows = prodRows();
        const locs = [...new Set(rows.map(r => r.loc))];
        if (!locs.length) return U.toast('暂无场次数据(请先在分镜脚本层 AI 拆解)', 'error');
        if (!API.isReady()) return U.toast('需要真实 LLM(请登录后端)', 'error', 3000);
        lg.disabled = true; lg.innerHTML = '<span class="spinner"></span> 生成中…';
        try {
          const c = p.concept || {};
          const out = await API.chatJSON({
            model: (Store.state.settings || {}).defLLM || API.getConfig().model,
            system: '你是影视摄影指导(DP),负责全剧光影总控。',
            messages: [{ role: 'user', content: `为以下短剧的每个场景制定光影色调控制方案,返回 JSON {"scenes":[{"name":"场景名(与给出的一致)","palette":["主色 HEX×3(如 #F4E8D0)"],"keys":"执行要点(布光方向/氛围/可读性要求,≤60字)"}]}
要求:符合整剧定调;同场景跨集保持一致;惊悚/悬疑场景与温情场景拉开反差。
整剧定调:${c.statement || '(未填写)'};美术风格:${c.artStyle || p.style};影调:${c.palette || p.tone || '无'};光影基调:${c.lighting || '(未填写)'}
场景列表:${locs.join('、')}
各场景剧情氛围参考:${locs.map(loc => { const r = rows.find(x => x.loc === loc); return loc + ':' + (r ? r.point.slice(0, 40) : ''); }).join(' / ').slice(0, 2000)}` }],
            temperature: 0.5, max_tokens: 4000,
          });
          const arr = Array.isArray(out && out.scenes) ? out.scenes : [];
          if (!arr.length) throw new Error('LLM 未返回有效光影方案');
          arr.forEach(sc => {
            const name = String(sc.name || '');
            const hit = locs.find(l => l === name) || locs.find(l => l.includes(name) || name.includes(l));
            if (hit) ps.lightCtl[hit] = { palette: (Array.isArray(sc.palette) ? sc.palette : []).map(String).slice(0, 3), keys: String(sc.keys || '') };
          });
          ps.time = Store.now();
          Store.save();
          U.toast(`光影总控已生成(${Object.keys(ps.lightCtl).length} 个场景)`, 'success');
          render();
        } catch (e) {
          U.toast('生成失败:' + e.message, 'error', 3500);
          lg.disabled = false; lg.textContent = '✨ AI 生成全剧光影总控';
        }
      };
    }

    function renderReadings(readings) {      if (!readings.length) return `<div class="empty"><div class="ico">🔍</div><p>还没有围读记录。点击右上「发起剧本围读」,AI 导演组会通读全本并给出问题清单与修改建议。</p></div>`;
      return readings.map((r, i) => `
      <div class="card" style="padding:16px;margin-bottom:12px">
        <div class="row" style="justify-content:space-between">
          <b>第 ${readings.length - i} 次围读</b>
          <span class="small muted">${U.esc(r.time)} · ${U.esc(r.model || '')}</span>
        </div>
        ${r.overall ? `<div style="margin-top:8px;line-height:1.8"><b class="small" style="color:var(--accent)">整体评价</b><div class="small">${U.esc(r.overall)}</div></div>` : ''}
        ${r.highlights ? `<div style="margin-top:8px;line-height:1.8"><b class="small" style="color:var(--green)">亮点</b><div class="small">${U.esc(r.highlights)}</div></div>` : ''}
        ${(r.issues || []).length ? `<div style="margin-top:8px"><b class="small" style="color:var(--red)">问题与修改建议(${r.issues.length})</b>
          ${r.issues.map(it => `
          <div style="border-left:3px solid var(--yellow);padding:6px 10px;margin:8px 0;background:var(--panel2);border-radius:0 8px 8px 0">
            <div class="small"><span class="tag yellow" style="font-size:10px">${U.esc(it.where || '全局')}</span> ${U.esc(it.problem || '')}</div>
            <div class="small muted" style="margin-top:4px">💡 ${U.esc(it.suggestion || '')}</div>
          </div>`).join('')}
        </div>` : ''}
      </div>`).join('');
    }

    function bindScriptTab() {
      main.querySelectorAll('[data-ssub]').forEach(t => t.onclick = () => { scriptSub = t.dataset.ssub; render(); });
      // 事件图谱:折叠/编辑/增删/AI 生成
      main.querySelectorAll('[data-eg-fold]').forEach(h => h.onclick = () => {
        const b = main.querySelector(`[data-eg-body="${h.dataset.egFold}"]`);
        if (b) b.style.display = b.style.display === 'none' ? '' : 'none';
      });
      // 十二轮:图谱手动编辑/增删递增 ep.graphRev——图谱是拆解/分镜的剧情骨架,
      // 修订后旧分镜/审片/成片经 shotsGraphRev/lastReview.graphRev/composedGraphRev 判旧
      const bumpGraphRev = gi => {
        const g = (p.eventGraph || [])[+gi];
        const ep2 = g && (p.episodes || []).find(e => e.id === g.epId);
        if (ep2) ep2.graphRev = (ep2.graphRev || 0) + 1;
      };
      main.querySelectorAll('[data-eg]').forEach(inp => inp.onchange = () => {
        const [gi, ei, f] = inp.dataset.eg.split('_');
        const g = (p.eventGraph || [])[+gi];
        if (g && g.events[+ei]) { g.events[+ei][f] = inp.value.trim(); bumpGraphRev(gi); Store.save(); }
      });
      main.querySelectorAll('[data-egdel]').forEach(b => b.onclick = () => {
        const [gi, ei] = b.dataset.egdel.split('_').map(Number);
        p.eventGraph[gi].events.splice(ei, 1); bumpGraphRev(gi); Store.save(); render();
      });
      main.querySelectorAll('[data-egadd]').forEach(b => b.onclick = () => {
        p.eventGraph[+b.dataset.egadd].events.push({ who: '', where: '', what: '', result: '' });
        bumpGraphRev(b.dataset.egadd); Store.save(); render();
      });
      const egBtn = main.querySelector('[data-x=eg-gen]');
      if (egBtn) egBtn.onclick = async () => {
        if (!API.isReady()) return U.toast('需要真实 LLM(请登录后端)', 'error', 3000);
        if (!p.episodes.length) return U.toast('请先完成分集', 'error');
        egBtn.disabled = true;
        let total = 0;
        // 七轮计费贯通:逐集一任务(llm.chat=1/集,失败该集自动退费),解析重试共用同 opId 不重复扣;
        // 逐集成功即并入 p.eventGraph(单集失败不丢其他集已生成的事件);先清掉已删除分集的旧条目
        const liveIds = new Set(p.episodes.map(e => e.id));
        p.eventGraph = (p.eventGraph || []).filter(g => liveIds.has(g.epId));
        const sum = await Tasks.runBatch({ type: '事件图谱', model: (Store.state.settings || {}).defLLM || API.getConfig().model, cost: 1, actionName: '事件图谱拆解' }, p.episodes, async (e, tk) => {
          const out = await Understanding.chatJSONRobust({
            model: (Store.state.settings || {}).defLLM || API.getConfig().model,
            system: '你是短剧剧本结构分析师。',
            user: `把该集剧本拆成结构化事件序列,返回 JSON {"events":[{"who":"涉及人物(逗号分隔)","where":"场景","what":"发生了什么(一句话,具体动作与冲突)","result":"结果/钩子(对后续剧情的影响)"}]}。要求:按剧情时间顺序,覆盖该集全部关键剧情节点(3-10 个),不漏转折点。\n集标题:${e.title}\n剧本正文:\n${(e.content || '').slice(0, 8000)}`,
            temperature: 0.3, max_tokens: 3000,
            billingAction: 'llm.chat', operationId: tk.id,
          });
          const events = (Array.isArray(out && out.events) ? out.events : []).map(ev => ({
            who: String(ev.who || ''), where: String(ev.where || ''), what: String(ev.what || ''), result: String(ev.result || ''),
          })).filter(ev => ev.what);
          return { epId: e.id, title: e.title, events, sourceRev: e.contentRev || 0 }; // 十二轮:记录拆解时的正文版本(正文改后不再注入旧图谱)
        }, (e, ok, out) => {
          total++;
          if (ok) {
            p.eventGraph = p.eventGraph || [];
            const i = p.eventGraph.findIndex(g => g.epId === e.id);
            if (i >= 0) p.eventGraph[i] = out; else p.eventGraph.push(out);
            e.graphRev = (e.graphRev || 0) + 1; // 十二轮:重生成同样使旧分镜/审片/成片判旧
            Store.save();
          }
          egBtn.innerHTML = `<span class="spinner"></span> 拆解中 ${total}/${p.episodes.length}…`;
        });
        egBtn.disabled = false;
        egBtn.textContent = (p.eventGraph || []).length ? '↻ 重新生成' : '✨ AI 生成事件图谱';
        if (sum.ok) {
          U.toast(`事件图谱已生成:${(p.eventGraph || []).reduce((n, g) => n + g.events.length, 0)} 个事件${sum.fail ? `(另 ${sum.fail} 集失败,可重试)` : ''}`, 'success', 3000);
          render();
        } else {
          U.toast('事件图谱生成失败:全部分集解析未成功,已退费', 'error', 3500);
        }
      };
      const up = main.querySelector('[data-x=script-upload]');
      if (up) up.onclick = () => EpisodeUtil.openUploadScript(p, main);
      const ll = main.querySelector('[data-f=logline]');
      if (ll) ll.onchange = () => { p.scriptMeta = Object.assign(EpisodeUtil.deriveScriptMeta(p), p.scriptMeta || {}, { logline: ll.value.trim() }); Store.save(); U.toast('卖点已保存', 'success'); };
      const sy = main.querySelector('[data-f=synopsis]');
      if (sy) sy.onchange = () => { p.scriptMeta = Object.assign(EpisodeUtil.deriveScriptMeta(p), p.scriptMeta || {}, { synopsis: sy.value.trim() }); Store.save(); U.toast('梗概已保存', 'success'); };
      const ol = main.querySelector('[data-f=outline]');
      if (ol) ol.onchange = () => { p.scriptMeta = Object.assign(EpisodeUtil.deriveScriptMeta(p), p.scriptMeta || {}, { outline: ol.value.trim() }); Store.save(); U.toast('大纲已保存', 'success'); };
      main.querySelectorAll('[data-epcontent]').forEach(t => t.onchange = () => {
        const e = p.episodes.find(x => x.id === t.dataset.epcontent);
        if (e) { Store.updateEpisodeContent(e, t.value); U.toast(e.title + ' 正文已保存' + (Store.shotsStale(e) || Store.understandingStale(e) ? '(源剧本已变化,分镜/理解为旧版)' : ''), 'success'); }
      });
      // 集纲逐集可编辑(失焦即存)
      main.querySelectorAll('[data-eoutline]').forEach(t => t.onchange = () => {
        const i = +t.dataset.eoutline;
        p.epOutline = p.epOutline || [];
        p.epOutline[i] = t.value.trim();
        Store.save(); U.toast('第 ' + (i + 1) + ' 集集纲已保存', 'success', 1200);
      });
      // 未分集空态的「解析分集」按钮(集纲/每集正文卡片各一)
      main.querySelectorAll('[data-x=dosplit]').forEach(b => b.onclick = () => {
        if (!p.script) return U.toast('请先上传剧本', 'error');
        EpisodeUtil.doSplit(p, p.script, main);
      });
      // 旁白稿:改写入口(「内容」页与「旁白稿」页共用)/行内编辑/导出/清除/未生成分集折叠
      main.querySelectorAll('[data-narr-rewrite]').forEach(b => b.onclick = () => {
        const e = p.episodes.find(x => x.id === b.dataset.narrRewrite);
        if (e) rewriteNarration(e, b);
      });
      main.querySelectorAll('[data-narrcontent]').forEach(t => t.onchange = () => {
        const e = p.episodes.find(x => x.id === t.dataset.narrcontent);
        if (e) { e.narrationContent = t.value; Store.save(); U.toast(e.title + ' 旁白稿已保存', 'success'); }
      });
      main.querySelectorAll('[data-narr-export]').forEach(b => b.onclick = () => {
        const e = p.episodes.find(x => x.id === b.dataset.narrExport);
        if (!e || !e.narrationContent) return;
        U.downloadText(`${p.name}_${e.title}_旁白稿.txt`, `${p.name}《${e.title}》旁白稿\n导出时间:${Store.now()}\n\n${e.narrationContent}`);
        U.toast('旁白稿已导出', 'success');
      });
      main.querySelectorAll('[data-narr-clear]').forEach(b => b.onclick = () => {
        const e = p.episodes.find(x => x.id === b.dataset.narrClear);
        if (!e) return;
        U.confirm(`确定清除「${e.title}」的旁白稿吗?原正文不受影响。`, () => {
          delete e.narrationContent;
          Store.save();
          U.toast('旁白稿已清除', 'success');
          render();
        });
      });
      const nFold = main.querySelector('[data-narr-fold]');
      if (nFold) nFold.onclick = () => {
        const body = main.querySelector('[data-narr-foldbody]');
        if (body) body.style.display = body.style.display === 'none' ? '' : 'none';
      };
      const aiBtn = main.querySelector('[data-x=script-ai]');
      if (aiBtn) aiBtn.onclick = async () => {
        if (!API.isReady()) return U.toast('需要真实 LLM(请登录后端)', 'error', 3000);
        if (!p.script) return U.toast('请先上传剧本', 'error');
        aiBtn.disabled = true;
        try {
          const ok = await EpisodeUtil.aiScriptDigest(p, t => { aiBtn.innerHTML = '<span class="spinner"></span> ' + U.esc(t); });
          if (ok) U.toast('卖点/梗概/大纲/人物小传/集纲已生成(全文通读)', 'success', 3000);
        } catch (e) {
          U.toast('生成失败:' + e.message, 'error', 3500);
        }
        aiBtn.disabled = false; aiBtn.textContent = '✨ AI 生成卖点/梗概/集纲';
        render();
      };
      const rdBtn = main.querySelector('[data-x=script-reading]');
      if (rdBtn) rdBtn.onclick = async () => {
        if (!p.script) return U.toast('请先上传剧本', 'error');
        if (!API.isReady()) return U.toast('剧本围读需要真实 LLM(请登录后端)', 'error', 3000);
        rdBtn.disabled = true; rdBtn.innerHTML = '<span class="spinner"></span> 围读中…';
        try {
          const out = await API.chatJSON({
            model: (Store.state.settings || {}).defLLM || API.getConfig().model,
            system: '你是短剧导演组的剧本围读会,由编剧/导演/制片联合评审。',
            messages: [{ role: 'user', content: `对以下短剧剧本做一次围读评审,返回 JSON:
{"overall":"整体评价(≤120字)","highlights":"亮点(≤80字)","issues":[{"where":"第X集/全局","problem":"问题描述(具体)","suggestion":"修改建议(可执行)"}]}
关注:节奏与钩子强度、场次逻辑、人物动机、台词口语化、分集卡点。issues 给出 3-8 条最重要的问题。
剧本(节选):${(p.script || '').slice(0, 6000)}
各集开头:${p.episodes.map(e => e.title + ':' + (e.content || '').slice(0, 100)).join('\n').slice(0, 3000)}` }],
            temperature: 0.5, max_tokens: 4000,
          });
          if (!out) throw new Error('返回为空');
          p.scriptReadings = p.scriptReadings || [];
          p.scriptReadings.unshift({
            id: Store.uid('rd'), time: Store.now(), model: (Store.state.settings || {}).defLLM || API.getConfig().model,
            overall: String(out.overall || ''), highlights: String(out.highlights || ''),
            issues: (Array.isArray(out.issues) ? out.issues : []).map(it => ({ where: String(it.where || ''), problem: String(it.problem || ''), suggestion: String(it.suggestion || '') })),
          });
          Store.save();
          scriptSub = '围读';
          U.toast('围读完成,已生成评审记录', 'success');
          render();
        } catch (e) {
          U.toast('围读失败:' + e.message, 'error', 3500);
          rdBtn.disabled = false; rdBtn.textContent = '🔍 发起剧本围读';
        }
      };
    }

    /* ---- 其余 tab 行为 ---- */
    function openTab(t) {
      tab = t;
      render();
    }

    render();
  };

  /* AI 策划助手与剧本译制已拆至 proj-planner.js(window.EpisodeLab) */

  /* ---------- 新建分集 ---------- */
  function openNewEpisode(p, main) {
    U.openModal({
      title: '新建分集',
      wide: true,
      body: `
      <label class="field"><span>分集标题</span><input class="input" data-f="title" value="第${p.episodes.length + 1}集"></label>
      <label class="field"><span>分集剧本文本</span><textarea class="input" data-f="content" rows="10" placeholder="粘贴本集剧本文本…"></textarea></label>`,
      footer: `<button class="btn" data-x="cancel">取消</button><button class="btn primary" data-x="ok">创建</button>`,
      onMount(m, close) {
        m.querySelector('[data-x=cancel]').onclick = close;
        m.querySelector('[data-x=ok]').onclick = () => {
          const title = m.querySelector('[data-f=title]').value.trim();
          const content = m.querySelector('[data-f=content]').value.trim();
          if (!title || !content) return U.toast('请填写标题和剧本内容', 'error');
          p.episodes.push({ id: Store.uid('ep'), title, content, order: p.episodes.length, shots: [], status: 'draft' });
          Store.save(); close(); U.toast('分集已创建', 'success'); Views.projectDetail(main, p.id);
        };
      },
    });
  }

  /* 上传剧本/主体确认+AI 生图/生成分集(doSplit)已拆至 proj-upload.js,
   * 入口经 window.EpisodeUtil 调用(openUploadScript/genSubjectImage/openSubjectConfirm/doSplit) */
})();
