# W253 · produce 修订回写按行落到本轮那一行:同 id 多行时几笔优化钱全改首行

基线:`origin/cursor/w250-integration-4c7a` 现取 tip `367f7bc`(先 `fetch` 再 `rev-parse`,不抄自称)。
W251/W252 仍在飞,本槽按交接跳过、不等。分支 `cursor/w253-produce-revise-first-row-3f7b`。

**结论先写:停工条件不成立,现跑就是闷声写错行,改了三处寻址(一处写回 + 它上游的两处取材)。**
整集审片是**按行**出报告的:同 id 三行,`lastReview.perShot` 上就有三条,各带各自的分与 `reportId`。
而 `Domain.reviseTargets` 用 `findIndex` 把这三条**一律解析到首行**,`WfCore.reviseSubset` 又用 `find` 首行
去取那份报告原文(后两条取不到 → `fixes` 空串),`cli.js` 的 `reviseLowShots` 再用 `findShot` 首行写回——
一轮里**三笔 `llm.optimize` 全改首行那一句提示词、只重置首行的视频态**,
第二、三行的低分片子既没按自己那份意见改词也没被重抽,下一轮照旧低分,
轮次烧完止于 `needs_human`,而每一轮的钱都真扣了。

**没碰的**:`nthSubject` 与它的第五档夹具一个字未动;`state-put` 仍只有 `need(f.force)` 一道闸;
两端选人闸 `ids.has(s.id)` 按行筛逐字未动;`Skills.gaps()` 未剥;去重命令仍只有 `shots-dedupe` 一条;
达标线 / 报告判旧 / 与分镜表取交集 / 定稿不重抽四条判据一个字未动;
`server.js`、`mcp.js`、`js/produce.js`、`js/commands.js`、`js/issues.js`、`js/agent-ops.js` **零 diff**。

---

## 一、先 live:修订这一步改的到底是哪一行

### 1.1 三条低分,三次写回,全落首行

夹具:一集三行同 id `dup`,各有各的提示词、各有各的报告(`r0`/`r1`/`r2`,意见分别是「改0」「改1」「改2」)。
`lastReview.perShot` 按服务端写回口径逐行各记一条。直调基线那两份派生:

```
reviseTargets  [{shotId:dup, order:1, score:4,   reportId:r0},
                {shotId:dup, order:1, score:4.1, reportId:r1},
                {shotId:dup, order:1, score:4.2, reportId:r2}]
reviseSubset   [{order:1, fixes:"改0"}, {order:1, fixes:""}, {order:1, fixes:""}]
写回落点        order=0 prompt=P0 / order=0 prompt=P0 / order=0 prompt=P0
```

三件事一次读齐:

- **`order` 三条全是 1**:展示面(问题中心 low-review、助手状态摘要、审片完成卡、闸门那句
  「低分 N 镜(x镜y分)」)把三行都报成「镜 1」。
- **`fixes` 后两条是空串**:报告在各自那一行的 `reviews` 里,`find` 首行取不到——
  修订步据此走「无修正意见,沿用原提示词重抽」,那两行的审片意见**一条也没落到实处**。
- **写回三次全落首行**:`findShot` 取的就是 `.find` 首行。

### 1.2 一整趟 produce 跑下来的实况

沙箱 `runInContext` 真 `cli.js` 本体(只掐掉末尾 `main()` 入口),换掉的只有服务端往返与生成引擎;
落库面读 **clone 语义的 disk 夹具**(共享同一个对象的夹具量不出「编排层只在自己手里那份快照上改」的假落库)。
分镜表 `dup(首行)` / `solo` / `dup(第二行)` 三行全已出片,审片桩逐行出报告、恒判 5 分,`maxRetry:1`:

| | 首行 | solo | 第二行 |
|---|---|---|---|
| 基线:提示词 | `改过(修首行)` | `改过(修不重复的那一镜)` | **`原词-第二行`(一个字没动)** |
| 基线:重抽 | 是 | 是 | **否**(视频态没被重置,批量那一步判它「已就绪」跳过) |
| 本槽:提示词 | `改过(修首行)` | `改过(修不重复的那一镜)` | `改过(修第二行)` |
| 本槽:重抽 | 是 | 是 | 是 |

基线那一趟 `revise1` 的回执照报 `revised:['dup','solo','dup']`——**三笔优化钱、回执三条全绿,
落库只有两行真被改过**;`regen1` 只有两行真下发到引擎。第二行的低分片子留在库里,
下一轮复审照旧 5 分,直到 `maxRetry` 烧完转 `needs_human`。**这个漏每轮复发且不收敛**,
形状与 W248 镜头侧、W246 主体侧那两格同源,只是这一格多花的是修订那笔 `llm.optimize`。

### 1.3 停工条件:两条都不成立

交接给的停工条件是「现跑已按本轮那一行写回」或「修订语义本就是按 id 寻址首行(与 find 首行一致、**去重保首行**)」。

- 第一条:§1.1/§1.2 逐档反过来,不成立。
- 第二条:重抽面**没有去重**——同 id 三行出三条目标、三次修订、三笔钱,却全指首行。
  「按 id 寻址首行」要成立,得是一个 id 只出一条目标(去重保首行)才自洽;
  现跑是「按行出目标、按 id 写回」,两头对不上,这正是闷声写错行的形状。
  交接同时明令**不许改成按 id 只跑一行**(那样第二、三行永远修不到),故只有一条路:按行/序数写回。

### 1.4 浏览器那一端不是这个形态

`js/produce.js` 的 `autoSmartReview` 拿 `targets` 这一批**对象本身**逐行跑
(`Review.optimizeShot(p, ep, s, …)`、`s.video = { status: 'none' }` 都写在行对象上),没有第二次寻址。
两端的差异照旧来自 CLI 有 `withProject` 这一道「重取最新状态再打补丁」的往返。本槽没动它一个字。

> 它另有一格与本槽同源但**不在本槽射程内**:收尾写回整集 `lastReview` 时 `lastRep` 按 `s.id` 记,
> 同 id 多行会被最后一行的报告覆盖,于是 `perShot` 上几条同 id 的分全是最后那一行的。
> 那是**审片写回**的取材面(要连着 `reviewed`/`avg` 的口径一起判),不是修订回写,原样登记在 §五 1。

---

## 二、改了什么(三处寻址,`js/domain.js` +12 −4、`js/wf-core.js` +2 −2、`cli.js` +8 −2)

### 2.1 `Domain.reviseTargets`:逐条落到自己那一行,并带出 `nth`

```
const rowsOf = Object.create(null);            // id → 该 id 各行的实位下标
shots.forEach((s, i) => { (rowsOf[s.id] = rowsOf[s.id] || []).push(i); });
const seen = Object.create(null);
…
const nth = (seen[x && x.shotId] = (seen[x && x.shotId] || 0) + 1) - 1;
const rows = (x && rowsOf[x.shotId]) || [];
return { x, nth, i: rows.length ? (rows[nth] !== undefined ? rows[nth] : rows[0]) : -1 };
```

判据仍是原来那四条(达标线、判旧、与分镜表取交集、定稿不重抽),一个字未动;
变的只有「这一条是哪一行」。`order` 照旧取实位(`i + 1`),于是同 id 三行现在各报各的镜号。

**序数在整份 `perShot` 上数,不在低分子集上数**:先数序数再按分数筛。
反过来(筛完再数)会在「首行达标被筛掉」时整体错位——两条低分本该指第二、三行,却指到第一、二行,
首行被改、末行没人管(变异 4 现跑就是 `1,3` 这个形状)。这一格与 W248 §2.2「序数得在全表上数」同一条理。

**行不够数时退回首行**(`rows[nth] !== undefined ? rows[nth] : rows[0]`):
报告写下之后行被删掉时,与 `nthShot` 的 `rows[nth] || rows[0]` 越界口径逐字相同——
两侧同样退回首行,写回落到的仍是同一行。这里的 `rows` 装的是下标,`0` 是合法值,故不能写 `||`。

### 2.2 `WfCore.reviseSubset`:按那一行取回报告原文,`nth` 原样带出

```
const s = shots[t.order - 1];   // order 就是这一条落到的实位
…
return { shotId: t.shotId, order: t.order, score: t.score, nth: t.nth, fixes: W.reviewFixes(rep) };
```

`order` 是同一次调用里刚算出来的实位,直接当下标用,不在本层另数一遍序数(数第二遍就是第二份口径)。
`nth` 只是原样带下去给回写侧:服务端 `/api/wf/smart-review` 的 `lowShots` 与 CLI 闭环的重抽面同读这一份,
多带一个字段,消费面(`shotId`/`order`/`score`/`fixes`)一个都没变。

### 2.3 `cli.js` `reviseLowShots`:回写按 `nth` 定位本轮那一行

读取侧(取原提示词喂重写模板)与写回侧(`withProject` 里那一句)一起换:

```
const rows = ep0 ? (ep0.shots || []).filter(sh => sh.id === x.shotId) : [];
const s = rows[x.nth || 0] !== undefined ? rows[x.nth || 0] : rows[0];   // 越界退回首行,同 nthShot
…
const sL = nthShot(findEp(projLive, args.epid), x.shotId, x.nth || 0);
```

写回侧直接用 W248 立的 `nthShot`(不另造第二个同形的寻址器);
读取侧不用它是为了保住「镜头不存在」那条既有出口——`nthShot` 在同 id 一行不剩时委托回 `findShot` 抛 exit 4,
而这一路原本是 `failedFix.push({ shotId, error: '镜头不存在' })` 逐镜跳过、不中断整轮,措辞与形态都留着。

### 2.4 唯一 id 的表:逐字节等价

同 id 只有一行时 `nth` 恒 0、`rows[0]` 就是 `findIndex` 那一行,三处改动的产出与基线逐字相同。
`shots-dedupe` 那条(W235)依赖的「引用面按首行语义解析、首行留原 id、去重前后落到同一行」
在它的夹具上(`perShot` 每个 id 一条)照旧成立,那条用例一个字没改也没红。

---

## 三、钉测试(`tests/unit.js` +2 条 +2 句)

| 落点 | 钉的是 |
|---|---|
| `domain` 套件新增一条 | 三条低分各报自己那一行的实位(全指首行时是 `1,1,1`)、`nth` 是第几行同 id、各条带回自己那份 `reportId`、子集参数照旧按行出;另两档:序数在整份 `perShot` 上数(首行达标被筛掉时余下两条仍指第二、三行)、越界退回首行不许算出 `-1` 把整条丢掉 |
| `commands` 套件新增一条 | 一整趟 `episode.produce` 真跑:三行各按**自己那份**审片意见改词、首行的 `promptHistory` 只许有一条(几条低分全落首行时它会被连改几遍)、`revise1` 逐行如实回报、`regen1` 三行都真重抽、三行手里各是各的片 |
| `contract` 套件那条既有用例 +2 句 | 同 id 多行时每一条的 `fixes` 取自己那一行的报告、`nth` 原样带给回写侧 |

落库面读 `cliDisk` 那份 clone 语义的 disk 夹具;引擎桩按下发次序给各不相同的片
(自带那份按 `s.id` 命名,同 id 两行会撞成同一个 url,量不出「各是各的片」);
审片桩按**行**出报告并按服务端合并口径写回 `lastReview`(桩要是按 id 出报告,整个夹具就伪造不出这一格)。
`tests/integration.js` 未加(本槽不新增端点);`tests/cli.smoke.js` 未加(真跑修订重抽要真上游)。

### 3.1 变异五手,逐手红在自己那一句

| # | 怎么改坏 | 结果 |
|---|---|---|
| 1 | 回写退回 `findShot` 首行(只退这一处) | 红 **1**:`commands` 那条(`首行按自己那份意见改词:实际 改过(修第二行)`——首行被后一条覆盖成了别人的词) |
| 2 | 重抽面退回全指首行(`i` 恒取 `rows[0]`) | 红 **2**:`domain` 那条(`期望 1,3,4,实际 1,1,1`)+ `commands` 那条(第二行一个字没动) |
| 3 | `fixes` 退回 `find` 首行(只退取材面) | 红 **2**:`contract` 那条(`期望 1:补主光 / 2:换机位,实际 1:补主光 / 2:`)+ `commands` 那条 |
| 4 | 序数只在低分子集上数(先筛后数) | 红 **1**:`domain` 那条(`期望 3,4,实际 1,3`——首行被改、末行没人管) |
| 5 | 摘掉越界退回首行(`rows[nth]` 直取) | 红 **1**:`domain` 那条(`期望 1,1,3,实际 1,3`——越界那一条被整条丢掉) |

两处现跑出来的方法性的东西,原样记下:

- **变异 2 与变异 3 在 `commands` 那条上红得逐字相同,这是对的**:寻址错行与取材错行落到同一个后果
  (第二行既没改词也没重抽)。要把它们分开,靠的是各自那一层的判据——变异 2 另红 `domain`、
  变异 3 另红 `contract`。`contract` 那两句正是为此补的:补之前变异 3 只红 `commands` 一条,
  与变异 2 一模一样,读不出病灶在取材面还是寻址面。
- **变异 1 只红一条而不是两条**,因为读取侧与写回侧我是一起换的:只退写回那一句时,
  读取侧仍按行取到第二行的原提示词、算出第二行该改成什么,然后写去了首行——
  报错句里印的「首行:改过(修第二行)」一眼读得出这个错位方向,比「第二行没动」更贴病灶。

判据先提交再演练(W235 记的那条坑,本槽照办:产品码与前两条用例提交在前,变异在后;
`contract` 那两句是变异 3 逼出来的,补完把 3 重跑一遍)。
每手跑完 `git checkout -- <file>` 或从备份还原清场。

---

## 四、live 数字(全部现跑,含本文)

| 项 | 基线 `367f7bc` | 本槽 |
|---|---|---|
| `node tests/unit.js` | 667/667 | **669/669 PASS** |
| `node tests/integration.js` | 148/148 | **148/148 PASS**(未加用例,复跑过) |
| `node tests/cli.smoke.js` | 115/117 | **115/117**,失败仍是同名那两条:`未登录 whoami → exit 3`、`llm --json mock 链路`(基线现跑同样这两条) |
| 记账件份数 | 265 | **266**(含本文) |

棘轮同轮抬到当轮实况:`['单元测试', 669, …]`、`const FLOOR = 266;`;
`['集成测试', 148, …]`、`['CLI 冒烟', 117, …]`、`TOPIC_FLOOR`、`SLACK` 未动。
根 `README.md` 单元用例数 667→669,并在 `commands.js` 覆盖面里紧接镜头侧那一段补一段说明本槽这一条。
`docs/skills-wave/README.md` 明写份数 265→266,索引补本文一行。
`node --check` 过:`js/domain.js`、`js/wf-core.js`、`cli.js`、`tests/unit.js`。

按用户约定,`node tests/e2e.js` 本槽**未跑**。

---

## 五、交接

1. **`js/produce.js` 收尾写回整集 `lastReview` 那一格,本槽量到了但没修**(§1.4):
   `lastRep` 按 `s.id` 记,同 id 多行时被最后一行的报告覆盖,于是 `reviewed` 数着几行、
   `perShot` 上几条同 id 的分与 `reportId` 却全是最后那一行那份(`avg` 也按同一份算了几遍)。
   它属于**审片写回**不属于修订回写,交接明令的射程在后者;
   收法是把 `lastRep` 改成按行对象记(`Map` 按对象身份),连着 `reviewed`/`avg` 的口径一起判。
   服务端 `/api/wf/smart-review` 那一侧不是这个形态(`reports` 按行推,`newPer` 逐行各一条),
   但它的**合并**那一句是按 id 去重的(`prev.perShot.filter(x => !newPer.some(y => y.shotId === x.shotId))`)——
   子集复审同 id 多行时旧条目会被整批丢掉,同样登记在这一格,同样没碰。
2. **`js/agent-ops.js` 的 `d.lowShots` 仍按 `find` 首行取报告原文**(取的是给助手看的问题原文,
   不落任何写回)。`nth` 现在就在 `reviseTargets` 的产出上,收它是一行的事;
   本槽按「最小改动 + 只收写回面」没动,登记在此不是遗漏。
3. **回执的 `revised` 该按几行报,本槽没动**:现在仍是「修订成功即 `okIds.push(x.shotId)`」,
   同 id 三行推三个一样的 id。修完之后这个数与真被改的行数一致了,但那是**结果一致**不是判据一致
   (与 W248 §五 3、W246 §五 3 同一格,三侧现在同形)。
4. **同 id 多行为什么会存在,本槽照旧没追到源头**(W226 §6、W242 §5.7、W248 §五 5 在册)。
   本槽只保证这种表存在时,修订那几笔钱与真被改的行对得上。
5. 冲突面提示:`js/domain.js` 只改 `reviseTargets` 函数体(`REVIEW_MIN` 之后那一段);
   `js/wf-core.js` 只改 `reviseSubset` 里的两行;`cli.js` 只改 `reviseLowShots`(第 1233 行附近,
   紧挨着 W131 立的 `reviseTargets` 辅助函数,与 W248 改的 `episode.generateVideos` 段落不重叠)。
   `tests/unit.js` 两条新用例分别插在 `domain` 套件 `reviseTargets` 那两条之后、
   `commands` 套件 produce 轮次那条之后,合并时按「两侧各在同一插入点追加一条完整用例」处理。
