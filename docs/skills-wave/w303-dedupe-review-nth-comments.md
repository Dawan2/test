# W303 去重那几句注释改准:审片对位是行序数,不是 `find` 首行

> 起点 `origin/cursor/w302-integration-b299` 尖 `e231046a84cb9dd36da2acc0fcdd400ac2fe96cd`
> (`git fetch` 现取,`checkout -b` 后 `rev-parse` 核过,与交接自称的 `e231046` 逐字节相同)。
> 功能支 `cursor/w303-nth-comments-42d2`。**零运行时改动**:改的全是注释、一条回执日志与 help 文案。

## 一、收的是哪一条

W287 起十几槽逐槽原样带下来的残留第 1 条:

> `cli.js` 的 `shots-dedupe` 注释里点名 `Domain.reviseTargets`「按 `find` 首行语义解析、去重前后同一行」
> 那半句,在序数口径立起来之后已经不准了。

那句话是 W235 写的,当年是**现跑量出来的真结论**:那时 `Domain.reviseTargets` 自己用
`shots.findIndex(s => s.id === x.shotId)` 把 `perShot` 的每一条一律解析到首行,而去重保的就是首行的原 id,
所以「去重前后落到同一行」逐条成立。W253 把重抽面改成逐条落到自己那一行并带出 `nth`,
W263/W267 又把行对位下沉成 `Domain.reviewRows`(第几条同 id = 第几行同 id)、
`reviseTargets` 改成长在它之上——**寻址口径换了,那句话就从"量出来的结论"变成了一句假话**,
而且是**朝着让人放心的方向**假:它说的是"去重不影响审片报告的对位",实况是同 id 只剩一行之后,
落在首行之外的那几条会一起退回首行。

W287 给分镜面那条去重入口做的是**产品面**的处置(预览里现算现报会塌几条、写明回位办法),
CLI 这一侧的说明当时明令没碰。本槽只收这一格:**把仍把审片对位说成 `find` 首行的那几句改准,一行运行时代码不动。**

## 二、动手前全树搜的那一遍

搜 `find 首行` / `reviseTargets` / `shots-dedupe` 注释 / help 文案四把,命中逐处判「现在还准不准」:

| 处 | 原话要点 | 判 |
|---|---|---|
| `cli.js:825` `shots-dedupe` 头顶 | `lastReview.perShot[].shotId` / `ep.uiSel` / `Domain.reviseTargets`**一律**按 `find` 首行语义解析、去重前后同一行 | **不准**,本槽改 |
| `cli.js:823` 同一段上一句 | `findShot`/`shot-set`/**审片回写**全按 id 取首行 | **不准**(审片回写按行序数写,W253/W258/W260/W261),本槽改 |
| `cli.js:789` `shots-import` 闸头顶 | 同上那半句(`findShot`/`shot-set`/**审片回写**全按 id 取首行) | **不准**,本槽改同一半句 |
| `cli.js:848` `--apply` 那条回执日志 | 「引用按首行解析,故 `lastReview`/`uiSel` 一个字未动」 | **不准**(因果错:报告没被改是因为本命令不碰它,不是因为它解析到同一行),本槽改 |
| `cli.js` help `shots-dedupe` 那格 | 「`lastReview`/`uiSel` 等引用一律不动——它们按首行解析」 | **不准**,本槽改 |
| `js/domain.js:454` `dupIdScan` 头顶 | 两侧按 id 的引用**一律**是 `find` 首位/首行语义,去重前后落到同一位/同一行 | **不准**(主体侧准、分镜侧的整集报告不准),本槽补一句例外 |
| `tests/unit.js:3489` CLI 那条用例的说明 | 三处引用一律按 `find` 首行语义解析 | **不准**,本槽改(并写清本条夹具为什么量出来仍是同一行) |
| `cli.js:1283`(现 1287)`reviseTargets` 辅助函数头顶 | 达标线/判旧/交集/定稿一概判在 `Domain.reviseTargets` 那一份里 | **仍准**,原样留 |
| `cli.js:1298` `reviseLowShots` 头顶 | 同 id 多行时改的是本轮那一行(`nth` 随重抽面带下来) | **仍准**,原样留 |
| `js/storyboard.js:43-62` 与预览那两块文案 | 已写明 `perShot` 是例外、会塌几条现算现报、回位是重跑整集审片 | **仍准**,一字未动 |
| 根 `README.md:300` 镜头 id 去重那条 | 已写明「旧整集审片报告是唯一会变的一处」 | **仍准**,一字未动 |
| `js/review.js:620` | 「按 `shotId` find 首行时…」说的是**改之前**会怎样(收编的理由) | **仍准**,原样留 |
| `tests/unit.js:3546/3579` 两句断言消息 | 「现跑证明…三处引用落到的是同一行」 | **仍准**(说的是本条夹具真量出来的那一次),原样留 |
| `tests/cli.smoke.js:297` | 「引用面…解析到的仍是同一行」 | **仍准**(那份夹具里同 id 只有一条逐镜分,`nth` 只有 0),原样留 |
| `js/domain.js:397/409` `dupCopy` 单位词表 | 「按 id 取到的是首位还是首行」 | **仍准**(说的是取镜/取主体,不是审片对位),原样留 |

**「仍准就留着」这一条按明令逐处执行**:`shots-dedupe` 引用面里「按首行解析、首行留原 id」那半句
对 `ep.uiSel` 与 `groupId` 仍逐字成立,改的只是把它从"三处一律"收成"这一类是这样、报告那一份不是"。

## 三、现跑量的那一遍(W287 那份夹具,本槽照跑)

四行 `dup/solo/dup/dup`、`perShot` 四条(`dup`9 / `solo`9 / `dup`5 / `dup`6),真 `js/domain.js`:

```
plan       ["2:dup→sh_new1","3:dup→sh_new2"]
去重前     reviewRows 落行 = 0,1,2,3    reviseTargets = 第3行@5分/nth1  第4行@6分/nth2
去重后     reviewRows 落行 = 0,1,0,0    reviseTargets = 第1行@5分/nth1  第1行@6分/nth2
uiSel      去重前 0 → 去重后 0(首行留的就是原 id)
perShot    去重前后逐字节相同(本命令一个字不改报告)
```

与 W287 §2.2 记的两行数字逐格相同。**改后的措辞就照这份读数写**:`uiSel` 那类按 id 取镜的仍落同一行;
`lastReview.perShot` 按行出条目、行对位走 `Domain.reviewRows` 的序数,同 id 只剩一行之后
落在首行之外的那几条一起退回首行;报告本身一个字不改,**回位仍是去重后重跑一次整集审片**。

## 四、落地形状(改了哪几句)

| 文件 | 处 | 改法 |
|---|---|---|
| `cli.js` | `:789`(`shots-import` 闸) | 「`findShot`/`shot-set`/**审片回写**全按 id 取首行」→ 去掉「审片回写」三字(它现在按行序数写) |
| `cli.js` | `:823`(`shots-dedupe` 头顶) | 同上那半句同样处置 |
| `cli.js` | `:825-829` | 「三处引用一律 `find` 首行、去重前后同一行」拆成两类:`uiSel` 那类仍首行同行;`lastReview.perShot` 按行序数对位(点名 `Domain.reviewRows`,并写明重抽面 `Domain.reviseTargets` 长在它之上),同 id 只剩一行后落在首行之外的条目退回首行,报告不改、回位靠重跑整集审片 |
| `cli.js` | `:851`(`--apply` 回执日志) | 「引用按首行解析,故 `lastReview`/`uiSel` 一个字未动」→ 分两句说:`uiSel` 那类仍落同一行;`lastReview` 一个字未动**但**报告按行序数对位、落在首行之外的逐镜结论会退回首行,回位请重跑整集审片 |
| `cli.js` | `:1818-1820`(help) | 同一句话的 help 版本照改(三行,列宽与相邻各行对齐) |
| `js/domain.js` | `:454-458`(`dupIdScan` 头顶) | 「两侧按 id 的引用**一律**…」的「一律」收掉,另补一句例外:分镜侧的整集审片报告按行序数对位、会塌、本扫描不改它一个字、回位靠重跑 |
| `tests/unit.js` | `:3489-3492` / `:3507` | 用例说明改成「`uiSel` 按 `find` 首行、`perShot` 与重抽面按行序数;**本条夹具里同 id 只有一条逐镜分**,故三处量出来仍是同一行」;量尺那行注释写清 `uiSel`/`perShot` 用 `findIndex`、重抽面直接取派生出的实位 |

**运行时零 diff**:`git diff` 全部落在 `/* */`、`//` 与两处字符串(一条 `log()`、一段 `HELP`)上,
`js/` 与 `cli.js` 没有一处可执行改动;`tests/` 只动注释,一条断言、一个夹具值都没碰。

## 五、判据面:这句话为什么能躺十几槽

改前(w302 尖 `e231046`,老措辞)与改后(本槽)各整跑一遍,**两边都是 `unit` 718/718、`integration` 152/152**。
即这几句话**一条判据都不接**——源级判据取的是 `blankNonCode(...)`(注释与字面量一并抹掉,
`tests/unit.js:3568/3578` 那两句正是这么取的),故注释准不准在树上无人看守。
这一格解释了残留能原样带十几槽:它既不影响行为,也不红任何一条用例,只能靠人读到并动手。

**本槽有意不给它立判据**。要立得钉「注释里出现某个标识符时旁边必须同时出现另一个」这类字面判据,
那是把散文钉死在一种写法上(W261 §残 已记过一次同形的坑:注释里出现 `Domain.reviseTargets`
会撞 SK-25 那条源级判据),代价高于收益;而真正会漂的那一层——`reviseTargets` 必须长在
`reviewRows` 之上——`contract` 早有两句钉着(`const rowsOf = ` 恰 1 次、`return D.reviewRows(ep)` 在场)。

## 六、数字(live 现跑)

| 项 | w302 自称 | 本槽 live | 说明 |
|---|---|---|---|
| `unit` 总数 | 718 | **718** | `node tests/unit.js` 718/718 PASS(改前在 `e231046` 上另跑一遍同为 718/718) |
| `unit · commands` | 75 | **75** | 未动 |
| `unit · domain` | 49 | **49** | 未动 |
| `unit · contract` | 153 | **153** | 未动 |
| `integration` | 152 | **152** | `node tests/integration.js` 152/152 PASS(改前同跑一遍同为 152/152) |
| `TOPIC_FLOOR` / 在册主题 | 30 | **30 / 30** | 本槽不新登记护栏主题,花名册与下限对齐未动 |
| `cli.smoke` | — | **115/117** | 单独跑、`env -u HUJING_SERVER` 及 `MV_*`;两条失败与 `master` 同名:`未登录 whoami → exit 3`(实得 exit=1)、`llm --json mock 链路`,明令允许 |
| 记账件份数 | 317 | **318** | 本份;`docs/skills-wave/README.md` 声明与 `tests/unit.js` 的 `FLOOR` 同步抬到 318 |
| `gaps()` 键数 | 20 | **20** | 一条没剥 |
| `Domain.dupIdScan` 同读处 | 4 | **4** | `cli.js` 两处、`js/roles.js`、`js/storyboard.js`,一处没动 |

`node --check` 过 `cli.js` / `js/domain.js` / `tests/unit.js` 三个改动文件。
`node cli.js help` 现渲一遍,`shots-dedupe` 那格三行与相邻各行列宽对齐。
不跑 `e2e`。README 帮助表那一格(`README.md:208`)不含被改的那半句,故**无需同步**;
根 `README.md` 一个字未动。

## 七、残留

1. **`cli.js:790` 那句「一个 id 收两笔视频钱、写回的还是首行」也已经不准了。**
   CLI 两条批量路径(`gen-episode` 与 `exec episode.generateVideos`)自 W248 起都按 `nthShot`
   逐行写回(`cli.js:969-986` / `:1196-1211` 现取),只有 `gen-shot-video <sid>` 这类按 id 点名单镜的
   仍落首行。**本槽明令只改审片对位那几处,故这一句原样留着**,登记在此:它与本槽收的是同一种病
   (寻址口径换了、旁边的说明没跟着走),但属于**视频写回**那一面,收它得连着两条批量路径与单镜路径
   一起现跑量一遍再动笔。
2. **注释准不准仍然零判据。** §五 量过:两种措辞全绿。下一次同类漂移照旧只能靠人读到。
3. **主体侧与镜头侧的去重说明仍各写一份**(W287 残留第 5 条、W299/W302 原样带下来的那条)。
   本槽在 `cli.js` help 与 `js/domain.js` 注释里又各让两侧的措辞分开了一点(镜头那一侧多出报告那半句),
   合并成一份模板的代价比 W302 记的时候更高了一点点。
4. 明令没碰的照旧没碰:不给入口加闸、`state-put` 不设闸、`gaps()` 不剥、SK-04、一对多跳转、
   `board`/`bb` 落点、回程、`Bus`、搜索缓存、主体侧那条绑变量名的判据。
