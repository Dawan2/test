# W83 · 拉片建集内联人设收编:`js/proj-upload.js` 逐段画面理解那步进注册表(`rip.system`)

> 基线 `cursor/w75-integration-c4a7 @ fbefd0c`,落地分支 `cursor/w83-proj-upload-prompt-00b3`。未合并 W73–W82。
> 收编的是 G-13 欠段里 W76 点名的**一处**:`js/proj-upload.js` 拉片建集逐段 VLM 画面理解步的系统人设句。
> `js/wf-core.js` / `js/episodes.js` / `js/episode-util.js` / `server.js` / `cli.js` / `mcp.js` 一行未碰,不抬发布门(`js/release.js` 未碰)、不新增计费动作、未删测。

## 1. 现场:先 grep 核实,`js/proj-upload.js` 恰好剩 1 处

W71 交接件第 1 条把 `js/proj-upload.js` 记成"各 1 处",W76 又点了一次名。本槽基线上先扫一遍,数目对得上:

```
rg -n "system: '你是" js/proj-upload.js
# js/proj-upload.js:422:  system: '你是短剧拉片分析师。根据用户给的单镜头关键帧与时段,输出该镜头的结构化描述。',
```

恰好 1 处,就在 `openRip` 的第 3 步(逐段 VLM 理解)里:

| 步 | 位置(基线行号) | 内联字面 |
|---|---|---|
| 拉片建集 · 逐段画面理解(项目页「拉片建集」弹窗第 3/3 步,每段 2 积分) | `js/proj-upload.js:422` | `你是短剧拉片分析师。根据用户给的单镜头关键帧与时段,输出该镜头的结构化描述。` |

改完是同一形状:

```js
system: Prompts.get('rip.system'), // 人设走注册表单源(js/prompts.js),浏览器隐式读全局默认值页的覆盖表
```

`js/prompts.js` 在 `index.html` 里排第 21 行、`js/proj-upload.js` 排第 37 行,取值口用的是浏览器已有的全局 `Prompts`,不新增加载项。`def` 与上表字面**逐字节相同**(用例钉了一遍,另跑过一次与基线 `git show HEAD:js/proj-upload.js` 抽出的原串对比)。

**本槽只收这一个文件**:`js/beatboard.js` / `js/proj-shell.js` / `js/persona.js` / `js/episode-util.js` / `js/episodes.js` / `js/editors.js` / `js/gsettings.js` / `js/agent-ops.js` / `js/sb-views.js` / `js/sb-board.js` 里那 14 处一处未动,仍是 G-13 的余量(§6)。

## 2. 一个键,且不与 `split.system` 并键

W56 立的复用判据(字面同 / 角色同 / 产物落点同)对最像的三个既有键逐条都不成立:

| 候选并键对象 | 字面 | 角色 | 产物落点 | 结论 |
|---|---|---|---|---|
| `split.system`(剧本拆集) | `你是专业的短剧策划编辑。` | 按剧本文本切分集 | `p.episodes[]` 的集正文 | 判定输入一个是剧本文本、一个是关键帧图,三条判据全不同 |
| `und.system`(本集理解) | `你是资深短剧导演。` | 给已有的一集定导演基调 | `ep.understanding` 六维 | 同上 |
| `sb.system`(智能分镜) | 顶级短剧分镜师…(长) | 把剧情写成可拍分镜 | `ep.shots[]` 的提示词/运镜 | 拉片是从成片**反推**文字记录,不是从剧情**正推**分镜 |

所以是一条独立键:

```js
{
  /* 建分集的第二条入口(参考视频 → 场景切段 → 逐段画面理解)的人设句,与剧本拆集并列登记。
   * 只收人设句:段号/时段的现拼提示与返回 JSON 字段契约仍留在该步 user 半,不开放覆盖(改坏即该段解析失败)。 */
  key: 'rip.system', name: '拉片建集 · 系统人设', vars: [],
  def: '你是短剧拉片分析师。根据用户给的单镜头关键帧与时段,输出该镜头的结构化描述。',
},
```

- **命名**:`<步>.system`,与注册表里占多数的那一族(`split.system` / `extract.system` / `und.system` / `review.system`)同形。前缀取**步名**而不是文件名(不叫 `projUpload.*`),口径同 W71:`proj-upload.js` 只是这一步碰巧住的地方,而 `rip` 正是该步在源码里已有的自称(同一段里的 `RIP_MAX` 常量、`openRip` 函数名都用它)。
- **`vars` 为空**:该步不做变量替换,段号与时段由 user 半用模板字符串现拼。
- **注册表位置紧跟 `split.system`**:两者是**建分集的两条入口**(文本剧本拆集 / 参考视频拉片建集),「全局默认值」页把它们排在一起,用户找"我要改建分集那一步的人设"时两条挨着。这一条也写成断言(`keys[indexOf('split.system') + 1] === 'rip.system'`),免得后续槽随手插到中间静默改掉页面排列。W71 那四条的相对顺序断言只 `filter` 它们自己,故插在 `split.system` 之后不动它。

## 3. 只收人设句:JSON 契约与段号提示留在 user 半不开放

与 `agent.system` / W71 四条同口径。该步 user 半是一段现拼的模板字符串:段序号 `第 ${i+1} 个场景段`、起止 `${start}s 起,约 ${dur}s`,外加一份返回契约 `{"shot_desc":…,"camera":…,"scene":…,"characters":[…],"dialogue_text":…,"mood":…}`,后面还挂着关键帧的 `image_url`。这些**不做成可覆盖变量**:

- 六个字段名直接对着 `rows[i].plot/camera/scene/characters/dialogue/mood` 的赋值,用户改一个字,那一段就是"画面理解不可用"、`break` 掉后面所有段(该步首段失败即整轮降级为纯时间结构建集),而不是"提示词效果差一点"。
- 段号与时段是从 `ff.highlight` 探测结果现算的,做成变量等于让用户去拼一份可能与探测结果不一致的时间轴。

用例正查这一点:注册表里不得出现 `"shot_desc"` / `"dialogue_text"` / `"mood"` 三个字段名。

## 4. 取值口:只在浏览器,不存在第二端

拉片建集是纯浏览器链路(项目页弹窗 → `Media.ffHighlight` / `Media.ffFrames` / `API.chatJSON`)。服务端只提供 `ff.highlight` 的 `detect_only` 与 `ff.frames` 的 `times` 定点抽帧两个媒体端点,**逐段理解那一步的提示词一个字都不在服务端**(`server.js` 里 `拉片` 只出现在这两处端点的注释里)。所以:

- 取值口只有 `Prompts.get('rip.system')` 一处,浏览器隐式读 `Store.state.settings.promptOverrides`(与 W71 四条、`agent.panelSystem` 那三条同形)。
- 断言写成**不许长出第二端**:`server.js` / `cli.js` / `mcp.js` 里不得出现该步 user 半的锚点句(`这是参考视频第`),否则就是有人在服务端另拼了一份。
- 收编解决的是"**可覆盖**",不解决"可 headless"——这一点如实写进 README、SK-03 的 `note` 与本件,不含糊成"这一步已双端单源"。

该步的 handler 挂在 `openRip` 的 DOM 闭包里(`m.querySelector('[data-x=run]').onclick`),`EpisodeUtil` 的出口里没有它,故本槽的行为面**没有沙箱真跑那一层**,与 W71 同、与 W69 的 `Persona.rewritePrompt` 不同;能钉的两件事——缺省逐字节 + 覆盖只换这一键——落在注册表取值行为上,取值口落在哪一步由源级的配对正则锚住。

## 5. 记账:键登记在 SK-03,`note` 追加一句

**键登记落在 SK-03(`core.personaCtx`)**:契约测试要求注册表每个 key 都被某条 skill 的 `prompts` 引用,而拉片建集不属于任何一条 skill 自己的登记面(它既不是 SK-14/SK-15 那种分集面校验项,也不在任何编排型条目的 `steps` 里)。SK-03 是人设通道的记账宿主,已经收着七条**只有浏览器一个消费点**的键(`agent.panelSystem` 那三条 + W71 那四条),这一条同口径,挂在这里不需要给它编第二套说法。

`note` 在"已落地"那半追加一句(`仍欠` 段一字未动,`facts` 表钉的 `ops 协议` / `不开放覆盖` 两个锚点仍在):

```js
+ '拉片建集逐段画面理解那步的人设同形收编为 rip.system,取值口在 js/proj-upload.js 经 Prompts.get,'
+ '与剧本拆集并列为建分集的两条入口(同样只有浏览器一个消费点)。'
```

**没顺手动的**:SK-10 与 SK-11 的 `note`(它们的仍欠段点名的是 `js/episodes.js` 事件图谱拆解步与 `js/episode-util.js` 剧本摘要三步,本槽一处未碰,那两条反向断言原样绿)、`gaps` 一字未动——`G-13` 治的是"大量模块内联提示词未进注册表",本槽收一处、缺口没闭合,`Skills.gaps()` 的键数(20)与 `G-13` 的六条值逐字节不变并有断言钉住。

## 6. 全仓持有者名单:新立一条,不并进既有那两条

W69 与 W71 各立了一条持有者名单断言(前者查 `你是文生图提示词专家`、后者查四步那四句)。本槽**新立第三条**而不是把 `rip.system` 塞进 W71 那条:那条的 `PAIRS` 是"四步取值口与 user 半锚点配对"的表,拉片建集不在 `js/episodes.js`、也不与那四步同一条产品链路,并进去会让那条用例的名字与内容对不上(它叫「剧本板块四步人设(源级)」)。三条名单形状相同(扫 `js/*.js` + `server.js` + `cli.js` + `mcp.js` + `index.html`,`holders` 排序后逐字节等于 `js/prompts.js`),将来若还有第四第五条,再考虑抽成公用助手——现在抽会把"哪一句归哪一槽"这层可读性抹掉。

本槽另加一条**计数归零**断言:`js/proj-upload.js` 里 `system: '你是` 的出现次数为 0(W76 点名的那一处至此归零)。这与持有者名单互补——名单拦的是"别的文件抄第二份",计数拦的是"这个文件里又新写一处内联"。

G-13 的余量随之从 15 处减为 14 处,逐处现扫过:

| 文件 | 处数 | 人设 |
|---|---|---|
| `js/episode-util.js` | 3 | `你是资深短剧策划。`(剧本摘要通读/汇总/集纲,同字面) |
| `js/persona.js` | 2 | `你是配音导演。`(同字面) |
| `js/sb-board.js` | 2 | 场次节拍拆解 / 文字分镜 |
| `js/beatboard.js` / `js/proj-shell.js` / `js/agent-ops.js` / `js/editors.js` / `js/gsettings.js` / `js/episodes.js` / `js/sb-views.js` | 各 1 | 节拍拆解专家 / 发行运营专家 / 会话纪要整理器 / 漫剧编剧 / 资深影视导演 / 剧本结构分析师 / 分镜改图专家 |

## 7. 用例改动(新增 2 条,未删测、未改既有断言)

两条都落在 `contract` 套件,紧跟 W71 那两条(同为"收编内联人设"的行为面 + 源级配对):

| 用例 | 钉住的事 |
|---|---|
| **新增** 行为面 `拉片建集人设:经 Prompts.get(rip.system) 取值,缺省逐字节等于收编前的内联字面、覆盖只换这一键` | ① 缺省 `Prompts.get('rip.system')` 逐字节等于收编前的内联字面;② 在注册表登记(无变量、条目名带步名与「系统人设」);③ 该字面**恰好命中注册表一条**(同 `def` 开两个键即红);④ 与 `split.system`/`und.system`/`sb.system`/`extract.system` 都不同字面(并键当场红:并掉之后其中一条 `Prompts.get` 回空串);⑤ 覆盖矩阵——覆盖 `rip.system` 时 `split.system` 逐字节不动、反向亦然(串台即红);⑥ 注册顺序紧跟 `split.system`(后续槽插到中间即红);⑦ 三个返回 JSON 字段名一个不进注册表 |
| **新增** 源级 `拉片建集人设(源级):js/proj-upload.js 零内联、取值口与该步 user 半配对,全仓持有者名单只剩注册表` | ① 取值口与该步 user 半锚点**配对**(`system: Prompts.get('rip.system'),` 后 600 字内出现 `这是参考视频第`);② 取值口不得写成 `Prompts.get('rip.system', {})`(进表了但用户改不到);③ `js/proj-upload.js` 的 `system: '你是` 计数为 0;④ 全仓该句字面的持有者名单**恰好只有** `js/prompts.js`;⑤ `server.js`/`cli.js`/`mcp.js` 不得出现该步 user 半锚点(不许长出第二端);⑥ SK-03 登记该键、`note` 点名键与取值口所在文件;⑦ `gaps()` 键数 20 且 `G-13` 六条值逐字节固定;⑧ `Skills.validate({ Prompts })` 通过(新键漏登记即红) |

行为面这一条**没有沙箱真跑**,原因见 §4;缺省与覆盖两件事落在注册表取值上,取值口落在哪一步由源级配对正则锚住,两条合起来覆盖的面与"真跑一遍截获 system"等价。这与 W71 同形,不是本槽偷工。

## 8. 变异实测

七条变异逐一施加、跑 `node tests/unit.js contract` 后复原(复原后 62/62,`git status` 只剩本槽自己的改动面):

| 变异 | 实测行为 | 转红(逐条实测) |
|---|---|---|
| 1 取值口改回内联字面 | 收编退回收编之前 | 1 条(源级:配对断言先红,同一条里的计数归零项在它之后) |
| 2 `rip.system` 并进 `split.system`(注册表撤条 + 该步取 `split.system` + SK-03 撤登记) | 拉片分析师被写成拆集编辑,改一次改掉两条入口 | 3 条(行为面 + 源级 + README 提示词数对账 20→19) |
| 3 注册表 `def` 改一个字(句尾句号→叹号) | 缺省不再逐字节相同 | 1 条(行为面) |
| 4 取值口改成 `Prompts.get('rip.system', {})`(不读覆盖表) | 进表了但用户改不到 | 1 条(源级) |
| 5 摘掉 SK-03 的键登记 | 新键不进索引、记账对不上账 | 2 条(四类单源键全覆盖 + 源级) |
| 6 把 `rip.system` 插到 `narration.system` 之后 | 「全局默认值」页两条建分集入口被拆散 | 1 条(行为面的顺序项) |
| 7 在 `js/beatboard.js` 里抄一份该人设句 | 别处多出第二份(原文件仍走注册表) | 1 条(源级的全仓持有者名单) |

几处值得说明的:

- 变异 2 的具体表现:并掉之后 `Prompts.get('rip.system')` 回空串,行为面第 ① 项当场红;源级配对断言找不到取值口跟着红;`README` 的提示词条数从 20 掉到 19,数字对账再红——一处失守三处都拦得住。**只撤 SK-03 那一半登记**(变异 5)另有第四张网:`Skills.validate` 报 `rip.system` 未被任何 skill 引用。
- 变异 1 与变异 4 只红源级那一条是**有意的**:注册表本身没被动过,行为面(缺省字面 + 覆盖矩阵)照样绿,能拦住"取值口写法退化"的只有源级断言;反过来变异 3 与变异 6 只红行为面,因为源码写法没变。两条用例的覆盖面互补而不是重叠。
- 变异 3 只红行为面第 ① 项:持有者名单那一项是拿 `Prompts.get('rip.system')` **现取**去扫全仓的,`def` 一改,扫的就是新字面,`js/prompts.js` 仍是唯一持有者故仍绿——名单拦的是"抄第二份",不是"改字面",后者由缺省逐字节那一项拦。
- 每条变异只数**转红的用例条数**(用例内首个失败断言即中止),故变异 1 报的是配对断言而不是同一条里排在后面的计数归零项。

## 9. 复核方式

```
git checkout cursor/w83-proj-upload-prompt-00b3
node --check js/prompts.js js/proj-upload.js js/skills.js tests/unit.js   # 通过
node tests/unit.js          # 430/430 PASS(基线 428,新增 2 条用例)
node tests/unit.js contract # 62/62 PASS(基线 60)
node tests/unit.js skills   # 94/94 PASS(与基线同:本槽未动 skills 套件)
node tests/integration.js   # 126/126 PASS(与基线同:本槽未碰 server.js 与任何端点)
node tests/cli.smoke.js     # 95/97;两处失败「未登录 whoami」「llm --json mock 链路」与 master 同名(基线同名同数)
node -e "const P=require('./js/prompts.js'),S=require('./js/skills.js');
console.log(P.list().length);
console.log(JSON.stringify(P.get('rip.system')));
console.log(P.list().map(x=>x.key).slice(0,3).join(','));
console.log(Object.keys(S.gaps()).length, S.gaps()['G-13'].join(','));"
# 20
# "你是短剧拉片分析师。根据用户给的单镜头关键帧与时段,输出该镜头的结构化描述。"
# split.system,rip.system,narration.system
# 20 script.hookType,script.aiToneBan,subjects.refDiscipline,eps.structureStage,gen.videoTpl,film.rhythmInject
```

`node tests/e2e.js` 按仓库纪律未跑(需用户明确要求)。本槽不含合并、未开 PR。

## 10. 与并行分支的关系

W73–W82 未合并。改动面:`js/prompts.js`(+1 条注册)、`js/proj-upload.js`(1 行)、`js/skills.js`(SK-03 的 `prompts` 与 `note` 两句)、`tests/unit.js`(+2 条用例)、`README.md`(三处数字/描述)、`docs/skills-wave/README.md`(条数 + 索引行 + 收编脉络一句)。

- **`js/prompts.js`**:本槽在 `split.system` 与 `narration.system` 之间插一条。若并行槽也在这一带插键,两块都留;但**位置断言取本槽这一侧**(`rip.system` 必须紧跟 `split.system`),别的键要插就插在 `rip.system` 之后。`README` 的条数按合入后 `Prompts.list().length` 现取重算(`contract` 的数字对账会先红)。
- **`js/skills.js` 的 SK-03**:本槽在"已落地"那半末尾追加两句、`仍欠` 段未动;若并行槽也动这条,按段取并集,`facts` 表钉的 `ops 协议` / `不开放覆盖` 两个锚点必须留在 `仍欠` 段里。
- **若并行槽收了 `js/proj-upload.js` 同一处**:取任一侧都行但**只能留一条键**,并把两侧的用例合成一套(键名不同则以本槽的 `rip.system` 为准,理由见 §2 的命名口径);两条键同 `def` 会让行为面第 ③ 项("恰好命中注册表一条")当场红。
- **若并行槽的记账件写着"`js/proj-upload.js` 仍内联"**(W76 那一类点名):与本槽实况相反,**取本槽这一侧**并把那条判据反转——判据不是"谁的分支新",是源码实况,那一行现在不是内联字面了。
- **`tests/unit.js`**:本槽新增两条在 `contract` 套件、紧跟 W71 那两条;并行槽若也插在同一处,两侧用例都留(名字不重)。
- **`README.md` / `docs/skills-wave/README.md`**:数字(注册表提示词、单测数、索引行)一律按合入后实跑重算,不要照抄任一侧。

## 11. 交接

1. **G-13 仍欠**,缺口开着:本槽收一处,全仓内联人设由 **15 处减为 14 处**,逐处清单见 §6。
2. **下一处最省事的仍是 `js/episode-util.js` 那三处**(W71 交接件第 2 条的判断本槽复核过仍成立):同字面同角色(资深短剧策划)、同在剧本摘要一条链路上,按 W56 判据大概率是**一个键三个取用口**,且那条链路已有沙箱加载器 `loadDigest` 与"四步 system 逐字节"的行为面用例,收编后那条用例的期望串直接从三份内联字面换成注册表取值即可——注意它现在钉的是"前三步仍是各自内联的策划人设",收编时要一并改,SK-10/SK-11 两条仍欠段也点着它。
3. **`js/persona.js` 那两处配音导演**同字面(`你是配音导演。`)、都在配音链路上,判据同上;但两处的 user 半一个出配音稿一个出情绪标注,收编前先核产物落点。
4. **摘 G-13 标记的时机不变**:判据是"全仓再无内联人设",且要一次改齐六条关联索引的 `gaps` 与 `note`,不是谁的一半好了就摘谁。本槽不预支这个动作。
5. **持有者名单已有三条同形断言**(W69/W71/W83)。第四条落地时可以考虑把 `holders(literal)` 抽成 `contract` 套件的公用助手,但抽的时候要保住"哪一句归哪一槽"这层可读性——名单报红时,读的人要能一眼看出是哪一次收编被抄了第二份。
