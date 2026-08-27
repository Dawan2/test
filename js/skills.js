/* ============ skills.js 主线 skill 索引注册表(双端 UMD) ============
 * 只做索引不存正文:每条 skill 记录它在主线七步(剧本/主体/分集/分镜/生成/审片/成片)上的位置,
 * 以及对既有单源件的引用键——KB 条目(键取 `KB.SECTIONS` 取用面,与其余注入点同一套键)与压缩块
 * (js/knowledge.js)、提示词 key(js/prompts.js)、
 * 提示词模板三件套键(偏好设置)、领域命令名(js/cmd-registry.js)、专家 id(js/experts-data.js)。
 * 方法论与提示词正文永远只有一份,本文件不复制任何一段。
 * 条目 = 一条内部能力(SK-01…SK-30 短名单):`kinds` 记它由哪几种机制面构成(注入/校验/编排/基础设施),
 * `pending` 如实记其中哪几面在主线上**还没有出口**(必须同时用 `gaps` 写明缺口编号)——
 * 未实现的面一律不挂假出口:pending 含 check 的条目 checks 必须为空,pending 含 orchestrate 的 steps 必须为空,
 * pending 含 inject 的条目不进 block() 拼块。
 * 约束(与 domain.js/wf-core.js/prompts.js 同纪律):模块内不碰浏览器环境句柄与前端状态桶;
 * 环境差异经 ctx 显式注入;引用键的存在性由 Skills.validate(deps) 自检——除 KB 与 Domain 外的注册表
 * 在浏览器加载顺序里晚于本文件,故一律由调用方注入,本模块不做加载期绑定。
 * 加载期依赖两件双端纯模块:KB(条目正文)与 Domain(校验型条目的领域判定,如主体按名查找),
 * 判定口径一律现取 Domain,本层不写第二份。
 * 加载点成对:index.html 在 domain.js/knowledge.js 之后、wf-core.js 之前;server.js/cli.js/mcp.js 同处 require。
 */
(function (root, factory) {
  const isNode = typeof module === 'object' && module.exports;
  const S = factory(isNode ? require('./knowledge.js') : root.KB, isNode ? require('./domain.js') : root.Domain);
  if (isNode) module.exports = S; else root.Skills = S;
})(typeof self !== 'undefined' ? self : globalThis, function (KB, Domain) {
  'use strict';

  /* 主线七步:key 与 Domain.workflow 主线步骤键同词表(审片经 G-03 升为一等步骤后七步全为 wfStep) */
  const STAGES = [
    { key: 'script', name: '剧本', wfStep: true },
    { key: 'subjects', name: '主体', wfStep: true },
    { key: 'eps', name: '分集', wfStep: true },
    { key: 'shots', name: '分镜', wfStep: true },
    { key: 'gen', name: '生成', wfStep: true },
    { key: 'review', name: '审片', wfStep: true },
    { key: 'film', name: '成片', wfStep: true },
  ];
  const CROSS = '*'; // 贯通层:作用在七步之上的索引/基础设施条目
  const KINDS = ['inject', 'check', 'orchestrate', 'infra'];
  const WAVES = ['W2', 'W3', 'W4']; // 落地波次:W2 单源打底 / W3 双端贯通 / W4 校验闸门

  /* 校验型扩展点:id → (obj, ctx) => {pass, level:'info'|'warn'|'fail', hits:[]};纯本地、零 LLM、零计费。
   * obj 是领域对象包 {p, ep, s}(镜级校验项收 s,集级收 ep),ctx 收调用侧差异(如 online);
   * hits 逐条记命中位置与原因码,供调用方如实展示,不在本层拼文案。
   * 结论只报不拦:任何校验项都不改既有阻塞项(Domain.episodeState.blockers)、发布门口径与计费动作。
   * 未注册的校验项不得被 skill 引用(validate 会报),尚无实现的校验面一律留在条目 pending 里。 */
  const CHECKS = {};

  /* SK-12 分镜引用主体完备性(S-03 的完备性半):逐镜看 characters/scene/props 的引用名能否落到主体库,
   * 落到的主体(含形态)有没有可喂模型的真实参考图。主体按名查找与取图优先级一律走 Domain
   * (findSubject 含多形态全称与曾用名兜底;subjectRefImage 与真实生成请求同一取图口径),本层不写第二份。
   *   unknown-subject 引用名在主体库解析不到 → fail(该名字无参考可注,必是错字、漏提取或改名未回填)
   *   no-ref-image    解析到主体但无真实参考图 → warn(生成时该主体不进参考图组)
   *   no-subject-ref  该镜一个主体都不引用 → warn(无主体锁定,易换脸)
   * 同一名字在多镜命中即多条 hit(按镜计位),调用方自行聚合展示。 */
  CHECKS['subjects.shotRefIntegrity'] = function (obj) {
    const o = obj || {};
    const p = o.p;
    const shots = o.s ? [o.s] : ((o.ep && o.ep.shots) || []);
    if (!p || !shots.length) return { pass: true, level: 'info', hits: [] };
    const hits = [];
    shots.forEach(s => {
      const order = (+s.order || 0) + 1;
      const names = [].concat(s.characters || [], s.scene ? [s.scene] : [], s.props || [])
        .map(n => String(n === null || n === undefined ? '' : n).trim()).filter(Boolean);
      if (!names.length) { hits.push({ code: 'no-subject-ref', shotId: s.id, order, name: '' }); return; }
      names.forEach(name => {
        const r = Domain.findSubject(p, name);
        if (!r) { hits.push({ code: 'unknown-subject', shotId: s.id, order, name }); return; }
        if (!Domain.subjectRefImage(r)) hits.push({ code: 'no-ref-image', shotId: s.id, order, name: Domain.subjectFullName(r) });
      });
    });
    const level = hits.some(h => h.code === 'unknown-subject') ? 'fail' : hits.length ? 'warn' : 'info';
    return { pass: !hits.length, level, hits };
  };

  /* SK-13 跨镜头主体一致性(S-03 的一致性半):同一主体被多镜引用时,看它在镜间「锁」得一不一致——
   * 每镜实际喂进生成请求的参考图现取 Domain.shotRefImages(与真实生成同一份构造,含 5 张上限),
   * 引用名与全称现取 Domain.findSubject/subjectFullName,本层不写第二份取图与解析。
   * 单镜的绝对缺陷(名字解析不到、主体全程无图)归 SK-12,本项只报跨镜差异:
   *   ref-image-drift 该镜喂到的参考图与基准镜不是同一张(权威图与形态图混用、形态间切换)→ warn
   *   ref-lock-gap    别的镜锁得住这镜锁不住:该形态取不到真实图(no-image)或被参考图组上限挤出(over-cap)→ warn
   *   alias-drift     同一主体同一形态跨镜被不同名字引用(改名后旧名残留、别名混用)→ warn
   * 基准 = 该主体跨镜出现最多的那张图/那个名字(并列取先出现者);形态不同属有意换装,不按名字漂移判。
   * 一致性风险一律 warn,fail 留给"必然拿不到参考"的完备性面(SK-12)。 */
  CHECKS['subjects.crossShotConsistency'] = function (obj) {
    const o = obj || {};
    const p = o.p;
    const shots = (o.ep && o.ep.shots) || [];
    if (!p || shots.length < 2) return { pass: true, level: 'info', hits: [] }; // 单镜无跨镜可比,不冒充通过判定
    const per = new Map(); // 主体 id → 逐镜引用记录(按镜序)
    shots.forEach(s => {
      const order = (+s.order || 0) + 1;
      const fed = {}; // 本镜真实进了参考图组的全称 → 图 url
      Domain.shotRefImages(p, s).refImages.forEach(x => { fed[x.name] = x.url; });
      const seen = {};
      [].concat(s.characters || [], s.scene ? [s.scene] : [], s.props || [])
        .map(n => String(n === null || n === undefined ? '' : n).trim()).filter(Boolean)
        .forEach(name => {
          if (seen[name]) return; // 同镜同名重复引用只计一次
          seen[name] = 1;
          const r = Domain.findSubject(p, name);
          if (!r) return; // 解析不到的引用是 SK-12 的完备性面,本项不重复报
          const full = Domain.subjectFullName(r);
          const rec = { shotId: s.id, order, name, full, image: Domain.subjectRefImage(r), fed: fed[full] || '' };
          if (!per.has(r.s.id)) per.set(r.s.id, []);
          per.get(r.s.id).push(rec);
        });
    });
    /* 众数(并列取先出现者):跨镜比对的基准 */
    const modeOf = (recs, pick) => {
      const cnt = {};
      let best = '', bestN = 0;
      recs.forEach(x => {
        const v = pick(x);
        if (!v) return;
        const n = (cnt[v] = (cnt[v] || 0) + 1);
        if (n > bestN) { bestN = n; best = v; }
      });
      return best;
    };
    const hits = [];
    per.forEach(recs => {
      const shotIds = {};
      recs.forEach(x => { shotIds[x.shotId] = 1; });
      if (Object.keys(shotIds).length < 2) return; // 只在一镜出场的主体无一致性可言
      const baseImg = modeOf(recs, x => x.fed);
      if (baseImg) recs.forEach(x => {
        if (!x.fed) hits.push({ code: 'ref-lock-gap', shotId: x.shotId, order: x.order, name: x.full, reason: x.image ? 'over-cap' : 'no-image' });
        else if (x.fed !== baseImg) hits.push({ code: 'ref-image-drift', shotId: x.shotId, order: x.order, name: x.full });
      });
      const byFull = new Map(); // 同一形态内部才比引用名:形态不同是换装,不是别名混用
      recs.forEach(x => { if (!byFull.has(x.full)) byFull.set(x.full, []); byFull.get(x.full).push(x); });
      byFull.forEach(g => {
        const baseName = modeOf(g, x => x.name);
        g.forEach(x => { if (x.name !== baseName) hits.push({ code: 'alias-drift', shotId: x.shotId, order: x.order, name: x.name, base: baseName }); });
      });
    });
    return { pass: !hits.length, level: hits.length ? 'warn' : 'info', hits };
  };

  /* 短名单 30 条内部能力(SK-01…SK-30):id 取 `stage.name` 形态,与 SK 编号一一对应。
   * covers 写该能力实际作用到的主线步骤(缺省=stage 本身);gaps 记该条已知贯通缺口编号(G-xx 图谱既有,S-xx 本轮新登记)。 */
  const REG = [
    /* ---- 贯通层 ---- */
    {
      id: 'core.stageIndex', sk: 'SK-01', name: '主线步骤方法论索引', stage: CROSS, wave: 'W2', kinds: ['infra'],
      kb: ['编剧八律', '六阶段结构', '钩子六型', '反转五式', '打脸四步', '付费卡点', '对话铁律',
        '人物体系', '剧本诊断', '场面调度', '景别运镜', '轴线匹配', '剪辑节奏', '抽卡公式', '抽卡军规',
        '多镜头写法', '主体参考'],
      kbBlocks: ['block', 'reviewBlock'], gaps: ['G-08', 'G-15'],
      note: '索引宿主本身:KB 全条目在此登记一次,各步条目只引用自己那几条;本条不进 block() 拼块',
    },
    {
      id: 'core.expertSkillRef', sk: 'SK-02', name: '专家条目挂能力引用', stage: CROSS, wave: 'W2', kinds: ['infra'],
      experts: ['ex_suspense', 'ex_sweet', 'ex_hotblood', 'ex_healing', 'ex_cinema', 'ex_narration', 'ex_revenge',
        'ex_power', 'ex_planner', 'ex_localize', 'ex_hook', 'ex_pleasure', 'ex_dialogue', 'ex_structure', 'ex_dp',
        'ex_editor'],
      gaps: ['G-09'],
      note: '专家→能力反查出口 Skills.forExpert(id);专家条目侧的 skills[] 正向字段待 G-09',
    },
    {
      id: 'core.personaCtx', sk: 'SK-03', name: '生效人设经 ctx 过服务端', stage: CROSS, wave: 'W3',
      kinds: ['infra'], pending: ['infra'],
      prompts: ['sb.system', 'sb.reviewSystem', 'und.system', 'review.system', 'review.finalSystem'],
      cmds: ['episode.understanding', 'episode.generateStoryboard', 'episode.smartReview'], gaps: ['G-01'],
    },
    {
      id: 'core.memoryDual', sk: 'SK-04', name: '长期记忆双端与召回纯函数', stage: CROSS, wave: 'W3',
      kinds: ['infra'], pending: ['infra'], gaps: ['G-02'],
      note: '召回策略(同板块最近若干 + 全局最近若干)抽为纯函数后双端同用;记忆种子不在 KB 条目面',
    },
    {
      id: 'core.playbookProjection', sk: 'SK-05', name: 'playbook 由注册表投影', stage: CROSS, wave: 'W4',
      kinds: ['orchestrate'], pending: ['orchestrate'],
      cmds: ['episode.preflight', 'episode.generateStoryboard', 'episode.generateVideos', 'shot.generateVideo',
        'episode.smartReview', 'episode.compose', 'episode.produce', 'episode.understanding',
        'subject.generateImage', 'project.extractSubjects', 'project.splitEpisodes'],
      gaps: ['G-12'],
      note: '本条登记命令全面;编排型条目的步骤投影出口 Skills.playbooks(),计划步骤改由投影生成待 G-12',
    },
    /* ---- 剧本 ---- */
    {
      id: 'script.hookType', sk: 'SK-06', name: '开篇钩子选型注入', stage: 'script', wave: 'W2', kinds: ['inject'],
      kb: ['钩子六型', '编剧八律'], experts: ['ex_hook'], gaps: ['G-13', 'G-04'],
    },
    {
      id: 'script.hookStrength', sk: 'SK-07', name: '开篇钩子强度校验', stage: 'script', wave: 'W4',
      kinds: ['check'], pending: ['check'], kb: ['钩子六型'], experts: ['ex_hook'], gaps: ['G-10', 'G-04', 'S-01'],
    },
    {
      id: 'script.faceslapFour', sk: 'SK-08', name: '打脸四步完备性校验', stage: 'script', wave: 'W4',
      kinds: ['check'], pending: ['check'], kb: ['打脸四步', '反转五式'], experts: ['ex_pleasure'],
      gaps: ['G-10', 'G-04', 'S-01'],
    },
    {
      id: 'script.dialogueRule', sk: 'SK-09', name: '对白铁律注入与单句长度校验', stage: 'script',
      covers: ['script', 'shots'], wave: 'W2', kinds: ['inject', 'check'], pending: ['check'],
      kb: ['对话铁律', '人物体系'], prompts: ['sb.system'], cmds: ['episode.generateStoryboard'],
      experts: ['ex_dialogue'], gaps: ['G-15', 'G-10', 'S-01'],
      note: '注入面 W2 落地(条目现为零消费);单句长度校验面待 S-01 校验宿主',
    },
    {
      id: 'script.aiToneBan', sk: 'SK-10', name: '文案 AI 味硬禁与痕迹检出', stage: 'script',
      covers: ['script', 'shots'], wave: 'W4', kinds: ['inject', 'check'], pending: ['inject', 'check'],
      experts: ['ex_dialogue'], gaps: ['S-02', 'G-13', 'G-10'],
      note: '条目正文自撰后进 KB 单源(S-02),本条现无可引用条目键;校验面只做本地词法命中,零 LLM',
    },
    /* ---- 主体 ---- */
    {
      id: 'subjects.refDiscipline', sk: 'SK-11', name: '主体参考纪律注入与生成前置校验', stage: 'subjects',
      covers: ['subjects', 'gen'], wave: 'W4', kinds: ['inject', 'check'], pending: ['check'],
      kb: ['主体参考'], settings: ['tplImage'],
      cmds: ['episode.preflight', 'shot.generateVideo', 'subject.generateImage'],
      gaps: ['G-06', 'G-13'],
    },
    {
      id: 'subjects.refIntegrity', sk: 'SK-12', name: '分镜引用主体完备性校验', stage: 'subjects',
      covers: ['subjects', 'shots'], wave: 'W4', kinds: ['check'],
      kb: ['主体参考'], checks: ['subjects.shotRefIntegrity'], cmds: ['episode.preflight'], gaps: ['S-03'],
      note: '主体按名查找(含多形态全称)与取图口径复用 Domain,不在本层再写一份;'
        + '校验项经就绪检查(episode.preflight)双端消费,结论只报不拦;S-03 的一致性半由 SK-13 承接',
    },
    {
      id: 'subjects.crossShot', sk: 'SK-13', name: '跨镜头主体一致性校验', stage: 'subjects',
      covers: ['subjects', 'gen'], wave: 'W4', kinds: ['check'],
      kb: ['多镜头写法', '主体参考'], checks: ['subjects.crossShotConsistency'],
      cmds: ['episode.preflight'], gaps: ['G-06', 'S-03'],
      note: '与 SK-12 成对闭合 S-03:完备性看单镜引用能否落到主体,一致性看同一主体跨镜锁得一不一致;'
        + '每镜实际参考图现取 Domain.shotRefImages(与真实生成请求同一份构造,含参考图组上限);'
        + '经就绪检查与问题中心消费,结论只报不拦;生成前置消费点待 G-06',
    },
    /* ---- 分集 ---- */
    {
      id: 'eps.structureStage', sk: 'SK-14', name: '六阶段结构注入与分集覆盖校验', stage: 'eps', wave: 'W2',
      kinds: ['inject', 'check'], pending: ['check'], kb: ['六阶段结构'], experts: ['ex_structure'],
      gaps: ['G-13', 'G-04', 'S-01'],
      note: 'kb 顺序与节拍板拆解注入点一致;拆集补服务端属 W3,覆盖校验属 W4',
    },
    {
      id: 'eps.payoffPoint', sk: 'SK-15', name: '付费卡点位置校验', stage: 'eps', wave: 'W4',
      kinds: ['check'], pending: ['check'], kb: ['付费卡点'], experts: ['ex_pleasure'], gaps: ['G-10', 'G-04', 'S-01'],
    },
    {
      id: 'eps.frontPipeline', sk: 'SK-16', name: '主线前段编排', stage: 'eps',
      covers: ['script', 'subjects', 'eps', 'shots'], wave: 'W3', kinds: ['orchestrate'], gaps: ['G-04'],
      cmds: ['project.splitEpisodes', 'project.extractSubjects'],
      steps: [
        { cmd: 'episode.understanding', args: {}, note: '本集理解:先出人物/情绪/场景口径' },
        { cmd: 'episode.generateStoryboard', args: {}, note: '智能分镜:按理解口径拆镜' },
      ],
      note: '拆集与主体提取的领域命令已就位(cmds 登记,G-04);两步前置进 steps 会改本编排产出,单列一轮处置',
    },
    /* ---- 分镜 ---- */
    {
      id: 'shots.shotLanguage', sk: 'SK-17', name: '镜头语言词表归一与注入', stage: 'shots', wave: 'W2',
      kinds: ['inject'], kb: ['景别运镜', '轴线匹配'], prompts: ['sb.system'],
      cmds: ['episode.generateStoryboard'], experts: ['ex_dp'], gaps: ['G-07', 'G-14'],
      note: 'kb 顺序与 WfCore.sbSystem 注入点一致;词表以 WfCore 的景别/运镜/视点/角度四表为准',
    },
    {
      id: 'shots.sizeProgression', sk: 'SK-18', name: '景别递进与轴线校验', stage: 'shots',
      covers: ['shots', 'review'], wave: 'W4', kinds: ['check'], pending: ['check'],
      kb: ['景别运镜', '轴线匹配'], prompts: ['sb.reviewUser', 'review.system'], cmds: ['episode.smartReview'],
      experts: ['ex_dp'], gaps: ['G-10'],
      note: '景别衔接口诀现以文本形态落在 sb.reviewUser 评审指令里,校验面落地后判据仍以 KB 条目为准',
    },
    {
      id: 'shots.promptEightDim', sk: 'SK-19', name: '抽卡八维公式与军规注入', stage: 'shots',
      covers: ['shots', 'gen'], wave: 'W2', kinds: ['inject', 'check'], pending: ['check'],
      kb: ['抽卡公式', '抽卡军规', '多镜头写法'], prompts: ['sb.system'], settings: ['tplVideo'],
      cmds: ['episode.generateStoryboard'], gaps: ['G-15', 'G-06', 'G-05', 'G-10'],
      note: '索引面 W2 落地;生成前 warn 的校验面属 W4',
    },
    {
      id: 'shots.motionGate', sk: 'SK-20', name: '镜头动态感准入校验', stage: 'shots', wave: 'W4',
      kinds: ['check'], pending: ['check'], kb: ['剪辑节奏', '抽卡军规'], cmds: ['episode.generateStoryboard'],
      gaps: ['S-04'],
      note: '节拍板五段式产出是判定输入,现无对应领域命令(S-04)',
    },
    /* ---- 生成 ---- */
    {
      id: 'gen.videoTpl', sk: 'SK-21', name: '视频提示词模板落位', stage: 'gen', wave: 'W2',
      kinds: ['inject'], pending: ['inject'], kb: ['抽卡公式'], settings: ['tplVideo'],
      cmds: ['shot.generateVideo', 'episode.generateVideos'],
      experts: ['ex_suspense', 'ex_sweet', 'ex_hotblood', 'ex_healing', 'ex_cinema', 'ex_narration', 'ex_revenge', 'ex_power'],
      gaps: ['G-05', 'G-13'],
      note: '模板三件套的 tplVideo 面现为零消费,接进生成请求构造前本条不出注入块(G-05 二选一定性后落地)',
    },
    {
      id: 'gen.renderCredential', sk: 'SK-22', name: '生成凭据与确认失效校验', stage: 'gen', wave: 'W4',
      kinds: ['check'], pending: ['check'], kb: ['抽卡军规'],
      cmds: ['episode.preflight', 'shot.generateVideo', 'episode.generateVideos'], gaps: ['S-05'],
      note: '只读既有判旧指纹与未确认计数出 warn,不改计费动作、不新增计费标签、不改确认闸行为',
    },
    /* ---- 审片 ---- */
    {
      id: 'review.stage', sk: 'SK-23', name: '审片升为主线一等步骤', stage: 'review', wave: 'W3',
      kinds: ['infra'], pending: ['infra'], prompts: ['review.system', 'review.finalSystem'],
      cmds: ['episode.smartReview'], gaps: ['G-03'],
      note: 'STAGES 里 review 的 wfStep 现为 false,本条落地后与 Domain.workflow 步骤集合同步改真',
    },
    {
      id: 'review.methodDim', sk: 'SK-24', name: '方法论维度进审片报告', stage: 'review', wave: 'W4',
      kinds: ['inject', 'check'], pending: ['check'], kbBlocks: ['reviewBlock'],
      prompts: ['review.system', 'review.finalSystem'], settings: ['tplReview'], cmds: ['episode.smartReview'],
      experts: ['ex_editor'], gaps: ['G-10'],
      note: '维度口径以 script.hookType / script.faceslapFour / shots.shotLanguage / shots.promptEightDim 的条目为准,不在本条重复登记',
    },
    {
      id: 'review.reviseLoop', sk: 'SK-25', name: '审片修订闭环编排', stage: 'review',
      covers: ['review', 'gen', 'film'], wave: 'W3', kinds: ['orchestrate'], gaps: ['G-03', 'G-12'],
      steps: [
        { cmd: 'episode.smartReview', args: { quiet: true }, note: '整集逐镜评审:低分镜与共性问题落 lastReview' },
        { cmd: 'episode.generateVideos', args: {}, note: '按审片问题修订提示词后只重跑低分镜(shotIds 传低分镜子集)' },
        { cmd: 'episode.smartReview', args: {}, note: '复审:仍有待人工镜则回 needs_human' },
        { cmd: 'episode.compose', args: {}, note: '达标后合成成片' },
      ],
    },
    {
      id: 'review.memoryFeedback', sk: 'SK-26', name: '审片结论按板块回流专家', stage: 'review',
      covers: ['review', CROSS], wave: 'W4', kinds: ['orchestrate'], pending: ['orchestrate'],
      cmds: ['episode.smartReview'], experts: ['ex_editor'], gaps: ['G-11', 'G-02'],
      note: '沿用既有记忆桶与自定义专家副本,不新建存储桶、不改预置专家数据;回流步骤尚无命令出口',
    },
    /* ---- 成片 ---- */
    {
      id: 'film.rhythmInject', sk: 'SK-27', name: '剪辑节奏注入成片评审与时间线建议', stage: 'film', wave: 'W2',
      kinds: ['inject'], kb: ['剪辑节奏'], prompts: ['review.finalSystem'], cmds: ['episode.compose'],
      experts: ['ex_editor'], gaps: ['G-15', 'G-13'],
    },
    {
      id: 'film.subtitleQC', sk: 'SK-28', name: '字幕时间轴与阅读速度校验', stage: 'film', wave: 'W4',
      kinds: ['check'], pending: ['check'], cmds: ['episode.compose'], gaps: ['S-06'],
      note: '判定输入是合成时间轴段与软字幕产物,SRT 现无结构化质检结论(S-06)',
    },
    {
      id: 'film.deliverContract', sk: 'SK-29', name: '交付契约门', stage: 'film', wave: 'W4',
      kinds: ['check'], pending: ['check'], cmds: ['episode.compose', 'episode.produce'], gaps: ['G-10', 'S-07'],
      note: '复用既有发布门与问题清单口径;方法论门挂成可选门默认 warn,既有 fail/warn 口径不动',
    },
    {
      id: 'film.produceProjection', sk: 'SK-30', name: '一键成片编排 playbook 化', stage: 'film', wave: 'W4',
      kinds: ['orchestrate'], cmds: ['episode.produce', 'episode.compose'], gaps: ['G-12'],
      steps: [
        { cmd: 'episode.produce', args: { smartReview: true }, note: '一键成片:批量生成→智能审片→合成,内部按 maxRetry 重试;风险位仍走既有决策' },
      ],
      note: '本条只做既有编排命令的 playbook 投影,不内联第二份成片语义;风险位中断后的补合成走 episode.compose',
    },
  ];

  const ARR = ['kb', 'kbBlocks', 'prompts', 'settings', 'cmds', 'experts', 'checks', 'gaps', 'covers', 'kinds', 'pending'];
  REG.forEach(s => {
    s.steps = s.steps || [];
    ARR.forEach(k => { s[k] = s[k] || []; });
    if (!s.covers.length) s.covers = [s.stage];
    /* 编排型的命令面由 steps 推出,不在条目里手写第二份 */
    if (!s.cmds.length) s.cmds = s.steps.map(x => x.cmd).filter((v, i, a) => a.indexOf(v) === i);
  });

  const copy = s => Object.assign({}, s, ARR.reduce((o, k) => { o[k] = s[k].slice(); return o; }, {}),
    { steps: s.steps.map(x => Object.assign({}, x, { args: Object.assign({}, x.args) })) });
  /* 某一机制面是否已有出口:kinds 里声明了且不在 pending 里 */
  const live = (s, kind) => s.kinds.indexOf(kind) >= 0 && s.pending.indexOf(kind) < 0;

  return {
    STAGES, CROSS, KINDS, WAVES, CHECKS, REG,
    stages: () => STAGES.map(x => x.key),
    stageOf: key => STAGES.find(x => x.key === key) || null,
    list(stage) { return REG.filter(s => !stage || s.stage === stage).map(copy); },
    /* 按作用面取:含把该步写进 covers 的跨步条目(list 只给主 stage) */
    covering(stage) { return REG.filter(s => s.covers.indexOf(stage) >= 0).map(copy); },
    byId(id) { const s = REG.find(x => x.id === id); return s ? copy(s) : null; },
    /* 专家 → 引用它的能力(SK-02 反查出口:专家条目侧不存第二份 skills[]) */
    forExpert(id) { return REG.filter(s => s.experts.indexOf(id) >= 0).map(copy); },

    /* 注入型:按 stage 拼方法论块,文本一律现取 KB(索引层不缓存、不复述)。
     * 注入面尚无出口(pending 含 inject)的条目不参与拼块。
     * ctx:{ids:[skillId] 只取指定条目(既有注入点逐字节对齐用), sep 连接符(默认空串,与既有注入点一致)} */
    block(stage, ctx) {
      const c = ctx || {};
      const parts = [];
      REG.forEach(s => {
        if (s.stage !== stage || !live(s, 'inject')) return;
        if (c.ids && c.ids.indexOf(s.id) < 0) return;
        s.kb.forEach(k => { if (KB.section(k)) parts.push(KB.section(k)); });
        s.kbBlocks.forEach(b => { if (typeof KB[b] === 'function') parts.push(KB[b]()); });
      });
      return parts.join(c.sep === undefined ? '' : c.sep);
    },

    /* 校验型:跑该步已注册的校验项(纯本地、零 LLM、零计费);无校验项即空数组 */
    check(stage, obj, ctx) {
      const out = [];
      REG.forEach(s => {
        if (s.stage !== stage || !live(s, 'check')) return;
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
      const s = REG.find(x => x.id === id && live(x, 'orchestrate'));
      if (!s) return null;
      return { id: s.id, title: s.title || s.name, steps: copy(s).steps };
    },
    playbooks() { return REG.filter(s => live(s, 'orchestrate')).map(s => this.playbook(s.id)); },

    /* 缺口投影:缺口编号 → 引用它的能力 id(W3/W4 排期与验收挂钩用) */
    gaps() {
      const m = {};
      REG.forEach(s => s.gaps.forEach(g => { (m[g] = m[g] || []).push(s.id); }));
      return m;
    },

    /* 引用键自检:deps={KB?,Prompts?,CmdRegistry?,ExpertsData?,settingKeys?,wfStepKeys?},缺的注册表跳过对应检查。
     * 返回问题清单(空数组=全通过),供契约测试与启动期自检使用。 */
    validate(deps) {
      const d = deps || {};
      const kb = d.KB || KB;
      const promptKeys = d.Prompts ? d.Prompts.list().map(x => x.key) : null;
      const cmdNames = d.CmdRegistry ? d.CmdRegistry.names() : null;
      const expertIds = d.ExpertsData ? (d.ExpertsData.EXPERTS || []).map(e => e.id) : null;
      const stageKeys = STAGES.map(x => x.key).concat(CROSS);
      const bad = [];
      const seen = {}, seenSk = {};
      const push = (who, msg) => bad.push(who + ': ' + msg);
      REG.forEach(s => {
        if (seen[s.id]) push(s.id, 'id 重复');
        seen[s.id] = 1;
        if (!/^SK-\d\d$/.test(s.sk || '')) push(s.id, '短名单编号缺失或非法:' + s.sk);
        else if (seenSk[s.sk]) push(s.id, '短名单编号重复:' + s.sk);
        seenSk[s.sk] = 1;
        if (stageKeys.indexOf(s.stage) < 0) push(s.id, 'stage 不在主线七步:' + s.stage);
        if (WAVES.indexOf(s.wave) < 0) push(s.id, '波次非法:' + s.wave);
        s.covers.forEach(k => { if (stageKeys.indexOf(k) < 0) push(s.id, 'covers 不在主线七步:' + k); });
        if (s.covers.indexOf(s.stage) < 0) push(s.id, 'covers 须含自身 stage');
        if (!s.kinds.length) push(s.id, '须声明至少一种机制面');
        s.kinds.forEach(k => { if (KINDS.indexOf(k) < 0) push(s.id, 'kind 非法:' + k); });
        s.pending.forEach(k => { if (s.kinds.indexOf(k) < 0) push(s.id, 'pending 面未在 kinds 声明:' + k); });
        if (s.pending.length && !s.gaps.length) push(s.id, '有未落地机制面须写明缺口编号');
        s.kb.forEach(k => { if (typeof (kb.SECTIONS || {})[k] !== 'string') push(s.id, 'KB 条目不存在:' + k); });
        s.kbBlocks.forEach(b => { if (typeof kb[b] !== 'function') push(s.id, 'KB 压缩块不存在:' + b); });
        s.checks.forEach(c => { if (typeof CHECKS[c] !== 'function') push(s.id, '校验项未注册:' + c); });
        if (promptKeys) s.prompts.forEach(k => { if (promptKeys.indexOf(k) < 0) push(s.id, '提示词 key 不存在:' + k); });
        if (d.settingKeys) s.settings.forEach(k => { if (d.settingKeys.indexOf(k) < 0) push(s.id, '偏好设置键不存在:' + k); });
        if (expertIds) s.experts.forEach(e => { if (expertIds.indexOf(e) < 0) push(s.id, '专家 id 不存在:' + e); });
        if (cmdNames) s.cmds.forEach(n => { if (cmdNames.indexOf(n) < 0) push(s.id, '命令名不存在:' + n); });
        s.steps.forEach((st, i) => {
          if (cmdNames && cmdNames.indexOf(st.cmd) < 0) push(s.id, '步骤 ' + (i + 1) + ' 命令名不存在:' + st.cmd);
          const meta = d.CmdRegistry && d.CmdRegistry.byName[st.cmd];
          if (!meta) return;
          const argNames = (meta.args || []).map(a => a.name);
          Object.keys(st.args || {}).forEach(k => { if (argNames.indexOf(k) < 0) push(s.id, '步骤 ' + (i + 1) + ' 参数不在命令 args:' + k); });
        });
        /* 已有出口的机制面必须真的拿得出东西;尚无出口的面一律不挂假出口 */
        if (live(s, 'inject') && !s.kb.length && !s.kbBlocks.length) push(s.id, '注入型须引用 KB 条目或压缩块');
        if (live(s, 'check') && !s.checks.length) push(s.id, '校验型须引用已注册校验项');
        if (live(s, 'orchestrate') && !s.steps.length) push(s.id, '编排型须有 steps');
        if (s.pending.indexOf('check') >= 0 && s.checks.length) push(s.id, '校验面未落地不得登记校验项');
        if (s.pending.indexOf('orchestrate') >= 0 && s.steps.length) push(s.id, '编排面未落地不得登记步骤');
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
