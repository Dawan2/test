# W8 · 剧本拆集接注入链(`/api/wf/split-episodes` 吃到人设与协作记忆)

> 基线 `cursor/w7-integration-fa8a @ 7a56b94`(W7 集成:G-07 机位词表归一 + SK-28 成片字幕质检合入后的头部,已含 G-01 唯一装配口 `wfPersonaNote` / G-02 记忆下沉 / G-03 审片主线步 / G-04 拆集端点)。
> 只补注入,不动拆集算法(模式判定/锚点切分/覆盖守卫逐字不变),不新增计费动作,不碰 `js/skills.js`。

## 1. 问题

`/api/wf/split-episodes` 早就是服务端工作流,但端点内 `wfPersonaNote` 零命中:同一条主线上,本集理解/智能分镜/智能审片三条工作流的提示词都注入了「生效专家方法论 + 协作记忆」,**拆集这一步没有**。后果是主线最前段的分集节奏判断听不到雇佣专家的方法论,也不认识用户此前确认过的口径(例如角色统一叫法),而分集切点一旦定下,后面每一集的分镜与生成都跟着走。

浏览器侧同病:`EpisodeUtil.llmSplitEpisodes` 只拼提示词,同样不注入——两端一致地"都没有"。

## 2. 改法(四步)

| 步 | 文件 | 改动 |
|---|---|---|
| 1 | `js/wf-core.js` | `WF_BOARD` 补 `'split-episodes': '剧本'`(板块值是 `AGENT_BOARDS` 已有的「剧本」板块,该板块 Agent 即主编剧) |
| 2 | `js/wf-core.js` | `buildSplitUser(text, n, ctx)` 增第三参 `ctx={personaNote,memText}`,注入段落落在要求清单之后、剧本正文之前;`personaNote` 独立成行时去掉句首「。」(与 `directorNote` 同通道口径) |
| 3 | `server.js` | 拆集端点的 `wfLLM` 调用拼 `personaNote: wfPersonaNote(tree, p, WfCore.WF_BOARD['split-episodes'])` + `memText: WfCore.memBlock(tree.agentMemory, p.name \|\| '', ...)` |
| 4 | `js/episode-util.js` / `js/proj-upload.js` | 浏览器同一装配口:`llmSplitEpisodes(..., p)` 取 `personaNoteFor(p, board)` 与 `WfCore.memBlock(Store.state.agentMemory, p.name, board)`;`splitCore` 把当前项目传下去 |

生效顺序沿用 G-01:`p.boards['剧本'].expert`(板块雇佣)> `settings.hiredExpert`(全局雇佣)> 不注入。记忆按「剧本」板块召回,与该板块 Agent 同算法。

注入后的拆集提示词(节选,上游实收):

```
要求:每集剧情相对完整、节奏卡点合理;第一集 anchor 为全文开头第一句;anchor 必须能在原文中逐字找到。
专家方法论(冷峻悬疑导演·剧本板块):你是冷峻悬疑导演。创作原则:克制叙事,善用信息差与伏笔…
历史协作记忆(用户过往的偏好与已确认的修改决定,参考以保持一致):
- 女主统一叫林晚晴,别名晚晴
剧本:
开场:女主在宴会上被当众羞辱,众人哄笑不止。
…
```

### 没做的事

- **不重做拆集算法**:`splitMode` / `splitTargetCount` / `localSplitEpisodes` / `splitByAnchors` / `splitInflight` 一字未动;markers 与 even 两条零 LLM 路径不经注入位(本就不发提示词)。
- **不动计费**:动作仍是 `llm.chat`(与浏览器同笔同价),失败仍是"先退费再 502 如实报错、提示可加 `local` 零计费兜底"。
- **不改 system 句**:两端的 `'你是专业的短剧策划编辑。'` 保持现状,不在本轮顺手收口(那是另一处双端字面重复,与注入无关)。

## 3. 纪律对照

- **唯一装配口**:服务端仍只有 `wfPersonaNote` 一处;contract 断言把调用点计数从 6 提到 7(新增 LLM 步漏注入时先红)。
- **双端单源**:板块映射与提示词模板全在 `js/wf-core.js`,`wf-core` 只吃入参,不碰 `window`/state;两端注入串由同一 `WfCore.personaFor` / `WfCore.memBlock` 产出,同一雇佣状态下提示词逐字节一致。
- **最小改动**:`buildSplitUser` 第三参可选,未雇佣且无记忆时提示词与改造前逐字节一致(有断言)。
- **零计费路径不受影响**:markers/even 与 `local` 参数仍是零 LLM 零计费。

## 4. 验收证据

```
node --check js/wf-core.js js/episode-util.js js/proj-upload.js server.js tests/unit.js   # 全部通过
node tests/unit.js          # 265/265 PASS(与基线同数:断言补在既有测试项内)
node tests/integration.js   # 89/89 PASS
node tests/cli.smoke.js     # 60/62(与基线逐项相同;2 项失败与本轮无关:「未登录 whoami」「llm --json mock 链路」,基线同样失败)
```

新增断言(均补在既有测试项内,不新增测试项):

1. `contract · 专家人设单源`——`WF_BOARD` 键表为 `understanding,smart-storyboard,smart-review,split-episodes`、每个板块值都是 `AGENT_BOARDS` 已有板块、拆集端点用 `WF_BOARD['split-episodes']` 取板块、`wfPersonaNote` 调用点计数 7。
2. `split · buildSplitUser`——空 `ctx` 与三参调用逐字节一致、注入后含「专家方法论(…·剧本板块)」与「历史协作记忆」、注入段在剧本正文之前、独立成行时无「。专家方法论」残留标点。
3. `split · 双端单源(源级)`——服务端拆集经 `wfPersonaNote` + 按剧本板块 `memBlock`;浏览器 `episode-util` 同板块同装配口;`splitCore` 把项目传给 `llmSplitEpisodes`。

真实上游链路人工核验(临时 stub 上游截获请求体,`MV_CONFIG` 指向临时目录,不碰仓库 `config.json`):

- 「剧本」板块雇佣 `ex_suspense` + 写入一条「剧本」板块记忆后调用端点:上游收到的 user 消息**含**「专家方法论(冷峻悬疑导演·剧本板块):…」与「历史协作记忆…- 女主统一叫林晚晴,别名晚晴」,注入段在剧本正文之前;system 仍为「你是专业的短剧策划编辑。」;返回 `mode=llm, count=2`,扣费 1 分。
- 上游返回 500 时端点 502 如实报错「LLM 请求失败(500)」,余额前后一致(199 → 199),退费闭合。

## 5. 与并行分支的关系

同期在跑的 `w6-extract-subjects-wf`(G-16 提取主体接 `/api/wf/*`)也改 `WF_BOARD` 与 contract 断言,冲突解法:

- `WF_BOARD` 取**并集**(`understanding,smart-storyboard,smart-review` 之后按合入次序追加 `split-episodes` 与 `extract-subjects`),contract 断言里的键表字符串按实际顺序改写。
- `wfPersonaNote` 调用点计数按合入后的实际 LLM 步数维护(本轮 +1,提取主体那轮再 +1)。
- `js/wf-core.js` 两处改动落在不同函数(`buildSplitUser` / `buildExtractUser`),除 `WF_BOARD` 一行外无重叠。

W8 的剧本 check 类改动集中在 `js/skills.js` 的 `CHECKS`,本轮完全不碰该文件。

## 6. 后续

- 拆集结果未反向沉淀记忆(例如用户手改集数/切点后写回 `agentMemory`),属 G-02 消费面的后续增量。
- 两端 system 句仍是各自的字面量;若后续收口,按 `EXTRACT_SYSTEM` 的做法在 `wf-core.js` 加一个常量,两端同取。
- markers 模式(零 LLM)天然不吃专家方法论:若要让"有集标记但切点不合理"的剧本也过一遍专家判断,得先定"标记优先 vs 节奏优先"的产品口径,不在本轮范围。
