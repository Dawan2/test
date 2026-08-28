# W224 · 成功 `ok` 时的 `result.note` 从哪来:live 举证出一处真漏(智能审片空审档),最小修一处漏斗

**基线**:`cursor/w220-integration-3c7a`(`16baeb9`)。在飞的 W219 / W221 / W222 / W223 按任务口径**一条没碰**。
**范围**:产品面两个文件、两处判据——`js/produce.js`(+5 −2:引擎把自己数的可审镜数随回执报出)、
`js/commands.js`(+13 −2:`episode.smartReview` 的成功回执在可审镜为 0 时补一句 `note`);
`tests/unit.js`(+2 条 `produce` 用例、桩回执补一位、两处 `FLOOR`)、`README.md` 与本目录 `README.md` 数字同步。
**不做**:不碰 `js/plans.js`、`js/pipeline.js`、`js/storyboard.js`、`js/sb-views.js`、`js/sb-io.js`、`js/issues*.js`、
`js/release*.js`、`cli.js`、`server.js`、`mcp.js`;不动 `Commands.digest` 一个字;
不动 `Domain.emptyBatchNote` / `emptySubjectImageNote` 与它们的四堆分档;不开第三份 `Domain` note 帮手;
不拆 `Skills.gaps()` 键;不登记 `GUARD_TOPICS`;不把 `!s.final` 塞进 stale 判据。

## 1. 交接问的三件事,逐条 live 现跑(不是读源码猜)

沙箱按 `index.html` 顺序加载**真实产品码**:`js/domain.js` + 真 `js/produce.js`(`autoSmartReview` 本体)
+ `js/cmd-registry.js` + `js/commands.js`,另按需加载真 `js/release-core.js` / `js/release.js`(发布门那一路)
与真 `js/pipeline.js`(流程条那一路)。换掉的只有生成/审片/合成三个引擎与 `U.toast`/`U.bgDock`(一律记数)。
**判空跑一律看引擎实收数**(`reviewShot` / `batchGenVideos` / `composeVideo` 真被叫到几次),不看回执上的数字。

### 1.1 第一问:哪些成功路径写 `result.note`,哪些只靠派生帮手

十五档一次跑完(`ui:true`,与页面按钮同参),`引擎实收` 为 0 的那几行才是这道题的战场:

| 成功档 | `result.note` | 引擎实收 | `digest` 播 |
|---|---|---|---|
| 智能分镜(真跑) | 无 | 1 `runSmartSB` | 0 |
| 批量生成(真跑) | 无 | 1 `batchGenVideos` | 0 |
| **批量生成(0 镜·整集)** | 「本集没有待生成的镜头,一镜也没跑:2 镜已出片」 | **0** | **1** |
| **批量生成(0 镜·点名不在本集)** | 「点名的 1 镜一镜也没跑:1 镜不在本集」 | **0** | **1** |
| 单镜生成(真跑) | 无 | 1 `createShotVideo` | 0 |
| 智能审片(真跑) | 无 | 2 `reviewShot`(另开 1 个后台面板) | 0 |
| **智能审片(0 镜可审·未出片)** | **无** | **0**(面板 0 个) | **0** |
| **智能审片(0 镜可审·全定稿)** | **无** | **0**(面板 0 个) | **0** |
| 合成成片(真跑·force) | 无 | 1 `composeVideo` | 0 |
| 合成成片(已是最新·无 force) | 无(有结构位 `fresh:true`) | **0** | 0 |
| 主体生图(真跑) | 无 | 1 `genSubjectImage` | 0 |
| **主体生图(0 位·全有图)** | 「没有待补图的主体,一位也没跑:1 位已有参考图」 | **0** | **1** |
| **主体生图(0 位·点名不在库)** | 「点名的 1 位主体一位也没跑:1 位不在主体库」 | **0** | **1** |
| 本集理解(真跑) | 无 | 1 `undRegen` | 0 |
| 一键成片(编排) | 无 | 3(审片 2 + 合成 1) | 0 |

**答案**:写 `result.note` 的生产者至今仍是**两个**(`episode.generateVideos`、`subject.generateImage`),
两者都不就地拼句、各读一份 `Domain` 派生帮手(`emptyBatchNote` / `emptySubjectImageNote`)。
其余成功档一个都不写 note——它们靠引擎自己说话(逐条 toast / 后台面板 / 弹窗),这正是 `digest` 成功档默认静默的前提。

### 1.2 第二问:`digest` 是不是无条件 toast `note`

是。判据就是 `r.ok` 且 `r.result && r.result.note` 为真值,**不看 `total`、不看 `status`、不看引擎跑没跑**:
上表里凡带 note 的四档 `digest` 各播一句(`info`,4200ms),不带的一句不播。
`opts.okToast` 只在**没有 note** 时才轮得到。

**它确实会吞一种 note:嵌套的那种。** 一键成片(`episode.produce`)把子步回执整个塞进 `result.steps`,
子步 `generateVideos` 的 note 原样在里面躺着,而 `digest` 只读顶层 `result.note`——现跑:
子步 note =「本集没有待生成的镜头,一镜也没跑:2 镜已出片」,`digest` 播 **0** 句。
本槽**判定这一格不是漏**:编排整体真跑了(引擎实收 3),`oneClickProduce` 自己收尾时会 toast
「一键成片完成」/「一键成片中断:…」,子步那句是过程账不是结论账;要冒泡得先定"编排回执上该说哪几句"的产品口径,
不是一句 note 的事。**记账,不动手。**

### 1.3 第三问:有没有「ok 但 note 空/错源」的真漏 —— **有一处**

**错源那一半:没有。** 全仓能进 `result.note` 的赋值点只有上面两处;
`project.release` 的 `args.note` 是用户写的发布说明,`ReleaseCore.brief(gate)` 与 `stamp` 的回执里都不带它,
`episode.preflight` 的 `result` 是 `Domain.episodeState` 的展开(该派生零 `note` 字段),
`episode.smartReview` 的 `ok(r)` 里 `r` 是 `autoSmartReview` 的 `{pass, retry, manual}`——一处都不会把别的东西冒充成 note。

**空那一半:`episode.smartReview` 的「一镜也没审」档是真漏。** 拿 W207 交接留的那把尺子逐格量:

| W207 三格 | 智能审片空审档实测 |
|---|---|
| ① 这一档回执是不是 `ok` | 是:`{ok:true, status:'done', result:{pass:0,retry:0,manual:0}, cost:0}` |
| ② 引擎实收是不是真的 0 | 是:`reviewShot` **0** 次(对照面真审那档是 1 次) |
| ③ 拦截点自己会不会说话 | **不会**:toast **0** 条、后台面板 **0** 个(对照面真审那档开 1 个面板) |

三格全中,与镜头/主体那两侧是**同一个病**:引擎一次都没起来,于是没有引擎提示可依赖,而 `digest` 对成功档默认静默。
成因在 `autoSmartReview` 的第一行——`targets` 为空即原地返回,后台面板是**下一行**才建的,
`quiet` 那条完成 toast 更在函数尾部,两条都够不着。

**两个用户可见入口各真按了一遍(不是推断"理论可达"):**

```
发布门 G3「未审」的一键处置(js/release.js execFix,ui:true 且不带 force)
  G3      = fail「未审:第一集」 fix = { type:'command', cmd:'episode.smartReview', epid:'ep1' }
  按下去  引擎实收 0 · 后台面板 0 · 新增 toast []  · 门禁再收一次 G3 仍 fail
  对照面(该集有出片镜时按同一颗按钮):引擎实收 1 · 后台面板 1
流程条「下一步」(js/pipeline.js nextForEp → js/storyboard.js 那一行 Commands.execute)
  ② 两镜已出片且全部定稿      → 按钮印「🧐 整集审片」    按下去 引擎实收 0 · 面板 0 · toast []
  ④ 定稿 + 审片记录判旧(改过剧本)→ 按钮印「🧐 重新审片(记录已过期)」按下去 引擎实收 0 · 面板 0 · toast []
  ① 两镜已出片未定稿(对照面)  → 按钮印「🧐 整集审片」    按下去 引擎实收 2 · 面板 1
```

第 ④ 格最难看:记录判旧 → 按钮喊你重新审片 → 按下去什么也没发生 → 记录照旧判旧 → 下次进来还是这句话。

**而 headless 那一端同一档根本不是这么判的。** `cli.js` 的 `EXEC['episode.smartReview']` 走
`POST /api/wf/smart-review`,服务端对可审镜为 0 当场 **400 点名回绝**,两句话分档写着:
子集档「指定镜头均不可审(需已出片且非终稿)」、整集档「没有可审片的已出片镜头(需先生成视频)」
(`tests/integration.js` 里「无可审镜 → 400」那条一直绿着)。
**同一件事,服务端说得清清楚楚,浏览器一声不吭。** 停工条件不成立。

### 1.4 顺手核过的另一格:合成「已是最新」档为什么不算漏

它的①②两格同样成立(`ok` + `fresh:true`、引擎实收 0、零扣费),但第三格不成立、且**没有用户可见入口**:
六个点名入口(工作区顶栏 / 流程条上下步 / 剪辑台 / 预览窗 / 问题中心)按 W210 一律带 `force`,
发布门十门里没有挂 `episode.compose` 的 fix(G3 挂审片、G4/G6 挂批量生成、G9 挂主体生图),
问题中心那条按 `FORCE_FIX` 逐条登记带 `force`。剩下的三条自动路(一键成片第 4 步、计划步、导演助手)
本就是 W210 那道闸的服务对象,且计划步尾注已明写「已是最新,未重跑」。
**产品意图明确,记账不动手**——这与 W207 当年判它"不需要"的理由已经不同(那时这一档还不存在),故此处重新量过一遍。

## 2. 改法:一处漏斗,一句话,零新派生

```js
// js/produce.js —— 引擎报出自己数的那一份可审镜数
if (!targets.length) return { pass: 0, retry: 0, manual: 0, targets: 0 };
…
return { pass: passCnt, retry: retryCnt, manual: manualCnt, targets: targets.length };

// js/commands.js —— episode.smartReview 的成功回执据此说清"为什么是 0 镜"
if (r && !r.targets) {
  out.result.note = picked
    ? '点名的 ' + picked.length + ' 镜一镜也没审:可审的镜需已出片、非终稿且在本集'
    : '本集没有可审的镜头,一镜也没审:可审的镜需已出片、非终稿';
}
```

**为什么不开第三份 `Domain` 帮手**:那两份帮手进 `Domain` 的理由是**两端共读一句话**
(浏览器命令层与 `cli.js` 的同名 `EXEC` 各自组装同形回执,不归口就会长出两种说法)。
审片这一侧两端**回执形态本就不同**:浏览器回 `{pass, retry, manual}`,
CLI 那一端是服务端 `{avg, reviewed, failed, lowShots}` 且空审档压根走不到成功分支(400 就地回绝)。
把这句话搬进 `Domain` 只会造出一份**只有一个消费方**的派生,还得替它编一套用不上的分堆——
那正是 W207 明令不做的第三份。故这句话只在命令层一处,记在这里备查。

**为什么不改分档(不做成 `blocked`)**:与服务端 400 对齐固然更同形,但 `ok → blocked` 会穿透到
`js/plans.js` 的 `execStep`(那一步从 `done` 变 `failed`、`runAll` 就地停)与 `episode.produce` 的步骤账,
而这两个文件本槽都不许碰,更不该由一句回执文案顺手改掉计划语义。
**空跑仍是 `ok`** 也与镜头/主体那两侧的既有纪律一致(全定稿的集点「整集审片」不该报拦截)。

**为什么判 0 取 `r.targets` 而不是 `pass + retry + manual === 0`**:那三个数全 0 有**两种**成因——
可审镜本来就是 0,以及**用户在后台面板上按 ✕ 当场中止**(`dock.cancelled` 在第一镜之前就为真)。
拿三个数猜的话,后者会被回执报成「本集没有可审的镜头」,那是假话:镜就在那儿,是人喊的停。
故让引擎把自己数出来的那一份随回执报出,命令层只认这一位,**不在命令层另写一遍"可审镜"筛法**
(第三份筛法与第三份 note 是同一个病的两种写法)。

**点名清单按镜去重**(`[...new Set(args.shotIds)]`):与镜头侧 W216 那条同形——重复 id 指的是同一镜,
不该被数成两镜。选人闸判据(`Array.isArray && length`)一个字没动,过滤结果逐字节不变(去重不改 `includes` 的结论)。

## 3. 加测两条(`produce` 套件,真引擎 + 真命令层)

| 用例 | 钉什么 |
|---|---|
| `episode.smartReview:一镜也没审时回执得说清原因` | 三档各跑一遍(整集未出片 / 全集定稿 / 点名的镜不在本集)——回执仍 `ok`、引擎实收 0、面板 0、note 说得出「一镜也没审」、`digest` 恰播 1 句;点名档按**去重后**的点名数报且**不许**说「本集没有可审的镜头」(本集明明有可审的镜);对照面真审一趟:引擎实收 1、面板 1、note 恒空、`digest` 播 0 句 |
| `episode.smartReview:用户中止审片不许冒充「没有可审的镜头」` | 开场即 `dock.cancelled`:三个计数与空审档一模一样(全 0)、`targets` 仍是 2、note 恒空、`digest` 不播 |

`loadCommands` 那个 `autoSmartReview` 桩同轮跟着真引擎的回执形状补上 `targets`(按收到的镜数报,
夹具点名的 `__reviewR` 可覆盖):桩不许替产品报出"可审镜为 0",否则真审过的回执会凭空多出一句话。

**反事实**:把本槽的 `tests/unit.js` 原样喂给基线 `16baeb9` 的产品码 → `produce` **红 2**
(「回执得说清为什么是 0 镜,实际:undefined」+「可审镜数是 2 …实际:undefined」),
而基线自己是 **643/643 全绿**——这两条判据在基线上一条都接不住,正是它被记成 W212/W207 残留的原因。

## 4. 变异抽查

合完的产品码上现跑,每手先确认变异真落在被测段上(`git diff --stat` 有 diff),读完红数即 `git checkout` 还原。

| # | 变异 | 红 | 报在哪 |
|---|---|---|---|
| M1 | 摘掉命令层那一段 note(退回基线的静默 `ok`) | **1** | 「回执得说清为什么是 0 镜,实际:undefined」 |
| M2 | 判据改用 `pass + retry + manual` 猜 | **1** | 中止那条:「回执不许替用户编一个理由」,并把编出来的那句原样印出 |
| M3 | 引擎两处 `return` 都不报 `targets` | **2** | 真跑档多说一句 + 中止档 `targets` 读出 `undefined` |
| M3b | 只摘真跑那一处的 `targets`(空档那处照留) | **2** | 同上两句 |
| M4 | 点名清单不去重(拿 `args.shotIds.length` 报数) | **1** | 「点名的 **2** 镜」(实际点名的是同一镜两次) |
| M5 | 两档合成一句(点名档也说「本集没有可审的镜头」) | **1** | 点名档那句读出整集档的话 |
| M6 | note 恒有(真审过的回执也多说一句) | **2** | 真跑档多说一句 + 中止档被编了个理由 |

M1 与 M6 是这道闸的**宽窄两向**:前者是"闸没装、该说的不说",后者是"闸装得太宽、不该说的也说",
两手报在不同断言上,不是靠一条断言两头蒙对。
M2 与 M3/M3b 是**同一件事的两条来路**:判据自己改用三个计数去猜,与引擎不再报那一位、
逼得判据只能落回猜——两者都会让"用户中止"被说成"没有可审的镜头",故各留一手。
M3b 与 M3 读数相同不是重复:它证明**真跑那一处**的 `targets` 同样是活判据(只留空档那处就够的话,
`!r.targets` 会在每次真审后照样成立),摘掉它当场红在"真审过的回执不许带这句话"上。

## 5. live 数字(全部现跑)

| 套件 | 基线 `16baeb9` | 本槽 |
|---|---|---|
| `unit` | 643/643 | **645/645** |
| └ `produce` 子套件 | 17 | **19** |
| └ `contract` 子套件 | 139 | **139**(未加契约用例) |
| `integration` | 147/147 | **147/147** |
| `cli.smoke` | 107/109 | **107/109** |
| `GUARD_TOPICS` / `TOPIC_FLOOR` | 19 / 19 | **19 / 19**(本槽未登记新主题) |
| `gaps()` 键数 | 20 | **20**(一个键没拆) |
| 记账件份数 | 234 | **235**(含本文) |

`cli.smoke` 两条失败(`未登录 whoami → exit 3`、`llm --json mock 链路`)与基线同名同表现,
是与 `master` 同源的既有失败,不由本槽引入;分母按 live 点数得 **109**。
棘轮按 live 抬:`tests/unit.js` 单元 `FLOOR` 643 → **645**、记账件 `FLOOR` 234 → **235**;
`README.md` 的「单元测试(N 项断言」643 → 645;本目录 `README.md` 明写份数 234 → **235**(含本文)。
`integration` / `cli.smoke` 两格 `FLOOR` 按 live 就位、未动。

产品面相对基线只有两个文件:`js/produce.js`(+5 −2)、`js/commands.js`(+13 −2)。
`js/domain.js` / `js/plans.js` / `js/pipeline.js` / `js/issues.js` / `js/issues-ui.js` / `js/release.js` /
`js/release-core.js` / `js/storyboard.js` / `js/sb-views.js` / `js/sb-io.js` / `js/skills.js` /
`js/cmd-registry.js` / `cli.js` / `server.js` / `mcp.js` **逐个零 diff**——
故两份既有 note 帮手、四堆分档、`Commands.digest` 本体、`ok`/`blocked` 分档、G1–G10 判据、
`Domain.epComposedReady` 那道闸与它的 `force` 授权位一个字没动。

## 6. 交接

1. **`result.note` 现在是三个生产者**:`episode.generateVideos`、`subject.generateImage`(各读一份 `Domain` 派生)
   与 `episode.smartReview`(命令层一句,理由见第 2 节)。**再来第四个候选之前先按 W207 那三格量一遍**:
   这一档回执是不是 `ok`、引擎实收是不是真的 0、拦截点自己会不会说话;三格里只要有一格不成立,就不是同一个病。
   本槽另加一条:量完还要看**这一句该住在哪**——两端共读才进 `Domain`,只有一个消费方就留在命令层,
   两条路都不许就地再拼第二句同义的话。
2. **两端在空审这一档的分档仍然相反**:浏览器 `ok` + note、服务端 400。本槽有意没统一(理由见第 2 节:
   改分档会穿透 `js/plans.js` 与 `episode.produce` 的步骤账,那是产品口径题不是回执文案题)。
   哪天要统一,先定"计划步遇到'这一步当下无事可做'该记 `done` 还是 `blocked`"——
   今天它记 `done` 且尾注为空,那是同一个病在计划层的第三张面孔(本槽按任务口径没碰 `js/plans.js`)。
3. **编排回执吞掉子步 note 这件事仍在**(第 1.2 节的读数:子步有话、顶层播 0 句)。
   `episode.produce` 今天只在顶层 `ok({steps, url})`,子步那几句要不要冒泡、冒泡几句、
   与 `oneClickProduce` 自己的收尾 toast 怎么排,是编排层的产品口径,不是一句 note 的事。
4. **`autoSmartReview` 的可审镜筛法与服务端那一份仍是两处**(浏览器 `!s.final && Store.shotVideoReady(s)`,
   服务端另加 `非在飞`)。本槽只让浏览器这一端把自己数出来的数报进回执,**没有**去归口两端筛法——
   归口要连着 `/api/wf/smart-review` 的目标口径与计费一起动,超出本槽射程。
   在飞镜那一格的差别今天不影响本槽结论(在飞镜两端都不审),但两端要是各自漂了,这里没有判据会红。
5. **中止那一档回执上仍看不出"是人喊的停"**:`{pass:0, retry:0, manual:0, targets:2}` 与
   "审了 2 镜全部失败"在结构上分得开(后者 `manual` 会计数),但与"面板刚开就被关"分不开。
   本槽只保证它**不被编造成**"没有可审的镜头";要真报出"用户已中止",得让引擎把 `cancelled` 也带进回执。
