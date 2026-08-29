# W283 主体表补 `subjects-dedupe`:与 `shots-dedupe` 同形的存量重复 id 去重出口

> 起点(现取):`origin/cursor/w282-integration-896d` = `fbf0866882f07ca093a85155d0100f5ea2b673c9`
> 本支:`cursor/w283-roles-dedupe-1150`(功能支,不合 master、不开 PR)
> `checkout -b` 后 `rev-parse HEAD` 现取 `fbf0866882f07ca093a85155d0100f5ea2b673c9`,与交接自称的 `fbf0866` 逐字节相符。
> 产品面与判据落在 `826645b`(本文是紧随其后那一条提交,故本支尖 = 本文这条提交,交接时以 `git rev-parse` 现取为准)。

## 一、这一槽收的是哪条缺口

W277 起历次残留里的第 9 条,原话:

> 主体侧没有 `shots-dedupe` 同类命令。按 id 删主体会清掉同 id 的每一行(`js/roles.js`)。

缺口的形状:逃生舱 `state-put --force` 与 `PUT /api/state` 都**有意不设闸**(整树原样落库),
灌进去的同 id 多位主体就在库里躺着——`findSubject` / `subject-image` / `subject-copy` 全按 id 取**首位**,
后面几位结构性够不着;而两端选人闸按位筛(`ids.has(s.id)`),点名一个 id 跑一次批量补图,
库里重复几位就登记几笔生图钱。镜头那一侧 W235 已经有 `shots-dedupe` 这条显式出口,主体侧一直没有,
`Domain.dupSubjectRowsNote` 末句只能指「回主体库把那几位删掉或改 id」——而**主体库的删除按 id 匹配**
(`js/roles.js` 那一句 `filter(x => x.id !== s.id)`),同 id 那几位会被一并删光,
这条修法本身带着一笔已知代价,note 里必须把它说清才不算把用户往误删里指。

本槽给主体表补上那条命令,**不发明第二套合并策略**:规则、默认档、回执形状一律照 `shots-dedupe`。

## 二、命令名与形状(与 `shots-dedupe` 的同异逐格列出)

命令名 **`subjects-dedupe`**。取的是现网「整表级操作用复数」这条现成口径:
`shots` / `shots-import` / `shots-dedupe` 是整表级,`shot-set` / `shot-confirm` 是单条级;
主体侧 `subjects` 是整表级列表,`subject-add` / `subject-image` / `subject-copy` 是单条级,
故整表级去重落在 `subjects-dedupe` 上。

| 面 | `shots-dedupe`(现网) | `subjects-dedupe`(本槽) |
|---|---|---|
| 用法 | `<pid> <epid> [--apply]` | `<pid> [--apply]`(主体是项目级,没有 epid) |
| 默认档 | dry-run:报重复面与逐行改名计划,**一个字不写库** | 同(逐位改名计划) |
| 写库闸 | 只由 `--apply` 这一位决定 | 同 |
| 落库口径 | 首行留原 id、撞车行改发新 id | 首位留原 id、撞车位改发新 id |
| 新 id | `sh_` + 时间 36 进制 + `crypto.randomBytes(4)`,现发不许拼 | `sj_` + 同形(前缀对齐 `newSubject`) |
| 删不删 | 一行不删(重复行各有各的内容) | 一位不删(同 id 那几位各有各的名字与设定) |
| 回执 | `total`/`unique`/`duplicates`/`plan`/`applied`/`willRename` 或 `renamedIds`+`renamed` | 逐字段同形 |
| `duplicates` 单位词 | `{ id, rows, keepOrder }` | `{ id, seats, keepOrder }`(主体库里没有"行") |
| 干净的表 | 带 `--apply` 也不发写入,note 如实说无需去重 | 同 |
| 计费 | 纯改表、零上游零 LLM,不进 `Tasks.run` | 同(源级钉住) |
| 引用面 | 一个字不动:`lastReview.perShot` / `uiSel` / `Domain.reviseTargets` 按 `find` 首行语义解析 | 一个字不动:分镜按**名字**引用主体(`Domain.findSubject`),按 id 那几处(`findSubject`/资产库保存/卡片定位)一律 `find` 首位语义 |
| MCP | `hujing_shots_dedupe` | `hujing_subjects_dedupe` |

**唯一实质差别就是那两格**(没有 epid、单位词是"位"),其余逐格同形。

## 三、规则下沉:`Domain.dupIdScan`(两条命令同读一份)

「首次出现留原 id、后面每处撞车各发一个新 id」这套规则**不是两侧各写一份**——它定的是"改哪一位、留哪一位",
两份计算一旦漂,用户照 dry-run 那份点的头就不作数了。故规则收进 UMD 派生:

```
D.dupIdScan(rows, mint) → { total, unique, duplicates: [{ id, n, keepOrder }], plan: [{ order, from, to }] }
```

- 纯扫描,**入参一个字段都不改**(落库由命令层按 `plan` 逐条写);
- 发号器 `mint(taken)` 由调用方注入,`taken` 是"已占用 id 的集合"(含原有 id 与本轮已发出的新 id),
  故派生里**零随机源、零环境引用**(不碰 `crypto`/`Date.now`/`window`/`require`),UMD 双端同一份的前提就在这一格;
- 单位词是中性的 `n`,由两端各自换上自己那个(`rows` / `seats`);
- 非数组入参一律当空表(命令层拿到的 `subjects`/`shots` 可能压根不在),不抛;
- 缺 `id` 的条目照同一套规则算(第二处缺 id 的也算撞车)。

`cli.js` 那两个扫描函数因此只剩三件事:调派生、注入自己那端的发号器、换上单位词。
镜头侧原先自己攒的那份记账(`seen` Map + `taken` Set + `dups`)随之删掉——
本槽 `shots-dedupe` 的**外部行为一格没变**(它原有的那条判据一字未改仍全绿),改的只是规则从哪儿取。

## 四、产品面改了哪几处

| 文件 | 改动 |
|---|---|
| `js/domain.js` | 新增 `D.dupIdScan`;`D.dupSubjectRowsNote` 末句改指 `subjects-dedupe`,人工修法与其代价(按 id 删会一并删光)照旧留在后半句 |
| `cli.js` | `dedupeShotScan` 改为委托派生;新增 `dedupeSubjectScan` 与 `CMD['subjects-dedupe']`;help 主体层补一条;逃生舱那段注释把主体侧的收拾办法一并点名;`state-put` 那条 help 尾注补上 |
| `mcp.js` | 新增 `hujing_subjects_dedupe`(工具数 39 → **40**,运行期 `tools/list` 现取) |
| `README.md` | 快速开始补一行、命令总览主体组补名、逃生舱那段补出口、单测覆盖面那段按实况重写、两处数字(单测 698→701、MCP 39→40) |
| `docs/AI助手接入指南.md` | 工具数 39→40;计费与安全约定那节补一条「两张表各有一条显式去重出口」 |

**没碰的**(明令逐条):`state-put` 一个闸都没加(它有意不设闸,零 diff);单发七条没硬加 `landed`;
共位退费口径一个字没动;`Skills.gaps()` 20 键一个没剥;SK-04 未触及;
镜号瞬时/落库/提示词与 `common`/`cut` 未触及;选人闸仍按位筛(去重是用户主动发命令,不是生成那一拍偷偷收窄)。

## 五、判据:新增三条(unit 698 → 701)

| 套件 | 用例 | 钉的那一面 |
|---|---|---|
| `commands` | `CLI subjects-dedupe:…默认 dry-run 不写库,--apply 只改够不着的后续位` | 行为面六格 + 源级四格:dry-run 零写入、回执自述没落库、重复面三样(哪个 id/几位/哪一位留原 id)、逐位改名计划、`--apply` 恰一次提交、一位不删且内容不动、两条路的重复面逐字相同、引用面去重前后落到同一位、**收掉的正是那笔双扣费**(点名一个 id 从三位三笔收成一位一笔且那句 note 自然消失)、干净的库带 `--apply` 也不发写入;源级禁计费、`f.apply` 是唯一写库闸、两条路同调一个扫描、代码骨架里不许冒出引用字段 |
| `commands` | `两条去重命令同读一份规则:…不许两端各抄一份` | 派生在册且算得出计划;两处扫描各判"真委托派生 + 注入了自己那端的发号器 + 换上了自己那个单位词 + 没再攒一份「谁是首位」的记账 + `keepOrder` 只透传";派生自己不许碰随机源与环境 |
| `domain` | `dupIdScan:…发号器由调用方注入` | 纯函数面:`total`/`unique`/`duplicates`/`plan` 四格、首次出现那一处不进计划、入参零改写、**发号器第二次得看得见第一次发出去的那个**、干净表/空表/脏入参一律不发号不抛、缺 id 的条目照同一套算 |

同轮登记护栏主题 **`dedupe-rule-single`**(锚点 `dupIdScan` + `dedupeSubjectScan`,`hosts` 1),
花名册补一行,`TOPIC_FLOOR` 20 → **21**。

另有四处现存判据按新实况同轮改口径(不是新增条数):`domain` 与 `commands` 各一条 note 判据补上
「须点名 `subjects-dedupe`」这句正判(原先只有"不许串用镜头那份措辞"的反判),`contract` 那条双端单源
同形补一句;四处原有的「主体侧没有去重命令」注释按实况改写。

## 六、变异与反事实(全部本槽现跑,每手改完跑整份 `unit` 再 `git checkout --` 复原)

| 手 | 做的什么 | 现取红数 | 报错句(原样抄出) |
|---|---|---|---|
| M1 | `cli.js`:摘掉 `--apply` 闸(`if (!f.apply \|\| !pre.plan.length)` → `if (!pre.plan.length)`) | **红 1** | `dry-run 不许发出任何写入(这条命令的"可撤销"就落在这一格上):期望 0,实际 1` |
| M2 | 落库改成删位(`splice` 掉撞车那几位)而不是改 id | **红 1** | `去重是改 id、不是替用户删位:一位都不许少(同 id 那几位各有各的名字与设定,删掉就是丢数据):期望 4,实际 2` |
| M3 | `js/domain.js`:派生里把**首位**也发一个新 id(首行/首位不再留原 id) | **红 4** | 主体侧 `三位同 id → 留首位、改后两位,实际:3:期望 2,实际 3`;**镜头侧同时红**(`三行同 id → 留首行、改后两行`);另两句来自规则单源那条与派生那条 |
| M4 | `cli.js`:把整套规则抄回 `dedupeSubjectScan`(自己攒 `seen`/`taken`/`dups`,行为完全等价) | **红 1** | `const dedupeSubjectScan 段须委托 Domain.dupIdScan(两端各写一份规则迟早给出两种计划)` |
| M5 | `js/domain.js`:note 末句退回「主体侧没有去重命令」 | **红 3** | `得点名收拾存量重复的那条出口命令`(`domain`)/ `得把主体侧那条去重出口点出来`(`commands`)/ `这句话须点名主体侧那条去重出口`(`contract`) |
| M6 | `README.md`:命令总览那一行去掉 `subjects-dedupe`(两处提名都去掉才红) | **红 1** | `README 命令总览漏登记 CLI 命令(加了命令就同轮补进那一行)` |

**M3 是本槽最实在的一格**:同一手变异让**镜头侧那条老判据也红**,这就是"规则真的只有一份"的现跑证据——
把规则抄回两侧(M4 那种改法)后再做 M3,只会红一侧。M4 反过来证明抄回去这件事本身当场红,
即 M3 那格读数不是靠自觉维持的。M6 那格另记一笔:只去掉主体组里那个名字**不红**(逃生舱那段在同一行里也提了名,
判据问的是"总览那一行有没有点它的名"),两处都去掉才红——如实记下,不改判据。

反事实(能不能把这道保证静默删掉):

| 手 | 做的什么 | 现取红数 | 红在哪 |
|---|---|---|---|
| CF1 | 只删三条新用例,文档与下限一个字不改 | **红 4** | README 三方对账(实测 698 / 文档 701)+ 三套件下限 + 护栏主题失联(点名 `dedupe-rule-single`)+ 护栏抽样前提 |
| CF2a | 删三条 + README 改 698 + 单元 `FLOOR` 改 698(主题与花名册留着) | **红 2** | 护栏主题失联 + 抽样前提,两句都点名 `dedupe-rule-single` |
| CF2b | 再把主题整条删掉 + `TOPIC_FLOOR` 改 20(**花名册那行留着**) | **红 1** | 销号留痕那条(花名册上有、清单与销号台账里都没有) |
| CF2c | 再把花名册那行也删掉 | **红 0** | 单测这一层不再吭声 |

CF2c 那格如实记下:花名册住在记账件里(`w178-topic-floor-unlist.md`),判据只问"花名册上的号在不在册",
**删一行花名册本身没有判据**——它靠的是"记账件落笔即定、删改都看得见"这条,即在 git diff 里露头而不在测试里露头。
这不是本槽新开的口子(现网所有护栏主题同形),但 CF2b→CF2c 这两格读数此前没人量过,记在这里。

## 七、live 数字(逐格现跑,起点两侧都取)

| 面 | 起点 `fbf0866` 现取 | 本槽现取 | 差 |
|---|---|---|---|
| `unit` | 698/698 | **701/701** | +3 |
| `commands` | 61 | **63** | +2 |
| `domain` | 44 | **45** | +1 |
| `contract` | 153 | **153** | 0 |
| `skills` | 104 | **104** | 0 |
| `issues` | 22 | **22** | 0 |
| `integration` | 152/152 | **152/152** | 0 |
| `cli.smoke` | 115/117 | **115/117** | 0 |
| MCP `tools/list` | 39 | **40** | +1 |
| CLI `Object.keys(CMD)` | (`CMD['x']` 与 `CMD.x` 两种写法之和,判据现取) | +1 条(`subjects-dedupe` 走 `CMD['x']` 那一种) | +1 |

W240 那条口径照旧分开写:**MCP 工具数与 CLI 命令数是两个数**,各由自己那一口现取
(MCP 取运行期 `tools/list`、CLI 取 `Object.keys(CMD)`);CLI 那一口是 `CMD['x']` 与 `CMD.x`
**两种写法之和**,本槽新增那条落在 `CMD['x']` 那一种,故只有 bracket 那半 +1、dotted 那半未动。
README 命令总览有意不写个数、只逐条点名,故本槽补的是名字不是数字。

`cli.smoke` **单独整跑**、`env -u HUJING_SERVER`(连 `HUJING_TOKEN` 一并 unset)、无 `MV_*` 在场;
两条失败:`未登录 whoami → exit 3 | exit=1` 与 `llm --json mock 链路 | undefined`;
同 env 下 `master` `9adcf0f` 独立 worktree 现跑 **51/53**、失败两条**同名同表现**,按纪律允许。
`e2e` 未跑(明令)。`node --check` 过:`cli.js`、`mcp.js`、`tests/unit.js` 与 `js/` 全部文件。

棘轮五格:单元 `FLOOR` 698→**701**、集成 **152** 未动、冒烟 **117** 未动、
记账件 `FLOOR` 297→**298**(本文抬到 live,三处同轮校齐:目录实况 298 份、
`docs/skills-wave/README.md` 明写份数 298、`tests/unit.js` 的 `const FLOOR` 字面)、护栏主题 20→**21**。
五格差额 **0/0/0/0/0**,`SLACK` **3** 一格没用掉。
`GUARD_TOPICS` 在册 **21**(末条 `dedupe-rule-single`)/ `GUARD_TOPICS_CLOSED` **0** / `TOPIC_FLOOR` **21** /
花名册 **21** 行,在册集合与花名册集合双向差集都空。`Skills.gaps()` **20** 键一个没剥。

## 八、残留(明令:本文不代修,原话逐条保留)

1. **主体侧没有 `shots-dedupe` 同类命令**(残留 9)——**本槽收掉**:`subjects-dedupe` 已落地,
   `cli.js` 里主体侧同类命令现取 **1** 处(此前 0),`dupSubjectRowsNote` 末句已改指它。
   按 id 删主体仍会清掉同 id 的每一位(`js/roles.js` 那一句一字未动,那是删除语义不是去重语义),
   note 里把这笔代价照旧说清;要"少几位"仍得用户自己删,本命令只改 id。
2. **浏览器侧没有这条出口的入口。** 两条去重命令都只在 CLI/MCP 上,主体库页面没有按钮;
   同 id 多位在页面上长得与两个不同主体一样(卡片按 `p.subjects` 逐条渲染),
   要在页面上发现它,现在只能靠批量补图那句 note。本槽没开 UI 入口(那是另一问:需要弹窗、授权与重渲一整套)。
3. **`unique` 是扫描前那份 id 集合的大小。** 派生回执里 `unique` 报的是**去重前**的 id 数,
   不是落库后的(落库后必然等于 `total`)。两条命令逐字同形,故没改;读的人要按这个口径读。
4. **座位键形状仅行为面**(W282 残留 1)。未动。
5. **失败轮退费未验**(W282 残留 2)。未动。
6. **两条新判据落在 `commands` 而非 `contract`**(W282 残留 3)。本槽新增那两条 `commands` 用例同形,
   源级那条按形态更像 `contract`,放在 `commands` 是为了与行为面那条挨着、变异时红句一起出;代价同 W282 记的那条。
7. **单发七条无 `landed`**(W282 残留 4)。未动。
8. **`batchDone` ok**(W282 残留 5)。未动。
9. **共位不退费**(W282 残留 6)。未触及。
10. **`result.shots` 按 id**(W282 残留 7)。未动。
11. **`state-put` 不设闸**(W282 残留 8)。逃生舱有意不设闸,整树原样落库,零 diff;
    本槽只在那段注释里把主体侧的收拾办法一并点名。
12. **CF4(显式销号 → 红 0)本槽没跑**(W282 残留 10 同形)。本槽跑的是 CF1/CF2a/CF2b/CF2c 四手,
    CF2c 已经把"最后一层靠的是记账件而不是判据"这句量出来;显式销号那条路 W281/W282 已量过,不重量。
13. **跨支量尺本槽没量**(W282 残留 11)。本槽是功能支不是集成支,`js/`/`cli.js` 相对起点有真 diff,
    那把尺子在这里不适用,故明写没量而不是抄一个数。
14. W277 起其余历次残留(写回路径、`ok` 口径与计费)按明令一条没代修,原话逐条保留。
