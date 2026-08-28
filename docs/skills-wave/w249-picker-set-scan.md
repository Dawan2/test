# W249 · 选人闸「按 id 收窄」的源级判据从钉一行的字面改成钉一段的语义

基线:`origin/cursor/w247-integration-5e1b`,先 `fetch` 再 `rev-parse` 现取 tip `bfd4cca`
(交接给的就是这条支,SHA 不从交接文抄;`bfd4cca` 是 W247 那条把份数与记账件下限校到 262 的 docs 提交)。

**结论先写:W245 §五第 4 条登记的那格盲区 live 复现了,不停工,收紧那条扫描。**
`tests/unit.js` 新开一份模块级判据 `pickerNarrowHits(skel, picked, target)`:骨架按**语句**取
(续行随括号一并收进来),再顺着赋给 `pend`/`todo` 那条语句引用到的标识符回溯本段声明做一次浅数据流。
放行的只有点名清单自己建的成员集 `new Set(args.shotIds)` / `new Set(args.subjectIds)` 且它只许被读;
闭包里另起 Set/Map、对象累加器、按位比的 `findIndex`/`indexOf`、或对成员集 `add`/`delete` 边筛边改,
一律算「点名清单到待跑清单之间的去重」。`contract` 两条既有用例(镜头 `dupRowsNote`、主体 `dupSubjectRowsNote`)
各把那行老扫描换成现取这一份,**用例不增条**,另在两条里各加一段判据自证。

**产品码零改动**:`ids.has(s.id)` 按行/按位筛四处一个字未动,`js/commands.js` 与 `cli.js` 零 diff。
**没碰的**:`cli.js` 的 `findShot`/`nthShot`(W248 的地,全树 `nthShot` 仍 0 处)、`state-put` 逃生舱(仍只有 `need(f.force)`)、
三份 `dup*Note`/`empty*Note` 派生、`Skills.gaps()`、`GUARD_TOPICS`/`TOPIC_FLOOR`/`SLACK`。

---

## 一、先 live:那条 contract 现在到底扫什么

`tests/unit.js` 两条 `contract` 用例里各有一处同形写法(改动之前逐字现取):

```
镜头侧  const narrow = skel.split('\n').filter(t => /\b(pend|todo) = /.test(t) && /(new Set|findIndex|indexOf\()/.test(t));
主体侧  const narrow = skel.split('\n').filter(t => /\btodo = /.test(t)        && /(new Set|findIndex|indexOf\()/.test(t));
```

即:抹掉注释与字面量之后**逐行**看,一行里同时出现「`pend =`/`todo =`」与「`new Set`/`findIndex`/`indexOf(`」才算收窄。
判的是**某一行上的字面**,不是「点名清单到待跑清单之间有没有去重」。

活树上那一段本来就长这样(`js/commands.js` L107–109,`cli.js` L1113–1115 同形):

```
const ids = new Set(args.shotIds);            ← 点名清单自己那个成员集,写在上一行
pend = (ep.shots || []).filter(s => !s.final && ids.has(s.id)
  && (!Store.shotVideoReady(s) || Domain.shotVideoStale(p, s, online())));
```

**上一行本来就允许有一个 `new Set`**,这正是老扫描只敢钉 `pend =` 那一行的由来,也正是它的盲区:
再往上一行摆第二个 Set,它就什么都看不见。

### 1.1 停工条件逐条核过

| 条件 | 现跑 | 判 |
|---|---|---|
| 现跑已扫「点名清单到 `pend` 之间任意去重」 | 老判据是 `split('\n').filter(...)` 的**逐行**字面扫;演练里 7 手改法只接住 1 手(§三) | **不成立** |
| 产品有意只钉那一行 | 用例注释写的是「`ids.has(s.id)` 之后不许冒出按 id 收窄的去重」,钉的是语义;W245 §五第 4 条明写这是**盲区不是有意**,并把"要收得改成语义面判据"写进了交接 | **不成立** |
| 收紧就得动产品行为 | 收紧的是判据,`ids.has` 按行筛四处一个字不用动(合完 `js/commands.js`/`cli.js` 零 diff) | **不成立** |

故不停工,收紧扫描。

---

## 二、改了什么(全在 `tests/unit.js`,产品码零改)

### 2.1 新判据 `pickerNarrowHits(skel, picked, target)`(+50 行,模块级,两侧四处共用)

三步:

1. **切语句**:骨架逐行读,`(`/`[` 未配平就是续行,与下一行并成一条;
   另外,`;`/`{`/`}` 收尾的行一律另算一处边界并把深度归零——
   **段首那一行是从函数头中间切开的**(`reg('episode.generateVideos'` 之后那一段起手就是 `, { label: … }, ({ p, ep, args }) => metered(REG[…], async () => {`,
   括号净开着),不设这道边界整段会被并成**一条**语句,段尾任何一处 `new Set` 都会被算到待跑清单头上
   (这不是推演:第一版就是这么写的,`js/commands.js` 当场红在 `const urls = [...new Set(pend.flatMap(…))]` 那句真人预审上)。
2. **取赋给 `pend`/`todo` 的那几条语句**,顺着它引用到的标识符回溯本段里的声明(最多三层,访问过的名字不重复展开)。
3. **在这个闭包里判**:

| 形状 | 判 |
|---|---|
| `new Set(<点名清单>)`(`args.shotIds` / `args.subjectIds` 逐字相等) | 放行——这是选人闸自己那个成员集 |
| 同一个成员集在本段里被 `add`/`delete`/`clear` | 红:边筛边改,`ids.delete(s.id)` 一手就把按行筛变成按 id 只跑一行 |
| 其它 `new Set(...)` / `new Map(...)` / `new WeakSet` / `new WeakMap` | 红 |
| `.findIndex(` / `.indexOf(` / `.lastIndexOf(` | 红:按位比只取首行 |
| `Object.create(...)` 或右值就是 `{}` | 红:跨行攒状态的累加器 |

### 2.2 两条既有用例各换一行、各加一段自证

```
- const narrow = skel.split('\n').filter(t => /\b(pend|todo) = /.test(t) && /(new Set|findIndex|indexOf\()/.test(t));
+ const narrow = pickerNarrowHits(skel, 'args.shotIds', 'pend|todo');        ← 镜头侧
+ const narrow = pickerNarrowHits(skel, 'args.subjectIds', 'todo');          ← 主体侧
```

失败句一个字没改(仍是「待跑清单被按 id 收窄了——第二行/第二位会永远跑不到」)。

**自证两个方向都占一条**:镜头侧造四手改法(上一行另起去重集 / 成员集边筛边删 / 按位比只取首行 / 对象累加器)
喂给同一个函数,扫不出来即红——判据退回钉字面时在这里当场说话;
反面拿活树上那一句(点名清单建成员集、只按 id 判在不在)钉住它**不许**被判成收窄,
否则"收紧"就变成把闸判死、点名两行反而跑不成两行。主体侧同形各一条。

---

## 三、变异演练:新旧判据同一份改法各跑一遍

每手只改一个产品码文件、跑完 `git checkout` 回读清场;旧判据那一栏在 `HEAD~1` 的独立 worktree 上现跑
(不是回忆,是真跑了两遍 `contract`)。判据在演练之前已经提交。

| # | 怎么改坏 | 旧判据 | 新判据 |
|---|---|---|---|
| M8a | 镜头 `js/commands.js`:上一行 `const seen = new Set()` 再 filter | **145/145 全绿** | 红 |
| M8b | 镜头 `cli.js`:同上 | **145/145 全绿** | 红 |
| M8c | 主体 `js/commands.js`:同上 | **145/145 全绿** | 红 |
| M8d | 主体 `cli.js`:同上 | **145/145 全绿** | 红 |
| M8e | 镜头 `js/commands.js`:`ids.has(s.id) && ids.delete(s.id)`(不另起变量,把点名成员集边筛边删) | **145/145 全绿** | 红 |
| M8f | 镜头 `cli.js`:行内 `xs.findIndex(x => x.id === s.id) === i` | 红(这一手本来就在老扫描射程里) | 红 |
| M8g | 主体 `cli.js`:上一行 `const ran = {}` 对象累加器 | **145/145 全绿** | 红 |

**七手里旧判据只接住一手**,而那一手正是它当初照着写的那种写法(字面落在 `pend =` 那一行上)。
M8e 是演练里补出来的一手,W245 没列过:它连"挪到上一行"都不用——
点名成员集自己就是可变状态,`delete` 一下第二行就永远跑不到,而全段只有一个 `new Set` 且写在老扫描不看的那一行上。

**行为面那一层照旧在,而且比 contract 说得细**。同一手 M8 在整跑里红几条(全套件 666 条):

| 改法 | 基线 | 本槽 |
|---|---|---|
| M8a(镜头) | 2 红:`commands`(三行一行都不许少跑)+ `release`(G6 两行都得真跑到) | **3 红**(+`contract`) |
| M8c(主体) | 3 红:`commands` × 2 + `release`(G9 两位都得真跑到) | **4 红**(+`contract`) |

源级这一条不替代行为面,它换的是**报错的时刻与话**:行为面说"这一趟少跑了一行",
源级说"你在点名清单到待跑清单之间加了去重"——改的人先读到后一句。

---

## 四、live 数字(全部现跑,含本文)

| 项 | 基线 `bfd4cca` | 本槽 |
|---|---|---|
| `node tests/unit.js` | 666/666 | **666/666 PASS** |
| `node tests/integration.js` | 148/148 | **148/148 PASS**(未加用例,复跑过) |
| `node tests/cli.smoke.js` | 115/117 | **115/117**,失败仍是同名那两条:`未登录 whoami → exit 3`、`llm --json mock 链路` |
| `contract` 套件条数 | 145 | **145**(两条既有用例改判,不增条) |
| 记账件份数 | 262 | **263**(含本文) |

棘轮同轮抬到当轮实况:`const FLOOR = 263;`;
`['单元测试', 666, …]`(不增条,未动)、`['集成测试', 148, …]`、`['CLI 冒烟', 117, …]`、`TOPIC_FLOOR` 未动。
`README.md` 的用例数一个都没变,只在镜头 `dupRowsNote` 那一段把「源级另钉住待跑清单不许被按 id 收窄」
展开成本槽的实况(按语句取 + 浅数据流 + 四种写法一律红),主体那一段补一句"与镜头侧共用同一份扫描"。
`GUARD_TOPICS` / `SLACK` / 花名册一行未动(本槽没有新护栏主题:收紧的是既有两条用例的判据,不是新立一面)。
`node --check` 过:`tests/unit.js`。

按用户约定,`node tests/e2e.js` 本槽**未跑**。

---

## 五、交接

1. **多扣费这件事本身仍在,本槽连"说错话"那一半都不是——收的是判据。** 用户手打点名一个 id 仍然跑几行扣几笔,
   那句 note 照旧会播、照旧指向 `shots-dedupe`;选人闸按行筛/按位筛四处一个字未动。
2. **新判据的射程是"写法族"不是"语义"。** 它认得 Set/Map/对象累加器/按位比这四类跨行状态,
   认不得的还有:把去重挪进另一个函数(`pend = dedupeById(xs, ids)`,回溯到的是函数名而不是函数体)、
   或者挪去 `js/domain.js` 里当派生。真正管这类改法的仍是行为面那两三条(引擎实收几行/几位)。
   **源级判据是先说话的那一层,不是最后那一层**,别把它当唯一防线——这句话 W245 就写过,本槽只是把它的射程往前推了一格。
3. **`cli.js` 的 `findShot` 取首位按明令一个字没碰**(W248 的地),全树 `nthShot` 现取仍 0 处。
4. **`state-put` 不设闸**:`CMD['state-put']` 仍只有 `need(f.file, …)` 与 `--force`,没设闸。
5. **判据自证是本槽唯一新增的断言面,它自己没有第二层判据。** 自证段里那几份造出来的片段是硬编码字符串,
   哪天 `pickerNarrowHits` 的入参形状变了,得同轮改它们——改漏了会红在自证那一条上(不是恒真),这是有意的。
6. 冲突面提示:`tests/unit.js` 三处——`blankNonCode` 与 `reportBlockHeads` 之间插入 `pickerNarrowHits`
   (+50 行,与 W245/W246 改过的那几段都不相邻)、两条 `contract` 用例里各换一行加一段自证、`FLOOR` 一个数字位;
   `README.md` 是同一长行里的两处散文替换(不改数字位,与只改数字的槽不冲突);
   `docs/skills-wave/README.md` 是份数行 + 一条索引行。
