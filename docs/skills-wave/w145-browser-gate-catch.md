# W145 · 浏览器发布门 G4/G5/G6 的空 catch:没判过的三门印「0 镜 → 通过」

一句话:`js/release.js` 的 G4(素材过期镜)/G5(未确认镜)/G6(失败镜)共用一次
`Domain.episodeState` 遍历,那次遍历外面兜着一个 `catch (_) {}`——遍历没跑成时
`agg` 停在初值 `{stale:0, unconfirmed:0, failed:0}`,三门照常按这三个 0 印
「0 镜 → 通过」并在交付检查弹窗里各挂一个绿勾。**门禁判据一个字没动**,
改的是"判不出来"这一格:三门同记 `warn` 并点名原因,配两条变异能转红的用例。

W137 收的是 headless `js/release-core.js` 的同一段(缺注入记 `fail`、遍历抛错记 `warn`),
并在交接里登记"浏览器那半仍在";本槽收的就是浏览器这一面,两面**有意不同值**,理由见第 3 节。

## 1. 病灶:三个 0 是初值,不是结论

改之前那段:

```js
const agg = { stale: 0, unconfirmed: 0, failed: 0, noSubjectImage: 0 };
try {
  if (typeof Domain !== 'undefined' && Domain.episodeState) {
    eps.forEach(ep => { …逐集累加 st.counts… });
  }
} catch (_) {}
gates.push(gate('g4-stale', '素材过期镜 = 0', agg.stale ? 'fail' : 'pass', agg.stale + ' 镜素材与当前剧本不一致', …));
```

`agg` 的三个字段有两种来源,而三门读它们时分不出来:

- **真的查过、真的是 0**——项目干净,三门 `pass` 正确;
- **一次也没查**(`Domain` 没加载走 `if` 的假分支 / 遍历抛错被 `catch` 吞掉)——三门照样 `pass`。

第二种情形下弹窗上写的那句「0 镜素材与当前剧本不一致 · 通过」是**一句没有依据的断言**:
它宣称"过期镜查过了,一镜不缺",而实际一镜未查。半途抛出时更坏——`agg` 里攒着抛出之前那几集的数,
三门拿这半截数当整个项目的全量报,数字看起来还很精确。

### 1.1 实测(同夹具,改前 / 改后)

探针按 `index.html` 顺序把 `domain.js`/`issues.js`/`release-core.js`/`release.js` 装进 vm 跑
`Release.collect(p, {online:false})`(未装 `Compliance`/`HumanReview` 桩,故 G7/G8 另各一条 `warn`,
`warns` 的绝对值偏高;下表只看三门与 `overall`):

场景 A —— `Domain` 没加载(等价于 `index.html` 少一个 script 标签):

| | 改前 | 改后 |
|---|---|---|
| `g4-stale` | `pass`「0 镜素材与当前剧本不一致」 | `warn`「Domain 模块未加载,无法校验」 |
| `g5-unconfirmed` | `pass`「0 镜用户未确认最终」 | `warn`「Domain 模块未加载,无法校验」 |
| `g6-failed` | `pass`「0 镜生成失败未处理」 | `warn`「Domain 模块未加载,无法校验」 |
| `overall` / `fails` / `warns` / `blockers` | `warn` / 0 / 4 / 3 | `warn` / 0 / 7 / 6 |

场景 B —— 两集,第一集 `counts` 是 `{stale:2, unconfirmed:1, failed:3}`,遍历到第二集抛错:

| | 改前 | 改后 |
|---|---|---|
| `g4-stale` | `fail`「**2** 镜素材与当前剧本不一致」 | `warn`「校验异常:counts 崩了」 |
| `g5-unconfirmed` | `fail`「**1** 镜用户未确认最终」 | `warn`「校验异常:counts 崩了」 |
| `g6-failed` | `fail`「**3** 镜生成失败未处理」 | `warn`「校验异常:counts 崩了」 |
| `overall` / `fails` / `warns` | `fail` / 3 / 5 | `warn` / 0 / 8 |

改前那三个数(2/1/3)只是第一集的,第二集一集没算——三个数没有一个是全量口径,
而弹窗上它们与真结论长得一模一样。

### 1.2 坏的是回执,不是门被绕过

两个场景改前的 `overall` 都不是 `pass`/`cond-pass`(G1 与这三门读的是同一个
`Domain.episodeState`:`Domain` 没加载时 G1 自己先记 `warn`,加上常在的 G10 那条,`warns` 至少 2 → `overall` `warn`),
**故没有任何一版能靠这个空 catch 把版本打出去**,「📌 打版本」按钮照旧灰着。
和 `w135-g1-receipt-label.md` 同一个判断:这是回执失真,不写成安全洞。

失真面有三处消费方,都在浏览器这一端:

1. **交付检查弹窗的门禁列表**——三行各印 ✅ + `通过` 标签 + 那句「N 镜…」;
2. **项目页 tab 角标**(`badgeHTML` 读 `blockers`)——场景 A 少报 3 项阻塞;
3. **一键处置按钮的载荷**——`fix.shotIds` 取自"首个受累集"的镜头子集,场景 B 里那个子集是从半截遍历里挑出来的。

## 2. 处置:把"判不出来"从初值里分出来

```js
let aggErr = (typeof Domain === 'undefined' || !Domain || !Domain.episodeState) ? 'Domain 模块未加载,无法校验' : null;
if (!aggErr) {
  try { eps.forEach(ep => { …原样… }); }
  catch (e) { aggErr = '校验异常:' + e.message; }
}
if (aggErr) {
  gates.push(gate('g4-stale', '素材过期镜 = 0', 'warn', aggErr));
  gates.push(gate('g5-unconfirmed', '未确认镜 = 0', 'warn', aggErr));
  gates.push(gate('g6-failed', '失败镜 = 0', 'warn', aggErr));
} else { …原样三条 push… }
```

三门写在同一个分支里而不是各补一格,是因为 `agg` 本来就是**一次遍历**算出来的:
分开补会出现「G4 说判不出来、G5 说 0 镜」这种自相矛盾的回执(`w135-g1-receipt-label.md`
第 6 节交接里点过这一条)。判不出来时**不挂 `fix`**——要处置的那批镜头本身就是没算出来的那批。

两句文案不是新造的:`Domain 模块未加载,无法校验` 与 `校验异常:` 逐字取自同文件 G1 那两条分支,
故此后同一页上四门对同一件事的说法一致。

## 3. 为什么浏览器记 `warn` 而 headless 记 `fail`

同一段代码两端不同值,是本槽唯一需要辩护的决定:

| | headless `release-core.js`(W137) | 浏览器 `release.js`(本槽) |
|---|---|---|
| 判据 | `opts.Domain` 有没有传进来 | `typeof Domain` 全局在不在 |
| 说的是 | 调用方**接线错**(Node 里 `require` 永远拿得到) | 页面**模块没加载**(渲染环境降级) |
| 取值 | `fail`(缺注入)/ `warn`(Domain 自身抛错) | `warn`(两种都是) |

`js/release.js` 的文件头写着"所有依赖缺失时安全降级(对应门 warn + '模块未加载')",
同文件 G1/G2/G7/G8 四门缺模块时全是 `warn`——本槽跟着这条既有纪律走,
**不为这三门单开一档**。这也正是"不抬门槛"的落点:三门从"假 `pass`"变成"如实 `warn`",
既有的通过线(无 `fail` 且 `warn` ≤ 1 才 `pass`/`cond-pass`)一个字没动,
`Domain` 在时三门的判据、计数、`fix` 载荷与文案逐字未改(两条用例的第一段守着)。

`w135-g1-receipt-label.md` 第 2.1 节第 3 条已经把这条界划好了,本槽照它执行。

## 4. 变异实测

改完逐条改回去跑 `node tests/unit.js release`,验完还原(`git diff` 只剩本槽改动):

| 变异 | 结果 |
|---|---|
| 整段退回基线(`if (…Domain…) {…} catch (_) {}`) | 红 2 条:`g4-stale 判不出来不得报 pass:期望 "warn",实际 "pass"` + `…遍历抛错时按判不出来记 warn…实际 "fail"` |
| 只把缺模块那格的 `warn` 改成 `fail`(即照抄 headless) | 红 2 条,两条都报 `期望 "warn",实际 "fail"` |
| 只把遍历那个 `catch` 退回 `catch (_) {}`(缺模块那格保留) | 红 1 条:只有第二条用例,`实际 "fail"` |
| 只删缺模块那格守卫(`catch` 保留) | 红 1 条:只有第一条用例,`g4-stale 须点名缺的是什么,实际:校验异常:Cannot read properties of undefined (reading 'episodeState')` |

后两行是这两条用例的**分工证明**:一条守缺模块那格、一条守遍历抛错那格,
单边退回时只红对应那一条,报错文案也不混。

两条用例各自的第一段/末段另钉住"没有顺手抬门":
`Domain` 在时三门仍 `pass`(逐门点名)、门数不变、`overall` 不是 `pass`/`cond-pass`、
`blockers` 计得上、这样的门禁结论进 `stampRelease` 拿到 `gate-blocked`。

## 5. 本槽没做的事

- **不动 headless 那半**。`js/release-core.js` 的同一段是 W137 收的(分支 `cursor/w137-gate-catch-9a2f`,
  已随 W139 合入主干),本槽一行未碰,那两条用例原样全绿。
- **不动 G1**。G1 判的是逐集 `Domain.episodeState`(读 `ep.content`),`p.script` 一个字不读;
  `w110-split-only-script.md` 与 `w112-integration-log.md` 已把这条误记清过两轮,本槽照旧不碰。
- **不动 `js/release.js` 里另外两处空 catch**:`buildReleaseZip` 里 `_buildMaterialShim` 抓分镜文件那处
  (第 3 节 "3) 分镜 CSV/HTML"),失手时打包会少几个文件而 `summary` 不提;以及底部 `Bus.on('*')` 订阅那处。
  两处都不在门禁回执面上,与本槽不同源,**如实登记为仍欠**,见第 7 节。
- **不摘任何 `gaps`**。`Skills` 的缺口表一个字未动(`js/release.js` 对 `Skills` 照旧零引用)。

## 6. 数字(live 现取)

| | 本槽前 | 本槽后 |
|---|---|---|
| `tests/unit.js` 用例数 | 495 | **497**(release 套件 +2) |
| 单元测试 `FLOOR` / 主 README 明写数 | 495 | **497** |
| `tests/integration.js` | 130 | 未动(实跑 130/130 全绿) |
| `tests/cli.smoke.js` | 102 | 未动(实跑 **100/102**) |
| 记账件份数 / 目录 README 明写数 / 记账件 `FLOOR` | 152 | **153**(含本文) |

`node tests/unit.js` 497/497、`node tests/integration.js` 130/130 全绿;
`node tests/cli.smoke.js` 那两项失败是主干既有(「未登录 whoami → exit 3」实得 exit 1、
「llm --json mock 链路」),与 W135 那轮记的是同两条,与本槽改动无关——
发布门那一串(`release-check` 七门结构、基线项目 `overall=fail`、`exec project.release` 的 blocked 与 `--force`)逐条仍绿。
`node --check js/release.js` / `node --check tests/unit.js` 通过。

## 7. 交接

1. **`js/release.js` 还剩两处空 catch**(第 5 节)。打包那处值得看一眼:
   `_buildMaterialShim` 抛错时 `files` 里就少了那一集的分镜表,而 `downloadReleaseZip` 的 toast 只报
   `r.files` 个文件与视频跳过数,分镜少了没人说——形态与本槽同类(失手被吞、回执照常报成功),
   但它在打包路径不在门禁路径,收法是往 `summary` 加一类而不是改门禁结论。
2. **两端"判不出来"取值不同这件事现在有两条用例分别钉着**(headless 那两条要 `fail`,浏览器这两条要 `warn`)。
   下一个人若想把两端统一,得同轮改四条用例并在这里改掉第 3 节那张表——
   不是"改一个字面就过"的改动,这是有意的。
3. **三门共用一次遍历这个结构没变**。`agg` 仍是一次 `eps.forEach` 的产物,
   本槽只是让"这次遍历没跑成"这件事说得出口。真要拆成三门各判各的,
   代价是逐集三倍的 `episodeState` 调用(那是纯推导但不便宜),划不划算下一个人自己判。
