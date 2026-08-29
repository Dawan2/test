# W287 分镜面补 `shots-dedupe` 入口:集级顶栏一处挂住四视图,预览一屏不写库

> 起点 `origin/cursor/w286-integration-05c0` 尖 `e254ffd`(`checkout -b` 后 `rev-parse` 现取核过,
> 与交接自称逐字节相同)。功能支 `cursor/w287-shots-dedupe-ui-38eb`。

## 一、收的是哪一条

W285/W286 残留第 1 条,原话:

> 分镜面仍没有 `shots-dedupe` 的入口（形状同形,差别是要挂在分集级、判清四视图哪一处头部、
> 以及 `lastReview.perShot`/`uiSel`/`groupId` 那几处引用面怎么交代)

镜头侧那条命令自 W235 起就在 CLI/MCP 上,浏览器这一端一直没有入口:同 id 多行在分镜表里
与两个不同镜头长得一模一样(缩略图逐条渲染 `ep.shots`),页面上要发现它只剩批量生成那句
`Domain.dupRowsNote`——而那句话只在**已经多扣了钱之后**的回执里出现。

本槽给分镜面补这条入口,形状与 W285 主体库那条逐格同形:默认预览(dry-run)经 `U.openModal`、
确认才写库、规则只读 `Domain.dupIdScan`、首行留原 id、一行不删、纯改表零上游不经 `Tasks.run`。

## 二、动手前必须交代的两件事

### 2.1 挂在四视图哪一处头部

**答案:一处——集级顶栏那一行(`js/storyboard.js` 的 `Views.episode`,顶部 `btn sm` 按钮行)。**

现取的事实是:四视图(📋 分镜脚本 / 🎞 分镜视频 / 🥁 节拍板 / 🗂 镜头组)加剪辑台
**并不是四个页面**,而是同一个 `Views.episode` 里由 `settings.epViewMode` 切的五档中栏;
顶栏那一行(`‹` / 🧠 智能分镜 / 🆚 方案对比 / 🕘 历史 / ✏ 快速编辑 / 🎬 生成视频 /
🎬 整集审片 / 🎞 合成成片 / ⚙ 参数配置 / 🖥 显示方式 / ☑ 批量 / ⇅ 导入导出)排在
视图分档**之前**,五档都渲它。

| 候选头部 | 挂几处才够 | 为什么不取 |
|---|---|---|
| **集级顶栏那一行**(取) | **1** | 排在视图分档之前,五档共用;各视图自己那个中栏头部一处都不用挂 |
| 集级信息卡(`N 镜 / 待确认 M / 全部确认`) | 2 | 那张卡有 `window.Pipeline` 在场与不在场两个分支(`confirmall` 就是两处各写一份),挂它要插两次 |
| 各视图自己的中栏头部 | 4 | 分镜脚本(`sb-board.js` `scriptBoardHTML`)、分镜视频(`sb-views.js` `centerHTML`)、节拍板、镜头组各有一个头部,且前两处有"只重渲中栏"的局部刷新路径,四处各挂一次才不漏 |

W285 那槽是 `${dedupeBtn}` 插**两处**(独立页 + 项目详情嵌入版),本槽是**一处**——
不是少挂了,是这一处的覆盖面本来就是五档。判据不靠读代码断言这句话:
行为面那条把 `board`/`shots`/`cut`/`bb`/`groups` **五条路各真渲一遍**,逐条断言入口在、
且按钮上那个数报得对;源级那条另钉两句——`${dedupeBtn}` 恰 1 处,且模板从
`main.innerHTML = \`` 到插入点之间**不出现任何 `vm === ` / `showBoard` 分档**
(排到分档之后就有视图看不见它)。

入口露出条件与主体库那条同形:`dedupeShotScan(ep.shots).plan.length` 为 0 时压根不渲,
露出时把要改几行直接写在按钮上（`🧹 镜头 id 去重(N)`)——这个数就是页面级「发现」那一下。

### 2.2 `lastReview.perShot` / `uiSel` / `groupId` 那几处引用面怎么交代

三处**处境不同**,现取逐处量过(行为面那条用同一把尺子在去重前后各量一遍):

| 引用面 | 怎么解析 | 去重后 | 本槽怎么交代 |
|---|---|---|---|
| `ep.uiSel`(当前选中镜) | `ep.shots.find(s => s.id === ep.uiSel)`,首行语义 | **同一行**(首行留的就是原 id) | 预览里明写「按首行解析、去重前后同一行」;判据钉 `uiSel` 行号前后相等 |
| `s.groupId`(镜头组归属) | 归属记在**镜头行自己身上**,值是**组 id 不是镜头 id**;`groupShots` 按 `s.groupId === g.id` 筛 | **一处不动**(改镜头 id 碰不到它) | 同上;判据钉四行的 `groupId` 逐行相等 |
| `ep.lastReview.perShot[].shotId` | **不是首行语义**:`Domain.reviewRows` 按「第几条同 id = 第几行同 id」落行(W263/W267 立的序数口径) | **会塌**:同 id 只剩一行之后,原本落在首行之外的那几条一起退回首行 | **只报不改**:会塌几条现算现报在预览里,报告一个字不改 |

第三处是这一槽真正要交代的那一格。现跑量出来的形状(行为面那条的夹具:四行 `dup/solo/dup/dup`、
`perShot` 四条 `dup/solo/dup/dup`):

```
去重前  reviewRows 落行 = 0,1,2,3     reviseTargets = 第3行@5分, 第4行@6分
去重后  reviewRows 落行 = 0,1,0,0     reviseTargets = 第1行@5分, 第1行@6分
```

即那两条低分结论从「各归各行」塌成「都指首行」:整集报告上的镜号跟着按首行印,
按低分派生的重抽名单也跟着改首行那一句提示词(而重抽那一步是真花钱的)。

**本槽的分寸(明令):不改审片合入。** 处置是三条,一条不多:

1. **说清**——预览里出一块黄字,现算现报「有 N 条逐镜结论现在落在首行之外的行上,
   去重后会一起退回首行」,并把回位的办法一起写上(去重后重跑一次整集审片,按当下这棵表重新出条目);
2. **不偷改库形态**——`ep.lastReview` 一个字段都不动(判据逐条钉 `shotId`/`reportId` 原样);
3. **那个数不许自己算**——`reviewCollapseCnt` 拿**同一份** `Domain.reviewRows` 在
   「当下这棵表」与「按计划改过 id 的表」上各跑一遍,落行不同的条数就是答案。
   页面上另数一套「第几条同 id」的话,那个数与审片消费面读出来的行对位就是两套,
   而这条入口「只报不改」的全部分量都压在那个数报得准上——源级那条判据钉住两次
   `Domain.reviewRows(` 且段内零 `nth`/`seen[`/`shotId` 字面。

与 CLI 现口径的关系:`cli.js` 的 `shots-dedupe` 注释仍写着「`lastReview.perShot[].shotId` /
`ep.uiSel` / `Domain.reviseTargets` 一律按 `find` 首行语义解析…去重前后落到的是同一行」——
就**行为**而言两端一致(都是去重后按 id 落到首行),但那句注释里点名 `reviseTargets` 的那半
在 W263/W267 把行对位改成序数口径之后已经不准了(它现在经 `reviewRows` 按序数落行、
去重后才退回首行)。本槽**没有**去改那句注释:明令只做一条产品缺口,且改它属于
「审片合入那一问」的交代面。记进残留第 1 条。

## 三、落地形状

| 文件 | 改动 |
|---|---|
| `js/storyboard.js` | 新增 `dedupeShotScan`(委托 `Domain.dupIdScan`,注入 `Store.uid('sh')` 与单位词 `rows`)、`reviewCollapseCnt`(两跑 `Domain.reviewRows`)、`openShotDedupe`(预览 + 确认闸);集级顶栏插 `${dedupeBtn}` 一处、绑 `[data-x=shotdedupe]`;`window.SB` 导出两个新成员 |
| `tests/unit.js` | `commands` 新增两条 + `loadEpisodeWs`/`epDom` 两个夹具;护栏主题 `dedupe-shots-ui-single`(22 → **23**)、`TOPIC_FLOOR` **23**、单元 `FLOOR` **705**、记账件 `FLOOR` **302** |
| `docs/skills-wave/w178-topic-floor-unlist.md` | 花名册补一行 |
| `README.md` | 新增「🧹 镜头 id 去重」一条(挂在哪一行头部、三处引用面各是什么处境、旧报告那格只报不改);单元断言数 703 → **705** |
| `docs/skills-wave/README.md` | 索引补行、明写份数 301 → **302** |

规则一个字没抄到页面上:仍只在 `Domain.dupIdScan` 一份,此刻**四处同读**——
`cli.js:727`(`subjects-dedupe`)、`cli.js:814`(`shots-dedupe`)、`js/roles.js:284`(主体库入口)、
`js/storyboard.js`(分镜面这条入口)。

明令没碰的:主体库入口、删除语义(`js/sb-views.js` 单镜删除仍按 id 匹配、同 id 那几行一并删光,
那是删除语义不是去重语义,只在预览里把这笔代价说清)、`unique` 口径、`state-put` 不设闸、
`gaps()`、SK-04、单发七条的 `landed`、共位退费。

## 四、判据(+2,`unit` 703 → **705**)

| 套件 | 用例名要点 | 钉住什么 |
|---|---|---|
| `commands` | `分镜面那条去重入口:四视图与剪辑台共用的集级顶栏上真长出来…` | 行为面:五档视图各真渲一遍看得见入口且数报得对;预览零写库、不自关;取消零写库且引用面一处不动;确认恰写一次库;四行仍四行、首行留原 id、新 id `sh_` 前缀、四 id 唯一、名字一字未动;预览里那批新 id 一个都没落库;`uiSel`/`groupId` 前后同一行;`reviewRows` 落行 `0,1,2,3 → 0,1,0,0` 与 `reviseTargets` 塌回首行**逐格钉住**且 `perShot` 原样;预览里报出「有 2 条逐镜结论」与「重跑一次整集审片」;零任务零扣费;收拾干净后入口自己消失、`unique` 口径未变 |
| `commands` | `分镜面那条去重入口不许另抄一份规则…` | 源级:扫描段真委托 `Domain.dupIdScan(` + 注入 `Store.uid('sh')` + 换上 `rows` + 零 `new Map`/`new Set` + `keepOrder` 恰两次;`reviewCollapseCnt` 段恰两次 `Domain.reviewRows(` 且零 `nth`/`seen[`/`shotId`;弹窗段零计费路径、两条路同调一个扫描、`Store.save()` 只此一处且排在 `[data-x=apply]` 之后(并先钉住那个选择器取得到,否则本句退化成恒真)、段内不许改 `lastReview`/`perShot`/`uiSel`;入口露出由同一份扫描现算、`${dedupeBtn}` 恰 1 处且插入点之前零视图分档;对照面 CLI 那条命令仍在、删除语义那一句一字未动 |

同轮登记护栏主题 **`dedupe-shots-ui-single`**(锚点 `function openShotDedupe(` + `Domain.reviewRows(`,`hosts` 1),
花名册补一行,`TOPIC_FLOOR` 22 → **23**。既有 `dedupe-rule-single` 与 `dedupe-ui-rule-single`
的锚点与 `hosts` 一个字没动(两条的锚点都点不到本槽这两条用例:
前者要 `dedupeSubjectScan`、后者要 `function openDedupe(`,而本槽写的是 `openShotDedupe`)。

## 五、变异(逐手本槽现跑)

<!-- MUTATION TABLE -->

## 六、数字(live 现跑)

<!-- LIVE NUMBERS -->

## 七、残留

<!-- RESIDUALS -->
