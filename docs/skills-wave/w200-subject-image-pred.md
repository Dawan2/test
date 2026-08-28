# W200 · 「主体有没有参考图」十六处判断点对表:停工位部分成立,右栏防废片那一处判错

**范围**:`js/sb-views.js`(右栏 `rightHTML` 的四处取图判定改经 `Domain.subjectRefImage`,新增 `noRefImg` 一处取值口)+
`tests/unit.js`(`sb-views` 3、`contract` 1 共 +4)+ `README.md` 与本目录 `README.md` 同步。
**基线**:`cursor/w196-integration-708c`(`cdf537e`,开工现取核实相符,自测 602 前为 598/598)。
**不做**:不动发布门 G9 的 `pass/fail` 含义(两端判据一字未改)、不动 `Domain.gateBlockers` / `D.workflow` /
`js/issues.js` 门槛投影 / 两端 `subject.generateImage` 选人 / `js/director.js` / `js/roles.js` / `js/proj-upload.js` /
`js/agent-ops.js` / `js/wf-core.js` 回流 note 里的任何一处 `!s.image`、不为 DRY 造第三份谓词、
不改 `emptyBatchNote` 与 digest 通用位、不实现主体空跑 note、不改 evolve/steps、不改 produce 漏斗、
不改 `listModels`、不拆 `gaps()` 键、不登记护栏主题、不合并其它并行槽。

## 1. 停工位:先在基线上把每一处真跑一遍,不靠读源码猜

交接说「`!s.image` 全仓仍有三处各写一遍」。**这句话两头都不准**:一头是它少数了
(基线上按 `!s.image` 判的其实有 **12 处**),另一头是它把问题定在了"重复"上,而重复的那 12 处
**在所有夹具上同真同假**——它们判的是同一个字段、同一个表达式,收口只是把 12 份一样的字面变成 1 份,
换不出任何一个用户看得见的差别,却要动 G9 的取值。按停工位第 3 条,**那一半不成立**。

真问题在交接没点到的地方:全仓「主体有没有参考图」其实是**两问**,而某一处把第二问按第一问的字段拼了
第三种判据,还判错了。基线 `cdf537e` 上逐点现跑(Node `vm` 沙箱加载真实源码,`Y` = 该点认定"这个主体缺参考图"):

| # | 判断点 | F1 无字段 | F2 空串 | F3 占位 dataURL | F4 真实图 | F5 只有 thumb | F6 只有大头照 | F7 图+大头照 | F8 形态自带图 | F9 占位+大头照 | F10 http 远程 | F11 图齐·形态无图 | F12 全空·形态无图 | F13 大头照·形态无图 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| A1 | `js/domain.js` `gateBlockers` 门槛派生 | Y | Y | · | · | Y | Y | · | Y | · | · | · | Y | Y |
| A2 | `js/domain.js` `workflow` 主体步(同文件第二份内联) | Y | Y | · | · | Y | Y | · | Y | · | · | · | Y | Y |
| A3 | `js/release-core.js` G9(headless) | Y | Y | · | · | Y | Y | · | Y | · | · | · | Y | Y |
| A4 | `js/release.js` G9(浏览器) | Y | Y | · | · | Y | Y | · | Y | · | · | · | Y | Y |
| A5 | `js/issues.js` `subjects-no-image` | Y | Y | · | · | Y | Y | · | Y | · | · | · | Y | Y |
| A6 | `js/commands.js` `subject.generateImage` 选人 | Y | Y | · | · | Y | Y | · | Y | · | · | · | Y | Y |
| A7 | `cli.js` `subject.generateImage` 选人 | Y | Y | · | · | Y | Y | · | Y | · | · | · | Y | Y |
| A8 | `js/director.js` 精细模式待备主体 | Y | Y | · | · | Y | Y | · | Y | · | · | · | Y | Y |
| A9 | `js/agent-ops.js` 建议「补齐主体形象」 | Y | Y | · | · | Y | Y | · | Y | · | · | · | Y | Y |
| A10 | `js/wf-core.js` 提取回流 note 缺图数 | Y | Y | · | · | Y | Y | · | Y | · | · | · | Y | Y |
| A11 | `js/roles.js` 「补齐主体图」按钮 | Y | Y | · | · | Y | Y | · | Y | · | · | · | Y | Y |
| A12 | `js/proj-upload.js` 批量生图待办 | Y | Y | · | · | Y | Y | · | Y | · | · | · | Y | Y |
| B1 | `js/domain.js` `subjectRefImage`(已有派生) | Y | Y | **Y** | · | Y | **·** | · | **·** | · | · | · | Y | **·** |
| B2 | `js/domain.js` `shotRefImages`(真实随包发出去的那份) | Y | Y | **Y** | · | Y | **·** | · | **·** | · | · | · | Y | **·** |
| B3 | `js/humanreview.js` `shotImageUrls`(取待审 URL) | Y | Y | · | · | Y | **·** | · | **·** | · | · | · | Y | **·** |
| C1 | `js/sb-views.js` 右栏防废片「出场主体缺图」 | Y | Y | · | · | Y | **·** | · | **·** | · | · | **Y** | Y | **Y** |

夹具是同一个单主体单镜项目,只改主体的图字段;F8/F11/F12/F13 那四行的镜头引用的是形态全称
`阿茶-战损`,其余引用主体名。

读法:

- **A 组 12 处判的是第一问「权威图字段齐不齐」**,判据全是 `!s.image`,13 个夹具上逐格同真同假。
  它们没有任何一处判错,也没有一格能靠收口改善——停工位说的那半到此为止。
- **B 组判的是第二问「这一镜生成时带不带得上主体参考图」**,判据是取图优先级链
  `形态自带图 > 视频参考大头照 > 权威参考图`,占位 `data:` 不喂模型故不算图。
  它与 A 组在 F3/F6/F8/F13 四格上结论相反,而这是**有意的**:只有大头照的主体在 G9 眼里就是缺权威图
  (那是美术确认与多机位要用的三视图),在发包眼里却是有图可用。
- **C1 是第二问的第三份谓词,而且是全表唯一的孤票**:F11 那一格 15 个判断点里只有它说"缺图",
  它旁边的 B2 同时证明这一镜**真的带着主体权威图发出去了**。

按停工位第 4 条,只改判错的这一处。

## 2. 病灶:`subjOf` 把形态引用解析成"只有形态自带图"的对象,再拿它去判有没有图

基线原文(`js/sb-views.js` `rightHTML`):

```js
const subjOf = name => {
  const r = Store.findSubject(p, name);
  return r ? (r.form ? { name, image: r.form.image, kind: r.s.kind, refAudio: r.s.refAudio } : r.s) : null;
};
…
else if (!(sj.image || sj.imgRef)) missImg.push(c);
```

`subjOf` 对形态引用回的是一个**现造的窄对象**:只带形态自带图,`imgRef` 与主体 `image` 都没带上。
它当展示对象用没问题(标签要显示的就是这个形态),但拿它去回答"这一镜带不带得上参考图"就漏了回退链——
`Domain.shotRefImages` 遇到形态没图会一路回退到 `r.s.imgRef` 再到 `r.s.image`,窄对象上这两级都不存在。

于是 F11 这类项目(主体图齐全、给它挂了个还没单独出图的形态)上,用户看到的是:

> ⚠ 防废片提醒 · 出场主体缺图:阿茶-战损——废片风险高,先到「主体」补图或注册主体

而这一镜实际上带着 `/uploads/…/real.png` 发出去,一点都不缺。处置指向的「到主体补图」更是死路:
点进去主体图是齐的,发布门 G9 也说"1 位全部就位",没有任何东西可补。反过来 F3 那一格
(主体只有一张占位 `data:` 图)它又说有图,而那张占位图根本不会随包发送——同一档提醒两头都会说假话。

## 3. 落法:与已有派生同源,不造第四份谓词

```js
const noRefImg = name => !Domain.subjectRefImage(Store.findSubject(p, name));
```

`subjOf` 一个字未动(它仍负责"主体在不在"与标签展示),只把四处取图判定
(角色缺图集、场景缺图集、角色标签、场景标签)改成读这一份。三处细节:

1. **不新造谓词、也不去改 `subjOf` 的返回形状**。改返回形状会连带影响标签展示与 `refAudio` 那一路,
   而要收的只是判据;`Domain.subjectRefImage` 本来就是发包侧的取值口,直接读它就是"与真实发包同源"。
2. **不碰 A 组任何一处**。两问的判据本来就不同,把 C1 拉到 B 组不等于要把 A 组也拉过来——
   真那么做就是拿第二问的口径去抬 G9 的门槛,而 G9 问的是权威三视图齐不齐,与"这一镜发不发得出图"无关。
3. **`js/humanreview.js` 那份内联链不动**。它与 `subjectRefImage` 在 F3 上不同(占位 `data:` URL 它也收),
   但它的产物是"待真人审核的 URL 清单"而不是缺图判定,多收一个永远没有审核记录的占位 URL
   不改 `guardAsync` 的任何一个结论;真要收它是另一件事(见 6. 交接第 3 条)。

落地后 C1 与 B1/B2 在 13 个夹具上逐格相同(F11 由 `Y` 变 `·`、F13 由 `Y` 变 `·`、F3 由 `·` 变 `Y`),
A 组 12 处一格未变。

## 4. 行为变化:三格,都是把假话改成真话

| 夹具 | 基线右栏 | 本槽 | 这一镜实际发包(`shotRefImages`) |
|---|---|---|---|
| F11 主体图齐、形态没单独出图 | ⚠ 出场主体缺图 | 不报 | 带 1 张(回退到主体权威图) |
| F13 主体只有大头照、形态没单独出图 | ⚠ 出场主体缺图 | 不报 | 带 1 张(大头照) |
| F3 主体只有占位 `data:` 图 | 不报 | ⚠ 出场主体缺图 | 带 0 张 |

前两格是消掉假警报,第三格是补上漏报。角色/场景标签的 ⚠ 与 🖼 同口径跟着走(同一个 `noRefImg`)。
其余夹具与整块右栏 HTML 逐字节不变。

**不受影响的面**:发布门 G9 两端、问题中心 `subjects-no-image`、流程条主体步、两端补图选人、
`js/roles.js` 的「补齐主体图(N)」计数——它们答的都是第一问,本槽一个字没碰,F6/F13 上照旧算缺图。
所以「G9 说图齐、右栏说缺图」这种组合仍然可能出现(F3),而那正是两问结论相反的正确表现。

## 5. 加测(+4)与变异复核

| # | 套件 · 用例 | 钉住什么 |
|---|---|---|
| 1 | `sb-views · rightHTML 防废片「出场主体缺图」:判据现取 Domain.subjectRefImage(桩换派生即改口,内联拷贝拿不到桩)` | 项目对象一字不改、只换派生:①派生回空而主体图齐全 → 必须报缺图;②派生回 URL 而主体一张图都没有 → 必须不报 |
| 2 | `sb-views · rightHTML 防废片:形态没单独出图不算缺图(主体权威图照样随包发出去,不报假警)` | F11 先断言前提(`shotRefImages` 实际带 1 张),再断言不报缺图且标签是「已绑定主体图」;反向那半用 F12 钉住整档提醒没被改哑 |
| 3 | `sb-views · rightHTML 防废片:只有占位图的主体算缺图(占位 dataURL 不喂模型),与真实发包同结论` | F3 与 F6 两格各自先断言 `shotRefImages` 的实际张数,再断言提醒跟着走 |
| 4 | `contract · 「这一镜带不带得上主体参考图」只此一份:右栏防废片提醒经 Domain.subjectRefImage,不自判图字段` | 源级两条(`sj.image \|\| sj.imgRef` 零命中、派生调用恰 1 处)+ **反向钉住 A 组没被带走**:只有大头照的主体在 `ReleaseCore.gates` 的 G9 上仍 `fail`、`gateBlockers` 仍出 `subjects-no-image`,而同一夹具在 `subjectRefImage` 上就是有图 |

用例 1 的桩是主判据:**内联字段判定拿不到桩**(它读的是主体对象,桩换的是派生),
退回任何一份自判都当场红。用例 4 的后半是本槽的防越界闸——谁哪天顺手"统一"了 G9,那一条先红。

变异复核(四组,各红各的):

| # | 变异 | 结果 |
|---|---|---|
| M1 | 四处整体退回基线内联判据 | 红 **4**:三条 `sb-views` 全红 + `contract` 源级点名(`sj.image \|\| sj.imgRef` 期望 0 实际 4) |
| M2 | 只退缺图集那两处(标签仍走派生) | 红 **4**:同上,`contract` 报实际 2 —— 半退不留活口 |
| M3 | 换成隔壁那条近义链 `Store.subjectImage`(形态图 > 权威图,不认大头照、不排占位) | 红 **3**:桩那条 + 占位图那条 + `contract` 的"派生调用恰 1 处"(期望 1 实际 0) |
| M4 | 派生调用回填成只看主体权威图一个字段(修对了 F11,仍丢大头照与占位过滤) | 红 **3**:同 M3 —— 这一手正是最像"顺手修一下"的错解,占位与大头照两格把它拦下 |

反向抽查:既有 7 条 `sb-views` 用例、发布门 `release` 套件、`contract` 里 W147 立的前置门槛那两条,本槽全程绿。

## 6. 数字与边界

| 项 | 基线 `cdf537e` | 本槽 |
|---|---|---|
| `node tests/unit.js` | 598/598,0 FAIL | **602/602**,0 FAIL |
| └ `sb-views` 子套件 | 7 | **10** |
| └ `contract` 子套件 | 131 | **132** |
| `node tests/integration.js` | 143/143,0 FAIL | **143/143**,0 FAIL(该文件未进 diff,复跑核实) |
| `node tests/cli.smoke.js` | 106/108 | **106/108**(两项与 `master` 同名同表现:`未登录 whoami → exit 3`、`llm --json mock 链路`) |
| `node tests/e2e.js` | 未跑(按目录纪律仅在明确要求时跑) | 未跑 |

`node --check` 过:`js/sb-views.js`、`tests/unit.js`。

棘轮按 **live** 抬(不抄旧数):`tests/unit.js` 单元 `FLOOR` 598 → **602**、记账件 `FLOOR` 209 → **210**;
`README.md` 的「单元测试(N 项断言」598 → 602、契约段自报条数 131 → 132;
本目录 `README.md` 明写份数 209 → **210**(含本份)并补索引行。
`GUARD_TOPICS` / `TOPIC_FLOOR` / 花名册仍是 19/19/19(**本槽不登记护栏主题**),`gaps()` 一个键不拆。

边界:

- **发布门一字未改**:`js/release.js` 与 `js/release-core.js` 本槽根本没进 diff,G1–G10 判据、
  `fail/warn` 计数、`overall` 四级映射、G9 的一键处置子集全部原样。
- **A 组 12 处一字未改**:那 12 份 `!s.image` 仍是 12 份。它们同真同假、判的又是另一问,
  收口换不出行为差别却要动 G9 的取值,按停工位第 3 条不做。
- **不造第三份谓词**:本槽净减一份(把 C1 那份改成读已有派生),`Domain` 侧一行未加。
- **不改 `emptyBatchNote` / digest 通用位 / 主体空跑 note / evolve / steps / produce 漏斗 / `listModels`**:
  这些文件本槽全部没进 diff。
- **不合并其它槽**:基线是 W196 集成线 head,本槽只加自己这一条分支提交;与 W197 的
  `emptySubjectImageNote` 无重叠(见下)。

## 7. 交接

1. **与 W197 的冲突面:只有一份文档数字,产品文件零重叠。** W197 动的是主体生图空跑回执
   (`emptySubjectImageNote` 那一路),本槽动的是 `js/sb-views.js` 的右栏取图判定,两侧产品文件不相交;
   `tests/unit.js` 分别加在 `sb-views`+`contract` 与它自己那一档,按名成集不会互吃。
   会撞的是同一批数字字面:单元 `FLOOR`、记账件 `FLOOR`、两份 `README` 的条数与份数——
   合入时一律按合完 live 实跑重取,两支各自自称的数都不作数。
2. **A 组那 12 份 `!s.image` 仍然在那儿,而且现在有了对表。** 将来若真要收,收的应当是
   "第一问也做一个 `Domain` 派生(比如 `D.subjectAuthorImage`)让 12 处同读",而**不是**把它们并进
   `subjectRefImage`——并过去会把 F6/F8/F13 三类项目从 G9 的 `fail` 变成 `pass`(只有大头照/只有形态图
   就算权威图齐了),那是抬走门槛不是收口。本文第 1 节那张表就是那一天的判前证据。
3. **`js/humanreview.js` 的内联链与 `subjectRefImage` 差一格(F3)**,注释却写着"与 `shotRefImages` 一致"。
   本槽如实登记不收:它产出的是待审 URL 清单不是缺图判定,那一格差别落到 `guardAsync` 上是 0。
   要收得连带判断"占位 URL 该不该进真人审核集",与本槽是两件事。
4. **`Store.subjectImage` 是第四条链**(`形态图 > 权威图`,不认大头照、不排占位),用在
   `recognizedRefs` 的缩略图与主体改名用例上。它答的是"显示哪张图",与两问都不同,本槽没碰;
   M3 变异证明拿它替 `subjectRefImage` 会当场红。
