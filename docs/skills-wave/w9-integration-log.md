# W9 · 剩余分支收敛记录(集成分支)

> 集成分支:`cursor/w9-integration-f8f9`,基线 `cursor/w7-integration-fa8a @ 0aedf34`。
> 本文只记**收敛过程**:合入了什么、每处冲突怎么解、合并后的实测数字、剩余未合。各项功能本身的说明在各自落地文档里,本文不复述。
> 全程只解冲突与收敛双口径,**不重做任何一条分支已落地的功能**;所有合并均 `--no-ff`,一条分支一个合并提交,可逐条 revert。

## 1. 结果一句话

`w7` 之后仍未合入的 **3 条分支全部收敛**,合并后回归全绿:`unit 288/288`、`integration 93/93`、`cli.smoke 62/64`。远端 27 条 `cursor/*` 分支现在**全部被本分支包含**(逐条 `git rev-list --count HEAD..origin/<branch>` 均为 0),没有剩余未合分支。

`cli.smoke` 的 2 项失败在 `master` 上即失败(「未登录 whoami → exit 3」实得 exit=1、「llm --json mock 链路」),属基线环境态,**未通过删测或放宽断言换绿**——基线与合并后逐项相同。

## 2. 开工前的包含性实测(为什么只合 3 条)

任务点名的 5 条候选里有 2 条**已经在 `w7` 里**,不需要再合。这里用两种口径交叉验证过,避免误判:

| 候选分支 | `rev-list HEAD..branch` | 判定 |
|---|---|---|
| `w4-audio-meta-fc27` | 0 | 已在 `w7`(`bf32966` 整合 4/4),本轮不动 |
| `w4-shot-size-glossary-654e` | 0 | 已在 `w7`(`9aeb039` 整合 1/2),本轮不动 |
| `w6-extract-subjects-wf-320d` | 3 | **合**(见 3.1) |
| `w8-split-episodes-inject-ba63` | 2 | **合**(见 3.2) |
| `w8-script-check-8664` | 1 | **合**(见 3.3),即任务里问的"剧本校验宿主分支" |

> 口径提醒:排查时先用 `git diff --stat w7...branch` 看过一轮,那是**三点**语法,给的是"该分支相对合并基的自身改动",并非"未合入 `w7` 的部分"——`w4-audio-meta` 在那个口径下仍显示 400 余行,容易误判成未合。真正的判据是 `rev-list w7..branch` 为 0 与 `git cherry` 无 `+` 行。

`w6-extract-subjects-wf-320d` 是个中间态:`w7` 已合入它的主体两提交(`166e426`/`78d6c85`),但尾部提交 `e8312db` 与一处 README 行没跟过去,所以它仍有 3 个提交在外(`git cherry` 对 `d011b96` 标 `+`、对 `8e7ea64` 标 `-`)。

## 3. 合入次序与逐步测试数字

| # | 合入 | 合并提交 | 冲突文件(处) | 合并后 unit | integration | cli.smoke |
|---|---|---|---|---|---|---|
| 1 | `w6-extract-subjects-wf-320d` | `56566f2` | `w6-extract-subjects-wf.md`(5)、`tests/cli.smoke.js`(2) | 280/280 | — | — |
| 2 | `w8-split-episodes-inject-ba63` | `8a84212` | `js/wf-core.js`(1)、`tests/unit.js`(2)、`README.md`(1) | 280/280 | — | — |
| 3 | `w8-script-check-8664` | `b2f7f52` | `cli.js`(2)、`js/commands.js`(1)、`js/issues.js`(1)、`tests/unit.js`(2) | 288/288 | 93/93 | 62/64 |
| 4 | README 口径同步(非合并) | — | — | 288/288 | 93/93 | 62/64 |

基线(`w7 @ 0aedf34`)实测:`unit 280/280`、`integration 93/93`、`cli.smoke 62/64`。即本轮 **unit +8、integration ±0、cli.smoke ±0**,且失败项与基线是同两条。

第 2 步 unit 不涨是因为该分支的 10 条新断言**补在既有测试项内部**(拆集提示词注入位与两端装配口),不新增测试项——项数不变而断言变多,属该分支自己的记账方式,本轮未改。

## 4. 冲突怎么解(逐处)

本轮 17 处冲突里,**16 处是"两侧各加了一半"的并集型**,没有一处是"择一丢弃"。剩下 1 处是同一行注释的措辞取舍。

### 4.1 `WF_BOARD` 两侧各加一键 → 取并集,调用点计数随之抬到 8

最要紧的一处。`w6-extract-subjects` 给工作流→板块映射加了 `'extract-subjects': '主体'`,`w8-split-episodes-inject` 加了 `'split-episodes': '剧本'`,改的是同一行:

```js
W.WF_BOARD = { understanding: '导演', 'smart-storyboard': '分镜', 'smart-review': '成片', 'extract-subjects': '主体', 'split-episodes': '剧本' };
```

若照任一侧合并,另一条工作流的人设/记忆注入会**静默失效**(端点代码还在,但取不到板块键)。契约断言随之改硬:

- `WF_BOARD` 键序断言取五键并集;
- 两条 `srv.includes(...)` 断言并存(`extract-subjects` 与 `split-episodes` 端点各须经 `wfPersonaNote`);
- `wfPersonaNote` 调用点计数 **7 → 8**(1 定义 + 7 调用:理解 / 分镜 / 分镜内部理解步 / 审片 / Agent 对话 / 提取主体 / 拆集),注释同步列全 7 个调用点。将来再加 LLM 步而漏注入,这条先红。

实测复核(不只靠源码扫描断言):`WF_BOARD` 五键齐全;`buildSplitUser` 与 `buildExtractUser` 的空 `ctx` 输出与三参调用**逐字节一致**(未雇佣且无记忆时提示词不变的纪律没被并集破坏);注入后 `buildSplitUser` 命中「冷峻悬疑导演·剧本板块」与剧本板块记忆条目。

### 4.2 就绪检查的校验面:两侧各接一组 → 三面并集,按主线步序排列

`w7` 里 `episode.preflight` 已接主体面 + 成片字幕面;`w8-script-check` 接的是剧本面 + 主体面。两侧改的是同一段,任一侧胜出都会**丢掉对方那一面**(取分支侧则 `w4-film-caption-check` 的字幕消费点被摘掉,取 `w7` 则本轮的剧本面根本没有出口)。取三面并集,顺序按主线步序 `script → subjects → film`,并保留 `w7` 侧提出的 `ck` 常量(避免 `online()` 求值三次):

```js
const ck = { online: online() };
const checks = window.Skills
  ? Skills.check('script', { p, ep }, ck).concat(Skills.check('subjects', { p, ep }, ck), Skills.check('film', { p, ep }, ck))
  : [];
```

`cli.js` 同一段同解法(两处:实现 + 段头注释)。这样 `w8-script-check` 自带的步序断言(`Skills.check('script'` 的出现位置须早于 `Skills.check('subjects'`,两端各断一次)继续成立。

注意这里有个**断言盲区**:字幕面只有"问题中心消费"的断言,没有"就绪检查消费"的断言,所以把 `film` 从 preflight 里摘掉不会转红。本轮靠实跑核对:合并后 `script+subjects+film` 三面共回 6 条结论(`script.hookStrength/faceslapFour/dialogueRule` + `subjects.refIntegrity/crossShot` + `film.subtitleQC`),顺序即主线步序。

### 4.3 问题中心两张展示码表 → 并存

`js/issues.js` 里 `w7` 侧有成片字幕码表 `CAPTION`,分支侧有剧本文本面码表 `CRAFT` 加一个 `craftLine` 明细拼装器,两块代码撞在同一位置。两者互不相干,直接并存即可;各自的消费点(`collect()` 里 `kind: 'script-craft'` 与 `kind: 'caption-unreadable'` 两条低危)本就在别的行、自动合并无冲突。

实测复核:一个"开篇纯背景铺陈 + 未拆镜"的项目现在同时给出 `no-shots(mid)` 与 `script-craft(low)`,高危 0 条——即剧本提醒既报得出来,也没吞掉未分镜那条中危,发布门 G2(只数高/中危)状态不变。

### 4.4 `tests/unit.js` 四处 → 全部保留双方

- **两个不同用例撞在同一位置**(`collect:成片字幕读不顺` 与 `collect:剧本方法论提醒`):两侧各自在 `collect:同一主体跨镜锁到不同参考图` 之后追加了一个测试项,补上被冲突标记吃掉的 `} },` 分隔,两个用例并列保留。
- **两块夹具撞在同一位置**(字幕夹具 `capShot/capEp/caption` 与剧本段夹具 `BG/scriptEp/scriptCheck/hookOf/slapOf/lineOf`):互不相干,并列保留。
- 另两处是 4.1 的契约断言。

### 4.5 `README.md` 一处 → 按句并集

「专家方法论进创作工作流」那一句,两侧各往三条工作流的清单里加了自己那条。并集后是**五条**:本集理解 / 智能分镜 / 智能审片 / 提取主体 / 剧本拆集;板块对应关系与 CLI 命令清单同步取并集,并保留分支侧新增的"协作记忆同板块一并召回"这半句。

### 4.6 唯一一处措辞取舍:`tests/cli.smoke.js` 的限流间隔

`wf` 端点对单用户限 2 次/秒,冒烟里相邻的 `wf` 命令需要 1.1s 间隔。两处冲突:

- `project.extractSubjects` 之前:`w7` 侧没有间隔,分支侧有。**取分支侧**(补上间隔),注释合成一句说明上文智能分镜也是 `wf` 端点。这是本轮唯一一处"一侧空、一侧有"的冲突,取"有"的那侧是因为它防的是限流抖动,取空侧会留下一条随机转红的用例。
- `project.splitEpisodes` 之前:两侧都加了间隔,只是注释措辞不同。取 `w7` 侧更具体的那句(点明是上文哪两步挤到了限流线上)。

### 4.7 `w6-extract-subjects-wf.md` 五处(add/add)

同一份文档在 `w7` 与分支上各存了一版,差异全在自述基线与测试数字:分支侧把基线从 `9f4e8ec` 更新成 `e1074f7`、把测试数字更新成收尾后的值、并把「G-04 拆集端点没有人设注入」从一句"未做"扩写成一条带补法的**同病登记**。取分支侧(较新且更准)。

有意思的是这条同病登记正好被本轮第 2 步兑现了——`w8-split-episodes-inject` 做的就是它写的那个补法(`WF_BOARD` 加 `'split-episodes': '剧本'`、`buildSplitUser` 加 `ctx` 注入位、端点取一次 `wfPersonaNote` + `memBlock`、契约计数 +1),连计数抬升方式都一致。文档里这段作为该分支的历史登记原样保留,不改写成"已做"。

## 5. 合并当场做完的收敛(README 口径同步)

`w8-script-check-8664` 只改了 5 个代码/测试文件,**没带 README 同步**。按仓库纪律(README 功能描述与实现保持同步)本轮补齐,单独一个提交、不混在合并提交里:

| 位置 | 同步内容 |
|---|---|
| skill 索引段 | 新增「剧本面已落地三条」:SK-07 开篇钩子锚定 `script.openingHookAnchor`、SK-08 打脸四步完备性 `script.faceslapStepOrder`、SK-09 对白单句长度 `script.dialogueLineLength`,含判定输入(有分集取该集正文、否则取项目剧本原文)、去空白正文口径、命中码与分级(一律只到 `warn`,好坏优劣仍归审片 G-10) |
| 就绪检查消费点 | `result.checks` 从「主体面两条 + 成片字幕面一条」改为「剧本面三条 + 主体面两条 + 成片字幕面一条,按主线步序排列」 |
| 单测覆盖描述 | `skills.js` 段补剧本段三条的命中与边界;`issues.js` 段补剧本方法论提醒挂低危且不吞未分镜那条中危 |
| 断言数 | `280` → 实测 **288** |

`js/skills.js` 侧的记账由该分支自己做过了,本轮未改:SK-07/08/09 三条的 `pending` 去掉 `check` 面、各挂 `checks` 实现 id 与 `cmds: ['episode.preflight']`,契约测试的双向对齐(登记必有实现、实现必被引用)在三条新校验项下继续成立。

## 6. 剩余未合与残留

**分支层面:没有剩余未合**。远端 27 条 `cursor/*` 分支逐条实测 `rev-list HEAD..origin/<branch>` 均为 0。

功能与文档层面的残留,按优先级:

1. **`w8-script-check-8664` 没有自己的落地文档**。同期其他条目都有(`w4-subject-ref-check.md`/`w4-sk13-consistency.md`/`w4-film-caption-check.md`),剧本段这三条校验项目前只有 README 段落与代码注释,缺一份写清词表选词依据(为什么打脸四步各步只收该步独有词、跨步通用词一律不收)、阈值来源与噪音边界的文档。索引表里暂无该行。
2. **就绪检查缺"字幕面被消费"的断言**(见 4.2)。剧本面有步序断言、字幕面只有问题中心侧断言,把 `film` 从两端 preflight 里摘掉测试不会红。补一条与剧本面同形的断言即可,本轮按"只解冲突不加断言"的边界没动。
3. **各分支落地文档里的测试数字是该分支在各自基线上的实测,不是收敛后的主干数字**(如 `w6-extract-subjects-wf.md` 记 252/252、`w8-split-episodes-inject.md` 记 265/265)。它们作为各自的落地记账是自洽的,本轮未逐份改写;**主干口径以本文第 3 节与 README 的 288 为准**。
4. **`docs/skills-wave/README.md` 索引仍有缺行**。本轮补了 `w6-extract-subjects-wf.md`、`w4-audio-meta.md`、`w4-film-caption-check.md` 与本文,但 `w7` 阶段本身没有留集成记录文档(`w6-integration-log.md` 之后直接跳到本文),`w7` 那四条合入的收敛过程只在提交信息里。
5. **`master` 上的两项 `cli.smoke` 失败原样保留**:「未登录 whoami → exit 3」实得 exit=1、「llm --json mock 链路」。属基线环境态,不在本轮收敛范围,不删测换绿。
6. `w6-integration-log.md` 第 5 节列的剩余分叉里,**SK-16 编排未含前段两步**、**记忆召回输入偏弱**、**`tplReview` 两端取值不一致**、**`S-08` 尚无关联入选项**四条本轮同样未动(都属功能变更而非冲突收敛)。

## 7. 复核方式

```
git checkout cursor/w9-integration-f8f9
node --check js/wf-core.js js/skills.js js/issues.js js/commands.js js/episode-util.js \
             js/proj-upload.js server.js cli.js tests/unit.js tests/cli.smoke.js   # 全部通过
node tests/unit.js          # 288/288 PASS
node tests/integration.js   # 93/93 PASS
node tests/cli.smoke.js     # 62/64(2 项与 master 同样失败)
```

`node tests/e2e.js` 按仓库纪律未跑(需用户明确要求)。每一步合并都是独立的 `--no-ff` 合并提交,想回退某一条分支 revert 对应的那个合并提交即可,不影响其余;README 口径同步是单独提交,与三个合并提交分开。
