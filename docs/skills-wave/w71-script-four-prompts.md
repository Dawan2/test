# W71 · 剧本板块四步内联人设收编:旁白解说体改写 / 剧本围读 / 构思导演阐述 / 全剧光影总控进注册表

> 基线 `cursor/w67-integration-a5c1 @ cbb2b24`,落地分支 `cursor/w71-script-four-prompts-b3d2`。未合并 W65–W70。
> 收编的是 G-13 欠段里的**四处**:`js/episodes.js` 四步 LLM 的系统人设句。
> `js/wf-core.js` / `js/episode-util.js` / `server.js` / `cli.js` / `mcp.js` 一行未碰,不抬发布门(`js/release.js` 未碰)、不新增计费动作、未删测。

## 1. 现场:四步都是浏览器里写死的人设,用户改不到

W66 给 SK-10 的仍欠段点了名、W69 交接件第 11 条又抄了一遍的那几处,在本槽基线上逐处核过仍是内联字面:

| 步 | 位置(基线行号) | 内联字面 |
|---|---|---|
| 旁白解说体改写(剧本页「🎙 改写为旁白型」,2 积分) | `js/episodes.js:467` | `你是资深短剧解说编剧,擅长把短剧剧本改写成旁白解说体(解说模式)。` |
| 剧本围读(剧本页「🔍 发起剧本围读」) | `js/episodes.js:1180` | `你是短剧导演组的剧本围读会,由编剧/导演/制片联合评审。` |
| 构思导演阐述(构思页「✨ AI 生成构思」,1 积分) | `js/episodes.js:619` | `你是资深短剧/漫剧导演,在项目开拍前做导演阐述(Director Treatment)。` |
| 全剧光影总控(制片页「✨ AI 生成全剧光影总控」) | `js/episodes.js:989` | `你是影视摄影指导(DP),负责全剧光影总控。` |

改完都是同一形状:

```js
system: Prompts.get('narration.system'),
```

`js/prompts.js` 在 `index.html` 里排第 21 行、`js/episodes.js` 排第 35 行,取值口用的就是浏览器已有的全局 `Prompts`,不新增加载项。四条 `def` 与上表字面**逐字节相同**(用例把这四条各钉一遍,另跑过一次与基线 `git show HEAD:js/episodes.js` 抽出的原串对比)。

`js/episodes.js` 里第五处 `system: '你是短剧剧本结构分析师。'`(事件图谱拆解步)**有意不收**:本槽口径是这四步,那一处连同 `js/episode-util.js` 的三处策划人设一起,成为 SK-10 新的仍欠锚点(§5)。

## 2. 四个键,不是一个:合成即失真

W56 立的复用判据(字面同 / 角色同 / 产物落点同)对这四步两两都不成立——四步的角色分别是**解说编剧 / 导演组围读会 / 开拍前定调导演 / 摄影指导**,产物分别落在 `ep.narrationContent`(旁白稿全文)、`p.scriptReadings[]`(围读评审记录)、`p.concept`(19 个定调字段)、`ps.lightCtl`(按场景的主色 + 布光要点)。所以是四条独立键:

```js
/* 剧本/前期板块四步人设:四步角色互不相同(解说编剧 / 导演组围读会 / 开拍前定调导演 / 摄影指导),
 * 故四条独立键,不合成带变量的一个键;展示顺序按产品流程——剧本页(旁白改写→围读)→ 开拍前定调 → 制片光影。
 * 同样只收人设句:返回 JSON 字段契约与正文摘取仍由各步 user 半拼,不开放覆盖(改坏即整轮解析失败)。 */
{ key: 'narration.system', name: '旁白解说体改写 · 系统人设', vars: [], def: '你是资深短剧解说编剧,…' },
{ key: 'reading.system',   name: '剧本围读 · 系统人设',       vars: [], def: '你是短剧导演组的剧本围读会,…' },
{ key: 'concept.system',   name: '构思导演阐述 · 系统人设',   vars: [], def: '你是资深短剧/漫剧导演,…' },
{ key: 'light.system',     name: '全剧光影总控 · 系统人设',   vars: [], def: '你是影视摄影指导(DP),…' },
```

- **命名**:`<步>.system`,与注册表里占多数的那一族(`split.system` / `extract.system` / `und.system` / `review.system`)同形;前缀取步名而不是文件名(`episodes.*`),因为这四步分散在剧本页 / 构思页 / 制片页三个 tab 上,`episodes` 只是它们碰巧同住一个文件。
- **不与既有导演类人设复用**:`und.system` 的 `def` 是 `你是资深短剧导演。`、`sb.reviewSystem` 是 `你是资深影视审片专家组。`、`gsettings.js` 里另有一处 `你是资深影视导演。`——字面各不相同,谈不上复用;`concept.system` 若并进 `und.system`,改一次会同时改掉"开拍前定调"与"逐集理解"两条链路。用例把"四条与既有四个键都不同字面"钉住。
- **展示顺序按产品流程**:注册表顺序就是「全局默认值 → 核心提示词 skill」的排列,取 剧本页两步(旁白改写 → 围读)→ 开拍前定调 → 制片光影,而不是源文件里的行号顺序(那个顺序是 467/619/989/1180,把制片的光影塞在剧本围读之前,读起来断)。这一条也有断言,免得后续槽随手插到别处静默改掉页面排列。
- **`vars` 为空**:四步都不做变量替换,正文由各自 user 半现拼。

## 3. 只收人设句:四份 JSON 契约留在 user 半不开放

与 `agent.system` 同口径。四步的 user 半各自带一份返回契约(`{"narration":…}` / `{"overall":…,"issues":[…]}` / 19 键定调对象 / `{"scenes":[{…}]}`),以及正文摘取口径(`slice(0, 8000)` / `6000` / `5000` / 场景氛围 2000 字)。这些**不做成可覆盖变量**:用户把字段名改一个字,那一轮就是"LLM 返回结构不完整"整轮失败,而不是"提示词效果差一点"。

用例正查这一点:注册表里不得出现 `"narration"` / `"statement"` / `"scenes"` / `"overall"` 四个字段名。

## 4. 取值口:四处都在浏览器,不存在第二端

四步都是纯浏览器链路(剧本页 / 构思页 / 制片页 → `API.chatJSON`),`server.js` / `cli.js` 里没有对端。所以:

- 取值口只有 `Prompts.get('<key>')` 四处,浏览器隐式读 `Store.state.settings.promptOverrides`(与 `agent.panelSystem` 那三条同形)。
- 断言写成**不许长出第二端**:`server.js` / `cli.js` 里不得出现四步的 user 半锚点(`把以下短剧单集剧本改写为旁白解说体剧本` 等四句),否则就是有人在服务端另拼了一份。
- 收编解决的是"**可覆盖**",不解决"可 headless"——这一点如实写进 README、SK-03 的 `note` 与本件,不含糊成"这四步已双端单源"。

四步都没有 `Views.projectDetail` 之外的入口(handler 挂在 DOM 按钮的闭包里),所以本槽的行为面**没有沙箱真跑那一层**,与 W69 的 `Persona.rewritePrompt` 不同;能钉的两件事——缺省逐字节 + 覆盖只换对应键——落在注册表取值行为上,取值口与步的配对由源级断言逐步锚定(§6 第 1 条)。这与 `split.system` / `review.sumSystem` 两槽的做法同形,不是本槽偷工。

## 5. 记账:键登记在 SK-03,SK-10 的 `note` 按实况改写

**键登记落在 SK-03(`core.personaCtx`)**:契约测试要求注册表每个 key 都被某条 skill 的 `prompts` 引用,而这四步不属于任何一条 skill 自己的登记面(SK-10 的登记面是剧本板块的方法论通道,不是这四步)。SK-03 是人设通道的记账宿主,且已经收着三条**只有浏览器一个消费点**的键(`agent.panelSystem` / `agent.drawerSystem` / `agent.previsSystem`),它的 `note` 末段本来就写着"两端只落在取值口…不是两个消费点"——这四条正好同口径,挂在这里不需要给它编第二套说法。SK-03 的 `note` 因此在"已落地"那半追加一句,`仍欠` 段一字未动(那一段说的是四处装配口的 ops 协议半有意不开放覆盖,与本槽无关,`facts` 表钉的两个锚点 `ops 协议` / `不开放覆盖` 仍在)。

**SK-10(`script.aiToneBan`)的 `note`** 原本末尾挂着 `人设句入注册表待 G-13`。这句话有两层不实:

1. SK-10 **根本没有专属人设句**——它的注入面走板块方法论通道(条目正文 `文案AI味` 进 KB 单源,落点是 `js/agent.js` 的 `BOARD_KB.剧本` 按键整条注入),W27 记账件当时就写明了这一点,但这句 `note` 一直读起来像"SK-10 有一句人设待收编"。
2. 它当年指向的那几处(W66 把锚点具体化成 `js/episodes.js` 四步)已被本槽收掉。

改成:

```js
+ '本条注入走板块方法论通道、没有专属人设句;剧本板块那四步内联人设已收进注册表——'
+ '旁白解说体改写 narration.system/剧本围读 reading.system/构思导演阐述 concept.system/全剧光影总控 light.system,'
+ '四步在 js/episodes.js 同经 Prompts.get 取值、用户在「全局默认值」页改得到(键登记在 SK-03 名下)。'
+ '仍欠 G-13 的是剧本板块另外几处内联人设:js/episodes.js 的事件图谱拆解步(剧本结构分析师)与 '
+ 'js/episode-util.js 剧本摘要的通读/汇总/集纲三步(策划人设)仍是内联字面,那几步既取不到条目正文、用户也覆盖不到'
```

**仍欠段的锚点先核过再写**,判据同 W66:只写"这一刻真的还在、且属剧本板块"的那几处。

| 新锚点 | 本槽实测 |
|---|---|
| `js/episodes.js` 事件图谱拆解步 | `system: '你是短剧剧本结构分析师。'` 仍是内联字面,注册表里没有同 `def` |
| `js/episode-util.js` 剧本摘要通读 / 汇总 / 集纲三步 | `system: '你是资深短剧策划。'` 恰好 3 处(第 4 步人物小传已随 W56 收编),注册表里没有同 `def` |

两个锚点各配一条源级断言:那几处被收编而 `note` 没跟着改,当场红。

**`gaps` 一字未动**:`G-13` 治的是"大量模块内联提示词未进注册表",本槽收四处、缺口没闭合。按 W36 立的关联索引口径(落地一面不摘标记),`Skills.gaps()` 的键数(20)与 `G-13` 的六条值(`script.hookType,script.aiToneBan,subjects.refDiscipline,eps.structureStage,gen.videoTpl,film.rhythmInject`)逐字节不变,并有断言钉住。

**没顺手动的**:SK-11 的 `note`(那处 `人设句入注册表待 G-13` 是 W66/W69 的口径面,本槽基线上还是旧文本,不在本槽口径内)、`js/persona.js` 的配音导演两处与文生图那处、`js/sb-board.js` 两处,以及其余条目的记账。

## 6. 「四步仍内联」反向断言:本槽基线上没有,故是新增而不是反转

任务口径是"若有『四步仍内联』反向断言,反转并收严"。先查了一遍:本槽基线 `cbb2b24` 未合 W66 / W69,`tests/unit.js` 里与这四步相关的断言**一条也没有**(grep `解说体` / `围读` / `光影总控` / `导演阐述` / `旁白改写` 零命中)。所以本槽做的是**直接立正向那一侧**,并按 W69 §5 的收严口径把第二条写成全仓名单:

| 原本该被反转的判据(W66 §4 / W69 §6 里那两条) | 本槽落地的形态 |
|---|---|
| `js/episodes.js` 四步仍是内联字面 | 四步各自 `Prompts.get('<键>')` 取值,且键与该步 user 半锚点**配对**(四个键互换位置即红) |
| 注册表里没有哪条 `def` 是这四句话 | **全仓** `js/*.js` + `server.js` + `cli.js` + `mcp.js` + `index.html` 里含这四句字面的文件**恰好只有** `js/prompts.js` |

收严的地方与 W69 同:不是只查 `js/episodes.js` 干净了,而是把全仓扫一遍列出持有者名单再逐字节比对——将来谁在别的文件里抄第二份(哪怕原文件仍走注册表)也当场红。

**W66 / W69 若先合入**,它们各自的仍欠段与源级断言(SK-11 的仍欠段指向"`js/episodes.js` 那四步仍内联"、W66 §4 表里 SK-10 那一行、W69 §7 第二条用例的第 ⑥ 项)与本槽实况相反:**取本槽这一侧**,把那些判据按上表反转,不要两条并存。判据不是"谁的分支新",是源码实况——那四行现在都不是内联字面了。W69 自己的变异 6(「反向:把 `js/episodes.js` 解说体那步收编」应转红)就是这一向的守卫,它转红说明的正是"该同步改记账",不是"本槽做错了"。

## 7. 用例改动(新增 2 条,未删测、未改既有断言)

两条都落在 `contract` 套件,紧跟剧本摘要人物小传步那两条(同为"收编内联人设"的行为面 + 源级配对):

| 用例 | 钉住的事 |
|---|---|
| **新增** 行为面 `剧本板块四步人设:四个独立键各自取值,缺省逐字节等于收编前的内联字面、覆盖只换对应那一键` | ① 四条缺省 `Prompts.get` 逐字节等于收编前的四份内联字面;② 四条各自在注册表登记(无变量、条目名带步名与「系统人设」);③ 每句字面**恰好命中注册表一条**(同 `def` 开两个键即红);④ 四句措辞互不相同,且与 `und.system`/`sb.reviewSystem`/`extract.system`/`split.system` 都不同字面(**合成单键当场红**:合掉之后其中三条 `Prompts.get` 回空串);⑤ 覆盖矩阵 4×4——写一条覆盖时那一条跟随、另三条逐字节不动(串台即红);⑥ 四条键的注册顺序按产品流程排列(后续槽插到别处即红);⑦ 四份返回 JSON 字段名一个不进注册表 |
| **新增** 源级 `剧本板块四步人设(源级):js/episodes.js 四步零内联、逐步配对取值口,SK-10 记账随实况改写` | ① 四处取值口与各步 user 半锚点**配对**(`system: Prompts.get('<键>'),` 后 600 字内出现该步锚点句);② 全仓四句字面的持有者名单**恰好只有** `js/prompts.js`(§6 的收严);③ `server.js`/`cli.js` 不得出现四步的 user 半(不许长出第二端);④ SK-03 登记四个键;⑤ SK-10 的 `note` 不得再写「人设句入注册表待 G-13」、须写明本条没有专属人设句、须点名四个已收编的键;⑥ 仍欠段(只认 `仍欠` 之后那段)点名 `js/episodes.js` 与 `js/episode-util.js`,并逐处对照那两个锚点此刻确实还内联、注册表里没有同 `def`;⑦ `G-13` 标记仍在、`gaps()` 键数 20 且 `G-13` 六条值逐字节固定;⑧ `Skills.validate({ Prompts })` 通过(新键漏登记即红) |

第 ⑤/⑥ 项的判据照抄 W39 立的口径:点名断言只认「仍欠」之后那段——锚点写在"已落地"那半里不算交账,否则余量补完了 `note` 也能蒙过去。

行为面这一条**没有沙箱真跑**,原因见 §4(四步的 handler 都在 `Views.projectDetail` 的 DOM 闭包里,没有可直调的模块出口);缺省与覆盖两件事落在注册表取值上,取值口落在哪一步由源级断言的配对正则锚住,两条合起来覆盖的面与"真跑一遍截获 system"等价。

## 8. 变异实测

八条变异逐一施加、跑 `node tests/unit.js contract` 后复原(复原后 58/58):

| 变异 | 实测行为 | 转红(逐条实测) |
|---|---|---|
| 1 `js/episodes.js` 解说体那步改回内联字面 | 收编退回收编之前 | 1 条(源级:配对断言找不到该键的取值口) |
| 2 四条键**合成单键**(只留 `narration.system`,四步都取它) | 四步角色定位失真,改一次改掉四条链路 | 4 条(引用键单源 + 行为面 + 源级 + README 提示词数对账) |
| 3 注册表 `def` 改一个字(光影那条句号→叹号) | 缺省不再逐字节相同 | 1 条(行为面) |
| 4 取值口改成 `Prompts.get(key, {})`(不读覆盖表) | 进表了但用户改不到 | 1 条(源级) |
| 5 摘掉 SK-03 的四个键登记 | 新键不进索引、记账对不上账 | 2 条(四类单源键全覆盖 + 源级) |
| 6 **反向**:把 `js/episode-util.js` 三处策划人设收编 | 仍欠段点名的余量已消失而 `note` 还写着欠 | 2 条(W56 那条行为面 + 源级的锚点计数) |
| 7 SK-10 的 `note` 写回「人设句入注册表待 G-13」 | 记账退回收编之前 | 1 条(源级) |
| 8 在 `js/beatboard.js` 里抄一份光影那句字面 | 别处多出第二份人设句(原文件仍走注册表) | 1 条(源级的全仓持有者名单) |

几处值得说明的:

- 变异 2 的具体表现:合成之后 `Prompts.get('reading.system')` 等三条回空串,行为面第 ① 项当场红;`Skills.validate` 因为 SK-03 还登记着不存在的键而红;`README` 的提示词条数从 18 掉到 15,数字对账跟着红——一处失守四处都拦得住。
- 变异 1 与变异 4 只红源级那一条是**有意的**:注册表本身没被动过,行为面(缺省字面 + 覆盖矩阵)照样绿,能拦住"取值口写法退化"的只有源级断言;反过来变异 3 只红行为面,因为源码写法没变。两条用例的覆盖面是互补而不是重叠。
- 变异 8 是 §6 那处收严的正面验证:`js/episodes.js` 干净了不等于全仓只剩一份,持有者名单逐字节比对才拦得住第二份。

## 9. 复核方式

```
git checkout cursor/w71-script-four-prompts-b3d2
node --check js/prompts.js js/episodes.js js/skills.js tests/unit.js   # 通过
node tests/unit.js          # 411/411 PASS(基线 409,新增 2 条用例)
node tests/unit.js contract # 58/58 PASS(基线 56)
node tests/unit.js skills   # 93/93 PASS(与基线同:本槽未动 skills 套件)
node tests/integration.js   # 118/118 PASS(与基线同:本槽未碰 server.js 与任何端点)
node tests/cli.smoke.js     # 88/90;两处失败「未登录 whoami」「llm --json mock 链路」与 master 同名(基线同名同数)
node -e "const P=require('./js/prompts.js'),S=require('./js/skills.js');
console.log(P.list().length);
['narration.system','reading.system','concept.system','light.system'].forEach(k=>console.log(k, JSON.stringify(P.get(k))));
console.log(Object.keys(S.gaps()).length, S.gaps()['G-13'].join(','));"
# 18
# narration.system "你是资深短剧解说编剧,擅长把短剧剧本改写成旁白解说体(解说模式)。"
# reading.system   "你是短剧导演组的剧本围读会,由编剧/导演/制片联合评审。"
# concept.system   "你是资深短剧/漫剧导演,在项目开拍前做导演阐述(Director Treatment)。"
# light.system     "你是影视摄影指导(DP),负责全剧光影总控。"
# 20 script.hookType,script.aiToneBan,subjects.refDiscipline,eps.structureStage,gen.videoTpl,film.rhythmInject
```

`node tests/e2e.js` 按仓库纪律未跑(需用户明确要求)。本槽不含合并、未开 PR。

## 10. 与并行分支的关系

W65–W70 未合并。改动面:`js/prompts.js`(+4 条注册)、`js/episodes.js`(4 行)、`js/skills.js`(SK-03 的 `prompts` 与 `note` 一句、SK-10 的 `note` 末段)、`tests/unit.js`(+2 条用例)、`README.md`(三处数字/描述)、`docs/skills-wave/README.md`(条数 + 索引行)。

- **与 W66 / W69 同改 SK-10 / SK-11 的 `note`**(最可能的冲突点):见 §6 的取侧判据——SK-10 取本槽这一侧(四步已收);SK-11 那条本槽一字未碰,取 W69 侧(它把 `js/persona.js` 文生图那处收掉了,`prompts` 登记 `['extract.system','persona.promptSystem']`),但它的**仍欠段**要按本槽实况改写,因为它指的正是本槽收掉的那四步。合入后 SK-11 的仍欠锚点候选:`js/persona.js` 配音导演两处、`js/sb-board.js` 两处、`js/episode-util.js` 三处策划人设——现场核一遍还在不在再写,别照抄。
- **`js/prompts.js`**:本槽在 `split.system` 与 `extract.system` 之间插四条,W69 在 `extract.system` 之后插一条,两块位置不同、都留;`README` 的条数按合入后 `Prompts.list().length` 现取重算(`contract` 的数字对账会先红,W69+W71 合入后应为 19)。
- **`js/skills.js` 的 SK-03**:本槽在"已落地"那半末尾追加一句、`仍欠` 段未动;若并行槽也动这条,按段取并集,`facts` 表钉的 `ops 协议` / `不开放覆盖` 两个锚点必须留在 `仍欠` 段里。
- **`tests/unit.js`**:本槽新增两条在 `contract` 套件、紧跟人物小传步那两条;W69 也插在同一处,合并时两侧的四条用例都留(名字不重),然后按 §6 反转 W69 第 ⑥ 项那半个断言。
- **`README.md` / `docs/skills-wave/README.md`**:数字(注册表提示词、单测数、索引行)一律按合入后实跑重算,不要照抄任一侧。

## 11. 交接

1. **G-13 仍欠**,缺口开着:本槽收四处,全仓内联人设(`system: '你是…` 字面计数)由 **21 处减为 17 处**——`js/episodes.js` 余 1 处(事件图谱拆解的剧本结构分析师)、`js/episode-util.js` 3 处策划人设(剧本摘要通读 / 汇总 / 集纲,角色同字面同,按 W56 三条判据大概率复用同一个键)、`js/persona.js` 3 处(文生图提示词专家 1 处 + 配音导演 2 处,后两处同字面)、`js/sb-board.js` 2 处(场次节拍拆解 / 文字分镜),以及 `js/beatboard.js` / `js/proj-shell.js` / `js/proj-upload.js` / `js/editors.js` / `js/gsettings.js` / `js/agent-ops.js` / `js/experts.js` / `js/sb-views.js` 各 1 处。(W69 若已合入,`js/persona.js` 那 3 处只剩 2 处,总数 16。)
2. **下一处最省事的是 `js/episode-util.js` 那三处**:同字面同角色(资深短剧策划)、同在剧本摘要一条链路上,按 W56 判据大概率是**一个键三个取用口**,且那条链路已有沙箱加载器 `loadDigest` 与"四步 system 逐字节"的行为面用例,收编后那条用例的期望串直接从三份内联字面换成注册表取值即可——注意它现在钉的是"前三步仍是各自内联的策划人设",收编时要一并改。
3. **摘 G-13 标记的时机不变**:判据是"全仓再无内联人设",且要一次改齐六条关联索引的 `gaps` 与 `note`,不是谁的一半好了就摘谁。本槽不预支这个动作。
4. **再动 SK-10 的 `note` 前先核一遍 §5 那两个锚点还在不在**——仍欠段的源级断言就钉在那里,收编了不改记账当场红。
