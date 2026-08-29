# W284 把 W283 合入 W282 尖:集成线上第十二条「快进形」

> 我方起点(现取):`origin/cursor/w282-integration-896d` = `fbf0866882f07ca093a85155d0100f5ea2b673c9`
> 对侧(现取):`origin/cursor/w283-roles-dedupe-1150` = `2fa6c0710b3ce28b66ae972e4b15863ff901a0d6`
> 本支:`cursor/w284-integration-7c31`,从 w282 现取 HEAD 拉出,`checkout -b` 后 `rev-parse HEAD` 现取 `fbf0866882f07ca093a85155d0100f5ea2b673c9`
> merge parents `fbf0866` + `2fa6c07`,merge commit **`5ff714dfd8dba235894e1e6783181d83a97175c5`**,一次 `--no-ff`,零冲突。
> 不合 master、不开 PR、不开第三条功能支。

## 一、合入形状:第十二条快进形,两个空集叠着

`git merge-base P1 P2` 现取 `fbf0866882f07ca093a85155d0100f5ea2b673c9`,**恰等于本支起点**,
`git merge-base --is-ancestor P1 P2` 成立,故是**快进形**(集成线上第十二条);仍按纪律走 `--no-ff`。
`P1..P2` 两条提交,自称尖 `2fa6c07` 与自称叉点 `fbf0866` 两处现取核过、都与交接自称逐字节相同,自称尖是链尾:

| 提交 | 说的是什么 |
|---|---|
| `826645b` | 主体表补 `subjects-dedupe`(产品面与判据) |
| `2fa6c07` | W283 记账件 + 索引一行(链尾,即本槽合的那个尖) |

**两个空集**:`tree(M)` 现取 `e417cd91249d5e73b48ad38d96c7a74b0df2d793`,与 `tree(P2)` 逐字节相同,
故 `git diff M P2` 整树空集;快进形本就让这一格恒真(第十二次),**这句话一格结论不承载**。
与 W282 那槽不同的是,本槽对侧**不是只加测**:`git diff M P1 -- js/ cli.js mcp.js` 现取
`cli.js` / `js/domain.js` / `mcp.js` 三个文件真有 diff(22 插 93 删——`cli.js` 净减是因为镜头侧
原先自己攒的那份记账被下沉后删掉了),所以产品面那一格不空,但它证明的是"对侧改了东西",
仍不证明"我方没丢东西"。**说得出话的只有变异与 live 两面**,下面 §三/§四是本槽真正承载结论的地方。

## 二、真并集核过的那几处

| 面 | 现取 | 并集是否真的成立 |
|---|---|---|
| `GUARD_TOPICS` 在册 | **21**(末条 `dedupe-rule-single`) | W282 带进来的 `landed-seat-order` 与 W283 的 `dedupe-rule-single` **两条都在**,不是二选一 |
| `GUARD_TOPICS_CLOSED` | **0** | 无销号 |
| `TOPIC_FLOOR` | **21** | 对侧自称 21,现取核过是 21,**没有仍写 20** |
| 花名册(`w178-topic-floor-unlist.md`) | **21** 行 | 末两行 `landed-seat-order`(W281)与 `dedupe-rule-single`(W283)并存 |
| 在册 ↔ 花名册 | 双向差集**都空** | 现跑取两个集合逐个比,不靠读文档 |
| 记账件目录实况 / 索引表行数 / README 明写份数 | 合入后 **298 / 298 / 298**,本文落笔抬到 **299 / 299 / 299** | 三方对齐,`tests/unit.js` 的 `const FLOOR` 同轮校齐 |
| 索引表 | `w281` / `w282` / `w283` 三行都在,本文补第 299 行 | 逐行现取,不是只留最后一份 |
| README / 接入指南数字 | 单测 **701**、MCP **40** | 见 §三,全部 live 现取 |
| `Skills.gaps()` | **20** 键一个没剥 | 现跑 `require('./js/skills.js').gaps()` 取键数与键集 |

`TOPIC_FLOOR` 那一格另做了一手反证:把它改回 **20**,`contract` 那条当场红 1,
报错句原话 `下限 20 低于花名册的 21 条:下限只增不减,改小它就是给"往后白删几条"腾地方`——
即"禁止仍写 20"这句纪律此刻**有判据接着**,不是靠自觉。

## 三、live 数字(逐格现跑,两侧自称的 698 与 701 都没盲抄)

起点 `fbf0866` 独立 worktree 现跑 **`698/698 PASS, 0 FAIL`**(W282 自称的那个数,是**起点数**),
合完本支现跑 **`701/701 PASS, 0 FAIL`**(W283 自称的那个数,现取相符)。**记的是 701,不抄 698。**

| 面 | 起点 `fbf0866` 现取 | 本支现取 | 差 |
|---|---|---|---|
| `unit` | 698/698 | **701/701** | +3 |
| `commands` | 61 | **63** | +2 |
| `domain` | 44 | **45** | +1 |
| `contract` | 153 | **153** | 0 |
| `skills` | 104 | **104** | 0 |
| `issues` | 22 | **22** | 0 |
| `integration` | 152/152 | **152/152** | 0 |
| `cli.smoke` | 115/117 | **115/117** | 0 |

24 套件逐格求和 **= 701**(`contract` 153 + `skills` 104 + `commands` 63 + `agent-ops` 60 +
`release` 51 + `domain` 45 + `memory` 35 + `experts` 29 + `produce` 23 + `issues` 22 + `plans` 17 +
`store` 16 + `pipeline` 13 + `sb-views` 10 + `billing` 10 + `api` 10 + `split` 9 + `flow` 7 +
`sb-gen` 5 + `bus` 5 + `sb-io` 4 + `continuity` 4 + `understanding` 3 + `tasks` 3),`698+3=701` 自洽。

**MCP 与 CLI 那两个键数分列写,不混成一个数**(W240 那条口径照旧):

| 那一口 | 取数方式 | 现取 |
|---|---|---|
| MCP 工具数 | 运行期 `tools/list`(不数源码行) | **40**,含 `hujing_subjects_dedupe` 与 `hujing_shots_dedupe` |
| CLI 命令数 | `Object.keys(CMD)` | **50** |
| ── 其中 bracket `CMD['x']` | 源码逐行数 | **26** |
| ── 其中 dotted `CMD.x` | 源码逐行数 | **24** |

`26 + 24 = 50`,与运行期 `Object.keys(CMD)` 相等(判据本身就钉这一等式:只数一种得出的是半数)。
本槽新增那条 `subjects-dedupe` 落在 bracket 那一种,故 bracket 那半 +1、dotted 那半未动。
README 命令总览有意不写个数、只逐条点名,故那一行核的是名字在不在。

`cli.smoke` **单独整跑**、`env -u HUJING_SERVER -u HUJING_TOKEN`、无 `MV_*` 在场,现取 **115/117**;
两条失败 `未登录 whoami → exit 3 | exit=1` 与 `llm --json mock 链路 | undefined`;
同 env 下 `master` `9adcf0ff964891dc17c352f6ae06db6ee7a9383b` 独立 worktree 现跑 **51/53**、
失败两条**同名同表现**,按纪律允许。`e2e` 未跑(明令)。
`node --check` 过:`cli.js`、`mcp.js`、`server.js`、`billing.js`、`tests/` 与 `js/` 全部文件。

棘轮五格:单元 `FLOOR` **701**、集成 **152**、冒烟 **117** 三格随 live 未动,
记账件 `FLOOR` 298→**299**(本文落笔,三处同轮校齐),护栏主题 **21** 未动。
五格差额 **0/0/0/0/0**,`SLACK` **3** 一格没用掉。

## 四、变异:快进形的空集不能当没丢东西

明令「快进形 diff 空集不能当没丢东西」。整树 diff 恒空,故本槽逐手现跑变异,每手改完跑整份 `unit` 再复原:

| 手 | 做的什么 | 现取红数 | 报错句(原样抄出) |
|---|---|---|---|
| M1 | `cli.js`:摘掉 `--apply` 闸(`if (!f.apply \|\| !pre.plan.length)` → `if (!pre.plan.length)`) | **红 1** | `dry-run 不许发出任何写入(这条命令的"可撤销"就落在这一格上):期望 0,实际 1` |
| M3 | `js/domain.js`:派生里把**首位**也发一个新 id | **红 4** | 主体侧 `三位同 id → 留首位、改后两位,实际:4:期望 2,实际 4`;**镜头侧同时红**(`三行同 id → 留首行、改后两行,实际:4`);另两句来自规则单源那条与 `domain` 派生那条 |
| M4 | `cli.js`:把整套规则抄回 `dedupeSubjectScan`(自己攒 `seen`/`taken`/`dups`,行为完全等价) | **红 1** | `const dedupeSubjectScan 段须委托 Domain.dupIdScan(两端各写一份规则迟早给出两种计划): = subs => {` |
| M5 | `js/domain.js`:note 末句退回「主体侧没有去重命令」 | **红 3** | `得点名收拾存量重复的那条出口命令`(`domain`)/ `得把主体侧那条去重出口点出来`(`commands`)/ `这句话须点名主体侧那条去重出口`(`contract`) |
| M6 | `README.md`:命令总览那一行两处提名都去掉 | **红 1** | `README 命令总览漏登记 CLI 命令(加了命令就同轮补进那一行):期望 "",实际 "subjects-dedupe"` |
| CF | `tests/unit.js`:`TOPIC_FLOOR` 21 → 20 | **红 1** | `下限 20 低于花名册的 21 条:下限只增不减,改小它就是给"往后白删几条"腾地方` |

六手的红数与报错句与对侧记账逐字节相符。M4 那格值得单记:**行为完全等价却照旧红**,
接住它的是源级那条(判"真委托派生"),而不是任何行为面判据。

**跨支量尺(本槽真正承载结论的那一格)**:M3 那一手在起点 `fbf0866` 干净 worktree 上做**同形**改法
(起点没有 `Domain.dupIdScan`,规则内联在 `cli.js` 的 `dedupeShotScan` 里,故改那一处的"首行也发新 id"),
现跑 **`697/698 PASS, 1 FAIL`** —— **只红镜头侧那一条**;
合完本支同一手概念的改法(改 `js/domain.js` 那一处)现跑 **`697/701 PASS, 4 FAIL`**,
**镜头侧与主体侧同时红**。同一手概念的变异,**起点红 1 / 合完红 4**,
且合完那 4 条里有一条是"改一处让另一侧的老判据也红"——这就是本槽真收到一道保证的现跑证据:
规则此刻真的只有一份,不是两侧各抄一份看着一致。这一格不靠任何一侧的文档口径。

## 五、核过:该在的在,该没动的没动

明令要核的四格,逐格现取:

| 要核的 | 现取结论 |
|---|---|
| `subjects-dedupe` 在 | `CMD['subjects-dedupe']` 在册,`Object.keys(CMD)` 数得到;help 主体层有那一行;MCP `hujing_subjects_dedupe` 在 `tools/list` 里 |
| `Domain.dupIdScan` 在 | `typeof D.dupIdScan === 'function'`,直调现跑回 `{total,unique,duplicates,plan}` 四格,首位不进计划、发号器第二次看得见第一次发出的那个(`taken` 1 → 2)、入参零改写、空表/脏入参一律不发号不抛 |
| `shots-dedupe` 外部行为未丢 | 真跑现取:dry-run `total 3 / unique 2 / willRename 1 / applied=false`,单位词仍是 **`rows`**(没被主体侧的 `seats` 串味),`--apply` 一行不删、首行留原 id `sh_dup`、新 id 走 `sh_` 前缀、三行内容一字未动 |
| `js/roles.js` 删除语义未改 | `git diff` 相对 W282 尖与相对 `master` **两条都空**;那一句 `p.subjects = p.subjects.filter(x => x.id !== s.id)` 仍在第 491 行,按 id 删仍清同 id 每一位 |

另跑了一份 24 格 live 探针(真起服务 + 逃生舱灌同 id 多位/多行的树,跑完清理,不入仓库),**24/24 现取通过**:
`state-put --force` 把三位同 id 主体原样灌进库(有意不设闸)→ dry-run 报 `total 4 / unique 2 / willRename 2 / applied=false`
与 `duplicates: [{id:'sj_dup', seats:3, keepOrder:0}]`、库里四位 id 一个字没动 → `--apply` 后仍 **4 位**(一位不删)、
id 全唯一、首位仍 `sj_dup`、新 id 走 `sj_` 前缀、名字「甲乙丙丁」原序未动、首位那张图没丢、回执无 `cost` 字段(零计费)→
干净的库再带 `--apply` 也 `applied=false` 并如实说无需去重;MCP 那条走同链路真跑通。

## 六、残留(明令:本文不代修,原话逐条保留)

1. **浏览器侧没有这条出口的入口。** 两条去重命令都只在 CLI/MCP 上,主体库页面没有按钮;
   同 id 多位在页面上长得与两个不同主体一样(卡片按 `p.subjects` 逐条渲染),
   要在页面上发现它,现在只能靠批量补图那句 note。W283 没开 UI 入口(那是另一问:需要弹窗、授权与重渲一整套)。
2. **`unique` 是扫描前那份 id 集合的大小。** 派生回执里 `unique` 报的是**去重前**的 id 数,
   不是落库后的(落库后必然等于 `total`)。两条命令逐字同形,故没改;读的人要按这个口径读。
   本槽现取复核:dry-run 那一趟 `total 4 / unique 2`,`--apply` 之后再查 `total 4 / unique 4`,与这条口径相符。
3. **按 id 删主体仍会清掉同 id 的每一位**(`js/roles.js` 那一句一字未动,那是删除语义不是去重语义)。
   note 里把这笔代价照旧说清;要"少几位"仍得用户自己删,`subjects-dedupe` 只改 id。
4. **单发七条无 `landed`**(W282 残留 4)。未动。
5. **共位不退费**(W282 残留 6)。未触及——同 id 那几位/几行被覆盖的那几次调用都真花了钱。
6. **`state-put` 不设闸**(W282 残留 8)。逃生舱有意不设闸,整树原样落库,零 diff;
   W283 只在那段注释里把主体侧的收拾办法一并点名。本槽现跑正是靠这一格把脏数据灌进去的。
7. **座位键形状仅行为面**(W282 残留 1)。未动。
8. **失败轮退费未验**(W282 残留 2)。未动。
9. **两条新判据落在 `commands` 而非 `contract`**(W282 残留 3)。未动,代价同 W282 记的那条。
10. **`batchDone` ok**(W282 残留 5)。未动。
11. **`result.shots` 按 id**(W282 残留 7)。未动。
12. **CF4(显式销号 → 红 0)本槽没跑。** 本槽跑的是 `TOPIC_FLOOR` 改小那一手反证(红 1);
    显式销号那条路 W281/W282/W283 已量过,不重量。
13. **W283 §六 M6 那格的读数照抄未复量**:只去掉 README 主体组里那个名字**不红**(逃生舱那段在同一行里也提了名),
    两处都去掉才红。本槽 M6 直接做的是"两处都去掉"那一档,单去一处那一档没另跑,如实记下。
14. W277 起其余历次残留(写回路径、`ok` 口径与计费)按明令一条没代修,原话逐条保留。
