# W3 · G-03 落地:审片升为主线一等步骤

> 缺口来源:`docs/skills-wave/w1-pipeline-skill-map.md` 第九章 G-03(P0)与 `w1-architecture-spec.md` W3 第 1 项。
> 基线:`master @ 9adcf0f`(二十三轮收尾)。本文只记录本槽真实改了什么、验收怎么跑、边界在哪。

## 一、G-03 原始描述与前置复核

缺口原文:**审片不是主线一等步骤**——流程条无 review 步、板块 Agent 无审片席、`plans` 的"审片修订"是导航类步骤(`goto`)而非映射到已注册的 `episode.smartReview`,headless 不可执行。

动工前按 W1 文档要求复核了并行分支 `origin/cursor/agent-flow-sota-analysis-736a`:该分支的编号体系是它自己的 G1–G5(专家方法论注入 / CLI 一键成片审改重抽复审闭环 / `/api/wf/agent` 单轮 Agent 端点 / 记忆消费侧 / 补两条领域命令),与本文 G-03 不是同一编号。逐项核对结论:

| 该分支改动面 | 是否覆盖 G-03 |
|---|---|
| `js/domain.js` | **未改动**(diff 中无此文件)→ 主线步骤集合仍是六步,无 review |
| `js/plans.js` | **未改动** → 审片步骤仍是 `goto` 导航类 |
| `js/agent.js` | 只改人设/记忆注入,`AGENT_BOARDS` 仍 7 项无审片席 |
| `cli.js` | 补齐了 `episode.produce` 的审→改→重抽→复审真实执行(与本槽互补),但没有把审片登记为主线步骤 |

所以 G-03 未被覆盖,本槽按 W3 规格实现;与该分支的重叠面只有 CLI `episode.produce` 的审片步,本槽只补"缺审片如实回报"这一层,不动它的真实评审链路。

## 二、改了什么(按 W3 规格逐条)

### 1. `Domain.workflow` 主线插 `review` 步(`js/domain.js`)

- 主线步骤序变为 `script → subjects → eps → shots → gen(剪辑) → review(审片) → film(成片)`,支线(制片/导演/剧壳/切片)不变,键名与历史一致。
- **判定全部复用既有口径,没有新写判旧逻辑**:分类只读 `episodeState` 已经推导好的 `reviewAvg`(判旧的旧分在那里已置 `null`)与 `reviewStale`,再按达标线归三类:
  - `no-review` 未审(无 `lastReview`)
  - `review-stale` 审片记录已过期(`reviewStaleByScript` 命中:剧本 rev / 图谱 rev / 镜头集快照任一失配)
  - `low-review` 均分低于达标线
- 新增常量 `D.REVIEW_MIN = 7` 作为达标线唯一来源,`episodeState` 里原先硬编码的 `reviewAvg < 7` 改为引用它(行为等价)。发布门 G3 的可配阈值 `releaseMinReviewScore` 仍归发布门,不下沉到 domain(domain 不读 Store)。
- 项目级 `recommendedAction`:审片步未完成时给 `{ key:'review', label:'整集审片|重新审片|审片修订:<分集>', hash:该集工作区 }`,三种文案分别对应上面三类。

### 2. 流程条与分集工作区(`js/pipeline.js`、`js/storyboard.js`)

- `Pipeline.hashOf(p,'review')` 直达首个待审集(全部达标时退回首集回看报告)。
- `Pipeline.nextForEp`:全部出片已确认但无有效审片记录时,下一步为「🧐 整集审片」(记录判旧时为「🧐 重新审片(记录已过期)」);低分仍走既有 `needs_human` 分支「🧐 审片修订(均分 X)」。
- `Pipeline.prevForEp`:已审但未合成时上一步为「← 上一步:整集审片」(未审时保持原语义指向生成视频)。
- 分集工作区:流程条「审片」步点击打开整集审片面板;「下一步」按钮的 `review` 分支走 `Commands.execute('episode.smartReview', { ui:true })`(审→改→重抽→复审闭环,计费仍在 `Tasks.run` 内),「上一步」分支打开审片面板。
- `Pipeline.nextForProject` 图标表补 `review: '🧐'`。

### 3. 板块 Agent 增审片席(`js/agent.js`、`js/episodes.js`)

- `AGENT_BOARDS` 在「生成」与「成片」之间插入 `{ key:'审片', ico:'🧐', agent:'审片总监' }`,焦点=逐镜四维评审、低分归因、按问题清单修订提示词并重抽、复审达标后放行合成;「成片」板块焦点相应收敛为合成/版本对比/导出交付与发布门处置(审片职责移交)。
- 该数组是唯一来源,插入后自动生效的下游:智能体分工看板泳道(阶段/审核意见/板块专家雇佣/协作入口)、定稿传导上游链 `upstreamFinal`、板块顺序级联 `BOARD_ORDER`、全局助手的板块状态上下文与专家阵容 chips、意图路由候选面。
- 智能体分工看板补审片板块进度文案:未判旧审片记录的集数 / 总集数。
- `agent-ops.js` 的 `opBoardKey` 早已会返回 `'审片'`(此前没有对应板块,高亮落空),现在能对上。

### 4. 计划步骤映射已注册命令(`js/plans.js`、`js/agent-ops.js`)

- `fromWorkflow` 的审片步骤从 `goto`(只能跳页面)升级为 `cmd:'episode.smartReview'` + `epid`,三态各自文案:未审「整集审片:X」/ 判旧「重新审片:X(记录已过期)」/ 低分「审片修订:X(均分 N)」。计划在 headless 与 `runAll` 下因此能真实推进审片,不再停在导航步。
- 低分阈值改读 `Domain.REVIEW_MIN`(原为字面量 7)。
- `ACT_CMD` 补「审片修订」「重新审片」两个别名指向 `episode.smartReview`——动作协议文本由该表自动生成,新增文案不会出现"协议宣称了却不支持"。

### 5. 缺审片不静默通过(`js/commands.js`、`cli.js`)

`episode.produce` 编排两端同口径:

| 情形 | 回执 |
|---|---|
| `smartReview:false`(显式关闭) | `steps` 登记 `{ step:'smartReview', status:'skipped', error.code:'disabled' }`,合成照常(用户主动 opt-out) |
| 浏览器审片模块未加载 | 登记 `skipped`(`error.code:'unavailable'`)+ 整单 `blocked`(`review-unavailable`),`riskyCompose` 显式放行 |
| CLI 审片未产出结论(端点失败/中断) | 该步保留真实失败记录 + 整单 `blocked`(`review-unavailable`),`riskyCompose` 显式放行 |

此前两处都是 `if (审片开关) { … }` 的静默跳过:关闭审片时 `steps` 里根本没有 `smartReview` 条目,回执看不出质量闸门到底跑没跑。`cmdDigest` 对 `episode.produce` 的步骤摘要同步区分 `⊘`(skipped)与 `✕`(失败)。CLI 文件头那句"CLI 侧该步如实标 skipped"的注释已经与二十一轮之后的真实行为不符,一并更正。

## 三、验收

```
node --check js/domain.js js/pipeline.js js/plans.js js/agent.js js/agent-ops.js js/episodes.js js/storyboard.js js/commands.js cli.js
node tests/unit.js            # 211/211 PASS(改动前 201,新增 10 项断言)
```

新增断言分布:

- `domain` 3 项:主线步骤序 `…gen,review,film`;未审 → `no-review` + 推荐「整集审片」;达标 → `review` done 且推荐动作前进到合成;低分/判旧各自阻塞码与文案;`REVIEW_MIN` 单源(并断言 domain 源码里不再有 `reviewAvg < 7` 字面量)。
- `pipeline` 3 项:`nextForEp` 未审/判旧/低分三态;`prevForEp` 已审未合成 → `review`;`hashOf('review')` 直达待审集。
- `plans` 1 项:三态都映射 `episode.smartReview` 且不再带 `goto`。
- `commands` 2 项:审片关闭 → `skipped` 且不阻断;模块缺失 → `skipped` + `blocked review-unavailable`,`riskyCompose` 放行。
- `contract` 1 项:review 紧邻 gen 与 film;`AGENT_BOARDS` 键序含审片席;plans/工作区/CLI/浏览器四处映射与如实回报的源码约束。

## 四、口径与边界(如实记录)

- **`episodeState` 的状态机没有动**。审片仍不是分集级的硬阻塞:一集没审也能合成(分集级 `needs_human` 只由低分触发,与改动前一致)。变化只发生在"推荐做什么"这一层——项目级推荐动作、分集级下一步、计划步骤会先把审片摆出来。硬门禁仍归发布门 G3(每集必审且达标)。
- **达标线两处不同源是有意的**:主线推导用 `Domain.REVIEW_MIN`(常量 7,双端可用、不读 Store);发布门用 `releaseMinReviewScore`(用户可配、可调严)。domain 是 UMD 双端模块,不能读浏览器设置,所以不把可配阈值下沉。
- **板块数与主线步骤数仍不是一一对应**:板块 8 个(导演/剧本/主体/分集/分镜/生成/审片/成片),主线步骤 7 个(剧本/主体/分集/分镜/剪辑/审片/成片)+ 4 条支线。板块「生成」对应步骤 `gen`(显示名「剪辑」),板块「导演」是支线步骤。本次只补齐审片这一处缺席,不为对称而重命名既有板块(改板块 key 会动 `p.boards` 存量数据)。
- **存量项目的观感变化**:所有视频已出片、镜头已确认但从未审片的项目,项目级"下一步"与"按主线生成"的计划会从"合成成片"变为"整集审片"。这是 G-03 的预期行为(审片进主线),不是回归;成片按钮本身仍在工作区顶栏可直接点。
- **未纳入本槽**:问题中心(`js/issues.js`)仍只报低分审片,不报"未审片"——那是 W4 校验型 skill 接入审片维度时一并处理的面,本槽不动它以免与并行槽争同一文件、也避免存量项目问题角标一夜变红。`js/skills.js` 与知识注入面本槽完全没碰。
