# W43 · SK-26 审片/发布闭环结论按板块回流协作记忆

**范围**:`js/wf-core.js`(新增 `memFeedback`/`memWrite` 两个纯函数)+ 四处写入点(`js/review.js`、`server.js` 的
`/api/wf/smart-review`、`js/release.js` 的 `stampRelease`、`cli.js` 的 `CMD.release`)+ `js/skills.js` 的 SK-26/SK-04 记账
+ `tests/unit.js` 的 memory 套件 6 条 + 三份文档同步。
**基线**:`cursor/w38-integration-8cc1`(`c44aff6`)。
**不做**:不新建存储桶、不新增领域命令、不新增计费动作与接口调用、不改发布门 `G1–G10` 的判据与 `fails/warns/overall`
计数口径、不改审片动作与达标线、不改 `Domain` 的任何判定、不改就绪检查面表、不动 `evolveExpert` 的实现。

## 1. 改前的实况

SK-26 `review.memoryFeedback` 的 `note` 从 W2 落表起就是一句话:

```
沿用既有记忆桶与自定义专家副本,不新建存储桶、不改预置专家数据;回流步骤尚无命令出口
```

`pending: ['orchestrate']`,`steps: []`。W33 的交接清单点过名:"SK-26 回流步无命令出口,**已连续三个周期未触及**"。
W36 清 `infra` 面时又把 `G-02` 单独留给了它("`G-02` 不随 SK-04 清账而闭:它另挂在 SK-26 的 `orchestrate` 面上")。

同时,记忆通道本身早就双端了(G-02):`WfCore.memRecall/memBlock` 是两端唯一一份召回算法,五处 wf 端点按板块 `scope`
注入,CLI `memory list/add` 与 MCP `hujing://memory` 也在链路上。**但写入面是全手动的**——浏览器「记住…」与 CLI
`memory add` 都要人打字。也就是说:召回那一半是自动的,沉淀那一半一直等着人来做。
SK-04 的 `note` 里第三处余量写的就是这件事:"服务端不自动沉淀本轮结论(按板块回流归 SK-26)"。

主线上真正跑完一轮、手里握着**结构化结论**的时刻只有两处:整集审片写完 `ep.lastReview`、发布留痕写完 `p.releases[]`。
这两处此前都是写完就散场,没有任何东西回到记忆里。

## 2. 产品判断:回流什么、**不**回流什么

回流面最容易做坏的两件事是"回流一堆噪音"和"回流模型的话"。本槽的取舍:

| 回流 | 判定输入 | 为什么 |
|---|---|---|
| 待返工镜数 `N/M` | `lastReview.perShot` 里低于 `WfCore.MEM_LOW_SCORE`(7,与审片报告重抽入口、发布门 G3 默认阈值同数)的条数 | 纯计数,与门禁读的是同一份逐镜分,不新造口径 |
| 共性问题类型(≤3) | `lastReview.common.issues[].type` | 结构化枚举字段,回答"这一集反复出的是哪几类",正是下一轮要规避的点 |
| 四维最弱维 | `lastReview.cut` 里分数最低那一维;**维度名现取 `WfCore.normalizeCut({})` 的产出形状** | 与 SK-24 校验面同口径,不写第二份四维名(四维改名/增减时回流文本自动跟上) |
| 发布门状态与未过门项 | 门禁结果的 `overall`/`fails`/`warns` 与 `gates[].label`(只读) | 回答"上一版被哪几项挡住",两端门禁结果同形状,一份派生够用 |

**有意不回流的:整集均分。** 成片板块的记忆会被下一轮**逐镜审片提示词**按板块召回
(`server.js` 与 `js/review.js` 都是 `memBlock(…, s.plot, '成片')`)。把上一轮的分数喂回评分方,等于给下一轮打分设锚点——
这不是"越用越懂你",是让分数自我强化。回流的用处是"要规避什么",不是"上次考了多少分"。
这条判断在 `wf-core.js` 的注释里写了原因,并有一条断言(`assert(!/7\.8/.test(text))`)钉住,谁把均分加回去就红。

同样不回流的还有:模型评语原文(`comment`/`summary`/`overall` 一律不取)、`checks` 命中(那一面归 SK-24 的报告字段)、
任何本层新造的评价词。判定输入取不到(无 `lastReview`、`avg` 非数字=审片全失败、门禁未跑)一律回**空数组**——
没有结论就不写记忆,不冒充。

## 3. 落地:派生一份 + 写入四处

派生与写入分离,派生在 `js/wf-core.js`,记忆数组一律**经参数注入**、函数体不碰任何环境句柄(与 `memRecall/memBlock` 同纪律):

```js
W.MEM_MAX = 50;       // 与浏览器 memRemember、CLI memory add 同上限
W.MEM_TEXT_MAX = 120; // 同上(单条截断)
W.MEM_LOW_SCORE = 7;  // 待返工线,只读不改门禁口径

W.memFeedback(o, ctx) // o={ep} | {p,gate,rel};ctx={now} → [{text,time,scope,fb}]
W.memWrite(mem, entries)  // 按 fb 键原地更新,回新数组(不改入参),尾部截 MEM_MAX
```

`scope` 取 `WfCore.WF_BOARD['smart-review']`(成片)——板块键仍是那张单源表,本层不写第二份板块名。
`fb` 是**回流键**(`review:<epid>` / `release:<pid>`):同一集反复审片、同一项目反复发布,`memWrite` 按键**原地更新**,
只留最新一条结论。这一条不是洁癖:桶上限 50 条先进先出,若每次审片都追加,二十轮下来用户自己沉淀的偏好会被自己的审片记录挤没。

四处写入点,各按自己那一端既有的通道把数组存回**既有** `state.agentMemory`:

| 端 | 写入点 | 通道 |
|---|---|---|
| 浏览器审片 | `js/review.js` `openEpisodeReview`(`ep.lastReview` 写好之后、原有那次 `Store.save()` 之前) | `Store.state.agentMemory` |
| 服务端审片 | `server.js` `/api/wf/smart-review`(`ep.lastReview` 之后、`wfSave` 落盘之前;CLI/MCP 同链路吃到) | state 树的 `tree.agentMemory` |
| 浏览器发布 | `js/release.js` `stampRelease`(`p.releases.push(rel)` 之后、原有 `Store.save()` 之前) | `Store.state.agentMemory` |
| CLI 发布 | `cli.js` `CMD.release`(随**同一次** `PUT /api/state` 带上 `changes.meta`) | meta 桶整组替换,与 `memory add` 同通道 |

三件事顺带说明:

- **不多一次 IO**:四处都挂在原本就要落盘/提交的那一步上,没有新增请求、没有新增 `state` 写入。CLI 侧有一条断言直接数
  `CMD.release` 段里 `await PUT|GET|POST(` 的出现次数必须仍为 1。
- **`js/release.js` 侧带降级**:`if (window.WfCore && WfCore.memWrite)`,与该模块"依赖缺失时安全降级"的既有纪律一致
  (它的头注释依赖清单已同步补上 `window.WfCore`)。
- **"回流专家"的自动那一半到此闭合**:条目带板块 `scope`,下一轮同板块的提示词按 `memBlock` 召回就吃到了
  ——不需要任何人点任何按钮。有一条断言把这件事验成闭环:回流写入后 `memRecall(mem, plot, '成片')` 必须能取回该条。

## 4. 记账:清 `pending`、保留 `gaps` 标记、**S-08 仍不挂**

`pending: ['orchestrate']` 清空,`steps` 登记一条真步骤:

```js
steps: [
  { cmd: 'episode.smartReview', args: {}, note: '审片闭环收尾即把该集可判定结论(待返工镜数/共性问题类型/四维最弱维)写回成片板块记忆桶,下一轮审片提示词按板块召回时吃到' },
]
```

**只登记审片这一步**:发布留痕两端(`Release.stampRelease` 与 CLI `release` 子命令)都在领域命令注册表之外,
编排层不为它挂假命令名——命令化这件事归 `G-12`(计划步骤/编排面改由注册表投影生成),`note` 里写明了。
`cmds` 不手写,由 `steps` 推出(沿用 W31 SK-16 定的规则),推出来正好是 `episode.smartReview` 一条。

`gaps: ['G-11', 'G-02']` 原样保留:`gaps()` 只投影 `gaps` 字段、不看 `pending`(W36 有逐字节比对的用例证明这一点),
落地不摘标记是本目录的关联索引口径。清账后的投影实况:

| | 本槽前(`w38`) | 本槽后 |
|---|---|---|
| 带 `pending` 的条目 | 2:`SK-05:orchestrate`、`SK-26:orchestrate` | **1**:`SK-05:orchestrate` |
| `gaps()` 键数 | 20 | 20(一字未动) |
| 仍开(关联条目还有 `pending`) | 2:`G-02`(SK-26)、`G-12`(SK-05) | **1**:`G-12`(SK-05) |
| `playbooks()` | 3 | **4**(多出 `review.memoryFeedback`) |
| `preflightStages()` / `Skills.check` 各面结论数 / `block()` 拼块 | — | 逐项未动(本槽一条校验项也没加) |

**S-08 为什么不挂在 SK-26 上。** S-08(发布后无回写上游的回路)自 W6 登记以来连着四个周期被记成"无关联入选项、
需决定做还是明确拒绝",而本槽做的正是它的一部分。但本目录的核验口径是"**看关联条目是否还有 `pending`** 来判缺口闭合"——
把 S-08 挂到一条已经没有 `pending` 的条目上,下一份周期核验会把它读成**已闭**,而 S-08 的另外两半根本没做:

1. **归因**:成片数据回不到"主线哪一步造成的";
2. **回流到项目策划侧**:结论没有进 `Plans`/`Issues`(本槽只进记忆桶,记忆桶喂的是提示词,不是计划)。

所以这里宁可让 S-08 继续显示"无关联入选项"(准确),也不换一个"看起来有人管了、实际读成已闭"的假账。
要挂,得先由产品定 S-08 的范围(见第 7 节交接)。同理,SK-04 的第三处余量按实况**改写而非删除**:
从"服务端不自动沉淀本轮结论"改成"自动沉淀只有审片/发布两个闭环,理解/分镜/拆集/提取主体几步的结论仍不回流"。

## 5. 断言与变异验证

memory 套件从 6 条加到 12 条(只增不改既有 6 条;`tests/unit.js` 全套 365 → **371**):

| 新增用例 | 钉住什么 |
|---|---|
| `memFeedback` 审片闭环 | 逐字节文案、`scope`/`fb`/`time` 三个字段、**均分不得出现**、维度名取 `normalizeCut` 形状、四维缺失/无共性问题时各段如实缺席、四种"判定输入取不到"一律回空 |
| `memFeedback` 发布闭环 | 门禁 `overall`/计数/未过门项逐字节、十门全过时的措辞、`ver` 回落 `p.__ver`、`ctx.now` 收函数也收字符串、门禁未跑回空、单条截到 `MEM_TEXT_MAX` |
| `memWrite` | 同 `fb` 键原地更新(反复闭环仍 1 条)、用户自己的条目不受影响、无 `fb` 按追加、超上限从头部丢且新结论保留、不改入参、脏入参安全、**写入后能被同板块召回** |
| 四处接线(源级) | 四个调用方都委托 `WfCore.memFeedback/memWrite`、**都不得内联回流文案**、四种落点写法逐一钉住、CLI 仍只发一次请求、`MEM_MAX/MEM_TEXT_MAX/MEM_LOW_SCORE` 与浏览器既有写入面字面同数、服务端回流点位于 `lastReview` 之后 `wfSave` 之前 |
| 行为面 | 真跑 `Review.openEpisodeReview`(离线本地评审,零 LLM)与 `Release.stampRelease`:记忆桶里真的多出那一条、能被 `memBlock` 召回、再审一次仍是 1 条、**未过门的发布不回流** |
| SK-26 记账 | `pending` 清空 + `steps` 命令已注册 + `cmds` 由 `steps` 推出 + 进 `playbooks()` + `gaps` 标记仍在 + `note` 点名 `G-11`/`G-12` 与"不新建存储桶/不改发布门" + `evolveExpert` 现仍读全量记忆(接上了 note 先失效)+ SK-04 的 note 已同步改写 |

行为面用例需要 `wf-core` 在浏览器沙箱里可用,故 `loadRelease()` 按 `index.html` 的顺序补了
`knowledge.js`/`prompts.js`/`wf-core.js` 三个加载(既有 release 用例的结论一条未变)。

**变异实测**(逐个改完跑 `node tests/unit.js`,验证后原样还原,`git diff` 为空):

| 变异 | 实测行为 | 转红 |
|---|---|---|
| `memWrite` 改成无条件 `push`(不按 `fb` 更新) | 反复闭环把记忆桶越审越满 | 2 条(`memWrite` + 行为面) |
| 把整集均分加回回流文案 | 上一轮分数被喂回评分方 | 2 条(派生 + 行为面) |
| 摘掉 `js/review.js` 的写入点 | 浏览器审片闭环不回流 | 2 条(源级 + 行为面) |
| 服务端写入点移到 `wfSave` 之后 | 回流结论不落盘(静默丢) | 1 条(源级位置断言) |
| SK-26 的 `pending` 退回 `['orchestrate']` 但留着 `steps` | 假记账 | `Skills.validate` 直接报"编排面未落地不得登记步骤",`playbook()` 退回 `null`、`playbooks()` 退回 3 条 |

## 6. 回归数字

| 套件 | 本槽 | 基线(`w38`,同机取) |
|---|---|---|
| `node tests/unit.js` | **371 / 371** | 365 / 365(净 +6 用例) |
| `node tests/integration.js` | 93 / 93 | 93 / 93 |
| `node tests/cli.smoke.js` | 62 / 64 | 62 / 64(失败两项逐项相同:`未登录 whoami → exit 3`、`llm --json mock 链路`,与本槽无关) |

`node --check` 过:`js/wf-core.js`、`js/review.js`、`js/release.js`、`js/skills.js`、`server.js`、`cli.js`、`mcp.js`、`tests/unit.js`。
文档同步:`README.md`(单元测试数、memory 套件覆盖面、`/api/wf/smart-review` 行为)、`mcp.js` 的
`hujing://memory` 资源描述、`cli.js` 的 `memory` 命令头注释、本目录 README 的索引行与摘要。

## 7. 交接

1. **G-11 仍欠(本槽点名保留)**:回流条目要进专家 `persona`,现在仍得**人**去专家库点「🧠 从使用记录进化」,
   且 `evolveExpert` 只对自定义专家开放、读记忆时不按 `scope` 过滤(`js/experts.js` 那行读的是全量 `text`)。
   要接:让蒸馏按板块取记忆(召回侧已有 `memRecall(mem, '', board)` 现成),并给预置专家一条"进化落到自定义副本"的入口
   ——后者是既有设计,不是新功能。接的时候 SK-26 的 `note` 与本槽那条 `evolveExpert` 断言会先红提醒。
2. **G-12 仍欠**:发布留痕两端没有领域命令出口,故回流的发布那一半进不了 `steps`。命令化(`project.release` 之类)
   要连着 CLI/MCP 与发布门口径一起定,不是本槽范围。
3. **S-08 待产品决策**(连续第五个周期):本槽做完了"发布/审片结论 → 记忆桶"这一段,**归因**与**回流到策划侧**
   (`Plans`/`Issues`)两段仍没有。要么定范围后进短名单(短名单变 31 条,波次配比断言要同步改),
   要么在 `w1-selected-skills.md` 第 7 节标"明确拒绝"。第 4 节说明了为什么本槽**不**把 S-08 挂到 SK-26 上充数。
4. **其余 wf 步的结论仍不回流**:理解/分镜/拆集/提取主体四步跑完也各有结构化产出(如用户在向导里改过的主体名、
   手改过的集数与切点),按 SK-04 的余量记账在案。要接就复用本槽这套(`memFeedback` 多一个分支 + 该端点一行写入),
   但先想清楚每一步"可判定的结论"到底是哪几个字段——回流噪音比不回流更糟。
5. **回流条目会进提示词**:成片板块的召回面吃得到它,意味着审片提示词的字面在"审过一次之后"会多出一段。
   若要给回流条目做展示区分(记忆弹窗里现在与普通条目同款),`fb` 字段是现成的判据。
