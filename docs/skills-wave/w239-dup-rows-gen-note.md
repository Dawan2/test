# W239 · 生成那一拍说出「同 id 多行」:点名一个重复 id 时的双扣费不再闷声发生

基线:`origin/cursor/w238-integration-7e3d` 现取 tip `bba2b4c`(先 `fetch` 再 `rev-parse`;
交接文里 W238 merge 自称 `0df77da`,现取核出其后压着一个把份数与 `FLOOR` 校到 253 的 docs 提交才是 tip,
与 W238 §自己记的那条规律一致——命令行里一个 SHA 不从交接文抄)。

**结论先写:先 live 跑过——两端回执一个字都没提「同 id 多行」、也没点名 `shots-dedupe`,故不停工,补一句 note。**
`js/domain.js` 新开一份双端派生 `dupRowsNote`,两端 `episode.generateVideos` 真跑成功那一档现取它挂上 `result.note`;
**选人闸 `ids.has(s.id)` 一个字未动**——按行筛是对的,改成按 id 只跑一行会让第二、三行永远跑不到。
`emptyBatchNote` 四堆一个字未动(现跑量过:空跑那几档不误导,见 §一末)。

---

## 一、先 live:现跑到底说了什么

沙箱按 `index.html` 顺序加载**真实产品码**(`js/domain.js` + `js/cmd-registry.js` + `js/commands.js` + `js/pipeline.js`),
CLI 那一端直接 `runInContext` 真 `cli.js` 本体(只掐掉末尾 `main()` 入口),换掉的只有服务端往返与生成引擎;
**判几行真跑了一律看引擎实收**(`batchGenVideos` / `genShotVideo` 收到的镜 id),不看回执上的数字。

夹具是 W231/W235 那张被逃生舱灌成重复的表:`dup` / `solo` / `dup` / `dup` 四行、三行同 id,全都已确认未出片。

### 1.1 点名一个重复 id,真跑那一趟

| 档 | 引擎实收 | 回执 | `note` | `digest` 播 |
|---|---|---|---|---|
| 浏览器 headless 点名 `["dup"]` | `dup,dup,dup` | `total:3, ok:3`,`cost:15` | **无** | **0 句** |
| 浏览器 ui 点名 `["dup"]` | `dup,dup,dup` | `total:3, ok:3`,`cost:15` | **无** | **0 句** |
| CLI `exec` 点名 `["dup"]` | `dup,dup,dup` | `total:3, ok:3` | **无** | 日志只有「批量生成:3 镜待处理…」+ 三行 `镜 dup ✓` |
| 对照:点名三个不同 id | `sh0,sh1,sh2` | `total:3, ok:3`,`cost:15` | 无 | 0 句 |

**点名 1 个 id 跑了 3 行的那一趟,与点名 3 个 id 跑了 3 行的正常批量,回执逐字相同、`cost` 也相同。**
交接口径里那句「引擎实收 2、钱扣 2、回执只报 total=2 像正常批量」现跑成立(本槽夹具是 3 行,数更大一点)。
CLI 那一端的日志倒是把 `镜 dup ✓ (1/3)`、`(2/3)`、`(3/3)` 逐行印了出来——**三行同一个 id 连着刷过去**,
但它没说这是"同一个 id 的三行",也没说该怎么办;浏览器那一端连这个都没有(成功档 `digest` 默认静默)。

### 1.2 空跑那几档现跑不误导,故 `emptyBatchNote` 四堆一个字不改

交接给的口径是「空跑 note 帮手四堆不要为这句重写,**除非**现跑空跑档也会误导」。现跑了,不会:

| 空跑档(点名 `["dup"]`) | 现跑那句话 | 判 |
|---|---|---|
| 两行都已定稿 | 「点名的 1 镜一镜也没跑:1 镜已定稿(批量重生成不覆盖定稿产物,需先解锁终稿)」 | 不误导:一行没跑、一分钱没扣,按点名 id 数报是 W223 定的口径 |
| 一行定稿一行鲜镜 | 「点名的 1 镜一镜也没跑:1 镜没能说清原因」 | 不误导:这正是 W223 那道安全阀(同 id 多行口径不一时不硬派) |
| 两行都未确认 | `blocked unconfirmed`「2 镜未确认已跳过」+ `skipped` 逐行报 `order 1/2` | 不误导:零计费,且 `skipped` 已经把两行都摊开了 |

三档的共同点是**一分钱没扣**:这句话要收的是"钱花了而用户不知道多花在哪",空跑那边没有这笔账。
故本槽**一个字不改 `emptyBatchNote`**,新开的是另一份派生。

---

## 二、改了什么(产品码三处,`js/domain.js` +17 / `js/commands.js` +4 / `cli.js` +5)

### 2.1 `js/domain.js`:新开双端派生 `D.dupRowsNote(picked, rows)`

`picked` 是调用方点过名的清单,`rows` 是**这一趟真下发的待跑行**(不是整张分镜表)。
点名清单先按镜去重(与 `emptyBatchNote` 同口径),逐个 id 数它在待跑清单里占几行,只留 `> 1` 的那些,
报出「哪个 id 几行、这一趟按几行逐行跑逐行计费、比点名数多花了几行的钱」,末句点名 `shots-dedupe`。

点名判据 `if (!Array.isArray(picked) || !picked.length) return '';` 与两端选人闸
(`Array.isArray(args.shotIds) && args.shotIds.length`)逐字同形:人手 `--args '{"shotIds":"dup"}'` 递来的字符串
走不进选人闸(命令实跑的是整集那一路),这句话也不许把它当点名——放宽成真值判断时字符串会被拆成字符、
类数组连 `new Set` 都过不去,一次 ok 执行当场变异常。

**为什么另开一份而不改 `emptyBatchNote`**:两者分档不同且落点相反。那一份答的是「为什么是 0 镜」(`total:0` 早退档),
这一份答的是「真跑起来了,而你点的 1 个 id 变成了 3 行」(成功档)。套用四堆会让"跑完了"的回执论起"一镜也没跑"来。
这与 W197 当初不拿 `emptyBatchNote` 顶主体那一侧是同一条理由。

### 2.2 两端调用点

- `js/commands.js`:回执 `r` 组装之后 `const dupNote = Domain.dupRowsNote(args.shotIds, pend);`,非空才挂 `r.result.note`。
  `digest` 的成功档例外(`r.ok && r.result.note` 即 `U.toast`)本来就在,不动一个字,这句话自动有了出口。
- `cli.js`:`todo` 定下来之后先算,**在跑之前先 `log` 一句**(钱还没扣完的时候用户就读得到),回执上同样挂一份。

两端各自算的是自己那一趟真下发的清单(浏览器 `pend`、CLI `todo`),与 `total` 同一个数。

### 2.3 没碰的

选人闸 `ids.has(s.id)` 按行筛一字未动;`generateVideos` 计费公式未动;`state-put` 未设闸;
`Domain.emptyBatchNote` / `emptySubjectImageNote` 四堆未动;`Commands.digest` 未动;
`shots-dedupe` 本体未动;`CMD['gen-episode']`(分镜层那条老批量命令)未动——交接点名的是 `episode.generateVideos`,
它那一路的账如实登记在 §六;`GUARD_TOPICS` / `TOPIC_FLOOR` / `SLACK` 一行未动;
**没有任何静默去重**:这一趟跑完表还是那张表,四行原样躺着。

### 2.4 一处顺手核过的连带面:`episode.produce` 的 `idle` 冒泡没被误触

W228 在 `episode.produce` 收尾时有一格:`c.result.fresh && steps.every(x => x.step === 'compose' || x.result.note)`
即判「整趟一步都没跑起来」,把子步那句话提到顶层。真跑生成时这一步现在会带 note 了,故现跑核过一遍:
点名 `["dup"]` 跑完一键成片,子步 `generateVideos` 带这句、顶层 `note` 仍是 `undefined`。
道理也对得上——`Domain.composedInputHash` 把每镜的视频 url 与 `inputHash` 都算进去,真跑过生成之后 `fresh` 不可能为真;
而 `smartReview` 那句只在可审镜为 0 时才有,刚生成完的集不可能是 0。**这一格如实登记为"现跑核过、未改"。**

---

## 三、钉测试(`tests/unit.js` +3 条)

| 套件 | 用例 | 钉的是 |
|---|---|---|
| `domain` | `dupRowsNote:点名的 id 在表里占着多行时把行数与出口说出来(没点名/不重复一律一句不说)` | 派生本身:开头报点名 id 数不是行数、逐个点名"哪个 id 几行"、说清按几行计费、多花几行的钱、点名 `shots-dedupe`;反面钉住不说话的那几路(点名几个跑几行、同 id 只一行、六种非数组/空数组入参一律回空且**不许抛**)、点名清单去重、多 id 各自多行时只点真重复的那几个、待跑清单为空时不说 |
| `commands` | `generateVideos 点名重复 id 真跑那一趟:两端回执都说出行数并点名 shots-dedupe(选人闸仍按行筛,一行都不许少跑)` | 两端真跑:浏览器引擎实收三行、回执带这句、`Commands.digest` 真播一条;对照面点名三个不同 id 的正常批量与不点名的整集批量各一句不说、`digest` 仍静默;CLI 那端引擎同样实收三行、回执与浏览器**逐字同一句**;落库面:跑完表还是四行 `dup,solo,dup,dup`(生成这一拍不许顺手去重) |
| `contract` | `点名的 id 占多行那句实话双端单源:两端真跑回执都现取 Domain.dupRowsNote,选人闸仍按行筛没被改成按 id 去重` | 源级:`Domain` 须导出这一份、两端 `generateVideos` 段各须现取它、两端**可执行行**里不许出现这句话的字面(整行注释豁免,故 §二那两处注释原样留着);另钉前提——选人闸仍是 `ids.has(s.id)`、待跑清单不许被按 id 收窄(骨架里 `pend =`/`todo =` 的行上不许出现 `new Set`/`findIndex`/`indexOf`);派生侧点名判据与选人闸同形、句子里得有 `shots-dedupe` |

`tests/integration.js` **未加**:本槽不新增任何端点,`js/commands.js` 那一端根本不经服务端。
`tests/cli.smoke.js` **未加**:冒烟套件里没有真跑生成的一路(生成要真上游),
现有那条 `exec generateVideos` 冒烟走的是"一镜也没跑"档,与本槽这一档不同;真跑面由 `commands` 套件两端各跑一遍钉住。

### 3.1 变异十手,逐手红在自己那一句

| # | 怎么改坏 | 结果 |
|---|---|---|
| 1 | 两端回执都不带这句(退回基线) | 红 **2**:`commands`(回执得说出…,实际 `""`)+ `contract`(须现取 `Domain.dupRowsNote`) |
| 2 | 只浏览器带,CLI 不带 | 红 1:`两端得是逐字同一句(各拼一份就会在 toast 与 hujing exec 的 JSON 上读到两种说法)` |
| 3 | 浏览器就地拼第二句(不读 `Domain`) | 红 **2**:`commands`(措辞对不上)+ `contract`(不许就地拼第二句) |
| 4 | 选人闸改成按 id 只跑一行(拿这句 note 给它开路) | 红 **2**:`commands`(`期望 "dup,dup,dup",实际 "dup"`)+ `contract`(待跑清单被按 id 收窄了,报错把那一行原样印出来) |
| 5 | 摘掉点名判据(整集那一路也说这句) | 红 **3**:`commands`(整集那一路不说这句)+ `domain` + `contract` |
| 6 | 点名判据放宽成 `!picked \|\| !picked.length` | 红 **2**:`domain`(非数组 shotIds 不许抛)+ `contract`(须与选人闸同形) |
| 7 | 不点名 `shots-dedupe`(只报行数) | 红 **3**:三个套件各一句(`commands` 的报错写着"只报警不给活路") |
| 8 | 行数改读整张分镜表(把没跑的行也算进来) | 红 1:`commands`(实际印出「按 4 行逐行跑」,而这一趟只跑了 3 行) |
| 9 | 多花的行数少报一行 | 红 **2**:`commands` + `domain`(`3 行 − 点名 1 镜 = 2`) |
| 10 | `digest` 不播成功档的 note | 红 **9**:本条 1 条 + 既有八条(`produce` 空审那句、`commands` 空跑/空补图/produce 冒泡、`pipeline` 断点条、`release` G1/G4/G9 一键处置)——这句话搭的是那张现成的网 |

三处是**先量出来才收紧的**,原样记下来:

- **第 8 手头一版不红。** `commands` 那格原本只查 `/dup 3 行/` 与 `/多花了 2 行的钱/`——
  把 `pend` 换成 `ep.shots` 之后这两个字面照旧成立(重复的仍是 `dup` 3 行、多花的仍是 2),
  变的只有"这一趟按几行跑"那个数。补上 `/按 3 行逐行跑/` 之后当场红。
  **这一格顺带说清了 `rows` 传的是什么:待跑清单,不是整张表。**
- **第 6 手头一版红得不体面**:类数组入参在放宽后的判据下走进 `new Set(picked)` 当场抛,
  报错是一句 `object is not iterable` 而不是判词。把六种坏入参各自接住再报,红的是
  `非数组 shotIds 不许抛(点名判据放宽成真值判断即在这里抛)`。
- **第 2 手只红 1 条,是对的。** 那一手只摘掉 CLI 的 `r.result.note = dupNote` 一句,
  `const dupNote = Domain.dupRowsNote(...)` 还在,故 `contract` 那条源级判据够不着它——
  接住它的是 `commands` 那条"两端逐字同一句"的行为面。源级与行为面各管各的,不合并。

演练脚本的清场只碰 `js/domain.js` / `js/commands.js` / `cli.js` 三个产品码文件,
**收紧判据之后、复测之前先把判据提交掉**(W235 记的那条方法性的坑,本槽照办:先 `commit` 再跑变异)。

---

## 四、live 数字(全部现跑,含本文)

| 项 | 基线 | 本槽 |
|---|---|---|
| `node tests/unit.js` | 655/655 | **658/658 PASS** |
| `node tests/integration.js` | 148/148 | **148/148 PASS**(未加用例,复核过) |
| `node tests/cli.smoke.js` | 115/117 | **115/117**,失败仍是同名那两条:`未登录 whoami → exit 3`、`llm --json mock 链路` |
| `contract` 套件条数 | 141 | **142** |
| 记账件份数 | 253 | **254**(含本文) |

棘轮同轮抬到当轮实况:`['单元测试', 658, …]`、`const FLOOR = 254;`;
`['集成测试', 148, …]` 与 `['CLI 冒烟', 117, …]` 未动。
`README.md` 两处数字同步(单元 658、`contract` 142),另在单元套件覆盖面里补一段说明本槽这句话。
`GUARD_TOPICS` / `TOPIC_FLOOR` / `SLACK` 一行未动。
`node --check` 过:`js/domain.js`、`js/commands.js`、`cli.js`、`tests/unit.js`。

按用户约定,`node tests/e2e.js` 本槽**未跑**。

---

## 五、交接

1. **镜头 id 唯一性现在是四条判据一组,读的时候要一起读**:`shots-import` 设闸(W226)、
   `state-put` 逃生舱有意不设闸(W231)、`shots-dedupe` 是存量出口(W235)、
   **生成那一拍如实说出行数与出口(本槽)**。前三条在 `tests/unit.js` 的 `commands` 套件里是连着的三条,
   本槽这条紧跟在后面,四条连着读。
2. **双扣费这件事本身仍在,本槽收的是"闷声"那一半。** 点名一个 id 仍然跑几行扣几笔——
   这是选人闸按行筛的直接结果,而按行筛是对的(点名两行的正常子集不许被砍)。
   真要改成"按 id 只跑一行",得连着"重复行里各自的内容怎么办"一起判,别拿这句 note 当幌子顺手改掉;
   `contract` 那条源级判据正是为这件事立的。
3. **整集批量(不点名)那一路有意不说这句。** 那一路 `total` 本来就是行数,没有"点 1 个跑 3 行"的错觉;
   哪天判定它也该说(比如想让用户在整集出片时也知道表脏了),请连着措辞一起判——
   那句话得论"表里有几组重复"而不是"多花了几行的钱"(整集那一路每一行都是用户要的)。
4. **`CMD['gen-episode']` 那条老批量命令没碰。** 它也按行跑,同样的账在那条路上照旧闷着;
   交接点名的是 `episode.generateVideos`,故本槽范围就到这里。要收它请连着"两条批量命令的回执要不要同形"一起判。
5. **失败档带不带这句没单独判。** 现在的写法是无论 `ok` 与否都挂 `result.note`(`digest` 在失败档播的是 `error.message`,
   note 只留在回执 JSON 里)。这一档没有用例钉着,是有意留的余量而不是遗漏。
6. **主体库那一侧的同形口子照旧没人追**(`findSubject` 取首行、主体导入路径),W217 §6.5 在册。
7. 冲突面提示:`js/domain.js` 的插入点紧挨 `emptyBatchNote` 之后、`emptySubjectImageNote` 之前;
   `js/commands.js` 与 `cli.js` 各在 `generateVideos` 回执组装处加两三行;
   `tests/unit.js` 三条用例分别插在 `domain` 的 W223 那条之后、`commands` 的 W235 那条之后、
   `contract` 的 W216 那条之后,合并时按"两侧各在同一插入点追加一条完整用例"处理。
