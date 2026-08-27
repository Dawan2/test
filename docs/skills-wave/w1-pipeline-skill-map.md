# W1 · 主线 × skill/智能体资产图谱与缺口

> 基线:`master @ 9adcf0f`(二十三轮收尾)。本文只读代码写结论,不含任何业务逻辑改动。
> 主线口径:**剧本 → 主体 → 分集 → 分镜 → 生成 → 审片 → 成片**。

## 0. 结论摘要

- 现有资产不是"没有 skill",而是 **skill 概念散在五层、各层各有单源、层间没有索引**:知识条目在 `js/knowledge.js`,提示词在 `js/prompts.js`,人设在 `js/experts-data.js`,编排在 `js/commands.js`+`js/cmd-registry.js`,执行面在 `js/agent-ops.js`,机读入口在 `cli.js`/`mcp.js`。
- 主线七步在代码里只有 **六步是一等公民**:`Domain.workflow` 的主线步骤是 `script/subjects/eps/shots/gen(剪辑)/film(成片)`,**审片不是步骤**(只作为 `episodeState.status==='needs_human'` 与发布门 G3 存在),`AGENT_BOARDS` 也没有审片板块。
- 最重的贯通缺口是 **专家/人设/记忆只在浏览器生效**:服务端 `/api/wf/*` 只吃 `Prompts` + `KB.reviewBlock()` + `directorSetting` + `projTypeOf`,不吃 `hiredExpert.persona`、板块专家 persona、`agentMemory`。同一条主线用 CLI/MCP 驱动时,"雇的专家不上工",两端产出不同。
- 存在**写入即失效的 skill 字段**:`settings.tplVideo`(专家雇佣三件套之一)全仓库无任何生成路径读取。
- 存在**同一词表三处不一致**:景别在 `camera.js` 是 4 档、`wf-core.js` 是 6 档、`knowledge.js` 描述是 6 级;运镜在 `wf-core.js` 是 10 项、`camera.js` 交互面板是 9 项。
- 知识库的"按名取用"入口 `KB.SECTIONS` **没有任何消费方**:17 条方法论里只有 6 条被按键引用,其余 11 条靠手写压缩块复述生效——方法论在同一文件里事实上有两份措辞。

---

## 1. 现有库 / 智能体清单(按层)

### L1 知识层(方法论文本)

| 资产 | 位置 | 形态 | 双端 | 消费方 |
|---|---|---|---|---|
| 专业知识库 KB | `js/knowledge.js` | UMD 注册表,17 个条目(编剧 9 / 导演 4 / AI 抽卡 4)+ `KB.SECTIONS` 名→文本平表(**零消费方**,见 G-15)+ `KB.block()` 助手压缩块 + `KB.reviewBlock()` 审片口径块 | ✅ UMD | `agent.js:495`、`agent-global.js:554`(`KB.block`)、`wf-core.js:132`(`DR_SHOT`+`DR_AXIS`)、`review.js:28`/`server.js:3422`(`reviewBlock`)、`beatboard.js:202`(`WR_STRUCTURE`+`WR_FACESLAP`)、`proj-shell.js:136`(`WR_HOOKS`+`WR_PAYOFF`) |
| 拆镜规则 / 五段式 | `js/wf-core.js`(`SPLIT_RULES`/`PROMPT5`) | 长文本常量 | ✅ UMD | 拆镜 user 模板 |
| 摄影参数体系 | `js/camera.js`(`CAM.PRESETS/DIRECTIONS/ELEVATIONS/SHOT_SIZES/BODIES/LENSES/FOCALS/APERTURES`) | 浏览器全局 `window.CAMERA` | ❌ 仅浏览器 | 机位选择器、`CAM.buildSpec` 英文摄影词 |
| 音色库 | `js/voice.js`(~50 音色,`multiEmotion` 标注) | 浏览器全局 | ❌ 仅浏览器 | 配音设置、`persona.recommendVoice(sBatch)` |
| 敏感词库 / 合规口径 | `js/compliance.js`(`WORDS` 五类 + `GUIDE`) | 浏览器全局 | ❌ 仅浏览器 | 生成前置拦截、发布门 G7 |
| 八维度人设维表 | `js/persona.js`(`DIMS` 外形 4 + 内在 4) | 浏览器全局 | ❌ 仅浏览器 | 主体人设编辑、文生图提示词重写、音色推荐 |
| 长期记忆 | `Store.state.agentMemory`(上限 50,`agent.js` `memAll` 内置 2 条标准沉淀 + 5 条 `KB_SEEDS`) | localStorage/state | ❌ 仅浏览器 | 助手召回注入、`Experts.evolveExpert` 蒸馏源 |

### L2 提示词层(可覆盖的文件化 skill)

| 资产 | 位置 | 说明 |
|---|---|---|
| 核心提示词注册表 | `js/prompts.js` | 6 条:`sb.system`、`sb.reviewUser`(变量 `{style}{brief}`)、`sb.reviewSystem`、`und.system`、`review.system`、`review.finalSystem`。`Prompts.get/fill/list/setAll`,用户覆盖存 `settings.promptOverrides`,清空即恢复默认;**Node 侧覆盖表必须由调用方显式传入**(模块不碰 window) |
| 工作流提示词纯核 | `js/wf-core.js` | 三条 LLM 编排(本集理解 / 智能分镜 / 智能审片)的拼装与结果规整单源,浏览器委托 + `server.js` require |
| 提示词模板三件套 | `settings.tplImage` / `tplVideo` / `tplReview`(默认值在 `gsettings.js` `DEFAULTS`) | `tplImage` → `episode-util.js:100`、`persona.js:16`;`tplReview` → `review.js:29`、`server.js:3422`;**`tplVideo` 无任何消费方** |
| 元智能体提示词 | `js/experts.js` `FORGE_SYS` | 专家工坊生成专家 skill 的严格 JSON 协议 |
| 各模块内联提示词 | `beatboard.js`、`proj-shell.js`、`persona.js`、`episode-util.js`、`director.js`、`proj-planner.js` 等 | 未进 `Prompts` 注册表,不可在线覆盖 |

### L3 专家层(人设 skill)

- `js/experts-data.js`(UMD,双端单源):**16 个预置专家**
  - `kind=style`(8,全局雇佣,带 `dims` 五维 + `tpl` 三件套):冷峻悬疑 / 甜宠轻喜 / 热血燃系 / 治愈日常 / 电影感写实 / 出海解说剧(带 `projType:'narration'`)/ 暗黑复仇 / 古装权谋。
  - `kind=function`(8,板块雇佣,只有 `persona`):总策划 Agent、出海译制导演、钩子工程师、爽点架构师、对白医生、结构医师、摄影指导、剪辑指导。
  - `projTypeOf(hiredId, customs)` 是唯一被服务端复用的专家推导(决定分镜提示词的解说/剧情模式标注)。
- `js/experts.js`(仅浏览器):`hireExpert`(雇佣=写 `settings.hiredExpert` + `directorSetting` + 三件套)、`delCustomExpert`、`evolveExpert`(记忆蒸馏 ≤4 条进化条款追加 persona,1 积分,仅自定义专家)、`FORGE_SYS`/`normExpertDraft`(专家工坊)、`allExperts()`=预置+`Store.state.customExperts`。
- 生效人设解析链:面板下拉 > 板块雇佣专家(`p.boards[key].expert`)> 全局雇佣(`settings.hiredExpert`)> 无(`agent.js` `gPersonaBlock`/`aPersonaBlock`)。

### L4 智能体层

| 资产 | 位置 | 说明 |
|---|---|---|
| 板块智能体 | `js/agent.js` `AGENT_BOARDS` | 7 个:导演(定调导演)/剧本(主编剧)/主体(选角美术指导)/分集(分集策划)/分镜(分镜导演)/生成(制片主任)/成片(交付监制) |
| 全局助手 | `js/agent-global.js` | 贯穿全流程抽屉;`buildGlobalPrompt` 注入 `KB.block()` + 人设 + 上下文 + ops 协议 + `choices` 决策卡 |
| 执行域 | `js/agent-ops.js` | `DATA_OPS` 13 种 + `ACT_OPS` 3 种(`run/goto/select`),风险分级 `read/edit/edit-hi/exec`;`run` 白名单由 `Commands`/`CmdRegistry` 自省生成(`actProtocol()`);自修复轮、按需查询(≤2 轮)、预排模式、并行编辑冲突面板、undo 快照 + `verifyOps` 回读校验 |
| 上下文传导 | `js/agent.js` | `upstreamFinal`(上游已定稿作为权威约束)、`boardExpertBlock`(板块专家能力注入)、`memRecall`(同板块 4 条 + 全局最近 4 条) |
| 分工看板 | `js/episodes.js:741`(制片 → 智能体分工) | 板块阶段/审核意见落 `p.boards`,并提供"雇佣专家"入口 |

### L5 编排 / 机读接入层

| 资产 | 位置 | 规模 |
|---|---|---|
| 领域命令元数据 | `js/cmd-registry.js` | 8 条:`episode.preflight/generateStoryboard/generateVideos/understanding/smartReview/compose/produce`、`shot.generateVideo`(含 `risk/needs/args`,三端词表单源) |
| 命令执行层 | `js/commands.js` | UI 模式(保留决策弹窗)/ headless 同一条命令层;`Commands.digest` 统一消化回执 |
| 服务端工作流 | `server.js` `/api/wf/understanding|smart-storyboard|smart-review` | 三条 LLM 编排服务端化,计费动作服务端定死 |
| CLI | `cli.js` | 43 个命令(含 `exec` 透传领域命令、`workflow` 状态、`release-check` 发布门) |
| MCP | `mcp.js` | 29 个 `hujing_*` 工具 + 1 资源 + 3 资源模板 + **2 条流程 playbook**(`hujing_new_drama`、`hujing_failed_shots`) |
| 协同件 | `js/plans.js` / `js/issues.js` / `js/release.js` / `js/bus.js` | 持久计划(步骤映射领域命令)、问题中心、10 项发布门、管线事件总线 |

---

## 2. 主线对照表

| 主线步 | `Domain.workflow` | 板块 Agent | 专家 skill | 提示词 skill | 知识条目 | 命令 / 机读 |
|---|---|---|---|---|---|---|
| 剧本 | `script` ✅ | 主编剧 | 钩子工程师 / 爽点架构师 / 对白医生 / 结构医师 / 总策划 / 出海译制 | 无注册表条目(内联在 `proj-upload`/`proj-planner`/`beatboard`) | `WR_*` 9 条 | CLI `episode-script`;**无 wf 端点** |
| 主体 | `subjects` ✅ | 选角美术指导 | 无专属功能专家 | `tplImage`(读)+ `persona.js` 内联 | `GC_REFS`(主体参考五条) | CLI `subject-add/-image/-copy`;LLM 主体提取仅浏览器 |
| 分集 | `eps` ✅ | 分集策划 | 结构医师 / 钩子工程师 | 无注册表条目(`doSplit` 内联) | `WR_STRUCTURE` | CLI `episode-add`;拆集仅浏览器 |
| 分镜 | `shots` ✅ | 分镜导演 | 摄影指导 / 剪辑指导 | `sb.system`、`sb.reviewUser`、`sb.reviewSystem`、`und.system` | `DR_SHOT`+`DR_AXIS`(已注入)、`SPLIT_RULES`、`PROMPT5` | `episode.generateStoryboard`、`episode.understanding`、`/api/wf/*` ✅ |
| 生成 | `gen`(名"剪辑")✅ | 制片主任 | 无专属功能专家 | **`tplVideo` 空挂** | `GC_FORMULA`/`GC_RULES`/`GC_MULTI`/`GC_REFS` **未注入任何生成提示词构造点** | `episode.generateVideos`、`shot.generateVideo`、CLI `gen-*` ✅ |
| 审片 | ❌ 非步骤(仅 `needs_human` + 发布门 G3) | ❌ 无板块(并入成片) | 剪辑指导(方法论仅文本) | `review.system`、`review.finalSystem`、`tplReview` | `KB.reviewBlock()` ✅ | `episode.smartReview`、`/api/wf/smart-review`、CLI `review-note/review-frames` ✅ |
| 成片 | `film` ✅ | 交付监制 | 剪辑指导 | 无注册表条目 | `DR_RHYTHM`(未注入合成/时间线) | `episode.compose`、`episode.produce`、`release-check`/`release` ✅ |

---

## 3. 缺口清单

严重度:**P0**=主线断点或两端不一致 / **P1**=单源被破坏或 skill 空挂 / **P2**=覆盖面不足。

| 编号 | 缺口 | 主线定位 | 证据 | 严重度 |
|---|---|---|---|---|
| G-01 | 专家人设不过服务端:`/api/wf/*` 不注入 `hiredExpert.persona`、`p.boards[key].expert.persona` | 分镜 / 审片 | `server.js:841-845` 只 require `domain/wf-core/prompts/knowledge/experts-data`;`ExpertsData` 仅用于 `projTypeOf`(`server.js:3321`) | P0 |
| G-02 | 长期记忆无双端:`agentMemory` 只在浏览器 state,CLI/MCP 无读写口 | 全线 | `rg agentMemory server.js cli.js mcp.js` 无命中 | P0 |
| G-03 | 审片不是主线一等步骤:流程条无 review 步、板块 Agent 无审片席、`plans` 的"审片修订"是导航类步骤(`goto`)而非映射到已注册的 `episode.smartReview`,headless 不可执行 | 审片 | `domain.js:423-460` 主线步骤无 review;`agent.js` `AGENT_BOARDS` 7 项无审片;`plans.js:32` 只给 `goto` | P0 |
| G-04 | 主线前段无服务端工作流:剧本拆集、LLM 主体提取只在浏览器,headless 主线从"剧本"起就断 | 剧本 / 主体 / 分集 | `/api/wf/*` 仅三条;`episode-util.js` LLM 提取、`proj-upload.js` `doSplit` 仅浏览器 | P0 |
| G-05 | `settings.tplVideo` 写入即失效:雇佣/设置写入,零消费方 | 生成 | 全仓库 `tplVideo` 只出现在 `gsettings.js`/`experts*.js`/`tests/unit.js` | P1 |
| G-06 | AI 抽卡四条知识(`GC_FORMULA/GC_RULES/GC_MULTI/GC_REFS`)未进任何生成提示词构造点,只在 `KB.block()` 里给助手看 | 生成 | `D.buildVideoRequest`(`domain.js:151`)不引用 KB;`GC_REFS` 未进 `shotRefImages` 说明 | P1 |
| G-07 | 景别 / 运镜词表三处不一致 | 分镜 / 审片 | `camera.js` `SHOT_SIZES` 4 档(特写/近景/中景/全景)vs `wf-core.js` `SIZES` 6 档 vs `KB.DR_SHOT` 六级;`wf-core.js` `CAMERAS` 10 项 vs `camera.js` `MOVES` 9 项 | P1 |
| G-08 | 知识条目按"名字"索引而非按主线步骤索引:哪一步注入哪几条全靠各调用点硬编码 | 全线 | `KB.SECTIONS` 平表;注入点分散在 `wf-core:132`/`review:28`/`beatboard:202`/`proj-shell:136`/`agent*:KB.block` | P1 |
| G-15 | `KB.SECTIONS` **零消费方**(README 称"供各生成环节按名取用",实现里无人取用);17 条目中只有 6 条被按键直接引用(`DR_SHOT`/`DR_AXIS`/`WR_STRUCTURE`/`WR_FACESLAP`/`WR_HOOKS`/`WR_PAYOFF`),其余 11 条只经手写压缩块 `KB.block()`/`KB.reviewBlock()` 间接生效——压缩块是对条目的**改写复述而非引用**,等于同一方法论在同一文件里存了两份措辞 | 全线 | `rg SECTIONS` 仅命中定义处与 README:293;`rg GC_FORMULA\|GC_RULES\|GC_MULTI\|GC_REFS\|WR_CORE\|WR_REVERSALS\|WR_DIALOGUE\|WR_CHARACTER\|WR_PITFALLS\|DR_MISE\|DR_RHYTHM` 在 `knowledge.js` 外零命中 | P1 |
| G-09 | 功能专家只有一段 `persona`,没有输入/输出契约、没有绑定命令,所以不能被 `plans`/CLI/MCP 调度 | 全线 | `experts-data.js` `kind=function` 8 项仅 `persona`;`plans.js` 步骤只映射 `CmdRegistry` 8 命令 | P1 |
| G-10 | 专家方法论无法验收:雇佣只改提示词文本,审片与发布门没有"钩子强度/打脸四步/景别递进"的结构化判定项 | 审片 / 成片 | `wf-core.buildReviewPrompt` 三维(technical/matching/directing)+ `normalizeCut` 四维,均无方法论维度;`release.js` G1-G10 无方法论门 | P1 |
| G-11 | 专家自进化只吃全局记忆、只对自定义专家开放,板块/主线维度的偏好沉淀不进专家 | 全线 | `experts.js:68` `evolveExpert` 读 `Store.state.agentMemory` 全量;预置专家不挂进化入口 | P2 |
| G-12 | MCP playbook 只覆盖首尾两个场景(开工 / 失败镜),主线中段无 playbook | 主体 / 分镜 / 审片 / 发布 | `mcp.js:105-142` 仅 2 条 | P2 |
| G-13 | 大量模块内联提示词未进 `Prompts` 注册表,用户不能在线改写(与"核心提示词 skill 可覆盖"的承诺覆盖面不一致) | 剧本 / 主体 / 分集 / 成片 | `beatboard.js:202`、`proj-shell.js:136`、`persona.js:18/83/111`、`episode-util.js` 等 | P2 |
| G-14 | 合规词库 / 音色库 / 摄影参数 / 八维人设四个"专业库"是浏览器全局,不能被服务端工作流与 CLI 复用 | 生成 / 审片 | `compliance.js`/`voice.js`/`camera.js`/`persona.js` 均 `window.*` 单端 | P2 |

> 并行分支提示:远端存在未合并分支 `origin/cursor/agent-flow-sota-analysis-736a`,其中已包含 `/api/wf/agent`、`subject.generateImage`/`project.extractSubjects` 命令与 memory 消费侧等改动。W2 动工前须以当时 `master` 复核 G-01/G-02/G-04 是否已被该分支合并覆盖,避免重复实现。

---

## 4. 建议纳入的 skill 概念

只纳入能落到"单一来源 + 可验收"的四个概念:

1. **skill = 注册表条目,不是文件/插件**。字段:`id`、`name`、`stage`(主线步骤键,与 `Domain.workflow` 同词表)、`kind`、`kb`(引用 `KB` 条目键,**不复制文本**)、`prompts`(引用 `Prompts` key)、`cmds`(引用 `CmdRegistry` 命令名)、`checks`(校验项 id)。文本永远只有一份,skill 只做索引。
2. **三种 kind**:
   - `inject`(注入型):把方法论块拼进某一步的系统提示词。取代当前"各调用点硬编码 KB 片段"。
   - `check`(校验型):纯函数,输入领域对象(`p/ep/s`),输出 `{pass, level, hits[]}`。给审片维度与发布门提供方法论判定,不调 LLM、不计费。
   - `orchestrate`(编排型):把已有领域命令按顺序编成可复用剧本,输出结构与 `Commands.execute` 回执一致。同时是 MCP playbook 的生成源。
3. **stage 索引 = 主线七步**:`script/subjects/eps/shots/gen/review/film`。审片补齐为一等步骤是这个索引成立的前提(G-03)。
4. **专家 = skill 组合 + persona**:`experts-data.js` 条目增加 `skills:[id]` 引用,persona 保留为人格化措辞。这样"雇佣专家"从"改几段文本"变成"启用一组可验收能力",且服务端可以只按 id 解析,不必解析浏览器 UI 状态。

## 5. 建议丢弃的 skill 概念

| 丢弃 | 理由 |
|---|---|
| 独立 skill 文件目录 + 运行时动态加载(`import()`/`fetch` 拉 md/js) | 违反无构建约束,离线与加载顺序不可控;`index.html` 已是显式顺序清单,再加动态层只会引入首屏竞态 |
| `SKILL.md` front-matter / YAML 描述格式 | 需要 YAML 解析器,零依赖前提下要自写解析,收益为零(注册表用纯 JS 对象即可) |
| skill 沙箱执行任意 JS | 安全面与体积都不划算,且与"计费一律走 `Tasks.run`/服务端动作白名单"冲突 |
| skill 市场 / 评分 / 版本商店 / 订阅 | 与主线贯通无关,属于堆功能 |
| 多智能体自由对话(群聊式互评、自主协商) | 不可验收、成本不可控;现有"板块 Agent + 领域命令层 + 回执驱动"已能编排,且每步都有回执可核对 |
| skill 级独立计费 | 计费唯一权威在服务端动作白名单;skill 不得成为新的计费标签面(否则重演"客户端标签套利") |
| 为 skill 新建独立存储桶 | 覆盖沿用 `settings.promptOverrides` 与 `state.customExperts` 两个既有桶,不新增同类桶 |

## 6. UMD / 注册表单一来源接入方案

### 6.1 新增一个模块:`js/skills.js`(UMD,纯数据 + 纯函数)

```js
/* skills.js 主线 skill 注册表(双端 UMD) */
(function (root, factory) {
  const isNode = typeof module === 'object' && module.exports;
  const KB = isNode ? require('./knowledge.js') : root.KB;
  const S = factory(KB);
  if (isNode) module.exports = S; else root.Skills = S;
})(typeof self !== 'undefined' ? self : globalThis, function (KB) { /* … */ });
```

约束(与 `domain.js`/`wf-core.js`/`prompts.js` 同纪律):

- 模块内**不碰 `window`/`Store`/`location`**;环境差异(生效专家、板块专家、记忆、覆盖表)一律经参数注入。
- 只引用 `KB` 条目键与 `Prompts` key,**不内联方法论文本**——这是不"两端各抄一份"的关键。
- 对外接口保持最小:`Skills.list(stage?)`、`Skills.block(stage, ctx)`(拼注入型文本)、`Skills.check(stage, domainObj)`(跑校验型)、`Skills.playbook(id)`(编排型步骤表)。

### 6.2 加载顺序与 require 点

- `index.html`:插在 `js/knowledge.js` 之后、`js/wf-core.js` 之前(`wf-core` 需要用它拼提示词)。
- `server.js`:与现有 `require('./js/knowledge.js')` 同处 require;工作流端点把生效 skill 经 `ctx` 传进 `wf-core`,`wf-core` 自己不解析用户状态。
- `cli.js` / `mcp.js`:沿用 `cmd-registry.js` 的既有模式——命令用法文案、工具描述、playbook 文本全部**由注册表生成**,不手写第二份。

### 6.3 覆盖与用户可改写

- 提示词文本覆盖仍然只有一个入口:`settings.promptOverrides` + `Prompts.get/fill(key, ov)`。skill 只负责"这一步该取哪几个 key",不新增覆盖桶。
- 服务端读覆盖表的既有纪律不变:**覆盖表由调用方显式传入**(防多用户串扰)。

### 6.4 与既有单源件的关系

| 既有单源 | skill 层的关系 |
|---|---|
| `js/domain.js` | stage 词表以 `Domain.workflow` 步骤键为准,skill 不另起一套流程状态 |
| `js/wf-core.js` | 提示词拼装仍在 wf-core;skill 只提供"注入哪些块"的清单,由 wf-core 拼 |
| `js/prompts.js` | 文本与覆盖的唯一权威;skill 只存 key |
| `js/knowledge.js` | 方法论文本的唯一权威;skill 只存条目键 |
| `js/cmd-registry.js` | 编排型 skill 的步骤只能引用已注册命令名,不得内联新命令语义 |
| `js/experts-data.js` | 专家条目增 `skills:[id]`,`projTypeOf` 语义不变 |

### 6.5 需要同步归一的词表(G-07)

景别 / 运镜 / 视角 / 角度四张词表建议统一到 `wf-core.js` 现有常量(`SIZES/CAMERAS/VIEWS/ANGLES`,已是双端),`camera.js` 改为从其派生并只保留 UI 专属的几何参数(`azimuth/elevation/distance`、机身/镜头/焦距/光圈)。`KB.DR_SHOT` 的六级描述与 `SIZES` 保持逐项对应。
