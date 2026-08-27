# W84 · 镜头「按指令改」内联人设收编:`gen.editSystem` 进注册表

> 基线 `cursor/w75-integration-c4a7 @ fbefd0c`,落地分支 `cursor/w84-sb-views-prompt-2934`。未合并 W73–W83。
> 收编的是 G-13 欠段里 `js/sb-views.js` 的**那一处**内联人设。
> `js/wf-core.js` / `js/episodes.js` / `js/persona.js` / `js/role-editor.js` / `server.js` / `cli.js` / `mcp.js` 一行未碰,不抬发布门(`js/release.js` 未碰)、不新增计费动作、未删测、未开 PR。

## 1. 现场:先 grep 核实"1 处",核出来确实是 1 处

任务口径点名 `js/sb-views.js` 剩 1 处。先按仓库沿用的计数口径(`system: '你是…` 字面)在本槽基线上扫了一遍:

```
$ rg -n "system:" js/sb-views.js
1055:  system: WfCore.genPromptSystem(), // 注册表人设 + 抽卡公式/军规按键注入(js/wf-core.js 单源)
1109:  system: '你是短剧分镜改图专家。按用户指令改写文生图提示词:保留原提示词中与指令无关的画面要素与风格约定,只落实指令要求的变更;输出中文提示词,不超过120字。',
$ rg -n "你是" js/sb-views.js        # 同上两行里只有 1109 命中
```

1055 那处是 W15 收编过的四策略优化(走装配口 `WfCore.genPromptSystem`),1109 是**唯一**剩下的内联字面——落在「按指令改(评论生成)」那一步:用户说一句"把背景换成雨夜",LLM 结合镜头上下文改写提示词,确认后复用 `shot.generateVideo` 重出。整文件除此之外零内联人设,与点名一致。

改完是:

```js
system: Prompts.get('gen.editSystem'), // 注册表人设(js/prompts.js 单源,浏览器隐式读全局默认值页的覆盖表)
```

`js/prompts.js` 在 `index.html` 排第 21 行、`js/sb-views.js` 排第 58 行,取值口用的是浏览器已有的全局 `Prompts`,不新增加载项。

## 2. 独立键:与只隔一条的 `gen.promptSystem` 为什么不能复用

按 W56 立的复用判据(字面同 / 角色同 / 产物落点同)逐条对:

| 判据 | `gen.promptSystem` | 本步 |
|---|---|---|
| 字面 | `你是文生视频提示词专家。` | `你是短剧分镜改图专家。按用户指令改写…` |
| 角色 | 提示词专家(按策略把提示词写得更好) | 改图专家(按一句指令定点改画面,其余原样保留) |
| 产物落点 | 同写 `s.prompt` | 同写 `s.prompt` |

三条里只有落点同,字面与角色都不同,不构成复用。还有一条更硬的理由:`gen.promptSystem` 的**取值不是裸的 `Prompts.get`**,而是经装配口 `WfCore.genPromptSystem()` —— 人设句之后按键整条接 KB 抽卡公式 + 抽卡军规。合成一个键的后果不是"措辞差一点",而是**两步的缺省都变**:要么「按指令改」凭空多出两段抽卡方法论(那步不出新画面,讲的是定点改写),要么四策略优化那条丢掉方法论段(W15/W18/SK-21 的注入面当场破)。所以是独立键:

```js
{
  key: 'gen.editSystem', name: '按指令改分镜提示词 · 系统人设', vars: [],
  def: '你是短剧分镜改图专家。按用户指令改写文生图提示词:保留原提示词中与指令无关的画面要素与风格约定,只落实指令要求的变更;输出中文提示词,不超过120字。',
}
```

- **前缀取 `gen` 而不是 `sb`**:虽然代码住在 `js/sb-views.js`(`sb.*` 那一族的文件),但这一步是**生成板块**的动作——它跟四策略优化同在「提示词工具」那一层弹窗里(点「💬 按指令改」从上一层进来)、同用 `llm.optimize` 计费标签、改完同样接 `shot.generateVideo` 重出。前缀跟着产品位置走而不是文件名走,与 W71 里"四步分散在三个 tab 上所以不取 `episodes.*`"是同一条口径的另一面。
- **注册表落位紧跟 `gen.promptSystem`**:注册表顺序就是「全局默认值 → 核心提示词 skill」页的排列,两步同层同弹窗,排在一起用户才找得到;顺序也有断言(见 §6)。
- **`vars` 为空**:该步不做变量替换,镜头上下文由 user 半现拼。
- **不与 `persona.promptSystem` 复用**:那条是主体八维度重写文生图提示词(出主体立绘),W69 已把它与 `gen.promptSystem` 的边界写清;本步改的是镜头画面,同理不并。

## 3. 契约半不开放:这一刀切在哪

W71/W49 的判据是**"用户改坏之后会发生什么"**:改坏只是效果差 → 可开放;改坏就是整轮解析失败 → 留在装配口。按这条切:

| 半 | 内容 | 本槽处置 |
|---|---|---|
| 收进注册表 | 人设句 `你是短剧分镜改图专家。` + 改写纪律 `保留原提示词中与指令无关的画面要素与风格约定,只落实指令要求的变更;输出中文提示词,不超过120字。` | `def`,可在线覆盖 |
| 留在 user 半 | 返回 `{"prompt":"改写后的完整提示词"}` 的字段契约 | 不开放 |
| 留在 user 半 | 镜头上下文摘取口径(镜头剧情 / 场景 / 出场 / 项目风格 / 当前提示词 / 修改指令六行) | 不开放 |

**改写纪律为什么跟人设句一起收**:把"保留无关要素"改坏,结果是模型顺手把别处也改了——用户看到的是改写效果差,再点一次或改回默认即可;把 `"prompt"` 改成 `"result"`,那一轮直接是"LLM 返回为空"报错,而且用户无从知道是自己那一改造成的。这一族里 `sb.system`(带轴线规则与"运镜景别自主推荐")与 `review.finalSystem`(带四维标准)的 `def` 本来就同形——人设句连同作业纪律一起收、契约留在装配口,本槽不是新开口径。

用例正查:注册表里不得出现 `"prompt"` 这个字段名(20 条逐条查)。

## 4. 取值口:只有浏览器一处,不许长出第二端

这一步是纯浏览器链路(分集工作区镜头卡 → 提示词工具 → 按指令改 → `API.chatJSON`),`server.js` / `cli.js` 里没有对端:

- 取值口只此 `Prompts.get('gen.editSystem')` 一处,浏览器隐式读 `Store.state.settings.promptOverrides`(与 `agent.panelSystem` 那三条、W71 那四条同形)。
- 断言写成**不许长出第二端**:`server.js` / `cli.js` 不得出现该步 user 半的锚点(`修改指令`),否则就是有人在服务端另拼了一份。
- 收编解决的是"**可在线改写**",不解决"可 headless"——这一点如实写进 README、SK-03 的 `note` 与本件,不含糊成"这一步已双端单源"。

## 5. 行为面有沙箱真跑:两层弹窗用极简选择器桩驱动

W71 那四步没有沙箱真跑(handler 全在 `Views.projectDetail` 的 DOM 闭包里,没有可直调出口)。本步不一样:上一层 `openPromptTool` **在 `window.SBViews` 的导出面上**,`openCommentGen` 就挂在它 `onMount` 里的 `[data-t=comment]` 点击上。所以真跑这一层是搭得起来的,新增夹具 `sbViewsCommentGen(ov)`:

```
SBViews.openPromptTool(s, {}, p, ep)      → 截获第 1 层弹窗 opt
opt.onMount(m1, close)                     → m1.querySelectorAll('[data-t]') 给 5 个带 dataset.t 的桩节点
m1.querySelector('[data-t=comment]').onclick()  → 截获第 2 层弹窗 opt
opt.onMount(m2, close)                     → m2.querySelector('[data-f=inst]').value = '把背景换成雨夜'
await m2.querySelector('[data-x=rewrite]').onclick()  → 截获那一次 chatJSON 的 system/user/billingAction
```

弹窗桩只做一件事:**同一选择器取到同一个对象**(惰性造 `{value, style, disabled, dataset, onclick}`),`[data-t=x]` 那组顺带把 `dataset.t` 从选择器里解出来,好让四策略那圈 `forEach` 绑定跑得过去。`loadSbViews` 随之补一行 `loadFile(sb, 'prompts.js')`(与 `index.html` 同顺序:prompts 在前),既有 7 条 `sb-views` 用例的结论一条未改。

真跑钉住的四件事:

1. **缺省**:截获的 `system` 与收编前的内联字面逐字节相同;
2. **覆盖跟随**:写 `{'gen.editSystem': '你是覆盖生效的改图师。'}` 时 `system` 跟着换;
3. **覆盖只换人设句**:同一夹具两跑的 `user` 半(六行镜头上下文 + 返回 JSON 约定)**逐字节相等**;
4. **契约未开放**:`{"prompt":…}` 仍按原口径解析,回填进「改写后的提示词」文本框的值不变;顺带断言 `billingAction` 仍是 `llm.optimize`(收编不碰计费口径)、该步恰好发 1 次 LLM。

## 6. 全仓持有者名单:从"逐槽各写一份"改成"按注册表现取"

W69 §6 / W71 §6 各留下一条同形断言:"这几句字面的全仓持有者恰好只有 `js/prompts.js`"。收编到第 20 条,这个手法已经开始重复——每收一处就得再抄一遍那段目录扫描。本槽**新立一份按注册表现取的名单**,一条用例盖住全部键:

```js
const list = Prompts.list();
assert(list.length >= 20, '注册表条数不应回退');
list.forEach(it => assertEq(files.filter(rel => src[rel].includes(it.def)).join(','), 'js/prompts.js',
  it.key + ' 的 def 字面持有者应恰好只有 js/prompts.js'));
assertEq(new Set(list.map(x => x.def)).size, list.length, '注册表不应有两条 def 逐字节相同');
```

扫描面:`server.js` / `cli.js` / `mcp.js` / `index.html` + `js/*.js` 全量(与 W69/W71 同面)。两向都补上了:

- **一向**:哪个文件抄了任何一条 `def` 的第二份,当场红并点名是哪个键——**下一槽新收的键自动进名单**,不必再新写一条同形断言。
- **另一向**:逐字节比对对"同 `def` 开两个键"是盲的(两个键的字面都只在 `prompts.js` 一处),所以另加一条 `def` 去重断言把这条堵上。

W69/W71 那两条既有的分键名单**一条没删**(仓库纪律不删测),它们与新名单是包含关系而不是替代——那两条另外还钉着"取值口与该步 user 半配对"这类新名单管不到的事。实测本槽新名单在收编前的 19 条上就已经全绿(逐条 live 跑过),所以它是"把已经成立的事实立成契约",不是靠本槽的改动才凑出来的。

## 7. 记账:键登记在 SK-03,`gaps` 一个不摘

**键登记落在 SK-03(`core.personaCtx`)**,与 W71 那四条同一个宿主同一条理由:契约测试要求注册表每个 key 都被某条 skill 的 `prompts` 引用,而这一步不属于任何一条 skill 自己的登记面。

- 不挂 SK-21(`gen.videoTpl`):那条的注入面是"模板半 `tplVideo` + 方法论半按键进 `WfCore.genPromptSystem`",本步既不套模板也不接 KB 块,挂进去就得给它编一套说法。
- SK-21 的 `note` 末段 `模块内联提示词入注册表的覆盖面待 G-13` 本槽**一字未动**——那句说的是 G-13 整个覆盖面,收一处之后仍然成立(还剩 14 处)。

SK-03 的 `note` 在"已落地"那半追加两句(点名新键与"为什么不与 `gen.promptSystem` 合并"),**`仍欠` 段一字未动**——那一段说的是四处装配口的 ops 协议半有意不开放覆盖,与本槽无关,`facts` 表钉的两个锚点 `ops 协议` / `不开放覆盖` 仍在原段里。

**`gaps` 一字未动**:`G-13` 治的是"大量模块内联提示词未进注册表",本槽收一处、缺口没闭合。按 W36 立的关联索引口径(落地一面不摘标记),`Skills.gaps()` 的键数(20)与 `G-13` 的六条值逐字节不变,并有断言钉住。

**G-13 余量现场清点**(本槽实测,`system: '你是…` 字面口径,由 15 处减为 **14 处**):

| 文件 | 处数 | 内容 |
|---|---|---|
| `js/episode-util.js` | 3 | 剧本摘要通读 / 汇总 / 集纲(同字面同角色:资深短剧策划) |
| `js/persona.js` | 2 | 配音导演(单个 / 批量推荐音色,同字面) |
| `js/sb-board.js` | 2 | 场次节拍拆解 / 文字分镜 |
| `js/agent-ops.js` | 1 | 会话纪要整理器 |
| `js/beatboard.js` | 1 | 节拍拆解专家(已按键接 KB) |
| `js/editors.js` | 1 | 漫剧编剧(气泡生成) |
| `js/episodes.js` | 1 | 事件图谱拆解(剧本结构分析师) |
| `js/gsettings.js` | 1 | 资深影视导演 |
| `js/proj-shell.js` | 1 | 发行运营专家(已按键接 KB) |
| `js/proj-upload.js` | 1 | 拉片分析师 |

另有 4 处写成**模板字面量**(带 `${}` 插值,不在上面这个口径里):`js/agent-ops.js` 执行核验器、`js/experts.js` 人设进化器、`js/plans.js` 制作计划器、`js/role-editor.js` 主体设定师。

**`js/role-editor.js` 那处有意不收**,并配了反向断言(§8 第 ⑤ 条):它是主体「按指令改」,与本步是**同一个交互模式的两个入口**(README 那条功能描述里写在一起),句式几乎照抄——

```js
system: `你是短剧${kindWord}设定师。按用户指令改写文生图设定提示词:保留与指令无关的外形/风格要素,只落实指令要求的变更;输出中文提示词,不超过120字。`,
```

按 W56 三条判据:字面不同(`${kindWord}设定师` / 外形·风格要素 / 设定提示词)、角色不同(主体设定师 vs 分镜改图专家)、产物落点不同(`subject.prompt` 走 `genMainImage` 生图 / `shot.prompt` 走 `createShotVideo` 出片),所以将来收编时也是**另一个键**、而不是给本键加个 `{kind}` 变量。任务口径是"不要收其它文件",故本槽只把它立成锚点:那一处被收编而记账没跟上时,§8 第 ⑤ 条当场红。

## 8. 用例改动(新增 3 条,未删测、未改既有断言)

三条都落在 `contract` 套件,紧跟 W71 那两条(同为"收编内联人设"的行为面 + 源级):

| 用例 | 钉住的事 |
|---|---|
| **新增** 行为面 `镜头「按指令改」人设:沙箱真跑截获 system,缺省逐字节等于收编前的内联字面、覆盖只换人设句` | ① 缺省 `Prompts.get` 逐字节等于收编前的内联字面;② 注册表登记该条目(无变量、条目名带步名与「系统人设」);③ 该字面**恰好命中注册表一条**;④ 沙箱真跑两遍(缺省 / 覆盖)截获 `system`,覆盖跟随而 `user` 半逐字节不变;⑤ `billingAction` 仍是 `llm.optimize`、恰好发 1 次 LLM;⑥ 返回 JSON 契约仍在 user 半、`{"prompt":…}` 解析口径与回填不变;⑦ 与 `gen.promptSystem` 不同字面;⑧ 字段名 `"prompt"` 一个不进注册表 |
| **新增** 源级 `镜头「按指令改」人设(源级):js/sb-views.js 零内联、与该步 user 半配对,主体那处仍内联` | ① 取值口与该步 user 半锚点**配对**(`system: Prompts.get('gen.editSystem'),` 后 600 字内出现 `返回 {"prompt":"改写后的完整提示词"}`);② `js/sb-views.js` 的 `system: '你是` 计数归零;③ `server.js`/`cli.js` 不得出现该步 user 半(不许长出第二端);④ SK-03 登记该键且 `note` 点名它;⑤ **反向**:`js/role-editor.js` 主体那处仍是内联模板串、注册表里没有同类 `def`;⑥ 全仓内联人设计数 **14**;⑦ `G-13` 标记仍在、`gaps()` 键数 20 且六条值逐字节固定;⑧ `Skills.validate({ Prompts })` 通过 |
| **新增** 源级 `注册表全仓持有者名单:每条 def 的字面持有者恰好只有 js/prompts.js(谁在别处抄第二份即红)` | §6 那条:20 条 `def` 逐条全仓扫描 + 条数不回退 + `def` 去重反查 |

第 ⑥ 项那个计数是**双向路障**:收编下一处而不改这个数字会红,把本槽的收编改回内联也会红。

注册表顺序那一面由既有用例接着管(W71 那条钉的是四条键按产品流程排列),本槽新键落在 `gen.promptSystem` 之后由源级第 ① 条的配对正则与行为面第 ② 条共同锚住。

## 9. 变异实测

九条变异逐一施加、跑 `node tests/unit.js contract` 后复原(复原后 63/63,全量 431/431)。表里的"转红"计的是**用例条数**(一条用例内多个断言只算一条,故下面另注了首个失守的断言):

| 变异 | 实测行为 | 转红条数 | 首个失守的断言 |
|---|---|---|---|
| 1 `js/sb-views.js` 改回内联字面 | 收编退回收编之前 | **3** | 行为面「覆盖 `gen.editSystem` 时该步取值跟随」+ 源级配对正则 + 全仓名单(持有者变 `js/prompts.js,js/sb-views.js`) |
| 2 与 `gen.promptSystem` **合成一个键**(撤掉该条注册、该步改取 `WfCore.genPromptSystem()`) | 该步凭空多出抽卡公式/军规两段,缺省变了 | **7** | 引用键单源 + W69/W71 两条源级的 `Skills.validate` + 行为面缺省 + 源级配对 + 全仓名单条数回退 + README 提示词数 20→19 |
| 3 `def` 改一个字(`不超过120字` → `不超过 120 字`) | 缺省不再逐字节相同 | **1** | 行为面「缺省人设句应与收编前的内联字面逐字节相同」 |
| 4 取值口改成 `Prompts.get('gen.editSystem', {})`(不读覆盖表) | 进表了但用户改不到 | **2** | 行为面「覆盖跟随」+ 源级配对正则 |
| 5 把返回契约 `{"prompt":"…"}` 挪进 `def` | 用户改一个字段名即整轮解析失败 | **1** | 行为面缺省(同一条用例内「契约不进注册表」那项也失守) |
| 6 摘掉 SK-03 的键登记 | 新键不进索引、记账对不上账 | **2** | 「Prompts 全部 key 应被 skill 索引引用」点名 `gen.editSystem` + 源级「SK-03 应登记」 |
| 7 **反向**:把 `js/role-editor.js` 主体那处也改取本键 | 反向锚点消失而记账/清点还写着 14 处 | **1** | 源级第 ⑤ 项(同一条用例内第 ⑥ 项计数也变 13) |
| 8 在 `js/beatboard.js` 里抄一份本步 `def` | 别处多出第二份(原文件仍走注册表) | **1** | 全仓名单点名 `gen.editSystem` 的持有者多了一个 |
| 9 再开一个 `def` 与 `agent.system` 逐字节相同的键 | 注册表内部长出第二份 | **4** | 引用键全覆盖点名新键 + W45 那条「恰好命中注册表一条」 + 名单的 `def` 去重反查 + README 提示词数 20→21 |

几处值得说明的:

- **变异 2 的具体表现**:`Skills.validate` 因 SK-03 还登记着已不存在的 `gen.editSystem` 而红(三条用例各查一遍);`Prompts.list().length` 从 20 掉到 19,名单的"条数不应回退"与 README 数字对账跟着红——一处失守七处都拦得住。这正是 §2 那个理由的实测:合并不是"措辞退化",是缺省真的变了。
- **变异 1 里"缺省"那项反而没红**:内联字面与 `def` 逐字节相同,所以真跑截获的 `system` 照样对得上——拦住它的是**覆盖跟随**那一项(内联之后用户改覆盖表也不生效)。这说明"缺省逐字节"单独一项拦不住回退,覆盖矩阵那一层不是冗余。
- **变异 3 只红行为面、变异 4 只红源级 + 覆盖那半**,与 W71 观察到的互补关系一致:注册表没被动过时只有源级拦得住写法退化,源码写法没变时只有行为面拦得住 `def` 漂移。
- **变异 8 是 §6 那条新名单的正面验证**,而**变异 9 是它盲区的验证**:名单逐字节比对对"同 `def` 两个键"看不见(两个键的字面都只在 `prompts.js` 一处),补上的去重断言把这条堵住;顺带看到 W45 留的那条「恰好命中注册表一条」也从另一向拦住了同一件事。
- **变异 5 与 7 各只红 1 条**,是因为那两项断言与别的项同住一条用例(用例是断言的集合,不是断言数)。这两处的判据仍然生效——把失守项单独摘出来跑同样红。

## 10. 复核方式

```
git checkout cursor/w84-sb-views-prompt-2934
node --check js/prompts.js js/sb-views.js js/skills.js tests/unit.js   # 通过
node tests/unit.js          # 431/431 PASS(基线 428,新增 3 条用例)
node tests/unit.js contract # 63/63 PASS(基线 60)
node tests/unit.js sb-views #   7/7  PASS(与基线同数:只多加载了 prompts.js,结论一条未改)
node tests/integration.js   # 126/126 PASS(与基线同:本槽未碰 server.js 与任何端点)
node tests/cli.smoke.js     # 95/97;两处失败「未登录 whoami」「llm --json mock 链路」与基线同名同数
                            # (另开 master 工作树现取:51/53,失败的就是这两条同名项)
node -e "const P=require('./js/prompts.js'),S=require('./js/skills.js');
console.log(P.list().length);
console.log(JSON.stringify(P.get('gen.editSystem')));
console.log(Object.keys(S.gaps()).length, S.gaps()['G-13'].join(','));
console.log(JSON.stringify(S.validate({Prompts:P})));"
# 20
# "你是短剧分镜改图专家。按用户指令改写文生图提示词:保留原提示词中与指令无关的画面要素与风格约定,只落实指令要求的变更;输出中文提示词,不超过120字。"
# 20 script.hookType,script.aiToneBan,subjects.refDiscipline,eps.structureStage,gen.videoTpl,film.rhythmInject
# []
```

`node tests/e2e.js` 按仓库纪律未跑(需用户明确要求)。本槽不含合并、未开 PR、未合入 `master`。

## 11. 与并行分支的关系

W73–W83 未合并。改动面:`js/prompts.js`(+1 条注册)、`js/sb-views.js`(1 行)、`js/skills.js`(SK-03 的 `prompts` 一个键 + `note` 两句)、`tests/unit.js`(+1 夹具、`loadSbViews` +1 行、+3 条用例)、`README.md`(四处数字/描述)、`docs/skills-wave/README.md`(条数 + 索引行 + 摘要段一句)。

- **`js/prompts.js`**:本槽在 `gen.promptSystem` 之后插一条。并行槽若也在收编内联人设,注册表两块位置不同就都留;`README` 的条数按合入后 `Prompts.list().length` **现取重算**(`contract` 的数字对账会先红),不要照抄任一侧。
- **`js/skills.js` 的 SK-03**:本槽在"已落地"那半末尾追加两句、`prompts` 末尾追加一个键、`仍欠` 段未动;若并行槽也动这条,**按段取并集**(`prompts` 数组取并集,散文两侧各自那句都留),`facts` 表钉的 `ops 协议` / `不开放覆盖` 两个锚点必须留在 `仍欠` 段里。
- **§6 那条新名单是全局性的**:它按注册表现取,所以并行槽新收的键会自动进名单。反过来说,**并行槽若在别的文件里留了某条 `def` 的第二份字面,合入后这条会红而两侧单跑都绿**——这类"两侧各自成立、合到一起才失效"的断言只能靠合完真跑捞出(W68/W75 都记过同一类),判据是收窄而不是放宽:去掉那第二份,不要把名单改松。
- **§7 那张余量清点表**:本槽是现场 grep 出来的,并行槽若收了表里某一处,合入后要**重新 live 清点**再改数字与表格,别照抄任一侧;源级第 ⑥ 项那个计数断言会先红并给出实测值。
- **`tests/unit.js`**:本槽三条插在 W71 那两条之后、夹具 `sbViewsCommentGen` 插在 `personaSubject` 之后。若并行槽也插在同一处,**两侧的用例都留**(名字不重),然后按各自的实况重算 README 用例数。
- **`js/sb-views.js`**:只改 1109 那一行。W76 若另有对这一处的记账/断言,取本槽这一侧(那一行现在不是内联字面了),不要两条并存。

## 12. 交接

1. **G-13 仍欠**,缺口开着:余量清单见 §7(14 处 + 4 处模板字面量),`gaps` 一个不摘。
2. **下一处最省事的仍是 `js/episode-util.js` 那三处**(W71 §12 已点名,本槽实测仍在):同字面同角色(资深短剧策划)、同在剧本摘要一条链路上,按 W56 判据大概率是**一个键三个取用口**,且那条链路已有沙箱加载器 `loadDigest` 与"四步 system 逐字节"的行为面用例——注意它现在钉的是"前三步仍是各自内联的策划人设",收编时要一并改。
3. **`js/role-editor.js` 与本槽是配对的一对**:它是主体「按指令改」,与本步同一个交互模式两个入口。收编时按 §7 的分析取**另一个键**(不要给 `gen.editSystem` 加 `{kind}` 变量),并同步改掉源级第 ⑤/⑥ 两项。`js/persona.js` 的配音导演两处、`js/sb-board.js` 两处同理各自成键。
4. **别再逐槽新写"这一句只剩一份"的断言**:§6 的名单已经按注册表现取,新键自动进去。新收一处只需要写"取值口与 user 半配对"和"缺省逐字节"两面,以及把 §7 的清点数字改对。
5. **摘 G-13 标记的时机不变**:判据是"全仓再无内联人设",且要一次改齐六条关联索引的 `gaps` 与 `note`,不是谁的一半好了就摘谁。本槽不预支这个动作。
