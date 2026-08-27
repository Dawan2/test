# W54 · 问题中心补两类投影:未审分集与 SK-19 稳定词

> 基线 `cursor/w50-integration-dad5 @ 371c75e`,落地分支 `cursor/w54-issues-unreviewed-sk19-cfc0`。
> 本槽只在 `Issues.collect` 上加**三条投影**(`no-review` / `review-stale` / `shot-stable-lexicon`),
> 判据一条都不新写:审片三态现取 `Domain.episodeState`,稳定词现取 `Skills.check('shots', …)` 的既有结论。
> 不改发布门口径、不改校验项实现、不新增命令与计费动作、不新起第二张问题列表。

## 1. 结果一句话

问题中心此前有两个洞:**审片这一步只报低分**(集子已经出片、审片没过,清单里一条都没有,主线断点看不见),
**SK-19 稳定词面的结论只到就绪检查**(问题中心按具体校验项 id 取 `hits`,本面没有取值点,读不到)。
本槽把两处都接进既有聚合口,条目结构与既有六处投影同构(`kind` / `sev` / `count` / `label` / `detail` / `epid` / `goto`):

| 新增 `kind` | 危险级 | 挂载级别 | 判据来源 | 处置 |
|---|---|---|---|---|
| `no-review` | mid | 分集 | `Domain.episodeState().reviewAvg === null` | 导航到该集工作区 |
| `review-stale` | mid | 分集 | `Domain.episodeState().reviewStale` | 导航到该集工作区 |
| `shot-stable-lexicon` | **low** | 分集 | `Skills.check('shots')` 里 `shots.promptEightDim` 的 `hits` | 导航到该集工作区 |

回归:`unit 383/383`(基线 380,净 +3 用例)、`integration 93/93`、`cli.smoke 62/64`
(两项失败在 `master` 上逐字相同,属基线环境态:`未登录 whoami → exit 3`、`llm --json mock 链路`)。
未删测、未跳过失败、未放宽任何既有断言(两处断言按实况**翻转**,见 §5)。

改动五个文件:`js/issues.js` +40−6、`js/skills.js` +8−5(两条 `note`)、`tests/unit.js` +72−3、
`README.md` 与 `docs/skills-wave/README.md` 口径同步,加本文。

## 2. 未审分集:可复现规则与挂载位置

规则一句话:**该集已有镜头(或已出片、已合成)而 `review` 步骤没过 → 报一条。**

"已有镜头"不靠新写条件,靠**挂载位置**保证:`collect()` 的逐集循环在这一条之前已经把
缺剧本(`no-script`)、未拆镜(`no-shots`)、分镜判旧(`shots-stale`)三条早退掉了,
走到这一行的集必然 `counts.total > 0` 且分镜表对得上当前剧本——审片正是它主线上的下一道断点。
明细里如实带该集的镜头数与出片/合成进度(`已有 3 镜、3 镜已出片`),让读者一眼看出断点卡在哪。

三态互斥,同一集只报一条,与 `Domain.workflow` 审片步的 `blockers` 码逐字同名:

| 实况 | `episodeState` | 本槽产出 |
|---|---|---|
| 从未审 / `lastReview.avg` 不是数 | `reviewAvg === null`、`reviewStale === false` | `no-review` |
| 有记录但 rev / 图谱 / 镜头集快照失配 | `reviewStale === true`(`reviewAvg` 随之为 `null`) | `review-stale`(文案「视为未审」,与发布门 G3 同口径) |
| 有未判旧记录、均分低于达标线 | `reviewAvg < 7` | 既有 `low-review`(一行未改) |
| 有未判旧记录且达标 | `reviewAvg >= 7` | 零条 |

`review-stale` 这一档此前是**明确的空白**:`low-review` 那条的守卫是 `!st.reviewStale`,
判旧的旧分不再报问题,而"需重审"只由分集页/报告页的「旧版」标记承接——
问题中心与发布门 G3 因此结论相反(G3 视为未审 fail,问题中心零条)。本槽按 G3 口径补齐,
并把那行注释里"「需重审」语义由分集页/报告页标记承接"改成实况(由上面这条承接)。

**为什么是 mid 而不是 high**:发布门 G2 只数高/中危,`high` 会让 G2 从 `pass` 直接变 `fail`。
未审片本就有专门的硬门(G3 每集必审 fail)与 G1(集状态非 done),再让 G2 也 fail 是同一件事说三遍;
mid 让 G2 如实变 `warn`——问题清单里看得见、门禁计数如实、不新增一道 fail。

**为什么不挂命令处置**:`episode.smartReview` 是计费动作。既有的 `low-review` 也是导航类,
本槽沿用同一口径——问题中心不代按会扣积分的按钮,点「去处理」到该集工作区,由用户自己发起整集审片。

## 3. SK-19:投影而非第二份判据

`shots.stableLexicon`(W26 落地)判的是该镜**真实发出去的那条提示词**(`Domain.buildVideoRequest`),
三条命中码全是 `warn`。本槽只做展示投影:

| 命中码 | 展示文案 | 明细补的定位 |
|---|---|---|
| `no-stable-word` | 提示词一个稳定词都没写 | `(该补:不变形、结构正常、不僵硬)` |
| `stable-word-partial` | 稳定词只写了一部分 | `(该补:结构正常、不僵硬)` |
| `vague-word` | 模糊词等于没写 | `(很酷)` |

码 → 中文的文案表落在 issues 层(与既有五张码表 `CONSIST`/`CAPTION`/`CRAFT`/`EPSC`/`SIZE` 同一位置),
**判据与词表一个字都不在这里**——稳定词与模糊词仍从 KB 两条抽卡条目正文现筛,条目改写到字面不在了判据自然退空。

**仍是 warn 级**:条目挂 `sev: 'low'`,发布门 G2 只数高/中危,故本条不改任何存量项目的门禁状态,
也不进 `Domain` 的 `blockers`、不拦生成动作、不动 `episode.preflight` 的 `read` 类零计费定性。

**分镜面一次跑完按条目分挂**:原先 SK-18 那条自己跑一次 `Skills.check('shots', {p, ep})`,
本槽不再为 SK-19 跑第二次——整面结论取一次,按 `x.skill` 分给两条投影。
`collect()` 由 `Bus '*'` 防抖轮驱动、对每集都要推一遍,少一次全面重跑是净收益,行为逐条不变。

## 4. 双端与单源

`collect()` 里这三条**没有一行判定逻辑**:审片三态取 `Domain.episodeState`(UMD 双端,`js/domain.js`),
稳定词取 `Skills.check`(UMD 双端,`js/skills.js`),两者都是浏览器 / `server.js` / `cli.js` / `mcp.js`
共用的那一份;投影层只做"哪一档危险级、挂在哪一级、文案怎么写"。
故本槽不存在两端各抄一份判据的可能——把判据改坏,先红的是 domain / skills 两个套件。

`js/issues.js` 本身仍是浏览器侧模块(它同时管弹窗渲染、`Bus` 订阅与命令层处置),**本槽没有把它 UMD 化**:
那是另一件事——W17 已把它记为单列一槽(六个取值点的消费形态各不相同,要收得先抽"提醒投影表":
面 → 校验项 id → kind/sev/挂载级别),本槽按最小改动纪律不夹带。CLI 侧对应的出口是
`cli.js release-check` 的发布门(G1/G3 已如实报未审)与 `exec episode.preflight` 的 `result.checks`
(稳定词面早已在回执里),两端读的是同一份判定,只是投影形态不同。

## 5. 两处按实况翻转的断言(不是放宽)

| 位置 | 原断言 | 现断言 | 为什么 |
|---|---|---|---|
| `skills` 套件 SK-19 消费点 | `js/issues.js` 里**不得**出现 `shots.promptEightDim`(「要不要挂的产品口径未定」) | 必须出现取值点,且条目为 `sev: 'low'` | W26 残留第 1 条把这件事挂账为"产品口径未定,不替产品定";本槽定了口径(挂、低危),断言随实况反向钉住——留着旧断言等于让测试宣称与代码相反的事 |
| `skills` 套件记账对齐 | SK-23 的「仍欠」段须点名 `SK-24` 与 `未审片` | 点名 `SK-24` 与 `G-10` | 「问题中心只报低分不报未审片」这处余量本槽补掉,`note` 随之改写;点名锚点跟着 `note` 实况走(那条断言只认「仍欠」之后那段,补完了不改锚点就点不住) |

同一处另**新增**两条正向断言(防记账与实况脱节的另一头):
`js/issues.js` 里必须有 `no-review` / `review-stale` 两条 mid 投影(SK-23 的 `note` 说了就得做到),
且不得出现 `reviewStaleByScript` 或 `lastReview.avg` 字面(判旧与均分只经 `Domain.episodeState` 取,不写第二份)。

干净夹具 `cleanEp` 的提示词由 `'q'` 改成写全三面稳定词的 `CLEAN_PROMPT`:
"全齐备零噪音"这条基准要想成立,该集在 SK-19 这一面上就得真的干净——
少写一面本来就该报提醒(那正是 §6 第三条用例的夹具)。不是放宽:那条断言仍是"零条",
只是把夹具补成真正齐备,而不是靠这一面判不出结论来充。

## 6. 新增用例(3 条)

| 用例 | 钉住的事 |
|---|---|
| 已生成未审 → 恰一条 `no-review` | 条目恰好一条且是 mid、`epid` 正确、明细带镜头/出片进度、只挂 `goto` 不挂 `cmd`;审完(补上未判旧的达标记录)后归零;未拆镜的集不越过早退分支抢报;空项目零条 |
| 审片记录判旧 → `review-stale` | 三态互斥(判旧的 9 分不叠未审那条、也不按低分报)、文案与 G3「视为未审」同口径、快照对齐后归零 |
| 稳定词/用词漂移 → 低危 | 漂移报 `shot-stable-lexicon` 且 `sev='low'`、明细带镜号与该补的字面、模糊词命中带命中词、全清单无高/中危、写全三面稳定词即无本条 |

## 7. 变异实测(五条,全部先红)

| 变异 | 转红的断言 |
|---|---|
| 未审那条不看审片态(已审完的集也报) | 10 条:`issues` 套件 7 条(含"审完的集不应再报未审"与四条"不得产出高/中危")+ `release` 套件 3 条(干净项目 G2 由 `pass` 变 `warn`、齐备项目 `overall` 变 `warn`、`stampRelease` 拒绝打版本) |
| 摘掉 SK-19 那条投影 | 2 条:`issues` 的稳定词用例 + `skills` 的 SK-19 消费点源级断言 |
| 未审/判旧抬成 `high` | 3 条:两条用例的 `sev` 断言 + 记账对齐里那条 mid 投影的源级断言 |
| 稳定词条目抬成 `mid`(会进 G2 计数) | 2 条:用例的 `sev` 断言 + SK-19 消费点断言 |
| 未审那条挪到未拆镜早退之前 | 1 条:"未拆镜的集不报未审" |

第一条变异同时说明了危险级选型的连带影响面:未审这一档一旦误报到已审完的集上,
发布门 G2 会跟着把干净项目判成有问题——投影层的错会传导到门禁,故用例把两侧都钉住。

## 8. 复核方式

```
git checkout cursor/w54-issues-unreviewed-sk19-cfc0
node --check js/issues.js js/skills.js tests/unit.js   # 通过
node tests/unit.js          # 383/383 PASS
node tests/unit.js issues   # 13/13(含新增三条)
node tests/unit.js release contract skills             # 逐套件 PASS
node tests/integration.js   # 93/93 PASS
node tests/cli.smoke.js     # 62/64(两项与 master 同名同因)
```

`node tests/e2e.js` 按仓库纪律未跑(需用户明确要求)。本槽不含合并,未合入 W51/W52,未开 PR。

## 9. 残留

1. **`js/issues.js` 的 UMD 化与"提醒投影表"**仍未做(W17 记为单列一槽):六个取值点里五个取具体校验项、
   一个取整面并集,挂载级别分项目/分集两档,收表要先定投影表结构。本槽新增的两条方法论投影
   照既有形态挂,没有加深这笔账(仍是同一张表要收的六→七处)。
2. **`review-stale` 与低分的合并展示**未做:同一集若既判旧又低分,现在只报判旧那条(低分守卫本就有 `!reviewStale`)。
   要不要在判旧条目里带上"旧结论是 N 分"属展示口径,未定之前不替产品定。
3. **稳定词提醒挂在集级**:命中带 `shotId`,但条目是按集聚合(与景别衔接同形态)。
   要不要在分镜工作区逐镜标出来,属另一处消费面,本槽不夹带。
4. SK-19 的 `gaps` 仍含 `G-15`/`G-05`/`G-10`,SK-23 仍含 `G-03`:按"关联索引口径落地不摘标记"留原样。
