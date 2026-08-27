/* ============ agent.js 🐋 虎鲸导演助手(智能体对话面板) ============ */
(function () {
  const QUICK = ['全部改夜景', '给每镜加运镜', '润色全部台词', '检查分镜逻辑'];
  /* FIELD_MAP 与 ops 执行域已拆至 agent-ops.js(window.AgentOps) */

  /* ---- 板块智能体(按真实制片分工):每个功能板块一个 Agent,人与板块 Agent 协作完成 生成→审核→定稿 ---- */
  const AGENT_BOARDS = [
    { key: '导演', ico: '🎬', agent: '定调导演', focus: '整体创作定调:导演阐述/美术风格/影调光影/画幅平台/剪辑节奏/表演声音/一致性约束,引导用户完善「导演」页并对后续生成生效' },
    { key: '剧本', ico: '📝', agent: '主编剧', focus: '剧本打磨:卖点/梗概/集纲/围读问题/事件图谱,确保故事结构与钩子强度' },
    { key: '主体', ico: '🎭', agent: '选角美术指导', focus: '人物/场景/道具主体提取与形象生成,白底三视图,参考图质量与一致性' },
    { key: '分集', ico: '📚', agent: '分集策划', focus: '分集节奏/集纲/每集内容完整性与结尾卡点' },
    { key: '分镜', ico: '🎥', agent: '分镜导演', focus: '场次/情绪节拍/文字分镜/分镜表,运镜景别与画面提示词质量' },
    { key: '生成', ico: '🏭', agent: '制片主任', focus: '视频生成/配音/合成的进度与失败归因,批量与跑批策略,成本控制' },
    { key: '审片', ico: '🧐', agent: '审片总监', focus: '整集审片与修订闭环:逐镜四维评审、低分镜归因、按问题清单修订提示词并重抽、复审达标后放行合成' },
    { key: '成片', ico: '📦', agent: '交付监制', focus: '成片合成/版本对比/导出交付与发布门处置' },
  ];
  window.AGENT_BOARDS = AGENT_BOARDS;

  /* ---- 跨文件共享状态(供 agent-global.js 经 window.AgentCore 读写;ops 域函数经 window.AgentOps) ----
   * gBoard=当前全局助手所处板块(null=全流程通用);gPersonaId=全局面板下拉选择(会话内);
   * activeStepKey=Agent 正在操作的板块(顶栏步骤高亮);prearrOn=预排模式开关(会话内记忆);
   * ctxOf(当前路由→操作上下文)由 agent-global.js 加载时注入 */
  const AC = window.AgentCore = {
    gBoard: null, gPersonaId: null, activeStepKey: '',
    prearrOn: false,
    setPrearr(on) { AC.prearrOn = on; try { sessionStorage.setItem('agentPrearr', on ? '1' : '0'); } catch (e) { /* 忽略 */ } },
    ctxOf: null,
  };
  try { AC.prearrOn = sessionStorage.getItem('agentPrearr') === '1'; } catch (e) { /* 隐私模式等场景忽略 */ }

  /* 板块方法论注入清单(按 KB.SECTIONS 键取用):板块 Agent 就位时整条注入本板块的知识库条目。
   * 与 KB.block() 压缩摘要互补——摘要给全流程通识,本表给本板块的完整口径;
   * 同一条提示词内不重复注入:分镜板块的 景别运镜/场面调度/剪辑节奏 由记忆种子(memAll KB_SEEDS)承担,故不列。 */
  const BOARD_KB = {
    剧本: ['反转五式', '人物体系', '剧本诊断', '文案AI味'],
    主体: ['主体参考'],
    分集: ['六阶段结构'],
    分镜: ['轴线匹配', '多镜头写法'],
  };
  function boardKBBlock(boardKey) {
    const keys = (window.KB && BOARD_KB[boardKey]) || [];
    if (!keys.length) return '';
    return `\n★ 「${boardKey}」板块方法论(知识库条目,创作与审核按此口径):\n` + keys.map(k => '- ' + KB.section(k)).join('\n');
  }

  /* 板块雇佣的专家对象(制片页「智能体分工」雇佣,未雇佣返回 null) */
  function boardExpert(p, boardKey) {
    const exId = p && p.boards && p.boards[boardKey] && p.boards[boardKey].expert;
    return (exId && (window.allExperts ? allExperts() : (window.EXPERT_DIRECTORS || [])).find(e => e.id === exId)) || null;
  }
  /* 板块雇佣的专家人设:该板块 Agent 获得所聘专家的专业能力(制片页「智能体分工」雇佣) */
  function boardExpertBlock(p, boardKey) {
    const ex = boardExpert(p, boardKey);
    if (!ex) return '';
    return `\n★ 本板块已雇佣专家「${ex.name}」,你同时具备其专业能力:${ex.persona}`;
  }

  /* 上游定稿传导文本:某板块的上游已定稿内容作为权威约束注入板块 Agent 系统提示词 */
  function upstreamFinal(p, boardKey) {    const order = AGENT_BOARDS.map(b => b.key);
    const idx = order.indexOf(boardKey);
    if (!p || idx <= 0) return '';
    const finals = order.slice(0, idx).map(k => ({ k, bd: (p.boards || {})[k] || {} })).filter(x => x.bd.stage === '已定稿');
    if (!finals.length) return '';
    const lines = finals.map(x => `- ${x.k}(定稿于 ${x.bd.time || '-'})${x.bd.note ? ':审核意见「' + String(x.bd.note).slice(0, 50) + '」' : ''}`);
    return `\n★ 上游已定稿(权威约束,不得偏离):\n${lines.join('\n')}\n涉及上游板块内容时按定稿执行;若用户要求改动已定稿内容,提醒其回到上游板块先「解锁定稿」。`;
  }

  /* 专家雇佣(偏好学习→专家雇佣):被雇佣的平台导演人设注入导演助手系统提示词 */
  function expertPersona() {
    const ex = window.hiredExpert && window.hiredExpert();
    return ex ? `\n你当前以平台雇佣导演「${ex.name}」的人设工作:${ex.persona}` : '';
  }

  /* ---- Agent 身份下拉(身份切换):生效人设解析顺序 = 面板下拉选择 > 板块雇佣专家 > 全局雇佣导演 > 无 ----
   * 下拉值语义:undefined/null=未手动选过(跟随默认链路);''=用户明确选了「默认助手」(不注入任何人设);专家 id=以该专家人设工作 */
  function findExpert(id) { return id && window.allExperts ? (allExperts().find(e => e.id === id) || null) : null; }
  /* 集级助手生效人设:下拉选择(ep.agentPersonaId 持久化) > 全局雇佣 */
  function aPersonaBlock(ep) {
    if (ep && ep.agentPersonaId !== undefined && ep.agentPersonaId !== null) {
      const ex = findExpert(ep.agentPersonaId);
      return ex ? `\n★ 本会话用户指定你以专家「${ex.name}」的人设工作:${ex.persona}` : '';
    }
    return expertPersona();
  }
  /* 全局助手生效人设:下拉选择 > 板块雇佣专家 > 全局雇佣 */
  function gPersonaBlock() {
    if (AC.gPersonaId !== null && AC.gPersonaId !== undefined) {
      const ex = findExpert(AC.gPersonaId);
      return ex ? `\n★ 本会话用户指定你以专家「${ex.name}」的人设工作:${ex.persona}` : '';
    }
    if (AC.gBoard && AC.ctxOf) { const b = boardExpertBlock(AC.ctxOf().p, AC.gBoard.key); if (b) return b; }
    return expertPersona();
  }
  /* 身份下拉 HTML:🐋 默认助手 + 全部专家(预置+自定义);未手动选过时默认选中当前全局雇佣者并标「已雇佣」 */
  function personaSelectHTML(pre, selId) {
    const hired = window.hiredExpert && hiredExpert();
    const eff = (selId === undefined || selId === null) ? (hired ? hired.id : '') : selId;
    const opts = (window.allExperts ? allExperts() : []).map(e =>
      `<option value="${U.esc(e.id)}" ${e.id === eff ? 'selected' : ''}>${U.esc(e.ico || '🎭')} ${U.esc(e.name)}${hired && e.id === hired.id ? '(已雇佣)' : ''}</option>`);
    return `<select class="agent-persona" data-${pre}-persona title="助手身份:本会话以所选专家人设工作"><option value="" ${eff === '' ? 'selected' : ''}>🐋 默认助手</option>${opts.join('')}</select>`;
  }

  /* ---- 持久化记忆:记住用户过往的修改意图/偏好,跨会话召回注入 ----
   * 轻量实现:state.agentMemory(上限 50 条,先进先出);召回=最近 4 条 + 与当前输入关键词重合度最高的 4 条 */
  /* 板块改名迁移 + 标准沉淀/知识库种子补种:派生走 WfCore 双端单源(headless 侧
   * /api/wf/memory-seed 与 CLI memory seed 吃同一份种子表),记忆桶/知识库/时间戳/板块词表经参数注入;
   * 落点仍是既有 Store.state.agentMemory,种子表与迁移表不在本文件留第二份 */
  function memAll() {
    const r = WfCore.memSeed(Store.state.agentMemory, {
      kb: window.KB || null, now: () => Store.now(), boards: AGENT_BOARDS.map(b => b.key),
    });
    Store.state.agentMemory = r.mem;
    if (r.changed) Store.save();
    return Store.state.agentMemory;
  }
  function memRemember(text, scope) {
    text = String(text || '').trim();
    if (!text) return;
    const mem = memAll();
    mem.push({ text: text.slice(0, 120), time: Store.now(), scope: scope || '' });
    Store.state.agentMemory = mem.slice(-50);
    Store.save();
  }
  /* 召回算法下沉 wf-core.js(双端同源):对话层与 /api/wf/* 工作流端点同算法消费记忆 */
  function memRecall(input, scope) { return WfCore.memRecall(memAll(), input, scope); }
  function memBlock(input, scope) { return WfCore.memBlock(memAll(), input, scope); }
  function openMemoryModal(scope) {
    const all = memAll();
    // 带原始下标的过滤列表(删除/清空按原始下标操作,避免错位)
    const indexed = all.map((m2, i) => ({ m: m2, i })).filter(x => !scope || x.m.scope === scope || !x.m.scope).reverse();
    U.openModal({
      title: `🧠 导演助手记忆${scope ? '(板块:' + scope + ')' : ''}(${all.length}/50 条)`,
      wide: true,
      body: indexed.length ? `
        <div class="hint" style="margin-bottom:10px">记录你过去的修改意图与偏好(应用修改时自动记录;对话中说「记住…」可主动写入),按板块沉淀,会在后续对话中自动召回,越用越懂你。</div>
        ${indexed.map(({ m, i }) => `
        <div class="row" style="gap:8px;margin-bottom:6px;align-items:flex-start">
          <div class="grow small" style="line-height:1.6">${m.scope ? `<span class="tag cyan" style="font-size:10px;margin-right:4px">${U.esc(m.scope)}</span>` : ''}${U.esc(m.text)}<div class="small muted">${U.esc(m.time)}</div></div>
          <button class="btn ghost sm danger" data-mdel="${i}" style="flex:none">✕</button>
        </div>`).join('')}` : '<div class="empty"><p class="small muted">暂无记忆。应用一次导演助手的修改,或对它说「记住…」试试。</p></div>',
      footer: indexed.length ? `<button class="btn danger" data-x="clear">清空${scope ? '该板块' : '全部'}记忆</button>` : '',
      onMount(m, close) {
        m.querySelectorAll('[data-mdel]').forEach(b => b.onclick = () => {
          memAll().splice(+b.dataset.mdel, 1); Store.save(); close(); openMemoryModal(scope);
        });
        const clr = m.querySelector('[data-x=clear]');
        if (clr) clr.onclick = () => U.confirm('清空记忆?', () => {
          if (scope) Store.state.agentMemory = memAll().filter(m2 => m2.scope !== scope && m2.scope); // 板块清空:只删该板块有 scope 的
          else Store.state.agentMemory = [];
          Store.save(); close(); U.toast('记忆已清空', 'success');
        }, '清空');
      },
    });
  }

  /* ---- 添加到对话(对象级精准引用):工作台任意对象挂为「📎 引用」,发送时把活对象内容注入 LLM 上下文 ----
   * 引用是会话级指针(kind+pid+eid+id,sessionStorage 持久,上限 6 个);对象被删则芯片置灰、注入时标注失效。
   * 镜头/节拍/场次引用对应 update/beatupdate/sceneupdate ops(集级面板);主体引用对应 subject ops(全局抽屉)。 */
  const AgentRefs = window.AgentRefs = {
    list: (() => { try { return JSON.parse(sessionStorage.getItem('agentRefs') || '[]'); } catch (e) { return []; } })(),
    save() { try { sessionStorage.setItem('agentRefs', JSON.stringify(AgentRefs.list.slice(-12))); } catch (e) { /* 隐私模式等忽略 */ } },
    keyOf: r => [r.kind, r.pid, r.eid || '', r.id].join('|'),
    add(ref) {
      const k = AgentRefs.keyOf(ref);
      if (AgentRefs.list.some(r => AgentRefs.keyOf(r) === k)) { U.toast('该对象已在对话引用中', 'info', 1600); return false; }
      if (AgentRefs.list.length >= 6) { U.toast('引用最多 6 个,请先在助手面板移除一些', 'error'); return false; }
      AgentRefs.list.push(ref); AgentRefs.save(); AgentRefs.paint();
      U.toast('已加入对话引用 📎 ' + ref.label, 'success', 1800);
      return true;
    },
    remove(key) { AgentRefs.list = AgentRefs.list.filter(r => AgentRefs.keyOf(r) !== key); AgentRefs.save(); AgentRefs.paint(); },
    /* 当前上下文可见的引用:集级面板(scope='ep')只看本集(镜头/节拍/场次);全局抽屉(scope='g')看本项目全部(含主体) */
    forCtx(p, ep, scope) {
      if (!p) return [];
      return AgentRefs.list.filter(r => r.pid === p.id && (scope === 'g' || (ep && r.eid === ep.id)));
    },
    /* 解析活对象(对象被删返回 null) */
    resolve(r, p) {
      if (!p) return null;
      if (r.kind === 'subject') { const s = (p.subjects || []).find(x => x.id === r.id); return s ? { s } : null; }
      const ep = (p.episodes || []).find(e => e.id === r.eid);
      if (!ep) return null;
      if (r.kind === 'shot') { const i = (ep.shots || []).findIndex(x => x.id === r.id); return i >= 0 ? { ep, s: ep.shots[i], i } : null; }
      const bd = ep.scriptBoard;
      if (!bd || !bd.scenes) return null;
      if (r.kind === 'scene') { const sc = bd.scenes[+r.id]; return sc ? { ep, sc, si: +r.id } : null; }
      if (r.kind === 'beat') { const [si, bi] = String(r.id).split('_').map(Number); const sc = bd.scenes[si]; const bt = sc && sc.beats[bi]; return bt ? { ep, sc, bt, si, bi } : null; }
      return null;
    },
    /* 活标签:镜头调序/主体改名后引用芯片仍显示当前编号与名称 */
    liveLabel(r, p) {
      const o = AgentRefs.resolve(r, p);
      if (!o) return r.label;
      if (r.kind === 'shot') return `@镜头${o.i + 1}${o.s.name ? '·' + String(o.s.name).slice(0, 8) : ''}`;
      if (r.kind === 'subject') return `@${o.s.name}`;
      if (r.kind === 'scene') return `@场次${o.si + 1}${o.sc.title ? '·' + String(o.sc.title).slice(0, 8) : ''}`;
      return r.label; // beat:id 即场次_节拍索引,原 label 即准
    },
    /* chips 行 HTML(scope 'ep'|'g');空则返回 ''(容器自行隐藏) */
    chipsHTML(p, ep, scope) {
      const rs = AgentRefs.forCtx(p, ep, scope);
      if (!rs.length) return '';
      return `<span class="small muted" style="flex:none">📎 引用:</span>` + rs.map(r => {
        const alive = !!AgentRefs.resolve(r, p);
        const lb = alive ? AgentRefs.liveLabel(r, p) : r.label;
        return `<span class="tag ${alive ? 'cyan' : ''}" style="font-size:11px;${alive ? '' : 'opacity:.55;text-decoration:line-through'}" title="${alive ? '发送消息时,该对象的当前内容会一并带给助手' : '对象已删除,引用失效(点 ✕ 移除)'}">${U.esc(lb)}<b data-aref-del="${U.esc(AgentRefs.keyOf(r))}" style="cursor:pointer;margin-left:4px;font-weight:700">✕</b></span>`;
      }).join('');
    },
    /* 引用 → 注入 LLM 的上下文文本(发送时快照活对象内容;按面板域给出对应 ops 用法指引) */
    block(p, ep, scope) {
      const rs = AgentRefs.forCtx(p, ep, scope);
      if (!rs.length) return '';
      const lines = [], hints = [];
      rs.forEach(r => {
        const o = AgentRefs.resolve(r, p);
        if (!o) { lines.push(`- ${r.label}(已失效:对象已删除,忽略此引用)`); return; }
        if (r.kind === 'shot') {
          lines.push(`- 引用镜头${o.i + 1}${o.s.name ? '「' + o.s.name + '」' : ''}:剧情「${(o.s.plot || '').slice(0, 60)}」 提示词「${(o.s.prompt || '').slice(0, 90)}」 台词「${(o.s.dialogue || '').slice(0, 30)}」 旁白「${(o.s.narration || '').slice(0, 30)}」`);
          hints.push(`改被引用镜头用 {"op":"update","shot":${o.i + 1},...}(镜头号以当前分镜表为准)`);
        } else if (r.kind === 'beat') {
          lines.push(`- 引用场次${o.si + 1}·节拍${o.bi + 1}:情绪[${o.bt.emotion || '平'}] 剧情「${(o.bt.plot || '').slice(0, 80)}」 分镜文字「${(o.bt.shot || '').slice(0, 120)}」`);
          hints.push(`改该节拍用 {"op":"beatupdate","scene":${o.si + 1},"beat":${o.bi + 1},...}`);
        } else if (r.kind === 'scene') {
          lines.push(`- 引用场次${o.si + 1}「${(o.sc.title || '').slice(0, 30)}」:场次剧情「${(o.sc.text || '').slice(0, 120)}」`);
          hints.push(`改该场次用 {"op":"sceneupdate","scene":${o.si + 1},...}`);
        } else if (r.kind === 'subject') {
          lines.push(`- 引用主体「${o.s.name}」(${{ character: '角色', scene: '场景', prop: '道具' }[o.s.kind] || o.s.kind}):设定提示词「${(o.s.prompt || '').slice(0, 120)}」 描述「${(o.s.description || '').slice(0, 60)}」`);
          if (scope === 'g') hints.push(`改该主体用 {"op":"subject","name":"${o.s.name}",...}`);
        }
      });
      return `\n★ 用户引用对象(${rs.length} 个):用户说的「这个/这些」默认指它们;修改类指令请精确作用于引用对象,不要波及未引用对象。\n${lines.join('\n')}${hints.length ? '\n' + [...new Set(hints)].join('\n') : ''}\n`;
    },
    labels(p, ep, scope) { return AgentRefs.forCtx(p, ep, scope).map(r => AgentRefs.liveLabel(r, p)); },
    /* 面板引用行实时刷新(添加/移除后由各处调用;只刷 chips 容器不重渲整个面板,避免打断输入) */
    paint() {
      const { p, ep } = AC.ctxOf ? AC.ctxOf() : {};
      document.querySelectorAll('[data-arefs]').forEach(box => {
        box.innerHTML = AgentRefs.chipsHTML(p, ep, box.dataset.arefs);
        box.style.display = box.innerHTML ? '' : 'none';
        box.querySelectorAll('[data-aref-del]').forEach(x => x.onclick = () => AgentRefs.remove(x.dataset.arefDel));
      });
    },
  };

  /* ops 执行域(动作执行器/预排模式族/上下文与分镜压缩/focusOf·focusBlock/ops 应用器/执行闭环验证)
   * 已整体拆至 agent-ops.js(window.AgentOps,本文件之后加载;render 等运行时入口经 AO 取用) */

  /* 定位 chip 实时刷新(脚本层聚焦不重渲页面,由 storyboard 聚焦时调用) */
  function refreshFocusChip() {
    const { p, ep } = AC.ctxOf ? AC.ctxOf() : {};
    document.querySelectorAll('[data-a-focus]').forEach(el => {
      const fc = p && ep && window.AgentOps ? AgentOps.focusOf(p, ep) : null;
      el.textContent = fc ? '📍 ' + fc.label : '📍 未定位(点击工作台内容自动关联)';
      el.dataset.focusLabel = fc ? fc.label : '';
    });
  }

  /* ops 应用器(applyFields/mapShotFields/applyOps)与执行闭环验证(verifyOps/verifyNote)
   * 已拆至 agent-ops.js;__AGENT_TEST 测试钩子亦随迁该文件。 */

  /* ================= 聊天面板 ================= */
  function toggle(p, ep, main) {
    ep.agentOpen = !ep.agentOpen;
    Store.save();
    Views.episode(main, p.id, ep.id);
  }

  function render(col, p, ep, main) {
    if (!ep.agentChat) ep.agentChat = [];
    const AO = window.AgentOps; // ops 执行域(agent-ops.js 后加载;render 为运行时入口,此时已就绪)
    const model = (Store.state.settings || {}).defLLM || API.getConfig().model;
    col.innerHTML = `
    <div class="agent-head">
      <b>🐋 虎鲸导演助手</b>
      <span class="tag cyan" style="font-size:10px">${U.esc(model)}</span>
      <span class="grow"></span>
      <button class="btn ghost sm ${(Store.state.settings || {}).agentAuto ? 'primary' : ''}" data-a="auto" title="自动执行:开启后导演助手直接操作工作台(改分镜/生成/合成/切视图),不再逐条确认;可随时撤销">⚡ 自动${(Store.state.settings || {}).agentAuto ? '·开' : '·关'}</button>
      <button class="btn ghost sm ${AC.prearrOn ? 'primary' : ''}" data-a="prearr" title="预排模式:开启后,分镜/批量生成类意图先落成参数表单预填,你确认「按此方案执行」后才真正发起">🎛 预排${AC.prearrOn ? '·开' : '·关'}</button>
      <button class="btn ghost sm ${(Store.state.settings || {}).agentSelfFix !== false ? 'primary' : ''}" data-a="selffix" title="自修复(默认开):执行回执含失败时,自动追加「核验/修复」调用让模型归因——数据类修复直接落地,临时性失败可重试原命令(最多 2 轮;不另扣费,复用本条消息额度)">🩹 自修复${(Store.state.settings || {}).agentSelfFix !== false ? '·开' : '·关'}</button>
      <button class="btn ghost sm" data-a="mem" title="持久化记忆:记住你的修改意图与偏好,跨会话召回">🧠 ${(Store.state.agentMemory || []).length}</button>
      <button class="btn ghost sm" data-a="undo" ${ep.agentUndo ? '' : 'disabled'} title="撤销上次修改">↩ 撤销</button>
      <button class="btn ghost sm" data-a="close" title="收起">✕</button>
    </div>
    ${guideBarHTML({ p, ep })}
    <div class="agent-chips" data-a-chips></div>
    <div class="agent-msgs" data-a-msgs></div>
    <div class="row" style="gap:6px;margin:6px 0 0;align-items:center">
      <span class="tag cyan" data-a-focus ${(() => { const fc = AO.focusOf(p, ep); return fc ? `data-focus-label="${U.esc(fc.label)}"` : ''; })()} style="cursor:pointer;font-size:11px" title="当前工作台定位:助手思考与修改默认针对此处;点击可把定位插入输入框">${(() => { const fc = AO.focusOf(p, ep); return fc ? '📍 ' + U.esc(fc.label) : '📍 未定位(点击工作台内容自动关联)'; })()}</span>
    </div>
    <div class="row" data-arefs="ep" style="gap:4px;margin:4px 0 0;align-items:center;flex-wrap:wrap;display:none"></div>
    <div class="agent-input">
      ${personaSelectHTML('a', ep.agentPersonaId)}
      <textarea class="input small" data-a-in rows="2" placeholder="描述你想修改的内容,如:把镜头3改成夜景"></textarea>
      <button class="btn primary sm" data-a="send">发送</button>
    </div>`;
    const msgsEl = col.querySelector('[data-a-msgs]');
    const chipsEl = col.querySelector('[data-a-chips]');

    /* 动态情境 chips(纯本地推导,renderMsgs 时重算保持新鲜):run/goto 直执真实工作流,text 发助手;后跟静态快捷指令 */
    function paintChips() {
      const dyn = AO.dynamicChips(p, ep);
      chipsEl.innerHTML = dyn.map((c, i) => `<span class="tag cyan" data-a-dchip="${i}" title="${U.esc(c.d || '')}" style="cursor:pointer">${c.run ? '▶ ' : c.goto ? '→ ' : '💬 '}${U.esc(c.t)}</span>`).join('')
        + QUICK.map(q => `<span class="tag" data-a-chip="${q}">${q}</span>`).join('');
      chipsEl.querySelectorAll('[data-a-dchip]').forEach(el => el.onclick = async () => {
        const c = dyn[+el.dataset.aDchip];
        if (!c) return;
        if (c.text) send(c.text);
        else { await AO.runEpisodeActions(p, ep, [c.run ? { op: 'run', action: c.run } : { op: 'goto', target: c.goto }], main); Views.episode(main, p.id, ep.id); }
      });
      chipsEl.querySelectorAll('[data-a-chip]').forEach(c2 => c2.onclick = () => send(c2.dataset.aChip));
    }

    function renderMsgs() {
      paintChips();
      msgsEl.innerHTML = ep.agentChat.length ? ep.agentChat.map((m2, i) => m2.role === 'user'
        ? `<div class="agent-msg user">${(m2.focus || (m2.refs && m2.refs.length)) ? `<div style="text-align:right;margin-bottom:2px">${m2.focus ? `<span class="tag cyan" style="font-size:10px">📍 ${U.esc(m2.focus)}</span> ` : ''}${(m2.refs || []).map(l => `<span class="tag cyan" style="font-size:10px">📎 ${U.esc(l)}</span>`).join(' ')}</div>` : ''}<div class="agent-bubble">${U.esc(m2.text)}</div></div>`
        : `<div class="agent-msg">
            ${m2.thinking ? `<div class="agent-think" data-th="${i}">💭 思考过程 ▾<div class="agent-think-body">${U.esc(m2.thinking)}</div></div>` : ''}
            <div class="agent-bubble asst">${U.esc(m2.text)}</div>
            ${m2.pending ? previewCard(m2.pending, i) : ''}
            ${m2.prearr ? AO.prearrCardHTML(m2.prearr, i, 'a') : ''}
            ${m2.choices ? AO.choiceCardHTML(m2, i, 'a') : ''}
            ${m2.event ? AO.eventCardHTML(m2, i, 'a') : ''}
          </div>`).join('')
        : `<div class="hint" style="text-align:center;padding:20px 8px">🐋 ${U.esc(AO.openingLine(p, ep))}<br><span class="muted">可以让我改镜头、插入/删除/移动分镜、批量调整,或只是聊聊这集怎么拍更好。</span></div>`;
      msgsEl.scrollTop = msgsEl.scrollHeight;
      msgsEl.querySelectorAll('[data-th]').forEach(t => t.onclick = () => t.classList.toggle('open'));
      msgsEl.querySelectorAll('[data-a-apply]').forEach(b => b.onclick = () => applyPending(+b.dataset.aApply));
      msgsEl.querySelectorAll('[data-a-cancel]').forEach(b => b.onclick = () => cancelPending(+b.dataset.aCancel));
      AO.bindPrearr(msgsEl, 'a', { // 🎛 预排卡片:执行/再改改/取消
        getChat: i => ep.agentChat[i],
        exec: plan => AO.execPrearr({ p, ep }, plan, main),
        edit: () => { const inp = col.querySelector('[data-a-in]'); if (inp) inp.focus(); U.toast('补充你的修改意见,发送后我重出方案', 'info', 2200); },
        done: () => { Store.save(); renderMsgs(); },
        scope: '分镜',
      });
      AO.bindChoices(msgsEl, 'a', { // 关键决策选项卡:提交后置灰,并以「我选择:xxx」走原发送流程继续
        getChat: i => ep.agentChat[i],
        submit: (m2, o) => { m2.choiceDone = o.t; Store.save(); send('我选择:' + o.t); },
      });
      AO.bindEvents(msgsEl, 'a', { // 事件续谈卡:选项直执真实工作流(run/goto 复用注册表,目标按钮自带确认与计费)
        getChat: i => ep.agentChat[i],
        exec: async (m2, o) => {
          m2.eventDone = o.t; Store.save();
          await AO.runEpisodeActions(p, ep, [o.run ? { op: 'run', action: o.run } : { op: 'goto', target: o.goto }], main);
          Views.episode(main, p.id, ep.id);
        },
      });
    }

    function previewCard(pd, msgIdx) {
      return `
      <div class="agent-preview">
        <b class="small">修改预览(${pd.changes.length} 项):</b>
        <div class="agent-preview-list">${pd.changes.slice(0, 8).map(AO.changeLineHTML).join('')}${pd.changes.length > 8 ? `<div class="small muted">…等 ${pd.changes.length} 项</div>` : ''}</div>
        <div class="row" style="gap:6px;margin-top:8px">
          <button class="btn sm primary" data-a-apply="${msgIdx}">✅ 应用修改(-1积分)</button>
          <button class="btn sm" data-a-cancel="${msgIdx}">❌ 取消</button>
        </div>
      </div>`;
    }

    function applyPending(msgIdx) {
      const m2 = ep.agentChat[msgIdx];
      if (!m2 || !m2.pending) return;
      const exec = async ops => {
        const { data: dataOps, acts: actOps } = AO.splitOps(ops);
        if (!dataOps.length && !actOps.length) { // 冲突项全部「保留我的」:无可应用项,不扣费
          m2.text += '\n(冲突项已全部保留你的修改,助手方案无可应用项)';
          m2.pending = null;
          Store.save(); renderMsgs();
          return;
        }
        const tk = Tasks.start({ type: '导演助手', model: '应用修改', target: ep.title, cost: 1, projectId: p.id, episodeId: ep.id });
        if (!U.charge(1, '导演助手应用修改(' + ep.title + ')')) { Tasks.fail(tk, '积分不足'); return; }
        // 快照供撤销(含 composed:applyOps 会置 false,撤销需一并还原;含 scriptBoard:脚本层修改可回滚)
        ep.agentUndo = { shots: JSON.parse(JSON.stringify(ep.shots)), composed: ep.composed, board: JSON.parse(JSON.stringify(ep.scriptBoard || null)), time: Store.now() };
        let vf = null, actDone = [], applied = [];
        try { // R17:LLM 给的脏 ops 可能抛异常——回滚快照+退费+任务标败,不再吞积分留悬挂任务
          if (dataOps.length) applied = AO.applyOps(ep, dataOps, true);
          vf = dataOps.length ? AO.verifyOps(ep, dataOps) : null; // 执行闭环验证:落数后回读校验
          actDone = await AO.runEpisodeActions(p, ep, actOps, main); // 动作类 ops:统一命令真实执行(结构化回执)
        } catch (e) {
          ep.shots = ep.agentUndo.shots; ep.composed = ep.agentUndo.composed; ep.scriptBoard = ep.agentUndo.board;
          U.refund(1, '导演助手应用修改异常退费');
          Tasks.fail(tk, e.message || '应用修改异常');
          m2.text += '\n(应用修改异常(' + (e.message || '未知') + '),已回滚未做改动,积分已退还)';
          Store.save(); renderMsgs();
          return;
        }
        AC.activeStepKey = opBoardKey(ops); // 顶栏步骤高亮 Agent 正在操作的板块
        // 写入持久化记忆:用户指令 + 已应用的修改摘要
        const userMsg = ep.agentChat.slice(0, msgIdx).reverse().find(x => x.role === 'user');
        if (userMsg) memRemember(`「${p.name}/${ep.title}」${userMsg.text.slice(0, 60)} → 已应用:${(applied.length ? applied : m2.pending.changes).slice(0, 3).join(';').slice(0, 80)}`, '分镜');
        Tasks.done(tk);
        m2.text += `\n(已应用 ${applied.length + actDone.length} 项修改)${vf ? ' ' + AO.verifyNote(vf) : ''}`;
        // 自修复轮(二十二轮起默认开)——动作回执含失败时回喂模型一轮归因修复(复用本任务 opId 不另扣费)
        if ((Store.state.settings || {}).agentSelfFix !== false && /[✕⊘]/.test(actDone.join(''))) {
          const fixNote3 = await AO.selfFixRound(p, ep, main, actDone, tk.id);
          if (fixNote3) m2.text += fixNote3;
        }
        m2.pending = null;
        ep.agentChat = ep.agentChat.slice(-50);
        Store.save();
        U.toast('修改已应用,可点「↩ 撤销」回滚', 'success');
        Views.episode(main, p.id, ep.id);
      };
      // ⚠ 并行编辑冲突闸:应用前比对发送时指纹基线;命中则逐项版本选择(取消不扣费,预览卡保留)
      const base = AO.getPendingBase(m2);
      const conf = base ? AO.detectConflicts(AO.splitOps(m2.pending.ops).data, base, { p, ep }) : [];
      if (!conf.length) return exec(m2.pending.ops);
      AO.openConflictPanel(conf, decisions => {
        if (!decisions) return; // 取消:暂不应用,预览卡保留待决
        const g0 = AO.splitOps(m2.pending.ops);
        exec(AO.resolveOps(g0.data, conf, decisions, { p, ep }).concat(g0.acts));
      });
    }
    function cancelPending(msgIdx) {
      const m2 = ep.agentChat[msgIdx];
      if (m2) { m2.pending = null; m2.text += '(已取消)'; Store.save(); renderMsgs(); }
    }

    /* 发送防抖:LLM 在途时拒绝新发送(防连点并发请求与自动执行模式重复扣费);window 槽位供集级/全局两个入口共用 */
    async function send(text) {
      text = (text || '').trim();
      if (!text) return;
      if (window.__agentBusy) return U.toast('助手正在处理上一条消息,请稍候', 'info', 2000);
      window.__agentBusy = true;
      try { await sendInner(text); } finally { window.__agentBusy = false; }
    }
    async function sendInner(text) {
      if (/^(记住|请记住|记一下)[,:：,，]?\s*/.test(text)) { memRemember(text.replace(/^(记住|请记住|记一下)[,:：,，]?\s*/, '用户要求记住:'), '分镜') ; } // 主动记忆
      if (AC.prearrOn) { // 🎛 预排模式:创作意图 → 参数预排方案卡片,不直接执行
        if (!API.isReady()) { U.toast('🎛 预排模式需要真实 LLM(未配置或未登录后端),本次已忽略', 'error'); return; }
        const fcP = AO.focusOf(p, ep);
        ep.agentChat.push({ role: 'user', text, focus: fcP ? fcP.label : '', refs: AgentRefs.labels(p, ep, 'ep'), time: Store.now() });
        ep.agentChat = ep.agentChat.slice(-50);
        renderMsgs();
        AO.prearrSend({ p, ep, chat: ep.agentChat, text, model, renderMsgs, sysExtra: aPersonaBlock(ep) + memBlock(text, '分镜') + AO.stateBlock(p, ep) }); // 状态摘要同步注入(预排路径)
        return;
      }
      const fcNow = AO.focusOf(p, ep); // 索引关联:发送时快照当前定位,随消息留存并注入 LLM
      ep.agentChat.push({ role: 'user', text, focus: fcNow ? fcNow.label : '', refs: AgentRefs.labels(p, ep, 'ep'), time: Store.now() });
      ep.agentChat = ep.agentChat.slice(-50);
      renderMsgs();
      const baseFP = AO.fingerprint({ p, ep }); // ⚠ 并行编辑冲突基线:助手思考期间的手动改动据此检测
      // 七轮计费贯通:导演助手对话对齐服务端(llm.agent=1/条,失败退费);纪要蒸馏共用同 opId(attemptBudget 内不另扣)
      const agOpId = 'ag_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
      const llmPaid = API.isReady() ? U.charge(1, '导演助手对话') : false;
      if (API.isReady() && !llmPaid) {
        ep.agentChat.push({ role: 'assistant', text: '积分不足,导演助手对话每条 1 积分。', time: Store.now() });
        Store.save(); renderMsgs();
        return;
      }
      // 上下文压缩:旧消息(除最近 12 条)后台蒸馏为「会话纪要」存 ep.agentSummary;压缩中用旧摘要,不阻塞发送
      const cmp = AO.compactChat(ep.agentChat, ep, 'agentSummary', agOpId);
      const histBlock = (cmp.summary ? `此前会话纪要:${cmp.summary}\n` : '') + (cmp.recent.length > 1 ? `最近对话:\n${AO.chatLines(cmp.recent.slice(0, -1))}\n` : '');
      const tk = Tasks.start({ type: '导演助手', model, target: ep.title + '·' + text.slice(0, 12), projectId: p.id, episodeId: ep.id });
      let out;
      try {
        if (!API.isReady()) throw new Error('LLM 未配置或未登录后端');
        // 按需查询循环(第三阶段):LLM 首轮可返回 {"query":[...]} 要数据,本地补齐后自动续问(≤2 轮,
        // 共用同 opId 的 q1/q2 步骤槽位,一条消息仍只扣 1 积分);拿到补齐数据即正常作答
        const llmOpt = {
          model,
          system: `你是「虎鲸导演助手」,短剧分镜编辑智能体。${window.KB ? KB.block() : ''}${aPersonaBlock(ep)}${memBlock(text, '分镜')}
用户给自然语言指令,你要么给建议,要么输出对分镜表的结构化修改。
返回 JSON {"reply":"中文回复","thinking":"一句话思考摘要","ops":[操作]}(可选键 "choices" 见下)。
ops 支持:
{"op":"update","shot":镜头号,"fields":{"剧情/名称/运镜/视角/角度/景别/光圈/提示词/旁白/台词/时长":"新值"}}
{"op":"insert","after":镜头号,"shot":{"名称":"","剧情":"","运镜":"","提示词":""}}
{"op":"delete","shot":镜头号}  {"op":"move","shot":镜头号,"to":目标位置}
{"op":"batch","filter":{"含人物":"角色名"},"fields":{...}}(批量改所有该角色出场镜头)
{"op":"beatupdate","scene":场次号,"beat":节拍号,"fields":{"情绪/剧情/分镜文字":"新值"}}(改分镜脚本层某节拍;场次/节拍号从 1 开始)
{"op":"sceneupdate","scene":场次号,"fields":{"标题/剧情":"新值"}}(改分镜脚本层某场次标题或场次剧情)
★ 动作类 ops(会真正驱动工作台执行,慎用但可用):
{"op":"run","cmd":"命令名","args":{参数}}(驱动工作台对应真实功能,按其规则扣费;pid/epid 自动注入无需填写。命令白名单与参数面:
${AO.cmdProtocol()})
兼容旧格式:{"op":"run","action":"${AO.actProtocol()}"}(中文动作别名,无参数通道,能用 cmd+args 时优先新格式)
{"op":"goto","target":"分镜脚本|分镜视频|剪辑|节拍板|镜头组"}(切换工作区视图)
{"op":"select","shot":镜头号}(选中某镜头到右栏编辑)
纯咨询/建议类问题 ops 返回 []。运镜限:${WfCore.CAMERAS.join('/')};视角:${WfCore.VIEWS.join('/')};角度:${WfCore.ANGLES.join('/')};景别:${WfCore.SIZES.join('/')};光圈:ƒ/1.4~ƒ/11。项目风格:${styleOf(p)}。
★ 关键决策点选项卡:当对话处于创作方向/风格/方案等关键决策点、适合让用户拍板时,额外返回可选键 "choices":{"title":"选择主题(如:复仇方向选择)","options":[{"t":"方向一:标题","d":"一句话描述"}]}(2-4 个);返回 choices 的本轮 ops 返回 [],等用户提交选择后再据此继续。${AO.queryProtocol()}`,
          user: `${histBlock}本集剧本摘要:${(ep.content || '').slice(0, 500)}\n当前分镜表:\n${AO.compactShots(ep)}${AO.focusBlock(p, ep)}${AgentRefs.block(p, ep, 'ep')}${AO.stateBlock(p, ep)}\n\n用户指令:${text}`,
          temperature: 0.4, max_tokens: 6000,
        };
        let qExtra = '';
        for (let round = 0; ; round++) {
          out = await Understanding.chatJSONRobust(Object.assign({}, llmOpt, {
            user: llmOpt.user + qExtra,
            billingAction: 'llm.agent', operationId: agOpId, step: round ? 'q' + round : undefined, // 解析重试/纪要蒸馏/查询续问共用同 opId:一条消息只扣一次
          }));
          const qs = out && Array.isArray(out.query) ? out.query : null;
          if (!qs || !qs.length || round >= 2) break;
          qExtra += AO.answerQueries(p, ep, 'ep', qs);
        }
        Tasks.done(tk);
      } catch (e) {
        if (llmPaid) U.refund(1, '导演助手对话失败退费', agOpId); // 七轮:失败退回本条对话积分
        Tasks.fail(tk, e.message);
        ep.agentChat.push({ role: 'assistant', text: '未能理解或服务异常(' + e.message + '),未做任何改动。', time: Store.now() });
        renderMsgs();
        return;
      }
      const msg = { role: 'assistant', text: String(out.reply || '收到。'), thinking: String(out.thinking || ''), time: Store.now() };
      const chA = AO.parseChoices(out); // 关键决策选项卡(与 ops 预览可并存;通常 LLM 二选一)
      if (chA) msg.choices = chA;
      const ops = Array.isArray(out.ops) ? out.ops.filter(o => o && o.op) : [];
      if (ops.length) {
        const { data: dataOps, acts: actOps, unknown: unkOps } = AO.splitOps(ops);
        if (unkOps.length) msg.text += `\n(⊘ 不支持的操作已忽略:${unkOps.map(o => o.op).join('、')})`; // 二十轮:未知 op 显式回报,不再静默 0 项
        const actDescs = actOps.map(AO.actDesc); // 注册表分级标注:exec(run)前加 ⚠ 并注明扣费规则
        // 克隆试算修改预览(仅数据类 ops 参与试算;含分镜脚本层,beatupdate/sceneupdate 可预览)
        const clone = { shots: JSON.parse(JSON.stringify(ep.shots)), sbConfig: ep.sbConfig, uiSel: ep.uiSel, scriptBoard: JSON.parse(JSON.stringify(ep.scriptBoard || { scenes: [] })) };
        const changes = (dataOps.length ? AO.applyOps(clone, dataOps, false) : []).concat(actDescs);
        if (changes.length) {
          // ⚠ 并行编辑冲突(手动修改 vs 助手方案):发送时基线 vs 当前指纹,命中则转预览确认逐项选择版本
          const confA = AO.detectConflicts(dataOps, baseFP, { p, ep });
          if ((Store.state.settings || {}).agentAuto && !confA.length) {
            // ⚡ 自动执行:read/edit 类免确认直执行(可撤销);exec(run)与 edit-hi(delete 删除类,十轮)
            // 按注册表分级审批,先 U.confirm 确认才执行——删除不可逆,自动模式下也始终确认
            const runOps = actOps.filter(o => AO.opRisk(o) === 'exec');
            const safeActs = actOps.filter(o => AO.opRisk(o) !== 'exec');
            const hiData = dataOps.filter(o => o.op === 'delete');           // 镜头删除(edit-hi):待确认
            const loData = dataOps.filter(o => o.op !== 'delete');           // 普通数据修改:直执行
            const tk2 = Tasks.start({ type: '导演助手', model: '自动执行', target: ep.title, cost: 1, projectId: p.id, episodeId: ep.id });
            if (U.charge(1, '导演助手自动执行(' + ep.title + ')')) {
              ep.agentUndo = { shots: JSON.parse(JSON.stringify(ep.shots)), composed: ep.composed, board: JSON.parse(JSON.stringify(ep.scriptBoard || null)), time: Store.now() };
              let vf = null;
              try { // R17:脏 ops 异常兜底——回滚+退费+标败,自动执行不再吞积分留悬挂任务
                if (loData.length) AO.applyOps(ep, loData, true);
                vf = loData.length ? AO.verifyOps(ep, loData) : null; // 执行闭环验证:落数后回读校验
                const receipts = await AO.runEpisodeActions(p, ep, safeActs, main);
                // 自修复轮(二十二轮起默认开)——失败回执回喂模型归因,数据类修复+原命令重试(同 opId 不另扣费)
                if ((Store.state.settings || {}).agentSelfFix !== false) {
                  const fixNote = await AO.selfFixRound(p, ep, main, receipts, agOpId);
                  if (fixNote) msg.text += fixNote;
                }
              } catch (e) {
                ep.shots = ep.agentUndo.shots; ep.composed = ep.agentUndo.composed; ep.scriptBoard = ep.agentUndo.board;
                U.refund(1, '导演助手自动执行异常退费');
                Tasks.fail(tk2, e.message || '自动执行异常');
                msg.text += '\n(自动执行异常(' + (e.message || '未知') + '),已回滚未做改动,积分已退还)';
                ep.agentChat.push(msg);
                ep.agentChat = ep.agentChat.slice(-50);
                Store.save(); renderMsgs();
                return;
              }
              AC.activeStepKey = opBoardKey(ops); // 顶栏高亮正在操作的板块
              Tasks.done(tk2);
              memRemember(`「${p.name}/${ep.title}」${text.slice(0, 60)} → 自动执行:${changes.slice(0, 3).join(';').slice(0, 80)}`, '分镜');
              msg.text += `\n(⚡ 已自动执行 ${loData.length + safeActs.length} 项,可点「↩ 撤销」回滚)${vf ? ' ' + AO.verifyNote(vf) : ''}`;
              if (hiData.length) {
                // 十轮分级审批:删除类(edit-hi)不可逆,自动模式下同样先确认
                U.confirm(`虎鲸导演助手请求删除 ${hiData.length} 个分镜(镜头 ${hiData.map(o => o.shot).join('、')}),删除后可从镜头历史/撤销恢复。确认执行吗?`, () => {
                  AO.applyOps(ep, hiData, true);
                  U.toast('已删除 ' + hiData.length + ' 个分镜', 'success', 2500);
                  Views.episode(main, p.id, ep.id);
                }, '▶ 确认删除');
                msg.text += `\n(⚠ ${hiData.length} 个删除类操作待确认)`;
              }
              if (runOps.length) {
                // 分级审批:exec 类动作按各功能规则另行扣费,自动模式下也需用户确认
                U.confirm(`虎鲸导演助手请求执行以下动作(将按各功能规则扣费):${runOps.map(o => '▶ ' + (o.action || o.cmd)).join(';')}`, async () => {
                  const receipts2 = await AO.runEpisodeActions(p, ep, runOps, main);
                  U.toast('已执行:' + runOps.map(o => (o.action || o.cmd)).join('、'), 'success', 2500);
                  // 自修复轮(二十二轮起默认开)——失败回执回喂模型一轮,修复结论作为新消息留存
                  if ((Store.state.settings || {}).agentSelfFix !== false) {
                    const fixNote2 = await AO.selfFixRound(p, ep, main, receipts2, agOpId);
                    if (fixNote2) {
                      ep.agentChat.push({ role: 'assistant', text: fixNote2.replace(/^\n/, ''), time: Store.now() });
                      ep.agentChat = ep.agentChat.slice(-50); Store.save();
                    }
                  }
                  Views.episode(main, p.id, ep.id);
                }, '▶ 确认执行');
                msg.text += `\n(⚠ ${runOps.length} 个执行类动作待确认)`;
              }
              ep.agentChat.push(msg); // 自动执行成功同样留存助手回复(原漏推,会话历史丢失本条)
              ep.agentChat = ep.agentChat.slice(-50);
              Store.save();
              U.toast('导演助手已自动执行', 'success');
              Views.episode(main, p.id, ep.id);
              return;
            }
            Tasks.fail(tk2, '积分不足');
            msg.text += '\n(自动执行失败:积分不足,未改动)';
          } else {
            if (confA.length) msg.text += `\n(⚠ 你在助手思考期间手动改过 ${confA.length} 处,点「应用修改」逐项选择版本)`;
            msg.pending = { ops, changes };
            AO.setPendingBase(msg, baseFP); // 基线随消息存(会话内有效;刷新后应用退化为直接应用)
          }
        }
      }
      ep.agentChat.push(msg);
      ep.agentChat = ep.agentChat.slice(-50);
      Store.save();
      renderMsgs();
    }

    col.querySelector('[data-a=close]').onclick = () => toggle(p, ep, main);
    col.querySelector('[data-a=mem]').onclick = () => openMemoryModal('分镜'); // 集级助手归属「分镜」板块记忆
    col.querySelector('[data-a=auto]').onclick = () => {
      Store.state.settings = Store.state.settings || {};
      Store.state.settings.agentAuto = !Store.state.settings.agentAuto;
      Store.save();
      U.toast(Store.state.settings.agentAuto ? '⚡ 自动执行已开启:助手将直接操作工作台(可撤销)' : '自动执行已关闭:修改前先预览确认', 'info', 2500);
      render(col, p, ep, main);
    };
    col.querySelector('[data-a=prearr]').onclick = () => {
      AC.setPrearr(!AC.prearrOn);
      U.toast(AC.prearrOn ? '🎛 预排模式已开启:生成类意图先出参数方案,确认后才执行' : '🎛 预排模式已关闭:恢复正常对话与执行', 'info', 2500);
      render(col, p, ep, main);
    };
    col.querySelector('[data-a=selffix]').onclick = () => { // 自修复轮开关(二十二轮起默认开:辅助步骤不另扣费,临时失败可自动重试)
      Store.state.settings = Store.state.settings || {};
      Store.state.settings.agentSelfFix = Store.state.settings.agentSelfFix === false; // 三态切换:开(默认/undefined)→ 关(false)
      Store.save();
      U.toast(Store.state.settings.agentSelfFix !== false ? '🩹 自修复已开启:执行失败将自动归因/修复/重试(复用本条消息额度,不另扣费)' : '自修复已关闭', 'info', 2500);
      render(col, p, ep, main);
    };
    col.querySelector('[data-a=undo]').onclick = () => {
      if (!ep.agentUndo) return;
      ep.shots = ep.agentUndo.shots;
      ep.composed = ep.agentUndo.composed; // 一并还原合成状态
      if (ep.agentUndo.board) ep.scriptBoard = ep.agentUndo.board; // 一并还原脚本层
      ep.shots.forEach((s, i) => s.order = i);
      ep.agentUndo = null;
      Store.save();
      U.toast('已撤销上次导演助手修改', 'success');
      Views.episode(main, p.id, ep.id);
    };
    // chips 绑定统一在 paintChips(renderMsgs 每次重算时重建并绑定,此处不再重复)
    // Agent 身份下拉:本会话以所选专家人设工作(持久化在 ep.agentPersonaId;''=明确选择默认助手)
    const aPersona = col.querySelector('[data-a-persona]');
    if (aPersona) aPersona.onchange = () => {
      ep.agentPersonaId = aPersona.value;
      Store.save();
      const ex = findExpert(ep.agentPersonaId);
      U.toast('已切换为 ' + (ex ? ex.name : '默认助手'), 'success', 1800);
    };
    // 定位 chip:点击把 @定位 插入输入框(显式引用);内容随工作台聚焦实时刷新(refreshFocusChip)
    const fcChip = col.querySelector('[data-a-focus]');
    if (fcChip) fcChip.onclick = () => {
      const lb = fcChip.dataset.focusLabel || '';
      if (!lb) return U.toast('先在工作台点击一个场次/节拍/镜头', 'info', 1800);
      const inp = col.querySelector('[data-a-in]');
      if (!inp.value.startsWith(lb)) inp.value = lb + ' ' + inp.value;
      inp.focus();
    };
    col.querySelector('[data-a=send]').onclick = () => {
      const inp = col.querySelector('[data-a-in]');
      send(inp.value);
      inp.value = '';
    };
    col.querySelector('[data-a-in]').onkeydown = e => {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); col.querySelector('[data-a=send]').click(); }
    };
    renderMsgs();
    AgentRefs.paint(); // 📎 引用 chips 行(容器随面板重渲为空,此处重填并接线)
  }

  /* ---- 管线/系统事件推送到对话流(面板开着则即时渲染,关着则留存待看) ---- */
  function notify(p, ep, main, text) {
    if (!ep.agentChat) ep.agentChat = [];
    ep.agentChat.push({ role: 'assistant', text, time: Store.now() });
    ep.agentChat = ep.agentChat.slice(-50);
    Store.save();
    if (ep.agentOpen) Views.episode(main, p.id, ep.id);
  }

  /* 全局虎鲸助手(右侧抽屉:ctxOf/toggleGlobal/openBoard/orcaGlobalCtx/routeIntent/applyGlobalOps/renderGlobal/sendG)
   * 已拆至 agent-global.js(window.AgentG;ctxOf 经 AC 注入,共享状态经 AC 读写)。 */

  /* ---- 全流程引导步骤(按当前上下文推导,置顶展示;done=绿,current=高亮,act=Agent正在操作的板块) ---- */
  function opBoardKey(ops) { // ops → 板块 key 映射(取第一个有意义的)
    for (const o of ops || []) {
      if (!o || !o.op) continue;
      if (o.op === 'goto') return String(o.target || '').includes('跑批') ? '一键跑批' : String(o.target || '');
      if (o.op === 'run') {
        const a = String(o.action || '');
        if (/审片/.test(a)) return '审片';
        if (/合成|成片/.test(a)) return '成片';
        if (/策划|译制/.test(a)) return '剧本';
        return '分镜'; // 生成/拆解/分镜类
      }
      if (o.op === 'select') return '分镜';
      if (['update', 'insert', 'delete', 'move', 'batch'].includes(o.op)) return '分镜';
      if (o.op === 'subject') return '主体';
      if (['episode', 'addep', 'delep'].includes(o.op)) return '分集';
      if (o.op === 'scriptmeta') return '剧本';
      if (o.op === 'project') return '导演';
    }
    return '';
  }
  function guideSteps(ctx) {
    const { p, ep } = ctx;
    if (ep) {
      if (ep.boardMode || !ep.shots.length) {
        const bd = ep.scriptBoard;
        const hasBeats = !!(bd && bd.scenes && bd.scenes.some(sc => sc.beats.some(b => b.emotion || b.plot)));
        const hasDraft = !!(bd && bd.scenes && bd.scenes.some(sc => sc.beats.some(b => (b.shotsDraft || []).length)));
        return [
          { txt: 'AI 拆解场次节拍', done: hasBeats, key: '分镜' },
          { txt: '拆解文字分镜', done: hasDraft, key: '分镜' },
          { txt: '确认为分镜表', done: !!ep.shots.length, key: '分镜' },
          { txt: '批量生成视频', done: ep.shots.some(s => Store.shotVideoReady(s)), key: '生成' }, // 统一就绪判定:在线时模拟占位不算完成
        ];
      }
      return [
        { txt: '生成分镜', done: !!ep.shots.length, key: '分镜' },
        { txt: '批量生成视频', done: ep.shots.some(s => Store.shotVideoReady(s)), key: '生成' }, // 统一就绪判定:在线时模拟占位不算完成
        { txt: '智能审片', done: !!ep.lastReview, key: '审片' },
        { txt: '合成成片', done: Store.epComposedReady(ep), key: '成片' }, // 统一就绪判定:离线模拟合成在线时不算完成
        { txt: '导出交付', done: false, key: '导出' },
      ];
    }
    if (p) {
      // 与项目页全链路一致:优先用 Pipeline.calc 的 10 步(制片→…→切片)
      if (window.Pipeline && Pipeline.calc) return Pipeline.calc(p).map(s => ({ txt: s.name, done: s.done, key: s.name }));
      const eps = p.episodes || [];
      const totalShots = eps.reduce((n, e) => n + (e.shots || []).length, 0);
      const anyVideo = eps.some(e => (e.shots || []).some(s => Store.shotVideoReady(s)));
      return [
        { txt: '剧本', done: !!(p.script || p.extractDone), key: '剧本' },
        { txt: '主体', done: !!(p.subjects || []).length, key: '主体' },
        { txt: '分集', done: !!eps.length, key: '分集' },
        { txt: '分镜', done: totalShots > 0, key: '分镜' },
        { txt: '生成', done: anyVideo, key: '生成' },
        { txt: '成片', done: eps.length > 0 && eps.every(e => Store.epComposedReady(e)), key: '成片' }, // 统一就绪判定
      ];
    }
    return [
      { txt: '创建/进入项目', done: false },
      { txt: '上传并解析剧本', done: false },
      { txt: '按顶部流程逐步推进', done: false },
    ];
  }
  function guideBarHTML(ctx) {
    const steps = guideSteps(ctx);
    const cur = steps.findIndex(s => !s.done);
    return `<div class="agent-steps">${steps.map((s, i) => `
      ${i ? '<span class="agent-steps-arrow">→</span>' : ''}<span class="agent-step ${s.done ? 'done' : i === cur ? 'cur' : ''}${s.key && s.key === AC.activeStepKey ? ' act' : ''}" ${s.key && s.key === AC.activeStepKey ? 'title="导演助手正在操作此板块"' : ''}>${s.done ? '✓ ' : ''}${s.txt}</span>`).join('')}</div>`;
  }

  /* renderGlobal/sendG/buildGlobalPrompt 等全局面板实现已拆至 agent-global.js(window.AgentG) */

  /* ---- 对外出口(批次拆分后):本地成员直出;ops 域与全局助手经 AgentOps/AgentG 代理(agent-ops.js/agent-global.js 后加载) ---- */
  Object.assign(AC, { boardExpert, boardExpertBlock, boardKBBlock, upstreamFinal, expertPersona, findExpert, aPersonaBlock, gPersonaBlock, personaSelectHTML, memRemember, memBlock, openMemoryModal, guideBarHTML, opBoardKey });
  window.Agent = {
    toggle, render, notify, refreshFocusChip,
    applyOps: (...a) => window.AgentOps && AgentOps.applyOps(...a),
    compactShots: (...a) => window.AgentOps && AgentOps.compactShots(...a),
    focusOf: (...a) => window.AgentOps && AgentOps.focusOf(...a),
    toggleGlobal: (...a) => window.AgentG && AgentG.toggleGlobal(...a),
    closeGlobal: (...a) => window.AgentG && AgentG.closeGlobal(...a),
    refreshGlobal: (...a) => window.AgentG && AgentG.refreshGlobal(...a),
    openBoard: (...a) => window.AgentG && AgentG.openBoard(...a),
  };
})();
