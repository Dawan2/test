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
    { key: '成片', ico: '📦', agent: '交付监制', focus: '成片审片/版本对比/导出交付,质量把关' },
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
  function memAll() {
    Store.state.agentMemory = Store.state.agentMemory || [];
    // 板块改名迁移:旧 scope「构思」→「导演」
    if (Store.state.agentMemory.some(m => m.scope === '构思')) {
      Store.state.agentMemory.forEach(m => { if (m.scope === '构思') m.scope = '导演'; });
      Store.save();
    }
    // 标准沉淀:分镜视频提示词五段式标准结构(用户确认的工作流标准,缺则补入长期记忆,召回时自动注入)
    if (!Store.state.agentMemory.some(m => (m.text || '').includes('五段式标准结构'))) {
      Store.state.agentMemory.push({
        text: '分镜提示词五段式标准结构:风格氛围(风格/色调/画质/年代感/情绪基调)+场景环境(时间/地点/天气/光线/空间氛围)+镜头运动(景别/运镜/速度/视角/焦距)+分镜内容(人物动作/表情/台词)+负面提示词(禁BGM/字幕等);标记 @角色 $场景 #道具',
        time: Store.now(), scope: '分镜',
      });
      Store.save();
    }
    // 标准沉淀:景别衔接口诀(导演传授的剪辑衔接准则,拆镜/审片/改镜时遵循)
    if (!Store.state.agentMemory.some(m => (m.text || '').includes('景别衔接口诀'))) {
      Store.state.agentMemory.push({
        text: '景别衔接口诀:相邻景别不硬切(前后镜景别避免相同或相邻,防止无信息跳切);景别切换隔一别(优先跨一级切换,如全景→近景、中景→特写);两极镜头不衔接(大全景/远景与特写/超级特写不得直接对切,须用全景或中景过渡)',
        time: Store.now(), scope: '分镜',
      });
      Store.save();
    }
    /* 知识库沉淀(js/knowledge.js):编剧/导演/AI抽卡三域核心,召回时按关键词命中自动注入 */
    const KB_SEEDS = [
      ['钩子六型', '钩子六型(每集开头):身份反转钩/误会揭穿钩/致命危机钩/情感极限钩/秘密曝光钩/打脸预备钩;前3秒冲突锚定(直接进冲突背景后补);结尾15秒必留新悬念,跨集悬念链不断裂', '剧本'],
      ['打脸四步', '打脸四步:羞辱(40%,话越狠越好)→隐忍→反击(30%,身份/真相揭露瞬间逆转)→释放(30%,众人震惊主角淡然);爽点分布:每3集小爽/每5集新变量/每10集大反转;前3集砸最大爆点;付费卡点卡在爽点兑现前一秒,卡后立刻兑现', '剧本'],
      ['对话铁律', '对话铁律:单句≤30字,每句必须推冲突/揭信息/升情感;潜台词代替直白;打脸戏节奏=短句→反问→留白→致命一击;禁说明文式台词与纯闲聊;长独白全剧≤3处;改稿先删后改', '剧本'],
      ['景别即情绪', '景别即情绪:大全景定场/全景关系/中景叙事/近景共情/特写炸点;运镜即态度:推=逼近/拉=抽离/跟=陪伴/环绕=审视/手持=不安/固定=凝视;先定视点再调度;节奏=镜头长度分布,爽点兑现卡点硬切,声音J/L-cut做过渡', '分镜'],
      ['抽卡五条军规', 'AI视频抽卡五条军规(Seedance):①动作写慢写连续②运镜写稳写简单(一次一个)③必加"五官稳定不变形/人体结构正常/动作不僵硬"④画质风格最后补⑤不写剧烈/复杂多人/模糊词;八维公式:主体+动作+场景+光影+镜头语言+风格+画质+约束', '分镜'],
    ];
    KB_SEEDS.forEach(([mark, text, scope]) => {
      if (!Store.state.agentMemory.some(m => (m.text || '').includes(mark))) {
        Store.state.agentMemory.push({ text, time: Store.now(), scope });
      }
    });
    Store.save();
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
  function memRecall(input, scope) {
    const mem = memAll();
    if (!mem.length) return [];
    // 同板块记忆优先(该板块 Agent 越用越懂该板块),再补全局最近
    const scoped = scope ? mem.filter(m => m.scope === scope).slice(-4) : [];
    const recent = mem.slice(-3).filter(m => !scoped.includes(m));
    const rest = mem.filter(m => !scoped.includes(m) && !recent.includes(m));
    const toks = (String(input || '').match(/[一-龥a-zA-Z0-9]{2,}/g) || []);
    const scored = rest.map(m => {
      let sc = toks.reduce((a, t) => a + (m.text.includes(t) ? t.length : 0), 0);
      if (scope && m.scope === scope) sc += 3; // 同板块加权
      return { m, sc };
    }).filter(x => x.sc > 0).sort((a, b) => b.sc - a.sc).slice(0, 3).map(x => x.m);
    const seen = new Set();
    return scoped.concat(recent, scored).filter(m => { if (seen.has(m.text)) return false; seen.add(m.text); return true; });
  }
  function memBlock(input, scope) {
    const m = memRecall(input, scope);
    return m.length ? '\n历史协作记忆(用户过往的偏好与已确认的修改决定,参考以保持一致):\n' + m.map(t => '- ' + t.text).join('\n') : '';
  }
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
      <button class="btn ghost sm" data-a="mem" title="持久化记忆:记住你的修改意图与偏好,跨会话召回">🧠 ${(Store.state.agentMemory || []).length}</button>
      <button class="btn ghost sm" data-a="undo" ${ep.agentUndo ? '' : 'disabled'} title="撤销上次修改">↩ 撤销</button>
      <button class="btn ghost sm" data-a="close" title="收起">✕</button>
    </div>
    ${guideBarHTML({ p, ep })}
    <div class="agent-chips">${QUICK.map(q => `<span class="tag" data-a-chip="${q}">${q}</span>`).join('')}</div>
    <div class="agent-msgs" data-a-msgs></div>
    <div class="row" style="gap:6px;margin:6px 0 0;align-items:center">
      <span class="tag cyan" data-a-focus ${(() => { const fc = AO.focusOf(p, ep); return fc ? `data-focus-label="${U.esc(fc.label)}"` : ''; })()} style="cursor:pointer;font-size:11px" title="当前工作台定位:助手思考与修改默认针对此处;点击可把定位插入输入框">${(() => { const fc = AO.focusOf(p, ep); return fc ? '📍 ' + U.esc(fc.label) : '📍 未定位(点击工作台内容自动关联)'; })()}</span>
    </div>
    <div class="agent-input">
      ${personaSelectHTML('a', ep.agentPersonaId)}
      <textarea class="input small" data-a-in rows="2" placeholder="描述你想修改的内容,如:把镜头3改成夜景"></textarea>
      <button class="btn primary sm" data-a="send">发送</button>
    </div>`;
    const msgsEl = col.querySelector('[data-a-msgs]');

    function renderMsgs() {
      msgsEl.innerHTML = ep.agentChat.length ? ep.agentChat.map((m2, i) => m2.role === 'user'
        ? `<div class="agent-msg user">${m2.focus ? `<div style="text-align:right;margin-bottom:2px"><span class="tag cyan" style="font-size:10px">📍 ${U.esc(m2.focus)}</span></div>` : ''}<div class="agent-bubble">${U.esc(m2.text)}</div></div>`
        : `<div class="agent-msg">
            ${m2.thinking ? `<div class="agent-think" data-th="${i}">💭 思考过程 ▾<div class="agent-think-body">${U.esc(m2.thinking)}</div></div>` : ''}
            <div class="agent-bubble asst">${U.esc(m2.text)}</div>
            ${m2.pending ? previewCard(m2.pending, i) : ''}
            ${m2.prearr ? AO.prearrCardHTML(m2.prearr, i, 'a') : ''}
            ${m2.choices ? AO.choiceCardHTML(m2, i, 'a') : ''}
          </div>`).join('')
        : `<div class="hint" style="text-align:center;padding:20px 8px">我是虎鲸导演助手 🐋<br>可以让我改镜头、插入/删除/移动分镜、批量调整,或只是聊聊这集怎么拍更好。</div>`;
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
      const tk = Tasks.start({ type: '导演助手', model: '应用修改', target: ep.title, cost: 1, projectId: p.id, episodeId: ep.id });
      if (!U.charge(1, '导演助手应用修改(' + ep.title + ')')) { Tasks.fail(tk, '积分不足'); return; }
      // 快照供撤销(含 composed:applyOps 会置 false,撤销需一并还原;含 scriptBoard:脚本层修改可回滚)
      ep.agentUndo = { shots: JSON.parse(JSON.stringify(ep.shots)), composed: ep.composed, board: JSON.parse(JSON.stringify(ep.scriptBoard || null)), time: Store.now() };
      const { data: dataOps, acts: actOps } = AO.splitOps(m2.pending.ops);
      if (dataOps.length) AO.applyOps(ep, dataOps, true);
      const vf = dataOps.length ? AO.verifyOps(ep, dataOps) : null; // 执行闭环验证:落数后回读校验
      const actDone = AO.runEpisodeActions(p, ep, actOps, main); // 动作类 ops:真实驱动工作台
      AC.activeStepKey = opBoardKey(m2.pending.ops); // 顶栏步骤高亮 Agent 正在操作的板块
      // 写入持久化记忆:用户指令 + 已应用的修改摘要
      const userMsg = ep.agentChat.slice(0, msgIdx).reverse().find(x => x.role === 'user');
      if (userMsg) memRemember(`「${p.name}/${ep.title}」${userMsg.text.slice(0, 60)} → 已应用:${m2.pending.changes.slice(0, 3).join(';').slice(0, 80)}`, '分镜');
      Tasks.done(tk);
      m2.text += `\n(已应用 ${m2.pending.changes.length} 项修改)${vf ? ' ' + AO.verifyNote(vf) : ''}`;
      m2.pending = null;
      ep.agentChat = ep.agentChat.slice(-50);
      Store.save();
      U.toast('修改已应用,可点「↩ 撤销」回滚', 'success');
      Views.episode(main, p.id, ep.id);
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
        ep.agentChat.push({ role: 'user', text, focus: fcP ? fcP.label : '', time: Store.now() });
        ep.agentChat = ep.agentChat.slice(-50);
        renderMsgs();
        AO.prearrSend({ p, ep, chat: ep.agentChat, text, model, renderMsgs, sysExtra: aPersonaBlock(ep) + memBlock(text, '分镜') });
        return;
      }
      const fcNow = AO.focusOf(p, ep); // 索引关联:发送时快照当前定位,随消息留存并注入 LLM
      ep.agentChat.push({ role: 'user', text, focus: fcNow ? fcNow.label : '', time: Store.now() });
      ep.agentChat = ep.agentChat.slice(-50);
      renderMsgs();
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
        out = await Understanding.chatJSONRobust({
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
{"op":"run","action":"智能分镜|AI分镜师|AI拆解|拆解文字分镜|生成视频|批量生成音频|合成音视频|合成成片|整集审片"}(点击工作台对应真实按钮,按其规则扣费)
{"op":"goto","target":"分镜脚本|分镜视频|剪辑|节拍板|镜头组"}(切换工作区视图)
{"op":"select","shot":镜头号}(选中某镜头到右栏编辑)
纯咨询/建议类问题 ops 返回 []。运镜限:固定镜头/推镜头/拉镜头/摇镜头/移镜头/跟镜头/环绕镜头/俯拍/仰拍/特写;视角:正面/侧面/背面;角度:仰拍/平视/俯拍/高角度;景别:特写/近景/中景/全景;光圈:ƒ/1.4~ƒ/11。项目风格:${styleOf(p)}。
★ 关键决策点选项卡:当对话处于创作方向/风格/方案等关键决策点、适合让用户拍板时,额外返回可选键 "choices":{"title":"选择主题(如:复仇方向选择)","options":[{"t":"方向一:标题","d":"一句话描述"}]}(2-4 个);返回 choices 的本轮 ops 返回 [],等用户提交选择后再据此继续。`,
          user: `${histBlock}本集剧本摘要:${(ep.content || '').slice(0, 500)}\n当前分镜表:\n${AO.compactShots(ep)}${AO.focusBlock(p, ep)}\n\n用户指令:${text}`,
          temperature: 0.4, max_tokens: 6000,
          billingAction: 'llm.agent', operationId: agOpId, // 解析重试/纪要蒸馏共用同 opId:一条消息只扣一次
        });
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
        const { data: dataOps, acts: actOps } = AO.splitOps(ops);
        const actDescs = actOps.map(AO.actDesc); // 注册表分级标注:exec(run)前加 ⚠ 并注明扣费规则
        // 克隆试算修改预览(仅数据类 ops 参与试算;含分镜脚本层,beatupdate/sceneupdate 可预览)
        const clone = { shots: JSON.parse(JSON.stringify(ep.shots)), sbConfig: ep.sbConfig, uiSel: ep.uiSel, scriptBoard: JSON.parse(JSON.stringify(ep.scriptBoard || { scenes: [] })) };
        const changes = (dataOps.length ? AO.applyOps(clone, dataOps, false) : []).concat(actDescs);
        if (changes.length) {
          if ((Store.state.settings || {}).agentAuto) {
            // ⚡ 自动执行:read/edit 类免确认直执行(可撤销);exec(run)与 edit-hi(delete 删除类,十轮)
            // 按注册表分级审批,先 U.confirm 确认才执行——删除不可逆,自动模式下也始终确认
            const runOps = actOps.filter(o => AO.opRisk(o) === 'exec');
            const safeActs = actOps.filter(o => AO.opRisk(o) !== 'exec');
            const hiData = dataOps.filter(o => o.op === 'delete');           // 镜头删除(edit-hi):待确认
            const loData = dataOps.filter(o => o.op !== 'delete');           // 普通数据修改:直执行
            const tk2 = Tasks.start({ type: '导演助手', model: '自动执行', target: ep.title, cost: 1, projectId: p.id, episodeId: ep.id });
            if (U.charge(1, '导演助手自动执行(' + ep.title + ')')) {
              ep.agentUndo = { shots: JSON.parse(JSON.stringify(ep.shots)), composed: ep.composed, board: JSON.parse(JSON.stringify(ep.scriptBoard || null)), time: Store.now() };
              if (loData.length) AO.applyOps(ep, loData, true);
              const vf = loData.length ? AO.verifyOps(ep, loData) : null; // 执行闭环验证:落数后回读校验
              const actDone = AO.runEpisodeActions(p, ep, safeActs, main);
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
                U.confirm(`虎鲸导演助手请求执行以下动作(将按各功能规则扣费):${runOps.map(o => '▶ ' + o.action).join(';')}`, () => {
                  AO.runEpisodeActions(p, ep, runOps, main);
                  U.toast('已执行:' + runOps.map(o => o.action).join('、'), 'success', 2500);
                  Views.episode(main, p.id, ep.id);
                }, '▶ 确认执行');
                msg.text += `\n(⚠ ${runOps.length} 个执行类动作待确认)`;
              }
              Store.save();
              U.toast('导演助手已自动执行', 'success');
              Views.episode(main, p.id, ep.id);
              return;
            }
            Tasks.fail(tk2, '积分不足');
            msg.text += '\n(自动执行失败:积分不足,未改动)';
          } else {
            msg.pending = { ops, changes };
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
    col.querySelectorAll('[data-a-chip]').forEach(c2 => c2.onclick = () => send(c2.dataset.aChip));
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
  Object.assign(AC, { boardExpert, boardExpertBlock, upstreamFinal, expertPersona, findExpert, aPersonaBlock, gPersonaBlock, personaSelectHTML, memRemember, memBlock, openMemoryModal, guideBarHTML, opBoardKey });
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
