# W265 批量审片汇总面按行对位:行键换行号,打开的是本批那一份报告

基线:`origin/cursor/w264-integration-b862` **现取** tip `3db56aa`(先 `fetch` 再 `rev-parse`,不抄交接自称;
本槽交接自称与现取恰好相同)。分支 `cursor/w265-review-summary-row-4a77`,建支后 `rev-parse HEAD` 与 w264 尖逐字节相同。

**结论先写:W263/W264 连着记的那条残留只剩一格——`js/batchops.js` 的多镜审片汇总面。
它比 W263 收的那处多一档:行键存 `shotId`(点哪一镜都跳首行)**且**打开的是那一行 `reviews` 的最近一条,
而不是本批刚跑出来的那一份。本槽把这一格收到与整集报告视图同一套取法上(行号即行键,报告直接取清单里那一份)。**

W263 §六 1 的原话:

> `js/batchops.js` 的 `openReviewSummary`——它比本槽收的那处还多一档:行键是 `shotId`(同 id 多行点哪一镜都跳首行)
> **且**打开的是 `s.reviews[0]`(该行最近一条),而不是本批刚跑出来的那一份。改法与本槽 2.3 第二点同形
> (`reports` 就在闭包里,行号当行键即可),三行的事,留给下一槽。

## 一、这一格具体吞掉什么

改前现取(`js/batchops.js:452` / `:463` / `:465`):

```
<div class="rv-bar-row" data-jump="${x.shot.id}">
const s = ep.shots.find(x => x.id === row.dataset.jump);
Review.openReport(p, ep, s, main, s.reviews[0]);
```

`reports` 是本批跑完攒起来的 `{ shot, report }` 清单,行与报告在闭包里**已经对好了**;
这两句是在对好的清单之外又寻址了两次,各错一样东西:

| 取数 | 同 id 多行时 | 该行事后被单独重审时 |
|---|---|---|
| 行键 `x.shot.id` + `ep.shots.find` | 后几行的入口一律跳**首行那一镜**(汇总面上明明列着三行各自的分) | — |
| 报告 `s.reviews[0]` | 连报告也一并读成首行那份 | 读到的是**那一行最近一条**(汇总面开着时单独重审过该镜,新结论就混进这份汇总) |

两错叠在一起的形状是:汇总面列出三行 6.6 / 7.4 / 8.2,点第三行开出来的是第一行那份 6.6,
而第一行那份若在此期间被重审过,连 6.6 都不是——开出来的是重审后的新分,页头却仍写着「一键审片汇总(3 镜)」。

`s.reviews[0]` 这一档整集报告视图早在八轮就收掉了(注释原话:「不再读 `s.reviews[0]`——
镜头重新审片后旧整集报告会混入新单镜报告」),汇总面漏在外面。

## 二、改了什么(`js/batchops.js` +8 −4,只动 `openReviewSummary` 一处)

```
${reports.map((x, i) => `
<div class="rv-bar-row" data-jump="${i}">
...
const x = reports[+row.dataset.jump];
if (!x || !x.report) return;
close();
Review.openReport(p, ep, x.shot, main, x.report);
```

与 W263 在 `openEpisodeReport` 上的收法**逐字同形**:行号即那份清单的下标,哪一行、哪一份报告在渲染时就取好了。

三点交代:

- **不调 `Domain.rowIndexOf` / `Domain.reviewRows`,也没在这里抄第二份对位**——本处压根不需要"算行":
  清单本身就是行序,再算一次就是 W263 收掉的那个第二次寻址。两个下沉函数是给"手上只有 `perShot` 条目
  或只有一个行对象"的调用方用的,汇总面两样都不缺。
- `if (!x || !x.report) return;` 是取数口失效时的兜底(行键与清单错位时不去读 `undefined.shot`),
  不冒充成功也不弹错——本处的 `reports` 每一条都带 `report`(上游 `reviewConfirm` 按 `if (r) reports.push(...)` 攒的),
  这一句在实况里跑不到,只是不让渲染与 handler 之间的口径漂移炸成 `TypeError`。
- 镜号仍取 `x.shot.order + 1`(不是实位):它不属"按 id 取首行"那一族,与整集报告视图同源,本槽不顺手改。

### 有意没碰的

合入侧一个字未动(`mergeReviewPerShot` / `landed` / `state-put` / `gaps()` / SK-04 一律未触);
浏览器闭环 `common` / `cut` 空壳 vs 服务端沿用属产品口径,按明令不碰;同 id 多行的源头与 `shots-dedupe` 未碰;
计费一处未触(汇总面零 LLM 零上游,本槽不经 `Tasks.run`)。

## 三、判据(加测 2 条)

| 套件 | 钉的是 |
|---|---|
| `skills` 新增一条 | **行为面**:三行(`dup` / `solo` / `dup`)真跑一遍「选择模式 → 确认 → 批量审片 → 汇总面 → 点第三行」——渲染出来的行键逐个等于 `0,1,2`;点第三行时 `Review.openReport` 收到的**行对象**恒等于 `ep.shots[2]`(按 id find 时是首行),收到的**报告对象**恒等于本批第三行那一份(此前刻意往第三行 `reviews` 头上塞了一条 9.9 分的"事后单独重审",取最近一条就会拿到它);报告页镜号报 `#1-3` |
| `contract` 新增一条 | **源级**:`openReviewSummary` 段内行键是 `${i}`、不是 `x.shot.id`,段内不出现 `ep.shots.find(`,开报告那句是 `Review.openReport(p, ep, x.shot, main, x.report)`;`js/batchops.js` 全文零 `reviews[0]`、零 `.find(x => x.id ===` / `.findIndex(x => x.id ===` |

行为面那条真跑的是**未导出的** `openReviewSummary`(模块出口只有 `enter`/`toggle`/`confirm` 那几个),
故经 `BatchOps.enter` → `toggle` → `confirm` 逐层驱动到它,弹窗桩从渲染出来的 `body` 里正则取 `data-jump` 的值当行键——
**行键是从真实渲染产物上读的,不是测试自己假设的**,这正是这条判据能咬住行键那一半的原因。
夹具两处要点记在这里:`toggle` 是按 **id** 记选择态的开关(同一 id 点两次等于取消,故按去重后的 id 列表点),
公共桩的 `Store.uid` 恒回同一个值(报告 id 全一样就分不出彼此,故本用例换成自增)。

## 四、变异三手(逐手在已提交的树上做、跑完还原)

| 手 | 改法 | 红几条 | 报的是 |
|---|---|---|---|
| M0 | 整段退回改前那三行(`git show` 基线版本原样覆盖) | 2 | `skills` 报「行键应是清单行号:期望 `0,1,2`,实际 `dup,solo,dup`」;`contract` 报「行键应是清单行号」 |
| M1 | 只把报告那一半退回该行最近一条(行键仍是行号) | 2 | `skills` 报「开的应是本批第三行那一份报告(取 `s.reviews[0]` 时是后来那条 9.9 分的)」;`contract` 报「开的应是清单里对好的那一行与那一份报告」 |
| M2 | 只把行对象那一半退回按 id 现找(报告仍取本批那一份) | 2 | `skills` 报「点第三行开的应是第三行那一镜(按 id find 时跳的是首行)」;`contract` 报「汇总面不许再按 shotId find 取行」 |

M1 / M2 各只退一半,两手报的句子不同——这两条判据**分别咬住行与报告**,不是靠同一句话同时兜住两件事。

## 五、数字(全部 live 现取,不抄交接)

- `node tests/unit.js` **682/682**(基线现跑 680,加 2 条);
- `node tests/unit.js contract` **148/148**(基线现跑 147);
- `node tests/integration.js` **152/152**(未加测,服务端一个字没动,全绿本身是"没搬坏"的判据);
- `node tests/cli.smoke.js` 单独整跑、`env -u HUJING_SERVER -u MV_TOKEN -u MV_BASE -u MV_MODEL`:**115/117**,
  两条失败(`未登录 whoami → exit 3`、`llm --json mock 链路`)与 `master` 同名同表现;
- 不跑 `tests/e2e.js`(按明令)。

棘轮:`['单元测试', 680, …]` → **682**、`const FLOOR = 279;` → **280**(本文一份);
`['集成测试', 152, …]`、`['CLI 冒烟', 117, …]`、`TOPIC_FLOOR`(19)、`SLACK`(3)未动,五格差额全为 0。
`gaps()` 20 键一个没剥,`GUARD_TOPICS` 19 / `CLOSED` 0 / `TOPIC_FLOOR` 19 / 花名册 19 四者仍对齐
(本槽没登记新主题——加护栏不必都登记,登记过的一条没动)。

文档:根 `README.md` 单元用例数 680→682、`contract` 自报条数 147→148、
「审片报告绑定视频版本」那段补一句汇总面的行对位口径;`docs/skills-wave/README.md` 明写份数 279→280,索引补本文一行。
`node --check` 过:`js/batchops.js`、`tests/unit.js`。

## 六、残留(按明令一条没代修,原话保留)

1. **浏览器闭环 `common` / `cut` 空壳 vs 服务端沿用**(W261 §六 2、W263 §六 2 记的):写回的一直是空壳,
   不是被子集跑弄丢的;要收得先定「浏览器闭环该不该沿用上一轮的集级结论」,属产品口径不属寻址。

2. **`js/review.js` 的 `openEpisodeReview` 没进本槽**(W261 §六 3、W262 §七、W263 §六 3 记的):
   它是整表那一档,合并对它是恒等;改成走 `WfCore.mergeReviewPerShot` 传 `prev = null` 属纯形状统一,
   没有行为差。

3. **同 id 多行的源头照旧没追**(W226、W242、W246、W248、W253、W258、W261、W262、W263 在册):
   本槽同样只收消费面;`shots-dedupe` 一个字没碰,它明写的「引用面按 find 首行语义解析、首行留原 id」
   这条前提**在本槽之后仍成立**——汇总面改的是"清单内部怎么对位",不改任何按 id 的库形态解析。

4. **`x.shot.order + 1` 这个镜号取的仍是 `order` 字段而不是实位**(W263 §2.4 记的同一条):
   两处展示面同源,要改得两处一起改,不在本槽范围。

## 七、交接

我方尖:见本支 `git rev-parse HEAD`(现取,不在此写死自称)。基线 `3db56aa`。
动过的文件:`js/batchops.js`、`tests/unit.js`、`README.md`、`docs/skills-wave/README.md` 与本文。
`js/` 下 `batchops.js` 之外逐字节未动。
