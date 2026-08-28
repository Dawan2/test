# W205 集成记账:W200 右栏缺图判定同源 + W201 计划层不代跑人手命令

新基线 `cursor/w202-integration-363b`,tip `0010394`。按序两次 `--no-ff` 合入两条**已完成**支,
两支都从 **W196**(`cdf537e`)叉出、互不相识,合完 live 现取全部数字。
在飞的 W203(agent-ops)与 W204(CLI `sbConfig` 写回)按任务口径**一条没碰**。

本槽的正题是 **W202 残留 2 的闭环**:`js/plans.js` 的 `generate` 拆得出 `expert.evolve`、`runAll` 会执行它——
W198 那道闸只封住 `Skills` 那一路的 `steps`,计划层那一路当时开着,因为 W201 未合。本槽把它并进来。

## 一、两次合并

| 次序 | 被合入支 | 实际 head | merge commit | parents |
|---|---|---|---|---|
| 1 | `cursor/w200-subject-image-pred-504f` | `2cb869d` | `c145645` | `0010394` + `2cb869d` |
| 2 | `cursor/w201-plans-evolve-manual-9e4f` | `b5fd7b2` | `e53521a` | `c145645` + `b5fd7b2` |

两次都是真 `--no-ff`(两个 parent 齐全,不是快进);全程没用过 `--ours`,没用过 `checkout <old> -- .`。
两次合并的 base 都是 `cdf537e`(两支同叉 W196)。

## 二、四棵树机检:哪些是并集,哪些是 git 直接取对侧

冲突块数不等于成色。逐文件比对 基线 `B` / 我方 `P1` / 对侧 `P2` / 合完 `M` 四个 blob:

**第一次合并(`0010394` + `2cb869d`,B = `cdf537e`)**

| 文件 | 成色 |
|---|---|
| `README.md` | 真三方(M 不等于任一侧) |
| `docs/skills-wave/README.md` | 真三方 |
| `tests/unit.js` | 真三方 |
| `js/sb-views.js` | `M == P2` 且 `P1 == B`——**不是并集**,git 直接取对侧 |
| `cli.js` / `js/cmd-registry.js` / `js/commands.js` / `js/domain.js` / `js/produce.js` / `js/skills.js` / `tests/cli.smoke.js` | `M == P1` 且 `P2 == B`——对侧没碰,取我方 |

**第二次合并(`c145645` + `b5fd7b2`,B = `cdf537e`)**

| 文件 | 成色 |
|---|---|
| `README.md` / `docs/skills-wave/README.md` / `tests/unit.js` | 真三方 |
| `js/cmd-registry.js` | **真三方**——两侧各改同一条 META,是本槽唯一一处需要并集的产品文件 |
| `js/plans.js` | `M == P2` 且 `P1 == B`——**不是并集**,git 直接取对侧 |
| `cli.js` / `js/commands.js` / `js/domain.js` / `js/produce.js` / `js/sb-views.js` / `js/skills.js` / `tests/cli.smoke.js` | `M == P1` 且 `P2 == B`——对侧没碰,取我方 |

两个产品文件的成色相反,值得单列:`js/sb-views.js` 与 `js/plans.js` 都是本尖自 W196 以来一个字没动过,
git 整份取的对侧,**不是两侧合出来的并集**——被合入支带来的东西得逐条现取而不能靠合并结果推断(第四节现验)。
`js/cmd-registry.js` 则相反,与 W202 那一槽的成色**正好翻了个面**:上一槽它是 `P1 == B` 整份取对侧,
本槽本尖已带着 W198 的改动,故它是真三方——W202 残留 1 提醒的「下一槽若这两侧同时有改动,`P1 == B` 这个便宜就没有了」当场兑现。

## 三、`js/cmd-registry.js` 的并集怎么做的

两侧改的是 `expert.evolve` 那条 META 的**注释块**,而 `manual: true` **那一位两侧逐字相同故 git 自动合上**——
这是最要留神的一格:字段没冲突不等于注释可以整份取任一侧。

- 我方(W198)那段写的是**扫描口**:`manual` 是单一来源,判据在 `Skills.validate` 按本字段逐条目递归扫 `steps`、不认命令名字面。
- 对侧(W201)那段写的是**执行口**:`manual` 是「人手动作」在元数据里的落点,四端人手入口一条不减,这个位只钳制程序替用户发起的那些路径。

整份取任一侧都会把另一头的口径冲掉,故按并集重写成一段:先说这一位是什么,再把**两处消费并列**
(`Skills.validate` 递归扫 `steps` / `Plans.execStep` 落 `blocked` 不代跑),末尾收 W201 那句「四端入口不减」。
另外我方那句「也不进任何 playbook 步序」比对侧的「也不进 SK-26 的 playbook 步序」更严,取我方的写法。

合完现取:全文件 `manual` 出现 **3** 处(文件头元数据清单 1、注释 1、字段 1),
**字段只有一份 `manual: true`、`manualOnly` 零处**(`js/cmd-registry.js` / `js/plans.js` / `js/skills.js` 三处都扫过)。

`js/cmd-registry.js` 的头一行元数据清单 `(name/label/risk/needs/manual/desc/args)` 两侧写的是同一句,自动合上,没进冲突。

## 四、两条产品面逐条现验(不靠冲突块推断)

**`js/plans.js`**:与 `b5fd7b2` 那份**逐字节相同**(git 整份取对侧,已 `diff` 现比)。
`execStep` 上的 `manualCmd` 漏斗在(第 215–222 行、第 234 行),
单步「▶ 执行」与 `runAll` 走同一个漏斗故只此一处;`generate` 侧**一个字都没筛**——
W201 有意不拦生成(计划步的来路不止 `generate` 一条,拦在执行口才挡得住整条自动路径),现取确认 `generate` 段内零 `manual`。
源级上 `js/plans.js` 零 `expert.evolve` 字面(人手与否只从注册表现取)。

**`js/sb-views.js`**:`noRefImg` 派生在(第 295 行),四处判定(预计算的 `missImg` 两处 + 右栏参考角色 / 参考场景两格)都改读它;
`subjOf` 与 A 组 12 处 `!s.image` 一字未动,`js/release.js` 零 diff 故 **G9 两端根本没进 diff**。

## 五、live 数字(全部合完现取,两支自称一律不抄)

两支自称的 `602` / `600` 都是**在 W196 上**量的数,不是答案。

| 口径 | W202 基线 | 合完 live | 说明 |
|---|---|---|---|
| `unit` | 607 | **613** | +6 = W200 四条 + W201 两条 |
| `contract` 套件 | 134 | **135** | W200 +1,W201 未加契约用例 |
| `sb-views` 套件 | 7 | **10** | W200 三条 |
| `plans` 套件 | 14 | **16** | W201 两条 |
| `integration` | 143 | **143** | 未动,但实跑复核 |
| `cli.smoke` | 107/109 | **107/109** | 分子分母都按合完 live 实跑定 |
| `GUARD_TOPICS` / `TOPIC_FLOOR` / 花名册 | 19 / 19 / 19 | **19 / 19 / 19** | 两支都没登记新主题,故一条不动 |
| 记账件份数 | 215 | **218** | 含 W200 / W201 / 本文三份 |

`cli.smoke` 这一格两支都没碰 `tests/cli.smoke.js`(相对各自叉点零 diff、tip 相对基线也零 diff),
故分母结构性不动,仍按 live 实跑点数得 **109**;两条失败(`未登录 whoami → exit 3`、`llm --json mock 链路`)
与 W202 基线上同名同表现,是与 `master` 同源的既有失败,不由本槽引入。

`unit` 的 `FLOOR` 由 607 抬到 613(差额 6 格已超 3 格上限,不抬会红在棘轮那条上);
记账件 `FLOOR` 由 215 抬到 218。`integration` / `cli.smoke` 两格的 `FLOOR` 按 live 就位,未动。

## 六、名集比对(`|` 切、**多重集**、不 unique-sort)

- `unit`:基线独有 **0** 条,tip 新增 **6** 条,零吃测;607 + 6 = **613** 自洽。
- 两支相对各自叉点 `cdf537e` 的新增(W200 四条、W201 两条)**逐条都在 tip 上**,一条没漏;
  两支相对叉点各自删掉 **0** 条。
- `integration` / `cli.smoke`:两支相对叉点对这两个套件源码零 diff,tip 相对基线同样零 diff,
  故名集结构性不动,另各实跑一遍复核(143/143、107/109)。

## 七、变异抽查

合完的产品码上现跑,每手改完即还原;每手都先确认**变异真落在被测那一段上**(改完文件确有 diff),
再读红数——变异表里的红数只有在这一步确认过之后才算读数。

| # | 变异 | 红 | 报在哪 |
|---|---|---|---|
| M1 | SK-25(`review.reviseLoop`)的 `steps` 里插一条 `expert.evolve` | **2** | 新判据点名「人手命令出现在编排步序里」+ 既有那条引用键单源 |
| M2 | SK-30(`film.produceProjection`)的 `steps` 里插一条 `expert.evolve` | **2** | 同上两条 |
| M3 | 摘掉 `js/cmd-registry.js` 的 `manual: true` | **3** | `plans` 两条(执行口当场放行)+ `contract` 一条(扫描口变空扫)——**两处消费同读一份字段,摘一位两头一起塌** |
| M4 | `Skills.validate` 的递归摘掉(只扫顶层) | **1** | 扫描口点名嵌一层 `steps` 那一路 |
| M4b | `Skills.validate` 改成只扫编排型条目 | **1** | 扫描口点名非编排条目那一路 |
| M5 | `Plans.execStep` 的 `manual` 拦截摘掉(退回 W202 形态,照旧下发) | **2** | `plans` 两条:命令层收到 `expert.evolve` 且后面的步被带着跑 |
| M6 | `js/sb-views.js` 整体退回自判图字段 `!(sj.image \|\| sj.imgRef)` | **4** | `sb-views` 三条 + `contract` 源级那条 |
| M7 | 只退**右栏参考角色**那一格(预计算面不动) | **2** | `sb-views` 的「形态没单独出图不算缺图」+ `contract` 源级那条 |
| M8 | 把注册表那一位改名成 `manualOnly` | **3** | 与 M3 同形——扫描口与执行口都读 `manual`,改名等于两头一起摘 |

另如实登记一格**假变异读数**:M4 头一次写的替换式对不上源码里那一行的写法,`perl` 静默换了 0 处、
文件零 diff,而那一轮照样跑出个红数——按纪律先查"变异有没有落地"才没把它当读数。
表里的 M4 是按实际那一行(`if (Array.isArray(st && st.steps)) walk(...)`)重写后落地的第二次。

M3 / M4 / M4b / M8 四手值得单列:M4/M4b 红的是**判据自己的退化路**(不递归、只扫 live 投影面),
M3/M8 红的是**字段单源**——这道闸今天由 `Skills.validate` 与 `Plans.execStep` 两处消费同一位撑着,
任一手动那一位两处一起报,即"两份消费"不会退化成"两份各写一份人手命令表"。

### 两手反事实:证明本槽真的闭了环,不是判据本来就在

- **W202 残留 2(`js/plans.js` 的 `runAll` 会执行 `expert.evolve`)**:把 tip 那两条 `plans` 用例
  原样喂给基线 `0010394` 的产品码,实测下发链是
  `episode.generateStoryboard,expert.evolve,episode.compose`——**带齐 `args` 的蒸馏步真被代跑了,
  而且后面的步还被带着一起跑完**;而基线自己的 `unit` 是 607/607 全绿、`plans` 14/14 全绿,
  没有任何判据接得住,这正是它当时被记成残留的原因。合完后同一份计划下发链只剩
  `episode.generateStoryboard`,那一步落 `blocked` 并把用户指回手动入口,`runAll` 停在这里、后面的步原样留着。
- **W200 的停工位(右栏那一格孤票)**:把 tip 那三条 `sb-views` 用例喂给基线产品码,**红 3**
  (「派生说没图时须报缺图」/「实际带得上图就不该报缺图」/「占位图须报缺图」);
  而基线自己的 `sb-views` 是 **7/7 全绿**——那一格当时确实没人接,W200 报的假警与漏报都读不出来。合完后 10/10。

## 八、口径复核(合完现取,不靠推断)

- `gaps()` **20 键**未拆(`G-08 G-15 G-09 G-01 G-02 G-12 G-13 G-04 G-10 S-01 S-03 G-07 G-14 G-05 S-04 S-05 G-03 G-11 S-06 S-07`),
  **G-11 原样开着**(值仍是 `["review.memoryFeedback"]`,本槽一个字没动、没有装清);
  `GUARD_TOPICS` / `TOPIC_FLOOR` **19 / 19**、销号台账 1 条、
  花名册 `w178-topic-floor-unlist.md` **零 diff**(两支都没登记新主题,故一个字没动)。
- `expert.evolve` **仍在 `cmds` 上**(`CmdRegistry.names()` 命中、登记在 1 个条目的 `cmds` 里)
  且**逐条目递归扫下来 `steps` 里 0 处**;`Skills.validate()` 现跑 0 条报错。四端人手入口一条没减。
- 产品面相对基线只有三个文件:`js/cmd-registry.js`(+8 −4)、`js/plans.js`(+35 −16)、`js/sb-views.js`(+9 −4)。
  `js/api.js` / `js/commands.js` / `js/domain.js` / `js/issues.js` / `js/pipeline.js` / `js/produce.js` /
  `js/release.js` / `js/release-core.js` / `js/skills.js` / `js/experts.js` / `js/wf-core.js` / `js/agent-ops.js` /
  `cli.js` / `mcp.js` / `server.js` **逐个零 diff**,故 `emptyBatchNote` + `emptySubjectImageNote` 两份并存、
  `digest` 读 `note`、`listModels` 无失败回落、`staleShotSplit`、pipeline 印 rerun、issues 分报、
  `recommendedAction` 让位、`epFixOf`、无 dirty 转发、销号、guardSpread、smartReview 漏斗、
  `jsonEntryCallSites`、memWrite 驱逐、`FORGE_SYS` getter、单一 `review.userSystem`、Issues UMD、
  `project.release`、`reviseRetryLimit`、`reviewGate`、`projectScript` + `extractSourceText` 等既有面**结构性保持**;
  另按名现取复核了 `Domain` 上那几份派生(两份 note、`staleShotSplit`、`epFixOf`、`projectScript`、
  `extractSourceText`、`reviseRetryLimit`、`subjectRefImage`)与 `WfCore.memWrite`、`Issues` UMD 逐个在位。
- 在飞的 **W203**(agent-ops)与 **W204**(CLI `sbConfig` 写回)按任务口径**一条没碰**。

## 九、残留

1. **`js/sb-views.js` 与 `js/plans.js` 这两次"整份取对侧"没有留下任何冲突痕迹**。
   本槽是靠四棵树机检把它们分出来的。下一槽若这两个文件两侧同时有改动,`P1 == B` 这个便宜就没有了——
   `js/cmd-registry.js` 本槽正是这么翻的面(上一槽取对侧、本槽真三方),这一格记在这里提醒。
2. **W200 明确不收的那一半仍原样开着**:全仓按 `!s.image` 判「权威图字段齐不齐」的 12 处一个字没动,
   W200 判定它们逐格同真同假、收口换不出行为差别却要动 G9 取值,故本槽照其结论**不收口**。
   要动 G9 / 门槛派生 / 补图选人里任何一处 `!s.image` 之前,先读 `w200-subject-image-pred.md` 第 1 节那张对表。
3. **W198 那道新判据仍没有进 `GUARD_TOPICS`**(W198 与 W202 各登记过一次,本槽照抄这一格如实留着):
   它今天只靠用例名活着,改名 / 挪套件不红、真删掉也只报"少了一条用例"。W201 新加的两条 `plans` 用例同理。
   本槽合完之后这道闸已由**两处消费**撑着(扫描口 + 执行口),立不立主题编号的收益比上一槽更明确了,留给后续槽判。
4. **`emptySubjectImageNote` 末一堆「N 位没能说清原因」仍是无人覆盖的安全阀**(W202 残留 4 原样留着,本槽没碰 `js/domain.js`)。
5. **计划层这道闸只管 `Plans.execStep` 这一个漏斗**。今天浏览器计划层的两个执行入口(单步「▶ 执行」与 `runAll`)
   都从这里过,故一处就够;但若日后另开一条不经 `execStep` 的执行路(例如服务端替用户跑计划),
   那条路不在本闸射程内——`Skills.validate` 那一路也只管 `steps`,两处合起来仍不是"全仓禁止程序发起蒸馏"的完备判据。
