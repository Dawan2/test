# W216 · 空跑回执的点名判据与选人闸同形(镜头侧,`emptyBatchNote`)

**范围**:`js/domain.js` 一行判据(`emptyBatchNote` 的点名分支)+ `tests/unit.js`(+3 条:`domain` / `commands` / `contract`)
+ `README.md` 与 `docs/skills-wave/README.md` 数字同步。
**基线**:`cursor/w212-integration-cb1e`(`18233eb`)。
**结论**:停工位成立——镜头侧的选人闸是 `Array.isArray(args.shotIds) && args.shotIds.length`,
而 `Domain.emptyBatchNote` 的点名分支是 `picked && picked.length`,两个判据分家。
人手 `--args` 递来的字符串/类数组进不了选人闸(命令实跑的是**整集**那一路),回执却把它当点名:
字符串被按字符去重冒充镜数,类数组连去重都做不了、当场把一次 `ok` 执行变成异常。
本槽只把那一个判据改成与选人闸逐字同形。
**不做**:不动选人闸(不把字符串办成"点名"),不动 `ok`/`blocked` 分档、不动 `Commands.digest`、
不碰 `emptySubjectImageNote` 一个字(主体侧那一处归 W214)、不动 compose 指纹跳过、
不动 agent 侧的确认,不登记 `GUARD_TOPICS`、不拆 `Skills.gaps()` 键。

## 1. 基线 live 举证

在基线 `18233eb` 上起真服务(`MOCK_LLM=1`)、子进程直跑 `cli.js`,
一集两镜、都写成"已确认 + 已出片"(于是整集与点名两路都走得到空跑早退),
逐形态跑 `hujing exec episode.generateVideos --pid … --epid … --args '<每行那份>'`:

```
A  {"shotIds":[]}                              exit=0  note=本集没有待生成的镜头,一镜也没跑:2 镜已出片
B  {"shotIds":["nope"]}                        exit=0  note=点名的 1 镜一镜也没跑:1 镜不在本集
C  {"shotIds":["sh_…_0","sh_…_1"]}             exit=0  note=点名的 2 镜一镜也没跑:2 镜产物已是最新
D  {"shotIds":"sh_mtd5xqrm_0"}                 exit=0  note=点名的 11 镜一镜也没跑:11 镜不在本集   ← 假话
E  {"shotIds":{"0":"sh_…_0","length":1}}       exit=1  stdout={"error":"object is not iterable
                                                        (cannot read property Symbol(Symbol.iterator))"}  ← ok 变 fail
F  {"shotIds":1}                               exit=0  note=本集没有待生成的镜头,一镜也没跑:2 镜已出片
G  {}                                          exit=0  note=本集没有待生成的镜头,一镜也没跑:2 镜已出片
```

逐条对交接问的三题:

1. **`shotIds` 是合法数组时 note 诚实**——A(空数组)与选人闸同判,两边一起落到整集那一路;
   B/C 点名分堆各说各的。这一路一个字都不用改,本槽也确实没碰它。
2. **非数组时命令当整集跑,而 note 说的是点名**。
   D 那句里的 `11` 是 `[...new Set('sh_mtd5xqrm_0')]` 的长度——13 个字符去重成 11 个,
   于是回执报「点名的 11 镜…11 镜不在本集」。**末堆是 0**(字符全都"不在本集"),
   所以"各堆之和 = 点名数"那条既有判据在这里照旧成立、一声不吭:
   它守的是堆与堆之间对得上账,守不了"点名数本身是编出来的"。
   E 更远一步:`picked.length` 为真而 `new Set(obj)` 不可迭代,异常从派生里抛出来,
   `cli.js` 的 `exec` 直接非零收场(`ok` 的一次执行变成 `error`)。
   F 数字这一路碰巧同判(`(1).length` 是 `undefined`,真值判断也走整集),不是判据对齐、是巧合。
3. **基线没有 `Array.isArray` 对齐**,故停工条件不命中,继续。

`--args` 后面这串是 `JSON.parse` 原样进来的,`cli.js` 的参数合流只按键补 flag、没有第二道整形
(`js/agent-ops.js` 的 `sanitizeCmdArgs` 会把模型给的 `shotIds` 整形成数组,但那条路只管模型,
人手 `exec` 与 MCP 的 `--args` 都不经它)。浏览器那一端同形:`js/commands.js` 的选人闸逐字相同,
只是异常被 `Commands.execute` 的 `catch` 兜成 `fail('exception')`——回执从 `ok` 变 `failed`,
`js/plans.js` 会把这一步归成失败步、`episode.produce` 的 `steps` 里多一条假失败。

## 2. 改了哪一句

`js/domain.js` `D.emptyBatchNote` 的点名分支,一行:

```js
- if (picked && picked.length) {
+ if (Array.isArray(picked) && picked.length) {
```

与两端选人闸 `Array.isArray(args.shotIds) && args.shotIds.length` 逐字同形。
注释同轮补上理由(为什么不是真值判断)。改完 D/E/F 三形态与 G 逐字同句:
`本集没有待生成的镜头,一镜也没跑:2 镜已出片`——**命令跑的是整集,回执说的也是整集**。

**选人闸一个字没动**,这是本槽有意留的边界:把字符串办成"点名一镜"是放宽执行面,
那要另判(点名到的镜是重跑还是跳过、终稿锁怎么算、谁来为多扣的费负责),不是一句回执的事。
本槽只让**回执分档跟着选人闸走**,与主体侧那一处(W214)同一条纪律。

分堆逻辑、末堆安全阀、去重、整集那一路的三堆,一个字没动。

## 3. 加测三条

| 套件 | 用例 | 判据 |
|---|---|---|
| `domain` | `emptyBatchNote:点名判据与两端选人闸同形(非数组的 shotIds 走整集那一路,不拆成字符也不抛)` | 直判派生:字符串 `'sh0'`、类数组 `{0:'sh0',length:1}`、数字 `1` 三形态与不点名那句**逐字相等**;反面钉住合法数组两路一个字没动(空数组仍是整集、非空数组仍走点名分堆) |
| `commands` | `generateVideos:人手递来的字符串/类数组 shotIds 两端都当整集跑,回执那句话跟着选人闸走` | 两端各真跑一遍——浏览器命令层三次执行的 `note` 同句、`ok` 恒真(类数组不许被兜成 `exception`)、`batchGenVideos` 一次都不起;`cli.js` 沙箱(只掐掉末尾 `main()`)跑它自己那份选人闸,三次 `note` 同句且引擎实收 `''` |
| `contract` | `空跑回执的点名判据与选人闸同形:两端选人闸只认数组,emptyBatchNote 的点名分支也只认数组` | 源级三处:`js/commands.js` 与 `cli.js` 的 `generateVideos` 段各须有 `Array.isArray(args.shotIds) && args.shotIds.length`,`js/domain.js` 的 `emptyBatchNote` 段须有 `if (Array.isArray(picked) && picked.length)` |

三处切片都先自证取得到(找不到锚点即红,不许留成恒真);派生那段另数了可执行行数,
整段被判成注释时先红在行数那句上。

**`cli.smoke` 一条没加**:那两端的行为面已由 `commands` 这条用例在两个沙箱里各跑了一遍,
分母保持 **109** 不动(冒烟每加一条都要多起一次真服务,而这条测的是纯判据)。

## 4. 变异

六手,每手改完整跑 `node tests/unit.js`,验完 `git checkout` 还原(还原后 `git status` 干净)。
末尾另跑一次不变异的自证,读数 **0**。

| # | 变异 | 结果 |
|---|---|---|
| 1 | `js/domain.js` 退回 `picked && picked.length` | 红 **3**:`domain`(字符串被当点名)、`commands`(字符串那一句对不上整集那句)、`contract`(源级写法) |
| 2 | `js/commands.js` 选人闸放宽成 `args.shotIds && args.shotIds.length` | 红 **3**:`commands`(类数组把 `ok` 判成异常)、`contract` ×2(本槽这条 + 既有那条「过期镜的唯一出口:两端子集位都放过期镜过」) |
| 3 | `cli.js` 选人闸放宽成同一手 | 红 **4**:`commands`(`object is not iterable` 直接从沙箱里抛出来)、`contract` ×3(本槽这条 + 过期镜出口那条 + 既有那条「问题中心的重抽面现取 `Domain.reviseShotIds`」也在 `cli.js` 同一处取数) |
| 4 | 派生判据换成 `typeof picked === 'object' && picked && picked.length`(字符串接住了、类数组没有) | 红 **3**:`domain`(类数组当场抛)、`commands`、`contract` |
| 5 | 派生判据收窄成 `Array.isArray(picked) && picked.length > 1`(非数组这一路也对,但伤到合法数组) | 红 **4**:`domain` ×2(既有那条的"同一镜点名多次仍是一镜" + 本槽这条的"合法非空数组照旧走点名")、`commands`(W188 那条的鲜镜档)、`contract` |
| 6 | 判据**行为不变**,只把 `if (Array.isArray(picked)\n && picked.length) {` 拆成两行 | 红 **1**:只有 `contract` 那条源级判据 |

**变异 2 与 3 的读数分得开且不对称**,如实记下来:改浏览器那一端时 `commands` 那条红在
"类数组不许把一次 `ok` 执行判成异常"(异常被 `Commands.execute` 兜住,报的是断言);
改 CLI 那一端时 `cli.js` 没有那层兜底,异常直接把用例打断,报错句是原始的
`object is not iterable`。同一手改法在两端报出两种形状,**没有一端替另一端作证**。

**变异 6 是本槽这条 `contract` 判据的代价**:它按整行字面匹配,行为等价的换行写法照样红。
留成这样是有意的——判据要的是"两处写法逐字同形"这件事本身可读可比,
一旦改成语义匹配(去空白再比、或解析表达式),它接住变异 1 的能力也跟着模糊。
换行重排时同轮改这条用例即可,报错句已经把该找的那一行原样印出来。

## 5. 回归数字(live)

| 套件 | 基线 `18233eb` | 本槽 |
|---|---|---|
| `unit` | 627/627 | **630/630** |
| └ `domain` | 36 | **37** |
| └ `commands` | 42 | **43** |
| └ `contract` | 138 | **139** |
| `integration` | 147/147 | **147/147**(未动,实跑复核过) |
| `cli.smoke` | 107/109 | **107/109**(未动;失败仍是与 `master` 同名的那两条:`未登录 whoami → exit 3`、`llm --json mock 链路`) |

产品面只有 `js/domain.js`(+5 −2):判据 1 行改写,其余是同轮补上理由的注释。
`js/commands.js` / `cli.js` / `mcp.js` / `server.js` / `js/plans.js` / `js/issues.js` / `js/release.js`
逐个零 diff。治理面零变动:`Skills.gaps()` 键数、注册表条数、短名单、`CHECKS`、`preflightStages()`、
`GUARD_TOPICS` / `GUARD_TOPICS_CLOSED` / `TOPIC_FLOOR`(仍 19 / 0 / 19),一个数没动;
门槛面同样零变动(G1–G10 判据、`ok`/`blocked` 分档、`Domain.emptySubjectImageNote`)。

棘轮按 **live** 抬:`tests/unit.js` 单元 `FLOOR` 627 → **630**、记账件 `FLOOR` 225 → **226**;
`README.md` 的「单元测试(N 项断言」627 → 630、契约段自报条数 138 → 139;
`docs/skills-wave/README.md` 明写份数 225 → **226**(含本份)。

## 6. 与 W214 的冲突面

W214 收的是主体侧同一形的漏报(`emptySubjectImageNote` 与 `subjectIds` 选人闸)。
两槽都改 `js/domain.js`,但落点是**两个函数各一处**:

```
D.emptyBatchNote          第 284 行  if (Array.isArray(picked) && picked.length) {   ← 本槽
D.emptySubjectImageNote   第 315 行  if (picked && picked.length) {                  ← W214 的地
```

相隔三十余行,`git` 大概率一个冲突块都不给——**那不等于不必核**:
`const ids = [...new Set(picked)];` 这一行在本文件里有两处,合完要逐处现取确认两个判据都对齐了
(W197 记过一格假变异读数就栽在同一件事上:`perl -0pi -e 's///'` 无 `/g` 只换第一处)。
`tests/unit.js` 三个锚点(`domain` 用例块、`commands` 用例块、`contract` 用例块)两槽会各在
邻近位置追加,取并集时按既有规矩补回收口那一行。数字面两槽都会抬同一批字面(unit / contract /
`FLOOR` / README),一律按合完 live 实跑定,不抄任一支自称。

## 7. 交接

1. **`emptyBatchNote` 的末堆安全阀在字符串那一路上是哑的**:D 那句里 13 个字符去重成 11 个、
   全归"不在本集",末堆读数 0。判据对齐之后这条路走不到了,但那个安全阀本身
   **只对得起"堆与堆之和 = 点名数"这一层**,守不了"点名数是从哪来的"。
   哪天再给别的批量命令补空跑 note,分堆之外还得单独问一句:点名数这个分母本身可信吗。
2. **选人闸"字符串当不当点名"这个产品口径本槽没定**。今天两端一致地把它当整集,
   本槽只让回执跟上;要改成"单个 id 也算点名",得同轮定重跑/终稿锁/扣费三件事,
   本槽这条 `contract` 用例会在那一刻当场红,把这段话叫醒。
3. **`episode.smartReview` 的 `shotIds` 子集位也吃同一个形状的入参**
   (`js/commands.js` 与 `server.js` 都是 `Array.isArray(b.shotIds) && b.shotIds.length`),
   两端判据本来就同形、且那一路没有第二份"为什么是 0 条"的派生,故本槽没碰。
   哪天给复审也补一句空跑 note,先照本槽这条量一遍再落笔。
4. **`js/agent-ops.js` 的 `sanitizeCmdArgs` 是模型那一路的整形口**(把镜号归一成 id、
   非数组丢弃),人手 `exec` 与 MCP 的 `--args` 都不经它。要不要给人手那一路也加一道整形,
   属命令入参口径题——加了之后本槽这条同形判据仍然要在(整形口坏了它是第二道网),
   但分档结论会变(字符串那时真成了点名),得同轮重判。
