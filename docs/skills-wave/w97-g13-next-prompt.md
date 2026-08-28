# W97 · 单镜审片提示词首句内联人设收编(`review.userSystem`)

> 分支:`cursor/w97-g13-next-prompt-0dc1`,基线 `origin/cursor/w90-integration-9004` HEAD `35695c8`(任务直接指定)。
> 本槽只收一处:`WfCore.buildReviewPrompt` 那条模板串的**首句人设**。
> 键名与 W93 那条槽对齐(`review.userSystem`),理由见第 3 节——两条线各起一个键名就会分叉出双键。
> 契约半不开放、缺省逐字节不变、`Prompts.get` 仍是现取不冻表;`G-13` 标记一个不摘。

## 1. 结果一句话

| 面 | 值 |
|---|---|
| 收编面 | 单镜审片那一步提示词正文(user 半)的开头一句人设 |
| 新增注册表键 | `review.userSystem`(紧接 `review.system` 登记,34 → **35 条**) |
| 装配口 | `WfCore.buildReviewPrompt(p, ep, s, hasImage, ctx, ov)`——第 6 个参数是新收的覆盖表 |
| 两端取值口 | 浏览器 `js/review.js` 不传(`Prompts.get` 隐式读 `Store.settings.promptOverrides`);服务端 `/api/wf/smart-review` 两处调用显式传 `ov` |
| 登记面 | SK-03 `core.personaCtx` 的 `prompts` + `note` |
| 三套件 | `unit 453 → 455`、`integration 126 → 126`、`cli.smoke 95/97`(2 项与 `master` 同名同表现) |

收完这一处,`js/wf-core.js` **零内联人设**(全文件 `你是` 字面计数归零,有断言钉住)。

## 2. 先核实:w90 上还剩哪些余量,哪些已被 W88–W94 收编

任务口径是"仍内联**且**尚未被 W88–W94 各槽声明收编"的下一处。两件事都现取,不采信任何一侧的散文。

### 2.1 live grep(基线 `35695c8`,排除 `tests/`)

```
rg -n "['\"\`]你是" -g '*.js' | grep -v "^js/experts-data.js" | grep -v "^js/prompts.js"
```

命中逐条落位如下(`server.js` / `cli.js` / `mcp.js` / `billing.js` 四个 Node 端**零命中**):

| 处 | 是什么 | 状态 |
|---|---|---|
| `js/wf-core.js:650` | 单镜审片提示词首句 | **本槽收它**(见 2.3) |
| `js/experts.js:98` | 专家人设进化器 | W88 已声明收编 |
| `js/experts.js:142` | `FORGE_SYS` 专家 skill 生成器(元智能体) | W88 已声明收编 |
| `js/plans.js:133` | 制作计划器 | W89 已声明收编 |
| `js/agent-global.js:74` | 意图路由器 | W91 已声明收编 |
| `js/proj-planner.js:67` | 短剧策划/编剧 | W92 已声明收编 |
| `js/proj-planner.js:149` | 出海本土化译制专家 | W92 已声明收编 |
| `js/prompts.js` × 33 | 注册表 `def` 自身(单一来源) | 口径排除 |
| `js/experts-data.js` × 16 | 预置专家库 `persona`(产品数据,用户雇佣时可改) | 口径排除 |
| `js/api.js:176` / `:199` | 调用方不给 `system` 时的层内兜底缺省 | 口径排除 |
| `js/gsettings.js:322` | 专家编辑表单的 `placeholder`(不发给模型) | 口径排除 |

另按窄口径复扫一遍"值位仍是字面"的形态,确认没有漏掉不以 `你是` 起头的人设:

```
rg -n "system:\s*['\`]" js/*.js server.js cli.js mcp.js | grep -v "Prompts\."
#   js/plans.js:133(W89)、js/experts.js:98(W88)——两处都在上表内,没有第三处
```

W91 有意不收的那两句(无板块锁定时的**上下文框定语**,`js/agent-global.js` 里注入板块状态/流水线概况那段)与 W91 口径里那句板块锁定文本都**不是**人设句形态,不在本槽收编面里,一个字未动。
W94 已核实 `js/persona.js` 三个 LLM 步全经 `Prompts.get` 现取、全文零内联,故它也不在余量里。

### 2.2 结论:除本处之外余量已被各槽认领完

上表里"仍内联且未被声明"的**只有 `js/wf-core.js:650` 这一处**。
其余 6 处分属 W88(2)、W89(1)、W91(1)、W92(2),四条槽各自的记账件都已点名到具体键。
所以本槽既不是"随便挑一处",也不是"没有余量可收"——它就是口径下唯一剩的那一处。

### 2.3 那一处为什么在这条基线上还在

任务提到"W93 已收的 `wf-core` 审片首句(那条在 w85 分支上)"。现取核实:

```
git merge-base origin/cursor/w90-integration-9004 origin/cursor/w93-video-review-prompt-175a
#   2a05c72   ← 就是 W85 集成线 tip,也正是 W90 的基线
git rev-list --count 2a05c72..origin/cursor/w93-video-review-prompt-175a   # 2
```

即 W93 是**从 W90 的基线**上分出去的两笔提交,并没有进过这条集成线;
W90 那四次合并动的是 `prompts.js` / `skills.js` / `sb-views.js` / `agent-ops.js` / `role-editor.js` / `proj-upload.js`,
一处也没碰 `buildReviewPrompt`。
所以这条基线上首句仍是内联字面,按任务口径本槽就收它。

## 3. 键名为什么必须与 W93 对齐,而不是另起一个

这一处是**两条并行线各收一次**的同一个落点。键名一旦分叉,后果不是冲突而是**双键**:

- 键位是持久化面。`settings.promptOverrides` 以键名为主键存用户写过的覆盖。
  两条线各起一个名字(比如 `review.promptSystem` 与 `review.userSystem`),
  合并时两条键都会留在注册表里——**两条 `def` 逐字节相同、都指着同一句话**,
  而装配口只可能读其中一条,另一条就是个用户改了不生效的死键。
- 冲突反而是好结果:同名同落点的两侧在 `js/prompts.js` 会撞成一块,解冲突时一眼看得见"这是同一件事"。
  异名则两处插入点互不重叠、**干净自动合并**,谁也不会被提醒。

所以本槽逐项对齐 W93 的落点(键名 / `name` / `def` / 登记位置 / 装配口签名 / 切刀位置),
让两条线合并时撞成一块、按并集解一次即可。**只对齐落点,不合并 W93 的提交**(任务口径)。

## 4. 切在哪一刀:人设句进键,契约半留在装配口

收编前那条模板串的开头是:

```
你是专业 AI 视频审片组,从技术层/匹配层/导演层三个维度评审一个短剧分镜视频,只返回 JSON:
{"score":总分(0-10,一位小数),
"dimensions":{ "technical":{…}, "matching":{…}, "directing":{…}},
"issues":[{"timeRange":…,"severity":"严重或轻微",…}]}
评分标准:≥8.5 优秀,7~8.5 良好,<7 需返工。…
拆解规则检查:…
```

**刀落在「只返回 JSON:」之前**,即 `def` 是:

```
你是专业 AI 视频审片组,从技术层/匹配层/导演层三个维度评审一个短剧分镜视频,
```

三件事值得写下来:

1. **末尾那个连接逗号有意留在键里**。它是人设句自己的收尾标点,其后紧接契约半的「只返回 JSON:」。
   留在键内的收益是覆盖时用户改写的是一整句完整措辞;留在装配口则会得到
   "覆盖生效的那句话 + 一个来历不明的逗号"这种拼不顺的串。
2. **契约半不开放**,与 W78/W79/W82 那几槽同口径。这一半不是措辞而是**解析判据**:
   `"score"`/`"dimensions"`/`"technical"`/`"matching"`/`"directing"`/`"issues"`/`"severity"`
   逐个都是 `WfCore.normalizeReport` 取值的字段名,评分标准与 severity 词表是它钳制取值的刻度。
   用户改坏即整轮拿不到 `dimensions`,报告退成零分空评语——而这一步是**计费的**(`action: 'llm.review'`),
   静默退化就是白扣。有一条用例把这几个字面逐个扫注册表、确认一个都没进去。
3. **`review.system` 不复用**。那条是同一次请求的 `system` 消息位人设(`你是资深影视审片专家组(技术/匹配/导演三席)。`),
   与这条**同步发出**:一条在消息位、一条是提示词首句,措辞与三维交代都不同。
   合成一键就得二选一个字面,另一处当场失真。用例正面反面各钉一条:
   `def === SYS` 的键恰好 1 条(同 `def` 开两个键即红)、`review.system`/`review.sumSystem`/`review.finalSystem`/`sb.reviewSystem` 四条都不得与它同字面。

## 5. 装配口收覆盖表:为什么这一处必须显式收参数

`W.buildReviewPrompt` 是**双端单一来源**(浏览器 `js/review.js` 委托它、服务端 `/api/wf/smart-review` 也 `require` 它),
而 `wf-core.js` 顶部第 5 行就写着本模块**不碰 `window`**、环境差异一律经参数注入。
所以覆盖表不能在模块里去取,只能从签名进来——与 `WfCore.extractSystem(ov)` / `WfCore.buildAgentSystem(ctx, ov)` 同形:

```js
W.buildReviewPrompt = function (p, ep, s, hasImage, ctx, ov) {
  …
  return `${Prompts.get('review.userSystem', ov)}只返回 JSON:
```

两端各自的取值方式**不一样,而且都是对的**:

| 端 | 传不传 `ov` | 为什么 |
|---|---|---|
| 浏览器 `js/review.js` | 不传 | 同进程里 `Prompts.get` 自己隐式读 `Store.settings.promptOverrides`,再传一份是第二条路径 |
| 服务端 `server.js` 两处审片调用 | 显式传 `ov` | 服务端没有 `Store`,`ov` 是这一次请求按用户设置装好的覆盖表;不传就是 headless 侧改了不生效 |

服务端那两处是**视觉模型(带关键帧图)与纯文本**两条分支,**都得传**——
漏一处的表现是"有画面的镜按用户覆盖走、没画面的镜按缺省走",同一集里两种人设。
有一条用例把 `server.js` 里 `WfCore.buildReviewPrompt(...)` 的调用全抓出来,
先断言恰好 2 处、再逐处断言结尾是 `, rctx, ov)`。

`Prompts.get` 仍是**求值时现取**:模块顶层没有预取常量,故用户改完覆盖表下一次审片即生效,
注册表也不会被加载期冻住(这条是 W88/W92 立的判据,本槽沿用不改)。

## 6. 缺省逐字节不变的六层取证

「收编不改行为」这句话得逐层钉住,只对一条字面不算:

1. `Prompts.get('review.userSystem')` === 收编前模板串首句字面(含末尾逗号)。
2. 装配口不传覆盖表时,整条提示词以 `SYS + '只返回 JSON:\n'` 开头。
3. `buildReviewPrompt(…, undefined)` 与 `buildReviewPrompt(…, {})` 逐字节相等(空覆盖表不是一种覆盖)。
4. 写覆盖时 `bare(OV) === 覆盖句 + bare().slice(SYS.length)`——即**首句之后一个字节都没动**
   (三维 JSON 契约、评分标准、拆解规则检查、评审口径、分镜信息段、附图那句全在内)。
5. 覆盖别的键(`review.system`)不串到本步。
6. 源级:`js/wf-core.js` 与 `js/review.js` 都不再含那句字面,`js/wf-core.js` 全文 `你是` 计数为 0。

## 7. 三张全仓名单:一张一处不改,两张各减一处

三张名单判据不同,故**不互相折算**、各自按 live 重算(判据原文见各自用例注释):

| 名单 | 立于 | 判据 | 收编前 | 收编后 |
|---|---|---|---|---|
| A `inlinePersonaHolders()` | W78 | 顶层 helper,`system:`/`content:`/`=` 后紧跟 `你是`,扫 `js/*.js` + 四个 Node 端 | 4 文件 6 处 | **4 文件 6 处(一处不改)** |
| B `census` | W79 | 全部 `['"\`]你是` 字面,含注册表 `def` 与预置专家库 | 9 文件 | **8 文件** |
| C 局部 `inlinePersonaHolders` | W81 | `system:` 值位 / 具名人设常量 / 直接 `return`,排除 `js/prompts.js` | 4 文件 5 处 | **3 文件 4 处** |

**A 一处不改是判据本来的结果,不是漏改**:它的注释里就写着有意不数"单镜审片提示词的 user 半"
(那一处既不在 `system:` 值位、也不在 `content:` 值位、也不是赋给变量,而是模板串的开头)。
本槽把该注释的措辞按实况改了半句——那一处**已收编为 `review.userSystem`**,
判据本就不数它,所以这张名单不因这次收编改动。**只改注释、不改判据**:
动判据等于替 W78 改口径,而"哪些形态算内联人设"是产品口径不是本槽的事(W85/W90 都登记过这条未做项)。

B 与 C 各减一处的落点都是 `js/wf-core.js:1` 整条从名单上消失。
B 里 `js/prompts.js:N` 那一行**随注册表条数走**(它把 `def` 也计进去),`33 → 34`;
紧跟的 `Prompts.list().filter(x => x.def.startsWith('你是')).length` 同步 `33 → 34`
(35 条键里 `sb.reviewUser` 是评审指令、不以「你是」开头)。

**SK-10 / SK-11 的「仍欠」段一个字未动**:W90 把那两段的锚点落在 `js/experts.js` 与 `js/plans.js`,
本槽收的是第三个文件,两个锚点都还在内联、反向断言仍成立。
按 W90 第 4.5 节立的判据这正是"锚点选不会被本线再收掉的那几处"该有的表现——
锚点第一次经受住了一次收编而不必翻面。

## 8. `G-13` 标记一个不摘

余量还在(见第 2 节:W88/W89/W91/W92 四条槽认领的 6 处仍内联),按 W36 立的关联索引口径:

- `Skills.gaps()` 仍 **20 键**;
- `G-13` 那六条值逐字节不变(`script.hookType,script.aiToneBan,subjects.refDiscipline,eps.structureStage,gen.videoTpl,film.rhythmInject`);
- 摘标记的判据不变——"全仓再无内联人设",且要一次改齐六条关联索引的 `gaps` 与 `note`。

两条都有用例钉住,**不预支**。

## 9. 实测与取证

### 9.1 三套件数字

| 套件 | 基线 `35695c8` | 本槽 HEAD |
|---|---|---|
| `node tests/unit.js` | 453/453 | **455/455** |
| `node tests/integration.js` | 126/126 | **126/126** |
| `node tests/cli.smoke.js` | 95/97 | **95/97** |

新增 2 条用例(取值面一条 + 源级两端取值口一条),**一条没删**:
`453 + 2 = 455`,与 live 实测相等。

### 9.2 `cli.smoke` 那 2 项:与 `master` 同名同表现

`master @ 9adcf0f` 独立 worktree 现跑 `51/53`,失败两条:

```
FAIL | 未登录 whoami → exit 3 | exit=1
FAIL | llm --json mock 链路 | undefined
```

本槽 HEAD `95/97`,失败两条**同名同表现**(总数不同是主干这些槽里 cli.smoke 用例本来就多)。
即本槽没引入新的 CLI 失败。

### 9.3 `node --check`

改动的 5 个 js 文件加 `tests/unit.js` 逐个 `node --check` 通过。

### 9.4 契约用例现取的四处文档数字

| 文档处 | 收编前 | 现取 |
|---|---|---|
| `README.md` 「N 条注册表提示词」 | 34 | **35** |
| `README.md` 「N 条主线 LLM 提示词」 | 34 | **35** |
| `README.md` 「单元测试(N 项断言)」 | 453 | **455** |
| `docs/skills-wave/README.md` 「提示词在 `js/prompts.js`(N 条)」 | 34 | **35** |

`contract` 那三条数字对账用例守着这四处(数字写错**或那句话被改写删掉**都算红)。
`README.md` 那条提示词枚举长行按注册表键序把「单镜审片提示词首句人设」插在「单镜审片人设」之后,
并在审片三步那句之后接一段该键的描述(切刀位置、两端取值口、契约半不开放的理由)。

## 10. 改了哪几处

| 文件 | 改动 |
|---|---|
| `js/prompts.js` | 紧接 `review.system` 加一条键 + 五行注释(独立键理由、逗号留在键内、契约半不开放) |
| `js/wf-core.js` | 装配口签名加第 6 参 `ov`;首句改经 `Prompts.get`;函数头注释加一句 |
| `js/review.js` | 只加一句注释(浏览器不传覆盖表的理由);委托调用一个字未改 |
| `server.js` | 两处审片调用各加 `, ov` |
| `js/skills.js` | SK-03 `prompts` 加键 + `note` 加四句(落点/两端取值口/不复用 `review.system`/`wf-core` 零内联) |
| `tests/unit.js` | 新增 2 条用例;A 名单注释改半句;B 名单去掉 `js/wf-core.js:1` 并 `33 → 34` ×2;C 名单去掉该文件并 `5 → 4` |
| `README.md` / `docs/skills-wave/README.md` | 四处数字 + 枚举与描述 + 本记账件索引行 |

**注册表与登记面之外零改动**:`mcp.js` / `cli.js` / `js/domain.js` / `js/knowledge.js` / `js/commands.js` /
`js/release-core.js` / `js/release.js` / `js/issues.js` / `js/issues-ui.js` 逐字未动;
`Skills.gaps()` / 校验面表 / 拼块 / 编排一处没碰;计费动作、发布门、审片报告结构一个字未改。

## 11. 残留

- **`G-13` 仍开着**:余量 6 处,分属 W88(`js/experts.js` ×2)、W89(`js/plans.js`)、W91(`js/agent-global.js`)、
  W92(`js/proj-planner.js` ×2)——**四条槽都已声明收编,本槽不重复做**。
  按本槽的口径,w90 基线上"仍内联且未被声明"的余量收完这一处即**为零**。
- **合并时会与 W93 撞在同一处**:两条线收的是同一个落点、同一个键名,`js/prompts.js` 与 `js/skills.js`
  会撞成一块,按并集解一次即可(这正是第 3 节要的效果)。两侧的 `def`/签名/切刀位置逐字节相同,
  `tests/unit.js` 两条用例名也相同,取任一侧都不会丢断言;三张名单的期望串**一律按合并后 live 重算**
  (W93 那侧写的是它自己分叉点上的数,在合并后一个都不成立)。
- **三张持有者名单口径仍未统一**:W85/W90 登记的这条本槽**仍没做**,理由同前——
  合并判据是产品口径不是收编槽的事。本槽给它添了一条新证据:
  A 那张名单这次**一处未改**,而 B/C 各改一处,三张名单在同一次收编上给出三个不同的数。
- **契约半仍不开放**:三维返回 JSON 的字段契约、评分标准、severity 词表、拆解规则检查仍写在装配口里,
  与 W78/W79/W82/W84 那几槽同口径(这一步计费,静默退化就是白扣)。
- **这一处的 headless 面本来就通**:与"纯浏览器链路"那几条键不同,本键有服务端对端
  (`/api/wf/smart-review`),故收编同时解决了"可覆盖"与"headless 侧也能覆盖"两件事。
