# W4 · 成片字幕/对白校验落地(SK-28 / S-06)

> 输入件:`w1-selected-skills.md`(短名单 SK-01…SK-30 与缺口 S-01…S-07)、`w2-skills-align-30.md`(30 条落表口径与 `pending` 纪律)、`w4-subject-ref-check.md`(SK-12)、`w4-sk13-consistency.md`(SK-13,本轮基线)。
> 基线:`cursor/w4-sk13-consistency-8080`——`js/skills.js` 的 30 条索引 + `CHECKS` 已有主体面两条。本轮在其上增量,不另起注册表、不新增页面、不新增计费标签、不放宽发布门。
> 落地文件:`js/domain.js`(切段口径下沉)、`js/store.js`+`js/sb-io.js`+`cli.js`(合成侧改取单源)、`js/skills.js`(第三条校验项 + SK-28 条目)、`js/commands.js`+`cli.js`(就绪检查消费点)、`js/issues.js`(问题中心消费点)、`tests/unit.js`+`tests/cli.smoke.js`、`README.md`。

## 1. 一分钟结论

- `CHECKS` 落地第三条实现 `film.subtitleTiming`,SK-28(`film.subtitleQC`)的 `pending: ['check']` 随之清空——**先有实现,再登记**,纪律与 SK-12/SK-13 同。这也是**成片步的第一条校验项**:此前 `Skills.check('film', …)` 恒为空数组。
- 判定的是成片真正会放出来的那条字幕:**烧录会不会被截断、观众读不读得完、字幕停留够不够、开了烧录却一句都没有**。判定输入不是分镜表,而是**合成时间轴段**——这正是 S-06 记的缺口("SRT 现无结构化质检结论")。
- 缺口闭合的前提是先补单源:段时长口径此前在 `js/sb-io.js`(浏览器合成)与 `cli.js`(CLI 合成)各写了一份,烧录截断的 `120` 也是两处手写字面量。本轮把两者下沉 `js/domain.js`(`segDurationOf` / `SUB_BURN_MAX` / `subtitleSegs`),三个调用点(合成 items、SRT 产出、字幕质检)现取同一份,校验项才谈得上"与真实成片同一时间轴"。
- 消费点是既有的**生产就绪检查**与**问题中心**:`episode.preflight` 的 `result.checks` 多一条成片面结论(浏览器与 CLI 同一份),问题中心新增一条 `caption-unreadable` **低危**提醒。**只报不拦**——不进 `Domain.episodeState.blockers`、不改 `ok/status`、不改发布门(G2 只数高/中危)、不新增计费动作与标签、不改合成本身的行为。
- 验收:`node tests/unit.js` **228/228 通过**(基线 220,新增 skills 套件 7 条 + issues 套件 1 条,未删测、未放宽既有断言);`node tests/cli.smoke.js` 新增 1 条断言通过(该脚本在本机另有 2 条与本轮无关的既有失败,基线同样失败:`未登录 whoami` 与 `llm --json mock`)。

## 2. 判定输入:合成时间轴段

`Domain.subtitleSegs(ep, online)` 逐段给 `{id, order, text, dur, start, end}`:

- **段序列**走 `Domain.composeSeqOf`(canonical 时间线快照:`tlOrder` 定序、`tlTrims[id].off` 剔除)——与真实合成 items、`composedInputHash` 完全同源;
- **段文本**取 `dialogue || narration`(与烧录字幕、SRT 取的是同一句;和字幕开关无关);
- **段时长**走 `Domain.segDurationOf(s, hasVideo)`:视频段取时间线裁剪出入点差(无裁剪回落 `estShotDuration` 预估),图片段按 2-15s 钳制预估;
- **起止秒**为逐段累计,与 `SB.buildSrt` 的时间轴推进方式一致(空文本段占时长不出条目)。

改造前后的调用点:

| 位置 | 改造前 | 改造后 |
|---|---|---|
| `js/sb-io.js` `doCompose` | 内联三元式算 `segDur`,`it.dur` 另写一份钳制,烧录文本 `slice(0, 120)` | `Store.segDurationOf(s, true/false)` + `Store.SUB_BURN_MAX` |
| `cli.js` `composeItems` | 同上,内联第二份 | `Domain.segDurationOf(s, true/false)` + `Domain.SUB_BURN_MAX` |
| `js/skills.js` SK-28 | ——(校验面未落地) | `Domain.subtitleSegs` + `Domain.SUB_BURN_MAX` |

## 3. 校验项判据

`CHECKS['film.subtitleTiming'](obj, ctx)`,`obj` 收领域对象包 `{p, ep}`(集级),`ctx.online` 透给 `Domain` 的就绪判定;返回 `{pass, level, hits}`,`Skills.check` 再包一层 `{id, skill, …}`。阈值三条:阅读速度上限 9 字/秒、单条最短停留 1 秒、一屏可容纳 40 字;烧录硬上限不在本层再写一份,现取 `Domain.SUB_BURN_MAX`。

| 命中码 | 判据 | 级别 | 为什么是问题 |
|---|---|---|---|
| `caption-truncated` | 开着烧录字幕且单条字数 > `SUB_BURN_MAX` | `fail` | 合成时确定被截断,这段对白必丢字(唯一的确定性内容丢失) |
| `caption-too-long` | 未触发截断,但单条字数 > 一屏可容纳量 | `warn` | 一条字幕塞满画面,建议拆条 |
| `read-too-fast` | 字数 / 停留秒数 > 阅读速度上限(`hits.cps` 给实测值) | `warn` | 字幕跟不上;最常见成因是视频被裁短而台词没删 |
| `caption-flash` | 停留 < 最短可读时长 | `warn` | 字幕一闪而过 |
| `no-caption-track` | 开着烧录字幕,但全集在列段无一条文本 | `warn` | 成片不出字,对白/旁白多半漏填(整集级命中一次) |

- **烧录开关是判据的一部分**:关掉烧录时 SRT 仍保留全文,同一条长台词就只剩 `caption-too-long` 的提醒,级别从 `fail` 降 `warn`;没开烧录时"无字幕轨"也不是问题。
- **`fail` 只给确定性丢失**:截断是合成必然发生的裁剪,其余四类是可读性风险,一律 `warn`——与 SK-12/SK-13 的分级纪律一致。`pass = 命中为空`。
- **时间轴未成形不产出结论**:分集还没有任何视频/底图时 `composeSeqOf` 为空,回 `info` + 空命中,**不拿"通过"冒充"没判"**(镜级入口 `{p, s}`、无分集上下文同理)。
- 纯本地零 LLM 零计费、纯函数:同输入同结论,不改动传入的领域对象(单测逐条断言)。

### 与既有字幕机制的分工

| 机制 | 管什么 | 与本项的关系 |
|---|---|---|
| `Domain.composedDialogueSig` | 合成后改台词/时长 → 成片判旧 | 判**旧不旧**,不判**读不读得顺**;两者共用同一份 `composeSeqOf` 序列 |
| `SB.buildSrt` | 按时间轴产出 SRT 条目 | 产**物**;本项在产物之前用同一份切段判**质** |
| SK-29 交付契约门(未落地) | 发布门口径 | 本项不进门禁;方法论门挂成可选门是 SK-29(G-10 / S-07)的事 |

## 4. 单源与消费点

**就绪检查:两端各加一次 stage 分发**。SK-12/SK-13 同属 `subjects` 步,本轮是成片步第一条,故 `js/commands.js` 与 `cli.js` 的 `episode.preflight` 各补一次 `Skills.check('film', …)` 并 `concat`——命令仍是零计费 `read` 类,`ok/status` 仍只由 `Domain.episodeState` 决定:

```
episode.preflight → { ok, status, result: { …Domain.episodeState, checks: [ 完备性结论, 一致性结论, 字幕结论 ] } }
```

**问题中心:新增一条低危**。`js/issues.js` 在逐集循环末尾读同一份结论,聚合为 `{kind:'caption-unreadable', sev:'low', …}`,明细给"镜号(字数/秒数)+ 原因",处置走导航回分集页自己改台词或裁剪(不挂命令、不触发生成与合成)。展示文案(命中码→中文)落在 issues 层,判据不写第二份。

低危是刻意的:发布门 G2 只数高/中危(`js/release.js` 原样不动),**低危不改任何存量项目的门禁状态**,这条提醒才能在浏览器里可见而不越过"只报不拦"。

## 5. 记账:与前几轮文档的出入

1. **SK-28 的 `cmds` 从 `['episode.compose']` 扩为 `['episode.compose','episode.preflight']`**:条目 `pending` 清空后 `cmds` 记的是真实消费点,就绪检查是本轮实际接上的那个;`episode.compose` 保留——判定输入就是它构造的时间轴段。
2. **`gaps` 仍保留 `S-06`**:与 SK-12/SK-13 保留 `S-03` 同例,缺口编号记的是"这条能力对应哪个缺口",`Skills.gaps()['S-06']` 继续列出 SK-28。S-06 的"无结构化质检结论"这一面本轮闭合。
3. **本轮动了 `js/sb-io.js` / `cli.js` 的合成段与 `js/domain.js`**,与 SK-13 那轮"合成侧一行未动"的记账不同:切段口径不下沉就必然出现第二份判据,先补单源再落校验项。合成的**行为**未变——段时长与截断的数值口径逐字节等价(单测断言两个文件不再内联第二份口径)。

## 6. 本轮明确不做

- **不进 `blockers` / 发布门**:`overall` 不因字幕结论变化;`episode.compose` 也不因命中而拦截或改流程。
- **不改计费**:`episode.preflight` 仍是零计费 read 类;问题中心的字幕条目不挂命令处置,点它不会发起任何生成或合成。
- **不新增页面与实体**:没有新 UI 入口(复用问题中心既有弹窗与制作台单屏),没有新存储桶,没有新领域命令,SRT 产物格式未动。
- **不碰并行槽**:`js/wf-core.js` 的景别/运镜词表与只读核验件本轮一行未动。

## 7. 验收挂钩

| 层 | 断言 |
|---|---|
| `tests/unit.js` `skills` 套件(新增 7 条) | 干净夹具零命中且段起止=逐段累计时长;130 字台词 → `caption-truncated` fail 带 `chars/limit/shotId`,关掉烧录降为 `caption-too-long` warn;裁剪成 2 秒 → `read-too-fast` 带实测 15 字/秒且 `dur` 取裁剪出入点差;裁剪不足半秒 → `caption-flash:0.5`;开着烧录全集无对白 → `no-caption-track` 整集级一次,关掉烧录不报;纯函数 + 无在列素材段/无分集上下文回 `info` 空结论;切段口径单源(`sb-io.js`/`cli.js` 取 `segDurationOf` 与 `SUB_BURN_MAX`、不再内联第二份);消费点(两端 `Skills.check('film'`、问题中心低危、G2 只数高中危、preflight 仍 read 类、条目 `pending` 已清空) |
| `tests/unit.js` `issues` 套件(新增 1 条) | 超烧录上限的台词入清单为低危、明细带镜号与原因、走导航不挂命令、且该项目不产出任何高/中危(门禁状态不变) |
| `tests/cli.smoke.js`(新增 1 条) | CLI 真实服务端下 `exec episode.preflight` 的 `result.checks` 带 `film.subtitleQC` 结论;导入的两镜尚无素材 → 时间轴未成形,如实给 `info` 空结论 |
| `tests/unit.js` `contract` 套件(口径不变) | 原有双向对齐断言(登记必有实现、实现必被引用、每步结论数 = 该步已落地校验项数)在三条校验项下继续成立,未放宽 |

## 8. 后续入口(本轮不做)

- **合成前提示(可选)**:`episode.compose` 前把字幕结论作为 warn 提示,须先定性"提示要不要拦合成",本轮不动(保持只报不拦)。
- **配音时长对齐**:逐镜 TTS 音频的实际时长与段时长是否吻合,判定输入需要音频元信息(现无结构化产出)。
- **SK-29 交付契约门(G-10 / S-07)**:把方法论校验挂成可选门(默认 warn)时,本项结论是现成的输入;既有 fail/warn 口径不动。
