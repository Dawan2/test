# W194 · `episode.smartReview` 单独调用吃得到 `args.maxRetry`(只补候选,循环形状不动)

**范围**:`js/produce.js`(`autoSmartReview` 的形参与那一行候选)+ `js/commands.js`(`episode.smartReview` 把入参传下去)
+ `tests/unit.js`(+3 条:`produce` 2、`commands` 1)+ `README.md` 与本目录 `README.md` 的数字与描述同步。
**基线**:`cursor/w189-integration-5b9b`(`a895ab8`)。本尖**不含** W191 对 CLI `episode.produce` 候选链那一行的修补。
**不做**:不改 `GUARD_TOPICS` / 花名册 / `TOPIC_FLOOR`、不改 `Skills.gaps()` 键、不动 `produce` 的整集轮次循环形状、
不把 CLI `produce` 改成按镜、**不碰 `cli.js` 第 1205 行那处候选链**(留给 W191 合入)、不给 CLI `smartReview` 新起重抽循环。

## 1. 停工位:一半成立,故只收成立的那一半

交接单给的停工条件是「若 `smartReview` 单独调用根本没有重抽循环(只评一次),停工位不成立」。
在基线 `a895ab8` 上用一次性探针跑了一遍——浏览器那一端按 `loadProduce` 装齐真 `produce.js` + 真 `commands.js`,
headless 那一端按 `loadCli` 跑真 `cli.js` 并只把 `api()` 换成记录桩。基线读数逐字如下:

```
【浏览器 Commands.execute('episode.smartReview', …),恒不达标一镜】
sbConfig.maxRetry=1,不带入参        → { retry:1, manual:1, cfgAfter:1 }
sbConfig.maxRetry=1,args.maxRetry=4 → { retry:1, manual:1, cfgAfter:1 }   ← 点名 4 轮,真跑 1 轮
sbConfig.maxRetry=1,args.maxRetry=9 → { retry:1, manual:1, cfgAfter:1 }
sbConfig 缺位(兜底 2),args="3"     → { retry:2, manual:1 }
sbConfig.maxRetry=3,args.maxRetry=0 → { retry:3, manual:1, cfgAfter:3 }

【浏览器 Commands.execute('episode.produce', { maxRetry:4 }),同一份夹具】
                                     → { smartReview 步 retry:4, cfgAfter:4 }  ← 吃到了,但 cfgAfter 也被改成 4

【CLI EXEC['episode.smartReview'].run({ pid, epid, maxRetry:5 })】
POST 次数 = 1
POST 载荷键 = epid | operationId | pid | shotIds        ← 没有 maxRetry,也没有第二次往返

【命令注册表(双端共享元数据)】
episode.smartReview args = pid, epid, shotIds, quiet, ui
episode.produce     args = pid, epid, confirmAll, smartReview, maxRetry, riskyCompose, ui
WfCore.sanitizeCmdArgs(smartReview, { maxRetry:5 }) = {}   ← Agent 侧整形直接抹掉
```

三点结论,回答交接单那三问:

1. **喂给 `Domain.reviseRetryLimit` 的候选只有一档**。`js/produce.js` 的
   `const maxRetry = Domain.reviseRetryLimit(ep.sbConfig.maxRetry)` 只读分集配置,`args.maxRetry` 在命令层
   连传都没传下去(`SB.autoSmartReview(p, ep, sink, shots, quiet)` 只有五个实参)。
   浏览器这一端**确实有重抽循环**(第一组读数里 `retry` 跟着 `sbConfig` 走),但它不吃入参 —— **停工位在这一端成立**。
2. **CLI 那一端单独调用没有重抽循环**。`exec episode.smartReview` 整条命令就是一次 `/api/wf/smart-review` 往返,
   服务端也只逐镜评一遍;重抽循环长在 CLI `episode.produce` 的编排里(`for (let attempt = 1; attempt <= maxRetry …`)。
   轮次入参在这一端根本没有落点,**这一端停工位不成立**——只补候选补不出一个不存在的循环,而新起循环超出本槽范围。
3. **浏览器是同一处漏斗,CLI 是两套入口**。浏览器 `episode.produce` 走的正是
   `execute('episode.smartReview', args)`,与单独调用同一个 handler;它之所以"看着吃到了",
   靠的是先执行 `ep.sbConfig.maxRetry = Domain.reviseRetryLimit(args.maxRetry, ep.sbConfig.maxRetry)`
   ——**入参靠改写持久化配置传参**,而单独调用这一路没人替它写。CLI 则是编排层自带循环、`EXEC` 是薄端点调用,两套。

按交接单的口径:有重抽而不吃 `args`,只修**喂给 `reviseRetryLimit` 的候选**;循环形状一行没动。
`cli.js` 全文未改,W191 那一行原样留着。

## 2. 改了什么(两处,共 4 行)

`js/produce.js` —— 形参多一档候选,那一行按优先级两档现取 Domain:

```js
async function autoSmartReview(p, ep, main, shots, quiet, maxRetryArg) {
  const maxRetry = Domain.reviseRetryLimit(maxRetryArg, ep.sbConfig.maxRetry);
```

`js/commands.js` —— `episode.smartReview` 把入参传下去:

```js
const r = await SB.autoSmartReview(p, ep, sinkOf(args), shots, args.ui ? false : args.quiet !== false, args.maxRetry);
```

改完的读数(同一份探针现跑):

| 入口 | 入参 | 分集配置 | 实际重抽轮次 | 配置事后 |
|---|---|---|---|---|
| `episode.smartReview` | — | 1 | 1 | 1 |
| `episode.smartReview` | 4 | 1 | **4** | **1**(不落库) |
| `episode.smartReview` | 9 | 1 | **5**(钳到登记上限) | 1 |
| `episode.smartReview` | `"3"` | 缺位(兜底 2) | **3** | — |
| `episode.smartReview` | 0 | 3 | **3**(落到下一候选,不是缺省 2) | 3 |
| `episode.produce` | 4 | 1 | 4(未变) | 4(未变) |

四件事各有理由:

- **候选择先与钳位一律归 `Domain.reviseRetryLimit`**,本处不写第二道判。`0` 在那份单源里的语义是"读不出轮次",
  故落到下一候选而不是与缺省并档——用 `||` 串一遍会把 `0` 与缺省并成一档(上表第五行会变成 2),
  既有的源级断言「不得再就地兜一份 `maxRetry` 缺省值」也当场红(第 4 节 M3)。
- **候选顺序是 入参 → 分集配置**,与浏览器/CLI `episode.produce` 那两处的顺序逐字相同:点名的压过配置里那份。
- **单独调用不落库**。这一路是"这一次审片按几轮跑",不是"把这一集的偏好改掉";
  编排那一路照旧写回 `sbConfig`(参数面板下次打开读得到,单测 `produce:收敛次数写回分集配置时按 Domain 单源钳` 钉着这一面),
  两路的**轮次**从此相同、**副作用**照旧各归各。
- **批量生成那一路不受影响**。`js/sb-gen.js` 调 `autoSmartReview(p, ep, main, shots)` 只传四个实参,
  第六位是 `undefined`,自然落到分集配置那一档 —— 那正是「参数配置面板里勾的智能审片」该读的地方。

## 3. 有意不做的三件事

1. **没给注册表的 `episode.smartReview` 登记 `maxRetry`**。`js/cmd-registry.js` 是双端共享的那份元数据:
   CLI 用法清单、MCP 工具描述、Agent 侧 `sanitizeCmdArgs` 整形全由它生成。CLI 那一端单独调用没有重抽循环,
   登记等于让用法清单宣称吃一个它静默忽略的参数。代价是 Agent 说「审片,最多重抽 5 次」时那个数仍被整形抹掉——
   这一面如实记在第 5 节,收它的前提是先给 CLI 那一端一个真循环。第 4 节的 M4 把这条边界钉成了判据:
   哪天补了循环、要登记,先红在那条用例上,提醒同轮把两件事一起做。
2. **没碰 `cli.js` 第 1205 行**(`Domain.reviseRetryLimit(args.maxRetry)` 缺 `ep.sbConfig.maxRetry` 那一档)。
   那是 W191 已经做完、尚未合入的修补;本槽 `cli.js` 全文零 diff,合入时不会与本槽在同一行相撞。
3. **没动 `js/commands.js` 里 `episode.produce` 那句写回**。它此刻是冗余的(smartReview 自己吃得到入参了),
   但它同时承担"把钳过的值落库"这一面,摘掉会让参数面板下次读到未钳的旧值,且既有单测钉着。
   两路轮次一致由第 4 节 M5 反向钉住,不靠"只剩一处写法"来保证。

## 4. 变异

六条,每条改完跑全套 `unit`、验完还原;本槽改动落地后这六处一条都不红。

| # | 变异 | 结果 |
|---|---|---|
| 1 | `produce.js` 摘掉入参候选(退回只读 `ep.sbConfig.maxRetry`) | 红 **2**(`produce` 两条新用例) |
| 2 | `commands.js` 不把 `args.maxRetry` 传下去(退回五个实参) | 红 **2**(同上——两端各摘一头都拦得住) |
| 3 | 候选链改成 `maxRetryArg \|\| ep.sbConfig.maxRetry \|\| 2`(把 0 与缺省并档) | 红 **1**(`contract · SK-25 记账两向对账`:「不得再就地兜一份 `maxRetry` 缺省值」) |
| 4 | 注册表替 `episode.smartReview` 登记 `maxRetry`(CLI 端无落点) | 红 **1**(`commands` 那条新用例) |
| 5 | 候选顺序对调(`ep.sbConfig.maxRetry` 压过入参) | 红 **2**(点名的轮次没生效;两路轮次也对不上) |
| 6 | 单独调用顺手把入参写回 `ep.sbConfig`(两路副作用也并成一样) | 红 **2**(两条用例各自的"不落库"那一句) |

第 3 条量的是"行为等价而单源破了"这一路:此刻 `0` 的两种读法在上表第五行给出不同结果,故行为面也拦得住,
但源级那条报得更早、也报得更准(它点名的是"就地兜缺省"这个写法本身)。
第 5 条与第 6 条分开量:一条是"轮次对不对",一条是"副作用越不越界",两问的失败含义不同,不并成一句。

## 5. 回归数字(live 现取)

| 套件 | 基线 `a895ab8` | 本槽 |
|---|---|---|
| `unit` | 577/577 | **580/580** |
| └ `produce` 子套件 | 14 | **16** |
| └ `commands` 子套件 | 35 | **36** |
| └ `contract` 子套件 | 129 | 129(未动) |
| `integration` | 143/143 | **143/143**(未动,实跑复核过) |
| `cli.smoke` | 105/107 | **105/107**(两项失败与基线同名同表现:`未登录 whoami → exit 3`、`llm --json mock 链路`) |

产品代码两个文件:`js/produce.js` +6/−4(形参与那一行候选,连注释)、`js/commands.js` +4/−2(实参与注释)。
`cli.js`、`server.js`、`mcp.js`、`js/domain.js`、`js/cmd-registry.js`、`js/sb-gen.js`、`js/storyboard.js`、
`js/skills.js` 一字未改。

治理面零变动:`Skills.gaps()` 键数、注册表条数、短名单、`CHECKS`、`preflightStages()`、`KB.SECTIONS`、
`playbooks()`、领域命令数,一个数没动;`GUARD_TOPICS` / 花名册 / `TOPIC_FLOOR` 一行没动。
门槛面同样零变动:达标线 `Domain.REVIEW_MIN`、轮次区间 `REVISE_RETRY_MIN..MAX` 与缺省、
质量闸门按 `manual > 0` 阻断合成的语义、`episodeState` 状态机一字未改。

棘轮按 **live** 抬(不抄旧数):`tests/unit.js` 单元 `FLOOR` 577 → **580**、记账件 `FLOOR` 202 → **203**;
`README.md` 的「单元测试(N 项断言」577 → 580;本目录 `README.md` 明写份数 202 → **203**(含本份)。

## 6. 交接

1. **CLI 的 `exec episode.smartReview` 仍然只评一次,轮次入参在那一端仍没有落点。** 这是本槽有意留下的
   两端形态差(SK-25 的 `note` 里「浏览器逐镜重试与 CLI 整集分轮不同构」记的就是这一面,本槽没有扩大也没有缩小它)。
   要收有两条路:给 `EXEC['episode.smartReview']` 补一个与 CLI `produce` 同形的整集轮次循环(那是新起循环,
   要连同"重抽面从哪派生"一起想),或把它明确定性为"单次评审入口"并在注册表 `desc` 里写清。
   两条都要同轮改第 4 节 M4 钉住的那条用例。
2. **Agent 侧说「最多重抽 N 次」时那个数仍被整形抹掉**(第 3 节第 1 点)。这条与上一条是同一件事的两个出口:
   注册表登记面一动,CLI 用法清单与 MCP 工具描述同时跟着动,故得等 CLI 那一端有落点。
3. **`js/commands.js` 里 `episode.produce` 那句写回此刻是冗余的**(第 3 节第 3 点)。真要收,得先把
   "钳过的轮次落库供参数面板读取"这一面搬个去处——今天它与"给子命令传参"挤在同一行,而单测钉的是前者。
4. **W191 合入时看一眼这两处不会打架**:它改的是 `cli.js` 编排层那一行的候选链,本槽改的是浏览器命令层与闭环形参,
   两支在 `cli.js` 与 `js/produce.js` 上无重叠行;合完之后"入参 → 分集配置"这条候选顺序会在
   浏览器 `smartReview`、浏览器 `produce`、CLI `produce` 三处逐字一致。
