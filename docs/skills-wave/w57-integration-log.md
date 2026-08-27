# W57 · 问题中心两类投影与记忆播种/板块迁移的收敛记录(集成分支)

> 集成分支:`cursor/w57-integration-a697`,基线 `cursor/w55-integration-8f21 @ 3968658`(开工时 `fetch` 后的 tip)。
> 本文只记**收敛过程**:合了哪几条、每处冲突怎么解、合并后的实测数字、没删测的取证。W54 的内容说明在
> `w54-issues-unreviewed-sk19.md`;W53 的落点与取证本文另代记一份(第 6 节)。
>
> **W67 更正(本文原判断有误,已就地改掉)**:本槽合 `w53` 时取的是它的**中间点** `09887be`,
> 而该槽当时的真 tip 是 `0045962`——**那正是它自己的记账件** `docs/skills-wave/w53-memall-headless-seed.md`
> (143 行)**加目录索引行**,提交时点比本槽的合并早 13 分 33 秒。故本文原先写的
> 「W53 没有留下自己的记账件」是**取点漏了一版**造成的误判,不是实况;该文件与索引行随 W67 补合进集成线,
> 见 [w67-integration-log.md](./w67-integration-log.md)。下文第 6 节的代记内容本身仍与源码相符,
> 但它**不是唯一出处**——作者原话在 `w53-memall-headless-seed.md` 里。
> 两次合并均 `--no-ff`、一次合并一个合并提交、逐条可 revert;全程只解冲突与收敛双口径,**不重做任何一条分支已落地的功能**。

## 1. 结果一句话

两条候选**全部以各自 head 合入**(`w54 @ bb0e9af`、`w53 @ 09887be`),合并后回归
`unit 398/398`、`integration 105/105`、`cli.smoke 78/80`(2 项失败与 `master` 同名同表现,见 5.2)。
W56 按任务口径**不合**。

本槽的实质增量是两件事:

| 增量 | 来源 | 落点 |
|---|---|---|
| 问题中心补未审分集(`no-review` / `review-stale` 两条中危)与 SK-19 稳定词(`shot-stable-lexicon` 低危)两类投影 | `w54` | `js/issues.js`、`js/skills.js` |
| 记忆补种与板块迁移下沉 `WfCore.memSeed`/`memMigrateBoard` 双端单源 + 三个 headless 入口 | `w53` | `js/wf-core.js`、`js/agent.js`、`server.js`、`cli.js`、`mcp.js`、`js/skills.js`、`js/knowledge.js` |

合并后的主干口径变化有三处:

- `SK-23` 的仍欠段由「问题中心只报低分不报未审片」缩成**只剩审片报告好坏优劣的语义面(G-10)**;
- `SK-04` 的仍欠段由「记忆补种与旧板块名迁移仍只在浏览器发生」缩成**只剩自动沉淀那一半**
  (理解/分镜/拆集/提取主体几步的结论仍不回流,回流面本身归 SK-26);
- MCP 工具 **34 → 36**(`hujing_memory_seed`/`hujing_memory_migrate`),CLI `memory` 由 `list/add` 扩为 `list/add/seed/migrate`。

校验面仍是**七面十七条**、注册表提示词仍 **14 条**、`KB.SECTIONS` 仍 18 条、`Skills.playbooks()` 仍投影五条、
短名单 30 条仍无 `pending`、发布门 G1–G10 一个字未动(两条分支都没碰 `js/release.js`)。

**本槽值得留下的三件方法面的事**:一是**同一张断言表的三行必须逐行取侧,整体取任一侧都会绿而内容都不对**
(第 4.3 节,这是 `w48-cycle5-audit.md` 点过名的那类合并点第二次真实出现);二是**冲突里的数字一侧都不能要**
——两侧各是自己分支上的旧实况,正确值只能由合入后 live 实测给出,本槽四个数字里有三个两侧都错(第 4.4 节);
三是**并入让非冲突区的散文过期**这一类没有断言兜底,本槽在 `docs/AI助手接入指南.md` 与两处「仍欠」清单上各捞出一处(第 4.5 节)。

## 2. 开工前的包含性实测(合的是哪几条)

开工 `git fetch origin --prune` 后逐条 `git rev-list --count 3968658..origin/<branch>` + `git log` 核对 tip:

| 候选分支 | tip | outstanding | 判定 |
|---|---|---|---|
| `cursor/w54-issues-unreviewed-sk19-cfc0` | `bb0e9af` | 2 | **合**(任务指定必合,见 3.1) |
| `cursor/w53-memall-headless-seed-3653` | `09887be`(**W67 更正:这是中间点,真 tip 是 `0045962`,outstanding 3**) | 2 | **合**(条件判定见第 6 节) |
| `w56-*` | — | — | **不合**:任务口径明确排除 |

`w55-integration-8f21` 的记账件把 `w53`/`w54` 记成「开工时前缀无匹配」,是因为那一槽开工那次 `fetch` 里两个前缀确实
还不存在;本槽开工时两条都已存在且都有实质提交,故按各自 head 合入。

## 3. 两次合并各做了什么

### 3.1 合入 W54(`bb0e9af`,合并提交 `61e60a9`)

`git merge --no-ff origin/cursor/w54-issues-unreviewed-sk19-cfc0`,冲突 2 文件 4 处,自动合并
`js/issues.js`/`js/skills.js`/`tests/unit.js`。落地内容(不复述该槽记账件):问题中心在「该集已有镜头」之后
补两条中危(`no-review` 未审、`review-stale` 记录判旧,与 `Domain.episodeState` 同码同口径、三态互斥),
并把 SK-19 稳定词面接进问题中心(`shot-stable-lexicon` 低危,warn 不抬成 G2 fail)。

合并后 `unit 392/392`、`integration 93/93`、`cli.smoke 70/72`。

### 3.2 合入 W53(`09887be`,合并提交 `9fab31c`;**W67 更正:这是中间点,漏了 tip `0045962`**)

`git merge --no-ff origin/cursor/w53-memall-headless-seed-3653`,冲突 2 文件 3 处,自动合并
`cli.js`/`js/agent.js`/`js/skills.js`/`js/wf-core.js`/`mcp.js`/`server.js`/`tests/integration.js`/`tests/cli.smoke.js`。
落地内容见第 6 节。合并后 `unit 398/398`、`integration 105/105`、`cli.smoke 78/80`。

## 4. 七处冲突怎么解

冲突总表(两次合并合计 7 处):

| # | 文件 | 处 | 解法 |
|---|---|---|---|
| 1 | `README.md` | 主线 skill 索引段 | 取并集 + 过时句改实况(4.1) |
| 2 | `README.md` | 回归测试段 `issues.js` 描述 | 取并集,数字 live 实测(4.2、4.4) |
| 3 | `docs/skills-wave/README.md` | 目录索引表 | 四行按波次序取并集(4.1) |
| 4 | `docs/skills-wave/README.md` | 记账诚实位 | 保留新侧 + 并入旧侧新增段 + 清单改实况(4.1) |
| 5 | `tests/unit.js` | 记账对齐 `facts` 表 | **逐行取侧**(4.3) |
| 6 | `README.md` | CLI 命令总览 | 取并集(4.2) |
| 7 | `README.md` | 回归测试段 memory 套件描述 | 取并集,数字 live 实测(4.2、4.4) |

### 4.1 索引与清单一律 union,不做二选一

- 目录索引表(#3):`w55` 侧带 `w51`/`w52`/`w55` 三行、`w54` 侧带 `w54` 一行,机械取任一侧都会丢行。
  按波次序排成 `w51 / w52 / w54 / w55` 四行取并集。
- 问题中心低危清单(#1):`w54` 新增 `shot-stable-lexicon`,并进 `w55` 侧那串,枚举句同步改成「景别、稳定词与字幕结论」。
- 记账诚实位(#4):两侧各带自己那一段——`w55` 侧有 W51 段与 W52 收尾、`w54` 侧有 W54 段。
  **收尾句取 `w55` 侧**:`w54` 侧写的是「只剩 MCP 流程模板补主线中段未动」,那是它分叉时的旧实况,
  W52 已把这一半落地,取它等于把进度往回退。W54 段并入 W51 段之后。

### 4.2 命令面与套件描述同样 union

- CLI 命令总览(#6):`w53` 侧把 `memory` 扩成 `list/add/seed/migrate` 并带 seed/migrate 说明,
  `w55` 侧有 `w53` 分叉后才出现的 `workflow/flow-template` 与整段 flow-template 说明。两样都留。
- 回归测试段(#2、#7):`issues.js` 套件描述取 `w54` 侧的两条中危与稳定词提醒;memory 套件描述并入 `w53` 侧
  的「播种与板块迁移」那一段(约 380 字);`flow-tpl.js` 的 flow 套件与单套件名里的 `|flow` 是 `w55` 侧独有,保留。

### 4.3 `tests/unit.js` 的 `facts` 表:三行必须逐行取侧,整体取任一侧都会绿

冲突落在「记账对齐:infra 三条的 pending 按实况清空,note 点名仍欠的覆盖余量」那条用例的 `facts` 表上。
表里三行各是一条 `infra` 条目的「缺口出口实况判据 + note 里必须点名的余量锚点」。两侧各只带自己那一条的实况:

| 行 | `w55`(含 W54)侧 | `w53` 侧 | 取谁 | 为什么 |
|---|---|---|---|---|
| `core.personaCtx` | 锚点 `['ops 协议','不开放覆盖']` | 锚点 `['浏览器多轮','未收进提示词注册表']` | **`w55` 侧** | 浏览器多轮三份人设已随 W51 收编进注册表,`w53` 侧那对锚点是它分叉时的旧实况 |
| `core.memoryDual` | 判据 `memRecall && memBlock`,锚点 `['memAll','SK-26']` | 判据 `memRecall && memSeed`,锚点 `['理解/分镜/拆集/提取主体','SK-26']` | **`w53` 侧** | `memSeed` 是本槽刚落地的出口,补种/迁移不再是欠账,锚点必须改指自动沉淀那一半 |
| `review.stage` | 锚点 `['SK-24','G-10']` | 锚点 `['SK-24','未审片']` | **`w55` 侧** | 未审片投影已随 W54 落地,`w53` 侧那个锚点指的是已经补掉的余量 |

**这一处是本槽最危险的合并点**:两侧都是语法完整的三行表,`--ours` 与 `--theirs` 跑起来**都绿**
(锚点各自对得上自己那一侧的 `js/skills.js` note),但内容都不完整——取 `ours` 会把 W53 刚落地的
`memSeed` 记成还没落地,取 `theirs` 会把 W51/W54 已落地的两处记成还欠着。判据只能是**合入后
`js/skills.js` 那三条 `note` 的实况**(该文件在本次合并里是自动合并的,三段 `note` 已经是并集),
逐行对着 note 的「仍欠」那一段取侧。取定后实测:`js/skills.js` 三条 note 的仍欠段分别落在
「四处 ops 协议/字段面/命令白名单/返回 JSON 约定仍不开放覆盖」、「理解/分镜/拆集/提取主体几步的结论仍不回流」、
「报告好坏优劣的语义面仍待 G-10」,与取定的三行锚点逐条对上。

### 4.4 冲突里的数字:两侧都不能要

四个数字冲突,**三个两侧都错**——两侧各是自己分支上的旧实况,正确值只有合入后跑一次才知道:

| 数字 | `w55` 侧 | `w53`/`w54` 侧 | live 实测 | 说明 |
|---|---|---|---|---|
| unit 断言数 | 389 | 383(w54)/ 386(w53) | **398** | 389 + W54 三条 + W53 六条 |
| integration 断言数 | 93 | 105(w53) | **105** | 这个 `w53` 侧恰好对(它的 12 条是唯一增量) |
| cli.smoke 断言数 | 72 | 72(w53) | **80** | **两侧同为 72 却都不对**:两条分支各自独立加了 8 条,基线 64 + 8 = 72 两边都成立,合到一起才是 80 |
| 注册表提示词 | 14 | 11(w54) | **14** | `w54` 侧是 W51 收编三份人设之前的旧实况 |

`cli.smoke` 那一行值得单记:两侧写的是**同一个数字 72**,一个纯文本 diff 里它甚至不会成为冲突
(本槽它是被 #7 那段裹进冲突块才被看见的),而它偏偏两侧都错。同一份文档同一个数字两侧相等
≠ 合并后仍然正确——**只要两侧各自加过测,数字就必须重测**。

`unit` 那一条有 `contract` 套件的「README 数字对账」断言兜底(合完先红,报「实测 398,文档 392」,改完即绿),
其余三个**没有断言兜底**,靠通读 + `node -e` 直读注册表现取(第 5.3 节)。

### 4.5 并入让非冲突区过期:三处

没有断言兜底、也不在冲突块里,只能通读捞出来:

1. `docs/AI助手接入指南.md` 的「34 个工具」——`w53` 给 `mcp.js` 加了 `hujing_memory_seed` 与
   `hujing_memory_migrate` 两个工具,该行落在非冲突区故自动合并后仍写 34。直读 `mcp.js` 实计 36,已改,
   并按该文件既有体例补了这两个工具的一行说明(种子表与浏览器同一份、幂等、空板/未知板名如实报错、播种是显式动作)。
2. `README.md` 主线 skill 索引段的「仍欠」清单——原文三项里有两项已过期
   (「剧本拆集步的系统人设未收进提示词注册表」在 W42/W45 就已收编;「记忆补种与旧板块名迁移仍只在浏览器发生」
   随本槽 W53 落地)。按 `js/skills.js` 三条 note 的实况改成「四处装配口的 ops 协议/字段面/命令白名单/返回 JSON
   约定仍不开放覆盖、理解/分镜/拆集/提取主体几步的结论仍不自动回流记忆、审片报告好坏优劣的语义面仍待 G-10」。
3. `docs/skills-wave/README.md` 记账诚实位的同一份清单——同因同改,并按该节体例补了一段
   「SK-04 点名的那处余量随 W53 收掉」。

三处的共同点:**它们描述的是被合并双方之一改掉的实况,而自己所在的行两侧都没动**,
所以 git 不会报冲突、断言也不覆盖。合入方只能顺着「这次合进来的东西让哪些句子过期」逐句问一遍。

## 5. 实测与取证

### 5.1 三套件数字

| 套件 | 基线 `3968658` | 合 W54 后 | 合 W53 后(HEAD) |
|---|---|---|---|
| `node tests/unit.js` | 389/389 | 392/392 | **398/398** |
| `node tests/integration.js` | 93/93 | 93/93 | **105/105** |
| `node tests/cli.smoke.js` | 70/72 | 70/72 | **78/80** |

### 5.2 `cli.smoke` 那 2 项失败:与 `master` 同名同表现

在独立 worktree(`git worktree add /tmp/wt-master origin/master --detach`,`9adcf0f`)跑
`node tests/cli.smoke.js` 取证,`master` 自身即 **51/53**,失败两项:

```
FAIL | llm --json mock 链路 | undefined
FAIL | 未登录 whoami → exit 3 | exit=1
```

基线 `3968658` 与本槽 HEAD 的失败项**逐字同名同表现**,条数与名字都没变(先于本槽存在,非本槽引入,不在本槽范围内修)。

### 5.3 数字取证方式

`unit` 由 `contract` 套件的「README 数字对账」断言现算(套件表求和),文档写错即红。
其余三个数字直读源现计,不靠人数:

```
node -e "const P=require('./js/prompts.js');console.log(P.list().length)"          # 14
node -e "const K=require('./js/knowledge.js');console.log(Object.keys(K.SECTIONS).length)"  # 18
node -e "const S=require('./js/skills.js');console.log(Object.keys(S.CHECKS).length, S.preflightStages())"  # 17 / 七面
node -e "console.log((require('fs').readFileSync('mcp.js','utf8').match(/\{ name: 'hujing_/g)||[]).length)"  # 36
```

`integration`/`cli.smoke` 两个数字取自套件自己打印的尾行。

### 5.4 用例名集合:三份 tip 的并集,零丢失

按 `PASS|FAIL | <名>` 抽名去重成集合,与三份 tip 各自独立 worktree 实测的名集逐条比对
(`comm -23 <tip名集> <HEAD名集}` 应为空):

| 套件 | 基线 `3968658` | `w54 @ bb0e9af` | `w53 @ 09887be` | HEAD | 各自差集 |
|---|---|---|---|---|---|
| unit | 389 | 383 | 386 | **398** | 0 / 0 / 0 |
| integration | 93 | 93 | 105 | **105** | 0 / 0 / 0 |
| cli.smoke | 72 | 64 | 72 | **80** | 0 / 0 / 0 |

三份 tip 的名集**逐条都在 HEAD 名集里**,一条旧名都没消失。名集只增不减,增量即两条分支各自新加的用例
(W54:unit +3;W53:unit +6、integration +12、cli.smoke +8),**没有删测、没有改名顶替、没有把断言下限抬松**。

## 6. W53 的条件判定与代记

任务口径是「若远端已有 `w53-*` 的**完整 tip**(看 log 有记账件 + 测试绿的完成提交)则合其 HEAD;
若分支还不存在或**明显未完成(只有初始空提交)**则跳过并记日志」。实测:

| 判据 | 实测 |
|---|---|
| 分支存在 | 是,`cursor/w53-memall-headless-seed-3653 @ 09887be`(**W67 更正:本槽把 `09887be` 当成了 tip,它其实是中间点,真 tip 是 `0045962`**) |
| 只有初始空提交 | **否**。两条实质提交:`b76ee04` feat(下沉 + headless 入口)、`09887be` test(补套件 + README 同步),`+438 / -54` 跨 11 文件 |
| 测试绿的完成提交 | **是**。独立 worktree 实测 tip:`unit 386/386`、`integration 105/105`、`cli.smoke 70/72`(2 项与 `master` 同名) |
| 自己的记账件 `docs/skills-wave/w53-*.md` | **W67 更正:有**。`0045962`(本槽合并前 13 分 33 秒推上)就是这份记账件 + 索引行,143 行;本槽当时按 `09887be` 那一版 `git ls-tree` 零命中,故误判为「没有」 |

判定**合入**:它既不是「不存在」也不是「只有初始空提交」,功能与测试都是完成态且全绿;
而跳过它会把 26 条已经写好并全绿的用例(unit 6 + integration 12 + cli.smoke 8)挡在主干外,
与「用例名集合 union 不丢」这条要求正相反。本槽当时判断它「唯一缺的是自己的记账件」,于是**不代写、不补造**一份
`w53-*.md` 冒充作者原话,而是把它的落点与取证代记在本节,`docs/skills-wave/README.md` 的目录索引里
因此没有 `w53-*.md` 那一行,记账诚实位那段也写了「没有留下自己的记账件」。

**W67 更正:这个前提是错的。**记账件当时已经在该槽 tip `0045962` 上,漏掉它的原因是本槽合了中间点
`09887be`——**取点漏一版,连文件带索引行一起漏,而两边都缺时目录索引契约不会报红**(这条假绿由 W63 实测,
随 W67 收严成「每个 `wNN-*.md` 必须有自己的索引行」)。W67 已按 `--no-ff` 补合该 tip,文件与索引行都进了集成线,
记账诚实位那段的 W53 句子也改指 `w53-memall-headless-seed.md`;本节的代记内容与源码仍相符,可当交叉校验读。

W53 的落点(代记,直读合入后源码核对):

- **单源**:`js/wf-core.js` 新增 `memSeed`/`memMigrateBoard`(+111 行),种子表(板块改名迁移 + 标准沉淀 + 知识库沉淀)
  与迁移表只在这一份;`js/agent.js` 的 `memAll` 由内联种子/迁移逻辑改为委托(-49 行),浏览器与 Node 吃同一份。
- **headless 三入口**:`server.js` 的 `/api/wf/memory-seed`(+39 行)、`cli.js` 的 `memory seed [--scope 板块]`
  与 `memory migrate --from 旧板名 --to 新板名`(两者是该端点的薄封装,零 LLM 零计费)、`mcp.js` 的
  `hujing_memory_seed`/`hujing_memory_migrate`(包装 CLI,故 `mcp.js` 里没有端点字面)。
- **口径**:播种幂等(已种过再播 `changed:false`);空板与未知板名一律如实报错,**不静默空成功**;
  迁移条目不丢不双写;播种保持**显式动作**——headless 侧不在读记忆时自动跑,免得读一次写一次盘。
- **记账**:`js/skills.js` 把 `SK-04`(`core.memoryDual`)的 note 仍欠段从补种/迁移改指自动沉淀那一半,
  判据同步从 `memBlock` 换成 `memSeed`;`js/knowledge.js` 同步一处措辞。

## 7. 没做什么

- **没开 PR、没合 master**:只把 `cursor/w57-integration-a697` 推上远端。
- **没删测、没改名顶替、没抬松断言下限**:名集三份 tip 逐条包含(5.4)。
- **没碰发布门**:`js/release.js` 两条分支都没改,G1–G10 与 `overall` 计数逐字未动。
- **没重做功能**:两条分支已落地的实现一行未改,本槽的代码改动只有 `tests/unit.js` 那张 `facts` 表的三行取侧。
- **没合 W56**:任务口径明确排除。
- **没代写 W53 的记账件**:落点代记在第 6 节,不补造作者原话。**W67 更正**:该记账件本来就在 `w53` 的 tip
  `0045962` 上,本槽合的是中间点 `09887be` 才没带进来,随 W67 补合。
