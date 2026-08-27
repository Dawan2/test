# W2 · 知识库取用面接线(KB.SECTIONS 零消费 + 压缩块双份措辞)

> 处置对象:`w1-pipeline-skill-map.md` 的 **G-15**(`KB.SECTIONS` 零消费、压缩块与条目正文两份措辞)与
> **G-08**(硬编码知识注入点改经索引取块)在 `js/knowledge.js` 侧的部分;
> 波次归属见 `w1-architecture-spec.md` 第 3 节 W2 第 2 项、`w1-selected-skills.md` 的 SK-01 / SK-09 / SK-17 / SK-19 / SK-27。
> 基线 `master @ 9adcf0f`。本文只记**改了哪些消费点**,不复述方法论正文。

## 1. 改动前的问题(三处)

| # | 问题 | 证据 |
|---|---|---|
| 1 | `KB.SECTIONS` 零消费 | 全仓 `rg 'KB\.SECTIONS'` 仅 `js/knowledge.js` 定义处 1 命中,无任何读取方 |
| 2 | 注入点绕过取用面 | `wf-core.sbSystem` / `beatboard` / `proj-shell` 直接拼 `KB.DR_SHOT + KB.DR_AXIS` 形态的原始属性,键位不可索引 |
| 3 | 正文被复制成第二/第三份措辞 | `KB.block()` / `KB.reviewBlock()` 函数体内手写压缩段;`agent.js` 的 `KB_SEEDS` 又手抄了 5 段压缩版进长期记忆 |

第 3 项的实际风险:改一条 `KB` 条目,压缩块与记忆种子不会跟着改,同一口径在提示词里出现互相矛盾的两种说法。

## 2. 改动后的取用口径

```
KB.SECTIONS            17 条条目的唯一取用面(键即取用键),值 = 条目正文(唯一权威)
KB.section('键')       取一条正文
KB.pick('键','键')     取多条并拼接(注入点用法)
KB.DIGESTS.sys/.review 压缩摘要表,键与 SECTIONS 同名;两处压缩块的唯一文本来源
KB.block()/reviewBlock() 只按键拼装 DIGESTS,函数体内不再写正文
```

`DIGESTS` 保留"压缩措辞"这一层是有意的:助手系统提示词与审片评分口径都要控字数(~500 / ~400 字),
不能把 17 条正文整搬进去。与改动前的区别是——摘要现在**按键与条目挂在同一张表里**,
注释写明"条目正文为准,改条目须回本表同键校对",且 `contract` 套件断言键位不失配、摘要不外流。

## 3. 消费点清单(逐点)

| 消费点 | 改动前 | 改动后 | 输出变化 |
|---|---|---|---|
| `js/wf-core.js` `W.sbSystem`(拆镜系统人设,浏览器/服务端/CLI 共用) | `KB.DR_SHOT + KB.DR_AXIS` | `KB.pick('景别运镜', '轴线匹配')` | 逐字节不变 |
| `js/beatboard.js` AI 拆解节拍板 | `KB.WR_STRUCTURE + KB.WR_FACESLAP` | `KB.pick('六阶段结构', '打脸四步')` | 逐字节不变 |
| `js/proj-shell.js` AI 发行文案包 | `KB.WR_HOOKS + KB.WR_PAYOFF` | `KB.pick('钩子六型', '付费卡点')` | 逐字节不变 |
| `js/knowledge.js` `KB.block()`(agent.js / agent-global.js 系统提示词) | 函数体内手写三域压缩段 | 按键拼 `DIGESTS.sys` | 逐字节不变(已比对) |
| `js/knowledge.js` `KB.reviewBlock()`(`js/review.js` + `server.js` 审片端点) | 函数体内手写四行评分口径 | 按键拼 `DIGESTS.review` | 逐字节不变(已比对) |
| `js/agent.js` `memAll` 的 `KB_SEEDS`(长期记忆知识种子) | 5 段手抄压缩版正文 | 按键取正文:`钩子六型` / `打脸四步+付费卡点` / `对话铁律` / `景别运镜+场面调度+剪辑节奏` / `抽卡军规+抽卡公式` | 种子文本改为条目正文;带 `kb` 键标识,条目改动后同键沉淀自动跟随;老数据已沉淀过的不重复种(用户既有条目不动) |
| `js/agent.js` `BOARD_KB` → `js/agent-global.js` 板块 Agent 系统提示词(新增) | 无(下列条目全库无注入点) | 板块就位时整条注入:剧本=`反转五式`/`人物体系`/`剧本诊断`、主体=`主体参考`、分集=`六阶段结构`、分镜=`轴线匹配`/`多镜头写法` | 板块 Agent 提示词新增本板块方法论块(行为变更,单独 commit) |

主线其余 LLM 注入点未改口径:`server.js` 审片端点经 `KB.reviewBlock()` 取块(与浏览器同一份文本),
`review.js` 的离线本地检查仍是本地词法判定(不注入正文),`sb-llm` / `understanding` 的提示词由 `Prompts` 注册表管,不涉知识库正文。

## 4. 条目消费覆盖(17/17,无零消费条目)

| 条目键 | 取用通道 |
|---|---|
| 编剧八律 | `DIGESTS.sys` |
| 六阶段结构 | 节拍拆解 `KB.pick` · `BOARD_KB.分集` |
| 钩子六型 | 发行文案 `KB.pick` · 记忆种子 · `DIGESTS.review` |
| 反转五式 | `BOARD_KB.剧本` |
| 打脸四步 | 节拍拆解 `KB.pick` · 记忆种子 · `DIGESTS.sys` · `DIGESTS.review` |
| 付费卡点 | 发行文案 `KB.pick` · 记忆种子 · `DIGESTS.sys` |
| 对话铁律 | 记忆种子 · `DIGESTS.sys` |
| 人物体系 | `BOARD_KB.剧本` |
| 剧本诊断 | `BOARD_KB.剧本` |
| 场面调度 | 记忆种子 · `DIGESTS.sys` |
| 景别运镜 | 拆镜人设 `KB.pick` · 记忆种子 · `DIGESTS.sys` · `DIGESTS.review` |
| 轴线匹配 | 拆镜人设 `KB.pick` · `BOARD_KB.分镜` |
| 剪辑节奏 | 记忆种子 · `DIGESTS.sys` |
| 抽卡公式 | 记忆种子 · `DIGESTS.sys` |
| 抽卡军规 | 记忆种子 · `DIGESTS.sys` · `DIGESTS.review` |
| 多镜头写法 | `BOARD_KB.分镜` |
| 主体参考 | `BOARD_KB.主体` |

同一提示词内不重复注入:分镜板块的 `景别运镜`/`场面调度`/`剪辑节奏` 由记忆种子承担,故不进 `BOARD_KB.分镜`。

## 5. 验收

`node --check` 通过改动的每个 js 文件;`node tests/unit.js` 206/206;`node tests/integration.js` 79/79;
`node tests/cli.smoke.js` 51/53(2 项失败在 `master` 同样失败,与本改动无关)。

`tests/unit.js contract` 新增 5 条断言(逐条做过变异验证——把改动改回原样会红):

1. 条目正文与压缩摘要只在 `js/knowledge.js`,其余源文件(js/ 全量 + `server.js` / `cli.js` / `mcp.js` / `index.html`)出现第二份即失败。
2. `DIGESTS` 键 ⊆ `SECTIONS` 键;压缩块文本全部出自同键摘要;每条摘要在 `knowledge.js` 内只出现一次。
3. 消费方不得出现 `KB.WR_*` / `KB.DR_*` / `KB.GC_*` 原始属性引用。
4. 每个 `SECTIONS` 键都须有取用点(零消费条目回归)。
5. `WfCore.sbSystem()` 以 `sb.system` 提示词开头且整条含 `景别运镜`/`轴线匹配` 正文(按键取用后正文不缩水)。

行为等价证据:改造前后 `KB.block()` / `KB.reviewBlock()` 输出逐字节相同(用改动前版本的输出快照比对);
`WfCore.sbSystem()` 与 `WfCore.buildReviewPrompt()` 的知识块入参因此也逐字节不变。
唯一行为变更是第 3 节最后一行的 `BOARD_KB` 注入,已单独成 commit,可独立 revert。

## 6. 未做(留给后续波次)

- `js/skills.js` 注册表本身与 `Skills.block(stage, ctx)` 索引层:并行槽在写,本文只把 `KB` 侧做成"按键可取"的取用面,
  skill 层落地时直接引用同一批键即可,不需要再改这些消费点。
- G-07 词表归一、G-05 `tplVideo` 定性、`Prompts.REG` 收编内联提示词(G-13):不在本文范围。
- `agent-global.js` 里板块协作那句系统提示词在预排/主回复两处各写了一份(与知识库无关的既有重复),未合并。

## 7. 与并行分支的关系

- `origin/cursor/agent-flow-sota-analysis-736a` 做的是**人设/记忆经 ctx 过服务端**(G-01/G-02),未动 `js/knowledge.js`,
  与本文改动不重叠;该分支的 `js/wf-core.js` 改动片段把 `sbSystem` 那两行当上下文带进了 hunk,
  与本文改的同两行相邻,合并时 `js/wf-core.js` 会有一处**平凡冲突**——保留本文的 `KB.pick('景别运镜', '轴线匹配')`
  与该分支的 `buildSBUser` 注释即可(试合并已验证只此一处,`js/agent.js` / `tests/unit.js` 自动合并干净)。
- `js/skills.js`(W2 注册表)由并行槽落地,本文未创建也未改动该文件。
