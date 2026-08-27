# W1 · 主线 skill 入选短名单

> 输入件(均为已有有效文档,本文不改动它们):
> `w1-feishu-doc-a-extract.md`(资料件 A,72 条)、`w1-feishu-doc-b-extract.md`(资料件 B,53 条)、
> `w1-pipeline-skill-map.md`(资产图谱与 G-01…G-15)、`w1-architecture-spec.md`(W2/W3/W4 拆分与禁止项)、`w1-inventory.md`(真实文件与键位)。
> 基线 `master @ 9adcf0f`。本文是**筛选结论**,不是实现,也不新增任何代码文件。
> 主线口径:**剧本 → 主体 → 分集 → 分镜 → 生成 → 审片 → 成片**。

## 0. 一分钟结论

- 125 条候选(资料件 A 72 + 资料件 B 53)过 6 条筛选规则后,**54 条被采纳并按机制归并成 30 条内部能力**;其余 **71 条落选**,按 6 类理由归组(第 6 节)。
- 入选 30 条全部能落成 `js/skills.js` 注册表条目 `{id,name,stage,kind,kb[],prompts[],cmds[],checks[]}`:**只存 `KB` / `Prompts` / `CmdRegistry` / `ExpertsData` 的引用键,不复制任何方法论或提示词正文**;不引入 SKILL.md 目录、动态加载、市场、评分、沙箱、独立计费与新存储桶。
- 波次归属:**W2 九条**(纯索引与单源打底)、**W3 五条**(双端贯通与审片升步)、**W4 十六条**(校验闸门与机读覆盖)。
- 键位覆盖度:入选项引用 `KB` 17 条中的 13 条、`Prompts` 6 条中的 5 条、`CmdRegistry` 8 条命令全覆盖、`ExpertsData` 16 位专家中的 6 位。
- 缺口:复用既有 `G-01…G-15` 全部 15 项,另新登记 **7 项 `S-01…S-07`**(第 7 节)。新缺口全部是"既有能力缺可判定出口"类,没有一项要求新增页面或新增创作功能。

## 1. 筛选规则

一条候选要入选,必须同时过 R1–R6;任一不过即落选,并在第 6 节记明落在哪一组。

| 规则 | 判据 |
|---|---|
| **R1 主线命中** | 该能力必须作用在 `script/subjects/eps/shots/gen/review/film` 七步中的至少一步,或作用在贯通七步的索引/贯通层。只落链外形态(口播、数字人、白板动画、解说、带货、营销批产、文字动效、图文、外部平台抓取)的一律不入选。 |
| **R2 可注册表化** | 该能力必须能表达为 `inject`(按 stage 拼方法论块)/ `check`(纯函数判定,零 LLM、零计费)/ `orchestrate`(引用已注册命令编步骤)三种 kind 之一,或是使这三种 kind 成立的前置基础设施。 |
| **R3 只存引用键** | 落地形态必须是"引用 `KB` 条目键 / `Prompts` key / `CmdRegistry` 命令名 / 专家 id",不得把正文搬进 skill 层。素材库型资产(成套镜头卡、千条提示词库)因必然产生正文复制而不入选。 |
| **R4 不碰禁止项** | 不引入 npm/CDN/构建/YAML 解析;不引入文件化 skill 目录与运行时动态加载;不引入沙箱执行、市场/评分/订阅、群聊式多智能体;不新增计费标签面;不为 skill 新建存储桶;不与合规命中要求相冲突。 |
| **R5 正文自撰** | 入选只保留**能力定义**(这一步该判什么、判到什么程度),任何需要文本的条目由本平台自行撰写并进 `KB` / `Prompts` 单源。资料件 B 第十二层整层为非商业许可,凡资料坐标落在该层的入选项一律只取能力定义,不引入外部正文。 |
| **R6 不重复入选** | 已在仓库落地且已被既有单源覆盖的,不再作为新增能力入选(记入落选组 D3),避免短名单里塞进"其实已经有了"的行。 |

## 2. 编号与列口径

- **能力 ID**:`SK-01…SK-30`,只用于本文与后续波次互相引用;真正的注册表 id 用第 5 节给出的 `stage.name` 形态。
- **主线步骤**:取 `Domain.workflow` 步骤键 `script/subjects/eps/shots/gen/film` 加上待补的 `review`(G-03);跨步的写多个键;贯通层写 `*`。
- **键映射**:`KB:` = `js/knowledge.js` 条目键,`P:` = `js/prompts.js` key 或 `settings` 三件套键,`C:` = `js/cmd-registry.js` 命令名,`E:` = `js/experts-data.js` 专家 id。**该格写不出既有键的,一律标缺口 ID,不留空、不含糊。**
- **缺口 ID**:既有缺口沿用图谱文档的 `G-xx`;本文新登记的用 `S-xx` 前缀,**不占用 `G-xx` 序号**,避免与并行分支各自加号冲突。
- **资料坐标**:候选在两份提炼件中的位置,只用坐标不写外部名称。`A-S<n>` = 资料件 A 第一类第 n 项(28),`A-P<n>` = 第二类(27),`A-C<n>` = 第三类(3),`A-B<n>` = 配套底座(7),`A-X<n>` = 未计入主清单(7),合计 72;`B-<层>-<序>` = 资料件 B 第 1–12 层,合计 53(第八层、第十一层各有 1 条在提炼件中即未取到名称,不参与筛选;第十二层跨两张表,按"质检类 4 条 + 独立使用 18 条"的先后顺序连续编到 22)。
  该列只标注**筛选输入的位置**,便于复核有没有漏项;能力描述一律以本平台自身口径书写。同一机制可派生多条内部能力,故坐标允许在多行重复出现。

## 3. 波次归属汇总

| 波次 | 条数 | 入选项 | 该波共同验收挂钩(沿用架构规格第 3 节) |
|---|---|---|---|
| **W2 单源打底** | 9 | SK-01 SK-02 SK-06 SK-09 SK-14 SK-17 SK-19 SK-21 SK-27 | 行为等价:改造前后 `WfCore.sbSystem()` / `buildReviewPrompt()` 逐字节相同;`contract` 套件断言每条 skill 的 `kb`/`prompts`/`cmds` 键真实存在、`stage` ⊆ 主线步骤键集合 |
| **W3 双端贯通** | 5 | SK-03 SK-04 SK-16 SK-23 SK-25 | 双端字面一致:同一雇佣状态下浏览器与 `cli.js exec` 的 system+user 提示词逐字节相同;headless 从"只有剧本文件"起不再有 `unsupported-in-cli` |
| **W4 验收闸门** | 16 | SK-05 SK-07 SK-08 SK-10 SK-11 SK-12 SK-13 SK-15 SK-18 SK-20 SK-22 SK-24 SK-26 SK-28 SK-29 SK-30 | 新增 `skills` 套件:每个校验项在干净 fixture 全 pass、在脏 fixture 命中且 `level` 分级正确;校验项全 warn 时发布门 `overall` 不从 pass 掉到 fail |

W2 的九条是纯结构项(建索引 + 修已破的单源),不改 LLM 调用次数与计费动作;W4 的十六条全部是本地纯函数校验或注册表投影,不新增 LLM 调用。跨波拆分的条目在第 5 节各行的"波次"格里标成 `W2(主) / W4(补)` 形态。

## 4. 入选覆盖的键位

| 单源 | 总量 | 被入选项引用 | 未被引用 |
|---|---|---|---|
| `KB` 条目 | 17 | 13:`WR_CORE` `WR_STRUCTURE` `WR_HOOKS` `WR_FACESLAP` `WR_PAYOFF` `WR_DIALOGUE` `DR_SHOT` `DR_AXIS` `DR_RHYTHM` `GC_FORMULA` `GC_RULES` `GC_MULTI` `GC_REFS` | 4:`WR_REVERSALS` `WR_CHARACTER` `WR_PITFALLS` `DR_MISE` |
| `Prompts` key | 6 | 5:`sb.system` `sb.reviewSystem` `und.system` `review.system` `review.finalSystem` | 1:`sb.reviewUser`(变量模板,由 SK-17/SK-19 间接影响,不单独入选) |
| `settings` 三件套 | 3 | 3:`tplImage`(SK-11)`tplVideo`(SK-21)`tplReview`(SK-24) | — |
| `CmdRegistry` 命令 | 8 | 8(全覆盖):`episode.preflight` `episode.generateStoryboard` `episode.generateVideos` `shot.generateVideo` `episode.smartReview` `episode.compose` `episode.produce` `episode.understanding` | — |
| `ExpertsData` 专家 | 16 | 6:`ex_hook` `ex_pleasure` `ex_dialogue` `ex_structure` `ex_dp` `ex_editor`(均为 `kind=function`) | 10:8 位 style 专家经 SK-21 的 `tpl.tplVideo` 面整体涉及,`ex_planner` / `ex_localize` 本轮无入选能力 |

两处需要在 W2 动工时单独定性,不能靠短名单默认掉:

1. **4 条 `KB` 条目在本轮无入选能力引用**(`WR_REVERSALS` `WR_CHARACTER` `WR_PITFALLS` `DR_MISE`)。它们目前只经 `KB.block()` 压缩块间接生效,属 G-15 的范围。**短名单未覆盖不等于可以删**:W2 处置 `KB.SECTIONS` 零消费时,这 4 条要么补进某个 stage 的注入清单,要么明确留在压缩块并按 G-15 的要求在注释里写明"压缩块与条目是两份措辞、条目为准"。
2. **8 位 style 专家的 `tpl.tplVideo`** 是 SK-21 的直接输入面。G-05 的二选一(接进生成请求构造 / 从三件套移除)决定这 8 条数据是活的还是要删,必须在 SK-21 落地前定性。

## 5. 入选短名单(30 条)

### 5.1 贯通层(stage = `*`)

| ID | 内部能力名(注册表 id) | kind | 主线步骤 | 键映射 | 缺口 | 波次 | 资料坐标 |
|---|---|---|---|---|---|---|---|
| SK-01 | 主线步骤方法论索引(`core.stageIndex`) | inject 宿主 | `*` | KB:`SECTIONS` 全 17 条 + `block()` / `reviewBlock()`;P:—;C:—;E:— | G-08 G-15 | W2 | A-S6 A-S16 A-P2 |
| SK-02 | 专家条目挂能力引用(`core.expertSkillRef`) | 基础设施 | `*` | E:`EXPERTS` 16 条(`ex_suspense`…`ex_editor`);KB/P/C:经各专家 `skills[]` 间接引用 | G-09 | W2(主) / W4(功能专家 I/O 契约) | A-P3 A-P5 A-P23 |
| SK-03 | 生效人设经 ctx 过服务端(`core.personaCtx`) | 基础设施 | `*` | E:`projTypeOf`(已双端)+ `settings.hiredExpert` + `p.boards[key].expert`;P:三条 wf 端点的全部系统人设 `sb.system` `sb.reviewSystem` `und.system` `review.system` `review.finalSystem`;C:`episode.understanding` `episode.generateStoryboard` `episode.smartReview` | G-01 | W3 | B-10-1 B-12-22 |
| SK-04 | 长期记忆双端与召回纯函数(`core.memoryDual`) | 基础设施 | `*` | KB:—(记忆种子在 `agent.js` `memAll`,不是 `knowledge.js` 条目);P:—;C:—;E:`js/experts.js` `evolveExpert` 的输入面;召回策略(同板块 4 + 全局最近 4)抽为纯函数 | G-02 | W3 | B-12-19 B-12-20 |
| SK-05 | playbook 由注册表投影(`core.playbookProjection`) | orchestrate | `*` | C:`CmdRegistry.names()` 全 8 条;P:—;KB:—;E:— | G-12 | W4 | A-P2 B-2-1 B-2-3 |

### 5.2 剧本(stage = `script`)

| ID | 内部能力名(注册表 id) | kind | 主线步骤 | 键映射 | 缺口 | 波次 | 资料坐标 |
|---|---|---|---|---|---|---|---|
| SK-06 | 开篇钩子选型注入(`script.hookType`) | inject | `script` | KB:`WR_HOOKS` `WR_CORE`;E:`ex_hook`;P:缺(注入点内联在 `proj-shell`)→ G-13;C:缺 → G-04 | G-13 G-04 | W2(主,改经索引取块) / W4(提示词收编) | B-1-3 |
| SK-07 | 开篇钩子强度校验(`script.hookStrength`) | check | `script` | KB:`WR_HOOKS`;E:`ex_hook`;C:缺(剧本段无领域命令)→ G-04;checks 宿主缺 → S-01 | G-10 S-01 | W4 | A-X5 B-12-2 |
| SK-08 | 打脸四步完备性校验(`script.faceslapFour`) | check | `script` | KB:`WR_FACESLAP`;E:`ex_pleasure`;C:缺 → G-04;checks 宿主缺 → S-01 | G-10 S-01 | W4 | A-S8 B-12-3 |
| SK-09 | 对白铁律注入与单句长度校验(`script.dialogueRule`) | inject + check | `script` `shots` | KB:`WR_DIALOGUE`(现为零消费条目);E:`ex_dialogue`;P:`sb.system`(镜头台词侧);C:`episode.generateStoryboard` | G-15(注入) G-10 S-01(校验) | W2(主,inject) / W4(补,check) | A-S8 B-6-1 |
| SK-10 | 文案 AI 味硬禁与痕迹检出(`script.aiToneBan`) | inject + check | `script` `shots` | KB:缺条目 → S-02;E:`ex_dialogue`;P:缺(散在各模块内联)→ G-13;C:— | S-02 G-13 | W4 | B-2-4 B-12-1 |

`SK-10` 的条目正文按 R5 自行撰写并进 `KB` 单源,校验侧只做本地词法命中,不调 LLM。

### 5.3 主体(stage = `subjects`)

| ID | 内部能力名(注册表 id) | kind | 主线步骤 | 键映射 | 缺口 | 波次 | 资料坐标 |
|---|---|---|---|---|---|---|---|
| SK-11 | 主体参考纪律注入与生成前置校验(`subjects.refDiscipline`) | inject + check | `subjects` `gen` | KB:`GC_REFS`;P:`settings.tplImage`(非注册表)→ G-13;C:`episode.preflight` `shot.generateVideo`;E:—(主体段无功能专家,不阻塞) | G-06 G-13 | W4 | A-C3 A-P9 A-P13 |
| SK-12 | 分镜引用主体完备性校验(`subjects.refIntegrity`) | check | `subjects` `shots` | C:`episode.preflight`;KB:`GC_REFS`;复用 `Domain` 主体按名查找(含多形态全称);P/E:— | S-03 | W4 | A-S6 A-P7 |
| SK-13 | 跨镜头主体一致性校验(`subjects.crossShot`) | check | `subjects` `gen` | KB:`GC_MULTI` `GC_REFS`;C:`episode.generateVideos` `shot.generateVideo`;P/E:— | G-06 S-03 | W4 | A-P7 A-B2 |

### 5.4 分集(stage = `eps`)

| ID | 内部能力名(注册表 id) | kind | 主线步骤 | 键映射 | 缺口 | 波次 | 资料坐标 |
|---|---|---|---|---|---|---|---|
| SK-14 | 六阶段结构注入与分集覆盖校验(`eps.structureStage`) | inject + check | `eps` | KB:`WR_STRUCTURE`(已被节拍板引用);E:`ex_structure`;P:缺(拆集提示词内联)→ G-13;C:缺(拆集仅浏览器)→ G-04 | G-13 G-04 S-01 | W2(主,inject) / W3(拆集补服务端) / W4(补,check) | A-S6 B-1-2 |
| SK-15 | 付费卡点位置校验(`eps.payoffPoint`) | check | `eps` | KB:`WR_PAYOFF`;E:`ex_pleasure`;C:缺 → G-04;checks 宿主缺 → S-01 | G-10 S-01 | W4 | A-S8 B-6-1 |
| SK-16 | 主线前段编排(`eps.frontPipeline`) | orchestrate | `script` `subjects` `eps` `shots` | C:`episode.understanding` `episode.generateStoryboard`(已有)+ 拆集/主体提取命令缺 → G-04;KB/P/E:引用各 stage 的 inject 清单 | G-04 | W3 | A-S6 A-P13 B-2-1 |

### 5.5 分镜(stage = `shots`)

| ID | 内部能力名(注册表 id) | kind | 主线步骤 | 键映射 | 缺口 | 波次 | 资料坐标 |
|---|---|---|---|---|---|---|---|
| SK-17 | 镜头语言词表归一与注入(`shots.shotLanguage`) | inject | `shots` | KB:`DR_SHOT` `DR_AXIS`(已注入);P:`sb.system`;C:`episode.generateStoryboard`;E:`ex_dp`;词表以 `WfCore` 的 `SIZES/CAMERAS/VIEWS/ANGLES` 为准 | G-07 G-14 | W2 | A-S1 A-C1 A-C2 |
| SK-18 | 景别递进与轴线校验(`shots.sizeProgression`) | check | `shots` `review` | KB:`DR_SHOT` `DR_AXIS`;P:`review.system`;C:`episode.smartReview`;E:`ex_dp` | G-10 | W4 | A-B4 A-B5 A-X5 |
| SK-19 | 抽卡八维公式与军规注入(`shots.promptEightDim`) | inject | `shots` `gen` | KB:`GC_FORMULA` `GC_RULES` `GC_MULTI`;P:`sb.system` + `settings.tplVideo`;C:`episode.generateStoryboard` | G-15(索引) G-06 G-05 | W2(主,索引) / W4(补,生成前 warn) | A-S10 A-S16 A-S18 A-P14 |
| SK-20 | 镜头动态感准入校验(`shots.motionGate`) | check | `shots` | KB:`DR_RHYTHM` `GC_RULES`;C:`episode.generateStoryboard`;节拍板五段式为判定输入,无对应命令 → S-04;P/E:— | S-04 | W4 | A-S24 B-11-1 |

### 5.6 生成(stage = `gen`)

| ID | 内部能力名(注册表 id) | kind | 主线步骤 | 键映射 | 缺口 | 波次 | 资料坐标 |
|---|---|---|---|---|---|---|---|
| SK-21 | 视频提示词模板落位(`gen.videoTpl`) | inject | `gen` | P:`settings.tplVideo`(现零消费)+ 建议同步进 `Prompts.REG`;E:8 位 style 专家的 `tpl.tplVideo`;C:`shot.generateVideo` `episode.generateVideos`;KB:`GC_FORMULA` | G-05 G-13 | W2 | A-S17 A-S18 A-S19 A-P6 |
| SK-22 | 生成凭据与确认失效校验(`gen.renderCredential`) | check | `gen` | C:`episode.preflight` `shot.generateVideo` `episode.generateVideos`;复用 `Domain.buildVideoRequest` 与 `shotInputHash` 判旧、`unconfirmed`/`stale` 计数;KB:`GC_RULES`;凭据字段无完备性判定 → S-05 | S-05 | W4 | A-S20 A-B2 B-4-1 B-5-1 |

`SK-22` 只读既有字段做判定并输出 warn,**不改计费动作、不新增计费标签、不改既有确认闸行为**。

### 5.7 审片(stage = `review`,该 stage 成立以 SK-23 为前提)

| ID | 内部能力名(注册表 id) | kind | 主线步骤 | 键映射 | 缺口 | 波次 | 资料坐标 |
|---|---|---|---|---|---|---|---|
| SK-23 | 审片升为主线一等步骤(`review.stage`) | 基础设施 | `review` | C:`episode.smartReview`(已注册);复用 `episodeState.reviewAvg` / `lastReview` 判旧口径与发布门 G3;P:`review.system` `review.finalSystem` | G-03 | W3 | A-S8 A-B4 |
| SK-24 | 方法论维度进审片报告(`review.methodDim`) | check | `review` | KB:`reviewBlock()` 口径 + `WR_HOOKS` `WR_FACESLAP` `DR_SHOT` `GC_RULES`;P:`review.system` `review.finalSystem` + `settings.tplReview`;C:`episode.smartReview`;E:`ex_editor` | G-10 | W4 | A-B4 A-B5 A-X5 B-12-3 |
| SK-25 | 审片修订闭环编排(`review.reviseLoop`) | orchestrate | `review` `gen` `film` | C:`episode.smartReview` `episode.generateVideos`(带 `shotIds`)`episode.compose`;`plans` 的审片修订步骤现为导航类 → G-03 | G-03 G-12 | W3(主,计划步骤升命令) / W4(补,playbook) | B-2-1 B-10-1 |
| SK-26 | 审片结论按板块回流专家(`review.memoryFeedback`) | orchestrate | `review` `*` | E:`evolveExpert` + `customExperts`;复用 `state.agentMemory` 的 `scope`(板块)字段;C:`episode.smartReview` | G-11 G-02 | W4 | B-10-2 |

`SK-26` 沿用既有 `agentMemory` 与 `customExperts` 两个桶,**不新建存储桶**;预置专家的进化落到自定义副本,不改预置数据。

### 5.8 成片(stage = `film`)

| ID | 内部能力名(注册表 id) | kind | 主线步骤 | 键映射 | 缺口 | 波次 | 资料坐标 |
|---|---|---|---|---|---|---|---|
| SK-27 | 剪辑节奏注入成片评审与时间线建议(`film.rhythmInject`) | inject | `film` | KB:`DR_RHYTHM`(现为零消费条目);P:`review.finalSystem`;C:`episode.compose`;E:`ex_editor` | G-15 G-13 | W2 | A-S12 A-S13 A-P12 |
| SK-28 | 字幕时间轴与阅读速度校验(`film.subtitleQC`) | check | `film` | C:`episode.compose`(复用 `ep.composedSrt` 与合成段时长);KB/P/E:—;SRT 无结构化质检产物 → S-06 | S-06 | W4 | B-7-1 B-7-2 |
| SK-29 | 交付契约门(`film.deliverContract`) | check | `film` | C:`episode.produce` `episode.compose`;复用 `release.js` G1–G10、`Issues.collect`、`Domain` 的 `upstreamFinal` 上游定稿口径;方法论门未进 → G-10;契约优先级无判定 → S-07 | G-10 S-07 | W4 | B-6-1 B-10-1 B-11-5 |
| SK-30 | 一键成片编排 playbook 化(`film.produceProjection`) | orchestrate | `film` | C:`episode.produce`(已是编排命令,本条只做 playbook 投影)+ `episode.compose`;KB/P/E:— | G-12 | W4 | A-S3 A-S11 A-S27 A-P12 A-P27 A-B3 |

`SK-29` 的方法论门按架构规格挂成**可选门,默认 warn**,不让存量项目一夜变红;既有 G1–G10 的 fail/warn 口径不动。

## 6. 落选(71 条,6 组)

| 组 | 判据 | 条数 | 落选坐标 |
|---|---|---|---|
| **D1 形态不落主线**(不过 R1) | 口播 / 数字人形象 / 白板动画 / 解说与拉片 / 带货 / 营销批产 / 文字动效 / 单一题材专用 / 图文成组 / 外部平台抓取,与漫剧主线七步无交集 | 21 | A-S4 A-S7 A-S9 A-S14 A-S21 A-S22 A-S23 A-S25 A-S26 A-S28;A-P8 A-P21 A-P25 A-P26;A-X4;B-2-2 B-2-5 B-3-1 B-3-2 B-8-1 B-9-1 |
| **D2 需新增创作功能或页面**(不过 R2) | 要新增实体、新页面或新产物形态(立项前想法池、标题候选产物、封面与拼贴出图体系、动效风格工程、剪辑工程格式出口、自然语言驱动剪辑入口)。skill 层是索引层与校验层,不是新的产能层 | 11 | B-1-1 B-1-4 B-6-2 B-6-3 B-8-2 B-8-3 B-8-4 B-8-5 B-11-2 B-11-3 B-11-4 |
| **D3 已被既有单源覆盖**(不过 R6) | 平台型全链定位与本平台主线重合、无新增可落项;或该机制已有实现:多模态模型路由与全链积分预估、素材库检索属另一条链路、"一句话→成片"即 `episode.produce`、流程固化即流程条、跨会话落库即 `plans` + continuity 快照、诊断报告即统一导出交付包、模糊目标规整即策划与计划层 | 16 | A-S2;A-P1 A-P4 A-P10 A-P11 A-P15 A-P16 A-P17 A-P18 A-P19 A-P20 A-P22 A-P24;A-X3;B-12-15 B-12-21 |
| **D4 触发禁止项**(不过 R4) | 需要新增生成后端依赖或外部合成引擎(违反零依赖零构建)、群聊式多角色自由对话(不可验收、成本不可控)、合规取向与本平台合规命中要求相反 | 6 | A-S15 A-B1 A-B6 A-B7;B-12-17 B-12-18 |
| **D5 资料不足不足以判定** | 提炼件中该条只有热度或名称、无功能描述,或覆盖面取决于内含工具无法判定;按如实记录原则不做名称之外的推断 | 5 | A-S5 A-X1 A-X2 A-X6 A-X7 |
| **D6 主线弱相关的方法论工具** | 商业模式与个人成长诊断类,不作用于主线任何一步;其中传播学分析类可在后续单独议题里评估是否作为知识条目,本轮不入选 | 12 | B-12-4 B-12-5 B-12-6 B-12-7 B-12-8 B-12-9 B-12-10 B-12-11 B-12-12 B-12-13 B-12-14 B-12-16 |

**125 条去向核对**:入选 30 条能力共引用 **54 条候选坐标**(A 侧 34 / B 侧 20),落选 **71 条**(A 侧 38 / B 侧 33),54 + 71 = 125 ✓

被引用的坐标数多于入选能力数,是因为同类机制按能力归并了:提示词工程类归并到 SK-19 / SK-21,剪辑与时间轴类归并到 SK-27 / SK-30,阶段切分与一致性类归并到 SK-01 / SK-11 / SK-12 / SK-13;反过来同一坐标也可被多条能力引用(如 A-S8 被 SK-08 / SK-09 / SK-15 / SK-23 共用)。第 5 节资料坐标列是完整枚举,可据此逐条复核。

一条明确不入选但值得记下的机制:资料件 B 提到的**逐帧全量校验**(B-11-5)只作为 SK-29 的口径参照,不作为独立能力入选——本平台现有抽帧检查已覆盖同类判定,逐帧需要新增服务端能力且算力代价与收益不匹配。同理,成套镜头卡与千条提示词库(A-S1、A-P14)只作为 SK-17 / SK-19 的口径参照,其素材库本身因必然复制正文(R3)不入选。

## 7. 新登记缺口(S-01…S-07)

全部为"既有能力缺可判定出口"类,没有一项要求新增页面或新增创作功能。

| ID | 缺口 | 主线定位 | 现状证据 | 关联入选项 | 波次 |
|---|---|---|---|---|---|
| S-01 | 剧本 / 分集段没有校验宿主:`release.js` 的 G1–G10 与 `Issues.collect` 都无剧本文本维度,审片只覆盖镜头与成片 | 剧本 / 分集 | 发布门十项分别是主线就绪 / 问题清零 / 审片均分 / 过期镜 / 未确认镜 / 失败镜 / 合规 / 真人素材 / 主体缺图 / 计费对账,无一项读剧本或分集文本 | SK-07 SK-08 SK-09 SK-14 SK-15 | W4 |
| S-02 | `KB` 无"文案 AI 味硬禁"条目:LLM 产出的剧本、分镜描述、旁白没有对应的可注入约束与可命中检出项 | 剧本 / 分镜 | `KB` 17 条覆盖编剧 9 / 导演 4 / 抽卡 4,无文字质量域 | SK-10 | W4 |
| S-03 | 分镜与主体之间无引用完备性与一致性判定:`Domain` 有主体按名查找(含多形态全称),但没有"镜头引用了主体库中不存在的名字""同一主体在多镜头的参考不一致"的判定 | 主体 / 分镜 | 发布门 G9 只判主体缺图数为 0,不判引用关系 | SK-12 SK-13 | W4 |
| S-04 | 节拍板与镜头描述无动态感准入判定,也无对应领域命令,校验结果无处落地 | 分镜 | 节拍板五段式产出只进分镜与生成,`CmdRegistry` 8 条命令中无节拍板项 | SK-20 | W4 |
| S-05 | 生成凭据无完备性判定:参数留痕与判旧指纹字段齐不齐、确认态在输入变更后是否仍然有效,都没有集中判定点 | 生成 | 判旧靠 `shotInputHash` 与 `stale` 计数,确认靠 `unconfirmed` 计数,两者各自独立,无"凭据完整性"聚合项 | SK-22 | W4 |
| S-06 | 成片字幕无结构化质检产物:阅读速度、单条时长、跨镜断句都无判定 | 成片 | 合成时按时间轴段产出 `ep.composedSrt`(空文本段占时长不出条目),导出含 `.srt`,但没有质检结论 | SK-28 | W4 |
| S-07 | 交付契约优先级无显式判定:上游定稿目前是注入给模型的文本约束,不是可判定的门 | 成片 | 上游已定稿作为权威约束经助手上下文注入,发布门不校验下游产物是否与上游定稿冲突 | SK-29 | W4 |

## 8. 禁止项复核

对照架构规格第 5 节逐条核对 30 条入选项:

| 禁止项 | 结论 |
|---|---|
| 竞品溯源表述 | 通过。本文不出现任何外部产品名称,资料坐标只指向提炼件位置,用于复核筛选是否漏项;能力描述一律按本平台自身口径书写 |
| 两端各抄一份 | 通过。SK-03 / SK-04 就是为消除两端各一份而入选;其余入选项一律经 `ctx` 注入环境差异 |
| 堆无关功能(市场 / 评分 / 订阅 / 群聊式多智能体 / 沙箱 / 独立 skill 目录 + 动态加载) | 通过。相关候选全部落在 D2 与 D4;入选项无一项需要文件化 skill 目录或动态加载 |
| 新增依赖与构建 | 通过。需要新增生成后端或外部合成引擎的候选落在 D4;入选项只动既有 UMD 模块与注册表 |
| 绕过计费纪律 | 通过。30 条无一条新增计费动作或计费标签;`check` 型全部本地纯函数、零 LLM;SK-22 只读既有字段出 warn |
| 用占位冒充 | 通过。无入选项改动生成失败的报错与退费口径 |
| 在 skill 模块内碰环境 | 通过。校验型入选项的输入一律是领域对象 `(p, ep, s)` 与 `ctx`,不读 `Store` / `window` / `location` |
| 一次性大改主线口径 | 通过。`Domain.workflow` 步骤集合的唯一变更是 SK-23 增 `review`,按规格单独成 commit 并先锁 `domain` 套件断言 |
| 删除或跳过既有测试 | 通过。入选项的验收全部是新增断言与新增套件 |

## 9. 边界与未核实项

1. **资料坐标的可信度继承自提炼件**。两份提炼件中标 `(推)` 的输入输出未经原始仓库核实,只能当线索。本文的筛选只用到"这条候选代表哪一类机制"这一层信息,不依赖标 `(推)` 的细节;若后续要用某条候选的具体做法,须回原始出处核实。
2. **资料件 B 第八层与第十一层各有 1 条在提炼件中即未取到名称**,本文按 53 条落名计,这 2 条不参与筛选;若日后补齐,须回到本文第 6 节重新归组。
3. **许可隔离**。资料件 B 第十二层整层为非商业许可,凡资料坐标落在该层的入选项(SK-03 SK-04 SK-07 SK-08 SK-10 SK-24)按 R5 只保留能力定义,条目正文与提示词一律自行撰写并进 `KB` / `Prompts` 单源,不引入任何外部正文。
4. **并行分支复核**。远端存在未合并分支已包含服务端 agent 端点、主体生图与主体提取命令、记忆消费侧等改动。W2 动工前须以当时 `master` 复核 SK-03(G-01)、SK-04(G-02)、SK-16(G-04)是否已被覆盖,避免重复实现;若已覆盖,对应行改标"已落地"并把波次归属划掉,不要保留成待做项。
5. **本文只维护本文件**。同目录其他文档由各自计划槽维护,本文不改动它们;`README.md` 的目录表在本文合入后应补一行指向本文,但该改动属 README 维护方,不在本文范围内。
