# W14 · 审片路径接入 Skills.check 只读消费 + infra 面记账诚实位对齐

> 本轮两件事:①把**已落地**的校验项结论接进审片路径的只读消费(审片报告独立字段 + 弹窗/导出展示);
> ②把 SK-03 / SK-04 的 `pending: ['infra']` 与 G-01 / G-02 已落地实况对齐(补 `note`,**不动 pending**)。
> 不改发布门计数口径、不把 warn 升成硬拦、不新增校验项、不新增计费动作。

## 0. 基线与范围

| 项 | 值 |
|---|---|
| 基线分支 | `cursor/w11-preflight-film-assert-883b @ a2709a3`(集成线 head;实测 `cursor/w9-integration-f8f9 @ 641a1f5` 是它的严格祖先,只多 3 个提交:就绪检查字幕面断言 + README 口径 + 记账件) |
| 本支 | `cursor/w14-review-skills-check-5291`,领先 `master` 108 个提交 |
| 未采基线 | 任务书提到的 `w13` 在远端**不存在**(末次 fetch 全量分支列表无该分支),故取集成线现 head |
| 不碰的面 | `js/skills.js` 的 `CHECKS` 表(留给 W12 景别 check)、`pending`/`gaps` 投影、`js/release.js` 全文、`js/commands.js`/`cli.js` 的 `episode.preflight` 段、`wf-core.js` 报告规整 |

被核缺口:W10 核验报告第 8.1 节阻塞 7——「G-10 成为校验面总瓶颈:已落地校验项全部只挂在就绪检查与问题中心,
`js/release.js` 与 `js/review.js` 对 `Skills` 的引用数实测为 0」。本轮把 `js/review.js` 那一半接上
(实测引用数 0 → **4**),`js/release.js` 按任务书要求**仍为 0**(发布门方法论门属 SK-29,仍 `pending: ['check']`)。

## 1. 只读消费的口径(先定纪律,再看实现)

`Skills.check` 的结论进审片路径,只做**独立字段 + 独立展示区**,不改既有任何判定:

| 纪律 | 落法 |
|---|---|
| 不改评分 | 命中挂 `report.checks`,三维分数与整集四维结构逐字不动;`localReview` 的评分种子仍只是 `s.id + s.prompt` |
| 不并入 `issues` | `issues` 是达标线 7.0、`canRevise`(报告页重抽入口)、`unoptimized`(批量一键优化)、`autoSmartReview` 重试与 `WfCore.reviewFixes`(提示词修订)的输入面——命中一旦并进去就等于改了重抽与扣费行为,故一律不并 |
| warn 不升硬拦 | `level` 照校验项原样带出(`warn`/`fail`),展示为「提醒 / 需修正」标签;不进 `Domain.episodeState.blockers`、不改 `ok/status`、不拦生成与合成 |
| 不改发布门 | `js/release.js` 一行未改:G2 仍只数问题中心的高/中危,G3 仍只读 `ep.lastReview.avg`;断言另加一条「发布门不读审片报告的校验命中字段」 |
| 计费不新增 | 校验项纯本地零 LLM,`shotChecks` 在 `reviewShot` 已扣费之后执行,不新增 `billingAction`、不改 `COST.review`;断言实测两次审片仍只有两次预扣 |
| 不重复报 | 只取 `hits` 带**本镜 `shotId`** 的命中;集级结论(开篇钩子、打脸四步、整集字幕轨)仍归就绪检查与问题中心 |

## 2. 实现(逐处)

### 2.1 `js/review.js` 新增镜级汇总(唯一取数口)

```js
function shotChecks(p, s) {
  if (!window.Skills || !p || !s) return [];
  return Skills.check('script', { p, s }).concat(Skills.check('subjects', { p, s }))
    .map(x => ({ id: x.id, skill: x.skill, level: x.level, hits: (x.hits || []).filter(h => h.shotId === s.id) }))
    .filter(x => x.hits.length);
}
```

三个取舍点:

1. **传 `{p, s}` 而不是 `{p, ep, s}`**。剧本面三条的判定输入是**正文本身**(`o.ep ? o.ep.content : p.script`),
   带上 `ep` 会让开篇钩子/打脸四步按整集正文出结论、让台词长度判**全集所有镜**——挂在单镜报告上属错位归因。
   镜级入口是校验项本身已有的语义(`w4-subject-ref-check.md` / `w8-script-check.md` 都为它写了断言),不新造口径。
2. **按 `shotId` 过滤**是第二道闸。项目剧本原文仍会喂给 `script.openingHookAnchor`(拆集前的整本也判得动),
   它的 `hits` 不带 `shotId`,过滤后自然不进单镜报告——实测摘掉这行过滤,报告里会多出 `script.hookStrength` 一条(见第 4 节转红表)。
3. **结论按主线步序 `script → subjects`**,与两端就绪检查同序;当前实际出现的命中码四个:
   `long-line`(SK-09)、`unknown-subject` / `no-ref-image` / `no-subject-ref`(SK-12)。
   跨镜一致性(SK-13)与成片字幕(SK-28)是集级判定,镜级入口下如实回空结论,不冒充。

### 2.2 挂点与展示

| 位置 | 改动 |
|---|---|
| `reviewShot` 版本绑定段 | 与 `videoInputHash`/`videoUrl` 同处写 `report.checks = shotChecks(p, s)`——LLM 路径与离线本地评审**同附**(离线本地评审本就没有 LLM 判定,本地结构化命中在这里最有用) |
| `reportModalHTML` | 关键问题定位区之后加一区「方法论校验命中」,注明「知识库判据本地校验,零积分;只提醒不拦生成,不计入上方评分」;校验项名现取 `Skills.byId(c.skill).name`(不在展示层写第二份名字) |
| `exportReport` | 导出 TXT 同列一段,标注「本地判据,只提醒不拦生成,不计入评分」 |
| `normReview` | 旧报告缺 `checks` 字段按**空数组**处理——不回补(回补等于拿今天的分镜状态冒充当时的审片结论,与报告的版本绑定语义冲突) |
| 命中文案 | `CHECK_TXT` 四条 code → 人话,判据一律留在校验项里;未知 code 回落原样显示(将来新增码不至于不显示) |

### 2.3 `js/skills.js` 登记侧(只动 `cmds` 与 `note`)

| 条目 | 改动 |
|---|---|
| SK-09 `script.dialogueRule` | `cmds` 补 `episode.smartReview`;`note` 写明「经就绪检查、问题中心与审片报告消费——审片路径只读附本镜命中(独立字段,不并入 issues、不改三维/四维评分与达标线)」;`gaps` 仍留 `G-10`(潜台词等语义面仍属审片维度) |
| SK-12 `subjects.refIntegrity` | 同上口径,`gaps` 仍留 `S-03` |
| 未动 | `pending`、`gaps`、`checks`、`CHECKS` 表、SK-24(方法论维度评分仍 `pending: ['check']`)、SK-29(发布门方法论门仍 `pending: ['check']`) |

`episode.smartReview` 这个消费点是**真的接上了**才登记的:`Commands.execute('episode.smartReview')` → `SB.autoSmartReview`
→ `Review.reviewShot` 是同一条链,单镜按钮/整集审片/智能审片闭环三个入口共用这一个挂点。
W10 报告第 5.3 节点名的「不得挂未接的审片命令面」那条断言(针对 SK-07/SK-08)继续成立——
开篇钩子与打脸四步是集级结论,本轮**没有**接进审片报告,故两条的 `cmds` 一字未加。

## 3. 记账诚实位:SK-03 / SK-04 / SK-23

三条 `pending: ['infra']` 与实况矛盾已两轮,且三条的诚实度不一致(W10 报告第 5.3 节)。本轮按 SK-23 的规格收口:

| 条目 | 改动前 | 改动后 |
|---|---|---|
| SK-23 `review.stage` | `note` 已如实写「G-03 已落地…pending 留的是注册表侧记账收敛(改 pending 会动 gaps 投影,单列一轮)」 | **一字未改**(它就是本轮对齐的基准口径) |
| SK-03 `core.personaCtx` | 无 `note`,读者只能读成"人设过服务端还没做" | 补 `note`:G-01 已落地(服务端唯一装配口 `wfPersonaNote`,浏览器同装配口)+ 同款收敛说明 |
| SK-04 `core.memoryDual` | `note` 只写设计口径(「召回策略抽为纯函数后双端同用」) | 改为 G-02 已落地(已抽为 `WfCore.memRecall`/`memBlock` 双端同用)+ 同款收敛说明 |

**`pending` 与 `gaps` 一字未动**:改 `pending` 会动 `Skills.gaps()` 的产出与依赖它的断言,属注册表记账收敛那一轮的事
(W10 报告第 8.2 节第 3 项建议与 SK-16 编排补前段两步合并为一轮)。本轮只把"读者会读错"这件事修掉,不假清未完成面。

新断言把 note 钉在**实况**上而不是文字上:三处出口(`server.js` 的 `function wfPersonaNote(`、
`WfCore.memRecall`+`memBlock`、`Domain.workflow` 含审片步)任一消失,断言先红——note 不会变成一句无人核对的话。

## 4. 测试与转红验证

本槽实测(干净工作树):`unit 290 → 293 PASS`(+3)、`integration 93/93`、`cli.smoke 62/64`
(仍是 `master` 基线那两项:未登录 whoami exit 码、`llm --json` mock 链路)。改动文件全部过 `node --check`。

新增三条断言(进 `skills` 套件,与既有校验项断言同处):

| 断言 | 覆盖 |
|---|---|
| 审片报告只读消费(行为) | 沙箱加载真实 `js/review.js`(离线 → 本地模拟评审):命中按主线步序两条、`id` 与 `skill` 双给、`hits` 全带本镜 `shotId`、项目剧本的集级钩子结论不混入、干净夹具零命中;`issues` 与得分与**同种子**的干净夹具逐字相等;两次审片仍只有两次预扣 |
| 审片报告消费点(源级 + 展示) | 两面须同在 `shotChecks` 一处汇总且按步序(只在别处调用不算消费);**按登记侧反查**:凡 `pending` 不含 `check`、`checks` 非空且 `cmds` 含 `episode.smartReview` 的条目,其 `stage` 必须出现在这处汇总里(将来新增面漏接先红);命中挂独立字段、不进 `issues`;旧报告缺字段可打开、无命中不出区块、有命中时区块含「只提醒不拦生成」且校验项名取注册表条目名 |
| 记账诚实位 | 三条 `infra` 面仍 `pending`、`gaps` 仍写明编号、`note` 须写明对应缺口已落地,且三处出口实况变动即红;SK-29 仍 `pending: ['check']` + `G-10`,发布门 G2 仍只数高/中危,且发布门不读报告的校验命中字段 |

**逐条摘掉/改坏实测(全部在本槽跑过,改完即还原)**:

| 变异 | 结果 |
|---|---|
| 删掉 `report.checks = shotChecks(p, s)` | **2 FAIL**(行为断言 + 源级断言) |
| 去掉 `.filter(h => h.shotId === s.id)` | **1 FAIL**:实际结论多出 `script.hookStrength`(集级钩子混进单镜报告) |
| 把命中并进 `report.issues` | **1 FAIL**(「校验命中不得并入 issues」) |
| SK-12 摘掉 `episode.smartReview` 登记 | **1 FAIL**(登记侧反查:审片路径应已登记至少两条已落地校验条目的消费点) |
| SK-03 的 note 改成「G-01 待落地」 | **1 FAIL**(note 须如实说明已落地) |
| SK-04 假清 `pending: ['infra']` | **1 FAIL**(infra 面不得在本轮假清) |

## 5. 未做(与并行槽/后续的交接)

1. **整集报告(`ep.lastReview`)未附集级 checks**。整集审片的四维/共性区仍是原样;集级结论现由就绪检查与问题中心承担,
   接进整集报告要定"与就绪检查是否重复展示"的产品口径,本轮不擅自决定。
2. **发布门仍未接**(SK-29 `film.deliverContract`,`pending: ['check']`,`G-10`+`S-07`)。按任务书要求门禁计数口径一字未动;
   落地时按其 `note` 的既定口径「方法论门挂成可选门默认 warn,既有 fail/warn 口径不动」。
3. **SK-24 `review.methodDim` 的 check 面仍 `pending`**。本轮接的是**别的条目**的校验项进审片报告这一消费面,
   不是 SK-24 自己的"方法论维度评分"——它需要新的 `CHECKS` 实现(评分维度),仍待 G-10,`pending` 不动。
4. **给 W12(景别 check / SK-18 `shots.sizeProgression`)的接线位**:该条 `covers` 已含 `review`。落地后若要进审片报告,
   两步——① `shotChecks` 的汇总按主线步序补 `Skills.check('shots', …)`(位置在 `subjects` 之后);
   ② 条目 `cmds` 补 `episode.smartReview`。**只做②不做①会先红**(登记侧反查断言),这正是它的设计意图。
   注意:景别递进是**跨镜**判定(要看上一镜),镜级 `{p, s}` 入口下取不到相邻镜——落地时需先定它的判定输入是集级还是带 `ep` 的镜级,
   本槽不预设;`js/review.js` 的离线本地评审里另有一条基于 `WfCore.sizeGap` 的景别衔接 issue,W12 落地时应先对照它避免两份判据。
5. **给 W13(合流槽)的提示**:本支相对基线共 4 文件 +154/−8 行——`js/review.js`(+39/−1)、
   `js/skills.js`(+14/−4,四处条目字段与 `note`)、`tests/unit.js`(+99,skills 套件尾部三条)、`README.md`(+3/−2)。**没有动 `CHECKS` 表**,与 W12 的冲突面应只在 `js/skills.js` 的
   条目区与 `tests/unit.js` 的套件尾部;合流后判据:`Object.keys(Skills.CHECKS).length` 与两支之和一致、
   `node tests/unit.js skills` 全绿、README 的断言数按实跑重算(勿照抄本文的 293)。

## 6. 复核方式

```
git checkout cursor/w14-review-skills-check-5291
node --check js/review.js js/skills.js tests/unit.js
node tests/unit.js skills          # 31/31(含本轮 3 条)
node tests/unit.js                 # 293/293
node tests/integration.js          # 93/93
node tests/cli.smoke.js            # 62/64(与 master 同两项失败)

# 消费点直接读数据(不读文档)
node -e "const S=require('./js/skills.js');
  ['script.dialogueRule','subjects.refIntegrity'].forEach(id=>{const s=S.byId(id);
    console.log(id,'| cmds',s.cmds.join(','),'| pending',s.pending.length,'| gaps',s.gaps.join(','));});
  ['core.personaCtx','core.memoryDual','review.stage'].forEach(id=>{const s=S.byId(id);
    console.log(id,'| pending',s.pending.join(','),'| note 有无', !!s.note);});"

# 门禁面未被牵动
grep -c Skills js/release.js       # 0
```

`node tests/e2e.js` 按仓库纪律未跑(需用户明确要求)。本轮未开 PR、未合并任何分支。
