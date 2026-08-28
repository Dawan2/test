# W103 · 用户自己那半个写入面也接 `WfCore.memWrite`:满桶时新加一条「记住…」不再挤掉别的用户条

**范围**:`js/agent.js` 的 `memRemember`(3 行 → 2 行)+ `cli.js` 的 `memory add` 那一行
+ `js/skills.js` 的 SK-26 `note` 一句 + `tests/unit.js`(memory 套件 +1、两条源级断言翻面)
+ `tests/cli.smoke.js` +4 + `README.md` 四处。
**基线**:`origin/cursor/w101-mem-cap-priority-a0cd`(`a4808a3`)。**未合并 W93–W102 的其余各支。**
基线选择:任务给的起点是 `w95`,但 `w101` 已经把满桶优先级淘汰落进 `WfCore.memWrite` 并留了这处残留的交接
(w101 记账件第 7 节第 1 条),在 `w95` 的旧 `slice` 策略上再铺一层等于把同一件事做两遍,故取 `w101` HEAD。
**不做**:不改 `MEM_MAX = 50` 这个数、不改 `memWrite` 的淘汰算法(基线已落地,本槽只是把两个调用方接进去)、
不改 `memFeedback` 与 `fb` 键口径、不改 120 字截断、不改召回/播种/迁移、不新建存储桶、不新增计费。

## 1. 改前的实况:淘汰优先级只对自动那一半生效

`w101` 把满桶淘汰改成"先挤最旧的自动回流条(带 `fb`),用户自沉淀的留住",但那个策略住在
`WfCore.memWrite` 里,而只有**闭环回流**的六处写入点走 `memWrite`。用户手打的那一半是另外两处,
各自写着一份裸截断:

| 写入面 | 触发 | 改前的写法 |
|---|---|---|
| `js/agent.js` `memRemember` | 对话里说「记住…」、应用修改后自动记录、确认预排方案 | `mem.push({…}); Store.state.agentMemory = mem.slice(-50);` |
| `cli.js` `memory add` | `hujing memory add --text …` | `meta.agentMemory = mem.concat([entry]).slice(-50);` |

`slice(-50)` 砍的是数组头部。桶被自动回流条占满之后(按 `w101` 的算法,自动条会被逐个挤出,
**留下来的头部正是那些受保护的用户条**),用户再加一条「记住…」——砍掉的就是排在最前面的另一条用户条。

也就是说 `w101` 之后出现了一个更别扭的形态:**自动条写入时会绕开用户条,用户条写入时反而只砍用户条**。
两条用户偏好,先写的那条会被后写的那条顶掉,而桶里同时躺着 48 条随时可再生的回流统计。

改前的行为对照(桶恰好 50 条 = 2 条用户 + 48 条自动,再写一条用户条):

| | 出局的是谁 | 桶里剩下的用户条 |
|---|---|---|
| 改前(裸 `slice(-50)`) | 最早那条用户条 | 2 条(旧的少一条、新的多一条) |
| 改后(经 `memWrite`) | 最旧那条自动回流条 | 3 条 |

## 2. 产品判断

### 2.1 为什么是"接进去"而不是"在写入面复制一份优先级"

淘汰优先级已经是一个纯函数里的 5 行。两处调用方要的语义与回流侧完全相同:
**追加一条、守住上限、满了先丢可再生的那类**。`memWrite` 对无 `fb` 的条目本来就走追加
(W43 立函数时就把"无 `fb` 按追加"写进了契约,并有断言钉着),所以接进去不需要给 `memWrite` 加任何参数、
加任何分支——两处调用方各删一行截断、改成一行 `memWrite` 即可。

反过来,在写入面各自复制一份优先级判断,就是把同一个淘汰口径写成三份;下一次改优先级
(交接第 2 条说的第三档 `kb` 种子)要同时改三处,而其中两处没有任何断言拦着。

### 2.2 用户条挤用户条时该丢哪一条,本槽不回答

接上 `memWrite` 之后,"桶里全是用户条、再加一条"这一路仍然退回先进先出——挤掉最早那条用户条。
这与改前一字不差,本槽有意不动:那一路是**容量真的不够**,不是淘汰顺序选错;
要改就得回答"用户偏好该按什么排序丢",而那需要引入新的判据(命中频次?最近召回时间?),
不是本槽这一行改动能承载的。本槽解决的是"明明有可再生的自动条可丢,却去丢不可再生的用户条"。

### 2.3 落盘时机与调用点一行未动

`memRemember` 仍然是"算完就 `Store.save()`",`memory add` 仍然是"拼 `meta` 桶随那一次 `PUT /api/state` 落盘、
`rev` 冲突仍重试 3 次"。`memRemember` 的七个调用点(`js/agent.js` 三处、`js/agent-global.js` 三处、`js/agent-ops.js` 一处
经 `AC.memRemember`)一个没碰,`memAll()` 的播种/迁移一步没改——本槽只换了"算出新数组"那一步。

## 3. 落地

```js
// js/agent.js
function memRemember(text, scope) {
  text = String(text || '').trim();
  if (!text) return;
  const entry = { text: text.slice(0, 120), time: Store.now(), scope: scope || '' };
  Store.state.agentMemory = WfCore.memWrite(memAll(), [entry]);
  Store.save();
}

// cli.js CMD.memory 的 add 支
meta.agentMemory = WfCore.memWrite(mem, [entry]);
```

`memAll()` 仍在原位(先播种/迁移再写入),`entry` 的字段集与 120 字截断两端仍各写一份且仍有断言对齐。
`cli.js` 的 `WfCore` 是模块顶部既有的 `require`,没有新增依赖。

50 这个数字自此**只在 `js/wf-core.js` 的 `W.MEM_MAX` 一处**(`js/agent.js` 里剩下的 `slice(-50)`
是 `ep.agentChat` 的聊天历史上限,与记忆桶无关)。

## 4. 记账

`js/skills.js` SK-26 的 `note` 在 `w101` 写的那段两层机制之后补一句:

> 用户手打那一半的写入面(浏览器 memRemember、CLI memory add)也走这同一个 memWrite,
> 故桶被自动条占满时新加一条「记住…」挤的仍是自动条,不会挤掉别的用户条。

`pending`/`gaps`/`steps`/`prompts`/`cmds` 一字未动(本槽不清欠账、不加校验项、不动缺口标记),
故 `Skills.gaps()`、`preflightStages()`、`playbooks()`、`block()` 拼块逐字节不变。

## 5. 断言:两条源级断言翻面 + 两层行为面

### 5.1 翻面的两条源级断言(`w101` 交接第 1 条点名的代价)

两条断言认的是字面,改完那两个字面就不存在了:

| 位置 | 改前认什么 | 改后认什么 |
|---|---|---|
| `memory · 协作记忆双端单源(源级)` | `ag.includes('agentMemory = mem.slice(-50)')` 且 `cli.includes('mem.concat([entry]).slice(-50)')` | 按段取(`memRemember` 函数体 / `memory add` 那一支):两端各须命中 `WfCore.memWrite(memAll(), [entry])` / `WfCore.memWrite(mem, [entry])`,且**段内不得再出现任何 `slice(-`** |
| `memory · 回流写入面四处接线(源级)` | `ag.includes('slice(-' + W.MEM_MAX + ')')`(浏览器写入面字面与常量同数) | 删掉这半句(50 已收口到 `wf-core` 一处),`MEM_TEXT_MAX` 那半句原样保留;`assertEq(W.MEM_MAX, 50)` 改成"本层是上限的唯一持有处" |

翻面时把**判据收窄**了而不是放宽:原先只要文件里某处有那个字面就算过,改后是按函数段取、
且加了"段内不得再自己截尾"的反向条件。这一步是必须的——`js/agent.js` 里 `slice(-50)` 改后仍有 8 处命中,
全是 `ep.agentChat` 的聊天历史上限;整文件搜的写法在本槽之后会**恒真**,等于断言失效而不报。

条目字段集那一组断言(`fields()` 比对两端 `entry` 字面)只把浏览器侧的定位锚点从
`mem.push({…})` 换成 `const entry = {…}`,判的东西没变。

### 5.2 新增行为面

| 层 | 新增 | 钉住什么 |
|---|---|---|
| `tests/unit.js` memory 套件 +1(29 → 30,全套 **462 → 463**) | 浏览器 `memRemember` 满桶真跑 | `loadAgent()` 沙箱里先播种(7 条种子),再把桶灌到恰好 `MEM_MAX`(2 条用户 + 种子 + 41 条自动),真调 `AgentCore.memRemember`:①仍守 `MEM_MAX`;②新沉淀那条在桶尾;③**桶头部那两条用户条一条不少**;④出局的是 `sb:cap0`(最旧自动条)而 `sb:cap1` 仍在;⑤播种条目也一条不少;⑥120 字截断与"空文本不写也不落盘"两个既有口径不变 |
| `tests/cli.smoke.js` +4(**97 → 101**) | CLI `memory add` 满桶真跑 | 夹具直打 `PUT /api/state` 把桶灌到恰好 50 条(2 条用户 + 48 条 `sb:capN`),再走真实 `cli memory add`:①夹具就位(50 条、48 条带 `fb`);②`add` 后桶仍 50 条;③两条已有用户条都在且新加那条在桶尾;④`sb:cap0` 出局而 `sb:cap1` 仍在 |

CLI 那一层放在 `cli.smoke` 而不是 `integration`:淘汰发生在 `cli.js` 里、在那一次 `PUT` **之前**,
纯 HTTP 打端点复现不出来(要么复现不了,要么只能在测试里再抄一份 `memWrite` 调用——那就不是在测 CLI 了)。
夹具整组替换 `agentMemory`,故这一段放在记忆段末尾,后续用例不再读记忆桶。

### 5.3 变异实测

把两处写回改前的裸 `slice`(跑完原样还原、`git diff` 为空):

| 套件 | 实测 | 报的是什么 |
|---|---|---|
| `node tests/unit.js memory` | **28/30,2 红** | 源级那条报"两端写入口的条目字面都应可定位"(浏览器侧 `const entry = {` 没了);行为面那条报`桶头部那两条用户条一条不少:期望 "…林晚晴,…偏冷色",实际 "…偏冷色,分镜提示词五段式标准结构…"` —— 林晚晴那条被砍,顶上来的是种子条 |
| `node tests/cli.smoke.js` | **97/101,比基线多 2 红** | `已有的用户条一条不少…:["…偏冷色","…雨夜戏一律手持"]`(林晚晴出局)、`出局的是最旧那条自动回流条…:["-","sb:cap0",…]`(该出局的 `sb:cap0` 还在) |

两层都点名到"少了哪一条用户条",不是只报个条数不符。

## 6. 回归数字

| 套件 | 本槽 | 基线(`w101` `a4808a3`,同机取) |
|---|---|---|
| `node tests/unit.js` | **463 / 463** | 462 / 462(净 +1) |
| `node tests/integration.js` | **130 / 130** | 130 / 130(净 0,一条没加也没改) |
| `node tests/cli.smoke.js` | **99 / 101** | 95 / 97(净 +4,全过) |

`cli.smoke` 那 2 项失败(`未登录 whoami → exit 3`、`llm --json mock 链路`)现开 `origin/master`
工作树取证,**逐项同名同现象**(master 侧 51/53,同这 2 条红),与本槽无关。

`node --check` 过:`js/agent.js`、`cli.js`、`js/skills.js`、`tests/unit.js`、`tests/cli.smoke.js`。
文档同步:`README.md` 的单元套件数(462 → 463)、`cli.smoke` 套件数(97 → 101)、
memory 套件的写入面覆盖描述、`cli.smoke` 覆盖项列表、导演助手段那句"上限 50 条";本目录 README 的索引行与回流面摘要。

## 7. 交接

1. **`w101` 交接第 1 条至此清空**,第 2 条(第三类条目 `kb` 种子的优先级)与第 3 条(淘汰静默无提示)仍开。
   第 2 条现在更值得做一点:本槽的单测夹具里种子条已经和用户条一起受保护
   (用例里那句"播种条目也一条不少"),而种子是 `POST /api/wf/memory-seed` 随时可补种的。
   要接就按 `fb` → `kb` → 其余三档排,`memSeed` 侧一行不用动,断言加在 `memWrite` 那条用例里。
2. **"用户条挤用户条"仍在,只是范围缩到"桶里一条自动条都没有"**(见 2.2)。
   50 条纯用户偏好是极端形态,真要处理,先做的应该是记忆弹窗的"已达上限"提示而不是更聪明的淘汰。
3. **120 字截断仍是两端各写一份字面**(`slice(0, 120)`),有断言与 `W.MEM_TEXT_MAX` 对齐但没收口。
   收口的做法是让 `memWrite` 自己截 `text`,代价是回流侧 `memFeedback` 已经截过一次
   (会变成截两次,幂等但多一次),以及要重定两端那三条字面断言。收益只有"少一份字面",没排进来。
4. **`memory add` 的 `rev` 冲突重试与淘汰的交互**:重试会重新 `stateGet` 再算一次 `memWrite`,
   所以并发下不会算在旧桶上——这一路没有新增断言(要造 `rev` 冲突得同时打两个写),
   但重试位置在 `memWrite` **之前**,结构上就不成立。
