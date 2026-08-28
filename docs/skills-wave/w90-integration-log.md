# W90 · 四条内联人设收编槽并入一条集成线的收敛记录(集成分支)

> 集成分支:`cursor/w90-integration-9004`,基线 `cursor/w85-integration-171f @ 2a05c72`(任务直接指定,见第 2 节)。
> 本文只记**收敛过程**:基线怎么定的、合了哪四条、每处冲突怎么解、合并后的实测数字、没删测的取证。
> 各槽的内容说明在 `w83-proj-upload-prompt.md` / `w84-sb-views-prompt.md` /
> `w86-agent-ops-prompt.md` / `w87-role-editor-prompt.md`,本文不代述、不复写。
> 四次合并都 `--no-ff`、各一个合并提交、可分别 revert;全程只解冲突与收敛双口径,**不重做已落地的功能**。

## 1. 结果一句话

按次序 `--no-ff` 合入四条内联人设收编槽:

| # | tip | 收编面 | 新增注册表键 | 登记面 |
|---|---|---|---|---|
| 1 | `w83-proj-upload-prompt-00b3@819a90d` | 拉片建集逐段画面理解步 | `rip.system` | SK-03 |
| 2 | `w84-sb-views-prompt-2934@9b647b4` | 镜头「按指令改」 | `gen.editSystem` | SK-03 |
| 3 | `w86-agent-ops-prompt-8d6f@b02b86a` | Agent 回执核验修复 / 会话纪要蒸馏 | `agent.selfFixSystem` / `agent.compactSystem` | SK-03 |
| 4 | `w87-role-editor-prompt-9c2a@fb74c31` | 主体「按指令改」 | `persona.editSystem` | SK-03 |

提示词注册表按**并集**从 29 条推到 **34 条**,合并后回归 `unit 453/453`、`integration 126/126`、
`cli.smoke 95/97`(2 项失败与 `master` 同名同表现,见 5.2)。

W88/W89 任务口径明确排除:`w88-experts-forge-prompt-a3f7@78feca2` **存在而不合**(现取 `git branch -r` 有此分支),
`w89-*` 现取远端**零匹配**、不存在。

**注册表之外一格没动**:`mcp.js` / `cli.js` / `server.js` / `js/release-core.js` / `js/issues.js` /
`js/issues-ui.js` / `js/wf-core.js` / `js/domain.js` / `js/knowledge.js` / `js/commands.js` / `js/release.js` /
`docs/AI助手接入指南.md` **逐字未动**(`git diff --name-only 2a05c72 HEAD --` 这几个路径零输出),
故 W61 回流、release-core、issues UMD、W53/W70 记账、索引契约一处没被冲掉;
现取 **MCP 工具字面仍 40 个(37 工具 + 3 提示模板)、领域命令仍 12 条、提醒投影表仍 7 条、
`KB.SECTIONS` 仍 18 条、校验面仍七面十七条、短名单仍 30 条无 `pending`、`gaps()` 仍 20 键**。

**本槽值得留下的三件方法面的事**:

1. **同一条「仍欠」段在一条集成线里被翻了三次面,每次都要连断言一起翻**。
   SK-10 / SK-11 的仍欠段在基线上点名 `js/agent-ops.js` 与 `js/sb-views.js`,
   而这条线上 W84 收掉 `sb-views`、W86 收掉 `agent-ops`、W87 收掉接替上去的 `role-editor`——
   **四次合并里这一段改了三次**,每次都要同时做三件事:改 `note` 的仍欠段、把点名那几处的
   "仍内联"反向断言改指新的锚点、给刚收掉的那处补一条**翻面后的反向断言**
   (`!owed.includes(...)` + 该文件内联计数归零)。只改 `note` 不补翻面断言,
   下一槽把它退回内联时没人报;只改断言不改 `note`,记账就与实况脱节。
   判据固定成一句:**锚点一律选"这一条集成线上不会再被收掉"的那几处**——
   本槽最终落在 `js/experts.js`(专家人设进化器)与 `js/plans.js`(制作计划器),
   两处正是窄口径 `system: ['"\`]你是` 全仓扫描现在仅剩的那 2 处。
2. **四个槽给的三张全仓名单期望串没有一个在合并后成立,而它们各自的判据还互不相同**。
   基线上压着 W78/W79/W81 三张判据不同的名单(只数系统人设位 / 数全部 `你是` 字面含注册表 `def`
   与专家库 / 三种形态且排除注册表),四个槽又各自新写了一到两条同类断言。
   一律**按合并后 live 现取重写,不采信任何一侧的字面**(逐次取值见 4.4);
   W82/W84 已收成"按 `Prompts.list()` 现推"的两条则**一次没改过**——
   这就是把名单写成现推形态的收益,本槽第一次拿到实测对照。
3. **块尾在四次里踩到三次,而三次的块尾各不相同**。
   W84 的 `tests/unit.js` 被切断的是用例块尾 `} },`、W86 的 `js/prompts.js` 被切断的是表项块尾 `},`
   加 `tests/unit.js` 的 `} },`、W87 被切断的是顶层 helper 的函数尾 `}`。
   解法同 W80 立的三步(删 `<<<<<<<` 行、把 `=======` 行**替换**成被切断的那一行块尾、删 `>>>>>>>` 行),
   但**补回去的是哪一行只能逐次看**,不能按上一次的经验默认;W83 那次两侧块尾各自完整,一个字都不能补。
   每次解完立刻 `node --check`,不靠跑测才发现语法断。

## 2. 基线与四个槽

### 2.1 基线

任务直接指定基线为 `origin/cursor/w85-integration-171f` HEAD(约 `2a05c72`)。现取核实:

```
git rev-parse --short origin/cursor/w85-integration-171f   # 2a05c72(与任务给的约值一致)
git checkout -b cursor/w90-integration-9004 origin/cursor/w85-integration-171f
```

基线三套件现取 `unit 443/443`、`integration 126/126`、`cli.smoke 95/97`,与 W85 记的收尾数字逐个相等。

### 2.2 四个槽的分叉点

| 槽 | tip | 与基线的 `merge-base` | 那条线是 |
|---|---|---|---|
| `w83-proj-upload-prompt-00b3` | `819a90d` | `fbefd0c` | W75 集成线 tip |
| `w84-sb-views-prompt-2934` | `9b647b4` | `fbefd0c` | 同上 |
| `w86-agent-ops-prompt-8d6f` | `b02b86a` | `4c45f89` | W80 集成线 tip |
| `w87-role-editor-prompt-9c2a` | `fb74c31` | `4c45f89` | 同上 |

W83/W84 的分叉点**早于 W80 那五次合并**、W86/W87 的分叉点**早于 W85 那四次合并**,
所以四个槽给出的 `README` 长行散文、`js/skills.js` 的 `note` 与三张持有者名单描述的都是**分叉那一刻的实况**。
判据沿用 W80/W85 那两句:**取"哪一侧描述的是合并后的实况",两侧各描述了一半时手工合成一句**;
名单这类可机器求值的期望串**一律 live 现取,不采信任何一侧**。

### 2.3 W83/W84 的现取:与 W85 记的不同

W85 第 2.3 节记的是"W83/W84 远端两条分支都不存在"。本槽开工时**两条都已存在**并按任务口径合入:

```
git branch -r | grep -E "w8[34]"
#   origin/cursor/w83-proj-upload-prompt-00b3
#   origin/cursor/w84-sb-views-prompt-2934
```

即 W85 那条登记不是漏合,是当时确实没有;分支是在 W85 收尾之后才推上来的。

### 2.4 W88/W89 的现取

任务口径排除 W88/W89,两条的状态**不一样**,分开记:

```
git branch -r | grep w88   # origin/cursor/w88-experts-forge-prompt-a3f7(存在,tip 78feca2,按口径不合)
git branch -r | grep w89   # 零输出(不存在)
```

W88 收的正是 `js/experts.js` 的元智能体那两处——也就是本槽第 1 节给仍欠段挑的锚点之一。
**下一槽合 W88 时那两条源级反向断言会先红**,翻面时要连记账一起翻(路障是有意留的)。

## 3. 四次合并各自的冲突面

| 合并 | 合并提交 | 冲突文件 | 冲突块数 |
|---|---|---|---|
| W83 | `c914e39` | `README.md` / `docs/skills-wave/README.md` / `js/skills.js` / `tests/unit.js` | 3 / 2 / 2 / 1 |
| W84 | `4376623` | 上四份 | 3 / 2 / 2 / 3 |
| W86 | `8ee5138` | 上四份 + `js/prompts.js` | 3 / 2 / 4 / 4 / 1 |
| W87 | `bc9a38e` | 上四份 | 3 / 2 / 3 / 1 |

`js/prompts.js` **四次里三次干净自动合并**:`rip.system` 插在 `split.system` 之后、
`gen.editSystem` 插在 `gen.promptSystem` 之后、`persona.editSystem` 插在 `persona.promptSystem` 之后,
三处插入点互不重叠也不与基线上的键相邻;只有 W86 那次撞车(它的两条 `agent.*` 插在表尾,
而基线上 `comic.bubbleSystem` 已经占着表尾),解法见 4.3。合并后 34 条键序现取:

```
split.system, rip.system, narration.system, reading.system, concept.system, light.system, dirset.system,
extract.system, voice.recommendSystem, voice.recommendBatchSystem, persona.promptSystem, persona.editSystem,
digest.planSystem, sb.boardSceneSystem, sb.boardDraftSystem, graph.system,
sb.system, sb.reviewUser, sb.reviewSystem, und.system, beat.system, gen.promptSystem, gen.editSystem,
review.system, review.sumSystem, review.finalSystem, dist.copySystem,
agent.system, agent.panelSystem, agent.drawerSystem, agent.previsSystem,
agent.selfFixSystem, agent.compactSystem, comic.bubbleSystem
```

`js/skills.js` 四次都撞在 SK-03 的 `prompts` 数组或紧跟的 `note` 上(W86 那次连 SK-10/SK-11 的仍欠段一起撞)。

## 4. 逐处怎么解

### 4.1 `docs/skills-wave/README.md`:索引行按槽号插、摘要句逐句接

四次里这份文件都是同一形态的两块:索引表尾一块、一分钟摘要那条长行一块。

- **索引表**:四侧各在表尾追加自己那行,一律**两侧的行都留**,再按槽号插到位
  (`… w82 → w83 → w84 → w85 → w86 → w87`,不是按合入次序)。四次都落在冲突块里,
  没有重现 W85 第 4.1 节那种"对侧那行在冲突块外自动合上导致同名两行"——但每次仍跑 `contract`
  那条索引契约核实(每份记账件各有自己那行 + 相对链接不许悬空)。
- **一分钟摘要那条长行**:两侧各在句尾追加自己那一段收编记录,一律**取我方 + 把对侧那段接在末尾**
  (按槽号成链:… W82 → W83 → W84 → W86 → W87)。
  接进来的那几段里的**"全仓内联人设现存 N 处"一律删掉**:那是各侧在自己分叉点上算的数,
  在这条线上既不是当时的实况也不是现在的实况;基线上 W78–W82 那几段本来就只写「**G-13 缺口仍开着**」不带数字,
  接进来的四段按同一形态收齐(余量的机器可查判据在 `tests/unit.js` 的三张名单上,散文里不再各写一个数)。
- W86/W87 那两段里"SK-10 与 SK-11 的仍欠段随之只剩 X"**按合并后 live 改写**——
  W86 原文写的是"只剩 `js/sb-views.js`",而 `sb-views` 在这条线上已被 W84 收掉。

### 4.2 `README.md` 三处冲突:取我方 + 把对侧那段原样接进去

三处每次都一样,沿用 W80/W85 记的解法:

1. **skill 索引那段的「N 条注册表提示词」**——取我方长行(它含主干后来落的全部描述),只把数字改成现取值。
2. **prompts 文件化那段的长行枚举 + 逐键描述**——取我方,再把对侧新增的词与整句原样插进对应位置:
   枚举位置按**注册表键序**插到它的邻居后面(`拉片建集人设` 接在剧本拆集之后、
   `主体按指令改人设` 接在八维度重写之后、`按指令改分镜提示词人设` 接在视频提示词改写之后、
   `Agent 执行回执核验修复人设`/`Agent 会话纪要蒸馏人设` 接在 Agent 预排模式之后);
   描述句按对侧原文的相对次序接进各自那一段。
3. **`node tests/unit.js` 那行的用例数**——四侧给的都是过期值,现取。

第 3 处那一行里还夹着一句 SK-10/SK-11 记账的点名描述,四侧写的锚点各不相同且**全都过期**,
一并按 4.5 的结论改成 live(现点名 `js/experts.js` 与 `js/plans.js`,已收编的六个文件反向钉住)。

### 4.3 `js/prompts.js` 唯一那次撞车:两侧同抢表尾

W86 的两条 `agent.*` 与基线上的 `comic.bubbleSystem` 都落在表尾,`git` 把两侧报成一块,
且**块尾那行 `},` 落在冲突块之后由两侧共用**。机械两留会得到一条缺 `},` 的表项字面,`node --check` 当场断。
解法:按三步补回块尾之后,再按语义把两块**排成并集**——两条 `agent.*` 挪到 `agent.previsSystem` 之后
(与 Agent 家族相邻,是 W86 自己的登记意图),`comic.bubbleSystem` 仍留表尾(是 W79 自己的登记意图)。
两侧的意图都保住,`Prompts.list()` 的键序不出现第二种解读。

### 4.4 三张持有者名单按合并后 live 逐次重写

三张名单的判据各不相同,四次合并里每张都要重算。逐次取值:

| 名单 | 立于 | 判据 | 合 W83 后 | 合 W84 后 | 合 W86 后 | 合 W87 后 |
|---|---|---|---|---|---|---|
| A `inlinePersonaHolders()` | W78 | 顶层 helper,`system:`/`content:`/`=` 后紧跟 `你是`,扫 `js/*.js` + 四个 Node 端 | 7 文件 9 处 | 6 文件 8 处 | 5 文件 6 处 | **4 文件 6 处** |
| B `census` | W79 | 全部 `['"\`]你是` 字面,含注册表 `def` 与 `js/experts-data.js` | 12 文件 | 11 文件 | 10 文件 | **9 文件** |
| C 局部 `inlinePersonaHolders` | W81 | `system:` 值位 / 具名人设常量 / 直接 `return`,排除 `js/prompts.js` | 7 文件 9 处 | 6 文件 8 处 | 5 文件 6 处 | **4 文件 5 处** |

> A 与 C 在 W86 之后处数相同、文件集不同(A 有 `js/proj-planner.js:2` 无 `js/wf-core.js`,C 反之),
> 这是两张判据本来的差额,不是谁数错了。

四个槽给的期望串分别是 `14 处`(W83)、`14 处`(W84)、`9 处`(W86)、`10 处`(W87),
**没有一个在合并后成立**——它们记的都是各自分叉那一刻的实况。
一律用与用例内同一段判据的脚本现扫全仓后重写,再跑一次确认落在同一串上。

B 那张名单里 `js/prompts.js:N` 那一行**随注册表条数走**(它把 `def` 也计进去),
四次合并里从 `28`(基线)一路改到 `33`;紧跟的那条
`Prompts.list().filter(x => x.def.startsWith('你是')).length` 同步改成 `33`
(34 条键里 `sb.reviewUser` 是评审指令不以「你是」开头)。

**W82/W84 那两条"按注册表现取"的名单一次没改过**:它们逐条扫 `Prompts.list()` 的 `def`,
新增键自动进名单。四次合并加了 5 个键,两条都是自动跟上——与上表那三张逐次手改形成直接对照。

### 4.5 「仍欠」段三次翻面(本槽的主要工作量)

SK-10(`script.aiToneBan`)与 SK-11(`subjects.refDiscipline`)的 `note` 里各有一段「仍欠」,
点名 G-13 的余量落在哪几处,并各配一条"那几处此刻确实还在内联"的源级反向断言。逐次取值:

| 合并 | 仍欠段点名 | 同时补的翻面断言 |
|---|---|---|
| 基线 | `js/agent-ops.js` + `js/sb-views.js` | — |
| W84 后 | `js/agent-ops.js` + `js/role-editor.js` | (`sb-views` 那一处随 W84 自带的用例钉住) |
| W86 后 | `js/role-editor.js` | `!owed.includes('js/agent-ops.js')` + 该文件内联计数归零 |
| W87 后 | **`js/experts.js` + `js/plans.js`** | `!owed.includes('js/role-editor.js')` + 该文件内联计数归零 |

**两侧的仍欠段一律逐句合并、不取侧**:W86 那侧的仍欠段自带查 `js/sb-views.js` 的断言、
我方那侧自带查 `js/agent-ops.js`/`js/role-editor.js` 的断言,取任一侧都会让另一侧的断言当场红。
合成后的仍欠段锚点一个不少,且每一个都逐处对照过源码实况。

W87 之后落在 `js/experts.js` 与 `js/plans.js` 是**有意选的**:这两处是窄口径
`system: ['"\`]你是` 全仓扫描仅剩的 2 处,且不在本槽任何一个槽的收编面里,不会在这条线上再翻一次面。
W88 收的就是 `js/experts.js` 那两处——见 2.4 的路障登记。

### 4.6 `tests/unit.js`:整块两留,块尾按实况补,同名 helper 只留一份

七处用例块冲突里,大多数是"两侧在同一插入点各加整块用例",一律两留。其中:

- **W84 / W86 两次的用例块**块尾 `} },` 落在冲突块之后由两侧共用,按 W80 三步解法补回。
- **W87 那次**切断的是顶层 helper 的函数尾 `}`(不是用例块尾),补的那一行与前两次**不是同一行**。
- **W83 那次两侧块尾各自完整**,直接两留,不能按经验去补——补了就是多一个 `} },`。
- **W84 带来一份与基线逐字节相同的 `personaSubject()` 顶层 helper**(两块都留就是同名两份、
  后定义的静默赢,即 W80 记的那个坑),**删掉后来的那一份、只留基线那份**;
  同块带来的 `sbViewsCommentGen()` 是新名字,原样留下。

另有一处**全称断言碰上有意同值组**:W84 带来 `new Set(defs).size === list.length`
(注册表各条 `def` 互不相同),而基线上 W73 有意把音色推荐留成两条同 `def` 的键。
按 W85 第 4.5 节立的判据**收窄不放宽**——改写成"同 `def` 的键组恰好只有音色推荐那一组",
别处再抄第二份仍红,把那两条合成一键也红。

## 5. 实测与取证

### 5.1 三套件数字

| 套件 | 基线 `2a05c72` | 合并后 HEAD `bc9a38e` |
|---|---|---|
| `node tests/unit.js` | 443/443 | **453/453** |
| `node tests/integration.js` | 126/126 | **126/126** |
| `node tests/cli.smoke.js` | 95/97 | **95/97** |

`README.md` 的「单元测试(N 项断言)」「N 条注册表提示词」「N 条主线 LLM 提示词」与
`docs/skills-wave/README.md` 的「提示词在 `js/prompts.js`(N 条)」四处都按现取值改过,
`contract` 那两条 README 数字对账用例守着前三处。

### 5.2 `cli.smoke` 那 2 项失败:与 `master` 同名同表现

`master @ 9adcf0f` 独立 worktree 现跑 `51/53`,失败两条:

```
FAIL | 未登录 whoami → exit 3 | exit=1
FAIL | llm --json mock 链路 | undefined
```

本槽 HEAD `95/97`,失败两条**同名同表现**。基线数不同是因为主干这些槽里 cli.smoke 用例本来就多,
两侧各自的失败集合相同——即本槽没引入新的 CLI 失败。

### 5.3 零吃测:用例数增量相加恰等于合并后 live

对每个 tip 现取它相对自己 `merge-base` 的用例增量,和基线相加:

| 槽 | `merge-base` | 该点用例数 → tip 用例数 | 增量 |
|---|---|---|---|
| `w83` | `fbefd0c` | 428 → 430 | +2 |
| `w84` | `fbefd0c` | 428 → 431 | +3 |
| `w86` | `4c45f89` | 435 → 437 | +2 |
| `w87` | `4c45f89` | 435 → 438 | +3 |

`443 + 2 + 3 + 2 + 3 = 453`,与合并后 live 实测**逐个相等**——没有任何一条用例被冲突解法吃掉。

名集另做一次双向对照:把四个 tip 与基线的 `unit` / `integration` / `cli.smoke` 三套件用例名抽出来排序,
与合并后逐份 `comm -23`,**十五次全空**(即任一侧有的名字合并后都还在)。
抽名时**先按 `|` 切掉回执载荷再比**(`cli.smoke` 有若干条用例的输出行里带着本次跑生成的
项目 id / `digest` / 时间戳,连载荷一起比会假报缺失)。

### 5.4 G-13 现况:三张名单各自的余量,标记一个不摘

三张名单口径不同故**不互相折算**,各自现取(见 4.4 表末列)。按 A 名单逐文件盘点余量 4 文件 6 处:

| 文件 | 余量 | 是什么 |
|---|---|---|
| `js/agent-global.js` | 1 | 意图路由器 |
| `js/experts.js` | 2 | 专家人设进化器、专家 skill 生成器(元智能体) |
| `js/plans.js` | 1 | 制作计划器 |
| `js/proj-planner.js` | 2 | 短剧策划/编剧、出海本土化译制专家 |

(C 名单少 `js/proj-planner.js:2`、多一个 `js/wf-core.js:1`——那是单镜审片的 user 半,A 名单有意不计;
两张的差额全在这两条例外上。)

**`js/proj-upload.js` / `js/sb-views.js` / `js/agent-ops.js` / `js/role-editor.js` 四个文件至此内联人设归零**,
但 `G-13` 缺口没闭合,按 W36 立的关联索引口径**一个标记不摘**——
`Skills.gaps()` 仍 20 键、`G-13` 那六条值逐字节不变(有用例钉住)。

### 5.5 点名要保的六处逐条现查

| 要保的 | 现查 |
|---|---|
| 回流(W61 SK-26 主线前段四步) | `js/wf-core.js` 逐字未动;`memory` 套件全绿;`integration` 里前段三步回流那组全绿 |
| release | `js/release-core.js` / `js/release.js` 逐字未动;`cli.smoke` 的 `release`/`exec project.release` 那组全绿 |
| issues | `js/issues.js` / `js/issues-ui.js` 逐字未动;`Issues.reminders()` 现取 7 条 |
| 记账(W53 / W70 / W85) | 三份记账件都在;索引行都在;`git merge-base --is-ancestor 2a05c72 HEAD` → 0 |
| 索引契约 | `contract` 套件那条全绿,四份新记账件都补了索引行 |
| 数字对账契约 | `contract` 两条 README 数字对账全绿(用例数 453 / 提示词 34 都由代码实况反推) |

## 6. 剩余未合与残留

- **W88 存在而不合**:`w88-experts-forge-prompt-a3f7@78feca2`,任务口径排除。它收的正是
  `js/experts.js` 元智能体那两处,而本槽把 SK-10/SK-11 的仍欠段锚点落在那里——
  **下一槽合它时那两条源级反向断言会先红,翻面时要连记账一起翻**(见 2.4)。
- **W89 不存在**:现取远端零匹配,不是"存在而不合"。
- **`G-13` 仍开着**:余量见 5.4。摘标记的判据不变——"全仓再无内联人设",
  且要一次改齐六条关联索引的 `gaps` 与 `note`。
- **三张持有者名单口径仍未统一**:W85 第 6 节登记的这条本槽**仍没做**——
  合并判据(哪些形态算内联人设、注册表与专家库计不计)是产品口径不是收敛口径,越权合并等于替三个槽改判据。
  但本槽拿到了一条新证据:W82/W84 那两条"按注册表现取"的名单在四次合并里**一次没改过**,
  而这三张逐次手改了四次——统一时值得往现推形态收。
- **`G-10`(审片语义面)、`G-11`(自进化仍是人手动作且只对自定义专家开放)** 两条未动。
- 本槽只解冲突与收敛双口径,**没有新增功能、没有改任何判据的口径**;
  唯一的语义改动是 4.6 那条全称断言按实况收窄,以及三张名单期望串与仍欠段锚点按 live 重写,都跟着实况走。
