# W165 · `workflow.review` 与问题中心的**分集级审片门槛**不同:门槛收进 `episodeState().reviewGate` 一处

**范围**:`js/domain.js`(`episodeState` 新增 `reviewGate`,`workflow` 的 `review` 步与项目级推荐动作改读它)+
`js/issues.js`(审片三态按 `st.reviewGate` 取,不再自己比达标线/判旧位)+ `tests/unit.js`(domain 1、issues 1、
contract 1 共 +3,既有用例一条未改)+ `README.md` 与本目录 `README.md` 同步。
**基线**:`origin/cursor/w157-integration-9c4a`(`8507194`,开工现取核实相符)。
**不做**:不抬发布门 G1–G10 的任何判据(尤其不让 G2 转而去读 `p.script`)、不改 `Domain.REVIEW_MIN` 与 G3 的可配阈值、
不从 `Skills.gaps()` 摘任何键、不给 `low-review` 补 `shotIds`/`cmd`(那是另一支的事,本槽对齐的是门槛不是字段)、
不动 `js/pipeline.js` 与 `js/plans.js` 的取数(见 7 节)、不新增计费动作与领域命令、不合并其它并行槽。

## 1. 病灶:同一集同一份报告,两侧一个说卡一个说通

W130 的周期九走查(该份 3.3 节)已经登记过一句:第 4/5 态里 `workflow` 的 `review` 步挂着 `no-review`,
而那时该集还没有正文 / 还没有拆镜,问题中心在同一状态早退,一条审片相关的都不报。
那份记录把后果判成"展示噪音":推荐动作取的是首个未完成主线步,第 4/5 态都正确落在 `shots` 上。

开工在基线 `8507194` 上把两侧逐夹具摊开对照(Node 侧直调 `Domain.workflow` 与 `Issues.collect`,不经浏览器),
噪音之外还摊出**结论相反**的三格——**同一集、同一份 `lastReview`,一边说卡一边说通**:

| 夹具(单集项目,前置三步齐备) | 基线 `workflow.review` 的判 | 基线 `Issues` 该集的审片条目 |
|---|---|---|
| 无剧本正文 | `no-review`「1 集未审片」 | (无) |
| 未拆镜 | `no-review`「1 集未审片」 | (无) |
| 分镜表判旧 | `no-review`「1 集未审片」 | (无) |
| **无剧本正文 + 手上留着一份均分 5 的报告** | **`low-review`「1 集审片均分低于 7」** | **(无)** |
| **未拆镜 + 同一份均分 5 的报告** | **`low-review`「1 集审片均分低于 7」** | **(无)** |
| **分镜表判旧 + 同一份均分 5 的报告** | **`low-review`「1 集审片均分低于 7」** | **(无)** |
| 有镜未审 / 低分 / 判旧 / 达标 | `no-review` / `low-review` / `review-stale` / 通过 | 同左(四格一致) |

后三格与前三格不是同一件事。前三格是"未审"这个默认态在两侧摊法不同;后三格是流程条**拿一份审的不是当前
分镜表的报告下了质量结论**——那一集的镜头还没拆出来(或拆出来的是旧剧本的),报告里的 5 分无处安放,
而流程条据此说"审片均分低于达标线",问题中心与分集状态则一致地说"该去拆镜"。

### 1.1 两套门槛各自写在哪

`Domain.episodeState` 的 `needs_human`(即"这一集审片没过")在源码里要过三关才可能命中:
`no-script` 早退、`counts.total === 0` 早退、`shotsStale` 早退。`Issues.collect` 的逐集循环也是同三关早退
(`no-script` / `no-shots` / `shots-stale` 各 `return`),那段注释写得很明白:"挂载位置在此处即该集已有镜头"。

而 `D.workflow` 的 `review` 步是把 `epStates` 直接分档:

```js
const rvPass = epStates.filter(st => st.reviewAvg !== null && st.reviewAvg >= D.REVIEW_MIN).length;
const rvLow  = epStates.filter(st => st.reviewAvg !== null && st.reviewAvg <  D.REVIEW_MIN).length;
```

`reviewAvg` 只判了"报告判旧没有"(判旧的旧分在 `episodeState` 里已置 `null`),没有也判不到"这一集当下能不能审"——
三关一关不过。也就是说:**门槛在分集状态与问题中心是一套(靠早退位置隐式表达),在流程条是另一套(压根没有)**,
两处都对外(流程条读 `workflow`、问题中心读 `Issues`、CLI `hujing workflow` / `hujing issues` 各读一份)。

W138 把前置三步(剧本/主体/分集)的门槛收进 `Domain.gateBlockers` 时,那份记账的交接第 1 条写着:后四步
(分镜/剪辑/审片/成片)的 blockers **有意**没接进问题中心,"要动这一层,得先决定项目级汇总条目与逐集条目谁承接"。
本槽动的不是那一层:两侧的**条目形态照旧**(流程条仍出项目级汇总的三档集数,问题中心仍逐集出条目),
统一的只有"哪些集该进这三档"这道门槛。

## 2. 为什么门槛落在 `episodeState` 而不是各自补一个 `if`

三关的判定输入(`ep.content`、`counts.total`、`shotsStale`)`episodeState` 全都已经算过一遍,
它自己的 `status` 也正按这三关分档。在 `workflow` 里补一段"先过三关再分类",等于把同一句判据写成第三份:
`shotsStale` 要再调一次 `D.shotsStale`(或从 `st` 上取)、正文那半要再写一次 `(ep.content || '').trim()`,
而这类"两份都对的时候看不出来,一份改了才发现另一份没跟上"正是本目录反复收的那笔账。

故落点在两侧共同的上游,`episodeState` 多归一个档位字段出来。

## 3. 落地

### 3.1 `episodeState().reviewGate`(`js/domain.js`)

```js
const reviewGate = !hasScript || counts.total === 0 || shotsStale ? 'unready'
  : reviewStale ? 'review-stale'
    : reviewAvg === null ? 'no-review'
      : reviewAvg < D.REVIEW_MIN ? 'low-review' : 'pass';
```

取值五档:`unready`(这一集当下不可审)/ `no-review` / `review-stale` / `low-review` / `pass`。
后三档的**码字面就是** `review` 步的阻塞码与问题中心的 `kind`,不是新词表;达标线仍只有 `D.REVIEW_MIN` 一处,
判旧仍只有 `D.reviewStaleByScript` 一处,本函数一条判据都没新写——`unready` 那三关逐字取自本函数原有的
`no-script` 阻塞项(顺手把 `!(ep.content || '').trim()` 提成 `hasScript` 常量,那一处也不再写两遍)、
`counts.total === 0` 与 `shotsStale`,即 `status` 分档用的同一批表达式。

因此**分集状态一字未动**:`needs_human` 的可达性与 `reviewGate` 过门槛的条件本就是同一条,
`reviewGate === 'low-review'` 与 `status === 'needs_human'` 在同一批夹具上同进同出。

### 3.2 `review` 步与推荐动作改读它(`js/domain.js`)

```js
const rvOf = code => epStates.filter(st => st.reviewGate === code).length;
const rvPass = rvOf('pass'); const rvLow = rvOf('low-review');
const rvStale = rvOf('review-stale'); const rvNone = rvOf('no-review');
```

三条 `blockers` 的形状与文案一字未改,变的只是**分母**:不可审的集不进任何一档,它的断点由上游那几步各自报
(未拆镜进 `shots` 步的「有分集未分镜」,缺正文进那一集的分集状态与问题中心的 `no-script` 高危条目)。
`done` 的判据(`eps.length > 0 && rvPass === eps.length`)一字未动且语义不变——不可审的集本来就不在 `rvPass` 里。

项目级推荐动作那一处同改:原先按 `reviewAvg === null || reviewAvg < REVIEW_MIN` 挑集,会挑中不可审的集
并给出「整集审片:<该集>」;现在按 `reviewGate !== 'pass' && !== 'unready'` 挑,标签也改按档位取(行为对可审集逐字不变)。

### 3.3 问题中心按档位取(`js/issues.js`)

```js
if (st.reviewGate === 'review-stale') { … } else if (st.reviewGate === 'no-review') { … }
if (st.reviewGate === 'low-review') { … }
```

三条条目的 `kind`/`sev`/文案/处置(一律 `goto`,不挂计费命令)一字未改,`low-review` 的低分镜面仍走
`Domain.reviseTargets(ep)`(W131 那条一行未动)。变的是**取值口**:达标线的比较与判旧位的读取从这一层撤走,
`Domain.REVIEW_MIN` 与 `st.reviewStale` 在 `js/issues.js` 里都归零。三态互斥不再靠这一层的 `!st.reviewStale` 守卫,
而是由 `reviewGate` 只能取一个值来保证。

三个早退分支一行未动:它们现在的身份是"`unready` 那三关的对外条目"——不可审的集在问题中心一条不少,
报的是上游那一步的断点(`no-script` / `no-shots` / `shots-stale`),不是静默无声。

## 4. 这样对齐会不会改变产品语义

任务口径要求先答这一问(若两侧是有意的不同——一边只给人看、一边给编排——就停工不硬并)。逐条核过,不是:

- **两侧都是"给人看 + 给编排"**:`workflow` 的 blockers 下游有 `js/flow-tpl.js` 的 `gaps`(缺前置即 `ready=false`)、
  CLI `hujing workflow`、MCP;`Issues` 下游有 🩺 弹窗、CLI `hujing issues`、MCP `hujing_issues`、发布门 G2 的高/中危计数。
  没有哪一侧是"只给人看的宽口径"。
- **对齐方向不是二选一,而是有第三方作证**:`episodeState` 的 `status`(分集状态,第三个对外面)与问题中心同门槛,
  `js/plans.js` 的计划步也同门槛(逐集只取首个待办步,`episode.generateStoryboard` 那一步排在 `episode.smartReview` 前面,
  缺正文/未拆镜/判旧时先被它接走)。四个面里三个已经是同一道门,`workflow.review` 是唯一的那一个。
- **不改门禁**:发布门 G3 判的是"每集有未过期的审片记录且均分达标",读的是 `ep.lastReview` 与它自己的可配阈值,
  不读 `reviewGate`;G2 数的是问题中心高/中危条目,而问题中心的条目形态一条未变。本槽后 `release` 套件全绿。
- **一处观感变化如实登记**:主线真走到审片这一步而某集不可审时(只可能是"镜头都出片了但正文被清空"这一态),
  项目级推荐动作从「整集审片:<该集>」变成 `null`。旧文案指着一集说"去审片",而那一集缺的是正文,
  审片按钮按下去也审不出东西;现在如实为空,该集的断点由分集状态(`blocked`/「编写剧本」)与问题中心的
  `no-script` 高危条目承接。这一态由本槽用例钉住(5.1 用例 1 末段),不是顺手留下的。

## 5. 断言与变异

### 5.1 新增 3 条,既有用例一条未改

| # | 套件 · 用例 | 钉的是 |
|---|---|---|
| 1 | `domain · workflow:审片步只数 episodeState.reviewGate——尚不可审的集(缺正文/未拆镜/分镜判旧)不进任何一档,留着的旧报告也不冒充结论` | 三关逐关(各带/不带旧报告两版共六格)判 `unready` 且 `review` 步零阻塞项;可审后四档逐档归码;未拆镜带低分报告的集分集状态仍是 `ready`/去拆镜;推荐动作仍落 `shots`;`done` 不因没有阻塞项就变真;**主线真卡在审片而某集不可审时推荐动作为 `null`**(4 节末条) |
| 2 | `issues · collect:分集审片条目与主线 review 步逐集同判——同一集同一份报告,两侧双向相等(任一侧多报/漏报即红)` | 七集一个项目:逐集 `reviewGate` → 期望的审片条目集合**双向相等**(`pass`/`unready` 两档期望空集,故问题中心多报一条也红);七集档位串逐字钉住;`review` 步阻塞码集合 = 各集档位的并集,且三条 label 里的集数只数可审集(基线上那三条都会读成 4 集);不可审的三集在问题中心各报上游那一步的断点 |
| 3 | `contract · 分集级审片门槛单源:达标线/判旧/"这一集当下能不能审"只在 episodeState.reviewGate 一处,流程条与问题中心都不另判` | 源级:问题中心三态的取值点都是 `st.reviewGate`、`Domain.REVIEW_MIN` 与 `st.reviewStale` 在该文件零处;`const reviewGate =` 在 `js/domain.js` 恰一处;`D.workflow` 段内 `reviewAvg`/`reviewStale` 零处且 `review` 步按 `st.reviewGate === code` 数集数 |

用例 2 的"双向"与 W138 那条同一手法:只钉"`reviewGate` 摊出来的档在问题中心找得到"拦不住问题中心凭空多报
(那正是变异 7 的改法),只钉反向则拦不住漏报。两向都钉之后,两侧的审片结论在这七格上恒等。

### 5.2 变异实测(逐条单独施加、跑完还原,施加前的基线是 527/527 全绿)

| # | 变异 | 结果 |
|---|---|---|
| 1 | `workflow` 的 `review` 步退回按 `reviewAvg`/`reviewStale` 自己分档(**等于退回基线行为**) | 红 **3**:domain 1 + issues 1 + contract 1 |
| 2 | 问题中心把三态判据抄回第二份(`st.reviewStale` / `st.reviewAvg` 比较,**行为完全一致**) | 红 **1**:只有 contract 那条源级判据接得住 |
| 3 | 门槛去掉"分镜表判旧"一关 | 红 **2**:domain 1 + issues 1 |
| 4 | 门槛去掉"未拆镜"一关 | 红 **2**:同上 |
| 5 | 门槛去掉"缺正文"一关 | 红 **2**:同上 |
| 6 | 项目级推荐动作退回旧筛法(不跳过不可审的集) | 红 **1**:domain 那条的末段(4 节末条那一格) |
| 7 | 问题中心改成也报不可审集的审片条目(**朝另一个方向对齐**) | 红 **2**:issues 2(本槽那条的双向断言 + 既有的「未拆镜的集不报未审」) |

变异 1 复现的就是基线行为,而基线上它当然全绿——那三格"一边说卡一边说通"当年没有任何判据看着。
变异 2 与 W138 的变异 3 是同一类:**不改任何行为**,只把判据抄回第二份,七条里只有它是纯源级判据接住的。
变异 7 值得单记:它是"朝另一个方向对齐"(让问题中心跟着流程条报),既有那条 W54 立的
「未拆镜的集不报未审」当场红——那一侧的门槛是有判据护着的,这也是 4 节判定对齐方向时的一条实测依据。

## 6. 回归数字

| 套件 | 基线 `8507194` | 本槽 |
|---|---|---|
| `node tests/unit.js` | 524/524,0 FAIL | **527/527**,0 FAIL |
| └ `contract` 子套件 | 114 | **115** |
| `node tests/integration.js` | 141/141,0 FAIL | **141/141**,0 FAIL(该文件未进 diff,复跑核实) |
| `node tests/cli.smoke.js` | 105/107 | **105/107**(两项与 `master` 同名同表现:`未登录 whoami → exit 3`、`llm --json mock 链路`) |
| `node tests/e2e.js` | 未跑(按目录纪律仅在明确要求时跑) | 未跑 |

`node --check` 过:`js/domain.js`、`js/issues.js`、`tests/unit.js`。

棘轮按 **live** 抬(不抄旧数):`tests/unit.js` 单元 `FLOOR` 524 → **527**、记账件 `FLOOR` 170 → **171**;
`README.md` 的「单元测试(N 项断言」524 → 527、契约段自报条数 114 → 115;
本目录 `README.md` 明写份数 170 → **171**(含本份)并补索引行。
四格下限与 live 的差额落地后全为 0(单元 527/527、集成 141/141、CLI 冒烟 107/107、记账件 171/171)。

## 7. 边界

- **不动发布门**:G1–G10 判据、`fail/warn` 计数、`overall` 四级映射一字未改;G2 的输入(问题中心高/中危条目)
  在本槽的七格夹具上逐格未变——不可审的集本来就不报审片条目,可审的集三档照旧。
- **不新增字段以外的产出**:`episodeState` 多回一个 `reviewGate`,其余字段(含 `reviewAvg`/`reviewStale`)原样保留,
  既有消费方(`js/plans.js`、`js/pipeline.js`、`js/release.js`、`js/agent-ops.js`)一行未改。
- **不动 W131 那条**:`low-review` 仍走 `Domain.reviseTargets`,那一段一行未改。
- **不给 `low-review` 补 `shotIds`**:另有并行支在做那一面(W130 交接第 6 条 D2),本槽对齐的是门槛/状态,不碰字段形态。
- **不摘 `gaps`**:`Skills.gaps()` 仍 20 键——本槽落的是既有两个面之间的贯通,不对应任何一条缺口编号的"落地"。
- **不发明能力概念**:无新 skill 条目、无新 `SK-xx`、无新命令与端点、无新危险级。

## 8. 交接

1. **`reviewGate` 是分集级审片门槛的唯一出口**。再有第五个面要判"这一集审片过没过"(比如把审片接进
   发布门 G3 的 headless 那半),读它,不要再按 `reviewAvg` 比一遍——contract 那条源级断言只盯 `js/domain.js`
   与 `js/issues.js` 两个文件,新文件里抄第二份它接不住。
2. **`js/pipeline.js` 还有第四份取数,本槽有意没碰**,如实记在这里而不是悄悄留白:`Pipeline` 的
   `unRvEp()`(`js/pipeline.js:23`,`hashOf('review')` 直达首个待审集用)按 `st.reviewAvg === null || < REVIEW_MIN` 挑集,
   与基线 `workflow` 那份同口径,故同样会挑中不可审的集。它是**浏览器侧的导航目标**(点一下跳到那一集的工作区),
   跳过去看到的是"该集缺正文/未拆镜"的实况页面,不像流程条那样对外宣布一个质量结论,危害层级不同;
   改它要连带看 `pipeline.js:101/116/135` 那三处分集级流程条文案(它们读的是 `st.status`,已同门槛),
   属另一槽。`js/plans.js` 的 `episode.smartReview` 取材器不必改:计划层逐集只取首个待办步,
   `episode.generateStoryboard` 排在它前面并已接住那三关。
3. **`unready` 不出任何对外码是有意的**。它不是阻塞码、不进 `Domain.gateCodes()`、不进 `Issues.gates()`、
   在 `flow-tpl` 的 `gaps` 里也不出现——不可审的集的断点属于上游那几步,再在审片这一步报一遍就是同一件事报两条
   (W138 交接第 1 条判过的那件事)。要把它变成对外码,先答"这一条与 `no-shots`/`no-script` 谁承接"。
4. **主线卡在审片而某集不可审时推荐动作为 `null`**(4 节末条)。这一态窄(镜头都出片了而正文被清空,
   且分镜表没跟着判旧),但它是真能构造出来的;如果产品希望"下一步"永不为空,合理的补法是回落到那一集
   `episodeState().action`(即「编写剧本」),那会让 `recommendedAction.key` 与 `cur.key` 不同源,
   得先确认 `js/agent.js` / CLI `next` 这些消费方受不受得住,故本槽没做。
5. **不可审的三关是"当下能不能审",不是"该不该审"**。别往里塞 `counts.generating`(生成中仍可审旧镜、
   费用按可审镜数计,`js/review.js` 已有自己的预过滤)或 `counts.unconfirmed`(确认闸在剪辑那一步),
   塞进来会让 `review` 步在整集重生成期间静默不出结论。
