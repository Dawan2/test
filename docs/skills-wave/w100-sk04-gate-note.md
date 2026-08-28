# W100 · SK-04 仍欠段的门号订正:素材产出判定面归 G4/G5/G6 + `failed-shots`,不归 G3/G7

> 基线 `origin/cursor/w95-integration-7c2e @ 6643e12`,落地分支 `cursor/w100-sk04-gate-note-4fe0`。未合并 W93–W99。
> 只碰 `js/skills.js`(SK-04 一条 `note` 的括注)、`tests/unit.js`(+1 条用例)、`README.md`(单测数)、本记账件与目录索引。
> 不改发布门判据、不抬门、不新增回流、不动 `memWrite`、未删测,`gaps` 一字未动。

## 1. 现场:错在哪一句

`js/skills.js` 的 SK-04(`core.memoryDual`)仍欠段基线原文:

```js
+ '仍欠一处覆盖余量:生成与合成两步没有可判定的结构化结论可回流(素材产出的判定面归发布门 G3/G7),'
```

这句括注是给读者指路的("这两步的结论不回流不是漏做,判定面在别处"),但**门号指错了**。逐个回实现核对:

| 门 | 判什么(判据出处) | 判素材产出? |
|---|---|---|
| G3 `g3-review` | 审片均分 ≥ 阈值,无记录/判旧视为未审(`js/release.js` / `js/release-core.js`) | 否——判的是审片记录 |
| G7 `g7-compliance` | 项目级敏感词全量 `Compliance.checkText`,命中 warn 可经 HumanReview 复核(`js/release.js`) | 否——判的是合规文本;且**不在 headless 七门内**(`ReleaseCore.gates` 只出 G1/G3/G4/G5/G6/G9/G10) |
| G4 `g4-stale` | 素材过期镜 = 0 | **是** |
| G5 `g5-unconfirmed` | 未确认镜 = 0 | **是** |
| G6 `g6-failed` | 失败镜 = 0 | **是** |

三门的 `counts` 都从 `Domain.episodeState` 的 `stale`/`unconfirmed`/`failed` 聚合,正是"生成与合成两步产出得怎么样"这件事。除发布门外还有一处实时判:问题中心 `js/issues.js` 的 `kind: 'failed-shots'` 高危条目(带 `shotIds` 子集重生成),以及主线中段流程模板 `js/flow-tpl.js` 把 `failed-shots` 列为断点码。

这句的原意(素材产出有人实时判、不必再回流一份噪音副本)是对的,错的只是门号——照它去看 G3/G7 会发现那两门根本不数镜头,读者要么以为记账写错了,要么会去 G3/G7 上加素材判据。

## 2. 改法:只换括注,锚点与结论都不动

```js
+ '仍欠一处覆盖余量:生成与合成两步没有可判定的结构化结论可回流'
+ '(素材产出的判定面归发布门 G4 过期镜 / G5 未确认镜 / G6 失败镜与问题中心 failed-shots;'
+ 'G3 判审片均分、G7 判合规敏感词且不在 headless 七门内,两者都不判素材产出),'
```

三件事有意保持不变:

- **仍欠段的两处锚点 `生成与合成` / `解析向导` 原样留住**(既有断言 `['生成与合成','解析向导']` 靠它们判"这条余量还在",W98 已写明这条不许动)。
- **`gaps` 与 `pending` 一字未动**:`G-02` 仍在 `gaps` 里(关联索引口径),`Skills.gaps()` 只投影 `gaps` 字段,故本槽对投影零影响。
- **不新增回流**:这条余量本身仍欠着——生成与合成两步依旧不写记忆桶,`WfCore.memWrite` 与六处写入点一行未碰。本槽订正的是"指路指错了",不是"把路补上"。

误记的门号也写进了正文而不是只删掉:只删 `G3/G7` 三个字,下一个读到这条的人还会重新去猜"那到底归哪门";写明 G3/G7 各自判什么,才是把这次核出的结论留在原地。

## 3. 用例:门号不自证,逐个回实现核对

新增 1 条,落在 `skills` 套件里 `记账对齐:infra 三条…` 那条之后(同为 SK-04 的记账面):

**`记账对齐:SK-04 仍欠段的素材判定面点名真实门号(G4/G5/G6 + failed-shots,不记到 G3/G7 头上)`**

| 断言 | 钉住的事 |
|---|---|
| 仍欠段仍含 `生成与合成` / `解析向导` | 本条只订正门号,不许顺手动锚点 |
| `js/release.js` 里 `gate('g4-stale'` / `gate('g5-unconfirmed'` / `gate('g6-failed'` 三门都在,且仍欠段逐个点名 `G4`/`G5`/`G6` | **门号回实现核对**:门被删/改名时记账同步红,而不是记账自己跟自己对 |
| `js/issues.js` 里 `kind: 'failed-shots'` 在,且仍欠段点名 `failed-shots` | 点名的实时判定必须真在 |
| 仍欠段写明 `G3 判审片均分` / `G7 判合规` | 误记的门号不许"删掉了事",要留下正解 |
| `note` 里不得再出现 `判定面归发布门 G3/G7` | 变异位:原句写回来当场红 |
| `ReleaseCore.gates(...)` 实跑出的门码里没有 `g7*` | "G7 不在 headless 七门内"这句也回实现核对,不是散文断言 |

`js/release.js` 的门禁判据、`overall` 计数、阈值一律没碰,本条只读源码不改源码。

## 4. 变异实测

| 变异 | 实测 |
|---|---|
| 把 `note` 改回 `(素材产出的判定面归发布门 G3/G7)` | **红 1 条**:`skills · 记账对齐:SK-04 仍欠段的素材判定面点名真实门号…` → `SK-04 的仍欠段须点名判素材产出的门:G4`(全量 461/462) |

复原后 462/462 全绿。

## 5. 复核方式

```
git checkout cursor/w100-sk04-gate-note-4fe0
node --check js/skills.js && node --check tests/unit.js   # 通过
node tests/unit.js          # 462/462 PASS(基线 461,新增 1 条用例)
node tests/integration.js   # 126/126 PASS(与基线同:未碰 server.js 与任何端点)
node tests/cli.smoke.js     # 95/97;两处失败「未登录 whoami」「llm --json mock 链路」与 master 同名(master 实跑 51/53,同名同数)
node -e "const S=require('./js/skills.js');
const n=S.byId('core.memoryDual').note; console.log(n.split('仍欠')[1]);
console.log(Object.keys(S.gaps()).length, S.gaps()['G-02'].join(','));"
```

`node tests/e2e.js` 按仓库纪律未跑(需用户明确要求)。本槽不含合并、未开 PR。

## 6. 与并行分支的关系

W93–W99 未合并。改动面:`js/skills.js`(SK-04 的 `note` 一处括注)、`tests/unit.js`(+1 条用例)、`README.md`(单测数)、`docs/skills-wave/`(本件 + 索引行)。

- **`js/skills.js` 的 SK-04**:若并行槽也动这条 `note`,按段取并集,仍欠段里 `生成与合成` / `解析向导` 两个锚点与本槽新加的 `G4`/`G5`/`G6`/`failed-shots`/`headless 七门` 五个锚点都要留住;合并后若哪一处余量真被收掉,先改实现再改这段,不要只删字。
- **`tests/unit.js`**:新用例在 `skills` 套件、紧跟 `记账对齐:infra 三条…`;若并行槽插在同一处,两侧全留(名字不重)。README 的单测数一律按合并后实跑重算,不取任一侧。
- **W98 的否决结论仍成立**:生成与合成两步不新增回流(跑完手里只有"成功 N 个失败 M 个",而这个数 G4/G5/G6 与问题中心已经在实时判,回流一份是噪音副本)。本槽只订正门号,不重做那次被否的回流。

## 7. 交接

1. **这条余量仍欠着**:SK-04 的自动沉淀面覆盖主线六个闭环,生成与合成两步与浏览器剧本解析向导那条路径都还没有可判定的结构化结论可回流。要动这一面,先看 W98 的否决理由,别把"实时已判的计数"再抄一份进记忆桶。
2. **历史记账件里的旧门号不追改**:`w61-sk26-front-writeback.md` / `w68-integration-log.md` 引的是各自那一刻 `note` 的原文,属当时实况的留痕;门号的正解以本件与 SK-04 的 `note` 现文为准。
3. **记账里点门号的写法建议照本槽这层做**:门号一律回 `js/release.js` / `js/release-core.js` 的门定义核对,别在记账用例里手写第二份门号表——门改名或门被摘掉时,只有回实现核对的那种断言会红。
