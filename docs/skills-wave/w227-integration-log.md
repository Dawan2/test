# W227 集成记账:W224 智能审片一镜也没审时回执说清原因

新基线 `cursor/w225-integration-4a7d`,tip **`ced93df`**(`git fetch` 后 `git rev-parse` 现取)。
**交接自称的 `fa6ac3a` 是那条合入链的 merge 提交、不是分支 tip**——其后还有一个把份数与两格下限
校到 live 的 `docs` 提交 `ced93df`;按自称那个 SHA 起手会把 W225 自己那份记账件与两格 `FLOOR`
一起丢掉。命令行里一个 SHA 都不从交接文里抄,先 `fetch` 再 `rev-parse`,自称与现取不符时以现取为准。
被合入支 `cursor/w224-success-result-note-5b1d` 现取 head **`ad9906b`** 与自称同值,但同样是量出来的不是采信的。

本槽合**一条**已完成支,一次 `--no-ff` 且两个 parent 齐全:

| 序 | 被合入支 | 自称 head | 现取 head | merge commit | parents(现取) | 共同祖先(现取) |
|---|---|---|---|---|---|---|
| 1 | `cursor/w224-success-result-note-5b1d` | `ad9906b` | `ad9906b` | `caccbda` | `ced93df` + `ad9906b` | `16baeb9`(W220) |

`git cat-file -p caccbda` 数出 **2 行 `parent`**,是真 `--no-ff` 不是快进;全程没用过 `--ours`,
没用过 `git checkout <old> -- .`,三处冲突没有一处是靠机械丢掉一侧收的场。

叉点与交接给的基线对上:W224 从 W220(`16baeb9`)出,而基线这一侧自 W220 起又走了 W222/W225 两条合入链,
两支互不相识。故 W224 自称的 **645 / 235** 与基线自称的 **646 / 239**,在合完这棵树上**一个都不是答案**,
合完 live 是 **648 / 241**。

跳过的三件按口径一条没碰:在飞的 **W226**(分镜 id 写入去重,从 W222 出)、`master` 没合、没有开第三条功能支,
也没有 cherry-pick 任何已在基线里的东西。

合完整棵产品树相对**叉点** `16baeb9` 只此四个文件,恰是两侧各自那份的并集:

```
git diff --numstat 16baeb9 HEAD -- js/ server.js cli.js mcp.js billing.js index.html css/
13	2	js/commands.js     ← W224
10	4	js/domain.js       ← 基线侧(W223)
32	16	js/plans.js        ← 基线侧(W219)
5	2	js/produce.js      ← W224
```

`js/commands.js` **+13 −2** 与 `js/produce.js` **+5 −2** 与 W224 自称的两格逐格相同;
`cli.js`/`mcp.js`/`server.js`/`billing.js`/`index.html`/`css/` 零 diff。

## 一、四棵树机检:**两个产品文件都是 `P1 == B`**

四份 blob 逐文件现取(`B` = 叉点 `16baeb9`,`P1` = 我方 `ced93df`,`P2` = 对侧 `ad9906b`):

| 文件 | B | P1 | P2 | tip | 成色 |
|---|---|---|---|---|---|
| `js/produce.js` | `ba23f5d7` | `ba23f5d7` | `b943a175` | `b943a175` | **`P1 == B`,git 整份取对侧** |
| `js/commands.js` | `f9d86741` | `f9d86741` | `31c689e5` | `31c689e5` | **`P1 == B`,git 整份取对侧** |
| `js/domain.js` | `056d1783` | `8af2a73f` | `056d1783` | `8af2a73f` | `P2 == B`,整份取我方 |
| `js/plans.js` | `9e3500d2` | `bebe8606` | `9e3500d2` | `bebe8606` | `P2 == B`,整份取我方 |
| `README.md` | `1298b655` | `f38927ec` | `3ab75cfe` | 并集 | 真并集(四份互不同) |
| `docs/skills-wave/README.md` | `136669cf` | `fcab39e5` | `8f87c26c` | 并集 | 真并集(四份互不同) |
| `tests/unit.js` | `e0c76dec` | `4db9e0d5` | `74e583b4` | 并集 | 真并集(四份互不同) |

**本槽最要紧的一格是产品面两个文件都落在 `P1 == B` 上**:我方自 W220 起没碰过 `js/produce.js` 与
`js/commands.js`(W222 那槽只动 `js/plans.js`、W225 那槽只动 `js/domain.js`),
git **整份取对侧、不做任何 hunk 级取舍**。合得"干净"不等于合得对——一个冲突都没报,
恰恰说明这两个文件里对侧带来的**每一处**都得逐条现取,不能拿"没报冲突"当担保(§二)。

交接另点名一格:「`commands.js` 若整份取对侧,不要丢掉 w225 侧其它 `commands` 改动(若有)」。
**机检:没有**——`js/commands.js` 的 `P1` blob 与 `B` 逐字节相同(`f9d86741`),
w225 侧在这个文件上一个字都没改,故整份取对侧不存在顶掉任何东西的可能。这是量出来的结论,不是"看起来没冲突"。

反过来 `js/domain.js` 与 `js/plans.js` 是 `P2 == B`(整份取我方),故基线侧那几堆判据不会被对侧顶掉,
但同样逐条现取过(§三)。

## 二、`js/produce.js` + `js/commands.js` 整份取对侧后逐条现取

交接点名的五件,合完在 tip 上逐条现取:

| 点名 | tip 上现取到的 | 在不在 |
|---|---|---|
| `js/produce.js` 空审回执带 `targets` | 第 259 行 `if (!targets.length) return { pass: 0, retry: 0, manual: 0, targets: 0 };` | ✅ |
| ——正常跑那一路也得报 | 第 323 行 `return { pass: passCnt, retry: retryCnt, manual: manualCnt, targets: targets.length };` | ✅ |
| `js/commands.js` `episode.smartReview` 成功路径补 `note` 给 digest 播 | `if (r && !r.targets) { out.result.note = … }`,`digest` 侧 `r.ok && r.result.note` 那条无条件播的老路一字未改 | ✅ |
| 点名按镜去重 | `const picked = Array.isArray(args.shotIds) && args.shotIds.length ? [...new Set(args.shotIds)] : null;` | ✅ |
| 不开第三份 `Domain` note 帮手 | `git diff ced93df HEAD -- js/domain.js` **空**;tip 相对叉点的 `js/domain.js` 增行里 `Note`/`review` 相关 **0** 处 | ✅ 没开 |
| 不改 ok/blocked | `out` 仍是 `ok(r)`,唯一改档的还是那句 `if (r && r.manual > 0) out.status = 'needs_human'`(一字未动),没有任何 `fail`/`blocked` 分支 | ✅ 没改 |

**再往下量一格:整份取对侧带进来的到底只有这些。** `js/commands.js` 相对叉点 **+13 −2** 全落在
`episode.smartReview` 那一段(去重那一行 +1 −1、注释块 +6、`note` 三行 +3、原注释行 +3 −1),
`js/produce.js` **+5 −2** 全落在 `autoSmartReview` 首尾两句 `return` 与其上注释。
同文件里**没被碰**的几处派生一并复核过:镜头侧 `const todo = pend.filter(s => s.confirm)`(选人闸)一字未动、
`episode.produce` 顶层仍是 `ok({ steps, url })`、`digest` 的播报判据仍只认 `r.result.note` 这一位。

### 2.1 合完的树上真跑一遍(不是读源码猜)

`P1 == B` 的文件不许只靠源级比对交差。在**合完的 tip 上**把 W224 那两条用例的读数逐格印出来
(真引擎 + 真命令层 + 真 `digest`):

| 档 | `result.note` live | 引擎实收 | 后台面板 | digest 播 |
|---|---|---|---|---|
| 整集一镜未出片 | `本集没有可审的镜头,一镜也没审:可审的镜需已出片、非终稿` | 0 | 0 | **1 句** |
| 全集已定稿 | 同上 | 0 | — | — |
| 点名 `['ghost','ghost']`(本集另有可审镜) | `点名的 1 镜一镜也没审:可审的镜需已出片、非终稿且在本集` | 0 | — | — |
| 对照:真审 1 镜 | `undefined` | **1** | **1** | **0 句** |
| 对照:用户按 ✕ 中止 | `undefined`(`targets=2`,`pass+retry+manual=0`) | 0 | — | **0 句** |

第三档的 `点名的 1 镜` 就是**按镜去重**的 live 读数(点名清单是 `['ghost','ghost']` 两个字面、
去重后报 1),同时它没有说成「本集没有可审的镜头」——本集明明还有一镜可审。
末档是「不拿 `pass+retry+manual` 猜」那条判据的 live 反面:三个计数与空审档一模一样而 `note` 仍是 `undefined`。

## 三、`P2 == B` 那两个文件:基线侧的判据逐条复核没被顶掉

交接点名「不要剥 `gaps()`,保留 W210 force、W216/W214 闸、W217/W223 gone 按 id、W219 generate 过滤、W221 按钮测试」。
`js/domain.js` 与 `js/plans.js` 是整份取我方,理论上动不了,但仍逐条现取:

| 点名 | tip 上现取到的 | 在不在 |
|---|---|---|
| W223 四堆按点名 id 数 | `js/domain.js:291` `hits = ids.map(id => shots.filter(s => s.id === id))`;`locked`/`fresh`/`gone` 三堆(293/294/295)一堆都不从命中的**镜条数**里数 | ✅ |
| ——安全阀 | `js/domain.js:299` `say(ids.length - locked - fresh - gone, '没能说清原因')` | ✅ |
| W216 / W214 两道闸 | `js/domain.js:284` 与 `325`,两处都是 `Array.isArray(picked) && picked.length` | ✅ |
| W217 主体侧 `gone` 按 id | `js/domain.js:330` `ids.filter(id => !subs.some(s => s.id === id)).length` | ✅ |
| W219 generate 过滤 | `js/plans.js:168` `manualCmd` 仍是**同一个函数一处**,`184`(generate 白名单)/`202`/`250`(execStep 闸)三处共用;`expert.evolve` 字面在 `js/plans.js` **0** 处,全仓 `manual: true` 仍 **1** 处 | ✅ |
| W221 按钮测试 | `pipeline` 那条与 `contract` 那条两条都在 tip 名集上现取到(§五),`pipeline` 12 → **13**、`contract` 139 → **140** | ✅ |
| W210 force | `episode.compose` 参数面 `contract` 那条现取仍是 `pid,epid,force,ui`,全绿 | ✅ |
| `gaps()` 没被剥 | `js/skills.js` 在**四棵树上 blob 全同**(`f7c0baf0`),`gaps()` 现取 **20** 键,`G-11` / `G-13` 原样开着,`SK-04`(`core.memoryDual`)原样在册 | ✅ |

## 四、冲突逐处怎么收的

三处冲突,一处都没机械取侧。

### 4.1 `README.md` 第 611 行长行:**方向与 W225 那槽同向、与 W222 那槽相反**

那条 33814 字符的长行两侧都改了。先**把数字整体掩成 `#` 再逐字符比对**,分出"只改数字"与"真改了散文":

| 侧 | 掩数字后 vs `B` | 读出来是什么 |
|---|---|---|
| `P2`(W224) | **逐字节相同** | 只改了数字:82 个数里只有第 0 个 `643 → 645` |
| `P1`(我方) | 不同 | `difflib` 求 opcode 全落在 `equal` + **单个 `insert`**(位置 2923、160 字符,那段「人手命令两道闸」散文,W219 带进来的),数字同样只动第 0 个 `643 → 646` |

故并集取「**我方整句(带那 160 字散文)+ 第 0 个数按 live 定**」。整句取对侧会把 README 里唯一写着"两道闸"的地方丢掉;
整句取我方则数字停在 646。收完回验:去掉首个数字后 `union` 与 `P1` 那行**逐字节相同**,那段散文在位,
其余 81 个数一个没动。第 362 / 532 行只有我方改过,git 自动合上、零冲突。

### 4.2 目录索引表:取并集后按波次号归位

表尾冲突两侧各是自己那几行:我方 4 行(`w221` / `w222` / `w223` / `w225`)、对侧 1 行(`w224`)。
取并集后按 `wNN` 数字排序,`w224` 归位到 **`w223` 与 `w225` 之间**(追加表尾当场红在行序那条)。
五行逐行与各自源树 `cmp` **逐字节回验**通过。份数字面 `234` 两侧给的是 `239` / `235`,按并集收成 **240**
(合并提交那一刻的实况),本文写完再抬到 **241**;`grep -c '^| \[w'` 现取行数与明写份数当场对上。

### 4.3 `tests/unit.js`:两处纯数字冲突

两处冲突各只有一行,掩数字后两侧**逐字节相同**,是纯数字之争:`['单元测试', 646|645, …]` 与
`const FLOOR = 239|235;`。两侧给的都不是答案,按 live 收成 **648** 与 **240**(本文写完抬到 **241**)。
W224 那两条 `produce` 用例与我方那几条落在文件不同位置,git 自动合上,没有"两侧在同一插入点各追加一条"的情况。

## 五、数字:全部合完 live 重跑

合完先整跑一遍让对账用例自己报差额再订正——本轮它一次就对上(`648/648` 且棘轮那条没红),
说明 `643 + 3 + 2 = 648` 这个算式与实跑一致。

| 格 | 叉点 `16baeb9` | W224 自称 | 基线自称 | **合完 live** |
|---|---|---|---|---|
| `unit` 总数 | 643 | 645 | 646 | **648** |
| └ `produce` | 17 | 19 | 17 | **19**(W224 +2) |
| └ `domain` | 38 | 38 | 39 | **39** |
| └ `pipeline` | 12 | 12 | 13 | **13** |
| └ `contract` | 139 | 139 | 140 | **140** |
| └ `plans` | 17 | 17 | 17 | **17**(W219 等量替换,见 §六) |
| └ `commands` | 47 | 47 | 47 | **47**(W224 那两条落在 `produce` 套件,不是 `commands`) |
| `integration` | 147 | — | — | **147/147 全绿** |
| `cli.smoke` | 107/109 | — | — | **107/109**(单独整跑) |
| 记账件份数 | 234 | 235 | 239 | **241**(含本文) |

两格 `FLOOR` 按 live 抬:`['单元测试', 648, …]`、`const FLOOR = 241;`。
`TOPIC_FLOOR` 与 `GUARD_TOPICS` 在四棵树上都是 **19 / 19**,一条未动。

`cli.smoke` 非并行安全故**单独整跑**,两条失败**与 `master` 同名同表现**
(在 `origin/master` 独立 worktree 上现跑对照,那边是 51/53、同样这两条):

| 失败条目 | tip | master |
|---|---|---|
| `未登录 whoami → exit 3` | `exit=1` | `exit=1` |
| `llm --json mock 链路` | `undefined` | `undefined` |

## 六、名集按 `|` 切做多重集

四棵源树与 tip 的快照都在**全绿**状态下取(643 / 646 / 645 / 648,名字后不会缀失败原因):

| 侧 | 相对叉点新增 | 相对叉点去掉 | 净 |
|---|---|---|---|
| `P1`(基线,W219+W221+W223) | 4 | **1** | +3 |
| `P2`(W224) | 2 | 0 | +2 |

`643 + 3 + 2 = 648`,与 live **648** 相等;逐条比对 **tip 缺失 0 条、tip 多出 0 条**,
"基线独有(`B` 有而两侧都没有)"也是 **0** 条。

`P2` 新增两条(**W224 `produce` 套件 +2,交接点名要在 tip 上,现取都在**):

- `produce · episode.smartReview:一镜也没审时回执得说清原因(引擎一次没起来就没有面板也没有提示可依赖)`
- `produce · episode.smartReview:用户中止审片不许冒充「没有可审的镜头」(判 0 取引擎数的可审镜数,不拿三个计数猜)`

`P1` 新增四条,四条也都在 tip 上:

- `pipeline · nextForEp:整集全是过期终稿时按钮照旧挂着…`(W221)
- `contract · 断点条不藏按钮:工作区「下一步」无条件渲染 Pipeline 给的文案…`(W221)
- `domain · emptyBatchNote:分镜表里同 id 存着两镜时四堆都按点名 id 数…`(W223)
- `plans · generate:人手命令不进 steps(白名单不点名、模型点名也不收),挡下哪条如实告知不静默吞`(W219)

**那 `−1` 条要单独说**:`plans · generate:人手命令仍在命令名单里(不从 cmds 里删),拆得出这一步而执行口一律拦下`——
它是 W219 **同一条用例的改写**(旧那条钉的正是要改掉的行为),不是删测,W222 那份记账件已把这一格记清。
tip 上它**不在**,与 `P1` 一致(漏合的形态应当是"`B` 与 `P2` 都有而 tip 没有",此处 `P2` 也没有它)。
`plans` 那格两棵树都是 17,**只看数字看不出这里换过一条断言方向相反的用例**,按 `|` 切开做多重集才看得见。

## 七、治理面:一格未动

- `js/skills.js` 在 `B` / `P1` / `P2` / tip **四棵树上 blob 全同**(`f7c0baf0`),故 `gaps()` 一个键没剥、
  **`SK-04` / `G-11` / `G-13` 原样开着没装清**;`gaps()` 现取 **20** 键。
- `expert.evolve` 仍不进 playbook `steps`(`js/plans.js` 里该字面 **0** 处、全仓 `manual: true` 仍 **1** 处)。
- `episode.compose` 参数面仍 `pid,epid,force,ui`。
- `GUARD_TOPICS` / `TOPIC_FLOOR` 仍 **19 / 19**。
- 本文零相对链接(记账件正文不挂 markdown 相对路径链接,链接只在目录索引表那一行)。

## 八、本槽没做的四件事,与为什么

1. **W226 分镜 id 写入去重没合**——它从 W222 出、仍在飞,任务口径明令跳过。本槽一条没碰。
2. **`master` 没合,没有开第三条功能支**,也没有 cherry-pick 任何已在基线里的东西。
3. **W223 那条「同 id 两镜时点名一次真起两次引擎、两笔钱」的选人面残留没有代修**——见 §九。
4. **W224 自己记的「一键成片子步 note 嵌套不播」没有代修**——见 §九。

## 九、交接:两格残留原样留着

### 9.1 未收(交接明令不代修):W223 残留——同 id 两镜时选人双扣费

| 侧 | 现状 |
|---|---|
| **回执怎么分档**(`Domain.emptyBatchNote` 四堆) | **已收**(W225 合入 W223 时收的):一律按点名 id 数 |
| **选人跑几镜**(命令层与 CLI 的 `todo` 筛法) | **未收**:同 id 两镜时一次点名跑两镜、扣两笔 |

`js/commands.js` 那句 `const todo = pend.filter(s => s.confirm)` 本槽**一字未动**。
它落在**选人与计费**那一侧,要收得同轮定「同 id 两镜到底算一镜还是两镜」、重跑口径、终稿锁与扣费四件事。
两个方向的偷懒都没走:既没顺手去动选人闸(那是替别人的槽交货,且会把计费面一起带上),
也没把这条残留从记账里抹掉。

### 9.2 未收(交接明令不代修):W224 残留——一键成片子步 note 嵌套不播

W224 那份记账件 §1.2 与 §6.3 记的那格:`episode.produce` 把子步回执整个塞进 `result.steps`,
子步(如 `generateVideos` 的空跑 note)有话说而顶层播 **0** 句。本槽合完**这格原样在**——
`js/commands.js:399` 仍是 `Object.assign(ok({ steps, url: c.result.url }), …)`,`digest` 仍只认顶层
`r.result.note` 那一位,两处一字未动。它是**编排层的产品口径题**(子步那几句要不要冒泡、冒泡几句、
与 `oneClickProduce` 自己的收尾 toast 怎么排),不是一句 note 的事,交接明令本槽不代修。

### 9.3 W224 自己交接的另外三格,本槽照原样带下去

- `result.note` 现在是**三个生产者**(`episode.generateVideos`、`subject.generateImage` 各读一份 `Domain` 派生,
  `episode.smartReview` 是命令层一句)。**再来第四个候选之前先按 W207 那三格量一遍**,
  量完还要看这一句该住在哪:两端共读才进 `Domain`,只有一个消费方就留在命令层。
- **两端在空审这一档的分档仍然相反**(浏览器 `ok` + note、服务端 `/api/wf/smart-review` 400 点名回绝),
  本槽没统一——改分档会穿透 `js/plans.js` 与 `episode.produce` 的步骤账。
- **`autoSmartReview` 的可审镜筛法与服务端那一份仍是两处**(浏览器 `!s.final && Store.shotVideoReady(s)`,
  服务端另加"非在飞");两端要是各自漂了,今天没有判据会红。

在飞的 **W226** 一条没碰。
