# W203 · 助手自动发令跑得动 `expert.evolve`:停工位成立,拦在注册表 `manual` 位上

一句话结论:**停工位成立**。W199 基线上 `hujing agent "…" --pid X --apply`(与 MCP `hujing_agent` 的 `apply=true`
是同一段代码)把模型返回的 `{"op":"run","cmd":"expert.evolve"}` **逐条直跑,中间没有任何确认闸**——
回执 `ok:true`,`state.customExperts` 当场多出一份带「【进化条款 · …】」的副本,
persona 被**不可撤回地**改写,而没人点过一下。

拦法只落在**助手自动发令**的两条路,人手入口一律不动:注册表给 `expert.evolve` 加一个 `manual` 位,
判据 `WfCore.cmdManual` 一处、两端同读;`WfCore.agentNormalize` 不把 `manual` 命令放进 `ops`
(那份 `ops` 就是给调用方直跑的),被拦的命令名如实回 `manual` 交调用方转告用户;
浏览器自修复轮的重试白名单排掉 `manual` 命令(那一路是回执回喂后**直接发令**,不经 `U.confirm`)。
`exec expert.evolve` / 专家库「🧠 进化」按钮 / MCP `hujing_expert_evolve` 三个人手出口一字未改。

**基线**:`cursor/w199-integration-540b` 的 `825705a`(本尖**没有** W201 的 `Plans.execStep` 拦 evolve,
也**没有** W198 的 playbook `Skills.validate` 扫描;W197–W202 一支未取,`w198`/`w201` 一个提交都没 cherry-pick)。
**本槽分支**:`cursor/w203-agentops-evolve-manual-a458`。

## 1. 停工位原话与它指的东西

交接单点的是「`js/agent-ops.js` 的 `run` 类 op 能按命令名发命令」。这句话字面成立,
但它在**浏览器**与**headless**两端的成色完全不同,不分开量就会把停工位判错方向:

| 路径 | 谁把 LLM 输出变成执行 | 中间有没有人点一下 |
|---|---|---|
| 浏览器分集面板 / 全局抽屉,`agentAuto` 关 | 预览卡 → 用户点「应用修改」 | **有**(点一下就是确认) |
| 浏览器同上,`agentAuto` 开 | `js/agent.js:571`(全局抽屉 `js/agent-global.js:462`) | **有**——`exec` 级 run op 恒经 `U.confirm`「将按各功能规则扣费」,自动模式也不豁免 |
| 浏览器自修复轮 | `AgentOps.selfFixRound` 拿失败回执回喂一轮后**直接** `runEpisodeActions` | **没有** |
| `hujing agent … --apply` | `cli.js:1487` 的 `for (const op of d.ops)` 循环,逐条 `EXEC[op.cmd].run` | **没有** |
| MCP `hujing_agent`(`apply:true`) | 就是上面那条(`build` 拼 `['agent', …, '--apply']`) | **没有** |

所以停工位不是"浏览器面板没确认闸"——那儿有,而且分级审批那段(W143 之前就在)写得很清楚。
真正的口子在**没有工作台语境的那两条**:模型说跑什么就跑什么。

而 `expert.evolve` 恰恰是四端里唯一一条**注册表已经用中文写着「人手动作」的命令**——
`js/cmd-registry.js:83` 的注释、`server.js` 端点头注、`mcp.js` 工具描述、`README.md`、
`js/skills.js` SK-26 的记账正文,五处都写着「不要挂在任何流程收尾上自动跑」,
判据侧却只钉住了一件事:它**不进 playbook 的 `steps`**(`tests/unit.js` 两条反向断言)。
`steps` 那条路被堵死了,`ops` 这条路没人看着。

## 2. Live 举证(基线 `825705a` 现跑,只换 LLM 罐头,产品码一行没改)

跑法:`git archive HEAD` 出一棵干净树,只把 `MOCK_LLM` 的 agent 罐头换成「模型返回一条
`{"op":"run","cmd":"expert.evolve","args":{"expert":"ex_suspense"}}`」——这正是真实模型输出得出来的东西;
其余全真:真 `server.js` 子进程、真 `cli.js` 子进程、真 `/api/wf/agent` → 真 `/api/wf/evolve-expert`。
夹具:注册 → 建项目 → `memory add --scope 分镜` 落一条沉淀 → 全局雇佣预置专家 `ex_suspense`。

### 2.1 第一问:`run` 能不能下发 `expert.evolve` 并改到 persona——**能,且没经过 confirm**

```
$ hujing agent "把这个项目往下推一推" --pid p_… --apply
exit 0
ops     = [{"op":"run","cmd":"expert.evolve","args":{"expert":"ex_suspense"}},{"op":"run","cmd":"episode.preflight","args":{}}]
applied = [{"cmd":"expert.evolve","ok":true,"status":"done","result":{
             "expertId":"cx_mtd2d06x…","name":"冷峻悬疑导演·我的","from":"ex_suspense",
             "boards":["导演","剧本","主体","分集","分镜","生成","审片","成片"],
             "clauses":["mock 条款:先定人物关系再定形象"],"changed":true,"derived":true,"evolutions":1}}, …]

进化前 customExperts = []
进化后 customExperts = [{"id":"cx_mtd2d06x…","from":"ex_suspense",
                        "personaTail":"…优先用细节与氛围而非台词推进剧情。\n【进化条款 · 2026/8/28】\n- mock 条款:先定人物关系再定形象"}]
```

`ok:true`、`changed:true`、副本入库、条款进 `persona`。整条链路上**没有任何一处问过人**。
`agentNormalize` 放它过是因为白名单只判「`cmd` 在 `CmdRegistry.byName` 里」;
`cli.js` 的 apply 循环只判 `needs`(`expert.evolve` 的 `needs` 是空数组,连 `--epid` 都不要),
然后就 `cmd.run(args, f)` 了。计费面 `MOCK_LLM` 下不走,真机上这是一笔 `llm.evolve`(1 积分)。

### 2.2 第二问:与人手点「进化」是不是同一入口——**是同一条链路,同一个落点**

`applied` 那条走的是 `EXEC['expert.evolve']` → `POST /api/wf/evolve-expert`,
与用户自己敲 `hujing exec expert.evolve --expert X`、MCP `hujing_expert_evolve`、
浏览器专家库「🧠 进化」按钮(`Experts.evolveExpert`,同一份 `WfCore` 蒸馏四步)**是同一个落点**。
同一次会话里紧接着人手发一条,回的是 `changed:false`——因为条款刚被助手那一发写进去了,已无新增。
这一条决定了拦法:**不能在 `exec`/端点/按钮上拦**,那会连人手入口一起砍掉(变异 M6 量的就是这一手)。

### 2.3 第三问:基线会不会已经拒绝、或者 `run` 只是转发到必须确认的 UI——**都不是**

- 没有拒绝:上面 `ok:true`,`state` 真被改了。
- 不是"转发到 UI":`--apply` 这条路上压根没有 UI。浏览器那条确实是转发到确认弹窗(§1 表),
  但它与 headless 是两段代码,`--apply` 不经过 `js/agent.js` 一行。

**停工位成立**,且成立的只有 headless 自动发令那一面 + 浏览器自修复轮那一面;浏览器主路不成立,故不动。

## 3. 改法:拦在哪、为什么拦在这里

### 3.1 注册表加 `manual` 位(`js/cmd-registry.js` +5 −2)

```js
name: 'expert.evolve', label: '专家自进化', risk: 'exec', needs: [], manual: true,
```

字段名就是 `manual`(交接单点名的那个),全仓只有这一个字段名、只有 `WfCore.cmdManual` 一处判据——
`tests/unit.js` 有一条正面扫 `js/cmd-registry.js`、`js/wf-core.js`、`js/agent-ops.js`、`js/commands.js`、
`server.js`、`cli.js`、`mcp.js` 七个文件,出现 `manualOnly`/`humanOnly`/另起一个 `isManualCmd =` 就红。

有意**没有**做的:不从 `cmds` 里删 `expert.evolve`(那是砍功能不是拦自动发令,另有断言反向钉住)、
不碰 `js/plans.js` 的 `execStep`(W201 的地)、不复制一份 playbook `steps` 扫描(W198 的地)、
不实现自动蒸馏、不拆 `gaps()` 键、`G-11` 与 `G9`/`emptySubjectImageNote` 一个字没动、
`GUARD_TOPICS` 一条不登记。

### 3.2 判据一处:`WfCore.cmdManual`(`js/wf-core.js` +20 −3)

```js
W.cmdManual = function (byName, cmd) {
  return !!(((byName || {})[String(cmd || '').trim()]) || {}).manual;
};
```

两个消费点都读它,谁也不另列一份人手命令名单:

1. **`W.agentNormalize`**——`/api/wf/agent` 出的 `ops` 就是给调用方**自动**执行的,故 `manual` 命令
   在这里就不进 `ops`,被拦的命令名去重后回在新键 `manual` 上。**不静默吞**:调用方(`cli.js` 原样回传
   整个响应体,零改动)据此照实告诉用户「这一步得你自己来」。变异 M3 量的就是"拦了但不说"。
2. **`AgentOps.selfFixRound` 的重试面**(`js/agent-ops.js` +12 −5)——白名单原本只判「这条命令在回执里
   失败过」,人手动作照样能被自动重发第二次。人点过一次「确认执行」不等于授权自修复轮再自动发一次,
   何况蒸馏无撤回口。被拦的照实写进 `🩹 自修复` 摘要。

`W.agentCmdProtocol` 顺带在命令白名单文本里把这类命令标出来(`,人手动作:只能由用户自己发起,不要输出为 ops`),
省掉一轮"模型发了 → 必被拦下"的空转;这只是省一轮,真发了照样拦。
`Commands.list()` 补出 `manual` 位(`js/commands.js` +2 −2),让浏览器那份协议文本与拦截判据同读注册表这一份。

### 3.3 人手入口逐个复核:一条没动

| 入口 | 本槽 diff |
|---|---|
| 浏览器专家库「🧠 进化」`Experts.evolveExpert` | `js/experts.js` **零 diff** |
| CLI `exec expert.evolve --expert X` | `cli.js` **零 diff**(`EXEC['expert.evolve']` 原样) |
| MCP `hujing_expert_evolve` | 只有 `hujing_agent` 那条工具描述改了一句,本工具零改 |
| 服务端 `/api/wf/evolve-expert` | 端点体**零 diff**(只有 `/api/wf/agent` 多回一个 `manual` 键、`mockKind` 那行多传 `mockText`) |

单元里有一条正面钉这张表(`cli.js`/`js/experts.js` 里不许出现 `cmdManual`、evolve 端点段不许出现该判据),
变异 M6「顺手把人手出口也拦了」当场红 1(unit)+ 红 5(cli.smoke 的 exec 段五条全倒)。

### 3.4 顺带:`MOCK_LLM` 的 agent 罐头(`server.js` +16 −3)

原罐头恒回 `ops: []`,`ops` 通道在集成测试里**一条都打不到**——怎么改都是绿的。
改成「按指令原文里点名的领域命令出 `run` 类 ops,命令名后可跟内联 JSON 当 `args`」
(与拆集罐头用 `mockText` 现造锚点同形),端点这才测得住。只在 `MOCK_LLM` 下生效。

## 4. 判据(unit +7 / integration +3 / cli.smoke 一条不加)

unit(`agent-ops` 套件 47 → **54**):

| 用例 | 钉的那一面 |
|---|---|
| 人手动作位:`manual` 只挂在 `expert.evolve` 上,且全仓只有这一个字段名 | 字段名唯一、名单唯一 |
| `WfCore.cmdManual`:判据双端唯一一份,未注册命令/空入参不误伤 | 判据本身(含 `episode.produce` 反例:不许一刀切拦编排) |
| `agentNormalize`:拦下人手动作、同批普通命令照过、被拦的如实回 `manual` | 拦 / 不误伤 / 不静默 三面 |
| `agentCmdProtocol`:人手动作照实标注 | 协议文本只标真带 `manual` 的那条 |
| `Commands.list()`:带 `manual` 位 | 浏览器那份与注册表同源 |
| `selfFixRound`:人手动作不进自动重发,摘要照实交还 | 第二条自动路 |
| 人手入口一条没动 | `exec`/按钮/MCP/evolve 端点四处反向钉住 |

integration(143 → **147**,新增 4 条中 1 条是夹具就位):真 `server.js` 子进程 + HTTP,
先把夹具退回"这一发进化真能跑成"的状态(预置专家已雇、板块有沉淀、尚未派生副本,否则第三条会是恒真句),
再 `POST /api/wf/agent`(指令里同时点名 `episode.preflight` 与 `expert.evolve{...}`),
最后**把端点出的 `ops` 原样逐条直跑一遍**(`--apply` 做的就是这件事)再看 `state`。

cli.smoke:**一条不加**,分母仍是 **108**,实跑 **106/108**,两条失败仍是
`未登录 whoami → exit 3` 与 `llm --json mock 链路`(基线同名同表现)。
人手入口那一面本来就由它的 `exec expert.evolve` 五条守着(M6 实测五条全倒),不必再加。

## 5. 变异抽查(八手,逐手实跑;每手都还原后再跑下一手)

| # | 改法 | 读数 |
|---|---|---|
| M1 | 摘掉注册表 `manual: true` | unit **红 6**(注册表 / 判据 / normalize / 协议文本 / `Commands.list` / selfFix 各点各的) |
| M2 | `agentNormalize` 退回基线(不拦) | unit **红 1**、integration **红 3**——第三条把 persona 真被改写这件事在测试里复现出来了:`["cx_…:026/8/28】\n- mock 条款:先定人物关系再定形象"]` |
| M3 | 拦了但静默吞(不回 `manual`) | unit **红 1**、integration **红 1**(都点名"不静默吞掉") |
| M4 | 一刀切:`ops` 通道整个关掉 | unit **红 1**、integration **红 2**(`episode.preflight` 被误伤,`manual` 里多出它) |
| M5 | 自修复轮的重试不排人手动作 | unit **红 1**(`__retried` 里多出 `expert.evolve`) |
| M6 | 顺手把人手出口也拦了(`cli.js` 的 `EXEC` 里加判据) | unit **红 1** + cli.smoke **红 5**(缺参 / 不存在 / 闸一 / 按名进化 / 副本落库五条全倒) |
| M7 | `Commands.list()` 不带 `manual` 位 | unit **红 1**(浏览器那份与注册表脱钩) |
| M8 | 字段改名 `manualOnly`(另起第二份口径) | unit **红 2** |

M4 与 M6 是有意做的两个**反方向**变异:一个量"拦过头"(把整条 `ops` 通道关掉),
一个量"拦错地方"(连人手入口一起砍)。两头都红,拦的范围才算被钉住。

## 6. 数字(全部 live 现取)

| 套件 | 基线 `825705a` | 本槽 | 备注 |
|---|---|---|---|
| unit | 602/602 | **609/609** | `agent-ops` 47 → 54,`contract` 132 未动 |
| integration | 143/143 | **147/147** | 新增 4 条(含 1 条夹具就位) |
| cli.smoke | 106/108 | **106/108** | 分母未动,实跑复核,两条失败同名同表现 |
| 记账件份数 | 212 | **213**(含本文) | 目录 / 索引表 / README 明写三方对齐 |
| `GUARD_TOPICS` / `TOPIC_FLOOR` / 花名册 | 19 / 19 / 19 | **19 / 19 / 19** | 一条不登记 |
| `Skills.gaps()` 键集 | 20 键 | **20 键** | 一个不拆,`G-11` 与基线逐字节相同 |
| 领域命令数 | 13 | **13** | 只加字段不加命令 |

下限棘轮按 live 抬:单元 602 → 609、集成 143 → 147、记账件 212 → 213;`CLI 冒烟` 108 与 `TOPIC_FLOOR` 19 未动。

产品面 diff:`js/wf-core.js` +20 −3、`js/agent-ops.js` +12 −5、`server.js` +16 −3、`js/cmd-registry.js` +5 −2、
`js/commands.js` +2 −2、`mcp.js` +1 −1;文档 `README.md` +5 −5;测试 `tests/unit.js` +88 −2、`tests/integration.js` +33 −0。

## 7. 与在飞两支的冲突面(W198 / W201)

| 文件 | 会不会撞 | 说明 |
|---|---|---|
| `js/cmd-registry.js` | **会**,且是本槽唯一的实质冲突面 | 三支都可能给 `expert.evolve` 加同一个 `manual: true`。字段名按交接单统一成 `manual`,故合起来是**同一行**;真冲突的只会是那段中文注释(本槽写的是"助手自动发令路径不得跑它"、W201 那边多半写"编排步不得跑它")。合入时取并集把两句都留住即可,别删任何一侧的落点说明 |
| `js/plans.js` | 不会 | 本槽**一行没碰**(`execStep` 是 W201 的地) |
| `js/skills.js` | 不会 | 本槽一行没碰,没有第二份 playbook `steps` 扫描,`Skills.validate` 一处未动 |
| `js/wf-core.js` | 大概率不会 | `cmdManual` 与 `agentNormalize` 都在 Agent 单轮那一段;W198/W201 若要判 `manual`,应当**改成调用 `W.cmdManual`** 而不是各写一份 |
| `tests/unit.js` | **会**(老地方) | 三个 `FLOOR` 字面 + 各自在套件数组尾部追加用例。合入时按老规矩:数字按合完 live 实跑重定,用例块取并集时补回收口那一行 |
| `README.md` / `docs/skills-wave/README.md` | **会** | 用例数长行、索引份数、索引表新行。份数一律按合完实况数,不抄任一支自称 |

`cli.js` / `js/experts.js` / `js/plans.js` / `js/skills.js` 本槽零 diff,与两支不产生交集。

## 8. 仍欠(如实交接,本槽不做)

1. **`G-11` 的自动蒸馏面照旧无出口**——本槽做的是反方向:把"没人点也能蒸馏"这条**意外**通路关上。
   什么条件下该自动进化、蒸馏结果无撤回口怎么兜,仍是未定的产品口径,`gaps()` 一个键不拆、`G-11` 不装清。
2. **`manual` 目前只有 `expert.evolve` 一条**。别的"改了收不回"的动作(如整表覆盖类)要不要一并挂上,
   本槽不替产品决定;判据是通用的,加一条只需在注册表挂位。
3. **浏览器主路照旧靠 `U.confirm`**,没有走 `manual` 这一层。那儿人是真点了一下,本槽按"最小改动"不改;
   若日后要让人手动作在浏览器上也有更强的二次确认(比如打字确认),那是另一格。
4. **外部编排方**若不经 `cli.js`、直接打 `/api/wf/agent` 再自己执行,拦它的是端点这一层(`ops` 里就没有);
   但如果它绕过端点自己拼 `ops` 去打 `exec`,那已经等同于人手发令,判据管不到也不该管。
