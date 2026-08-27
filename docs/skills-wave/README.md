# docs/skills-wave · 主线 skill 层方案索引

主线口径:**剧本 → 主体 → 分集 → 分镜 → 生成 → 审片 → 成片**。
本目录只放方案文档,不含实现;基线为 `master @ 9adcf0f`(二十三轮收尾)。

| 文档 | 内容 | 什么时候看 |
|---|---|---|
| [w1-pipeline-skill-map.md](./w1-pipeline-skill-map.md) | 现有 skill/专家/智能体资产清单(五层)、主线七步对照表、15 项缺口(G-01…G-15)、建议纳入与建议丢弃的 skill 概念、UMD/注册表单一来源接入方案 | 想知道"现在有什么、缺什么" |
| [w1-architecture-spec.md](./w1-architecture-spec.md) | 分层与扩展点、W2/W3/W4 可执行拆分(范围/接口契约/验收/风险)、全波通用验收标准、禁止项 | 想知道"接下来怎么改、改完怎么验" |
| [w2-kb-sections-wiring.md](./w2-kb-sections-wiring.md) | 知识库取用面接线(G-15/G-08 的 `KB` 侧):`SECTIONS/section/pick` 单源、`DIGESTS` 压缩摘要表、17 条目消费覆盖 | 想知道"方法论正文从哪取、压缩块从哪来" |
| [w4-shot-size-glossary.md](./w4-shot-size-glossary.md) | 机位词表归一(G-07):景别阶梯/运镜/角度结构表下沉 `wf-core.js`、`sizeGap` 级差、15 个消费点逐点对照、指纹影响面 | 想知道"景别/运镜取值从哪来、改一档要动哪些地方" |

## 一分钟摘要

- 资产不缺,缺索引:知识在 `js/knowledge.js`(17 条目)、提示词在 `js/prompts.js`(6 条)、人设在 `js/experts-data.js`(16 专家)、编排在 `js/cmd-registry.js`(8 命令)、执行面在 `js/agent-ops.js`,层与层之间**没有按主线步骤的索引**。
- 主线七步在代码里只有六步:`Domain.workflow` 无"审片"步骤(只有 `episodeState.needs_human` 与发布门 G3)。
- 最重的贯通缺口:专家人设与长期记忆**只在浏览器生效**,`/api/wf/*` 与 CLI/MCP 拿不到,导致"同一条主线、两端不同产出"。
- 已存在的空挂:`settings.tplVideo`(专家雇佣三件套之一)零消费方;`KB.SECTIONS`(知识库按名取用入口)零消费方(W2 已接线,见 `w2-kb-sections-wiring.md`)。
- 词表分叉已收口:景别/运镜/视角/角度四张词表的单一来源在 `js/wf-core.js`,`camera.js`/`review.js`/`sb-io.js`/`agent.js` 全派生(见 `w4-shot-size-glossary.md`)。
- 本轮建议新增的模块只有一个:`js/skills.js`(UMD 注册表,只存对 `KB`/`Prompts`/`CmdRegistry` 的引用,不复制任何文本)。

## 阅读约定

- 缺口编号 `G-xx` 在两份文档中通用。
- 文档描述功能本身,不写功能溯源。
- W2 动工前须以当时 `master` 复核缺口是否已被并行分支覆盖(见图谱文档第 3 节末尾提示)。
