# W12 · 分镜景别衔接校验落地(SK-18 景别面)

> 输入件:`w1-selected-skills.md`(短名单 SK-01…SK-30)、`w4-shot-size-glossary.md`(景别阶梯与 `sizeGap` 的口径,含"校验项要判景别递进直接取 `sizeGap`,不必再抄一份阶梯"这一条)、`w4-sk13-consistency.md`(校验项落地纪律)。
> 基线:`cursor/w9-integration-f8f9`——`js/skills.js` 已有六条 `CHECKS`(剧本面三条 / 主体面两条 / 成片字幕面一条),`WfCore.sizeGap` 与六档景别阶梯已在词表单源里。本轮在其上**增量**:不动既有校验项实现,不新起注册表,不新增页面,不新增计费标签,不放宽发布门。
> 落地文件:`js/skills.js`(第七条校验项 + SK-18 条目)、`js/commands.js` 与 `cli.js`(就绪检查消费点)、`js/issues.js`(问题中心消费点)、`tests/unit.js`(skills 套件 7 条 + issues 套件 1 条 + contract 签名断言口径)、`README.md`。

## 1. 一分钟结论

- `CHECKS` 落地第七条实现 `shots.sizeLinkage`,SK-18(`shots.sizeProgression`)的 `pending: ['check']` 随之清空——**先有实现,再登记**,纪律与 SK-12/13/28 同。分镜步第一次有了自己的校验面。
- **级差不再有第二份**:相邻两镜的景别级差一律经 `WfCore.sizeGap(prev, cur)` 取,skill 层既不存景别数组也不做索引查表(单测断言 `wfCore().sizeGap` 在场、且不出现 `indexOf(prev/cur)` 形态的自建查表)。判据本身是 KB「景别运镜」衔接那句落到级差上,正文不进本层。
- 判定内容是**景别递进与跳切**三码:连续同景别成串、两极对切缺过渡、整集没用上隔级递进。级别一律 `warn`——这一镜景别选得对不对、有没有摄影层面的设计意图属语义面,仍归 LLM 审片(G-10)。
- **轴线面照旧不冒充**:SK-18 条目名含"轴线",但越轴与匹配剪辑的判定输入是机位方位/进出画方向,分镜字段无承载。条目 `note` 与 `gaps` 如实把这一半留在 G-10,校验项只判景别面。
- 消费点是既有的**生产就绪检查**与**问题中心**:两端 `episode.preflight` 的 `result.checks` 按主线步序在主体面之后、成片面之前多一条结论;问题中心新增 `shot-size-linkage` **低危**提醒。**只报不拦**——不进 `Domain.episodeState.blockers`、不改 `ok/status`、不改发布门(G2 只数高/中危)、不新增计费动作与标签。
- 验收:`node tests/unit.js` **296/296 通过**(基线 288,新增 skills 套件 7 条 + issues 套件 1 条);`node tests/integration.js` 93/93;`node tests/cli.smoke.js` 62/64(2 项在基线上同样失败,与本轮无关)。未删测、未放宽既有断言。

## 2. 校验项判据

`CHECKS['shots.sizeLinkage'](obj)`,`obj` 收领域对象包 `{p, ep}`(景别只在镜上,项目字段不参与判定);返回 `{pass, level, hits}`,`Skills.check` 再包一层 `{id, skill, …}`。

逐对扫 `ep.shots` 的相邻两镜,景别取 `s.cameraSpec.shotSize`,级差取 `WfCore.sizeGap`:

| 命中码 | 判据 | 级别 | 为什么是问题 |
|---|---|---|---|
| `flat-run` | 连续 3 镜以上同景别(级差 0 连成串) | `warn` | 一串镜头没有递进,视觉节奏平;`hits` 定位到串首镜并带串尾镜号 `to` 与串长 `run` |
| `jump-cut` | 相邻两镜级差 ≥ 4(两极对切) | `warn` | 缺全景/中景过渡,衔接生硬;`hits` 带上一镜景别 `base` 与实测级差 `gap` |
| `no-progression` | 整集**可判定**的相邻对里最大级差 < 2 | `warn` | 全集只在同级/相邻之间切,始终没用上"隔一级切换";整集级一条,`order: 0` 不冒充镜号 |

判定下限与不判定口径(都是"不冒充结论"的具体形态):

- **级差 -1 不判定**:任一端没填景别或写了阶梯外自定义词,该对既不算递进也不算跳切,**并打断同级串**——两段各两镜的同景别被一个空景别隔开时不合并计数,不拿"没填景别"凑出串长。
- **两镜同景别不报**:正反打(同景别对切)是常用手法,成串下限取 3 镜,宁可漏判也不制造噪音。
- **级差 3 不报**:如全景→超级特写,按阶梯正文属隔级递进(与 `w4-shot-size-glossary.md` 的口径一致,`review.js` 侧同样不误报)。
- **整集级结论有对数下限**:可判定相邻对少于 3 对时不下"整集无递进"这种全局断言(三镜以内的片段本就看不出整集节奏)。
- **单镜与镜级入口回空结论**:只有一镜或只传 `{p, s}` 时无相邻可比,回 `info` + 空命中,不拿"通过"冒充"没判"。
- 纯本地零 LLM 零计费、纯函数:同输入同结论,不改动传入的领域对象(单测逐条断言)。

### 与 `js/review.js` 离线景别衔接检查的分工

两处判据同源(都取 `WfCore.sizeGap`,都出自 KB「景别运镜」),但作用面与产物不同,本轮**没有合并、也没有互相复制**:

| | `js/review.js` 离线检查 | 本轮校验项 |
|---|---|---|
| 触发 | 离线本地评审(单镜评审报告的一条 issue) | 就绪检查与问题中心(纯本地,随时可跑) |
| 视角 | 逐镜与上一镜比,产出"运镜/景别偏差"轻微问题 | 集级:成串、对切、整集递进三码 |
| 报的口径 | 同级/相邻/两极三种都逐镜报,进审片报告 | 同级要成串才报、相邻只在整集层面报一次 |

同一份级差函数、两种消费面,`review.js` 一行未动。

## 3. 单源与消费点

**就绪检查:两端各加一段**。`episode.preflight` 的结论按主线步序排列,本轮插在主体面与成片面之间:

```
episode.preflight → { ok, status, result: { …Domain.episodeState, checks: [
  script.hookStrength, script.faceslapFour, script.dialogueRule,   // 剧本面三条
  subjects.refIntegrity, subjects.crossShot,                        // 主体面两条
  shots.sizeProgression,                                            // 本轮新增
  film.subtitleQC ] } }                                             // 成片面一条
```

浏览器(`js/commands.js`)与 CLI(`cli.js`)同一份结论;单测断言两端都跑了分镜面,且 `subjects → shots → film` 的顺序不漂(顺序断言是防"新面随手 concat 到末尾"的回潮)。

**问题中心:新增一条低危**。`js/issues.js` 在逐集循环里读同一份结论,聚合为 `{kind:'shot-size-linkage', sev:'low', …}`,明细给镜号区间与景别走向(如 `镜头1-3连续同景别,没有递进(中景)`、`镜头2两极对切,缺过渡镜(大全景→特写)`、`整集景别几乎没动过,始终没用上隔级切换`),处置走导航自查(不挂命令、不触发生成)。命中码→中文的展示文案落在 issues 层,判据不写第二份。

选低危与前几轮同理:发布门 G2 只数高/中危(`js/release.js` 原样不动),低危不改任何存量项目的门禁状态。

## 4. WfCore 怎么进 skills.js(加载顺序的处置)

`index.html` 的加载顺序是 `domain.js → knowledge.js → skills.js → wf-core.js`(契约断言锁死),所以 skills.js **不能在加载期绑定 WfCore**。本轮的做法:

```js
const S = factory(KB, Domain, isNode ? () => require('./wf-core.js') : () => root.WfCore);
```

第三个入参是**解析器**而不是模块本身,只在用到它的校验项体内调一次(`wfCore().sizeGap`)。这样:

- 加载期依赖仍只有 KB 与 Domain 两件双端纯模块,index.html 的顺序一行未改;
- 模块体照旧不碰环境句柄(`root` 只出现在 UMD 头);
- 契约断言从"factory 签名应为 `(KB, Domain)`"改为 `(KB, Domain, wfCore)`,并**补两条**:`wfCore()` 只出现一次、且不在模块顶层解析(顶层解析在浏览器里会取到 `undefined`,这条断言封死该回潮)。

命令层与问题中心的单测沙箱按 `index.html` 顺序补载 `prompts.js` + `wf-core.js`(wf-core 的浏览器 UMD 依赖是 Domain/KB/Prompts)。

## 5. 本轮明确不做

- **不进 `blockers` / 发布门**:`overall` 不因景别结论变化;方法论校验要不要挂成可选门是 SK-29(G-10 / S-07)的事。
- **不改计费**:`episode.preflight` 仍是零计费 read 类;问题中心的景别条目不挂命令处置,点它不发起任何生成。
- **不新增页面与实体**:无新 UI 入口(复用问题中心既有弹窗)、无新存储桶、无新领域命令、无新缺口编号(SK-18 的缺口仍只是 G-10)。
- **不动并行槽的 CHECKS 实现**:`cursor/w9-eps-structure-check-c8c2` 的分集面两条(SK-14/15)本轮一行未碰——两侧都只在 `CHECKS` 上追加自己那几条、只在 preflight 那一段各加一行 `Skills.check(…)`,合入时取并集即可(顺序按主线步序 `script → subjects → eps → shots → film`)。
- **不动 `js/review.js` 与 `js/wf-core.js`**:级差函数与离线检查照原样,本轮只是多了一个消费方。
- **不改拆镜提示词与生成指纹**:`SPLIT_RULES`/`buildSBUser` 一行未动,校验只在既成分镜表上读。

## 6. 验收挂钩

| 层 | 断言 |
|---|---|
| `tests/unit.js` `skills` 套件(新增 7 条) | 隔级递进零命中 + 级差基准确为 `WfCore.sizeGap`(隔一级=2)+ 级差 3 不误报为两极;三镜成串 → `flat-run` 带串首镜 id/镜号区间/串长,两镜同景别不报,多段成串逐段命中;两极对切 → `jump-cut` 带上一镜景别与级差 4/5,补中景过渡后不再命中;整集最大级差 1 → `no-progression` 单条集级结论(`order:0`)带最大级差与可判定对数,对数不足下限时不下断言;缺景别/阶梯外词不判定并打断同级串、单镜与镜级入口不产出结论、分镜步结论数为 1;纯函数(不改入参、同输入同结论);消费点(两端就绪检查跑分镜面 + 步序不漂 + 问题中心低危 + 发布门只数高中危 + preflight 仍 read 类 + 条目无 `pending` 且登记的校验项名正确 + 级差取自 `sizeGap` 且无自建查表) |
| `tests/unit.js` `issues` 套件(新增 1 条) | 三镜同景别入清单为低危、明细带镜号区间与景别、走导航不挂命令、且该项目不产出任何高/中危(门禁状态不变) |
| `tests/unit.js` `contract` 套件(口径收紧,未放宽) | factory 签名改断 `(KB, Domain, wfCore)`,新增"`wfCore()` 只在校验项里现解析一次""不得在模块顶层解析 WfCore";原有双向对齐断言(登记必有实现、实现必被引用、每步结论数 = 该步已落地校验项数)在七条校验项下继续成立;`index.html` 加载顺序断言原样通过 |
| 变异验证(逐条实跑过) | 把"级差 -1 打断同级串"改回不打断 → 串合并计数那条转红;两极阈值 4 改 5 → `jump-cut` 那条转红;从 `js/commands.js` 摘掉分镜面 → 消费点那条转红 |

## 7. 后续入口(本轮不做)

- **轴线面(SK-18 的另一半)**:需要机位方位/进出画方向这类结构化字段,`s.cameraSpec` 现无承载;要落地得先定"分镜是否新增方位字段",属改数据模型的定性题,不宜顺手做。
- **审片报告维度(G-10)**:景别结论现在只进就绪检查与问题清单,不进审片报告的四维评分;方法论维度进报告是 SK-24 的面。
- **生成前置提示**:批量生成前把景别结论作为 warn 提示,须先定性"提示要不要拦生成"(与 SK-13 的 G-06 同一类问题),本轮不动。
- **同一场景内的景别节奏**:"同场景连续镜的景别分布是否合理"需要场景分段产出,与 SK-20 的节拍板五段式同属 S-04 面。
