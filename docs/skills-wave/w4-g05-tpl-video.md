# W4 · G-05 定性与落地:`settings.tplVideo` / 专家 `tpl.tplVideo`

> 缺口来源:`docs/skills-wave/w1-pipeline-skill-map.md` G-05(P1)「`settings.tplVideo` 写入即失效:雇佣/设置写入,零消费方」;
> 规格:`docs/skills-wave/w1-architecture-spec.md` W2 第 4 项「二选一,不得留『写入即失效』」。
> 基线:`master @ 9adcf0f`。

## 1. 结论(定性)

**接入,不是死字段。** `tplVideo` 从本轮起是「分镜画面提示词(文生视频提示词)的成型模板」,由浏览器与服务端**同一取值口径**注入智能分镜链路,并治理本地拼装出口。不做「文档写死字段」的那一支,理由见第 3 节。

一套口径,一句话表述:**平台自动成型的文生视频提示词,一律按 `settings.tplVideo` 成型;该键未设置时按原骨架拼装。** 雇佣风格专家会把专家的 `tpl.tplVideo` 写进该键,解雇/删除专家恢复默认——原有写入路径不变。

## 2. 动工前复核(缺口仍然存在)

以 `master @ 9adcf0f` 全仓库检索 `tplVideo`,命中只有**写入方与展示方**,无任何读取方:

| 位置 | 性质 |
|---|---|
| `js/gsettings.js` `DEFAULTS` / 全局默认值卡 / 专家工坊表单 | 默认值 + 表单读写 |
| `js/experts.js` `hireExpert`(写 settings)、`delCustomExpert`(恢复默认)、`FORGE_SYS`、`normExpertDraft` | 写入方 |
| `js/experts-data.js` 8 个风格专家的 `tpl.tplVideo` | 数据 |
| `tests/unit.js` | 断言写入 |

对照另外两件套:`tplImage` 有读取方(`js/episode-util.js` 主体图提示词、`js/persona.js` 八维重写参考模板),`tplReview` 有读取方(`js/review.js` → `WfCore.buildReviewPrompt`,服务端 `server.js` `/api/wf/smart-review`)。三件套里只有 `tplVideo` 是写入即失效,与设置页「注入各生成入口」的表述不符。

## 3. 为什么选「接入」而不是「写死字段」

1. 该键**有真实语义位置**:两个变量 `{style}`/`{shot}` 正是分镜画面提示词的构成,链路上就有承接点(逐镜 `s.prompt`),不需要为它造新概念。
2. 写「死字段」要么留着一个用户能编辑却无效的输入框(设置页 + 专家工坊都在收它),要么把它从雇佣三件套与设置页移除——后者会**削掉一个已经承诺给用户的能力**,并让专家工坊的 `tpl` 结构从三件套变成两件套,牵动 `FORGE_SYS` 提示词、`normExpertDraft`、专家数据 8 条、雇佣/解雇/删除三条写入路径与相应断言,改动面反而比接入大。
3. 接入后 `README` 关于「三套模板注入各生成入口」的描述才成立,不需要为一个键单开例外说明。

## 4. 落地点(消费方 3 处,装配注入 2 端)

模板填充是**双端单一来源**,放在 `js/wf-core.js`:

```
W.fillTplVideo(tpl, styleText, shotText)   // {style}=项目风格 {shot}=本镜内容;模板为空返回 ''
W.tplVideoNote(tpl, styleText)             // 拆镜要求行;模板为空返回 ''(拼在既有要求行尾,不留空行)
```

消费方:

| # | 消费点 | 作用 | 生效端 |
|---|---|---|---|
| 1 | `WfCore.buildSBUser`(拆镜 user 提示词) | 在五段式结构要求之后追加一行「文生视频提示词模板(每镜 prompt 须在五段式结构内落实以下要素)」,`{shot}` 以「本镜画面内容」示意 | 浏览器 + 服务端 |
| 2 | `WfCore.normalizeLLMShot`(逐镜规整) | 模型没给 `prompt` 时的兜底提示词按模板成型(模型给了就不覆盖) | 浏览器 + 服务端 |
| 3 | `SB.buildShotPrompt`(`js/storyboard.js`,新建/转换分镜提示词单一出口) | 本地拼装按模板成型;全局设定与负面约束仍在尾部 | 浏览器 |

装配注入(两端取值同源,不各自解析):

- 浏览器:`SB.tplVideoOf()` = `Store.state.settings.tplVideo`,`js/sb-llm.js` 在 `buildSBUser` 与 `normalizeLLMShot` 两处注入 `tplVideoText`。
- 服务端:`server.js` `/api/wf/smart-storyboard` 的 `ctxBase.tplVideoText = st.tplVideo || ''`,逐镜规整沿用同一值。
- CLI/MCP:`episode.generateStoryboard` 走的就是该端点,自动同口径,不另开取值口。

模板要求行与五段式结构**不打架**:模板给的是要素(风格/基调/运镜倾向),五段式给的是结构,要求行明确写了「在五段式结构内落实以下要素」。

## 5. 口径与兼容

- **取值不并浏览器 `DEFAULTS`**:两端都读 `settings.tplVideo` 原值。若浏览器用 `getSettings()`(并入 `DEFAULTS`)而服务端读原值,同一账号同一项目的两端提示词会差一行——那是新造的双端不一致。代价是:用户从未保存过偏好且未雇佣专家时该键为空,此时**不注入**,提示词与接入前逐字节一致;保存一次全局配置或雇佣一次风格专家即生效。
- **生成指纹不动**:模板作用在 `s.prompt` 的成型阶段,`s.prompt` 本来就在 `Domain.buildGenerationSignature` 的字段清单里,`shotInputHash`/判旧口径与 `Domain.buildVideoRequest` 均未改。存量已出片镜头不会因为本改动被判「素材已更新」。
- **不新增计费**:三个消费点都在既有链路内,沿用该链路原本的计费五件套——浏览器智能分镜 `Tasks.start → U.charge → 执行 → done`(执行链异常 `U.refund` 退费;LLM 失败按既有口径回退本地生成),服务端 `/api/wf/smart-storyboard` 走 `wfLLM`(计费动作服务端定死,返回结构不合法即 `proxyRefund` 退费并如实报错)。本改动零新增 `billingAction`、零新增 LLM 调用、零新增上传。
- **行为等价保证**:模板为空时,`buildSBUser`、`normalizeLLMShot` 兜底、`buildShotPrompt` 三处输出与接入前逐字节相同(契约测试逐条断言)。

## 6. 为什么不接 `Domain.buildVideoRequest`

架构规格给的另一条候选路径是「接进 `Domain.buildVideoRequest` 的 prompt 构造」。复核后不走这条:

- `buildVideoRequest(p, ep, s, opts)` 是**纯领域函数**,同时被 `Domain.buildGenerationSignature` 用来算 `shotInputHash`。要在这里注模板,就得把 settings 顺着 `shotInputHash(p, s)` 往下传——该函数的调用点遍布 `store.js`/`issues.js`/`media.js`/`sb-gen.js`/`beatboard.js`/`cli.js`,是扇出最大的一次改动。
- 若只改 prompt 不改指纹,发出去的提示词与指纹口径就分家了,直接违反「生成逻辑与过期判定共用同一份字段清单」。
- 若两处都改,默认模板一上线,**所有存量已出片镜头的 `inputHash` 立即失配**,全量误报「素材已更新·建议重生成」——迁移纪律要求「无记录保持原语义」,这条会一夜把存量项目刷红。

接在提示词成型阶段,以上三条全部规避,且用户看到的效果一致(真正送进视频模型的 `prompt` 就是被模板成型过的那一条)。

## 7. 契约测试(`node tests/unit.js contract`)

新增三条,均属「防止回退成死字段」的护栏:

1. **填充行为**:拆镜要求行按模板填充 `{style}`;`tplVideoText` 缺省/空串/不传三种写法产出同一份 user 提示词(与接入前一致);兜底提示词有模板按模板成型、保留导演设定,模型已给 `prompt` 时模板不覆盖。
2. **本地出口**:真实加载 `js/storyboard.js`,断言 `SB.buildShotPrompt` 未设置模板时是原骨架、设置后按模板成型且全局设定/负面约束仍在尾部;`SB.tplVideoOf()` 取原值。
3. **双端装配 + 三件套无死键**:源码级断言 `js/sb-llm.js` 与 `server.js` 都注入 `tplVideoText`(拆镜与逐镜规整各一处)、填充函数只在 `wf-core` 一份;并逐键校验 `tplImage`/`tplVideo`/`tplReview` 各自都有读取方文件——任何一件套将来被改回「只写不读」,这条会红。

回归:`node tests/unit.js` 204/204 通过;`MOCK_LLM=1 node tests/integration.js` 79/79 通过(含 `/api/wf/smart-storyboard` 写回与字段规整);改动文件全部 `node --check` 通过。

## 8. 未纳入本次范围(如实记录,非口径分歧)

- `js/sb-io.js` 的两处导入类入口(文本导入 `第 241 行`、资产库导入 `第 279 行`)自己拼了最小骨架而没走 `SB.buildShotPrompt`。它们的语义是「导入优先用来源自带的提示词」(CSV 第 15 列 / 资产 `prompt`),缺失时才给骨架;把这两处收编进单一出口属于 G-13(内联提示词收编)的活,与本缺口的模板治理不冲突。
- `tplReview` 在浏览器侧读 `getSettings().tplReview`(并入 `DEFAULTS`),服务端读 `st.tplReview || ''`:用户从未保存偏好时两端审片提示词会差一行。这是接入 `tplVideo` 时复核出来的**既有**差异,改它会动审片提示词的现网口径,单独记为待处置项,本次不顺手改。
- 本改动与并行分支 `cursor/w3-g01-expert-persona-wf-a861`(专家人设过服务端)在 `js/wf-core.js`、`js/sb-llm.js`、`server.js` 上有相邻行,合并时可能有文本冲突;两者语义正交(一个注人设、一个注模板),按各自注入点合并即可。
