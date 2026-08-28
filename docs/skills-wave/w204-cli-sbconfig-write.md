# W204 CLI produce 把钳过的收敛轮次写回 sbConfig

W191 留下的那一格:同一条 `episode.produce`,浏览器那一端把钳过的轮次写回
`ep.sbConfig.maxRetry`,CLI 那一端只读不写。本槽只补这一处写回,循环形状一字未动。

## 1. 分支与基线

- 基线:`cursor/w199-integration-540b`,tip `825705a`(核对通过,与交接单给的字面逐字相同)。
- 本槽分支:`cursor/w204-cli-sbconfig-write-e517`。
- 跳过未取:W200(sb-views 取图)、W201(plans execStep)、W202(合入员)、W203(agent-ops evolve)、
  W197、W198——一条都没 cherry-pick,`git log` 上只有本槽自己的两个 commit。

## 2. 停工位判定:成立(先在基线上 live 举证,再动手)

判据按交接单给的两条正向条件量:**用户下次在浏览器打开该集参数面板仍是旧数字**,
或 **CLI 下次无入参跑回旧次数**——两条都成立才谈得上是缺口,只是"两端持久化策略不同"
那种产品口径的差异不算。

举证方式不写第二份口径:把 `tests/unit.js` 顶部那套沙箱截到 `SUITES` 之前现取出来跑,
浏览器那一端加载真 `js/produce.js` + `js/commands.js`,headless 那一端加载真 `cli.js`
(只掐掉末尾 `main()`);服务端 state 用一份内存库当磁盘——`stateGet` 每次现取一份**拷贝**,
只有 `withProject` 真提交的补丁才落到库上,审片端点桩恒回 5 分并与真端点一样把整集报告写回 state
(重抽面照旧由编排层现取实况派生)。实跑轮数从产品自己的进度日志「第 x/N 轮」上读,不读回执里的数字。

基线 `825705a` 上的三问读数:

| 问 | 动作 | 基线读数 |
|---|---|---|
| Q1 | 浏览器 `episode.produce({maxRetry:4})`,该集 `sbConfig.maxRetry` 原为 1 | 跑完 **`ep.sbConfig.maxRetry` = 4**(写回了) |
| Q2 | CLI `exec episode.produce --args '{"maxRetry":4}'`,同样原为 1 | 当轮真跑 **第 1/4…4/4 轮**,跑完**磁盘上仍是 1** |
| Q3 | 紧接着 CLI `exec episode.produce`(不带入参) | **第 1/1 轮**——悄悄跑回旧次数 |

两条正向条件同时成立:参数面板那一侧读到的还是 1(用户在浏览器打开该集参数面板看到旧数字),
CLI 下一轮无入参也跑回 1 轮。后果按钱算:以为"上次已经设成 4"的人,此后每集少三轮修订重抽;
反过来把面板从 5 调到 1 的人,只要哪一轮在 CLI 上点名过一次大数,面板与实跑仍是两回事。
排除项也量了——不是"CLI 下一轮仍吃入参/环境"那种口径差异:第二轮压根没有入参可吃,
读的就是库里那份旧值。

修完之后同一份举证的读数:Q2 磁盘变 **4**,Q3 变 **第 1/4…4/4 轮**,Q1 一字未动。

## 3. 改动

产品面只有 `cli.js` 一处,**+11 −0**,落在 `EXEC['episode.produce']` 解析轮次那一行之后:

```
const maxRetry = Domain.reviseRetryLimit(args.maxRetry, ep.sbConfig && ep.sbConfig.maxRetry);
if (!ep.sbConfig || ep.sbConfig.maxRetry !== maxRetry) {
  await withProject(args.pid, f, projLive => {
    const epLive = findEp(projLive, args.epid);
    epLive.sbConfig = epLive.sbConfig || {};
    epLive.sbConfig.maxRetry = maxRetry;
  });
}
```

四件事有意如此:

- **落库的是钳过的那个数**,不是入参原值。钳位与择先仍只在 `Domain.reviseRetryLimit` 一份,
  本层不重算——库里因此不会出现一个跑不到的越界数(`--args '{"maxRetry":9}'` 落的是 5)。
- **经 `withProject` 提交**,不是在 `execCtx` 拿到的那份快照上改一改。headless 这一端的
  "库"在服务端,快照改了不提交等于没改(第 6 节 M4 正是量这个)。
- **值没变就不提交**,不为一次没有内容的写回多发一次 PUT(不带入参且面板没改过的常规一轮零额外往返)。
- **只写这一处编排**。`exec episode.smartReview` 是一次 `/api/wf/smart-review` 往返、没有重抽循环,
  它一轮都没重抽,替它写回一个次数就是在库里撒谎;那一端仍一个字不写(有用例正面钉着)。

位置跟着浏览器那一端:写回在审片这一支里(`args.smartReview === false` 关掉审片时两端都不写),
写的是**本次解析出的轮次上限**而不是"实际重抽了几轮"——与浏览器 `js/commands.js` 第 362 行同语义。

测试面 `tests/unit.js` **+88 −0**:两条 `commands` 用例 + 一个 `cliDisk` 夹具。文档面 `README.md`
两处(单元用例数 602 → 604;「智能审片闭环」那条补写回两端同一份的说法)。

`js/`、`server.js`、`mcp.js`、`index.html`、`css/`、注册表五个文件相对基线**一个字节没动**。

## 4. 判据落在哪两条

- **`CLI exec produce:点名的轮次钳过即落库,下一轮不带入参跑的就是这个次数`**:
  headless 这一端真跑两轮 produce——第一轮点名 4(前提先钉住"当轮确实跑了 4 轮",
  免得落库对了而次数根本没生效),读库;第二轮不带入参,读实跑轮数。越界那格另跑一遍,
  断言落库的是 `Domain.REVISE_RETRY_MAX` 而不是 9。末尾反向钉住单独调 `smartReview` 不写库。
- **`produce 写回两端同一份`**:七格入参 × 分集配置(点名/越界/小数/`0` 让位/字符串数字/缺位/两处都空)
  在浏览器与 CLI 上各真跑一遍 produce,**落库的数逐格相等**。上一条钉"这一端写没写回",
  这一条钉"两端写的是不是同一个数"——谁在自己那侧另钳一道或另兜一个缺省,这里当场对不上。

## 5. 夹具:为什么另立 `cliDisk` 而不是用 `cliCtx`

既有的 `cliCtx` 把 `stateGet` 与 `withProject` 都指向同一个项目对象,读写同一份内存。
写回类判据用它量不出真假:编排层只在自己手里那份快照上改一改,`stateGet` 也照样读得到。
`cliDisk` 因此让 `stateGet` 每次现取一份拷贝,只有 `withProject` 真提交的补丁才落到 disk 上。
这不是纸面推理——第 6 节 M4 那手变异(改快照、不提交)在 `cliDisk` 上**红 2**,
同一手拿 `cliCtx` 那种共享对象夹具量则读到 4、**一条不红**(现跑复核过)。

## 6. 变异抽查

四手都在本槽 tip 上现跑,跑完 `git checkout -- cli.js` 原样恢复、树干净、604/604 复绿。
表里的"红几条"不含当轮尚未补齐记账件时那条份数对账。

| 变异 | 读数 | 红在哪 |
|---|---|---|
| M1 整段摘掉写回(退回基线形态) | **红 2** | 写回那条报「期望 4,实际 1」;两端对账那条报同一格 |
| M2 替单独调用的 `smartReview` 也写回 | **红 1** | 写回那条末尾:「单独调用只评一次,写回一个没跑过的轮次就是在库里撒谎」 |
| M3 落库的换成 `args.maxRetry` 原值(绕过钳位) | **红 2** | 越界那格报「期望 5,实际 9」;两端对账那条在 `maxRetry:9` 那格同报 |
| M4 只改 `execCtx` 那份快照、不经 `withProject` 提交 | **红 2** | 与 M1 同两条(夹具真在量落库,见第 5 节的反事实读数) |

分工可辨的三格:

- **M1 与 M3 分得开**:M1 是"这一端根本没写",M3 是"写了但写的不是真跑的那个数",
  报错句一个报 4/1、一个报 5/9,读单看报错就知道断在哪一层。
- **M2 与其余三手方向相反**:它一个字没动 produce 那条链路,红的只有"不许替没循环的那一端假写"
  这一句——写回这件事不许顺手扩散到没有落点的命令上。
- **M4 是本槽夹具那一格的自证**:同一手在共享对象夹具上全绿,在 `cliDisk` 上红 2,
  即"落库"这个词在测里是真被量了的,不是靠夹具形状白送的绿。

## 7. 数字(live 现取,不抄两侧自称)

| 口径 | 基线 `825705a` | 本槽 tip | 备注 |
|---|---|---|---|
| unit | 602 | **604** | +2,恰是本槽新增的两条 `commands` 用例 |
| commands | 38 | **40** | 两条都落在这个套件 |
| produce / domain / contract / api | 16 / 35 / 132 / 10 | **16 / 35 / 132 / 10** | 未动,实跑复核 |
| integration | 143 | **143** | 未动,实跑复核 |
| cli.smoke | 106/108 | **106/108** | 分子分母都未动,实跑复核;两条失败仍是 `未登录 whoami → exit 3` 与 `llm --json mock 链路` |
| GUARD_TOPICS / TOPIC_FLOOR / 花名册 | 19 / 19 / 19 | **19 / 19 / 19** | 本槽没碰护栏主题,故一条不登记 |
| 记账件份数 | 212 | **213** | 含本文 |

下限按 live 抬两格:unit `FLOOR` 602 → **604**、记账件 `FLOOR` 212 → **213**;
`integration` 143、`cli.smoke` 108、`TOPIC_FLOOR` 19 三格 live 未动故不动(差额上限 3 格那条逐格复核过)。

`tests/e2e.js` 按纪律**一次没跑**。

## 8. 没碰的东西(逐条现取复核)

`js/sb-views.js`、`js/plans.js` 的 `execStep`、`js/agent-ops.js` 的 `run`、
`Domain.reviseRetryLimit` 的候选顺序(仍是 命令入参 → 分集 `sbConfig` → 缺省)、
`Skills.gaps()` 的 20 个键、`GUARD_TOPICS` 登记表、发布门 G9 —— **一处未改**;
CLI produce 的循环形状(整集分轮、轮内只碰低分子集、重抽面每轮现取实况派生)
与回执结构一字未动;`episode.smartReview` 在命令注册表上照旧不登记 `maxRetry`
(那一端仍没有落点,W199 残留 1 原样挂着)。

## 9. 残留

1. **两端重试计数器仍不落库**(W199 残留 2 的另一半):本槽写回的是"还能重来几轮"这个上限,
   "这一集实际重抽过几轮"两端都仍只在回执里,关掉终端就没了。
2. **CLI 端 `episode.smartReview` 仍没有重抽循环**,轮次入参在那一端仍无落点,
   注册表按纪律不给它登记 `maxRetry`;代价是 Agent 侧 `WfCore.sanitizeCmdArgs` 会把这个参数抹掉。
3. **SK-25 的 G-03 仍挂着**:两端闭环的调度粒度仍不同构(浏览器逐镜排、CLI 按整集分轮),
   本槽只补写回不动形状。
4. **写回的时机两端仍差半拍**:浏览器在跑审片之前写,CLI 在第一次评审回来之后写
   (轮次是在那一行才解析出来的)。同一次 produce 的最终落库值相同,但第一次评审途中崩掉时
   两端一个已写、一个没写;要抹平得把 CLI 那行解析提到评审之前,属改形状,本槽没做。
5. `js/skills.js` SK-25 的 `note` 里那段"仍欠"文字本槽没动——它点的是调度粒度那一面(残留 3),
   与本槽补的写回不是同一格。
