# W78 · 节拍板拆解人设收进注册表独立键 `beat.system`(契约半不开放)+ 全仓内联人设持有者名单立断言

> 基线 `cursor/w72-integration-8d3f @ d2e7c43`(两条并行集成线收成一条之后的头部),落地分支 `cursor/w78-beatboard-prompt-ea0c`。
> 未合并 W69/W71/W73–W77。本槽收的是 `js/beatboard.js` 里那 **1 处**内联人设(节拍板 AI 拆解步),**只收这一处**,别的文件一处不动。
> 不改发布门(`js/release.js` 一行未碰)、不新增计费动作(该步仍是 `llm.smartSB`=1 次、失败回退本地并 `partialRefund` 的原口径)、未删测(新增 2 条用例,新立 1 条全仓名单断言)。

## 1. 现场:注册表里没有这个角色,这一处也就覆盖不到

节拍板(`js/beatboard.js`)的「✨ AI 拆解节拍板」把本集剧本拆到 5 段式黄金结构,它的 system 半是写死的:

```js
// 基线 js/beatboard.js:202(aiFillBeats 第一步,也是这条链路唯一的 LLM 步)
system: '你是短剧节拍拆解专家,精通 5 段式黄金结构(开篇钩子→矛盾建立→打压升级→反转蓄力→断集留客)。'
  + (window.KB ? KB.pick('六阶段结构', '打脸四步') : ''),
```

后果与 W40/W42/W45/W49/W51/W56 那几处同形:**方法论半在单源之内、人设半不在**。KB「六阶段结构」「打脸四步」两条正文是按键现取的(条目正文只在 `js/knowledge.js` 一份,改一处所有取用点跟随),而"我要一个什么样的节拍拆解者"这句话改不到——「偏好学习 → 全局默认值 → 核心提示词 skill」页里没有它的条目。同一集的分镜链路(`sb.system`)与理解链路(`und.system`)都改得动,节拍板这条平行链路改不动,同一个项目的两条产出路径听两套口径。

## 2. 结果一句话

**新立独立键 `beat.system`**(注册表 14 条 → **15 条**),`def` 与收编前那句内联字面**逐字节相同**;取用点改成 `Prompts.get('beat.system')`,其后 KB 方法论段一字未动。**缺省逐字节不变**(人设句 + `KB.pick('六阶段结构','打脸四步')` 的连接文本与次序原样),覆盖时只换人设句。

```js
// js/prompts.js(REG 插在 und.system 之后、gen.promptSystem 之前:节拍板是分镜层的平行链路)
{
  /* 只收人设句:5 段式返回 JSON 约定(段名/宫格数/衔接词表/节拍帧结构)仍留在该步 user 半,不开放覆盖
   * (改坏即整步解析不出节拍板);KB「六阶段结构/打脸四步」方法论段由取用点按键接在人设句之后 */
  key: 'beat.system', name: '节拍板拆解 · 系统人设', vars: [],
  def: '你是短剧节拍拆解专家,精通 5 段式黄金结构(开篇钩子→矛盾建立→打压升级→反转蓄力→断集留客)。',
},

// js/beatboard.js:aiFillBeats(浏览器隐式读全局默认值页的覆盖表,与同类取用点同写法)
system: Prompts.get('beat.system') + (window.KB ? KB.pick('六阶段结构', '打脸四步') : ''),
```

回归:`unit 426/426`(基线 424,新增 2 条用例)、`integration 126/126`、`cli.smoke 95/97`(两处失败与 `master` 同名,第 7 节有取证)。

改动:`js/prompts.js` +6、`js/beatboard.js` +1−1、`js/skills.js` +7−2(SK-14 的 `prompts` 与 `note`)、`tests/unit.js` +76、`README.md` +3−3、`docs/skills-wave/README.md` +2−2(提示词条数与「记账诚实位」那条长句尾部追加一句),外加本记账件与索引行。

## 3. 为什么是新键而不是复用既有键

W56 立过判据:**同一句话的两份拷贝必须收成一个键,另一句话进不进注册表是覆盖面问题**。这一处三条全都不成立,故只能新立:

1. **字面不同**:注册表现有 14 条里没有任何一条的 `def` 与它相同或近似(`und.system` 是"资深短剧导演"、`sb.system` 是"顶级短剧分镜师"、`split.system` 是"专业的短剧策划编辑")。
2. **角色不同**:它是"按 5 段式黄金结构把一集拆成节拍"的人——上游不是分镜表、下游不是镜头,产出落在 `ep.beats` 的 5 段(情绪/节拍帧/衔接),与分镜师(拆镜到镜头)、导演(出六维理解)都不是同一个岗。
3. **产物落点不同**:`applyAIFill` 只写 `b.emotion` / `b.styleParam` / `b.frames[k].text` / `b.transition`(且**已有内容一律不覆盖**、`transition` 必须命中 `TRANSITION_LIB` 才写),不碰 `ep.shots`。

反过来实测过硬拆那条岔路(变异 11):让它改取 `und.system`,当场红 2 条(取用点缺省逐字节 + 源级键点名)——复用别人的键会让缺省提示词从 49 字的节拍拆解人设变成 9 字的导演人设,而缺省逐字节那条先接住。同理,给它开第二个同 `def` 的键也走不通(变异 5,红 3 条)。

## 4. 契约半为什么半不开放,那半到底是哪半

这一处的 system 半有两段、user 半有一整块协议,本槽的刀切在**人设句与 KB 方法论段之间**,user 半整块不动:

| 半 | 内容 | 本槽处置 |
|---|---|---|
| 人设句 | 「你是短剧节拍拆解专家,精通 5 段式黄金结构(…)。」 | **进注册表,开放覆盖** |
| KB 方法论段 | `KB.pick('六阶段结构','打脸四步')` 两条正文 | 已在 `js/knowledge.js` 单源内(不随人设覆盖变动),取用点按键接在人设句之后,**不并进 `def`** |
| user 半 | `{"beats":[{"emotion","styleParam","frames","transition"}×5]}` 的返回结构、5 段段名次序、`各段 frames 数量固定为 ${gridsStr}`(宫格时序即播放时序)、`transition` 从 `TRANSITION_LIB` 里选 | **不开放**:这半是 `applyAIFill` 的解析契约 |

user 半不开放不是省事,是因为它每一项都连着一个消费点:段数写成 6 段则第 6 段直接被 `arr[i]` 丢掉;`frames` 数量改了则超出宫格的描述被 `slice(0, b.grids)` 截掉;`transition` 措辞改了则 `TRANSITION_LIB.includes(d.transition)` 一律不命中、衔接列永远空。用户改得动人设,改不动这些——与 W49/W51 对 ops 协议半的处置同一条纪律,注册表里"不该出现的东西"另配一条断言(任何条目的 `def` 不得含 `"beats"`/`"frames"`/`"transition"`/`宫格`)。

把 5 段式 JSON 约定塞进 `def` 实测红 1 条(变异 4:缺省字面先抛)。

## 5. 缺省逐字节不变靠哪三层钉住

1. **注册表层**:`Prompts.get('beat.system')` 与收编前那句内联字面逐字节比对(改 `def` 一字即红,变异 2)。
2. **取用点层**:把 `js/beatboard.js` 里那一行 `system:` 表达式**按源码原文取出**,在装好 `prompts.js` + `knowledge.js` 的沙箱里求值,断言整条 = 人设句 + `KB.pick('六阶段结构','打脸四步')`——被求值的就是生产源码那一行,丢掉方法论段(变异 3)、改取别的键(变异 11)、绕过 `Prompts.get` 直取 `def`(变异 10)都在这一层或与它同一条用例里转红。
3. **源级层**:`js/beatboard.js` 必须出现 `Prompts.get('beat.system')`,且该人设句全文在该文件里出现 **0 次**(注册表 `def` 是唯一来源);另钉这一处不许长出服务端对端(`server.js`/`cli.js`/`mcp.js` 都不得出现 `5 段式节拍板` 与该人设句)。

覆盖面另钉两条:写覆盖后整条 = 覆盖值 + 缺省版去掉人设句那一段(**覆盖只换人设句,KB 方法论段逐字节不变**);覆盖别的键(`und.system`)时本步与缺省版逐字节相等(**不串台**)。

**这一层的诚实位**:`aiFillBeats` 是模块内私有函数,只经 `BeatBoard.render` 的按钮绑定触发,而 `render` 是整屏 `innerHTML` + 十余处 `querySelector` 绑定——DOM 重交互按仓库分工归 `e2e`,单测层不造假 DOM 去驱动它。所以第 2 层的形态是"取出源码那一行原文求值",不是 W56 那种"沙箱真跑整条链路";这两者的区别要如实写下来:**取值口与缺省/覆盖行为有断言,`temperature`/`max_tokens`/计费参数与那次调用的发生时机没有**(它们一字未改,由第 3 层的源级面兜住)。

## 6. 新立的全仓内联人设持有者名单(本槽的第二件事)

W66 记过一处坑:G-13(模块内联提示词未进注册表)的余量**只在散文里有数字**,全仓没有任何断言看住它——"实测 21 处"这类句子写错不会红,收编一处也没人提醒你去改它。本槽把这张名单立成断言:

```js
// tests/unit.js:inlinePersonaHolders()
const R = /(?:system\s*:|content\s*:|=)\s*['`]你是/g;   // 系统人设位上的 你是… 字面
// → 'js/agent-global.js:1 js/agent-ops.js:2 js/editors.js:1 js/episode-util.js:3 js/episodes.js:5
//    js/experts.js:2 js/gsettings.js:1 js/persona.js:3 js/plans.js:1 js/proj-planner.js:2
//    js/proj-shell.js:1 js/proj-upload.js:1 js/role-editor.js:1 js/sb-board.js:2 js/sb-views.js:1'
// 15 个文件 / 27 处;js/beatboard.js 随本槽退出名单(收编前 16 个文件 / 28 处)
```

口径写在夹具注释里,四类**有意不在名单内**:`js/prompts.js` 的注册表 `def`(那正是人设该在的地方)、`js/experts-data.js` 的专家人设数据(走生效人设通道,不是提示词注册表的活)、`js/api.js` 里调用方不给 `system` 时的层内兜底 `'你是专业助手。'`、`js/wf-core.js` 单镜审片那份在 **user 半**的人设句(名单只数 system 位)。

这张名单是**双向**的:收编一处忘了翻转名单会红(变异 9),任何文件新长出一处内联人设也会红(变异 7)。附带效果是"G-13 还剩多少"这件事第一次有了机器可查的判据,而不是每槽各写一个数字。

**数字口径要说清楚,免得被读成"忽然多出 8 处"**:W66 那句"21 处"数的是 `system: '你是` 这一种写法(单引号、`system` 字段位),同一口径在本槽基线上现测 20 处、收编后 19 处;本槽名单口径更宽,把模板串(`system: \`你是…\``,如 `js/plans.js`/`js/role-editor.js`)与 `{role:'system', content:'你是…'}`(`js/proj-planner.js` 两处)也数进来,故是 27 处。**两个数字口径不同,不是有 8 处新长出来。**

## 7. 记账:SK-14 的登记面与仍欠段

`beat.system` 登记在 **SK-14 `eps.structureStage`**(六阶段结构注入与分集覆盖校验)的 `prompts` 里,不登记在 SK-03。判据是"这一处属不属于本条目自己的登记面":SK-14 的 `note` 从 W2 起就写着「kb 顺序与节拍板拆解注入点一致」——**节拍板那一步本来就是它的注入落点**,人设句是这个落点 system 半的另一半,与 SK-11/SK-17/SK-21 各自登记自己注入点的 `prompts` 同形。SK-03(`core.personaCtx`)治的是"生效人设经 ctx 过服务端"那条通道:`wfPersonaNote`、板块雇佣专家、`/api/wf/*` 端点——节拍板这一步既不注生效人设也没有服务端对端,登进去会把"人设 ctx 通道已覆盖它"这件不实的事记成实的。故 `js/skills.js` 里 **SK-03 一行未动**,它的仍欠段(四处协议半不开放 + 多轮三份没有 Node 第二消费点)实况未变。

SK-14 的 `note` 补三句:

| 条目 | 改成什么 | 剩余仍欠 |
|---|---|---|
| SK-14 `eps.structureStage` | `prompts: ['beat.system']`;`note` 补「该注入点的人设句已收进注册表独立键 `beat.system`(浏览器隐式读全局默认值页的覆盖表),与本条目正文同为该步 system 半的两半、用户都改得到——注入面至此单源」 | **该步 user 半的 5 段式返回 JSON 约定仍不开放覆盖**(段名/宫格数/衔接词表/节拍帧结构,改坏即整步拆不出节拍板);**该步只在浏览器,没有服务端对端**(收编解决了"可覆盖",没解决"可 headless") |

`gaps` 一字未动(仍 `['G-13','G-04','S-01']`),`note` 里另写明理由:按 W36 立的**关联索引**口径,落地一面不摘标记——G-13 治的是全仓其余 15 个文件那 27 处内联人设,本处落地不构成清账。故 `Skills.gaps()['G-13']` 的六条关联索引键与值逐字节不变(既有断言现成看住,见变异表)。

## 8. 用例改动(新增 2 条,未删测)与变异实测

| 用例 | 钉住的事 |
|---|---|
| **新增** `节拍板拆解人设:独立键 beat.system,缺省逐字节等于内联原字面、覆盖只换人设句`(contract 套件,紧挨 W51 那条) | 缺省人设句字面 + 条目形态(无变量、名含「节拍板拆解」)+ 该 `def` 在注册表里恰好一条且各条 `def` 互不相同 + 取用点缺省整条逐字节(人设句 + KB 两条正文)+ 覆盖只换人设句 + 覆盖别的键不串台 + 5 段式 JSON 约定不在注册表内 + SK-14 已登记该键 |
| **新增** `节拍板拆解人设(源级):js/beatboard.js 零内联;全仓内联人设持有者名单` | 取值口字面 + 该人设句在 `js/beatboard.js` 出现 0 次 + user 半的 5 段式 JSON 契约仍在源码里 + 三个 Node 端都不得长出这一步 + **全仓内联人设持有者名单(文件:处数)** + `js/beatboard.js` 已退出名单 + 15 个文件 / 27 处两个数 |

十一条变异逐一实测(每条单独施加、跑 `node tests/unit.js` 后 `git checkout` 复原,复原后 426/426):

| 变异 | 实测行为 | 转红 |
|---|---|---|
| 1 取用点退回内联字面 | 用户改不到这一步的人设,与分镜/理解两条链路分叉 | 2 条(覆盖只换人设句 + 源级取值口;名单那条被同一用例里先抛的取值口断言挡在后面) |
| 2 改 `def` 一字(专家→师) | 缺省提示词变了 | 1 条(缺省人设句字面) |
| 3 取用点丢掉 KB 方法论段 | 该步不再吃「六阶段结构/打脸四步」,注入面失守 | 1 条(取用点缺省逐字节) |
| 4 把 5 段式 JSON 约定塞进 `def` | 用户能改坏 `applyAIFill` 的解析契约,且缺省字面变了 | 1 条(缺省字面先抛;「注册表里不该出现返回 JSON 约定」那条在其后) |
| 5 新开一个同 `def` 的第二键 | 同一句话在注册表里两条 | 3 条(既有的「`Prompts` 全部 key 应被 skill 索引引用」+ 「该 `def` 恰好一条」+ README 提示词条数 15→16 失配) |
| 6 SK-14 漏登 `beat.system` | 注册表新键脱离索引 | 2 条(既有的索引引用契约 + 新增那条的 SK-14 登记断言) |
| 7 别的文件新长出一处内联人设 | G-13 余量悄悄变大 | 1 条(全仓名单) |
| 8 README 提示词条数不同步(15→14) | 文档数字失真 | 1 条(注册表口径对账;README 里「N 条注册表提示词」与「N 条主线 LLM 提示词」两处各由一条正则单独查) |
| 9 名单忘了翻转(期望里仍留 `js/beatboard.js:1`) | 收编了却按没收编记账 | 1 条(全仓名单——这就是本槽自己的翻转方向) |
| 10 绕过 `Prompts.get` 直取 `Prompts.list().find(…).def` | 用户写的覆盖读不到(等价于服务端漏传 `ov`) | 2 条(覆盖只换人设句 + 源级取值口) |
| 11 改取既有键 `und.system`(不新立独立键) | 缺省人设从 49 字节拍拆解人设变成 9 字导演人设 | 2 条(取用点缺省逐字节 + 源级键点名) |

`Skills.gaps()` 投影那条既有断言在本槽全程为绿(`gaps` 未动),它同时是"顺手摘 G-13 标记"这个动作的路障:摘掉 SK-14 的 `G-13` 会让既有的投影期望串失配。

## 9. 复核方式

```
git checkout cursor/w78-beatboard-prompt-ea0c
node --check js/prompts.js js/beatboard.js js/skills.js tests/unit.js   # 全部通过
node tests/unit.js            # 426/426 PASS(基线 424,新增 2 条用例)
node tests/unit.js contract   # 58/58(含新增两条与两处 README 数字对账)
node tests/unit.js skills     # 94/94(SK-14 的 note/gaps 记账面,与基线同)
node tests/integration.js     # 126/126 PASS(该步无服务端端点,不受影响)
node tests/cli.smoke.js       # 95/97;两处失败「未登录 whoami → exit 3」「llm --json mock 链路」与 master 同名
node -e "const P=require('./js/prompts.js');
console.log(P.list().length, P.get('beat.system'), P.get('beat.system',{'beat.system':'X。'}))"
# 15 你是短剧节拍拆解专家,…(开篇钩子→矛盾建立→打压升级→反转蓄力→断集留客)。 X。
```

`cli.smoke` 那两处失败先在 `master`(`9adcf0f`)另开工作树取证:同名两条在 `master` 上同样失败(那边 **51/53**,用例总数不同是分支间用例增量所致),故按基线失败保留,不在本槽范围内。

计费面零改动:该步仍是 `Tasks.run({ cost: COST.smartSB … })` 登记 → `billingAction: 'llm.smartSB'` 与任务同 `operationId` → LLM 失败时回退本地粗拆并 `Tasks.partialRefund`,一分未多扣也未少退。`node tests/e2e.js` 按仓库纪律未跑(需用户明确要求)。本槽不含合并、未开 PR。

## 10. 与并行分支的关系

未合并 W69/W71/W73–W77。本槽只加一个键、动一行取值口、动一条 skill 记账与两条新用例,预计冲突面:

- `js/prompts.js`:在 `REG` 中段插一条。若并行槽也加键,取**并集**;条目相对次序只影响「全局默认值」页展示顺序,无行为面。**但同 `def` 开两个键会当场红 3 条**(变异 5),两侧若各自为这句人设开了键,只能留一个。
- `js/beatboard.js`:1 行,落在 `aiFillBeats` 的 `system` 字段上。若并行槽改了同一行(例如整体重写该步提示词),取"经注册表取人设句 + 其后接 KB 段"那一侧,并按实况重算取用点逐字节的期望(它是逐字节钉的)。
- `js/skills.js`:只动 SK-14 的 `prompts` 数组与 `note` 字符串。`prompts` 取并集;`note` 的仍欠段以**实况**为准折回(user 半开放了没有、有没有长出服务端对端);`gaps` 不动——谁要摘 `G-13`,判据是"全仓再无内联人设"(名单断言现成可查),不是"我这一处好了"。注意 `note` 里不得出现 `Store`/`window` 等环境句柄字面(`skills.js` 有源级禁令),故写成「全局默认值页的覆盖表」。
- `tests/unit.js`:新增两条紧挨 W51 那条,外加两个夹具(`beatSystemOf` / `inlinePersonaHolders`)。**名单的期望值必须按合入后实况重算**——并行槽若也收编了某处内联人设,那一行的文件与处数都会变,写"包含"或照抄本槽的串都会假绿/假红;夹具里的正则口径若被改宽/改窄,四类例外的注释要同步改。
- `README.md` / `docs/skills-wave/README.md`:提示词条数按合入后 `Prompts.list().length` 实计重算,单测用例数按实跑重算(`contract` 的数字对账会先红);另有提示词段那句新增说明(段内追加,与并行槽的同段改动取并集)。

## 11. 交接

1. **名单上剩下的 15 个文件 27 处**(第 6 节)是 G-13 的余量本体,它们分三类,处置口径不同:
   - **主线旁支的创作步**(`js/episodes.js` 五处解说体改写/导演阐述/光影总控/结构分析/剧本围读、`js/sb-board.js` 两处场次与文字分镜、`js/episode-util.js` 三处策划人设、`js/proj-shell.js` 发行文案、`js/proj-upload.js` 拉片分析、`js/persona.js` 文生图重写与两处配音导演):收编即"用户改得到",与本槽同形,一处一键或同角色合键按 W56 那三条判据定。
   - **工具型/元 Agent 步**(`js/agent-ops.js` 执行核验器与会话纪要、`js/agent-global.js` 意图路由器、`js/plans.js` 制作计划器、`js/experts.js` 人设进化器与 skill 生成器、`js/editors.js`/`js/role-editor.js`/`js/sb-views.js` 三处改写器):这些的输出直接被解析器消费(路由键、ops、`plan`、专家 JSON),开放覆盖要先想清楚"用户改坏了怎么兜",与第 4 节同一道题。
   - **两处旁路**(`js/gsettings.js` 导演设定兜底、`js/proj-planner.js` 策划对话与本土化译制):前者是设定生成的一次性调用,后者是 `{role:'system'}` 写法,收编时注意取值位置不同。
2. **这一处仍只在浏览器**(第 7 节):`ep.beats` 的 5 段拆解没有 `/api/wf/*` 对端,CLI/MCP 拿不到节拍板产出,headless 主线在节拍板这条平行链路上是断的。要接的形态与 W6/W8 同(新端点 + `wf-core` 双端单源 + 计费动作),是一整槽的量。
3. **该步的其余口径一字未动**:`Understanding.chatJSONRobust` 直调、`temperature: 0.5`、`max_tokens: 4000`、理解摘要截 600 字、剧本截 6000 字、`applyAIFill` 的"已有内容不覆盖"与 `TRANSITION_LIB` 命中才写、LLM 失败回退 `localFillBeats` 并退费。
4. **名单断言的已知盲区**:它数的是"system 位上以 `你是` 开头的字面",故换个开头写法(例如「作为一名短剧节拍拆解专家…」)或把人设拼在变量里再传进去,名单数不出来。真要堵严得改判据(例如按调用点扫 `chatJSON*` 的 `system` 实参),那是另一槽的量;本槽如实登记,不假装名单是全集。
