# W202 集成记账:W197 主体空跑回音 + W198 人手命令不进 steps

新基线 `cursor/w199-integration-540b`,tip `825705a`。按序两次 `--no-ff` 合入两条**已完成**支,
两支都从 **W193**(`d55cd7d`)叉出、互不相识,合完 live 现取全部数字。
在飞的 W200(`!s.image` 三处)与 W201(`Plans.runAll` 拦 evolve)按任务口径**一条没碰**。

## 一、两次合并

| 次序 | 被合入支 | 实际 head | merge commit | parents |
|---|---|---|---|---|
| 1 | `cursor/w197-subject-empty-note-cb6e` | `fb048d5` | `6a015ec` | `825705a` + `fb048d5` |
| 2 | `cursor/w198-evolve-not-in-steps-fb5a` | `5b0c094` | `f7c335e` | `6a015ec` + `5b0c094` |

两次都是真 `--no-ff`(两个 parent 齐全,不是快进);全程没用过 `--ours`,没用过 `checkout <old> -- .`。

## 二、四棵树机检:哪些是并集,哪些是 git 直接取对侧

冲突块数不等于成色。逐文件比对 基线 `B` / 我方 `P1` / 对侧 `P2` / 合完 `M` 四个 blob:

**第一次合并(`825705a` + `fb048d5`,B = `d55cd7d`)**

| 文件 | 成色 |
|---|---|
| `README.md` | 真三方(M 不等于任一侧) |
| `docs/skills-wave/README.md` | 真三方 |
| `tests/unit.js` | 真三方 |
| `cli.js` | 真三方(**零冲突块而两侧都改过**) |
| `js/commands.js` | 真三方(**零冲突块而两侧都改过**) |
| `js/domain.js` | `M == P2` 且 `P1 == B`——**不是并集**,git 直接取对侧 |
| `tests/cli.smoke.js` | `M == P2` 且 `P1 == B`——不是并集,取对侧 |
| `js/api.js` / `js/produce.js` / `js/skills.js` | `M == P1` 且 `P2 == B`——对侧没碰,取我方 |

**第二次合并(`6a015ec` + `5b0c094`,B = `d55cd7d`)**

| 文件 | 成色 |
|---|---|
| `README.md` / `docs/skills-wave/README.md` / `tests/unit.js` | 真三方 |
| `js/skills.js` | 真三方(我方 W194/W195 段与对侧的递归扫段各占一处) |
| `js/cmd-registry.js` | `M == P2` 且 `P1 == B`——**不是并集**,git 直接取对侧 |
| `cli.js` / `js/api.js` / `js/commands.js` / `js/domain.js` / `js/produce.js` / `tests/cli.smoke.js` | `M == P1` 且 `P2 == B`——对侧没碰,取我方 |

`js/cmd-registry.js` 正是任务提示的那一格:本尖自 W193 以来一个字没动过这个文件,
故 `manual: true` 那一位是 git 整份取的对侧,**不是两侧合出来的并集**——如实登记。
`js/domain.js` 同理:`emptyBatchNote` 早在 W188 就进了 `d55cd7d`,对侧那份 = 基线 + `emptySubjectImageNote`,
故"整份取对侧"这一手**没有**把 `emptyBatchNote` 带走(下面第四节现验)。

## 三、三个冲突文件怎么解的

**`README.md`(两处冲突,都只差数字)**
那句一万多字的长行按 `;**` 切段做**多重集**比对:两次合并都是 7 段对 7 段、只有 1 段不同,
差的就是 `实测 N 条断言` 那个数;另一处 23 段对 23 段、2 段不同,逐段做**前后缀对齐**确认
差额只有 `602/590`(`587`)那个数字与我方独有的 `api.js` 回退口径整段 + 套件清单里的 `api|` 一项——
**我方是超集**,故取我方整句,一个字都不用往回插。两支相对各自叉点的 README 改动**纯粹是数字**
(W197:586→590、130→131、108→109;W198:586→587、130→131),核完确认没有夹带散文。

**`docs/skills-wave/README.md`(两处冲突)**
份数那行取我方后按 live 重算;索引表那处两侧**各在同一锚点追加**,取并集并按波次号**升序**归位——
W197 那行插在 `w196` 与 `w199` 之间(不是追加到表尾),W198 那行插在 `w197` 与 `w199` 之间。
索引次序本身有判据,追加到表尾会当场红。

**`tests/unit.js`(第一次三处、第二次两处)**
第一次的头一处是两侧**各在同一锚点追加一条用例**:机械去标记会当场语法错,
取并集时补回一行 `  } },` 把我方最后一条收口(这一手与 W193 记的是同一形状)。
其余四处都是 `FLOOR` / 对账数字,取我方后按 live 重算。

## 四、`js/domain.js` 两份 note 怎么留的

任务点名要留的两份**都在,且是两份**:

- `D.emptyBatchNote`(第 276 行,W188 那份,镜头侧)
- `D.emptySubjectImageNote`(第 307 行,W197 新加的第二份派生,主体侧)

第一次合并里 `js/domain.js` 是 git 整份取的对侧(`P1 == B`),所以"两份都在"这件事
**不是 git 合出来的、是对侧本来就带着的**,必须现验而不能靠冲突块数推断——已逐条现取确认。
两端调用点各读各的、没有交叉:`js/commands.js` 第 114 行读 `emptyBatchNote`、第 234 行读 `emptySubjectImageNote`;
`cli.js` 第 1046 行读 `emptyBatchNote`、第 1283 行读 `emptySubjectImageNote`。
W197 的口径「不要改读 `emptyBatchNote`」**反向也钉着**:contract 那条用例明确禁止主体侧混用镜头那份。
`Commands.digest` 一行没改(`result.note` 是 W188 定义的通用位,本槽只是多了第二个生产者);
`ok`/`blocked` 分档一个字没动(空跑仍是 `ok`)。

## 五、live 数字(全部合完现取,两支自称一律不抄)

两支自称的 `590` / `587` 都是**在 W193 上**量的数,不是答案;分母同理。

| 口径 | W199 基线 | 合完 live | 说明 |
|---|---|---|---|
| `unit` | 602 | **607** | +5 = W197 四条 + W198 一条 |
| `contract` 套件 | 132 | **134** | 两支各 +1 |
| `integration` | 143 | **143** | 未动,但实跑复核 |
| `cli.smoke` | 106/108 | **107/109** | 分母按合完 live 实跑定 |
| `GUARD_TOPICS` / `TOPIC_FLOOR` / 花名册 | 19 / 19 / 19 | **19 / 19 / 19** | 两支都没登记新主题,故一条不动 |
| 记账件份数 | 212 | **215** | 含 W197 / W198 / 本文三份 |

`cli.smoke` 分母这一格按任务口径**既不抄 W197 自称的 109、也不默认留 108**,按合完 live 实跑点数,
得 109——与 W197 自称逐字相同,但这次是量出来的。两条失败(`未登录 whoami → exit 3`、`llm --json mock 链路`)
与 W199 基线上同名同表现,是与 `master` 同源的既有失败,不由本槽引入。

`unit` 的 `FLOOR` 由 602 抬到 607(差额 5 格已超 3 格上限,不抬会红在棘轮那条上);
记账件 `FLOOR` 由 212 抬到 215。`integration` / `cli.smoke` 两格的 `FLOOR` 按 live 就位。

## 六、名集比对(`|` 切、**多重集**、不 unique-sort)

- `unit`:基线独有 **0** 条,tip 新增 **5** 条,零吃测。
- 两支相对各自叉点 `d55cd7d` 的新增(W197 四条、W198 一条)**逐条都在 tip 上**,一条没漏;
  两支相对叉点各自删掉 **0** 条。
- `cli.smoke`:基线独有 **0** 条,新增 **1** 条(W197 那条 `exec subject.generateImage 一位也没跑`)。
- `integration`:143 对 143,两侧名集逐条相同。

## 七、变异抽查

合完的产品码上现跑,每手改完即还原:

| # | 变异 | 红 | 报在哪 |
|---|---|---|---|
| M1 | SK-25 的 `steps` 里插一条 `expert.evolve` | 见下节 | — |
| M2 | SK-30 的 `steps` 里插一条 `expert.evolve` | 见下节 | — |
| M3 | 摘掉 `js/cmd-registry.js` 的 `manual: true` | 见下节 | — |
| M4 | `Skills.validate` 的递归扫只扫顶层 | 见下节 | — |
| M5 | 主体空跑改读 `Domain.emptyBatchNote`(混用镜头那份) | 见下节 | — |
| M6 | 主体空跑不写 `result.note` | 见下节 | — |
| M7 | 摘掉 `Domain.emptyBatchNote`(证明它没被本槽带走) | 见下节 | — |
| M8 | 主体空跑由 `ok` 改判 `blocked` | 见下节 | — |

## 八、残留

（合完后补）
