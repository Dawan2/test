# W52 · G-12 另一半:主线中段流程模板(可调用的调用顺序 + 参数出处 + 断点)

**范围**:新增 `js/flow-tpl.js`(双端 UMD 单源)、`cli.js`(新命令 `flow-template` + help 一行)、`mcp.js`(工具 `hujing_flow_template`、提示模板 `hujing_mid_pipeline`、工具名映射 `toolOf`、既有 4 个工具补 `cmd` 字段)、`js/skills.js`(SK-05 `note` 按实况更正)、`tests/unit.js`(新增 flow 套件 7 条 + contract 1 条,改 1 条既有注释与断言)、`tests/cli.smoke.js`(新增 8 条)、`README.md` 与 `docs/AI助手接入指南.md` 实况同步。
**基线**:`cursor/w50-integration-dad5`(head `371c75e`)。
**不做**:不新增计费动作、不改任何既有命令实现与 `args` 定义、不改就绪检查面表与发布门、不动 `Plans.*`、不动 SK-16/SK-25/SK-30 的 `steps`、不改既有两条提示模板、不挂浏览器消费点(见 6.3)、不摘 `gaps`。

## 1. 欠的是什么

G-12 的原文缺口是「MCP playbook 只覆盖首尾两个场景(开工 / 失败镜),主线中段无 playbook」。W46 清掉了它的投影侧那一半——`Plans.fromWorkflow` 改由 `Skills.playbook('core.playbookProjection')` 投影出命令与步序,`mcp.js` 那个零使用的 `require('./js/skills.js')` 接上第一个只读出口 `hujing_playbook`。`w46-g12-playbook-proj.md` 第 110 行与第 167 行两处如实记着:那是**只读出口,不是流程模板**;`PROMPTS` 仍是开工 / 失败镜两条,一行未动。

于是助手当下拿得到的是两种东西:

| 已有 | 它答什么 | 它不答什么 |
|---|---|---|
| `hujing_playbook` | 主线九步的**命令名与步序**(`args` 全空) | 每个参数从哪取;跑砸了怎么办;这个项目当下卡在哪 |
| `hujing_workflow` / `hujing://project/{pid}/workflow` | 这个项目**当下**卡在哪一步、有哪些 blockers | 下一步那条命令要填哪些参数、参数值从哪查 |
| `hujing_new_drama` / `hujing_failed_shots` | 首尾两个场景的完整工具序列 | 中段(主体/分集/分镜/生成)的推进 |

三者拼起来才是一次可执行的推进,而拼的活当下落在助手头上。本轮补的就是这块拼:**中段的一份机读模板 = 调用顺序 + 每个参数从哪取 + 每步的断点码与处置**,状态位现取 Domain,不是再抄一套提示词。

## 2. `js/flow-tpl.js`:模板的单源

### 2.1 三处一律现取既有单源,本层不写第二份

| 模板的哪一部分 | 现取谁 |
|---|---|
| 步序与命令名 | SK-05 主线全链投影 `Skills.playbook('core.playbookProjection')` |
| 参数面、用法串、命令中文名与 `risk` | `js/cmd-registry.js`(`byName` / `usageOf`) |
| 待办、缺前置的码与文案、在线维度 | `Domain.workflow(p, online)` 的同键主线步及其 `blockers` |
| 主线步名与步序 | `Skills.stages()` / `Skills.stageOf()` |

本层只登记注册表答不出的三件事,写在一张按命令名索引的 `STEP_META` 里:**这一投影步落在中段哪一主线步、它的待办由哪几个阻塞码判、跑砸了在哪一码上断点**。

### 2.2 中段是投影的有序切片,不是另一条链

```js
const STEP_META = {
  'project.extractSubjects':    { stage: 'subjects', codes: ['no-subjects'],        stop: […] },
  'subject.generateImage':      { stage: 'subjects', codes: ['subjects-no-image'],  stop: […] },
  'project.splitEpisodes':      { stage: 'eps',      codes: ['no-eps'],             stop: […] },
  'episode.understanding':      { stage: 'shots',    codes: [], optional: true,     stop: […] },
  'episode.generateStoryboard': { stage: 'shots',    codes: [],                     stop: […] },
  'episode.preflight':          { stage: 'gen',      codes: [], optional: true,     stop: PREFLIGHT_STOP },
  'episode.generateVideos':     { stage: 'gen',      codes: [],                     stop: […] },
  'episode.smartReview':        null,   // 有意不在中段
  'episode.compose':            null,   // 有意不在中段
};
```

- **登记为 `null` 与漏登记是两件事**,沿用 W46 给 `Plans.projection()` 定的口径:自省出口 `FlowTpl.projection()` 逐步回 `{cmd, registered, mid, stage, optional, codes}`,`registered` 查登没登、`mid` 查在不在中段。投影哪天多一步而这里没跟上,断言点名报出漏的是哪个命令(实测见 5.3 变异 1)。
- 审片与成片有意不在中段:SK-25/SK-30 各持自己那段编排,失败镜排查那条提示模板已覆盖它们的断点。
- `codes` 为空 = 这一主线步上只有这一条推进命令,待办直接看那一步 `done` 不 `done`;`codes` 非空 = 同一主线步上有多条命令(主体步的提取与生图),各自按它清掉的阻塞码分工。断言另钉一条:**同一主线步上"看整步 done"的推进命令至多一条**——否则两条命令会在同一状态下同时判 todo,`next` 就没有意义了。
- 段选择 `segment` 取 `mid`(整段)或中段某一主线步 `subjects|eps|shots|gen`,一律是同一份投影的切片:四段分开取再拼接**逐字节等于**整段(不重不漏,断言钉住);段外的主线步(如 `review`)如实抛错并附可用清单,不静默回空。

### 2.3 参数从哪取:一张按参数名索引的取数出处表

```js
const ARG_SOURCE = {
  pid: '项目 id:项目列表或新建项目回执的 id',
  epid: '分集 id:项目详情的 episodes[].id(拆集回执也带回新建的分集)',
  overwrite: '授权位:已有分集时必须由用户明示,模板不代授权',
  confirmAll: '授权位:等于替用户过确认闸,必须由用户明示;缺省先逐镜确认再跑',
  shotIds: '分镜表里筛出的镜头 id 子集(失败镜/过期镜/复审重抽);留空即整集',
  …
};
```

键是 `cmd-registry` 的参数名(跨命令同名同义),值只回答"这个值从哪来"。三条纪律由断言钉住:

1. **参数面本身不在这里写**——`name/type/required/desc` 逐项现取 `CmdRegistry.byName[cmd].args`,`cli` 调用串现取 `CmdRegistry.usageOf(m)`;
2. **每个出现在中段的参数都必须登记出处**,漏一个断言点名报出是哪个命令的哪个参数(不允许 `from: ''` 混过去);
3. **授权位与子集位一律写明由用户明示**(`overwrite`/`confirmAll`/`shotIds`/`subjectIds` 四个逐个断言),与 W44/W46 定的"编排层只给步序不预设授权"同一条纪律。模板给的是"这一位要不要给由用户定",不是给一个默认值。

### 2.4 断点:各端真会回的码,不自造错误码

每步带 `stop: [{code, how}]`。断言逐码回查源码:每个 `code` 必须在 `js/commands.js` / `cli.js` / `js/domain.js` 里以字面存在(命令层的 `blocked` 码、Domain 的 blocker 码、CLI 的 `no-credits` 一类),**自造一个上游没有的码即红**(实测见 5.3 变异 3)。授权位那两条断点(`has-episodes` / `unconfirmed`)另有断言要求处置文案写明"要用户明示",不能写成"带上 `overwrite` 重来"。

就绪检查那一步是只报不拦的结论面,它自己不会失败,故它的断点就是**它报出来的那几个阻塞码**(`PREFLIGHT_STOP`),处置统一是"回到对应步处理完再往下,不要带着阻塞项出片"。

### 2.5 缺前置进 `gaps`,不拿"步骤都在"冒充可跑

给了项目才判。段起点**之前**的主线步身上还挂着的 blockers,原样取 Domain 的码与文案进 `gaps`(本层不另判一遍,也不改写文案),并置 `ready: false`:

```json
{ "segment": "gen", "ready": false,
  "gaps": [{ "stage": "script", "stageName": "剧本", "code": "no-script", "label": "未上传剧本" },
           { "stage": "subjects", "stageName": "主体", "code": "subjects-no-image", "label": "3 个主体缺参考图" }],
  "next": { "i": 2, "cmd": "episode.generateVideos", "stage": "gen", "why": "" } }
```

缺前置**不吞掉步骤序列**:模板照出(助手仍看得到这一段长什么样),只是 `ready=false` 且 `gaps` 点名要先补哪几处。这是本轮任务书里"缺前置返回明确缺口而不是空成功"的落点,单测与冒烟各一条钉住(实测见 5.3 变异 4)。

### 2.6 `status` 的四态,与 `clear` 的措辞

| 值 | 含义 |
|---|---|
| `todo` | 它要清的阻塞项当下就在(`why` 带 Domain 那条 blocker 的原文案) |
| `clear` | 当下没有它要处理的事 |
| `optional` | 不占推进位(本集理解可复用不重扣、就绪检查只报不拦) |
| `null` | 没给项目状态:只出静态模板,不冒充状态判定 |

**`clear` 有意不叫 `done`**:主体库还空的时候,主体生图也是 `clear`——它没有事做,但那不等于"这一步做过了",该跑的是它前面那一步。`next` 取第一个 `todo`,给的就是那一步。单测专有一条钉这个措辞与 `next` 的落点。

## 3. 两个消费面:CLI 命令与 MCP 薄封装

### 3.1 `cli.js flow-template`

```
flow-template [mid|subjects|eps|shots|gen] [pid]
```

不给 `pid` 即静态模板:**不读状态、不打服务端**(未登录也答得出)。给了 `pid` 才走既有 `stateGet` 取项目并按 Domain 实况标注;项目不存在照既有口径 exit 4,未知流程段 exit 2 附可用清单。零 LLM、零计费,不发起任何生成动作。

### 3.2 `mcp.js`:工具 + 提示模板,都不手抄第二条中段链

| 出口 | 形态 | 给谁用 |
|---|---|---|
| `hujing_flow_template { segment?, pid? }` | **CLI 薄包装**(`build: i => ['flow-template', …]`),产出与同参 CLI 逐字节相同 | 机读:助手直接吃 JSON 的 `steps`/`args[].from`/`stop`/`gaps`/`next` |
| `hujing_mid_pipeline { pid, segment? }` | 提示模板,正文由 `FlowTpl.brief(tpl, { toolOf })` 渲染 | 人读/模型读:一次拿到步序、参数出处与断点,并被引导去调上面那个工具拿带状态的版本 |

**工具名这一位由 MCP 注入,不进模板层**:`js/flow-tpl.js` 里没有任何 `hujing_*` 字面(断言逐字查),`brief` 的 `ctx.toolOf(cmd)` 缺省回落命令名。`mcp.js` 侧的 `toolOf` 也不另写一张映射表——它现取**工具表自己的 `cmd` 字段**:

```js
const toolOf = cmd => {
  const t = TOOLS.find(x => x.cmd === cmd);
  return t ? t.name : 'hujing_exec(name="' + cmd + '")';
};
```

为此给 4 个既有工具补了 `cmd` 字段(`hujing_split_episodes`/`hujing_storyboard`/`hujing_understanding`/`hujing_smart_review`)——**只加字段,4 条的 `description`/`inputSchema`/`build` 一字未动**。契约断言反查:凡登记了 `cmd` 的工具,它 `build` 出来的 argv 必须真是 `['exec', <那个 cmd>, …]`,标错即红。没有专包装工具的命令(提取主体、主体生图、就绪检查)如实回 `hujing_exec(name="…")`,不编一个不存在的工具名。

## 4. 影响面(逐项)

| 面 | 变化 |
|---|---|
| `js/flow-tpl.js` | 新增(211 行,双端 UMD,零依赖) |
| `cli.js` | 新增 `flow-template` 命令 + help 一行 + 一个 `require`;其余零改动 |
| `mcp.js` 工具数 | 33 → 34;`PROMPTS` 2 → 3 |
| `mcp.js` 既有 33 个工具 | 4 个补 `cmd` 字段(纯新增),其余零改动;`RESOURCES` 与既有两条 `PROMPTS` 零改动 |
| `js/skills.js` | 只改 SK-05 的 `note`(实况更正:中段模板也由本投影切片,并写明 G-12 还欠什么);`steps`/`cmds`/`gaps`/`pending` 一字未动 |
| 计费动作 / `Tasks.run` / 命令实现 / `args` 定义 / 发布门 / 就绪检查面表 / 提示词 | 零改动 |
| `Skills.gaps()` / `playbooks()` / 拼块投影 | 逐字节不变 |
| 浏览器 | 零改动(`index.html` 未挂新脚本,见 6.3) |

## 5. 测试

### 5.1 数字

| 套件 | 基线 | 本轮 |
|---|---|---|
| `node tests/unit.js` | 380/380 | **388/388 PASS**(新增 8 条) |
| `node tests/integration.js` | 93/93 | **93/93 PASS**(零改动) |
| `node tests/cli.smoke.js` | 62/64(2 项基线失败) | **70/72**(新增 8 条全过,失败仍是同名那 2 项) |
| `node --check` | — | 改动的 5 个文件全过 |

冒烟那 2 项失败是 `master` 同名基线失败(`未登录 whoami → exit 3`、`llm --json mock 链路`),`w50-integration-log.md` 已取证,本轮未碰相关代码。未删测、未跳过、未放宽任何既有断言。

### 5.2 新增用例

flow 套件 7 条(`node tests/unit.js flow`):

| 用例 | 判什么 |
|---|---|
| 中段登记与主线全链投影逐步对齐 | 投影每一步都在 `STEP_META` 有登记(漏登记点名);审片/成片登记为 `null` 是"有意不在中段"而非漏接;中段七步的命令与步序快照;同一主线步上"看整步 done"的推进命令至多一条 |
| 步骤序列稳定、可 JSON | 同输入两次产出逐字节相同(无隐藏状态);`JSON.parse(JSON.stringify())` 往返不变;四段分开取拼接 = 整段(有序切片,不重不漏);段外主线步与胡写的段名如实抛错附清单 |
| 参数面与用法串现取 `cmd-registry` | 每步 `args` 逐项等于注册表(名/类型/必填/描述)、`cli` 串含 `usageOf` 产出;每个参数都登记了取数出处(漏登记点名);四个授权位/子集位都写明要用户明示 |
| 缺前置返回明确缺口而不是空成功 | 空项目取 `mid`:`gaps` 非空、`ready=false`,码与文案原样等于 `Domain.workflow` 那几条 blocker;齐备项目取 `gen`:`gaps` 空、`ready=true`;缺前置不吞步骤序列 |
| 待办标注取 Domain 实况 | `todo/clear/optional` 三态按 Domain 判;`clear` 不冒充"这一步做过了"(主体库空时生图是 `clear` 而 `next` 指向提取主体);`why` 取 blocker 原文案;不给项目时 `status` 一律 `null` |
| 断点码是各端真会回的码 | 每个 `stop.code` 逐个回查 `commands.js`/`cli.js`/`domain.js` 源码字面(自造即红);授权位那两条处置文案须写明要用户明示 |
| 文本渲染是同一份模板换载体 | `brief` 覆盖每一步的步意/参数出处/断点码;`toolOf` 注入的工具名逐个出现;不注入时回落命令名;`js/flow-tpl.js` 全文不含任何 `hujing_*` 字面 |

contract 套件 1 条:**MCP 中段流程模板**——`tools/list` 含 `hujing_flow_template`;工具 JSON 与 `FlowTpl.template` 直跑逐字节相同(薄包装);`hujing_mid_pipeline` 正文含每步的旁注与断点码、含 `toolOf` 注入的准确工具名(专包装工具名 / `hujing_exec(name="…")` 透传各验一例);缺必填 `pid` 回 `-32602`;源级钉两条——正文须由 `FlowTpl.brief` 渲染、工具名映射须现取工具表的 `cmd` 字段;登记了 `cmd` 的工具其 `build` argv 必须与之一致。

改 1 条既有断言(`contract · SK-05 主线全链投影`):原注释写"MCP 流程模板补主线中段那一半未接",本轮已接,注释按实况更正;`G-12` 关联索引仍在的那条断言**不放宽**,另补一条查 SK-05 `note` 已写明中段模板落点(记账诚实位,沿用 W36/W39 的口径)。

冒烟 8 条:静态模板(七步、不读状态、`status` 全 `null`/`optional`、参数出处齐)、`gen` 段带状态(`next` 落到批量生成、`ready` 与 `gaps` 一致且每条缺口都有码/文案/所属步)、缺前置 `ready=false` 且报 `no-script`、未知段 exit 2 附清单、不存在项目 exit 4、MCP `tools/list` 探测到该工具、MCP 工具产出与 CLI 同参逐字节相同、MCP 提示模板正文含每步步意与全部断点码。

### 5.3 变异验证(实测六条)

| 改坏 | 结果 |
|---|---|
| 1. `STEP_META` 漏登记一步(`episode.understanding` 改名) | 384/388,flow 三条 + contract 一条红,漏登记的命令被点名 |
| 2. `overwrite` 的取数出处改成"置 true 覆盖"(不写要用户明示) | 6/7,点名 `overwrite` 须写明要用户明示 |
| 3. 断点表加一个上游没有的码(`quota-exceeded`) | 6/7,点名 `episode.generateVideos → quota-exceeded` 不是真会回的码 |
| 4. `gaps` 恒空 / `ready` 恒真(缺前置吞掉) | 387/388 且冒烟 69/72,单测点名"无剧本时不应报可跑"、冒烟点名缺口为空 |
| 5. 在模板层写死工具名(`hujing_exec` 当回落值) | 6/7,点名缺省应回落命令名(模块内不得出现工具名) |
| 6. MCP 提示模板改手抄步序(不走 `FlowTpl.brief`) | 51/52,点名正文缺投影旁注 `episode.preflight` |

六条全部还原后回到 388/388。

## 6. 如实记录

1. **与 W46 的边界**:W46 做的是**投影侧**——`Plans.fromWorkflow` 改由投影生成、`hujing_playbook` 把注册表读出来。它答的是"主线有哪几步、叫什么名字"。本轮做的是**模板侧**:同一份投影切出中段,补上注册表答不出的三件事(参数从哪取、断点在哪一码、这个项目当下卡在哪),让助手能照着跑而不是照着念。两者共用一份 `core.playbookProjection`,谁也没有第二条命令链:W46 的自省出口是 `Plans.projection()`,本轮是 `FlowTpl.projection()`,两处都把"有意不占位"与"漏接"分开。
2. **G-12 没有清账**,`gaps` 一字未动。它的第三个落点仍欠:SK-25 `note` 第 1174 行记着发布留痕两端在领域命令注册表之外,编排层为它挂不出命令名(命令化待 G-12)。SK-05 的 `note` 本轮改成写明"中段模板也由本投影切片"+"仍欠发布留痕命令化",沿用 W36 定的记账诚实位口径(点名仍欠什么,不把"落地一面"写成"整条清完")。
3. **模板不代授权、不新增计费**:模板本身零 LLM 零计费,`hujing_flow_template` 与 `cli flow-template` 都不发起任何生成动作;它列出的每一步仍走既有命令层,计费五件套与确认闸原样生效。授权位一律写明要用户明示,和 W44/W46 的 `args` 留空是同一条纪律的两种载体。
4. **`hujing_flow_template` 是薄封装,`hujing_playbook` 是本地直读**,两者有意不同:前者要读项目状态(得走 CLI 的 `stateGet`),故不能用 `local` 分支;后者只读注册表,才免了子进程。代价是前者在给 `pid` 时需要登录——不给 `pid` 的静态模板仍然未登录可用,冒烟第一条就是这么跑的。
5. **没有挂浏览器消费点**:`js/flow-tpl.js` 是双端 UMD(不碰 `window`、依赖经参数注入),但 `index.html` 本轮未加载它——浏览器里"下一步"由流程条与 `Plans` 承担,当下没有第二个消费方。留成最小改动,哪天前端要用,加一行 `<script>` 即可(依赖顺序须在 `domain.js`/`skills.js`/`cmd-registry.js` 之后)。
6. **本轮没有做的**:没有把中段模板做成可一键执行的编排(它仍是一张表,每一步跑不跑由调用方决定)、没有给审片/成片段补模板(那两段各由 SK-25/SK-30 与失败镜排查模板承接)、没有动既有两条提示模板、没有新增 SKILL.md 之类的市场/沙盒、没有抬发布门与任何 warn→fail。
