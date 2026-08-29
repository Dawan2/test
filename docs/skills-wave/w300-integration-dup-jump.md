# W300 集成:把 W299(主体卡片小标跳到留原 id 的第 1 位)合入 W298 尖

## 一、这一槽的形状:快进形,而"diff 空集"照旧一个字都不作证

现取(全部以 `rev-parse` 为准,一侧的自称都不抄):

| 位 | SHA | 说明 |
| --- | --- | --- |
| P1(我方尖) | `808b56df982b53989c42cef7545d5cfeb63163c8` | `origin/cursor/w298-integration-59d3` |
| P2(对侧) | `3a98883f0a3dacd5b3f403bef30c3d8ac50684fe` | `origin/cursor/w299-dupjump-a914` |
| merge-base | `808b56df982b53989c42cef7545d5cfeb63163c8` | **恰等于 P1** |
| merge commit | `195f7e21618243fd67f9b8350bbdb5d9a4c42d03` | 本槽支尖 `cursor/w300-integration-06c6` |

W299 自称"从 w298 尖 `808b56d` 起支、HEAD `3a98883`",两个数**现取都对得上**;
`git rev-list P1 ^P2` 回空,即 P1 是 P2 的祖先,故这是集成线上又一条**快进形**槽。
仍按纪律走 `--no-ff` 留住并入点(零冲突,`ort` 策略一次过),P2 上那两条提交原样挂在第二父上。

快进形的代价照旧写在这里:`git diff M P2` **空集**、`tree(M) == tree(P2)`(两侧同为
`2daf1816691b043d52d6663be29146ee2a2ae45d`)。这两格**都不承载结论**——它们在"对侧的东西一件没丢"
与"对侧的东西压根没进来过"两种世界里长得一模一样,一条 `--ours` 或 `git checkout <old> -- .` 的误合
同样能让 `tree(M)` 自洽。故本槽的正面证据全压在另外两格上:

1. **变异台**——16 手打在合完的 `195f7e2` 上要红,同一批锚点打在 P1 上要**全部失配**;
2. **live 探针**——同一份探针在 P1 与合完两处各跑一遍,看翻绿几格。

`git diff P1 M` 是 7 个文件 397 增 23 删,与 W299 自报的落地面逐文件相符
(`README.md` / `docs/skills-wave/README.md` / `docs/skills-wave/w178-topic-floor-unlist.md` /
新增 `docs/skills-wave/w299-subject-card-dup-jump.md` / `js/domain.js` / `js/roles.js` / `tests/unit.js`)。
`js/sb-views.js`、`js/shotgroups.js`、`js/storyboard.js`、`js/episodes.js`、`js/projects.js`、
`cli.js`、`mcp.js`、`server.js`、`index.html` 一行未动。

## 二、变异台(16 手 + 1 手对照,全打在 merge tip `195f7e2` 上)

**先在 P1 上做锚点匹配**:17 手的锚点逐条拿到 `808b56d` 上试,**命中 0 处、全部失配**——
这就是快进形槽里"对侧的东西真进来了"唯一说得出话的那一格(合完那一侧 17 手锚点逐条命中,M6 命中 2 处)。

| 手 | 改哪 | 打哪个套件 | 结果 |
| --- | --- | --- | --- |
| M1 | `dupIdKeepOrder` 回 `at` 而不是 `Number(at)`(表的键原样带出去) | `domain` | 红 1 |
| M2 | 取不到时回 `undefined` 而不是 `-1` | `domain` | 红 1 |
| M3 | 不按序号升序取,改成 `Object.keys(t).reverse().find(...)` | `domain` | 红 1 |
| M4 | 找的是 `nth === 2` 而不是留原 id 那一处 | `domain` | 红 1 |
| M5 | `const jump = keep >= 0`(第 1 位自己那一枚也挂上跳自己) | `commands` | 红 2 |
| M6 | 派生回键 `data-dupjump` → `data-dupgoto`(渲与绑同轮改,行为等价) | `commands` | 红 1 |
| M7 | 落点号按 tab 过滤后那张表的下标写(`list.indexOf(s)`) | `commands` | 红 1 |
| M8 | 跨分类那一跳不切 tab,直接定位 | `commands` | 红 1 |
| M9 | **行为完全等价**:把找首位的算法抄到页面上,不再调 `Domain.dupIdKeepOrder` | `commands` | 红 1 |
| M10 | **行为完全等价**:定位动作抄第二份(接收者叫 `c2`) | `commands` | **绿——漏网,见 §2.1** |
| M11 | `TOPIC_FLOOR` 退回 28 | `contract` | 红 1 |
| M12 | 撤掉 `dedupe-card-jump-keep` 那条在册登记(花名册留着) | `contract` | 红 1 |
| M13 | README 单测数抄 W298 自称的 715 | `contract` | 红 2 |
| M14 | 单测 `FLOOR` 退到 713(**越过 `SLACK` 3 格缓冲**) | `contract` | 红 1 |
| M14b | (对照)单测 `FLOOR` 退到 714(恰在缓冲内) | `contract` | 绿 —— **设计内**,不拿减压阀冒充漏网 |
| M15 | 小标那一路顺手写一次库(纯导航破功) | `commands` | 红 1 |
| M16 | 花名册里改掉 `dedupe-card-jump-keep` 那一行(下限仍 29) | `contract` | 红 1 |

计:15 手当场红、1 手对照绿(设计内)、**1 手漏网**。W299 自报"11 手全红、漏网 0",
本槽加打的几手里有一手它没打到。

### 2.1 M10 那一格:判据在,但绑在接收者的**变量名**上

W299 为"定位动作只许有一处"写的判据是数字面出现次数:

```
assertEq((skel.match(/card\.scrollIntoView\(/g) || []).length, 1, '定位那一下……只许有一处')
```

数的是 `card.scrollIntoView(` 这个**连着接收者变量名**的字面。于是同一手"把定位动作抄第二份"
只要换个变量名就整条穿过去。三手同形变异并排跑,把它的边界量到字面:

| 手 | 第二份定位动作的接收者叫什么 | `commands` |
| --- | --- | --- |
| M10 | `c2` | 74/74 **绿(漏网)** |
| M10b | `card`(照旧) | 73/74 **红(咬住)** |
| M10c | `el` | 74/74 **绿(漏网)** |

即:这条判据只在"抄的那一份恰好也把变量叫 `card`"时成立。`js/roles.js` 全树 `scrollIntoView` 此刻
恰好只有一处,故 `\.scrollIntoView\(` 这个不带接收者的形状此刻同样只数得到 1——判据本可以收到那一档上,
而它没有。**本槽明令不代修**,如实记进 §七新增残留,连同这三手的现跑数一并留在这里,好让下一槽照抄边界。

教训与 W298 那槽 M8/M9 同源、另一面:那次是**按判据宿主选套件**,这次是**按判据的匹配面选变异**——
源级判据用字面量数出现次数时,变异得沿着那个字面量的自由度(变量名、空白、等价写法)各打一手,
只打"照原样再抄一份"那一手,量到的是判据的下界而不是它的实际边界。

## 三、live 探针(换判据类别:真起服务 + 真渲页面 + 真点)

单测那一层的 DOM 是桩——W299 这一槽正好顺手把 `roleDom` 的 `querySelectorAll` 改成按 `innerHTML` 现取,
卡片级绑定从此驱动得动,但**现造出来的节点仍是桩**:`dataset` 是照标记上写的值填的,
`style.outline` 是往普通对象上写的,`scrollIntoView` 是个空函数。故"卡片小标真点得动"这一跳在真 DOM 上另量一遍。

探针形状:真起 `server.js` 子进程(`MV_DATA_DIR` / `MV_UPLOADS_DIR` / `MV_CONFIG` 三个 env 重定向到
`/tmp`,`env -u HUJING_SERVER`)+ 真注册登录 + 真 `PUT /api/state` 灌一棵脏树 + 无头 Chrome + CDP +
页面里真 `Store.pullState()` + 真点主体 tab + 真 `click()` 那几枚小标。
脏树按"第 1 位在别的分类下"造:`dup` 三位分散在场景/角色两类,`two` 两位同在角色类。

同一份探针两处各跑一遍:

| 格 | P1(`808b56d`) | 合完(`195f7e2`) |
| --- | --- | --- |
| 真登录 + 真 `pullState` + 脏树到位(6 位主体) | PASS | PASS |
| 卡片带 `data-seat` 且按整库序号(角色 tab 上是 `1,2,3,4,5`) | **FAIL**(一个 `data-seat` 都没有) | PASS |
| 后续那几位各挂跳转、落点是本组留原 id 那一位的整库序号 | **FAIL**(四枚小标渲得出来,`data-dupjump` 一枚都没有) | PASS |
| 同分类那一跳:第 1 位那张卡真被高亮,tab 没换 | **FAIL**(点不着,`click` of undefined) | PASS |
| 跨分类那一跳:真切到「场景」tab 后定位,并 toast 点名切到哪一类 | **FAIL**(同上) | PASS |
| 纯导航:跳完服务端那棵树 `rev` 未动、6 位 id 一个没改 | PASS | PASS |
| 页面真加载了分镜那两处渲染文件 | PASS | PASS |
| **合计** | **3/7** | **7/7** |

翻绿的恰 **4 格**。P1 那一侧的失败句本身就是 W289 残留第 4 条的现场:
四枚小标**渲得出来**(`第 2/3 位`、`第 3/3 位`、`第 1/2 位`、`第 2/2 位` 逐枚在场),
而 `data-dupjump` 一枚都没有——"标出来了,但点不动、翻不到第 1 位"就是这个形状。

合完那一侧几个数原样抄在这里(探针现取,不是重述用例):

- `data-seat` 序列 `1,2,3,4,5`(角色 tab 上渲的是全库第 2–6 位,按 tab 下标写会是 `0,1,2,3,4`);
- 小标与落点:`第 2/3 位→0 | 第 3/3 位→0 | 第 1/2 位→(无跳转) | 第 2/2 位→4`;
- 同分类那一跳:`{"outline":"2px solid var(--accent)","tabHasA":false,"keeps":true}`;
- 跨分类那一跳:`{"outline":"2px solid var(--accent)","hasA":true,"hasC":false,"firstChip":true,"toast":true}`;
- 纯导航:`rev 1→1`,`dup,solo,dup,dup,two,two`。

## 四、四格核对(明令逐条)

**① jump 只挂非 keep 位。** 真 DOM 上现取:三枚撞车小标里挂跳转的是 `第 2/3`、`第 3/3`、`第 2/2` 三枚,
`第 1/2` 那一枚 `dataset.dupjump === undefined`;`第 1/3` 那一枚在场景 tab 上,跨分类那一跳之后现取同样不挂
(探针 `firstChip` 那一格断的就是"落点那张卡上挂的正是同一组的第 1 位")。判据侧 M5 红 2。

**② `keepOrder` 回数字。** `js/domain.js` 里是 `return at === undefined ? -1 : Number(at);`——
表的键是字符串,原样带出去时调用方 `keep !== seat` 那个严格比就永远不等,第 1 位那一枚会跟着挂上跳自己。
`domain` 段有 `typeof` 那一条钉着,M1(去掉 `Number`)与 M2(取不到回 `undefined`)各红 1。

**③ 分镜卡片仍不能跳。** `data-dupjump` 全树只有 **3 处、全在 `js/roles.js`**(渲一处 313 行、
绑一处 474 行、取一处 476 行)。`js/sb-views.js` 的 `dupRowTag` 回的仍是
`<span class="tag yellow" style="…" title="…">${c.label}</span>`,一个跳转属性都没有;
`js/shotgroups.js` / `js/storyboard.js` 同样零命中。本槽没顺手给它补(W299 残留第 1 条明令下一槽)。

**④ `dupCopy` 未改。** `git diff P1 M -- js/domain.js` 里 `dupCopy` / `dupGateNote` / `DUP_UNITS`
三个名字**零命中**——W299 只在那份 diff 里新增了 `dupIdKeepOrder` 一个函数(11 行)。
那句"点得动"是在 `js/roles.js` 展示层用 `c.title + '…'` 缀上去的,模板本身一个字没进。
`domain` 段 `dupCopy` 那两条(模板唯一那一份、十处调用逐处点名)现跑照旧全绿。

另**产品语义未动**:`git diff P2 M` 整树空集,W299 那一侧的行为一个字节都没被本槽改写。

## 五、live 数字(全部现跑,一个数不抄)

| 项 | 数 | 取法 |
| --- | --- | --- |
| `unit` | **717/717** | `env -u HUJING_SERVER node tests/unit.js`(起点在 P1 上现跑 **715**,+2 分别落在 `commands` 与 `domain`) |
| `unit · commands` | **74** | 73 → 74 |
| `unit · domain` | **49** | 48 → 49 |
| `unit · contract` | **153** | 未动 |
| `unit · skills` | **104** | 未动 |
| `unit · sb-views` | **11** | 未动 |
| `integration` | **152/152** | `MV_DATA_DIR`/`MV_UPLOADS_DIR`/`MV_CONFIG` 隔离到 `/tmp`,`env -u HUJING_SERVER` |
| `cli.smoke` | **115/117** | **单独现跑**,同上隔离 + `HUJING_CONFIG_DIR` |
| `e2e` | 明令不跑 | —— |

两个自称都没盲抄:W298 自称 `unit` 715、W299 自称 717,**live 是 717**,故 README 那句写 717
(M13 把它改回 715 时 `contract` 当场红 2)。

`cli.smoke` 那两条失败与 `origin/master`(`9adcf0ff964891dc17c352f6ae06db6ee7a9383b`)在同一套 env 下
**同名同表现**,那边现跑 51/53:

```
FAIL | 未登录 whoami → exit 3 | exit=1
FAIL | llm --json mock 链路 | undefined
```

`node --check` 逐个过:`js/domain.js` / `js/roles.js` / `tests/unit.js`。

## 六、并集与棘轮

`TOPIC_FLOOR` 与花名册**对齐到 live 的 29**(对侧自称 29,现取花名册正文恰 29 条,
末条是 W299 新登的 `dedupe-card-jump-keep`)——没有仍写 28,M11 把它退回 28 时当场红。
在册 / 销号 / 花名册 / 下限四数:**29 / 0 / 29 / 29**。

记账件三方对齐 **315**(目录实况 / `docs/skills-wave/README.md` 明写 / 索引表行数),`FLOOR` 314 → 315。
索引新增本文一行,插在 w299 那一行之后(索引按波次号递增那条判据接得住整行挪位)。

五格棘轮差额:

| 格 | live | `FLOOR` | 差额 |
| --- | --- | --- | --- |
| `unit` | 717 | 717 | 0 |
| `integration` | 152 | 152 | 0 |
| `cli.smoke` | 117 | 117 | 0 |
| 记账件份数 | 315 | 315 | 0 |
| 护栏主题 | 29 | 29 | 0 |

**`SLACK` 3 一格没用掉。** M14 有意选"越过缓冲"那一档(717 退到 713 才红),
M14b 对照那一手退到 714 落在缓冲格内、绿是设计内的。

`gaps()` 仍 **20 键**,一键没剥。`cli.js` / `mcp.js` / `server.js` / `index.html` 逐字节未动。
既有清单原样保留:`Domain.dupIdScan` / `dupIdMarks` / `dupCopy` / `dupGateNote` 一字未改,
新并入的是 `Domain.dupIdKeepOrder` 与主体卡片那条 `data-dupjump`。

## 七、残留(本槽**不代修**,W299 原话逐条保留)

W299 §八六条原话:

> 1. **分镜卡片那枚小标还不能跳。** 主体侧收了「跳到第 1 位」,镜头侧同形的那一条(「跳到第 1 行」)
>    明令点名下一槽。`Domain.dupIdKeepOrder` 收下 `dedupeShotScan` 换过单位词那份结果派生出来的位次表照样读得动
>    (本槽判据已把换单位词那一格喂过),要加的只有展示与定位那一层;而镜头侧的落点比主体侧多量一件事——
>    分镜卡片在四视图 + 剪辑台五档里各有各的渲法(缩略图卡 / 镜头组时间线),
>    "切到哪一档才看得见第 1 行"得像 W287/W291 那样先量一遍,不能照抄主体侧这条切 tab 的写法。
> 2. **`cli.js` 的 `shots-dedupe` 注释里点名 `Domain.reviseTargets` 的那半句仍不准**(W287 残留第 1 条原样在)。
>    明令不碰,继续记账点名。
> 3. **发现存量重复仍得先走到主体库那一页。** 项目详情面与项目列表那几枚角标点过来是"到主体库这一页",
>    落点仍是整页(页头那个入口),不是撞车那张卡;整树导入/恢复那几条路照旧能写进重复 id
>    (明令不给入口加闸),这仍是**存量**出口。
> 4. **跳转只有"去第 1 位"一个方向。** 站在第 1 位那张卡上,看不到"还有哪几位撞了我这个 id"——
>    它那一枚小标一个跳转都不挂(挂上就是跳自己)。要收得让第 1 位那一枚指向后续那几位(不止一位时还要挑一个或列出来),
>    而那是另一种形状的交互(一对多),不是本槽这条一对一的定位。
> 5. **切过 tab 之后回不去。** 跨分类那一跳把整屏卡片换了一批,toast 说了切到哪一类,
>    而"切回刚才那一类、回到刚才那张卡"没有路,只能自己点回原来那个 tab 再找。
> 6. **主体侧与镜头侧的展示文案仍各写一份**(W287 残留第 5 条原样在)。本槽又添了一句
>    (小标那句"点得动",在 `js/roles.js` 展示那一层),镜头侧下一槽多半要添同构的一句;
>    要合并成一份模板得先把"点了做什么"这一段与单位词一起参数化。

六条一条没代修:第 1 条已在 §四③ 现取核过(`data-dupjump` 全树 3 处全在 `js/roles.js`);
第 2 条 `cli.js` 本槽零 diff;第 3 条的两处角标落点本槽一行未动;
第 4/5 条在 §三那份真 DOM 探针里现取仍是这个形状(第 1 位那一枚不挂跳转、跨分类切过去之后没有回程);
第 6 条那句新添的文案原样在 `js/roles.js` 展示层。

**本槽新记一条:**

7. **"定位动作只许有一处"那条源级判据绑在接收者的变量名上。** 它数的是 `card.scrollIntoView(`
   这个连着变量名的字面,故同一手"把定位动作抄第二份"换个变量名(`c2` / `el`)就整条穿过去
   (§2.1 三手现跑:`card` 红、`c2` 绿、`el` 绿)。`js/roles.js` 全树 `scrollIntoView` 此刻恰好只有一处,
   故收到 `\.scrollIntoView\(` 这个不带接收者的形状上此刻不会误伤——本槽明令不代修,留给下一槽。

## 八、这一槽可复用的两件事

- 要给**源级"只许有一处"的字面计数判据**设变异时:别只打"照原样再抄一份"那一手。
  沿着那个字面量的自由度各打一手(变量名、空白、等价写法),不然量到的是判据的下界而不是边界——
  M10/M10b/M10c 三手并排跑才把边界钉到"绑在变量名上"这句话上。
- 要合一条**"对侧做的是交互"的快进形**槽时:live 探针这次是说得出话的那一格(与 W298 那条纯收编槽相反,
  那次渲出来前后逐字节相同、探针得自己动手改一处才有话说)。交互槽只要造出"第 1 位在别的分类下"这棵脏树,
  同一份探针在两端就是 3/7 与 7/7,而 P1 那侧的失败句(小标渲得出来、`data-dupjump` 一枚没有)
  正好是对侧那条残留的现场,比任何 diff 都说得清合进来的是什么。
