# W131 · G-03 一面:修订循环的重抽面改由编排层派生(`shotIds` 不再由调用方手填)

**范围**:`js/domain.js`(新增 `reviseTargets`/`reviseShotIds`)+ `js/wf-core.js`(新增 `reviseSubset`)+
`cli.js` 的 `episode.produce` 闭环 + `server.js` 的 `/api/wf/smart-review` 回执 + `js/agent-ops.js`
(状态摘要与审片完成卡)+ `js/issues.js`(`low-review`)+ `js/skills.js` 的 SK-25 记账 +
`tests/unit.js`(domain 2、contract 2、agent-ops 1 共 +5)+ `README.md` 同步。
**基线**:`cursor/w129-integration-1481`(`2f6880c`)。
**不做**:不改达标线 7 与发布门 G3 的可配阈值、不改计费口径(修订步仍是 `llm.optimize`、审片仍逐镜
一笔,本槽零新增计费动作)、不从 `Skills.gaps()` 摘掉 `G-03`(落地一面不摘键)、不动 `maxRetry` 的
取值与收敛语义、不新增领域命令与接口、不改浏览器 `autoSmartReview` 的逐镜重试形态、不给 `low-review`
问题条目挂命令类处置、不合并其它并行槽。

## 1. 上一槽交接的原话,与它到底指什么

SK-25 的 `note` 在基线上写着:

> 仍欠(G-03):审片虽已是主线一等步骤,本条的修订循环仍靠调用方自己看 `lowShots` 决定重抽哪几镜——
> `shotIds` 子集不由编排层推导,复审不达标时的收敛次数也没有登记口径

这句话里其实压着**两件不同的事**,本槽只落前一件,后一件如实留在 `note` 里:

| 面 | 内容 | 本槽 |
|---|---|---|
| 重抽面 | 「该重抽哪几镜」由谁算、算的时候拿什么当输入 | **落地** |
| 收敛面 | 复审不达标时该收敛几轮、`maxRetry` 的取值依据 | 不动,如实留欠 |

先把"调用方自己看 `lowShots`"这句在源码上核实一遍——不是照抄上一槽的判断:

`cli.js` 的 `episode.produce` 闭环原文是 `let low = (rv.result && rv.result.lowShots) || []`,
`low` 取自上一次 HTTP 回执;循环里再把它交给 `reviseLowShots`,拿回一份 `fix.revised` 当作
`episode.generateVideos` 与 `episode.smartReview` 的 `shotIds`;下一轮的 `low` 又从新回执里摘。
也就是说**整个闭环里没有任何一处按"该集现在是什么样"重新算过一次该重抽哪几镜**,
名单是一轮一轮传下去的。

## 2. 传下去的名单会在哪儿漂

判据不是"看着不优雅",是这份名单与该集实况之间有四处对不上,而每一处都能推出一次错误的付费重抽:

1. **镜头被删。** 回执里的 `shotId` 在报告写下时存在,重抽时可能已经不在分镜表里了。
   老路径下 `reviseLowShots` 会为它记一条「镜头不存在」,名单本身照旧带着它进下一轮。
2. **镜头被定稿。** `s.final` 的镜在服务端本来就不进可审镜(`可审镜 = 已出片非终稿`),
   但**合并口径下历史低分条目仍留在 `perShot` 里**,于是回执的 `lowShots` 会点名一个不该动的定稿镜。
3. **镜序变了。** 回执里的 `order` 是**报告写下那一刻**记的位次;调序之后拿它报给用户,
   「低分 3 镜(2 镜 5 分…)」里的镜号就指错了人。
4. **报告本身判旧。** 剧本改过、图谱改过、任一镜重抽过,整集报告就该按发布门 G3 的口径**视为未审**。
   旧分不该再驱动重抽——而一份传下去的名单是不带判旧信息的,它不知道自己已经过期了。

第 4 条是四条里最要紧的:前三条错在"抽错镜",第 4 条错在"照着一份已经不算数的结论继续付费"。

## 3. 落地

### 3.1 判据收在 `Domain.reviseTargets`(`js/domain.js`)

新函数只回答一个问题:**这一集现在还该重抽哪几镜**。

```js
D.reviseTargets = function (ep) {
  if (!ep || !ep.lastReview || D.reviewStaleByScript(ep)) return [];
  const shots = ep.shots || [];
  return (ep.lastReview.perShot || [])
    .filter(x => x && typeof x.score === 'number' && x.score < D.REVIEW_MIN)
    .map(x => ({ x, i: shots.findIndex(s => s.id === x.shotId) }))
    .filter(t => t.i >= 0 && !shots[t.i].final)
    .sort((a, b) => a.i - b.i)
    .map(t => ({ shotId: t.x.shotId, order: t.i + 1, score: t.x.score, reportId: t.x.reportId || '' }));
};
D.reviseShotIds = ep => D.reviseTargets(ep).map(t => t.shotId);
```

五条判据逐条对上第 2 节的四处漂移,且**没有一条是本槽新发明的口径**:

| 判据 | 取自 | 对上 |
|---|---|---|
| `score < D.REVIEW_MIN` | 达标线常量已在 `domain.js` 一处 | 四处 `score < 7` 抄写 |
| `D.reviewStaleByScript(ep)` 回空 | 与发布门 G3「视为未审」、`episodeState.reviewAvg`、问题中心 `review-stale` 同一份判定 | 漂移 4 |
| `findIndex >= 0` | 与当前分镜表取交集 | 漂移 1 |
| `!shots[t.i].final` | 与"可审镜 = 已出片非终稿"同口径 | 漂移 2 |
| `order = i + 1`、按 `i` 排序 | 分镜表实位 | 漂移 3 |

选 `domain.js` 而不是 `wf-core.js` 是因为这三件输入(`REVIEW_MIN`、`reviewStaleByScript`、分镜表)
本来就都在 `domain.js`;放别处等于把领域判定搬出领域层再 `require` 回去。

### 3.2 修正意见留在 `WfCore.reviseSubset`(`js/wf-core.js`)

修订步要的不只是镜集,还要每镜那句"按什么改"。抽取函数 `W.reviewFixes` 早已在 `wf-core.js`,
而 `domain.js` 不认识它(也不该认识:那是提示词侧的规整)。故分两层:

```js
W.reviseSubset = function (ep) {
  const shots = (ep && ep.shots) || [];
  return Domain.reviseTargets(ep).map(t => {
    const s = shots.find(x => x.id === t.shotId);
    const rep = t.reportId && s ? ((s.reviews || []).find(r => r.id === t.reportId)) : null;
    return { shotId: t.shotId, order: t.order, score: t.score, fixes: W.reviewFixes(rep) };
  });
};
```

镜集**原样取 Domain 那一份**,本层只多挂一列 `fixes`。取法是按 `reportId` 回取该镜那份报告
(`s.reviews` 只留最近 5 条,被挤出时 `reviewFixes(null)` 回空串)——这与 `agent-ops.js`
早就在用的"按 `reportId` 精确取回报告"是同一手,不是新发明。

**顺带修掉一处口径不齐**:老回执里 `fixes` 只对"本轮新评过的镜"给,历史低分镜给的是 `undefined`;
`reviseLowShots` 里 `if (x.fixes)` 为假就直接沿用原提示词重抽。改后凡报告还在 `s.reviews` 里的都给得出
修正意见,拿不到的一律是空串(不是 `undefined` 冒充"没有意见")。

### 3.3 四处消费点改读同一份

| 处 | 原来 | 现在 |
|---|---|---|
| `server.js` `/api/wf/smart-review` | `perShot.filter(x => x.score < 7).map(…)` | `lowShots: WfCore.reviseSubset(ep)` |
| `cli.js` `episode.produce` | 摘上一步回执的 `lowShots`,再把 `fix.revised` 传下去 | 每轮 `await reviseTargets(args, f)` 现取实况派生 |
| `js/agent-ops.js` `stateDigest` / 审片完成卡 | 各自 `perShot.filter(x => x.score < 7)` | `Domain.reviseTargets(ep)` |
| `js/issues.js` `low-review` | `perShot.filter(x => x.score < 7)` | `Domain.reviseTargets(ep)`,均分比对改 `Domain.REVIEW_MIN` |

CLI 侧的形态:

```js
let rv = await call('smartReview', 'episode.smartReview');
const maxRetry = Math.max(1, Math.min(5, +args.maxRetry || 2));
let low = (rv.result && rv.result.reviewed) ? await reviseTargets(args, f) : [];
for (let attempt = 1; attempt <= maxRetry && low.length; attempt++) {
  …
  low = await reviseTargets(args, f); // 下一轮同样现取实况派生
}
```

`reviseTargets(args, f)` 是本槽新加的三行 CLI 辅助:取一次最新 `state` → 找到该集 →
交 `WfCore.reviseSubset`。多出来的是每轮一次本机 `GET /api/state`(闭环本身每轮要跑 N 次 LLM 与
若干次视频生成,这一次读态在量级之外),换回的是"名单永远是当下这一刻算的"。

**有意保留的两处**,免得看着像漏改:

- `shotIds: fix.revised` 没有改成再派生一次。`fix.revised` 是**修订步的回执**(哪几镜真的改了提示词
  并清空了视频态),它是 `low` 的子集而 `low` 已是派生出来的;真要漏掉谁,`episode.generateVideos`
  内部按 `!final && !shotVideoReady` 过滤本来就会把没清空视频态的镜跳过,再派生一次拿到的是同一批。
- `let low = (rv.result && rv.result.reviewed) ? … : []` 这个三目不是多余的。本轮审片一个结论都没出
  (端点失败/网络断)时若照旧派生,拿到的会是**上一份报告**的重抽面,闭环就会照着它继续修订重抽,
  最后报的是"修订重抽后仍不达标"而不是"审片未产出结论"。派生的前提是本轮真审过,
  否则名单留空、交给下面的 `review-unavailable` 分支如实报"质量闸门未执行"。

### 3.4 顺手修掉的一句谎

`agent-ops.js` 的 `stateBlock` 原来是:

```js
`审片:均分${d.reviewAvg}${d.reviewStale ? '(旧版)' : ''}` + (d.lowShots.length ? `;低分镜:…` : ';全部达标')
```

判旧的报告现在不出低分镜面(3.1 判据二),那这个三目就会走进 `;全部达标` 分支——
一份已经不算数的报告没资格替这一集背书"全部达标"。改成判旧时只报均分与旧版标记,不下达标结论。
这不是本槽顺路加的新语义:`Domain.episodeState` 早就在判旧时把 `reviewAvg` 置 `null`
(旧分不卡 `needs_human`),问题中心也早就把 `review-stale` 与 `low-review` 做成互斥三态,
只有助手摘要这一处此前是拿旧分说话的。

## 4. 记账:`G-03` **不摘键**

`Skills.gaps()['G-03']` 仍是 `['review.stage', 'review.reviseLoop']` 两条,`gaps()` 仍是 20 键。
目录口径是"落地一面不摘键",且这里也确实没落完——SK-25 的 `note` 改成分面写:

- **已落地**:重抽面收进 `Domain.reviseTargets` 双端单源,`WfCore.reviseSubset` 在其上补修正意见;
  CLI 闭环每轮现取实况派生 `shotIds`;服务端回执、助手摘要与完成卡、问题中心同读这一份。
- **仍欠**:① 复审不达标时的**收敛次数**仍无登记口径(`maxRetry` 两端各按自己的缺省值跑,
  "收敛到第几轮算够"没有判据);② 浏览器闭环 `autoSmartReview` 是**逐镜重试**而不是整集子集重抽,
  与 CLI 的分轮口径尚未合成一份。

第 ② 条是本槽核实时才量清楚的,基线的 `note` 没写:两端都叫"审→改→重抽→复审",
但浏览器是对每一镜连着重试 `maxRetry` 次(镜内循环),CLI 是整集低分子集重抽 `maxRetry` 轮(集外循环)。
两者的重抽面因此**结构上就不是同一个东西**,本槽的派生只接得住 CLI 那一侧;
硬把浏览器那侧也改成子集轮次会动到 `autoSmartReview` 的进度面板语义与逐镜计费节奏,不属本槽范围,
故如实记欠而不是悄悄留白。

`SK-23`(`review.stage`)那条 `note` 一个字未动:它记的是"审片升为一等步骤"那一面,与本槽无关。

## 5. 断言与变异验证

新增 5 条(`domain` 2、`contract` 2、`agent-ops` 1),既有用例一条未删。

| # | 套件 · 用例 | 钉的是 |
|---|---|---|
| 1 | `domain · reviseTargets:重抽面 = 报告低分镜 ∩ 分镜表在列未定稿镜,order 与排序取分镜表实位` | 三处交集判据 + 实位 |
| 2 | `domain · reviseTargets:报告判旧一律回空(旧分不驱动重抽,与发布门 G3「视为未审」同口径)` | 判旧回空(快照维度与 `contentRev` 维度各一次) |
| 3 | `contract · 修订闭环重抽面:WfCore.reviseSubset 镜集恒等 Domain.reviseTargets,fixes 按 reportId 回取报告原文` | 两层之间不许出现第二份筛法 |
| 4 | `contract · 修订闭环重抽面单源:server/CLI/助手摘要/问题中心都不自筛低分镜,CLI 不摘回执 lowShots 当 shotIds` | 五个文件零 `score < 7`;CLI 不摘回执 |
| 5 | `agent-ops · stateDigest/stateBlock:低分镜面取 Domain.reviseTargets;判旧报告不出低分镜也不冒充"全部达标"` | 助手摘要的行为面 |

变异实测(每条改完跑全套,验完还原):

| 变异 | 结果 |
|---|---|
| `reviseTargets` 去掉 `reviewStaleByScript` 那半个条件 | 红 2(用例 2 与 5,各报自己那句) |
| `reviseTargets` 去掉 `!shots[t.i].final` | 红 2(用例 1 报 `sh1,sh3,sh0`,用例 5 报 `1,3`) |
| `reviseTargets` 的 `order` 改回报告里记的旧位 | 红 1(用例 1:期望 `1,3` 实际 `2,1`) |
| `cli.js` 退回 `low = rv.result.lowShots` | 红 1(用例 4) |
| `server.js` 退回 `perShot.filter(x => x.score < 7)` | 红 1(用例 4) |
| `js/agent-ops.js` 退回自筛一遍 | 红 2(用例 4 的源级那句 + 用例 5 的行为那句) |
| `WfCore.reviseSubset` 自己照 `perShot` 筛一遍 | 红 2(用例 3 与 4) |

**最后一条变异第一版没红,值得单独记一句。** 用例 3 一开始的夹具是"三镜、都在、都没定稿、镜序与报告一致",
在这种夹具上"照 `perShot` 筛 `score < 7`"与真派生**逐字相同**——恒等断言写了等于没写。
这不是断言写错,是**夹具选错**:比对两份实现是否同一份,夹具必须落在两者会分道扬镳的地方。
改成"分镜表已调序 + 一镜定稿 + 一镜已删"的夹具后当场红,并另加一条源级断言
(`wf-core.js` 里必须出现 `return Domain.reviseTargets(ep).map(`)接住"两份实现在这个夹具上又恰好同值"那一路。

## 6. 回归数字

| 套件 | 基线 | 本槽 |
|---|---|---|
| `unit` | 486/486 | **491/491** |
| └ `contract` 子套件 | 104 | **106** |
| `integration` | 130/130 | 130/130(未动) |
| `cli.smoke` | 100/102 | 100/102(2 项与 `master` 同名同表现,未动) |

治理面零变动:`gaps()` 20 键(`G-03` 仍在,值仍是两条)、`playbooks()` 5 条、
`preflightStages()` 七面、注册表提示词 41 条——本槽一个都没动。

棘轮按 **live** 抬(不抄旧数):`tests/unit.js` 里单元测试 `FLOOR` 486 → **491**,
记账件 `FLOOR` 144 → **145**;`README.md` 的「单元测试(N 项断言」486 → 491、
契约段自报条数 104 → 106;`docs/skills-wave/README.md` 明写份数 144 → **145**(含本份)。

## 7. 交接

1. **`G-03` 还剩两面**,都写在 SK-25 的 `note` 里:收敛次数无登记口径、两端闭环形态不同构
   (浏览器逐镜重试 vs CLI 整集子集分轮)。后者要动,得先决定浏览器那侧的进度面板与逐镜计费节奏
   能不能接受改成分轮——这是产品口径不是实现细节,不要顺手改。
2. **`Domain.reviseTargets` 现在有四个消费点**,再加消费点时别在调用侧补条件(比如"顺便也排掉生成中的镜"):
   补进 `reviseTargets` 里、并在用例 1 的夹具上加一列,否则第五处又成了新的第二份。
3. **`shotIds: fix.revised` 是有意保留的**(3.3 末),别当成漏改改掉——它是修订步的回执不是判据,
   改成再派生一次拿到的是同一批,只多一次读态。
4. **用例 3 那条恒等断言的夹具是有讲究的**(5 节末):往里加镜时保住"调序 + 定稿 + 已删"这三样,
   夹具一"干净"这条断言就退化成永真。
5. `js/review.js`、`js/sb-views.js`、`js/batchops.js` 里还有几处 `score < 7`,那些判的是
   **单份报告**的高低(重抽入口是否可用、状态条颜色、报告页计数),不是"整集该重抽哪几镜",
   与本槽不是同一件事,本槽有意没碰;真要收它们得先立"单镜达标线"这个概念,别顺手并进来。
