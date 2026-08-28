# W235 · `shots-dedupe`:存量重复镜头 id 的显式去重命令

基线:`origin/cursor/w233-integration-3d7a` 现取 tip `bb0653f`(先 `fetch` 再 `rev-parse`,命令行里一个 SHA 不从交接文抄)。
在飞的 W232 / W234 一律跳过,不等、不 cherry-pick。

**结论先写:先 live 查过——CLI 24 条命令、MCP 41 条工具里一条 dedupe 都没有,故不停工,落新命令。**
新增 `shots-dedupe <pid> <epid> [--apply]`:默认 dry-run 只报重复面与逐行改名计划、一个字不写库;
`--apply` 才落,首行留原 id、撞车行改发新 id 并回报 `renamedIds`。
引用面(`lastReview.perShot` / `ep.uiSel`)**一个字不动**,这是现跑量出来的结论,不是省事——见 §二。

---

## 一、先 live:有没有已有的 dedupe;不修的话现在跑成什么样

### 1.1 已有出口点名:一条都没有

源码现取(不是读文档):

```
cli.js  CMD 24 条,涉分镜/状态的是:shots-import / shot-set / shot-confirm / gen-shot-image / gen-shot-video / state-get / state-put
mcp.js  hujing_* 41 条,涉镜头的是:hujing_shots / hujing_shots_import / hujing_shot_set / hujing_shot_confirm / hujing_gen_shot_video / hujing_failed_shots
全仓 dedupe|dedup|去重 命中:只在 docs/skills-wave/ 里,且全部指"零吃测比对脚本两侧去重口径"这件不相干的事
```

**没有任何入口是"把存量重复 id 收拾干净"。** W231 §二末点名的两条可修入口(整表重导 `shots-import`、
逃生舱自己改完再灌)都成立,但两条都是**整表覆盖**:前者要用户先把整张表导出来再导回去,
后者要用户自己动手改 JSON。缺的正是"用户主动跑一条命令、先看计划再决定落不落"这一档。故不停工。

### 1.2 现跑那笔双扣费,量到行上

真 `server.js`(临时 `MV_DATA_DIR` / `MV_UPLOADS_DIR` / `MV_CONFIG`)+ 真 `cli.js` 子进程。
先导入三镜 `sh_a`/`sh_b`/`sh_c`,再走逃生舱灌成六行(`sh_a` 三行、`sh_b` 两行、`sh_c` 一行),
并挂上 `ep.uiSel = 'sh_a'` 与 `lastReview.perShot` 三条引用:

```
落库 ids   ["sh_a","sh_b","sh_a","sh_c","sh_a","sh_b"]   唯一数 3 / 行数 6
点名 shotIds:["sh_a"] 跑一次批量
→ blocked unconfirmed「3 镜未确认已跳过」
  skipped: [{"shotId":"sh_a","order":1},{"shotId":"sh_a","order":3},{"shotId":"sh_a","order":5}]
shot-set sh_a --patch '{"plot":"被改的那一行"}'
→ plots ["被改的那一行","B1","A2","C1","A3","B2"]   改的永远是首行
```

一个 id,选人闸按行筛出**三行**;改字段只改得到首行。这就是 W231 §1.3 记的那笔账,
本槽把它量到了"三行"这个具体数上。

---

## 二、判据:去重要不要连引用一起迁

交接给的口径是「不要改 `lastReview`/`uiSel` 引用**除非现跑证明不改就会指错镜**」。现跑了,不会。

在同一份数据上做一次"保首行、撞车行改发新 id"的去重,再拿**同一把尺子**量三处引用落到第几行
(三处的解析语义都是 `find`/`findIndex` 首行匹配:`storyboard.js` 的 `ep.shots.find(s => s.id === ep.uiSel)`、
`domain.js` `reviseTargets` 的 `shots.findIndex(s => s.id === x.shotId)`):

| 引用 | 去重前落到 | 去重后落到 |
|---|---|---|
| `ep.uiSel = 'sh_a'` | 第 0 行 | 第 0 行 |
| `lastReview.perShot[].shotId = 'sh_a'` | 第 0 行 | 第 0 行 |
| `lastReview.perShot[].shotId = 'sh_b'` | 第 1 行 | 第 1 行 |
| `lastReview.perShot[].shotId = 'sh_c'` | 第 3 行 | 第 3 行 |
| `Domain.reviseTargets` 出的 order | `[1, 4]` | `[1, 4]` |

```
去重后 ids ["sh_a","sh_b","sh_new_2","sh_c","sh_new_4","sh_new_5"]  唯一数 6 / 行数 6
去重后点名 shotIds:["sh_a"] → skipped 1 条(order 1);此前是 3 条
```

**理由一句话:首行留的就是原 id,而所有引用本来就只解析得到首行。**
改 id 的那几行,此前任何引用都指不到它们(它们正是 W231 §1.3 里"钱花了什么也没多出来"的那几行)。
故本槽**不迁引用**,范围就是零——不是"暂缓",是现跑判定不需要。
真要哪天迁,请连着"改哪几处、凭什么"一起判,别顺手塞进去(源级判据把这条钉住了,见 §四第 3 手)。

反过来说,这也决定了**首行必须留原 id**:改成保末行(或另发一批全新 id)会让上面五行全部错位。
这一格单独立了判据,变异 2 与 12 各撞一次。

---

## 三、改了什么

### 3.1 `cli.js`(+56 −3):一个辅助 + 一条命令 + 三处文字

`dedupeShotScan(shots)`:一趟扫出 `{ total, unique, duplicates, plan }`。
`duplicates` 逐个报 `{ id, rows, keepOrder }`(重复的是哪个 id、几行、哪一行留原 id),
`plan` 逐行报 `{ order, from, to }`。改名口径与 `shots-import` 那道写入闸逐字同形
(`taken` 集合 + `'sh_' + Date.now().toString(36) + '_' + crypto.randomBytes(4)`,与 `Store.trashRestore` 的 id 冲突改名同形)。

`CMD['shots-dedupe']` 两条路共用这一个扫描:

- 不带 `--apply`:走 `stateGet` 只读,报 `{ applied:false, willRename, duplicates, plan, note }`,**一次写入都不发**;
- 带 `--apply` 且真有重复:走 `withProject`,**落库前按取到的最新那棵树重算一遍**计划(计划以真正要写的那棵树为准),
  逐行改 id,报 `{ applied:true, renamedIds, renamed }`;
- 带 `--apply` 但表已干净:同样走只读那一路返回,**不发空提交**(不拿一次空写冒充"处理过了")。

`note` 把 dry-run 的口径说全,包括一句必须说的实话:
**新 id 每次现发,`--apply` 那一趟发出的与预览不是同一批**(改哪几行、哪一行留原 id 是定的,那个 `to` 串不是)。

计费:**不走 `Tasks.run`、不扣一分钱**——纯改分镜表,零上游零 LLM。也没有上传,故不涉 `U.readAndUpload`。

三处文字:`HELP` 分镜层加一行、`HELP` 逃生舱那行末尾补「要收拾用 shots-dedupe」、
逃生舱那段块注释把这条收拾办法点进去(W231 那段注释原本只点名 `shots-import`)。

### 3.2 `mcp.js`(+1):`hujing_shots_dedupe`

`shots-import` 在 MCP 侧有薄封装,故这条给同等一条(`apply` 布尔位映射 `--apply`),
不做"只 CLI"的处理。工具表 41 → 42。

### 3.3 `README.md`

快速上手代码块加一行;命令总览「分镜」那一格加 `shots-dedupe`;
逃生舱那句「要收拾就整表重导 `shots-import`」改成先给 `shots-dedupe` 再给重导;
API 表 `PUT /api/state` 那行末补「灌进来的存量重复用 CLI `shots-dedupe` 显式收拾」;
两个套件的覆盖面描述各补一段,单元那段把**三条判据成组**的形状写出来
(导入闸设闸 / 逃生舱有意不设闸 / 本命令是存量出口)。

### 3.4 没碰的

选人闸 `ids.has(s.id)` 按行筛一个字未动;`generateVideos` 计费公式未动;
`state-put` 一个字未动(不设闸);`blankShot` 注释那一档未动;`js/commands.js` 的 `episode.produce` 提 note 未动;
`gaps()` 未动;**没有任何静默迁移**——本命令挂不到任何保存路径上,只有用户自己发才跑。
`GUARD_TOPICS` / `TOPIC_FLOOR` 一行未动。

---

## 四、钉测试

`tests/unit.js` **+1 条**(`commands` 套件,紧挨 W226/W231 那两条之后,三条连着读):
`CLI shots-dedupe:存量重复镜头 id 的显式去重出口——默认 dry-run 不写库,--apply 只改够不着的后续行`。
夹具用 `cliDisk`(内存 disk + `stateGet` 现取拷贝,只有真提交才落盘,量得出"写没写"),
四行 `dup/solo/dup/dup` 并挂 `uiSel` 与 `perShot`。六格:

1. **夹具自证**:三处引用此刻落在 `{uiSel:0, perShot:[0,1], revise:[1]}` 上(日后夹具被调成没有辨识力,先红在这句);
2. **dry-run**:提交计数为 0、`applied:false`、`willRename:2`、`duplicates` 逐字等于 `[{id:'dup',rows:3,keepOrder:0}]`、
   `plan` 逐行点名 `2:dup,3:dup` 且 `to` 是真发出来的新 id,库里一个 id 没变;
3. **`--apply`**:恰好提交一次、`renamedIds:2`、行数仍是 4(去重是改 id 不是砍行)、
   首行留 `dup`、`solo` 没被碰、后两行改发新 id、四行四个 id、四行内容逐字未动、
   回执那份改名映射与落库实况逐条对得上、`--apply` 报的重复面与 dry-run 那份逐字相同;
4. **引用面**:`uiSel`/`perShot` 逐字未改,且三处引用去重前后落到**同一行**;
5. **收的正是那笔钱**:点名一个 id,引擎从此只收一行(`__genShots` 实收,不看回执数字);
6. **干净表**:带 `--apply` 也不发写入、`willRename:0`、一个 id 不动。

外加源级四条:命令体不许出现 `Tasks.run|billingAction|charge|operationId`;
写不写库只能由 `f.apply` 一个位决定;两条路都得调同一个 `dedupeShotScan`(现数 `dedupeShotScan(` 出现 2 次);
命令体的**代码骨架**(经 `blankNonCode` 抹掉注释与字面量)里不许出现 `lastReview|uiSel|perShot|groupId`。
再加两条对照面:`shots-import` 那道闸得还在**且真改 id**、逃生舱那段注释得点名本命令。

`tests/cli.smoke.js` **+4 条**(真 server + 真 CLI,接着 W231 那张被逃生舱灌成重复的表往下跑):
dry-run 报计划不写库;`--apply` 首行留原 id 且 `renamedIds:1`;`uiSel`/`perShot` 原样且仍解析到首行;
表已干净时带 `--apply` 不发写入。

`tests/integration.js` **未加**:本命令是 CLI 层的,不新增任何端点;
`PUT /api/state` 那条"不校验"的契约已由 W231 那条钉着,本槽不重复钉。

### 4.1 变异十四手,逐手红在自己那一句

| # | 怎么改坏 | 结果 |
|---|---|---|
| 1 | 默认档也直接写(`--apply` 形同虚设) | 红 1:`dry-run 不许发出任何写入(这条命令的"可撤销"就落在这一格上)` |
| 2 | 改成保末行(首行反倒被改名) | 红 1:`重复的是哪个 id、几行、哪一行留原 id,三样都得报出来` |
| 3 | 顺手迁移 `uiSel`/`perShot` 引用 | 红 1:`ep.uiSel 不许被改写:期望 "dup",实际 "sh_mtdcc42q_f…"` |
| 4 | 给纯改表命令套上计费(留个 `operationId`) | 红 1:`shots-dedupe 纯改分镜表、零上游零 LLM,不许走计费路径` |
| 5 | `renamedIds` 回 0(静默改寻址键) | 红 1:`改发新 id 的镜数如实回报` |
| 6 | 干净表上带 `--apply` 也发一次空提交 | 红 1:`没有重复 id 时带 --apply 也不许发出写入` |
| 7 | dry-run 只给总数不给计划 | 红 1:`计划得逐行点名"改哪一行、原来是什么 id"` |
| 8 | 掏空 `shots-import` 那道闸的躯干(字面全留着) | 红 **2**:W226 自己那条 + 本条的对照面 |
| 9 | 逃生舱注释不点名 `shots-dedupe` | 红 1:`逃生舱那段注释须把这条收拾办法点出来` |
| 10 | 扫描与落库各写一份计算 | 红 1:`--apply 回执报的重复面须与 dry-run 那份逐字相同` |
| 11 | 去重改成删掉重复行 | 红 1:`去重是改 id、不是替用户砍行:一行都不许少` |
| 12 | 不重复的行也重发一遍 id | 红 1:`首行留原 id(引用全靠它继续解析到同一行)` |
| 13 | dry-run 顺手把库也写了 | 红 1:同第 1 手那句 |
| 14 | 扫描退化成一条重复都不认 | 红 1:`三行同 id → 留首行、改后两行,实际:0` |

三手是**先量出来才收紧的**,原样记下来:

- **第 8 手头一版不红。** 对照面照抄 W231 那句写法(查 `taken.has(s.id)` 与 `renamedIds` 两个字面),
  而把闸的躯干掏空成 `if (taken.has(s.id)) { renamed += 0; }` 时两个字面都还在——只红在 W226 自己那条上。
  改成在**抹掉注释与字面量之后**要求 `taken.has(s.id)` 之后真有一句 `s.id = ` 赋值,当场红。
  **这一格顺带是给 W231 那条同形判据留的话:它今天仍是只查字面的那一版。**
- **第 10 手头一版不红。** 源级只写 `/dedupeShotScan/.test(body)`,而 dry-run 那一路的调用还在,
  字面照样命中;行为面当时也没查 `--apply` 回执的 `duplicates`。补上"两条路各调一次"的计数
  与"两份回执的重复面逐字相同"之后红。
- **第 11 手头一版红得不体面**:删行之后 `after.shots[3]` 是 `undefined`,红在一句 TypeError 上而不是判词上。
  补一条行数判据后,红的是`去重是改 id、不是替用户砍行`。

另有一处**演练脚本自己的坑**值得记:头一轮变异脚本的清场写成 `git checkout -- cli.js tests/unit.js`,
把当轮刚收紧、**尚未提交**的判据一并撤了,于是第 10 手"复测"出来仍是 0 红——
量的其实是收紧前那一版。改成先提交判据、清场只碰 `cli.js` 之后复测才作数。
**收紧判据之后、复测之前,先把判据提交掉。**

---

## 五、live 数字(全部现跑,含本文)

| 项 | 基线 | 本槽 |
|---|---|---|
| `node tests/unit.js` | 653/653 | **654/654 PASS** |
| `node tests/integration.js` | 148/148 | **148/148 PASS**(未加用例,复核过) |
| `node tests/cli.smoke.js` | 111/113(两条失败) | **115/117**,失败仍是同名那两条:`未登录 whoami → exit 3`、`llm --json mock 链路` |
| CLI 命令数 | 24 | **25** |
| MCP 工具数 | 41 | **42** |
| 记账件份数 | 247 | **248**(含本文) |

棘轮同轮抬到当轮实况:`['单元测试', 654, …]`、`['CLI 冒烟', 117, …]`、`const FLOOR = 248;`;
`['集成测试', 148, …]` 未动。`README.md` 三处数字同步(单元 654、集成 148、冒烟 117)。
`GUARD_TOPICS` / `TOPIC_FLOOR` 一行未动。
`node --check` 过:`cli.js`、`mcp.js`、`tests/unit.js`、`tests/cli.smoke.js`、`tests/integration.js`。

按用户约定,`node tests/e2e.js` 本槽**未跑**。

---

## 六、交接

1. **镜头 id 唯一性现在是三条判据一组,读的时候要一起读**:`shots-import` 设闸(W226)、
   `state-put` 逃生舱有意不设闸(W231)、`shots-dedupe` 是存量出口(本槽)。
   动其中任一条,先看另外两条会不会跟着红——三条在 `tests/unit.js` 的 `commands` 套件里是连着的三条。
2. **存量重复 id 的"静默迁移"仍然没做,而且本槽之后更不该做**:现在有了显式出口,
   "保存时偷偷改用户的寻址键"这件事的唯一借口(没别的入口)也没了。
3. **引用面零迁移是现跑判定,不是欠账**:§二那张表是判据,`unit` 里那一格
   (三处引用去重前后落到同一行)会一直守着它。哪天真要迁,先证明"不迁会指错镜"——
   现在证明的是反面。
4. **浏览器那一端没有这个入口**。`js/` 下的写入点(`blankShot`/`WfCore.normalizeLLMShot`/节拍板/版本回滚)
   一律走 `Store.uid`,本来就产生不了重复 id(W226 §1.4);
   而存量重复只可能从 `PUT /api/state` 那条路进来,收拾它的入口目前只在 CLI/MCP。
   要不要在分镜工作区也给一颗按钮,是另一个槽的产品判断,本槽不替它做主。
5. **`shots-dedupe` 是逐集的**(`<pid> <epid>`,贴合 `shots-import`/`shot-set` 的形状)。
   "整个项目扫一遍哪些集有重复"目前得逐集跑;真要加 `--all` 那一档,请连着回执形状一起判
   (逐集一份报告 vs 一份合并报告,以及 `--apply` 时的部分失败怎么报)。
6. **同 id 多镜点名一次多扣费这件事本身仍在**(W223 / W229 §9.3 / W231 §6.3 在册):
   选人闸按行筛是对的,本槽一个字没动。本槽改的是"用户现在有办法把表收拾干净",不是把闸改掉。
7. 主体库那一侧的同形口子(`findSubject` 取首行、主体导入路径)照旧没人追,W217 §6.5 在册。
8. 冲突面提示:本槽动的 `cli.js` 是分镜层新增一段 + 逃生舱那段注释与 `HELP` 两处串,
   与 W232 / W234 在飞的改动无交集;`tests/unit.js` 的插入点紧挨 W231 那条用例之后,
   合并时按"两侧各在同一插入点追加一条完整用例"处理;`tests/cli.smoke.js` 的插入点在 W231 那个逃生舱块的末尾。
