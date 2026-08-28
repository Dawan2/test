# W177 · 发布门 G4 回执分报「可重跑的过期镜」与「定稿过期需人工」

**范围**:`js/domain.js`(新增 `staleShotSplit` / `staleSplitNote` 两个派生)+ `js/release.js`(G4 一处)
+ `js/release-core.js`(headless G4 一处)+ `tests/unit.js`(+5 条:`domain` 1、`release` 3、`contract` 1)
+ `README.md` 与 `docs/skills-wave/README.md` 数字与描述同步。
**基线**:`cursor/w170-integration-98b2`(`c2acb4d`)。
**不做**:不改任何门槛(`counts.stale` 仍数定稿的过期镜、G4 的 0/非 0 分档、`aggErr` 两条降级路径、
三门文案的前半段一字未改)、不动 `fix.shotIds` 的成员、不摘 `Skills.gaps()`、
不重做 W176 那一包(命令层子集位放过期镜过)。

## 1. 停工位不成立:回执现在真的没分报

交接单给的停工条件是「若回执已分报:举证停工」。在基线 `c2acb4d` 上把它跑了一遍——
一集三镜(鲜镜 / 过期镜 / 过期且已定稿),两端 G4 的回执逐字如下:

```
counts.stale                = 2
浏览器 G4 info              = '2 镜素材与当前剧本不一致'
headless G4 info            = '2 镜'
g4.fix                      = { cmd:'episode.generateVideos', epid:'ep1', shotIds:['sh1','sh2'] }
Domain.staleShotSplit       = undefined
Domain.staleSplitNote       = undefined
```

**一个数,两堆镜**。基线的 G4 只印总数,而这两堆的下场完全不同:

- `sh1`(过期、没定稿)——处置按下去跑得到(W176 把命令层子集位那道口开了之后);
- `sh2`(过期、已定稿)——两端批量生成都锁着 `!s.final`(重生成会直接覆盖用户按下的定稿产物),
  处置一按到底也碰不到它,`shot.generateVideo` 单镜入口对 `final` 同样是 `blocked`。

于是用户读到「2 镜素材与当前剧本不一致」,点处置,回执报「已处理 1 镜」,门禁重收仍是 fail,
而**从头到尾没有一处告诉过他差的那一镜差在哪、该怎么办**。这就是 W176 第 3 节有意留下的那个缺口:
它把「计数照旧、处置不碰、`total` 按真跑数报」三件事都钉住了,唯独没有让回执把这两堆分开说。
停工位不成立,本槽收的就是这一面。

## 2. 改了什么

### 2.1 分堆与那句话都收在 `Domain`(`js/domain.js`)

```js
D.staleShotSplit = function (p, ep, online) {
  const stale = ((ep && ep.shots) || []).filter(s => D.shotVideoStale(p, s, online));
  return {
    all: stale.map(s => s.id),
    rerun: stale.filter(s => !s.final).map(s => s.id),
    locked: stale.filter(s => !!s.final).map(s => s.id),
  };
};
D.staleSplitNote = function (rerun, locked) { … };   // 两堆不分家时回空串
```

两件事各有理由:

- **判旧现取 `D.shotVideoStale`**,不在这里就地另写一份"什么叫过期"。
  分堆若自己判旧,指纹分支与素材版分支只要漏一条,这个数就与 `counts.stale` 悄悄分家
  (第 4 节的变异 8 正是这一形状,而第一版用例接不住它——见第 4 节末)。
- **那句话也只此一份**。它是回执文案不是判据,但两端各拼一版的结果是同一个项目在交付弹窗与
  `hujing release-check` 上读到两种说法。判据早就是单源了,说法跟着一起收。

### 2.2 浏览器 G4(`js/release.js`)

三门共用的那次遍历里多攒一份分堆计数,G4 那一格多三样东西,**别的一样没动**:

```js
gates.push(gate('g4-stale', '素材过期镜 = 0', agg.stale ? 'fail' : 'pass',
  agg.stale + ' 镜素材与当前剧本不一致' + Domain.staleSplitNote(staleSplit.rerun, staleSplit.locked),
  agg.stale && firstStale ? { severity: 'mid', staleSplit: { total: agg.stale, rerun: …, locked: … },
    fix: { …, shotIds: firstStale.shotIds, rerunShotIds: …, lockedShotIds: … } } : null));
```

- **`info` 尾巴**:两堆都有 → `(可重跑 1 镜;另 1 镜已定稿,批量重生成不覆盖定稿产物,需先解锁终稿)`;
  全是定稿镜 → `(全部已定稿,批量重生成不覆盖定稿产物,一镜也重跑不到,需先解锁终稿)`;
  没有定稿过期镜 → **空串,原文案一字不变**。
- **`staleSplit` 结构位**(全项目计数,与 `info` 里的数同源):给消费方一个不必解析文案的取数口。
- **`fix.rerunShotIds` / `fix.lockedShotIds`**:`info` 报的是全项目的数,而 `fix` 只落在首个受累集上,
  用户按的是这一集的按钮,故这两份镜号按集给——省得他按完再自己数少了哪几镜。
  `fix.shotIds` **成员一个没动**,仍是该集 `counts.stale` 那几镜(W176 第 4 节那条等式照旧成立)。

### 2.3 headless G4(`js/release-core.js`)

同一句尾巴接在它自己的 `'N 镜'` 后面。有一处与浏览器那端有意不同形:

```js
if (typeof Domain.staleShotSplit === 'function') { … }
```

本层的 `Domain` 是**注入参数**不是全局模块,它对注入方的硬契约只有 `episodeState`(缺它上面已按未过门算)。
分堆是回执上的增量,注入方给的是只带 `episodeState` 的窄 `Domain` 时退回原样只报总数——
不因为拿不到一份增量,就把一个明明判得出来的数说成"判不出来"(那与本文件 `aggErr` 那两条降级
守的是相反的东西:那两条守的是"没判过不许报数",这里是"判过了别装作没判")。
浏览器那端不设这个守卫:那里的 `Domain` 是 `index.html` 装进来的整个模块,缺函数就是构建坏了。

## 3. 有意不做的三件事

1. **没有把 `final` 从 `counts.stale` 里摘掉**。定稿的过期镜确实与当前剧本不一致,G4 该报;
   摘掉它是改门槛,还会连带改动流程条、问题中心、断点条上同读这个数的四处显示。
   交接单也明确点了这一条,第 4 节的变异 6 反向钉住。
2. **没有把定稿镜从 `fix.shotIds` 里摘掉**。摘了之后 `fix.shotIds` 就不再等于 `counts.stale`,
   W176 立的那条等式当场破;而两端命令层本来就锁着 `!s.final`,子集里留着它一分钱也不多花
   (变异 5 反向钉住)。
3. **没有在"全是定稿镜"时把处置按钮摘掉**。那时按下去 `total: 0`,形状确实像 W176 收的那种
   "装得对、按下去跑不动"——但摘不摘是产品口径(要么自动解锁终稿再重抽、要么改挂一条"去解锁"导航),
   不是顺手改一行。本槽只让回执把这件事**说清楚**,并把它留成第 6 节的交接。

## 4. 加测与变异

五条新用例,分工不合并:

| 套件 | 用例 | 钉的是 |
|---|---|---|
| `domain` | `staleShotSplit:过期镜按终稿锁分两堆(判旧仍只此一份;两堆之和 = counts.stale)` | 派生本身:七镜夹具摊开鲜镜/失败镜/定稿没过期/**指纹对得上**/**没指纹但换过素材版**五种非典型形状,两堆之和对着 `counts.stale` 记账 |
| `release` | `G4 回执分报:过期镜里定稿的那几镜单列报出来(counts.stale 与 fix.shotIds 一个数没动)` | 主线:分档/总数/`fix.shotIds` 三样逐字未变 + 两堆的数与镜号 + `info` 分开说 |
| `release` | `G4 回执分报:过期镜全是定稿镜时如实说一镜也重跑不到(不报「可重跑 0 镜」糊过去)` | 分报的**另一个方向**:`rerun = 0` 那一档 |
| `release` | `release-core · G4 分报两端同一句:headless 与浏览器同读 Domain 的分堆,窄 Domain 退回只报总数` | 双端同形 + 窄 `Domain` 的降级边界 |
| `contract` | `过期镜分报的取数口:两端 G4 都现取 Domain 的分堆与那句话,谁也不自写第二份终稿判据` | 源级:两段 G4 各自切片后须现取两个函数、段内不得出现 `.final` 与自拼文案;另反向钉住 `counts.stale` 计数段没按 `final` 分档 |

**期望值先与 Domain 对一次账**:三条行为面用例都先 `assertEq(episodeState().counts.stale, 期望)`,
夹具日后被调、或 `counts.stale` 判据变了先红在那一句上,而不是让下面几句悄悄变成恒真。

八条变异,每条改完跑全套 `unit`、验完还原;本槽改动落地后这八处一条都不红。

| # | 变异 | 结果 |
|---|---|---|
| 1 | `js/release.js` 的 G4 `info` 去掉尾巴那句(退回不分报) | 红 **4**(三条行为面 + 取数口) |
| 2 | 只改浏览器一端,`js/release-core.js` 退回原样 | 红 **2**(双端那条报 headless 只有 `'2 镜'` + 取数口点名 `release-core.js`) |
| 3 | `staleShotSplit` 不分堆(`locked` 恒空,定稿镜也算可重跑) | 红 **4** |
| 4 | `staleSplitNote` 不分形状(`rerun = 0` 时照印「可重跑 0 镜」) | 红 **2**(`domain` 那条 + 全定稿那条行为面) |
| 5 | `fix.shotIds` 顺手收窄成 `rerunShotIds`(把定稿镜摘出处置子集) | 红 **2**(两条行为面报子集少了定稿镜) |
| 6 | `js/domain.js` 的 `counts.stale` 不再数定稿的过期镜(**改门槛**) | 红 **5**(两条 `release` 用例的对账句 + `domain` 的两堆之和 + 双端那条的总数 + 取数口那条反向断言) |
| 7 | `js/release.js` 在自己那段手写一份分堆,不取 `Domain` | 红 **1**(取数口——行为面全绿,因为两份判据此刻等价) |
| 8 | `staleShotSplit` 就地另写判旧(`done && 有指纹` 即算过期) | 红 **1**(`domain` 那条:`sh5` 指纹对得上却被判过期、`sh6` 没指纹但换过素材版却被漏掉) |

**第 8 条是本槽第二轮才接住的**:第一版 `domain` 夹具里的过期镜清一色是"指纹对不上"那一种,
于是"现取 `shotVideoStale`"与"就地判 `done && 有指纹`"在那份夹具上产出一模一样,**这条变异全绿**。
补的两镜(`sh5` 指纹对得上、`sh6` 没指纹但引用主体 `imgVer` 抬过)各摊开判旧的一条分支,
两个方向都有镜之后它才红。
**归口:钉"这里现取的是那份单源判据"时,夹具必须让"第二份等价写法"在某一镜上失手——
判据只有一条分支被摊开时,抄一份简化版判据不会红。**(与 W176 那一课同形:
它记的是"开口类改动要两个方向各有一条用例",这里记的是"取数口类改动要让替代写法有地方出错"。)

第 7 条量的是"改动等价但单源破了"这一路:两份判据此刻算出同一批镜,行为面接不住,只有源级那条报得出来。

## 5. 与 W176 合起来跑过一遍

本 HEAD 未合 W176,但这两槽收的是同一条链的前后两段(它收"处置真跑得到过期镜",本槽收"回执如实说跑得到几镜"),
故在临时工作树里做了一次**试合并**取证(合完即弃,不进本支):

- **产品代码零冲突**——`js/commands.js` / `cli.js`(W176)与 `js/domain.js` / `js/release.js` /
  `js/release-core.js`(本槽)各改各的;冲突只出在 `tests/unit.js` 与 `README.md`,
  且全是**同锚点插入 + 数字**(两侧都在 `releaseReadyEp` 之后加夹具、都在同一批用例之间插用例、
  都改了 `FLOOR` 与 README 那几个数),取并集 + 数字按 live 取一次即可。
- 并集之后**两侧行为面用例全绿**(551 条里只剩三条文档数字对账在报——那是集成槽的活)。
- 在 W176 那条「终稿锁是唯一挡在处置外的过期镜」用例上加了一组**探针断言**,直接量两槽的接缝:

```
counts.stale                 = 2
g4.staleSplit.rerun          = 1   ==  引擎实收镜数 sb.__genShots.length
g4.fix.rerunShotIds          = ['sh4']  ==  引擎实收的镜  ['sh4']
g4.fix.lockedShotIds         = ['sh1']  ==  处置没碰的那镜(产物一个字节没动)
g4.info                      = '2 镜素材与当前剧本不一致(可重跑 1 镜;另 1 镜已定稿,…需先解锁终稿)'
命令回执 result.total        = 1
```

即**门上印的「可重跑 N 镜」就是按下去真落到引擎上的镜数**,「定稿过期」那堆恰好是处置没碰的那几镜。
探针只在临时工作树里跑,不进本支——本支的双端那条用例已在单端范围内钉住同一件事。

## 6. 回归数字

| 套件 | 基线 | 本槽 |
|---|---|---|
| `unit` | 542/542 | **547/547** |
| └ `domain` 子套件 | 29 | **30** |
| └ `release` 子套件 | 31 | **34** |
| └ `contract` 子套件 | 121 | **122** |
| `integration` | 141/141 | **141/141**(未动,实跑复核过) |

产品代码三个文件共 47 加 4 删:`js/domain.js` +19/-0(两个派生含注释)、
`js/release.js` +15/-3(G4 那一格与三门共用的那次遍历)、`js/release-core.js` +13/-1(同一格)。
`js/commands.js`、`cli.js`、`js/issues.js`、`js/pipeline.js`、`js/workbench.js`、`js/skills.js` 一字未改。

治理面零变动:`Skills.gaps()` 键数、注册表条数、短名单、`CHECKS`、`preflightStages()`、`KB.SECTIONS`、
`playbooks()`、领域命令数,一个数没动;门槛面同样零变动(G4 的判据、分档,以及 `info` 的**前半段**)。

棘轮按 **live** 抬(不抄旧数):`tests/unit.js` 单元 `FLOOR` 542 → **547**、记账件 `FLOOR` 183 → **184**;
`README.md` 的「单元测试(N 项断言」542 → 547、契约段自报条数 121 → 122;
`docs/skills-wave/README.md` 明写份数 183 → **184**(含本份)。

## 7. 交接

1. **同一形状的混报还有两处,本槽都没碰**(交接单点名只收 G4 回执这一面):
   - `js/pipeline.js` 断点条「🔄 重生成过期镜(N)」的 N 直接取 `c.stale`、`shotIds` 取全部过期镜,
     与本槽之前的 G4 一模一样——按钮上写着 N 镜、按下去只跑得到其中没定稿的那几镜。
     它的 `run` 就在原地,接 `Domain.staleShotSplit` 是一行的事,但那是**按钮文案**不只是回执,
     动它要先决定"按钮上印的是总数还是可重跑数"(印可重跑数的话,与流程条上的 `c.stale` 又对不上了)。
   - `js/issues.js` 的 `stale-shots` 条目 `detail` 列出全部过期镜号,同样不分堆;
     它**不挂 `cmd`**(走导航让用户自己去分集页),故没有"按下去跑不动"那一面,只是少了句提示。
2. **「全是定稿镜时该不该继续挂处置」是本槽有意留下的产品口径题**。三条路各有代价:
   摘掉按钮(用户少了个入口)、改挂"去解锁终稿"导航(要新开一个 nav 目标)、
   处置里自动解锁再重抽(等于替用户撤销他按下的锁)。要收它先定这个,别顺手放宽 `!s.final`——
   第 4 节的变异 5 与两条用例名会先红,那正是让人回来读第 3 节的路标。
3. **`staleShotSplit` 是给"批量入口够不够得着这一镜"起的头,但只起了一半**。
   它现在只判终稿锁这一条。W176 交接的第 4 条说的是同一件事的另一半——
   两端命令层的子集位现在是逐字同形的两份(`!s.final && ids.has && (未就绪 || 过期)`),
   哪天要把"这一镜该不该进这次批量"整个收进 `Domain`,本函数就是那个落点,
   届时 G4 的 `rerun` 堆改成直接问它即可,回执这一侧不必再改。
4. **窄 `Domain` 那条降级路径没有对应的产品语境**——今天两个真实调用方(`cli.js` `_releaseGates`、
   `server.js` 的 `/api/wf/release` 前置)注入的都是整个 `js/domain.js`。它守的是单测里的窄桩
   与将来可能出现的第三个注入方;真出现了第三方注入方而它拿不到分堆,回执会静默少一句尾巴,
   不会报错——这是有意的(增量降级),但记在这里免得日后当成 bug 查。
