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
