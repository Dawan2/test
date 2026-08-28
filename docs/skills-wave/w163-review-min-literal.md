# W163 · `Domain.REVIEW_MIN` 自称单源,而智能审片闭环冻着第二份达标线字面

一句话:`js/domain.js` 里 `D.REVIEW_MIN = 7` 的注释写着
「分集状态与主线审片步骤共用的唯一常量」,而 `js/produce.js` 的智能审片闭环里
是 `if (r.score >= 7) { pass = true; passCnt++; s.confirm = true; }` ——
一份就地冻住的字面。两份数今天恰好相等,故所有断言全绿;
**把达标线整体挪一格,两份就分叉,而分叉的后果是同一集上两条互相打架的结论**。
本槽把这份字面连同同类的另外八处一并改成现取单源,并加行为面与源级两层判据接住它。

## 1. 病灶:两份数恰好相等,判据就量不出来

改之前,`js/produce.js`:

```js
async function autoSmartReview(p, ep, main, shots, quiet) {
  const maxRetry = Domain.reviseRetryLimit(ep.sbConfig.maxRetry);   // 收敛次数已是单源(W150)
  …
  dock.say(`达标线 7.0 分 · 不达标先按问题修订提示词再重生成(每镜最多 ${maxRetry} 次)…`);
  …
  if (r.score >= 7) { pass = true; passCnt++; s.confirm = true; say(`… 达标(已自动确认)`); }
```

同一个函数里,**重来几轮**取的是 `Domain.reviseRetryLimit` 单源,
**达标不达标**却是就地一个 `7`。收敛次数那一面在 W150 收过、达标线那一面没人收,
理由不难猜:两份数一直相等,谁也没被它咬过。

### 1.1 分叉的后果:同一集上两条打架的结论

`Domain.episodeState` 的状态推导是有序的(`js/domain.js`):

```js
else if (counts.unconfirmed > 0) { status = 'needs_review'; action = { key: 'confirm', … }; }
else if (reviewAvg !== null && reviewAvg < D.REVIEW_MIN) { status = 'needs_human'; action = { key: 'review', … }; }
```

「待确认」排在「待人工」前面。闭环判某镜达标时会替用户把 `s.confirm` 置真,
`counts.unconfirmed` 因此归零,状态就落到均分那一支上。于是达标线一旦分叉:

- 闭环按旧线判 7 分**达标**,替用户确认掉,面板上写「✅ 7.0 分,达标(已自动确认)」;
- `Domain.episodeState` 按新线判这一集 `needs_human`,推荐动作是「审片修订」;
- 发布门 G3 的默认阈值随之 fail。

**系统替你确认了** 与 **该转人工** 同时成立,而用户手上只有一句「已自动确认」。

### 1.2 基线上量一遍:整体挪一格,全套照旧全绿

在 `8507194` 上做最小变异——只改常量,连同两句钉住 7 的断言同轮改:

```diff
-  D.REVIEW_MIN = 7;                                   // js/domain.js
+  D.REVIEW_MIN = 8;
-    assertEq(sb.Domain.REVIEW_MIN, 7);                // tests/unit.js
+    assertEq(sb.Domain.REVIEW_MIN, 8);
-    assert(dom.includes('D.REVIEW_MIN = 7;'),         // tests/unit.js
+    assert(dom.includes('D.REVIEW_MIN = 8;'),
```

实测 `node tests/unit.js` **524/524 全绿**、`node tests/integration.js` **141/141 全绿**。
`js/produce.js` 一个字没改,闭环仍按 7 判达标——**产品口径挪了一格,闭环没跟上,一条判据都不响**。
这就是"自称单源"的实际含金量:单源那一句是注释写的,不是判据守的。

### 1.3 摊开数:同一条达标线在九处各写了一份

顺着 `score`/`avg` 与达标数的比对扫一遍(排除 `js/vendor/`),
除了那一处确认闸,同一条线还写在:

| 位置 | 原写法 | 它判的是 |
|---|---|---|
| `js/produce.js` 智能审片闭环 | `r.score >= 7` → `s.confirm = true` | **确认闸**:达标即替用户确认 |
| `js/produce.js` 闭环开场文案 | `达标线 7.0 分` | 告诉用户这一轮按哪条线判 |
| `js/produce.js` 跑批中心 | `ep.lastReview.avg >= 7 ? 'green' : 'yellow'` | 整集均分达没达标 |
| `js/review.js` 单镜报告 | `r.issues.length && r.score < 7` | **重抽入口**:达标就不给「按意见修订并重抽」 |
| `js/review.js` 整集报告 | `score < 7` / `score >= 7` ×3 | 待返工档计数、进度条低分色、分数色阶 |
| `js/sb-views.js` 镜头状态条 | `rv.score < 7` | 低分标与「建议重抽」提示 |
| `js/sb-views.js` 版本与审片 | `lastReview.score >= 7` | 最近审片的达标色 |
| `js/agent-ops.js` 对话流 | `达标线 7.0` / `低于 7 分` ×2 | 播报给用户的达标线 |
| `js/wf-core.js` 协作记忆回流 | `W.MEM_LOW_SCORE = 7` | 回流文案里的**待返工镜数** |

`W.MEM_LOW_SCORE` 那一处最值得单说:它不是随手写的裸数,是一条**登记过的常量**,
注释还写明「与审片报告重抽入口、发布门 G3 默认阈值同数」——
把"我知道我在抄"写进注释,并不能让两份数在挪动时一起走。

## 2. 处置:九处一律现取,不留第二个名字

九处全部改成 `Domain.REVIEW_MIN`。`Domain` 在这五个文件里都已在场
(`index.html` 里 `js/domain.js` 排在第 15 行、最前;`js/wf-core.js` 顶上就是
`const Domain = isNode ? require('./domain.js') : root.Domain`),不必新接线。

确认闸那一句:

```js
if (r.score >= Domain.REVIEW_MIN) { pass = true; passCnt++; s.confirm = true; say(…); }
// 审片达标 = 系统替你确认(镜头确认闸联动);达标线取 Domain.REVIEW_MIN 单源,与 episodeState/主线审片步骤同一份
```

文案那两处按常量现算,不写死小数:`达标线 ${Domain.REVIEW_MIN.toFixed(1)} 分`。

`W.MEM_LOW_SCORE` **删掉而不是改成 `= Domain.REVIEW_MIN`**:留个别名等于留第二个可被就地改写的名字,
而它全仓只有一个使用点(`memFeedback` 里数待返工镜),改成在使用点现取更短也更难绕开:

```js
/* 待返工镜的分数线不在本层另立一份:一律现取 Domain.REVIEW_MIN(与审片报告重抽入口、
 * 智能审片闭环的确认闸、分集状态与主线审片步骤同一个常量),本层只读不改门禁口径 */
…
const low = per.filter(x => x && +x.score < Domain.REVIEW_MIN).length;
```

### 2.1 有意不收编的两处,以及为什么

**发布门 G3 的 `releaseMinReviewScore`(`js/release-core.js` 的 `DEFAULT_MIN_SCORE = 7`)不动。**
它与达标线默认同数但不是同一件事:达标线是双端可用、不读 Store 的领域常量,
G3 那份是用户可调严的偏好设置(`Release.setMinReviewScore` 写回 settings、CLI 有 `--min-score`)。
这一条自 W3 起就是有意的两份,任务口径也明写不抬发布门。

**审片提示词里的评分标准三档(`js/wf-core.js` 的 `评分标准:≥8.5 优秀,7~8.5 良好,<7 需返工`)不动。**
那是给模型读的打分刻度,描述的是 0–10 分该怎么给,不是平台收不收这一镜;
它也不参与任何判定——没有一处代码读它。真要派生也只能整段派生
(只把 `<7` 换成变量会让三档读成「≥8.5 优秀,7~8.5 良好,<8 需返工」这种自相矛盾的刻度)。

审片报告直方图里的 `8.5`(优秀)与 `8`(色阶)同理留着:那是评分档,不是达标线。
本槽只把**达标线那一档**(待返工/低分那条边界)改成现取。

## 3. 判据:行为面一条、源级一条

### 3.1 行为面(`produce` 套件)

`autoSmartReview 达标线现取 Domain.REVIEW_MIN:压线达标、常量挪一格闭环跟着挪(不再冻一份字面)`

判据有意**不写死数字**——压线那一分现取 `sb.Domain.REVIEW_MIN`,
再在运行期把沙箱里的常量挪一格看闭环跟不跟:

- 压线那一分:`pass=1`、`s.confirm === true`;
- 差半分:`pass=0`、`manual=1`、`s.confirm` 不被置真,分集状态如实停在 `needs_review`;
- `sb.Domain.REVIEW_MIN = MIN + 1` 之后同样那一分:`pass=0`、不确认。

自相矛盾态单独立了一个谓词,因为它才是这个缺陷的形状:

```js
const selfContradicts = ep => ep.shots.every(s => s.confirm) &&
  sb.Domain.episodeState({ id: 'p1', subjects: [] }, ep, true).status === 'needs_human';
```

"全镜都被闭环确认掉"与"分集状态判该转人工"同时成立即红。
只断言 `status !== 'needs_human'` 是不够的:不达标那一路本就该停在 `needs_review`
(确认闸排在均分那一支之前),那样写会把正常态也判成异常。

`loadSbViews()` 同轮补了一行 `loadFile(sb, 'domain.js')`(按 `index.html` 的顺序排在最前)——
状态条改成现取常量之后,沙箱里没有 `Domain` 会直接 `Domain is not defined`。

### 3.2 源级(`domain` 套件)

`REVIEW_MIN 消费点零分叉(源级):达标判定与确认闸不得再冻第二份达标数字面`

行为面那条要等到常量真被挪动才暴露;源级这条守的是"再写一个字面就红",不必等。
判据**分两档**,因为这几处的数字口径不一样宽:

- **严格档**(`js/produce.js` / `js/sb-views.js` / `js/agent-ops.js`):
  这些文件里 `score`/`avg` 一律不许跟裸数字比,达标线文案也不许出现写死的数字
  (`达标线 7` 与 `低于 7 分` 两种形态各一句)。这三份文件里没有别的评分档,可以一刀切。
- **分档档**(`js/review.js` / `js/batchops.js` / `js/wf-core.js`):
  那里另有 `8.5`(优秀)与 `8`(色阶)这类与达标线无关的评分档,一刀切会误伤。
  故只禁**达标线那个数本身**,而这个数**现取 `Domain.REVIEW_MIN` 拼进正则**:

```js
const forked = new RegExp('(?:score|avg|Score|Avg)\\s*(?:>=|<=|<|>)\\s*' + N + '(?!\\.\\d)', 'g');
```

常量挪一格,判据跟着挪——判据自己不能是第十份字面。
`(?!\.\d)` 那个否定预查是必需的:`\b` 在数字后面遇上 `8.5` 里的 `.` 照样成立,
不挡一下,达标线哪天挪到 8 就会把「≥8.5 优秀」误报成分叉。

六个文件另各要一句"确实现取了单源"(`s.includes('Domain.REVIEW_MIN')`),
以及一句钉住确认闸那一整句的形状:

```js
assert(/r\.score >= Domain\.REVIEW_MIN\) \{ pass = true; passCnt\+\+; s\.confirm = true;/.test(read('js/produce.js')));
```

最后是**反向那一向**(与 W136/W150 立护栏的写法同):
有意不收编的两处此刻确实还各是各的,哪天顺手收编了红在这里、要改的是上面 §2.1 那段话,
不是把断言删掉——

```js
assert(read('js/release-core.js').includes('DEFAULT_MIN_SCORE = ' + N));   // 发布门仍是另一份可配阈值
assert(/评分标准:≥8\.5 优秀/.test(read('js/wf-core.js')));                 // 三档仍是提示词正文
```

### 3.3 判据侧也有一份字面:`低于 7 分`

`agent-ops` 套件那条 `dynamicChips` 用 `/低于 7 分/` 正则钉住对话流推给用户的低分 chip 文案。
那句文案本槽改成了现取常量,判据若还写死 7,常量挪动时它会**假红**——
红的不是"文案错了"而是"判据没跟上"。同轮改成现取:

```js
const lowLine = new RegExp('低于 ' + require('../js/domain.js').REVIEW_MIN + ' 分');
```

这一处不是顺手改的:判据自己是第 N 份字面时,它守的那条线就多了一个要人工同步的地方,
而本槽收的正是这个。

### 3.4 既有那两句钉住 7 的断言

`assertEq(sb.Domain.REVIEW_MIN, 7)` **留着**:它钉的是产品口径(达标线就是 7 分),
是这个数字唯一该被人手同轮改的地方。

`assert(dom.includes('D.REVIEW_MIN = 7;'))` 改成
`assert(dom.includes('D.REVIEW_MIN = ' + Domain.REVIEW_MIN + ';'))`:
它钉的是"达标线仍登记在 Domain 一处",与值是几无关。
写死 7 只会让它变成第二个要人工同步的数,而这正是本槽在收的东西。

改完之后,把达标线整体挪一格要动的是**两处**:`js/domain.js` 的常量,
与 `tests/unit.js` 里那一句产品口径断言。

## 4. 变异实测

| # | 变异 | 结果 |
|---|---|---|
| 1 | 退回基线:`r.score >= Domain.REVIEW_MIN` 改回 `>= 7` | 红 2 —— 行为条报「达标线挪高一格后,原压线分不再达标」,源级条报「js/produce.js 不得再按达标数 7 自判一遍达标」 |
| 2 | 只退 `js/sb-views.js` 的 `rv.score < Domain.REVIEW_MIN` | 红 1 —— 源级条点名 sb-views,行为条不动(它只测闭环) |
| 3 | 只退 `js/review.js` 的重抽入口 `r.score < 7` | 红 1 —— 分档档那一句点名 review.js |
| 4 | 把 `W.MEM_LOW_SCORE = 7` 加回 wf-core 并让 `memFeedback` 读它 | 红 2 —— 回流接线那条报「待返工线不在 wf-core 另立一份常量」与「应现取 Domain.REVIEW_MIN 判低分」 |
| 5 | 闭环文案改回写死的 `达标线 7.0 分` | 红 1 —— 严格档的文案那一句 |
| 6 | 发布门 `DEFAULT_MIN_SCORE` 改成 8(不再与达标线同数,收编成派生同理) | 红 1 —— 反向那句(动它之前先改 §2.1 的记账) |
| 7 | 把提示词三档改成派生 | 红 1 —— 反向那句 |
| 8 | **对照项**:`D.REVIEW_MIN` 7 → 8,只同轮改那一句产品口径断言 | 红 2,**九个消费点一个没红** —— 详见下 |

第 8 条是对照项不是凑数:它与 §1.2 那次变异**是同一手**。
基线上这一手 524/524 全绿而闭环停在 7(缺陷);现在同一手红 2,而**红的两条都不是消费点没跟上**:

- `produce · autoSmartReview:不达标自动重生成一次后达标(pass1/retry1)`
  —— 该用例的夹具是 `sh0: [5, 7.5]`,7.5 是当年按「一个能过线的分」挑的**测试数据**。
  达标线挪到 8,这个夹具就不再表达它原本的意思。**本槽有意不改它**:
  它同时也如实记着"今天 7.5 分算过",挪线时该由挪线的人重挑,而不是本槽替他改成派生。
- `domain · REVIEW_MIN 消费点零分叉(源级)` 报
  `js/review.js 不得再按达标数 8 自判一遍达标:期望 0,实际 2`
  —— 那两处是审片报告的**色阶** `score >= 8`(「良好」以上给绿),与达标线本来无关,
  只是挪到 8 之后**撞了号**。判据在这里报红是对的:两条线同数时,
  该当场重判那个色阶算哪一档,而不是假设它跟着挪。

换句话说,"整体挪一格"要动的地方从**九处消费点 + 常量**变成了
**常量 + 一句产品口径断言 + 两处要重判的测试数据/色阶**,
而后两类都会当场报红点名,不再是静默分叉。区分"这次全绿是修好了"与
"这次全绿是没人在看"的,不是第 8 条本身,而是第 1 条——
基线上第 1 条根本不存在(那时字面 7 就是实现)。

## 5. 本槽没做的事

- **不抬发布门**:`js/release.js` / `js/release-core.js` 的 G3 判据、阈值、默认值一字未动,
  也没让任何门去看 `p.script`。
- **不摘 `gaps`**:`Skills.gaps()` 仍 20 键,`G-03` 与 SK-25 的 `pending`/`note` 一个字没改。
  本槽收的是达标线这个**数**的单源,不是 `G-03` 那两个面(重抽面 W131 已收、收敛次数 W150 已收、
  仍欠的形态面——浏览器逐镜重试 vs CLI 整集分轮——本槽一样没碰)。
- **不动提示词字节**:`js/wf-core.js` 的审片提示词正文逐字节未变(评分标准三档见 §2.1)。
- **不动计费与真实/离线行为**:`Tasks.run` 链路、退费、离线占位一律未碰。
- **服务端与 CLI 侧未见同类字面**:`server.js` / `cli.js` 扫下来只有 `--min-score` 与
  `releaseMinReviewScore` 缺省(都归发布门)与 `rv.score >= 90`(分镜五角色评审,另一条线,
  与审片达标线无关),故这一轮两端零改动。

## 6. 数字(live 现取)

| 套件 | 前 | 后 |
|---|---|---|
| `node tests/unit.js` | 524 | **526** |
| 其中 `contract` | 114 | 114(未动) |
| `node tests/integration.js` | 141 | 141(未动,复跑全绿) |
| `tests/cli.smoke.js` | 107 | 107(未动) |
| 记账件份数 | 170 | **171**(含本文) |

三套件棘轮的 `FLOOR`、记账件那格 `FLOOR`、`README.md` 明写的单元数与
`docs/skills-wave/README.md` 明写的份数一并按 live 抬。

`README.md` 两处写死的「达标线 7.0」同轮改成 `Domain.REVIEW_MIN`——
散文里的第十份字面同样会与常量分叉,而它还是用户与后来者读到的那一份。

## 7. 交接

1. **要挪达标线**:改 `js/domain.js` 的 `D.REVIEW_MIN` 与 `tests/unit.js` 里
   `assertEq(sb.Domain.REVIEW_MIN, …)` 那一句——**九个消费点一处都不必动**。
   跑一遍会再报两类红,两类都要人来判、不要把断言放宽(实测见 §4 第 8 条):
   一是按旧线挑的测试数据(现知一处:`sh0: [5, 7.5]` 那个夹具),该重挑一个能表达
   「不达标 → 重抽后达标」的分;二是审片报告的 `score >= 8` 色阶与新达标线撞号,
   该当场重判那个色阶算哪一档。
2. **要给达标线加消费点**:直接读 `Domain.REVIEW_MIN`,不要在调用侧兜一份缺省或就地比数字;
   新文件若属"达标判定与确认闸"那一圈,把它加进源级那条的 `STRICT` 表(不是 `BANDED`)。
3. **要收编发布门那份可配阈值或提示词三档**:先改 §2.1 的记账,再改反向那两句断言——
   它们本来就是为"哪天真收编了"设的。
4. **`G-03` 仍欠的是形态面**:浏览器 `autoSmartReview` 逐镜重试、CLI `episode.produce` 整集子集分轮,
   两端闭环结构不同构。本槽把两端共用的**达标线**收成了一份,但没有、也不打算替那一面记账。
