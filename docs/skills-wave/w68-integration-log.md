# W68 · 主线前段闭环回流收编的收敛记录(集成分支)

> 集成分支:`cursor/w68-integration-4e71`,基线 `cursor/w64-integration-23c3 @ c36abaa`(选基过程见第 2 节)。
> 本文只记**收敛过程**:基线怎么选的、合了哪一条、每处冲突怎么解、合并后的实测数字、没删测的取证。
> W61 的内容说明在 `w61-sk26-front-writeback.md`(作者自己留了记账件,本文不代述、不复写)。
> 合并 `--no-ff`、一个合并提交(`f93f4ab`)、可 revert;全程只解冲突与收敛双口径,**不重做该分支已落地的功能**。

## 1. 结果一句话

`w61-sk26-front-writeback-b09b` 以其实际 head **`1c459fc`** 合入,合并后回归
`unit 415/415`、`integration 126/126`、`cli.smoke 95/97`(2 项失败与 `master` 同名同表现,见 5.2)。
W63 按任务口径留给下一槽,W65/W66 不合(判定见第 2 节)。

本槽的实质增量:

| 增量 | 来源 | 落点 |
|---|---|---|
| 主线前段四步(本集理解 / 智能分镜 / 剧本拆集 / 提取主体)闭环收尾把可判定结论按板块回流既有 `state.agentMemory` | `w61` | `js/wf-core.js`(`memFeedback` 四条新分支) |
| 浏览器四处写入点:`understanding.js` / `sb-llm.js` / `proj-upload.js` / `js/commands.js`,各挂在自己模块原本那次 `Store.save()` 之前 | `w61` | 同左 |
| headless 写入点:服务端 `/api/wf/understanding`、`/api/wf/smart-storyboard`(含内部理解步)、`/api/wf/split-episodes`;提取主体经 CLI `withProject` 的可选 `memFeed` 随同一次 `PUT /api/state` 写回 | `w61` | `server.js`、`cli.js` |
| `hujing://memory` 资源说明改成"主线闭环回流"六步口径 | `w61` | `mcp.js` |
| SK-26 `steps` 由发布留痕一步补成主线六步、SK-04 `note` 的仍欠段改指生成/合成两步(本槽把两侧各自的半句合成一句,见 4.1) | 两侧 | `js/skills.js` |
| 两份 README 里三处"前段几步仍不回流"的**非冲突区散文**按实况改写(见 4.5) | 本槽 | `README.md`、`docs/skills-wave/README.md` |
| `w61` 集成块的内联编号 `24` → `25`(合入后 24 已归 W58 发布留痕块) | 本槽 | `tests/integration.js` |

合并后的主干口径变化:`SK-26` 的 `cmds` 由 2 条变 **6** 条
(`project.extractSubjects > project.splitEpisodes > episode.understanding > episode.generateStoryboard >
episode.smartReview > project.release`),`SK-04` 的"自动沉淀"余量由"前段四步不回流"缩成"生成与合成两步没有
可判定的结构化结论可回流"。**领域命令仍是 12 条、MCP 工具数不动、提醒投影表仍 7 条、校验面仍七面十七条、
`KB.SECTIONS` 仍 18 条、注册表提示词仍 14 条、短名单仍 30 条无 `pending`、专家仍 16 位**——
`w61` 一条命令一个工具都没加,`contract` 套件全绿即这几个数一个没动。
发布门 G1–G10 的判据与 `overall` 四级计数一字未动。

**本槽值得留下的三件方法面的事**:

1. **"两侧各自把同一句话改了半句"要合成一句,不能取侧**。`js/skills.js` 的 SK-26 `note` 里
   「写入点在哪几处」与「`steps` 登记几步」两句,`ours` 侧被 W58 改成"发布留痕已命令化",
   `theirs` 侧被 W61 改成"补上前段四步"。两侧说的都是真的、都不完整,取任一侧都是把另一半功能
   写成没做——解法是**把两个半句合成"主线六步"**(4.1)。
2. **一条断言在两侧各自成立、合到一起就失效**,本槽出现三处。最典型的是
   「CLI 侧不再自己派生发布回流」——`ours` 侧写成整文件搜 `WfCore.memWrite(`,那时 `cli.js` 里确实
   一处都没有;`theirs` 侧给提取主体接了 `withProject` 的 `meta` 桶回流,于是这条断言在合并后
   **误报**。这类断言不能靠"两侧都绿"判断安全,只能合完真跑(4.3)。
3. **`facts` 表这一次接住了"假欠账"**,而同一条 `note` 里紧挨着的另一句仍是零断言。
   W63 第 4.11 节预判「`w6x ← w61` 合完 `core.memoryDual` 的 `note` 会与代码相反且全绿」——
   本槽实测**不成立**:`w61` 自己把 `facts` 表那行的锚点从 `['理解/分镜/拆集/提取主体','SK-26']`
   改成了 `['生成与合成','解析向导']`,把 `note` 退回旧措辞当场转红(5.4 变异 4)。
   但把 `note` 里"写入点在哪几处"那 406 字整段删掉仍是 **415/415 全绿**(5.4 变异 3)——
   同一条 `note` 的两句话,一句有锚点一句没有,合入方得自己分清哪句在断言里(4.5)。

## 2. 基线怎么选的

任务给的是二选一规则:有 `w67-integration-*` 且其 `merge-base` 表明已含 `w64` 的 head 就从 `w67` tip 起,
否则从 `w64` head 起。`git fetch --all --prune` 后:

```
git branch -r --list 'origin/cursor/w67*'
# (无输出)
```

远端 **`w67` 前缀零匹配**,故走第 2 条:基线 = `origin/cursor/w64-integration-23c3` 的 head **`c36abaa`**
(与任务里写的"约 `c36abaa`"一致,未再往前推)。`git checkout -b cursor/w68-integration-4e71 origin/cursor/w64-integration-23c3`。

开工 `fetch` 后逐条 `git rev-list --count c36abaa..origin/<branch>` + `git log` 核对 tip:

| 候选分支 | tip | outstanding | 判定 |
|---|---|---|---|
| `cursor/w61-sk26-front-writeback-b09b` | `1c459fc` | 3 | **合**(任务指定必合,取实际 head) |
| `cursor/w63-cycle6-audit-7c41` | `496e226` | — | **不合**:任务口径明确"交给 W67" |
| `cursor/w65-g11-mem-scope-filter-d5cf` | — | — | **不合**:任务口径"未完成或并行" |
| `w66-*` | — | — | **不合**:该前缀远端零匹配 |

**W64 记的 `w61` tip 与实际 tip 不同**:`w64-integration-log.md` 第 2 节把它记成 `8b63f7f`(outstanding 1),
本槽 `fetch` 后实际 tip 是 `1c459fc`——`8b63f7f` 之后它又推了 2 条:

```
ec8933b test(memory):前段四步回流的派生/接线/行为/双端断言 + 记账与文档数字同步
1c459fc docs(skills-wave):W61 记账件(四步各回流哪几个数/…)+ 目录索引
```

按 `8b63f7f` 合就等于合了功能不合它的 222 行单测、42 行冒烟、47 行集成与记账件。
「上一槽记下的 tip 只是当时的快照,不能当本槽的输入」这条(W62 立、W64 复现)在本槽第三次奏效。

## 3. 这一次合并做了什么

`git merge --no-ff origin/cursor/w61-sk26-front-writeback-b09b`,冲突 **4 文件 7 处**,
自动合并 `cli.js`/`js/commands.js`/`js/proj-upload.js`/`js/sb-llm.js`/`js/understanding.js`/
`js/wf-core.js`/`mcp.js`/`server.js`/`tests/cli.smoke.js`/`tests/integration.js`,
新增文件 `docs/skills-wave/w61-sk26-front-writeback.md`。

落地内容不复述该槽记账件;从合入方角度只需记住三件形态:

- 该分支叉自 **`450c29f`**(`w57` 记账件那一版),即 **W58/W59/W62/W64 并入之前**,
  故它对 `README.md`/`docs/skills-wave/README.md`/`js/skills.js`/`tests/unit.js` 的改动
  **都是在旧实况上改的**;
- 但它改的**主题**与 W58/W59 落的东西**部分重叠**:W58 改的是 SK-26 里"已回流那两个闭环走哪条通道",
  W61 改的是"回流面还差哪几步",两件事写在**同一条 `note` 的相邻两句**里(W64 当时逐行读分开过,
  本槽是这两句真的撞在一起的那一次);
- 与 W59 的问题中心 UMD、W53 的 `memSeed` **零重叠**,那两块全在自动合并区,合完直读复核在位
  (`js/issues.js` 的提醒投影表现取仍 7 行、`js/issues-ui.js` 在、`WfCore.memSeed` 的 8 条用例全在)。

冲突总表:

| # | 文件 | 处 | 解法 |
|---|---|---|---|
| 1 | `js/skills.js` | SK-26 `note`「写入点在哪几处」 | **两个半句合成一句**:取对侧六面枚举 + 把发布那一面换成本侧命令化后的实况(4.1) |
| 2 | `js/skills.js` | SK-26 `note`「`steps` 登记几步」 | 同上,"五步"与"两步"都不要,改写成**六步**(4.1) |
| 3 | `tests/unit.js` | SK-26 `cmds` 断言 | 随 #2 改成主线六步按步序(4.1) |
| 4 | `README.md` | API 表两行落在同一插入点 | **两行都留**:对侧改的 `extract-subjects` + 本侧新增的 `/api/wf/release`(4.2) |
| 5 | `README.md` | 回归测试段四段(unit/integration/e2e/cli.smoke) | `ours` 为底 + 折回对侧三块描述;数字 live(4.2、4.4) |
| 6 | `docs/skills-wave/README.md` | 目录索引表 | 按波次序取并集,`w61` 行排在 `w60` 与 `w62` 之间(4.2) |
| 7 | `docs/skills-wave/README.md` | 一分钟摘要「记忆的写入面不再全靠人打字」那条 | `ours` 为底(带 W58 命令化出口那半)+ 接上对侧的六处回流段,`G-12` 按实况摘掉(4.2) |

另有三处**不在冲突块里、合完才失效**的源级断言(4.3),与三处非冲突区散文过期(4.5)。

## 4. 逐处怎么解

### 4.1 `js/skills.js`:两侧各改半句,合成一句

SK-26(`review.memoryFeedback`)的 `note` 里有两句是本槽的全部冲突源。合并基(`450c29f`)那一版:

```
+ '四处写入点:浏览器 review.js 整集审片、服务端 /api/wf/smart-review(CLI/MCP 同链路)、'
+ '发布留痕两端(浏览器 release.js stampRelease 与 CLI release,后者随同一次 PUT 的 meta 桶写回)。'
…
+ 'steps 只登记审片这一步:发布留痕两端都在领域命令注册表之外,编排层不为它挂假命令名(命令化待 G-12)。'
```

两侧各自改了它:

| 侧 | 写入点那句 | `steps` 那句 |
|---|---|---|
| `ours`(W58 经 W64) | 四处,发布那一面改成 `/api/wf/release` + `exec project.release` + MCP 同链路 | 「**两步**都是已注册命令」 |
| `theirs`(W61) | 六面枚举(审片/发布/理解/分镜/拆集/提取主体),发布那一面仍是 `CLI release` | 「登记的是有命令出口的**五步**,发布留痕仍在注册表之外」 |

**两侧都是真的、都不完整**:取 `ours` 就把前段四步的四个浏览器写入点与三个服务端写入点写成不存在,
取 `theirs` 就把已经接上的 `project.release` 写回"待 G-12"。解法是逐句合:

- 写入点那句以对侧的六面枚举为骨架(那是合并后真实的形态),把其中「发布留痕(`release.js stampRelease` /
  **CLI release**)」换成本侧的「/ 服务端 `/api/wf/release`,CLI `exec project.release` 与 MCP 同链路」;
- `steps` 那句取本侧句式("都是已注册命令 + `release-core.js` 双端单源 + 不再挂假命令名"),
  把"两步"改成"**六步**"、"两个闭环"改成"**主线六个回流闭环**"。

`steps` 数组本身**落在自动合并区**——基线 1 步、`ours` 加 1 步、`theirs` 加 4 步,`git` 干净地合成 6 步。
正因为数组自动合上了,那两句散文才必须手改:不改就是数组说六步、散文说两步/五步。

`tests/unit.js` 的 `cmds` 断言(#3)是这两句的机读镜像,随之改成六步按步序。
合并后现取复核:

```
node -e "const S=require('./js/skills.js');console.log(S.byId('review.memoryFeedback').cmds.join(' > '))"
# project.extractSubjects > project.splitEpisodes > episode.understanding > episode.generateStoryboard > episode.smartReview > project.release
```

步序不是随手排的:它与 `Domain.workflow` 主线步序一致(提取主体 → 拆集 → 理解 → 分镜 → 审片 → 发布),
`contract` 套件里「编排型条目的 `cmds` 由 `steps` 去重推出」那条会替这个顺序背书。

### 4.2 三处"两侧各新增一块"一律两块都留

**`README.md` API 表(#4)**:`theirs` 给 `/api/wf/extract-subjects` 那行加了回流口径的尾巴,
`ours` 在它下面新增了整行 `/api/wf/release`。两行紧邻故报成一处冲突,而它们讲的是两个端点。
按 W64 立的口径**两块都留**:取 `theirs` 的 `extract-subjects` 行 + `ours` 的 `release` 行。
机械取任一侧的代价是具体的——取 `ours` 丢掉提取主体的回流口径描述,取 `theirs` 整行 `/api/wf/release` 消失
(而 `contract` 套件的 README 数字对账**只管 unit 用例数**,API 表少一行零断言兜底)。

**目录索引表(#6)**:`ours` 侧带 `w58`/`w59`/`w60`/`w62`/`w64` 五行、`theirs` 侧带 `w61` 一行。
按波次序把 `w61` 那行排在 `w60` 与 `w62` 之间取并集。表本身有契约断言「索引与目录实况双向对齐」兜底,
但**行序不在断言里**,靠人守波次序;而且那条断言是**双向对齐**——同时删掉记账件与索引行照样全绿
(5.4 变异 5 复现了 W63 记的这一处)。

**一分钟摘要那条(#7)**:`ours` 是「…蒸馏进 persona 仍要人点自进化(G-11),见 w43…;
**发布留痕的命令化出口随 W58 接上后**,那一处写入点从「CLI 自己拼 meta 桶」改成服务端 `/api/wf/release`…」,
`theirs` 是「…**发布留痕的命令化出口仍待 G-12**,见 w43…。**W61 把回流面从这两处补到主线六处**:…」。
解法是 `ours` 整句为底(它的 W58 那半必须留)+ 把 `theirs` 的「W61 把回流面…」整段接在句末,
并把该段末尾的「`G-11`/`G-02`/`G-12` 三条仍开」按实况改成「**`G-11`/`G-02` 两条仍开**」——
`G-12` 的第三个落点已随 W58 接上,这一句在 `theirs` 侧成立、在合并后不成立,
且它与同一份文件里「`G-12` 的三个落点已全部接上」那句直接打架。

### 4.3 三处"两侧各自成立、合到一起才失效"的源级断言

这是本槽最需要合完真跑才看得见的一类。三处都**不在冲突块里**:

| # | 断言 | 为什么合完才失效 | 改法 |
|---|---|---|---|
| 1 | `assert(!/WfCore\.memWrite\(/.test(files['cli.js']), 'CLI 侧不再自己派生发布回流…')` | `ours` 写这条时 `cli.js` 里确实零处;`theirs` 给提取主体接了 `withProject` 的 `meta` 桶回流,于是整文件搜命中 | 只切 `CMD.release` 那段判,再补一条"`cli.js` 里不得出现发布分支 `memFeedback({ p, gate`" |
| 2 | `assertEq(…match(/tree\.agentMemory = WfCore\.memWrite\(tree\.agentMemory,/g).length, 5, '服务端应有五处写入点(审片 + 理解 ×2 + 分镜 + 拆集)')` | `theirs` 数的是它自己那五处;`ours` 的发布端点是第六处 | 改成 **6**,文案补上"+ 发布" |
| 3 | `exSeg = cli.slice(indexOf("EXEC['project.extractSubjects']"), indexOf('CmdRegistry.META.forEach'))` | 这段切片原意是"只看提取主体那条命令",而 `ours` 在它与注册表收尾之间插入了 `EXEC['project.release']`,那条里的 `await POST` 被数进来,"只发一次请求"变成 2 | 切到**下一条 `EXEC['`** 为止 |

第 1 处的改法值得说清楚:原断言的**意图**是"发布回流的写入点已归服务端,CLI 不要再写第二份",
但**写法**是整文件搜。合并后 `cli.js` 里确有 `memWrite`,可它属于提取主体那条回流——
把断言放宽成"允许 `cli.js` 有 `memWrite`"就等于把这条纪律作废,
故改成按段判(`CMD.release` 段内零 `memWrite`/`memFeedback`)+ 按分支名判(全文件不得有发布分支的 `memFeedback`),
判据**只增不减**。第 3 处同理:锚点从"注册表收尾"收紧成"下一条 `EXEC`",切片只会更窄不会更宽。

三处都有变异取证(5.4)。

### 4.4 数字一律 live 现取,两侧的都不能要

四个数字两侧都不对:

| 数字 | `ours`(w64) | `theirs`(w61) | 合并后 live |
|---|---|---|---|
| `unit` 用例数 | 408 | 405 | **415** |
| `integration` 用例数 | 118(记"W58 扩至") | 113(记"W61 扩至") | **126**(记"W61 扩至") |
| `cli.smoke` 用例数 | 90(记"W58 扩至") | 87(记"W61 扩至") | **97**(记"W61 扩至") |
| `memory` 套件条数 | 12 | 12 | **26** |

前三个是"两侧各自加各自的、合到一起才是全量"的老形态(W57 记过 `cli.smoke` 72/72→80 那一次)。
第四个不一样:**`memory 套件现 12 条`这句在两侧都已经过期**——`ours` 侧实测 19、`theirs` 侧更多,
它是先于本槽存在的漂移(该数字零断言兜底)。本槽既然把这个套件从 19 推到 26,顺手按实测校正成 26;
这一处如实记成"本槽的收敛动作,不是 `w61` 的增量"。

`contract` 套件只对 **unit 用例数**有断言(README 里那一个数),`integration`/`cli.smoke`/`memory`
三个数字改错都全绿(5.4 变异 7),靠合入方现取。

### 4.5 并入让非冲突区散文过期:本槽三处(都是"假欠账"方向)

W63 第 4.11 节把这类叫"假欠账"——**余量真的补完了、记账还写着没补**,而记账断言(W36 立、W39 收紧)
只认「仍欠」之后那段里的锚点,治的是反方向的"假清账"。本槽三处全在两份 README 的非冲突区:

| # | 位置 | 过期的句子 | 改成 |
|---|---|---|---|
| 1 | `README.md` 「主线 skill 索引」段 `infra` 三条的余量枚举 | 「…、理解/分镜/拆集/提取主体几步的结论仍不自动回流记忆、…」 | 「…、生成与合成两步没有可判定的结构化结论可回流记忆(主线其余六步的结论已回流)、…」 |
| 2 | `docs/skills-wave/README.md` 「记账诚实位」那条同一句枚举 | 同上 | 同上 |
| 3 | `docs/skills-wave/README.md` 「SK-04 点名的那处余量随 W53 收掉」那条的尾句 | 「SK-04 的仍欠段随之只剩自动沉淀那一半——理解/分镜/拆集/提取主体几步的结论仍不回流」 | 原句保留(那是 W53 当时的实况)+ 补「**那四步随后随 W61 补齐**,SK-04 的仍欠段现只剩生成与合成两步」 |

第 3 处保留原句再补一句、而不是直接改写,是因为那条讲的是 **W53 当时**做了什么;
按目录里既有的写法(「W40 点名的那处余量随 W42 收掉」),余量的推进是一条一条往后接的,
把历史句改掉会让这条链断掉。

**`js/skills.js` 里 SK-04 的 `note` 本身不用本槽改**:`theirs` 自己已经改成
「自动沉淀本轮结论(那一面归 SK-26 的回流面)现覆盖主线六个闭环…仍欠一处覆盖余量:生成与合成两步…」,
落在自动合并区(`ours` 侧那一行与合并基相同)干净合上。W63 预判的那处"零冲突全绿而 `note` 与代码相反"
**因此没有发生**——它审的是 `w61` 更早的一版。

**有意不改的**:

- 各分支自己的记账件——`w61-sk26-front-writeback.md` 里的数字与"仍欠"段照原样,按 W38 立的口径
  「分支记账件里的数字与实况不随并入更新」,实况的推进由本文接住。
  该文里「SK-04 剩三处余量」那段与本槽改写后的措辞不同,是它写作时的实况,不动。
- `docs/AI助手接入指南.md` 一字未动:`w61` 没有新增/改名任何 CLI 子命令与 MCP 工具
  (它对 `mcp.js` 的改动只有 `hujing://memory` 一行 `description`,落在自动合并区),
  工具数与命令数两个数一个没动,`contract` 套件全绿即取证。
- `README.md` 架构树一格未加:`w61` 没有新增 `js/` 模块(四个浏览器写入点全落在既有模块里),
  与 W64 那次要补 `js/release-core.js` 的形态不同。

### 4.6 `tests/integration.js`:内联块号 24 → 25

`w61` 在 `tests/integration.js` 里给自己那块回流断言编了号 `24(W61)`——那是它写作时的下一个空号
(它那侧的块头最大到「测试 23(W53)」)。合入后 `ours` 侧的「测试 24(G-12 第三个落点):发布留痕」
已经占了 24,两块各在一处、`git` 一句冲突也不报。按 W64 立的口径顺号为 **25**:
留两个 24 下一个人按编号找块会找错。这一处零断言兜底(没有用例在数块号),靠通读捞出。

## 5. 实测与取证

### 5.1 三套件数字

| 套件 | 合并基 `450c29f`(w57) | 基线 `c36abaa`(w64) | `w61 @ 1c459fc`(独立 worktree) | 合入后 HEAD |
|---|---|---|---|---|
| `node tests/unit.js` | 398/398 | 408/408 | 405/405 | **415/415** |
| `node tests/integration.js` | 105/105 | 118/118 | 113/113 | **126/126** |
| `node tests/cli.smoke.js` | 78/80 | 88/90 | 85/87 | **95/97** |

`w61` tip 的数字比基线低是**它叉得早**(叉自 `450c29f`,W58/W59 并入之前),不是它删过测。

### 5.2 `cli.smoke` 那 2 项失败:与 `master` 同名同表现

在 `master`(`9adcf0f`)的独立 worktree 现跑取证:

```
FAIL | 未登录 whoami → exit 3 | exit=1
FAIL | llm --json mock 链路 | undefined
==== CLI 冒烟:51/53 通过 ====
```

合入后 HEAD 的失败项**逐字同名同表现**,合并基、基线、`w61` tip 三处亦同(各 78/80、88/90、85/87)。
即这 2 项是先于本槽存在的主干问题,本槽不新引入、也不顺手修(改它就等于本槽在改一份与合入无关的东西)。

### 5.3 零吃测:三套件名集与两侧并集逐条相等

按 W64 立的手法——**"对侧自己加了几条 == HEAD 相对基线多了几条"**——把合并基也跑一遍:

| 套件 | 合并基 | `w64` 相对合并基 | `w61` 相对合并基 | 合并基 + 两侧增量 | 合入后实测 |
|---|---|---|---|---|---|
| `unit` | 398 | +10 | +7 | 415 | **415** ✅ |
| `integration` | 105 | +13 | +8 | 126 | **126** ✅ |
| `cli.smoke` | 80 | +10 | +7 | 97 | **97** ✅ |

数字对得上还不够(同名替换也能凑数),再逐条比名集:

```
sort -u names-<suite>-w61.txt names-<suite>-w64.txt > union.txt
comm -23 union.txt names-<suite>-merged.txt   # 并集有而合入后没有(丢测)
comm -13 union.txt names-<suite>-merged.txt   # 合入后有而并集没有(凭空多)
```

三套件**两个方向都是空**:`unit` 并集 415 条、`integration` 并集去重 125 条、`cli.smoke` 并集 97 条,
与合入后逐条相等。`integration` 的用例数 126 与名集去重 125 差 1 是 W64 记过的同名重复
(`项目不存在 404` 在拆集块与发布块各一条),`w64` tip 上就有,不是丢测。

### 5.4 变异实测七条

| # | 变异 | 结果 | 说明 |
|---|---|---|---|
| 1 | `cmds` 断言退回 `ours`(`episode.smartReview,project.release` 两步) | **红 1**(`memory · SK-26 记账与实况同步`) | 4.1 的解法有断言背书 |
| 2 | `js/skills.js` 的 `steps` 删掉 `project.release` 那步(退回 `theirs` 五步) | **红 2**(`contract` + `memory`) | `contract` 那条会点名「应登记发布留痕这一步(编排层现在挂得出命令名)」 |
| 3 | SK-26 `note` 的「写入点在哪几处」整段退回 `ours`(删 406 字) | **全绿 415/415** | **零断言兜底**——同一条 `note` 里 4.1 改的两句,一句(`steps`)有机读镜像、一句(写入点)只能通读守 |
| 4 | `core.memoryDual` 的 `note` 退回基线措辞(前段四步已回流而 `note` 写不回流) | **红 1**(`skills · 记账对齐`,点名「须在「仍欠」段里点名:生成与合成」) | W63 预判的"假欠账无声"在本槽**不成立**:`w61` 同步改了 `facts` 表锚点 |
| 5 | 同时删 `w61` 记账件与索引行 | **全绿 415/415** | 复现 W63 记的这一处:契约是**双向**对齐,两边一起删就对得上 |
| 6 | 只删索引行(记账件留着) | **红 1**(`contract · 索引与目录实况双向对齐`) | 与 5 对照:漏登记接得住,连人带账一起撤接不住 |
| 7 | `README.md` 的 `integration` 数字改成 118 | **全绿 415/415** | `contract` 的 README 数字对账**只管 unit 用例数**,另三个数靠合入方 live 现取(4.4) |

变异 3 与变异 7 是本槽两处**明确的零断言口子**,如实记下不补:补第一处要给散文写字面断言
(那等于把 `note` 钉死,余量一推进就得连着改断言,W39 已论证过这种钉法的代价);
补第二处要把另外三个测试数字也纳入 `contract`,那是 W23 当时有意划的范围,不在本槽的合入职责里。

### 5.5 对侧带回旧实况的复核:本槽零处

W62 记过"对侧**纯新增文件**照样会带回分叉时的旧实况"。本槽新增文件只有
`docs/skills-wave/w61-sk26-front-writeback.md` 一份,按 4.5 的口径它是记账件、不随并入更新,
其中的数字(unit 405 等)是它写作时的实况,不是主干实况——不改、也不据它写主干数字。

自动合并区逐处直读复核(合完现取,不看 `git diff`):

| 复核项 | 实测 |
|---|---|
| `js/release-core.js` 在、`project.release` 四端齐备 | 在;`release` 套件与 `contract` 全绿 |
| `js/issues.js` UMD 化 + `js/issues-ui.js` 薄封装 | 两个文件都在;`Issues.reminders()` 现取 **7** 行,第 6 行仍是 SK-19 的 `shot-stable-lexicon`、第 7 行 `caption-unreadable` |
| `WfCore.memSeed`/`memMigrateBoard` 双端单源 | 在;`memory` 套件里 6 条播种/迁移用例全在(含双端同播与源级接线) |
| `mcp.js` 的 `hujing_release` 工具与 `hujing://memory` 新说明 | **两者都在**(前者 `ours`、后者 `theirs`,同文件不同行,自动合并) |
| `SK-04` `note` 的"六个闭环"新措辞 | 在(`theirs` 侧改动,自动合并区) |
| 短名单 `pending` | **0**(30 条) |

**`facts` 表这一次动了、但不是本槽动的**:表里 `core.memoryDual` 那行的判据由
`memRecall && memSeed` 变成 `memRecall && memFeedback`、锚点由 `['理解/分镜/拆集/提取主体','SK-26']`
变成 `['生成与合成','解析向导']`,两处都是 `theirs` 侧的改动落在自动合并区
(`ours` 侧那一行与合并基逐字相同,故 `git` 不报冲突)。这与 W57 立的口径一致——
**锚点跟着"本槽刚落地的出口"走**:W53 落 `memSeed` 时锚点改指 `memSeed`,
W61 落回流面时改指 `memFeedback` 与新的仍欠段。`memSeed` 本身的覆盖没有因此变薄,
它有自己的 6 条专用用例(上表第三行),`facts` 表那一格只是"该出口已落地"的抽查位。

## 6. 留给下一槽

- **W63(`cursor/w63-cycle6-audit-7c41`,tip `496e226`)按任务口径本槽不合**,仍在远端。
  它是周期 6 的独立核验件,其中第 4.11 节点名的"假欠账"风险本槽实测已被 `w61` 自己接住(5.4 变异 4),
  但它记的另外两处(变异 5 的"同时删记账件与索引行全绿"、变异 7 的"README 三个测试数字零断言")
  本槽复现成立,仍开。
- **W65(`cursor/w65-g11-mem-scope-filter-d5cf`)未合**:它接的正是 SK-26 `note` 仍欠段里
  `G-11` 那一处——`evolveExpert` 读记忆不按板块过滤、只对自定义专家开放。
  合它的槽要连着改 SK-26 `note` 末尾的「仍欠(G-11)」整段与
  `tests/unit.js` 里「`evolveExpert` 现仍读全量记忆文本(不按 scope 过滤)」那条源级反查断言
  ——那条断言的措辞是"接上了 note 先失效",即**功能一落地它就该红**,是有意留的路障。
- 本槽 4.5 改写的三处散文里,`SK-04` 的仍欠段现指「生成与合成两步没有可判定的结构化结论可回流」。
  下一个动这一面的槽要注意:那两步的判定面归发布门 G3/G7,不是"漏做",
  改 `note` 之前先确认改的是余量本身而不是余量的描述。
