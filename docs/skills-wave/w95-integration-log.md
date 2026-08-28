# W95 · 四条内联人设收编槽并入一条集成线的收敛记录(集成分支)

> 集成分支:`cursor/w95-integration-7c2e`,基线 `cursor/w90-integration-9004 @ 35695c8`(任务直接指定,见第 2 节)。
> 本文只记**收敛过程**:基线怎么定的、合了哪四条、每处冲突怎么解、合并后的实测数字、没删测的取证。
> 各槽的内容说明在 `w88-experts-forge-prompt.md` / `w89-plans-prompt.md` /
> `w91-intent-router-prompt.md` / `w92-proj-planner-prompt.md`,本文不代述、不复写。
> 四次合并都 `--no-ff`、各一个合并提交、可分别 revert;全程只解冲突与收敛双口径,**不重做已落地的功能**。

## 1. 结果一句话

按次序 `--no-ff` 合入四条内联人设收编槽:

| # | tip | 合并提交 | 收编面 | 新增注册表键 | 登记面 |
|---|---|---|---|---|---|
| 1 | `w88-experts-forge-prompt-a3f7@f4525ce` | `4c01a9c` | 专家工坊锻造器 / 自进化进化器 | `forge.system` / `forge.evolveSystem` | SK-02 / SK-26 |
| 2 | `w89-plans-prompt-835b@77e0ff8` | `70586df` | 制作计划 LLM 规划步 | `plan.system` | SK-03 |
| 3 | `w91-intent-router-prompt-6ea6@80742f6` | `3acea6d` | 全局抽屉意图路由辅助步 | `agent.routeSystem` | SK-03 |
| 4 | `w92-proj-planner-prompt-b845@3f68c87` | `b5f34f4` | 项目实验台 AI 策划对话 / 剧本译制 | `planner.chatSystem` / `trans.localizeSystem` | SK-03 |

提示词注册表按**并集**从 34 条推到 **40 条**,合并后回归 `unit 461/461`、`integration 126/126`、
`cli.smoke 95/97`(2 项失败与 `master` 同名同表现,见 5.2)。

W93/W94 任务口径明确排除:现取远端 `git branch -r | grep -E "w9[34]"` **零匹配、两条都不存在**,
故不是"存在而不合"(与 W90 记 W88/W89 时那种一存一缺的情形不同)。

**注册表之外一格没动**:`mcp.js` / `cli.js` / `server.js` / `js/release-core.js` / `js/release.js` /
`js/issues.js` / `js/issues-ui.js` / `js/wf-core.js` / `js/domain.js` / `js/knowledge.js` / `js/commands.js` /
`docs/AI助手接入指南.md` **逐字未动**(`git diff --name-only 35695c8 HEAD --` 这几个路径零输出),
故 W61 回流、release-core、issues UMD、W53/W70/W85/W90 记账、索引契约一处没被冲掉;
现取 **MCP 工具字面仍 40 个、领域命令仍 12 条、提醒投影表仍 7 条、`KB.SECTIONS` 仍 18 条、
校验面仍七面十七条、短名单仍 30 条无 `pending`、`gaps()` 仍 20 键、预置专家仍 16 位**。

**本槽值得留下的四件方法面的事**:

1. **W90 有意留下的那个路障如期先红,而且一条线上连翻了四次面**。
   基线上 SK-10 / SK-11 的仍欠段点名 `js/experts.js` 与 `js/plans.js`,
   这条线上 W88 收掉 `experts`、W89 收掉 `plans`、W91 收掉接替上去的 `agent-global`、
   W92 收掉最后接替的 `proj-planner`——**四次合并这一段改了四次**,每次三件事一起做
   (改 `note` 的仍欠段、把反向断言改指新锚点、给刚收掉的那处补一条翻面后的反向断言)。
   与 W90 不同的是:**这次没有"这条线上不会再被收掉"的窄口径锚点可挑了**——
   W78 那张判据(`system:`/`content:`/`=` 后紧跟人设句)下的余量四个文件全在本槽的收编面里,
   合完 W92 之后这张名单**归零**。仍欠段因此改指判据更宽那张名单还计着的那一处:
   单镜视频审片(`js/wf-core.js` 的 `buildReviewPrompt`)把人设句写在 **user 半开头**,
   `system` 半的 `review.system` 早在表里、这一句一直不在。它不在本槽任何一个槽的收编面里,
   也不匹配 W78 那张判据(`return` 形态有意排除),所以既是真余量也是稳定锚点。
2. **一张名单归零时,归零本身要配一条"例外仍在"的正向断言**。
   `holders.join(' ')` 期望串改成空串之后,这条用例就只剩"没有人新长出内联人设"这一向;
   而它归零的原因里有一半是判据有意不含 `return` 形态。故同处补一条
   `/return \`你是专业 AI 视频审片组/` 的正向断言——把这张名单的**已知例外写成机器可查的**,
   将来收编那一处时这条与两条记账一并转红,不会出现"名单空着而余量还在"却没人报的状态。
   **`G-13` 标记一个不摘**:摘标记的判据仍是"全仓再无内联人设",而按判据更宽那张名单
   现在还有一处,`gaps()` 仍 20 键、`G-13` 那六条值逐字节不变(有用例钉住)。
3. **块尾 `} },` 四次里踩到三次,而三次要补的行数与位置各不相同**。
   W88 那次被切断的是**用例块尾**(补 `  } },` 到 `=======` 那一行的位置)、
   W89 与 W92 同形、W91 那次三处冲突**两侧块尾各自完整,一个字都不能补**。
   `js/prompts.js` 那两次撞车里还踩到一个新坑:我方那块 + 对侧那块 + 冲突块之后**两侧共用的那一行 `},`**,
   按"每块各补一个块尾"机械补就会多出一个 `},`,`node --check` 当场断在 `Unexpected token '}'`。
   判据固定成一句:**先数清共用的那一行落在谁名下,只给另一侧补**——本槽两次都是共用那行归表尾那个键。
4. **四个槽给的三张全仓名单期望串没有一个在合并后成立,而按注册表现推的那两条一次没改过**。
   与 W90 记的完全同形,本槽是第二次实测对照:三张逐文件手写处数的名单
   (W78 只数系统人设位 / W79 数全部 `你是` 字面含注册表 `def` 与专家库 / W81 三种形态且排除注册表)
   在四次合并里**每次都要重算**(逐次取值见 4.4),而 W82/W84 收成"逐条扫 `Prompts.list()` 的 `def`"
   那两条**四次合并加了 6 个键、一个字没改**。这条证据现在有两条集成线各一次。

## 2. 基线与四个槽

### 2.1 基线

任务直接指定基线为 `origin/cursor/w90-integration-9004` HEAD(约 `35695c8`)。现取核实:

```
git rev-parse --short origin/cursor/w90-integration-9004   # 35695c8(与任务给的约值一致)
git checkout -b cursor/w95-integration-7c2e origin/cursor/w90-integration-9004
```

基线三套件现取 `unit 453/453`、`integration 126/126`、`cli.smoke 95/97`,与 W90 记的收尾数字逐个相等。

### 2.2 四个槽的分叉点

| 槽 | tip | 与基线的 `merge-base` | 那条线是 |
|---|---|---|---|
| `w88-experts-forge-prompt-a3f7` | `f4525ce` | `4c45f89` | W80 集成线 tip |
| `w89-plans-prompt-835b` | `77e0ff8` | `4c45f89` | 同上 |
| `w91-intent-router-prompt-6ea6` | `80742f6` | `2a05c72` | W85 集成线 tip |
| `w92-proj-planner-prompt-b845` | `3f68c87` | `2a05c72` | 同上 |

W88/W89 的分叉点**早于 W85 那四次合并与 W90 那四次合并**、W91/W92 的分叉点**早于 W90 那四次合并**,
所以四个槽给出的 `README` 长行散文、`js/skills.js` 的 `note` 与三张持有者名单描述的都是**分叉那一刻的实况**。
判据沿用 W80/W85/W90 那两句:**取"哪一侧描述的是合并后的实况",两侧各描述了一半时手工合成一句**;
名单这类可机器求值的期望串**一律 live 现取,不采信任何一侧**。

### 2.3 W89 的现取:与 W90 记的不同

W90 第 2.4 节记的是"`w89-*` 现取远端零匹配、不存在"。本槽开工时**该分支已存在**并按任务口径合入:

```
git branch -r | grep w89   # origin/cursor/w89-plans-prompt-835b(tip 77e0ff8)
```

即 W90 那条登记不是漏合,是当时确实没有;分支是在 W90 收尾之后才推上来的。
W88 那条 W90 记成"存在而不合",本槽第一顺位合入,它留下的两条源级反向断言如期先红(见 4.5)。

### 2.4 W93/W94 的现取

任务口径排除 W93/W94。两条的状态与 W90 记 W88/W89 时不同——**都不存在**:

```
git branch -r | grep -E "w9[34]"   # 零输出
```

即这一条不是"存在而不合"的路障登记,只是如实记下现取为空。

## 3. 四次合并各自的冲突面

| 合并 | 合并提交 | 冲突文件 | 冲突块数 |
|---|---|---|---|
| W88 | `4c01a9c` | `README.md` / `docs/skills-wave/README.md` / `js/prompts.js` / `tests/unit.js` | 3 / 2 / 1 / 1 |
| W89 | `70586df` | 上四份 + `js/skills.js` | 3 / 1 / 1 / 3 / 1 |
| W91 | `3acea6d` | `README.md` / `docs/skills-wave/README.md` / `js/skills.js` / `tests/unit.js` | 3 / 1 / 2 / 3 |
| W92 | `b5f34f4` | 上四份 | 3 / 2 / 2 / 3 |

`js/prompts.js` **四次里两次干净自动合并**:`agent.routeSystem` 插在 `agent.drawerSystem` 之后、
`planner.chatSystem`/`trans.localizeSystem` 插在 `light.system` 之后,两处插入点互不重叠也不与表尾相邻;
W88 与 W89 那两次都撞在表尾(基线上 `comic.bubbleSystem` 占着表尾),解法见 4.3。

`js/skills.js` **第一次合并干净自动合上**(W88 的两条键各归 SK-02/SK-26,不动 SK-03 的 `prompts` 数组),
后三次都撞在 SK-03 的 `prompts` 数组或紧跟的 `note` 上。合并后 40 条键序现取:

```
split.system, rip.system, narration.system, reading.system, concept.system, light.system,
planner.chatSystem, trans.localizeSystem, dirset.system, extract.system,
voice.recommendSystem, voice.recommendBatchSystem, persona.promptSystem, persona.editSystem,
digest.planSystem, sb.boardSceneSystem, sb.boardDraftSystem, graph.system,
sb.system, sb.reviewUser, sb.reviewSystem, und.system, beat.system,
gen.promptSystem, gen.editSystem, review.system, review.sumSystem, review.finalSystem, dist.copySystem,
agent.system, agent.panelSystem, agent.drawerSystem, agent.routeSystem, agent.previsSystem,
agent.selfFixSystem, agent.compactSystem, plan.system, forge.system, forge.evolveSystem, comic.bubbleSystem
```

## 4. 逐处怎么解

### 4.1 `docs/skills-wave/README.md`:索引行按槽号插、摘要句逐句接

四次里这份文件的形态与 W90 记的相同,但**只有两次连摘要那条长行一起冲突**(W89/W91 只改了索引行与条数):

- **索引表**:四侧各在表尾追加自己那行,一律**两侧的行都留**,再按槽号插到位
  (`… w87 → w88 → w89 → w90 → w91 → w92`,不是按合入次序)。每次都跑 `contract` 那条索引契约核实。
- **一分钟摘要那条长行**:W88 与 W92 各带一段,一律**取我方 + 把对侧那段接在末尾**。
  段界不按 `difflib` 给的首个差异字符切,而是**回退到最近一个句号之后**再切——
  两侧的公共前缀会在段首那几个字里咬合(实测切在 `**W8` / `9 点名…` 之间),按字符切会把段首撕成半句。
- 接进来的两段里的**余量数字一律删掉**:W88 那段写的"由 11 处降到 10 处 / 真实余量是 11 处"、
  W92 那段写的"内联人设那张 8 文件 11 处 → 7 文件 9 处",都是各侧在自己分叉点上算的数,
  在这条线上既不是当时的实况也不是现在的实况;两段各自的**方法面结论保留**
  (常量形态不匹配 `system: '你是` 那个计数口径;三张名单要逐张按 live 重算)。
- W88 那段里还有一句**在本槽内就过期**的举例:它拿 `js/agent-global.js` 的局部常量当"该口径漏计"的例子,
  而 W91 正好把那一处收掉。合 W91 时按 live 改写成只说这一类形态(不点名已收掉的那处),
  这是"接进来的散文也要跟着这条线的实况走"的一个现成样本。

### 4.2 `README.md` 三处冲突:取我方 + 把对侧那段原样接进去

三处每次都一样,沿用 W80/W85/W90 记的解法:

1. **skill 索引那段的「N 条注册表提示词」**——取我方长行(它含主干后来落的全部描述),只把数字改成现取值。
   四侧给的都是 `26`/`27`/`30`/`31`,与合并后的 `36`/`37`/`38`/`40` 逐次不同。
2. **prompts 文件化那段的长行枚举 + 逐键描述**——取我方,再把对侧新增的词与整句原样插进对应位置:
   枚举位置按**注册表键序**插到它的邻居后面(`专家工坊锻造器/自进化进化器人设` 与 `制作计划生成人设`
   接在 `Agent 会话纪要蒸馏人设` 之后、`Agent 意图路由人设` 接在 `Agent 全局抽屉人设` 之后、
   `AI 策划对话人设/剧本译制人设` 接在 `全剧光影总控人设` 之后);
   描述句一律按**对侧原文的相对次序**接进去——四侧的那一段在自己那侧都紧贴
   「其中视频提示词改写人设(`gen.promptSystem`)有两个取用口」之前,故四段都插在这个锚点之前成链。
3. **`node tests/unit.js` 那行的用例数**——四侧给的都是过期值,现取。

第 3 处那一行里还夹着一句 SK-10/SK-11 记账的点名描述,四侧写的锚点各不相同且**全都过期**,
一并按 4.5 的结论逐次改成 live(最终点名单镜视频审片那一处,已收编的十个文件反向钉住)。

### 4.3 `js/prompts.js` 两次撞车:两侧同抢表尾,共用块尾只补一次

W88 的两条 `forge.*`、W89 的 `plan.system` 都落在表尾,而基线上 `comic.bubbleSystem` 已经占着表尾,
`git` 把两侧报成一块,且**块尾那行 `},` 落在冲突块之后由两侧共用**。按语义排并集:

- `plan.system` 接在 Agent 家族之后(它的 `def` 就是「虎鲸导演助手」的另一条产物线,与 `agent.selfFixSystem`
  同族相邻),这也满足 W89 自己那条"排在对话四条之后"的断言;
- `forge.*` 接在 `plan.system` 之后(W89 的登记意图是紧跟对话四条,W88 的登记意图是"排在主线各步与
  Agent 各模式之后",两者同时成立),并满足 W88 的两条键序断言(`forge.evolveSystem` 紧跟 `forge.system`、
  `forge.system` 在 `agent.previsSystem` 之后);
- `comic.bubbleSystem` 仍留表尾(是 W79 自己的登记意图)。

**共用的那一行 `},` 归表尾那个键**:第一次解的时候给两块各补了一个块尾,多出来的那个
让 `node --check` 当场断在 `Unexpected token '}'`。判据固定成一句:**先数清共用的那一行落在谁名下,只给另一侧补**。

### 4.4 三张持有者名单按合并后 live 逐次重写

三张名单的判据各不相同,四次合并里每张都要重算。逐次取值:

| 名单 | 立于 | 判据 | 合 W88 后 | 合 W89 后 | 合 W91 后 | 合 W92 后 |
|---|---|---|---|---|---|---|
| A `inlinePersonaHolders()` | W78 | 顶层 helper,`system:`/`content:`/`=` 后紧跟 `你是`,扫 `js/*.js` + 四个 Node 端 | 3 文件 4 处 | 2 文件 3 处 | 1 文件 2 处 | **0 文件 0 处** |
| B `census` | W79 | 全部 `['"\`]你是` 字面,含注册表 `def` 与 `js/experts-data.js` | 8 文件 | 7 文件 | 6 文件 | **5 文件** |
| C 局部 `inlinePersonaHolders` | W81 | `system:` 值位 / 具名人设常量 / 直接 `return`,排除 `js/prompts.js` | 3 文件 3 处 | 2 文件 2 处 | 1 文件 1 处 | **1 文件 1 处** |

另有一张**窄口径计数**(`system: ['\`]你是` 全仓求和,W87 立的)四次里从 `2` 一路改到 `0`。

四个槽给的期望串分别是 `9 处`(W88)、`9 处`(W89)、`9 处`(W91)、`9 处`(W92),
**没有一个在合并后成立**——它们记的都是各自分叉那一刻的实况。
一律用与用例内同一段判据的脚本现扫全仓后重写,再跑一次确认落在同一串上。

A 与 C 在合完 W92 之后**分道**:A 归零、C 仍剩 `js/wf-core.js:1`。
差额全在那一条例外上——单镜视频审片的人设句写在 user 半、是 `return` 形态,A 的判据有意不含 `return`。
**这是两张判据本来的差额,不是谁数错了**,仍按 W85 立的口径不互相折算。

B 那张名单里 `js/prompts.js:N` 那一行**随注册表条数走**,四次合并里从 `33`(基线)一路改到 `39`;
紧跟的那条 `Prompts.list().filter(x => x.def.startsWith('你是')).length` 同步改成 `39`
(40 条键里 `sb.reviewUser` 是评审指令不以「你是」开头)。

**W82/W84 那两条"按注册表现取"的名单一次没改过**:它们逐条扫 `Prompts.list()` 的 `def`,
新增键自动进名单。四次合并加了 6 个键,两条都是自动跟上——与上表那三张逐次手改形成第二次直接对照。

### 4.5 「仍欠」段四次翻面,且最后一次没有窄口径锚点可挑(本槽的主要工作量)

SK-10(`script.aiToneBan`)与 SK-11(`subjects.refDiscipline`)的 `note` 里各有一段「仍欠」,
点名 G-13 的余量落在哪几处,并各配一条"那几处此刻确实还在内联"的源级反向断言。逐次取值:

| 合并 | 仍欠段点名 | 同时补的翻面断言 |
|---|---|---|
| 基线 | `js/experts.js` + `js/plans.js` | — |
| W88 后 | `js/agent-global.js` + `js/plans.js` + `js/proj-planner.js` | `!owed.includes('js/experts.js')` + 该文件 `system:` 计数归零 + `!/const FORGE_SYS = /`(常量形态另钉) |
| W89 后 | `js/agent-global.js` + `js/proj-planner.js` | `!owed.includes('js/plans.js')` + 该文件内联计数归零 |
| W91 后 | `js/proj-planner.js` | `!owed.includes('js/agent-global.js')` + **按常量形态钉** `!/(?:const|let|var)\s+\w+\s*=\s*[\`']你是/` |
| W92 后 | **`js/wf-core.js`(单镜视频审片的 user 半)** | `!owed.includes('js/proj-planner.js')` + 该文件 `content:` 计数归零 |

三处要点:

1. **翻面断言用哪条正则只能逐处看**。W88 收的 `FORGE_SYS` 与 W91 收的 `sys` 都是**局部常量形态**,
   拿 `system: ['\`]你是` 去钉是钉不住的(它们本来就不匹配,断言恒真);
   W92 收的两处是 `content:` 值位,拿 `system:` 也钉不住。四次的正则各按被收那处的真实形态选。
2. **"已收编"那句必须写在「仍欠」之前**。W89 那次把新加的"`js/plans.js` 随之归零"一句写在了
   仍欠句之后,切出来的仍欠段仍带 `js/plans.js` 字面而当场红——与 W86 记的那个洞同形,踩了第二次。
3. **最后一次没有"这条线上不会再被收掉"的窄口径锚点了**。A 判据下的余量四个文件全在本槽收编面里,
   合完就是零。仍欠段因此改指 C 判据仍计的 `js/wf-core.js` 那一处(见第 1 节第 1 条),
   并在 A 名单归零处补一条"例外仍在"的正向断言(见第 1 节第 2 条)。

### 4.6 `tests/unit.js`:整块两留,块尾按实况补

八处用例块冲突里,大多数是"两侧在同一插入点各加整块用例",一律两留。其中:

- **W88 / W89 / W92 三次**块尾 `} },` 落在冲突块之后由两侧共用,按 W80 三步解法
  (删 `<<<<<<<` 行、把 `=======` 行**替换**成被切断的那一行块尾、删 `>>>>>>>` 行)补回我方那一行。
- **W91 那三处**两侧块尾各自完整(冲突全落在名单期望串那几行上),直接取我方,一个字都不能补。
- 四次都逐次查过**同名顶层 helper**(W80 记的那个坑):四个槽的用例块里没有新增顶层 helper,
  没有重现 W90 那次 `personaSubject()` 两份的情形。
- 每次解完立刻 `node --check`,不靠跑测才发现语法断——本槽 `js/prompts.js` 那个多括号就是这样捞出来的。

## 5. 实测与取证

### 5.1 三套件数字

| 套件 | 基线 `35695c8` | 合并后 HEAD `b5f34f4` |
|---|---|---|
| `node tests/unit.js` | 453/453 | **461/461** |
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
| `w88` | `4c45f89` | 435 → 437 | +2 |
| `w89` | `4c45f89` | 435 → 437 | +2 |
| `w91` | `2a05c72` | 443 → 445 | +2 |
| `w92` | `2a05c72` | 443 → 445 | +2 |

`453 + 2 + 2 + 2 + 2 = 461`,与合并后 live 实测**逐个相等**——没有任何一条用例被冲突解法吃掉。

名集另做一次双向对照:把四个 tip 与基线的 `unit` / `integration` / `cli.smoke` 三套件用例名抽出来排序,
与合并后逐份 `comm -23`,**十五次全空**(即任一侧有的名字合并后都还在)。
抽名时**先按 `|` 切掉回执载荷再比**(`cli.smoke` 有若干条用例的输出行里带着本次跑生成的
项目 id / `digest` / 时间戳,连载荷一起比会假报缺失)。

### 5.4 G-13 现况:A 名单归零而缺口未闭合

三张名单口径不同故**不互相折算**,各自现取(见 4.4 表末列):

| 名单 | 合并后余量 | 是什么 |
|---|---|---|
| A(W78 判据) | **0 文件 0 处** | 该判据下全仓已收净 |
| C(W81 判据) | 1 文件 1 处 | `js/wf-core.js` 单镜视频审片的人设句(写在 user 半开头,`return` 形态) |
| B(W79 普查) | 5 文件 | `js/api.js:2`(两处兜底缺省)、`js/experts-data.js:16`(预置专家 persona)、`js/gsettings.js:1`(占位文案)、`js/prompts.js:39`(注册表 `def` 本身)、`js/wf-core.js:1`(同 C 那一处) |

**`js/experts.js` / `js/plans.js` / `js/agent-global.js` / `js/proj-planner.js` 四个文件至此内联人设归零**
(累计到基线那六个,已收编并反向钉住的共十个文件),
但 `G-13` 缺口**没闭合**——按 C 判据还剩一处,按 W36 立的关联索引口径**一个标记不摘**:
`Skills.gaps()` 仍 20 键、`G-13` 那六条值逐字节不变(有用例钉住)。

### 5.5 点名要保的六处逐条现查

| 要保的 | 现查 |
|---|---|
| 回流(W61 SK-26 主线前段四步) | `js/wf-core.js` 逐字未动;`memory` 套件全绿;`integration` 里前段三步回流那组全绿 |
| release | `js/release-core.js` / `js/release.js` 逐字未动;`cli.smoke` 的 `release`/`exec project.release` 那组全绿 |
| issues | `js/issues.js` / `js/issues-ui.js` 逐字未动;`Issues.reminders()` 现取 7 条 |
| 记账(W53 / W70 / W85 / W90) | 四份记账件都在;索引行都在;`git merge-base --is-ancestor 35695c8 HEAD` → 0 |
| 索引契约 | `contract` 套件那条全绿,四份新记账件都补了索引行 |
| 数字对账契约 | `contract` 两条 README 数字对账全绿(用例数 461 / 提示词 40 都由代码实况反推) |

## 6. 剩余未合与残留

- **W93/W94 不存在**:现取远端零匹配(见 2.4),不是"存在而不合"。
- **`G-13` 仍开着**:余量见 5.4。摘标记的判据不变——"全仓再无内联人设",
  且要一次改齐六条关联索引的 `gaps` 与 `note`。**下一槽若收 `js/wf-core.js` 那一处**,
  SK-10/SK-11 两条仍欠段的锚点与 A 名单那条"例外仍在"的正向断言会一起先红(路障是有意留的)。
  收它比前几槽多两件事要判:它是**双端**步骤(浏览器 `js/review.js` 与 `server.js` 两个消费点),
  且人设句与整份评分契约/`issues` 字段面写在同一条 user 串里,切哪一刀要先定。
- **三张持有者名单口径仍未统一**:W85/W90 登记的这条本槽**仍没做**——
  合并判据(哪些形态算内联人设、注册表与专家库计不计)是产品口径不是收敛口径,越权合并等于替三个槽改判据。
  但本槽给了 W90 那条证据的第二次实测:按注册表现推的那两条四次合并一个字没改,
  逐文件手写处数的那三张各改了四次;而且 A 名单归零后已经出现"名单空着但余量还在"的形态,
  统一时更值得往现推形态收。
- **`G-10`(审片语义面)、`G-11`(自进化仍是人手动作且只对自定义专家开放)** 两条未动。
- 本槽只解冲突与收敛双口径,**没有新增功能、没有改任何判据的口径**;
  唯一的语义改动是 4.5 的仍欠段锚点、三张名单期望串与四处数字按 live 重写,
  以及 A 名单归零处新加的那条"已知例外仍在"的正向断言——都跟着实况走。
