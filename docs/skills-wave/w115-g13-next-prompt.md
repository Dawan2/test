# W115 · G-13 下一处内联人设:现取核实,合格余量为零(零代码槽)

> 分支:`cursor/w115-g13-next-prompt-c3a4`,基线 `origin/cursor/w112-integration-5d79` HEAD `9b7d13b`(任务直接指定,不合并 W113/W114)。
> 本槽的动作是**核实**而不是收编:按任务口径现取一遍余量,结论是 **0 处合格**,故一行代码未改(注册表、装配口、`tests/`、`README.md` 的对账数字全部一字未动)。
> 这份记账件本身是这次核实的取证件——下一槽要开同名槽之前,先看第 2/3 节的现取命令能不能复现出同样的空集。

## 1. 结果一句话

| 面 | 值 |
|---|---|
| 口径 | 在 `9b7d13b` 上 **live grep 仍内联** 且属于**发给模型的人设句**;排除 `js/prompts.js`、`js/experts-data.js` 预置库、placeholder、`js/api.js` 层内兜底、装配协议半 |
| 合格余量 | **0 处** |
| 代码改动 | **无**(注册表仍 41 条、人设键仍 40 条;`Skills.gaps()` 仍 20 键;`G-13` 六条关联索引逐字节不变) |
| 文档改动 | 本记账件 + `docs/skills-wave/README.md` 索引行与份数(129 → 130) |
| 三套件 | `unit 474/474`、`integration 130/130`、`cli.smoke 100/102`(2 项与 `master` 同名同表现) |

**不空改代码**是任务明写的纪律,也是这一槽唯一正确的落地形态:余量为零时新开一个键、或把某段装配半塞进注册表,都是把"没有余量"这件事伪装成一次收编。

## 2. 现取一:`你是` 字面全仓普查

```
git rev-parse HEAD                    # 9b7d13ba6619f1365891d125da0fdc8b001abbde
rg -n "['\"\`]你是" -g '*.js' | grep -v "^js/experts-data.js" | grep -v "^js/prompts.js" | grep -v "^tests/"
```

命中三行,逐条落位:

| 处 | 是什么 | 判定 |
|---|---|---|
| `js/gsettings.js:322` | 专家编辑表单 `persona` 输入框的 `placeholder="你是…创作原则:…"` | 排除(不发给模型) |
| `js/api.js:176` | `chatJSON` 在调用方不给 `system` 时垫的 `'你是专业助手。'` | 排除(层内兜底) |
| `js/api.js:199` | `chatJSONRobust` 同上 | 排除(层内兜底) |

四个 Node 端(`server.js` / `cli.js` / `mcp.js` / `billing.js`)**零命中**。

窄口径的 `你是` 只认"引号后紧跟",故再按宽口径扫一遍全文任意位置的 `你是`(不限引号紧邻),多出四行:

| 处 | 是什么 | 判定 |
|---|---|---|
| `js/skills.js:1090` / `:1109` | 记账 `note` 的散文,原文引用 API 层那句兜底 | 排除(不是提示词,是记账文字) |
| `js/experts.js:145` | `FORGE_CONTRACT` 里 `"persona":"系统人设提示词(你是…创作原则…,具体可执行)"` | 排除(装配协议半——它是锻造器返回 JSON 的字段说明,不是本步自己的人设) |
| `js/agent-global.js:62` | `orcaGlobalCtx` 块尾 `你是虎鲸,元Agent,掌握以上全局上下文,…` | 排除,理由见第 4 节 |

## 3. 现取二:不以「你是」起头的人设句有没有漏网

只扫一个字面会漏掉换个说法的人设,所以第二刀从**消费侧**切:把全仓每一个 LLM 请求的 `system` 半逐个摊开,看它的第一段(人设位)从哪里来。

### 3.1 请求装配口清点

```
rg -n "chatJSON\(|chatJSONRobust\(|API\.chat\(" -g '*.js' --glob '!tests/**'
rg -n "wfLLM\(" server.js
rg -n "role: 'system'" cli.js server.js mcp.js
```

浏览器侧 43 个 LLM 调用点(含两处按需查询续问复用同一份 `llmOpt` 的重试、与 `js/understanding.js:8` 那层薄委托)、服务端 `wfLLM` 11 个调用点、CLI 1 个(`cli.js:1124` 提示词修订重抽)——**人设位全部经 `Prompts.get` / `Prompts.fill`,或经 `js/wf-core.js` 里以 `Prompts.get` 起头的派生装配口**(`sbSystem` / `optimizeSystem` / `genPromptSystem` / `extractSystem` / `buildAgentSystem` / `buildReviewPrompt`)。逐键落位:

| 键 | 取值口 |
|---|---|
| `split.system` | `js/episode-util.js:262`、`server.js:3330` |
| `extract.system` | `js/episode-util.js:134`(经 `WfCore.extractSystem`)、`:220`、`server.js:3660` |
| `und.system` | `js/understanding.js:30`、`server.js:3368`、`:3421` |
| `sb.system` / `sb.reviewSystem` / `sb.reviewUser` | `js/sb-llm.js:29`、`:108`、`server.js:3441`、`:3452` |
| `review.system` / `review.userSystem` / `review.sumSystem` / `review.finalSystem` | `js/review.js:70`、`:84`、`js/wf-core.js:662`、`js/review.js:560`、`:482`、`server.js:3553`、`:3565`、`:3594`、`:3598` |
| `agent.system` | `server.js:3718`(经 `WfCore.buildAgentSystem`) |
| `agent.panelSystem` / `drawerSystem` / `routeSystem` / `previsSystem` / `selfFixSystem` / `compactSystem` | `js/agent.js:267`、`js/agent-global.js:558`、`:75`、`js/agent-ops.js:747`、`:128`、`:818` |
| `gen.promptSystem` / `gen.editSystem` | `js/sb-views.js:1055`、`js/review.js:372`、`cli.js:1124`、`js/sb-views.js:1109` |
| `persona.promptSystem` / `persona.editSystem` / `voice.recommendSystem` / `voice.recommendBatchSystem` | `js/persona.js:18`、`js/role-editor.js:34`、`js/persona.js:83`、`:110` |
| `narration.system` / `concept.system` / `light.system` / `graph.system` / `reading.system` | `js/episodes.js:467`、`:619`、`:989`、`:1075`、`:1180` |
| `sb.boardSceneSystem` / `sb.boardDraftSystem` / `beat.system` / `comic.bubbleSystem` | `js/sb-board.js:194`、`:233`、`js/beatboard.js:202`、`js/editors.js:286` |
| `digest.planSystem` | `js/episode-util.js:167`、`:177`、`:202` |
| `dirset.system` / `dist.copySystem` / `rip.system` / `plan.system` | `js/gsettings.js:34`、`js/proj-shell.js:136`、`js/proj-upload.js:425`、`js/plans.js:135` |
| `planner.chatSystem` / `trans.localizeSystem` | `js/proj-planner.js:67`、`:149` |
| `forge.system` / `forge.evolveSystem` | `js/experts.js:179`(getter,消费点 `js/gsettings.js:239`)、`js/experts.js:98` |

反查也做了两向:

- **没有孤儿键**——40 条人设键逐条在 `js/prompts.js` 之外找得到取值口(全键扫描,零 ORPHAN)。
- **没有不带 `system` 的 LLM 请求**——全仓每个 `chatJSON`/`chatJSONRobust`/`API.chat` 调用点都显式给了 `system`。

后一条顺带把 `js/api.js` 那两处兜底的性质钉实了:它是**层内兜底缺省,当前没有任何调用方依赖它**。排除它不只是"口径这么定的",而是它压根不是任何一条主线步骤真会发出去的人设。唯一一处真的不带 system 的请求是 `js/api.js:215` 的 JSON 修复重试,那一条发的是"把损坏 JSON 修好"的指令,没有人设位。

### 3.2 各步 user 半的首句

`buildReviewPrompt` 那种"人设句写在 user 半开头"的形态(W97 收的那一处)是这条线上唯一一次出现,收编后 `js/wf-core.js:662` 已是 `Prompts.get('review.userSystem', ov)`。其余各步的 user 半首句现取核对过,一律是指令句或数据段(`把本集剧本拆解到…` / `按四维标准评审以下整集分镜…` / `根据以下审片意见重写分镜提示词…` / `为以下各集分别写一句话集纲…`),没有第二处把人设藏在 user 半开头的。

## 4. 三处"看起来像、但不合格"的,逐处写明为什么不收

余量为零这个结论只有把边界上的几处交代清楚才立得住,否则下一槽会重新捡起同样几处再判一次。

### 4.1 `js/agent-global.js:62` 与 `:391`/`:356` 两句上下文框定语

块尾那句 `你是虎鲸,元Agent,掌握以上全局上下文,可回答进度类问题并调度板块专家。` 与板块锁定时的 `你当前作为「{板块}」板块的{agent}与用户协作,聚焦:{focus}。…` 形态上都像人设,但它们是**同一个三元的两支**,归装配面:

- 抽屉这一步的人设句已经是 `agent.drawerSystem`(`js/agent-global.js:558` 取值),这两句在它之后,收尾的是紧挨着的那段**按 `AGENT_BOARDS` 与项目实况现算**的上下文数据("以上这些数据是你的全局上下文")。
- 收其中一支不收另一支,等于让"未锁定板块"这条路可覆盖、"锁定板块"那条不可覆盖;两支一起收,就得连它们引用的现算数据一起定位,而那段数据的唯一来源是板块表与项目实况——那已经不是收编人设句,是把板块表搬进覆盖面。
- 这条口径在 W91 立下时就配了正查与反查用例(两句仍留在装配口 / 注册表里不得出现 `元Agent` 与 `你当前作为` 字面),见 [w91-intent-router-prompt.md](./w91-intent-router-prompt.md)。本槽把它们收进注册表,会同时推翻这两条用例——那是替 W91 改产品口径,不是这一槽的事。

### 4.2 `js/experts.js:145` 的 `FORGE_CONTRACT`

那句 `"persona":"系统人设提示词(你是…创作原则…,具体可执行)"` 是**锻造器要求模型返回的 JSON 里 `persona` 字段该长什么样**的字段说明,不是锻造器自己的人设(它自己的那句是 `forge.system`,`js/experts.js:179` 经 getter 现取)。整段 `FORGE_CONTRACT` 是解析判据,与 W88 定的口径一致:契约半不开放覆盖。

### 4.3 `js/gsettings.js:322` 的 placeholder

输入框占位文案,用户看得见、模型看不见。任务口径明写排除,census 名单里也是单独一类计数。

## 5. 三张持有者名单的现取读数

三张名单判据不同、历来不互相折算,本槽逐张按 live 重算,**三张都不用改**:

| 名单 | 立于 | 判据 | 现取读数 |
|---|---|---|---|
| A `inlinePersonaHolders()`(`tests/unit.js:3951`) | W78 | `system:` / `content:` / `=` 后紧跟 `你是`,扫 `js/*.js` + 四个 Node 端 | **空集(0 文件 0 处)** |
| B `census`(`tests/unit.js:6351`) | W79 | 全部 `['"\`]你是` 字面,含注册表 `def` 与预置专家库 | `js/api.js:2` `js/experts-data.js:16` `js/gsettings.js:1` `js/prompts.js:40` |
| C 局部 `inlinePersonaHolders`(`tests/unit.js:5403`) | W81 | `system:` 值位 / 具名人设常量 / 直接 `return`,排除 `js/prompts.js` | **空集** |

A 与 C 已经在期望值上写着空串,B 的四行全在排除类里。这三条断言正是本槽结论的常驻守卫:任何文件新长出一处内联人设,不必等下一次人工核实,单测当场红。

## 6. `G-13` 为什么还开着,而余量又确实为零

这两句话不矛盾,因为它们说的不是同一个集合。

- 本槽口径下的**合格余量**(可收编成独立键的人设句)= 0。
- `G-13` 的**摘标记判据**是"全仓再无内联人设",而 SK-10 / SK-11 两条记账的「仍欠」段现在点名的是 `js/api.js` 那两处兜底缺省(`tests/unit.js:6306`–`6310` 有断言钉住:那两处仍在源码里、且确实还没进注册表)。那两处按任务口径排除,故本槽收不了它,`G-13` 也就摘不掉。

所以本槽:

- `Skills.gaps()` 仍 **20 键**;
- `G-13` 六条关联索引逐字节不变(`script.hookType,script.aiToneBan,subjects.refDiscipline,eps.structureStage,gen.videoTpl,film.rhythmInject`);
- SK-03 / SK-10 / SK-11 的 `prompts` 与 `note` 一字未动。

要真把 `G-13` 关掉,下一步得先定一件产品口径上的事:**API 层那句兜底要不要进注册表**。它与前面二十余条收编不同形——它不属于任何一条主线步骤,是"调用方忘了给人设时垫一句"的库内缺省;收编它等于承认"缺省人设"也是用户可改的一件事。本槽只把这件未决事项如实登记,不替它做决定(现状是零调用方依赖它,见第 3.1 节,故它落在"改不改都不影响任何一次真实请求"的位置上)。

## 7. 实测与取证

### 7.1 三套件数字(基线与本槽 HEAD 相同——本槽零代码改动)

| 套件 | 基线 `9b7d13b` | 本槽 HEAD |
|---|---|---|
| `node tests/unit.js` | 474/474 | **474/474** |
| `node tests/integration.js` | 130/130 | **130/130** |
| `node tests/cli.smoke.js` | 100/102 | **100/102** |

一条用例都没加、也一条没删:代码没动,新立断言就没有对应的落点;而三张名单的空集断言已经在守着这个结论(第 5 节),再加一条只会是同一件事的第二份写法。

### 7.2 `cli.smoke` 那 2 项:与 `master` 同名同表现

`master @ 9adcf0f` 独立 worktree 现跑 `51/53`,失败两条:

```
FAIL | 未登录 whoami → exit 3 | exit=1
FAIL | llm --json mock 链路 | undefined
```

本槽 HEAD `100/102`,失败两条**同名同表现**(总数不同是主干这些槽里 cli.smoke 用例本来就多)。本槽没引入新的 CLI 失败。

### 7.3 `node --check`

本槽未改任何 `.js`;为确认工作区干净,对 `js/prompts.js` / `js/wf-core.js` / `js/agent-global.js` / `js/api.js` / `js/experts.js` / `server.js` / `cli.js` / `tests/unit.js` 逐个 `node --check` 通过。

### 7.4 文档数字

`docs/skills-wave/README.md` 的「索引表共 N 份记账件」由 129 抬到 **130**(本记账件 + 索引行)。`README.md` 与 `docs/skills-wave/README.md` 里其余对账数字(注册表 41 条、单测 474 项、CHECKS 十七条…)本槽一个都不动——注册表条数与用例数都没变。

## 8. 残留

- **`G-13` 仍开着**,唯一还点得出名的余量是 `js/api.js` 那两处层内兜底;要不要收它是一件产品口径决定,见第 6 节末段。
- **两句上下文框定语仍在装配口**(`js/agent-global.js:62` 与 `:391`/`:356`),按 W91 口径不开放覆盖;要翻这条口径就得连它们引用的现算板块数据一起定位,不是收编槽能单独决定的。
- **三张持有者名单口径仍未统一**,这条从 W85/W90 一路记到 W97 都没做。本槽给它添了一条新证据:三张名单第一次在同一次核实上给出**同一个方向的结论**(A 与 C 空集、B 只剩排除类),即余量归零之后三张名单的分歧确实消失了——分歧本来就只出现在"某一处算不算内联"的边界上。
- **W113/W114 未合并**,也无从合并:核实时远端 `cursor/*` 分支里 w11x 段只有 `w110-split-only-script-a91c` 与 `w112-integration-5d79` 两条,不存在 w113/w114。
- **本槽是零代码槽**,与 W3 的 G-02 复核件同形:它交付的是一次可复现的核实,不是一处落地。判断这一槽做得对不对,看的是第 2/3 节那几条命令在同一基线上能不能复现出同样的空集。
