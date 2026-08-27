# W4 · 配音渲染清单落地(`s.audioMeta`)

> 输入件:`w1-relevance-rubric.md` 第 8.1 节判"纳入"的条目——**配音渲染清单:音色 id、语速/音量/情绪参数、是否离线回退,随音频一并落库,成为可追溯凭据**(计分 3/2/3/2−1=9,落点写的是"分镜音频字段扩展 + `Domain` 判旧口径联动");`w1-selected-skills.md` 的短名单口径。
> 基线:`master @ 9adcf0f`。判定时的现状核对与本轮开工时一致——`s.audio` 是布尔、真实音轨只有 `s.audioUrl`,参数只以文案形式进 `s.history`(`js/storyboard.js` 的 `'豆包语音·' + Voice.label(vc)`),`rg 'audioMeta|voiceId' js/` 零命中,**没有既有 audioMeta 读取链,本轮从零落地**。
> 落地文件:`js/domain.js`(双端单源)、`js/voice.js`(规范化下沉)、`js/storyboard.js` + `js/sb-gen.js` + `js/sb-batch.js`(生成路径写凭据)、`js/sb-io.js` + `cli.js`(成片路径读凭据)、`js/sb-views.js`(工作区可见)、`tests/unit.js`、`README.md`。

## 1. 一分钟结论

- 配音有了**结构化凭据** `s.audioMeta`:音色名 + 语速/音量/语调/情感 + **上游实际音色 id** + 时长 + 参数文本签名 `sig` + 是否离线占位。字段全部有真实来源(见第 3 节),没有一个是为了凑清单而填的缺省值。
- 凭据在**生成路径写、成片路径读**:逐镜配音 / 批量配音 / 跑批同步语音三个入口写回,合成 items 取音轨改走 `Domain.audioTrackOf`(离线占位不再靠"没有 URL"这一巧合躲开混音,而是被显式判定拦下),合成写回 `ep.composedAudio` 清单摘要——成片自带"这一版用了几镜真实音轨、几镜离线占位、几镜参数已变更"的凭据。
- **双端同一口径**:音色配置的优先级链此前在 `js/storyboard.js`(带镜头级 `voiceCfg`)与 `js/sb-batch.js`(漏了 `voiceCfg`)各写一份,批量配音的任务名/费用标签因此与实际送上游的参数不一致;现统一到 `Domain.voiceCfgOf`,`Voice.norm` 的缺省与钳制也下沉 `Domain.normVoiceCfg`,CLI 与浏览器读同一份。
- **计费收敛**:`genAudio` 原是手写"登记 → `U.charge` → 执行 → `U.refund`"五件套(判定标准第 4 章 T2 点名的反例),现改走 `Tasks.run`,失败退费与结果认领由任务层统一处理;计费动作仍是既有 `tts.gen`,未新增标签、未新增端点。
- **兼容旧数据**:`s.audio` 布尔 + `s.audioUrl` 的存量镜按已知事实读出并标 `legacy`(参数留空不臆造),无 `sig` 一律不判旧——存量项目不会因为新增判据一夜变红;合成行为对旧数据逐字节不变。
- 验收:`node tests/unit.js` **209/209 通过**(基线 201,新增 domain 套件 7 条 + contract 套件 1 条;未删测,既有断言未放宽,一条 CLI 同口径断言按新单源**加强**)。`node tests/cli.smoke.js` 51/53,两条失败(`未登录 whoami`、`llm --json mock`)在 `master` 基线同样失败,与本轮无关。

## 2. 判定标准的落点复核

| 标准项 | 本轮对应 |
|---|---|
| R2 落点(扩展既有结构) | 只在镜头对象上加一个字段 `s.audioMeta`,推导全部落 `js/domain.js`;无新模块、无新存储桶、无新页面 |
| C1 成本(不动生成指纹) | **`Domain.shotInputHash` / `composedInputHash` 一个字符没动**——判定标准写明改指纹至少扣 2 分,理由是存量项目的"素材过期"判定会一夜变化。配音判旧另立 `Domain.audioStale`,只影响提示文案,不参与视频/成片的就绪与过期判定 |
| T1/T2/T3/T9 计费 | 生成路径唯一付费动作是既有 `tts.gen`(服务端定死);客户端入口收敛到 `Tasks.run`;清单与判旧纯本地零上游 |
| V9 不静默降级 | 离线占位落 `offline: true` 且**不写** `url`,清单里如实计入 `offline`,合成前 toast 明说"不混入成片" |
| V10 不删测 | 只新增断言;唯一改写的断言是把"CLI 读 `s.audioUrl`"升级为"CLI 走 `Domain.audioTrackOf` + 保留 `audioUrl` 透传",判据更严 |
| U2–U6 双端 | 推导全在 `js/domain.js` UMD 内,零 `window` / `Store` / `fetch`;浏览器与 `cli.js` 同一份 require/挂载点,无新增加载点 |

## 3. 凭据字段与来源(不写来源不明的字段)

`Domain.audioMetaWrite(cfg, text, out)` 是唯一写点:

| 字段 | 来源 | 缺失时 |
|---|---|---|
| `voice` | `Domain.voiceCfgOf` 解出的生效音色名 | 必有(缺省音色) |
| `params.rate/volume/pitch/emotion` | 同上,声音设置面板的四个参数 | 必有(缺省值,与面板一致) |
| `voiceId` | **服务端 TTS 回执的 `voice`**(`/api/volc/tts` 返回实际 `speaker`),缺省回落本次送上游的 `Voice.volcOf(cfg.voice)` | 离线占位不写 |
| `url` | 服务端返回的音轨地址 | 离线占位不写 |
| `duration` | 服务端返回的音频时长(`> 0` 才写) | 上游未给则不写 |
| `sig` | `Domain.audioSig(cfg, text)`:五个参数 + 配音文本 | 必有 |
| `offline` | 是否离线占位路径 | 必有(布尔) |
| `time` | 写回时刻 | 调用方不传则不写 |

读侧 `Domain.audioMetaOf(s)` 三态:结构化凭据原样返回 / 旧布尔数据补最小结构并标 `legacy`(`offline` 由有无 `audioUrl` 反推,`params` 为 `null`)/ 从未配音返回 `null`。

## 4. 写点与读点

**生成路径(写)**

| 入口 | 位置 | 行为 |
|---|---|---|
| 逐镜「🔊 生成音频」 | `js/storyboard.js` `genAudio` → `ttsShot` | `Tasks.run` 计费;真实回执写凭据;离线走 `markOfflineAudio` |
| 批量配音 | `js/sb-batch.js` `runBatchOp('audio')` | 在线逐镜 `Tasks.runBatch` + `ttsShot`;离线 `markOfflineAudio`;任务名/费用标签的音色取 `Domain.voiceCfgOf`(修好漏读镜头级 `voiceCfg`) |
| 生成视频后同步语音 | `js/sb-gen.js` `syncVoiceShot` / `batchGenVideos` 离线分支 | 同上,离线分支不再只 `s.audio = true` 加一条历史 |

**成片路径(读)**

| 位置 | 改造前 | 改造后 |
|---|---|---|
| `js/sb-io.js` `doCompose` items | `if (s.audioUrl) it.audio = s.audioUrl` | `Domain.audioTrackOf(s)`——离线占位显式不混音 |
| `cli.js` `composeItems` | 同上,第二份 | 同一函数 |
| `js/sb-io.js` 合成前 | ——(无提示) | 离线占位 / 判旧镜数如实 toast |
| `js/sb-io.js` + `cli.js` 合成写回 | ——(无凭据) | `ep.composedAudio = Domain.audioRenderList(...).summary`,两端同字段 |
| `js/sb-views.js` 镜头右栏 | 只有"同步语音 已开启" | 多两行:已配音参数(旧数据标"参数未落库")+ 配音状态(可混入 / 离线占位 / 建议重配音) |
| `cli.js shots <pid> <epid>` | 只回 shots 数组 | 多一个 `audio` 字段:逐镜清单 + summary |

`Domain.audioRenderList(p, ep, online)` 的逐镜行含 `voice/voiceId/params/url/duration`(渲染时的事实)、`cfgNow`(当前生效配置,重配音将用的参数)、`stale/offline/legacy/hasText`、`inFilm`(是否在 canonical 合成序列内)、`mixed`(真进成片音轨)。`mixed` 与 `inFilm` 分开是因为无视频也无底图的镜根本不在成片里,它的音轨再真实也没混进去——清单不能把它算成"已配上"。

## 5. 判旧的边界

`Domain.audioStale` 只比对 `audioMeta.sig`:换音色 / 改语速音量语调情感 / 改旁白台词都判旧,**无 `sig` 记录一律不判**。它的作用面被刻意限制:

| 机制 | 是否受本轮影响 |
|---|---|
| `Domain.shotInputHash`(镜头素材过期) | 不受影响,输入集合未改 |
| `Domain.composedInputHash`(成片过期) | 不受影响,仍读 `s.audioUrl`——换音轨照旧判成片过期 |
| `Domain.episodeState.blockers` / 工作流状态 | 不受影响,配音判旧不进阻塞项 |
| 发布门 `js/release.js` | 不受影响,未新增门禁 |
| 工作区提示、合成前 toast、清单 summary | 受影响(只报不拦) |

换句话说:配音判旧目前只是**告知**。要不要升级为可选门,是另一条独立判定的事。

## 6. 遗留与后续

- 旧数据的参数无法追溯补齐(当时只落了历史文案),`legacy` 行只能显示"参数未落库";重配音一次即转为完整凭据。
- CLI 侧无逐镜配音命令(计费入口在浏览器 `Tasks.run`),CLI 目前是**读清单 + 合成时消费凭据**;若后续要在 CLI 生成配音,需先把付费入口在服务端一侧对齐,不在本轮范围。
- 判定标准 8.1 与本条同源的另一半(字幕时间戳只能来自真实音频)是独立条目,由字幕面负责,本轮不涉。
