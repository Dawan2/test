# W138 · 问题中心在无分集时收不出任何问题:剧本/主体/分集三步的前置断点收进 `Domain.gateBlockers`

**范围**:`js/domain.js`(新增 `gateBlockers`,`workflow` 那三步改读它)+ `js/issues.js`(新增前置门槛投影表与
`Issues.gates()`,码名 `subject-no-image` 收敛为 `subjects-no-image`)+ `tests/unit.js`(issues 2、contract 1、
release 1 共 +4,另按新行为改了 5 条既有用例的夹具/断言)+ `README.md` 与本目录 `README.md` 同步。
**基线**:`cursor/w133-integration-6788`(`0dbd69e`,开工现取核实相符)。
**不做**:不改发布门 G1–G10 的任何判据(尤其**不让任何一道门去看 `p.script`**)、不新增计费动作与领域命令、
不改 W131 的 `low-review` 走 `Domain.reviseTargets` 那条、不从 `Skills.gaps()` 摘任何键、不动 `Issues.reminders()`
那七条方法论提醒的登记与文案、不发明新的能力概念、不合并其它并行槽。

## 1. 病灶:`collect` 的主体是逐集循环,循环体不进就没有结论

`Issues.collect(p, ctx)` 的形状是"项目级挑一条主体缺图 + `(p.episodes || []).forEach(...)`"。
所有状态类问题——缺剧本正文、未拆镜、分镜判旧、失败镜、过期镜、待确认、未审片、审片判旧、低分、成片过期——
**全部在那个 `forEach` 的循环体里**。于是分集表为空时,循环一步都不进。

基线 `0dbd69e` 上直接跑一遍(Node 侧直调,不经浏览器):

```
空项目 { subjects: [], episodes: [] } → Issues.collect(p).length === 0
```

而同一个项目对象交给 `Domain.workflow`,那三步一条不差地给得出断点与推荐动作:

| 步 | blockers | recommendedAction |
|---|---|---|
| `script` | `no-script`「未上传剧本」 | 上传剧本 |
| `subjects` | `no-subjects`「未提取主体」 | 主体提取与生成 |
| `eps` | `no-eps`「未建分集」 | 新建分集 |

也就是说**同一个项目在两个面上结论相反**:流程条说"主线断在剧本这一步",问题中心说"🎉 项目无待处理问题,主线畅通"。
这句话是 `js/issues-ui.js` 的空态文案,新建项目打开问题中心看到的就是它。CLI 的 `hujing issues <pid>`
与 MCP 的 `hujing_issues` 读的是同一份投影,回的也是 `total: 0` ——助手按它判断"这个项目没事",
而这个项目其实一个字的剧本都还没有。

基线上这个 0 还**被一条用例钉着**:`issues` 套件里写着 `assertEq(sb.Issues.collect({…episodes: []}).length, 0, '空项目零条')`。
它当年钉的是"未审那条不要越过早退分支抢报",顺手把整个空态一起钉成了 0,于是这条断点在测试里也是"预期行为"。

### 1.1 另一处:同一件事两个码名

主体缺权威参考图这件事,两侧各有一个码,同样在基线上现取核实过:

```
Issues.collect(q).map(kind)                      → subject-no-image
Domain.workflow(q).steps(subjects).blockers      → subjects-no-image
```

`js/flow-tpl.js` 的 `STEP_META['subject.generateImage'].codes` 写的是 `subjects-no-image`(它按 `Domain` 的码筛待办),
问题中心写的是 `subject-no-image`。两侧谁也没错,只是**没有一处判据说它们必须是同一个词**:
按码筛的消费方(流程模板的待办标注、CLI `issues --kind`、MCP 工具的 `kind` 过滤)在这两个词之间挑错一个就静默筛空,
而这种筛空看起来与"这一项没问题"一模一样。

## 2. 为什么不是"在循环外再补几个 if"

补 `if (!p.script) out.push(...)` 这一路能让空项目出条目,但它把第三份判据写进了问题中心:
"什么算没有剧本"在 `Domain.workflow` 里是 `p.script || p.extractDone`(提取过主体的老项目不算缺剧本),
在问题中心手写一遍就会漏掉 `extractDone` 那一半;主体那条还要再判一次"库空"与"缺图"的互斥。
这正是本目录反复收的那类账:**同一件事的判据散成两份,两份都对的时候看不出来,一份改了才发现另一份没跟上。**

所以本槽的落点不在问题中心,而在两侧共同的上游。

## 3. 落地

### 3.1 判据收在 `Domain.gateBlockers`(`js/domain.js`)

剧本/主体/分集这三步的判定输入**全是项目对象本身**(整本原文 / 主体库 / 分集表),与逐集推导无关,
所以它们能从 `workflow` 里单独抽出来而不牵动 `epStates`:

```js
D.gateBlockers = function (p) {
  const eps = (p && p.episodes) || [];
  const subjects = (p && p.subjects) || [];
  const noImg = subjects.filter(s => !s.image).length;
  const out = [];
  if (!(p && (p.script || p.extractDone))) out.push({ step: 'script', code: 'no-script', label: '未上传剧本' });
  if (!subjects.length) out.push({ step: 'subjects', code: 'no-subjects', label: '未提取主体' });
  else if (noImg) out.push({ step: 'subjects', code: 'subjects-no-image', label: noImg + ' 个主体缺权威图', count: noImg });
  if (!eps.length) out.push({ step: 'eps', code: 'no-eps', label: '未建分集' });
  return out;
};
```

**一条判据都不是新写的**:四行逐字取自 `workflow` 原来那三步的内联表达式(含 `else if` 那处互斥——
库空时只报"未提取主体"、不额外报"0 个主体缺图")。新增的只有 `step` 与 `count` 两列:
前者让消费方按主线步分组,后者让问题中心的 `count` 字段不必再数一遍缺图主体。

`workflow` 那三步改成读它,产出形状**逐字节未变**(仍是 `[{code,label}]`,`step`/`count` 不外泄到 blockers):

```js
const gates = D.gateBlockers(p);
const gateOf = k => gates.filter(g => g.step === k).map(g => ({ code: g.code, label: g.label }));
```

`flow-tpl` 的 `gaps` 与待办标注是 `workflow` 的下游,一行未改而结论不变。

### 3.2 消费面收成一张表(`js/issues.js`)

与那七条方法论提醒的 `REMINDERS` 同形,前置门槛也是一张表,**键就是 `Domain` 的阻塞码**:

```js
const GATES = {
  'no-script':         { sev: 'low', at: '',      detail: () => '项目还没有剧本原文:…' },
  'no-subjects':       { sev: 'low', at: '/roles', detail: () => '主体库还空:…' },
  'subjects-no-image': { sev: 'mid', at: '/roles', detail: p => '缺参考图的主体参与生成会触发防废片警示:' + … },
  'no-eps':            { sev: 'low', at: '',      detail: () => '还没有分集:…' },
};
```

`collect` 只按 `Domain` 给出的码投影,表里只定三件事:**危险级、落到哪个页面、一行说明**。
标题(`label`)原样取 `Domain` 的文案,不在这一层重写第二版;`count` 取 `g.count || 1`。
`Issues.gates()` 是这张表的只读投影(每次现生成副本,与 `reminders()` 同一纪律),
CLI/MCP 与测试都能拿它反查"哪些码归前置门槛这一档"。

表外的码一律不投——`Domain` 那边哪天多一档而这张表没跟上,不会静默漏掉,由 5 节那条双向断言点名。

### 3.3 处置一律走导航

四条都只给 `goto`(剧本与分集落项目页、主体两条落 `/roles`),一条命令都不挂。
前置三步没有一个是"能替用户按"的动作:上传剧本是用户的输入,提取主体与拆集都是计费动作,
按目录既有纪律(问题中心不代按会扣积分的按钮),这里只把人带到该去的页面。

### 3.4 危险级:三条门槛态一律低危,主体缺图沿用中危

这一格是本槽唯一一处**不是照搬 `Domain` 就能定下来**的取值,理由要写清楚。

发布门 G2 数的是 `Issues.collect` 里的高/中危条目。把前置断点抬成中危,等于让 G2 转而去读 `p.script`
与"主体库空不空"——而这两件都不是交付判据:

- 主线就绪由 **G1** 逐集判 `ep.content`(项目整本原文有无不改它的结论,这一点本目录已有一条用例钉着);
- "有没有分集"由 **G3** 判(`if (!eps.length) fail('无分集')`);
- 主体缺图由 **G9** 判(缺图主体数为 0),空主体库的缺图数本来就是 0。

也就是说三条门槛态在发布环节各有自己的门,问题中心不必也不该在 G2 上再叠一层。
实测这一层叠上去的后果不是理论问题:把 `no-script` 抬成 `mid` 之后,`release` 套件里
"干净项目 G2 应 pass"、"齐备项目 overall=pass"、"`project.release` 齐备项目应打出版本"
连同 `split` 套件那条"仅分集补写入不动发布门"**一起红 12 条**(见 5.2 变异 4)——
那些夹具都是没写 `p.script` 的成片项目,它们本来就该放行。

`subjects-no-image` 沿用中危是保持原状:它在基线上就是中危条目,判的又与 G9 同一件事,本槽没有改它的理由。

## 4. 顺带修掉的一处:码名收敛

`subject-no-image` → `subjects-no-image`。全仓核实过,这个旧码只在 `js/issues.js` 与 `tests/unit.js`
两处出现,**没有任何前端/CLI/MCP 的分支按它取值**(`js/issues-ui.js` 按 `it.cmd`/`it.goto` 分派,不认 kind),
故改名不带兼容层;`FIX_LABEL`、发布门、命令注册表一处都不涉及。收敛之后,
"按码筛"的四个面(流程模板待办、问题中心、CLI `--kind`、MCP `kind`)读的是同一个词表。

## 5. 断言与变异

### 5.1 新增 4 条,另有 5 条既有用例按新行为改了夹具

| # | 套件 · 用例 | 钉的是 |
|---|---|---|
| 1 | `issues · collect:空项目/只有剧本/只有主体 → 前置断点(码与文案取 Domain.gateBlockers,不是零条)` | 四档夹具逐档的码序、标题取自 `Domain`、一律导航无命令、无 `epid`、三条低危缺图中危、`count` 同源 |
| 2 | `issues · collect:前置断点与流程条同一份——三步的码与文案逐夹具双向相等(码名分裂即红)` | 五个夹具上 `code=label` 串**双向相等**;`Domain` 摊得出的码 ⊆ `Issues.gates()`,反向也钉;`gates()` 给副本 |
| 3 | `contract · 前置门槛码单源:剧本/主体/分集三步的阻塞码只在 Domain.gateBlockers 一处,流程条与问题中心都不另写` | 源级:三个码在 `js/domain.js` 各只一处字面、`no-script` 恰三处(两级登记 + 一处按码取状态)、问题中心零旧码、`flow-tpl` 按码筛的前置码同在 `gates()` 里 |
| 4 | `release · G2 不因前置门槛断点改判:无 p.script / 无主体的交付项目照旧 pass(前置断点一律低危)` | 3.4 那条取值:无整本剧本的成片项目恰报一条低危、G2 仍 `pass`;主体库空同理 |

用例 2 的"双向"是有讲究的:只钉一个方向(`Domain` 的码都能在问题中心找到)拦不住问题中心
凭空多出一条门槛类条目;只钉另一个方向则拦不住漏投。两向都钉之后,**两侧码集恒等**,
1.1 那种分裂在任一侧发生都当场红。

改夹具的 5 条既有用例,改法与理由:

| 用例 | 改动 |
|---|---|
| `collect:干净项目返回空` | 夹具补 `script` —— "干净"现在也包含前置三步干净,断言仍是 0 条 |
| `collect:…各归其类` | `subject-no-image` → `subjects-no-image`(同一条断言,只换码名) |
| `collect:已生成未审 → 恰一条 no-review` | 夹具补 `script` 与一个有图主体(否则门槛条目会混进"恰一条"的比对);末尾那句「空项目零条」改成「空项目不报未审」——它原本要钉的就是这个意思,空态整体交给用例 1 |
| `collect:审片记录判旧 → review-stale` | 同上,补前置三步齐备 |
| `双端单源:…kind 集合全等` | 状态类清单里的码名同步;低危全集的判据从"必在 `reminders()` 里"放宽成"必在 `reminders()` 或 `gates()` 里"——两张表就是低危条目的全集,表外仍不许凭空多一条 |

### 5.2 变异实测(逐条单独施加、跑完 `git checkout` 复原)

| # | 变异 | 结果 |
|---|---|---|
| 1 | `js/issues.js` 不投前置断点(把 `Domain.gateBlockers(p)` 换成 `[]`,等于退回基线行为) | 红 **6**:issues 2 + 跨端 1 + release 1 + contract 1 + 「各归其类」1 |
| 2 | 表键改回分裂码 `subject-no-image` | 红 **5**:用例 1 的互斥那格、用例 2 的 `f2` 夹具、跨端 kind 集合、`各归其类`、contract 的零旧码那句 |
| 3 | `js/domain.js` 的 `workflow` 主体步退回内联 blockers(两份判据并存,行为完全一致) | 红 **1**:`no-subjects 的字面应只此一处:期望 1,实际 2` |
| 4 | `no-script` 危险级 `low` → `mid` | 红 **12**:release 5 + issues 5 + split 1 + 本槽用例 4 —— 3.4 那条取值的实测依据 |
| 5 | `gateBlockers` 去掉 `no-eps` 那行 | 红 **4**:issues 2 + contract 1 + **`flow` 套件既有那条**(缺前置 `gaps` 少一项)——证明下游确实同读这一份 |
| 6 | `GATES` 表删掉 `no-eps` 一行(`Domain` 仍给) | 红 **3**:issues 2 + contract 的"`flow-tpl` 按码筛的前置码应同在 `gates()` 里" |

变异 1 复现的就是基线行为,而基线上它当然全绿(那条 `空项目零条` 正是在替它背书);
变异 3 值得单记一句:它**不改任何行为**,只是把判据抄回第二份,六条里只有它是纯源级判据接住的。

## 6. 回归数字

| 套件 | 基线 `0dbd69e` | 本槽 |
|---|---|---|
| `node tests/unit.js` | 492/492,0 FAIL | **496/496**,0 FAIL |
| └ `contract` 子套件 | 107 | **108** |
| `node tests/integration.js` | 130/130,0 FAIL | **130/130**,0 FAIL(该文件未进 diff,复跑核实) |
| `node tests/cli.smoke.js` | 100/102 | **100/102**(两项与 `master` 同名同表现:`未登录 whoami → exit 3`、`llm --json mock 链路`) |
| `node tests/e2e.js` | 未跑(按目录纪律仅在明确要求时跑) | 未跑 |

`node --check` 过:`js/domain.js`、`js/issues.js`、`tests/unit.js`。

棘轮按 **live** 抬(不抄旧数):`tests/unit.js` 单元 `FLOOR` 492 → **496**、记账件 `FLOOR` 147 → **148**;
`README.md` 的「单元测试(N 项断言」492 → 496、契约段自报条数 107 → 108;
本目录 `README.md` 明写份数 147 → **148**(含本份)并补索引行。
四格下限与 live 的差额落地后全为 0(单元 496/496、集成 130/130、CLI 冒烟 102/102、记账件 148/148)。

## 7. 边界

- **不动发布门**:G1–G10 判据、`fail/warn` 计数、`overall` 四级映射一字未改;G2 的输入变了(多了低危条目)
  但它只数高/中危,状态不变,并由用例 4 钉住。
- **不新增计费动作**:四条前置断点全是导航,`Tasks.run` 与 `billingAction` 一处未碰。
- **不摘 `gaps`**:`Skills.gaps()` 仍 20 键,短名单 `note` 一字未动——本槽落的是既有两个面之间的贯通,
  不对应任何一条缺口编号的"落地",没有键可摘。
- **不动 W131 那条**:`low-review` 仍走 `Domain.reviseTargets`,`js/issues.js` 里那一段一行未改
  (W131 立的四条源级断言全绿)。
- **不发明能力概念**:没有新增 skill 条目、没有新 `SK-xx`、没有新命令与端点。
- **不合并其它槽**:基线是 W133 集成线 head,本槽只加自己这一条分支提交。

## 8. 交接

1. **前置门槛只覆盖主线前三步**。`workflow` 后四步(分镜/剪辑/审片/成片)的 blockers 有意**没有**接进
   问题中心:那四步的断点在逐集循环里早就逐条报过(`no-shots`/`failed-shots`/`no-review`/`composed-stale`…),
   把项目级那份也投一遍会变成同一件事报两条。要动这一层,得先决定"项目级汇总条目"与"逐集条目"谁承接。
2. **`gateBlockers` 新增一档时必须同轮加 `GATES` 表一行**,否则那一态在问题中心静默收不出来——
   用例 2 的双向断言会点名报出,别把它当成"表可以自由裁剪"。
3. **危险级那一格是产品口径不是实现细节**(3.4)。要把某一条抬成中危,得先答"发布门 G2 该不该因此改判";
   现在的答案写在用例 4 里,改它就要同轮改那条用例并说明理由。
4. **空项目现在有 3 条低危条目**,项目页 🩺 角标从 0 变成 3。这是有意的(新建项目本来就该被引导),
   但若产品希望角标只数高/中危,那是 `js/issues-ui.js` 的 `badgeHTML` 口径问题,不要回头去改危险级。
5. **`js/plans.js` 还有第三份**,本槽有意没碰,如实记在这里而不是悄悄留白:`TODO_OF` 里
   `project.extractSubjects` / `subject.generateImage` / `project.splitEpisodes` 三个取材器各自内联判了一遍
   "剧本在不在、主体库空不空、缺几张图、有没有分集"(且剧本那半判的是 `String(p.script||'').trim()`,
   与 `gateBlockers` 的 `p.script || p.extractDone` **不完全同口径**——提取过主体但没存整本原文的老项目,
   流程条认它有剧本、计划步认它没有)。计划步要的是"该跑哪条命令"而不是"哪一步有阻塞项",
   两者形状不同,直接改读 `gateBlockers` 会连带动到计划步的 `key`/`label` 与授权位语义,不属本槽范围。
   要收它得先答"计划步的待办判定能不能从阻塞码派生"。
6. **旧码 `subject-no-image` 已全仓消失**,`contract` 那条断言钉着不许回潮;若有外部集成方按旧码筛,
   本仓查不到这样的消费点,需要兼容层的话要在消费侧做,不要在投影核里同时投两个码。
