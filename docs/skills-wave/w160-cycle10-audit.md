# W160 · 周期 10 独立核验

本件是周期 10(`w130-cycle9-audit` 落地之后到 `w151-integration-2bc5` 为止)的独立核验报告。
核验槽只交报告与本目录索引行,不改产品代码、不动发布门判据、不删测试。

周期 9 的正文不在此复述。上一份核验件已经量清楚的边界(五层判据各判什么、`cli.smoke` 并行不安全、
`master` 侧零提交)本件只在**结论变化时**点名,不再重述过程;周期 9 第 7 节那十一条阻塞逐条给现状,
收掉的一句带过,余量的按新实况重量一遍。

---

## 0. 核验时点与锚定 SHA

| 项 | 值 |
|---|---|
| 核验基线 | `origin/cursor/w151-integration-2bc5` @ `31d7aeb` |
| 上一周期基线 | `2f6880c`(`w129-integration`,周期 9 核验件的锚点) |
| `origin/master` | `9adcf0f`(无 `js/skills.js`、无 `docs/skills-wave/`,与周期 9 同一颗) |
| 本槽分支 | `cursor/w160-cycle10-audit-b3ee`,叉在 `31d7aeb` 上 |
| 核验方式 | 全部数字在工作树上现跑;逐支复跑改用 `git worktree --detach` 挂**合并提交的第二父 SHA**,不采信被核分支自述 |
| 周期 10 的合入 | 十五次 `--no-ff`:W131 W132 W130 W135 W136 W137 W138 W140 W141 W144 W145 W147 W143 W149 W150 |
| 周期 10 的集成槽 | 七支直接落在集成线上的记账槽:W133 W134 W139 W142 W146 W148 W151 |

**取证方式本周期被动改了一次。** 周期 9 那份核验按分支名逐支开 worktree;本周期十五支功能分支的**远端引用已被删干净**,
`git branch -r` 只剩 `origin/master`、`origin/cursor/w151-integration-2bc5` 与 `origin/cursor/agent-flow-sota-analysis-736a` 三条。
分支引用没了,提交还在——本槽改挂第二父 SHA 复跑,数字一样取得到(见 2.1);
但周期 9 那条"遍历远端全部 `w1NN-*` 分支逐条判是否已合入"的判据在本周期是**空判**:
可遍历的三条全是 `31d7aeb` 的祖先,而真正该被这条判据看住的十五支已经不在远端了。这一条记在 7 节。

`cli.smoke` 与 `integration` 仍绑固定端口与固定临时目录,必须串行——本槽全程只在一条队列里跑这两个套件。

---

## 1. 一句话结论

周期 10 是**把上一份核验件的清单逐条兑现的一轮**:周期 9 列的十一条阻塞,
**高危两条、中危五条里的四条、低危两条**在本周期内被专门开槽收掉(A2→W141、B1/B2→W138、C1/C2→W135、D1→W136+W150、E1→W143),
A1 由 W132 从"无界"钉成"差额 ≤ 3";合入纪律面十五次合并**三项禁令零违规**。
主线七步在十三态走查下逐态自洽,前置三步的断点码在 `Domain.gateBlockers` / 流程条 / 问题中心三处**逐态码集相等**。

本槽量出的余量集中在同一件事上:**这一轮补的判据全部落在"形状"上,没有一条落在"数值来源"上**。

1. **静态点数与实跑数至今没有任何一处比对过。** W141 封住的是"`report(` 坐在会跳过的**块**里"这一形状;
   把跳过做成 `main` 里的一条 early `return`,静态点数 141 一个不少、七层判据全绿、退出码 0,
   而实跑只有 **130** 条(见 5.2)。周期 9 §8-1 提的那条"起子进程读回实跑总数"至今没人做,
   `report` 控制流的扩面(W159)与发布门扇出都还**在飞**。
2. **`Domain.REVIEW_MIN` 的"单源"是两处各被冻在 7,不是一处派生自另一处。** 把达标线整体挪到 8
   (连同两条钉住 7 的断言同轮改),`js/produce.js:272` 那份字面 7 留在原地,**520/520 全绿**——
   浏览器闭环会把 7 分镜判成"达标"并替用户 `s.confirm = true`,而同一集 `episodeState` 判 `needs_human`、发布门 G3 判 fail(见 5.3)。
3. **前置断点投影表的"表外码"守卫是按夹具射程立的,不是按机制立的。** `js/issues.js:165` 的注释写着
   "Domain 那边新增一档而本表没跟上,由 `tests/unit.js` 的包含关系断言点名报出";实测:
   新档的触发条件只要落在那五个手写夹具射程之外,**520/520 全绿**,码在流程条上照常出面而问题中心静默丢掉(见 5.4)。

三条是同一个形态的三次出现:**判据钉住了今天这一份产出物长什么样,没钉住"这个数/这个值是从哪儿来的"**。

---

## 2. 独立复跑对账(全部数字为本槽实测)

### 2.1 基线 tip 与十五支逐支现跑

基线 `31d7aeb` 四套件现跑:

| 套件 | 实测 | 静态点数 | `FLOOR` | 余量 |
|---|---|---|---|---|
| `node tests/unit.js` | **520/520** | — | 520 | 0 |
| `node tests/unit.js contract` | **113/113** | — | (随单元) | — |
| `node tests/integration.js` | **141/141** | 141 | 141 | 0 |
| `node tests/cli.smoke.js` | **105/107** | 107 | 107 | 0 |
| `docs/skills-wave/` 记账件 | **166 份** | — | 166 | 0 |

`cli.smoke` 那 2 项失败逐字与 `master` 同名(未登录 `whoami` → `exit 3 | exit=1`;`llm --json` mock 链路 → `undefined`),
`master` 上同样是 2 项。这是第十次独立复现。四条棘轮余量**当前全是 0**——与周期 9 收尾时同一形态,
因为 W151 刚把四个字面全部抬到 live。

十五支被合入分支逐支现跑(挂第二父 SHA;`integration`/`cli.smoke` 用静态点数列出,两套件全周期只有 W143 一支在改):

| 第二父 | 槽 | unit | contract | int 静态 | smoke 静态 | 记账件 |
|---|---|---|---|---|---|---|
| `2f6880c` | w129(周期 9 基线) | 486/486 | 104/104 | 130 | 102 | 144 |
| `1c660f1` | W131 | 491/491 | 106/106 | 130 | 102 | 145 |
| `9bacc88` | W132 | 487/487 | 105/105 | 130 | 102 | 145 |
| `89ee9b7` | **W130(上一份核验件)** | **486/486** | **104/104** | 130 | 102 | 145 |
| `f9ac1bb` | W135 | 494/494 | 107/107 | 130 | 102 | 148 |
| `61380b5` | W136 | 493/493 | 108/108 | 130 | 102 | 148 |
| `3a4e458` | W137 | 494/494 | 107/107 | 130 | 102 | 148 |
| `16eb33d` | W138 | 496/496 | 108/108 | 130 | 102 | 148 |
| `9635416` | W140 | 493/493 | 108/108 | 130 | 102 | 150 |
| `c07dcab` | W141 | 493/493 | 108/108 | 130 | 102 | 150 |
| `9030fcb` | W144 | 496/496 | 109/109 | 130 | 102 | 153 |
| `c0ecdfb` | W145 | 497/497 | 108/108 | 130 | 102 | 153 |
| `dca7227` | W147 | 504/504 | 110/110 | 130 | 102 | 156 |
| `eb4e211` | **W143** | 498/498 | 108/108 | **141** | **107** | 153 |
| `cef3ebb` | W149 | 508/508 | 112/112 | 130 | 102 | 160 |
| `ed51a4a` | W150 | 508/508 | 112/112 | 130 | 102 | 160 |
| **`31d7aeb`(基线)** | — | **520/520** | **113/113** | **141** | **107** | **166** |

三件事从这张表上读得出来:

**(a) 周期 9 的 F2 被 W130 自己收掉了。** 上一份核验件当时点名的教训是"核验槽交上去的分支必然是红的"
(W113 那次 468/471,三条全在索引完备性上)。W130 把索引行、明写份数与记账件 `FLOOR` 写进了同一个提交,
本槽复跑 `89ee9b7` 实测 **486/486 与 104/104 全绿**。这条流程假设已经改掉了,本槽照同一手办。

**(b) W149 与 W150 自报的数逐字相同(508 / 112 / 160),而两支都是真的。** 两支叉点相同、各加 4 条用例各加 1 份记账件,
互不相知地算出同一组数。W151 的记账件已经把这个"两侧同值"的静默窗口如实记了,本槽只作复现确认:
它们没能静默,靠的是我方那一格已被前一次合并抬走,不是靠任何判据。

**(c) `integration`/`cli.smoke` 两个套件全周期只有 W143 一支在改**(130→141、102→107),
故它自报的两个数**恰好就是合并后的 live**。这是结构事实(独一份改动没有第二方来源)而不是运气,
与 W151 记账里那句一致。其余十四支这两个数一格没动。

### 2.2 治理面注册表直读(不读文档,直接 `require`)

| 口径 | 取数 | live | 与周期 9 比 |
|---|---|---|---|
| 短名单条数 | `Skills.list().length` | 30 | 不变 |
| `pending` | 逐条 `pending` | 0 条 / 0 面 | 不变 |
| 校验项 | `Object.keys(Skills.CHECKS).length` | 17 | 不变 |
| 就绪检查面表 | `Skills.preflightStages()` | 7(`script,subjects,eps,shots,gen,review,film`) | 不变 |
| 缺口索引 | `Object.keys(Skills.gaps()).length` | 20 | 不变 |
| 知识库条目 | `Object.keys(Knowledge.SECTIONS).length` | 18 | 不变 |
| 注册表提示词 | `Prompts.list().length` | 41 | 不变 |
| 编排投影 | `Skills.playbooks().length` | 5 | 不变 |
| 领域命令 | `CmdRegistry.names().length` | **13** | 12 → 13 |
| 专家 | `ExpertsData.EXPERTS.length` | 16 | 不变 |

整整一个周期里,十个注册表口径只动了一个:领域命令 12 → 13,多出来的那一条是 `expert.evolve`。
**这一轮的产出物几乎全部是判据本身**(见 6.1),不是新的注册面。

`expert.evolve` 的落点本槽逐处核过:在 `CmdRegistry.names()` 里、**不在任何 playbook 的 `steps` 里**
(实测五个 playbook 摊出的 `cmd` 共 11 个,不含它)。掺进去当场红,报"编排步序里出现进化=自动蒸馏被写成口径"。

---

## 3. 主线贯通:十三态 live 走查

不读文档,直接构造项目按剧本 → 主体 → 分集 → 分镜 → 生成 → 审片 → 成片逐步推进,
每步同时取 `Domain.workflow`、`Domain.episodeState`、`Domain.gateBlockers` 与 `Issues.collect` 四处读数。

### 3.1 走查表

| # | 项目状态 | 主线卡在 | 推荐动作 | 分集 status | 分集 blockers | gateBlockers | 问题中心 kind |
|---|---|---|---|---|---|---|---|
| 0 | 空项目 | `script` | `script` | — | — | `no-script`+`no-subjects`+`no-eps` | `no-script`,`no-subjects`,`no-eps` |
| 1 | 有剧本 | `subjects` | `subjects` | — | — | `no-subjects`+`no-eps` | `no-subjects`,`no-eps` |
| 2 | 主体无图 | `subjects` | `subjects` | — | — | `subjects-no-image`+`no-eps` | `subjects-no-image`,`no-eps` |
| 3 | 主体有图 | `eps` | `eps` | — | — | `no-eps` | `no-eps` |
| 4 | 建集、正文空 | `shots` | `shots` | `blocked` | `no-script`+`no-shots` | — | `no-script` |
| 5 | 有正文 | `shots` | `shots` | `ready` | `no-shots` | — | `no-shots`,`script-craft` |
| 6 | 有分镜 | `gen` | `gen` | `ready` | — | — | `no-review`,`script-craft`,`shot-stable-lexicon` |
| 7 | 一镜失败 | `gen` | `gen` | `blocked` | `failed-shots` | — | `failed-shots`(高危排前) 等 4 条 |
| 8 | 全部出片未确认 | `review` | `review` | `needs_review` | `unconfirmed` | — | `no-review`,`unconfirmed`,… |
| 9 | 全部确认 | `review` | `review` | `ready` | — | — | `no-review`,… |
| 10 | 审片低分 | `review` | `review` | `needs_human` | — | — | `low-review`,… |
| 11 | 审片达标 | `film` | `compose` | `ready` | — | — | `script-craft`,`shot-stable-lexicon` |
| 12 | 已合成但输入指纹不匹配 | `film` | `compose` | `stale` | `composed-stale` | — | `composed-stale`,… |

**周期 9 的 B1/B2 在这张表上已经看不见了。** 第 0/1/2/3 态最右一列从"(空)"变成了逐条对齐的断点码;
`Domain` 写 `subjects-no-image`、`Issues` 写 `subject-no-image` 那个单复数分裂也没了——
两侧现在同读 `Domain.gateBlockers` 一份(W138 落地,W147 把计划层那第三份内联拷贝也收了进去)。

支线四步(`prod`/`director`/`shell`/`clips`)一律 `side: true`,十三态里一次都没夺走主线焦点;
四态优先级在第 4/7/8/10/12 态各命中一次,与周期 9 的走查逐态一致,不再展开。

### 3.2 断点码三张表:差集只剩入参保护那一条

```
Domain 断点码(13):composed-stale, failed-shots, low-review, no-episode, no-eps, no-review,
                   no-script, no-shots, no-subjects, review-stale, shots-stale, stale-shots,
                   subjects-no-image
Issues kind 字面(17):caption-unreadable, composed-stale, eps-payoff, eps-structure, failed-shots,
                   low-review, no-review, no-script, no-shots, review-stale, script-craft,
                   shot-size-linkage, shot-stable-lexicon, shots-stale, stale-shots,
                   subject-inconsistent, unconfirmed
Issues.gates() 投影表(4):no-script, no-subjects, subjects-no-image, no-eps
只在 Domain(既不在 kind 字面也不在投影表):no-episode
```

`no-episode` 是 `episodeState` 的入参保护分支(`ep` 为空),不是主线断点,不需要投影——
这与周期 9 的判断一致,而当时另外三条真断点如今都有投影了。

**前置三步四态双向对齐实测**(`gateBlockers` 码集 == 流程条三步 blockers 码集 == 问题中心里属投影表的那几条):

| 项目状态 | `gateBlockers` | 流程条三步 | 问题中心 | 三方码集相等 |
|---|---|---|---|---|
| 空项目 | `no-script` `no-subjects` `no-eps` | 同 | 同 | ✅ |
| 只有剧本 | `no-subjects` `no-eps` | 同 | 同 | ✅ |
| 主体无图 | `subjects-no-image`(count=2) | 同 | 同 | ✅ |
| 主体有图 | `no-eps` | 同 | 同 | ✅ |

`js/plans.js` 是第四个消费方,但它是浏览器单端模块(不是 UMD,直接写 `window.Plans`),
Node 里 `require` 当场 `ReferenceError: window is not defined`,故本槽只在源级核实它现取 `Domain.gateBlockers(p)`
并按阻塞码取材(`js/plans.js:39`),行为面由 `plans` 套件的沙箱用例覆盖。

### 3.3 问题中心的可处置率:12 种出面的 kind 里只有 3 种带命令

把走查九个夹具摊出来的 kind 逐条取回执形状:

| kind | 危险级 | `cmd` | `shotIds` |
|---|---|---|---|
| `failed-shots` | high | `episode.generateVideos` | **有** |
| `no-shots` | mid | `episode.generateStoryboard` | — |
| `composed-stale` | mid | `episode.compose` | — |
| `low-review` | mid | **—** | **—** |
| `no-review` / `review-stale` / `unconfirmed` | mid/low | — | — |
| `no-script` / `no-subjects` / `subjects-no-image` / `no-eps` | low/mid | — | — |
| `script-craft` / `shot-stable-lexicon` | low | — | — |

`no-review` / `review-stale` 不挂命令是有意的(审片是计费动作,问题中心不代按,`js/issues.js:204` 明写)。
`low-review` 那一条是周期 9 的 D2,现状见 4.2。

### 3.4 `workflow` 的审片步与 `Issues` 的门槛仍不同(周期 9 §3.3,现状未变)

第 4/5 态里 `workflow` 的 `review` 步照旧挂着 `no-review`(该集还没正文 / 还没拆镜),
`Issues.collect` 在同一状态早退,一条都不报;第 6 态起两侧才对齐。实测:

```
4 正文空        | workflow.review blockers=no-review | Issues 有 no-review? 否
5 有正文未拆镜   | workflow.review blockers=no-review | Issues 有 no-review? 否
6 有分镜未出片   | workflow.review blockers=no-review | Issues 有 no-review? 是
```

后果与周期 9 判断相同(`recommendedAction` 取首个未完成主线步,第 4/5 态正确落在 `shots`,只是展示噪音),
本槽不重复论证,只确认这一条**没有随 W138 一并收口**——W138 收的是项目级前置三步,分集级的审片门槛不在它的辖区。

### 3.5 发布门:周期 9 的 C1/C2 已收,`catch` 那半按新口径分了两档

`js/release-core.js` headless 七门现跑:

| 情形 | `overall` | `fails` | `warns` | G1 `info` |
|---|---|---|---|---|
| 注入 `Domain`(未合成) | `fail` | 1 | 1 | `第1集(ready:合成成片)` |
| **漏注 `Domain`** | `fail` | **4** | 1 | `缺 Domain 注入:主线状态判不出来` |
| `Domain` 抛错 | `warn` | 0 | 5 | `Domain 异常:boom` |

周期 9 的 C1(`b.label` 恒印 `undefined`)与 C2(漏注入 fail-open 降 warn)**两条都收掉了**:
G1 的 `info` 现在逐集点名推荐动作,漏注入按 fail 记且 G4/G5/G6 那次聚合遍历同样按 fail 记(故 `fails` 是 4 不是 1)。

`Domain` **抛错**那一路仍降 warn,这是 W137/W145 明写的分档(缺注入=调用方漏传→fail;自身抛错=运行时异常→warn)。
本槽复核它不是门禁绕过:`overallOf` 里 G10 恒占一个 warn,任何额外 warn 都让 `warns >= 2` 从而 `overall = 'warn'`,
`PASS_OVERALL` 只收 `pass`/`cond-pass`,实测 `passed()` 回 `false`。`fail` 不可能被降成 `cond-pass`。
**结论方向是 fail-close 的,只是回执上 `fails` 从 1 掉到 0。**

---

## 4. 缺口面 live 核实

### 4.1 G-11 — 人手四端齐备,自动蒸馏零出口

`evolve` 在四端逐处实测在场:

- 浏览器 `js/experts.js` `evolveExpert`(周期 9 时唯一的出口)
- 领域命令 `js/cmd-registry.js:84` `expert.evolve` + `js/commands.js:305` 引擎
- CLI `cli.js:1361` `EXEC['expert.evolve']` → `POST /api/wf/evolve-expert`
- 服务端 `server.js:3752` 端点、MCP `mcp.js:66` `hujing_expert_evolve`

蒸馏四步(`evolveTarget`/`evolveSystem`/`evolveClauses`/`evolveApply`)已下沉 `js/wf-core.js` 双端单源,
两端不各抄一份。周期 9 的 E1("headless 侧连手动出口都没有")**已收**。

**仍欠的那一面一个字没动**:SK-26 的 note 现写着
"蒸馏仍是人手动作——回流条目要人点「🧠 进化」或显式发一条 `expert.evolve` 才进 persona,自动进化仍无出口;
**补 headless 出口只是把人手那条路从一端变四端**,人设句可覆盖同样不改这一面——改得到提炼口径,改不出自动触发"。
这句自评与源码实况一致:`expert.evolve` 在 `cmds` 里、不在任何 playbook 的 `steps` 里,
`server.js:3750` 明写"本端点只应由用户/助手显式调用",MCP 工具描述里也写着"不要挂在任何流程收尾上自动跑"。
判据侧有两条断言按字面钉着(`expert.evolve` 不许进 `steps`、playbook 投影里同样不许出现),
故这条余量不会被静默摘掉,也不会被"四端齐备"冒充成已闭合。

### 4.2 G-03 — 两个数值口径都收了,循环形态那一面仍欠;另有一处达标线没跟着收

**已落地的两面本槽逐处复核成立:**

- 重抽面:`Domain.reviseTargets(ep)` 实测对三镜低分夹具回
  `[{shotId:'s1',order:1,score:4,…},{shotId:'s3',order:3,score:3,…}]`,四道口径(达标线取 `REVIEW_MIN`、
  报告判旧回空、与分镜表取交集、定稿镜不重抽)都在那一份里;`WfCore.reviseSubset` 在其上补逐镜修正意见;
  CLI `produce` 闭环每轮现取(`cli.js:1214`)。
- 收敛次数:`Domain.reviseRetryLimit` 双端单源,`REVISE_RETRY_MIN/MAX/DEFAULT = 1/5/2`,
  四个消费点(`cli.js:1200`、`js/produce.js:252`、`js/commands.js:346`、`js/storyboard.js:616`)一律现取;
  那道 `Math.min(D.REVISE_RETRY_MAX,` 钳位在全仓只此一处。

**仍欠那一面(形态)本槽在源码上量清楚:**

| | 浏览器 `autoSmartReview`(`js/produce.js:251`) | CLI `episode.produce`(`cli.js:1180`) |
|---|---|---|
| 外层循环 | `for (const s of targets)` — **逐镜** | `for (let attempt = 1; attempt <= maxRetry && low.length; …)` — **整集分轮** |
| 内层循环 | `for (let attempt = 0; attempt <= maxRetry && !pass; …)` | 每轮重抽 `fix.revised` 子集 |
| 重抽面来源 | 就地逐镜判,**一处都不引** `Domain.reviseTargets` | 每轮 `await reviseTargets(args, f)` 现取实况 |
| 审片单位 | `Review.reviewShot(p, ep, s)` 逐镜 | `episode.smartReview` 整集 → 子集复审 |
| 同一个 `maxRetry` 数的含义 | 每镜各自最多重抽 N 次 | 整集最多重来 N 轮 |

同一份次数口径在两端数的**不是同一件事**——这正是 SK-25「仍欠(G-03)」段那句话,记账与源码逐字对得上。
W136 立的双向护栏被 W150 翻面重写而不是删掉,本槽把它的两向各变异了一次:
抹掉「仍欠(G-03)」整段 → **519/520,红一条**(`SK-25 的 note 须仍有「仍欠(G-03)」段`);
把 `G-03` 全改名 `G-99` → **516/520,红四条**。周期 9 的 D1("SK-25 的仍欠段零断言")**已收**。

**本槽新量出的一处:达标线在浏览器闭环是第二份字面,没跟着收。** 见 5.3。

**周期 9 的 D2 仍开,而且更浅了一层。** `low-review` 那条问题实测:

```
failed-shots  | shotIds= ["s1"] | cmd= episode.generateVideos | detail= 镜头1:上游超时…
low-review    | shotIds= undefined | cmd= undefined | detail= 低分镜:1镜4分、3镜3分
```

`js/issues.js:211` 已经调了 `Domain.reviseTargets(ep)`,但只拿它拼给人看的 `detail`;
同一份派生的 `Domain.reviseShotIds(ep)` 现成回 `["s1","s3"]`。周期 9 说这一环"不需要新的判定逻辑",
现在连派生函数都摆在同一行上了——**差的只是把它放进 `shotIds` 字段**。
(仍要重申周期 9 那句边界:`shotIds` 是**供人挑选的清单**,不等于让编排层替人决定重抽哪几镜;
`Skills.playbook` 那一步的 `args` 按 SK-05 现行口径仍应留空。)

### 4.3 G-13 — 标记不摘;那两处兜底实测仍不可达

`js/api.js:176` 与 `:199` 剩的两句 `(opt.system || '你是专业助手。')` 一字未动。
本槽重数了一遍调用点:`js/` 下(排除 `api.js` 自身)`API.chatJSON` / `API.chatJSONRobust` /
`Understanding.chatJSONRobust` 共 **41 处**,与周期 9 逐个吻合(周期 10 改过 15 个 `js/` 文件而这个数没动)。
`cli.js`/`server.js` 一次都不调这两个函数。结论与周期 9 相同:**这句兜底在本仓库里没有可达路径**。

`gaps()['G-13']` 那六个键本槽一个也没摘。

### 4.4 缺口键集本身:20 键零变动,而键集现在有了直接判据

周期 9 时 `gaps()` 的键集只有几处"键数 20"的顺带断言,摘一个键换一个新编号照样全绿。
W140 把它补成硬断言(逐字点名 + 与两份缺口图谱双向对账 + 三条"落地不摘键"的实况反查)。
本槽变异复核:把 `G-03` 全改名 `G-99` → **516/520**,其中一条正是
`gaps() 键集应逐字对齐:摘键、改名、新登记编号都须先在本条交账(键数对得上不等于键集没变)`。判据成立。

---

## 5. 测试合同:五层长到八层,与本轮量出的三个口

### 5.1 现状:哪一层判什么

| 层 | 判据 | 立于 |
|---|---|---|
| L1 精确对账 | README 数字 **等于** live(`assertDocNum`,四条) | 既有 |
| L2 契约段自数 | 段里自报的条数 = `SUITES.contract.length` | W126 |
| L3 登记形态 | 每条 `report(` 独立成行、调用数 = 行数、名字就地字面、名集大小 = 行数 | W120/W114 |
| L4 反向"静态 < 实跑" | 块链禁循环 / 禁 `main` 外函数体 + 须裸表达式 / 禁 `for await` | W120/W124 |
| **L5 反向"静态 > 实跑"** | **块链白名单:只许 `main` 函数体与裸 `{ }` 分节块** | **W141(本周期)** |
| L6 下限棘轮 | `live >= FLOOR`,四个字面(520 / 141 / 107 / 166) | W105/W121 |
| **L7 棘轮差额上限** | **`live − FLOOR <= SLACK`,`SLACK = 3`,四个字面现取自源码** | **W132(本周期)** |
| L8 索引完备性 | 双向对齐 / 逐份点名 / 份数三方对齐 + `FLOOR` / **行序按波次号递增** | 既有三条 + **W144(本周期)** |

周期 9 那份核验列的是五层,本周期新增三层(L5、L7、L8 的行序那条),
而三层里有两层(L5、L7)就是周期 9 第 7 节 A2 与 A1 的直接兑现。

### 5.2 口一:静态点数与实跑数至今没有任何一处比对过(A2 只收了一半)

**先跑正控,确认 W141 那一层真的成立。** 把 `tests/integration.js` 末段那个裸 `{` 分节块
改成 `if (process.env.W160_NEVER) {`(块里 11 条 `report`,一个字不动):

```
FAIL | contract · 集成/冒烟 report(...) 不许落在会跳过的条件块里(块链只许 main 函数体与裸 { } 分节块)
     | …实际 "tests/integration.js:704 外层「if (process.env.W160_NEVER) {」 / …:708 / …:712 /
       …:715 / …:720 / …:726 / …:732 / …:736 / …:743 / …:754 / …:760"
===== 112/113 PASS, 1 FAIL =====
```

十一条登记点逐个被点名。**周期 9 的 A2 在"块包裹"这一形状上确实收掉了。**

**再跑同一方向的另一种写法:`main` 里一条 early `return`。** 在同一个分节块之前插一行
`if (!process.env.W160_ON) return;`,别的什么都不改:

```
node tests/unit.js contract   →  ===== 113/113 PASS, 0 FAIL =====
grep -c '^[ \t]*report(' tests/integration.js  →  141
node tests/integration.js     →  实跑 130 条,退出码 0
README.md                     →  「W143 扩至 141 项断言」
```

**八层全绿。** 逐层看为什么每一层都放行:

- L1 对的是**静态点数**(`^[ \t]*report\(` 数出 141),不是套件自己跑出来的数。
- L3 的行数、调用数、名字面、名集大小四个口径一个不变。
- L4 的三条与 L5 那条看的都是**块链**——early `return` 一层块都不开,块链上仍只有 `main` 函数体与裸 `{ }`。
- L6/L7 看的也是静态点数,`141 >= 141`、差额 0。

这与周期 9 §5.3 量出的是同一件事的第二个形状,也印证了周期 9 §8-1 的判断:
**往块链词表/白名单里做文章追不上写法,真正缺的是"把实跑总数取回来跟静态点数比一次"。** 那一条至今没人做。

这个变异比周期 9 那个块写法**多留了一道人眼可见的痕迹**:early `return` 连 `main` 末尾那句
`console.log('===== N/M PASS …')` 一起跳过了,故输出里一条 `=====` 都没有(实测 `grep -c "====="` 回 0),
退出码仍是 0。把 summary 补印回去也没用——`PASS` 计数器是真的,它会印 130/130 与 README 的 141 当场对不上。
所以这个口的确切形状是:**机器一层都接不住,只靠人跑完之后看一眼末尾那行。**

**在飞件登记。** 任务口径点名的 W159(`report` 控制流扩面)与发布门扇出两件,本槽在
`origin` 上遍历不到 `w152`–`w159` 任何分支,`docs/skills-wave/` 里也没有它们的记账件,
故一律按**「在飞」**登记,本件的合同层不把它们当已合入判据计入。

### 5.3 口二:`Domain.REVIEW_MIN` 的"单源"是两处各被冻在 7

`js/domain.js:496` 写着 `D.REVIEW_MIN = 7`,`js/produce.js:272` 写着 `if (r.score >= 7)`。
后者是浏览器审片闭环判"这一镜达标没有"的那一处,它不读前者。

**变异一:只改常量。** `D.REVIEW_MIN = 8`:

```
FAIL | domain · REVIEW_MIN:达标线单源,episodeState 与主线审片步骤同用一个常量 | 期望 7,实际 8
FAIL | contract · SK-25 记账两向对账(G-03) | 达标线仍在 Domain 单源(与收敛次数并排…)
===== 518/520 PASS, 2 FAIL =====
```

两条红都在,看起来守住了。但两条钉的都是**这个常量的值必须是 7**(一条 `assertEq(D.REVIEW_MIN, 7)`,
一条 `assert(dom.includes('D.REVIEW_MIN = 7;'))`),没有一条钉"`js/produce.js` 的达标线取自它"。

**变异二:像一个真要改达标线的槽那样,把三处一起改。** `D.REVIEW_MIN = 8` + 那两条断言同轮改成 8,
`js/produce.js:272` 那份字面 7 **留在原地**:

```
===== 520/520 PASS, 0 FAIL =====
```

**全绿。** 此刻的行为面:一镜审片得 7 分,浏览器闭环判"✅ 达标(已自动确认)"并写 `s.confirm = true`、
不再重抽;而同一集 `Domain.episodeState` 按 `reviewAvg < 8` 判 `needs_human`、`Domain.reviseTargets`
把它算进低分镜、发布门 G3 判 fail。**两端对同一镜给出相反结论,而八层判据一条都不响。**

变异三反过来跑作对照:只把 `js/produce.js:272` 的 7 改成 4 → **513/520,红 7 条**,
全部在 `produce` 套件的行为面上(夹具得分落在 4–7 之间)。所以浏览器那一侧不是没人管,
管它的是**一批把 7 这个值烤进夹具的行为用例**——这些用例在变异二里一条都不红,因为夹具分数
既不到 7 也不到 8,两个阈值下行为相同。

结论:**这不是"两端不同源"被漏判,是"单源"这个词此刻名不副实**——它守住的是"别动这个常量",
不是"两处同出一源"。W150 的记账里写"落点紧挨修订闭环另两个口径 `REVIEW_MIN` 与 `reviseTargets`",
那句是对的;缺的是让 `js/produce.js` 真的去读它。

### 5.4 口三:前置断点投影表的"表外码"守卫按夹具射程,不按机制

`js/issues.js:165` 的注释写着:

> 表外的码一律不投(Domain 那边新增一档而本表没跟上,由 `tests/unit.js` 的包含关系断言点名报出)

**变异一:新档的触发条件落在既有夹具射程之外。** 给 `Domain.gateBlockers` 加一档 `w160-probe`,
触发条件是 `p.__w160`(五个手写夹具都没有这个字段):

```
node tests/unit.js  →  ===== 520/520 PASS, 0 FAIL =====

而同一个项目对象上实测:
  gateBlockers   : no-eps, w160-probe
  workflow eps 步: no-eps, w160-probe     ← 流程条照常显示
  Issues.collect : no-eps                 ← 问题中心静默丢掉
```

**变异二(对照):新档的触发条件落在夹具射程之内。** 同一档改成跟 `no-eps` 同条件(`!eps.length`):

```
FAIL | issues · collect:空项目/只有剧本/只有主体 → 前置断点… | 标题应原样取 Domain.gateBlockers:
       期望 "未上传剧本,未提取主体,未建分集,探针断点",实际 "未上传剧本,未提取主体,未建分集"
FAIL | issues · collect:前置断点与流程条同一份… | f0:…期望 "…,w160-probe=探针断点",实际 "…"
FAIL | flow · flow-tpl · 缺前置返回明确缺口而不是空成功 | …实际 "no-subsjects,no-eps,w160-probe"
===== 517/520 PASS, 3 FAIL =====
```

对照说明判据本身没坏,坏的是它的取数口:`tests/unit.js:3593` 那个 `seen` 集合是把
**五个手写夹具**逐个喂给 `gateBlockers` 攒出来的,下一行还有
`assertEq([...seen].sort().join(','), 'no-eps,no-script,no-subjects,subjects-no-image')`
把这个集合钉死成今天这四个码。于是包含关系判据能看见的,永远只是**这五个夹具摊得出来的那几档**;
新加一档、而它的触发条件需要一个新的项目形态,`seen` 里根本不会出现它,后面两条包含关系断言逐个空转。

这一条与 5.3 是同一个形态:**判据钉住了今天这一份产出物的内容(四个码 / 值 7),没钉住产出机制。**
它的现实风险比 5.3 低——新增前置断点码是低频动作,而且流程条那一侧照常显示——
但它恰好是周期 9 的 B1(问题中心在主线前三步全盲)那个洞的缩微版,值得在收 B1 的同一层上收掉。

### 5.5 A1 的现状:无界的差额被钉成了 3,而 3 就是可以静默删掉的条数

W132 把"`FLOOR` 落后 live 多少"这件事钉成了 `SLACK = 3`,并且四个 `FLOOR` 字面**现取自 `tests/unit.js` 源码**
(取不到即红,不许把判据留成恒真)。本槽把这一层的边界两头都跑了一遍。

**上界正控:一次加 4 条,不抬 `FLOOR`、不改 README。**

```
FAIL | contract · README 数字对账:单元测试用例数… | 实测 524,文档 520
FAIL | contract · README 数字对账:契约段自报的断言条数… | 实测 117,文档 113
FAIL | contract · 棘轮下限不得静默落后实况… | 单元测试:下限 520 落后实测 524 共 4 格(上限 3 格);…
===== 114/117 PASS, 3 FAIL =====
```

第三条正是 W132 立的那一层,报的是差额而不是相等。判据成立。

**余量实测,两步。**
第一步:加 3 条探针 + README 两个数字同步改到 523 / 116,`FLOOR` 仍是 520 →

```
===== 116/116 PASS, 0 FAIL =====
```

全绿。此刻差额恰好是 3 格,踩在上限上一条不红。

第二步:在这 3 格上**真删三条既有用例**(`flow` 套件头三条,整块 3828 字符删除),README 单元数字改回 520 →

```
===== 520/520 PASS, 0 FAIL =====
```

**全绿。三条真用例就这么没了。** 与周期 9 那次两步实测的区别只在量:当时那个差额**无界**
(攒多少就能删多少),现在它有界,界是 3。

所以 A1 的准确现状是:**从"预先批准删掉任意多条"缩成"预先批准删掉三条"**,不是闭合。
本槽同样不主张把 `>=` 改成 `==`(W105 当年拒绝的理由仍然成立),也不建议再调小 `SLACK`——
调小只是把常规加测槽的免改额度压掉,换不来"该抬没抬"的判据;
真正的收口仍是周期 9 §8-2(b) 那条:让加测的槽在改 README 的同一处顺手校一次 `FLOOR`。

### 5.6 本轮**成立**的那几层(逐条复跑,不展开)

以下在 `31d7aeb` 上原样跑过,判据全部按设计报红,与各槽自述一致:
L1 三个方向、L2 契约段自数、L4 的四条分工、L5(见 5.2 正控)、L7(见 5.5 正控)、
重名判据两侧分开钉、索引完备性三层。

L8 新增的行序那条本槽单独变异过:把 `w10-cycle2-audit.md` 那行整行搬到表尾 →

```
FAIL | contract · docs/skills-wave 索引行序:索引表按波次号递增排列… |
     实际 "w151-integration-log.md 之后排了 w10-cycle2-audit.md"
===== 112/113 PASS, 1 FAIL =====
```

成立。这条判据有意不取"波次号连续"(未合的号本就空着),与 W105 §2.2 的否决口径一致。

---

## 6. 合入纪律复盘

### 6.1 十五次合入:三项禁令零违规

周期 10 的十五次 `--no-ff` 合并(第一父全部在集成线上),逐次机检:

**禁令一 · 整文件取 ours/theirs。** 判据:对 `README.md` / `docs/skills-wave/README.md` / `tests/unit.js`
三个文件,若对侧相对 merge-base 改过而合并结果与第一父逐字节相同,即判"整文件取了 ours"(反向同理判 theirs)。
**十五次 × 三文件 = 45 次检查,零命中。**

**禁令二 · 合入时把文件退回 merge-base 内容。** 遍历每次合并里"第一父相对 merge-base 改过"的全部文件,
逐个比合并结果与 merge-base 的 blob 哈希:**零命中**。

**禁令三 · 分支漏合。** 可遍历的远端分支只剩三条,逐条 `merge-base --is-ancestor` 全部为真,零输出。
但如 0 节所述,**这条判据在本周期是空判**——该被它看住的十五支功能分支的远端引用已被删除。
提交本身在图里(第二父可达,本槽据此复跑了 2.1 那张表),故不存在"合了但丢了"的风险;
风险在于**下一轮再想按分支名核"有没有一支叉出去了却没合回来",已经没有可遍历的对象**。

**产出物构成。** 十五支里有 **八支**(W130 W132 W136 W140 W141 W144 W147 的判据半 + W150 的护栏翻面)
的产出物就是测试契约本身或核验件,只有七支动了产品行为面(W131 W135 W137 W138 W143 W145 W149 与 W150 的实现半)。
与 2.2 那张"十个注册表口径只动了一个"对照着看:**这是治理层自我加固连着的第二轮**。

### 6.2 基线新鲜度:执行率从 2/8 掉到 1/15

| 合并 | 被合入支 | 叉点落后当时集成 HEAD | 形态 |
|---|---|---|---|
| `b69ca26` | W131 `1c660f1` | **0** | `merge-base == 第一父`,本可快进 |
| `10937fd` | W132 `9bacc88` | 3 | 真三方 |
| `a7033bc` | W130 `89ee9b7` | 7 | 真三方 |
| `c485c73` | W135 `f9ac1bb` | 3 | 真三方 |
| `ccbc12d` | W136 `61380b5` | 7 | 真三方 |
| `43eec57` | W137 `3a4e458` | 11 | 真三方 |
| `e5c98fb` | W138 `16eb33d` | 14 | 真三方 |
| `0050647` | W140 `9635416` | 15 | 真三方 |
| `a7ab716` | W141 `c07dcab` | 17 | 真三方 |
| `065ec2e` | W144 `9030fcb` | 11 | 真三方 |
| `81c6607` | W145 `c0ecdfb` | 14 | 真三方 |
| `b162dab` | W147 `dca7227` | 10 | 真三方 |
| `e56e141` | W143 `eb4e211` | **21** | 真三方 |
| `23b7a60` | W149 `cef3ebb` | 12 | 真三方 |
| `5a4a95a` | W150 `ed51a4a` | 16 | 真三方 |

"feature 必须从最新 integration HEAD 叉"这条纪律**实际执行率 1/15**(周期 9 是 2/8),
中位数落后 11 个提交,最大 21(W143)。

**这条纪律仍然没有酿成事故,而原因和周期 9 一模一样**:集成槽每次都执行了那条人工补偿——
十五次合并的提交标题里有 **十三次**直接写着"索引取并集按波次号归位,单元数、`FLOOR` 与记账件份数按合并后 live 取"这类话。
本周期比周期 9 多了一条机器护栏(W144 的行序判据把"按波次号归位"这半从人眼看住变成机器看住),
另外半边("数按合并后 live 重取")照旧是人工的。

值得记的一处:**这个人工补偿本周期第一次差点不够用。** W149 与 W150 叉点相同、
互不相知地算出同一组自称数(508 / 112 / 160),两支若单独合入,合并后的 live 与它们自称的数
在一侧恰好差 4 ——离 `SLACK = 3` 只一格。它们没能静默,是因为我方那一格已被前一次合并抬走。
W151 的记账件对这一段有完整记录,本槽只作复现确认。

### 6.3 相对 `master`

```
origin/master ................ 9adcf0f(与周期 9 同一颗,零新提交)
ahead  (master → w151) ....... 477 提交
behind (w151 → master) ....... 0 提交
diff ......................... 223 文件,+52655 / −1021
本周期(2f6880c → 31d7aeb) ... 52 提交,44 文件,+7051 / −166
```

`master` 自己现跑 unit **201/201**、contract **16/16**,与周期 9 逐个吻合;
`js/skills.js` 与 `docs/skills-wave/` 在 `master` 上都还不存在。

积压现在是**十个周期一件未合**。`master` 侧零提交故不会越拖越难合,但每多一个周期,
一次性合入时要复核的判据就多一层——本周期就多了三层(L5、L7、L8 行序)。

---

## 7. 阻塞汇总(按严重度)

先给周期 9 那十一条的结账,再列本槽新量出的。

| 周期 9 编号 | 现状 | 收它的槽 |
|---|---|---|
| 高 A1 下限棘轮"该抬没抬"零判据 | **部分收**:无界差额钉成 `SLACK = 3`;3 条真用例仍可静默删(5.5) | W132 |
| 高 A2 静态点数只守一向 | **部分收**:块包裹那一形状封住;`main` early `return` 照旧全绿(5.2) | W141 |
| 中 B1 问题中心前三步零投影 | **已收**(3.1/3.2) | W138 + W147 |
| 中 B2 同一断点两个码 | **已收** | W138 |
| 中 C1 G1 回执恒印 `undefined` | **已收**(3.5) | W135 |
| 中 C2 `gates()` 漏注入 fail-open | **已收**,抛错那半按新口径分档且不放行(3.5) | W135 + W137/W145 |
| 中 D1 SK-25「仍欠」段零断言 | **已收**,W150 翻面重写而非删(4.2) | W136 + W150 |
| 低 D2 `low-review` 不出 `shotIds` | **仍开**,且现在只差把 `Domain.reviseShotIds` 放进字段(4.2) | — |
| 低 E1 G-11 headless 零出口 | **已收**,四端齐备(4.1) | W143 |
| 低 E2 G-13 兜底不可达 | **不变**,仍 41 个调用点逐个显式给 `system`(4.3) | — |
| 低 F1 叉点新鲜度 2/8 | **恶化**到 1/15(6.2) | — |
| 低 F2 核验槽分支 tip 必红 | **已收**,W130 自己 486/486 全绿(2.1) | W130 |

本槽新量出的:

**高 · A2′ — 静态点数与实跑数至今零比对。** 见 5.2。`main` 里一条 early `return`:
静态 141、实跑 130、退出码 0、八层判据全绿,README 写 141。W141 封的是块链形状,封不住"块一层都不开"的跳过。
唯一的痕迹是末尾那行 `=====` 不见了,而这一条只有人眼看得见。
配套登记:W159 的 `report` 控制流扩面与发布门扇出**在飞**,本件不把它们当已有判据计入。

**中 · G1 — 浏览器审片闭环的达标线是第二份字面 `7`。** 见 5.3。把达标线整体挪到 8(常量 + 两条钉住 7 的断言同轮改),
`js/produce.js:272` 留在原地 → **520/520 全绿**,而该处会把 7 分镜判达标并替用户 `s.confirm = true`,
与同一集 `episodeState` 的 `needs_human` 和发布门 G3 的 fail 直接矛盾。
现有两条断言钉的是"这个常量必须等于 7",不是"两处同出一源"。

**中 · G2 — 前置断点"表外码"守卫按夹具射程。** 见 5.4。给 `gateBlockers` 加一档、其触发条件落在
五个手写夹具射程外 → **520/520 全绿**,码在流程条上出面而问题中心静默丢掉;
`js/issues.js:165` 的注释把这一路写成"由断言点名报出",实况只覆盖那四个既有码。
触发条件落在射程内则当场红三条(对照见 5.4),说明判据没坏、取数口太窄。

**中 · G3 — `FLOOR` 余量 3 = 预先批准删三条真用例。** 见 5.5。两步实测:
加 3 条探针 + README 同步 → 116/116 全绿(差额踩在上限);在那 3 格上真删 3 条既有用例 + README 改回 → 520/520 全绿。
这是 W132 判据注释里自己写明的代价("这个差额就是能被静默删掉的条数"),登记在案不算失守,但它是余量。

**低 · G4 — `low-review` 与 `failed-shots` 仍不同形。** 见 4.2。`Domain.reviseShotIds(ep)` 现成回 `["s1","s3"]`,
`js/issues.js:211` 已经调了同一份派生却只拿去拼 `detail`。周期 9 的 D2 现在只剩一个字段的距离。

**低 · G5 — 分集级审片门槛两处口径仍不同。** 见 3.4。`workflow.review` 在第 4/5 态就挂 `no-review`,
`Issues.collect` 在同一态早退不报。W138 收的是项目级前置三步,这一条不在它辖区,与周期 9 §3.3 结论相同。

**低 · G6 — 逐支复跑的取证对象在本周期被删掉了。** 见 0 节与 6.1。十五支功能分支的远端引用已不在,
"分支漏合"那条判据成了空判;本槽改挂第二父 SHA 才复跑出 2.1 那张表。
提交没丢故无数据风险,但下一轮想按分支名核"叉出去没合回来"已经无从遍历。

**低 · G7 — 叉点新鲜度 1/15,靠人工补偿托住。** 见 6.2。中位落后 11、最大 21;
十五次里十三次的提交标题写着"按合并后 live 重取"。W144 把"按波次号归位"那半变成了机器判据,
"数按 live 重取"那半仍是人工的——而 W149/W150 那次同值撞车说明它离不够用只差一格。

---

## 8. 下一目标(建议次序;本槽不执行)

1. **收 A2′,一次把 L1 从"README = 静态点数"升到"README = 静态点数 = 实跑数"。** 周期 9 §8-1 提的做法
   (套件收尾把实跑总数印在约定位置,由一条 `contract` 用例起子进程读回来比)本槽复核后仍是最省的一条:
   它不依赖任何静态形状,故 5.2 那种"块一层都不开"的写法自动落网,也不用再往白名单里塞词。
   代价仍是那条用例要起真实子进程。折中做法:给两个套件加一个只做登记不做 IO 的 `--dry` 模式,
   跑完只印总数就退出,`contract` 里起这个模式的子进程比一次。
   在飞的 W159 与发布门扇出若覆盖了这一面,本条应与它们合并,不另开槽。

2. **收 G1(达标线第二份字面)。** 让 `js/produce.js` 的闭环判定改读 `Domain.REVIEW_MIN`,
   同轮把那两条钉住 `7` 的断言改成钉"两处同源"(源级断言 `js/produce.js` 里不得再出现独立的达标线字面,
   加一条行为面用例把常量临时挪走看两端是否同步移动)。改动只在一个表达式上,判据面是两条。

3. **收 G2(表外码守卫)。** 把 `tests/unit.js:3593` 的 `seen` 从"五个夹具喂出来"改成从源码取:
   直接扫 `js/domain.js` 的 `gateBlockers` 函数体里 `code: '…'` 的字面集合,
   再与 `Issues.gates()` 双向对账。这样新加一档无论触发条件是什么都当场落网。
   下一行那个 `assertEq([...seen].sort().join(','), '四个码')` 应保留——它是"取数口不许静默失效"那道保险,
   与 W144 行序判据里那句同一手法。

4. **G4,一个字段。** 让 `js/issues.js` 的 `low-review` 补上 `shotIds: Domain.reviseShotIds(ep)`,
   `cmd` 是否要挂另说(挂 `episode.generateVideos` 会让问题中心一按就重抽,那是计费动作,
   按 `no-review` 那条的现行口径应当只给清单不代按)。

5. **G3 与 A1 的最后一格。** 不动 `SLACK`,改在加测的必经之路上顺手校一次 `FLOOR`:
   README 那个数字**已经**必须人工同步了(L1 钉死),让 `FLOOR` 直接从 README 那个数派生
   而不是再写一个字面,差额自然恒为 0,也不再制造第二个要人工同步的数。

6. **G7 与 G6 一起处理。** 若"feature 从最新 HEAD 叉"这条纪律的执行率两个周期都在往下走(2/8 → 1/15),
   与其继续靠集成侧补偿,不如承认它已经是**集成槽的职责**而不是 feature 槽的,
   把"按合并后 live 重取那几个数"这一步做成一条可跑的脚本(现取四个 live 值,回写四个 `FLOOR` 与两份 README),
   与 W144 的行序判据配成一对。同轮把合并过的功能分支留一份**只读的引用**(如 `refs/merged/wNNN`),
   让"分支漏合"那条判据下一轮还有遍历对象。

7. **合入 `master`。** 477 提交、223 文件的积压已经跨了十个周期。判据层这两个周期长得最快
   (五层 → 八层),一次性合入时要复核的东西只会更多。

---

## 9. 本报告的复核方式

以下命令在 `31d7aeb` 上原样跑得出本文所有数字。变异实测一律改完立即还原
(`git status` 空树复核),本仓库不留任何变异痕迹;`git worktree` 用完全部 `remove --force` + `prune`。

```sh
# 0. 锚定
git rev-parse origin/cursor/w151-integration-2bc5          # 31d7aeb…
git rev-parse origin/master                                 # 9adcf0f…
git rev-list --count origin/master..31d7aeb                 # 477
git rev-list --count 2f6880c..31d7aeb                       # 52(本周期)
git branch -r                                               # 只剩 master / w151 / agent-flow-sota 三条

# 1. 基线四套件(integration 与 cli.smoke 必须串行,固定端口)
node tests/unit.js | tail -1                                # 520/520
node tests/unit.js contract | tail -1                       # 113/113
node tests/integration.js | tail -1                         # 141/141
node tests/cli.smoke.js | tail -1                           # 105/107(2 项与 master 同名)
grep -c '^[ \t]*report(' tests/integration.js tests/cli.smoke.js   # 141 / 107
ls docs/skills-wave | grep -cE '^w[0-9]+-.+\.md$'           # 166(本件落地后 167)

# 2. 逐支现跑(第 2.1 节):远端分支已删,挂合并提交的第二父
for m in $(git rev-list --merges --first-parent 2f6880c..31d7aeb); do
  git worktree add -q --detach /tmp/wt160/$(git rev-parse --short $m^2) $m^2
done
( cd /tmp/wt160/<sha> && node tests/unit.js | tail -1 )
# w130 那支(89ee9b7)应回 486/486 全绿——核验槽 tip 不再是红的

# 3. 治理面直读(第 2.2 节)
node -e "const S=require('./js/skills.js');console.log(S.list().length,
  Object.keys(S.CHECKS).length, S.preflightStages().length,
  Object.keys(S.gaps()).length, S.playbooks().length)"                    # 30 17 7 20 5
node -e "console.log(Object.keys(require('./js/knowledge.js').SECTIONS).length,
  require('./js/prompts.js').list().length,
  require('./js/cmd-registry.js').names().length,
  require('./js/experts-data.js').EXPERTS.length)"                        # 18 41 13 16

# 4. 十三态走查(第 3.1 节):逐步取 workflow / episodeState / gateBlockers / Issues.collect 四处读数
#    前置三步四态三方码集相等(第 3.2 节)

# 5. 断点码三张表(第 3.2 节)
node -e "const fs=require('fs'),I=require('./js/issues.js'),
  d=[...new Set([...fs.readFileSync('js/domain.js','utf8').matchAll(/code: '([a-z0-9-]+)'/g)].map(m=>m[1]))],
  k=[...new Set([...fs.readFileSync('js/issues.js','utf8').matchAll(/kind: '([a-z0-9-]+)'/g)].map(m=>m[1]))],
  g=I.gates().map(x=>x.kind);
  console.log(d.filter(x=>!k.includes(x)&&!g.includes(x)).join(','))"     # 只回 no-episode

# 6. 发布门三情形(第 3.5 节):同一项目注入 / 不注入 / 注入一个会抛错的 Domain
#    注入 → fail/1/1,G1 info 带「第1集(ready:合成成片)」(不再是 undefined)
#    漏注 → fail/4/1,G1 info「缺 Domain 注入…」
#    抛错 → warn/0/5,ReleaseCore.passed() 仍回 false

# 7. 变异 A2′(第 5.2 节):tests/integration.js 的 main 里插一行
#    `if (!process.env.W160_ON) return;` → contract 113/113 全绿、静态点数仍 141、
#    node tests/integration.js 实跑 130 条且退出码 0(输出里一条 ===== 都没有)
#    正控:同一处的裸 { 分节块改成 if (process.env.W160_NEVER) { → 112/113,红一条点名 11 个登记点

# 8. 变异 G1(第 5.3 节):
#    ① js/domain.js `D.REVIEW_MIN = 8`                        → 518/520,红 2 条
#    ② ① + tests/unit.js 那两条断言同轮改成 8(js/produce.js:272 不动) → 520/520 全绿
#    ③ 只改 js/produce.js:272 的 7 → 4                        → 513/520,红 7 条(全在 produce 行为面)

# 9. 变异 G2(第 5.4 节):给 Domain.gateBlockers 加一档 w160-probe
#    ① 触发条件 p.__w160(夹具射程外)→ 520/520 全绿,Issues.collect 静默丢掉该码
#    ② 触发条件 !eps.length(射程内) → 517/520,红 3 条

# 10. 变异 G3 / A1(第 5.5 节):
#     ① 加 4 条 contract 探针,FLOOR 与 README 都不动 → 114/117,红 3 条(第三条是 SLACK 那层)
#     ② 加 3 条探针 + README 改到 523/116,FLOOR 不动  → 116/116 全绿(差额恰好 3)
#     ③ 在 ② 之上真删 flow 套件头三条(3828 字符)+ README 改回 520 → 520/520 全绿

# 11. 变异:记账段与键集(第 4.2 / 4.4 节)
#     抹掉 SK-25「仍欠(G-03)」整段          → 519/520,红 1 条
#     G-03 全改名 G-99                        → 516/520,红 4 条
#     索引表把 w10 那行整行挪到表尾           → 112/113,红 1 条(W144 行序)

# 12. 合入纪律(第 6 节):对十五个合并提交逐个比 merge / 第一父 / 第二父 / merge-base 四棵树上的文件哈希
#     整文件取 ours/theirs 零命中(45 次检查);文件回退 merge-base 内容零命中;
#     merge-base 落后第一父依次为 0 / 3 / 7 / 3 / 7 / 11 / 14 / 15 / 17 / 11 / 14 / 10 / 21 / 12 / 16
```

---

## 10. 本槽的产出边界

本槽**没有改任何产品代码,也没有改任何判据**。
改动只有三处,全部是记账,且**全部写进同一个提交**(W130 那条教训照办):
本文件、`docs/skills-wave/README.md` 的索引行与明写份数(166 → 167)、
`tests/unit.js` 里记账件份数那一个 `FLOOR` 字面(166 → 167,按本文件落地后的 live 取)。
三套件的 `FLOOR`(520 / 141 / 107)本槽一条测试都没加没删,故原样不动。

第 5 节那三个口、第 7 节 G1–G7 七条,**全部只登记不修**——按本轮任务口径,
核验槽不动发布门文件,不替下一个槽决定判据该长什么样,也不顺手改那些一行就能改的地方
(G1 的一个表达式、G4 的一个字段都在此列)。第 8 节给的是建议次序,不是已落地的东西。

在飞件(W159 的 `report` 控制流扩面、发布门扇出)本件一律按「在飞」登记,
其覆盖面不计入第 5 节的合同层现状;若它们落地后确实覆盖了 5.2 那个口,第 7 节的 A2′ 应随之结账。
