# W15 · 生成步注入面落地:`Skills.block('gen')` 从 0 到可对账

> 触发:`docs/skills-wave/w10-cycle2-audit.md` 第 5 节实测「`Skills.block('gen')` 长度为 **0**,SK-21 的注入面确实零消费」——
> 该 pending 当时是**诚实的**,不是假记账,所以本轮不是"改注释",是把那一面真的接出去。
> 基线:`cursor/w13-integration-a394 @ e899a71`(已含 W9 全部成果与 G-05 `tplVideo` 接入)。
> 并行避让:W13 合流、W14 `review.js` 消费各自单列;本槽只动 `skills.js` 的生成步条目与生成侧注入点,不碰 `js/review.js`。

## 1. 动工前复核:缺口的确切形状

`Skills.block(stage)` 的实现只做一件事——按条目登记的键现取 KB 正文拼起来,且**跳过 `pending` 含 `inject` 的条目**。生成步(`stage:'gen'`)下只有两条:

| 条目 | 机制面 | 基线状态 |
|---|---|---|
| SK-21 `gen.videoTpl` | inject | `pending:['inject']` → 不进拼块 |
| SK-22 `gen.renderCredential` | check | `pending:['check']` → 与拼块无关 |

所以 `block('gen') === ''` 是**登记表如实反映实况**的结果:主线生成步当时没有任何"按键取用 KB 正文"的注入点。对照其余各步都有:

| 步 | 既有注入点 | 拼块对账基准 |
|---|---|---|
| 分镜 | `WfCore.sbSystem` | `KB.pick('景别运镜','轴线匹配')` |
| 审片 | `js/review.js` / `server.js` 审片端点 | `KB.reviewBlock()` |
| 成片 | `review.finalSystem` 侧 | `KB.section('剪辑节奏')` |
| **生成** | **无** | **—** |

同时 `w1-pipeline-skill-map.md` 的 G-06 说的正是这件事:「AI 抽卡四条知识未进任何生成提示词构造点,只在 `KB.block()` 里给助手看」。

## 2. 结论:注入面两半,一半早已落地,另一半本轮落地

SK-21 的注入面不是一件事,是两件:

- **模板半(`settings.tplVideo`)**:G-05 已落地。`WfCore.fillTplVideo`/`tplVideoNote` 在拆镜要求行、模型未给 `prompt` 的兜底、本地拼装出口 `SB.buildShotPrompt` 三处成型逐镜 `s.prompt`,而 `s.prompt` 就是 `Domain.buildVideoRequest` 真正发出去的那一条。这一半已有出口,只是**它是设置项而不是 KB 正文,`block()` 表达不了**(拼块只出 KB 文本)。
- **方法论半(KB 抽卡条目)**:本轮落地。生成步的 LLM 环节是**视频提示词改写**——改写器要遵守的正是「抽卡公式」的八维结构与「抽卡军规」的动作/运镜/稳定词纪律。把这两条按键整条注入改写人设,生成步就有了一个真实的按键取用点,`block('gen')` 随之非空且逐字节等于那个注入点的方法论段。

`pending` 因此从 SK-21 去掉:两半都有出口,再挂 pending 就是反向的不诚实。

## 3. 落地点

**装配口(双端单源,`js/wf-core.js`)**,与 `sbSystem` 同形态:

```
W.genPromptSystem = ov => Prompts.get('gen.promptSystem', ov) + KB.pick('抽卡公式', '抽卡军规');
```

**注册表新键(`js/prompts.js`)**:`gen.promptSystem`「视频提示词改写 · 系统人设」,`def` 与既有内联人设句 `你是文生视频提示词专家。` **逐字节相同**——用户在「偏好学习 → 全局默认值 → 核心提示词 skill」可在线改写,不改则输出与接入前一致。

**消费点(本轮 1 处)**:`js/sb-views.js` `openPromptTool` 四策略优化的 `system` 改走 `WfCore.genPromptSystem()`,模块内不再留人设句字面。

**索引(`js/skills.js` SK-21)**:

| 字段 | 基线 | 本轮 |
|---|---|---|
| `name` | 视频提示词模板落位 | 视频提示词模板落位与抽卡方法论注入 |
| `pending` | `['inject']` | `[]` |
| `kb` | `['抽卡公式']` | `['抽卡公式','抽卡军规']` |
| `prompts` | — | `['gen.promptSystem']` |
| `gaps` | `['G-05','G-13']` | `['G-06','G-13']` |

`gaps` 里 G-05 换成 G-06:G-05(`tplVideo` 二选一定性)已由本条的模板半闭合,而 G-06 只闭了一半(见第 6 节),留着才对得上实况。`settings:['tplVideo']` 与命令/专家登记不动。

## 4. 逐字节对账

行为层与源级各一道,`node tests/unit.js contract` 断言:

```
Skills.block('gen')            === KB.pick('抽卡公式', '抽卡军规')
WfCore.genPromptSystem({})     === Prompts.get('gen.promptSystem', {}) + Skills.block('gen')
WfCore.genPromptSystem({ 'gen.promptSystem': '改写器。' })
                               === '改写器。' + KB.pick('抽卡公式', '抽卡军规')
```

第三条锁的是**覆盖只换人设句、方法论正文不受影响**:用户把人设改写成别的,抽卡口径不会被顺带改掉。

实测数字:`block('gen')` 长度 **344**(基线 0),`Skills.validate(deps)` 零问题。

另有两条护栏:

- 源级断言 `js/sb-views.js` 必须出现 `WfCore.genPromptSystem(`——回退成内联人设句时先红。
- 源级断言 `js/domain.js` **不引用 `KB.`**,把"顺手把方法论注进 `Domain.buildVideoRequest`"这条路封死,理由见第 5 节。

原先那条 `assertEq(Skills.block('gen'), '')` 不是删掉了断言强度,而是换成了更普适的形式——逐条遍历 `pending` 含 `inject` 的条目,断言各自按自身 `stage` 单取的拼块为空。基线只覆盖生成步一条,现在覆盖全部未落地注入面(如 SK-10 文案 AI 味),将来谁去掉 pending 而没有真出口,这条照样红。

## 5. 不注 `Domain.buildVideoRequest`(与 G-05 同一条理由链)

`buildVideoRequest` 同时被 `Domain.buildGenerationSignature` 用来算 `shotInputHash`。在那里拼进 344 字方法论文本,**所有存量已出片镜头的指纹立即失配**,全量误报「素材已更新·建议重生成」,违反"新判据无记录保持原语义"的迁移纪律。方法论文本的位置是**改写器的人设**(告诉 LLM 按什么口径写),不是**发给视频模型的画面描述**(那一条已由五段式结构与 `tplVideo` 模板治理)。所以:

- 生成请求构造点与指纹口径**一字未动**;
- 本轮零新增 `billingAction`、零新增 LLM 调用、零新增上传,四策略优化沿用原本的直连计费惯例(`llm.optimize`);
- 未配置 LLM 时的本地规则回退分支未改。

## 6. 如实记录:仍未闭的部分

- **G-06 只闭一半**。「抽卡公式」「抽卡军规」两条进了生成步提示词构造点;「多镜头写法」「主体参考」两条**仍未进任何提示词构造点**——`主体参考` 的工程做法虽已在 `Domain.shotRefImages` 的主体定义后缀里物化(「将图片N定义为「名字」」+ 不漂移约束),但那是代码实现而非条目正文注入。故 SK-11/SK-13/SK-19 的 `gaps` 里 G-06 一概不动,不借本轮成绩去清别条的账。
- **同一句人设还有两处内联未收编**:`js/review.js` 一键优化(第 331 行)与 `cli.js` produce 修订重抽(第 1129 行)。这两处共用 `WfCore.buildOptimizeUser`,是审片闭环的浏览器/CLI 两端,收编须两端同批改否则新造双端不一致;`review.js` 归并行槽,本轮按分工不碰,`cli.js` 也就一并留下。留下的后果如实说清:**用户覆盖 `gen.promptSystem` 时,这两条链路不跟随**,仍用内联默认句。它们的 `def` 与内联字面完全相同,故未覆盖时三处行为一致。
- **G-13 仍在 SK-21 的 `gaps` 里**:模块内联提示词入注册表的覆盖面远不止这一句(`persona.js`/`episode-util.js`/`beatboard.js` 等仍是内联),本轮只多收编了一句。

## 7. 回归

- `node --check`:`js/prompts.js`、`js/wf-core.js`、`js/sb-views.js`、`js/skills.js`、`tests/unit.js` 全通过。
- `node tests/unit.js`:**299/299 PASS, 0 FAIL**(基线 298,净增 1 项断言套件)。
- README 同步:架构图 `wf-core` 装配口一行、KB 取用面注入点清单、skill 索引的注册表提示词计数(6→7)与各步拼块对账基准、核心提示词 skill 条目清单、单测断言数。
- 未运行 `tests/e2e.js`(按仓库约定仅用户明确要求时跑);本轮无 DOM 交互改动,`openPromptTool` 的按钮绑定与弹窗结构未动。
