# W69 · SK-11 的 `settings.tplImage` 取用点收编:八维度重写文生图提示词那步的人设进注册表

> 基线 `cursor/w64-integration-23c3 @ c36abaa`,落地分支 `cursor/w69-persona-tplimage-prompt-bf09`。未合并 W65–W68。
> 收编的是 G-13 欠段里的**一处**:`js/persona.js` 八维度重写文生图提示词那步的人设句。
> `js/wf-core.js` / `js/episode-util.js` / `server.js` / `cli.js` / `mcp.js` 一行未碰,不抬发布门(`js/release.js` 未碰)、不新增计费动作、未删测。

## 1. 现场:`tplImage` 的取用点只有人设那半还在外面

SK-11(`subjects.refDiscipline`)的登记面是两个键:`kb: ['主体参考']` 与 `settings: ['tplImage']`。

- 前者的取用点是主体步装配口 `WfCore.extractSystem(ov)`,W45 把人设句收进 `extract.system` 之后,人设句与方法论正文两半都在单源之内。
- 后者的取用点是 `js/persona.js:16` 那一步:读 `settings.tplImage` 当参考模板,按八维度重写角色立绘的文生图提示词。模板那半用户在「偏好学习 → 全局默认值」改得到,**人设那半是内联字面**:

```js
const out = await API.chatJSON({
  system: '你是文生图提示词专家。',        // ← 全仓唯一一处,不经 Prompts.get
  messages: [{ role: 'user', content: `…参考模板:${tpl}\n角色名:${s.name}\n…` }],
  …
});
```

改完是:

```js
system: Prompts.get('persona.promptSystem'),
```

先按纪律核了「只有这一处」:全仓 `你是文生图提示词专家` 字面 grep 只命中 `js/persona.js:18` 一行;`settings.tplImage` 的读取方共两处(`js/episode-util.js:86` 与本文件),前者是纯模板拼装、那一步没有 LLM 人设可收。故本槽的收编面就是这一行。

## 2. 新键叫什么:与 `gen.promptSystem` / `extract.system` 同类,但不能复用它们

W56 立过复用键的三条判据(字面同 / 角色同 / 产物落点同),逐条对一遍:

| 候选 | 字面 | 角色 | 产物落点 | 结论 |
|---|---|---|---|---|
| `extract.system`(`你是专业的短剧剧本分析助手。`) | 不同 | 从剧本里认人 ≠ 写画面提示词 | 主体条目 ≠ 主体的 `prompt` 字段 | 不能复用 |
| `gen.promptSystem`(`你是文生视频提示词专家。`) | 差一个字(**图**/**视频**) | 都是提示词专家,但一个出立绘一个出镜头视频 | 主体 `s.prompt` ≠ 镜头 `s.prompt` | 不能复用 |

`gen.promptSystem` 这一条尤其要点住:两句只差一个字,合成一个键就等于让用户改一次同时改掉主体立绘与分镜视频两条链路的人设,而它们的产物形态、参考图口径、下游消费点都不一样。故新开键:

```js
{
  // 主体八维度人设重写文生图提示词那步:只收人设句,参考模板仍取 settings.tplImage、返回 JSON 约定仍由装配口拼
  key: 'persona.promptSystem', name: '八维度重写文生图提示词 · 系统人设', vars: [],
  def: '你是文生图提示词专家。',
},
```

- **命名**:`<模块/步>.<角色>System`,与 `gen.promptSystem`(视频提示词改写)、`extract.system`(主体提取)同族;前缀取 `persona` 而不是 `subject`,因为这一步的入口就是八维度人设编辑器,`subject.*` 在命令层已是主体条目动作的前缀(`subject.generateImage`)。
- **`def` 与原串逐字节相同**,`vars` 为空 —— 该步不做变量替换。
- **排在 `extract.system` 之后**:注册表顺序就是「全局默认值 → 核心提示词 skill」的展示顺序,主体这一步紧跟主体提取步读起来才连得上。

**只收人设句**,与 `agent.system` 同口径:参考模板仍取 `settings.tplImage`(那是偏好设置面,不是提示词注册表面),`返回 {"prompt":"..."}` 的 JSON 契约仍由该步 user 半拼 —— 用户把它改坏就是整轮解析失败,不做成可覆盖变量。

## 3. `settings.tplImage` 本身不是缺口

这一条沿用 W66 的判定,不因为"顺手在改这一步"就把它记成欠账:模板三件套在「偏好学习 → 全局默认值」有输入框、雇佣风格专家时被专家模板覆写、解雇恢复 `DEFAULTS`,用户一直改得到。落在 G-13 那句"用户不能在线改写"伤害面里的只有**取用点那步的人设句**。

本槽因此有一条断言专门钉住这个边界:改 `tplImage` 时 user 半跟着变、`system` 半岿然不动;两半各走各的覆盖通道,谁也不吞谁。

## 4. 取值口:浏览器一处,不存在第二端

该步是纯浏览器链路(主体编辑页 → 八维度弹窗 → `Persona.rewritePrompt`),`server.js` / `cli.js` 里没有对端。所以:

- 取值口只有 `Prompts.get('persona.promptSystem')` 一处,浏览器隐式读 `Store.state.settings.promptOverrides`(与 `agent.panelSystem` 那三条同形)。
- 断言写成**不许长出第二端**:`server.js` / `cli.js` 里不得出现该步的 user 半字面(`角色八维度人设`),否则就是有人在服务端另拼了一份。
- 收编解决的是"**可覆盖**",不解决"可 headless" —— 这一点如实写进 README 与本件,不含糊成"该步已双端单源"。

## 5. 「仍内联」tripwire 按新实况反转并收严

收编前钉的是"这一步仍是内联人设"(收编即红,逼着同步改记账);收编后这条判据自动作废,本槽把它反转成两条更严的:

| 原判据 | 反转后 |
|---|---|
| `js/persona.js` 该步仍是内联字面 | `js/persona.js` 经 `Prompts.get('persona.promptSystem')` 取值 |
| 注册表里没有哪条 `def` 是这句话 | **全仓** `js/*.js` + `server.js` + `cli.js` + `mcp.js` + `index.html` 里含这句字面的文件**恰好只有** `js/prompts.js` |

收严的地方是第二条:不是只查 `js/persona.js` 干净了,而是把全仓扫一遍列出持有者名单再逐字节比对 —— 将来谁在别的文件里抄第二份(哪怕原文件仍走注册表)也当场红。

W66 若已合入,它在 §4 那张表里给 SK-11 配的源级断言(`js/persona.js` 的文生图重写步应仍是内联人设)与本槽实况相反:**取本槽这一侧**,把那条按上表反转,不要两条并存。判据不是"谁的分支新",是源码实况 —— 那一行现在就不是内联字面了。

## 6. 记账:SK-11 的 `note` 与 `prompts` 登记

```js
kb: ['主体参考'], prompts: ['extract.system', 'persona.promptSystem'], settings: ['tplImage'],
…
note: '注入面落在主体步系统人设 WfCore.extractSystem(…),本条拼块即该条目正文;'
  + '人设句已在注册表——主体步取 extract.system,'
  + '另一登记键 settings.tplImage 的取用点(js/persona.js 八维度重写文生图提示词那步)取 persona.promptSystem,'
  + '两处装配口都经 Prompts.get 取值、用户在「全局默认值」页改得到(模板本身也一直改得到),'
  + '故本条自己的登记面已无收编余量。'
  + '仍欠 G-13 的不在本条名下:全仓其余模块的内联人设未进注册表(剧本模块的解说体改写/导演阐述/光影总控/剧本围读四步在 js/episodes.js 仍是内联字面),'
  + '缺口未闭合故按关联索引口径不摘标记。'
```

三处要点:

1. **`prompts` 登记补上**:条目此前只登记 `kb` 与 `settings`,注入落点的两个提示词键一个没写;与 SK-17(`sb.system`)、SK-21(`gen.promptSystem`)同口径写上之后,「人设已在注册表」这句话在记账里才对得上账,且引用键自检(`Skills.validate`)会替它守着键名。契约测试「Prompts 全部 key 应被 skill 索引引用」也要求新键必须进索引 —— 摘掉登记当场红。
2. **仍欠段改指真正还在的那一处**:本条自己的登记面已无余量,所以仍欠段写的是"不在本条名下,余量在 `js/episodes.js` 那四步",并配源级断言逐处对照(那四步仍是内联字面、注册表里没有同 `def`)。后续槽把它们收编时这条转红,逼着同步改 SK-11 的记账 —— 与收编方向相反的那一向也守住了。
3. **`gaps` 一字未动**:`G-13` 治的是"大量模块内联提示词未进注册表",本槽只收一处,缺口没闭合。按 W36 立的关联索引口径(落地一面不摘标记),`Skills.gaps()` 的键数(20)与 `G-13` 的六条值(`script.hookType,script.aiToneBan,subjects.refDiscipline,eps.structureStage,gen.videoTpl,film.rhythmInject`)逐字节不变,并有断言钉住。

另反转一处**断言语**:`G-06 校验半:SK-11/SK-13 登记与消费` 那条原写「本条只剩人设句入注册表那一项」,被断言的值(`'G-13'`)不动,说明串改为「本条只剩 G-13 那一项」并补注释交代 G-13 现在指的是哪一处、实况由新用例钉住。

**没顺手动的**:SK-10 的 `note`、`js/episodes.js` 那四步、其余条目的记账,以及 SK-11 的 `pending`(本就为空)/`gaps`/`kinds`/`checks`/`cmds`/`kb`/`settings`,都不在本槽口径内。

## 7. 用例改动(新增 2 条,反转 1 处断言语,未删测)

两条都落在 `contract` 套件,紧跟剧本摘要人物小传步那两条(同为"收编一处内联人设"的行为面 + 源级配对):

| 用例 | 钉住的事 |
|---|---|
| **新增** 行为面 `八维度重写文生图提示词人设:经 Prompts.get(persona.promptSystem) 取值,缺省逐字节等于收编前的内联字面` | ① 缺省 `Prompts.get` 与该步真实发出的 `system` 都逐字节等于 `你是文生图提示词专家。`;② 沙箱**真跑** `Persona.rewritePrompt`(截获 `system`/`user`),该步恰好发一次 LLM;③ 该 `system` 恰好命中注册表一条且就是新键(同 `def` 开两个键即红);④ 写覆盖后 `system` 跟随、`user` 半(参考模板 + 八维度正文 + 返回 JSON 约定)**逐字节不变**、返回值解析口径不变(JSON 契约未开放);⑤ `settings.tplImage` 改写只动 user 半、不动 `system` 半 |
| **新增** 源级 `八维度重写文生图提示词人设(源级):js/persona.js 零内联全文,SK-11 记账随实况改写` | ① 取值口在 `js/persona.js`;② 全仓该字面的持有者恰好只有 `js/prompts.js`(§5 的收严);③ `server.js`/`cli.js` 不得长出第二端;④ SK-11 登记两个落点键、`settings` 仍是 `tplImage`;⑤ `note` 不得再写「人设句入注册表待 G-13」且须写明已在注册表;⑥ 仍欠段(只认 `仍欠` 之后那段)点名 `js/episodes.js`,并逐处对照那四步仍内联、注册表里没有同 `def`;⑦ `G-13` 标记仍在、`gaps()['G-13']` 六条值逐字节固定;⑧ `Skills.validate({ Prompts })` 通过 |
| **反转** `G-06 校验半:SK-11/SK-13 登记与消费` 的说明串 | 期望值 `'G-13'` 未动,说明串按实况改写(见 §6) |

沙箱 `loadPersona(ov)` 与 `loadDigest` 同形:`prompts.js → persona.js` 按 `index.html` 顺序加载,`API.chatJSON` 截获 `system`/`user`,`ov` 写进 `Store.state.settings.promptOverrides`。LLM 成功路径不进本地模板回退,所以不必装 `EpisodeUtil`/`styleOf`。

## 8. 变异实测

六条变异逐一施加、跑 `node tests/unit.js` 后复原(复原后 410/410):

| 变异 | 实测行为 | 转红 |
|---|---|---|
| 1 `js/persona.js` 改回内联字面 | 收编退回收编之前 | 2 条(行为面 + 源级) |
| 2 取值口改成 `Prompts.get(key, {})`(不读覆盖表) | 进表了但用户改不到 | 2 条(行为面 + 源级) |
| 3 注册表 `def` 改一个字(句号→叹号) | 缺省不再逐字节相同 | 1 条(行为面) |
| 4 摘掉 SK-11 的 `persona.promptSystem` 登记 | 新键不进索引、记账对不上账 | 2 条(四类单源键全覆盖 + 源级) |
| 5 `note` 写回「人设句入注册表待 G-13」 | 记账退回收编之前 | 1 条(源级) |
| 6 **反向**:把 `js/episodes.js` 解说体那步收编 | 仍欠段点名的余量已消失而 `note` 还写着欠 | 1 条(源级) |

变异 2 之所以两条都红:行为面看的是覆盖跟不跟随,源级看的是取值口写法 —— 一处失守两处都拦得住,这是有意的重叠。

## 9. 复核方式

```
git checkout cursor/w69-persona-tplimage-prompt-bf09
node --check js/prompts.js js/persona.js js/skills.js tests/unit.js   # 通过
node tests/unit.js          # 410/410 PASS(基线 408,新增 2 条用例)
node tests/unit.js contract # 57/57 PASS(基线 55)
node tests/unit.js skills   # 93/93 PASS(与基线同:本槽未动 skills 套件)
node tests/integration.js   # 118/118 PASS(与基线同:本槽未碰 server.js 与任何端点)
node tests/cli.smoke.js     # 88/90;两处失败「未登录 whoami」「llm --json mock 链路」与 master 同名(基线同名同数)
node -e "const P=require('./js/prompts.js'),S=require('./js/skills.js');
console.log(P.list().length, JSON.stringify(P.get('persona.promptSystem')));
console.log(S.byId('subjects.refDiscipline').prompts.join(','), '|', Object.keys(S.gaps()).length, S.gaps()['G-13'].join(','));"
# 15 "你是文生图提示词专家。"
# extract.system,persona.promptSystem | 20 script.hookType,script.aiToneBan,subjects.refDiscipline,eps.structureStage,gen.videoTpl,film.rhythmInject
```

`node tests/e2e.js` 按仓库纪律未跑(需用户明确要求)。本槽不含合并、未开 PR。

## 10. 与并行分支的关系

W65–W68 未合并。改动面:`js/prompts.js`(+1 条注册)、`js/persona.js`(1 行)、`js/skills.js`(SK-11 一条内部的 `prompts` 与 `note`)、`tests/unit.js`(+1 个沙箱加载器 + 2 条用例 + 1 处说明串)、`README.md`(三处数字/描述)、`docs/skills-wave/README.md`(条数 + 索引行)。

- **与 W66 同改 SK-11**(最可能的冲突点):W66 把 `note` 的「人设句入注册表待 G-13」改成"已在注册表 + 仍欠 `js/persona.js` 那一处",本槽把那一处收掉了。合并取**本槽这一侧**的仍欠段(W66 的锚点已不成立,它自己的变异 5 就是这一向的守卫);`prompts` 登记取并集(W66 写 `['extract.system']`,本槽是 `['extract.system', 'persona.promptSystem']`,后者含前者)。W66 §4 那条"该步应仍是内联"的源级断言按本件 §5 反转,不要与本槽的两条并存。
- **`tests/unit.js`**:本槽新增在 `contract` 套件、W66 新增在 `skills` 套件,插入点不重叠;两侧都改了 `G-06 校验半` 那条的说明串,取任一侧皆可(期望值都没动),合并后跑一遍确认只剩一份。
- **`js/prompts.js`**:本槽在 `extract.system` 之后插入一条。若并行槽也往注册表加键,两块都留,`README` 的条数按合入后 `Prompts.list().length` 现取重算(`contract` 的数字对账会先红)。
- **`README.md` / `docs/skills-wave/README.md`**:三个数字(注册表提示词 15、单测 410、索引行)一律按合入后实跑重算,不要照抄任一侧。

## 11. 交接

1. **G-13 仍欠**,缺口开着:本槽只收一处取值口,全仓内联人设(`system: '你是…` 字面计数)由 21 处减为 **20 处** —— `js/episodes.js` 五处(解说体改写 / 导演阐述 / 光影总控 / 剧本围读 / 剧本结构分析,角色互不相同、收编是五个键,属"注册表条数与「全局默认值」页长度"的产品口径题,本槽按交接留给后续槽)、`js/episode-util.js` 三处策划人设、`js/persona.js` 余下两处(配音导演单个/批量推荐音色,同字面两处,按 W56 三条判据大概率复用同一个键)、`js/sb-board.js` 两处,以及 `js/beatboard.js` / `js/proj-shell.js` / `js/proj-upload.js` / `js/editors.js` / `js/gsettings.js` / `js/agent-ops.js` / `js/experts.js` / `js/sb-views.js` 各一处。
2. **摘 G-13 标记的时机不变**:判据是"全仓再无内联人设",且要一次改齐六条关联索引的 `gaps` 与 `note`,不是谁的一半好了就摘谁。本槽不预支这个动作。
3. **SK-11 的记账从此没有自己的收编余量**:再动它的 `note` 前先核一遍 `js/episodes.js` 那四步还在不在 —— 仍欠段的锚点就钉在那里,收编了不改记账当场红。
