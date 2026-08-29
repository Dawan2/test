# W261 · 子集审片结果合入全表 `lastReview`:合并收成 WfCore 双端单一来源

基线:`origin/cursor/w260-integration-13d9` **现取** tip `22d9a05`(先 `fetch` 再 `rev-parse`,不抄交接自称)。
分支 `cursor/w261-review-merge-a7c3`,建支后 `rev-parse HEAD` 与 w260 尖逐字节相同。

**结论先写:合并那一段下沉成 `WfCore.mergeReviewPerShot`,两端写回同读一份;
浏览器 `autoSmartReview` 的子集复审从"整表覆盖"改成"按行合并",整表跑一字未变。**

W260 的残留第一条:`js/produce.js` 的 `autoSmartReview` 是**整表覆盖写回**,
命令层用 `shotIds` 点名子集跑它时 `ep.lastReview` 被这一批整份替换,没被点名的行上一轮那条一起没了;
而服务端 `/api/wf/smart-review` 的同一档早有 `prev` 合并(W258 落的按行对位)。两端于是各说各话。
W258 §五 3 给的收法就是本槽做的这一件:把合并抽成 `WfCore` 的纯函数,顺带把写在 `server.js` 里的序数对位搬过去。

**没碰的**:`landed`/`ok` 口径、`state-put` 那道 `need(f.force)`、`Skills.gaps()`(键一条没剥)、
SK-04、达标线 `Domain.REVIEW_MIN`、`Domain.reviseTargets` 与 `WfCore.reviseSubset`、
`reviseRetryLimit` 收敛次数、`TOPIC_FLOOR`/roster/`SLACK`(仍 3);
`js/domain.js`、`js/review.js`、`js/commands.js`、`cli.js`、`mcp.js`、`js/agent-ops.js` **零 diff**;
两端回执字段集与计费口径一个字未动(本槽没新增任何计费点,`Tasks.run` 那一路一行未改)。

---

## 一、先 live:浏览器那一端子集跑完之后,`lastReview.perShot` 剩几条

沙箱按 `index.html` 顺序装真产品码(`domain` → `prompts` → `knowledge` → `wf-core` → `produce` →
`cmd-registry` → `commands`),换掉的只有 `Review.reviewShot` 与生成引擎。
分镜表:`dup`(行0,**已定稿**)、`dup`(行1)、`solo`(行2);上一轮 `perShot` 三条 6 / 9 / 8,`avg` 7.7。
命令层 `Commands.execute('episode.smartReview', { shotIds: ['dup'] })` 现跑:

| | 基线 `22d9a05` | 本槽 |
|---|---|---|
| 本轮可审镜 | 1(行0 定稿审不到) | 1(同) |
| 复审后 `perShot` | **1 条**——只剩本批那一条,行0 的 6 分与行2 的 8 分**凭空消失** | 3 条(6 / 9.5 / 8) |
| 复审后 `avg` | **9.5**(按本批那一条算) | 7.8(按合并后三行算) |

同一份夹具打服务端 `/api/wf/smart-review`(`shotIds: ['dup']`)在基线上就是 3 条、`avg` 按三行算
(W258 那四条集成用例正钉着它)。**两端对同一件事给出的报告差两行**,这就是本槽要收的那一格。

行0 有意挑**同 id 首行**来定稿:序数若在"本轮报告"上数而不在分镜表行上数,行1 会被当成同 id 第 0 行,
于是换掉的是行0 那条、行1 的旧条目反倒留着——两种错法在这一档上给出的缺件各不相同(§三 变异 2 现读)。

### 1.1 为什么不是在 `js/produce.js` 里照抄一份服务端那段

抄一份当场就是第二份口径:合并键(`shotId` + 全表第几行同 id)、"这一行还在不在"那半个判据、
排序键与均分口径四件事各有一份,任一端改了另一端不会红。AGENTS 的双端单源那条也明写禁止两端各抄一份。
故本槽的形状是:**合并函数只此一份,两端各自只留"要不要合并"这一个判断**。

---

## 二、改了什么(`js/wf-core.js` +23、`server.js` +3 −18、`js/produce.js` +9 −3)

### 2.1 `js/wf-core.js`:`W.mergeReviewPerShot(prevPerShot, reports, shots)`

入参与产出:

```
prevPerShot  上一轮 ep.lastReview.perShot;传 null = 整表跑(不合并)
reports      本轮 [{shot, report}](两端形状本就相同:report 带 score/id/videoInputHash)
shots        分镜全表 ep.shots(序数在表行上数,不在本轮那一批上数)
→ { perShot, avg }
```

搬过来的是 W258 写在 `server.js` 里的那三点,一个字没改判据:新条目那侧的 `nth` 在 `ep.shots` 全表上数、
旧条目那侧的 `nth` 在 `prev.perShot` 上数、"这个 id 还在不在分镜表里"那半个判据原样留着。
新加的只有 `avg`——它此前在两端各写一遍(`server.js` 一句、`js/produce.js` 一句),
而浏览器那侧改成合并之后**均分必须按合并后的行算**,再各写一份就是新造的漂移面,故一并收进回执。
`reports` 里的行不在 `shots` 里时 `nth` 取不到,该行按"没有对位"处理(旧条目全留、本轮那条照加),
不静默把它算成第 0 行。

模块内不碰 `window`,环境差异全经参数进(这是 UMD 那条硬约束;函数体里没有 `Store`/`ep` 之外的取数)。

### 2.2 `server.js`:`/api/wf/smart-review` 那 15 行换成一句

```
const { perShot, avg } = WfCore.mergeReviewPerShot(prev ? (prev.perShot || []) : null, reports, ep.shots || []);
```

`prev` 的取法(`subsetIds && ep.lastReview ? ep.lastReview : null`)一个字没动:
共性汇总/四维评审沿用上次那一段仍读它,合并只是多了一个消费点。
`ep.lastReview = {` 那个字面原样留着(`contract` 套件有一条按它定位服务端回流点)。

### 2.3 `js/produce.js`:收尾写回按行合并

```
const batch = shots || ep.shots;
const prevPer = batch.length < (ep.shots || []).length && ep.lastReview ? (ep.lastReview.perShot || []) : null;
const merged = WfCore.mergeReviewPerShot(prevPer, reviewed.map(s => ({ shot: s, report: lastRep.get(s) })), ep.shots || []);
```

三点各有理由:

- **"是不是子集"按本批点名的行数与全表比,不按对象身份比**。命令层给的是
  `picked ? ep.shots.filter(...) : ep.shots`,身份比对在这一处成立,但 `js/sb-gen.js` 那一路
  递来的是刚生成的那一批、调用方换个 `slice()` 就失真;比行数不依赖调用方怎么造那个数组。
  与服务端那侧同档:点名了子集才合并,不点名就是整表覆盖。
- **`shots` 传全表 `ep.shots` 而不是本批**:`nth` 的口径是"第几行同 id",在本批上数会整体错位
  (§一 那句"行0 定稿"正是这一格的读数)。
- **`snapshotHash` 那句的 `window.WfCore &&` 兜底摘掉了**:合并本来就非 `WfCore` 不可,
  留个兜底就等于留一条"没有 WfCore 时另走一份逻辑"的暗路。`index.html` 里 `wf-core.js` 在
  `produce.js` 之前加载,真环境恒在;单测夹具 `loadProduce` 同轮按 `index.html` 顺序补装
  `prompts`/`knowledge`/`wf-core`(此前不装,那句兜底一直在给沙箱兜底而不是给产品兜底)。

`common`/`cut` 仍是那份空壳、`sourceRev`/`graphRev` 两个判旧位、逐镜循环与计费节奏一行未动。
**浏览器闭环子集跑时 `common`/`cut` 照旧被重置成空壳**(服务端那侧是沿用上次)——这一格本槽有意没碰,
见 §五 2。

---

## 三、钉测试(`tests/unit.js` +3 条:`produce` 2 条、`contract` 1 条)

| 落点 | 钉的是 |
|---|---|
| `produce` 新增一条 | 走**命令层** `episode.smartReview` + `shotIds: ['dup']`:三条 `perShot` 一条不少、逐行 `[order, score, reportId]` 逐格对账(行0 留 `q0` 6 分、行1 换成本轮 9.5、行2 留 `q2` 8 分)、`avg` 7.8 按合并后三行算 |
| `produce` 新增一条 | 同一命令层**不带 `shotIds` 全表跑**:上一轮里已定稿的行与已被删的 `gone` 都不许靠旧条目续命,`perShot` 只剩这一趟真审到的那条、`avg` 就是这一份 |
| `contract` 新增一条 | 纯函数按行对位(含"已不在分镜表的行随行丢弃"与"没带版本指纹落空串")+ `prev` 为空时不续命 + **源级单源**:两端都出现 `WfCore.mergeReviewPerShot(`,且两个写回侧都不许再拼 `'#' +` 行键、不许出现 `perShot: reviewed.map`/`perShot: newPer` 这种绕过合并的直写 |

集成侧不加新条:W258 那四条(整集审片三条各带各自 `reportId` / 子集复审首行条目原样留着 / 均分按三行算)
打的就是这条改造后的服务端路径,合并换实现之后它们**必须仍绿**,这本身就是"搬过去没搬坏"的判据。
`tests/cli.smoke.js` 未加(真跑整集审片要真上游);按用户约定 `node tests/e2e.js` 本槽**未跑**。

### 3.1 变异四手,逐手红在自己那一句

| # | 怎么改坏 | 结果 |
|---|---|---|
| 1 | `js/produce.js` 的 `prevPer` 恒 `null`(退回整表覆盖) | 红 **1**(unit):子集那条报「三行条目一条不少:期望 3,实际 1」 |
| 2 | `js/wf-core.js` 新条目那侧的 `nth` 恒 0(改在本轮报告上数) | 红 **1**(unit):子集那条,条数仍是 3 而**换掉的是行0**(实测 `[[1,9,q1],[1,9.5,rv#0],[2,8,q2]]`)——与变异 1 的缺件形状不同 |
| 3 | `js/wf-core.js` 合并退回按 `shotId` 去重 | 红 **4**:unit 2(`produce` 子集那条 3→2 条、`contract` 纯函数那条逐格对账)+ integration 2(W258 那两条:首行 `q0` 不在、`avg=8.1`) |
| 4 | `js/produce.js` 恒合并(整表跑也吃上一轮) | 红 **1**(unit):整表那条报「期望 `[[0,8]]`,实际 `[[0,8],[1,4]]`」——已定稿的行靠旧条目续命 |

方法性的两格:

- **变异 3 的红分落在两个套件里**(浏览器那半在 unit、服务端那半在 integration)。
  这正是"两端同读一份"的形状——只跑 unit 会漏读服务端那半,只跑 integration 会漏读浏览器那半;
  W260 §那条"同一条槽的两半判据分落两个套件"在本槽换了个方向再现:这回是**同一处实现**的两个消费点。
- **变异 1 与变异 4 方向相反**:一个是该合不合(子集丢行)、一个是不该合也合(整表续命)。
  只写子集那条时变异 4 全绿——"合并"这件事的边界得两面各钉一条,不然下一手很容易把它写成恒合。

判据先提交再演练(产品码与提交在前,变异在后),每手跑完从备份还原、`node --check` 清场。

---

## 四、live 数字(全部现跑,含本文)

| 项 | 基线 `22d9a05` 现取 | 本槽 |
|---|---|---|
| `node tests/unit.js` | 673/673 | **676/676 PASS** |
| `node tests/integration.js` | 152/152 | **152/152 PASS** |
| `node tests/cli.smoke.js` | — | **115/117**,两条失败与 `master` 同名同表现:`未登录 whoami → exit 3`、`llm --json mock 链路`(单独整跑,`env -u HUJING_SERVER -u MV_DATA_DIR -u MV_UPLOADS_DIR -u MV_CONFIG`) |
| 记账件份数 | 275 | **276**(含本文) |

棘轮同轮抬到当轮实况:`['单元测试', 676, …]`、`const FLOOR = 276;`;
`['集成测试', 152, …]`、`['CLI 冒烟', 117, …]`、`TOPIC_FLOOR`(19)、`SLACK`(3)未动。
根 `README.md`:单元用例数 673→676、`contract` 那句自报条数 145→146、
`/api/wf/smart-review` 那行点明合并走 `WfCore.mergeReviewPerShot` 双端单源、
「智能审片闭环」那段补浏览器子集复审合入全表的口径。
`docs/skills-wave/README.md` 明写份数 275→276,索引补本文一行。
`node --check` 过:`js/wf-core.js`、`js/produce.js`、`server.js`、`tests/unit.js`。

---

## 五、交接

1. **W260 残留第一条(浏览器子集整表覆盖)本槽收掉**,可销号;
   W258 §五 3 建议的收法(合并下沉 `WfCore`、序数对位一并搬过去)照做了,没有留半截。
2. **浏览器闭环子集跑时 `common`/`cut` 仍被重置成空壳**,而服务端子集复审是沿用上次那份。
   本槽有意没碰:它动的是"闭环要不要做整集共性汇总/四维评审"这件事(那两步在浏览器闭环里根本没跑过,
   写回的一直是空壳,不是"被子集跑弄丢的"),与本槽收的逐镜条目不是同一件;
   要收得先定"浏览器闭环该不该沿用上一轮的集级结论",属产品口径不属寻址。
3. **`js/review.js` 的 `openEpisodeReview` 没进本槽**:它是整集审片(不点名子集),
   写回本就是整表那一档,合并对它是恒等;要不要也改成读 `WfCore.mergeReviewPerShot` 走一遍
   (`prev` 传 `null`)属纯粹的形状统一,没有行为差,本槽按最小改动没做。
4. **`js/review.js` 的 `openEpisodeReport` 按 `find` 取首行**这条展示面降级仍在(W258 §五 4 记的),
   本槽一个字没碰。
5. **同 id 多行的源头照旧没追**(W226、W242、W248、W253、W258 在册)。
6. 冲突面提示:`js/wf-core.js` 只在 `reviewSnapshotHashOf` 与 `buildSumUser` 之间**新增**一个导出
   (前后两个函数一字未动);`server.js` 只改 `/api/wf/smart-review` 里「逐镜分合并」那一段
   (W258 加的 15 行收成 1 行 + 3 行注释);`js/produce.js` 只改 `autoSmartReview` 收尾写回那一块
   (`ep.lastReview = {` 之前新增三行、`avg`/`snapshotHash`/`perShot` 三个字段的右值);
   `tests/unit.js` 的两条 `produce` 用例插在「没审成的那一行不许挂兄弟行报告」之后、
   「quiet 不建 dock」之前,`contract` 那条插在「修订闭环重抽面:`WfCore.reviseSubset`…」之后、
   「修订闭环重抽面单源」之前,`loadProduce` 夹具多装三个文件——合并时按「同一插入点追加」处理。
   与 W258 同样的坑再提一次:注释里出现 `Domain.reviseTargets` 这个标识符会撞 SK-25 那条源级判据,
   本文档不是源码故不受影响,改注释时留意。
