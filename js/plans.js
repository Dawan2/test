/* ============ plans.js 持久计划(协同层,第三阶段) ============
 * 项目级制作计划 p.agentPlan:跨会话持久(Store 落库,不再随聊天历史上限淘汰),
 * 步骤映射统一领域命令(episode.generateStoryboard/generateVideos/compose…)或导航动作;
 * 执行经 Commands.execute(ui 模式:决策闸保留),回执驱动步骤状态(done/failed/blocked/pending),
 * 每步落定 emit Bus 'plan.step'(Agent 对话流/问题中心角标同源感知)。
 * 两种生成路径:本地推导 fromWorkflow(零成本,主线全链 playbook 投影 × Domain 状态)/
 * LLM 规划 generate(1 积分,按用户目标拆步)。
 * 入口:项目页「计划」按钮(角标=进行中进度)。 */
(function () {

  const online = () => !!(window.Media && Media.isReady && Media.isReady());

  /* ================= 本地推导:主线全链投影 × 各集状态(零成本,推荐默认) =================
   * 命令名与步序一律现取 Skills 的主线全链 playbook(SK-05 core.playbookProjection),本层不写第二份命令链:
   * 投影的每一步在 TODO_OF 里登记一个取材器,只回答「这一步在本项目/本集当下待不待办、步骤文案怎么写」,
   * 判定一律现取 Domain:集级取 episodeState,项目级前置三步(剧本/主体/分集)取 gateBlockers
   * (状态口径与流程条/问题中心/CLI workflow 同源)。
   * 排法:项目级步(提取主体/主体生图/剧本拆集)按投影步序排在前,集级步逐集取该集在投影上的首个待办步;上限 12 步。
   * args 照投影原样(主线全链一律留空):授权位(拆集 overwrite、全量生成 confirmAll)与子集位
   * (shotIds/subjectIds)属人工决策,计划层不替用户预授权——需要授权或需要人工挑选的状态一律出导航步
   * (补剧本/重新拆镜/重生成过期镜/确认镜头),让用户到页面上自己定,不拿假 args 冒充可执行。
   * 审片是主线一等步骤(与 Domain.workflow 的 review 步同口径),headless 下可真实执行。 */
  const CHAIN_ID = 'core.playbookProjection'; // 主线全链:主体→分集→分镜→生成→审片→成片
  const chainOf = () => ((window.Skills && Skills.playbook(CHAIN_ID)) || { steps: [] }).steps;
  /* 集级/项目级由命令元数据判定(needs 含 ep 即集级),本层不写第二份作用域表 */
  const epScope = cmd => {
    const m = window.CmdRegistry && CmdRegistry.byName[cmd];
    return !!(m && (m.needs || []).indexOf('ep') >= 0);
  };

  /* 项目级前置门槛(剧本/主体/分集三步)现取 Domain.gateBlockers,按阻塞码取材:
   * 「剧本在不在 / 主体库空不空 / 缺几张图 / 有没有分集」的判据只在那一处,本层不写第三份
   * (从前这里另判一遍「整本原文非空」,与门槛派生的「有原文或提取过主体」不同口径:
   * 提取过主体但没存整本原文的老项目,流程条与问题中心认它有剧本、计划步认它没有,整份计划推不出来)。
   * 映射是显式的:计划步要答的是「该跑哪条命令」,与阻塞项形状不同,故码 → 步骤文案在本层落地,
   * 计数一律取阻塞项自带的 count,不在本层重数一遍。 */
  const gateMap = p => {
    const m = {};
    (Domain.gateBlockers(p) || []).forEach(g => { m[g.code] = g; });
    return m;
  };

  /* 投影步取材器:cmd → (ctx)=>{key,label,goto?}|null(不待办);ctx 项目级 {p, gates},集级另带 {ep, st, hash}。
   * 登记为 null = 该投影步不占计划步(理由写在旁注)——投影加了新步而这里漏登记时,Plans.projection() 的契约断言先红。 */
  const TODO_OF = {
    // 剧本那一步已过(gateBlockers 不报 no-script)而主体库还空着
    'project.extractSubjects': ({ gates }) => (!gates['no-script'] && gates['no-subjects'])
      ? { key: 'extract', label: '提取主体:剧本已在库,主体库还空着' } : null,
    'subject.generateImage': ({ gates }) => {
      const g = gates['subjects-no-image'];
      return g ? { key: 'subj', label: `补齐主体参考图(${g.count} 个缺图)` } : null;
    },
    'project.splitEpisodes': ({ gates }) => (!gates['no-script'] && gates['no-eps'])
      ? { key: 'split', label: '剧本拆集:整本切成分集' } : null,
    // 本集理解是智能分镜编排的内部第一步(已有理解可复用不重扣),不单独占一个计划步
    'episode.understanding': null,
    'episode.generateStoryboard': ({ ep, st, hash }) => {
      if (!(ep.content || '').trim()) return { key: 'script:' + ep.id, label: '补充剧本:' + ep.title, goto: hash };
      if (!st.counts.total) return { key: 'sb:' + ep.id, label: '智能分镜:' + ep.title };
      // 重拆会整表覆盖已有分镜(含已出片镜):覆盖属人工决策,出导航步不代授权
      if (st.shotsStale) return { key: 'reshoot:' + ep.id, label: '重新拆镜:' + ep.title + '(剧本/图谱已更新)', goto: hash };
      return null;
    },
    // 就绪检查零 LLM 零计费、只报不拦,是各步的前置结论面(出片前置检查单屏与一键成片内部各自已跑),不占计划步
    'episode.preflight': null,
    'episode.generateVideos': ({ ep, st, hash }) => {
      const c = st.counts;
      if (c.failed) return { key: 'fix:' + ep.id, label: `重生成失败镜:${ep.title}(${c.failed} 镜)` };
      if (c.done < c.total) return { key: 'gen:' + ep.id, label: `生成视频:${ep.title}(${c.total - c.done} 镜待出)` };
      // 过期镜要按 shotIds 挑子集、未确认镜要过确认闸:两者都不用假 args 代办,出导航步
      if (c.stale) return { key: 'regen:' + ep.id, label: `重生成过期镜:${ep.title}(${c.stale} 镜)`, goto: hash };
      if (c.unconfirmed) return { key: 'cfm:' + ep.id, label: `确认镜头:${ep.title}(${c.unconfirmed} 镜)`, goto: hash };
      return null;
    },
    'episode.smartReview': ({ ep, st }) => {
      if (st.reviewAvg === null || st.reviewAvg === undefined) {
        return { key: 'rv:' + ep.id, label: (st.reviewStale ? '重新审片:' : '整集审片:') + ep.title + (st.reviewStale ? '(记录已过期)' : '') };
      }
      if (st.reviewAvg < Domain.REVIEW_MIN) return { key: 'rv:' + ep.id, label: `审片修订:${ep.title}(均分 ${st.reviewAvg})` };
      return null;
    },
    'episode.compose': ({ ep, st }) => st.composedReady ? null
      : { key: 'cp:' + ep.id, label: (ep.composed ? '重新合成:' : '合成成片:') + ep.title },
  };

  function fromWorkflow(p) {
    if (!p) return null;
    const chain = chainOf();
    if (!chain.length || !window.CmdRegistry) return null; // 投影或命令元数据缺位:如实不出计划,不拿手写链兜底
    const on = online();
    const steps = [];
    /* 投影步 + 取材结论 → 计划步:命令名/参数取投影,导航步不挂命令(没有可执行命令的人工动作) */
    const push = (proj, todo, ctx) => {
      const step = Object.assign({ status: 'pending' }, todo);
      if (!step.goto) {
        step.cmd = proj.cmd;
        if (ctx.ep) step.epid = ctx.ep.id;
        if (Object.keys(proj.args || {}).length) step.args = Object.assign({}, proj.args);
      }
      steps.push(step);
    };
    /* 按投影步序取待办:集级只取首个待办步(逐集一步,与流程条的"下一步"同粒度) */
    const pick = (ctx, wantEp) => {
      for (let i = 0; i < chain.length; i++) {
        const proj = chain[i];
        if (epScope(proj.cmd) !== wantEp || !TODO_OF[proj.cmd]) continue;
        const todo = TODO_OF[proj.cmd](ctx);
        if (!todo) continue;
        push(proj, todo, ctx);
        if (wantEp) return;
      }
    };
    pick({ p, gates: gateMap(p) }, false);
    (p.episodes || []).forEach(ep => pick({
      p, ep, st: Domain.episodeState(p, ep, on), hash: `#/project/${p.id}/episode/${ep.id}`,
    }, true));
    if (!steps.length) return null;
    return {
      id: Store.uid('pl'), title: '主线推进计划', goal: '按创作主线逐集推进到成片',
      steps: steps.slice(0, 12), createdAt: Store.now(), updatedAt: Store.now(),
    };
  }

  /* 投影自省(契约断言用):主线全链投影每一步 → 本层登记了取材器吗、它占不占计划步 */
  function projection() {
    return chainOf().map(x => ({
      cmd: x.cmd, ep: epScope(x.cmd),
      registered: Object.prototype.hasOwnProperty.call(TODO_OF, x.cmd),
      occupies: !!TODO_OF[x.cmd],
    }));
  }

  /* ================= LLM 规划:用户目标 → 步骤清单(1 积分,失败退费) =================
   * 步骤钳制:cmd 必须在 Commands.list() 注册表内;集级命令必须能按分集标题定位到 epid,否则丢弃该步。
   * 人设句取自注册表键 plan.system(用户在「全局默认值」页改得到);可用领域命令白名单与返回 JSON 契约
   * 仍就地拼、不开放覆盖——改坏即整轮拆不出有效步骤。 */
  async function generate(p, goal) {
    goal = String(goal || '').trim().slice(0, 200);
    if (!goal) { U.toast('请先描述计划目标', 'info'); return null; }
    const model = (Store.state.settings || {}).defLLM || (window.API ? API.getConfig().model : '');
    return Tasks.run({ type: '制作计划', model, target: p.name + '·' + goal.slice(0, 12), cost: 1, actionName: '制作计划生成', projectId: p.id }, async () => {
      const cmds = window.Commands ? Commands.list().map(c => c.name).join(',') : '';
      const epsInfo = (p.episodes || []).map(e => {
        const st = Domain.episodeState(p, e, online());
        return `${e.title}[${st.status}${st.counts.total ? ':' + st.counts.done + '/' + st.counts.total + '出片' : ''}]`;
      }).join(';');
      const out = await Understanding.chatJSONRobust({
        model,
        system: Prompts.get('plan.system') + `可用领域命令:${cmds || '(无)'}(episode.generateStoryboard=智能分镜/episode.generateVideos=批量生成视频/episode.smartReview=整集审片/episode.compose=合成成片/episode.produce=一键成片/episode.understanding=本集理解;其余步骤 cmd 留空,由用户手动完成)。只返回 JSON {"title":"计划名(≤12字)","steps":[{"label":"步骤名(≤20字)","cmd":"命令名或空串","ep":"分集标题(仅集级命令需要,须与分集列表完全一致)"}]}(2-8 步,按执行顺序)。`,
        user: `项目「${p.name}」(${p.style || ''})。分集列表:${epsInfo || '暂无分集'}。用户目标:${goal}`,
        temperature: 0.3, max_tokens: 1500,
        billingAction: 'llm.agent', operationId: 'pl_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5),
      });
      const known = new Set(window.Commands ? Commands.list().map(c => c.name) : []);
      const steps = (Array.isArray(out && out.steps) ? out.steps : []).map(s0 => {
        const label = String((s0 && s0.label) || '').trim().slice(0, 24);
        if (!label) return null;
        const cmd = known.has(s0.cmd) ? s0.cmd : null;
        let epid = null;
        if (cmd && /^episode\.(generateStoryboard|generateVideos|smartReview|compose|produce|understanding)$/.test(cmd)) {
          const t = String((s0 && s0.ep) || '').trim();
          const e = (p.episodes || []).find(x => x.title === t) || (t && (p.episodes || []).find(x => x.title.includes(t)));
          if (!e) return null; // 集级命令定位不到分集:丢弃该步,不猜
          epid = e.id;
        }
        return cmd
          ? { key: Store.uid('pls'), label, cmd, epid, status: 'pending' }
          : { key: Store.uid('pls'), label, goto: '#/project/' + p.id, status: 'pending' };
      }).filter(Boolean).slice(0, 8);
      if (!steps.length) throw new Error('未能生成有效步骤');
      return { id: Store.uid('pl'), title: String((out && out.title) || '制作计划').slice(0, 12), goal, steps, createdAt: Store.now(), updatedAt: Store.now() };
    });
  }

  /* ================= 计划读写与执行 ================= */
  const of = p => (p && p.agentPlan) || null;
  /* 进度摘要(角标用):{total, done, pending} */
  function summary(p) {
    const pl = of(p);
    if (!pl || !pl.steps.length) return null;
    const done = pl.steps.filter(s => s.status === 'done').length;
    return { total: pl.steps.length, done, pending: pl.steps.length - done };
  }
  /* 覆写计划(生成/重建/放弃共用落点) */
  function replace(p, plan) {
    p.agentPlan = plan || null;
    Store.save();
    return plan;
  }

  /* 执行单步:命令步骤经统一命令层(ui 模式),回执驱动状态;导航步骤到位即 done;无命令步骤为手动勾选。
   * 状态语义:done=完成/failed=失败/blocked=待人工(needs_human 质量闸门)/pending=可(重)执行(用户取消回退)。 */
  async function execStep(p, i, main) {
    const plan = of(p);
    const st = plan && plan.steps[i];
    if (!st || st.status === 'running') return null;
    if (st.goto) { location.hash = st.goto; st.status = 'done'; st.note = '已导航到位'; }
    else if (st.cmd) {
      if (!window.Commands) { U.toast('命令层未加载,请稍后重试', 'error'); return null; }
      st.status = 'running'; st.note = '';
      Store.save();
      let r;
      try { r = await Commands.execute(st.cmd, Object.assign({ pid: p.id, epid: st.epid, main: main || document.getElementById('main'), ui: true }, st.args || {})); }
      catch (e) { r = { ok: false, status: 'failed', error: { code: 'exception', message: (e && e.message) || String(e) } }; }
      st.time = Store.now();
      const code = r && r.error && r.error.code;
      if (r && r.ok) {
        st.status = 'done';
        const z = r.result || {};
        st.note = (r.cost ? '-' + r.cost + '积分' : '') + ((z.total !== undefined && z.total !== null) ? ` ${z.ok}/${z.total}` : '');
      } else if (r && r.status === 'needs_human') { st.status = 'blocked'; st.note = (r.error && r.error.message) || '待人工处理'; }
      else if (r && r.status === 'blocked' && ['cancelled', 'compliance-declined', 'human-review'].includes(code)) { st.status = 'pending'; st.note = '已取消,可重新执行'; }
      else { st.status = 'failed'; st.note = (r && r.error && r.error.message) || '执行失败'; }
      if (window.Bus) Bus.emit('plan.step', { p, idx: i, step: st, r, brief: `计划步骤「${st.label}」→ ${st.status === 'done' ? '完成' : st.status}` });
    } else { st.status = st.status === 'done' ? 'pending' : 'done'; st.note = ''; } // 手动勾选类
    plan.updatedAt = Store.now();
    Store.save();
    return st;
  }

  /* 依次执行到首个未完成步骤:命令步骤执行完继续下一步;导航/失败/待人工即停(人工查看后可继续) */
  async function runAll(p, main) {
    const plan = of(p);
    if (!plan) return;
    if (plan.steps.some(s => s.status === 'running')) return U.toast('计划正在执行中', 'info');
    for (let i = 0; i < plan.steps.length; i++) {
      const st = plan.steps[i];
      if (st.status === 'done') continue;
      await execStep(p, i, main);
      if (st.status !== 'done') { U.toast(`📋 计划在「${st.label}」暂停:${st.note || '需人工处理'}`, 'info', 3500); return; }
    }
    U.toast('📋 计划全部完成', 'success');
  }

  /* ================= 计划管理弹窗 ================= */
  const ST_ICON = { done: ['✓', 'var(--green)'], failed: ['✕', 'var(--red)'], blocked: ['⚠', 'var(--yellow)'], running: ['⏳', 'var(--accent)'], pending: ['○', 'var(--muted,var(--border))'] };
  let openState = null; // {p, bodyEl, close, main}

  function stepRow(pl, s, i) {
    const [ico, color] = ST_ICON[s.status] || ST_ICON.pending;
    return `
    <div class="row" style="gap:8px;align-items:flex-start;padding:7px 0;border-bottom:1px dashed var(--border)">
      <b class="small" style="flex:none;color:${color};width:16px;text-align:center">${ico}</b>
      <div class="grow">
        <div class="small" style="${s.status === 'done' ? 'opacity:.6;text-decoration:line-through' : 'font-weight:600'}">${U.esc(s.label)}</div>
        ${s.note ? `<div class="small muted" style="font-size:11px">${U.esc(s.note)}</div>` : ''}
      </div>
      ${s.status === 'running' ? '<span class="tag cyan" style="flex:none;font-size:10px">执行中</span>'
      : `<button class="btn sm ${s.status === 'done' ? '' : 'primary'}" data-pstep="${i}" style="flex:none">${s.status === 'done' ? '↺ 重做' : s.cmd ? '▶ 执行' : s.goto ? '→ 前往' : '✓ 勾选'}</button>`}
    </div>`;
  }

  function paintBody() {
    const { p, bodyEl, main } = openState;
    const pl = of(p);
    if (pl) {
      // 二十轮:陈旧 running 复位——步骤置 running 后页面中途关闭,持久化的 running 会永久锁死 runAll
      // ("计划正在执行中"无复位入口);打开计划面板即把 running 收回 pending 可重试
      let stale = false;
      pl.steps.forEach(s => { if (s.status === 'running') { s.status = 'pending'; s.note = '上次执行被中断,可重新执行'; stale = true; } });
      if (stale) Store.save();
    }
    if (!pl) {
      bodyEl.innerHTML = `
      <div class="hint" style="margin-bottom:10px">制作计划跨会话持久保存:步骤映射统一领域命令(执行含确认闸/计费),完成状态自动推进;两种建立方式——</div>
      <div class="row" style="gap:8px;align-items:flex-start;margin-bottom:14px">
        <div class="grow small">📋 <b>按主线生成</b>:按主线全链步序与当前各集状态推导推进步骤(零成本,可随状态重建)</div>
        <button class="btn sm primary" data-x="fromwf">📋 按主线生成</button>
      </div>
      <div class="row" style="gap:8px;align-items:flex-start">
        <input class="input small grow" data-goal placeholder="描述目标,如:先把第 1-3 集做出成片" style="min-width:200px">
        <button class="btn sm" data-x="llm">🪄 让助手规划(1积分)</button>
      </div>`;
      bodyEl.querySelector('[data-x=fromwf]').onclick = () => {
        const plan = fromWorkflow(p);
        if (!plan) return U.toast('当前主线无待推进事项,无需计划', 'info');
        replace(p, plan);
        U.toast('已按主线生成计划', 'success');
        paintBody();
      };
      bodyEl.querySelector('[data-x=llm]').onclick = async () => {
        const inp = bodyEl.querySelector('[data-goal]');
        const goal = inp && inp.value;
        if (!goal || !goal.trim()) return U.toast('请先描述计划目标', 'info');
        const plan = await generate(p, goal);
        if (plan) { U.toast('计划已生成', 'success'); paintBody(); }
      };
      return;
    }
    const sm = summary(p);
    bodyEl.innerHTML = `
    <div class="row" style="gap:6px;margin-bottom:8px;flex-wrap:wrap;align-items:center">
      <b>${U.esc(pl.title)}</b>
      <span class="tag cyan" style="font-size:10px">${sm.done}/${sm.total} 完成</span>
      ${pl.goal ? `<span class="small muted">目标:${U.esc(pl.goal)}</span>` : ''}
    </div>
    <div style="height:4px;background:var(--border);border-radius:2px;margin-bottom:10px;overflow:hidden"><div style="height:100%;width:${Math.round(sm.done / sm.total * 100)}%;background:var(--green)"></div></div>
    ${pl.steps.map((s, i) => stepRow(pl, s, i)).join('')}
    <div class="row" style="gap:8px;margin-top:12px;flex-wrap:wrap">
      <button class="btn sm primary" data-x="runall">▶ 依次执行到下一步</button>
      <button class="btn sm" data-x="rebuild" title="按当前各集状态重新推导步骤(保留已完成段落的勾选语义)">🔄 按主线重建</button>
      <button class="btn sm danger ghost" data-x="drop">🗑 放弃计划</button>
    </div>`;
    bodyEl.querySelectorAll('[data-pstep]').forEach(b => b.onclick = async () => {
      b.disabled = true;
      await execStep(p, +b.dataset.pstep, main);
      paintBody();
    });
    bodyEl.querySelector('[data-x=runall]').onclick = async () => { await runAll(p, main); paintBody(); };
    bodyEl.querySelector('[data-x=rebuild]').onclick = () => {
      const plan = fromWorkflow(p);
      if (!plan) return U.toast('当前主线无待推进事项', 'info');
      replace(p, plan);
      paintBody();
    };
    bodyEl.querySelector('[data-x=drop]').onclick = () => U.confirm('放弃当前计划?', () => { replace(p, null); paintBody(); }, '放弃');
  }

  function openModal(p, main) {
    if (openState && openState.close) openState.close();
    U.openModal({
      title: `📋 制作计划 · ${U.esc(p.name)}`,
      wide: true,
      body: '<div data-plans-body></div>',
      onMount(m, close) {
        openState = { p, bodyEl: m.querySelector('[data-plans-body]'), close, main };
        paintBody();
      },
    });
    /* 计划步骤落定(Bus plan.step)→ 弹窗开着即时刷新进度 */
    if (window.Bus && !openModal._sub) {
      openModal._sub = true;
      Bus.on('plan.step', () => { if (openState && openState.bodyEl && openState.bodyEl.isConnected) paintBody(); });
    }
  }

  /* 项目页入口按钮内联 HTML */
  function badgeHTML(p) {
    const sm = summary(p);
    return `📋 计划${sm ? (sm.pending ? ` ${sm.done}/${sm.total}` : ' ✓') : ''}`;
  }

  window.Plans = { of, summary, fromWorkflow, projection, generate, replace, execStep, runAll, openModal, badgeHTML };
})();
