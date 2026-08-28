# W240 · MCP 工具数与 CLI 命令数的文档口径按 live 收

**结论先写:三处逐个 live 查过——`mcp.js` 注释那一面停工(它本就不写死个数),README 与 AI 助手接入指南两面写死且都错(38 / 37,live 39),改成 live 并补一条双口径对账用例。**

范围:`README.md`(3 处数字 + 一段口径说明)、`docs/AI助手接入指南.md`(1 处数字 + 一句口径)、`tests/unit.js`(contract 套件 +1 条)。产品码零 diff。

## 一、开工先 live:三处写死面逐个现取

交接自称「MCP 42 / CLI 25」。两个数各错各的,而错法不同——先把尺子摆出来再量。

### 1.1 MCP 侧:两种口径读回同一个数,42 在哪把尺子下都不成立

| 口径 | 怎么取 | 现取 |
|---|---|---|
| 运行期 | 起真 `node mcp.js`,stdio 递一条 `{"method":"tools/list"}`,数回包 `result.tools` | **39** |
| 源级 | `mcp.js` 里 `const TOOLS = [ … ]` 表内 `{ name: 'hujing_*'` 字面 | **39** |

两者逐名相等(不只是个数相等)。资源与提示模板顺带现取:`resources` 2 条 + `resourceTemplates` 4 条、`prompts` 3 条。

**42 不是任何一把尺子的读数**,故不存在"换个口径就对了"这条路;同样也不存在"注册三个空工具凑到 42"这条路——本槽一个工具都没加。

### 1.2 CLI 侧:25 是半数,错在口径而不是算术

`cli.js` 的命令登记有两种写法,分别数出来:

| 写法 | 现取 |
|---|---|
| `CMD['x'] = …`(带连字符的命令名只能这么写) | 25 |
| `CMD.x = …` | 24 |
| 合计 = `Object.keys(CMD).length`(沙箱里真加载 `cli.js` 后现取) | **49** |

49 条命令名现取:`login logout whoami credits jobs job job-cancel usage issues release-check release projects project-show workflow flow-template project-create project-script episode-add episode-script episode-show subjects subject-add subject-image subject-copy shots shots-import shots-dedupe shot-set shot-confirm gen-image gen-shot-image gen-video gen-shot-video gen-episode wait review-frames review-note compose export exec upload download llm tts ff agent memory state-get state-put`。

「CLI 25」在它自己那把尺子下算得没错,错在把括号式那一半当成了命令总数。这种错法**重算一遍还是 25**,故它比纯粹写错更难被发现——判据必须钉死"两种写法之和",只数一种照样能得出一个自洽的半数。

### 1.3 三处文档面的实况

| 面 | 写了什么 | 对不对 | 处置 |
|---|---|---|---|
| `mcp.js` 头注释 | 只讲协议、配置、认证与计费语义,**一个个数都没写** | — | **停工**,一字未改 |
| `mcp.js` 就绪那行 stderr | `TOOLS.length + …` 现算 | live | **停工**,一字未改 |
| `README.md` 第 188 行 | 「38 个 `hujing_*` 工具」 | 错(live 39) | 改 39 |
| `docs/AI助手接入指南.md` 第 13 行 | 「37 个工具(`hujing_*`)」 | 错(live 39) | 改 39 + 补一句以 `tools/list` 现取为准 |
| `README.md` 命令总览那一行 | 逐条列命令名,**不写个数** | 49 条一条不漏 | 不改,改成判据(见三) |

CLI 命令数这个数**两份文档都没写过**,故 CLI 那侧没有"错数字"要改;它有的是另一种漂法——加了命令而总览没跟着补,那一行就静默地少一条。本槽把它一并收进判据。

## 二、为什么不停在"只记账"

停工条件是「文档已不写死个数,或个数与 live 一致」。`mcp.js` 两面都满足,故那一面停工。README 与接入指南两面**既写死又错**,而这两处正是助手接入时读的第一屏:照 37 预期工具面的助手,发现少了两个只会当自己记错,不会去怀疑文档。故不停工。

## 三、落地:一条 contract 用例,四层判据

`tests/unit.js` contract 套件新增 `README 数字对账:MCP 工具数按运行期 tools/list 现取、CLI 命令数按 Object.keys(CMD) 现取`,与既有那几条数字对账并排。四层:

1. **MCP 取运行期口径**:`spawnSync` 起真 `mcp.js` 递 `tools/list`,读回工具名集;源级 `TOOLS` 表字面只用来对照,两者须**逐名相等**。不数源码行是有意的——数出来的是"注册表里写了几条",不是"客户端拉得到几条";注册路径上要是吞了工具,个数对账本身就先失去意义,故先把这一层钉在前面。
2. **两份文档的数字**:经既有 `assertDocNum` 钉在 live 上——那句话被改写或删掉同样算红,否则删掉即可静默绕过对账。
3. **CLI 两种写法之和**:`Object.keys(CMD)`(`loadCli()` 真加载后现取)须等于 `CMD['x']` 与 `CMD.x` 两种源级写法之和,并且**两种各自都得数得到**(有一种归零说明取数口失效,和数对上了也是假绿)。这一层封的就是 §1.2 那种半数口径。
4. **命令总览逐条点名**:README 那一行有意不引入新数字,改判"每个 live 命令名都出现在那一行的反引号里"。加了命令没进总览即红,而不必再维护一个要人工同步的数。

### 3.1 变异实测(每档改完回读证明变异真落进去)

| 变异 | 结果 |
|---|---|
| README 39 → 42(照交接自称写) | 红 1,点名「实测 39,文档 42」 |
| `mcp.js` 工具表插一条探针工具(live 变 40) | 红 1,点名「实测 40,文档 39」 |
| `cli.js` 加一条 `CMD['zzz-probe']` 而总览不补 | 红 1,点名「命令总览漏登记 CLI 命令:zzz-probe」 |
| 三档各自还原 | 142/142 全绿 |

三个方向分别对应"文档写错"、"工具增减"、"命令增减",报错句各说各的,读报错就知道该改哪一头。

## 四、连带改动与棘轮

新增 1 条 contract 用例,连带三个走**相等**判据的数字按 live 同轮改:

- `README.md` 单元测试用例数 655 → **656**
- `README.md` contract 套件自报条数 141 → **142**
- `docs/skills-wave/README.md` 明写份数 253 → **254**(含本文)

`FLOOR` / `SLACK` 一个字面都没碰(本槽明令不碰)。合完的差额:单元 656 − 655 = 1、记账件 254 − 253 = 1,其余三格 0,`SLACK` 3 以内,`floorLagVerdict` 回空。这一格如实记下:**下限守的水位比实况低 1**,下一个动这两格的槽按当轮 live 抬。

`gaps()` 20 键一个没剥、`GUARD_TOPICS` / `TOPIC_FLOOR` 仍 19、`state-put` 一道闸都没加、`generateVideos` 的选人与 `note` 一字未动。

## 五、live 数字(合完本槽现取)

| 口径 | 现取 |
|---|---|
| MCP `tools/list` | **39** |
| MCP `TOOLS` 表字面 | **39**(与上逐名相等) |
| MCP resources / resourceTemplates / prompts | 2 / 4 / 3 |
| CLI `Object.keys(CMD)` | **49**(括号式 25 + 点式 24) |
| `node tests/unit.js` | **656/656 PASS** |
| `node tests/unit.js contract` | **142/142 PASS** |
| `node tests/integration.js` | **148/148 PASS** |
| `node tests/cli.smoke.js` | **115/117**,失败两条与 master 同名同表现(`未登录 whoami → exit 3`、`llm --json mock 链路`) |
| 记账件份数 | **254**(含本文) |

## 六、扫到但没动的面(如实登记)

- `docs/Agent业务流与前沿案例分析-2026-08.md` 写「29 工具」两处。那是一份**带日期的分析快照**,记的是当时的现状读数,不是面向接入的指引;按"记账件不追改历史读数"的口径原样留着,也没进对账。
- `docs/skills-wave/` 下历史记账件里的旧读数(40 / 41 / 37 / 38 等)同理,一处未改。
- 本槽只收"个数"这一面。README 与接入指南里工具**能力**描述是否与实况同步,不在本槽范围。

## 七、分支与残留

- 分支 `cursor/w240-mcp-tools-count-a1f2`,从 `cursor/w238-integration-7e3d` 现取 tip `bba2b4c` 开出。
- 未开 PR、未合 master。
- 残留:`FLOOR` 两格落后 live 1 格(§四,有意不碰);`docs/Agent业务流与前沿案例分析-2026-08.md` 的历史读数不在对账内(§六)。
