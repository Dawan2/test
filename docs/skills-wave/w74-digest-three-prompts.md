# W74 · 剧本摘要通读/汇总/集纲三步的策划人设收编(注册表新键 `digest.planSystem`,一键三口)

> 基线 `cursor/w70-integration-ad31 @ 87aa62a`,落地分支 `cursor/w74-digest-three-prompts-3508`。未合并 W68/W69/W71–W73。
> 本槽做的是 W56 记账件第 11 节交接第 1 条点名的那处遗留:`js/episode-util.js` 里剧本摘要链路前三步那三份同字面内联人设。
> 不改发布门(`js/release.js` 一行未碰)、不新增计费动作(三步仍走既有 `API.chatJSON` 口径,一分不多扣)、未删测(新增 2 条用例,反转 2 处既有断言语)。

## 1. 现场:同一句话在同一个函数里写了三遍

`EpisodeUtil.aiScriptDigest`(剧本摘要全文提取)是一条五步链路:①全文分块 → ②逐块通读(map)→ ③汇总卖点/梗概/大纲(reduce)→ ④逐集集纲 → ⑤人物小传。其中②③④三步各自写死了同一句 `system`:

```js
// 基线 js/episode-util.js:② 逐块通读 / ③ 汇总 / ④ 集纲
model, system: '你是资深短剧策划。',
model, system: '你是资深短剧策划。',
model, system: '你是资深短剧策划。',
```

末步⑤已在 W56 收编为 `Prompts.get('extract.system')`(那一步的角色是"剧本分析助手把人物落进主体库",与提取步同一件事)。所以这个函数当前的实况是:四个 LLM 步里一步听注册表、三步听写死的字面——用户在「偏好学习 → 全局默认值 → 核心提示词 skill」改人设时,同一条摘要链路里有两套来源。

## 2. 先逐字节核对三处,再决定一键还是三键

任务点名"大概率一个键三个取用口",但这是要查出来的结论,不能默认。三处的 `system` 值直接过 `cat -A` 看字节:

```
$ rg -n "system: '你是资深短剧策划。'" js/episode-util.js | cat -A
165:        model, system: 'M-dM-=M- M-fM-^XM-/M-hM-5M-^DM-fM-7M-1M-gM-^_M--M-eM-^IM-'M-gM--M-^VM-eM-^HM-^RM-cM-^@M-^B',$
175:      model, system: 'M-dM-=M- M-fM-^XM-/M-hM-5M-^DM-fM-7M-1M-gM-^_M--M-eM-^IM-'M-gM--M-^VM-eM-^HM-^RM-cM-^@M-^B',$
200:          model, system: 'M-dM-=M- M-fM-^XM-/M-hM-5M-^DM-fM-7M-1M-gM-^_M--M-eM-^IM-'M-gM--M-^VM-eM-^HM-^RM-cM-^@M-^B',$
```

三行的引号内字节序列**完全一致**(含末尾全角句号 `。` = `M-cM-^@M-^B`),不是"意思差不多"的三份措辞,也没有半角/全角标点分叉。缩进不同只是三步嵌套层级不同(②在 for 里、③在函数体、④在 for 里套 for),与提示词无关。

按 W56 第 2 节立的三条判据逐条过:

1. **字面同**:上面的字节比对,三处逐字节相同。
2. **角色同**:三步都是"资深短剧策划"——通读是策划在读本、汇总是策划在提炼卖点/梗概/大纲、集纲是策划在给每集写一句钩子。不是导演(`und.system` 那句)、不是编辑(`split.system` 那句)、不是分析助手(`extract.system` 那句)。
3. **产物落点同**:三步的产出全部落在同一份剧本级摘要上——②的分块概括是③④的输入,③写进 `p.scriptMeta.{logline,synopsis,outline}`,④写进 `p.epOutline[]`,两者一起构成「剧本」页那张规范文本信息卡。用户改这条人设想改的正是"这部剧该怎么被概括"这一件事,拆三个键等于让同一张卡听三个人指挥。

三条同时成立,所以**一键三口**,不分键。

## 3. 结果一句话

注册表新增第 15 条 `digest.planSystem`「剧本摘要 · 系统人设」,`def` 与三处内联字面**逐字节相同**;三步各改成 `Prompts.get('digest.planSystem')`。**缺省行为零变化**(摘要四步的 `system` 与 `user` 全部原样),覆盖时三步一并跟随。

```js
// js/episode-util.js:② 通读 / ③ 汇总 / ④ 集纲(浏览器隐式读 Store.settings.promptOverrides,与同文件取 split.system 同写法)
model, system: Prompts.get('digest.planSystem'),
```

**第五步不搅进来**:人物小传步仍是 `Prompts.get('extract.system')`。它与前三步同在一个函数里,但角色与产物落点都不同——它从文本里认人、往 `p.subjects` 写 `kind: 'character'` 的主体条目、过 `isPlausibleName` 可信性校验,与主体提取步是同一件事(W56 第 2 节已判过)。把四步合成一个键会让主体库和摘要卡听同一条人设,两边都失真。这条界线由一条断言正向钉住(`Prompts.get('digest.planSystem') !== Prompts.get('extract.system')`)、由源级计数反向钉住(本文件里 `extract.system` 的取用口仍恰好 1 个)。

## 4. 为什么取 `Prompts.get` 而不包第四个装配函数

同文件里有两种取值形态:提取步经装配口 `WfCore.extractSystem()`(人设句之后按键整条接 KB「主体参考」方法论),拆集步与小传步经 `Prompts.get` 只取人设句。包一层的理由只有一个——**人设句之后还要按键接一段 KB 正文**。摘要三步没有这个需要:

- 它们不生图、不装参考图组,「主体参考」那 278 字讲的全是参考图纪律,接上去缺省输出立刻不再逐字节相同(实测变异 5:通读步 `system` 从 14 字变 292 字)。
- KB 里也没有一条「剧本摘要」方法论条目可接。真要接得先往 `KB.SECTIONS` 加条目,那是注入面的另一题(G-06 那条线),不是本槽的单源题。

所以三口一律 `Prompts.get`,不为它包装配函数。这一处有源级断言反向堵住(三步的 `system` 不得改成 `WfCore.*(...)` 形态)。

## 5. 「另一端」在哪:这一处仍没有服务端对端

与 W56 同形:`aiScriptDigest` 只在浏览器。它由 `js/episodes.js` 剧本页「✨ AI 生成卖点/梗概/集纲」按钮、`runDigestDock`(普通模式解析后台进度)与 `js/director.js` 精细模式追加内容三处调用,`server.js` 里没有对应端点。所以本槽的"零内联"是**单端**结论,两端断言的位置换成"这一处不许长出第二端"(`server.js` 不得出现该人设句字面,也不得出现集纲步的 user 半锚句)。

收编只解决了"可覆盖",没解决"可 headless"——摘要链路仍进不了 CLI/MCP,那是 W56 交接第 2 条那一题,本槽不动。

## 6. 缺省逐字节不变靠哪两层钉住

沿用 W56 的两层,且第一层是行为级:

1. **行为层**:把 `js/episode-util.js` 装进 `vm` 沙箱真跑 `aiScriptDigest`(`API.chatJSON` 原样截获每步的 `system`/`user`),断言四步 `system` 拼起来逐字节等于 `策划|策划|策划|分析助手`——收编前那四份字面。改 `def`、接上方法论段、退回内联后再改字面,都在这一条上转红。
2. **源级层**:`js/episode-util.js` 里该人设句的全文出现次数为 **0**,且 `Prompts.get('digest.planSystem')` 恰好 **3** 次。写"包含"点不住"三处只改了两处",写"不得出现"又点不住"三口合并成一处",所以钉的是计数。三个口各落在自己那一步上另有三条锚点断言(取值口后 200 字内必须跟着本步 user 半的首句),防的是"三个口都挂在同一步、另两步改成别的"。

另有两条钉"覆盖只换人设":写覆盖后跑同一条链路,三步 `system` 一并跟随而末步不跟随;四步的 `user` 半(含 `{"logline":...}`/`{"outlines":[...]}` 返回约定与分块正文)与缺省那次**逐字节相等**,且覆盖后 `p.scriptMeta` 三项、`p.epOutline`、`p.subjects` 仍照常解析出来——**JSON 契约不开放覆盖**由这两条一起证明。

## 7. 记账:SK-03 补一个键,`gaps`/`pending` 一字未动

`digest.planSystem` 登记进 SK-03 `core.personaCtx` 的 `prompts`(`Prompts` 全部 key 必须被 skill 索引引用是既有契约,漏登即红);`note` 尾部按实况追加一句,写明三步同键三口、末步小传仍听 `extract.system`。

SK-03 的**仍欠段一字不改**:它点的是"四处装配口的 ops 协议/字段面/命令白名单/返回 JSON 约定有意不开放覆盖",与本槽收的不是同一件事。SK-10/SK-11 的仍欠段锚点(`js/episodes.js` 四步、`js/persona.js` 文生图重写步)也都不在摘要链路上,同样不动。`Skills.gaps()` 投影、`pending` 面、拼块与编排投影全部逐字节不变——G-13 治的是全仓内联提示词的大头,按 W36 立的关联索引口径,落地一面不摘标记。

`README.md` 的核心提示词 skill 那段:条目枚举补「剧本摘要人设」、注册表条数 14 → 15(两处正则各查一处)、补一句一键三口的说明;单测用例数按实跑重算 417 → 419。`docs/skills-wave/README.md` 的 `prompts.js`(14 条)同步改 15,索引表追加本件一行。

## 8. 用例改动(新增 2 条 + 反转 2 处断言语,未删测)与变异实测

| 用例 | 钉住的事 |
|---|---|
| **新增** `剧本摘要通读/汇总/集纲人设:一键 digest.planSystem 三个取用口,四步 system 缺省逐字节不变、覆盖只命中前三步`(contract 套件,紧挨 W56 那两条) | 缺省 `def` 字面 + 行为面四步 `system` 缺省逐字节 + 注册表命中恰好一条且是本键 + 两键不同值(不许合并)+ 条目形态(无变量、名含「剧本摘要」)+ 覆盖时三口一并跟随而末步不跟随 + 四步 `user` 半逐字节不变 + 覆盖后 `scriptMeta`/`epOutline`/`subjects` 解析口径不变 + SK-03 已登记新键 |
| **新增** `剧本摘要通读/汇总/集纲人设(源级):js/episode-util.js 零内联全文,同键恰好三个取用口` | 取用口计数恰好 3 + 该人设句全文出现次数为 0 + 三个口逐一落在通读/汇总/集纲各自那一步 + `extract.system` 在本文件仍只有 1 个取用口(误合成即红)+ 通读步不得改听分析助手人设 + 三步不得改取带方法论段的装配口 + `server.js` 不得长出这一步 |
| **反转** W56 那条行为用例的两处断言语 | 被断言的值一字未动(仍是 `策划\|策划\|策划\|分析助手`),说明串从「前三步仍是各自内联的策划人设」改成「四步都取注册表 def:前三步 `digest.planSystem`、末步 `extract.system`」,覆盖那条从「前三步的内联策划人设不受影响」改成「前三步走另一键,不受影响」 |

沿用 W56 留下的沙箱夹具 `loadDigest(ov)` / `digestProject()`,一行未改。

五条变异逐一实测(每条单独施加、跑 `node tests/unit.js contract` 后复原,复原后 58/58):

| 变异 | 实测行为 | 转红 |
|---|---|---|
| 1 三口全改回内联字面 | 覆盖改不到摘要三步,同一条链路里两套人设来源 | 2 条(新增行为条的覆盖跟随 + 新增源级条的取用口计数 3→0) |
| 2 三口误合成 `extract.system`,并撤掉新键 | 摘要卡与主体库听同一条人设,改一处两件事一起变 | 4 条(W56 那条的缺省逐字节 + 新增行为条的缺省 `def` + 新增源级条 + README 提示词条数 15→14 失配) |
| 3 三口误合成 `extract.system`、新键留在表里 | 同上,且注册表里多一条没人取的死键 | 3 条(W56 那条与新增行为条的缺省逐字节 + 新增源级条) |
| 4 汇总步拆出第二个同 `def` 的键(硬拆三键) | 同一句话在注册表里两条,摘要卡听两个键 | 4 条(既有的「`Prompts` 全部 key 应被 skill 索引引用」+ 新增行为条的"命中恰好一条"变 2 + 新增源级条 + README 提示词条数 15→16 失配) |
| 5 通读步改取装配口 `WfCore.extractSystem()` | 缺省 `system` 从 14 字变 292 字,多塞一段生图/参考图组纪律 | 3 条(W56 那条与新增行为条的缺省逐字节 + 新增源级条) |

变异 2 与变异 3 分开跑是有意的:前者查"合并 + 删键"这条完整的错路,后者查"只改取值口、键忘了删"这条半截错路——后者不会动 README 条数,若只做前者会误以为条数断言兜住了这一面。

## 9. 复核方式

```
git checkout cursor/w74-digest-three-prompts-3508
node --check js/prompts.js js/episode-util.js js/skills.js tests/unit.js   # 全部通过
node tests/unit.js            # 419/419 PASS(基线 417,新增 2 条用例)
node tests/unit.js contract   # 58/58(含新增两条与反转后的 W56 那条)
node tests/integration.js     # 118/118 PASS(与基线同,摘要链路无服务端端点故不受影响)
node tests/cli.smoke.js       # 88/90;两处失败「未登录 whoami」「llm --json mock 链路」与 master 同名
                              # (master 现开 worktree 实测 51/53,失败项逐名相同)
node -e "const P=require('./js/prompts.js');
console.log(P.list().length, JSON.stringify(P.get('digest.planSystem')),
  P.get('digest.planSystem') === P.get('extract.system'))"
# 15 "你是资深短剧策划。" false(条数 +1、def 与内联字面逐字节同、与小传步那键不同值)
```

行为面的核验落在单测里(第 6 节第 1 层):这一处没有服务端端点,"临时 stub 上游截获 `/api/wf/*` 请求体"那种核验方式不适用,故把生产源码装进沙箱真跑 `aiScriptDigest`、逐步截获发出去的 `system`/`user`——被测代码即生产代码,截获点就是 `API.chatJSON` 的入参。计费面无新增:该链路四步都不经 `Tasks.run`(摘要是解析主流程与剧本页的附带产出,基线即如此),本槽一分未动。

`node tests/e2e.js` 按仓库纪律未跑(需用户明确要求)。本槽不含合并、未开 PR。

## 10. 与并行分支的关系

W68/W69/W71–W73 未合并,本槽在 W70 头部之上的改动面很窄:

- `js/prompts.js`:新增一条 5 行的注册表条目,插在 `extract.system` 与 `sb.system` 之间。若并行槽也往注册表加键,取并集即可(条目之间无顺序契约),但**注册表条数要按合入后 `Prompts.list().length` 实计重算**,两侧的绝对值都不能直接折回。
- `js/episode-util.js`:3 行取值口 + 2 行注释。若并行槽也动摘要这几步,取"经注册表取值"那一侧;但同 `def` 开两个键会转红 4 条(变异 4),折回时不能两边都留。
- `js/skills.js`:SK-03 的 `prompts` 数组加一个键 + `note` 尾部追加一句。这两处都是**追加型**,与并行槽的同条目改动取并集;`gaps`/`pending`/`covers` 一字未碰。
- `tests/unit.js`:两条新用例紧挨 W56 那两条,另改 W56 行为条的两句说明串(**被断言的值没动**,机械取任一侧都会绿而说明串与实况不符,须按合入后实况读一遍再定)。
- `README.md`:三处——条目枚举、提示词条数(两个正则各一处)、单测用例数(按合入后实跑重算,`contract` 套件的数字对账会先红)。
- `docs/skills-wave/README.md`:`prompts.js` 条数一处 + 索引表末尾追加一行。

## 11. 交接

1. **摘要链路仍只在浏览器**(第 5 节):`aiScriptDigest` 没有 `/api/wf/*` 对端,CLI/MCP 拿不到"一句话卖点/梗概/大纲/集纲/人物小传"这五样产出,headless 主线在剧本信息这一段是断的。要接的形态与 W6(提取主体)、W8(剧本拆集)同——新端点 + `wf-core` 双端单源 + 计费动作,是一整槽的量。W56 交接第 2 条已登记,本槽未动。
2. **注册表之外的内联人设仍是大头**(G-13):`js/episodes.js` 的解说体改写/导演阐述/光影总控/剧本围读、`js/persona.js` 的文生图重写、`js/beatboard.js` 节拍拆解、`js/proj-shell.js` 发行文案、`js/proj-planner.js` 的策划顾问对话(注意:它写的是 `'你是资深短剧策划/编剧,…'`,**与本槽这句不同**,是另一句话,不能顺手并进 `digest.planSystem`)等各写一份。这些步都没有服务端对端,收进注册表只解决"可覆盖",属产品口径题——注册表条目多了「全局默认值」页会变长。本槽只收"同字面的重复",判据仍是第 2 节那三条。
3. 摘要三步的其余口径一字未动:`API.chatJSON` 直调(非 `chatJSONRobust`)、通读 `temperature: 0.4 / max_tokens: 500`、汇总 `0.5 / 1500`、集纲 `0.4 / 2000`、分块阈值 12000 字与超长单段硬切、集纲按 12000 字分组批量不采样、`no` 越界丢弃与按位兜底两道回填。
