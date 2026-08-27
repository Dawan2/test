# W61 · SK-26 主线前段四步(理解/分镜/拆集/提取主体)闭环结论回流协作记忆

**范围**:`js/wf-core.js`(`memFeedback` 增四个分支 + `MEM_EP_LONG` 一个常量)+ 六处写入点
(`server.js` 三个 wf 端点共四处、`js/understanding.js`、`js/sb-llm.js`、`js/proj-upload.js`、`js/commands.js`、`cli.js`)
+ `cli.js` `withProject` 增可选 `memFeed` 形参 + `js/skills.js` 的 SK-26/SK-04 记账
+ `tests/unit.js` memory 套件 7 条、`tests/integration.js` 8 条、`tests/cli.smoke.js` 7 条 + 三份文档同步。
**基线**:`origin/cursor/w57-integration-a697`(`450c29f`)。**未合并 W58–W60。**
**不做**:不改播种 `memSeed`/`memMigrateBoard` 与两张种子表、不新建存储桶、不新增计费动作与接口调用、
不改发布门 `G1–G10` 的判据与计数口径、不改四步各自的产出与判定(`undNormalize`/`localSplitEpisodes`/入库去重口径一字未动)、
不动 `memRecall`/`memBlock` 召回算法。

## 1. 改前的实况

W43 把回流面从零做到了两处:整集审片(`ep.lastReview` 写完)与发布留痕(`p.releases[]` 写完),
两端各一套写入点、派生只此一份 `WfCore.memFeedback`/`memWrite`。它自己的交接第 4 条就点了名:

> 其余 wf 步的结论仍不回流:理解/分镜/拆集/提取主体四步跑完也各有结构化产出……要接就复用本槽这套
> (`memFeedback` 多一个分支 + 该端点一行写入),但先想清楚每一步「可判定的结论」到底是哪几个字段——回流噪音比不回流更糟。

W53 做完记忆播种后,把这条余量写进了 `js/skills.js` 的 SK-04 `note`,并有断言钉着字面:

```
仍欠一处覆盖余量:自动沉淀本轮结论只有审片/发布两个闭环(那一面归 SK-26 的回流面),
理解/分镜/拆集/提取主体几步的结论仍不回流
```

也就是说:**召回面早就全链贯通了**(五处 wf 端点按板块 `scope` 注入,`memBlock` 双端同算法),
**写入面只覆盖到主线最末两步**。前段四步跑完,用户下一轮回到同一步,提示词里什么都没多。
本槽补的就是这一段——补完之后,主线上每一个有结构化产出的闭环都往同一个桶里回流。

## 2. 产品判断:四步各回流哪几个数

回流面做坏的方式还是那两种:回流噪音、回流模型的话。四步逐一定字段,判据一律是**已落盘的结构化字段**,
不取任何模型评语原文,不新造评价词:

| 步 | 回流的可判定字段 | 判定输入 | 为什么是这几个 |
|---|---|---|---|
| 本集理解 | 六维产出数 `N/6` + 缺的维名 | `ep.understanding` 逐维非空;**维名现取 `WfCore.UND_DIMS` 单源** | 回答"这一集理解到底做全没有";六维改名/增减时回流文案自动跟上,不写第二份维名 |
| 智能分镜 | 镜数、预估总时长、缺提示词镜数、未挂主体镜数 | `ep.shots`;时长走 `Domain.estShotDuration`(双端同口径,不另算第二份段时长) | 前两个回答"产出了什么",后两个是下一轮真要补的**缺口**;未挂主体 = 既无人物也无场景道具 |
| 剧本拆集 | 集数、实际切分模式、最长集字数、超长集数 | `p.episodes[].content` 长度;`MEM_EP_LONG=2000` 与分集页「超 2000 字」标签同数 | 集数与模式回答"怎么切的",超长集回答"哪儿还要再拆";模式记**实际用上的那个**(LLM 锚点全落空降级 `even` 时如实记 `even`) |
| 提取主体 | 本轮新增/已有位数、主体库总量、缺参考图位数 | 调用方入库回执 `added`/`skipped` + `p.subjects` | 新增/已有分开回答"这轮真提到了没有";缺参考图是主体步之后**最常见的下游阻塞**(发布门与问题中心都判它) |

`MEM_EP_LONG` 是本槽唯一新增的常量,注释写明"与分集页标签同数,本层只读不改建议口径"——
和 `MEM_LOW_SCORE` 当初的处理一致,回流层从不定义阈值,只引用别处已经定好的那个。

**有意不回流的**:模型给分镜方案打的分(`sbPlans[].score`)、理解各维的正文、拆集出的集标题、提取出的主体名。
前两类是模型的话,后两类是**内容本身**——记忆桶喂的是下一轮的提示词,把这一轮的具体内容灌回去,
下一轮就会照抄(拆集回流集标题 → 下次拆集倾向复用同名;提取回流主体名 → 下次提取倾向复现同一批人)。
回流的用处是"上一轮做到什么程度、还差什么",不是"上一轮写了什么"。

**失败路径一律不写**,四支各有自己的"没有结论"判据:

| 支 | 不写的情形 |
|---|---|
| `und` | `understanding.fallback`(浏览器 LLM 失败回退模板不是理解结论)、六维全空 |
| `sb` | `shots` 为空或缺失;浏览器 LLM 拆镜失败回退本地 `publishShots` 那条路**根本不挂写入点** |
| `split` | `episodes` 为空;缺剧本 400 / 项目不存在 404 走不到写入点 |
| `extract` | `p.subjects` 为空(一位都没入库);LLM 报错在 `withProject` 之外先抛,`memFeed` 不执行 |

## 3. 落地:派生一份 + 写入六处(两端各一套)

派生仍在 `js/wf-core.js`,记忆数组一律**经参数注入**、函数体不碰任何环境句柄:

```js
W.MEM_EP_LONG = 2000; // 与分集页「超 2000 字」标签同数,本层只读不改建议口径

W.memFeedback(o, ctx) // o 各分支互不影响,给哪支回哪条(可同时给多支):
                      //   {ep}                         审片闭环(W43)
                      //   {p,gate,rel}                 发布闭环(W43)
                      //   {und:{ep}}                   本集理解
                      //   {sb:{ep}}                    智能分镜
                      //   {split:{p,mode}}             剧本拆集
                      //   {extract:{p,added,skipped}}  提取主体
```

`add()` 多收一个可选 `sc` 形参:审片/发布两支不传、仍落成片板块(W43 的行为逐字节不变),
四个新支各传自己那一步的板块——**`scope` 一律取 `WfCore.WF_BOARD` 单源**(`understanding`→导演、
`smart-storyboard`→分镜、`split-episodes`→剧本、`extract-subjects`→主体),本层不写第二份板块名。
取 `WF_BOARD` 不只是省事:各步提示词**召回**记忆时用的就是这张表的同一个键,
所以"回流下去的结论,下一轮同一步按 `memBlock` 就吃得到"是结构上保证的,不靠约定。

`fb` 回流键沿用 W43 口径,四个新键分别是 `und:<epid>` / `sb:<epid>` / `split:<pid>` / `extract:<pid>`
(理解与分镜按**集**,拆集与提取主体按**项目**——这与四步各自的作用域一致)。
`memWrite` 按键原地更新,故反复跑同一步只留最新一条,不会把 50 条上限刷满挤掉用户自己沉淀的偏好。
`memWrite` 与 `MEM_MAX` 一字未动。

六处写入点,各挂在**原本就要落盘的那一步之前**,不多一次 IO:

| 步 | 浏览器 | headless |
|---|---|---|
| 本集理解 | `js/understanding.js` 新增 `memBack(ep)` 委托,两个交付点(两阶段 Step1 的 `chain` 与独立重生成 `regen`)各调一次,都在原本那次 `Store.save()` 之前 | `server.js` `/api/wf/understanding`;**外加** `/api/wf/smart-storyboard` 内部那次理解步(复用未过期理解时不重写) |
| 智能分镜 | `js/sb-llm.js` `publishLLMShots`(本地回退那条路不挂) | `server.js` `/api/wf/smart-storyboard`(`ep.sbPlans` 之后、`wfSave` 之前) |
| 剧本拆集 | `js/proj-upload.js` `splitCore` | `server.js` `/api/wf/split-episodes` |
| 提取主体 | `js/commands.js` `project.extractSubjects` | `cli.js` `EXEC['project.extractSubjects']` |

三件事说明:

- **理解为什么是三处不是两处**:`/api/wf/smart-storyboard` 内部会按需先跑一次理解步。那一步真生成时
  与独立端点是同一个闭环,回流也该有;复用未过期理解时它整段不执行,自然不重写(同 `fb` 键即便重写也只是原地更新,
  但"没重新算就不该刷时间戳")。CLI `episode.generateStoryboard` 走的正是这条链,冒烟里能看到两条一起出现。
- **提取主体为什么挂在命令层而不是端点**:`/api/wf/extract-subjects` 是本槽四步里唯一**只出候选、不写回 state** 的端点
  ——入库口径归调用方(浏览器解析向导按用户勾选合并,CLI `exec` headless 全量合并)。
  端点那里根本没有"入库了几位"这个数,回流只能挂在入库那一步。两端因此落在 `js/commands.js` 与 `cli.js`,
  仍是同一份 `WfCore` 派生。
- **CLI 侧为什么动了 `withProject`**:`cli.js` 的提取主体经 `withProject` 把项目改动推回服务端,
  而记忆桶不在 `changes.projects` 里、在 meta 桶。给 `withProject` 加一个**可选**第四参 `memFeed(proj)`,
  返回的条目随**同一次** `PUT /api/state` 挂 `changes.meta`(与 `memory add`、`CMD.release` 同通道)。
  不传就一行不走,既有全部调用方行为不变。放在 `withProject` 里而不是外面写一次,是因为 409 冲突重试要
  **按最新 state 重建 meta**——写在外面的话,重试那一轮会拿旧 `agentMemory` 覆盖掉别处的并发写入。
  有一条断言直接数 `EXEC['project.extractSubjects']` 段里 `await PUT|GET|POST(` 仍为 1。

## 4. 记账

SK-26 的 `steps` 从 1 条补到 5 条——**只登记有领域命令出口的那些步**:

```js
{ cmd: 'project.extractSubjects',    … 主体板块 }
{ cmd: 'project.splitEpisodes',      … 剧本板块 }
{ cmd: 'episode.understanding',      … 导演板块 }
{ cmd: 'episode.generateStoryboard', … 分镜板块 }
{ cmd: 'episode.smartReview',        … 成片板块(W43 那条,一字未动) }
```

发布留痕两端仍在命令注册表之外,`steps` 里照旧**没有**它——命令化归 `G-12`,`note` 里原样写着。
`pending` 早在 W43 就清空了,本槽不动;`gaps: ['G-11','G-02']` 原样保留(`gaps()` 只投影 `gaps` 字段,
落地不摘标记是本目录的关联索引口径);`cmds` 仍由 `steps` 推出,自动从 1 条变 5 条。

SK-04 的第三处余量按实况**改写而非删除**——这是本目录一贯的做法,清账不等于假清:

> 自动沉淀本轮结论现覆盖主线六个闭环:审片、发布,加前段四步……
> **仍欠一处覆盖余量**:生成与合成两步没有可判定的结构化结论可回流(素材产出的判定面归发布门 G3/G7),
> 浏览器剧本解析向导走自己的入库路径,提取主体的回流只挂在命令层

三处余量逐一说清:

1. **生成与合成不回流是判断,不是漏做。** 这两步的产出是素材(视频文件、成片),
   跑完手里只有"成功 N 个失败 M 个"——这个数问题中心与发布门 G3/G7 已经在实时判,回流一份只是噪音副本。
   要回流得先有**质量面**的结构化结论,而那正是审片步在做的事(已回流)。
2. **浏览器解析向导另有入库路径。** 向导按用户勾选合并主体,不经 `Commands.execute`,故那条路仍不回流。
   补它要先把向导的入库收口到命令层(那是解析向导自己的重构),本槽不顺手改别人的路径。
3. **提取主体的回流只在命令层**:端点侧永远不会有,除非改端点让它写回 state——那会改掉
   "只出候选不写 state"这条既有契约,不在本槽范围。

`gaps()` 键数、`preflightStages()`、`Skills.check` 各面结论数、`block()` 拼块:逐项未动(本槽一条校验项也没加)。
`playbooks()` 不变(SK-26 早在 W43 就进了)。

## 5. 断言与变异验证

| 层 | 新增 | 钉住什么 |
|---|---|---|
| `tests/unit.js` memory 套件 +7(19 → 26,全套 **398 → 405**) | 四支派生各一条 | 逐字段:六维产出数与缺的维名取 `UND_DIMS` 形状、镜数/时长/两处缺口、集数/模式/最长集/超长集、新增/已有/库存/缺参考图;各支"判定输入取不到"一律回空(回退模板、零镜、零集、空主体库) |
| | 四键幂等 | 四条各占一个 `fb` 键、反复闭环原地更新不双写、四条各自能被**同板块** `memRecall` 取回 |
| | 六处接线(源级) | 六个调用方都委托 `WfCore.memFeedback/memWrite`、**都不得内联回流文案**(四段文案在 `wf-core` 各只出现一次)、浏览器四处落 `Store.state.agentMemory`、服务端五处落 `tree.agentMemory`、CLI 走 `meta.agentMemory`、**回流点按端点切片逐个判在落盘之前**、CLI 仍只发一次请求 |
| | 行为面(浏览器真跑) | `Understanding.regen` 与 `Commands.execute('project.extractSubjects')`:桶里真的多出那一条、能被同板块召回、再跑一次仍是 1 条、**失败不写** |
| `tests/integration.js` +8(**105 → 113**) | 三个端点真打 | 理解/分镜/拆集各回流一条且板块正确、文案里的数字与实际产出对得上、同集重复分镜与同项目三次拆集只更新不双写(`mode` 记最后一次)、404/400 之后桶里条数不变、落点仍是既有 `state.agentMemory`(state 顶层键未新增) |
| `tests/cli.smoke.js` +7(**80 → 87**) | 全程 headless | 跑完四步后 `memory list` 里四条各归导演/分镜/剧本/主体、提取那条文案里四个数都是数字、拆集那条只留最新一条(`even`)、四条都能被同板块 `--recall` 取到、同项目重复提取只更新不双写、**blocked 项目一条不写** |

**变异实测**(逐个改完跑相应套件,验证后原样还原,`git diff` 为空):

| 变异 | 实测行为 | 转红 |
|---|---|---|
| **只在浏览器写**(摘掉 `server.js` 四处 + `cli.js` 的 `memFeed`) | headless 用户一条也回流不到 | unit 1(源级接线)+ integration 4 + cli.smoke 6(79/87,比基线多 6 项) |
| `memWrite` 不按 `fb` 找位(改成一律追加) | 反复闭环把桶越跑越满 | unit 4 + integration 3 |
| 理解支放行 `fallback` 模板 | LLM 失败的回退模板被当成理解结论回流 | unit 1(派生) |
| 服务端拆集回流移到 `wfSave` 之后 | 回流结论不落盘(静默丢) | unit 1(源级位置)+ integration 1 |
| 摘掉浏览器 `understanding.js` 的 `memBack` | 浏览器理解闭环不回流 | unit 1(行为面) |

第四条变异第一次跑时**只有 integration 红、unit 源级断言仍绿**:原写法整文件搜 `const rev = wfSave(...)`,
写入点挪到落盘之后,它捞到的是**后面别的端点**那次 `wfSave`,`j > i` 照样成立。
已改成先按 `pathname === '/api/wf/...'` 切出端点片段再判位置,并顺带补上分镜端点内部理解步那一处;
重跑该变异 unit 如实转红。

## 6. 回归数字

| 套件 | 本槽 | 基线(`w57`,同机取) |
|---|---|---|
| `node tests/unit.js` | **405 / 405** | 398 / 398(净 +7 用例,memory 套件 19 → 26) |
| `node tests/integration.js` | **113 / 113** | 105 / 105(净 +8) |
| `node tests/cli.smoke.js` | **85 / 87** | 78 / 80(净 +7;失败两项逐项相同) |

`cli.smoke` 那 2 项失败(`未登录 whoami → exit 3`、`llm --json mock 链路`)现开 `master` 工作树取证,
逐项同名同现象,与本槽无关。

`node --check` 过:`js/wf-core.js`、`js/understanding.js`、`js/sb-llm.js`、`js/proj-upload.js`、`js/commands.js`、
`js/skills.js`、`server.js`、`cli.js`、`mcp.js`、`tests/unit.js`、`tests/integration.js`、`tests/cli.smoke.js`。
文档同步:`README.md`(单元/集成/冒烟三个数、四个 wf 端点的行为描述、memory 套件覆盖面)、
`mcp.js` 的 `hujing://memory` 资源描述、`cli.js` 的 `memory` 命令头注释、本目录 README 的索引行与摘要。

## 7. 交接

1. **SK-26 到此不再有"某步不回流"的欠账**,但 `gaps` 两条仍开:
   - **G-11**:回流条目蒸馏进专家 `persona` 仍要人去专家库点「🧠 从使用记录进化」,
     且 `evolveExpert` 只对自定义专家开放、读记忆时**不按 `scope` 过滤**。本槽把回流条目从 2 类扩到 6 类,
     这处不过滤的影响随之变大(导演板块的六维缺口会混进分镜专家的蒸馏输入)。
     要接:蒸馏按板块取(`memRecall(mem, '', board)` 现成),并给预置专家一条"进化落到自定义副本"的入口。
   - **G-02** 与发布留痕的命令化(**G-12**)同 W43,未动。
2. **SK-04 剩三处余量**(第 4 节已逐条说明理由):生成/合成两步无结构化结论可回流、
   浏览器解析向导的入库路径不经命令层、提取主体的回流只在命令层。前两条要动别的模块,不是回流面自己的事。
3. **回流条目现在会进六个板块的提示词**。审片提示词多一段这件事 W43 已经说过;
   本槽之后,导演/分镜/剧本/主体四个板块的提示词在"跑过一次之后"同样会多出一段。
   若要在记忆弹窗里把回流条目与用户手写条目做展示区分,`fb` 字段仍是现成判据(现在能区分出六类)。
4. **`withProject` 的 `memFeed` 是通用口子**。后续任何"CLI 侧改项目 + 顺带回流"的步都可以直接传第四参,
   不必再各自拼 meta 桶;它已经处理了 409 重试时按最新 state 重建这件事。
5. **未合并 W58–W60**。本槽叉自 `w57` 且只碰上表那几个文件,与那三支若有重叠,
   冲突面预计在 `js/skills.js` 的 `note`、`README.md` 的三个数字与 `tests/*.js` 的套件尾部——
   `note` 与数字两侧都会是各自分支上的旧实况,正确值只能由合入后 live 实测给出(同 W55/W57 的解法)。
