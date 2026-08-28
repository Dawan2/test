# W86 · `js/agent-ops.js` 两处内联人设收编(回执核验修复 / 会话纪要蒸馏)

> 分支 `cursor/w86-agent-ops-prompt-8d6f`,基线 `cursor/w80-integration-5369 @ 4c45f89`(任务直接指定)。
> 本槽只收 `js/agent-ops.js` 一个文件,`js/sb-views.js` 那处不动(另槽接)。W78–W85 不合。

## 1. 结果一句话

`js/agent-ops.js` 里 grep 得到的**两处**内联人设收进注册表,各成一条独立键:

| # | 步 | 入口 | 新键 | `def`(与收编前逐字节相同) |
|---|---|---|---|---|
| 1 | 执行回执核验修复(`step:'fix'`) | `AgentOps.selfFixRound` | `agent.selfFixSystem` | `你是「虎鲸导演助手」的执行核验器。` |
| 2 | 会话纪要蒸馏(`step:'cmp'`) | `AgentOps.compactChat` | `agent.compactSystem` | `你是会话纪要整理器。` |

注册表 **25 → 27 条**;`unit 435 → 437`(全绿)、`integration 126/126`、`cli.smoke 95/97`(2 项与 `master` 同名同表现,见 6.2)。
按 `system: '你是` / `` system: `你是 `` 同一口径,全仓内联人设由 **11 处降到 9 处**,`js/agent-ops.js` 归零。

`gaps` 一个不摘:G-13 治的是全仓内联人设,`Skills.gaps()` 的 20 个键与 `G-13` 那六条值逐字节不变(有用例钉住)。

## 2. 先 grep 再动手:这个文件到底有几处内联人设

任务给的前提是"SK-10/SK-11 的仍欠段点名 `js/agent-ops.js`",但点名说的是"执行核验器与会话纪要整理器"两处,
究竟是不是只有两处得自己数。三条 grep 交叉取证:

```
grep -n "你是" js/agent-ops.js            # 2 行:128、818
grep -n "system"  js/agent-ops.js          # 5 行:52/677 是注释、779 是 prearrPrompt(已在表)、128/818 是内联
```

第 779 行那处 `system: prearrPrompt(p, ep, o.sysExtra)` 不是内联——`prearrPrompt` 开头已经在读
`Prompts.get('agent.previsSystem')`(那条键此前已落),所以本文件的**待收编处恰好是 2 处**。
另两条注释里的 "system" 是「协议文本注入 system 提示词」的说明文字,不是取值点。

## 3. 一键还是两键:先逐字节比,再看角色

判据沿用既有口径——**`def` 相同才谈得上共用一键,否则分键**。先把两句原文抽出来做字节比对:

```
node -e "…Buffer.from(a).toString('hex')…"
A(执行核验器) e4bda0e698af e3808c…e58aa9 e3808d e79a84 e689a7e8a18ce6a0b8e9aa8ce599a8 e38082
B(会话纪要)   e4bda0e698af e4bc9ae8af9de7baaae8a681e695b4e79086e599a8 e38082
A === B ? false
```

**逐字节不同,所以不可能共用一键**,判据到这里就结束了——不必再往下比角色。
角色一层只是佐证同一结论:一个是"拿着执行回执归因、并给出修复 `ops`/重试"的核验器(产物落进
`applyOps`/`runEpisodeActions`),一个是"把旧对话蒸馏成 ≤150 字纪要"的整理器(产物落进
`settings.agentSummary*` 一个字符串),两步的失败行为也不同(前者不出 `ops` 只给一句建议,后者静默回退硬截)。

反过来记一句:**如果两句 def 恰好逐字节相同,本槽也不会自动合并**——键位是持久化面
(覆盖按键存在 `settings.promptOverrides`),现在拆零成本、以后拆要动用户已写的覆盖。
这一条在 `voice.recommendSystem`/`voice.recommendBatchSystem` 上已经判过一次,本槽没遇上(两句本就不同)。

### 键名与注册表位置

前缀取 `agent.`——这两步都在 Agent 对话闭环里,与 `agent.system`/`agent.panelSystem`/`agent.drawerSystem`/
`agent.previsSystem` 同族;中段对上各自的入口函数(`selfFix`/`compact`),尾段 `System` 同既有写法。
位置排在 `agent.previsSystem` 之后、注册表末尾:主步(单轮 + 多轮三份)在前、辅助两步在后,
这个顺序就是「偏好学习 → 全局默认值 → 核心提示词 skill」页面上的排列。

## 4. 契约半为什么不开放,以及"人设句"到哪里为止

两处的 `system` 都是「人设句 + 别的东西」拼在一起,本槽只把开头那句人设抽走,其余原样留在调用点。

**① 回执核验修复**(`js/agent-ops.js` `selfFixRound`)。人设句之后紧跟着的是:

- `刚才按用户指令驱动工作台执行了动作,回执如下(✕=失败,⊘=不支持)。` —— 这是**输入格式说明**,
  `✕`/`⊘` 两个记号正是同一函数上面那行 `receipts.filter(x => /[✕⊘]/.test(x))` 用来挑失败项的,
  用户把记号改一个字,模型就读不懂哪几项失败了;
- 三条 `请归因并修复` 分支,里面写死了数据类修复的 `op` 白名单(`update/insert/move/batch/beatupdate/sceneupdate`)
  与 run 重试的形状 `{"op":"run","cmd":"原命令名"}` —— 这两串直接对着 `splitOps`/`applyOps` 的解析分支与
  `retrySet` 白名单,改坏即整轮修复 `ops` 全部落空(而且是静默的:`applyOps` 认不出的 op 直接被丢);
- `返回 JSON {"reply":"一句话结论","ops":[操作或空数组]}` —— 出参契约。

**② 会话纪要蒸馏**(`compactChat`)。人设句之后是 `把以下短剧创作协作对话蒸馏为≤150字的「会话纪要」,
保留:用户的修改意图与偏好、已确认的决定、未完成事项。只返回 JSON {"summary":"..."}`——
字数与保留项对着下游那句 `String(out.summary).slice(0, 300)` 与两个消费点
(`js/agent.js` / `js/agent-global.js` 各拼一句 `此前会话纪要:`),`{"summary":...}` 是出参契约。

所以收编解决的是"**这两步的角色定位可被用户在线改写**",不是"这两步整段可被改写"。
这与 `agent.system` 那次的取舍同一条线:协议半是解析契约,做成可覆盖变量就等于把解析器开给用户改。
「只收人设句」由两条断言钉住:注册表里不得出现 `"ops"`/`"summary"`/`✕=失败`/`≤150字` 任一字面;
行为面覆盖人设句之后,`def[0].slice(人设句长度)` 之后那一整段逐字节不变。

## 5. 缺省逐字节不变靠哪四层钉住

1. **注册表字面**:`Prompts.get('agent.selfFixSystem')` / `get('agent.compactSystem')` 直接与收编前抄出来的两句 `assertEq`。
2. **取值口与该步锚点配对**:源级正则要求 `` system: `${Prompts.get('agent.selfFixSystem')}刚才按用户指令驱动工作台执行了动作 ``
   与 `system: Prompts.get('agent.compactSystem') + '把以下短剧创作协作对话蒸馏为` 各自成对出现——
   两个键互换位置当场红(变异 1 实测)。
3. **行为面真跑**:两步的 handler 都在模块闭包里,但 `selfFixRound` 与 `compactChat` 都挂在 `window.AgentOps` 上,
   所以直接驱动入口、从假上游的请求体上截获 `system`。缺省那次断言整串逐字节等于收编前;
   再跑一次带覆盖的,断言"只换人设句、协议半 `slice` 之后逐字节不变"且**不串台到另一步**。
   `compactChat` 是 fire-and-forget,等 30ms 让微任务落定(沿用该文件既有那条用例的手法)。
4. **全仓持有者名单**:两句字面在 `js/*.js` + `server.js`/`cli.js`/`mcp.js`/`index.html` 里扫一遍,
   排序后必须恰好等于 `js/prompts.js` ——谁在别处抄第二份当场红,哪怕原文件仍走注册表(变异 5 实测)。

另有一层"不冒充双端":这两步只有浏览器一个消费点(headless 没有"自修复轮"也没有"对话纪要"这两个动作),
故 `server.js`/`cli.js` 里不得出现这两步的指令半锚点。收编解决的是**可覆盖**,不是**可 headless**——
这一句在记账里写清楚,免得下一个人把它读成"两端都通了"。

## 6. 实测

### 6.1 三套件

| 套件 | 基线 `4c45f89` | 本槽 HEAD |
|---|---|---|
| `node tests/unit.js` | 435/435 | **437/437** |
| `node tests/integration.js` | 126/126 | **126/126** |
| `node tests/cli.smoke.js` | 95/97 | **95/97** |

`+2` 是本槽新加的两条用例(注册表面一条、源级 + 行为面一条),一条没删、一条没改判据方向以外的内容。
`node --check` 过了 `js/prompts.js` / `js/agent-ops.js` / `js/skills.js` / `tests/unit.js` 四份改动文件。

### 6.2 `cli.smoke` 那 2 项:与 `master` 同名同表现

`master @ 9adcf0f` 现开独立 worktree 跑 `51/53`,失败两条:

```
FAIL | 未登录 whoami → exit 3 | exit=1
FAIL | llm --json mock 链路 | undefined
```

本槽 HEAD `95/97`,失败两条**同名同表现**(基线用例总数不同是主干这些槽里 cli.smoke 用例本来就多),
即本槽没有引入新的 CLI 失败。

### 6.3 九条变异逐条转红

| # | 变异 | 红在哪 | 红几条 |
|---|---|---|---|
| 1 | 两处合成共用一键(`compact` 取值口改指 `selfFix` 键) | 源级取值口锚点配对 | 1 |
| 2 | 回执核验那处退回内联 | SK-10 / SK-11 两条翻面后的反向断言 + 本槽源级 | 3 |
| 3 | SK-10 仍欠段仍把 `js/agent-ops.js` 记成欠账 | 「已收编不得再记成欠账」 | 1 |
| 4 | 把返回 JSON 契约一并搬进 `def` | 缺省字面逐字节比对 | 1 |
| 5 | 在 `js/plans.js` 抄第二份人设字面 | 全仓持有者名单 | 1 |
| 6 | 只收一处、会话纪要那处退回内联 | 同变异 2 的三条 | 3 |
| 7 | SK-03 漏登记两个新键 | 注册表键须被 skill 索引引用 + 本槽登记断言 | 2 |
| 8 | README 的 25 不改成 27 | `contract` README 数字对账 | 1 |
| 9 | 两键 `def` 写成同一句(覆盖串台) | 缺省字面逐字节比对 | 1 |

变异 2 与变异 6 各红 3 条,值得单记一句:**除本槽自己那条源级断言外,另外两条红在 SK-10 与 SK-11 的记账用例上**——
它们原本是"这两处此刻确实还有内联人设"的反向路障,本槽把方向翻过来之后,退回内联同样接得住。
路障不因翻面而消失,只是换了个方向。

### 6.4 零吃测

`tests/unit.js` 的用例名对基线做双向 `comm -23`:基线有而 HEAD 没有的为空,HEAD 多出的恰好是本槽新加那两条名字。
`integration` / `cli.smoke` 两份名集与基线逐条相等(本槽没碰这两个文件)。

## 7. 记账改了哪几处

- **SK-03(`core.personaCtx`)**:`prompts` 补 `agent.selfFixSystem`/`agent.compactSystem` 两键;
  `note` 加一句写明这两步同形收编、取值口在 `selfFixRound`/`compactChat`、`js/agent-ops.js` 内联人设归零;
  「仍欠」段补一句辅助两步同样只收人设句、契约半不开放,并把"没有 Node 第二消费点"那句的枚举带上这两步。
- **SK-10(`script.aiToneBan`)**:已落地那半补写这两处已收编;**仍欠段去掉 `js/agent-ops.js`,只剩 `js/sb-views.js`**。
- **SK-11(`subjects.refDiscipline`)**:同形改写。这里踩过一个小坑——第一版把
  「剧本模块那几步与 `js/agent-ops.js` 的辅助两步都已随 SK-03 收编」这句写在了「仍欠」**之后**,
  于是 `note.split('仍欠')` 切出来的那段里仍带着 `js/agent-ops.js` 字面,断言照红。
  改法是把这句挪到「仍欠」之前(它本来就是"已落地"那半的话)。
  **点名断言只认「仍欠」之后那段**这条口径,反过来也约束记账件怎么断句。
- **`gaps` / `pending` 一字未动**:`Skills.gaps()` 20 键、`G-13` 那六条值逐字节不变。

## 8. 文档同步(四处数字/描述各自现取)

| 处 | 改法 |
|---|---|
| `README.md` skill 索引段「N 条注册表提示词」 | 25 → **27**,`node -e "require('./js/prompts.js').list().length"` 现取 |
| `README.md` prompts 文件化段的键枚举 + 长行描述 | 枚举按注册表键序插两项;描述句插在音色推荐之后,写明两键为什么不共用、契约半留在哪 |
| `README.md` 测试段「单元测试(N 项断言)」 | 435 → **437**,由 `contract` 那条 README 数字对账用例现算 |
| `docs/skills-wave/README.md` 一分钟摘要「提示词在 `js/prompts.js`(N 条)」 | 25 → **27** |

顺带修掉一处**先于本槽就已过期**的散文:`README.md` 测试段记账面那句
「两条『仍欠』段点名的余量逐处钉住源码实况(`js/persona.js` 文生图重写步与 `js/episodes.js` …仍内联)」——
`js/persona.js` 自 W69、`js/episodes.js` 自 W71/W77 起就已零内联,这句在基线上就不实了
(它落在没有断言兜底的散文里,只能通读捞出)。现改成按实况写:点名的是 `js/sb-views.js`,
已收编的那几个文件反向钉住不得退回内联、也不得再记成欠账。

## 9. 残留

- **`js/sb-views.js` 的分镜改图专家仍内联**(本槽口径明确不收,另槽接)。
  SK-10/SK-11 的仍欠段现在点的就是它,并各配一条"它此刻确实还有内联人设"的反向断言——
  下一槽收它时这两条会红,**连着记账一起翻**。
- **`G-13` 仍开着**:按同一 grep 口径全仓余量 9 处 ——
  `js/beatboard.js`(节拍拆解专家)、`js/editors.js`(漫剧编剧)、`js/experts.js`(专家人设进化器)、
  `js/gsettings.js`(资深影视导演)、`js/plans.js`(制作计划器)、`js/proj-shell.js`(发行运营专家)、
  `js/proj-upload.js`(拉片分析师)、`js/role-editor.js`(角色设定师)、`js/sb-views.js`(分镜改图专家)各 1 处。
  摘标记的判据不变:全仓再无内联人设,且一次改齐六条关联索引的 `gaps` 与 `note`。
- 本槽**没有新增功能、没有改任何判据的口径**,计费一格未动:两步本就用所属那条消息的 `operationId`
  走辅助步槽位(`step:'fix'` / `step:'cmp'`),不另扣费,收编前后一致。
