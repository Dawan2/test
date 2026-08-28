# W93 · 单镜审片提示词首句内联人设收编:`review.userSystem` 独立键 + 全仓名单按 live 重算

> 基线 `origin/cursor/w85-integration-171f @ 2a05c72`,落地分支 `cursor/w93-video-review-prompt-175a`。未合并 W83–W92。
> 收编的是 W81 扩展口径里点名的**视频审片组**那一处:`js/wf-core.js` 的 `W.buildReviewPrompt` 返回串首句。
> 只碰 `js/prompts.js`(+1 条注册)、`js/wf-core.js`(签名 +1 参、首句 1 行)、`server.js`(两处调用各 +`ov`)、
> `js/review.js`(注释 1 行)、`js/skills.js`(SK-03 的 `prompts` +1 项、`note` 已落地那半 +4 句)、
> `tests/unit.js`(+2 条用例、两张名单期望串按 live 重算)、两份 README 的数字与描述。
> `cli.js` / `mcp.js` / `js/release.js` / `js/issues.js` 一行未碰,不抬发布门、不新增计费动作、未删测。

## 1. 先核实收编面:`js/review*.js` 是空的,那一处在 `js/wf-core.js`

任务给的路径是 `js/review*.js` / `js/sb-review*.js` 加"仍含 `你是` 且尚未进注册表的审片相关模块",三条都要先 grep 核:

```
$ ls js/sb-review*.js
ls: cannot access 'js/sb-review*.js': No such file or directory
$ rg -n "你是" js/review.js
(零命中)
$ rg -n "你是" js/wf-core.js
650:    return `你是专业 AI 视频审片组,从技术层/匹配层/导演层三个维度评审一个短剧分镜视频,只返回 JSON:
```

三条路径逐条落定:

| 路径 | 实况 | 结论 |
|---|---|---|
| `js/sb-review*.js` | 文件不存在(分镜评审在 `js/sb-llm.js` 的 `llmReview`,人设走 `sb.reviewSystem` 已在表内) | 无收编面 |
| `js/review.js` | 零 `你是`。两处 LLM 调用点的 `system` 已是 `Prompts.get('review.system')`,集级两步走 `review.sumSystem`/`review.finalSystem` | 已收完,不空改代码 |
| `js/wf-core.js` | **1 处**,第 650 行 `W.buildReviewPrompt` 的返回串首句 | **本槽收这一处** |

"或该文件内全部内联,先核实"这一句也核了:`js/wf-core.js` 全文 `你是` **只此 1 处**,所以"只收这一处"与"收该文件内全部内联"在本槽是同一件事,收完该文件零内联。

顺带把余下的内联逐个看过一遍,确认**没有第二处属于审片**:`js/plans.js`(制作计划器)、`js/experts.js`(进化器 + 元智能体)、`js/agent-global.js`(意图路由器)、`js/agent-ops.js`(执行核验器 + 纪要整理器)、`js/proj-upload.js`(拉片分析师)、`js/role-editor.js`(设定师)、`js/sb-views.js`(改图专家)——一处也不是审片步,按任务口径**不收其它文件**。

## 2. 这一处特殊在哪:人设不在 `system` 位,而在 user 半的首句

前几槽收的都是 `system:` 值位上的字面。本处不是 —— 它是**提示词正文(user 消息)的第一句**,而同一次调用的 `system` 位上另有一句人设,两句同时发出:

```js
// js/review.js llmReviewShot / server.js /api/wf/smart-review
system: Prompts.get('review.system'),                    // 你是资深影视审片专家组(技术/匹配/导演三席)。  ← 早已在表内
messages: [{ role: 'user', content: buildReviewPrompt(...) }]  // 你是专业 AI 视频审片组,从技术层/…  ← 本槽收这一句
```

这也是为什么这一处在三张持有者名单里待遇不同:文件顶层那张 `inlinePersonaHolders()` 的判据是 `system:`/`content:`/`=` 后紧跟 `你是`,它的注释里明确把"`js/wf-core.js` 单镜审片的 user 半"列为有意的例外;而 W81 那张局部名单的判据含"装配函数直接 `return`",所以它记着 `js/wf-core.js:1`。本槽收的正是后者记的那一处 —— 两张名单的差异不是账错了,是判据不同,合并时不能互相照抄(W85 §4.4 已记过这一点)。

## 3. 独立键,不与 `review.system` 复用

`review.system` 是全表里离本处最近的一条(同一次 LLM 调用、同一步、都是审片组),所以按 W56 立的三条判据逐条对一遍:

| 候选 | 字面 | 角色 | 产物落点 | 结论 |
|---|---|---|---|---|
| `review.system`(`你是资深影视审片专家组(技术/匹配/导演三席)。`) | 完全不同 | 都是审片组,但一条占 system 消息位、一条是提示词首句并就地交代"评审一个短剧分镜视频"这个任务 | 两串同一次请求里各占一半,**不是同一个字段** | 不能复用 |
| `sb.reviewSystem`(`你是资深影视审片专家组。`) | 不同 | 分镜脚本五角色评审 ≠ 单镜视频评审 | `sbReview.comments` ≠ `report.dimensions` | 不能复用 |
| `review.finalSystem` / `review.sumSystem` | 不同 | 成片四维 / 整集共性汇总,都是集级 | 集级报告 ≠ 单镜三维报告 | 不能复用 |

`review.system` 那一条要特别点住:两句字面不同、但"角色"读起来几乎一样,合成一个键的直觉最强。合掉的后果是具体的 —— 用户改一次人设会同时改掉 system 位与提示词首句两处,而首句后面紧接的是三维 JSON 契约(`只返回 JSON:` + `dimensions` 字段表),首句被换成一句不交代"三个维度"的话,模型仍会按字段表输出但维度语义失去铺垫;更直接的是**两句会变成同一串重复发两遍**。故新开键:

```js
{
  /* 单镜审片那一步的提示词正文(user 半)开头还各带一句人设:与 review.system 同步发出、
   * 措辞与三维交代都不同(那条是 system 消息位、这条是提示词首句),故独立键、不与它复用。
   * def 末尾的连接逗号有意留在键里(其后紧接契约半的「只返回 JSON:」),覆盖时改写整句更顺;
   * 三维返回 JSON 的字段契约、评分标准与拆解规则检查仍由 buildReviewPrompt 现拼,不开放覆盖
   * (改坏即整轮 normalizeReport 拿不到 dimensions,报告退成零分空评语)。 */
  key: 'review.userSystem', name: '单镜审片提示词首句 · 系统人设', vars: [],
  def: '你是专业 AI 视频审片组,从技术层/匹配层/导演层三个维度评审一个短剧分镜视频,',
},
```

- **命名**:前缀沿用 `review`(与同步骤那三条同族),后缀取 `userSystem` —— 直译就是"user 半上的系统人设"。看着别扭是有意的:`review.system` 已经占了"这一步的系统人设"这个读法,再叫 `review.shotSystem` 之类只会让下一个人分不清哪条落在哪个字段。`name` 字段写成 `单镜审片提示词首句 · 系统人设`,在「全局默认值 → 核心提示词 skill」页面里与 `单镜审片 · 系统人设` 上下相邻、一眼能分辨改的是哪一半。
- **`def` 末尾留连接逗号**:原串是 `…短剧分镜视频,只返回 JSON:`,切点落在逗号之后。这与 `comic.bubbleSystem`(`你是漫剧编剧。` + 契约半)同口径 —— 人设那段自带终止标点,契约半从新词起。逗号若留在源码侧,用户把覆盖写成 `你是质检组。` 会得到 `你是质检组。,只返回 JSON:` 的双标点;留在键内则是 `你是质检组。只返回 JSON:`,读得通。
- **排在 `review.system` 之后**:同一步的两半连着读;其后仍是 `review.sumSystem` → `review.finalSystem`,审片三步的次序一字未动。用例两条断言分别钉住前后邻居,插到别处即红。
- **`vars` 为空**:该步不做 `Prompts.fill` 替换(`${W.shotTimeRange(ep, s)}`、`${s.plot}` 这些都在契约半与分镜信息段里,由装配口用模板字符串插)。

## 4. 契约半"半不开放":到底哪半留在装配口

收编后 `buildReviewPrompt` 的返回串结构是:

```
[Prompts.get('review.userSystem', ov)]  ← 本槽收进注册表(可覆盖)
只返回 JSON:{ "score", "dimensions":{technical,matching,directing}, "issues":[...] }
评分标准:≥8.5 优秀,7~8.5 良好,<7 需返工。issues 按严重度最多 4 条…
拆解规则检查:单镜台词超 40 字未拆镜 / 信息过载 / 相邻镜头景别毫无递进…
评审口径(专业知识库条目):[ctx.kbReviewText]
[ctx.memText]分镜信息:…                ← 以下全部留在装配口(不开放覆盖)
```

留下那几段各连着一个消费点,所以一律不进注册表:

- `dimensions` 三维字段名(`technical`/`matching`/`directing`)就是 `W.normalizeReport` 的 `dim(k)` 取值键 —— 改一个字整份报告三维退成 `0 分 / 暂无评语`;
- `issues[].severity` 的"严重/轻微"就是 `severity: it.severity === '严重' ? '严重' : '轻微'` 的判据,也是问题中心与达标线分档的依据;
- 评分标准那行的 `≥8.5 / 7~8.5 / <7` 与"最多 4 条"分别对着发布门 G3 的达标线口径与 `slice(0, 4)`;
- 知识库评审口径(`ctx.kbReviewText`)是 `KB.reviewBlock()` 的正文,单源归 `KB.SECTIONS`,与前几槽同口径:方法论正文不随人设覆盖变动。

用例专配一条按字面钉这层边界:`["technical"`、`"matching"`、`"directing"`、`"issues"`、`"severity"`、`需返工]` 六个片段在 `Prompts.list()` 的任何 `def` 里都必须**零命中**,同时这六个片段必须仍在 `js/wf-core.js` 源码里出现。谁哪天顺手把契约半也塞进注册表,两侧同时红。

## 5. 取值口:装配口收 `ov` 参数,浏览器隐式、服务端显式

这一处与前几槽最大的不同:**它是真双端**(浏览器 `js/review.js` 与服务端 `/api/wf/smart-review` 吃同一份装配口),所以不能像纯浏览器链路那样只靠 `Prompts.get(key)` 隐式读 —— Node 侧没有 `window.Store`,隐式读会静默拿到系统默认,headless 侧的用户覆盖会悄悄失效。故装配口按 `sbSystem`/`extractSystem`/`buildAgentSystem` 同形收一个 `ov` 参数:

```js
W.buildReviewPrompt = function (p, ep, s, hasImage, ctx, ov) {
  …
  return `${Prompts.get('review.userSystem', ov)}只返回 JSON:
```

- `ov` 排在 `ctx` 之后当第 6 参(与 `buildAgentSystem(ctx, ov)` 的"ctx 先、覆盖表后"同序);既有 5 参调用一律仍成立,`ov` 缺省 `undefined` 时 `Prompts.get` 走隐式路径。
- **浏览器**:`js/review.js` 的委托点一个参数没加,`Prompts.get` 在有 `window.Store` 时隐式读 `Store.state.settings.promptOverrides` —— 与 W71/W81 那几条同形。
- **服务端**:两处调用(视觉链 / 纯文本)各显式传 `ov`,与同一段里 `Prompts.get('review.system', ov)` 取的是同一张表。用例数了调用处数(恰好 2)并逐处正则钉 `, rctx, ov)` 结尾 —— 将来谁加第三条审片调用而漏传覆盖表,当场红。

这一条与前几槽的诚实位不同:**这次收编同时解决了"可覆盖"与"headless 侧也可覆盖"**,因为该步本来就双端单源。README 与 SK-03 的 `note` 都按这个实况写,不含糊成"该步已双端单源"(那本来就是 W21 下沉时的事)也不缩水成"只解决可覆盖"。

## 6. 三张全仓名单里两张要改,按 live 重算不照抄

W85 已记清仓里有三张判据不同的名单,本槽逐张现跑一遍:

| 名单 | 判据 | 收编前 | 收编后 | 本槽是否改 |
|---|---|---|---|---|
| A 顶层 `inlinePersonaHolders()` | `system:`/`content:`/`=` 后紧跟 `你是`,扫 `js/*.js` + 四个 Node 端 | 8 文件 11 处 | 8 文件 11 处 | **不改** —— 该判据本就不含 `return \`你是`,注释里已把这一处列为有意的例外 |
| B `census`(漫剧气泡那条用例内) | 全部 `['"\`]你是` 字面,含注册表 `def` 与 `js/experts-data.js` | 13 文件 | 13 文件 | **改两处**:`js/wf-core.js:1` 整条消失、`js/prompts.js:28 → 29` |
| C 局部 `inlinePersonaHolders`(导演设定那条用例内) | `system:` 值位 / 具名人设常量 / 装配函数直接 `return`,排除 `js/prompts.js` | 8 文件 10 处 | **7 文件 9 处** | **改**:`js/wf-core.js:1` 整条消失、总处数 10 → 9 |

A 那张一处不改是本槽最容易记错的地方 —— 它的期望串里根本没有 `js/wf-core.js`,收编一处却"名单一个字不变"看起来像漏改账。真正的判据在函数注释里写着,本件把这层写死免得下一个人按 C 的经验去改 A。B 那张里 `js/prompts.js:N` 随注册表条数走,同一条用例里紧跟的 `Prompts.list().filter(x => x.def.startsWith('你是')).length` 也要同步(30 条键里 `sb.reviewUser` 是评审指令不以「你是」开头,故是 29 不是 30)。

三张一律用与用例内同一段判据的脚本现扫全仓后重写,不手改数字:

```
$ node -e "…（把用例内那段 RE 直接跑一遍）"
js/agent-global.js:1, js/agent-ops.js:2, js/experts.js:2, js/plans.js:1, js/proj-upload.js:1, js/role-editor.js:1, js/sb-views.js:1
files 7 total 9
```

## 7. 记账:SK-03 的 `prompts` 与 `note`

新键登记在 **SK-03 `core.personaCtx`** 名下(人设键的索引宿主,与 `review.system` 同一处),插在 `'review.system'` 之后:

```js
prompts: […, 'review.system', 'review.userSystem', 'review.sumSystem', 'review.finalSystem', …],
```

`note` 在"已落地"那半补四句(**「仍欠」段一字未动** —— 那段的 `ops 协议` / `不开放覆盖` / `漫剧气泡` / `ctx 通道` 四个锚点由既有断言钉着):

```
单镜审片那一步的提示词首句人设(WfCore.buildReviewPrompt 的 user 半开头)同形收编为 review.userSystem,
装配口随之收覆盖表参数(浏览器 js/review.js 不传、由 Prompts.get 隐式读,服务端 /api/wf/smart-review 显式传),
该键不与同步发出的 review.system 复用——一条在 system 消息位、一条是提示词首句,措辞与三维交代都不同;
js/wf-core.js 至此零内联人设。
```

三处要点:

1. **`prompts` 登记是硬要求**:契约测试「`Prompts` 全部 key 应被 skill 索引引用」会数,摘掉登记当场红(实测变异 4:红 2 条 —— 四类单源键那条 + 本槽源级那条)。
2. **不复用的理由写进 `note`** 并由源级用例的一条断言(`note` 须含 `review.system 复用` 与 `不与`)钉住 —— 下一个人看到 `review.system` 与 `review.userSystem` 第一反应必然是"这俩为什么不合并"。
3. **`gaps` 一字未动**:`G-13` 治的是"大量模块内联提示词未进注册表",C 名单上还有 7 文件 9 处,缺口没闭合。`Skills.gaps()` 的键数(20)与 `G-13` 的六条值逐字节不变,并有断言钉住。

**没顺手动的**:SK-18 / SK-23 / SK-24 的 `prompts`(它们登记的是 `review.system`,指的是 system 位那一条,本槽没换它的落点)、SK-24 的 `note`(它写的是四维/镜级报告的校验面,与提示词首句无关)、SK-03 的 `pending`(本就为空)/`gaps`/`kinds`/`cmds`。

## 8. 用例改动(新增 2 条,未删测)

两条都落在 `contract` 套件,紧跟 W82 发行文案包那两条(同为"收编内联人设"的行为面 + 源级配对):

| 用例 | 钉住的事 |
|---|---|
| **新增** 行为面 `单镜审片提示词首句人设:独立键 review.userSystem,缺省逐字节等于收编前的内联字面、契约半不随覆盖变动` | ① 缺省 `Prompts.get` 逐字节等于 `你是专业 AI 视频审片组,从技术层/匹配层/导演层三个维度评审一个短剧分镜视频,`;② 注册表条目形状(无变量、`name` 以「单镜审片提示词首句」起头且带「系统人设」);③ 该字面恰好命中注册表一条(同 `def` 开两个键即红);④ 不与 `review.system`/`review.sumSystem`/`review.finalSystem`/`sb.reviewSystem` 同字面;⑤ **真跑装配口**:缺省首句 = 人设句 + `只返回 JSON:\n`,不传 `ov` 与传 `{}` 逐字节一致;⑥ 写覆盖后**只换首句**,其后契约半与分镜信息段逐字节不变(用 `bare().slice(SYS.length)` 对账);⑦ 覆盖 `review.system` 时本步逐字节不动(不串台);⑧ 三维字段名/`severity`/评分标准六个片段在注册表里零命中;⑨ 登记次序:前邻 `review.system`、后邻 `review.sumSystem` |
| **新增** 源级 `单镜审片提示词首句人设(源级):js/wf-core.js 零内联,两端取值口一浏览器隐式一服务端显式` | ① 取值口与契约半锚点配对(`Prompts.get('review.userSystem', ov)}只返回 JSON:`,键挪到别的装配口即红);② `js/wf-core.js` 里该人设句零命中,且**全文 `你是` 计数为 0**(本槽的落点:该文件从此零内联);③ 契约半四个锚点仍在源码里;④ 装配口签名收 `ov`(正则钉 `function (p, ep, s, hasImage, ctx, ov)`);⑤ 服务端调用**恰好 2 处**且每处以 `, rctx, ov)` 结尾;⑥ 浏览器仍委托同一装配口、不传覆盖表,且 `js/review.js` 不内联该句;⑦ SK-03 登记新键、`note` 写明落点 + 零内联 + 不复用 `review.system` 的理由;⑧ `gaps()` 键数 20 与 `G-13` 六条值逐字节固定;⑨ `Skills.validate({ Prompts })` 通过 |

行为面这一条**有真跑那一层**:`WfCore.buildReviewPrompt` 是 UMD 导出的纯函数,`require` 即可直调,不必造 DOM、不必截获 `API.chatJSON` —— 比 W82(handler 压在 DOM 闭包里,只能配对正则)与 W81(要造沙箱跑 `window.genDirectorSetting`)都轻。这也是为什么本槽没有新增沙箱加载器。

## 9. 变异实测

六条变异逐一施加、跑 `node tests/unit.js` 后复原(复原后 445/445):

| 变异 | 实测行为 | 转红 |
|---|---|---|
| 1 `js/wf-core.js` 改回内联字面 | 收编退回收编之前 | **5 条**(本槽行为面 + 本槽源级 + 注册表 `def` 全仓唯一持有者那条 + C 名单那条 + B 名单那条) |
| 2 取值口改成 `Prompts.get('review.userSystem')`(丢掉 `ov`) | 进表了但 headless 侧改不到 | 2 条(行为面看覆盖跟不跟随,源级看取值口写法) |
| 3 注册表 `def` 改一个字(专业→资深) | 缺省不再逐字节相同 | 1 条(行为面) |
| 4 摘掉 SK-03 的 `review.userSystem` 登记 | 新键不进索引、记账对不上账 | 2 条(四类单源键全覆盖 + 源级) |
| 5 服务端某一处漏传 `ov` | 那条链路的用户覆盖静默失效 | 1 条(源级,逐处正则钉住) |
| 6 **反向**:C 名单期望串里把 `js/wf-core.js:1` 写回去 | 收编了却不改账 | 1 条(导演设定那条源级用例) |

变异 1 之所以一条改动红 5 条,是三张名单 + 两条本槽用例有意的重叠:名单看的是"全仓账对不对",本槽两条看的是"这一处真的收掉了"。变异 5 与 6 是这次的两向守卫 —— 少传一处覆盖表(功能失守)与账没跟上(记账失守)都拦得住。

## 10. 复核方式

```
git checkout cursor/w93-video-review-prompt-175a
node --check js/prompts.js js/wf-core.js js/skills.js js/review.js server.js tests/unit.js   # 通过
node tests/unit.js          # 445/445 PASS(基线 443,新增 2 条用例)
node tests/unit.js contract # 77/77 PASS(基线 75)
node tests/integration.js   # 126/126 PASS(与基线同)
node tests/cli.smoke.js     # 95/97;两处失败「未登录 whoami」「llm --json mock 链路」与 master 同名
                            # (同一台机上实测 master 51/53,同这两条)
node -e "const P=require('./js/prompts.js'),S=require('./js/skills.js'),W=require('./js/wf-core.js');
console.log(P.list().length, JSON.stringify(P.get('review.userSystem')));
const s={id:'a',plot:'对峙',camera:'固定镜头',prompt:'p',duration:5};
console.log(JSON.stringify(W.buildReviewPrompt({style:'漫剧'},{shots:[s]},s,false,{styleText:'漫剧'}).split('\n')[0]));"
# 30 "你是专业 AI 视频审片组,从技术层/匹配层/导演层三个维度评审一个短剧分镜视频,"
# "你是专业 AI 视频审片组,从技术层/匹配层/导演层三个维度评审一个短剧分镜视频,只返回 JSON:"
```

缺省逐字节另有一次直接对账(合并前后两份 `wf-core.js` 同时 `require`,同一夹具跑视觉/纯文本两条路径,两条都 `BYTE-IDENTICAL`)。
`node tests/e2e.js` 按仓库纪律未跑(需用户明确要求)。本槽不含合并、未开 PR。

## 11. 与并行分支的关系

W83–W92 未合并。改动面:`js/prompts.js`(在 `review.system` 之后插入 1 条)、`js/wf-core.js`(签名 + 首句共 2 行)、`server.js`(2 处调用各 +`ov`)、`js/review.js`(注释 1 行)、`js/skills.js`(SK-03 的 `prompts` +1 项 + `note` 已落地那半 +4 句)、`tests/unit.js`(+2 条用例 + 两张名单期望串)、`README.md`(四处数字/描述)、`docs/skills-wave/README.md`(提示词条数 + 索引行)。

- **`js/prompts.js`**:本槽在 `review.system` 之后插入一条。若并行槽也往注册表加键,两块都留;注意 W75/W85 记的那个坑 —— 同插入点两侧各加一块时**块尾那一行可能是共用的**,机械两留会语法断,合完先跑 `node --check`。README 的条数按合入后 `Prompts.list().length` 现取重算。
- **`js/skills.js` 的 SK-03**:并行槽若也往 `prompts` 数组里加键,取**并集**(本槽插在 `'review.system'` 之后而不是数组尾部,与"尾部追加"型的并行槽天然不同行,冲突概率比前几槽低);`note` 两侧若都在"已落地"那半追加,两段都留。**「仍欠」段本槽一字未动**。
- **三张持有者名单**:这是最可能冲突的一处。合并时**不要照抄任一侧的期望串** —— 按合入后各自那段判据现跑重算(A 与 C 同名不同域,A 在文件顶层、C 在 W81 那条用例函数体内遮蔽前者,两块都留是安全的;B 那张里 `js/prompts.js:N` 随注册表条数走)。三条落点断言(各自那个"某文件整条消失")都保留。
- **`server.js` 的两处调用**:若并行槽也动 `/api/wf/smart-review` 那一段,注意本槽只在参数尾部加了 `ov`,取两侧改动的并集即可;合完由源级用例的"恰好 2 处且每处以 `, rctx, ov)` 结尾"自动对账。
- **`README.md` / `docs/skills-wave/README.md`**:提示词条数、单测数、索引行一律按合入后实跑重算,不要照抄任一侧。

## 12. 交接

1. **`js/wf-core.js` 从此零内联人设**:再往这个 UMD 纯核加 LLM 装配口时,人设句直接开新键,并且**装配口要收 `ov` 参数**(它是双端共用的,隐式读在 Node 侧拿不到覆盖表)。源级用例的"全文 `你是` 计数为 0"会替这条守着。
2. **G-13 仍欠,缺口开着**:C 名单现为 7 文件 9 处 —— `js/agent-ops.js` 2 处(会话纪要整理器 / 执行核验器,后者带回执模板变量)、`js/experts.js` 2 处(元智能体 `FORGE_SYS` / 专家人设进化器,后者带 `${bt}` 板块变量,收编时要决定变量走 `Prompts.fill` 还是留在 user 半),其余 `js/agent-global.js`(意图路由器)/`js/plans.js`(制作计划器)/`js/proj-upload.js`(拉片分析师)/`js/role-editor.js`(设定师)/`js/sb-views.js`(改图专家)各 1 处。A 名单口径下另有 `js/api.js` 两处层内兜底、`js/proj-planner.js` 2 处与 `js/gsettings.js` 的 `placeholder` —— 那几处判据不同,收之前先确认自己在按哪张名单的口径干活。
3. **摘 `G-13` 标记的时机不变**:判据是"名单归空",且要一次改齐六条关联索引的 `gaps` 与 `note`,不是谁的一半好了就摘谁。本槽不预支这个动作。
4. **同一步两半的键怎么认**:`review.system` 落在 system 消息位、`review.userSystem` 是提示词首句,两条同一次请求里同时发出。改这一步的提示词时先认清自己要动哪一半 —— 用例分别钉着两条的字面与前后邻居,认错半边会红在"不得与 `review.system` 同字面"或"该键应紧接 `review.system` 登记"那两条上。
