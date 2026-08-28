# W221 · 全集过期终稿时断点条按钮仍显示:停工成立,产品零 diff

**结论**:**停工条件成立**。全镜 `final && stale` 时按钮**照旧渲染**,文案已如实说明这一按跑得到几镜,
下发子集与计数口径三方对得上,点完还有一句回音。故**不藏按钮**,产品代码零 diff,本槽只加两条钉住现况的测试。

**范围**:`tests/unit.js`(+2 条:`pipeline` 1、`contract` 1)+ `README.md` 与本目录 `README.md` 的数字同步。
**基线**:`cursor/w218-integration-e5d2`(fetch 后现取 `5f76836`,与交接单自称一致)。
**不做**:不藏按钮、不改 `counts.stale` 判据(不把 `!s.final` 从计数里拿掉,W177 纪律)、不动 `js/plans.js`、
不动 `emptyBatchNote` / `emptySubjectImageNote` / `gone` 计数(W216/W217/W220 的地)、不改 compose 指纹跳过、
不剥 `Skills.gaps()`、不登记 `GUARD_TOPICS` / 花名册 / `TOPIC_FLOOR`。

## 1. 现跑举证:全镜 `final && stale` 那一档到底是什么样

在本槽尖上用一次性探针跑的(沙箱取 `tests/unit.js` 的 `loadPipelineFix()`:命令层注册表 + `SBGen` 引擎桩
+ `pipeline.js`,再包一层 `Commands.execute` 留档实收的 `shotIds`;夹具取 `pipeStaleProject(kinds)`)。
拿 `Pipeline.nextForEp` 给的 `run` 真按下去,数引擎实收的镜与用户读到的提示。四种形状逐字读数:

```
【全集三镜都是过期终稿】locked × 3            ← 本槽产品面问的就是这一档
episodeState          = { status:'stale', action:'regen-stale' }
counts                = { total:3, done:3, stale:3, final:3 }
按钮渲染              = true(带 run)
按钮 txt              = '🔄 重生成过期镜(全部已定稿,批量重生成不覆盖定稿产物,一镜也重跑不到,需先解锁终稿)'
staleShotSplit        = { all:[sh0,sh1,sh2], rerun:[], locked:[sh0,sh1,sh2] }
下发 shotIds          = [sh0, sh1, sh2]
引擎实收              = []                    ← 文案说跑不到,就是真跑不到
回执                  = ok, total:0, note:'点名的 3 镜一镜也没跑:3 镜已定稿(…需先解锁终稿)'
toasts                = [ 上面那句 note ]      ← 点完读得到"为什么一镜没跑"
charges               = []                    ← 一分钱不扣
跑后 counts.stale     = 3(门槛照旧 fail)
定稿镜产物 inputHash  = 原样(一个字节没被覆盖)

【单镜:唯一那镜就是过期终稿】locked × 1
读数与上一档同形(按钮照显、实收 0、note 报 1 镜、零扣费、counts.stale 仍 1)

【混堆】stale + locked
按钮 txt              = '🔄 重生成过期镜(可重跑 1 镜;另 1 镜已定稿,…需先解锁终稿)'
下发 shotIds          = [sh0, sh1]   引擎实收 = [sh0]    ← 印 1 跑 1
跑后 counts.stale     = 1(只消掉可重跑那一镜)

【没有定稿过期镜】stale × 2
按钮 txt              = '🔄 重生成过期镜(2)'   引擎实收 = [sh0, sh1]   ← 印 2 跑 2
```

渲染与派发那一侧同轮现取 `js/storyboard.js`:「下一步」按钮是**无条件**渲染的一行
(`<button class="btn sm primary" data-x="nextstep" …>${nx.txt}</button>`,整行没有任何条件包裹),
click 分支末尾 `else if (nx.run) nx.run(main);` 把带执行动作的下一步原样派下去,不在页面侧另判档位。

## 2. 逐条回答交接单的两问

### 2.1 全镜 `final && stale` 时按钮是否渲染、文案是什么、点下去 dispatch 哪些镜

渲染:**是**,且带 `run` 可点。文案:**印的不是 3,而是「一镜也重跑不到,需先解锁终稿」**——
`Domain.staleSplitNote(rerun=0, locked=3)` 在 `rerun = 0` 那一档换了说法,按钮直接接过来用。
dispatch:`shotIds = staleShotSplit.all`(过期镜全集,含定稿的那几镜),命令层按 `!s.final` 挡下,
引擎实收 0 镜。**三处数字互相对得上**:按钮承诺 0(说"一镜也重跑不到")= 引擎实收 0;
下发全集 3 与 `counts.stale` 的 3 同源(同一份 `shotVideoStale` 判旧);扣费 0。

W186 的按钮文案纪律(印的是"这一按真会落到引擎上的镜数",不是过期镜总数)在这一档也成立:
它没有印「可重跑 0 镜」,也没有把 3 印成"能跑 3 镜"。

### 2.2 产品意图:过期终稿允许一键重跑,是功能还是漏藏

**都不是**。现取三处判据后的口径是:**终稿产物不许被批量重生成覆盖,出路是用户自己先解锁终稿**。

- W176 开的那道口是「显式 `shotIds` 穿过 **stale done**」——过期镜是 `done` 镜,不开这口它一镜也跑不到;
  但同一行里 `!s.final` 一字未动(`js/commands.js`:`pend = (ep.shots||[]).filter(s => !s.final && ids.has(s.id) && …)`),
  终稿锁**不在**这道口的放行范围内。
- 于是"过期终稿一键重跑"从来就不成立,按钮也从没承诺过它:全终稿档的文案说的正是"一镜也重跑不到"。
- 按钮照旧挂着**不是漏藏,是刻意**:发布门 G4 在这一档照旧 fail,而"门禁为什么还 fail、出路是先解锁终稿"
  这句话在分集工作区**只挂在这颗按钮的文案上**。藏掉按钮=把唯一的说明也一并藏掉,用户只剩一个红门禁没有出路。

下发子集也不该收窄成 `rerun`:全终稿档它就是空数组,而空数组在两端子集位上等于"整集重跑"
(`Array.isArray(args.shotIds) && args.shotIds.length` 这个写法本身就是这条口径),
收窄一下反而把"一镜也不跑"变成"整集重跑"。这条 W186 已在源级钉着(`shotIds: sp.all`)。

## 3. 停工判定

交接单的停工条件是「按钮显示 + 文案已说明 rerun、dispatch 与计数一致」。三项逐条现跑对完:

| 停工条件 | 现跑读数 | 成立 |
|---|---|---|
| 按钮仍显示 | `status='stale'`、`action='regen-stale'`,`storyboard.js` 无条件渲染并带 `run` | 是 |
| 文案已说明 rerun | 全终稿档「一镜也重跑不到,需先解锁终稿」;混堆档「可重跑 1 镜;另 1 镜已定稿…」;无终稿档「(2)」 | 是 |
| dispatch 与计数一致 | 下发 = 分堆 `all` = `counts.stale` 那几镜;引擎实收 = 文案承诺的数(0 / 1 / 2);扣费 = 实收 | 是 |

**故不藏按钮,产品代码零 diff**。「有人会把按钮还在当成 bug」这件事本槽的处置是**把现况钉住**,
让下一个人来藏按钮时当场红——见第 4 节的变异 1:此前这一改**全套零红**。

## 4. 加测(两条,产品零 diff)

| 套件 | 用例 | 钉的是 |
|---|---|---|
| `pipeline` | `nextForEp:整集全是过期终稿时按钮照旧挂着,文案与实收的 0 镜对得上(点完还给一句为什么没跑)` | 行为面:`3,3,3,3` 的计数前提 → 归档 `regen-stale` → 文案 → 下发 `all` → 实收 0 → 零扣费 → `ok(total:0)` → **点完恰一句回音且逐字等于回执 `note`** → 门槛没动 → 定稿产物没被覆盖 |
| `contract` | `断点条不藏按钮:工作区「下一步」无条件渲染 Pipeline 给的文案,带 run 的动作照旧派到 nx.run` | 源级:按钮那一行须无条件、须逐字印 `nx.txt`;click 段须派 `nx.run(main)` 且不得在页面侧另判档位 |

三点刻意:

- **夹具是"全集一镜不剩"**,而 W186 那两条 `locked` 档夹具里都还留着一镜鲜镜。
  差别不只是形状:全终稿时 `counts.stale === counts.total === counts.final`,
  "按钮会不会被别的档抢走 / 推荐动作会不会落空"这一问此前没有落点。
- **回音那两句断言不写死措辞**:只判 `__toasts.length === 1` 且逐字等于 `r.result.note`。
  那句话的分档与措辞是 `Domain.emptyBatchNote` 的地(在飞的几槽正在动它),本槽不去逐字钉它。
- **契约那条只判"不藏"与"派得出去",不判分档**:哪一档配哪个动作仍只在 `Pipeline.nextForEp` 一处,
  故反向断言 click 段里不得出现 `regen-stale` 字面。

## 5. 变异(六条,每条改完跑全套 `unit`,验完还原)

| # | 变异 | 结果 |
|---|---|---|
| 1 | **藏按钮**:全终稿档不渲染「下一步」 | 红 **1** —— 只有本槽那条 `contract`(此前这一改**零红**) |
| 2 | click 分支摘掉 `else if (nx.run) nx.run(main)` | 红 **2**(本槽那条 + 既有「regen-stale 有执行出口」) |
| 3 | 下发子集收窄成 `sp.rerun` | 红 **3**(本槽 `pipeline` 1 + W186 的行为面与取数口各 1) |
| 4 | `counts.stale` 不再数定稿的过期镜(**改门槛**) | 红 **13**(本槽 1 + `commands` 2 + `pipeline` 2 + `domain` 1 + `issues` 1 + `release` 5 + 取数口 1) |
| 5 | `Commands.digest` 不再播 `ok` 回执上的 `note` | 红 **5**(本槽 1 + `commands` 2 + `release` 2) |
| 6 | 命令层子集位不再放过期镜过(关掉 W176 那道口) | 红 **7**(`commands` 1 + `pipeline` 2 + `release` 3 + 取数口 1;本槽那条**不红**,它本来就实收 0) |

变异 1 是本槽存在的理由:藏按钮此前是**一条判据都没有**的静默改动。
变异 6 反过来说明本槽那条钉的是"这一档跑不到",不是"跑得到几镜"——那一面 W186 已有落点,不重复钉。
变异 2 与既有的指纹链那条有一处重叠,如实记:本槽那条另判"渲染那一行不带条件",那一面它没有。

## 6. 数字(live 现取,不抄旧数)

| 套件 | 基线 `5f76836` | 本槽 |
|---|---|---|
| `unit` | 639/639 | **641/641** |
| └ `pipeline` | 12 | **13** |
| └ `contract` | 138 | **139** |
| └ `domain` / `commands` / `release` / `issues` | 36 / 46 / 48 / 21 | 36 / 46 / 48 / 21(未动) |
| `integration` | 147/147 | **147/147** |
| `cli.smoke` | 107/109 | **107/109**(两项失败与基线同名同表现:`未登录 whoami → exit 3`、`llm --json mock 链路`) |

**产品代码零 diff**:`js/pipeline.js`、`js/storyboard.js`、`js/domain.js`、`js/commands.js`、`js/release.js`、
`js/release-core.js`、`js/issues.js`、`js/plans.js`、`js/skills.js`、`cli.js`、`server.js` 一字未改。
治理面零变动:`Skills.gaps()` 键数、注册表条数、短名单、`CHECKS`、`KB.SECTIONS`、领域命令数一个没动;
`GUARD_TOPICS` / 花名册 / `TOPIC_FLOOR` 一行没动(本槽的测试主题不需要 enroll)。

棘轮按 **live** 抬:`tests/unit.js` 单元 `FLOOR` 639 → **641**、记账件 `FLOOR` 231 → **232**;
`README.md` 的「单元测试(N 项断言」639 → 641、契约段自报条数 138 → 139;
本目录 `README.md` 明写份数 231 → **232**(含本份)。

## 7. 交接

1. **「全终稿档该不该回 `blocked` 而不是 `ok`」仍是没答的口径题**(W177 → W186 原样传下)。
   现况是 `ok(total:0)` + 一句 `note`,用户读得到原因;改成 `blocked` 会连带发布门 G4 的一键处置
   ——它今天正靠这条早退在"处置跑不到任何镜"时不报错。要动得两处一起看。
2. **"先解锁终稿"目前只有一句话,没有一个按得下去的入口**。用户读到出路后要自己回镜头卡上逐镜解锁。
   若日后要补,落点是这一格再挂一个导航/命令(解锁是用户授权动作,不该由处置代按),
   与本槽"不替用户撤销他按下的锁"的口径不冲突。
3. **`js/issues.js` 的 `stale-shots` 仍不挂 `cmd`**(W186 交接第 1 条原样成立):它报计数、走导航,
   用户导航到分集页读到的正是本槽钉住的这句真话。
4. **本槽那条契约用例点的是 `js/storyboard.js` 的两处字面**(按钮那一行、click 段的边界 `nsb.onclick`/`psb.onclick`)。
   工作区那段 HTML 若重排,同轮改这条的取数口——它两处都带了"取不到即红"的自检,不会静默退化成恒真。
