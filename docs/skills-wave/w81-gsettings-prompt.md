# W81 · `js/gsettings.js` 剩余内联人设收编:导演设定五维生成步的人设进注册表 + 全仓持有者名单新立

> 基线 `origin/cursor/w75-integration-c4a7 @ fbefd0c`,落地分支 `cursor/w81-gsettings-prompt-9f2e`。未合并 W73–W80。
> 收编的是 W76 交接里点名 `js/gsettings.js` 的**那一处**:导演设定五维 AI 生成步的人设句。
> 只碰 `js/prompts.js`(+1 条注册)、`js/gsettings.js`(1 行)、`js/skills.js`(SK-03 一条内部)、`tests/unit.js`(+1 沙箱加载器 +2 用例)、两份 README 的数字与描述。
> `js/experts.js` / `js/episodes.js` / `js/episode-util.js` / `js/persona.js` / `server.js` / `cli.js` / `mcp.js` 一行未碰,不抬发布门、不新增计费动作、未删测。

## 1. 先核条数与原文:`js/gsettings.js` 里到底有几处

W76 点名一处,但"点名"不是判据,先 grep 核:

```
$ rg -n "你是" js/gsettings.js
34:        system: '你是资深影视导演。',
322:      <label ... placeholder="你是…创作原则:…">...</label>
$ rg -n "system:" js/gsettings.js
34:        system: '你是资深影视导演。',      ← 本槽收这一处
239:            system: FORGE_SYS,
```

三处命中,只有一处是本槽的收编面,另两处逐条排除:

| 命中 | 是什么 | 为什么不收 |
|---|---|---|
| `js/gsettings.js:34` | `genDirectorSetting` 发给 LLM 的 `system` 字面 | **本槽收这一处**,原文逐字节是 `你是资深影视导演。` |
| `js/gsettings.js:322` | 专家工坊表单里 persona 输入框的 `placeholder="你是…创作原则:…"` | 是给用户看的输入提示,不发给任何模型;把它算进内联人设是造假命中 |
| `js/gsettings.js:239` | `system: FORGE_SYS` | 已经不是字面了,而 `FORGE_SYS` 的正文在 **`js/experts.js:142`**(W69 交接把它记在 experts.js 名下,口径一致)。任务口径是"不要收其它文件",故本槽不动它 |

所以本槽的收编面就是第 34 行这一行,原文 `你是资深影视导演。`。改完是:

```js
system: Prompts.get('dirset.system'),
```

`js/gsettings.js` 在 `index.html` 里排在 `js/prompts.js` 之后(21 行 vs 77 行),取值口拿得到 `Prompts`。

## 2. 新键叫什么:独立键,不与 `und.system` 复用

`und.system`(本集理解人设)的 `def` 是 `你是资深短剧导演。` —— 与本处只差**影视/短剧**两个字,是全表里最近的一条,所以必须按 W56 立的三条判据逐条对一遍再决定:

| 候选 | 字面 | 角色 | 产物落点 | 结论 |
|---|---|---|---|---|
| `und.system`(`你是资深短剧导演。`) | 差「影视/短剧」两字 | 给全剧定一次风格五维 ≠ 逐集读懂这一集 | `settings.directorSetting` ≠ `ep.understanding` | 不能复用 |
| `concept.system`(`你是资深短剧/漫剧导演,在项目开拍前做导演阐述…`) | 不同 | 都在开拍前定调,但一个出五维结构化字段、一个出成篇阐述 | 五维字段 ≠ 阐述正文 | 不能复用 |
| `light.system`(`你是影视摄影指导(DP)…`) | 不同 | DP 只管光影一维 | 逐场景光影方案 ≠ 全剧五维 | 不能复用 |

`und.system` 这一条尤其要点住:两句差两个字,合成一个键就等于让用户改一次同时改掉"全剧风格定调"与"逐集读本"两条链路的人设,而它们的产物形态(五维字段 / 六维理解)、消费点(注入所有生成提示词 / 只供本集)都不一样。故新开键:

```js
{
  /* 导演设定五维(光影/色调/情感氛围/服化道审美/表演气质)的 AI 生成步:只收人设句,
   * 返回 JSON 的五维字段名契约与风格/剧本前段的摘取仍由该步 user 半拼,不开放覆盖(改坏即整轮解析失败回退模板)。
   * 与 und.system(你是资深短剧导演。)差「影视/短剧」两字、角色与产物落点都不同,故不复用。 */
  key: 'dirset.system', name: '导演设定生成 · 系统人设', vars: [],
  def: '你是资深影视导演。',
},
```

- **命名**:`<模块/步>.<角色>System` 同族;前缀取 `dirset` 对应 `settings.directorSetting` 这个产物落点,不取 `director`——那个词在本仓已被"注入用的导演设定摘要"(`directorInject`/`directorNote`)占着,拿它当键前缀读起来会和注入面混。
- **`def` 与原串逐字节相同**,`vars` 为空 —— 该步不做变量替换(`{style}` 是在 user 半用模板字符串插的,不经 `Prompts.fill`)。
- **排在 `light.system` 之后**:注册表顺序就是「全局默认值 → 核心提示词 skill」的展示顺序,这三条(导演阐述 → 全剧光影总控 → 导演设定五维)都是开拍前的全局定调步,连着读才对得上产品流程;放在 `extract.system`(主体步)之前,因为定调在拆主体之前。

**只收人设句**,与 `agent.system` 同口径:五维返回 JSON 的字段名契约(`{"光影":"2-3句","色调":…}`)、`「${style}」风格` 的代入、剧本前段 5000 字的摘取都仍由该步 user 半拼 —— 用户把字段名改坏就是 `if (!out || !out.光影) throw`,整轮落进回退模板,不做成可覆盖变量。

## 3. 覆盖只作用于 LLM 那一路:回退模板不跟着变

这一步比前几槽多一条边界,因为它有**两条产出路径**:

```js
try  { ... API.chatJSON({ system: Prompts.get('dirset.system'), ... }) ... }   // LLM 路
catch{ return dirFallback(style); }                                            // 回退路
```

`dirFallback` 是按风格写死的三套五维文案(漫剧/动漫/写实),LLM 失败时兜住。收编只动 LLM 那一路,所以本槽专配一条断言钉住这个边界:**写了人设覆盖后再让 LLM 失败,回退文案与不写覆盖时逐字节相同**。否则将来谁顺手把覆盖也拌进回退文案,用户改一句人设就会改掉"离线时的默认导演设定",而那不是提示词面。

## 4. 取值口:浏览器一处,不存在第二端

该步是纯浏览器链路(偏好学习页专家工坊 / 分集工作区导演设定卡片,另有精细模式解析流程经 `window.genDirectorSetting` 调同一个函数),`server.js` / `cli.js` 里没有对端。所以:

- 取值口只有 `Prompts.get('dirset.system')` 一处,浏览器隐式读 `Store.state.settings.promptOverrides`(与 W71 那四条、W51 那三条同形)。
- 断言写成**不许长出第二端**:`server.js` / `cli.js` 里不得出现该步的 user 半锚点(`风格的短剧制定导演设定`),否则就是有人在服务端另拼了一份。
- 收编解决的是"**可覆盖**",不解决"可 headless" —— 如实写进 README 与本件,不含糊成"该步已双端单源"。

## 5. 全仓持有者名单:基线没有 `inlinePersonaHolders`,本槽新立

先核基线:`rg inlinePersonaHolders` 全仓**零命中** —— 前几槽的收严都是"逐句查这一句的持有者恰好只剩注册表"(W69/W71 那种 `holders(def) === 'js/prompts.js'`),没有一张"G-13 还欠哪些文件、各欠几处"的名单。故本槽按任务口径**新立**一份,精确到 `文件:处数`,不是只报一个总数:

```js
const RE = /(?:system:\s*|return\s*|(?:const|let|var)\s+[A-Za-z_$][\w$]*\s*=\s*)(?:'|`)你是/g;
// 期望值(收编后):
'js/agent-global.js:1, js/agent-ops.js:2, js/beatboard.js:1, js/editors.js:1, js/episode-util.js:3, js/episodes.js:1, '
+ 'js/experts.js:2, js/persona.js:2, js/plans.js:1, js/proj-shell.js:1, js/proj-upload.js:1, js/role-editor.js:1, '
+ 'js/sb-board.js:2, js/sb-views.js:1, js/wf-core.js:1'   // 15 文件 21 处
```

### 5.1 判据写死在用例里,不靠人工点数

**内联人设字面** = 以 `你是` 开头、且直接落在下面三个位置之一的字面,注册表 `js/prompts.js` 自身是唯一来源不计入:

1. `system:` 值位置(`system: '你是…'` / `system: \`你是…`);
2. 赋给具名常量(`const FORGE_SYS = \`你是…`、`const sys = \`你是…`),那种常量随后被当 `system` 用;
3. 由装配函数直接 `return`(`return \`你是…`,如 `WfCore.buildReviewPrompt`)。

扫描面是 `server.js` / `cli.js` / `mcp.js` / `index.html` 加 `js/*.js` 全体 —— 与前几槽的 `holders()` 同一张文件表。

**有意不在判据内的两类**,在用例注释里写明归属,不混进这个数:

- `js/experts-data.js` 的 16 条预置专家 `persona:` —— 那是产品数据(用户雇佣时改得到、解雇即恢复),不是写死在调用点的人设;把它算进来这个数会从 21 跳到 37,而那 16 条一条也不是 G-13 治的东西。
- `index.html` / `js/gsettings.js:322` 里的输入框 `placeholder` —— 不发给模型。用例里另有一条 `RE.test(gs.replace(/placeholder="[^"]*"/g,''))` 把这层剥掉再查,证明 `js/gsettings.js` 剩下的那句纯粹是 UI 文案。

### 5.2 这个 21 与 W71 记的 15 不矛盾:口径变宽了,不是长出新的

W71 那句「全仓内联人设现存 15 处」用的是更窄的口径 —— 只数 `system: '你是` 这一种**单引号直接字面**。本槽的名单把另两种形态也收进来了,所以数字从 15 变成 21(收编前 22),**多出来的 6 处是一直都在、被旧 grep 漏掉的**,不是本槽或别的槽新写的:

| 旧口径漏掉的 | 形态 |
|---|---|
| `js/agent-global.js:74` 意图路由器 | `const sys = \`你是…` |
| `js/agent-ops.js:128` 执行核验器 | `system: \`你是…`(模板字面) |
| `js/plans.js:133` 制作计划器 | 同上 |
| `js/role-editor.js:34` 设定师 | 同上 |
| `js/experts.js:98` 专家人设进化器 | 同上 |
| `js/wf-core.js:650` 视频审片组 | `return \`你是…` |

`js/experts.js` 因此记 2 处(`FORGE_SYS` 元智能体 + 进化器),而 W69 交接把它记成 1 处 —— 同样是口径差,不是有人加了一份。名单的价值就在这里:换成机械扫描之后,谁用哪种写法内联都躲不过去,不必再指望下一个人 grep 时想全三种形态。

### 5.3 本槽的落点:`js/gsettings.js` 整条从名单上消失

收编前名单里有 `js/gsettings.js:1`,收编后**整条不在了**(不是减到 0 还挂着)。用例专配一条:

```js
assert(!inlinePersonaHolders.some(x => x.startsWith('js/gsettings.js')),
  'js/gsettings.js 应已零内联人设(工坊那份人设字面在 js/experts.js,不记在本文件名下)');
```

这条与总数那条是有意重叠的:总数看的是"全仓账对不对",这条看的是"本槽那一处真的收掉了"。将来谁在 `js/gsettings.js` 里新写一处内联人设,两条一起红。

## 6. 记账:SK-03 的 `prompts` 与 `note`

新键登记在 **SK-03 `core.personaCtx`** 名下,与 W71 那四条、W51 那三条同一个宿主(那一条就是"人设键"的索引宿主):

```js
prompts: [..., 'narration.system', 'reading.system', 'concept.system', 'light.system', 'dirset.system'],
```

`note` 在"已落地"那半补三句(**不动「仍欠」段**——那段的 `ops 协议` / `不开放覆盖` 两个锚点由 infra 记账用例钉着,写进那半会改掉别人的断言面):

```
导演设定五维的 AI 生成步(js/gsettings.js 的 genDirectorSetting)同形收编为 dirset.system,
取值口经 Prompts.get 隐式读覆盖表、与前四条同口径(纯浏览器链路,只解决可覆盖);
该键不与 und.system 复用——两句差「影视/短剧」两字,角色与产物落点都不同;
js/gsettings.js 至此零内联人设(工坊元智能体那份人设字面在 js/experts.js,不在本文件名下)。
```

三处要点:

1. **`prompts` 登记是硬要求**:契约测试「`Prompts` 全部 key 应被 skill 索引引用」会数,摘掉登记当场红;`Skills.validate({ Prompts })` 也替它守着键名。
2. **不复用的理由写进 `note`**:下一个人看到 `dirset.system` 与 `und.system` 只差两个字,第一反应就是"这俩为什么不合并"。理由写在记账里,并由源级用例的一条断言(`note` 须含 `und.system` 与 `不与`)钉住,不许被顺手删掉。
3. **`gaps` 一字未动**:`G-13` 治的是"大量模块内联提示词未进注册表",名单上还有 21 处,缺口没闭合。按 W36 立的关联索引口径(落地一面不摘标记),`Skills.gaps()` 的键数(20)与 `G-13` 的六条值逐字节不变,并有断言钉住。

**没顺手动的**:SK-10 / SK-11 的 `note`(它们的仍欠段点名的是 `js/episodes.js` 与 `js/episode-util.js`,本槽一处没碰,那些锚点仍成立)、`js/experts.js` 那两处、SK-03 的 `pending`(本就为空)/`gaps`/`kinds`/`cmds`。

## 7. 用例改动(新增 2 条 + 1 个沙箱加载器,未删测)

两条都落在 `contract` 套件,紧跟 W71 剧本四步那两条(同为"收编内联人设"的行为面 + 源级配对):

| 用例 | 钉住的事 |
|---|---|
| **新增** 行为面 `导演设定生成人设:经 Prompts.get(dirset.system) 取值,缺省逐字节等于收编前的内联字面` | ① 缺省 `Prompts.get` 逐字节等于 `你是资深影视导演。`;② 注册表条目形状(无变量、名字带「导演设定生成」与「系统人设」);③ 该字面恰好命中注册表一条(同 `def` 开两个键即红);④ 沙箱**真跑** `window.genDirectorSetting`(截获 `system`/`user`),该步恰好发一次 LLM 且真实发出的 `system` 就是缺省人设句;⑤ 返回形状是 `style` + 五维(维名取 `window.DIR_DIMS` 单源);⑥ 写覆盖后 `system` 跟随、**`user` 半逐字节不变**、返回解析口径不变;⑦ 五维 JSON 字段契约不在注册表里;⑧ 不与 `und.system`/`concept.system`/`light.system`/`sb.reviewSystem`/`review.finalSystem` 同字面;⑨ **LLM 失败时回退模板文案不随人设覆盖变动**(§3 那条边界) |
| **新增** 源级 `导演设定生成人设(源级):js/gsettings.js 零内联,全仓内联人设持有者名单精确到文件:处数` | ① 取值口与该步 user 半锚点配对(键挪到别的步上即红);② 全仓该字面的持有者恰好只有 `js/prompts.js`;③ `server.js`/`cli.js` 不得长出第二端;④ **`inlinePersonaHolders` 精确串**(15 文件 21 处)+ 总处数 21;⑤ `js/gsettings.js` 整条不在名单上,且剥掉 `placeholder` 后零内联;⑥ SK-03 登记新键、`note` 写明已收编 + 零内联 + 不复用 `und.system` 的理由;⑦ `gaps()` 键数 20 与 `G-13` 六条值逐字节固定;⑧ `Skills.validate({ Prompts })` 通过 |

新增沙箱加载器 `loadGsettings(ov, fail)` 与 `loadPersona` 同形:`prompts.js → gsettings.js` 按 `index.html` 顺序加载,`API.chatJSON` 截获 `system`/`user`,`ov` 写进 `Store.state.settings.promptOverrides`,`fail` 参数让上游抛错以走回退路。加载期只额外需要一个 `Voice.NARRATOR_PRESETS`(顶层 `const VOICE_LIST` 取它,`voice.js` 在 `index.html` 中更前);`Experts` 是函数内解构、`U.openModal` 是空桩即可,所以**不必造 DOM**——这一步能真跑,是因为 `window.genDirectorSetting` 本来就为精细模式解析流程挂在了 window 上(W71 那四步的 handler 压在 DOM 闭包里,只能配对正则,本槽比它多了行为面这一层)。

## 8. 变异实测

七条变异逐一施加、跑 `node tests/unit.js` 后复原(复原后 430/430):

| 变异 | 实测行为 | 转红 |
|---|---|---|
| 1 `js/gsettings.js` 改回内联字面 | 收编退回收编之前 | 2 条(行为面 + 源级) |
| 2 取值口改成 `Prompts.get(key, {})`(不读覆盖表) | 进表了但用户改不到 | 2 条(行为面看覆盖跟不跟随,源级看取值口写法——一处失守两处都拦得住,是有意的重叠) |
| 3 注册表 `def` 改一个字(影视→短剧) | 缺省不再逐字节相同,且与 `und.system` 撞成同字面 | 1 条(行为面,两处断言同时报) |
| 4 摘掉 SK-03 的 `dirset.system` 登记 | 新键不进索引、记账对不上账 | 2 条(四类单源键全覆盖 + 源级) |
| 5 名单期望串里把 `js/experts.js:2` 写成 `:1`(照 W69 交接的旧口径) | 名单与机械扫描不符 | 1 条(源级) |
| 6 把回退文案也拌上覆盖(`dirFallback` 里插 `Prompts.get`) | 改一句人设改掉离线默认设定 | 1 条(行为面 §3 那条) |
| 7 **反向**:把 `js/experts.js` 的 `FORGE_SYS` 也收编 | 名单里那一处已消失而期望串还写着 | 1 条(源级) |

变异 5 与 7 是这张名单的两向守卫:数少了(有人偷偷收编不改账)与数多了(有人新写内联)都拦得住。变异 3 之所以一条用例里两处断言同时报,是有意的重叠 —— 逐字节缺省与"不与 `und.system` 同字面"分别看的是两件事,撞到一起说明这两条都在生效。

## 9. 复核方式

```
git checkout cursor/w81-gsettings-prompt-9f2e
node --check js/prompts.js js/gsettings.js js/skills.js tests/unit.js   # 通过
node tests/unit.js          # 430/430 PASS(基线 428,新增 2 条用例)
node tests/unit.js contract # 62/62 PASS(基线 60)
node tests/integration.js   # 126/126 PASS(与基线同:本槽未碰 server.js 与任何端点)
node tests/cli.smoke.js     # 95/97;两处失败「未登录 whoami」「llm --json mock 链路」与 master 同名(master 侧实测 51/53,同两条)
node -e "const P=require('./js/prompts.js'),S=require('./js/skills.js');
console.log(P.list().length, JSON.stringify(P.get('dirset.system')));
console.log(S.byId('core.personaCtx').prompts.slice(-1)[0], '|', Object.keys(S.gaps()).length);"
# 20 "你是资深影视导演。"
# dirset.system | 20
```

`node tests/e2e.js` 按仓库纪律未跑(需用户明确要求)。本槽不含合并、未开 PR。

## 10. 与并行分支的关系

W73–W80 未合并。改动面:`js/prompts.js`(在 `light.system` 之后插入 1 条)、`js/gsettings.js`(第 34 行 1 行)、`js/skills.js`(SK-03 的 `prompts` 尾部加一项 + `note` 已落地那半加三句)、`tests/unit.js`(+1 沙箱加载器 + 2 条用例)、`README.md`(三处数字/描述)、`docs/skills-wave/README.md`(提示词条数 + 索引行 + W71 那句的口径注)。

- **`js/prompts.js`**:本槽在 `light.system` 之后插入一条。若并行槽也往注册表加键,两块都留;注意 W75 记的那个坑 —— 同插入点两侧各加一块时**块尾那一行是共用的**,机械两留会语法断,合完先跑 `node --check`。README 的条数按合入后 `Prompts.list().length` 现取重算(`contract` 的数字对账会先红)。
- **`js/skills.js` 的 SK-03**:并行槽若也往 `prompts` 数组尾部加键,取**并集**;`note` 两侧若都在"已落地"那半追加,两段都留(锚点不冲突)。**「仍欠」段本槽一字未动**,所以不存在 W75 那种"前一槽点名的正是后一槽要收的"失效链。
- **`inlinePersonaHolders` 那条断言**:这是最可能冲突的一处 —— 任何并行槽收编任何一处内联人设,这张名单都得跟着减。合并时**不要照抄任一侧的期望串**,按合入后现跑一次那段扫描重算(把 §5 那段 `RE` 直接 `node -e` 跑出来贴回去),两侧的落点断言(各自那个"某文件整条消失")都保留。
- **`README.md` / `docs/skills-wave/README.md`**:提示词条数、单测数、索引行一律按合入后实跑重算,不要照抄任一侧。

## 11. 交接

1. **G-13 仍欠,缺口开着**:名单现为 15 文件 21 处(见 §5),按机械判据现取。余量集中在:`js/episode-util.js` 3 处(剧本摘要通读/汇总/集纲的策划人设,同字面三处,按 W56 三条判据大概率复用同一个键)、`js/persona.js` 2 处(配音导演单个/批量推荐音色,同字面两处,同上)、`js/sb-board.js` 2 处(编剧/分镜师)、`js/agent-ops.js` 2 处(会话纪要整理器 / 执行核验器)、`js/experts.js` 2 处(元智能体 `FORGE_SYS` / 专家人设进化器,后者带 `${bt}` 板块变量,收编时要决定变量走 `Prompts.fill` 还是留在 user 半),其余九个文件各 1 处。
2. **摘 `G-13` 标记的时机不变**:判据是"名单归空",且要一次改齐六条关联索引的 `gaps` 与 `note`,不是谁的一半好了就摘谁。本槽不预支这个动作。
3. **名单是从此以后的账**:再收编任何一处,先跑 §5 那段扫描拿到新串再改期望值,不要手改数字 —— 期望串与机械扫描双向对齐,手改一边就是把账做平而不是做对。
4. **`js/gsettings.js` 从此零内联**:再往这个文件加 LLM 调用点时,人设句直接开新键;`placeholder` 那句是 UI 文案、`FORGE_SYS` 正文在 `js/experts.js`,两者都不在本文件名下。
