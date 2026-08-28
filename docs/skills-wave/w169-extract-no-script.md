# W169 · 提取主体也认「有没有可读的原文」:`Domain.extractSourceText` 单源 + 计划步分两态

**范围**:`js/domain.js`(新增 `projectScript` 与 `extractSourceText` 两个派生,既有函数一字未动)+
`js/commands.js` / `cli.js` / `server.js`(提取主体三端命令入口的输入表达式各换成读派生,一行一处)+
`js/plans.js`(提取那一步按可读原文分两态)+ `tests/unit.js`(commands 1、plans 1、contract 1 共 +3)+
`tests/integration.js`(+2)+ `README.md` 与本目录 `README.md` 同步。
**基线**:`cursor/w161-integration-4e7d`(`c5de21e`,开工现取核实相符,自测 528/528)。
**不做**:不改 `Domain.gateBlockers` 的判据与产出形状(一个字未动)、不改 `Issues` 的门槛投影表、
**不整包重做拆集那半**(`project.splitEpisodes` 的命令层与计划层在本槽一行未改,那是 W167 的面)、
不让任何一道发布门去看 `p.script`(G1–G10 一字未改)、不抬 G1、不从 `Skills.gaps()` 摘任何键、
不新增计费动作/命令/端点、不拿摘要或提取结论冒充原文、不合并其它并行槽。

## 1. 病灶:W147 那句「自带回退故能真跑」只在有分集时成立

W147 把计划层项目级三步的门槛判定收口到 `Domain.gateBlockers`,顺带救回了
「提取过主体但没存整本原文的老项目整份计划推不出来」。它的 3. 节如实登记了这类项目往下走会遇到什么:

> `project.extractSubjects` 命令自带回退——取不到 `p.script` 就拼各集正文,故这类项目里它**能真跑**
> (无分集时才拒绝)。

括号里那半就是本槽的病灶。**门槛派生答的是「剧本这一步走过没有」**(`p.script || p.extractDone`,
提取过主体的老项目上剧本步画 ✓),**提取要的是「有没有可读的原文」**——基线 `c5de21e` 的入口条件:

```js
const text = String(p.script || '').trim() || (p.episodes || []).map(e => e.content || '').filter(Boolean).join('\n').trim();
if (!text) return blocked('no-script', '项目暂无剧本内容,请先上传剧本');
```

两问在 `extractDone && !p.script && 无分集` 这一态上结论相反:门槛派生说这一步该做了,
而命令一进去就 `blocked / no-script`。计划层据前一问推步,推出来的正是一条注定跑不动的命令步。

基线现跑(Node `vm` 加载真实源码,`Plans.fromWorkflow` 的步骤串,`[cmd]` = 命令步、`[goto]` = 导航步):

| 夹具 | 基线 `c5de21e` | 本槽 |
|---|---|---|
| 空项目 | (无计划) | 同 |
| 只有剧本 | `[cmd]`提取主体 / `[cmd]`剧本拆集 | 同 |
| **老项目(`extractDone`,无原文,无分集)** | **`[cmd]`提取主体** / `[cmd]`剧本拆集 | **`[goto]`补上剧本原文** / `[cmd]`剧本拆集 |
| 老项目 + 各集正文在 | `[cmd]`提取主体 / `[cmd]`智能分镜:第1集 | 同(一字不变) |
| 老项目 + 主体齐备(只差分集) | `[cmd]`剧本拆集 | 同 |
| 剧本 + 全图主体 + 有分集 | `[cmd]`智能分镜:第1集 | 同 |

只有第三行那一格变,且变的是"把注定失败的按钮换成真能办到的动作"。第四行那一格是本槽有意**不动**的:
各集正文在场时提取确实读得到东西,W147 那句话的另一半成立,不许连坐藏掉。

服务端那一端同病:`/api/wf/extract-subjects` 与 CLI `exec project.extractSubjects` 各抄了一份同样的表达式
(三端三份字面),`extractDone` 老项目打过去同样是 400——**端点这一侧本来就是诚实的**,
本槽对它做的只是收口取数,不改任何一个回执。

## 2. 落法:先分清两问,再把第二问收成一处

`js/domain.js` 加两个派生(既有函数一个字没动,`'no-script'` 字面仍恰两处):

```js
D.projectScript    = p => String((p && p.script) || '').trim();
D.extractSourceText = p => D.projectScript(p)
  || ((p && p.episodes) || []).map(e => (e && e.content) || '').filter(Boolean).join('\n').trim();
```

- `projectScript` 与 W167(`cursor/w167-extractdone-split-3bb2`,`a1b3cad`)那份**逐字节相同**(含注释),
  开工时按任务口径 fetch 对照后原样取用——两槽都要"整本原文读不读得到"这一问,写成同一份合并时才不打架;
  本槽自己只消费它一处(`extractSourceText` 的第一段),**拆集那半一行不碰**。
- `extractSourceText` 是本槽新立的那一问:**提取读入的是什么**。整本优先,没有整本退回各集正文拼接
  ——各集正文是逐字剧本,与整本同类;主体库、`scriptMeta.synopsis` 这类**提取结论一概不算**
  (它们是产物,提不出逐字证据),契约用例按这三样各点一次名。

四个消费方改成同读这一份:

| 消费方 | 基线 | 本槽 |
|---|---|---|
| `js/commands.js` `project.extractSubjects` | 内联表达式 | `Domain.extractSourceText(p)` |
| `cli.js` `EXEC['project.extractSubjects']` | 内联表达式(同字面) | 同上 |
| `server.js` `/api/wf/extract-subjects` | 内联表达式(同字面) | 同上 |
| `js/plans.js` `TODO_OF['project.extractSubjects']` | 不判(只看门槛码) | 按同一份派生分两态 |

计划层那一处:

```js
'project.extractSubjects': ({ p, gates }) => {
  if (gates['no-script'] || !gates['no-subjects']) return null;
  return Domain.extractSourceText(p)
    ? { key: 'extract', label: '提取主体:剧本已在库,主体库还空着' }
    : { key: 'extract', label: '补上剧本原文:提取主体要读原文,项目里只留了提取记录', goto: '#/project/' + p.id };
},
```

三件事有意保持不变:**前置守卫仍按门槛码**(`no-script` 在场时这一步一律不出,`GATE_SKIP` 的理由句照旧成立)、
**`key` 仍是 `extract`**(已落库的 `p.agentPlan` 老计划不受影响)、
**按码取材仍恰 5 处**(W147 那条"提取步与拆集步各判两码"的契约计数一字未动)。

W147 交接第 2 条写过一句「正解是补回填,不是在计划层提前避开这一步」。本槽不是"避开":
**步照出、位置照旧、`key` 不变**,只把动作从一条注定 `blocked` 的命令换成真能办到的导航——
避开是那一步凭空消失(变异 M8 正是这一手,当场红 2 条)。至于"从各集正文回填整本原文"那条正解,
仍是没做的事,留在交接里。

## 3. 加测(unit +3、integration +2)

| # | 套件 · 用例 | 钉住什么 |
|---|---|---|
| 1 | `commands · extractSubjects:提取输入现取 Domain.extractSourceText(extractDone 老项目无原文无分集仍 blocked no-script)` | 先断言前提(门槛派生认这类项目剧本步已过)→ 真跑命令得 `blocked/no-script` 且提取核心零调用;项目对象一字不改、只把派生打桩成"读得到"→ 同一次调用真跑;桩撤掉后仍读不到(证明用例没偷偷写 `p.script`);末尾补回各集正文 → 照旧真跑(回退那半没被收掉) |
| 2 | `plans · fromWorkflow:提取主体步按可读原文分两态(整本/各集正文都没有时出补原文导航步,不推注定 blocked 的命令步)` | 三态各看一次(整本在 → 命令步;两者皆无 → 导航步且 `key` 仍是 `extract`、`cmd` 为 `undefined`、`goto` 指项目页、文案点名"剧本原文";只有各集正文 → 仍是命令步)+ 派生打桩验分流判据取的是派生不是 `p.script` |
| 3 | `contract · 提取主体的输入文本单源:Domain.extractSourceText 一处,三端命令入口与计划层同读` | 派生本身四条(整本去空白、各集正文拼接且空集不占行、提取结论一概不算、与 `gateBlockers` 两问结论相反是有意的)+ 源级逐处点名:三端各自的入口段内 `p.script` 零命中且都出现 `Domain.extractSourceText(p)`,计划层同读 |
| 4 | `integration · 无原文老项目种子 PUT 成功` | 夹具就位(`extractDone: true`、无 `script`、无分集) |
| 5 | `integration · wf/extract-subjects 老项目无原文无分集 400 且零计费(extractDone 是进度位,不是可提取的原文)` | 端点如实 400,且前后钱包余额逐分相等(守卫在 `wfLLM` 之前,零调用零计费) |

用例 1、2 的桩是本槽主判据:**内联表达式拿不到桩**——它读项目对象,桩换的是派生。用例 3 是源级兜底。
既有 plans 用例改了一处:W147 那条同口径用例的期望串由 `project.extractSubjects,project.splitEpisodes`
改成 `goto:extract,project.splitEpisodes`(它断言的"计划推得出来"一字未改,变的是那一步现在挂什么动作)。

## 4. 变异复核(九组,各红各的)

计数已扣掉一条与本槽判据无关的常驻红(记账件份数——本文落地前目录里就少这一份)。

| # | 变异 | 结果 |
|---|---|---|
| M1 | 计划层整体退回基线(`({ gates }) => … ? 命令步 : null`) | 红 **3**:plans 新用例(报"注定 blocked/no-script 的命令不该挂上去")、W147 那条同口径用例、contract 的"计划层应按同一份派生分流" |
| M2 | 计划层分流判据改内联 `String(p.script || '').trim()` | 红 **3**:plans 新用例红在 ③(各集正文在场却出了导航步)、contract 本槽那条、**W147 立的"`js/plans.js` 里 `p.script` 零命中"那条也红**——两层判据各报各的 |
| M3 | `js/commands.js` 退回内联表达式 | 红 **2**:commands 新用例(桩换了派生而命令读的还是项目对象)、contract 源级那条点名 `js/commands.js` |
| M4 | `cli.js` 退回内联表达式 | 红 **1**:contract 源级那条点名 `cli.js`(headless 那端无单测夹具,源级是它唯一的守卫) |
| M5 | `server.js` 退回内联表达式 | 红 **1**:contract 源级那条点名 `server.js` |
| M6 | `extractSourceText` 去掉各集正文回退(只回 `projectScript`) | 红 **3**:commands 用例末尾那半、plans 用例 ③、contract 的拼接那句——**"收口"与"顺手把回退收掉"是两件事,三条各拦一个面** |
| M7 | `extractSourceText` 加 `|| p.scriptMeta.synopsis`(拿卖点梗概冒充原文) | 红 **1**:contract 的"提取结论都不是原文" |
| M8 | 计划层缺原文时 `return null`(把这一步藏掉,而不是换动作) | 红 **2**:plans 新用例(报"这一步照出不藏")、W147 那条同口径用例(整份计划少一步) |
| M9 | 服务端把 `extractDone` 这个进度位当原文放行(`\|\| (p.extractDone ? '(已提取过)' : '')`) | 红 **1**:integration 那条——回执 `HTTP 200`,MOCK_LLM 拿这五个字**凭空编出一整套主体候选**,这正是"进度位冒充原文"的产物 |

另反向抽查三样本槽全程绿:W147 的"按码取材恰 5 处"与"`js/plans.js` 不自己判剧本/主体/分集"、
W138 的"`js/domain.js` 里 `no-script` 恰两处"(新加的两个派生与注释都不含这个码字面)、
`Plans.projection()` 的投影自省表(登记项与占不占计划步一字未动)。

## 5. 数字

| 项 | 基线 `c5de21e` | 本槽 |
|---|---|---|
| `node tests/unit.js` | 528/528,0 FAIL | **531/531**,0 FAIL |
| └ `commands` 子套件 | 25 | **26** |
| └ `plans` 子套件 | 11 | **12** |
| └ `contract` 子套件 | 116 | **117** |
| `node tests/integration.js` | 141/141,0 FAIL | **143/143**,0 FAIL |
| `node tests/cli.smoke.js` | 107 项(2 项与 `master` 同名同表现) | 未改动该文件,条数复核为 107 |
| `node tests/e2e.js` | 未跑(按目录纪律仅在明确要求时跑) | 未跑 |

`node --check` 过:`js/domain.js`、`js/plans.js`、`js/commands.js`、`cli.js`、`server.js`、
`tests/unit.js`、`tests/integration.js`。

棘轮按 **live** 抬(不抄旧数):单元 `FLOOR` 528 → **531**、集成 `FLOOR` 141 → **143**、
记账件 `FLOOR` 174 → **175**(CLI 冒烟 107 未动);
`README.md` 的「单元测试(N 项断言」528 → 531、契约段自报条数 116 → 117、集成段 141 → 143;
本目录 `README.md` 明写份数 174 → **175**(含本份)并补索引行。
四格下限与 live 的差额落地后全为 0。

## 6. 边界

- **不动拆集那半**:`project.splitEpisodes` 的命令层入口与计划层取材器本槽一行未改(仍是基线形态)。
  W167 那条分支收的正是它,两槽的 `Domain.projectScript` 逐字节相同故那一处能自动合上;
  会撞的是三处:`js/plans.js` 两个取材器的相邻块、W147 那条同口径用例的期望串
  (两槽各改自己那一格,合并后应是 `goto:extract,goto:split`)、README/记账件那几个数字。
- **不抬 G1**:发布门七项核心门与 `fail/warn` 计数一字未改,`js/release.js` / `js/release-core.js` 未进 diff。
- **不摘 gaps**:`Skills.gaps()` 仍原样,短名单 `note` 一字未动——本槽收的是既有消费面之间的口径一致。
- **不改回执与计费**:三端命令入口的错误码 `no-script`、文案、HTTP 状态、计费动作 `llm.extract`
  与守卫位置(仍在扣费之前)全部逐字不变;端点行为只在"取数从哪来"这一点上变。
- **不改计划步语义**:`key`/授权位纪律(args 一律留空)/12 步上限/导航步不挂命令,全部原样。
- **不发明能力概念**:无新 skill 条目、无新 `SK-xx`、无新命令与端点。

## 7. 交接

1. **"从各集正文回填整本原文"仍没做**(W147 交接第 2 条点的那条正解)。本槽与 W167 都只做到
   "如实出导航步";真要闭环,得有一条把已有分集正文拼回 `p.script` 的动作(它是纯本地拼接、零 LLM 零计费),
   落在哪一层(命令层新命令 / 项目页按钮 / 上传弹窗)没有定论,别顺手写成计划层的隐式副作用。
2. **`Domain` 现在有两个相邻的原文派生,别混用**:`projectScript` 答"整本在不在"(拆集切的就是它),
   `extractSourceText` 答"提取读得到什么"(整本 + 各集正文回退)。哪天再有第三个消费方,
   先问它要的是哪一问——W147/W167/W169 三槽的病根都是"拿另一问的答案当自己的前置"。
3. **`no-script` 这个码现在有三层含义在场**:分集级(`episodeState` 判 `ep.content`)、
   项目级门槛(`gateBlockers` 判 `p.script || p.extractDone`)、提取/拆集命令的入口拒绝(判可读原文)。
   三者同码不同判定输入,契约用例只钉住了前两级"各只一处登记";命令层那一层的码是就地写的字面,
   要收得先决定它到底是不是同一个概念。
4. **计划层的导航步现在有两种来路**:需授权/需人工挑选(重拆覆盖、过期镜子集、确认闸)与
   "命令跑不动、该做的是补输入"(补分集剧本、补整本原文)。两类都不挂命令,但含义不同——
   哪天要给导航步加分类标记,别把它们并成一类。
5. **`cli.js` / `server.js` 那两处只有源级判据**:headless 两端没有单测夹具能桩掉派生,
   contract 那条按入口段切片做字面检查。段界取的是 `EXEC['`/`pathname === '/api/wf/` 这类标记,
   改动那两处的写法时留神别把切片切空(切不到会先红在长度断言上,不会静默放行)。
