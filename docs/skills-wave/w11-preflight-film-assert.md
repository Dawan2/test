# W11 · 就绪检查必须消费字幕面(补断言,不改行为)

> 分支:`cursor/w11-preflight-film-assert-883b`,基线 `cursor/w9-integration-f8f9 @ 641a1f5`。
> 处理对象是 [w9-integration-log.md](./w9-integration-log.md) 第 6 节残留 2(与其 4.2 节末尾的自述):
> **就绪检查缺「字幕面被消费」的断言**。本轮**只新增断言,不改任何实现、不放宽任何既有断言、不删测**。
> 校验项本身的口径见 [w4-film-caption-check.md](./w4-film-caption-check.md),本文不复述。

## 1. 结果一句话

`episode.preflight` 的 `result.checks` 必须是**剧本 + 主体 + 成片字幕三面并集**且按主线步序,新增两条断言把这条口径锁死:
把 `film` 从**任一端**摘掉都转红,`unit 290/290`(基线 288,`+2` 项)、`integration 93/93` 全绿。

## 2. 盲区到底在哪(基线实测,不靠读代码判断)

基线上确实已有一条断言扫过源码文本:

```js
// tests/unit.js 'subtitleTiming:消费点——就绪检查双端附结论 + 问题中心低危'
[['js/commands.js'], ['cli.js']].forEach(([f]) => {
  const src = fs.readFileSync(path.join(ROOT, f), 'utf8');
  assert(/Skills\.check\('film'/.test(src), f + ' 就绪检查应跑成片字幕面校验项');
});
```

它挡得住"整段删掉",挡不住"算了但不用"——因为判据是**整个文件里出现过这个字符串**,与它是否并进 `result.checks` 无关。基线上逐一实跑过两种摘法:

| 摘法(两端同时改) | 基线 unit | 结论 |
|---|---|---|
| `checks` 表达式里删掉 `Skills.check('film', …)`,调用点一并删除 | **287/290 → 1 FAIL** | 挡得住 |
| 保留调用、结果赋给别处(`const cap = Skills.check('film', …)`),`checks` 只并 script+subjects | **288/288 全绿** | **漏**:字幕面在就绪检查里已彻底不产出,测试不知道 |

第二种不是臆造的写法:改这段时把某一面挪出并集(留着变量准备"稍后单独展示")最容易顺手写成这样,而它的后果与整段删除完全一样——`result.checks` 里不再有 `film.subtitleQC`,UI 就绪检查单屏与 CLI `exec` 回执双双静默少一面。

## 3. 补了什么

### 3.1 行为断言(浏览器端,`commands` 套件)

`tests/unit.js` `preflight:result.checks 是剧本+主体+成片字幕三面并集(按主线步序,摘任一面即红)`——真跑 `Commands.execute('episode.preflight')` 看回执,不看源码:

- 夹具让字幕面**必产出非空结论**:烧录字幕开启(`sbConfig.subtitle`)+ 镜1 台词 130 字 > `Domain.SUB_BURN_MAX`(120)→ `caption-truncated`、`level: 'fail'`。选 fail 而不是随便一条 warn,是因为空 `info` 结论("时间轴未成形")与"这一面没跑"在回执上长得一样,不能作为消费凭据。
- `checks.map(x => x.skill).join(',')` 逐字对齐六条并集与步序:
  `script.hookStrength,script.faceslapFour,script.dialogueRule,subjects.refIntegrity,subjects.crossShot,film.subtitleQC`。
- `JSON.stringify(checks)` 逐字节等于三面直跑结果的 `concat`——命令层不得对某一面二次过滤/降级/改序。沙箱无 `Media`,`online()` 恒 false,直跑侧显式传 `{ online: false }` 对齐。
- 只报不拦仍成立:`ok === true`、`status === 'ready'`、字幕结论不进 `blockers`、`cost === undefined`。

### 3.2 结构断言(双端源级,`skills` 套件)

`tests/unit.js` `就绪检查校验面并集(源级):双端 preflight 段内 script/subjects/film 同在一条 checks 表达式,登记面无漏消费`。CLI 侧 `cli.js` 加载即 `main()`,单测里没法 require 后直接调 `EXEC['episode.preflight']`,所以 CLI 端仍走源级,但把判据从"整个文件"收窄到两处:

1. **先切段**:`js/commands.js` 取 `reg('episode.preflight'` → `reg('episode.generateStoryboard'` 之间,`cli.js` 取 `EXEC['episode.preflight']` → `EXEC['episode.generateVideos']` 之间;
2. **再切表达式**:段内从 `const checks =` 到该语句的 `;`,三面必须都在**这一条表达式**里,且 `script` 位置 < `subjects` < `film`;
3. 段内还须有 `result: Object.assign({}, st, { checks })`,即并集确实附在 `result.checks` 上。

外加一条**按登记侧反查**的通用断言:凡 `Skills.list()` 里已落地(`pending` 不含 `check`)、`checks` 非空、且 `cmds` 含 `episode.preflight` 的条目,其 `stage` 面必须出现在这条表达式里。这条不写死面名,将来 SK-14/15(分集面,现仍 `pending: ['check']`)落地并登记该消费点时,忘接就绪检查会先红,不必再补一次断言。

## 4. 反向验证:五种摘法逐一实测转红

在**补完断言之后**逐个改回去跑,确认不是"只挡得住某一种写法":

| # | 摘法 | 结果 | 转红的断言 |
|---|---|---|---|
| 1 | 两端整段摘掉 `film` | 287/290 | 行为并集 + 基线那条文本 + 新结构断言 |
| 2 | 两端算出 `film` 但不并进 `checks` | 288/290 | **行为并集 + 新结构断言**(基线唯一那条仍绿——正是本轮补的那块) |
| 3 | 两端把 `film` 排到 `subjects` 之前 | 288/290 | 行为并集(步序)+ 新结构断言(步序) |
| 4 | 只 `cli.js` 摘掉 | 288/290 | 基线那条文本 + 新结构断言(CLI 端单独可查) |
| 5 | 只 `js/commands.js` 摘掉 | 287/290 | 行为并集 + 基线那条文本 + 新结构断言 |

每次实测后源码原样还原,`git diff` 对 `js/commands.js`/`cli.js` 为空——**本轮零实现改动**。

## 5. 边界:没做什么

- **没改实现**:`js/commands.js`、`cli.js`、`js/skills.js`、`js/issues.js` 一行未动。
- **没放宽任何既有断言**:基线那条文本断言原样保留(它在摘法 1/4/5 下仍是有效的第二道),新断言只做加法。
- **没删测**:`master` 上原有的两项 `cli.smoke` 失败(「未登录 whoami → exit 3」、「llm --json mock 链路」)不在本轮范围,不动。
- **SK-14/15 分集校验没有可合的分支**:任务提到"若已存在可顺手合入"。逐条实测远端 `cursor/*`,没有实现该面的分支,`js/skills.js` 里 `eps.structureStage`(SK-14)/`eps.payoffPoint`(SK-15)仍 `pending: ['check']` 且 `gaps` 记 S-01——本轮不新造该功能,只把 3.2 的反查断言留成它的落地闸门。
- **CLI 端的行为覆盖仍在 `cli.smoke.js`**(`exec preflight 附成片字幕面校验项`,实测两镜无素材 → `info` 空结论)。那一层要起真实服务与登录态,不进 `unit`;`unit` 侧 CLI 端只到结构级,这是本轮已知的覆盖边界。

## 6. 顺带记的两处残留(未处理)

基线之后远端又多出两条未合入本分支的提交,都是文档/注释类,与本轮断言无关,按"不重做他人功能"未合:

- `origin/cursor/w8-script-check-8664`:`97f6ba2`(README 同步 + 落地件 `docs/skills-wave/w8-script-check.md`)、`bbd7ebb`(打脸四步词表注释修正)——正好对应 w9 残留 1"剧本段三条缺落地文档"。
- `origin/cursor/w7-integration-fa8a`:`072f342`(W7 收敛记录文档)——正好对应 w9 残留 4"`w7` 没有留集成记录"。

## 7. 复核方式

```
git checkout cursor/w11-preflight-film-assert-883b
node --check tests/unit.js js/commands.js cli.js js/skills.js   # 全部通过
node tests/unit.js commands   # 含新增的三面并集行为断言
node tests/unit.js skills     # 含新增的双端源级并集断言
node tests/unit.js            # 290/290 PASS(基线 288,+2 项)
node tests/integration.js     # 93/93 PASS(与基线同)
```

`node tests/e2e.js` 按仓库纪律未跑(需用户明确要求)。README 同步单独一个提交:断言数 `288 → 290`,并在 `commands.js`/`skills.js` 两段单测覆盖描述里写明新增的这两条。
