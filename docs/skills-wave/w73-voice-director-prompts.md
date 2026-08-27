# W73 · 配音导演两处内联人设收编(两条独立键,契约半留在调用点)

> 基线 `cursor/w70-integration-ad31 @ 87aa62a`(W70 集成后的头部),落地分支 `cursor/w73-voice-director-prompts-b4b4`。
> 本槽做的是 G-13 的欠段里 W69 点名的那两处:`js/persona.js` 音色推荐两步(单个 / 批量)的 `system` 半。
> 不动 `js/sb-board.js` 或其它文件的内联人设、不改发布门、不新增计费动作(两步本来就是免费辅助)、未删测(新增 1 条用例、翻转 1 处「仍内联」计数、补 1 处记账锚点)。

## 1. 先 grep 核实:两处,原文逐字节相同

```
$ grep -n "配音导演" js/persona.js
83:        system: '你是配音导演。',
110:        system: '你是配音导演。',
```

`js/roles.js:109` 另有一处 `U.toast('AI 配音导演正在为全部角色推荐音色…')`,那是界面文案不是 `system` 半,不在收编范围内。两处 `system` 分别落在:

| 处 | 函数 | 调用点 | user 半 |
|---|---|---|---|
| `js/persona.js:83` | `Persona.recommendVoice(p, s, voices)` | `js/roles.js` 角色卡「按性格推荐音色」→ `RoleOps.recommendVoice`(另经 `js/role-editor.js` 的 `[data-x=vrec]`) | 单个角色人设 + 音色库 + `{"voice","reason"}` 契约 |
| `js/persona.js:110` | `Persona.recommendVoicesBatch(p, chars, voices)` | `js/roles.js` 批量配音色(`batchRecommendVoices`,一次 LLM 调用推全部角色) | 全部角色简报数组 + 音色库 + `[{"name","voice","reason"}]` 契约 |

两处的 `system` 字面**逐字节相同**(都是 `'你是配音导演。'`,7 个字符),按本槽口径这就允许共用一条键。

## 2. 仍取两条独立键:允许共用不等于该共用

`voice.recommendSystem` / `voice.recommendBatchSystem`,两条 `def` 都是 `你是配音导演。`——**同一份字面在注册表里留了两条**。判据两条:

1. **键位是持久化面**。覆盖按键存在 `settings.promptOverrides` 里,合成一条之后想再拆成两条,就会废掉用户此前写在那一条上的覆盖(W51 收编多轮三份人设时立的判据,此处同样适用,且此处更便宜——现在拆是零成本,以后拆要动用户数据)。
2. **两步该讲的话本来就不同**。批量那步是"一次给全部角色配音色",它要顾的是角色之间的音色区分度(同一个音色被摊到三个角色上,单角色看每个都合理);单个那步只看一个角色,没有这个约束。用户想给批量那步补一句「注意角色之间音色要有区分度」,合成一条就会把这句话灌给单个推荐,那一端必然失真。

反过来看,合并的唯一好处是「全局默认值」页少一行,而两条键的名字(`音色推荐 · 系统人设` / `批量音色推荐 · 系统人设`)本身就把两步分得开。所以两条。

顺带照搬 W49/W51 的纪律:**只收人设句**。两处的 user 半各自带着音色库的取值范围(`从音色库 [...] 中推荐最合适的 1 个` / `音色库:[...]`)与返回 JSON 约定(`"voice":"必须是音色库中的一项"`、批量那条还要求 `"name"` 与输入完全一致)——这半是解析契约:`recommendVoice` 拿到回包后要过 `voices.includes(out.voice)`,批量那条要按 `o.name` 落回角色并同样过 `voices.includes`,任一处不满足就整条退随机推荐。**能改坏的东西不该开成开关**,故两刀都切在人设句与 `messages` 之间,`temperature`/`max_tokens` 一字未动。

## 3. 结果一句话

注册表从 14 条到 16 条,新增两条键的 `def` 与收编前两处内联字面**逐字节相同**;两个调用点的 `system` 换成 `Prompts.get(键)`,user 半与取样参数一字未动。**缺省行为零变化**——两步各真跑一次,`system`/`user`/`temperature`/`max_tokens` 与收编前逐字节全等(第 6 节实测);覆盖时只换对应那一步的人设句,另一步与两条 user 半逐字节不动。

```js
// js/prompts.js(插在 extract.system 之后:音色推荐落在主体/角色那一步,不摆到贯通层的 agent.* 之后)
/* 音色推荐两步的人设:单个与批量各一条独立键。两处 def 逐字节相同,仍不合并——
 * 键位是持久化面(覆盖按键存),合成一条之后想拆回来就会废掉用户已写的覆盖;
 * 且两步该讲的话不同(批量那步要顾角色间的音色区分度,单个那步只看一个角色)。
 * 同样只收人设句——音色库取值范围与返回 JSON 约定仍由各自调用点拼,不开放覆盖。 */
{ key: 'voice.recommendSystem',      name: '音色推荐 · 系统人设',     vars: [], def: '你是配音导演。' },
{ key: 'voice.recommendBatchSystem', name: '批量音色推荐 · 系统人设', vars: [], def: '你是配音导演。' },

// js/persona.js:两个调用点各取自己那一键(浏览器隐式读全局默认值页的覆盖表,与 js/review.js 同纪律)
recommendVoice       → system: Prompts.get('voice.recommendSystem')
recommendVoicesBatch → system: Prompts.get('voice.recommendBatchSystem')
```

回归:`unit 418/418`(基线 417,新增 1 条用例)、`integration 118/118`、`cli.smoke 88/90`(两处失败与 `master` 基线同名,实测见第 6 节)。

改动:`js/prompts.js` +12、`js/persona.js` +2−2、`js/skills.js` +10−2(SK-03 的 `prompts` 与 `note`)、`tests/unit.js` +81(加载器 + 1 条用例 + 既有两条各补几行)、`README.md` +3−3、`docs/skills-wave/README.md` +2−1(提示词条数与索引行),外加本记账件。

## 4. 这两条的「两端」:只落在取值口,没有第二个消费点

`js/persona.js` 是浏览器侧模块(顶部就用 `U.toast`/`Store.save`),音色推荐两步在 `server.js` / `cli.js` / `mcp.js` 里**没有第二份实现**——headless 侧根本没有"按人设推音色"这个动作。所以本槽的「两端」与 W51 那三条同口径,如实记成:**键登记在双端 UMD 注册表里、取值口 `Prompts.get(key, ov)` 双端可用,但这两条键当前只有浏览器一个消费点**。哪天 headless 要推音色,新消费点按同键 `Prompts.get(键, promptOverrides)` 显式传表即可跟随,注册表侧零改动。

计费面同样如实记:两步都不经 `Tasks.run`、不 `U.charge`(`recommendVoicesBatch` 的注释原本就写着"与单个推荐同为免费辅助,不计费"),本槽一行未动,并由用例钉住(沙箱跑完 `__charges` 与 `__tasks` 都是空的)。

## 5. 记账:SK-03 补两条键,仍欠段写明契约半的边界

两条键登记在 SK-03(`core.personaCtx`)名下——注册表里的人设键全在这一条的 `prompts` 里,`Prompts` 全部 key 必须被 skill 索引引用是既有契约(漏登即红,第 6 节变异 5)。`note` 的"已落地"半补一句收编事实(含"两处 `def` 相同仍不合并"的理由),「仍欠」段补两句边界。

| 条目 | 改成什么 | 剩余仍欠 |
|---|---|---|
| SK-03 `core.personaCtx` | `prompts` 补 `voice.recommendSystem` / `voice.recommendBatchSystem`;`note` 补「音色推荐两步的人设句同形收编为两条独立键(两处 def 逐字节相同仍不合并:键位是持久化面,且批量那步要顾角色间的音色区分度),取值口就在调用点 `Persona.recommendVoice`/`recommendVoicesBatch`」 | **音色推荐两条同理只收人设句**——音色库取值范围与返回 JSON 约定仍写在各自调用点、不开放覆盖(用户改坏即推荐值落不回音色库,只能退随机);**这两条与多轮那三份一样没有 Node 第二消费点**,两端只落在取值口 |

SK-11 的仍欠段**一字未改**且仍属实:它欠的是 `tplImage` 取用点即 `js/persona.js` 八维度重写文生图那步的人设(`'你是文生图提示词专家。'`),本槽没碰那一处。但同文件的实况变了,故把 W66 留在那条用例上的「仍内联」判据按实况**翻转成计数**:`js/persona.js` 的 `system: '你是…` 从 3 处降到**恰好 1 处**,并补一条"配音导演那两步的人设句应已在注册表"。这样两个方向都钉住——把配音导演退回内联即红(第 6 节变异 3),把文生图那处也收编而不改 SK-11 记账同样即红(W66 留的原断言)。

`pending` / `gaps` 一字未动:G-13 治的是全仓的内联人设大头(按同一 grep 口径 `system: '你是…` / `` system: `你是… ``,基线 24 处,本槽后 **22 处**),按 W36 立的关联索引口径,落地一面不摘标记,故 `Skills.gaps()` 的键与值逐字节不变。

## 6. 用例改动(新增 1 条 + 翻转 1 处 + 补 1 处锚点,未删测)

| 用例 | 钉住的事 |
|---|---|
| **新增** `音色推荐两份人设`(contract 套件,紧挨 W51 那条) | 两条缺省人设句字面 + `def === '你是配音导演。'` 的条目**恰好 2 条**(合并即只剩 1 条)+ 两条条目形态(无变量、名带「音色推荐」「系统人设」)+ 两步真跑各发一次 LLM、`system` 取注册表 + 两条 user 半逐字节(音色库取值范围与返回 JSON 约定在内)+ 取样参数 `0.4/300`、`0.4/1200` + 两步零任务零扣费 + 两种覆盖各只换对应那一步(另一步不串台、两条 user 半逐字节不变)+ 注册表里不得出现音色库取值范围/`"voice"` 契约 + 源级两处各取自己那一键且人设全文零命中 + SK-03 已登记两键 + SK-03 仍欠段点名契约半 |
| **翻转** `记账对齐:SK-10/SK-11 …`(W66 那条的 SK-11 半) | 原断言只查"文生图重写那步仍内联";补成同文件内联人设**恰好 1 处** + 配音导演两键必须在注册表里——即 W66 记的"`js/persona.js` 三处内联"按实况翻转成一处 |
| **补锚点** SK-03 的仍欠段(在新增用例里) | 只认「仍欠」之后那段,须同时出现「音色库」与「不开放覆盖」:把契约半悄悄开成可覆盖、或把这句记账删掉,都会红 |

新增用例跑在新加的沙箱加载器 `loadPersona(ov)` 上:按 `index.html` 同顺序装 `prompts → persona` 两个真实源文件(`js/persona.js` 加载期无强依赖,运行期的 `styleOf`/`API`/`Store` 按既有 stub 注入),被测代码即生产代码。

九条变异逐一实测(每条单独施加、跑 `node tests/unit.js` 后 `git checkout` 复原,复原后 418/418):

| 变异 | 实测行为 | 转红 |
|---|---|---|
| 1 改 `voice.recommendSystem` 的 `def` 一字(导演→总监) | 缺省提示词变了 | 1 条(缺省人设句字面) |
| 2 批量那步改取单个那一键(两条合成一条) | 用户改单个推荐会连带改掉批量那步 | 1 条(覆盖不串台) |
| 3 单个那步退回内联字面 | 覆盖表被绕过,该步不再跟随注册表 | 2 条(覆盖跟随 + 翻转后的「恰好 1 处」计数) |
| 4 把返回 JSON 约定塞进 `voice.recommendBatchSystem` 的 `def` | 用户能改坏推荐值的解析契约,且缺省字面变了 | 1 条(缺省字面先撞;把字面断言放宽后改撞「两条各留一份 def」,契约半那条是同一用例里的第三道网) |
| 5 SK-03 的 `prompts` 漏登 `voice.recommendBatchSystem` | 注册表新键脱离索引 | 2 条(既有的「`Prompts` 全部 key 应被 skill 索引引用」+ 新增那条) |
| 6 `README.md` 提示词条数不同步(16 → 14) | 文档数字失真 | 1 条(注册表口径对账) |
| 7 单个那步改 `Prompts.list().find(…).def` 直取(绕过 `Prompts.get`) | 用户写的覆盖读不到 | 1 条(覆盖跟随) |
| 8 批量那步的 user 半末尾加一句 | 缺省提示词变了(哪怕加的是"有道理"的话) | 1 条(批量 user 半逐字节) |
| 9 SK-03 的仍欠段删掉音色推荐那句 | 契约半的边界记账消失,读者读不到"改得动人设、改不动契约" | 1 条(仍欠段锚点) |

## 7. 复核方式

```
git checkout cursor/w73-voice-director-prompts-b4b4
node --check js/prompts.js js/persona.js js/skills.js tests/unit.js   # 全部通过
node tests/unit.js            # 418/418 PASS
node tests/unit.js contract    # 57/57,含新增那条与两处 README 数字对账
node tests/unit.js skills      # 94/94,含翻转后的 SK-11 记账对齐
node tests/integration.js      # 118/118 PASS
node tests/cli.smoke.js        # 88/90
```

**缺省逐字节按两步实测**:沙箱截获上游请求体,与收编前的字面对照——

| 步 | 观测面 | 结果 |
|---|---|---|
| 单个推荐 `recommendVoice` | `system` / `user` / `temperature` / `max_tokens` | 逐字节相同(`0.4` / `300`) |
| 批量推荐 `recommendVoicesBatch` | 同上(user 半含全部角色简报数组) | 逐字节相同(`0.4` / `1200`) |

覆盖链路同法实测:写 `settings.promptOverrides['voice.recommendSystem']` 后,单个那步的 `system` 即覆盖值、批量那步仍是缺省 `你是配音导演。`,两条 user 半逐字节不变;写批量那一键时对称成立。

`cli.smoke` 那两处失败(「未登录 whoami → exit 3」「llm --json mock 链路」)在 `master`(`9adcf0f`)另开 worktree 取证:同名两条在 `master` 上同样失败(那边 51/53,用例总数不同是分支间用例增量所致),故按基线失败保留,不在本槽范围内。

`node tests/e2e.js` 按仓库纪律未跑(需用户明确要求)。本槽不含合并、未开 PR。

## 8. 与并行分支的关系

本槽只在 W70 头部之上加两个键、动两行 `system` 取值与一条 skill 记账,预计冲突面:

- `js/prompts.js`:在 `REG` 中段(`extract.system` 之后)插两条。若并行槽也加键,取**并集**;条目相对次序只影响「全局默认值」页展示顺序,无行为面。
- `js/persona.js`:动的是 `recommendVoice` / `recommendVoicesBatch` 各一行 `system:`。若并行槽改了这两步的 user 半,合入后**新增用例里两条 user 半的期望串要按实况重算**(它是逐字节钉的);`rewritePrompt` 那处内联人设有意不碰,别顺手收掉——收了要同步改 SK-11 的仍欠段(W66 那条会先红)。
- `js/skills.js`:只动 SK-03 的 `prompts` 数组与 `note` 字符串。`prompts` 取并集;`note` 的仍欠段以**实况**为准折回(变异 9 会先红)。注意 `note` 里不得出现 `Store`/`window` 等环境句柄字面(`skills.js` 有源级禁令),故覆盖表写成「全局默认值页的覆盖表」。
- `tests/unit.js`:新增加载器 `loadPersona` 与 1 条用例,另在 W66 那条用例里加 3 行。用例数按实跑重算(contract 套件的数字对账会先红)。
- `README.md` / `docs/skills-wave/README.md`:提示词条数按合入后 `Prompts.list().length` 实计重算,单测用例数按实跑重算。

## 9. 交接

1. **两条键的契约半有意不收**(SK-03 仍欠的第一处):要收也只能连着改解析口径——`voices.includes(out.voice)` 与批量那条按 `o.name` 回填,并给"用户把契约改坏"备一条兜底(现在的兜底就是退随机推荐,行为上说得过去但用户看不出为什么突然随机了)。属产品口径题,本槽不动。
2. **这两条没有 Node 第二消费点**(SK-03 仍欠的第二处):不是欠工作量,是欠一个产品决定——headless 要不要有"按人设推音色"。若要,新消费点按同键显式传覆盖表即可。
3. **G-13 的欠段还剩 22 处**(同一 grep 口径):`js/episodes.js` 5(解说体改写 / 导演阐述 / 光影总控 / 剧本结构分析 / 剧本围读)、`js/episode-util.js` 3(摘要前三步的策划人设)、`js/sb-board.js` 2(场次节拍拆解 / 分镜文字)、`js/agent-ops.js` 2(执行核验器 / 会话纪要)、`js/persona.js` 1(文生图重写,SK-11 记账点名的那处)、`js/beatboard.js`、`js/editors.js`、`js/experts.js`、`js/gsettings.js`、`js/plans.js`、`js/proj-shell.js`、`js/proj-upload.js`、`js/role-editor.js`、`js/sb-views.js` 各 1。本槽按点名只收配音导演两处,其余一处未动。
4. 两步的 user 半、`js/roles.js` 的界面文案与批量绑定弹窗、`Voice.LIB` 音色库、`Persona` 的另外四个出口(`DIMS`/`blankPersona`/`openEditor`/`rewritePrompt`),一字未动。
