/* ============ wf-core.js 服务端工作流纯核(双端 UMD,二十一轮) ============
 * 智能分镜/本集理解/智能审片三条 LLM 编排的提示词拼装与结果规整,自 sb-llm.js/understanding.js/review.js
 * 下沉为单一来源:浏览器各模块改为委托调用,server.js 经 require 复用(/api/wf/* 工作流端点),
 * 保证 CLI 走服务端工作流与主应用走浏览器引擎时提示词/规整逻辑逐字节一致。
 * 环境差异(Store.uid/now、promptOverrides、directorInject/projType、PH 占位)一律经 ctx 显式注入,本模块不碰 window。 */
(function (root, factory) {
  const isNode = typeof module === 'object' && module.exports;
  const Domain = isNode ? require('./domain.js') : root.Domain;
  const KB = isNode ? require('./knowledge.js') : root.KB;
  const Prompts = isNode ? require('./prompts.js') : root.Prompts;
  const W = factory(Domain, KB, Prompts);
  if (isNode) module.exports = W; else root.WfCore = W;
})(typeof self !== 'undefined' ? self : globalThis, function (Domain, KB, Prompts) {
  'use strict';
  const W = {};

  /* ================= 常量(自 storyboard.js/review.js/understanding.js 下沉,原处改为委托) ================= */
  W.UND_DIMS = ['剧情脉络', '情绪曲线', '节奏规划', '视觉基调', '关键场面', '悬念与期待'];
  W.DIR_DIMS = ['光影', '色调', '情感氛围', '服化道审美', '表演气质']; // 与 gsettings.js DIR_DIMS 同源(其为 UI 全局来源)
  W.DIR_STYLES = ['漫剧', '动漫', '写实'];
  /* ---- 机位词表(景别/运镜/视角/角度)单一来源 ----
   * 结构表带 UI 与英文摄影词所需的附加列,扁平名称数组 CAMERAS/VIEWS/ANGLES/SIZES 是其名称投影:
   * 分镜数据只存名称(s.camera / s.cameraSpec.*),白名单校验与拆镜模板一律取名称数组;
   * camera.js 机位选择器、review.js 景别衔接检查、sb-io.js CSV 导入、agent.js 改镜协议一律由本表派生,
   * 不在消费方另写第二份词表。景别/运镜的情绪语义是知识库「景别运镜」条目的正文,本表不复述。 */
  /* 景别阶梯:自空间到情绪逐层收紧,索引即级差(相邻=1、隔一级=2、两极=首尾);dist 为机位相对距离(中景=1) */
  W.SHOT_SIZES = [
    { name: '大全景', dist: 2, en: 'extreme wide shot' },
    { name: '全景', dist: 1.4, en: 'wide shot' },
    { name: '中景', dist: 1, en: 'medium shot' },
    { name: '近景', dist: 0.8, en: 'medium close-up' },
    { name: '特写', dist: 0.6, en: 'close-up' },
    { name: '超级特写', dist: 0.4, en: 'extreme close-up' },
  ];
  /* 运镜:axis='move' 为镜头运动(arrow/short 供机位选择器芯片);末三项 axis='angle'/'size' 与
     「角度」「景别」两栏语义重叠,是 camera 枚举的早期取值,留在取值全集内以免动既有分镜数据与生成指纹 */
  W.CAMERA_MOVES = [
    { name: '固定镜头', axis: 'move', arrow: '⊙', short: '固定', en: 'static shot' },
    { name: '推镜头', axis: 'move', arrow: '↑', short: '前推', en: 'push in' },
    { name: '拉镜头', axis: 'move', arrow: '↓', short: '后拉', en: 'pull out' },
    { name: '摇镜头', axis: 'move', arrow: '↔', short: '横摇', en: 'pan' },
    { name: '移镜头', axis: 'move', arrow: '→', short: '平移', en: 'tracking shot' },
    { name: '跟镜头', axis: 'move', arrow: '⇢', short: '跟随', en: 'follow shot' },
    { name: '环绕镜头', axis: 'move', arrow: '↻', short: '环绕', en: 'orbit' },
    { name: '俯拍', axis: 'angle' },
    { name: '仰拍', axis: 'angle' },
    { name: '特写', axis: 'size' },
  ];
  /* 拍摄角度:deg 为仰角(负=仰拍),camera.js 机位几何与本表同源 */
  W.CAMERA_ANGLES = [
    { name: '仰拍', deg: -30, en: 'low-angle shot' },
    { name: '平视', deg: 0, en: 'eye-level shot' },
    { name: '俯拍', deg: 30, en: 'elevated shot' },
    { name: '高角度', deg: 60, en: 'high-angle shot' },
  ];
  W.CAMERAS = W.CAMERA_MOVES.map(x => x.name);
  W.VIEWS = ['正面', '侧面', '背面'];
  W.ANGLES = W.CAMERA_ANGLES.map(x => x.name);
  W.SIZES = W.SHOT_SIZES.map(x => x.name);
  /* 相邻两镜景别级差(景别衔接口诀的判定基准):同级 0、相邻 1、隔一级 2……两极 4-5;
     任一端不在阶梯上(空值或自定义词)返回 -1,由调用方跳过判定 */
  W.sizeGap = function (a, b) {
    const i = W.SIZES.indexOf(a), j = W.SIZES.indexOf(b);
    return i < 0 || j < 0 ? -1 : Math.abs(i - j);
  };
  W.VISION_MODELS = ['qwen2.5-vl-72b-instruct', 'doubao-1.5-vision-pro', 'qwen-vl-max-2025-01-25'];
  W.SPLIT_RULES = `分镜拆解规则(必须遵守):
1. 叙事细化,而非形式拆分——判断标准:该情节若用真人影视拍摄需要多个镜头才能完成表达,则 AI 漫剧同样必须拆分。禁止一个分镜同时承载环境交代、人物动作、情绪变化与大量对白;禁止用静态画面强行承载时间流逝与情绪转折。
2. 景别按"从空间到情绪"逐层推进释放信息:环境全景(交代时间/地点/氛围)→中景(人物与环境关系、基础动作)→近景(表情、肢体细节、情绪走向)→特写(关键情绪节点或剧情转折)→超级特写(信息锚点:眼神、道具、细微反应)。不要求每次用全五层,但情绪转折越强,镜头层级越要靠后;避免连续多镜同景别。
3. 信息密度控制:单镜台词超过 40 字必须拆镜;一个分镜只承担一个核心信息点(只交代环境/只表达情绪变化/只推进一次关键对话)。
4. 逐镜自检:这一镜头只让观众记住一件事了吗?答案模糊就继续拆。
5. 景别衔接口诀(必须遵守):
   - 相邻景别不硬切:前后两镜景别避免相同或相邻(如 全景→全景、全景→中景 属无信息跳切,剪辑上显生硬);
   - 景别切换隔一别:优先跨一级切换景别(如 大全景→中景、全景→近景、中景→特写),靠景别落差释放信息;
   - 两极镜头不衔接:大全景与特写/超级特写不得直接对切,须用全景或中景做过渡镜。`;
  W.PROMPT5 = `提示词五段式标准结构(prompt 必须按此顺序组织,段间用句号衔接):
1. 风格氛围:影视风格、色调、画质、年代感、情绪基调。
2. 场景环境:时间、地点、天气、光线、背景元素、空间氛围。
3. 镜头运动:景别、运镜方式、运动速度、视角、焦距效果。
4. 分镜内容:剧本中人物动作、表情以及台词。
5. 负面提示词:置于末尾,以"负面提示词:"开头,如禁止出现 BGM、字幕、水印等。
资产标记规范:角色用 @角色名,场景用 $场景名,道具用 #道具名。`;

  /* ================= 通用环境无关小件 ================= */
  /* 语言要求(自 projects.js 下沉;p.locale 驱动) */
  W.langOf = p => ({ zh: '', en: ',台词与旁白使用口语化美式英语', sea: ',台词与旁白使用简单地道的英语口语(东南亚受众)', jp: ',台词与旁白使用日语' }[(p && p.locale) || 'zh'] || '');
  /* 构思定调注入(自 understanding.js 下沉;p.concept 驱动,inject===false 关闭) */
  W.conceptInject = function (p) {
    const c = (p && p.concept) || {};
    if (c.inject === false) return '';
    const parts = [];
    if (c.statement) parts.push('导演阐述:' + c.statement.slice(0, 60));
    if (c.artStyle) parts.push('美术风格:' + c.artStyle.slice(0, 40));
    if (c.lighting) parts.push('光影基调:' + c.lighting.slice(0, 30));
    if (c.editPace) parts.push('剪辑节奏:' + c.editPace.slice(0, 30));
    if (c.performance) parts.push('表演气质:' + c.performance.slice(0, 30));
    return parts.length ? '。构思定调:' + parts.join(';') : '';
  };
  /* 导演设定注入(自 gsettings.js directorInject 下沉;ds=settings.directorSetting,系统三类风格且开关开时拼接) */
  W.directorNote = function (ds) {
    if (!ds || ds.inject === false) return '';
    if (!W.DIR_STYLES.includes(ds.style)) return ''; // 自定义风格不自动注入
    const parts = W.DIR_DIMS.filter(d => ds[d]).map(d => d + ':' + String(ds[d]).slice(0, 40));
    return parts.length ? '。导演设定:' + parts.join(';') : '';
  };
  /* 雇佣专家方法论注入(通道与 directorNote 同款;ex=生效专家对象,board 非空表示该专家来自板块雇佣):
   * 无专家或空 persona 返回空串——不注入时提示词与未雇佣时逐字节一致;persona 截断 ≤200 字 */
  W.personaNote = function (ex, board) {
    const persona = ex && ex.persona ? String(ex.persona).trim() : '';
    if (!persona) return '';
    return '。专家方法论(' + (ex.name || '雇佣专家') + (board ? '·' + board + '板块' : '') + '):' + persona.slice(0, 200);
  };
  /* 工作流→板块映射(键与 agent.js AGENT_BOARDS 板块键同名):决定该工作流优先取哪个板块雇佣的专家 */
  W.WF_BOARD = { understanding: '导演', 'smart-storyboard': '分镜', 'smart-review': '成片', 'extract-subjects': '主体', 'split-episodes': '剧本' };
  /* 生效专家方法论(双端唯一装配口):板块雇佣专家 > 全局雇佣专家 > 不注入,与 Agent 身份解析同序。
   * o={experts:全部专家(预置+自定义),hiredId:settings.hiredExpert,boards:p.boards,board:板块键};
   * 数据一律由调用方注入(浏览器 allExperts()/Store,服务端 ExpertsData/state 树),本模块不碰环境 */
  W.personaFor = function (o) {
    o = o || {};
    const list = Array.isArray(o.experts) ? o.experts : [];
    const find = id => (id && list.find(e => e && e.id === id)) || null;
    const bd = (o.board && o.boards && o.boards[o.board]) || null;
    const bex = bd ? find(bd.expert) : null;
    return W.personaNote(bex || find(o.hiredId), bex ? o.board : '');
  };
  /* 协作记忆召回(自 agent.js 下沉,双端同算法;mem=state.agentMemory 数组经参数注入):
   * 同板块记忆优先(该板块 Agent 越用越懂该板块),再补全局最近,最后按输入关键词命中加权补召 */
  W.memRecall = function (mem, input, scope) {
    mem = Array.isArray(mem) ? mem.filter(m => m && m.text) : [];
    if (!mem.length) return [];
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
  };
  W.memBlock = function (mem, input, scope) {
    const m = W.memRecall(mem, input, scope);
    return m.length ? '\n历史协作记忆(用户过往的偏好与已确认的修改决定,参考以保持一致):\n' + m.map(t => '- ' + t.text).join('\n') : '';
  };
  /* ---- 专家自进化的记忆源面(双端唯一一份) ----
   * 召回(memRecall)是"同板块优先、再补全局最近"的加权取样,给的是对话上下文;蒸馏进 persona 是把沉淀
   * 写死进专家人设,两者不能共用一个取样口:导演板块的定调偏好蒸馏进分镜专家的人设后,该专家在每条
   * 分镜链路上都会带着不属于它的口径工作。故蒸馏侧只认板块归属,按下面两步硬过滤,不做加权补召。
   * 与本文件其余函数同纪律:专家对象/项目树/雇佣状态/板块词表一律经参数注入,函数体不碰环境句柄。 */
  /* 专家的生效板块(去重保序,板块序取入参词表):判据与 personaFor 同一套——板块雇佣 > 全局雇佣。
   * o={expert:专家对象, projects:项目列表(可空), hiredId:settings.hiredExpert, boards:板块词表}。
   * 逐板块算生效专家(该项目该板块的 boards[b].expert,未指定则回落全局雇佣者),命中本专家即计入该板块;
   * 无项目时按"仅全局雇佣状态"判(与 personaFor 传 boards=null 同形)。
   * 专家带 from(预置专家的自定义副本记的派生源 id)时,派生源的雇佣事实一并认——副本自己还没被雇过,
   * 但它承接的正是派生源在那些板块上的活;副本被雇佣后按自己的 id 命中,两者取并集不互斥。
   * 一个板块都不命中回空数组——该专家没在任何板块工作过,调用方据此跳过蒸馏,不退回全量记忆桶。 */
  W.expertBoards = function (o) {
    o = o || {};
    const e = o.expert;
    if (!e || !e.id) return [];
    const ids = [e.id, e.from].filter(Boolean);
    const list = Array.isArray(o.boards) ? o.boards.filter(Boolean) : [];
    const projects = Array.isArray(o.projects) && o.projects.length ? o.projects : [null];
    return list.filter(b => projects.some(p => {
      const bd = (p && p.boards && p.boards[b]) || null;
      return ids.indexOf((bd && bd.expert) || o.hiredId) >= 0;
    }));
  };
  /* 蒸馏输入(按板块硬过滤,回条目数组):只收 scope 落在 boards 里的条目。
   * boards 为空即回空数组;无 scope 的条目(板块不明的手工沉淀)一律不收——板块归属拿不准就不蒸馏,
   * 不拿全桶凑数。去重按 text(同一条偏好在多板块沉淀过时只蒸一次)。 */
  W.memForBoards = function (mem, boards) {
    const bs = Array.isArray(boards) ? boards.filter(Boolean) : [];
    if (!bs.length) return [];
    const seen = new Set();
    return (Array.isArray(mem) ? mem : []).filter(m => {
      if (!m || !m.text || bs.indexOf(m.scope) < 0) return false;
      if (seen.has(m.text)) return false;
      seen.add(m.text);
      return true;
    });
  };
  /* ---- 专家自进化的蒸馏面(双端唯一一份) ----
   * 板块过滤(上面两个函数)之后的四步:落点判定 → 提示词两半 → 条款规整 → 条款落 persona。
   * 浏览器 js/experts.js evolveExpert 与服务端 /api/wf/evolve-expert 一律委托这里,两端一字不抄——
   * 蒸馏结果是写死进专家人设的,两端提炼口径分叉即同一个专家在浏览器与 headless 上长成两份。
   * 环境差异(落库/toast/计费/记账)留在各端调用点,本层只出判定与文本,不碰环境句柄。 */
  /* 预置专家的自定义副本(纯造形):深拷贝——浅拷贝会让副本与预置共用 dims/tpl 嵌套对象(改副本即污染注册表);
   * from 记派生源 id(雇佣事实仍挂在预置 id 上,expertBoards 认这一层);名字带派生源名以便在专家库里认得出。 */
  W.presetCopyOf = function (e, id) {
    return Object.assign(JSON.parse(JSON.stringify(e)), {
      id, custom: true, from: e.id, name: (e.name + '·我的').slice(0, 20),
    });
  };
  /* 蒸馏落点(双端同判):预置注册表是双端共享的静态数据,改不得也存不住,故预置专家的条款落自定义副本;
   * 同一预置专家只派生一份(已派生过就复用,再次进化落回同一副本),自定义专家就地落。
   * o={presets:预置注册表, customs:自定义专家库, uid:新副本 id}。
   * 回 {target, copy}:copy 非空表示这一份是本次新派生、由调用方负责入库(浏览器 Store.save,服务端随 wfSave)。
   * 判"是不是预置"用注册表反查而不是 e.custom——自定义专家不一定带 custom:true(早年数据与测试夹具不带)。 */
  W.evolveTarget = function (e, o) {
    o = o || {};
    const customs = Array.isArray(o.customs) ? o.customs : [];
    if (!e || !(Array.isArray(o.presets) ? o.presets : []).some(x => x && x.id === e.id)) return { target: e, copy: null };
    const had = customs.find(x => x && x.from === e.id);
    if (had) return { target: had, copy: null };
    const c = W.presetCopyOf(e, o.uid);
    return { target: c, copy: c };
  };
  /* 蒸馏 system 半:人设句取注册表 forge.evolveSystem(浏览器隐式读覆盖表、服务端显式传),
   * 其后的板块点名与 clauses 契约(1-4 条、每条 ≤40 字)不开放覆盖——改坏即整轮蒸不出条款而那次调用已交付。 */
  W.evolveSystem = (bt, ov) => Prompts.get('forge.evolveSystem', ov) + `根据用户与创作助手在「${bt}」板块的历史协作记忆(用户的纠正/偏好/已确认决定),为该板块的指定专家蒸馏「进化条款」。只返回 JSON {"clauses":["条款1","条款2"]}(1-4条)。要求:与该专家人设领域及「${bt}」板块职责相关、具体可执行、不重复其已有条款;每条≤40字。`;
  /* 蒸馏 user 半:落点专家的身份/生效板块/现有人设 + 该板块沉淀条目(mem 为文本数组,已由 memForBoards 过滤去重) */
  W.buildEvolveUser = (t, bt, mem) => `专家:「${t.name}」(${t.role || '其他'})生效板块:${bt}
人设:
${t.persona}

「${bt}」板块历史协作记忆:
${(Array.isArray(mem) ? mem : []).map((x, i) => (i + 1) + '. ' + x).join('\n')}`;
  /* 条款规整:取 clauses 数组 → 去空白空条 → 本地再去重一次(不重复落点已有条款)→ 截 1-4 条上限。
   * 回空数组即"无新增条款"——业务结论而非失败,调用方据此不退费(LLM 已交付)。 */
  W.evolveClauses = function (out, persona) {
    return (out && Array.isArray(out.clauses) ? out.clauses : []).map(c => String(c).trim()).filter(Boolean)
      .filter(c => !String(persona || '').includes(c)).slice(0, 4);
  };
  /* 条款落 persona(就地改写落点专家):已有「【进化条款 · 日期】」段则并入该段末尾,否则新开一段;
   * evolutions 计数 +1(专家卡的进化角标)。d 为日期对象(段名取年/月/日,两端同格式)。 */
  W.evolveApply = function (t, clauses, d) {
    d = d || new Date();
    const seg = `【进化条款 · ${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}】`;
    const body = clauses.map(c => '- ' + c).join('\n');
    if (String(t.persona || '').includes('【进化条款 · ')) {
      t.persona = t.persona.replace(/(【进化条款 · [^\n]+】\n(?:(?:- [^\n]*)\n?)*)/, m2 => m2.replace(/\n?$/, '\n') + body);
    } else {
      t.persona = String(t.persona || '').replace(/\s*$/, '') + `\n${seg}\n${body}`;
    }
    t.evolutions = (t.evolutions || 0) + 1;
    return t;
  };
  /* 审片侧三步(分镜评审/整集共性汇总/四维成片评审)的人设+记忆注入段:
   * 这三步的 user 模板是纯指令 + JSON 清单,注入段独立成段拼在提示词最前(不进模板变量,不受用户覆盖影响);
   * personaNote 以「。」起头(与 directorNote 同通道口径),独立成行时去掉句首标点。
   * 两者都空即返回空串——未雇佣专家且无沉淀记忆时提示词与接通道前逐字节一致 */
  W.reviewCtxNote = function (ctx) {
    ctx = ctx || {};
    const persona = String(ctx.personaNote || '').replace(/^。/, '').trim();
    const mem = String(ctx.memText || '').trim();
    return (persona ? persona + '\n' : '') + (mem ? mem + '\n' : '');
  };
  /* ---- 闭环结论回流协作记忆(派生面双端唯一一份) ----
   * 派生与写入分离:本组只吃入参、只回值,记忆数组由写入侧(浏览器 Store.state / 服务端 state 树 /
   * CLI meta 桶)显式传进来再存回去——沿用既有 state.agentMemory,不新建存储桶,函数体不碰环境句柄。
   * 只回流**可判定**的结论:闭环自己刚写下的那份记录里的结构化字段与计数(待返工镜数、共性问题类型、
   * 四维最弱维、发布门状态与未过门项),不复述模型评语原文、不在本层另造评价口径;
   * 判定输入取不到即回空数组——没有结论就不写记忆,不冒充。
   * 不回流整集均分:成片板块的记忆会被下一轮逐镜审片提示词召回(memBlock scope='成片'),
   * 把上一轮的分数喂回评分方等于给下一轮的打分设锚点;要规避什么(问题类型/最弱维)才是回流的用处。 */
  W.MEM_MAX = 50;       // 记忆桶条数上限(与浏览器 memRemember、CLI memory add 同口径)
  W.MEM_TEXT_MAX = 120; // 单条截断字数(同上)
  /* 待返工镜的分数线不在本层另立一份:一律现取 Domain.REVIEW_MIN(与审片报告重抽入口、
   * 智能审片闭环的确认闸、分集状态与主线审片步骤同一个常量),本层只读不改门禁口径 */
  W.MEM_EP_LONG = 2000; // 单集建议字数上限:与分集列表「超 2000 字」标签、分集完成提示同数,本层只读不改建议口径
  /* o 各分支互不影响,给哪支就回哪条(可同时给多支);ctx={now:取时间戳(函数或字符串)}:
   *   {ep(带 lastReview)}           审片闭环
   *   {p,gate,rel}                  发布闭环
   *   {und:{ep}}                    本集理解闭环(前段四步,下同)
   *   {sb:{ep}}                     智能分镜闭环
   *   {split:{p,mode}}              剧本拆集闭环
   *   {extract:{p,added,skipped}}   提取主体闭环
   * 回 [{text,time,scope,fb}]:scope=回流板块(板块键一律取 WF_BOARD 单源,与该步提示词召回记忆时同键——
   * 回流下去的结论,下一轮同一步按 memBlock 就吃得到),fb=回流键(同一集/同一项目反复闭环时
   * memWrite 按它原地更新,不无限追加) */
  W.memFeedback = function (o, ctx) {
    o = o || {};
    const now = ctx && ctx.now;
    const time = typeof now === 'function' ? now() : String(now || '');
    const board = W.WF_BOARD['smart-review'];
    const out = [];
    const add = (fb, text, sc) => out.push({ text: String(text).slice(0, W.MEM_TEXT_MAX), time, scope: sc || board, fb });
    const ep = o.ep, lr = ep && ep.lastReview;
    if (lr && typeof lr.avg === 'number') {
      const per = Array.isArray(lr.perShot) ? lr.perShot : [];
      const low = per.filter(x => x && +x.score < Domain.REVIEW_MIN).length;
      const types = (((lr.common || {}).issues) || []).map(i => i && i.type).filter(Boolean).slice(0, 3);
      /* 四维最弱维:维度名现取 normalizeCut 的产出形状(维度名的唯一定义在本文件的四维规整处,
       * 与 SK-24 校验面同口径),四维缺失或该步 LLM 失败标 null 时这一段不出现 */
      const cut = lr.cut && typeof lr.cut === 'object' ? lr.cut : null;
      const dims = cut ? Object.keys(W.normalizeCut({}))
        .filter(k => cut[k] && typeof cut[k] === 'object' && typeof cut[k].score === 'number')
        .sort((a, b) => cut[a].score - cut[b].score) : [];
      const parts = ['待返工 ' + low + '/' + per.length + ' 镜'];
      if (types.length) parts.push('共性问题 ' + types.join('、'));
      if (dims.length) parts.push('四维最弱维 ' + dims[0] + ' ' + cut[dims[0]].score);
      add('review:' + ep.id, '审片闭环回流·' + (ep.title || ep.id) + ':' + parts.join(';') + ';后续拆镜与提示词优先规避这几处');
    }
    const g = o.gate;
    if (g && typeof g.overall === 'string' && g.overall) {
      const p = o.p || {};
      const open = (Array.isArray(g.gates) ? g.gates : []).filter(x => x && x.status !== 'pass').map(x => x.label).filter(Boolean);
      add('release:' + (p.id || ''), '发布闭环回流·' + (p.name || p.id || '本项目') + ' v' + ((o.rel && o.rel.ver) || p.__ver || 0)
        + ':发布门 ' + g.overall + '(fail ' + (+g.fails || 0) + '/warn ' + (+g.warns || 0) + ')'
        + (open.length ? ';未过门 ' + open.join('、') : ';十门全过'));
    }
    /* 本集理解:六维产出数与缺的维名。维名取 UND_DIMS 单源(六维改名/增减时回流文案自动跟上);
     * fallback 模板(浏览器 LLM 失败回退)不是理解结论——那一支不写,六维全空同理 */
    const un = o.und && o.und.ep && o.und.ep.understanding;
    if (un && !un.fallback) {
      const miss = W.UND_DIMS.filter(d => !String(un[d] || '').trim());
      if (miss.length < W.UND_DIMS.length) {
        const e2 = o.und.ep;
        add('und:' + e2.id, '理解闭环回流·' + (e2.title || e2.id) + ':六维产出 ' + (W.UND_DIMS.length - miss.length) + '/' + W.UND_DIMS.length
          + (miss.length ? ';缺 ' + miss.join('、') : ';六维齐备'), W.WF_BOARD.understanding);
      }
    }
    /* 智能分镜:镜数与预估总时长 + 两处缺口(缺提示词的镜、既无人物也无场景道具的空挂镜)。
     * 时长走 Domain.estShotDuration 双端同口径,本层不另算第二份段时长 */
    const sbEp = o.sb && o.sb.ep, shots = sbEp && Array.isArray(sbEp.shots) ? sbEp.shots : null;
    if (shots && shots.length) {
      const dur = s => (Domain && Domain.estShotDuration ? Domain.estShotDuration(s) : (s.duration || 5));
      const secs = Math.round(shots.reduce((a, s) => a + dur(s), 0));
      const noPrompt = shots.filter(s => !String(s.prompt || '').trim()).length;
      const noSubj = shots.filter(s => !(s.characters || []).length && !s.scene && !(s.props || []).length).length;
      add('sb:' + sbEp.id, '分镜闭环回流·' + (sbEp.title || sbEp.id) + ':出 ' + shots.length + ' 镜约 ' + secs + ' 秒'
        + ';缺提示词 ' + noPrompt + ' 镜;未挂主体 ' + noSubj + ' 镜', W.WF_BOARD['smart-storyboard']);
    }
    /* 剧本拆集:集数与切分模式 + 超长集缺口(MEM_EP_LONG 与分集页「超 2000 字」标签同数,只读不改建议口径) */
    const spP = o.split && o.split.p, eps = spP && Array.isArray(spP.episodes) ? spP.episodes : null;
    if (eps && eps.length) {
      const lens = eps.map(e => String((e && e.content) || '').length);
      const over = lens.filter(n => n > W.MEM_EP_LONG).length;
      add('split:' + (spP.id || ''), '拆集闭环回流·' + (spP.name || spP.id || '本项目') + ':切出 ' + eps.length + ' 集('
        + (o.split.mode || 'even') + ');最长 ' + Math.max.apply(null, lens) + ' 字'
        + (over ? ';' + over + ' 集超 ' + W.MEM_EP_LONG + ' 字建议再拆' : ';无超长集'), W.WF_BOARD['split-episodes']);
    }
    /* 提取主体:本轮新增/已有(入库口径由调用方给,同名同类不覆盖)+ 主体库总量与缺参考图缺口 */
    const exP = o.extract && o.extract.p;
    if (exP && Array.isArray(exP.subjects) && exP.subjects.length) {
      const ex = o.extract;
      const noImg = exP.subjects.filter(s => s && !s.image).length;
      add('extract:' + (exP.id || ''), '提取主体闭环回流·' + (exP.name || exP.id || '本项目') + ':本轮新增 ' + (+ex.added || 0)
        + ' 位、已有 ' + (+ex.skipped || 0) + ' 位;主体库共 ' + exP.subjects.length + ' 位,其中 ' + noImg + ' 位缺参考图',
      W.WF_BOARD['extract-subjects']);
    }
    return out;
  };
  /* 回流写入(双端同一口径):带 fb 的条目按键原地更新——同一集/同一项目反复闭环只留最新一条结论;
   * 无 fb 的条目按追加处理。回新数组,不改入参。
   * 原地更新只压住"同一集反复跑"这一路:集数本身在长——回流每集占三条(理解/分镜/审片各一个 fb 键),
   * 桶到 MEM_MAX 后若还按先进先出截尾,十几集下来先出局的就是排在最前面的用户「记住…」。
   * 所以满桶淘汰按优先级来:先挤最旧的自动回流条(带 fb),用户自沉淀的条目留到最后;
   * 本次刚写下/刚更新的条目不参与本轮淘汰(否则新结论会把自己挤掉);
   * 自动条不够扣(空桶、全是用户条)时退回先进先出挤最旧的——与原行为一致。 */
  W.memWrite = function (mem, entries) {
    const out = (Array.isArray(mem) ? mem : []).slice();
    const fresh = [];
    (Array.isArray(entries) ? entries : []).forEach(e => {
      if (!e || !e.text) return;
      const i = e.fb ? out.findIndex(m => m && m.fb === e.fb) : -1;
      if (i >= 0) { out[i] = Object.assign({}, out[i], e); fresh.push(out[i]); }
      else { out.push(e); fresh.push(e); }
    });
    while (out.length > W.MEM_MAX) {
      let i = out.findIndex(m => m && m.fb && fresh.indexOf(m) < 0);
      if (i < 0) i = out.findIndex(m => fresh.indexOf(m) < 0);
      out.splice(i < 0 ? 0 : i, 1);
    }
    return out;
  };
  /* ---- 记忆播种与板块迁移(双端唯一一份) ----
   * 板块改名迁移与"标准沉淀 + 知识库种子"补种此前只发生在浏览器 agent.js memAll() 里,headless
   * (CLI/MCP/服务端工作流)读写记忆桶时跑不到那段——纯 headless 用户的记忆里没有沉淀条目、旧板块名
   * 也要等浏览器打开一次才归位。本组把那段派生下沉为纯函数,两端同一份。
   * 与本文件其余函数同纪律:记忆桶、知识库、时间戳、板块词表一律经参数注入,函数体不碰任何环境句柄;
   * 落点仍是既有 state.agentMemory,条目仍是既有结构({text,time,scope} + 知识库条目的 kb 同键标识),
   * 不新建存储桶、不另造第二套记忆 schema。
   * 板块词表不在本层另写一份:浏览器传 AGENT_BOARDS 的板块键,headless 传 Skills.STAGES 主线七步名
   * 加支线「导演」板块(WF_BOARD.understanding),两端取值同集。 */
  W.MEM_BOARD_RENAMES = { 构思: '导演' }; // 板块改名:旧 scope → 新 scope(条目原地改名,不复制第二条)
  /* 标准沉淀:用户确认的工作流标准(正文只此一份;legacy=已沉淀过的识别标记,命中则保留用户既有条目不重复种) */
  W.MEM_STD_SEEDS = [
    {
      board: '分镜', legacy: '五段式标准结构',
      text: '分镜提示词五段式标准结构:风格氛围(风格/色调/画质/年代感/情绪基调)+场景环境(时间/地点/天气/光线/空间氛围)+镜头运动(景别/运镜/速度/视角/焦距)+分镜内容(人物动作/表情/台词)+负面提示词(禁BGM/字幕等);标记 @角色 $场景 #道具',
    },
    {
      board: '分镜', legacy: '景别衔接口诀',
      text: '景别衔接口诀:相邻景别不硬切(前后镜景别避免相同或相邻,防止无信息跳切);景别切换隔一别(优先跨一级切换,如全景→近景、中景→特写);两极镜头不衔接(大全景与特写/超级特写不得直接对切,须用全景或中景过渡)',
    },
  ];
  /* 知识库沉淀(js/knowledge.js):按 KB.SECTIONS 键取条目正文种入长期记忆,召回时按关键词命中自动注入。
   * keys=取用键(条目正文唯一权威,此处不留第二份措辞);kb=同键沉淀标识,条目正文改过后自动跟随;
   * legacy=旧手抄版的识别标记(老数据已沉淀过则保留用户既有条目,不重复种) */
  W.MEM_KB_SEEDS = [
    { keys: ['钩子六型'], board: '剧本', legacy: '钩子六型' },
    { keys: ['打脸四步', '付费卡点'], board: '剧本', legacy: '打脸四步' },
    { keys: ['对话铁律'], board: '剧本', legacy: '对话铁律' },
    { keys: ['景别运镜', '场面调度', '剪辑节奏'], board: '分镜', legacy: '景别即情绪' },
    { keys: ['抽卡军规', '抽卡公式'], board: '分镜', legacy: '抽卡五条军规' },
  ];
  /* 有登记种子的板块(去重保序):播种指定板块时的空板判据,由上面两张种子表推出,不另写清单 */
  W.memSeedBoards = function () {
    const out = [];
    W.MEM_STD_SEEDS.concat(W.MEM_KB_SEEDS).forEach(s => { if (out.indexOf(s.board) < 0) out.push(s.board); });
    return out;
  };
  const memBoardCheck = (board, boards) => {
    if (Array.isArray(boards) && boards.length && boards.indexOf(board) < 0) {
      throw new Error('未知板块名:' + board + '(可用板块:' + boards.join('/') + ')');
    }
  };
  /* 播种/迁移(mem=记忆数组,回新数组不改入参)。
   * o={kb:知识库对象(缺省跳过知识库种子),now:取时间戳(函数或字符串),boards:板块词表,board:只播该板块}。
   * 回 {mem, added:[新种条目], updated:[正文跟随更新的知识库键], migrated:[{from,to,count}], changed}。
   * 明确报错(不静默空成功):board 不在板块词表 → 未知板名;board 无登记种子 → 空板。
   * 已种过再播是幂等的(added 为空、changed=false),那不是错误。 */
  W.memSeed = function (mem, o) {
    o = o || {};
    const out = (Array.isArray(mem) ? mem : []).slice();
    const nowOf = typeof o.now === 'function' ? o.now : () => String(o.now === undefined || o.now === null ? '' : o.now);
    const board = o.board ? String(o.board).trim() : '';
    if (board) {
      memBoardCheck(board, o.boards);
      if (W.memSeedBoards().indexOf(board) < 0) {
        throw new Error('板块「' + board + '」没有登记的记忆种子(有种子的板块:' + W.memSeedBoards().join('/') + ')');
      }
    }
    const added = [], updated = [], migrated = [];
    // 板块改名迁移(表驱动,自动那一半):旧板名下无条目属常态,不报错
    Object.keys(W.MEM_BOARD_RENAMES).forEach(from => {
      const to = W.MEM_BOARD_RENAMES[from];
      if (board && to !== board) return;
      let n = 0;
      out.forEach((m, i) => { if (m && m.scope === from) { out[i] = Object.assign({}, m, { scope: to }); n++; } });
      if (n) migrated.push({ from, to, count: n });
    });
    const has = txt => out.some(m => m && String(m.text || '').indexOf(txt) >= 0);
    W.MEM_STD_SEEDS.forEach(s => {
      if (board && s.board !== board) return;
      if (has(s.legacy)) return;
      const entry = { text: s.text, time: nowOf(), scope: s.board };
      out.push(entry);
      added.push(entry);
    });
    const kb = o.kb;
    if (kb && typeof kb.pick === 'function') W.MEM_KB_SEEDS.forEach(s => {
      if (board && s.board !== board) return;
      const key = s.keys.join('+');
      const text = kb.pick.apply(kb, s.keys);
      const i = out.findIndex(m => m && m.kb === key);
      if (i >= 0) { // 条目正文改过:同键沉淀跟随更新
        if (out[i].text !== text) { out[i] = Object.assign({}, out[i], { text }); updated.push(key); }
        return;
      }
      if (s.legacy && has(s.legacy)) return; // 老数据的手抄版:保留用户既有条目,不重复种
      const entry = { text, kb: key, time: nowOf(), scope: s.board };
      out.push(entry);
      added.push(entry);
    });
    return { mem: out, added, updated, migrated, changed: !!(added.length || updated.length || migrated.length) };
  };
  /* 板块迁移(用户显式指定旧板名→新板名):条目原地改 scope,不丢不双写,回新数组不改入参。
   * o={boards:板块词表}。空板(旧板名下无条目)与未知新板名一律抛错——迁移是用户显式请求,
   * 不静默回一个"成功但什么也没动"的结果。 */
  W.memMigrateBoard = function (mem, from, to, o) {
    from = String(from === undefined || from === null ? '' : from).trim();
    to = String(to === undefined || to === null ? '' : to).trim();
    if (!from || !to) throw new Error('板块迁移需同时给出旧板名与新板名');
    if (from === to) throw new Error('旧板名与新板名相同:' + from);
    memBoardCheck(to, (o || {}).boards);
    const out = (Array.isArray(mem) ? mem : []).slice();
    const moved = [];
    out.forEach((m, i) => {
      if (!m || m.scope !== from) return;
      out[i] = Object.assign({}, m, { scope: to });
      moved.push(out[i]);
    });
    if (!moved.length) throw new Error('旧板名「' + from + '」下没有记忆条目,未发生迁移');
    return { mem: out, moved, migrated: [{ from, to, count: moved.length }], changed: true };
  };
  /* 导演设定五维文本(understanding.js DIMS_DIR 下沉) */
  W.dimsText = ds => W.DIR_DIMS.filter(d => ds && ds[d]).map(d => `${d}:${ds[d]}`).join('\n');
  /* 章节事件图谱(自 understanding.js 下沉):sourceRev 失配(或旧数据无 sourceRev 且正文改过)不注入,防"新正文+旧图谱" */
  W.eventsOfEpisode = function (p, ep) {
    const g = ((p && p.eventGraph) || []).find(x => x.epId === (ep && ep.id));
    if (!g || !g.events || !g.events.length) return '';
    const stale = g.sourceRev === undefined ? (ep.contentRev || 0) > 0 : g.sourceRev !== (ep.contentRev || 0);
    if (stale) return '';
    return g.events.map((e, i) => `E${i + 1} [${e.who || '?'}@${e.where || '?'}] ${e.what || ''}${e.result ? ' → ' + e.result : ''}`).join('\n');
  };
  /* 分镜在全集中的时间码区间(自 review.js 下沉;时长经 Domain.estShotDuration 双端同口径)。
   * 起点累到本镜那一行为止,行对位取 Domain.rowIndexOf:同 id 多行时按 id 断在首行,
   * 后几行的时间码会一律报成首行那一段(报告里的"关键问题定位"因此指错时间)。
   * 表里找不到这一行时照旧累完全表(与收进本函数之前同形)。 */
  const fmtT = s => String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(Math.floor(s % 60)).padStart(2, '0');
  W.shotTimeRange = function (ep, s) {
    const rows = (ep && ep.shots) || [];
    const dur = x => (Domain && Domain.estShotDuration ? Domain.estShotDuration(x) : (x.duration || 5));
    const idx = Domain && Domain.rowIndexOf ? Domain.rowIndexOf(rows, s) : rows.indexOf(s);
    let start = 0;
    for (let i = 0; i < (idx < 0 ? rows.length : idx); i++) start += dur(rows[i]);
    return fmtT(start) + ' - ' + fmtT(start + dur(s));
  };
  /* 文生视频模板填充(settings.tplVideo,雇佣风格专家时被 tpl.tplVideo 覆写):{style}=项目风格 {shot}=本镜内容。
   * 模板为空即返回空串,调用方回落原骨架——未设置模板时提示词与接入前逐字节一致。
   * 取值一律用 settings 原值(不并浏览器 DEFAULTS),保证浏览器与 /api/wf/* 同一雇佣状态下拼装结果相同 */
  W.fillTplVideo = function (tpl, styleText, shotText) {
    const t = String(tpl || '').trim();
    if (!t) return '';
    return t.replace(/\{style\}/g, styleText || '').replace(/\{shot\}/g, shotText || '');
  };
  /* 拆镜要求行:模板作为逐镜 prompt 的要素要求({shot} 位置以"本镜画面内容"示意,由模型按镜填写);
   * 无模板返回空串(拼在既有要求行尾,不留空行) */
  W.tplVideoNote = function (tpl, styleText) {
    const t = W.fillTplVideo(tpl, styleText, '本镜画面内容');
    return t ? '\n- 文生视频提示词模板(每镜 prompt 须在五段式结构内落实以下要素):' + t : '';
  };

  /* ================= 剧本拆集(自 episode-util.js 下沉) =================
   * 模式判定与切分算法双端单源:浏览器 episode-util/proj-upload 委托,server.js /api/wf/split-episodes 复用,
   * CLI/MCP 经命令层调用——headless 能从"整部剧本"起跑通主线。三种模式:
   *   markers 集/章标记 ≥2 条(纯本地切原文,零 LLM 零计费)| llm 无标记且正文 ≤SPLIT_LLM_MAX(锚点协议切原文)
   *   | even 段落均分兜底(长文或 LLM 不可用)。三种模式都逐字保留原文,不改写正文。 */
  W.SPLIT_LLM_MAX = 15000; // 超此长度不调 LLM(提示词过长且原文易被改写),直接按段落均分
  W.scriptEpMarkers = text => (String(text || '').match(/第[一二三四五六七八九十百千0-9]+[集章回篇]/g) || []).length;
  W.splitMode = function (text, llmReady) {
    if (W.scriptEpMarkers(text) >= 2) return 'markers';
    if (llmReady && String(text || '').length <= W.SPLIT_LLM_MAX) return 'llm';
    return 'even';
  };
  W.splitTargetCount = text => Math.min(12, Math.max(2, Math.ceil(String(text || '').length / 800)));
  /* 本地切分(markers/even 同一函数:有标记按标记切,否则段落均分) */
  W.localSplitEpisodes = function (text) {
    const marker = /第[一二三四五六七八九十百千0-9]+[集章回篇][^\n]*/g;
    const matches = [...text.matchAll(marker)];
    const eps = [];
    if (matches.length >= 2) {
      matches.forEach((m, i) => {
        const end = i + 1 < matches.length ? matches[i + 1].index : text.length;
        eps.push({ title: m[0].trim().slice(0, 20), content: text.slice(m.index, end).trim() });
      });
    } else {
      // 均分: 每集约 800 字, 在段落边界切
      const paras = text.split(/\n+/).filter(Boolean);
      const target = W.splitTargetCount(text);
      const per = Math.ceil(paras.length / target);
      for (let i = 0; i < paras.length; i += per) {
        const chunk = paras.slice(i, i + per).join('\n');
        eps.push({ title: '第' + (eps.length + 1) + '集', content: chunk });
      }
    }
    return eps;
  };
  /* LLM 分集提示词(锚点协议:只回标题+开头原文锚句,正文由本地按锚点切,逐字不动);
   * ctx={personaNote,memText} 生效专家方法论与协作记忆(剧本板块),两端经同一注入口拼装——
   * personaNote 以「。」起头(与 directorNote 同通道口径),独立成行时去掉句首标点;
   * 无注入时提示词与接入前逐字节一致 */
  W.buildSplitUser = function (text, n, ctx) {
    ctx = ctx || {};
    return `将以下剧本按剧情节奏划分为 ${n} 集,返回 JSON 数组,每个元素:
{"title":"第X集 标题","anchor":"该集正文开头的原文第一句(≤30字,必须逐字引用原文,不要改写)"}
要求:每集剧情相对完整、节奏卡点合理;第一集 anchor 为全文开头第一句;anchor 必须能在原文中逐字找到。
${ctx.personaNote ? ctx.personaNote.replace(/^。/, '') + '\n' : ''}${ctx.memText ? ctx.memText.trim() + '\n' : ''}剧本:
${text}`;
  };
  /* 锚点定位切原文:按返回顺序在原文找锚句,越界/倒序/重复锚点跳过;结构不合法抛错(调用方决定退费/回退) */
  W.splitByAnchors = function (text, out) {
    if (!Array.isArray(out) || out.length < 2) throw new Error('LLM 未返回有效分集数组');
    const points = [];
    let from = 0;
    for (const o of out) {
      const anchor = String((o && o.anchor) || '').trim().slice(0, 30);
      if (!anchor) continue;
      let idx = text.indexOf(anchor, from);
      if (idx < 0) idx = text.indexOf(anchor.slice(0, 10), from); // 宽松兜底:前 10 字
      if (idx < 0) continue;
      if (points.length && idx <= points[points.length - 1].idx) continue; // 防倒序/重复
      points.push({ title: String((o && o.title) || '').trim().slice(0, 24), idx });
      from = idx + anchor.length;
    }
    if (points.length < 2) throw new Error('LLM 分集锚点定位失败');
    points[0].idx = 0; // 第一集恒从全文开头起,不丢头部
    return points.map((pt, i) => ({
      title: pt.title || '第' + (i + 1) + '集',
      content: text.slice(pt.idx, i + 1 < points.length ? points[i + 1].idx : text.length).trim(),
    })).filter(e => e.content.length > 10);
  };
  /* 分集在飞守卫(拆集会整表覆盖旧分集):生成中的镜头/节拍数——双端同口径,>0 一律拒绝重新分集 */
  W.splitInflight = function (p) {
    return ((p && p.episodes) || []).reduce((n, e) => n
      + ((e.shots || []).filter(s => s.video && s.video.status === 'generating').length)
      + ((e.beats || []).filter(b => b.video && b.video.status === 'generating').length), 0);
  };

  /* ================= 本集理解(自 understanding.js 下沉) ================= */
  W.undToText = function (u) {
    if (!u) return '';
    return W.UND_DIMS.filter(d => u[d]).map(d => `【${d}】${u[d]}`).join('\n');
  };
  /* ctx: {dsText, styleText, eventsText, content(已截 6000), personaNote?, memText?} */
  W.buildUndUser = function (ctx) {
    return `基于导演风格与本集剧本,生成本集导演理解,返回 JSON:
{"剧情脉络":"1-3句","情绪曲线":"1-3句","节奏规划":"1-3句","视觉基调":"1-3句","关键场面":"1-3句","悬念与期待":"2-4条,本集应埋的悬念点与观众期待感设计(如信息延迟揭露、结尾钩子、反转伏笔),用分号分隔"}
${ctx.dsText ? '已确认的全局导演设定:\n' + ctx.dsText : '(未设置全局导演风格,按项目风格理解)'}
项目风格:${ctx.styleText}${ctx.personaNote || ''}
${ctx.memText ? ctx.memText.trim() + '\n' : ''}${ctx.eventsText ? '本集事件图谱(剧情骨架,理解需覆盖以下事件的因果链):\n' + ctx.eventsText + '\n' : ''}本集剧本(前 6000 字):
${ctx.content}`;
  };
  W.undValid = out => !!(out && out.剧情脉络);
  W.undNormalize = function (out, now) {
    const u = {};
    W.UND_DIMS.forEach(d => u[d] = String(out[d] || ''));
    u.time = now();
    return u;
  };
  /* 失败回退模板(浏览器离线/失败回退用;服务端工作流不使用——失败如实退费) */
  W.undFallback = function (p, ep, now, styleText) {
    return {
      剧情脉络: `围绕「${ep.title}」主线矛盾展开,开场建立冲突,中段升级,结尾留钩子。`,
      情绪曲线: '由平静铺垫到冲突爆发,情绪逐镜抬升,高潮后短暂回落留白。',
      节奏规划: '前 1/3 建置节奏稍缓,中段加快剪辑密度,高潮一镜到底,收尾放缓。',
      视觉基调: `${styleText}风格,光影随情绪明暗变化,主体突出、背景虚化。`,
      关键场面: '核心对峙场面与情绪反转点,需给到特写与长时间停留。',
      悬念与期待: '关键信息延迟揭露,中段埋一处反转伏笔;结尾留核心悬念钩子,强化观众追更期待。',
      time: now(),
      fallback: true,
    };
  };

  /* ================= 智能分镜(自 sb-llm.js 下沉) ================= */
  /* 新建分镜空白结构(自 storyboard.js blankShot 下沉;uid 注入)
   * 镜头 id 是分镜表的唯一寻址键(findShot / shot-set / 审片按 shotId 回写 / 点名子集全按 id 认镜),
   * 故 id 只认注入的 uid、不接任何外来字段:浏览器各入口(CSV 导入、文本导入、资产库导入、加镜、
   * 插入、切分、节拍板转分镜、拉片建集、分镜脚本转换、导演助手插入、本地兜底拆镜)与两端 LLM
   * 拆镜(normalizeLLMShot 走本函数)都经此处发 id。外部给的 id 只有 cli.js shots-import 那一条
   * 透传路径(整表导出改完导回时按 id 认领原镜),它自带落库前的唯一闸。 */
  W.blankShot = function (order, cfg, uid) {
    return {
      id: uid('sh'), order, characters: [], scene: '', props: [],
      camera: cfg.batchCamera, plot: '', narration: '', dialogue: '', voice: cfg.narratorVoice,
      prompt: '', promptHistory: [], image: null, videoModel: cfg.batchVideoModel,
      video: { status: 'none' }, audio: false, history: [], transition: null,
      axisRule: '', intent: '',
      genStrategy: cfg.batchStrategy || 'ref', inheritTail: false, firstFrame: null, lastFrame: null, name: '',
    };
  };
  /* 智能分镜系统人设(按 KB.SECTIONS 键取条目正文,知识库单一来源;ov=用户提示词覆盖表):
   * 键与顺序即 skill 索引分镜步 shots.shotLanguage 的登记——「多镜头写法」治的是逐镜 prompt 的镜头流写法
   * (按时间顺序不写碎、图生视频声明依参考图、首尾帧策略收敛动作幅度),与拆镜同时决定的策略/景别同属一处口径。 */
  W.sbSystem = ov => Prompts.get('sb.system', ov) + KB.pick('景别运镜', '轴线匹配', '多镜头写法');
  /* 视频提示词改写人设句(注册表单取,不接方法论块):一键优化/produce 修订重抽两端的 system 半,
   * 与 buildOptimizeUser 配对使用——这两条链路的 user 半已给定原提示词与审片意见,方法论块会改写方向,
   * 故只收人设句,缺省输出与收编前的内联字面逐字节相同;覆盖 gen.promptSystem 时两端一并跟随。 */
  W.optimizeSystem = ov => Prompts.get('gen.promptSystem', ov);
  /* 视频提示词改写系统人设(生成步注入点):注册表人设 + 抽卡方法论两条按键整条注入,
   * 与 sbSystem 同形态——正文只从 KB 取,本层不写第二份;键与 skill 索引生成步(gen)登记的同一批。 */
  W.genPromptSystem = ov => W.optimizeSystem(ov) + KB.pick('抽卡公式', '抽卡军规');
  /* 拆镜 user 模板(自 genShotsLLM 下沉;o={count,mode,optimize,adv,feedback},ctx={styleText,projType,directorNote,conceptNote,personaNote,memText,langText,genres,understandingText,eventsText,content(截 12000),subjects,tplVideoText}) */
  W.buildSBUser = function (p, ep, o, ctx) {
    const withForms = sj => sj.name + ((sj.forms || []).length ? `(形态:${sj.forms.map(f => f.name).join('/')})` : '');
    const subs = (ctx.subjects !== undefined ? ctx.subjects : (p.subjects || []));
    const charNames = subs.filter(s => s.kind === 'character').map(withForms).join('、') || '无';
    const sceneNames = subs.filter(s => s.kind === 'scene').map(withForms).join('、') || '无';
    const propNames = subs.filter(s => s.kind === 'prop').map(withForms).join('、') || '无';
    return `将以下剧集剧本拆分为约 ${o.count} 个专业分镜(拆解规则优先,可略超),返回 JSON 数组,每个元素:
{"plot":"剧情内容(一句话)","camera":"运镜(从 ${W.CAMERAS.join('/')} 中选)","view":"视角(${W.VIEWS.join('/')})","angle":"拍摄角度(${W.ANGLES.join('/')})","shotSize":"景别(${W.SIZES.join('/')})","characters":["出场人物名"],"scene":"场景名","props":["道具名"],"narration":"旁白(没有则空字符串)","dialogue":"台词(没有则空字符串)","prompt":"文生视频中文画面提示词","duration":时长秒数,"strategy":"生成策略(ref/frames/fusion)"}
要求:
- 项目风格:${ctx.styleText}${p.globalSetting ? ',全局美学设定:' + p.globalSetting : ''};项目类型:${ctx.projType === 'narration' ? '解说模式(重旁白叙述)' : '剧情模式(重台词表演)'}${ctx.directorNote || ''}${ctx.conceptNote || ''}${ctx.personaNote || ''}
${ctx.langText ? '- 语言要求:' + ctx.langText.slice(1) : ''}
${(ctx.genres || []).length ? '- 题材看点:' + ctx.genres.join('/') : ''}
${ctx.understandingText ? '- 本集导演理解(必须遵循):\n' + ctx.understandingText : ''}
- 分镜模式:${o.mode === 'tweet' ? '推文模式(画面信息密度高、海报感强)' : '创作模式'}
${o.adv ? `- 视觉风格:${o.adv.visual};全片总时长约 ${o.adv.totalSec} 秒;单镜最长 ${o.adv.maxShotSec} 秒;分镜密度:${o.adv.density}` : ''}
- 剧本缺少旁白/台词时请补写,须贴合剧情与人物性格
- strategy 按画面动态选型:静态对白/动作幅度小→ref(分镜图参考);大动作/打斗/需衔接上一镜→frames(首尾帧链);多主体同框且一致性要求高→fusion(多图融合)
- ${W.SPLIT_RULES}
- ${W.PROMPT5}${W.tplVideoNote(ctx.tplVideoText, ctx.styleText)}
- ${o.optimize ? 'prompt 要电影级详尽:构图/光影/氛围/风格限定词' : 'prompt 简洁准确,一句话'}
- characters/scene/props 优先使用已登记主体:人物[${charNames}]、场景[${sceneNames}]、物品[${propNames}];主体带「(形态:…)」时,剧情涉及该特定形态须输出「名-形态」全称(如 安仲凯-少年期)
${ctx.memText ? ctx.memText.trim() + '\n' : ''}${o.feedback ? '★ 上一轮评审意见(必须逐条修订后再输出):\n' + o.feedback + '\n' : ''}
${ctx.eventsText ? '★ 本集事件图谱(剧情骨架,分镜需依序覆盖以下事件,不得遗漏转折点):\n' + ctx.eventsText + '\n' : ''}
剧本:
${ctx.content}`;
  };
  /* 逐字段白名单规整(自 normalizeLLMShot 下沉;ctx={uid,now,directorNote,tplVideoText,phImage(可空:服务端推文模式不留占位图)}) */
  W.normalizeLLMShot = function (raw, i, p, ep, modelName, tweet, ctx) {
    raw = raw || {};
    const s = W.blankShot(i, ep.sbConfig, ctx.uid);
    s.plot = String(raw.plot || '').slice(0, 150) || ('镜头 ' + (i + 1));
    const cam = String(raw.camera || '');
    s.camera = W.CAMERAS.includes(cam) ? cam : (W.CAMERAS.find(c => cam.includes(c.replace('镜头', ''))) || ep.sbConfig.batchCamera);
    s.characters = Array.isArray(raw.characters) ? raw.characters.map(String).slice(0, 3) : [];
    s.scene = String(raw.scene || '');
    s.props = Array.isArray(raw.props) ? raw.props.map(String).slice(0, 2) : [];
    s.narration = String(raw.narration || '');
    s.dialogue = String(raw.dialogue || '');
    s.voice = s.dialogue && s.characters[0] ? '角色音·' + s.characters[0] : ep.sbConfig.narratorVoice;
    // 模型没给 prompt 时的兜底:有文生视频模板按模板成型,无模板回落原骨架
    const fbShot = `${s.camera},${s.plot.slice(0, 40)}`;
    const fbPrompt = W.fillTplVideo(ctx.tplVideoText, Domain.styleOf(p), fbShot) || `${Domain.styleOf(p)}风格,${fbShot}`;
    s.prompt = (String(raw.prompt || '') || fbPrompt + (ctx.directorNote || '')) + Domain.negOf(p);
    s.cameraSpec = {
      view: W.VIEWS.includes(raw.view) ? raw.view : '正面',
      angle: W.ANGLES.includes(raw.angle) ? raw.angle : '平视',
      shotSize: W.SIZES.includes(raw.shotSize) ? raw.shotSize : '中景',
      aperture: 'ƒ/4',
    };
    s.duration = Math.max(2, Math.min(15, +raw.duration || 5));
    // 拆镜策略建议:仅作建议存 strategyHint(不直接覆盖 genStrategy,用户在右栏/批量入口一键采纳)
    s.strategyHint = ['ref', 'frames', 'fusion'].includes(raw.strategy) ? raw.strategy : null;
    s.history = [{ type: '分镜', model: modelName, time: ctx.now() }];
    if (tweet && ctx.phImage) s.image = ctx.phImage(s);
    return s;
  };
  /* 五角色评审(自 llmReview 下沉):brief 构造 + 结果钳制;user 文本经 Prompts.fill('sb.reviewUser')。
   * ctx={personaNote,memText} 分镜板块生效专家方法论与协作记忆,两端经同一装配口传入(空 ctx 逐字节等同三参调用) */
  W.sbReviewBrief = shots => shots.map((s, i) => ({ 镜号: i + 1, 剧情: s.plot, 运镜: s.camera, 景别: (s.cameraSpec && s.cameraSpec.shotSize) || '中景', 出场: s.characters, 旁白: s.narration, 台词: s.dialogue, 提示词: (s.prompt || '').slice(0, 80) }));
  W.sbReviewUser = (shots, styleText, ov, ctx) => W.reviewCtxNote(ctx) + Prompts.fill('sb.reviewUser', { style: styleText, brief: JSON.stringify(W.sbReviewBrief(shots)) }, ov);
  W.sbReviewNormalize = function (out) {
    out = out || {};
    out.score = Math.max(60, Math.min(99, parseInt(out.score, 10) || 75));
    if (!Array.isArray(out.comments) || !out.comments.length) out.comments = [{ role: '审片', text: '整体评估完成' }];
    return out;
  };

  /* ================= 智能审片(自 review.js 下沉) ================= */
  /* 单镜评审提示词(自 buildReviewPrompt 下沉;ctx={kbReviewText,tplReviewText,directorNote,personaNote,memText,styleText,globalSetting};
   * ov=用户提示词覆盖表:提示词首句的人设走注册表键 review.userSystem,其后的三维 JSON 契约仍就地拼) */
  W.buildReviewPrompt = function (p, ep, s, hasImage, ctx, ov) {
    const spec = s.cameraSpec ? Domain.cameraDescribe(s.cameraSpec) + (s.cameraSpec.aperture ? ' · ' + s.cameraSpec.aperture : '') : '未指定';
    const dur = (Domain && Domain.estShotDuration ? Domain.estShotDuration(s) : (s.duration || 5));
    return `${Prompts.get('review.userSystem', ov)}只返回 JSON:
{"score":总分(0-10,一位小数),
"dimensions":{
 "technical":{"score":分数,"comment":"画质质感/纹理还原度/物理结构合理性/穿模 评语","suggestion":"改进建议"},
 "matching":{"score":分数,"comment":"与 Prompt 一致性评语(场景氛围/人物出场时间线/核心动作是否兑现)","suggestion":"建议"},
 "directing":{"score":分数,"comment":"运镜构图电影感/氛围/景别是否符合 Prompt 要求","suggestion":"建议"}},
"issues":[{"timeRange":"${W.shotTimeRange(ep, s)}","type":"问题类型","severity":"严重或轻微","analysis":"分析(格式:第X秒处+具体缺陷描述)","suggestion":"建议(须含可直接加入 Prompt 的英文修正词,如 'Empty background initially')"}]}
评分标准:≥8.5 优秀,7~8.5 良好,<7 需返工。issues 按严重度最多 4 条,无问题返回空数组。severity:严重=穿帮/主体崩坏/凭空出现物体等必须返工的生成缺陷;轻微=质感类可接受瑕疵。
拆解规则检查:若单镜台词超过 40 字未拆镜、单镜同时承载环境交代+人物动作+情绪变化+大量对白(信息过载)、或相邻镜头景别毫无递进变化,必须在 issues 中指出(类型:运镜/景别偏差)并建议按"全景→中景→近景→特写"路径拆镜。
评审口径(专业知识库条目,评分与案例判断以此为准):
${ctx.kbReviewText || ''}
${ctx.memText ? ctx.memText.trim() + '\n' : ''}分镜信息:
- 剧情内容:${s.plot}
- 运镜:${s.camera} · 机位:${spec}
- 出场:人物[${(s.characters || []).join('、') || '无'}] 场景[${s.scene || '无'}] 物品[${(s.props || []).join('、') || '无'}]
- 旁白:${s.narration || '无'} · 台词:${s.dialogue || '无'} · 时长约 ${dur} 秒
- 画面提示词 Prompt:${s.prompt}
- 项目风格:${ctx.styleText}${p.globalSetting ? ' · 全局设定:' + p.globalSetting : ''}${ctx.directorNote || ''}${ctx.personaNote || ''}
${ctx.tplReviewText ? '- 评审模板要求:' + ctx.tplReviewText.replace(/\{shot\}/g, (s.plot || '').slice(0, 30)).replace(/\{style\}/g, p.style) : ''}
${hasImage ? '附图是该分镜当前生成画面,请结合实际画面与 Prompt 的匹配度评审。' : '本次无画面参考,基于分镜脚本与提示词的可执行性评审。'}`;
  };
  /* 报告规整(自 normalizeReport 下沉;ctx={uid,now}) */
  W.normalizeReport = function (raw, p, ep, s, model, mode, ctx) {
    const clamp = v => Math.max(0, Math.min(10, Math.round((+v || 0) * 10) / 10));
    const dim = k => {
      const d = (raw.dimensions && raw.dimensions[k]) || {};
      return { score: clamp(d.score), comment: String(d.comment || '暂无评语'), suggestion: String(d.suggestion || '暂无建议') };
    };
    const issues = (Array.isArray(raw.issues) ? raw.issues : []).slice(0, 4).map(it => ({
      timeRange: String(it.timeRange || W.shotTimeRange(ep, s)),
      type: String(it.type || '其他'),
      severity: it.severity === '严重' ? '严重' : '轻微',
      analysis: String(it.analysis || ''),
      suggestion: String(it.suggestion || ''),
    }));
    return {
      id: ctx.uid('rv'), shotId: s.id, time: ctx.now(), model, mode,
      score: clamp(raw.score),
      dimensions: { technical: dim('technical'), matching: dim('matching'), directing: dim('directing') },
      issues, optimized: false,
    };
  };
  /* 审片报告→修正意见串(自 review.js optimizeShot 下沉):issues 建议优先,否则匹配层建议 */
  W.reviewFixes = r => ((r && r.issues) || []).map(it => it.suggestion).filter(Boolean).join('; ')
    || String((r && r.dimensions && r.dimensions.matching && r.dimensions.matching.suggestion) || '');
  /* 修订循环重抽面 + 逐镜修正意见(审片修订闭环 SK-25 的编排入参,双端单一来源):
   * 镜集一律取 Domain.reviseTargets(达标线/判旧/交集/定稿口径不在本层写第二份),
   * fixes 按 reportId 回取该镜那份报告原文再抽取——报告被挤出最近 5 条时为空串,修订步据此沿用原提示词。
   * nth(第几行同 id)原样带出:回写侧据它按行定位本轮那一行,不在编排层另数一遍序数。
   * 服务端 /api/wf/smart-review 的 lowShots 与 CLI produce 闭环的 shotIds 同读本函数。 */
  W.reviseSubset = function (ep) {
    const shots = (ep && ep.shots) || [];
    return Domain.reviseTargets(ep).map(t => {
      const s = shots[t.order - 1]; // order 就是这一条落到的实位:同 id 多行时 find 会把后几行的意见取成首行那份
      const rep = t.reportId && s ? ((s.reviews || []).find(r => r.id === t.reportId)) : null;
      return { shotId: t.shotId, order: t.order, score: t.score, nth: t.nth, fixes: W.reviewFixes(rep) };
    });
  };
  /* 一键优化重写提示词(自 review.js optimizeShot 下沉,双端单一来源:浏览器审片闭环与 CLI produce 修订重抽共用) */
  W.buildOptimizeUser = (styleText, prompt, fixes) => `根据以下审片意见重写分镜提示词,返回 {"prompt":"重写后的中文提示词","changes":"一句话说明改了什么"}。要求:保持原剧情与风格(${styleText}),逐条落实修正意见。
原提示词:${prompt}
审片意见:${fixes}`;
  /* LLM 优化失败的本地规则回退(同下沉):提取意见中的英文修正词直接追加 */
  W.localOptimizedPrompt = function (prompt, fixes) {
    const enFix = (String(fixes || '').match(/'[^']+'/g) || []).join(', ');
    return (prompt || '') + (enFix ? ',' + enFix.replace(/'/g, '') : ',加强时间轴控制,主体一致,电影感光影');
  };
  /* 整集报告快照哈希(自 reviewSnapshotHashOf 下沉):镜头 ID 集顺序 + 每镜视频版本/地址——
   * 新增/删除/调序/重生成/后处理任一变化 → 整集报告判旧;服务端写 lastReview 与浏览器同函数字面 */
  W.reviewSnapshotHashOf = function (ep) {
    const sig = ((ep && ep.shots) || []).map(s => [s.id, (s.video && s.video.inputHash) || '', (s.video && s.video.url) || ''].join('|')).join('‖');
    let h = 5381;
    for (let i = 0; i < sig.length; i++) h = ((h << 5) + h + sig.charCodeAt(i)) >>> 0;
    return 'r:' + h.toString(36);
  };
  /* 逐镜审片条目合并(双端单一来源:服务端 /api/wf/smart-review 与浏览器 autoSmartReview 同读这一份)。
   * prevPerShot 为空 = 整表跑,直接用本轮这一份;非空 = 子集复审,只替换本轮真审到的那几行,其余沿用上一轮。
   * 对位按镜头行身份(shotId + 全表第几行同 id),不按 shotId 去重:同 id 多行里没进本轮的兄弟行
   * (已定稿/未出片/在飞)与评审失败的行都不在本轮条目里,只按 id 判"被替换了"会把它们上一轮那条一并抹掉。
   * shots 是分镜全表(序数在表行上数,不在本轮那一批上数);已不在表里的 shotId 随行丢弃。
   * reports=[{shot,report}];回执带均分,整集均分按合并后的行算。 */
  W.mergeReviewPerShot = function (prevPerShot, reports, shots) {
    const rows = shots || [];
    const nthOf = new Map();
    const seen = Object.create(null);
    rows.forEach(s => { nthOf.set(s, (seen[s.id] = (seen[s.id] || 0) + 1) - 1); });
    const newPer = reports.map(x => ({ shotId: x.shot.id, order: x.shot.order, score: x.report.score, reportId: x.report.id, videoInputHash: x.report.videoInputHash || '' }));
    let perShot = newPer;
    if (prevPerShot) {
      const newKeys = new Set(reports.map(x => x.shot.id + '#' + nthOf.get(x.shot)));
      const prevSeen = Object.create(null);
      perShot = prevPerShot.filter(x => {
        const nth = (prevSeen[x.shotId] = (prevSeen[x.shotId] || 0) + 1) - 1;
        return !newKeys.has(x.shotId + '#' + nth) && rows.some(s => s.id === x.shotId);
      }).concat(newPer).sort((a, b) => a.order - b.order);
    }
    return { perShot, avg: perShot.length ? Math.round(perShot.reduce((a, x) => a + x.score, 0) / perShot.length * 10) / 10 : 0 };
  };
  /* 共性汇总(自 openEpisodeReview 汇总段下沉);ctx={personaNote,memText} 成片板块生效专家方法论与协作记忆 */
  W.buildSumUser = function (reports, ctx) {
    const brief = reports.map(x => ({ 镜号: x.shot.order + 1, 得分: x.report.score, 问题: x.report.issues.map(i => i.type) }));
    return W.reviewCtxNote(ctx) + `根据以下整集各镜审片结果,汇总整集级共性问题(如主体一致性/色调统一性/时间线连贯性),返回 {"summary":"整集总评(2-3句)","issues":[{"type":"共性问题","detail":"涉及镜号与说明","suggestion":"整集级修复建议"}]},最多 3 条:\n${JSON.stringify(brief)}`;
  };
  W.normalizeSum = out => ({ summary: String((out && out.summary) || ''), issues: (Array.isArray(out && out.issues) ? out.issues : []).slice(0, 3) });
  /* 四维成片评审(自 reviewEpisodeCut 下沉):brief/提示词/规整;本地启发式 fallback 留在浏览器 */
  W.buildCutBrief = (ep, reports) => reports.map(x => ({
    镜号: x.shot.order + 1, 景别: (x.shot.cameraSpec || {}).shotSize || '中景', 运镜: x.shot.camera,
    时长: (Domain && Domain.estShotDuration ? Domain.estShotDuration(x.shot) : (x.shot.duration || 5)), 剧情: (x.shot.plot || '').slice(0, 30), 单镜得分: x.report.score,
    问题: x.report.issues.map(i => i.type),
  }));
  /* ctx={personaNote,memText}:同共性汇总步(成片板块),集级召回口径也同(输入取集标题) */
  W.buildCutUser = (brief, ctx) => W.reviewCtxNote(ctx) + `按四维标准评审以下整集分镜(好例子:上镜抬手下镜手摸到脸=衔接好;吵架给特写=景别对;坏例子:镜头乱抖=不自然;人物瞬间换位置=衔接崩坏;激烈打架十秒不切=节奏错)。返回 JSON:
{"natural":{"score":0-10,"comment":"评语"},"continuity":{"score":...,"comment":...},"framing":{"score":...,"comment":...},"pacing":{"score":...,"comment":...},"overall":"整集剪辑总评(1-2句)"}
分镜清单:
${JSON.stringify(brief)}`;
  W.normalizeCut = function (out) {
    const clamp = v => Math.max(0, Math.min(10, Math.round((+v || 7) * 10) / 10));
    const dim = k => ({ score: clamp(out[k] && out[k].score), comment: String((out[k] || {}).comment || '暂无评语') });
    return { natural: dim('natural'), continuity: dim('continuity'), framing: dim('framing'), pacing: dim('pacing'), overall: String(out.overall || '') };
  };

  /* ================= Agent 单轮对话(/api/wf/agent 服务端管线) =================
   * 服务端拼装对话注入(KB/专家 persona/协作记忆/状态摘要)→ LLM → 解析 run 类 ops;
   * 浏览器面板仍走 agent.js 原路径(数据类 ops/预览确认/冲突闸是浏览器工作台语义),
   * 本组函数供服务端端点与 CLI `agent`/MCP hujing_agent 消费;命令词表经参数注入(cmd-registry 单源)。 */
  /* 人手动作判据(双端唯一一份):注册表条目带 manual 位即「只能由人明确发起」——
   * 助手自动发令的两条路(服务端单轮 agentNormalize 出的 ops、浏览器自修复轮的重试)都读这里,
   * 不各自维护一份命令名单;人手入口(按钮/exec/MCP 同名工具)不经本判据,一律照旧。 */
  W.cmdManual = function (byName, cmd) {
    return !!(((byName || {})[String(cmd || '').trim()]) || {}).manual;
  };
  /* run 类命令协议文本(浏览器 AgentOps.cmdProtocol 委托本函数,数据源各端自取:Commands.list()/CmdRegistry.META) */
  W.agentCmdProtocol = function (metaList) {
    const T = { boolean: 'bool', number: '数字', string: '文本', array: '数组' };
    return (metaList || []).map(c => {
      const args = (c.args || []).filter(a => ['pid', 'epid', 'ui'].indexOf(a.name) < 0); // pid/epid 上下文自动注入,ui 不开放
      const at = args.length
        ? args.map(a => `"${a.name}":${T[a.type] || a.type}${a.required ? '(必填)' : ''}${a.desc ? '—' + a.desc : ''}`).join(' ')
        : '无参数';
      // 人手动作照实标出:模型据此不再把它当可自动发起的一步(真发了也会被 agentNormalize 拦下,此处省一轮空转)
      return `· ${c.name}(${c.label}${c.risk === 'read' ? ',只读' : ''}${c.manual ? ',人手动作:只能由用户自己发起,不要输出为 ops' : ''}): ${at}`;
    }).join('\n');
  };
  /* run 类 op 参数白名单与类型整形(meta=注册表条目):未声明的键丢弃,防模型幻觉参数污染执行/计费 */
  W.sanitizeCmdArgs = function (meta, raw) {
    if (!meta) return {};
    const src = (raw && typeof raw === 'object' && !Array.isArray(raw)) ? raw : {};
    const out = {};
    (meta.args || []).forEach(a => {
      if (['pid', 'epid', 'ui'].indexOf(a.name) >= 0) return; // 上下文注入,不接受模型填写
      let v = src[a.name];
      if (v === undefined || v === null) return;
      if (a.type === 'boolean') v = !!v;
      else if (a.type === 'number') { v = +v; if (!isFinite(v)) return; }
      else if (a.type === 'array') { if (!Array.isArray(v)) return; v = v.map(x => String(x)).slice(0, 50); }
      else v = String(v);
      out[a.name] = v;
    });
    return out;
  };
  /* 状态摘要注入文本(Domain 单源推导):集级列计数/审片/下一步,项目级各集一行(≤8 集)+ 项目级建议 */
  W.agentStateText = function (p, ep, online) {
    const fmtEp = e => {
      const st = Domain.episodeState(p, e, online);
      const c = st.counts;
      const seg = [];
      if (c.total) {
        seg.push(`共${c.total}镜`);
        if (c.done) seg.push(`${c.done}已出片`);
        if (c.generating) seg.push(`${c.generating}生成中`);
        if (c.failed) seg.push(`${c.failed}失败`);
        if (c.noVideo) seg.push(`${c.noVideo}未生成`);
        if (c.unconfirmed) seg.push(`${c.unconfirmed}待确认`);
        if (c.stale) seg.push(`${c.stale}已过期`);
      } else seg.push('未拆镜');
      if (e.lastReview && typeof e.lastReview.avg === 'number') seg.push(`审片均分${e.lastReview.avg}`);
      return seg.join('/') + (st.action && st.action.label ? `;下一步:${st.action.label}` : '');
    };
    if (ep) return `★ 工作台状态(${ep.title || ep.id}):${fmtEp(ep)}`;
    if (!p) return '';
    const rows = (p.episodes || []).slice(0, 8).map(e => `- ${e.title || e.id}:${fmtEp(e)}`);
    const wf = Domain.workflow(p, online);
    return `★ 项目状态(${p.name || p.id},共 ${(p.episodes || []).length} 集):\n${rows.join('\n')}${wf.recommendedAction ? '\n项目级下一步建议:' + wf.recommendedAction.label : ''}`;
  };
  /* 分镜表压缩注入(≤20 镜,超长按整镜截断,不切半截喂模型) */
  W.agentShotsBrief = function (ep) {
    const all = (ep && ep.shots) || [];
    if (!all.length) return '(本集暂无分镜)';
    const shots = all.slice(0, 20).map((s, i) => ({
      镜头: i + 1, 剧情: (s.plot || '').slice(0, 50), 运镜: s.camera || '',
      提示词: (s.prompt || '').slice(0, 60), 台词: (s.dialogue || '').slice(0, 30), 状态: (s.video && s.video.status) || 'none',
    }));
    let json = JSON.stringify(shots);
    if (json.length > 6000) {
      const kept = [];
      for (const s of shots) { if (JSON.stringify(kept.concat(s)).length > 5900) break; kept.push(s); }
      json = JSON.stringify(kept) + `\n…(共 ${all.length} 镜,其余因长度省略)`;
    }
    return json + (all.length > 20 ? `\n(共 ${all.length} 镜,仅列前 20)` : '');
  };
  /* 单轮 system(ctx={kbText,personaNote,memText,styleText,cmdText};ov=用户提示词覆盖表):
   * 人设句取注册表 agent.system,其后的 ops 协议、命令白名单与返回 JSON 约定仍在本层拼装、不随覆盖变动——
   * 那半是解析契约(agentNormalize 按它过滤 run 类 ops),做成可覆盖变量会让用户一改就整轮解析失败。 */
  W.buildAgentSystem = function (ctx, ov) {
    return `${Prompts.get('agent.system', ov)}${ctx.kbText || ''}${ctx.personaNote || ''}${ctx.memText || ''}
用户给自然语言指令或提问:纯咨询/建议类直接专业作答;需要驱动制作流程时额外输出动作类 ops。
返回 JSON {"reply":"中文回复","thinking":"一句话思考摘要","ops":[操作]}。
ops 仅支持统一领域命令:{"op":"run","cmd":"命令名","args":{参数}}(pid/epid 由调用方注入无需填写;执行按各命令规则扣费)。命令白名单与参数面:
${ctx.cmdText || '(无可用命令)'}
纯咨询类 ops 返回 [];不确定是否该执行时不要输出 ops,在 reply 里说明建议与代价。项目风格:${ctx.styleText || ''}。`;
  };
  /* 单轮 user(ctx={stateText,scriptBrief,shotsText,text}) */
  W.buildAgentUser = function (ctx) {
    return `${ctx.stateText ? ctx.stateText + '\n' : ''}${ctx.scriptBrief ? '剧本摘要:' + ctx.scriptBrief + '\n' : ''}${ctx.shotsText ? '当前分镜表:\n' + ctx.shotsText + '\n' : ''}
用户指令:${ctx.text}`;
  };
  /* 单轮结果规整:reply 兜底 + ops 白名单过滤(仅 run 类且 cmd 在注册表词表内,args 经 sanitizeCmdArgs 整形,≤5 条)。
   * 人手动作(manual)不进 ops:本端点出的 ops 是给调用方自动执行的(CLI agent --apply / MCP hujing_agent apply
   * 逐条直跑,中间没有确认闸),而 manual 命令要人自己发起,故在此就拦下,并把被拦的命令名如实回 manual——
   * 调用方据此照实告诉用户「这一步得你自己来」,不静默吞掉;人手入口(exec/按钮/MCP 同名工具)不经本函数。 */
  W.agentNormalize = function (out, byName) {
    out = out || {};
    const manual = [];
    const ops = (Array.isArray(out.ops) ? out.ops : [])
      .filter(o => o && o.op === 'run' && byName[String(o.cmd || '').trim()])
      .slice(0, 5)
      .filter(o => {
        const cmd = String(o.cmd).trim();
        if (!W.cmdManual(byName, cmd)) return true;
        if (manual.indexOf(cmd) < 0) manual.push(cmd);
        return false;
      })
      .map(o => { const cmd = String(o.cmd).trim(); return { op: 'run', cmd, args: W.sanitizeCmdArgs(byName[cmd], o.args) }; });
    return { reply: String(out.reply || '').trim() || '(助手无回复内容)', thinking: String(out.thinking || ''), ops, manual };
  };

  /* ================= LLM 主体提取(自 episode-util.js 下沉) =================
   * 浏览器解析向导(llmExtractSubjects)与 CLI project.extractSubjects 共用提示词与规整,双端逐字节一致 */
  const STOP_WORDS = ['他们', '我们', '你们', '大家', '众人', '有人', '人们', '人们', '这时', '突然', '然后', '于是', '只见', '只听'];
  /* 姓名不可能以这些虚词/代词开头或结尾(过滤"他从井底""生身体里"这类叙述碎片) */
  const BAD_PREFIX = '他她我你它这那在从把被向对跟和与就都也还又再很太真没不好让使令但可是因为所以如果已经正将更最越并而其于之乎者也皆';
  const BAD_SUFFIX = '的了着过吗呢吧啊嘛呀哪哈哦唉嗯';
  /* 名称中不该出现的成分:说话动词(答这个/说一遍/喊大 这类台词碎片即由此产生)与常用叙述短语 */
  const NAME_BAD_VERBS = '说问答喊叫嚷嘲怒吼惊叹询'; // 「道/笑」可能出现在真名(道长/笑笑)中,不在此列
  const NAME_BAD_PHRASES = ['这个', '那个', '什么', '怎么', '为什么', '一遍', '一下', '一点', '一些', '一样', '起来', '出来', '过去', '过来', '回去', '知道', '明白', '东西', '事情', '地方', '时候', '问题', '意思', '声音', '样子', '的话', '没有', '不是', '就是', '还是'];
  /* 名称可信性校验(LLM 与本地启发式结果共用入口) */
  W.isPlausibleName = function (kind, name) {
    name = String(name || '').trim();
    if (name.length < 2 || name.length > (kind === 'character' ? 6 : 8)) return false;
    if (BAD_PREFIX.includes(name[0]) || BAD_SUFFIX.includes(name[name.length - 1])) return false;
    if (kind === 'character' && [...name].some(ch => NAME_BAD_VERBS.includes(ch))) return false;
    if (NAME_BAD_PHRASES.some(w => name.includes(w))) return false;
    if (STOP_WORDS.some(w => name.includes(w))) return false;
    return true;
  };
  /* 提取 user 模板:text 超 15000 字截断;types={character,scene,prop},mode='fine' 提示词/人设详尽;
   * ctx={personaNote,memText} 生效专家方法论与协作记忆(主体板块),两端经同一注入口拼装——
   * personaNote 以「。」起头(与 directorNote 同通道口径),独立成行时去掉句首标点 */
  W.buildExtractUser = function (text, mode, types, ctx) {
    ctx = ctx || {};
    const trunc = text.length > 15000;
    const t = trunc ? text.slice(0, 15000) : text;
    const want = [];
    if (types.character) want.push('characters(人物)');
    if (types.scene) want.push('scenes(场景)');
    if (types.prop) want.push('items(物品)');
    const user = `分析以下短剧剧本,提取其中出现的${want.join('、')}主体,返回 JSON,格式:
{"characters":[{"name":"角色名","aliases":["其他称谓"],"description":"一句话角色设定","prompt":"文生图中文画面提示词","persona":{"五官":"","发型":"","身材":"","服饰":"","性格":"","特技":"","弱点":"","语气":""}}],"scenes":[{"name":"场景名","aliases":["其他称谓"],"description":"一句话描述","prompt":"文生图中文画面提示词"}],"items":[{"name":"物品名","aliases":["其他称谓"],"description":"一句话描述","prompt":"文生图中文画面提示词"}]}
要求:
- 人物的 persona 为八维度人设:外形(五官/发型/身材/服饰)+ 内在(性格/特技/弱点/语气),每维一句话;人物的 prompt 以外形维度为主撰写
- ${mode === 'fine' ? '精细模式:prompt 与 persona 必须详尽,包含外貌/服装/神态/风格限定词' : '普通模式:prompt 简洁,persona 每维简短即可'}
- 只提取剧本中真实出现的主体,不要编造;未要求的类别返回空数组
- 名字必须是真正的名称:人物为真实人名或稳定称谓(如 林晚晴、王管家、大小姐),严禁把台词碎片、动词短语、叙述片段当作名字(如「答这个」「说一遍」「喊大」均为反面例子);场景/物品也须为具体专名,不要泛化词
- 去重合并:同一主体的不同称谓必须合并为一个主体(如 林晚晴/晚晴/大小姐 是同一人时只输出一个),name 用最稳定正式的全称,其余称谓列入 aliases;场景/物品同理
- 每类最多 12 个主体
${ctx.personaNote ? ctx.personaNote.replace(/^。/, '') + '\n' : ''}${ctx.memText ? ctx.memText.trim() + '\n' : ''}剧本${trunc ? '(原文过长,已截取前 15000 字)' : ''}:
${t}`;
    return { user, truncated: trunc };
  };
  /* 主体步系统人设(主体装配口,与 sbSystem/genPromptSystem 同形态;ov=用户提示词覆盖表):
   * 注册表人设 extract.system + 「主体参考」按键整条注入。该条目治的正是提取产出要成为可用参考的形状——
   * 名称唯一稳定(供生成时「将图片N定义为「名字」」)、人物 prompt 按大头照+全身照写而非三视图、
   * 参考人物数有上限;正文只从 KB 取,本层不写第二份,方法论段不随人设覆盖变动。 */
  W.extractSystem = ov => Prompts.get('extract.system', ov) + KB.pick('主体参考');
  /* 提取结果规整:逐字段白名单 + 可信性校验(拦截台词碎片) + 别名合并去重 → {character,scene,prop} */
  W.normalizeExtracted = function (out) {
    out = out || {};
    const norm = (arr, evidence, kind) => (Array.isArray(arr) ? arr : []).slice(0, 12)
      .map(o => o && ({ name: String(o.name || '').trim().slice(0, 12), o }))
      .filter(x => x && x.name && W.isPlausibleName(kind, x.name))
      .map(({ name, o }) => ({
        name,
        evidence,
        prompt: String(o.prompt || '').trim(),
        description: String(o.description || ''),
        persona: kind === 'character' && o.persona && typeof o.persona === 'object' ? o.persona : undefined,
        aliases: Array.isArray(o.aliases) ? o.aliases.map(a => String(a || '').trim().slice(0, 12)).filter(a => a && a !== name).slice(0, 5) : undefined,
      }));
    /* 别名合并:LLM 偶发把同一主体拆成多条(name/aliases 交叉命中即并入先出者,被并者名字转入 aliases) */
    const dedupeAlias = list => {
      const merged = [];
      list.forEach(s => {
        const hit = merged.find(x => x.name === s.name || (x.aliases || []).includes(s.name) || (s.aliases || []).includes(x.name));
        if (!hit) { merged.push(s); return; }
        hit.aliases = [...new Set([...(hit.aliases || []), s.name, ...(s.aliases || [])])].filter(a => a !== hit.name);
        if (!hit.prompt && s.prompt) hit.prompt = s.prompt;
        if (!hit.persona && s.persona) hit.persona = s.persona;
      });
      return merged;
    };
    return {
      character: dedupeAlias(norm(out.characters, 'LLM 语义提取', 'character')),
      scene: dedupeAlias(norm(out.scenes, 'LLM 语义提取', 'scene')),
      prop: dedupeAlias(norm(out.items, 'LLM 语义提取', 'prop')),
    };
  };

  return W;
});
