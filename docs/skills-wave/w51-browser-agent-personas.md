# W51 · 浏览器多轮对话的三份系统人设收编(三条独立键,协议半留在装配口)

> 基线 `cursor/w50-integration-dad5 @ 371c75e`(W50 集成后的头部),落地分支 `cursor/w51-browser-agent-personas-da99`。
> 本槽做的是 W49 第 9 节交接第 1 条:把浏览器多轮对话那三份人设句(分集面板 / 全局抽屉 / 预排模式)从各自的模板串里抽进 `js/prompts.js` 注册表。
> 不改发布门(`js/release.js` 一行未碰)、不新增计费动作(三条路径仍是 `llm.agent`=1/条、失败退费的原口径)、未删测(反转 W49 留的 1 处 tripwire,新增 1 条用例,换 1 处点名锚点)。

## 1. 三个键还是一个带变量的键:取三个

W49 第 9 节把这题留成产品口径题,本槽按**三条独立键**落。判据是三份措辞对应的不是同一句话的三份拷贝,而是三种运行模式各自的角色定位:

```js
// 收编前的三处开头(逐字节即注册表三条 def)
js/agent.js        你是「虎鲸导演助手」,短剧分镜编辑智能体。
js/agent-global.js 你是「虎鲸导演助手」,短剧创作智能体,贯穿剧本→主体→分集→分镜→生成→成片全流程。
js/agent-ops.js    你是「虎鲸导演助手」,短剧创作智能体,当前处于「🎛 预排模式」。
```

分集面板只改一集的分镜表(它的 ops 面是镜头/节拍/场次字段);全局抽屉贯穿全流程(ops 面是项目/剧本元/主体/分集,镜头层随 ctx 有无而收放);预排模式**不返回 ops**,只出参数预排方案等用户拍板。合成一个带变量的键,等于让用户改一处就同时改掉三种模式的角色定位——其中两端必然失真;而合成后想再拆回来,注册表键位是持久化面(`settings.promptOverrides` 按键存),拆一次就废掉用户已写的覆盖。所以宁可让「全局默认值」页多出三条,也不合。

顺带把 W49 的另一条纪律照搬:**只抽人设句**。三处的协议半各自是 ops 解析契约——面板那半有 8 类数据 op + 命令白名单 + 动作别名 + 决策选项卡 + 按需查询协议,抽屉那半有 6 类数据 op + 跳转/执行动作,预排那半是 `plan.action` 二选一与参数键的取值范围(执行时还要过 `clampPrearrParams` 钳制)。这些改一个字就可能让整轮回复解析不出 ops 或钳不住参数,**能改坏的东西不该开成开关**。三刀都切在人设句与其后第一个注入/协议段之间。

## 2. 结果一句话

注册表从 11 条到 14 条,新增 `agent.panelSystem` / `agent.drawerSystem` / `agent.previsSystem`,三条 `def` 与收编前三处模板串开头的字面**逐字节相同**;三个装配口的人设句换成 `Prompts.get(键)`,协议半一字未动。**缺省行为零变化**——8 种 ctx/模式与收编前实现对跑,输出逐字节全等(第 7 节实测);覆盖时只换对应那一份人设句,另两份与各自协议半逐字节不动。

```js
// js/prompts.js(REG 末位续在 agent.system 之后:多轮对话同属贯通层,不摆进主线七步之间)
/* 浏览器多轮对话的三份人设:三种运行模式各一条独立键(措辞不同,不合并)。
 * 同样只收人设句——ops 协议/字段面/返回 JSON 约定仍由各自装配口拼,不开放覆盖。 */
{ key: 'agent.panelSystem',  name: 'Agent 分集面板 · 系统人设', vars: [], def: '你是「虎鲸导演助手」,短剧分镜编辑智能体。' },
{ key: 'agent.drawerSystem', name: 'Agent 全局抽屉 · 系统人设', vars: [], def: '你是「虎鲸导演助手」,短剧创作智能体,贯穿剧本→主体→分集→分镜→生成→成片全流程。' },
{ key: 'agent.previsSystem', name: 'Agent 预排模式 · 系统人设', vars: [], def: '你是「虎鲸导演助手」,短剧创作智能体,当前处于「🎛 预排模式」。' },

// 三个装配口:开头一句换成注册表取值,其后原样
js/agent.js        panelSystem(p, ep, text)      → `${Prompts.get('agent.panelSystem')}${window.KB ? KB.block() : ''}${aPersonaBlock(ep)}${memBlock(text, '分镜')}…`
js/agent-global.js buildGlobalPrompt(ctx)        → `${Prompts.get('agent.drawerSystem')}${window.KB ? KB.block() : ''}…`
js/agent-ops.js    prearrPrompt(p, ep, sysExtra) → `${Prompts.get('agent.previsSystem')}${sysExtra || ''}…`
```

面板那处收编前没有装配口——system 模板直接写在 `render` → `sendInner` 的 `llmOpt` 里,人设句夹在闭包深处。本槽把那段模板原样搬成模块内的 `panelSystem(p, ep, text)`(调用点变成 `system: panelSystem(p, ep, text)`),它才有一个可点名、可对账的取值口,与 `WfCore.buildAgentSystem` / `prearrPrompt` 形态一致。搬移是纯文本迁移,输出逐字节不变(第 7 节按 3 种面板 ctx 对跑)。同理 `buildGlobalPrompt` 补进 `window.AgentG` 出口——它本来就是 `js/agent.js` 注释里点名"已拆至 agent-global.js"的那批实现之一,只是此前没挂出口。

回归:`unit 381/381`(基线 380,新增 1 条用例)、`integration 93/93`、`cli.smoke 62/64`(两处失败与 `master` 基线逐项相同,实测见第 7 节)。

改动:`js/prompts.js` +14、`js/agent.js` +26−19(装配口抽出、AC 出口加一名)、`js/agent-global.js` +4−2、`js/agent-ops.js` +3−2、`js/skills.js` +10−5(SK-03 的 `prompts` 与 `note`)、`tests/unit.js` +144−4、`README.md` +3−3、`docs/skills-wave/README.md` +1−1(提示词条数),外加本记账件与索引行/摘要句同步。

## 3. 这一处的「两端」:落在取值口,而且没有第二个消费点

W40 / W42 / W45 收的三处,装配口都有两个消费点(浏览器某模块 + `server.js`),「两端跟随」指同一句话在两个消费点同键取值。W49 收的单轮只有服务端一个消费点,它的「两端」落在取值口上。本槽比 W49 更靠浏览器一侧:**三处都只有浏览器一个消费点**——多轮对话是工作台交互(要预览卡、冲突闸、逐项确认、撤销栈),`server.js` / `cli.js` / `mcp.js` 里没有第二份多轮实现,headless 侧走的是 `/api/wf/agent` 单轮(那句人设是 `agent.system`,另一条键)。

所以本槽的「两端」如实写成:**键登记在双端 UMD 注册表里,取值口 `Prompts.get(key, ov)` 双端可用;但这三条键当前只有浏览器一个消费点,不存在 Node 第二消费点**。浏览器路径隐式读 `Store.settings.promptOverrides`(与 `js/review.js` / `js/episode-util.js` 同纪律,不显式传参);哪天有 headless 多轮,它按同键 `Prompts.get(key, promptOverrides)` 显式传表即可跟随。写成「两端各有一个消费点」是不实的,故此处如实记账,SK-03 的 `note` 里也这么写。

## 4. 缺省逐字节不变靠哪四层钉住

1. **注册表层**:三条 `Prompts.get(键)` 的返回值直接与收编前三处的开头字面比对——改 `def` 一字即红(变异 1);把协议半塞进 `def` 也会撞上这条(变异 8)。
2. **装配口层**:三处的**整条**输出与写死的期望串逐字节比对。期望串里生成段(KB 块、生效人设、协作记忆、命令白名单 `AO.cmdProtocol()`、动作别名 `AO.actProtocol()`、按需查询协议、四张词表)按**同一单源**取值代入,对账的是连接文本与注入段次序——丢掉命令白名单段即红(变异 4)。预排那条走的是真实发送路径 `AO.prearrSend`(截获上游请求体的 `system` 字段),不是直接调模板函数。
3. **覆盖层**:三种覆盖各施加一次,每次三份装配全查——命中那份必须满足 `ovd === 覆盖值 + 缺省版.slice(人设句长度)`(**覆盖只换人设句、协议半逐字节不变**),另两份必须与缺省版逐字节相等(**覆盖不串台**)。谁把三份合成一个键、或让某处绕过 `Prompts.get` 直取 `def`,这一层先红(变异 3、7)。
4. **源级层**:三个文件各须出现自己那一键的 `Prompts.get('…')`,且三份人设全文在三个文件里**零命中**(注册表 `def` 是唯一来源)。这一层就是 W49 那条 tripwire 反转后的样子(第 6 节)。

另钉一条:注册表里不得有任何条目的 `def` 含 `"reply"` 或 `"op"`——返回 JSON 约定与 ops 字段面不做成可覆盖变量。

## 5. 记账:SK-03 的仍欠段换成"协议半不开放覆盖 + 取值口口径"

`prompts` 补三条新键(`Prompts` 全部 key 必须被 skill 索引引用是既有契约,漏登即红);`note` 里 W49 写的那句「仍欠:浏览器多轮对话面板的系统人设未收进提示词注册表」按实况改写。

| 条目 | 改成什么 | 剩余仍欠 |
|---|---|---|
| SK-03 `core.personaCtx` | `prompts` 补 `agent.panelSystem` / `agent.drawerSystem` / `agent.previsSystem`;`note` 补「浏览器多轮三份人设同形收编为三条独立键(三种运行模式措辞不同,不合成一个键),装配口分别是 `AgentCore.panelSystem` / `AgentG.buildGlobalPrompt` / agent-ops 的 `prearrPrompt`,浏览器隐式读全局默认值页的覆盖表,单轮与多轮的人设句至此全部在注册表内」 | **四处的 ops 协议 / 字段面 / 命令白名单 / 返回 JSON 约定仍由各自装配口拼、不开放覆盖**(那半是 ops 解析契约,用户改坏即整轮无 ops);**多轮那三份没有 Node 第二消费点**,两端只落在取值口(同一注册表键 + `Prompts.get` 读覆盖),不是两个消费点 |

两条都属实,且都不是遗漏:第一条是有意为之(第 1 节),写进仍欠段是因为读者有权知道"可覆盖"的边界到哪为止——用户改得动人设,改不动协议;第二条是第 3 节那笔如实记账,不写就会被读成"多轮也已双端消费"。`pending` / `gaps` 一字未动,短名单仍无 `pending`。

`tests/unit.js` 的点名锚点由 `浏览器多轮` / `未收进提示词注册表` 换成 `ops 协议` / `不开放覆盖`(仍只认「仍欠」之后那段,变异 6)。

## 6. 用例改动(新增 1 条 + 反转 1 处 tripwire + 换 1 处锚点,未删测)

| 用例 | 钉住的事 |
|---|---|
| **新增** `浏览器多轮三份人设`(contract 套件,紧挨 W49 那条) | 三条缺省人设句字面 + 四种运行模式措辞互不相同(含单轮那条,共 4 份) + 三条条目形态(无变量、条目名 `Agent …· 系统人设`)+ 分集面板注入段次序(KB → 生效人设 → 协作记忆)+ 三处整条装配输出逐字节(面板/抽屉 项目+分集/预排 经真实发送路径)+ 抽屉无分集 ctx 时协议半按 ctx 收放而人设句不变 + 三种覆盖各只换对应那一份(另两份逐字节不变)+ 清空覆盖逐字节回缺省 + 协议契约不在注册表内 + SK-03 已登记三键 |
| **反转** `Agent 单轮人设`(W49 那条的末段 tripwire) | W49 留的红灯按设计触发:原断言要求「三份措辞标记仍在各自文件里」「`Prompts.list()` 里没有任何 `def` 出现在这三份 system 中」,收编后改为「三条键必须在注册表里」「三个文件各须取自己那一键」「三份人设全文在三个文件里零命中」 |
| **换锚点** 记账对齐(既有用例) | `core.personaCtx` 的点名锚点由 `浏览器多轮` / `未收进提示词注册表` 换成 `ops 协议` / `不开放覆盖` |

新增用例跑在新加的沙箱加载器 `loadAgentChat()` 上:按 `index.html` 同顺序装 `cmd-registry → domain → prompts → knowledge → wf-core → agent → agent-ops → agent-global` 八个真实源文件,被测代码即生产代码(既有 `loadAgentOps()` 一字未动,仍只装到 `agent-ops`)。

九条变异逐一实测(每条单独施加、跑 `node tests/unit.js` 后 `git checkout` 复原,复原后 381/381):

| 变异 | 实测行为 | 转红 |
|---|---|---|
| 1 改 `agent.panelSystem` 的 `def` 一字(智能体→助手) | 缺省提示词变了 | 1 条(缺省人设句字面断言) |
| 2 全局抽屉退回内联人设字面 | 覆盖表被绕过,该端不再跟随注册表 | 2 条(源级「应取自注册表键」+ 覆盖只换人设句那条) |
| 3 预排模式改取抽屉那一键(三份合成一个键) | 预排的角色定位失真(变成"贯穿全流程") | 2 条(源级键点名 + 预排整条逐字节) |
| 4 分集面板装配口丢掉命令白名单段 | 模型拿不到可用命令词表,run 类 ops 只能靠猜 | 1 条(面板整条逐字节对账) |
| 5 SK-03 的 `prompts` 漏登 `agent.panelSystem` | 注册表新键脱离索引 | 2 条(既有的「`Prompts` 全部 key 应被 skill 索引引用」+ 新增那条) |
| 6 SK-03 仍欠段退回「浏览器多轮未收编」旧口径 | 余量记账与实况不符(那三处已收编) | 1 条(W39 收紧后的点名断言) |
| 7 面板改 `Prompts.list().find(…).def` 直取(绕过 `Prompts.get`) | 用户写的覆盖读不到(等价于服务端漏传 `ov`) | 2 条(源级取值口 + 覆盖只换人设句) |
| 8 把返回 JSON 约定塞进 `agent.previsSystem` 的 `def` | 用户能改坏 `plan` 解析契约,且缺省字面变了 | 2 条(W49 那条的「注册表里不该出现返回 JSON 约定」+ 本槽缺省字面) |
| 9 `README.md` 提示词条数不同步(14 → 11) | 文档数字失真 | 1 条(注册表口径对账那条;README 里「N 条注册表提示词」与「N 条主线 LLM 提示词」两处各由一条正则单独查) |

## 7. 复核方式

```
git checkout cursor/w51-browser-agent-personas-da99
node --check js/prompts.js js/agent.js js/agent-ops.js js/agent-global.js js/skills.js tests/unit.js  # 全部通过
node tests/unit.js            # 381/381 PASS
node tests/unit.js contract    # 52/52,含新增那条、反转后的 W49 那条与两处 README 数字对账
node tests/unit.js skills      # 93/93,含换锚点后的记账对齐
node tests/integration.js      # 93/93 PASS
node tests/cli.smoke.js        # 62/64
```

**缺省逐字节按 8 种 ctx/模式与收编前实现对跑**:把 `HEAD`(收编前)三处的模板字面原样搬进同一个沙箱当对照实现,与工作区三个装配口逐一比对,全等——

| 形态 | 长度 | 结果 |
|---|---|---|
| 面板 / 无雇佣专家无指定人设(含 KB 块与全部记忆种子) | 3226 | 逐字节相同 |
| 面板 / 会话指定专家人设(`ep.agentPersonaId`) | 3256 | 逐字节相同 |
| 面板 / `window.KB` 未加载 | 2877 | 逐字节相同 |
| 抽屉 / 项目 + 分集(镜头层字段面在内) | 1558 | 逐字节相同 |
| 抽屉 / 仅项目(上游有已定稿板块) | 1174 | 逐字节相同 |
| 抽屉 / 项目列表(无项目) | 1162 | 逐字节相同 |
| 预排 / 有分集配置(带注入段) | 898 | 逐字节相同 |
| 预排 / 无分集 | 817 | 逐字节相同 |

覆盖链路同法实测:写 `settings.promptOverrides['agent.panelSystem']` 后,面板那份开头即覆盖值、其后逐字节等于缺省版去掉人设句的那一段,抽屉与预排两份与缺省版逐字节相等。

`cli.smoke` 那两处失败(「未登录 whoami → exit 3」「llm --json mock 链路」)先在 `master`(`9adcf0f`)另开工作树取证:同名两条在 `master` 上同样失败(那边 51/53,用例总数不同是分支间用例增量所致),故按基线失败保留,不在本槽范围内。

计费面零改动:三条路径的 `Tasks.start`/`U.charge(1, …)`/`U.refund` 与 `billingAction: 'llm.agent'`、`operationId` 幂等口径一字未动,无新增计费动作。`node tests/e2e.js` 按仓库纪律未跑(需用户明确要求)。本槽不含合并、未开 PR。

## 8. 与并行分支的关系

本槽只在 W50 头部之上加三个键、动三处模板串开头与一处模块出口,预计冲突面:

- `js/prompts.js`:在 `REG` 末位追加三条。若并行槽也加键,取**并集**;条目相对次序只影响「全局默认值」页展示顺序,无行为面。
- `js/agent.js`:动的是新抽出的 `panelSystem` 与 `AC` 出口那一行。若并行槽改了面板 system 模板的协议半,合入后**面板整条逐字节对账的期望串要按实况重算**(它是逐字节钉的);若并行槽还在 `sendInner` 里改 `llmOpt.system`,注意那一行已变成 `system: panelSystem(p, ep, text)`。
- `js/agent-global.js` / `js/agent-ops.js`:各动 1 行模板开头(外加抽屉的出口一行)。同理,协议半有增删则对应期望串重算。
- `js/skills.js`:只动 SK-03 的 `prompts` 数组与 `note` 字符串。`prompts` 取并集;`note` 的仍欠段以**实况**为准折回(变异 6 会先红)。注意 `note` 里不得出现 `Store`/`window` 等环境句柄字面——`skills.js` 模块体有源级禁令,本槽因此把覆盖表写成「全局默认值页的覆盖表」。
- `README.md` / `docs/skills-wave/README.md`:提示词条数按合入后 `Prompts.list().length` 实计重算,单测用例数按实跑重算(`contract` 套件的数字对账会先红)。

## 9. 交接

1. **四处的协议半有意不收**(SK-03 仍欠的第一处):要收也只能连着改各自的解析口径——面板/抽屉那半连着 `AO.splitOps`/`applyOps`/`opRisk` 的分流与风险分级,预排那半连着 `PREARR_FIELDS` 与 `clampPrearrParams` 的钳制,单轮那半连着 `WfCore.agentNormalize` 的过滤;并且要给「用户把协议改坏」备一条兜底(现在没有——解析不出就是整轮无 ops)。属产品口径题,本槽不动。
2. **多轮三份没有 Node 第二消费点**(SK-03 仍欠的第二处):这不是欠工作量,是欠一个产品决定——headless 要不要有多轮对话。若要,新消费点按同键 `Prompts.get(键, promptOverrides)` 显式传表即可,注册表侧零改动。
3. **注册表之外的内联人设仍是大头**,且不在 SK-03 的 `covers` 口径内:浏览器侧的导演阐述、光影总控、剧本围读、拉片分析、配音导演、节拍拆解、发行文案,以及 `aiScriptDigest` 的四步、`js/plans.js` 的制作计划器,各写一份 system 半(G-13,W1 盘点第 7 条已登记)。本槽不动。
4. 三条路径的 user 半(面板的 `histBlock` + 分镜表快照 + 定位/引用/状态摘要、抽屉的 `buildGlobalUser`、预排的意图行)、`AO.stateBlock`/`focusBlock`/`answerQueries` 的注入内容、预排卡片与执行闭环,一字未动。
