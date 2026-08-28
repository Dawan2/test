# W168 · 流程条「审片」把用户送到一个开口说「去拆镜」的集

一句话:`js/pipeline.js` 的 `hashOf('review')` 挑集只问"有没有达标分"(`unRvEp()` 判
`reviewAvg === null || reviewAvg < REVIEW_MIN`),而缺正文 / 未拆镜 / 分镜表判旧的集**一律** `reviewAvg = null`,
于是排在前面的这种集把用户接走——落地页开口说的却是「编写剧本」「生成分镜」「重新拆镜」。
本槽把这道门槛收进 `Domain.episodeState().reviewGate` 一处出结论,导航侧读它,**发布门与 `gaps` 一字未动**。

W165(在飞的 `cursor/w165-review-issues-align-e7a0`)收的是同一道门槛的另外两个消费面
(流程条 `review` 步的三档集数、问题中心的分集审片条目),本 HEAD 还没有它,故本槽自己把
`reviewGate` 落进 `episodeState`——落法与那支**逐字可对**,理由与合并口径见第 5 节。

## 1. 病灶:`reviewAvg = null` 有两种来源,挑集时分不出来

改之前那一行:

```js
/* 待审集(未审 / 记录判旧 / 低于达标线,与 Domain 主线审片步骤同口径) */
const unRvEp = () => eps.find(e => { const st = Domain.episodeState(p, e, _online()); return st.reviewAvg === null || st.reviewAvg < Domain.REVIEW_MIN; });
```

`reviewAvg` 是 `null` 有两种意思,而这一行读它时分不出来:

- **这一集审得了、只是还没审**——正是审片这一步该去的集;
- **这一集当下审不了**——缺正文(整集审片没有输入)、未拆镜(没有可审的镜)、分镜表判旧
  (那份报告审的不是当前分镜表,`Domain.reviewStaleByScript` 已经把分数判掉,`reviewAvg` 随之 `null`)。

第二种集的主线断点落在上游那几步,`episodeState` 自己也是这么说的(`status` 分别是 `blocked` / `ready` / `stale`,
`action` 分别是编写剧本 / 生成分镜 / 重新拆镜)。**同一集,导航说该去审片,分集状态说该去上游**——
一道门槛两个说法,而且两个说法在同一个页面上:流程条的「审片」标签点过去,落地页顶上就是那句相反的推荐动作。

更刺眼的一格是**手上留着一份低分报告**的集:`lastReview.avg = 5` 而分镜表已判旧,
改前那一行走的是 `reviewAvg < REVIEW_MIN` 这一支(判旧后 `reviewAvg` 是 `null`,走的其实是前一支,结论一样),
挑中它,而它的低分审的是上一版分镜表——按这份分数去"审片修订"改的是已经不存在的镜。

### 1.1 实测(五集夹具,改前 / 改后)

夹具:`ep1` 达标(`avg 8`)、`ep2` 缺正文、`ep3` 未拆镜、`ep4` 分镜表判旧且留着 `avg 5`、`ep5` 三关都过没审过。

| | 改前 | 改后 |
|---|---|---|
| `Pipeline.hashOf(p, 'review')` | `#/project/p1/episode/ep2` | `#/project/p1/episode/ep5` |
| 落地页那一集的 `episodeState.action` | `{key:'script', label:'编写剧本'}` | `{key:'review', label:'审片修订'}`(未审集则无 action,该走整集审片) |
| 去掉 `ep5`(只剩达标集与三种审不了的集) | `#/project/p1/episode/ep2` | `#/project/p1/episode/ep1`(退回首集,与"全部达标"同一条退路) |

## 2. 处置:门槛收成一个字段,导航读它

`js/domain.js` `episodeState` 里,在 `reviewStale` / `reviewAvg` 之后加一档派生:

```js
const reviewGate = !hasScript || counts.total === 0 || shotsStale ? 'unready'
  : reviewStale ? 'review-stale'
    : reviewAvg === null ? 'no-review'
      : reviewAvg < D.REVIEW_MIN ? 'low-review' : 'pass';
```

三关在前、四档在后,`unready` **不占任何一档**——它说的是"这一步不对这一集出结论",不是"这一集有审片问题"。
判旧那一支排在 `no-review` 之前,因为判旧后 `reviewAvg` 已是 `null`,顺序倒过来判旧会被报成未审(变异 5 就是这一格)。
码字面 `no-review` / `review-stale` / `low-review` 不是新造的,与 `workflow` 的 `review` 步阻塞码、问题中心那三类 `kind` 同字面。

`js/pipeline.js` 那一行随之改成读它:

```js
const unRvEp = () => eps.find(e => { const g = Domain.episodeState(p, e, _online()).reviewGate; return g !== 'pass' && g !== 'unready'; });
```

**门槛与 `episodeState.status` 的 `needs_human` 可达性本就同一条**:`status` 的分支链上,缺正文先落 `blocked`、
未拆镜先落 `ready`(生成分镜)、分镜判旧先落 `stale`(重新拆镜),`needs_human` 只在这三关之后才可能命中。
故这一档是把既有可达性写成一个读得出来的字段,**分集状态一字未动**(全套 530 条里既有断言零改动可证)。

## 3. 为什么落在 `episodeState` 而不是就地判在 `pipeline.js`

就地判是最小的:在那一行里补 `!(e.content||'').trim() || !st.counts.total || st.shotsStale` 三个条件即可,不动 `domain.js`。
不这么做的理由是它会**在展示层写下第二份门槛**——"这一集能不能审"的判据,`episodeState` 自己已经按这三关排过一遍 `status`,
再抄一遍就是同一道门槛两处字面,与 `w153-gate-fanout.md`、`w155-ep-blockers-fanout.md` 这两槽收的是同一类病
(那两槽收的是阻塞码的第二处字面,这里是门槛条件的第二处字面)。
落在派生层还有一个副作用是本槽要的:**它给了后来的消费方一个读得出来的字段**,W165 那支的两个消费面正是读它。

## 4. 变异实测

改完逐条改回去跑 `node tests/unit.js domain` 与 `node tests/unit.js pipeline`,验完还原(`git diff` 只剩本槽改动):

| 变异 | 结果 |
|---|---|
| 1. `pipeline.js` 那一行整条退回基线(读 `reviewAvg`) | 红 1:`pipeline` 那条报 `期望 "…/ep5",实际 "…/ep2"`;`domain` 那条**全绿**(分工:域里那档没被动) |
| 2. 导航侧只排除 `pass`(把 `unready` 也当落点) | 红 1:同上报 `ep2`——两种写错法落在同一个后果上,故用同一条判据接 |
| 3. 三关整段拿掉(`false ? 'unready' : …`) | 红 2:`domain` 报 `缺正文…期望 "unready",实际 "low-review"`;`pipeline` 报 `实际 "…/ep2"` |
| 4. 只拿掉 `shotsStale` 那一关 | 红 2:`domain` 报 `分镜表判旧…实际 "low-review"`;`pipeline` 这次报 `实际 "…/ep4"`——**报错点名换了集**,证明三关是逐关钉的不是一把抓 |
| 5. `reviewStale` 与 `reviewAvg === null` 两支换序 | 红 1:`domain` 报 `记录判旧 → review-stale…实际 "no-review"` |
| 6. `reviewGate` 不进 `episodeState` 返回值 | 红 3:`domain` 报 `实际 undefined`;`pipeline` **两条**一起红(新增那条与既有那条 `hashOf:审片步骤直达首个待审集` 都退化成首集)——字段没了导航侧一集都挑不出来 |

变异 1 与变异 3 的对照是两条用例的**分工证明**:改导航侧只红 `pipeline` 那条,改门槛只红 `domain` 那条外加导航侧的连带。
变异 6 是唯一一条会波及既有用例的,理由是既有那条本来就在钉"挑得出待审集"。

新增两条用例各自另钉住"没有顺手改别的":`domain` 那条末尾断言分镜判旧的低分集 `status` 仍是 `stale`
(断点是重新拆镜,不是审片修订)、过了门槛的低分集 `status` 仍是 `needs_human`(质量闸门一字未动);
`pipeline` 那条中段逐集断言 `ep2/ep3/ep4` 在 `episodeState` 里就是 `unready`(两处同一道门槛,不是导航侧自己另判的)。

## 5. 与在飞的 W165 怎么对上

`cursor/w165-review-issues-align-e7a0 @ 9b7e308` 把同一个字段落在同一个位置,本槽逐行对过:

| | W165 那支 | 本槽 |
|---|---|---|
| `reviewGate` 那四行表达式 | — | **逐字节相同**(`diff` 无输出) |
| `return {…, reviewGate, …}` 那一行 | — | **逐字节相同** |
| 注释第 2–5 行 | — | **逐字节相同** |
| 注释第 1 行 | 「主线 review 步与问题中心的分集审片条目同读这一份」 | 「凡是"这一集该不该去审"的判断都读这一份」 |
| `hasScript` 那一行 | `bl('no-script', …)` | `bl(EPB.script, …)` |
| 消费面 | `workflow` 的三档集数 + 推荐动作、`js/issues.js` 的分集审片条目 | `js/pipeline.js` 的 `hashOf('review')` |

注释第 1 行有意不照抄:那支的那句点名的是**它的**两个消费面,本 HEAD 上那两处还读着 `reviewAvg`,
照抄就是一句与本 HEAD 行为不符的注释;本槽改成不点名消费方的说法,两支合到一处时这句话对两边都成立。
`hasScript` 那一行的差别不是本槽造成的——本 HEAD 有 W155 的 `EPB` 登记表而那支叉在它之前(那支的 `js/domain.js`
整份仍是 `'no-script'` 那种字面),合并时按 W155 的纪律取登记表那一侧即可。

合并预期:`js/domain.js` 这一处两侧插的是同一段,冲突面只有注释第 1 行;那支另外还改
`workflow` 的 `rvPass/rvLow/rvStale/rvNone` 与 `review` 步推荐动作、`js/issues.js`,本槽这三处**零 diff**,直接取那侧。
`tests/unit.js` 两侧各加各的用例(那支加在 `domain`/`issues` 套件,本槽加在 `domain`/`pipeline` 套件),
`domain` 套件那一格会给冲突块,取并集即可——两侧的 `reviewGate` 用例判的是同一份派生的同一批档位,结论不冲突。

## 6. 本槽没做的事

- **不收 `workflow` 那一面**。`review` 步的三档集数与 `recommendedAction` 的挑集仍读 `reviewAvg`
  (`js/domain.js` 那两处一字未动),那是 W165 的落点,整包重做会与它撞成一片。
  这两面与导航面此刻的差别只在极窄的一格:`recommendedAction` 只在 `review` 成为主线当前步时才算,
  而那要求 `shots` 步(每集都有分镜且无判旧)与 `gen` 步都已 `done`,`unready` 里只剩"有分镜但没正文"这一种进得来;
  导航侧那一行则**随时点得到**,不必等它成为当前步——这正是同一道门槛先从导航这一面收的理由。
- **不动问题中心**。`js/issues.js` 零 diff,分集审片条目的早退与三态照旧。
- **不抬发布门**。`js/release.js` / `js/release-core.js` 零 diff,G1–G10 的判据、计数与四级 `overall` 映射一字未动;
  新增那档 `reviewGate` 没有任何一个门读它。
- **不摘 `gaps`**。`js/skills.js` 零 diff(`gaps()` 仍 20 键),`js/pipeline.js` 对 `Skills` 照旧零引用。
- **不动 `Pipeline.nextForEp` / `prevForEp`**。那两处判的是"这一集"的上下一步,读的是 `episodeState.action`/`status`
  ——本来就在门槛的正确一侧(既有三条用例全绿可证),没有第二份判据要收。

## 7. 数字(live 现取)

| | 本槽前 | 本槽后 |
|---|---|---|
| `tests/unit.js` 用例数 | 528 | **530**(`domain` +1、`pipeline` +1) |
| 单元测试 `FLOOR` / 主 README 明写数 | 528 | **530** |
| `contract` 套件 | 116 | 未动(实跑 116/116) |
| `tests/integration.js` | 141 | 未动(实跑 141/141 全绿) |
| `tests/cli.smoke.js` | 107 | 未动(实跑 **105/107**) |
| 记账件份数 / 目录 README 明写数 / 记账件 `FLOOR` | 174 | **175**(含本文) |

`node tests/unit.js` 530/530、`node tests/integration.js` 141/141 全绿;
`node tests/cli.smoke.js` 那两项失败是主干既有(「未登录 whoami → exit 3」实得 exit 1、「llm --json mock 链路」),
与 `w161-integration-log.md` 记的是同两条,与本槽改动无关。
`node --check js/domain.js` / `node --check js/pipeline.js` / `node --check tests/unit.js` 通过。

## 8. 交接

1. **W165 合进来时把 `workflow` 与问题中心那两面一并收掉**(第 5 节有逐行对照与合并预期)。
   在那之前,同一道门槛在本仓里是"导航面读 `reviewGate`、计数面读 `reviewAvg`"——
   两面此刻只在"有分镜但没正文"那一格上可能给出不同的集,如实登记为仍欠。
2. **`reviewGate` 现在有一个消费方,加档时它不是查表**。与 `Domain.epBlockerCodes()` / `gateCodes()` 那两张登记表不同,
   本槽**没有**给 `reviewGate` 立枚举面:它现在只有一个消费方且那个消费方是"两个码除外一律要"的写法
   (`g !== 'pass' && g !== 'unready'`),新增一档默认会被当成待审集接住——**漏投的方向反过来了**,
   新增一档若不该当落点,得同轮改那一行。等 W165 合进来变成三个消费方(计数按档分、条目按码分)之后,
   那时才值得照 `w153-gate-fanout.md` 的办法把码收成登记表并逐码点名消费方。
3. **`unready` 的三关与 `status` 的前三档是同一条,今天靠人眼看住**。第 2 节末那句"可达性同一条"由
   `domain` 那条用例的末两行钉着(判旧低分集 `stale`、过关低分集 `needs_human`),但那是两个点不是一条判据;
   `status` 的分支链若哪天在前三档之前插一档新状态,门槛这三关不会自动跟上。
