# W76 · 分镜脚本创作层两处内联人设收编:场次节拍拆解 / 文字分镜拆解进注册表

> 基线 `cursor/w72-integration-8d3f @ d2e7c43`,落地分支 `cursor/w76-sb-board-prompts-c5a1`。未合并 W69/W71/W73–W75。
> 收编的是 G-13 欠段里的**两处**:`js/sb-board.js` 分镜脚本创作层两步 LLM 的系统人设句。
> `js/wf-core.js` / `server.js` / `cli.js` / `mcp.js` 一行未碰,不抬发布门(`js/release.js` 未碰)、不新增计费动作、未删测。

## 1. 现场:先 grep 核原文,两句 def 不同,故两键不是一键

任务口径是"两处 def 相同才共用一键,否则两键"。先在本槽基线上把原文逐字取出来:

```
$ grep -n "system: '你是" js/sb-board.js
194:          system: '你是顶级短剧编剧,擅长场次与情绪节拍拆解。',
233:          system: '你是顶级短剧分镜师,擅长把情绪节拍拆成连续画面表达的文字分镜。',
```

| 步 | 位置(基线行号) | 内联字面 |
|---|---|---|
| AI 拆解场次与节拍(分镜脚本页「✨ AI 拆解场次与节拍」) | `js/sb-board.js:194` | `你是顶级短剧编剧,擅长场次与情绪节拍拆解。` |
| 拆解为文字分镜(分镜脚本页「🧠 拆解为文字分镜」) | `js/sb-board.js:233` | `你是顶级短剧分镜师,擅长把情绪节拍拆成连续画面表达的文字分镜。` |

**两句字面不同**,W56 立的复用三判据(字面同 / 角色同 / 产物落点同)一条都不成立:

- **角色不同**:一步是**编剧**(把剧本切成场次与情绪节拍),一步是**分镜师**(把节拍摊成连续画面表达)。
- **产物落点不同**:① 整体重建 `ep.scriptBoard = { scenes: [...] }`(场次标题/梗概/节拍三元组),
  ② 只按 `场次号.节拍号` 回填 `beat.shotsDraft[]`(节拍下一级的文字分镜列表)。
- **失败行为都不同**:① 失败即中止(`return false`,按钮恢复),② 失败回退本地按句粗拆(`localSplit`,恒 `true` 不中断)。

所以是**两条独立键**,不合成带变量的一个键。改完两处都是同一形状:

```js
system: Prompts.get('sb.boardSceneSystem'),
```

`js/prompts.js` 在 `index.html` 里排第 21 行、`js/sb-board.js` 排第 45 行,取值口用的就是浏览器已有的全局 `Prompts`,不新增加载项。

`js/sb-board.js` 里没有第三处 `system:` 字面(收编后该文件 `system: '你是` 计数**归零**,有断言钉住)。

## 2. 两个键:命名、位置、只收哪一半

```js
/* 分镜脚本创作层两步人设:场次节拍拆解的角色是编剧(出场次/情绪节拍骨架)、文字分镜拆解的角色是分镜师
 * (把节拍摊成连续画面),措辞与产物落点都不同,故两条独立键、不合成带变量的一个键;
 * 排在 sb.system 之前——分镜脚本是「① 分镜脚本」tab 的创作层,智能分镜是它之后的另一条入表路径。
 * 同样只收人设句:返回 JSON 字段契约与正文摘取仍由各步 user 半拼,不开放覆盖(改坏即整轮解析失败)。 */
{ key: 'sb.boardSceneSystem', name: '分镜脚本场次节拍拆解 · 系统人设', vars: [], def: '你是顶级短剧编剧,…' },
{ key: 'sb.boardDraftSystem', name: '分镜脚本文字分镜拆解 · 系统人设', vars: [], def: '你是顶级短剧分镜师,…' },
```

- **命名前缀取 `sb.`**:注册表里分镜域已有 `sb.system` / `sb.reviewUser` / `sb.reviewSystem` 一族,
  这两步同属分镜步(`stage='shots'`),挂进同一族比另起 `board.*` 更好找;`board` 放在键的中段而不是前缀,
  是因为「分镜脚本」这个板(`ep.scriptBoard`)才是它俩的共同归属,`Scene`/`Draft` 分别对应两步的产物字段
  `scriptBoard.scenes` 与 `beat.shotsDraft` ——键名到落点是可逐字对上的,不靠记。
- **不与 `sb.system` 复用**:`sb.system` 的 `def` 是「你是顶级短剧分镜师(AI 分镜师),输出直接可拍的连续剧分镜脚本。运镜与景别由你按剧情情绪自主推荐…」,
  与 `sb.boardDraftSystem` 只是**前六个字**相同,后半句要求的产物(可拍分镜脚本 + 运镜景别自主推荐)与本步(节拍→文字分镜草稿,不产出运镜景别)不是一回事;
  合进去会让"分镜脚本创作层的初稿口径"与"智能分镜的拆镜口径"改一次同时变。用例把这一条钉成
  「两句与 `sb.system`/`sb.reviewSystem`/`und.system`/`split.system` 都不同字面」。
- **注册表位置排在 `sb.system` 之前**:注册表顺序就是「全局默认值 → 核心提示词 skill」页的展示顺序,
  按产品流程排——集内工作区的 tab 行第一格就是「📋 分镜脚本」,智能分镜是它之后的另一条入表路径。
  两键相邻、场次节拍步在前,有断言钉住(后续槽插到中间即红)。
- **`vars` 为空**:两步都不做变量替换,正文由各自 user 半现拼。

## 3. 只收人设句:两份 JSON 契约留在 user 半不开放

与 `agent.system` 同口径。两步的 user 半各自带一份返回契约
(`{"scenes":[{"title":…,"text":…,"beats":[{"emotion":…,"plot":…,"shot":…}]}]}` /
`{"beats":[{"key":"场次号.节拍号","shots":[…]}]}`),以及正文摘取口径(剧本 `slice(0, 8000)` / 场次节拍摘要 `slice(0, 6000)`)。
这些**不做成可覆盖变量**:② 的回填是按 `key` 正则 `(\d+)\.(\d+)` 定位到具体节拍的,
用户把 `key` 或 `shots` 改一个字,那一轮就是"LLM 未返回有效分镜结构"整轮失败(① 更直接:`!Array.isArray(out.scenes)` 即抛),
而不是"提示词效果差一点"。

用例正查这一点:注册表里不得出现 `"scenes"` / `"beats"` / `"shots"` / `"emotion"` 四个字段名。
覆盖矩阵那一项另反查一遍——写覆盖之后两步的 `messages`(user 半整体)与缺省逐字节相同。

## 4. 取值口:两处都在浏览器,不存在第二端

两步都是纯浏览器链路(分镜脚本页按钮 → `API.chatJSON`),`server.js` / `cli.js` 里没有对端。所以:

- 取值口只有 `Prompts.get('<key>')` 两处,浏览器隐式读 `Store.state.settings.promptOverrides`(与 `agent.panelSystem` 那三条同形)。
- 断言写成**不许长出第二端**:`server.js` / `cli.js` 里不得出现两步的 user 半锚点
  (`将以下剧本(单集)拆解为结构化分镜脚本` / `把以下分集脚本的每个节拍拆成 1-3 条文字分镜`),否则就是有人在服务端另拼了一份。
- 收编解决的是"**可覆盖**",不解决"可 headless"——这一点如实写进 README、SK-03 的 `note` 与本件,不含糊成"这两步已双端单源"。

**本槽的行为面是沙箱真跑,不是只钉注册表**:两步的 handler 虽然挂在 `bindScriptBoard` 的闭包里,
但绑定用的是 `host.querySelector('[data-x=bd-ai]')` / `[data-x=bd-draft]` 两个**具名**选择器,
给一个只认这两个选择器的假 `host`(其余选择器一律回空集)就能把 `onclick` 取回来直接 `await`。
用例因此真跑了一遍两步,从 `API.chatJSON` 的请求体上截获 `system`,并顺带验证两步不是空转
(① 的回包落进 `ep.scriptBoard`、② 的回包落进 `beat.shotsDraft`)。这一点与 W71 的四步不同
(那四步的 handler 挂在 `Views.projectDetail` 的 DOM 闭包里,没有可直调的出口,只能钉注册表取值行为)。

## 5. 记账:键登记在 SK-03,`gaps` 一字未动

**键登记落在 SK-03(`core.personaCtx`)**:契约测试要求注册表每个 key 都被某条 skill 的 `prompts` 引用,
而这两步不属于任何一条 skill 自己的登记面(SK-17 的登记面是拆镜人设 `sb.system` 那一处注入点,不是分镜脚本创作层)。
SK-03 是人设通道的记账宿主,且已经收着三条**只有浏览器一个消费点**的键
(`agent.panelSystem` / `agent.drawerSystem` / `agent.previsSystem`)——这两条正好同口径,挂在这里不需要给它编第二套说法。

SK-03 的 `note` 因此在"已落地"那半末尾追加一段(点名两个键、两步的角色为什么不合并、只有浏览器一个消费点),
`仍欠` 段**一字未动**(那一段说的是四处装配口的 ops 协议半有意不开放覆盖,与本槽无关)。
用例把这条拆成三向:两个键须出现在 `note` 里、**不许出现在「仍欠」之后那段**、仍欠段里 `ops 协议` / `不开放覆盖` 两个锚点仍在——
判据照抄 W39 立的口径:点名断言只认「仍欠」之后那段,锚点写在"已落地"那半里不算交账。

**`gaps` 一字未动**:`G-13` 治的是"大量模块内联提示词未进注册表",本槽收两处、缺口没闭合。
按 W36 立的关联索引口径(落地一面不摘标记),`Skills.gaps()` 的键数(20)与 `G-13` 的六条值
(`script.hookType,script.aiToneBan,subjects.refDiscipline,eps.structureStage,gen.videoTpl,film.rhythmInject`)逐字节不变,并有断言钉住。

**没顺手动的**:SK-10 / SK-11 的 `note`(本槽基线上它们的仍欠段指的是 `js/episodes.js` 四处与 `js/persona.js` 那处,
与本槽收的两处无关,一字未碰);`js/episodes.js` 五处、`js/episode-util.js` 三处、`js/persona.js` 三处以及其余七个文件各一处的内联人设,
按任务口径**本槽一处不收**(变异 6 是这一条的正面验证)。

## 6. tripwire:基线上没有反向那一侧,故本槽立的是正向 + 全仓收严

任务口径是"翻转 tripwire"。先在基线 `d2e7c43` 上逐个查了一遍,与 `js/sb-board.js` 两处相关的断言**一条也没有**:

```
$ grep -n "sb-board" tests/unit.js
4342:      ['js/sb-board.js', 1], // 分镜脚本确认为分镜表      ← 拆镜入口 rev 闭环,与人设无关
$ grep -rn "顶级短剧编剧\|场次与情绪\|连续画面表达的文字分镜" tests/ js/skills.js
(零命中)
```

全仓唯一提到这两处的是 W66 记账件里的一句盘点(「…`js/sb-board.js` 两处…」),那是历史记录不是断言。
所以"翻转"落到本槽的形态是:**直接立正向那一侧**,并按 W69/W71 的收严口径把第二条写成**全仓持有者名单**。

| 原本该被反转的判据 | 本槽落地的形态 |
|---|---|
| `js/sb-board.js` 两步仍是内联字面 | 两步各自 `Prompts.get('<键>')` 取值,且键与该步 user 半锚点**配对**(两键互换位置即红);该文件 `system: '你是` 计数归零 |
| 注册表里没有哪条 `def` 是这两句话 | **全仓** `js/*.js` + `server.js` + `cli.js` + `mcp.js` + `index.html` 里含这两句字面的文件**恰好只有** `js/prompts.js` |

收严的地方与 W69/W71 同:不是只查 `js/sb-board.js` 干净了,而是把全仓扫一遍列出持有者名单再逐字节比对——
将来谁在别的文件里抄第二份(哪怕原文件仍走注册表)也当场红(变异 8 实测)。

**W69 / W71 / W73 / W74 若先合入**(现取各分支 tip 核过一遍),与本槽的交叠面是 `js/prompts.js` 的插入位与三处数字:

| 分支 | 新增键 | 插入位(相对既有键) |
|---|---|---|
| 本槽 W76 | `sb.boardSceneSystem` / `sb.boardDraftSystem` | `extract.system` 之后、`sb.system` 之前 |
| W73 `voice-director-prompts` | `voice.recommendSystem` / `voice.recommendBatchSystem` | **同一处**(`extract.system` 之后、`sb.system` 之前) |
| W74 `digest-three-prompts` | `digest.planSystem` | **同一处** |
| W71 `script-four-prompts` | `narration/reading/concept/light.system` | `split.system` 与 `extract.system` 之间 |
| W69 `persona-tplimage-prompt` | `persona.promptSystem` | `extract.system` 之后 |

**W73 / W74 / W69 与本槽落在同一个插入点上**,合并时是"两侧在同一位置各加一整块"那类冲突——
按 W64 立的判据**四块都留、不二选一**(机械取侧就整块丢掉另一槽的注册项,而剩下那侧照样全绿)。
块间相对次序不影响任何一侧的断言:本槽钉的是"两键相邻 + 都在 `sb.system` 之前",
W73/W74 同理只钉自己那块内部,别把四块交叉插散即可。

`README` 与 `docs/skills-wave/README` 的提示词条数按合入后 `Prompts.list().length` **现取重算**,不要照抄任一侧
(`contract` 的数字对账会先红;四槽全合入后应为 14+2+2+1+4+1 = 24)。
SK-03 的 `prompts` 数组按并集取,`note` 按段取并集(各槽都只在"已落地"那半末尾追加一段,`仍欠` 段谁都没动)。
`tests/unit.js` 各侧的新增用例都插在 `contract` 套件里剧本摘要人物小传步那两条之后,名字不重,全留。
**W74 与本槽的变异 6 有直接关系**:它收的正是 `js/episode-util.js` 那三处策划人设,
合入后 W56 那条行为面用例(现钉"前三步仍是各自内联的策划人设")要按 W74 侧改写——那正是本槽变异 6 转红的那一条。

## 7. 用例改动(新增 2 条,未删测、未改既有断言)

两条都落在 `contract` 套件,紧跟剧本摘要人物小传步那两条(同为"收编内联人设"的行为面 + 源级配对):

| 用例 | 钉住的事 |
|---|---|
| **新增** 行为面 `分镜脚本创作层两步人设:两个独立键各自取值,缺省逐字节等于收编前的内联字面、覆盖只换对应那一键` | ① 假 host 真跑两步,两步各发一次 LLM、`system` 逐字节等于收编前的两份内联字面;② 两步真的跑了(① 的回包落进 `ep.scriptBoard`、② 的落进 `beat.shotsDraft`);③ 两条各自在注册表登记(无变量、条目名带步名与「系统人设」);④ 每句字面**恰好命中注册表一条**(同 `def` 开两个键即红);⑤ 两句措辞互不相同,且与 `sb.system`/`sb.reviewSystem`/`und.system`/`split.system` 都不同字面;⑥ 覆盖矩阵 2×2——写一条覆盖时那一步跟随、另一步逐字节不动,且两步的 `messages`(user 半)逐字节不变、回包解析口径不变;⑦ 两键相邻、场次节拍步在前、都排在 `sb.system` 之前;⑧ 两份返回 JSON 的字段名一个不进注册表 |
| **新增** 源级 `分镜脚本创作层两步人设(源级):js/sb-board.js 零内联、逐步配对取值口,全仓只剩注册表一份` | ① 两处取值口与各步 user 半锚点**配对**(`system: Prompts.get('<键>'),` 后 600 字内出现该步锚点句);② `js/sb-board.js` 的 `system: '你是` 计数归零;③ 全仓两句字面的持有者名单**恰好只有** `js/prompts.js`;④ `server.js`/`cli.js` 不得出现两步的 user 半(不许长出第二端);⑤ SK-03 登记两个键、`note` 点名两个键、两个键**不许出现在「仍欠」之后那段**、仍欠段的 `ops 协议`/`不开放覆盖` 两个锚点仍在;⑥ `G-13` 标记仍在、`gaps()` 键数 20 且 `G-13` 六条值逐字节固定;⑦ `Skills.validate({ Prompts })` 通过(新键漏登记即红) |

沙箱加载器 `loadSbBoard(ov)` 与假 host 构造 `boardHost()` 与既有加载器同放在加载器区
(`ov` 是覆盖表,浏览器隐式读 `Store.state.settings.promptOverrides`,写进沙箱的 `Store` 即可)。

## 8. 变异实测

八条变异逐一施加、跑 `node tests/unit.js` 后复原(复原后 426/426):

| 变异 | 实测行为 | 转红(逐条实测) |
|---|---|---|
| 1 `js/sb-board.js` 场次节拍那步改回内联字面 | 收编退回收编之前 | **2 条**(行为面:覆盖矩阵那一项覆盖不到了;源级:配对断言找不到该键的取值口 + 全仓名单多出一个持有者) |
| 2 两键**合成单键**(只留 `sb.boardSceneSystem`,两步都取它) | 两步角色定位失真,改一次改掉两条链路 | **5 条**(引用键单源 + 行为面 + 源级 + README 提示词数对账 + SK-10/SK-11 记账对齐里的 `Skills.validate`) |
| 3 注册表 `def` 改一个字(分镜师那条句号→叹号) | 缺省不再逐字节相同 | **2 条**(行为面 + 源级的全仓名单——改完 `js/prompts.js` 也不再持有原字面) |
| 4 取值口改成 `Prompts.get(key, {})`(不读覆盖表) | 进表了但用户改不到 | **2 条**(行为面的覆盖矩阵 + 源级的配对写法) |
| 5 摘掉 SK-03 的两个键登记 | 新键不进索引、记账对不上账 | **2 条**(四类单源键全覆盖 + 源级) |
| 6 **反向**:把 `js/episode-util.js` 三处策划人设也收编 | 越出本槽口径(任务明写"不要收其它文件剩余内联") | **1 条**(W56 那条行为面:摘要四步的前三步 `system` 不再是策划人设) |
| 7 两个键在取值口上**互换位置** | 编剧人设发给分镜师那步 | **2 条**(行为面的覆盖矩阵 + 源级的配对) |
| 8 在 `js/beatboard.js` 里抄一份分镜师那句字面 | 别处多出第二份人设句(原文件仍走注册表) | **1 条**(源级的全仓持有者名单) |

几处值得说明的:

- **本槽的行为面比 W71 那条硬**:因为两步能真跑,变异 1/4/7 这类"取值口写法退化"在行为面也接得住
  (W71 的同类变异只红源级——那四步没有可直调的出口,行为面只能钉注册表取值)。
  两条用例仍是互补而不是重叠:变异 3 只靠字面比对拦得住,变异 8 只靠全仓名单拦得住。
- 变异 2 的具体表现:合成之后 `Prompts.get('sb.boardDraftSystem')` 回空串,行为面第 ① 项当场红;
  `Skills.validate` 因为 SK-03 还登记着不存在的键而红(它被 `skills` 套件那条记账对齐用例先跑到);
  `README` 的提示词条数从 16 掉到 15,数字对账跟着红——一处失守四处都拦得住。
- 变异 6 是"不要收其它文件剩余内联"这条口径的正面验证:越界收编当场红在 W56 立的那条行为面上,
  说明本槽的边界不是靠自觉守的。

## 9. 复核方式

```
git checkout cursor/w76-sb-board-prompts-c5a1
node --check js/prompts.js js/sb-board.js js/skills.js tests/unit.js   # 通过
node tests/unit.js          # 426/426 PASS(基线 424,新增 2 条用例)
node tests/unit.js contract # 58/58 PASS(基线 56)
node tests/unit.js skills   # 94/94 PASS(与基线同:本槽未动 skills 套件)
node tests/integration.js   # 126/126 PASS(与基线同:本槽未碰 server.js 与任何端点)
node tests/cli.smoke.js     # 95/97;两处失败「未登录 whoami」「llm --json mock 链路」与 master 同名(master 实测 51/53,同两条)
node -e "const P=require('./js/prompts.js'),S=require('./js/skills.js');
console.log(P.list().length);
['sb.boardSceneSystem','sb.boardDraftSystem'].forEach(k=>console.log(k, JSON.stringify(P.get(k))));
console.log(Object.keys(S.gaps()).length, S.gaps()['G-13'].join(','));"
# 16
# sb.boardSceneSystem "你是顶级短剧编剧,擅长场次与情绪节拍拆解。"
# sb.boardDraftSystem "你是顶级短剧分镜师,擅长把情绪节拍拆成连续画面表达的文字分镜。"
# 20 script.hookType,script.aiToneBan,subjects.refDiscipline,eps.structureStage,gen.videoTpl,film.rhythmInject
```

`node tests/e2e.js` 按仓库纪律未跑(需用户明确要求)。本槽不含合并、未开 PR。

## 10. 改动面

`js/prompts.js`(+2 条注册)、`js/sb-board.js`(2 行)、`js/skills.js`(SK-03 的 `prompts` 与 `note` 追加一段)、
`tests/unit.js`(+1 个加载器 + 1 个假 host 构造 + 2 条用例)、`README.md`(三处数字/描述)、
`docs/skills-wave/README.md`(提示词条数 + 索引行)。W69/W71/W73–W75 未合并。

## 11. 交接

1. **G-13 仍欠**,缺口开着:本槽收两处,全仓内联人设(`system: '你是` 字面计数)由 **20 处减为 18 处**——
   `js/episodes.js` 5 处(解说体改写 / 导演阐述 / 光影总控 / 事件图谱拆解 / 剧本围读,前四处与围读那处属 W71 口径)、
   `js/episode-util.js` 3 处(剧本摘要通读 / 汇总 / 集纲,同字面同角色)、
   `js/persona.js` 3 处(文生图提示词专家 1 处 + 配音导演 2 处,后两处同字面)、
   `js/agent-ops.js` / `js/beatboard.js` / `js/editors.js` / `js/gsettings.js` / `js/proj-shell.js` / `js/proj-upload.js` / `js/sb-views.js` 各 1 处。
   线外四条分支各自收掉其中一部分:W69 收 `js/persona.js` 文生图那 1 处、W71 收 `js/episodes.js` 4 处、
   W73 收 `js/persona.js` 配音导演 2 处、W74 收 `js/episode-util.js` 3 处——五槽全合入后为 **8 处**
   (`js/episodes.js` 事件图谱拆解 1 处 + 上列七个文件各 1 处)。合入时按实况现取计数,别照抄这个推算。
2. **别重做已在线外做掉的两处**:`js/episode-util.js` 那三处策划人设已由 W74 收成 `digest.planSystem`(一个键三个取用口)、
   `js/persona.js` 的配音导演两处已由 W73 收成 `voice.recommendSystem`/`voice.recommendBatchSystem`,两条分支都还没合入主干。
   合入之后 18 处会降到 13 处;**下一处该挑哪个先现取一遍全仓计数再定**,别照抄本件的盘点表。
   若要接 W74:它改的是本槽变异 6 转红的那条 W56 行为面用例(现钉"前三步仍是各自内联的策划人设"),取 W74 侧。
3. **别处再抄同一句人设当场红**:本槽的全仓持有者名单断言按**字面**比对,
   将来给 `js/beatboard.js` 之类的文件写新人设时,句子要与这两句不同(相同就该复用键,不是抄一份)。
4. **摘 G-13 标记的时机不变**:判据是"全仓再无内联人设",且要一次改齐六条关联索引的 `gaps` 与 `note`,
   不是谁的一半好了就摘谁。本槽不预支这个动作。
