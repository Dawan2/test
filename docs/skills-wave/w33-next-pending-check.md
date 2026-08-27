# W33 · SK-20 镜头动态感准入:短名单里下一条 pending 校验面

> 基线 `cursor/w29-integration-068b @ 9fa3c5c`(W25 集成 + W26 SK-19 + W27 SK-10 注入半),落地分支 `cursor/w33-next-pending-check-8ca3`。
> 本槽只加**一条**校验项 `shots.motionDiscipline`,挂在 SK-20 `shots.motionGate` 上,清掉该条目的 `pending: ['check']`。
> 不改任何既有结论、不改就绪检查两端实现、不改问题中心与发布门、不新增计费动作、未删测。
> 与并行槽的边界:W28 SK-22 生成凭据面在 `cursor/w28-sk22-gen-check-0c60`、W30 KB 登记面契约在 `cursor/w30-kb-skill-cover-411f`、W31 SK-16 前段编排在 `cursor/w31-sk16-playbook-2b20`,三条都不在本槽基线里,本槽一行未碰它们的实现与登记块。

## 1. 挑条目的过程(为什么是 SK-20)

按短名单编号扫「`pending` 含 `check` 且 `checks` 为空」的条目,基线上一共四条:

| 条目 | 缺口 | 基线 note 说的判定输入 | 本槽取舍 |
|---|---|---|---|
| SK-20 `shots.motionGate` | S-04 | 「节拍板五段式产出是判定输入,现无对应领域命令」 | **本槽落地**——分镜表这一份判定输入现成可用,节拍板那一份仍缺(见第 6 节) |
| SK-22 `gen.renderCredential` | S-05 | 只读既有判旧指纹与未确认计数 | 并行槽 W28 在做,不碰 |
| SK-24 `review.methodDim` | G-10 | 审片报告的方法论维度 | 判定输入是 LLM 报告,属 G-10 语义面,不在校验层冒充 |
| SK-29 `film.deliverContract` | G-10 / S-07 | 发布门的方法论门 | 要动发布门口径(默认 warn 的可选门),产品口径未定 |

SK-20 是编号最靠前的一条,也是唯一一条"判定输入已经在数据里、只是此前登记为无出口"的:它的 `kb` 引的两条条目(「剪辑节奏」「抽卡军规」)都有可落到分镜字段与真实生成请求上的字面判据。W26 的残留清单第 3 条正是这一面——当时把军规①②记为"与 SK-13 多镜头写法面重叠故留待定",本槽把重叠面切开后落地(第 3 节)。

## 2. 结果一句话

分镜面从两条校验项变三条:除 SK-18 景别衔接、SK-19 抽卡稳定词外,SK-20 现在判**这一镜的动态写得进不进模型的稳定区间**,以及**整集镜长有没有分布**,一律 `warn`。面表 `Skills.preflightStages()` 仍是五面(`script → subjects → eps → shots → film`),结论数从十三条变十四条——**两端就绪检查实现一行未改**,新面靠登记自动被消费。

回归:`unit 343/343`(基线 336,净 +7 用例)、`integration 93/93`、`cli.smoke 62/64`(两项失败在基线上逐项相同:`未登录 whoami → exit 3`、`llm --json mock 链路`,属基线环境态)。未删测、未放宽任何既有断言。

改动:`js/skills.js` +73−5(校验项 + 条目登记)、`tests/unit.js` +107−7、`README.md` +6−5 与 `docs/skills-wave/README.md` +2−1 口径同步、本记账件。

## 3. 判什么、不判什么

三条命中码,全部 `warn`:

| 码 | 判据 | 判定输入 | 出处 |
|---|---|---|---|
| `motion-overrun` | 动作描述里出现大幅动作词(取最早那个,一镜一条) | `s.prompt` 优先 `s.plot` 那段动作描述 | 「抽卡军规」①「动作写慢写连续…不写这类大动态」 |
| `camera-move-crowded` | 这一镜命中两个以上不同运镜(`name` 列出命中的运镜名) | `Domain.buildVideoRequest` 装出的真实提示词 | 军规②「运镜写稳写简单…一次只给一个运镜」 |
| `rhythm-flat` | 整集每一镜的真实镜长都一样(整集级一条,可判定镜数 <4 不下断言) | 该请求的 `duration` | 「剪辑节奏」「节奏=镜头长度分布」 |

**判定输入分两段取,取哪一段跟着判据走**——这是本槽唯一一处与 W26 不同的口径决定:

- **动作幅度判动作描述那一段**。真实请求 = 主体定义前置 + `s.prompt`/`s.plot` + 轴线规则 + 运镜 + 机位 + 美术风格后缀 + **负面约束**。装配段本就不写动作,而负面约束是用户写"不要打斗、不要爆炸"的地方——拿整条请求判动作幅度会把禁写词读成"这一镜写了大动作"。用例里正有一条:项目 `negPrompt: '不要打斗、不要爆炸'` 而这一镜写的是「她缓慢转身」,期望零命中。
- **运镜条数判装好的那一条**。运镜是装配时按 `s.camera` 追加的(`;运镜:推镜头`),"一镜给了几个运镜"只有在装好的提示词上才看得全:提示词里另写了一个运镜、与 `s.camera` 不是同一个,正是军规②要拦的那种写法。
- **镜长取该请求的 `duration`**(`Domain.estShotDuration`,与合成段时长 `segDurationOf` 同一份估长)。分镜字段 `s.duration` 不是发出去的那个数,判它等于判一个不影响成片的字段。

不判的几件事,以及为什么:

- **首尾帧策略的镜不在本项报大幅动作**。同一判据在 SK-13 `subjects.multiShotPrompt` 已有 `frames-motion-overrun`(条目「首尾帧策略时动作幅度收敛,保证两端画面可插值」),两面都报同一件事是噪音。边界:`q.strategy === 'frames'` 的镜跳过本码,交给那一面。大幅动作词表也只有一份——`BIG_MOTION` 由两面共用,不写第二份词表。用例同时断言"本项零命中"与"SK-13 那一面仍如实报 `frames-motion-overrun:打斗`",两面合起来不漏不重。
- **机位栏的角度/景别取值不算运镜**。`WfCore.CAMERA_MOVES` 里有三项 `axis` 是 `angle`/`size`(它们是 `camera` 枚举的早期取值,留在取值全集内以免动存量分镜数据与生成指纹),而请求装配的机位段本就带「俯拍」「特写」这类词——收进来会把机位描述算成第二个运镜。判据只取 `axis === 'move'` 那七项。
- **同一运镜的全名与简写只计一次**。条目示例里两种形态都写得到(全名与去掉"镜头"二字的简写),故每个运镜的两种字面命中任一即计一次,不会把一个运镜算成两个。
- **模糊词、稳定词不在本项**:归 SK-19(军规③⑤);**一镜切太碎、图生视频一致性声明**不在本项:归 SK-13。
- **这一镜该快该慢、动态感够不够、节奏对不对**仍归 LLM 审片(G-10)。本层只判文本层与计数看得见的部分,不冒充质量评分——与剧本段/分集段/景别面同一条纪律。

## 4. 判据字面与词表:都不在 skill 层写第二份

```js
const GC_RULES = String(KB.section('抽卡军规') || '');
const BIG_MOTION_RULE = GC_RULES.indexOf('大动态') >= 0;        // 军规①
const ONE_MOVE_RULE = GC_RULES.indexOf('一次只给一个运镜') >= 0; // 军规②
const FLAT_RHYTHM_RULE = String(KB.section('剪辑节奏') || '').indexOf('镜头长度分布') >= 0;
const moveNames = () => wfCore().CAMERA_MOVES.filter(x => x.axis === 'move').map(x => x.name);
```

沿用既有纪律:判据字面现取条目正文(SK-09 的单句阈值、SK-14 的六段区间、SK-19 的两组词表同理),运镜词表现取 `WfCore` 机位词表单源(与 SK-18 取 `sizeGap` 同理)。`WfCore` 仍以解析器形态**取值时现解析**——浏览器加载顺序上 `wf-core.js` 晚于 `skills.js`,顶层取值会绑到 `undefined`。原先那条"`wfCore()` 只出现一次"的契约断言随之改写成判真实约束:**顶层不得出现 `= wfCore()` 的取值**(用到它的校验项会越来越多,数字本就会漂)。

条目被改写时的行为是**判据退空,不是假命中**。

## 5. 变异实测

| 变异 | 实测行为 | 转红的断言 |
|---|---|---|
| 动作幅度改判整条真实请求 | 负面约束里的「不要打斗」被读成动作命中 | 1 条(负面约束那条) |
| 去掉 `q.strategy !== 'frames'` 边界 | 首尾帧镜被两面同时报 | 1 条(归属边界那条) |
| 运镜词表换成 `WfCore.CAMERAS`(含角度/景别两轴) | 机位段的「俯拍」被算成第二个运镜 | 2 条(行为 + 源级取表) |
| 镜长改取 `s.duration` 字段 | 整集镜长读成 0 秒,`rhythm-flat` 的实测值失真 | 1 条 |
| 三处判据字面在条目正文里全部改掉 | 三码全部退空、零命中零假报(实测结论仍是 `info`,`hits: []`) | 5 条(三条行为 + 字面单源 + 镜级入口那条) |
| 摘掉 SK-20 的 `episode.preflight` 登记 | 行为不变(面表由 SK-18 带着 `shots` 面进表,校验项照跑),但记账与实况脱节 | 2 条(本槽消费点那条 + 既有的双向对齐断言) |

最后一行是本槽最想钉住的那件事:登记面说"没接",实际却在就绪检查回执里跑——这类脱节没有断言时是静默的。

## 6. 消费点:面表自动跟上,两端实现零改动

SK-20 的登记变化:

| 字段 | 改前 | 改后 |
|---|---|---|
| `pending` | `['check']` | `[]` |
| `checks` | `[]` | `['shots.motionDiscipline']` |
| `cmds` | `['episode.generateStoryboard']` | `['episode.generateStoryboard','episode.preflight']` |
| `covers` | `['shots']`(缺省) | `['shots','gen']`(判定输入含真实生成请求,与 SK-19 同口径) |
| `gaps` | `['S-04']` | `['G-10','S-04']` |

**S-04 不清账**:该缺口登记的判定输入是节拍板五段式产出,它至今没有领域命令出口,本槽落地的是分镜表这一份输入,两者不是同一件事。把 S-04 摘掉等于用"另一份输入判得动"冒充"那份输入接通了",故 `gaps` 保留 S-04 并在 `note` 里写明;新增的 G-10 是语义面(该快该慢归审片),与其余校验型条目同口径。

分镜面(`shots`)早在 W13 落 SK-18 时就进了 `Skills.preflightStages()`,故本条落地后**面表内容一字不变**,`Skills.check('shots', …)` 自动多跑一条——`js/commands.js` 与 `cli.js` 的 preflight 段一行未改。抬的口径数字共四处(全是"现有 N 条"这类快照断言):`commands` 套件的 `skill` 期望串加一项、`skills` 套件的分镜步条数 2→3、面表两处 13→14。

**只报不拦**,由用例钉住:不进 `blockers`、不改 `ok/status`;问题中心不新挂提醒(断言 `js/issues.js` 里不出现 `shots.motionGate`——要不要挂低危提醒的产品口径未定,不替产品定);生成动作不加拦截(`js/sb-gen.js`/`js/produce.js` 里不得出现 `Skills.`);发布门 G2 仍只数高/中危;`episode.preflight` 仍是 `read` 类零计费。

## 7. 新增用例(7 条)

| 用例 | 钉住的事 |
|---|---|
| 小幅慢动作 → `info`;大幅动作 → `motion-overrun` | 命中码、命中词与位置、`shotId`;负面约束里的禁写词不算动作命中 |
| 首尾帧镜归 SK-13 插值面 | 本项零命中 + 那一面仍如实报,两面不漏不重 |
| 两个运镜 → `camera-move-crowded` | 运镜名串、`count`/`limit`;全名与简写只计一次;机位栏角度/景别不算运镜 |
| 整集镜长全同 → `rhythm-flat` | 整集级不冒充镜号、实测镜长与镜数;镜数不足不下断言;镜长有分布不报(附真实 `duration` 序列断言) |
| 判据字面与运镜词表单源 | 三处条目字面仍在正文里;源级取 `CAMERA_MOVES` 的 move 轴;词表逐项跟着表走(move 轴每项都判得动、非 move 轴一项都不算) |
| 纯函数与无判定输入 | 同输入同结论、不改领域对象;提示词未写/无镜头/无项目上下文不冒充结论;镜级入口只判那一镜且无整集节奏可比 |
| 消费点 | `pending` 已清、`checks`/`cmds` 登记、S-04 未清账、面表推导含本条、零计费、不拦生成、不进问题中心、发布门口径未动 |

夹具复用 SK-19 那三个(`lexP`/`lexShot`/`lexEp`),新增的只是"带一个运镜的镜"包装 `mgShot` 与取结论的 `motionOf`,不动别的段的夹具。

## 8. 复核方式

```
git checkout cursor/w33-next-pending-check-8ca3
node --check js/skills.js tests/unit.js     # 通过
node tests/unit.js          # 343/343 PASS
node tests/unit.js skills   # 含 motionDiscipline 七条
node tests/unit.js contract # 全通过(README 两份数字对账现取实况)
node tests/integration.js   # 93/93 PASS
node tests/cli.smoke.js     # 62/64(两项与基线同样失败)
node -e "const S=require('./js/skills.js');console.log(S.preflightStages().reduce((n,st)=>n+S.check(st,{}).length,0))"   # 14
```

`node tests/e2e.js` 按仓库纪律未跑(需用户明确要求)。本槽不含合并。

## 9. 交接:短名单里剩下的 pending 面

本槽落地后,`pending` 还剩八条条目八处面(按机制面分类,`Skills.list().filter(s => s.pending.length)` 现推):

**check 面(3 条)**——判定输入或产品口径未定,不是缺实现:

| 条目 | 缺口 | 卡在哪 | 接手时先看 |
|---|---|---|---|
| SK-22 `gen.renderCredential` | S-05 | 只读既有判旧指纹与未确认计数出 warn;并行槽 W28 已在做,合并后本行即清 | `Domain.shotInputHash`/确认闸口径 |
| SK-24 `review.methodDim` | G-10 | 判定输入是 LLM 审片报告本身,属语义面;注入半已落地(`reviewBlock` 进评审提示词),校验半要先定"拿报告的哪个字段当判据" | [w14-review-skills-check.md](./w14-review-skills-check.md) |
| SK-29 `film.deliverContract` | G-10 / S-07 | 要动发布门(方法论门挂成可选门、默认 warn),既有 `fail/warn` 计数口径不能动;产品是否要这道门未定 | `js/release.js` 的 G1–G10 与 `Issues.collect` 契约 |

**inject 面(0 条)**:注入面已全部落地——SK-10 的注入半随 W27 闭合 S-02 后,`pending` 里不再有 `inject`。往主线加方法论注入点的路径见 [w19-g06-inject.md](./w19-g06-inject.md) 与 [w27-sk10-kb-inject.md](./w27-sk10-kb-inject.md)。

**orchestrate 面(2 条)**:

| 条目 | 缺口 | 卡在哪 |
|---|---|---|
| SK-05 `core.playbookProjection` | G-12 | 计划步骤(`js/plans.js`)改由注册表投影生成会改既有计划产出,须单列一轮做等价对照 |
| SK-26 `review.memoryFeedback` | G-11 / G-02 | 审片结论按板块回流专家的那一步尚无命令出口,沿用既有记忆桶、不新建存储桶 |

**infra 面(3 条)**:SK-03(G-01)、SK-04(G-02)、SK-23(G-03) 的实况都已落地,三条 `note` 也写明了出口,`pending` 留的是**注册表侧记账收敛**——改 `pending` 会动 `Skills.gaps()` 投影(G-01/G-02/G-03 会从投影里消失),该动作牵三条条目与若干断言,应单列一轮一次做完,不要顺手改一条。

**另外一条编排面已落地但仍有余量**:SK-16 `eps.frontPipeline` 的 `steps` 只覆盖后两步,拆集与主体提取两步进 `steps` 会改本编排产出——并行槽 W31 在做。

剩余面的共同纪律,交接时别丢:未落地的面一律不挂假出口(`pending` 含 `check` 不得登记校验项、含 `orchestrate` 不得登记步骤、含 `inject` 不进拼块),`Skills.validate` 与 contract 套件会先红。
