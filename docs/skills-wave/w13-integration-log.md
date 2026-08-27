# W13 · 分集段/分镜段校验宿主收敛记录(集成分支)

> 集成分支:`cursor/w13-integration-a394`,基线 `cursor/w11-preflight-film-assert-883b @ a2709a3`。
> 本文只记**收敛过程**:合入了什么、每处冲突怎么解、合并后的实测数字、剩余未合。各项功能本身的说明在各自落地文档里(`w9-eps-structure-check.md`、`w12-size-gap-check.md`),本文不复述。
> 全程只解冲突与收敛双口径,**不重做任何一条分支已落地的功能**;所有合并均 `--no-ff`,一条分支一个合并提交,可逐条 revert。

## 1. 结果一句话

`w9-eps-structure-check-c8c2`(SK-14/SK-15 分集段)与 `w12-size-gap-check-df6c`(SK-18 分镜段)两条全部收敛,合并后回归全绿:`unit 306/306`、`integration 93/93`、`cli.smoke 62/64`。

就绪检查的校验面并集随之从**三面升到五面**——`script → subjects → eps → shots → film`,九条校验项,两端(`js/commands.js` 与 `cli.js`)同一条 `checks` 表达式。

`cli.smoke` 的 2 项失败在 `master` 上即失败(「未登录 whoami → exit 3」实得 exit=1、「llm --json mock 链路」),属基线环境态,**未通过删测或放宽断言换绿**——基线与合并后逐项相同。

## 2. 基线选取与包含性实测

任务给的优先基线是 `w9-integration-f8f9`。实测 `w11-preflight-film-assert-883b` **完全包含** `w9-integration-f8f9`(`git rev-list --count w11..w9-integration` 为 `0`,`w11` 只是在其 `641a1f5` 之上多 3 个提交),所以直接以 `w11` 的尖端开分支,`w11` 本身不需要再合一次——这样 `w11` 那 3 个提交只出现一次,不产生空合并提交。

| 点名分支 | `rev-list HEAD..branch`(开工时) | 处置 |
|---|---|---|
| `cursor/w11-preflight-film-assert-883b` | — | **作基线**(含 `w9-integration-f8f9` 全部) |
| `cursor/w9-eps-structure-check-c8c2` | 4 | **合**(见 3.1) |
| `cursor/w12-size-gap-*` | 开工时不存在 | 轮次中途出现 `w12-size-gap-check-df6c`,**合**(见 3.2) |

`w9-eps-structure-check-c8c2` 那 4 个提交里有 2 个是 **W8 的尾巴**(`97f6ba2` README 同步 + 落地记账件 `w8-script-check.md`、`bbd7ebb` 打脸四步词表注释校正)。`w9-integration` 当时只合了 `w8-script-check-8664` 的实现提交 `b10a694`,尾部两个没跟过去——`w9-integration-log.md` 第 6 节记的"`w8-script-check` 没有自己的落地文档"这条残留,本轮随这次合并**自动闭合**(文档到位,目录索引补上该行)。

`w12-size-gap-*` 是个动态目标:开工时远端没有这条分支,第一次合并推完后再 `git fetch` 才出现 `w12-size-gap-check-df6c`(单提交 `bb034a1`);合完它、推完之后又出现该分支的尾部提交 `79c3b78`(README 口径同步 + 落地记账件)。两次都合入,合并提交分别是 `070b50d` 与 `676b090`。**教训是收敛前后各 `fetch --prune` 一次**,只在开工时看一眼远端会漏掉并行分支的尾巴。

## 3. 合入次序与逐步测试数字

| # | 合入 | 合并提交 | 冲突文件(处) | unit | integration | cli.smoke |
|---|---|---|---|---|---|---|
| 0 | 基线 `w11 @ a2709a3` | — | — | 290/290 | 93/93 | 62/64 |
| 1 | `w9-eps-structure-check-c8c2` | `e899a71` | `js/skills.js`(1)、`js/commands.js`(2)、`cli.js`(2)、`tests/unit.js`(1)、`README.md`(3)、`docs/skills-wave/README.md`(1) | 298/298 | 93/93 | 62/64 |
| 2 | `w12-size-gap-check-df6c @ bb034a1` | `070b50d` | `js/commands.js`(2)、`cli.js`(2)、`js/issues.js`(1) | 305/305 | 93/93 | 62/64 |
| 3 | `w12-size-gap-check-df6c @ 79c3b78`(尾部) | `676b090` | `README.md`(3)、`docs/skills-wave/README.md`(2) | 306/306 | 93/93 | 62/64 |

本轮相对基线:**unit +16、integration ±0、cli.smoke ±0**,失败项与基线是同两条。

第 1 步的 +8 是分集段两条校验项自带的 6 个测试项,加上本轮把 W11 那两条并集断言从三面口径改成四面口径时新增的两条子断言(登记侧反查多断一面、步序改成按序表逐对比较)。第 2 步的 +7 是 SK-18 自带断言。第 3 步的 +1 是 `w12` 尾部补的问题中心消费断言。

## 4. 冲突怎么解(逐处)

20 处冲突**全是"两侧各加了一半"的并集型**,没有一处是择一丢弃功能;只有第 3 步的 3 处 README 是"同一段的两版口径,取更全的那版"。

### 4.1 就绪检查的校验面:三面 → 四面 → 五面(核心冲突,共 8 处)

这是本轮反复撞的同一处。三条分支各自基于"三面"的旧版改同一段:

- 基线(`w11`)有 `script + subjects + film`;
- `w9-eps-structure-check` 写的是 `script + subjects + eps`(它没有 `film`,因为它的基线早于字幕面合入);
- `w12-size-gap-check` 写的是 `script + subjects + shots + film`(它没有 `eps`,因为它与 `w9-eps` 并行)。

**任一侧胜出都会静默摘掉别人那一面**:取 `w9-eps` 侧则字幕面消费点没了,取 `w12` 侧则分集面没了。一律取并集,顺序按 `Skills.STAGES` 的主线步序 `script → subjects → eps → shots → film`,并保留基线侧的 `ck` 常量(避免 `online()` 求值五次):

```js
const ck = { online: online() };
const checks = window.Skills
  ? Skills.check('script', { p, ep }, ck).concat(Skills.check('subjects', { p, ep }, ck), Skills.check('eps', { p, ep }, ck),
    Skills.check('shots', { p, ep }, ck), Skills.check('film', { p, ep }, ck))
  : [];
```

`cli.js` 同一段同解法(两处:实现 + 段头注释)。`cli.js` 侧写成两行时留意 W11 那条源级断言是按 `seg.indexOf(';', i)` 截表达式的,所以整条表达式中间不能出现分号——现写法首个分号就在末尾,断言取到的是完整表达式。

### 4.2 W11 的并集断言当场接住了两次漏接(本轮最有价值的取证)

`w9-integration-log.md` 第 6 节第 2 条登记的残留是"就绪检查缺字幕面被消费的断言,把 `film` 摘掉不会红"。W11 补上了这两条断言(行为断言 + 双端源级断言),**本轮它们立刻兑现了作用**:

第 2 步合入 SK-18 时,冲突解完先跑 `node tests/unit.js`,W11 的行为断言直接转红并把差异逐项打出来:

```
FAIL | commands · preflight:result.checks 是剧本+主体+分集+成片字幕四面并集(按主线步序,摘任一面即红)
  期望 "…,eps.structureStage,eps.payoffPoint,film.subtitleQC"
  实际 "…,eps.structureStage,eps.payoffPoint,shots.sizeProgression,film.subtitleQC"
```

即**新增一面而断言口径没跟上时,测试先红而不是静默通过**。这不是"测试挡住了错误合并",而是"测试逼着收敛方把口径显式抬一档"——按五面口径更新断言后全绿。

为确认这层保护不是只在这一次凑巧生效,收敛完成后逐个做了变异验证(改完即恢复,工作区 `git diff --quiet` 复核干净):

| 变异 | 转红的断言 |
|---|---|
| `js/commands.js` 摘掉 `Skills.check('eps',…)` | 源级并集(缺 eps 面)+ 分集段消费点 + 行为并集 |
| `cli.js` 摘掉 `Skills.check('eps',…)` | 源级并集(缺 eps 面)+ 分集段消费点 |
| `js/commands.js` 摘掉 `Skills.check('film',…)` | 源级并集(缺 film 面)+ 字幕面消费点 |
| `cli.js` 摘掉 `Skills.check('film',…)` | 源级并集(缺 film 面)+ 字幕面消费点 |
| 双端摘掉 `Skills.check('shots',…)` | 源级并集(缺 shots 面)+ 景别面消费点 + 行为并集 |
| 把 `eps` 排到 `subjects` 之前 | 源级并集(步序)+ 分集段消费点(步序) |

六种摘法/改序全部转红,**双端各自独立转红**(单端漏接不会被另一端掩掉)。至此 `w9-integration-log.md` 第 6 节第 2 条残留可以关闭。

### 4.3 `js/skills.js` 一处:两组校验项撞在数组尾(第 1 步)

基线侧在 `CHECKS` 末尾加的是字幕可读性判据 + `film.subtitleTiming`,分支侧加的是分集段宿主 + `eps.stageCoverage`/`eps.payoffPlacement`。两块互不相干,并列保留即可,只需补上被冲突标记吃掉的 `};` 分隔。

并入前核对过分集段依赖的公共助手都在基线里且语义未变:`compact`/`SCRIPT_MIN`/`firstOf`/`lastOf`/`HOOK_HEAD`/`HOOK_SIGNALS`/`FACESLAP_STEPS`——SK-15 的两组词表是从 SK-07 冲突信号与打脸四步反击/释放两步派生的,不新写第二份,这条纪律在并集后仍成立。

SK-18 那一处 `js/skills.js` 反而没冲突(它加在 `subjects` 段与字幕判据之间,自动合并),但它顺带把 `WfCore` 以**解析器形态**进了 UMD 依赖(浏览器里 `wf-core.js` 晚于 `skills.js` 加载,故取值时现解析),这一改动与分集段并集不相干,原样保留。

### 4.4 `js/commands.js` / `cli.js` 段头注释三次改写

同一行注释被三条分支各改一次(「剧本面/主体面/成片字幕面」→ 加分集面 → 加分镜面)。最终写成「剧本面/主体面/分集面/分镜面/成片字幕面」,与实现的五面同序。注释与代码行为一致是仓库纪律,这里不能只改实现留旧注释。

### 4.5 `js/issues.js` 一处:三张展示码表并存

基线已有字幕码表 `CAPTION` 与剧本码表 `CRAFT`;第 1 步带来分集码表 `EPSC` 加两个明细拼装器(`stageLine`/`payoffLine`),第 2 步带来景别码表 `SIZE` 加 `sizeLine`。三次都撞在同一位置,全部并存——各自的消费点(`collect()` 里 `eps-structure`/`eps-payoff`/`shot-size-linkage` 三条低危)本就在别的行,自动合并无冲突。

合并后核对:六条 skill 派生的低危提醒(`script-craft`/`subject-inconsistent`/`eps-structure`/`eps-payoff`/`shot-size-linkage`/`caption-unreadable`)全部挂 `sev: 'low'`,发布门 G2 只数高/中危的判定行未被触碰。

### 4.6 `tests/unit.js`:两组用例撞在数组尾 + 两条并集断言按口径抬档

- **第 1 步一处**:字幕段用例组与分集段用例组各自追加在 `crossShot` 消费点用例之后,补上分隔符后并列保留(不删任何一侧)。
- **W11 那两条并集断言按口径抬档**(不是删测):行为断言的期望串补上 `eps.structureStage,eps.payoffPoint` 再补 `shots.sizeProgression`,直跑对照也同步补两面;源级断言的面清单从写死的 `['script','subjects','film']` 改成 `['script','subjects','eps','shots','film']` 并把两两比序改成按序表逐对断言(将来再加面只改这一个数组)。断言的**判据强度只增不减**:登记侧反查那句(`consumers.forEach(s => assert(at(s.stage) > 0, …))`)原样保留,新增两句显式要求 `eps` 与 `shots` 必须登记 `episode.preflight` 为消费点。

### 4.7 第 3 步的 3 处 README:取五面口径那一版

`w12` 尾部提交写的 README 是它自己视角的"四面/七条校验项/断言数 296"——那是"基线 + SK-18"的口径,**不含分集面**。本分支已经是五面/九条/306,直接取本分支侧;`w12` 侧独有而本分支缺的两点单独补进来:

- 目录索引里 `w12-size-gap-check.md` 那一行(与 `w13-integration-log.md` 行并存,按波次排序);
- 一分钟摘要里「级差取 `WfCore.sizeGap` 词表单源」这半句,并入五面那句。

机位词表段里 `w12` 加的「SK-18 同取 `sizeGap`,不另立阶梯」自动合并,未冲突。

## 5. 合并当场做完的收敛(README 口径同步)

`w9-eps-structure-check-c8c2` 自带 README 同步,但它是**基于三面旧版**写的(缺字幕面、且把审片写成 `wfStep:false`、领域命令记 8 条),整段取用会把基线已收敛的口径退回去。因此该段取基线侧为底,只把分集面两条的描述**嫁接**进去。`w12` 的第一个提交(`bb034a1`)完全没带 README,按仓库纪律当场补齐。

| 位置 | 同步内容 |
|---|---|
| skill 索引段 | 新增「分集面已落地两条」(SK-14 六阶段结构覆盖 / SK-15 付费卡点位置,含区间取自 KB 条目正文、按比例摊到当前集数、末集不判、词表不新写)与「分镜面已落地一条」(SK-18 景别递进与跳切,级差经 `WfCore.sizeGap`、两镜同景别不报、级差取不到即不可判定) |
| 就绪检查消费点 | `result.checks` 从「剧本三 + 主体二 + 字幕一」改为「剧本三 + 主体二 + 分集二 + 分镜一 + 字幕一,按主线步序」;问题中心低危提醒补 `eps-structure`/`eps-payoff`/`shot-size-linkage` |
| 协同层「统一领域命令」 | 就绪检查回执附校验项从八条改九条,面清单补 `eps`/`shots`,并写明五面并集与步序由行为断言 + 双端源级断言锁死 |
| 协同层「问题中心」 | 低危清单补「分集方法论提醒」「景别衔接提醒」,并写明六阶段覆盖按项目挂一条、付费卡点按集挂 |
| 单测覆盖描述 | `skills.js` 段补分集段两条与分镜段一条的命中与边界;`issues.js` 段补两类新低危提醒;`commands.js` 段的「三面并集」改「五面并集」 |
| 断言数 | `290` → 实测 **306** |
| `docs/skills-wave/README.md` | 索引补 `w8-script-check.md`、`w9-eps-structure-check.md`、`w12-size-gap-check.md`、本文四行;一分钟摘要「三面」改「五面/九条」;动工前必读指向本文 |

`js/skills.js` 侧的记账由各分支自己做过了,本轮未改:SK-14/15/18 的 `pending` 已去掉 `check` 面、各挂 `checks` 实现 id 与 `cmds: ['episode.preflight']`,契约测试的双向对齐(登记必有实现、实现必被引用)在三条新校验项下继续成立。

## 6. 剩余未合与残留

**分支层面**:远端 34 条 `cursor/*` 分支中 3 条未被本分支包含,都在本轮任务范围外:

| 分支 | 未含提交 | 内容 | 为什么没合 |
|---|---|---|---|
| `cursor/w7-integration-fa8a` | 1 | `w7-integration-log.md` + 目录索引 | 纯文档。任务里 `w7` 是备选**基线**不是合入目标;它正好补上 `w9-integration-log.md` 第 6 节第 4 条记的"`w7` 没有集成记录文档"这条残留,建议下一轮收敛时一并合 |
| `cursor/w10-cycle2-audit-8846` | 1 | `w10-cycle2-audit.md`(417 行周期 2 核验报告) | 纯文档,任务未点名。同上,建议下一轮合 |
| `cursor/w14-review-skills-check-5291` | 3 | 审片路径接入 `Skills.check` 只读消费(G-10 首个审片侧消费点)+ SK-03/04 记账诚实位 | 任务未点名,出现在本轮收敛尾声。实测它**不改** `js/commands.js`/`cli.js`(`git diff HEAD...branch -- js/commands.js cli.js` 为空),消费点落在 `js/review.js`,所以不会撞 4.1 那处热点;冲突面预计只在 `js/skills.js` 与 `tests/unit.js` 的数组尾 |

功能与文档层面的残留:

1. **`master` 上的两项 `cli.smoke` 失败原样保留**:「未登录 whoami → exit 3」实得 exit=1、「llm --json mock 链路」。属基线环境态,不在本轮收敛范围,不删测换绿。
2. **各分支落地文档里的测试数字是该分支在各自基线上的实测**(如 `w9-eps-structure-check.md`、`w12-size-gap-check.md` 各记自己那一版的数字)。它们作为各自的落地记账是自洽的,本轮未逐份改写;**主干口径以本文第 3 节与 README 的 306 为准**。
3. **五面并集这段代码已经是三条并行分支反复撞车的热点**(本轮 20 处冲突里 8 处都在它上下,双端各 4 处)。它现在是一条长表达式 + 一条按序表断言,再加面仍要双端各改一次。若后续还要接审片面/生成面,可考虑把面清单收成一张单源表由两端同取,把"加一面"从"改两处实现 + 改两处断言"降为"改一处表"——本轮按"只解冲突不做功能变更"的边界没动。
4. `w6-integration-log.md` 第 5 节与 `w9-integration-log.md` 第 6 节列的其余分叉(SK-16 编排未含前段两步、记忆召回输入偏弱、`tplReview` 两端取值不一致、`S-08` 尚无关联入选项)本轮同样未动,都属功能变更而非冲突收敛。

`w9-integration-log.md` 第 6 节的第 1、2 条本轮已闭合:剧本段落地文档随 W8 尾巴到位;字幕面被消费的断言由 W11 补上并在本轮实测接住(见 4.2)。

## 7. 复核方式

```
git checkout cursor/w13-integration-a394
node --check js/skills.js js/commands.js js/issues.js cli.js tests/unit.js   # 全部通过
node tests/unit.js          # 306/306 PASS
node tests/integration.js   # 93/93 PASS
node tests/cli.smoke.js     # 62/64(2 项与 master 同样失败)
```

单套件复核:`node tests/unit.js skills`(42/42,含分集段 6 项、分镜段 2 项与两条并集断言)、`node tests/unit.js commands`(28/28,含行为并集断言)、`node tests/unit.js issues`、`node tests/unit.js contract`。

`node tests/e2e.js` 按仓库纪律未跑(需用户明确要求)。三个合并均为独立 `--no-ff` 合并提交,想回退某一条分支 revert 对应的那个合并提交即可,不影响其余。
