# W2 · skill 索引对齐短名单 30 条

> 输入件:`w1-selected-skills.md`(短名单 SK-01…SK-30 与波次归属)。
> 基线:`js/skills.js` 第一版(15 条索引条目,只存引用键)。本轮在其成果上增量,不另起一套注册表。
> 落地文件:`js/skills.js`(注册表本体)、`tests/unit.js` contract 套件(三条断言)、`README.md`(架构树 + 知识库段各一处)。

## 1. 本轮做了什么

把 `js/skills.js` 的条目集合从"按既有资产分组的 15 条"改成**短名单的 30 条内部能力**(`SK-01…SK-30`),id 取短名单第 5 节给出的 `stage.name` 形态。索引层的纪律不变:**只存引用键,不复制正文**;不引入 SKILL.md 目录、动态加载、市场、评分、沙箱、独立计费与新存储桶;模块内不碰浏览器环境句柄与前端状态桶,环境差异经 `ctx` / `deps` 显式注入。

条目字段在第一版基础上加了 5 个,全部是索引信息,没有一个字段承载正文:

| 字段 | 含义 |
|---|---|
| `sk` | 短名单编号 `SK-xx`,连续且唯一(契约测试逐个核对) |
| `stage` | 主 stage;贯通层用 `*`(`Skills.CROSS`),不混进任一步的注入块 |
| `covers` | 该能力实际作用到的主线步骤(缺省=`[stage]`),`Skills.covering(stage)` 按此反查跨步条目 |
| `wave` | 落地波次 `W2` / `W3` / `W4`,与短名单第 3 节配比一致(9 / 5 / 16) |
| `kinds` | 该能力由哪几种机制面构成:`inject` 注入 / `check` 校验 / `orchestrate` 编排 / `infra` 基础设施(短名单里的"inject + check"条目在此写成两面) |
| `pending` | `kinds` 中**在主线上还没有出口**的面;非空时必须同时用 `gaps` 写明缺口编号 |
| `settings` | 提示词模板三件套等偏好键(`tplImage` / `tplVideo` / `tplReview`),不在 `Prompts` 注册表内,单列一格 |

`pending` 是本轮的核心诚实位:**未落地的面一律不挂假出口**。`validate` 强制三条——pending 含 `check` ⇒ `checks` 必须为空(不登记没有实现的校验项);pending 含 `orchestrate` ⇒ `steps` 必须为空且 `playbook()` 返回 `null`;pending 含 `inject` ⇒ 不参与 `block()` 拼块。`CHECKS` 本轮仍是空表,因此七步的 `Skills.check()` 一律返回空数组,不产出任何未实现的校验结论。

新增只读投影接口三个(纯索引,不新增依赖):`Skills.covering(stage)`(跨步反查)、`Skills.forExpert(id)`(专家→能力,SK-02 的反查出口,专家条目侧不存第二份 `skills[]`)、`Skills.gaps()`(缺口编号→能力 id,给 W3/W4 排期挂钩)。`Skills.playbooks()` 投影全部已落地编排条目(SK-05 的出口)。

## 2. 30 条落表结果

`✔` = 该机制面已有出口;`待` = 该面在 `pending` 里,按 `gaps` 列的缺口编号排期。

| SK | 注册表 id | stage / covers | 波次 | 机制面 | 引用键 | 缺口 |
|---|---|---|---|---|---|---|
| SK-01 | `core.stageIndex` | `*` | W2 | infra ✔ | KB 全 17 条 + `block()` `reviewBlock()` | G-08 G-15 |
| SK-02 | `core.expertSkillRef` | `*` | W2 | infra ✔ | 专家全 16 位 | G-09 |
| SK-03 | `core.personaCtx` | `*` | W3 | infra 待 | P:`sb.system` `sb.reviewSystem` `und.system` `review.system` `review.finalSystem`;C:理解/分镜/审片 | G-01 |
| SK-04 | `core.memoryDual` | `*` | W3 | infra 待 | —(记忆种子不在 KB 条目面) | G-02 |
| SK-05 | `core.playbookProjection` | `*` | W4 | orchestrate 待 | C:全 8 条命令 | G-12 |
| SK-06 | `script.hookType` | `script` | W2 | inject ✔ | KB:`WR_HOOKS` `WR_CORE`;E:`ex_hook` | G-13 G-04 |
| SK-07 | `script.hookStrength` | `script` | W4 | check 待 | KB:`WR_HOOKS`;E:`ex_hook` | G-10 G-04 S-01 |
| SK-08 | `script.faceslapFour` | `script` | W4 | check 待 | KB:`WR_FACESLAP` `WR_REVERSALS`;E:`ex_pleasure` | G-10 G-04 S-01 |
| SK-09 | `script.dialogueRule` | `script` / `shots` | W2 | inject ✔ + check 待 | KB:`WR_DIALOGUE` `WR_CHARACTER`;P:`sb.system`;C:分镜;E:`ex_dialogue` | G-15 G-10 S-01 |
| SK-10 | `script.aiToneBan` | `script` / `shots` | W4 | inject 待 + check 待 | E:`ex_dialogue`(条目正文自撰后进 KB,现无可引用条目键) | S-02 G-13 G-10 |
| SK-11 | `subjects.refDiscipline` | `subjects` / `gen` | W4 | inject ✔ + check 待 | KB:`GC_REFS`;tpl:`tplImage`;C:就绪检查/单镜生成 | G-06 G-13 |
| SK-12 | `subjects.refIntegrity` | `subjects` / `shots` | W4 | check 待 | KB:`GC_REFS`;C:就绪检查 | S-03 |
| SK-13 | `subjects.crossShot` | `subjects` / `gen` | W4 | check 待 | KB:`GC_MULTI` `GC_REFS`;C:批量生成/单镜生成 | G-06 S-03 |
| SK-14 | `eps.structureStage` | `eps` | W2 | inject ✔ + check 待 | KB:`WR_STRUCTURE`;E:`ex_structure` | G-13 G-04 S-01 |
| SK-15 | `eps.payoffPoint` | `eps` | W4 | check 待 | KB:`WR_PAYOFF`;E:`ex_pleasure` | G-10 G-04 S-01 |
| SK-16 | `eps.frontPipeline` | `eps` / 前四步 | W3 | orchestrate ✔ | C:`episode.understanding` → `episode.generateStoryboard` | G-04 |
| SK-17 | `shots.shotLanguage` | `shots` | W2 | inject ✔ | KB:`DR_SHOT` `DR_AXIS`;P:`sb.system`;C:分镜;E:`ex_dp` | G-07 G-14 |
| SK-18 | `shots.sizeProgression` | `shots` / `review` | W4 | check 待 | KB:`DR_SHOT` `DR_AXIS`;P:`sb.reviewUser` `review.system`;C:审片;E:`ex_dp` | G-10 |
| SK-19 | `shots.promptEightDim` | `shots` / `gen` | W2 | inject ✔ + check 待 | KB:`GC_FORMULA` `GC_RULES` `GC_MULTI`;P:`sb.system`;tpl:`tplVideo`;C:分镜 | G-15 G-06 G-05 G-10 |
| SK-20 | `shots.motionGate` | `shots` | W4 | check 待 | KB:`DR_RHYTHM` `GC_RULES`;C:分镜 | S-04 |
| SK-21 | `gen.videoTpl` | `gen` | W2 | inject 待 | KB:`GC_FORMULA`;tpl:`tplVideo`;C:单镜/批量生成;E:8 位 style 专家 | G-05 G-13 |
| SK-22 | `gen.renderCredential` | `gen` | W4 | check 待 | KB:`GC_RULES`;C:就绪检查/单镜/批量生成 | S-05 |
| SK-23 | `review.stage` | `review` | W3 | infra 待 | P:`review.system` `review.finalSystem`;C:审片 | G-03 |
| SK-24 | `review.methodDim` | `review` | W4 | inject ✔ + check 待 | KB:`reviewBlock()`;P:`review.system` `review.finalSystem`;tpl:`tplReview`;C:审片;E:`ex_editor` | G-10 |
| SK-25 | `review.reviseLoop` | `review` / `gen` / `film` | W3 | orchestrate ✔ | C:审片 → 批量生成(低分镜子集)→ 复审 → 合成 | G-03 G-12 |
| SK-26 | `review.memoryFeedback` | `review` / `*` | W4 | orchestrate 待 | C:审片;E:`ex_editor` | G-11 G-02 |
| SK-27 | `film.rhythmInject` | `film` | W2 | inject ✔ | KB:`DR_RHYTHM`;P:`review.finalSystem`;C:合成;E:`ex_editor` | G-15 G-13 |
| SK-28 | `film.subtitleQC` | `film` | W4 | check 待 | C:合成 | S-06 |
| SK-29 | `film.deliverContract` | `film` | W4 | check 待 | C:合成/一键成片 | G-10 S-07 |
| SK-30 | `film.produceProjection` | `film` | W4 | orchestrate ✔ | C:`episode.produce`(投影)+ `episode.compose`(风险位中断后补合成) | G-12 |

统计:30 条 = 贯通层 5 + 剧本 5 + 主体 3 + 分集 3 + 分镜 4 + 生成 2 + 审片 4 + 成片 4;波次 W2 9 / W3 5 / W4 16,与短名单第 3 节逐条对上。

已有出口的面:注入 8 条(SK-06 SK-09 SK-11 SK-14 SK-17 SK-19 SK-24 SK-27)、编排 3 条(SK-16 SK-25 SK-30)、基础设施 2 条(SK-01 SK-02);校验面本轮**零条**落地,与 `CHECKS` 空表一致。

## 3. 单源键覆盖

| 单源 | 总量 | 索引引用 | 兜底条目 |
|---|---|---|---|
| `KB` 条目 | 17 | 17(零遗漏) | SK-01 登记全 17 条;各步条目只引用自己那几条 |
| `KB` 压缩块 | 2 | 2 | `block()` 在 SK-01,`reviewBlock()` 在 SK-01 与 SK-24 |
| `Prompts` key | 6 | 6(零遗漏) | `sb.reviewUser` 挂 SK-18——景别衔接口诀现以文本形态落在该评审指令里,正是该条的判据面 |
| 模板三件套 | 3 | 3 | `tplImage`→SK-11、`tplVideo`→SK-19/SK-21、`tplReview`→SK-24 |
| `CmdRegistry` 命令 | 8 | 8(零遗漏) | SK-05 登记命令全面(playbook 投影的输入) |
| `ExpertsData` 专家 | 16 | 16(零遗漏) | SK-02 登记全 16 位;SK-21 另按能力面引用 8 位 style 专家 |

四类全覆盖由契约测试逐类断言:新增一条 KB 条目 / 提示词 key / 领域命令 / 专家而不进索引,contract 套件即红。

## 4. 与短名单键映射的三处出入(逐条记账)

1. **SK-08 加引 `WR_REVERSALS`**。短名单该行只写 `WR_FACESLAP`;打脸四步的完备性判定离不开反转式的判据,且该条目此前是零消费,归到最贴近的能力上比留在"仅压缩块间接生效"更清楚。
2. **SK-24 不重复登记四条方法论条目**。短名单该行写 `reviewBlock()` 口径 + `WR_HOOKS` `WR_FACESLAP` `DR_SHOT` `GC_RULES`;这四条已分别登记在 SK-06 / SK-08 / SK-17 / SK-19,若在本条再写一遍,`Skills.block('review')` 就不再逐字节等于 `KB.reviewBlock()`(既有审片注入点的对齐基准会破)。改为在 `note` 里写明维度口径以那四条为准,`kb` 留空、只挂 `reviewBlock()`。
3. **SK-18 加引 `sb.reviewUser`**。短名单第 4 节把它列为"变量模板,由 SK-17/SK-19 间接影响,不单独入选";但它的默认正文里就写着景别衔接口诀,是 SK-18 的判据当前所在处,挂在 SK-18 才是如实索引(也让 `Prompts` 6 个 key 零遗漏)。校验面落地时判据仍以 KB 条目为准,不从提示词正文反抄。

另有两条第一版索引条目按短名单收敛:`shots.mise`(`DR_MISE` + `und.system`)与 `film.distribution`(`WR_HOOKS` + `WR_PAYOFF`)不在 30 条内部能力里,其引用键分别由 SK-01(条目)、SK-03(`und.system`)、SK-06 / SK-15(钩子与卡点)接住,**没有任何键位因此掉出索引**。

## 5. 验收挂钩(contract 套件三条)

| 断言 | 判什么 |
|---|---|
| `skill 索引引用键单源` | `validate` 全绿(kb / kbBlocks / prompts / settings / cmds / experts / steps 参数逐个命中既有注册表;偏好键从 `gsettings.js` 的 `DEFAULTS` 现抽,不在测试里手抄第二份);七步词表与 `Domain.workflow` 主线步骤对齐;`block()` 逐字节等于 KB 原文;模块体不出现环境句柄;编排步骤只引用已注册命令 |
| `对齐短名单 30 条` | 条目数 30、`SK-01…SK-30` 连续、波次配比 9/5/16、四类单源键零遗漏、贯通层五条走 `stage='*'` 且不产出注入块、`covering` / `forExpert` / `gaps()` 三个投影可用 |
| `不挂假出口` | 每条 pending 面都有缺口编号;pending 含 check 的不登记校验项、含 orchestrate 的不登记步骤且 `playbook()` 返回 `null`;`CHECKS` 空表下七步 `check()` 一律空数组;`block('gen')` 为空(SK-21 待 G-05 定性)、`block('film')` 逐字节等于 `DR_RHYTHM` |

`node tests/unit.js` 全量 205/205 通过,未删测、未放宽既有断言(第一版的块逐字节、无环境句柄、编排命令已注册、校验项必须有实现四条全部保留,只把条目 id 与 `kind`→`kinds` 的读法跟着改)。

## 6. 后续波次入口(本轮不做)

- **W3(5 条)**:SK-03 人设经 `ctx` 过服务端、SK-04 记忆双端与召回纯函数、SK-16 前段编排补拆集/主体提取命令、SK-23 审片升一等步骤(落地时 `STAGES` 里 `review.wfStep` 与 `Domain.workflow` 同步改真)、SK-25 计划步骤升命令。动到 `wf-core.js` / `review.js` / `server.js` 注入点,须与并行槽错开。
- **W4(16 条)**:先补 S-01 校验宿主,再按 `Skills.gaps()` 的缺口投影逐条把 `CHECKS` 填起来——每填一条,该条目的 `pending` 去掉 `check` 面,契约测试里"不挂假出口"那条会自动改为要求它有实现。
- **两处待定性**(短名单第 4 节):G-05 的 `tplVideo` 二选一决定 SK-21 的 `pending` 能否清空;G-15 的压缩块与条目关系决定 SK-01 的注释口径。
