# W219 停工位判定:LLM 规划仍会把 `expert.evolve` 排进计划步——成立,补上生成侧那道闸

> 基线 `cursor/w215-integration-b875@66ef0c6`;本槽分支 `cursor/w219-plans-no-evolve-step-4a1c`,tip 是本文这一提交。
> 不合 `master`、不开 PR、不并任何在飞槽(W216 镜头闸 / W217 主体 gone / W218 合入员一行没碰,
> `emptyBatchNote` / `emptySubjectImageNote` / `js/domain.js` 的点名闸一个字节没动)。

## 1. 结果一句话

停工位**成立**:`js/plans.js` 的 `generate` 在基线上照旧把 `expert.evolve` 写进 `steps`,
一次能写进去两步(模型点几次就进几步),提示词的可用领域命令白名单里还主动点名它。
执行口那道闸(W201)确实拦得住——`runAll` 一步不下发——但拦下来的形态是**计划里已经排了一步蒸馏、
点下去才知道要人工**:用户看到的是「排了却跑不成」;而 LLM 那条路只从回包取 `label`/`cmd`/`ep`、
不取 `args`,排出来的还是**无参**的一步,连到手动入口去做的时候都不知道该进化哪个专家。

产品修正只在生成侧:`generate` 不再把人手命令写进 `steps`,提示词白名单也不点名它;
挡下**不等于静默吞**——挡了哪条当场点名回报并指回它自己的手动入口。
执行口那道闸一个字没改(它是总闸:计划步的来路不止 `generate` 一条)。
没有做自动蒸馏,没有清 `gaps()`,没有第二个 `manual` 字段,`Skills.validate` 与 `execStep` 的既有闸零改动。

产品面**一个文件**:`js/plans.js` **+32 −16**(其中 16 删里有 9 行是把 `manualCmd` 整块上移到两道闸共用的位置)。

| 项 | 基线 `66ef0c6` | 本槽 |
|---|---|---|
| `unit` | 633/633 | **633/633**(条数不变:`plans` 套件那条旧用例是**改断言**不是新增,17 → 17) |
| `contract` 子套件 | 138/138 | 138/138(未动) |
| `integration` | 147/147 | 147/147(未动) |
| `cli.smoke` | 107/109 | 107/109(**同名同表现的两条**,见 §6.1) |
| 记账件 | 228 份 | **229 份**(含本文;`FLOOR` 228 → 229、目录 README 明写份数同抬) |
| 领域命令 | 13 | **13**(`expert.evolve` 仍在册,一条没增没删) |
| `manual: true` 全仓处数 | 1 | **1**(仍只挂在 `expert.evolve` 上;`manualOnly`/`humanOnly` 产品面 0 处) |
| `js/plans.js` 里 `expert.evolve` 字面 | 0 | **0**(人手与否只从共享元数据现取) |
| `gaps()` 键 | 20 | 20(`SK-04` / `G-11` / `G-13` 逐字节未动) |
| `GUARD_TOPICS` / `TOPIC_FLOOR` / 花名册 | 19 / 19 / 19 行 | 19 / 19 / 19 行(**未动**) |

`js/skills.js` / `js/prompts.js` / `js/knowledge.js` / `js/cmd-registry.js` / `js/domain.js` / `js/commands.js`
以及 `server.js` / `cli.js` / `mcp.js` / `billing.js` / `css` / `index.html` 相对基线**零 diff**
(`git diff --stat 66ef0c6 HEAD` 只出 `js/plans.js`、`tests/unit.js`、`README.md`、本文与目录索引)。

## 2. 基线 live 举证(`66ef0c6`,不是读源码猜)

取证方式与 `tests/unit.js` 的 `plans` 套件同形:`vm` 沙箱加载**真实**的
`cmd-registry` / `domain` / `prompts` / `knowledge` / `skills` / `plans` 六个文件,
`Commands.list()` 用注册表实际词表(生产里它由 `js/commands.js` 的 `REG` 出,与注册表逐条对齐),
`Understanding.chatJSONRobust` 打成一个会回蒸馏步的桩——**这正是真实模型输出得出来的东西**:
提示词自己把 `expert.evolve` 列在「可用领域命令」里,用户目标又写着"顺便把经验沉淀进人设"。

| # | 问的是什么 | 基线实况(live) | 判定 |
|---|---|---|---|
| E0 | `generate` 的允许名单排除 evolve 了吗 | `Commands.list()` **13** 条,`expert.evolve` **在内**,`manual` 位为 `true` | 没排除 |
| E1 | 产出的 `steps` 里有没有 `cmd === 'expert.evolve'` | **有 2 步**:`[智能分镜/episode.generateStoryboard, 沉淀导演经验/expert.evolve, 带参蒸馏/expert.evolve]` | **会 emit** |
| E2 | 提示词的可用命令串点名它吗 | **点名**(白名单 13 条含 `expert.evolve`) | 是 |
| E3 | 这份计划交给 `runAll` | 命令层只收到 `episode.generateStoryboard`;第二步 `blocked`、尾注「「专家自进化」是人手动作,计划不代跑:请到它自己的手动入口执行」;第三步 `pending` | 执行口拦住了 |

E3 就是**为什么这一格不是"已经解决了"**:执行口那道闸只把这一步定格在 `blocked`,
它已经**在计划里占了一格**——按主线重建之前一直挂着,`runAll` 每次跑到这儿都得停一次。
任务给的两条"停工"条件(现跑从来不 emit / 命令层跑不出)**一条都不满足**:E1 emit 了两步,
E3 里命令层确实跑不出,但那是**执行口**替它兜的,不是 `generate` 不排。

### 2.1 谁调用 `generate`

现取(`Plans.generate` 的调用点全仓普查):

| 调用点 | 什么东西 | 本槽是否波及 |
|---|---|---|
| `js/plans.js` 的计划弹窗「🪄 让助手规划(1积分)」 | 项目页「📋 计划」按钮 → 弹窗空态 | 是(生成侧就是它) |
| `js/workbench.js` 的制作台计划区「🪄 让助手规划(1积分)」 | 同一个函数,另一处界面 | 是,且**零 diff**——它只调 `Plans.generate`,闸在被调方 |
| CLI / MCP / 服务端 | **一个都没有** | 不波及 |

第三行是机检出来的,不是"看着像":`p.agentPlan` 这个字段全仓只有 `js/plans.js` 读写
(`contract` 套件已有一条判据钉着),`cli.js` / `mcp.js` / `server.js` 三端连"计划"这个概念都没有,
故 headless 那半今天排不出任何计划步,本槽的射程就是浏览器这两个按钮。

## 3. 改了哪一句

### 3.1 `js/plans.js`:判据上移一处共用,生成侧加一道闸

`manualCmd`(现取共享元数据的 `manual` 位,计划层不写死命令名)原本贴在 `execStep` 上方,
现整块移到 `generate` 之前,连同一段说明两道闸各挡一段的注释——**判据仍是同一个函数一处**,
不是给生成侧另写一份。`execStep` 那道闸的可执行行**一行未改**(尾注那句字面也原样)。

生成侧三处落点:

- 可用领域命令白名单改成「注册表里非人手动作的那些」:`const auto = Commands.list().filter(c => !manualCmd(c.name))`,
  提示词的 `可用领域命令:` 那段与 `known` 钳制集**同取这一份**。宣称计划能跑一件它不会替用户按下的事,
  换来的只是一步注定退回人工的步。
- 模型仍点名它时钳制不收:`const man = manualCmd(s0 && s0.cmd); if (man) { held.push(man.label); return null; }`。
- 挡下的如实报出来:`U.toast('📋 「专家自进化」是人手动作,未排进计划:请到它自己的手动入口执行')`,
  同一次拆步里挡下多条就按中文名逐条点名(去重)。

### 3.2 有意**没有**做的三件事,以及为什么

| 没做 | 为什么 |
|---|---|
| 把这一步留成"手动勾选"步(无 `cmd` 无 `goto`) | 试过,当场被自己的现跑否掉:`execStep` 的勾选分支是 `st.status = 'done'; st.note = ''`,`runAll` 一路过去就把它翻成 `done` 并**清空尾注**——等于替用户宣称蒸馏做过了。比"排了跑不成"更坏 |
| 留成导航步(`goto`) | 蒸馏的入口在专家库,不在项目页;而 `goto` 步一到位就置 `done`,同样是替用户宣称做过了。要指对地方就得在计划层写死一个路由,那正是"人手与否只从元数据现取"要避开的分叉 |
| 从 `cmds` / 注册表里删掉 `expert.evolve` | 那是砍功能不是拦自动发令。四端人手入口一个不减,`Skills.list()` 的 `cmds` 上照旧登记着它 |

「挡下要回报」这一口径不是本槽新发明的:W203 给助手自动发令那条路定的就是同一形——
`agentNormalize` 不把人手命令放进 `ops`,而把被拦的命令名回在 `manual` 键上**不静默吞**。

## 4. 判据(`tests/unit.js` · `plans` 套件)

旧那条 `generate:人手命令仍在命令名单里(不从 cmds 里删),拆得出这一步而执行口一律拦下`
钉的正是本槽要改掉的行为(它断言 `steps` 落成 `episode.generateStoryboard,expert.evolve`),
故**改断言不新增用例**,套件条数 17 → 17、`unit` 总数 633 → 633。新那条钉六件事:

1. 提示词的白名单半不点名人手命令(取的是 `可用领域命令:` 到括注前那一段——括注里的中文对照是固定字面,不是现取的命令表);
2. 别的注册命令照旧在白名单里(拦的是人手动作,不是把白名单清空);
3. 模型仍点名它时 `steps` 里 0 条,且**既不排成命令步,也不留成导航步或勾选步**(整步不进计划);
4. 挡下的当场点名回报并指回手动入口(不静默吞);
5. 同一份计划交给 `runAll`,执行口照旧零下发(总闸没被本槽顶掉);
6. 判据是 `manual` 那一位、不是命令名:摘掉它同一条命令立刻排进计划**且回到白名单**;
   反向换 `episode.compose` 标上 `manual`,它同样不进 `steps`、白名单同样不点名、回报点名的是「合成成片」。

**夹具在基线上是红的**:把 `66ef0c6` 的 `js/plans.js` 换回来跑 `node tests/unit.js plans` → `16/17 PASS, 1 FAIL`,
报的是第 1 条(白名单点名了 `expert.evolve`)。

## 5. 变异手(每手改一处产品源,跑全套 `unit`)

| # | 变异 | 结果 | 红在哪 |
|---|---|---|---|
| M1 | 摘掉 `js/cmd-registry.js` 的 `manual: true` | **红 10** | `agent-ops` 6 + `plans` 2(execStep 那条与本槽这条各自的前提句)+ `contract` 2(扫描口变空扫) |
| M2 | `generate` 去掉人手命令那句早返回(照旧进判定链) | **红 1** | 本槽这条第 3 件:那一步落成 `goto` 导航步(`episode.generateStoryboard,goto`),既指错地方又会被 `runAll` 置 `done` |
| M3 | 提示词白名单退回全表(只在钳制侧挡) | **红 1** | 第 1 件:白名单照旧点名 `expert.evolve`——模型被反复引导去点一件计划不会做的事 |
| M4 | 挡下但不回报(去掉那句 toast) | **红 1** | 第 4 件:挡了什么一个字不说,用户不知道这件事还得自己去做 |
| M5 | 判据换成命令名硬编码 `cmd === 'expert.evolve'` | **红 2** | `plans` 两条的双向那半:摘掉 `manual` 位它该照旧排进来/照旧下发,硬编码使两向都不成立(源级那条「`js/plans.js` 零 `expert.evolve` 字面」同样拦得住,只是行为面先红) |

五手各红各的,没有一手是靠同一句话接住的。M2 与 M3 分开成立,证明**两个落点都不是装饰**:
只挡钳制、白名单照旧点名 → 提示词一直在诱导模型排它;只挡白名单、钳制照旧收 → 模型点名一次就漏一次。

## 6. 棘轮与对账(全部 live-measure,零抄旧数)

| 数 | 取法 | 本槽 live |
|---|---|---|
| `unit` | `node tests/unit.js` | **633/633 PASS** |
| `plans` 子套件 | `node tests/unit.js plans` | **17/17 PASS** |
| `contract` 子套件 | `node tests/unit.js contract` | **138/138 PASS** |
| `integration` | `node tests/integration.js` | **147/147 PASS** |
| `cli.smoke` | `node tests/cli.smoke.js` | **107/109**(见 §6.1 口径) |
| 记账件份数 | `ls docs/skills-wave \| grep -cE '^w[0-9]+-.+\.md$'` | **229**(含本文) |
| 领域命令数 | `require('./js/cmd-registry.js').META.length` | **13** |
| `gaps()` 键数 | `Object.keys(require('./js/skills.js').gaps()).length` | **20** |

三套件的 `FLOOR`(单元 633 / 集成 147 / 冒烟 109)与 README 明写的三个数**都已等于 live**,故一个字面都不必动;
记账件那格从 **228** 抬到 **229**(`tests/unit.js` 的 `const FLOOR` 与目录 README 的「索引表共 N 份」同抬),
护栏主题那格 19 / 19 / 19 未动。

### 6.1 `cli.smoke` 的两条失败

`107/109`,失败的两条与 `master` **同名同表现**,任务口径内允许:

- `未登录 whoami → exit 3`(实测 `exit=1`)
- `llm --json mock 链路`

两条都与本槽射程无关(本槽没碰 `cli.js`、没碰任何端点、没碰登录链路),
且 `js/plans.js` 的改动 headless 三端根本读不到——它们连计划这个概念都没有。

## 7. 残留(如实登记,不在本槽射程内)

1. **提示词里那段中文对照是固定字面**:`episode.generateStoryboard=智能分镜/…` 六条写死在调用点,
   不随 `manual` 位变。今天不构成问题(六条里一条都不是人手动作),但哪天给它们中的一条标上 `manual`,
   白名单会不点名它、括注却还解释着它。本槽把它如实写在判据的注释里(白名单半的取法特意避开括注),没有顺手改。
2. **`fromWorkflow` 那条路本来就排不出人手命令**:它的命令名现取主线全链 playbook 投影,
   而人手命令不许进任何 playbook 的 `steps`(W202 的 `Skills.validate` 递归扫着),
   `contract` 套件另有一条正面钉住"投影推不出人手命令"。故本槽只动了 `generate` 这一条路。
3. **`G-11` 仍是「蒸馏仍是人手动作」**:本槽把计划层这条自动路封得更早了一格,但没有、也不该
   把蒸馏变成自动动作——`gaps()` 那一键逐字节未动。
