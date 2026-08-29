# W281 `landed` 的座位只在本轮引擎成功之后才登记:补上能红的判据

> 起点:`origin/cursor/w280-integration-9c17` 现取 `d6eabbcb95d6dd6c1b884160892367f2d9d56ed6`
> (与交接自称的尖 `d6eabbc` 逐字节一致,`checkout -b` 后现取核过)。
> 功能支:`cursor/w281-landed-seat-8f31`。

## 一、结论先写

**只加测,产品面零 diff。** 现网四处批量出口的座位登记本来就排在本轮引擎成功之后
(逐处现取核验见 §二),故本槽一行产品代码没改——按明令「若现网实现已经是成功后才登记,只加测、不改产品」。

W279/W280 连续两槽记着的那句残留(**「座位只在本轮真成功后才登记」仍无判据,提前登记红 0**)本槽收掉:
把任一处的 `seats.add` 提到取行/取位之后、开跑之前,现在**各红 2**(行为面点名「landed 报 3 而磁盘上只有两行有片」、
源级面点名「挪的是哪一处」),五手变异逐手现跑,一手不剩红 0 的。

顺带把 W278 §四 M8 量到的另一格也收了:`landed` 这一族此前**全树零源级判据**,本槽补上一条源级锚并把它
登记进护栏主题(`landed-seat-order`),于是「删掉这两条测 + 把四处数字一并改小」这种成套改法
从 W280 CF2 那次的**红 0** 变成**红 3**(§五)。

## 二、现网实现现取核验:四处此刻都是「成功之后才登记」

| 出口 | 现取实况 | 座位登记排在哪 |
|---|---|---|
| `cli.js` `CMD['gen-episode']` | `seat` 在 `withProject` 回调里取行时算好,`seats.add(seat)` 在回调外 | `if (r.ret) throw r.ret;` → `result.ok++` → `seats.add(seat)`,失败轮在 `throw` 那里就走了 |
| `cli.js` `EXEC['episode.generateVideos']` | `seats.add(...)` 写在回调里,`genShotVideo` 的 `try/catch` **之后** | 引擎抛错时 `return e` 先走,那一句跑不到 |
| `cli.js` `EXEC['subject.generateImage']` | `seats.add(...)` 排在 `sj.image = (await genImage(...)).url` 之后 | `genImage` 抛错时异常穿出回调,那一句跑不到 |
| `js/commands.js` `reg('subject.generateImage')` | `if (s.image && s.image !== before) { okCnt++; seats.add(...) }` | 与 `okCnt++` 同一个成功闸,一个字都不用改 |
| `js/commands.js` `reg('episode.generateVideos')` | `seats` 由 `landedRows = pend.filter(s => Store.shotVideoReady(s))` 派生 | 不在循环里登记:失败行**结构上**进不来 |

第五处形态不同(派生而非登记),故它不进「排在引擎之后」那张表,单独由「仍由 `landedRows` 派生」两句锚点守。

## 三、加的两条判据:为什么是两条而不是一条

原打算写成一条(六档行为面 + 末档源级锚)。**先做了一手变异才定稿**:提前登记任一处,
那一条在自己第一档上就 `assert` 抛了,末档的源级锚**一行没跑到**——一条用例只报一句。
合在一处的写法等于让源级这半边在变异下永不开火,与 W280 §四 M3 量到的「点名对象与真开火点错位」同类。
故拆成两条,五手变异下各红 2、两句报错各说一件事。

### 条 1 行为面(六档,`commands` 套件)

夹具的形状是明令点的那一档:**取行/取位成功,而本轮引擎才失败**。判据先钉住这个前提
(失败话术必须是引擎那一句;报「镜头不存在」/「主体不存在」说明夹具压根没跑到引擎,座位那半边又没被开火),
再钉 `landed` 恒等于磁盘上真到手的行数/位数、且永不超过 `ok`:

| 档 | 出口 | 造的什么 | 钉的什么 |
|---|---|---|---|
| ① | CLI `gen-episode` | 同 id 三行,中间那行 `genShotVideo` 上游 502 | `ok:2`、`landed:2`(提前登记会报 3)、`landed == filmed(rows)` |
| ② | CLI `gen-episode` | 中间那行缺底图,补底图那台引擎(`genImage`)就断 | 视频一次没跑那一行同样不占座位(这一路的异常是穿出回调而不是 `return e`) |
| ③ | `exec episode.generateVideos` | 同 ①,整集那一路(不点名故不带 dup 那句) | 同 ①,并钉 `note` 仍不在场 |
| ④ | `exec subject.generateImage` | 同 id 三位,第二位 `genImage` 失败 | `ok:2`、`landed:2`、`landed == 真有图的位数` |
| ⑤ | 浏览器 `subject.generateImage` | 引擎回来没写 `s.image` 的那一位 | 两端一个口径:没出图那一位不占座位 |
| ⑥ | 浏览器 `episode.generateVideos` | `__genFail` 让中间那行失败 | 座位由「真就绪的行」派生,失败行进不来 |

落库面一律读 `cliDisk` 那份 clone 语义的夹具(编排层只在自己手里那份快照上改一改也会看起来「落库了」);
①②③的引擎桩按下发次序发各不相同的片,失败那一轮照真引擎的样子**先写回 `s.video` 失败态再抛**。

### 条 2 源级锚(`commands` 套件,注释不算数)

四处循环各取实现段(`blankNonCode(src, true)`:抹注释、留字面),逐处判三件事——
`seats.add(` 在段里**只此一处**(拦「再补一条提前登记的路」这种加法)、本轮引擎那一步取得到、
且引擎在前座位在后;`gen-episode` 那处另钉「排在 `if (r.ret) throw r.ret;` 之后」;
浏览器批量视频那处钉两句派生关系(`landedRows` 按 `Store.shotVideoReady` 筛、`seats` 由 `landedRows` 派生)。
取不到锚点一律当场红并写明「挪窝/改名就同轮改这里」,不留成恒真。

同轮把这条源级锚登记进护栏主题 `landed-seat-order`(锚点 `landedRows` + `seats.add(`,`hosts` 缺省 1),
花名册补一行,`TOPIC_FLOOR` 19 → **20**。

## 四、变异:五手,全部本槽现跑

每手都改产品面、跑 `commands`/`contract`/`skills`/`domain` 四套件后复原。

| 手 | 做的什么 | 现取红数 | 报错句(原样抄出,取行为面那一句) |
|---|---|---|---|
| M1 | `gen-episode`:`seats.add(seat)` 提到取行之后 | **红 2** | `本轮引擎失败那一行不许占座位(提前登记会报 3,而磁盘上只有两行有片):首行:/uploads/gen/v1.mp4 \| 第二行:无片 \| 第三行:/uploads/gen/v3.mp4:期望 2,实际 3` |
| M2 | `exec episode.generateVideos`:座位提到开跑之前 | **红 2** | `exec 那条批量同形:失败那一行不占座位:…:期望 "2/2",实际 "2/3"` |
| M3 | `exec subject.generateImage`:座位提到开跑之前 | **红 2** | `本轮生图失败那一位不许占座位:A-首位:/uploads/img/g1.png \| B-第二位:无图 \| C-第三位:/uploads/img/g3.png:期望 "2/2",实际 "2/3"` |
| M4 | 浏览器 `subject.generateImage`:座位提到 `await` 之前 | **红 2** | `浏览器那一端同形:没出图那一位不占座位:…:期望 "2/2",实际 "2/3"` |
| M5 | 浏览器 `episode.generateVideos`:`seats` 改按 `pend` 算 | **红 2** | `浏览器批量视频那一端:失败行不占座位:…:期望 "2/2",实际 "2/3"` |

五手的第二句红一律来自源级锚,各自点名犯规那一处(`cli.js gen-episode` / `cli.js exec episode.generateVideos` /
`cli.js exec subject.generateImage` / `js/commands.js subject.generateImage` / 浏览器批量视频那句派生),
**没有一手落到同一句话上**;`contract`/`skills`/`domain` 三套件五手各红 0(本槽判据都在 `commands`)。

**M1 就是 W280 §四 M6 那一手。** 那次三套件各红 0、整份 `unit` 仍 696/696,本槽同一手现跑红 2 ——
残留 9 那一格按「同一手变异从红 0 变成红 2」读作收掉,不靠文档口径。

## 五、反事实:这两条能不能被静默删掉

| 手 | 做的什么 | 现取红数 |
|---|---|---|
| CF1 | 只删两条新用例,文档与四处下限一个字不改 | **红 4**:README 数字对账 + 三套件下限 + 护栏主题失联(点名 `landed-seat-order`)+ 护栏抽样前提 |
| CF2 | 删两条 + README 改 696 + 单元 `FLOOR` 改 696 + `TOPIC_FLOOR` 改 19 + 花名册那行删掉 | **红 3**:护栏主题失联 + 抽样前提 + 销号判词(「撤掉最后一条并把下限一并改小,判词须点名 `landed-seat-order`」) |
| CF3 | 只删源级锚那一条,行为面留着 | **红 4**:同 CF1(数字层两条按 697 报,护栏两条照旧) |
| CF4 | 删两条 + 三处数字改小 + 把主题**显式销号**(搬进 `GUARD_TOPICS_CLOSED` 并写下闭合理由) | **红 0** |

**CF2 是本槽最实在的一格。** W280 §五 CF2(删掉那条判据 + README 与 `FLOOR` 两处齐改)现取**红 0**——
`landed` 这一族当时只有数数那一层网。本槽把源级锚登记进护栏主题之后,同形的「四处齐改小」仍红 3:
要真拆掉,只剩 CF4 那条路——**在源码里写下闭合理由**,那是留痕动作,不是静默删除。

## 六、live 数字与棘轮

八格逐个现跑,一个数没盲抄:

| 面 | 起点 `d6eabbc` | 本槽 | 差 |
|---|---|---|---|
| `unit` | 696 | **698** | +2 |
| `commands` | 59 | **61** | +2 |
| `contract` | 153 | **153** | 0 |
| `domain` | 44 | **44** | 0 |
| `skills` | 104 | **104** | 0 |
| `issues` | 22 | **22** | 0 |
| `integration` | 152 | **152** | 0 |
| `cli.smoke` | 115/117 | **115/117** | 0 |

`cli.smoke` **单独整跑**(`env -u HUJING_SERVER -u MV_ACCESS_KEY -u MV_SECRET_KEY -u MV_API_KEY -u MV_REGION`),
两条失败:`未登录 whoami → exit 3 | exit=1` 与 `llm --json mock 链路 | undefined`;
同 env 下 `master` `9adcf0f` 独立 worktree 现跑 **51/53**、失败两条**同名同表现**,按纪律允许。
`e2e` 未跑(明令)。

棘轮:单元那格 `FLOOR` 696 → **698** 抬到 live(差额 0),`README.md` 的「单元测试(N 项断言」同轮校齐;
护栏主题那格 `TOPIC_FLOOR` 19 → **20**(在册 20 / 销号 0 / 花名册 20 行,四者对齐);
记账件那格由本文从 295 抬到 **296**(三处同轮校齐:目录实况、`docs/skills-wave/README.md` 明写份数、
`tests/unit.js` 的 `const FLOOR` 字面);集成与冒烟两格未动。五格差额 **0/0/0/0/0**,`SLACK` **3** 一格没用掉。
`Skills.gaps()` **20** 键逐个在册,一个没剥。

## 七、明令未做的(逐条现取核对)

| 明令 | 现取实况 |
|---|---|
| 不扩到单发七条出口、不给它们硬加 `landed` | 未动。`shot.generateVideo` 等单发出口零 diff |
| 不改产品(若已是成功后登记) | `js/` 与 `cli.js` 相对起点**逐字节零 diff**,改的只有 `tests/unit.js` / `README.md` / `w178-topic-floor-unlist.md`(加本文与索引行) |
| 计费走 `Tasks.run`、共位仍不退费 | 未触及:`metered`/`Tasks.run` 与 `ok` 的口径一个字没动,共位覆盖照旧不退费 |
| 不 state-put 加闸、不主体 shots-dedupe、不清 `gaps()`、不动 SK-04 | 四处零 diff |
| 不改镜号瞬时/落库/提示词、`common`/`cut`、`findShot` 其它调用 | 零 diff;`findShot`/`nthShot`/`nthSubject` 的调用点一处没动 |
| README 行为变了同步 | 行为没变,README 只同步了断言条数 |

## 八、残留

1. **`landed` 这一族的源级锚只覆盖「登记时序」这一面。** 座位键的形状(`id + '#' + 同 id 里第几位`)
   此刻仍只有行为面判据(W280 §四 M3 已量出那一手真开火在①档、不在自称的⑤档),源级面一句没写。
2. **`gen-episode` 那处的 `seat` 是回调外的局部变量。** 本槽的锚只判「`seats.add` 排在引擎之后」,
   判不了「`seat` 这个变量在回调里被赋值、回调外被读」这件事本身——把赋值挪出回调(改回按 `ep.shots` 数)
   行为面会红在别处(序数错位那几档),但源级这一层读不出来。
3. **两条新判据都在 `commands` 一个套件里。** 源级锚按形态更像 `contract` 套件的东西
   (它读的是源码而不是跑产品),放在 `commands` 是为了让它与行为面那条挨着、变异时两句红一起出;
   代价是「按套件分工」这条隐规矩上多了一处例外,往后真要搬,得同轮改护栏主题的落点计数。
4. **失败轮的退费路径本槽一个字没验。** 判据只钉「失败轮不占座位」,没钉「那一笔真退了」——
   退费口在 `Tasks`/服务端,`cli.js` 那一侧的夹具把服务端往返整段换成了桩,现有形状量不到。
5. **W280 §四 M9 那把跨支量尺本槽没量。** 本槽只动测试面与两份记账,`js/sb-views.js` 零 diff,
   照 W280 的读法结论必然是「分家」,量它不新增信息,故明写没量而不是抄一个数。
6. W277 起历次残留(写回路径、`result.shots` 按 id 记、`ok` 口径与计费)按明令一条没代修,原话逐条保留。
