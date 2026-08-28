# W243 普查类用例 live 重数:五面现取复核 + 抹码器跟丢的那 500 行

多波合入之后,写死调用点数与站点表的普查用例最容易变成两种坏形态:**陈旧打红**(源码动了而数字没跟着改)与**放宽**(数字看着对,其实是扫描面自己缩了)。本槽把 `tests/unit.js` 里这一类用例逐面现取重数,判据不取"用例是不是绿的"——绿只证明"断言值等于扫描器读回的数",不证明"扫描器读回的数等于源码实况"。每一面都另写一份口径不同的独立点数去对,对不上的才动。

结论:**六面里五面 live 一致、原样不动;第六面真漂了,而漂的不是断言值是扫描器**。

## 一、先把六面逐个现取重数

开工时 tip 是 `0a6114c`(`cursor/w241-integration-6b2d`),`node tests/unit.js` 跑出 **659/659 全绿**。下面每一面的"live"都是另写一段与用例口径不同的点数跑出来的。

### 1. `jsonEntryCallSites()` —— 42 处,原样

用例写死 `calls.length === 42`,并逐点点名三处间接给法与三处成员引用。独立重数的口径是"逐行裸扫两个入口名,再单独把别名口摊出来":

- 全仓 `js/` 裸计数(排开 `async chatJSON(` 两处定义)**42 处**,其中 **1 处**是真注释(`js/episode-util.js:131` 的 `// R1 收敛:统一走 API.chatJSONRobust(...)`),故真调用 **41 处**;
- 别名口 **1 处**:`js/agent-ops.js:125` 的 `const call = (window.Understanding && Understanding.chatJSONRobust) ? Understanding.chatJSONRobust.bind(Understanding) : API.chatJSON;`,它在 `:126` 上被 `call({...})` 调用 —— 41 + 1 = **42**,与写死值逐个对得上。
- 三处间接给法逐点复核:`js/agent-global.js:397` 是 `Object.assign({}, llmOptG, {...})`、`js/agent.js:498` 是 `Object.assign({}, llmOpt, {...})`、`js/understanding.js:8` 是 `const chatJSONRobust = opt => API.chatJSONRobust(opt);` 整参转发 —— 行号与形态都还在原处。
- 三处 `refs` 全在 `js/agent-ops.js:125` 那一行:该行同时出现 `Understanding.chatJSONRobust`(条件位)、`.chatJSONRobust.bind`、`API.chatJSON`(三元的另一支),不带调用括号故计三次。

另查了一件用例注释没说透的事:那份夹具的扫描面只有 `js/`,而注释里写的是"全仓"。现取 `server.js` / `cli.js` / `mcp.js` / `billing.js` 四个根文件 —— `cli.js`、`mcp.js`、`billing.js` **零提及**,`server.js` 两处提及**都在 `:2297` 那段注释里**(讲服务端 jsonMode 交付校验的散文),没有一个真调用点。故 `js/`-only 这个口径**此刻没有盲区**,不改。

### 2. `Commands.execute` 站点表 —— 漂了,见第二节

### 3. agent-ops 四类归类 —— 12 处,原样

用例写死 `EXPECT` 三个文件的分类清单。独立重数是全仓扫 `run(Episode|Global)Actions(` 再逐行判归属:

| 文件 | 裸命中 | 计入分类 | 逐点 |
| --- | --- | --- | --- |
| `js/agent.js` | 5 | 5 | `:334` 别名面 · `:371` 别名面 · `:408` 人手点击(`actOps`) · `:542` 非 exec(`safeActs`) · `:574` 闸内(`runOps`) |
| `js/agent-global.js` | 6 | 6 | `:231` `:232` `:289` 别名面 · `:314` 人手点击(`g.acts`) · `:445` 非 exec(`safeActsG`) · `:463` 闸内(`runOpsG`) |
| `js/agent-ops.js` | 3 | 1 | `:82` `:188` 是两个函数定义(被 `(?<!function )` 排掉)· `:175` cmdManual(`retries`);`:1304` 的导出清单不带调用括号故不命中 |

裸命中 14、计入 12,差的 2 处正是两个定义 —— 与 `EXPECT` 的 5/6/1 逐格对上。另确认**没有第四个文件**下发动作:全仓只有这三个文件出现过 `run(Episode|Global)Actions(`,`ACT_CMD` 也只在 `js/agent-ops.js` 一处。

### 4. MCP 工具数 / CLI 命令数 —— 39 与 49,原样

W240 刚把这两个数钉在 live 上,本槽不重复造,只现取复核一遍:运行期 `tools/list` 读回 **39** 条,源级 `TOOLS` 表字面 **39** 条且逐名相等;CLI `CMD['x']` **25** 处 + `CMD.x` **24** 处 = **49** = `Object.keys(CMD).length`。README 与 `docs/AI助手接入指南.md` 两处都写 39,`assertDocNum` 两侧都钉着。一个字不动。

### 5. 人设字面持有者名单 —— 原样

独立重数与用例写死的名单逐格相同:`js/api.js:2`、`js/experts-data.js:16`、`js/gsettings.js:1`、`js/prompts.js:40`(注册表 `def` 里以「你是」开头的恰 40 条)。`inlinePersonaHolders()` 那份「系统人设位上的内联人设」名单现取**为空**,G-13 余量总处数仍是 0。

### 6. `wfPersonaNote(` 调用点数 —— 8,原样

`server.js` 现取 **8** 处(1 定义 + 7 调用),`WfCore.personaNote(` 在 `server.js` 里 **0** 处;全仓 `personaNote(` 只有 `js/wf-core.js` 那一处定义。与写死值一致。

## 二、真漂的那一面:抹码器把 500 行源码抹出了扫描面

### 现象

`Commands.execute` 站点表那条用例先在 `blankNonCode()` 抹出的代码骨架上定位调用点(散文里写到的不算数),再回原文取第一个实参。现取一跑:

```
lit(写死下发)  = 15 处
vari(变量下发) = 5 个站点
```

而对着源码逐文件裸数,`Commands.execute(` 在 `js/` 下有 33 处提及。差额里绝大多数确实是注释与字符串(比如 `js/skills.js:991` 把 `Commands.execute(project.extractSubjects)` 写在一条 skill note 的正文里,理应扫不到)——**但 `js/storyboard.js` 那 6 处不是**:

```
js/storyboard.js:228  Commands.execute('episode.smartReview', ...)
js/storyboard.js:229  Commands.execute('episode.compose', ...)
js/storyboard.js:240  Commands.execute('episode.compose', ...)
js/storyboard.js:264  Commands.execute('episode.generateStoryboard', ...)
js/storyboard.js:278  Commands.execute('episode.compose', ...)
js/storyboard.js:334  Commands.execute('shot.generateVideo', ...)
```

六处全是真代码里的写死下发,而骨架上一处都不剩。整个 `js/storyboard.js` 的 660 个非空行里有 **504 行(76.4%)**被抹成空白,跟丢起点在 `:105`。同一把尺子量下去,`js/sb-views.js` 500/1328、`js/produce.js` 114/342、`js/director.js` 53/268 也各有一片。

### 根因

`blankNonCode()` 找模板串收尾时只数 `${` 的**插值深度**:进 `${` 加一,遇 `}` 减一。可插值里是真代码,里面的对象字面量与箭头函数体也带花括号,而它们的 `{` 一个都没被计进去、`}` 却照样把深度减掉。`js/storyboard.js:104` 正是这一形状:

```js
      ${window.Pipeline ? (() => {
        const nx = Pipeline.nextForEp(p, ep);
        ...
      })() : ''}
```

IIFE 的 `{` 不计,它的 `}` 把深度打到 0,扫描器于是认定插值已经结束、开始找收尾反引号 —— 找到的却是后面某个模板串的**开头**那一个。从这一刻起模板正文与真代码的身份整段对调,一路错到文件尾。

### 为什么这一面此前一条判据都没红

三层各自失守,而且失守方向一致(都朝着"看不见"):

1. **两道内容判据本来就是"不许出现"型**:写死下发里不许有人手命令、写死下发的名字必须在注册表里 —— 扫不到的那 6 处自然一条都不违反,不看反而更绿。
2. **那道"扫描口径失准"自检恰好蹲在被抹低的水位上**:它写的是 `lit.length >= 15 && variKeys.length >= 3`,而被抹低之后的实况正正好是 15 和 5。一道防止扫描失准的下限,自己被同一次失准校准到了失准值上。
3. **抹码器从不自报跟丢**:骨架配不配平只在 `reportBlockHeads()` 那一路(扫两个测试套件)当场抛错,而它俩的模板串里没有这一形状,故一直没触发;源码这一路一个自检都没有。

顺带记一件事实:`blankNonCode()` 的消费点有近二十处(拆集写入闸、处置口登记面、计划层出口、护栏主题锚点取值等等),**修完全部照旧全绿**。也就是说没有任何一条断言的期望值曾被校准到那个缩水的扫描面上 —— 唯一被校准过去的就是上面第 2 条那道下限。

### 改法:不另写一份内嵌扫描

第一版改法是就地把插值里的花括号配对起来,顺手跳过引号串。它在 `js/sb-io.js:69` 上当场翻车:

```js
    const fname = `剪映导入包_${ep.title.replace(/[\\/:*?"<>|]/g, '_')}.zip`;
```

插值里那个正则的字符类里有个 `"`,被当成字符串开头,又跟丢一次。教训很直接:**插值里是真代码,注释、引号串、正则、嵌套模板串一样都不会少,另写一份内嵌扫描必然跟不上主循环那一套判据**。

所以最终改法是把上下文栈提到主循环上:栈里 `'tpl'` 表示模板正文,数字表示该层 `${}` 插值里还没闭合的花括号数。处在模板正文时只认转义、`${` 与收尾反引号;一进插值就回到主循环原有的注释/引号串/正则/反引号判据上,花括号配平的那一下再回到模板正文。整段模板(含插值)照旧一次性抹掉,对外语义不变。

改完全仓复核:`js/` 全部文件 + `server.js` / `cli.js` / `mcp.js` / `billing.js` + 三个测试套件,骨架括号**逐文件净配平且中途不转负**。

### 改完的 live 读数

| | 修前 | 修后 |
| --- | --- | --- |
| 写死下发 `lit` | 15 | **21** |
| 变量下发站点 | 4(注) | **5** |

（注:第一版半吊子改法下 `release.js → fix.cmd` 也一度看不见;原始实况是 5,与 `SOURCED` 登记表相符。）

补回的 21 处按文件是 `agent-ops` 2 · `director` 1 · `pipeline` 1 · `produce` 2 · `release` 1 · `sb-batch` 2 · `sb-io` 1 · `sb-views` 5 · `storyboard` 6。新露头的那 6 处过两道内容判据:`episode.smartReview` ×1、`episode.compose` ×3、`episode.generateStoryboard` ×1、`shot.generateVideo` ×1 —— **一条人手命令都没有、六个名字全在注册表里**,故两句断言原样不动就全绿。变量下发的 `SOURCED` 五条登记表同样一格未改。

### 判据侧改两处

1. **下限按当轮实况抬到 `>= 21 && >= 5`**,并在注释里写明它此前为什么会蹲在被抹低的水位上;同时把"扫描面完不完整"这件事从这道下限上摘出去 —— 它只管"点不点得到调用点"。
2. **新增一条契约用例让抹码器自报扫描面完整性**:骨架逐文件净配平且中途不转负,跟丢即当场红。判据有意**不去数"应该扫到几处"**(那又是一个要人工同步、且会跟着扫描面一起缩水的数),改数括号 —— 跟丢字符串/模板串/正则的那一刻,被吞掉或多吐出来的括号当场破坏配平。用例自带两句自检不许它退化成空扫:扫描面文件数须 > 60,且 `js/storyboard.js` 的骨架上必须留得住 `Commands.execute(` 字面(那正是此前整段消失的那一片)。

两条失败含义分开:下限那条报的是"点不到调用点,本条不可信",自报那条报的是"扫描器在这些文件上跟丢了,所有同读它的普查/源级判据一起失准"。

## 三、棘轮

- `node --check tests/unit.js` 通过。
- **unit 660/660 PASS**(新增 1 条契约用例)。
- **integration 148/148 PASS**。
- **cli.smoke 115/117**,失败两条与 `master` 同名同表现:`未登录 whoami → exit 3`、`llm --json mock 链路`。
- FLOOR 与文档同轮抬到 live:单元 `FLOOR` 659 → **660**、README 单元段 659 → **660**、README 契约段 143 → **144**、记账件份数 256 → **257**(声明行与 `FLOOR` 各改一处)。
- 五格下限与 live 的差额现取全为 **0**(单元 660/660、集成 148/148、冒烟 117/117、记账件 257/257、护栏主题 19/19),`SLACK` 字面**一个字没碰**。
- 交接单点名的三处禁区原样:`Domain.dupRowsNote` 与 generateVideos 的 `note` 一字未动、`state-put` 仍只有 `need(f.force)` 一道闸、`Skills.gaps()` 仍 20 键。产品面(`js/` 与 `server.js` / `cli.js` / `mcp.js`)**零 diff**,本槽只动 `tests/unit.js`、`README.md` 与本目录。

## 四、留给下一槽的两件

1. **`jsonEntryCallSites()` 的两处脆弱**:它逐点点名的是 `文件:行号`(`js/agent-global.js:397` 等三处、`js/agent-ops.js:125` 三次),这一行以上插一行注释就会整条红,而那种红说明不了任何产品事实;它的 `isComment` 也只是"行首是不是注释符 / 行内有没有 `//`"这一层启发式,没走抹码器。此刻两者都不误判(本槽逐点验过),但都不是 live 口径,哪天真要动就一起换成抹码器骨架 + 锚点取代行号。
2. **抹码器自报只覆盖了括号这一维**:字符串/模板串跟丢基本都会破坏括号配平,但"抹多了一段而括号恰好仍配平"这一形状够不着。要再收一层的话,方向是拿骨架反解出的顶层声明名与真 `require`/`vm` 加载出来的导出面对一遍,而不是再加一个写死的处数。
