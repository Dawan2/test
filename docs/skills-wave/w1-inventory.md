# W1 · 仓库 skill 专家库与智能体 · 真实文件与入口盘点

> 本文件是**本仓库现状盘点**,不是设计提案。逐项以真实文件、真实导出名、真实加载点为准,行号对应盘点时的 `master`(`9adcf0f`)。
> 目的:后续计划槽讨论"要不要动 skill / 智能体"时,先有一份不用重读全仓就能对齐的底图。
> 凡是仓库里**没有**的东西,一律写在第九章"缺口与如实记录",不在正文里含糊带过。

## 一、口径:本仓库的 "skill" 与 "智能体" 各指什么

仓库里 `skill` 这个词有三个互不相同的含义,读代码时最容易混:

| 说法 | 真实所指 | 落在哪 |
|---|---|---|
| **专家 skill** | 一个专家对象 = `persona` 系统人设 + `dims` 导演五维 + `tpl` 提示词三件套,封装成可"雇佣"的数据结构 | `js/experts-data.js` 预置 16 个;用户自定义存 `Store.state.customExperts` |
| **核心提示词 skill** | 主线 LLM 调用的系统提示词/指令模板注册表,可被用户在线改写并覆盖 | `js/prompts.js` 6 条 |
| **系统提示词 skill / 提示词模板 skill** | UI 文案里对 `settings.tplImage/tplVideo/tplReview` 三件套的称呼(无专家雇佣时的回退模板) | `js/gsettings.js` `DEFAULTS` |

**没有**文件化的 `SKILL.md` 形态(既无 `.agents/skills/`,也无 `.claude/skills/`,也无仓库自有的 skill 目录)。专家 skill 全部是 JS 对象字面量,自定义专家全部存在浏览器 `Store` 里。

"智能体"同样有两层:

- **虎鲸导演助手**(全局抽屉 + 分集面板):唯一的对话式智能体实现,`js/agent*.js` 三个文件。
- **板块 Agent(智能体分工)**:7 个板块各一个"身份",不是独立进程或独立模块——它是同一个导演助手带上不同板块人设 + 不同板块记忆 + 不同板块雇佣专家后的运行态。

## 二、文件总览

| 文件 | 行数 | 形态 | 全局导出 | 角色 |
|---|---|---|---|---|
| `js/experts-data.js` | 141 | UMD 双端 | `ExpertsData` / `module.exports` = `{ EXPERTS, projTypeOf }` | 预置专家注册表**数据单源** |
| `js/experts.js` | 156 | IIFE 仅浏览器 | `window.Experts` + `window.EXPERT_DIRECTORS` / `allExperts` / `hiredExpert` / `projType` | 雇佣·解雇·自进化·工坊逻辑 |
| `js/knowledge.js` | 90 | UMD 双端 | `KB` / `module.exports` | 编剧/导演/AI抽卡方法论知识库(17 条 + 2 个压缩块) |
| `js/prompts.js` | 70 | UMD 双端 | `Prompts` / `module.exports` | 核心提示词注册表(6 条)+ 覆盖读写 |
| `js/wf-core.js` | 275 | UMD 双端 | `WfCore` / `module.exports`(36 个成员) | 三条 LLM 编排的提示词拼装与结果规整 |
| `js/gsettings.js` | 634 | IIFE 仅浏览器 | `window.GSettings` + `Views.gsettings` + `window.DIR_DIMS` | 偏好学习页(专家工坊 / 专家雇佣 / 全局默认值)UI 宿主 |
| `js/agent.js` | 789 | IIFE 仅浏览器 | `window.Agent` / `window.AgentCore` / `window.AGENT_BOARDS` / `window.AgentRefs` | 导演助手主体:板块定义、人设解析、记忆、集级面板 |
| `js/agent-ops.js` | 1319 | IIFE 仅浏览器 | `window.AgentOps` / `window.__AGENT_TEST` | ops 执行域:工具注册表、应用器、验证、冲突、状态感知 |
| `js/agent-global.js` | 587 | IIFE 仅浏览器 | `window.AgentG` | 全局抽屉:路由上下文、意图路由、板块协作 |
| `js/cmd-registry.js` | 69 | UMD 双端 | `CmdRegistry` / `module.exports` = `{ META, names, ... }` | 8 条领域命令元数据单源 |
| `js/commands.js` | 288 | IIFE 仅浏览器 | `window.Commands` = `{ execute, list, digest, REG }` | 领域命令执行层(Agent / UI / 跑批共用) |
| `js/cmdpalette.js` | 101 | IIFE 仅浏览器 | 无(自绑 `Ctrl+K`) | 命令面板入口层 |
| `js/persona.js` | 125 | IIFE 仅浏览器 | `window.Persona` | **角色**八维人设(剧中人物),与专家 skill 无关,勿混 |

## 三、专家库(skill)层

### 3.1 `js/experts-data.js` —— 数据单源

- 导出 `{ EXPERTS, projTypeOf }`。UMD:`module.exports`(Node)/ `root.ExpertsData`(浏览器)。模块内不碰 `window`,纯数据 + 纯函数。
- `EXPERTS` 共 **16 条**,按 `kind` 分两类:

| kind | 数量 | id 列表 | 语义 |
|---|---|---|---|
| `style`(缺省) | 8 | `ex_suspense` 冷峻悬疑 / `ex_sweet` 甜宠轻喜 / `ex_hotblood` 热血燃系 / `ex_healing` 治愈日常 / `ex_cinema` 电影感写实 / `ex_narration` 出海解说剧 / `ex_revenge` 暗黑复仇 / `ex_power` 古装权谋 | 全局风格雇佣;必带 `dims` 五维 + `tpl` 三件套 |
| `function` | 8 | `ex_planner` 总策划 / `ex_localize` 出海译制 / `ex_hook` 钩子工程师 / `ex_pleasure` 爽点架构师 / `ex_dialogue` 对白医生 / `ex_structure` 结构医师 / `ex_dp` 摄影指导 / `ex_editor` 剪辑指导 | 板块雇佣;只有 `persona`,无 `dims`/`tpl` |

- 单条专家的字段面:`id / name / style / ico / role? / kind? / tags[] / desc / persona / projType? / dims{5} / tpl{tplImage,tplVideo,tplReview}`。
- `projTypeOf(hiredId, customs)` 是**唯一**的"解说模式 vs 剧情模式"判据:命中 `projType === 'narration'` 的专家(目前只有 `ex_narration`,自定义专家也可带)返回 `'narration'`,否则 `'drama'`。这个函数是这个文件在二十二轮被拆出来的直接原因——服务端 `/api/wf/*` 需要它。

### 3.2 `js/experts.js` —— 雇佣与工坊逻辑(仅浏览器)

- **加载期硬依赖**:文件第 6 行 `const { DEFAULTS, DIR_DIMS, DIR_STYLES, EXPERT_ROLES, dirFallback } = window.GSettings;` 是**顶层解构**,所以 `gsettings.js` 必须先加载,`experts-data.js` 也必须先加载(第 11 行取 `ExpertsData.EXPERTS`)。index.html 里的顺序 74 → 75 → 76 就是为这个约束排的。
- 导出:
  - `window.Experts = { EXPERTS, customExperts, hireExpert, delCustomExpert, evolveExpert, toLab, FORGE_SYS, normExpertDraft }`(第 155 行)
  - 另挂四个裸全局供其他模块直接调用:`window.EXPERT_DIRECTORS`(= 预置数组)、`window.allExperts()`(预置 + 自定义)、`window.hiredExpert()`、`window.projType()`。
- 关键行为:
  - `hireExpert(e)`:`kind==='function'` 或缺 `dims`/`tpl` 的直接 return(功能专家不能全局雇佣);否则确认后一次性写 `settings.hiredExpert` + `settings.directorSetting`(五维)+ `tplImage/tplVideo/tplReview`。
  - `delCustomExpert(id)`:删自定义专家;若正被全局雇佣则级联解雇并把三件套恢复 `DEFAULTS`。
  - `evolveExpert(e)`:**唯一的自进化路径**。读 `Store.state.agentMemory` → 一次 `API.chatJSON`(`billingAction: 'llm.evolve'`)蒸馏 ≤4 条"进化条款" → 追加进 `e.persona` 并 `e.evolutions++`。走展开式计费五件套(`Tasks.start` → `U.charge` → 执行 → 失败 `U.refund`)。只对自定义专家开放。
  - `FORGE_SYS`:元智能体系统提示词,规定输出严格 JSON 的完整专家 skill;`normExpertDraft(o)` 把返回值规范化(补 id `cx_<ts>`、`custom: true`、`kind` 归一、`style` 白名单、`tags` 截 4、`desc` 截 80、`dims` 按 `dirFallback` 补齐)。

### 3.3 `js/knowledge.js` —— 方法论知识库

- 导出 `KB`(UMD)。17 个条目挂在 `KB.SECTIONS`,同时各自有具名键:
  - 编剧域 9 条:`WR_CORE` `WR_STRUCTURE` `WR_HOOKS` `WR_REVERSALS` `WR_FACESLAP` `WR_PAYOFF` `WR_DIALOGUE` `WR_CHARACTER` `WR_PITFALLS`
  - 导演域 4 条:`DR_MISE` `DR_SHOT` `DR_AXIS` `DR_RHYTHM`
  - AI 抽卡域 4 条:`GC_FORMULA` `GC_RULES` `GC_MULTI` `GC_REFS`
- 两个压缩块函数(实际被注入的就是这两个,不是全库):
  - `KB.block()` ≈500 字,注入导演助手系统提示词(集级 + 全局)。
  - `KB.reviewBlock()` ≤400 字,注入审片评分提示词;服务端 `server.js:3422` 直接调它。
- `KB.DR_SHOT` + `KB.DR_AXIS` 被 `WfCore.sbSystem()` 拼进智能分镜系统人设(`wf-core.js:132`)。

### 3.4 `js/prompts.js` —— 核心提示词注册表

- 导出 `Prompts` = `{ list, get, fill, setAll }`(UMD)。`REG` 6 条:`sb.system` / `sb.reviewUser` / `sb.reviewSystem` / `und.system` / `review.system` / `review.finalSystem`。
- 覆盖机制:浏览器端 `get/list` 默认读 `Store.state.settings.promptOverrides`;**Node 端无 window,覆盖表必须由调用方经第二参数 `ov` 显式传入**(`server.js` 全部调用点都传 `ov`/`st.promptOverrides`,防多用户串扰)。
- `setAll(map)` 只在浏览器端可用:空文本或与 `def` 相同即删除该键的覆盖(等于恢复默认),覆盖表清空即删 `promptOverrides` 整键。

### 3.5 `js/wf-core.js` —— 提示词拼装与结果规整(消费 KB + Prompts)

- 导出 `WfCore`(36 个成员)。UMD 头部按环境取依赖:Node 走 `require('./domain.js' | './knowledge.js' | './prompts.js')`,浏览器走 `root.Domain / root.KB / root.Prompts`。
- 与 skill 直接相关的成员:`sbSystem(ov)`(= `Prompts.get('sb.system')` + `KB.DR_SHOT` + `KB.DR_AXIS`)、`sbReviewUser`、`buildSBUser`、`buildUndUser`、`buildReviewPrompt`、`directorNote(ds)`(导演五维 → 提示词注入文本)、`dimsText(ds)`。
- 环境差异(`Store.uid/now`、`promptOverrides`、`directorInject/projType`、PH 占位)一律经 `ctx` 参数注入,模块内不碰 `window`。

### 3.6 `js/gsettings.js` —— 专家库的 UI 宿主

- `window.GSettings = { DEFAULTS, DIR_DIMS, DIR_STYLES, EXPERT_ROLES, dirFallback }`(第 131 行),被 `experts.js` 顶层解构。另挂 `window.DIR_DIMS` 供 `understanding` 引用。
- `Views.gsettings(main)`(第 133 行)内部第 136 行把 `window.Experts` 整体解构成闭包别名,页面代码引用不变。两个 tab:
  - `forge` **专家工坊**:元智能体对话生成(`FORGE_SYS`,`Tasks.run` 计费 1 分,`billingAction: 'llm.skill'`)/ 手动编写表单 / 我的专家库列表 / **全局默认值卡**(内含 `Prompts.list()` 渲染的核心提示词 skill 在线改写,保存走 `Prompts.setAll`)。
  - `expert` **专家雇佣**:三段列表——平台预置 style 专家、我的 style 专家、功能专家(功能专家段只展示不给雇佣按钮,提示去板块雇佣)。

## 四、智能体层

### 4.1 `js/agent.js` —— 主体

四个全局导出:

| 导出 | 位置 | 内容 |
|---|---|---|
| `window.AGENT_BOARDS` | 第 16 行 | **7 个板块**:导演(定调导演)/剧本(主编剧)/主体(选角美术指导)/分集(分集策划)/分镜(分镜导演)/生成(制片主任)/成片(交付监制),各带 `ico` 与 `focus`。数组顺序即上下游顺序,`upstreamFinal` 与 `episodes.js` 的 `BOARD_ORDER` 都依赖它 |
| `window.AgentCore`(AC) | 第 22 行建、第 778 行补 | 跨文件共享状态 + 人设/记忆函数:`gBoard` `gPersonaId` `activeStepKey` `prearrOn` `ctxOf`(由 agent-global 注入)+ `boardExpert` `boardExpertBlock` `upstreamFinal` `expertPersona` `findExpert` `aPersonaBlock` `gPersonaBlock` `personaSelectHTML` `memRemember` `memBlock` `openMemoryModal` `guideBarHTML` `opBoardKey` |
| `window.AgentRefs` | 第 188 行 | 📎 加入对话的引用注册表,存 `sessionStorage['agentRefs']`,上限 6 个(存 12 截断) |
| `window.Agent` | 第 779 行 | 对外唯一门面:本地 `toggle` `render` `notify` `refreshFocusChip`,其余代理到 `AgentOps` / `AgentG` |

**人设解析链(这是专家库与智能体的接缝,值得单独记)**:

- 集级(`aPersonaBlock(ep)`):`ep.agentPersonaId` 面板下拉 → 全局雇佣 `expertPersona()`。
- 全局(`gPersonaBlock()`):`AC.gPersonaId` 下拉 → 板块雇佣 `boardExpertBlock(p, gBoard.key)` → 全局雇佣。
- 下拉值语义有三态:`undefined/null` = 没手动选过(跟随默认链路);`''` = 明确选了「默认助手」(不注入任何人设);专家 id = 以该专家人设工作。
- `boardExpert(p, key)` 读 `p.boards[key].expert`,再到 `allExperts()` 里查——**板块雇佣的候选面是全部专家(预置 + 自定义,含 style 类)**,不限于 8 个功能专家。

**记忆**:`memAll()` 是 `Store.state.agentMemory` 的访问器,同时做三件事——旧板块名迁移(`构思` → `导演`)、两条"标准沉淀"补种(五段式提示词结构、景别衔接口诀)、5 条 `KB_SEEDS` 补种(钩子六型/打脸四步/对话铁律/景别即情绪/抽卡五条军规)。上限 50 条,先进先出。`agentMemory` 同时是 `evolveExpert` 的输入,构成"用助手 → 沉淀记忆 → 蒸馏进专家 persona"的闭环。

### 4.2 `js/agent-ops.js` —— ops 执行域

- 加载期硬依赖:第 6 行 `const AC = window.AgentCore;`,必须在 `agent.js` 之后。
- 导出 `window.AgentOps`(第 1317 行,约 50 个成员)与 `window.__AGENT_TEST`(第 1318 行,单测入口)。
- 三张与"智能体能干什么"直接相关的注册表:

| 注册表 | 位置 | 内容 |
|---|---|---|
| `OP_TOOLS` | 第 23 行 | **16 个 op** 的风险分级:`read` 2 个(`select` `goto`)、`edit` 11 个、`edit-hi` 2 个(`delete` 删镜头 / `delep` 删分集)、`exec` 1 个(`run`)。风险级决定预览卡标注与自动模式下是否强制二次确认 |
| `ACT_CMD` | 第 45 行 | 中文动作名 → 领域命令名的映射,11 个别名指向 6 条命令(`generateStoryboard` `generateVideos` `compose` `smartReview` `produce` `understanding`) |
| `DATA_OPS` / `ACT_OPS` | 第 13-14 行 | 数据类 13 个 / 动作类 3 个;`splitOps` 另回 `unknown`(未注册的 op 名显式回报,不静默吞) |

- 协议文本**自动生成**,不手写:`actProtocol()` = `Object.keys(ACT_CMD).join('|')`;`cmdProtocol()` 从 `Commands.list()`(元数据来自 `cmd-registry.js`)生成命令白名单与参数面。这样"协议宣称的可执行集合"与"真实可执行集合"恒一致。
- `selfFixRound(...)`(第 142 行)自修复轮:回执含 `✕`/`⊘` 时追加一轮核验/修复调用,最多 2 层递归,复用同一 `operationId` 的辅助槽位(不另扣费)。开关 `settings.agentSelfFix`,默认开。

### 4.3 `js/agent-global.js` —— 全局抽屉

- 加载期硬依赖:第 6-7 行取 `window.AgentCore` 与 `window.AgentOps`,必须在两者之后。
- 导出 `window.AgentG = { toggleGlobal, closeGlobal, refreshGlobal, openBoard, applyGlobalOps, isOpen }`(第 586 行)。
- `ctxOf()`(第 12 行)把当前路由解析为 `{p, ep|null}` 并注入 `AC.ctxOf` —— 全局助手"知道自己在哪一页"靠这一个函数。
- 第 49-72 行把各板块状态 + 各板块雇佣专家名拼成全局任务上下文注入系统提示词;第 200 行渲染板块专家阵容 chips(点击 = 直接对该板块子 Agent 说话,与制片页「智能体分工」同语义)。
- 对话存储三档:`ep.agentChat`(有分集)/ `p.agentChat`(有项目无分集)/ `Store.state.agentGlobal`(都没有)(第 174 行)。

### 4.4 领域命令层(智能体的"手")

- `js/cmd-registry.js`(UMD)`META` **8 条命令**元数据单源:`episode.preflight` / `episode.generateStoryboard` / `episode.generateVideos` / `shot.generateVideo` / `episode.smartReview` / `episode.compose` / `episode.produce` / `episode.understanding`。字段面 `name/label/risk/needs/desc/args`。
- `js/commands.js` `window.Commands = { execute, list, digest, REG }`:统一回执 `{ok,status,result,error,cost,next}`;`headless`(Agent/跑批/CLI 语境,默认)与 `ui`(保留确认闸/合规承诺/真人预审等决策弹窗)两模式。
- 三端消费同一份 `META`:浏览器 `Commands.REG` 默认值 + `Commands.list()` 自省、`cli.js` 的 `exec` 用法与 help 文案、`mcp.js` 的 `hujing_exec` 工具描述。
- `js/cmdpalette.js`:`Ctrl+K` 面板,条目 = `Commands.list()` + 6 条导航;缺路由上下文的命令置灰标注原因;执行走 `Commands.execute(ui:true)`。

## 五、加载入口:四端矩阵

### 5.1 浏览器(`index.html`,无构建、按 `<script>` 顺序)

相关加载点(行号为 index.html 行号):

```
15  js/domain.js        21  js/prompts.js       22  js/knowledge.js     23  js/wf-core.js
48  js/cmd-registry.js  49  js/commands.js
62  js/agent.js         63  js/agent-ops.js     64  js/agent-global.js
74  js/gsettings.js     75  js/experts-data.js  76  js/experts.js
79  js/cmdpalette.js    80  js/app.js
```

三条**顺序不能动**的约束(都是顶层解构造成的加载期依赖,不是运行时查找):

1. `gsettings.js` → `experts-data.js` → `experts.js`(experts.js 顶层解构 `window.GSettings`,并取 `ExpertsData.EXPERTS`)。
2. `agent.js` → `agent-ops.js` → `agent-global.js`(后两者顶层取 `window.AgentCore` / `window.AgentOps`)。
3. `prompts.js` + `knowledge.js` → `wf-core.js`(wf-core 浏览器分支取 `root.Prompts` / `root.KB`)。

其余跨模块调用一律运行时 `window.X` 查找(可 vm 沙箱测试),`commands.js` 明确声明"无加载时绑定"。

### 5.2 服务端(`server.js`)

第 841-845 行,五个 `require`:

```js
const Domain      = require('./js/domain.js');
const WfCore      = require('./js/wf-core.js');
const Prompts     = require('./js/prompts.js');
const KB          = require('./js/knowledge.js');
const ExpertsData = require('./js/experts-data.js');
```

消费点集中在三个工作流端点:

| 端点 | 位置 | 用到的 skill 资产 |
|---|---|---|
| `POST /api/wf/understanding` | 3276 | `Prompts.get('und.system', ov)`、`WfCore.buildUndUser/undValid/undNormalize`、`WfCore.dimsText`(导演五维) |
| `POST /api/wf/smart-storyboard` | 3303 | `ExpertsData.projTypeOf(st.hiredExpert, tree.customExperts)`(3321)、`WfCore.directorNote`、`WfCore.sbSystem(ov)`(内含 `KB.DR_SHOT/DR_AXIS`)、`Prompts.get('sb.reviewSystem')`、`WfCore.sbReviewUser` |
| `POST /api/wf/smart-review` | 3408 | `KB.reviewBlock()`(3422)、`Prompts.get('review.system' / 'review.finalSystem')`、`WfCore.buildReviewPrompt/normalizeReport/buildSumUser/buildCutUser` |

要点两条:

- 服务端**只消费专家注册表的数据面**(`projTypeOf` 一个函数),不加载 `experts.js`——雇佣/解雇/工坊/自进化全部是浏览器行为。
- 覆盖表一律显式传参(`ov` / `st.promptOverrides`),因为 Node 端 `Prompts` 读不到 `Store`。

### 5.3 CLI(`cli.js`)

只 `require` 两个:`js/domain.js`(第 22 行)、`js/cmd-registry.js`(第 23 行)。

**CLI 完全不加载专家库 / 知识库 / 提示词注册表**。LLM 创作类三命令(`episode.understanding` / `episode.generateStoryboard` / `episode.smartReview`)一律 POST 到服务端 `/api/wf/*`(第 1121/1125/1129 行),提示词编排与 skill 注入都发生在服务端。`node cli.js help` 里也没有任何专家/skill 相关命令。

### 5.4 MCP(`mcp.js`)

只 `require` 一个:`js/cmd-registry.js`(第 18 行),用于生成 `hujing_exec` 的工具描述与命令名枚举。

- 29 个 `hujing_*` 工具,全部是 `cli.js` 的包装;与 skill 沾边的只有间接的三条(`hujing_storyboard` / `hujing_understanding` / `hujing_smart_review`,内部走 `exec` → `/api/wf/*`)。
- 4 个只读 resources(`hujing://projects`、`hujing://project/{pid}/show|workflow`、`.../episode/{epid}/workflow`)+ 2 个 prompts(`hujing_new_drama` / `hujing_failed_shots`)。
- **MCP 侧没有任何专家库/知识库/智能体人设的读写通道**。

### 5.5 测试

`tests/unit.js` 用 vm 沙箱按需装载:

- `loadExperts()`(第 139 行):先 stub 一个 `sb.GSettings`(镜像 gsettings.js 顶部常量),再依次 `loadFile('experts-data.js')` → `loadFile('experts.js')`。覆盖 16 条计数、`allExperts` 合并、双端数据一致(浏览器 `Experts.EXPERTS === ExpertsData.EXPERTS` 同一引用 + Node `require` 逐字节同数据)、`projTypeOf` 四路径、`normExpertDraft` 两类、`hireExpert` 两类、`delCustomExpert` 级联解雇、`evolveExpert` 成功/无增量两路。
- Agent 侧经 `loadFile('agent-ops.js')` + `window.__AGENT_TEST` 出口测 `applyOps` / `compactShots` / `fingerprint` / `detectConflicts` / `resolveOps` / `stateDigest` / `dynamicChips` / `openingLine` / `queryProtocol` 等。
- 契约测试断言 `cli.js` 与 `mcp.js` 都 `require('./js/cmd-registry.js')`(第 2925/2936 行),锁死三端词表同源。

## 六、UI 入口点(用户从哪里碰到这些东西)

| 入口 | 位置 | 打开什么 |
|---|---|---|
| 左侧导航「🛠 偏好学习」`#/gsettings` | `js/app.js:19` NAV + `:141` 路由 | 专家工坊 / 专家雇佣 / 全局默认值(含核心提示词 skill 改写) |
| 左侧「🐋 虎鲸」按钮 | `js/app.js:45` 渲染 + `:69` 绑 `Agent.toggleGlobal()` | 全局导演助手抽屉 |
| 项目页 → 制片 → 「🤖 智能体分工」 | `js/episodes.js:703` 子 tab 表 + `:741` 看板 | 7 板块泳道:阶段下拉 `data-bstage` / 审核意见 `data-bnote` / **板块专家下拉 `data-bexpert`** / 「💬 协作」`data-bchat` → `Agent.openBoard(key)` |
| 分集工作区右侧助手面板 | `js/agent.js` `render` / `toggle` | 集级导演助手(带身份下拉 `personaSelectHTML`、🧠 记忆、⚡ 自动、🩹 自修复) |
| 📎 加入对话 | 分镜⋯菜单 / 分镜脚本场次与节拍行 / 主体编辑页(`sb-board.js`、`role-editor.js` 等) | 把对象挂进 `AgentRefs` |
| `Ctrl+K` 命令面板 | `js/cmdpalette.js` | 8 条领域命令 + 6 条导航 |
| 百宝箱 → 项目实验台 | `js/tools.js:26` | 只剩一句指引:「AI 策划」「剧本译制」已升级为功能专家,去专家雇佣或板块雇佣 |

## 七、持久化键位

浏览器 `Store.state`(经 `/api/state` 与服务端同步,服务端 `tree` 即同一结构):

| 键 | 属主 | 内容 |
|---|---|---|
| `state.settings.hiredExpert` | 全局 | 当前全局雇佣的专家 id |
| `state.settings.directorSetting` | 全局 | 导演五维 + `style` + `inject`;雇佣时被专家 `dims` 覆写 |
| `state.settings.tplImage/tplVideo/tplReview` | 全局 | 提示词三件套;雇佣时被专家 `tpl` 覆写,解雇恢复 `DEFAULTS` |
| `state.settings.promptOverrides` | 全局 | 核心提示词 skill 的用户覆盖(6 键子集);清空即删整键 |
| `state.customExperts[]` | 全局 | 自定义专家(工坊生成 / 手写),带 `custom:true` `evolutions` |
| `state.agentMemory[]` | 全局 | 助手长期记忆,≤50 条,`{text,time,scope}`;自进化的输入 |
| `state.agentGlobal[]` | 全局 | 无项目上下文时的全局助手对话 |
| `state.settings.agentAuto` / `agentSelfFix` | 全局 | 自动执行 / 自修复开关(自修复默认开:判 `!== false`) |
| `p.boards[板块名]` | 项目 | `{stage, note, expert, time}` —— **板块雇佣专家就存在这里** |
| `p.agentChat[]` | 项目 | 项目级助手对话 |
| `ep.agentChat[]` | 分集 | 集级助手对话,≤50 条 |
| `ep.agentPersonaId` | 分集 | 集级面板身份下拉的持久化值(三态语义见 4.1) |
| `sessionStorage['agentRefs']` | 会话 | 📎 引用列表(≤6 生效 / ≤12 存) |
| `sessionStorage['agentPrearr']` | 会话 | 预排模式开关 |

## 八、计费

`billing.js:18` 里与 skill/智能体相关的动作单价(积分):

| 动作 | 价 | 触发点 |
|---|---|---|
| `llm.skill` | 1 | 专家工坊元智能体生成专家 skill(`gsettings.js:242`) |
| `llm.evolve` | 1 | 专家自进化(`experts.js:83`) |
| `llm.agent` | 1 | 导演助手对话轮 |
| `llm.chat` | 1 | 通用 LLM |
| `llm.review` | 5 | 审片 |

纪律:专家工坊走 `Tasks.run` 封装;自进化走展开式五件套(`Tasks.start` → `U.charge` → 执行 → `U.refund`),其中"LLM 已交付但无新增条款"按业务结论处理——`Tasks.fail` 但**不退款**(退款无对应服务端路径,本地退会与服务端漂移,`experts.js:88-92` 有注释说明)。

## 九、缺口与如实记录

1. **没有文件化 skill**。仓库无 `.agents/skills/`、无 `.claude/skills/`、无自有 skill 目录;专家 skill 是 JS 对象字面量 + 浏览器 Store,不能被外部 Agent 直接读文件消费。
2. **CLI / MCP 侧完全没有专家库与智能体入口**。29 个 MCP 工具与全部 CLI 命令里,没有一条能列出专家、雇佣专家、读写 `agentMemory`、读写 `promptOverrides` 或与导演助手对话。外部 Agent 目前只能通过 `/api/wf/*` 间接受到"服务端读 `hiredExpert` 推导 `projType`"这一行影响。
3. **专家 skill 的实际生效面很窄**。`persona` 只进对话类系统提示词;真正影响生成的是 `dims`(经 `WfCore.directorNote/dimsText` 注入)与 `tpl` 三件套(替换 settings)。`tags`/`desc`/`role` 纯展示,不参与任何推导。
4. **功能专家没有独立执行路径**。8 个功能专家(钩子工程师/爽点架构师/…)只在被板块雇佣或身份下拉选中时把 `persona` 追加到系统提示词,没有专属命令、专属工作流或专属输出结构;`ex_planner` / `ex_localize` 的 `desc` 里提到的「AI 策划」完整工作流在 `tools.js` 已下线为一句指引。
5. **板块雇佣的候选面没有按 kind 过滤**。`episodes.js:794` 的 `data-bexpert` 下拉列的是 `allExperts()` 全量(style 专家也能被板块雇佣,只是标注 `(功能)` 的是功能专家),与 `gsettings.js` 里"功能专家不做全局雇佣"的单向限制不对称。
6. **知识库注入的是压缩块,不是全库**。`KB.SECTIONS` 17 条里,真正每轮注入的只有 `KB.block()`(≈500 字)与 `KB.reviewBlock()`(≤400 字)两个手写压缩块 + `DR_SHOT`/`DR_AXIS` 两条原文;其余 11 条目前没有代码消费点(文件头注释说的"各生成环节按名取用"暂无调用者)。
7. **核心提示词注册表只覆盖 6 条**。主线还有大量提示词散在各模块内联字符串里(如 `experts.js` 的 `FORGE_SYS`、`persona.js` 的重写提示词、`server.js:3481` 的 `'你是短剧审片总监。'`),不在 `Prompts` 注册表内,用户改不到,也不双端单源。
8. **智能体是单实现多身份,不是多智能体**。7 个板块 Agent 与 5 个"角色评审"(`sb.reviewUser` 里的编剧/导演/摄像/动效师/审片)都是同一次 LLM 调用里的角色扮演,没有独立会话、独立工具面或相互调用;`AGENT_BOARDS` 的 `agent` 字段只是展示名。
9. **`js/persona.js` 与专家 skill 完全无关**,是剧中角色的八维人设(五官/发型/身材/服饰/性格/特技/弱点/语气)。命名相近,盘点与后续讨论都要注意别当成 Agent 人设。

## 十、一句话结论

本仓库的 "skill 专家库" = `js/experts-data.js`(16 条数据单源)+ `js/experts.js`(浏览器雇佣逻辑)+ `js/knowledge.js`(17 条方法论)+ `js/prompts.js`(6 条可覆盖提示词);四者中除 `experts.js` 是浏览器专用外,另三个都已 UMD 化并被 `server.js` require 复用。"智能体" = `js/agent.js` / `agent-ops.js` / `agent-global.js` 三文件的单一导演助手实现,靠 `AGENT_BOARDS`(7 板块)× 人设解析链呈现为"多个板块 Agent",手脚是 `cmd-registry.js`(8 条元数据)+ `commands.js`(执行层)。UI 入口两处(`#/gsettings` 偏好学习、🐋 全局抽屉 + 项目页智能体分工);服务端只借数据面(`projTypeOf` + KB/Prompts/WfCore);CLI 与 MCP 侧对 skill 与智能体**零入口**。
