# W19 · G-06 残留落地:「多镜头写法」进拆镜人设、「主体参考」进主体人设

> 处置对象:`w1-pipeline-skill-map.md` 的 **G-06**「AI 抽卡四条知识未进任何生成提示词构造点」的**残留两条**。
> W15 把「抽卡公式」「抽卡军规」接进生成步人设后,该缺口只闭一半;`w15-gen-block.md` 第 6 节与
> `w18-gen-prompt-unify.md` 第 6 节都如实记着「多镜头写法」「主体参考」仍在外面。
> 基线:`cursor/w18-gen-prompt-unify-0df1 @ 6043f8b`(含 W15 生成步注入面与 `optimizeSystem` 两端收编)。
> 并行避让:W16 合流、W17 就绪检查面表各自单列;本槽只动两个系统人设装配口与其两个消费点,**不碰 `js/commands.js` 的 preflight 段**。

## 1. 动工前复核:残留的确切形状

两条条目在基线上的全部取用通道:

| 条目 | 取用通道(基线) | 主线工作流提示词 |
|---|---|---|
| 多镜头写法 | `agent.js` `BOARD_KB.分镜`(分镜板块 Agent 系统提示词)· SK-01 索引宿主登记 · SK-19 `kb` 登记 | **无** |
| 主体参考 | `agent.js` `BOARD_KB.主体`(主体板块 Agent 系统提示词)· SK-01 · SK-11/SK-12/SK-13 `kb` 登记 | **无** |

即:两条只在**助手对话侧**有出口,主线七步的 LLM 提示词(拆镜/理解/提取主体/审片/成片)一条也没吃到。
SK-19 与 SK-11 的 `kb` 登记因此是"索引级声明"——`Skills.block()` 拿得出文本,但主线上没有哪个提示词等于它。

条目正文本身指向的落点很明确,不需要新造语义:

- 「多镜头写法」治的是**逐镜 prompt 的镜头流写法**(按时间顺序描述、不写太碎、图生视频声明依参考图保持样貌服装、首尾帧策略收敛动作幅度)。这三件事正是**拆镜**这一步同时决定的:每镜 `prompt` 与每镜 `strategy`(ref/frames/fusion)都在拆镜产出里。
- 「主体参考」治的是**主体表要长成什么形状才能当参考用**:名称唯一稳定(生成时要按「将图片N定义为「名字」」引用)、人物 prompt 按大头照+全身照写而非三视图、参考人物数有上限。这正是**主体提取**这一步的产出面(名称/别名/每主体一条文生图 prompt)。

## 2. 落地点(两个既有装配口,零新增正文)

**分镜口(`js/wf-core.js`)**,键序即 SK-17 登记序:

```
W.sbSystem = ov => Prompts.get('sb.system', ov) + KB.pick('景别运镜', '轴线匹配', '多镜头写法');
```

**主体口(`js/wf-core.js`)**,与 `sbSystem`/`genPromptSystem` 同形态:

```
W.EXTRACT_SYSTEM = '你是专业的短剧剧本分析助手。';        // 人设句字面不变
W.extractSystem  = () => W.EXTRACT_SYSTEM + KB.pick('主体参考');
```

**消费点(共 2 处,双端成对改)**:`js/episode-util.js` `llmExtractSubjects`(浏览器解析向导)与 `server.js`
`/api/wf/extract-subjects`(CLI `exec project.extractSubjects` 与 MCP 同链路)的 `system` 由 `WfCore.EXTRACT_SYSTEM`
改取 `WfCore.extractSystem()`。两端必须同批改——只改一端就是新造双端提示词分叉。
`buildExtractUser`(user 半)一字未动:注入只加在 system 半。

拆镜口的消费点不用改:`js/sb-llm.js` 与 `server.js` `/api/wf/smart-storyboard` 本来就取 `WfCore.sbSystem(ov)`。

## 3. 为什么「主体参考」不进生成请求构造点、也不进改写人设

两条都是**主动避让**,不是没想到:

- **不进 `Domain.buildVideoRequest`**:它同时被 `buildGenerationSignature` 用来算 `shotInputHash`,注方法论文本会让存量已出片镜头全量失配、全线误报「素材已更新·建议重生成」。这条纪律与 G-05/W15 同源,`domain.js` 不引用 `KB.` 的源级断言照旧生效。本轮**不动 `shotInputHash` 的字段清单**,指纹口径一字未改。
- **不进 `WfCore.genPromptSystem`(视频提示词改写人设)**:该链路重写的是 `s.prompt`,而真实请求的 prompt 是
  `Domain.shotRefImages` 的**主体定义前缀**再接 `s.prompt`。「主体参考」第①④条要求把「将图片N定义为「名字」」「(对应图片1)」写进提示词——这部分已由代码按真实参考图顺序物化。把条目整条喂给改写器,改写器会在 `s.prompt` 里再写一遍主体定义,与代码生成的那份**图号可能不一致**,是给一致性添乱而不是治它。放在主体步则没有这个冲突:提取产出的是主体表,不是发给视频模型的画面描述。

## 4. skill 索引变更(记账,不搬正文)

| 条目 | 字段 | 基线 | 本轮 |
|---|---|---|---|
| SK-11 `subjects.refDiscipline` | `note` | — | 写明注入面落在 `WfCore.extractSystem`、本条拼块即该条目正文;`gaps` 的 G-06 从此只记校验半 |
| SK-17 `shots.shotLanguage` | `kb` | `['景别运镜','轴线匹配']` | `['景别运镜','轴线匹配','多镜头写法']` |
| SK-19 `shots.promptEightDim` | `kb` | `['抽卡公式','抽卡军规','多镜头写法']` | `['抽卡公式','抽卡军规']` |
| SK-19 | `gaps` | `['G-15','G-06','G-05','G-10']` | `['G-15','G-05','G-10']` |
| SK-21 `gen.videoTpl` | `gaps` | `['G-06','G-13']` | `['G-13']` |

「多镜头写法」从 SK-19 **移**到 SK-17 而不是两条都挂:`Skills.block(stage)` 按 stage 汇总,同一分镜步挂两次就会在拼块里出现两份正文,拆镜人设的逐字节对账基准随之破。落点是拆镜人设这一处,登记就只放在拆镜人设的宿主条目上(与 `BOARD_KB`/`DIGESTS` 的"同一提示词内不重复注入"同一条纪律)。

`gaps` 侧:G-06 的**注入半**到此闭合(四条抽卡知识全部进主线提示词构造点),故从 SK-19/SK-21 清账;其**校验半**(`w1-architecture-spec.md` 第 3 节 W4 第 2 项:稳定词与主体参考纪律以生成前 warn 形式前置提示)仍未落地,故 SK-11/SK-13 的 G-06 一概不动。实测 `Skills.gaps()['G-06']` 由四条收窄为 `['subjects.refDiscipline','subjects.crossShot']`——正好是那两条校验面。

## 5. 逐字节对账(契约测试)

`node tests/unit.js contract` 新增/改写的断言:

```
Skills.block('shots', { ids: ['shots.shotLanguage'] })
                             === KB.pick('景别运镜', '轴线匹配', '多镜头写法')
Skills.block('subjects')     === KB.section('主体参考')
WfCore.sbSystem({})          === Prompts.get('sb.system', {}) + Skills.block('shots', { ids: [...] })
WfCore.sbSystem({ 'sb.system': '分镜师。' })
                             === '分镜师。' + KB.pick('景别运镜', '轴线匹配', '多镜头写法')
WfCore.extractSystem()       === WfCore.EXTRACT_SYSTEM + Skills.block('subjects')
WfCore.EXTRACT_SYSTEM        === '你是专业的短剧剧本分析助手。'
```

第 4 条锁的是**覆盖只换人设句、方法论正文不受影响**(与 W15 给生成步加的那条同形);倒数第一条锁人设句字面不被本轮顺带改写。

另有三条护栏:

- **不重复注入**:`Skills.list('shots').filter(s => s.kb.includes('多镜头写法'))` 必须恰好是 `['shots.shotLanguage']`——谁把这个键又挂回 SK-19,拼块出现两份正文时先红。
- **双端不漏**:`js/episode-util.js` 与 `server.js` 都必须出现 `WfCore.extractSystem()`,且都**不得**再出现 `WfCore.EXTRACT_SYSTEM`(直取常量就是漏掉方法论块,且只漏一端更难发现)。
- **user 半不复制正文**:`buildExtractUser(...).user` 不得包含「主体参考」条目正文。

`Skills.validate(deps)` 仍零问题;`Skills.block('gen')`、`Skills.block('review')`、`Skills.block('film')` 三条既有对账基准一字未动。

## 6. 兼容影响(缺省提示词变长)

本轮两处**缺省输出都变长**,这是注入的直接后果,如实列出:

| 装配口 | 基线长度 | 本轮长度 | 增量 |
|---|---|---|---|
| `WfCore.sbSystem({})` | 360 | 472 | +112(「多镜头写法」整条) |
| `WfCore.extractSystem()` | 14(即人设句) | 292 | +278(「主体参考」整条) |

受影响的链路与影响面:

- **智能分镜**(浏览器 `sb-llm`、`/api/wf/smart-storyboard`、CLI/MCP 同链路):system 多 112 字,模型拆出的逐镜 `prompt` 与 `strategy` 会更贴镜头流写法。产出仍走 `normalizeLLMShot` 逐字段白名单,字段集与钳制口径不变。
- **提取主体**(浏览器解析向导、`/api/wf/extract-subjects`、CLI `exec project.extractSubjects`):system 多 278 字,产出仍走 `normalizeExtracted`(白名单 + 可信性校验 + 别名合并),字段集不变。
- **存量数据零影响**:`shotInputHash` 的字段清单与 `buildVideoRequest` 一字未动,已出片镜头不会被判旧;`reviewSnapshotHashOf`、`composedInputHash` 同样未碰。
- **计费零新增**:无新增 `billingAction`、无新增 LLM 调用、无新增上传。两条链路沿用原有计费(`llm.extract` 服务端定死;拆镜沿用既有动作)。
- **用户覆盖面**:`sb.system` 的在线覆盖照旧只换人设句,方法论段不随覆盖变动;`extractSystem` 的人设句尚未入 `Prompts` 注册表,故这一处暂不可在线改写(见第 7 节)。

## 7. 如实记录:仍未闭的部分

- **G-06 的校验半未动**:生成前把稳定词/主体参考纪律作为 warn 前置提示(SK-11 的 `check` 面、SK-13 的生成前置消费点)仍是 pending,`gaps` 里照挂。要不要在批量/单镜生成前拦一道,得先定"提示要不要拦生成"的产品口径,不在本轮夹带。
- **`extractSystem` 的人设句没进注册表**(G-13):`EXTRACT_SYSTEM` 仍是 `wf-core.js` 的常量,用户在「偏好学习 → 全局默认值 → 核心提示词 skill」改不到它。因此本装配口不收覆盖表参数——收了也没有键可取,给个假参数比不给更误导。
- **同一句人设在 `js/episode-util.js` 还有第二处内联**:`aiScriptDigest` 的人物小传步(第 216 行)用的是同一句字面,但那是另一条链路(全文分段概括 → 人物小传),不属提取主体,本轮不动;它也因此**不吃**「主体参考」注入。
- **SK-19 的 `prompts: ['sb.system']` 登记仍偏宽**:该条 `kb` 两条抽卡条目的实际提示词落点是生成步人设(SK-21 同键登记),`sb.system` 侧只有 `settings.tplVideo` 经 `tplVideoNote` 落在拆镜要求行。收敛这条登记会动 `Skills.block('shots')` 的对账基准,单列一轮处置,本轮只在 `note` 里写明实况。

## 8. 回归

- `node --check`:`js/wf-core.js`、`js/skills.js`、`js/episode-util.js`、`server.js`、`tests/unit.js` 全通过。
- `node tests/unit.js`:**301/301 PASS, 0 FAIL**(基线 300,净增 1 项断言套件:主体步注入面)。
- `node tests/integration.js`:**93/93 PASS**(含 `/api/wf/extract-subjects` 四项)。
- `node tests/cli.smoke.js`:**62/64**,失败两项(`未登录 whoami → exit 3`、`llm --json mock 链路`)在基线同样失败,与本轮无关(已在基线复跑比对)。
- README 同步:架构图装配口一行、KB 取用面注入点清单、skill 索引的各步拼块对账基准(新增主体步)、`/api/wf/extract-subjects` 一行、单测断言数 299 → 301。
- 未运行 `tests/e2e.js`(按仓库约定仅用户明确要求时跑);本轮无 DOM 交互改动。
