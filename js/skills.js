/* ============ skills.js 主线 skill 索引注册表(双端 UMD) ============
 * 只做索引不存正文:每条 skill 记录它在主线七步(剧本/主体/分集/分镜/生成/审片/成片)上的位置,
 * 以及对既有单源件的引用键——KB 条目与压缩块(js/knowledge.js)、提示词 key(js/prompts.js)、
 * 领域命令名(js/cmd-registry.js)、专家 id(js/experts-data.js)。方法论与提示词正文永远只有一份,
 * 本文件不复制任何一段。
 * 约束(与 domain.js/wf-core.js/prompts.js 同纪律):模块内不碰 window/Store/document/location/fetch;
 * 环境差异经 ctx 显式注入;引用键的存在性由 Skills.validate(deps) 自检——除 KB 外的注册表在浏览器
 * 加载顺序里晚于本文件,故一律由调用方注入,本模块不做加载期绑定。
 * 加载点成对:index.html 在 knowledge.js 之后、wf-core.js 之前;server.js/cli.js/mcp.js 同处 require。
 */
(function (root, factory) {
  const isNode = typeof module === 'object' && module.exports;
  const S = factory(isNode ? require('./knowledge.js') : root.KB);
  if (isNode) module.exports = S; else root.Skills = S;
})(typeof self !== 'undefined' ? self : globalThis, function (KB) {
  'use strict';

  /* 主线七步:key 与 Domain.workflow 主线步骤键同词表(审片尚未进 workflow 步骤集合,wfStep=false) */
  const STAGES = [
    { key: 'script', name: '剧本', wfStep: true },
    { key: 'subjects', name: '主体', wfStep: true },
    { key: 'eps', name: '分集', wfStep: true },
    { key: 'shots', name: '分镜', wfStep: true },
    { key: 'gen', name: '生成', wfStep: true },
    { key: 'review', name: '审片', wfStep: false },
    { key: 'film', name: '成片', wfStep: true },
  ];
  const KINDS = ['inject', 'check', 'orchestrate'];

  /* 校验型扩展点:id → (obj, ctx) => {pass, level:'info'|'warn'|'fail', hits:[]};纯本地、零 LLM、零计费。
   * 未注册的校验项不得被 skill 引用(validate 会报),因此本表为空时不存在 check 型 skill。 */
  const CHECKS = {};

  /* 第一批条目:覆盖 KB 全部 17 条方法论与 6 条注册表提示词,gaps 标注该步已知的贯通缺口编号。
   * note 标"注入点一致"的条目,其 kb 顺序与现有硬编码注入点相同,便于后续改为经索引取块时逐字节对齐。 */
  const REG = [
    /* ---- 剧本 ---- */
    {
      id: 'script.core', name: '短剧编剧八律', stage: 'script', kind: 'inject',
      kb: ['WR_CORE'], experts: ['ex_planner'], gaps: ['G-04'],
    },
    {
      id: 'script.structure', name: '全剧结构与阶段划分', stage: 'script', kind: 'inject',
      kb: ['WR_STRUCTURE'], experts: ['ex_structure'], gaps: ['G-04'],
    },
    {
      id: 'script.hooks', name: '开篇钩子与付费卡点', stage: 'script', kind: 'inject',
      kb: ['WR_HOOKS', 'WR_PAYOFF'], experts: ['ex_hook'], gaps: ['G-04', 'G-13'],
    },
    {
      id: 'script.turns', name: '反转与打脸爽点', stage: 'script', kind: 'inject',
      kb: ['WR_REVERSALS', 'WR_FACESLAP'], experts: ['ex_pleasure'], gaps: ['G-04'],
    },
    {
      id: 'script.dialogue', name: '对白铁律与人物体系', stage: 'script', kind: 'inject',
      kb: ['WR_DIALOGUE', 'WR_CHARACTER'], experts: ['ex_dialogue'], gaps: ['G-13'],
    },
    {
      id: 'script.diagnose', name: '剧本病灶诊断', stage: 'script', kind: 'inject',
      kb: ['WR_PITFALLS'], experts: ['ex_structure', 'ex_planner'], gaps: ['G-04'],
    },
    /* ---- 主体 ---- */
    {
      id: 'subjects.refs', name: '主体参考图纪律', stage: 'subjects', kind: 'inject',
      kb: ['GC_REFS'], gaps: ['G-04'],
    },
    /* ---- 分集 ---- */
    {
      id: 'eps.beats', name: '五段式节拍拆解', stage: 'eps', kind: 'inject',
      kb: ['WR_STRUCTURE', 'WR_FACESLAP'], experts: ['ex_structure', 'ex_hook'], gaps: ['G-04', 'G-13'],
      note: 'kb 顺序与节拍板拆解注入点一致',
    },
    /* ---- 分镜 ---- */
    {
      id: 'shots.grammar', name: '镜头语法(景别/运镜/轴线)', stage: 'shots', kind: 'inject',
      kb: ['DR_SHOT', 'DR_AXIS'], prompts: ['sb.system', 'sb.reviewUser', 'sb.reviewSystem'],
      cmds: ['episode.generateStoryboard'], experts: ['ex_dp'], gaps: ['G-01', 'G-07'],
      note: 'kb 顺序与 WfCore.sbSystem 注入点一致',
    },
    {
      id: 'shots.mise', name: '场面调度与视点', stage: 'shots', kind: 'inject',
      kb: ['DR_MISE'], prompts: ['und.system'], cmds: ['episode.understanding'],
      experts: ['ex_dp'], gaps: ['G-01'],
    },
    /* ---- 生成 ---- */
    {
      id: 'gen.prompt', name: '抽卡提示词工程', stage: 'gen', kind: 'inject',
      kb: ['GC_FORMULA', 'GC_RULES', 'GC_MULTI'],
      cmds: ['episode.generateVideos', 'shot.generateVideo'], gaps: ['G-06'],
    },
    /* ---- 审片 ---- */
    {
      id: 'review.criteria', name: '审片评分口径', stage: 'review', kind: 'inject',
      kbBlocks: ['reviewBlock'], prompts: ['review.system', 'review.finalSystem'],
      cmds: ['episode.smartReview'], experts: ['ex_editor'], gaps: ['G-03', 'G-10'],
      note: '与逐镜评审/成片评审注入点同一块',
    },
    {
      id: 'review.revise', name: '审片修订闭环', stage: 'review', kind: 'orchestrate',
      gaps: ['G-03', 'G-12'],
      steps: [
        { cmd: 'episode.smartReview', args: { quiet: true }, note: '整集逐镜评审:低分镜与共性问题落 lastReview' },
        { cmd: 'episode.generateVideos', args: {}, note: '按审片问题修订提示词后只重跑低分镜(shotIds 传低分镜子集)' },
        { cmd: 'episode.smartReview', args: {}, note: '复审:仍有待人工镜则回 needs_human' },
        { cmd: 'episode.compose', args: {}, note: '达标后合成成片' },
      ],
    },
    /* ---- 成片 ---- */
    {
      id: 'film.rhythm', name: '剪辑节奏与转场', stage: 'film', kind: 'inject',
      kb: ['DR_RHYTHM'], cmds: ['episode.compose', 'episode.produce'],
      experts: ['ex_editor'], gaps: ['G-13'],
    },
    {
      id: 'film.distribution', name: '发行文案钩子与卡点', stage: 'film', kind: 'inject',
      kb: ['WR_HOOKS', 'WR_PAYOFF'], gaps: ['G-13'],
      note: 'kb 顺序与发行文案包注入点一致',
    },
  ];

  const ARR = ['kb', 'kbBlocks', 'prompts', 'cmds', 'experts', 'checks', 'gaps'];
  REG.forEach(s => {
    s.steps = s.steps || [];
    ARR.forEach(k => { s[k] = s[k] || []; });
    /* 编排型的命令面由 steps 推出,不在条目里手写第二份 */
    if (!s.cmds.length) s.cmds = s.steps.map(x => x.cmd).filter((v, i, a) => a.indexOf(v) === i);
  });

  const copy = s => Object.assign({}, s, ARR.reduce((o, k) => { o[k] = s[k].slice(); return o; }, {}),
    { steps: s.steps.map(x => Object.assign({}, x, { args: Object.assign({}, x.args) })) });

  return {
    STAGES, KINDS, CHECKS, REG,
    stages: () => STAGES.map(x => x.key),
    stageOf: key => STAGES.find(x => x.key === key) || null,
    list(stage) { return REG.filter(s => !stage || s.stage === stage).map(copy); },
    byId(id) { const s = REG.find(x => x.id === id); return s ? copy(s) : null; },

    /* 注入型:按 stage 拼方法论块,文本一律现取 KB(索引层不缓存、不复述)。
     * ctx:{ids:[skillId] 只取指定条目(既有注入点逐字节对齐用), sep 连接符(默认空串,与既有注入点一致)} */
    block(stage, ctx) {
      const c = ctx || {};
      const parts = [];
      REG.forEach(s => {
        if (s.stage !== stage || s.kind !== 'inject') return;
        if (c.ids && c.ids.indexOf(s.id) < 0) return;
        s.kb.forEach(k => { if (typeof KB[k] === 'string') parts.push(KB[k]); });
        s.kbBlocks.forEach(b => { if (typeof KB[b] === 'function') parts.push(KB[b]()); });
      });
      return parts.join(c.sep === undefined ? '' : c.sep);
    },

    /* 校验型:跑该步已注册的校验项(纯本地、零 LLM、零计费);无校验项即空数组 */
    check(stage, obj, ctx) {
      const out = [];
      REG.forEach(s => {
        if (s.stage !== stage || s.kind !== 'check') return;
        s.checks.forEach(id => {
          const fn = CHECKS[id];
          if (typeof fn !== 'function') return;
          const r = fn(obj, ctx || {}) || {};
          out.push({ id, skill: s.id, pass: r.pass !== false, level: r.level || 'warn', hits: r.hits || [] });
        });
      });
      return out;
    },

    /* 编排型:步骤只引用已注册领域命令名,不内联新命令语义 */
    playbook(id) {
      const s = REG.find(x => x.id === id && x.kind === 'orchestrate');
      if (!s) return null;
      return { id: s.id, title: s.title || s.name, steps: copy(s).steps };
    },

    /* 引用键自检:deps={KB?,Prompts?,CmdRegistry?,ExpertsData?,wfStepKeys?},缺的注册表跳过对应检查。
     * 返回问题清单(空数组=全通过),供契约测试与启动期自检使用。 */
    validate(deps) {
      const d = deps || {};
      const kb = d.KB || KB;
      const promptKeys = d.Prompts ? d.Prompts.list().map(x => x.key) : null;
      const cmdNames = d.CmdRegistry ? d.CmdRegistry.names() : null;
      const expertIds = d.ExpertsData ? (d.ExpertsData.EXPERTS || []).map(e => e.id) : null;
      const stageKeys = STAGES.map(x => x.key);
      const bad = [];
      const seen = {};
      const push = (who, msg) => bad.push(who + ': ' + msg);
      REG.forEach(s => {
        if (seen[s.id]) push(s.id, 'id 重复');
        seen[s.id] = 1;
        if (stageKeys.indexOf(s.stage) < 0) push(s.id, 'stage 不在主线七步:' + s.stage);
        if (KINDS.indexOf(s.kind) < 0) push(s.id, 'kind 非法:' + s.kind);
        s.kb.forEach(k => { if (typeof kb[k] !== 'string') push(s.id, 'KB 条目不存在:' + k); });
        s.kbBlocks.forEach(b => { if (typeof kb[b] !== 'function') push(s.id, 'KB 压缩块不存在:' + b); });
        s.checks.forEach(c => { if (typeof CHECKS[c] !== 'function') push(s.id, '校验项未注册:' + c); });
        if (promptKeys) s.prompts.forEach(k => { if (promptKeys.indexOf(k) < 0) push(s.id, '提示词 key 不存在:' + k); });
        if (expertIds) s.experts.forEach(e => { if (expertIds.indexOf(e) < 0) push(s.id, '专家 id 不存在:' + e); });
        if (cmdNames) s.cmds.forEach(n => { if (cmdNames.indexOf(n) < 0) push(s.id, '命令名不存在:' + n); });
        s.steps.forEach((st, i) => {
          if (cmdNames && cmdNames.indexOf(st.cmd) < 0) push(s.id, '步骤 ' + (i + 1) + ' 命令名不存在:' + st.cmd);
          const meta = d.CmdRegistry && d.CmdRegistry.byName[st.cmd];
          if (!meta) return;
          const argNames = (meta.args || []).map(a => a.name);
          Object.keys(st.args || {}).forEach(k => { if (argNames.indexOf(k) < 0) push(s.id, '步骤 ' + (i + 1) + ' 参数不在命令 args:' + k); });
        });
        if (s.kind === 'inject' && !s.kb.length && !s.kbBlocks.length) push(s.id, '注入型须引用 KB 条目或压缩块');
        if (s.kind === 'check' && !s.checks.length) push(s.id, '校验型须引用已注册校验项');
        if (s.kind === 'orchestrate' && !s.steps.length) push(s.id, '编排型须有 steps');
      });
      if (d.wfStepKeys) {
        STAGES.forEach(st => {
          if (st.wfStep && d.wfStepKeys.indexOf(st.key) < 0) push('STAGES', 'stage 声明为工作流步骤但不在 Domain.workflow:' + st.key);
        });
      }
      return bad;
    },
  };
});
