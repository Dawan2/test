# W218 集成记账:W213 助手下发点分类判据 + W214 主体 note 点名闸同形

新基线 `cursor/w215-integration-b875`,tip `66ef0c6`。按序两次 `--no-ff` 合入两条**已完成**支,
合完 live 现取全部数字。在飞的 W216(镜头 `emptyBatchNote` 点名闸)与 W217(同 id gone 负数)
按任务口径**一条没碰**。

两支**都是**从 **W208**(`4285bc7`)叉出、互不相识,故它们自称的 **627 / 623 一个不采用**;
合完 live 是 **639**。两支的分量也不对称:**W213 产品代码零 diff**(把"不经确认闸的 `run`
下发路必须先过 `cmdManual`"钉成分类判据),**W214 是本槽唯一的产品面改动**,而它只有一行——
`js/domain.js` 里 `emptySubjectImageNote` 的点名判据 `picked && picked.length`
换成与两端选人闸逐字同形的 `Array.isArray(picked) && picked.length`。

合完整棵产品树相对基线只此一处:

```
git diff --stat 66ef0c6 HEAD -- js/ server.js cli.js mcp.js billing.js index.html css/
 js/domain.js | 8 ++++++--
 1 file changed, 6 insertions(+), 2 deletions(-)
```

## 一、两次合并

| 次序 | 被合入支 | 实际 head | 参考 | merge commit | parents |
|---|---|---|---|---|---|
| 1 | `cursor/w213-agent-autoconfirm-6776` | `4d695bf` | `4d695bf` | `ea23b48` | `66ef0c6` + `4d695bf` |
| 2 | `cursor/w214-subject-note-valve-faf8` | `ad0ea58` | `ad0ea58` | `af0ecdc` | `ea23b48` + `ad0ea58` |

两次都是真 `--no-ff`(两个 parent 齐全,不是快进);全程没用过 `--ours`,
没用过 `checkout <old> -- .`,没有一处冲突是靠机械丢掉一侧收的场。

## 二、四棵树机检:W214 的 `js/domain.js` 是 `P1 == B`,整份取对侧

第一次合并的对侧只动了 `README.md` / 目录索引 / 自己那份记账件 / `tests/unit.js` 四个文件,
产品树一个字节没碰,故没有可分成色的产品文件。

第二次合并逐文件比对 `B`(叉点 `4285bc7`)/ `P1`(`ea23b48`)/ `P2`(`ad0ea58`)/ `M`(`af0ecdc`):

| 文件 | 成色 | 后果 |
|---|---|---|
| `js/domain.js` | **`P1 == B`** | 我方自 W208 起就没碰过它(W210 自称的「domain 零 diff」机检属实),git 是**整份取对侧、不是并集** |
| `js/commands.js`、`js/cmd-registry.js`、`cli.js`、`js/sb-io.js`、`js/issues-ui.js`、`js/plans.js`、`js/sb-views.js`、`js/storyboard.js` | `P2 == B` | 对侧零 diff,整份取我方,W215 带进来的东西不可能被冲掉 |
| `server.js`、`mcp.js`、`billing.js`、`index.html`、`css/` | 三方全同 | — |

`P1 == B` 那一格是本槽唯一需要"逐条现取"的地方:**合并没报冲突不等于对侧只带了它自称的那一行**。
现取复核 `js/domain.js` 合完相对我方的全部差异,只有这一处:

- `emptySubjectImageNote` 的点名分档判据换成 `Array.isArray(picked) && picked.length`,
  连同其上四行说明为什么(非数组的 `subjectIds` 在两端选人闸里一律当"没点名"整集跑,
  只看 `picked.length` 会把字符串 id 按字符拆成点名清单、报出用户没点过的位数,
  类数组对象更让 `new Set(picked)` 当场抛,把一次 `ok` 空跑变成 `fail`);
- **`emptyBatchNote` 仍是 `picked && picked.length`**,一个字没动——镜头那一侧是在飞的 W216
  的地方,本槽不代它改;
- **`epComposedReady` 原样在**(`composed` / `composedSimulated` / `composedInputHash` /
  `composedDialogueSig` / `composedStaleByScript` 五道分支逐条现取),W215 的合成跳过闸读的就是它。

## 三、W213 的下发点分类表按合并后的 live 重扫,不照抄 W208 那棵树的读数

W213 的判据核心是一张**在册分类表**:两个动作执行器的每一处下发点都要能归进
「闸内 / 非 exec / `cmdManual` / 人手点击 / 别名面」之一,归不进去报「未归类:<那个实参>」。
这类表按定义是**某一棵树上的处数读数**,而 W213 是在 W208 上点的,中间隔着 W210/W211 两支——
处置口径与 W212 那次「处数 / 文件表该不该重算」同一条:**在新树上用判据自己那份扫描器再扫一遍**,
既不拿陈旧处数打红,也不放宽成"含有即可"。

现取(把 `argSpan`/`confirmSpans`/`dispatchActsArg` 三个扫描器原样搬出来在合完的树上跑):

| 文件 | live 分类序列 | 在册 EXPECT |
|---|---|---|
| `js/agent.js` | 别名面,别名面,人手点击,非exec,闸内 | 同 |
| `js/agent-global.js` | 别名面,别名面,别名面,人手点击,非exec,闸内 | 同 |
| `js/agent-ops.js` | cmdManual | 同 |

逐项相同,故**一格未改**。这不是"照抄绿了",是量完发现 W215 那两支没有新开下发点:
W210 的改动落在 `js/commands.js` / `cli.js` 的合成闸与五个点名入口(`FORCE_FIX`、
计划步尾注、`js/storyboard.js` 等)上,一处都不是 `runEpisodeActions` / `runGlobalActions`
的调用点;W211 产品零 diff。M2 变异(见第六节)证明这张表此刻仍是承重的。

## 四、W215 残留⑤那处照面没有发生

W215 交接留的提醒是:主体 note 安全阀可能与 compose 参数面判据打照面(W215 自己刚把
`episode.compose` 的参数面从 `pid,epid,ui` 改判成 `pid,epid,force,ui`,并写明 `force` 是
**授权位不是子集位**、W207 的论证前提一格没变)。

现取:**没打上照面**。W214 一格没碰参数面——它改的是 `js/domain.js` 里主体那一侧的点名判据,
而 compose 的参数面判据在 `contract` 套件里读的是 `js/cmd-registry.js`。合完整跑,那条
`assertEq(argsOf('episode.compose'), 'pid,epid,force,ui', ...)` 与它的两句对照面
(镜头侧 `shotIds` 在、主体侧 `subjectIds` 在)全绿,一字未改。

任务给的"若冲突只动 `subjectIds` 那一侧"这条现取口径因此**没有用上**,如实记在这里:
本槽既没有放宽 compose 那条判据,也没有为迁就它去动主体侧的选人逻辑——
**选人逻辑(两端 `Array.isArray(subjectIds) && subjectIds.length` 那道闸)一行未改**,
W214 改的只是**回执分档**这一侧,让它与那道闸同形。

## 五、数字:全部合完 live 重跑

| 格 | W215 基线 | W218 live | 说明 |
|---|---|---|---|
| `unit` | 633 | **639** | +5(W213 全落 `agent-ops`)+1(W214 落 `commands`) |
| `agent-ops` | 54 | **59** | |
| `commands` | 45 | **46** | |
| `contract` | 138 | **138** | 未加条数,但三条数字对账用例合并后各红过一次、按 live 订正 |
| `domain` | 36 | **36** | W214 的行为面用例落在 `commands`,不在 `domain` |
| `integration` | 147 | **147** | 未动,整跑复核 |
| `cli.smoke` | 107/109 | **107/109** | 未动,整跑复核;两条失败与基线同名同表现 |
| 记账件 | 228 | **231** | 含本文 |
| `GUARD_TOPICS` / `TOPIC_FLOOR` / 花名册 | 19 / 19 / 19 | **19 / 19 / 19** | 一条未登记、一条未销号 |
| `gaps()` | 20 键 | **20 键** | `js/skills.js` 与基线**逐字节相同**,**SK-04 / G-11 原样开着没装清** |

两格 `FLOOR`(单元测试 633 → 639、记账件 228 → 231)按 live 抬,README 与
`docs/skills-wave/README.md` 明写的两个数同轮改到实况。

`cli.smoke` 两条失败逐条核对与基线同名同表现,不是本槽引入的:
`未登录 whoami → exit 3`(实得 exit=1)、`llm --json mock 链路`(实得 undefined)。

**名集按 `|` 切做多重集比对**(名集抓自实跑输出,四棵源树与合完的 tip 都在**全绿**状态下取,
免得失败行把原因缀在名字后报出假的增减):

| 比对 | 结果 |
|---|---|
| 基线 `66ef0c6` 独有 | **0 条** |
| W213 相对叉点 `4285bc7` 新增 | 5 条,全在 tip 上 |
| W214 相对叉点 `4285bc7` 新增 | 1 条,全在 tip 上 |
| tip 相对三者并集多出 | **0 条** |
| tip 相对三者并集少了 | **0 条** |

`633 + 5 + 1 = 639` 自洽。W213 那 5 条全落 `agent-ops`、W214 那 1 条落 `commands`,
两支相对叉点都是**零删除**。

## 六、变异抽查

在合完且全绿的树上逐手单独施加、单独整跑、逐手还原(纯净增量,不叠加):

| 手 | 改法 | 红 | 报在哪 |
|---|---|---|---|
| M1 | `js/domain.js` 的点名判据退回 `picked && picked.length` | **1** | `commands` 那条的「浏览器 点名给了字符串」一档:期望整集那句、实际 `点名的 3 位主体一位也没跑:3 位没能说清原因`。旧用例夹具全是合法数组,一条也拦不住——本槽合进来的这条是唯一接得住的 |
| M2 | `js/agent-ops.js` 自修复轮的下发实参换成不经 `cmdManual` 过滤的那份 | **2** | `agent-ops · W203 selfFixRound`(行为层:重发名单里混进了 `expert.evolve`)+ `agent-ops · W213 判据…每个下发点都归得了类`(判据层:`agent-ops.js` 的分类由 `cmdManual` 变成未归类)。**两层分工在合完的树上仍成立**:前者拦「改坏了」,后者拦「换个写法绕过去」 |
| M3 | `js/cmd-registry.js` 摘掉 `episode.compose` 的 `force` 位 | **2** | `commands` 那条 CLI 跳过闸(没登记 `sanitizeCmdArgs` 会把它抹掉)+ `contract` 那条参数面全等。W215 带进来的那套在本槽合完后仍承重,不是靠"没报冲突"推断的 |
| M4 | `js/domain.js` 主体那份的安全阀那一句 `say(...)` 删掉 | **2** | `commands` 那条纯函数面的逐字对句 + `domain` 既有那条分档用例。**这一格与 M1 报在同一条用例的不同断言上**,故两手不可互相替代 |

## 七、交接:本槽留下的残留

1. **`emptyBatchNote` 的点名判据仍是 `picked && picked.length`**——镜头那一侧与主体这一侧
   现在**不同形**了。这是有意的:W216 正在飞,那一格归它,本槽不代它改也不替它打红。
   W216 合进来时这两处应当同形,届时**主体这一侧的注释里那句"与两端选人闸逐字同形"**
   要连镜头侧一起复核,别只改一头。
2. **W215 残留⑤(主体 note 与 compose 参数面照面)本槽核完为不成立**,可以从残留表里划掉;
   但划掉的理由是"W214 没碰参数面",不是"参数面判据放宽了"——那条判据一字未改仍按全等钉着。
3. **SK-04 / G-11 原样开着**,`gaps()` 20 键未拆。本槽一格没动 `js/skills.js`。
