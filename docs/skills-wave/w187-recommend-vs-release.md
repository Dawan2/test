# W187 · 「下一步」不再指着与交付无关的上传剧本

**范围**:`js/domain.js`(`D.workflow` 挑推荐动作那一处,+17/-3)+ `tests/unit.js`(+3 条:`domain` 1、`plans` 1、`release` 1)
+ `README.md` 描述与数字同步 + 本份记账件与目录索引行。
**基线**:`cursor/w182-integration-646e`(`5f98d0b`)。
**不做**:不改 `D.gateBlockers` 的判据与码、不改 `D.projectScript`/`D.extractSourceText`、
不让 G1 去读整本原文、不把简介之类的东西写进 `p.script`、不动 `GUARD_TOPICS` / 花名册 / `TOPIC_FLOOR`、
不动 `js/pipeline.js` 的断点按钮、不动 G4 门槛与 `staleShotSplit`、不拆 `Skills.gaps()` 的键。

## 1. 停工位成立,而且比记账里记的形状更大

W180 的记账里留过这么一句停工位:走完全片但没有整本原文的项目,成片十门可以 `cond-pass`、
主线各步全 done,而 `Domain.workflow` 的 `recommendedAction` 仍是「上传剧本」。
本槽不抄那份文,在 W182 基线 `5f98d0b` 上现造夹具跑了一遍。

**夹具**:一集三镜,`ep.content` 有正文、三镜 `video.status='done'` 非模拟且已确认、
`lastReview.avg = 8.4` 且 rev/快照对齐、成片合成过且 `composedInputHash`/`composedDialogueSig` 对齐、
一位主体带权威图;项目对象上**没有** `p.script`、**也没有** `p.extractDone`。live 逐字如下:

```
episodeState.status         = done      reviewGate = pass   composedReady = true
主线七步                     ✗ script  ✓ subjects ✓ eps ✓ shots ✓ gen ✓ review ✓ film
recommendedAction           = { key:'script', label:'上传剧本', hash:'#/project/p1' }
ReleaseCore.gates(headless) = cond-pass (fails 0, warns 1 —— 只有 G10 账目)
Release.collect(浏览器十门)  = cond-pass (fails 0, warns 1)
Issues.collect              = 3 条,高/中危 0(no-script 低危 + 两条方法论提醒)
gateBlockers                = [{ step:'script', code:'no-script', label:'未上传剧本' }]
projectScript               = ''        extractSourceText 长度 = 100(退回各集正文)
```

**两边都不假**。交付门确实一门都不读 `p.script`(G1 逐集读 `ep.content`,这是 W180 那槽亲手钉过的),
主线剧本步也确实没过(整本原文确实不在库)。假的是「下一步」:它指着一件办不成任何交付的事。
记账里那句「七步主线全 done」要按 live 更正一格——**是六步 done、剧本那一步没 done**,
`recommendedAction` 正是因为它没 done 才落在上传剧本上(全 done 时那一支会回交付动作)。
结论不变,形状要写准。

**而实况比那句停工位记的更大**:剧本步没过就是恒没过,于是它**从建完分集起一路占着「下一步」**,
不是只在终点才出岔子。同一份夹具改两处:

```
差一集没合成        → recommendedAction = { key:'script', label:'上传剧本' }   （该说「合成成片:第1集」）
镜头一镜没出片      → recommendedAction = { key:'script', label:'上传剧本' }   （该说「继续生成:第1集」）
主体缺权威图        → recommendedAction = { key:'script', label:'上传剧本' }   （该说「主体提取与生成」）
```

而同一个项目上**计划层早就说的是另一句**:`Plans.fromWorkflow` 在差一集没合成时给出
「合成成片:第1集」,全走完时给出 `null`(无待推进事项)。两个面对着同一个项目说反话,
而说得对的那个面(计划层)反倒是没有出口的那个——「下一步」才是命令回执的 `next`、
CLI `workflow` 的 `recommendedAction` 与助手上下文里那句「项目级下一步建议」的来源。

## 2. 向导「仅进行分集」已经写 `p.script` 了,但这形状照样造得出来

交接单要求先核这一条(W180 说 W110 已让「仅进行分集」写回原文)。本尖属实:

```js
// js/proj-upload.js doSplitRun,拆集成功之后
if (scriptText && scriptText.trim() && p.script !== scriptText) { p.script = scriptText; Store.save(); }
```

所以从上传弹窗那条路进来的项目,拆集成功后剧本步就 done 了,造不出这形状。
但**建分集的入口不止那一条**,另外两条真实入口写的都只是各集正文,一个字都不碰 `p.script`:

| 入口 | 落点 | 写 `p.script` 吗 |
|---|---|---|
| 上传剧本弹窗「解析剧本」/「仅进行分集」 | `js/proj-upload.js` | 写(W110 之后两支都写) |
| **「新建分集」**(分集页虚线卡,用户逐集粘正文) | `js/episodes.js` `openNewEpisode` → `p.episodes.push({ title, content, … })` | **不写** |
| **「拉片建集」**(参考视频 → 场景切段 → 逐段理解 → 分镜表) | `js/proj-upload.js` `openRip` → `p.episodes.push({ title, content, shots, … })` | **不写**(这条路上本来就没有整本原文可写) |

后两条不是边角:逐集粘正文是没有整本剧本的人最自然的用法,而拉片建集**按其定义**就没有整本原文
(输入是一段参考视频,`content` 是拉片出来的时间轴文字记录)。助手侧另有两处同形
(`js/agent-global.js` 的新建分集、`js/beatboard.js` 的节拍板建集)。

所以停工位**成立**:形状在真实路径上造得出来,而且这两条路上的项目**永远**跨不过剧本步——
它们从来不会有整本原文,「下一步」也就永远指着上传剧本。

## 3. 改了什么(一处)

`js/domain.js` 的 `D.workflow` 挑推荐动作那一处,判据多一个条件:

```js
const scriptIdle = !gates.some(g => g.code === GATE.subjects) && !gates.some(g => g.code === GATE.eps);
const cur = steps.find(s => !s.side && !s.done && !(s.key === 'script' && scriptIdle));
```

**为什么剧本步是唯一的例外**:主线七步里只有它的 `done` 说的是"输入在不在库"而不是"进度走没走到"。
而**读整本原文的只有两件事**——提取主体(`D.extractSourceText`)与剧本拆集(`D.projectScript`)。
这两件都还没办成时,补原文确实是当务之急,剧本步照旧占「下一步」;
两件都办成之后,补进整本推不动任何一步:分镜、出片、审片、成片,以及交付门那六项
(每集 done / 审片达标 / 过期·未确认·失败镜清零 / 主体图齐全)**没有一处读它**。

**判据为什么写成查两个门槛码,而不是查 `subjects.length && eps.length`**:
`gates` 就是本函数上面几行已经算好的 `D.gateBlockers(p)`,剧本/主体/分集三步的判据只在那一处。
就地数一遍主体与分集等于在第四处再写一份门槛拷贝(W46/W136 一路收的正是这个)。

**为什么不做成"后面的主线步全 done 时才让位"**:那只修终点这一格,
第 1 节量出来的中途三格(差合成 / 没出片 / 缺主体图)照旧指着上传剧本。
第 5 节的变异 3 就是这个写法,当场红两条。

**缺口没有被抹掉**:流程条的剧本步照旧画未完成、`blockers` 照旧是 `no-script`;
问题中心照旧报「未上传剧本」低危一条(判据、危险级与 G2 只数高/中危的口径全未动)。
变的只有「现在该做哪一件」这一句。

**两面从此不说反话**:计划层的提取/拆集两步(`js/plans.js` 的 `TODO_OF`)本来就是按
"主体库不空 / 分集已建即不出这一步"判的,本槽让「下一步」按同一条判。

## 4. 改完之后各格的 live 取值

| 项目形状 | 改前 | 改后 |
|---|---|---|
| 没有整本原文,全片走完(十门 `cond-pass`) | 上传剧本 | **量产跑批 / 导出交付** |
| 没有整本原文,差一集没合成 | 上传剧本 | **合成成片:第1集** |
| 没有整本原文,镜头没出片 | 上传剧本 | **继续生成:第1集** |
| 没有整本原文,主体缺权威图 | 上传剧本 | **主体提取与生成(1 角色缺图)**(G9 真挡交付) |
| 没有整本原文,主体库还空 | 上传剧本 | 上传剧本(提取主体要读它) |
| 没有整本原文,分集还没建 | 上传剧本 | 上传剧本(拆集切的就是它) |
| 空项目 | 上传剧本 | 上传剧本 |
| 有整本原文的项目(各形状) | 不变 | 不变 |

十门那一侧一个数没动:同一个项目 `fails = 0`、`warns = 1`、`overall = cond-pass`、
`g1-workflow = pass`、`g2-issues = pass`,改前改后逐字相等。

## 5. 加测与变异

三条新用例,分工不合并——一条钉派生本身的两个方向,一条钉两个面不说反话,一条把停工位的两半钉在一起:

| 套件 | 用例 | 钉的是 |
|---|---|---|
| `domain` | `workflow:整本原文缺口只在下游还要读它时才占"下一步"(走完全片的项目不再被支去上传剧本)` | 第 4 节那张表逐格:让位三格(交付/合成/继续生成)+ 不让位四格(缺图/主体库空/分集未建/空项目)+ 剧本步仍未完成且 `blockers` 仍是 `no-script` + 有整本原文的项目一字未变 |
| `plans` | `fromWorkflow 与"下一步"不许对同一项目说反话(整本原文不在库时两面同指主线真正未完成那一步)` | 跨面:差合成时两面都说「合成成片:第一集」、全走完时计划层 `null` 而下一步说交付、主体库还空时两面同样一致 |
| `release` | `走完全片但没有整本原文:十门 cond-pass 的同一项目上,"下一步"落到交付而不是上传剧本` | 停工位两半同在一个项目上:`overall = cond-pass`、`fails = 0`、`g1-workflow = pass`,而下一步 `key = produce`;缺口仍由流程条剧本步与问题中心低危 `no-script` 报,G2 结论不变 |

三条变异,每条改完跑三个子套件、验完还原;本槽改动落地后一条都不红。

| # | 变异 | 结果 |
|---|---|---|
| 1 | 退回基线写法(`steps.find(s => !s.side && !s.done)`,剧本步恒占下一步) | 红 **3**(`domain` 报「期望 produce 实际 script」、`plans` 报「期望 合成成片:第一集 实际 上传剧本」、`release` 报「期望 produce 实际 script」) |
| 2 | `scriptIdle = true`(无条件让位,把门槛拆掉) | 红 **3**(含基线既有那条「空项目推荐动作=script」——它报「期望 script 实际 subjects」,即本条变异连既有断言一起打翻) |
| 3 | `scriptIdle = 只剩剧本这一步没完成`(位置启发式,只修终点那一格) | 红 **2**(两条都报中途态「期望 合成成片:第一集 实际 上传剧本」) |

变异 2 特意留意了一件事:**它红的三条里有一条是基线既有用例**,
说明"把门槛拆掉"这一路在本槽之前就有人守着,新用例接的是另外两路(该让位而不让、只让一半)。

## 6. 回归数字(live 现取,不抄旧数)

| 套件 | 基线 `5f98d0b` | 本槽 |
|---|---|---|
| `unit` | 561/561 | **564/564** |
| └ `domain` 子套件 | 31 | **32** |
| └ `plans` 子套件 | 13 | **14** |
| └ `release` 子套件 | 37 | **38** |
| └ `contract` 子套件 | 128 | 128(未动) |
| `integration` | 143/143 | **143/143**(未动,实跑复核过) |
| `cli.smoke` | 105/107 | **105/107**(未动;两条 FAIL 是环境性的既有项:`未登录 whoami → exit 3` 与 `llm --json mock 链路`) |

产品代码一个文件:`js/domain.js` +17/-3(判据一行 + 十二行旁注)。
`js/plans.js`、`js/pipeline.js`、`js/issues.js`、`js/release.js`、`js/release-core.js`、
`js/commands.js`、`js/wf-core.js`、`cli.js`、`server.js`、`mcp.js` 一字未改。

治理面零变动:`Skills.gaps()` 键数、注册表条数、短名单、`CHECKS`、`preflightStages()`、
`KB.SECTIONS`、`playbooks()`、领域命令数、`GUARD_TOPICS` 与花名册,一个数没动;
门槛面同样零变动(`gateBlockers` 的码与文案、G1–G10 判据与计数、`REVIEW_MIN`、G4 分堆)。

棘轮按 **live** 抬:`tests/unit.js` 单元 `FLOOR` 561 → **564**、记账件 `FLOOR` 195 → **196**;
`README.md` 的「单元测试(N 项断言」561 → 564;`docs/skills-wave/README.md` 明写份数 195 → **196**(含本份)。

## 7. 交接

1. **这次让位只覆盖剧本步,理由写死在判据里,别顺手推广**。主体步同样可能"只差它一个"
   (主体库有人但缺权威图),而那一项 G9 是 `fail`、真挡交付,故它不许让位——
   第 5 节的变异 2 与用例里那两句缺图断言就是路标。要动之前先答:这一步没过,交付门哪一项会 `fail`?
   答得出来的就不许让位。
2. **`Pipeline.nextForProject` 现在没有浏览器调用方**(全仓只剩 `js/pipeline.js` 自己与单测引用它)。
   它是项目详情页「下一步」按钮的取值口,某一轮页面重构之后就没人调了,
   于是**浏览器上这条推荐动作实际只经命令回执的 `next` 与助手上下文那句话出面**。
   本槽没接线(接线是 UI 的活,不在「推荐下一步 / 计划导航诚实」这个口径里),如实登记:
   要让项目页重新显示「下一步」,取值口现成、`digestNote` 尾注也现成,接上即可。
3. **同形状的另一处仍开着**:`js/plans.js` 的 `TODO_OF['project.extractSubjects']` 在 `no-script` 在场时
   一律回 `null`,而 `D.extractSourceText` 在有分集正文时其实读得到文本——
   即"有分集、主体库还空、没有整本原文"的项目上,提取主体这一步其实跑得动而计划层不出它。
   本槽有意维持原样:让「下一步」与计划层在这一格上**同口径**(两面都认补原文是这一步的前置),
   要改得两面同轮改,别只动一面——那正是本槽在收的病。
4. **`p.script` 恒空的那两条建集入口(手工建集 / 拉片建集)本身没动**。
   要不要在这两条路上把各集正文回填成整本原文,是产品口径题(回填等于凭空造一份"原文",
   而拆集读它会把已经建好的分集重切一遍),本槽只让「下一步」不再拿它当挡路的事,不替它做决定。
