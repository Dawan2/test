# W7 · 周期 2 第 7 波收敛记录(后继集成分支)

> 集成分支:`cursor/w7-integration-fa8a`,基线 `cursor/w6-integration-9f68 @ e1074f7`。
> 与 W6 同样只记**收敛过程**:合入次序、每处冲突怎么解、合并后的实测数字、剩余分叉。
> 各项功能本身的说明在各自落地文档里,本文不复述。全程只解冲突,不重做任何一条分支已落地的功能;
> 所有合并均 `--no-ff`,一条分支一个合并提交,想回退某一条 revert 对应的合并提交即可。

## 1. 结果一句话

**4 条分支全部收敛**,合并后回归:`unit 280/280`、`integration 93/93`、`cli.smoke 62/64`。
cli.smoke 的 2 项失败在 `master` 上即失败(「未登录 whoami → exit 3」实得 exit=1、「llm --json mock 链路」),
与 W6 记录的是同两项,**没有通过删测或降低断言换绿**。

开工时任务单只点了两条(景别运镜词表、字幕质检),并注明并行的 `extractSubjects-wf` 与 `audioMeta`
「若已 push 也一并合」。第一次 `git fetch` 时那两条确实还没有远端分支;合完前两条再 fetch 时两条都已推上,
因此本轮实际合了 4 条,不必留到下一波。

W6 收敛记录第 5 节列的剩余分叉第 1 项(`WfCore.memRecall/memBlock` 缺直接断言)在本轮一并补掉,见第 5 节。

## 2. 合入次序与逐步测试数字

次序按「先动共享底座、再动其上的消费面」排:词表下沉 `wf-core` 影响面最广故排头,
字幕质检落在 `js/skills.js`(其祖先已在 W6 里)排第二,两条并行分支排后两位。

| # | 合入 | 合并提交 | 带进的提交数 | 冲突文件 | unit | integration | cli.smoke |
|---|---|---|---|---|---|---|---|
| 1 | `w4-shot-size-glossary-654e`(G-07 机位词表归一) | `9aeb039` | 4 | `README.md`、`docs/skills-wave/README.md`、`tests/unit.js` | 257/257 | 89/89 | 59/61 |
| 2 | `w4-film-caption-check-e5c7`(SK-28 字幕质检,闭合 S-06) | `7a56b94` | 6 | `README.md`(3 处) | 265/265 | 89/89 | 60/62 |
| 3 | `w6-extract-subjects-wf-320d`(提取主体接入 wf 通道) | `75e6890` | 2 | `README.md`、`tests/unit.js` | 266/266 | 93/93 | 62/64 |
| 4 | `w4-audio-meta-fc27`(配音渲染清单单源) | `bf32966` | 5 | `js/storyboard.js`(1 处) | 274/274 | 93/93 | 62/64 |
| — | 补记忆套件 + 对齐口径数字 | `0aedf34` | — | 无 | 280/280 | 93/93 | 62/64 |

**祖先关系实测**(决定「带进的提交数」,避免重复计数):

- `w4-sk13-consistency-8080 ⊂ w4-film-caption-check-e5c7`,而 8080 已是 W6 的第 5 步合入,
  所以第 2 步只带进 8080 之后的 6 个提交(SK-28 那一段),skills 全栈不重复合。
- `w6-extract-subjects-wf-320d` 的基线是 W6 的第 3 个合并提交 `9f4e8ec`,所以第 3 步只带进其后的 2 个提交。
- `w4-shot-size-glossary-654e` 自己 merge 过 `w1-pipeline-skill-architecture-b688` 与
  `w2-kb-sections-wiring-4df6`(两条都已在 W6 上),所以它的有效增量只是最后 4 个提交。
- `w4-audio-meta-fc27` 直接基于 `master`,无重叠祖先。

W6 记录第 5 节曾预判「G-07 与 S-06 两条并行槽与本分支无文件重叠,rebase 无冲突面」。
实测**代码文件确实零冲突**,冲突全部落在 `README.md` / `docs/skills-wave/README.md` / `tests/unit.js`
这三个「谁都要往里加一段」的文件上,加上第 4 步一个导出清单。这条预判成立。

## 3. 冲突怎么解(逐处)

本轮共 **10 处**冲突,其中 9 处是同一形态:两侧在同一位置各自追加内容(或一侧是超集),
取并集 / 超集加增量即可。只有 1 处(`docs/skills-wave/README.md` 的「一分钟摘要」)需要判断取哪一份
并**丢弃对侧**。逐处如下。

### 3.1 `README.md` 架构树:`js/wf-core.js` 一段被两侧各写了一半(第 1 步)

W6 侧写的是模板三件套填充与剧本拆集并入,词表分支写的是「兼任机位词表单源」。两段说的是同一个模块的
不同职责,不是二选一——按同一模块合成一段(wf-core 的三段职责并列),紧随其后的 `js/skills.js` 段落原样保留。

### 3.2 `docs/skills-wave/README.md` 两处:一处取并集,一处**取 HEAD 丢弃对侧**(第 1 步)

这是本轮唯一需要判断的地方,记清楚为什么:

| 冲突段 | 两侧内容 | 解法 |
|---|---|---|
| 索引表 | HEAD 是 W6 补齐的 19 行全量表;词表分支只有 3 行(它开工时的表还很短),其中 `w2-kb-sections-wiring` 一行两侧都有、措辞不同 | 取 HEAD 全量表 + 补 `w4-shot-size-glossary` 一行;重复的那一行留 HEAD 版(表内「什么时候看」一栏的行文风格统一) |
| 「一分钟摘要」 | HEAD 是 W6 改写过的**收敛后**版本(标题就是「周期 1 收敛后」);词表分支带的是**收敛前**的旧摘要(还在说「主线七步只有六步」「专家人设只在浏览器生效」) | 取 HEAD,只把对侧真正是新事实的一条(词表分叉已收口)并进去。对侧其余 5 条是已经被 W6 推翻的旧描述,原样合并会让这份摘要自我矛盾 |

即:**丢弃的是过期陈述,不是任何一条落地内容**。

### 3.3 `tests/unit.js` 三处:全部保留双方(第 1、3 步)

两侧都在同一个套件数组的末尾追加测试块,冲突块的边界正好切在「HEAD 最后一个块的收尾」与
「对侧第一个块的开头」之间。解法是把那一行收尾补回去、两批块前后相连,一条断言都不丢:

- 第 1 步:HEAD 的 tplVideo 三块 + 词表分支的 6 块;
- 第 3 步:HEAD 的 skills 四块 + 提取主体分支的 1 块。

### 3.4 `README.md` 三处:HEAD 是超集,只把对侧的增量嵌进去(第 2 步)

字幕质检分支的基线比 HEAD 旧(它没有 W6 后半段的 splitEpisodes / generateImage / extractSubjects
与审片 skipped/blocked),所以三处都不是对称冲突,而是「HEAD 超集 + 对侧一条新增量」:

- **skill 索引段**:补 SK-28 的落地口径与「字幕切段与截断线同理现取 `Domain`」一句,校验项计数两条→三条;
  KB 那一句保留 HEAD 的「`SECTIONS` 是唯一取用面」(对侧带的是 W2 收敛前的「全库名→文本平表」旧说法)。
- **协同层段**:领域命令清单保留 HEAD 超集,只把 `preflight` 回执改成三条校验项;
  问题中心低危项补「成片字幕读不顺」与它的 `Skills.check('film',…)` 推导来源。
- **回归测试段**:顺带修回两处 W6 遗留——① W6 合并时把 `skills.js` 套件的覆盖说明整段丢了
  (被 `split` 套件那段顶掉),本轮取对侧含 SK-28 的版本补回;② 有半句「可单套件运行:…」被重复贴了两遍,删掉前一份。

### 3.5 `js/storyboard.js` 的 `window.SB` 透出清单(第 4 步)

两侧各加一个成员(HEAD 的 `tplVideoOf`、配音分支的 `markOfflineAudio`),取并集,一行的事。

### 3.6 一处非冲突但必须动的:cli.smoke 的限流窗口

第 3 步合完,`cli.smoke` 冒出两条**新**失败:「`exec project.splitEpisodes` 标记切分」实得
exit=5 且错误是「请求过于频繁,请稍候」,紧随其后的「已有分集未授权 → blocked」跟着连带失败。

排查结论是**测试节奏问题,不是功能回归**:`server.js` 的 `rateLimitOk` 对单用户限「并发 ≤4、每秒 ≤2 次」,
而提取主体分支新增的两条 `exec project.extractSubjects` 冒烟与上文的 `episode.generateStoryboard`
同为 `/api/wf/*` 端点,和紧随其后的 `splitEpisodes` 三次落进了同一个 1 秒窗口。

G-04 那段本来就为自己的三次调用配了 `await sleep(1100)` 并注了「wf 端点限流:单用户每秒 ≤2 次」,
本轮沿用同一手法,在进入该段前补一次 `sleep(1100)`。**断言与预期一字未改**,只改到达时机;
补完 `cli.smoke` 回到 62/64(只剩 master 的两项)。

## 4. 本轮顺带对齐的口径数字与注释(不动行为)

合并后有几处陈述性文字与代码不符,按仓库纪律(注释与文档跟代码行为一致)一并改直,集中在 `0aedf34`:

| 处 | 改前 | 改后 | 依据 |
|---|---|---|---|
| README 单测断言数 | 251 | **280** | 实测 |
| README integration 断言数 | 89 | **93** | 实测 |
| README cli.smoke 断言数 | 61 | **64** | 实测 |
| README 可单套件运行表 | 缺 `memory` | 补 `memory` 与该套件覆盖说明 | 本轮新增套件 |
| README「skill 索引覆盖…8 条领域命令」 | 8 | **11** | `CmdRegistry.names()` 实测 11 条 |
| `tests/unit.js` 同处注释 | 「命令 10 条」 | 「命令 11 条」 | 同上(断言本身是动态全覆盖,只有注释失真) |
| README「审片如实标注 `wfStep:false`」 | 说还没进 workflow | 改为 G-03 后七步全 `true` | W6 已把 `STAGES` 与断言改真,这句 README 留在了改前 |
| `js/skills.js` SK-23 的 `note` | 「STAGES 里 review 的 wfStep 现为 false」 | 陈述 G-03 已落地,并说明该条 `pending` 留的是注册表侧记账 | 同上,这条注释在 W6 上就与代码矛盾 |

SK-23 的 `pending: ['infra']` **数据本身没动**:去掉它会改 `Skills.gaps()` 的投影产出,属功能变更而非
冲突收敛,留作后续(见第 6 节)。

## 5. 收敛后补的断言:`WfCore.memRecall/memBlock` 记忆套件

W6 收敛记录把这里列为「主干上最薄的一处」——实现存在,但只有经 `evolveExpert` 的间接使用,零直接单测。
按 `w3-g02-memory.md` 第四节第 5 条给的 5 条建议逐条落,新增 `tests/unit.js` 的 **memory 套件 6 条**
(可单跑 `node tests/unit.js memory`)。**只新增,不改任何现有测试的断言与意图**:

| # | 断言 | 锁住的口径 |
|---|---|---|
| 1 | 召回顺序 | 同板块末 4 条在前、全局最近 3 条随后;不传板块时优先段为空,零关键词下只剩全局最近 3 条 |
| 2 | 加权补召 | 同板块被末 4 条挤出的旧条目仍经 `+3` 加权补召且**上限 3 条**;关键词按命中 token 长度排序,整条未命中且非本板块的不召回 |
| 3 | 去重按 `text` | 同文本重复沉淀只注入一次,注入块不出现两行同文 |
| 4 | 脏入参 | 非数组(`null`/字符串/数字/对象)、空数组、无 `text` 条目一律回空;`memBlock` 回空串——空串即「与未沉淀记忆时提示词逐字节一致」 |
| 5 | `memBlock` 字面 | 段头固定、每条 `- ` 前缀、自带前导换行,且是 `memRecall` 的逐条投影(不另排序不另截断) |
| 6 | 双端单源(源级) | 对话层 / wf 端点(≥4 处)/ CLI 全部委托 `WfCore`;`agent.js` 不得再内联召回算法;CLI `memory add` 与浏览器 `memRemember` 两端写入口(注释已标注是各写一份)的字段集、120 字截断、50 条上限须一致 |

断言的**咬合力当场验证过**:把 `memRecall` 的 `slice(-4)` 改成 `slice(-3)` 让 2 条转红,
改 `memBlock` 段头字面让 1 条转红,验证后原样还原(`git diff js/wf-core.js` 为空)。

第 2 条顺带把一个此前没写进任何文档的实现细节记下来:`sc += 3` 的同板块加权发生在 `filter(sc > 0)` 之前,
所以**同板块条目即使零关键词命中也会被补召**——被末 4 条挤出的旧条目会从队尾回来。这不是缺陷,
是「同板块记忆优先」的延伸,但读代码时容易看漏,故用断言固定住。

## 6. 剩余分叉(本轮**没有**做的事)

W6 第 5 节的 9 项里,本轮闭了 3 项:第 1 项(记忆套件,见上)、第 5 项(G-07 词表归一)、
第 6 项(S-06 字幕质检)。剩下的按优先级:

1. **SK-16 编排仍不含前段两步**。拆集与主体提取的命令都已就位、提取主体本轮还接上了 wf 通道,
   但 `eps.frontPipeline` 的 `steps` 仍是「理解 → 分镜」两步(实测 `Skills.playbook('eps.frontPipeline')`
   仍只回这两步)。补进去会改 playbook 产出,需配自己的断言,单列一轮。(W6 第 2 项)
2. **记忆召回输入偏弱**。理解与分镜两步传的召回输入仍是 `ep.title`,本轮新增的第 2 条断言正好把
   「关键词分支要靠输入里有实词才命中」这件事测明白了——现状是这两步几乎只吃「同板块末 4 条 + 全局最近 3 条」。
   改成正文摘要是一行改动,但会改提示词字面,需配 fixture,单独提交。(W6 第 3 项)
3. **`tplReview` 两端取值不一致**。浏览器读并入默认值、服务端读原值,差一行。会动审片提示词现网口径。(W6 第 4 项)
4. **SK-23 的 `pending: ['infra']` 与 G-03 已落地矛盾**。本轮只把注释改直,数据没动(改 `pending` 会动
   `Skills.gaps()` 投影)。同类记账收敛建议连同第 1 项一起做。
5. **资产盘点与资产图谱约六成重叠**,两份都带行号,代码一漂移要同时改两处。(W6 第 7 项)
6. **`S-08` 尚无关联入选项**,能力本身还没进短名单 30 条,需要决定做还是明确拒绝。(W6 第 8 项)
7. **`master` 上的两项 cli.smoke 失败**原样保留:「未登录 whoami → exit 3」实得 exit=1、
   「llm --json mock 链路」。属基线环境态,不在本轮收敛范围,也不用删测换绿。(W6 第 9 项)
8. **CLI 与浏览器的记忆写入仍是各写一份**。本轮第 6 条断言只是把两份钉在同一口径上(漂移即红),
   没有真的抽成共享常量;`memAll()` 的旧板块名迁移与知识库种子补种也仍只在浏览器发生
   (`w3-g02-memory.md` 第四节第 1 条),headless 用户的记忆里没有知识库沉淀条目。

## 7. 复核方式

```
git checkout cursor/w7-integration-fa8a
node --check js/wf-core.js js/skills.js js/domain.js js/storyboard.js js/camera.js js/review.js \
             js/sb-io.js js/issues.js js/store.js js/episode-util.js js/commands.js \
             server.js cli.js mcp.js tests/unit.js tests/cli.smoke.js
node tests/unit.js          # 280/280
node tests/unit.js memory   # 6/6(本轮新增套件单跑)
node tests/integration.js   # 93/93
node tests/cli.smoke.js     # 62/64(2 项与 master 同样失败)
```

`node tests/e2e.js` 按仓库纪律未跑(需用户明确要求)。
本轮未开 PR;4 个合并提交各自独立,revert 任一个不影响其余。
