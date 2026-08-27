# W31 · SK-16 主线前段编排补齐拆集与主体提取

**范围**:`js/skills.js` 的 `eps.frontPipeline`(SK-16)条目 + `tests/unit.js` 契约断言四条。
**基线**:`cursor/w28-sk22-gen-check-0c60`(含 `cursor/w25-integration-d613`)。
**不做**:不改任何命令实现、不改命令 `args` 定义、不改 `pending`/`gaps` 记账、不改就绪检查面表、不新增 LLM 调用与计费动作。

## 1. 改前的实况

`Skills.playbook('eps.frontPipeline')` 只回集内两步:

```
episode.understanding → episode.generateStoryboard
```

而 `project.splitEpisodes` 与 `project.extractSubjects` 两条已注册领域命令,自 W6 起就只挂在该条目的 `cmds` 里,
没有进 `steps`。当时的记账写得很清楚(`w6-integration-log.md` 第 3.5 节):**只登记 `cmds` 引用,没有动 `steps`**,
理由是"把拆集与主体提取前置进编排会改 `Skills.playbook` 的产出,属功能变更而非冲突收敛"。
此后 W7 / W9 / W10 / W13 / W16 / W21 六份记录件都把这一条原样转记为剩余分叉,
W10 的核验报告还实测复核过一次("`Skills.playbook('eps.frontPipeline')` 实测仍只回 2 步")。

结果是这条编排条目名叫「主线前段编排」,投影出来的却只是"某一集内部的两步",
前段真正的两个起跑动作(整本剧本立主体库、整本剧本切分集)在 playbook 上看不见。

## 2. 改后

```js
steps: [
  { cmd: 'project.extractSubjects',      args: {}, note: '提取主体:整部剧本先立主体库,下游每镜才锁得住参考' },
  { cmd: 'project.splitEpisodes',        args: {}, note: '剧本拆集:整本切成分集,拿到集 id 后本编排转入集内两步' },
  { cmd: 'episode.understanding',        args: {}, note: '本集理解:先出人物/情绪/场景口径' },
  { cmd: 'episode.generateStoryboard',   args: {}, note: '智能分镜:按理解口径拆镜' },
]
```

三处决定,逐条给理由:

### 2.1 步序取 `Domain.workflow` 的主线步序,不另定一套

主体在分集之前——这不是本文的新口径,是 `Domain.workflow` 的步骤序列本来就是
`剧本 → 主体 → 分集 → 分镜`(`step('subjects', ...)` 排在 `step('eps', ...)` 之前),
也是本目录 README 第一行写的主线口径。两条命令的前置条件都只是 `needs: ['p']`(整部剧本),
彼此不互为前提,故按主线步序排即可,不需要为编排层再发明一个"更合理的顺序"。

断言把这件事钉在实况上:除了比对四步序列,另有一条直接读 `Domain.workflow` 的步骤键,
断言 `subjects` 的下标小于 `eps`。工作流哪天改序,这条断言先红,而不是让两处口径静默分叉。

### 2.2 `cmds` 改由 `steps` 推出,条目里不再手写

注册表本来就有这一条规则:

```js
/* 编排型的命令面由 steps 推出,不在条目里手写第二份 */
if (!s.cmds.length) s.cmds = s.steps.map(x => x.cmd).filter((v, i, a) => a.indexOf(v) === i);
```

SK-16 此前手写 `cmds: ['project.splitEpisodes', 'project.extractSubjects']`,正是因为这两条命令**不在** `steps` 里,
不手写就登记不上(而「全部领域命令须被 skill 索引引用」那条契约断言要求它们必须被登记)。
现在两条都进了 `steps`,手写那行就成了第二份来源,故删掉,让它走推导——
推出来的正是四步去重后的四个命令名,是原手写值的超集,登记面只增不减。

### 2.3 `args` 一律留空:编排层给步序,不替调用方授权

`project.splitEpisodes` 有三个可选参数,其中 `overwrite` 是一道守卫:
已有分集时不显式授权即拒(拆集会整表覆盖分镜数据,headless 默认拒绝)。
`local`(强制段落均分零计费)与 `project.extractSubjects` 的 `mode`(normal/fine)同理,是调用方的成本/精度取舍。

playbook 是**步骤表**不是**执行器**:它说"前段按这四步走",不说"替你把覆盖已有分集这件事授权了"。
把 `overwrite: true` 预写进 `args` 会让任何按 playbook 直跑的路径静默具备覆盖分镜数据的权限,
这是把一道守卫写没了。故四步 `args` 全空,并补一条断言锁住——
任何人日后往前段步骤里塞预设参数,断言先红。

## 3. `pending` / `gaps` 一字未动

SK-16 本就没有 `pending`(编排面一直是已落地的,只是步骤不全),故不涉及"不挂假出口"那三条纪律的任何一条。

`gaps: ['G-04']` 保留不动。G-04 的定义是"主线前段无服务端工作流:剧本拆集、LLM 主体提取只在浏览器,
headless 主线从剧本起就断",它在**命令与端点层**早已闭合(`/api/wf/split-episodes`、`/api/wf/extract-subjects` 都在),
本轮补的是编排层的投影。保留缺口号是让这条能力仍能经 `Skills.gaps()['G-04']` 反查到——
口径与 SK-03 / SK-04 / SK-23 那三条记账诚实位一致:**note 写明已落地实况,`gaps` 投影不在功能轮里动**。
条目 `note` 已相应改写,不再写"两步前置进 steps 会改本编排产出,单列一轮处置"这句已经过期的话。

## 4. 影响面

| 面 | 变化 |
|---|---|
| `Skills.playbook('eps.frontPipeline')` | 2 步 → 4 步(本轮唯一的产出变化) |
| `Skills.playbooks()` | 条目集合不变(仍是 SK-16 / SK-25 / SK-30 三条),SK-16 那条的 `steps` 变长 |
| `Skills.byId('eps.frontPipeline').cmds` | 2 条 → 4 条(超集;原两条仍在) |
| `Skills.validate(deps)` | 仍全绿(四步命令名与空 `args` 逐条过命令注册表校验) |
| `Skills.gaps()` | 逐字节不变 |
| `Skills.preflightStages()` / `Skills.check()` / `Skills.block()` | 不涉及(本条不是校验型也不是注入型) |
| 命令实现 / 提示词 / 计费 / 发布门 | 零改动 |

playbook 目前没有自动执行方(计划步骤改由投影生成仍待 G-12,见 SK-05 的 `note`),
故本轮**不会**让任何现网路径多跑一次命令或多扣一次费——变的只是这张步骤表的内容。

## 5. 测试

`node tests/unit.js` **334/334 PASS**。基线上实测同为 **334/334**——本轮四条断言加在 `contract` 已有用例内部,
**用例数不变、断言数 +4**(未删测、未放宽任何既有断言;基线数字是在本 worktree 上把
`tests/unit.js` 与 `js/skills.js` 临时切回基线版实跑的)。新增的四条都在
`contract · skill 索引引用键单源` 用例里,紧跟原有的"编排步骤只引用已注册命令"那段:

| 断言 | 判什么 |
|---|---|
| 四步序列 | `playbook('eps.frontPipeline')` 的 `cmd` 序列逐字节等于 `project.extractSubjects,project.splitEpisodes,episode.understanding,episode.generateStoryboard` |
| 步序同源 | `Domain.workflow` 的主线步骤键里 `subjects` 下标 < `eps` 下标(工作流改序时先红) |
| `cmds` 由 `steps` 推出 | `byId(...).cmds` 逐字节等于四步 `cmd` 序列(条目里再手写一份就红) |
| 不预设参数 | 四步的 `args` 全为空对象(往前段步骤塞 `overwrite` 之类预授权就红) |

**变异验证(实测)**:把新加的两步从 `steps` 里删掉后重跑,
`contract · skill 索引引用键单源` 转红,报
`主线前段 playbook 应按主线步序含前段四步:期望 "project.extractSubjects,...,episode.generateStoryboard",实际 "episode.understanding,episode.generateStoryboard"`,
**333/334 PASS, 1 FAIL**;恢复后回到 334/334。断言接得住回退。

## 6. 如实记录

1. **`w2-skills-align-30.md` 第 2 节 SK-16 那一行仍写着 `C:episode.understanding → episode.generateStoryboard`**。
   那份是 W2 波次在其自身基线上的落地记账,按本目录既有惯例(各轮记录件不逐份回改)本轮未动;
   注册表的当前实况以 `js/skills.js` 与本文为准。
2. **更早六份记录件里"SK-16 编排未含前段两步"这一条剩余分叉到此闭合**,
   但那六份文档的原文本轮同样未回改——它们记的是各自那一轮的实况,是自洽的。
   下一份收敛记录件可以把这一条从"剩余分叉"列表里划掉。
3. **步序只是推荐,不是强制**。实际项目里先拆集再提取主体一样跑得通(两条命令都只吃整部剧本,互不为前提),
   本轮按 `Domain.workflow` 的主线步序定序是为了让编排层与流程条的"下一步推荐"同口径,不是断言另一种顺序是错的。
4. **本轮没有做的**:没有让 playbook 变成可执行编排(那是 G-12,SK-05 的 `note` 已登记),
   没有把前段四步接进 `plans` 的计划步骤,没有给拆集/提取主体两步补 `next` 联动。
   playbook 现在仍只是一张给调用方读的步骤表。
