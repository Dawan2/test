# W208 集成记账:W203 助手自动发令不得跑人手命令 + W204 CLI produce 写回收敛轮次

新基线 `cursor/w205-integration-1816`,tip `a2e08b6`。按序两次 `--no-ff` 合入两条**已完成**支,
两支都从 **W199**(`825705a`)叉出、互不相识,合完 live 现取全部数字。
在飞的 W206(审片 attempt 落库)与 W207(成片空跑 note)按任务口径**一条没碰**。

本槽的正题是把「人手动作」这道闸的**最后一条自动路**封上。基线上这道闸已经有两处消费——
`Skills.validate` 递归扫 playbook `steps`(W198)、`Plans.execStep` 落 blocked 不代跑(W201)——
可 headless 的 `/api/wf/agent` 那条还开着:模型回一条 `{"op":"run","cmd":"expert.evolve"}`,
`CLI agent --apply` 与 `MCP hujing_agent apply` 逐条直跑,中间没有确认闸,persona 当场被改写。
本槽并进来之后,同一位 `manual` 撑起**四处**消费。

## 一、两次合并

| 次序 | 被合入支 | 实际 head | merge commit | parents |
|---|---|---|---|---|
| 1 | `cursor/w203-agentops-evolve-manual-a458` | `ecd81aa` | `43ea4d7` | `a2e08b6` + `ecd81aa` |
| 2 | `cursor/w204-cli-sbconfig-write-e517` | `3dae05a` | `4df185c` | `43ea4d7` + `3dae05a` |

两次都是真 `--no-ff`(两个 parent 齐全,不是快进);全程没用过 `--ours`,没用过 `checkout <old> -- .`。
两次合并的 base 都是 `825705a`(两支同叉 W199),故它们自称的 **609 / 604 都是 w199 上的数,一个不采用**;
W203 自称的 integration **147** 同样不抄——巧的是合完 live 现取也正好是 147(143 + 4),但这是量出来的不是抄来的,
反过来「默认留 143」同样是错的。

## 二、四棵树机检:哪些是并集,哪些是 git 直接取对侧

冲突块数不等于成色。逐文件比对 基线 `B`(= 叉点 `825705a`)/ 我方 `P1` / 对侧 `P2` / 合完 `M` 四个 blob:

**第一次合并(`a2e08b6` + `ecd81aa`)**

| 文件 | 成色 |
|---|---|
| `js/cmd-registry.js` / `js/commands.js` / `tests/unit.js` / `README.md` / `docs/skills-wave/README.md` | 真三方(两侧都改过) |
| `js/agent-ops.js` / `js/wf-core.js` / `server.js` / `mcp.js` / `tests/integration.js` | `P1 == B` 且 `M == P2`——**不是并集**,git 整份取的对侧 |

后一组五个文件是本尖自 W199 以来一个字没动过,所以 `WfCore.cmdManual` 在不在、
`selfFixRound` 的白名单排没排掉人手动作、罐头出不出 ops——**都得逐条现取,不能靠"零冲突块"推断**(第六节现验)。
`js/cmd-registry.js` 是真三方:两侧各改 `expert.evolve` 那条 META,并集做法见第三节。
`js/commands.js` 是真三方但零冲突块——两侧改的是相隔很远的两处(对侧改 `list()` 那一行加 `manual` 位,
我方 W194 改的是第 170 行 `smartReview`),合完两处都在。

**第二次合并(`43ea4d7` + `3dae05a`)**

| 文件 | 成色 |
|---|---|
| `cli.js` / `tests/unit.js` / `README.md` / `docs/skills-wave/README.md` | 真三方(两侧都改过) |

`cli.js` 这一格是任务点名要两面都留的那格,单列在第四节。

## 三、`js/cmd-registry.js` 的并集怎么做的

两侧改的是 `expert.evolve` 那条 META 的**注释块**,而 `manual: true` 那一位两侧逐字相同故 git 自动合上——
**字段没冲突不等于注释可以整份取任一侧**。两侧注释各只讲自己那半:

- 我方(基线,含 W198 + W201):`Skills.validate` 逐条目递归扫 `steps` / `Plans.execStep` 落 blocked 不代跑;
- 对侧(W203):`agentNormalize` 不把它放进 ops / 浏览器自修复轮的重试白名单排除它,判据 `WfCore.cmdManual` 双端同读。

按并集重写成「这一位是什么 + **四处消费并列** + 后两路的判据统一读 `WfCore.cmdManual` + 四端人手入口一条不减」。
措辞上取了我方那句更宽的「也不进**任何** playbook 步序」(对侧写的是「不进 SK-26 的 playbook 步序」,
那是 W198 之前的旧口径,W198 已把它从一条判据扩成逐条目递归扫)。

合完全文件 `manual: true` **只此一份**(机检 `grep -c` = 1),零 `manualOnly`——
全仓 `manualOnly` 只在 `tests/unit.js` 出现一次,那正是 W203 立的「不许有第二个字段名」的判词本身。

## 四、`cli.js` 两面都留

任务点名这一格:W204 的写回**和** W203 那侧若动过 agent 回传,两面都要在。现取结果:

- **W204 的写回在**:`EXEC['episode.produce']` 在 `Domain.reviseRetryLimit` 之后经 `withProject` 落库钳过的
  `maxRetry`,值没变时不空发一次 PUT;单独调 `episode.smartReview` 那一端**一个字不写库**(它没有重抽循环,
  替它假写一个没跑过的次数就是在库里撒谎)。
- **W203 产品面没碰 `cli.js`**,故这一格没有第二份代码要并。但 agent 子命令是 `return d` 原样透传服务端响应,
  服务端新增的 `manual` 键**自动就到调用方手上**,不需要改代码——只把段头注释里那份返回形状
  (`{reply,thinking,ops,receipts}`)补齐到实况并写明人手命令走 `manual` 不走 ops,注释与行为对齐。

`cli.js` 相对基线的全部 diff 就这两处(+17 −2),没有第三处。

## 五、live 数字(全部合完现取,两支自称一律不抄)

| 项 | 基线 `a2e08b6` | 合完 tip | 说明 |
|---|---|---|---|
| `unit` | 613 | **622** | +7(W203,全落 `agent-ops`)+2(W204,落 `commands`) |
| `agent-ops` 套件 | 47 | **54** | W203 |
| `commands` 套件 | 39 | **41** | W204 |
| `contract` 套件 | 135 | **135** | 未动 |
| `integration` | 143 | **147** | W203 加 4 条;**到了 147**,不是抄来的 |
| `cli.smoke` | 107/109 | **107/109** | 未动,实跑复核;分母按 live 点数(`report(` 行数 109) |
| `GUARD_TOPICS` / `TOPIC_FLOOR` / 花名册 | 19 / 19 / 19 | **19 / 19 / 19** | 两支都没碰,一条不登记;销号台账仍 0 条 |
| `gaps()` 键 | 20 | **20** | 一个不拆,`G-11` 原样开着没有装清 |
| 记账件 | 218 | **221** | 含本文(w203 / w204 / w208 三份) |

其余 22 个套件逐个未动(`experts` 29 / `produce` 16 / `release` 48 / `skills` 95 / `plans` 16 / `memory` 33 …)。
三格 `FLOOR` 按 live 抬(unit 622、integration 147、记账件 221),`CLI 冒烟` 与 `TOPIC_FLOOR` 两格未动。

`cli.smoke` 那两条失败(`未登录 whoami → exit 3`、`llm --json mock 链路`)在基线独立 worktree 上**现跑同名同表现**,
不是本槽引入的。

## 六、名集比对(`|` 切、**多重集**、不 unique-sort)

四棵树各跑一遍 `unit`,报告行按 `|` 切取用例名,按**多重集**比(同名多条要各算各的):

| 项 | 数 |
|---|---|
| 基线独有(应为 0) | **0** — 零吃测 |
| W203 相对叉点新增 | 7,**缺席 tip 0 条** |
| W204 相对叉点新增 | 2,**缺席 tip 0 条** |
| tip 多出(应为 0) | **0** |

`613 + 7 + 2 = 622`,与 tip 实计逐格自洽。

## 七、变异抽查

每手只改一处产品码,跑到红为止再还原(还原后 622/622 全绿):

| 变异 | 红 | 分落 |
|---|---|---|
| M1 摘掉注册表 `manual: true` 那一位 | **9** | `agent-ops` 6 + `contract` 1(`Skills.validate`)+ `plans` 2(`Plans.execStep`) |
| M2 把 `manual` 改名成 `manualOnly` | **9** | 同上,外加字段名唯一那条 |
| M3 `agentNormalize` 放行 `manual` | unit **1** + integration **3** | integration 那 3 条含端到端「persona 一个字没被改写」 |
| M4 `selfFixRound` 白名单不排除人手动作 | **1** | 浏览器自修复轮那条 |
| M5 CLI produce 去掉写回 | **2** | headless 单端那条 + 两端逐格相同那条 |
| M6 `WfCore.cmdManual` 恒回 `false` | **3** | 判据本身塌掉时两个消费点一起红 |
| M7 agent 罐头退回恒回 `ops: []` | integration **2** | 证明「把罐头改成打得到 ops 通道」这一手是承重的,不是装饰 |

**M1 红 9 条是本槽最值钱的一格读数**:四处消费同读一份注册表字段,摘那一位四头一起塌——
这正是「不在别处再列一份人手命令名单」这条纪律的可观测证据。

### 反事实:证明本槽真闭了环,不是判据本来就在

同一份入参喂给基线与 tip 的 `WfCore.agentNormalize`(端点用的就是这个函数):

| | 基线 `a2e08b6` | 合完 tip |
|---|---|---|
| `ops` | `["episode.preflight","expert.evolve"]` | `["episode.preflight"]` |
| `manual` | (无此键) | `["expert.evolve"]` |

基线把蒸馏命令原样放进 ops,而那份 ops 就是给调用方逐条直跑的。

另起真服务(`MOCK_LLM=1`,`MV_DATA_DIR` 等三个 env 重定向到临时目录)走完整链路复核 tip:
端点出的 ops 只有 `episode.preflight`、`manual` 点名 `expert.evolve`,把 ops 原样逐条跑完
**persona 一个字没变**;同一份夹具上直打 `/api/wf/evolve-expert`(人手那条)**照旧 code 0 且 persona 真被改写**——
拦的是自动路,没有拦过头。

## 八、口径复核(合完现取,不靠推断)

- `manual: true` 全仓**一份**(只在 `expert.evolve` 上),零 `manualOnly`/`humanOnly`/第二份名单;
- 浏览器 `U.confirm` 主路**零 diff**(`js/agent-ops.js` 里仍是 2 处),人手 evolve 入口四端一条不减;
- `Plans.execStep` 的 `manualCmd` 漏斗仍在,`Skills.validate` 扫 `steps` 那半仍在,`evolve` 仍在 `cmds` 面上;
- `js/sb-views.js` 读 `Domain.subjectRefImage` 仍在;`emptyBatchNote` 与 `emptySubjectImageNote` 两份派生并存;
- `digest` 读 `note`、`listModels` 无失败回落、`staleShotSplit` / `staleSplitNote`(含 `pipeline` 印重跑数)、
  `issues` 分报、`epFixOf`、`js/release.js` 零 `release.dirty` 转发点(只剩讲历史那一句注释)、
  `guardSpread`、`smartReview` 漏斗、`jsonEntryCallSites`、`memWrite` 驱逐、`FORGE_SYS` getter、
  单一 `review.userSystem`、`Issues` UMD、`project.release`、`reviseRetryLimit`、`reviewGate`、
  `projectScript` + `extractSourceText`——逐项现取仍在;
- 花名册 19 条、`docs/skills-wave/w178-topic-floor-unlist.md` 相对基线**零 diff**(两支都没登记新主题,故一条不动);
- 索引表两处追加取并集后按波次号**升序归位**(200 / 201 / 202 / 203 / 204 / 205 / 208),不是追加到表尾;
- 本文零同目录相对链接(与既有记账件同口径,逐份点名靠索引表那一行而不借道散文链接)。

## 九、残留

1. **`js/plans.js` 的 `generate` 仍拆得出 `expert.evolve`**(它按 `Commands.list()` 取名单,evolve 仍在册)。
   今天不会出事——执行口 `Plans.execStep` 拦着,且 `generate` 只取 `label`/`cmd`/`ep` 不取 `args`——
   但那是「生成侧参数面往前走一格就消失」的偶然保护,与 W201 记的是同一处,本槽未动。
2. **浏览器 Agent 面板那条路本槽没有新判据**:主路 `exec` 级 run op 恒经 `U.confirm`(W203 现验过不成立,故一行没动),
   本槽只在自修复轮那一支加了拦截。若日后给面板开出"免确认自动执行"档,得同轮把 `cmdManual` 接进去。
3. `cli.smoke` 两条失败沿旧(`未登录 whoami → exit 3`、`llm --json mock 链路`),与基线同名同表现,本槽未查。
4. 在飞的 W206 / W207 一条没碰,下一槽合它们时 `js/commands.js` 与 `cli.js` 很可能又是真三方,
   注意本槽刚在 `cli.js` 段头注释上留了一处改动。
