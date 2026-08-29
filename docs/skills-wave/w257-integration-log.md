# W257 集成记账:W254 回执 `ok` 与 `landed` 各说一件事

一条槽并进同一条集成线,一次真 `--no-ff`。本文只记集成面的读数与判断,槽自身的病灶/改法/变异见 `w254-ok-count-vs-assets.md`。

## 一、拓扑与 SHA(全部现取)

| 位 | 交接自称 | 现取 | 核对 |
|---|---|---|---|
| 我方尖(P1,W255 集成线) | tip `adf7442` / merge `e8f2002` | **`adf7442`** | 对(明令取 tip,`e8f2002` 是它的父、那一槽的 merge commit) |
| 被合入支(P2,W254) | `4bfd99b` | **`4bfd99b`** | 对 |
| 叉点(B,W252) | `a55cf14` | **`a55cf14`** | 对 |

`git merge-base P1 P2` 现取 `a55cf14` = B:W255 那条线从 W252 出,W254 也从 W252 出,两支互不相识。

merge parents 现取:`adf7442` + `4bfd99b`,merge commit **`2a3e042`**。

**三个 SHA 自称全对,是近几槽头一回**——W255 §一 登记的「自称错的总是某支的 tip、对叉点的自称是对的」那条规律,本槽没有复现。但**自称错到了别处**:两侧记账件里的分套件数有一个是错的,见第七节。规律该按「哪一类数被判据面守着」来读,不是按「哪一栏」。

## 二、`P1 == B` 否:**否**,真并集档

四棵树的 `tree` 哈希两两不同:

```
B  77d707c82d7e249cf3c2050d256984dc8e4d1162
P1 4d5e82a4af8b93be21c103abd97682fa1be1d9db
P2 787b5909778d4e5753df9bf3dfffbc810f4f0391
M  aca6f6c7261182b262944d6bbf8f7d1915c77049
```

P1 相对 B 真带着 W253 的三处改动(`reviseTargets` 带 `nth`、`reviseSubset` 按 `order-1` 取原文、CLI `reviseLowShots` 按 `nth` 写回)与两份记账件,故 live 对账、名集对账、全绿计数三层验收面都有信息量,不像 W252 那一槽只剩变异演练立得住。

## 三、形态表:550 个文件里真形态 10 个

| 形态 | 个数 | 文件 |
|---|---|---|
| 真并集(与两侧都不同) | 5 | `README.md`、`docs/skills-wave/README.md`、`tests/unit.js`、`cli.js`、`js/domain.js` |
| 我方未碰,整份取对侧 | 2 | `js/commands.js`、`w254-ok-count-vs-assets.md` |
| 对侧未碰,留我方 | 3 | `js/wf-core.js`、`w253-produce-revise-first-row.md`、`w255-integration-log.md` |

`js/` 下 257 个文件里只有 `domain.js` / `commands.js` / `wf-core.js` 三个动过,其余四树逐字节全同。

### 本槽最该抄走的一格:「git 报了几处冲突」不等于「有几处要并集」

W255 那一槽 3 处真并集 = git 报的 3 处冲突,一一对应;**本槽 5 处真并集,git 只报了 3 处**。多出来的 `cli.js` 与 `js/domain.js` 是 git 自己合上的——两侧改的段落隔得够远(不同函数 / 不同注释块),三行上下文没碰头,于是自动并集成功。

这两个文件恰好就是交接明令「两边都动、必须真并集、不能整份取一侧」点名的那两个。**若按「git 没报冲突 = 这文件没争议」收工,复核就整个跳过了这两处**——它们没报冲突不是因为没争议,是因为争议在同一文件的不同位置。故四树复核得按**文件**走一遍,不能按冲突清单走:

```
M vs P1 在 cli.js 上 = 只多出 W254 的 landed/seats 那一组(25 处 landed + 8 处 seats)
M vs P2 在 cli.js 上 = 只多出 W255 的 nth 写回那一组(reviseLowShots 两句 + 四行注释)
M vs P1 在 js/domain.js 上 = 只多出 W254 的 landedNote 整段
M vs P2 在 js/domain.js 上 = 只多出 W255 的 reviseTargets 带 nth
```

两个方向都是纯增、谁都没被顶掉,这才是「真并集」的读数。

### `cli.js` 上两支的行贴得有多近

合完现取,`episode.generateVideos` 这一个函数里两支的行是**交错**的:

```
1147  const seats = new Set();                                              ← W254 座位集
1153  const sLive = nthShot(epLive, s.id, nthOf.get(s) || 0);               ← W248(在 B 里)
1163  seats.add(s.id + '#' + (epLive.shots||[]).filter(...).indexOf(sLive));← W254 记座位,读的正是 1153 那个 sLive
1174  result: { total, ok: okCnt, landed: seats.size, failed, skipped }     ← W254
1273  const sL = nthShot(findEp(projLive, args.epid), x.shotId, x.nth || 0);← W253/W255 produce 修订写回
1432  const sj = nthSubject(projLive, s.id, nthOf.get(s) || 0);             ← W246 主体侧
```

1163 那一句是 W254 的新增,而它取数用的 `sLive` 是 B 里 W248 那句寻址的产物——**两支的真实接触面在这里,不在 diff 的重叠上**(两支一行代码都没重叠)。第六节 M9 把这条接触面读了出来。

`nthShot` / `nthSubject` 两处兜底(`rows[nth] || rows[0]` 与委托回 `findShot`/`findSubject`)一字未动,**没为凑绿剥掉**。

## 四、三处冲突怎么解

**`tests/unit.js`**:只冲突两行(两个 `FLOOR` 字面),两侧各自抬——单元 669 / 668 取合完 live **670**,记账件 269 / 268 取合完 live **271**(含本文)。两侧的新用例 git 自己合上,合完两个方向都是纯增:相对我方多出对侧那 105 行,相对对侧多出我方那 104 行。

**`docs/skills-wave/README.md`**:索引表尾两侧各插各的行(我方 w253 + w255、对侧 w254),按波次号归位成 `…w253 | w254 | w255`;明写份数两侧 269 / 268,取合完 live **271**。

**`README.md`**:那条超长行两侧各改各的。先把两侧的断言数字都还原成 base 的 667 再量,量出来是对 B 的两段**互不重叠的纯插入**,base 侧零字符被改写:

```
B 18949 字符
  P2 插入点 offset 10031(+469,W254 的「ok 与 landed 各说一件事」一段)
  P1 插入点 offset 10351(+391,W255 的「修订这一步同形」一段)
M = 18949 + 469 + 391 = 19809  ✓ 自洽(现取 19809)
```

按插入位从后往前重拼,再把断言数一次性改成 live 670。整句取侧一次都没做,`--ours` / `checkout <old> -- .` 一次都没用。

## 五、名集对账(按 `|` 切多重集,四棵树都在全绿状态下取)

| 树 | 条数 | 相对 B |
|---|---|---|
| B(`a55cf14`) | 667 | — |
| P1(`adf7442`) | 669 | 新增 2 / 删除 0 |
| P2(`4bfd99b`) | 668 | 新增 1 / 删除 0 |
| M(merge) | 670 | — |

`667 + 2 + 1 = 670`,M 侧缺失 **0** 条、多出 **0** 条。

P1 新增那两条:

- `domain · reviseTargets:同 id 多行时逐条落到自己那一行(第几条逐镜分 = 第几行同 id,序数同 nthShot)`
- `commands · CLI produce 修订回写:同 id 多行时改的是本轮那一行(几笔优化钱不许全写首行)`

P2 新增那一条:

- `commands · 回执 ok 与 landed 各说一件事:ok 数引擎调用成功次数、landed 数产物真落到几位/几行,共位那一趟岔开并经 note 说清`

两侧都是净增、零删除,交接给的 `669+1=670` 命中。

## 六、变异演练:九手各红在自己那一层,两侧都立得住

在合完那棵树上整跑(基线 **670/670**):

| 手 | 打在哪 | 结果 |
|---|---|---|
| M1 | 对侧 `Domain.landedNote` 整句回空 | **669/670**,红 1(landed 那一档) |
| M2 | 对侧座位键去掉 id(只记位内序数) | **667/670**,红 3 |
| M3 | 对侧 CLI `landed: seats.size` → 抄 `okCnt` | **669/670**,红 1 |
| M4 | 对侧判词数字守卫 → 换回 `+` 号折算 | **669/670**,红 1 |
| M5 | 对侧空跑那一路摘掉 `landed: 0` | **669/670**,红 1 |
| M6 | 我方 `Domain.reviseTargets` 逐条落行 → 一律首行 | **667/670**,红 3(domain 出目标 / contract 取材 / commands 回写) |
| M7 | 我方 `WfCore.reviseSubset` 按行取原文 → `find` 首行 | **668/670**,红 2(contract + commands) |
| M8 | 我方 CLI `reviseLowShots` 写回 `nthShot` → `findShot` 首行 | **669/670**,红 1 |
| M9 | 我方侧 `nthShot` 两处兜底一起摘 | **668/670**,红 2 |

五手打对侧(M1–M5)、四手打我方(M6–M9),各自红在自己那一层,合完谁都没被顶掉。M6/M7/M8 三档与 W255 §六 的 M1/M2/M3 逐字同结论(该槽合完那棵树上重跑一遍,基线从 669 换成 670,红的条数与层次一个没变)。

**两格值得单记**:

**M2 红 3,其中两条是 B 里 W239/W242 的「正常批量一句不加」**。座位键去掉 id 之后,三个各占一位的不同 id 全记成第 0 位、`landed` 缩成 1,于是正常的一趟凭空多出一句 `landedNote` ——被那两条老判据当场接住,W254 自己那条新用例只是第三条红。**为收一句假话造出的另一句假话,是被上一槽的判据抓住的**,这正是「新字段恒带」比「只在异常时出现」值钱的地方:恒带才会被既有的「正常一趟一句不加」那类判据覆盖到。

**M9 是两支的真实接触面**。摘掉 `nthShot` 两处兜底,红的除了 W248 自己那一档(`episode.generateVideos` 同 id 多行),**还有 W254 新加的 `landed` 那一条**——它的前提断言是「三行都真下发(三笔视频钱)」,而三行能各自下发靠的就是 1153 那句寻址的兜底。两支一行代码都没重叠,判据面却是串着的;反过来 M1–M5(全打在 W254 的 `landed` 上)一条 W255 的判据都不红,M6–M8(全打在 W255 的修订链上)一条 W254 的判据也不红。**方向是单向的:W254 的新判据压在 base 的寻址上,W255 的新判据不压在 W254 上**,故「整份取对侧 `js/commands.js`」不会把 W255 弄丢,而 `cli.js` 若真取了一侧,M9 那第二条红会当场把它报出来。

## 七、live 数字(全部合完现取)

| 项 | live | 交接自称 |
|---|---|---|
| `unit` | **670/670** | `669+1=670`,**对** |
| `commands` | **58** | W255 记 56、W254 记 57,**两个都不对** |
| `contract` | **145** | — |
| `release` | **51** | — |
| `skills` | **95** | — |
| `domain` | **42** | — |
| `integration` | **148/148** | — |
| `cli.smoke` | **115/117**(单独整跑 `env -u HUJING_SERVER`) | — |
| 记账件 | **271** 含本文 | — |

### `commands` 那一格:自称错在**自己那一侧**的数上

现跑三棵树核实:

```
B  a55cf14 (W252)  commands = 56
P1 adf7442 (W255)  commands = 57   ← 它的记账件写的是 56
P2 4bfd99b (W254)  commands = 57   ← 它的记账件写的是 57,对
M                  commands = 58   = 56 + 1 + 1
```

W255 把**叉点的 56 当成自己的 live 写进了记账件**,而它自己那一槽真加了一条 `commands` 用例。两侧各 +1、合完 58 自洽。

为什么这个数能带着错躺一整槽没人接住:**棘轮只守 `unit` / `integration` / `cli.smoke` 三套件**(`tests/unit.js` 那张 `FLOOR` 表就这三行),分套件数(`commands` / `contract` / `release` / `skills` / `domain`)一个都没有下限、也不进 README 数字对账,记账件里写多少都不红。故这一栏**只能靠合入时现跑**,不能照抄上一槽——这也是「数字合完 live」这条纪律在本槽真正兑现的地方:若照抄 `56+1=57`,判据面一声不吭。

`cli.smoke` 那两条失败与 `master` `9adcf0f` **同名同表现**,现取在 master 上跑过一遍比对(master 51/53):

```
FAIL | 未登录 whoami → exit 3 | exit=1
FAIL | llm --json mock 链路 | undefined
```

## 八、棘轮:反事实六档

记账件那格 `SLACK = 3`,合入点 live 271:

| 反事实 | 结果 |
|---|---|
| `FLOOR` 留 270(落后 1) | 全绿 |
| `FLOOR` 留 269(落后 2) | 全绿 |
| `FLOOR` 留 268(落后 3) | 全绿 |
| `FLOOR` 留 267(落后 4) | **红 1**(棘轮本体越过缓冲才开口) |
| 明写份数留 270 而 live 271 | **红 1**(三方对齐那一层当场接住) |
| 明写份数与 `FLOOR` 两处一起留旧 | **红 1** |

六档与 W255 §八 逐字同结论(含它更正过的「末两档是红 1 不是红 2」)。

另补两档打在单元那格上,W255 没读过:

| 反事实 | 结果 |
|---|---|
| 单元 `FLOOR` 留 669 而 live 670(落后 1) | 全绿(缓冲内,与记账件那格同口径) |
| README 断言数留 669 而 live 670 | **红 2**(数字对账 + 三套件下限各一条) |

**两格的守法不一样**:`FLOOR` 落后一格是静默的(靠 `SLACK` 缓冲),而 README 上那个明写的断言数落后一格当场红 2。故合入时**真正拦得住「数字没改成 live」的是 README 那个字面,不是棘轮下限**——棘轮守的是「只增不减」,对账守的是「等于实况」,两条不是一回事。

## 九、残留:六条按明令一条没代修,全部现取核实仍在

| 残留 | 现取位置 | 形态 |
|---|---|---|
| `landed` 只覆盖两条批量命令 | `cli.js` 5 个出口 + `js/commands.js` 6 个出口,共 **11** 个 | `shot.generateVideo` 等别的生成命令回执不带这个字段,调用方跨命令读仍得判 `undefined` |
| 共位那一趟的钱不退 | `js/billing.js` 零 diff | `ok:3 / landed:2` 时第 3 笔照扣不退——那次调用真发生过,退费口径没动 |
| `produce` 收尾 `lastReview` 按 id 记 | `js/produce.js:267` `lastRep = {}` / `276` `lastRep[s.id] = r` / `316` `perShot: reviewed.map(...)` | 同 id 多行被最后一行的报告覆盖,`perShot` 上那几行只剩一条 |
| 服务端子集复审 `perShot` 按 id 去重 | `server.js:3617` `!newPer.some(y => y.shotId === x.shotId)` | 同 id 多行的旧条目会被一条新条目整批顶掉 |
| `agent-ops` `d.lowShots` 展示取首行 | `js/agent-ops.js:450` `(ep.shots \|\| []).find(x => x.id === t.shotId)` | 镜号已随 W253 逐行分开,`reportId` 仍从首行的 `reviews` 里回取 |
| `state-put` 不设闸 | `cli.js:786` 说明 / `1710` 逃生舱本体 | 有意如此(整树原样落库),README 明写「镜头 id 唯一性由调用方自己保证」 |

前两条是 W254 这一槽自己留下的射程边界,后四条是 W252/W255 传下来的。W255 §九 记的第五条(「回执 `ok` 按引擎次数、对不上手图」)**本槽销号**——那正是 W254 收的那一格,现取 `landed` 已在 11 个出口恒带。

## 十、其余清单现取核实

`gaps()` **20** 键一个没剥、`CLOSED` **0** 条、`TOPIC_FLOOR` **19**、`SLACK` **3**、MCP **42** 工具。`nthSubject` 第五档 / `nthShot` / revise 的 `nth` / `pickerNarrowHits` / `dupRowsNote` 的 `extra` 算术 / `dupSubjectRowsNote` / `shots-dedupe` / `floorLagVerdict` / `blankNonCode` / `emptyBatchNote` / import 闸 / produce 提 note 全在。

明令零 diff 那几份现取核实:`js/billing.js`、`js/produce.js`、`js/agent-ops.js`、`server.js`、`mcp.js`、`js/skills.js`、`js/issues.js` 相对 B 全是零 diff。

`node --check` 过:`cli.js`、`js/domain.js`、`js/commands.js`、`js/wf-core.js`、`tests/unit.js`。

W256(低分清单取 `reviews`,从 W255 出、可能改 `agent-ops.js`)在飞,一条没碰;`master` 没合、没开第三条功能支、没开 PR。W256 与本槽的接触面在**第九节第五条**那一格:它要动的 `js/agent-ops.js:450` 正是本槽登记着没代修的那条残留,合它的那一槽务必把 `landed` 那条判据一并跨支变异跑一遍(本槽 M9 的形状),看它有没有绕过 `reviseTargets` 的 `nth` 另攒一份名单。
