# W167 · 拆集的切分输入收进 `Domain.projectScript`:`extractDone` 老项目的拆集步改推补原文导航步

**范围**:`js/domain.js`(新增 `D.projectScript`,+6 行零删除)+ `js/commands.js`(拆集与提取主体两处取数口改读它,行为逐字节不变)+
`js/plans.js`(拆集取材器按同一份派生分两态)+ `tests/unit.js`(commands 1、plans 1、contract 1 共 +3,另改既有 1 条 plans 用例的一句断言)+
`README.md` 与本目录 `README.md` 同步。
**基线**:`cursor/w161-integration-4e7d`(`c5de21e`,开工现取核实相符:`unit 531/531` 是本槽落地后的数,基线上是 **528/528**)。
**不做**:不改 `Domain.gateBlockers` 的判据与产出形状(一个字未动,`extractDone` 仍算剧本步走过)、不新增门槛阻塞码、
**不让任何一道发布门去看 `p.script`**(G1 判据取 `episodeState` / `ep.content`,本槽根本没碰 `js/release.js`)、
不改流程条与问题中心的任何投影、不新增计费动作与领域命令、不从 `Skills.gaps()` 摘任何键、不合并其它并行槽。

## 1. 病灶:同一个项目上「剧本步走过没有」与「原文读不读得到」结论相反,而计划层据第一问推了第二问的命令

W147 把计划层的项目级前置三步改读 `Domain.gateBlockers`,顺带如实登记了它救不了的那一半(那份记账件 3. 节末尾),
W161 的收敛记录把它留在残留第 9 条:**`extractDone && !script` 的老项目走到 `project.splitEpisodes` 仍回 `blocked / no-script`。**

两问在基线上的分布:

| 问 | 判据写在哪 | `extractDone && !script` 的老项目 |
|---|---|---|
| 剧本这一步走过没有(进度) | `Domain.gateBlockers`:`p.script \|\| p.extractDone` | **走过了**(流程条画 ✓,不报 `no-script`) |
| 整本原文读不读得到(输入) | `js/commands.js` 拆集入口:`String(p.script \|\| '').trim()` | **读不到**(`blocked / no-script`) |

两句都对——它们问的本就不是同一件事。出事的是**中间那一层**:计划层只看得见第一问,于是推出一条只能失败的命令步。
基线上现跑(Node `vm` 加载真实源码,项目对象 `{ id:'p1', extractDone:true, subjects:[主角(有图)], episodes:[] }`):

| | 基线 `c5de21e` | 本槽 |
|---|---|---|
| `Domain.gateBlockers(p)` 出的码 | `no-eps`(不报 `no-script`) | 同(**一个字未改**) |
| `Plans.fromWorkflow(p)` 的那一步 | `cmd: project.splitEpisodes`,`剧本拆集:整本切成分集` | `goto: #/project/p1`,`补上剧本原文:拆集要按整本原文切分,项目里只留了提取结论` |
| 点下去会怎样 | `Commands.execute` 回 `blocked / no-script`,`execStep` 记成 `failed`,尾注「项目暂无剧本原文,请先上传剧本」 | 到项目页补原文;补完再重建计划,这一步就变回可执行的拆集命令步 |
| 拆集命令本身 | `blocked / no-script` | 同(**仍然拒绝**,见 3. 节) |

## 2. 先回答那个前提问题:提取产物能不能当拆集输入 —— 不能

任务把「拆集命令在 `extractDone` 时有可读入的提取产物则继续」列为首选落法,前提是那份产物真能当切分输入。
逐项现取源码核实,**这个前提在拆集步真正出现的那一态上不成立**:

| 候选输入 | 在库吗 | 能不能当拆集输入 |
|---|---|---|
| `p.script` | **不在**(这一类老项目的定义就是它没了) | — |
| `p.subjects`(提取产物本体) | 在 | **不能**:角色/场景/道具的名字与提示词,不是剧情正文 |
| `p.scriptMeta`(卖点/梗概/大纲) | 可能在 | **不能**:`synopsis` 上限 ≤220 字、`outline` 4–6 句,拿它切分等于凭摘要编正文——`splitCore` 的算法(`WfCore.splitMode` → `splitByAnchors`/`localSplitEpisodes`)全是**正文逐字保留**的切分,没有"生成正文"这一路 |
| `p.episodes[].content`(`project.extractSubjects` 用的那条回退) | **不在** | 拆集步只在 `gates['no-eps']` 在场时才出——**无分集正是它出场的条件**,这条回退在这一态上恒为空 |
| `p.epOutline` / `p.scriptReadings` / `p.eventGraph` | 需先有分集或原文 | 同上,且都是派生件不是原文 |

再核一遍原文的落点:全仓写 `p.script` 的只有 `js/proj-upload.js`(上传弹窗「解析剧本」与拆集成功后的回填)、
`js/episodes.js`(剧本板块)与 CLI 的 `project-script`,**没有第二处存过整本原文的副本**。
所以首选落法只能靠"拿摘要当原文"来实现,那是把假话从计划层挪到命令层。**本槽不做它**,并把这个结论钉成判据(4. 节用例 3、5. 节 M3)。

落地的是任务列的第二条:计划层在无原文时不推该命令,改推补原文的动作。**它不是"静默避开"**——
W147 反对的是"计划层提前把这一步筛掉,用户点「按主线生成」只看到没有这一步"。这里这一步照出、位置照旧(仍是 `key: 'split'`)、
计划步数不变,换掉的只是**动作**:从一条注定失败的命令换成真正能解开它的那件事。

## 3. 落法:第二问的判据收进 `Domain.projectScript`,命令层与计划层同读一份

```js
/* js/domain.js */
D.projectScript = p => String((p && p.script) || '').trim();

/* js/commands.js —— 行为逐字节不变,只是取数口换成派生 */
const text = Domain.projectScript(p);
if (!text) return blocked('no-script', '项目暂无剧本原文,请先上传剧本');

/* js/plans.js */
'project.splitEpisodes': ({ p, gates }) => {
  if (gates['no-script'] || !gates['no-eps']) return null;
  return Domain.projectScript(p)
    ? { key: 'split', label: '剧本拆集:整本切成分集' }
    : { key: 'split', label: '补上剧本原文:拆集要按整本原文切分,项目里只留了提取结论', goto: '#/project/' + p.id };
},
```

四处细节各有理由:

1. **收的是第二问,不是把两问抹平**。`gateBlockers` 一个字未动:`extractDone` 照旧算剧本步走过,
   流程条与问题中心的产出逐字节不变(它们要的确实是进度那一问)。要抹平就得改门槛,那会连带改动
   流程条画的 ✓ 与问题中心的低危条目,是另一件事,而且未必对。
2. **不是第四份门槛拷贝**。计划层照旧按 `gates['no-script']` / `gates['no-eps']` 取材(五处按码取材一处不增不减,
   W147 立的那条 `恰 5 处` 契约原样绿),新读的这一份是**命令层入口条件的同一份派生**,不是重写的判据——
   命令层退回内联 `p.script`,契约用例与命令层的桩用例当场红(5. 节 M2)。
3. **导航步指向项目页**,与 `Domain.workflow` 剧本步的 `recommendedAction.hash` 同一个落点(`#/project/<id>`),
   不新造路由;「上传剧本」按钮就在那一页。
4. **`project.extractSubjects` 的首选输入一并改读同一份派生**(`Domain.projectScript(p) || 各集正文拼接`),
   逐字节等价、行为一格未变;这样"整本原文"这个概念在两条项目级命令上是同一个取数口。
   那条命令的**回退**没动,它与拆集在这一态上的分工照旧(见 7. 节交接 2)。

## 4. 加测(+3),另改既有 1 条

| # | 套件 · 用例 | 钉住什么 |
|---|---|---|
| 1 | `plans · fromWorkflow:拆集步按整本原文在不在分两态(缺原文出补原文导航步,不推注定 blocked 的命令步)` | 先断言两个前提(门槛派生**不报** `no-script`、`Domain.projectScript` **回空**),再断言:有原文 → 命令步且不带 `goto`;无原文 → 步数仍是 1、`key` 仍是 `split`、`cmd` 为 `undefined`、`goto` 是项目页、文案点名「剧本原文」;末了把派生打桩成"原文在库"而项目对象一字不改,这一步立刻变回命令步 |
| 2 | `commands · splitEpisodes:切分输入现取 Domain.projectScript(提取过主体的老项目仍 blocked no-script,提取结论不冒充原文)` | 同一个老项目上:门槛派生认剧本步已过,拆集**照旧 blocked `no-script`** 且不进 `splitCore`;把派生打桩成有原文则同一次调用真跑进 `splitCore`;桩撤掉后再断言这个项目仍然没有原文(用例自证没有偷偷写 `p.script`) |
| 3 | `contract · 拆集的切分输入单源:整本原文在不在只在 Domain.projectScript 一处,命令层与计划层同读` | 行为面:派生对 `{extractDone, subjects, scriptMeta}` 回空串(**提取结论不是原文**)、对 `'  整本  '` 回去空白后的原文;同一个老项目上门槛派生说走过、派生说读不到(两问结论不同是有意的)。源级:拆集命令体内 `p.script` 零命中且含 `Domain.projectScript(p)`;`js/plans.js` 含同一句(取命令体的切片自身也有断言兜底,切歪即红) |

改的那一条是 W147 立的 `plans · fromWorkflow:剧本这一步与流程条同口径(提取过主体的老项目不再一步都推不出来)`:
它的三句断言只有**一句**跟着行为改——步骤串从 `project.extractSubjects,project.splitEpisodes` 改为
`project.extractSubjects,goto:split`(取的是 `s.cmd || 'goto:' + s.key`,导航步也点得到名)。
它钉的语义(这类老项目不许一步都推不出来、两个面结论不许相反)一字未动,前提断言与反向那半也一字未动。**没有删测。**

## 5. 变异复核(四组,各红各的)

| # | 变异 | 结果 |
|---|---|---|
| M1 | 拆集取材器整体退回基线(不看原文,一律出命令步) | 红 **3**:plans 两态那条(报"注定 blocked/no-script 的命令不该挂上去")、W147 那条同口径用例、contract 源级那条 |
| M2 | 命令层退回内联 `String(p.script \|\| '').trim()` | 红 **2**:commands 桩那条(派生说有原文而命令仍 `no-script`)+ contract 的"拆集命令不得再自己读 `p.script`" |
| M3 | **假装打通**:把派生改成 `p.script \|\| (p.extractDone ? '(已提取)' : '')`——即拿提取事实冒充原文 | 红 **4**:commands 那条报 `期望 "blocked",实际 "done"`(**这一格就是"拿提取产物当输入"的实测后果:拆集会拿着字符串 `(已提取)` 真跑进切分核心,给用户切出一集垃圾正文**)、plans 两条、contract 的"提取结论不是原文" |
| M4 | **静默避开**:无原文时 `return null`(W147 点名反对的那种改法) | 红 **2**:W147 那条(步骤串少了一格)+ plans 两态那条(`fromWorkflow` 回 `null`,读 `.steps` 当场炸) |

M3 与 M4 是本槽的两条底线,分别对应任务里的"不要假装打通"与"不要静默避开",两条都有夹具接住。
另反向抽查:W147 立的 `前置门槛第三份拷贝已消`(按码取材恰 5 处)与 W153 的 `门槛码扇出` 两条契约用例本槽全程绿——
`js/domain.js` 的 `gateBlockers` 函数体、`js/issues.js` 与计划层的按码取材面都没进 diff。

## 6. 数字

| 项 | 基线 `c5de21e` | 本槽 |
|---|---|---|
| `node tests/unit.js` | 528/528,0 FAIL | **531/531**,0 FAIL |
| └ `contract` 子套件 | 116 | **117** |
| └ `plans` 子套件 | 11 | **12** |
| └ `commands` 子套件 | 29 | **30** |
| `node tests/integration.js` | 141/141,0 FAIL | **141/141**,0 FAIL(该文件未进 diff,复跑核实) |
| `node tests/cli.smoke.js` | 105/107 | **105/107**(两项与 `master` 同名同表现:`未登录 whoami → exit 3`、`llm --json mock 链路`) |
| `node tests/e2e.js` | 未跑(按目录纪律仅在明确要求时跑) | 未跑 |

`node --check` 过:`js/domain.js`、`js/commands.js`、`js/plans.js`、`tests/unit.js`。

棘轮按 **live** 抬(不抄旧数):`tests/unit.js` 单元 `FLOOR` 528 → **531**、记账件 `FLOOR` 174 → **175**;
集成与 CLI 冒烟两格本槽增量为 0,`141` / `107` 原样(都复跑核实过,不是抄的);
`README.md` 的「单元测试(N 项断言」528 → 531、契约段自报条数 116 → 117;
本目录 `README.md` 明写份数 174 → **175**(含本份)并补索引行。
四格下限与 live 的差额落地后全为 0(单元 531/531、集成 141/141、CLI 冒烟 107/107、记账件 175/175)。

治理面八个数一个没动(`gaps()` 20 键、提示词注册表 41、能力短名单 30、`Skills.CHECKS` 17、`preflightStages()` 七面、
`KB.SECTIONS` 18、`playbooks()` 5、领域命令 13):注册表五文件相对基线零 diff。

## 7. 边界与交接

1. **不动发布门**:G1–G10 判据、`fail/warn` 计数、`overall` 四级映射一字未改;`js/release.js` / `js/release-core.js` 没进 diff,
   也没有让任何一道门去读 `p.script`——G1 照旧看 `episodeState` 与 `ep.content`。
2. **不动门槛派生**:`gateBlockers` 的四行判据、`GATE` 登记表、`gateCodes()` 全集、流程条 `gateOf` 与问题中心 `GATES` 投影表全部原样。
   本槽给 `Domain` 加的是**另一问**的取数口,不是门槛的第五档码。
3. **拆集命令在这类老项目上仍然拒绝,这是本槽有意留的如实回报。** 没有原文就切不出逐字保留的分集正文(2. 节),
   命令层不许拿摘要凑数;变化只在"计划层不再把用户往这条死路上引"。要真正解开它只有两条路:
   **用户补上整本原文**(本槽的导航步指的就是它),或**将来做"从各集正文回填整本原文"**——
   而后者在拆集步出现的那一态(无分集)上无米可炊,故它只对"有分集但丢了原文、想重新分集"那一态有意义,与本槽不是一件事。
4. **`project.extractSubjects` 在这类老项目上同样会失败,本槽没收它。** W147 交接第 2 条写的「它自带回退故能真跑」
   只在**有分集**时成立;`extractDone && !script && 无分集` 这一态上各集正文也是空的,那一步照样 `blocked / no-script`。
   本槽只把它的首选输入换成同一份派生(取值逐字节不变),**没有**给它做两态分流——它的回退链比拆集长一格,
   要分流得先决定"回退也拿不到文本"算不算一种独立态,与本槽射程不同。**如实登记,不摘不藏。**
5. **门槛派生现在有四个消费方了**(流程条、问题中心、计划层的按码取材、以及计划层拆集步的"第一问守卫"),
   但**第四个仍只读码不写判据**;真正新增的消费面是 `Domain.projectScript` 的两个(拆集命令、计划层拆集步)。
   哪天第三个消费方要读它(例如导演定调那段 `p.script.slice(0, 5000)`),照样换成这个取数口,别再写一份 `String(p.script || '')`。
6. **不摘 `gaps`**:`Skills.gaps()` 仍 20 键,短名单 `note` 一字未动——本槽收的是两个既有消费面之间的取数口一致,
   不对应任何一条缺口编号的"落地",没有键可摘。
7. **不发明能力概念**:没有新增 skill 条目、没有新 `SK-xx`、没有新命令、没有新端点、没有新阻塞码。
8. **不合并其它槽**:基线是 W161 集成线 head,本槽只加自己这一条分支提交。
