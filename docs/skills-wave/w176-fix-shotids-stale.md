# W176 · 发布门 G4 一键处置真按下去,跑的就是 `counts.stale` 那几镜

**范围**:`js/commands.js`(`episode.generateVideos` 的子集位一处)+ `cli.js`(同一处,headless 那一端)
+ `tests/unit.js`(+4 条:`release` 行为面 2、`commands` 行为面 1、`contract` 取数口 1)
+ `README.md` 与 `docs/skills-wave/README.md` 数字与描述同步。
**基线**:`cursor/w170-integration-98b2`(`c2acb4d`)。
**不做**:不动任何门槛(`counts.stale` 判据、G4 的 0/非 0 分档、`aggErr` 两条降级路径、三门文案一字未改)、
不摘 `Skills.gaps()`、不给别的门加子集位、不重复 W173 那条「回执上印的镜数就是 `Domain.counts` 的和」。

## 1. 停工位不成立:这条现在真的对不上

W173 的交接把这一格记成"`fix.shotIds` 与该集 `counts.stale` 是否一致仍无判据"。
本槽第一件事是在基线 `c2acb4d` 上把它复现一遍——五镜一集(鲜镜 / 过期镜 ×2 / 失败镜 / 未出片镜),
`Domain.episodeState().counts.stale` 数出 2 镜,G4 判 fail 并印「2 镜素材与当前剧本不一致」:

```
counts.stale = 2
g4.fix       = { cmd: 'episode.generateVideos', epid: 'ep1', shotIds: ['sh1','sh4'] }
execFix 之后 引擎收到的镜 = []          ← 一镜也没重跑
命令回执     = { ok: true, result: { total: 0, ok: 0, failed: [], skipped: [] } }
```

**装得对、按下去跑不动**。`fix.shotIds` 那一侧从来就是对的(它和 `counts.stale` 同读
`Domain.shotVideoStale`,同一份判据,连 `online` 都是同一个值);对不上的是命令层:

```js
let pend = (ep.shots || []).filter(s => !s.final && !Store.shotVideoReady(s));
if (Array.isArray(args.shotIds) && args.shotIds.length) { … pend = pend.filter(s => ids.has(s.id)); }
```

**过期镜按定义就是 done 镜**(`shotVideoStale` 第一行:`s.video.status !== 'done'` 直接回 false),
于是它必然满足 `Store.shotVideoReady(s)`,在第一行就被整批滤掉;子集位只是在那批剩下的镜里再筛一遍,
筛的是一个不含任何过期镜的集合,交集恒为空。**子集越准,交集越是准准地等于空。**

而这件事在源码里早就被写成了"设计":`js/pipeline.js` 断点「重生成过期镜」那一步的注释原话是

> 过期 done 镜被所有批量入口(`!shotVideoReady` 过滤)排除,唯一出口=命令层 `shotIds` 子集重生成

——那个"唯一出口"是关着的。断点条上的「🔄 重生成过期镜(N)」、发布门 G4 的「一键处置」、
问题中心过期镜条目下游的同一条命令,三处按下去都是同一个结果:回执 `ok: true`、`total: 0`、
一分钱没扣、一镜没重跑,用户看到的是"处置完成"而门禁下一秒重收仍是 fail。
所以这不是"产品有意挑子集",是那一侧的口子没开;停工位不成立。

## 2. 改的是子集位的一个条件

```js
if (Array.isArray(args.shotIds) && args.shotIds.length) {
  const ids = new Set(args.shotIds);
  pend = (ep.shots || []).filter(s => !s.final && ids.has(s.id)
    && (!Store.shotVideoReady(s) || Domain.shotVideoStale(p, s, online())));
}
```

三个决定各有理由:

- **只在显式子集这一路开口**。没带 `shotIds` 的整集批量仍是原口径(`!shotVideoReady`),
  过期镜照旧不进——那一路是"把没出片的补齐",顺手把已出片的镜重抽一遍是拿用户的钱做没被要求的事。
  显式子集不一样:那是调用方点过名的清单,谁点的名谁负责(G4 一键处置、断点重生成、问题中心)。
- **开口开的是"过期",不是"点了名就跑"**。`ids.has(s.id) && …` 后面那个条件不能省:
  省掉之后,子集里混进一个鲜镜(助手按镜号投的子集、CLI `--args` 手写的 id)就会被原样重抽,
  每镜真扣费。判旧现取 `Domain.shotVideoStale`,与挑子集那一侧同一个函数、同一个 `online` 取法,
  不在这里抄第二份"什么叫过期"。
- **终稿锁不放**。见第 3 节。

`cli.js` 那一端逐字同改(`EXEC['episode.generateVideos']`,判旧走 `Domain.shotVideoStale(p, s, true)`,
与它自己那行 `Domain.shotVideoReady(s, true)` 的在线位一致)。两端不同改的话,
`hujing exec episode.generateVideos --args '{"shotIds":[…]}'` 与 MCP 那条链路照旧空跑,
而浏览器已经好了——同名同参的命令两端结果不一样,正是这个目录一直在收的那种分叉。

`W164` 立下的「空数组即整集」那条纪律原样保留:两端的守卫仍是
`Array.isArray(args.shotIds) && args.shotIds.length`,问题中心空重抽面不出 `shotIds` 那条口径不受影响。

## 3. 有意留着的缺口:终稿锁

「G4 挑出的镜 = `counts.stale` 那几镜」这条等式有**一个**有意的缺口,本槽照原样留着并把它钉成判据:

- `counts.stale` 数终稿镜(`episodeState` 那段不看 `final`),故一个已定稿的过期镜照旧让 G4 判 fail;
- 一键处置**不碰**它(`!s.final` 那个条件本槽一字未动)。终稿是用户按下的锁,重生成会直接覆盖定稿产物;
  单镜入口 `shot.generateVideo` 对 `final` 同样是 `blocked('final', …)`,批量这一侧没有理由更松。

于是那一镜的出路是"先解锁终稿",不是"处置替你解锁"。**回执按真跑的镜数报**——
子集里两镜、终稿占一镜时 `result.total` 是 1,不拿"点了名"冒充"处理过"。
这一格由第 4 节那条用例正面钉住(`counts.stale` 仍是 2、下发引擎的只有 1 镜、定稿镜产物一个字节没动)。

**没有把 `final` 从 `counts.stale` 里摘掉**:那是改门槛(定稿的过期镜确实与当前剧本不一致,
G4 该报),也会连带改动流程条、问题中心、断点条上同读这个数的四处显示。

## 4. 加测与变异

四条新用例,分工不合并:

| 套件 | 用例 | 钉的是 |
|---|---|---|
| `release` | `G4 一键处置:真按下去落到引擎上的镜,就是该集 counts.stale 数的那几镜(一镜不多一镜不少)` | 行为面主线:`counts.stale` → `fix.shotIds` → 引擎实收,三处逐镜相等;鲜镜/失败镜/未出片镜不搭车 |
| `release` | `G4 一键处置:终稿锁是唯一挡在处置外的过期镜(锁着的镜不重跑,回执按真跑的镜数报)` | 第 3 节那个缺口:计数照旧、处置不碰、定稿产物没被覆盖、`total` 按真跑数报 |
| `commands` | `generateVideos:子集位放过期镜过、挡住点名的鲜镜(过期镜是 done 镜,不开这个口它一镜也跑不到)` | 开口的**两个方向**:过期镜进得来、点了名的鲜镜进不来 |
| `contract` | `过期镜的唯一出口:两端 episode.generateVideos 的子集位都放过期镜过(一端改了另一端没改即红)` | 取数口:两端各自的子集过滤段都得现取 `Domain.shotVideoStale`、都得留着 `!s.final` |

行为面的沙箱是新的 `loadReleaseFix()`:在 `loadCommands()`(注册表 + `SBGen` 引擎桩)之上再装
`issues`/`continuity`/`release-core`/`release`——门禁与命令层此前在单测里从不同居一室,
`fix.shotIds` 装了什么与按下去跑了什么因此从来没在同一个沙箱里对过账。
引擎桩记下每次收到的镜头 id,用例数的是**引擎实收**,不是回执里的数字。

**期望镜集先与 Domain 对一次账**:每条用例都先 `assertEq(episodeState().counts.stale, 期望.length)`,
夹具日后被调、或 `counts.stale` 判据变了,先红在这一句上,而不是让下面那几句悄悄变成恒真。

七条变异,每条改完跑全套 `unit`、验完还原;本槽改动落地后这七处一条都不红。

| # | 变异 | 结果 |
|---|---|---|
| 1 | `js/commands.js` 子集位退回本槽之前(过期镜被"未就绪"筛掉) | 红 **4**(三条行为面各报"引擎实收为空" + 取数口) |
| 2 | 子集位去掉 `!s.final`(终稿镜也重跑) | 红 **2**(终稿那条报实收 `sh1,sh4` + 取数口点名终稿) |
| 3 | 子集位不判过期,点了名就放行 | 红 **2**(`commands` 那条报鲜镜 `sh0` 被重抽 + 取数口) |
| 4 | 只改浏览器一端,`cli.js` 退回原样 | 红 **1**(取数口点名 `cli.js`——行为面全绿,单测层跑不动 CLI 引擎) |
| 5 | `js/release.js` 挑子集改成"整集已出片的镜" | 红 **3**(两条行为面报子集多了 `sh0` + `contract` 那条既有用例) |
| 6 | `js/release.js` 子集只带首个过期镜(`.slice(0,1)`) | 红 **2**(两条行为面报子集少了 `sh4`) |
| 7 | `js/domain.js` 的 `counts.stale` 不再数终稿过期镜 | 红 **1**(终稿那条的对账句:期望 2 实际 1) |

第 3 条是本槽第二轮才补上的:第一版只有 `release` 两条行为面时,这个改法**全绿**——
夹具里子集成员恰好全是过期镜,"按 id 全放行"与"判过期再放行"在这份夹具上产出一模一样。
补的那条 `commands` 用例专门摊出"子集里点名了一个鲜镜"这一形状,把开口的另一个方向也钉住。
**归口:开口类的改动要两个方向各有一条用例,只钉"进得来"那一向时,把口开成敞口不会红。**

第 4 条量的是双端分叉:这一端在单测层没有可真跑的引擎(CLI 要起真实服务),
故只有源级那条接得住——它按 `episode.generateVideos` 的实现段切片再判,
不是"某个写法在这个文件里出现过"(W164 那一课:同一写法多处时,那种判据拦不住其中一处被改)。

## 5. 回归数字

| 套件 | 基线 | 本槽 |
|---|---|---|
| `unit` | 542/542 | **546/546** |
| └ `release` 子套件 | 31 | **33** |
| └ `commands` 子套件 | 30 | **31** |
| └ `contract` 子套件 | 121 | **122** |
| `integration` | 141/141 | **141/141**(未动,实跑复核过) |

产品代码两个文件各动一处子集过滤(`js/commands.js` +6 行含注释、`cli.js` +5 行含注释);
`js/release.js`、`js/domain.js`、`js/issues.js`、`js/pipeline.js`、`js/workbench.js` 一字未改——
挑子集那一侧本来就是准的,`pipeline.js` 那句"唯一出口"的注释现在才第一次为真。

治理面零变动:`Skills.gaps()` 键数、注册表条数、短名单、`CHECKS`、`preflightStages()`、
`KB.SECTIONS`、`playbooks()`、领域命令数,一个数没动;门槛面同样零变动(G4 的判据、分档与文案)。

棘轮按 **live** 抬(不抄旧数):`tests/unit.js` 单元 `FLOOR` 542 → **546**、记账件 `FLOOR` 183 → **184**;
`README.md` 的「单元测试(N 项断言」542 → 546、契约段自报条数 121 → 122;
`docs/skills-wave/README.md` 明写份数 183 → **184**(含本份)。

## 6. 交接

1. **别的"一键处置"也该照这个形状复核一遍**。本槽只查了 G4。G6(失败镜)天然安全——失败镜不 ready,
   第一道筛子放它过;G9(主体缺图)走的是另一条命令。真正同形的风险在**任何"挑出一批已出片的镜"的处置**:
   低分镜重抽(`low-review`,W164 起带 `shotIds` 但**有意不挂 `cmd`**)哪天挂上命令,
   它挑的镜同样个个 ready,同样会撞上这道筛子——挂之前先在这条链上跑一遍第 4 节那种"引擎实收"用例。
2. **`loadReleaseFix()` 是个可复用的对账台**。门禁 → `execFix` → 命令层 → 引擎这条链,
   此前单测里没有一处能一次走完。再有"门禁挑出来的东西按下去做没做"这类问题,直接用它。
3. **`counts.stale` 与处置镜集之间那个终稿缺口是有意的,不是待办**。要收它,得先决定
   "定稿的过期镜该不该自动解锁重抽"——那是产品口径,不是顺手放宽 `!s.final`;
   真要改,第 4 节的变异 2 与用例名会先红,那正是让人回来读第 3 节的路标。
4. **两端子集位现在是逐字同形的两份**。它们没有下沉成 UMD 单源(判旧函数已经是单源了,
   剩下的只是三个条件的与);哪天这三个条件再长,考虑把"这一镜该不该进这次批量"整个收进 `Domain`。
