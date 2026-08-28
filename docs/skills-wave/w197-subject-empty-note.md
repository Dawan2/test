# W197 · 主体补图「一位也没跑」时回执如实说清原因

**范围**:`js/domain.js`(新增 `emptySubjectImageNote` 一个派生)+ `js/commands.js`(空跑早退一处)
+ `cli.js`(空跑早退一处)+ `tests/unit.js`(+4 条:`domain` 1、`commands` 1、`release` 1、`contract` 1)
+ `tests/cli.smoke.js`(+1 条)+ `README.md` 与 `docs/skills-wave/README.md` 数字与描述同步。
**基线**:`cursor/w193-integration-f315`(`d55cd7d`)。
**不做**:不动 `ok` / `blocked` 分档(第 4 节有实测理由)、不动 G9 的判据与 `fix.subjectIds` 成员、
不动 `js/produce.js` 与 `smartReview` 候选、不动 `listModels`、不动 `chatJSON` 缺省人设、
不登记 `GUARD_TOPICS`、不拆 `Skills.gaps()` 键、不碰 `Domain.emptyBatchNote` 一个字。

## 1. 停工位成立:基线上点完 G9 处置什么回音都没有

交接给的停工条件是「若基线已有可见回执说明 0 位——停工位不成立」。在基线 `d55cd7d` 上把两端五档跑了一遍
(沙箱 `loadReleaseFix()` + `loadCli()`,门禁 → `Release.execFix` → 命令层 → `Commands.digest` 整条链真跑,
CLI 那端连 `EXEC['subject.generateImage'].run` 一起真跑并接住 stderr):

```
【1】整集批量、全部主体都有图(2 位)
  引擎实收   = []
  回执       = { ok:true, status:'done', result:{ total:0, ok:0, failed:[] } }
  digest 后 toast = []            ← 一条都没有
【2】整集批量、主体库为空
  回执       = { ok:true, status:'done', result:{ total:0, ok:0, failed:[] } }   toast = []
【3】点名的主体都已有图(sj1/sj2)
  引擎实收   = ['genSubjectImage:sj1','genSubjectImage:sj2']   ← 不是空跑,见第 3 节
  回执       = { ok:true, status:'done', result:{ total:2, ok:2, failed:[] } }
【4】点名的主体不在库里
  回执       = { ok:true, status:'done', result:{ total:0, ok:0, failed:[] } }   toast = []
【5】headless(Agent / 跑批 / CLI)同一档
  回执       = { ok:true, status:'done', result:{ total:0, ok:0, failed:[] } }
  CLI 那端 stderr 也是空的(`log('主体生图:N 位待处理…')` 只在 todo 非空时才打)
```

档 1 / 2 / 4 的 `result` **逐字节相同**(`1==2` 与 `1==4` 两次比对都为 `true`),与「真跑完两位」那档的
区别只有 `result.total` 一个数字。`Commands.digest` 对 `r.ok` 默认静默(引擎自己会 toast),
而这一档**逐主体引擎一次都没起来**,于是没有任何一端说过话。CLI 那端 `out(r, f)` 把 `total:0` 印进 JSON,
但那是个数字不是理由——它分不出"主体全都有图"和"点名的那位已经被删了"。

**停工位成立**,且基线上**没有任何可见 note**。W188 交接第 1、2 条说的就是这件事,本槽把两半一起收。

## 2. 改了什么

### 2.1 那句话收在 `Domain`(`js/domain.js`)

```js
D.emptySubjectImageNote = function (p, picked) {
  const subs = (p && p.subjects) || [];
  if (!subs.length) return '项目还没有主体,一位也没跑';
  const parts = [];
  const say = (n, t) => { if (n) parts.push(n + ' 位' + t); };
  if (picked && picked.length) {
    const ids = [...new Set(picked)];
    const gone = ids.length - subs.filter(s => ids.includes(s.id)).length;
    say(gone, '不在主体库');
    say(ids.length - gone, '没能说清原因');
    return '点名的 ' + ids.length + ' 位主体一位也没跑:' + parts.join('、');
  }
  const withImg = subs.filter(s => s.image).length;
  say(withImg, '已有参考图');
  say(subs.length - withImg, '没能说清原因');
  return '没有待补图的主体,一位也没跑:' + parts.join('、');
};
```

- **分档逐条对着两端待补图主体的筛法来**。两端 `todo` 都是
  `(p.subjects || []).filter(s => ids ? ids.has(s.id) : !s.image)`:点名这一路跑不到只剩一种理由——
  那个 id 不在主体库;整集这一路跑不到 = 全都有参考图(`!s.image` 的反面)。
- **各堆之和恒等于点名数**(整集那一路恒等于主体数)。最后那句「N 位没能说清原因」是安全阀:
  真实调用点(空跑早退)上它恒为 0,但只要哪天有主体既不在堆里、又确实没跑,它会当场露头。
  措辞有意不写成「不缺图」——那句在"这位缺图却没跑"时是假话。
- **句子只此一份**。它是回执文案不是判据,但两端各拼一版的结果是同一件事在浏览器 toast 与
  `hujing exec` 的 JSON 上读到两种说法(W177 收 `staleSplitNote`、W188 收 `emptyBatchNote` 时的同一条规矩)。

### 2.2 两端空跑早退各接一处

`js/commands.js`:

```js
if (!todo.length) {
  const r = ok({ total: 0, ok: 0, failed: [], note: Domain.emptySubjectImageNote(p, args.subjectIds) });
  r.next = nextOf(p);
  return r;
}
```

`cli.js` 同一位置同一份派生,另加一行 `log(note)`——CLI 面向人的通道是 stderr,
`out(r, f)` 那份 JSON 是给编排层读的,`note` 两边都到。
CLI 的积分不足那一档(`CliError` exit 6 整体中止)照旧,一个字没动。

### 2.3 `digest` 一行没改:复用 W188 开的通用位

W188 已经把 `result.note` 定义成「本次执行有话要说,而引擎不会替我说」的通用位,
判据是 `r.result && r.result.note` 而不是 `total === 0`——正是为了不绑死在一个命令上。
本槽只是第二个生产者,`digest` 那一层不认识具体命令,**一个字都不用改**。
按 W188 交接第 3 条先确认过:主体补图空跑这一档引擎一次都没起来(逐主体循环压根没进),
没有别的播报通道会与它撞成两条。

## 3. 为什么不复用 `emptyBatchNote`(交接问的第 2 题)

**不能复用,必须另写一份派生**——三条实测理由,不是形状洁癖:

| | 镜头那一侧(`emptyBatchNote`) | 主体这一侧(本槽) |
|---|---|---|
| 终稿锁 | 有:`!s.final` 挡着,故有「已定稿…需先解锁终稿」一堆 | **没有**,主体没有 `final` 这个字段 |
| 判旧 | 有:`shotVideoReady` / `shotVideoStale` 两份派生分出「产物已是最新」一堆 | **没有**,主体图没有就绪/过期派生 |
| 点名到已有产物的成员 | **跳过**(`!Store.shotVideoReady(s) \|\| stale` 才进 `pend`) | **照跑**(`ids.has(s.id)` 一条筛法,注释写明"含已有图重生") |

第三行是关键,基线档 3 现跑证过:点名两位**都有图**的主体,引擎实收
`['genSubjectImage:sj1','genSubjectImage:sj2']`、回执 `total:2`——那是「重新生成」不是空跑。
所以主体点名这一路**根本没有「产物已是最新」这一堆**,套用 `emptyBatchNote` 会把跑得到的主体
说成"跑不到",且整句会论起"镜"来。整集那一路同理:镜头分「已出片 / 已定稿」两堆,主体只有「已有参考图」一堆。

第三份就地拼句同样不许:两端各写一版就是本槽要收的那个病。故落点是
**`Domain` 里第二份派生 + 两端同读**,`emptyBatchNote` 一个字没碰(契约用例反向钉住不许改读它)。

## 4. 为什么不把这一档改判 `blocked`

与 W188 同一结论,消费方换了一批,故重新扫了一遍:

- **`Release.execFix` 自己不看 `r.ok`**——`.then(Commands.digest).then(r => onDone(r))`,
  `onDone` 在发布门弹窗与工作台里都是"重收门禁 + 重绘"。
- **真受伤的是 `js/plans.js`**:`subject.generateImage` 是主线计划步(`TODO_OF` 里的 `subj`,
  投影时不带 `subjectIds`,走的正是整集那一路),计划层按 `r.ok` 归档步态。
  计划建好之后用户自己在角色页把图补齐、再点那一步,会被记成失败步。
- **CLI 那一侧还多一层**:`exec` 的退出码按 `r.ok ? 0 : blocked ? 2 : 5` 出,
  改判会让 `hujing exec subject.generateImage` 在主体图齐备时回 exit 2,编排脚本据此中断。

故本槽**只改回执诚实这一面,`ok`/`status` 一个字没动**,并把这个结论正面钉进用例
(`commands` 与 `release` 两条各断言 `r.ok === true`;第 6 节变异 M6 反向钉住)。
**G9 的门槛同样一个字没动**:判据仍是 `(p.subjects || []).filter(s => !s.image)`、
`fix.subjectIds` 仍是缺图主体全集,`release` 那条用例最后一句现收门禁复核这件事。

## 5. 加测

五条新用例,分工不合并:

| 套件 | 用例 | 钉的是 |
|---|---|---|
| `domain` | `emptySubjectImageNote:一位也没跑时逐堆说清为什么(分档与镜头那一侧分得开;各堆之和 = 点名数)` | 派生本身:三个不存在的 id 全归「不在主体库」且安全阀不响、点名清单去重、**四位有图主体点名时一位也不许被算成"不在主体库"**(套用镜头那一侧的分堆在这里红)、整集那一路的堆与主体数对账、缺图主体还在库里却说没得跑时安全阀须响、空库与缺项目两条边界、措辞不许冒出"镜"字 |
| `commands` | `subject.generateImage:一位也没跑时回执自带实话(仍是 ok,digest 照播;点名到的主体照旧重生成)` | 整集档(全有图)+ 点名档(id 已不在库)两向、`r.ok === true`、引擎实收 0 位、digest 播的就是回执原句 + **反面**:点名到库里的主体走重生成、无 `note`、toast 不增 |
| `release` | `G9 一键处置:点名的主体已不在库里时按钮按下去有回音(门上说得清 ≠ 按下去读得到)` | 停工位本体:门禁 → `execFix` → 命令层 → digest 整条链,数的是**引擎实收 0 位**与**用户实读恰 1 条**;另钉门禁重收按实况走;对照面(点名的主体还在)toast 为 0 |
| `contract` | `一位也没跑那句实话双端单源:两端主体补图空跑早退都现取 Domain.emptySubjectImageNote,不与镜头那份混用` | 源级:两段实现各切片后须现取该派生、**可执行行**里不许出现那句话的字面(整行注释豁免)、**不许改读 `Domain.emptyBatchNote`**(第 3 节那条分档结论的源级落点) |
| `cli.smoke` | `exec subject.generateImage 一位也没跑 → ok+回执说清原因(note 与前端 digest 同一份)` | CLI 那一端 **live**:点名一个库里没有的主体 id,真服务端上回 `exit 0` + `result.note = '点名的 1 位主体一位也没跑:1 位不在主体库'` |

**夹具先自证有辨识力**:`domain` 那条的点名夹具里四位主体**全都有图**,而它们必须落进
「没能说清原因」那一堆而不是「不在主体库」——顺手抄 `emptyBatchNote` 的分堆(把有图的算成"产物已是最新"、
或把有图的当成跑不到)在这里当场红。这是 W177 归口的直接应用:
**钉取数口时夹具必须让第二份等价写法有地方出错**。

`release` 那条的场景是**交付面板开着、用户去角色页把那位缺图主体删掉之后再点处置**:
G9 的 `fix.subjectIds` 带的是收门那一刻的缺图主体 id,而点名到的主体只要还在库里就一律重生成,
故 G9 这个出口上**唯一**跑得出空跑的路就是"点名的 id 已不在库里"。这条如实写在用例注释里。

## 6. 变异

十一条,每条改完跑全套 `unit`、验完还原(还原后 `git status` 干净);本槽改动落地后这十一处一条都不红。

| # | 变异 | 结果 |
|---|---|---|
| 1 | 命令层空跑早退退回原样(不带 `note`) | 红 **3**(`commands` / `release` / `contract` 取数口) |
| 2 | `digest` 不读 `note`(成功档一律静默) | 红 **5**(本槽 `commands`+`release` 各 1,连带 W188 的 `commands`/`release`/`contract` 各 1——同一个通用位两个生产者一起塌) |
| 3 | 只改浏览器一端,`cli.js` 退回不带 `note` | 红 **1**(取数口点名 `cli.js`——行为面在单测层够不着 CLI 引擎) |
| 4 | `note` 写成恒有(真跑到主体时也附一句) | 红 **2**(`commands` 的反面那句 + `release` 的对照面) |
| 5 | 两端改读镜头那一份 `Domain.emptyBatchNote` | 红 **3**(`commands` 读到「本集还没有分镜」、`release` 读到论"镜"的那句、`contract` 点名混用) |
| 6 | 空跑这一档改判 `blocked('nothing-to-run')` | 红 **2**(`commands` 与 `release` 各自点名 `r.ok` 的后果) |
| 7 | 点名那一堆改按缺图判(`ids.includes(s.id) && !s.image`) | 红 **1**(`domain`:有图的四位被算成「不在主体库」) |
| 8 | 整集那一路的「已有参考图」不问 `s.image`(取 `subs.length`) | 红 **1**(`domain`:缺图主体还在库里却被报成"全都有参考图",安全阀不响) |
| 9 | 去掉「没能说清原因」两堆(主体被抹平) | 红 **1**(`domain` 的各堆之和那句) |
| 10 | 点名清单不去重 | 红 **1**(`domain`:同一 id 点名三次被数成三位) |
| 11 | 摘掉空主体库那句早退 | 红 **1**(`domain`:空库点名时冒充「1 位不在主体库」) |

变异 3 是本槽的双端缺口读数:CLI 那端的行为面在单测层没有引擎可跑,
故它由源级那条 + `cli.smoke` 那条 live 用例两面接着(前者拦"取数口没了",后者拦"真跑起来不对")。

变异 5 与变异 1 分得开:1 是"什么都不说",5 是"说了别人家的话";
两者在回执上给出不同的字符串,报错句各自印出实际那句话。

变异 10 有一处**假红读数**先记下来:第一次的替换脚本按 `const ids = [...new Set(picked)];` 匹配,
而 `js/domain.js` 里这一行有**两处**(`emptyBatchNote` 在前),`perl -0pi -e 's///'` 无 `/g` 只换第一处,
于是当轮红的是 W188 那条 `domain` 用例——变异根本没落到本槽的派生上。
按注释锚点(「点名清单按主体去重」)重定位后重跑,才是表里那条红 1。
**变异表里的红数要先确认变异真落在被测那一段上**(W189 记过同形的假变异读数)。

## 7. 回归数字(live)

| 套件 | 基线 `d55cd7d` | 本槽 |
|---|---|---|
| `unit` | 586/586 | **590/590** |
| └ `domain` 子套件 | 34 | **35** |
| └ `commands` 子套件 | 37 | **38** |
| └ `release` 子套件 | 47 | **48** |
| └ `contract` 子套件 | 130 | **131** |
| `integration` | 143/143 | **143/143**(未动,实跑复核过) |
| `cli.smoke` | 106/108 | **107/109**(失败仍是与 `master` 同名的那两条:`未登录 whoami → exit 3`、`llm --json mock 链路`) |

产品代码三个文件共 37 加 2 删:`js/domain.js` +24/-0(一个派生含注释)、
`js/commands.js` +8/-1(空跑早退)、`cli.js` +7/-1(空跑早退 + `log`)。
`js/release.js`、`js/release-core.js`、`js/plans.js`、`js/issues.js`、`js/pipeline.js`、
`js/produce.js`、`js/flow-tpl.js`、`js/skills.js`、`server.js`、`mcp.js` 一字未改。

治理面零变动:`Skills.gaps()` 键数、注册表条数、短名单、`CHECKS`、`preflightStages()`、`KB.SECTIONS`、
`playbooks()`、领域命令数、`GUARD_TOPICS` / `GUARD_TOPICS_CLOSED` / `TOPIC_FLOOR`(仍是 19 / 0 / 19),一个数没动;
门槛面同样零变动(G9 判据与 `fix.subjectIds` 成员、`ok`/`blocked` 分档、`Domain.emptyBatchNote`)。

棘轮按 **live** 抬(不抄旧数):`tests/unit.js` 单元 `FLOOR` 586 → **590**、CLI 冒烟 `FLOOR` 108 → **109**、
记账件 `FLOOR` 206 → **207**;`README.md` 的「单元测试(N 项断言」586 → 590、契约段自报条数 130 → 131、
冒烟那句 108 → 109 并补一段本槽的 headless 覆盖描述;
`docs/skills-wave/README.md` 明写份数 206 → **207**(含本份)。

## 8. 交接

1. **`result.note` 至此有两个生产者**(`episode.generateVideos`、`subject.generateImage`),
   `digest` 那一层仍不认识具体命令。再加第三个之前先确认那句话确实没有别的播报通道——
   引擎会自己 toast 的档位加上它就是两条。
2. **同一形状的空跑还有没有第三处,本槽没有全仓普查**。已知的两处都收了;
   `episode.smartReview`(shotIds 子集全是达标镜)与 `episode.compose` 那一路的早退形态不同
   (前者有引擎回执、后者直接 `blocked`),不是同一格,别顺手套。
3. **G9 处置在"主体已被删"这条路上仍是个会落空的按钮**——本槽只让它有回音,没有回答
   "门收完之后实况变了、按钮该不该跟着变"这个产品口径题(与 W188 交接第 4 条「全是定稿镜时该不该继续挂 G4
   处置按钮」是同一类)。要收它得先在三条路里选一条(按下前重收一次门禁 / 处置口带上收门时的快照版本 /
   命令层按实况重算子集),别顺手放宽 `fix.subjectIds` 的成员。
4. **`!s.image` 这条"缺图"判据全仓仍有三处各写一遍**(`js/domain.js` 的 `gateBlockers`、
   `js/release.js` 的 G9、`js/commands.js` 与 `cli.js` 的 `todo` 筛法)。
   本槽的新派生现取的是同一条字面而不是一份共有派生——**有意没收**:
   把它收成 `Domain.subjectNoImage` 会动到 G9 与门槛派生的取值口,那超出本槽射程。
   要收先量一遍四处的调用形态(有的要计数、有的要清单、有的要布尔)。
5. **主体图没有"判旧"这一面**(镜头有 `shotVideoStale`,主体没有):
   主体提示词/描述改过之后已有的参考图算不算过期,今天全仓零判据,
   故本槽的整集那一路只分得出「有图 / 没图」。哪天要补判旧,这份派生要同轮多一堆,
   `emptySubjectImageNote` 的各堆之和那句会先红出来。
