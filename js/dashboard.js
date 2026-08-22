/* ============ dashboard.js 数据看板(计量透明化) ============
 * LLM 用量、任务成功率、积分流水集中可视化。
 * 数据源:GET /api/llm/usage(服务端计量,含 byDay/byModel)+ state.tasks(任务统计)+ state.creditLogs(积分流水)。
 * 离线时 LLM 区块降级为提示,本地统计照常展示。
 */
(function () {
  window.Views = window.Views || {};
  const dayStart = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d.getTime(); };
  const fmtNum = n => n >= 10000 ? (n / 10000).toFixed(1) + 'w' : String(n);

  Views.dashboard = function (main, initTab) {
    let usage = null, usageErr = '';
    let dtab = initTab === 'tasks' ? 'tasks' : 'dash'; // dash=数据看板 | tasks=任务监控(二级页)

    async function loadUsage() {
      const token = Store.getToken();
      if (!token) { usageErr = '未连接服务端:启动 node server.js 并登录后可查看 LLM 计量'; if (main.isConnected) render(); return; }
      try {
        const res = await fetch('/api/llm/usage', { headers: { 'Authorization': 'Bearer ' + token } });
        const j = await res.json();
        if (j.code === 0) usage = j.data; else usageErr = j.message || '用量数据加载失败';
      } catch (_) { usageErr = '服务端不可达,当前为离线模式,仅展示本地统计'; }
      if (!main.isConnected) return;
      render();
    }

    function statCard(ico, label, val, sub) {
      return `<div class="card dash-stat">
        <div class="dash-stat-ico">${ico}</div>
        <div><div class="dash-stat-val">${val}</div>
        <div class="small muted">${label}${sub ? ` · ${sub}` : ''}</div></div>
      </div>`;
    }

    function barRows(items, valOf, labelOf, maxVal) {
      if (!items.length) return '<div class="empty" style="padding:24px"><p class="small muted">暂无数据</p></div>';
      return items.map(it => {
        const v = valOf(it), w = Math.max(2, Math.round(v / maxVal * 100));
        return `<div class="dash-bar-row">
          <span class="dash-bar-label" title="${U.esc(labelOf(it))}">${U.esc(labelOf(it))}</span>
          <div class="dash-bar-track"><div class="dash-bar-fill" style="width:${w}%"></div></div>
          <span class="dash-bar-val">${fmtNum(v)}</span>
        </div>`;
      }).join('');
    }

    function render() {
      const u = Store.currentUser();
      const tasks = Store.state.tasks || [];
      const t0 = dayStart();
      const running = tasks.filter(t => t.status === 'running').length;
      const todayDone = tasks.filter(t => t.status === 'done' && t.finishedAt >= t0);
      const todayFailed = tasks.filter(t => t.status === 'failed' && t.finishedAt >= t0);
      const finished = tasks.filter(t => t.status !== 'running');
      const successRate = finished.length ? Math.round(finished.filter(t => t.status === 'done').length / finished.length * 100) : 100;
      // 今日积分消耗:以积分流水为准(type=spend 且时间为今天),不再用 running 任务预估
      const todayStr = Store.now().split(' ')[0];
      const todayCost = (Store.state.creditLogs || [])
        .filter(l => l.userId === u.id && l.type === 'spend' && (l.time || '').startsWith(todayStr))
        .reduce((s, l) => s + (l.amount || 0), 0);
      // 合格片成本口径:视频生成类任务(文生视频=分镜视频生成 / 节拍板生成)中 status=done 记为合格片;
      // 总消耗优先取积分流水(reason 含「分镜视频生成/节拍板生成」的 spend 减 refund,失败退费不计入),
      // 流水无匹配记录时回退任务 cost 字段(失败已退费,净消耗按 done 任务合计)
      const VGEN_TYPES = ['文生视频', '节拍板生成'];
      const vgen = tasks.filter(t => VGEN_TYPES.includes(t.type) && t.status !== 'running');
      const vDone = vgen.filter(t => t.status === 'done').length;
      const vFailed = vgen.filter(t => t.status === 'failed').length;
      const vlogs = (Store.state.creditLogs || []).filter(l => l.userId === u.id && /分镜视频生成|节拍板生成/.test(String(l.reason || '')) && (l.type === 'spend' || l.type === 'refund'));
      let vCost = null;
      if (vlogs.length) vCost = vlogs.reduce((s, l) => s + (l.type === 'spend' ? (l.amount || 0) : -(l.amount || 0)), 0);
      else if (vgen.length) vCost = vgen.filter(t => t.status === 'done').reduce((s, t) => s + (t.cost || 0), 0);
      const vUnit = (vCost !== null && vDone) ? (Math.round(vCost / vDone * 10) / 10) + ' 积分' : '—';
      const vRate = (vDone + vFailed) ? Math.round(vDone / (vDone + vFailed) * 100) + '%' : '—';
      // 任务类型 top8(按消耗积分)
      const byType = {};
      tasks.forEach(t => { byType[t.type] = (byType[t.type] || 0) + (t.cost || 0); });
      const typeTop = Object.entries(byType).map(([type, cost]) => ({ type, cost })).sort((a, b) => b.cost - a.cost).slice(0, 8);
      const typeMax = Math.max(1, typeTop.length ? typeTop[0].cost : 0);
      const logs = (Store.state.creditLogs || []).filter(l => l.userId === u.id).slice(0, 10);
      const byDay = usage && usage.byDay ? usage.byDay : [];
      const dayMax = byDay.reduce((m, d) => Math.max(m, d.tokens), 1);
      const byModel = usage && usage.byModel ? usage.byModel : [];
      const modelMax = byModel.reduce((m, x) => Math.max(m, x.tokens), 1);

      main.innerHTML = `
      <div class="page">
        <div class="page-head">
          <div>
            <div class="page-title">数据看板</div>
            <div class="page-sub">LLM 计量 · 任务统计 · 积分流水,消耗一目了然;任务监控为二级页</div>
          </div>
          ${dtab === 'dash' ? '<button class="btn" data-x="refresh">↻ 刷新</button>' : ''}
        </div>
        <div class="tabs" style="margin-bottom:14px">
          <div class="tab ${dtab === 'dash' ? 'active' : ''}" data-dtab="dash">📊 数据看板</div>
          <div class="tab ${dtab === 'tasks' ? 'active' : ''}" data-dtab="tasks">📋 任务监控</div>
        </div>
        <div data-dashbody style="display:${dtab === 'dash' ? '' : 'none'}">
        <div class="dash-grid">
          ${statCard('💎', '当前积分', u ? u.credits : 0)}
          ${statCard('🔥', '今日积分消耗', todayCost, '流水口径')}
          ${statCard('📈', '任务成功率', successRate + '%', `${finished.length} 个已结束`)}
          ${statCard('🎬', '合格片单位成本', vUnit, `合格 ${vDone} 片 · 净消耗 ${vCost === null ? '—' : vCost + ' 积分'}`)}
          ${statCard('🎯', '抽卡成功率', vRate, `合格 ${vDone} / 失败 ${vFailed}`)}
          ${statCard('⚡', '今日 LLM 调用', usage ? usage.today.calls : '—')}
          ${statCard('🔤', '今日 Tokens', usage ? fmtNum(usage.today.tokens) : '—')}
          ${statCard('🧮', '累计调用 / Tokens', usage ? `${fmtNum(usage.total.calls)} / ${fmtNum(usage.total.tokens)}` : '—')}
        </div>
        ${usageErr ? `<div class="hint" style="margin:-6px 0 12px">☁️ ${U.esc(usageErr)}</div>` : ''}

        <div class="dash-cols">
          <div class="card" style="padding:16px">
            <b class="small">LLM 消耗趋势(近 14 天,tokens)</b>
            ${usage ? `
            <div class="dash-trend">
              ${byDay.map(d => `<div class="dash-trend-col" title="${d.day}: ${d.calls} 次调用 / ${d.tokens} tokens">
                <div class="dash-trend-bar" style="height:${Math.max(2, Math.round(d.tokens / dayMax * 100))}%"></div>
                <span class="dash-trend-day">${d.day}</span>
              </div>`).join('')}
            </div>` : '<div class="empty" style="padding:24px"><p class="small muted">离线模式不可用</p></div>'}
          </div>
          <div class="card" style="padding:16px">
            <b class="small">模型消耗排行(top ${byModel.length},按 tokens)</b>
            <div style="margin-top:10px">
            ${usage ? barRows(byModel, x => x.tokens, x => `${x.model} · ${x.calls}次`, modelMax) : '<div class="empty" style="padding:24px"><p class="small muted">离线模式不可用</p></div>'}
            </div>
          </div>
        </div>

        <div class="dash-cols">
          <div class="card" style="padding:16px">
            <b class="small">任务统计</b>
            <div class="row" style="gap:18px;margin:12px 0">
              <span class="small">⏳ 进行中 <b>${running}</b></span>
              <span class="small">✅ 今日完成 <b>${todayDone.length}</b></span>
              <span class="small">❌ 今日失败 <b>${todayFailed.length}</b></span>
            </div>
            <b class="small muted">积分消耗类型分布(top 8)</b>
            <div style="margin-top:8px">
              ${barRows(typeTop, x => x.cost, x => x.type, typeMax)}
            </div>
          </div>
          <div class="card" style="padding:16px">
            <b class="small">最近积分流水(10 条)</b>
            ${logs.length ? `<table class="tbl" style="margin-top:10px">
              <thead><tr><th>类型</th><th>金额</th><th>余额</th><th>事由</th><th>时间</th></tr></thead>
              <tbody>${logs.map(l => `<tr>
                <td><span class="tag ${l.type === 'spend' ? '' : l.type === 'recharge' ? 'green' : 'cyan'}">${{ spend: '消费', gain: '获得', refund: '返还', recharge: '充值' }[l.type] || l.type}</span></td>
                <td>${l.type === 'spend' ? '-' : '+'}${l.amount}</td>
                <td>${l.balance}</td>
                <td class="small">${U.esc(l.reason || '')}</td>
                <td class="small muted">${U.esc(l.time || '')}</td>
              </tr>`).join('')}</tbody>
            </table>` : '<div class="empty" style="padding:24px"><p class="small muted">暂无流水</p></div>'}
          </div>
        </div>
        </div>
        <div data-tkhost style="display:${dtab === 'tasks' ? '' : 'none'}"></div>
      </div>`;

      main.querySelectorAll('[data-dtab]').forEach(t => t.onclick = () => { dtab = t.dataset.dtab; render(); });
      if (dtab === 'tasks') Views.tasks(main.querySelector('[data-tkhost]'), true);
      const rf = main.querySelector('[data-x=refresh]');
      if (rf) rf.onclick = () => { usage = null; usageErr = ''; loadUsage(); render(); };
    }

    loadUsage();
    render();
  };
})();
