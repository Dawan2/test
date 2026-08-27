# W80 · 补合 W70 真 tip + 四条内联人设收编槽并入一条集成线的收敛记录(集成分支)

> 集成分支:`cursor/w80-integration-5369`,基线 `cursor/w75-integration-c4a7 @ fbefd0c`(任务直接指定,见第 2 节)。
> 本文只记**收敛过程**:基线怎么定的、合了哪五条、每处冲突怎么解、合并后的实测数字、没删测的取证。
> 各槽的内容说明在 `w73-voice-director-prompts.md` / `w74-digest-three-prompts.md` /
> `w76-sb-board-prompts.md` / `w77-event-graph-prompt.md`,本文不代述、不复写。
> 五次合并都 `--no-ff`、各一个合并提交、可分别 revert;全程只解冲突与收敛双口径,**不重做已落地的功能**。

## 1. 结果一句话

本槽先把 W75 第 6 节点名的那处损失补成祖先——`--no-ff` 合 **`w70-integration-ad31@87aa62a`**
(W72 当时取基线只取到 `1e4627c`,漏掉了后来那条 W70 自己的记账件与索引行),
再按次序 `--no-ff` 合入四条内联人设收编槽:

| # | tip | 收编面 | 新增注册表键 |
|---|---|---|---|
| 1 | `w73-voice-director-prompts-b4b4@cd05444` | 配音导演单个/批量推荐两步 | `voice.recommendSystem`、`voice.recommendBatchSystem` |
| 2 | `w74-digest-three-prompts-3508@fc0dcf7` | 剧本摘要通读/汇总/集纲三步 | `digest.planSystem`(一键三口) |
| 3 | `w76-sb-board-prompts-c5a1@e1993d1` | 分镜脚本创作层场次节拍拆解/文字分镜拆解两步 | `sb.boardSceneSystem`、`sb.boardDraftSystem` |
| 4 | `w77-event-graph-prompt-fd01@8235d6f` | 分集页事件图谱拆解步 | `graph.system` |

提示词注册表按**并集**从 19 条推到 **25 条**,全仓内联人设(`system: '你是` 字面计数)由 **19 处降到 11 处**,
合并后回归 `unit 435/435`、`integration 126/126`、`cli.smoke 95/97`(2 项失败与 `master` 同名同表现,见 5.2)。

W78/W79 两条远端 tip 存在(`e467ea9` / `9dd486a`),任务口径明确排除,本槽不合,现取记在第 6 节。

**注册表之外一格没动**:`mcp.js` / `cli.js` / `server.js` / `js/release-core.js` / `js/issues.js` /
`js/issues-ui.js` / `js/wf-core.js` / `js/domain.js` / `docs/AI助手接入指南.md` **逐字未动**
(`git diff --name-only fbefd0c HEAD --` 这几个路径零输出),
故 W61 回流、release-core、issues UMD、W53 记账、索引契约一处没被冲掉;
现取 **MCP 工具仍 37 个(另 3 条提示模板)、领域命令仍 12 条、提醒投影表仍 7 条、`KB.SECTIONS` 仍 18 条、
校验面仍七面十七条、短名单仍 30 条无 `pending`、`gaps()` 仍 20 键**。

**本槽值得留下的四件方法面的事**:

1. **反向断言是单向的,一槽收编会让别人家的路障失效——而且不止一条**。
   基线上压着 W66/W69/W71 三条"某某步仍内联"型的路障,四个槽的 `merge-base` 都早于它们的现措辞,
   所以谁也没见过它们、`git` 也不把它们报成冲突。合完真跑才捞得出:
   合 W74 后是 W75 刚立的「`episode-util` 三步仍内联」失效(2 红),
   合 W77 后是 SK-10/SK-11 两条各自那句「`js/episodes.js` 事件图谱拆解步仍内联」同时失效(4 红,含 note 措辞与 README 数字)。
   **翻面要连着记账一起翻**:断言改方向、`note` 的「仍欠」段同步改指真正还在的那几处,不然下一槽又是同一个洞。
2. **`} },` 块尾这次没再踩,靠的是先看 `theirs` 那半自己带不带尾**。W75 记的那处是"两侧共用块尾被冲突边界切断"。
   本槽 `tests/unit.js` 的四次冲突里有两次同形(W73、W77),解法固定成三步:
   删 `<<<<<<<` 那行、把 `=======` 那行**替换**成 `  } },`(补回我方被切断的块尾)、删 `>>>>>>>` 那行——
   `theirs` 那半内部的块尾本来就在,只有最后一条用例的块尾落在冲突块之后由两侧共用。
   每次解完立刻 `node --check tests/unit.js`,不靠跑测才发现语法断。
3. **同名 helper 静默互相覆盖,红的却是断言**。合 W73 后 `tests/unit.js` 里出现了两个 `loadPersona`——
   我方那个只造 `rewritePrompt` 的假上游,对侧那个只造 `recommendVoice/Batch` 的,
   两块都留之后**后定义的赢**,前面的用例吃到的是另一份罐头(`voice.recommendBatchSystem` 期望「少年音」实得「温柔细腻」)。
   两块都留是对的,但**同名的辅助函数不能两块都留**:合成一个按调用上下文回不同罐头的 helper,两侧用例都不动。
   这类冲突 `git` 报不出来——两个函数不在同一插入点,是自动合并区里长出来的重名。
4. **一个数字三处口径,合完要各自现取而不能相加**。注册表条数在 `README.md` 出现三处措辞
   (「25 条注册表提示词」「…25 条主线 LLM 提示词集中登记」),在 `docs/skills-wave/README.md` 出现一处
   (「提示词在 `js/prompts.js`(25 条)」),四处的上下文不同、两侧给的值也不同(24 / 15),
   一律 `node -e "require('./js/prompts.js').list().length"` 现取;
   用例数同理由 `contract` 那条 README 数字对账断言现算(实测 435,两侧分别写 433 / 426)。

## 2. 基线与五个槽

### 2.1 基线

任务直接指定基线为 `origin/cursor/w75-integration-c4a7` HEAD。现取核实:

```
git rev-parse origin/cursor/w75-integration-c4a7   # fbefd0c…
git checkout -b cursor/w80-integration-5369 origin/cursor/w75-integration-c4a7
```

基线三套件现取 `unit 428/428`、`integration 126/126`、`cli.smoke 95/97`。

### 2.2 先补 W70 的真 tip

W75 第 6 节记着:W72 合 `w70-integration-ad31` 时取的是 `1e4627c`,
而该槽后来又推了一条 `87aa62a`(**W70 自己那份 217 行记账件 + 目录索引行 + 指针**),
于是这份记账件连同它那行索引一起漏在集成线之外——**这是 W53 那个洞的第二次发生**。

```
git merge-base --is-ancestor 1e4627c fbefd0c   # 0(在线内)
git merge-base --is-ancestor 87aa62a fbefd0c   # 1(漏在线外)
git diff --stat 1e4627c 87aa62a
#  docs/skills-wave/README.md              |   3 +-
#  docs/skills-wave/w70-integration-log.md | 217 ++++++++++++++++++++++++++++++++
```

差量**只有文档**,零代码零用例,所以补合的风险面只在索引表与指针那行。
合完现取 `git merge-base --is-ancestor 87aa62a HEAD` → 0,记账件与索引行都在。

### 2.3 四个收编槽的分叉点

| 槽 | tip | 与基线的 `merge-base` | 那条线是 |
|---|---|---|---|
| `w73-voice-director-prompts-b4b4` | `cd05444` | `1e4627c` | W70 集成线的中间点 |
| `w74-digest-three-prompts-3508` | `fc0dcf7` | `1e4627c` | 同上 |
| `w76-sb-board-prompts-c5a1` | `e1993d1` | `d2e7c43` | W72 集成线 tip |
| `w77-event-graph-prompt-fd01` | `8235d6f` | `d2e7c43` | 同上 |

四个分叉点**都早于 W71/W75 并入**,所以四个槽给出的 `README` 长行散文与 `js/skills.js` 的 `note`
描述的都是**分叉那一刻的实况**(W71 的四条键、W73/W74 的键、W76 的两条键在对侧眼里各自不存在),
机械取 `theirs` 会把主干后来落的那几段整段抹掉。判据固定成一句:
**取"哪一侧描述的是合并后的实况",两侧各描述了一半时就手工合成一句**。

## 3. 五次合并各自的冲突面

| 合并 | 合并提交 | 冲突文件 | 冲突块数 |
|---|---|---|---|
| W70 真 tip | `f7bb032` | `docs/skills-wave/README.md` | 2 |
| W73 | `57cd89e` | `README.md` / `docs/skills-wave/README.md` / `js/skills.js` / `tests/unit.js` | 3 / 1 / 2 / 1 |
| W74 | `5d2b35f` | 同上四份 | 3 / 2 / 2 / 1 |
| W76 | `960c092` | 上四份 + `js/prompts.js` | 3 / 1 / 1 / 2 / 1 |
| W77 | `c8bc2b7` | 上五份 | 3 / 1 / 1 / 3 / 2 |

`js/prompts.js` 在 W73/W74 两次里**干净自动合并**(两处插入点相邻但不重叠:
`voice.*` 插在 `extract.system` 之后、`digest.planSystem` 插在 `persona.promptSystem` 之后),
到 W76/W77 才开始撞——两条 `sb.board*` 与 `graph.system` 都要插在 `sb.system` 之前那个位置。
**一律并集**:同一插入点的多块都留,顺序按产品流程排(分镜脚本 tab 两步 → 事件图谱 → 智能分镜)。
现取注册表 25 条,键序:

```
split.system, narration.system, reading.system, concept.system, light.system,
extract.system, voice.recommendSystem, voice.recommendBatchSystem, persona.promptSystem,
digest.planSystem, sb.boardSceneSystem, sb.boardDraftSystem, graph.system,
sb.system, sb.reviewUser, sb.reviewSystem, und.system, gen.promptSystem,
review.system, review.sumSystem, review.finalSystem,
agent.system, agent.panelSystem, agent.drawerSystem, agent.previsSystem
```

## 4. 逐处怎么解

### 4.1 `docs/skills-wave/README.md` 索引表:一律并集 + 按槽号重排

五次合并里这份文件每次都冲突,形态固定:两侧各在表尾追加自己那行,`git` 报成一个块。
解法一律**两侧的行都留**,再按槽号排成 `w70 → w73 → w74 → w75 → w76 → w77`(不是按合入次序)。
W70 那次另有第二块——**指针那行**:我方是 `w75`、对侧是 `w70`,
取我方(合并后最新的收敛记录确实是 W75),同时把 `w70-integration-log.md` 补进"更早的分叉"那串链接。

索引契约(`每份记账件各有自己那行 + 相对链接不许悬空`)由 `contract` 套件守着,
四份新记账件(`w73`/`w74`/`w76`/`w77`)都是**纯新增文件、零冲突标记**——
`git status` 记 `A`,但它们那行索引落在冲突块里,不手工接一手当场红。这是 W67 立的那条加固第三次接住。

### 4.2 `README.md` 三处冲突:取我方 + 把对侧那段原样接进去

三处每次都一样:

1. **skill 索引那段的「N 条注册表提示词」**——取我方长行(它含主干后来落的全部描述),只把数字改成现取值。
2. **prompts 文件化那段的长行枚举 + 逐键描述**——取我方,再把对侧新增的那几个词与那一整句
   原样插进对应位置(枚举位置按注册表键序,描述句按对侧原文的相对次序)。
   W77 那句插在 Agent 单轮「不开放改写」之后、多轮三份之前,与对侧原文同位。
3. **`node tests/unit.js` 那行的用例数**——两侧都是过期值,现取。
   我方那半比对侧多一行**空行**(W74 那次修回的、`node tests/integration.js` 之前的段间空行),取我方保住它。

对侧长行整段插入时按**公共前后缀 char-diff** 复核过一遍:半角 `"` 没被打成全角 `“”`(W72 踩过这一处)。

### 4.3 `js/skills.js`:`prompts` 数组自动合成并集,`note` 手工合成一句

`core.personaCtx`(SK-03)的 `prompts` 数组四次都是**自动合并成并集**(各槽的键落在数组不同位置),
真冲突的是紧跟着的那几句 `note` 与仍欠段——两侧各描述了自己那一半。一律**手工合成一句**,
按"分镜脚本创作层两步 → 事件图谱拆解步"的顺序把两段接起来,仍欠段的两个既有锚点
(`ops 协议`/`不开放覆盖`、音色推荐的「音色库…不开放覆盖」)一个不动。

`script.aiToneBan`(SK-10)与 `subjects.refDiscipline`(SK-11)的仍欠段是本槽改动最大的两处,见 4.4。

### 4.4 三条反向断言按实况翻面(合完真跑才捞出来)

**合 W74 后 2 红**:W75 刚在 `tests/unit.js` 立的「`js/episode-util.js` 三步仍是内联策划人设」——
W74 收的正是这三步。两条断言就地翻面(`length, 0` + 仍欠段不得再点它),SK-10 的 `note` 同步改写。

**合 W77 后 4 红**:

| 红在哪 | 原判据 | 翻成 |
|---|---|---|
| `contract · 八维度重写文生图提示词人设(源级)`(W69 立) | `owed(SK-11).includes('js/episodes.js')` + 该句仍内联 + 注册表命中 0 条 | 仍欠段改点 `js/agent-ops.js` / `js/sb-views.js`,源级改钉"不得退回内联",注册表命中恰好 1 条,并加一条"点名的那两处此刻确实还有内联人设" |
| `contract · 剧本板块四步人设(源级)`(W71 立) | 同形的 SK-10 那半 | 同上;另补一条"仍欠段不得再把 `js/episodes.js` 记成欠账" |
| `skills · 记账对齐`(W77 自带) | `note` 须含「事件图谱拆解步内联人设已收进注册表(独立键 `graph.system`」 | `note` 措辞按该断言的锚点写,不动断言 |
| `contract · README 数字对账` | 文档 433 | 现取 435 |

**这里有一个选择**:第四条红的是 W77 自带断言与我方 `note` 措辞不合(我方写的是「同形收编为独立键 `graph.system`」)。
改断言去迁就措辞会把对侧那条路障放宽,所以**改措辞、留断言**——记账件的字面归记账,断言的锚点归断言,冲突时让措辞让路。

翻面之后两条仍欠段都改指 `js/agent-ops.js`(执行核验器、会话纪要整理器)与 `js/sb-views.js`(分镜改图专家),
并各配一条"那两处此刻确实还在内联"的源级反向断言——**下一槽收它们时同样会红**,路障不因翻面而消失。

### 4.5 `tests/unit.js`:整块两留,同名 helper 合成一个

四次冲突里三次是"两侧在同一插入点各加整块用例",一律两留(块尾按第 1 节第 2 条补回)。
剩下那一次是 W73 带来的同名 `loadPersona`(第 1 节第 3 条):合成一个 helper,
按调用上下文回不同罐头(`__voiceOut` 由用例自己设,默认走 `rewritePrompt` 那份),两侧用例一条不改、一条不删。

## 5. 实测与取证

### 5.1 三套件数字

| 套件 | 基线 `fbefd0c` | 合并后 HEAD |
|---|---|---|
| `node tests/unit.js` | 428/428 | **435/435** |
| `node tests/integration.js` | 126/126 | **126/126** |
| `node tests/cli.smoke.js` | 95/97 | **95/97** |

`README.md` 的「单元测试(N 项断言)」与 `docs/skills-wave/README.md` 的「提示词在 `js/prompts.js`(N 条)」
都按现取值改过,`contract` 那条 README 数字对账用例守着前者。

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
| `w70`(真 tip) | `1e4627c` | 417 → 417 | +0(纯文档) |
| `w73` | `1e4627c` | 417 → 418 | +1 |
| `w74` | `1e4627c` | 417 → 419 | +2 |
| `w76` | `d2e7c43` | 424 → 426 | +2 |
| `w77` | `d2e7c43` | 424 → 426 | +2 |

`428 + 0 + 1 + 2 + 2 + 2 = 435`,与合并后 live 实测**逐个相等**——没有任何一条用例被冲突解法吃掉。

名集另做一次双向对照:把五个 tip 与基线的 `tests/unit.js` / `tests/integration.js` / `tests/cli.smoke.js`
各自的用例名抽出来排序,与合并后逐份 `comm -23`,**十八次全空**(即任一侧有的名字合并后都还在)。

### 5.4 G-13 现况:19 处 → 11 处,标记一个不摘

按 `system: '你是` / `` system: `你是 `` 字面计数(与 W74/W76 同口径),基线 19 处、合并后 **11 处**,
本槽四个槽合计收编 8 处(2 + 3 + 2 + 1)。逐文件余量:

| 文件 | 余量 | 是什么 |
|---|---|---|
| `js/agent-ops.js` | 2 | 执行核验器、会话纪要整理器 |
| `js/beatboard.js` | 1 | 节拍拆解专家 |
| `js/editors.js` | 1 | 漫剧编剧(气泡生成) |
| `js/experts.js` | 1 | 专家人设进化器 |
| `js/gsettings.js` | 1 | 资深影视导演 |
| `js/plans.js` | 1 | 制作计划器 |
| `js/proj-shell.js` | 1 | 发行运营专家 |
| `js/proj-upload.js` | 1 | 拉片分析师 |
| `js/role-editor.js` | 1 | 角色设定师 |
| `js/sb-views.js` | 1 | 分镜改图专家 |

**剧本模块两个文件(`js/episodes.js` / `js/episode-util.js`)至此内联人设归零**,
但 `G-13` 缺口没闭合,按 W36 立的关联索引口径**一个标记不摘**——
`Skills.gaps()` 仍 20 键、`G-13` 那六条值逐字节不变(有用例钉住)。

### 5.5 点名要保的五处逐条现查

| 要保的 | 现查 |
|---|---|
| 回流(W61 SK-26 主线前段四步) | `js/wf-core.js` 逐字未动;`memory` 套件 28 条全绿;`integration` 里前段三步回流那组全绿 |
| release | `js/release-core.js` 逐字未动;`cli.smoke` 的 `release`/`exec project.release` 那组全绿 |
| issues | `js/issues.js` / `js/issues-ui.js` 逐字未动;`Issues.reminders()` 现取 7 条 |
| W53 记账 | `docs/skills-wave/w53-memall-headless-seed.md` 在;索引行在 |
| 索引契约 | `contract` 套件那条(每份记账件各有自己那行 + 相对链接不悬空)全绿,本槽四份新记账件都补了索引行 |

## 6. 剩余未合与残留

- **W78 / W79 不在本槽**:任务口径明确排除。现取远端 tip
  `cursor/w78-beatboard-prompt-ea0c@e467ea9`、`cursor/w79-editors-prompt-153a@9dd486a`,
  两条各自要收的正是 5.4 表里 `js/beatboard.js` 与 `js/editors.js` 那两处——
  接它们时会撞上本槽第 4.4 节那两条新立的反向断言(仍欠段现在点的是 `agent-ops`/`sb-views`,不是这两处),
  但**本槽的仍欠段没点名它们**,所以不会自动红;要靠合完真跑 + 逐处核源码。
- **`G-13` 仍开着**:余量 11 处见 5.4。摘标记的判据不变——"全仓再无内联人设",
  且要一次改齐六条关联索引的 `gaps` 与 `note`。
- **`G-10`(审片语义面)、`G-11`(自进化仍是人手动作且只对自定义专家开放)** 两条未动。
- 本槽只解冲突与收敛双口径,**没有新增功能、没有改任何判据的口径**;
  唯一的语义改动是 4.4 那四条断言的方向与两条 `note` 的仍欠段措辞,都跟着实况走。
