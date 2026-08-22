/* ============ app.js 路由 + 应用外壳 ============ */
(function () {
  const app = document.getElementById('app');
  window.Views = window.Views || {};

  const ORCA_SVG = `<svg width="26" height="26" viewBox="0 0 48 48" fill="none">
    <path d="M6 30c0-10 9-18 21-18 9 0 15 5 15 11 0 2-1 4-3 5 3 1 5 3 5 6 0 5-7 8-14 8-13 0-24-5-24-12z" fill="#0b0f14"/>
    <path d="M27 12c2-4 6-6 9-6-1 3-2 6-2 9" stroke="#0b0f14" stroke-width="4" stroke-linecap="round"/>
    <path d="M14 32c3 4 9 6 15 6" stroke="#fff" stroke-width="4" stroke-linecap="round"/>
    <ellipse cx="20" cy="22" rx="4" ry="2.6" fill="#fff" transform="rotate(-18 20 22)"/>
    <circle cx="34" cy="21" r="1.6" fill="#fff"/>
  </svg>`;
  window.ORCA_SVG = ORCA_SVG;

  const NAV = [ // 扁平一级导航,不分组;数据看板/任务监控位于团队管理与操作指引之间
    { hash: '#/projects', ico: '🎬', txt: '项目管理' },
    { hash: '#/assets', ico: '🗂️', txt: '资产库' },
    { hash: '#/tools', ico: '🧰', txt: '百宝箱' },
    { hash: '#/gsettings', ico: '🛠', txt: '偏好学习' },
    { hash: '#/team', ico: '👥', txt: '团队管理', company: true },
    { hash: '#/dashboard', ico: '📊', txt: '数据看板' },
    { hash: '#/trash', ico: '🗑', txt: '回收站' },
    { hash: '#guide', ico: '📖', txt: '操作指引', external: 'https://hcnwhfahdfc4.feishu.cn/wiki/S36Uw0cUCiVjOsk1Mlcc5prUn5e' },
    // 任务监控已并入「数据看板」二级页;个人中心入口在左下角用户卡
  ];

  function shell(contentHTML, activeHash) {
    const u = Store.currentUser();
    const runningTasks = (Store.state.tasks || []).filter(t => t.status === 'running').length;
    const nav = NAV.filter(n => !n.company || (u && u.accountType === 'company'))
      .map(n => {
        return `<div class="nav-item ${activeHash && activeHash.startsWith(n.hash) ? 'active' : ''}" data-nav="${n.hash}">
          <span class="ico">${n.ico}</span><span class="txt">${n.txt}</span>${n.external ? '<span class="small muted" style="margin-left:auto">↗</span>' : ''}${n.hash === '#/dashboard' && runningTasks ? `<span class="tag cyan" style="margin-left:auto;font-size:10px;padding:1px 7px" title="进行中任务(数据看板→任务监控)">${runningTasks}</span>` : ''}</div>`;
      }).join('');
    app.innerHTML = `
    <div class="shell">
      <aside class="sidebar">
        <div class="logo" data-nav="#/projects">
          <div class="logo-orca">${ORCA_SVG}</div>
          <div class="logo-name">虎鲸漫剧<small>AI 短漫剧创作平台</small></div>
        </div>
        <div class="logo-slogan">讲好每一个故事！</div>
        <nav class="nav">${nav}</nav>
        <div style="padding:8px 12px 0">
          <button class="btn sm primary block" data-x="agent-global" title="元Agent·总调度:掌握全流程上下文,对话后自动安排对应板块的板块专家干活">🐋 虎鲸</button>
        </div>
        <div class="side-user">
          <div class="side-user-row" data-nav="#/profile" style="cursor:pointer" title="个人中心:积分管理 / API 设置 / 账号设置">
            <div class="avatar">${U.esc((u ? u.username : '?').slice(0, 1).toUpperCase())}</div>
            <div class="grow txt" style="min-width:0">
              <div class="small" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${U.esc(u ? u.username : '')} <span style="color:var(--text3);font-size:11px">· 个人中心 ›</span></div>
              <div style="font-size:11px;color:var(--text3)">${u && u.accountType === 'company' ? '公司主体' : '个人账号'}</div>
            </div>
            <button class="btn ghost sm" data-x="logout" title="退出登录">⏻</button>
          </div>
          <div class="side-credit" data-nav="#/profile" title="积分管理(个人中心)">
            <span class="txt small muted">💎 积分</span>
            <b data-credit-num>${u ? u.credits : 0}</b>
          </div>
        </div>
      </aside>
      <main class="main" id="main">${contentHTML}</main>
    </div>`;
    app.querySelectorAll('[data-nav]').forEach(el => el.onclick = () => {
      const navItem = NAV.find(n => n.hash === el.dataset.nav);
      if (navItem && navItem.external) { window.open(navItem.external, '_blank'); return; } // 外链(操作指引→飞书文档)新标签打开
      location.hash = el.dataset.nav;
    });
    app.querySelector('[data-x=agent-global]').onclick = () => { if (window.Agent) Agent.toggleGlobal(); }; // 🐋 虎鲸:元Agent总调度抽屉
    app.querySelector('[data-x=logout]').onclick = (e) => {
      e.stopPropagation(); // 按钮嵌在「个人中心」入口行内,避免触发跳转
      U.confirm('确定退出登录吗？', () => {
        // 登出联动服务端:吊销会话并清媒体 cookie(<img>/<video> 的 /uploads 访问随之失效)
        const tk = Store.getToken();
        if (tk) { try { fetch('/api/auth/logout', { method: 'POST', headers: { Authorization: 'Bearer ' + tk } }).catch(() => {}); } catch (_) {} }
        Store.logout();
        window.__jobsReconciled = false;
        window.__billingSynced = false;
        location.hash = '#/login';
      });
    };
  }

  function route() {
    const hash = location.hash || '#/projects';
    // M1:路由切换统一清理遗留全屏 overlay(终止其 interval)
    if (window.__overlays && window.__overlays.length) {
      window.__overlays.forEach(o => { try { o.close(); } catch (_) {} });
      window.__overlays = [];
    }
    const u = Store.currentUser();
    if (!u && hash !== '#/login') { location.hash = '#/login'; return; }
    if (u && hash === '#/login') { location.hash = '#/projects'; return; }

    // 登录/启动后自动对账一次:拉取服务端任务中心,免点生成即恢复中断视频任务
    // guard 在对账"确认成功"后才落(会话未就绪/任务中心不可达返回 false → 下次路由重试,登录恢复后不漏对账)
    if (u && !window.__jobsReconciled && window.Media && Media.reconcileJobs) {
      try {
        Promise.resolve(Media.reconcileJobs()).then(ok => { if (ok !== false) window.__jobsReconciled = true; }).catch(() => {});
      } catch (_) { }
    }
    // 服务端计费动作同步(价格唯一权威在服务端):登录/启动后拉一次,前端 COST 跟随白名单
    if (u && !window.__billingSynced && window.U && U.syncBillingActions) {
      window.__billingSynced = true;
      try { U.syncBillingActions(); } catch (_) { }
    }

    if (hash === '#/login') { Views.auth(app); return; }

    // 画布模式已下线:旧 #/canvas 链接重定向到项目页
    const cm = hash.match(/^#\/canvas\/(.+)$/);
    if (cm) { location.hash = '#/project/' + cm[1]; return; }

    const pm = hash.match(/^#\/project\/([^/]+)\/episode\/([^/]+)$/);
    const pr = hash.match(/^#\/project\/([^/]+)\/roles$/);
    const pp = hash.match(/^#\/project\/([^/]+)\/produce$/);
    const pd = hash.match(/^#\/project\/([^/]+)$/);

    let active = hash, title = '', content = document.createElement('div');
    // 先渲染外壳占位，再由各视图填充 main
    shell('<div class="page"><div class="empty"><div class="spinner"></div></div></div>', hash);
    const main = document.getElementById('main');

    if (pm) Views.episode(main, pm[1], pm[2]);
    else if (pr) Views.roles(main, pr[1]);
    else if (pp) Views.produce(main, pp[1]);
    else if (pd) Views.projectDetail(main, pd[1]);
    else if (hash.startsWith('#/projects')) Views.projects(main);
    else if (hash.startsWith('#/tasks')) Views.dashboard(main, 'tasks'); // 旧任务监控入口→数据看板二级页
    else if (hash.startsWith('#/dashboard')) Views.dashboard(main);
    else if (hash.startsWith('#/trash')) Views.trash(main); // 回收站(任务5,视图在 assets.js)
    else if (hash.startsWith('#/assets')) Views.assets(main);
    else if (hash.startsWith('#/tools')) Views.tools(main);
    else if (hash.startsWith('#/editor/comic')) Views.comic(main);
    else if (hash.startsWith('#/editor/cutter')) Views.cutter(main);
    else if (hash.startsWith('#/editor/ps')) Views.ps(main);
    else if (hash.startsWith('#/settings')) Views.profile(main, 'api'); // 旧 API 设置入口→个人中心·API 设置
    else if (hash.startsWith('#/gsettings')) Views.gsettings(main);
    else if (hash.startsWith('#/profile')) Views.profile(main);
    else if (hash.startsWith('#/team')) Views.team(main);
    else Views.projects(main);
  }

  window.addEventListener('hashchange', route);
  window.__reroute = route; // 供全局 Agent 应用修改后刷新当前页
  /* 启动:IndexedDB 大对象先水合回 state 再首渲(受限环境/失败时直接启动,不阻断) */
  window.addEventListener('load', () => {
    const boot = () => {
      route();
      // 两阶段提交收尾(持久回调):每当一批新写入在 IDB 确认完成即重写本地快照,
      // 把已确认键替换为标记(配额释放;首存配额失败窗口内刷新不再丢对象)
      if (window.IDB && IDB.onIdle) { try { IDB.onIdle(() => Store.flushNow()); } catch (_) { } }
    };
    if (window.IDB) IDB.hydrate(Store.state).then(boot).catch(boot);
    else boot();
  });
  // L11 修复:任务变化即刷新侧栏进行中徽标(不再依赖路由切换);徽标现挂在「数据看板」(任务监控为其二级页)
  window.addEventListener('tasks-changed', () => {
    if (!window.Tasks) return;
    const n = Tasks.running();
    const navEl = document.querySelector('[data-nav="#/dashboard"]');
    if (!navEl) return;
    const badge = navEl.querySelector('.tag[data-task-badge]'); // 带标识查询,防误中导航内其他 tag
    if (n > 0) {
      if (badge) badge.textContent = n;
      else if (Store.currentUser() && document.querySelector('.sidebar')) {
        const t = document.createElement('span');
        t.className = 'tag cyan'; t.dataset.taskBadge = '1'; t.style.cssText = 'margin-left:auto;font-size:10px;padding:1px 7px';
        t.textContent = n;
        navEl.appendChild(t);
      }
    } else if (badge) badge.remove(); // 归零移除徽标,不留空气泡
  });
  window.go = h => location.hash = h;
})();
