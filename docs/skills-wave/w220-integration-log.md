# W220 集成记账:W216 镜头空跑闸同形 + W217 主体 gone 按点名 id 数

新基线 `cursor/w218-integration-e5d2`,tip **`5f76836`**(`git fetch` 后 `git rev-parse` 现取,
与它自称的一致但仍是量出来的)。按序两次 `--no-ff` 合入两条**已完成**支,合完 live 现取全部数字。
在飞的 W219(计划不排蒸馏,从 W215 出)按任务口径**一条没碰**,`master` 没合。

两支**都是**从 **W212**(`18233eb`)叉出、互不相识,故它们自称的 **630 / 628 一个不采用**;
基线自称的 **639** 同样只是这一槽的加数起点而不是答案,合完 live 是 **643**。

两支加起来只有一个产品文件、两处判据,而它们**落在同一个模块的两个相邻函数上**——
这是本槽唯一值得机检的地方:`js/domain.js` 的 `emptyBatchNote`(镜头侧,W216)与
`emptySubjectImageNote`(主体侧,W217),而后者上一波刚被 W214 改过入口闸。
合完整棵产品树相对基线只此一处:

```
git diff --stat 5f76836 HEAD -- js/ server.js cli.js mcp.js billing.js index.html css/
 js/domain.js | 12 +++++++++---
 1 file changed, 9 insertions(+), 3 deletions(-)
```

## 一、两次合并

| 次序 | 被合入支 | 自称 head | 现取 head | merge commit | parents |
|---|---|---|---|---|---|
| 1 | `cursor/w216-empty-batch-ids-gate-8f24` | `e3abb92` | `e3abb92` | `fa2a695` | `5f76836` + `e3abb92` |
| 2 | `cursor/w217-subject-dup-gone-5448` | `4444a80` | `4444a80` | `91d3768` | `fa2a695` + `4444a80` |

两次都是真 `--no-ff`(两个 parent 齐全,不是快进);全程没用过 `--ours`,
没用过 `checkout <old> -- .`,没有一处冲突是靠机械丢掉一侧收的场。
三支自称的 head 这次逐个与现取相同,但这是**对出来的**——先 `fetch` 再 `rev-parse`,
没有一个 SHA 是从交接文里抄进命令行的。

## 二、四棵树机检:两次都是**真并集**,`js/domain.js` 这次不是 `P1 == B`

上一波(W218 合 W214)时 `js/domain.js` 是 `P1 == B`,git 整份取对侧;
交接因此明令本槽复核"两处都在"。逐文件比对 `B`(叉点 `18233eb`)/ `P1` / `P2` / `M`:

**第一次合并**(`P1` = `5f76836`,`P2` = `e3abb92`):

| 文件 | 成色 | 后果 |
|---|---|---|
| `js/domain.js` | **真并集**(四份互不相同) | 我方带着 W214 的主体闸、对侧带着 W216 的镜头闸,git 逐 hunk 合上,两处都在 |
| `README.md`、`docs/skills-wave/README.md`、`tests/unit.js` | 真并集 | 逐处人工收场,见 §三 |
| `docs/skills-wave/w216-empty-batch-ids-gate.md` | `M == P2` | 对侧新开的文件,我方没有,不存在并集问题 |
| `server.js`、`cli.js`、`mcp.js`、`billing.js`、`index.html`、`css/`、`js/` 其余全树 | 三方全同 | — |

**第二次合并**(`P1` = `fa2a695`,`P2` = `4444a80`):成色与上表逐格相同——
`js/domain.js` 仍是真并集(我方此时已有 W214 + W216 两闸、对侧带 W217 的 `gone`),
新记账件 `M == P2`,其余产品文件三方全同。

**两次都没有出现 `P1 == B`**,故不存在"git 整份取对侧、被合入支带来的东西得逐条现取"那一格;
但交接点名的三处仍逐条现取复核了一遍(不因为成色好看就跳过)。

## 三、`js/domain.js` 三处判据现取:两函数三处共存

```
--- 镜头侧 emptyBatchNote ---
    if (Array.isArray(picked) && picked.length) {          ← W216
      const ids = [...new Set(picked)];                    ← 去重层保留
      const gone = ids.length - hit.length;                ← 未修,见 §七 残留

--- 主体侧 emptySubjectImageNote ---
    if (Array.isArray(picked) && picked.length) {          ← W214(上一波,原样在)
      const ids = [...new Set(picked)];                    ← 去重层保留
      const gone = ids.filter(id => !subs.some(s => s.id === id)).length;   ← W217
```

三处逐条对着交接清单核:

- `emptyBatchNote` 入口是 `Array.isArray(picked) && picked.length` — **在**(W216);
- `emptySubjectImageNote` 入口是 `Array.isArray(picked)` — **在**(W214 那一行一个字没被 W217 顶掉);
- 主体侧 `gone` 是「点名 id 里库里找不到的个数」而**不是**「点名数 − 命中条数」 — **在**(W217);
- 两处点名清单 `ids` 的 `new Set` 去重层 — **都在**。

**注释两头一起复核**,不只改一头:镜头侧那段说明写的是
「点名判据与两端选人闸(`Array.isArray(shotIds) && length`)逐字同形」,
主体侧写的是「走不走点名那一路的判据与两端选人闸逐字同形(`Array.isArray(subjectIds) && length`)」,
两句指的是各自那一端的选人闸、措辞对齐、都与合完的实况一致;
W217 另加的三行说明(为什么不拿命中条数去减)嵌在 `ids` 去重层之后、`gone` 之前,与代码贴合。

## 四、冲突逐处怎么收的

三个文本文件、两轮共五处冲突,一处都没有机械取侧:

- **`README.md` 那条长行**(16779 字符的单元测试说明):两轮都先把两侧的数字整体掩成 `#`
  再逐字符比对,证明**只差数字**(第一轮 639 / 630,第二轮 642 / 628,掩码后逐字相等),
  然后整句取我方、数字留到合完 live 现取时再改。同一文件里 `contract` 那格 138 → 139
  是对侧单方面抬的、我方没动,git 自动合上,合完复核 live 恰是 139,未再改。
- **`docs/skills-wave/README.md` 索引表尾**:两轮都是两侧各自往表尾追加行,取**并集**后按波次号升序归位。
  第一轮并出 w213 / w214 / w215 / **w216** / w218,第二轮再插入 **w217** 归位到 w216 与 w218 之间。
  一行都没丢。
- **`docs/skills-wave/README.md` 明写份数**与 **`tests/unit.js` 两格 `FLOOR`**:一律取我方占位、
  合完 live 现取改数,不 ours/theirs 数字。
- **`tests/unit.js` 第一轮那处 53 行 vs 26 行的大块冲突**:两侧各自在同一个插入点追加了一条完整用例
  (我方 W215 带来的 `CLI exec compose` 那条、对侧 W216 的 `generateVideos` 非数组 `shotIds` 那条),
  共用同一个块尾 `} },`。按「把 `=======` 那行换成块尾」三步收:我方块 + `} },` + 对侧块,
  原有块尾去闭对侧。两条用例合完都在(见 §五名集)。
  第二轮 W217 的新用例落在 `domain` 套件里,与我方插入点不撞,git 自动合上。

## 五、数字:全部合完 live 重跑

两侧给的数一个都没采用。每合完一次整跑一遍,让对账用例自己报差额再按它订正
(第一轮它报「实测 642,文档 639」与「期望 231,实际 232」,第二轮报 643 / 233)。

| 口径 | 基线 W218 | W216 自称 | W217 自称 | **合完 live** |
|---|---|---|---|---|
| `node tests/unit.js` | 639 | 630 | 628 | **643** |
| └ `domain` | 36 | 37 | — | **38** |
| └ `commands` | 46 | 43 | — | **47** |
| └ `contract` | 138 | 139 | — | **139** |
| └ `agent-ops` / `plans` / `memory` / `produce` | — | — | — | 59 / 17 / 35 / 17 |
| `node tests/integration.js` | 147 | 147 | 147 | **147/147 全绿** |
| `node tests/cli.smoke.js` | 107/109 | 107/109 | 107/109 | **107/109**(分母未动,两支都没加冒烟) |
| README 单元用例数 | 639 | 630 | 628 | **643** |
| `tests/unit.js` 单元 `FLOOR` | 639 | 630 | 628 | **643** |
| 记账件份数(含本文) | 231 | 226 | 226 | **234** |
| 记账件份数 `FLOOR` | 231 | 226 | 226 | **234** |

`GUARD_TOPICS` / `TOPIC_FLOOR` / 花名册仍 **19 / 19 / 19** 一条未登记;
`gaps()` **20 键**与 `js/skills.js` 与基线**逐字节相同**,**SK-04 / G-11 / G-13 原样开着没装清**;
`expert.evolve` 仍**不在** playbook `steps` 里、注册表字段只有 `manual: true`;
`episode.compose` 参数面仍是 `pid,epid,force,ui`(W210 那道闸与授权位原样承重)。

**名集自洽**(按 `|` 切做**多重集**,不 unique-sort;四棵源树与 tip 的快照都在**全绿**状态下取,
免得失败原因缀在名字后污染快照):

```
叉点 18233eb = 627
  W218  tip 639  相对叉点新增 12 条,叉点独有 0 条 → 12 条全在 tip 上
  W216  tip 630  相对叉点新增  3 条,叉点独有 0 条 →  3 条全在 tip 上
  W217  tip 628  相对叉点新增  1 条,叉点独有 0 条 →  1 条全在 tip 上
基线独有(tip 上丢失)0 条;tip 多出(谁也没带来)0 条;tip 缺失 0 条
627 + 12 + 3 + 1 = 643 = live tip
```

按交接要的那个形式换算即 **639 + 3(W216) + 1(W217) = 643**,自洽。
W216 新增的三条分落 `commands` / `domain` / `contract`,W217 那一条落 `domain`。

`cli.smoke` 不是并行安全,单独跑。两条失败**与 `master` 同名同表现**,逐字核过:

| 失败用例 | 本槽 | master |
|---|---|---|
| `未登录 whoami → exit 3` | `exit=1` | `exit=1` |
| `llm --json mock 链路` | `undefined` | `undefined` |

(master 那棵树的分母是 51/53,条数比这条线少,但失败的**就是这两条**、表现逐字相同。)

`node --check` 过了两个冲突解过的可执行文件:`js/domain.js`、`tests/unit.js`。

## 六、本槽没做的两件事,与为什么

- **镜头侧 `gone` 不代修**。W217 修的是主体侧,交接明令本槽不代它改镜头侧,故
  `emptyBatchNote` 的 `gone = ids.length - hit.length` 一个字没动,残留如实记在 §七。
  两个方向的偷懒都没走:既没顺手把主体那份 `filter` 抄到镜头侧(那是新开一槽的活、
  要连同"同一集里 id 重复"这件事本身该不该存在一起判),也没把这条残留从交接里抹掉。
- **选人闸一个字没放宽**。W216 / W217 改的都是**回执怎么分档**这一侧,
  两端 `Array.isArray(args.shotIds) && length` / `Array.isArray(args.subjectIds) && length`
  那两道选人闸一行未动 —— 让回执跟着选人闸走,不是反过来。

## 七、交接:本槽留下的残留

① **镜头侧 `emptyBatchNote` 的 `gone` 同 id 仍会为负**(W217 只修了主体侧,本槽不代修)。
现取跑得出来,而**同一形状在主体侧已经是对的**:

```
ep.shots = [{id:'sh1'}, {id:'sh1'}],  点名 ['sh1']
  镜头侧:点名的 1 镜一镜也没跑:-1 镜不在本集、2 镜没能说清原因      ← 负数,且末堆 2 > 点名数 1
  主体侧:点名的 1 位主体一位也没跑:1 位没能说清原因                ← W217 修后
```

另一形状里这一笔多减会**把真不在库的那位抵消掉**,同样只剩镜头侧还有:
`shots = [{id:'sh1',final:true} × 2]` 点名 `['sh1','shX']` 报「2 镜已定稿」,
`shX` 明明不在本集却一格都没露头。两端命令层够不着(与 W214 当年记的理由同一条:
`todo` 筛法与分堆筛法互为反面,有一位归得进末堆就不到空跑早退那一行),纯函数面现跑得出。
接这一格的人:主体侧那份 `ids.filter(id => !subs.some(...))` 是现成的对照写法,
但要先判「同一集里两镜同 id」这件事本身该不该由别处拦住。

② 主体侧那段注释里「点名这一路跑不到只剩一种理由:那个 id 不在主体库」与
「真实调用点上恒为 0」两句是 W202/W214 留下的旧措辞,W214 的记账件已如实登记过
「恒为 0 并不成立」,而这两句正文至今没跟着改。本槽只合不改文(改它属于主体侧
安全阀那条线自己的活),点名记在这里免得下一波以为已经对齐。

③ W219(计划不排蒸馏,从 W215 出)仍在飞,本槽一条没碰;它落地时会与本线在
`docs/skills-wave/README.md` 索引表尾和两格 `FLOOR` 上撞车,按老办法取并集 + 合完 live。
