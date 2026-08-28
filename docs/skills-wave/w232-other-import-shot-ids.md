# W232 · 除 `shots-import` 外的镜头 id 写入口现盘:停工位成立

**范围**:`js/wf-core.js`(`W.blankShot` 上方注释 **+5 −0**,零行为改动)、
`docs/skills-wave/w232-other-import-shot-ids.md`(本文)、
`docs/skills-wave/README.md`(份数 + 索引行)、`tests/unit.js`(记账件份数 `FLOOR` 一个数字)。
**基线**:`cursor/w230-integration-9f2e`,**tip 现取 `964da7b`**——W230 那条 merge 提交自称的
`6fa2c09` 不是分支 tip,其后还有一个把份数与两格下限校到 live 的 `docs` 提交(`964da7b`),
按自称那个 SHA 起手会把 W230 自己那份记账件与两格 `FLOOR` 一并丢掉。跳过在飞的 W231(state-put)。

**结论**:**停工位成立**。除 `state-put` / `PUT /api/state`(留给 W231)与 W226 已闸的
`cli.js shots-import`(CLI + MCP 同一条)外,**全仓再没有第二条能把重复 `shots[].id` 写进项目的入口**。
W226 §1.4 那张表是源级自称,本槽**不信自称、逐口现跑**:headless 侧起真 `server.js` + 真 `cli.js`
+ 真 `mcp.js`(stdio JSON-RPC)子进程,浏览器侧起真无头 Chrome 打开真 `index.html`、
把真 modal 一个个点过去,落库 id 清单当场读回来并排印出。故本槽**不设第二道闸**,只记账 +
在双端共用的那一处铸造器上钉一句源级注释。

**不做**:`state-put` / `PUT /api/state` 一字未碰(W231 在做);`episode.produce` 提 note、
`emptyBatchNote` 四堆、`Skills.gaps()` 一字未碰;不做存量重复 id 迁移;
不改选人闸按行筛(`ids.has(s.id)`);不改任何计费笔数;不新增用例、不新增护栏主题。

## 1. 盘点表(全部 live 现取)

判据分两层:**铸造层**(id 从哪来)与**通道层**(外部有没有一条道能把 id 送进来)。
两层都过才算"写不出重复"。

| # | 入口 | 面 | 铸造层 | 通道层 | live 读数 | 会不会重复 |
|---|---|---|---|---|---|---|
| 1 | `cli.js shots-import`(CLI) | headless | `normShot` 里 `raw.id` 透传 | **开**(整表导出改完导回) | 见 §2.1 | **会,W226 已闸** |
| 2 | MCP `hujing_shots_import` | headless | 同 1(薄封装,`build` 只拼 argv) | 同 1 | `renamedIds:2`,落库 6 镜 6 个不同 id | 会,同一道闸挡住 |
| 3 | MCP 其余 37 个工具 | headless | 不写 `shots[]` | 无 shots 载荷入参 | 带数组/对象入参的只 3 个:`hujing_shot_set[patch]` / `hujing_storyboard[shotCount]` / `hujing_exec[args]` | 不会 |
| 4 | `hujing_exec` → 领域命令 | headless | 注册表里没有收 shots 数组的命令 | 数组入参只有 `shotIds` / `subjectIds`(是**读**的点名清单) | `episode.generateVideos[shotIds]`、`episode.smartReview[shotIds]`、`subject.generateImage[subjectIds]`、`episode.generateStoryboard[shotCount]` | 不会 |
| 5 | `shot-set --patch`(CLI + MCP) | headless | — | **关**:`SHOT_PROTECTED` 把 `id` 列为受管字段 | `exit=2 受管字段不允许 shot-set 直写:id` | 不会 |
| 6 | `POST /api/wf/smart-storyboard` | HTTP | `WfCore.normalizeLLMShot` → `blankShot(uid)` | 模型给的 `raw.id` 进不来 | 真跑 `exec episode.generateStoryboard` 落库 `["sh_mtdb1m3nf39569d4","sh_mtdb1m3n3f3e9d27"]` 全不重 | 不会 |
| 7 | `POST /api/state/restore` | HTTP | 不铸造,回放服务端自留快照 | 入参只有一个 `rev` | `code=0`,ids 与快照逐个相同、仍不重 | 不会 |
| 8 | `PUT /api/state` / `state-put` | HTTP + CLI | 调用方给什么写什么 | **全开(逃生舱)** | 本槽未量 | **会 —— W231 在做,本槽不碰** |
| 9 | 浏览器 CSV 导入 `js/sb-io.js` | 浏览器 | `blankShot` → `Store.uid('sh')` | **关**:`CSV_HEADERS` 16 列**无 id 列** | 见 §3.1 | 不会 |
| 10 | 浏览器 文本导入 同文件 | 浏览器 | 同上 | 只解析 `剧情\|运镜` 两段 | 见 §3.2 | 不会 |
| 11 | 浏览器 资产库导入 同文件 | 浏览器 | 同上 | 只读资产的 `name` / `prompt` / `image` | 见 §3.3 | 不会 |
| 12 | 加镜 / 插入 / 切分 `js/sb-views.js` | 浏览器 | 同上 | 无外部输入 | 5000 次铸造去重后仍 5000 | 不会 |
| 13 | 节拍板转分镜 `js/beatboard.js` | 浏览器 | `SB.blankShot`,兜底 `Store.uid('sh')` | 只读节拍帧文本 | 见 §3.4 | 不会 |
| 14 | 分镜版本回滚 `js/sb-llm.js` | 浏览器 | 不铸造,整表换成本集自留快照 | 快照只由本集自己写 | 回滚后 `["h1","h2"]`,不重 | 不会 |
| 15 | 浏览器 LLM 拆镜 / 采用方案 同文件 | 浏览器 | `normalizeLLMShot` → `blankShot` | 模型给的 `raw.id` 进不来 | 灌 `raw.id:"dup"` 两次得两个不同 `sh_*`,透传=false | 不会 |
| 16 | 分镜脚本转换 `js/sb-board.js` | 浏览器 | `blankShot` | 只读场景/节拍文本 | 同 12 一份铸造器 | 不会 |
| 17 | 拉片建集 `js/proj-upload.js` | 浏览器 | `SB.blankShot(i, cfg)` | 行由场景探测生成,无 id 字段 | 同 12 一份铸造器 | 不会 |
| 18 | 导演助手 `insert` op `js/agent-ops.js` | 浏览器 | `mapShotFields` → `blankShot` | 逐字段白名单,`id` 不在名单里 | 同 12 一份铸造器 | 不会 |
| 19 | 官方案例克隆 `js/projects.js` | 浏览器 | 逐镜 `Store.uid('sh')` | 静态夹具 | — | 不会 |
| 20 | 回收站还原 `Store.trashRestore` | 浏览器 | 不铸造,整份搬回删除前的项目/分集 | 只按 `project`/`episode`/`asset` 的 id 判冲突 | — | 不会(搬回的是原本就在表里的那批) |
| 21 | 409 三方合并 `Store._merge3` | 浏览器 | 不铸造 | 两端各自的树 | 输入带重复 id 时输出 `["a","b","c"]` —— 按 id 建 `Map`,**只会收窄不会放大** | 不会 |

**`shot-add` 这条命令全仓不存在**(`rg -n "shot-add\|shotAdd" --glob '!docs/**'` 零命中):
CLI 分镜层只有 `shots` / `shots-import` / `shot-set` / `shot-confirm` 四条,加镜是浏览器按钮(第 12 行)。
**资产包只出不进**:`js/exporter.js` 只有 `exportFilm` / `exportMaterials` / `exportJianYing` / `exportSrt`,
没有任何一条把包读回来的路径,故"资产包导入"这一面不成立;能读资产的只有第 11 行的资产库导入。

### 1.1 全仓 shot-id 铸造点(现取,不是抄 W226 那张表)

```
rg -n "blankShot|uid\('sh'\)|'sh_'" js/ cli.js server.js mcp.js
```

命中 5 个真铸造点,其余全是引用:

| 铸造点 | 谁在用 |
|---|---|
| `js/wf-core.js:629` `id: uid('sh')`(`W.blankShot`) | 上表 9–18 全部经此(浏览器经 `js/storyboard.js:458` 注入 `Store.uid`,服务端 `/api/wf/smart-storyboard` 经 `normalizeLLMShot` 注入 `uid`) |
| `js/beatboard.js:249` `Store.uid('sh')` | 节拍板在 `window.SB` 未就位时的兜底字面 |
| `js/projects.js:48` `Store.uid('sh')` | 官方案例夹具 |
| `cli.js:238` `raw.id \|\| 'sh_' + …` | `shots-import` 唯一透传口 |
| `cli.js:738` `'sh_' + … + randomBytes(4)` | W226 那道闸的改名器 |

`server.js` 里**零** shot-id 字面(`uid('sh')` 一次都没有):服务端要发镜头 id 只有
`WfCore.blankShot` 一条路,双端单一来源这条纪律在镜头 id 这一面是真守住的。

## 2. headless 侧 live 举证

起真 `node server.js`(`MOCK_LLM=1`、临时端口 8171)、真 `cli.js` / `mcp.js` 子进程
(`HUJING_CONFIG_DIR` 隔离)、临时账号 `__w232__` 用完即清。
夹具:`p_w232 / ep_1`,表内先有两镜 `x1`、`x2`。

### 2.1 MCP `hujing_shots_import`:三处撞 id 一次全撞上

`mcp.js` 走 stdio JSON-RPC(`initialize` → `tools/list` → `tools/call`),不是拿 CLI 冒充 MCP。

```
dup.json = [ {id:"x1",…}, {id:"dup",…}, {id:"dup",…}, {无 id,…} ]

tools/call hujing_shots_import {pid,epid,file,append:true}
  → {"episode":"ep_1","imported":4,"total":6,"replaced":false,"renamedIds":2}

落库 ids = ["x1","x2","sh_mtdb1lzr_2052045f","dup","sh_mtdb1lzr_8ac72ec3","sh_mtdb1lzr_5"]
           unique = true
```

`renamedIds:2` 数得住:撞表内已有的 `x1` 改一次、本次第二个 `dup` 改一次,
第一个 `dup` 没撞谁故**留住用户给的 id**,无 id 那行走 `normShot` 自发 `sh_<t>_5`(`base 2 + i 3`)。
MCP 这一条是 `build: i => ['shots-import', …]` 的薄封装,与 CLI 同一道闸、同一份回执。

### 2.2 MCP 工具面:哪些工具够得着 shots 载荷

```
tools/list → 38 个工具
含 state 字样的工具 = []                       ← 逃生舱没有 MCP 出口
带 数组/对象/shot* 入参的工具 =
  ["hujing_shot_set[patch]", "hujing_storyboard[shotCount]", "hujing_exec[args]"]
```

三个自由入参逐个追到底:

- `hujing_shot_set[patch]` 是自由对象,但落到 `CMD['shot-set']` 上先过 `SHOT_PROTECTED`——
  现跑 `shot-set p_w232 ep_1 x1 --patch '{"id":"dup"}'` 得
  `exit=2 {"error":"受管字段不允许 shot-set 直写:id(video 用 gen-shot-video,reviews 用 review-note,配音字段由配音路径写回)"}`;
- `hujing_storyboard[shotCount]` 是个数字;
- `hujing_exec[args]` 通向注册表,而注册表里没有一条命令收 shots 数组(§2.3)。

### 2.3 领域命令注册表:数组入参全是"点名清单",不是写入载荷

现取 `js/cmd-registry.js` 的 `META`,筛出名字带 `shot` 或类型是数组的入参:

```
[{"n":"episode.generateStoryboard","a":["shotCount:number"]},
 {"n":"episode.generateVideos",   "a":["shotIds:array"]},
 {"n":"episode.smartReview",      "a":["shotIds:array"]},
 {"n":"subject.generateImage",    "a":["subjectIds:array"]}]
```

三个 `*Ids:array` 都是**读**侧的点名子集(`ids.has(s.id)` 那一支),一个字都不往表里写 id。
本槽按交接明令**没有碰**这三处的按行筛语义。

### 2.4 服务端智能分镜与快照恢复

```
exec episode.generateStoryboard --args {"pid":"p_w232","epid":"ep_1","shotCount":6}
  → exit=0 {"ok":true,"status":"done","result":{"shots":2,"plans":0},"cost":0}
  落库 ids = ["sh_mtdb1m3nf39569d4","sh_mtdb1m3n3f3e9d27"]   unique=true

POST /api/state/restore {rev:2}
  → code=0  ids = ["sh_mtdb1m3nf39569d4","sh_mtdb1m3n3f3e9d27"]   unique=true
```

再直调服务端真用的那份 UMD(`require('js/wf-core.js')`),把模型自带 id 硬灌进去:

```
WfCore.normalizeLLMShot({id:"dup", plot:"模型自带 id"}, i, …)  两次
  → ["sh_mtdb1ek9_0","sh_mtdb1eka_1"]      透传 = false
WfCore.blankShot(i, cfg, uid) 五次
  → ["sh_mtdb1eka_2" … "sh_mtdb1eka_6"]    id 只来自注入的 uid
```

## 3. 浏览器侧 live 举证

真无头 Chrome + CDP 打开真 `index.html`(临时端口 8172、账号 `__w232b__` 用完即清),
真登录真 `Store.pullState()`,再把 modal 一个个点过去。夹具同样先有两镜 `x1`、`x2`,
**资产库里那件资产的 id 有意就设成 `x1`**——要量的正是"外部 id 会不会被当成镜头 id 用"。

起手 `ids = ["x1","x2"]`。

### 3.1 CSV 导入:每一格都塞 `x1` / `dup`

只桩掉 `U.readFile`(headless 点不出文件选择框),CSV 正文是真的走 `U.parseCSV`,
弹窗里的「选文件 → 勾知晓覆盖 → 确认导入(-2 积分)」三下是真点的。

```
CSV 三行,镜头号/镜头名称两列都写 x1、x1、dup,其余每一格都写 dup
→ 落库 ids = ["sh_mtdb64uszqmyo","sh_mtdb64uscamp6","sh_mtdb64us43bi3"]
```

三行全部改发新 id,`x1` / `dup` 一个都没进来。通道层同轮现取:

```
SB.CSV_HEADERS = ["镜头号","镜头名称","剧情内容","运镜","机位视角","机位角度","景别","光圈",
                  "旁白","台词","出场人物","出场场景","出场物品","图片提示词","视频提示词","时长秒"]
含 id 列 = false
```

第一列「镜头号」是行序不是 id——`openImportCSV` 读的是 `r[1]…r[15]`,`r[0]` 只用来跳表头与注释行。

### 3.2 本地文本导入:正文本身就是已有 id

```
文本框 = "x1|推镜头\ndup|固定镜头\ndup|固定镜头" → 解析并导入(追加)
→ 落库 ids = [ …前三个不变…, "sh_mtdb65hb7s3cz","sh_mtdb65hckpnsg","sh_mtdb65hcfn23f" ]
```

三段追加进去,`plot` 是 `x1`/`dup`,id 三个全新。

### 3.3 资产库导入:资产 id 与镜头 id 撞上

```
资产卡数 = 1   资产 id = x1(与表内第一镜同名同值)
点两轮(同一张卡点两次,导入两镜)
→ 落库 ids 追加 ["sh_mtdb6611gq6kj","sh_mtdb66116ifxt"]
```

两镜各发各的 id;资产那个 `x1` 只被读走 `name` / `prompt` / `image` 三个字段。

### 3.4 节拍板转分镜 / 版本回滚 / 铸造器批量

```
BeatBoard 5 段节拍 → ⇄ 转回分镜表(整表覆盖)
→ ["sh_mtdb6sd0czipi","sh_mtdb6sd01eltv","sh_mtdb6sd0hmjpc","sh_mtdb6sd0wh03o","sh_mtdb6sd09iaea"]

分镜版本历史 → ↩ 回滚此版(那一版是 h1/h2)
→ ["h1","h2"]                          ← 整表换成本集自留快照,不铸造也不重复

SB.blankShot 连铸 5000 次 → 去重后仍 5000
Store.uid 源 = uid(p) { return (p || 'id') + '_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }

WfCore.normalizeLLMShot({id:"dup"}, …) 在浏览器里两次
→ ["sh_mtdb6tlzc8dxt","sh_mtdb6tlzucs6u"]   透传 = false
```

### 3.5 409 三方合并:输入带重复时会不会放大

`Store._merge3` 的 id 数组分支正是 `episodes` / `shots` / `subjects` 递归下去共用的那一支:

```
基线 [a,b] / 本地 [a,b,c] / 云端 [a,b,c]   → ["a","b","c"]
基线 [a,b] / 本地 [a,a,b] / 云端 [a,b,c]   → ["a","b","c"]     ← 重复的那个 a 被并掉了
```

它先按 id 建三张 `Map` 再逐 id 合,同 id 多行**进得去出不来**——这条路只会把重复收窄,
造不出新的重复。(把已有重复"顺手收窄"这件事有它自己的面:它发生在 409 冲突合并时、
不发生在正常保存时,故不能拿它当存量迁移的替代品,如实登记在 §6。)

## 4. 停工判定

交接给的停工条件是「除 `state-put` 与已闸的 `shots-import` 外,再没有能写出重复 id 的入口」。
上表 21 行逐条现跑过,第 8 行归 W231、第 1/2 行是 W226 那道已闸,其余 18 行两层判据都过:
**铸造层**只有 5 个点、其中 4 个是 `uid` 无条件发新;**通道层**没有任何一条外部输入能把 id 送到铸造之后。
故**停工位成立,本槽不设第二道闸**。

按交接的"可选"那一档,只做一件源级的事:在**双端共用的那一处铸造器**上钉一句注释,
把"镜头 id 是唯一寻址键,这里只认注入的 uid,外来 id 的唯一透传路径是 `shots-import` 且它自带闸"
写在代码旁边。`js/wf-core.js` `W.blankShot` 上方 **+5 行注释、零行为改动**——
下一个往 `blankShot` 上加"透传调用方 id"的人会先读到这句。

不钉在 `cli.js` 那边:W226 已经在那道闸上方写了 4 行说明,再写一遍是两份口径。

## 5. 回归数字(live)

| 套件 | 基线 `964da7b` | 本槽 |
|---|---|---|
| `unit` | 652/652 | **652/652** |
| `integration` | 147/147 | **147/147** |
| `cli.smoke` | 107/109 | **107/109** |

`cli.smoke` 的两条失败与 `master` 同名同形——另起 worktree 在 `master`(`9adcf0f`)上现跑,
那边是 51/53、失败的正是 `未登录 whoami → exit 3` 与 `llm --json mock 链路` 这两条。
本槽零新增失败、零新增用例。

产品面只 `js/wf-core.js` **+5 −0**(整段是注释,`node --check` 过);
`cli.js`、`server.js`、`mcp.js`、`js/sb-io.js`、`js/sb-views.js`、`js/sb-llm.js`、`js/sb-board.js`、
`js/beatboard.js`、`js/agent-ops.js`、`js/store.js`、`js/commands.js`、`js/domain.js`、
`js/produce.js`、`js/skills.js`、`js/cmd-registry.js` 一字未改。
治理面零变动:`Skills.gaps()` 键数、`CHECKS`、`GUARD_TOPICS` / `GUARD_TOPICS_CLOSED` /
`TOPIC_FLOOR` 仍 19 / 0 / 19,三套件的用例数与它们各自的 `FLOOR` 一个数没动。

棘轮按 live 抬:记账件 `FLOOR` 245 → **246**、`docs/skills-wave/README.md` 明写份数
245 → **246**(含本份)。根 `README.md` 的功能描述与 API 表无需改动——本槽零行为改动,
`shots-import` 的语义与回执一个字没变。

## 6. 交接

1. **`state-put` 那格仍是这条线上唯一还开着的写入口**。本槽有意没量、一字未碰(W231 在做)。
   要点在于:W226 把 `shots-import` 闸上之后,**存量重复 id 的再生产只剩这一条路**——
   这一格收掉,写入侧就闭合了。
2. **存量重复 id 照旧没有迁移**(W226 §6.1、W229/W230 残留表里都记着,本槽再确认一次):
   全仓零迁移实现。老项目里已经躺着的同 id 两行,点名一次照旧两行都跑、两笔视频钱照收。
   §3.5 那条 `_merge3` 收窄**不能当迁移使**:它只在 409 冲突合并那一刻发生,单端正常保存永远走不到。
3. **选人闸按行筛与计费笔数本槽一字未动**:`ids.has(s.id)` 与 `total = todo.length` 两端四处
   逐字节未改。W223 那笔账(点名一个 id 收两笔钱)在存量表上仍然成立,它的根已由 W226 收在写入侧。
4. **`emptyBatchNote` 四堆的同形口子照旧开着**(W217 §6.3 登记至今):`locked` / `fresh` / `gone` /
   安全阀四堆全从 `hit` 里数,表里同 id 两镜时每一堆都会多算。交接明令不碰,故一字未改。
5. **主体库那一侧本槽同样没走**:`cli.js` 的 `findSubject` 也是取首行、还多认一层按名匹配,
   W217 §6.5 记的"主体库为什么会有同 id 两位"至今没追到源头。本槽只盘了镜头这一侧。
6. **本盘点会随新入口失效**:今天成立是因为铸造点只有 5 个、通道层一条都没开。
   新加任何一个"把外部结构写成分镜"的入口(比如真做一条 `shot-add`、或给资产包补一条导入),
   都得连着两层一起判——§1.1 那条 `rg` 命令与 §3 那套点 modal 的跑法可以原样再跑一遍。
7. **冲突面提示**:本槽只动 `js/wf-core.js` 一段注释与三个带数字的位置
   (`tests/unit.js` 的记账件 `FLOOR`、`docs/skills-wave/README.md` 的明写份数与索引表尾)。
   与 W231(`state-put`)在产品面无交集;**带数字的那三处两侧给的数一个都不是答案**,
   合完得现取 live 再写。
