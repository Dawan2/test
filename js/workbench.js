/* ============ workbench.js 制作台(§3.3:发布门/问题清单/制作计划 三合一单屏) ============
 * 三个聚合视图本质是同一件事的三个切面:还差什么(发布门)/按什么顺序做(计划)/能不能交付(门禁)。
 * 本模块只做编排与渲染,状态推导与处置一律复用各模块权威实现:
 *   Release.collect/execFix(门禁与一键处置) · Issues.collect/fixIssue(问题清单) · Plans.of/execStep/runAll(计划)。
 * 入口:项目页 tab 行 问题/计划/交付 三角标统一打开本屏(data-wb 分区,带 section 定位)。 */
(function () {
  let openState = null; // {p, main, m, close}

  const GATE_TXT = { pass: ['✅', 'green', '通过'], warn: ['⚠️', 'yellow', '警告'], fail: ['❌', '', '失败'] };
  const SEV_TAG = { high: ['red', '高'], mid: ['yellow', '中'], low: ['', '低'] };
  const ST_ICON = { done: ['✓', 'var(--green)'], failed: ['✕', 'var(--red)'], blocked: ['⚠', 'var(--yellow)'], running: ['⏳', 'var(--accent)'], pending: ['○', 'var(--muted,var(--border))'] };

  /* ---------- 发布门分区 ---------- */
  function paintGate() {
    const { p, main, m } = openState;
    const host = m.querySelector('[data-wb=gate]');
    if (!window.Release) { host.innerHTML = ''; return; }
    const gate = Release.collect(p, { online: true });
    const cls = gate.overall === 'pass' || gate.overall === 'cond-pass';
    host.innerHTML = `
    <div class="card" style="padding:10px 14px">
      <div class="row" style="gap:8px;align-items:center;margin-bottom:6px">
        <b>📦 发布门</b>
        <span class="tag ${cls ? 'green' : 'red'}" style="font-size:10px">${gate.overall === 'pass' ? '可发布' : gate.overall === 'cond-pass' ? '条件通过' : gate.overall === 'warn' ? '有警告' : '未通过'}</span>
        <span class="small muted">评分 ${gate.score}/10 · 阻塞 ${gate.blockers}</span>
        <span class="grow"></span>
        <button class="btn ghost sm" data-wb-x="gate-detail" title="打开完整交付检查(版本留痕/回滚/打包)">完整面板 ›</button>
      </div>
      ${gate.gates.filter(g => g.status !== 'pass').map(g => {
        const [ico, , txt] = GATE_TXT[g.status] || GATE_TXT.warn;
        return `<div class="row" style="gap:8px;align-items:flex-start;padding:4px 0;border-top:1px dashed var(--border)">
          <span style="flex:none">${ico}</span>
          <div class="grow"><span class="small"><b>${U.esc(g.label)}</b></span> <span class="small muted">${U.esc((g.info || '').slice(0, 80))}</span></div>
          ${g.fix ? `<button class="btn sm" data-wb-fix="${g.code}" style="flex:none">${g.fix.type === 'command' ? '一键处置' : '前往处理'}</button>` : `<span class="tag" style="flex:none;font-size:10px">${txt}</span>`}
        </div>`;
      }).join('') || '<div class="small muted">10 项门禁全部通过,可在完整面板打版本/打包交付。</div>'}
    </div>`;
    host.querySelector('[data-wb-x=gate-detail]').onclick = () => { openState.close(); Release.openModal(p, main); };
    host.querySelectorAll('[data-wb-fix]').forEach(b => b.onclick = () => {
      const g = gate.gates.find(x => x.code === b.dataset.wbFix);
      if (!g) return;
      b.disabled = true;
      Release.execFix(p, g, main, () => paintAll(), { issuesAsSection: true });
    });
  }

  /* ---------- 问题清单分区 ---------- */
  function paintIssues() {
    const { p, main, m } = openState;
    const host = m.querySelector('[data-wb=issues]');
    if (!window.Issues) { host.innerHTML = ''; return; }
    const list = Issues.collect(p);
    host.innerHTML = `
    <div class="card" style="padding:10px 14px">
      <div class="row" style="gap:8px;align-items:center;margin-bottom:6px"><b>🩺 问题清单</b><span class="small muted">${list.length ? list.length + ' 项待处理(高/中/低分级)' : '主线畅通'}</span></div>
      ${list.slice(0, 20).map((it, i) => {
        const [cls, sev] = SEV_TAG[it.sev] || ['', ''];
        return `<div class="row" style="gap:8px;align-items:flex-start;padding:4px 0;border-top:1px dashed var(--border)">
          ${cls ? `<span class="tag ${cls}" style="flex:none;font-size:10px">${sev}</span>` : '<span class="tag" style="flex:none;font-size:10px">低</span>'}
          <div class="grow"><span class="small"><b>${U.esc(it.label)}</b></span><div class="small muted">${U.esc((it.detail || '').slice(0, 90))}</div></div>
          ${it.cmd ? `<button class="btn sm primary" data-wb-ifx="${i}" style="flex:none">▶ 处置</button>` : it.goto ? `<button class="btn sm" data-wb-igoto="${i}" style="flex:none">→ 前往</button>` : ''}
        </div>`;
      }).join('') || '<div class="small muted">🎉 无待处理问题。</div>'}
      ${list.length > 20 ? `<div class="small muted" style="margin-top:4px">…另有 ${list.length - 20} 项,完整清单见问题中心。</div>` : ''}
    </div>`;
    host.querySelectorAll('[data-wb-ifx]').forEach(b => b.onclick = async () => {
      b.disabled = true;
      await Issues.fixIssue(p, list[+b.dataset.wbIfx], main, paintAll);
      paintAll();
    });
    host.querySelectorAll('[data-wb-igoto]').forEach(b => b.onclick = () => {
      const it = list[+b.dataset.wbIgoto];
      if (it && it.goto) { openState.close(); location.hash = it.goto; }
    });
  }

  /* ---------- 制作计划分区 ---------- */
  function paintPlans() {
    const { p, main, m } = openState;
    const host = m.querySelector('[data-wb=plans]');
    if (!window.Plans) { host.innerHTML = ''; return; }
    const pl = Plans.of(p);
    if (pl) { // 与计划面板同口径:陈旧 running 收回 pending(页面中途关闭不锁死)
      let stale = false;
      pl.steps.forEach(s => { if (s.status === 'running') { s.status = 'pending'; s.note = '上次执行被中断,可重新执行'; stale = true; } });
      if (stale) Store.save();
    }
    if (!pl) {
      host.innerHTML = `
      <div class="card" style="padding:10px 14px">
        <div class="row" style="gap:8px;align-items:center"><b>📋 制作计划</b><span class="small muted">把「还差什么」落成按序可执行步骤(跨会话持久)</span></div>
        <div class="row" style="gap:8px;margin-top:8px;flex-wrap:wrap">
          <button class="btn sm primary" data-wb-x="fromwf">📋 按主线生成</button>
          <input class="input small grow" data-wb-goal placeholder="或描述目标,如:先把第 1-3 集做出成片" style="min-width:180px">
          <button class="btn sm" data-wb-x="llm">🪄 让助手规划(1积分)</button>
        </div>
      </div>`;
      host.querySelector('[data-wb-x=fromwf]').onclick = () => {
        const plan = Plans.fromWorkflow(p);
        if (!plan) return U.toast('当前主线无待推进事项,无需计划', 'info');
        Plans.replace(p, plan); paintAll();
      };
      host.querySelector('[data-wb-x=llm]').onclick = async () => {
        const goal = (host.querySelector('[data-wb-goal]') || {}).value;
        if (!goal || !goal.trim()) return U.toast('请先描述计划目标', 'info');
        if (await Plans.generate(p, goal)) paintAll();
      };
      return;
    }
    const sm = Plans.summary(p);
    host.innerHTML = `
    <div class="card" style="padding:10px 14px">
      <div class="row" style="gap:8px;align-items:center;margin-bottom:6px;flex-wrap:wrap">
        <b>📋 制作计划</b><span class="small"><b>${U.esc(pl.title)}</b></span>
        <span class="tag cyan" style="font-size:10px">${sm.done}/${sm.total} 完成</span>
        <span class="grow"></span>
        <button class="btn sm primary" data-wb-x="runall">▶ 依次执行</button>
        <button class="btn sm" data-wb-x="rebuild" title="按当前各集状态重新推导步骤">🔄 重建</button>
        <button class="btn sm danger ghost" data-wb-x="drop">🗑</button>
      </div>
      <div style="height:4px;background:var(--border);border-radius:2px;margin-bottom:8px;overflow:hidden"><div style="height:100%;width:${Math.round(sm.done / sm.total * 100)}%;background:var(--green)"></div></div>
      ${pl.steps.map((s, i) => {
        const [ico, color] = ST_ICON[s.status] || ST_ICON.pending;
        return `<div class="row" style="gap:8px;align-items:flex-start;padding:4px 0;border-top:1px dashed var(--border)">
          <b class="small" style="flex:none;color:${color};width:16px;text-align:center">${ico}</b>
          <div class="grow"><span class="small" style="${s.status === 'done' ? 'opacity:.6;text-decoration:line-through' : ''}">${U.esc(s.label)}</span>${s.note ? ` <span class="small muted">${U.esc(s.note)}</span>` : ''}</div>
          ${s.status === 'running' ? '<span class="tag cyan" style="flex:none;font-size:10px">执行中</span>'
            : `<button class="btn sm ${s.status === 'done' ? '' : 'primary'}" data-wb-pstep="${i}" style="flex:none">${s.status === 'done' ? '↺' : s.cmd ? '▶' : s.goto ? '→' : '✓'}</button>`}
        </div>`;
      }).join('')}
    </div>`;
    host.querySelectorAll('[data-wb-pstep]').forEach(b => b.onclick = async () => {
      b.disabled = true;
      await Plans.execStep(p, +b.dataset.wbPstep, main);
      paintAll();
    });
    host.querySelector('[data-wb-x=runall]').onclick = async () => { await Plans.runAll(p, main); paintAll(); };
    host.querySelector('[data-wb-x=rebuild]').onclick = () => {
      const plan = Plans.fromWorkflow(p);
      if (!plan) return U.toast('当前主线无待推进事项', 'info');
      Plans.replace(p, plan); paintAll();
    };
    host.querySelector('[data-wb-x=drop]').onclick = () => U.confirm('放弃当前计划?', () => { Plans.replace(p, null); paintAll(); }, '放弃');
  }

  function paintAll() {
    if (!openState || !openState.m.isConnected) return;
    paintGate(); paintIssues(); paintPlans();
  }

  /* 主线事件驱动即时重算(防抖:批量事件合并一轮重绘;发布门含全量合规扫描,不逐事件原样重跑) */
  let paintTimer = null;
  function bindBus() {
    if (!window.Bus || bindBus._done) return;
    bindBus._done = true;
    Bus.on('*', () => {
      if (!openState || !openState.m.isConnected) return;
      clearTimeout(paintTimer);
      paintTimer = setTimeout(paintAll, 400);
    });
  }
  if (typeof document !== 'undefined') bindBus();

  /* section: 'gate'|'issues'|'plans'(定位滚动);缺省顶部发布门 */
  function openModal(p, main, section) {
    if (openState && openState.close) openState.close();
    U.openModal({
      title: `🎛 制作台 · ${U.esc(p.name)}`,
      wide: true,
      body: '<div data-wb="gate"></div><div data-wb="issues" style="margin-top:12px"></div><div data-wb="plans" style="margin-top:12px"></div>',
      onMount(m, close) {
        openState = { p, main, m, close };
        paintAll();
        if (section) { const el = m.querySelector('[data-wb=' + section + ']'); if (el && el.scrollIntoView) el.scrollIntoView(); }
      },
    });
  }

  window.Workbench = { openModal };
})();
