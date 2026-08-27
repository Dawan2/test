# G-04 主线前段 headless 打通(剧本拆集)

## 缺口

主线是 剧本 → 主体 → 分集 → 分镜 → 生成 → 审片 → 成片。此前 headless(CLI/MCP/外部 Agent)只能从**分集**起跑:

- `episode-add` / `episode-script` 逐集手写剧本正文 —— 拿到的是"一份整部剧本"时,Agent 得自己切,切法与产品口径不一致(标题格式、原文是否逐字保留、每集字数节奏都对不上)。
- "整部剧本 → 分集"的模式判定与三种切分算法只存在于浏览器上传弹窗 `js/proj-upload.js` 的 `doSplitRun` 里,DOM 强耦合,服务端无法复用。

结果:headless 主线有个断点,必须先开浏览器手动拆一次集才能继续。

## 已由并行槽覆盖、本槽不重做

`cursor/agent-flow-sota-analysis-736a` 的 G5 已补 `project.extractSubjects`(LLM 主体提取)与 `subject.generateImage` 两条领域命令,主体提取的 headless 入口在那边落地。本槽只做**剧本拆集/分集**,不碰主体提取的 hunk。

同理避开并行槽:G-01 的 `/api/wf` 专家人设注入、G-02 的跨端 memory,本槽的 server.js 改动限于新增 `/api/wf/split-episodes` 端点块与 `wfMockOut` 的 `split` 分支。

## 落地

### 1. 算法下沉 `js/wf-core.js`(双端单源)

三种模式,都**逐字保留原文、不改写正文**:

| 模式 | 触发条件 | LLM | 说明 |
| --- | --- | --- | --- |
| `markers` | 集/章标记(`第X集/章/回/篇`)≥2 条 | 不调 | 按标记位置切原文 |
| `llm` | 无标记且正文 ≤ `SPLIT_LLM_MAX`(15000 字符) | 调一次 | 锚点协议 |
| `even` | 长文、LLM 不可用、或显式 `local` | 不调 | 按段落边界均分,每集约 800 字 |

新增导出:`SPLIT_LLM_MAX` / `scriptEpMarkers` / `splitMode(text, llmReady)` / `splitTargetCount` / `localSplitEpisodes` / `buildSplitUser(text, n)` / `splitByAnchors(text, out)` / `splitInflight(p)`。

**锚点协议**是这里的关键约定:LLM 只回 `[{title, anchor}]`——`anchor` 是该集正文开头的原文第一句(≤30 字,要求逐字引用)。正文由本地 `splitByAnchors` 按锚点在原文中定位后切片,LLM 碰不到正文,所以不存在"分集顺手把剧本重写了"的风险。定位失败时的容错:整句找不到退到前 10 字模糊匹配,倒序/重复锚点跳过,首集锚点强制归零(不丢开头),最终有效锚点 <2 条则抛错交调用方决定退费或回退。

### 2. 消费方全部改为委托

- 浏览器:`js/episode-util.js` 的 `splitEpisodes` / `llmSplitEpisodes` 变成薄委托(提示词字面与服务端同源);`js/proj-upload.js` 抽出无 DOM 依赖的 `splitCore(p, scriptText, opts)`,`doSplitRun` 退为 UI 壳(任务条 + toast)。
- 服务端:`POST /api/wf/split-episodes` require 同一份 `wf-core.js`。
- 单测有一条源级断言(`split · 双端单源`)扫描三处调用点,防止哪天有人又抄一份切分算法回去。

### 3. headless 入口

```bash
node cli.js project-script $PID --script-file script.txt          # 写入整部剧本原文(≤20 万字)
node cli.js exec project.splitEpisodes --pid $PID                 # 拆集(自动选模式)
node cli.js exec project.splitEpisodes --pid $PID --overwrite --local   # 覆盖现有分集,强制段落均分零计费
```

四端同一命令:

| 入口 | 路径 |
| --- | --- |
| 浏览器上传弹窗 | `doSplit` → `doSplitRun` → `splitCore` |
| 浏览器命令层 / 导演助手 / 计划 | `Commands.execute('project.splitEpisodes')` → `splitCore` |
| CLI `exec` | `POST /api/wf/split-episodes` |
| MCP | `hujing_project_script` / `hujing_split_episodes` |

命令元数据(label/risk/needs/desc/args)仍由 `js/cmd-registry.js` 单源生成,CLI help 与 MCP 工具描述不手抄。

## 纪律

- **计费**:LLM 分集沿用 `llm.chat`,与浏览器同笔同价;`markers` / `even` 两种模式零 LLM 零计费。浏览器侧走 `Tasks.start` + `API.chatJSON(operationId=任务 id)`(解析重试不重复扣),服务端侧走 `wfLLM`(计费动作服务端定死,不读客户端标签)。
- **失败语义**:浏览器保留"LLM 失败 → toast 报错 → 回退本地均分"(离线可用是浏览器语义);服务端**不静默兜底**——`splitByAnchors` 抛错即 `proxyRefund` 退费 + 502,回执里提示可加 `local` 走零计费均分。
- **覆盖保护**:拆集会整表覆盖 `p.episodes`(连带其下分镜数据),所以已有分集时:UI 走原有覆盖确认弹窗;headless 一律要求 `overwrite` 显式授权,否则 `blocked('has-episodes')` / HTTP 409。浏览器侧旧分集进回收站 7 天可恢复,服务端侧靠 `wfSave` 的 state 快照。
- **在飞守卫**:有镜头/节拍正在生成时一律拒绝重新分集。浏览器复用 `Tasks.canDeleteScope`(本地任务 + 服务端 running/needs_reconcile jobs,任务中心不可达时保守拒绝);服务端用 `WfCore.splitInflight` 数 `video.status === 'generating'`,>0 → 409。

## 测试

- `tests/unit.js` 新增 `split` 套件 6 项(`node tests/unit.js split` 可单跑):三模式判定、标记切分逐字不丢 + 均分集数落在 2–12、锚点协议提示词、锚点切分的首集归零/倒序重复跳过/结构不合法抛错、在飞计数、双端单源源级断言。全量 **210/210 绿**。
- `tests/integration.js` 新增 10 项:`mode=markers` 零 LLM、覆盖保护 409 且状态不动、`overwrite` 后如实回报 `overwritten`、MOCK 下 `mode=llm` 正文按锚点切原文、`local` → `mode=even`、缺剧本 400、项目不存在 404、MOCK 下不扣费。全量 **89/89 绿**。
- `tests/cli.smoke.js` 新增 7 项:`project-script` 写入 → 无 `overwrite` 被 blocked 拦下 → `--overwrite --local` 拆集成功 → 正文逐字保留校验 → 首集直接 `exec episode.generateStoryboard` 出分镜表,全程零浏览器。**58/60**,两项失败(`未登录 whoami`、`llm --json mock 链路`)在 master 上同样失败(master 51/53),与本轮无关。

`/api/wf/*` 端点有限流,冒烟里连续调用之间加了 1.1s 间隔。

## 现状与后续

至此 headless 主线起点从"逐集剧本"前移到"一份整部剧本"。仍需注意:

- 拆集不做剧本规则校验(`validateScriptRules` 的章/集混用、单集 >2000 字提示)——那是 UI 上传弹窗的交互层校验,headless 侧只在回执里给出每集字数,由调用方判断。
- `even` 模式按段落数均分而非字数均分,段落长度悬殊的剧本会出现集间字数不均;这是原有行为,未改。
