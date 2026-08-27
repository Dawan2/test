# W17 · 就绪检查校验面清单收成双端单源表

> 基线 `cursor/w13-integration-a394 @ 2b67101`,落地分支 `cursor/w17-preflight-stages-0857`。
> 本槽只做一件事:把 `episode.preflight` 的校验面清单收成一处单源,**不新增任何校验项、不改任何一条结论**。
> 各校验面本身怎么判在各自落地文档里(`w8-script-check.md`、`w4-subject-ref-check.md`、`w4-sk13-consistency.md`、`w9-eps-structure-check.md`、`w12-size-gap-check.md`、`w4-film-caption-check.md`),本文不复述判据。

## 1. 结果一句话

面清单从"两端各写五个面字面量"收成一张由注册表推出的单源表 `Skills.preflightStages()`,两端就绪检查只读该表 `concat`。行为逐字节不变(仍是 `script → subjects → eps → shots → film` 五面九条结论),**新增一面从"改两处实现 + 改两处断言"降为"改一处登记"**。

回归:`unit 307/307`(基线 306,净 +1 用例)、`integration 93/93`、`cli.smoke 62/64`——两项失败在基线上逐项相同,属基线环境态,未删测未放宽断言。

代码侧净增 16 行删 7 行,三个文件:`js/skills.js` +9(单源表)、`js/commands.js` 与 `cli.js` 各只动 preflight 那一段。

## 2. 为什么收这一处

`w13-integration-log.md` 第 6 节第 3 条把这段登记为**冲突热点**:W13 那轮 20 处冲突里 8 处在它上下(双端各 4 处),三条并行分支各自基于"三面"的旧版改同一段长表达式,**任一侧胜出都会静默摘掉别人那一面**(取 `w9-eps` 侧则字幕面消费点没了,取 `w12` 侧则分集面没了)。

收表前的形态是两端各一条写死五个面的长表达式:

```js
// 收表前(js/commands.js,cli.js 同形)
const checks = window.Skills
  ? Skills.check('script', { p, ep }, ck).concat(Skills.check('subjects', { p, ep }, ck), Skills.check('eps', { p, ep }, ck),
    Skills.check('shots', { p, ep }, ck), Skills.check('film', { p, ep }, ck))
  : [];
```

加一面要动四处:两端实现各一次、两端断言各一次(源级面清单数组 + 行为断言期望串)。四处里漏任何一处,要么某端少一面(单端漏接),要么口径断言与实现不同步。

## 3. 单源表长什么样

`Skills.preflightStages()` **不写死清单**,而是从注册表现推——面 = "校验面已落地且把 `episode.preflight` 登记为消费点"的条目所属主线步,按 `STAGES` 步序去重:

```js
preflightStages() {
  return STAGES.map(x => x.key)
    .filter(k => REG.some(s => s.stage === k && live(s, 'check') && s.cmds.indexOf('episode.preflight') >= 0));
},
```

三个判据各有其分工,少任何一个都会让表失真:

| 判据 | 作用 | 不加会怎样 |
|---|---|---|
| `s.stage === k` | 只看主 `stage`(与 `Skills.check(stage,…)` 的过滤口径同一份,后者也只按 `s.stage` 取) | 用 `covers` 会把跨步条目的旁挂面也算进来,与 `check()` 实际跑出的结论对不上 |
| `live(s, 'check')` | `kinds` 含 `check` 且不在 `pending`——即该面真有实现 | 现有两个条目校验面未落地却已登记 `episode.preflight`(SK-11 `subjects.refDiscipline`、SK-22 `gen.renderCredential`),后者会凭空把 `gen` 面带进表,而它跑出来是空数组,白占一面 |
| `cmds` 含 `episode.preflight` | 该条目自己登记了"我经就绪检查消费" | 会把只在别处消费的校验面(如只挂 `episode.compose` 的)拉进就绪检查 |
| 外层 `STAGES.map` 过滤 | 顺序由主线步序决定,不由条目登记序决定 | 表的顺序会随注册表里条目的挪位而变,`result.checks` 的排序就不稳定 |

现推出的表就是原来写死的那五面同序:`["script","subjects","eps","shots","film"]`。

两端现在同一条写法(段内不再出现任何面字面量):

```js
// js/commands.js
const checks = window.Skills
  ? Skills.preflightStages().reduce((all, stage) => all.concat(Skills.check(stage, { p, ep }, ck)), [])
  : [];

// cli.js
const ck = { online: true };
const checks = Skills.preflightStages().reduce((all, stage) => all.concat(Skills.check(stage, { p, ep }, ck)), []);
```

`cli.js` 顺带把原先五次重复的 `{ online: true }` 收成 `ck` 常量(与浏览器端同形),这是收表的必然结果而非独立改动:读表跑时 `ctx` 只有一个传入点。

## 4. 行为逐字节等价的取证

**收表不是行为变更**,这一点有两层取证。

第一层是 W11/W13 留下的**行为断言原样保留、原样通过**:浏览器端沙箱真跑 `Commands.execute('episode.preflight')`,断言 `result.checks` 的 `skill` 串仍是那九条同序,且与"直接跑五面"的结果 `JSON.stringify` 逐字节相等。这条断言的期望值是收表前写下的,收表后**一个字符没改就是绿的**。

第二层是本槽新增的一条独立对照用例:把收表前那份**五面写死并集**表达式原样留在测试里当 oracle,在 `online` 两种取值下与"读表 `concat`"逐字节比较。

```js
const legacy = Skills.check('script', { p, ep }, ck)
  .concat(Skills.check('subjects', { p, ep }, ck), Skills.check('eps', { p, ep }, ck),
    Skills.check('shots', { p, ep }, ck), Skills.check('film', { p, ep }, ck));
const byTable = Skills.preflightStages().reduce((all, stage) => all.concat(Skills.check(stage, { p, ep }, ck)), []);
assertEq(JSON.stringify(byTable), JSON.stringify(legacy), '读表 concat 应逐字节等于五面写死并集(online=…)');
```

夹具是脏项目(剧本铺陈过长 + 台词超长两镜 + 两镜零主体引用 + 六集分集表 + 一镜字幕超硬上限),九条结论里 `warn`/`fail`/`info` 三档与逐条 `hits` 都摆得到,不是"全 info 的空对照"。

同一用例还锁住**取表给副本**:`preflightStages()` 返回值被调用方 `push` 污染后,下次取表不受影响(`STAGES.map` 每次现生成新数组,这条断言防的是将来有人图省事改成返回缓存常量)。

## 5. 契约断言:两端同表

面清单收成一处之后,断言的着力点也跟着从"两端源码里各出现过什么"移到"表本身 + 两端只读表"。源级断言分三层:

| 层 | 断言 | 防的是 |
|---|---|---|
| 表的推导规则 | 与登记侧**双向对齐**:登记了 `episode.preflight` 的已落地校验面必在表里,表里的面也必有这样的登记条目;表按 `STAGES` 步序而非登记序(与 `Skills.stages()` 过滤结果逐字节比);`pending` 含 `check` 的条目不单独带面进表 | 表推歪(漏收已登记面 / 收进没人登记的面 / 顺序随条目挪位而变) |
| 表的内容与步序 | 现为 `script → subjects → eps → shots → film`,五面共九条结论 | 面数或步序被静默改动(改了就必须显式抬这条口径,见第 6 节) |
| 两端只读该表 | 两端 preflight 实现段内那条 `checks` 表达式必须包含**逐字节相同**的取表 `concat` 片段;段内不得出现任何写死面名的 `Skills.check('<面>'`;结论仍附在 `result.checks` | 单端退回写死清单、两端写法漂移、算出来却不并进回执 |

逐面消费点断言(剧本/主体/分集/分镜/字幕五组用例里各一处)同步走单源表:原先断"文件里出现过 `Skills.check('<面>'`",现在断"该面在单源表里 + 两端确实读该表 + 表按主线步序"。**判据只增不减**——原先只能证明某端源码里提到过这一面,现在还额外证明了它在两端跑出的同一份表里,且步序判据从"两端源码里的字符位置"移到了表这个唯一口径上。这五处改的是断言**形态**而非强度,一条测试都没删。

段内表达式的截取沿用 W11 那条约定:按 `seg.indexOf(';', i)` 截到首个分号,故整条表达式中间不得出现分号——现写法首个分号就在末尾。

## 6. 变异验证

三种变异逐个实测(改完即恢复,工作区复核干净):

| 变异 | 转红的断言 | 说明 |
|---|---|---|
| `film.subtitleQC` 条目摘掉 `cmds` 里的 `episode.preflight`(面表少一面) | 5 条:行为并集(浏览器端真跑,差异逐项打出) + 面表内容 + 逐字节等价对照 + 字幕面消费点 + 景别面步序 | 登记侧一动,表和两端同时跟着变——这正是单源的定义;而口径断言当场拦住,不会静默少报一面 |
| `cli.js` 单端退回五面写死清单(另一端仍读表) | 6 条:面表源级(取表片段缺失)+ 剧本/主体/分集/分镜/字幕五处消费点,**全部指名 `cli.js`** | 单端漏接不会被另一端掩掉;错误信息直接给出应有的那条写法 |
| 落地 SK-22 生成面校验(**只改 `js/skills.js` 一处**:注册实现 + 去掉 `pending`) | 3 条:行为并集 + 面表内容("现为五面")+ 逐字节等价对照 | 两端 preflight 源码**零改动**,面表自动变六面 `script→subjects→eps→shots→gen→film`,新面自动被双端消费 |

第三条是本槽要证的主命题,值得展开:变异只动了注册表一处,`git diff` 在 `js/commands.js`/`cli.js` 上没有任何与该变异相关的改动,而 `Skills.preflightStages()` 立刻变成六面、两端回执立刻多出那一面的结论。转红的三条都是"现为五面/九条"这类**口径快照**断言,它们的作用与 W13 记录的一致——**逼着新增方把口径显式抬一档,而不是静默通过**。新增一面的完整动作因此是:改一处实现(注册表登记),抬一处口径(测试里"现为 N 面"那几个数)。

## 7. 复核方式

```
git checkout cursor/w17-preflight-stages-0857
node --check js/skills.js js/commands.js cli.js tests/unit.js   # 全部通过
node tests/unit.js          # 307/307 PASS
node tests/integration.js   # 93/93 PASS
node tests/cli.smoke.js     # 62/64(两项与基线同样失败)
node -e "console.log(require('./js/skills.js').preflightStages())"   # [ 'script', 'subjects', 'eps', 'shots', 'film' ]
```

单套件:`node tests/unit.js skills`(含面表源级与逐字节等价两条)、`node tests/unit.js commands`(含行为并集断言)、`node tests/unit.js contract`。

`node tests/e2e.js` 按仓库纪律未跑(需用户明确要求)。本槽不含合并。与并行槽(W15 生成闸门、W16 收敛)的可能重叠只在 `tests/unit.js` 数组尾与 README 口径行:若撞车,面表实现这一处取本分支侧(它就是为消掉这处冲突而收的),"现为五面/九条"那几个数按并入后的实际面数抬档——W15 若把生成面校验落地,合并后表会自动变六面,只需抬这几个数,两端实现不用动。

## 8. 残留

1. `master` 上那两项 `cli.smoke` 失败(「未登录 whoami → exit 3」实得 exit=1、「llm --json mock 链路」)原样保留,属基线环境态。
2. **问题中心(`js/issues.js`)未收表**,本槽按边界没动:它有六个取值点,五个取的是**某一条具体校验项的 `hits`**(`eps.structureStage`/`eps.payoffPoint`/`subjects.crossShot`/`shots.sizeProgression`/`film.subtitleQC`),只有剧本那处取整面 `hits` 合并;取到之后各自拼展示文案与 `kind`/`sev`,挂载位置也分项目级/分集级两档。这与就绪检查"跑整面取并集"不是同一种消费形态,套同一张面表会把六条低危提醒的取值口径搅在一起。真要收,应另抽"提醒投影表"(面 → 校验项 id → kind/sev/挂载级别),单列一槽。
3. `w13-integration-log.md` 第 6 节第 3 条(本槽的来源)可以关闭;同节第 1/2/4 条(未合的三条分支、其余功能型分叉)不在本槽范围。
