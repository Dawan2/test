# W130 · 周期 9 独立核验

本件是周期 9(W113 核验件落地之后到 `w129-integration-1481` 为止)的独立核验报告。
核验槽只交报告与本目录索引行,不改产品代码、不动发布门判据、不删测试。

周期 8 的正文不在此复述:凡上一份核验件已经量清楚的判据边界(`report(` 静态点数只封单行形态、
`cli.smoke` 并行不安全、W110 叉在功能槽 head 上),本件只在结论变化时点名,不再重述过程。

---

## 0. 核验时点与锚定 SHA

| 项 | 值 |
|---|---|
| 核验基线 | `origin/cursor/w129-integration-1481` @ `2f6880c` |
| `origin/master` | `9adcf0f`(无 `js/skills.js`、无 `docs/skills-wave/`) |
| 本槽分支 | `cursor/w130-cycle9-audit-3d8b`,叉在 `2f6880c` 上 |
| 核验方式 | 每支各开一个 `git worktree`,数字全部在各自工作树上现跑;不采信被核分支自述 |
| 周期 9 涉及的分支 | 集成槽 `w117` `w119` `w122` `w123` `w125` `w127` `w129`,功能/核验槽 `w113` `w114` `w115` `w120` `w121` `w124` `w126` `w128` |

`cli.smoke` 与 `integration` 都绑固定端口与固定临时目录,**必须串行**——本槽把十九支的这两个套件排成一条串行队列跑,
中途手工插进去的一次 `node tests/integration.js` 当场把队列里那一支打成 `Cannot read properties of undefined (reading 'balance')`。
这一条与周期 8 的结论一致,本件只记复现,不再展开。

---

## 1. 一句话结论

周期 9 是**治理层自我加固的一轮**:八次合入里有五次(W114/W120/W121/W124/W126)产出物就是测试契约本身,
合入纪律面**零违规**(整文件取边 0 次、整树回退 0 次、未合分支 0 条),
主线七步的状态机在十三态走查下**逐态自洽**。

但本槽量出的东西不在这些面上——**这一轮把"判据"堆到了五层,而这五层的方向是同一个**:
全部在防"一处静态登记跑出多条 / 数字被改小"。
反方向一条判据都没有,于是两处静默口都是开着的:

1. **下限棘轮"该抬没抬"零判据**(W129 已如实交接,本槽把它做成两步实测):
   加一条用例 → 只有两条精确对账红,`FLOOR` 那条不红;把 README 抬到 487 后**全绿**;
   随后**真删一条既有用例**并把 README 改回 486 → 仍是 486/486 **全绿**。棘轮把刚攒的那一格原样还了回去。
2. **静态点数只守住"静态 < 实跑"那一向**:把一条 `report(...)` 包进 `if (process.env.X) { … }`,
   `contract` 104/104 全绿,而 `node tests/integration.js` 实跑 **129/129**,README 写着 130。
   W124 那三条(循环 / helper / 裸表达式 / `for await`)全部按"一处登记跑出多条"设计,
   **"一处登记跑出零条"没有任何一层接得住**。

主线面最实质的一处不在测试上:**问题中心在项目还没有分集时一条都不报**——
空项目、只有剧本、只有主体三态实测 `Issues.collect` 返回 0 条,而 `Domain.workflow` 在同一状态给得出
`no-script` / `no-subjects` / `no-eps` 与推荐动作。以问题中心为唯一入口的消费方(CLI `issues`、
MCP `hujing_issues`、看板角标)在主线前三步是全盲的。

---

## 2. 独立复跑对账(全部数字为本槽实测)

### 2.1 十九支逐支现跑

| 分支 | unit | contract | integration | cli.smoke |
|---|---|---|---|---|
| `master` @ `9adcf0f` | 201/201 | 16/16 | 79/79 | 51/53 |
| `w109-integration-3f7a` | 471/471 | 98/98 | 130/130 | 100/102 |
| `w110-split-only-script-a91c` | 470/470 | 95/95 | 130/130 | 96/98 |
| `w112-integration-5d79` | 474/474 | 98/98 | 130/130 | 100/102 |
| `w113-cycle8-audit-b7d1` | **468/471** | **95/98** | 130/130 | 100/102 |
| `w114-int-dup-casename-1f5b` | 475/475 | 99/99 | 130/130 | 100/102 |
| `w115-g13-next-prompt-c3a4` | 474/474 | 98/98 | 130/130 | 100/102 |
| `w117-integration-8b2d` | 475/475 | 99/99 | 130/130 | 100/102 |
| `w119-integration-559e` | 475/475 | 99/99 | 130/130 | 100/102 |
| `w120-report-count-multiline-ea89` | 476/476 | 100/100 | 130/130 | 100/102 |
| `w121-suite-count-ratchet-aa65` | 476/476 | 100/100 | 130/130 | 100/102 |
| `w122-integration-90c3` | 476/476 | 100/100 | 130/130 | 100/102 |
| `w123-integration-7b41` | 477/477 | 101/101 | 130/130 | 100/102 |
| `w124-report-wrap-helpers-c80f` | 478/478 | 102/102 | 130/130 | 100/102 |
| `w125-integration-1977` | 479/479 | 103/103 | 130/130 | 100/102 |
| `w126-contract-count-assert-2556` | 478/478 | 102/102 | 130/130 | 100/102 |
| `w127-integration-4779` | 480/480 | 104/104 | 130/130 | 100/102 |
| `w128-g11-preset-evolve-5c1e` | 486/486 | 104/104 | 130/130 | 100/102 |
| **`w129-integration-1481`(基线)** | **486/486** | **104/104** | **130/130** | **100/102** |

`cli.smoke` 那 2 项失败在十八支上逐字相同(未登录 `whoami` → `exit 3 | exit=1`;`llm --json` mock 链路 → `undefined`),
`master` 上同样是 2 项,故各支都是"总数 − 2"。这是第九次独立复现,与任务给的基线数字逐个吻合。

`w126` 的 unit 比它的前一支 `w125` 低一条(478 < 479)不是回退:它叉在 `w123`(477)上,自己加了一条,
而 `w125` 已经在集成线上多走了一步。合并后取 live 是 480。

### 2.2 核验槽自己的分支 tip 是红的——这是本轮的一条现成教训

`w113-cycle8-audit-b7d1` 在它自己的工作树上 **468/471,3 条 FAIL**,三条全在索引完备性上:

```
FAIL | contract · docs/skills-wave 索引与目录实况双向对齐 | 索引表应与目录里的记账件一一对应
FAIL | contract · docs/skills-wave 索引完备性:每份 wNN-*.md 各有自己的索引行 |
      记账件 w113-cycle8-audit.md 在目录里但索引表没有它那一行
FAIL | contract · docs/skills-wave 索引完备性:记账件份数由 README 明写并与目录/索引表三方对齐 |
      期望 127,实际 128
```

它把自己那份记账件放进了目录却没有补索引行,也没有抬份数——三条判据全部按设计报红,
接住它的是集成槽 W119 事后补的那次 `ccc419e`(提交标题直白写着"补目录索引行 + 份数/FLOOR 按合入后 live 抬到 133")。
判据这一侧完全成立;成立不了的是**流程假设**:索引行由集成槽补,意味着核验槽交上去的分支必然是红的,
而"分支自己绿"这件事在本目录是唯一的自动化验收信号。本槽因此把索引行、份数与 `FLOOR` 都写进**同一个提交**。

### 2.3 治理面注册表直读(不读文档,直接 `require`)

| 口径 | 取数 | live |
|---|---|---|
| 短名单条数 | `Skills.list().length` | 30 |
| `pending` | `Skills.list()` 逐条 `pending` | 0 条 / 0 面 |
| 校验项 | `Object.keys(Skills.CHECKS).length` | 17 |
| 就绪检查面表 | `Skills.preflightStages()` | 7(`script,subjects,eps,shots,gen,review,film`) |
| 缺口索引 | `Object.keys(Skills.gaps()).length` | 20 |
| 知识库条目 | `Object.keys(Knowledge.SECTIONS).length` | 18 |
| 注册表提示词 | `Prompts.list().length` | 41 |
| 编排投影 | `Skills.playbooks().length` | 5 |

`playbooks()` 的五个 id:`core.playbookProjection` / `eps.frontPipeline` / `review.reviseLoop` /
`review.memoryFeedback` / `film.produceProjection`。八个数与任务给的治理面参考逐个一致。

---

## 3. 主线贯通:十三态 live 走查

不读文档,直接构造一个项目,按剧本 → 主体 → 分集 → 分镜 → 生成 → 审片 → 成片逐步推进,
每一步同时取 `Domain.workflow`、`Domain.episodeState` 与 `Issues.collect` 三处的读数。

### 3.1 走查表

| # | 项目状态 | 主线卡在 | 推荐动作 | 分集 status | 分集 blockers | 问题中心 kind |
|---|---|---|---|---|---|---|
| 0 | 空项目 | `script` | `script` | — | — | **(空)** |
| 1 | 有剧本 | `subjects` | `subjects` | — | — | **(空)** |
| 2 | 主体无图 | `subjects` | `subjects` | — | — | `subject-no-image` |
| 3 | 主体有图 | `eps` | `eps` | — | — | **(空)** |
| 4 | 建集、正文空 | `shots` | `shots` | `blocked` | `no-script`+`no-shots` | `no-script` |
| 5 | 有正文 | `shots` | `shots` | `ready` | `no-shots` | `no-shots` |
| 6 | 有分镜 | `gen` | `gen` | `ready` | — | `no-review`,`unconfirmed`,`shot-stable-lexicon` |
| 7 | 一镜失败 | `gen` | `gen` | `blocked` | `failed-shots` | `failed-shots`(高危排前) 等 4 条 |
| 8 | 全部出片 | `review` | `review` | `needs_review` | `unconfirmed` | `no-review`,`unconfirmed`,… |
| 9 | 全部确认 | `review` | `review` | `ready` | — | `no-review`,… |
| 10 | 审片低分 | `review` | `review` | `needs_human` | — | `low-review`,… |
| 11 | 审片达标 | `film` | `compose` | `ready` | — | `shot-stable-lexicon` |
| 12 | 已合成但输入指纹不匹配 | `film` | `compose` | `stale` | `composed-stale` | `composed-stale`,… |

`D.workflow` 一共 11 步:主线 7 步 + 支线 4 步(`prod` 制片 / `director` 导演 / `shell` 剧壳 / `clips` 切片),
支线一律 `side: true` 且不参与 `recommendedAction` 的"首个未完成步"选取。走查十三态里支线一次都没有夺走主线焦点。

状态机本身逐态自洽:四态优先级(`blocked` → `running` → `stale` → `needs_review` → `needs_human` → `ready` → `done`)
在第 7/8/10/12 态各命中一次,`D.REVIEW_MIN = 7` 与发布门 G3 的可配阈值分开(G3 默认同为 7 但读 `releaseMinReviewScore`),
`reviewStale` 时 `reviewAvg` 恒为 `null` 故"判旧"与"低分"三态互斥——这几条都实测成立。

### 3.2 断点码三张表:问题中心在主线前三步是零投影

把三处的码集直接取出来比:

```
Domain 断点码(13):composed-stale, failed-shots, low-review, no-episode, no-eps, no-review,
                   no-script, no-shots, no-subjects, review-stale, shots-stale, stale-shots,
                   subjects-no-image
Issues  kind(18):caption-unreadable, composed-stale, eps-payoff, eps-structure, failed-shots,
                   low-review, no-review, no-script, no-shots, review-stale, script-craft,
                   shot-size-linkage, shot-stable-lexicon, shots-stale, stale-shots,
                   subject-inconsistent, subject-no-image, unconfirmed
只在 Domain 有:no-episode, no-eps, no-subjects, subjects-no-image
```

四条差集逐条看:

- `no-episode` — `episodeState` 的入参保护分支(`ep` 为空),不是主线断点,不需要投影。
- **`no-eps`** — 真断点,零投影。实测:剧本齐、主体齐、零分集的项目,
  `Issues.collect` 返回 **0 条**、`Issues.count` 返回 **0**,而同一状态 `Domain.workflow`
  给出 `eps=no-eps` 与推荐动作 `{key:'eps', label:'新建分集'}`。
- **`no-subjects`** — 真断点,零投影。问题中心只有 `subject-no-image`(有主体但缺权威图),
  "一个主体都没提取"这一态在问题中心看不见。
- **`subjects-no-image`** — 有投影,但**两侧的码字面不同**:`Domain` 写 `subjects-no-image`(复数),
  `Issues` 写 `subject-no-image`(单数)。任何按码对齐两侧的消费方都会把它算成缺口。

根因在结构上,不是漏写:`Issues.collect` 的主体是 `episodes.forEach(...)`,项目级只补了一条 `subject-no-image`。
项目还没有分集时循环体一次都不进,于是"零分集 = 零问题"。
主线七步里的前三步(剧本 / 主体 / 分集)恰好是分集还不存在的那三步。

**没有任何断言钉住"`Domain` 的主线断点码是 `Issues` kind 的子集"。**
现有的双端单源断言钉的是"Node 无 window 与浏览器沙箱对同一脏夹具 kind 集合全等",
那是同一份投影的两端一致,不是 `Domain` 与 `Issues` 之间的一致。

### 3.3 `Domain.workflow` 的审片步与 `Issues` 的门槛不同

第 4/5 态里 `workflow` 的 `review` 步已经挂着 `no-review`,而那时该集还没有正文 / 还没有拆镜;
`Issues.collect` 在同一状态早退(`no-script` 或 `no-shots` 之后 `return`),一条审片相关的都不报。

后果有限——`recommendedAction` 取的是"首个未完成的主线步",第 4/5 态都正确落在 `shots` 上,
故这只是展示噪音,不改推进决策。但它是同一个断点在两处有两套门槛,而两处都对外(流程条读 `workflow`、
问题中心读 `Issues`),口径差异没有判据。

### 3.4 发布门:两处

`js/release-core.js` 的 headless 七门实测(`g1-workflow`,`g3-review`,`g4-stale`,`g5-unconfirmed`,
`g6-failed`,`g9-subjects`,`g10-billing`),齐备项目 `cond-pass`、`G10` 仍 warn——与文档一致。两处新发现:

**(a) G1 未过门时的回执文案是坏的。** 构造一个只有 G1 不过的项目(未合成成片,其余六门全 pass),
`G1` 的 `info` 实测是:

```
第1集(ready:undefined)
```

`undefined` 那一段本该是推荐动作。收集侧写的是 `blockers.push({ ep, status, action })`,
渲染侧取的却是 `b.label`——这个键在 blocker 对象上不存在,故永远是 `undefined`。
应取 `b.action`。这只影响 `info` 串,不改任何门的 `status`、不改 `fails`/`warns` 计数、不改 `overall`。
**本槽按"核验槽不动发布门文件"的纪律没有改它,只在此登记。**

**(b) `gates()` 在 `opts.Domain` 漏注入时是 fail-open 的。** 同一个项目,只把 `Domain` 参数拿掉:

| | `overall` | `fails` | `warns` | G1 |
|---|---|---|---|---|
| 注入 `Domain` | `fail` | 1 | 1 | `fail` — `第1集(ready:undefined)` |
| 漏注 `Domain` | **`warn`** | **0** | 2 | `warn` — `Domain 异常:Cannot read properties of undefined (reading 'episodeState')` |

`catch` 分支把一门 `fail` 降成了 `warn`。**发布不会被放行**——`PASS_OVERALL` 是 `['pass','cond-pass']`,
`warn` 与 `fail` 同样过不了 `passed()`,两种情形 `precheck` 都回 `gate-blocked`。
所以这不是门禁绕过,是**门禁回执失真**:`brief().blockers` 里 G1 那条的 `status` 从 `fail` 变 `warn`、
原因从"第 1 集还没合成"变成"Domain 异常",`score` 两边都是 8 故连分数都看不出差别。
`tests/unit.js` 里 `release-core` 那三条用例全部显式注入 `Domain`,这条降级路径**零断言**。

判据方向本应是 fail-close(判不了 = 不许过)。本槽同样不改,只登记。

### 3.5 中段流程模板的覆盖面

`FlowTpl.stages()` 实测 `["subjects","eps","shots","gen"]`,`segments()` 多一个 `mid` 全段;
投影出的九步里 `episode.smartReview` 与 `episode.compose` 的 `stage` 是 `null`——
审片与成片**有意不在中段**,这一点有专门用例钉着(`flow · flow-tpl · 中段登记与主线全链投影逐步对齐`)。
剧本步不在中段则是因为"上传剧本"没有对应领域命令,不是漏登记。

---

## 4. 缺口面 live 核实

### 4.1 G-11 — 蒸馏仍是人手;而"人手"这条路只有浏览器一条

现况比记账里那句"仍是人手动作"更窄一点,本槽把它量清楚:

- 提示词侧**已经收进注册表**:`Prompts` 里有 `forge.evolveSystem`(`js/prompts.js:241`)。
- 触发侧只有 `js/experts.js` 的 `evolveExpert`,而它是浏览器专用——`U.toast` / `Tasks.start` /
  `U.charge` / `U.refund` / `API.isReady` 一路全在里面。
- **headless 侧零出口**:`cli.js`、`server.js`、`mcp.js`、`js/cmd-registry.js`、`js/commands.js`
  五个文件里 `evolve` 一次都搜不到。

所以 G-11 欠的不止"自动触发",还欠"headless 手动触发"。
W128 补的是预置专家在**浏览器**里的入口(条款落自定义副本、副本记 `from`),那一面确实收掉了;
四端里另外三端一个入口都没有。

SK-26 的「仍欠(G-11)」段**有两条断言钉着**(见 5.4),故这条余量不会被静默摘掉。

### 4.2 G-03 / SK-25 — 低分镜子集已经算出来了,只是没往机器可读的字段上放

`Skills.playbook('review.reviseLoop')` 实测第二步:

```json
{ "cmd": "episode.generateVideos", "args": {},
  "note": "按审片问题修订提示词后只重跑低分镜(shotIds 传低分镜子集)" }
```

`args` 是空的,`note` 明写让调用方自己传。SK-25 的 `note` 也如实写着
"仍靠调用方自己看 lowShots 决定重抽哪几镜——shotIds 子集不由编排层推导"。核实无误。

值得记的是**这个子集在别处已经算出来了,而且就在同一个函数里**。构造一集三镜、审片均分 5.5、
第 1/3 镜低分,`Issues.collect` 实测:

```
low-review    | shotIds= undefined | cmd= undefined | detail= 低分镜:1镜4分、3镜3分
failed-shots  | shotIds= ["s1"]    | cmd= episode.generateVideos
```

`js/issues.js` 里 `low-review` 那条已经算出了 `lows` 数组,但只把它拼成了给人看的 `detail` 文案;
隔着二十行的 `failed-shots` 走的是同一条路,却给了 `shotIds: fs.map(s => s.id)` 加 `cmd`。
两条的差别不在能不能算,在算完往哪儿放。

编排层缺的那一环因此比记账里读起来的更浅:**不需要新的判定逻辑,只需要让 `low-review` 与
`failed-shots` 出同一种形状**,编排层就有得取。收敛次数登记口径是另一件事,那一条仍然是真缺。

`js/plans.js` 那一侧不算缺口:README 明写"需授权或需人工挑选的状态(重拆覆盖/过期镜子集/确认闸/补剧本)
一律出导航步且不预设任何 args",与 SK-05 的 note("args 一律留空:授权位与模式位属调用方决策")同一口径。
低分镜重抽属于要人挑的那一类,计划层不预设是有意的;问题中心给出 `shotIds` 是**供人挑选的清单**,
与"编排层替人决定"不是一回事。

### 4.3 G-13 — 标记不摘;而 `js/api.js` 那处回退实测不可达

`js/api.js` 里剩的两处内联人设是同一句:

```
js/api.js:176   (opt.system || '你是专业助手。')
js/api.js:199   (system   || '你是专业助手。')
```

本槽把全仓的调用点数了一遍:`js/` 下(排除 `api.js` 自身)共 **41 个** `API.chatJSON` /
`API.chatJSONRobust` / `Understanding.chatJSONRobust` 调用点,**逐个都显式给了 `system`**。
唯一一个窗口里看不到 `system:` 的是 `js/understanding.js:8`,那是一行透传封装
(`const chatJSONRobust = opt => API.chatJSONRobust(opt)`),它的调用方都给。
`Object.assign({}, llmOpt, {...})` 那两处(`js/agent.js:498`、`js/agent-global.js:397`)
的 `llmOpt`/`llmOptG` 字面里都写着 `system:`。`cli.js` / `server.js` 一次都不调这两个函数。

结论:**这句兜底在本仓库里没有可达路径**。把它收进注册表不会改变任何一条实跑提示词,
只是把注册表口径补齐(以及给未来新加的、忘了传 `system` 的调用点一个正确的缺省)。

按"标记不摘"的口径,`gaps()['G-13']` 那六个键照旧不动,本槽一个也没摘。
SK-10 / SK-11 的 `note` 里点名这两处的那一段也有断言钉着,同样不动。

### 4.4 SK-04 — 否决维持,判据在本轮仍然成立

SK-04 的 `note` 写的是"生成与合成两步没有可判定的结构化结论可回流",
理由是那两步的判定面都归发布门与问题中心。本槽复核这个理由:

- `release-core` 七门里 `g4-stale` / `g5-unconfirmed` / `g6-failed` 三门确实是素材产出面,
  且三门的计数全部取自 `Domain.episodeState(...).counts`,不是另一份判定。
- `g3-review` 判审片均分、`g10-billing` 判账目,两者都不判素材产出;
  G7 合规不在 headless 七门内。note 里这句门号对照实测无误。
- `WfCore.WF_BOARD` 里没有"生成"/"合成"两步的键,故 W61 那条"`scope` 取 `WF_BOARD`
  故下一轮同一步召回得到"的结构保证在这两步上确实不成立。

否决继续成立,本槽不建议翻案。

---

## 5. 测试合同:五层判据的边界,与本轮量出的两个静默口

### 5.1 现状:哪一层判什么

| 层 | 判据 | 位置 |
|---|---|---|
| L1 精确对账 | README 数字 **等于** live(`assertDocNum`) | `contract` · README 数字对账(四条) |
| L2 契约段自数 | 段里自报的条数 = `SUITES.contract.length` | `contract` · 契约段自报的断言条数 |
| L3 登记形态 | 每条 `report(` 独立成行、调用数 = 行数、名字是就地字面 | `contract` · 集成/冒烟用例数由源码实计 |
| L4 包装禁令 | 块链禁循环 / 禁 `main` 外函数体 / 须裸表达式 / 禁 `for await` | `contract` · 三条(W120 + W124) |
| L5 下限棘轮 | `live >= FLOOR`,四个 `FLOOR` 字面(486 / 130 / 102 / 144) | `contract` · 三套件下限 + 记账件份数 |

四条棘轮**当前余量全部是 0**(unit 486=486、integration 130=130、cli.smoke 102=102、记账件 144=144),
因为 W129 刚把四个字面全部抬到了 live。所以下面这个洞现在是**闭合的、但一加测就打开**。

### 5.2 洞一:`FLOOR` 该抬没抬,零判据——两步变异实测

W129 的记账件已经如实交接了这一条("下限变松是静默的,'该抬没抬'这一路至今零机器判据、只靠人记得")。
本槽把它做成一个完整的两步实证,量清楚**松一格到底能换回什么**。

**第一步:加一条无关用例。**

在 `contract` 套件里插一条 `{ name: 'W130 探针…', fn() { assert(true, 'probe'); } }`,不动任何别的东西:

```
===== 485/487 PASS, 2 FAIL =====
FAIL | contract · README 数字对账:单元测试用例数由 tests/unit.js 实计
      | 单元测试用例数:README.md 与实测不符(实测 487,文档 486)
FAIL | contract · README 数字对账:契约段自报的断言条数由 SUITES.contract 实计
      | contract 套件断言条数:README.md 与实测不符(实测 105,文档 104)
```

**红的两条全是 L1/L2 精确对账,L5 一声不吭**(`487 >= 486` 成立)。把 README 的两个数改成 487 / 105:

```
===== 487/487 PASS, 0 FAIL =====
```

全绿。此刻 `FLOOR` 仍是 486,棘轮**余量 = 1**,而没有任何一条用例说得出这件事。

**第二步:在这个余量上真删一条既有用例。**

删掉一条真的、跑得动的用例(`flow · flow-tpl · 文本渲染是同一份模板换载体…`,839 字符整块删除),
再把 README 的单元数字改回 486:

```
===== 486/486 PASS, 0 FAIL =====
```

**全绿。** L1 满意(486 = 486)、L5 满意(486 ≥ 486),一条真用例就这么没了。

棘轮把第一步攒下的那一格原样还给了删测。这就是"松一格"的确切代价:
**`FLOOR` 每落后 live 多少条,就等价于预先批准了删掉多少条真用例。**

W105 当年把它写成 `>=` 而不是 `==` 有明写的理由(`==` 会让每加一条用例都当场红,等于再造一个要人工同步的数)。
本槽不主张改成 `==`——README 的数字已经被 L1 精确钉住了,加测的槽本来就必须改一次 README;
真正缺的是**在同一处顺手校一次 `FLOOR`**。第 8 节给出两条不需要重造人工同步点的做法。

### 5.3 洞二:静态点数只守住了一向

L3/L4 那五条的设计意图在源码注释里写得很清楚——防的是"一处静态登记点跑出多条"(循环、helper、
不带花括号的箭头体、`for await`)。**反方向没有判据:一处静态登记点跑出零条。**

**先试同一行的写法**(在 `tests/integration.js` 最后一条 `report(` 前面加 `if (process.env.W130_NEVER) `):

```
FAIL | 集成测试:每条用例须是独立一行的 report(...) 调用 | 期望 129,实际 130
FAIL | 集成测试:report(...) 须是裸表达式语句 | tests/integration.js:681 语句前缀「if (process.env.W130_NEVER)」
FAIL | 三套件用例数不得少于 130(实测 129)
```

三层同时接住——同一行有语句前缀,L3 的 `^[ \t]*report\(` 点不到它,行数掉到 129。判据成立。

**换成块写法**(把那条 `report(...)` 原样搬进 `if (process.env.W130_NEVER) { … }` 的花括号里):

```
node tests/unit.js contract   →  ===== 104/104 PASS, 0 FAIL =====
node tests/integration.js     →  ===== 129/129 PASS, 0 FAIL =====
README.md                     →  「扩至 130 项断言」
```

**全绿,而套件自己在收尾那一行印的是 129。** 逐层看为什么每一层都放行:

- L1 对的是**静态点数**(`^[ \t]*report\(` 数出 130),不是套件自己印的那个数。两者本轮第一次分叉。
- L3 的行数与调用数都还是 130,`report(` 仍然独立成行、名字仍是就地字面。
- L4 的块链上多出来的那层是 `if (…) {`,`isFuncBody` 按 `CTRL` 词表把 `if` 排除掉了(排除是对的,
  否则所有 `if` 包着的 `report` 都会误报),循环词表与 `for await` 那条更点不到。
- L5 看的也是静态点数 130,`130 >= 130`。

这个洞比洞一更贴近"假绿"的原始定义:**README 上写的 130 与真跑出来的 129,两个数第一次可以长期不等而全绿。**
它也解释了 L1 那条注释里的一个隐含前提——"静态点数与实跑数的一致性靠'每条 report 独立成行'守住"
只在一个方向上成立。

`tests/e2e.js` 一直在对账与下限之外(它按 tab 列表循环登记),那是明写的例外,不算这一路。

### 5.4 `Skills` 的「仍欠」段:SK-25 那一段零断言

本目录一直把各 SK 的「仍欠」段当作缺口的第二份记录(第一份是 `gaps()`)。
本槽逐条把「仍欠」段整段抹掉,看有没有断言接住。A/B 对照最干净的一对:

**SK-26 的「仍欠(G-11)」——抹掉当场红两条:**

```
===== 484/486 PASS, 2 FAIL =====
FAIL | contract · 专家工坊两步人设(源级) | SK-26 的仍欠段应仍如实写着 G-11 的人手点自进化
FAIL | memory  · SK-26 记账与实况同步   | note 须点名仍欠的自进化面(清 pending 不等于这条没有余量)
```

**SK-25 的「仍欠(G-03)」——整段抹掉:**

```
===== 486/486 PASS, 0 FAIL =====
```

一条不红。全仓搜 `reviseLoop` / `SK-25` 在 `tests/unit.js` 里只有两处命中,一处是注释、
一处钉的是 `cmds` 里有没有登记 `project.release`,都与「仍欠」段无关。

所以 **G-03 这条缺口目前只有 `gaps()` 那个键在记,SK-25 的文字描述可以被静默删掉**。
这与 SK-04 / SK-10 / SK-11 / SK-26 四条形成对照——那四条的「仍欠」段都有断言按字面钉着。
差别不在重要性,在于那四条各自都有一个槽专门为它写过断言,而 SK-25 没有。

### 5.5 本轮**成立**的那几层(不重复周期 8 的过程)

以下逐条在 `2f6880c` 上原样重跑过,判据全部按设计报红,与各槽自述一致,不再展开:
L1 三个方向(改小 / 改大 / 改写那句散文各红一条,第三条走"找不到该数字表述"故与写错数可分)、
L2 契约段自数、L4 的四条分工(循环 / helper 花括号 / 单表达式箭头 / `for await` 各红各的,报错不混)、
重名判据(名集大小 = 登记行数,是 multiset 与 set 两个数分开钉,不是 `sort -u` 之后再比)、
索引完备性的三层(逐份点名 / 相对链接不悬空 / 份数三方对齐 + `FLOOR`)。

---

## 6. 合入纪律复盘

### 6.1 八次功能槽合入:三项禁令零违规

周期 9 的八次 feature 合入(`2aaf422` W114、`8942d6c` W115、`ec137aa` W113、`67406db` W120、
`b60223f` W121、`b52e326` W124、`4a01a11` W126、`00cf2f8` W128),逐次机检:

**禁令一 · `git checkout --ours README`。** 判据:对 `README.md` / `docs/skills-wave/README.md` /
`tests/unit.js` 三个文件,若对侧相对 merge-base 改过而合并结果与第一父逐字节相同,即判"整文件取了 ours"
(反向同理判 theirs)。**八次 × 三文件 = 24 次检查,零命中。**

**禁令二 · 合入时 `git checkout <old> -- .`。** 两条判据:
合并提交的树是否等于某个祖先的树;以及第一父相对 merge-base 改过的文件里,有没有在合并结果中被退回 merge-base 内容。
**后者零命中**(没有任何文件被回退)。前者有两次命中——`2aaf422`(W114)与 `00cf2f8`(W128)的树等于第二父的树,
但这两次恰好是 `merge-base == 第一父` 的情形(见 6.2),`--no-ff` 合一条已经包含第一父全部历史的分支,
树等于对侧树是必然结果,不是回退。W117 与 W129 的记账件都记过这个形状,本槽只作确认。

**禁令三 · 分支漏合。** 遍历远端全部 `w1NN-*` 分支,逐条 `git merge-base --is-ancestor <branch> 2f6880c`:
**零条未合入**。周期 9 收尾时集成线上没有任何悬空分支。

### 6.2 基线新鲜度:八次里只有两次叉在最新 integration HEAD 上

| 合并 | 被合入支 | 叉点落后当时集成 HEAD | 形态 |
|---|---|---|---|
| `2aaf422` | W114 `c692d6a` | **0** | `merge-base == 第一父`,本可快进 |
| `8942d6c` | W115 `2f98d91` | 3 | 真三方 |
| `ec137aa` | W113 `b58a21b` | **14** | 真三方 |
| `67406db` | W120 `047ee3d` | 4 | 真三方 |
| `b60223f` | W121 `0ec60b5` | 8 | 真三方 |
| `b52e326` | W124 `64b3010` | 4 | 真三方 |
| `4a01a11` | W126 `e8e5142` | 4 | 真三方 |
| `00cf2f8` | W128 `0b8329b` | **0** | `merge-base == 第一父`,本可快进 |

"feature 必须从最新 integration HEAD 叉"这条纪律**实际执行率是 2/8**;落后 14 个提交的那次(W113)
正是 2.2 节里分支 tip 自己红着的那一支——它叉出去的时候索引表里还没有后来那几行,
份数与 `FLOOR` 也都是旧的,于是它算的每一个数在合并后都不成立。

这条纪律**没有被违反成事故**,是因为集成槽每一次都执行了另一条补偿动作:
"份数 / `FLOOR` / 条数按合入后 live 重取"。八次合并的提交标题里有五次直接写着这句话。
换句话说,**纪律靠的是集成侧的补偿,不是 feature 侧的遵守**;
补偿是人工的,而它要修正的正是 5.2 那类"两侧都算得出一个数、合并后那个数不成立"的形态。

### 6.3 相对 `master`

```
origin/master ................ 9adcf0f
ahead  (master → w129) ....... 425 提交
behind (w129 → master) ....... 0 提交
diff ......................... 199 文件,+45686 / −937
```

`master` 侧零提交,故没有分叉风险,但积压是**九个周期一件未合**。
按变更量排前几位的:`tests/unit.js` +7020、`js/skills.js` +1523(新文件)、`js/wf-core.js` +682、
`cli.js` +408/−112、`server.js` +295、`tests/integration.js` +258、`tests/cli.smoke.js` +237、
`js/flow-tpl.js` +212(新文件)、`js/prompts.js` +210、`js/domain.js` +167、`js/issues.js` +165/−115、
`js/release-core.js` +160(新文件)。

`master` 自己的实测是 unit 201/201、contract 16/16、integration 79/79、cli.smoke 51/53——
那 2 项失败与集成线上的 2 项逐字相同,故这两项是 `master` 就带着的,不是这条线引入的。

---

## 7. 阻塞汇总(按严重度)

**高 · A1 — 下限棘轮"该抬没抬"零判据。** 见 5.2。两步实测:加一条 → 只有 L1/L2 红,补完 README 全绿;
在那一格余量上真删一条既有用例 + README 同步改小 → 486/486 全绿。
当前四条棘轮余量都是 0,故这是一个**下一次加测就打开**的口,不是现在已经张着的口。
四个 `FLOOR` 字面分散在 `tests/unit.js` 的两条用例里(486 / 130 / 102 与 144)。

**高 · A2 — 静态点数只守住"静态 < 实跑"一向。** 见 5.3。一条 `report(...)` 搬进
`if (环境变量) { … }` 块:`contract` 104/104 全绿,`integration` 实跑 129/129,README 写 130。
L1 对的是静态点数、L3 的三个口径全不变、L4 的 `CTRL` 词表按设计排除 `if`、L5 看的也是静态点数。
五层无一接得住。这是本目录第一次量出 README 与实跑数可以长期不等而全绿。

**中 · B1 — 问题中心在主线前三步零投影。** 见 3.2。零分集项目 `Issues.collect` 返回 0 条,
而主线明确卡在 `no-script` / `no-subjects` / `no-eps`。以问题中心为唯一入口的三个消费方全盲。
没有断言钉住"`Domain` 主线断点码 ⊆ `Issues` kind"。

**中 · B2 — 同一断点两个码。** `Domain` 的 `subjects-no-image` 对 `Issues` 的 `subject-no-image`。
单复数之差,按码对齐即漏。

**中 · C1 — 发布门 G1 未过门时回执恒印 `undefined`。** 见 3.4(a)。`b.label` 应为 `b.action`。
只影响 `info` 串,不改判据与计数。真实 bug,本槽按纪律未改。

**中 · C2 — `gates()` 漏注入 `Domain` 时 G1 fail-open。** 见 3.4(b)。`fail` 降 `warn`、
`fails` 1→0、原因串被换成"Domain 异常"。不放行发布(`warn` 同样过不了 `passed()`),
但门禁回执失真且零断言。判据方向应为 fail-close。

**中 · D1 — SK-25 的「仍欠(G-03)」段零断言。** 见 5.4。整段抹掉 486/486 全绿;
同一变异手法在 SK-26 上当场红两条。G-03 这条缺口目前只剩 `gaps()` 那个键在记。

**低 · D2 — G-03 的编排层缺环比记账读起来的浅。** 见 4.2。低分镜子集在 `js/issues.js`
里已经算出来了(`lows`),只落进了给人看的 `detail`;同一函数里 `failed-shots` 出的是
`shotIds` + `cmd`。真正缺的判定逻辑只有"复审不达标时的收敛次数登记口径"这一件。

**低 · E1 — G-11 的 headless 侧连手动出口都没有。** 见 4.1。`forge.evolveSystem` 已在注册表,
触发点只有浏览器一个;四端里另外三端零 `evolve`。

**低 · E2 — G-13 剩的那句兜底实测不可达。** 见 4.3。41 个调用点逐个显式给 `system`。
收编它不改任何一条实跑提示词。

**低 · F1 — "feature 从最新 integration HEAD 叉"执行率 2/8。** 见 6.2。
未酿成事故是因为集成槽每次都做了"按合入后 live 重取"的人工补偿。

**低 · F2 — 核验槽的分支 tip 必然是红的。** 见 2.2。W113 交上去时 468/471,
三条全在索引完备性上,由集成槽事后补行。本槽把索引行 / 份数 / `FLOOR` 写进同一个提交以避开这一条。

---

## 8. 下一目标(建议次序;本槽不执行)

1. **给 A2 补一条判据。** 最省的做法不是再往块链词表里塞词(W124 已经论证过词表追不上写法),
   而是换一个不依赖静态形状的口径:让两个套件在收尾时把自己的实跑总数写进一个约定位置(例如
   `process.env` 之外的一行 stdout 标记),由一条 `contract` 用例起子进程读回来与静态点数比。
   这会把 L1 从"README = 静态点数"升级成"README = 静态点数 = 实跑数",三者一次对齐。
   代价是这条用例要起真实服务子进程,跑不进现在的秒级单测——可以只跑 `integration` 的一个空壳模式。

2. **给 A1 补一条不重造人工同步点的判据。** 两条候选:
   (a) 把 `FLOOR` 从字面改成"README 里那个数减零"——即 `FLOOR` 直接读 README 的声明数字,
   判据变成 `live >= readmeNum && readmeNum >= 上一版 readmeNum`,而"上一版"从 `git` 取不到,故这条不成立;
   (b) 更简单:**让 `FLOOR` 与 live 的差额本身进对账**——加一条断言 `live - FLOOR <= 0`,
   即恢复成 `==`,但只对 `FLOOR` 那一侧报错文案改成"加了用例就把下限抬到 N"。
   这与 W105 当年拒绝 `==` 的理由不冲突:W105 拒的是"再造一个要人工同步的数",
   而现在 README 那个数**已经**必须人工同步了,`FLOOR` 只是跟着它走,不是第二个独立的数。

3. **B1/B2 收口。** 给 `Issues.collect` 补项目级的 `no-subjects` 与 `no-eps` 两条(投影而非新判定,
   状态直接取 `Domain.workflow` 的 blockers),并把 `subject-no-image` 与 `subjects-no-image`
   统一到一个字面。同轮补一条断言:`Domain` 主线断点码集合 ⊆ `Issues` kind 集合(`no-episode` 显式豁免)。

4. **C1/C2。** C1 是一处一 token 的显示 bug,改 `b.label` → `b.action` 即可,不改任何判据;
   C2 建议把 `catch` 分支从 `warn` 改成 `fail`(判不了就是没过),两处同轮各补一条断言。
   两者都动 `js/release-core.js`,应由一个明确授权改发布门的槽来做,不适合顺手带。

5. **D1。** 给 SK-25 的「仍欠」段补一条按字面钉的断言,与 SK-26 那两条同形。
   这是本目录里唯一一条"缺口文字可被静默删掉"的 SK,补齐之后八条「仍欠」段就全有判据了。

6. **D2。** 让 `js/issues.js` 的 `low-review` 与 `failed-shots` 出同一种形状(补 `shotIds`)。
   注意这不等于让编排层替人决定重抽哪几镜——`shotIds` 是**供人挑选的清单**,
   `Skills.playbook` 那一步的 `args` 该不该预填是另一个决定,按 SK-05 现行口径应当仍留空。

7. **合入 `master`。** 425 提交、199 文件的积压已经跨了九个周期。
   `master` 侧零提交故不会越拖越难合,但每多一个周期,一次性合入时要复核的判据就多一层。

---

## 9. 本报告的复核方式

以下命令在 `2f6880c` 上原样跑得出本文所有数字。变异实测一律在改完后立即还原
(`git status` 空树复核),本仓库不留任何变异痕迹。

```sh
# 0. 锚定
git rev-parse origin/cursor/w129-integration-1481   # 2f6880c…
git rev-parse origin/master                          # 9adcf0f…
git rev-list --count origin/master..origin/cursor/w129-integration-1481   # 425

# 1. 逐支现跑(第 2.1 节)。unit 可并行;integration 与 cli.smoke 必须串行(固定端口)
for b in <十九支>; do git worktree add /tmp/wt/$b origin/cursor/$b; done
( cd /tmp/wt/$b && node tests/unit.js | tail -1 )
( cd /tmp/wt/$b && node tests/unit.js contract | tail -1 )
# w113-cycle8-audit-b7d1 应回 468/471 与 95/98,三条 FAIL 全在索引完备性上(第 2.2 节)

# 2. 治理面直读(第 2.3 节)
node -e "const S=require('./js/skills.js');console.log(S.list().length, Object.keys(S.CHECKS).length,
  S.preflightStages().length, Object.keys(S.gaps()).length, S.playbooks().length)"        # 30 17 7 20 5
node -e "console.log(Object.keys(require('./js/knowledge.js').SECTIONS).length,
  require('./js/prompts.js').list().length)"                                              # 18 41

# 3. 主线十三态走查(第 3.1 节):逐步取 workflow / episodeState / Issues.collect 三处读数

# 4. 断点码三张表(第 3.2 节)
node -e "const s=require('fs').readFileSync('js/domain.js','utf8'),
  i=require('fs').readFileSync('js/issues.js','utf8'),
  d=[...s.matchAll(/code: '([a-z0-9-]+)'/g)].map(m=>m[1]),
  k=[...i.matchAll(/kind: '([a-z0-9-]+)'/g)].map(m=>m[1]);
  console.log([...new Set(d)].filter(x=>!k.includes(x)).sort().join(','))"
#   应回 no-episode,no-eps,no-subjects,subjects-no-image

# 5. 发布门两处(第 3.4 节):同一项目注入 / 不注入 Domain 各跑一次 ReleaseCore.gates
#   注入应回 overall=fail fails=1,G1 info 里带 "(ready:undefined)"
#   不注入应回 overall=warn fails=0,G1 info 为 "Domain 异常:…"

# 6. G-13 调用点(第 4.3 节)
rg -c "(API|Understanding)\.chatJSON(Robust)?\(" js/*.js | rg -v "js/api.js"   # 合计 41 处
rg -n "你是专业助手" js/api.js                                                  # 176 与 199 两行

# 7. G-11 headless 出口(第 4.1 节)
rg -n "evolve" cli.js server.js mcp.js js/cmd-registry.js js/commands.js       # 零命中

# 8. 变异 A1(第 5.2 节):插一条 contract 探针 → 485/487 只红两条 L1/L2;
#    README 抬到 487/105 → 487/487 全绿(FLOOR 仍 486);
#    再删一条真用例 + README 改回 486 → 486/486 全绿

# 9. 变异 A2(第 5.3 节):把 tests/integration.js 最后一条 report(...) 搬进
#    `if (process.env.W130_NEVER) { … }` 块 → contract 104/104 全绿,
#    node tests/integration.js 回 129/129,而 README 写着 130
#    (同一条改成同一行前缀写法则三层同时报红,对照见正文)

# 10. 变异 D1(第 5.4 节):抹掉 SK-25「仍欠(G-03)」整段 → 486/486 全绿;
#     抹掉 SK-26「仍欠(G-11)」整段 → 484/486,红两条

# 11. 合入纪律(第 6 节)
#     对八个合并提交逐个比 merge / 第一父 / 第二父 / merge-base 四棵树上的文件哈希:
#     整文件取 ours/theirs 零命中;文件回退 merge-base 内容零命中;
#     merge-base 落后第一父的提交数依次为 0 / 3 / 14 / 4 / 8 / 4 / 4 / 0
for b in $(git branch -r | grep -o 'origin/cursor/w1[0-9][0-9]-.*'); do
  git merge-base --is-ancestor $b origin/cursor/w129-integration-1481 || echo "未合入: $b"
done      # 零输出
```

---

## 10. 本槽的产出边界

本槽**没有改任何产品代码,也没有改任何判据**。
改动只有两处,都是记账:本文件,以及 `docs/skills-wave/README.md` 的索引行与明写份数、
`tests/unit.js` 里记账件份数那一个 `FLOOR` 字面(144 → 145,按本文件落地后的 live 取)。
三套件的 `FLOOR`(486 / 130 / 102)本槽一条测试都没加没删,故原样不动。

第 3.4 节那两处发布门问题、第 5 节那两个静默口、第 5.4 节那条零断言的「仍欠」段,
**全部只登记不修**——按本轮任务口径,核验槽不动发布门文件,也不替下一个槽决定判据该长什么样。
第 8 节给的是建议次序与两条具体做法,不是已落地的东西。
