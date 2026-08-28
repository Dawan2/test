# W180 · 发布门 G1 未过门时的一键处置改按受阻集实况派(「仅进行分集」那一态不再是死按钮)

**基线**:`cursor/w174-integration-7f3d`(`b1f5fd6`)。**未合并其它并行槽**(W172/W173/W175/W176/W177/W178/W179 一条没取、没 cherry-pick)。
**分支**:`cursor/w180-g1-extract-split-54d7`。
**范围**:`js/domain.js` 新增一份派生 `D.epFixOf`(+20 行)、`js/release.js` G1 未过门那一段改读它(3 行改 12 行)、
`tests/unit.js` +3 用例(**547 → 550**)并把一条既有契约用例改强、`README.md` 两处(用例数、G1 门描述)。
**不做**:不动任何门的 pass 条件(G1 仍逐集读 `Domain.episodeState` 判 `ep.content`,一个字不读 `p.script`)、
不拆 `gaps()` 键、不碰 G4 / `staleShotSplit` / `generateVideos` 的 `shotIds` 子集、不给 `episode.produce` 改就绪闸。

---

## 1. 任务口径给的停工位与 live 实况:一半不成立、一半成立且形状不同

任务口径写的是「向导「仅进行分集」并不翻转成片门 G1;G1 看的是 `p.script`(整本),不是 `ep.content`(各集正文)」。
本槽先在基线上把三面都跑了一遍(浏览器十门 `Release.collect`、headless 七门 `ReleaseCore.gates`、
`Domain.workflow` / `Issues.collect` / `Plans.fromWorkflow`),逐条对照:

| 口径里的说法 | 基线 live 实况 | 判定 |
|---|---|---|
| G1 看的是 `p.script` | **反了**。`js/release.js` 与 `js/release-core.js` 的 `g1-workflow` 都是逐集调 `Domain.episodeState`,判的是 `ep.content` 与镜头/审片/成片计数;`p.script` 一个字不读 | 不成立(`w110-split-only-script.md` 第 3 节已两面钉过,`split` 套件有正反用例) |
| 「仅进行分集」不写 `p.script` | **已不成立**。W110 起 `doSplitRun` 成功路径就把原文落进剧本板块了 | 不成立 |
| 回执/Issues/计划把这条说成「已过」或「去拆集就能过」 | **没有**。见下表逐面实测,四面文案都诚实 | 不成立 |
| 处置不把用户领去一个过不了的按钮 | **不成立——这一面是真的**。G1 未过门时恒挂 `episode.produce`,而「仅进行分集」留下的那一态它自己当场退回 | **停工位成立,形状与口径不同** |

停工位落在**处置动作**这一面,不在门槛判据那一面。故本槽改的是回执诚实,门槛一字未动。

### 1.1 基线举证(A:整本原文不在库、两集都有正文、一集都没拆镜)

夹具就是「仅进行分集」跑完的形状:`script: ''`,`ep1/ep2` 各有 `content`,`shots: []`,主体齐备有图。

| 面 | 基线 live 输出 | 诚实吗 |
|---|---|---|
| 浏览器十门 G1 | `fail` / `· 第一集(ready:生成分镜)；· 第二集(ready:生成分镜)`(整份 `overall=fail fails=2 warns=2`) | 诚实:点名的是「生成分镜」,没说「去拆集就能过」,也没当已过 |
| headless 七门 G1 | `fail` / `第一集(ready:生成分镜)；第二集(ready:生成分镜)`(`overall=fail fails=2 warns=1`) | 诚实,且与浏览器那半逐字同形 |
| `Domain.workflow` | 剧本步 `done=false` / `no-script`,分集步 `done=true`,分镜步 `no-shots`;`recommendedAction` = 上传剧本 | 诚实:整本原文确实不在库 |
| `Issues.collect` | 两条中危 `no-shots`「已有剧本未拆镜,可直接智能分镜」+ 一条低危 `no-script`「项目还没有剧本原文:提取主体与拆集读的都是它,先写入整本」 | 诚实,且低危不进 G2 的高/中危计数 |
| `Plans.fromWorkflow` | 两步 `episode.generateStoryboard`(项目级前置步一条不出:`no-script` 在场时提取与拆集两个取材器都返回 null) | 诚实,且派的命令真跑得动 |

**B(同样没有 `p.script`,但各集已走完整条主线)**:十门 `overall=cond-pass`(`fails=0 warns=1`)、
headless 同为 `cond-pass`;同一夹具补上 `p.script` 后十门逐门同结论。
两次对照再次说明 G1 与 `p.script` 无关——W110 那条结论在本槽的 live 上仍然成立。

### 1.2 成立的那一面:回执 info 说 A,按钮做 B

`js/release.js` 的 G1 未过门项此前恒挂 `fix: { type: 'command', cmd: 'episode.produce', epid: 首个受阻集 }`,
弹窗与制作台把它渲染成「一键处置」。在夹具 A 上真跑一遍(`Commands.execute('episode.produce', { pid, epid: 'ep1', ui: true })`):

```
status=blocked ok=false error={"code":"no-shots","message":"未分镜"}
next={"status":"ready","key":"shots","label":"生成分镜"}
steps=[]          toasts=["info:未分镜"]
ep1.shots 之后=0  → G1 结论一字不变
```

回执 info 点名「生成分镜」,而它自己挂的按钮跑的是一键成片,按下去只换来一句「未分镜」的 toast,
零调用零计费、该集状态一动不动、门禁重收后一模一样。**门槛与处置打架**,而且打的正是「仅进行分集」留下的那一态。

### 1.3 同一形状还有三态(逐态真跑 `episode.produce`,基线实测)

`episode.produce` 的就绪闸有两道:`st.status === 'blocked' || st.shotsStale` 走 `preflight`,`shots` 为空走 `no-shots`。
两道都在任何引擎调用之前,退回时零扣费。逐态实测:

| 受阻态 | `episodeState` status/action | `episode.produce` 回执 | 该集变化 |
|---|---|---|---|
| 缺正文 | `blocked` / `script` | `blocked(preflight:就绪检查未通过:缺剧本正文/未生成分镜)` | 原地不动 |
| **有正文零分镜(「仅进行分集」)** | `ready` / `shots` | `blocked(no-shots:未分镜)` | 原地不动 |
| 失败镜 | `blocked` / `fix-failed` | `blocked(preflight:就绪检查未通过:1 镜生成失败)` | 原地不动 |
| 分镜判旧 | `stale` / `reshoot` | `blocked(preflight:…)` | 原地不动 |
| 待出片 | `ready` / `gen` | 进引擎(不在就绪闸退回) | 有推进 |
| 待确认 | `needs_review` / `confirm` | 进引擎(未确认镜按既有口径跳过) | 有推进 |

四态死、两态活。四态里三态在同一颗按钮上,只是触发条件不同——所以改的是这颗按钮的派法,不是只补「仅分集」一个特例。

---

## 2. 落地:处置口收成一份派生,按推荐动作分档

`js/domain.js`(`episodeState` 之后):

```js
D.epFixOf = function (p, ep, st) {
  if (!p || !ep) return null;
  st = st || D.episodeState(p, ep, true);
  const key = (st.action && st.action.key) || '';
  if (key === 'shots') return { type: 'command', cmd: 'episode.generateStoryboard', epid: ep.id };
  if (key === 'script' || key === 'reshoot' || key === 'fix-failed') {
    return { type: 'nav', hash: '#/project/' + p.id + '/episode/' + ep.id };
  }
  return { type: 'command', cmd: 'episode.produce', epid: ep.id };
};
```

`js/release.js` 的 G1 那段只多记一个首个受阻集与它的状态,`fix` 改成 `Domain.epFixOf(p, first.ep, first.st)`。

四处刻意:

- **分档判据不另写一份**。用的是 `episodeState` 已经归好的 `action.key`,不在本函数里重判「有没有正文/有几个镜头/判没判旧」——
  那三问的判据在 `episodeState` 一处,`Pipeline.nextForEp` 与 `Plans` 的取材器也都按同一组 key 分流。
- **未拆镜派 `episode.generateStoryboard` 而不是「让 produce 顺带拆镜」**。改 produce 的就绪闸等于抬门:
  一键成片的语义是「分镜表已就位,把剩下的跑完」,让它顺手拆镜会把一次点击的花费与风险面整个换掉。
  计划层在同一态上派的本来就是这条命令(第 1.1 节实测),两处从此同一个答案。
- **补正文 / 重新拆镜 / 处理失败镜出导航口,不派命令**。重拆会整表覆盖已有分镜(含已出片镜)、失败镜要逐镜挑、
  补正文得人来写——都属人工决策,回执不代授权。这与计划层「需要授权或需要人工挑选的状态一律出导航步」是同一条纪律。
  失败镜这一态刻意**不**派带 `shotIds` 子集的 `episode.generateVideos`:那是 G6 自己的处置口,本槽不碰它。
- **其余态原样走 `episode.produce`**。就绪闸放行的态一个都没被牵连,G1 的 pass 条件、`severity`、info 文案一字未动。

处置口是 `type: 'nav'` 时,`Release.execFix` 走既有的 `if (fix.hash) location.hash = fix.hash` 分支,
按钮文案由既有渲染逻辑自动变成「前往处理」——弹窗与制作台两个渲染点都不用改。

---

## 3. 断言与变异实测

新增 3 条(全套 **547 → 550**),另把一条既有契约用例改强:

| 用例 | 钉住什么 |
|---|---|
| `commands` · produce 的就绪闸与受阻集处置口同一份实况:当场退回的四态,epFixOf 一律不再挂一键成片 | 四态逐个**真跑** `episode.produce`:回执码逐态点名、退回时 `__called` 为空(零调用零计费)、该集 counts 逐字不变;再问 `Domain.epFixOf` 挂的是不是它。未拆镜那态派出的命令**再真跑一遍**证明它跑得动(跑完该集真有分镜);就绪闸放行的态仍是一键成片 |
| `domain` · epFixOf:受阻集的处置口按推荐动作分档 | 逐态点名分档:未拆镜 → 智能分镜(带真实 epid)、缺正文/失败镜/分镜判旧 → 导航口(hash 落到该集工作区且不挂 cmd)、待出片/待确认 → 一键成片;缺项目或缺分集时回 null 而不是编一个 |
| `release` · G1 处置口按首个受阻集的状态派 | 「仅分集」形状上 G1 仍 `fail`、info 仍点名生成分镜,而 `fix.cmd` 是 `episode.generateStoryboard`;补上 `p.script` 后 status/info/fix 三者逐字不变(门槛与处置都不读整本原文);第一集走完整条主线后处置口顺延到第二集(不写死首集) |
| (改强)`contract` · Release 全脏项目:fix.cmd 均已注册… | 原判据是「至少 5 个命令类处置」,脏夹具那一集有失败镜、处置口按本槽改为导航,该数落到 4。没有把 5 改小了事,而是补两条更硬的:**每个 fail 门都必须有处置出口**(不许有门静默无路可走)、**导航类处置的 hash 必须命中 `app.js` 路由表**(命令类查注册表、导航类查路由表,两类都不许指向不存在的去处) |

`GUARD_TOPICS` 新登记一条 `epfix-produce-gate`(锚点 `Domain.epFixOf` + `episode.produce`,`hosts: 2`),
`TOPIC_FLOOR` 随之 12 → 13。

**变异实测**(逐个改完跑全套,验证后原样还原,`git diff` 为空):

| 变异 | 转红 |
|---|---|
| `js/release.js` 的 `fix` 退回硬编码 `episode.produce`(基线形状) | 红 1:`release` 那条(期望 `episode.generateStoryboard`,实得 `episode.produce`) |
| 删掉 `epFixOf` 里 `key === 'shots'` 那一档(未拆镜落回一键成片) | 红 3:`commands`(点名「有正文零分镜(「仅进行分集」留下的那一态)」)、`domain`、`release` |
| 把 `fix-failed` 从导航档里摘掉(失败镜落回一键成片) | 红 2:`commands`(点名「失败镜」)、`domain` |

第三条值得单记:它证明 `commands` 那条不是只认「仅分集」一个特例——判据是「produce 当场退回的态一律不许还挂它」,
哪一档被摘掉就点哪一档的名。

---

## 4. live 数字(本槽实测,不抄旧波次)

| 口径 | 基线 `b1f5fd6` | 本槽 tip |
|---|---|---|
| `node tests/unit.js` | 547/547 | **550/550** |
| `node tests/unit.js contract` | 122/122 | 122/122(未加用例,改强了其中一条) |
| `node tests/integration.js` | 143/143 | **143/143**(零改动面) |
| `node tests/cli.smoke.js` | 105/107 | **105/107**,失败两条与 master 基线同名同表现:`未登录 whoami → exit 3`(exit=1)、`llm --json mock 链路` |
| `GUARD_TOPICS` / `TOPIC_FLOOR` | 12 / 12 | **13 / 13** |
| 单元用例数 FLOOR | 547 | **550** |
| 记账件份数 / FLOOR | 187 / 187 | **188 / 188**(含本文) |

`node --check` 跑过本槽改动的三个 js:`js/domain.js`、`js/release.js`、`tests/unit.js`。
`node tests/e2e.js` 按口径未跑。

---

## 5. 交接

1. **G1 的判据不要再按「有剧本」记**——这是 W110 交接第 2 条,本槽在 live 上又复核了一遍并仍然成立:
   `g1-workflow` 逐集读 `ep.content`,项目级「未上传剧本」归主线剧本步与 `Domain.gateBlockers` 的 `no-script`。
   本槽只改处置动作,任何门的 pass 条件一字未动。
2. **`Domain.epFixOf` 今天只有 G1 一个消费方**。headless 七门(`ReleaseCore.gates`)有意不带 `fix`——CLI 上没有按钮。
   将来若要给 headless 回执也带处置建议,读这一份即可,别在 `release-core.js` 里另写一版。
3. **还没收的一面:主线推荐动作与发布门在「走完全片但没有整本原文」的项目上口径不同**。
   基线实测(夹具 B):十门 `cond-pass`、七步主线全 done,而 `Domain.workflow` 的 `recommendedAction` 仍是「上传剧本」
   (剧本步是主线第一个未完成的非支线步)。两边说的都不假——原文确实不在库、片子也确实做完了——
   但「下一步该干什么」指到一个与交付无关的地方。这属产品口径问题(该不该让 `extractDone` 之外再认一档、
   或让 `recommendedAction` 在下游全 done 时改口),**本槽按禁令没有碰**,留给要定这个口径的槽。
4. **`episode.produce` 的就绪闸本身没动**。第 1.3 节那张表是它当前的实况;若将来要让一键成片顺带拆镜,
   得连同它的花费预估、`INFLIGHT` 键、`steps` 序一起想,而不是只放宽一个 `if`——放宽的当天,
   `commands` 套件那条会红在「退回时零调用零计费」上,那正是它该红的地方。
5. **与 W179 合入的冲突面**:本槽只碰 `js/domain.js`(在 `episodeState` 与 `projectScript` 之间新增一段,不改两侧任何一行)、
   `js/release.js`(G1 那一段 9 行)、`tests/unit.js`(三处新增 + 一处契约用例改写 + 两个 FLOOR 字面)、
   `README.md`(用例数那句 + G1 门描述那句)。可预期的真冲突只在 `tests/unit.js` 的两个 FLOOR 字面
   (`['单元测试', 550,` 与 `TOPIC_FLOOR = 13`)与 `README.md` 的用例数——这两处按合并后的 live 重取即可,
   不要取任一侧的字面。`js/release.js` 的 G1 段落若与别的槽同时被改,注意本槽把 `blockers` 的收集循环
   多带了一个 `first`,冲突时保留它(`fix` 靠它取首个受阻集的状态)。
