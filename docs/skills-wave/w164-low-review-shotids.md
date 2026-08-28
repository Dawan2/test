# W164 · 问题中心 `low-review` 带上派生 `shotIds` 子集

**范围**:`js/issues.js`(`low-review` 那一条 + 条目字段口径注释)+ `tests/unit.js`(+2 条:`issues` 行为面 1、`contract` 取数口 1)
+ `README.md` 与 `docs/skills-wave/README.md` 数字与描述同步。
**基线**:`cursor/w157-integration-9c4a`(`8507194`)。
**不做**:不改发布门(`sev` 一字未动,G2 数的仍是同一批)、不自动蒸馏、不从 `Skills.gaps()` 摘 `G-03`、
不动 `Skills.playbook('review.reviseLoop')` 那一步的空 `args`(按 SK-05 现行口径仍留空)、
不给这条挂 `cmd`(理由见第 3 节)、不动计划层(`Plans` 对子集位的纪律另有登记)。

## 1. 停工前先举证:这条现在确实不带

`w130-cycle9-audit.md` 第 4.2 节把这一格记成"子集在别处已经算出来了,只是没往机器可读的字段上放",
本槽第一件事是在基线 `8507194` 上把它复现一遍(三镜、审片均分 4.7、第 1/3 镜低分):

```
low-review | shotIds= undefined | cmd= undefined | detail= 低分镜:1镜4分、3镜3分
Domain.reviseShotIds = ["s1","s3"]
```

`js/issues.js` 里那条 `low-review` 自 W131 起就走 `Domain.reviseTargets(ep)`,`lows` 数组现成在手,
却只被拼成 `低分镜:1镜4分、3镜3分` 这句给人看的 `detail`。隔着二十行的 `failed-shots` 走同一条路,
出的是 `cmd` + `shotIds`。**两条的差别不在能不能算,在算完往哪儿放**——审计那句结论本槽实测仍成立,不是停工位。

## 2. 改的是一个字段,收的是一份名单

```js
const lows = Domain.reviseTargets(ep);   // 低分镜面(W131 起就在,本槽未动)
const low = Object.assign({}, base, { kind: 'low-review', … , goto: … });
if (lows.length) low.shotIds = Domain.reviseShotIds(ep);
out.push(low);
```

**取 `Domain.reviseShotIds(ep)` 而不是就地 `lows.map(x => x.shotId)`**:后者恰好就是
`D.reviseShotIds` 的函数体(`js/domain.js`:`ep => D.reviseTargets(ep).map(t => t.shotId)`),
抄到调用侧值一样、口径变了不会跟着走,那正是这一目录反复在收的"第二份"。
`Domain.reviseShotIds` 的注释原话就是「`episode.generateVideos` / `episode.smartReview` 的 `shotIds` 由本函数派生」——
它本来就是给这个字段用的,本槽只是第五个消费点(前四个:服务端回执、CLI `produce` 闭环、助手摘要、审片完成卡)。

派生里已经判了四件事,消费方一件都不用重判:达标镜不进、**已定稿镜不进**(定稿不重抽)、
**报告写下之后被删的镜不进**(与当前分镜表取交集)、`order` 与排序取分镜表实位而不是报告里记的旧位。
照 `detail` 文案回抠 `1镜`/`3镜` 得到的是**旧位**,分镜表调过序就抠错镜——这是"让调用方自己看着办"的实际代价。

**空重抽面不出这个字段**,不是出一个 `[]`。理由不在本层:命令层与 CLI 的子集位都是
`Array.isArray(args.shotIds) && args.shotIds.length ? 子集 : 整集`,**空数组在那儿等于"整集"**,
带一个空 `shotIds` 会把只该修几镜的活儿放大成整集重跑(重生成每镜都真扣费)。
`failed-shots` 从来不会带空子集(有失败镜才出那条),本槽跟它同口径。
空面这一路真会走到:报告只有 `avg` 没有 `perShot`、低分镜全定稿、低分镜全被删,三种都出 `low-review` 而重抽面为空。

## 3. 为什么仍不挂 `cmd`

审计第 4.2 节那句"出同一种形状"只括注了 `shotIds`,并紧接着写明「这不等于让编排层替人决定重抽哪几镜——
`shotIds` 是**供人挑选的清单**」。本槽照这条办,三条现成纪律指向同一侧:

- **重抽前要先改提示词**。SK-25 修订闭环的第二步原话是「按审片问题修订提示词后只重跑低分镜」;
  提示词不动就按下重生成,只是拿同一条提示词再抽一次卡,钱花了、大概率还是同一批低分。
- **过期镜那条早就是这么定的**。`stale-shots` 同样"子集算得出来"而有意不挂命令,
  `tests/unit.js` 里那条用例的原话:`过期镜重生成不应挂命令(shotIds 子集属调用方决策)`。
- **审片一侧的计费动作问题中心一律不代按**(W54 起:`no-review`/`review-stale` 都走导航)。

所以这条仍是 `goto` 类:按钮还是「→ 去处理」,跳到分集页。变的只是**机器读得到那几镜**——
`cli.js` 的 `issues` 命令本来就在投 `shotIds: x.shotIds || []`(此前对这条恒为 `[]`),
MCP `hujing_issues` 与助手工作台读的是同一份,现在拿到的是准的。

`js/issues.js` 顶部那句条目字段说明同轮改写:`shotIds` 两类条目都可能带,
带在 `goto` 条目上时是"该动这几镜"的清单,不代表本层替调用方按下处置。

## 4. 加测与变异

两条新用例,分工不合并:

| 套件 | 用例 | 钉的是 |
|---|---|---|
| `issues` | `collect:低分审片带派生 shotIds 子集(恒等 Domain.reviseShotIds;空重抽面不出这个字段)` | 行为面:子集内容、恒等派生、条目计数同源、仍不挂命令、空面不出字段 |
| `contract` | `问题中心不把重抽面留在文案里:low-review 的 shotIds 现取 Domain.reviseShotIds,空面不出字段` | 取数口:源级不许在调用侧抄一份投影;反向钉住两端"空数组即整集"那一口径 |

**行为面的夹具有意选得能分辨**(W131 那一课:恒等断言的夹具选错等于没写)——分镜表调过序(`sh1` 在前)、
`sh3` 已定稿、`sh9` 在报告写下之后被删、`sh2` 达标,四种情形各一个;照 `perShot` 自筛一遍会得到
`sh0,sh1,sh3,sh9`,与真派生的 `sh1,sh0` 差着镜集与序两层。

六条变异,每条改完跑全套 `unit`、验完还原;基线上这六处一条都不红。

| # | 变异 | 结果 |
|---|---|---|
| 1 | 整条删掉(退回本槽之前:算出来只进 `detail`) | 红 **2**(行为面报"期望 `sh1,sh0` 实际空" + 取数口那条) |
| 2 | 去掉空面守卫(空重抽面也塞一个 `[]`) | 红 1(点名"空数组在子集位上等于整集重跑") |
| 3 | 把 `reviseShotIds` 的函数体抄到调用侧(`lows.map(x => x.shotId)`,**值完全一样**) | 红 1(取数口那条:第二份投影) |
| 4 | 调用侧自筛 `score < REVIEW_MIN`(退回 W131 之前的形态) | 红 **2**(行为面报实际 `sh0,sh1,sh3,sh9` + 取数口那条) |
| 5 | `js/commands.js` 的子集位去掉 `.length`(空数组不再等于整集) | 红 1,**且这条是改强之后才红的**,见下 |
| 6 | 给 `low-review` 挂上 `cmd: 'episode.generateVideos'` | 红 1(点名"给人挑的清单不是替人按下处置") |

第 3 条是本槽最该留的一条:它证明"值一样"不等于"单源",没有它,退回抄一份的写法全绿。
第 6 条把第 3 节那个决定钉成判据——要改这个决定,得先改那句断言,不是顺手加个字段。

**第 5 条第一版没红,这是本槽量出来的一处判据缺陷**。原写法是
`assert(/Array\.isArray\(args\.shotIds\) && args\.shotIds\.length/.test(cmds))`——
`js/commands.js` 里这个写法有**两处**(`generateVideos` 的待跑镜过滤、`smartReview` 的复审子集),
改掉一处,那句正则照旧命中另一处,`526/526` 全绿。改成逐处 `matchAll` 再各判一次尾部写法,
并把 `cli.js` 那处一并纳入,两侧各自改口径时报错句里点名是哪一侧。
**归口:只判"某个写法在这个文件里出现过"的断言,在同一写法有多处时天然拦不住其中一处被改。**

## 5. 回归数字

| 套件 | 基线 | 本槽 |
|---|---|---|
| `unit` | 524/524 | **526/526** |
| └ `issues` 子套件 | — | +1 |
| └ `contract` 子套件 | 114 | **115** |
| `integration` | 141/141 | **141/141**(未动,实跑复核过) |

产品代码只动 `js/issues.js` 一个文件(一处 `if` 加一行 + 两处注释);
`js/domain.js`/`js/commands.js`/`js/issues-ui.js`/`cli.js`/`server.js`/`js/skills.js` 一字未改——
`issues-ui.js` 的 `fixIssue` 早就在透传 `it.shotIds`,`cli.js` 的 `issues` 投影早就在投这个字段,
两侧都不用改正是"字段口径本来就留着"的旁证。

治理面零变动:`Skills.gaps()` 20 键(`G-03` 未摘)、注册表 41 条、短名单 30 条、`CHECKS` 17、
`preflightStages()` 7、`KB.SECTIONS` 18、`playbooks()` 5、领域命令 13,一个数没动。

棘轮按 **live** 抬(不抄旧数):`tests/unit.js` 单元 `FLOOR` 524 → **526**、记账件 `FLOOR` 170 → **171**;
`README.md` 的「单元测试(N 项断言」524 → 526、契约段自报条数 114 → 115;
`docs/skills-wave/README.md` 明写份数 170 → **171**(含本份)。

## 6. 交接

1. **`Domain.reviseTargets` 现在有五个消费点**。W131 的交接原话仍适用:再加消费点时别在调用侧补条件
   (比如"顺便也排掉生成中的镜"),补进 `reviseTargets` 里、并在那条恒等用例的夹具上加一列。
   本槽只加了一个**投影**(`shotId` 那一列),没有加任何条件,故那条恒等用例的夹具未改。
2. **要给 `low-review` 挂 `cmd`,先推翻第 3 节**。三条纪律(改提示词在先、过期镜同形、审片计费不代按)
   里任何一条变了都可以重议,但那是产品口径的改动,不是"顺手让它变成一键"。
   挂上 `cmd` 时记得同轮改 `js/issues-ui.js` 的 `FIX_LABEL`(现在没有这条的按钮文案,会退化成「▶ 处理」)。
3. **空面不出字段这条纪律绑在两端的子集位写法上**。哪天命令层/CLI 改成"空数组即空集",
   本槽那条 `contract` 用例先红——要改的是这里的守卫与那句断言,不是把断言删掉。
4. **`Skills.playbook('review.reviseLoop')` 第二步的 `args` 仍是空的**,`note` 仍写着
   「`shotIds` 子集由编排层现取实况派生,不预设在登记里」——本槽一字未动,那句话现在比之前更准:
   编排层现在真的取得到,而登记里照旧不预填。
