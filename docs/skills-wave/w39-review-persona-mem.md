# W39 · 审片侧三步接上人设/记忆 ctx 通道(SK-03 / SK-04 的覆盖余量)

> 基线 `cursor/w36-infra-pending-align-cf33 @ fe62f71`(W36 `infra` 三条清账后的头部,已含 G-01 唯一装配口 `wfPersonaNote` / G-02 记忆下沉 / G-03 审片主线步),落地分支 `cursor/w39-review-persona-mem-9fe5`。
> 本槽做的是 W36 第 10 节交接第 2 条:把**分镜评审 / 整集共性汇总 / 四维成片评审**三步的人设与记忆通道接上,接到既有装配口(服务端 `wfPersonaNote`、浏览器 `personaNoteFor`、两端 `WfCore.memBlock`)。
> 不改发布门(`js/release.js` 一行未碰)、不新增计费动作(三步仍各按 `llm.smartSB` / `llm.review` 原口径按次计费)、未删测(改写 1 条既有用例的断言方向并加密,新增 1 条)。

## 1. 缺的不是漏传参,是模板上没有字段

W36 第 3.1 节把这件事记准了:三步的 user 模板是**双端唯一来源**,而模板里根本没有 `personaNote` / `memText` 两个 ctx 字段——

```js
W.sbReviewUser = (shots, styleText, ov) => Prompts.fill('sb.reviewUser', { … }, ov);
W.buildSumUser = reports => { … };
W.buildCutUser = brief => `按四维标准评审以下整集分镜…`;
```

所以「两端同缺」是结构性的:服务端 `/api/wf/smart-storyboard` 的评审步、`/api/wf/smart-review` 的集级两步与浏览器 `js/sb-llm.js`、`js/review.js` 都只调这三个函数,谁也注入不进去。反过来也成立:**通道开在模板上,两端会同时接上**。

W36 把这三步定为"产品口径题"暂不落地。本槽按用户口径落地,补的就是那三处模板字段。

## 2. 结果一句话

三步的提示词各多一段「生效专家方法论 + 历史协作记忆」,注入段**独立成段拼在提示词最前、正文一字不改**;**未雇佣专家且无沉淀记忆时输出逐字节不变**(空注入串一律回空段,不留空行)。

回归:`unit 353/353`(基线 352,改写 1 条 + 新增 1 条,净 +1 用例)、`integration 93/93`、`cli.smoke 62/64`(两项失败在基线 `w36` 上逐项相同:`未登录 whoami → exit 3`、`llm --json mock 链路`,同一台机器上取的基线对照)。

改动:`js/wf-core.js` +18−6(装配口 + 三个模板签名)、`server.js` +5−3、`js/sb-llm.js` +8−4、`js/review.js` +11−2、`js/skills.js` +6−4(SK-03/SK-04 的 `note`)、`tests/unit.js` +63−12、`README.md` +2−2,外加本记账件与目录索引。

## 3. 唯一装配口 `WfCore.reviewCtxNote`

三步的 user 模板都是「纯指令 + JSON 清单」,没有像 `buildSBUser` 那样的天然拼接位;而模板本身(`sb.reviewUser`)是**用户可覆盖**的注册表键,注入段不能塞进模板变量里,否则用户改写模板就把注入弄丢了。故注入段走一个独立的段落装配口:

```js
W.reviewCtxNote = function (ctx) {
  ctx = ctx || {};
  const persona = String(ctx.personaNote || '').replace(/^。/, '').trim();
  const mem = String(ctx.memText || '').trim();
  return (persona ? persona + '\n' : '') + (mem ? mem + '\n' : '');
};
```

三处口径都沿用既有先例,不新造:

| 口径 | 取自 | 为什么 |
|---|---|---|
| 人设串去句首「。」 | `W.buildSplitUser`(W8) | `personaNote` 以「。」起头是为了拼在句尾(与 `directorNote` 同通道);独立成行时那个句号是错的 |
| 记忆块去前导换行 | `W.buildUndUser` / `buildSBUser` 里的 `ctx.memText.trim()` | `memBlock` 段头自带 `\n` 防粘上一段;这里注入段在最前,前导换行会开头空一行 |
| 两者都空即回空串 | `W.memBlock` / `W.personaNote` | 空串 = 与接通道前逐字节一致(第 4 节有逐字节用例) |

三个模板各加一个尾参 `ctx`,同经这一个口拼段——**三步不各写一份拼法**(用例直接断言三个定义体里都出现 `W.reviewCtxNote(ctx)`,谁另写一份就红)。

## 4. 缺省逐字节不变怎么保证的

不是靠"约定",是三层都钉住:

1. **函数层**:`reviewCtxNote` 对 `undefined` / `null` / `{}` / 空串 / 全空白一律回 `''`(memory 套件新增用例逐个入参断言)。
2. **模板层**:三个模板各有三条比对——不传 `ctx`、传 `{}`、传 `{personaNote:'', memText:''}` 时,输出与「接通道前那份三参调用」**逐字节相等**;有注入时 `inj.endsWith(base)` 为真,即注入段只加在最前、正文一字不改。
3. **调用层**:两端的 `personaNote` 都取自既有装配口(未雇佣时 `personaFor` 回空串)、`memText` 都取 `WfCore.memBlock`(无沉淀条目时回空串)。故"没雇专家、没记过东西"的用户看到的提示词与本槽之前完全一样。

## 5. 各步接到哪个板块、记忆按什么召回

板块键一律取 `WfCore.WF_BOARD`,不在调用点写死中文板块名(除既有 `memBlock` 调用点沿用其原有字面)。

| 步 | 板块 | 人设来源 | 记忆召回输入 |
|---|---|---|---|
| 分镜评审(`sbReviewUser`) | `WF_BOARD['smart-storyboard']` = 分镜 | 服务端复用拆镜步的 `ctxBase`;浏览器 `personaNoteFor(p, board)` | 集标题(与同工作流的拆镜步同输入) |
| 整集共性汇总(`buildSumUser`) | `WF_BOARD['smart-review']` = 成片 | 服务端复用逐镜步的 `reviewCtx.personaNote`;浏览器 `episodeReviewCtx` | 集标题 |
| 四维成片评审(`buildCutUser`) | 同上 | 同上 | 同上 |

两处设计取舍:

- **分镜评审跟着分镜板块,不跟成片板块**。它是 `/api/wf/smart-storyboard` 内部的一步(评分结果直接驱动同工作流的重拆),与拆镜步同一板块才让"评的人和拆的人听同一份方法论";把它划到成片板块会让同一工作流内两步的生效专家不一致。
- **集级两步按集标题召回,不按逐镜 `plot`**。逐镜审片步召回输入取该镜 `plot`(既有口径,本槽未动);共性汇总与四维评审的对象是整集,没有"本镜剧情"可用,取集标题与理解/拆镜两步一致。

**服务端不新增 `wfPersonaNote` 调用点**:评审步复用 `ctxBase`(分镜板块那一次),集级两步复用 `reviewCtx.personaNote`(成片板块那一次)。故 contract 套件锁死的调用点计数仍是 8,一字未动——本槽是"把已经取到的人设多用一处",不是"多取一次"。

浏览器侧同理只加一个装配口:`js/review.js` 新增 `episodeReviewCtx(p, ep)`,共性汇总与四维评审共用;`js/sb-llm.js` 的 `llmReview` 加一个 `ep` 参数(两处调用点都在 `ep` 作用域内,该函数未挂 `window.SB` 出口,改签名不影响外部)。

## 6. 记账:SK-03 / SK-04 的 `note` 按实况改写

W36 给这两条配的"点名断言"就是防静默扩面用的,本槽补完余量必须同步改账:

| 条目 | 改成什么 | 剩余仍欠 |
|---|---|---|
| SK-03 `core.personaCtx` | 「审片侧三步的人设通道已补齐」+ 点名三步各随哪个板块 ctx + 点名装配口 `WfCore.reviewCtxNote` | **共性汇总步的系统人设仍未收进提示词注册表**(两端仍是内联 `system: '你是短剧审片总监。'`,用户覆盖不到) |
| SK-04 `core.memoryDual` | 「审片侧三步的记忆召回已补齐」+ 点名召回输入口径 | 补种与旧板块名迁移仍只在浏览器 `memAll()`;服务端不自动沉淀本轮结论(归 SK-26) |

`pending` 与 `gaps` 一字未动(本来就已清空、标记按关联索引口径保留);`Skills.list()` 里带 `pending` 的仍是那四条(`SK-05` / `SK-24` / `SK-26` / `SK-29`),`gaps()` 键数仍 20。

### 6.1 顺手修掉一个"点名断言其实点不住"的洞

W36 那条记账对齐用例查的是 `s.note.includes(锚点)`——**全文查**。本槽实测:把 SK-03 的仍欠段整段换成「仍欠:无」,用例**仍然全绿**,因为锚点字面在 note 前半段的"已落地"描述里也出现。这等于点名断言在余量补完的那一刻自动失效。

改法:只认「仍欠」之后那段。

```js
const owedText = (s.note || '').split('仍欠').slice(1).join('仍欠');
owed.forEach(k => assert(owedText.includes(k), id + ' 的 note 须在「仍欠」段里点名:' + k));
```

改完再做同一变异,该条如期转红。这与 W36 第 4 节留下的教训同一类:**记账件里的断言本身也需要变异实测**,不然它只是看起来在钉。

## 7. 用例改动(改写 1 条 + 新增 1 条,未删测)

| 用例 | 钉住的事 |
|---|---|
| **改写** `infra 余量`(原「审片侧三步两端都没有人设/记忆通道」) | 三个模板都经唯一装配口 `reviewCtxNote`(另写一份拼法即红)+ 三步各三条缺省逐字节比对 + 有注入时注入段在最前且正文不变、人设/记忆字面都在、句首标点已去 + 服务端三处调用点字面(评审步复用 `ctxBase`、集级 `epCtx` 的构造、两步都带 `ctx`)+ 浏览器两处装配口与板块键 + 两个系统人设键仍登记在 SK-03 名下 + 共性汇总步仍是内联 `system` 且未登记提示词键(SK-03 的剩余仍欠)+ 已覆盖的逐镜审片步反向钉住 |
| **新增** `reviewCtxNote 注入段字面`(memory 套件) | 空/脏 ctx 一律回空串 + 只有人设时去句首标点并独立成段 + 只有记忆时去前导换行 + 两段都有时人设在前记忆在后各占一段 |
| **收紧** 记账对齐(既有用例) | 点名断言只认「仍欠」之后那段(见 6.1);SK-03 的锚点换成只出现在该段的字面 |

## 8. 变异实测

| 变异 | 实测行为 | 转红 |
|---|---|---|
| 服务端评审步去掉第四参 `ctxBase` | 服务端静默退回不注入(浏览器仍注入 → 两端不再一致) | 1 条 |
| `buildCutUser` 去掉 `W.reviewCtxNote(ctx)` | 三步之一悄悄没通道 | 1 条 |
| `reviewCtxNote` 不去人设串句首「。」 | 注入段以「。」开头 | 2 条(模板那条 + 字面那条) |
| 注入段改拼在正文之后 | 评审指令与数据清单之后才给方法论 | 1 条 |
| 浏览器集级 ctx 的板块键改成分镜 | 两端板块不一致(同一雇佣状态下提示词不再逐字节一致) | 1 条 |
| SK-03 的 note 仍欠段换成「仍欠:无」 | 余量记账假清 | 1 条(**收紧后**才红;收紧前全绿,见 6.1) |

## 9. 复核方式

```
git checkout cursor/w39-review-persona-mem-9fe5
node --check js/wf-core.js js/review.js js/sb-llm.js js/skills.js server.js tests/unit.js   # 通过
node tests/unit.js            # 353/353 PASS
node tests/unit.js skills     # 80/80,含改写后的 infra 余量那条
node tests/unit.js memory     # 7/7,含新增的 reviewCtxNote 字面那条
node tests/unit.js contract   # 全通过(README 用例数与注册表口径现取实况)
node tests/integration.js     # 93/93 PASS
node tests/cli.smoke.js       # 62/64(两项在基线 w36 上同样失败)
node -e "const W=require('./js/wf-core.js');const b=[{镜号:1}];console.log(W.buildCutUser(b)===W.buildCutUser(b,{})&&W.buildCutUser(b)===W.buildCutUser(b,{personaNote:'',memText:''}))"
# true(缺省无雇佣无记忆时逐字节一致)
```

`node tests/e2e.js` 按仓库纪律未跑(需用户明确要求)。本槽不含合并、未开 PR。

## 10. 交接

1. **共性汇总步的系统人设仍是内联的**(SK-03 剩余的唯一仍欠)。收编方式与 W18 收编 `gen.promptSystem` 一致:往 `js/prompts.js` 加一个键(如 `review.sumSystem`,默认值就是现在那句「你是短剧审片总监。」),两端改 `Prompts.get(key, ov)`,服务端记得显式传覆盖表;收编后本槽那条"仍是内联 system"的断言会先红,同时要把 SK-03 的 `prompts` 补上新键、`note` 的仍欠段清掉。缺省值不变,故提示词逐字节不变。
2. **评分方与生成方同源的偏高风险还没有度量手段**。W36 第 3.1 节末提的这一点仍在:分镜评审与四维评审现在听得到雇佣专家的方法论,理论上可能给同源产出打高分。本槽没有 A/B 口径可测(评审是 LLM 主观分),只把机制记清;要度量得先有"同一批分镜在雇佣/不雇佣两态下的评分对照"的固定夹具,属另开一槽。
3. **SK-04 剩下两处余量未动**:`js/agent.js memAll()` 的补种与旧板块名迁移下沉 `wf-core`(headless 才吃得到,会改 KB 种子表)、服务端结论按板块回流(归 SK-26 的 `orchestrate` 面,已连续多个周期未触及)。
