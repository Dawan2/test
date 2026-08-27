# W1 · 主线 skill 层架构规格(W2–W4 可执行拆分)

> 配套图谱与缺口:`docs/skills-wave/w1-pipeline-skill-map.md`(缺口编号 G-01…G-14 在本文直接引用)。
> 基线 `master @ 9adcf0f`。本文是规格,不是实现;动工前须以当时 `master` 复核缺口是否仍存在。

## 1. 目标与非目标

**目标**:让"专家 / 知识 / 提示词 / 命令"四类既有资产在主线七步(剧本→主体→分集→分镜→生成→审片→成片)上有一张**按步骤索引的单一来源表**,并且这张表在浏览器、`server.js`、`cli.js`、`mcp.js` 四个运行环境里**同一份字面**。

**非目标**(本轮明确不做):新增创作功能、新增页面、新增计费动作、改动生成/审片的既有产出口径。skill 层是索引层与校验层,不是新的产能层。

## 2. 分层与扩展点

```
L1 知识文本      js/knowledge.js(KB 条目)            ← 文本唯一权威
L2 提示词文本    js/prompts.js(key→def + 覆盖表)      ← 文本唯一权威
L3 skill 索引    js/skills.js(新增,只存引用)          ← 本轮新增的唯一新模块
L4 人设组合      js/experts-data.js(条目增 skills[])
L5 编排与执行    js/cmd-registry.js → js/commands.js / server.js /api/wf/* / cli.js / mcp.js
```

扩展点清单(新增能力时**只改这一列对应的文件**,不散改):

| 扩展点 | 文件 | 加什么 | 谁自动跟着变 |
|---|---|---|---|
| 新方法论条目 | `js/knowledge.js` | `KB.XX_YY` 文本 + 进 `KB.SECTIONS` | 助手知识块、skill 引用可用 |
| 新可覆盖提示词 | `js/prompts.js` `REG` | `{key,name,vars,def}` | 偏好学习页列表、`Prompts.get/fill`、服务端同 key |
| 新 skill | `js/skills.js` `REG` | `{id,name,stage,kind,kb[],prompts[],cmds[],checks[]}` | 按 stage 的注入块、校验集合、CLI/MCP 描述 |
| 新专家 | `js/experts-data.js` `EXPERTS` | 条目 + `skills:[id]` | 雇佣链路、板块调用、服务端解析 |
| 新领域命令 | `js/cmd-registry.js` `META` + 两端 handler | 元数据 + `commands.js` REG / `cli.js` EXEC | CLI 用法、MCP 工具描述、`plans` 步骤映射 |
| 新校验项 | `js/skills.js` `CHECKS` | 纯函数 `(p,ep,s)=>{pass,level,hits}` | 审片补充维度、发布门可选门 |
| 新 playbook | `js/skills.js` 编排型条目 | `steps:[{cmd,args}]` | `mcp.js` prompts 列表由此生成 |

`js/skills.js` 强约束(与 `domain.js`/`wf-core.js`/`prompts.js` 同纪律):UMD 双端;不引用 `window`/`Store`/`location`/`document`;不内联方法论或提示词文本(只存 key);环境差异(生效专家、板块专家、记忆、覆盖表、在线态)一律由调用方经 `ctx` 显式注入。

## 3. 波次拆分

### W2 · 单源打底(纯结构,零行为变更)

目标:先把"索引"建起来并把已破的单源修回,产出必须是**行为等价**的——同样输入生成同样提示词。

范围:

1. 新增 `js/skills.js`(UMD 注册表 + `list/block/check/playbook` 四个接口),`index.html` 插在 `knowledge.js` 之后、`wf-core.js` 之前,`server.js` 与 `knowledge.js` 同处 require。
2. 把当前硬编码的知识注入点改为经 skill 索引取块(G-08),逐点保持**拼装结果逐字节一致**:`wf-core.sbSystem`(`DR_SHOT`+`DR_AXIS`)、`review` 侧 `KB.reviewBlock()`、`beatboard`(`WR_STRUCTURE`+`WR_FACESLAP`)、`proj-shell`(`WR_HOOKS`+`WR_PAYOFF`)、`agent*` 的 `KB.block()`。同时处置 `KB.SECTIONS` 的零消费与压缩块复述(G-15):`SECTIONS` 要么成为 skill 索引的取用面、要么删除并更正 README;`KB.block()`/`KB.reviewBlock()` 的复述文本若要保留,须在注释中标明"压缩块与条目是两份措辞、条目为准",避免后续改条目忘改块。
3. 词表归一(G-07):景别/运镜/视角/角度以 `wf-core.js` 常量为准,`camera.js` 改为派生并只保留几何与器材参数;`KB.DR_SHOT` 与 `SIZES` 逐项对应。
4. `tplVideo` 定性处置(G-05):**要么**接进 `Domain.buildVideoRequest` 的 prompt 构造(注意会改动生成指纹,须同步 `shotInputHash` 影响面评估与判旧口径),**要么**从雇佣三件套与设置页移除并在 README 更正描述。二选一,不得留"写入即失效"。
5. 专家条目补 `skills:[id]` 引用(G-09 的前置),`persona` 文本不动。

接口契约(W2 定稿,W3/W4 不得再改签名):

```
Skills.list(stage?)              → [{id,name,stage,kind,kb,prompts,cmds,checks}]
Skills.block(stage, ctx)         → string   // 注入型:按 stage 拼方法论块;ctx 只传数据,不传环境句柄
Skills.check(stage, obj, ctx)    → [{id,pass,level,hits}]
Skills.playbook(id)              → {id,title,steps:[{cmd,args,note}]}
```

不做:不改 LLM 调用次数、不改计费动作、不改 `Domain.workflow` 步骤集合(审片步骤留到 W3)。

验收:

- `node --check` 通过改动的每个 js 文件。
- `node tests/unit.js contract` 新增断言:每个 skill 的 `kb` 键都存在于 `KB`、`prompts` 键都存在于 `Prompts.list()`、`cmds` 名都在 `CmdRegistry.names()`、`stage` 值 ⊆ `Domain.workflow` 主线步骤键集合。
- 新增"提示词字面等价"断言:改造前后 `WfCore.sbSystem()`、`WfCore.buildReviewPrompt()` 输出逐字节相同(用固定 fixture)。
- `node tests/unit.js`(全套)与 `node tests/integration.js` 不新增失败。
- README 架构段落补 `js/skills.js` 一行,功能描述与实际一致。

风险与回退:唯一风险点是第 3、4 项会碰到生成指纹与判旧。回退策略:词表归一与 `tplVideo` 处置各自独立提交,能单独 revert。

### W3 · 双端贯通(把"雇的专家"送进服务端与 CLI)

目标:解决 P0 组 G-01/G-02/G-03/G-04。

范围:

1. **审片升为主线一等步骤**(G-03):`Domain.workflow` 主线步骤在 `gen` 与 `film` 之间插 `review`,done 判定复用既有 `episodeState.reviewAvg` 与 `lastReview` 判旧口径(不新写判定逻辑);同步 `pipeline.js` 流程条;`plans.js` 的"审片修订"步骤从导航类(`goto`)升级为 `cmd:'episode.smartReview'`,使计划在 headless 下可执行;`AGENT_BOARDS` 增审片板块(或明确文档化"审片归成片板块"并保留 7 板块 + 7 步骤的不对称,二选一并在 README 写明)。
2. **专家人设过服务端**(G-01):`/api/wf/*` 端点解析 `settings.hiredExpert` 与 `p.boards[key].expert` → 经 `ctx.personaBlock` 传入 `wf-core`;`wf-core` 只消费 `ctx`,不解析 state。浏览器侧改为走同一条 `ctx` 装配函数,保证同一雇佣状态下两端提示词一致。
3. **记忆双端**(G-02):`agentMemory` 的读写下沉到服务端 state 的既有同步通道(不新建存储桶),CLI 增只读/追加两个命令,MCP 增对应资源;召回策略(同板块 4 + 全局最近 4)抽为纯函数进 `skills.js` 或 `wf-core.js`,两端共用。
4. **主线前段补服务端工作流**(G-04):剧本拆集与 LLM 主体提取补 `/api/wf/*` 端点或领域命令,提示词与规整下沉 `wf-core.js`;CLI/MCP 暴露对应入口,使 headless 能从"剧本"起跑通。

验收:

- 同一账号、同一项目、同一雇佣状态下,浏览器智能分镜与 `cli.js exec episode.generateStoryboard` 的 **system + user 提示词逐字节一致**(在 `tests/unit.js` 用 fixture 断言装配函数,在 `tests/cli.smoke.js` 用 `MOCK_LLM=1` 断言端到端回执结构)。
- `tests/integration.js` 覆盖新增 wf 端点的写回与错误路径(400/404/退费)。
- `tests/cli.smoke.js` 覆盖:从"只有剧本文件"到"分镜表存在"的 headless 链路不再有 `unsupported-in-cli`。
- 发布门与流程条在增 `review` 步骤后仍与 `Issues`/`Release` 结论一致(`node tests/unit.js release issues plans domain pipeline`)。

风险:主线步骤集合是流程条、tab 打勾、跑批映射、Agent 步骤图的共同口径,增步骤是**扇出最大的一次改动**;必须先用 `domain` 套件锁定推导,再改消费方。

### W4 · 验收闸门与机读覆盖

目标:让专家方法论从"提示词文本"变成"可判定的检查项",并补齐机读入口的主线中段。

范围:

1. **校验型 skill 接入审片与发布门**(G-10):`Skills.check('shots'|'review', …)` 的结果作为审片报告的补充维度(不改既有三维/四维分数口径,新增独立字段)与发布门的**可选门**(默认 warn,不默认 fail,避免存量项目一夜变红)。检查项纯本地、零 LLM、零计费。
2. **抽卡知识进生成构造点**(G-06):`GC_RULES`/`GC_REFS` 的稳定词与主体参考纪律以校验项形式前置提示(生成前 warn),而非直接改写用户 prompt——改写会动生成指纹与既有产出。
3. **MCP playbook 由注册表生成并补主线中段**(G-12):补"主体一致性建库""审片修订闭环""发布门处置"三条;`mcp.js` 的 `PROMPTS` 改为从 `Skills.playbook` 投影。
4. **内联提示词收编**(G-13):把 `beatboard`/`proj-shell`/`persona`/`episode-util` 的内联提示词按价值排序,分批进 `Prompts.REG`(每条进注册表即获得在线覆盖能力),偏好学习页列表自动增长。
5. **专家进化维度化**(G-11):`evolveExpert` 的记忆源按 `scope`(板块)与 stage 过滤,预置专家的进化落到"自定义副本"而非改预置数据。

验收:

- `node tests/unit.js`:新增 `skills` 套件——每个校验项在"干净 fixture"上全 pass、在"脏 fixture"上命中且 `level` 分级正确;发布门在校验项全 warn 时 `overall` 不从 `pass` 掉到 `fail`。
- `node tests/unit.js contract`:`mcp.js` 的 playbook 集合与 `Skills.playbook` 一一对应(不存在手写第二份)。
- README:功能描述 + API 表 + CLI 词表 + MCP 工具/资源/playbook 计数全部与代码一致。

## 4. 全波通用验收标准

1. **单源可证**:任一方法论文本、提示词文本、命令名、词表项在仓库内 `rg` 只有一处定义,其余全是引用。新增断言进 `tests/unit.js contract`。
2. **双端字面一致**:凡跨浏览器/服务端/CLI 的逻辑,必须有 fixture 断言两端输出逐字节相同(沿用二十一轮 `wf-core` 的既有做法)。
3. **零依赖零构建**:不新增 npm/CDN/构建步骤;新增文件必须能被 `node --check` 直接检查,并能同时被 `<script>` 与 `require` 加载。
4. **计费不变**:skill 层不引入新计费动作、不引入新 `billingAction` 标签;需要 LLM 的能力一律复用既有 `Tasks.run`(浏览器)与服务端动作白名单。
5. **行为等价优先**:结构重构提交必须"输入同 → 输出同";行为变更提交必须单独成 commit 并在 README 记录。
6. **回归**:每波至少 `node --check`(改动文件)+ `node tests/unit.js`(全套)+ 与改动面相关的 `tests/integration.js` / `tests/cli.smoke.js` 套件;`node tests/e2e.js` 仅在用户明确要求时运行。
7. **文档同步**:README 架构段、功能描述、API 表、CLI/MCP 词表随实现同 commit 更新。

## 5. 禁止项

- **禁止竞品溯源表述**:文档与注释中不出现"借鉴/对标/复刻某产品"之类描述,只描述功能本身。
- **禁止两端各抄一份**:任何跨环境逻辑都必须是 UMD 单源 + `ctx` 注入;发现"浏览器一份、服务端一份"必须先合并再往下做。
- **禁止堆无关功能**:skill 市场、评分、订阅、群聊式多智能体、skill 沙箱执行、独立 skill 文件目录 + 动态加载,均不在范围内(理由见图谱文档第 5 节)。
- **禁止新增依赖与构建**:不引入 npm/CDN/YAML 解析/打包器;第三方库若确需,必须本地化到 `js/vendor/`。
- **禁止绕过计费纪律**:不得让 skill 成为新的计费标签面;付费路径一律 `Tasks.run`(登记→扣费→执行→失败退费),上传一律 `U.readAndUpload`。
- **禁止用占位冒充**:登录后端时生图/生视频失败必须如实报错并退费;仅离线回退占位模拟。
- **禁止在 skill 模块内碰环境**:`js/skills.js` 不得出现 `window`/`Store`/`document`/`location`/`fetch`。
- **禁止一次性大改主线口径**:`Domain.workflow` 步骤集合的变更(W3 第 1 项)必须先锁定 `domain` 套件断言,再逐个改消费方,不与其他改动混在同一 commit。
- **禁止删除或跳过既有测试**:只允许新增断言与新增套件。
