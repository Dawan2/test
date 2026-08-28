# W223 · 镜头空跑回执的四堆:同 id 两镜时 `gone` 算成负数,四堆一起收

**范围**:`js/domain.js`(+11 −5,`emptyBatchNote` 点名那一支里数四堆的五句)、
`tests/unit.js`(+1 条 `domain` 用例 + 两个 `FLOOR` 字面)、
`README.md` 与 `docs/skills-wave/README.md` 数字同步。
**基线**:`cursor/w220-integration-3c7a`(`16baeb9`,W220 集成尖;交接自称 `91d3768` 一带,现取尖是它上面那条记账件提交)。
**结论**:停工位**不成立**——负数句子不但纯函数面现跑得出来,**两端命令层也现跑得出来**
(与 W217 主体那侧的结构性不可达**恰恰相反**,见 1.2)。按 W217 同形修数法,
并按 W217 交接明写的那条**四堆一起判**:`locked` / `fresh` / `gone` / 安全阀全部改按点名 id 数,
只补 `gone` 一句会把负数从「不在本集」挪到「没能说清原因」,一点没修。
**不做**:不碰 `emptySubjectImageNote` 的 `gone`(W217 已修)、不碰点名闸 `Array.isArray`(W216)、
不碰 `js/plans.js`(W219/W222 在飞)、不改「同 id 点名跑几镜」的选人、不拆 `Skills.gaps()` 键、
不登记 `GUARD_TOPICS`、不开 PR。

## 1. 基线 live 举证

两面都在基线 `16baeb9` 上现跑,产品代码一字未改。

### 1.1 纯函数面:`gone` 真的是负数

领域模块本就是双端 UMD,`require('./js/domain.js')` 跑的就是产品代码本身:

```
夹具 shots = [ {id:'dup', final}, {id:'dup', final} ]        ← 分镜表里同 id 两镜
emptyBatchNote(p, ep, ['dup'])
  → "点名的 1 镜一镜也没跑:2 镜已定稿(…需先解锁终稿)、-1 镜不在本集"     ← 负数逐字露在用户面
emptyBatchNote(p, ep, ['dup','ghost'])
  → "点名的 2 镜一镜也没跑:2 镜已定稿(…需先解锁终稿)"                  ← ghost 被抵消,一声不吭

夹具 shots = [ {id:'dup'}, {id:'dup'} ](两镜都是鲜镜)
emptyBatchNote(p, ep, ['dup'])   → "…:2 镜产物已是最新、-1 镜不在本集"
夹具 shots = [ {id:'dup', final}, {id:'dup'} ](一定稿一鲜)
emptyBatchNote(p, ep, ['dup'])   → "…:1 镜已定稿(…)、1 镜产物已是最新、-1 镜不在本集"
夹具 shots = 同 id 三镜全定稿
emptyBatchNote(p, ep, ['dup'])   → "…:3 镜已定稿(…)、-2 镜不在本集"      ← 减得越多负得越深

对照(分镜表里没有重复 id):
emptyBatchNote(p, ep, ['sh0','ghost']) → "点名的 2 镜一镜也没跑:1 镜已定稿(…)、1 镜不在本集"
```

后果分三条记,互不替代:

- **负数露面**:`say(n, t)` 只判 `if (n)`,`-1` 是真值,那一堆照样拼进句子;
  各堆之和随之破了(`1 ≠ 2 + (-1)`,而"和恒等于点名数"正是这句话的立身判据)。
- **真不在本集的那镜被抵消**:`['dup','ghost']` 这一路 `gone = 2 − 2 = 0`,
  `ghost` 明明不在本集却一个字都没有——连安全阀那一堆都没接住它(`2 − 2 − 0 − 0 = 0`)。
- **另外三堆同样多算**:`locked` / `fresh` 都从 `hit`(命中的**镜条数**)里数,
  点名 1 个 id 报出「2 镜已定稿」。这一条是镜头侧独有的,主体那侧只有 `gone` 一堆。

### 1.2 命令面:**够得着**,与主体那侧结构相反

W217 在主体那侧量到的是"命令面结构性不可达":那端选人是
`(p.subjects || []).filter(s => ids.has(s.id))`,同 id 两位时 `todo` 恰恰非空,
`!todo.length` 那一支根本不进,句子不被拼出来。

镜头这一侧**不是同一结构**。两端选人都在 `ids.has(s.id)` 之外还挂着两个条件:

```js
// js/commands.js / cli.js(同口径)
pend = (ep.shots || []).filter(s => !s.final && ids.has(s.id)
  && (!Store.shotVideoReady(s) || Domain.shotVideoStale(p, s, online())));
```

于是同 id 那两镜**可以既命中点名、又一个都不待跑**(都定稿、或都已出片且不过期),
`pend` 空掉、`note` 照求——负数当场落到用户回执上。两端沙箱各真跑一遍(浏览器那端用
`loadCommands`,headless 那端直接加载 `cli.js` 本体只掐掉末尾 `main()`):

```
浏览器 js/commands.js episode.generateVideos(ui 模式)
  两镜全定稿 · ['dup']        total=0  note="…:2 镜已定稿(…)、-1 镜不在本集"   引擎未起
  两镜全定稿 · ['dup','ghost'] total=0  note="…:2 镜已定稿(…)"                ← ghost 被吃掉
  两镜全鲜   · ['dup']        total=0  note="…:2 镜产物已是最新、-1 镜不在本集"
  一定稿一鲜 · ['dup']        total=0  note="…:1 镜已定稿(…)、1 镜产物已是最新、-1 镜不在本集"
  三镜全定稿 · ['dup']        total=0  note="…:3 镜已定稿(…)、-2 镜不在本集"
  无重复 id  · ['sh0','ghost'] total=0  note="…:1 镜已定稿(…)、1 镜不在本集"

headless cli.js EXEC['episode.generateVideos']:同夹具同输出,引擎实收 []
```

**故停工条件不成立**:交接给的那句「若现跑命令层永远走不到负数句且纯函数面也不为负,停」,
两半都不满足——命令层走得到、纯函数面也为负。这一条与 W217 记的那句话并列着看才完整:
主体侧不可达是因为选人只有一个条件,镜头侧可达是因为选人多挂了两个条件,
"同形"止于数法,不及于可达性,**不能拿主体那侧的结论替镜头这侧免测**。

顺带现跑登记(不改):同 id 两镜且都待跑时,点名 `['dup']` 引擎实收 `["dup","dup"]`、
`total=2`——一次点名真起两次引擎、两笔视频钱。这是选人面的事,交接明令不碰,见第 6 节。

## 2. 改的是哪一句

`js/domain.js` `D.emptyBatchNote` 点名那一支里数四堆的五句,一起换掉:

```js
// 基线
const hit = shots.filter(s => ids.includes(s.id));
const locked = hit.filter(s => s.final).length;
const fresh = hit.filter(s => !s.final && D.shotVideoReady(s, online) && !D.shotVideoStale(p, s, online)).length;
const gone = ids.length - hit.length;
// 本槽
const hits = ids.map(id => shots.filter(s => s.id === id));
const all = (h, f) => h.length > 0 && h.every(f);
const locked = hits.filter(h => all(h, s => s.final)).length;
const fresh = hits.filter(h => all(h, s => !s.final && D.shotVideoReady(s, online) && !D.shotVideoStale(p, s, online))).length;
const gone = hits.filter(h => !h.length).length;
```

数的东西换了一个:四堆一律数**点名 id**,不数命中的镜条数。
判据本身一个字没动——就绪/判旧仍现取 `shotVideoReady` / `shotVideoStale`,
点名清单那一侧的去重(`[...new Set(picked)]`)一字未动。

**为什么必须四堆一起**:只把 `gone` 换成「点名 id 里找不到的个数」,`locked` 仍数镜条数,
`['dup']` 那一格就是 `1 − 2 − 0 − 0 = -1`——负数从「不在本集」挪进「没能说清原因」,
一个字都没修好(第 4 节变异 3 逐字印出来了)。W217 交接写的「四堆一起判」就是这一格。

**归堆按「这个 id 底下的镜是不是清一色如此」判**(`every`,空命中不算)。
同 id 两镜口径不一(一镜定稿一镜鲜)时**不硬派**,落进安全阀那一堆——
硬派成任一堆都是替用户下结论,而"和恒等于点名数"照旧成立。
用 `some` 代替 `every` 时那一格 `1 − 1 − 1 − 0 = -1` 当场再变负(变异 4)。

由此三条性质各自成立:四堆取值范围都是 `0..ids.length`(负不了)、
各堆之和恒等于点名数、且分镜表里躺着几条同 id 的镜一堆都影响不到
(抵消不掉真不在本集的那个)。**分镜表里没有重复 id 时四堆逐字照旧**,用例第 ⑤ 格钉着。

**选人一字未动**:同 id 两镜点名跑 2 镜,那是 `js/commands.js` / `cli.js` 各自
`filter(s => !s.final && ids.has(s.id) && …)` 的行为,本槽没碰。

## 3. 加测

一条 `domain` 用例,与既有那两条 `emptyBatchNote` 用例分开写
(一条钉分档、一条钉点名闸,这条钉数法):

| 套件 | 用例 | 钉的是 |
|---|---|---|
| `domain` | `emptyBatchNote:分镜表里同 id 存着两镜时四堆都按点名 id 数(gone 不许为负,更不许把真不在本集的那镜抵消掉)` | 任何一堆不许报负数镜、同 id 两镜不许把 `locked`/`fresh` 数成两镜、`['dup','ghost']` 里 `ghost` 必须自己露头报「1 镜不在本集」、口径不一的同 id 两镜落安全阀、四路各堆之和都等于点名数、点名清单去重照旧、无重复 id 那一路逐字照旧 |

夹具一集里摆三对同 id 两镜:`dup` 两镜都定稿、`fdup` 两镜都是鲜镜(指纹现取
`shotInputHash` 写回,不手抄)、`mix` 一定稿一鲜。四格分别点名
`['dup']` / `['dup','ghost']` / `['fdup','ghost']` / `['mix']`,再加一格无重复 id 的整句逐字对照。

夹具自证有辨识力:

- `['dup','ghost']` 那一格是专门为**只把负数钳成 0**这手准备的——
  `Math.max(0, …)` 在只看句子读不读得通时看不出毛病,只有同一句里既有重复 id
  又有真不在本集的 id 时,它才把 `ghost` 吃掉(基线与钳 0 在这一格输出**逐字相同**)。
- `['fdup','ghost']` 那一格是为**只收 `locked` 与 `gone`、放过 `fresh`** 准备的。
- `['mix']` 那一格是为**硬派归堆**(`some` 代 `every`)准备的。

## 4. 变异

五手,每手改完跑 `node tests/unit.js domain`,验完 `git checkout -- js/domain.js` 还原
(还原后 `git status` 干净、`39/39`)。另用同一夹具直调纯函数把四格逐格印出来,
好让"哪一手在哪一格上现形"读得出来。

| # | 变异 | 结果 |
|---|---|---|
| 1 | 退回基线那五句 | 红 **1**:`任何一堆都不许报出负数镜:…:2 镜已定稿(…)、-1 镜不在本集` |
| 2 | 只钳负:`gone = Math.max(0, ids.length - hit.length)`,其余照旧 | 红 **1**:`任何一堆都不许报出负数镜:…:2 镜已定稿(…)、-1 镜没能说清原因` |
| 3 | 只把 `gone` 换成按 id 数,`locked`/`fresh` 仍从 `hit` 里数 | 红 **1**:`任何一堆都不许报出负数镜:…:2 镜已定稿(…)、-1 镜没能说清原因` |
| 4 | 四堆都按 id 数但归堆用 `some` 代 `every`(硬派) | 红 **1**:`既不许负数也不许算成"不在本集":…:1 镜已定稿(…)、1 镜产物已是最新、-1 镜没能说清原因` |
| 5 | 摘掉点名清单去重(`const ids = picked`) | 红 **2**(既有那条 `emptyBatchNote` 分档用例 + 本槽这条各一句) |

四格逐格现跑(直调纯函数,同一夹具):

| 格 | 基线 | 变异 2(钳 0) | 变异 3(只补 gone) | 变异 4(`some`) | 本槽 |
|---|---|---|---|---|---|
| `['dup']` | `2 镜已定稿、-1 镜不在本集` | `2 镜已定稿、-1 镜没能说清原因` | 同变异 2 | `1 镜已定稿` | `1 镜已定稿` |
| `['dup','ghost']` | `2 镜已定稿`(ghost 没了) | `2 镜已定稿`(同左) | `2 镜已定稿、1 镜不在本集、-1 镜没能说清原因` | `1 镜已定稿、1 镜不在本集` | `1 镜已定稿、1 镜不在本集` |
| `['fdup','ghost']` | `2 镜产物已是最新` | 同左 | `2 镜产物已是最新、1 镜不在本集、-1 镜没能说清原因` | `1 镜产物已是最新、1 镜不在本集` | `1 镜产物已是最新、1 镜不在本集` |
| `['mix']` | `1 镜已定稿、1 镜产物已是最新、-1 镜不在本集` | `…、-1 镜没能说清原因` | 同变异 2 | `…、-1 镜没能说清原因` | `1 镜没能说清原因` |

这张表把三件事分开了:基线与钳 0 在 `['dup','ghost']` 那一格**逐字相同**
(都把 ghost 吃掉),故那一格拦的是钳 0;`['dup']` 那一格拦的是负数本身,
而变异 3 证明只补 `gone` 只是把负数换了个堆放;变异 4 证明归堆不能硬派。

## 5. 回归数字(live)

| 套件 | 基线 `16baeb9` | 本槽 |
|---|---|---|
| `unit` | 643/643 | **644/644** |
| └ `domain` 子套件 | 38 | **39** |
| `integration` | 147/147 | **147/147**(未动,实跑复核过) |
| `cli.smoke` | 107/109 | **107/109**(未动;失败仍是与 `master` 同名的那两条:`未登录 whoami → exit 3`、`llm --json mock 链路`) |

产品面只动 `js/domain.js` 一个函数的五句(+11 −5,其中 6 行是注释);
`js/commands.js`、`cli.js`、`js/cmd-registry.js`、`js/plans.js`、`js/issues.js`、`js/release.js`、
`mcp.js`、`server.js` 一字未改。治理面零变动:`Skills.gaps()` 键数、注册表条数、短名单、
`CHECKS`、`preflightStages()`、`GUARD_TOPICS` / `GUARD_TOPICS_CLOSED` / `TOPIC_FLOOR` 一个数没动。

棘轮按 **live** 抬:`tests/unit.js` 单元 `FLOOR` 643 → **644**、记账件 `FLOOR` 234 → **235**;
`README.md` 的「单元测试(N 项断言」643 → 644;`docs/skills-wave/README.md` 明写份数 234 → **235**(含本份)。

## 6. 交接

1. **与 W217 同形处逐条对照**:数法同形(都从"点名数 − 命中条数"换成"按点名 id 逐个问库/集里有没有")、
   点名清单去重层都保留、选人都一字未动、都只修计数不碰判据。
   **不同处有三个,接的人别照抄结论**:
   (a)命令面可达性相反——主体侧结构性不可达(选人只有 `ids.has`),
   镜头侧可达(选人另挂 `!s.final` 与 `!ready || stale`),故本槽的命令面举证是**真跑出来的负数**,
   不是"加了也永远绿";(b)镜头侧有四堆、主体侧只有一堆,故本槽收的是五句不是一句;
   (c)镜头侧多出"同 id 多镜口径不一"这一态(主体侧没有终稿锁与判旧,不存在这一态),
   本槽按 `every` 落安全阀处理。
2. **两端命令层没加用例**:回执那句话的单源判据(两端都现取 `Domain.emptyBatchNote`)
   已由 `contract` 套件既有两条钉着,本槽这条负数是**纯计数**问题,单测在 `domain` 层收得干净;
   命令面的现跑登记在 1.2 节,复现只需按那几个夹具再跑一遍。
   要是后面有人改了两端选人的三个条件之一,**可达性会跟着变**,那时值得回头看 1.2 这一格。
3. **"同 id 两镜点名跑 2 镜"本槽有意没碰**:1.2 节末尾现跑出来的是命令层真起两次引擎、
   两笔视频钱;CLI 那端 `findShot(epLive, s.id)` 取的是第一条,两轮写在同一镜上、
   第二镜仍没产物(与 W217 在主体侧读到的形状一致)。要不要按 id 只跑一镜、
   或者在分镜入库那一层就不许出现同 id 两镜,是产品口径题,动它会同时动到计费笔数与分镜表的唯一性约束。
4. **分镜表里为什么会有同 id 两镜**,本槽没有追到源头:复制镜头、导入分镜、跨集搬镜那几条路径是嫌疑面。
   本槽只保证这种表存在时回执说的是实话。这与 W217 在主体侧留的同一条口子并排开着,
   两侧现在都只在**回执**这一层挡住,入库唯一性一层至今没人守。
5. **在飞的没碰**:W219(`js/plans.js`)、W221(按钮)、W222(合入员)一个字没动;
   `emptySubjectImageNote` 的 `gone`(W217)与点名闸 `Array.isArray`(W216)原样。
   合入时 `js/domain.js` 的冲突面预计只在 `emptyBatchNote` 这一个函数内,
   与 W217 那次一样:真冲突大概率全落在带数字的那几行
   (`tests/unit.js` 两个 `FLOOR`、`README.md` 单元用例数、`docs/skills-wave/README.md` 明写份数与索引表尾),
   **两侧给的数一个都不是答案**,合完得现取 live 再写。
