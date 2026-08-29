# W263 审片展示面按行对位:整集报告视图 / 时间码 / 景别衔接不再按 id 取首行

基线:`origin/cursor/w262-integration-6ca8` **现取** tip `db7d531`(先 `fetch` 再 `rev-parse`,不抄交接自称;本槽自称与现取恰好相同)。
分支 `cursor/w263-review-nth-0160`,建支后 `rev-parse HEAD` 与 w262 尖逐字节相同。

**结论先写:同一份整集报告,写回侧早就按行对位、展示侧还在按 id 取首行,两个面指的不是同一行。
本槽把展示侧收到同一套行对位上,两个取法(按行对象身份定位 / 第几条同 id = 第几行同 id)
下沉成 `Domain.rowIndexOf` 与 `Domain.reviewRows` 双端单源,`reviseTargets` 改为长在后者之上。**

W258 / W261 / W262 三槽连着记的那条残留,原话是:

> `js/review.js` 的 `openEpisodeReport` 按 `find` 取首行这条展示面降级仍在

## 一、这条降级具体吞掉什么

`ep.lastReview.perShot` 是**按行**出的条目:同 id 三行就是三条,各带自己那一份 `score` / `reportId` /
`videoInputHash`(W258 收的写回侧、W261 收的合并侧、W260 收的服务端子集复审都已按行)。
报告对象本身也存在**各自那一行**的 `s.reviews` 里。

而 `openEpisodeReport` 复原参与报告时是这么取的:

```
const s = ep.shots.find(x => x.id === ps.shotId);
const rep = (s.reviews || []).find(r => r.id === ps.reportId);
if (!rep) { missing.push(ps); return null; }
```

同 id 后几行的 `ps` 一律落到**首行那一行**上,拿着自己的 `reportId` 去首行的 `reviews` 里找——
那儿没有,于是走 `missing` 那一路。用户看到的形状是:

- **审了三镜,报告里只剩一镜**,另外两行标「原报告已缺失(可能被后续审片挤出最近记录)」——
  而这几份报告一份都没丢,它们就在自己那一行里躺着;
- 「待返工 N 镜」「优秀 N 镜」三个计数只数得到取回来的那几条,**低分行被整条漏掉**
  (首行恰好达标时,报告页会说「无人待返工」而重抽面明明有两行);
- 「批量一键优化」的名单同样只收取回来的那几条:**几笔优化钱按首行那份意见花**,后几行没人动;
- 点某一镜跳转时,`data-jump` 存的是 `shotId`、`data-rid` 存的是 `reportId`,handler 里又
  `ep.shots.find(x => x.id === row.dataset.jump)` 一次——**点哪一镜都跳首行**。

首行那份恰好也在 `reviews` 里被后几行的 `reportId` 撞上的情形没有(报告 id 是 `Store.uid` 各自唯一),
所以这条降级的后果**不是"读成首行那份分"而是"整条消失"**——比 W258 那格(内容被覆盖、条数是对的)更显眼,
但一直没人收,因为它只在同 id 多行时才显形。

同文件另外三处是同一族:

| 处 | 原取法 | 同 id 多行时 |
|---|---|---|
| `shotTimeRange`(报告「关键问题定位」的时间段) | `for (const x of ep.shots) { if (x.id === s.id) break; …}` | 累到首行就断,后几行的时间码一律报成**首行那一段** |
| `localReview` 的景别衔接检查 | `(ep.shots \|\| []).findIndex(x => x.id === s.id)` | 拿**首行的上一镜**来比,报出一条本行并不存在的衔接问题 |
| `reportModalHTML` 的集号 | `(p.episodes \|\| []).findIndex(e => e.id === ep.id) + 1` | 同 id 多集时集号一律报第一集 |

## 二、改了什么(`js/domain.js` +25 −10、`js/wf-core.js` +7 −3、`js/review.js` +18 −18)

### 2.1 `js/domain.js`:两个取法收成双端单源

```
D.rowIndexOf(rows, item)  // 手上就是那一行的对象:按对象身份定位,拿不到身份才退回按 id 首行
D.reviewRows(ep)          // 手上只有 perShot 条目:第几条同 id = 第几行同 id,回 { ps, nth, i, shot }
```

`reviewRows` 的三点口径与 `WfCore.mergeReviewPerShot`、`Domain.reviseTargets` 逐字相同,不是新造的:

1. 序数在**整份 `perShot`** 上数,不在同 id 子集上另数一遍(只数子集会在"首行被筛掉"时整体错位);
2. 同 id 的行不够数时**退回首行**(与 CLI `nthShot` 的越界口径逐字相同,不算出 `-1` 把这一条整个丢掉);
3. 这个 id 在分镜表里一行都没有(报告写下之后被删掉)时如实回 `i = -1` / `shot = null`,**不拿首行冒充**。

`reviewRows` 只做对位不做筛选——达标线 / 交集 / 定稿那三道判在 `reviseTargets` 里,展示面另有自己的取用。
`reviseTargets` 随之改成长在它之上:

```
return D.reviewRows(ep)
  .filter(t => t.ps && typeof t.ps.score === 'number' && t.ps.score < D.REVIEW_MIN)
  .filter(t => t.i >= 0 && !shots[t.i].final)
  .sort((a, b) => a.i - b.i)
  .map(t => ({ shotId: t.ps.shotId, order: t.i + 1, score: t.ps.score, reportId: t.ps.reportId || '', nth: t.nth }));
```

它原本自己带着一份 `rowsOf` + `seen` 的对位(与将要写进展示面的那份逐字相同),
不收的话本槽就是在树上留第二份——`contract` 那条按 `const rowsOf = ` 出现次数恰为 1 钉着。
行为一字未变(旧实现的 `.map` 产物与 `reviewRows` 逐格同形),W258 起的四条既有判据现跑仍绿。

### 2.2 `js/wf-core.js`:时间码起点按行累

`W.shotTimeRange` 是**双端共用**的那一份(服务端 `normalizeReport` 与审片提示词的 `timeRange` 契约样例都读它),
起点改成累到 `Domain.rowIndexOf` 定出来的那一行为止。表里找不到这一行时照旧累完全表——
与收进本函数之前同形,不为凑绿改掉兜底。

### 2.3 `js/review.js`:展示面四处

- 整集报告视图的逐镜条目走 `Domain.reviewRows(ep)`,`missing` 那一路只在**这一行的 `reviews` 里真取不到**时才走;
- 跳转入口的行键从 `shotId` 换成**这份清单的行号**(`data-jump="${i}"`),handler 直接取 `reports[+i]`——
  哪一行、当时哪一份报告在上面已经按行对位取好了,再 `find` 一次就是第二次寻址,`data-rid` 随之不再需要;
- 本地那份 `shotTimeRange` 整个删掉改为委托 `WfCore.shotTimeRange`:它与 wf-core 那份**本就同一件事**
  (`SB.estShotDuration` 只是 `Domain.estShotDuration` 的转发),留着就是行对位得改两处;
- 景别衔接的上一镜与报告头的集号改走 `Domain.rowIndexOf`。

### 2.4 有意没碰的

- **合入侧一个字没动**:`mergeReviewPerShot` / `landed` / `state-put` / `gaps()` / SK-04 一律未触;
- 浏览器闭环 `common` / `cut` 空壳 vs 服务端沿用那条属产品口径,按明令不碰;
- `x.shot.order + 1` 这个镜号取的仍是 `order` 字段(不是实位)——它不是"按 id 取首行"那一族,
  `missing` 那一路同取 `ps.order`,两边同源,本槽不顺手改;
- 计费一处未触(展示面零 LLM 零上游)。

## 三、判据(加测 4 条,改测 1 条)

| 套件 | 条 | 钉的是 |
|---|---|---|
| `domain` 新增一条 | `rowIndexOf` 三态(同 id 第二行按身份定位 / 不是同一棵树上的对象退首行 / 表里没这个 id 回 −1)+ `reviewRows` 逐格(`i` `nth` `shot` 三列 + 越界退首行 + 已删的行回 −1 且 `shot` 给 `null`)+ 重抽面与它逐格对得上 |
| `skills` 新增一条 | **行为面**:同 id 三行(9 / 8 / 4 分)跑 `openEpisodeReport`——三条得分行一条不少、逐行显示的是各自那份分、`原报告已缺失` 一个字不出、`待返工 1 镜` 数得到第三行;再真跑一遍 `onMount` 的跳转 handler,点第三行开出来的是 4 分那份、镜号报 `#1-3` |
| `skills` 新增一条 | **行为面**:三行(`solo` 大全景 / `dup` 特写 / `dup` 特写)对末行跑离线评审——时间码起点等于前两行镜长之和(按 id 断在首行时只累第一镜)、景别衔接结论恰一条且比的是第二行(取首行会报成「两极对切(大全景→特写)」) |
| `contract` 新增一条 | **源级**:整集报告视图段内出现 `Domain.reviewRows(ep)`、不出现 `ep.shots.find(`、行键不是 `x.shot.id`;`js/review.js` 全文零 `.find(x => x.id ===` / `.findIndex(x => x.id ===`;时间码只此一份(`review.js` 零 `function shotTimeRange`、委托 wf-core、wf-core 里按 `Domain.rowIndexOf` 取);两个取法的定义在 `domain.js` 一处且 `const rowsOf = ` 恰 1 次、`reviseTargets` 确实 `return D.reviewRows(ep)` |

**改测一条**(`skills · 审片报告只读消费`):原先 `assertEq(JSON.stringify(rd.issues), JSON.stringify(rc.issues))`
把两镜的 `timeRange` 也比进去了,而两镜台词长短不同、镜长本就不同——**此前相等是夹具里 `window.SB` 没挂
`estShotDuration` 才有的假象**(浏览器实况早就是 9 秒 / 4 秒两段)。改成比问题正文(类型/级别/分析/建议),
断言意图(校验命中不改 issues)一字未减,顺带把夹具与浏览器实况的这处偏差记在注释里。

## 四、变异五手(逐手在**已提交**的树上做、跑完 `git checkout` 还原)

| 手 | 改法 | 红几条 | 报的是 |
|---|---|---|---|
| M1 | `openEpisodeReport` 整段退回 `find` 首行(含 `data-jump`/`data-rid` 那一对) | 2 | `skills` 行为面报「同 id 后几行的报告在自己那一行里,不该被读成缺失」;`contract` 报「不许再按 shotId find 取行」 |
| M2 | `WfCore.shotTimeRange` 退回 `if (x.id === s.id) break` | 2 | `skills` 报时间码起点只累了第一镜;`contract` 报 wf-core 那句 |
| M3 | `localReview` 的上一镜退回 `findIndex(x => x.id === s.id)` | 2 | `skills` 把**实际报出来的那句**打在报错里(`与上一镜两极对切(大全景→特写)`);`contract` 报全文零「按 id 取该 id 第一条」那条 |
| M4 | `reviewRows` 退化成一律取首行 | **6** | `agent-ops` 低分镜问题原文、`commands` CLI produce 修订回写、`domain` 两条、`contract` `reviseSubset` 的 fixes、`skills` 整集报告视图 |
| M5 | `reviseTargets` 绕开 `reviewRows` 自数一遍(按 id 首行) | **6** | 同上五处 + `contract` 新条的「重抽面应长在这份对位之上」 |

M4 那一手是本槽最要紧的一格:**改一个新函数,红的是五个套件里的六条**,其中三条是 W258 / W260 / W256 留下的既有判据。
这直接证明「展示面与编排面此刻读的是同一份对位」——若展示面另抄了一份,M4 只会红编排那几条,
新加的 `skills` 那条照旧绿。M3 那一手另说明一件事:**判词的正则别写得只匹配"对的那句"**——
第一版写的 `/上一镜景别/` 在变异体里匹配不到「两极对切」那句,报的是「结论 0 条」而不是「结论错了」,
放宽成 `/上一镜/` 之后报错句里直接带出实际那句,失败含义才对得上。

## 五、数字(全部 live 现取,不抄交接)

- `node tests/unit.js` **680/680**(基线 676,加 4 条);
- `node tests/integration.js` **152/152**(未加测,合并侧一个字没动,这里全绿本身就是"没搬坏"的判据);
- `node tests/cli.smoke.js` 单独整跑、`env -u HUJING_SERVER -u MV_TOKEN -u MV_BASE -u MV_MODEL`:**115/117**,
  两条失败(`未登录 whoami → exit 3`、`llm --json mock 链路`)与 `master` 同名同表现;
- 不跑 `tests/e2e.js`(按明令)。

棘轮:`['单元测试', 676, …]` → **680**、`const FLOOR = 277;` → **278**(本文一份);
`['集成测试', 152, …]`、`['CLI 冒烟', 117, …]`、`TOPIC_FLOOR`(19)、`SLACK`(3)未动,五格差额全为 0。
`gaps()` 20 键一个没剥,`GUARD_TOPICS` 19 / `CLOSED` 0 / `TOPIC_FLOOR` 19 / 花名册 19 四者仍对齐
(本槽没登记新主题——加护栏不必都登记,登记过的一条没动)。

文档:根 `README.md` 单元用例数 676→680、`contract` 自报条数 146→147、
「审片报告绑定视频版本」那段补一句展示面行对位的口径(点名 `Domain.reviewRows` / `Domain.rowIndexOf` /
`WfCore.shotTimeRange`);`docs/skills-wave/README.md` 明写份数 277→278,索引补本文一行。
`node --check` 过:`js/domain.js`、`js/wf-core.js`、`js/review.js`、`tests/unit.js`。

## 六、残留(按明令一条没代修,原话保留)

1. **`js/batchops.js` 的 `openReviewSummary` 是同形的第二格,本槽没碰**:明令写的是
   「`js/review.js` 的 `openEpisodeReport` 及**同文件**其它按 `find`/`[0]` 取该 id 第一条的展示面」,
   `js/batchops.js` 不在同文件。现取 `js/batchops.js:452`/`:463` 那两行:

   ```
   <div class="rv-bar-row" data-jump="${x.shot.id}">
   const s = ep.shots.find(x => x.id === row.dataset.jump);
   Review.openReport(p, ep, s, main, s.reviews[0]);
   ```

   它比本槽收的那处还多一档:行键是 `shotId`(同 id 多行点哪一镜都跳首行)**且**打开的是
   `s.reviews[0]`(该行最近一条),而不是本批刚跑出来的那一份。改法与本槽 2.3 第二点同形
   (`reports` 就在闭包里,行号当行键即可),三行的事,留给下一槽。

2. **浏览器闭环 `common` / `cut` 空壳 vs 服务端沿用**(W261 §六 2 记的):写回的一直是空壳,
   不是被子集跑弄丢的;要收得先定「浏览器闭环该不该沿用上一轮的集级结论」,属产品口径不属寻址。

3. **`js/review.js` 的 `openEpisodeReview` 没进本槽**(W261 §六 3、W262 §七 记的):
   它是整表那一档,合并对它是恒等;改成走 `WfCore.mergeReviewPerShot` 传 `prev = null` 属纯形状统一,
   没有行为差,本槽按最小改动没做。

4. **同 id 多行的源头照旧没追**(W226、W242、W246、W248、W253、W258、W261、W262 在册):
   本槽同样只收消费面,不动"表里为什么会有同 id 多行"这件事;去重命令(`shots-dedupe`)那一路
   一个字没碰,它明写的「引用面按 find 首行语义解析、首行留原 id」这条前提**在本槽之后仍成立**——
   `rowIndexOf` 拿不到对象身份时退的就是按 id 首行,`reviewRows` 的第 0 条落的也是首行。

## 七、交接

我方尖:见本支 `git rev-parse HEAD`(现取,不在此写死自称)。基线 `db7d531`。
动过的文件:`js/domain.js`、`js/wf-core.js`、`js/review.js`、`tests/unit.js`、`README.md`、
`docs/skills-wave/README.md` 与本文。`js/` 下三个文件之外逐字节未动。
