# W64 · 发布留痕命令化收编的收敛记录(集成分支)

> 集成分支:`cursor/w64-integration-23c3`,基线 `cursor/w62-integration-9c4e @ 9dfad8d`(开工时 `fetch` 后的 tip)。
> 本文只记**收敛过程**:合了哪一条、每处冲突怎么解、合并后的实测数字、没删测的取证。W58 的内容说明在
> `w58-sk25-publish-cmd.md`(作者自己留了记账件,本文不代述、不复写)。
> 合并 `--no-ff`、一个合并提交(`52965b5`)、可 revert;全程只解冲突与收敛双口径,**不重做该分支已落地的功能**。

## 1. 结果一句话

`w58-sk25-publish-cmd-3b7a` 以其 head **`e842dfb`** 合入,合并后回归 `unit 408/408`、`integration 118/118`、
`cli.smoke 88/90`(2 项失败与 `master` 同名同表现,见 5.2)。W61/W63 按任务口径**不合**(判定见第 2 节)。

本槽的实质增量:

| 增量 | 来源 | 落点 |
|---|---|---|
| 发布留痕的准入判定与写回收成双端 UMD 单源(门禁结论由调用方注入,时钟/用户名/版本号推进器/落库经参数注入) | `w58` | `js/release-core.js`(新增)、`index.html` |
| 领域命令 `project.release`:浏览器命令表 / CLI `exec` / 服务端 `POST /api/wf/release` / MCP 同名同结构 | `w58` | `js/cmd-registry.js`、`js/commands.js`、`cli.js`、`server.js`、`mcp.js` |
| 浏览器交付检查「打版本」按钮改走命令表;`Release.stampRelease` 与 CLI `_releaseGates` 都退成对单源的薄封装 | `w58` | `js/release.js`、`cli.js` |
| 顺带修掉 `exec` 参数合流缺陷:未给的 flag 不再以 `undefined` 覆盖 `--args` 同名值(MCP 只传 `--args` 时 `pid` 被抹掉) | `w58` | `cli.js` |
| 架构树补 `js/release-core.js` 一格(本槽的收敛动作,不是 `w58` 的增量,见 4.6) | 本槽 | `README.md` |

合并后的主干口径变化:领域命令由 11 条变 **12** 条(新增 `project.release`,排在 `subject.generateImage`
与 `project.extractSubjects` 之间),`Skills.gaps()` 里 `G-12` 的三个落点(计划步骤 / MCP 中段流程模板 /
发布留痕命令化)至此全部有出口。**MCP 工具数仍是 37**(见 4.2 那处"看起来该 +1 其实 +0"),
提醒投影表仍 **7** 条、校验面仍**七面十七条**、`KB.SECTIONS` 仍 18 条、注册表提示词仍 14 条、
短名单仍 30 条无 `pending`、专家仍 16 位、发布门 G1–G10 的判据与 `overall` 四级计数一字未动。

**本槽值得留下的三件方法面的事**:

1. **"两侧各自新增一块新代码"是与冲突块长得一样、但解法完全不同的一类**。`tests/integration.js` 里
   两侧在同一个插入点各写了一个「测试 23」块(`ours` 是 W53 的记忆播种、`theirs` 是发布留痕),
   `git` 报成一处冲突,而机械取任一侧就整块丢掉 13 条或 12 条断言——两块本来能共存,
   解法是**两块都留 + 给后来那块顺号**,不是二选一(4.4)。
2. **"合了一条分支,计数就该 +1"这种直觉会写错数字**。`w58` 没有新增任何 MCP 工具,
   它把 `hujing_release` 从"包 `release` 子命令"改成"包 `exec project.release`",工具数仍是 37;
   而两侧 README 一个记 37 一个记 34,都不是合并后的值。同一槽里领域命令是真的 11 → 12。
   两个数字**一个不动一个动**,只能逐个 live 现取(4.2、5.3)。
3. **对侧改的那"唯一一个字符"要靠逐段 char-diff 找**。`README.md` 里「主线 skill 索引」那一整段
   10742 字,`theirs` 相对合并基只改了一个字符(`11 条领域命令` 的 `1` → `2`),
   它落在冲突块的对侧,而 `contract` 套件的「README 数字对账」**只管 unit 用例数、不管领域命令条数**——
   这一处零断言兜底,机械取 `ours` 就把 11 留下且全绿(4.3)。

## 2. 开工前的包含性实测(合的是哪几条)

开工 `git fetch origin 'refs/heads/*:refs/remotes/origin/*' --prune` 后逐条
`git rev-list --count 9dfad8d..origin/<branch>` + `git log` 核对 tip:

| 候选分支 | tip | outstanding | 判定 |
|---|---|---|---|
| `cursor/w58-sk25-publish-cmd-3b7a` | `e842dfb` | 4 | **合**(任务指定必合) |
| `cursor/w61-sk26-front-writeback-b09b` | `8b63f7f` | 1 | **不合**:任务口径明确排除 |
| `w63-*` | — | — | **不合**:该前缀远端**零匹配**(`git branch -r --list 'origin/cursor/w63*'` 无输出) |
| `cursor/w53-memall-headless-seed-3653` | `0045962` | 1 | **不合**:它那 1 条只是 W53 自己的记账件提交,代码早已随 W57 并入(见 4.7) |

**W62 记的 `w58` tip 与实际 tip 不同**:`w62-integration-log.md` 第 2 节把它记成 `038b5d1`(outstanding 1),
本槽 `fetch` 后实际 tip 是 `e842dfb`——`038b5d1` 之后它又推了 3 条:

```
04088a3 修正 exec 参数合流:未给的 flag 不再覆盖 --args 同名值(MCP 只传 --args 时 pid 被抹掉)
02e86ed 测试:/api/wf/release 集成 13 条 + 发布留痕命令化冒烟 12 条,README 测试数字与 API 表同步
e842dfb docs(skills-wave):W58 记账件 + 目录索引与摘要实况同步
```

按"以 fetch 后实际 tip 为准"取 `e842dfb`。这一次少取那 3 条的代价是具体的:
`04088a3` 是**一个真实缺陷的修复**(MCP 各工具只传 `--args`,而 `Object.assign` 会把未给的 flag
以 `undefined` 写进去覆盖掉 `--args` 里的 `pid`),`02e86ed` 是 23 条新断言与 README 对账,
`e842dfb` 是它的记账件与索引行——按 `038b5d1` 合就等于合了功能不合它的测试与修复。
W62 自己写下的那句「上一槽记下的 tip 只是当时的快照,不能当本槽的输入」在本槽第二次奏效。

**W62 记的「`w61-*` 远端零匹配」同理是当时的快照**:本槽 `fetch` 后 `w61-sk26-front-writeback-b09b`
已有 tip `8b63f7f`(主线前段四步闭环结论回流协作记忆,1 条),但按任务口径本槽不合,
一行未碰;顺带记一句实况给下一槽用:它接的正是 `js/skills.js` 里 `core.memoryDual`(SK-04)
`note` 仍欠段点名的那一处「理解/分镜/拆集/提取主体几步的结论仍不回流」,
合它的槽要连着改那一行的 `facts` 锚点(4.5 里那张表的第二行)。

## 3. 这一次合并做了什么

`git merge --no-ff origin/cursor/w58-sk25-publish-cmd-3b7a`,冲突 **4 文件 7 处**,自动合并
`js/skills.js`/`mcp.js`/`server.js`/`index.html`/`js/commands.js`/`js/release.js`/`js/cmd-registry.js`/
`tests/unit.js`/`tests/cli.smoke.js`,新增文件 `js/release-core.js` 与 `docs/skills-wave/w58-sk25-publish-cmd.md`。

落地内容不复述该槽记账件;从合入方角度只需记住三件形态:

- 该分支叉自 `3968658`(`w55` 记账件那一版),即 **W53/W54 并入之前**,故它对 `README.md`/
  `docs/skills-wave/README.md`/`cli.js`/`tests/*` 的改动**都是在旧实况上改的**;
- 但它改的**主题**与 W53/W54/W59 落的东西不同(它动发布门与发布留痕,那三条动记忆桶与问题中心),
  故 7 处冲突里 5 处是"`ours` 为底 + 折回对侧增量"、1 处取并集、1 处取 `theirs`,
  **没有 W62 那种"取任一侧都会丢一整个能力面"的块**;
- `cli.js` 是唯一一处两侧真的改在相邻行上:`ours` 侧 W59 在 `_releaseGates` 之前插了 `CMD.issues`,
  `theirs` 侧把 `_releaseGates` 的 50 行内联实现换成一行 `ReleaseCore.gates` 委托。

冲突总表:

| # | 文件 | 处 | 解法 |
|---|---|---|---|
| 1 | `cli.js` | `CMD.issues` ↔ `_releaseGates` 收成单源委托 | 取并集:`issues` 命令原样留 + 门禁取 `theirs`(4.1) |
| 2 | `tests/integration.js` | 两侧各自新增的「测试 23」块 | **两块都留**,`theirs` 那块顺号为「测试 24」(4.4) |
| 3 | `README.md` | 「命令总览」段 | `ours` 为底 + 折回 `theirs` 的 `release-check/release`(4.3) |
| 4 | `README.md` | 「主线 skill 索引」段 | `ours` 为底 + 唯一一个改动字符 `11 条领域命令` → `12`(4.3) |
| 5 | `README.md` | 回归测试段四段(unit/integration/e2e/cli.smoke) | `ours` 为底 + 折回三块描述;数字 live(4.3、4.6) |
| 6 | `docs/skills-wave/README.md` | 目录索引表 | 按波次序取并集,`w58` 行排在 `w57` 与 `w59` 之间(4.7) |
| 7 | `docs/skills-wave/README.md` | 一分钟摘要「记账诚实位」那条的 `G-12` 尾句 | 取 `theirs`(「三个落点已全部接上」,4.7) |

## 4. 七处冲突怎么解

### 4.1 `cli.js`:两侧改在相邻行,取并集

`ours` 侧(W59)在 `_releaseGates` 之前插入了 `CMD.issues`(问题中心 headless 出口),
`theirs` 侧把 `_releaseGates` 的整段内联实现换成:

```
function _releaseGates(p, minScore) { return ReleaseCore.gates(p, { minScore, online: true, Domain }); }
```

两处互不相干,取并集:`CMD.issues` 整块原样保留(W59 的出口不能丢),`_releaseGates` 取 `theirs`
(否则等于不合——门禁判据留在 CLI 里就还是第二份)。`ReleaseCore` 的 `require` 行在文件头,
落在自动合并区,合完直读复核在位。

**这一处有断言兜底**:`w58` 自带的「`project.release` 命令化出口四端齐备」源级用例会查
`cli.js` 里的 `EXEC['project.release']` 与 `ReleaseCore` 的引用;`ours` 侧 `CMD.issues` 那一块
另有 W59 的「CLI `issues` 与 MCP `hujing_issues` 复用同一份投影」用例守着。两条都在合入后实测绿。

### 4.2 MCP 工具数:这一槽有意**不变**(两侧 README 都不能信)

直觉是"合进来一条分支,它接了个新出口,工具数 +1"。实测不是:

| 取值点 | 实测 |
|---|---|
| 基线 `9dfad8d` | **37** |
| `w58 @ e842dfb`(独立 worktree) | **34** |
| 合入后 HEAD | **37** |

`w58` 的 `mcp.js` 改动是**一行替换**(`git diff` 实测 1 删 1 增):把 `hujing_release` 的
`build` 从 `['release', pid, …]` 改成 `['exec', 'project.release', '--args', …]` 并补上 `cmd: 'project.release'`
字段,同时把 description 写成发布留痕的口径。**改的是链路不是数量**。
它那侧记 34 是因为它叉在 W53/W56/W59 三条各加一个工具之前;基线记 37 正确;合完仍是 37。

这与 W57 记的「两侧相等也可能都错」和 W62 记的「两侧不等而两侧各自都不是合并后的值」是第三种形态:
**两侧不等,而其中一侧恰好就是合并后的值**——恰好对也必须现取才知道是恰好对。取证:

```
node -e "console.log((require('fs').readFileSync('mcp.js','utf8').match(/\{ name: 'hujing_/g)||[]).length)"  # 37
```

同一槽里领域命令是真的从 11 变 12,现取:

```
node -e "const C=require('./js/cmd-registry.js');console.log(C.names().length)"  # 12
```

### 4.3 `README.md` 三处:散文取并集,数字 live

| 数字 | `ours`(`9dfad8d`) | `theirs`(`w58`) | live 实测 | 说明 |
|---|---|---|---|---|
| unit 断言数 | 403 | 394 | **408** | **两侧都错**:403 是基线实况、394 是 `w58` 分叉线上的实况,403 + `w58` 五条 = 408 |
| integration 断言数 | 105 | 106 | **118** | 同上;105 + `w58` 十三条 = 118 |
| cli.smoke 断言数 | 80 | 82 | **90** | 同上;80 + `w58` 十条 = 90 |
| 领域命令条数 | 11 | 12 | **12** | 只有这一个数字是 `theirs` 对(它加的就是这一条) |

`unit` 那一条有 `contract` 套件的「README 数字对账」断言兜底:合完先红,报
`单元测试用例数:README.md 与实测不符(实测 408,文档 403)`,改完即绿。
**另外三个数字没有断言兜底**——`integration`/`cli.smoke` 的条数与领域命令条数都只在散文里,
写错不会红,只能逐个现取(5.3)。

领域命令那一处值得单独说:`theirs` 相对合并基在「主线 skill 索引」那一整段 10742 字里
**只改了一个字符**(两侧段长都是 10742,char-diff 的公共前缀正好停在 `14 条注册表提示词、1` 之后)。
它落在冲突块的对侧,机械取 `ours` 会留下 11 且三套件全绿。找法是**逐段做首尾锚点 char-diff**
而不是读:先按段首字面把 `theirs` 与合并基的同名段各切出来,求最长公共前缀/后缀,中间那截就是它的增量。

三处散文都是 `ours` 为底折回对侧增量:

- **命令总览段**:`theirs` 相对合并基只加了 `成片 compose/export` 后面的 `/release-check/release`,
  其余全是它分叉时的旧实况(`状态 workflow/flow-template` 缺 `issues`、`记忆 memory list/add`
  缺 W53 的 `seed/migrate` 整段)。故以 `ours` 为底只插那一处。
- **主线 skill 索引段**:同上,只把 `11 条领域命令` 改 `12 条`。
- **回归测试段**:`ours` 为底,把 `theirs` 的三块描述按原位折回——`release.js` 覆盖描述后面接
  `release-core` 与 `project.release` 两段(unit 段)、`/api/wf/release` 那一整块(integration 段,
  排在 W53 的 `memory-seed` 块之后按波次序)、发布留痕命令化出口那一整块(cli.smoke 段,
  排在第四阶段交付检查块之后)。

四处折回都按 W60 立的口径**按首尾锚点切段逐字节比对**,不靠眼睛:

```
命令总览 release 命令句            | theirs  48 字 / HEAD  48 字 | 逐字节相同
unit 折回:release-core + 命令段    | theirs 459 字 / HEAD 459 字 | 逐字节相同
integration 折回:/api/wf/release   | theirs 188 字 / HEAD 188 字 | 逐字节相同
cli.smoke 折回:命令化出口段        | theirs 319 字 / HEAD 319 字 | 逐字节相同
```

四段折回**没有任何一处有意与对侧不同的字**(与 W62 那次不同:那次表从 6 行变 7 行,
折回段里的「六条」必须改成「七条」)。本槽对侧描述里出现的每一个计数(七项核心门、四码、
四端、十项门)在合入后都仍是原值,逐个现取复核过(5.3)。

### 4.4 `tests/integration.js`:两侧各自新增一块,两块都留

这是本槽唯一一处形态与前几槽都不同的冲突。两侧在「测试 22(G-04 剧本拆集)」之后的同一个插入点
各写了一整块:

| 侧 | 块 | 断言 |
|---|---|---|
| `ours` | 测试 23(W53):协作记忆播种 `/api/wf/memory-seed` | 12 条 |
| `theirs` | 测试 23(G-12 第三个落点):发布留痕 `/api/wf/release` | 13 条 |

`git` 报成**一处**冲突,因为两块的起止落在同一行区间;但两块之间没有任何语义冲突——
它们打的是两个不同端点、用的是两套独立夹具。**机械取任一侧就整块丢 12 条或 13 条断言,
而剩下那一侧跑起来全绿**(套件条数会从 118 掉到 105 或 106,而没有任何断言在数条数)。

解法:两块都留,`theirs` 那块顺号为「测试 24」。顺号不是洁癖——文件里已有「测试 10…测试 23」
的连续编号,留两个「测试 23」下一个人按编号找块会找错。
另需注意 `theirs` 那块在自己的块作用域里 `const Domain = require('../js/domain.js')`,
两块各自 `{}` 包裹故不撞名;合完 `node --check` 与实测都过。

`theirs` 那块还顺手放宽了 `req()` 助手的报错取值(`j.msg || j.error` → `j.msg || j.error || j.message`),
落在自动合并区,直读复核是**放宽不是收窄**,`ours` 侧所有既有断言的取值路径不变。

### 4.5 自动合并区的复核:`facts` 表这次为什么没有"取侧"动作

W57 点名过最危险的合并点:`tests/unit.js` 里「记账对齐」那条用例的 `facts` 表,三行各是一条
`infra` 条目的实况判据 + `note` 里必须点名的余量锚点,**两侧都是完整三行、`--ours`/`--theirs`
跑起来都绿而内容都不完整**。本槽在那张表上**没有取侧动作**,但这个结论是实测出来的:

| 复核项 | 实测 |
|---|---|
| `w58` 是否碰过那张表 | **没有**。`git diff 3968658 origin/cursor/w58-sk25-publish-cmd-3b7a -- tests/unit.js` 里 `facts` 区零行 |
| 本槽是否碰过那张表 | **没有**。`git diff 9dfad8d HEAD -- tests/unit.js` 里 `facts` 区零行 |
| 表的三行锚点与合入后 `note` 的仍欠段是否逐行对得上 | **对得上**(现取 `Skills.byId(id).note` 按「仍欠」切段后逐锚点判定,见下表) |

| 行 | 表里的锚点 | 合入后 `note` 仍欠段实况 |
|---|---|---|
| `core.personaCtx`(SK-03) | `['ops 协议','不开放覆盖']` | 「四处的 ops 协议/字段面/命令白名单/返回 JSON 约定仍由各自装配口拼、不开放覆盖」 |
| `core.memoryDual`(SK-04) | `['理解/分镜/拆集/提取主体','SK-26']` | 「自动沉淀本轮结论只有审片/发布两个闭环(那一面归 SK-26 的回流面),理解/分镜/拆集/提取主体几步的结论仍不回流」 |
| `review.stage`(SK-23) | `['SK-24','G-10']` | 「审片步在就绪检查面表里的校验面已随 SK-24 落地,而报告好坏优劣的语义面(方法论门那一半)仍待 G-10」 |

三行仍是 W57 取定的那一版,一行未动。**SK-04 那一行这一次差一点就该改**:`w58` 确实改写了
发布留痕的记忆回流路径——`js/skills.js` 里 SK-26(`review.memoryFeedback`)那条 `note` 的
「发布留痕两端(浏览器 `release.js stampRelease` 与 **CLI release,后者随同一次 PUT 的 meta 桶写回**)」
被换成「与**服务端** `/api/wf/release`,CLI `exec project.release` 与 MCP 同链路」,
`tests/unit.js` 里那条 `assert(/meta\.agentMemory = WfCore\.memWrite\(state\.agentMemory,/.test(files['cli.js']))`
也随之改成查服务端写入点。但 `facts` 表管的是 SK-03/SK-04/SK-23 三条 `infra` 条目,
SK-04 那行的锚点指的是**回流面还差哪几步**(理解/分镜/拆集/提取主体),
`w58` 改的是**已回流那两个闭环走哪条通道**——改的不是同一件事,故那行如实不动。
这一处必须逐行读才分得开:两句话里都出现「发布留痕」和「回流」。

`w58` 对 `js/skills.js` 的另外两处改动(SK-05 `core.playbookProjection` 的 `G-12` 尾注、
SK-25 `review.reviseLoop` 的 `steps` 补一步)全在自动合并区,合入后现取复核:

```
node -e "const S=require('./js/skills.js');console.log(S.byId('review.reviseLoop').steps.map(x=>x.cmd).join(' > '))"
# episode.smartReview > episode.generateVideos > episode.smartReview > episode.compose > project.release
node -e "const S=require('./js/skills.js');console.log(S.list().filter(x=>x.pending&&x.pending.length).length)"  # 0
```

### 4.6 并入让非冲突区过期:本槽四处

按 W57 立的口径逐句问「这次合进来的东西让哪些句子过期」,通读 + 直读源码复核,本槽有四处:

| # | 位置 | 过期原因 | 改法 |
|---|---|---|---|
| 1 | `README.md` 回归测试段 unit 断言数 | `w58` 加了 5 条 | 403 → **408**(`contract` 套件先红) |
| 2 | `README.md` 回归测试段 integration 断言数与"扩至"归属 | `w58` 加了 13 条 | 「W53 扩至 105 项」→「**W58 扩至 118 项**」 |
| 3 | `README.md` 回归测试段 cli.smoke 断言数与"扩至"归属 | `w58` 加了 10 条 | 「W53 扩至 80 项」→「**W58 扩至 90 项**」 |
| 4 | `README.md` 架构树缺 `js/release-core.js` 一格 | 新模块进来了 | 补一格 + 「打版本按钮走领域命令 `project.release`」(见下) |

第 4 处要说清楚这是**对侧的漏登记、不是本槽合出来的回退**:架构树几乎逐个列 `js/` 模块
(W59 新增 `js/issues-ui.js` 时就在树里补了一格),而 `w58` 只把 `js/release-core.js` 写进了
README 的「📦 交付检查」条与 API 表,**没进架构树**。这一处**零断言兜底**——树是散文,
没有任何用例在数它的格数,`git diff` 里也看不出来(对侧那一格从来不存在)。
靠通读架构树捞出。本槽按实况补:模块职责(准入判定四码 + 写回三件)、两端调用方
(`Release.stampRelease` 与 `/api/wf/release`)、注入面(时钟/用户名/版本号推进器/落库),
并把紧挨着的 `js/release.js` 那格里「UI 模态 + CLI release-check/release 两命令同口径」
改成「UI 模态(**打版本按钮走领域命令 `project.release`**)+ CLI …」——按钮的链路变了,
而这一句正是描述它的。

**有意不改的**:

- 各分支自己的记账件——`w58-sk25-publish-cmd.md` 里的数字与"仍欠"段照原样,按 W38 立的口径
  「分支记账件里的数字与实况不随并入更新」,实况的推进由本文接住。
- `docs/AI助手接入指南.md` 一字未动:它的「37 个工具」这一次**恰好仍对**(4.2),
  第 63–64 行的 `release-check`/`release` 两条示例命令的用法与 exit 语义也没变
  (`w58` 保留了 `release` 子命令的历史回执字段名,只把它改成 `/api/wf/release` 的薄封装)。
  「范式 C」那份 `exec` 命令清单本来就是部分列举(既有版本也没列
  `project.splitEpisodes`/`project.extractSubjects`/`subject.generateImage`),
  不完整先于本槽存在,本槽不顺手扩它——扩了就等于本槽在改一份与合入无关的清单。
- `README.md` 架构树里 `js/commands.js` 那格的命令列举同理是既有的部分列举,不动。

### 4.7 索引一律 union,`G-12` 那句取对侧

目录索引表(#6):`ours` 侧带 `w56`/`w57`/`w59`/`w60`/`w62` 五行、`theirs` 侧带 `w58` 一行,
机械取任一侧都会丢行。按波次序把 `w58` 那行排在 `w57` 与 `w59` 之间取并集,
并与 `theirs` 侧那一行逐字节比对(423 字 / 423 字,逐字节相同)。表本身有契约断言
「索引与目录实况双向对齐」兜底(少一行即红),但**行序不在断言里**,靠人守波次序。

一分钟摘要「记账诚实位」那条的尾句(#7)取 `theirs`:合并基是
「只剩发布留痕两端的命令化出口未接(SK-25 `note` 点名…)」,`theirs` 改成
「`G-12` 的三个落点已全部接上——计划步骤随 W46、MCP 中段流程模板随 W52、发布留痕的命令化出口随 W58…」。
这一处**必须取 `theirs`**:留 `ours` 就是"说了没做的反面"——功能合进来了而摘要还写着没接,
而它紧挨着的 `Skills.gaps()` 投影实况已经变了。取侧后与 `theirs` 逐字节比对(194 字 / 194 字)。

摘要里另有两条句子(「前段命令全过 wf 通道」那条尾巴的 `G-12` 收尾话、「记忆的写入面不再全靠人打字」
那条里发布留痕写入点的通道)**落在自动合并区**,`git` 一句冲突也不报,合完直读复核两条都已是
`theirs` 的新措辞(W62 记的「纯新增文件里的旧实况」是这一类的反面:那次是自动区带回旧实况,
这次是自动区正确带来新实况——两种都得直读才知道)。

**W53 那处没有记账件的缺口仍如实留在** `w57-integration-log.md` 第 6 节代记的位置:
`docs/skills-wave/` 下仍没有 `w53-*.md`,`origin/cursor/w53-memall-headless-seed-3653` 那 1 条
outstanding 提交(`0045962`,它自己的记账件 + 索引行)本槽按任务口径不合、也不代造一份。

## 5. 实测与取证

### 5.1 三套件数字

| 套件 | 合并基 `3968658` | 基线 `9dfad8d` | `w58 @ e842dfb`(独立 worktree) | 合入后 HEAD |
|---|---|---|---|---|
| `node tests/unit.js` | 389/389 | 403/403 | 394/394 | **408/408** |
| `node tests/integration.js` | 93/93 | 105/105 | 106/106 | **118/118** |
| `node tests/cli.smoke.js` | 70/72 | 78/80 | 80/82 | **88/90** |

`w58` tip 的数字比基线低是**它叉得早**(叉自 `3968658`,W53/W54/W56/W59 并入之前),不是它删过测。
本槽把合并基也跑了一遍,于是"它自己加了几条"可以直接减出来:

| 套件 | `w58` 相对合并基 | HEAD 相对基线 | 是否相等 |
|---|---|---|---|
| unit | 394 − 389 = **+5** | 408 − 403 = **+5** | 相等 |
| integration | 106 − 93 = **+13** | 118 − 105 = **+13** | 相等 |
| cli.smoke | 82 − 72 = **+10** | 90 − 80 = **+10** | 相等 |

三行都相等,即**没有一条断言被冲突解法吃掉**(4.4 那处两块都留是这个等式成立的关键:
若机械取 `ours`,integration 那行会是 +13 对 +0)。

顺带一处实况差:`02e86ed` 的提交信息写「冒烟 12 条」,而 `cli.smoke` live 实测只多 **10** 条
(逐条数 `theirs` 在 `tests/cli.smoke.js` 里新增的断言调用点也是 10 个)。以实测为准;
这不是缺陷,只是它那条提交信息的计数偏高 2,本文按实测记 10 并如实登记这处差。

### 5.2 `cli.smoke` 那 2 项失败:与 `master` 同名同表现

在独立 worktree(`git worktree add /tmp/wt-master origin/master --detach`,`9adcf0f`)跑
`node tests/cli.smoke.js` 取证,`master` 自身即 **51/53**,失败两项:

```
FAIL | 未登录 whoami → exit 3 | exit=1
FAIL | llm --json mock 链路 | undefined
```

合并基 `3968658`、基线 `9dfad8d`、`w58 @ e842dfb` 与本槽 HEAD 的失败项**逐字同名同表现**,
条数与名字都没变(先于本槽存在,非本槽引入,不在本槽范围内修)。

### 5.3 数字取证方式

`unit` 由 `contract` 套件的「README 数字对账」断言现算(套件表求和),文档写错即红。其余直读源现计:

```
node -e "console.log(require('./js/cmd-registry.js').names().length)"                          # 12
node -e "console.log((require('fs').readFileSync('mcp.js','utf8').match(/\{ name: 'hujing_/g)||[]).length)"  # 37
node -e "console.log(require('./js/issues.js').reminders().length)"                            # 7
node -e "console.log(require('./js/prompts.js').list().length)"                                # 14
node -e "console.log(Object.keys(require('./js/knowledge.js').SECTIONS).length)"               # 18
node -e "const S=require('./js/skills.js');console.log(Object.keys(S.CHECKS).length, S.preflightStages().length, S.list().length)"  # 17 / 7 / 30
node -e "console.log(require('./js/experts-data.js').EXPERTS.length)"                          # 16
node -e "console.log(require('./js/release-core.js').DEFAULT_MIN_SCORE)"                       # 7
```

`integration`/`cli.smoke` 两个数字取自套件自己打印的尾行。折回的散文里出现的**每一个数字**都现取复核过。
`cli.smoke` 里有两条用例的载荷本身就是工具数的 live 取证(名字不含数字,数字在 `|` 之后的载荷里):

```
MCP tools/list 探测到中段流程模板工具 | 合并基 34 工具 / w58 tip 34 工具 / 基线 37 工具 / HEAD 37 工具
MCP tools/list 含发布留痕工具         |                w58 tip 34 工具 /              HEAD 37 工具（w58 新加的这条用例）
```

**合并基与 `w58` tip 同为 34**,即 4.2 那句"它一个工具都没加"是从这两侧的载荷直接读出来的,
不是从 `mcp.js` 的 `git diff` 推的;基线与 HEAD 同为 37,即合入没改这个数。

### 5.4 用例名集合:三份 tip 的并集,零丢失

按 `PASS|FAIL | <名>` 抽名去重成集合,与合并基、基线、对侧 tip 三份各自独立实测的名集逐条比对
(`comm -23 <名集> <HEAD名集>` 应为空):

| 套件 | 合并基 `3968658` | 基线 `9dfad8d` | `w58 @ e842dfb` | HEAD | 各自差集 |
|---|---|---|---|---|---|
| unit | 389 | 403 | 394 | **408** | 0 / 0 / 0 |
| integration | 93 | 105 | 105 | **117** | 0 / 0 / 0 |
| cli.smoke | 72 | 80 | 82 | **90** | 0 / 0 / 0 |

三份的名集**逐条都在 HEAD 名集里**,一条旧名都没消失。名集只增不减,增量即 `w58` 新加的
5 条 `release` 单测(七项核心门 / `precheck` 四码 / 两端同一份 `stamp` / 命令化出口四端齐备 /
浏览器命令表执行)、12 条 `/api/wf/release` 集成与 10 条发布留痕命令化冒烟,
**没有删测、没有改名顶替、没有把断言下限抬松**。

**`cli.smoke` 的名集比对要先归一化**(W62 立的口径):这一套件的用例名后面缀着运行期产物
(现发的项目/主体/分集 id、打版本的时间戳与 `RLS_` 摘要、探测到的工具数),同一版跑两次都不相等。
按 `|` 切掉载荷只留用例名再比,三个套件的差集才都归零(上表即归一化之后的结果)。

**`integration` 的 117 名 / 118 用例不是丢了一条**:`theirs` 的发布留痕块里那条
`项目不存在 404` 与主干拆集块里那条**同名**,去重后名集比用例数少 1。
这个重名**在 `w58` 自己的 tip 上就有**(它那边 106 用例 / 105 名),不是本槽合出来的;
按"用例名不丢"的口径**有意不改名**(改名就是动它的用例名),只在这里如实登记,
免得下一槽的读者按 `名集数 == 用例数` 去查一条不存在的丢失。

### 5.5 W53/W54/W59 有没有被旧基线冲掉:逐条实测

对侧叉在 W53/W54 之前又与它们改在同几个文件里,故逐条查它们并入后还在不在。
先看总量:`git diff 9dfad8d HEAD --numstat` 的删除行共 **162** 行,逐文件核对删除处:

| 文件 | 删除行 | 是什么 |
|---|---|---|
| `cli.js` | 93 | `_releaseGates` 与 `CMD.release` 的内联实现(被单源委托替掉,4.1)+ `exec` 参数合流那段重写 |
| `js/release.js` | 41 | `_checksum` 与 `stampRelease` 的内联实现(同上,浏览器侧) |
| `tests/unit.js` | 10 | 与下面三句配套的过期断言(改成查新链路,判据不减,4.5) |
| `README.md` | 10 | 本槽折回与四处过期修正改写的那几行(4.3、4.6) |
| `js/skills.js` | 3 | 三句过期的「`G-12` 仍挂账 / CLI 随同一次 PUT 的 meta 桶写回 / 命令化待 `G-12`」 |
| `docs/skills-wave/README.md` | 3 | 摘要三条句子改写(#7 那句取侧 + 两条自动合并区,4.7) |
| `mcp.js` | 1 | `hujing_release` 那一行(改走 `exec`,4.2) |
| `tests/integration.js` | 1 | `req()` 助手报错取值放宽(4.4) |
| `tests/cli.smoke.js` / `server.js` / `js/commands.js` / `index.html` / `js/cmd-registry.js` | **0** | 纯新增 |

删除行里**没有一行**属于 W53/W54/W59 落的代码或断言:`cli.js`/`js/release.js` 的两大块是
`w58` 把自己那两处内联实现收成单源,`js/skills.js` 与 `tests/unit.js` 的 13 行是它自己那三句
过期记账与配套断言。

再逐条抽查三条分支的落点(直读源与现取):

| 分支 | 落点 | 合入后实测 |
|---|---|---|
| W53 | `memSeed`/`memMigrateBoard` 双端单源 | `js/wf-core.js` 5 处引用在位;`cli.js` `memory seed/migrate`、`server.js` `/api/wf/memory-seed`、`mcp.js` `hujing_memory_seed` 三个 headless 出口齐备 |
| W53 | 播种/迁移的 12 条集成与冒烟断言 | 全在(4.4 两块都留);名集零丢失(5.4) |
| W54 | 未审中危 / 判旧中危 | `js/issues.js` 里 `no-review` / `review-stale` 两条在位且互斥分支未动 |
| W54 | SK-19 稳定词投影表第 7 行 | `Issues.reminders()` 现取 **7** 条,含 `shot-stable-lexicon`(`skill: 'shots.promptEightDim'`) |
| W54 | `js/issues-ui.js` 弹窗提示语里的「未审」 | 在位(W62 那槽补的那个词没被带走) |
| W59 | 投影核 UMD 与 `js/issues-ui.js` 薄封装 | 两文件本槽零改动;`window.Issues` 成员集与源级封禁断言实测绿 |
| W59 | CLI `issues` 与 MCP `hujing_issues` | 两个出口在位(`CMD.issues` 见 4.1;`mcp.js` 第 39 行) |

结论:**W53/W54/W59 一处都没被冲掉**。这一次风险比 W62 那槽低,原因不是运气好,
而是对侧改的主题(发布门/发布留痕)与那三条改的主题(记忆桶/问题中心)不重叠——
唯一相邻的一处(`cli.js` 里 `CMD.issues` 紧贴 `_releaseGates`)恰好就是那唯一一处代码冲突。

### 5.6 双端与门禁口径的行为面取证

除套件自跑外,另做两处直接对跑(都由 `w58` 自带用例承担,合入后实测绿):

- **两端同一份 `stamp`**:浏览器 `Release.stampRelease` 与直调 `ReleaseCore.stamp` 算出同一
  `checksum` 同一 `ver`;服务端 `/api/wf/release` 与 CLI `exec project.release` 写的是同一份留痕
  (`releases` 累加、`ver` 逐条递增,冒烟里两条出口交替发两次版本验证);
- **门禁一字未动**:`release-core` 的 headless 七项核心门与前端十项门的差集(G2/G7/G8 需浏览器模块)
  是有意的,`overall` 四级映射逐字同前端(G10 仍 `warn` 不抬门),`fails`/`warns` 计数口径未变——
  这一条有源级 + 行为双断言,合入后 `release` 套件全绿。

## 6. 没做什么

- **没开 PR、没合 master**:只把 `cursor/w64-integration-23c3` 推上远端。
- **没合 W61/W63/W53**:`w63-*` 远端零匹配;`w61` 与 `w53` 按任务口径排除,两条的 outstanding 提交
  一行未碰(第 2 节)。
- **没删测、没改名顶替、没抬松断言下限**:三份名集逐条包含(5.4);`w58` 改形态的那几条断言
  判据只增不减——记忆回流的写入点断言原先查 `cli.js` 自己拼 meta 桶,现在改成三条:
  发布端点的回流必须落在 `wfSave` 之前(不另起一次 state 写)、`cli.js` 里不得再出现
  `WfCore.memWrite(`(写入点已归服务端,免得两端各派生一份)、`CLI release` 段仍只发一次写入请求。
  同一件事从"查一处字面"变成"查落点次序 + 反向封禁 + 请求数",判据只增不减(4.5)。
- **没碰发布门判据与计费**:`js/release.js` 的 G1–G10 判据、`overall` 四级、`billing.js`、
  `Tasks.run` 全链本槽零改动;发布留痕两端 `meter:false` 且都不进 `Tasks.run`(5.6)。
- **没重做功能**:`w58` 已落地的实现一行未改;本槽只在 `README.md` 架构树补了一格
  (4.6,散文,零行为面)。
- **没代写别人的记账件**:W58 自己留了 `w58-sk25-publish-cmd.md`,本文不复述其内容;
  W53 那处没有记账件的缺口**仍如实留在** `w57-integration-log.md` 第 6 节代记的位置,
  本槽不补造一份 `w53-*.md`。
