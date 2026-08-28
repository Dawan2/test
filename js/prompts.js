/* ============ prompts.js 核心提示词注册表(文件化 skill) ============
 * 主线核心提示词集中登记:def 为系统默认;用户在「偏好学习 → 全局默认值 → 核心提示词 skill」
 * 在线改写,覆盖存 Store.state.settings.promptOverrides(清空即恢复默认)。
 * 用法:Prompts.get(key) 取生效文本;Prompts.fill(key, {var}) 取文本并替换 {变量}。 */
(function (root, factory) {
  const P = factory();
  if (typeof module === 'object' && module.exports) module.exports = P; // 双端:server.js wf 端点 require(覆盖表由调用方显式传入)
  else root.Prompts = P;
})(typeof self !== 'undefined' ? self : globalThis, function () {
  const REG = [
    {
      key: 'split.system', name: '剧本拆集 · 系统人设', vars: [],
      def: '你是专业的短剧策划编辑。',
    },
    {
      /* 建分集的第二条入口(参考视频 → 场景切段 → 逐段画面理解)的人设句,与剧本拆集并列登记。
       * 只收人设句:段号/时段的现拼提示与返回 JSON 字段契约仍留在该步 user 半,不开放覆盖(改坏即该段解析失败)。 */
      key: 'rip.system', name: '拉片建集 · 系统人设', vars: [],
      def: '你是短剧拉片分析师。根据用户给的单镜头关键帧与时段,输出该镜头的结构化描述。',
    },
    /* 剧本/前期板块四步人设:四步角色互不相同(解说编剧 / 导演组围读会 / 开拍前定调导演 / 摄影指导),
     * 故四条独立键,不合成带变量的一个键;展示顺序按产品流程——剧本页(旁白改写→围读)→ 开拍前定调 → 制片光影。
     * 同样只收人设句:返回 JSON 字段契约与正文摘取仍由各步 user 半拼,不开放覆盖(改坏即整轮解析失败)。 */
    {
      key: 'narration.system', name: '旁白解说体改写 · 系统人设', vars: [],
      def: '你是资深短剧解说编剧,擅长把短剧剧本改写成旁白解说体(解说模式)。',
    },
    {
      key: 'reading.system', name: '剧本围读 · 系统人设', vars: [],
      def: '你是短剧导演组的剧本围读会,由编剧/导演/制片联合评审。',
    },
    {
      key: 'concept.system', name: '构思导演阐述 · 系统人设', vars: [],
      def: '你是资深短剧/漫剧导演,在项目开拍前做导演阐述(Director Treatment)。',
    },
    {
      key: 'light.system', name: '全剧光影总控 · 系统人设', vars: [],
      def: '你是影视摄影指导(DP),负责全剧光影总控。',
    },
    {
      /* 导演设定五维(光影/色调/情感氛围/服化道审美/表演气质)的 AI 生成步:只收人设句,
       * 返回 JSON 的五维字段名契约与风格/剧本前段的摘取仍由该步 user 半拼,不开放覆盖(改坏即整轮解析失败回退模板)。
       * 与 und.system(你是资深短剧导演。)差「影视/短剧」两字、角色与产物落点都不同,故不复用。 */
      key: 'dirset.system', name: '导演设定生成 · 系统人设', vars: [],
      def: '你是资深影视导演。',
    },
    {
      key: 'extract.system', name: '主体提取 · 系统人设', vars: [],
      def: '你是专业的短剧剧本分析助手。',
    },
    /* 音色推荐两步的人设:单个与批量各一条独立键。两处 def 逐字节相同,仍不合并——
     * 键位是持久化面(覆盖按键存),合成一条之后想拆回来就会废掉用户已写的覆盖;
     * 且两步该讲的话不同(批量那步要顾角色间的音色区分度,单个那步只看一个角色)。
     * 同样只收人设句——音色库取值范围与返回 JSON 约定仍由各自调用点拼,不开放覆盖。 */
    {
      key: 'voice.recommendSystem', name: '音色推荐 · 系统人设', vars: [],
      def: '你是配音导演。',
    },
    {
      key: 'voice.recommendBatchSystem', name: '批量音色推荐 · 系统人设', vars: [],
      def: '你是配音导演。',
    },
    {
      // 主体八维度人设重写文生图提示词那步:只收人设句,参考模板仍取 settings.tplImage、返回 JSON 约定仍由装配口拼
      key: 'persona.promptSystem', name: '八维度重写文生图提示词 · 系统人设', vars: [],
      def: '你是文生图提示词专家。',
    },
    /* 主体编辑页「按指令改」那步:人设句里带主体类别({kind} 取角色/场景/道具,取值口用 Prompts.fill 填),
     * 故这是人设类键里唯一带变量的一条。分镜那侧同形的「按指令改」角色是改图师、产物是镜头画面提示词,
     * 这一步的角色是主体设定师、产物是主体的设定提示词(改完回落 s.prompt 再走生图链路),不合成一条——
     * 合成之后改一次就改掉两条链路的缺省。同样只收人设句(连同改写纪律):主体名/项目风格/当前设定提示词的摘取
     * 与返回 JSON 字段契约仍由该步 user 半拼,不开放覆盖(改坏即改写结果落不回设定提示词)。 */
    {
      key: 'persona.editSystem', name: '主体按指令改 · 系统人设', vars: ['{kind}'],
      def: '你是短剧{kind}设定师。按用户指令改写文生图设定提示词:保留与指令无关的外形/风格要素,只落实指令要求的变更;输出中文提示词,不超过120字。',
    },
    {
      // 剧本摘要链路(EpisodeUtil.aiScriptDigest)通读/汇总/集纲三步同一条策划人设,一键三口
      key: 'digest.planSystem', name: '剧本摘要 · 系统人设', vars: [],
      def: '你是资深短剧策划。',
    },
    /* 分镜脚本创作层两步人设:场次节拍拆解的角色是编剧(出场次/情绪节拍骨架)、文字分镜拆解的角色是分镜师
     * (把节拍摊成连续画面),措辞与产物落点都不同,故两条独立键、不合成带变量的一个键;
     * 排在 sb.system 之前——分镜脚本是「① 分镜脚本」tab 的创作层,智能分镜是它之后的另一条入表路径。
     * 同样只收人设句:返回 JSON 字段契约与正文摘取仍由各步 user 半拼,不开放覆盖(改坏即整轮解析失败)。 */
    {
      key: 'sb.boardSceneSystem', name: '分镜脚本场次节拍拆解 · 系统人设', vars: [],
      def: '你是顶级短剧编剧,擅长场次与情绪节拍拆解。',
    },
    {
      key: 'sb.boardDraftSystem', name: '分镜脚本文字分镜拆解 · 系统人设', vars: [],
      def: '你是顶级短剧分镜师,擅长把情绪节拍拆成连续画面表达的文字分镜。',
    },
    /* 事件图谱拆解步的人设:角色是"剧本结构分析师"(拆事件序列),与剧本板块其余几步的角色互不相同,
     * 故独立一条键、不与它们合成带变量的一个键;取值口在 js/episodes.js 逐集拆解那步经 Prompts.get。
     * 同样只收人设句:返回 JSON 的 events 字段契约与正文摘取仍由该步 user 半拼,不开放覆盖(改坏即整轮解析失败)。 */
    {
      key: 'graph.system', name: '事件图谱拆解 · 系统人设', vars: [],
      def: '你是短剧剧本结构分析师。',
    },
    {
      key: 'sb.system', name: '智能分镜 · 系统人设', vars: [],
      def: '你是顶级短剧分镜师(AI 分镜师),输出直接可拍的连续剧分镜脚本。运镜与景别由你按剧情情绪自主推荐(用户界面不提供手填),并自觉遵守轴线规则。',
    },
    {
      key: 'sb.reviewUser', name: '分镜五角色评审 · 评审指令', vars: ['{style}', '{brief}'],
      def: `以编剧/导演/摄像/动效师/审片五个角色评审以下分镜脚本(项目风格:{style}),返回 JSON:
{"score":综合评分(60-99的整数),"comments":[{"role":"编剧","text":"评语"},{"role":"导演","text":"..."},{"role":"摄像","text":"..."},{"role":"动效师","text":"..."},{"role":"审片","text":"..."}]}
要求:comments 恰好 5 条;若 score 低于 90,评语必须指出具体镜号与可修改的问题,供下一轮修订。
摄像角色必查景别衔接口诀:相邻景别不硬切(前后镜景别相同/相邻扣一分并指出镜号)、景别切换隔一别(优先跨一级)、两极镜头不衔接(大全景与特写/超级特写不得直接对切,须中景过渡)。
分镜脚本:
{brief}`,
    },
    {
      key: 'sb.reviewSystem', name: '分镜评审 · 系统人设', vars: [],
      def: '你是资深影视审片专家组。',
    },
    {
      key: 'und.system', name: '本集理解 · 系统人设', vars: [],
      def: '你是资深短剧导演。',
    },
    {
      /* 只收人设句:5 段式返回 JSON 约定(段名/宫格数/衔接词表/节拍帧结构)仍留在该步 user 半,不开放覆盖
       * (改坏即整步解析不出节拍板);KB「六阶段结构/打脸四步」方法论段由取用点按键接在人设句之后 */
      key: 'beat.system', name: '节拍板拆解 · 系统人设', vars: [],
      def: '你是短剧节拍拆解专家,精通 5 段式黄金结构(开篇钩子→矛盾建立→打压升级→反转蓄力→断集留客)。',
    },
    {
      key: 'gen.promptSystem', name: '视频提示词改写 · 系统人设', vars: [],
      def: '你是文生视频提示词专家。',
    },
    {
      /* 镜头「按指令改」那步:与上一条同在提示词工具层但角色不同(改图专家 vs 提示词专家),
       * 且上一条经装配口 WfCore.genPromptSystem 还要接 KB 抽卡公式/军规——复用即改变缺省,故独立键。
       * 收的是人设句连同改写纪律(写坏只是效果差,同 sb.system/review.finalSystem 那一族);
       * 返回 JSON 字段与镜头上下文摘取仍由该步 user 半拼,不开放覆盖(改坏即整轮解析失败)。 */
      key: 'gen.editSystem', name: '按指令改分镜提示词 · 系统人设', vars: [],
      def: '你是短剧分镜改图专家。按用户指令改写文生图提示词:保留原提示词中与指令无关的画面要素与风格约定,只落实指令要求的变更;输出中文提示词,不超过120字。',
    },
    {
      key: 'review.system', name: '单镜审片 · 系统人设', vars: [],
      def: '你是资深影视审片专家组(技术/匹配/导演三席)。',
    },
    {
      key: 'review.sumSystem', name: '整集共性汇总 · 系统人设', vars: [],
      def: '你是短剧审片总监。',
    },
    {
      key: 'review.finalSystem', name: '成片审片 · 系统人设', vars: [],
      def: '你是资深短剧剪辑审片总监,以四维标准评审成片:镜头语言自然度/衔接流畅度/景别合理性/剪辑节奏适配。',
    },
    {
      /* 剧壳发行文案包那步:只收人设句,其后按键接的 KB 钩子六型+付费卡点仍由取值口现拼(方法论正文不随覆盖变动),
       * 六字段返回 JSON 契约仍留在 user 半、不开放覆盖(改坏即整轮解析失败,六个输入框一个都填不上) */
      key: 'dist.copySystem', name: '发行文案包 · 系统人设', vars: [],
      def: '你是短剧发行运营专家,精通平台投稿与投流文案。',
    },
    {
      // 只收人设句:ops 协议/命令白名单/返回 JSON 约定仍由 WfCore.buildAgentSystem 拼,不开放覆盖(改坏约定即整轮解析失败)
      key: 'agent.system', name: 'Agent 单轮对话 · 系统人设', vars: [],
      def: '你是「虎鲸导演助手」,短剧制作智能体(服务端单轮模式:没有浏览器工作台,只给回复与可选的领域命令动作)。',
    },
    /* 浏览器多轮对话的三份人设:三种运行模式各一条独立键(措辞不同,不合并)。
     * 同样只收人设句——ops 协议/字段面/返回 JSON 约定仍由各自装配口拼,不开放覆盖。 */
    {
      key: 'agent.panelSystem', name: 'Agent 分集面板 · 系统人设', vars: [],
      def: '你是「虎鲸导演助手」,短剧分镜编辑智能体。',
    },
    {
      key: 'agent.drawerSystem', name: 'Agent 全局抽屉 · 系统人设', vars: [],
      def: '你是「虎鲸导演助手」,短剧创作智能体,贯穿剧本→主体→分集→分镜→生成→成片全流程。',
    },
    {
      key: 'agent.previsSystem', name: 'Agent 预排模式 · 系统人设', vars: [],
      def: '你是「虎鲸导演助手」,短剧创作智能体,当前处于「🎛 预排模式」。',
    },
    /* Agent 对话闭环的两个辅助步(都在 js/agent-ops.js,都只有浏览器一个消费点):
     * 回执核验修复(step:'fix')与会话纪要蒸馏(step:'cmp')。两句 def 逐字节不同(角色也不同:
     * 一个归因执行回执并给修复 ops、一个把旧对话蒸馏成纪要),故两条独立键、不共用一键。
     * 同样只收人设句:回执格式与 ✕/⊘ 记号、修复 ops 白名单、蒸馏字数与保留项、返回 JSON 约定
     * 都是解析契约(改一个字即整轮 ops 落空 / 纪要写不回),仍由各自调用点拼,不开放覆盖。 */
    {
      key: 'agent.selfFixSystem', name: 'Agent 执行回执核验修复 · 系统人设', vars: [],
      def: '你是「虎鲸导演助手」的执行核验器。',
    },
    {
      key: 'agent.compactSystem', name: 'Agent 会话纪要蒸馏 · 系统人设', vars: [],
      def: '你是会话纪要整理器。',
    },
    /* 专家工坊两步人设:锻造器(从一句描述铸出一位新专家)与进化器(把已有专家的使用记录蒸馏成进化条款),
     * 两者都作用在「专家」这个对象上而不在主线某一步上,故排在主线各步与 Agent 各模式之后;
     * 角色不同(无中生有 vs 就地改写),各成一条独立键。
     * 同样只收人设句:锻造器的严格 JSON 字段面与改稿规则、进化器的 clauses 约定与条款上限
     * 仍写死在 js/experts.js 各自调用点,不开放覆盖(改坏即整轮规范化取不到字段)。 */
    {
      key: 'forge.system', name: '专家工坊锻造器 · 系统人设', vars: [],
      def: '你是「专家 skill 生成器」(元智能体)。用户会描述想要的短剧创作专家(导演/编剧/摄像/策划等,含题材、风格、擅长点),你为其生成完整专家 skill。',
    },
    {
      key: 'forge.evolveSystem', name: '专家自进化进化器 · 系统人设', vars: [],
      def: '你是专家人设进化器。',
    },
    {
      // 只收人设句:气泡条数/返回 JSON 形状/type 词表/字数上限仍由 js/editors.js 拼,不开放覆盖(改坏即整轮解析不出气泡)
      key: 'comic.bubbleSystem', name: '漫剧气泡对白 · 系统人设', vars: [],
      def: '你是漫剧编剧。',
    },
  ];
  const byKey = {};
  REG.forEach(r => byKey[r.key] = r);
  // 浏览器默认从 Store.settings.promptOverrides 读覆盖;Node(server.js)无 window,覆盖表须由调用方经第二参数显式传入
  const overrides = () => ((typeof window !== 'undefined' && window.Store && Store.state && Store.state.settings) || {}).promptOverrides || {};
  const Prompts = {
    list(ov) { return REG.map(r => ({ key: r.key, name: r.name, vars: r.vars, def: r.def, value: this.get(r.key, ov), overridden: !!String((ov || overrides())[r.key] || '').trim() })); },
    get(key, ov) {
      const o = (ov || overrides())[key];
      if (o && String(o).trim()) return o;
      return byKey[key] ? byKey[key].def : '';
    },
    fill(key, vars, ov) {
      let t = this.get(key, ov);
      Object.keys(vars || {}).forEach(k => { t = t.split('{' + k + '}').join(String(vars[k])); });
      return t;
    },
    /* 覆盖写存:与默认相同或空文本则清除覆盖(恢复系统默认);仅浏览器端可用 */
    setAll(map) {
      Store.state.settings = Store.state.settings || {};
      const po = Store.state.settings.promptOverrides = Object.assign({}, Store.state.settings.promptOverrides);
      Object.keys(map || {}).forEach(k => {
        const v = String(map[k] || '');
        if (!v.trim() || v === (byKey[k] || {}).def) delete po[k]; else po[k] = v;
      });
      if (!Object.keys(po).length) delete Store.state.settings.promptOverrides;
      Store.save();
    },
  };
  return Prompts;
});
