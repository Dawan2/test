/* ============ team.js 团队管理(仅公司主体账号;真实成员体系,数据走后端 /api/team/*) ============ */
(function () {
  window.Views = window.Views || {};

  /* 团队接口封装(统一 token + 错误抛出,同 profile.js payReq) */
  async function teamReq(path, opts) {
    const res = await fetch(path, Object.assign({
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + Store.getToken() },
    }, opts || {}));
    const j = await res.json().catch(() => null);
    if (!res.ok || !j || j.code !== 0) throw new Error((j && j.message) || ('请求失败(' + res.status + ')'));
    return j.data;
  }
  const post = (path, body) => teamReq(path, { method: 'POST', body: JSON.stringify(body || {}) });

  Views.team = function (main) {
    const u = Store.currentUser();
    if (u.accountType !== 'company') {
      main.innerHTML = `
      <div class="page">
        <div class="page-title" style="margin-bottom:16px">团队管理</div>
        <div class="empty">
          <div class="ico">🏢</div>
          <p><b>团队管理仅公司主体账号可用</b></p>
          <p class="small" style="margin-top:8px">公司主体账号可邀请成员、批量分配积分、查看人员消耗统计。</p>
          <p class="small" style="margin-top:4px">当前账号类型:个人账号。可重新注册一个公司主体账号体验该功能。</p>
        </div>
      </div>`;
      return;
    }

    /* 离线(未登录后端):团队数据全部在服务端,整页提示 */
    if (!Store.getToken()) {
      main.innerHTML = `
      <div class="page">
        <div class="page-title" style="margin-bottom:16px">团队管理</div>
        <div class="empty">
          <div class="ico">🔌</div>
          <p><b>团队功能需要登录本地后端</b></p>
          <p class="small" style="margin-top:8px">团队成员与消耗数据均保存在服务端,请先运行 node server.js 并登录账号。</p>
        </div>
      </div>`;
      return;
    }

    let teams = [];       // GET /api/team 的项目组列表(我负责/加入的全部)
    let team = null;      // 当前选中项目组
    let activeId = '';    // 选中项目组 id
    let stats = null;     // GET /api/team/stats?teamId= 的 members 聚合
    let isAdmin = false;  // 是否管理员(决定「分配积分」按钮显隐)
    let tab = 'member';
    /* 消耗统计筛选状态(真实成员维度;数据为服务端逐日聚合) */
    const stat = { member: '', from: '', to: '', grain: 'day' };

    function loading(msg) {
      main.innerHTML = `<div class="page"><div class="empty" style="padding:60px"><p><span class="spinner"></span> ${msg || '加载中…'}</p></div></div>`;
    }

    async function reload() {
      loading();
      try {
        const d = await teamReq('/api/team');
        teams = d.teams || (d.team ? [d.team] : []);
        isAdmin = !!d.isAdmin;
        if (!activeId || !teams.some(t => t.id === activeId)) activeId = teams[0] ? teams[0].id : '';
        team = teams.find(t => t.id === activeId) || null;
        stats = null;
        if (team) stats = await teamReq('/api/team/stats?teamId=' + encodeURIComponent(team.id));
        render();
      } catch (e) {
        main.innerHTML = `<div class="page"><div class="empty" style="padding:60px">
          <div class="ico">⚠️</div><p><b>团队数据加载失败</b></p>
          <p class="small" style="margin-top:8px">${U.esc(e.message)}</p>
          <p style="margin-top:12px"><button class="btn primary" data-x="retry">重试</button></p></div></div>`;
        main.querySelector('[data-x=retry]').onclick = reload;
      }
    }

    /* ================= 新建项目组 / 凭邀请码加入(弹窗,无项目组页与页头共用) ================= */
    function openCreateModal() {
      U.openModal({
        title: '🏗 新建项目组',
        body: `<p class="small muted" style="margin-bottom:10px;line-height:1.8">每个项目组独立的成员名单、邀请码与消耗统计,互不影响;你可创建多个项目组分开管理不同剧集/团队。</p>
        <label class="field"><span>项目组名称</span><input class="input" data-f="tname" placeholder="如:悬疑短剧一组" maxlength="30"></label>`,
        footer: `<button class="btn" data-x="cancel">取消</button><button class="btn primary" data-x="ok">创建</button>`,
        onMount(m, close) {
          m.querySelector('[data-x=cancel]').onclick = close;
          m.querySelector('[data-x=ok]').onclick = async () => {
            const name = m.querySelector('[data-f=tname]').value.trim();
            if (name.length < 2) return U.toast('请输入 2~30 个字符的项目组名称', 'error');
            try {
              const d = await post('/api/team/create', { name });
              activeId = d.team.id;
              close(); U.toast('项目组已创建,邀请码:' + d.team.inviteCode, 'success', 3500); reload();
            } catch (e) { U.toast(e.message, 'error', 3200); }
          };
        },
      });
    }
    function openJoinModal() {
      U.openModal({
        title: '🔗 凭邀请码加入项目组',
        body: `<p class="small muted" style="margin-bottom:10px;line-height:1.8">输入项目组负责人分享的邀请码(格式 MV-XXXXXX)。可同时加入多个项目组,在顶部切换管理。</p>
        <label class="field"><span>邀请码</span><input class="input" data-f="tcode" placeholder="MV-XXXXXX" style="font-family:monospace"></label>`,
        footer: `<button class="btn" data-x="cancel">取消</button><button class="btn primary" data-x="ok">加入</button>`,
        onMount(m, close) {
          m.querySelector('[data-x=cancel]').onclick = close;
          m.querySelector('[data-x=ok]').onclick = async () => {
            const code = m.querySelector('[data-f=tcode]').value.trim();
            if (!code) return U.toast('请输入邀请码', 'error');
            try {
              const d = await post('/api/team/join', { code });
              activeId = d.team.id;
              close(); U.toast('已加入项目组「' + d.team.name + '」', 'success'); reload();
            } catch (e) { U.toast(e.message, 'error', 3200); }
          };
        },
      });
    }

    /* ================= 无项目组:创建 / 凭邀请码加入 ================= */
    function renderNoTeam() {
      main.innerHTML = `
      <div class="page" style="max-width:900px">
        <div class="page-head"><div>
          <div class="page-title">团队管理</div>
          <div class="page-sub">${U.esc(u.username)} · 公司主体 · 尚未加入任何项目组</div>
        </div></div>
        <div class="dash-cols">
          <div class="card" style="padding:22px">
            <b>🏗 新建项目组</b>
            <p class="small muted" style="margin:10px 0;line-height:1.8">创建项目组并担任负责人,生成邀请码邀请成员加入;可创建多个项目组,成员与消耗统计分开管理。</p>
            <button class="btn primary" data-x="create">新建项目组</button>
          </div>
          <div class="card" style="padding:22px">
            <b>🔗 凭邀请码加入</b>
            <p class="small muted" style="margin:10px 0;line-height:1.8">输入项目组负责人分享的邀请码(格式 MV-XXXXXX)加入已有项目组;可同时加入多个项目组。</p>
            <button class="btn primary" data-x="join">加入项目组</button>
          </div>
        </div>
      </div>`;
      main.querySelector('[data-x=create]').onclick = openCreateModal;
      main.querySelector('[data-x=join]').onclick = openJoinModal;
    }

    /* ================= 成员管理(真实成员) ================= */
    function renderMembers(members, sMembers, isOwner) {
      const sMap = {};
      sMembers.forEach(s2 => { sMap[s2.userId] = s2; });
      const fmtTime = ts => ts ? new Date(ts).toLocaleString('zh-CN', { hour12: false }) : '—';
      return `
      <table class="tbl"><thead><tr><th>成员</th><th>角色</th><th>加入时间</th><th>净消耗积分</th><th>视频次数</th><th>任务数</th><th>最近活跃</th><th>操作</th></tr></thead><tbody>
      ${members.map(m => {
        const s2 = sMap[m.userId] || { netSpend: 0, videoCnt: 0, taskCnt: 0, lastActive: 0 };
        const isSelf = m.userId === u.id;
        return `<tr>
        <td><b>${U.esc(m.username)}</b>${isSelf ? ' <span class="small muted">(我)</span>' : ''}</td>
        <td><span class="tag ${m.role === 'owner' ? 'purple' : ''}">${m.role === 'owner' ? '负责人' : '成员'}</span></td>
        <td class="small muted">${U.esc(m.joinedAt || '')}</td>
        <td style="color:var(--yellow)">${Math.max(0, s2.netSpend)}</td>
        <td>${s2.videoCnt}</td>
        <td>${s2.taskCnt}</td>
        <td class="small muted">${fmtTime(s2.lastActive)}</td>
        <td class="row" style="gap:4px">
          ${isAdmin ? `<button class="btn sm" data-alloc="${m.userId}">分配积分</button>` : ''}
          ${isOwner && m.role !== 'owner' ? `<button class="btn sm danger" data-kick="${m.userId}">移除</button>` : ''}
        </td></tr>`;
      }).join('')}
      </tbody></table>`;
    }

    /* ================= 人员消耗统计(服务端真实聚合;成员筛选 + 日/周/月趋势 + 排行) ================= */
    function renderStat(sMembers) {
      const sel = sMembers.filter(m => !stat.member || m.username === stat.member);
      const inRange = day => (!stat.from || day >= stat.from) && (!stat.to || day <= stat.to);
      const totalSpend = Math.max(0, sel.reduce((a, m) => a + m.netSpend, 0));
      const videoCnt = sel.reduce((a, m) => a + m.videoCnt, 0);
      const avg = sel.length ? Math.round(totalSpend / sel.length) : 0;

      /* 趋势分桶:day/week/month(原始数据为服务端聚合的逐日 净消耗/视频次数) */
      const entries = [];
      sel.forEach(m => (m.byDay || []).forEach(d => { if (inRange(d.day)) entries.push(d); }));
      const dayTs = d => new Date(d + 'T00:00:00').getTime();
      const now = Date.now();
      const from = stat.from ? dayTs(stat.from) : (entries.length ? Math.min(...entries.map(e => dayTs(e.day))) : now - 29 * 86400000);
      const to = stat.to ? dayTs(stat.to) + 86399000 : now;
      const bks = [];
      const d0 = new Date(from);
      if (stat.grain === 'month') {
        d0.setDate(1);
        while (d0.getTime() <= to) { bks.push({ label: d0.getFullYear() + '-' + String(d0.getMonth() + 1).padStart(2, '0'), ts: d0.getTime() }); d0.setMonth(d0.getMonth() + 1); }
      } else if (stat.grain === 'week') {
        d0.setDate(d0.getDate() - d0.getDay());
        while (d0.getTime() <= to) { bks.push({ label: (d0.getMonth() + 1) + '/' + d0.getDate() + '周', ts: d0.getTime() }); d0.setDate(d0.getDate() + 7); }
      } else {
        while (d0.getTime() <= to) { bks.push({ label: (d0.getMonth() + 1) + '/' + d0.getDate(), ts: d0.getTime() }); d0.setDate(d0.getDate() + 1); }
      }
      const span = b => stat.grain === 'month' ? new Date(new Date(b.ts).setMonth(new Date(b.ts).getMonth() + 1)).getTime() : stat.grain === 'week' ? b.ts + 7 * 86400000 : b.ts + 86400000;
      const series = bks.map(b => ({ ...b, end: span(b) })).slice(-31).map(b => ({
        label: b.label,
        spend: Math.max(0, entries.filter(e => { const ts = dayTs(e.day); return ts >= b.ts && ts < b.end; }).reduce((a, e) => a + e.spend, 0)),
        videos: entries.filter(e => { const ts = dayTs(e.day); return ts >= b.ts && ts < b.end; }).reduce((a, e) => a + e.videos, 0),
      }));
      const maxSpend = series.reduce((m2, b) => Math.max(m2, b.spend), 1);
      const maxVid = series.reduce((m2, b) => Math.max(m2, b.videos), 1);

      /* 成员排行(净消耗降序) */
      const rank = sel.slice().sort((a, b) => b.netSpend - a.netSpend).slice(0, 10);
      const rMax = rank.reduce((m2, x) => Math.max(m2, Math.max(0, x.netSpend)), 1);
      const fmtTime = ts => ts ? new Date(ts).toLocaleString('zh-CN', { hour12: false }) : '—';

      return `
      <div class="row wrap" style="margin-bottom:14px;gap:8px;align-items:center">
        <select class="select small" data-sf="member" style="width:auto">
          <option value="">全部成员</option>
          ${sMembers.map(m => `<option ${stat.member === m.username ? 'selected' : ''}>${U.esc(m.username)}</option>`).join('')}
        </select>
        <input class="input small" type="date" data-sf="from" value="${stat.from}" style="width:auto">
        <span class="small muted">至</span>
        <input class="input small" type="date" data-sf="to" value="${stat.to}" style="width:auto">
        <div class="model-row" style="gap:4px">
          ${[['day', '日'], ['week', '周'], ['month', '月']].map(([g, lb]) => `<div class="model-opt ${stat.grain === g ? 'sel' : ''}" data-grain="${g}" style="padding:4px 12px">${lb}</div>`).join('')}
        </div>
      </div>

      <div class="grid stat-grid" style="margin-bottom:14px">
        <div class="card stat-card"><div class="stat-num">${totalSpend}</div><div class="stat-label">总消耗积分(流水净额)</div></div>
        <div class="card stat-card"><div class="stat-num">${videoCnt}</div><div class="stat-label">视频生成次数</div></div>
        <div class="card stat-card"><div class="stat-num">${sel.length}</div><div class="stat-label">统计成员数</div></div>
        <div class="card stat-card"><div class="stat-num">${avg}</div><div class="stat-label">人均消耗</div></div>
      </div>

      <div class="dash-cols" style="margin-bottom:14px">
        <div class="card" style="padding:16px">
          <b class="small">消耗趋势(按${{ day: '日', week: '周', month: '月' }[stat.grain]} · 积分 / 视频次数)</b>
          ${series.length ? `
          <div class="dash-trend" style="margin-top:10px">
            ${series.map(b => `<div class="dash-trend-col" title="${b.label}: ${b.spend} 积分 / ${b.videos} 次视频">
              <div style="display:flex;align-items:flex-end;gap:2px;height:100%">
                <div class="dash-trend-bar" style="height:${Math.max(2, Math.round(b.spend / maxSpend * 100))}%"></div>
                <div class="dash-trend-bar" style="height:${Math.max(2, Math.round(b.videos / maxVid * 100))}%;background:var(--red,#f87171)"></div>
              </div>
              <span class="dash-trend-day">${b.label}</span>
            </div>`).join('')}
          </div>
          <div class="row" style="gap:14px;margin-top:6px"><span class="small muted">■ 积分消耗</span><span class="small" style="color:var(--red,#f87171)">■ 视频次数</span></div>` : '<div class="empty" style="padding:24px"><p class="small muted">该时间范围暂无消耗记录</p></div>'}
        </div>
        <div class="card" style="padding:16px">
          <b class="small">成员消耗排行(积分流水净额)</b>
          <div style="margin-top:10px">
          ${rank.length ? rank.map(m => `
            <div class="row" style="gap:8px;margin-bottom:8px;align-items:center">
              <span class="small" style="width:72px;flex:none;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${U.esc(m.username)}</span>
              <div class="progress grow"><i style="width:${Math.round(Math.max(0, m.netSpend) / rMax * 100)}%"></i></div>
              <span class="small" style="width:110px;flex:none;text-align:right">💎${Math.max(0, m.netSpend)} · 🎬${m.videoCnt}次</span>
            </div>`).join('') : '<div class="empty" style="padding:24px"><p class="small muted">暂无成员消耗</p></div>'}
          </div>
        </div>
      </div>

      <div class="card" style="padding:16px">
        <b class="small">成员消耗明细(真实聚合:积分流水净额 + 任务登记)</b>
        <table class="tbl" style="margin-top:10px"><thead><tr><th>成员</th><th>角色</th><th>净消耗积分</th><th>视频生成次数</th><th>任务总数</th><th>最近活跃</th></tr></thead><tbody>
          ${rank.map(m => `<tr>
            <td><b>${U.esc(m.username)}</b></td>
            <td>${m.role === 'owner' ? '负责人' : '成员'}</td>
            <td style="color:var(--yellow);font-weight:600">${Math.max(0, m.netSpend)}</td>
            <td>${m.videoCnt}</td>
            <td>${m.taskCnt}</td>
            <td class="muted small">${fmtTime(m.lastActive)}</td></tr>`).join('')}
        </tbody></table>
      </div>`;
    }

    /* ================= 主渲染 ================= */
    function render() {
      if (!team) return renderNoTeam();
      const members = team.members || [];
      const isOwner = team.ownerId === u.id;
      const sMembers = stats ? stats.members : [];
      const totalUsed = Math.max(0, sMembers.reduce((s2, m) => s2 + m.netSpend, 0));
      const videoCnt = sMembers.reduce((s2, m) => s2 + m.videoCnt, 0);
      const avgUsed = members.length ? Math.round(totalUsed / members.length) : 0;

      main.innerHTML = `
      <div class="page">
        <div class="page-head">
          <div>
            <div class="page-title">团队管理</div>
            <div class="page-sub">${U.esc(u.username)} · 公司主体 · 共 ${teams.length} 个项目组</div>
          </div>
          <div class="row">
            <button class="btn" data-x="newgrp">🏗 新建项目组</button>
            <button class="btn" data-x="joingrp">🔗 凭邀请码加入</button>
          </div>
        </div>
        <div class="card" style="margin-bottom:14px;padding:10px 16px">
          <div class="row" style="gap:10px;align-items:center;flex-wrap:wrap">
            <b class="small" style="flex:none">项目组:</b>
            <div class="tabs" style="margin:0">
              ${teams.map(t => `<div class="tab ${t.id === team.id ? 'active' : ''}" data-grp="${t.id}" style="padding:5px 14px">${U.esc(t.name)}${t.ownerId === u.id ? ' <span class="small muted">·负责人</span>' : ''}</div>`).join('')}
            </div>
            <span class="grow"></span>
            <span class="small muted">${U.esc(team.name)} · ${isOwner ? '我是负责人' : '我是成员'} · ${members.length} 人</span>
            ${isOwner ? `
            <button class="btn sm" data-x="invite">🔗 邀请码</button>
            <button class="btn sm" data-x="refresh">↻ 刷新邀请码</button>` : `
            <button class="btn sm danger" data-x="leave">退出该项目组</button>`}
          </div>
        </div>
        <div class="grid stat-grid" style="margin-bottom:18px">
          <div class="card stat-card"><div class="stat-num">${totalUsed}</div><div class="stat-label">总消耗积分</div></div>
          <div class="card stat-card"><div class="stat-num">${videoCnt}</div><div class="stat-label">视频生成次数</div></div>
          <div class="card stat-card"><div class="stat-num">${members.length}</div><div class="stat-label">项目组成员数</div></div>
          <div class="card stat-card"><div class="stat-num">${avgUsed}</div><div class="stat-label">人均消耗</div></div>
        </div>
        <div class="tabs">
          <div class="tab ${tab === 'member' ? 'active' : ''}" data-tab="member">👥 成员管理(${members.length})</div>
          <div class="tab ${tab === 'stat' ? 'active' : ''}" data-tab="stat">📊 人员消耗统计</div>
        </div>
        ${tab === 'member' ? renderMembers(members, sMembers, isOwner) : renderStat(sMembers)}
      </div>`;

      main.querySelectorAll('[data-tab]').forEach(t => t.onclick = () => { tab = t.dataset.tab; render(); });
      main.querySelectorAll('[data-grp]').forEach(t => t.onclick = () => { if (t.dataset.grp !== activeId) { activeId = t.dataset.grp; reload(); } });
      main.querySelector('[data-x=newgrp]').onclick = openCreateModal;
      main.querySelector('[data-x=joingrp]').onclick = openJoinModal;

      const invBtn = main.querySelector('[data-x=invite]');
      if (invBtn) invBtn.onclick = () => {
        U.openModal({
          title: '邀请成员加入「' + team.name + '」',
          body: `<p style="line-height:1.9">将以下邀请码发送给项目组成员,对方注册登录后在「团队管理 → 凭邀请码加入」输入即可加入该项目组:</p>
          <div class="card" style="margin-top:10px;font-family:monospace;font-size:20px;text-align:center;letter-spacing:2px">${U.esc(team.inviteCode)}</div>`,
          footer: `<button class="btn primary" data-x="copy">复制邀请码</button>`,
          onMount(m, close) {
            m.querySelector('[data-x=copy]').onclick = () => {
              navigator.clipboard && navigator.clipboard.writeText(team.inviteCode).catch(() => {});
              close(); U.toast('邀请码已复制', 'success');
            };
          },
        });
      };
      const refBtn = main.querySelector('[data-x=refresh]');
      if (refBtn) refBtn.onclick = () => U.confirm('刷新后「' + team.name + '」的旧邀请码立即失效,确定刷新吗?', async () => {
        try {
          const d = await post('/api/team/invite/refresh', { teamId: team.id });
          team.inviteCode = d.inviteCode;
          U.toast('邀请码已刷新:' + d.inviteCode, 'success', 3200);
          render();
        } catch (e) { U.toast(e.message, 'error', 3200); }
      }, '刷新');
      const leaveBtn = main.querySelector('[data-x=leave]');
      if (leaveBtn) leaveBtn.onclick = () => U.confirm('确定退出项目组「' + team.name + '」吗?', async () => {
        try { await post('/api/team/leave', { teamId: team.id }); activeId = ''; U.toast('已退出项目组', 'success'); reload(); }
        catch (e) { U.toast(e.message, 'error', 3200); }
      }, '退出');

      main.querySelectorAll('[data-kick]').forEach(b => b.onclick = () => {
        const m = members.find(x => x.userId === b.dataset.kick);
        U.confirm(`确定将成员「${m.username}」移出「${team.name}」吗?`, async () => {
          try { await post('/api/team/kick', { teamId: team.id, userId: m.userId }); U.toast('已移除 ' + m.username, 'success'); reload(); }
          catch (e) { U.toast(e.message, 'error', 3200); }
        }, '移除');
      });
      main.querySelectorAll('[data-alloc]').forEach(b => b.onclick = () => {
        const m = members.find(x => x.userId === b.dataset.alloc);
        U.openModal({
          title: '分配积分 · ' + m.username,
          body: `<label class="field"><span>分配额度(管理员直接为对方增加积分)</span><input class="input" type="number" data-f="n" value="100"></label>`,
          footer: `<button class="btn primary" data-x="ok">确定分配</button>`,
          onMount(mm, close) {
            mm.querySelector('[data-x=ok]').onclick = async () => {
              const n = Math.trunc(+mm.querySelector('[data-f=n]').value || 0);
              if (n <= 0) return U.toast('请输入有效额度', 'error');
              try {
                await post('/api/admin/credits', { username: m.username, delta: n, reason: '团队积分分配(' + team.name + ')' });
                close(); U.toast(`已为 ${m.username} 分配 ${n} 积分`, 'success'); reload();
              } catch (e) { U.toast(e.message, 'error', 3500); }
            };
          },
        });
      });
      // 消耗统计:筛选/粒度
      main.querySelectorAll('[data-sf]').forEach(el => el.onchange = () => { stat[el.dataset.sf] = el.value; render(); });
      main.querySelectorAll('[data-grain]').forEach(b => b.onclick = () => { stat.grain = b.dataset.grain; render(); });
    }

    reload();
  };
})();
