# W89 · 制作计划生成步的内联人设收进注册表(独立键 `plan.system`)

> 基线 `origin/cursor/w80-integration-5369 @ 4c45f89`(四条收编槽并线之后的集成头部),落地分支 `cursor/w89-plans-prompt-835b`。
> 本槽只做一件事:把 `js/plans.js` LLM 规划步(项目页「计划 → 让助手规划」)写死的 `system` **人设半**收进 `js/prompts.js` 注册表的独立键,取值口就地改经 `Prompts.get`。
> 不改计费(该步仍是 `Tasks.run` 1 积分、`billingAction: 'llm.agent'`、失败退费,口径一字未动)、不改步骤钳制与 JSON 契约、不碰 `js/experts-data.js`、不收 `js/plans.js` 之外的任何文件、未删测(新增 2 条用例)。

## 1. grep 核实:口径内恰好一处内联,不是零处

任务给的前提是「W81 扩展口径曾点到『制作计划器』等人设」,并要求先按仓库实况 grep 再动手(若已无内联则只把核实写进记账、不空提交)。核实结果是**有一处**,所以本槽是真收编而非只写核实:

```
$ ls js/plan*.js
js/plans.js

$ grep -n "你是" js/plans.js
133:        system: `你是「虎鲸导演助手」的制作计划器:把用户目标拆为按序可执行的制作步骤。可用领域命令:${cmds || '(无)'}(…)。只返回 JSON {"title":…,"steps":[…]}(2-8 步,按执行顺序)。`,
```

`js/plan*.js` 这个 glob 在本仓只命中 `js/plans.js` 一个文件(相邻的 `js/proj-planner.js` 不在 glob 内,见下),该文件里 LLM 调用只有这一处(`grep -n "chatJSON\|system\|user:"` 同样只落在 131–134 行这一段),故本槽收的就是它。核对它确实是「让助手规划」那一步靠三个锚点:

| 锚点 | 实况 |
|---|---|
| 计费登记 | `Tasks.run({ type: '制作计划', cost: 1, actionName: '制作计划生成' })`,上游 `billingAction: 'llm.agent'`,失败退费 |
| user 半 | `项目「${p.name}」(${p.style})。分集列表:${epsInfo}。用户目标:${goal}` |
| 产物落点 | `{id,title,goal,steps,createdAt,updatedAt}` → `Plans.replace` 落 `p.agentPlan`,步骤经 `Commands.execute` 执行 |

**不收其它文件**(任务明确口径):`js/proj-planner.js` 里有两处内联人设(资深短剧策划/编剧、出海本土化译制专家),但它不在 `js/plan*.js` 里(名字是 `proj-planner`),且那两处是 `{ role: 'system', content: '你是…' }` 形态、连 W80 那份 `system: '你是` 字面盘点都不覆盖,故一字未动;`js/experts-data.js` 的 16 条专家人设按任务要求不碰(那是专家数据单源,不是步骤人设);`js/agent-ops.js`、`js/beatboard.js`、`js/gsettings.js` 等处的余量照旧(见第 8 节)。

## 2. 结果一句话

注册表新增第 26 条 `plan.system`「制作计划生成 · 系统人设」,`def` 与原内联字面的人设半**逐字节相同**;取值口改成 `Prompts.get('plan.system') + \`可用领域命令:…\``——人设句从注册表来,命令白名单与返回 JSON 契约仍就地拼。**缺省行为零变化**(拼起来与收编前的整条 `system` 逐字节相同,有行为面用例逐字节比对),写覆盖时这一步跟随、相邻键不串台。

```js
// js/prompts.js(排在 Agent 四条对话人设之后)
{ key: 'plan.system', name: '制作计划生成 · 系统人设', vars: [],
  def: '你是「虎鲸导演助手」的制作计划器:把用户目标拆为按序可执行的制作步骤。' },

// js/plans.js generate():浏览器隐式读 Store.state.settings.promptOverrides
system: Prompts.get('plan.system') + `可用领域命令:${cmds || '(无)'}(…)。只返回 JSON {…}(2-8 步,按执行顺序)。`,
```

`index.html` 里 `js/prompts.js`(第 21 行)本就早于 `js/plans.js`(第 53 行)加载,取值口无需调整加载序。

回归:`unit 437/437`(基线 435,新增 2 条)、`integration 126/126`、`cli.smoke 95/97`(两处失败与基线逐项相同,见第 7 节)。

改动(`git diff --numstat`):`js/prompts.js` +9、`js/plans.js` +4−2、`js/skills.js` +9−1(SK-03 的 `prompts`/`note`、SK-05 的 `note`)、`tests/unit.js` +96−1、`README.md` +4−4、`docs/skills-wave/README.md` +1−1,外加本记账件与它那行索引。

## 3. 为什么是独立键,不与那四条「虎鲸导演助手」人设合成

同一个助手名下已有四条对话人设(`agent.system` 单轮 / `agent.panelSystem` 分集面板 / `agent.drawerSystem` 全局抽屉 / `agent.previsSystem` 预排),字面开头都是「你是「虎鲸导演助手」」,看着像能合。判据仍是 W51/W77 那条:**合成的前提是角色同一**,而这五处的产物形态不同——

| 步骤 | 角色 | 产物 |
|---|---|---|
| 制作计划生成 | 制作计划器 | 一张按序可执行的**步骤表**(`title` + 2-8 个 `steps`),要落库成 `p.agentPlan` 并逐步喂给 `Commands.execute` |
| Agent 单轮(服务端) | 短剧制作智能体 | 一段**回复** + 可选 ops 动作 |
| Agent 分集面板 / 全局抽屉 / 预排 | 三种运行模式下的创作智能体 | 多轮**对话回复** + ops |

把计划器并进任何一条对话键,等于让用户改对话口吻时顺手改掉计划拆步的定位(反之亦然);按角色各成一条键,「全局默认值」页上改哪一条就只影响那一条(第 5 节的串台断言)。也不复用别的既有键:26 条里没有一条与这句同字面——**没有同字面就谈不上复用**,硬指过去(变异 9:取值口改指 `agent.system`)会把这一步的产物从"步骤表"推向"对话回复"。

注册表位置排在对话四条**之后**:它是同一个助手的另一条产物线,不属于任何一种对话模式,排在四条之间会让「全局默认值」页读起来像第五种对话模式(有断言钉住这个相对次序)。

也不做 `WfCore` 派生函数:该步只要这一句人设,不接方法论块、不接 `Skills.block`,与 `und.system` / `graph.system` 同形直接 `Prompts.get`。

## 4. 契约半不开放:只收人设句

注册表条目里只有那一句人设。**可用领域命令白名单**(`可用领域命令:${cmds}` 那段,`cmds` 现取 `Commands.list()`)与**返回 JSON 契约**(`{"title":…,"steps":[{"label","cmd","ep"}]}` 与 2-8 步区间)仍留在调用点、不做成可覆盖变量,理由是这半是消费侧的解析与钳制契约:

```js
const known = new Set(window.Commands ? Commands.list().map(c => c.name) : []);
const cmd = known.has(s0.cmd) ? s0.cmd : null;           // 不在注册表内的命令一律降级成导航步
const e = (p.episodes || []).find(x => x.title === t) || …; // 集级命令定位不到分集:丢弃该步,不猜
if (!steps.length) throw new Error('未能生成有效步骤');       // 整轮拆不出有效步骤 → 失败退费
```

`label` 空的步会被丢掉、`cmd` 名不在命令注册表内会降级、集级命令的 `ep` 对不上分集标题整步丢弃;字段名改一个字就是全部步骤被丢完 → 抛错 → 该轮 1 积分退费。命令白名单同理:它是现取命令表拼的,做成可覆盖等于让用户手抄一份会过期的命令清单。所以与 W49/W71/W77 同纪律:**人设句开放、契约半不开放**,并由一条断言钉住注册表里不得出现 `"title"` / `"steps"` / `"label"` / `可用领域命令` / `2-8 步` 这些字面。

## 5. 缺省逐字节不变靠哪几层钉住

1. **注册表层**:`Prompts.get('plan.system')` 与字面直接比对(变异 1 转红);并要求这句字面在 `Prompts.list()` 里**恰好命中一条**(变异 10 反向撞车转红)。
2. **行为层(沙箱真跑)**:`Plans.generate` 在 `vm` 沙箱里真跑一轮(`Tasks.run` 与 `Understanding.chatJSONRobust` 打桩截获上游请求体),断言 `system` **整条**等于 `人设句 + 契约半`拼出来的那一串——契约半被改一个字(变异 13:`2-8 步` → `2-6 步`)、取值口指错键(变异 9)、`def` 被改(变异 1/5/6)都在这条上转红;同时钉住 `user` 半逐字节、`temperature/max_tokens = 0.3/1500`、`cost/actionName = 1/制作计划生成`、`billingAction = llm.agent` 与步骤钳制的产物形状。
3. **覆盖只换人设句**:写覆盖后 `system` 从「可用领域命令」起的那一段与缺省逐字节相同,`user` 半一字不变(变异 2:取值口退回内联字面 → 覆盖不再跟随,当场红)。
4. **源级**:取值口正则要求 `Prompts.get('plan.system') + \`可用领域命令:` 与该步 user 半锚点 `用户目标:${goal}` 在 900 字符内配对(键挪到别处或那一步被改走别的键即红),并要求 `js/plans.js` 里 `system: '你是` / `` system: `你是 `` 零命中。
5. **全仓唯一持有者**:这句字面的持有者扫一遍 `server.js`/`cli.js`/`mcp.js`/`index.html` 与 `js/*.js`,必须**恰好只剩 `js/prompts.js`**(变异 8:在同文件另开一个常量抄第二份 → 转红)。
6. **不冒充双端**:这条链路没有服务端/CLI 对端(`/api/wf/*` 没有制作计划端点,CLI 也没有"按目标拆步"这个动作),断言正向要求 `server.js`/`cli.js`/`mcp.js` 不出现该步人设的字面锚点。收编解决的是**可覆盖**,不是可 headless——与 W51/W71/W76/W77 同口径,记账里如实这么写。

`Prompts.get` 对未覆盖键返回 `def`,覆盖表为空对象/`undefined` 同样落 `def`,故没改过提示词的用户看到的 `system` 与本槽之前逐字节一样。零成本那条生成路径(`fromWorkflow` 主线全链投影)、`execStep`/`runAll` 的执行闭环与 `Bus 'plan.step'` 全在取值口之外,一行未碰。

覆盖真到得了这一步(浏览器隐式读 `Store` 覆盖表那条路,直接在 Node 里摆出浏览器全局验):

```
node -e "global.Store={state:{settings:{promptOverrides:{'plan.system':'你是排期助手(覆盖生效)。'}}}};global.window={Store};
const P=require('./js/prompts.js');console.log(P.get('plan.system',{}),'|',P.get('plan.system'),'|',P.get('agent.previsSystem'),'|',P.list().length);"
# 你是「虎鲸导演助手」的制作计划器:把用户目标拆为按序可执行的制作步骤。 | 你是排期助手(覆盖生效)。 | 你是「虎鲸导演助手」,短剧创作智能体,当前处于「🎛 预排模式」。 | 26
```

缺省逐字节(左)、覆盖跟随(中)、相邻对话键不串台(右)、条数 26。

## 6. 记账:键宿主在 SK-03,SK-05 补上"另一条生成路径"

| 条目 | 改成什么 |
|---|---|
| SK-03 `core.personaCtx` | `prompts` 补 `plan.system`(`Prompts` 全部 key 必须被 skill 索引引用是既有契约,漏登即红);`note` 已落地那半加一段:角色是"制作计划器"、出步骤表不是对话回复,故不与对话四条合成;**仍欠段**加一句:可用领域命令白名单与 `title`/`steps` 契约仍就地拼、不开放覆盖(该步 1 积分失败退费) |
| SK-05 `core.playbookProjection` | `note` 加一句:计划层另一条生成路径(`js/plans.js generate`)有意**不切**本投影——它拆的是用户自己那个目标而不是主线全链,只受命令注册表钳制,人设句收在 `plan.system` 名下(登记在 SK-03) |

键为什么登记在 SK-03 而不是 SK-05:SK-03 是"生效人设经 ctx 过服务端"这条 infra 面的**人设键宿主**(26 条里 23 条挂它名下,另三条各有自己的宿主:带 `{style}{brief}` 变量的评审指令 `sb.reviewUser` 归 SK-18、经装配口接 KB 方法论块的 `gen.promptSystem` 归 SK-21/SK-25、八维度重写 `persona.promptSystem` 归 SK-11);SK-05 的登记面是**主线全链步骤投影**,而这一步恰恰是"不切投影"的那条路径,把键挂到它名下会读成"计划的人设也是投影出来的"。SK-05 那句只做记账对齐:它的 `note` 此前只写了 `fromWorkflow` 走投影,读者会以为计划层只有那一条路。

`gaps` 一字未动:G-13 治的是全仓内联人设的大头,按 W36 立的关联索引口径落地一面不摘标记,故 `Skills.gaps()['G-13']` 六条值逐字节不变(既有断言现成钉着)。

## 7. 用例改动(新增 2 条,未删测)与变异实测

沙箱 helper `loadPlans` 加了两处:多加载一个 `js/prompts.js`(与 `index.html` 同顺序:`domain → prompts → knowledge → skills → cmd-registry → plans`),并可选收一个覆盖表参数写进 `Store.state.settings.promptOverrides`(与 `loadPersona(ov)` 同形)。既有 12 条 plans 用例一条未改、一条未删。

| 用例 | 钉住的事 |
|---|---|
| **新增** `制作计划生成人设`(contract 套件,紧接事件图谱两条之后) | 缺省字面 + 覆盖跟随 + 条目形态(无变量、名字点名该步)+ 字面恰好命中注册表一条 + 不与四条对话键同字面且覆盖时它们逐字节不动 + 排在对话四条之后 + 契约五个字面不进注册表 + SK-03 已登记 |
| **新增** `制作计划生成人设(源级+行为)` | 沙箱真跑一轮:缺省 `system` 整条逐字节 = 人设句 + 契约半、`user` 半逐字节、取样参数、计费登记(1 积分 / 制作计划生成 / `llm.agent`)、步骤钳制产物形状;覆盖只换人设句;源级取值口与 user 半锚点配对 + `js/plans.js` 零内联;全仓持有者只剩 `js/prompts.js`;三端不冒出第二个消费点;SK-03/SK-05 记账锚点 |

十四条变异逐一实测(每条单独施加、跑 `node tests/unit.js` 后复原;"红 N" = 转红的**用例**数,同一条用例里第一个失败断言就抛,故一条用例最多报一次):

| 变异 | 实测行为 | 转红 |
|---|---|---|
| 1 `def` 改「你是制作计划器。」 | 缺省提示词变了 | 2 条(注册表字面 + 行为面整条) |
| 2 取值口退回内联字面 | 用户覆盖不再跟随这一步 | 1 条(红在"覆盖跟随"上——缺省那两条断言此时反而成立,见下) |
| 3 SK-03 漏登记新键 | 新键脱离 skill 索引 | 2 条(既有的"全部 key 应被索引引用" + 新增那条) |
| 4 该步 user 半锚点被改一个字 | 取值口与步骤失配(键可能已挪走) | 1 条 |
| 5 `def` 改成与 `agent.previsSystem` 同字面 | 等于把计划器并进预排模式 | 2 条 |
| 6 把返回 JSON 契约塞进 `def` | 契约半变成可覆盖 | 2 条 |
| 7 `README.md` 提示词条数不同步(26 → 25) | 文档数字失真 | 1 条(注册表口径对账那条;README 两处各由一条正则单独查) |
| 8 同文件另开常量抄第二份人设句 | 出现第二处字面来源 | 1 条(全仓持有者名单) |
| 9 不开新键、取值口改指 `agent.system`(真"合成复用") | 角色定位失真 | 1 条(行为面整条:缺省 `system` 当场不同) |
| 10 反向撞车:`agent.system` 的 `def` 改成这句人设 | 同一句人设在表里两条 | 3 条(本槽"恰好一条" + Agent 单轮那两条既有断言) |
| 11 条目名改成「计划 · 系统人设」 | 全局默认值页认不出这是哪一步 | 1 条 |
| 12 SK-05 `note` 删掉"人设句在 `plan.system` 名下"那句 | 落地了但记账没写 | 1 条 |
| 13 契约半被改动(`2-8 步` → `2-6 步`) | 缺省 `system` 变了(契约半也在逐字节保护里) | 1 条 |
| 14 SK-03 仍欠段删掉制作计划那句 | 契约半的边界没记账 | 1 条 |

变异 2 的转红点值得记一句:它把取值口换回内联字面,**缺省那两条断言反而全绿**(拼出来的 `system` 与收编前逐字节相同——这正是"缺省不变"的另一面),红的是"覆盖 `plan.system` 时该步取值跟随"。所以"缺省逐字节"与"覆盖跟得上"两条断言必须都在:只有前者,退回内联毫无阻力;只有后者,拼错一个字没人管。变异 9 与变异 13 同理落在行为面那条整体比对上,而不是源级正则——源级正则在它们之后才跑。

## 8. G-13 现况:11 处 → 10 处,标记一个不摘

按 W80 那份逐文件盘点的口径(`system: '你是` / `` system: `你是 `` 字面计数),基线 11 处,本槽收 1 处后 **10 处**:

| 文件 | 余量 | 是什么 |
|---|---|---|
| `js/agent-ops.js` | 2 | 执行核验器、会话纪要整理器 |
| `js/beatboard.js` | 1 | 节拍拆解专家 |
| `js/editors.js` | 1 | 漫剧编剧(气泡生成) |
| `js/experts.js` | 1 | 专家人设进化器 |
| `js/gsettings.js` | 1 | 资深影视导演 |
| `js/proj-shell.js` | 1 | 发行运营专家 |
| `js/proj-upload.js` | 1 | 拉片分析师 |
| `js/role-editor.js` | 1 | 角色设定师 |
| `js/sb-views.js` | 1 | 分镜改图专家 |

`js/plans.js` 至此内联人设归零(有断言钉住)。这份计数口径**不覆盖** `{ role: 'system', content: '你是…' }` 形态,`js/proj-planner.js` 那两处(策划/编剧、出海译制)与 `js/agent-global.js` 的两处(元 Agent 上下文尾句、意图路由器)是那种形态,要收得先决定口径要不要扩到那一形态——那是独立一题,本槽不动。`G-13` 缺口没闭合,按关联索引口径**一个标记不摘**。

## 9. 复核方式

```
git checkout cursor/w89-plans-prompt-835b
node --check js/prompts.js && node --check js/plans.js && node --check js/skills.js && node --check tests/unit.js
node tests/unit.js            # 437/437 PASS
node tests/unit.js contract    # 含新增两条与三处 README 数字对账
node tests/unit.js plans       # 既有 12 条(loadPlans 多加载 prompts.js 后仍全绿)
node tests/integration.js     # 126/126 PASS
node tests/cli.smoke.js       # 95/97;两处失败「未登录 whoami → exit 3」「llm --json mock 链路」在基线 4c45f89 上逐项相同(已实测对照)
```

行为面这一层是沙箱真跑(`Plans.generate` 是可直接 `await` 的模块函数,不像 `js/episodes.js` 那些挂在 `onclick` 闭包里的步骤要先造假 host),故本槽的 `system` 取证不靠源级正则兜底;`node tests/e2e.js` 按仓库纪律未跑(需用户明确要求)。本槽不含合并、未开 PR。

## 10. 交接

1. **`js/plans.js` 至此零内联**;别的文件余量见第 8 节。要不要继续收是产品口径题——注册表条目多了「全局默认值」页会变长,且这些步多半没有服务端对端,收进注册表只解决"可覆盖"不解决"可 headless"。
2. **口径要不要扩到 `{ role:'system', content:… }` 形态**:`js/proj-planner.js`(2 处)与 `js/agent-global.js`(2 处)是那种写法,W80/W74/W76 的字面计数一直没覆盖它们。扩口径要先决定"拼进上下文的尾句(如 `agent-global` 那句"你是虎鲸,元Agent,掌握以上全局上下文…")算不算一条人设",判据不清就会把余量数字来回改。
3. **契约半仍不开放**:命令白名单是现取命令表拼的、返回 JSON 契约连着步骤钳制与失败退费。要开放得先想清楚"用户抄一份过期命令清单"怎么办,那不是收编题。
4. **`Plans.generate` 现在是这条链路上唯一可直接 `await` 的 LLM 步**:后续要给计划层加行为面用例(比如钳制分支、退费路径),可以照本槽的 `loadPlans` + `Tasks.run` 打桩写法直接跑,不必再造 DOM。
