# W45 · 主体提取的系统人设收编两端(`/api/wf/*` 五条工作流的 system 半全部可覆盖)

> 基线 `cursor/w42-split-system-prompt-d6ce @ 546cdc1`(W42 收编 `split.system` 后的头部),落地分支 `cursor/w45-extract-system-prompt-9acd`。
> 本槽做的是 W42 第 9 节交接第 1 条:把提取主体那句人设从 `wf-core` 常量收进 `js/prompts.js` 注册表,并让装配口开始收覆盖表参数。
> 不改发布门(`js/release.js` 一行未碰)、不新增计费动作(提取步仍按 `llm.extract` 原口径按次计费)、未删测(反转 2 条既有断言的方向、改写 1 条既有用例的取值口,新增 1 条用例)。

## 1. 缺的不是单源,是覆盖口

这一处与 W40 / W42 收编的两处**形态不同**:拆集与共性汇总是两端各写死一份字面量(双端分叉风险),而提取主体在 W6 就已经收成单源、W19 又在它后面接上了 KB 方法论块:

```js
// 基线 js/wf-core.js
W.EXTRACT_SYSTEM = '你是专业的短剧剧本分析助手。';        // W6 收口两端手抄时落的常量
W.extractSystem  = () => W.EXTRACT_SYSTEM + KB.pick('主体参考');  // W19 接上方法论块
```

两端都经 `WfCore.extractSystem()` 取值,**双端同源没有问题**;缺的是另一件事——这句人设不在 `Prompts` 注册表里,用户在「偏好学习 → 全局默认值 → 核心提示词 skill」改写人设时,主线上其余四条工作流跟随,主体提取这一步不跟随。W19 记账件第 7 节当时就把原因写清了:注册表里没有它的键,**装配口收覆盖表参数也没有键可取,给个假参数比不给更误导**,所以 `extractSystem` 一直是零参函数。

后果落在主线第二步上:主体库的名字与 `prompt` 形状决定了后面每一镜的参考图组怎么装(`将图片N定义为「名字」`),用户想让提取这一步换一套口径(例如"只认正式全称,别名一律并进 `aliases`"),改不到。

## 2. 结果一句话

注册表新增第 10 条 `extract.system`「主体提取 · 系统人设」,`def` 与原常量字面**逐字节相同**;`W.EXTRACT_SYSTEM` 常量撤掉,注册表 `def` 从此是该人设句的唯一来源;`W.extractSystem` 改签名收 `ov`,人设句换成 `Prompts.get`,方法论段仍是 `KB.pick('主体参考')` 整条注入、**不随人设覆盖变动**。**缺省行为零变化**(`extractSystem()` 仍是 292 字,与 W19 记录的数字相同),覆盖时两端一并跟随。

```js
// js/prompts.js(REG 里排在 split.system 之后:主体步紧随剧本步;既有条目的相对次序一字未动)
{ key: 'extract.system', name: '主体提取 · 系统人设', vars: [], def: '你是专业的短剧剧本分析助手。' },

// js/wf-core.js:与 sbSystem / genPromptSystem 同形态(人设句取注册表,方法论段按键取 KB)
W.extractSystem = ov => Prompts.get('extract.system', ov) + KB.pick('主体参考');

// js/episode-util.js:浏览器隐式读 Store.settings.promptOverrides(与 js/sb-llm.js 取 sbSystem() 同写法)
system: WfCore.extractSystem(),
// server.js:Node 无 window,覆盖表须显式传(与同文件 und.system 取值口同纪律)
system: WfCore.extractSystem(st.promptOverrides),
```

收完这一处,`/api/wf/*` 五条工作流(拆集 / 本集理解 / 智能分镜 / 智能审片 / 提取主体)的 system 半**全部在注册表内、全部可被用户覆盖**。SK-03 的仍欠段随之换成 Agent 单轮对话步(见第 5 节)。

`index.html` 里 `js/prompts.js`(第 21 行)早于 `js/wf-core.js`(第 24 行)加载,而 `wf-core` 的 UMD 工厂在装载时捕获 `root.Prompts`——这条加载序本就是 `sbSystem` / `genPromptSystem` 依赖的同一条,无需调整。

回归:`unit 356/356`(基线 355,新增 1 条用例)、`integration 93/93`、`cli.smoke 62/64`(两处失败与基线逐项相同,实测见第 7 节)。

改动:`js/prompts.js` +4、`js/wf-core.js` +5−7(常量撤掉、装配口收 `ov`、注释同步)、`js/episode-util.js` +1−1、`server.js` +1−1、`js/skills.js` +7−4(SK-03 的 `prompts` 与 `note`)、`tests/unit.js` +40−11、`README.md` +3−3、`docs/skills-wave/README.md` +1−1(提示词条数),外加本记账件与索引行/摘要句同步。

## 3. 为什么撤掉常量而不是留着当别名

留一个 `W.EXTRACT_SYSTEM = Prompts.get('extract.system')` 之类的别名会立刻破掉两条纪律:模块装载时求值,用户后来写的覆盖取不到;而写成函数别名就是给同一个键开第二个取用口,与"注册表 `def` 是唯一来源"直接冲突。`sb.system` / `gen.promptSystem` 两键都没有对应常量,`extract.system` 按同一形态办——常量撤掉,派生函数 `W.extractSystem` 保留(它有存在的理由:人设句之后要按键接一段 KB 正文,这正是 W42 第 3 节那条判据里"该包一层"的情形)。

因此本槽**不能**照 W40 / W42 的写法直接在两端 `Prompts.get('extract.system', ov)`:那样会把 `KB.pick('主体参考')` 从装配口里挤出去,变成两端各拼一次方法论块——W19 花一整槽收掉的正是这件事。

## 4. 缺省逐字节不变靠哪三层钉住

1. **注册表层**:`Prompts.get('extract.system')` 的返回值直接与字面 `'你是专业的短剧剧本分析助手。'` 比对——改 `def` 即红(变异 1)。
2. **装配口层**:`extractSystem()` 的整条返回值与 `人设句 + KB.pick('主体参考')` 比对,并保留 W19 立的三条对账(以注册表人设句开头、方法论段逐字节等于 `Skills.block('subjects')`、等于 `KB.section('主体参考')`)——把方法论段丢掉或换键即红(变异 8)。
3. **消费层**:浏览器必须出现 `WfCore.extractSystem()`、服务端必须出现 `WfCore.extractSystem(st.promptOverrides)`,两端都不得直取常量。单端退回内联时另一端仍跟随覆盖,两端就此分叉——这一对断言正是为了让分叉当场转红(变异 2、3)。

**人设句字面只剩注册表一份**这件事另配了三条断言,其中一条形态特殊:`js/wf-core.js` 与 `server.js` 一律不得出现该字面,而 `js/episode-util.js` 断言的是**出现次数恰好 1**——`aiScriptDigest` 的人物小传步有一处同字面内联(W19 第 7 节第 3 条已记,属另一条链路,本槽不动),写成"不得出现"会假红,写成"包含"则提取步退回内联时点不住,所以钉的是计数。

## 5. 记账:SK-03 的仍欠段换成 Agent 单轮对话步

`prompts` 补上新键(`Prompts` 全部 key 必须被 skill 索引引用是既有契约,漏登即红);`note` 里 W42 写的那句「仍欠:主体提取步的系统人设未收进提示词注册表」按实况改写,并补记「五条工作流的 system 半至此全部可被用户覆盖」。

仍欠段必须写实况。`/api/wf/*` 里还有第六个 LLM 端点:`/api/wf/agent` 的单轮对话。它的 system 半是 `WfCore.buildAgentSystem` 整段模板——**人设句与 ops 协议、命令白名单、返回 JSON 约定写在同一个模板串里**,注册表里没有它的键,该装配口只收 `ctx` 不收覆盖表;而浏览器工作台的多轮对话(`js/agent.js`)是另一份措辞(「短剧分镜编辑智能体」对「短剧制作智能体(服务端单轮模式)」),两端并非同一句话的两份拷贝。故它是 SK-03 口径内下一处该收的余量,`tests/unit.js` 的点名锚点同步换成 `Agent 单轮`。

| 条目 | 改成什么 | 剩余仍欠 |
|---|---|---|
| SK-03 `core.personaCtx` | `prompts` 补 `extract.system`;`note` 补「主体提取的人设句同形收编为 `extract.system`,装配口随之收覆盖表参数,五条工作流的 system 半至此全部可被用户覆盖」 | **Agent 单轮对话步的系统人设未收进提示词注册表**(人设句与 ops 协议同写在 `WfCore.buildAgentSystem` 一个模板串里,双端各一份措辞、用户覆盖不到,故该装配口只收 `ctx`) |

**仍欠的这一处配了点名断言**,形态沿用 W42 那条(查注册表与装配口签名,不查字面):`WfCore.buildAgentSystem({})` 必须仍以那句人设开头、`Prompts.list()` 里不得有任何条目的 `def` 出现在该 system 里、`WfCore.buildAgentSystem.length === 1`(只收 `ctx`)。谁把它收编了,这几条会先红(变异 7 实测)。`pending` / `gaps` 一字未动,`Skills.list()` 里带 `pending` 的仍是那四条(`SK-05` / `SK-24` / `SK-26` / `SK-29`)。

## 6. 用例改动(新增 1 条 + 改写 1 条 + 反转 2 条断言,未删测)与变异实测

| 用例 | 钉住的事 |
|---|---|
| **新增** `主体提取人设`(contract 套件,紧挨 W42 那条) | 缺省人设句字面 + 缺省整条(人设句 + 方法论块)逐字节 + 覆盖跟随 + 注册表条目形态(无变量、条目名含「主体提取」)+ 两端取值口字面(服务端必须显式传 `st.promptOverrides`)+ 人设句字面只剩注册表一份(`wf-core`/`server.js` 零处、`episode-util.js` 恰好 1 处)+ SK-03 已登记新键 + 仍欠那处属实 |
| **改写** `知识库取用:主体步人设整条注入主体参考正文`(W19 那条) | 三条对账的人设句由 `WfCore.EXTRACT_SYSTEM` 改取 `Prompts.get('extract.system', {})`,并补一条「覆盖只换人设句、方法论正文不受影响」——与 `sbSystem` 那条同形。两端取值口断言由字面 `extractSystem()` 放宽为 `extractSystem(` 以容下服务端的传参形态,「不得直取常量」那条一字未动 |
| **反转** `剧本拆集人设`(W42 那条的末段) | W42 留的红灯按设计触发:原断言要求「`EXTRACT_SYSTEM` 仍是常量字面」「`extractSystem` 零参」,收编后改为「常量应为 `undefined`」「应收 1 个覆盖表参数」 |
| **换锚点** 记账对齐(既有用例) | `core.personaCtx` 的点名锚点由 `主体提取` 换成 `Agent 单轮`(仍只认「仍欠」之后那段) |

八条变异逐一实测(每条单独施加、跑 `node tests/unit.js` 后 `git checkout` 复原,复原后 356/356):

| 变异 | 实测行为 | 转红 |
|---|---|---|
| 1 改 `def` 为「你是短剧剧本分析师。」 | 缺省提示词变了 | 1 条(新增那条的缺省字面断言) |
| 2 浏览器退回内联字面(自拼 KB 块) | 浏览器不跟随覆盖,两端分叉 | 2 条(W19 那条的两端取值口 + 新增那条的浏览器取值口) |
| 3 服务端 `extractSystem()` 不传覆盖表 | 服务端静默落回 `def`(Node 读不到 Store),覆盖只在浏览器生效 | 1 条 |
| 4 SK-03 仍欠段退回「主体提取」旧锚点 | 余量记账与实况不符(那处已收编) | 1 条(W39 收紧后的点名断言) |
| 5 SK-03 的 `prompts` 漏登新键 | 注册表新键脱离索引 | 2 条(既有的「`Prompts` 全部 key 应被 skill 索引引用」+ 新增那条) |
| 6 `README.md` 提示词条数不同步(10 → 9) | 文档数字失真 | 1 条(注册表口径对账那条;README 里「N 条注册表提示词」与「N 条主线 LLM 提示词」两处各由一条正则单独查) |
| 7 把仍欠那处顺手收编而不改 `note`(加 `agent.system` 键 + `buildAgentSystem` 收 `ov`) | 仍欠段点名的余量已不存在 | 3 条(既有的索引引用契约 + 新增那条的仍欠属实断言 + README 条数对账;`buildAgentSystem.length` 那条被同一用例里先抛的断言挡在后面,单独施加"只改签名"时它才是首红) |
| 8 装配口丢掉方法论段(只回人设句) | 主体步缺省提示词缩回 14 字,「主体参考」注入面失守 | 2 条(W19 那条的注入块对账 + 新增那条的缺省整条对账) |

## 7. 复核方式

```
git checkout cursor/w45-extract-system-prompt-9acd
node --check js/prompts.js js/wf-core.js js/episode-util.js js/skills.js server.js tests/unit.js   # 全部通过
node tests/unit.js            # 356/356 PASS
node tests/unit.js contract   # 49/49(含新增那条、改写后的 W19 那条与两处 README 数字对账)
node tests/unit.js skills     # 80/80,含换锚点后的记账对齐
node tests/integration.js     # 93/93 PASS(含提取主体端点三条:三类候选/不写回 state/项目不存在 404)
node tests/cli.smoke.js       # 62/64;两处失败「未登录 whoami」「llm --json mock 链路」在基线 546cdc1 上逐项相同(已实测对照)
node -e "const W=require('./js/wf-core.js'),KB=require('./js/knowledge.js');
console.log(W.extractSystem()==='你是专业的短剧剧本分析助手。'+KB.pick('主体参考'), W.extractSystem({'extract.system':'剧本分析助手。'}).slice(0,7), W.EXTRACT_SYSTEM)"
# true 剧本分析助手。 undefined(缺省逐字节不变;覆盖生效;常量已撤)
```

真实上游链路人工核验(临时 stub 上游截获请求体,`MV_CONFIG`/`MV_DATA_DIR`/`MV_UPLOADS_DIR` 指向临时目录,不碰仓库 `config.json` 与真实用户数据;不开 `MOCK_LLM`——要看的正是真实发出去的那份请求体):

- 未写覆盖时调 `/api/wf/extract-subjects`:上游收到的 `system` 为 `"你是专业的短剧剧本分析助手。" + KB「主体参考」`,**总长 292 字,与 W19 记录的数字相同**;`200`,三类候选各 1 条。
- 把 `settings.promptOverrides['extract.system']` 写成「你是主体提取员(覆盖生效)。」后再调:上游收到的 `system` 即该覆盖值 + 同一段方法论正文(**方法论段不随覆盖变动**),`user` 半仍是 `buildExtractUser` 单源模板(含「persona 为八维度人设」「每类最多 12 个主体」两行)且不含方法论正文,`200`。
- 两次调用各扣 2 分(`llm.extract` 原口径,余额 200 → 196),计费动作与笔数未变。

`node tests/e2e.js` 按仓库纪律未跑(需用户明确要求)。本槽不含合并、未开 PR。

## 8. 与并行分支的关系

同期 W43(SK-26)、W44(SK-05)在收剩余 `pending` 面,本槽只在 W42 头部之上加键、撤常量、换装配口签名,预计冲突面:

- `js/prompts.js`:本槽在 `REG` 第二位插入一条。若并行槽也加键,取**并集**;条目相对次序按各自的主线步位摆(注册表次序只影响「全局默认值」页的展示顺序,无行为面)。
- `js/wf-core.js`:动的是 `W.EXTRACT_SYSTEM` / `W.extractSystem` 那两行(常量撤掉、函数收 `ov`)。若并行槽引用了 `W.EXTRACT_SYSTEM`,合入后须改取 `Prompts.get('extract.system', ov)` 或整条经 `W.extractSystem(ov)`——常量已不存在,直接引用会拿到 `undefined`(源级断言「不得直取常量」会先红)。
- `js/skills.js`:只动 SK-03 的 `prompts` 数组与 `note` 字符串。`prompts` 取并集;`note` 的仍欠段以**实况**为准折回——谁把 `buildAgentSystem` 收编了,仍欠段与 `tests/unit.js` 的点名锚点要一并改(变异 7 会先红)。W43 / W44 动的是 SK-26 / SK-05 的 `pending`,与本槽条目无重叠,但「剩余 pending 应只剩 check 两条 + orchestrate 两条」那条断言的期望串会随它们变,合入时按实况重算。
- `README.md` / `docs/skills-wave/README.md`:提示词条数按合入后 `Prompts.list().length` 实计重算,单测用例数按实跑重算(`contract` 套件的数字对账会先红)。
- `js/episode-util.js` / `server.js`:各 1 行,落在提取步 `system` 字段上,与并行槽无重叠。

## 9. 交接

1. **Agent 单轮对话步的系统人设仍在模板串里**(SK-03 剩下的唯一仍欠,见第 5 节)。它与前三槽都不同形:要收编得先决定**切到哪一刀**——只把人设句抽成键(模板里留 `${Prompts.get(键, ov)}` 开头,ops 协议与命令白名单仍由 `wf-core` 拼,用户改人设改不动协议),还是把整段模板做成带变量的注册表条目(像 `sb.reviewUser` 那样收 `vars`,用户能改协议措辞但也能把 JSON 约定改坏)。前者风险小、后者覆盖面大,属产品口径题;顺带要决定浏览器多轮那份措辞(`js/agent.js`)算不算同一个键——两份措辞对应两种运行模式,合成一个键会让其中一端的语义失真。
2. **注册表之外的内联人设仍是大头**,且不在 SK-03 的 `covers` 口径内:浏览器侧的导演阐述、光影总控、剧本围读、拉片分析、配音导演、节拍拆解、发行文案,以及 `aiScriptDigest` 的分块通读 / 汇总 / 集纲 / 人物小传四步,各写一份 system 半,既不双端也不可覆盖(G-13,W1 盘点第 7 条已登记)。要不要收编是产品口径题——这些步没有服务端对端,收进注册表只解决"可覆盖"不解决"可 headless"。本槽不动。
3. 提取步的 `mockKind: 'extract'`、计费动作 `llm.extract`、`buildExtractUser` 的 user 模板(含 15000 字截断与 `truncated` 回报)、`normalizeExtracted` 的白名单 + 可信性校验 + 别名合并三段规整,一字未动。
