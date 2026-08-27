# W46 · G-12 一半:计划步骤由主线全链 playbook 投影生成 + MCP 注册表只读出口

**范围**:`js/plans.js`(`fromWorkflow` 改投影 + 新增自省出口 `Plans.projection()`)、`mcp.js`(注册表只读工具 `hujing_playbook` 与 `local` 分支)、`js/skills.js`(SK-05 `note` 按实况更正)、`tests/unit.js`(新增 4 条用例、改写 4 条既有用例的断言、plans 沙箱补三个加载点)、`README.md` 与 `docs/AI助手接入指南.md` 实况同步。
**基线**:`cursor/w44-sk05-playbook-22f3`(head `b86ead5`)。
**不做**:不改任何命令实现与命令 `args` 定义、不改就绪检查面表、不补 MCP 流程模板(G-12 的另一半)、不动 `Plans.generate`(LLM 规划那条路径)、不动别条的 `pending`/`gaps`、不新增 LLM 调用与计费动作。

## 1. 改前的实况:同一条主线在两处各写一遍

W44 把 SK-05 的 `steps` 从空补成主线端到端九步,`Skills.playbook('core.playbookProjection')` 从 `null` 变成一张步骤表。但那张表当时**没有消费方**:

`js/plans.js` 的 `fromWorkflow` 自己手写了一条命令链——逐集一串 `else if`,把 `episode.generateStoryboard` / `episode.generateVideos` / `episode.smartReview` / `episode.compose` 四个命令名与它们的先后次序**又写了一遍**,主体缺图作前置导航步。也就是说主线步序在仓里有两份字面来源:注册表里那九步,和计划层这一串 `else if`。改一处不会带动另一处。

`mcp.js` 第 19 行 `require('./js/skills.js')` 也在,`w44` 第 107 行如实登记过:该文件里**零使用点**。

本轮做两件事,都是 G-12 的投影侧:计划步骤改由投影生成、给 mcp.js 那个 `require` 接上第一个只读出口。

## 2. `plans.js`:投影给命令与步序,计划层只给状态判定

### 2.1 分工

```js
const CHAIN_ID = 'core.playbookProjection';
const chainOf = () => ((window.Skills && Skills.playbook(CHAIN_ID)) || { steps: [] }).steps;
```

投影负责**有哪些步、按什么顺序**;计划层负责**这一步在当下待不待办、文案怎么写**。后者是一张按命令名索引的取材器表:

```js
const TODO_OF = {
  'project.extractSubjects':    ({ p })          => …,   // 有剧本原文而主体库空
  'subject.generateImage':      ({ p })          => …,   // 有主体缺参考图
  'project.splitEpisodes':      ({ p })          => …,   // 有剧本原文而没有分集
  'episode.understanding':      null,                    // 不占计划步(见 2.4)
  'episode.generateStoryboard': ({ ep, st, hash }) => …, // 缺正文 / 未拆镜 / 分镜判旧
  'episode.preflight':          null,                    // 不占计划步(见 2.4)
  'episode.generateVideos':     ({ ep, st, hash }) => …, // 失败镜 / 待出镜 / 过期镜 / 未确认镜
  'episode.smartReview':        ({ ep, st })      => …, // 未审 / 判旧 / 低分
  'episode.compose':            ({ ep, st })      => …, // 未合成 / 成片判旧
};
```

取材器只回 `{key, label, goto?}`。**命令名不由它给**:落成计划步那一步是

```js
step.cmd = proj.cmd;   // proj 是投影步,不是取材器的返回值
```

所以取材器里就算写了 `cmd`,也会被投影原样盖掉(实测见第 5 节变异 3:在取材器里塞一个别的命令名,产出逐字节不变)。计划层因此没有"手写第二条链"的写法可用。

### 2.2 排法

- 项目级步(`needs` 不含 `ep`)按投影步序排在前:提取主体 → 主体生图 → 剧本拆集;
- 集级步逐集取该集在投影上的**首个**待办步(与旧版"逐集只出一步"、与流程条"下一步"同粒度);
- 集级/项目级不在本层另立作用域表,现取 `CmdRegistry.byName[cmd].needs`;
- 上限仍是 12 步。

旧版那串 `else if` 的优先级(缺剧本 → 未拆镜 → 判旧重拆 → 失败镜 → 待出镜 → 过期镜 → 未确认 → 审片 → 合成)**不是被重排,而是被投影步序接管后逐条落回原位**:前三条同属"分镜"那一步的取材器内部次序,中间四条同属"批量生成"那一步,审片与合成各自一步——投影步序与旧优先级同序,故既有产出不变(变的只有 2.3 那两处)。

### 2.3 产出的两处实际变化

| 变化 | 说明 |
|---|---|
| 主体缺图那一步:导航步 → 命令步 | 旧版只能跳转 `#/project/{pid}/roles` 让用户自己点;现在映射投影里的 `subject.generateImage`(`args` 空 = 全部缺图主体),headless 与 UI 都能真跑。计费与确认闸原样走命令层(`ui: true`,`Tasks.run` 五件套不变) |
| 新增两个项目级步 | 有剧本原文而主体库空 → `project.extractSubjects`;有剧本原文而没有分集 → `project.splitEpisodes`。旧版这两种项目根本推不出计划(`fromWorkflow` 只逐集看,没有分集就回 `null`) |

拆集那一步只在**没有分集时**出,故空 `args` 就够用——已有分集时它不待办,不存在"要么代授权 `overwrite` 要么出不来"的两难。

### 2.4 需要授权或需要人工挑选的状态,一律出导航步

`args` 照投影原样(主线全链一律空),计划层也不补:

| 状态 | 计划步形态 | 为什么不挂命令 |
|---|---|---|
| 缺剧本正文 | 导航(补充剧本) | 没有任何注册命令能替用户写正文 |
| 分镜判旧 | 导航(重新拆镜) | 重拆整表覆盖已有分镜(含已出片镜),覆盖属人工决策 |
| 素材已更新的过期镜 | 导航(重生成过期镜) | 要按 `shotIds` 挑子集,子集范围是调用方的断点决策 |
| 未确认镜 | 导航(确认镜头) | 挂命令就得带 `confirmAll`,等于替用户过了确认闸 |

两个投影步**不占计划步**,理由写在表里:

- `episode.understanding` 是智能分镜编排的内部第一步(已有理解可复用、不重扣),单列一步等于让用户为同一件事按两次;
- `episode.preflight` 是 `risk: 'read'` 的零 LLM 零计费结论面、只报不拦(出片前置检查单屏与一键成片内部各自已跑),它不是"待办事项"。

登记为 `null` 与"漏登记"是两件事:自省出口把它们分开——

```js
Plans.projection()  // → [{cmd, ep, registered, occupies}, …] 与投影逐步对齐
```

`registered` 查有没有登记取材器,`occupies` 查它占不占计划步。投影哪天多一步而这里没跟上,断言点名报出漏的是哪个命令(实测见变异 1)。

### 2.5 投影缺位时不兜底

`chainOf()` 拿不到步骤(skill 索引未加载)或 `CmdRegistry` 不在时,`fromWorkflow` 直接回 `null`——如实不出计划,不退回一份手写链。浏览器里两者的加载点都在 `plans.js` 之前(`index.html`:`domain → knowledge → skills`,`cmd-registry` 在 `plans` 前一行),这条只是兜底纪律。

## 3. `mcp.js`:注册表只读工具(那个 `require` 的第一个出口)

新增一个工具,直读注册表答复:

```
hujing_playbook  { id?: string }
  → { playbooks: [{ id, title, steps: [{cmd, args, note}] }], checks: [{stage, name, items[]}] }
```

- **不经 CLI**:工具表新增可选字段 `local`,`callTool` 在 `runCli` 之前分流。它不起子进程、不打服务端、不产生任何计费动作,**未登录也答得出**(实测用例把 `HUJING_SERVER`/`HUJING_TOKEN` 清空后照样拿到结果)。
- **不抄第二份内容**:`playbooks` 现取 `Skills.playbooks()`(缺省全部,给 `id` 取一条),`checks` 的面与条现取 `Skills.preflightStages()` 与各条目的 `checks` 登记——面数与条数由注册表实况定,MCP 侧不写死。
- **不预授权**:步骤只给命令名、步序与旁注,`args` 是投影原样(全空)。助手照步序自己拼 `hujing_exec` 的参数;授权位(`overwrite`/`confirmAll`/`riskyCompose`)与子集位(`shotIds`/`subjectIds`)要不要给,由它按情况决定,本工具不代它做危险决定。
- 未知 `id` 如实报错并附可用清单(`isError: true`),不静默回空。

一条口径说明:这里做的是**只读出口**,不是 G-12 里那条"MCP 流程模板补主线中段"。`PROMPTS` 仍是开工 / 失败镜两条,一行未动。

## 4. 影响面(逐项实测)

| 面 | 变化 |
|---|---|
| `Plans.fromWorkflow` 的命令与步序 | 手写 `else if` 链 → 现取 `Skills.playbook('core.playbookProjection')` |
| 计划产出 | 主体缺图步由导航步变命令步;新增提取主体 / 剧本拆集两个项目级步(见 2.3);其余步的 `key`/`label`/`epid`/`goto` 逐字节不变 |
| `Plans.projection()` | 新增(自省出口,只读) |
| `Plans.execStep` / `runAll` / `replace` / `summary` / `openModal` / `badgeHTML` | 零改动(步骤结构未变:命令步仍 `{cmd, epid}`,导航步仍 `{goto}`) |
| `Plans.generate`(LLM 规划) | 零改动 |
| `mcp.js` 工具数 | 32 → 33(新增的那个不经 CLI、不计费) |
| `mcp.js` 的 `PROMPTS` / `RESOURCES` / 既有 32 个工具 | 零改动 |
| `js/skills.js` | 只改 SK-05 的 `note` 文字(实况更正);`steps`/`cmds`/`gaps`/`pending` 一字未动 |
| 命令实现 / 计费动作 / 发布门 / 提示词 / 就绪检查面表 | 零改动 |
| `gaps: ['G-12']` | 保留(见第 6 节) |

## 5. 测试

`node tests/unit.js` **371/371 PASS**(基线 367/367,新增 4 条用例)。未删测、未放宽任何既有断言。

新增 4 条用例:

| 用例 | 判什么 |
|---|---|
| plans · 命令与步序取自主线全链 playbook 投影 | 自省表与投影逐步对齐;投影每一步都登记了取材器(漏登记点名报出是哪个命令);只有理解与就绪检查不占计划步;计划步的命令一律落在投影上;所有计划步 `args` 为空 |
| plans · 项目级前置按投影步序出 | 只有一份整部剧本时前两步就是提取主体 → 拆集,且拆集不预设 `overwrite`;已有分集时拆集步不再出;缺正文集出导航步 |
| plans · 需授权/需人工挑选的状态一律出导航步 | 重拆覆盖、过期镜子集、确认闸三处都不挂命令(逐条点名) |
| contract · MCP 注册表只读工具 | `tools/list` 含该工具;步骤表逐步等于注册表投影;`args` 全空且每步带旁注;校验面与各面条目等于单源面表实况;缺省列全部 playbook;未知 id 如实报错并附清单;源级钉住 `local` 分流在 `runCli` 之前 |

改写 4 条既有用例的断言(按实况更正,不放宽):

- `plans · fromWorkflow 按各集状态推导步骤`:补图步的断言从"含该文案"补成"映射 `subject.generateImage` 且不挂 `epid`";
- `plans · replace+execStep`:步骤 0 的断言从"是导航类"改为"是项目级补图命令步"(该步形态本轮变了,见 2.3);
- `plans · runAll 导航步骤到位即停`:夹具改为"缺正文集 + 未拆镜集",继续用一个真的导航步验证"到位即 done、后续命令步失败即停"(原夹具靠补图步当导航步,现在它是命令步了)。
- `contract · 审片升为主线一等步骤(G-03)`:原断言用正则查 `plans.js` 源码里 `rv:.*cmd: 'episode.smartReview'` 这行字面——投影化之后源码里不再有命令字面,这条会永久点不住。改钉行为:未审集推出来的那一步就是 `episode.smartReview`,且审片在计划层是 `occupies` 的投影步。

plans 沙箱补三个加载点(`knowledge.js` → `skills.js` → `cmd-registry.js`,与 `index.html` 同顺序)。

**变异验证(实测六条)**:

| 改坏 | 结果 |
|---|---|
| 投影加一步(`shot.generateVideo`)而计划层不登记取材器 | 369/371,漏登记点名 + 九步序列断言红 |
| 投影里给拆集预写 `overwrite: true` | 368/371,plans / skills 契约 / MCP 只读工具三处红 |
| 取材器里塞一个别的命令名(`episode.produce`) | **371/371,产出逐字节不变**——命令名由投影盖写,取材器给不出命令(见 2.1) |
| 绕过投影,直接往计划里手写一步 | 363/371,plans 七条 + G-03 那条红 |
| 确认镜头那一步改挂命令(等于要 `confirmAll` 代授权) | 370/371,点名"确认镜头不应挂命令"红 |
| MCP 只读工具改走 CLI(`local` 分流关掉,回落 `whoami`) | 370/371,只读工具用例红(拿不到 playbook JSON) |

六条全部恢复后回到 371/371。

## 6. `gaps` 一字未动:G-12 仍挂账

G-12 的定义是"MCP playbook 只覆盖首尾两个场景(开工 / 失败镜),主线中段无 playbook",在本仓有两个投影落点。本轮清掉第一个,第二个仍在:

1. ~~`js/plans.js` 的计划步骤改由 `Skills.playbook` 投影生成~~ → 本轮落地;
2. `mcp.js` 的 `PROMPTS` 补主线中段那条流程模板 → **未动**。

口径与 SK-03/SK-04/SK-16/SK-23/SK-05 一致:`note` 写明已落地实况与仍欠什么,`gaps` 投影不在功能轮里摘。`Skills.gaps()` 因此逐字节不变,`Skills.gaps()['G-12']` 仍反查到 SK-05/SK-25/SK-30 三条;`w44` 第 3 节记的两个落点,本文把第一个划掉。

`w33-next-pending-check.md` 第 145 行记的卡点("计划步骤改由注册表投影生成会改既有计划产出,须单列一轮做等价对照")到此执行完毕:本轮就是那一轮,等价对照的结论是 2.2(既有优先级逐条落回原位)与 2.3(两处有意的产出变化)。

## 7. 如实记录

1. **计划产出确实变了两处**(2.3),不是零行为改动:补图步能真跑生图了、只有整部剧本的项目现在也推得出计划。两处都是投影本来就有的步,不是本轮新造的语义;两处都仍走命令层的确认闸与计费五件套,没有绕过任何守卫。
2. **取材器仍是计划层的一份逻辑**,只是它不再持有命令名与步序。"这一步待不待办"必须看 `Domain.episodeState`,那部分判定本来就在 Domain 单源里,取材器只做读取与文案。
3. **投影的九步没有全部占位**:理解与就绪检查按 2.4 的理由登记为 `null`。这是有意的选择性投影,不是漏接——自省出口与断言把"选择"和"漏"分开,谁要让它们占位,改 `TODO_OF` 一处即可(断言会要求同步更新那条点名快照)。
4. **MCP 侧只做了只读出口**,没有让 playbook 变成可执行编排:助手拿到的仍是一张步骤表,每一步要不要跑、带什么授权,由它自己决定。
5. **本轮没有做的**:没有补 MCP 主线中段流程模板、没有把投影接进 `Plans.generate`(LLM 规划仍按用户目标自由拆步)、没有给 `mcp.js` 加只读**资源**(`resources/*` 走 CLI argv,接它要另配 CLI 命令,不在本轮范围)、没有动 SK-26 那条剩余 `pending`。
