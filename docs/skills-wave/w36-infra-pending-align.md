# W36 · `infra` 三条的 `pending` 按实况清账(SK-03 / SK-04 / SK-23)

> 基线 `cursor/w34-integration-07a0 @ 9e3527d`(W29 集成 + W30 KB 登记面契约 + W31 SK-16 前段编排 + W33 SK-20 动态感准入),落地分支 `cursor/w36-infra-pending-align-cf33`。
> 本槽只做**记账对齐**:把 SK-03 / SK-04 / SK-23 三条 `infra` 面的 `pending` 按实况清空,并把三条 `note` 从"已落地实况说明"改写成"**已落地的出口 + 仍欠的覆盖余量**"。
> 不改任何实现:`js/skills.js` 之外的 `js/`、`server.js`、`cli.js`、`mcp.js` 一行未碰;不改发布门与既有 `fail/warn` 计数口径;不新增计费动作;未删测(改写一条既有用例的断言方向,用例本身保留并加密)。
> 与并行槽的边界:W34 的合并、W35 的 SK-24 校验半都不在本槽基线之外的位置上——本槽只动 SK-03/SK-04/SK-23 三个条目块与 `skills` 套件末尾三条用例,SK-24 的条目块一字未碰(它的 `pending: ['check']` 由本槽用例反向钉住,W35 落地时会自然接手)。

## 1. 为什么必须单列一轮

这三条的 `pending: ['infra']` 与代码实况矛盾,**从周期 2 到周期 4 连续被四份记账件点过名**:

| 记账件 | 记的话 |
|---|---|
| [w10-cycle2-audit.md](./w10-cycle2-audit.md) 5.3 | 「`pending` 与主干实况**已经矛盾**」,三条的记账诚实度还**互不一致**(SK-23 有说明、SK-03 一句没有、SK-04 只写设计口径) |
| [w14-review-skills-check.md](./w14-review-skills-check.md) | 补齐三条 `note` 的实况说明,**明确不动 `pending`** |
| [w20-cycle3-audit.md](./w20-cycle3-audit.md) 5.2 | 「记账诚实位已补,`pending` 未动」 |
| `w32-cycle4-audit.md` 8.5(该件仍在 `cursor/w32-cycle4-audit-f228` 上,未合入本线) | 剩余面按形态分两批排期,这三条「`note` 明写改 `pending` 会动 `gaps` 投影,单列一轮」 |

四波都停在同一句拦路话上:**「改 `pending` 会动 `Skills.gaps()` 投影,该动作牵三条条目与若干断言,应单列一轮一次做完」**(见 [w33-next-pending-check.md](./w33-next-pending-check.md) 第 9 节)。本槽是那"一轮";顺带把这句话本身核了一遍——**它不成立**(第 4 节)。

`Skills.validate` 对 `infra` 面不做强制(只强制 `check`/`orchestrate`/`inject` 三面不挂假出口),所以这三条记错了账测试也不会红。四个周期里唯一挡着它的,是 W14 留下的那条用例断言 `s.pending.includes('infra')`——**记账滞后被断言钉住了**,清账必须同时改写那条断言的方向,这正是"不要顺手改一条"的实际含义。

## 2. 结果一句话

三条 `infra` 面的 `pending` 清空,`Skills.list()` 里带 `pending` 的条目从 **7 条降到 4 条**(只剩 SK-24/SK-29 的 `check` 面与 SK-05/SK-26 的 `orchestrate` 面);按「关联条目是否还有 `pending`」判定的缺口闭合状态从**仍开 7 条**变**仍开 5 条**(`G-01`、`G-03` 闭合;`G-02` 仍由 SK-26 的回流面持有,不因 SK-04 清账而闭)。

**行为面为零**:`gaps()` 键数仍 20、就绪检查面表仍六面十五条、`playbooks()` 仍三条、`Skills.block('gen')` 长度不变、`validate({})` 仍空——三条 `infra` 面从来不参与 `live()` 推导(第 4 节有逐字节比对的用例)。

回归:`unit 352/352`(基线 350,净 +2 用例)、`integration 93/93`、`cli.smoke 62/64`(两项失败在基线 `w34` 上逐项相同:`未登录 whoami → exit 3`、`llm --json mock 链路`,同一台机器上取的基线对照)。

改动:`js/skills.js` +17−9(三条条目的 `pending` 与 `note`)、`tests/unit.js` +65−7(改写 1 条、新增 2 条)、`README.md` +2−2(`infra` 面清账口径 + 用例数对账),外加本记账件与目录索引。

## 3. 三条各清了什么、仍欠什么

清账的判据一律是**实况**(用例现取,不读文档口径),仍欠的一律**点名写进 `note`**并由断言逐处钉住:

| 条目 | 清账的实况判据(用例现取) | `note` 里点名的仍欠 |
|---|---|---|
| SK-03 `core.personaCtx`(G-01) | `server.js` 有唯一装配口 `function wfPersonaNote(`,`/api/wf/*` 各 LLM 步经它注入(既有契约断言锁着调用点数),浏览器同装配口 | 审片侧**三步至今不带人设**:分镜评审 `sb.reviewSystem`、四维成片评审 `review.finalSystem`(两键都在本条 `prompts` 登记内)、整集共性汇总(内联 `system`,未登记为提示词键);**两端同缺** |
| SK-04 `core.memoryDual`(G-02) | `WfCore.memRecall`/`memBlock` 双端同用(memory 套件 6 条直接断言),写入面浏览器「记住…」与 CLI `memory add` 同结构同上限、MCP `hujing://memory` 只读资源同链路 | ① 同三步不带记忆召回;② 补种与旧板块名迁移仍只在浏览器 `memAll()` 发生(纯 headless 的记忆里没有沉淀条目、旧板块名不迁移);③ 服务端不自动沉淀本轮结论(按板块回流归 SK-26) |
| SK-23 `review.stage`(G-03) | `Domain.workflow` 含审片步、`STAGES` 里 `review` 的 `wfStep` 为 true,流程条/项目级推荐动作/计划步骤(映射 `episode.smartReview`)/板块智能体「审片」四处消费面到位 | ① 审片步在就绪检查面表里**还没有校验面**(归 SK-24,待 G-10);② 问题中心只报低分不报「未审片」 |

**"仍欠"与"面未落地"是两回事,本槽按前者记**。三条的机制面都只有 `infra` 一面,该面的出口是"人设/记忆经唯一装配口过服务端"与"审片是主线一等步骤",这三件事实测都在;剩下的是**覆盖余量**——沿用 SK-16 的先例([w31-sk16-playbook.md](./w31-sk16-playbook.md):`steps` 只覆盖后两步时记为"已落地但仍有余量",不挂 `pending`)。反过来说:**余量不写进 `note` 就等于假清**,故本槽给每条的余量都配了点名断言(`note` 里必须出现 `sb.reviewSystem` / `memAll` / `SK-24` 这类锚点,少一处即红)。

SK-23 的 note 里另记一句**不算欠账**的既定口径:审片不作分集级硬阻塞(一集没审也能合成),硬门禁仍归发布门 G3——这是 G-03 落地时就定下的边界([w3-g03-review-step.md](./w3-g03-review-step.md) 第四节),不是没做完。

### 3.1 那三步的"没有通道"是结构性的,不是漏传参

审片侧三步缺的不是调用点上少写一个字段,而是**双端共用的 user 模板里根本没有这两个 ctx 字段**:

```js
W.sbReviewUser = (shots, styleText, ov) => Prompts.fill('sb.reviewUser', { … }, ov);   // 无 personaNote / memText
W.buildSumUser = reports => { … };                                                      // 同上
W.buildCutUser = brief => `按四维标准评审以下整集分镜…`;                                  // 同上
```

模板是双端单一来源(服务端 `/api/wf/smart-storyboard`、`/api/wf/smart-review` 与浏览器 `js/sb-llm.js`、`js/review.js` 都只调这三个函数),所以"两端同缺"是一句可测的话而不是估计:**给模板加通道,两端会同时接上;不加,两端都注入不进去**。故本槽的余量断言就下在模板上——谁把通道接上,SK-03/SK-04 的 `note` 立刻失效并转红,不会静默扩面。

要不要给这三步带人设与记忆,**是产品口径题不是工程题**:分镜评审与四维评审是"打分的那一方",带上雇佣专家的方法论会让评分与生成同源(可能自评偏高),也会改这三步的提示词字面与既有 fixture。本槽不替产品定,只把现状记准。

## 4. 「改 `pending` 会动 `gaps` 投影」实测不成立

这句话在 W14 起的三条 `note`、`docs/skills-wave/README.md` 的摘要句与四份核验报告里被引用了四波。核对实现:

```js
gaps() {
  const m = {};
  REG.forEach(s => s.gaps.forEach(g => { (m[g] = m[g] || []).push(s.id); }));
  return m;
}
```

`gaps()` **只投影条目的 `gaps` 字段,不读 `pending`**(W32 第 6.1 节其实已经把这行实现摘出来过,但结论落在"要不要摘 `gaps` 标记"上,没有回头修正那句拦路话)。`pending` 唯一进入的推导是 `live(s, kind) = kinds 含该面 && pending 不含该面`,而 `live` 在模块里只被 `inject`(`block`)、`check`(`check`/`preflightStages`)、`orchestrate`(`playbook`/`playbooks`)三面消费——**`infra` 面一处也不进**。

本槽把这件事下成用例:把三条 `pending` **临时退回** `['infra']`,再逐字节比对五处投影(`gaps()`、面表、各面结论数、`playbooks()`、`Skills.block('gen')` 长度),要求完全相同,`finally` 里恢复;另有源级断言 `live(…)` 的机制面取值集合恰好是 `check,inject,orchestrate`(将来谁把 `infra` 面接进 `live`,这条先红,那时清账才真的会动投影)。

**四个周期被同一句未经复核的记账话拦住**——这是本槽真正想留下的教训:记账件里写的因果("改 A 会动 B"),和记账件里写的实况一样需要断言钉住,否则它会被逐波转抄成事实。

## 5. `gaps` 标记的口径:本槽取"关联索引",不摘

W32 第 6.1 节点出的口径分裂仍在(W22/W27 落地后**摘掉**标记,W26/W28 落地后**保留**)。本槽三条清的是 `pending`,同样面对"要不要顺手摘掉 `G-01`/`G-02`/`G-03`"这一问:

- **取保留(关联索引)**:`gaps()` 记的是"这条能力关联过哪个缺口",落地不摘。三条条目的 `gaps` 一字未动,`gaps()` 键数仍 20。
- **未闭清单按 `pending` 过滤现算**:`Object.keys(gaps()).filter(k => gaps()[k].some(id => byId(id).pending.length))` —— 本槽后为 5 条(`G-02`、`G-10`、`G-11`、`G-12`、`S-07`)。

理由只有一条:摘标记会**丢掉关联信息**(`G-06`/`S-02` 已经因此在投影里连键都不出现),而"未闭清单"随时能按 `pending` 现算。这也是本槽多数先例(W26/W28)的做法。

**但口径统一本身不在本槽范围**:要把 W22/W27 摘掉的 `G-06`/`S-02` 补回、并按 W23 的做法给"落地不摘标记"加一条契约断言,会动到那两波的条目块与若干断言,应另开一槽(第 10 节交接)。本槽只保证自己这三条不制造新的分裂,并把"关联索引口径"写进三条 `note` 与 README 的架构框。

## 6. 变异实测

| 变异 | 实测行为 | 转红 |
|---|---|---|
| 三条 `pending` 退回 `['infra']` | 记账与实况重新脱节 | 1 条(记账对齐那条,三条同用例) |
| SK-04 的 `note` 去掉「仍欠」与 `SK-26` 点名 | 清了 `pending` 却不写欠账 = 假清 | 1 条(点名断言) |
| 摘掉 SK-03 的 `G-01` 缺口标记 | 关联索引丢失 | 2 条(标记那条 + 退回态下 `validate` 报"有未落地机制面须写明缺口编号") |
| 给 `sbReviewUser` 接上 `personaNote` 通道(不改 `note`) | 余量已补但记账没跟上 | 1 条(余量实况那条) |
| 撤掉逐镜审片步的记忆召回(已覆盖的步退回) | 已覆盖面静默退回 | 1 条(反向钉住那条) |
| 顺手把 SK-24 的 `check` 面也清掉(未落地面假清) | 校验型无实现却记成已落地 | 3 条(contract 的 `validate` + 剩余 `pending` 集合 + 退回态 `validate`) |

最后一行是本槽的边界闸:**清账只清自己那三条**,借这一轮顺手清别人的账会立刻红——`Skills.validate` 的"未落地不得挂假出口"三条禁令仍是最后一道防线。

## 7. 用例改动(改写 1 条 + 新增 2 条,未删测)

| 用例 | 钉住的事 |
|---|---|
| **改写** 记账对齐(原「记账诚实位」) | 三处出口实况仍在(实况变动先红)+ `pending` 已清 + 缺口标记仍在 + `note` 写明"已落地"与"仍欠"且逐处点名 + `infra` 面全表无 `pending` + 剩余 `pending` 集合逐字节等于四条 + 发布门口径三条断言原样保留 |
| **新增** `infra` 余量实况 | 三步的 user 模板现无人设/记忆通道(接上即红)+ 两个欠覆盖的系统人设键确实登记在 SK-03 名下 + 共性汇总步两端仍是内联 `system` 且未登记提示词键 + 已覆盖的逐镜审片步反向钉住(人设与记忆都不得退回) |
| **新增** 清 `pending` 的行为面为零 | 源级:`live()` 只判 `check`/`inject`/`orchestrate` 三面;行为级:三条 `pending` 退回后五处投影逐字节相同、`validate` 仍全通过、恢复后不留残留状态;`gaps()` 键数仍 20 且三个编号的关联索引仍在 |

原用例里的三条发布门断言(SK-29 仍 `pending`、G2 只数高/中危、`js/release.js` 不读审片报告的校验命中字段)**一字未改**——本槽不碰发布门。

## 8. 缺口闭合状态的变化

按「该缺口关联的条目是否还有 `pending`」判定,`gaps()` 键数 20 不变:

| 状态 | 本槽前(`w34`) | 本槽后 |
|---|---|---|
| 仍开 | 7:`G-01`(SK-03)、`G-02`(SK-04、SK-26)、`G-03`(SK-23)、`G-10`(SK-24、SK-29)、`G-11`(SK-26)、`G-12`(SK-05)、`S-07`(SK-29) | **5**:`G-02`(SK-26)、`G-10`(SK-24、SK-29)、`G-11`(SK-26)、`G-12`(SK-05)、`S-07`(SK-29) |
| 已闭(关联条目已无 `pending`) | 13 | **15**(新增 `G-01`、`G-03`) |

`G-02` 不随 SK-04 清账而闭:它另挂在 SK-26 `review.memoryFeedback` 的 `orchestrate` 面上(审片结论按板块回流专家仍无命令出口)。**这正是"不假清"的具体样子**——同一个缺口编号下,一条清账不代表另一条也清。

## 9. 复核方式

```
git checkout cursor/w36-infra-pending-align-cf33
node --check js/skills.js tests/unit.js     # 通过
node tests/unit.js          # 352/352 PASS
node tests/unit.js skills   # 80/80,含本槽三条
node tests/unit.js contract # 全通过(README 用例数与注册表口径现取实况)
node tests/integration.js   # 93/93 PASS
node tests/cli.smoke.js     # 62/64(两项在基线 w34 上同样失败)
node -e "const S=require('./js/skills.js');console.log(S.list().filter(s=>s.pending.length).map(s=>s.sk+':'+s.pending.join('+')).join(','))"
# SK-05:orchestrate,SK-24:check,SK-26:orchestrate,SK-29:check
node -e "const S=require('./js/skills.js');const g=S.gaps();console.log(Object.keys(g).length,Object.keys(g).filter(k=>g[k].some(i=>S.byId(i).pending.length)).sort().join(','))"
# 20 G-02,G-10,G-11,G-12,S-07
```

`node tests/e2e.js` 按仓库纪律未跑(需用户明确要求)。本槽不含合并、未开 PR。

## 10. 交接

1. **`gaps` 标记口径统一仍未做**(W32 第 6.1 节提的第 6 条)。本槽已把自己这三条按"关联索引"记清,但 W22/W27 摘掉的 `G-06`/`S-02` 仍不在投影里。要收口:补回那两个标记 + 按 W23 的做法加一条契约断言(落地不摘标记),或反向统一成"摘掉"(则 `gaps()` 会由 20 键降到 5 键,与 `pending` 一一对应)。二选一,**加断言是必须项**——本槽第 4 节那句被转抄四波的因果就是没断言的下场。
2. **审片侧三步的人设/记忆通道**:要接就先定产品口径(评分方与生成方同源的偏高风险),接的时候三步的提示词字面会变,`sbReviewUser`/`buildSumUser`/`buildCutUser` 的 fixture 与 SK-03/SK-04 的 `note` 要同步改,本槽的余量断言会先红提醒。
3. **剩下 4 条 `pending`**:`check` 两条(SK-24 待 G-10 语义面判据,W35 在做;SK-29 要动发布门口径)、`orchestrate` 两条(SK-05 计划步骤改投影生成须做等价对照;SK-26 回流步无命令出口,已连续三个周期未触及)。
4. **记忆的补种/迁移下沉**:`js/agent.js memAll()` 那段(旧板块名迁移 + 标准沉淀 + 知识库种子)做成 `wf-core` 纯函数后 headless 才吃得到,属 SK-04 的第二处余量,会改到 KB 种子表,单列一槽为宜。
