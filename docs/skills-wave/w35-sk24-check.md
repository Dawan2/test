# W35 · SK-24 方法论维度进审片报告的校验半落地(审片面从零到一)

基线 `cursor/w29-integration-068b`(head `11da95f`,含 W26/W27/W28 三支收敛)。
本槽只落 SK-24 的校验面,不含合并、不动发布门、不动审片动作、不动计费。

## 1. 起点:基线上剩下的 check pending 是哪几条

动工前先按纪律核对短名单实况(不照计划表开工)。基线上 `pending` 含 `check` 的条目实测三条:

| 条目 | 面 | 缺口 | 实况 |
|---|---|---|---|
| SK-20 `shots.motionGate` | 分镜 | S-04 | 判定输入是节拍板五段式产出,无对应领域命令(另有并行槽在处理) |
| **SK-24 `review.methodDim`** | **审片** | **G-10** | **注入面已落地(`reviewBlock`/`tplReview` 进评审提示词),校验面无出口** |
| SK-29 `film.deliverContract` | 成片 | G-10 / S-07 | 发布门的方法论门,要动门禁口径 |

SK-22 已在 W28 落地并随 W29 合入(基线上 `pending` 为空、`checks: ['gen.renderCredential']`),
故本槽落 SK-24。SK-29 未选:它的落点是发布门,与本轮"只报不拦、不碰门禁"的边界冲突。

基线上 SK-24 那一条的原貌:

```js
{
  id: 'review.methodDim', sk: 'SK-24', name: '方法论维度进审片报告', stage: 'review', wave: 'W4',
  kinds: ['inject', 'check'], pending: ['check'], kbBlocks: ['reviewBlock'],
  prompts: ['review.system', 'review.finalSystem'], settings: ['tplReview'], cmds: ['episode.smartReview'],
  experts: ['ex_editor'], gaps: ['G-10'],
  note: '维度口径以 script.hookType / … 的条目为准,不在本条重复登记',
}
```

`Skills.preflightStages()` 实测回 `["script","subjects","eps","shots","gen","film"]` 六面——
`review` 面不在表里。落地后去掉 `pending`、登记 `checks: ['review.methodDim']` 与
`cmds` 补 `episode.preflight`,`gaps: ['G-10']` 保留(记账不因落地一面就清账,
与 SK-12/13 保留 `S-03`、SK-22 保留 `S-05`、SK-28 保留 `S-06` 同口径)。

## 2. 判定输入:已成型的审片报告本身

这一面与其余六面的方向相反。其余面判的是**创作物**(剧本正文 / 参考图组 / 提示词 / 生成凭据 / 时间轴段),
本面判的是**审片这套机制自己的产出**——`ep.lastReview` 与逐镜报告 `s.reviews`。
注入面已经把方法论块送进了两条提示词键,校验面接着问一句:**送进去之后,报告里那几个维度到位没有?**

判定边界因此按注入面那两条键划:

| 提示词键 | 落点 | 本面判什么 |
|---|---|---|
| `review.system` | 单镜三维报告(技术层/匹配层/导演层) | 每一镜有没有一份取得回、且背书当前视频的报告 |
| `review.finalSystem` | 四维成片评审(镜头语言/衔接/景别/节奏) | 四维在不在、每一维有没有分 |

**共性汇总不在本面内**:它的 system 是 `'你是短剧审片总监。'`,没有方法论注入,
不属于本条登记的两条键,所以 `lastReview.common` 缺失一律不报——不拿失配的落点凑判据。

逐镜报告一律按 `perShot[].reportId` 精确取(与 `openEpisodeReport` 同口径),
不取 `s.reviews[0]`:重新单镜审片后最近一条已不是当时那份报告,拿它冒充等于把结论算在别的报告头上。

## 3. 六个码各报报告里哪一处维度没到位

与 SK-22 同一条纪律:报**既有机制自身的失效点**,不复述 `Domain` 已经数过的
未审(`no-review`)/判旧(`review-stale`)/低分(`low-review`)三类计数。

| 码 | 判据 | 失效在哪里(为什么 Domain 与发布门看不出来) |
|---|---|---|
| `cut-dim-missing`(集级) | `lastReview.cut` 缺失,或某一维没有 `score` | 四维那一步 LLM 失败时服务端如实写 `cut: null` 并回执 `cutErr`,**均分照旧**;`Domain.episodeState` 与发布门 G3 只读 `lastReview.avg`,四维整段缺失在它们眼里完全看不出来 |
| `shot-dim-uncovered`(镜级) | 该镜在 `perShot` 里没有条目 | 整集审片会预过滤生成中的镜、评审失败的镜进 `failed[]` 不进 `perShot`,而**快照哈希涵盖全镜集**,报告整体仍读作"当前"——均分是按被审到的那几镜算的,发布门只看这个均分 |
| `shot-report-missing`(镜级) | 条目按 `reportId` 在 `s.reviews` 取不回 | `s.reviews` 只留最近 5 条,后续单镜审片会把它挤出去;此后这一镜只剩一个还在驱动均分的分数,三维评语与方法论校验命中都取不回 |
| `dim-score-stale`(镜级) | 条目的 `videoInputHash` 与该镜当前 `video.inputHash` 不一致,而整份报告未判旧 | 子集复审(`subsetIds`)沿用上次的逐镜条目并**按当前镜集重算 `snapshotHash`**,于是整份读作"当前",可那一镜的分测的是换掉之前的视频 |
| `local-dim-fallback`(镜级) | 取回的报告 `mode === 'local'` | 离线本地模拟评审的分数是 `s.id + s.prompt` 的种子启发式,方法论注入没进过任何模型;而它与真实评分一样计入均分、一样能把主线推过 `Domain.REVIEW_MIN` 与发布门 G3 |
| `check-dim-absent`(集级,带条数) | 取回的报告里没有 `checks` 字段 | 方法论校验命中是浏览器审片路径在报告成型时附的独立字段;缺这个字段的报告"没有命中"不等于判过且干净 |

两条补充口径:

- **集级码只报一条**(`cut-dim-missing` / `check-dim-absent`),`shotId` 空、`order` 为 0,
  与 SK-18 的 `no-progression`、SK-28 的 `no-caption-track` 同形态——整集级的事不逐镜重复报。
- **空 `checks` 数组不算缺字段**。`[]` 是"判过且没命中",`undefined` 才是"没判过";
  判据用 `Array.isArray`,不用真值判断。

## 4. 整份判旧的报告一条也不报

```js
if (!lr || typeof lr.avg !== 'number') return { pass: true, level: 'info', hits: [] };
if (Domain.reviewStaleByScript(ep)) return { pass: true, level: 'info', hits: [] };
```

两道早退各有理由:

- **未审片的集**无判定输入。"这集没审"是 `Domain` 的 `no-review` 与发布门 G3 的既有结论,
  本面再报一遍只是噪音。
- **整份已判旧的报告**同理:剧本/图谱修订或镜头重抽后它已被如实报成"视为未审",
  重审会把整份报告重建,在一份即将作废的报告上挑维度缺失没有意义。
  这道早退还顺带消掉了 `shot-dim-uncovered` 与 `dim-score-stale` 的大部分假阳性——
  镜头集变动、任一镜重生成都会让快照哈希失配,那些情形一律走判旧口径。

判旧一句不在校验层重写:`Domain.reviewStaleByScript` 与分集状态、问题中心、发布门 G3 同一份判定。
源级断言钉住这一点——`js/skills.js` 里必须出现 `Domain.reviewStaleByScript(ep)`,
且不得出现 `snapshotHash !==` / `sourceRev !==` / `reviewSnapshotHashOf` 这类自建比对。

四维维度名同理不写第二份:

```js
const cutDims = () => {
  const shape = wfCore().normalizeCut({});
  return Object.keys(shape).filter(k => shape[k] && typeof shape[k] === 'object');
};
```

维度名的唯一定义在 `js/wf-core.js` 的 `normalizeCut`(`overall` 是整集总评不是维度,按值形状排除)。
`WfCore` 仍以解析器形态取、取值时现解析(浏览器里它晚于 `skills.js` 加载),
契约断言从"只解析一次"改成按取值点比对:现有两处 `wfCore().sizeGap`(SK-18)与
`wfCore().normalizeCut`(SK-24),新增/摘掉取值点即红,裸 `wfCore()`(解析后存起来)同样红。
另一条源级断言禁止四维名在 `skills.js` 里出现字面量(`'natural'` 等四个词一个都不许写)。

## 5. 面表由登记推导:两端 preflight 实现零改动

`js/` 与 `cli.js` 的改动实测:

```
$ git diff 11da95f..HEAD --numstat -- js/ cli.js
1       1       cli.js
1       1       js/commands.js
77      3       js/skills.js
```

`js/skills.js` 删改 3 行(条目上去掉 `pending`、登记 `checks` 与消费点、改写 `note`),
新增 77 行是审片段校验宿主的注释与实现。`js/commands.js` 与 `cli.js` 各 1 行——
**都只是注释**:两端那句"面清单现为 script → subjects → eps → shots → film"在 W28 落地 `gen` 面后
就已经与实况脱节,本槽顺手补齐为七面(注释与代码行为一致是仓库纪律)。
两处 `episode.preflight` 的实现代码一个字符没动。

面表与两端回执自动跟上:

```
落地前 script → subjects → eps → shots → gen → film            六面十四条
落地后 script → subjects → eps → shots → gen → review → film   七面十五条
```

`review` 面按 `STAGES` 步序自动插在 `gen` 与 `film` 之间(不是追加到末尾,也不是登记序)。
主线七步至此**全部在表内**,这也让面表的"副本语义"断言换了哨兵:原来那条用 `push('review')`
证明取表拿到的是副本,现在 `review` 已是真实一面,改用贯通层键 `Skills.CROSS`(它永远不是就绪检查的一面)。

## 6. `cmds` 是条目级登记:审片路径的反查断言怎么收口

本槽唯一需要改判据(而不只是抬数字)的既有断言在这里,值得单说。

`js/review.js` 的 `shotChecks` 是镜级汇总(入口对象包 `{p, s}`,命中还要按 `h.shotId` 过滤)。
既有断言按登记侧反查:凡登记 `episode.smartReview` 为消费点的已落地校验条目,其面必须在这处汇总里。
问题是 `cmds` 是**条目级**登记而不是按面登记——SK-24 那条 `episode.smartReview` 记的是
**注入面**的真实消费点(`reviewBlock`/`tplReview` 进评审提示词),它的校验面走的是就绪检查。
按原判据,SK-24 校验面一落地就会要求 `shotChecks` 里出现 `Skills.check('review'`,
而那处入口拿不到 `ep.lastReview`,加进去只能恒回空——等于为了满足断言挂一个假消费点。

收口办法是把反查判据按**作用面**收窄,并补上另一向,判据只增不减:

- 反查覆盖 `covers` 含 `shots` 的条目(SK-09/SK-10/SK-12 三条,实测都在):
  只有作用面覆盖到分镜载体的面,才在镜级汇总里拿得出结论。
- 新增另一向:登记了 `smartReview` 却覆盖不到分镜载体的已落地校验面,
  **必须在就绪检查面表里有出口**(`preflightStages()` 含其 `stage` 且 `cmds` 含 `episode.preflight`)。
  两处都不消费的面过不去,漏接照样先红。

两条注入面登记一律照实保留:去掉 `episode.smartReview` 会让注入面的真实消费点从记账上消失,
那是拿"改记账"换"过断言",与本目录的诚实位纪律相反。

## 7. 只报不拦的取证

- **不进阻塞项**:浏览器端沙箱真跑 `Commands.execute('episode.preflight')`,断言七面并集里有
  `review.methodDim` 且 `r.ok/r.status` 不受本面影响;夹具那一集尚无审片报告,本面如实回空 `info`
  (即"没有报告"不冒充"维度缺失")。
- **不改发布门 G3**:源级断言 `js/release.js` 仍是
  `hasReview = ep => ep.lastReview && typeof ep.lastReview.avg === 'number'`——
  有无审片记录、判旧、达标线三处口径逐字不动;`release.js` 也不得引用 `review.methodDim`。
  发布门的方法论门仍是 SK-29 的未落地面,断言里一并钉住它的 `pending` 不许被顺手清掉。
- **不改审片动作**:`js/review.js` 不得出现 `review.methodDim` 或 `Skills.check('review'`;
  纯函数断言对整集(含报告)做 `JSON.stringify` 前后比对——校验项不得回写任何报告字段。
- **未接问题中心**:`js/issues.js` 同在上面那条源级断言里。发布门 G2 只数问题中心的高/中危,
  不进问题中心即不可能改门禁状态——这是"不拦发布门"最直接的证明。
- **零计费**:`episode.preflight` 仍是 `risk: 'read'`,判定纯本地字段读取,零 LLM。

## 8. 变异验证

每条变异单独施加,`node tests/unit.js` 全量跑,记的是**指名转红的用例名**而不只是数字。
未施加变异时实测 **348/348 全绿**,下表的红都是变异引入的。

| 变异 | 转红 | 说明 |
|---|---|---|
| 条目退回 `pending: ['check']` 并摘掉 `checks` | **13 条**:六条 `methodDim` 行为用例 + 面表两条 + 就绪检查并集一条 + 「不挂假出口」一条 + 「skill 索引引用键单源」一条 + 审片报告消费点一条 + README 数字对账一条 | 退回未落地时行为面与记账面同时红,不会静默变回六面 |
| 只摘掉 `cmds` 里的 `episode.preflight` | **5 条**:面表两条 + 就绪检查并集一条 + 消费点一条 + 审片报告消费点(另一向)一条 | 实现还在但没登记消费面=面表少一面;第 5 条正是本槽新加的另一向断言接住的——两处都不消费即红 |
| 摘掉整份判旧早退(`Domain.reviewStaleByScript`) | **2 条**:早退用例 + 消费点用例的单源断言 | 判旧的报告开始产出结论即红 |
| 四维维度名写死成字面量数组 | **1 条**:`cut-dim-missing` 用例(三条源级断言同时不满足) | 写第二份四维名即红 |
| 逐镜报告改取 `s.reviews[0]`(不按 `reportId`) | **1 条**:`shot-report-missing` 用例 | 拿最近一条冒充当时那份报告即红 |
| `check-dim-absent` 改用真值判断(空数组也算缺字段) | **1 条**:`dim-score-stale`/`local-dim-fallback`/`check-dim-absent` 用例 | 把"判过且没命中"误报成"没判过"即红 |
| 校验项里回写 `ep.lastReview.cut = {}` | **1 条**:纯函数用例 | 报告字段被动到即红 |

「不挂假出口」那条(`contract` 套件)仍是半吊子状态的兜底:它断言 `pending` 含 `check` 的条目
`checks` 必须为空、且该步 `check()` 结论数等于已落地校验项数——**落地一面而忘了去 `pending`**
与**去了 `pending` 而没登记实现**两种状态都过不去。

## 9. 口径抬档记录(与 W23 的文档数字对账契约配套)

| 位置 | 抬档 |
|---|---|
| README 架构框「CHECKS 已落地 N 条」 | 十四 → 十五,并补审片面那段判据 |
| README 就绪检查回执「现有 N 条」与面清单 | 十四 → 十五,面清单补 `review` |
| README / 本目录 README 的「N 面 N 条」 | 六面十四条 → 七面十五条 |
| README 单元测试断言数 | 342 → 348(本槽新增 6 条用例) |
| README 校验项判据段与测试覆盖段 | 各补审片面一段(六个码、单源取值点、早退口径) |
| 本目录 README 摘要「校验宿主 N 面齐了」 | 六面 → 七面,补审片面一项;G-10 那条补"反向那一半起步"的说明 |

## 10. 剩余与未纳入

- **`G-10` 不清账**。本槽落的是"维度在不在"这一层;四维评语写得对不对、这一镜该不该是这个分
  属语义判断,仍归 LLM 审片(G-10),故 `gaps: ['G-10']` 保留。
- **未接问题中心**。接进去要决定归哪一档危险级、与 `Domain` 已有的"未审/判旧/低分"三条怎么去重,
  是独立一轮的事;本槽按"只报不拦、先接一个消费点"的最小边界收口。
- **未接整集报告视图**。`openEpisodeReport` 是本面结论最自然的展示位(判的就是那份报告),
  但那要动展示区块与导出格式,同样单列一轮。
- **`check-dim-absent` 指向的是一处真实的双端差异**:服务端 `/api/wf/smart-review` 写的报告
  没有 `checks` 字段(镜级方法论命中只有浏览器审片路径在附)。本槽只如实报出来,
  不在服务端补该字段——那是审片路径的改动,不属于校验面。
- **SK-20 / SK-29 仍 `pending`**。SK-20 由并行槽处理;SK-29 的落点是发布门,与本轮边界冲突。
- `node tests/e2e.js` 按仓库纪律未跑(需用户明确要求)。本槽不含合并。

## 11. 与并行槽的预期重叠

- **W33(SK-20 镜头动态感准入)**:它落 `shots` 面,`shots` 面本就在表内,合并后面表仍含
  `review` 与它自己那一面;冲突集中在 `js/skills.js` 的 `CHECKS` 区块与 `tests/unit.js` 的
  `skillsTests` 数组尾,预计 add/add 取并集,合并后只需把「N 面 N 条」的**条数**再抬一档。
- **W34 集成**:本槽从 `w29` head 起支,而 `w34` 已含 `w29`,故合入只是本槽这几个提交的重放,
  不是大合并。`README.md` 那两处长行按 W25 记录的"取一侧 + 按 word-diff 折回对侧"口径处理。
- **文档数字对账**:CHECKS 条数、面数、断言数三口径分开取,任一并行槽改动后由断言各自钉住,
  互不覆盖——合并后必须重跑 `node tests/unit.js contract` 重对齐这几个数。
