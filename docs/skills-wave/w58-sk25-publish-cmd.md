# W58 · G-12 第三个落点:发布留痕的命令化出口 `project.release`

**范围**:新增 `js/release-core.js`(双端 UMD 单源)、`js/cmd-registry.js`(新命令 `project.release`)、`js/commands.js`(浏览器处理器)、`js/release.js`(`stampRelease` 改委托 + 「打版本」按钮改走命令表)、`index.html`(挂脚本一行)、`server.js`(新端点 `POST /api/wf/release`)、`cli.js`(`EXEC['project.release']` + `CMD.release`/`_releaseGates` 收敛到单源 + `exec` 参数合流修正 + help 两行)、`mcp.js`(`hujing_release` 改走 exec 同链路并补 `cmd` 字段)、`js/skills.js`(SK-05/SK-25/SK-26 的 `note` 与 `steps` 按实况更正)、`tests/unit.js`(release 套件新增 5 条)、`tests/integration.js`(新增 13 条)、`tests/cli.smoke.js`(新增 12 条)、`README.md` 实况同步。
**基线**:`cursor/w55-integration-8f21`(head `3968658`)。
**不做**:不抬发布门(判据、fail/warn 计数与 overall 四级口径一字未动,G10 仍是 warn)、不新增计费动作、不改 `Release.collect` 的十项门、不改问题中心与就绪检查、不动 `Plans.*` 与 `FlowTpl` 的步序、不摘 `gaps`、不新增 MCP 工具(既有那一条改路由)。

## 1. 欠的是什么

W52 的记账第 194 行写着:G-12 的投影侧(W46 计划步骤)与模板侧(W52 中段流程模板)都已落地,**仍欠发布留痕的命令化出口**——两端各一份实现,且两处都在领域命令注册表之外:

| 落点 | 基线上的样子 | 于是 |
|---|---|---|
| 浏览器 | 交付检查弹窗的「打版本」按钮直调 `Release.stampRelease` | 这个动作在命令表里不存在,`Commands.execute` 调不出来 |
| CLI | `hujing release <pid>` 自己算门、自己拼摘要、自己 `PUT /api/state` | 与浏览器各写一份摘要算法、版本号推进与留痕字段 |
| 服务端 | 没有端点 | 发布留痕是唯一一个只靠客户端写 state 的主线收尾动作 |
| MCP | `hujing_release` 包的是 `release` 子命令 | 工具表里有它,但它不是一条领域命令 |

两份实现已经开始漂:浏览器的 `_checksum` 把 `p.__ver`、项目名与主体形态都算进签名,CLI 的 `djb(sig)` 只算分集;浏览器走 `Continuity.bumpVer`(200ms 窗口幂等),CLI 直接 `__ver+1`;空项目在浏览器十项门里被 G3 判 fail,在 CLI 七项门里 G3 判 pass——同一个空项目,一端拒绝、一端打得出版本号。

本轮补的是这块:**判定与写回收进一份 UMD,出口做成一条与现有命令表同构的领域命令**。

## 2. `js/release-core.js`:判定与写回的单源

### 2.1 三条边界

```
调用方注入门禁结论 ──► precheck() ──► stamp() ──► 回执 { ok, release, gate }
      (浏览器十项门 / headless 七项门)                    调用方自己落库 + 回流记忆
```

1. **本层不判发布门,只消费门禁结论**。`gate` 是必填入参:浏览器注入 `Release.collect` 的十项门,headless 注入本模块 `gates()` 的七项核心门。放行判据只此一份 `passed(gate)`(`overall ∈ {pass, cond-pass}`),两端不各写一份。
2. **环境差异一律经参数注入**:时钟 `when`、随机后缀 `rand`、发布人 `who`、版本号推进器 `bumpVer`、落库时间戳 `savedAt`。模块内不碰 `window`、不读 `Store`、不发请求、不落盘——只在传进来的项目对象上写 `p.releases` 与 `p.__ver`(源级断言逐个字面查 `window.` / `Store.` / `localStorage` / `fetch(` / `require(`)。
3. **记忆回流不在本层派生**:那一份仍在 `js/wf-core.js` 的 `memFeedback`/`memWrite`,调用方拿 `stamp` 回执自己写回(与 W43 定的口径一致,不为发布多开一条派生)。

### 2.2 headless 七项核心门与浏览器十项门的差集是有意的

`gates()` 出 G1 主线就绪 / G3 审片均分 / G4 过期镜 / G5 未确认镜 / G6 失败镜 / G9 主体缺图 / G10 计费账目,判据与 `overall` 四级计数逐字搬自基线 CLI 的 `_releaseGates`(本轮只是把它挪进双端单源)。**G2 问题清零 / G7 合规 / G8 真人素材审核依赖浏览器模块**(`Issues` / `Compliance` / `HumanReview`),headless 拿不到就不假装判——不是"少三道门更好过",而是拿不到判定输入时不产出结论,与本仓其余校验面同一条纪律。

`overallOf(fails, warns)` 的四级映射(`fail` / `warn` / `cond-pass` / `pass`)从此只有一份,`release-check` 的 `--with-billing` 重算分支也改现取它。**G10 仍是 warn**:不带 `--with-billing` 时它只是一条提示,`cond-pass` 因此仍是齐备项目的正常结论——本轮一个 warn 都没有升成 fail。

### 2.3 空项目那条排在门禁之前

七项核心门在「0 集」上全部 pass(没有集就没有不达标的集),headless 因此能给一个连分集都没有的项目打版本号。这一条补在 `precheck` 里而**不是加成第八道门**:

```js
if (!p || !p.id)                    return { ok:false, code:'not-found',    message:'项目不存在' };
if (!((p.episodes||[]).length))     return { ok:false, code:'no-episodes',  message:'项目暂无分集:没有可发布的成片,请先拆集出片再打版本' };
if (!gate)                          return { ok:false, code:'no-gate',      message:'缺发布门结论:发布留痕必须带门禁判定' };
if (!passed(gate) && !opts.force)   return { ok:false, code:'gate-blocked', message:'发布门未通过(fail=…,warn=…)' };
```

它是**发布留痕这个动作自己的前置**(没有成片就没有可留痕的交付物),不是发布门的一项——加成门会改掉 `fails` 计数与 `score`,那就是抬门了。顺序也钉了断言:`force` 是"未过门强打"的授权位,**不是"什么都能打"**,空项目带 `force` 仍回 `no-episodes`。

`no-gate` 那条是防跳过检查直接留痕:调用方不传门禁结论就不给写。

### 2.4 强制打的版本如实留痕

`force` 放行时 `rel.forced = true`。回滚与对账时看得出这一版没过门,回执与 `p.releases[]` 里都带这一位;过门的版本不带该字段(不写 `forced:false` 混进历史留痕的字段集)。

## 3. 四个出口,一条链路

| 出口 | 形态 | 门禁由谁算 |
|---|---|---|
| 浏览器「打版本」按钮 | `Commands.execute('project.release', { pid, note, gateResult, ui:true })` | `Release.collect` 十项门(弹窗里已经算好,原样透传) |
| `hujing exec project.release --pid X [--note] [--min-score] [--force]` | 薄封装 `/api/wf/release`,本地先跑 `precheck` 以给出精确 blocked code | 端点自己算 |
| `POST /api/wf/release` | `ReleaseCore.gates` + `ReleaseCore.stamp` + `wfSave` | 自己算(**客户端结论不作数**) |
| MCP `hujing_release` | `build: i => ['exec','project.release','--args',…]` + `cmd` 字段 | 同上(经 exec 走端点) |

`hujing release <pid>` 子命令保留,回执面保留它的历史字段名(`projectId`/`gateOverall`/`rev`),但实现改成同一条链路——本地 `precheck` 只为给出这条子命令历史上的精确 exit(项目不存在 4 / 空项目 2 / 未过门 5),写回一律走端点。冒烟里有一条专门钉住"两条出口写的是同一份留痕":`release --force` 打完 v1,`exec project.release --force` 接着打 v2,`releases` 累加到 2 条、`ver` 逐条递增。

### 3.1 浏览器按钮改走命令表,是这轮的要点而不是顺手

按钮从直调 `stampRelease` 改成 `Commands.execute('project.release', …)`。这一条有源级断言钉住(`js/release.js` 里必须出现 `Commands.execute('project.release'`),**改回直调即红**——否则"命令化"就退化成"headless 另开了一条路",浏览器仍是自己那份,两端会重新开始漂。`stampRelease` 本身没有撤(交付检查模块内部与既有调用方仍用得到),它现在只做浏览器这一端的环境注入(用户名、`Store.now()`、`Continuity.bumpVer`)与落库/广播,判定与写回委托 `ReleaseCore.stamp`。

### 3.2 端点为什么自己重算门

客户端传来的 `gateResult` 在服务端一律不采信(端点的入参里根本没有这一位)。理由与 `/api/wf/split-episodes` 的 `overwrite` 同源:授权位可以由调用方明示,**判定结论不能由调用方代劳**。代价是 headless 侧过的是七项门而不是十项门,这一点在端点注释、README API 表与本文件都写明。

### 3.3 `exec` 参数合流的一处修正(顺带修掉的真 bug)

`CMD.exec` 原本用 `Object.assign(--args 的 JSON, { pid: f.pid, … })` 合流。未给的 flag 是 `undefined`,`Object.assign` 会把 `undefined` 也写进去,把 `--args` 里的同名值**抹掉**;紧随其后的 `delete` 再把这个空键删掉,于是 `--args` 里的 `pid` 就此消失。MCP 各工具正是只传 `--args`(不拼 `--pid`),这条路径上所有需要 `pid` 的命令本该一律"缺 --pid"。基线上没暴露,是因为 `pid` 那几个键之外的参数各命令自己兜住了;本轮 `hujing_release` 走上 exec 后一调即现。

改法是逐键判定后再写:

```js
const args = f.args ? JSON.parse(f.args) : {};
Object.keys(flags).forEach(k => { if (flags[k] !== undefined) args[k] = flags[k]; });
```

布尔开关 `confirmAll`/`noImage` 保持恒定义(缺省 `false` 即"未授权",不能被 `--args` 打底成 `true`),授权位 `overwrite`/`local`/`force` 与 `minScore` 缺省留 `undefined` 由 `--args` 兜底。两条源级断言钉住这个写法(不得退回 `Object.assign` 平铺)。

## 4. 计费:本来就不计费,本轮保持不计费

任务书要求"浏览器已走 `Tasks.run` 则 headless 必须同样走"。**实况是浏览器这一侧本来就不走**:`stampRelease` 全程零 `Tasks.run`、零 LLM、零上游调用——它只写 `p.releases` 与 `p.__ver` 两处本地状态。因此:

- 命令层 `meter: false`(浏览器 `reg('project.release', { …, meter: false })`、CLI `EXEC['project.release'].meter = false`),回执不出 `cost` 字段;
- 服务端端点不进 `wfLLM`、不入 wf 限流窗口(它与 `PUT /api/state` 同性质:本地状态写入);
- 断言两道:命令层 `meter:false` 的源级断言(改成 `true` 即红),以及行为面的"钱包余额不动"——单测查 `Store.credits()` 前后相等且回执无 `cost`,集成与冒烟各查一次真实钱包余额。

没有绕过扣费的问题:这条链路上没有任何一步应当扣费。

## 5. 记忆回流跟着搬了一处写入点

W43 登记的四处写入点里,"CLI release 随同一次 PUT 的 meta 桶写回"这一处随本轮改成**服务端 `/api/wf/release` 随同一次 `wfSave` 落盘**——CLI 不再自己拼 meta 桶、不再为回流多发一次请求(既有源级断言原样接住)。回流内容一字未改:门禁 `overall`、fails/warns 与未过门项的 label,按回流键 `fb: 'release:<pid>'` 原地更新,反复发布只留最新一条。未过门不留痕,也就不回流。

SK-26 的 `note` 与 `steps` 随之更正:两步都是已注册命令,编排层不再需要为发布这一步挂假命令名。

## 6. 记账口径:G-12 三个落点齐了,但 SK-25 没清零

| 条目 | 本轮改了什么 | 缺口标记 |
|---|---|---|
| SK-05 `core.playbookProjection` | `note` 写明第三个落点已接上,并写明**发布留痕为什么仍不串进主线全链**——它是整条主线跑完之后的收尾动作,不是主线的第七步;计划层与中段模板都只切这份投影,口径自动跟随 | `G-12` 仍在(关联索引口径,落地不摘标记) |
| SK-25 `review.reviseLoop` | `steps` 补第五步 `project.release`(`args` 仍留空,`force` 归用户明示);新增 `note` 写明命令化落点与零计费口径 | `G-03` 仍欠、`G-12` 关联索引仍在 |
| SK-26 `review.memoryFeedback` | `steps` 补 `project.release`;`note` 的四处写入点按实况更正 | `G-11` 仍欠 |

**SK-25 没有清零**,如实记两笔:

1. **G-12 在 SK-25 上的落点已清**——发布留痕从"两端各一份实现、都在领域命令注册表之外"变成一条已注册命令,编排层为它挂得出命令名了。G-12 的三个落点(计划步骤投影 W46 / 中段流程模板 W52 / 发布留痕命令化 W58)至此全部接上。
2. **SK-25 仍欠 G-03**:修订循环仍靠调用方自己看 `lowShots` 决定重抽哪几镜,`shotIds` 子集不由编排层推导,复审不达标时的收敛次数也没有登记口径。这一条本轮没碰。

缺口标记按 W36 定的**关联索引**口径保留(`gaps()` 只投影 `gaps` 字段,落地不摘标记),`Skills.gaps()` 的键数与投影因此逐字节不变。

## 7. 影响面(逐项)

| 面 | 变化 |
|---|---|
| `js/release-core.js` | 新增(160 行,双端 UMD,零依赖) |
| `js/cmd-registry.js` | 领域命令 11 → 12(新增 `project.release`,其余零改动) |
| `js/commands.js` | 新增一个处理器(其余零改动) |
| `js/release.js` | `stampRelease` 改委托(+21 −41,`_checksum` 撤掉)、按钮改走命令表;`collect` 的十项门一字未动 |
| `cli.js` | `_releaseGates` 从 48 行变 1 行(委托单源)、`CMD.release` 改走端点、新增 `EXEC['project.release']`、`exec` 参数合流修正、help 两行 |
| `server.js` | 新增端点 `/api/wf/release` + 一个 `require`;其余零改动 |
| `mcp.js` | 工具数 34 → **34**(`hujing_release` 早已在表内,本轮只改它的 `description`/`inputSchema` 描述与 `build`,并补 `cmd` 字段);`PROMPTS`/`RESOURCES` 零改动 |
| `index.html` | 加载顺序插一行(须在 `continuity.js` 之后、`release.js` 之前) |
| `js/skills.js` | SK-25/SK-26 各补一步 `steps` 与 `note`,SK-05 改 `note`;`gaps`/`pending`/`checks`/`kb`/`prompts` 一字未动 |
| 发布门判据 / fail-warn 计数 / overall 口径 / 计费动作 / `Tasks.run` / 就绪检查面表 / 提示词 | 零改动 |
| `Skills.gaps()` / `preflightStages()` / 拼块投影 / `Plans` / `FlowTpl` 产出 | 逐字节不变 |

## 8. 测试

### 8.1 数字

| 套件 | 基线(`3968658`) | 本轮 |
|---|---|---|
| `node tests/unit.js` | 389/389 | **394/394 PASS**(新增 5 条) |
| `node tests/integration.js` | 93/93 | **106/106 PASS**(新增 13 条) |
| `node tests/cli.smoke.js` | 70/72(2 项基线失败) | **80/82**(新增 12 条全过,失败仍是同名那 2 项) |
| `node --check` | — | 改动的 11 个文件全过 |

冒烟那 2 项失败是 `master` 同名基线失败(`未登录 whoami → exit 3`、`llm --json mock 链路`),`w50-integration-log.md` 已取证,本轮未碰相关代码。未删测、未跳过、未放宽任何既有断言。

### 8.2 新增用例

release 套件 5 条(`node tests/unit.js release`):

| 用例 | 判什么 |
|---|---|
| headless 七项核心门 | 七项的码与序;齐备项目零 fail 单 warn(`cond-pass`);G10 仍是 warn(抬成 fail 即红);`overallOf` 四级映射逐值;低分审片 + 主体缺图仍照旧 fail |
| `precheck` 四码 | `not-found`/`no-episodes`/`no-gate`/`gate-blocked` 各给明确码;`force` 是授权位不是万能位(空项目带 `force` 仍回 `no-episodes`);强打的版本标 `forced`、过门的不标;缺 `bumpVer` 时默认 `__ver+1` 且 `release.ver` 与 `p.__ver` 对齐 |
| 两端同一份 `stamp` | 同一项目同一状态,浏览器 `stampRelease` 与直调 `ReleaseCore.stamp` 算出**同一个 checksum、同一个 ver**;浏览器侧未过门/空项目仍回 `{ok:false, code}` 供调用方按码分流 |
| `project.release` 命令(浏览器命令表真跑) | 齐备项目打出版本且留痕真的进了 `p.releases`;回执带门禁摘要;**零计费**(无 `cost`、钱包余额不动);未过门 `blocked` 且点名未过门项、一条留痕都不留;空项目回 `no-episodes` 而不是空成功 |
| 命令化出口四端齐备 | 注册表登记(`needs`/`risk`/三个参数);浏览器按钮走命令表(**绕过即红**);`js/commands.js` 有处理器且 `meter:false`;CLI 有 `EXEC` 键且不计费;`server.js` 有端点;MCP 工具登记 `cmd` 且真的拼 `exec project.release`;两端都委托 `ReleaseCore.stamp`、都不留第二份 checksum;`release-core.js` 的 UMD 边界(五个环境句柄字面逐个查);两端都不进 `Tasks.run`;`exec` 参数合流不得退回 `Object.assign` 平铺 |

集成 13 条(`/api/wf/release`):种子 PUT;齐备项目过门 200(digest 形态、`ver=1`、`gateOverall=cond-pass`);门禁是端点自己算的七项门且 warn 不升 fail;留痕写回 state 且 `__ver` 与 `release.ver` 对齐;发布闭环结论随同一次落盘回流既有记忆桶;未过门 409 且报错里写明 `force` 可强制;被拦下的项目一条留痕都没有;`force` 后 200 且标 `forced`;空项目 400;项目不存在 404;反复发布逐条累加、版本号递增且 checksum 各不相同;记忆桶仍只留最新一条;全程零计费。

冒烟 12 条:`exec` 用法清单含 `project.release`(词表由注册表单源生成);缺 `--pid` exit 2;不存在项目 blocked `not-found` exit 4;未过门 blocked `gate-blocked` exit 2 且回执带未过门项;`--force` 打版本 exit 0 且 `ver` 递增、`forced=true`、**无 `cost` 字段**;空项目 blocked `no-episodes` exit 2;`release` 子命令与 `exec` 写的是同一份留痕;MCP `tools/list` 含 `hujing_release`;MCP 空项目如实 `isError` 不静默成功;MCP 走 exec 同链路且结构与 CLI 逐字段同形、`ver` 继续递增。

### 8.3 变异验证(实测五条)

| 改坏 | 结果 |
|---|---|
| 1. 浏览器「打版本」按钮改回直调 `stampRelease`(绕过命令表) | 393/394,点名"交付检查「打版本」按钮须走领域命令表" |
| 2. MCP `hujing_release` 改回包 `release` 子命令(不走 exec) | 393/394,点名"MCP 工具须登记 `cmd` 并真的拼 `exec project.release`" |
| 3. 抬门:G10 从 warn 改成 fail | 393/394,点名"齐备项目零 fail:期望 0,实际 1" |
| 4. 撤掉 `no-episodes` 前置(空项目静默放行) | 单测 391/394、集成 105/106(空项目回了 200)、冒烟 78/82(exec 与 MCP 两条各点名空项目被判成 `gate-blocked` 而不是 `no-episodes`) |
| 5. 把 `project.release` 改成计费(`meter: true`) | 393/394,点名"发布留痕不计费:命令层须 `meter:false`" |

五条全部还原后回到 394/394。

## 9. 如实记录

1. **发布留痕有意不进主线全链投影**:SK-05 的 `steps` 仍止于合成成片。它是整条主线跑完之后的收尾动作,不是主线的第七步;串进去会让计划层(`Plans.fromWorkflow`)与中段模板(`FlowTpl`)也跟着多出一步"该打版本了",而这两处的语义是"当下卡在哪一步该推进什么"。SK-05 的 `note` 把这条理由写进去了,并有断言钉住(否则读者会把"链里没有"读成"还没命令化")。它进的是 SK-25(审片修订闭环的收尾)与 SK-26(回流的第二个闭环)。
2. **headless 判七项门,浏览器判十项门**:这个差集在基线上就存在(CLI 的 `release-check` 一直是七项),本轮没有扩也没有缩。想让 headless 也判 G2/G7/G8,要先把 `Issues`/`Compliance`/`HumanReview` 三处做成双端可用,那是另一件事。
3. **空项目在两端的结论仍不同,但两端都拒绝留痕**:浏览器十项门在空项目上 G3 判 fail(`overall=fail`),headless 七项门判 pass(`overall=cond-pass`)。本轮不去统一门禁结论(那会动判据),而是在两端共用的 `precheck` 里加了动作前置——于是两端**都**给不出留痕,只是错误码不同(浏览器可能先撞 `gate-blocked`,headless 撞 `no-episodes`)。
4. **`hujing release` 子命令没有撤**:它的回执字段名(`projectId`/`gateOverall`/`rev`)是历史契约,冒烟里有既有用例依赖。它现在与 `exec project.release` 同一条链路,只是回执面不同;两条出口写的是同一份留痕由冒烟钉住。
5. **`exec` 参数合流那处修正是顺带修的真 bug**,不是本任务范围内的重构:MCP 全部工具只传 `--args`,基线上凡走 `hujing_exec` 且靠 `--args` 带 `pid` 的调用都会被抹掉 `pid`。改动只在 `CMD.exec` 一处,两条源级断言防回退。
6. **本轮没有做的**:没有把发布留痕接进 `Plans`(理由见 1)、没有给它做回滚出口(`snapshotVer` 只是留痕字段,实际回滚仍走 `Store` 的 history 快照)、没有动 `Release.collect` 的十项门与 `--with-billing` 对账、没有新增 MCP 工具或提示模板、没有抬任何一道门或把 warn 变 fail。
