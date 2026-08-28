# W210 停工位:成片已是最新时,自动/主线步不重跑也不扣费(点名重来照旧真跑)

基线 `cursor/w205-integration-1816`,tip `a2e08b6`。本尖已有 `Domain.epComposedReady` / `composedInputHash`。
W206–W209 一律跳过,W207 一行没 cherry-pick(它只加了「空跑不是 ok」的契约测、产品零改)。
在飞的 W203 / W204 / W208 按任务口径**一条没碰**。

## 一、停工位判定:**成立**,但只成立在"没人点名"的那一半

W207 留下的这一格是:**同一份输入拼出的必然是同一条成片,而 `ff.compose` 是真钱**。
`js/commands.js` 的 `episode.compose` 此前**无条件重跑**,而同一棵树上另外两处投影早就按
`Domain.epComposedReady` 判「这一集没必要重跑」——`js/plans.js` 的 `TODO_OF['episode.compose']`
(`st.composedReady ? null : …`,不出这一步)与 `js/issues.js` 的 `composed-stale`
(`ep.composed && !st.composedReady` 才报)。**三方读同一个位,却只有命令层照跑照扣。**

### 基线 live 举证(不是读源码猜)

`vm` 沙箱按 `index.html` 顺序加载真实的 `domain / knowledge / prompts / skills / wf-core / cmd-registry / commands`,
`SB.composeVideo` 打成与 `sb-io.doCompose` 同口径的收费桩(`Tasks.start` → `U.charge(COST.compose)` → 写回成片四件套),
夹具是一个**已合成且指纹未变**的健康集(两镜均 `video.status='done'`、`composedInputHash` / `composedDialogueSig` /
`composedSourceRev` / `composedGraphRev` 就位)。同一份探针在基线 `a2e08b6` 与本尖各跑一遍:

| 读数 | W205 基线 | 本尖 |
|---|---|---|
| 前提 `Domain.epComposedReady` | `true` | `true` |
| 前提 `episodeState.status` | `done` | `done` |
| ① 一键成片 `episode.produce` 净扣费 | **3** | **0** |
| ① 合成引擎(`composeVideo`)调用次数 | **1** | **0** |
| ① `ff.compose` 收费笔数 | **1** | **0** |
| ① 编排里 compose 步的 `cost` | **3** | **0** |
| ② `episode.compose`(headless)status / 净扣费 | `done` / **3** | `done` / **0** |
| ② `episode.compose`(`ui:true`,无 force)净扣费 | **3** | **0** |
| ③ 计划投影 `st.composedReady` | `true` → 不出计划步 | 同 |
| ③ 问题中心 `composed-stale` 条目数 | **0** | **0** |
| ④ CLI `exec episode.compose` 发往 `/api/ffmpeg/compose` 次数 | **1** | **0** |
| ④ CLI `hujing compose` 原语发往 ffmpeg 次数 | **1** | **1**(有意不变) |

第 ③ 行两格是这一格的要害:**投影与问题中心当场说"没必要重跑",命令层照旧扣了 3 分。**
`ff.compose` 的落点是 `server.js` 那张 `compose: 'ff.compose'` 表,CLI 那一端按 `/api/ffmpeg/compose`
这次往返记账,故 CLI 侧读的是往返次数而不是本地钱包差值。

### 任务给的两条否决条件都不满足

- **「所有入口都是用户明确点合成」——不成立。** 走到 `episode.compose` 的路里有三条根本没人按合成键:
  `episode.produce` 的第 4 步(一键成片 / 跑批 `produce.js` 逐集调它)、`Plans.execStep`
  下发的计划步、导演助手 `ACT_CMD` 映射的 run 类 op。头一条尤其明确:用户按的是"一键成片",
  在镜头都已出片、成片也已是最新时,那一按今天净扣 3 分换回一条逐字节相同的成片。
- **「文案不说跳过」——不成立。** 问题中心那条 `composed-stale` 的正文写的就是
  「合成输入或剧本已变化,需重新合成」,即"没变化就不必重新合成"是**已经写在产品文案里**的口径;
  计划层更直接,`composedReady` 为真时那一步压根不生成。

**但另一半不成立**,故不做成"一律跳过":工作区顶栏「合成成片」、流程条成片步、剪辑台与预览窗的
「合成成片」、问题中心「▶ 重新合成」这几处,是用户自己按下去的重来(换过转场想再渲一遍、
想覆盖掉手改过的时间线)。挡掉它们等于一颗点了没反应的按钮——本槽为这一半留 `force`。

## 二、改法:一道闸 + 一位授权,判据现取 Domain

**判据不另立第三份指纹。** 命令层读的就是计划投影与问题中心读的那一份 `Domain.epComposedReady`:

```js
if (!args.force && Domain.epComposedReady(ep, online())) {
  const r = ok({ url: ep.composedUrl || '', count: (ep.shots || []).length, fresh: true });
  r.next = nextOf(p, ep);
  return r;
}
```

位置在无分镜 / 失败镜两道前置 `blocked` **之后**、`composeVideo` 之前——扣费还没发生,
故这条路上 `Tasks.run` 那套(登记→扣费→执行→失败退费)一次都不起,`metered` 量出的 `cost` 自然是 0,
不存在"扣了再退"的空转。回执带 `fresh: true` 且 `url` 是**原来那条**成片(不是新拼的),
`next` 照旧由 Domain 重推。

**这不是 `emptyBatchNote` 那类成功档 note。** 按任务口径一个字没往 compose 上加:
`fresh` 是结果字段不是文案,拦截档(无分镜 / 失败镜)原样保留各自的可见错。

`force` 这一位登记进 `js/cmd-registry.js` 的 `episode.compose` 参数表
(`{ name: 'force', type: 'boolean' }`)——不登记的话 Agent 侧 `WfCore.sanitizeCmdArgs` 会把它抹掉,
点名重来根本传不进去(变异 M9 就红在这里),CLI 用法清单与 MCP 工具描述也同读这一份。

### 六个点名入口带 `force`,三条自动路一律不带

| 入口 | 文件 | 带 `force` | 理由 |
|---|---|---|---|
| 工作区顶栏「合成成片」 | `js/storyboard.js` | ✅ | 用户按的就是这颗键 |
| 流程条「下一步」成片步 | `js/storyboard.js` | ✅ | 同上 |
| 流程条「上一步」成片步 | `js/storyboard.js` | ✅ | 同上 |
| 剪辑台「合成成片」 | `js/sb-views.js` | ✅ | 同上 |
| 预览窗「合成成片」 | `js/sb-io.js` | ✅ | 同上 |
| 问题中心「▶ 重新合成」 | `js/issues-ui.js` | ✅ | 逐条点名的处置 |
| 一键成片 `episode.produce` 第 4 步 | `js/commands.js` | ❌ | 编排自动步 |
| 计划步 `Plans.execStep` | `js/plans.js` | ❌ | 自动步不代授权 |
| 导演助手 run 类 op(`ACT_CMD`) | `js/agent-ops.js` | ❌ | 按任务口径一个字没碰,自然吃这道闸 |

问题中心那一处**按命令名逐条登记**(`FORCE_FIX = ['episode.compose']`)而不是给处置口一律带上:
`force` 在各命令里不是同一个意思——`project.release` 的 `force` 是「未过发布门也强打版本」,
处置口无差别带上等于替用户签了别处的授权。今天 `js/issues.js` 只挂三条命令
(`episode.generateStoryboard` / `episode.generateVideos` / `episode.compose`)故还撞不上,
但这一位是按命令语义登记的,不是按"点没点"登记的。

### 计划步的尾注要说实话

`js/plans.js` 的 `execStep` 记 `done` 时,尾注原本只写 `-N积分`;一步真没花钱时那句就是空白,
读起来与真跑了一轮一模一样。现补一句 `已是最新,未重跑`(只在 `r.result.fresh` 时出,
真跑那一档照旧只报成本)。

### CLI 那一端另有一格:渲染参数不进指纹

`cli.js` 的 `EXEC['episode.compose']` 与浏览器命令层**各写一份**前置判定(两端形态不同,谁也不替谁作证),
判据同样现取 `Domain.epComposedReady`。多出来的一格是 `--ratio` / `--subtitle`:
这两个渲染参数**不在成片指纹里**(指纹读的是 `ep.sbConfig` 那一份),给了却按"已是最新"回绝,
等于把用户点的画幅 / 字幕开关静默吞掉再回一句「已是最新」。故这两位与 `--force` 同等,给了就按点名重来跑。

`hujing compose` 那条原语**有意不吃这道闸**:它本身就是"按这些参数现渲一条"的人手动作。

## 三、live 数字(全部现跑,一个不抄)

| 口径 | W205 基线 | 本尖 live |
|---|---|---|
| `unit` | 613 | **617** |
| `commands` 套件 | 39 | **42** |
| `plans` 套件 | 16 | **17** |
| `contract` 套件 | 135 | **135**(未加契约用例) |
| `issues` 套件 | 21 | **21** |
| `integration` | 143/143 | **143/143** |
| `cli.smoke` | 107/109 | **107/109** |
| `GUARD_TOPICS` / `TOPIC_FLOOR` | 19 / 19 | **19 / 19**(本槽未登记新主题) |
| `gaps()` 键数 | 20 | **20**(一个键没拆,`G-10` 十项一字未动) |
| 记账件份数 | 218 | **219**(含本文) |

`cli.smoke` 两条失败(`未登录 whoami → exit 3`、`llm --json mock 链路`)与基线同名同表现,
是与 `master` 同源的既有失败,不由本槽引入;分母按 live 点数得 **109**。
`unit` 的 `FLOOR` 由 613 抬到 617(差额 4 格已超 3 格上限,不抬会红在棘轮那条上),
记账件 `FLOOR` 由 218 抬到 219;`integration` / `cli.smoke` 两格 `FLOOR` 按 live 就位、未动。

新增 4 条:`commands` 三条(自动步不重跑 / 点名重来不被挡 / CLI exec 那一端),`plans` 一条(尾注与不代授权)。

产品面相对基线只有 8 个文件:`js/commands.js`(+10 −1)、`js/cmd-registry.js`(+2 −2)、
`cli.js`(+10 −1)、`js/issues-ui.js`(+8 −1)、`js/plans.js`(+2 −1)、
`js/storyboard.js`(+3 −3)、`js/sb-views.js`(+1 −1)、`js/sb-io.js`(+1 −1)。
`js/domain.js` / `js/issues.js` / `js/skills.js` / `js/produce.js` / `js/agent-ops.js` /
`js/release.js` / `js/wf-core.js` / `server.js` / `mcp.js` **逐个零 diff**——
故 `Domain.epComposedReady` 与 `composedInputHash` 一个字没动(本槽是它的**第三个消费方**,不是第二份实现),
G10 门槛含义、agent-ops、CLI `sbConfig` 写回、`produce` attempt 落库、`gaps()` 键都结构性保持。

## 四、反事实:证明这四条用例在基线上真的没人接

把 tip 的 `tests/unit.js` 原样喂给基线 `a2e08b6` 的产品码:

- `commands` **红 3**(「回执得说清这一次没重跑」两条 + 「`js/storyboard.js` 的点名入口应各带 force:期望 3,实际 0」)
- `plans` **红 1**(「尾注得说清这一步没花钱也没重跑」)

而基线自己是 **613/613 全绿**、`commands` 39/39、`plans` 16/16 ——
一条判据都接不住,这正是它当时被记成 W207 残留的原因。

## 五、变异抽查

合完的产品码上现跑,每手改完即还原;每手都先确认**变异真落在被测那一段上**(替换式命中、文件确有 diff),
再读红数。

| # | 变异 | 红 | 报在哪 |
|---|---|---|---|
| M1 | 摘掉「已是最新就不重跑」那道闸(自动步照旧真扣费) | **1** | `commands`:「回执得说清这一次没重跑,否则与真跑完一模一样」 |
| M2 | 把点名重来也一并挡掉(`!args.force &&` 去掉,`force` 位失效) | **1** | `commands`:「点名重来跑的是真合成,不该报"已是最新"」 |
| M3 | 问题中心 `FORCE_FIX` 清空(「▶ 重新合成」被挡) | **1** | `commands`:三条处置的 `force` 实况读出 `[compose:null,…]` |
| M4 | 工作区顶栏合成按钮不带 `force` | **1** | `commands`:`js/storyboard.js` 期望 3、实际 2 |
| M5 | 计划步替用户按下「照旧重来」(`execStep` 注入 `force: true`) | **1** | `plans`:「计划步不许替用户点名重来」 |
| M6 | 回执把「已是最新,未重跑」吞掉 | **1** | `plans`:尾注读出空串 |
| M6b | 把那句改成恒有(真花钱的步也说「未重跑」) | **1** | `plans`:`-3积分已是最新,未重跑` |
| M7 | CLI `exec` 那一端摘掉同一道闸 | **1** | `commands`:CLI 那条「回执得说清这一次没重跑」 |
| M8 | CLI 把 `--ratio`/`--subtitle` 也当作「已是最新」静默吞掉 | **1** | `commands`:「点了画幅就得按点名重来跑」期望 1、实际 0 |
| M9 | 注册表不登记 `force` 授权位 | **1** | `commands`:「没登记 Agent 侧 `sanitizeCmdArgs` 会把它抹掉」 |
| M10 | 预览窗「合成成片」不带 `force` | **1** | `commands`:`js/sb-io.js` 期望 1、实际 0 |
| M11 | 剪辑台「合成成片」不带 `force` | **1** | `commands`:`js/sb-views.js` 期望 1、实际 0 |

M1 与 M2 值得并读:它们是**同一行的两个反方向**——M1 是"闸没装",M2 是"闸装得太宽把点名也挡了"。
任务给的两条口径("自动步仍扣费要红""强制入口被跳过也要红")各自对上一手,两手分别报在不同用例上、
没有一条用例同时接住两头,即这道闸的**宽窄两向都被钉住**,不是靠一条断言两头都蒙对。

M5/M6/M6b 三手落在计划层同一段上但分工可辨:M5 报的是"自动步代授权",M6 报的是"没说实话",
M6b 报的是"话说过了头"(把诚实回执写成恒有,每次真花钱的步都会说"未重跑")。

M3 与 M9 是这道闸的两条**传导路**:前者是点名信号在浏览器侧没发出来,后者是信号发了但在
Agent 参数整形处被抹掉——同一颗按钮点了没反应,原因在两个不同的层,故各留一手。

## 六、口径复核(现取,不靠推断)

- **判据只此一份**:全仓 `epComposedReady` 的定义仍只在 `js/domain.js`,本槽三个消费方
  (命令层 / 计划投影 / 问题中心)加 CLI 那一端都是**调用**它,没有任何一处重抄指纹字段。
- **计费仍走 `Tasks.run` 那一套**:跳过这条路上一次 `U.charge` 都不发,故不存在扣了再退;
  真跑那一档(判旧 / 点名重来)`ff.compose` 照旧扣满,`metered` 的 `cost` 为钱包前后差值。
- **拦截档一个字没改**:无分镜 → `blocked('no-shots')`、失败镜 → `blocked('failed-shots')`
  仍在这道闸之前,`ui` 模式的素材不齐确认与取消静默(`blocked('cancelled')`)原样。
- `gaps()` **20 键**未拆、`G-10` 十项一字未动;`GUARD_TOPICS` / `TOPIC_FLOOR` **19 / 19**,
  本槽**没登记新主题**(按任务口径)。
- `hujing compose` 原语、`produce` attempt 落库、CLI `sbConfig` 写回面均零 diff。

## 七、残留

1. **导演助手那条路今天是"自动"办的,但它其实介于两者之间。** `js/agent-ops.js` 的 `ACT_CMD`
   把「合成成片」这个动作词映射到 `episode.compose`,用户是在对话里说了"合成"才走到这里的——
   按字面它更像点名,按形态它是程序发起。本槽按任务口径**一个字没碰 agent-ops**,故它现在吃这道闸:
   成片已是最新时会回一句 `fresh`,不重跑。要改判的话改的是 `ACT_CMD` 那一侧带不带 `force`,
   与本槽这道闸无关。
2. **`force` 这一位今天只靠用例名与源级计数活着,没有进 `GUARD_TOPICS`**(按任务口径本槽不登记)。
   六个点名入口里有三个是靠"文件里 `force: true` 出现几次"钉的(`storyboard` 3 / `sb-io` 1 / `sb-views` 1),
   这种计数式断言挡得住"删掉一处",挡不住"挪到另一个不相干的 `Commands.execute` 上"——
   问题中心那一处已经改成真跑一遍读实况(`loadIssues` + `issues-ui.js` 沙箱),
   另外三处是大视图文件、今天还没有可直跑的沙箱。要收这一格得先给这三个文件搭沙箱。
3. **`--ratio` / `--subtitle` 不进成片指纹这件事本身没变。** 本槽只是让 CLI 在收到这两位时按点名重来跑,
   绕开了"静默吞掉用户的画幅选择"这个后果;但浏览器那一端改画幅走的是 `ep.sbConfig`(**进**指纹),
   两端形态本就不同,故没有统一。若日后要让 CLI 的 `--ratio` 真正参与判旧,得先决定
   "一次性渲染参数"要不要进 `composedInputHash` —— 那会连带影响 `composed-stale` 的报法。
4. **跳过这一档没有留痕。** 真跑会在 `Tasks` 里留一条记录,跳过则什么也不写;
   `cost: 0` + `fresh: true` 只活在这一次调用的回执里,事后从操作流水上看不出
   "这一集在某时刻被请求合成过、因为已是最新所以没跑"。今天够用(回执当场可见、计划步尾注也说了),
   但要做"这个月替用户省了多少次重复合成"这类账,得另有落点。
