# W10 · 周期 2 集成与 skill 落地独立核验

> 核验槽独立作业:**只读代码、只写本文件**。全部测试数字由本槽在干净工作树上重新跑出,不引用被核分支文档里的数字;
> 引文与自测不一致处逐条标注。本轮不开 PR、不合并、不改任何业务代码。
> 成熟度沿用 `w5-cycle1-audit.md` 第 1 节的 M0–M4 标尺(M3 = 代码+断言、分支内自洽全绿;**M4 = 已合入 `master`**)。

## 0. 核验时点与锚定 SHA

复核在同一时点对以下 SHA 取样。**核验期间并行槽仍在推进**:`cursor/w9-integration-f8f9` 与
`cursor/w9-eps-structure-check-c8c2` 两支都是本轮核验开始后才出现在远端的,数据以下表 SHA 为准。

| 分支 | head | 相对 `master` |
|---|---|---|
| `master` | `9adcf0ff` | — |
| `cursor/w6-integration-9f68` | `e1074f7f` | 领先 70,落后 0 |
| `cursor/w7-integration-fa8a` | `072f3422` | 领先 94,落后 0 |
| `cursor/w8-split-episodes-inject-ba63` | `84c42e2d` | 领先 85,落后 0 |
| `cursor/w8-script-check-8664` | `bbd7ebbb` | 领先 73,落后 0 |
| `cursor/w9-integration-f8f9` | `b2f7f52d` | 领先 102,落后 0 |
| `cursor/w9-eps-structure-check-c8c2` | `f20320ff` | 领先 74,落后 0 |

`master` 是全部六支的**严格祖先**(`git merge-base --is-ancestor` 全部成立),因此任一支单独并入主干都是零冲突快进。

### 0.1 复核期间的分支移动(末次 fetch 增量)

四条必核分支在全程**未动**(head 与上表一致,数字可直接采信)。两条 W9 分支在本轮末次 `git fetch` 时各前进一个提交,
本槽对新 head 做了针对性复查,结论如下——**本报告正文的分支数据仍以上表 SHA 为准,本小节是增量说明**:

| 分支 | 新 head | 新增提交 | 对本报告结论的影响 |
|---|---|---|---|
| `cursor/w9-integration-f8f9` | `b2f7f52` → `641a1f5a` | `641a1f5` W9 收敛记录 + README 口径同步 | **两条阻塞已消除**:实测 README 改为「单元测试(288 项断言」(与实跑一致),`docs/skills-wave/w9-integration-log.md` 已补。`unit` 复跑仍 **288/288 PASS**。 |
| `cursor/w9-eps-structure-check-c8c2` | `f20320f` → `37bc2572` | `37bc257` README 同步 + 记账件 `w9-eps-structure-check.md` | 补齐了该支的记账件;功能提交未动,`unit 267/267` 结论不变。 |

**但两条核心阻塞在新 head 上依然成立,已逐条复测**:

- **漏合的 3 个提交仍未补**:`git merge-base --is-ancestor` 对 `072f342` / `97f6ba2` / `bbd7ebb` **三条全部不成立**;
  `docs/skills-wave/w7-integration-log.md` 与 `w8-script-check.md` 在新 head 上**仍然缺失**;
  `js/skills.js` 里修正后的注释字面(「哪一步都可能写的通用词」)命中数**仍为 0**。
- **`w9-eps-structure-check` 仍未并入集成线**(`--is-ancestor` 不成立)。

即:并行槽正在补记账件,但**跨分支的漏合与两条线的合流这两件事还没人做**——这也正是第 8 节把它们列为首要目标的原因。

## 1. 一句话结论

周期 2 的四条必核分支**全部达到 M3、无一达到 M4**;两条 W9 并行分支也已出现且均自洽全绿——
`w9-integration` 把三条余量代码收进一条集成分支(自测 `unit 288/288`),
`w9-eps-structure-check` 补上 SK-14/SK-15 两条校验项(自测 `unit 267/267`),**S-01 至此两半齐闭**。

但**收敛尚未完成**,两处:`w9-integration` 按分支的父提交而非 head 合并,漏掉 3 个提交
(2 份记账文档 + 1 行注释修正),且 `README.md` 的断言数仍写 280(实测 288);
`w9-eps-structure-check` 则**尚未并入集成线**,且它的基线是 `w8-script-check` 而非 `w7`,
因此不含 W7 的四项成果——两支合流时有 5 文件 8 处冲突待解。

短名单 30 条:`w9-integration` 上 **14 条 pending 全清、16 条仍缺**;两支全部合流后为 **16 清 / 14 缺**。
校验面从 W2 的**零条实现**涨到 **8 条**(合流后),是周期 2 最实的进展。

`master` 上 `js/skills.js` 与 `docs/skills-wave/` **仍然都不存在**——
周期 1 核验报告最重要的那条结论(没有任何一项进主干)在周期 2 结束时依然逐字成立。

## 2. 独立复跑对账(全部数字为本槽实测)

在每支的独立 `git worktree` 上依次跑 `node tests/unit.js`、`node tests/integration.js`、`node tests/cli.smoke.js`。

| 分支 | unit 实测 | 文档自称 | integration 实测 | 自称 | cli.smoke 实测 | 自称 | 对账 |
|---|---|---|---|---|---|---|---|
| `master`(基线) | **201/201** | — | **79/79** | — | **51/53** | — | 基线 |
| `w6-integration-9f68` | **251/251** | 251 | **89/89** | 89 | **59/61** | 59/61 | ✅ 三项全对 |
| `w7-integration-fa8a` | **280/280** | 280 | **93/93** | 93 | **62/64** | 62/64 | ✅ 三项全对 |
| `w8-split-episodes-inject-ba63` | **265/265** | 265 | **89/89** | 89 | **60/62** | 60/62 | ✅ 三项全对 |
| `w8-script-check-8664` | **259/259** | 259 | **89/89** | — | 59/61 | — | ✅ unit 对上 |
| `w9-integration-f8f9` | **288/288** | 无记账件 | **93/93** | — | **62/64** | — | 无自称可对 |
| `w9-eps-structure-check-c8c2` | **267/267** | 无记账件 | **89/89** | — | — | — | 无自称可对 |

**零失败项**:六支的 unit / integration 全部 0 FAIL。

**cli.smoke 的 2 项失败是 `master` 基线态,已独立证实**:本槽在未改动的 `master` 上直接跑,同样得到
`FAIL | 未登录 whoami → exit 3 | exit=1` 与 `FAIL | llm --json mock 链路`,与各支上失败的是**同两项、同表现**。
各分支「不是回归、未删测换绿」的说法成立。

**用户任务书点名的「w7 声称 unit 280」核验结论:成立**——实测 280/280 PASS,0 FAIL。

补充实测:`w7` 的 `node tests/unit.js memory` 单跑 **6/6 PASS**(该轮新增套件确实可单跑);
`w7` 上 `node --check js/wf-core.js js/skills.js js/domain.js server.js cli.js tests/unit.js` 全部通过。

## 3. 分支拓扑:这不是一条链,是扇出

这是本轮最容易读错的地方,先钉住。W6 之后的分支**不是顺序叠加**,而是从 W7 集成过程的不同中间点分叉:

```
master 9adcf0f
  └─ w6-integration e1074f7 ────┬─ w8-script-check bbd7ebb ── w9-eps-structure f20320f
                                │        (基线 = w6 head)         (基线 = w8-script head)
                                └─ w7 整合中间点 7a56b94
                                     ├─ w8-split-episodes 84c42e2  (基线 = w7 中间点)
                                     └─ w7-integration 072f342     (继续合入 2 条后收尾)
                                          └─ 0aedf34 ─ w9-integration b2f7f52
```

实测 merge-base 佐证:`w7 ∩ w8-split = 7a56b94`(W7 的第 2 个合并提交),`w7 ∩ w8-script = e1074f7`(W6 head),
`w8-split ∩ w8-script = e1074f7`,`w9-eps ∩ w9-integration = b10a694`(W8 剧本校验的代码提交)。

由此产生两条必须记住的事实:

1. **`w8-script-check` 完全不含 W7 的任何成果**——它没有机位词表归一(G-07)、没有字幕质检(SK-28)、
   没有 extractSubjects wf 通道、没有 audioMeta。其 `docs/skills-wave/` 里 `w4-shot-size-glossary.md`
   与 `w4-film-caption-check.md` 双双缺席,即为实证。
2. **`w8-split` 只含 W7 的前两条**(G-07 + SK-28),不含后两条(extractSubjects / audioMeta);
   其目录里 `w6-extract-subjects-wf.md` 与 `w4-audio-meta.md` 缺席。
3. **`w9-eps-structure-check` 继承 `w8-script-check` 的基线,因此同样不含 W7 全部四项**——
   它是「W6 + 剧本校验 + 分集校验」这一条线,与 `w9-integration` 的「W6 + W7 + 拆集注入 + 剧本校验」
   是两条**互不包含**的线。两者合流才是全量。

所以各支的测试数字**不可横向比大小**:`w8-split` 的 265、`w8-script` 的 259、`w9-eps` 的 267
分别是在不同基线上加出来的,不存在「267 比 265 做得多」的关系。

## 4. 逐项目核验

### 4.1 `cursor/w6-integration-9f68` — 周期 1 全量收敛

| 项 | 结论 |
|---|---|
| **成熟度** | **M3**(代码 + 断言、分支内自洽全绿)。未合入 `master`,不构成 M4。 |
| **增量** | 周期 1 的 16 条分支收敛到一条:KB.SECTIONS 取用面、agent-flow 贯通、G-01 专家人设过服务端、G-03 审片升主线步、G-05 tplVideo、skills 全栈 30 条、G-04 headless 前段,外加 W1 七份文档件。相对 `master` 领先 70 个提交、55 个文件、+5937/−353 行。 |
| **证据(本槽实测)** | `unit 251/251`、`integration 89/89`、`cli.smoke 59/61`,与其记录第 1 节的三个数字**逐个对上**。`Skills.REG` 实测 30 条、`Skills.CHECKS` 实测 2 条(`subjects.shotRefIntegrity` / `subjects.crossShotConsistency`),与「校验面首次落地两条」相符。G-01/G-02/G-03 均已实证落地:`server.js` 有唯一装配口 `function wfPersonaNote(`、`js/wf-core.js` 有 `memRecall`/`memBlock`、`js/domain.js` 有 `step('review', '审片', …)`。 |
| **阻塞** | 无技术阻塞。唯一阻塞是**未进主干**:它是后续全部分支的公共基线,却停在远端。它自己记录第 5 节列的 9 项剩余分叉在本支上一项未动。 |
| **下一目标** | 作为周期 1 的唯一收敛点,它已被 `w7` 完整包含(`w6 head` 是 `w7` 的祖先,实测成立),**其本身不再需要单独推进**;剩余价值只在于「若要分批进主干,它是第一批的天然切点」。 |

### 4.2 `cursor/w7-integration-fa8a` — 周期 2 第 7 波收敛(用户点名核验)

| 项 | 结论 |
|---|---|
| **成熟度** | **M3**。当前**质量最高、内容最完整的单支**(是 `w6` 的超集,且四条 W7 分支全在内)。未进 `master`。 |
| **增量** | 在 `w6` 基础上 +24 个提交:G-07 机位词表归一、SK-28 成片字幕质检、extractSubjects 接 wf 通道、audioMeta 配音渲染清单单源,外加 memory 套件 6 条与一批口径数字对齐。相对 `master` 领先 94 提交、70 文件、+7344/−469 行。 |
| **证据(本槽实测)** | **声称的 unit 280 核实为 280/280 PASS**;`integration 93/93`、`cli.smoke 62/64` 亦逐个对上。四项合入声明**全部在代码层证实**:① 词表——`js/wf-core.js` 有 `W.SHOT_SIZES` 且 `W.SIZES = W.SHOT_SIZES.map(...)`(派生而非第二份);② 字幕——`CHECKS['film.subtitleTiming']` 已注册且被 SK-28 的 `checks` 引用;③ extractSubjects——`server.js` 有 `/api/wf/extract-subjects` 端点、`WF_BOARD['extract-subjects']`、经 `wfPersonaNote(tree, p, scope)` 注入;④ audioMeta——`js/domain.js` 有 `audioMetaWrite`/`audioMetaOf`/`audioTrackOf`。另实测 `wfPersonaNote(` 在 `server.js` 出现 **7** 次,与其 contract 断言硬编码的 7 一致。 |
| **阻塞** | ① 未进主干。② 其记录第 6 节自列 8 项剩余分叉,本槽抽验证实两项:`Skills.playbook('eps.frontPipeline')` 实测**仍只回 2 步**(理解 → 分镜),SK-16 编排确未含前段两步;`Skills.block('gen')` 实测**长度 0**,SK-21 的注入面确实零消费。③ 与两条 W8 分支互为分叉,存在待解冲突(见第 7 节)。 |
| **下一目标** | 已被 `w9` 吸收**除 head 一个文档提交之外**的全部内容(见 4.5)。剩余目标只有一件:把 `072f342`(W7 收敛记录 + 目录索引同步)带进 `w9`,否则 W7 这一波的过程记账在集成线上丢失。 |

### 4.3 `cursor/w8-split-episodes-inject-ba63` — G-04 拆集补注入

| 项 | 结论 |
|---|---|
| **成熟度** | **M3**。改动面最小、纪律最干净的一支。 |
| **增量** | 单一目标:`/api/wf/split-episodes` 与浏览器 `llmSplitEpisodes` 补上「生效专家方法论 + 协作记忆」注入,使主线最前段与中后段口径一致。四处改动(`WF_BOARD` 加一键、`buildSplitUser` 加第三参 `ctx`、端点拼注入、浏览器同装配口),拆集算法逐字未动。 |
| **证据(本槽实测)** | `unit 265/265`、`integration 89/89`、`cli.smoke 60/62`,与其第 4 节的三个数字**逐个对上**。实测 `server.js` 的 `wfPersonaNote(` 计数为 **7**,其 contract 断言写 7,一致;`WF_BOARD` 键表实测 `understanding,smart-storyboard,smart-review,split-episodes`,与断言字符串一致。「不碰 `js/skills.js`」的声明成立——该文件相对 `w7` 中间点无差异,`Skills.CHECKS` 仍是 3 条。 |
| **阻塞** | ① 未进主干(已由 `w9` 全量吸收,是**唯一被完整并入的一支**,实测 `git log w9..w8-split` 为空)。② 基线是 `w7` 的中间点,因此它自己**不含** extractSubjects 与 audioMeta。 |
| **下一目标** | 已完成,无余量。其文档第 5 节预判的冲突解法(`WF_BOARD` 取并集、`wfPersonaNote` 计数「本轮 +1,提取主体那轮再 +1」)在 `w9` 上**如实兑现**:实测 `w9` 的计数为 **8**、`WF_BOARD` 为 5 键、断言同步改成 8。这条预判精确成立。 |

### 4.4 `cursor/w8-script-check-8664` — S-01 剧本半校验宿主

| 项 | 结论 |
|---|---|
| **成熟度** | **M3**。 |
| **增量** | `CHECKS` 从「只有主体面 2 条」扩到「跨两步 5 条」:新增 `script.openingHookAnchor`(SK-07)、`script.faceslapStepOrder`(SK-08)、`script.dialogueLineLength`(SK-09),三条能力的 `pending: ['check']` 随之清空。消费点复用既有两处(`episode.preflight` 的 `result.checks`、问题中心 `script-craft` 低危)。 |
| **证据(本槽实测)** | `unit 259/259`,与其第 1 节自称的 259 **对上**(基线 `w6` 的 251 + 8,增量吻合);另测 `integration 89/89`、`cli.smoke 59/61`,与 `w6` 基线同,佐证「未碰这两层」。`Skills.CHECKS` 实测 5 条,三条 script 项确已注册;三条条目的 `pending` 实测为空,「先有实现再登记」的纪律成立。 |
| **阻塞** | ① 未进主干。② **代码已被 `w9` 吸收,但 head 两个提交没被带走**(见 4.5),其中 `97f6ba2` 含本轮的记账文档与 README 同步、`bbd7ebb` 含一行注释修正。③ 基线是 `w6`,不含 W7 全部四项。 |
| **下一目标** | ① 把 `97f6ba2`、`bbd7ebb` 补进 `w9`。② 其第 8 节列的 S-01 分集半(SK-14 / SK-15)本轮明确不做,是下一步的直接入口——宿主形态已跑通,落地后只需在两个消费点的 stage 列表加 `eps`。 |

### 4.5 `cursor/w9-integration-f8f9` — 余量合入(核验期间新出现)

用户任务书列为「并行可能未完成:w9 余量合入」。**它已存在并已合完三条余量**,但收敛动作未做完。

| 项 | 结论 |
|---|---|
| **成熟度** | **M3,但收敛未完成**(代码层全绿,记账层有缺)。 |
| **增量** | 三个 `--no-ff` 合并提交:`56566f2` 提取主体 wf 通道尾部增量、`8a84212` G-04 拆集注入、`b2f7f52` S-01 剧本段校验宿主。合成结果是目前**唯一同时含 W6 + W7 四项 + W8 两条**的分支,领先 `master` 102 个提交。 |
| **证据(本槽实测)** | `unit 288/288`、`integration 93/93`、`cli.smoke 62/64`,0 FAIL,cli.smoke 仍只剩 `master` 那两项。`Skills.CHECKS` 实测 **6 条**(主体 2 + 剧本 3 + 成片 1),`Skills.REG` 30 条不变。冲突解得正确:`server.js` 的 `wfPersonaNote(` 实测 **8** 次、断言同为 8;`WF_BOARD` 实测 5 键(`understanding,smart-storyboard,smart-review,extract-subjects,split-episodes`)、断言字符串一致——两条并行分支各 +1 的叠加被正确合并,没有一侧被丢。 |
| **阻塞(本轮最实的一条)** | **按父提交而非分支 head 合并,漏掉 3 个提交**。实测 `git log w9..w7` 与 `git log w9..w8-script-check` 均非空:<br>· `072f342`(w7 head)—— `docs/skills-wave/w7-integration-log.md` 181 行 + 目录索引同步;<br>· `97f6ba2` —— `docs/skills-wave/w8-script-check.md` 118 行 + `README.md` 剧本段三条校验项同步;<br>· `bbd7ebb` —— `js/skills.js` 一行注释修正(打脸四步词表注释原文举的通用词与实际被排除的词不符)。<br>可直接验证的表征:`w9` 的 `docs/skills-wave/` 目录里 `w7-integration-log.md` 与 `w8-script-check.md` **两份都不存在**;`w9` 的 `js/skills.js` 第 99 行仍是修正**前**的注释。 |
| **阻塞(第二条)** | **`README.md` 断言数失真**:实测仍写「单元测试(280 项断言」,实际 288。缺口来自两处叠加——漏合的 `97f6ba2` 本身带 README 同步(但它写的是 259,基于 `w6` 基线),以及本轮 +8 之后**尚未做最终数字重算**。按仓库纪律(README 与代码行为同步),这是必须补的一步。 |
| **阻塞(第三条)** | **本波尚无收敛记录件**。W6 / W7 各有一份 `*-integration-log.md` 逐处记冲突解法,`w9` 目前没有对应文档,四处冲突(`cli.js` / `js/commands.js` / `js/issues.js` / `tests/unit.js`,见合并提交消息)的取舍理由无处可查。 |
| **下一目标** | 按优先级:① 补合 `072f342` / `97f6ba2` / `bbd7ebb`(三者与 `w9` 现状**无代码冲突面**:前两者纯文档,第三者是单行注释);② README 三个数字重算为 `288 / 93 / 64`;③ 补 `w9-integration-log.md`;④ 之后 `w9` 即成为唯一的主干候选。 |

### 4.6 `cursor/w9-eps-structure-check-c8c2` — SK-14/15 分集校验(核验期间新出现)

用户任务书列为「并行可能未完成:SK-14/15 分集校验」。**核验开始时确无此分支,过程中出现,且已落地。**

| 项 | 结论 |
|---|---|
| **成熟度** | **M3**。单一提交(`f20320f`)、目标聚焦、分支内自洽全绿。 |
| **增量** | 补上 S-01 的**分集半**:新增 `CHECKS['eps.stageCoverage']`(SK-14 六阶段结构覆盖)与 `CHECKS['eps.payoffPlacement']`(SK-15 付费卡点位置),消费点与剧本半同构(`episode.preflight` 的 `result.checks` + 问题中心低危)。 |
| **证据(本槽实测)** | `unit 267/267`(基线 `w8-script-check` 的 259 + 8)、`integration 89/89`,0 FAIL。`Skills.CHECKS` 实测 **7 条**;SK-14 的 `pending` 实测为**空**且 `checks=eps.stageCoverage`,SK-15 的 `pending` 实测为**空**且 `checks=eps.payoffPlacement`——「先有实现再登记」的纪律与剧本三条同。仍 pending 的条目从 17 条降到 **15 条**。 |
| **阻塞** | ① 未进主干。② **尚未并入集成线**(实测 `--is-ancestor` 对 `w9-integration` 不成立),是当前**唯一在集成线之外的功能分支**。③ 基线是 `w8-script-check`,不含 W7 四项,所以它自己的 SK-28 仍是 pending。 |
| **下一目标** | 并入 `w9-integration`。实测该合并有 **5 文件 8 处冲突**(见第 7.3 节),其中 `js/skills.js` 出现**本双周期首次的 `CHECKS` 区域冲突**(1 处)——`w9-integration` 的 `film.subtitleTiming` 与本支的两条 `eps.*` 落在同一区域。冲突面仍属可控,但这是「`CHECKS` 追加式结构在并行下自动合并」这条规律的首个例外,值得在收敛记录里记一笔。 |

**S-01 闭合结论**:剧本半(SK-07/08/09)在 `w8-script-check`,分集半(SK-14/15)在 `w9-eps-structure-check`,
**两半分别落地、尚未在同一支上并存**。`w8-script-check` 记账件第 5 节第 1 条写的
「S-01 只闭了剧本半,分集半仍开着」在其自身分支上依然准确,且它预告的落地方式
(「宿主已就绪,落地后在两个消费点的 stage 列表加 `eps` 即可」)被本支**如实兑现**——没有另起宿主。

## 5. 短名单 30 条:pending 已清 / 仍缺

口径:以 `w2-skills-align-30.md` 第 2 节的落表结果为基线(该文档记 22 条带 pending、8 条全清),
对照本槽从 `Skills.REG` 直接读出的实际数据(不采信文档描述)。

W2 基线本槽已直接实测复核(在 `w2-skills-align-30-568b` 上读 `Skills.REG`):
**30 条中 22 条带 pending、8 条全清,待落地机制面 23 面**(infra 3 / orchestrate 2 / check 16 / inject 2),
`CHECKS` 为 **0 条**——与该文档第 2 节的记述**逐项对上**,可作为可靠基线。

### 5.1 已清(`w9-integration` 上 14 条;两支全部合流后 16 条)

| 分类 | SK | 何时清 |
|---|---|---|
| W2 即已全清(8 条) | SK-01 `core.stageIndex`、SK-02 `core.expertSkillRef`、SK-06 `script.hookType`、SK-16 `eps.frontPipeline`、SK-17 `shots.shotLanguage`、SK-25 `review.reviseLoop`、SK-27 `film.rhythmInject`、SK-30 `film.produceProjection` | W2 基线 |
| 周期 1 内清(2 条) | SK-12 `subjects.refIntegrity`、SK-13 `subjects.crossShot` | `w6` 已清(闭合 S-03) |
| **周期 2 新清(4 条,已在 `w9-integration` 上)** | **SK-28 `film.subtitleQC`**(闭合 S-06)<br>**SK-07 `script.hookStrength`、SK-08 `script.faceslapFour`、SK-09 `script.dialogueRule`**(闭合 S-01 剧本半) | SK-28 在 `w7` / `w8-split`;SK-07/08/09 在 `w8-script-check`;四条**只在 `w9-integration` 上同时成立** |
| **周期 2 新清(2 条,尚在集成线外)** | **SK-14 `eps.structureStage`、SK-15 `eps.payoffPoint`**(闭合 S-01 分集半) | `w9-eps-structure-check`,**未并入集成线** |

机制面口径(本槽实测):待落地面 **W2 的 23 面 → `w9-integration` 的 17 面 → 两支合流后 15 面**,
**净清 8 面,全部是 check 面**,恰好对应 8 条 `CHECKS` 实现(主体 2 + 剧本 3 + 成片 1 + 分集 2)。
校验面从「W2 零条实现」到「8 条」是周期 2 最实的进展,也是短名单里唯一实现了**跨步落地**的机制面。

### 5.2 仍缺(以 `w9-integration` 为准 16 条;两支合流后 14 条)

下表标 **†** 的两条已在 `w9-eps-structure-check` 上清空,合流后即从本表移除。

| SK | id | 待落地面 | 缺口 |
|---|---|---|---|
| SK-03 | `core.personaCtx` | infra | G-01 |
| SK-04 | `core.memoryDual` | infra | G-02 |
| SK-05 | `core.playbookProjection` | orchestrate | G-12 |
| SK-10 | `script.aiToneBan` | **inject + check** | S-02 G-13 G-10 |
| SK-11 | `subjects.refDiscipline` | check | G-06 G-13 |
| SK-14 **†** | `eps.structureStage` | check | G-13 G-04 **S-01** |
| SK-15 **†** | `eps.payoffPoint` | check | G-10 G-04 **S-01** |
| SK-18 | `shots.sizeProgression` | check | G-10 |
| SK-19 | `shots.promptEightDim` | check | G-15 G-06 G-05 G-10 |
| SK-20 | `shots.motionGate` | check | S-04 |
| SK-21 | `gen.videoTpl` | inject | G-05 G-13 |
| SK-22 | `gen.renderCredential` | check | S-05 |
| SK-23 | `review.stage` | infra | G-03 |
| SK-24 | `review.methodDim` | check | G-10 |
| SK-26 | `review.memoryFeedback` | orchestrate | G-11 G-02 |
| SK-29 | `film.deliverContract` | check | G-10 S-07 |

### 5.3 三条「记账滞后」:pending 与主干实况矛盾(需澄清,不是功能缺陷)

SK-03 / SK-04 / SK-23 的 `pending: ['infra']` 与代码实况**已经矛盾**——G-01、G-02、G-03 三个缺口
在 `w6` 上就已落地(本槽实测 `wfPersonaNote` / `memRecall`+`memBlock` / `step('review',…)` 三者俱在)。
`Skills.validate` 对 `infra` 面不做强制(只强制 check / orchestrate / inject 三面),所以测试不会转红。

三条的记账诚实度**不一致**,这是需要收口的地方:

- **SK-23 已如实标注**:其 `note` 明写「G-03 已落地:…本条 pending 的 infra 面留的是注册表侧记账收敛(改 pending 会动 gaps 投影,单列一轮)」。`w7` 记录第 6 节第 4 项也把它列为剩余分叉。**这是正确做法。**
- **SK-03 无任何说明**:条目无 `note`,读者只能读成「人设过服务端还没做」,与实况相反。
- **SK-04 的 `note` 只写设计口径**(「召回策略抽为纯函数后双端同用」),未说明已落地。

对照:**SK-21 的 pending 不属于此类,是诚实的**。其 `note` 写「模板三件套的 tplVideo 面现为零消费,
接进生成请求构造前本条不出注入块」——G-05 虽已把 tplVideo 接进**分镜**提示词链路,但 `gen` 步的
生成请求构造仍不消费它。本槽实测 `Skills.block('gen')` 长度为 **0**,与该注释完全一致。

## 6. 缺口编号闭合状态(G-01…G-15 / S-01…S-08)

按「该缺口关联的条目是否还有 pending」判定。**取两支合流后的口径**(即
`w9-integration` + `w9-eps-structure-check`,当前尚未在同一支上成立):

| 状态 | 缺口 |
|---|---|
| **已闭合**(关联条目 pending 全清) | G-07(机位词表,W7 闭)、G-08、G-09、G-14、**S-03**(主体引用完备性+跨镜一致性,W6 闭)、**S-06**(成片字幕质检,W7 闭)、**S-01**(剧本半 + 分集半,W8/W9 闭——**但两半尚未在同一支上并存**) |
| **部分闭合** | G-03 / G-04 / G-06 / G-12 / G-15:关联条目里有的已清、有的仍 pending |
| **仍全开** | G-01、G-02、G-05、G-10、G-11、G-13、S-02、S-04、S-05、S-07 |
| **无关联入选项** | **S-08**(发布后回写上游)。编号已登记在短名单第 7 节,但能力本身**未进 30 条**,`Skills.gaps()` 投影里没有它——实测 `gaps()` 键数为 22,S-08 不在内。W6 记录第 8 项、W7 记录第 6 项均已连续两波把它标为「需决定做还是明确拒绝」,**两波过去仍未决**。 |

`G-10`(专家方法论无法验收:审片与发布门无结构化判定项)是**牵连面最广的一条**,实测被 9 条 SK 引用
(SK-07/08/09/10/15/18/19/24/29),其中 6 条在 `w9-integration` 上仍 pending(合流后 5 条)。
它是校验面继续推进的主要瓶颈:**已落地的 8 条校验项全部只挂在 `episode.preflight` 与问题中心两个消费点上,
一条都没有进审片报告或发布门**——这正是 G-10 的定义面。

**编号规则一处小失真**:`w6` 收敛时已冻结 `G-01…G-15`、规定新缺口一律 `S-xx`,并把判定标准文档提议的
`G-16`(发布后→上游回路)改记为 `S-08`。但 `w8-split-episodes-inject.md` 第 5 节把并行分支
`w6-extract-subjects-wf` 写成「G-16 提取主体接 `/api/wf/*`」——**把已退役的 `G-16` 用在了另一件事上**。
被指的 `w6-extract-subjects-wf.md` 本身没有用这个编号(实测该文件 `G-16` 零命中),
所以这是单份文档的笔误、未扩散,但按「G-16 = S-08 = 发布后回路」的冻结口径应予更正。

## 7. 相对 `master` 未合入主干的测量

> 按任务书要求:本槽**不开 PR、不合并**,只做测量与风险量化。

### 7.1 主干现状:周期 1 + 周期 2 的成果一件未进

`master @ 9adcf0f` 上实测:

- `js/skills.js` —— **不存在**
- `docs/skills-wave/` —— **不存在**(整个目录)
- `server.js` 的 `wfPersonaNote` —— **0 次**(G-01 未进)
- `js/wf-core.js` 的 `WF_BOARD` —— **0 次**(服务端工作流板块映射未进)
- `js/domain.js` 的 `step('review', …)` —— **0 次**(G-03 未进,主干上主线仍是六步)

即:两个周期、29 条分支、30 条 skill 索引、8 条校验项、全部缺口收敛,**在主干上都不可见**。
`w5-cycle1-audit.md` 第 26 行那条结论(「本周期没有任何一项达到 M4」)在周期 2 结束时**依然逐字成立**。

### 7.2 未合入清单(`master` 外共 29 条远端分支,全部未进主干)

| 归属 | 分支 | 是否已被 `w9-integration` 吸收 |
|---|---|---|
| W1–W6 共 24 条 | `w1-*`(8)、`w2-*`(2)、`w3-*`(4)、`w4-*`(6)、`w5-cycle1-audit`、`w6-extract-subjects-wf`、`w6-integration`、`agent-flow-sota-analysis` | **全部已吸收**(逐条 `--is-ancestor` 实测成立) |
| 周期 2 | `w8-split-episodes-inject-ba63` | **已完整吸收** |
| 周期 2 | `w7-integration-fa8a` | **差 1 提交**(`072f342`,纯文档) |
| 周期 2 | `w8-script-check-8664` | **差 2 提交**(`97f6ba2` 文档+README、`bbd7ebb` 单行注释) |
| 周期 2 | **`w9-eps-structure-check-c8c2`** | **完全未吸收**(整支 1 个功能提交在集成线外) |
| 周期 2 | `w9-integration-f8f9` | 自身即集成线 head |

**即:整个双周期的成果集中在 `w9-integration` 一支,距全量只差两件——3 个补合提交(2 份文档 + 1 行注释)
与 `w9-eps-structure-check` 一支。**

### 7.3 合并风险量化(read-only `git merge-tree` 模拟,未落任何提交)

| 模拟合并 | 冲突文件 | 冲突块 |
|---|---|---|
| `master` ← `w7`(或任一支) | **0** | **0**(`master` 是严格祖先,快进) |
| `master` ← `w9` | **0** | **0**(同上,实测 `--is-ancestor` 成立) |
| `w7` ← `w8-split` | 3(`docs/skills-wave/README.md`、`js/wf-core.js`、`tests/unit.js`) | 1 / 1 / 2 |
| `w7` ← `w8-script-check` | 6(`README.md`、`cli.js`、`docs/skills-wave/README.md`、`js/commands.js`、`js/issues.js`、`tests/unit.js`) | 2 / 2 / 1 / 1 / 2 |
| `w8-split` ← `w8-script-check` | 5(同上去掉 `docs/skills-wave/README.md`) | 2 / 2 / 1 / 1 / 2 |
| **`w9-integration` ← `w9-eps-structure-check`**(唯一待做的合流) | **5**(`README.md`、`cli.js`、`js/commands.js`、**`js/skills.js`**、`tests/unit.js`) | 2 / 2 / 2 / **1** / 1 |

两点结论:

1. **主干方向零风险**:`master` 是全部分支的严格祖先,`w9` 并入主干是纯快进,不存在冲突面。
   风险不在合并动作上,而在「主干长期停滞、分支持续加深」本身——`w9` 已领先 102 个提交。
2. **兄弟分支间的冲突面很薄且已被 `w9` 实际解掉**:`w9` 的三个合并提交消息记录的冲突文件
   (`cli.js` / `js/commands.js` / `js/issues.js` / `tests/unit.js`)与上表 `w7 ← w8-script-check`
   的模拟结果吻合,且合并后 `unit 288/288` 全绿——说明冲突解得正确,**没有靠删测换绿**
   (259 + 280 的独有增量在 288 里都在:280 + 8 = 288,`w8-script-check` 的 8 条新断言一条不少)。
   值得单独记一笔:`js/skills.js` 在 `w7` 与 `w8-script-check` 之间**自动合并零冲突**——
   W7 加的 `film.subtitleTiming` 与 W8 加的三条 `script.*` 落在文件不同位置,`CHECKS` 的追加式结构
   在并行开发下表现良好。**但这条规律在最后一次合流上出现首个例外**:
   `w9-integration ← w9-eps-structure-check` 的 `js/skills.js` 有 1 处冲突,
   两侧的 `CHECKS` 新增项落进了同一区域。合流时需注意别在解冲突时丢掉任一侧的校验项
   ——判据是合流后 `Object.keys(Skills.CHECKS).length` 必须为 **8**。

## 8. 阻塞汇总与下一目标

### 8.1 阻塞(按严重度)

| # | 阻塞 | 严重度 | 依据 |
|---|---|---|---|
| 1 | **主干停滞两个周期**:`master` 上 `js/skills.js` 与 `docs/skills-wave/` 均不存在,29 条分支无一进主干 | 高 | 第 7.1 节实测 |
| 2 | **`w9` 漏合 3 个提交**:两份记账文档(W7 收敛记录、W8 剧本校验记账)+ 一行注释修正丢失 | 中高 | 第 4.5 节,`git log w9..w7` / `git log w9..w8-script-check` 实测非空 |
| 3 | **周期 2 成果分裂在两条互不包含的线上**:`w9-integration`(含 W7)与 `w9-eps-structure-check`(含分集校验)必须合流才是全量,合流有 5 文件 8 处冲突 | 中高 | 第 4.6、7.3 节 |
| ~~4~~ | ~~**`w9` 的 README 断言数失真**:写 280,实测 288~~ → **复核期间已修**(`641a1f5`,实测已改为 288) | 已消除 | 第 0.1 节 |
| ~~5~~ | ~~**`w9` 无收敛记录件**~~ → **复核期间已补**(`w9-integration-log.md` + `w9-eps-structure-check.md` 各一份) | 已消除 | 第 0.1 节 |
| 6 | **SK-03 / SK-04 的 pending 与实况矛盾且无说明**(SK-23 已如实标注,三条口径不一致) | 中 | 第 5.3 节 |
| 7 | **G-10 成为校验面总瓶颈**:被 9 条 SK 引用;已落地的 8 条校验项**全部只挂在就绪检查与问题中心**,`js/release.js` 与 `js/review.js` 对 `Skills` 的引用数实测为 0 | 中 | 第 6 节 |
| 8 | **S-08 连续两波未决**:编号已登记但能力未进 30 条,`gaps()` 投影里没有它 | 低 | 第 6 节,`gaps()` 键数实测 22 |
| 9 | **`master` 的 2 项 cli.smoke 失败**:「未登录 whoami → exit 3」实得 exit=1、「llm --json mock 链路」 | 低 | 第 2 节,本槽在 `master` 上独立复现 |
| 10 | **`w8-split-episodes-inject.md` 误用已退役编号 `G-16`** | 低 | 第 6 节 |

**一条方法性观察**(不是某支的缺陷,是流程面的):阻塞 2 与阻塞 3 同源——
并行槽持续在**集成线的中间点或旧基线**上开分支(`w8-split` 基于 W7 中间点、`w8-script` 基于 W6 head、
`w9-eps` 基于 `w8-script` head),集成方又按父提交而非 head 合并。两者叠加的结果是
「代码进了集成线、记账件留在原分支」。这个形态在本双周期已出现 3 次,值得在下一波开工前定一条口径:
**合并一律取分支 head**,并在收敛记录里核对被合分支的 `docs/skills-wave/*.md` 是否随代码一起到位。

### 8.2 下一目标(建议次序;本槽不执行)

1. **把周期 2 收成一条线**,两步(README 与收敛记录已在复核期间补好,不再重复列):
   ① 补合 `072f342`、`97f6ba2`、`bbd7ebb`(纯文档 + 单行注释,与 `w9-integration` 现状无代码冲突面),
   补完后应能看到 `docs/skills-wave/w7-integration-log.md` 与 `w8-script-check.md` 两份文件出现;
   ② 合入 `w9-eps-structure-check`(5 文件 8 处冲突,注意 `js/skills.js` 那处别丢校验项,
   判据 `Object.keys(Skills.CHECKS).length === 8`)。
   完成后重算 README 三个数字(以实跑为准,勿照抄本报告)。至此 `w9-integration` 成为双周期全量的唯一收敛点。
2. **决定主干策略**。这是第 1 阻塞,且已是连续两个周期的同一条结论,不宜再往后推。
   技术面无障碍(纯快进、零冲突);要定的是分批口径——若分批,`w6 head`(周期 1 全量)与
   `w7 head`(周期 2 前段)是拓扑上的天然切点。
3. **收口三条记账滞后**:给 SK-03 / SK-04 补上与 SK-23 同规格的 `note`,或在同一轮里把
   G-01/G-02/G-03 三条的 `pending` 与 `gaps` 投影一并改真(会动 `Skills.gaps()` 产出,需配断言)。
   建议与 `w7` 记录第 6 节第 1 项(SK-16 编排补前段两步)合并为一轮「注册表记账收敛」。
4. **定性 G-10**——第 1 步做完后,这是校验面唯一的下一个瓶颈,也是收益最大的一条:
   把已落地的 8 条校验结论接进审片报告的独立字段与发布门的可选门。
   一次性松开 5~6 条 SK 的 pending,但需先定「方法论门要不要改既有 fail/warn 口径」的产品口径。
   现状实测:`js/release.js` 与 `js/review.js` 对 `Skills` 零引用,这一步是从零开始接线。
5. **按 `Skills.gaps()` 投影挑剩余校验项**:S-02(SK-10 文案 AI 味,需先补 KB 条目正文)、
   S-04(SK-20 镜头动态感)、S-05(SK-22 生成凭据)、S-07(SK-29 交付契约)四条各自独立,
   宿主形态已被剧本半与分集半连续验证两次,可并行开槽——但按第 8.1 节的方法性观察,**基线一律取集成线 head**。
6. **对 S-08 给出明确结论**:做则进 30 条(短名单变 31 条,需同步波次配比断言),不做则在短名单第 7 节标记「明确拒绝」。
   连续两波挂着不决,本身就是记账噪音。

## 9. 本报告的复核方式

全部数字可按下述步骤独立重跑(本槽即如此取得;`/tmp` 下的探针脚本不入仓库):

```
# 1. 各支独立工作树,互不干扰
for b in w6-integration-9f68 w7-integration-fa8a w8-split-episodes-inject-ba63 \
         w8-script-check-8664 w9-integration-f8f9 w9-eps-structure-check-c8c2; do
  git worktree add --detach /tmp/wt/$b origin/cursor/$b
done

# 2. 逐支复跑(master 基线同法)
cd /tmp/wt/w9-integration-f8f9
node tests/unit.js          # 288/288
node tests/integration.js   # 93/93
node tests/cli.smoke.js     # 62/64(2 项与 master 同样失败)

# 3. 注册表状态直接读数据,不读文档
node -e "const S=require('./js/skills.js');
  console.log('SK', S.REG.length, '| CHECKS', Object.keys(S.CHECKS).length);
  console.log(S.REG.filter(x=>x.pending.length).map(x=>x.sk+':'+x.pending).join(' '));"

# 4. 未合入测量与合并风险(read-only,不落提交)
git merge-base --is-ancestor master origin/cursor/w9-integration-f8f9 && echo "master 是严格祖先"
git log --oneline origin/cursor/w9-integration-f8f9..origin/cursor/w7-integration-fa8a
git log --oneline origin/cursor/w9-integration-f8f9..origin/cursor/w8-script-check-8664
git merge-tree --write-tree --name-only origin/cursor/w9-integration-f8f9 \
                                       origin/cursor/w9-eps-structure-check-c8c2

# 5. W2 基线复核(pending 口径的比较基准)
node -e "const S=require('/tmp/wt/w2base/js/skills.js');
  let f=0; S.REG.forEach(r=>f+=(r.pending||[]).length);
  console.log('带 pending', S.REG.filter(r=>r.pending.length).length, '| 面', f,
              '| CHECKS', Object.keys(S.CHECKS).length);"   # 22 | 23 | 0
```

> 提醒:第 0 节已注明两条 W9 分支在核验期间才出现。若复核时点晚于本报告,
> 请先比对 head SHA 再采信数字——尤其 `w9-integration-f8f9`,它当时正在活动。

`node tests/e2e.js` 按仓库纪律**未跑**(需用户明确要求)。
本轮未开 PR、未合并任何分支、未改动任何业务代码;本分支的唯一改动是本文件。
