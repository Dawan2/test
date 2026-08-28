# W94 · `js/persona.js` 内联人设余量核实:零余量,不做空改

> 基线 `cursor/w85-integration-171f @ 2a05c72`,落地分支 `cursor/w94-persona-remainder-prompt-3f1f`。未合并 W83–W93。
> 任务前提是"W69 收了文生图重写、W73 收了配音两键之后,W76 盘点曾余 1 处文生图或其它"。
> **先 grep 核实的结论是:这一处已经不在了**——`js/persona.js` 的三个 LLM 步全部经 `Prompts.get` 现取,
> 全文零内联人设。按任务口径**一行代码未改**(有则收编、没有则把核实写进记账、不要空改代码),
> 本槽只有这份记账件与它那行目录索引。

## 1. 现场:三处 `system:` 全在注册表,零内联

先按纪律把原文取出来,不凭上游文档的盘点数字动手:

```
$ rg -n "system\s*:|Prompts\.get" js/persona.js
18:        system: Prompts.get('persona.promptSystem'),
83:        system: Prompts.get('voice.recommendSystem'),
110:        system: Prompts.get('voice.recommendBatchSystem'),

$ rg -n "API\.(chat|chatJSON|image|video)|WF\.|/api/wf|fetch\(" js/persona.js
17:      const out = await API.chatJSON({
82:      const out = await API.chatJSON({
109:      const out = await API.chatJSON({
```

**LLM 调用点恰好 3 个,`system:` 值位恰好 3 个,两组一一对应**——即该文件每一次上游调用都从注册表取人设,
没有第四个调用点、也没有哪个调用点绕过注册表。逐步对照:

| 步 | 位置 | 键 | `def`(现取,逐字节) |
|---|---|---|---|
| 八维度重写文生图提示词(`Persona.rewritePrompt`) | `js/persona.js:18` | `persona.promptSystem` | `你是文生图提示词专家。` |
| 按性格推荐音色(`Persona.recommendVoice`) | `js/persona.js:83` | `voice.recommendSystem` | `你是配音导演。` |
| 批量按人设推荐音色(`Persona.recommendVoicesBatch`) | `js/persona.js:110` | `voice.recommendBatchSystem` | `你是配音导演。` |

第一条是 W69 收的、后两条是 W73 收的,三条都在本槽基线里(W69 随 W75、W73 随 W80 并入)。
`voice.recommendSystem` 与 `voice.recommendBatchSystem` 两条 `def` 逐字节相同,那是 W73 有意留的同值组
(键位是持久化面,现在拆零成本、以后拆要动用户已写的覆盖),**不是本槽该合并的重复**——
W85 那条"全表互不相同"的全称断言已经点名这一组收窄过,不重复处理。

再核"内联人设"这三个字的其余可能形态,一个不落:

```
$ rg -n "['\`]你是" js/persona.js        # 0 命中(整文件没有以 你是 开头的字面)
$ rg -n "擅长|负责|请以" js/persona.js   # 0 命中
```

`persona.js` 因此**同时从三张全仓持有者名单上消失**——W78 那张按「系统人设值位」的、W79 那张按「以 `你是` 开头的字面」的、
W82 那张按 `Prompts.list()` 现推的,三张口径互不相同,而这一处在哪张口径下都是零。

## 2. 剩下的四类字面为什么都不是余量

文件里确实还有几处提示词性质的字面,逐类说明为什么不动它们(不是漏收,是口径外):

| 位置 | 内容 | 为什么不收 |
|---|---|---|
| `js/persona.js:19` / `:84` / `:111` | 三步的 user 半(八维度正文摘取、音色库取值范围、三份返回 JSON 约定) | **契约半,半不开放**。`{"prompt":...}` / `{"voice":...}` / 数组元素的 `name`·`voice` 连着 `out.prompt`、`voices.includes(out.voice)`、按名回填三处消费判据——改一个字不是"效果差一点"而是整步退回退路径。与 `agent.system`/`beat.system`/`comic.bubbleSystem` 同口径 |
| `js/persona.js:16` | `settings.tplImage` 取不到时的缺省模板 `{style}风格角色立绘,…` | 那是**偏好设置面**而不是人设:用户在「全局默认值」页一直改得到(SK-11 的 `settings` 登记键就是它),写成缺口就是把已经能做的事记成欠账。W69 已按这条口径判过,本槽不翻案 |
| `js/persona.js:26-28` | LLM 失败后的本地模板拼接(`styleOf`/`faceOf`/`buildSubjectPrompt`/`negOf`) | 不是提示词也不进上游请求,是回退产出的文生图提示词本身。收编面只覆盖 LLM 那一路 |
| `js/persona.js:43` | 八维度输入框的 `placeholder`(`如:剑眉星目,高鼻梁` 等八条) | UI 占位文案,不进任何请求。与 W81 在 `js/gsettings.js` 判过的那两处同理 |

## 3. 为什么不做空改

任务明写"没有则把核实写进记账、**不要空改代码**"。这一条在本仓有具体代价,不只是洁癖:

- **动 `js/prompts.js` 就动数字**。注册表条数(现 29)被 `contract` 套件的文档数字对账钉着两处 README,
  为了"看起来做了点事"新开一个键要连带改 `README.md`、`docs/skills-wave/README.md`、SK 条目的 `prompts` 数组,
  而这些改动一个都对不出实况——注册表里并不缺这三步的键。
- **动取值口就动缺省**。三处 `Prompts.get` 已是现取(每次调用现读 `Store.state.settings.promptOverrides`,
  见 `js/prompts.js:163` 的 `overrides()`),改写法只有两个方向:加第二参数(浏览器侧等于**不读覆盖表**,
  W76 的变异 4 就是这一条)或换成装配口(会把方法论段塞进缺省,W74 判过——缺省从 14 字变 292 字)。两个方向都是行为变更。
- **动 `js/skills.js` 的 `note` 就动记账真实性**。SK-11 的 `note` 现在写的是"故本条自己的登记面已无收编余量",
  这句与实况一致;把它改成"本槽又收一处"就是假记账,且会撞掉 W66 立的那套仍欠段锚点断言。

`Skills.gaps()`、`G-13` 的六条关联索引、两份 README 的数字因此**逐字节不变**——本槽没有任何一处实况发生变化。

## 4. 这条结论不是散文,基线上已有五处断言兜底

"核实写进记账"如果只落在散文里,下一个槽照样要重查一遍。本槽的做法是**逐条点出基线上已经钉住它的断言**,
并确认这些断言的方向是"退回内联即红"而不是"当时内联所以钉着内联"。逐条现查过:

| 断言位置 | 判据 | 退回内联时怎么红 |
|---|---|---|
| `tests/unit.js:7372` | `js/persona.js` 里"`system:` 后紧跟引号加 `你是`"(单引号与反引号两种写法)的匹配数 **== 0** | 任一步退回内联即 ≥1,当场红 |
| `tests/unit.js:7365-7369` | 文生图重写步那段切片里 `Prompts.get('persona.promptSystem')` 在、`system: '你是文生图提示词专家。'` 不在,且注册表 `def` 命中恰好 1 条 | 只退这一步也红(不靠总计数) |
| `tests/unit.js:5405-5406` | 两条音色键各自的取值口在,且 `你是配音导演` 在该文件零命中 | 只退音色那两步也红 |
| `tests/unit.js:4772-4778` | 文生图那句字面的**全仓持有者名单**恰好只有 `js/prompts.js` | 别的文件抄第二份也红(哪怕原文件仍走注册表) |
| `tests/unit.js:5493-5500` | W78 那张全仓名单(文件:处数)整串相等 + 文件数 8 + 处数 11 | `js/persona.js` 新长出一处即多一项,整串比对当场红 |

第 5 行那张名单是这条结论最硬的一层:它不点名 `js/persona.js`(因为零处的文件本就不在名单上),
但**整串逐字节相等**这个写法让"某个文件新长出一处"必然改变期望串。这也是本槽不新增用例的理由——
要加的那条断言(`js/persona.js` 零内联)在基线上已经有三种粒度各钉一遍,再加一条只是第四份拷贝。

## 5. G-13 的余量现况(三张名单 live 现取)

本槽一处未收,故三张名单的值与基线相同,现取记录下来供下一槽取用(**别照抄,合入后自己现取一遍**):

```
$ node -e "…按 tests/unit.js 的 inlinePersonaHolders 口径扫描…"
js/agent-global.js:1 js/agent-ops.js:2 js/experts.js:2 js/plans.js:1 js/proj-planner.js:2
js/proj-upload.js:1 js/role-editor.js:1 js/sb-views.js:1
文件数 8 处数 11
```

按 W78 那张口径,G-13 的余量是 **8 个文件 11 处**,`js/persona.js` 不在其中。
`js/agent-ops.js` 的执行核验器与会话纪要整理器、`js/sb-views.js` 的分镜改图专家这三处是 SK-10/SK-11 仍欠段现在点名的锚点
(那两条各配着一条"此刻确实还有内联人设"的反向断言,见 `tests/unit.js:4800-4802`),收编时须同步翻面。

**W76 那份盘点为什么与实况不符**:它记的是自己基线 `d2e7c43` 上的 `js/persona.js` 3 处,
并在交接里写明"W69 收 1 处、W73 收 2 处,合入后归零"。本槽基线上两条都已并入,所以那 3 处一处不剩。
按 W76 自己交接第 2 条的口径(**别照抄盘点表,现取一遍全仓计数再定**),这次现取的结果就是零。

## 6. 复核方式与测试数字

```
git checkout cursor/w94-persona-remainder-prompt-3f1f
node --check js/persona.js js/prompts.js js/skills.js tests/unit.js   # 通过

node tests/unit.js          # 443/443 PASS(与基线同:本槽零代码改动、零用例改动)
node tests/integration.js   # 126/126 PASS(与基线同)
node tests/cli.smoke.js     # 95/97;两处失败「未登录 whoami → exit 3」「llm --json mock 链路」
                            # 与 master 同名(master 现取 51/53,同两条)

node -e "const P=require('./js/prompts.js');
['persona.promptSystem','voice.recommendSystem','voice.recommendBatchSystem']
  .forEach(k=>console.log(k, JSON.stringify(P.get(k))));
console.log('注册表条数', P.list().length);"
# persona.promptSystem "你是文生图提示词专家。"
# voice.recommendSystem "你是配音导演。"
# voice.recommendBatchSystem "你是配音导演。"
# 注册表条数 29
```

`master` 那两条冒烟失败现开工作树 `git worktree add /tmp/wt-master master` 取证,与本分支同名同因,不是本槽引入。
`node tests/e2e.js` 按仓库纪律未跑(需用户明确要求)。本槽不含合并、未开 PR。

## 7. 改动面

`docs/skills-wave/w94-persona-remainder-prompt.md`(本件)+ `docs/skills-wave/README.md`(仅索引表加一行)。
**`js/` 与 `server.js`/`cli.js`/`mcp.js`/`tests/` 一行未碰**,`README.md` 未碰(没有数字发生变化),
`js/skills.js` 的 `prompts`/`note`/`gaps`/`pending` 一字未动。未删测。

## 8. 交接

1. **`js/persona.js` 这条线到此为止**:三步全在注册表、契约半有意留在 user 半、`settings.tplImage` 不是缺口。
   下一个槽拿到"persona 还欠一处"这类前提时,先跑第 1 节那两条 grep 再决定动不动手——
   这类前提在盘点件里的有效期只到它被收编那一刻。
2. **下一处该挑哪个**:按第 5 节现取,`js/proj-planner.js`(2 处)与 `js/experts.js`(2 处)是同文件多处、
   `js/agent-ops.js`(2 处)另有 SK-10/SK-11 的反向断言要一并翻面。哪个都要先按 W74 的手法逐字节核对同文件几处是不是同一句话
   (同字面 / 同角色 / 同产物落点三条判据全成立才谈一键多口),再定键数。
3. **零余量槽的记账形态**:这一槽的产出是"核实 + 指出已有断言在哪",不是代码。判断一处核实要不要补断言,
   判据是**基线上有没有方向正确的断言**(钉着"当时内联"的断言在收编后会变成反向噪声,那种才要翻面);
   本槽五处断言方向全对,故不补第四份拷贝。
4. **别把有意同值的两条音色键当重复收掉**:`voice.recommendSystem` 与 `voice.recommendBatchSystem` 的 `def` 逐字节相同是 W73 的决定
   (批量那步要顾角色间的音色区分度,单个那步没有这个约束),合成一键会废掉用户已写的覆盖,且当场红在 W85 收窄过的那条全称断言上。
