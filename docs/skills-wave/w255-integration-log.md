# W255 集成记账:W253 produce 修订回写按行落到本轮那一行

一条槽并进同一条集成线,一次真 `--no-ff`。本文只记集成面的读数与判断,槽自身的病灶/改法/变异见 `w253-produce-revise-first-row.md`。

## 一、拓扑与 SHA(全部现取)

| 位 | 交接自称 | 现取 | 核对 |
|---|---|---|---|
| 我方尖(P1,W252 集成线) | `cfa31cd` | **`a55cf14`** | **错**,自称的是「合入链中间那个 merge」——`cfa31cd` 正是 `a55cf14` 的父 |
| 被合入支(P2,W253) | `513aff7` | **`513aff7`** | 对 |
| 叉点(B,W250) | `367f7bc` | **`367f7bc`** | 对 |

`git merge-base P1 P2` 现取 `367f7bc` = B,两支都从 W250 叉出、互不相识。

自称错的又是「某支的 tip」这一类,而对**叉点**的自称是对的——W250 §一登记、W252 复现过一次的那条规律,本槽第三次以默认前提跑了一遍,读数照旧。

merge parents 现取:`a55cf14` + `513aff7`,merge commit `e8f2002`。

## 二、`P1 == B` 否:**否**,本槽回到真并集档

四棵树的 `tree` 哈希两两不同:

```
B  0fe9b62b3b0472684b8f7be7fdfb1a7fb8a92027
P1 77d707c82d7e249cf3c2050d256984dc8e4d1162
P2 30a7fc970b5f1b0f8b5f2e82201c9ca1362ec752
M  5a614335b35da27557a4a14af6c844a859c2ef3c
```

W252 那一槽是 `P1 == B`(树与 B 逐字节同),三层验收面(live 对账 / 名集对账 / 全绿计数)一起变成恒真,只有变异演练立得住。**本槽不是**:P1 相对 B 真带着 W252 的 tests 第五档与两份记账件,故 live 对账重新有信息量——两侧自称 667(W252)与 669(W253)里,**只有对侧那个会对**,判据是「我方在 unit 那个数上净增 0」(W251 的第五档补在既有用例躯干里、用例名一个字没换)。现取 unit **669/669**,与交接给的 `667+2=669` 相符。

## 三、形态表:548 个文件里真形态 9 个

| 形态 | 个数 | 文件 |
|---|---|---|
| 真并集(与两侧都不同) | 3 | `README.md`、`docs/skills-wave/README.md`、`tests/unit.js` |
| 我方未碰,整份取对侧 | 4 | `cli.js`、`js/domain.js`、`js/wf-core.js`、`w253-produce-revise-first-row.md` |
| 对侧未碰,留我方 | 2 | `w251-nth-subject-fallback.md`、`w252-integration-log.md` |

整份取用两个方向不一样多(取对侧 4、留我方 2),与 W250(2:1)、W252(4:0)、W247(2:2)成第四个读数。**三处真并集正好是 git 报冲突的三处**,一处都没机械取侧。

`js/` 下 257 个文件里只有 `domain.js` / `wf-core.js` 两个动过,其余四树逐字节全同。

### 「整份取对侧」这三个产品文件为什么是并集而不是丢失

`cli.js` 那一格最要紧:W248 立的 `nthShot` 定义与 `episode.generateVideos` 每轮写回那个调用点都在 B 里(经 W250 进的线),W252 相对 B 在 `cli.js` 上**零 diff**,故「整份取对侧」拿到的是 B 的全部 + W253 的一处新增,不是拿对侧顶掉我方。合完现取核实四处寻址全在:

```
194   const nthShot = (ep, sid, nth) => {                                    ← W248 定义
1149  const sLive = nthShot(epLive, s.id, nthOf.get(s) || 0);                ← W248 generateVideos 写回
1265  const sL = nthShot(findEp(projLive, args.epid), x.shotId, x.nth || 0); ← W253 produce 修订写回(新增)
1420  const sj = nthSubject(projLive, s.id, nthOf.get(s) || 0);              ← W246 主体侧
```

`nthShot` / `nthSubject` 两处兜底(`rows[nth] || rows[0]` 与委托回 `findShot`/`findSubject`)一字未动,**没为凑绿剥掉**。

## 四、三处冲突怎么解

**`tests/unit.js`**:只冲突一行(`FLOOR`),两侧各自抬(267 / 266),取合完 live **268**。W252 的第五档(`⑤ 并发改表`,`gone1`/`gone2` 两路)与 W253 的两条新用例 git 自己合上,合完逐条现取都在——相对我方只多出对侧那 104 行 + `FLOOR` 那两行,相对对侧只多出我方那 9 行 + `FLOOR`,两个方向都是纯增。

**`docs/skills-wave/README.md`**:索引表尾两侧各插各的行(我方 w251 + w252、对侧 w253),按波次号归位成 `…w252 | w253`;明写份数两侧 267 / 266,取合完 live **268**。

**`README.md`**:那条超长行两侧各改各的,量出来是对 B 的两段互不重叠的纯插入,base 侧零字符被改写:

```
B 18727 → P1 18949(+222,W252 的「并发改表那一档两侧各有一份」)
        → P2 19118(+391,W253 的 667→669 与「修订这一步同形」一段)
M = 18727 + 222 + 391 = 19340  ✓ 自洽(现取 19340)
```

按「先把两侧各还原成对 base 的纯插入再量重不重叠」那一手解,两段各自落在长行的不同位置(W252 那段在主体补图那一节、W253 那段在批量生视频那一节之后并顺带把断言数从 667 改到 669),整句取侧一次都没做。

## 五、名集对账(按 `|` 切多重集,四棵树都在全绿状态下取)

| 树 | 条数 | 相对 B |
|---|---|---|
| B(`367f7bc`) | 667 | — |
| P1(`a55cf14`) | 667 | 新增 0 / 删除 0 |
| P2(`513aff7`) | 669 | 新增 2 / 删除 0 |
| M(merge) | 669 | — |

`667 + 0 + 2 = 669`,M 侧缺失 **0** 条、多出 **0** 条。P2 新增那两条:

- `domain · reviseTargets:同 id 多行时逐条落到自己那一行(第几条逐镜分 = 第几行同 id,序数同 nthShot)`
- `commands · CLI produce 修订回写:同 id 多行时改的是本轮那一行(几笔优化钱不许全写首行)`

P1 那一项的 **0** 与 W250/W252 同一个形状:补档不增条,故名集与全绿计数对我方这一半恒真,能把它与「什么都没合」分开的只有变异。

## 六、变异演练:六手各红在自己那一层,两侧都立得住

在合完那棵树上整跑(基线 669/669):

| 手 | 打在哪 | 结果 |
|---|---|---|
| M1 | `Domain.reviseTargets` 逐条落行 → 一律首行 | **666/669**,红 3(domain 出目标层 / contract 取材层 / commands 回写层) |
| M2 | `WfCore.reviseSubset` 的 `shots[t.order-1]` → `find` 首行 | **667/669**,红 2(contract + commands) |
| M3 | CLI `reviseLowShots` 写回 `nthShot` → `findShot` 首行 | **668/669**,红 1(commands) |
| M4 | `nthSubject` 两处兜底一起摘(`return rows[nth];`) | **668/669**,红 1(`subject.generateImage` 那一档) |
| M5 | `nthShot` 两处兜底一起摘 | **668/669**,红 1(`episode.generateVideos` 那一档) |
| M6 | W248 的 `generateVideos` 每轮写回 → `findShot` 首行 | **667/669**,红 2 |

三手打对侧(M1–M3)、三手打我方(M4–M6),各自红在自己那一层,合完谁都没被顶掉。

**本槽最该抄走的一格是 M6 那第二条红**:把 W248 的 `generateVideos` 写回退回首行时,红的除了 W248 自己那一档,**还有 W253 新加的 produce 那一条**——`episode.produce` 的重抽步是经 `episode.generateVideos` 下发的,W253 的修订回写判据实际压在 W248 那个调用点上跑。这就是两支的**真实接触面**:两支没有一行代码重叠(一个在 `reviseLowShots`、一个在 `batchGen` 那一路),判据面却是串着的。反过来 M5(摘 `nthShot` 兜底)只红 1、produce 那条不红——它走不到越界那条路。**「两支有没有接触」不能只看 diff 有没有重叠**,得让变异跨支跑一遍才量得出来;而这一格恰好证明「整份取对侧 `cli.js`」没把 W248 弄丢:真丢了 produce 那条判据当场就红。

M1 红 3 是这条链三层判据分开立的直接读数(出目标 / 取材 / 回写各一层),与 W253 自述的分层判据一致;M2 只红 2 是因为出目标那一层没被改。

## 七、live 数字(全部合完现取)

| 项 | live |
|---|---|
| `unit` | **669/669**(交接给的 `667+2=669`,对) |
| `commands` | **57** |
| `contract` | **145** |
| `release` | **51** |
| `skills` | **95** |
| `domain` | **42** |
| `integration` | **148/148** |
| `cli.smoke` | **115/117**(单独整跑 `env -u HUJING_SERVER`) |
| 记账件 | **269** 含本文 |

`cli.smoke` 那两条失败与 `master` `9adcf0f`(51/53)**同名同表现**,现取在 master 上跑过一遍比对:

```
FAIL | 未登录 whoami → exit 3 | exit=1
FAIL | llm --json mock 链路 | undefined
```

两侧自称 unit 667(W252)与 669(W253),命中的是对侧那个;记账件两侧自称 267 / 266,`git` 一次都没静默(三处冲突全报了),合完 live 268,加本文 269。

## 八、棘轮:反事实四档 + 三方对齐那一层

记账件那格 `SLACK = 3`,合入点 live 268:

| 反事实 | 结果 |
|---|---|
| `FLOOR` 留 267(落后 1) | 全绿 |
| `FLOOR` 留 266(落后 2) | 全绿 |
| `FLOOR` 留 265(落后 3) | 全绿 |
| `FLOOR` 留 264(落后 4) | **红 1**(棘轮本体越过缓冲才开口) |
| 明写份数留 267 而 live 268 | **红 1**(三方对齐那一层当场接住) |
| 明写份数与 `FLOOR` 两处一起留旧 | **红 1** |

前四档与 W250/W252 逐字同结论。**末两档现取是红 1,不是 W252 记的红 2**——现跑核实全树只有 `docs/skills-wave/README.md` 一处明写份数(根 `README.md` 那条数字对账契约描述的是判据本身,不另写一个份数),故「明写留旧」只可能红在三方对齐那一条上;两处一起留旧照旧红 1(`FLOOR` 落后 1 格在缓冲内,静默)。W252 那句红 2 在本槽这个形状上**复现不出来**,如实记在这里,下一槽别照抄那个数。

## 九、残留:五条按明令一条没代修,全部现取核实仍在

| 残留 | 现取位置 | 形态 |
|---|---|---|
| `produce` 收尾 `lastReview` 按 id 记 | `js/produce.js:267` `lastRep = {}` / `276` `lastRep[s.id] = r` / `316` `perShot: reviewed.map(...)` | 同 id 多行被最后一行的报告覆盖,`perShot` 上那几行只剩一条——**属审片写回,不属修订回写**,W253 射程外 |
| 服务端子集复审 `perShot` 按 id 去重 | `server.js:3617` `!newPer.some(y => y.shotId === x.shotId)` | 合并旧报告时按 id 判重,同 id 多行的旧条目会被一条新条目整批顶掉 |
| `agent-ops` `d.lowShots` 展示取首行 | `js/agent-ops.js:450` `(ep.shots \|\| []).find(x => x.id === t.shotId)` | 镜号 `n: t.order` 已随 W253 逐行分开(这一半跟着修好了),但 `issues` 仍从**首行**的 `reviews` 里回取 `reportId`,后几行取不到即空 |
| `state-put` 不设闸 | `cli.js` 逃生舱一路 | 有意如此(整树原样落库),README 明写「镜头 id 唯一性由调用方自己保证」 |
| 回执 `ok` 次数按引擎次数、对不上手图 | W251 §现跑读数那一格 | `gone1` 引擎实收 3、回执报 `ok:3`,到手图只有 2 位 |

第三条值得单记一句:W253 把 `reviseTargets` 的 `order` 改成逐行实位之后,`agent-ops` 那一段**半边跟着好了半边没有**——展示的镜号不再一律报「镜 1」,而问题清单仍是首行那份。这是「改了派生、四处消费点只跟了三处」的直接读数,交接明令不代修,登记在此。

## 十、其余清单现取核实

`gaps()` **20** 键一个没剥、`CLOSED` **0** 条、`TOPIC_FLOOR` **19**、`SLACK` **3**、MCP **42** 工具。`nthSubject` 第五档 / `nthShot` / `pickerNarrowHits` / `dupRowsNote` 的 `extra` 算术 / `dupSubjectRowsNote` / `shots-dedupe` / `floorLagVerdict` / `blankNonCode` / `emptyBatchNote` / import 闸 / produce 提 note 全在。

`node --check` 过:`cli.js`、`js/domain.js`、`js/wf-core.js`、`tests/unit.js`、`server.js`、`mcp.js`、`js/skills.js`。

`master` 没合、没开第三条功能支、没开 PR。在飞的 W254(从 W252 出,可能改 `generateImage`/`generateVideos` 回执)一条没碰——它与本槽的接触面**恰好就是第六节量出来的那一处**:W254 若动 `generateVideos` 的回执或写回,合它的那一槽务必把 produce 那条判据一并跨支变异跑一遍。
