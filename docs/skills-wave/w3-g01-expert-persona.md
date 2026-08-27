# W3 · G-01 专家人设过服务端(雇佣专家 persona 进 `/api/wf/*` 与 CLI/MCP 主线)

> 基线 `master @ 9adcf0f`。规格见 `docs/skills-wave/w1-architecture-spec.md` 第 3 节 W3 第 2 项;缺口定义见 `docs/skills-wave/w1-pipeline-skill-map.md` G-01。
> 本轮只做 G-01 的服务端/双端注入,不碰 `js/skills.js` 条目表(W2 交付物),也不改计费动作与主线步骤集合。

## 1. 缺口复核(动工前的现状)

G-01 原文:`/api/wf/*` 不注入 `hiredExpert.persona`、`p.boards[key].expert.persona`。

`master @ 9adcf0f` 复核结果:

| 事项 | 复核命令 | 结论 |
|---|---|---|
| 服务端 persona 注入 | `rg -n "persona" server.js` | 零命中——三条 wf 端点只吃 `Prompts` + `KB.reviewBlock()` + `directorSetting`(+ 二十二轮的 `projTypeOf` 模式标注) |
| 板块专家 | `rg -n "boards" server.js` | 零命中——`p.boards[key].expert` 服务端完全不可见 |
| 浏览器工作流 persona | `js/sb-llm.js` / `js/understanding.js` / `js/review.js` | 三处 ctx 装配均无 persona 字段:雇佣专家此前**只对 Agent 对话面板生效**(`js/agent.js` `expertPersona`/`boardExpertBlock`),不进创作工作流 |

并行分支 `origin/cursor/agent-flow-sota-analysis-736a`(未合并 master)的覆盖情况:

- **已覆盖**:全局雇佣专家 `settings.hiredExpert` → `WfCore.personaNote(ex)` → 三条 wf 端点 + 三个浏览器委托点(提交 `10566c3`,见该分支 `docs/Agent贯通落地-G1-G5.md` G1 段)。
- **未覆盖**:`p.boards[key].expert.persona`(板块雇佣的功能专家)——该分支 `server.js` 全文无 `boards` 命中,`personaNote(ex)` 只接一个已解析好的专家对象,没有"板块 > 全局"的解析口。

因此本轮的取舍:**不重做已覆盖的部分**(注入通道、文案格式、截断口径全部沿用该分支的 `personaNote` 语义与字面),只补齐缺的那一半——板块专家解析 + 双端唯一装配口。合并时两边收敛到本轮的超集签名即可(见第 5 节)。

## 2. 本轮改了什么

| 文件 | 改动 |
|---|---|
| `js/wf-core.js` | 新增 `personaNote(ex, board)`(通道与 `directorNote` 同款,`board` 非空时标注板块;无专家/空 persona 返回空串;persona 截断 ≤200 字)、`WF_BOARD`(工作流→板块映射单一来源)、`personaFor(o)`(解析 + 拼装,数据全部经参数注入);`buildUndUser`/`buildSBUser`/`buildReviewPrompt` 各加一个 `ctx.personaNote` 注入位 |
| `js/experts-data.js` | 新增 `allOf(customs)`——"预置 + 自定义"的合并口径双端单源(`projTypeOf` 改为复用) |
| `js/experts.js` | `allExperts()` 改为委托 `ExpertsData.allOf`;新增 `window.personaNoteFor(p, board)` 作为**浏览器侧唯一装配口** |
| `js/understanding.js` / `js/sb-llm.js` / `js/review.js` | 三个委托点各取一次 `personaNoteFor(p, WfCore.WF_BOARD[...])` 传进 ctx |
| `server.js` | 新增 `wfPersonaNote(tree, p, board)` 作为**服务端唯一装配口**(经 `ExpertsData.allOf` + `WfCore.personaFor`);`/api/wf/understanding`、`/api/wf/smart-storyboard`(拆镜主步 + 内部理解步)、`/api/wf/smart-review`(逐镜 ctx)四个 LLM 步全部注入 |
| `tests/unit.js` | `experts` 套件 +3 项、`contract` 套件 +1 项(见第 4 节) |
| `README.md` | API 表三行 + 专家体系段 + 单测覆盖描述与断言数同步 |

生效顺序与板块映射:

```
生效专家 = p.boards[board].expert(板块雇佣) > settings.hiredExpert(全局雇佣) > 不注入
WfCore.WF_BOARD = { understanding: '导演', 'smart-storyboard': '分镜', 'smart-review': '成片' }
```

"板块雇佣优先"与助手身份解析(`js/agent.js` `gPersonaBlock`:下拉 > 板块 > 全局)同序;板块键取 `AGENT_BOARDS` 已有板块,不新增板块。板块专家 id 失效(专家被删)时回退全局雇佣,不静默丢注入。

注入后的文案(拆镜提示词为例):

```
- 项目风格:漫剧…;项目类型:剧情模式(重台词表演)。导演设定:…。专家方法论(摄影指导·分镜板块):你是摄影指导。方法论:景别即情绪…
```

## 3. 纪律对照

- **UMD 不碰 window**:`wf-core.js` 只消费入参(`experts` / `hiredId` / `boards` / `board`),不解析 state、不引用 `window`/`Store`;专家表与雇佣态由两端各自注入(浏览器 `allExperts()` + `Store`,服务端 `ExpertsData.allOf` + state 树)。`experts-data.js` 在 `index.html` 里晚于 `wf-core.js` 加载,所以 `wf-core` **不** require 它,只接数据。
- **最小改动**:三条提示词各只增一个 `${ctx.personaNote || ''}` 插槽,未雇佣时输出与改造前逐字节一致(有断言)。
- **计费不变**:无新增计费动作、无新增 LLM 调用步;付费路径仍是 `Tasks.run`(浏览器)与 `wfLLM`(服务端定死动作,失败退费)。
- **不抢他人文件**:未新增/修改 `js/skills.js` 条目表;`js/prompts.js`、`js/knowledge.js` 未改。
- **CLI/MCP 无需改动**:`cli.js` 的 `episode.understanding`/`episode.generateStoryboard`/`episode.smartReview` 与 `mcp.js` 的 `hujing_exec` 都走 `/api/wf/*`,注入在端点内完成,机读入口自动吃到人设。

## 4. 验收证据

```
node --check js/wf-core.js js/experts.js js/experts-data.js js/sb-llm.js js/understanding.js js/review.js server.js   # 全部通过
node tests/unit.js          # 205/205 PASS(改动前 201 项,本轮 +4)
node tests/integration.js   # 79/79 PASS(含 wf/understanding、wf/smart-storyboard、wf/smart-review MOCK_LLM 编排)
node tests/cli.smoke.js     # 51/53(2 项失败与本轮无关:改动前后同样失败——「未登录 whoami」与「llm --json mock 链路」)
```

新增断言:

1. `experts · wf-core.personaFor:板块雇佣专家 > 全局雇佣专家 > 不注入`——六路口径:无雇佣不注入 / 仅全局 / 板块优先且标板块 / 板块 id 失效回退全局 / 其他板块不串味 / 空 persona 不注入,外加 200 字截断。
2. `experts · 专家 persona 进三条工作流提示词:缺省输出不变,注入后三处均带方法论段`——对三个提示词构造函数逐一断言「缺省 `personaNote` 与空串输出相同」以及「注入只改锚点那一处」(行为等价保证)。
3. `experts · 双端同源:浏览器 personaNoteFor 与服务端 wf 装配口输出逐字节一致`——同一雇佣状态(全局 `ex_suspense` + 分镜板块 `ex_dp` + 成片板块自定义专家)下,三个板块的注入串两端逐字节相等。
4. `contract · 专家人设单源:/api/wf/* 三条工作流均经 wfPersonaNote 注入,板块键取自 WF_BOARD`——源码扫描:装配口唯一、三条端点都用 `WF_BOARD` 取板块键、调用点计数与 wf 的 LLM 步数一致(新增 LLM 步漏注入时此断言先红)、`WF_BOARD` 的板块值都是 `AGENT_BOARDS` 已有板块。

## 5. 与并行分支的合并说明

`origin/cursor/agent-flow-sota-analysis-736a` 合并时,`js/wf-core.js`、`server.js`、三个浏览器委托点会有文本冲突,语义上取本轮版本即可:

- `personaNote(ex)`(该分支)是 `personaNote(ex, board)`(本轮)的**单参调用形式**,输出对全局雇佣场景逐字节相同,该分支的调用点无需改写即可继续工作。
- 该分支的 `ExpertsData.expertOf(hiredId, customs)` 与本轮的 `ExpertsData.allOf(customs)` 互不冲突,可并存(`expertOf` 亦可改为 `allOf(customs).find(...)`)。
- 服务端调用点应统一收敛到 `wfPersonaNote(tree, p, board)`,不要保留"直接 `personaNote(expertOf(...))`"的第二条装配路径——否则板块专家会在部分端点失效。
- 该分支同时带的记忆注入(`memText`,G-02/G4)与本轮无重叠,合并后两个 ctx 字段并存即可。

## 6. 未做与后续

- 板块专家只覆盖 `WF_BOARD` 的三条服务端工作流;主线前段(剧本拆集、LLM 主体提取)尚无服务端工作流端点(G-04),那两步的人设注入随 G-04 一并处理。
- 功能型专家仍只有 `persona` 文本、没有输入/输出契约(G-09),本轮不动。
- 审片未升为主线一等步骤(G-03),本轮不动。
