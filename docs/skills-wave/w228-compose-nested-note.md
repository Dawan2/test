# W228 · 一键成片编排回执吞掉子步 note:live 举证「整趟一步都没跑起来」那一档真静默,最小修一句

**基线**:`cursor/w227-integration-3c8f`(tip `9b81c52`;交接自称的 merge `caccbda` 之后还有一个把份数与
两格下限校到 live 的 `docs` 提交,按 `caccbda` 起手会把 W227 自己那份记账件与两格 `FLOOR` 一起丢掉)。
在飞的 **W226**(`cursor/w226-shot-id-unique-write-*`)按任务口径**一条没碰**。
**范围**:产品面一个文件三行——`js/commands.js`(**+8 −1**:`episode.produce` 成功返回那一句之上加一道
「整趟空跑」判据与一句提升);`tests/unit.js`(+3 条用例、单元 `FLOOR`)、`README.md` 与本目录 `README.md` 数字同步。
**不做**:不碰分镜写入 id 闸;不动 `Domain.emptyBatchNote` 四堆与 `emptySubjectImageNote`;
不改 `ok` / `blocked` 分档;不开第三份 `Domain` note 帮手;不碰 `Commands.digest` 一个字;
不动 W224 那套 `targets` / 审片 note;不碰选人与双扣费;不拆 `Skills.gaps()` 键;不登记 `GUARD_TOPICS`;
`js/produce.js` / `js/domain.js` / `js/plans.js` / `js/pipeline.js` / `js/release*.js` / `cli.js` / `server.js` / `mcp.js` 逐个零 diff。

## 1. 先 live 举证:这一档到底静不静默

沙箱按 `index.html` 顺序加载**真实产品码**:`js/domain.js` + 真 `js/produce.js`(`autoSmartReview` 本体)
+ `js/cmd-registry.js` + `js/commands.js`,发布门那一路另加真 `js/issues.js` / `js/release-core.js` / `js/release.js`。
换掉的只有生成/合成两个引擎与 `U.toast` / `U.bgDock`(一律记数)。
**判空跑一律看引擎实收**(`batchGenVideos` / `reviewShot` / `composeVideo` 真被叫到几次),不看回执上的数字。

### 1.1 第一问:一键成片路径上 `generateVideos` 空跑时,顶层播几句、子步 note 在不在

六档一次跑完(`ui:true`,与页面按钮同参):

| 档 | 顶层 `result.note` | 子步 `steps[].note` | 引擎实收 | 后台面板 | `digest` 播 |
|---|---|---|---|---|---|
| A 全出片 + 成片新鲜(桩审片) | **无** | 生成:「本集没有待生成的镜头,一镜也没跑:2 镜已出片」 | 1 `autoSmartReview` | 0 | **0** |
| B 全出片 + 成片过期 | **无** | 同上 | `autoSmartReview` + `composeVideo` | 0 | **0** |
| C 一镜待生成(EP 卡片入口) | — | — | `reviewShot`×2 + `composeVideo` | 0 | 卡片自己 toast 1 句 |
| D 全定稿 + 成片新鲜(桩审片) | **无** | 生成:「…一镜也没跑:2 镜已定稿」 | 1 `autoSmartReview` | 0 | **0** |
| **F 全定稿 + 成片新鲜(真引擎)** | **无** | 生成:「…2 镜已定稿」<br>审片:「本集没有可审的镜头,一镜也没审:可审的镜需已出片、非终稿」 | **0** | **0** | **0** |
| E 同 F,走 EP 卡片 `oneClickProduce` | — | — | **0** | **0** | 卡片自己 toast「一键成片完成,成片已归档可预览导出」 |

**答案**:子步 note 一直都在(A/B/D/F 四档各有一句,F 档有两句),顶层 `result.note` 一档都没有,
而 `Commands.digest` 只读顶层那一位——**四档全播 0 句**。
`autoSmartReview` 在桩里按收到的镜数报 `targets`(不筛终稿),故 A/B/D 三档看起来还有一次引擎调用;
换真引擎(F 档)后终稿镜被 `!s.final` 筛掉,**三步一步都没起来**:引擎实收 0、后台面板 0、扣费 0,
而顶层回执是 `ok` 且带着旧成片 `url` ——与"真替你重做了一遍"在结构上一模一样。

### 1.2 用户可见入口逐个按一遍:哪个真静默

`episode.produce` 今天有五个入口,只有走 `Commands.digest` 的那两个把话交给命令层:

```
EP 卡片「⚡ 一键成片」(js/produce.js oneClickProduce)  不走 digest,自己 toast「一键成片完成,成片已归档可预览导出」
跑批中心(js/produce.js reallyRun)                      不走 digest,逐集行内印「Ns · 达标x·重抽y·待人工z」
导演助手(js/agent-ops.js cmdDigest)                    不走 digest,聊天流印「全流程完成:generateVideos✓ → smartReview✓ → compose✓」
⌘K 命令面板(js/cmdpalette.js)                          走 digest —— 基线 0 句
发布门 G1「一键处置」(js/release.js execFix)            走 digest —— 基线 0 句
```

后两个真按了一遍(不是推断"理论可达")。发布门那一按整条链现跑:

```
夹具:两镜全定稿 + 均分 5 分(达标线 7)+ 成片已是最新
  集状态 = needs_human(reviewGate = low-review)   成片新鲜 = true
  G1 g1-workflow = fail   fix = { type:'command', cmd:'episode.produce', epid:'ep1' }
  按下去  引擎实收 [] · 后台面板 0 · 顶层 ok = true · 顶层 note = undefined
          子步 = [生成:「…一镜也没跑:2 镜已定稿」, 审片:「…一镜也没审:…」, 合成:无]
          新增 toast []          处置后 G1 仍 = fail
```

按钮喊你处置 → 按下去零反应 → 门禁一字不变 → 下次进来还是这句话。
**三格(回执 `ok` / 引擎实收真 0 / 拦截点自己不说话)全中**,停工条件不成立。

### 1.3 第二问(产品意图):顶层已有成片结果时,子步空跑要不要再播

分两种,本槽只碰后一种:

- **有一步真跑到活**(B 档合成真跑、C 档生成+审片+合成都真跑):引擎自己会说话(合成的任务面板、
  审片的后台面板与完成 toast、EP 卡片的收尾 toast),顶层再提子步那句就是在引擎提示之上刷第二遍。**不播。**
- **整趟一步都没跑起来**(F 档:三步各自空跑、合成原地返回旧成片):没有任何引擎提示可依赖,
  而顶层 `ok` + 旧 `url` 与"真重做了一遍"读不出区别。**这一句必须有出口。**

分界不取"某一步空跑"(那样每次正常成片都要多弹一条「本集没有待生成的镜头」),
取"这一趟一步都没跑起来"。

## 2. 改法:顶层提一句,`digest` 一个字没动

```js
// js/commands.js —— episode.produce 成功返回那一处
const out = ok({ steps, url: c.result.url });
const idle = c.result.fresh && steps.every(x => x.step === 'compose' || (x.result && x.result.note));
if (idle) out.result.note = steps.find(x => x.result && x.result.note).result.note;
return Object.assign(out, { cost: cost(), next: nextOf(p, ep) });
```

**为什么修顶层而不是让 `digest` 认 `steps[].note`**:`digest` 是全部命令的共用出口,让它下钻子步
等于给每一条带 `steps` 的编排命令都开一道播报口,还得在那里判"顶层已有 note 时别再刷一遍"——
一道产品口径的闸装在通用消化器上。顶层这一句只影响 `episode.produce` 自己,
`Commands.digest` 逐字节未改(播报规则仍是"成功档默认静默,唯独 `result.note` 是例外")。

**为什么"提"而不是"拼"**:提的就是子步已有的那一句,不另拼第二句、不改写措辞——
那两句本身各有单源(生成侧读 `Domain.emptyBatchNote` 双端共读,审片侧是 W224 收的命令层一句),
在顶层再拼一遍就是第三份说法。按步序取第一句(生成那句),不把两句串成一条长 toast。

**`fresh` 那一格为什么是判据的一半**:少了它,"前两步空跑、只有合成真跑"那一档(全定稿集的成片过期)
会在合成引擎的提示之上再刷一句——那正是交接明令的"顶层已有说明时别重复播"。
判据现取 `episode.compose` 已有的结构位 `fresh:true`(W210 那道闸的产物),不另写一份"成片新不新"的判法。

**为什么不改分档**:与 W224 同一条纪律——`ok → blocked` 会穿透 `js/plans.js` 的 `execStep`
与跑批的步骤账,整集做完了再点一次不是拦截。`cost`、`next`、`steps` 三位一个没动。

**边角如实登记**:`smartReview` 被参数关掉(`smartReview:false`,跑批与 CLI 才传)时那一步登记的是
`skipped` + `error`、没有 note,`every` 当场为假故顶层不提——那一路的入口(跑批中心)本就逐集印行内状态,
不靠这句话;命令面板与发布门都不传这个位。

## 3. 加测三条(真引擎 + 真命令层 + 真发布门)

| 用例 | 套件 | 钉什么 |
|---|---|---|
| `produce:整趟一步都没跑起来时顶层把子步那句实话提上来` | `commands` | 真 `js/produce.js` 引擎:全定稿 + 成片新鲜一趟——引擎实收 0、面板 0、生成与审片两步各自留下实话、顶层 note **逐字等于**生成那一句、`digest` 恰播 1 句且播的就是回执上那句 |
| `produce:只要有一步真跑到活,顶层就不提子步那句` | `commands` | 三面反证:①两镜真生成(`batchGenVideos` 实收)→ note 恒空、`digest` 0 句;②生成空跑但合成真跑 → 顶层仍不提;③前两步空跑、只有合成真跑(全定稿集成片过期,真引擎)→ 顶层仍不提 |
| `G1 一键处置:整趟一步都没跑起来时按钮按下去有回音` | `release` | 门禁 → `execFix` → 命令层 → `digest` 整条链:低分定稿集 G1 `fail` 且 fix 派的就是 `episode.produce`,按下去引擎实收 0、面板 0、回执仍 `ok`、用户读到**恰一条**回音且说得出「一镜也没跑」;门禁重收仍 `fail`(本条只补回音,一个门槛没动) |

第三条与既有的「G4 一键处置」「G9 一键处置」两条同形(同一把尺子:门上说得清 ≠ 按下去读得到),
夹具在 `loadReleaseFix` 之上再装真 `js/produce.js`——可审镜由 `autoSmartReview` 自己筛,桩不替产品数这一份。

**反事实**:把本槽的 `tests/unit.js` 原样喂给基线的产品码 → **红 2**
(「顶层提的就是子步已有的那一句…实际 undefined」+「用户须读到恰一条回音(基线这里是 0 条)…实际 0」),
而基线自己是 **648/648 全绿**。

## 4. 变异抽查

合完的产品码上现跑,每手先确认变异真落在被测段上,读完红数即还原。

| # | 变异 | 红 | 报在哪 |
|---|---|---|---|
| M1 | 把 `every` 松成 `some`(某一步空跑就提) | **1** | 反面档:合成真跑那一趟顶层多出一句 |
| M2 | 顶层自拼一句(不提子步那句) | **2** | 逐字那条 + G1 那条「回音须说清一镜也没跑,实际:一键成片完成,本集无需重做」 |
| M3 | 提最后一句(不按步序取第一句) | **2** | 同上两条,读出的是审片那句 |
| M4 | 把 `fresh` 判反 | **3** | 正面两条(顶层与回音都恒空)+ 反面第三面(合成真跑反倒多一句) |
| M5 | 丢掉 `fresh` 那一格(只看子步都空跑) | **1** | 反面第三面:全定稿集成片过期时在合成提示之上又刷一句 |

M1/M5 与 M4 是这道闸的**宽窄两向**:前两手是"闸开太宽、真跑到活也说",后一手是"闸装反、该说的不说";
M2/M3 钉的是**说的是哪一句**——自拼一句与提错一句在报错里各印出实际那句话,不靠一条断言两头蒙对。
M5 单独留一手是因为它与 M1 红在**同一条用例的不同面**(M1 红在半空跑那面、M5 红在真引擎全定稿那面),
少了第三面判据这一手会全绿。

## 5. live 数字(全部现跑)

| 套件 | 基线 `9b81c52` | 本槽 |
|---|---|---|
| `unit` | 648/648 | **651/651** |
| └ `commands` 子套件 | 47 | **49** |
| └ `release` 子套件 | 48 | **49** |
| └ `contract` 子套件 | 140 | **140**(未加契约用例) |
| `integration` | 147/147 | **147/147** |
| `cli.smoke` | 107/109 | **107/109** |
| `GUARD_TOPICS` / `TOPIC_FLOOR` | 19 / 19 | **19 / 19**(本槽未登记新主题) |
| `gaps()` 键数 | 20 | **20**(一个键没拆) |
| 记账件份数 | 241 | **242**(含本文) |

`cli.smoke` 两条失败(`未登录 whoami → exit 3`、`llm --json mock 链路`)在 `master`
独立 worktree 上现跑对照(那边 51/53),**同名同表现**,不由本槽引入;分母按 live 点数得 109。
棘轮按 live 抬:`tests/unit.js` 单元 `FLOOR` 648 → **651**、记账件 `FLOOR` 241 → **242**;
`README.md` 的「单元测试(N 项断言」648 → 651;本目录 `README.md` 明写份数 241 → **242**(含本文)。
`integration` / `cli.smoke` 两格 `FLOOR` 按 live 就位、未动。

产品面相对基线只有 `js/commands.js` 一个文件 **+8 −1**,`node --check` 过。
`js/produce.js` / `js/domain.js` / `js/plans.js` / `js/pipeline.js` / `js/issues.js` / `js/issues-ui.js` /
`js/release.js` / `js/release-core.js` / `js/storyboard.js` / `js/sb-views.js` / `js/sb-io.js` / `js/skills.js` /
`js/cmd-registry.js` / `js/cmdpalette.js` / `js/agent-ops.js` / `cli.js` / `server.js` / `mcp.js` **逐个零 diff**——
故 `Commands.digest` 本体、`ok`/`blocked` 分档、两份既有 note 帮手与四堆分档、W224 的 `targets`、
分镜写入 id 闸、选人与计费五件套一个字没动。

## 6. 交接

1. **顶层这句话的分界是"整趟一步都没跑起来",不是"某一步空跑"**。再有编排命令要冒泡子步实话时,
   先按这一节的三格量一遍:这一档回执是不是 `ok`、引擎实收是不是真的 0、这条链上有没有别的文案在说话
   (引擎面板 / 调用方自己的收尾 toast / 行内状态),三格全中才是同一个病。
2. **`digest` 仍然只认顶层 `result.note`**,子步 note 仍然没有通用出口。今天只有 `episode.produce`
   一条编排命令有 `steps`;哪天再来第二条(如项目级批量编排),它得自己在顶层提这一句,
   不要顺手把下钻逻辑塞进 `digest`——那会让每条带 `steps` 的命令都默认多一路播报。
3. **CLI 那一端没有这个病也没有这份提升**:`cli.js` 的 `EXEC['episode.produce']` 把整份结构化回执
   原样打印(子步 note 用户读得到),故本槽有意没在 headless 侧加同一句;两端回执形态本就不同,
   这一句留在浏览器命令层一处,不进 `Domain`。
4. **G1 那一按仍然清不掉门**:低分定稿集的出路是解锁终稿重抽或调阈值,`episode.produce` 跑不动它。
   本槽只保证按下去有回音,**没有**改 `Domain.epFixOf` 派谁——那要连着"低分定稿集该派哪条命令"
   一起定,是处置口径题不是回执题(与 W224 交接第 2 条同一类)。
5. **`smartReview:false` 那一路仍无回音**:审片步登记 `skipped` 没有 note,`every` 判据当场为假,
   顶层不提。今天只有跑批中心与 CLI 传这个位,两处都另有自己的状态面;
   哪天有 UI 按钮传它,这一格得重新量。
6. 在飞的 **W226 一条没碰**,`master` 没合,没有开 PR。
