# W88 · 专家工坊两步人设收进注册表(锻造器 + 进化器)

> 基线 `cursor/w80-integration-5369 @ 4c45f89`(四条收编槽并线之后的头部),落地分支 `cursor/w88-experts-forge-prompt-a3f7`。
> 本槽只做一件事:把 `js/experts.js` 里**专家工坊**那两处写死的人设半收进 `js/prompts.js` 注册表的**两条独立键**,取值口就地改经 `Prompts.get`。
> 不改计费(工坊生成仍是 `Tasks.run` 1 分 `llm.skill`、自进化仍是 `Tasks.start`+`charge` 展开式 1 分 `llm.evolve`,失败退费与"无新增条款不退费"两条口径一字未动)、不改 JSON 契约、**不碰 `js/experts-data.js` 预置 persona 库**、未删测(新增 2 条用例,既有用例一条未删、一句未改)。W78–W87 一律未合并。

## 1. grep 核实:这个文件里有几处人设、本槽收哪几处

任务点名的是 `FORGE_SYS`,并注明"gsettings 只引用常量"。先按仓库实况把这个文件的人设面 grep 全:

```
$ grep -n "你是" js/experts.js
98:        system: `你是专家人设进化器。根据用户与创作助手在「${bt}」板块的历史协作记忆(…),为该板块的指定专家蒸馏「进化条款」。只返回 JSON {"clauses":…}…每条≤40字。`,
142:  const FORGE_SYS = `你是「专家 skill 生成器」(元智能体)。用户会描述想要的短剧创作专家(…),你为其生成完整专家 skill。只返回严格 JSON:
```

**两处,都属本槽口径**——任务写的是"锻造/进化器这类专家工坊人设":

| 处 | 角色 | 谁在消费 | W80 5.4 那张余量表算不算它 |
|---|---|---|---|
| `FORGE_SYS`(第 142 行) | 专家 skill 生成器(锻造器) | `js/gsettings.js` 工坊页 `sendForge`,`system: FORGE_SYS` | **不算**——它是 `const FORGE_SYS = \`你是`,不匹配 `system: '你是` 那个计数口径 |
| `evolveExpert` 的蒸馏 system(第 98 行) | 专家人设进化器 | 就在本文件 `evolveExpert` 内 | 算,就是表里 `js/experts.js` 那 1 处 |

任务那句括号注("gsettings 只引用常量")在这里是**落点判据**:人设的持有者是 `experts.js`,`gsettings.js` 只拿到一个名字。所以取值口应当留在 `experts.js`,**消费侧一行不改**——收编不该把一个"引用常量"的调用点改成"调注册表",否则工坊页就多知道了一件它不需要知道的事。

`js/experts-data.js` 的 16 位预置专家各自的 `persona` **一格未动**。那是**专家数据**,不是工坊的提示词:它按专家条目持久化、随雇佣写进 `directorSetting`、双端经 `ExpertsData.allOf` 消费,收进注册表等于把 16 条数据塞进一张 27 条的提示词表,并且用户本来就能在「我的专家库」里改自定义专家的 persona。本槽为此留了两条反向断言(第 7 节变异 15)。

**不收其它文件**:`js/agent-ops.js` 两处、`js/sb-views.js`、`js/beatboard.js`、`js/editors.js`、`js/gsettings.js`、`js/plans.js`、`js/proj-shell.js`、`js/proj-upload.js`、`js/role-editor.js` 各一处照旧内联,不在本槽口径内(它们分别是别的槽的事,`js/beatboard.js` 与 `js/editors.js` 还压着 W78/W79 两条未合的远端 tip)。

## 2. 结果一句话

注册表由 25 条推到 **27 条**,新增两条无变量条目:

```js
// js/prompts.js(排在 agent.previsSystem 之后,即主线各步与 Agent 各模式之后)
{ key: 'forge.system',       name: '专家工坊锻造器 · 系统人设',   vars: [], def: '你是「专家 skill 生成器」(元智能体)。用户会描述想要的短剧创作专家(导演/编剧/摄像/策划等,含题材、风格、擅长点),你为其生成完整专家 skill。' },
{ key: 'forge.evolveSystem', name: '专家自进化进化器 · 系统人设', vars: [], def: '你是专家人设进化器。' },
```

取值口两处,都在 `js/experts.js`:

```js
// 锻造器:人设句过注册表,契约半留在就地常量;导出成 getter,消费侧仍只见一个常量
const FORGE_CONTRACT = `只返回严格 JSON:
{"name":…,"persona":…,"dims":{…},"tpl":{…}}
规则:kind=style …重新输出完整 JSON。`;
window.Experts = {
  EXPERTS, customExperts, hireExpert, delCustomExpert, evolveExpert, toLab, normExpertDraft,
  get FORGE_SYS() { return Prompts.get('forge.system') + FORGE_CONTRACT; },
};

// 进化器:就地一处
system: Prompts.get('forge.evolveSystem') + `根据用户与创作助手在「${bt}」板块的历史协作记忆…`,
```

**缺省逐字节零变化**(两处都实测对账过整串,见第 5 节),写覆盖时该步跟随、另一步与契约半都不动。`js/gsettings.js` **一行未改**(仍是 `system: FORGE_SYS`);`index.html` 里 `js/prompts.js`(第 21 行)本就早于 `js/experts.js`(第 79 行)加载,加载序无需调整。

回归:`unit 437/437`(基线 435,新增 2 条)、`integration 126/126`、`cli.smoke 95/97`(两处失败与 `master` 同名同表现,见第 8 节)。

改动(`git diff --numstat` 对基线):`js/prompts.js` +13、`js/experts.js` +11−4、`js/skills.js` +17−2、`tests/unit.js` +135、`README.md` +3−3、`docs/skills-wave/README.md` +1−1,外加本记账件与它那行索引。

## 3. 为什么是两条键,而不是一条

两处都在「专家工坊」这一个页面上,合成一条带 `{mode}` 变量的键看着更省。判据仍是 W51/W76 那条:**合成的前提是角色同一**。这两个角色不同,而且是最不像的那一种不同——

| | 锻造器 `forge.system` | 进化器 `forge.evolveSystem` |
|---|---|---|
| 输入 | 一句自然语言描述("想要一个重生复仇题材的导演") | 一位**已存在**的专家 + 他在生效板块的协作记忆 |
| 动作 | **无中生有**:铸出一整套 name/ico/role/kind/style/tags/desc/persona/dims/tpl | **就地改写**:蒸馏 ≤4 条进化条款追加进已有 persona |
| 产物落点 | `normExpertDraft` → `Store.state.customExperts` 新增一位 | 原专家对象的 `persona` 与 `evolutions` 原地改 |
| 计费标签 | `llm.skill` | `llm.evolve` |
| 多轮 | 带最近 10 条会话历史改稿 | 单次,无会话 |

把它们并成一个带变量的键,等于让用户改一处同时改掉"怎么铸新专家"和"怎么改老专家"两件事;分成两条,「全局默认值」页上改哪一步就只影响那一步(第 7 节的串台断言)。

也不复用既有键:注册表里 25 条既有 `def` 没有一条与这两句同字面(有一条正向断言逐条比对),**没有同字面就谈不上复用**。尤其不与 `agent.*` 那四条合并——那四条是"导演助手"在跑主线,这两条是在造/改跑主线的那个专家,层级不同。

两处 `def` 也不像 `voice.recommendSystem`/`voice.recommendBatchSystem` 那样"字面相同但仍拆两键":这里连字面都不同,拆键是显然的。

## 4. 键名与注册表位置

- **键名前缀 `forge.`**:取产品里那个页面自己的名字(「🧪 专家工坊」,`gsettings.js` 里 `mode = 'forge'`、`renderForge`/`sendForge`/`forgeDraft`/`forgeChat` 一整套都用这个词)。不取 `expert.`——那个词在本仓已经指**专家条目**(`ExpertsData.EXPERTS`、`hiredExpert`、`expertBoards`),用它当提示词前缀会让人以为这条键跟某位专家的 persona 有关。
- **位置排在最后**(`agent.previsSystem` 之后)。注册表既有的排法是"按产品流程":主线各步(拆集 → 剧本四步 → 主体 → 音色 → 摘要 → 分镜脚本 → 事件图谱 → 智能分镜 → 审片 → 成片)之后接 Agent 四种运行模式。工坊两步**不在主线某一步上**——它们作用在「专家」这个对象上,产物要经"雇佣"才进主线。放进主线中间任何位置都得回答"它在哪两步之间",而正确答案是"不在里面"。有一条断言钉住两键相邻、锻造器在前、且都在 `agent.previsSystem` 之后。

## 5. 缺省逐字节:两处各怎么对账,以及为什么用 getter

### 5.1 锻造器:人设句与契约半原在同一行

原字面第 142 行是这样断的:

```
…你为其生成完整专家 skill。只返回严格 JSON:
```

人设句结束与契约半开头**同在一行、中间没有分隔符**。所以取值时是**直接相接**、不补 `\n`:

```js
Prompts.get('forge.system') + FORGE_CONTRACT
```

这一点写进了源码注释,并由一条断言钉住(变异 3 会红)。代价是:用户把覆盖写成不以句号收尾的短句时,读起来会与 `只返回严格 JSON:` 挤在一起。这是**有意选的**——补一个 `\n` 会让所有没改过提示词的用户的缺省提示词变一个字节,而"缺省逐字节不变"是本槽的硬约束。

整串对账不靠人眼,落地时直接拿基线里那一整串比:

```
$ node -e "const P=require('./js/prompts.js');
const old=require('child_process').execSync('git show origin/cursor/w80-integration-5369:js/experts.js').toString();
const before=old.match(/const FORGE_SYS = \`([\s\S]*?)\`;/)[1];
const contract=require('fs').readFileSync('js/experts.js','utf8').match(/const FORGE_CONTRACT = \`([\s\S]*?)\`;/)[1];
console.log(P.get('forge.system')+contract===before);"
# true   (575 → 575 字符)
```

用例里则按 W49 `agent.system` 那条同形的写法,把期望的整串**在测试里拼全**(人设句常量 + 契约半字面),这样"契约半被人动了一个字"也会红,而不只是"人设句被动了"。

### 5.2 为什么导出成 getter,而不是模块级常量

原来 `FORGE_SYS` 是模块顶层 `const`,在 `experts.js` 加载那一刻求值。若照原样写成

```js
const FORGE_SYS = Prompts.get('forge.system') + FORGE_CONTRACT;   // ✗
```

覆盖表就被**冻结在页面加载那一刻**:用户在「偏好学习 → 全局默认值」改完提示词、切回「🧪 专家工坊」tab 发一条,吃到的还是旧值——非要刷新整页才生效。这不是"能不能覆盖"的问题,是覆盖看着生效了其实没生效,比不收编更糟。

改成 getter 之后,求值点落在 `Views.gsettings` 里那句 `const { …, FORGE_SYS, … } = window.Experts;`,即**每次页面渲染**取一次当次生效值;而消费侧 `system: FORGE_SYS` 那一行完全不知道这件事发生了。有一条断言直接施加"改回加载期常量"这个变异并要求转红(变异 16)。

### 5.3 进化器:模板变量在契约半里

第 98 行那串带两处 `${bt}`(生效板块名),但两处**都在人设句之后**——人设句就是 `你是专家人设进化器。` 这七个字,不含变量。所以这条键的 `vars` 是空数组,`{bt}` 不做成注册表变量:板块名是 `WfCore.expertBoards` 现推的运行时值,做成用户可填的变量只会让它填错。

对账走**真跑**:在 `loadExperts()` 沙箱里摆好"cx_1 被雇在分镜板块 + 分镜板块有一条沉淀",截获 `API.chatJSON` 的 `req.system`,与收编前那一整串(把 `${bt}` 代成 `分镜`)逐字节比。

### 5.4 缺省不变还靠这几层

1. **注册表层**:两句 `def` 与字面直接比对;各要求在 `Prompts.list()` 里**恰好命中一条**(反向撞车转红)。
2. **消费层(真跑)**:锻造器读 `Experts.FORGE_SYS`、进化器跑 `evolveExpert` 截获 `system`,两处都对账整串,并做覆盖矩阵(改 A 时 B 不动、改 B 时 A 不动)。
3. **源级配对**:进化器取值口必须与该步 user 侧锚点 `为该板块的指定专家蒸馏「进化条款」` 在 400 字符内配对——键挪到别处或这一步改走别的键当场红。
4. **全仓唯一持有者**:两句字面扫 `server.js`/`cli.js`/`mcp.js`/`index.html` 与全部 `js/*.js`,必须**恰好只剩 `js/prompts.js`**(在 `gsettings.js` 抄第二份即红)。
5. **不冒充双端**:两步都只在浏览器。断言正向要求 `server.js`/`cli.js`/`mcp.js` 不出现这两步的契约半锚点。收编解决的是**可覆盖**,不是可 headless——headless 侧根本没有"造一位专家"和"点自进化"这两个动作,记账里如实这么写。

`Prompts.get` 对未覆盖键返回 `def`,覆盖表为空对象/`undefined` 同样落 `def`,故没改过提示词的用户看到的两处 system 半与本槽之前逐字节一样。工坊的多轮改稿历史(`forgeChat.slice(-10)`)、`normExpertDraft` 的补齐规则、`evolveExpert` 的板块过滤/条款去重/`【进化条款 · 日期】` 段合并/退费三条分支全在取值口之外,一行未碰。

## 6. 契约半不开放:两处各留了什么在外面

| | 留在调用点、不进注册表 | 改坏会怎样 |
|---|---|---|
| 锻造器 | 严格 JSON 的十个字段(`name`/`ico`/`role`/`kind`/`style`/`tags`/`desc`/`persona`/`dims` 五维/`tpl` 三件套)与 `kind=style/function` 两种形态的规则、多轮改稿要求 | `sendForge` 拿到回包先查 `!out.name \|\| !out.persona` 就抛,`normExpertDraft` 再按字段名逐个取——字段名改一个字这一轮生成整轮失败(已扣的 1 分走失败退费) |
| 进化器 | `只返回 JSON {"clauses":[…]}(1-4条)`、`每条≤40字`、"与该板块职责相关/不重复已有条款" | 消费侧是 `Array.isArray(out.clauses)` 取值再本地去重截 4;字段名改坏则恒为空数组,落到"无新增条款"那条分支——而那条分支按十轮的交付边界**不退费**,用户改坏一个字就是每次点都白扣 1 分 |

第二行这一条是本槽最该留在外面的:别处的契约半改坏是"报错 + 退费",这一处改坏是**静默白扣**。有一条断言钉住 `"clauses"`、`"persona"`、`"dims"`、`"tpl"`、`tplImage`、`≤40字` 六个字面一个都不出现在注册表任何 `def` 里。

## 7. 记账:两条键各归各的宿主

不都挂 SK-03。按 W77 立的口径——"有更具体的宿主就归它"——两条各有自己的家:

| 键 | 宿主 | 为什么是它 | 那条的仍欠 |
|---|---|---|---|
| `forge.system` | **SK-02** `core.expertSkillRef`(专家条目挂能力引用) | 工坊是**自定义专家条目的铸造口**;锻造器那份严格 JSON 就是专家条目的形状 | 字段面/改稿规则不开放覆盖;**且那份字段面里同样没有 `skills[]`**——工坊铸出的专家从出生起就挂不上能力引用,与该条自己的 `G-09`(专家条目侧 `skills[]` 正向字段)是同一个缺口的两头 |
| `forge.evolveSystem` | **SK-26** `review.memoryFeedback`(审片结论按板块回流专家) | `evolveExpert` 的记账一直在这条名下(W65 的板块过滤、`G-11`)——蒸馏用什么口径提炼,是这条"回流"链的最后一段 | `G-11` 原样:见下 |

SK-02 因此第一次有了 `prompts` 字段;SK-03 一字未动(它的 `prompts` 与 `note` 都没碰,那条现在管着 22 条键)。

**`G-11` 如实写、标记不摘**。SK-26 的仍欠段照旧点着两处——蒸馏仍是**人手动作**(要人在专家库点「从使用记录进化」)、`evolveExpert` **只对自定义专家开放**——并新补一句把界线划清:

> 人设句可覆盖不改这一面——改得到提炼口径,改不出自动触发。

写这一句是因为"人设句进注册表"很容易被下一个人读成"自进化这条通了"。它没通:本槽动的是那一次调用**用什么口径**提炼,没动**谁来触发**、**触发几次**、**预置专家能不能用**。`Skills.gaps()` 仍 20 键、`G-11` 仍投影 `review.memoryFeedback`、`G-13` 那六条值逐字节不变(既有断言现成钉着,另有本槽一条复查)。

`G-13` 为什么不动投影:本槽收的两处**不在 `G-13` 的关联索引上**(那六条挂的是 SK-06/SK-10/SK-11/SK-14/SK-21/SK-27),按 W36 立的关联索引口径,收编一处不摘标记、也不改投影。

## 8. 用例(新增 2 条,未删测)与十七条变异实测

| 用例 | 钉住的事 |
|---|---|
| **新增** `专家工坊两步人设`(contract 套件,紧接事件图谱源级那条之后) | 两句缺省逐字节 + 条目形态(无变量、条目名点名是哪一步)+ 各自恰好命中注册表一条 + 两句互不相同且与 25 条既有键都不同字面 + 键序(两键相邻、锻造器在前、都在 Agent 各模式之后)+ 契约半六个字面不进注册表 + **锻造器真跑**(`Experts.FORGE_SYS` 与收编前整串逐字节、覆盖只换首句、取值口不是加载期冻结)+ **进化器真跑**(经 `evolveExpert` 截获 `system`,缺省整串逐字节 + 覆盖只换首句 + 两键互不串台) |
| **新增** `专家工坊两步人设(源级)` | 两处取值口与各步锚点配对 + `js/experts.js` 零内联且 `const FORGE_SYS =` 整串常量不复存在 + `gsettings.js` 仍只引用常量且自己不持有人设句 + 全仓持有者名单只剩 `js/prompts.js` + **`experts-data.js` 预置 persona 库未被收编** + `server/cli/mcp` 不长第二个消费点 + SK-02/SK-26 登记且新账写在「已落地」那半 + `G-11` 仍欠段如实 + SK-02 仍欠段写明 `skills[]` + `gaps()` 投影与键数不变 + `Skills.validate` 通过 |

十七条变异逐一实测(每条单独施加、跑 `node tests/unit.js` 后复原):

| 变异 | 实测行为 | 转红 |
|---|---|---|
| 1 `forge.system` 的 `def` 改一字 | 缺省提示词变了 | 1 条 |
| 2 `forge.evolveSystem` 的 `def` 改一字 | 同上 | 1 条 |
| 3 锻造器取值口退回内联整串 | 用户覆盖不再跟随这一步 | 2 条 |
| 4 进化器取值口退回内联字面 | 同上 | 2 条 |
| 5 SK-02 漏登记 `forge.system` | 新键脱离 skill 索引 | 2 条(既有的"全部 key 应被索引引用" + 新增那条) |
| 6 SK-26 漏登记 `forge.evolveSystem` | 同上 | 2 条 |
| 7 契约半塞进 `forge.system` 的 `def` | 契约半变成可覆盖 | 1 条 |
| 8 在 `gsettings.js` 另抄一份人设句 | 出现第二处字面来源 | 1 条(全仓持有者名单) |
| 9 两键合成:进化器改指 `forge.system` | 两个角色被并成一个 | 2 条 |
| 10 `forge.system` 的 `def` 改成与 `und.system` 同字面 | 等于复用了别人的键 | 1 条 |
| 11 反向撞车:`und.system` 的 `def` 改成进化器人设句 | 同一句人设在表里两条 | 1 条 |
| 12 键序:两键整体挪到 `agent.system` 之前 | 工坊被排进 Agent 各模式中间 | 1 条 |
| 13 SK-26 仍欠段删掉「人手动作」 | `G-11` 被写成不欠了 | 2 条 |
| 14 SK-02 仍欠段删掉 `skills[]` 那句 | 工坊与 `G-09` 的联系丢了 | 1 条 |
| 15 预置 persona 库也改成取值口 | 越界收了 `experts-data.js` | 9 条 |
| 16 取值口冻结成加载期常量 | 覆盖看着生效其实要刷新整页 | 2 条 |
| 17 `README.md` 提示词条数不同步(27 → 26) | 文档数字失真 | 1 条 |

两条值得记下来:

- **变异 14 第一版没咬住**。原断言写的是 `note.includes('skills[]')`,而 SK-02 的**第一句**(`专家条目侧的 skills[] 正向字段待 G-09`)本来就有这个字面——把新加的那句整段删掉仍全绿。这与 W39 修的那个洞同形:**锚点落在"已落地"那半就能蒙过去**。改成"取「仍欠」之后那段,段内要同时有 `skills[]` 与 `铸出`"之后才转红。写记账断言时,先问一句"这个字面在改动之前就有没有"。
- **变异 15 转 9 条**是越界的正确代价:一旦给 `experts-data.js` 的 persona 套上取值口,雇佣三件套、`personaFor` 双端逐字节、板块专家注入那一串全线红——预置 persona 是数据,不是提示词,这条界线不需要靠记账维持,现有用例自己就守着。

## 9. 复核方式

```
git checkout cursor/w88-experts-forge-prompt-a3f7
node --check js/prompts.js && node --check js/experts.js && node --check js/skills.js && node --check tests/unit.js
node tests/unit.js            # 437/437 PASS
node tests/unit.js contract    # 含新增两条与 README 数字对账
node tests/unit.js experts     # 既有 experts 套件(evolveExpert 计费五件套/板块过滤四条)一条未动
node tests/integration.js     # 126/126 PASS
node tests/cli.smoke.js       # 95/97;两处失败「未登录 whoami → exit 3」「llm --json mock 链路」
                              # 在 master @ 9adcf0f 上现跑 51/53、失败两条同名同表现(已实测对照)
```

覆盖真到得了这两步(浏览器隐式读 `Store` 覆盖表那条路,直接在 Node 里摆出浏览器全局验):

```
node -e "const fs=require('fs'),vm=require('vm'),path=require('path');
const mk=ov=>{const sb={console,setTimeout,clearTimeout};sb.window=sb;vm.createContext(sb);
 sb.Store={state:{settings:ov?{promptOverrides:ov}:{},customExperts:[],agentMemory:[]},save(){},myProjects:()=>[]};
 sb.GSettings={DEFAULTS:{tplImage:'i',tplVideo:'v',tplReview:'r'},DIR_DIMS:[],DIR_STYLES:['漫剧'],EXPERT_ROLES:[],dirFallback:()=>({})};
 ['prompts.js','domain.js','knowledge.js','wf-core.js','experts-data.js','experts.js'].forEach(f=>
   vm.runInContext(fs.readFileSync(path.join('js',f),'utf8'),sb,{filename:f}));return sb;};
const a=mk(null),b=mk({'forge.system':'你是铸造师(覆盖生效)。'});
console.log(a.Experts.FORGE_SYS.split('\n')[0]);
console.log(b.Experts.FORGE_SYS.split('\n')[0]);
console.log('契约半不动:',a.Experts.FORGE_SYS.split('\n').slice(1).join('|')===b.Experts.FORGE_SYS.split('\n').slice(1).join('|'));"
# 你是「专家 skill 生成器」(元智能体)。…你为其生成完整专家 skill。只返回严格 JSON:
# 你是铸造师(覆盖生效)。只返回严格 JSON:
# 契约半不动: true
```

缺省逐字节(第一行)、覆盖跟随(第二行)、契约半不变(第三行)。工坊两步只在浏览器上(`Views.gsettings` 的 `sendForge` 与专家库那颗「从使用记录进化」按钮),没有服务端端点可打,故上游链路取证只能走浏览器;`node tests/e2e.js` 按仓库纪律未跑(需用户明确要求)。本槽不含合并、未开 PR。

## 10. 与并行分支的关系

本槽只在 W80 头部之上加两条键、换两个取值口,与 W78/W79 及 W81–W87 一律**未合并**。预计冲突面:

- `js/prompts.js`:本槽在**表尾**(`agent.previsSystem` 之后)插两条。别的收编槽历来插在主线段中间(`extract.system` / `sb.system` 前后),两处隔着整个 Agent 段,取**并集**即可。若有另一槽也往表尾插,合并后要复查本槽那条"两键相邻 + 都在 `agent.previsSystem` 之后"的断言——它只要求 forge 两键彼此相邻,别人插在它们**后面**不红、插在**中间**会红。
- `js/experts.js`:本槽改第 98 行取值口、第 142 行常量拆分与第 173 行导出对象三处。这个文件在别的槽里很少被改;若有槽动 `evolveExpert` 的计费或板块过滤,冲突点在第 98 行附近,取值口那半留本槽。
- `js/skills.js`:SK-02 与 SK-26 各改一段。SK-02 此前没有 `prompts` 字段,别的槽不会往它加;SK-26 的 `note` 是热点(W43/W58/W61/W65 都改过),本槽在「仍欠(G-11)」**之前**插了一段、在其**之后**补了一句,合并时**两段都留**,并按实况复查 `G-11` 那两个锚点还在不在。
- `tests/unit.js`:两条新用例插在事件图谱源级那条之后、`Agent 单轮人设` 之前。W80 第 1 节第 2 条那个 `} },` 块尾坑在这里同样适用——两侧在同一插入点各加整块时,块尾那行是共用的。
- `README.md` / `docs/skills-wave/README.md`:提示词条数按合入后 `Prompts.list().length` 实计重算,单测用例数按实跑重算,**别手算**(`contract` 套件的数字对账会先红)。

## 11. 交接

1. **`js/experts.js` 内联人设至此归零**,W80 5.4 那张表里这一行可以划掉;按同一口径(`system: '你是` / `` system: `你是 ``)全仓现取 **11 处 → 10 处**,逐文件余量:`js/agent-ops.js` 2、`js/sb-views.js` / `js/role-editor.js` / `js/proj-upload.js` / `js/proj-shell.js` / `js/plans.js` / `js/gsettings.js` / `js/editors.js` / `js/beatboard.js` 各 1。
2. **那个计数口径本身漏了一类,现补记一处**:`js/agent-global.js:74` 的 `const sys = \`你是意图路由器。…\`` 是内联人设,但既不是 `system: '你是` 也不是 `const [A-Z_]+ = \`你是`(局部小写变量名),W80 那张表里没有它。本槽的 `FORGE_SYS` 是同一类漏计(常量形态)。所以 G-13 的真实余量是 **10 + 1 = 11 处**,下一个盘点的人别只跑 `system: '你是` 那一条正则。
3. **`G-11` 仍开着,且本槽没有推进它**:自进化的触发面仍是人手一次一点、仍只对自定义专家开放。要推进得回答两个产品口径题——自动触发的时机(每轮闭环?攒够 N 条沉淀?)与预置专家能不能被改(改了还算"平台预置"吗,或者应当 fork 成一位自定义专家),都不是收提示词能解决的。
4. **`G-09` 的两头现在写在一处**:SK-02 的仍欠段点明工坊铸出的专家没有 `skills[]`。要补的话,`FORGE_SYS` 的契约半要加字段、`normExpertDraft` 要补白名单校验(值必须是已注册的 skill id),并且这是**契约半的改动**——按本槽口径它不进注册表,所以那次改动会落在 `js/experts.js` 的 `FORGE_CONTRACT` 上,不动 `forge.system`。
5. **工坊两步仍只有源级 + 沙箱两层,没有真 UI 层**:锻造器那步的 handler 在 `Views.gsettings` 的 DOM 闭包里(`body.querySelector('[data-x=fsend]').onclick = sendForge`),本槽的真跑是从 `window.Experts` 侧取值,没有像 W76 那样给个假 `host` 把 `onclick` 摘出来跑。要补这一层得先能构造出工坊页那棵 DOM,比 W76 那两步(具名选择器、无多轮状态)难一档——`sendForge` 还牵着 `forgeChat` 会话历史与 `forgeDraft` 预览卡。
