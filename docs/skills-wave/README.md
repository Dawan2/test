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
| [w7-integration-log.md](./w7-integration-log.md) | 周期 2 第 7 波收敛记录:4 条分支的合入次序与冲突解法、记忆套件补测、剩余分叉 | 想知道第 7 波收敛成了什么样 |
| [w8-split-episodes-inject.md](./w8-split-episodes-inject.md) | 剧本拆集端点补齐人设/记忆注入(`WF_BOARD` 加「剧本」板块、`buildSplitUser` 注入位、两端同装配口) | 改拆集提示词或新增 `/api/wf/*` LLM 步前 |
| [w8-script-check.md](./w8-script-check.md) | SK-07/08/09 剧本段三条校验项,闭合 S-01 的剧本半 | 加校验项前;或想知道剧本正文怎么被判定 |
| [w9-eps-structure-check.md](./w9-eps-structure-check.md) | SK-14/SK-15 分集段两条校验项,与 W8 成对闭合 S-01(六阶段覆盖 + 付费卡点位置) | 同上;或想知道分集表与集序怎么被判定 |
| [w9-integration-log.md](./w9-integration-log.md) | 剩余分支收敛到集成分支的记录:包含性实测、并集型冲突解法、合并后测试数字、剩余未合 | 想知道主干现在是什么状态 |
| [w10-cycle2-audit.md](./w10-cycle2-audit.md) | 周期 2 集成与 skill 落地独立核验报告:分支逐条成熟度、按父提交漏合的实测佐证、「合并一律取分支 head」的方法性结论 | 想知道某条分支做到哪一步;开集成槽前 |
| [w11-preflight-film-assert.md](./w11-preflight-film-assert.md) | 就绪检查消费面并集补断言:字幕面被摘掉的两种写法实测、双端行为/结构断言分工、五种摘法转红验证 | 改 `episode.preflight` 的 `result.checks` 或新增校验面前 |
| [w12-size-gap-check.md](./w12-size-gap-check.md) | SK-18 分镜景别衔接校验(`WfCore.sizeGap` 单源落成校验项:连续同景别/两极对切/整集无递进) | 加分镜面校验项或改景别级差判据前 |
| [w13-integration-log.md](./w13-integration-log.md) | SK-14/15 分集段、SK-18 分镜段与 W11 断言收敛到集成分支的记录:五面并集冲突解法、被并集断言接住的转红点、合并后测试数字 | 想知道主干现在是什么状态 |
| [w14-review-skills-check.md](./w14-review-skills-check.md) | 审片路径接入 `Skills.check` 只读消费(报告独立字段 `checks` + 弹窗/导出展示,只报不拦)、SK-03/SK-04 的 infra 面记账诚实位对齐 | 改审片报告结构、往审片路径加校验面,或动 `pending` 记账前 |
| [w15-gen-block.md](./w15-gen-block.md) | SK-21 生成步注入面落地:提示词改写人设装配口 `WfCore.genPromptSystem`、`Skills.block('gen')` 从 0 到逐字节可对账、为什么不注生成请求构造点 | 改生成侧提示词注入或去某条目 `pending` 前 |
| [w16-integration-log.md](./w16-integration-log.md) | W12 head 补合(w13 只合到父提交的漏合)与 W14 审片消费收敛到集成分支的记录:并集型冲突解法、被登记侧反查断言接住的转红点、合并后测试数字 | 想知道主干现在是什么状态 |
| [w17-preflight-stages.md](./w17-preflight-stages.md) | 就绪检查校验面清单收成双端单源表 `Skills.preflightStages()`(冲突热点收口:新增一面只改一处),含推导规则、逐字节等价取证与变异验证 | **新增校验面前必读**;改 `episode.preflight` 的 `result.checks` 前 |
| [w18-gen-prompt-unify.md](./w18-gen-prompt-unify.md) | `gen.promptSystem` 收编两端内联:`WfCore.optimizeSystem` 与 `buildOptimizeUser` 配对、CLI 侧覆盖表显式传参、为什么修订链路不接方法论块 | 改审片修订提示词或往注册表收编内联人设前 |
| [w19-g06-inject.md](./w19-g06-inject.md) | G-06 残留两条落地:「多镜头写法」进拆镜人设 `sbSystem`、「主体参考」进主体人设 `extractSystem`、键为什么只挂一个宿主、缺省提示词变长的兼容影响 | 改拆镜/提取主体提示词,或往某一步补 KB 注入前 |
| [w20-cycle3-audit.md](./w20-cycle3-audit.md) | 周期 3(W11–W19)逐项目独立核验报告:锚定 SHA、逐支成熟度 M0–M4、独立 worktree 重跑的测试数字、阻塞与下一目标 | 想知道某条分支做到哪一步;开集成槽前 |
| [w21-integration-log.md](./w21-integration-log.md) | W15/W17/W18/W19 收敛到集成分支的记录:并集型冲突逐处解法、用例名集合比对证明没删测、包含性实测的有效期口径 | 想知道主干现在是什么状态 |
| [w22-g06-check.md](./w22-g06-check.md) | G-06 校验半落地:SK-11 主体参考纪律与 SK-13 多镜头写法的生成前置 warn、判定输入为什么必须是真实生成请求、条目五条里哪几条判得动哪几条不判、新增校验项为什么不用改消费点 | 加生成侧校验项,或想知道参考图组/提示词写法怎么被判定前 |
| [w23-readme-count-assert.md](./w23-readme-count-assert.md) | 文档数字对账契约:README 的「已落地 N 条 / N 项断言 / N 面 N 条」由代码实况反推,取数口径表、变异验证与未纳入对账的部分 | 改 `CHECKS`、加用例或改这两份 README 的数字前 |
| [w24-sk10-ai-voice.md](./w24-sk10-ai-voice.md) | SK-10 文案 AI 味的校验半落地(套话硬禁词/台词书面腔/修饰副词密度三码词法命中):三张词表的取舍口径、为什么不冒充语义审片、注入半为什么仍挂 `pending` | 加剧本面校验项、改 AI 味判据,或想知道文案怎么被词法判定 |
| [w25-integration-log.md](./w25-integration-log.md) | W22 G-06 校验半、W23 文档数字对账契约与 W24 SK-10 文案 AI 味收敛到集成分支的记录:长行文档的句级三方合并解法、合并后必须重对齐的断言逐条说明、用例名集合比对证明没删测 | 想知道主干现在是什么状态 |
| [w26-sk19-stable-lex.md](./w26-sk19-stable-lex.md) | SK-19 抽卡稳定词校验面(判定输入是 `Domain.buildVideoRequest` 装出的真实提示词):三条命中码、词表从条目正文现筛的退空行为、面表自动跟上时两端实现零改动的取证 | 加分镜面校验项,或想知道生成前置 warn 判的是哪一份提示词 |
| [w27-sk10-kb-inject.md](./w27-sk10-kb-inject.md) | SK-10 注入半落地闭合 S-02:自撰「文案AI味」条目进 `KB.SECTIONS`、校验层三张词表改现取条目正文解析(不留第二份)、注入落点为什么选剧本板块方法论清单而非拆镜人设或 `DIGESTS` | 往 KB 加条目、改 AI 味词表,或要让某条校验项的判据与注入面共用一份正文时 |
| [w28-sk22-gen-check.md](./w28-sk22-gen-check.md) | SK-22 生成凭据与确认失效校验落地(生成面从零到一):五个码各报既有机制的哪一处失效点、为什么不复述 `Domain` 已有计数、`preflightStages()` 由登记推导自动多出一面的实测(两端 preflight 实现零改动) | 加生成面校验项,或想验证「新增一面只改一处」前 |
| [w29-integration-log.md](./w29-integration-log.md) | W26 SK-19 稳定词、W27 SK-10 注入半与 W28 SK-22 生成凭据收敛到集成分支的记录:两侧同处各插一块校验实现的解法、长行文档「取一侧 + 按 word-diff 折回对侧」的合并口径、面表首次从五面变六面时两端实现零改动的实测、用例名集合比对证明没删测 | 想知道主干现在是什么状态 |
| [w30-kb-skill-cover.md](./w30-kb-skill-cover.md) | KB 条目登记面契约收紧:并集断言对索引宿主那一向为什么是盲的、`SK-01.kb` 与 `KB.SECTIONS` 双向逐条对齐 + 不重复登记 + 不得有第二个全库宿主、六条变异实测、`剧本诊断`/`场面调度` 的步条目归属为什么留后续 | 往 `KB.SECTIONS` 加条目,或改索引宿主 SK-01 的 `kb` 前 |
| [w31-sk16-playbook.md](./w31-sk16-playbook.md) | SK-16 主线前段编排补齐拆集与主体提取(playbook 2 步 → 4 步):步序为什么取 `Domain.workflow` 同源、`cmds` 为什么改由 `steps` 推出、`args` 为什么一律留空(不替调用方预授权 `overwrite`) | 改编排型条目的 `steps`/`playbook` 产出前 |
| [w32-cycle4-audit.md](./w32-cycle4-audit.md) | 周期 4(W21–W31)逐项目独立核验报告:锚定 SHA、逐支成熟度 M0–M4、独立 worktree 重跑的测试数字、阻塞与下一目标 | 想知道某条分支做到哪一步;开集成槽前 |
| [w33-next-pending-check.md](./w33-next-pending-check.md) | SK-20 镜头动态感准入校验面落地(动作幅度/运镜条数/整集镜长分布三码):判定输入为什么分两段取、与 SK-13 首尾帧插值面的归属边界、S-04 为什么不清账,附短名单里剩余 pending 面的交接清单 | 加分镜面校验项、想知道大幅动作与多运镜怎么被判定,或要接手剩下那几面 pending 时 |
| [w34-integration-log.md](./w34-integration-log.md) | W30 KB 登记面契约、W31 SK-16 前段编排与 W33 SK-20 动态感准入收敛到集成分支的记录:分支自测全绿为什么不等于并入主干全绿(契约覆盖面随基线走)、`cmds` 由 `steps` 推出的零实现改动实测、面内新增项两端实现零改动的实测、长行 README 按 word-diff 折回对侧的合并口径、用例名集合比对证明没删测 | 想知道主干现在是什么状态 |

## 一分钟摘要(周期 2 收敛后)

- 资产不缺,缺索引:知识在 `js/knowledge.js`(18 条目)、提示词在 `js/prompts.js`(7 条)、人设在 `js/experts-data.js`(16 专家)、编排在 `js/cmd-registry.js`,层与层之间的按主线步骤索引由 `js/skills.js`(30 条内部能力)承担。**KB 条目的登记面已收成契约**:`KB.SECTIONS` 与索引宿主 SK-01 的 `kb` 双向逐条对齐、宿主内不重复登记、不得出现第二个全库宿主,新增条目漏登即红并点名缺哪个键(见 [w30-kb-skill-cover.md](./w30-kb-skill-cover.md))。
- 主线七步在代码里齐了:`Domain.workflow` 已含"审片"步(G-03),`js/skills.js` 的 `STAGES` 七步全部 `wfStep: true`。
- 贯通缺口已收口的部分:专家人设(G-01)与协作记忆(G-02 由 agent-flow 覆盖)进 `/api/wf/*`,CLI/MCP 同链路吃到;剧本拆集(G-04)补上机读入口,headless 可从"一份整部剧本"起跑,其 LLM 步也已接入同一注入链(见 [w8-split-episodes-inject.md](./w8-split-episodes-inject.md))。
- 空挂已清:`settings.tplVideo`(G-05)与 `KB.SECTIONS`(G-15/G-08 的 KB 侧)都有了消费方,并有断言防回退。生成步的注入面亦已出块——`Skills.block('gen')` 逐字节等于提示词改写人设 `WfCore.genPromptSystem` 的方法论段(抽卡公式+抽卡军规),SK-21 的 `pending` 随之清空(见 [w15-gen-block.md](./w15-gen-block.md))。G-06 的**注入半到此闭合**:残留两条也已进主线提示词构造点——「多镜头写法」进拆镜人设 `WfCore.sbSystem`、「主体参考」进主体提取人设 `WfCore.extractSystem`,两处缺省提示词随之变长,拼块逐字节对账与兼容影响见 [w19-g06-inject.md](./w19-g06-inject.md)。**G-06 的校验半随后也闭上**:主体参考纪律(SK-11 `subjects.genRefDiscipline`:参考人物超上限 / 有图被参考图组上限挤出 / 三视图当视频参考)与多镜头写法(SK-13 `subjects.multiShotPrompt`:图生视频缺一致性声明 / 首尾帧写大幅动作 / 一镜切太碎)以生成前 warn 落地,判定输入是 `Domain.buildVideoRequest` 那份真实请求,经就绪检查双端消费、只报不拦,`Skills.gaps()['G-06']` 随之归空(见 [w22-g06-check.md](./w22-g06-check.md))。该人设键的取值口已收编到底:审片一键优化与 CLI 修订重抽改经 `WfCore.optimizeSystem` 只取人设句(缺省逐字节不变),覆盖两端一并跟随(见 [w18-gen-prompt-unify.md](./w18-gen-prompt-unify.md))。
- 校验宿主六面齐了:剧本面(S-01,SK-07/08/09;文案 AI 味 SK-10 的校验半随 W24 落地,见 [w24-sk10-ai-voice.md](./w24-sk10-ai-voice.md),注入半随 W27 闭合 S-02——自撰条目进 `KB.SECTIONS` 后校验层的三张词表改现取条目正文,注入与校验共用一份判据,见 [w27-sk10-kb-inject.md](./w27-sk10-kb-inject.md))、主体面(S-03,SK-11/12/13 共四条)、分集面(SK-14/15)、分镜面(SK-18 景别衔接,级差取 `WfCore.sizeGap` 词表单源;SK-19 抽卡稳定词,判定输入是 `Domain.buildVideoRequest` 装出的真实提示词,见 [w26-sk19-stable-lex.md](./w26-sk19-stable-lex.md);SK-20 镜头动态感准入,动作幅度判动作描述那段、运镜条数判装好的真实提示词、镜长分布取该请求的 `duration`,见 [w33-next-pending-check.md](./w33-next-pending-check.md))、生成面(S-05,SK-22 生成凭据与确认失效,判旧与就绪取 `Domain.shotVideoStale/shotVideoReady` 单源,见 [w28-sk22-gen-check.md](./w28-sk22-gen-check.md))、成片字幕面(S-06,SK-28)共十五条 `Skills.CHECKS` 校验项,剧本面与分集面成对闭合 S-01、主体面另接住 G-06 校验半;两端就绪检查按主线步序同挂 `result.checks`,问题中心同挂低危提醒——纯本地零 LLM 零计费,只报不拦。**面清单现为双端单源表 `Skills.preflightStages()`**,由注册表现推(校验面已落地 + 登记 `episode.preflight` 消费点),两端只读该表 `concat`,**新增一面只改一处**(在条目上登记 `checks` 实现与 `cmds`),见 [w17-preflight-stages.md](./w17-preflight-stages.md);W22 的两条、W24 与 W26、W33 的各一条都落在已在表内的面上,故两端消费实现一行未改;W28 落地的是表里原本没有的 `gen` 面,两端消费实现同样一行未改——面表由登记推导,自动从五面变六面。六面并集与步序由行为断言(浏览器端真跑命令看回执)+ 面表源级断言(表与登记侧双向对齐 + 两端只读该表且写法逐字节相同 + 段内不得写死面名)锁死,断言分工的由来见 [w11-preflight-film-assert.md](./w11-preflight-film-assert.md);新增一面漏接或单端退回写死清单时这些断言先红,W13 收敛 SK-18 与 W17 收表时均实测接住过。
- 校验结论已进审片路径(G-10 的第一半):审片报告按镜只读消费剧本面与主体面,命中挂报告独立字段 `checks` 并在弹窗/导出各列一区——不并入 `issues`、不参与评分与达标线、不改发布门计数与计费动作;发布门那一半(SK-29 方法论门)仍 `pending`,见 [w14-review-skills-check.md](./w14-review-skills-check.md)。
- 记账诚实位:`SK-03`/`SK-04`/`SK-23` 的 `infra` 面仍 `pending`(改 `pending` 会动 `Skills.gaps()` 投影,单列一轮),但三条 `note` 已一律写明 G-01/G-02/G-03 的已落地实况,并由断言钉在三处出口的实况上。
- 人设/记忆注入面覆盖五条工作流:理解、分镜、审片、提取主体、剧本拆集(`WfCore.WF_BOARD` 五键单源,服务端唯一装配口 `wfPersonaNote` 由契约断言锁死调用点数)。
- 词表分叉已收口:景别/运镜/视角/角度四张词表的单一来源在 `js/wf-core.js`,`camera.js`/`review.js`/`sb-io.js`/`agent.js` 全派生(G-07,见 `w4-shot-size-glossary.md`)。
- 前段命令全过 wf 通道:剧本拆集(G-04)与提取主体都有服务端端点,人设与协作记忆按板块注入,headless 与浏览器同口径。**编排层也已跟上**:`Skills.playbook('eps.frontPipeline')`(SK-16)从集内两步补成前段四步(提取主体 → 剧本拆集 → 本集理解 → 智能分镜,步序与 `Domain.workflow` 同源),条目 `cmds` 改由 `steps` 推出、四步 `args` 一律留空不预授权,见 [w31-sk16-playbook.md](./w31-sk16-playbook.md)。
- `WfCore.memRecall/memBlock` 有了直接单测(memory 套件 6 条),不再是"实现存在但零断言"的模块。

## 阅读约定

- **缺口编号**:`G-01…G-15` 出自资产图谱,**冻结在 15 项不再新增**;新登记的缺口一律走短名单的 `S-xx` 命名空间。判定标准文档里提议的 `G-16`(发布后→上游回路)按此规则改记为 `S-08`。
- `docs/Agent贯通落地-G1-G5.md` 里的 `G1–G5` 是该文自带的历史编号,与本目录的 `G-0x` 不是同一套,对应关系见该文与 [w5-cycle1-audit.md](./w5-cycle1-audit.md) 第 2.18 节。
- 文档描述功能本身,不写功能溯源。
- 动工前先看**最新一份收敛记录**的"剩余未合与残留",避免重做已落地的部分:当前是 [w21-integration-log.md](./w21-integration-log.md)(更早的分叉登记在 [w16-integration-log.md](./w16-integration-log.md)、[w13-integration-log.md](./w13-integration-log.md)、[w9-integration-log.md](./w9-integration-log.md)、[w7-integration-log.md](./w7-integration-log.md) 与 [w6-integration-log.md](./w6-integration-log.md) 第 5 节)。W13 的记录件随 W21 合入,W16 第 5.3 节记的那条悬挂索引行随之解掉。
