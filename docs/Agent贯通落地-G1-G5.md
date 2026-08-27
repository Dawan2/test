# Agent 贯通落地 G1-G5(2026-08)

> 按 [`Agent业务流与前沿案例分析-2026-08.md`](./Agent业务流与前沿案例分析-2026-08.md) 第三节规格落地的实现说明:改了哪些文件、行为变化、如何验证。原则:沿现有机制生长(UMD 双端单源 / 计费五件套 / 注册表单源),不引入新框架。

## 总览

| 项 | 优先级 | 状态 | 一句话 |
|---|---|---|---|
| G1 专家方法论进创作工作流 | P0 | ✅ 完成 | 雇佣专家 persona 注入智能分镜/本集理解/智能审片提示词,双端同源 |
| G2 headless 审→改→重抽→复审 | P0 | ✅ 完成 | CLI `episode.produce` 补齐修订重抽闭环,与浏览器 autoSmartReview 同语义 |
| G3 `/api/wf/agent` 服务端 Agent | P1 | ✅ 完成(单轮边界) | 服务端拼装注入→LLM→解析 run 类 ops;CLI `agent`/MCP `hujing_agent` 接入 |
| G4 记忆双端消费 | P1 | ✅ 完成 | `memRecall` 下沉 UMD,wf 端点按 scope 注入;CLI `memory` + MCP `hujing://memory` |
| G5 命令面 + 文档漂移 | P1 | ✅ 完成 | 补 `subject.generateImage`/`project.extractSubjects`,发布门 G9 改命令一键处置 |

---

## G1 专家方法论进创作工作流

**改动文件**:`js/wf-core.js`、`js/experts-data.js`、`js/sb-llm.js`、`js/understanding.js`、`js/review.js`、`server.js`

- `WfCore.personaNote(ex)`:雇佣专家 persona 截断 ≤200 字,格式与 `directorNote` 同款(`。专家方法论(名字):…`);无专家或空 persona 返回空串——**不注入时行为与原来逐字节一致**。
- `ExpertsData.expertOf(hiredId, customs)`:按 id 从「预置专家 + 自定义专家」合并表查找(服务端从 `st.hiredExpert + tree.customExperts` 取,浏览器 `hiredExpert()` 委托同源数据)。
- 注入点(三条工作流,双端各三处):
  - 智能分镜:浏览器 `sb-llm.js genShotsLLM` / 服务端 `/api/wf/smart-storyboard`(含内部 und 步);
  - 本集理解:浏览器 `understanding.js generate` / 服务端 `/api/wf/understanding`;
  - 智能审片:浏览器 `review.js buildReviewPrompt` / 服务端 `/api/wf/smart-review`(逐镜 rctx)。

**验证**:`node tests/unit.js`(experts-data/understanding 套件);雇佣专家后跑智能分镜,提示词含「专家方法论(…)」段;解雇后不含。

## G2 headless 审→改→重抽→复审

**改动文件**:`cli.js`、`server.js`(smart-review 端点)、`js/wf-core.js`、`js/review.js`、`js/cmd-registry.js`、`js/commands.js`

- `/api/wf/smart-review` 支持 `shotIds` 子集复审:逐镜分合并进上次整集报告(`ep.lastReview.perShot` 只替换被复审镜,共性/四维沿用上次结论不重复扣费);`lowShots` 返回 `{shotId, order, score, fixes}`(fixes=`WfCore.reviewFixes` 从报告 issues/维度建议提取的修正意见串)。
- 修订提示词算法下沉 `wf-core.js` 单一来源:`reviewFixes` / `buildOptimizeUser` / `localOptimizedPrompt`,浏览器 `Review.optimizeShot` 改为委托——CLI 与浏览器不再各抄一份。
- CLI `episode.produce` 编排(原头注释「审片 skipped」已改为真实行为):就绪检查 → 批量生成 → 整集审片 → **lowShots 非空时循环 ≤maxRetry(默认 2)**:逐镜 LLM 修订提示词(`/api/llm/chat` 计费 `llm.optimize`,失败回退本地规则改写)→ 重置视频态+确认 → `episode.generateVideos --shotIds 子集`重抽 → `shotIds` 子集复审;超限仍低分且未开 `riskyCompose` 时 blocked(`manual-gate`)阻断合成,与浏览器 `produce.js autoSmartReview` 同语义。
- `episode.generateVideos` 补 `shotIds` 子集参数(浏览器 handler 同步支持,注册表元数据同步)。
- 浏览器 `autoSmartReview` 原闭环未改动(仅委托下沉的共享函数)。

**验证**:`node tests/unit.js`(produce/contract 套件);MOCK_LLM 下 `hujing exec episode.produce --pid X --epid Y` 走通全链;`hujing exec episode.smartReview --args '{"shotIds":["sh1"]}'` 子集复审合并均分。

## G3 `/api/wf/agent` 服务端单轮 Agent

**改动文件**:`server.js`、`js/wf-core.js`、`js/agent-ops.js`、`cli.js`、`mcp.js`、`tests/unit.js`

- **端点**:`POST /api/wf/agent` 接收 `{pid, epid?, text, scope?, operationId?}`,与 `/api/wf/understanding|smart-storyboard|smart-review` 同构(鉴权/限流/`wfLLM` 计费内核/失败退费/MOCK_LLM 路径全同);计费动作服务端定死 `llm.agent`(1 积分,失败退费)。
- **注入管线**(全部从 state 树取,提示词函数在 `wf-core.js` 双端可用):`KB.block()` 知识库 + `personaNote` 雇佣专家 + `memBlock` 协作记忆(按 `scope` 板块召回,与对话层同算法)+ `agentStateText` 工作台状态摘要(Domain 单源推导:集级列计数/审片/下一步,项目级各集一行)+ `agentShotsBrief` 分镜表压缩(≤20 镜)+ `agentCmdProtocol` 命令白名单协议(cmd-registry 单源)。
- **返回** `{reply, thinking, ops, receipts}`:ops 经 `agentNormalize` 白名单过滤——仅 run 类且 cmd 在注册表词表内,args 经 `sanitizeCmdArgs` 参数面整形,≤5 条。
- **已实现边界(单轮)**:拼装注入 → LLM → 解析 ops,**端点本身不执行 ops**;执行由调用方决定(CLI `--apply` 逐条走 `exec` 同链路、MCP 助手自行调 `hujing_exec`),各命令按自身规则计费。**未做项**:route/q1/q2 多步续问轮、自修复轮、会话历史/纪要(这些是浏览器工作台语义,浏览器面板仍走 `agent.js` 原路径不受影响);后续若服务端化按 `wfLLM` 步骤槽位(`step: route/q1/q2/fix`)扩展即可,不需改计费结构。
- **接入层**:CLI `hujing agent "指令" --pid X [--epid Y] [--scope 板块] [--apply]`;MCP 工具 `hujing_agent`(包装 CLI)。
- **连带修复**:`wfLLM` 此前拼装 messages 只取 `opt.user`,所有调用方传的 `opt.system` 被静默丢弃(工作流提示词缺人设/协议段)——已修复,全部 wf 端点受益。
- **委托收敛**:浏览器 `agent-ops.js` 的 `cmdProtocol`/`sanitizeCmdArgs` 改为委托 `WfCore` 同名函数(单一来源,数据源各端自取)。

**验证**:MOCK_LLM 起服务后 `hujing agent "现在该做什么" --pid X` 返回 `{reply,ops,receipts}` 且 exit 0;缺 text 400、项目不存在 404、限流 429(每秒 >2 次);`node tests/unit.js agent-ops` 全绿。

## G4 记忆双端消费

**改动文件**:`js/wf-core.js`、`js/agent.js`、`server.js`、`cli.js`、`mcp.js`

- `memRecall`/`memBlock` 从 `agent.js` 下沉 `wf-core.js` UMD 纯函数(记忆数组经参数注入,不碰 window);浏览器 `agent.js` 改为委托,召回算法(同板块 -4 + 最近 -3 + 关键词加权 top3,去重)双端逐字节一致。
- wf 端点按板块 scope 注入 top-N:理解→`导演`、分镜→`分镜`、审片→`成片`(逐镜以剧情文本为召回输入);`/api/wf/agent` 按请求 `scope` 召回。
- CLI:`memory list [--scope 板块] [--recall 输入]`(--recall 预览按召回算法实际注入的条目)/`memory add --text 内容 [--scope 板块]`(截 120 字、上限 50 条,与浏览器 memRemember 同口径;`PUT /api/state` `changes.meta` 乐观锁,409 重取重试 ≤3 次)。
- MCP:只读资源 `hujing://memory`(映射 CLI `memory list`)。

**验证**:`hujing memory add --text "打斗镜头一律 2 秒内切" --scope 分镜` 后 `hujing memory list --recall 打斗 --scope 分镜` 可见召回;浏览器 Agent 与 wf 端点提示词均含「历史协作记忆」段。

## G5 命令面 + 文档漂移

**改动文件**:`js/cmd-registry.js`、`js/commands.js`、`cli.js`、`js/release.js`、`js/wf-core.js`、`js/episode-util.js`、`tests/unit.js`、`README.md`

- 新领域命令 2 条(注册表 8→10 条,三端词表自动跟随):
  - `subject.generateImage`(项目级):缺参考图主体批量生成回填,`subjectIds` 可指定子集(含已有图重生);浏览器走 `EpisodeUtil.genSubjectImage`(Tasks.run 五件套),CLI 走服务端生图同链路(逐主体计费,失败退费,积分不足整体中止)。
  - `project.extractSubjects`(项目级):LLM 从项目剧本提取角色/场景/道具合并入库(同名同类不覆盖,缺提示词/人设的补齐,别名进 formerNames 可寻址);提示词/可信性校验/规整下沉 `wf-core.js`(`buildExtractUser`/`isPlausibleName`/`normalizeExtracted`),浏览器解析向导与 CLI 同源;CLI 计费 `llm.extract`,浏览器离线回退本地启发式。
- **文档漂移修复**:发布门 G9(主体缺图)README 曾写 `subject.generateImage` 但代码未注册——现命令已实装,`release.js` G9 的 fix 从导航改为 `command` 类型(带缺图主体 `subjectIds` 子集一键补图),`execFix` 透传 `subjectIds`。
- README 领域命令数、`exec` 示例、G9 描述同步。

**验证**:`node tests/unit.js`(release/contract/commands 套件断言 G9 fix.cmd 与三端词表集合相等);`hujing exec project.extractSubjects --pid X` / `hujing exec subject.generateImage --pid X` 结构化回执。

---

## 验证汇总

```bash
# 语法(全部改动文件)
node --check server.js && node --check cli.js && node --check mcp.js
for f in wf-core experts-data sb-llm understanding review agent agent-ops cmd-registry commands episode-util release; do node --check js/$f.js; done

# 单元测试(201 项全绿;agent-ops 沙箱补装 domain/prompts/knowledge/wf-core)
node tests/unit.js

# 端到端冒烟(MOCK_LLM,不产生真实上游调用)
MOCK_LLM=1 MV_DATA_DIR=/tmp/g3data PORT=8321 node server.js &
node cli.js agent "现在该做什么" --pid <pid> --server http://localhost:8321 --token <tk>
```

注:`tests/e2e.js` 按约定仅在明确要求时运行,本轮未跑。
