# W226 · 同 id 两镜收两笔视频钱的根:`shots-import` 写入闸放行重复镜头 id

**范围**:`cli.js`(+16 −1,`CMD['shots-import']` 落库前那一段)、
`tests/unit.js`(+1 条 `commands` 用例 + 单元 `FLOOR` 字面)、
`README.md`(单元用例数 + `shots-import` 那一行用法)、`docs/skills-wave/README.md`(份数 + 索引行)。
**基线**:`cursor/w222-integration-b7e1`(`3e8893f`,现取核实与自称一致)。
**结论**:停工位**不成立**——分镜表的镜头 id 是**唯一寻址键**(`findShot` 按 id 取首行、
`shot-set` 把 `id` 列为受管字段不许直写、审片报告按 `shotId` 回写、`Domain.emptyBatchNote`
自己写着「重复的 id 指的是同一镜」),同 id 多行不是"分身/多段"的产品意图,而是写入侧漏出来的。
全仓**唯一**能写出重复 id 的写入点是 `cli.js` 的 `normShot` 里 `raw.id ||` 那一处透传
(`hujing shots-import` / MCP `hujing_shots_import` 同一条),故按交接第二档在**写入闸**最小修:
撞上表内已有或本次已分配的 id 就改发新 id,并如实回报 `renamedIds`。
**不做**:`js/produce.js` / `js/commands.js` 的 digest 与 smartReview note、`emptyBatchNote` 四堆、
`emptySubjectImageNote`、`js/plans.js`、按钮 / `js/pipeline.js` / `js/storyboard.js` 那一行一字未碰;
**计费笔数与选人闸「点名跑几行」一字未动**;不剥 `Skills.gaps()`;不登记 `GUARD_TOPICS`;
不 cherry-pick 飞行中的 W224 / W225。

## 1. 基线 live 举证

两次都起真服务端(`node server.js`,`MOCK_LLM=1`)、真 CLI 子进程、临时账号用完即清,
基线代码原样(第一次跑在改动之前)。

### 1.1 写入闸:同 id 两行落得进去,`--append` 还能再撞一次

```
shots.json = [ {id:"dup", plot:"同 id 第一行", …}, {id:"dup", plot:"同 id 第二行", …} ]

hujing shots-import <pid> <epid> --file shots.json
  → exit=0  {"imported":2,"total":2,"replaced":true}
hujing shots <pid> <epid>
  → ids = ["dup","dup"]   count = 2          ← 两行同 id,一声没吭

shots2.json = [ {id:"dup", plot:"追加撞 id", …} ]
hujing shots-import <pid> <epid> --file shots2.json --append
  → exit=0  {"imported":1,"total":3,"replaced":false}
hujing shots <pid> <epid>
  → ids = ["dup","dup","dup"]                 ← 追加导入撞表内已有 id 同样放行
```

来路是 `normShot` 第一行 `id: raw.id || 'sh_' + …`:`raw.id` 原样透传,没有任何唯一性判据。
这处透传本身**有存在理由**(整表 `hujing shots` 导出、改完再 `shots-import` 导回时,
`video` / `reviews` / `confirm` / `audioMeta` 全靠 id 认领原镜,`normShot` 也确实逐个透传这些字段),
所以本槽不删透传,只在它旁边加一道唯一闸。

### 1.2 选人闸:点名一个 id,引擎按行实收

同一份夹具接着跑(三行同 id,均已确认、均未出片):

```
hujing exec episode.generateVideos --pid … --epid … --args '{"shotIds":["dup"]}'
  → exit=5
  result.total = 3
  result.failed = [ {shotId:"dup",order:1,…}, {shotId:"dup",order:2,…}, {shotId:"dup",order:3,…} ]
```

点名 **1 个 id**、引擎实收 **3 行**。选人闸是 `pend = (ep.shots||[]).filter(s => … ids.has(s.id) …)`
(`cli.js` 与 `js/commands.js` 各一份,写法逐字同形)——它按**行**筛,而 `ids` 是按 id 建的集合,
一行匹配一次。回执计数 `total` 数的正是真跑的行数,**没有错**:错的是表里有三行同 id。

### 1.3 计费笔数:一个 id 收几笔视频钱

1.2 那一跑离线无 key,服务端 `/api/volc/video` 的 `if (!CONFIG.volcApiKey) return fail(503)`
落在 `proxyCharge` **之前**,故余额从头到尾 100 未动、`usage` 无记录——**扣费面没被这一跑量到**。
换一跑量:`VOLC_API_KEY=fake-key-w226` 起服务端(扣费照走,上游 401 后自动退费),
两行同 id、都带 `image` 且 `noImage:true`(避开补图那一笔,只量视频这一笔):

```
ids = ["dup","dup"]
余额前 = 100
hujing exec episode.generateVideos … --args '{"shotIds":["dup"],"noImage":true,"timeout":1}'
  → exit=5   result.total = 2   failed 两条,shotId 都是 "dup"
余额后 = 100
台账(credits)= [ refund:+5 …, charge:-5 "生视频(video.gen):漫剧风格,镜一…",
                 refund:+5 …, charge:-5 "生视频(video.gen):漫剧风格,镜一…" ]
usage <pid> = {"count":2,"charged":10,"refunded":10,"net":0,"families":{"video":{"count":2,"net":0}}}
```

**点名一个 id 登记了两笔 `video.gen`**(`charged:10` = 2 × 5)。这一跑净额为 0 只是因为假 key 让
上游 401、服务端如实退费;真 key 下两笔都会交付,两笔钱都花出去。

台账里还露出第二重后果:**两笔的 `reason` 都是第一行的提示词**(`漫剧风格,镜一`)。
`cli.js` 生成循环里每轮 `findShot(epLive, s.id)` 取的是 `.find(x => x.id === sid)`——**永远是首行**,
于是第二笔生成的视频又写回首行,把第一笔的产物覆盖掉。第二行既跑不到自己、也没有任何产物,
钱花了什么也没多出来。

### 1.4 全仓写入点盘点:重复 id 只有这一条路

| 写入点 | id 从哪来 | 会不会重复 |
|---|---|---|
| 浏览器加镜 `js/sb-views.js`、插入镜同文件 | `WfCore.blankShot(…, uid)` → `Store.uid('sh')` | 不会 |
| CSV 导入 / 文本导入 / 资产库导入 `js/sb-io.js` | 同上 `blankShot` | 不会(表里 id 一列压根不读) |
| 本地兜底拆镜 `js/sb-llm.js` `publishShots` | 同上 | 不会 |
| LLM 拆镜(浏览器 `js/sb-llm.js` / 服务端 `/api/wf/smart-storyboard`) | `WfCore.normalizeLLMShot` 里 `ctx.uid('sh')`,模型给的字段进不来 | 不会 |
| 导演助手 `insert` `js/agent-ops.js` `mapShotFields` | `window.SB.blankShot` | 不会 |
| 节拍板转分镜 `js/beatboard.js` | `blankShot` / `Store.uid('sh')` | 不会 |
| 版本回滚 / 采用方案 / 整表覆盖 | 整表替换,表内 id 集合原样搬 | 不会(表内不新增重复) |
| **`cli.js` `shots-import`(CLI + MCP `hujing_shots_import`)** | **`raw.id` 原样透传** | **会** |
| `state-put` / `PUT /api/state` | 调用方给什么写什么 | 会,但 README 明写它是"任意复杂操作的逃生舱",本槽不设闸 |

### 1.5 停工判定

交接给的停工条件是「产品允不允许同 id 多行(分身/多段)且计费按行是意图」。逐条现取:

- `cli.js` `findShot`、`shot-set`、`shot-confirm`、抽帧评审、`gen-shot-video` 全按 id 取**首行**,
  重复 id 时第二行**没有任何入口够得着**——真要"分身/多段"就不会是这个形态;
- `cli.js` 的 `SHOT_PROTECTED` 把 `id` 列为受管字段,`shot-set` 明令不许直写 id;
- `js/domain.js` `emptyBatchNote` 里写着「点名清单按镜去重:重复的 id 指的是同一镜,不该被数成两镜」;
- 审片报告 `lastReview.perShot[].shotId`、`ep.uiSel`、批量选择、镜头组全按 id 认镜。

四处一致:**id 是唯一寻址键**。故这不是"按行计费的产品意图",是写入侧本该唯一却写出了重复。
**不停工**,按写入闸修。

## 2. 改的是哪一闸

`cli.js` `CMD['shots-import']` 落库前(`normShot` 之后、`ep.shots = …` 之前)加一段唯一闸:

```js
const taken = new Set(f.append ? (ep.shots || []).map(s => s.id) : []);
let renamed = 0;
norm.forEach(s => {
  if (taken.has(s.id)) {
    renamed++;
    do { s.id = 'sh_' + Date.now().toString(36) + '_' + crypto.randomBytes(4).toString('hex'); } while (taken.has(s.id));
  }
  taken.add(s.id);
});
if (renamed) log(renamed + ' 镜的 id 与表内已有/本次重复,已改发新 id(…)');
```

四件事各自有理由:

- **改发新 id 而不是拒收整份导入**:口径取仓里已有的那一份——`js/store.js` `trashRestore`
  在项目/分集/资产 id 冲突时就是改发新 id 并回 `renamed`。一行 id 撞车不该让一份两百行的
  导入整份失败,而"两行同 id"的唯一自洽读法本来就是"这是两镜",给第二行发新 id 正是这个读法。
- **首行留住用户给的 id**:导出改完导回那条路径靠它认领原镜(视频/审片/确认态都挂在 id 上),
  改的只是撞车的后来者。
- **`--append` 与整表替换用同一道闸**:`taken` 初值在 append 时装表内已有 id、整表替换时为空
  (整表替换后旧 id 全不在表里,拿它去挡是误伤)。
- **回报 `renamedIds` 并 `log` 一句**:静默改 id 等于把寻址键悄悄换了,用户按老 id 再来 `shot-set`
  会得到"镜头不存在";数字如实回给调用方(MCP 同一条链路原样透出)。

**选人闸与回执计数一字未动**:`filter(s => … ids.has(s.id) …)` 与 `total = todo.length`
两端四处逐字节未改。点名两行仍跑两行、仍收两笔——那是正常子集的正常行为,
本槽拿掉的是"两行本不该同 id"。

## 3. 加测

一条 `commands` 用例(该套件已有 CLI `loadCli` 沙箱与引擎实收记录 `__genShots`,直接接着用):

| 套件 | 用例 | 钉的是 |
|---|---|---|
| `commands` | `CLI shots-import:同 id 两行进不了分镜表(撞 id 改发新 id),点名一次引擎就只收一行` | 两行都落库(闸改的是 id 不是砍行)、`renamedIds` 如实回报、首行仍认领用户给的 id、撞车行改发 `sh_` 新 id、`--append` 撞表内已有 id 同样改、落库后 id 逐个不重、点名一次引擎实收 1 行且 `total=1` |

用例走的是真 `CMD['shots-import']`(经 `vm.runInContext('CMD', sb)` 取出)+ 真
`EXEC['episode.generateVideos']`,只有落库与生成引擎是桩,故"闸有没有生效"与
"生效之后点名跑几行"在同一条用例里连着量。

用例注释里写明了本条**不许**改成"选人按 id 去重只跑一行"来假过——那会把点名两行的正常子集
一起砍掉,是把根上的漏斗挪到闸下游。

## 4. 变异

`git stash push cli.js`(把本槽这一段整段撤掉)后跑 `node tests/unit.js commands`:

| # | 变异 | 结果 |
|---|---|---|
| 1 | 撤掉整段唯一闸(回到基线 `normShot` 直落) | 红 **1**:`改发新 id 的镜数要如实报出来(静默改 id 等于把寻址键悄悄换了):期望 1,实际 undefined` |

`git stash pop` 还原后 48/48 绿。基线那一路的后续断言(`ids` 三行不重、点名实收一行)
在第一句就已经拦下,与 1.1–1.3 现跑到的 `["dup","dup"]` / `total=3` / 两笔 `video.gen` 同一回事。

## 5. 回归数字(live)

| 套件 | 基线 `3e8893f` | 本槽 |
|---|---|---|
| `unit` | 643/643 | **644/644** |
| └ `commands` 子套件 | 47 | **48** |
| `integration` | 147/147 | **147/147**(未动,实跑复核过) |
| `cli.smoke` | 107/109 | **107/109** |

`cli.smoke` 的两条失败与 `master`(`9adcf0f`,另起 worktree 现跑)**同名同形**:
`未登录 whoami → exit 3`、`llm --json mock 链路`,`master` 那边是 51/53、同样这两条。
本槽零新增失败,`shots-import` 那两条既有冒烟用例(`shots-import 2 镜`、追加导入)照旧绿——
它们的夹具不带 `id` 字段,走的是 `normShot` 自发 id 那一路,`renamedIds` 恒为 0。

产品面只动 `cli.js` 一段(+16 −1,其中 4 行是注释);
`js/produce.js`、`js/commands.js`、`js/domain.js`、`js/plans.js`、`js/pipeline.js`、
`js/storyboard.js`、`js/sb-io.js`、`js/sb-views.js`、`server.js`、`mcp.js` 一字未改。
治理面零变动:`Skills.gaps()` 键数、注册表条数、`CHECKS`、
`GUARD_TOPICS` / `GUARD_TOPICS_CLOSED` / `TOPIC_FLOOR` 一个数没动。

棘轮按 **live** 抬:`tests/unit.js` 单元 `FLOOR` 643 → **644**、记账件 `FLOOR` 236 → **237**;
`README.md` 的「单元测试(N 项断言」643 → 644;
`docs/skills-wave/README.md` 明写份数 236 → **237**(含本份)。
`README.md` 的 `shots-import` 用法行同轮补上新语义(带 id 的行按 id 认领原镜,撞 id 改发新 id 并回 `renamedIds`)。

## 6. 交接

1. **W223 那笔账到此闭合的是根,不是全部**:重复 id 从 `shots-import` 这条路进不来了,
   但**存量数据里已经躺着的重复 id 本槽没有迁移**——老项目里若已导入过同 id 两行,
   点名一次照旧两行都跑。要不要在读取侧补一次性去重/改名是另一档活(它会改动既有产物的挂载点,
   不是写入闸能承担的),本槽只保证从今往后写不进去。
2. **逃生舱那一路仍开着**:`state-put` / `PUT /api/state` 可以把任意 state 灌进去,含重复 id。
   README 明写这两个是"任意复杂操作的逃生舱",给它设闸等于给逃生舱上锁,本槽有意没动,如实登记。
3. **`emptyBatchNote` 四堆的同形口子照旧开着**(W217 §6.3 已登记):点名那一支里
   `locked` / `fresh` / `gone` / 安全阀四堆全从 `hit` 里数,表里同 id 两镜时每一堆都会多算。
   本槽的写入闸让这种表**不再新产生**,但没有收那四堆的数法;交接明令不碰,故一字未改。
   收它的时候得四堆一起判,不能只补 `gone` 那一句。
4. **主体库那一侧同形**:`cli.js` 的主体导入/复制路径也有 id 面(`findSubject` 同样取首行,
   还多认一层按名匹配),W217 §6.5 记的"主体库为什么会有同 id 两位"至今没追到源头。
   本槽只走了镜头这一侧,主体那一侧一个字没碰。
5. **冲突面提示**:本槽改的 `cli.js` 段落是 `CMD['shots-import']` 落库前那几行,
   与 W224(`js/produce.js` / `js/commands.js` 审片空跑 note)无交集;
   与 W225 合入链的交集只在带数字的那几行——`tests/unit.js` 的单元 `FLOOR`、
   `README.md` 的单元用例数、`docs/skills-wave/README.md` 的明写份数与索引表尾。
   **两侧给的数一个都不是答案**,合完得现取 live 再写。
