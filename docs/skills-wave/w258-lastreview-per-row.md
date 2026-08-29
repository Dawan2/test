# W258 · 整集审片写回按行记报告:同 id 多行时后一行盖掉前一行的分与报告

基线:`origin/cursor/w255-integration-9d24` 现取 tip `adf7442`(先 `fetch` 再 `rev-parse`,不抄自称)。
W254/W257 仍在飞,按交接跳过、不等;W256 已完成但本槽不 cherry-pick,它改的 `js/agent-ops.js` 一个字没碰。
分支 `cursor/w258-lastreview-per-row-a7f1`。

**结论先写:停工条件不成立(产品意图不是"按 id 留最新一条"),两处写回各改一处。**
`js/produce.js` 的 `autoSmartReview` 把每镜最后一份报告记在 `lastRep[s.id]` 上,同 id 多行互相覆盖;
`server.js` `/api/wf/smart-review` 的子集复审合并按 `shotId` 去重,把同 id 里没进本轮报告的兄弟行那条一并抹掉。
两处同形(**都是拿 id 当行键**),故一起收,分两个提交登记。

**没碰的**:`js/agent-ops.js` 零 diff(W256 改的 `d.lowShots` 取材面不在本槽射程);
`generateImage`/`generateVideos` 的 `landed`/`ok` 一个字未动;`state-put` 仍只有 `need(f.force)` 一道闸;
`Skills.gaps()` 未剥;达标线 `Domain.REVIEW_MIN`、报告判旧、与分镜表取交集、定稿不重抽、
`reviseRetryLimit` 收敛次数五条判据一个字未动;`js/domain.js`、`js/wf-core.js`、`js/review.js`、
`cli.js`、`mcp.js` **零 diff**;计费口径与两处端点的回执字段集未变。

---

## 一、先 live:整集审片同 id 两行之后,`lastReview.perShot` 到底是几条

### 1.1 浏览器闭环(`js/produce.js`)

沙箱 `runInContext` 真 `js/produce.js` 本体(依赖照 `index.html` 顺序装 `domain`/`prompts`/`knowledge`/`wf-core`),
换掉的只有 `Review.reviewShot`(按调用次序出分,同 id 两行拿同一条序列的第 0、第 1 项)与生成引擎。
四档现跑,`sbConfig.maxRetry: 1`:

| 档 | 分镜表 | 逐行真分 | 基线 `perShot` | 基线 `avg` | 基线 `reviseTargets` |
|---|---|---|---|---|---|
| ① | `dup` / `dup` | 8 / 9 | **2 条,分全是 9**,`reportId` 全是 `rv#1` | **9**(应 8.5) | 空 |
| ② | `dup` / `dup` | 5(转人工)/ 9 | **2 条,分全是 9** | **9**(应 7) | **空**(行1 那份 5 分没了) |
| ③ | `dup` / `dup` / `dup` | 9 / 8 / 6 | **3 条,分全是 6** | **6**(应 7.7) | **三行全在**(两个达标行被拉进重抽) |
| ④ | `a` / `b`(异 id 对照) | 8 / 9 | 2 条,8 与 9 | 8.5 | 空 |

三件事一次读齐:

- **条数一直是对的**:`reviewed.map(...)` 按行出条目,一行一条。所以"几条"这个问题的答案是
  **"行数那么多条,一条不少"**——覆盖发生在**条目内容**上,不在条数上。判据因此不能看条数。
- **后一行确实盖掉前一行**:`score`/`reportId`/`videoInputHash` 三个字段一律是**最后一次评审**那一份
  (③ 里最后一次是行3 重抽后的复评 `rv#3`,连行1、行2 的 `reportId` 都指着它)。
- **下游两个消费面各错各的方向**:② 里低分行的报告被 9 分盖掉,重抽名单**空**,而这一行的
  `s.confirm` 是 `false`——用户看到的是「均分 9 分、无人待返工」,而实际有一行片子是 5 分且没人管;
  ③ 反过来,达标的两行被 6 分盖掉,重抽名单把**三行全拉进去**,下一轮三笔重抽钱里两笔是白花的。
  发布门 G3 只读 `lastReview.avg`,故 ② 那一集按 9 分放行。

### 1.2 服务端子集复审(`server.js` `/api/wf/smart-review`)

真 `server.js` 子进程 + HTTP 直打(`MOCK_LLM=1`,临时 `MV_DATA_DIR`/`MV_UPLOADS_DIR`/`MV_CONFIG`)。
分镜表三行:`dup`(行0)、`dup`(行1)、`solo`(行2),全已出片。

**整集审片那一趟是对的**:`reports` 按行推、`newPer` 逐行各一条,三条各带各自的 `reportId`。
覆盖只发生在**合并**那一句上:

```
prev.perShot.filter(x => !newPer.some(y => y.shotId === x.shotId) && ep.shots.some(s2 => s2.id === x.shotId))
```

`shotIds` 是**按 id 点名**的,而本轮可审面另有一道 `!s.final && shotVideoReady && !generating`。
两道口径不同宽时,同 id 里有的行进得了报告、有的进不了,而上面那一句一律按 id 抹:

| | 复审前 `perShot` | 本轮 `reviewed` | 基线复审后 | 本槽复审后 |
|---|---|---|---|---|
| 两行都可审 | 3 条(6 / 9 / 8) | 2 | 3 条(两行都换新) | 3 条(同) |
| **行0 定稿** | 3 条(6 / 9 / 8) | 1 | **2 条**——行0 那条 6 分**凭空消失**,`avg` 按剩下两行算 | 3 条,行0 那条原样留着 |

"进不了本轮报告"的来路不止定稿一种:未出片、在飞、以及**逐镜评审失败**(`failed.push` 那一路)
都会让同 id 的某一行不在 `newPer` 里,而它上一轮的条目照样被抹。评审失败那一路更难受——
用户看到的是「reviewed=1、failed=1」,而少掉的那条报告他不会知道。

### 1.3 停工条件:不成立

交接给的停工条件是「产品意图就是按 id 留最新一条」。三处现取的实况反过来:

1. **写回侧自己就是按行的**:`reviewed.map(s => ({ shotId: s.id, order: s.order, … }))` 逐行出条目、
   `order` 逐行各取自己的实位。要是意图按 id 留一条,这里该先按 id 去重——现跑是
   「按行出条目、按 id 取内容」,两头对不上,正是闷声写错行的形状。
2. **下游 `Domain.reviseTargets` 明写按行**(W253 落的):它在整份 `perShot` 上数序数,
   `nth` = 第几条同 id = 第几行同 id,并据此解析实位。这份派生成立的前提就是
   「同 id 有几行,`perShot` 上就有几条各归各行」。
3. **另一处同构写回本来就是按行的**:`js/review.js` 的 `openEpisodeReview` 用 `reports.map(x => …)`
   (`x.shot` 是行对象)逐行出条目,从来没有按 id 记这一步。`js/produce.js` 那段注释写着
   「与 `review.js openEpisodeReview` / 服务端 wf smart-review 同构」,而它恰恰是三处里唯一不同构的。

交接同时明令**不许改成按 id 只审一行**(那样后几行永远审不到),故只有一条路:按行/序数记。

---

## 二、改了什么(两处,`js/produce.js` +6 −3、`server.js` +12 −4)

### 2.1 `js/produce.js`:`lastRep` 按镜头行对象记

```
const lastRep = new Map();
…
lastRep.set(s, r);
…
const reviewed = targets.filter(s => lastRep.has(s));
avg:     … reviewed.reduce((a, s) => a + lastRep.get(s).score, 0) / reviewed.length …
perShot: reviewed.map(s => ({ …, score: lastRep.get(s).score, reportId: lastRep.get(s).id, … }))
```

键取**行对象身份**而不是序数:`targets` 本来就是行对象的数组,收尾那一句 `targets.filter` 也拿着同一批对象,
中间不存在第二次寻址,故不需要像 `cli.js` 那样另记一张序数表(那一侧有 `withProject` 的重取往返,形态不同)。

`reviewed` 那一句跟着换成 `lastRep.has(s)` 是**同一处病灶的另一面**:按 id 查时,
行1 审过、行2 一次没审成(积分不足 / `reviewShot` 回 `null`)也会判行2「有报告」,
于是行2 凭空多出一条按行1 那份分算的条目——一次没审的行在整集报告里成了达标行。
现在只有真审过的行出条目。

`common`/`cut` 仍是那份空壳(闭环不做整集共性汇总与四维评审)、`snapshotHash`/`sourceRev`/`graphRev`
三个判旧位一个字未动。

### 2.2 `server.js`:合并按行序数对位

```
const rowNth = new Map();
(() => { const seen = Object.create(null); (ep.shots || []).forEach(s => { rowNth.set(s, (seen[s.id] = (seen[s.id] || 0) + 1) - 1); }); })();
const newKeys = new Set(reports.map(x => x.shot.id + '#' + rowNth.get(x.shot)));
const prevSeen = Object.create(null);
const perShot = prev
  ? (prev.perShot || []).filter(x => {
      const nth = (prevSeen[x.shotId] = (prevSeen[x.shotId] || 0) + 1) - 1;
      return !newKeys.has(x.shotId + '#' + nth) && (ep.shots || []).some(s2 => s2.id === x.shotId);
    }).concat(newPer).sort((a, b2) => a.order - b2.order)
  : newPer;
```

三点各有理由:

- **新条目那一侧的序数在 `ep.shots` 全表上数,不在 `reports` 上数**。`reports` 只装本轮审到的行,
  在它上面数出来的序数是「本轮第几条同 id」,与 `perShot` 上的「第几行同 id」不是一个口径:
  行0 定稿、只审得到行1 时,后者把行1 算成第 0 行,于是换掉的是行0 那条、行1 的旧条目反倒留着
  (变异 3 现跑就是这个形状)。这一格与 `Domain.reviseTargets` 的「序数在整份 `perShot` 上数」同一条理。
- **旧条目那一侧的序数在 `prev.perShot` 上数**。合并产出按 `order` 排序,而 `order` 取的是行实位,
  故同 id 的条目在 `perShot` 上恒按行序排列,两侧序数因此自洽。
- **"这一行还在不在"那半个判据没动**(`ep.shots.some(s2 => s2.id === x.shotId)`)。
  它管的是「报告写下之后这个 id 被整批删了」,与本槽要收的「哪一条被本轮替换了」是两件事;
  一起改会连带动到"行数缩水时旧条目怎么办"的口径,不在射程内。

### 2.3 唯一 id 的表:逐字节等价

同 id 只有一行时 `nth` 恒 0,两处产出与基线逐字相同。§1.1 档 ④ 与 §1.2 第一行(两行都可审)
是这一点的正面读数;整集审片那一趟(`prev` 为 `null`)本来就走 `perShot = newPer`,一个字没经过新代码。

---

## 三、钉测试(`tests/unit.js` +2 条,`tests/integration.js` +4 条)

| 落点 | 钉的是 |
|---|---|
| `produce` 套件新增一条 | 同 id 两行、真分 5(转人工)/ 9:两条 `perShot` 的**分各归各行**、两个 `reportId` **互不相同**、`avg` 按逐行真分算(7 而不是 9)、`confirm` 只落在达标那行;末尾另钉 `Domain.reviseTargets` 只捞出行1(实位 1、5 分、`nth` 0)——覆盖时这里要么空、要么两行全在 |
| `produce` 套件新增一条 | 行1 审过、行2 `reviewShot` 回 `null`:`perShot` 只出 1 条且是行1(`order` 0),没审成的行不许挂上兄弟行的报告 |
| `integration` 新增四条 | 同 id 两行 + 独立一行的真项目:种子 PUT / 整集审片三条各带各自 `reportId` / **把同 id 首行定稿后按 id 点名复审**——只审得到次行,而首行上一轮那条须原样留着(3 条、`reportId` 仍是 `q0`、分仍是 6)/ `avg` 按合并后的三行现算 |

判据一律不看条数(§1.1 已量出覆盖时条数是对的),看**逐行的分与 `reportId` 归谁**。
`produce` 套件的评审桩顺带补了一个 `id: 'rv#' + n` 字段(此前只回 `score`/`issues`,量不出 `reportId` 串位)。
集成那一档**定稿的挑首行不挑次行**,为的是让「按 id 去重」与「序数在本轮报告上数」两种错法给出不同的缺件。
`tests/cli.smoke.js` 未加(真跑整集审片要真上游);按用户约定 `node tests/e2e.js` 本槽**未跑**。

### 3.1 变异四手,逐手红在自己那一句

| # | 怎么改坏 | 结果 |
|---|---|---|
| 1 | `js/produce.js` 整处退回按 `s.id` 记 | 红 **2**(unit):覆盖那条(`期望 [5,9],实际 [9,9]`)+ 没审成那条(`期望 1,实际 2`) |
| 2 | `server.js` 合并退回按 `shotId` 去重 | 红 **2**(integration):兄弟行那条(实测只剩 2 条,首行 `q0` 不在)+ 均分那条(`avg=8.1`,分是 `[8.2,8]`) |
| 3 | `server.js` 新条目序数改在 `reports` 上数 | 红 **1**(integration):兄弟行那条——条数仍是 3 而 `q0` 没了、次行占了两条(与变异 2 的缺件形状不同,读报错分得出是哪一层错) |
| 4 | `js/produce.js` 只退写回那一半(`reviewed` 仍按行筛,`score`/`reportId` 改回按 id 取) | 红 **1**(unit):只有覆盖那条,没审成那条**保持绿**——两条判据确实各钉各的面 |

方法性的两格,原样记下:

- **变异 4 是补第二条用例的理由**:两条用例覆盖的是同一处代码的两半(内容取材 / 出不出条目),
  一起写成一条时读报错分不出病灶在哪半;分开之后变异 4 只红一条,方向一眼读得出。
- **变异 2 与变异 3 在"少了什么"上不同形**,这一点靠的是集成那一档把定稿行摆在**首行**:
  摆在次行时两种错法都恰好得出"3 条且都对"或"2 条",分不开。夹具的辨识力是设计出来的,不是碰上的。

判据先提交再演练(产品码与两个提交在前,变异在后),每手跑完从备份还原清场。

---

## 四、live 数字(全部现跑,含本文)

| 项 | 基线 `adf7442` | 本槽 |
|---|---|---|
| `node tests/unit.js` | 669/669 | **671/671 PASS** |
| `node tests/integration.js` | 148/148 | **152/152 PASS** |
| `node tests/cli.smoke.js` | 115/117 | **115/117**,失败仍是同名那两条:`未登录 whoami → exit 3`、`llm --json mock 链路`(与 `master` 同名同表现) |
| 记账件份数 | 269 | **270**(含本文) |

棘轮同轮抬到当轮实况:`['单元测试', 671, …]`、`['集成测试', 152, …]`、`const FLOOR = 270;`;
`['CLI 冒烟', 117, …]`(实测 117,已是当轮实况)、`TOPIC_FLOOR`、`SLACK` 未动。
根 `README.md`:单元用例数 669→671、集成测试那行 `W231 扩至 148` → `W258 扩至 152` 并在覆盖面末尾补本槽这一档;
「智能审片闭环」那段补收尾写回按行记报告的口径,`/api/wf/smart-review` 那行补子集复审合并按行对位。
`docs/skills-wave/README.md` 明写份数 269→270,索引补本文一行。
`node --check` 过:`js/produce.js`、`server.js`、`tests/unit.js`、`tests/integration.js`。

有一处**判据自身的坑**值得记:改动的第一版把病灶注释写成「…与 `Domain.reviseTargets` 的重抽名单…」,
当场红在 `contract` 套件 SK-25 那条上——它按源码文本判「浏览器闭环此刻仍不引整集重抽面派生」,
而那条判据扫的是整份源码、不区分注释。注释改成「下游按 `perShot` 派生的重抽名单」即过。
这不是判据太严:SK-25 的仍欠段就靠这个字面守着,注释里出现同一个标识符确实读不出"接没接上"。

---

## 五、交接

1. **W253 §五 1 点名的两格,本槽全收**(浏览器 `lastRep` 按 id 记、服务端合并按 id 去重)。
   该条残留可销号。
2. **`js/agent-ops.js` 的 `d.lowShots` 仍按 `find` 首行取报告原文**:W256 动的是这一处,
   本槽按交接一个字没碰,状态以 W256 那支为准,本槽不复述它的读数。
3. **`js/produce.js` 的 `autoSmartReview` 是整表覆盖写回,没有子集合并语义**:
   命令层用 `shotIds` 点名子集跑它时,`ep.lastReview` 会被这一批的条目整份替换掉、
   没被点名的行上一轮那条一起没了(与本槽收的服务端那一格同源,但那一侧有 `prev` 合并、这一侧没有)。
   这一格**本槽量到了但没修**:它要新增"浏览器侧也做合并"这件事,不是改一处寻址,
   而且合并口径得与服务端那份对齐(两端同一份派生才不会漂移),体量与射程都超出本槽。
   收法建议:把合并那一段下沉成 `WfCore` 的一个纯函数(入参 `prev.perShot` / 本轮条目 / `ep.shots`),
   两端同读一份,顺带把本槽写在 `server.js` 里的序数对位一并搬过去。
4. **整集审片按行出报告,而 `s.reviews` 是挂在行对象上的**,故 `reportId` 回取原报告这条路
   在同 id 多行下是通的(各行查各行的 `reviews`)。`js/review.js` 的 `openEpisodeReport`
   用 `ep.shots.find(x => x.id === ps.shotId)` 取行、再在那一行的 `reviews` 里按 `reportId` 找,
   **取行那一步仍是首行**:同 id 多行时后几条会去首行里找自己的报告、找不到就记进 `missing`
   标「原报告已缺失」(得分仍按 `perShot` 快照展示,不崩)。这是**展示面**的降级、不落任何写回,
   按最小改动没碰;要收就是把 `perShot` 的序数解析口径搬过去一份,与本槽两处同形。
5. **同 id 多行为什么会存在,本槽照旧没追到源头**(W226、W242、W248、W253 在册)。
   本槽只保证这种表存在时,整集审片报告上每一行的分与报告归它自己。
6. 冲突面提示:`js/produce.js` 只改 `autoSmartReview` 里 `lastRep` 那三处(声明 / `set` / 收尾三句取值),
   与 W253 改的 `cli.js` `reviseLowShots` 不在同一个文件;`server.js` 只改 `/api/wf/smart-review` 里
   `逐镜分合并` 那一段(`newPer` 声明前后共 12 行),`ep.lastReview = {` 那个字面一个字没动
   (`contract` 套件有一条按这个字面定位服务端回流点)。
   `tests/unit.js` 两条新用例插在 `produce` 套件「达标线现取 `Domain.REVIEW_MIN`」那条之后、
   「quiet 不建 dock」那条之前;`tests/integration.js` 那一段插在 21 与 22 之间(编号 21b),
   合并时按「两侧各在同一插入点追加」处理。
