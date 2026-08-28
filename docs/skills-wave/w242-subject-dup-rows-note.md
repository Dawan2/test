# W242 · 主体生图那一拍说出「同 id 多位」:点名一个重复 id 时的多扣费不再闷声发生

基线:`origin/cursor/w241-integration-6b2d` 现取 tip `0a6114c`(先 `fetch` 再 `rev-parse`;
交接文自称 tip `0a6114c`、merge `3cecbc4`,现取两者都在,且 `0a6114c` 确是 tip——
那条「一个 SHA 不从交接文抄」的规矩本槽照旧执行了一遍,这次两边对得上)。

**结论先写:三条停工条件逐条 live 过,一条都不成立,故不停工,补一句 note。**
`js/domain.js` 新开一份双端派生 `dupSubjectRowsNote`,两端 `subject.generateImage` 真跑成功那一档
现取它挂上 `result.note`;**选人闸 `ids.has(s.id)` 一个字未动**——按位筛是对的,
改成按 id 只跑一位会让第二、三位永远跑不到(它们各有各的名字与设定)。
**镜头那份 `dupRowsNote` 一个字未动**,本槽是平行另起一份,不是复用也不是改写。
`emptySubjectImageNote` 四堆一个字未动(现跑量过:空跑那几档一分钱没扣,见 §1.3)。

---

## 一、先 live:现跑到底说了什么

沙箱按 `index.html` 顺序加载**真实产品码**(`js/domain.js` + `js/cmd-registry.js` + `js/commands.js` 等),
CLI 那一端直接 `runInContext` 真 `cli.js` 本体(只掐掉末尾 `main()` 入口),换掉的只有服务端往返与生图引擎;
**判几位真跑了一律看引擎实收**(浏览器 `EpisodeUtil.genSubjectImage` / CLI `genImage` 收到的调用),不看回执上的数字。

夹具:主体库 `dup(A-首行)` / `solo(B-不重复)` / `dup(C-第二行)` / `dup(D-第三行)` 四位、三位同 id,全都缺参考图。

### 1.1 点名一个重复 id,真跑那一趟

| 档 | 引擎实收 | 回执 | `note` | `digest` 播 |
|---|---|---|---|---|
| 浏览器 headless 点名 `["dup"]` | `dup,dup,dup` | `total:3 ok:3`,`cost:6` | **无** | **0 句** |
| 浏览器 ui 点名 `["dup"]` | `dup,dup,dup` | `total:3 ok:3`,`cost:6` | **无** | **0 句** |
| CLI `exec` 点名 `["dup"]` | 3 次 | `total:3 ok:3 failed:[]` | **无** | stderr 只有「主体生图:3 位待处理(串行)…」+ 三行 `主体 X ✓` |
| 对照:**干净库**上点名三个不同 id | `a1,a2,a3` | `total:3 ok:3`,`cost:6` | 无 | 0 句 |

**点名 1 个 id 跑了 3 位的那一趟,与干净库上点名 3 个 id 跑了 3 位的正常批量,回执逐字相同、`cost` 也相同(都是 6 = 3 × `COST.image`)。**
这正是 W239 在镜头侧量到的那个形状,主体侧原样成立。

CLI 那一端的 stderr 倒是把 `主体 A-首行 ✓ (1/3)`、`主体 C-第二行 ✓ (2/3)`、`主体 D-第三行 ✓ (3/3)` 逐行印了出来,
但它印的是**主体名字**——三位同 id 的名字各不相同,连着刷过去读起来就是三位不同的主体,
**恰恰读不出"这是同一个 id 的三位"**,更没说该怎么办;浏览器那一端连这个都没有(成功档 `digest` 默认静默)。

### 1.2 三条停工条件逐条核过

交接给的停工条件是两条("主体选人按 id 去重只跑一位"、"回执已说清"),加上落地条件一条("闷声多扣"):

| 条件 | 现跑 | 判 |
|---|---|---|
| 主体选人按 id 去重只跑一位 | 两端选人闸都是 `(p.subjects \|\| []).filter(s => ids ? ids.has(s.id) : !s.image)`,**按位筛**;点名 1 个 `dup` 引擎实收 3 位 | **不成立** |
| 回执已说清 | 两端 `result.note` 都是 `undefined`,浏览器 `digest` 零 toast,CLI stderr 印的是主体名不是 id | **不成立** |
| 闷声多扣 | `cost:6`(三笔 `COST.image`),与干净库上点名三个不同 id 的正常批量**逐字相同** | **成立** |

故不停工,补一句话。

### 1.3 空跑那几档一分钱没扣,故 `emptySubjectImageNote` 四堆一个字不改

交接给的口径是「不要改 `emptySubjectImageNote` 四堆**除非空跑误导**」。W217/W197/W214 三槽已经把那一份的
四堆(`不在主体库` / `已有参考图` / 两路各自的安全阀)逐档钉在单测里,现跑复核过:那几档的共同点是
**引擎一次都没起来、一分钱没扣**(既有用例里 `引擎一次都不该起来(零计费)` 那句就是钉这件事的)。
本槽这句话要收的是"钱花了而用户不知道多花在哪",空跑那边没有这笔账。故**一个字不改**,新开的是另一份派生。

### 1.4 一处 live 现跑出来的更重的连带面(**本槽有意不修**,登记在册)

CLI 那一端每轮 `findSubject(projLive, s.id)` 取的是 `.find(x => x.id === sid || x.name === sid)` 的**首位**,
于是点名 `["dup"]` 那一趟三轮全写在 `A-首行` 身上:

```
CLI exec 点名 ["dup"]  引擎实收 3 次,total:3 ok:3 failed:[]
落库 = dup/A-首行:/uploads/img/g3.png、solo/B-不重复:无图、dup/C-第二行:无图、dup/D-第三行:无图
```

**扣 3 笔生图钱,只有 1 位主体到手图**,而回执报 `ok:3 failed:[]` 一切正常。
浏览器那一端不是这个形态(`for (const s of todo)` 直接写循环拿到的那个对象,三位各得一张图)。
CLI 的整库那一路(不点名)同样中招:4 次引擎、2 位到手图。

W217 §6.4 当年是**读源码**登记的这一格(原话:「两端的写回口径顺手读了一眼源码(未 live 跑)」),
本槽把它**现跑出来了**,数字与当年读出来的一致。**这一格不是回执文案能承担的**——
它是写回寻址的问题,改它要动 `findSubject` 的语义(按位取还是按 id 取)并同轮重判
「同 id 几位各自的内容怎么办」,与本槽补一句话是两件事。故原样登记在 §五,不代修。

由此本槽这句 note 的措辞也定了:**只说「同 id 多位、按位计费」这半**,不去说"每一位都拿到了图"——
那半在两端说法不同,而"按位计费"两端一模一样。

---

## 二、改了什么(产品码三处,`js/domain.js` +24 / `js/commands.js` +4 / `cli.js` +5)

### 2.1 `js/domain.js`:新开双端派生 `D.dupSubjectRowsNote(picked, subs)`

紧跟在 `emptySubjectImageNote` 之后(主体侧那一对连着读)。
`picked` 是调用方点过名的清单,`subs` 是**这一趟真下发的待跑清单**(不是整个主体库)。
点名清单先按主体去重(与 `emptySubjectImageNote` 同口径),逐个 id 数它在待跑清单里占几位,只留 `> 1` 的那些,
报出「哪个 id 几位、这一趟按几位逐位跑逐位计费、比点名数多花了几位的钱」,末句给现有修法。

点名判据 `if (!Array.isArray(picked) || !picked.length) return '';` 与两端选人闸
(`Array.isArray(args.subjectIds) && args.subjectIds.length`)逐字同形——这是 W214 在主体侧立过的那道闸的同形物:
放宽成真值判断时字符串 `subjectIds` 会被拆成字符点名清单、类数组连 `new Set` 都过不去,一次 ok 执行当场变异常。

现跑出来的整句(夹具同 §一):

```
点名的 1 位主体在主体库里同 id 存着多位(dup 3 位):这一趟按 3 位逐位跑、逐位计费,
比点名数多花了 2 位的钱。主体侧没有去重命令,要一个 id 只跑一位,得回主体库把多出来的那几位删掉或改 id
(删除按 id 匹配、同 id 那几位一并删光,先确认要留哪一位)。
```

### 2.2 **为什么另起一份、而且末句不是 `shots-dedupe`**

交接明写「主体侧若没有 `shots-dedupe` 同类命令,不要发明第二条去重命令」。现取核过:**确实没有**——
`shots-dedupe` 只收拾 `ep.shots`(`CMD['shots-dedupe'] <pid> <epid>`),主体侧一条同类命令都没有,
`subject-add` / `subject-image` / `subject-copy` 三条都不是去重出口(`subject-copy` 重新发 id 但那是跨项目复制)。
故本槽**不发明第二条命令**,末句给的是**现有修法**:主体库里把多出来的那几位删掉或改 id。

而"现有修法"这四个字本槽是查过才敢写的,并且把它的**已知代价一并写进了那句话**:
`js/roles.js` 的删除主体是 `p.subjects = p.subjects.filter(x => x.id !== s.id);`——
**按 id 匹配,同 id 那几位会被一并删光**。只写「去主体库删掉多出来的那几位」而不说这一句,
等于把用户往误删里指(他想删两位,按下去三位一起没了)。
故末句的括号不是啰嗦,是这句话给出的活路的必要条件;`contract` 与 `domain` 两条用例各钉一句。

**为什么不套用镜头那份 `dupRowsNote`**:两侧单位与出口都不同。那一份论的是「分镜表」与「行」并点名
`shots-dedupe` 那条命令,主体侧一样都没有,套用会让主体回执论起分镜表来。
这与 W197 当初不拿 `emptyBatchNote` 顶主体那一侧、W239 不拿 `emptyBatchNote` 顶自己,是同一条理由。
**镜头那份一个字未动**(交接明令),`contract` 那条用例反面钉住它仍在册且仍点着 `shots-dedupe`。

计数那四行(去重 → 逐 id 数 → 留 `>1` → 累 `extra`)与镜头那份形状相同而没有抽成共用帮手:
抽帮手要改 `dupRowsNote` 的躯干,交接明令不动它;而两份派生并存本就是主体/镜头两侧的既有形态
(`emptyBatchNote` / `emptySubjectImageNote` 从 W197 起就是这么并存的)。

### 2.3 两端调用点

- `js/commands.js`:回执 `r` 组装之后 `const dupNote = Domain.dupSubjectRowsNote(args.subjectIds, todo);`,非空才挂 `r.result.note`。
  `digest` 的成功档例外(`r.ok && r.result.note` 即 `U.toast`)本来就在,**不动一个字**,这句话自动有了出口。
- `cli.js`:`todo` 定下来之后先算,**在跑之前先 `log` 一句**(钱还没扣完的时候用户就读得到),回执上同样挂一份。

两端各自算的是自己那一趟真下发的清单(都叫 `todo`),与 `total` 同一个数。
空跑早退那一档(`!todo.length`)与本档互斥,`emptySubjectImageNote` 那一句照旧占着 `note`,两档不打架。

### 2.4 没碰的

选人闸 `ids.has(s.id)` 按位筛一字未动;`subject.generateImage` 计费公式与注册表参数面未动;
`state-put` 未设闸;`Domain.emptyBatchNote` / `emptySubjectImageNote` / `dupRowsNote` 三份一字未动;
`Commands.digest` 未动;`js/roles.js` 的删除主体未动(本槽只是把它的现有行为如实说出来);
`findSubject` 未动(§1.4 那一格);`Skills.gaps()` 未剥;`GUARD_TOPICS` / `TOPIC_FLOOR` / `SLACK` 一行未动;
**没有任何静默去重**:这一趟跑完库还是那个库,四位原样躺着(`commands` 那条用例双向钉住)。

---

## 三、钉测试(`tests/unit.js` +3 条)

| 套件 | 用例 | 钉的是 |
|---|---|---|
| `domain` | `dupSubjectRowsNote:点名的 id 在主体库里存着多位时把位数说出来(没点名/不重复一律一句不说;不与镜头那份串词)` | 派生本身:开头报点名 id 数不是位数、逐个点名"哪个 id 几位"、说清按几位计费、多花几位的钱、给出现有修法**并说清它一并删光**;反面钉住不说话的那几路(点名几位跑几位、同 id 只一位、六种非数组/空数组入参一律回空且**不许抛**、待跑清单为空时归 `emptySubjectImageNote` 说)、点名清单去重、多 id 各自多位时只点真重复的那几个;另钉**不许串词**——句子里不许出现 `镜`/`行`/`分镜表`/`shots-dedupe` |
| `commands` | `subject.generateImage 点名同 id 多位真跑那一趟:两端回执都说出位数并给现有修法(选人闸仍按位筛,一位都不许少跑)` | 两端真跑:浏览器引擎实收三位、回执带这句、`Commands.digest` 真播一条;**对照面拿干净库跑**(点名三个不同 id 同样 `total:3`)并断言**两趟 `cost` 相等**——那正是"闷声"读不出来的原因;整库那一路一句不说、`digest` 仍静默;CLI 那端引擎同样实收三次、回执与浏览器**逐字同一句**;落库面:跑完库还是四位 `dup,solo,dup,dup` |
| `contract` | `点名的 id 在主体库存着多位那句实话双端单源:两端真跑回执都现取 Domain.dupSubjectRowsNote,选人闸仍按位筛没被改成按 id 去重` | 源级:`Domain` 须导出这一份、两端 `generateImage` 段各须现取它、两端**可执行行**里不许出现这句话的字面(整行注释豁免)、不许改读 `Domain.dupRowsNote`;另钉前提——选人闸仍是 `ids.has(s.id)`、待跑清单不许被按 id 收窄(骨架里 `todo =` 的行上不许出现 `new Set`/`findIndex`/`indexOf`);派生侧点名判据与选人闸同形、须给现有修法、**不许点名 `shots-dedupe`**;反面钉住镜头那一份原样在册且仍点着自己的出口(两份合并成一份即红) |

`tests/integration.js` **未加**:本槽不新增任何端点,`js/commands.js` 那一端根本不经服务端。
`tests/cli.smoke.js` **未加**:冒烟套件里那条 `exec subject.generateImage` 走的是"一位也没跑"档(零计费),
与本槽这一档不同;真跑生图要真上游,真跑面由 `commands` 套件两端各跑一遍钉住。

---

## 四、live 数字(全部现跑,含本文)

| 项 | 基线 `0a6114c` | 本槽 |
|---|---|---|
| `node tests/unit.js` | 659/659 | **662/662 PASS** |
| `node tests/integration.js` | 148/148 | **148/148 PASS**(未加用例,复跑过) |
| `node tests/cli.smoke.js` | 115/117 | **115/117**,失败仍是同名那两条:`未登录 whoami → exit 3`、`llm --json mock 链路` |
| `contract` 套件条数 | 143 | **144** |
| 记账件份数 | 256 | **257**(含本文) |

棘轮同轮抬到当轮实况:`['单元测试', 662, …]`、`const FLOOR = 257;`;
`['集成测试', 148, …]` 与 `['CLI 冒烟', 117, …]` 未动。
`README.md` 两处数字同步(单元 662、`contract` 144),另在单元套件覆盖面里补一段说明本槽这句话。
`GUARD_TOPICS` / `TOPIC_FLOOR` / `SLACK` 一行未动。
`node --check` 过:`js/domain.js`、`js/commands.js`、`cli.js`、`tests/unit.js`。

按用户约定,`node tests/e2e.js` 本槽**未跑**。

---

## 五、交接

1. **同 id 多位这件事现在是主体侧两条判据一组**:W217 收的是"一位也没跑"时 `gone` 怎么数,
   本槽收的是"真跑起来了"时把位数说出来。两条在 `domain` 套件里是连着的两条,读的时候一起读。
2. **多扣费这件事本身仍在,本槽收的是"闷声"那一半。** 点名一个 id 仍然跑几位扣几笔——
   这是选人闸按位筛的直接结果,而按位筛是对的(点名两位的正常子集不许被砍)。
   真要改成"按 id 只跑一位",得连着"重复位里各自的内容怎么办"一起判,别拿这句 note 当幌子顺手改掉;
   `contract` 那条源级判据正是为这件事立的。
3. **§1.4 那一格(CLI 扣 3 笔只有 1 位到手图)是本槽 live 出来的最重的一格,原样留着不代修。**
   它的病灶在 `findSubject` 按 `.find` 取首位,点名档与整库档都中招,而回执报 `ok:3 failed:[]` 一切正常。
   收它要么改 `findSubject` 的寻址语义、要么让 CLI 那一端像浏览器那样直接写循环拿到的对象,
   两条都得同轮重判「同 id 几位的内容怎么办」与「回执的 `ok` 该按几位报」,**不是文案能承担的**。
   W217 §6.4 是读源码登记的,本槽把它现跑出来了,数字对得上。
4. **整库(不点名)那一路有意不说这句。** 那一路 `total` 本来就是位数,没有"点 1 位跑 3 位"的错觉;
   哪天判定它也该说,请连着措辞一起判——那句话得论"库里有几组重复"而不是"多花了几位的钱"
   (整库那一路每一位都是用户要的)。与 W239 §5.3 在镜头侧写的是同一条。
5. **末句给的"现有修法"是有代价的,而代价写进了那句话本身。** 主体库删除按 id 匹配、同 id 几位一并删光。
   哪天主体侧真开了一条去重命令(`subjects-dedupe` 之类),请**同轮**把末句换成点名它,
   并把 `contract` 那条「不许点名 `shots-dedupe`」改成点名新命令——那条判据现在拦的是串词,不是拦所有命令名。
6. **主体库里为什么会有同 id 多位,本槽照旧没追到源头**(W217 §6.5 在册):
   导入/跨项目复制/`state-put` 逃生舱都是嫌疑面。本槽只保证这种库存在时回执说的是实话。
7. **失败档带不带这句没单独判**(与 W239 §5.5 同):现在无论 `ok` 与否都挂 `result.note`
   (`digest` 在失败档播的是 `error.message`,note 只留在回执 JSON 里)。有意留的余量,不是遗漏。
8. 冲突面提示:`js/domain.js` 的插入点紧接 `emptySubjectImageNote` 之后(W239 的 `dupRowsNote` 在
   `emptyBatchNote` 与 `emptySubjectImageNote` 之间,两处不相邻、不冲突);
   `js/commands.js` 与 `cli.js` 各在 `subject.generateImage` 回执组装处加两三行;
   `tests/unit.js` 三条用例分别插在 `domain` 的 W217 那条之后、`commands` 的 W214 安全阀那条之后、
   `contract` 的 W197 双端单源那条之后,合并时按"两侧各在同一插入点追加一条完整用例"处理。
