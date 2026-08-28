# W199 集成记账件

两条已完成支(W194 `episode.smartReview` 单独调用把 `args.maxRetry` 喂进收敛轮次候选链、
W195 把「API 层 JSON 兜底缺省打不到上游」立成合同判据)并进同一条集成线。

## 1. 分支与 tip

- 基线:`cursor/w196-integration-708c`,tip `cdf537e`(核对通过,与交接单给的字面逐字相同)。
- 本槽分支:`cursor/w199-integration-540b`。
- 两次合并都是真 `--no-ff`,各取被合入支 fetch 后的实际 head:
  - `89dc4b3`,parent `cdf537e` + `62fc6ed`(W194,与交接单给的参考 commit 逐字相同)
  - `89ac8da`,parent `89dc4b3` + `bc4aea6`(W195,同上)
- 两支**同叉 `a895ab8`(W189 的收尾 commit)**,故它们自称的数字都是 w189 上的数,一个都不采用。
- 全程没用过 `--ours`、没用过 `checkout <old> -- .`。
- 在飞的 W197(主体空跑 note)与 W198(evolve 不入 steps)按任务口径一条没碰。

## 2. 数字(全部合完后 live 重跑,不抄两侧自称)

| 口径 | 基线 | 本槽 tip | 备注 |
|---|---|---|---|
| unit | 598 | **602** | +4,恰是两支相对叉点新增的 4 条 |
| contract | 131 | **132** | W195 那条可达面 |
| produce | 14 | **16** | W194 的两条行为面 |
| commands | 37 | **38** | W194 的 CLI 单独调用那条 |
| domain | 35 | **35** | 未动 |
| api | 10 | **10** | 未动 |
| integration | 143 | **143** | 未动,实跑复核 |
| cli.smoke | 106/108 | **106/108** | 分子分母都未动,实跑复核 |
| GUARD_TOPICS / TOPIC_FLOOR / 花名册 | 19 / 19 / 19 | **19 / 19 / 19** | 两支都没碰花名册,故一条不登记 |
| 记账件份数 | 209 | **212** | 含 W194、W195 与本文三份 |

W194 自称 unit **580**、W195 自称 unit **578**,两个都是 w189(577)上各自加完的数,
**都不是答案**;两支自称的记账件份数都是 203,静默窗口连着第十槽出现,照抄它与 live 212 差 9 格。

五格下限按合完 live 重测:unit `FLOOR` 598 → **602**、记账件 `FLOOR` 209 → **212**;
`integration` 143、`cli.smoke` 108、`TOPIC_FLOOR` 19 三格 live 未动故不动
(差额上限 3 格那条逐格复核过)。

## 3. W196 残留 1 的那一条:合完闭环

W196 记账件残留 1 写着「`episode.smartReview` 单独调用时两端都不吃 `args.maxRetry`」——
它被记成残留,是因为 **W194 当时还没合**。本槽合完后这一条**在浏览器那一端闭环**,
两端各自的实况分开记,不并成一句:

- **浏览器端:闭环。** `js/produce.js` 的 `autoSmartReview` 多收一个 `maxRetryArg`,那行改成
  `Domain.reviseRetryLimit(maxRetryArg, ep.sbConfig.maxRetry)`;`js/commands.js` 的
  `episode.smartReview` 把 `args.maxRetry` 作为第六个实参传下去。择先与钳位仍归 `Domain`
  那一份,本处不兜缺省——批量生成那一路不点名,自然落到分集配置档。
  一键成片编排走的正是 `execute('episode.smartReview', args)`,故**两路共用这一处漏斗**,
  入参从此靠候选链生效,不再靠先把 `ep.sbConfig.maxRetry` 改写一遍来传参。
- **CLI 端:不成立,故没有可闭的环。** `exec episode.smartReview` 是一次
  `/api/wf/smart-review` 往返,重抽循环长在 CLI `episode.produce` 编排里,
  轮次入参在这一端没有落点。按 W194 的口径**没有**给注册表的 `smartReview` 登记 `maxRetry`
  ——那是双端共享的元数据,登记等于让 CLI 用法清单宣称吃一个它静默忽略的参数。

闭环的读数在第 6 节 M1/M2 上:同一手退回基线形态在 tip 上**红 2**,而在基线 `cdf537e`
上**红 0**(基线产品码本来就是那个形态)——「残留当时全绿」与「现在有人接住」两头都量到了。

代价如实记进第 9 节残留:Agent 侧 `WfCore.sanitizeCmdArgs` 按注册表整形,仍会把
`smartReview` 上的 `maxRetry` 抹掉(这一格由 `commands` 那条新用例正面钉着,不是无人知晓)。

## 4. W195 的调用点计数怎么按 live 重算

交接单点名的风险:`jsonEntryCallSites()` 夹具那个 **42** 点是按 **W189** 数出来的,
合到 W196 之后调用点集合可能变了(W192 改过 `js/api.js`、W196 的产品面还动过
`cli.js` 与 `js/skills.js`),陈旧的 42 会把集成线打红。

处置是**先在合完的 tip 上把那份夹具原样跑一遍再决定**,而不是先改数、也不是把判据放宽成
「随便少几个点」。把 `jsonEntryCallSites()` 从 `tests/unit.js` 里现取出来在 tip 的
`js/` 全树上执行,读数:

- `calls.length` = **42**,与 W189 上数出来的一致;
- `sys === '缺省'` 的处数 = **0**(这是「停工位不成立」的唯一判据,原样成立);
- `sys === '解析失败'` 的处数 = **0**(夹具跟得上源码);
- 非「顶层直给」的三处逐点仍是 `js/agent-global.js:397` 基对象 `llmOptG`、
  `js/agent.js:498` 基对象 `llmOpt`、`js/understanding.js:8` 透传形参 `opt`;
- `refs` 仍是 `js/agent-ops.js:125` ×3。

即**这一轮不需要重算期望**:W192 改的是 `listModels` 的失败回落,一个 JSON 入口调用点都没增删;
W196 产品面另两个文件 `cli.js` 与 `js/skills.js` 不在 `js/` 的 JSON 入口扫描面上
(`cli.js` 不在 `js/` 目录,`js/skills.js` 那 7 行改的是 `note` 措辞)。
`42` 这个字面因此**按 live 复核后原样留着**,不是照抄。

那个数字松不松,当轮用 M8 量了:新长出一个**显式给 system** 的调用点(缺省面一点不动)
时它红在「处数:期望 42,实际 43」上,即这个数确实在守着调用面的增删,不是摆设。

## 5. 冲突与解法

三份文件在两次合并里各冲一轮,合计六处冲突块。

- **主 `README.md`**,两次都按段切开做多重集比对:
  - 第一次(W194)冲两处。**「智能审片闭环」那条**按 `。**` 切成 4 段,我方与对侧各 4 段、
    两两对不齐的有 2 对:第 3 段两侧同名,做前后缀对齐后露出我方多写了 W191 的
    「**两处 `produce` 喂进去的候选也逐档同序**」而对侧多的只是那句
    「(与达标线 `Domain.REVIEW_MIN` 同处登记)」——**那句在我方已经落在第 4 段尾巴上**,
    故第 1–4 段整段取我方一字不丢;对侧第 4 段
    「**轮次入参走候选链而不是靠改写配置**…」是 W194 真正新增的 365 字,
    我方没有,**外科插回**在我方第 4 段之后。
    **单元用例数那句长行**按 `;**` 切段:对侧 4 段独有,逐段核出全部是被基线演进过的旧版本
    (`api.js` 模块段缺失、`plans.js` 里 W187 那段插入缺失、`store.js` 段边界位移、
    套件清单缺 `api` 位),即我方是超集,故整句取我方、只把数字按 live 重抬。
  - 第二次(W195)冲两处,**两处都只差一个数字**:契约段自报的断言条数(131 / 130)与
    单元用例数(602 / 578)。逐字符前后缀对齐证到两侧长度相等、中间只差一个字符,
    另与叉点 `a895ab8` 对照证明 **W195 对 `README.md` 的全部改动就是这两个数**
    (`w195 == 叉点.replace(577→578).replace(129→130)`,机检为真),故取我方后按 live 重算。
- **`docs/skills-wave/README.md`**:两次都是份数那行 + 索引行两处。份数取我方(随后按 live 重算),
  索引行取**并集并按波次号排序**,w194 / w195 两行各插回它们自己的位置
  (w193 与 w196 之间;索引表递增序那条判据现取校验通过)。插回的两行与被合入支的原行
  **逐字节相同**(机检)。
- **`tests/unit.js`**:第一次冲三处——两个 `FLOOR` 字面,加**一处用例块冲突**:
  我方 W188 的两条 `generateVideos` 用例与对侧 W194 的 `CLI exec smartReview` 用例
  追加在同一个锚点上。取并集时**补回一行 `} },`** 把我方最后一条收口
  (机械去标记会当场语法错,这是 W193 记下的那一课)。第二次只冲在两个 `FLOOR` 字面上。

## 6. 四棵树机检(零冲突块的那几个文件也照核)

第一次合并(B = `a895ab8`):

| 文件 | B | P1 | P2 | M | 成色 |
|---|---|---|---|---|---|
| `README.md` | `4105396` | `b34e6e6` | `36676b8` | `b5e5b54` | 真三方 |
| `docs/skills-wave/README.md` | `94e77de` | `1460ef7` | `eeffbd4` | `9e7d2f1` | 真三方 |
| `tests/unit.js` | `b793776` | `361eacb` | `23b04ba` | `ab6068c` | 真三方 |
| `js/commands.js` | `d391ffe` | `9dab0c7` | `ec18594` | `a01be1f` | 真三方,**零冲突块** |
| `js/produce.js` | `77090a4` | `77090a4` | `ba23f5d` | `ba23f5d` | **`P1 == B`**,git 直接取对侧 |
| `cli.js` | `082fcc4` | `e7bdd80` | `082fcc4` | `e7bdd80` | **`P2 == B`**,git 直接取我方 |

三格分别登记,不把零冲突块读成同一回事:

- `js/commands.js` 是**真并集**——四棵树两两不等,我方(基线)那一侧有 W191 在第 360 行写回
  `ep.sbConfig.maxRetry = Domain.reviseRetryLimit(args.maxRetry, ep.sbConfig.maxRetry)`
  的 `episode.produce` 段,对侧改的是第 170 行 `episode.smartReview` 那一句,
  相隔一百九十余行故 `git` 一个冲突块都没给,**合完两处都在**(逐行现取复核)。
- `js/produce.js` 是 `P1 == B`——本尖自 w189 叉出后一行没碰过它,git 整份取对侧,
  合完与 W194 head 逐字节相同。**如实登记为不是并集**,这一格上没有我方内容要保住,
  也就量不到「并集值多少」的读数。
- `cli.js` 反过来是 `P2 == B`——W194 明说 `cli.js` 零 diff(那处候选链有意留给合入),
  故 git 取我方,**W191 已在本尖的那一行原样留着**:
  `Domain.reviseRetryLimit(args.maxRetry, ep.sbConfig && ep.sbConfig.maxRetry)`,
  `git diff` 对该文件为空。交接单点名「不要冲掉 W191 已在本尖的 CLI produce 那一行」——
  这一格另配了 M5 反向量它(见下)。

第二次合并(B = `a895ab8`):三份文档文件全是真三方;产品面 `js/` 与 `cli.js`
在 W195 那一侧相对叉点**零 diff**(机检),故一格都没动。

## 7. 变异抽查

七手都在合完的 tip 上现跑,跑完 `git checkout -- .` 原样恢复、树干净、602/602 复绿;
其中三手另在基线 `cdf537e` 上跑同一手作反事实对照。

| 变异 | tip | 基线 | 红在哪 |
|---|---|---|---|
| M1 `js/produce.js` 退回单档候选 | **红 2** | 红 0 | 两条 `produce` 行为面,报「期望 4,实际 1」 |
| M2 命令层不再传 `args.maxRetry` | **红 2** | 红 0 | 同上两条(两端各摘一头,读数一致) |
| M3 替 `smartReview` 在注册表登记 `maxRetry` | **红 1** | — | `commands` 那条:「这一端没有落点,注册表就不许替它登记」 |
| M4 候选顺序对调 | **红 2** | — | 分集配置反压过入参,轮次退回 1 |
| M5 冲掉 W191 已在本尖的 CLI 那一行 | **红 2** | — | `domain` 两端候选链对账 + `contract` 登记面各一条 |
| M7 新长出一个省略 `system` 的调用点 | **红 1** | 红 0 | `contract` 可达面,点名 `js/persona.js:127` |
| M8 新长出一个显式给 `system` 的调用点 | **红 1** | — | 同一条的处数那格:「期望 42,实际 43」 |

分工可辨的几格:

- **M1 / M2 的基线读数都是红 0**,这正是 W196 把它记成残留的原因;tip 上红 2,即第 3 节
  那条闭环有人接住,而不是只在文档里改了一句话。
- **M3 与 M1/M2 分得开**:M3 的行为一个字没变(注册表登记不影响浏览器闭环),
  红的只有那条「CLI 端没有落点」的源级 + 沙箱混合判据;反过来 M1/M2 行为变了而注册表没动,
  那条一条不红。「轮次对不对」与「登记面对不对」两件事各有各的接手方。
- **M5 是本槽最要紧的一格**:它量的不是 W194,而是「合并有没有把 W191 冲掉」。
  两条报错分落行为面(把参数面板调低到 1 时 CLI 照跑 2 轮 = 每镜多烧一次真钱)与
  源级面(`cli.js` 第二档缺失),与 W196 记的读数同形。
- **M7 与之前那手不同形**:先前用「把 `js/persona.js` 那行 `system: Prompts.get(…)` 删掉」
  当变异时 tip 红 4 / 基线红 3——那是复合变异,顺带打翻了两条既有的人设收编判据,
  W195 的净增只看得出 1 格。改成**纯净增量**(另加一个不给 `system` 的调用点、既有取数口一字不动)
  后读数干净:tip **红 1**、基线 **红 0**,W195 是纯增覆盖。

## 8. 按名成集(`|` 切、多重集,不 unique-sort)

- **基线独有 0 条**——零吃测,一条既有用例都没有在合入过程中消失或被改名冲掉。
- W194 相对叉点新增 **3** 条(`produce` ×2、`commands` ×1)、W195 相对叉点新增 **1** 条
  (`contract` ×1),**4 条全在 tip 上**,各 1 份不重不漏。
- tip 减去基线再减去两支新增,余 **0** 条——没有凭空多出来的用例。
- 计数自洽:598 + 3 + 1 = **602**,与 live 逐字相同。

## 9. 保留既有(逐条现取复核)

`listModels` 无失败回落(`js/api.js` 全文零 `cachedRaw` 回落)、`Domain.emptyBatchNote`、
`Commands.digest` 读 `result.note`、`Domain.staleShotSplit` / `staleSplitNote`、
`js/pipeline.js` 断点条印 rerun 数、问题中心 `stale-shots` 分报、
`Domain.workflow` 的 `recommendedAction` 让位、`Domain.epFixOf`、
`js/` 全树零 `release.dirty` 发出点(无 dirty 转发)、销号花名册与 `guardSpread`、
`memWrite` 满桶驱逐、`Experts.FORGE_SYS` getter、单一 `review.userSystem`、
Issues UMD 双端、领域命令 `project.release`、`Domain.reviseRetryLimit` 仍只此一份定义、
`episodeState().reviewGate`、`Domain.projectScript` + `Domain.extractSourceText`、
`expert.evolve` 不在 `produce` 的 `steps` 里——**逐条在位**。

`gaps()` 一个键不拆(与基线键集逐字相同的 20 键),**`G-13` 条目与基线逐字节相同**
(没有为清标记去动它,W195 的判据有意立在合同套件而不进 `gaps`);
`GUARD_TOPICS` 19 条一条不增不减、`GUARD_TOPICS_CLOSED` 仍是 0 条、`TOPIC_FLOOR` 19、
花名册 19 行——**两支都没碰花名册,故按纪律一条不登记**。
注册表五个文件(`js/cmd-registry.js` / `js/prompts.js` / `js/knowledge.js` / `js/skills.js` /
`js/domain.js`)相对基线**全部零 diff**,故八个治理数结构性成立。

## 10. 产品面与测试面

- 产品面共两个文件,合计 **8 加 4 删**:`js/produce.js`(+6 −2,形参 + 候选链 + 登记注释)、
  `js/commands.js`(+6 −2,传参 + 登记注释)。W195 产品面**零 diff**。
- `cli.js` / `js/api.js` / `js/skills.js` / `server.js` / `mcp.js` / `index.html` / `css/`
  相对基线一个字节没动。
- 测试面:`tests/unit.js` 增 212 行(W195 那条可达面用例占大头)。
- `node --check` 对改动文件逐个通过。

## 11. 三套件收口

- `unit` **602/602**。
- `integration` **143/143**。
- `cli.smoke` **106/108**,两条失败是 `未登录 whoami → exit 3` 与 `llm --json mock 链路`;
  在 `origin/master`(`9adcf0f`)的独立 worktree 上现跑复核,**同名同表现**
  (master 那边是 51/53,同样这两条红),即交接单允许的那两条,分母以 live 为准仍是 108。
  `cli.smoke` 全程串行,没有并行跑过。
- `tests/e2e.js` 按纪律**一次没跑**。

## 12. 残留

1. **CLI 端 `episode.smartReview` 仍没有重抽循环**,故轮次入参在这一端仍无落点,
   注册表按纪律不给它登记 `maxRetry`;代价是 Agent 侧 `WfCore.sanitizeCmdArgs` 会把
   这个参数抹掉(有用例正面钉着)。哪天这一端补上循环,那条用例先红,提醒同轮登记。
2. W191 留下的另两处仍欠一格没动:浏览器命令层 `episode.produce` 写回 `ep.sbConfig`
   而 CLI 只读不写、两端重试计数器都不落库。
3. SK-25 的 G-03 仍挂着:两端闭环的**调度粒度**仍不同构(浏览器逐镜排、CLI 按整集分轮),
   本槽只收入参口径不动形状。
4. G-13 账上 `js/api.js` 的 `chatJSON` / `chatJSONRobust` 两处人设缺省仍不在注册表里。
   W195 有意**没有**去清这个标记——它证的是「那句缺省今天打不到上游」(可达面),
   不是「它已经被收编」(登记面),两件事分开记;`gaps()['G-13']` 与基线逐字节相同。
5. `js/produce.js` 这一格是 `P1 == B` 直接取对侧,故本槽**没有**在这个文件上量到
   「并集值多少」的读数;下一次若两侧同时改它,得按第 6 节 `js/commands.js`
   那个形状重新机检四棵树。
6. `subject.generateImage` 那一端的空跑回音仍欠(W188 残留 1/2 点名的那格),本槽没碰。
7. 在飞的 W197(主体空跑 note)、W198(evolve 不入 steps)按任务口径一条没合。
