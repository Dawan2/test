# W217 · 主体空跑回执的「不在主体库」那一堆:同 id 两位时 `gone` 算成负数

**范围**:`js/domain.js`(+4 −1,`emptySubjectImageNote` 里数 `gone` 那一句)、
`tests/unit.js`(+1 条 `domain` 用例 + 两个 `FLOOR` 字面)、
`README.md` 与 `docs/skills-wave/README.md` 数字同步。
**基线**:`cursor/w212-integration-cb1e`(`18233eb`)。
**结论**:停工位**成立**——基线上 `gone` 既没有钳负也没有先去重,主体库里出现同 id 两位时
它算成 `-1`,回执逐字报出「`-1 位不在主体库`」;同一笔多减还会把真不在库的那个 id 抵消掉。
只修**计数**(按点名 id 逐个问库里有没有),「同 id 点名跑几位」的选人一字未动。
**不做**:不碰 `emptyBatchNote` / `shotIds` 那一侧、不碰 compose 的跳过档、不碰助手确认闸、
不拆 `Skills.gaps()` 键、不登记 `GUARD_TOPICS`、不 cherry-pick W214。

## 1. 基线 live 举证

### 1.1 纯函数面:`gone` 真的是负数

基线 `18233eb` 上直接 `require('./js/domain.js')` 跑(领域模块本就是双端 UMD,这一面就是产品代码本身):

```
夹具 subjects = [ {id:'dup', image:'a.png'}, {id:'dup'} ]        ← 库里同 id 两位
emptySubjectImageNote(p, ['dup'])
  → "点名的 1 位主体一位也没跑:-1 位不在主体库、2 位没能说清原因"   ← 负数逐字露在用户面

夹具 subjects = [ {id:'dup'}, {id:'dup'}, {id:'sj1'} ]
emptySubjectImageNote(p, ['dup'])        → "…:-1 位不在主体库、2 位没能说清原因"
emptySubjectImageNote(p, ['dup','ghost']) → "点名的 2 位主体一位也没跑:2 位没能说清原因"
emptySubjectImageNote(p, ['dup','dup','ghost']) → 同上(点名清单去重那一层照常工作)

对照(库里没有重复 id):
emptySubjectImageNote({subjects:[{id:'sj1'}]}, ['ghost']) → "点名的 1 位主体一位也没跑:1 位不在主体库"
```

两处后果分开记:

- **负数露面**:`say(n, t)` 只判 `if (n)`,`-1` 是真值,于是那一堆照样拼进句子;
  各堆之和也随之破了(`1 ≠ -1 + 2`,而"和恒等于点名数"正是这句话的立身判据)。
- **真不在库的那位被抵消**:`['dup','ghost']` 这一路 `gone = 2 − 2 = 0`,
  `ghost` 明明不在库里却一声不吭地落进安全阀那一堆——用户读到的是「说不清」,
  而实况是「你点的这个 id 库里没有」。这一条比负数更难看出来,基线上没有任何用例覆盖。

### 1.2 命令面:两端都够不着,而且够不着的理由说得清

`js/commands.js` 与 `cli.js` 的选人筛法都是 `(p.subjects || []).filter(s => ids.has(s.id))`,
`note` 只在 `!todo.length` 那一支才求值。同 id 两位时 `todo` 恰恰**非空**,这句话根本不被拼出来:

```
命令层(loadCommands 沙箱,genSubjectImage 换成记数桩)
  subjects = [{id:'dup'}, {id:'dup'}]  点名 ['dup']
    → result.total = 2   引擎实收 2 次(genSubjectImage:dup ×2)   note = undefined
  subjects = [{id:'dup', image:'a.png'}, {id:'dup'}]  点名 ['dup','ghost']
    → result.total = 2   note = undefined
```

更一般地:`note` 那一支的前提是"零个主体命中点名清单",此时
`subs.filter(s => ids.includes(s.id)).length` 恒为 0,`gone` 恒等于 `ids.length` ≥ 0。
**命令面上负数不可达是结构性的,不是碰巧**,故本槽不给两端命令加用例(加了也永远绿)。

这与 W214 登记的那句话逐字相符:「这一档在两端命令上够不着,纯函数面上现跑得出来」。

### 1.3 停工条件逐条核过

交接给的三条停工条件:基线 `gone` 有没有 `max(0, …)`、有没有先按主体去重再减。
基线那一句是 `const gone = ids.length - subs.filter(s => ids.includes(s.id)).length;`——
**两样都没有**,`subs` 一侧一次去重也没做。故不停工,按第 2 节修计数。

## 2. 改的是哪一句

`js/domain.js` `D.emptySubjectImageNote` 点名那一支里数 `gone` 的一句:

```js
// 基线
const gone = ids.length - subs.filter(s => ids.includes(s.id)).length;
// 本槽
const gone = ids.filter(id => !subs.some(s => s.id === id)).length;
```

数的东西换了一个:从「点名数减去命中的**主体条数**」换成「点名的 **id** 里库里找不到的个数」。
点名清单那一侧的去重(`[...new Set(picked)]`)一字未动,库那一侧不做去重也不需要——
判据本来就是"这个 id 在库里有没有人",有两位也还是"有"。

由此两条性质各自成立而且不互相顶替:`gone` 的取值范围是 `0..ids.length`(负不了),
且它只由点名清单决定,库里存了几位同 id 的主体一位都影响不到它(抵消不掉真不在库的那个)。

**选人一字未动**:同 id 两位点名跑 2 位,这是 `js/commands.js` / `cli.js` 各自
`filter(s => ids.has(s.id))` 的行为,本槽没碰——1.2 节把它现跑出来登记在案,
要不要按 id 只跑一位是产品口径题(见第 5 节)。

## 3. 加测

一条 `domain` 用例,与 W197 那条既有用例分开写(那条钉的是分档与镜头侧分得开,这条钉的是数法):

| 套件 | 用例 | 钉的是 |
|---|---|---|
| `domain` | `emptySubjectImageNote:库里同 id 存着两位时「不在主体库」按点名 id 数(gone 不许为负,更不许把真不在库的那位抵消掉)` | 任何一堆不许报出负数位、同 id 两位时那位不许被算成"不在主体库"、`['dup','ghost']` 里 `ghost` 必须自己露头报「1 位不在主体库」、两路各堆之和仍等于点名数、点名清单去重照旧 |

夹具自证有辨识力:`['dup','ghost']` 那一格是专门为"只把负数钳成 0"这手准备的——
`Math.max(0, …)` 在 `['dup']` 那一格看不出毛病(0 位不在主体库,句子也读得通),
只有在同一句里既有重复 id 又有真不在库的 id 时,它才把 `ghost` 吃掉。

## 4. 变异

四手,每手改完跑 `node tests/unit.js`,验完 `git checkout -- js/domain.js` 还原(还原后 `git status` 干净)。

| # | 变异 | 结果 |
|---|---|---|
| 1 | 退回基线那一句(`ids.length - subs.filter(…).length`) | 红 **1**:`任何一堆都不许报出负数位:点名的 1 位主体一位也没跑:-1 位不在主体库、2 位没能说清原因` |
| 2 | 只钳负:`Math.max(0, ids.length - subs.filter(…).length)` | 红 **1**:`同 id 那两位多减掉的一笔不许拿真不在库的那位来抵:点名的 2 位主体一位也没跑:2 位没能说清原因` |
| 3 | 数法改按缺图判(`!subs.some(s => s.id === id && !s.image)`) | 红 **1**(W197 那条既有用例):`有图的四位跑得到…实际:点名的 5 位主体一位也没跑:5 位不在主体库` |
| 4 | 摘掉点名清单去重(`const ids = picked`) | 红 **2**(W197 那条 + 本槽这条各一句) |

变异 1 与变异 2 分得开,这正是本槽把两句判据写进同一条用例的理由:
1 报的是"数出了负数",2 报的是"负数被藏起来了、代价是漏报一位",
两者在回执上给出不同的字符串,报错句各自印出实际那句话。

变异 3 拿来复核本槽没有削弱 W197 那条既有分档判据:数法一换,红的是它而不是本槽这条。

## 5. 回归数字(live)

| 套件 | 基线 `18233eb` | 本槽 |
|---|---|---|
| `unit` | 627/627 | **628/628** |
| └ `domain` 子套件 | 36 | **37** |
| `integration` | 147/147 | **147/147**(未动,实跑复核过) |
| `cli.smoke` | 107/109 | **107/109**(未动;失败仍是与 `master` 同名的那两条:`未登录 whoami → exit 3`、`llm --json mock 链路`) |

产品面只动 `js/domain.js` 一句(+4 −1,其中 3 行是注释);
`js/commands.js`、`cli.js`、`js/cmd-registry.js`、`js/plans.js`、`js/issues.js`、`js/release.js`、
`mcp.js`、`server.js` 一字未改。治理面零变动:`Skills.gaps()` 键数、注册表条数、短名单、
`CHECKS`、`preflightStages()`、`GUARD_TOPICS` / `GUARD_TOPICS_CLOSED` / `TOPIC_FLOOR` 一个数没动。

棘轮按 **live** 抬:`tests/unit.js` 单元 `FLOOR` 627 → **628**、记账件 `FLOOR` 225 → **226**;
`README.md` 的「单元测试(N 项断言」627 → 628;`docs/skills-wave/README.md` 明写份数 225 → **226**(含本份)。

## 6. 交接

1. **与 W214 的冲突面已现跑量过**(只做探测合并、当场 `--abort`,一个提交都没落):
   `js/domain.js` **自动合上且合对了**——W214 改的是同一个函数的入口判据
   (`picked && picked.length` → `Array.isArray(picked) && picked.length`)与它上方那段注释,
   本槽改的是往下第二句 `gone`,合并结果两处改动都在、`node --check` 过。
   真冲突全落在**带数字的那几行**:`tests/unit.js` 的两个 `FLOOR`、`README.md` 的单元用例数、
   `docs/skills-wave/README.md` 的明写份数与索引表尾。**两侧给的数一个都不是答案**
   (W214 叉在更早的点上,它那侧是 623 / 222;本槽是 628 / 226),合完得现取 live 再写。
2. **两条改动没有语义耦合**:W214 收的是"非数组 `subjectIds` 走不走点名那一路",
   本槽收的是"走进点名那一路之后怎么数",一个在闸上一个在堆上,合完两条用例应各自照旧红/绿。
   合入方值得顺手复核一格:W214 的 `Array.isArray` 闸把非数组挡成整集那一路之后,
   本槽这句 `gone` 根本不参与,两条用例的夹具没有交集。
3. **镜头那一侧同形的口子仍开着**:`emptyBatchNote` 里 `const gone = ids.length - hit.length`
   是同一种数法,分镜表里出现同 id 两镜时同样为负。交接明令不动 `shotIds` / `emptyBatchNote`
   (W216 的地),故本槽一个字没改,如实登记在此。收它的判据与本槽逐字同形,
   但那一侧还多三堆(`locked` / `fresh` / 安全阀)且都从 `hit` 里数,同 id 两镜会让
   **每一堆**都多算,收的时候得四堆一起判、不能只补 `gone` 那一句。
4. **"同 id 两位点名跑 2 位"本槽有意没碰**:1.2 节现跑出来的是命令层真起两次引擎、两笔生图钱。
   两端的写回口径顺手读了一眼源码(未 live 跑):浏览器那一端 `for (const s of todo)` 直接写
   循环拿到的那个对象,两位各得一张图;CLI 那一端每轮 `findSubject(projLive, s.id)` 取的是
   `.find(x => x.id === sid || x.name === sid)` 的**第一位**,于是两轮都写在同一位身上、
   第二位仍然没图。要不要按 id 只跑一位、或者干脆在主体入库那一层就不许出现同 id 两位,
   是产品口径题,动它会同时动到计费笔数与主体库的唯一性约束,不是回执文案能承担的。
5. **主体库里为什么会有同 id 两位**,本槽没有追到源头:主体导入/跨项目复制那几条路径是嫌疑面,
   但那是另一条线的活。本槽只保证这种库存在时回执说的是实话。
