/* ============ agent-global.js 全局虎鲸导演助手(自 agent.js 拆分) ============
 * 贯穿全流程的右侧抽屉:按当前路由上下文操作,板块协作/意图路由/全局面板渲染与发送。
 * 加载顺序:agent.js 之后(共享状态经 window.AgentCore,ops 域函数经 window.AgentOps);
 * window.AgentG 供 agent.js 的 window.Agent 出口代理,外部调用点不变。 */
(function () {
  const AC = window.AgentCore;
  const AO = window.AgentOps;

  /* ================= 全局导演助手(贯穿全流程:任意页面右侧抽屉,按当前页面上下文操作) ================= */
  let gDrawer = null;

  /* 当前路由 → 操作上下文:{p, ep|null}(注入 AC,agent.js 的 gPersonaBlock/refreshFocusChip 运行时取用) */
  function ctxOf() {
    const h = location.hash;
    let m = h.match(/^#\/project\/([^/]+)\/episode\/([^/]+)$/);
    if (m) {
      const p = Store.getProject(m[1]);
      const ep = p && (p.episodes || []).find(e => e.id === m[2]);
      if (p && ep) return { p, ep };
    }
    m = h.match(/^#\/project\/([^/]+)/);
    if (m) { const p = Store.getProject(m[1]); if (p) return { p, ep: null }; }
    return { p: (Store.state.projects || [])[0] || null, ep: null };
  }
  AC.ctxOf = ctxOf;

  function toggleGlobal() {
    if (gDrawer) { closeGlobal(); return; }
    AC.gBoard = null;
    openDrawer();
  }
  function openDrawer() {
    gDrawer = document.createElement('div');
    gDrawer.className = 'dir-dock pipe-dock';
    gDrawer.style.width = '400px';
    gDrawer.style.zIndex = '950';
    document.body.appendChild(gDrawer);
    document.body.classList.add('agent-docked'); // 主区让位,不遮顶栏
    renderGlobal();
  }
  /* 板块协作入口(制片页「智能体分工」):带着板块人设+板块记忆打开导演助手 */
  function openBoard(key) {
    const b = AGENT_BOARDS.find(x => x.key === key);
    AC.gBoard = b || null;
    if (!gDrawer) openDrawer(); else renderGlobal();
    if (b) U.toast(`${b.ico} ${b.agent}已就位:${b.key}板块协作中`, 'info', 2200);
  }

  /* 🐋 虎鲸全局任务上下文:各板块状态/雇佣专家/流水线概况,注入无板块锁定时的系统提示词 */
  function orcaGlobalCtx(p) {
    if (!p) return '';
    const lines = AGENT_BOARDS.map(b => {
      const bd = (p.boards || {})[b.key] || {};
      const ex = AC.boardExpert(p, b.key);
      return `- ${b.ico}${b.key}(${b.agent}):${bd.stage || '未配置'} · 专家:${ex ? ex.name : '未雇佣'}`;
    });
    const eps = p.episodes || [];
    const shots = eps.reduce((n, e) => n + (e.shots || []).length, 0);
    const vids = eps.reduce((n, e) => n + (e.shots || []).filter(s => Store.shotVideoReady(s)).length, 0); // 统一就绪判定
    const comps = eps.filter(e => Store.epComposedReady(e)).length; // 统一就绪判定:离线模拟合成在线时不算
    lines.push(`- 流水线:分集 ${eps.length} · 分镜 ${shots} · 已出片 ${vids} · 已合成 ${comps}/${eps.length}`);
    return `\n★ 全局任务上下文:\n${lines.join('\n')}\n你是虎鲸,元Agent,掌握以上全局上下文,可回答进度类问题并调度板块专家。`;
  }

  /* 🐋 意图路由(轻量 LLM 调用):判断本条用户消息归属哪个板块;命中返回 {board, reason},未命中/失败返回 null。
   * opId 与主回复共用:一条消息(路由+回复)服务端只扣一次费(llm.agent);
   * step:'route' 声明辅助步骤槽位(九轮步骤状态机:辅助步成功不交付 operation,主回复步才交付) */
  async function routeIntent(ctx, text, model, chat, opId) {
    const { p } = ctx;
    const list = AGENT_BOARDS.map(b => {
      const ex = AC.boardExpert(p, b.key);
      return `- ${b.key}(${b.agent}):${b.focus} · 雇佣专家:${ex ? ex.name : '未雇佣'}`;
    }).join('\n');
    const sys = `你是意图路由器。以下是短剧创作流水线的各板块及其职责:\n${list}\n`
      + `判断用户本条消息最想交给哪个板块处理(创作/修改/执行类意图归属对应板块;进度查询/闲聊/跨板块综合问题返回 null)。`
      + `只返回 JSON {"board":"板块key 或 null","reason":"≤20字"},board 只能是以上板块 key 之一或 null。`;
    const recent = (chat || []).slice(-3, -1) // 本条消息已入列,取最近 2 条上下文
      .filter(m2 => m2 && (m2.role === 'user' || m2.role === 'assistant'))
      .map(m2 => ({ role: m2.role, content: String(m2.text || '').slice(0, 200) }));
    try {
      const out = await API.chatJSON({ model, system: sys, messages: recent.concat([{ role: 'user', content: text }]), temperature: 0.2, max_tokens: 200, billingAction: 'llm.agent', operationId: opId, step: 'route' });
      const b = out && AGENT_BOARDS.find(x => x.key === out.board);
      return b ? { board: b, reason: String(out.reason || '').slice(0, 20) } : null;
    } catch (_) { return null; } // 路由失败静默跳过,走原流程
  }
  function closeGlobal() { if (gDrawer) { gDrawer.remove(); gDrawer = null; document.body.classList.remove('agent-docked'); } }
  window.addEventListener('hashchange', () => { if (gDrawer) renderGlobal(); });
  const refreshGlobal = () => { if (gDrawer) renderGlobal(); }; // 视图模式切换等不触发 hashchange 的场景手动刷新

  /* 项目级 ops 应用器(shot 系 ops 在分集上下文时转交 AO.applyOps) */
  function applyGlobalOps(ctx, ops, record) {
    const { p, ep } = ctx;
    const changes = [];
    const shotOps = [];
    const P_FIELDS = { 名称: 'name', 风格: 'style', 影调: 'tone', 全局设定: 'globalSetting', 目标市场: 'locale' };
    const SM_FIELDS = { 卖点: 'logline', 梗概: 'synopsis' };
    const S_FIELDS = { 名称: 'name', 提示词: 'prompt', 描述: 'description' };
    (ops || []).forEach(op => {
      if (!op || !op.op) return;
      if (op.op === 'project' && p) {
        Object.entries(op.fields || {}).forEach(([k, v]) => {
          const key = P_FIELDS[k] || k;
          if (!['name', 'style', 'tone', 'globalSetting', 'locale'].includes(key)) return;
          const old = p[key];
          p[key] = String(v);
          if (old !== p[key]) changes.push(`项目:${k} ${old || '空'}→${String(v).slice(0, 14)}`);
        });
      } else if (op.op === 'scriptmeta' && p) {
        p.scriptMeta = p.scriptMeta || {};
        Object.entries(op.fields || {}).forEach(([k, v]) => {
          const key = SM_FIELDS[k] || k;
          if (!['logline', 'synopsis'].includes(key)) return;
          const old = p.scriptMeta[key];
          p.scriptMeta[key] = String(v);
          if (old !== p.scriptMeta[key]) changes.push(`剧本:${k} 已更新`);
        });
      } else if (op.op === 'subject' && p) {
        const s = (p.subjects || []).find(x => x.name === String(op.name || '').trim());
        if (!s) { changes.push(`主体「${op.name}」未找到,跳过`); return; }
        Object.entries(op.fields || {}).forEach(([k, v]) => {
          const key = S_FIELDS[k] || k;
          if (!['name', 'prompt', 'description'].includes(key)) return;
          if (key === 'name') {
            /* 十三轮:改名走领域命令——旧名入 formerNames + 镜头/镜头组引用级联,
             * 此前直接改 s.name 会让镜头 characters/scene/props 的旧名引用失联(丢参考图/形态/音色) */
            const r = Store.renameSubject(p, s, String(v));
            changes.push(r.ok ? r.msg : `主体改名失败:${r.msg}`);
            return;
          }
          const old = s[key];
          s[key] = String(v);
          if (old !== s[key]) changes.push(`主体 ${s.name}:${k} 已更新`);
        });
      } else if (op.op === 'episode' && p) {
        const e2 = (p.episodes || []).find(x => x.title === String(op.ep || '').trim() || x.title.includes(String(op.ep || '').trim()));
        if (!e2) { changes.push(`分集「${op.ep}」未找到,跳过`); return; }
        if (op.fields && op.fields.标题) { changes.push(`分集「${e2.title}」→「${op.fields.标题}」`); e2.title = String(op.fields.标题).slice(0, 24); }
        if (op.fields && op.fields.正文 !== undefined) { Store.updateEpisodeContent(e2, String(op.fields.正文)); changes.push(`分集「${e2.title}」正文已更新(${e2.content.length} 字${Store.shotsStale(e2) ? ',分镜标记为旧版' : ''})`); }
      } else if (op.op === 'addep' && p) {
        const base = (p.episodes || [])[0];
        const ne = {
          id: Store.uid('ep'), title: String(op.title || '第' + (p.episodes.length + 1) + '集').slice(0, 24),
          content: String(op.content || ''), shots: [], status: 'draft', composed: false, order: p.episodes.length,
          sbConfig: base ? JSON.parse(JSON.stringify(base.sbConfig || {})) : { syncVoice: false, subtitle: true, ratio: '16:9', shotCount: 8, sbMode: 'create', batchCamera: '固定镜头', batchStrategy: 'ref' },
        };
        p.episodes.push(ne);
        changes.push(`新建分集「${ne.title}」(${ne.content.length} 字)`);
      } else if (op.op === 'delep' && p) {
        // 十轮:删除分集走与分集页相同的闭环——在飞任务拦截 + 回收站快照 + order 重排
        // (此前直接 splice:任务在飞时可删出孤儿扣费、删除不可恢复、后续分集 order 出现空洞)
        const i = (p.episodes || []).findIndex(x => x.title === String(op.ep || '').trim() || x.title.includes(String(op.ep || '').trim()));
        if (i < 0) { changes.push(`分集「${op.ep}」未找到,跳过`); return; }
        const target = p.episodes[i];
        if (window.__epReviewEpId === target.id) { changes.push(`分集「${target.title}」整集审片进行中,未删除`); return; }
        const inflight = window.Tasks ? Tasks.runningInScope({ episodeId: target.id }) : []; // 十二轮:含近 2 分钟服务端任务快照(同步路径无法 await canDeleteScope)
        if (inflight.length) { changes.push(`分集「${target.title}」有 ${inflight.length} 个任务进行中,未删除`); return; }
        Store.trashPut('episode', target.title, { projectId: p.id, ep: target }); // 软删除:回收站 7 天可恢复
        p.episodes.splice(i, 1);
        p.episodes.forEach((x, k) => x.order = k);
        changes.push(`删除分集「${target.title}」(已进回收站,7 天内可恢复)`);
      } else if (ep) {
        shotOps.push(op); // update/insert/delete/move/batch 交给分镜 ops 处理器
      }
    });
    if (ep && shotOps.length) changes.push(...AO.applyOps(ep, shotOps, record));
    return changes;
  }

  /* 全局面板渲染(消息流与内嵌面板共用 ep.agentChat / p.agentChat) */
  function renderGlobal() {
    if (!gDrawer) return;
    const ctx = ctxOf();
    const { p, ep } = ctx;
    const chat = ep ? (ep.agentChat = ep.agentChat || []) : p ? (p.agentChat = p.agentChat || []) : (Store.state.agentGlobal = Store.state.agentGlobal || []);
    const undoObj = ep ? ep.agentUndo : p && p.__agentUndo;
    const ctxLabel = (AC.gBoard ? `${AC.gBoard.ico} ${AC.gBoard.key}·${AC.gBoard.agent} · ` : '') + (ep ? `分集:${ep.title}` : p ? `项目:${p.name}` : '全局(未进入项目)');
    const QUICK_G = AC.gBoard ? ['本板块现在什么状态?', '给我本板块下一步的具体建议', '检查本板块目前的问题'] : ep
      ? ['全部改夜景', '给每镜加运镜', '润色全部台词', '检查分镜逻辑']
      : p ? ['润色一句话卖点', '给第三集写个更强的结尾钩子', '把所有角色提示词统一为当前风格', '检查集纲节奏'] : ['帮我规划一个新项目'];
    // 板块雇佣的功能专家 → 快捷动作(直接调用其完整工作流)
    const bExpId = AC.gBoard && p && p.boards && p.boards[AC.gBoard.key] && p.boards[AC.gBoard.key].expert;
    const bExp = bExpId && (window.allExperts ? allExperts() : (window.EXPERT_DIRECTORS || [])).find(e => e.id === bExpId);
    const EXP_ACTS = { ex_planner: ['🤖 生成项目策划案', 'openPlanner'], ex_localize: ['🌐 剧本译制到目标市场', 'openLocalize'] };
    const expAct = bExp && EXP_ACTS[bExp.id];

    gDrawer.innerHTML = `
    <div class="pipe-head">
      <b>🐋 ${AC.gBoard ? AC.gBoard.agent : '虎鲸'}</b>
      ${AC.gBoard ? '' : '<span class="small muted">元Agent · 总调度</span>'}
      <span class="tag cyan" style="font-size:10px">${U.esc(ctxLabel)}</span>
      <span class="grow"></span>
      ${AC.gBoard ? '<button class="btn ghost sm" data-g="exitboard" title="退出板块协作,回到全流程导演助手">⏏</button>' : ''}
      <button class="btn ghost sm ${(Store.state.settings || {}).agentAuto ? 'primary' : ''}" data-g="auto" title="自动执行:开启后导演助手直接操作工作台(改数据/跳转/调起生成),不再逐条确认;可随时撤销">⚡ 自动${(Store.state.settings || {}).agentAuto ? '·开' : '·关'}</button>
      <button class="btn ghost sm ${AC.prearrOn ? 'primary' : ''}" data-g="prearr" title="预排模式:开启后,分镜/批量生成类意图先落成参数表单预填,你确认「按此方案执行」后才真正发起">🎛 预排${AC.prearrOn ? '·开' : '·关'}</button>
      <button class="btn ghost sm" data-g="mem" title="持久化记忆:记住你的修改意图与偏好,按板块沉淀,跨会话召回">🧠 ${(Store.state.agentMemory || []).filter(m2 => !AC.gBoard || m2.scope === AC.gBoard.key || !m2.scope).length}</button>
      <button class="btn ghost sm" data-g="undo" ${undoObj ? '' : 'disabled'} title="撤销上次应用">↩</button>
      <button class="btn ghost sm" data-g="close" title="收起">✕</button>
    </div>
    ${AC.guideBarHTML(ctx)}
    <div class="agent-chips" style="flex:none" title="板块专家阵容:点击直接对该板块子Agent说话">${AGENT_BOARDS.map(b => {
      const ex = p && AC.boardExpert(p, b.key);
      return `<span class="tag ${AC.gBoard && AC.gBoard.key === b.key ? 'cyan' : ''}" data-g-board="${U.esc(b.key)}" title="${U.esc(b.key)}板块职责:${U.esc(b.focus)}">${b.ico} ${b.key} · ${U.esc(ex ? ex.name : '未雇佣')}</span>`;
    }).join('')}</div>
    <div class="pipe-body" style="display:flex;flex-direction:column;overflow:hidden">
      <div class="agent-chips" data-g-chips style="flex:none"></div>
      <div class="agent-msgs" data-g-msgs style="flex:1;overflow-y:auto"></div>
      <div class="row" data-arefs="g" style="gap:4px;margin:4px 0 0;align-items:center;flex-wrap:wrap;display:none;flex:none"></div>
      <div class="agent-input" style="flex:none">
        ${AC.personaSelectHTML('g', AC.gPersonaId)}
        <textarea class="input small" data-g-in rows="2" placeholder="${ep ? '如:把镜头3改成夜景' : p ? '如:把第二集结尾改成反转;润色卖点' : '先进项目,或直接问我怎么规划'}"></textarea>
        <button class="btn primary sm" data-g="send">发送</button>
      </div>
    </div>`;
    const msgsEl = gDrawer.querySelector('[data-g-msgs]');

    /* 动态情境 chips(与集级面板同源 AO.dynamicChips,renderMsgs 时重算保持新鲜):text 发助手,gotoEp 跳集,ep 上下文 run/goto 走集级注册表,否则走全局注册表 */
    function paintGChips() {
      const el = gDrawer.querySelector('[data-g-chips]');
      if (!el) return;
      const dyn = (p || ep) ? AO.dynamicChips(p, ep) : [];
      el.innerHTML = dyn.map((c, i) => `<span class="tag cyan" data-g-dchip="${i}" title="${U.esc(c.d || '')}" style="cursor:pointer">${c.run ? '▶ ' : (c.goto || c.gotoEp) ? '→ ' : '💬 '}${U.esc(c.t)}</span>`).join('')
        + QUICK_G.map(q => `<span class="tag" data-g-chip="${q}">${q}</span>`).join('')
        + (expAct ? `<span class="tag yellow" data-g-expact="${expAct[1]}">${expAct[0]}</span>` : '');
      el.querySelectorAll('[data-g-dchip]').forEach(c2 => c2.onclick = async () => {
        const c = dyn[+c2.dataset.gDchip];
        if (!c) return;
        if (c.text) sendG(c.text);
        else if (c.gotoEp) location.hash = '#/project/' + p.id + '/episode/' + c.gotoEp; // 跳集:hashchange 触发 renderGlobal 重算
        else if (ep) await AO.runEpisodeActions(p, ep, [c.run ? { op: 'run', action: c.run } : { op: 'goto', target: c.goto }], document.getElementById('main'));
        else AO.runGlobalActions(ctx, [{ op: 'goto', target: c.goto }]);
      });
      el.querySelectorAll('[data-g-chip]').forEach(c2 => c2.onclick = () => sendG(c2.dataset.gChip));
      const expB = el.querySelector('[data-g-expact]');
      if (expB) expB.onclick = () => { // 功能专家快捷动作:调用其完整工作流(AI策划/剧本译制)
        if (!p) return U.toast('请先进入一个项目', 'error');
        if (window.EpisodeLab && EpisodeLab[expB.dataset.gExpact]) EpisodeLab[expB.dataset.gExpact](p, document.getElementById('main'));
      };
    }

    function renderMsgs() {
      paintGChips();
      msgsEl.innerHTML = chat.length ? chat.map((m2, i) => m2.role === 'user'
        ? `<div class="agent-msg user">${(m2.refs && m2.refs.length) ? `<div style="text-align:right;margin-bottom:2px">${m2.refs.map(l => `<span class="tag cyan" style="font-size:10px">📎 ${U.esc(l)}</span>`).join(' ')}</div>` : ''}<div class="agent-bubble">${U.esc(m2.text)}</div></div>`
        : `<div class="agent-msg">
            ${m2.route ? `<div class="small muted" style="font-size:10px;margin:0 0 2px 2px">🐋 虎鲸 → 转交「${U.esc(m2.route.board)}」板块 · ${U.esc(m2.route.expert)}</div>` : ''}
            ${m2.thinking ? `<div class="agent-think" data-g-th="${i}">💭 思考过程 ▾<div class="agent-think-body">${U.esc(m2.thinking)}</div></div>` : ''}
            <div class="agent-bubble asst">${U.esc(m2.text)}</div>
            ${m2.pending ? `
            <div class="agent-preview">
              <b class="small">修改预览(${m2.pending.changes.length} 项):</b>
              <div class="agent-preview-list">${m2.pending.changes.slice(0, 8).map(AO.changeLineHTML).join('')}${m2.pending.changes.length > 8 ? `<div class="small muted">…等 ${m2.pending.changes.length} 项</div>` : ''}</div>
              <div class="row" style="gap:6px;margin-top:8px">
                <button class="btn sm primary" data-g-apply="${i}">✅ 应用修改(-1积分)</button>
                <button class="btn sm" data-g-cancel="${i}">❌ 取消</button>
              </div>
            </div>` : ''}
            ${m2.prearr ? AO.prearrCardHTML(m2.prearr, i, 'g') : ''}
            ${m2.choices ? AO.choiceCardHTML(m2, i, 'g') : ''}
            ${m2.event ? AO.eventCardHTML(m2, i, 'g') : ''}
          </div>`).join('')
        : AC.gBoard
          ? `<div class="hint" style="text-align:center;padding:20px 8px">我是${U.esc(AC.gBoard.agent)} 🐋(板块:${U.esc(AC.gBoard.key)})<br>当前上下文:${U.esc(ctxLabel)}。<br>可以用对话方式推进本板块工作,也可以只是聊聊怎么拍。</div>`
          : p ? `<div class="hint" style="text-align:center;padding:20px 8px">🐋 ${U.esc(AO.openingLine(p, ep))}<br><span class="muted">直接跟我说要做什么,或点上方情境建议一键推进;也可以点上方板块专家对话。</span></div>`
          : `<div class="hint" style="text-align:center;padding:20px 8px">我是虎鲸🐋,全流程总调度。<br>告诉我你要做什么(如「把第3集的反派写得更狠」或「现在进度到哪了」),我会安排对应板块的专家来处理;<br>也可以直接点上方板块专家对话。</div>`;
      msgsEl.scrollTop = msgsEl.scrollHeight;
      msgsEl.querySelectorAll('[data-g-th]').forEach(t => t.onclick = () => t.classList.toggle('open'));
      msgsEl.querySelectorAll('[data-g-apply]').forEach(b => b.onclick = () => applyPendingG(+b.dataset.gApply));
      msgsEl.querySelectorAll('[data-g-cancel]').forEach(b => b.onclick = () => {
        const m2 = chat[+b.dataset.gCancel];
        if (m2) { m2.pending = null; m2.text += '(已取消)'; Store.save(); renderMsgs(); }
      });
      AO.bindPrearr(msgsEl, 'g', { // 🎛 预排卡片:执行/再改改/取消
        getChat: i => chat[i],
        exec: plan => AO.execPrearr(ctx, plan, document.getElementById('main')),
        edit: () => { const inp = gDrawer.querySelector('[data-g-in]'); if (inp) inp.focus(); U.toast('补充你的修改意见,发送后我重出方案', 'info', 2200); },
        done: () => { Store.save(); renderMsgs(); },
        scope: AC.gBoard && AC.gBoard.key,
      });
      AO.bindChoices(msgsEl, 'g', { // 关键决策选项卡:提交后置灰,并以「我选择:xxx」走原发送流程继续
        getChat: i => chat[i],
        submit: (m2, o) => { m2.choiceDone = o.t; Store.save(); sendG('我选择:' + o.t); },
      });
      AO.bindEvents(msgsEl, 'g', { // 事件续谈卡:选项直执真实工作流(目标按钮自带确认与计费)
        getChat: i => chat[i],
        exec: async (m2, o) => {
          m2.eventDone = o.t; Store.save();
          await AO.runEpisodeActions(ctx.p, ctx.ep, [o.run ? { op: 'run', action: o.run } : { op: 'goto', target: o.goto }], document.getElementById('main'));
          if (window.__reroute) window.__reroute();
          renderGlobal();
        },
      });
    }

    function applyPendingG(msgIdx) {
      const m2 = chat[msgIdx];
      if (!m2 || !m2.pending) return;
      const exec = ops => {
        const g = AO.splitOps(ops);
        if (!g.data.length && !g.acts.length) { // 冲突项全部「保留我的」:无可应用项,不扣费
          m2.text += '\n(冲突项已全部保留你的修改,助手方案无可应用项)';
          m2.pending = null;
          Store.save(); renderMsgs();
          return;
        }
        const tk = Tasks.start({ type: '导演助手', model: '应用修改(全局)', target: ctxLabel, cost: 1, projectId: p && p.id, episodeId: ep && ep.id });
        if (!U.charge(1, '导演助手应用修改')) { Tasks.fail(tk, '积分不足'); return; }
        // 撤销快照
        if (ep) ep.agentUndo = { shots: JSON.parse(JSON.stringify(ep.shots)), composed: ep.composed, time: Store.now() };
        if (p) p.__agentUndo = JSON.stringify({ name: p.name, style: p.style, tone: p.tone, globalSetting: p.globalSetting, locale: p.locale, scriptMeta: p.scriptMeta, epOutline: p.epOutline, subjects: p.subjects, episodes: ep ? null : p.episodes });
        const applied = g.data.length ? applyGlobalOps(ctx, g.data, true) : [];
        const vf = ep && g.data.length ? AO.verifyOps(ep, g.data) : null; // 执行闭环验证:分镜类 ops 落数后回读校验
        const actDone = AO.runGlobalActions(ctx, g.acts); // 动作类 ops:真实跳转/调起工作流
        AC.activeStepKey = AC.opBoardKey(ops); // 顶栏步骤高亮 Agent 正在操作的板块
        // 写入持久化记忆:用户指令 + 已应用的修改摘要
        const userMsgG = chat.slice(0, msgIdx).reverse().find(x => x.role === 'user');
        if (userMsgG) AC.memRemember(`「${ctxLabel}」${userMsgG.text.slice(0, 60)} → 已应用:${(applied.length ? applied : m2.pending.changes).slice(0, 3).join(';').slice(0, 80)}`, AC.gBoard && AC.gBoard.key);
        Tasks.done(tk);
        m2.text += `\n(已应用 ${applied.length + actDone.length} 项修改)${vf ? ' ' + AO.verifyNote(vf) : ''}`;
        m2.pending = null;
        Store.save();
        U.toast('修改已应用,可点「↩」回滚', 'success');
        if (window.__reroute) window.__reroute(); // 刷新当前页面呈现修改
        renderGlobal();
      };
      // ⚠ 并行编辑冲突闸:应用前比对发送时指纹基线;命中则逐项版本选择(取消不扣费,预览卡保留)
      const base = AO.getPendingBase(m2);
      const conf = base ? AO.detectConflicts(AO.splitOps(m2.pending.ops).data, base, ctx) : [];
      if (!conf.length) return exec(m2.pending.ops);
      AO.openConflictPanel(conf, decisions => {
        if (!decisions) return; // 取消:暂不应用,预览卡保留待决
        const g0 = AO.splitOps(m2.pending.ops);
        exec(AO.resolveOps(g0.data, conf, decisions, ctx).concat(g0.acts));
      });
    }

    async function sendG(text) {
      text = (text || '').trim();
      if (!text) return;
      if (window.__agentBusy) return U.toast('助手正在处理上一条消息,请稍候', 'info', 2000);
      window.__agentBusy = true;
      try { await sendGInner(text); } finally { window.__agentBusy = false; }
    }
    async function sendGInner(text) {
      if (/^(记住|请记住|记一下)[,:：,，]?\s*/.test(text)) { AC.memRemember(text.replace(/^(记住|请记住|记一下)[,:：,，]?\s*/, '用户要求记住:'), AC.gBoard && AC.gBoard.key); } // 主动记忆(带板块 scope)
      if (AC.prearrOn) { // 🎛 预排模式:创作意图 → 参数预排方案卡片,不直接执行
        if (!API.isReady()) { U.toast('🎛 预排模式需要真实 LLM(未配置或未登录后端),本次已忽略', 'error'); return; }
        chat.push({ role: 'user', text, refs: window.AgentRefs ? AgentRefs.labels(p, ep, 'g') : [], time: Store.now() });
        Store.save();
        renderMsgs();
        AO.prearrSend({
          p, ep, chat, text,
          model: (Store.state.settings || {}).defLLM || API.getConfig().model,
          renderMsgs,
          sysExtra: (AC.gBoard ? `\n你当前作为「${AC.gBoard.key}」板块的${AC.gBoard.agent}与用户协作,聚焦:${AC.gBoard.focus}。${AC.upstreamFinal(ctx.p, AC.gBoard.key)}${AC.boardKBBlock(AC.gBoard.key)}` : '') + AC.gPersonaBlock() + AC.memBlock(text, AC.gBoard && AC.gBoard.key),
        });
        return;
      }
      chat.push({ role: 'user', text, refs: window.AgentRefs ? AgentRefs.labels(p, ep, 'g') : [], time: Store.now() });
      Store.save();
      renderMsgs();
      const baseG = AO.fingerprint(ctx); // ⚠ 并行编辑冲突基线:助手思考期间的手动改动据此检测
      // 上下文压缩:旧消息(除最近 12 条)后台蒸馏为「会话纪要」存 settings.agentSummaryG;压缩中用旧摘要,不阻塞发送
      Store.state.settings = Store.state.settings || {};
      // 七轮:虎鲸对话计费对齐服务端(llm.agent=1/条)——本地同扣 1,路由+回复+纪要蒸馏共用同一 operationId 幂等(只扣一次)
      const agOpId = 'ag_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
      const cmpG = AO.compactChat(chat, Store.state.settings, 'agentSummaryG', agOpId);
      const histBlockG = (cmpG.summary ? `此前会话纪要:${cmpG.summary}\n` : '') + (cmpG.recent.length > 1 ? `最近对话:\n${AO.chatLines(cmpG.recent.slice(0, -1))}\n` : '');
      const model = (Store.state.settings || {}).defLLM || API.getConfig().model;
      const llmPaid = API.isReady() ? U.charge(1, '虎鲸对话') : false;
      if (API.isReady() && !llmPaid) { chat.push({ role: 'assistant', text: '积分不足,虎鲸对话每条 1 积分。', time: Store.now() }); Store.save(); renderMsgs(); return; }
      // 🐋 意图路由:无板块锁定时,虎鲸先判断本条意图归属;命中则转交对应板块子Agent(预排模式不走路由)
      let routed = null;
      if (!AC.gBoard && API.isReady()) routed = await routeIntent(ctx, text, model, chat, agOpId);
      if (routed) {
        AC.gBoard = routed.board; // 会话跟随到该板块(与 openBoard 语义一致)
        const ex = p && AC.boardExpert(p, AC.gBoard.key);
        U.toast(`🐋 已转交「${AC.gBoard.key}」板块 · ${ex ? ex.name : AC.gBoard.agent}`, 'info', 2600);
      }
      // 路由命中后头部/阵容条需整体重渲(原 msgsEl 已脱离文档),用 paint 统一出口
      const paint = () => { if (routed) renderGlobal(); else renderMsgs(); };
      const tk = Tasks.start({ type: routed ? AC.gBoard.agent : '虎鲸', model, target: ctxLabel + '·' + text.slice(0, 12), projectId: p && p.id, episodeId: ep && ep.id });
      let out;
      try {
        if (!API.isReady()) throw new Error('LLM 未配置或未登录后端');
        // 按需查询循环(第三阶段):LLM 首轮可返回 {"query":[...]} 要数据,本地补齐后自动续问(≤2 轮,
        // 共用同 opId 的 q1/q2 步骤槽位,与路由/纪要蒸馏同一条消息只扣一次)
        const llmOptG = {
          model,
          system: buildGlobalPrompt(ctx) + (AC.gBoard ? `\n你当前作为「${AC.gBoard.key}」板块的${AC.gBoard.agent}与用户协作,聚焦:${AC.gBoard.focus}。本板块的生成/审核/定稿节奏由你引导。${AC.upstreamFinal(ctx.p, AC.gBoard.key)}${AC.boardKBBlock(AC.gBoard.key)}` : orcaGlobalCtx(ctx.p)) + AC.gPersonaBlock() + AC.memBlock(text, AC.gBoard && AC.gBoard.key) + AO.queryProtocol(),
          user: histBlockG + buildGlobalUser(ctx, text),
          temperature: 0.4, max_tokens: 6000,
        };
        let qExtraG = '';
        for (let round = 0; ; round++) {
          out = await Understanding.chatJSONRobust(Object.assign({}, llmOptG, {
            user: llmOptG.user + qExtraG,
            billingAction: 'llm.agent', operationId: agOpId, step: round ? 'q' + round : undefined, // 与路由共用同 opId:一条消息(路由+回复+续问)只扣一次
          }));
          const qsG = out && Array.isArray(out.query) ? out.query : null;
          if (!qsG || !qsG.length || round >= 2) break;
          qExtraG += AO.answerQueries(ctx.p, ctx.ep, 'g', qsG);
        }
        Tasks.done(tk);
      } catch (e) {
        if (llmPaid) U.refund(1, '虎鲸对话失败退费', agOpId); // 七轮:失败退回本条对话积分
        Tasks.fail(tk, e.message);
        chat.push({ role: 'assistant', text: '未能理解或服务异常(' + e.message + '),未做任何改动。', time: Store.now() });
        Store.save(); paint();
        return;
      }
      const msg = { role: 'assistant', text: String(out.reply || '收到。'), thinking: String(out.thinking || ''), time: Store.now() };
      if (routed) { // 路由提示:气泡上方小字 chip,标明本条由虎鲸转交给谁
        const ex = p && AC.boardExpert(p, routed.board.key);
        msg.route = { board: routed.board.key, expert: ex ? ex.name : routed.board.agent };
      }
      const chG = AO.parseChoices(out); // 关键决策选项卡(与 ops 预览可并存;通常 LLM 二选一)
      if (chG) msg.choices = chG;
      const ops = Array.isArray(out.ops) ? out.ops.filter(o => o && o.op) : [];
      if (ops.length) {
        const g = AO.splitOps(ops);
        if (g.unknown.length) msg.text += `\n(⊘ 不支持的操作已忽略:${g.unknown.map(o => o.op).join('、')})`; // 二十轮:未知 op 显式回报
        const actDescs = g.acts.map(AO.actDesc); // 注册表分级标注:exec(run)前加 ⚠ 并注明扣费规则
        // 克隆试算预览(不动真数据,仅数据类 ops)
        const cloneCtx = { p: p && JSON.parse(JSON.stringify(p)), ep: null };
        if (ep && cloneCtx.p) cloneCtx.ep = cloneCtx.p.episodes.find(e => e.id === ep.id);
        const changes = (g.data.length ? applyGlobalOps(cloneCtx, g.data, false) : []).concat(actDescs);
        if (changes.length) {
          // ⚠ 并行编辑冲突(手动修改 vs 助手方案):发送时基线 vs 当前指纹,命中则转预览确认逐项选择版本
          const confG = AO.detectConflicts(g.data, baseG, ctx);
          if ((Store.state.settings || {}).agentAuto && !confG.length) {
            // ⚡ 自动执行:read/edit 类免确认直执行(可撤销);exec(run)与 edit-hi(delep 删分集,十轮)
            // 按注册表分级审批,先 U.confirm 确认才执行——删除不可逆,自动模式下也始终确认
            const runOpsG = g.acts.filter(o => AO.opRisk(o) === 'exec');
            const safeActsG = g.acts.filter(o => AO.opRisk(o) !== 'exec');
            const hiDataG = g.data.filter(o => o.op === 'delep');   // 删分集(edit-hi):待确认
            const loDataG = g.data.filter(o => o.op !== 'delep');   // 普通数据修改:直执行
            const tk2 = Tasks.start({ type: '导演助手', model: '自动执行(全局)', target: ctxLabel, cost: 1, projectId: p && p.id, episodeId: ep && ep.id });
            if (U.charge(1, '导演助手自动执行')) {
              if (ep) ep.agentUndo = { shots: JSON.parse(JSON.stringify(ep.shots)), composed: ep.composed, time: Store.now() };
              if (p) p.__agentUndo = JSON.stringify({ name: p.name, style: p.style, tone: p.tone, globalSetting: p.globalSetting, locale: p.locale, scriptMeta: p.scriptMeta, epOutline: p.epOutline, subjects: p.subjects, episodes: ep ? null : p.episodes });
              if (loDataG.length) applyGlobalOps(ctx, loDataG, true);
              const vf = ep && loDataG.length ? AO.verifyOps(ep, loDataG) : null; // 执行闭环验证:分镜类 ops 落数后回读校验
              AO.runGlobalActions(ctx, safeActsG);
              AC.activeStepKey = AC.opBoardKey(ops); // 顶栏高亮正在操作的板块
              Tasks.done(tk2);
              AC.memRemember(`「${ctxLabel}」${text.slice(0, 60)} → 自动执行:${changes.slice(0, 3).join(';').slice(0, 80)}`, AC.gBoard && AC.gBoard.key);
              msg.text += `\n(⚡ 已自动执行 ${loDataG.length + safeActsG.length} 项,可撤销)${vf ? ' ' + AO.verifyNote(vf) : ''}`;
              if (hiDataG.length) {
                // 十轮分级审批:删分集(edit-hi)不可逆,自动模式下同样先确认
                U.confirm(`虎鲸请求删除分集:${hiDataG.map(o => '▶ ' + o.ep).join(';')}(删除后进回收站,7 天内可恢复)。确认执行吗?`, () => {
                  applyGlobalOps(ctx, hiDataG, true);
                  U.toast('已删除 ' + hiDataG.length + ' 个分集(可从回收站恢复)', 'success', 2500);
                  if (window.__reroute) window.__reroute();
                  renderGlobal();
                }, '▶ 确认删除');
                msg.text += `\n(⚠ ${hiDataG.length} 个删除类操作待确认)`;
              }
              if (runOpsG.length) {
                // 分级审批:exec 类动作按各功能规则另行扣费,自动模式下也需用户确认
                U.confirm(`虎鲸请求执行以下动作(将按各功能规则扣费):${runOpsG.map(o => '▶ ' + o.action).join(';')}`, () => {
                  AO.runGlobalActions(ctx, runOpsG);
                  U.toast('已执行:' + runOpsG.map(o => o.action).join('、'), 'success', 2500);
                  if (window.__reroute) window.__reroute();
                  renderGlobal();
                }, '▶ 确认执行');
                msg.text += `\n(⚠ ${runOpsG.length} 个执行类动作待确认)`;
              }
              chat.push(msg); // 自动执行成功同样留存助手回复(原漏推,会话历史丢失本条)
              Store.save();
              U.toast('导演助手已自动执行', 'success');
              if (window.__reroute) window.__reroute();
              renderGlobal();
              return;
            }
            Tasks.fail(tk2, '积分不足');
            msg.text += '\n(自动执行失败:积分不足,未改动)';
          } else {
            if (confG.length) msg.text += `\n(⚠ 你在助手思考期间手动改过 ${confG.length} 处,点「应用修改」逐项选择版本)`;
            msg.pending = { ops, changes };
            AO.setPendingBase(msg, baseG); // 基线随消息存(会话内有效;刷新后应用退化为直接应用)
          }
        }
      }
      chat.push(msg);
      Store.save();
      paint();
    }

    gDrawer.querySelector('[data-g=close]').onclick = closeGlobal;
    const gAuto = gDrawer.querySelector('[data-g=auto]');
    if (gAuto) gAuto.onclick = () => {
      Store.state.settings = Store.state.settings || {};
      Store.state.settings.agentAuto = !Store.state.settings.agentAuto;
      Store.save();
      U.toast(Store.state.settings.agentAuto ? '⚡ 自动执行已开启:助手将直接操作工作台(可撤销)' : '自动执行已关闭:修改前先预览确认', 'info', 2500);
      renderGlobal();
    };
    const gPrearr = gDrawer.querySelector('[data-g=prearr]');
    if (gPrearr) gPrearr.onclick = () => {
      AC.setPrearr(!AC.prearrOn);
      U.toast(AC.prearrOn ? '🎛 预排模式已开启:生成类意图先出参数方案,确认后才执行' : '🎛 预排模式已关闭:恢复正常对话与执行', 'info', 2500);
      renderGlobal();
    };
    const gExit = gDrawer.querySelector('[data-g=exitboard]');
    if (gExit) gExit.onclick = () => { AC.gBoard = null; renderGlobal(); };
    const gMem = gDrawer.querySelector('[data-g=mem]');
    if (gMem) gMem.onclick = () => AC.openMemoryModal(AC.gBoard && AC.gBoard.key);
    gDrawer.querySelector('[data-g=undo]').onclick = () => {
      if (ep && ep.agentUndo) {
        ep.shots = ep.agentUndo.shots;
        ep.composed = ep.agentUndo.composed;
        ep.shots.forEach((s, i) => s.order = i);
        ep.agentUndo = null;
      } else if (p && p.__agentUndo) {
        const snap = JSON.parse(p.__agentUndo);
        Object.assign(p, { name: snap.name, style: snap.style, tone: snap.tone, globalSetting: snap.globalSetting, locale: snap.locale, scriptMeta: snap.scriptMeta, epOutline: snap.epOutline, subjects: snap.subjects });
        if (snap.episodes) p.episodes = snap.episodes;
        p.__agentUndo = null;
      } else return;
      Store.save();
      U.toast('已撤销上次修改', 'success');
      if (window.__reroute) window.__reroute();
      renderGlobal();
    };
    // chips 绑定统一在 paintGChips(renderMsgs 每次重算时重建并绑定,此处不再重复)
    // 板块专家阵容 chip:点击直接对该板块子Agent说话(与制片页「智能体分工」入口同语义)
    gDrawer.querySelectorAll('[data-g-board]').forEach(c2 => c2.onclick = () => openBoard(c2.dataset.gBoard));
    // Agent 身份下拉:本会话以所选专家人设工作(仅会话内记忆;''=明确选择默认助手)
    const gPersona = gDrawer.querySelector('[data-g-persona]');
    if (gPersona) gPersona.onchange = () => {
      AC.gPersonaId = gPersona.value;
      const ex = AC.findExpert(AC.gPersonaId);
      U.toast('已切换为 ' + (ex ? ex.name : '默认助手'), 'success', 1800);
    };
    gDrawer.querySelector('[data-g=send]').onclick = () => {
      const inp = gDrawer.querySelector('[data-g-in]');
      sendG(inp.value);
      inp.value = '';
    };
    gDrawer.querySelector('[data-g-in]').onkeydown = e => {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); gDrawer.querySelector('[data-g=send]').click(); }
    };
    renderMsgs();
    if (window.AgentRefs) AgentRefs.paint(); // 📎 引用 chips 行(容器随抽屉重渲为空,此处重填并接线)
  }

  function buildGlobalPrompt(ctx) {
    const { p, ep } = ctx;
    const shotSpec = ep ? `
{"op":"update","shot":镜头号,"fields":{"剧情/名称/运镜/提示词/旁白/台词/时长":"新值"}}
{"op":"insert","after":镜头号,"shot":{"名称":"","剧情":"","提示词":""}}
{"op":"delete","shot":镜头号}  {"op":"move","shot":镜头号,"to":目标位置}
{"op":"batch","filter":{"含人物":"角色名"},"fields":{...}}` : '';
    return `你是「虎鲸导演助手」,短剧创作智能体,贯穿剧本→主体→分集→分镜→生成→成片全流程。${window.KB ? KB.block() : ''}
当前上下文:${ep ? `项目「${p.name}」分集「${ep.title}」` : p ? `项目「${p.name}」` : '项目列表'}。
用户给自然语言指令,你要么给建议,要么输出结构化修改 ops。返回 JSON {"reply":"中文回复","thinking":"一句话思考摘要","ops":[操作]}(可选键 "choices" 见下)。
支持的 ops:
{"op":"project","fields":{"名称/风格/影调/全局设定":"新值"}}
{"op":"scriptmeta","fields":{"卖点/梗概":"新值"}}
{"op":"subject","name":"主体名","fields":{"名称/提示词/描述":"新值"}}
{"op":"episode","ep":"第二集","fields":{"标题/正文":"新值"}}
{"op":"addep","title":"第十一集","content":"正文"}  {"op":"delep","ep":"第三集"}${shotSpec}
★ 动作类 ops(会真正驱动工作台执行,慎用但可用):
{"op":"goto","target":"制片|剧本|导演|主体|分集|成片库|剧壳|切片|一键跑批"}(跳转到对应板块/工作区)
{"op":"run","action":"AI策划|剧本译制"}(调起对应完整工作流)${ep ? `
{"op":"run","action":"${AO.actProtocol()}"}(驱动当前分集工作台)
{"op":"select","shot":镜头号}` : ''}
纯咨询/建议类问题 ops 返回 []。${p ? `项目风格:${p.style}。` : ''}修改类指令必须给 ops,不要只在 reply 里说"已修改"。
★ 关键决策点选项卡:当对话处于创作方向/风格/方案等关键决策点、适合让用户拍板时,额外返回可选键 "choices":{"title":"选择主题(如:复仇方向选择)","options":[{"t":"方向一:标题","d":"一句话描述"}]}(2-4 个);返回 choices 的本轮 ops 返回 [],等用户提交选择后再据此继续。`;
  }
  function buildGlobalUser(ctx, text) {
    const { p, ep } = ctx;
    let info = '';
    if (p) {
      info += `项目:${p.name}(${p.style})\n主体:${(p.subjects || []).map(s => s.name).join('、') || '无'}\n`;
      info += `分集:${(p.episodes || []).map(e => `${e.title}(${(e.content || '').length}字,${(e.shots || []).length}镜)`).join('、') || '无'}\n`;
      if (p.scriptMeta) info += `卖点:${p.scriptMeta.logline || ''}\n梗概:${(p.scriptMeta.synopsis || '').slice(0, 200)}\n`;
      if (p.script) info += `剧本摘要:${p.script.slice(0, 600)}\n`;
    }
    if (ep) info += `本集剧本摘要:${(ep.content || '').slice(0, 400)}\n当前分镜表:\n${AO.compactShots(ep)}\n`;
    info += AO.stateBlock(p, ep); // ★ 实时状态摘要(分镜出片/确认/审片/合成/在飞任务;无 ep 时给各集进度)
    if (window.AgentRefs) info += AgentRefs.block(p, ep, 'g'); // 📎 用户引用对象(添加到对话):活对象内容 + 精确 ops 指引
    return info + `\n用户指令:${text}`;
  }

  window.AgentG = { toggleGlobal, closeGlobal, refreshGlobal, openBoard, applyGlobalOps, isOpen: () => !!gDrawer };
})();
