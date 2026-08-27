/* ============ cmdpalette.js Ctrl+K 命令面板(§3.5) ============
 * 统一命令注册表(Commands.list(),元数据出自 cmd-registry.js)与常用导航的搜索直达入口:
 * 高频生产操作不再点多层页面。领域命令上下文取当前路由(#/project/<pid>[/episode/<epid>])——
 * 缺上下文的命令置灰标注原因;执行走 Commands.execute(ui:true) 保留全部决策闸,回执经 digest 消化。
 * 纯入口层:不持有任何业务逻辑,命令面随注册表自动扩展。 */
(function () {
  const NAVS = [
    { label: '项目管理', hash: '#/projects' }, { label: '数据看板 · 任务监控', hash: '#/dashboard' },
    { label: '资产库', hash: '#/assets' }, { label: '百宝箱', hash: '#/tools' },
    { label: '偏好学习', hash: '#/gsettings' }, { label: '个人中心', hash: '#/profile' },
  ];

  /* 当前路由上下文(领域命令的 pid/epid 注入源) */
  function routeCtx() {
    const h = (typeof location !== 'undefined' && location.hash) || '';
    const pm = h.match(/^#\/project\/([^/]+)\/episode\/([^/]+)$/);
    if (pm) return { pid: pm[1], epid: pm[2] };
    const pd = h.match(/^#\/project\/([^/]+)$/);
    if (pd) return { pid: pd[1], epid: null };
    return { pid: null, epid: null };
  }

  /* 面板条目集:领域命令(注册表生成)+ 导航;disabled/why 标注缺上下文的命令 */
  function entries() {
    const ctx = routeCtx();
    const out = [];
    const cmds = (window.Commands && Commands.list) ? Commands.list()
      : (window.CmdRegistry ? CmdRegistry.META : []); // 无 Commands 环境(测试/轻量页)直接回退注册表
    cmds.forEach(c => {
      let why = '';
      if (c.needs.includes('s')) why = '需指定镜头(请在分镜工作区用快捷键 g 或镜头按钮)';
      else if (c.needs.includes('p') && !ctx.pid) why = '需先进入项目页';
      else if (c.needs.includes('ep') && !ctx.epid) why = '需先进入分集工作区';
      out.push({ kind: 'cmd', name: c.name, label: c.label, desc: c.desc || '', disabled: !!why, why, ctx });
    });
    NAVS.forEach(n => out.push({ kind: 'nav', name: n.hash, label: n.label, desc: '导航', disabled: false }));
    return out;
  }

  function open() {
    if (!window.U || !U.openModal) return;
    let sel = 0;
    let rows = [];
    U.openModal({
      title: '⌘K 命令面板',
      body: `
      <input class="input" data-ck-in placeholder="输入命令或页面名…(↑↓ 选择,回车执行,Esc 关闭)" style="width:100%;margin-bottom:8px">
      <div data-ck-list style="max-height:50vh;overflow-y:auto"></div>
      <div class="small muted" style="margin-top:6px">领域命令与注册表(cmd-registry.js)同源;执行保留确认闸/合规承诺等全部决策弹窗。</div>`,
      onMount(m, close) {
        const inp = m.querySelector('[data-ck-in]');
        const listEl = m.querySelector('[data-ck-list]');
        const paint = () => {
          const q = (inp.value || '').trim().toLowerCase();
          rows = entries().filter(e => !q || (e.label + ' ' + e.name).toLowerCase().includes(q));
          if (sel >= rows.length) sel = Math.max(0, rows.length - 1);
          listEl.innerHTML = rows.length ? rows.map((e, i) => `
          <div class="row" data-ck-i="${i}" style="gap:8px;padding:7px 8px;border-radius:8px;cursor:${e.disabled ? 'not-allowed' : 'pointer'};${i === sel ? 'background:var(--bg2);outline:1px solid var(--border2)' : ''}${e.disabled ? ';opacity:.45' : ''}">
            <span class="small" style="flex:none">${e.kind === 'cmd' ? '⚡' : '→'}</span>
            <div class="grow" style="min-width:0">
              <div class="small"><b>${U.esc(e.label)}</b> <span class="muted">${U.esc(e.name)}</span></div>
              ${e.disabled ? `<div class="small muted">${U.esc(e.why)}</div>` : e.desc ? `<div class="small muted" style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${U.esc(e.desc)}</div>` : ''}
            </div>
          </div>`).join('') : '<div class="empty"><p class="small muted">无匹配项</p></div>';
          listEl.querySelectorAll('[data-ck-i]').forEach(el => {
            el.onclick = () => run(rows[+el.dataset.ckI], close);
            el.onmouseenter = () => { sel = +el.dataset.ckI; paint(); };
          });
        };
        const run = (e, closeFn) => {
          if (!e || e.disabled) return;
          closeFn();
          if (e.kind === 'nav') { location.hash = e.name; return; }
          const ctx = routeCtx();
          Commands.execute(e.name, { pid: ctx.pid, epid: ctx.epid, main: document.getElementById('main'), ui: true })
            .then(r => Commands.digest(r));
        };
        inp.oninput = () => { sel = 0; paint(); };
        inp.onkeydown = ev => {
          if (ev.key === 'ArrowDown') { sel = Math.min(rows.length - 1, sel + 1); paint(); ev.preventDefault(); }
          else if (ev.key === 'ArrowUp') { sel = Math.max(0, sel - 1); paint(); ev.preventDefault(); }
          else if (ev.key === 'Enter') { run(rows[sel], close); ev.preventDefault(); }
        };
        paint();
        try { inp.focus(); } catch (_) {}
      },
    });
  }

  /* Ctrl/Cmd+K 全局唤起(输入框聚焦时不拦截自家按键由面板 onkeydown 处理) */
  if (typeof document !== 'undefined') {
    document.addEventListener('keydown', e => {
      if ((e.ctrlKey || e.metaKey) && String(e.key || '').toLowerCase() === 'k') {
        e.preventDefault();
        open();
      }
    });
  }

  window.CmdPalette = { open, entries, routeCtx };
})();
