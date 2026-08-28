# W135 · 发布门 G1 未过门回执的两处失真(推荐动作恒印 undefined / 漏注入 Domain 时 fail 降 warn)

一句话:`js/release-core.js` 的 G1 收集侧把每集的推荐动作按 `action` 存进 blocker、
渲染侧却读 `b.label`,于是**每一集恒印 `集名(状态:undefined)`**;顺着同一段读下去还有第二处——
`gates()` 漏注入 `opts.Domain` 时逐集调用当场抛错、被 G1 那个 `catch` 兜成 `warn`,
同一个未完成的项目于是从 `fail`(`fails` 1)变成 `warn`(`fails` 0)。
**门禁判据一个字没动**,改的只是这两处回执面;两条各配一条变异能转红的用例。

## 1. 病灶:一个字段名,两行之间对不上

改之前那段(`gates()` 的 G1 分支):

```js
if (st.status !== 'done') blockers.push({ ep: …, status: st.status, action: (st.action && st.action.label) || '' });
…
blockers.map(b => b.ep + '(' + b.status + (b.action ? ':' + b.label : '') + ')')
```

存的键是 `action`,读的键是 `label`。三元的**条件**读对了(`b.action` 非空才拼冒号),
**取值**读错了(`b.label` 恒 `undefined`)——所以它不是"有时候不显示",而是
"凡是要显示推荐动作的那一集,一律显示 `undefined`",条件判对反倒把这句谎话稳定印了出来。

`js/release.js`(浏览器那半)同一段存的就是 `label`、读的也是 `label`,故只有 headless 这一份坏。
**本槽把 headless 侧的键名改成 `label`**(而不是把渲染侧改成 `b.action`):两端同一段代码此后逐字同形,
下一个人对读时不必先分辨"这两个键是不是同一件事"。

实测(同夹具两集,一集缺正文、一集没镜头):

| | 改前 | 改后 |
|---|---|---|
| `gates().gates[0].info` | `第1集(blocked:undefined)；第2集(ready:undefined)` | `第1集(blocked:编写剧本)；第2集(ready:生成分镜)` |
| `Release.collect` 同夹具 | `· 第1集(blocked:编写剧本)；· 第2集(ready:生成分镜)` | 同左(未改) |

### 1.1 坏的是回执不是门

`status`/`fails`/`warns`/`overall` 四个数改前改后逐字相同,`precheck` 放不放行也没变——
被污染的只有 `info` 那一句字符串。它有三个 headless 消费点:
`cli.js` 的 `release-check` 把整份 `gates`(含 `info`)当 JSON 打出来、
MCP `hujing_release_check` 包的就是这条命令、服务端 `/api/wf/release` 的成功回执带整份 `gate`。
`ReleaseCore.brief()` 只摘 `code`/`label`/`status` 不摘 `info`,故 `exec project.release` 的 blocked 回执看不见这处——
**这也是它能一直活着的原因**:冒烟里跑得最多的是那条路,而它恰好不印这句话。

## 2. 第二处:漏注入 `Domain` 时,判不出来被记成了"没有未过门项"

`Domain` 是本层的必注入依赖(`opts.Domain`)。漏传时 `Domain.episodeState` 是 `undefined`,
逐集那行当场 `TypeError`,落进 G1 自己的 `catch` 记成 `warn`。同一个未完成的项目于是有两种回执:

| | G1 status | `fails` | `overall` |
|---|---|---|---|
| 注入 `Domain` | `fail` | 1 | `fail` |
| 漏注入 | `warn`(`Domain 异常:…`) | **0** | `warn` |

`overall` 两种取值都不在 `PASS_OVERALL` 里(G10 那条 warn 常在,漏注入时 `warns` 至少 2),
**故没有任何一版能靠漏注入把版本打出去**——这是回执失真,不是门被绕过,本文不把它写成安全洞。
但"未过门项 1 条"变成"未过门项 0 条"这句话本身是假的,而看回执的人分不出
"这个项目真的没有 fail" 与 "这一门根本没判成"。

处置:在 G1 开头显式判一次注入,缺注入按 **fail** 记并点名缺的是什么,`catch` 那条(Domain 自身抛错)一字未动。

```js
if (!Domain || typeof Domain.episodeState !== 'function') {
  list.push(gate('g1-workflow', '主线步骤全完成', 'fail', '缺 Domain 注入:主线状态判不出来')); fails++;
} else try { …原样… } catch (e) { …原样 warn… }
```

### 2.1 为什么这不叫抬门

三条判据摆在一起看:

1. **判据没动**:注入齐全时,七门的判定、`fail`/`warn` 计数与 `overall` 四级映射逐字未改
   (release 套件里那条"headless 七项核心门与前端逐字同口径"的用例原样全绿,本槽一个字没碰它)。
2. **改的是"判不出来"这一格**,而它此前的取值(`warn`,`fails` 0)是在**声称一件没发生过的事**:
   G1 没有判过,却给出了"未过门项不含 G1"的结论。按未过门算,回执与实况才对得上。
3. **浏览器那半的 `warn` 不是同一件事**:`js/release.js` 判的是 `typeof Domain !== 'undefined'`,
   说的是"页面模块没加载",那是渲染环境的降级;headless 这一格说的是"调用方漏传参数",
   在 Node 里 `Domain` 永远 `require` 得到,漏传只可能是接线错。两者不必同值,故本槽不动浏览器那半。

现有三个调用点(`cli.js` 的 `_releaseGates`、`server.js` 的 `/api/wf/release`、经这两者的 MCP)
**都显式注入了 `Domain`**,故本槽对既有链路零行为变化——这一格是给下一个新增调用点准备的。

## 3. 变异实测

改完逐条改回去跑 `node tests/unit.js release`,验完还原(`git diff` 只剩本槽的改动):

| 变异 | 结果 |
|---|---|
| 键名改回 `action`、渲染侧改回 `b.label`(即基线形态) | 红 1 条:`G1 回执不许出现 undefined…实际:第1集(blocked:undefined)；第2集(ready:undefined)` |
| 缺注入那格由 `fail` 改成 `warn`(其余不动) | 红 1 条:`缺 Domain 注入不得降成 warn:期望 "fail",实际 "warn"` |
| 整段守卫删掉(退回只有 `try/catch` 的基线形态) | 红同上一行那一条(走的是 `catch` 那条 `warn`,报错文案一致) |

两条用例**报错不混**:第一条只报回执字面,第二条只报判不出来那一格,
而它们各自的另一半(门禁计数、七门齐不齐)在两次变异里都没红。

第一条用例另把浏览器那半一起钉住:同一夹具下两端 `info` 除 `· ` 前缀外逐字相同,
故此后任一侧单独改坏渲染都红——**这处失真的成因正是两份渲染各写一份**,判据就落在"两份必须同形"上。

## 4. 本槽没做的事

- **不动发布门门槛**。G1 判的是逐集 `Domain.episodeState`(读 `ep.content`),`p.script` 一个字不读;
  `w110-split-only-script.md` 与 `w112-integration-log.md` 已把这条误记清过一轮,本槽照旧不碰。
- **不动 `catch` 那条的文案与 `label`**(它那条 gate 的 `label` 写的是「主线步骤」而不是「主线步骤全完成」,
  与另三条不齐,但它是 Domain 自身抛错那一路、与本槽两处失真不同源,留着不顺手改)。
- **不动 G4/G5/G6 的聚合**。那段自己有一个 `catch (_) {}`,漏注入 `Domain` 时三门会静静报 0 镜、全 pass,
  形态与本槽第二处同类。没有一并改是因为改法不同(那处要么按未判处理、要么与 G1 共用一次注入判定),
  改动面比"补一格"大;**如实登记为仍欠**,见第 6 节。

## 5. 数字(live 现取)

| | 本槽前 | 本槽后 |
|---|---|---|
| `tests/unit.js` 用例数 | 492 | **494**(release 套件 +2) |
| 单元测试 `FLOOR` / 主 README 明写数 | 492 | **494** |
| `tests/integration.js` / `tests/cli.smoke.js` | 130 / 102 | 未动(都复核过) |
| 记账件份数 / 目录 README 明写数 / 记账件 `FLOOR` | 147 | **148**(含本文) |

`node tests/unit.js` 494/494、`node tests/integration.js` 130/130 全绿;
`cli.smoke` 按任务口径允许 2 项 master 既有失败。

## 6. 交接

1. **G4/G5/G6 的 `catch (_) {}` 是同一类失真的另一面**(第 4 节)。要收的话建议与 G1 共用一次注入判定,
   而不是在三门各补一格——三门的 `agg` 是同一次遍历算出来的,分开补会出现"G1 说判不出来、G4 说 0 镜"这种自相矛盾的回执。
2. **回执字面这一层此前零判据**。本槽之前没有任何一条用例读过 G1 的 `info`,
   故"存的键与读的键对不上"这种错只能靠人眼看回执发现(而它印的是 `undefined`,看的人多半当成没配置)。
   往 `gates()` 加门或改 blocker 结构时,记得同轮把那条字面断言跟着改——它现在是这段唯一的守卫。
3. **两端各一份渲染仍在**。`js/release.js` 与 `js/release-core.js` 的 G1 blocker 串是两份实现同一句话,
   本槽只做到"同形 + 有断言钉着",没有收成单源。真要收,收的是那半行字符串拼接,
   代价是 `release-core` 要开始承担浏览器那份 `· ` 前缀与 `fix` 挂载的差异,划不划算下一个人自己判。
