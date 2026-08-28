# W137 · 发布门 G4/G5/G6 聚合的空 catch:判不出来被记成「0 镜 pass」

一句话:`js/release-core.js` 的 `gates()` 里,G4 过期镜 / G5 未确认镜 / G6 失败镜是**同一次遍历**算出来的,
那次遍历外面兜着一个 `catch (_) {}`——遍历失手时三门拿 `agg` 的初值照常报 `pass`,
回执上写着「0 镜」,读回执的人得到的是"查过了,一镜不缺",而实际**一镜未查**。
本槽把这次遍历的失手如实记进门禁结论:**缺 `Domain` 注入按未过门(`fail`)算、`Domain` 自身抛错按 `warn` 记**,
判据(注入齐全时三门怎么判、怎么计数)一个字没动。四条变异各自能红。

W135 在它的记账件第 4 节把这处如实登记为「仍欠」并写明了改法要求(三门同一次遍历,分开补会出现自相矛盾的回执),
本槽只接这一面;**G1 的两处失真(推荐动作恒印 `undefined`、漏注入时 fail 降 warn)是 W135 的活,本槽一个字不碰**。

## 1. 病灶:三个数,一次遍历,一个空 catch

改之前那段:

```js
const agg = { stale: 0, unconfirmed: 0, failed: 0 };
try {
  eps.forEach(ep => {
    const st = Domain.episodeState(p, ep, online);
    ['stale', 'unconfirmed', 'failed'].forEach(k => { agg[k] += (st.counts && +st.counts[k]) || 0; });
  });
} catch (_) {}
list.push(gate('g4-stale', '过期镜=0', agg.stale ? 'fail' : 'pass', agg.stale + ' 镜')); if (agg.stale) fails++;
…G5 / G6 同形
```

`catch (_) {}` 吞掉异常之后,下面三行**照样跑**,读的是那个从未被写过的 `agg`。两种失手各有一种坏法:

| 失手 | 改前的回执 | 实况 |
|---|---|---|
| 漏注入 `opts.Domain`(`Domain.episodeState` 不是函数) | 三门 `pass`,`info` 均为 `0 镜`,`fails` +0 | 一集都没遍历 |
| 遍历到第二集才抛(第一集已攒进 `agg`) | G4 `fail`「2 镜」、G5/G6 `pass`「0 镜」 | 三个数都只算了半截 |

第二行那种更坏:它不是"少判了一门",而是**给出了一个具体的数**——2 镜、0 镜、0 镜,
三个数没有一个是全量算出来的,而回执上看不出任何异常痕迹。

## 2. 处置:一次遍历一个结论,失手按级记

```js
const agg = { stale: 0, unconfirmed: 0, failed: 0 };
let aggErr = null;
if (!Domain || typeof Domain.episodeState !== 'function') aggErr = { status: 'fail', info: '缺 Domain 注入:镜次计数判不出来' };
else try { …原样遍历… } catch (e) { aggErr = { status: 'warn', info: 'Domain 异常:' + e.message }; }
[['g4-stale', '过期镜=0', 'stale'], …].forEach(t => {
  if (aggErr) { list.push(gate(t[0], t[1], aggErr.status, aggErr.info)); if (aggErr.status === 'fail') fails++; else warns++; return; }
  list.push(gate(t[0], t[1], agg[t[2]] ? 'fail' : 'pass', agg[t[2]] + ' 镜')); if (agg[t[2]]) fails++;
});
```

三处要点:

1. **三门共用一个 `aggErr`**。W135 交接里点名的那个坑(分开补会出现"G4 说判不出来、G5 说 0 镜"这种自相矛盾的回执)
   由此堵住:它们本就是一次遍历的三个投影,判不出来时也该是同一句话。变异 3 实测这一点。
2. **两种失手记两级**,与 G1 那条 `catch` 的分级一致:漏传参数是接线错(`fail`),`Domain` 自身抛错是运行时异常(`warn`)。
   `fails`/`warns` 跟着记——只改 `status` 不计数的话,`brief()` 的 `blockers` 有了这三条、
   `overall` 与 `score` 却还是按"没有未过门项"算,回执照旧是假的(变异 4 实测)。
3. **失手时不印镜数**。`info` 给的是缺什么 / 错在哪,不再给一个算了半截的数——
   没有哪个数比"这一门没判成"更该出现在这一格里。

### 2.1 为什么这不叫抬门

- **判据没动**:注入齐全时,三门仍是"计数非零即 `fail`",`info` 仍是 `N 镜`,`fails` 计数一个字未改
  (release 套件里"headless 七项核心门与前端逐字同口径"那条原样全绿,新用例第一段也正面钉住这三门在齐备夹具上仍 `pass`)。
- **改的是"判不出来"这一格**,而它此前的取值(`pass`,`0 镜`)在**声称一件没发生过的事**。
- **既有链路零行为变化**:三个调用点(`cli.js` 的 `_releaseGates`、`server.js` 的 `/api/wf/release`、经这两者的 MCP)
  都显式注入了 `Domain`,`Domain.episodeState` 本身也不抛(逐集读状态,无 IO)。这一格是给下一个新增调用点与
  日后 `episodeState` 真出错的那天准备的。
- **不能靠它把版本打出去**,反过来也不会因它多拦下谁:漏注入时 G10 那条 `warn` 常在,
  `overall` 无论如何都不在 `PASS_OVERALL` 里;这与 W135 那处一样,是**回执失真**而不是门被绕过。

### 2.2 与 G1 那半的关系

G1 与 G4/G5/G6 调的是**同一个** `Domain.episodeState`,故任一处失手在两处同时发生。合并 W135 之后两处口径对齐:

| 失手 | G1(W135) | G4/G5/G6(本槽) |
|---|---|---|
| 漏注入 `Domain` | `fail`「缺 Domain 注入:主线状态判不出来」 | `fail`「缺 Domain 注入:镜次计数判不出来」 |
| `Domain` 抛错 | `warn`「Domain 异常:…」 | `warn`「Domain 异常:…」 |

本槽从 `w133` 那条集成线的 tip 起分支(W135 的改动不在基线里),故**本分支单独跑时**漏注入这一格是
"G1 `warn` + 三门 `fail`"——不自相矛盾(两边都在说判不出来),只是级别未齐;W135 合入后自动齐平。
新用例特意不断言 `gates.fails` 的绝对值(只断言"这三门的未过门计进了 `fails`"),
就是为了这两种基线下都成立、合并时不需要改断言。

## 3. 变异实测

四条逐条改回去跑 `node tests/unit.js release`(16 条),验完还原:

| 变异 | 结果 |
|---|---|
| 整段退回基线形态(`try { … } catch (_) {}` + 三行直读 `agg`) | 红 2 条:漏注入那条报「g4-stale 判不出来不得报 pass:期望 "fail",实际 "pass"」;半途抛错那条报「期望 "warn",实际 "fail"」 |
| 缺注入那格由 `fail` 改成 `warn`(其余不动) | 红 1 条:「g4-stale 判不出来不得报 pass:期望 "fail",实际 "warn"」——半途抛错那条不红(它判的是另一格) |
| 只给 G4 记失手、G5/G6 仍直读 `agg`(即分开补的那种改法) | 红 2 条,且**都点名 `g5-unconfirmed`**——自相矛盾的回执当场报出 |
| `status` 照记但去掉 `fails++`/`warns++` | 红 2 条:「这三门的未过门须计进 fails…实际 0」与「三门 + G10 至少四条 warn,实际 2」 |

两条用例**报错不混**:漏注入那条只报缺注入那一格,半途抛错那条只报"拿半截计数下结论",
而"注入齐全时仍 `pass`"这一段在四次变异里一次没红(判据确实没动)。

## 4. 本槽没做的事

- **不碰 G1**(W135 在飞,见开头)。也不碰 `catch` 那条 gate 的 `label` 与 G3/G9/G10。
- **不碰浏览器那半**。`js/release.js` 的同一段也有 `catch (_) {}`,但它外面还套着
  `if (typeof Domain !== 'undefined' && Domain.episodeState)`,说的是"页面模块没加载"这种渲染环境降级,
  与 headless 这一格"调用方漏传参数"不是一回事(W135 已就 G1 把这条边界写清,本槽照旧不动它)。
  **这仍是一处残留**:浏览器侧 `Domain` 加载了却抛错时,三门照样静静报 0 镜,见第 6 节。
- **不让 G1 去读 `p.script`**,不抬任何一门的门槛,不动 `overall` 四级映射与 `PASS_OVERALL`。

## 5. 数字(live 现取)

| | 本槽前 | 本槽后 |
|---|---|---|
| `tests/unit.js` 用例数 | 492 | **494**(release 套件 14 → 16) |
| 单元测试 `FLOOR` / 主 README 明写数 | 492 | **494** |
| `tests/integration.js` / `tests/cli.smoke.js` | 130 / 102 | 未动(都复核过) |
| 记账件份数 / 目录 README 明写数 / 记账件 `FLOOR` | 147 | **148**(含本文) |

`node tests/unit.js` 494/494(`contract` 子套件 107/107)、`node tests/integration.js` 130/130 全绿;
`node tests/cli.smoke.js` 实跑 **100/102**,两项失败(「未登录 whoami → exit 3」实得 exit 1、「llm --json mock 链路」)
在本槽改动前的基线上现跑同样是这两项,与本槽无关;发布门那一串(`release-check` 七门结构、
基线项目 `overall=fail`、`exec project.release` 的 blocked 与 `--force`)逐条仍绿。

本槽与 W135 都会把单元 `FLOOR` / README 明写数改到各自基线上的 live 494、把记账件那两个数改到 148。
两支叉在同一个 tip 上、彼此不在对方基线里,故**合并时这四个数一律现取合并后实况**(单元 496、记账件 149),
不许抄任一父分支——W133 记账件第 4 节已就"两侧同值零冲突块"这个形态量过一轮,那处正是 `git` 不请你过目的地方。

## 6. 交接

1. **浏览器那半的同款空 catch 仍在**(第 4 节)。它与 headless 这一格的差别只在"Domain 没加载"要不要算降级;
   `Domain` 加载了却抛错时两端都该说判不出来,而浏览器侧现在仍会印 0 镜 pass。要收的话判据落在
   "`typeof Domain !== 'undefined'` 之内的失手不许吞",别顺手把没加载那一路也改成 `fail`(那是渲染环境降级,不是接线错)。
2. **`gates()` 里还有一次重复遍历**。G1 与 G4/G5/G6 各自把 `eps` 走了一遍、各自调同一个
   `Domain.episodeState(p, ep, online)`,结果既没共用也没互相印证。收成一次遍历能顺带让两处的失手天然同结论
   (不再靠人工对齐两段 `if`),代价是要动 G1 那段——本槽因 W135 在飞而没动,**下一个人接手时 W135 应已合入,届时可以一并收**。
3. **回执字面这一层的判据仍薄**。W135 给 G1 的 `info` 立了第一条字面断言,本槽给这三门立了
   "失手时不许印镜数"这一条;其余四门(G3/G9/G10 与 `catch` 那条)的 `info` 至今零断言。
   往 `gates()` 加门或改 `info` 拼法时,记得同轮把对应的字面断言补上——这段的历史证明,回执面没人看着就会长出谎话。
