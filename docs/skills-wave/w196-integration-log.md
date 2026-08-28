# W196 集成记账件

两条已完成支(W191 CLI produce 修订轮次候选链补分集 `sbConfig` 那一档、W192 `js/api.js`
`listModels` 拉取失败不再回落陈旧缓存)并进同一条集成线。

## 1. 分支与 tip

- 基线:`cursor/w193-integration-f315`,tip `d55cd7d`(核对通过)。
- 本槽分支:`cursor/w196-integration-708c`,tip `9552a0b`。
- 两次合并都是真 `--no-ff`,各取被合入支 fetch 后的实际 head:
  - `5b0e1de`,parent `d55cd7d` + `235ddf0`(W191,与交接单给的参考 commit 逐字相同)
  - `9552a0b`,parent `5b0e1de` + `1b86410`(W192,同上)
- 两支同叉 `fb58034`(W185 的收尾 commit),故它们自称的数字都是 w185 上的数,一个都不采用。
- 全程没用过 `--ours`、没用过 `checkout <old> -- .`。

## 2. 数字(全部合完后 live 重跑,不抄两侧自称)

| 口径 | 基线 | 本槽 tip | 备注 |
|---|---|---|---|
| unit | 586 | **598** | +12,恰是两支相对叉点新增的 12 条 |
| contract | 130 | **131** | W191 那条候选链登记面 |
| domain | 34 | **35** | W191 那条两端候选链对账 |
| api | — | **10** | W192 新开的套件 |
| integration | 143 | **143** | 未动,实跑复核 |
| cli.smoke | 106/108 | **106/108** | 分子分母都未动,实跑复核 |
| GUARD_TOPICS / TOPIC_FLOOR / 花名册 | 19 / 19 / 19 | **19 / 19 / 19** | 两支都没碰花名册,故一条不登记 |
| 记账件份数 | 206 | **209** | 含 W191、W192 与本文三份 |

W191 自称 unit 571 / `contract` 129 / `domain` 33 / 份数 199,W192 自称 unit 579 / 份数 199——
都是 w185 上的数,**都不是答案**。两支自称的份数又是逐字相同的 199(同叉各加一份),
静默窗口连着第九槽出现,照抄它与 live 209 差 10 格。

五格下限按合完 live 重测:unit `FLOOR` 586 → **598**、记账件 `FLOOR` 206 → **209**;
`integration` 143、`cli.smoke` 108、`TOPIC_FLOOR` 19 三格 live 未动故不动
(差额上限 3 格那条逐格复核过)。

## 3. `cli.js` 怎么并的:真并集

四棵树机检:B `082fcc4` / P1 `e7bdd80` / P2 `082fcc4` / M `e7bdd80`。第二次合并里
`js/api.js` 那一格是 `P1 == B`(见下),而 `cli.js` 这一格在**第一次**合并里是 `P2 == B`
反过来的形状——我方(基线)自 w185 起改过它、W191 也改过它,两处改动相隔一百六十余行:

- 第 1042 段:W188 的空批次 `note`(`Domain.emptyBatchNote` + `log(note)` + 写进
  `result.note`),来自基线一侧;
- 第 1204 段:W191 的 `Domain.reviseRetryLimit(args.maxRetry, ep.sbConfig && ep.sbConfig.maxRetry)`
  候选链,来自被合入支一侧。

`git` 自动合上、一个冲突块都没给,合完两处都在——**是真并集**,交接单点名要保住的
「W188 的 empty note 日志 **和** W191 的 reviseRetryLimit 候选」逐条现取复核在位。
循环形状一字未动(W191 本来就只改那一行实参)。

## 4. `js/api.js` 怎么并的:**不是并集**,git 直接取对侧

四棵树机检:B `4f14f08` / P1 `4f14f08` / P2 `35e5d86` / M `35e5d86`。

即 **`P1 == B`**——本尖(基线)自 w185 叉出后**一行都没碰过** `js/api.js`,故 `git` 把对侧
整份拿了过来,合完与 W192 head 逐字节相同(`git diff` 对该文件为空)。交接单预判的
「本尖可能几乎没动过,git 或会直接取对侧」成立,**如实登记为不是并集**:这一格上没有
任何一段我方内容需要保住,也就没有"两面都在"可言,与第 3 节 `cli.js` 那一格成色相反。

产品口径复核:代理侧四处 + 直连侧三处失败回落全数摘掉(全文零 `cachedRaw` 回落),
TTL 内命中那一路原样保留(`if (!force && this._loadCachedIds())` → 读 `time` 判 `CACHE_TTL`),
`getTextModels` 的 `_modelIds` → 缓存 → `RECOMMENDED` 三级兜底一个字没动。
**失败回落没有加回去。**

## 5. 冲突与解法

三份文件在两次合并里各冲一轮,合计六处冲突块,全是文档数字或被基线演进过的陈旧长行:

- **主 `README.md` 那句长行**,两次都按 `;**` 切段做多重集比对:
  - 第一次(W191)对侧 6 段独有,逐段核出**全部**是被基线演进过的旧版本
    (`release.dirty` 转发、空 `catch` 覆盖面、`reviewGate` 那段等),即我方是超集,
    故整句取我方;W191 真正新增的那 231 字产品散文落在第 503 行、**自动合入未进冲突块**,
    单独核对在位。
  - 第二次(W192)对侧 7 段独有,其中 5 段同上是旧版本,**真内容 2 段**:新的 `api.js`
    模块段与套件清单里的 `api` 位。这两段都**不是整段独有**——段级多重集只报得出
    "这一段整体只在对侧",而它们是嵌在同名段内部的插入,靠逐段前后缀对齐才露出来
    (与 W193 记的那一课同形)。故取我方整句再把这两处按锚点外科插回。
- **`docs/skills-wave/README.md`**:份数那行取我方(随后按 live 重算),索引行取并集,
  w191 / w192 两行各按波次号插回 w190 与 w193 之间(索引表递增序那条判据现取校验通过)。
- **`tests/unit.js`**:两次都只冲在两个 `FLOOR` 字面上(单元下限、记账件下限),
  取我方后按合完 live 重抬。两支各自新加的用例块落在不同锚点,没有产生用例块冲突。

## 6. 变异抽查

两手都在合完的 tip 上现跑,跑完原样恢复、树干净、598/598 复绿。

**M1 — CLI 退回缺 `sbConfig` 档**(把那行实参改回 `Domain.reviseRetryLimit(args.maxRetry)`):
**红 2**,且**两条分工可辨**——

- `domain · reviseRetryLimit 两端候选链同序…`:行为面,报
  「`args={}` + `sbConfig={"maxRetry":1}`:两端 produce 解析出的轮次上限应是同一个数
  (一端读得到分集配置、另一端读不到即红):期望 1,实际 2」,即把用户在参数配置面板上
  **调低**到 1 的那一格量了出来(CLI 照跑 2 轮 = 每镜多烧一次真钱);
- `contract · 修订轮次的候选链只登记一处…`:源级面,点名 `cli.js` 的第二档缺失并复述
  「漏掉它不是"少读一个可选值",而是同一集在两端解析出两个上限」。

**M2 — `listModels` 失败回落加回**(七处按 W192 摘掉前的原样复原,含代理四处与直连三处):
**红 4**,分落四个不同的面——

- `api · 模型列表拉取失败一律抛错…`:后端 500 有陈旧缓存时静默返回了
  `["stale-a","stale-b","stale-c"]`;
- `api · 登录过期不被缓存吞掉…`:401 被缓存挡在 `U.authExpired()` 之前;
- `api · 缓存只在 TTL 内命中…`:`force` 没能绕过缓存现拉;
- `api · 直连模式同口径…`:直连上游 500 返回 `{"ok":true,"val":["stale-a"]}`。

两手都不是"红在同一条上"——W192 新开的 `api` 套件把代理/401/TTL/直连四路各钉了一条,
这正是它在记账里说的「`js/api.js` 此前零行为断言」被补上之后的实测形状。

## 7. 按名成集(`|` 切、多重集,不 unique-sort)

- **基线独有 0 条**——零吃测,一条既有用例都没有在合入过程中消失或被改名冲掉。
- W191 相对叉点新增 **2** 条、W192 相对叉点新增 **10** 条,**12 条全在 tip 上**,各 1 份不重不漏。
- tip 减去基线再减去两支新增,余 **0** 条——没有凭空多出来的用例。

## 8. 保留既有(逐条现取复核)

W176 `shotIds` 子集口、`staleShotSplit` / `staleSplitNote`、`js/pipeline.js` 断点条印
rerun 数、问题中心 `stale-shots` 分报(`count` 仍是 `c.stale`、仍不挂 `cmd`)、
`Domain.emptyBatchNote`、`Commands.digest` 读 `result.note`、`recommendedAction` 让位、
`Domain.epFixOf`、销号花名册、`guardSpread`、`js/` 全树零 `release.dirty` 发出点
(只剩第 568 行讲历史的那段注释)、`memWrite` 满桶驱逐、`FORGE_SYS` getter、
单一 `review.userSystem`、Issues UMD 双端、领域命令 `project.release`、
`Domain.reviseRetryLimit` 仍只此一份定义、`episodeState().reviewGate` 仍只此一份、
`Domain.projectScript` + `Domain.extractSourceText`、`expert.evolve` 不在 steps——
**逐条在位**。

`gaps()` 一个键不拆(与基线键集逐字相同的 20 键),**G-13 关联索引与基线逐字节相同**
(没有为清标记去动它);`GUARD_TOPICS` 19 条一条不增不减、`GUARD_TOPICS_CLOSED` 仍是 0 条、
`TOPIC_FLOOR` 19、花名册 19 行——**两支都没碰花名册,故按纪律一条不登记**。
注册表五个文件里四个相对基线零 diff,只有 `js/skills.js` 动了 7 加 4 删,且改的是
SK-25 那段 `note` 的措辞(W191 按新实况把「两端数的不是同一件事」改成点名调度粒度与
回执说法),不是注册表结构。

## 9. 产品面与测试面

- 产品面共三个文件:`cli.js`(+8 −3)、`js/api.js`(+14 −12)、`js/skills.js`(+7 −4)。
- 测试面:`tests/unit.js` 增 260 行(W192 的 `api` 套件 10 条占大头)。
- `node --check` 对改动文件逐个通过。

## 10. 三套件收口

- `unit` **598/598**。
- `integration` **143/143**。
- `cli.smoke` **106/108**,两条失败是 `未登录 whoami → exit 3` 与 `llm --json mock 链路`;
  在 `origin/master`(`9adcf0f`)的独立 worktree 上现跑复核,**同名同表现**
  (master 那边是 51/53,同样这两条红),即交接单允许的那两条 master 失败,分母以 live 为准
  仍是 108。`cli.smoke` 全程串行,没有并行跑过。

## 11. 残留

1. W191 自己如实留下的三处仍欠一格没动:浏览器命令层写回 `ep.sbConfig` 而 CLI 只读不写、
   两端重试计数器都不落库、`episode.smartReview` 单独调用时两端都不吃 `args.maxRetry`。
2. SK-25 的 G-03 仍挂着:两端闭环的**调度粒度**仍不同构(浏览器逐镜排、CLI 按整集分轮),
   本槽只收口径不动形状,合成一份仍待浏览器侧进度面板语义与逐镜计费节奏的产品口径定论。
3. `js/api.js` 这一格是 `P1 == B` 直接取对侧,故本槽**没有**在这个文件上量到"并集值多少"
   那一格的读数;下一次若两侧同时改它,得按第 3 节 `cli.js` 那个形状重新机检四棵树。
4. G-13 账上 `js/api.js` 的 `chatJSON` / `chatJSONRobust` 两处人设缺省(调用方不给 `system`
   时垫的那句)仍不在注册表里——W192 明确没碰它,与本槽收的 `listModels` 回落是两件事。
5. `subject.generateImage` 那一端的空跑回音仍欠(W188 残留 1/2 点名的那格),本槽没碰。
