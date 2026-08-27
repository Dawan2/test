/* ============ issues-ui.js 问题中心浏览器薄封装(协同层,第三阶段) ============
 * 只做浏览器侧的三件事:在线态注入(Media)、弹窗渲染与 Bus 订阅重算、命令类问题经统一命令层处置。
 * 问题清单本身的推导在双端投影核 js/issues.js(纯数据、无 window/DOM),本文件不写第二份判定;
 * 对外仍是原来的全局名 window.Issues,成员一个不少(collect/count/fixIssue/openModal/badgeHTML),
 * 差别只在 collect/count 由本层补上 online 参数——调用方(项目页/工作台/发布门/Agent)一行不用改。
 * 入口:项目页「问题」按钮(角标=未解决数,Bus 事件驱动实时刷新)。 */
(function () {

  const Core = window.Issues; // index.html 里 issues.js 紧邻在前加载
  const online = () => !!(window.Media && Media.isReady && Media.isReady());
  const collect = p => Core.collect(p, { online: online() });
  const count = p => Core.count(p, { online: online() });

  /* ================= 处置动作 ================= */
  async function fixIssue(p, it, main, onDone) {
    if (it.cmd) {
      if (!window.Commands) { U.toast('命令层未加载,请稍后重试', 'error'); return; }
      const r = await Commands.execute(it.cmd, { pid: p.id, epid: it.epid, shotIds: it.shotIds, main: main || document.getElementById('main'), ui: true });
      Commands.digest(r);
      if (onDone) onDone(r);
      return r;
    }
    if (it.goto) { location.hash = it.goto; if (onDone) onDone(null); return null; }
  }

  /* ================= 问题中心弹窗 ================= */
  let openState = null; // {p, bodyEl, close, main} 弹窗开着时 Bus 事件驱动重算

  const SEV_TAG = { high: ['red', '高'], mid: ['yellow', '中'], low: ['', '低'] };
  const FIX_LABEL = { 'episode.generateVideos': '▶ 重生成', 'episode.generateStoryboard': '▶ 智能分镜', 'episode.compose': '▶ 重新合成' };

  function issueRow(p, it, idx) {
    const [cls, name] = SEV_TAG[it.sev] || ['', ''];
    return `
    <div class="card" style="padding:10px 12px;margin-bottom:8px">
      <div class="row" style="gap:6px;align-items:flex-start">
        ${cls ? `<span class="tag ${cls}" style="flex:none;font-size:10px">${name}</span>` : ''}
        <div class="grow">
          <div class="small" style="font-weight:600">${U.esc(it.label)}</div>
          <div class="small muted" style="margin-top:2px;line-height:1.5">${U.esc(it.detail)}</div>
        </div>
        ${it.cmd ? `<button class="btn sm primary" data-ifx="${idx}" style="flex:none">${FIX_LABEL[it.cmd] || '▶ 处理'}</button>`
        : it.goto ? `<button class="btn sm" data-igoto="${idx}" style="flex:none">→ 去处理</button>` : ''}
      </div>
    </div>`;
  }

  function paintBody(list) {
    const { p, bodyEl, main } = openState;
    const list2 = list || collect(p); // §3.4:调用方可传入共享重算结果(防抖轮内 badge 与弹窗同一快照)
    const hi = list2.filter(x => x.sev === 'high').length, mid = list2.filter(x => x.sev === 'mid').length, low = list2.length - hi - mid;
    bodyEl.innerHTML = list2.length ? `
      <div class="hint" style="margin-bottom:10px">全项目待处理问题聚合(失败/过期/未分镜/低分/待确认/缺图,与流程条同一套状态推导):
        <span class="tag red" style="font-size:10px">高 ${hi}</span> <span class="tag yellow" style="font-size:10px">中 ${mid}</span> <span class="tag" style="font-size:10px">低 ${low}</span>
        ——命令类问题一键处置(经统一命令层,含确认闸/预审),导航类跳转对应页面。</div>
      ${list2.map((it, idx) => issueRow(p, it, idx)).join('')}` : '<div class="empty"><p class="small muted">🎉 项目无待处理问题,主线畅通。</p></div>';
    bodyEl.querySelectorAll('[data-ifx]').forEach(b => b.onclick = async () => {
      const it = list2[+b.dataset.ifx]; // 快照索引与渲染行对齐(处置后 paintBody() 无参重算刷新)
      if (!it) return;
      b.disabled = true;
      await fixIssue(p, it, main, () => paintBody());
      paintBody();
    });
    bodyEl.querySelectorAll('[data-igoto]').forEach(b => b.onclick = () => {
      const it = list2[+b.dataset.igoto];
      if (it && it.goto) { openState.close(); location.hash = it.goto; }
    });
  }

  function openModal(p, main) {
    if (openState && openState.close) openState.close();
    U.openModal({
      title: `🩺 问题中心 · ${U.esc(p.name)}`,
      wide: true,
      body: '<div data-issues-body></div>',
      onMount(m, close) {
        openState = { p, bodyEl: m.querySelector('[data-issues-body]'), close, main };
        paintBody();
      },
    });
  }

  /* Bus 通配订阅:管线事件(生成/审片/合成落定)驱动弹窗与项目页角标实时重算。
   * §3.4:150ms 防抖合并事件风暴;一轮防抖内 badge 与弹窗共享同一次 collect 快照——
   * 此前每个事件各自全量重算(collect 对每集推导 episodeState/shotInputHash,大项目=每事件 2×全项目扫描) */
  function bindBus() {
    if (!window.Bus || bindBus._done) return;
    bindBus._done = true;
    let timer = null;
    Bus.on('*', () => {
      const modalOpen = !!(openState && openState.bodyEl && openState.bodyEl.isConnected);
      const btn = document.querySelector('[data-x=pissues][data-pid]');
      if (!modalOpen && !btn) return;
      clearTimeout(timer);
      timer = setTimeout(() => {
        const cache = {}; // pid → 本轮 collect 快照
        const collect1 = p => (cache[p.id] = cache[p.id] || collect(p));
        const modalStillOpen = !!(openState && openState.bodyEl && openState.bodyEl.isConnected);
        if (modalStillOpen) paintBody(collect1(openState.p));
        if (btn.isConnected) {
          const p = Store.getProject(btn.dataset.pid);
          if (p) btn.innerHTML = badgeHTML(p, collect1(p));
        }
      }, 150);
    });
  }
  if (typeof document !== 'undefined') bindBus();

  /* 项目页入口按钮内联 HTML(角标实时重算用同一实现;list 可传入共享快照) */
  function badgeHTML(p, list) {
    const n = list ? list.length : count(p);
    return `🩺 问题${n ? ` <b style="color:var(--red)">${n}</b>` : ''}`;
  }

  window.Issues = Object.assign({}, Core, { collect, count, fixIssue, openModal, badgeHTML });
})();
