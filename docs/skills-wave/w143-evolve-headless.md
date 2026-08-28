# W143 · G-11 的 headless 面:专家自进化补人手、无头入口(`expert.evolve`)

**范围**:`js/wf-core.js`(蒸馏四步下沉,新增 `presetCopyOf`/`evolveTarget`/`evolveSystem`/`buildEvolveUser`/
`evolveClauses`/`evolveApply`)+ `js/experts.js`(`evolveExpert` 改委托 + 回结构化回执)+
`js/cmd-registry.js`/`js/commands.js`(领域命令 `expert.evolve`)+ `server.js`(`POST /api/wf/evolve-expert`)+
`cli.js`(`exec expert.evolve --expert`,`api` 带回原始 HTTP 状态)+ `mcp.js`(`hujing_expert_evolve`)+
`js/skills.js` 的 SK-26 记账 + `tests/unit.js`(experts 套件 +3、memory 套件既有用例内加断言)+
`tests/integration.js`(+11)+ `tests/cli.smoke.js`(+5)+ `README.md` 同步。
**基线**:`cursor/w139-integration-a7f2`(`2851d97`)。
**不做**:不做自动蒸馏(触发点仍全是人手,本槽只把人手那条路从一端变四端)、不摘 `G-11`、不抬发布门、
不动计费口径(仍是 `llm.evolve` 1 积分 / 无新增条款不退费 / 失败退费 / 两道闸仍在扣费之前)、
不改预置注册表 `js/experts-data.js` 一个字、不动 `memWrite` 的上限与淘汰策略、不改 `memRecall`/`memBlock`
召回侧、不新增记忆 schema 与存储桶、不改 `WF_BOARD` 与两端板块词表、不合并其它并行槽。

## 1. 先核实:五处是不是真的零 `evolve`

动手前先按任务点名的五处逐个查,免得重做已落地的部分。基线 `2851d97` 上的实况:

| 处 | 基线实况 |
|---|---|
| `cli.js` | 零 `evolve`——没有子命令,`EXEC` 里也没有这一条 |
| `server.js` | 零 `evolve`——`/api/wf/*` 六个 LLM 端点里没有它,`wfMockOut` 也没有对应 `kind` |
| `mcp.js` | 零 `evolve`——工具表 37 条里没有 |
| `js/cmd-registry.js` | 零 `evolve`——12 条领域命令元数据里没有 |
| `js/commands.js` | 零 `evolve`——`Commands.execute` 的注册表里没有 |

唯一的实现在 `js/experts.js` 的 `evolveExpert`,四个人手触发点(工坊编辑区 / 工坊卡片 / 自定义卡片 /
预置卡片,后者是 W128 补的)全在浏览器。人设句 `forge.evolveSystem` 虽已在提示词注册表(W88 收编),
但那条键**只有浏览器一个消费点**——W88 的记账原话就是「收编解决的是可覆盖不是可 headless」。

所以本槽按"补出口"办,不是举证停工。

## 2. 为什么必须先下沉,不能让 headless 那端照抄一份

最省事的写法是在 `server.js` 里把 `evolveExpert` 那段提示词与条款处理原样抄一遍。这条路不能走:

**蒸馏结果是写死进 `persona` 的,而且没有撤回口。** 召回串错只坏这一轮的上下文(W65 记过这条),
蒸馏则不然——两端提炼口径分叉,同一个专家在浏览器上点进化与在 CLI 上跑 `expert.evolve` 会长成两份人设,
而这两份都会进 `personaFor` 装配的提示词。这不是"两端输出略有差异",是同一个对象被两套规则改写。

具体分叉点有四处,每一处都足以让两端的条款不一样:

| 分叉点 | 抄第二份会怎样 |
|---|---|
| 落点判定 | 一端派生副本、另一端原地改写预置(而预置注册表两端共享,改了存不住也会漂移) |
| 提示词两半 | 同一批记忆蒸出的条款措辞与条数上限不同 |
| 条款规整 | 去重基准(拿哪份 persona 比对)与 1–4 条上限任一端漂了,两端条款数就不一样 |
| 落 `persona` | 段头日期格式与"并入已有段还是新开一段"不同,下一轮去重当场失配 |

故先把这四步下沉到 `js/wf-core.js` 的 UMD 双端单源里,两端一字不抄。**环境差异留在各端调用点**:
浏览器那端的 `Store.save`/`Tasks.run` 五件套/toast,服务端那端的 `wfLLM` 计费与 `wfSave` 落盘,
本层只出判定与文本,不碰任何环境句柄(与 `js/domain.js`/`js/release-core.js` 同纪律)。

## 3. 落地

### 3.1 蒸馏四步(`js/wf-core.js`)

板块过滤(`expertBoards` → `memForBoards`,W65 已在这里)之后的四步:

| 函数 | 干什么 | 关键决定 |
|---|---|---|
| `presetCopyOf(e, id)` | 预置专家的自定义副本(纯造形) | 深拷贝——浅拷贝会让副本与预置共用 `dims`/`tpl` 嵌套对象,改副本即污染注册表;`from` 记派生源,名字带派生源名 |
| `evolveTarget(e, o)` | 落点判定,回 `{target, copy}` | 判"是不是预置"用**注册表反查**而不是 `e.custom`(自定义专家不一定带这个字段);同一预置只派生一份;`copy` 非空表示本次新派生、由调用方负责入库 |
| `evolveSystem(bt, ov)` | 提示词 system 半 | 人设句经 `Prompts.get('forge.evolveSystem', ov)`;其后的板块点名与 `clauses` 契约(1–4 条、每条 ≤40 字)**不开放覆盖**——改坏即整轮蒸不出条款而那次调用已交付 |
| `buildEvolveUser(t, bt, mem)` | 提示词 user 半 | 落点专家的身份/生效板块/现有人设 + 该板块沉淀条目 |
| `evolveClauses(out, persona)` | 条款规整 | 去空条 → 本地再去重一次(不重复落点已有条款)→ 截 1–4 条;回空数组是**业务结论**不是失败 |
| `evolveApply(t, clauses, d)` | 落 `persona` | 已有「【进化条款 · 日期】」段则并入段末,否则新开一段;`evolutions` 计数 +1;日期对象由调用方注入(纯函数不取当前时间) |

`evolveTarget` 把 W128 的 `presetCopy` 拆成了"判定"与"入库"两半:判定在 wf-core(两端同判),
入库留在各端(浏览器 `customExperts().push` + `Store.save` + 派生 toast,服务端 `tree.customExperts.push`
随 `wfSave` 一并落)。W128 那条"副本落库卡在两道闸之后、扣费之前"的顺序两端都照旧。

### 3.2 浏览器那端:委托 + 结构化回执(`js/experts.js`)

`evolveExpert` 的四段(在线判定 → 两道闸 → 计费五件套 → 蒸馏)一段没挪,只把提示词与条款处理换成
`WfCore.*` 调用。另加一件:**回一个结构化结果**,命令层据此分 blocked 与 ok。

```js
if (!boards.length) { U.toast(m0, 'info', 4000); return { ok: false, code: 'no-board', message: m0 }; }
...
return { ok: true, code: 'done', expertId: t.id, name: t.name, from: t.from || '', boards, clauses, changed: true, evolutions: t.evolutions };
```

码面六个:`no-expert` / `offline` / `no-board` / `no-memory` / `no-credits`(以上全是前置拦截,
零调用零计费)、`no-clause`(已交付、不退费,`ok: true` 但 `changed: false`)、`done`、`evolve`(蒸馏本身报错)。
四个人手按钮原来都不看返回值,toast 照旧播报,故加回执**不改任何一个按钮的行为**。

### 3.3 领域命令 `expert.evolve`(`js/cmd-registry.js` + `js/commands.js`)

`needs: []`——它作用在**专家**这个对象上而不在某个项目上,是四端唯一一条项目外的领域命令,
不吃 `--pid`/`--epid`,故 `next`(执行后按 Domain 重推下一步)也不推。浏览器那端 `metered()` 包着走
`Experts.evolveExpert`,再把回执翻成 `ok`/`blocked`/`fail`:`code === 'evolve'` 才算 `fail`,其余一律 `blocked`。

### 3.4 headless 那端:`POST /api/wf/evolve-expert`(`server.js`)

```
读 state → 按 id 或名称取专家(404)→ expertBoards(空即 400)→ memForBoards(空即 400)
→ evolveTarget 定落点 → wfLLM(llm.evolve,system/user 取 WfCore 两半)
→ evolveClauses(空即 changed:false 且不写盘)→ evolveApply → 副本入库 → wfSave
```

四处与浏览器逐条对齐:

- **两道闸在 `wfLLM` 之前**,400 如实拒绝、零调用零计费。这个先后有一条源级断言按三个字面的下标钉住——
  闸挪到调用之后就成了"扣完费再告诉你没得蒸"。
- **人设覆盖表显式传** `st.promptOverrides`(Node 无 window,`Prompts.get` 读不到 Store),
  与 `/api/wf/*` 其余六个 LLM 端点同纪律。
- **预置专家同样落自定义副本**:`ExpertsData.EXPERTS` 是服务端 `require` 的模块级常量,改不得也存不住。
- **无新增条款不写盘**:`changed: false` 且**副本不入库**——没蒸出东西就不往用户专家库里塞条目。

### 3.5 CLI 与 MCP

`EXEC['expert.evolve']` 是端点的薄封装。这里有一处非平凡的改动:`api()` 原先只把 HTTP 状态映射成
exit code 就抛,而**exit 把 400 与"连不上服务端"并成了同一个 1**——前置拦截要区分得出,不然两道闸会
被报成 `failed`。故给 `CliError` 挂一个 `status` 带回原始状态码,只有 `400` 走 `execBlocked('no-source')`,
其余(含 404 专家不存在)原样抛出去按既有映射走。

MCP 那条工具的描述里写明了**人手动作**:请在用户明确要求时调用,不要挂在任何流程收尾上自动跑——
这是给 AI 助手看的护栏,与下一节的记账口径同义。

## 4. 记账:G-11 **仍未**清零

`gaps: ['G-11', 'G-02']` 原样保留。SK-26 的 `note` 里,headless 那半从仍欠段移到已落地段并写明四端落点,
人手触发那一面照旧写在仍欠段,并补一句划界:

```
headless 那一面也已补齐:蒸馏四步(落点 evolveTarget/提示词两半 evolveSystem+buildEvolveUser/
条款规整 evolveClauses/落 persona evolveApply)下沉 js/wf-core.js 双端单源,出口是领域命令 expert.evolve——
浏览器 Commands 走 evolveExpert、CLI exec 与 MCP hujing_expert_evolve 走服务端 /api/wf/evolve-expert
(计费 llm.evolve 服务端定死,两道闸仍在扣费之前 400 拦下,预置专家同样落自定义副本);
本条的 cmds 因此比 steps 多一条 expert.evolve,而它有意不进 steps——
编排步序里出现"进化"就等于把自动蒸馏写成了口径。
仍欠(G-11):蒸馏仍是人手动作——回流条目要人点「🧠 进化」或显式发一条 expert.evolve 才进 persona,
自动进化仍无出口;补 headless 出口只是把人手那条路从一端变四端,
人设句可覆盖同样不改这一面——改得到提炼口径,改不出自动触发
```

**`cmds` 加一条、`steps` 一条不加**,这是本槽最要紧的一处记账纪律:`steps` 是 `Skills.playbook()` 投影的
来源,把「进化」串进主线回流步序就等于把自动蒸馏写成了编排口径,而那正是 G-11 仍欠的那一面。
两条断言分别钉住"不在 `steps`"与"不在 `playbook` 投影里"。

**G-11 四面的实况**:

| G-11 的面 | W43 | W65 后 | W128 后 | 本槽后 |
|---|---|---|---|---|
| 读记忆不按 `scope` 过滤 | 欠 | **已落地** | 已落地 | 已落地 |
| 只对自定义专家开放 | 欠 | 仍欠 | **已落地** | 已落地 |
| 只有浏览器一个出口(不可 headless) | 欠 | 仍欠 | 仍欠 | **已落地**(本槽) |
| 蒸馏要人手点(自动进化无出口) | 欠 | 仍欠 | 仍欠 | **仍欠** |

本槽一个触发点都没改成自动,反而多了三个人手触发点(领域命令、CLI、MCP)。W128 交接第 1 条列的那三件
待定产品口径(触发时机 / 条款可溯源可撤 / 自动派生副本的口径)一件未定,故这一面照旧欠着。

记账投影的实况:`pending` 本来就空;`steps`/`playbooks()`/`gaps()` 键数**一字未动**;`cmds` +1、
`CmdRegistry` +1(12 → 13),这两个数进 README 对账。

## 5. 断言与变异验证

experts 套件 +3(`WfCore` 四步纯函数 / 两端提示词逐字节同源 / 回执码),memory 套件 SK-26 记账那条
既有用例内加了五组断言(两道闸先后、五个 `WfCore.*` 委托点、四端接线、note 内容);
集成 +11(端点全路径),CLI 冒烟 +5(真实子进程跑 `exec expert.evolve`)。

既有用例一条未删。改结论的有两处,都是本槽把实现搬了家所致:

| 既有断言 | 本槽怎么改 |
|---|---|
| contract:进化器人设须在 `js/experts.js` 经 `Prompts.get` 取 | 取值口移到 `js/wf-core.js`(改查那里,并反向钉住 `experts.js` 委托 `WfCore.evolveSystem`、不许再就地拼一份) |
| contract:进化器契约半全仓只许一份 | 那一份从 `js/experts.js` 换成 `js/wf-core.js`(浏览器与 headless 同吃它) |
| memory:SK-26 的 `cmds` 逐字对齐 | 加上 `expert.evolve`,同时加两条反向断言钉住它**不在** `steps` 与 `playbook` 投影里 |

**变异实测**(逐个改完跑对应套件,验证后原样还原,`git diff` 为空):

| 变异 | 实测行为 | 转红 |
|---|---|---|
| `evolveClauses` 去掉 `.slice(0, 4)` | 上限失效,LLM 回几条落几条 | 1 条(unit) |
| `evolveTarget` 去掉"已派生就复用" | 每次进化长出一份新副本,条款分散 | 2 条(unit) |
| `js/experts.js` 退回内联那份 system 半 | 两端各一份提炼口径,改一处不跟随 | 1 条(unit contract) |
| SK-26 的 `steps` 里加一条 `expert.evolve` | 自动蒸馏被写成编排口径 | 1 条(unit) |
| 服务端删掉两道闸(等价于挪到 `wfLLM` 之后) | 扣完费再报"没得蒸" | 1 条(unit 源级) |
| 服务端删掉"无新增条款不写盘"的早退 | 空条款也 `changed: true` 并推高 `evolutions`、白落一次盘 | 1 条(integration) |
| `cli.js` 删掉 400 → `blocked` 那一支 | 两道闸被报成 `failed` exit 5(前置拦截当成执行失败) | 1 条(cli.smoke) |

最后两条值得记一笔:它们只有起真实服务/真实子进程的套件抓得住——服务端的写盘时机与 CLI 的 exit 映射
在单测的沙箱里都没有载体,这也是本槽同时往三个套件里加测的原因。

## 6. 回归数字

| 套件 | 本槽 | 基线(`w139` = `2851d97`,同机取) |
|---|---|---|
| `node tests/unit.js` | **498 / 498** | 495 / 495(净 +3 用例) |
| `node tests/integration.js` | **141 / 141** | 130 / 130(净 +11) |
| `node tests/cli.smoke.js` | **105 / 107** | 100 / 102(净 +5) |

`cli.smoke` 的两项失败(`未登录 whoami → exit 3`、`llm --json mock 链路`)与本槽无关,与 `master` 逐项同名。

`node --check` 过:`js/wf-core.js`、`js/experts.js`、`js/cmd-registry.js`、`js/commands.js`、`server.js`、
`cli.js`、`mcp.js`、`js/skills.js`、`tests/unit.js`、`tests/integration.js`、`tests/cli.smoke.js`。

文档同步:`README.md`(API 表补 `/api/wf/evolve-expert` 一行、`exec` 与命令注册表两处补 `expert.evolve`、
experts 套件与 CLI 冒烟两段描述补本槽覆盖面;数字对账按实况——单元 495→498、集成 130→141、
冒烟 102→107、领域命令 12→13、MCP 工具数 35→38(后者是基线上就有的陈旧数字,本槽按 live 一并订正));
本目录 README 的索引行与份数(152→153),索引契约里的份数下限同步抬到 153,三套件棘轮下限同步抬到本轮实况。

## 7. 交接

1. **G-11 只剩"自动进化"这一面,本槽反而把人手出口从一个变成四个**。W128 交接列的三件待定口径一件未定;
   本槽另添一层需要一并考虑的:headless 出口意味着**外部编排器**(MCP 助手、CI)也调得动它。
   自动化之前,除了 W128 那三件,还得定"谁有资格替用户改人设"——MCP 工具描述里现在只有一句
   "请在用户明确要求时调用"的软护栏,拦不住把它挂进流程收尾的编排。
2. **服务端那份 `derived` 回执目前只告诉调用方"这次派生了副本",没告诉它副本还没被雇佣**。
   浏览器那端有一条 toast 明说「雇佣该副本后生效」,headless 那端只有 `derived: true` 与一个 `cx_*` id。
   CLI/MCP 用户很容易"进化完以为生效了"。可接的做法是回执里带一个 `hired: false` 之类的判定位
   (`personaFor` 现成的判据),本槽没做——那要动回执 schema,属于接口决定。
3. **`operationId` 目前由 CLI 每次现发一个 UUID**,故同一次进化重试会是两笔扣费。别的 wf 命令同形,
   不是本槽引入的;要做幂等重试得让调用方能传进来,`cmd-registry` 的参数面里没有这一位。
4. **副本与派生源之间仍只有 `from` 一条线,没有同步**(W128 交接第 2 条,原样欠着);
   本槽多了一端能派生副本,这条欠账的影响面随之变大——CLI 派生的副本与浏览器派生的是同一份
   (`evolveTarget` 认 `from` 去重),但"派生源已更新"的提示两端都还没有。
