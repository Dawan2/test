# W4 · 分镜↔主体引用完备性校验落地(SK-12 / S-03 完备性半)

> 输入件:`w1-selected-skills.md`(短名单 SK-01…SK-30 与缺口 S-01…S-07)、`w2-skills-align-30.md`(30 条落表口径与 `pending` 纪律)。
> 基线:`js/skills.js` 的 30 条索引 + `CHECKS` 空表。本轮在其上增量,不另起注册表、不新增页面、不新增计费标签。
> 落地文件:`js/skills.js`(校验项实现 + SK-12 条目)、`js/domain.js`(取图/全称助手抽单源)、`js/commands.js` 与 `cli.js`(就绪检查消费点)、`tests/unit.js`(新 `skills` 套件 + 契约口径)、`tests/cli.smoke.js`(CLI 回执断言)、`README.md`。

## 1. 一分钟结论

- `Skills.CHECKS` 从空表落地**第一条真实校验项** `subjects.shotRefIntegrity`,SK-12(`subjects.refIntegrity`)的 `pending: ['check']` 随之清空——**先有实现,再登记**,契约测试的"不挂假出口"那条同时改为双向对齐(登记必有实现、实现必被引用)。
- 判定内容:逐镜看 `characters` / `scene` / `props` 的引用名能否落到主体库,落到的主体(含形态)有没有可喂模型的真实参考图。三类命中分两级:引用名解析不到判 `fail`,缺参考图与零主体引用判 `warn`。
- 判定口径**一律现取 `Domain`**:按名查找走 `Domain.findSubject`(含多形态全称与曾用名兜底),取图走本轮新抽的 `Domain.subjectRefImage`(与真实生成请求同一优先级),全称走 `Domain.subjectFullName`。skill 层不写第二份解析。
- 消费点是既有的**生产就绪检查**:浏览器 `Commands.execute('episode.preflight')` 与 CLI `exec episode.preflight` 的 `result.checks` 是同一份结论。**只报不拦**——不进 `Domain.episodeState.blockers`、不改 `ok/status`、不动发布门与问题中心、不新增计费动作与标签(`episode.preflight` 仍是 `risk:read` / `meter:false`)。
- 验收:`node tests/unit.js` **212/212 通过**(新增 `skills` 套件 6 条 + `commands` 套件 1 条,未删测、未放宽既有断言);`node tests/cli.smoke.js` 新增一条真实服务端回执断言并通过(52/54,另 2 项为与本轮无关的基线失败,已在改动前后各跑一次确认同样失败)。

## 2. 校验项判据

`CHECKS['subjects.shotRefIntegrity'](obj, ctx)`,`obj` 收领域对象包 `{p, ep}`(集级)或 `{p, s}`(镜级),`ctx` 收调用侧差异;返回 `{pass, level, hits}`,`Skills.check` 再包一层 `{id, skill, …}`。

| 命中码 | 判据 | 级别 | 为什么是问题 |
|---|---|---|---|
| `unknown-subject` | 引用名经 `Domain.findSubject` 解析不到任何主体(含多形态全称与曾用名兜底后仍不中) | `fail` | 该名字在生成时无参考可注,必是错字、漏提取,或主体改名后镜头旧名未回填 |
| `no-ref-image` | 解析到主体但 `Domain.subjectRefImage` 取不到真实图(无图,或只有 `data:` 内联图) | `warn` | 该主体不会进生成请求的参考图组,形象不锁定 |
| `no-subject-ref` | 该镜 `characters`/`scene`/`props` 全空 | `warn` | 整镜无主体锁定,易换脸;主体缺失类提醒也永不触发 |

- 级别聚合:出现 `unknown-subject` 即 `fail`,否则有命中即 `warn`,零命中 `info`;`pass = 命中为空`。
- `hits` 每条带 `{code, shotId, order, name}`——`order` 是镜号(1 起),`shotId` 供调用方跳转定位;同一名字在多镜命中即多条,按镜计位,聚合展示由调用方决定。
- 无判定输入(无项目上下文 / 该集零镜头)时回 `info` + 空命中,**不拿"通过"冒充"没判"**。
- 纯本地零 LLM 零计费、纯函数:同输入同结论,不改动传入的领域对象(单测逐条断言)。
- 判据依据的方法论条目是 `KB.GC_REFS`(SK-12 条目 `kb` 面),条目正文不进本层。

## 3. 单源与消费点

**`js/domain.js` 抽两个助手(纯新增 + 原地复用,输出逐字节不变)**:

| 助手 | 口径 | 原先在哪 |
|---|---|---|
| `D.subjectFullName(r)` | 解析结果 → 引用全称(多形态为"主体名-形态名") | 内联在 `shotRefImages` 里 |
| `D.subjectRefImage(r)` | 解析结果 → 可喂模型的真实参考图(形态图优先、其次主体权威图;`data:` 内联图视为无图) | 内联在 `shotRefImages` 里 |

`shotRefImages` 改调这两个助手,行为不变(`domain`/`store`/`sb-gen` 套件与指纹相关断言全绿),校验项与真实生成请求从此共用同一取图口径——单测里用 `Domain.shotRefImages(p, s).refImages` 反向对齐:凡进了参考图组的主体一律不会被判缺图。

**`js/skills.js` 的加载期依赖从一件变两件**:`KB`(条目正文)与 `Domain`(领域判定)。两者都是双端纯模块,浏览器加载顺序都在本文件之前(`domain.js` → `knowledge.js` → `skills.js`),故与 `KB` 同为加载期依赖;晚于本文件加载的注册表(`Prompts`/`CmdRegistry`/`ExpertsData`)仍一律由调用方注入,纪律不变。契约测试同步加一条 `index.html` 顺序断言,并把"factory 体不出现环境句柄"的取体锚点跟到新签名 `(KB, Domain)`。

**消费点(两端各一处小改动)**:

```
episode.preflight → { ok, status, result: { …Domain.episodeState, checks: [ {id, skill, pass, level, hits} ] } }
```

- `js/commands.js`:`window.Skills` 缺失时 `checks` 为空数组(不阻断命令);
- `cli.js`:`Skills` 已在 W2 就 `require` 进来,本轮起真正被调用。
- 两端都用 `Object.assign({}, st, { checks })`,校验结论只挂在 `result.checks`,不并入 `Domain` 推导结果的任何既有字段。

选就绪检查而不是问题中心/发布门,是因为它是 SK-12 条目里本来就登记的命令面,且**加字段不改判定**:问题中心与发布门的清单口径一动,存量项目的门禁状态就会跟着变——本轮不做这件事(见第 5 节)。

## 4. 记账:与前两波文档的出入

1. **SK-12 的 `gaps` 保留 `S-03`**。S-03 登记的是两件事:"镜头引用了主体库中不存在的名字"(完备性)与"同一主体在多镜头的参考不一致"(一致性)。本轮闭合完备性半,一致性半仍在 SK-13(`subjects.crossShot`,`pending: ['check']`)。条目 `note` 如实写明这一点,缺口投影 `Skills.gaps()['S-03']` 仍能列出两条能力。
2. **契约断言"CHECKS 应为空表"按 W2 文档第 6 节的预告改口径**,不是放宽:原断言只能证明"没有假出口",新断言证明的是双向对齐——登记的校验项必有实现、实现必被某条目引用(不留孤儿实现)、每步 `check()` 的结论数等于该步**已落地**校验项数(`pending` 含 `check` 的条目一律按 0 计)。W2 那三条"pending 面不得登记"的断言原样保留。
3. **校验项 id 与条目 id 分开**:条目 id 是 `subjects.refIntegrity`(能力),校验项 id 是 `subjects.shotRefIntegrity`(实现)。一条能力后续可能挂多个校验项,结论里 `id`(实现)与 `skill`(能力)两个字段都给。

## 5. 本轮明确不做

- **不进 `blockers` / 发布门 / 问题中心**:发布门 G2 的清单口径与 G9 的主体缺图口径原样不动;`overall` 不会因为本轮多出 `fail` 级校验结论而变化(校验结论根本不进门)。要不要把方法论校验挂成可选门,是 SK-29(G-10 / S-07)的事。
- **不改计费**:`episode.preflight` 仍是零计费 read 类命令,无新增计费动作与标签(单测源级断言)。
- **不新增页面与实体**:没有新 UI 入口,没有新存储桶,没有新领域命令。
- **不碰并行槽的核心 hunk**:G-02(长期记忆双端)的 `js/agent.js` / `js/experts.js` 完全未动;G-04(headless 前段)会动的 `cli.js` / `js/commands.js` / `js/cmd-registry.js` 只在 `episode.preflight` 处理器一处各 2 行,不与新增命令的注册区域重叠;`js/domain.js` 只动 `shotRefImages` 附近,与审片升步(G-03)动的 `workflow` 区域错开。

## 6. 验收挂钩

| 层 | 断言 |
|---|---|
| `tests/unit.js` `skills` 套件(新增 6 条) | 干净夹具(引用齐备 + 多形态全称 + 曾用名)全 `pass`/`info` 零命中;引用不存在的名字 → `fail` 且 `hits` 带镜号、镜头 id 与名字;缺参考图与零主体引用 → `warn` 不升 `fail`;缺图判定与 `Domain.shotRefImages` 逐名对齐 + 镜级入口只判该镜;纯函数(不改入参、同输入同结论)与无判定输入不产出结论;双端消费点源级同口径 + 就绪检查仍 `read`/不开计费 |
| `tests/unit.js` `commands` 套件(新增 1 条) | 就绪检查回执带 `result.checks`,`fail` 结论不改 `ok`、不混进 `blockers`;引用补齐后同一集再跑即全通过 |
| `tests/unit.js` `contract` 套件(口径更新) | `CHECKS` 与条目登记双向对齐;每步结论数 = 该步已落地校验项数;`skills.js` factory 签名与 `index.html` 加载顺序(`domain.js` 之前) |
| `tests/cli.smoke.js`(新增 1 条) | 真实服务端往返:冒烟夹具两镜的场景「宴会厅」未提取为主体(`unknown-subject`×2)、角色「女主」无参考图(`no-ref-image`×2)→ `level=fail`,而 `status` 仍是 `ready`(只报不拦) |

## 7. 后续入口(本轮不做)

- **SK-13 跨镜头主体一致性**(S-03 一致性半):判据是同一主体在多镜的参考图/形态是否漂移,消费点按条目登记走批量生成与单镜生成。
- **SK-11 主体参考纪律的校验面**:与本条同 stage,`Skills.check('subjects', …)` 已是它的现成出口,落地后就绪检查回执自动多一条结论,消费点不用再改。
- **展示面**:本轮结论只在命令回执里。要在浏览器可见,最小改动是让消费方(问题中心或分集页)读 `result.checks`——但那会改问题清单口径进而影响发布门 G2,须单独一轮定性。
