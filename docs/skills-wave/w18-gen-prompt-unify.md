# W18 · 提示词改写人设收编两端:`WfCore.optimizeSystem` 双端单源

> 触发:[w15-gen-block.md](./w15-gen-block.md) 第 6 节第二条如实登记的残留——「同一句人设还有两处内联未收编:`js/review.js` 一键优化与 `cli.js` produce 修订重抽……**用户覆盖 `gen.promptSystem` 时,这两条链路不跟随**」。
> 基线:`cursor/w15-gen-block-d9a3 @ 1cc6aa7`。
> 并行避让:W16 合流、W17 就绪检查面表各自单列;本槽不碰 `js/commands.js` 的 preflight 表达式,不改发布门,不新增计费动作。
> **本文取代 w15 §6 第二条**:那两处已收编,该条记的残留到此为止(w15 文档作为当轮记录不回改)。

## 1. 缺口的确切形状

`gen.promptSystem` 在 W15 进了注册表,`def` 与既有内联字面 `你是文生视频提示词专家。` 逐字节相同。但当轮只接了一个消费点(`js/sb-views.js` 提示词工具),同一句人设在另外两处仍是**写死的字符串字面量**:

| 端 | 位置 | system 半 | user 半 |
|---|---|---|---|
| 浏览器 | `js/review.js` `optimizeShot`(一键优化) | 内联 `'你是文生视频提示词专家。'` | 已单源 `WfCore.buildOptimizeUser` |
| CLI | `cli.js` `reviseLowShots`(produce 修订重抽) | 内联同一字面 | 已单源 `WfCore.buildOptimizeUser` |

后果不是"输出不一致"——三处字面完全相同,未覆盖时行为一致——而是**覆盖不跟过去**:用户在「偏好学习 → 全局默认值 → 核心提示词 skill」改写这条人设,只有提示词工具跟随,审片闭环的两端仍按旧人设改写提示词。同一条审片修订链路的 user 半已经是单源的,system 半却各留一份,这是半截收编。

两端必须同批改:只收 `review.js` 会让浏览器跟随覆盖、CLI 不跟随,反而**新造一处双端不一致**。W15 因分工不碰 `review.js`,故 `cli.js` 一并留下,是对的。

## 2. 落地点

**装配口(`js/wf-core.js`,与 `buildOptimizeUser` 配对)**:

```
W.optimizeSystem = ov => Prompts.get('gen.promptSystem', ov);
W.genPromptSystem = ov => W.optimizeSystem(ov) + KB.pick('抽卡公式', '抽卡军规');
```

两个取用口、一个取值处:人设句只在 `optimizeSystem` 里取一次,生成步的 `genPromptSystem` 由它派生后接方法论块。键名字面 `'gen.promptSystem'` 全仓只剩注册表定义与这一行。

**消费点(本轮 2 处)**:

| 文件 | 改法 |
|---|---|
| `js/review.js` `optimizeShot` | `system: WfCore.optimizeSystem()`(浏览器端 `Prompts` 自读 `Store.settings.promptOverrides`) |
| `cli.js` `reviseLowShots` | `role:'system'` 的 content 改 `WfCore.optimizeSystem(ov)`,`ov` 取自函数内已有的 `stateGet(f)` 结果(`state.settings.promptOverrides`) |

CLI 侧多取一个 `ov` 是必须的:Node 无 `window`,`Prompts` 读不到 `Store`,**覆盖表须由调用方显式传入**——与 `server.js` 全部 `/api/wf/*` 调用点同一纪律。不传就等于永远拿默认值,收编也白收。本轮不新增 HTTP 往返:`reviseLowShots` 开头本来就取了整棵 state。

**索引(`js/skills.js`)**:SK-25 `review.reviseLoop` 补 `prompts: ['gen.promptSystem']`。该条 `covers` 本就含 `gen`,现在它的修订步真的消费了这个键,登记跟上实况。`Skills.validate(deps)` 零问题。

## 3. 为什么这两处不接方法论块

`genPromptSystem` 会在人设句后整条接「抽卡公式 + 抽卡军规」(344 字)。这两处**不接**,理由是链路形态不同:

- 提示词工具(`sb-views.js` 四策略优化)的 user 半是"请按某策略优化这条提示词",没有别的约束,方法论块正好补上"按什么标准写";
- 审片修订两端的 user 半是 `buildOptimizeUser`,已经给定了**原提示词 + 逐条审片意见 + 保持原剧情与风格**的硬要求。再压 344 字的八维结构与军规,会与"逐条落实修正意见"抢改写方向。

工程上还有一条硬约束:**缺省输出逐字节不变**。接了块就是给这两条链路的 system 输入加 344 字,是行为改动而非收编。要不要给审片修订也吃方法论,是产品口径问题,不在本轮夹带;真要改,`optimizeSystem` 换成 `genPromptSystem` 一处即可,`W18` 之后两端会同时变,不会再半截。

## 4. 逐字节对账

`node tests/unit.js` 新增一套断言,行为层与源级各一半:

```
WfCore.optimizeSystem()                                  === '你是文生视频提示词专家。'   // 缺省 = 收编前内联字面
WfCore.optimizeSystem({})                                === Prompts.get('gen.promptSystem', {})
WfCore.optimizeSystem({ 'gen.promptSystem': '改写器。' }) === '改写器。'                    // 覆盖跟随
WfCore.genPromptSystem({ 'gen.promptSystem': '改写器。' }) === WfCore.optimizeSystem(…) + Skills.block('gen')
```

源级三条防回退:`js/review.js` 与 `cli.js` 都**不得再出现** `你是文生视频提示词专家` 字面、都必须出现 `WfCore.buildOptimizeUser(`,且 CLI 侧必须是 `WfCore.optimizeSystem(ov)`(显式传覆盖表,不许退回隐式取值)。第四条锁住 `genPromptSystem` 仍由 `optimizeSystem` 派生,生成步的 344 字方法论段未被本轮碰过。

实测:`genPromptSystem({})` 长度 **356**(=人设 12 + 注入块 344,与 W15 相同)。

## 5. 不动的部分

- **计费不新增**:两端沿用原有 `llm.optimize`(浏览器经 `Tasks.run`/`U.charge` 登记扣费,CLI 经 `/api/llm/chat` 的 `billingAction`),零新增动作、零新增 LLM 调用、零新增上传;
- **发布门不动**:`release-check` 的门与分值未碰;
- **回退分支不动**:LLM 失败回退 `WfCore.localOptimizedPrompt` 的本地规则改写、CLI 402 整轮中止、浏览器放弃优化不退款,全部原样;
- **`js/commands.js` preflight 表达式未碰**(W17 并行槽)。

## 6. 如实记录:仍未闭的部分

- **G-06 仍只闭一半**,与 W15 结论相同:「多镜头写法」「主体参考」两条仍未进任何提示词构造点。本轮只收编人设句取值口,没有新增任何 KB 条目的注入点,不借本轮成绩去清 G-06 的账。
- **G-13 仍在 SK-21 的 `gaps` 里**:`persona.js`/`episode-util.js`/`beatboard.js` 等模块的内联提示词尚未入注册表。`gen.promptSystem` 这一键到此**全仓收编完毕**(全仓已无第二处该人设字面),但注册表只覆盖 7 条主线提示词,远不是全部。
- **审片修订链路的 `temperature`/`max_tokens` 两端仍各写各的**(浏览器 0.6/900,CLI 0.6/无上限),不属提示词面,本轮不夹带。

## 7. 回归

- `node --check`:`js/wf-core.js`、`js/review.js`、`js/skills.js`、`cli.js`、`tests/unit.js` 全通过。
- `node tests/unit.js`:**300/300 PASS, 0 FAIL**(基线 299,净增 1 项断言套件)。
- `node tests/integration.js`:**93/93 PASS, 0 FAIL**。
- `node tests/cli.smoke.js`:**62/64**,两条 FAIL(`未登录 whoami → exit 3`、`llm --json mock 链路`)在基线 `1cc6aa7` 上同样失败,与本轮无关。
- `Skills.validate(deps)`:零问题。
