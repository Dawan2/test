# W207 · 成片合成的「空跑」这一格:live 举证后**停工**,不开第三份 note

**范围**:产品代码**零改动**;`tests/unit.js`(+1 条 `contract`)
+ `README.md` 与 `docs/skills-wave/README.md` 数字同步。
**基线**:`cursor/w202-integration-363b`(`0010394`)。
**结论**:交接问的停工位**不成立**——成片合成这一路根本没有「`ok` + 静默」那一档,
基线上三档各有可见理由,故不新开 `Domain` 派生、不动回执分档,只把这三条结论钉成源级判据。
**不做**:不碰 `Domain.emptyBatchNote` / `emptySubjectImageNote` 一个字、不动 `Commands.digest`、
不动 `ok`/`blocked` 分档、不动 G10 门槛、不动 `WfCore.cmdManual` / `agentNormalize`、
不动 `js/plans.js` 的 `execStep` 与 `js/sb-views.js`、不登记 `GUARD_TOPICS`、不拆 `Skills.gaps()` 键。

## 1. 停工位为什么不成立(交接问的第 1 与第 3 题)

交接给的停工条件是「若基线已有可见理由——停」。在基线 `0010394` 上把两端逐档 **live** 跑了一遍:
浏览器那一端加载的是产品代码本身(`js/domain.js` + `js/cmd-registry.js` + `js/commands.js` +
**真 `js/sb-io.js`** 的 `composeVideo`/`doCompose`,只把 `Media.ffCompose` 换成记数桩),
CLI 那一端起真服务(`MOCK_LLM=1` + 真 `ffmpeg`)、子进程直跑 `cli.js`、真扣真退。

### 1.1 档一「无可合成镜」——两端都拦得住,而且说得出话

分两种成因各跑一次:**全无素材**(两镜既无视频也无底图)与**时间线全剔除**
(两镜素材齐备,`tlTrims[id].off` 把它们全摘掉,于是 `Domain.composeSeqOf` 回空)。

```
浏览器 · 全无素材(headless ui:false)
  回执     = { ok:false, status:'failed', error:{ code:'compose', message:'合成失败:无可合成素材' } }
  toast    = ['2 个未生成(含离线模拟)镜头将以分镜图代替(无素材的跳过)',
              '暂无可合成素材,请先生成分镜图/视频素材',
              '合成失败:无可合成素材']            ← 三条,不是零条
  引擎实收 = []   扣 3 退 3   ep.composed 一个字没写
浏览器 · 时间线全剔除
  回执     = { ok:false, status:'failed', error:{ code:'compose', message:'合成失败:没有可合成的素材(分镜图/视频需先生成)' } }
  toast    = 2 条(bgDock 那条另带「积分已自动返还」)   引擎实收 = []   扣 3 退 3
浏览器 · 问题中心「▶ 重新合成」那个出口(ui:true,成片在、素材被删光)
  回执     = { ok:false, status:'failed', … '合成失败:无可合成素材' }   toast = 2 条
CLI · 全无素材
  exit=2   stdout = { ok:false, status:'blocked', error:{ code:'intercepted',
             message:'以下镜头无视频也无底图,无法合成:sh_…_0,sh_…_1(--skip-incomplete 可跳过)' }, cost:0 }
CLI · 时间线全剔除
  exit=2   stdout = { ok:false, status:'blocked', error:{ code:'intercepted',
             message:'无可合成段落(分镜表为空或全部缺素材)' }, cost:0 }
```

四条路一条都不是 `ok`,一条都不静默:浏览器逐条 toast + `digest` 再补一条错误 toast,
CLI 那份 JSON 上写的是理由不是数字(还逐个点名了跑不动的镜)。
**这与镜头/主体那两侧的病根恰好相反**:那两侧的病是「引擎一次都没起来,于是没有引擎提示可依赖,
而 `digest` 对成功档默认静默」;合成这一侧引擎虽然也没起来,但**拦截点自己就在说话**,
且回执压根不是成功档。

### 1.2 档二「已合成且指纹未变」——那不是空跑,是真跑

`episode.compose` 全仓**没有**「产物已是最新就跳过」这一档:`ep.composedInputHash` 只被
`Domain.epComposedReady` 用来判成片旧不旧(供流程条、问题中心 `composed-stale`、
`js/plans.js` 的计划步投影读),合成命令自己一眼都不看它。现跑:

```
CLI · 首次真合成      exit=0  result={ url:'/uploads/gen/proc_….mp4', count:2 }  cost=3
                      写回:composed=true  hash=c:or1b2i
CLI · 指纹未变再点一次 exit=0  result={ url:'/uploads/gen/proc_….mp4', count:2 }  cost=3   ← 新 URL,新扣一次
                      写回:composed=true  hash=c:or1b2i(同一份输入自然是同一个指纹)
钱包流水:两条 `FFmpeg(ff.compose)` 各 -3,100 → 94
浏览器 · 同一档        回执 ok,`Media.ffCompose` 实收 2 段,扣 3 未退,composedUrl 换成新的
```

**引擎实收 2 段、真扣两次费**——用 W197 归口的那把尺子(用引擎实收数而不是回执数字判空跑),
这一档是重新合成,不是空跑。回执 `ok` 与 `count:2` 都是实话,没有什么"话没说出来"。

### 1.3 档三「点名子集过滤后 pend 空」——成片侧没有这一位

镜头侧有 `shotIds`、主体侧有 `subjectIds`,**成片侧一个都没有**:

```
episode.compose        --pid X --epid Y [--ui]
episode.generateVideos --pid X --epid Y [--shotIds V] [--confirmAll] [--noImage] [--ui]
subject.generateImage  --pid X [--subjectIds V] [--ui]
```

(上面三行是 `hujing exec` 用法清单里现取的;`Commands.REG` 那一侧的参数面逐字相同,
两端都由 `js/cmd-registry.js` 一份元数据生出。)

`js/sb-io.js` 的 `doCompose` 里确有一个 `opts.shotsOverride` 口子,但**今天全仓零调用方**:
时间线编辑器在 W8 那轮已经改成「统一走 `Store.composeSeqOf`,这里只做非空校验」,
而它那道非空校验回的是 `U.toast('时间线为空:请至少保留一段', 'error')`——同样是可见理由。

所以这一档在成片侧**根本不存在**;硬要把它造出来,得先给合成加点名子集这一位,
那时该重判的是分档而不是照抄一句 note(见第 4 节)。

### 1.4 一键成片里的合成步

`episode.produce` 的第 4 步就是 `execute('episode.compose', sub)`,没有第二份合成语义。
整集已出片、审片通过时现跑:

```
steps = [ { generateVideos, ok:true, note:'本集没有待生成的镜头,一镜也没跑:2 镜已出片' },  ← W188 那份 note 照播
          { smartReview, ok:true }, { compose, ok:true } ]
`Media.ffCompose` 实收 2 段
```

合成步真跑了。而 `!c.ok` 时 produce 直接把 `c.error` 原样回出去,不吞。这一格也没有静默。

**四格全过,停工条件命中**——第 3 题的答案是「停」。

## 2. 于是本槽不改产品代码

三档里两档是 `blocked`/`failed` 且各带一句点名的理由、一档是真跑,
`result.note` 这个通用位在合成这一路**没有生产者可加**:

- 加在成功档上 = 给「真的合成完了」这一档硬塞一句话,`digest` 会当场多播一条 toast(通用位判据是
  `r.result && r.result.note`,不是 `total === 0`),而那一档引擎自己已经 toast 过「合成完成」了——
  这正是 W188 交接第 3 条要求先排除的"两条撞车"。
- 加在拦截档上 = 同一件事说两遍(`error.message` 已经在说)。

也不许把镜头/主体那两份挪过来:那两份的分堆(终稿锁、判旧、点名到已有产物是跳过还是重跑)
在合成这一侧一格都不成立,套过来只会让回执论起"镜"或"位"来。
**第三份就地拼句更不行**——那是 W197 收掉的病本身。

## 3. 那把这三条结论钉在哪

只加**一条 `contract` 用例**(源级),把 live 举证出来的三条落点各钉一处:

| 钉的位置 | 判据 | 被摘掉时报什么 |
|---|---|---|
| `cli.js` `composeCore` | 缺素材镜逐个点名报出(`无视频也无底图,无法合成`)+ `need(items.length, …)` | CLI 那一端静默回 0 段成功 |
| `js/sb-io.js` `doCompose` | 在线零素材 `U.refund(COST.compose …)` + 如实提示;`if (!items.length) throw` | 浏览器那一端扣了费还静默走完 |
| `js/commands.js` `reg('episode.compose'` | 拿不到任务句柄那一档是 `fail('intercepted'`;段内**不许**出现 `Domain.emptyBatchNote(` / `Domain.emptySubjectImageNote(` | 回执被改成静默 `ok`,或顺手套用隔壁那两份 note |
| `js/cmd-registry.js` 参数面 | `episode.compose` 恒为 `pid,epid,ui`;镜头/主体两侧的点名子集位作对照面 | 给合成加了点名子集却没重判空跑分档 |

三处切片都先自证取得到(取不到即红,不许留成恒真):命令层那段另数了可执行行数,
整段被判成注释时先红在行数那句上。参数面那条**有意连对照面一起钉**——
只钉"合成没有子集位"的话,哪天镜头侧那一位被删掉,本条会误以为自己还在守着什么。

## 4. 变异

五手,每手改完跑 `node tests/unit.js contract`,验完还原(还原后 `git status` 干净)。

| # | 变异 | 结果 |
|---|---|---|
| 1 | `cli.js` 摘掉 `need(items.length, …)`(时间轴空也照发上游) | 红 **1**(`cli.js composeCore 须在时间轴一段都没有时如实拦下`) |
| 2 | `cli.js` 把缺素材点名那句改成 `--skip-incomplete` 恒开(拦截整条去掉) | 红 **1**(`须点名报出无素材的镜`) |
| 3 | `js/sb-io.js` 把在线零素材那道退费拦截整段删掉 | 红 **1**(`在线零素材须退费并如实提示`) |
| 4 | `js/commands.js` 把 `fail('intercepted', …)` 改成 `ok({ total: 0, note: Domain.emptyBatchNote(p, ep, null, online()) })`(即"照抄隔壁那份 note 把它办成静默成功") | 红 **2**(`须如实 failed` + `不许改读镜头/主体那两份 note`) |
| 5 | `js/cmd-registry.js` 给 `episode.compose` 加一位 `shotIds` | 红 **1**(参数面那句,点名"加了点名子集就得同轮重判空跑分档") |

变异 4 正是本槽最该拦住的那一手:它同时踩了"改判静默 `ok`"与"误用镜头那份 note"两条,
两句报错各说各的,单看报错就知道踩的是哪一条。

`js/sb-io.js` 的 `if (!items.length) throw` 那一句没单独列变异手:它与变异 3 同段,
删任一句都落在同一条用例上,分开列只是同一格的两次读数。

## 5. 回归数字(live)

| 套件 | 基线 `0010394` | 本槽 |
|---|---|---|
| `unit` | 607/607 | **608/608** |
| └ `contract` 子套件 | 134 | **135** |
| `integration` | 143/143 | **143/143**(未动,实跑复核过) |
| `cli.smoke` | 107/109 | **107/109**(未动;失败仍是与 `master` 同名的那两条:`未登录 whoami → exit 3`、`llm --json mock 链路`) |

产品代码 **0 加 0 删**:`js/domain.js`、`js/commands.js`、`js/sb-io.js`、`js/plans.js`、`js/issues.js`、
`js/release.js`、`js/cmd-registry.js`、`cli.js`、`mcp.js`、`server.js` 一字未改。
治理面零变动:`Skills.gaps()` 键数、注册表条数、短名单、`CHECKS`、`preflightStages()`、
`GUARD_TOPICS` / `GUARD_TOPICS_CLOSED` / `TOPIC_FLOOR`(仍 19 / 0 / 19),一个数没动;
门槛面同样零变动(G1–G10 判据、`ok`/`blocked` 分档、两份既有 note)。

棘轮按 **live** 抬:`tests/unit.js` 单元 `FLOOR` 607 → **608**、记账件 `FLOOR` 215 → **216**;
`README.md` 的「单元测试(N 项断言」607 → 608、契约段自报条数 134 → 135;
`docs/skills-wave/README.md` 明写份数 215 → **216**(含本份)。

## 6. 交接

1. **`result.note` 至今仍是两个生产者**(`episode.generateVideos`、`subject.generateImage`)。
   本槽核过的第三个候选(`episode.compose`)**如实判定为不需要**——再来第四个候选之前,
   先按这三格量一遍:这一档回执是不是 `ok`、引擎实收是不是真的 0、拦截点自己会不会说话。
   **三格里只要有一格不成立,就不是同一个病**。
2. **哪天给合成加点名子集**(比如"只重合成这几段"),空跑分档得同轮重判而不是照抄:
   合成的成员不是镜头而是**时间轴段**(`Domain.composeSeqOf` 的产出,`tlOrder` 定序、
   `tlTrims` 剔除),"点名的段被剔除了"与"点名的镜不在本集"不是一回事。
   `js/cmd-registry.js` 的参数面那条用例会在那一刻当场红,把这段话叫醒。
3. **`opts.shotsOverride` 是个零调用方的活口子**(`js/sb-io.js` doCompose)。
   本槽**有意没删**:删它要连带确认时间线编辑器与剪辑台没有别的路径想用它,超出本槽射程。
   要清就连同 W8 那轮的收口一起复核。
4. **合成失败时"扣了再退"这一手仍在**(两端都是先 `Tasks.start` + `U.charge`/上游计费,
   零素材或时间轴空再退回去)。回执上看不出来这一趟白扣白退过,钱数最终对得上,
   但用户在积分流水里会看到一进一出。要不要把零素材判定提到扣费之前,属计费口径题,本槽没碰。
5. **成片这一路真正欠的不是回执**,是"已合成且指纹未变时再点一次,该不该真跑一遍"这个产品口径题——
   今天它无条件重跑并真扣费(第 1.2 节的两条流水),而 `js/plans.js` 的计划步投影
   (`st.composedReady ? null : …`)与问题中心 `composed-stale` 都已经知道"没必要重跑"。
   两边口径不一致这件事本槽只记账不动手:改它会动到计费与命令语义,得先定产品口径。
