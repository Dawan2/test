# W40 · 整集共性汇总的系统人设收编两端(SK-03 最后一处内联 system)

> 基线 `cursor/w39-review-persona-mem-9fe5 @ 9e43d8e`(W39 审片侧三步接上人设/记忆 ctx 通道后的头部),落地分支 `cursor/w40-sum-system-prompt-fc50`。
> 本槽做的是 W39 第 10 节交接第 1 条:把整集共性汇总步两端写死的那句人设收进 `js/prompts.js` 注册表,收编方式与 W18 收编 `gen.promptSystem` 一致。
> 不改发布门(`js/release.js` 一行未碰)、不新增计费动作(汇总步仍按 `llm.review` 原口径按次计费)、未删测(改写 1 条既有用例的断言方向,新增 1 条)。

## 1. 缺的是一个注册表键

W39 已经把三步的 **user 半**都接上了人设与记忆 ctx,但 **system 半**只有两步取自注册表,汇总步是字符串字面量:

| 端 | 位置 | system 半 | user 半 |
|---|---|---|---|
| 浏览器 | `js/review.js` `openEpisodeReview` 汇总步 | 内联 `'你是短剧审片总监。'` | 已单源 `WfCore.buildSumUser(reports, episodeReviewCtx(p, ep))` |
| 服务端 | `server.js` `/api/wf/smart-review` 汇总步 | 内联 `'你是短剧审片总监。'` | 已单源 `WfCore.buildSumUser(reports, epCtx)` |

后果只有一个:用户在「偏好学习 → 全局默认值 → 核心提示词 skill」把审片人设改了,逐镜审片(`review.system`)与四维成片评审(`review.finalSystem`)跟随,夹在中间的共性汇总不跟随——同一次整集审片里三个 LLM 步听两套人设。

## 2. 结果一句话

注册表新增第 8 条 `review.sumSystem`「整集共性汇总 · 系统人设」,`def` 与原内联字面**逐字节相同**;两端改成同键取值,服务端显式传 `settings.promptOverrides`。**缺省行为零变化**,覆盖时两端一并跟随;整集审片三个 LLM 步的 system 半至此全部可被用户覆盖。

```js
// js/prompts.js(REG 里排在 review.system 与 review.finalSystem 之间,与审片三步的执行顺序一致)
{ key: 'review.sumSystem', name: '整集共性汇总 · 系统人设', vars: [], def: '你是短剧审片总监。' },

// js/review.js:浏览器隐式读 Store.settings.promptOverrides
system: Prompts.get('review.sumSystem'),
// server.js:Node 无 window,覆盖表须显式传(与同端点另两步同纪律)
system: Prompts.get('review.sumSystem', ov),
```

回归:`unit 354/354`(基线 353,改写 1 条 + 新增 1 条,净 +1 用例)、`integration 93/93`。

改动:`js/prompts.js` +4、`js/review.js` +1−1、`server.js` +1−1、`js/skills.js` +5−4(SK-03 的 `prompts` 与 `note`)、`tests/unit.js` +26−7、`README.md` +3−3、`docs/skills-wave/README.md` +3−2,外加本记账件。

## 3. 为什么不做成 `WfCore` 派生函数

W18 收编 `gen.promptSystem` 时在 `wf-core.js` 落了一个 `W.optimizeSystem(ov)`,因为那个键有**两个形态不同的取用口**:生成步要在人设句后接 KB 抽卡公式+军规,修订链路只要人设句,派生函数是为了让"人设句只有一处取值"。

`review.sumSystem` 没有这个问题:两端都只要人设句,不接方法论块也不接 `Skills.block`。再包一层 `wf-core` 函数只是多一跳,故直接 `Prompts.get` —— 与同端点的 `review.system` / `review.finalSystem` / `sb.reviewSystem` 三个键写法完全一致,读代码的人不用记两种取法。

汇总步为什么不接方法论块:它的 user 半已经是「整集逐镜评分与问题清单 + 归纳指令」,再塞抽卡/景别一类的生成方法论会把归纳方向带偏;而与审片相关的方法论正文早已经由 `KB.reviewBlock()` 进了逐镜步。这与 W18 对修订链路的判断同理。

## 4. 缺省逐字节不变靠哪两层钉住

1. **注册表层**:`Prompts.get('review.sumSystem')` 的返回值用例直接与字面 `'你是短剧审片总监。'` 比对——改 `def` 即红(实测见第 6 节)。
2. **消费层**:两端源级断言「必须出现 `Prompts.get('review.sumSystem'...)`」且「不得再出现 `你是短剧审片总监` 字面」。单端退回内联时,另一端仍跟随覆盖,两端就此分叉——这一对断言正是为了让分叉当场转红。

`Prompts.get` 对未覆盖键返回 `def`,覆盖表为空对象/`undefined` 时同样落到 `def`(注册表既有行为,W1 起就有用例),故"没改过提示词"的用户看到的 system 半与本槽之前完全一样。

## 5. 记账:SK-03 的仍欠段换成剧本拆集步

`prompts` 补上新键(`Prompts` 全部 key 必须被 skill 索引引用是既有契约,漏登即红);`note` 里 W39 写的那句「共性汇总仍是内联 system」按实况改写。

但 W39 第 6.1 节刚把点名断言收紧成**只认「仍欠」之后那段**,而 SK-03 的 `pending` 早已清空、`gaps` 按关联索引口径保留——这条目仍必须写明它欠什么。实况是:同形态的内联人设还剩一处,`/api/wf/split-episodes` 与浏览器 `js/episode-util.js llmSplitEpisodes` 的剧本拆集步都写死 `'你是专业的短剧策划编辑。'`,同样不在注册表里、同样覆盖不到。故 SK-03 的仍欠段换成这一处,`tests/unit.js` 的点名锚点同步换成 `剧本拆集`。

| 条目 | 改成什么 | 剩余仍欠 |
|---|---|---|
| SK-03 `core.personaCtx` | `prompts` 补 `review.sumSystem`;`note` 的三步描述里去掉「仍是内联 system」的括注,加一句「共性汇总的人设句已收进注册表,两端同经 `Prompts.get` 取值、缺省逐字节不变」 | **剧本拆集步的系统人设未收进提示词注册表**(两端内联 `system: '你是专业的短剧策划编辑。'`) |

**仍欠的这一处配了点名断言**:新增用例直接断言 `server.js` 与 `js/episode-util.js` 里那句内联字面**仍在**。谁把它收编了,这条会先红,提醒同批改 SK-03 的 `note` 与锚点——与 W39 给本槽留的红灯是同一手法(第 6 节末行实测)。`pending` / `gaps` 一字未动,`Skills.list()` 里带 `pending` 的仍是那四条(`SK-05` / `SK-24` / `SK-26` / `SK-29`)。

## 6. 用例改动(改写 1 条 + 新增 1 条,未删测)与变异实测

| 用例 | 钉住的事 |
|---|---|
| **新增** `整集共性汇总人设`(contract 套件,紧挨 W18 那条) | 缺省字面 + 覆盖跟随 + 注册表条目形态(无变量、条目名含「共性汇总」)+ 两端取值口字面(服务端必须显式传 `ov`)+ 两端不留内联人设句 + SK-03 已登记新键 + 仍欠那处属实 |
| **改写** `infra 余量`(W39 那条) | 原来查「共性汇总仍是内联 `system`、注册表无 `sum` 键」的两段断言换成「三步的系统人设键都登记在 SK-03 名下」;W39 立的其余断言(三个模板经 `reviewCtxNote`、缺省逐字节比对、两端调用点字面、逐镜步反向钉住)一字未动 |
| **收紧** 记账对齐(既有用例) | `core.personaCtx` 的点名锚点由 `共性汇总` 换成 `剧本拆集`(仍只认「仍欠」之后那段) |

| 变异 | 实测行为 | 转红 |
|---|---|---|
| `js/review.js` 退回内联字面 | 浏览器不跟随覆盖,两端分叉 | 1 条 |
| 服务端 `Prompts.get('review.sumSystem')` 不传 `ov` | 服务端静默落回 `def`(Node 读不到 Store),覆盖只在浏览器生效 | 1 条 |
| 改 `def` 为「你是短剧审片总监,擅长共性归纳。」 | 缺省提示词变了 | 1 条 |
| SK-03 的 `prompts` 漏登新键 | 注册表新键脱离索引 | 4 条(含既有的「`Prompts` 全部 key 应被 skill 索引引用」与 W39 那条) |
| SK-03 的仍欠段换成「仍欠:无」 | 余量记账假清 | 1 条(W39 收紧后的点名断言接住) |
| 把剧本拆集人设也收编但不改 `note` | 仍欠段点名的余量已不存在 | 1 条(本槽新增的那条) |

## 7. 复核方式

```
git checkout cursor/w40-sum-system-prompt-fc50
node --check js/prompts.js js/review.js js/skills.js server.js tests/unit.js   # 通过
node tests/unit.js            # 354/354 PASS
node tests/unit.js contract   # 全通过(含新增那条与 README 数字对账)
node tests/unit.js skills     # 80/80,含改写后的 infra 余量与记账对齐两条
node tests/integration.js     # 93/93 PASS
node -e "const P=require('./js/prompts.js');console.log(P.get('review.sumSystem')==='你是短剧审片总监。', P.get('review.sumSystem',{'review.sumSystem':'汇总官。'}))"
# true 汇总官。(缺省逐字节不变;覆盖生效)
```

`node tests/e2e.js` 按仓库纪律未跑(需用户明确要求)。本槽不含合并、未开 PR。

## 8. 交接

1. **剧本拆集步的系统人设仍是内联的**(SK-03 剩下的唯一仍欠,见第 5 节)。收编方式与本槽逐条同形:加键 `split.system`(`def` = `'你是专业的短剧策划编辑。'`)、两端改 `Prompts.get`(服务端传 `ov`)、SK-03 的 `prompts` 补键、`note` 与点名锚点同步改。收编后本槽那条"仍是内联"的断言会先红。收完这一处,`/api/wf/*` 五条工作流的系统人设就全部在注册表内。
2. **注册表之外的内联人设仍是大头**,且不在 SK-03 的 `covers` 口径内:浏览器侧的导演阐述、光影总控、剧本围读、拉片分析、配音导演等十余处 system 半各写一份,既不双端也不可覆盖。要不要收编是产品口径题(注册表条目多了,「全局默认值」页会变得很长),W1 盘点第 7 条已登记该现象,本槽不动。
3. 汇总步的 `mockKind: 'sum'` 与计费动作 `llm.review` 未动,W39 的评分方与生成方同源风险(该件第 10 节第 2 条)同样未动。
