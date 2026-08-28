# W85 · 四条内联人设收编槽并入一条集成线的收敛记录(集成分支)

> 集成分支:`cursor/w85-integration-171f`,基线 `cursor/w80-integration-5369 @ 4c45f89`(任务直接指定,见第 2 节)。
> 本文只记**收敛过程**:基线怎么定的、合了哪四条、每处冲突怎么解、合并后的实测数字、没删测的取证。
> 各槽的内容说明在 `w78-beatboard-prompt.md` / `w79-editors-prompt.md` /
> `w81-gsettings-prompt.md` / `w82-proj-shell-prompt.md`,本文不代述、不复写。
> 四次合并都 `--no-ff`、各一个合并提交、可分别 revert;全程只解冲突与收敛双口径,**不重做已落地的功能**。

## 1. 结果一句话

按次序 `--no-ff` 合入四条内联人设收编槽:

| # | tip | 收编面 | 新增注册表键 | 登记面 |
|---|---|---|---|---|
| 1 | `w78-beatboard-prompt-ea0c@e467ea9` | 节拍板 AI 拆解步 | `beat.system` | SK-14 |
| 2 | `w79-editors-prompt-153a@9dd486a` | 漫剧编辑器 AI 生成对白步 | `comic.bubbleSystem` | SK-03 |
| 3 | `w81-gsettings-prompt-9f2e@7222a4d` | 导演设定五维生成步 | `dirset.system` | SK-03 |
| 4 | `w82-proj-shell-prompt-6f73@0994fc4` | 剧壳发行文案包步 | `dist.copySystem` | SK-03 |

提示词注册表按**并集**从 25 条推到 **29 条**,合并后回归 `unit 443/443`、`integration 126/126`、
`cli.smoke 95/97`(2 项失败与 `master` 同名同表现,见 5.2)。

W83/W84 任务口径明确排除,现取远端**两条分支都不存在**(`git branch -r` 无匹配),故非"存在而不合"。

**注册表之外一格没动**:`mcp.js` / `cli.js` / `server.js` / `js/release-core.js` / `js/issues.js` /
`js/issues-ui.js` / `js/wf-core.js` / `js/domain.js` / `js/knowledge.js` / `docs/AI助手接入指南.md`
**逐字未动**(`git diff --name-only 4c45f89 HEAD --` 这几个路径零输出),
故 W61 回流、release-core、issues UMD、W53 记账、W70 真 tip、索引契约一处没被冲掉;
现取 **MCP 工具字面仍 40 个(37 工具 + 3 提示模板)、领域命令仍 12 条、提醒投影表仍 7 条、
`KB.SECTIONS` 仍 18 条、校验面仍七面十七条、短名单仍 30 条无 `pending`、`gaps()` 仍 20 键**。

**本槽值得留下的三件方法面的事**:

1. **同一件事三个槽各立了一张名单,判据互不相同,合到一起谁的期望串都不对**。
   W78、W79、W81 各自新立了一张"全仓内联人设持有者名单",三张的扫描口径完全不同
   (W78 只数系统人设位、W79 数全部 `你是` 字面含注册表 `def` 与专家库、W81 数三种形态且排除注册表),
   三张的期望串又都写在各自 `merge-base` 那一刻的实况上。四次合并里**这三张每次都要重算一遍**——
   前一槽收编掉的那一处,正是后一槽名单里还挂着的那一行。
   判据固定成一句:**期望串一律按合并后 live 现取重写,不采信任何一侧的字面**
   (本文第 4.4 节列了三张名单在四次合并中的逐次取值)。
2. **"全表互不相同"这类全称断言,在别的槽有意留了一组同值时会失效**。
   W78 立了 `new Set(defs).size === list.length`(注册表各条 `def` 互不相同),
   而基线上 W73 有意把音色推荐留成两条同 `def` 的键(键位是持久化面,合成再拆会废掉用户已写的覆盖)。
   两侧各自成立,合到一起当场红。**没有放宽**:改写成"同 `def` 的键组恰好只有音色推荐那一组"——
   别处再抄第二份仍红,把那两条合成一键也红,判据比原来更窄。
3. **`} },` 块尾三次里踩到三次,第四次没有**。W78/W79/W81 三次都是"两侧在同一插入点各加整块、
   块尾那一行落在冲突块之后由两侧共用",一律按 W80 立的三步解法处理
   (删 `<<<<<<<` 行、把 `=======` 行**替换**成被切断的块尾、删 `>>>>>>>` 行);
   W82 那次两侧的块尾各自完整,直接两留即可。
   **区别只能逐次看,不能按前三次的经验默认**——每次解完立刻 `node --check tests/unit.js`。
   另有一次同形出现在 `js/skills.js` 的 `prompts` 数组上(两侧各带 `],` 结尾),机械两留语法当场断。

## 2. 基线与四个槽

### 2.1 基线

任务直接指定基线为 `origin/cursor/w80-integration-5369` HEAD(约 `4c45f89`)。现取核实:

```
git rev-parse --short origin/cursor/w80-integration-5369   # 4c45f89(与任务给的约值一致)
git checkout -b cursor/w85-integration-171f origin/cursor/w80-integration-5369
```

基线三套件现取 `unit 435/435`、`integration 126/126`、`cli.smoke 95/97`,与 W80 记的收尾数字逐个相等。

### 2.2 四个槽的分叉点

| 槽 | tip | 与基线的 `merge-base` | 那条线是 |
|---|---|---|---|
| `w78-beatboard-prompt-ea0c` | `e467ea9` | `d2e7c43` | W72 集成线 tip |
| `w79-editors-prompt-153a` | `9dd486a` | `d2e7c43` | 同上 |
| `w81-gsettings-prompt-9f2e` | `7222a4d` | `fbefd0c` | W75 集成线 tip |
| `w82-proj-shell-prompt-6f73` | `0994fc4` | `fbefd0c` | 同上 |

四个分叉点**都早于 W80 那五次合并**,所以四个槽给出的 `README` 长行散文、`js/skills.js` 的 `note`
与三张持有者名单描述的都是**分叉那一刻的实况**——W73/W74/W76/W77 收编的那些键在对侧眼里各自不存在,
它们收掉的那几处内联在对侧的名单里则都还挂着。判据沿用 W80 那句:
**取"哪一侧描述的是合并后的实况",两侧各描述了一半时就手工合成一句**;
名单这类可机器求值的期望串再加一句:**一律 live 现取,不采信任何一侧**。

### 2.3 W83/W84 的现取

任务口径排除 W83/W84。与 W80 记 W78/W79 时不同的是,这两条**远端并不存在**:

```
git branch -r | grep -E "w8[34]"   # 零输出
```

故本节只记"无此分支",不像 W80 第 6 节那样留 tip 现取值。

## 3. 四次合并各自的冲突面

| 合并 | 合并提交 | 冲突文件 | 冲突块数 |
|---|---|---|---|
| W78 | `8a075a5` | `README.md` / `docs/skills-wave/README.md` / `tests/unit.js` | 3 / 2 / 2 |
| W79 | `2a35d49` | 上三份 + `js/skills.js` | 3 / 2 / 1 / 2 |
| W81 | `5352786` | 同上四份 | 3 / 2 / 2 / 2 |
| W82 | `f757337` | 同上四份 | 3 / 1 / 1 / 2 |

`js/prompts.js` **四次全部干净自动合并**:四个新键的插入点两两不重叠
(`beat.system` 插在 `und.system` 之后、`comic.bubbleSystem` 插在表尾、
`dirset.system` 插在 `light.system` 之后、`dist.copySystem` 插在 `review.finalSystem` 之后),
**一律并集**,合并后 29 条键序现取:

```
split.system, narration.system, reading.system, concept.system, light.system, dirset.system,
extract.system, voice.recommendSystem, voice.recommendBatchSystem, persona.promptSystem,
digest.planSystem, sb.boardSceneSystem, sb.boardDraftSystem, graph.system,
sb.system, sb.reviewUser, sb.reviewSystem, und.system, beat.system, gen.promptSystem,
review.system, review.sumSystem, review.finalSystem, dist.copySystem,
agent.system, agent.panelSystem, agent.drawerSystem, agent.previsSystem, comic.bubbleSystem
```

`js/skills.js` 在 W78 那次也干净合上(`beat.system` 登记在 SK-14,不动 SK-03 那条),
从 W79 起三次都撞在 SK-03 的 `prompts` 数组与紧跟的 `note` 上。

## 4. 逐处怎么解

### 4.1 `docs/skills-wave/README.md` 索引表:并集 + 按槽号重排 + 去重

四次里这份文件的索引表每次都要手工接一手,形态有两种:

- **落在冲突块里**(W78/W79/W82):两侧各在表尾追加自己那行,`git` 报成一个块。
  解法一律**两侧的行都留**,再按槽号排成 `… w77 → w78 → w79 → w80 → w81 → w82`(不是按合入次序)。
- **落在冲突块外**(W81):对侧那行插在 `w71` 与 `w72` 之间(它分叉时表尾就在那里),`git` 自动合上,
  于是我方按槽号补的那行与它**并存成两行同名索引**——`contract` 那条"索引表与目录实况双向对齐"
  当场报出 `w81-gsettings-prompt.md` 出现两次。删掉自动合上的那行(它的描述停留在分叉那一刻,
  还写着"要接手 `js/episode-util.js` 三处策划人设、`js/persona.js` 两处配音导演"——那几处基线上早已收编),
  保留按合并后实况改写并排到 `w80` 之后的那行。**这一条是本槽新踩的**:
  索引契约管得住"漏登记"与"悬空链接",管不住"同一份记账件登记两次"以外的语义,行本身的措辞仍要人读。

索引契约(`每份记账件各有自己那行 + 相对链接不许悬空`)由 `contract` 套件守着,
四份新记账件(`w78`/`w79`/`w81`/`w82`)都是**纯新增文件、零冲突标记**——
`git status` 记 `A`,但它们那行索引落在冲突块里,不手工接一手当场红。这是 W67 立的那条加固第四次接住。

### 4.2 `README.md` 三处冲突:取我方 + 把对侧那段原样接进去

三处每次都一样,沿用 W80 记的解法:

1. **skill 索引那段的「N 条注册表提示词」**——取我方长行(它含主干后来落的全部描述),只把数字改成现取值。
2. **prompts 文件化那段的长行枚举 + 逐键描述**——取我方,再把对侧新增的那个词与那一整句
   原样插进对应位置(枚举位置按注册表键序:`节拍板拆解人设` 插在本集理解之后、`漫剧气泡对白人设`
   与 `导演设定五维生成人设`、`剧壳发行文案包人设` 依次接在其后;描述句按对侧原文的相对次序,
   四句都落在「其中视频提示词改写人设…」之前)。
3. **`node tests/unit.js` 那行的用例数**——四侧给的都是过期值,现取。

对侧长行整段插入时按**公共前后缀 char-diff** 复核过一遍:半角 `"` 没被打成全角 `“”`(W72 踩过这一处)。

### 4.3 `js/skills.js`:`prompts` 数组手工合成并集,`note` 手工合成一句

与 W80 那次不同,本槽 SK-03 的 `prompts` 数组**三次都是真冲突**(不是自动合成并集)——
三个新键都要追加在数组同一处尾部,`git` 每次都把两侧的整行报成一块。
机械两留会得到两行各带 `],` 结尾的数组字面,`node --check` 当场断;
一律**手工合成一行并集**,新键追加在尾部(不改既有键的相对次序)。

紧跟的 `note` 同理:两侧各描述了自己那一半的"已落地",一律**手工合成一句**接在一起;
**仍欠段要逐句合并而不是取侧**——W79 的仍欠段点名「漫剧气泡」与「ctx 通道」两个锚点
(它自带的断言 `owed.includes(...)` 逐个查这两个词),我方仍欠段点名的是 ops 协议与音色推荐那两条,
取任一侧都会让另一侧的断言当场红。合成后的仍欠段四个锚点一个不少。

W78 那次 `js/skills.js` 没冲突:`beat.system` 登记在 SK-14 名下(节拍板本就是它的注入落点),
与 SK-03 那条不在同一处。

### 4.4 三张持有者名单按合并后 live 逐次重写(本槽的主要工作量)

三张名单的判据各不相同,四次合并里每张都要重算。逐次取值:

| 名单 | 立于 | 判据 | 合 W78 后 | 合 W79 后 | 合 W81 后 | 合 W82 后 |
|---|---|---|---|---|---|---|
| A `inlinePersonaHolders()` | W78 | 顶层 helper,`system:`/`content:`/`=` 后紧跟 `你是`,扫 `js/*.js` + 四个 Node 端 | 11 文件 14 处 | 10 文件 13 处 | 9 文件 12 处 | **8 文件 11 处** |
| B `census` | W79 | 全部 `['"\`]你是` 字面,含注册表 `def` 与 `js/experts-data.js` | — | 14 文件 | 14 文件 | **13 文件** |
| C 局部 `inlinePersonaHolders` | W81 | `system:` 值位 / 具名人设常量 / 直接 `return`,排除 `js/prompts.js` | — | — | 9 文件 11 处 | **8 文件 10 处** |

四个槽给的期望串分别是 `15 文件 27 处`(W78)、`19 文件`(W79)、`15 文件 21 处`(W81),
**没有一个在合并后成立**——它们记的都是各自分叉那一刻的实况。
一律用与用例内同一段判据的脚本现扫全仓后重写,再跑一次确认落在同一串上。

A 与 C 两张名单的函数**同名但不同域**:A 是文件顶层的 `function inlinePersonaHolders()`,
C 是 W81 那条用例函数体内的 `const inlinePersonaHolders = ...`,后者在该用例内遮蔽前者。
这与 W80 记的 `loadPersona` 静默互覆**不是同一回事**(那次两个都在顶层,后定义的赢),
本槽两块都留是安全的——但仍逐个跑过确认各自的期望串独立成立,没有一张吃到另一张的罐头。

B 那张名单里 `js/prompts.js:N` 那一行**随注册表条数走**(它把 `def` 也计进去),
四次合并里从 `14`(W79 给的)一路改到 `28`;紧跟的那条
`Prompts.list().filter(x => x.def.startsWith('你是')).length` 同步改成 `28`
(29 条键里 `sb.reviewUser` 是评审指令不以「你是」开头)。

### 4.5 W78 那条"注册表各条 def 互不相同"按实况收窄

见第 1 节第 2 条。原断言:

```js
assertEq(new Set(Prompts.list().map(x => x.def)).size, Prompts.list().length, '注册表各条 def 互不相同');
```

改写成按 `def` 分组后点名唯一那一组:

```js
const byDef = {};
Prompts.list().forEach(x => { (byDef[x.def] = byDef[x.def] || []).push(x.key); });
assertEq(Object.values(byDef).filter(v => v.length > 1).map(v => v.join('+')).join(','),
  'voice.recommendSystem+voice.recommendBatchSystem', '注册表里同 def 的键只许是音色推荐那一组');
```

**这是收窄不是放宽**:原断言只说"没有重复",新断言把重复的那一组点了名——
别处再抄第二份仍红(多出一组),把音色那两条合成一个键也红(那一组消失)。
W78 立这条时的意图(`beat.system` 不是任何既有条目的第二份拷贝)另有紧邻的一条
`filter(x => x.def === PERSONA).length === 1` 精确守着,一个字没动。

### 4.6 `tests/unit.js`:整块两留,块尾按实况补

七处冲突块里,五处是"两侧在同一插入点各加整块用例",一律两留。其中:

- **W78 / W79 / W81 三次的用例块**与 **W78 / W81 两次的 helper 函数块**共五处是共用块尾形态,
  按 W80 那三步解法补回被切断的 `} },`(用例块)或 `}`(函数块)。
- **W82 那次两侧块尾各自完整**,直接两留,不能再按前三次的经验去补——补了就是多一个 `} },`。

每次解完立刻 `node --check tests/unit.js`,不靠跑测才发现语法断。

## 5. 实测与取证

### 5.1 三套件数字

| 套件 | 基线 `4c45f89` | 合并后 HEAD `f757337` |
|---|---|---|
| `node tests/unit.js` | 435/435 | **443/443** |
| `node tests/integration.js` | 126/126 | **126/126** |
| `node tests/cli.smoke.js` | 95/97 | **95/97** |

`README.md` 的「单元测试(N 项断言)」「N 条注册表提示词」「N 条主线 LLM 提示词」与
`docs/skills-wave/README.md` 的「提示词在 `js/prompts.js`(N 条)」四处都按现取值改过,
`contract` 那两条 README 数字对账用例守着前三处。

### 5.2 `cli.smoke` 那 2 项失败:与 `master` 同名同表现

`master @ 9adcf0f` 独立 worktree 现跑 `51/53`,失败两条:

```
FAIL | 未登录 whoami → exit 3 | exit=1
FAIL | llm --json mock 链路 | undefined
```

本槽 HEAD `95/97`,失败两条**同名同表现**。基线数不同是因为主干这些槽里 cli.smoke 用例本来就多,
两侧各自的失败集合相同——即本槽没引入新的 CLI 失败。

### 5.3 零吃测:用例数增量相加恰等于合并后 live

对每个 tip 现取它相对自己 `merge-base` 的用例增量,和基线相加:

| 槽 | `merge-base` | 该点用例数 → tip 用例数 | 增量 |
|---|---|---|---|
| `w78` | `d2e7c43` | 424 → 426 | +2 |
| `w79` | `d2e7c43` | 424 → 425 | +1 |
| `w81` | `fbefd0c` | 428 → 430 | +2 |
| `w82` | `fbefd0c` | 428 → 431 | +3 |

`435 + 2 + 1 + 2 + 3 = 443`,与合并后 live 实测**逐个相等**——没有任何一条用例被冲突解法吃掉。

名集另做一次双向对照:把四个 tip 与基线的 `unit` / `integration` / `cli.smoke` 三套件用例名抽出来排序,
与合并后逐份 `comm -23`,**十五次全空**(即任一侧有的名字合并后都还在)。
抽名时要**先切掉回执载荷再比**——`cli.smoke` 有 7 条用例的输出行里带着本次跑生成的
项目 id / `digest` / 时间戳,连载荷一起比会假报 7 条"缺失"(第一次跑就是这么报的)。

### 5.4 G-13 现况:三张名单各自的余量,标记一个不摘

三张名单口径不同故**不互相折算**,各自现取(见 4.4 表末列)。按 A 名单逐文件盘点余量 8 文件 11 处:

| 文件 | 余量 | 是什么 |
|---|---|---|
| `js/agent-global.js` | 1 | 意图路由器 |
| `js/agent-ops.js` | 2 | 执行核验器、会话纪要整理器 |
| `js/experts.js` | 2 | 专家人设进化器、专家 skill 生成器(元智能体) |
| `js/plans.js` | 1 | 制作计划器 |
| `js/proj-planner.js` | 2 | 短剧策划/编剧、出海本土化译制专家 |
| `js/proj-upload.js` | 1 | 拉片分析师 |
| `js/role-editor.js` | 1 | 角色设定师 |
| `js/sb-views.js` | 1 | 分镜改图专家 |

(C 名单少一处、多一个 `js/wf-core.js:1`——那是单镜审片的 user 半,A 名单有意不计;
两张的差额全在这两条例外上,不是谁数错了。)

**`js/beatboard.js` / `js/editors.js` / `js/gsettings.js` / `js/proj-shell.js` 四个文件至此内联人设归零**,
但 `G-13` 缺口没闭合,按 W36 立的关联索引口径**一个标记不摘**——
`Skills.gaps()` 仍 20 键、`G-13` 那六条值逐字节不变(有用例钉住)。

### 5.5 点名要保的六处逐条现查

| 要保的 | 现查 |
|---|---|
| 回流(W61 SK-26 主线前段四步) | `js/wf-core.js` 逐字未动;`memory` 套件全绿;`integration` 里前段三步回流那组全绿 |
| release | `js/release-core.js` 逐字未动;`cli.smoke` 的 `release`/`exec project.release` 那组全绿 |
| issues | `js/issues.js` / `js/issues-ui.js` 逐字未动;`Issues.reminders()` 现取 7 条 |
| W53 记账 | `docs/skills-wave/w53-memall-headless-seed.md` 在;索引行在 |
| W70 记账 | `docs/skills-wave/w70-integration-log.md` 在;索引行在;`git merge-base --is-ancestor 87aa62a HEAD` → 0 |
| 索引契约 | `contract` 套件那条全绿,四份新记账件都补了索引行(并去掉 4.1 那行重复) |

## 6. 剩余未合与残留

- **W83 / W84 不存在**:任务口径排除,现取远端零匹配(见 2.3),不像 W78/W79 当初那样是"存在而不合"。
- **`G-13` 仍开着**:余量见 5.4。摘标记的判据不变——"全仓再无内联人设",
  且要一次改齐六条关联索引的 `gaps` 与 `note`。剩下这 11 处里
  `js/agent-ops.js` 两处与 `js/sb-views.js` 一处正是 W80 第 4.4 节给 SK-10/SK-11 仍欠段立的新锚点,
  下一槽收它们时那两条源级反向断言会先红——**路障还在,翻面时要连记账一起翻**。
- **三张持有者名单口径未统一**:W82 已把它自己那条收成"按 `Prompts.list()` 现推"的形态
  (新增键自动进名单),但 A/B/C 三张仍是三份局部扫描各写一遍期望串。
  本槽**没有合并它们**——合并判据(哪些形态算内联人设、注册表与专家库计不计)是产品口径不是收敛口径,
  越权合并等于替三个槽改判据。想统一要单开一槽,并把三条记账件的口径说明一并改齐。
- **`G-10`(审片语义面)、`G-11`(自进化仍是人手动作且只对自定义专家开放)** 两条未动。
- 本槽只解冲突与收敛双口径,**没有新增功能、没有改任何判据的口径**;
  唯一的语义改动是 4.5 那条全称断言按实况收窄,以及三张名单期望串按 live 重写,都跟着实况走。
