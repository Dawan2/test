# W147 · 计划层的第三份门槛拷贝:`js/plans.js` 的项目级待办改读 `Domain.gateBlockers`

**范围**:`js/plans.js`(`TODO_OF` 的三个项目级取材器改按阻塞码取材,新增 `gateMap` 一处取值口)+
`tests/unit.js`(plans 2、contract 1 共 +3)+ `README.md` 与本目录 `README.md` 同步。
**基线**:`cursor/w142-integration-4266`(`d877051`,开工现取核实相符,自测 501/501)。
**不做**:不改 `Domain.gateBlockers` 的判据与产出形状(一个字未动)、不改 `js/issues.js` 的门槛投影表、
**不让任何一道发布门去看 `p.script`**(G1–G10 一字未改)、不新增计费动作与领域命令、
不改计划步的 `key` 与授权位语义(args 仍一律留空)、不从 `Skills.gaps()` 摘任何键、不发明新的能力概念、
不合并其它并行槽。

## 1. 病灶:同一件事的第三份判据,而且这一份口径还不一样

W138 把「剧本在不在 / 主体库空不空 / 缺几张图 / 有没有分集」收进 `Domain.gateBlockers`,
`Domain.workflow` 的前三步与 `Issues.collect` 的门槛投影表都改读那一份。它的交接第 5 条如实登记了
**没收的那一份**:`js/plans.js` 的 `TODO_OF` 里,三个项目级取材器各自内联又判了一遍。基线 `d877051` 原文:

```js
'project.extractSubjects': ({ p }) => (String(p.script || '').trim() && !(p.subjects || []).length) ? …,
'subject.generateImage':   ({ p }) => { const noImg = (p.subjects || []).filter(s => !s.image).length; … },
'project.splitEpisodes':   ({ p }) => (String(p.script || '').trim() && !(p.episodes || []).length) ? …,
```

主体那两半与 `gateBlockers` 恰好同结论(缺图数的算式逐字相同,库空时 `noImg` 自然为 0,
与 `gateBlockers` 里那处 `else if` 互斥的效果一致)。**剧本那半不同口径**:

| | 判「有剧本」的表达式 | 提取过主体但没存整本原文的老项目 |
|---|---|---|
| `Domain.gateBlockers`(流程条 / 问题中心同读) | `p.script \|\| p.extractDone` | 认它**有**剧本 |
| `js/plans.js` 基线 | `String(p.script \|\| '').trim()` | 认它**没有**剧本 |

后果不是"某一步文案不对",而是**整份计划推不出来**。基线上现跑(Node `vm` 加载真实源码,
`fromWorkflow` 的步骤标题串,`(无计划)` = 返回 `null`):

| 夹具 | 基线 `d877051` | 本槽 |
|---|---|---|
| 空项目 | (无计划) | (无计划) |
| 只有剧本 | 提取主体 / 剧本拆集 | 同 |
| **老项目(`extractDone`,无原文)** | **(无计划)** | 提取主体 / 剧本拆集 |
| **老项目 + 主体缺图** | 补齐主体参考图(1 个缺图) | 补齐主体参考图(1 个缺图) / **剧本拆集** |
| 剧本 + 缺图主体 | 补齐主体参考图(1 个缺图) / 剧本拆集 | 同 |
| 剧本 + 全图主体 + 有分集 | 智能分镜:第一集 | 同 |

第三行那一格是用户看得见的假话:同一个项目,流程条画着"剧本 ✓ 主体 ✗ 分集 ✗"、问题中心列着
"未提取主体""还没有分集"两条低危,点「📋 按主线生成」却弹 `当前主线无待推进事项,无需计划`。
第四行那一格更隐蔽——计划出得来,但少了拆集那一步,用户照着做完补图就没有下一步了。

## 2. 落法:按阻塞码取材,映射写明,不复制判据

W138 交接里那句顾虑仍然成立——**计划步要答的是「该跑哪条命令」,阻塞项答的是「这一步卡在哪」,
两者形状不同**,所以不能把 `gateBlockers` 的条目直接当计划步用(它的 `label` 是「未上传剧本」这类断点词,
不是「剧本拆集:整本切成分集」这类动作词)。收口的不是**形状**,是**判据**:阻塞码在不在,由那一份说了算;
码 → 步骤文案,显式写在计划层。

```js
const gateMap = p => {
  const m = {};
  (Domain.gateBlockers(p) || []).forEach(g => { m[g.code] = g; });
  return m;
};

'project.extractSubjects': ({ gates }) => (!gates['no-script'] && gates['no-subjects']) ? … : null,
'subject.generateImage':   ({ gates }) => { const g = gates['subjects-no-image']; return g ? …`(${g.count} 个缺图)`… : null; },
'project.splitEpisodes':   ({ gates }) => (!gates['no-script'] && gates['no-eps']) ? … : null,
```

三处细节各有理由:

1. **提取与拆集各判两码**(`!gates['no-script']` 加本步自己的码)。这不是把门槛判了两遍,而是投影步序的
   前置关系:剧本这一步没过时,提取主体与剧本拆集都不该抢在前面(命令层自己也会以 `no-script` 拒绝)。
   基线里这个前置由 `String(p.script).trim()` 兼职,现在它就是"上一步的断点还在不在"。
2. **缺图数取 `g.count`**,不在计划层重数一遍。`gateBlockers` 已经把这个数算好挂在阻塞项上
   (W138 加 `count` 列正是为了让消费方别重数),计划层再 `filter().length` 一次就是第二份算式。
3. **`gates` 经 ctx 注入**,项目级 `pick({ p, gates: gateMap(p) }, false)` 一处取值,集级 ctx 不带它
   (集级前置仍是 `Domain.episodeState`,那一半本来就是单源的,一行未改)。
   `fromWorkflow` 每次现取一份,不缓存跨调用——计划支持"按主线重建",状态必须现读。

`Plans.projection()` 的自省表、`占不占计划步` 的登记、12 步上限、导航步不挂命令、args 一律留空——
这些全没动,既有 9 条 plans 用例一条未改。

## 3. 行为变化:只有一格,而且是把假话改成真话

上表两处「改」都只发生在 `extractDone && !script` 这一类老项目上,其余夹具逐字节不变。
这类项目往下走会遇到什么,如实登记:

- `project.extractSubjects` 命令自带回退——取不到 `p.script` 就拼各集正文,故这类项目里它**能真跑**
  (无分集时才拒绝)。
- `project.splitEpisodes` 命令只认 `p.script`,这类项目里它会回 `blocked / no-script`
  「项目暂无剧本原文,请先上传剧本」。`execStep` 把这个回执记成 `failed` 并把这句话写进步骤尾注。

**这仍然比基线好**:基线是整份计划不出、弹一句"无待推进事项"(用户无从知道差什么);
现在是计划出得来、执行到那一步如实说"缺整本原文,先上传",指向的正是该做的事。
把它做成"计划层提前避开这一步"就等于在计划层再写一份"命令能不能跑"的判据,是同一个病换个地方犯。

## 4. 加测(+3)

| # | 套件 · 用例 | 钉住什么 |
|---|---|---|
| 1 | `plans · fromWorkflow:项目级前置三步的待办判定现取 Domain.gateBlockers(计划层不写第三份门槛拷贝)` | 桩替换 `Domain.gateBlockers` 而项目对象一字不改:①回空 → 一步不出;②只回 `subjects-no-image` 且 `count: 7`(项目里真实只缺 1 张)→ 恰一步且文案写 7;③回全部三码 → 提取/拆集都不出 |
| 2 | `plans · fromWorkflow:剧本这一步与流程条同口径(提取过主体的老项目不再一步都推不出来)` | 先断言前提(`Domain.workflow` 认这类项目 `script` 步 `done`),再断言计划出得来且恰是提取 + 拆集;反向那半:两个字段都空时前置两步仍不出 |
| 3 | `contract · 前置门槛第三份拷贝已消:js/plans.js 的项目级待办按 gateBlockers 的码取材,不自己判剧本/主体/分集` | 源级三条(`p.script` 零命中、`!s.image` 零命中、`!(p.episodes \|\| []).length` 零命中)+ 按码取材恰 5 处 + 每个码都在 `Domain.gateBlockers` 的实际产出码集里(码名分裂即红) |

用例 1 的桩是本槽的主判据:**内联拷贝拿不到桩**——它读的是项目对象,桩换的是派生,
所以退回任何一份内联判定,那一条当场红。用例 3 是它的源级兜底(免得哪天有人"读了派生又顺手自己判一遍")。

## 5. 变异复核(四组,各红各的)

| # | 变异 | 结果 |
|---|---|---|
| M1 | 三个取材器整体退回基线内联拷贝 | 红 **3**:plans 桩那条(报"门槛派生说没有前置断点,计划层就不该自己再判出一步")、plans 同口径那条(报"两个面结论不许相反")、contract 源级那条(`p.script` 期望 0 实际 2) |
| M2 | 只把补图那半退回内联 `filter(s => !s.image).length`(真实夹具上同值,只有桩看得出) | 红 **2**:plans 桩那条 + contract 的缺图那句 |
| M3 | 码名分裂:`gates['subjects-no-image']` 写成 `gates['subject-no-image']`(W138 收敛掉的那个旧码) | 红 **5**:contract 点名"不是 Domain.gateBlockers 会回的码",另有 4 条既有 plans 用例跟着红(补图步整个静默筛空)——静默筛空确实与"这步没待办"一模一样,靠既有用例的绝对断言才露出来 |
| M4 | 拆集步丢掉 `!gates['no-script']` 前置 | 红 **4**:含既有那条 `无待办即无计划`(空项目凭空多出一步拆集)与 contract 的"按码取材恰 5 处" |

另反向抽查:W138 立的 `前置门槛码单源` 那条契约用例本槽全程绿(`js/domain.js` 与 `js/issues.js` 一字未改)。

## 6. 数字

| 项 | 基线 `d877051` | 本槽 |
|---|---|---|
| `node tests/unit.js` | 501/501,0 FAIL | **504/504**,0 FAIL |
| └ `plans` 子套件 | 9 | **11** |
| └ `contract` 子套件 | 109 | **110** |
| `node tests/integration.js` | 130/130,0 FAIL | **130/130**,0 FAIL(该文件未进 diff,复跑核实) |
| `node tests/cli.smoke.js` | 100/102 | **100/102**(两项与 `master` 同名同表现:`未登录 whoami → exit 3`、`llm --json mock 链路`) |
| `node tests/e2e.js` | 未跑(按目录纪律仅在明确要求时跑) | 未跑 |

`node --check` 过:`js/plans.js`、`tests/unit.js`。

棘轮按 **live** 抬(不抄旧数):`tests/unit.js` 单元 `FLOOR` 501 → **504**、记账件 `FLOOR` 155 → **156**;
`README.md` 的「单元测试(N 项断言」501 → 504、契约段自报条数 109 → 110;
本目录 `README.md` 明写份数 155 → **156**(含本份)并补索引行。
四格下限与 live 的差额落地后全为 0(单元 504/504、集成 130/130、CLI 冒烟 102/102、记账件 156/156)。

## 7. 边界

- **不动发布门**:G1–G10 判据、`fail/warn` 计数、`overall` 四级映射一字未改;本槽根本没碰
  `js/release.js` / `js/release-core.js`,也没有让任何一道门去读 `p.script`。
- **不动 `Domain` 与 `Issues`**:`gateBlockers` 的四行判据、`GATES` 投影表、危险级取值全部原样;
  本槽只是给那一份加了第三个消费方。
- **不改计划步语义**:`key`(`extract`/`subj`/`split`)、`label` 文案、导航步与命令步的分工、
  args 一律留空这条纪律,全部逐字不变——`p.agentPlan` 已落库的老计划不受影响。
- **不摘 `gaps`**:`Skills.gaps()` 仍 20 键,短名单 `note` 一字未动——本槽收的是既有三个消费面之间的
  口径一致,不对应任何一条缺口编号的"落地",没有键可摘。
- **不发明能力概念**:没有新增 skill 条目、没有新 `SK-xx`、没有新命令与端点。
- **不合并其它槽**:基线是 W142 集成线 head,本槽只加自己这一条分支提交。

## 8. 交接

1. **`gateBlockers` 现在有三个消费方**(流程条 `Domain.workflow`、问题中心 `Issues.collect`、
   计划层 `Plans.fromWorkflow`),三个的**投影表形状各不相同**且这是有意的:
   问题中心投的是「危险级 + 落点 + 说明」,计划层投的是「命令 + 步骤文案」,流程条按 `step` 分组回原样。
   新增一档阻塞码时,三处**各自决定投不投**——不投在问题中心会静默收不出条目(W138 用例 2 点名),
   不投在计划层则那一步不占计划步(本槽用例 3 的"恰 5 处"会因码数对不上而红,但它报的是处数不是语义,
   真要点名得同轮加一句)。
2. **`extractDone && !script` 这类老项目的拆集步会执行失败**(3. 节末尾),这是有意留的如实回报。
   要让它更顺,正解是补上"从各集正文回填整本原文"这条路(命令层 `project.extractSubjects` 已有同款回退),
   不是在计划层提前避开这一步。
3. **集级取材器仍各自内联判 `ep.content`**(`episode.generateStoryboard` 那条)。它与项目级门槛
   **不是同一件事**:`Domain.episodeState` 里的分集级 `no-script` 判的是本集正文,项目级判的是整本原文,
   W138 的契约用例专门钉住这两级"同码不同判定输入,各只一处登记"。要收它得先看 `episodeState`
   的 blockers 能不能直接当计划步取材器用,与本槽是两件事。
4. **`gateMap` 每次现取,不缓存**。计划的「🔄 按主线重建」按钮依赖这一点;哪天为性能加缓存,
   记得它跨的是一次 `fromWorkflow` 调用而不是跨会话。
