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
