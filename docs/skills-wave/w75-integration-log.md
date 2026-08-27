# W75 · 两槽内联人设收编并入一条集成线的收敛记录(集成分支)

> 集成分支:`cursor/w75-integration-c4a7`,基线 `cursor/w72-integration-8d3f @ d2e7c43`(任务直接指定,见第 2 节)。
> 本文只记**收敛过程**:基线怎么定的、合了哪两条、每处冲突怎么解、合并后的实测数字、没删测的取证。
> W69/W71 的内容说明在 `w69-persona-tplimage-prompt.md` / `w71-script-four-prompts.md`,本文不代述、不复写。
> 两次合并都 `--no-ff`、各一个合并提交、可分别 revert;全程只解冲突与收敛双口径,**不重做已落地的功能**。

## 1. 结果一句话

本槽把两条内联人设收编槽并进同一条线:`--no-ff` 合入
**`w69-persona-tplimage-prompt-bf09@2dafae3`**(主体八维度重写文生图提示词那步 → `persona.promptSystem`)与
**`w71-script-four-prompts-b3d2@be13f91`**(剧本板块四步 → `narration`/`reading`/`concept`/`light.system`),
提示词注册表按**并集**从 14 条推到 **19 条**,合并后回归
`unit 428/428`、`integration 126/126`、`cli.smoke 95/97`(2 项失败与 `master` 同名同表现,见 5.2)。

本槽的实质增量:

| 增量 | 来源 | 落点 |
|---|---|---|
| 注册表新键 `persona.promptSystem`,`js/persona.js` 八维度重写步改经 `Prompts.get` | `w69` | `js/prompts.js`、`js/persona.js` |
| 注册表新键 `narration`/`reading`/`concept`/`light.system` 四条,`js/episodes.js` 四步改经 `Prompts.get` | `w71` | `js/prompts.js`、`js/episodes.js` |
| SK-11 登记两个注入落点键、SK-03 登记四条新键、SK-10 只改记账 | 两槽 | `js/skills.js` |
| 两份记账件与各自那行目录索引 | 两槽 | `docs/skills-wave/` |
| 三处「对方仍内联」反向断言按实况反转(见第 4 节) | 本槽 | `tests/unit.js` |

**注册表之外一格没动**:`js/prompts.js` 干净自动合并成并集,两槽的插入点相邻但不重叠
(`w71` 插在 `split.system` 之后、`w69` 插在 `extract.system` 之后)。
`mcp.js` / `cli.js` / `server.js` / `js/release-core.js` / `js/issues.js` / `js/issues-ui.js` / `js/wf-core.js` /
`docs/AI助手接入指南.md` **逐字未动**(`git diff --name-only d2e7c43 HEAD --` 这几个路径零输出),
故 W61 回流、release-core、issues UMD、W53 记账、索引契约一处没被冲掉;
现取 **MCP 工具仍 37 个、领域命令仍 12 条、提醒投影表仍 7 条、`KB.SECTIONS` 仍 18 条、
校验面仍七面十七条、短名单仍 30 条无 `pending`、`gaps()` 仍 20 键**。

**本槽值得留下的三件方法面的事**:

1. **三处反向断言里,只有一处出现在冲突块中**。两槽各自都给自己钉了"仍内联"型的路障,
   而基线上还压着第三条(W66 那条 `记账对齐:SK-10/SK-11 …`)——它**同时**钉住两槽各自的余量,
   两槽的 `merge-base` 又都早于 W66 并入主干(见 2.2),所以**两槽谁都没见过它**,
   它也不落在任何一次冲突里,`git` 一路干净合上。这一条只能靠**合完真跑**捞出来(4.4)。
   反向断言是**单向**的:先落地的那一槽给后落地的埋雷,反过来不会自动有。
2. **两侧在同一插入点各加一块时,块尾那一行是两侧共用的**。`tests/unit.js` 两槽都在同一个锚点后
   各加两条用例,`git` 报成一个冲突块——但 `ours` 那半**不含**收尾的 `} },`(它落在冲突块之后、被两侧共用)。
   两块都留之后语法当场断,`node --check` 报 `Unexpected token '{'`。解法是两块都留 **+ 手工补回一行块尾**(4.3)。
   这与 W64 记的「两个测试 23 块顺号」同形而更隐蔽:那次要顺的是块号,这次被冲突边界切断的是**语法结构**。
3. **同一形态的记账,两侧断言的锚点宽窄不同,结果一边红一边全绿**。SK-10 与 SK-11 的仍欠段是同一件事的两半,
   把 SK-10 整段退回基线措辞**红 2**(变异 1),把 SK-11 的仍欠段退回 W69 措辞却**全绿**(变异 2)——
   因为 W69 那条只查 `owed.includes('js/episodes.js')`,而退回后的那句假陈述里**也含**这个字符串,
   锚点选得比被守的事实宽,假陈述照样满足。如实记下不补(5.4)。

## 2. 基线与两个槽

### 2.1 基线

任务直接指定基线为 `origin/cursor/w72-integration-8d3f` HEAD,并声明它是当前唯一集成线
(W67 与 W68 两条已在 W72 收拢)。现取核实:

```
git rev-parse origin/cursor/w72-integration-8d3f   # d2e7c43…
git checkout -b cursor/w75-integration-c4a7 origin/cursor/w72-integration-8d3f
```

基线三套件现取 `unit 424/424`、`integration 126/126`、`cli.smoke 95/97`。

### 2.2 两个槽都叉自更早的集成线

| 槽 | tip | `merge-base` 与基线 | 那条线是 |
|---|---|---|---|
| `w69-persona-tplimage-prompt-bf09` | `2dafae3` | `c36abaa` | W64 集成线(`w64-integration-log.md` 那个提交) |
| `w71-script-four-prompts-b3d2` | `be13f91` | `cbb2b24` | W67 集成线 tip |

两个 `merge-base` **都早于 W66 并入主干**(W66 是随 `w70` 线在 `1e4627c` 才进来的),
这一点直接决定了第 4.4 节那处"两槽都看不见的第三条反向断言"。

任务口径明确排除 `w73`/`w74`,本槽不合;两条的远端 tip 现取记在第 6 节。

## 3. 这两次合并做了什么

### 3.1 合 W69(合并提交 `f80e19d`)

`git merge --no-ff origin/cursor/w69-persona-tplimage-prompt-bf09`,冲突 **4 文件 5 处**;
`js/prompts.js` / `js/persona.js` 自动合并;新增文件一份记账件。

### 3.2 合 W71(合并提交 `1e961be`)

`git merge --no-ff origin/cursor/w71-script-four-prompts-b3d2`,冲突 **4 文件 6 处**;
`js/prompts.js` / `js/episodes.js` 自动合并;新增文件一份记账件。

**`js/prompts.js` 两次都零冲突**,这是本槽形态上最省事的一处:
`w69` 的新键插在 `extract.system` 条目**之后**、`w71` 的四条插在 `split.system` 条目**之后**,
两个插入点相邻却不重叠,`git` 直接合成并集。合并后现取 19 条、键序为

```
split → narration → reading → concept → light → extract → persona.promptSystem → sb → … → agent.previsSystem
```

`w71` 的注册顺序判据(按产品流程排)与 `w69` 的插入位置互不干扰,
`w71` 自带的「四条键的注册顺序应按产品流程排列」那条断言合并后仍绿(它只看四条之间的相对序)。

冲突总表:

| # | 合次 | 文件 | 处 | 解法 |
|---|---|---|---|---|
| 1 | W69 | `js/skills.js` | SK-11 条目(`prompts` 登记 + `note`) | **取 W69 侧**:两个登记键的人设都已进表(4.1) |
| 2 | W69 | `tests/unit.js` | G-06 校验半用例的一段注释 | 取 W69 侧(注释随实况反转,被断言的值一字未动) |
| 3 | W69 | `README.md` | 「主线 skill 索引」段 + 「专家雇佣扩充」段 | **取我方**保住 W61 回流面与 W65 蒸馏板块过滤,数字 live 改 14→15(4.2) |
| 4 | W69 | `README.md` | 回归测试段 `unit` 那一整行 | 取我方,用例数 live 现取(4.2) |
| 5 | W69 | `docs/skills-wave/README.md` | 目录索引表 + 「记账诚实位」那条 | 索引按波次序插行;摘要取我方 + 把 W69 的收编段接在 W66 段之后(4.2) |
| 6 | W71 | `js/skills.js` | SK-10 条目的 `note` | **取 W71 侧**:四步已收编(4.1) |
| 7 | W71 | `tests/unit.js` | 两侧在同一插入点各加两条用例 | **两块都留 + 补回被切断的块尾**(4.3) |
| 8 | W71 | `README.md` | 三处(skill 索引段 / 提示词枚举段 / 回归测试段) | 取我方 + splice W71 的四步收编段,三个数字 live(4.2) |
| 9 | W71 | `docs/skills-wave/README.md` | 目录索引表 + 一分钟摘要首条 | 索引按波次序插行;条数 live 改 15→19(4.2) |

## 4. 逐处怎么解

### 4.1 `js/skills.js`:两处 `note` 各取一侧,判据都是"哪一侧描述的是合并后的实况"

- **SK-11(`subjects.refDiscipline`)取 W69 侧**:`ours` 是 W66 写的「仍欠 `tplImage` 取用点那处内联人设」,
  合入 W69 后它已进表,取我方就是把刚落地的功能写成没做。同时 `prompts` 登记从
  `['extract.system']` 变成 `['extract.system', 'persona.promptSystem']`。
- **SK-10(`script.aiToneBan`)取 W71 侧**:同形,`ours` 写「仍欠剧本模块四处内联提示词」,合入后为假。

两处都有断言背书:把 SK-10 整段退回基线措辞当场**红 2**(变异 1)。
但 SK-11 那处的反向变异**全绿**(变异 2),成因见 1.3 与 5.4。

**SK-11 的仍欠段在本槽被改了两次**:合 W69 时它按 W69 的写法指向"剧本模块那四步仍是内联字面",
合 W71 之后这句又变成假的,故第二次改写成指向 `js/episodes.js` 事件图谱拆解步与
`js/episode-util.js` 剧本摘要三步——**同一句散文在一个槽内两次失效**,
是"两槽收编面首尾相接"这种形态特有的:前一槽的仍欠段点名的正是后一槽要收的东西。

### 4.2 两份 README:取我方 + 把对侧新增的那一段原样接进去

三处长行散文的形态一致——**我方带着前几槽的内容(W61 回流面、W65 蒸馏板块过滤、W67 就地更正、W66 段),
对侧带着自己那一段新收编**,取任一侧都会丢东西。解法统一为:**`ours` 为底,把对侧那一段按位置 splice 进来**。

折回时**一律不重打字**:按首尾锚点从对侧 blob 里整段取出再接,
避免 W72 记的那次半角引号被打成全角的事故重演。
唯一手改的短句是**指针那行**(阅读约定末条,W72 的事故发生地):本槽只做**定点替换**
(把 `w72` 换成 `w75`,并把 `w72` 那条挪进"更早的分叉"),不重写整行。改完按公共前后缀现取复核:

```
公共前缀 48, 公共后缀 708
改前中段: [2-integration-log.md](./w72-integration-log.md)(更早的分叉登记在 ]
改后中段: [5-integration-log.md](./w75-integration-log.md)(更早的分叉登记在 [w72-integration-log.md](./w72-integration-log.md)、]
该行全角双引号处数: 0 (改前 0)
```

**目录索引表**两次都按波次序插行,合并后表尾为 `w65 → w66 → w67 → w68 → w69 → w71 → w72`。
行序仍不在断言里(W72 已记),靠人守。

**数字一律 live 现取**:

| 数字 | 我方 | 对侧 | 合并后 live |
|---|---|---|---|
| `README` 「N 条注册表提示词」 | 14 | 15(W69)/ 18(W71) | **19** |
| `README` 「N 条主线 LLM 提示词」枚举 | 14 | 15 / 18 | **19**(枚举名同步补四条) |
| `docs/skills-wave/README` 「`js/prompts.js`(N 条)」 | 14 | 15 / 18 | **19** |
| `README` `unit` 用例数 | 424 | 410 / 411 | **428** |

前三个数字**三处都有断言**(变异 3/4/5 各红 1,均点名"实测 19,文档 15"),
第四个由 `contract · README 数字对账` 钉住(合 W69 与合 W71 各红过一次,逼着现取)。
两个对侧的数字都不能直接抄:它们各自都只加了自己那几条。

「记账诚实位」那条另有一处**就地更正**:W69 那段末尾写着「全仓内联人设 20 处」,
合入 W71 后实际只剩 15 处,故把该数改成 live 值并补一句 W71 收编段,
原句的历史判断(W69 当时仍欠段指向那四步)保留不删(W67 立的口径)。
这个数**零断言**(变异 6),靠合入方现取。

### 4.3 `tests/unit.js`:两块都留,还要补回被冲突边界切断的块尾

合 W71 时唯一的测试冲突:两槽都在 `人物小传步` 那条用例之后各加两条 `contract` 用例。
`ours` 半是 W69 的两条、`theirs` 半是 W71 的两条,**四条用例名一条不丢**。

坑在于 `ours` 那半**停在最后一条 `assertEq(...)` 上就结束了**,收尾的

```js
  } },
```

落在 `>>>>>>>` **之后**——它是两侧共用的一行。所以机械把两块拼起来会得到
「上一条用例还没闭合就开下一条」,`node --check` 当场:

```
SyntaxError: Unexpected token '{'
```

解法是两块都留 + 在两块之间补回一行 `  } },`。补完 `node --check` 通过,
四条用例名现取齐备。**这类冲突不能只看 `git` 给的两半**:冲突块的边界是按行算的,
而 JS 的块结构跨了这条边界,要连着后面几行一起读。

### 4.4 三处「对方仍内联」反向断言,按实况只留已落地的判据

任务口径是"合完后按实况只留已落地的判据"。现场逐处清点是**三处**,分布很不一样:

| # | 位置 | 谁写的 | 出现在冲突里吗 | 合完后 |
|---|---|---|---|---|
| 1 | W69 那条源级用例里点名四条字面「仍内联 + 不该在注册表」 | `w69` | 否(合 W69 时是纯新增;合 W71 时它在冲突块的 `ours` 半里,但**冲突不在这几行上**) | **真跑才红**,改钉 `js/episodes.js` 事件图谱那一处 |
| 2 | 基线 W66 用例 `记账对齐:SK-10/SK-11 …` 的 **SK-11 半**(`tplImage` 取用点仍内联) | 基线(W66) | **否**,两槽都没碰这一段 | 合 W69 后真跑红,反转成"取值口在位 + 该字面全仓恰好一份" |
| 3 | 同一条用例的 **SK-10 半**(四步仍内联) | 基线(W66) | **否**,同上 | 合 W71 后真跑红,反转成"四键在表 + 四步都经 `Prompts.get` + 仍欠段不得再点名它们" |

**第 2、3 两处是本槽最该记的**:它们在**同一条用例**里,同时钉着两槽各自的余量;
两槽的 `merge-base` 都早于 W66 并入(2.2),所以两槽谁都没见过这条用例,
两槽也都没改动那一段——`git` 全程干净合上,**冲突标记指不到它**。
它们是合完 `node tests/unit.js` 才报出来的:

```
FAIL | skills · 记账对齐:… | SK-11 的 note 须写明人设句已在注册表 extract.system     ← 合 W69 后
FAIL | skills · 记账对齐:… | SK-10 的仍欠段须点名剧本模块仍内联的那几步:解说体改写   ← 合 W71 后
```

三处一律**只留已落地的判据**,方向都是从"钉住仍内联"反转为"钉住已收编":
键在表里、取值口在位、原字面**全仓恰好一份**(比原来的"这个文件里没有"更严),
并把仍欠段改指真正还在的那几处(`js/episodes.js` 事件图谱拆解步、`js/episode-util.js` 剧本摘要三步),
每处都先核过源码确实还在(5.5)。**用例名一个没改、一条没删**。

## 5. 实测与取证

### 5.1 三套件数字

| 套件 | `w69` 基 `c36abaa` | `w69 @ 2dafae3` | `w71` 基 `cbb2b24` | `w71 @ be13f91` | 基线 `d2e7c43` | 合 W69 后 | 合入后 HEAD |
|---|---|---|---|---|---|---|---|
| `node tests/unit.js` | 408 | 410 | 409 | 411 | 424 | 426 | **428/428** |
| `node tests/integration.js` | 118 | 118 | 118 | 118 | 126 | 126 | **126/126** |
| `node tests/cli.smoke.js` | 88/90 | 88/90 | 88/90 | 88/90 | 95/97 | 95/97 | **95/97** |

两槽 tip 的三个数字都比基线低,**是叉得早、不是删测**:两槽相对各自 `merge-base` 都只加不减
(`unit` 各 +2,`integration`/`cli.smoke` 各 +0),而基线自 W61 起在后两个套件上多出 8 条与 7 条。

### 5.2 `cli.smoke` 那 2 项失败:与 `master` 同名同表现

在 `master`(`9adcf0f`)的独立 worktree 现跑:

```
FAIL | 未登录 whoami → exit 3 | exit=1
FAIL | llm --json mock 链路 | undefined
==== CLI 冒烟:51/53 通过 ====
```

合入后 HEAD 的失败项**逐字同名同表现**。这 2 项先于本槽存在,本槽不新引入、也不顺手修。

### 5.3 零吃测:名集与三方并集逐条相等

`unit` 按 W64/W72 的手法双向 `comm`(名集取 `PASS|FAIL` 行的用例名,去掉运行期载荷):

| 集合 | 条数 |
|---|---|
| 基线 `d2e7c43` | 424 |
| `w69 @ 2dafae3` | 410 |
| `w71 @ be13f91` | 411 |
| 三者并集(`sort -u`) | **428** |
| 合入后 HEAD 实测 | **428** ✅ |

```
comm -23 union.txt merged.txt   # 并集有而合入后没有(丢测) → 空
comm -13 union.txt merged.txt   # 合入后有而并集没有(凭空多) → 空
```

**两个方向都是空**。计数侧同样对得上:`424 + 2(w69) + 2(w71) = 428`。

`integration` 与 `cli.smoke` **两个测试文件本槽逐字未动**:

```
git diff --stat cbb2b24 origin/cursor/w71-… -- tests/integration.js tests/cli.smoke.js   # 空
git diff --stat c36abaa origin/cursor/w69-… -- tests/integration.js tests/cli.smoke.js   # 空
git diff --stat d2e7c43 HEAD                -- tests/integration.js tests/cli.smoke.js   # 空
```

故这两套件的条数原样等于基线(126 / 97),不必再比名集。

### 5.4 变异实测十一条

| # | 变异 | 结果 | 说明 |
|---|---|---|---|
| 1 | `js/skills.js` SK-10 的 `note` 整段退回基线措辞(四步仍内联) | **红 2**(`剧本板块四步人设(源级)`:「须点名已收编的键 narration.system」+ `记账对齐`) | 4.1 取侧有断言背书 |
| 2 | `js/skills.js` SK-11 的仍欠段退回 W69 措辞(点名四步仍内联) | **全绿 428/428** | **零断言口子**:W69 那条只查 `owed.includes('js/episodes.js')`,假陈述里也含这个串(见 1.3) |
| 3 | `README.md` 「19 条注册表提示词」改回 15 | **红 1**(`README 数字对账:注册表口径`,「实测 19,文档 15」) | 4.2 第一个数字有断言 |
| 4 | `README.md` 「19 条主线 LLM 提示词」改回 15 | **红 1**(同上,「主线提示词数」) | 同一条用例的另一个口径 |
| 5 | `docs/skills-wave/README.md` 「`js/prompts.js`(19 条)」改回 15 | **红 1**(同上,「提示词条数」) | 三处口径各有各的断言 |
| 6 | `docs/skills-wave/README.md` 「全仓内联人设现存 15 处」改回 20 | **全绿** | **零断言口子**,靠合入方现取 |
| 7 | 目录索引删掉 `w71` 那一行(记账件留着) | **红 2**(`索引与目录实况双向对齐` + `索引完备性`,后者点名「w71-script-four-prompts.md 在目录里但索引表没有它那一行」) | W67 收严的那条接住漏登记 |
| 8 | 同时删 `w71` 索引行**与**记账件 | **红 1**(悬空链接:`README.md → w71-script-four-prompts.md`) | 因为 4.2 的摘要段散文点到了它 |
| 9 | `js/episodes.js` 把 `narration`/`reading` 两键的取值口对调 | **红 1**(`剧本板块四步人设(源级)`,点名「narration.system 应就在它那一步的取值口上…与该步 user 半锚点配对」) | W71 的逐步配对断言接得住串台 |
| 10 | `js/skills.js` SK-03 的 `prompts` 登记漏掉 `light.system` | **红 2**(`skill 索引对齐短名单 30 条`:「Prompts 全部 key 应被 skill 索引引用:light.system」+ `SK-03 应登记 light.system`) | 新键漏登记两个方向都红 |
| 11 | 注册表把 `light.system` 的 `def` 写成与 `narration.system` 同字面 | **红 2**(「narration.system 的人设句应恰好命中注册表一条:期望 1,实际 2」+ `记账对齐` 的全仓持有者计数) | 并集合错(两键同字面)接得住 |

变异 2 与 6 是本槽**两处明确的零断言口子**,如实记下不补:
给这些散文写字面断言等于把措辞钉死,余量一推进就得连着改断言(W39 已论证过这种钉法的代价)。
变异 2 值得单独说:它**不是"没有断言"**,而是**断言的锚点比被守的事实宽**——
`js/episodes.js` 这个串在真句子和假句子里都出现。同形的 SK-10 那半用的是
"逐个键点名 + 逐个 label 不许出现",收得紧,变异 1 当场红。下一槽若要补,补的是锚点宽窄不是有无。

### 5.5 自动合并区与实况逐处直读复核

合完现取,不看 `git diff`:

| 复核项 | 实测 |
|---|---|
| `Prompts.list().length` 与键序 | **19**,`split → narration → reading → concept → light → extract → persona.promptSystem → …` |
| `js/persona.js` 八维度重写步 | 经 `Prompts.get('persona.promptSystem')`,`tplImage` 仍取偏好设置 |
| `js/episodes.js` 四步 | 四处 `system: Prompts.get('<键>')`,原四份内联字面在该文件里已零残留 |
| 仍欠那几处**确实还在** | `js/episodes.js` 事件图谱拆解步 1 处、`js/episode-util.js` 剧本摘要 3 处,均仍是内联字面 |
| 全仓仍内联的人设句 | **15 处**(基线 20 处 − W69 的 1 − W71 的 4) |
| `Skills.gaps()` | **20 键**,`G-13` 的六条关联索引逐字节不变(两槽都只收取值口,不预支摘标记) |
| `SK-26` 的 `cmds` | `project.extractSubjects > project.splitEpisodes > episode.understanding > episode.generateStoryboard > episode.smartReview > project.release`(W61 回流面在位) |
| `Skills.preflightStages()` | `script > subjects > eps > shots > gen > review > film` 七面十七条 |
| `Issues.reminders()` | **7** 行(issues UMD 未被冲掉) |
| `js/release-core.js` 与 `project.release` 四端 | 在;`release` 套件与 `contract` 全绿 |
| `WfCore.memSeed`/`memMigrateBoard` 与 `w53` 记账件 | 都在(文件与索引行齐) |
| `CmdRegistry.names()` / MCP `TOOLS` / `KB.SECTIONS` | **12 / 37 / 18**,一个没动 |
| 短名单 `pending` | **0**(30 条) |

`docs/AI助手接入指南.md` 一字未动:两槽都没有新增/改名 CLI 子命令与 MCP 工具。
`README.md` 架构树一格未加:两槽都没有新增 `js/` 模块。

## 6. 剩余未合与残留

合入后 `git rev-list --count HEAD..origin/<branch>` 逐条现取,远端还在线外的有三条:

| 分支 | tip | outstanding | 判定 |
|---|---|---|---|
| `cursor/w73-voice-director-prompts-b4b4` | `c4038f7` | 2 | **不合**:任务口径明确排除 |
| `cursor/w74-digest-three-prompts-3508` | `4038783` | 2 | **不合**:任务口径明确排除 |
| `cursor/w70-integration-ad31` | `87aa62a` | 1 | **不合**(不在本槽任务口径内),但这一条是**残留**,见下 |

**`w70` 那条 outstanding 是一份漏在集成线外的记账件**,与 W67 处理 W53 时的形态完全一样:
W72 取基线时 `w70` tip 还是 `1e4627c`,该槽**随后**才把自己的 `w70-integration-log.md`(217 行)
连同目录索引行推上去(`87aa62a`),于是这份记账件从来没进过集成线。现取核实:

```
ls docs/skills-wave/ | grep w70            # 空:该记账件不在本线上
grep -rn 'w70-integration-log' docs/ README.md   # 空:全仓散文零引用
```

**索引契约看不见它**:目录里没有这个文件、索引表里也没有这一行,"两个集合相等"照样成立;
散文零引用,W67 加固的"点到的记账件不许悬空"也管不着。
这正是 W63 点名、W72 记为"只封住一半"的那个洞的**第二次真实发生**(第一次是 W53)。
本槽不越权补合(任务只指定两个槽),如实记下:**下一槽开工前先决定要不要把 `87aa62a` 补成祖先**,
补法与 W67 那次相同(合过来即连文件带索引行齐)。

其余留给下一槽的:

- **SK-11 仍欠段那处零断言(5.4 变异 2)**:要补就补锚点宽窄——照 SK-10 那半的写法
  改成"逐个点名 + 已收编的不许再出现",不是新加一条用例。
- **`w73`/`w74` 两条都在收内联人设**(配音导演三处 / 剧本摘要三步)。其中 `w74` 收的
  很可能正是本槽 SK-10/SK-11 仍欠段现在点名的 `js/episode-util.js` 那三处策划人设——
  也就是说**本槽刚立的反向断言,下一槽合它时会再红一次**(与 4.1 记的"同一句散文一槽内两次失效"同因)。
  合之前先读 4.4 那张表,别把它当成回归。
- **目录索引的行序仍不在断言里**(W72 已记),本槽按波次序插了两行,靠人守。
- **`全仓内联人设现存 N 处` 这个数零断言**,每收一处就得手改一次,别让它漂。
