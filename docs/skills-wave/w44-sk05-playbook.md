# W44 · SK-05 编排面落地:主线全链 playbook 由已注册命令投影

**范围**:`js/skills.js` 的 `core.playbookProjection`(SK-05)条目 + `tests/unit.js`(新增 9 组断言、改写 2 条既有断言)+ 两份 README 的实况同步。
**基线**:`cursor/w41-integration-3df0`(head `1e37bbc`,含 `cursor/w38-integration-8cc1`)。
**不做**:不改任何命令实现与命令 `args` 定义、不改 `js/plans.js` 的计划步骤推导、不改 `mcp.js` 的流程模板、不改就绪检查面表、不动别条的 `pending`/`gaps`、不新增 LLM 调用与计费动作。

## 1. 改前的实况

SK-05 是贯通层唯一的编排型条目,`kinds: ['orchestrate']` 但 `pending: ['orchestrate']`,`steps` 为空。按注册表的"不挂假出口"纪律,空 `steps` 的编排面拿不出 playbook:

```
Skills.playbook('core.playbookProjection')  →  null
Skills.playbooks()  →  eps.frontPipeline, review.reviseLoop, film.produceProjection(三条,不含 SK-05)
```

条目上手写了 11 条命令名(恰好是 `CmdRegistry` 的全部),`note` 自述"本条登记命令全面"。也就是说这条名叫「playbook 由注册表投影」的能力,自己**一步也没有投影出来**:它持有全量命令登记,却没有一条步骤;`Skills.playbooks()` 里没有它。

`w33-next-pending-check.md` 第 141–146 行把它记为剩余两条 `orchestrate` pending 之一,卡点写的是"计划步骤(`js/plans.js`)改由注册表投影生成会改既有计划产出,须单列一轮做等价对照"。这个卡点成立,但它挡住的是 **G-12 的计划侧那一半**,不是这条条目的 `steps` 本身——把已注册命令接成步骤表既不碰 `plans.js`,也不改任何现网产出。本轮做的就是后者。

## 2. 改后

```js
{
  id: 'core.playbookProjection', sk: 'SK-05', name: 'playbook 由注册表投影', stage: CROSS, wave: 'W4',
  kinds: ['orchestrate'],
  steps: [
    { cmd: 'project.extractSubjects',    args: {}, note: '提取主体:整部剧本先立主体库,下游每镜才锁得住参考' },
    { cmd: 'subject.generateImage',      args: {}, note: '主体生图:缺参考图的主体补齐真实图,主体步才算齐备' },
    { cmd: 'project.splitEpisodes',      args: {}, note: '剧本拆集:整本切成分集,拿到集 id 后转入集内各步' },
    { cmd: 'episode.understanding',      args: {}, note: '本集理解:先出人物/情绪/场景口径' },
    { cmd: 'episode.generateStoryboard', args: {}, note: '智能分镜:按理解口径拆镜' },
    { cmd: 'episode.preflight',          args: {}, note: '就绪检查:出片前把各面校验结论过一遍(零 LLM 零计费,只报不拦)' },
    { cmd: 'episode.generateVideos',     args: {}, note: '批量生成:整集出片,未确认镜如实跳过' },
    { cmd: 'episode.smartReview',        args: {}, note: '智能审片:逐镜评审 + 共性汇总 + 四维成片评审' },
    { cmd: 'episode.compose',            args: {}, note: '合成成片:拼接并写回软字幕' },
  ],
  gaps: ['G-12'],
}
```

`pending` 清空,手写的 11 条 `cmds` 删掉(改由 `steps` 推出,见 2.3)。

### 2.1 步序取 `Domain.workflow` 的主线步序,不另定一套

九步逐个落回主线步:主体(提取主体 → 主体生图)→ 分集(剧本拆集)→ 分镜(本集理解 → 智能分镜)→ 生成(批量生成)→ 审片(智能审片)→ 成片(合成成片),就绪检查夹在拆镜与出片之间。这不是本文新定的顺序:

- `Domain.workflow` 的主线步骤序列本来就是 `剧本 → 主体 → 分集 → 分镜 → 生成 → 审片 → 成片`;
- 主体步的 `done` 判据是 `subjects.length > 0 && noImg === 0`——**提取完主体还缺参考图,这一步就不算完**,故主体生图排在提取主体之后、拆集之前,与 `Plans.fromWorkflow` 把"补齐主体参考图"作为前置步的口径一致;
- 就绪检查是 `risk: 'read'` 的零计费命令,判定输入是"分镜已成表、还没出片"的那一刻,故排在分镜之后、批量生成之前。

断言按这条口径钉:把七个能明确落回主线步的命令映射到 `Domain.workflow` 的步骤键,要求它们在链上的相对次序**不与工作流步序倒置**。工作流哪天改序、或谁把某步插错位置,这条断言先红。本集理解与就绪检查是所属步的前置动作、不单独占一个主线步,故不参与这条断言(它们的位置由九步序列那条逐字节断言锁住)。

### 2.2 SK-05 与另外三条编排的关系:全链 vs 分段,不是第二份语义

编排面现在有四条,它们不是四份互相抄的步骤表:

| 条目 | 覆盖段 | 与 SK-05 的关系 |
|---|---|---|
| SK-05 `core.playbookProjection` | 主线端到端九步 | 全链 |
| SK-16 `eps.frontPipeline` | 前段四步(提取主体 → 拆集 → 理解 → 分镜) | 全链的**有序子序列**,由断言钉住不许分叉 |
| SK-25 `review.reviseLoop` | 审片 → 按问题重抽 → 复审 → 合成 | 审片不达标时的回环段,含 SK-05 里没有的"回头重抽"这一跳 |
| SK-30 `film.produceProjection` | `episode.produce` 一步 | 生成→审片→合成三步的**聚合**命令,与全链并列 |

SK-16 那四步与 SK-05 前段逐条同名,所以加了一条子序列断言:任何人日后只改其中一处,断言先红——两条编排要么一起改,要么就是把分叉写进了注册表。

### 2.3 `cmds` 改由 `steps` 推出,不再手写全量清单

注册表本来就有这条规则:

```js
/* 编排型的命令面由 steps 推出,不在条目里手写第二份 */
if (!s.cmds.length) s.cmds = s.steps.map(x => x.cmd).filter((v, i, a) => a.indexOf(v) === i);
```

SK-05 此前手写 11 条,正是因为 `steps` 是空的——不手写就一条也登记不上。现在九步进了 `steps`,手写那三行就成了第二份来源,删掉让它走推导。

推导出来的是九条,比原来的 11 条少两条,这两条是**有意不进链**的:

- `shot.generateVideo` 是单镜断点补拍,不是主线上的一步(整集出片走 `episode.generateVideos`);
- `episode.produce` 是"生成 → 审片 → 合成"三步的聚合,把它和它的三个组成部分串在同一条线性步骤表里,是同一件事写两遍。

两条都仍被别的条目登记(`shot.generateVideo` 在 SK-11/SK-21/SK-22,`episode.produce` 在 SK-29/SK-30),故契约断言「全部领域命令应被 skill 索引引用」不受影响——这一点另配了一条点名断言,不靠那条并集断言默默兜住:摘掉 SK-05 的全量登记后,谁把这两条从别处也删了,点名断言先红。

### 2.4 `args` 一律留空:编排层给步序,不替调用方授权

九步的 `args` 全是空对象,与 SK-16 同口径。这条链上有三个授权位和三个模式位:

| 参数 | 命令 | 为什么不能预写 |
|---|---|---|
| `overwrite` | `project.splitEpisodes` | 已有分集时不显式授权即拒——拆集会整表覆盖分镜数据 |
| `confirmAll` | `episode.generateVideos` | 自动确认全部未确认镜后生成,等于替用户过了确认闸 |
| `riskyCompose` | `episode.produce` | 放行待人工/低分镜参与合成(该命令不在本链,一并记口径) |
| `local` / `mode` | 拆集 / 提取主体 | 成本与精度取舍 |
| `shotIds` / `subjectIds` | 批量生成 / 主体生图 | 子集范围是调用方的断点决策 |

playbook 是**步骤表**不是**执行器**。把 `overwrite: true` 或 `confirmAll: true` 预写进 `args`,任何按 playbook 直跑的路径就静默具备了覆盖分镜数据、跳过确认闸的权限——那是把守卫写没了。断言逐步锁住 `args` 为空对象。

## 3. `gaps` 一字未动:G-12 仍挂账

`gaps: ['G-12']` 保留。G-12 的原始定义是"MCP playbook 只覆盖首尾两个场景(开工 / 失败镜),主线中段无 playbook",在本仓里它有两个投影侧的落点,**两处本轮都没动**:

1. `js/plans.js` 的 `fromWorkflow` 仍按各集 `episodeState` 逐集推导步骤,没有改读 `Skills.playbook`(改了会动既有计划产出,须单列一轮做等价对照——`w33` 记的那个卡点原样留);
2. `mcp.js` 的 `PROMPTS` 仍是两条流程模板(开工 / 失败镜),没有补主线中段那条。

口径与 SK-03/SK-04/SK-16/SK-23 一致:**`note` 写明已落地实况与仍欠什么,`gaps` 投影不在功能轮里摘**。`Skills.gaps()` 因此逐字节不变(实测见第 4 节),`Skills.gaps()['G-12']` 仍能反查到这条能力。

顺带一条如实记录:`mcp.js` 第 19 行 `require('./js/skills.js')` 目前在该文件里零使用点。本轮没有顺手给它接消费(接 MCP 资源/模板属 G-12 的另一半,不在本轮范围),只在此登记。

## 4. 影响面(逐项实测)

| 面 | 变化 |
|---|---|
| `Skills.playbook('core.playbookProjection')` | `null` → 九步(本轮唯一的产出变化) |
| `Skills.playbooks()` | 3 条 → 4 条;另外三条的内容逐字节不变(实测比对) |
| `Skills.byId('core.playbookProjection').cmds` | 11 条手写 → 9 条推导 |
| `Skills.list().filter(pending)` | `SK-05:orchestrate, SK-26:orchestrate` → `SK-26:orchestrate` |
| `Skills.gaps()` | **逐字节不变**(20 键;`G-12` 仍映射到 SK-05/SK-25/SK-30 三条) |
| `Skills.preflightStages()` / `Skills.check()` / `Skills.block()` | 逐字节不变(本条既不是校验型也不是注入型) |
| `Skills.validate(deps)` | 仍全绿(九步命令名与空 `args` 逐条过命令注册表校验) |
| 命令实现 / `plans.js` / `mcp.js` / 提示词 / 计费 / 发布门 | 零改动 |

playbook 至今没有自动执行方(计划步骤改由投影生成仍是 G-12 的欠账),故本轮**不会**让任何现网路径多跑一次命令或多扣一次费——变的只是这张步骤表从空变成九步。

## 5. 测试

`node tests/unit.js` **367/367 PASS**。基线上实测同为 **367/367**:新增断言全部加在 `contract · skill 索引引用键单源` 这个已有用例内部,**用例数不变**(README 的 367 是套件表求和出的用例数,不随断言数变),未删测、未放宽任何既有断言。

新增 9 组断言:

| 断言 | 判什么 |
|---|---|
| playbook 非 null | 编排面已落地,`Skills.playbook('core.playbookProjection')` 拿得到东西 |
| 九步序列 | `cmd` 序列逐字节等于那九条命令名(删一步、插一步、换序都红) |
| `args` 全空 | 九步的 `args` 都是空对象(塞 `overwrite`/`confirmAll` 之类预授权就红) |
| `cmds` 由 `steps` 推出 | `byId(...).cmds` 逐字节等于九步 `cmd` 序列(条目里再手写一份就红) |
| 锚点步落在主线上 | 七个能明确映射的命令都落在 `Domain.workflow` 的主线步骤键上 |
| 锚点步序不倒置 | 它们在链上的相对次序与 `Domain.workflow` 主线步序一致 |
| 前段是子序列 | SK-16 的四步是全链的有序子序列(两条编排分叉即红) |
| 两条命令不进链 + 仍被别处登记 | `shot.generateVideo`/`episode.produce` 不在链上,且各自仍被别的条目 `cmds` 引用 |
| G-12 仍在 | 落地一面不等于整条清账,缺口标记按关联索引口径保留 |

改写 2 条既有断言(都是收紧或按实况更正,不是放宽):

- `orch.length >= 3` → `>= 4`(编排面已落地条目数下限,括注同步为「主线全链/主线前段/审片修订闭环/一键成片投影」);
- 剩余 `pending` 快照 `'SK-05:orchestrate,SK-26:orchestrate'` → `'SK-26:orchestrate'`,提示语同步为「只剩 SK-26 的 orchestrate 一条」。SK-26 那条**一字未动**——不借本轮顺手清别人的账。

**变异验证(实测六条,逐条转红)**:

| 改坏 | 结果 |
|---|---|
| 删掉「就绪检查」那一步 | 366/367,九步序列断言红 |
| 给拆集预写 `overwrite: true` | 366/367,`全链步骤不应预设参数:project.splitEpisodes` 红 |
| 把合成排到审片之前 | 366/367,九步序列断言红 |
| 退回 `pending: ['orchestrate']` 冒充未落地 | 363/367,`validate` 的「编排面未落地不得登记步骤」+ 不挂假出口用例 + pending 快照三处红 |
| 把 `episode.produce` 串进全链 | 366/367,九步序列断言红 |
| 手写回 11 条全量 `cmds` | 366/367,`cmds 应由 steps 推出` 红 |

六条全部恢复后回到 367/367。

## 6. 如实记录

1. **本轮清的是 SK-05 的 `steps`,不是 G-12**。G-12 的两个投影落点(`plans.js` 计划步骤、`mcp.js` 流程模板)一行未动,缺口仍挂在 SK-05/SK-25/SK-30 三条名下。谁接手那两处,读第 3 节。
2. **`w33-next-pending-check.md` 第 145 行记的卡点仍然成立**,只是它挡的范围比"这条条目不能动"要窄:计划步骤改由投影生成确实要单列一轮,而条目 `steps` 本身不受它约束。那份文档记的是它那一轮的实况,本轮未回改。
3. **`w2-skills-align-30.md` 与更早几份记录件里 SK-05 那一行仍写着编排面待落地**,按本目录既有惯例(各轮记录件不逐份回改)本轮未动;注册表的当前实况以 `js/skills.js` 与本文为准。
4. **步序只是推荐,不是强制**。实际项目里先拆集再提取主体一样跑得通(两条命令都只吃整部剧本、互不为前提),本轮按 `Domain.workflow` 定序是为了让编排层与流程条的"下一步推荐"同口径,不是断言另一种顺序是错的。
5. **本轮没有做的**:没有让 playbook 变成可执行编排(仍只是一张给调用方读的步骤表)、没有把九步接进 `plans` 的计划步骤、没有给 `mcp.js` 补主线中段模板、没有给任何一步加 `next` 联动、没有动 SK-26 那条剩余 `pending`。
