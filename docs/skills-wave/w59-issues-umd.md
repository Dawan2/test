# W59 · 问题中心 UMD 双端化 + 提醒投影表

> 基线 `cursor/w55-integration-8f21 @ 3968658`,落地分支 `cursor/w59-issues-umd-a3d7`。
> 本槽只做一件事:把 `Issues.collect` 收成与 `js/domain.js` 同形的**双端 UMD 模块**,顺手把 W17 记的那张
> **提醒投影表**抽出来。**不新增任何 kind、不改任何一条结论、不抬发布门口径、不新增计费动作。**
> 各条提醒本身怎么判在各自落地文档里(`w8-script-check.md`、`w4-sk13-consistency.md`、`w9-eps-structure-check.md`、
> `w12-size-gap-check.md`、`w4-film-caption-check.md`),本文不复述判据。
> 未合并 W53–W58 任何一支;W54 那三条新投影(`no-review`/`review-stale`/`shot-stable-lexicon`)不在本分支,
> 它们与本槽的关系见 §7。

## 1. 结果一句话

`js/issues.js` 从"浏览器侧模块"变成**纯数据的双端投影核**:项目树与 `online` 一律经参数注入,模块内
不碰 `window`/`document`/`Store`/`Media`,Node `require` 与浏览器 `window.Issues` 对同一夹具
**逐字节同结论**;弹窗渲染、`Bus` 订阅重算与命令类处置移到浏览器薄封装 `js/issues-ui.js`,
对外仍是原来的 `window.Issues` 全局名与全部成员——调用方(项目页 / 工作台 / 发布门 G2 / Agent 对话流)**一行未改**。

同一轮把六个各自手写的校验项取值点收成一张**提醒投影表** `Issues.reminders()`(面 → 校验项 id →
`kind`/`sev`/挂载级别),`collect` 只按表跑,模块里只剩**一处** `check(` 调用点。

新出口:`node cli.js issues <pid>` 与 MCP `hujing_issues` / 只读资源 `hujing://project/{pid}/issues`,
只列不处置——零 LLM、零计费。

回归:`unit 392/392`(基线 389,净 +3 用例)、`integration 93/93`、`cli.smoke 70/72`
(两项失败在 `master` 与本槽基线上逐字相同:`未登录 whoami → exit 3`、`llm --json mock 链路`)。
未删测、未跳过失败、未放宽任何既有断言(六处断言按 W17 同一手法**改形态**,判据只增不减,见 §5)。

改动:`js/issues.js` +89−174(UI 段整段移出,投影表收掉六处手写)、新增 `js/issues-ui.js` +116、
`index.html` +1、`cli.js` +35、`mcp.js` +4、`tests/unit.js` +134−6,
`README.md` 与 `docs/AI助手接入指南.md` 口径同步,加本文。

## 2. 为什么是这一处

`w17-preflight-stages.md` 第 8 节第 2 条把这段登记为**单列一槽**,原话两件事:
问题中心没跟着就绪检查收表,以及"真要收,应另抽提醒投影表(面 → 校验项 id → kind/sev/挂载级别)"。
`w54-issues-unreviewed-sk19.md` 第 4 节又记了一次:`js/issues.js` 仍偏浏览器,判断在 `domain.js`/`skills.js`,
UMD 化是"另一件事",第 9 节第 1 条把这笔账原样留着。

收之前的形态有两处硬伤:

1. **环境句柄写死在模块里**。`const online = () => !!(window.Media && Media.isReady && Media.isReady());`
   加上 `window.Skills ? … : []`、`window.Domain ? … : {}` 三处运行时查找,让这份推导只能在有 `window`
   的地方跑。CLI 与 MCP 想给出"这个项目现在有什么问题"就只能各写一份——而它们**确实还没写**,
   headless 侧至今只能从 `release-check` 的 G1/G3 与 `exec episode.preflight` 的 `result.checks` 侧面看,
   看不到问题中心那份分级清单。
2. **六个取值点各写一遍**。同一件事(取某面某条校验项的 `hits` → 拼文案 → 挂 kind/sev)在 `collect` 里
   出现六次,面字面量散在六处;`eps` 面被跑两次(项目级一次、分集级一次),`shots` 面上再挂一条投影
   就得再决定"跑第二次还是分结果"(W54 落 SK-19 时正是当场做了这个决定)。

## 3. UMD 核长什么样

UMD 头与 `js/skills.js` 同形(依赖两件双端纯模块,`Skills` 以解析器形态传入):

```js
(function (root, factory) {
  const isNode = typeof module === 'object' && module.exports;
  const I = factory(isNode ? require('./domain.js') : root.Domain, isNode ? () => require('./skills.js') : () => root.Skills);
  if (isNode) module.exports = I; else root.Issues = I;
})(typeof self !== 'undefined' ? self : globalThis, function (Domain, skills) { … });
```

三个选择各有其理由:

| 选择 | 为什么 | 不这么做会怎样 |
|---|---|---|
| `Domain` 直接绑,`Skills` 传解析器 | `index.html` 里 `domain.js` 与 `skills.js` 都在 `issues.js` 之前;但 `release`/`contract` 两个测试沙箱**有意只加载 domain 不加载 skills**(它们测的是发布门与命令注册表,不是校验项) | 急切绑 `Skills` 会在这两个沙箱里绑到 `undefined` 并写死,而现形态每次现取——取不到就如实回空,与收表前 `window.Skills ? … : []` 的行为逐字相同 |
| `online` 经 `ctx.online` 注入 | 与 `Domain.episodeState(p, ep, online)` 同一参数面;浏览器薄封装现取 `Media.isReady()`,CLI 走服务端即在线 | 模块内读 `window.Media` 就把整份推导锁死在浏览器里(这正是收之前的形态) |
| 项目树 `p` 仍是第一个参数、`Store` 一概不碰 | `collect` 本来就只读传进来的 `p`;唯一碰 `Store` 的地方是 `bindBus` 里的 `Store.getProject(btn.dataset.pid)` —— 那是 DOM 角标刷新,天然属于薄封装 | 核里留一处 `Store` 就等于留一个前端状态桶依赖,Node 侧跑不起来 |

对外接口从 `collect(p)` 变成 `collect(p, ctx)`、`count(p, ctx)`,另导出 `reminders()`。
**旧签名不算破坏**:`ctx` 缺省即 `{online:false}`,与收表前"沙箱里没有 `Media` 故 `online()` 恒 false"逐字相同;
浏览器侧一律经薄封装进来,拿到的是补好 `online` 的那一份。

## 4. 提醒投影表

表就是 W17 那句话的直译——一行 = 一条提醒的完整投影口径:

| 字段 | 作用 |
|---|---|
| `stage` | 取哪一面(与 `Skills.check` 的面键同词表) |
| `skill` | 取该面哪一条校验项的 `hits`;`null` = 整面 `hits` 合并(剧本面是唯一一条) |
| `level` | 挂项目级(判定输入是整张分集表这类项目对象)还是分集级 |
| `phase` | 分集级条目排在未拆镜/判旧等早退分支之前(`pre`)还是之后(`post`) |
| `name`/`line`/`cap`/`tail` | 标题词、单条明细写法、明细最多列几条(`null` = 全列且不缀「等 N 处」)、明细尾注 |

现有六行:

| kind | sev | stage | skill | level | phase |
|---|---|---|---|---|---|
| `eps-structure` | low | eps | `eps.structureStage` | project | pre |
| `script-craft` | low | script | (整面合并) | episode | pre |
| `eps-payoff` | low | eps | `eps.payoffPoint` | episode | pre |
| `subject-inconsistent` | low | subjects | `subjects.crossShot` | episode | post |
| `shot-size-linkage` | low | shots | `shots.sizeProgression` | episode | post |
| `caption-unreadable` | low | film | `film.subtitleQC` | episode | post |

四处细节值得写下来,因为它们是"收表不改结论"的全部难点:

1. **`phase` 不是装饰**。剧本面与付费卡点排在 `no-shots`/`shots-stale` 两个 `return` 之前
   (剧本刚写完还没拆镜时正该看得见),其余三条排在后面。没有这一位,收表就会把六条一起挪到
   同一个位置,静默改掉两条提醒的可见性——那是行为变更,不是重构。
2. **`cap: null` 单独一档**。`eps-payoff` 的明细原本不截断也不缀「等 N 处」(一集至多两条命中),
   其余五条截 4 条。把它按 4 截会改文案。
3. **整面结论按面缓存**。同一 `level` 的一轮里,`cache[stage]` 让每面只跑一次;`eps` 面因为项目级与
   分集级各一轮、缓存对象各一个,故仍是各跑一次——与收表前的调用次数逐次相同,不多不少。
4. **`ctx` 统一传 `{online}`**。收表前只有 `film` 面带 `ctx`。实测 `ctx.online` 只被
   `gen.renderCredential`/`film.subtitleTiming`/`film.upstreamFinalContract` 三条读,前者不在任何投影的面上,
   后两条本来就在 `film` 面且本来就收到了 `ctx`,故统一传是零行为差。

标题词由 `labelOf` 现拼:项目级 `分集表 N 处<name>`、分集级 `「集名」N 处<name>`——原来六条文案
逐条对照,恰好都是这个形状(这也是能收成一张表的原因;不是这个形状就该留在表外)。

收表后 `collect` 里只剩**一处** `.check(` 调用:

```js
const res = cache[r.stage] || (cache[r.stage] = S.check(r.stage, obj, ck) || []);
return r.skill ? ((res.find(x => x.skill === r.skill) || {}).hits || []) : [].concat(...res.map(x => x.hits));
```

## 5. 六处断言按 W17 同一手法改形态(不是放宽)

`skills` 套件里五处逐面消费点原先断言"`js/issues.js` 里出现过 `Skills.check('<面>'`",
成片面那处断言"出现过 `x.skill === 'film.subtitleQC'`"。面字面量收进表以后这些正则自然点不住。

改法照抄 W17 收面表时那一手(`w17-preflight-stages.md` §5):**断言的着力点从"源码里出现过什么"移到
"表里登记了什么 + 只此一处按表取值"**。新形态是 `assertIssuesProjection(stage, kind, skill, level)`:

```js
const row = IssuesMod.reminders().find(r => r.kind === kind);   // js/issues.js 已可 Node require
assertEq(row.stage, stage); assertEq(row.skill, skill);
assertEq(row.sev, 'low');   assertEq(row.level, level);
assertEq((body.match(/\.check\(/g) || []).length, 1);           // 绕开表的第二处取值点即红
assert(!/\.check\('/.test(body));                               // 不得再写死面名
```

**判据只增不减**:原先只能证明源码里提到过这一面,现在还证明了它的危险级、取的是哪一条校验项、
挂在项目级还是分集级(这三件事此前一条都没被钉住),外加"不存在第二处绕开表的取值点"。
`kind: '<x>', sev: 'low'` 那六条源级字面断言**原样保留、原样通过**——表里每行的头两个字段就按这个顺序写。

第一版的"只此一处"写成了数 `.check(r.stage, obj, ck)` 出现次数,§6 第七条变异当场证明它拦不住
"另加一句 `S.check('shots', …)`"(计数仍是 1),遂改成按 factory 体计**全部** `.check(` 为 1。

## 6. 变异实测(七条,全部先红,改完即恢复,工作区复核干净)

| 变异 | 转红 | 说明 |
|---|---|---|
| 摘掉 `shot-size-linkage` 那一行 | 2 条:`issues` 景别用例 + `skills` 景别消费点(点名"投影表应登记提醒条目") | 表是唯一登记处,摘行两端一起没,故双端对照用例不会红——该红的是登记面断言 |
| `caption-unreadable` 抬成 `mid` | 2 条:用例的 `sev` 断言 + 消费点的低危断言 | 低危一旦抬档就会进发布门 G2 计数,两侧都钉住 |
| `eps-structure` 的 `level` 改成 `episode` | 2 条:`issues` 分集面用例(`epid` 应为 undefined)+ 消费点的挂载级别断言 | 判定输入是整张分集表,逐集重复报是噪音 |
| 薄封装退回 `Core.collect(p)`(不注入 online) | 1 条:薄封装用例(在线时应注入 `online=true`) | 注入断了的话在线态项目会按离线口径推导 |
| 核里直接读 `window.Media` | 1 条:薄封装用例的源级封死(`/\bwindow\b/`) | 这正是收之前的形态,退回即红 |
| CLI 手写一份 `reminderKinds` 清单 | 1 条:CLI/MCP 出口用例("不在 CLI 侧手写 kind 清单") | headless 侧写第二份口径,表就不是单源了 |
| 核里另加一句 `S.check('shots', obj, ck)` | 5 条:`skills` 五处消费点的"只此一处取值点" | 第一版断言漏拦(见 §5 末),收紧后当场接住 |

## 7. 边界:没做什么

- **一条 kind 都没新增**。本分支的 kind 集合与基线 `w55-integration-8f21` 逐条相同;W54 的
  `no-review`/`review-stale`/`shot-stable-lexicon` 不在本分支(未合 W53–W58)。两槽在同一张表上不冲突:
  W54 那三条合过来时,前两条是状态类(不进投影表,与 `low-review` 同层写在 `collect` 里),
  第三条 `shot-stable-lexicon` 正好是投影表里加一行 `{stage:'shots', skill:'shots.promptEightDim', sev:'low', level:'episode', phase:'post'}`
  ——W54 当时手写的"分镜面跑一次按 `x.skill` 分给两条投影"那段,收表后是表自带的行为(§4 第 3 点)。
- **发布门口径一个字未动**。`js/release.js` 未改,G2 仍只数高/中危;低危提醒仍不进 `Domain` 的
  `blockers`、不拦生成、不改 `episode.preflight` 的 `read` 类零计费定性。
- **CLI 只列不处置**。`issues` 命令不挂任何写状态或计费动作(用例逐个封死 `operationId`/`Tasks.run`/`POST(`/`billingAction`),
  处置一律由调用方自己发起对应的 `exec` 领域命令——与浏览器侧"低危一律导航类"同口径,不代按会扣积分的按钮。
- **`server.js` 未接**。它本来就没有 issues 出口,而问题清单是纯本地推导、服务端拿不出比 CLI 更多的东西;
  真要开成 HTTP 端点属另一件事(要定鉴权与 state 读取口径),本槽按最小改动不夹带。

## 8. 复核方式

```
git checkout cursor/w59-issues-umd-a3d7
node --check js/issues.js js/issues-ui.js cli.js mcp.js tests/unit.js   # 通过
node tests/unit.js          # 392/392 PASS
node tests/unit.js issues   # 13/13(含新增三条)
node tests/unit.js skills   # PASS(六处消费点已改钉表)
node tests/integration.js   # 93/93 PASS
node tests/cli.smoke.js     # 70/72(两项与 master 同名同因)
node -e "console.log(require('./js/issues.js').reminders().map(r=>r.kind).join(' '))"
node cli.js issues            # exit 2 + JSON 用法(命令已注册,无服务端也走得到参数校验)
```

`node tests/e2e.js` 按仓库纪律未跑(需用户明确要求)。本槽不含合并、未开 PR、未合入 `master`。

## 9. 残留

1. **W17 第 8 节第 2 条与 W54 第 9 节第 1 条到此关闭**:UMD 化与提醒投影表两件事都落了。
   `w13-integration-log.md` 第 6 节的其余条目不在本槽范围。
2. **`server.js` 无 issues 出口**(§7 末)。浏览器 / CLI / MCP 三端已同读一份,服务端要不要开成
   HTTP 端点属产品口径,未定之前不替产品定。
3. **状态类问题仍写在 `collect` 里**,没有第二张表。它们各自的判定输入、早退语义与处置出口都不同形
   (有的挂 `cmd` 带 `shotIds` 子集、有的早退整集),硬收成表只会得到一张全是例外的表——
   投影表只收"取某面某条校验项的 `hits` → 拼一行文案"这一种形态,收不进来的就如实留在外面。
4. **`master` 上那两项 `cli.smoke` 失败**原样保留,属基线环境态。
