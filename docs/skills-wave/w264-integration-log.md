# W264 集成记账:W263 审片展示面按行对位并进集成线

一条槽并进同一条集成线,一次真 `--no-ff`。本文只记集成面的读数与判断,槽自身的病灶/改法/变异见 `w263-review-view-row-nth.md`(同目录)。

**本槽是集成线上第二条「快进形」**(上一条是 W262):对侧是我方尖的直系后代,`git merge-base` 现取恰等于我方尖。四棵树坍成两个值、冲突数 0、真并集 0 处。W262 §三 立下的那条规矩在本槽照办——**树比对这类证据整体归零,「有没有丢东西」改由变异 + live 实测承载**。

## 一、拓扑与 SHA(全部现取)

| 位 | 交接自称 | 现取 | 核对 |
|---|---|---|---|
| 我方尖(P1,W262 集成线) | `db7d531` | **`db7d531`** | `git fetch` 后 `rev-parse origin/cursor/w262-integration-6ca8` |
| 被合入支(P2,W263) | `e555c97` | **`e555c97`** | `rev-parse origin/cursor/w263-review-nth-0160` |
| 叉点(B) | 交接说 W263 从 w262 尖 `db7d531` 起支 | **`db7d531`** | `git merge-base P1 P2` 现取 |

**三个 SHA 自称全对**,且 `B == P1` 现取成立。`git merge-base --is-ancestor P1 P2` 回 0,即我方尖是对侧的直系祖先——与 W262 同形:对侧没走过集成线,是从我方尖直接长出来的一条功能支。

`P1..P2` 只有两条提交:`ddb165c`(产品改动)与 `e555c97`(记账提交)。**支尖是记账提交而不是 merge commit**,这一点与交接给的自称一致。

新支 `cursor/w264-integration-b862` 从 **`db7d531`** 拉出,`checkout -b` 之后立刻 `rev-parse HEAD` 现取等于 w262 尖。

merge parents 现取:`db7d531` + `e555c97`,merge commit **`7f5ebf3`**。`--no-ff` 明给,git 报 `Merge made by the 'ort' strategy`、**零冲突**。快进形下 git 本可以直接快进,`--no-ff` 是为了在集成线上留住这个合入点。

## 二、四棵树:只有两个不同值

```
B  471ce56fec392b65e207dc132d54625c09d341b5
P1 471ce56fec392b65e207dc132d54625c09d341b5   ← == B
P2 1b0178e13e62395e072a78e75edeb96d79b8f1d3
M  1b0178e13e62395e072a78e75edeb96d79b8f1d3   ← == P2
```

逐文件同样只有两档:

| 文件 | `B`/`P1` blob | `P2` blob | `M` blob | 读数 |
|---|---|---|---|---|
| `js/domain.js` | `2f25774` | `00e8856` | `00e8856` | 整份取对侧 |
| `js/review.js` | `789c630` | `5d5f7b8` | `5d5f7b8` | 整份取对侧 |
| `js/wf-core.js` | `ff86bc7` | `729be6b` | `729be6b` | 整份取对侧 |
| `tests/unit.js` | `a937dd5` | `2e1ed84` | `2e1ed84` | 整份取对侧 |
| `README.md` | `ece3c62` | `1ff24e8` | `1ff24e8` | 整份取对侧 |
| `docs/skills-wave/README.md` | `c7e3f27` | `31a14fa` | `31a14fa` | 整份取对侧 |
| `w263-review-view-row-nth.md` | 不存在 | `2825d7e` | `2825d7e` | 对侧新增 |

`git diff --name-only B P1` **0 个文件**、`git diff --name-only B P2` **7 个文件**,两侧改动文件集合的交集是**空集**。真并集 0 处、冲突 0 处——**这个「0」不带信息,上界与下界都是 0**。

## 三、`git diff 我方 对侧` 在本槽量出空,而这句话是恒真的

`git diff HEAD origin/cursor/w263-review-nth-0160` 现取确实是空集。**这不能读成「没丢东西」**:它在快进形里恒成立,在「整份覆盖把我方那半丢了」的情形里同样成立——整份覆盖正是快进形的合法形态,两者在树比对上无从分辨。W262 §三 已把这一条写死,本槽是第二次照办,不是第一次发现。

只补一条 W262 没单独量过的读数,用来把「我方那半没被覆盖掉」这件事从树面上兜住:**逐关键词在三棵树上点数**(范围 `js/` + `tests/` + `cli.js`/`server.js`/`mcp.js`)。

| 关键词 | `B`(w262 尖) | `P2`(w263 尖) | `M`(合完) |
|---|---|---|---|
| `landed` | 99 | 99 | **99** |
| `nthShot` | 10 | 12 | **12** |
| `pickerNarrowHits` | 9 | 9 | **9** |
| `dupRowsNote` | 30 | 30 | **30** |
| `floorLagVerdict` | 7 | 7 | **7** |
| `mergeReviewPerShot` | 11 | 15 | **15** |
| `shots-dedupe` | 41 | 41 | **41** |
| `reviewRows` | 0 | 18 | **18** |
| `rowIndexOf` | 0 | 17 | **17** |
| `gaps()` 键数 | 20 | 20 | **20** |

`M` 每一格都 `>= B`,一格没往下走;`reviewRows`/`rowIndexOf` 两格从 0 起是对侧新立的。这只是**必要条件**(整份取对侧时它自然成立),真正的判据仍是下一节。

## 四、变异:四手,证明这几个函数真被判据咬着

判据不是「函数在不在树里」,是**改坏它会不会红、红在哪几条**。四手都在**已提交**的树上做、跑完还原并复跑确认回到 680(W260 §末 那个坑:未提交的编辑会被 `git checkout HEAD --` 一起冲掉,读出一串假绿)。

**M1 —— `Domain.rowIndexOf` 摘掉对象身份那一路**(`list.indexOf(item)` 恒取 `-1`,即一律退回按 id 首行):

```
FAIL | domain · 行对位单源:reviewRows 把逐镜条目落到自己那一行,rowIndexOf 按对象身份定位(拿不到身份才退首行)
       | 同 id 的第二行按对象身份定位到实位 2(按 id 取首行时是 0):期望 2,实际 0
FAIL | skills · 离线评审按行对位:时间码从本行之前累起,景别衔接比的是本行的上一镜
       | 时间码起点应累到本行之前(按 id 断在首行时只累了第一镜):期望 "00:06 - 00:09",实际 "00:03 - 00:06"
```

**红 2**,且两条分属 `domain` 与 `skills` 两个套件:一条打的是函数自身的契约,一条打的是 `WfCore.shotTimeRange` 那个**下游消费点**真读着它——这一格是「wf-core 那份时间码不是自己另写了一遍对位」的直接证据,树比对给不出。

**M2 —— `Domain.reviewRows` 退化成一律取首行**(`rows[nth]` 改 `rows[0]`,即模拟"收了函数但没收 `nth` 语义"这个本槽最该防的失败):

```
FAIL | agent-ops · stateDigest:同 id 多行时每条低分镜的问题原文取自己那一行的 reviews(取首行即红)
FAIL | commands · CLI produce 修订回写:同 id 多行时改的是本轮那一行(几笔优化钱不许全写首行)
FAIL | domain · reviseTargets:同 id 多行时逐条落到自己那一行(第几条逐镜分 = 第几行同 id,序数同 nthShot)
FAIL | domain · 行对位单源:reviewRows 把逐镜条目落到自己那一行,rowIndexOf 按对象身份定位(拿不到身份才退首行)
FAIL | contract · 修订闭环重抽面:WfCore.reviseSubset 镜集恒等 Domain.reviseTargets,fixes 按 reportId 回取报告原文
FAIL | skills · 整集报告视图按行取报告:同 id 多行各自那份都在列,点某镜跳的是那一行(不是首行那份)
```

**红 6,横跨 `agent-ops` / `commands` / `domain` / `contract` / `skills` 五个套件**。这是本槽最有分量的一格:改的是**对侧新加的一个函数**,而红的里头有三条是 W256/W258/W260 立的**既有**判据——它们跟着一起红,说明 `reviseTargets` 是真长在 `reviewRows` 上、而不是树上留了第二份逐字相同的对位。对侧记账里自称的「M4 红 6 横跨五个套件」在合完的树上**逐条复现**。

**M3 —— `openEpisodeReport` 退回按 id 取首行**(`Domain.reviewRows(ep)` 换回 `perShot.map` + `ep.shots.find(s => s.id === ps.shotId)`,即模拟"合入时把展示面那一端丢了"):

```
FAIL | contract · 审片展示面行对位(源级):整集报告视图与时间码都不许按 id 取首行,两个取法只在 domain.js 一份
       | 逐镜条目应经 Domain.reviewRows 落行(与写回侧同一套行对位)
FAIL | skills · 整集报告视图按行取报告:同 id 多行各自那份都在列,点某镜跳的是那一行(不是首行那份)
```

**红 2**,行为面与源级各一条:源级那条拦的是"写法退回去",行为面那条拦的是"结论错了",两条缺一都留得下半个口子。

**M4 —— `js/review.js` 把 `shotTimeRange` 重新内联一份**(照 W263 收编前的形状写回本地实现,按 id `findIndex`):

```
FAIL | contract · 审片展示面行对位(源级):…… | review.js 不该再自留一份时间码实现:期望 0,实际 1
FAIL | skills · 离线评审按行对位:…… | 时间码起点应累到本行之前:期望 "00:06 - 00:09",实际 "00:03 - 00:06"
```

**红 2**。这一手值得单记:它模拟的不是"删掉功能",而是**"两端各留一份"**——树上函数一个没少、`WfCore.shotTimeRange` 还在,只是消费方不读它了。这一路树比对与关键词点数(§三 那张表)**都看不出来**,只有源级那条 `(rv.match(/function shotTimeRange/g)||[]).length === 0` 咬得住。

四手还原后复跑 **680/680**,一条不差。

## 五、数字:全部合完 live 实测

| 口径 | W262 自称 | W263 自称 | **合完 live** | 怎么取的 |
|---|---|---|---|---|
| 单元测试 | 676 | 680 | **680/680 PASS, 0 FAIL** | `node tests/unit.js` |
| 其中 `contract` | 146 | 147 | **147/147** | `node tests/unit.js contract` |
| 集成测试 | 152 | 152 | **152/152 PASS, 0 FAIL** | `node tests/integration.js` |
| CLI 冒烟 | 115/117 | 115/117 | **115/117** | 单独整跑,见下 |
| 记账件份数 | 277 | 278 | **279**(含本文) | 目录实况点数 |

**676 一个字没抄**:合入前先在 `db7d531` 上把 `unit` 与 `integration` 各跑了一遍现取基线(676 / 152),合完再跑得 680 / 152——**+4 是跑出来的差,不是从对侧自称里读来的**。快进形下这两个数理应等于对侧自称,但「理应相等」与「实测相等」是两回事,W262 §三 2 记的就是这一格。

`cli.smoke` 按明令**单独跑**,且 `env -u HUJING_SERVER` 加 `MV_DATA_DIR` / `MV_UPLOADS_DIR` / `MV_CONFIG` 三个 env 重定向到临时目录:

```
==== CLI 冒烟:115/117 通过 ====
FAIL | 未登录 whoami → exit 3 | exit=1
FAIL | llm --json mock 链路 | undefined
```

两条失败与 `master`(`9adcf0f`,同 env 下 `51/53`)**同名同表现**,按明令属允许项。两侧总数 117 未变(本槽零加测)。

## 六、README / GUARD / roster / 索引:并集与棘轮

快进形下 README 与 `docs/skills-wave/README.md` 都是「整份取对侧」,**不存在两侧同改一行的冲突块**(W260 那一格本槽没出现)。故这一节记的是**合完之后按 live 复核**的结果,以及本文自己带来的那一格变动:

- `README.md`:对侧已把「单元测试(680 项断言)」与 `contract`「实测 147 条断言」改到位,合完 live 逐个相等,**不再动**。集成测试 152、`cli.smoke` 那句「2 项与 `master` 同名的失败不影响它」同样与 live 一致。
- 棘轮三套件那格:`['单元测试', 680, …]`、`['集成测试', 152, …]`、`['CLI 冒烟', 117, …]` 与 live 逐格相等,**差额全为 0**,本槽零加测故一格未动。
- 记账件那格:目录实况 278 → **279**(本文),故 `docs/skills-wave/README.md` 明写份数 278 → 279、索引补本文一行(按波次号递增排在 `w263` 之后),`tests/unit.js` 的 `const FLOOR = 278` → **279**。三方对齐(目录实况 == 声明 == 索引行数)现取成立。
- `SLACK` **3** 一格未动;五格差额合完全为 0,一格没用掉。
- `gaps()` **20 键**一个没剥(`G-01`…`G-15` 缺 `G-06`、`S-01`/`S-03`…`S-07`),与 `B` 逐键相等。
- `GUARD_TOPICS` **19** / `GUARD_TOPICS_CLOSED` **0** / `TOPIC_FLOOR` **19** / 花名册 **19**,四者对齐,一条没销号。

## 七、核对:对侧自称的产品语义逐条现取

按明令**不改 W263 产品语义**,只核在不在、真不真:

| 交接自称 | 现取 |
|---|---|
| `Domain.rowIndexOf` 在 | `js/domain.js:660` 在,按对象身份 `indexOf`、拿不到身份退 `findIndex` 按 id 首行 |
| `Domain.reviewRows` 在 | `js/domain.js:665` 在,`nth` 在整份 `perShot` 上数、行不够数退首行、id 不在表里回 `i = -1` |
| `openEpisodeReport` 不再 `find(id)` | `js/review.js:619` 现取是 `Domain.reviewRows(ep).map(...)`;同函数内仅剩的一处 `.find` 是 `:621` 的 `(t.shot.reviews||[]).find(r => r.id === t.ps.reportId)`——**在本行的 `reviews` 里按 `reportId` 取报告,不是按 shot id 取行**,不属被禁那一类 |
| `reviseTargets` 长在 `reviewRows` 上 | `js/domain.js:693` 现取 `return D.reviewRows(ep)` 起手,其上只加达标线/交集/定稿三道筛,自身不再数一份 `rowsOf` |
| `shotTimeRange` 走 wf-core | `js/review.js:17` 是 `(ep, s) => WfCore.shotTimeRange(ep, s)` 一句转发;实现在 `js/wf-core.js:496`,行对位取 `Domain.rowIndexOf`。`review.js` 里 `function shotTimeRange` 出现 **0** 次 |
| unit 680 / integration 152 | live 实测同值,见 §五 |

`node --check` 过:`js/domain.js`、`js/review.js`、`js/wf-core.js`、`tests/unit.js`。按明令**不跑 e2e**。

## 八、残留(按明令一条没代修,原话保留)

交接明令点名本槽不代修的三条,原话逐条搬下:

1. **`js/batchops.js` 的 `openReviewSummary` 是同形的第二格,本槽没碰**(W263 §六 1 原话):

   > 它比本槽收的那处还多一档:行键是 `shotId`(同 id 多行点哪一镜都跳首行)**且**打开的是
   > `s.reviews[0]`(该行最近一条),而不是本批刚跑出来的那一份。改法与本槽 2.3 第二点同形
   > (`reports` 就在闭包里,行号当行键即可),三行的事,留给下一槽。

   现取 `js/batchops.js:452`/`:463`/`:465` 三行,与 W263 记的逐字相同:

   ```
   <div class="rv-bar-row" data-jump="${x.shot.id}">
   const s = ep.shots.find(x => x.id === row.dataset.jump);
   Review.openReport(p, ep, s, main, s.reviews[0]);
   ```

2. **浏览器闭环 `common` / `cut` 空壳 vs 服务端沿用**(W263 §六 2 原话):

   > 写回的一直是空壳,不是被子集跑弄丢的;要收得先定「浏览器闭环该不该沿用上一轮的集级结论」,
   > 属产品口径不属寻址。

   现取 `js/produce.js:326`/`:327` 仍是 `common: { summary: '', issues: [] }` 与 `cut: null`,一字未动。

3. **同 id 多行的源头照旧没追**(W263 §六 4 原话):

   > 本槽同样只收消费面,不动"表里为什么会有同 id 多行"这件事;去重命令(`shots-dedupe`)那一路
   > 一个字没碰,它明写的「引用面按 find 首行语义解析、首行留原 id」这条前提**在本槽之后仍成立**——
   > `rowIndexOf` 拿不到对象身份时退的就是按 id 首行,`reviewRows` 的第 0 条落的也是首行。

   `shots-dedupe` 在四棵树上出现次数逐个相等(41,见 §三),本槽一个字没碰。

W263 §六 还有一条(第 3 条,`js/review.js` 的 `openEpisodeReview` 没进那一槽,属纯形状统一无行为差),交接未点名,本槽同样没碰,一并留在册。

## 九、这一槽学到的

1. **快进形第二次遇到,判据换类这件事本身已成惯例**——W262 是发现,本槽是照办。值得补的只有一格:§三 那张关键词点数表是「我方那半没被整份覆盖掉」的**必要条件**,别把它当充分条件用,M4 就是一条"关键词点数全对而消费点已经断了"的活例。
2. **变异要挑「删不掉但读得断」的那一处**。M1/M2/M3 打的都是"改坏实现",M4 打的是"实现还在、没人读了"——后一类在整份取对侧的合入里才是真风险(合入不会删函数,只会把某一端的调用点丢回旧版),而它只被**源级**判据咬着。四手里 M4 最像本槽该防的失败,却最不显眼。
3. **支尖不是 merge commit 这件事要在终稿里写清**。对侧 `P1..P2` 两条提交里,`ddb165c` 才是产品改动、`e555c97` 是记账提交,交接给的自称指的是后者;本槽的支尖同理——merge commit 是 `7f5ebf3`,而本支最终的尖是本文这条记账提交(现取,不在此写死自称)。

## 十、交接

我方尖:见本支 `git rev-parse HEAD`(现取,不在此写死自称)。基线 `db7d531`,合入 `e555c97`,merge commit `7f5ebf3`。
本槽自己动过的文件:`tests/unit.js`(`FLOOR` 278 → 279 一处)、`docs/skills-wave/README.md`(明写份数与索引行)与本文。
`js/` 下**逐字节未动**——W263 的产品语义按明令一行没改。
