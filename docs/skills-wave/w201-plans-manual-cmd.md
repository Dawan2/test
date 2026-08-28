# W201 停工位判定:制作计划的自动执行路径能跑 `expert.evolve`——成立,拦在执行口

> 基线 `cursor/w196-integration-708c@cdf537e`;本槽分支 `cursor/w201-plans-evolve-manual-9e4f`,tip 是本文这一提交。
> 不合 `master`、不并任何在飞槽(W197 / W198 / W199 / W200 一行没碰)。

## 1. 结果一句话

W198 射程外那个停工位——「`js/plans.js` 的 `generate` 按用户目标 LLM 拆步只受命令注册表钳制,
拆得出 `expert.evolve`,而 `Plans.runAll` 会执行它」——按 W196 基线 live 举证**成立**,
任务给的两条否决条件**一条都不满足**:

- `generate` 的允许命令名单**没有**排除 evolve:名单现取 `Commands.list()`,基线上恰好 **13** 条、`expert.evolve` 在内;
- `runAll` 对 evolve **不要求任何确认**:`execStep` 直接 `Commands.execute(..., ui: true)`,
  整条路径上 `U.confirm` 被调用 **0** 次。

蒸馏是**把条款写死进 `persona` 且没有撤回口**的动作,四端注册表里唯一一条 `needs` 为空的项目外命令,
从 W143 起就在源码注释、`js/skills.js` 的 SK-26、`mcp.js` 工具描述、主 `README.md` 四处写着「人手动作」——
可这句话此前只落在**文字**上:判据只钉住它不进 playbook 的 `steps`,而计划步压根不是 playbook `steps`。

改法是把「人手动作」从文字落成元数据:`js/cmd-registry.js` 给 `expert.evolve` 加一位 `manual: true`,
`js/plans.js` 在 `execStep` 这**一个漏斗**上拒绝下发这类命令——落 `blocked`(待人工)+ 尾注与 toast 指回手动入口,
`runAll` 到这一步照旧暂停、后面的步原样留着。**命令一条没删**,四端人手入口(专家库「🧠 进化」按钮 /
CLI `exec expert.evolve` / MCP `hujing_expert_evolve` / 服务端 `/api/wf/evolve-expert`)一个不减。

产品面两个文件:`js/plans.js` **+35 −16**、`js/cmd-registry.js` **+6 −3**(缩进整块右移占了删改数的大头)。

| 项 | 基线 | 本槽 |
|---|---|---|
| `unit` | 598/598 | **600/600**(+2,都在 `plans` 套件:14 → **16**) |
| `contract` 子套件 | 131/131 | 131/131(未动) |
| `integration` | 143/143 | 143/143(未动) |
| `cli.smoke` | 106/108 | 106/108(**同名同表现的两条**,见 §5.2) |
| 记账件 | 209 份 | **210 份**(含本文) |
| 领域命令 | 13 | **13**(只给其中一条加了字段,一条没增没删) |
| `GUARD_TOPICS` / `TOPIC_FLOOR` / 花名册 | 19 / 19 / 19 行 | 19 / 19 / 19 行(**未动**,任务明令) |
| `gaps()` 键 | 20 | 20(`G-11` 关联索引与正文逐字节不变) |

治理面:提示词注册表 **41**、能力短名单 **30**、`preflightStages()` **七面**、专家 **16** —— 一个没动。
`js/skills.js` / `js/prompts.js` / `js/knowledge.js` / `js/experts-data.js` 相对基线**零 diff**
(`git diff --stat cdf537e HEAD -- js/skills.js js/prompts.js js/knowledge.js js/experts-data.js` 空输出),
故这几个数是结构性成立;`js/cmd-registry.js` 进了 diff,故「领域命令 13」那格是**现跑对出来的**。

## 2. 基线 live 举证(W196 `cdf537e`,不是读源码猜)

取证方式与 `tests/unit.js` 的 `plans` 套件同形:`vm` 沙箱加载**真实**的 `domain/prompts/knowledge/skills/cmd-registry/plans`
六个文件,`Commands.list()` 用注册表实际词表(生产里它由 `js/commands.js` 的 `REG` 出,与注册表逐条对齐),
`Commands.execute` 打成一个**会真改 `persona`** 的桩(与 `WfCore.evolveApply` 同形状:往 persona 追加一条进化条款),
然后按任务给的两条路子各驱一遍。

| # | 问的是什么 | 基线实况(live) | 判定 |
|---|---|---|---|
| E0 | `generate` 的允许名单排除 evolve 了吗 | `Commands.list()` **13** 条,`expert.evolve` **在内** | 否决条件①不满足 |
| E1 | LLM 拆出蒸馏步,钳制会丢弃它吗 | 计划落成 2 步:`episode.generateStoryboard,expert.evolve`——**原样留在计划里** | 拆得出 |
| E2 | 「执行计划」会不会下发它 | `runAll` 实际下发 `episode.generateStoryboard,expert.evolve`;`U.confirm` **0** 次 | **会,且零确认** |
| E2′ | 那一步的结局 | `failed`,尾注「缺 expert(专家 id 或名称)」;persona **未改** | 见下方"重要限定" |
| E3 | 计划步带齐 `args.expert` 时(直接写 `p.agentPlan`) | `runAll` 下发 `expert.evolve`、`U.confirm` **0** 次、步骤 `done`,persona 由 `"擅长悬疑节奏"` 变成 `"擅长悬疑节奏\n【进化条款】多用留白"` | **真跑蒸馏,未经确认** |
| E4 | 单步「▶ 执行」按钮 | 同 E3:下发、persona 被改 | 同上 |

**重要限定(如实登记)**:E2′ 说明**光靠 `generate` 这一条路今天改不动 persona**——
`generate` 只从 LLM 回包里取 `label`/`cmd`/`ep` 三个字段,**不取 `args`**,
所以它拆出来的 evolve 步没有 `expert` 参数,下发到命令层被 `blocked('not-found', '缺 expert…')` 挡住,
再被 `execStep` 归成 `failed`。

这不改变判定,理由有三:

1. **挡住它的是命令层缺参数,不是计划层的任何判断**。计划层此刻对"这一步该不该由程序代跑"零判据,
   哪天 `generate` 的参数面往前走一格(或 LLM 回包契约加个 `args`),这层偶然保护当场消失。
2. **真能改 persona 的那条路今天就通着**:E3/E4 用的是带 `args` 的计划步,而 `p.agentPlan` 是普通落库字段,
   `Plans.replace` 是公开出口,旧计划回读、跨设备同步、导入的项目都能把这样一步送进来。
3. 用户视角上 E2 已经是坏结果:点一次「▶ 依次执行到下一步」,一条**改人设**的命令被无声地发了出去,
   成不成只看命令层当下的参数校验。

因此按任务口径:**停工位成立**,只拦计划这条自动路径。

## 3. 为什么拦在执行口(`execStep`)而不是生成侧(`generate`)

任务问「拦在 generate 还是 runAll」。答案是 **`execStep`**——`runAll` 与单步「▶ 执行」按钮
共用这一个漏斗,拦一处两条路都拦住,不用写两份。

不拦生成侧的理由,正是 §2 那三条的反面:

| 来路 | 拦 `generate` 挡得住吗 | 拦 `execStep` 挡得住吗 |
|---|---|---|
| LLM 规划出的 evolve 步(无 `args`,今天注定 `failed`) | 挡得住 | 挡得住 |
| 直接写 `p.agentPlan` / `Plans.replace` 的步(带 `args`,**真改 persona**) | 挡不住 | 挡得住 |
| 旧计划落库回读、跨设备同步过来的计划 | 挡不住 | 挡得住 |
| 单步「▶ 执行」按钮 | 挡不住 | 挡得住 |

即:只筛生成侧,恰好只挡住了三条来路里**最无害**的那一条。变异 M6 把这个判断跑成了判据
(§5.3:只在 `generate` 里筛、执行口放开 → **红 2**)。

生成侧因此**一个字没改**:evolve 仍在 `Commands.list()` 名单里、`generate` 仍拆得出这一步。
它现在的归宿是落 `blocked` 并在尾注里写着去哪儿手动办——步照留不藏,只是变成一块**路牌**而不是一个自动动作,
这与本层既有的纪律同形(需要授权或需要人工挑选的状态一律出导航步,不拿假 args 冒充可执行)。

## 4. 改了什么

### 4.1 `js/cmd-registry.js`:`manual` 位

```js
name: 'expert.evolve', label: '专家自进化', risk: 'exec', needs: [], manual: true,
```

加字段而不是在 `js/plans.js` 里写死命令名,是因为「这条命令是人手动作」本来就是**命令自己的属性**,
不是计划层的知识;写在计划层等于让"人手动作"这件事有两个说法。四端共享元数据本来就是干这个的
(`name/label/risk/needs/desc/args` 全在这一份),多这一位不改任何既有消费方的行为:
`usageOf` 不读它、CLI `help` 与 MCP 工具描述不读它、`Commands.list()` 透出的字段集不变。

任务允许「若必须在注册表加 `manual` 字段才能共用,可以加」——本槽用了这个许可,
但**只加字段,不加任何扫描**:playbook `steps` 的 `Skills.validate` 扫描留给 W198,本槽一份也不写(见 §6)。

### 4.2 `js/plans.js`:执行口的一道岔

`execStep` 的命令分支原先是「置 running → `Commands.execute` → 回执映射状态」一条直线,
现在在最前面多一道岔:

```js
const man = manualCmd(st.cmd);           // 现取 CmdRegistry.byName[cmd].manual,不认命令名
let r = null;
if (man) {
  st.status = 'blocked';
  st.note = `「${man.label}」是人手动作,计划不代跑:请到它自己的手动入口执行`;
  st.time = Store.now();
  U.toast(`📋 ${st.note}`, 'info', 3500);
} else {
  …原样的执行与回执映射…
}
if (window.Bus) Bus.emit('plan.step', { … });   // 两条路共用同一次落定事件
```

几处刻意:

- **状态取 `blocked`**:本层的状态语义里 `blocked` 就是「待人工」,与这件事逐字相符;
  取 `failed` 会让用户以为重试有用,取 `done` 则是静默跳过(变异 M5 钉住这一点)。
- **`runAll` 一行未改**:它本来就是「步骤没落到 `done` 就暂停并 toast 尾注」,
  遇到这一步自然停下并把尾注播出去,后面的步保持 `pending`。
- **`Bus.emit('plan.step')` 从映射块里提出来**,两条路都发——Agent 对话流与问题中心角标的感知面不缺一格;
  这次的 `r` 是 `null`(压根没下发),现有订阅方读的是 `p`/`brief`,不读 `r`。
- **`man.label` 取注册表的中文名**,计划层不写第二份文案表;换一条命令标上 `manual`,尾注跟着换名字。

## 5. 测试面

### 5.1 `plans` 套件 +2(`node tests/unit.js plans`,14 → 16)

- **`execStep/runAll:注册表标 manual 的人手命令计划层不代跑(落 blocked 指回手动入口,命令层零下发)`**
  一条三步计划(普通命令 / evolve 带 `args` / 普通命令)交给 `runAll`:命令层只收到第一条,
  evolve 那步落 `blocked`、尾注点名「专家自进化 / 人手动作 / 手动入口」三件事,toast 同时给出手动入口与暂停,
  第三步保持 `pending`,`U.confirm` **0** 次;再按单步「▶ 执行」照样零下发。
  判据是 `manual` 位不是命令名,故**两向各钉一次**:摘掉 evolve 的 `manual` 它立刻照旧下发(三条全跑)、
  把 `manual` 标到 `episode.compose` 上它同样被拦且尾注换成「合成成片」。
  另有两句源级:`js/plans.js` 里 `expert.evolve` 字面 **0** 处、人手判据须现取共享元数据。
- **`generate:人手命令仍在命令名单里(不从 cmds 里删),拆得出这一步而执行口一律拦下`**
  名单换成注册表实际词表后,`generate` 拆出的步仍是 `episode.generateStoryboard,expert.evolve`
  (生成侧钳制口径一字未动、四端人手入口没被顺手删掉),同一份计划交给 `runAll` 时命令层只收到第一条。

### 5.2 全量

`unit` **600/600**、`contract` **131/131**、`integration` **143/143**。
`cli.smoke` **106/108**——失败的两条是「未登录 whoami → exit 3(实得 exit=1)」与「llm --json mock 链路」,
与基线 `cdf537e` 上跑出来的同名同表现;本槽产品改动只落在浏览器侧 `js/plans.js` 与共享元数据的一个新字段,
`cli.js` / `server.js` / `mcp.js` 一行没碰。

### 5.3 变异复核(逐条真跑,不是推演)

| # | 变异 | 结果 |
|---|---|---|
| M1 | `js/cmd-registry.js` 摘掉 `expert.evolve` 的 `manual: true` | **红 2**:前提句点名「共享元数据里标着人手动作」为 `false`、`generate` 那条点名 `runAll` 实发 `…,expert.evolve` |
| M2 | `js/plans.js` 去掉 `execStep` 的人手分支(退回基线那条直线) | **红 2**:点名实发 `episode.generateStoryboard,expert.evolve,episode.compose`(连它后面的步也被带着跑完) |
| M3 | 判据从 `manual` 位换成按命令名硬编码 `cmd === 'expert.evolve'` | **红 1**:两向那半点名「manual 位是唯一判据:摘掉它这一步就该照旧下发」(源级那句也拦得住,只是它先红) |
| M4 | 从 `js/cmd-registry.js` 整条删掉 `expert.evolve`(即"从 cmds 里删掉 evolve") | **红 8**:`plans` 两条 + `contract` 五条(浏览器 REG 词表 / CLI EXEC 词表 / skill 引用键 / MCP 中段模板 / README 命令数 13→12)+ `memory` 那条「须在命令元数据注册表里(四端词表同源)」 |
| M5 | 拦下时把状态置 `done` 而不是 `blocked`(静默跳过继续往下跑) | **红 2**:点名实发 `episode.generateStoryboard,episode.compose`(evolve 之后那步被跑掉了)、点名「它落 blocked 待人工,而不是被自动执行掉」 |
| M6 | 换个落点:只在 `generate` 里筛掉人手命令,执行口放开 | **红 2**:注入计划那条点名 `runAll` 照旧实发 evolve、生成侧那条点名步骤变成 `…,goto`(生成侧钳制口径被动了) |

M6 是本槽落点选择的判据化形态:它证的不是"生成侧筛掉不对",而是**只筛生成侧挡不住带 `args` 的那条来路**——
两条断言一条报"执行口还通着"、一条报"生成侧不该动",落点选错时两头都说话。

## 6. 与 W198 的冲突面(合入时两面都留)

W198 在做的是同一个词的另一半:`manual: true` + `Skills.validate` 扫 playbook 的 `steps`。
本槽**有意不碰那一半**,两支的接触面按文件逐个记在这里:

| 文件 | 本槽改了什么 | 预计与 W198 的形态 |
|---|---|---|
| `js/cmd-registry.js` | `expert.evolve` 那条 META 加 `manual: true` + 五行注释;文件头注释的字段清单补 `manual` | **最可能真撞**:两支大概率改同一行同一个字段。字段名与取值(`manual: true`)若逐字相同,`git` 给不给冲突块取决于周边注释——本槽在那条 META 上方加了五行注释,故**多半是冲突块**,取并集即可(字段只留一份,注释两侧措辞择一或合并) |
| `js/plans.js` | `execStep` 加人手分支 + 模块头注释一行 | **不撞**:W198 不改计划层 |
| `js/skills.js` | **零 diff** | 不撞(W198 那半在 `Skills.validate`) |
| `tests/unit.js` | `plans` 套件尾部插 2 条;`单元测试` FLOOR 598 → 600、记账件 FLOOR 209 → 210 | 用例是**纯插入且在不同套件**,两个 FLOOR 字面**必撞**(两支都要抬),合完按 live 现跑重定 |
| `README.md` | 持久计划那段补人手命令一句、架构框 `js/plans.js` 补一行、`exec expert.evolve` 那句补「注册表标 `manual`」、单元用例数 598 → 600 | 段内插入,按段前后缀对齐核;数字按合完 live 重定 |
| `docs/skills-wave/README.md` | 份数 209 → 210 + 本文索引行 | 份数字面必撞,索引行是纯插入 |

一句提醒给合入员:两支都会在 `js/cmd-registry.js` 上写下"这条命令是人手动作"这个意思。
**语义完全一致,字段应当只有一份**——若合完出现两个近义字段(比如一个 `manual` 一个 `manualOnly`),
那是合并事故不是并集,按注册表单一来源的纪律收成一个。

## 7. 交还与残留

- **`G-11` 的自动进化面仍欠,本槽反而把它又钉紧一格。** `js/skills.js` 里 SK-26 那句
  「蒸馏仍是人手动作——回流条目要人点「🧠 进化」或显式发一条 `expert.evolve` 才进 persona」
  与实况仍然一致,而且现在多了一条真判据(此前只有 playbook `steps` 那一面有判据)。
  `gaps()` 一个键不拆、`G-11` 一个字不动(任务明令)。
- **自动蒸馏没有做,也没有为它开任何口子。** 要开它得先定产品口径(什么条件触发、结果无撤回怎么兜),
  不是把 `manual` 摘掉的事。
- **`manual` 目前只有 `expert.evolve` 一条带着**,本槽没有给别的命令加,也没有立"哪些命令该带它"的清单——
  该不该带是逐条的产品判断,不适合先立表后填。
- **playbook `steps` 的 `Skills.validate` 扫描本槽一份没写**(任务明令留给 W198),
  故此刻「manual 命令不进 playbook `steps`」仍只由 `memory` 套件那两条按命令名字面的旧断言守着。
- **别的自动执行路径没有连坐检查**:`js/agent-ops.js` 的 `run` 类 op 也能按命令名发命令,
  本槽按任务口径只动计划层,没有去核它对 evolve 是什么行为。要收得另开一槽,记在这里备查。
- 本槽**没有登记任何 `GUARD_TOPICS`**(任务明令),故花名册与 `TOPIC_FLOOR` 停在 19 未动。
