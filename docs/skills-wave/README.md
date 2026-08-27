# docs/skills-wave · 主线 skill 层方案索引

主线口径:**剧本 → 主体 → 分集 → 分镜 → 生成 → 审片 → 成片**。
本目录放方案、判定标准、落地记账与核验件;实现落在 `js/` 与 `server.js`/`cli.js`/`mcp.js`。

## 索引

| 文档 | 内容 | 什么时候看 |
|---|---|---|
| [w1-pipeline-skill-map.md](./w1-pipeline-skill-map.md) | 现有 skill/专家/智能体资产清单(五层)、主线七步对照表、15 项缺口(G-01…G-15)、建议纳入与建议丢弃的 skill 概念、UMD/注册表单一来源接入方案 | 想知道"现在有什么、缺什么" |
| [w1-architecture-spec.md](./w1-architecture-spec.md) | 分层与扩展点、W2/W3/W4 可执行拆分(范围/接口契约/验收/风险)、全波通用验收标准、禁止项 | 想知道"接下来怎么改、改完怎么验" |
| [w1-inventory.md](./w1-inventory.md) | 仓库真实盘点:文件级清单、UI–CLI–server–MCP 四端加载矩阵、持久化键位 | 想查某个资产在哪一端加载、落哪个键 |
| [w1-relevance-rubric.md](./w1-relevance-rubric.md) | 相关性判定标准:R1–R4 正向维度 + C1 成本、否决项 V1–V11、三档判定与降级去向 | 判断某个能力该不该做 |
| [w1-selected-skills.md](./w1-selected-skills.md) | 入选短名单 30 条内部能力 SK-01…SK-30、波次配比、键位覆盖、新登记缺口 S-01…S-07 | 查某条能力的编号、波次与落点 |
| [w1-feishu-doc-a-extract.md](./w1-feishu-doc-a-extract.md) | 外部资料 A 的结构化提取(成片产线清单),含抓取阻塞与计数出入的如实记录 | 追溯短名单的素材来源 |
| [w1-feishu-doc-b-extract.md](./w1-feishu-doc-b-extract.md) | 外部资料 B 的结构化提取(视频能力集合 53 条,12 层分类)与许可约束 | 同上 |
| [w1-feishu-raw-notes.md](./w1-feishu-raw-notes.md) | 抓取记录与交叉核对:七条抓取路径的实测过程,供复现 | 需要重跑抓取或核对原文时 |
| [w2-kb-sections-wiring.md](./w2-kb-sections-wiring.md) | `KB.SECTIONS` 升为按键取用面、5 个消费点改按键取用、压缩块由 `DIGESTS` 同键拼装 | 改知识库条目或注入点前 |
| [w2-skills-align-30.md](./w2-skills-align-30.md) | `js/skills.js` 索引对齐短名单 30 条的落地口径与记账(pending 纪律) | 往注册表加条目前 |
| [w3-g01-expert-persona.md](./w3-g01-expert-persona.md) | G-01 雇佣专家 persona 进 `/api/wf/*`:板块雇佣 > 全局雇佣,双端唯一装配口 | 改人设注入链路前 |
| [w3-g02-memory.md](./w3-g02-memory.md) | G-02 长期记忆双端复核件(零代码槽):覆盖度取证与 5 项残留登记 | 改记忆召回/注入前 |
| [w3-g03-review-step.md](./w3-g03-review-step.md) | G-03 审片升为 `Domain.workflow` 主线一等步骤及四个消费面接通 | 改主线步骤集合前 |
| [w3-g04-headless-front.md](./w3-g04-headless-front.md) | G-04 剧本拆集下沉 `wf-core` + `/api/wf/split-episodes` + 领域命令/CLI/MCP 入口 | 改拆集或 headless 起跑链路前 |
| [w4-g05-tpl-video.md](./w4-g05-tpl-video.md) | G-05 `settings.tplVideo` 定性与接入(改在提示词成型阶段,不动生成指纹) | 改模板三件套前 |
| [w4-shot-size-glossary.md](./w4-shot-size-glossary.md) | G-07 机位词表归一:景别阶梯/运镜/角度结构表下沉 `wf-core.js`、`sizeGap` 级差、15 个消费点逐点对照、指纹影响面 | 改景别/运镜取值或其消费点前 |
| [w4-subject-ref-check.md](./w4-subject-ref-check.md) | SK-12 分镜↔主体引用完备性校验(`Skills.CHECKS` 首条实现,只报不拦) | 加校验项前 |
| [w4-sk13-consistency.md](./w4-sk13-consistency.md) | SK-13 跨镜头主体一致性校验,与 SK-12 成对闭合 S-03 | 同上 |
| [w4-film-caption-check.md](./w4-film-caption-check.md) | SK-28 成片字幕时间轴与阅读速度校验,切段口径下沉 `Domain.subtitleSegs` 与合成/SRT 同源 | 改字幕切段、烧录截断线或成片面校验前 |
| [w4-audio-meta.md](./w4-audio-meta.md) | 配音渲染清单单源:音色配置/配音文本/渲染凭据口径下沉 `Domain`,成片路径按清单取音轨 | 改配音生成或成片音轨取值前 |
| [w5-cycle1-audit.md](./w5-cycle1-audit.md) | 周期 1 逐项目独立核验报告:成熟度分档、分叉风险实测、合入次序建议 | 想知道每项做到哪一步、分叉在哪 |
| [w6-integration-log.md](./w6-integration-log.md) | 周期 1 成果收敛到集成分支的记录:冲突解法、合并后测试数字、剩余分叉 | 想知道主干现在是什么状态 |
| [w6-extract-subjects-wf.md](./w6-extract-subjects-wf.md) | 提取主体接入 `/api/wf/extract-subjects`(前段命令吃到人设与协作记忆,提示词拼装/结果规整下沉服务端) | 改提取主体链路前 |
| [w8-split-episodes-inject.md](./w8-split-episodes-inject.md) | 剧本拆集端点补齐人设/记忆注入(`WF_BOARD` 加「剧本」板块、`buildSplitUser` 注入位、两端同装配口) | 改拆集提示词或新增 `/api/wf/*` LLM 步前 |
| [w8-script-check.md](./w8-script-check.md) | SK-07/08/09 剧本段三条校验项,闭合 S-01 的剧本半 | 加校验项前;或想知道剧本正文怎么被判定 |
| [w9-eps-structure-check.md](./w9-eps-structure-check.md) | SK-14/SK-15 分集段两条校验项,与 W8 成对闭合 S-01(六阶段覆盖 + 付费卡点位置) | 同上;或想知道分集表与集序怎么被判定 |
| [w9-integration-log.md](./w9-integration-log.md) | 剩余分支收敛到集成分支的记录:包含性实测、并集型冲突解法、合并后测试数字、剩余未合 | 想知道主干现在是什么状态 |
| [w11-preflight-film-assert.md](./w11-preflight-film-assert.md) | 就绪检查消费面并集补断言:字幕面被摘掉的两种写法实测、双端行为/结构断言分工、五种摘法转红验证 | 改 `episode.preflight` 的 `result.checks` 或新增校验面前 |
| [w12-size-gap-check.md](./w12-size-gap-check.md) | SK-18 分镜景别衔接校验(`WfCore.sizeGap` 单源落成校验项:连续同景别/两极对切/整集无递进) | 加分镜面校验项或改景别级差判据前 |
| [w13-integration-log.md](./w13-integration-log.md) | SK-14/15 分集段、SK-18 分镜段与 W11 断言收敛到集成分支的记录:五面并集冲突解法、被并集断言接住的转红点、合并后测试数字 | 想知道主干现在是什么状态 |

## 一分钟摘要(周期 1 收敛后)

- 资产不缺,缺索引:知识在 `js/knowledge.js`(17 条目)、提示词在 `js/prompts.js`(6 条)、人设在 `js/experts-data.js`(16 专家)、编排在 `js/cmd-registry.js`,层与层之间的按主线步骤索引由 `js/skills.js`(30 条内部能力)承担。
- 主线七步在代码里齐了:`Domain.workflow` 已含"审片"步(G-03),`js/skills.js` 的 `STAGES` 七步全部 `wfStep: true`。
- 贯通缺口已收口的部分:专家人设(G-01)与协作记忆(G-02 由 agent-flow 覆盖)进 `/api/wf/*`,CLI/MCP 同链路吃到;剧本拆集(G-04)补上机读入口,headless 可从"一份整部剧本"起跑,其 LLM 步也已接入同一注入链(见 [w8-split-episodes-inject.md](./w8-split-episodes-inject.md))。
- 空挂已清:`settings.tplVideo`(G-05)与 `KB.SECTIONS`(G-15/G-08 的 KB 侧)都有了消费方,并有断言防回退。
- 校验宿主五面齐了:剧本面(S-01,SK-07/08/09)、主体面(S-03,SK-12/13)、分集面(SK-14/15)、分镜景别面(SK-18,级差取 `WfCore.sizeGap` 词表单源)、成片字幕面(S-06,SK-28)共九条 `Skills.CHECKS` 校验项,剧本面与分集面成对闭合 S-01;两端就绪检查按主线步序同挂 `result.checks`,问题中心同挂低危提醒——纯本地零 LLM 零计费,只报不拦。五面并集与步序由行为断言(浏览器端真跑命令看回执)+ 双端源级断言(段内同一条 `checks` 表达式 + 按登记 `cmds` 反查漏消费)锁死,见 [w11-preflight-film-assert.md](./w11-preflight-film-assert.md);新增一面漏接就绪检查时这两条先红,W13 收敛 SK-18 时实测接住过。
- 人设/记忆注入面覆盖五条工作流:理解、分镜、审片、提取主体、剧本拆集(`WfCore.WF_BOARD` 五键单源,服务端唯一装配口 `wfPersonaNote` 由契约断言锁死调用点数)。
- 词表分叉已收口:景别/运镜/视角/角度四张词表的单一来源在 `js/wf-core.js`,`camera.js`/`review.js`/`sb-io.js`/`agent.js` 全派生(G-07,见 `w4-shot-size-glossary.md`)。

## 阅读约定

- **缺口编号**:`G-01…G-15` 出自资产图谱,**冻结在 15 项不再新增**;新登记的缺口一律走短名单的 `S-xx` 命名空间。判定标准文档里提议的 `G-16`(发布后→上游回路)按此规则改记为 `S-08`。
- `docs/Agent贯通落地-G1-G5.md` 里的 `G1–G5` 是该文自带的历史编号,与本目录的 `G-0x` 不是同一套,对应关系见该文与 [w5-cycle1-audit.md](./w5-cycle1-audit.md) 第 2.18 节。
- 文档描述功能本身,不写功能溯源。
- 动工前先看 [w13-integration-log.md](./w13-integration-log.md) 的"剩余未合与残留"(更早的分叉登记在 [w9-integration-log.md](./w9-integration-log.md) 与 [w6-integration-log.md](./w6-integration-log.md) 第 5 节),避免重做已落地的部分。
