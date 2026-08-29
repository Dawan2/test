# W277 `landed` 收下第三条同类出口:`gen-episode` 也把「扣了几笔」与「到手几行」分开报

W254 给回执补出 `landed` 时只收了两条批量命令,W257 原样传下来、W276 §残留仍记着「`landed` 只覆盖两条批量命令」。本槽先**普查所有写回镜头/主体资产的命令出口**,再按明令**只收最近邻的那一条**——`hujing gen-episode`。`ok` 的口径、写回路径、共位覆盖的退费政策一律没动。

- 起手支:`cursor/w276-integration-3f7c`,现取 tip `49033fbec14dd1a478efd1052ddadbb891cad0d5`(交接自称 `49033fb`,现取与自称逐字节相同)
- 本槽支:`cursor/w277-landed-audit-ec5d`
- 产品面 diff:`cli.js` +17/−2;判据 `tests/unit.js` +49/−1(净 +1 条用例,另含一处夹具与两处棘轮字面);根 `README.md` 三处

`master` 没合、没开 PR、没跑 `e2e.js`;`state-put` 闸、`shots-dedupe` 主体侧、SK-04、`gaps()` 键、镜号那一族、`common`/`cut`、`openEpisodeReview` 一律没碰。

## 一、普查:写回镜头/主体资产的命令出口,以及它们各报什么数

现取全树三张命令表——浏览器 `js/commands.js` 的 `Commands.REG`、`cli.js` 的 `EXEC`(统一领域命令)与 `cli.js` 的 `CMD`(命令原语)。判「写回镜头/主体资产」按**这条命令自己会不会把 image/video/成片写进分镜行或主体位**收,只读命令(`shots`/`subjects`/`review-frames`)与纯字段补丁(`shot-set`/`shot-confirm`/`shots-import`/`shots-dedupe`)不进表。

| # | 出口 | 端 | 形态 | 回执里的计数 | `landed` | 共位怎么发生 |
|---|---|---|---|---|---|---|
| 1 | `episode.generateVideos` | 浏览器 | 批量按行 | `total`/`ok`/`failed`/`skipped` | **有** | 走不到:写的是循环里那个对象,没有第二次寻址 |
| 2 | `subject.generateImage` | 浏览器 | 批量按位 | `total`/`ok`/`failed` | **有** | 同上 |
| 3 | `exec episode.generateVideos` | CLI | 批量按行,每轮 `nthShot` 回最新树重取 | `total`/`ok`/`failed`/`skipped` | **有** | 跑到一半别处改表 → 序数越界退回首行 |
| 4 | `exec subject.generateImage` | CLI | 批量按位,每轮 `nthSubject` 重取 | `total`/`ok`/`failed` | **有** | 同上,退回首位 |
| 5 | **`gen-episode`** | CLI | 批量按行,每轮 `findShot` 回最新树重取 | `total`/**`ok`**/`failed`/`shots` | **无** ← 本槽收 | **结构性**:`findShot` 按 id 取首行,同 id 几行一律写同一行,不需要并发改表 |
| 6 | `shot.generateVideo` | 浏览器 | 单发 | `shotId`/`url`/`simulated` | 无(**没有 `ok` 计数**) | 单轮,共位形态不成立 |
| 7 | `exec shot.generateVideo` | CLI | 单发(补底图 + 生视频两趟 `findShot`) | `shotId`/`url` | 无(同上) | 单轮 |
| 8 | `gen-shot-video` | CLI | 单发 | 镜头补丁 | 无(同上) | 单轮 |
| 9 | `gen-shot-image` | CLI | 单发 | `id`/`image` | 无(同上) | 单轮 |
| 10 | `subject-image` | CLI | 单发 | `id`/`name`/`image` | 无(同上) | 单轮 |
| 11 | `subject-add --gen-image` | CLI | 单发(新建位) | 主体条目 | 无(同上) | 新建位,没有旧产物可盖 |
| 12 | `subject-copy` | CLI | 单发(跨项目) | `id`/`name`/`overwritten` | 无(同上) | 目标同名同类覆盖是**这条命令的语义**,已由 `overwritten` 如实报 |
| 13 | `project.extractSubjects` | 两端 | 批量入库 | `added`/`skipped`/`total` | 无(**没有引擎次数这个概念**) | 只新建位、同名同类不覆盖 |
| 14 | `episode.generateStoryboard` | 两端 | 整表替换 | `shots`/`plans` | 无(同上) | 不按行落位 |
| 15 | `episode.smartReview` | 两端 | 批量按行(写 `reviews`/`confirm`/`lastReview`) | `pass`/`retry`/`manual`/`targets` | 无(同上) | 已按**行对象**对位(`lastRep` 的键是行不是 id) |
| 16 | `episode.compose` / `compose` | 两端 | 单件 | `url`/`count`/`fresh` | 无(同上) | 单件产物 |
| 17 | `episode.produce` | 两端 | 编排 | `steps` | 无(子步各自带) | — |

**「有 `ok` 无 `landed`」的清单只有一行:第 5 行 `gen-episode`。** 这不是挑出来的,是数出来的——第 6~12 行那七条单发出口压根没有 `ok` 计数字段(它们回的是那一位/那一行本身),第 13~17 行那五条没有「引擎调用了几次」这个量。W254 那句「11 个出口」现取核过指的是两条命令内部 11 处写 `landed` 的位置(`js/commands.js` 6 处 + `cli.js` 5 处,含空跑那几路的 `landed: 0`),不是 11 条命令;按命令数算,本表 17 行里此前带 `landed` 的是 4 行。

### 1.1 表外的一格:引擎事件里也有一个 `ok`

`js/sb-gen.js` 的 `batchGenVideos` 收尾发 `Bus.emit('shots.batchDone', { ok: okCnt, fail, total, … })`,Agent 对话流订阅后转译成事件卡。它数的同样是引擎成功次数,同样没有 `landed`。**它不是命令出口**(没有 `result`、不进 `Commands.digest`、不被 CLI/MCP 读),故不进上表、本槽不收;但「读到 `ok:3` 的人会以为三行各有产物」这件事在那一格上同样成立,记成残留 3。

## 二、最近邻凭什么是 `gen-episode`:它与那两条同形,而且漏得更硬

明令要「与那两条批量生图/生视频同形:批量、按行落位、可能共位覆盖」。逐条对:

- **批量**:一次点名整集,`todo` 是一份待跑清单,串行逐条跑。
- **按行落位**:待跑清单是从 `ep.shots` 上筛出来的**行**(不是去重后的 id),一行一笔视频钱,与第 3 行那条选人闸口径逐字同形。
- **每轮回最新树重取**:`withProject` 每轮现取一份最新的项目树,在**新取的那棵树上**定位本轮那一行——这正是共位的必要条件,单发那七条与浏览器那两条都没有这一步。
- **可能共位覆盖**:有,而且**比那两条更硬**。第 3、4 行那两条用 `nthShot`/`nthSubject` 按序数取,只有「跑到一半别处改了表、序数越界」才退回首行;`gen-episode` 用的是 `findShot`——它**永远**取首行。同 id 占着三行的一趟,三轮全写在首行身上,不需要任何并发、不需要任何异常。

`cli.js` 里 `nthShot` 上方那段注释把这个形态一字不差地写着(「三行同 id 的一趟会把三份产物全写在首行身上,扣三笔视频钱只有一行出片,而回执报 `ok:3 failed:[]`」),而 `gen-episode` 是这份注释唯一没覆盖到的调用点:全树 `findShot` 现取 17 处、`nthShot` 6 处,`gen-episode` 在前者里。

**没有第二个候选**:上表「有 `ok` 无 `landed`」只有这一行,不存在「先收哪一条」的取舍。

## 三、改的是哪一格

`gen-episode` 的 `result` 恒带 `landed` = 这一趟的产物真落到了几行。

```
{ episode: 'ep1', total: 4, ok: 4, landed: 2, failed: [], shots: {…}, note: '这一趟 4 次调用成功,产物只落到 2 行(landed):…' }
```

- 座位在 `withProject` 回调里**当场记下**:键 = `id + '#' + 它在当轮那棵最新树的同 id 那几行里排第几`,收进一个 `Set`,`landed` 就是集合大小。座位算出来而不是抄 `result.ok`——哪天这一端也改成按序数重取,两个数会自己跟着岔开。
- 座位只在**这一轮真成功之后**才加进集合(`result.ok++` 那一行的紧邻),失败的那一轮不记座位。
- 空跑那一路(确认闸拦下 / 全已出片 / 全终稿)一并带 `landed: 0`,与另外 11 处写法同口径——字段时有时无的话,调用方每次读都得先判 `undefined`。
- 两数岔开时经 `note` 说清,单源 `Domain.landedNote(ok, landed, '行')`,与 `exec` 那两条、浏览器 `Commands.digest` 同读一份;相等的正常一趟一句不加。CLI 这一端另把它 `log` 出来(与 `exec episode.generateVideos` 同形)。

**明令四条一字未动**:

1. **不改 `ok`**:它记的是引擎调用成功次数,那几次都真发生、真扣了钱。
2. **不改写回路径**:仍是 `findShot` 取首行。把它换成 `nthShot` 会让 `landed` 恒等于 `ok`、这个漏在回执上再也读不出来,而那是一次**行为面**改动(改的是产物落到哪一行),不该混在「补诚实字段」这一槽里。
3. **不改计费**:`gen-episode` 的钱由服务端按每次上游调用记,`billing.js` 与两端计费入口零 diff;浏览器侧计费仍一律走 `Tasks.run`。
4. **共位覆盖仍不退费**:`landed:2 / ok:4` 说清了「有两笔钱的产物被盖了」,没有任何一端据此发起退费——那要先定「共位算不算交付失败」这个产品问题,本槽不替它定(原样传下 W254 残留 6)。

## 四、顺手量出来的一格:`result.shots` 本来就收不住共位

`gen-episode` 除了 `ok` 还回一份 `shots` 映射(`{ [shotId]: 'done' | 'failed' }`)。看上去它比 `ok` 更像「落库实况」,其实更不能用——**它的键是 id**,同 id 三行在这份映射里只占一个键。本槽夹具里那一趟 `total:4`,`Object.keys(result.shots).length` 是 **2**,与 `landed` 恰好相等,但那是巧合:同 id 三行里有一行失败时它会被最后一轮的 `'done'` 盖成成功,而 `landed` 仍只数真落地的座位。判据把这一格正面钉住(`shots` 键数 == 2)并在注释里写明「落库数只看 `landed`」,免得下一个人拿 `Object.keys(shots).length` 当落库数用。

## 五、判据:1 条新用例,外加一处夹具口子

新用例落在 `commands` 套件(与 W254 那条 `landed` 判据紧邻),四档:

1. **共位那一趟**:同 id 三行 + 一行不重复,四轮全成功 → `ok:4` / `landed:2`,且 `landed` 等于**磁盘上真出片的行数**(现数,不抄回执);`note` 出现「产物只落到 2 行」;`result.shots` 键数 2。
2. **各占一行的不同 id**:`3/3`,`note` 一句不加——座位键不带 id 时这一档当场变成 `landed:1` 并平白报出一句假话(W254 §4.1 那个坑的同形,本槽正面钉住而不靠副作用)。
3. **一镜也没跑**:确认闸拦下的那一路带 `landed: 0`。
4. **判词同源**:`dup.r.note` 与直调 `Domain.landedNote(4, 2, '行')` 逐字节相等——`gen-episode` 不许另造第二份说法。

**夹具口子**:`loadCli()` 此前只把 `EXEC` 从 vm context 里再求一次值取出来,`CMD` 同为 `const`、不落全局对象,于是**整张命令原语表在单测里够不着**。本槽给它补了一行 `sb.CMD = vm.runInContext('CMD', sb)`(与 `EXEC` 那一行同形、同一段注释里写明理由)。这一格值一记:`gen-episode` 这个漏在 `landed` 补上之前从来没被单测碰过,不是因为它难测,是因为**沙箱把它挡在外面**——W254 现跑两端形态时能量到 `exec` 那两条、量不到它,这是结构性的。

**转红核实**:把 `cli.js` 那一段改动整块 `git stash` 掉再跑 `unit commands`,当场红 1(「landed 得等于真出片的行数(实测 2 行):期望 2,实际 undefined」),`58/59`。

## 六、棘轮:动了两格,都抬到当轮实况

| 格 | 起手支 | 合完 live(含本文) |
|---|---|---|
| 单元测试 | 693 | **696**(净 +1 条用例,live 也是 696) |
| 记账件份数 `FLOOR` | 291 | **292** |
| 集成测试 | 152 | 152(未动) |
| CLI 冒烟 | 117 | 117(未动) |
| 护栏主题 `TOPIC_FLOOR` | 19 | 19(未动) |

单元那格起手支上原本就落后 2 格(W276 §四记过「对侧有意没抬 `['单元测试', 693]`」,live 已是 695)。本槽再加 1 条后差额会变成 **3**——**恰好等于 `SLACK`,一条判据都不会红**,这正是 W276 量出来的那个缓冲窗口。按纪律不吃这个便宜:直接抬到 696,差额回 0。记账件那格同轮抬到 292,目录 / README 明写 / 索引行三处一并校到 292。

`README.md` 明写的单元用例数同轮由 695 改到 696——现跑核实过:只加用例不改 README,`contract` 当场红 1(「实测 696,文档 695」)。

## 七、数字全部合完 live

| 项 | 起手支 | 本槽 live |
|---|---|---|
| `unit` | 695/695 | **696/696 PASS** |
| `unit commands` 套件 | 58 | **59/59** |
| `unit contract` 套件 | 153 | **153/153**(条数未动) |
| `unit domain` 套件 | 44 | **44/44** |
| `unit skills` 套件 | 104 | **104/104** |
| `unit issues` 套件 | 22 | **22/22** |
| `integration` | 152/152 | **152/152 PASS** |
| `cli.smoke` | 115/117 | **115/117**(单独整跑) |
| 记账件份数 | 291 | **292**(含本文) |

`cli.smoke` 单独整跑 `env -u HUJING_SERVER MV_DATA_DIR=… MV_UPLOADS_DIR=… MV_CONFIG=… node tests/cli.smoke.js` 得 115/117,失败两条:

- `未登录 whoami → exit 3`(实际 exit=1)
- `llm --json mock 链路`

同一命令在 `master` 上现跑失败的是**同样这两条、同名同表现**——本槽没有引入,也没有修好。本槽真正相关的那两条(`gen-episode --failed-only 空集短路`、`gen-episode 确认闸拦截`)照旧 PASS:它们读的是 `r.out.total === 0` 与 `r.out.skipped`,新加的 `landed: 0` 一格不改这两个判据的结论。

`node --check` 过:`cli.js`、`tests/unit.js`。按约定**未跑** `e2e.js`。

## 八、保留面机检(本槽树上现取,与起手支逐项对照)

| 项 | 实况 |
|---|---|
| `Skills.gaps()` | **20** 键,一个没剥 |
| `TOPIC_FLOOR` / `SLACK` | 19 / 3,未动 |
| `GUARD_TOPICS` 花名册 | 19,未动 |
| `findShot` / `nthShot` | `cli.js` **17** / **6** 处,与起手支逐格相等(写回路径一字未改) |
| `nthSubject` | 未动 |
| `dupRowsNote` / `dupSubjectRowsNote` / `landedNote` | 三句判词一字未改;`gen-episode` 拼的是第三句、不拼前两句(它不吃点名子集,没有「多花几行的钱」这件事) |
| `emptyBatchNote` / `emptySubjectImageNote` | 未动 |
| `state-put` 写入闸 | 仍只有 `need(f.file, …)` 与 `--force`,**没设闸** |
| `shots-dedupe` | 未动(主体侧照旧没有同类命令) |
| 选人闸六处按行/按位筛 | 一个字没动 |
| `js/produce.js` / `js/commands.js` / `js/domain.js` | 零 diff |
| `billing.js` / 计费入口 | 零 diff |
| 镜号那一族(`Domain.shotNo` 四面) | 零 diff |
| `common` / `cut` / `openEpisodeReview` | 零 diff |
| 本文目录内相对链接 | **0** 处 |

产品面本槽只动了 `cli.js` 一个文件,`js/` 下逐字节未动。

## 九、残留

**销号一条(部分):`landed` 只覆盖两条批量命令。** W254 §残留 5 登记、W257/W276 原样传了两轮,本槽收下第三条 `gen-episode`——收的仍只是回执口径,不是写回路径、不是计费、不是退费政策。这一条**不整条销号**:上表第 6~12 行那七条单发出口仍没有这个字段(见残留 1)。

原样留着 / 新登记的:

1. **单发那七条出口没有 `landed`**(`shot.generateVideo` 两端、`gen-shot-video`、`gen-shot-image`、`subject-image`、`subject-add --gen-image`、`subject-copy`)。它们一次只写一位/一行,共位形态在单轮里不成立,而且都没有 `ok` 计数可与之对照——补进去只会是恒 1 的死字段。但「回执字段两类命令不齐」这件事本身仍是登记项:按 `result.landed` 写通用消费逻辑的人得先知道它只在**批量**那三条上。
2. **`gen-episode` 的写回路径仍取首行**。`findShot` 按 id 取首行这一格没动(明令:本槽只补诚实字段)。要让同 id 三行各得一条片,得把它换成 `nthShot` 并把序数在**全表**上数(与 `exec episode.generateVideos` 那一处同形),那是一次行为面改动,得单开一槽——换掉之后 `landed` 会恒等于 `ok`,本槽这条判据的第一档会随之改口径,一并同轮改。
3. **引擎事件 `shots.batchDone` 的 `ok` 同样读不出落库实况**(§1.1)。它不是命令出口、没有 `result`,但它经 Agent 对话流转译给用户看,「三镜成功」这句话在共位那一趟同样偏高。本槽不收:那要先定「引擎事件要不要跟着回执的字段走」。
4. **共位那一轮的钱没有退路**(原样传 W254 §残留 6)。`landed < ok` 说清了「有几笔钱的产物被盖了」,但没有任何一端据此退费或重排。按现行约定那几次调用都真发生、真交付了产物(只是落到了同一行上),退费口在 `Tasks`/服务端而不在回执层。要把它变成可操作,得先定「共位算不算交付失败」这个产品问题。
5. **`result.shots` 按 id 记,同 id 只剩一个键**(§四)。本槽把它钉成判据、并在注释与 README 里写明「落库数只看 `landed`」,但没有改它的形状——改成按行记就得换键(行序数或行对象),而它是 `gen-episode` 对外的回执字段,改键是破坏性改动。
6. **`state-put` 不设闸**:整树原样落库是刻意的,没设闸(明令)。
7. **主体侧没有 `shots-dedupe` 同类命令**:`dupSubjectRowsNote` 末句给的仍是「回主体库删掉或改 id」这条现有修法。
8. **`loadCli()` 此前够不着 `CMD` 表**(§五)。本槽为这一条把 `CMD` 取了出来,但**只有 `gen-episode` 一条被测到**——那张表里还有四十余条命令原语,单测覆盖率仍是零。这不是本槽要收的,但「沙箱够不着 = 结构性测不到」这个形状值得记:`landed` 这个漏在 `gen-episode` 上躺了两轮没被量到,原因就在这里。
