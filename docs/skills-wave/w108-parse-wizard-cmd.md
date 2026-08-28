# W108 · SK-04 余量:剧本解析向导的主体入库收口到命令层

**范围**:`js/director.js`(Step1 整段改经命令层)+ `js/proj-upload.js`(调用面少一个形参)
+ `js/commands.js`(`project.extractSubjects` 认 `model`/`local` 两位、新建主体补生图模型默认)
+ `js/cmd-registry.js`(两位登记)+ `js/flow-tpl.js`(`ARG_SOURCE` 两条取数出处)
+ `cli.js`(headless 如实拒绝这两位)+ `js/skills.js`(SK-04 仍欠段随实况改写)
+ `tests/unit.js` +2(**465 → 467**)、`tests/cli.smoke.js` +1(**97 → 98**)+ `server.js` 一处注释
+ `README.md` 三处(命令表条目、端点行的入库口径、两个测试数)。
**基线**:`origin/cursor/w104-integration-9e92`(`4954175`)。**未合并 W102–W107。**
**不做**:不新增计费动作与计费口径(`local` 那条路零 LLM 零计费,本来就是原向导离线那条路)、
不动向导里既有的 `Tasks.run`(Step3 批量主体图逐主体那五件套一字未改)、不抬发布门(`G1–G10` 判据与计数口径未动)、
不改 `/api/wf/extract-subjects` 的"只出候选不写回 state"契约、不动 `memFeedback`/`memWrite` 派生、
不改分集那一半(见第 5 节的核实结论)。

## 1. 改前的实况:同一个动作,浏览器有两条入库路径

W61 把主线前段四步的闭环结论接进回流面时,在第 4 节留下三处余量,第二处点名的就是这里:

> **浏览器解析向导另有入库路径。** 向导按用户勾选合并主体,不经 `Commands.execute`,故那条路仍不回流。
> 补它要先把向导的入库收口到命令层(那是解析向导自己的重构),本槽不顺手改别人的路径。

先按 live 代码核对了一遍这句话,发现它**低估了差距**:向导那条路不是"另一套合并口径",是**根本不合并**。
`js/director.js` 的 `stepExtract` 自己调 `EpisodeUtil.llmExtractSubjects`、自己造主体条目,
最后一行是 `p.subjects = subjects` —— **整表覆盖**。逐项对照(左=向导,右=命令层):

| 面 | 向导(改前) | `Commands.execute('project.extractSubjects')` |
|---|---|---|
| 入库 | `p.subjects = subjects` 整表覆盖 | 同名同类不覆盖,`formerNames`/`aliases` 双向寻址后再判重 |
| 老主体 | **连已生成的参考图一起丢**(新条目一律 `image: null`) | 原样留住,只补 `prompt`/`persona`/`description` 三个空字段 |
| `description` | 不写 | 写 |
| 回流 | 一条不写 | 按主体板块回流一条(`fb: extract:<pid>`) |
| 提取失败 | 首次报错可重试;重试再失败回退本地启发式 | 如实 `failed`(在线),离线走本地启发式 |
| LLM 部分空 | 该类用本地启发式结果补上 | 以 LLM 结果为准 |
| 文本模型 | 用户在上传弹窗选的那个 | `settings.defLLM \|\| API.getConfig().model` |
| 生图模型 | 新主体预置 `settings.defImageModel` | 不写(由 `genSubjectImage` 兜底 `MODELS.image[0]`) |
| 任务登记 | 自己 `Tasks.start({type:'剧本解析'})` | 自己 `Tasks.start({type:'剧本解析'})` |

前四行是**收口的理由**:同一个用户点两个不同的按钮(上传剧本→解析剧本 vs 命令面板/Agent 的提取主体),
一个会毁掉已有主体图、一个不会。这不是"两套口径各有道理",这是一条路径漏了合并。
中间两行是**向导独有语义**(要保住,见第 3 节)。最后三行是**字段默认与登记**(要么搬进命令层、要么去重)。

## 2. 产品判断:收哪一段、留哪一段

任务允许"读完发现收口会破坏向导独有语义就记账核实、不要硬收"。逐项过了一遍,结论是**收**,
但收之前得先把两件真会丢的东西变成命令参数,否则就是拿"口径统一"去换用户看得见的功能:

1. **用户在上传弹窗选的文本模型**。那个模型选择器是弹窗上的第一个控件,收口后若被
   `settings.defLLM` 顶掉,等于控件在骗人。→ 命令加 `model` 位。
2. **重试仍失败时回退本地启发式**。原代码为此专门传 `fromRetry` 防重试死循环。命令层在线路径没有
   "强制本地"的口子(`API.isReady()` 一旦为真就只走 LLM),收口后重试会一直失败。
   → 命令加 `local` 位(与 `project.splitEpisodes` 的 `local` 同义:强制本地、零 LLM、零计费)。

两位都是**浏览器语境**才成立的:服务端 `/api/wf/extract-subjects` 的模型取 `st.defLLM || 'qwen-turbo'`
(模型策略在服务端,不接受调用方指定),本地启发式那套词典/正则只在 `js/episode-util.js`(浏览器)里。
故 `cli.js` 对这两位**如实 `blocked browser-only`**,而不是收下来静默忽略——
注册表里已有 `noImage` 这个 "(CLI)" 端标注的先例,反过来标 "(浏览器)" 是同一条口径。

**有意不保的一处**:LLM 某一类返回空时用本地启发式补那一类。理由不是省事:
本地启发式的场景/道具是**词典命中**(正文里出现"教室""长剑"就入库),而向导自己的提示就写着
"本地粗略提取(可能不准)"。LLM 说这本剧本没有道具时把词典命中掺进去,是给主体库塞噪音,
且噪音会一路带到分镜的主体引用与发布门 G9(缺参考图)。收口后在线成功即以 LLM 结果为准,与命令层/CLI 同口径。
这一条是本槽唯一**行为退让**,写在这里而不是藏在 diff 里。

## 3. 落地

### 3.1 向导侧(`js/director.js`)

Step1 从"提取 + 造条目 + 覆盖落盘"变成一次命令调用:

```js
const call = extra => Commands.execute('project.extractSubjects',
  Object.assign({ pid: p.id, mode: extractMode, model, main, ui: true }, extra || {}));
let r = await call();
if (!r.ok && fromRetry) r = await call({ local: true }); // 重试仍失败 → 本地启发式,防重试死循环
```

进度缓动(`crawl`)、`st.closed` 中断检查、失败步 `[data-errmsg]` 与断点重试按钮**位置一处未动**;
`ov`/`dock`/ETA 那套 UI 一行未改。三处随之调整:

- **不再自己登记任务**。命令层已 `Tasks.start({ type: '剧本解析', … })`,向导再登记一次就是同一个动作
  在任务中心出现两条。删的是重复登记,不是计费——真实扣费在服务端按 `llm.extract` 与 `operationId` 记,
  `operationId` 现由命令层那个任务的 `tk.id` 充当(与改前同形:一次调用一个稳定键,重试换新键)。
- **`st.subjects` 换取材口径**:改前它是"本轮造出来的全部条目"(因为整表覆盖,二者恰好相等);
  现在改成 `(p.subjects || []).filter(s => !s.image)` —— **主体库里缺参考图的那些**。
  这与 `subject.generateImage` 的默认取材(`!s.image`)、发布门 G9、问题中心 `subjects-no-image`
  是同一个判据。带来的实际差别:项目里原有一位没生成过图的主体,现在会一起进 Step2 的提示词审核窗与
  Step3 的批量生图(用户在审核窗里可以取消勾选它)。精细模式本来的定义就是"分镜与生成之前的全部准备工作",
  把库里缺图的主体一并备齐与这句话一致;逐主体计费与"生得起一张才开跑"的预检一字未动。
- **Step1 结论文案**按命令回执报数:`本轮新增 N 位、已有 M 位;主体库共 T 位(a 角色 · b 场景 · c 道具)`。
  改前报的是"已识别 a 角色 · b 场景 · c 道具"——那个数是**这一轮提取到的**,而整表覆盖时它恰好也是库存;
  现在两者不再相等,故新增/已有/库存三个数都报出来,不让读者拿一个数当两个用。

`types` 形参一并去掉(`js/proj-upload.js` 里那个 `const types = {…}` 三键恒真,注释自己写着
"主体类型不再让用户勾选"):全量提取的口径现在由命令层持有,调用面不再传第二份类型表。

### 3.2 命令层与两端参数面

```js
// js/commands.js
if (!args.local && window.API && API.isReady()) {
  const model = args.model || (Store.state.settings || {}).defLLM || API.getConfig().model;
  …
} else {
  found = EpisodeUtil.extractSubjects(text, mode, types); // 离线 / local 强制:零 LLM 零计费
}
```

新建主体多一个字段默认 `model: getSettings().defImageModel || MODELS.image[0]` ——
这是从向导搬过来的**浏览器侧字段默认**,不属入库口径:同一行上面的 `prompt: EpisodeUtil.genPrompt(…)`
早就在读 `getSettings().tplImage`,两者同性质。CLI 侧 `newSubject` 不带 `model`,与改前一致
(`genSubjectImage` 的 `s.model || MODELS.image[0]` 兜底也一字未动)。

`js/cmd-registry.js` 登记两位并在 `desc` 里标明语境;`js/flow-tpl.js` 的 `ARG_SOURCE` 同步补取数出处——
那张表的键是"跨命令同名同义"的参数名,`local` 现在跨两条命令,故它那句从"强制按段落均分"
改写成"强制走本地零 LLM 路径(拆集按段落均分、提取主体按本地启发式,零计费);headless 不可用",
一句话同时覆盖两条命令的语义。漏登记会被 flow 套件既有那条"参数取数出处漏登记"当场点名。

`cli.js` 的拒绝落在 `execCtx` 之后、`POST` 之前:**零调用零计费**,与它上面那条 `no-script` 同位。

### 3.3 记账(`js/skills.js` SK-04)

W100 在自己的交接里写明了这一段该怎么动:

> 合并后若哪一处余量真被收掉,先改实现再改这段,不要只删字。

照此办:`解析向导` 这个锚点从「仍欠」段**移进「已落地」段**并写清收到哪去了,
仍欠段只剩生成与合成两步(W98 已核实否决,W100 订正过的 `G4/G5/G6 + failed-shots` 与
"G3 判审片均分、G7 判合规且不在 headless 七门内"逐字保留)。
"提取主体的回流只挂在命令层"这半**不再作为欠账**记:两端入库都在命令层之后,
它就是这条链的正确形状(端点只出候选不写回 state,入库口径归调用方,回流自然挂在入库那一步),
故改写成对现状的说明而不是删掉。

## 4. 断言与变异实测

| 层 | 新增 | 钉住什么 |
|---|---|---|
| `tests/unit.js` memory 套件 +2(29 → 31,全套 **465 → 467**) | 收口(源级) | `js/director.js` 里 `Commands.execute('project.extractSubjects'` 在、`p.subjects =` / `Store.uid('sub')` / `llmExtractSubjects` / `EpisodeUtil.extractSubjects` / `memFeedback`·`agentMemory` 一处不许有;`model`/`local` 两位在注册表里且**两端各自真读**(命令层 `!args.local` 短路与 `args.model ||` 优先级、CLI 的拒绝分支且拒绝不多发一次请求);向导入参与调用面同形(`types` 不许回来) |
| | 收口(行为面,浏览器真跑) | 向导跑完**只发这一条命令**、`model`/`mode`/`ui` 三位如实透传;同名同类的老主体连参考图一并留住(`x.png` 还在,即"不再整表覆盖");记忆桶恰好一条且 `fb`/`scope`/文案与命令层直跑逐字同源;Step1 文案报的是入库回执的三个数;Step3 只对缺参考图的主体调 `genSubjectImage` |
| `tests/cli.smoke.js` +1(**97 → 98**) | headless 真跑 | `exec project.extractSubjects --local` → `exit 2` + `blocked browser-only`(不静默忽略、零调用) |

新增的行为面用例是 `js/director.js` 的**第一条自动化断言**(此前该文件零测试),为它加了 `loadDirector()`
沙箱:命令层与入库口径真跑,只桩掉 DOM 与下游三个入口(`genSubjectImage`/`doSplit`/`openSubjectConfirm`)。
两处桩按真实契约建,不然测的就不是这段代码:`U.bgDock` 的 `close()` 必须触发 `onCancel`
(向导的进度定时器只在 `onCancel` 里 `clearInterval`,桩不触发就是把 unit 进程挂死),
`U.openModal` 必须走 `onMount` 再点「确认提示词」(Step2.5 是个 `Promise`,不点就永远不进 Step3)。

**变异实测**(逐个改完跑相应套件,验证后原样还原,`git diff` 为空):

| 变异 | 实测行为 | 转红 |
|---|---|---|
| 绕过命令表:向导恢复"自己提取 + 自己造条目 + 覆盖 `p.subjects`" | 老主体的参考图又被抹掉、回流一条不写 | unit 2(源级"不得直写主体库" + 行为面"只应发这一条命令",两条各自独立报) |
| 直接把 `js/director.js` 整份退回基线版 | 同上,且 `types` 形参回来 | unit 1 源级当场红;行为面那条因基线代码在 `types[kind]` 上抛 `TypeError` 而**把 runner 整个带崩**(异步 IIFE 里的抛错走未捕获拒绝)——这是变异态才有的形状,故上一行那个"只改写入路径"的变异才是本槽的主判据 |
| 摘掉 `cli.js` 的 `browser-only` 拒绝 | headless 收下 `--local` 后静默忽略:回执是 `ok/done` 且 `skipped:3`,即**真去调了 LLM 那条路**,`--local` 说的"零 LLM 零计费"半个字没兑现 | unit 1(源级)+ `cli.smoke` 1(冒烟 96 → 95,新增那条真跑用例把回执整串打出来) |
| 命令层不读 `args.local`(`if (window.API && API.isReady())`) | 向导重试的回退位失效,LLM 一直失败就一直失败 | unit 1(源级) |
| 向导不透传 `model` | 上传弹窗的模型选择器变成装饰 | unit 1(行为面) |
| 把 SK-04 的仍欠段退回旧措辞 | 余量已收却还记着欠账 | unit 2(W61 那条点名断言 + W100 那条门号断言) |

第二行值得单记:它说明"整份回退"这种粗变异在这里**不是有效判据**——它红得早、红得脏,
掩盖了"只把写入路径改回去"这种真会发生的回归。故源级那条把五个字面(直写/造条目/两处提取调用/回流)
逐个点名,而不是只查一句 `Commands.execute` 在不在。

## 5. 分集那一半:核实结论是**已经共用单源,不收**

任务里"写入主体/分集"是并列的,分集这一半查完的结论是**不动**,理由不是"改不动",是**已经不重复了**:

- 向导与命令层用的是**同一个执行核心** `EpisodeUtil.splitCore`(`js/proj-upload.js`),
  `project.splitEpisodes` 的 handler 也是调它;在飞守卫、旧分集进回收站、整表写回、
  拆集闭环回流(`memFeedback({ split: … })`)全在核心里,两条路吃的是同一份。
  与主体那边的区别是决定性的:主体是**两份入库实现**,分集是**一份实现两个入口**。
- 命令层在核心之外只多两道闸:`no-script` 与 `has-episodes` 需要 `overwrite` 授权。
  这两道 UI 侧都有对应物(`doSplit` 的覆盖确认弹窗 + 在飞拦截 toast),不是漏做。
- 真要把 `doSplitRun` 也改成 `Commands.execute('project.splitEpisodes', { overwrite: true })`,
  会卡在一处**语义差**:上传弹窗的「仅进行分集」按钮传的 `scriptText` 并**不写进 `p.script`**
  (`doSplit(p, scriptText, main)`,那一支没有 `p.script = scriptText` 那行),而命令按 `pid`
  从 `p.script` 取正文,收口后这个按钮会直接 `blocked no-script`。要么给命令加个 `text` 位
  (服务端 `/api/wf/split-episodes` 同样从 `p.script` 重读,两端又要分叉),
  要么让「仅进行分集」顺手把原文写进剧本板块——**后者会翻转发布门 G1(有剧本)的结论**,
  本槽明写不抬发布门,故两条都不走。

这处"仅进行分集不落剧本板块"本身是个断点(分集正文有了、剧本板块仍空,`Domain.workflow`
会一直报缺剧本),但它是**主线贯通**的题,不是入库口径的题,留给下一槽,判据见第 7 节交接。

## 6. 回归数字

| 套件 | 本槽 | 基线(`w104`,同机取) |
|---|---|---|
| `node tests/unit.js` | **467 / 467** | 465 / 465(净 +2) |
| `node tests/integration.js` | **130 / 130** | 130 / 130(本槽不碰 server.js 逻辑,仅一处注释) |
| `node tests/cli.smoke.js` | **96 / 98** | 95 / 97(净 +1) |

`cli.smoke` 那 2 项失败(`未登录 whoami → exit 3`、`llm --json mock 链路`)与 W61 以来逐槽相同,
本槽在同一工作树上前后各跑一次,失败项逐条同名同现象,与本槽无关。

`node --check` 过:`js/director.js`、`js/proj-upload.js`、`js/commands.js`、`js/cmd-registry.js`、
`js/flow-tpl.js`、`js/skills.js`、`cli.js`、`server.js`、`tests/unit.js`、`tests/cli.smoke.js`。
文档同步:`README.md`(命令表 `project.extractSubjects` 条目补两位与"向导亦经本命令"、
`/api/wf/extract-subjects` 行的"入库口径归调用方"改写成两端都在命令层、unit/冒烟两个数、
memory 与冒烟两处覆盖面描述)、`server.js` 端点注释同句、本目录 README 的索引行与回流面那段摘要。

## 7. 交接

1. **SK-04 的仍欠段现只剩生成与合成两步**,且那一处 W98 已核实否决(判据是"回流条目有没有读者",
   不是"抽不抽得出数字")。要动它先读 W98,别把"实时已判的计数"再抄一份进记忆桶。
2. **浏览器现在只有一条主体入库路径**。再有新入口要往 `p.subjects` 写(如批量导入、跨项目复制),
   请走 `Commands.execute('project.extractSubjects')` 或另登记命令,不要就地拼条目——
   源级那条断言只钉着 `js/director.js` 一个文件,**别的文件新长出直写不会被它报出来**。
   要扩就把那条断言的文件名做成清单(与 G-13 的全仓持有者名单同形)。
3. **`model`/`local` 是浏览器语境位,CLI 如实拒绝**。若哪天服务端要开放调用方指定模型,
   那是计费与模型策略的题(现在服务端定死 `st.defLLM || 'qwen-turbo'`),
   改之前先想清楚"用户能不能通过挑模型改变单次成本"。
4. **`local` 现在跨两条命令同义**(拆集按段落均分 / 提取按本地启发式,都是"强制本地、零 LLM、零计费")。
   `ARG_SOURCE` 是按参数名而非按命令登记的,第三条命令若给 `local` 赋别的意思,那张表就得改成按命令分键。
5. **「仅进行分集」不把原文落进剧本板块**(第 5 节末),这是主线上一个真断点:
   拆出来的分集正文有了,项目剧本仍空,`Domain.workflow` 与发布门 G1 都会一直报缺剧本。
   接它要么让那一支写 `p.script`(会翻转 G1 结论,属产品口径,需明示),
   要么给拆集命令加正文入参(两端都要跟,服务端现从 `p.script` 重读)。
6. **未合并 W102–W107**。本槽叉自 `w104` 且只碰上表那几个文件,与那几支若有重叠,
   冲突面预计在 `js/skills.js` 的 SK-04 `note`、`README.md` 的两个测试数与 `tests/unit.js`
   memory 套件尾部——`note` 与数字两侧都会是各自分支上的旧实况,正确值只能由合入后 live 实测给出
   (同 W55/W57/W104 的解法);`note` 若按段取并集,**「仍欠」段里不许把 `解析向导` 留回去**
   (那条余量已收,留回去就是假欠账,现有两条断言正反各钉一次)。
