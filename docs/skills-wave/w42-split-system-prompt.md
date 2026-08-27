# W42 · 剧本拆集的系统人设收编两端(`/api/wf/*` 系统人设全部进注册表)

> 基线 `cursor/w40-sum-system-prompt-fc50 @ c15259b`(W40 收编 `review.sumSystem` 后的头部),落地分支 `cursor/w42-split-system-prompt-d6ce`。
> 本槽做的是 W40 第 8 节交接第 1 条:把剧本拆集步两端写死的那句人设收进 `js/prompts.js` 注册表,收编方式与 W40 逐条同形。
> 不改发布门(`js/release.js` 一行未碰)、不新增计费动作(拆集步仍按 `llm.chat` 原口径按次计费)、未删测(反转 1 条既有断言的方向,新增 1 条用例)。

## 1. 缺的是一个注册表键

W8 已经把拆集步的 **user 半**做成了双端单源(`WfCore.buildSplitUser`,并接上剧本板块的人设与记忆 ctx),但 **system 半**两端各留一份字面量——W8 记账件第 3 节「没做的事」当时就写明这一处刻意不动:

| 端 | 位置 | system 半 | user 半 |
|---|---|---|---|
| 浏览器 | `js/episode-util.js` `llmSplitEpisodes` | 内联 `'你是专业的短剧策划编辑。'` | 已单源 `WfCore.buildSplitUser(text, WfCore.splitTargetCount(text), {...})` |
| 服务端 | `server.js` `/api/wf/split-episodes` | 内联 `'你是专业的短剧策划编辑。'` | 已单源 `WfCore.buildSplitUser(text, WfCore.splitTargetCount(text), {...})` |

后果与 W40 处置的那一处完全同形:用户在「偏好学习 → 全局默认值 → 核心提示词 skill」改写人设,主线上的其余 LLM 步跟随,拆集步不跟随;而拆集是 headless 主线的**起点**(`exec project.splitEpisodes` / `hujing_split_episodes`),这一步听的是哪套人设直接决定了后面每一集的切点。

## 2. 结果一句话

注册表新增第 9 条 `split.system`「剧本拆集 · 系统人设」,`def` 与原内联字面**逐字节相同**;两端改成同键取值,服务端显式传 `settings.promptOverrides`。**缺省行为零变化**,覆盖时两端一并跟随。收完这一处,`/api/wf/*` 五条工作流(拆集 / 本集理解 / 智能分镜 / 智能审片 / 提取主体)里,除提取主体的人设句仍是 `wf-core` 常量外,system 半全部在注册表内(见第 5 节)。

```js
// js/prompts.js(REG 里排在首位:拆集是主线上最早的 LLM 步;既有条目的相对次序一字未动)
{ key: 'split.system', name: '剧本拆集 · 系统人设', vars: [], def: '你是专业的短剧策划编辑。' },

// js/episode-util.js:浏览器隐式读 Store.settings.promptOverrides
system: Prompts.get('split.system'),
// server.js:Node 无 window,覆盖表须显式传(与同文件 und.system 取值口同纪律)
system: Prompts.get('split.system', st.promptOverrides),
```

`index.html` 里 `js/prompts.js`(第 21 行)本就早于 `js/episode-util.js`(第 34 行)加载,浏览器侧取值口无需调整加载序;服务端 `Prompts` 早已在文件头 `require`。

回归:`unit 355/355`(基线 354,新增 1 条用例)、`integration 93/93`、`cli.smoke 62/64`(两处失败与基线逐项相同,实测见第 7 节)。

改动:`js/prompts.js` +4、`js/episode-util.js` +1−1、`server.js` +1−1、`js/skills.js` +4−3(SK-03 的 `prompts` 与 `note`)、`tests/unit.js` +30−3、`README.md` +3−3、`docs/skills-wave/README.md` +1−1,外加本记账件与索引/摘要同步。

## 3. 为什么不做成 `WfCore` 派生函数

与 W40 第 3 节同一判据:`wf-core` 派生函数(`W.sbSystem` / `W.genPromptSystem` / `W.optimizeSystem` / `W.extractSystem`)存在的理由是**同一个键有形态不同的取用口**,或人设句之后要按键接一段 KB 方法论正文。`split.system` 两个取用口的需求完全一致——都只要那一句人设,不接方法论块、不接 `Skills.block`。再包一层只是多一跳,故直接 `Prompts.get`,与 `und.system` / `review.system` / `review.sumSystem` / `review.finalSystem` 四个键写法一致。

拆集步为什么不接方法论块:它的 user 半是**锚点协议**——「只回每集标题 + 该集开头的原文第一句,正文由本地按锚点切原文、逐字不动」。往 system 半塞六阶段结构或钩子六型一类的编剧方法论,会把模型从"找切点"推向"改写剧情",与本步只切不写的设计相冲。剧本板块的方法论正文已经由 `wfPersonaNote` 经 user 半的注入段进来(W8 落地),要改方法论应改板块专家而非这句人设。

## 4. 缺省逐字节不变靠哪两层钉住

1. **注册表层**:`Prompts.get('split.system')` 的返回值用例直接与字面 `'你是专业的短剧策划编辑。'` 比对——改 `def` 即红(变异 1)。
2. **消费层**:两端源级断言「必须出现 `Prompts.get('split.system'...)`」且「不得再出现 `你是专业的短剧策划编辑` 字面」,并顺带钉住 user 半仍是 `WfCore.buildSplitUser`。单端退回内联时另一端仍跟随覆盖,两端就此分叉——这一对断言正是为了让分叉当场转红(变异 2、3)。

`Prompts.get` 对未覆盖键返回 `def`,覆盖表为空对象/`undefined` 时同样落到 `def`(注册表既有行为),故"没改过提示词"的用户看到的 system 半与本槽之前完全一样。**markers / even 两条零 LLM 路径不经这一位**(本就不发提示词),`local` 参数强制均分同理。

## 5. 记账:SK-03 的仍欠段换成主体提取步

`prompts` 补上新键(`Prompts` 全部 key 必须被 skill 索引引用是既有契约,漏登即红);`note` 里 W40 写的那句「仍欠:剧本拆集步的系统人设未收进提示词注册表」按实况改写。

W39 收紧后的点名断言只认「仍欠」之后那段,而 SK-03 的 `pending` 早已清空、`gaps` 按关联索引口径保留——这条目仍必须写明它欠什么。实况是:`/api/wf/*` 里还有一处系统人设不在注册表——提取主体的人设句是 `wf-core` 常量 `W.EXTRACT_SYSTEM`(W6 收口两端手抄时落的),**双端同源但用户覆盖不到**;正因为注册表里没有它的键,`W.extractSystem` 至今不收覆盖表参数(W19 第 7 节已如实记过:给个假参数比不给更误导)。故 SK-03 的仍欠段换成这一处,`tests/unit.js` 的点名锚点同步换成 `主体提取`。

| 条目 | 改成什么 | 剩余仍欠 |
|---|---|---|
| SK-03 `core.personaCtx` | `prompts` 补 `split.system`;`note` 的「共性汇总的人设句已收进注册表」扩为「共性汇总与剧本拆集的人设句都已收进注册表」 | **主体提取步的系统人设未收进提示词注册表**(人设句仍是 `wf-core` 常量 `EXTRACT_SYSTEM`,故 `WfCore.extractSystem` 不收覆盖表参数) |

**仍欠的这一处配了点名断言**,但形态与 W40 那条不同:`EXTRACT_SYSTEM` 那句字面在 `js/episode-util.js` 的 `aiScriptDigest` 人物小传步还有第二处同字面内联(W19 第 7 节第 3 条已记,属另一条链路),所以不能靠"某文件里字面仍在"来点名。本槽改为直接查注册表与装配口签名:`Prompts.list()` 里不得有 `def` 等于 `WfCore.EXTRACT_SYSTEM` 的条目、`WfCore.extractSystem.length === 0`(无键可取故不收覆盖表参数)。谁把它收编了,这两条会先红(变异 7 实测)。`pending` / `gaps` 一字未动,`Skills.list()` 里带 `pending` 的仍是那四条(`SK-05` / `SK-24` / `SK-26` / `SK-29`)。

## 6. 用例改动(新增 1 条 + 反转 1 条断言,未删测)与变异实测

| 用例 | 钉住的事 |
|---|---|
| **新增** `剧本拆集人设`(contract 套件,紧挨 W40 那条) | 缺省字面 + 覆盖跟随 + 注册表条目形态(无变量、条目名含「拆集」)+ 两端取值口字面(服务端必须显式传 `st.promptOverrides`)+ 两端不留内联人设句且 user 半仍走 `buildSplitUser` + SK-03 已登记新键 + 仍欠那处属实(注册表无该 `def`、`extractSystem` 零参) |
| **反转** `整集共性汇总人设`(W40 那条的末段) | W40 留的红灯按设计触发:原断言要求两端「内联字面仍在」,收编后改为「不得再内联」,并注明字面与取值口已由 `split.system` 那条钉住 |
| **换锚点** 记账对齐(既有用例) | `core.personaCtx` 的点名锚点由 `剧本拆集` 换成 `主体提取`(仍只认「仍欠」之后那段) |

七条变异逐一实测(每条单独施加、跑 `node tests/unit.js` 后复原):

| 变异 | 实测行为 | 转红 |
|---|---|---|
| 1 改 `def` 为「你是短剧拆集编辑。」 | 缺省提示词变了 | 1 条(新增那条的缺省字面断言) |
| 2 `js/episode-util.js` 退回内联字面 | 浏览器不跟随覆盖,两端分叉 | 2 条(W40 那条的反转断言 + 新增那条的浏览器取值口) |
| 3 服务端 `Prompts.get('split.system')` 不传覆盖表 | 服务端静默落回 `def`(Node 读不到 Store),覆盖只在浏览器生效 | 1 条 |
| 4 SK-03 仍欠段退回「剧本拆集」旧锚点 | 余量记账与实况不符(那处已收编) | 1 条(W39 收紧后的点名断言) |
| 5 SK-03 的 `prompts` 漏登新键 | 注册表新键脱离索引 | 2 条(既有的「`Prompts` 全部 key 应被 skill 索引引用」+ 新增那条) |
| 6 `README.md` 提示词条数不同步(9 → 8) | 文档数字失真 | 1 条(注册表口径对账那条;README 里「N 条注册表提示词」与「N 条主线 LLM 提示词」两处各由一条正则单独查,漏改哪一处都点得出来) |
| 7 把仍欠那处顺手收编而不改 `note`(`EXTRACT_SYSTEM` 改取注册表) | 仍欠段点名的余量已不存在 | 2 条(W19 立的提取人设字面断言 + 本槽新增的仍欠属实断言) |

## 7. 复核方式

```
git checkout cursor/w42-split-system-prompt-d6ce
node --check js/prompts.js js/episode-util.js js/skills.js server.js tests/unit.js   # 全部通过
node tests/unit.js            # 355/355 PASS
node tests/unit.js contract   # 48/48(含新增那条与两处 README 数字对账)
node tests/unit.js skills     # 80/80,含换锚点后的记账对齐
node tests/integration.js     # 93/93 PASS(含拆集端点六条:标记切分/覆盖保护 409/LLM 锚点/local 均分/缺剧本 400/项目不存在 404)
node tests/cli.smoke.js       # 62/64;两处失败「未登录 whoami」「llm --json mock 链路」在基线 c15259b 上逐项相同(已实测对照)
node -e "const P=require('./js/prompts.js');console.log(P.get('split.system')==='你是专业的短剧策划编辑。', P.get('split.system',{'split.system':'拆集编辑。'}))"
# true 拆集编辑。(缺省逐字节不变;覆盖生效)
```

真实上游链路人工核验(临时 stub 上游截获请求体,`MV_CONFIG`/`MV_DATA_DIR`/`MV_UPLOADS_DIR` 指向临时目录,不碰仓库 `config.json` 与真实用户数据):

- 未写覆盖时调 `/api/wf/split-episodes`:上游收到的 `system` 为 `"你是专业的短剧策划编辑。"`(与收编前逐字节相同),`200 mode=llm count=2`。
- 把 `settings.promptOverrides['split.system']` 写成「你是拆集编辑(覆盖生效)。」后再调:上游收到的 `system` 即该覆盖值,user 半仍是锚点协议模板(含「anchor 必须能在原文中逐字找到」那行),`200 mode=llm count=2`。
- 两次调用各扣 1 分(`llm.chat` 原口径),计费动作与笔数未变。

`node tests/e2e.js` 按仓库纪律未跑(需用户明确要求)。本槽不含合并、未开 PR。

## 8. 与并行分支的关系

同期 W38 / W41 是集成槽(在收 W37 / W39 一线),本槽只在 W40 头部之上加键与换取值口,预计冲突面:

- `js/prompts.js`:本槽在 `REG` 首位插入一条。若并行槽也加键,取**并集**;条目相对次序按各自的主线步位摆,不必与本槽一致(注册表次序只影响「全局默认值」页的展示顺序,无行为面)。
- `js/skills.js`:只动 SK-03 的 `prompts` 数组与 `note` 字符串。`prompts` 取并集;`note` 的仍欠段以**实况**为准折回——谁把 `EXTRACT_SYSTEM` 收编了,仍欠段与 `tests/unit.js` 的点名锚点要一并改(变异 7 会先红)。
- `README.md` / `docs/skills-wave/README.md`:提示词条数按合入后 `Prompts.list().length` 实计重算,单测用例数按实跑重算(`contract` 套件的数字对账会先红)。
- `js/episode-util.js` / `server.js`:各 1 行,落在拆集步 `system` 字段上,与并行槽无重叠。

## 9. 交接

1. **主体提取步的人设句仍是 `wf-core` 常量**(SK-03 剩下的唯一仍欠,见第 5 节)。收编方式与本槽同形但多一步:加键(`def` = `'你是专业的短剧剧本分析助手。'`)、`W.extractSystem` 改签名收 `ov` 并把人设句换成 `Prompts.get(键, ov)`、两端取用口(`js/episode-util.js` `llmExtractSubjects` 与 `/api/wf/extract-subjects`)显式传覆盖表、SK-03 的 `prompts` 补键与仍欠段同步改。注意 `W.extractSystem` 的返回值有既有逐字节对账(`= 人设句 + Skills.block('subjects')`,W19 立),改签名时那几条要一并跟着改而不是绕开;`aiScriptDigest` 人物小传步的同字面内联属另一条链路,收不收是单独一题。
2. **注册表之外的内联人设仍是大头**,且不在 SK-03 的 `covers` 口径内:浏览器侧的导演阐述、光影总控、剧本围读、拉片分析、配音导演、节拍拆解、发行文案等十余处 system 半各写一份,既不双端也不可覆盖(G-13,W1 盘点第 7 条已登记)。要不要收编是产品口径题——注册表条目多了「全局默认值」页会变长,且这些步没有服务端对端,收进注册表只解决"可覆盖"不解决"可 headless"。本槽不动。
3. 拆集步的 `mockKind: 'split'`、计费动作 `llm.chat`、两道守卫(已有分集需 `overwrite`、在飞生成一律拒)与三种切分算法一字未动。
