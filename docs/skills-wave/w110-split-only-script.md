# W110 · 「仅进行分集」把原文落进剧本板块

**范围**:`js/proj-upload.js` 一处写入(`doSplitRun` 成功路径)+ `tests/unit.js` split 套件 +3
(**467 → 470**,含新沙箱 `loadProjUpload()`)+ `README.md` 三处(用例数、split 套件覆盖面、剧本上传一节)。
**基线**:`origin/cursor/w108-parse-wizard-cmd-7b34`(`51fdec7`)。**未合并其它并行槽。**
**不做**:不抬也不降发布门(`G1–G10` 判据、fail/warn 计数与 overall 口径一字未动)、
不把 `doSplitRun` 收口到 `Commands.execute`(那是 W108 交接第 5 条的另一半,见第 5 节)、
不给拆集命令加 `text` 入参、不动 `splitCore` 与服务端 `/api/wf/split-episodes` 的取数出处(仍从 `p.script` 重读)。

## 1. 缺口:分集有了,剧本板块还是空的

W108 收口主体入库时顺带核出这个断点并留在交接里:

> 「仅进行分集」不把原文落进剧本板块,这是主线上一个真断点:
> 拆出来的分集正文有了,项目剧本仍空。

live 代码确是如此——上传弹窗两个按钮,只有一个写 `p.script`:

| | 「解析剧本」 | 「仅进行分集」(改前) |
|---|---|---|
| 写 `p.script` | 开跑**前**写(`p.script = scriptText; Store.save()`) | **不写** |
| 拆集 | 普通模式 `doSplit` / 精细模式经 `Director.run` | `doSplit` |
| 后续 | 主体提取、规范文本信息提取 | 无 |

于是"只想先拆集看看"的用户会拿到一个自相矛盾的项目:分集列表满的,剧本页仍是
「还没有剧本,点击下方「上传剧本」开始」,而且这个矛盾会一路传下去——`Domain.workflow`
的剧本步恒 `no-script`、`project.splitEpisodes` 与 `project.extractSubjects` 两条命令
一律 `blocked no-script`(命令按 `pid` 从 `p.script` 取正文)、`Plans` 的项目级步推不出、
AI 策划/剧壳发行文案读到的是空原文。原文明明就在用户刚才那个输入框里。

## 2. 落地:一处写入,落在成功之后

```js
// js/proj-upload.js  doSplitRun.onDone
try {
  r = await splitCore(p, scriptText, { say: t => U.toast(t, 'info', 3500) });
} catch (e) { U.toast(e.message, 'error'); return; }
if (scriptText && scriptText.trim() && p.script !== scriptText) { p.script = scriptText; Store.save(); }
```

三处刻意:

- **落在 `doSplitRun` 而不是按钮回调**。`doSplit(p, scriptText, …)` 的五个调用点里,
  只有「仅进行分集」传的正文与 `p.script` 不同(其余四处传的**就是** `p.script`,或调用前一行刚写过),
  所以写在这里对其余四条路是幂等空转,而不必给 `doSplit` 加第五个形参或让按钮回调再拼一段。
  若改用 `after` 回调写,写入会排在 `Views.projectDetail` **之后**——项目页当场重渲一次仍显示"未上传剧本",
  要等下次进页面才对得上,故不用那条路(第 4 节有对应的变异实测)。
- **落在成功之后**。`splitCore` 的守卫(任务中心不可达 / 本地在飞 / 服务端在飞)抛错时上一行已 `return`,
  失败路径一个字不写:否则会造出"剧本板块有原文、一个分集都没有"的第二种自相矛盾,
  跟改前那种只是方向相反。空原文更早一层就被按钮拦下(`getText()` 为空即 toast),不写假剧本这条两侧都成立。
- **`p.script !== scriptText` 的判等**只是省掉四条幂等路径上多余的一次 `Store.save()`,不是语义。

## 3. 这不是"抬发布门"——G1 根本不读 `p.script`

任务与 W108 交接都把这处记成「会翻转发布门 G1(有剧本)」。**这个标签是错的**,
本槽按 live 代码逐条核过,连同实测记在这里,免得下一个人为了"让 G1 认剧本"去动门禁判据:

| 判据 | 在哪 | 读什么 | 补写 `p.script` 后 |
|---|---|---|---|
| 发布门 **G1**(`g1-workflow` 主线步骤全完成) | `js/release.js` / `js/release-core.js` 逐集调 `Domain.episodeState` | `ep.content`(每集正文)、镜头计数、审片与成片状态 | **结论不变**(它一个字都不读 `p.script`) |
| 主线**剧本步**(`Domain.workflow` 的 `script` 步) | `js/domain.js` | `p.script \|\| p.extractDone` | `no-script` → `done` |
| 就绪检查缺口 `script/no-script` | `js/flow-tpl.js` | 同上(取 `Domain.workflow`) | 缺口消失 |
| 命令层闸门 | `js/commands.js` `project.splitEpisodes` / `project.extractSubjects` | `String(p.script \|\| '').trim()` | 不再 `blocked no-script` |
| 计划步推导 | `js/plans.js` | 同上 | 已拆集项目现在能推出"提取主体"那一步 |

**实测**(release 套件的齐备夹具,同一 `p` 只改 `script` 一个字段):`script: ''` 与
`script: '剧本正文'` 两次 `Release.collect` 的 `g1-workflow` 都是 `pass`,`fails`/`overall` 全等;
同一对项目在 `Domain.workflow` 上的剧本步却是 `no-script` 与 `done`。
这一对已固化成用例(第 4 节第三行),两面各钉一次。

顺带记两处**确实**随这次写入变化、但都不改门禁结论的面:

- **G7 合规**扫的项目级文本(`js/release.js` 里 `if (p.script) texts.push(p.script)`)现在会包含整本原文——
  这只是"仅分集"这条路终于与「解析剧本」那条路扫同样的文本,且 G7 是 warn 门(命中经 HumanReview 复核)。
- **问题中心**的剧本面低危提醒(`script-craft` 一类)同理开始对整本原文出提醒,低危不进 G2 的高/中危计数。

## 4. 断言与变异实测

新增沙箱 `loadProjUpload()`:按 `index.html` 同顺序加载 `domain → knowledge → prompts → wf-core →
episode-util → proj-upload`,切分算法、回收站快照与拆集闭环回流**全部真跑**,只桩掉弹窗 DOM、任务条与页面重渲。
两处桩按真实契约建:同一 selector 恒返回同一个假节点(用例据此点按钮,与 `loadDirector()` 同法),
`U.runTask` 即刻进 `onDone` 并把 promise 存在 `__runTask`(拆集是异步的,用例不 await 就什么都看不到);
`Views.projectDetail` 的桩顺手记下**重渲那一刻** `p.script` 的取值——ordering 只有这样才钉得住。

| 新增用例(`tests/unit.js` split 套件,6 → 9,全套 **467 → 470**) | 钉住什么 |
|---|---|
| 仅进行分集(行为面):拆集成功后原文落进剧本板块,主线剧本步随之 done | 弹窗真跑到 `splitCore`:拆出 2 集且正文按标记逐字切、`p.script` 等于输入原文、`Domain.workflow` 剧本步由 `no-script` 翻 `done`、**写回排在重渲之前** |
| 仅进行分集:空原文与拆集失败都不写假剧本 | 空原文当场 toast 且不起分集任务;在飞守卫抛错后分集与剧本板块**都**没变化,剧本步仍报 `no-script` |
| 仅分集补写入不动发布门:G1 逐集判正文,与项目剧本原文有无无关 | 同一夹具只改 `script`:`g1-workflow` 两次同为 `pass`、`fails`/`overall` 全等;而主线剧本步两次结论相反 |

**变异实测**(逐个改完跑 split 套件,验证后原样还原,`git diff` 为空):

| 变异 | 实测行为 | 转红 |
|---|---|---|
| 去掉那行写入(回到基线形状) | 拆出 2 集而 `p.script` 仍是 `''`,主线剧本步继续报"未上传剧本" | unit 1(行为面第一条);**G1 那条仍绿**——这正是第 3 节结论的反证:G1 不是这处的判据 |
| 写在 `splitCore` **之前**(不管成不成先落盘) | 在飞守卫拦下后项目留下"有剧本、零分集" | unit 1(失败路径那条,期望 `''` 实得整本原文) |
| 写在 `Views.projectDetail` **之后**(等价于走 `after` 回调) | 落盘对,但重渲那一刻 `p.script` 还是空,项目页当场仍显示"未上传剧本" | unit 1(ordering 断言) |

第三行值得单记:ordering 断言的第一版写成"`render` 在 `runTask` 之后",跑这条变异**没红**——
那句话恒真,等于没测。改成在重渲桩里取 `p.script` 的当刻值才钉得住。

## 5. 交接

1. **W108 交接第 5 条只解了一半**。「仅进行分集」现在写 `p.script`,`doSplitRun` 收口到
   `Commands.execute('project.splitEpisodes', { overwrite: true })` 的前置语义差**已经消失**
   (命令按 `pid` 从 `p.script` 取正文,而按钮此刻还没写——收口时要把写入挪到调用命令之前,
   或者接受"命令自己从 `p.script` 取、按钮先写后调"这个顺序)。真要收还得处理另两道:
   UI 侧的覆盖确认弹窗与在飞拦截 toast 是 `doSplit` 现有的对应物,别在收口时把它们变成静默 `blocked`。
2. **发布门 G1 的判据不要再按"有剧本"记**。第 3 节那张表是 live 实况,`g1-workflow` 逐集判 `ep.content`;
   项目级"未上传剧本"归主线剧本步。现有用例正反各钉一次,改门禁判据会当场红。
3. **`p.script` 现在有第三个写入点**(原有:上传弹窗「解析剧本」、`js/director.js` 精细模式、CLI `project-script`)。
   再加写入点前先想清楚"写在动作成功前还是成功后"——本槽的判据是"写下去的东西必须与项目其余状态自洽",
   两个方向的不自洽在第 2 节各举了一例。
4. **`loadProjUpload()` 是 `js/proj-upload.js` 的第一个行为面沙箱**(此前该文件只有源级断言)。
   主体确认弹窗、拉片建集两条链仍零行为断言,要接可复用这个沙箱,但 `openRip` 需要 `Media`/`FF` 两侧的桩。
