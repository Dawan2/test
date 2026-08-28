# W251 · `nthSubject` 两处兜底补上行为面判据:并发改表那一档主体侧此前是空的

基线:`origin/cursor/w250-integration-4c7a` 现取 tip `367f7bc`(先 `fetch` 再 `rev-parse`;
交接自称 W250 merge 是 `dcdfaa4`,现取 tip 是它之后那份校数字的 docs 提交,这一格照旧现取不抄)。
分支 `cursor/w251-nth-subject-fallback-9b3e`。

**结论先写:停工条件不成立,盲区现取核实确实开着,补了一档判据,产品码零改动。**
`cli.js` 的 `nthSubject` 有两处兜底——序数越界时的 `rows[nth] || rows[0]`、同 id 一位不剩时的
委托 `findSubject`——**两处一起摘掉全树 667/667 全绿**。镜头侧同一手立刻红 1。
差别只在 W248 为镜头侧补过「并发改表」那一档,主体侧没有对应档。
本槽照那一档同形给主体侧补上,`tests/unit.js` +1 档(不增条,插在既有那条用例的 ④ 之后)。
**`nthSubject` / `nthShot` 行为一个字未动**;`state-put` 未设闸;选人闸仍按位筛;
`pickerNarrowHits` 未碰;`Skills.gaps()` 未剥。

---

## 一、先 live:盲区在不在,两侧强度差多少

### 1.1 主体侧:两处兜底一起摘,全树不响

`cli.js` L187–190 现况:

```
const nthSubject = (proj, sid, nth) => {
  const rows = (proj.subjects || []).filter(x => x.id === sid);
  return rows.length ? (rows[nth] || rows[0]) : findSubject(proj, sid);
};
```

把第三行改成 `return rows[nth];`(两处兜底一起摘)再整跑:

```
node --check cli.js   过
node tests/unit.js        ===== 667/667 PASS, 0 FAIL =====
node tests/integration.js ===== 148/148 PASS, 0 FAIL =====
```

**一条都不红。** 交接登记的这一格现取核实成立,不是抄它的结论。

### 1.2 镜头侧:同一手立刻红 1

`nthShot` 那三行照同一手改成 `return rows[nth];`:

```
FAIL | commands · episode.generateVideos 同 id 多行:每一轮的片落到本轮那一行(…)
     | 序数越界得退回首行(原行为),不许让 undefined.image 把这一趟炸成失败:
       [{"shotId":"dup","order":4,"error":"Cannot read properties of undefined (reading 'image')"}]:期望 0,实际 1
===== 666/667 PASS, 1 FAIL =====
```

接住它的是 W248 补的档 ⑤(`withProject` 桩在末轮开跑前删行)。
**两侧的产品码逐字同形,判据面差一档**——这就是本槽要补的那一格。

### 1.3 停工条件:不成立

交接给的停工条件是「现跑已有判据接得住则只记账」。§1.1 反过来:两处兜底一起摘全绿,
分别摘也全绿(§三 3.1 变异 2、3 在补档之前跑的都是绿)。故不停工,补判据。

### 1.4 不为凑绿去删兜底

另一条路是「既然没判据就把兜底删了」——本槽明确不走。
两处兜底各自守着一种真实并发形态(§二 2.1),删掉它们等于把「别处改了表」这一趟从
「退回原行为 / 如实进 `failed`」变成「`TypeError` 把整趟炸掉」,是拿判据面的空白去换行为面的退化。
本槽的改动方向只有一个:让行为面接住它们。

---

## 二、补了什么(`tests/unit.js` +23 −1,零产品码)

### 2.1 档 ⑤:`withProject` 桩在末轮开跑前删主体

插在既有那条用例(`subject.generateImage 同 id 多位:每一轮的图落到本轮那一位…`)的 ④ 之后,
与镜头侧 W248 那一档逐句同形,只把「行/镜头/`image`/`findShot`」换成「位/主体/`prompt`/`findSubject`」:

```
const drop = async (keep) => {
  const sbX = loadCli();
  const fxX = cliDisk(sbX);
  fxX.disk.projects[0].subjects = dupSubs();
  sbX.__imgs = [];
  sbX.genImage = async () => { sbX.__imgs.push(1); return { url: '/uploads/img/d' + sbX.__imgs.length + '.png' }; };
  const origWp = sbX.withProject;
  let round = 0;
  sbX.withProject = async (pid, flags, fn) => {
    if (++round === 3) fxX.disk.projects[0].subjects = fxX.disk.projects[0].subjects.filter(keep);
    return origWp(pid, flags, fn);
  };
  return { r: await sbX.EXEC['subject.generateImage'].run({ pid: 'p1', subjectIds: ['dup'] }, {}), subs: fxX.disk.projects[0].subjects };
};
```

夹具沿用同一条用例开头那份 `dupSubs()`(`dup(首位)` / `solo(不重复)` / `dup(第二位)` / `dup(第三位)`),
点名 `["dup"]` 跑三轮,序数依次 0、1、2;第三轮是末轮,删表就卡在它开跑之前。
引擎桩另起 `d1..dn` 一路命名(与 ①②③ 的 `g/h/k` 分开),报错句里印的落库全貌一眼读得出是哪一档。

### 2.2 两档现跑读数

| 档 | 删了谁 | 引擎实收 | 回执 | 落库 |
|---|---|---|---|---|
| `gone1` | 只删末位 `D-第三位`(序数 2 越界) | 3 | `ok:3 failed:[]` | `A-首位:d3.png` / `B-不重复:无图` / `C-第二位:d2.png` |
| `gone2` | 同 id 一位不剩 | 2 | `ok:2 failed:[{subjectId:"dup",error:"主体不存在:dup"}]` | `B-不重复:无图` |

`gone1` 的 `A-首位` 是被第一轮与第三轮连写两遍的结果——序数 2 越界退回 `rows[0]`,
这正是兜底承诺的「退回原行为」:钱没白花成 `TypeError`,产物也没静默丢。
`gone2` 那一位不剩的一轮走的是 `findSubject` 那个出口,错误句就是它抛的「主体不存在:dup」,
不另造第二个说法;`A`/`C` 前两轮的图随删表一起没了是删表本身的后果,不是这一趟写错了地方。

### 2.3 判据句

```
gone1: failed.length === 0        // 序数越界得退回首位(原行为),不许让 undefined.prompt 把这一趟炸成失败
gone1: subs.filter(有图).length === 2  // 剩下的两位照旧各有一张图
gone2: failed.length === 1        // 同 id 一位不剩时这一轮如实失败,不许静默丢产物
gone2: /主体不存在/.test(failed[0].error)  // 走的仍是 findSubject 那个出口
```

第二句(`=== 2`)不是凑数:只钉 `failed.length === 0` 时,「越界回 `undefined` 但外层把异常吞了」
这一类改法能骗过前一句;把落库位数一并钉住,报错句里印的又是全貌,错在哪一步读得出来。

### 2.4 没碰的

`nthSubject` 三行逐字未动(本槽从头到尾只在演练里改过它,每手跑完 `git checkout -- cli.js` 清场);
`nthShot` 未动(照抄的是它那一档的形态,不是改它);
`findSubject` / `findShot` 本体未动(单位/单镜那几路照旧取首位/首行);
选人闸 `ids.has(s.id)` 六处按行/按位筛未动;`pickerNarrowHits`(W249 的地)未动;
`Domain.dupSubjectRowsNote` 与它的调用点未动;`state-put` 仍只有 `need(f.force)` 一道闸;
`Skills.gaps()` 仍 20 键;`GUARD_TOPICS` / `TOPIC_FLOOR` / `SLACK` 一行未动。
`cli.js`、`js/`、`server.js`、`mcp.js` **零 diff**——本槽只动 `tests/unit.js`、`README.md` 与本目录。

---

## 三、变异演练

### 3.1 五手,逐手红在自己那一句

判据先提交(`d7d8f02`)再演练,产品码每手跑完 `git checkout -- cli.js` 清场。

| # | `nthSubject` 第三行改成 | 补档前 | 补档后 |
|---|---|---|---|
| 1 | `return findSubject(proj, sid);`(退回 W246 之前) | 红 1(既有 ①) | 红 1(既有 ①,`A-首位:g3.png` 其余无图,期望 3 实际 1) |
| 2 | `return rows[nth];`(两处兜底一起摘) | **全绿 667/667** | 红 1(⑤ `gone1`:`Cannot read properties of undefined (reading 'prompt')` 进了 `failed`) |
| 3 | `return rows.length ? rows[nth] : findSubject(proj, sid);`(只摘 `rows[0]`) | **全绿** | 红 1(⑤ `gone1`,与变异 2 同一句) |
| 4 | `return rows[nth] \|\| rows[0];`(只摘 `findSubject` 委托) | **全绿** | 红 1(⑤ `gone2` 后半:`走的仍是 findSubject 那个出口`,读到的是 `TypeError` 而不是「主体不存在」) |
| 5 | `return rows.length ? rows[0] : findSubject(proj, sid);`(序数白算) | 红 1(既有 ①) | 红 1(既有 ①,与变异 1 逐字相同) |

补档前后各整跑一遍,差的正是变异 2、3、4 那三手——**这三手就是本槽的射程**,
1 与 5 在两边都由既有档接住,本槽没有加强它们。

### 3.2 现跑出来的两格方法性的东西

- **变异 2 与变异 3 红得逐字相同,这是对的。** 「两处一起摘」与「只摘 `rows[0]`」在
  `gone1` 那条路上是同一个形状(序数越界都落到 `undefined`),分不开也不必分开;
  真正要分开的是变异 4,它红在 `gone2` 那半句上,报错句里印的是错误**说法**而不是位数。
  这一格与 W248 §3.1 第一条同形,但两侧的对子不一样:那边分不开的是「不带序数」与「带了不用」
  (变异 1 与 3),这边分不开的是「两处一起摘」与「只摘一处」。
- **一档收两处兜底,不必拆成两条用例。** 两处兜底守的是同一件事(并发改表)的两种深浅,
  同一个 `drop(keep)` 换一个 `keep` 谓词就分出来了;拆成两条用例会让夹具与桩各写一遍,
  而报错句本来就已经点名是 `gone1` 还是 `gone2` 那一句。

---

## 四、live 数字(全部现跑,含本文)

| 项 | 基线 `367f7bc` | 本槽 |
|---|---|---|
| `node tests/unit.js` | 667/667 | **667/667 PASS**(补的是档不是条,条数不增) |
| `node tests/integration.js` | 148/148 | **148/148 PASS**(未加用例,复跑过) |
| `node tests/cli.smoke.js` | 115/117 | **115/117**,失败仍是同名那两条:`未登录 whoami → exit 3`、`llm --json mock 链路`(与 master 同名;本槽 diff 不含 `cli.js`,这一格与基线逐条相同) |
| 记账件份数 | 265 | **266**(含本文) |

棘轮这一轮只有记账件那格要抬:`const FLOOR = 265;` → `266`。
`['单元测试', 667, …]` 未动(**live 仍是 667,补档不增条**——这一格没落后,
理由是本槽净增 0 条而不是判据接住了什么,与 W250 §「名集对账对这种槽恒真」同一个形状);
`['集成测试', 148, …]`、`['CLI 冒烟', 117, …]`、`TOPIC_FLOOR`、`SLACK` 一行未动。
根 `README.md` 用例数 667 不变,只在主体侧那一段末尾补一句说明这一档(镜头侧同形那一档一并点到)。
`docs/skills-wave/README.md` 明写份数 265 → 266,索引补本文一行。
`node --check` 过:`tests/unit.js`。

按用户约定,`node tests/e2e.js` 本槽**未跑**。

---

## 五、交接

1. **W248 §五 2 / W250 交出来的那一格到本槽销号。** 数字对得上(`return rows[nth];` 全树 667/667 全绿),
   收法也是它写的那一条(照镜头侧档 ⑤ 给主体侧补一档),现跑另量出两侧射程的差别在
   变异 2、3、4 三手上(§3.1),以及「分不开的那一对」两侧不是同一对(§3.2)。
2. **两侧现在同形,`nth*` 这一对上没有剩下的判据盲区。** 现取核过:`nthShot` 与 `nthSubject`
   各自的两处兜底都有行为面接着。哪天再加第三个 `nth*`(比如分集侧),同一档得同轮补上。
3. **回执的 `ok` 该按几位报,本槽照旧没动**(W246 §五 3、W248 §五 3 在册,两侧同形)。
   现在仍是「引擎调用成功即 `okCnt++`」。`gone1` 那一档现跑读出这个口径的边界:
   引擎实收 3、回执报 `ok:3`,而到手图只有 2 位——**兜底把两轮写到了同一位身上,回执照报 3**。
   这不是本槽引入的(兜底就是这么承诺的:退回原行为而不是炸掉),但它是「`ok` 读不出写回实况」
   这一格至今最清楚的一个读数,原样登记。真要收得在写回之后回读一次落库实况再计数,那要多一次往返。
4. **同 id 多位为什么会存在,本槽照旧没追到源头**(W226 §6、W242 §5.7、W248 §五 5 在册)。
   主体侧比镜头侧还多一格:它没有 `shots-dedupe` 同类的显式去重出口,现有修法仍是
   「到主体库里删掉或改 id」(而删除按 id 匹配,同 id 那几位一并删光)——`dupSubjectRowsNote`
   末句说的就是这个代价。本槽没有为主体侧新开去重命令。
5. **`produce` 修订回写那一处仍按 id 取首行**(W248 §五 4 在册,主体侧无对应路径),原样留着。
6. 冲突面提示:`tests/unit.js` 的改动只有一处——`commands` 套件里
   `subject.generateImage 同 id 多位…` 那条用例的 ④ 之后追加档 ⑤(第 3704 行附近),
   紧邻镜头侧 W248 那条用例(它自己的档 ⑤ 在第 3391 行附近),同轮并进时按
   「两侧各在**相邻但不同**的用例末尾追加一档」处理。产品码零 diff,`cli.js` 不进冲突面。
