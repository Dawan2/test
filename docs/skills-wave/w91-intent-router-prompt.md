# W91 · 意图路由步内联人设收编:`agent.routeSystem` 进注册表 + 取值口在调用点现取

> 基线 `origin/cursor/w85-integration-171f @ 2a05c72`,落地分支 `cursor/w91-intent-router-prompt-6ea6`。未合并 W83–W90。
> 收编的是 W88 盘点点名的那一处:`js/agent-global.js` 全局抽屉「🐋 意图路由」辅助步(`routeIntent`)的人设句。
> 只碰 `js/prompts.js`(+1 条注册)、`js/agent-global.js`(1 处装配式)、`js/skills.js`(SK-03 一条内部)、
> `tests/unit.js`(+1 夹具 +2 用例 + 三张全仓名单的期望值)、两份 README 的数字与描述。
> `js/agent.js` / `js/agent-ops.js` / `js/experts-data.js` / `server.js` / `cli.js` / `mcp.js` 一行未碰,
> 不抬发布门、不新增计费动作、未删测。

## 1. 先 grep 核实处数:这个文件到底有几处内联人设

任务点名"约第 74 行局部 `const sys = \`你是意图路由器…\`` 被旧 `system: '你是` 口径漏计",**点名先核过再动手**:

```
$ rg -n "你是" js/agent-global.js
62:    return `\n★ 全局任务上下文:\n${lines.join('\n')}\n你是虎鲸,元Agent,掌握以上全局上下文,可回答进度类问题并调度板块专家。`;
74:    const sys = `你是意图路由器。以下是短剧创作流水线的各板块及其职责:\n${list}\n`
$ rg -n "system:" js/agent-global.js
81:      const out = await API.chatJSON({ model, system: sys, ...   ← 上面那个 sys
389:          system: buildGlobalPrompt(ctx) + (AC.gBoard ? `\n你当前作为「…」板块的…` : orcaGlobalCtx(ctx.p)) + …
556:    return `${Prompts.get('agent.drawerSystem')}…                ← 已在注册表(W51)
```

`你是` 两处命中,**本槽的收编面是第 74 行那一处**,原文逐字节 `你是意图路由器。`。旧口径 `system: '你是` 漏计它的原因很具体:这一步的 system 不是对象字面量里的一个字符串值,而是**局部 `const sys` 接一串模板拼接**,再在下一行以 `system: sys` 传进 `API.chatJSON`——三张全仓名单里判据最宽的那张(W81 立的三形态扫描,含 `const X = \`你是`)一直数着它,只有散文里那句旧 grep 漏了。

第 62 行那句**有意不收**,理由不是"它不像人设",而是它与第 389 行那句是**同一个三元的两支**:

```js
system: buildGlobalPrompt(ctx)                                    // 人设句已是 Prompts.get('agent.drawerSystem')
  + (AC.gBoard ? `\n你当前作为「${…}」板块的${…}与用户协作,聚焦:${…}。…`  // 锁定板块时的框定语
               : orcaGlobalCtx(ctx.p))                            // 未锁定时:全局任务上下文块 + 块尾那句
  + AC.gPersonaBlock() + AC.memBlock(…) + AO.queryProtocol(),
```

| 命中 | 是什么 | 为什么不收 |
|---|---|---|
| `js/agent-global.js:74` | `routeIntent` 发给 LLM 的 system 前半 | **本槽收这一处** |
| `js/agent-global.js:62` | `orcaGlobalCtx` 返回块的**块尾**一句(前面是按 `AGENT_BOARDS` 与 `p.episodes` 现算的板块状态/流水线统计) | 它是上下文块的框定语、不是这一步的人设:抽屉的人设句已经是 `agent.drawerSystem`(第 556 行),这一句是"以上这些数据是你的全局上下文"的收尾。收它就得连同它引用的那段现算数据一起定位,而那段数据的唯一来源是板块表与项目实况 |
| `js/agent-global.js:389`(同三元的另一支) | 锁定板块时的框定语,措辞不以 `你是` 开头 | 同上,且与第 62 行**对称**:收一支不收另一支等于让"未锁定板块"这条路可覆盖、"锁定板块"那条不可覆盖 |

这两句连同 ops 协议半一起归**装配面、不开放覆盖**——与该文件第 547 行原有那条注释(「人设句取注册表 `agent.drawerSystem`,其后的字段面/ops 协议/返回 JSON 约定仍在此拼,不开放覆盖」)同一口径。用例里为它们各配了一条正查(两句仍留在装配口)与一条反查(注册表里不得出现 `元Agent` / `你当前作为` 字面),不是靠散文声明。

**所以本槽处数:收编 1 处,收完该文件零内联人设**(三张名单的判据下都是 0,连"引号紧跟你是"这种最宽的口径也是 0)。

## 2. 独立键,键名取 `agent.routeSystem`

```js
{
  /* 全局抽屉的意图路由辅助步(step:'route'):只收人设句——板块清单由取值口按 AGENT_BOARDS 现拼
   * (板块表是单源,不做成提示词副本),判据句与 {"board","reason"} 返回契约仍留在装配口、不开放覆盖
   * (board 只能取板块 key,改坏即整轮路由解析不出板块)。 */
  key: 'agent.routeSystem', name: 'Agent 意图路由 · 系统人设', vars: [],
  def: '你是意图路由器。',
},
```

- **独立键而不复用**:按 W56 立的三条判据(字面同 / 角色同 / 产物落点同)与既有 29 条**一条都不成立**。最近的一族是 `agent.*` 那四条,但它们全是「虎鲸导演助手」在四种运行模式下**作答**的人设,而这一条的角色是**只判归属不作答**:产物是 `{board, reason}` 一个板块 key,消费点是 `AGENT_BOARDS.find(x => x.key === out.board)` 之后的会话转交,连回复都不产出。用例正查这一条:`def === '你是意图路由器。'` 在注册表里**恰好命中一条**,且逐条比过与 `agent.system`/`panelSystem`/`drawerSystem`/`previsSystem` 都不同字面(合并当场红)。
- **键名前缀取 `agent`**:这一步就住在抽屉那一路上、与 `agent.drawerSystem` 是同一条消息的两个 LLM 步(共用 `operationId`,只扣一次费),放进 `agent.*` 一族读起来才对得上运行流程;后缀取 `routeSystem` 而不是 `intentSystem`,因为源码里这一步的槽位名就是 `step: 'route'`,键名与计费槽位同名便于对账。
- **`vars` 为空、走 `Prompts.get`**:这一步不做变量替换(板块清单是模板字符串插的 `${list}`,不经 `Prompts.fill`,见 §3)。

**注册顺序**:插在 `agent.drawerSystem` 之后、`agent.previsSystem` 之前——注册表顺序就是「偏好学习 → 全局默认值 → 核心提示词 skill」页面上的排列,抽屉那一路读起来是「主回复人设 → 它的路由辅助步 → 抽屉的另一种运行模式(预排)」。两条断言钉住(紧接 `agent.drawerSystem` 之后 + 在 `agent.previsSystem` 之前),免得后续槽随手插到末尾静默改掉页面排列。

## 3. 收编面切在哪一刀:一条 system 串四段,只收第一段

这一步的 system 是四段拼的,收编只收第一段:

| 段 | 原文 | 处置 | 为什么 |
|---|---|---|---|
| 人设句 | `你是意图路由器。` | **进注册表** | 措辞好坏属人设面,改坏只是"路由准头差一点" |
| 板块清单 | `以下是短剧创作流水线的各板块及其职责:\n${list}\n`(`list` 由 `AGENT_BOARDS.map` 现拼,含板块 key/子Agent 名/职责/该板块雇佣的专家) | **留在取值口现拼** | 板块表的唯一来源是 `AGENT_BOARDS`;做成覆盖面等于允许用户在提示词里存一份**过期板块表**,而板块 key 正是下一步 `find` 的匹配键——板块改名后这份副本会让路由整轮命不中。与 W2 收 KB 单源、W82 不收 KB 摘要尾同一条纪律 |
| 判据句 | `判断用户本条消息最想交给哪个板块处理(…;进度查询/闲聊/跨板块综合问题返回 null)。` | **留在装配口** | 它夹在"板块清单"与"返回契约"之间,且句内的 `null` 语义与契约半的 `board` 取值面是一对。要开放它就得把上一段的板块清单做成 `{boards}` 变量、走 `Prompts.fill`——那会把这一条从注册表里 29/30 条"纯人设句 + `Prompts.get`"的形状里拆出去,换来的可覆盖面还是得把契约句留在外面 |
| 返回契约 | `只返回 JSON {"board":"板块key 或 null","reason":"≤20字"},board 只能是以上板块 key 之一或 null。` | **留在装配口,不开放覆盖** | 用户把 `board`/`reason` 任一字段名改一个字,那一轮就是"路由解析不出板块"整轮失效(`catch` 里静默跳过、退回原流程),不是效果差一点 |

**"契约半不开放"是正查的**:注册表里不得出现 `"board"` / `"reason"` / `≤20字` / `板块 key 之一或 null` 四个字面(四条断言逐个点名),另有一条钉住板块清单的引导句也不在注册表里。改完的取值口:

```js
// 人设句取注册表(在调用点现取,浏览器隐式读 Store 覆盖表;模块加载时求值会把覆盖表冻在加载那一刻)
const sys = Prompts.get('agent.routeSystem')
  + `以下是短剧创作流水线的各板块及其职责:\n${list}\n`
  + `判断用户本条消息最想交给哪个板块处理(…)。`
  + `只返回 JSON {"board":"板块key 或 null","reason":"≤20字"},board 只能是以上板块 key 之一或 null。`;
```

缺省装配整条**逐字节等于收编前**(把两侧的 `sys` 表达式各自求值后 `===` 比过,见 §6)。

## 4. 求值时机:在调用点现取,不提模块顶层常量

与 W88 收 `FORGE_SYS` 同一条纪律。`Prompts.get` 是**求值那一刻**读 `Store.state.settings.promptOverrides`,所以取值口写在哪一层决定用户的覆盖什么时候生效:

| 写法 | 后果 |
|---|---|
| `const sys = Prompts.get(键) + …`(**本槽**,在 `routeIntent` 函数体内) | 每次路由现取一遍;用户在「全局默认值」页改完,下一条消息就吃到 |
| `const ROUTE_SYS = Prompts.get(键)`(IIFE 顶层) | 覆盖表被冻在**脚本加载那一刻**;用户改完得刷新页面才生效,而页面上没有任何提示 |

这一处本来就是函数内的局部 `const`,收编时**不动它的层级**就天然满足;但"不动"是要靠断言留住的,否则下一个人为"省一次取值"很容易把它提到顶层(那一步看起来只是常量提取)。用例配了两条:反查 IIFE 顶层不得有 `const X = Prompts.get('agent.routeSystem')`、正查取值口落在 `async function routeIntent(` 之后的函数体内。变异 8 实测这两条都咬住。

## 5. 取值口:纯浏览器链路,不存在第二端

意图路由只在浏览器抽屉的发送流程里(`sendGInner` → `routeIntent`),`server.js` / `cli.js` / `mcp.js` 都没有对端(不在 `/api/wf/*` 六个端点里,也不在领域命令注册表里)。所以与 W71/W81/W82 同口径:

- 取值口只有 `Prompts.get('agent.routeSystem')` 一处(用例钉住本文件里**恰好 1 个**取用口),浏览器隐式读 `Store.state.settings.promptOverrides`。
- 断言写成**不许长出第二端**:三个 Node 端里不得出现 `你是意图路由器` 与 `板块 key 之一或 null` 两个锚点。
- 收编解决的是"**可覆盖**",不解决"可 headless"——如实写进 README、SK-03 的 `note` 与本件,不含糊成"这一步已双端单源"。

## 6. 行为面怎么做出来的,以及它钉不住什么

`routeIntent` 是 IIFE 内的私有 `async` 函数,不在 `window.AgentG` 出口上,唯一触发路径是抽屉的发送流程(要真 DOM 抽屉 + `API.isReady()` + 一整条 `Understanding.chatJSONRobust` 往返)。所以行为面沿用 W78 `beatSystemOf` 那个形态:**按源码原文取出那一段装配式,在装好注册表的沙箱里求值**。

```js
function routeSystemOf(ov, list) {
  const m = src.match(/\n\s*const sys = ([\s\S]+?);\n\s*const recent = /);   // 位置变了要同步本夹具
  …  loadFile(sb, 'prompts.js');  sb.list = list;                            // 板块清单以夹具串代入
  return vm.runInContext('(' + m[1] + ')', sb);
}
```

被求值的就是生产源码那几行,所以"缺省逐字节"与"覆盖只换人设句"两件事是真跑出来的,不是拿注册表自己对自己。**钉不住的那一层如实记在这里**:这个形态证明不了"这条 `sys` 真的被交给了 `API.chatJSON`"。那一面由源级配对断言补——`const sys = Prompts.get('agent.routeSystem')` 之后 1200 字内必须出现 `step: 'route'`(这一步的计费槽位名),键挪到别的调用点即红。两条合起来覆盖的面与"真跑一遍截获 system"等价;真发一次请求那一层归 `tests/e2e.js`。

## 7. 三张全仓名单:逐张按 live 重算

基线上有三张判据互不相同的全仓名单(W85 §4.4 记过它们的口径差),`js/agent-global.js` 在**三张上都记 1 处**,收编后三张都得减:

| 名单(判据) | 收编前 | 收编后 |
|---|---|---|
| W81 那张:三形态扫描(`system:` 值位 / 具名常量 / 直接 `return`),排除注册表 | 8 文件 10 处 | **7 文件 9 处**(`js/agent-global.js` 整条消失) |
| W78 那张 `inlinePersonaHolders()`:`system:`/`content:`/`=` 后紧跟 `你是` | 8 文件 11 处 | **7 文件 10 处** |
| W79 那张普查:全部 `['"\`]你是` 字面,**含**注册表 `def` 与专家人设库 | 13 文件 59 处(`js/prompts.js:28`) | **12 文件 59 处**(`js/prompts.js:29`) |

第三张的总数**不变**是对的、也是它这个口径的特点:它数的是"人设字面散在几个文件里",收编不是消掉一处而是把一处从模块**搬进注册表**,所以 `js/agent-global.js:1` 消失的同时 `js/prompts.js` 从 28 变 29。这一点值得写下来——照前两张的经验去"总数应该少 1"就会把这张改错。

另外,`js/prompts.js:29` 与 `Prompts.list().length === 30` 差 1 也不是漏了谁:`sb.reviewUser` 是评审指令、不以 `你是` 开头。

三张都是**期望串逐字节**的断言,所以少减、多减、挪到别的文件都当场红(变异 9/10 两向实测)。W82 立的那条"注册表每条 `def` 的字面持有者恰好只有 `js/prompts.js`"按 `Prompts.list()` 现推,新键自动进名单,不必再写第四张。

## 8. 记账:键登记在 SK-03,`note` 点名落点与求值时机

**键登记落在 SK-03(`core.personaCtx`)**,判据同 W71/W82:契约测试要求注册表每个 key 都被某条 skill 的 `prompts` 引用,而这一步不属于任何一条 skill 自己的登记面(短名单 30 条里没有"意图路由"这个条目;它是抽屉那一路的辅助步),SK-03 是人设通道的记账宿主且已收着十来条只有浏览器一个消费点的键。

`note` 在"已落地"那半追加,**`仍欠` 段一字未动**(那段说的是四处装配口的 ops 协议半有意不开放,与本槽无关):

```
全局抽屉的意图路由辅助步(js/agent-global.js 的 routeIntent,step:route)人设句同形收编为 agent.routeSystem,
取值口在函数体内经 Prompts.get 现取(写成模块顶层常量会把覆盖表冻在加载那一刻),
板块清单按 AGENT_BOARDS 现拼、判据句与 {"board","reason"} 返回契约仍留在装配口不开放覆盖;
js/agent-global.js 至此零内联人设(该文件另有两句上下文框定语不在本判据内:
全局任务上下文块尾那句与板块协作那句都是随实况现拼的装配半,与 ops 协议同不开放覆盖)。
```

点名三件并各有断言钉住(只写"同形收编了"过不了,变异 11 实测):**键**、**取值口所在文件 + 该文件零内联**、**为什么在调用点现取**(`note` 须含 `冻` 或 `加载那一刻`)。

**`gaps` 一字未动**:`G-13` 治的是"大量模块内联提示词未进注册表",本槽收一处、缺口没闭合,按 W36 立的关联索引口径(落地一面不摘标记),`Skills.gaps()` 键数 20 与 `G-13` 的六条值逐字节不变,并有断言钉住。**没顺手动的**:SK-10 / SK-11 的 `note` 与仍欠段(它们点名的是别的文件,本槽一处没碰,那些锚点仍是真话,且它们正好是本槽"不收其它文件"的边界守卫,变异 9 实测)。

## 9. 用例改动(新增 1 夹具 + 2 条用例,未删测、未改既有断言的判据)

两条都落在 `contract` 套件,紧跟 W51 那条「浏览器多轮三份人设」(同为 `agent.*` 一族):

| 用例 | 钉住的事 |
|---|---|
| **新增** 行为面 `Agent 意图路由人设:独立键 agent.routeSystem 取值,缺省装配逐字节等于收编前的内联字面` | ① 缺省 `Prompts.get` 逐字节等于 `你是意图路由器。`;② 沙箱求值生产源码那段装配式,**整条逐字节等于收编前**(板块清单/判据句/返回契约都在内);③ 注册表条目形状(无变量、条目名带「Agent 意图路由」与「系统人设」);④ 该句**恰好命中注册表一条**,且逐条比过与 `agent.*` 四条都不同字面;⑤ 覆盖只换人设句——`覆盖值 + 其后三段` 逐字节等于预期;⑥ 覆盖不串台:写这一条时 `agent.*` 四条逐字节不动;⑦ 契约半四个字面 + 板块清单引导句一个不进注册表;⑧ 注册顺序紧接 `agent.drawerSystem` 之后、在 `agent.previsSystem` 之前 |
| **新增** 源级 `Agent 意图路由人设(源级):js/agent-global.js 零内联,取值口在调用点现取,三张全仓名单同步减一处` | ① 取值口与 `step: 'route'` 槽位**配对**(键挪到别的调用点即红);② 本文件该键**恰好 1 个**取用口;③ 取值口不得提到 IIFE 顶层常量、且落在 `routeIntent` 函数体内;④ 返回契约与判据句仍在源码里、板块清单仍按 `AGENT_BOARDS` 现拼;⑤ 三形态判据与"引号紧跟你是"两种口径下本文件**都为 0**;⑥ 两句上下文框定语仍留在装配口、且注册表里不得出现它们;⑦ 三个 Node 端不得长出第二份;⑧ `js/agent-global.js` 退出 `inlinePersonaHolders()`;⑨ SK-03 登记该键、`note` 点名键/文件/零内联/求值时机;⑩ `gaps()` 键数 20 与 `G-13` 六条值逐字节不变;⑪ `Skills.validate({ Prompts })` 通过 |

三张名单的期望值按 §7 现跑重算后改在**原用例**上(判据一字未改,只改期望串与两个计数)。

## 10. 变异实测

十一条变异逐一施加、跑 `node tests/unit.js` 后 `git checkout -- .` 复原(复原后 445/445,`git status` 干净):

| 变异 | 实测行为 | 转红 |
|---|---|---|
| 1 `js/agent-global.js` 改回内联字面 | 收编退回收编之前 | **6 条**(本槽行为面 + 本槽源级 + 三张名单那三条 + W82 的 def 持有者名单) |
| 2 注册表 `def` 改一个字(路由器→分派器) | 缺省不再逐字节相同 | 1 条(行为面) |
| 3 取值口改成 `Prompts.get(键, {})`(不读覆盖表) | 进表了但用户改不到 | 2 条(行为面看覆盖跟不跟随、源级看取值口写法) |
| 4 摘掉 SK-03 的键登记 | 新键不进索引、记账对不上账 | 2 条(四类单源键全覆盖 + 源级) |
| 5 在 `js/beatboard.js` 抄一份该 `def` 字面 | 别处多出第二份人设句(原取值口仍走注册表) | 1 条(W82 那条全仓 def 名单) |
| 6 键从 `agent.drawerSystem` 之后挪到注册表末尾 | 「全局默认值」页排列被静默改掉 | 1 条(行为面的顺序断言) |
| 7 把 `{"board","reason"}` 返回契约并进 `def` | 契约半被开放,用户改坏即整轮路由失效 | 1 条(行为面) |
| 8 取值口提到 IIFE 顶层常量 `ROUTE_SYS` | 覆盖表被冻在加载那一刻 | 2 条(行为面的夹具求值 + 源级的两条时机断言) |
| 9 **反向**:顺手把 `js/role-editor.js` 那一处也收了 | 越过本槽口径 | 3 条(三张名单那三条各自的期望串) |
| 10 三张名单只减两张(`inlinePersonaHolders()` 那张照旧写回 `js/agent-global.js:1`) | 收编了但账没做平 | 1 条(那张名单自己的用例) |
| 11 SK-03 的 `note` 只写"同形收编了"、不点名 | 记账交账不到位 | 1 条(源级第 ⑨ 项) |

几处值得说明的:

- **变异 1 红 6 条而不是 2 条**,是三张名单口径不同带来的有意重叠:改回内联后 `js/agent-global.js` 同时回到三张名单上,而三张分别住在 W78/W79/W81 三条别人家的用例里。这也是"收编一处要动三个地方"的成本来源,写在这里免得下一个人以为其中两条是误报。
- **变异 2 与变异 3 互补而不重叠**:改 `def` 只红行为面(取值口没问题),改取值口写法则行为面与源级各红一条——注册表本身没被动过时,能拦住"取值口退化"的只有源级。
- **变异 8 连带红了行为面**,是夹具形态的副作用:`sys` 装配式里只剩 `ROUTE_SYS` 这个自由变量,沙箱里求值直接 `ReferenceError`。它红得对(顶层常量这件事确实被拦住了),但**真正为这件事写的断言是源级那两条**——不要指望夹具那一层去守时机。
- **变异 9/10 是那三张名单的两向守卫**:数少了(有人偷偷收编不改账)与数多了(有人新写内联)都拦得住;变异 9 先红的是**别人家**的记账,与 W82 变异 10 同一个道理。
- **变异 7 只红一条**是断言次序的结果:契约并进 `def` 后第 ① 项(缺省逐字节)先炸,第 ⑦ 项(契约不进注册表)当轮没跑到。第 ⑦ 项拦的是"另开一条键放契约"那种"看起来很规整"的开法,与第 ① 项不重叠。

## 11. 复核方式

```
git checkout cursor/w91-intent-router-prompt-6ea6
node --check js/prompts.js js/agent-global.js js/skills.js tests/unit.js   # 通过
node tests/unit.js          # 445/445 PASS(基线 443,新增 2 条用例)
node tests/unit.js contract # 77/77 PASS(基线 75)
node tests/integration.js   # 126/126 PASS(与基线同:本槽未碰 server.js 与任何端点)
node tests/cli.smoke.js     # 95/97;两处失败「未登录 whoami」「llm --json mock 链路」与 master 同名同数
node -e "const P=require('./js/prompts.js'),S=require('./js/skills.js');
console.log(P.list().length, JSON.stringify(P.get('agent.routeSystem')));
console.log(S.byId('core.personaCtx').prompts.slice(-1)[0], '|', JSON.stringify(S.validate({Prompts:P})), '|', Object.keys(S.gaps()).length);"
# 30 "你是意图路由器。"
# agent.routeSystem | [] | 20
```

`node tests/e2e.js` 按仓库纪律未跑(需用户明确要求)。本槽不含合并、未开 PR。

## 12. 与并行分支的关系

W83–W90 未合并。改动面:`js/prompts.js`(在 `agent.drawerSystem` 与 `agent.previsSystem` 之间插 1 条)、`js/agent-global.js`(1 处装配式 + 1 行注释)、`js/skills.js`(SK-03 的 `prompts` 尾部 + `note` 已落地那半加五句)、`tests/unit.js`(+1 夹具 +2 用例 + 三张名单的期望值)、`README.md`(三处数字 + 人设枚举加一项 + 收编说明一句)、`docs/skills-wave/README.md`(提示词条数 + 索引行)。

- **`js/prompts.js`**:插入点在 `agent.*` 一族中间。若并行槽也往这一族插(W88 的 `FORGE_SYS` 那条按它的键名大概落在别处),按插入点各留、次序按运行流程排;注意 W75 记的那个坑——同插入点两侧各加一块时**块尾那一行是共用的**,机械两留会语法断,合完先跑 `node --check`。README 的条数按合入后 `Prompts.list().length` **现取重算**,不要照抄任一侧(`contract` 的数字对账会先红)。
- **`js/skills.js` 的 SK-03**:`prompts` 数组尾部加键,与并行槽取**并集**并按键去重(本槽只加 `agent.routeSystem` 一个);`note` 两侧若都在"已落地"那半追加,两段都留;**`仍欠` 段本槽一字未动**,不存在 W75 那种"前一槽点名的正是后一槽要收的"失效链。
- **三张全仓名单**:最可能冲突的一处。任何并行槽收编任何一处内联人设,三张都得跟着减。合并时**不要照抄任一侧的期望串**,按合入后逐张现跑一次扫描重算(§7 的三段判据直接 `node -e` 跑出来贴回去),两侧的落点断言(各自那个"某文件整条消失")都保留。**特别注意第三张**:它含注册表 `def`,并行槽每收编一处,`js/prompts.js` 那个数就 +1,总数很可能不变——照前两张的经验去减总数会把它改错。
- **`tests/unit.js` 的夹具**:`routeSystemOf` 是新名,不与既有夹具重名;但 W80 记过"同名 helper 两块都留会静默互相覆盖",合并时先 `rg 'function routeSystemOf'` 确认只有一处。
- **`README.md` / `docs/skills-wave/README.md`**:提示词条数、单测数、索引行一律按合入后实跑重算。

## 13. 交接

1. **G-13 仍欠,缺口开着**:三张名单现为 7 文件 9 处 / 7 文件 10 处 / 12 文件(注册表侧 29 条)。余量集中在 `js/agent-ops.js` 2 处(会话纪要整理器 / 执行核验器)、`js/experts.js` 2 处(元智能体 `FORGE_SYS` / 专家人设进化器,后者带 `${bt}` 板块变量,收编时要决定变量走 `Prompts.fill` 还是留在装配口)、`js/proj-planner.js` 2 处(只有第二张名单数得到,判据差见 §7)、`js/plans.js` / `js/proj-upload.js` / `js/role-editor.js` / `js/sb-views.js` / `js/wf-core.js` 各 1 处。
2. **`js/agent-global.js` 从此零内联**:再往这个文件加 LLM 调用点时,人设句直接开新键;第 62 / 389 行那两句是随实况现拼的装配半(见 §1),不在本文件的内联人设名下,收它们要连同它们引用的现算数据面一起论证,不是顺手就能收的。
3. **"求值时机"这一条从本槽起有断言**:后续收编只要取值口不在顶层就自动合规,但**新写的键若被某个模块提成顶层常量,没有任何通用断言拦得住**——每收一处得自己带一条(判据见 §4 那张表)。
4. **本槽这类"人设句 + 现拼数据 + 判据 + 契约"的四段形状还有几处**(`js/agent-ops.js` 两处、`js/plans.js` 那处都带现算上下文):照 §3 那张表分段,不要图省事把整条 system 串塞进 `def`(变异 7 是这一条的守卫)。
