# W186 · 断点条「重生成过期镜(N)」印的是真下发引擎的镜数

**范围**:`js/pipeline.js`(`nextForEp` 的 `regen-stale` 那一格,唯一一处产品代码)
+ `tests/unit.js`(+4 条:`pipeline` 3、`contract` 1,另加一个沙箱与一份夹具)
+ `README.md` 与本目录 `README.md` 的数字与描述同步。
**基线**:`cursor/w182-integration-646e`(`5f98d0b`,已含 W177 的 `Domain.staleShotSplit`/`staleSplitNote`)。
**不做**:不改门槛(`counts.stale` 仍数定稿的过期镜、G4 照旧 fail)、不摘全定稿档的处置按钮、
不自动解锁终稿、不在 pipeline 里另写一份「什么叫过期」、不动 `js/issues.js`、不动 `Skills.gaps()`、
不动 `GUARD_TOPICS` / 花名册 / `TOPIC_FLOOR`。

## 1. 停工位不成立:按钮的 N 与实收确实对不上,且它比回执更能骗人

交接单给的停工条件是「若基线按钮 N 已等于实收下发数、文案不骗人,停工」。
在基线 `5f98d0b` 上用一次性探针跑了一遍——沙箱按 `loadCommands` 那一摞装齐命令层与引擎桩,
再装 `js/pipeline.js`,拿 `Pipeline.nextForEp` 给出的 `run` 真按下去,数引擎实收的镜。
四种形状的读数逐字如下(`fresh` 鲜镜 / `stale` 过期没定稿 / `locked` 过期已定稿):

```
【一集里两种过期镜都有】fresh + stale + locked
counts.stale          = 2
staleShotSplit        = { all:[sh1,sh2], rerun:[sh1], locked:[sh2] }
按钮 txt              = '🔄 重生成过期镜(2)'
下发 shotIds          = [sh1, sh2]
引擎实收              = [sh1]                  ← 按钮写 2 镜,真跑 1 镜
定稿镜产物 inputHash  = 原样(一个字节没被覆盖)

【全是已定稿的过期镜】fresh + locked
counts.stale          = 1
staleShotSplit        = { all:[sh1], rerun:[], locked:[sh1] }
按钮 txt              = '🔄 重生成过期镜(1)'
按钮可点(带 run)     = true
引擎实收              = []                     ← 按下去一镜不跑
toasts                = []                     ← 而且一句提示都没有
charges               = []

【没有定稿过期镜】fresh + stale + stale
按钮 txt              = '🔄 重生成过期镜(2)'
引擎实收              = [sh1, sh2]             ← 这一档基线本来就对得上
```

三点结论:

1. **两种过期镜混在一集时,按钮上的 N 是 `counts.stale` 总数,实收是 `rerun` 那一堆**。
   与 W177 收掉的 G4 回执是同一形状:数字与实况分家。
2. **全是定稿过期镜时更糟**。按钮照旧可点,按下去命令层走的是 `pend.length === 0` 那条早退,
   回的是 `ok({ total: 0, … })`;而 `Commands.digest` 对 `r.ok` 默认不出提示(只有调用方传 `okToast` 才吐一句),
   pipeline 这一处没传。于是用户点完**连"什么都没发生"都读不到**——这正是交接单说的
   「举证用户会被骗去空跑」那一条,实测成立。
3. **`js/issues.js` 的 `stale-shots` 不是同一件事**。实测条目:
   `{ kind:'stale-shots', count:2, label:'「第一集」2 镜素材已更新(过期)', detail:'镜头 2、3 …建议重生成', goto:… }`,
   `'cmd' in it === false`。它报的是**计数**不是"这一按能跑几镜"的承诺,也没有按得下去的动作,
   故没有「按下去跑不动」那一面(与 W177 交接第 1 条的判断一致)。本槽有意不动它。

停工位不成立,本槽收的就是按钮这一面。

## 2. 改了什么(一处)

`js/pipeline.js` 的 `regen-stale` 那一格,从"直接印 `c.stale` + 就地 filter 出 shotIds"
换成"现取 Domain 的分堆,数字印可重跑那堆、说法取 Domain 那一句":

```js
const sp = Domain.staleShotSplit(p, ep, _online());
const note = Domain.staleSplitNote(sp.rerun.length, sp.locked.length);
return {
  key: 'regen-stale', txt: `🔄 重生成过期镜${note || '(' + c.stale + ')'}`,
  run: main => Commands.execute('episode.generateVideos', {
    pid: p.id, epid: ep.id, main, ui: true, shotIds: sp.all,
  }).then(r => Commands.digest(r)),
};
```

改完的三档读数(同一份探针现跑):

| 形状 | 按钮文案 | 引擎实收 |
|---|---|---|
| `fresh + stale + locked` | `🔄 重生成过期镜(可重跑 1 镜;另 1 镜已定稿,批量重生成不覆盖定稿产物,需先解锁终稿)` | `[sh1]` |
| `fresh + locked` | `🔄 重生成过期镜(全部已定稿,批量重生成不覆盖定稿产物,一镜也重跑不到,需先解锁终稿)` | `[]` |
| `fresh + stale + stale` | `🔄 重生成过期镜(2)` | `[sh1, sh2]` |

四件事各有理由:

- **数字印可重跑数**。交接单把这个选择留成了口径题(「印可重跑数的话,与流程条上的 `c.stale` 又对不上了」)。
  按钮上的数字是**动作承诺**——它回答的是"这一按会跑几镜",而流程条与问题中心上的 `counts.stale` 回答的是
  "这一集有几镜过期",两问不同源不必同数;何况尾巴里两堆之和恰是那个总数,读者自己就能对上。
  总数在别处仍有三个出口(流程条断点、问题中心条目、发布门 G4 回执),一处没减。
- **说法一个字都不新写**。分报那句话 W177 已经收进 `Domain.staleSplitNote`,本槽原样接过来用:
  按钮与 G4 回执从此逐字同一句。在这里另拼一句短的,同一件事就会在两个界面上长成两种说法。
- **全定稿档不印「可重跑 0 镜」**。`staleSplitNote` 在 `rerun = 0` 时本来就换了一种说法
  (W177 的变异 4 钉着这一点),接过来即得,不必本层再判一次形状。
- **下发子集仍是 `sp.all`(全部过期镜)**。收窄成 `rerun` 有两处代价:与 G4 的 `fix.shotIds` 分家
  (W177 的变异 5 有意钉着"定稿镜不从子集里摘"),且全定稿那一档会收窄成**空数组**——
  而空数组在两端子集位上等于"整集重跑"(`Array.isArray(args.shotIds) && args.shotIds.length` 这个写法本身就是这条口径)。
  定稿镜留在子集里一分钱不多花:命令层按 `!s.final` 挡下它们,引擎根本收不到。

## 3. 有意不做的四件事

1. **没摘全定稿档的处置按钮,也没改成"自动解锁再重抽"**。摘按钮是少一个入口、自动解锁等于替用户
   撤销他按下的锁,两条都是产品口径题(W177 第 6 节第 2 条留下的那道题),本槽只把话说清楚。
   按钮现在**先告诉用户跑不到、出路是解锁终稿**,再由他决定点不点。
2. **没动 `counts.stale`**。定稿的过期镜确实与当前剧本不一致,G4 该 fail、流程条该报;
   把 `final` 从计数里摘掉是改门槛,第 5 节的变异 7 反向钉住(红 8 条)。
3. **没在 pipeline 里写第二份判旧**。基线那句 `(ep.shots || []).filter(s => Domain.shotVideoStale(…))`
   与 `staleShotSplit.all` 是同一批镜,换成后者是把"哪几镜算过期、哪几镜跑得到"整个收在一处。
4. **没动 `js/issues.js`**。理由见第 1 节第 3 点:它不挂 `cmd`、报的是计数不是下发承诺。
   用户从问题中心导航到分集页时,读到的正是本槽改过的这句真话。

## 4. 加测

四条新用例,分工不合并;另加一个沙箱与一份夹具:

| 套件 | 用例 | 钉的是 |
|---|---|---|
| `pipeline` | `nextForEp:「重生成过期镜」按钮上的数就是按下去真下发引擎的镜数(定稿过期镜不混进这个数)` | 主线:按钮印可重跑数 + 真按下去引擎实收 + 下发子集仍带定稿镜 + 定稿产物没被覆盖 |
| `pipeline` | `nextForEp:过期镜全是定稿镜时按钮如实说一镜也跑不到(不印「可重跑 0 镜」,处置也不顺手摘掉)` | 分报的**另一个方向**:`rerun = 0` 那一档,且处置照旧挂着、零扣费、门槛没动 |
| `pipeline` | `nextForEp:没有定稿过期镜时按钮文案一字未变(总数就是可重跑数,不凭空多一句尾巴)` | 反向:两堆不分家时文案逐字同基线 |
| `contract` | `过期镜分报的取数口(断点条):「重生成过期镜」那一格同读 Domain 的分堆与那句话,不自写第二份` | 源级:按段切片后须现取两个函数、段内不得出现 `.final` 与自拼文案、下发子集须仍是 `sp.all` |

- **新沙箱 `loadPipelineFix()`**:`loadCommands()` 那一摞(注册表 + `SBGen` 引擎桩)之上再装 `pipeline.js`,
  按钮上的数与引擎实收的镜只在这里对得上账(与 W176 的 `loadReleaseFix()` 同形,那一处对的是发布门)。
  另包一层 `Commands.execute` 把命令层实收的 `shotIds` 留档——"下发子集有没有被收窄"在引擎侧看不出来
  (全定稿档收窄成空数组时引擎照样一镜没收,行为面读数完全相同)。
- **夹具 `pipeStaleProject(kinds)`**:过期走 `video.inputHash` 与当前输入对不上这条分支(与 `Domain.shotVideoStale`
  同一条路,不另造判据),全镜 `done` 且已确认,好让 `episodeState` 落到 `regen-stale` 那一档。
- **期望值先与 Domain 对一次账**:三条行为面都先 `assertEq(episodeState().counts.stale, 期望)`,
  夹具日后被调、或 `counts.stale` 判据变了先红在那一句上,而不是让下面几句悄悄变成恒真。

## 5. 变异

八条,每条改完跑全套 `unit`、验完还原;本槽改动落地后这八处一条都不红。

| # | 变异 | 结果 |
|---|---|---|
| 1 | 按钮退回印 `counts.stale` 总数(分报之前那版) | 红 **2**(两条行为面) |
| 2 | 下发子集收窄成 `sp.rerun`(把定稿镜摘出去) | 红 **2**(主线那条的留档断言 + 取数口) |
| 3 | 分堆两个数传反(`rerun`/`locked` 对调) | 红 **2**(全定稿那条 + 两堆不分家那条) |
| 4 | 断点条自写一份分堆(不取 `Domain`,此刻两份等价) | 红 **1**(取数口——行为面全绿) |
| 5 | 按钮既印总数又挂尾巴(数字仍是总数) | 红 **2**(两条行为面:尾巴对了不算,印在最前的那个数才是承诺) |
| 6 | `staleSplitNote` 不分形状(`rerun = 0` 时照印「可重跑 0 镜」) | 红 **3**(本槽全定稿那条 + W177 的 `domain` 与 `release` 各一条) |
| 7 | `counts.stale` 不再数定稿的过期镜(**改门槛**) | 红 **8**(本槽 2 + `domain` 1 + `release` 4 + 取数口 1) |
| 8 | 命令层子集位不再放过期镜过(把 W176 那道口关掉) | 红 **6**(本槽 2 + `commands` 1 + `release` 2 + 取数口 1) |

第 4 条量的是"改动等价但单源破了"这一路——两份判据此刻算出同一批镜,只有源级那条报得出来
(与 W177 的变异 7 同形)。第 5 条是本槽特有的一条:分报的尾巴挂上了、而印在最前的数字仍是总数,
这时"有没有分报"这一问答对了、"按钮承诺跑几镜"仍答错,故行为面判的是**最前那个数**不是"含不含那句话"。
第 8 条说明本槽的行为面真穿到了引擎:上游那道口一关,按钮承诺的镜数当场兑不了现。

## 6. 回归数字(live 现取)

| 套件 | 基线 | 本槽 |
|---|---|---|
| `unit` | 561/561 | **565/565** |
| └ `pipeline` 子套件 | 9 | **12** |
| └ `contract` 子套件 | 128 | **129** |
| └ `domain` 子套件 | 31 | 31(未动) |
| └ `release` 子套件 | 37 | 37(未动) |
| `integration` | 143/143 | **143/143**(未动,实跑复核过) |
| `cli.smoke` | 105/107 | **105/107**(两项失败与基线同名同表现:`未登录 whoami → exit 3`、`llm --json mock 链路`) |

产品代码一个文件:`js/pipeline.js` +19/−8(那一格连注释)。
`js/domain.js`、`js/release.js`、`js/release-core.js`、`js/commands.js`、`cli.js`、`js/issues.js`、
`js/storyboard.js`、`js/skills.js` 一字未改。

治理面零变动:`Skills.gaps()` 键数、注册表条数、短名单、`CHECKS`、`preflightStages()`、`KB.SECTIONS`、
`playbooks()`、领域命令数,一个数没动;`GUARD_TOPICS` / 花名册 / `TOPIC_FLOOR` 一行没动。
门槛面同样零变动:`counts.stale` 的判据、G4 的分档与回执、`episodeState` 的状态机一字未改。

棘轮按 **live** 抬(不抄旧数):`tests/unit.js` 单元 `FLOOR` 561 → **565**、记账件 `FLOOR` 195 → **196**;
`README.md` 的「单元测试(N 项断言」561 → 565、契约段自报条数 128 → 129;
本目录 `README.md` 明写份数 195 → **196**(含本份)。

## 7. 交接

1. **同形状的第三处还在,本槽有意没碰**:`js/issues.js` 的 `stale-shots` 条目 `detail` 列出全部过期镜号、
   写着「建议重生成」,而其中定稿的那几镜批量重生成碰不到。它不挂 `cmd`(走导航),
   故不是"按下去跑不动"而只是"少了句提示";真要补,接 `Domain.staleShotSplit` 同样是一行,
   但要先想清楚问题中心的 `count` 是不是也要跟着分——那个数今天是 `counts.stale`,与发布门 G2 的高中危计数同源。
2. **「全是定稿镜时该不该继续挂处置」仍是没答的产品口径题**(W177 第 6 节第 2 条原样传下)。
   本槽只把按钮上的话改成真话:它现在**先说跑不到、再说出路是解锁终稿**,而按钮照旧可点、按下去仍是
   `ok(total:0)` 的静默空跑。要真收它有三条路:摘按钮、改挂"去解锁终稿"的导航目标、
   或让处置在全定稿档回 `blocked` 而不是 `ok`(第三条最小,但那是命令层回执语义,会连带 G4 的 `execFix`——
   G4 今天正靠这条早退在"处置跑不到任何镜"时不报错)。
3. **`Commands.digest` 对 `ok` 默认不出提示这件事本身值得再看一眼**。本槽绕开它(把话提前写在按钮上),
   没有动 digest:`okToast` 是调用方选项,在这里传 `true` 会在真跑成功时多一句「执行完成」,
   而空跑那一档吐的仍是同一句——反而更骗人。要收得先让命令层把"一镜也没跑"与"跑完了"分开报。
4. **`staleShotSplit` 现在有三个消费方**(浏览器 G4、headless G4、断点条),W177 交接第 3 条说的
   "哪天要把'这一镜该不该进这次批量'整个收进 `Domain`"仍然成立,而落点又多了一个:
   届时断点条这一格的 `sp.rerun`/`sp.all` 都不必再改,它已经只问 Domain 要答案了。
