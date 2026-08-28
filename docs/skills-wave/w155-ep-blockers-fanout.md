# W155 · 分集阻塞码的扇出:`Domain.episodeState` 的 blockers 收成登记表,两个消费方漏投即红

**范围**:`js/domain.js`(新增 `EPB` 登记表与 `D.epBlockerCodes()`,`episodeState` 与 `workflow` 里的码字面改读表)+
`js/issues.js`(新增分集级阻塞码投影表 `EPB` / 不投白名单 `EPB_SKIP`,导出 `epBlockers()` / `epSkips()`)+
`js/flow-tpl.js`(新增 `STOP_SKIP` 与 `F.stopSkips()`)+ `tests/unit.js`(contract +1,既有 1 条断言随之改数)+
`README.md` 与本目录 `README.md` 同步。
**基线**:`cursor/w148-integration-9f3a`(`3bbaac1`,开工现取核实相符,自测 509/509)。
**不做**:不改任何一档阻塞项的判定条件与文案(**一个字未动**)、不改问题中心的危险级取值与条目形状、
不改流程模板的步序/参数面/断点文案、**不抬发布门门槛也不让 G1 去看 `p.script`**(`js/release.js` 与
`js/release-core.js` 两个文件零 diff)、不从 `Skills.gaps()` 摘键、不新增计费动作与领域命令、
不把 W153 的项目级 `GATE` 表整包重做(本 HEAD 上 `gateBlockers` 仍是四行码字面,原样留着)。

## 1. 病灶:项目级那面钉住了,分集级这面还没有

W147 把「剧本在不在 / 主体库空不空 / 缺几张图 / 有没有分集」收进 `Domain.gateBlockers`,三个消费方
(流程条 `Domain.workflow` 按 `step` 取、问题中心 `Issues.collect` 按码查表、计划层 `Plans.fromWorkflow` 按码取材)
都改读那一份;W153 接着把**项目级**那组码收成登记表并逐码点名各消费方的实际投影。

**分集级那组码没跟上**。`Domain.episodeState` 的 blockers 有 8 档,基线上全是散落的字面:

```js
if (!ep) return { …, blockers: [{ code: 'no-episode', label: '分集不存在' }], … };
if (!(ep.content || '').trim()) bl('no-script', '缺剧本正文');
if (counts.total === 0) bl('no-shots', '未生成分镜');
…
if (blockers.some(b => b.code === 'no-script')) { status = 'blocked'; … }
```

它同样有两个按码分工的消费方,而且两处的形状与项目级那面都不一样:

| 消费方 | 形状 | 表外的码会怎样 |
|---|---|---|
| 问题中心 `Issues.collect` 的**逐集循环** | 每一档一个分支(各带自己的明细、处置命令、早退),**不是查表** | 收不出条目——那一态在问题清单上一条都看不见 |
| 流程模板 `js/flow-tpl.js` 的**断点登记** | `PREFLIGHT_STOP` 一个数组 + 各步 `stop` 逐条登记 | 跑砸在这一码上没有处置说明,调用方只能自己猜 |

两处都是"表外的码一律不投",而且**不投是静默的**:派生新加一档阻塞码时,谁没跟上都不会红。
既有判据只钉了一个方向——`contract · 前置门槛码单源` 那条钉的是"消费方按码筛的码必须是派生真会回的码"
(码名分裂当场红),`flow-tpl · 断点码是各端真会回的码` 那条钉的是"断点码不许自造"。
反向那一格向零:**派生有而消费方没有**,一条用例都点不到。

分集级这面比项目级更值得钉的地方在于**它是逐集循环里的分支**:项目级那面至少还是一张查表(漏一码是"表里没这行",
搬起来是同一处的事),分集级漏一码是"循环体里少一支 `if`",与"这一态恰好没摊到"在夹具上长得一模一样。

## 2. 落法:码收成登记表,消费方各自把"不投"写下来

三处改动,判据一条没动:

**其一,`js/domain.js` 出码只走一张表**,函数体零码字面;表兼枚举面:

```js
const EPB = {
  noEpisode: 'no-episode', script: 'no-script', shots: 'no-shots', shotsStale: 'shots-stale',
  failed: 'failed-shots', stale: 'stale-shots', unconfirmed: 'unconfirmed', composedStale: 'composed-stale',
};
D.epBlockerCodes = () => Object.keys(EPB).map(k => EPB[k]);
```

`D.workflow` 里那几档**同名的项目级聚合**(「有分集未分镜」「N 镜生成失败」「N 集成片已过期」等)一并改读本表:
它们的 `label` 是聚合口径(与分集级那句不同,故留在各自那一步里),但**码名是同一份**,不该在同一个文件里写第二遍。
落地后每个分集码在 `js/domain.js` 里恰一处字面(`no-script` 两处:分集级判 `ep.content`、项目级 `gateBlockers` 判整本原文,
这是 W138 就钉住的"两级同码不同判定输入,各只一处登记")。

**其二,`js/issues.js` 把危险级收成一张表**,逐集循环的分支按表取值,并给接不住的码写下理由:

```js
const EPB = { 'no-script': 'high', 'no-shots': 'mid', …, 'unconfirmed': 'low', 'composed-stale': 'mid' };
const EPB_SKIP = { 'no-episode': '逐集循环的入参恒取自项目的分集表,拿不到"分集不存在"这一态——…' };
```

这里**没有**把分支改成查表:分集级条目除了码与危险级,还各带自己的明细串、处置命令(`cmd` + `shotIds`)与早退语义
(缺正文/未拆镜/分镜判旧三档 `return`,后面的档一律不再报),硬收成表就是把判据挪进表里、换个地方写同一份东西。
本槽收的是**可枚举的那部分**——码与危险级;"漏没漏投"由契约用例拿真实夹具逐码看产出,不靠表的形状保证。

**其三,`js/flow-tpl.js` 登记不进中段的那两档 + 理由**(与该文件既有的"投影步登记 `null` = 有意不在中段"同一纪律):

```js
const STOP_SKIP = {
  'no-episode': '中段每一步都按 epid 寻址已存在的分集,拿不到这一态:…由命令层如实报错,不是流程断点',
  'composed-stale': '成片不在中段:重新合成的时机与断点由成片那段承接(SK-30),中段不越界替它写处置',
};
```

三处新导出的 `epBlockerCodes()` / `epBlockers()` / `epSkips()` / `stopSkips()` 都**每次现生成副本**,调用方污染不回写本表。

## 3. 行为变化:零

产品行为一格没动。派生回的码与文案、问题中心每条条目的 `kind`/`sev`/`count`/`label`/`detail`/`cmd`/`goto`、
流程模板的步序与断点文案,逐字节与基线相同——本槽只是把散落的字面收进表、把"不投"写成白名单、再给它们加了枚举面。
既有 509 条单元用例一条未改(除下节那条随之改数的断言),集成 130 条与 CLI 冒烟 102 条零 diff。

## 4. 加测(+1)与随之改数的那条

| # | 套件 · 用例 | 钉住什么 |
|---|---|---|
| 1 | `contract · 分集阻塞码扇出:Domain.epBlockerCodes() 逐码在问题中心与中段模板都有投影(漏投即红)` | 枚举面取 `Domain.epBlockerCodes()`,逐码拿一份**真会触发该码**的分集夹具(先断言 `episodeState` 确实报出它,夹具失效即红),再看两个消费方的实际产出:问题中心必须恰收出一条同码条目且危险级取自 `Issues.epBlockers()`;中段模板必须有断点处置。接不住的码要在 `Issues.epSkips()` / `FlowTpl.stopSkips()` 写下理由(> 12 字),白名单之外一律红;三张表都验"现生成副本" |

配套源级两句:`episodeState` 函数体里 `code: '…'` 与 `bl('…')` 各须零命中(绕开登记表的码进不了枚举面,
扇出契约就漏检那一码);码全集不得少于 8 档(空表会让逐码点名变成空转)。

随之改数的一条:`contract · 前置门槛码单源` 里 `'no-script'` 在 `js/domain.js` 的出现次数 3 → **2**
(分集级那两处——登记与按码取状态——合成了表里的一处),句子里的口径同轮改写,两级各只一处登记这个判据本身不变。

## 5. 变异复核(七组,各红各的)

| # | 变异 | 结果 |
|---|---|---|
| M1 | 问题中心删掉 `stale-shots` 那一支 | 红 **4**:本槽扇出那条点名"在问题中心收不出条目";另有 3 条既有用例跟着红(`issues` 过期镜带镜头号、双端同结论、`contract` 条目 `cmd` 在注册表内) |
| M2 | `js/flow-tpl.js` 的 `PREFLIGHT_STOP` 里去掉 `stale-shots` | 红 **1**(仅本槽这条):"既没有断点处置、也没在 `stopSkips()` 登记不进的理由"——**既有 `flow-tpl` 七条用例全绿**,反向那一格此前确实向零 |
| M3 | `EPB` 新增一档 `audio-missing` 而两侧消费方都没跟上 | 红 **1**:"既没有触发夹具、也没在 `Issues.epSkips()` 登记不投的理由" |
| M4 | `episodeState` 绕开登记表直接写回 `bl('stale-shots', …)` | 红 **1**:源级那句(期望 0 实际 1) |
| M5 | 问题中心把 `unconfirmed` 的 `sev` 写死成 `mid`(与表登记的 `low` 不符) | 红 **1**:"危险级应取 `Issues.epBlockers()` 登记的那一档(表不能是摆设)" |
| M6 | 摘掉 `Issues.epSkips()` 里 `no-episode` 那条白名单 | 红 **1**:该码当场变成"两边都没跟上" |
| M7 | 摘掉 `FlowTpl.stopSkips()` 里 `composed-stale` 那条 | 红 **1**:该码当场变成"中段漏登记断点" |

M2 是本槽的主判据:它是唯一一处**既有用例一条都点不到**的变异,证明补的确是新覆盖而不是同判据再写一遍。
M1 反过来说明另一件事——问题中心那面既有夹具摊得比较全,所以漏投在**已有的那几档**上撞得到既有用例;
撞不到的正是"新加一档"(M3)与"夹具没摊到的一档",而那两种恰恰是静默漏投的真实形态。

## 6. 数字

| 项 | 基线 `3bbaac1` | 本槽 |
|---|---|---|
| `node tests/unit.js` | 509/509,0 FAIL | **510/510**,0 FAIL |
| └ `contract` 子套件 | 113 | **114** |
| `node tests/integration.js` | 130/130,0 FAIL | **130/130**,0 FAIL |
| `node tests/cli.smoke.js` | 100/102 | **100/102**(两项与 `master` 同名同表现:`未登录 whoami → exit 3`、`llm --json mock 链路`) |
| `node tests/e2e.js` | 未跑(按目录纪律仅在明确要求时跑) | 未跑 |

`node --check` 过:`js/domain.js`、`js/issues.js`、`js/flow-tpl.js`、`tests/unit.js`。
没删测按名成集双向比对:基线独有 **0** 条、新增恰 **1** 条(即上表那条,逐字点名)。

棘轮按 **live** 抬(不抄旧数):`tests/unit.js` 单元 `FLOOR` 509 → **510**、记账件 `FLOOR` 162 → **163**;
`README.md` 的「单元测试(N 项断言」509 → 510、契约段自报条数 113 → 114;
本目录 `README.md` 明写份数 162 → **163**(含本份)并补索引行。
四格下限与 live 的差额落地后全为 0(单元 510/510、集成 130/130、CLI 冒烟 102/102、记账件 163/163)。

## 7. 边界

- **不动发布门**:G1 仍按 `Domain.episodeState(...).status !== 'done'` 逐集判、点名用的仍是 `action.label`,
  与阻塞码无关也没改成按码取;G1–G10 的判据、`fail/warn` 计数与 `overall` 映射一字未改,
  `js/release.js` / `js/release-core.js` 两个文件零 diff,**没有任何一道门被引去读 `p.script`**。
- **不动判定条件**:8 档阻塞项的触发条件与文案逐字不变。尤其 `unconfirmed` 一档,
  派生侧的条件(整集出片齐了才报)与问题中心那支的条件(有未确认镜且没在飞)**本就不同**,本槽原样留着——
  收的是码的枚举面,不是把两侧条件强行对齐(那是抬门槛,得另开一槽单说)。
- **不重做 W153**:本 HEAD 上项目级 `gateBlockers` 仍是四行码字面、没有 `GATE` 表,本槽一行未碰;
  两槽落在不同函数上,合并时预计只在 `js/domain.js` 的相邻段与 `tests/unit.js` 的 contract 段相接(见交接 2)。
- **不摘 `gaps`**:`Skills.gaps()` 仍 20 键,短名单 `note` 一字未动——本槽收的是既有消费面之间的口径一致。
- **不发明能力概念**:没有新增 skill 条目、新 `SK-xx`、新命令与端点;新增的四个函数全是只读投影。

## 8. 交接

1. **分集阻塞码现在有枚举面了**(`Domain.epBlockerCodes()`),新增一档时的义务是明确的:
   要么在问题中心逐集循环里加那一支并在 `Issues.epBlockers()` 登记危险级、在中段模板某一步登记断点处置,
   要么在 `Issues.epSkips()` / `FlowTpl.stopSkips()` 写下不投的理由;两边都不做,契约用例按码点名。
   **契约用例还要一份触发夹具**(`FIX` 表):加档时同轮补一份,补不出来就说明那一态派生本身也摊不到,该先想清楚。
2. **与 W153 的关系**:那一槽给**项目级** `gateBlockers` 立了同形的 `GATE` 表与 `D.gateCodes()`。
   两槽都在 `js/domain.js` 的 `episodeState` / `gateBlockers` 一带、都在 contract 段尾部加了一条同形用例,
   合并时按"每块先机检两侧相对叉点的差异形态"处理即可;两条用例判的是两组不相干的码,**判据不互斥**,
   合完两条应当都在。
3. **还没钉的那一面**:分集阻塞项还有一组**只读 `label` 不读码**的消费方——量产页的红标签、
   命令层与 CLI 的 `preflight` 回执(`st.blockers.map(b => b.label).join('/')`)、`js/pipeline.js` 的流程条 `title`、
   `js/skills.js` SK-04 那处取首条 `label`。它们对新增一档天然免疫(拿到什么就画什么),
   所以本槽没给它们立判据;真要动的话该问的是另一个问题——**这些面该不该按码分处置**,那是改行为,不是钉扇出。
4. **`workflow` 的聚合档与分集档同码不同 `label`** 是有意的(「有分集未分镜」对「未生成分镜」)。
   哪天想把 `label` 也收进表,得先决定聚合口径那句放哪——放表里就得带参数,那时表就不只是码表了。
