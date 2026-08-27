# W22 · G-06 校验半落地:主体参考纪律与多镜头写法的生成前置 warn

> 处置对象:`w1-architecture-spec.md` 第 3 节 W4 第 2 项——**G-06 的校验半**「主体参考纪律以校验项形式前置提示(生成前 warn),而非直接改写用户 prompt」。
> W19 把「多镜头写法」进拆镜人设、「主体参考」进主体提取人设,注入半闭合后如实记着(`w19-g06-inject.md` 第 7 节):校验半仍是 pending,`gaps` 里照挂 SK-11/SK-13。
> 基线:`cursor/w19-g06-inject-a20c @ 34cf63f`。
> 并行避让:W20 核验、W21 合流各自单列;本槽**只在 `js/skills.js` 的 `CHECKS` 里加实现 + 改两条条目的登记**,不碰 `js/commands.js`/`cli.js` 的 preflight 段(那里是 W17 面表与 W21 合流的热点)。

## 1. 为什么这一槽只加实现、不加消费点

就绪检查的校验面清单是**从条目登记推导**出来的:一个面进不进 `result.checks`,取决于该面上有没有"校验面已落地(`pending` 不含 `check`)且 `cmds` 记了 `episode.preflight`"的条目。

SK-11 与 SK-13 的 `stage` 都是 `subjects`,而 `subjects` 面早就在表里(SK-12 W4 就落了)。所以本轮**新增两条校验项,两端消费实现一行不用改**:

```
Skills.check('subjects', { p, ep }, ck)   // 结论数 2 → 4,调用点字面不变
```

实测(本轮 HEAD):按登记反查出的消费面仍是 `script,subjects,eps,film`,与基线逐字相同;`js/commands.js` 与 `cli.js` 在本轮 diff 里为 0 行改动。这正是"新增一面只改一处"的收益——本轮连"一处"都不必改,因为面已经在了。

## 2. 判定输入:那份**真实的**生成请求

两条校验项都不自己拼一份"假想的生成请求",一律现取 `Domain`:

| 取什么 | 现取 | 为什么不在校验层写第二份 |
|---|---|---|
| 该镜参考图组(含 5 张上限、取图优先级) | `Domain.shotRefImages(p, s)` | 与真实发送同一构造点;上限/优先级一改,校验结论自动跟随 |
| 主体按名解析(多形态全称、曾用名) | `Domain.findSubject` / `subjectFullName` | 与 SK-12/SK-13 同一份解析,三条结论互不打架 |
| 该主体可喂模型的那张图 | `Domain.subjectRefImage` | `data:` 内联图不算真实图的口径只有这一份 |
| 整条生成请求(prompt / strategy / 输入图) | `Domain.buildVideoRequest(p, ep, s)` | 提示词里那句一致性声明是**请求装配时**加上的,不看真实请求就判不准 |

提示词正文取 `s.prompt` 优先 `s.plot`(与请求装配同口径);两者都空即这一镜还没有可判定的提示词,**不产出结论**——不拿"还没写"当缺陷报。

`Domain.buildVideoRequest` 装不出来(数据残缺)时该镜跳过,不抛到调用方;这与 `buildGenerationSignature` 自身的容错同一姿态。

## 3. SK-11 `subjects.genRefDiscipline`(主体参考面)

KB「主体参考」五条里,**生成前在文本层判得动**的是②③两条;①④在真实请求里由 `Domain.shotRefImages` 的主体定义后缀物化(「将图片N定义为「名字」」+ 不出现分身),代码保证,不需要再判;⑤是台词/音效/音乐/字幕分符号书写,本平台的提示词成型链路不走那套符号,判了只会全镜误报,故不做。

| 命中码 | 判据(条目正文) | 分级 |
|---|---|---|
| `ref-person-overflow` | ②「参考人物≤4,越多越易识别模糊」——该镜**进了参考图组**的人物主体数超上限。上限现取条目正文 `/参考人物≤(\d+)/`,校验层不写第二份数字 | warn |
| `ref-cap-dropped` | ②素材总数上限的直接后果——该主体有真实图,却没进参考图组(被 5 张上限挤出),这一镜拿不到它的参考 | warn |
| `ref-sheet-fallback` | ③「人物参考用大头照+全身照,不要用三视图/多视图(模型会误判为多个主体)」——人物主体没有视频参考大头照 `s.imgRef`,取图优先级回退到白底三视图权威图 `s.image`,喂出去的就是三视图 | warn |

`ref-sheet-fallback` 是本轮**最有实际含金量的一条**:角色主体的 `s.image` 按平台口径就是白底三视图设定图,`s.imgRef` 才是大头照;取图优先级 `形态图 > 大头照 > 权威图` 里,没生成大头照时确实会把三视图送进视频模型(这一点 README 早就写明"未生成大头照时行为不变")。这条 warn 不改那个行为,只是在生成前把它说出来,补出 `s.imgRef` 后命中自动消失。

不重复报的边界:引用名解析不到、主体全程无真实图,都归 SK-12 完备性面;同一主体跨镜锁不一致归 SK-13。本项只报**这一镜的参考纪律**。

分级一律 warn:参考纪律影响的是抽卡命中率,不是"必然拿不到参考";`fail` 仍只留给完备性面。

## 4. SK-13 `subjects.multiShotPrompt`(多镜头写法面)

条目「多镜头写法」三句话,三条判据一一对应:

| 命中码 | 判据(条目正文) | 分级 |
|---|---|---|
| `img2ref-decl-missing` | 「图生视频须声明"基于参考图保持人物样貌与服装一致"」——送了图(输入图或参考图组)却在**真实请求的 prompt** 里找不到那句声明 | warn |
| `frames-motion-overrun` | 「首尾帧策略时动作幅度收敛,保证两端画面可插值」——`strategy==='frames'` 的镜写了大幅动作 | warn |
| `shot-flow-fragmented` | 「按时间顺序描述镜头流,不要太碎」——一镜提示词里镜头切换信号出现超过 2 次 | warn |

**声明的判定字面不硬编码**:先从条目正文里取出那句 `须声明"…"` 的原话,再只留其中判得动的两个词(`参考图`/`一致`)。真实请求里这句声明是由主体定义后缀给出的(措辞与条目原话不同,但是同一条纪律),所以判"两个词都在不在"而不是判原话逐字出现。条目改写到这两个词都不在了,判据自然退空——**宁可不判,也不拿失配的字面制造假命中**(与 SK-09 阈值取自「对话铁律」正文同一条纪律)。

因此这条只会在**有图输入但没有主体参考图组**的镜上命中:`ref`/`frames` 策略拿分镜图或首帧当输入图,而该镜引用的主体一个真实图都没有时,请求里既没有主体定义后缀、也没有任何一致性声明——这正是"图生视频却没告诉模型要贴着图走"。有主体参考图组时后缀自带该声明,不报。

## 5. skill 索引变更(记账)

| 条目 | 字段 | 基线 | 本轮 |
|---|---|---|---|
| SK-11 `subjects.refDiscipline` | `pending` | `['check']` | `[]` |
| SK-11 | `checks` | `[]` | `['subjects.genRefDiscipline']` |
| SK-11 | `gaps` | `['G-06','G-13']` | `['G-13']` |
| SK-13 `subjects.crossShot` | `checks` | `['subjects.crossShotConsistency']` | `+ 'subjects.multiShotPrompt'` |
| SK-13 | `gaps` | `['G-06','S-03']` | `['S-03']` |
| SK-21 `gen.videoTpl` | `note` | 「其校验半仍挂 SK-11/SK-13」 | 「校验半由 SK-11/SK-13 的校验项承接,G-06 两半到此清账」 |

`gaps` 清账口径沿用 W19 对同一缺口的处置(注入半闭合即从 SK-19/SK-21 清账):**实测 `Skills.gaps()['G-06']` 由 `['subjects.refDiscipline','subjects.crossShot']` 变为 `undefined`——G-06 两半皆闭。**

`cmds` 侧一动不动:两条仍只记 `episode.preflight`,**不挂** `episode.generateVideos`/`shot.generateVideo`(见第 7 节残留)。单测里那条"条目不得挂未接的命令面"的断言保留,只把过时的 G-06 措辞换成实况。

## 6. 取证

### 6.1 行为断言(7 项,`node tests/unit.js skills`)

- **三视图回退**:角色带 `imgRef` → `info`;只有权威图 → `ref-sheet-fallback`,并用 `Domain.shotRefImages` 反查"这一镜确实把权威图喂了出去";形态自带图不算回退;补出 `imgRef` 后命中消失。
- **人物上限**:恰好 4 人不报,5 人报 `ref-person-overflow:5/4`;上限断言取自 KB 条目正文(`参考人物≤4` 字面失配即红)。
- **上限挤出**:4 角色 + 场景 + 道具 = 6 个有图主体,参考图组只装得下 5 个,道具报 `ref-cap-dropped:玉佩/5`;同一夹具下**完备性面零命中**——这一处只有本项看得见。
- **不重复报**:未知名 + `data:` 内联图 + 缺图三种脏引用,参考纪律面全不报,完备性面照报 `unknown-subject,no-ref-image,no-ref-image`。
- **图生视频声明**:无主体图的图生视频镜报 `img2ref-decl-missing`;纯文生视频镜不判;有主体参考图组时先断言 `q.prompt` 确实含「参考图」与「一致」,再断言不报。
- **首尾帧与太碎**:`frames` + 「奔跑」报 `frames-motion-overrun:奔跑`,动作收敛不报,换成 `ref` 策略不判;3 个切换信号报 `shot-flow-fragmented:3/2`,条目示例那种"按时间顺序的一条镜头流"不报。
- **纯函数**:两条都断言同输入同结论、不改动领域对象、无镜头/无项目上下文/提示词未写一律不冒充结论。

### 6.2 登记与消费反查(1 项)

`SK-11 pending` 清空、`checks`/`gaps` 逐字对齐、SK-13 两条实现、`Skills.gaps()['G-06'] === undefined`;两条都在"登记了 `episode.preflight` 的已落地校验条目"名单里且 `stage === 'subjects'`(证明面表不变、双端消费实现不必改);双端 preflight 仍只跑四面、**不新开 `Skills.check('gen')`**;`episode.preflight` 仍是 `read` 类零计费;`js/sb-gen.js`/`js/produce.js` 不出现 `Skills.`(生成动作里不加拦截);发布门 G2 仍只数高/中危。

### 6.3 变异实测(摘掉实现就得转红)

| 变异 | 结果 |
|---|---|
| `ref-sheet-fallback` 命中条件改为 `false` | `skills` 套件 2 红 |
| SK-13 的 `checks` 摘掉 `subjects.multiShotPrompt` | 7 红(含契约套件"孤儿实现"与命令层四面并集) |
| `CUT_MAX` 由 2 放宽到 9 | 1 红(`shot-flow-fragmented` 不再命中) |
| `DECL_WORDS` 退成空数组 | 1 红(`img2ref-decl-missing` 不再命中) |

## 7. 如实记录:没做的与为什么

- **生成动作侧不加即时提示**。批量/单镜生成前弹一层 warn 需要先定"提示要不要拦生成"的产品口径(`w4-sk13-consistency.md` 第 80 行、`w19-g06-inject.md` 第 114 行都登记过这一点)。本轮的消费形态是**就绪检查(生产就绪检查,`episode.preflight`)**——它本身就是生成前那一道,`episode.produce` 也以同口径先跑它。故 `cmds` 不挂那两个生成命令,单测断言保留防止条目挂上未接的命令面。
- **问题中心没接这两条**。`js/issues.js` 是另一种消费形态(逐条挑 skill 拼展示文案),尚未收成表(W17 记为单列一槽)。它按 `x.skill === 'subjects.crossShot'` 取第一条,拿到的仍是一致性结论,行为与基线逐字相同;要让参考纪律与多镜头写法也出现在问题中心,得先把那六个取值点收表,不在本轮夹带。
- **「主体参考」①④⑤三条没做校验**。①④已由 `Domain.shotRefImages` 的主体定义后缀在代码层保证(判了永远 pass,是假 check);⑤那套符号书写不是本平台提示词成型链路的口径,判了全镜误报。
- **SK-19 抽卡军规稳定词的校验面仍是 pending**。`w1-architecture-spec.md` 那一项把"稳定词"与"主体参考纪律"并列,前者属 SK-19 的 `check` 面,其 `gaps` 已在 W19 按注入半清账,不在 G-06 账内;要做得先定"哪些词算稳定词",单列。
- **一条 skill 挂两条实现的展示后果**。SK-13 现在产出两条结论,`result.checks` 里出现两个 `skill: 'subjects.crossShot'`(`id` 不同)。就绪检查回执与单测按 `id` 区分没有问题;调用方若按 `skill` 去 `find`,只拿得到第一条——这一点在上面第二项里已登记。

## 8. 回归

- `node --check`:`js/skills.js`、`tests/unit.js` 通过。
- `node tests/unit.js`:**308/308 PASS, 0 FAIL**(基线 301,净增 7 项)。
- `node tests/integration.js`:**93/93 PASS**。
- `node tests/cli.smoke.js`:**62/64**,失败两项(`未登录 whoami → exit 3`、`llm --json mock 链路`)在基线同样失败,已在基线复跑比对,与本轮无关。
- README 同步:skill 索引段主体面「两条」改「四条」并补两条新校验项口径、统一领域命令段 `result.checks`「八条」改「十条」、测试段断言数 301 → 308 与 skills 套件描述。
- 未运行 `tests/e2e.js`(按仓库约定仅用户明确要求时跑);本轮无 DOM 与 UI 改动。
