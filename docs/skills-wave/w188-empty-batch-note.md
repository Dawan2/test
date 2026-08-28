# W188 · 批量生成「一镜也没跑」时回执如实说清原因

**范围**:`js/domain.js`(新增 `emptyBatchNote` 一个派生)+ `js/commands.js`(空跑早退 + `digest` 各一处)
+ `cli.js`(空跑早退一处)+ `tests/unit.js`(+5 条:`domain` 1、`commands` 2、`release` 1、`contract` 1)
+ `tests/cli.smoke.js`(+1 条)+ `README.md` 与 `docs/skills-wave/README.md` 数字与描述同步。
**基线**:`cursor/w182-integration-646e`(`5f98d0b`)。
**不做**:不动 `ok` / `blocked` 分档(第 3 节有实测理由)、不动 G4 的门槛与 `fix.shotIds` 成员、
不动 `counts.stale`、不改 `js/pipeline.js` 的按钮文案、不登记护栏主题、不拆 `Skills.gaps()` 键。

## 1. 停工位成立:基线上点完处置什么回音都没有

交接给的停工条件是「若基线已有可见回执说明 0 镜——停工位不成立」。在基线 `5f98d0b` 上把四档都跑了一遍
(沙箱 `loadReleaseFix()`,门禁 → `Release.execFix` → 命令层 → `Commands.digest` 整条链真跑):

```
【1】发布门 G4 全定稿过期镜(三镜:鲜镜 + 两镜定稿过期)
  G4.status    = fail
  G4.info      = 2 镜素材与当前剧本不一致(全部已定稿,批量重生成不覆盖定稿产物,一镜也重跑不到,需先解锁终稿)
  G4.fix       = { cmd:'episode.generateVideos', epid:'ep1', shotIds:['sh1','sh2'],
                   rerunShotIds:[], lockedShotIds:['sh1','sh2'] }
  引擎实收镜   = []
  命令回执     = { ok:true, status:'done', result:{ total:0, ok:0, failed:[], skipped:[] } }
  digest 之后的 toast = []            ← 一条都没有
  处置后门禁重收 = fail

【2】显式 shotIds 过滤后 pend 空(点名的两镜都是鲜镜)
  回执 = { ok:true, status:'done', result:{ total:0, … } }   toast = []

【3】整集批量、全集已出片(不带 shotIds)
  回执 = { ok:true, status:'done', result:{ total:0, … } }   toast = []

【4】headless(Agent / 跑批 / CLI)同一档
  回执 = { ok:true, status:'done', result:{ total:0, … } }   CLI 那端 stderr 也是空的
  (`log('批量生成:N 镜待处理…')` 只在 `todo.length > 0` 时才打)
```

三档的回执**逐字节相同**,与「真跑完两镜」那档的区别只有 `result.total` 一个数字;
`Commands.digest` 对 `r.ok` 默认静默(引擎自己会 toast),而这一档**引擎一次都没起来**,
于是没有任何一端说过话。CLI 那端 `out(r, f)` 把 `total:0` 印进 JSON 里,
但那是个数字不是理由——它分不出"本来就没有待跑镜"和"点名的镜全被终稿锁挡着"。

**停工位成立**。W186 交接第三条说的就是这件事,本槽只收回执这一面。

## 2. 改了什么

### 2.1 那句话收在 `Domain`(`js/domain.js`)

```js
D.emptyBatchNote = function (p, ep, picked, online) {
  const shots = (ep && ep.shots) || [];
  if (!shots.length) return '本集还没有分镜,一镜也没跑';
  const parts = [];
  const say = (n, t) => { if (n) parts.push(n + ' 镜' + t); };
  if (picked && picked.length) {
    const ids = [...new Set(picked)];
    const hit = shots.filter(s => ids.includes(s.id));
    const locked = hit.filter(s => s.final).length;
    const fresh = hit.filter(s => !s.final && D.shotVideoReady(s, online) && !D.shotVideoStale(p, s, online)).length;
    const gone = ids.length - hit.length;
    say(locked, '已定稿(批量重生成不覆盖定稿产物,需先解锁终稿)');
    say(fresh, '产物已是最新');
    say(gone, '不在本集');
    say(ids.length - locked - fresh - gone, '没能说清原因');
    return '点名的 ' + ids.length + ' 镜一镜也没跑:' + parts.join('、');
  }
  const locked = shots.filter(s => s.final).length;
  const done = shots.filter(s => !s.final && D.shotVideoReady(s, online)).length;
  say(done, '已出片'); say(locked, '已定稿');
  say(shots.length - locked - done, '没能说清原因');
  return '本集没有待生成的镜头,一镜也没跑:' + parts.join('、');
};
```

三件事各有理由:

- **分档逐条对着两端待跑镜的筛法来**。点名这一路不跑 = 不在本集 / 已定稿(`!s.final` 锁)/
  已出片且不过期(`!ready || stale` 的反面);整集这一路不跑 = 已定稿 / 已出片(`!s.final && !ready` 的反面)。
  判就绪判旧一律现取 `D.shotVideoReady` / `D.shotVideoStale`,与挑子集那一侧同一份判据,不写第三份。
- **各堆之和恒等于点名数**。最后那句「N 镜没能说清原因」是安全阀:真实调用点(空跑早退)上它恒为 0,
  但只要哪天有镜既不在三堆里、又确实没跑,它会当场露头而不是被抹平成一句半真半假的话。
  它的措辞有意不写成「不在待跑清单内」——那句在"这镜本该跑却没跑"时是假话。
- **句子只此一份**。它是回执文案不是判据,但两端各拼一版的结果是同一件事在浏览器 toast 与
  `hujing exec` 的 JSON 上读到两种说法(W177 收 `staleSplitNote` 时立的同一条规矩)。

### 2.2 两端空跑早退各接一行

`js/commands.js`:

```js
if (!pend.length) {
  const r = ok({ total: 0, ok: 0, failed: [], skipped: [], note: Domain.emptyBatchNote(p, ep, args.shotIds, online()) });
  r.next = nextOf(p, ep);
  return r;
}
```

`cli.js` 同一位置同一份派生,另加一行 `log(note)`——CLI 面向人的通道是 stderr,
`out(r, f)` 那份 JSON 是给编排层读的,`note` 两边都到。
CLI 的 `unconfirmed` 那一档(pend 非空、全未确认)照旧 `blocked`,一个字没动。

### 2.3 `digest` 对成功档破一次例(`js/commands.js`)

```js
if (r.ok) {
  const note = r.result && r.result.note;
  if (note) U.toast(note, 'info', 4200);
  else if (opts.okToast) U.toast(…, 'success');
  return r;
}
```

"成功默认静默"这条规矩的前提是**引擎自己已经播报过**。空跑这一档引擎一次都没起来,前提不成立,
故 `result.note` 被定义成「本次执行有话要说」的通用位:有它就播,没有它照旧静默。
判据不写成 `result.total === 0`——那会把这条规矩绑死在批量生成一个命令上。
今天全仓只有 `episode.generateVideos` 会带 `note`,`js/plans.js` 的 `st.note` 是计划步自己的字段,与此无关。

## 3. 为什么不把这一档改判 `blocked`

交接说「若必须动命令层 `ok` vs `blocked`,先用探针证明 G4 execFix 与 CLI 确认闸的后果」。探针结论:

- **`Release.execFix` 自己不看 `r.ok`**——它只 `.then(Commands.digest).then(r => onDone(r))`,
  `onDone` 在两个调用方(发布门弹窗 / 制作台)里都是"重收门禁 + 重绘"。改判 `blocked` 对它无害,
  digest 反而会播报(基线上直接喂一条 `blocked` 给 digest,toast 恰 1 条)。
- **真受伤的是另外两处**。源级扫消费方对 `r.ok` 的分支:`js/plans.js` 按 `r.ok` 给计划步归档
  (非 `ok` 且不在取消白名单里 → `st.status = 'failed'`),`js/commands.js` 的 `episode.produce`
  把每一步的 `r.ok` 原样记进 `steps`。于是"整集已出片再点一次一键成片(正常的重新合成)"
  会变成:计划里的「批量生成视频」记成失败步、`produce` 的 `steps` 里多一条假拦截。
  这两处都不是回执措辞问题,是把"没什么可做"说成了"做不了"。
- **CLI 那一侧还多一层**:`exec` 的退出码按 `r.ok ? 0 : blocked ? 2 : 5` 出,改判会让
  `hujing exec episode.generateVideos` 在一集已全部出片时回 exit 2,编排脚本据此中断。

故本槽**只改回执诚实这一面,`ok`/`status` 一个字没动**,并把这个结论正面钉进用例
(`commands` 两条各断言 `r.ok === true`、`produce` 仍一路走到合成;第 5 节变异 6 反向钉住)。

## 4. 加测

六条新用例,分工不合并:

| 套件 | 用例 | 钉的是 |
|---|---|---|
| `domain` | `emptyBatchNote:一镜也没跑时逐堆说清为什么(判就绪判旧仍只此一份;各堆之和 = 点名数)` | 派生本身:十镜点名(2 定稿 / 1 鲜镜 / 4 不在本集 / 3 该跑没跑)+ 整集那一路(2 已出片 / 3 已定稿 / 1 离线模拟产物在线不算出片),各堆之和逐路对账 |
| `commands` | `generateVideos:一镜也没跑时回执自带实话(仍是 ok,digest 照播;真跑到镜时不带这句也不播)` | 点名档两向(全定稿 / 全鲜镜)+ digest 播的就是回执原句 + **反面**:真跑到镜时无 `note`、toast 为 0 |
| `commands` | `generateVideos:整集全出片时"没得跑"不是拦截——produce 照旧走到合成,那一步登记 ok 并附实话` | 第 3 节那个结论的行为面:`produce` 的 `generateVideos` 步 `ok:true`、合成照做、整集那一路的措辞与点名那一路分得开 |
| `release` | `G4 一键处置:一镜也没跑时按钮按下去有回音(门上说得清 ≠ 按下去读得到)` | 停工位本体:门禁 → `execFix` → 命令层 → digest 整条链,数的是**引擎实收 0 镜**与**用户实读恰 1 条**;对照面(有跑得到的镜)toast 为 0 |
| `contract` | `一镜也没跑那句实话双端单源:两端空跑早退都现取 Domain.emptyBatchNote,digest 照读回执上那一句` | 源级:两段实现各切片后须现取该派生、**可执行行**里不许出现那句话的字面(整行注释豁免,故第 2 节的注释原样留着);另钉 `digest` 真读 `r.result.note` |
| `cli.smoke` | `exec generateVideos 一镜也没跑 → ok+回执说清原因(note 与前端 digest 同一份)` | CLI 那一端 **live**:点名一个本集没有的镜号,真服务端上回 `exit 0` + `result.note = '点名的 1 镜一镜也没跑:1 镜不在本集'` |

**夹具先自证有辨识力**:`domain` 那条的四堆数取 2 / 1 / 4 / 3 两两不等(用例里有一句
`assertEq(new Set([2,1,4,3]).size, 4)` 明写这件事),分堆串位才红得出来;
`release` 那条的期望值取自 `g.staleSplit.locked` 而不是字面,夹具日后被调先红在对账那句上。

**「该跑没跑」那三镜是判据的落点**:`domain` 夹具里点名了两镜过期(一镜指纹对不上、一镜引用素材换过版)
加一镜没出片——就地另写一份判旧(只看 `video.status === 'done'`)会把前两镜算成「产物已是最新」,
干脆拿 `!s.final` 当鲜镜会把三镜全算进去。这是 W177 那条归口的直接应用:
**钉取数口时夹具必须让第二份等价写法有地方出错**。

## 5. 变异

十条,每条改完跑全套 `unit`、验完还原;本槽改动落地后这十处一条都不红。

| # | 变异 | 结果 |
|---|---|---|
| 1 | 命令层空跑早退退回原样(不带 `note`) | 红 **4**(`commands` 两条 + `release` 那条 + 取数口) |
| 2 | `digest` 不读 `note`(成功档一律静默) | 红 **3**(`commands` 一条 + `release` 那条 + 取数口的 digest 那句) |
| 3 | 只改浏览器一端,`cli.js` 退回不带 `note` | 红 **1**(取数口点名 `cli.js`——行为面在单测层够不着 CLI 引擎) |
| 4 | `note` 写成恒有(真跑到镜时也附一句) | 红 **2**(`commands` 的反面那句 + `release` 的对照面) |
| 5 | `emptyBatchNote` 就地另写判旧(`video.status === 'done'` 即算鲜镜) | 红 **1**(`domain`:鲜镜堆从 1 涨到 3) |
| 6 | 空跑这一档改判 `blocked('nothing-to-run')` | 红 **3**(`commands` 两条 + `release` 那条,三处各自点名后果) |
| 7 | 鲜镜堆换成等价写法 `!s.final`(不问就绪不问判旧) | 红 **1**(`domain`:鲜镜堆 4、「没能说清原因」那堆凭空消失) |
| 8 | 命令层就地拼那句话(不取 `Domain`) | 红 **3**(`commands` 两条 + 取数口) |
| 9 | 整集那一路的「已出片」不取 `shotVideoReady`(直接 `!s.final`) | 红 **1**(`domain`:离线模拟产物在线被算成已出片) |
| 10 | 去掉「没能说清原因」那一堆(镜被抹平) | 红 **1**(`domain` 的各堆之和那句:期望 10 实际 7) |

变异 3 是本槽的双端缺口读数:CLI 那端的行为面在单测层没有引擎可跑,
故它由源级那条 + `cli.smoke` 那条 live 用例两面接着(前者拦"取数口没了",后者拦"真跑起来不对")。

变异 7 与变异 5 分得开:5 是"抄了一份简化判据",7 是"连判据都不要了",两者在鲜镜堆上给出不同的数
(3 与 4),报错句各自印出实际那句话。

## 6. 回归数字(live)

| 套件 | 基线 `5f98d0b` | 本槽 |
|---|---|---|
| `unit` | 561/561 | **566/566** |
| └ `domain` 子套件 | 31 | **32** |
| └ `commands` 子套件 | 32 | **34** |
| └ `release` 子套件 | 37 | **38** |
| └ `contract` 子套件 | 128 | **129** |
| `integration` | 143/143 | **143/143**(未动,实跑复核过) |
| `cli.smoke` | 105/107 | **106/108**(失败仍是与 `master` 同名的那两条:`未登录 whoami → exit 3`、`llm --json mock 链路`) |

产品代码三个文件共 50 加 4 删:`js/domain.js` +30/-0(一个派生含注释)、
`js/commands.js` +16/-3(空跑早退与 `digest` 各一处)、`cli.js` +4/-1(空跑早退)。
`js/release.js`、`js/release-core.js`、`js/pipeline.js`、`js/issues.js`、`js/plans.js`、
`js/workbench.js`、`js/produce.js`、`js/skills.js`、`server.js`、`mcp.js` 一字未改。

治理面零变动:`Skills.gaps()` 键数、注册表条数、短名单、`CHECKS`、`preflightStages()`、`KB.SECTIONS`、
`playbooks()`、领域命令数、`GUARD_TOPICS` / `GUARD_TOPICS_CLOSED` / `TOPIC_FLOOR`,一个数没动;
门槛面同样零变动(`counts.stale`、G4 的判据与分档、`fix.shotIds` 成员、`ok`/`blocked` 分档)。

棘轮按 **live** 抬(不抄旧数):`tests/unit.js` 单元 `FLOOR` 561 → **566**、CLI 冒烟 `FLOOR` 107 → **108**、
记账件 `FLOOR` 195 → **196**;`README.md` 的「单元测试(N 项断言」561 → 566、契约段自报条数 128 → 129、
冒烟那句 107 → 108;`docs/skills-wave/README.md` 明写份数 195 → **196**(含本份)。

## 7. 交接

1. **同一形状的空跑还有一处,本槽没碰**:`cli.js` 的 `EXEC['subject.generateImage']` 在
   `todo` 为空时同样 `execOk({ total: 0, ok: 0, failed: [] })` 一声不吭,而它正是发布门 G9(主体缺图)
   的一键处置出口。收它的做法与本槽同形(给 `Domain` 加一份主体侧的 `note` 派生,两端同读),
   但主体那一侧的"为什么没跑"分档与镜头这一侧不同(`subjectIds` 点名的主体可能已经有图、可能不存在),
   得先把分档想清楚再动,不要直接套用 `emptyBatchNote`。
2. **浏览器那一端 `subject.generateImage` 空跑同样静默**,不过它归 `js/commands.js` 里另一段,
   改法与第 1 条是一件事的两半,建议同槽收。
3. **`result.note` 是本槽新开的通用位,今天只有一个生产者**。它的语义是「这次执行有话要说,
   而引擎不会替我说」——再有别的命令要用它,先确认那句话确实没有别的播报通道,
   否则会与引擎自己的 toast 撞成两条。`digest` 那一层不认识具体命令,加生产者不必改它。
4. **「全是定稿镜时该不该继续挂 G4 处置按钮」仍是 W177 留下的产品口径题**,本槽没有回答它——
   只是让按下去之后有回音。要收它得先在三条路里选一条(摘掉按钮 / 改挂"去解锁终稿"导航 /
   处置里自动解锁再重抽),别顺手放宽 `!s.final`。
5. **`js/pipeline.js` 断点条「重生成过期镜(N)」这一路本槽有意没碰**(按钮文案不在本槽射程内),
   但它的 `run` 已经经 `Commands.digest` 消化,故它撞上"点名的镜全被锁着"时**顺带也有回音了**——
   这是本槽的附带面,没有单独用例钉住(钉它要连按钮文案一起判,那是另一槽的地)。
