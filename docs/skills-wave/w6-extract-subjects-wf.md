# W6 · 提取主体接入 `/api/wf/*`(前段命令吃到人设与协作记忆)

> 基线 `cursor/w6-integration-9f68 @ e1074f7`(整合 7/7 收尾:已含 G-01 专家人设唯一装配口 `wfPersonaNote` / G-02 记忆下沉 / G-03 审片主线步 / G-04 拆集端点 / G-05 / skills 全栈)。
> 只改 `project.extractSubjects` 一条调用链,不动主线步骤集合、不新增计费动作、不碰 `js/skills.js`。

## 1. 问题(W5 周期一审计第 185 行)

`project.extractSubjects` 的 CLI 实现**直打 `/api/llm/chat`**:提示词虽然经 `WfCore.buildExtractUser` 与浏览器同源拼装,但拼装发生在客户端,而 G-01 的人设注入与 G-02 的记忆召回都发生在 `/api/wf/*` 端点内部。结果是主线**前段**(剧本 → 主体)拿不到雇佣专家的方法论,也拿不到协作记忆——同一条主线,前段与中后段两套口径。

复核确认这条通道上还有第二处同病:浏览器解析向导 `EpisodeUtil.llmExtractSubjects` 同样只拼提示词、不注入,两端一致地"都没有"。

## 2. 改法

新增项目级服务端工作流端点 `POST /api/wf/extract-subjects`,把提取这一步搬到与三条分集工作流同一条注入链上:

| 文件 | 改动 |
|---|---|
| `js/wf-core.js` | `WF_BOARD` 补 `'extract-subjects': '主体'`;`buildExtractUser(text, mode, types, ctx)` 增第四参 `ctx={personaNote,memText}`(注入段落落在要求清单之后、剧本正文之前);新增 `EXTRACT_SYSTEM` 收口两端手抄的 system 句 |
| `server.js` | 新增 `/api/wf/extract-subjects` 端点(读项目剧本 → `wfPersonaNote(tree, p, '主体')` + `WfCore.memBlock(tree.agentMemory, p.name, '主体')` → `wfLLM(llm.extract)` → `normalizeExtracted`);`wfMockOut` 补 `extract` 罐头 |
| `cli.js` | `EXEC['project.extractSubjects']` 由 `POST /api/llm/chat` 改为 `POST /api/wf/extract-subjects`,提示词拼装/结果规整随之下沉服务端,CLI 只保留 headless 入库合并 |
| `js/episode-util.js` | `llmExtractSubjects(..., p)` 按 `WF_BOARD['extract-subjects']` 板块取 `personaNoteFor(p, board)` 与 `memBlock`,与服务端同一装配口;system 改取 `WfCore.EXTRACT_SYSTEM` |
| `js/commands.js` / `js/director.js` | 两个调用点把当前项目 `p` 传下去(浏览器侧注入所需的数据面) |
| `tests/*` | unit +1、integration +4、cli.smoke +2(见第 4 节;顺带给相邻的 wf 命令补一处 1.1s 间隔,新增调用会挤到端点 2 次/秒限流线上) |
| `README.md` | API 表新增一行;`exec` 词表与专家体系段同步(`WF_BOARD` 四条、CLI 命令列表) |

生效顺序沿用 G-01:`p.boards['主体'].expert`(板块雇佣,即"选角美术指导"席位)> `settings.hiredExpert`(全局雇佣)> 不注入。记忆按「主体」板块召回,与该板块 Agent 同算法。

注入后的提取提示词(节选):

```
- 每类最多 12 个主体
专家方法论(冷峻悬疑导演):你是冷峻悬疑导演。创作原则:克制叙事,善用信息差与伏笔…
历史协作记忆(用户过往的偏好与已确认的修改决定,参考以保持一致):
- 女主统一叫林晚晴,别名晚晴
剧本:
…
```

### 为什么端点不写回 state

三条分集工作流都写回 state,提取主体**只出候选**:入库口径两端本就不同——浏览器解析向导要让用户勾选后再合并,CLI headless 全量合并。把入库留给调用方,避免同一端点扛两套语义;端点返回 `{found, truncated, model}`,CLI 继续走原有 `withProject` 合并(同名同类不覆盖、缺提示词/人设补齐、别名进 `formerNames`),入库行为与改造前逐字节一致。

## 3. 纪律对照

- **计费**:动作仍是 `llm.extract`,但由服务端 `wfLLM` 定死(不再接受客户端 `billingAction` 标签);浏览器路径仍走 `Tasks.run`。失败一律先退费再如实报错,不用占位冒充。
- **前置拦截零计费**:CLI 仍在本地判"项目无剧本"→ `blocked/no-script`,零调用零计费;服务端重读剧本正文作为权威来源。
- **双端单源**:提示词模板、可信性校验、结果规整、system 句、板块映射全部在 `js/wf-core.js`;`wf-core` 只吃入参,不碰 `window`/state。
- **唯一装配口**:服务端仍只有 `wfPersonaNote` 一处(contract 断言把调用点计数从 6 提到 7,新增 LLM 步漏注入时先红)。
- **最小改动**:`buildExtractUser` 第四参可选,未雇佣且无记忆时提示词与改造前逐字节一致(有断言)。

## 4. 验收证据

```
node --check js/wf-core.js js/episode-util.js js/commands.js js/director.js cli.js server.js   # 全部通过
node tests/unit.js          # 252/252 PASS(基线 251,本轮 +1)
node tests/integration.js   # 93/93 PASS(基线 89,本轮 +4)
node tests/cli.smoke.js     # 61/63(基线 59/61;2 项失败与本轮无关,改动前后同样失败:「未登录 whoami」「llm --json mock 链路」)
```

新增断言:

1. `contract · 提取主体走 wf 通道:CLI 不再直打 /api/llm/chat,两端按主体板块注入人设与记忆`——源码扫描 CLI 提取段落只出现 `/api/wf/extract-subjects`(封死回潮)、服务端端点与 `llm.extract` 就位、浏览器同板块同注入口;外加提示词行为断言:空注入与未注入逐字节一致、注入后含板块专家方法论与主体板块记忆、注入段在剧本正文之前。
2. `integration ×4`——`wf/extract-subjects` 200 返回三类候选、候选带别名/提示词、端点不写回 state、项目不存在 404。
3. `cli.smoke ×2`——`exec project.extractSubjects` 走服务端工作流后 ok + 主体入库(`added=3, total=4`)、无剧本项目 `blocked/no-script`。

真实上游链路人工核验(临时 stub 上游截获请求体,`MV_CONFIG` 指向临时配置,不碰仓库 `config.json`):

- 雇佣 `ex_suspense` + 写入一条「主体」板块记忆后调用端点,上游收到的 user 消息**含**「专家方法论(冷峻悬疑导演):…」与「历史协作记忆…- 女主统一叫林晚晴,别名晚晴」,且注入段在剧本正文之前;system 为 `EXTRACT_SYSTEM`。
- 上游返回 500 时端点 502 如实报错「LLM 请求失败(500):…」,钱包余额前后一致(100 → 100),退费闭合。

## 5. 与并行分支的关系

本轮基于 W6 集成分支收尾后的头部(`e1074f7`),只新增/改动上表的文件,是一次可直接快进的增量提交。若集成分支后续再合入含 `js/wf-core.js` 提取段或 `cli.js` 提取命令的分支,冲突解法:

- `buildExtractUser` 取四参签名(三参调用形式输出不变,老调用点无需改写)。
- `cli.js` 提取命令取 wf 通道版本;任何"直打 `/api/llm/chat`"的写法都会被 contract 断言拦下。
- `WF_BOARD` 取四键版本,contract 断言中的 `wfPersonaNote` 调用点计数按实际 LLM 步数维护。

## 6. 未做与后续

- **同病未改**:G-04 的 `/api/wf/split-episodes` 虽已是服务端工作流,但端点内没有人设/记忆注入(`wfPersonaNote` 零命中,计费 `llm.chat`)。本轮按"只改提取主体调用链"的边界不动它;补法与本轮一致——`WF_BOARD` 加 `'split-episodes': '剧本'`,`buildSplitUser` 加 `ctx` 注入位,端点取一次 `wfPersonaNote` + `memBlock`,contract 断言的调用点计数随之 +1。
- 浏览器提取仍走 `/api/llm/chat` + 客户端拼装(保留离线回退本地启发式与勾选入库的向导语义),只是注入口与服务端同源;若后续要让浏览器也复用 `/api/wf/extract-subjects`,需先给端点补"候选回传 + 前端勾选"之外的离线降级约定。
- 未从提取结果反向沉淀记忆(例如把用户在向导里改过的主体名写回 agentMemory),属于 G-02 消费面的后续增量。
