# W53 · 记忆播种与板块迁移的 headless 收口(SK-04 覆盖余量)

**范围**:`js/wf-core.js`(新增 `memSeed`/`memMigrateBoard` 两个纯函数 + 三张表 `MEM_BOARD_RENAMES`/`MEM_STD_SEEDS`/`MEM_KB_SEEDS`)
+ `js/agent.js`(`memAll` 改为委托)+ `server.js`(`POST /api/wf/memory-seed` 与板块词表 `wfMemBoards`)
+ `cli.js`(`memory seed|migrate`)+ `mcp.js`(两个同名工具)+ `js/skills.js` 的 SK-04 记账
+ 三套测试(unit 6 条 / integration 12 条 / cli.smoke 8 条)+ README 同步。
**基线**:`cursor/w50-integration-dad5`(`371c75e`)。
**不做**:不新建存储桶、不另造第二套记忆 schema、不新增计费动作与上游调用、不改召回算法(`memRecall/memBlock` 一字未动)、
不改回流面(SK-26 的 `memFeedback/memWrite` 一字未动)、不改发布门与审片达标线、不动提示词注册表与任何人设。

## 1. 改前的实况

`W3` 的 G-02 复核件把这条余量写在第四节第 1 项:

> **记忆的"补种与迁移"仍只在浏览器发生**。`js/agent.js memAll()` 承担旧板块名迁移(`构思`→`导演`)、两条标准沉淀与知识库种子补种;
> CLI/服务端读写直接落 `state.agentMemory`,不跑这段。后果:纯 headless 用户的记忆里没有知识库沉淀条目,旧数据的板块名迁移要等浏览器打开一次才发生。

也就是说,记忆通道早就是双端的(召回算法 `WfCore.memRecall/memBlock` 一份、五处 wf 端点按板块注入、CLI `memory list/add`、
MCP `hujing://memory`),回流(SK-26)也已经两端都写——**唯独"桶里本来该有什么"这件事只有浏览器知道**。
纯 CLI/MCP 起跑的项目,提示词里那段"历史协作记忆"从头到尾是空的;老数据的 `构思` 板块条目在 headless 侧永远召不回「导演」板块。

W3 当时不动的原因是"会改到 W2 KB 接线分支正在改的同一块手抄种子表"。W2 早已合入,种子表现在是稳定的 5 条 `KB_SEEDS` + 2 条标准沉淀。

## 2. 落地:一份派生 + 四个入口

### 2.1 派生(`js/wf-core.js`)

与 `memRecall/memWrite` 同纪律:**记忆桶、知识库、时间戳、板块词表一律经参数注入,函数体不碰任何环境句柄**。

```js
W.MEM_BOARD_RENAMES = { 构思: '导演' };   // 板块改名表(旧 scope → 新 scope)
W.MEM_STD_SEEDS = [ {board, legacy, text} × 2 ];      // 标准沉淀(五段式结构 / 景别衔接口诀)
W.MEM_KB_SEEDS  = [ {keys, board, legacy} × 5 ];      // 知识库沉淀(正文现取 KB.pick,本表不留措辞)
W.memSeedBoards()                                     // 有登记种子的板块(由上面两张表推出)

W.memSeed(mem, {kb, now, boards, board?})  → {mem, added, updated, migrated, changed}
W.memMigrateBoard(mem, from, to, {boards}) → {mem, moved, migrated, changed}
```

三件事值得单说:

- **不新建第二套 schema**。种下的条目就是既有桶里那种条目:`{text,time,scope}`,知识库条目多一个既有的 `kb` 同键标识
  (条目正文改过后按 `kb` 键原地跟随,不追加第二条)。落点仍是 `state.agentMemory`。
- **幂等,且"没变化"要说出来**。已种过再播 `added` 为空、`changed=false`,调用方(浏览器/服务端)据此**不写盘**——
  浏览器侧顺带把老写法的"逐条 `Store.save()`"收敛成一次(用例钉住 `_saves===1`)。
- **板块词表不在本层写第二份**。`boards` 由调用方注入:浏览器传 `AGENT_BOARDS` 的板块键,headless 传
  `Skills.STAGES` 主线七步名 + 支线「导演」板块(`WF_BOARD.understanding`)。两端各取自己那份单源,由一条用例断言两者**同集同序**。

### 2.2 空板与未知板名:明确报错,不静默空成功

| 情形 | 行为 |
|---|---|
| `board` 不在板块词表(如「灯光」) | 抛 `未知板块名:灯光(可用板块:…)`,服务端 400 |
| `board` 合法但没有登记种子(如「生成」) | 抛 `板块「生成」没有登记的记忆种子(有种子的板块:分镜/剧本)`,服务端 400 |
| 迁移的 `from` 板名下没有条目 | 抛 `旧板名「构思」下没有记忆条目,未发生迁移`,服务端 400 |
| 迁移缺 `from`/`to`、两者同名、`to` 未知 | 各自抛错,服务端 400 |
| 已种过再播 | **不是错误**:`changed=false`、200 |

区分点在于"是不是用户显式请求的动作":`memSeed` 内部按 `MEM_BOARD_RENAMES` 做的自动迁移,旧板名下没有条目属常态,不报错;
用户自己敲的 `memory migrate --from X --to Y` 若一条也没动,回一个"成功"等于骗人,所以报错。

### 2.3 四个入口

| 端 | 入口 | 说明 |
|---|---|---|
| 浏览器 | `js/agent.js memAll()` | 原入口不变(打开助手面板/记忆弹窗即触发),内部改为一次 `WfCore.memSeed` |
| 服务端 | `POST /api/wf/memory-seed` | `{board?}` 或 `{from,to}`;零 LLM、零上游调用、零计费;写回走 `wfSave`(与 `/api/state` PUT 同路径,带快照) |
| CLI | `memory seed [--scope 板块]` / `memory migrate --from 旧板名 --to 新板名` | 端点薄封装,与 `memory list/add` 同一命令表 |
| MCP | `hujing_memory_seed` / `hujing_memory_migrate` | 包装上面两条 CLI 子命令,不另起链路 |

**为什么不做成"读记忆时自动播种"**:wf 端点每次注入记忆都要读一次 state 树,顺手播种意味着读一次写一次盘,
还会在用户毫不知情时改变提示词字面。播种因此是显式动作,记在 SK-04 的 `note` 里。

## 3. 记账

`core.memoryDual`(SK-04)的 `note` 按实况改写:补种/迁移那半从"仍欠"移到"已落地"并写明双端单源与报错口径,
「仍欠」段只剩自动沉淀那一半(理解/分镜/拆集/提取主体四步的结论仍不回流,回流面本身归 SK-26)。
`pending` 本就为空、`gaps: ['G-02']` 原样保留(落地不摘标记是本目录的关联索引口径)。

`skills` 套件里那条"三条 `infra` 的 note 须在「仍欠」段点名"的用例,锚点随实况从 `memAll` 改指
`理解/分镜/拆集/提取主体`——**这是它设计上就要求的**(用例注释原文:"接上了就要同步改 note"),不是放宽判据:
锚点仍然只认「仍欠」之后那段文字,余量补完之前 note 蒙不过去。

## 4. 断言与变异验证

memory 套件 12 → **18 条**(只增不改既有 12 条):

| 新增用例 | 钉住什么 |
|---|---|
| `memSeed` 播种(Node 无 window) | 一次种齐迁移+2 条标准沉淀+5 条知识库种子、条目字段集与既有桶同形、时间戳经 `ctx.now` 注入、板块 scope 取种子表、知识库正文现取 `KB.pick`、播下即可被同板块召回、幂等、脏入参安全、不改入参 |
| `memSeed` 补种边界 | 旧板名按表归位且**不双写**、入参条目不被就地改写、知识库同键跟随正文(原地改不追加)、老手抄版命中 `legacy` 不重复种、无 `kb` 注入时只种标准沉淀 |
| `memSeed` 按板块播种 | 只播该板块不越板、未知板名与空板各自抛错、`memSeedBoards()` 由两张表推出、只播某板块时不做别的板块的迁移 |
| `memMigrateBoard` | 条目不增不减、只改命中条目的 `scope`、其余字段与顺序原样、迁移后能被新板块优先召回、空板/缺参/同名/未知新板名四种报错 |
| 双端同播(行为面) | 浏览器 `memAll`(vm 沙箱真加载 `agent.js`)与 Node 进程内直调 `memSeed` 产出**逐字段一致**、播种只落一次盘、重复进入不重复种、老数据打开一次即归位 |
| 播种面接线(源级) | `agent.js` 不得再内联种子/迁移表(直写 window-only 即红)、种子表在 `wf-core`、服务端端点委托 `WfCore` 且落点仍是既有桶、播种端点不挂 LLM 计费动作、CLI 两个子命令与 help、MCP 两个工具包装同名子命令、两端板块词表同集同序 |

**变异实测**(逐个改完跑测试,验证后原样还原,`git diff` 为空):

| 变异 | 实测行为 | 转红 |
|---|---|---|
| `agent.js` 里重新内联一段 window-only 播种 | 种子表又变两份,且逐条写盘回潮 | 2 条(源级 + 双端行为面) |
| 空板播种改为静默回 `changed:false` | 用户播了个不存在种子的板块却看到"成功" | 1 条(按板块播种) |
| 迁移改为 `push` 新条目(不原地改) | 条目双写,旧板名那条还留着 | 1 条(迁移) |
| 服务端落点改成新桶 `tree.agentSeedMemory` | 播下的记忆召回侧读不到(等于没播) | 1 条(源级) |
| 摘掉 MCP 两个工具 | headless 只剩 CLI 一条路 | 1 条(源级) |

## 5. 回归数字

| 套件 | 本槽 | 基线(`w50` `371c75e`,同机取) |
|---|---|---|
| `node tests/unit.js` | **386 / 386** | 380 / 380(净 +6 用例) |
| `node tests/integration.js` | **105 / 105** | 93 / 93(净 +12 用例) |
| `node tests/cli.smoke.js` | **70 / 72** | 62 / 64(失败两项逐项相同:`未登录 whoami → exit 3`、`llm --json mock 链路`,与本槽无关) |

`node --check` 过:`js/wf-core.js`、`js/agent.js`、`js/knowledge.js`、`js/skills.js`、`server.js`、`cli.js`、`mcp.js`、
`tests/unit.js`、`tests/integration.js`、`tests/cli.smoke.js`。
文档同步:README(新增 `/api/wf/memory-seed` API 行、CLI 记忆命令总览、助手记忆种子的双端说明、三套测试的数字与覆盖面)、
`js/knowledge.js` 头注释的种子宿主指向、本目录 README 索引行。

## 6. 与 SK-26 的边界

两件事都动 `state.agentMemory`,但方向相反,互不重叠:

| | SK-26 回流(W43) | 本槽播种(W53) |
|---|---|---|
| 写什么 | 闭环刚产生的**可判定结论**(待返工镜数/共性问题类型/四维最弱维/发布门状态) | 平台**预置**的方法论沉淀(2 条标准沉淀 + 5 条知识库种子)与板块改名归位 |
| 何时写 | 审片/发布闭环收尾时自动 | 显式动作:浏览器开助手、headless 调端点/命令 |
| 派生函数 | `memFeedback` + `memWrite`(按 `fb` 回流键原地更新) | `memSeed` + `memMigrateBoard`(按 `legacy`/`kb` 键判重) |
| 本槽是否触碰 | **一字未动**(不改回流文案、不改 `fb` 键、不改 50 条上限口径) | — |

两者共用同一个桶、同一套条目结构与同一份召回算法,所以播下的种子与回流的结论会一起被 `memBlock` 按板块召回——
这正是记忆桶该有的样子,不需要在这一层做区分。

## 7. 交接

1. **播种不截上限**。`memSeed` 与浏览器原行为一致:不做 `MEM_MAX` 截断(截断只在写入面 `memRemember`/`memory add`/`memWrite` 上)。
   桶接近 50 条时播种会短暂超出上限,下一次写入面操作会把它截回来——代价是可能挤掉最旧的用户条目。
   要改得先定"种子与用户条目谁优先"的产品口径,不是本槽范围。
2. **自动沉淀仍只有两个闭环**(SK-04 `note` 与 SK-26 交接第 4 条已记):理解/分镜/拆集/提取主体几步跑完的结构化产出不回流。
3. **迁移只有表驱动的一条**(`构思`→`导演`)。再改板块名时,往 `MEM_BOARD_RENAMES` 加一行即可两端同时生效;
   用户自己造的板块名(历史脏数据)得靠 `memory migrate` 手动归位。
4. **MCP 侧仍无记忆写入工具**(`memory add` 未包装成工具,与 W1 的"MCP 增只读资源"条款一致);
   本槽新增的两个工具是"整理"语义而非"写入用户偏好"语义,故不视为对该条款的扩面。
