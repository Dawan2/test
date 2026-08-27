# W6 · 周期 1 成果收敛记录(集成分支)

> 集成分支:`cursor/w6-integration-9f68`,基线 `master @ 9adcf0f`(二十三轮收尾)。
> 本文只记**收敛过程**:合入次序、每处冲突怎么解、合并后的实测数字、剩余分叉。各项功能本身的说明在各自落地文档里,本文不复述。
> 全程只解冲突与收敛双口径,不重做任何一条分支已落地的功能;所有合并均 `--no-ff`,一条分支一个合并提交,可逐条 revert。

## 1. 结果一句话

周期 1 的 **16 条分支全部收敛到一条集成分支**,合并后回归全绿:`unit 251/251`、`integration 89/89`、`cli.smoke 59/61`。cli.smoke 的 2 项失败在 `master` 上即失败(「未登录 whoami → exit 3」实得 exit=1、「llm --json mock 链路」),属环境态基线,**未通过删测或降低断言换绿**。

核验报告(`w5-cycle1-audit.md`)写"本周期没有任何一项达到 M4",本轮之后这句话对该分支不再成立:`docs/skills-wave/` 与 `js/skills.js` 都在集成分支上,主线七步在 `Domain.workflow` 里齐了。

## 2. 合入次序与逐步测试数字

次序按核验报告 4.1 执行,只有一处微调:核验时说"无远端分支"的 SK-13 与 G-04 在本轮开工时已推上远端,因此各自补进次序(SK-13 随 skills 栈,G-04 单列一步)。

| # | 合入 | 提交 | 冲突文件 | 合并后 unit | integration | cli.smoke |
|---|---|---|---|---|---|---|
| 1 | `w2-kb-sections-wiring-4df6` | `97cbccb` | 无 | 206/206 | 79/79 | — |
| 2a | `agent-flow-sota-analysis-736a` | `f092d1a` | `js/wf-core.js`(1 处) | 206/206 | 79/79 | — |
| 2b | `w3-g01-expert-persona-wf-a861` | `6c89eb5` | 7 文件 12 处 | 210/210 | 79/79 | 51/53 |
| 3 | `w3-g03-review-mainline-step-4325` | `9f4e8ec` | `README.md` `cli.js` `tests/unit.js` | 220/220 | 79/79 | 51/53 |
| 4 | `w4-g05-tpl-video-12b9` | `92bb331` | `js/wf-core.js`(1 处) | 223/223 | 79/79 | — |
| 5 | skills 全栈 `w4-sk13-consistency-8080`(含 `4c5d ⊃ 568b ⊃ 856f`) | `a37d8cb` | `README.md` `cli.js` `tests/unit.js` | 242/242 | 79/79 | 52/54 |
| 6 | `w3-g04-headless-front-mainline-f8b3` | `1fe5a8d` | `README.md` `js/cmd-registry.js` `tests/unit.js` | 251/251 | 89/89 | 59/61 |
| 7 | W1 七份文档 + G-02 复核件 + 核验报告 | `ee5b44e`…`cfee906` | 无 | 251/251 | 89/89 | 59/61 |

分支栈的祖先关系与核验报告一致(实测 `856f ⊂ 568b ⊂ 4c5d ⊂ 8080`),因此 skills 只合最末一条,不重复计数。

## 3. 冲突怎么解(逐处)

### 3.1 `personaNote` 两份实现 → 收敛成一份(核验报告 3.2)

这是全周期最重的一处。收敛规则:**签名取超集、服务端只留一条装配路径、记忆注入并存**。

| 面 | 合并前(两份) | 合并后(一份) |
|---|---|---|
| 装配函数 | `personaNote(ex)` / `personaNote(ex, board)` | `personaNote(ex, board)`,单参调用即旧行为 |
| 生效专家解析 | `ExpertsData.expertOf(hiredId, customs)` / `ExpertsData.allOf(customs)` | 两个都留:`expertOf` 改为 `allOf(...).find(...)`,合并口径只有 `allOf` 一处 |
| 浏览器装配口 | 三个委托点各自 `personaNote(hiredExpert())` | 唯一 `personaNoteFor(p, board)` |
| 服务端装配口 | 端点内直接调 | 唯一 `wfPersonaNote(tree, p, board)` |
| 记忆注入 `memText` | 只有 agent-flow 有 | 原样保留,与 `personaNote` 在同一个 ctx 里并存 |

三个浏览器委托点(`understanding.js` / `sb-llm.js` / `review.js`)与四个服务端 LLM 步的冲突块都按这张表逐处改写:取 G-01 的装配口 + agent-flow 的 `memText` 行。

**顺带收掉的第二条路径**:`/api/wf/agent`(agent-flow 新增的端点)原本仍在端点内直接 `personaNote(expertOf(...))`,这正是核验报告警告的"板块专家在部分端点静默失效"。本轮把它一并改走 `wfPersonaNote(tree, p, scope)`——`scope` 就是对话板块键,于是它的生效顺序与 `js/agent.js` 的 `gPersonaBlock`(下拉 > 板块 > 全局)同序。

契约断言随之改硬两条:调用点计数从 5 改为 6(1 定义 + 5 个 LLM 步),并新增 `server.js` 中 `WfCore.personaNote(` 出现次数必须为 0——将来谁再开第二条装配路径,测试先红。

### 3.2 知识库键词表分叉 → skill 层改走 `SECTIONS` 中文键(核验报告 3.4)

合并前:KB 接线分支把 `KB.SECTIONS` 的中文键(`钩子六型`/`景别运镜`…)确立为唯一取用面并加了源码扫描断言;skills 注册表用的是英文属性键(`WR_HOOKS`/`DR_SHOT`…)且经 `KB[k]` 下标取值,**扫描断言扫不到**。这类"能过测但纪律已破"的分叉本轮当场收掉:

- `js/skills.js` 全部 17 个 `kb` 引用键改为 `SECTIONS` 中文键;
- `Skills.block()` 从 `KB[k]` 改为 `KB.section(k)`,`Skills.validate()` 从 `typeof kb[k] === 'string'` 改为查 `kb.SECTIONS[k]`;
- 断言口径同步:全覆盖断言的被检集合从 `Object.keys(KB).filter(字符串属性)` 改为 `Object.keys(KB.SECTIONS)`,并**新增一条反向断言**——skill 层的 `kb` 键必须都在 `SECTIONS` 里,回到 `KB.WR_/DR_/GC_` 原始属性名即红。

注入块文本逐字节不变(`Skills.block('shots', …)` 仍等于 `KB.pick('景别运镜','轴线匹配')`)。

### 3.3 审片步骤:注册表里的 `wfStep: false` 已经过期

`js/skills.js` 的 `STAGES` 把 `review` 标为 `wfStep: false` 并注"待 G-03";G-03 在本轮第 3 步已合入,`Domain.workflow` 里就有 `review` 步了。若照原样合并,注册表会带着一条与主干矛盾的坐标(`validate` 只查"声明为工作流步骤的必须在 workflow 里",反向不查,所以不会红)。本轮改为 `wfStep: true`,并把断言从"review 须如实标注为非工作流步骤"改成"七步应全部标为主线步骤"。

### 3.4 CLI 一键成片:两套审片语义合成一套

`cli.js` 的 `episode.produce` 上,agent-flow 加了「审→改→重抽→复审」闭环(`reviseLowShots` + `maxRetry` 轮),G-03 加了「缺审片不静默通过」(关闭时 `skipped`、无结论时 `blocked`)。两者改的是同一段,合并后:

- `smartReview === false` → 登记 `skipped`(与浏览器 `commands.js` 同语义:用户显式关闭,如实记录但不阻断);
- 否则进闭环:首审 → 逐镜修订 → `shotIds` 子集重抽 → 子集复审,循环 ≤ `maxRetry`;
- 循环结束仍有低分镜 → `needs_human`;审片未产出结论(`rv.result.avg` 非数值)→ `blocked` / `review-unavailable`,仅 `riskyCompose` 放行。

即闭环负责"尽量修好",G-03 的两个如实登记负责"修不好也不许装作修好了"。

### 3.5 领域命令新增后,skill 索引的全覆盖断言

契约断言要求"全部领域命令都被 skill 索引引用"。命令数在本轮从 8 涨到 11(agent-flow 的 `subject.generateImage`/`project.extractSubjects`,G-04 的 `project.splitEpisodes`),断言两次转红,按归属补登记:

- `subject.generateImage` → SK-11(主体参考纪律,与发布门 G9 一键处置同入口);
- `project.extractSubjects`、`project.splitEpisodes` → SK-16(主线前段编排);
- 三条同时补进 SK-05(该条自述"登记命令全面")。

**只登记 `cmds` 引用,没有动 SK-16 的 `steps`**:把拆集与主体提取前置进编排会改 `Skills.playbook('eps.frontPipeline')` 的产出,属功能变更而非冲突收敛,留作后续(见第 5 节)。

### 3.6 其余平凡冲突

- `js/wf-core.js` 三处、`js/cmd-registry.js` 一处:同一行注释各自改了一半(KB 取用口径 / ctx 字段清单 / 命令条数),取并集即可,行为无关。
- `tests/unit.js` 三处:两侧各自在同一位置追加测试块与套件,全部**保留双方**;G-04 与 skills 栈都新增了名为"套件 19"的段,把 G-04 的改名为"套件 20",`SUITES` 表合并为同时含 `skills` 与 `split`。
- `README.md` 六处:按段落逐句合并(API 表取两侧新增行的并集,架构树两段并列,命令总览取全量);**没有一处是"择一丢弃"**。
- `js/experts-data.js`:`allOf` 与 `expertOf` 并存,后者改为复用前者,合并口径仍只有一处。

## 4. 合并当场做完的四件收敛(核验报告 4.2)

| 要求 | 落地 |
|---|---|
| `personaNote` 收敛为一份,服务端单一装配路径 | 见 3.1,含 `/api/wf/agent` 的第二条路径;两条契约断言锁住 |
| 定编号规则 | `G-01…G-15` **冻结**,新缺口一律 `S-xx`:判定标准文档提议的 `G-16`(发布后→上游回路)改记为 `S-08` 并补进短名单第 7 节;`docs/Agent贯通落地-G1-G5.md` 的 `G1–G5` 在目录 README 里标明是历史编号、与 `G-0x` 不是同一套 |
| 定知识库取用键 | skill 层改走 `SECTIONS` 中文键,一套键;见 3.2 |
| README 断言数重算 | `163`(master 上的旧数)→ 实测 **251**;`cli.smoke` 60 → 61;可单套件运行的套件表补齐 `contract\|skills\|tasks\|split` |

另外补齐了核验报告 2.4 指出的索引失真:`docs/skills-wave/README.md` 的索引表从 2 行补到 19 行(周期内全部文档 + 本文),并加了"缺口编号"与"动工前先看剩余分叉"两条阅读约定。

## 5. 剩余分叉(本轮**没有**做的事,按优先级)

1. **`wf-core` 记忆套件缺直接断言**。`WfCore.memRecall/memBlock` 是当前唯一"实现存在但零直接单测"的模块(核验报告 2.18、`w3-g02-memory.md` 第四节)。本轮按"只解冲突不加功能"的口径未补,但它现在是主干上最薄的一处,建议下一轮第一件事就补(该文第四节已给出 5 条建议断言)。
2. **SK-16 编排未含前段两步**。拆集与主体提取的领域命令都已就位,但 `eps.frontPipeline` 的 `steps` 仍是「理解 → 分镜」两步。补进去会改 playbook 产出,需配自己的断言,单列一轮。
3. **记忆召回输入偏弱**。理解与分镜两步传的是 `ep.title`,关键词加权分支几乎不命中(`w3-g02-memory.md` 第四节第 3 条)。改成正文摘要会改提示词字面,需配 fixture,单独提交。
4. **`tplReview` 两端取值不一致**。浏览器读并入默认值、服务端读原值,两端差一行(`w4-g05-tpl-video.md` 第 8 节如实登记)。会动审片提示词现网口径,单列一轮。
5. **G-07 词表归一无人认领**。整个周期 `js/camera.js` 零改动(核验报告 2.4)。并行槽若正在改 camera 词表,以其为准,本分支不占这个文件——本轮合入的分支里没有一条碰过它,rebase 无冲突面。
6. **S-06 成片字幕质检**未开工(SK-28)。并行槽若正在做,同样与本分支无文件重叠(本轮没有任何一条分支改 `js/sb-io.js` 的 SRT 产出)。
7. **资产盘点与资产图谱约六成重叠**(核验报告 2.5)。两份都带行号,代码一漂移要同时改两处。本轮只把两份都归了档并在索引里分了工("盘点"查四端加载矩阵与键位、"图谱"查缺口),没有做合并删减。
8. **`S-08` 尚无关联入选项**。编号已登记,能力本身还没进短名单的 30 条,需要下一轮决定做还是明确拒绝。
9. **`master` 上的两项 cli.smoke 失败**原样保留:「未登录 whoami → exit 3」实得 exit=1、「llm --json mock 链路」。属基线环境态,不在本轮收敛范围,也不用删测换绿。

## 6. 复核方式

```
git checkout cursor/w6-integration-9f68
node --check js/wf-core.js js/skills.js js/experts-data.js js/experts.js js/knowledge.js \
             js/review.js js/sb-llm.js js/understanding.js js/cmd-registry.js server.js cli.js mcp.js tests/unit.js
node tests/unit.js          # 251/251
node tests/integration.js   # 89/89
node tests/cli.smoke.js     # 59/61(2 项与 master 同样失败)
```

`node tests/e2e.js` 按仓库纪律未跑(需用户明确要求)。每一步合并都是独立的 `--no-ff` 合并提交,想回退某一条分支的话 revert 对应的那个合并提交即可,不影响其余。
