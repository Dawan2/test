# W28 · SK-22 生成凭据与确认失效校验落地(生成面从零到一)

基线 `cursor/w25-integration-d613`(head `4e57148`,含 W22/W23/W24 三支收敛)。
本槽只落 SK-22 的校验面,不含合并、不动发布门、不动确认闸、不动计费。

## 1. 起点:SK-22 在基线上仍是 pending

动工前先按纪律核对短名单实况,而不是照着计划表开工:

```js
{
  id: 'gen.renderCredential', sk: 'SK-22', name: '生成凭据与确认失效校验', stage: 'gen', wave: 'W4',
  kinds: ['check'], pending: ['check'], kb: ['抽卡军规'],
  cmds: ['episode.preflight', 'shot.generateVideo', 'episode.generateVideos'], gaps: ['S-05'],
  note: '只读既有判旧指纹与未确认计数出 warn,不改计费动作、不新增计费标签、不改确认闸行为',
}
```

`pending: ['check']` 且 `checks` 为空,`Skills.preflightStages()` 实测回
`["script","subjects","eps","shots","film"]` 五面——`gen` 面不在表里。即这一条确实还没有出口,不是已落地被重复登记。
落地后同一条去掉 `pending`、登记 `checks: ['gen.renderCredential']`,`gaps: ['S-05']` 保留
(记账不因落地一面就清账,与 SK-12/SK-13 保留 `S-03`、SK-28 保留 `S-06` 同口径)。

## 2. 判据:报既有机制自身的失效点,不复述 Domain 已有的计数

这一面最容易做成噪音:`Domain.episodeState` 已经在数 `stale` / `unconfirmed` 并落成阻塞项,
再原样报一遍只是把同一件事说两遍。所以五个码一律挑**既有机制在这一镜上失效**的位置,
每一条都能指出"谁本该管它、为什么没管到"。

| 码 | 判据 | 失效在哪里(为什么 Domain 的计数覆盖不到) |
|---|---|---|
| `credential-missing` | `s.video.status === 'done'` 但没有 `inputHash` | `Domain.shotVideoStale` 的指纹分支写的是 `!!(s.video.inputHash && s.video.inputHash !== …)`——没有指纹就**恒判不出过期**。这一镜此后改提示词、换参考图都不会进 `counts.stale`,旧片会一直冒充新成果 |
| `sim-credential` | 在线态下产物带 `simulated` | `Domain.shotVideoReady` 把它算作未就绪并计进 `counts.noVideo`,于是它混在"根本没生成"里——计数上看不出这一镜其实有个占位片 |
| `final-stale` | `s.final` 且判旧 | 批量生成两端都按 `!s.final` 排除定稿镜(`cli.js` 的 `pend` 过滤、`--confirm-all` 的写回同此),`regen-stale` 推荐动作对它无效——过期在这一镜上**没有出口** |
| `confirm-stale` | `s.confirm` 且判旧 | 确认闸只在改提示词/剧情/台词/旁白时回落(`sb-views.js`/`agent-ops.js`/`cli.js` 三处同口径),而换主体图、改画幅、改风格后缀、换模型同样进指纹却不回落——确认背书的已不是当前输入 |
| `unconfirmed-pending` | 未确认、未定稿且还没有真实产物 | `Domain` 只在 `counts.done === counts.total` 时才报 `unconfirmed` 阻塞项;部分完成时这一镜是**静默**被批量生成跳进 `skipped` 的,用户点了生成却什么都没发生 |

两条补充口径:

- **定稿与确认同时判旧只报 `final-stale`**。定稿是更强的断点(它连生成队列都进不去),两条一起报只是同一件事说两遍。
- **输入没变的定稿镜/已确认镜一律不报**。本面判的是判旧与凭据,不是"定稿"或"已确认"本身。

## 3. 单源:判旧一句都不在校验层重写

判定输入是 `s.video` 那份产物记录与确认闸字段,但**判旧与就绪的口径全部现取 `Domain`**:

```js
if (Domain.shotVideoStale(p, s, online)) { … }
if (!s.confirm && !s.final && !Domain.shotVideoReady(s, online)) push('unconfirmed-pending');
```

与流程条、分集状态、批量生成走的是同一份判定,校验层不写第二份指纹比对——
这与 SK-18 的级差取 `WfCore.sizeGap`、SK-28 的切段取 `Domain.subtitleSegs` 是同一条纪律。
源级断言把它钉住:`js/skills.js` 里必须出现 `Domain.shotVideoStale(p, s, online)` 与
`Domain.shotVideoReady(s, online)`,且不得出现 `inputHash !== ` 或 `shotInputHash(` 这类自建比对。

`online` 走 `ctx.online`(与 `Domain` 判就绪同参),离线态下占位模拟是既定回退不当缺陷报——
`sim-credential` 只在 `online` 为真时命中。

## 4. 面表由登记推导:新增一面,两端 preflight 实现零改动

`Skills.preflightStages()` 的推导规则是"校验面已落地(`kinds` 含 `check` 且不在 `pending`)
且把 `episode.preflight` 登记进 `cmds`"的条目所属主线步,按 `STAGES` 步序去重。
所以本槽**没有碰任何消费实现**:

```
$ git diff 4e57148..HEAD --numstat -- js/ cli.js
53      2       js/skills.js

$ git diff 4e57148..HEAD -- js/commands.js cli.js | wc -l
0
```

整个 `js/` 与 `cli.js` 只动了 `js/skills.js` 一个文件,其中删改仅 2 行
(条目上去掉 `pending`、登记 `checks`),另 53 行是新增的校验宿主注释与实现;
`js/commands.js` 与 `cli.js` 一个字符没动。余下的改动全在 `tests/unit.js` 与三份文档上。

面表与两端回执自动跟上:

```
落地前 script → subjects → eps → shots → film        五面十二条
落地后 script → subjects → eps → shots → gen → film  六面十三条
```

`gen` 面按 `STAGES` 步序自动插在 `shots` 与 `film` 之间(不是追加到末尾,也不是登记序)。
这正是 [w17-preflight-stages.md](./w17-preflight-stages.md) 第 6 节把"落地 SK-22 生成面校验"
写成变异样例时预言的形态:**改一处实现(注册表登记),抬一处口径(测试里"现为 N 面"那几个数)**。
本槽实测与那份预言一致——转红的三条全是口径快照断言,没有一条是行为断言。

## 5. 只报不拦的取证

- **不进阻塞项**:浏览器端沙箱真跑 `Commands.execute('episode.preflight')`,断言
  `result.blockers` 里没有任何带「凭据/指纹」字样的项,且 `r.ok/r.status` 不受本面影响。
- **不改确认闸**:纯函数断言对整份镜头数组做 `JSON.stringify` 前后比对——校验项不得回写
  `s.confirm`/`s.final`(这一条是本面最需要防的:它读的正是确认闸字段)。
- **不拦生成动作**:源级断言 `js/commands.js` / `cli.js` 都不得出现 `gen.renderCredential`
  或 `Skills.check('gen'`。要不要拿这些结论拦生成的产品口径未定,故只登记消费点不加拦截,
  口径同 SK-11/SK-13 当初的处置。
- **不进发布门**:本槽也没有接问题中心(`js/issues.js` 同在上面那条源级断言里)。
  发布门 G2 只数问题中心的高/中危,不进问题中心即不可能改门禁状态——
  这是"不拦发布门"最直接的证明,不必再去改 `release.js` 的计数口径。
- **零计费**:`episode.preflight` 仍是 `risk: 'read'`,判定纯本地词法与字段读取,零 LLM。

## 6. 变异验证

每条变异单独施加,`node tests/unit.js` 全量跑,记的是**指名转红的用例名**而不只是数字。

未施加变异时 `node tests/unit.js` 实测 **334/334 全绿**,下表的红都是变异引入的。

| 变异 | 转红 | 说明 |
|---|---|---|
| 条目退回 `pending: ['check']` 并摘掉 `checks` | **11 条**:六条 `renderCredential` 行为用例 + 面表两条 + 就绪检查并集一条 + 「不挂假出口」一条 + README 数字对账一条 | 退回未落地时行为面与记账面同时红,不会静默变回五面 |
| 只摘掉 `cmds` 里的 `episode.preflight` | **5 条**:面表两条 + 就绪检查并集一条 + 消费点一条 + README 数字对账一条 | 实现还在但没登记消费点=面表少一面,登记侧与表的双向对齐断言接住 |
| 校验项里回写 `s.confirm = true` | **2 条**:纯函数用例 + 面表逐字节等价用例 | 确认闸被动到即红;第二条是意外收获——回写污染了夹具,同输入两次取表不再同结果 |
| 判旧改成校验层自算 `v.inputHash !== Domain.shotInputHash(p, s)` | **3 条**:`credential-missing` 用例、`unconfirmed-pending`/`sim-credential` 用例、消费点用例的单源断言 | 除源级断言外,自算版对"无指纹"和"没出过片"两种镜的行为也与 `Domain` 不一致,被行为用例一并接住 |
| 定稿+确认同时判旧时两条都报(`else if` 改 `if`) | **1 条**:`confirm-stale`/`final-stale` 用例 | 重复报同一件事即红 |

「不挂假出口」那条(`contract` 套件)值得单说:它断言 `pending` 含 `check` 的条目
`checks` 必须为空、且该步 `check()` 结论数等于已落地校验项数。所以**落地一面而忘了去 `pending`**
与**去了 `pending` 而没登记实现**这两种半吊子状态都过不去。

## 7. 口径抬档记录(与 W23 的文档数字对账契约配套)

W23 把 README 那几个数钉在了代码实况上,本槽因此必须同步抬档,否则 `contract` 套件先红:

| 位置 | 抬档 |
|---|---|
| README 架构框「CHECKS 已落地 N 条」 | 十二 → 十三,并补生成面那段判据 |
| README 就绪检查回执「现有 N 条」与面清单 | 十二 → 十三,面清单补 `gen` |
| README / 本目录 README 的「N 面 N 条」 | 五面十二条 → 六面十三条 |
| README 单元测试断言数 | 328 → 334(本槽新增 6 条用例) |
| 本目录 README 摘要「校验宿主 N 面齐了」 | 五面 → 六面,补生成面(S-05)一项 |

## 8. 剩余与未纳入

- **`S-05` 不清账**。本槽落的是校验半;缺口条目本身还含"生成侧凭据在断点续跑/任务恢复时怎么回填"
  这类内容,故 `gaps: ['S-05']` 保留,与 SK-12/13 保留 `S-03` 同口径。
- **未接问题中心**。接进去要决定归哪一档危险级、跟 `Domain` 已有的"待确认/素材过期"两条低危怎么去重,
  是独立一轮的事;本槽按"只报不拦、先接一个消费点"的最小边界收口。
- **未接审片路径**。审片是镜级入口,而本面的 `credential-missing`/`unconfirmed-pending`
  在镜级是判得动的、`final-stale` 也是——但审片报告的 `checks` 字段现在只收剧本面与主体面,
  往里加面要动展示区块与导出格式,同样单列一轮。
- **不拦生成的产品口径仍未定**。`cmds` 里 `shot.generateVideo` / `episode.generateVideos`
  两个登记保留(它们记的是"这一面与哪些命令面相关"),但两端生成动作里一行拦截也没加。
- `node tests/e2e.js` 按仓库纪律未跑(需用户明确要求)。本槽不含合并。

## 9. 与并行槽的预期重叠

- **W25 后续合并**:本槽从 `w25` head 起支,`js/skills.js` 的改动集中在 `CHECKS` 区块尾部与
  SK-22 那一条条目上,与主体面/剧本面的改动不相邻,预计 add/add 取并集即可。
- **W26(SK-19 稳定词校验面)**:它落的是 `shots` 面,`shots` 面本就在表内,合并后面表仍是六面,
  只需把「N 面 N 条」的**条数**再抬一档(面数不变)。本槽与它在 `tests/unit.js` 的
  `skillsTests` 数组尾可能撞车,同为 add/add。
- **W27(KB 注入)**:落点在注入面与 KB 条目,与本槽的校验面无交集;若它改了 `KB.SECTIONS` 条数,
  README 那几个数由对账断言各自钉住,互不覆盖。
