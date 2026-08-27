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
      key: 'extract.system', name: '主体提取 · 系统人设', vars: [],
      def: '你是专业的短剧剧本分析助手。',
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
