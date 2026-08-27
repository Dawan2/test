# 飞书文档 A 提炼:《我扒完了 GitHub 上 55 个 AI 成片产线，得出一个结论》

- **来源**:https://waytoagi.feishu.cn/wiki/ZEonw9QWdidPU4kcnP1cH1XpnTB
- **原文性质**:waytoagi 知识库转载,原始出处 https://x.com/servasyy_ai/status/2092059961656537546(huangserva · @servasyy_ai · 2026-08-25 09:22),文档 Modified August 25
- **原文口径**:"让 agent 当导演的成片流水线(剧本→分镜→调模型→合成)",且**最近一个月还在更新**的 GitHub 仓库
- **提炼时间**:2026-08-27
- **本文用途**:只做资料提炼与阶段映射(把原文每个条目落到 剧本→主体→分集→分镜→生成→审片→成片 主线的哪一段),**不含任何采纳建议**,也不对本平台功能作任何来源性描述。

---

## 一、抓取过程与可信度说明(含阻塞)

### 登录阻塞

**结论:该文档无登录阻塞,全文已完整拿到。**

- 直接 `curl` 该 URL 会拿到飞书 passport(登录)壳页,正文为 0 字节 —— 这是**渲染阻塞,不是权限阻塞**。
- 文档本身是公开分享的 wiki 页,渲染后可匿名读全文;正文由前端虚拟滚动惰性渲染,所以:
  - `WebFetch` / jina reader 类文本抽取服务只能拿到**首屏 + 少量后续块**(两次抓取均在"二、一站式成片平台"的 `huobao-drama` 一行处截断);
  - 最终用**本机无头 Chrome + CDP**(仓库 `tests/e2e.js` 同套办法)加载页面,按目录锚点逐节跳转 + 派发真实 `mouseWheel` 事件推进虚拟列表,累积 `innerText` 与全部 `<a>` href,才拿到全文 **109 行正文 + 77 条链接**。
- **未阻塞项**:正文、七节标题、附录 55 项清单(含全部 GitHub 链接)、配套底座、"没赶上窗口"名单、X 热度数据、作者三条判断 —— 均已取到。
- **唯一缺失**:正文中的 5 处配图(截图)只有占位,图内文字无法读取;不影响条目清单的完整性。

### 原文数据自身的一处不一致(如实记录)

标题与导语称 **55 个仓库**,但附录清单实际枚举 **28(视频 skill)+ 27(一站式平台)+ 3(分镜/导演画布)= 58 项**;另有正文单列的 **配套底座 7 项** 与 **没赶上更新窗口 7 条**(其中一条含 story-flicks / ShortGPT 两个名字)。
本文按**附录实际枚举**逐条落表,总计 **58 项主清单 + 7 项配套底座 + 7 条落榜条目 = 72 条**。原文的 "55" 与 "28/55" 比例说法据此存在轻微出入。

### 字段可信度约定(重要)

原文对每个仓库只给**一行描述**(名称｜星数｜最近更新日期｜一句话)。因此下表:

- **用途**:原文措辞,基本为原样转述。
- **输入 → 输出**:凡原文一句话里明示了链路(如"题目→4K 解说片""SRT→白板手绘动画")即直接采用;原文未明示的,本文按该行描述做**最小推断**并标 `(推)`。**标 `(推)` 的 I/O 未经仓库 README 或代码核实**,只能当线索,不能当事实引用。
- **适用阶段**:映射到本平台主线阶段名 —— `剧本` / `主体` / `分集` / `分镜` / `生成` / `审片` / `成片`;`全链` 表示原文称其覆盖端到端;`链外` 表示落在主线之外(口播、带货、解说、白板动画等非漫剧形态)。
- **漫剧相关性**:`相关` = 直接作用于主线某一段或多段;`部分相关` = 形态不同但其中某一环(提示词结构化、一致性、时间轴、审查等)对应主线某阶段;`不相关` = 形态与主线无交集。判定依据仅为原文一句话描述。

---

## 二、第一类:装给 Claude Code / Codex 的视频 skill(原文 28 个)

原文对这一类的定性:"不做 app,直接把成片能力打包成 skill 装进 coding agent。"

| # | 名称 | ⭐ / 最近更新 | 用途(原文) | 输入 → 输出 | 适用阶段 | 漫剧相关性 |
|---|---|---|---|---|---|---|
| 1 | [video-shotcraft](https://github.com/Vincentwei1021/video-shotcraft) | 6.2k / 08-22 | 电影感产品片 skill,152 张镜头卡 + 209 个动效样片(X 上 17.7 万浏览) | 产品/创意描述 + 镜头卡与动效样片库 → 镜头方案与动效指令 `(推)` | 分镜、生成 | 部分相关(产品片形态,但"镜头卡 + 动效样片"是分镜镜头语言与运动描述的成套资产) |
| 2 | [Generative-Media-Skills](https://github.com/SamurAIGPT/Generative-Media-Skills) | 4.1k / 08-20 | 图 / 视频 / 音频生成 skill 合集 | 文本或图提示 → 图 / 视频 / 音频产物 `(推)` | 生成 | 相关(生成段的多模态调用集合) |
| 3 | [chengfeng-videocut-skills](https://github.com/Agentchengfeng/chengfeng-videocut-skills) | 2.9k / 08-21 | 用 Claude Code Skills 做的剪辑 agent | 素材 + 剪辑意图 → 剪辑结果 `(推)` | 成片 | 部分相关(成片段的剪辑编排) |
| 4 | [srt-whiteboard-animation](https://github.com/geeklee/srt-whiteboard-animation) | 2.2k / 07-27 | SRT→白板手绘动画 | SRT 字幕文件 → 白板手绘动画视频 | 链外 | 不相关(白板动画形态) |
| 5 | [claude-code-video-toolkit](https://github.com/digitalsamba/claude-code-video-toolkit) | 2.0k / 08-13 | Claude Code 视频生产工具箱 | 视频生产指令 → 各类视频处理产物 `(推)` | 生成、成片 | 部分相关(工具箱型,覆盖面取决于内含工具) |
| 6 | [shuohao-skills](https://github.com/eternityspring/shuohao-skills) | 2.0k / 08-22 | 短剧 skill 集:拆角色 / 大纲 / 场景道具 / 剧本 / 分镜 | 题材或故事设定 → 角色表、大纲、场景道具表、剧本、分镜 | 剧本、主体、分集、分镜 | **相关**(阶段切分与本平台主线前四段几乎逐段对位:角色/场景道具≈主体,大纲≈分集,剧本、分镜同名) |
| 7 | [video-podcast-maker](https://github.com/Agents365-ai/video-podcast-maker) | 1.6k / 08-01 | 题目→4K 解说片,专门给 coding agent 用 | 一个题目 → 4K 解说视频 | 链外 | 不相关(解说片形态) |
| 8 | [drama-skills](https://github.com/worldwonderer/drama-skills) | 1.0k / 08-23 | 短剧 / 漫剧全链路 skill,**带独立审查环节** | 故事设定 → 全链路产物直至成片 `(推)` | 全链(含审片) | **相关**(原文 28 个 skill 中唯一同时点明"漫剧""全链路""独立审查"三项,审查环节对位主线的审片段) |
| 9 | [lanshu-create-ai-presenter-video](https://github.com/cclank/lanshu-create-ai-presenter-video) | 723 / 08-20 | 人像 + 讲稿→口播片 | 人像图 + 讲稿文本 → 口播视频 | 链外 | 不相关(数字人口播形态) |
| 10 | [make-prompt-seedance2](https://github.com/liangdabiao/make-prompt-seedance2) | 634 / 08-16 | Seedance2 结构化提示词 | 画面意图 → Seedance 2 结构化提示词 `(推)` | 生成 | 相关(视频生成提示词结构化,对位分镜提示词生成) |
| 11 | [buttercut](https://github.com/barefootford/buttercut) | 589 / 08-15 | 用 Claude Code 剪视频 | 素材 + 剪辑指令 → 剪辑结果 `(推)` | 成片 | 部分相关 |
| 12 | [Orkas-VideoStudio](https://github.com/Orkas-AI/Orkas-VideoStudio) | 523 / 08-12 | agent 写时间轴出片 | 内容意图 → 时间轴 → 成片 `(推)` | 成片 | 部分相关(时间轴由 agent 生成,对位成片段的合成序列) |
| 13 | [chatgpt-video-editing-skills](https://github.com/Jaycheng1103/chatgpt-video-editing-skills) | 496 / 07-26 | 八步剪辑 skill | 素材 → 按八步流程完成的剪辑 `(推)` | 成片 | 部分相关(把剪辑固化成固定步骤链) |
| 14 | [video-recap-skills](https://github.com/worldwonderer/video-recap-skills) | 470 / 08-24 | 任意视频→中文解说,可出剪映草稿 | 任意视频 → 中文解说稿 + 剪映草稿 | 链外(拉片方向) | 部分相关(视频→结构化文字的反向链路,对位"拉片/看片得到时间轴文字") |
| 15 | [Nomi](https://github.com/aqm857886159/Nomi) | 433 / 08-24 | AI 视频工作台,本地 ComfyUI + MCP | 生成任务 → 本地 ComfyUI 出片 `(推)` | 生成 | 部分相关(本地生成后端接入方式) |
| 16 | [higgsfield-ai-prompt-skill](https://github.com/OSideMedia/higgsfield-ai-prompt-skill) | 391 / 08-23 | 32 子技能电影提示词 | 画面意图 → 电影感提示词(32 个子技能分工) `(推)` | 分镜、生成 | 相关(提示词按 32 个子技能拆分,是提示词体系的组织方式) |
| 17 | [ai-shortfilm-prompts](https://github.com/jnMetaCode/ai-shortfilm-prompts) | 372 / 08-18 | 想法→Sora / Kling / Veo / Seedance 提示词 | 一个想法 → 分供应商的提示词 | 生成 | 相关(同一意图对多家视频模型出不同提示词) |
| 18 | [ai-video-generator-claude](https://github.com/rediumvex/ai-video-generator-claude) | 340 / 08-11 | 10 个 Claude skill 出 Seedance 提示词 | 创作意图 → Seedance 提示词 `(推)` | 生成 | 相关 |
| 19 | [seedance-prompt](https://github.com/zhouwei713/seedance-prompt) | 311 / 08-04 | Hermes skill,写实向提示词 | 画面意图 → 写实向 Seedance 提示词 `(推)` | 生成 | 部分相关(写实向,漫剧画风不同,提示词组织方式可参照) |
| 20 | [h3lite](https://github.com/Rimagination/h3lite) | 309 / 08-23 | 本地 MiniMax-H3 出片的 Codex skill,**硬件感知 + ComfyUI**;原文特意标为重点 | 生成任务 + 本机硬件条件 → 本地出片 `(推)` | 生成 | 部分相关(纯本地生成路线;"硬件感知"= 按显存/算力自动选参) |
| 21 | [hbg-classical-poem-silk-video](https://github.com/Mr-funny/hbg-classical-poem-silk-video) | 284 / 08-03 | 古诗词→国风竖屏视频 | 古诗词文本 → 国风竖屏视频 | 链外 | 不相关(题材专用) |
| 22 | [claude-youtube-editor](https://github.com/hassancs91/claude-youtube-editor) | 278 / 08-18 | 口播后 Claude 包办剪辑 / 视觉 / 缩略图 | 口播录制 → 剪辑 + 视觉 + 缩略图 | 链外 | 不相关(YouTube 口播形态) |
| 23 | [super-video-maker-skill](https://github.com/Bomx/super-video-maker-skill) | 233 / 08-09 | HeyGen 数字人 + Seedance B-roll + Remotion + HyperFrames;原文特意标为重点 | 选题/文案 → 数字人主轴 + B-roll + 程序化合成成片 `(推)` | 生成、成片 | 部分相关(数字人形态不对位,但"主轴 + B-roll + 程序化合成"的分层出片结构对位成片段) |
| 24 | [ai-media-generator](https://github.com/Hao0321/ai-media-generator) | 224 / 08-09 | "零技能电影",导演级 prompt 自动化 | 简单意图 → 导演级提示词 → 成片 `(推)` | 分镜、生成 | 相关(把导演级描述自动化,对位分镜提示词自动补全) |
| 25 | [cs-board](https://github.com/ChenShuo2004/cs-board) | 204 / 08-24 | 参考声音 + 文案→白板动画 | 参考音色 + 文案 → 带配音的白板动画 | 链外 | 不相关(白板动画形态) |
| 26 | [cut-director](https://github.com/Fangx-AI/cut-director) | 173 / 07-28 | 口播稿→动效 / 生成视觉 / 构图 | 口播稿 → 动效 + 生成的视觉 + 构图方案 | 链外(构图部分相关) | 部分相关(构图与视觉生成决策) |
| 27 | [oh-my-cassette](https://github.com/Cassette-Editor/oh-my-cassette) | 139 / 08-22 | AI 剪辑搭档 plugin + MCP | 剪辑意图 → 剪辑操作(经 MCP 驱动编辑器) `(推)` | 成片 | 部分相关(MCP 作为剪辑接入面) |
| 28 | [erduo-broll-loop-engineering](https://github.com/erduo1998-cell/erduo-broll-loop-engineering) | 124 / 08-18 | SRT 驱动 B-roll,自动路由 | SRT 字幕 → 按语义自动路由的 B-roll 素材序列 | 链外 | 部分相关("按文本自动路由到素材"的机制,对位分镜→素材匹配) |

**本类小结(阶段分布)**:28 项里以 `生成`(提示词工程为主,9 项)与 `成片`(剪辑/时间轴,7 项)最密集;`剧本 / 主体 / 分集` 三段只有 `shuohao-skills` 与 `drama-skills` 两项覆盖;`审片` 段只有 `drama-skills` 一项点明("独立审查环节")。原文本类中明确提到"漫剧"字样的只有 `drama-skills`。

---

## 三、第二类:一站式成片平台(原文 27 个,短剧扎堆)

原文定性:"产线 app 化的一类,星数量级断层式领先,而且短剧密度极高。"并点出信号:"大厂已经下场(阿里 lumenx、小红书 FireRed-OpenStoryline),学界也下场了(港大 ViMax)。"

| # | 名称 | ⭐ / 最近更新 | 用途(原文) | 输入 → 输出 | 适用阶段 | 漫剧相关性 |
|---|---|---|---|---|---|---|
| 1 | [MoneyPrinterTurbo](https://github.com/harry0703/MoneyPrinterTurbo) | 115.6k / 08-24 | 关键词→短视频的鼻祖;原文注明是**素材库型而非生成模型型** | 关键词 / 主题 → 脚本 + 匹配素材 + 字幕 + BGM → 短视频 | 剧本(脚本)、成片 | 部分相关(素材库检索路线,与漫剧的逐镜生成路线不同链路) |
| 2 | [OpenMontage](https://github.com/calesthio/OpenMontage) | 49.9k / 08-22 | 12 条产线、100+ 工具、**700+ agent skill** | 创作意图 → 按产线编排的端到端出片 `(推)` | 全链 | 相关(把整条产线拆成可被 agent 挑用的 skill,是原文"产线做成 skill"论点的最大样本) |
| 3 | [Toonflow](https://github.com/HBAI-Ltd/Toonflow-app) | 14.4k / 08-23 | 小说→动画短剧,**无限画布 + 三层 agent** | 小说文本 → 动画短剧 | 全链 | **相关**(小说→动画短剧,与漫剧形态最接近的一类;三层 agent 是编排分层) |
| 4 | [huobao-drama](https://github.com/chatfire-AI/huobao-drama) | 14.1k / 08-18 | 火宝短剧,一句话→成片 | 一句话 → 成片 | 全链 | **相关**(短剧全链,"一句话→成片"原文称为平台型标配叙事) |
| 5 | [ViMax](https://github.com/HKUDS/ViMax) | 12.1k / 07-29 | 港大出品,**导演 + 编剧 + 制片一体**的 agentic 视频生成 | 创作意图 → 编剧/导演/制片多角色协作产出视频 `(推)` | 全链 | 相关(按职能划分 agent 角色,对位主线各阶段的责任划分) |
| 6 | [seedance-2.0](https://github.com/Emily2040/seedance-2.0) | 6.9k / 08-06 | Seedance 2.0 **四模态**电影制作产线 | 创作意图 → 四模态(文/图/视/音)协同的成片 `(推)` | 生成、成片 | 部分相关(围绕单一模型族的产线组织) |
| 7 | [Jellyfish](https://github.com/Forget-C/Jellyfish) | 6.2k / 07-30 | 剧本→**结构化分镜**→**跨镜头一致性**→成片 | 剧本 → 结构化分镜 → 成片 | 剧本、分镜、生成、成片 | **相关**(链路与主线中段逐段对位;"结构化分镜 + 跨镜头一致性"正是分镜→生成段的核心约束) |
| 8 | [short-video-factory](https://github.com/YILS-LIN/short-video-factory) | 5.2k / 08-20 | 营销短视频批量产,桌面端 | 营销素材/文案 → 批量短视频 `(推)` | 链外 | 不相关(营销短视频批产) |
| 9 | [ArcReel](https://github.com/ArcReel/ArcReel) | 4.1k / 08-24 | 小说→**角色 / 场景 / 道具 / 分镜 / 视频 / 剪映草稿**,多供应商 + **费用追踪** | 小说 → 角色表、场景、道具、分镜、视频、剪映草稿 | 剧本、主体、分镜、生成、成片 | **相关**(角色/场景/道具 = 主线"主体"段的三类;多供应商 + 费用追踪对位生成段的模型路由与计费口径) |
| 10 | [dramaclaw](https://github.com/dramaclaw/dramaclaw) | 4.1k / 08-24 | 通用 AIGC 引擎 | 通用生成任务 → 多类 AIGC 产物 `(推)` | 生成 | 部分相关(通用引擎,原文未给具体链路) |
| 11 | [printfilm](https://github.com/yuanzhongqiao/printfilm) | 3.9k / 08-11 | **动态漫 / 短剧工业工作台** | 剧本/设定 → 动态漫或短剧成片 `(推)` | 全链 | **相关**(动态漫即漫剧同形态;"工业工作台"定位对位多人协作产线) |
| 12 | [FireRed-OpenStoryline](https://github.com/FireRedTeam/FireRed-OpenStoryline) | 3.3k / 07-31 | 小红书:**意图驱动**剪辑 agent | 剪辑意图 + 素材 → 剪辑结果 `(推)` | 成片 | 部分相关(意图驱动的剪辑决策) |
| 13 | [BigBanana-AI-Director](https://github.com/shuyu-labs/BigBanana-AI-Director) | 1.8k / 08-13 | **Script→Asset→Keyframe**,反"抽卡式" | 剧本 → 资产 → 关键帧 → 视频 `(推)` | 剧本、主体、分镜、生成 | **相关**(三段式链路与"剧本→主体→分镜→生成"对位;"反抽卡"= 不靠反复重抽碰运气,靠前置资产与关键帧锁定) |
| 14 | [MeiGen-AI-Design-MCP](https://github.com/jau123/MeiGen-AI-Design-MCP) | 1.7k / 08-05 | **1400+ 提示词库** + 多任务编排 | 设计/生成需求 → 从提示词库选配 + 多任务并行执行 `(推)` | 生成 | 相关(提示词库规模化 + 批量任务编排,对位批量生成段) |
| 15 | [LingGuo-Drama](https://github.com/LingGuoAI/LingGuo-Drama) | 1.4k / 08-21 | 灵果短剧 / 漫剧 | 剧本/设定 → 短剧或漫剧成片 `(推)` | 全链 | **相关**(直接点名漫剧) |
| 16 | [ai_story](https://github.com/xhongc/ai_story) | 1.4k / 08-06 | AI 短剧 / 漫剧自动化 | 故事 → 短剧/漫剧成片 `(推)` | 全链 | **相关**(直接点名漫剧) |
| 17 | [LocalMiniDrama](https://github.com/xuanyustudio/LocalMiniDrama) | 1.4k / 08-13 | 本地短剧工作流,**数据不出本机** | 剧本 → 本地全流程出片 `(推)` | 全链 | 相关(短剧全链;本地化是部署形态差异) |
| 18 | [ai-fusion-video](https://github.com/Stonewuu/ai-fusion-video) | 1.3k / 08-18 | 融光,**Java + agentscope** 全流程 | 创作输入 → 全流程出片 `(推)` | 全链 | 部分相关(技术栈差异大,链路组织可参照) |
| 19 | [lumenx](https://github.com/alibaba/lumenx) | 1.1k / 08-11 | 阿里出品,**小说→短漫剧全链路** | 小说 → 短漫剧 | 全链 | **相关**(原文中唯一大厂出品的漫剧全链路项目) |
| 20 | [yumcut](https://github.com/IgorShadurin/app.yumcut.com) | 857 / 08-22 | prompt→竖屏成片 | 提示词 → 竖屏视频 | 生成、成片 | 部分相关(竖屏比例与短剧一致) |
| 21 | [TypeTale](https://github.com/TypeTale/TypeTale) | 791 / 08-21 | 字字动画 | 文本 → 逐字动画视频 `(推)` | 链外 | 不相关(文字动效形态) |
| 22 | [Open-Magiviz](https://github.com/ItusiAI/Open-Magiviz) | 548 / 08-19 | **剧本→分镜→成片**,内置 12 模型 | 剧本 → 分镜 → 成片 | 剧本、分镜、生成、成片 | **相关**(链路与主线中后段对位;内置多模型对位模型选择) |
| 23 | [Open-AI-Micro-Drama-Generator](https://github.com/Anil-matcha/Open-AI-Micro-Drama-Generator) | 467 / 08-02 | **多 agent** 微短剧 | 题材 → 多 agent 协作产出微短剧 `(推)` | 全链 | 相关(微短剧全链,多 agent 编排) |
| 24 | [Maestro](https://github.com/Blizaine/Maestro) | 413 / 08-19 | 全本地**导演模式** | 创作意图 → 本地导演式编排出片 `(推)` | 全链 | 部分相关(本地化导演编排) |
| 25 | [splicr](https://github.com/Agions/splicr) | 413 / 08-24 | **7 步**全自动影视解说 | 影视素材 → 按 7 步流程产出解说片 | 链外 | 不相关(解说片形态;流程固化为 7 步这一点可对位流程条) |
| 26 | [daihuo-jianshou](https://github.com/witty-suckerpunch492/daihuo-jianshou) | 236 / 08-22 | 商品图→带货短视频 | 商品图 → 带货短视频 | 链外 | 不相关(电商带货形态) |
| 27 | [Crayotter](https://github.com/idwts/Crayotter) | 197 / 08-19 | 多模态剪辑 / 合成 / 生产 agent | 多模态素材 → 剪辑与合成产物 `(推)` | 成片 | 部分相关 |

**本类小结**:27 项里 **12 项属短剧 / 漫剧 / 动态漫形态**(Toonflow、huobao-drama、Jellyfish、ArcReel、printfilm、LingGuo-Drama、ai_story、LocalMiniDrama、lumenx、Open-Magiviz、Open-AI-Micro-Drama-Generator,加 BigBanana-AI-Director 的剧本→资产→关键帧链路),其中 **5 项直接点名"漫剧 / 动态漫 / 短漫剧"**(Toonflow 动画短剧、printfilm 动态漫、LingGuo-Drama、ai_story、lumenx 短漫剧)。原文本类中**没有任何一项被点明含审片 / 质量评审环节** —— 全 27 项的一句话描述里都没有"审查""评审""质检"字样,`审片` 段在这一类是空白。

---

## 四、第三类:分镜 / 导演画布(原文 3 个)

原文定性:"数量最少、但可能最接近'导演工作台'形态的一类。"

| # | 名称 | ⭐ / 最近更新 | 用途(原文) | 输入 → 输出 | 适用阶段 | 漫剧相关性 |
|---|---|---|---|---|---|---|
| 1 | [open-ai-canvas](https://github.com/ddcat-ai/open-ai-canvas) | 653 / 08-24 | AI 影视**无限画布**,分镜编排 + 素材 + agent 工作流 | 分镜与素材节点 → 编排后的工作流产物 `(推)` | 分镜、生成 | 相关(分镜编排 + 素材管理 + 工作流三合一的交互形态) |
| 2 | [open-storyboard-canvas](https://github.com/ganbo-gab/open-storyboard-canvas) | 299 / 08-15 | 导演台画布,**摄像机控制 + 提示词预设 + 自定义供应商** | 镜头参数 + 提示词预设 → 生成请求 `(推)` | 分镜、生成 | 相关(摄像机控制对位镜头运动字段,提示词预设对位提示词模板,自定义供应商对位模型配置) |
| 3 | [aimangastudio](https://github.com/morsoli/aimangastudio) | 1.4k / 08-23 | 原文称"**漫剧邻线**",剧本 / 分镜 / 角色风格 | 剧本 → 分镜 + 角色风格设定 `(推)` | 剧本、主体、分镜 | **相关**(原文明确归为漫剧邻线;角色风格对位主体段的画风一致) |

---

## 五、配套底座(原文单列,7 项,不计入 55/58 主清单)

原文:"三类之外还有一层配套底座。"这一层不直接出片,而是被上面三类调用。

| # | 名称 | ⭐ | 用途(原文) | 输入 → 输出 | 适用阶段 | 漫剧相关性 |
|---|---|---|---|---|---|---|
| 1 | [comfyui-mcp](https://github.com/artokun/comfyui-mcp) | 663 | agent 原生 ComfyUI 控制面 | agent 指令 → ComfyUI 工作流执行 `(推)` | 生成 | 部分相关(自建生成后端的接入方式) |
| 2 | [ima2-gen](https://github.com/lidge-jun/ima2-gen) | 713 | 本地**可复现**生成 runtime | 生成参数 → 可复现的图/视频产物 `(推)` | 生成 | 相关("可复现"对位生成指纹 / 参数留痕这一类需求) |
| 3 | [vargHQ/sdk](https://github.com/vargHQ/sdk) | 334 | "JSX 写视频"多供应商 SDK | 代码(JSX)描述的视频结构 → 成片 `(推)` | 成片 | 部分相关(以代码描述时间轴与合成) |
| 4 | [watch-skill](https://github.com/oxbshw/watch-skill) | 310 | **agent 看片自检** | 生成的视频 → 自检结论 `(推)` | **审片** | **相关**(原文全部 72 条里,专职做"出片后自检"的仅此一条 + drama-skills 的独立审查环节) |
| 5 | [claude-video-vision](https://github.com/jordanrendric/claude-video-vision) | 1.3k | 让 Claude 看懂视频 | 视频 → 视觉理解结论 `(推)` | 审片、拉片 | 相关(视觉模型读画面,是审片段的底层能力) |
| 6 | [locally-uncensored](https://github.com/PurpleDoubleD/locally-uncensored) | 1.1k | 本地无审查图 / 视频工作室 | 提示词 → 本地生成产物 `(推)` | 生成 | 不相关(合规取向与本平台的合规命中要求相反) |
| 7 | [hyperframes](https://github.com/heygen-com/hyperframes) | 42.4k | HeyGen 开源的**视频合成引擎**;X 上开源消息 15.8 万浏览 | 结构化合成描述 → 成片 `(推)` | 成片 | 相关(成片段的合成引擎,星数量级为底座层最高) |

---

## 六、原文提到但"没赶上更新窗口"的条目(7 条)

原文口径要求"最近一个月还在更新",这批因停更而未计入 55/58。原文对这一批的判断是:"它们停了,但需求没消失 —— 这正是窗口。"

| # | 名称 | ⭐ / 停更 | 用途(原文) | 适用阶段 | 漫剧相关性 |
|---|---|---|---|---|---|
| 1 | [browser-use/video-use](https://github.com/browser-use/video-use) | 21.3k / 07-01 停 | 原文只给热度(X 上 11.5 万浏览),未给功能描述 | 未知 | 未知(原文信息不足) |
| 2 | NarratoAI | 10.8k / 07-23("差一天") | 原文未给功能描述 | 未知 | 未知 |
| 3 | songguoxs/seedance-prompt-skill | 2.7k / 2 月停 | Seedance 提示词 skill `(推,依名称)` | 生成 | 部分相关 |
| 4 | narrator-ai-cli-skill | 2.3k / 07-05 | 解说类 CLI skill `(推,依名称)` | 链外 | 不相关 |
| 5 | [Pluviobyte/video-production-skills](https://github.com/Pluviobyte/video-production-skills) | 621 / 07-14 | 原文列为「创作 / 复刻 / 动效 / 开场 / QA」的完整 skill 库 | 分镜、生成、审片(QA) | 相关(五类分工里含 QA 环节,是原文少数点明质量检查的 skill 库) |
| 6 | 宝玉的 Video-Wrapper-Skills | 331 / 2 月 | 原文未给功能描述 | 未知 | 未知 |
| 7 | story-flicks / ShortGPT | — / 去年就停了 | 原文未给功能描述(两个名字合列一条) | 未知 | 未知 |

---

## 七、按主线阶段汇总:原文 72 条覆盖在哪些段

| 主线阶段 | 原文明确覆盖该段的条目(节选) | 覆盖密度 |
|---|---|---|
| 剧本 | shuohao-skills、drama-skills、Jellyfish、ArcReel、BigBanana-AI-Director、Open-Magiviz、aimangastudio、MoneyPrinterTurbo(脚本) | 中 |
| 主体(角色 / 场景 / 道具) | shuohao-skills(角色 / 场景道具)、ArcReel(角色 / 场景 / 道具)、BigBanana-AI-Director(Asset)、aimangastudio(角色风格) | **低** |
| 分集 | shuohao-skills(大纲)——原文 72 条中仅此一条与"分集 / 大纲切分"直接对应 | **极低** |
| 分镜 | shuohao-skills、drama-skills、Jellyfish(结构化分镜)、ArcReel、Open-Magiviz、video-shotcraft(镜头卡)、higgsfield-ai-prompt-skill、ai-media-generator、open-ai-canvas、open-storyboard-canvas、aimangastudio | **高** |
| 生成 | 提示词类 9 项(make-prompt-seedance2、ai-shortfilm-prompts、ai-video-generator-claude、seedance-prompt、higgsfield-ai-prompt-skill 等)+ 生成后端类(h3lite、Nomi、comfyui-mcp、ima2-gen、Generative-Media-Skills、MeiGen-AI-Design-MCP、seedance-2.0) | **最高** |
| 审片 | 仅 4 条:drama-skills(独立审查环节)、watch-skill(agent 看片自检)、claude-video-vision(视觉理解底座)、Pluviobyte/video-production-skills(QA,已停更) | **最低** |
| 成片(合成 / 剪辑 / 导出) | 剪辑类 7 项(chengfeng-videocut-skills、buttercut、chatgpt-video-editing-skills、oh-my-cassette、Crayotter、FireRed-OpenStoryline、Orkas-VideoStudio)+ 合成引擎(hyperframes、vargHQ/sdk)+ 出剪映草稿(ArcReel、video-recap-skills) | 高 |
| 链外形态(不落主线) | 口播 / 数字人(lanshu、claude-youtube-editor、super-video-maker-skill)、白板动画(srt-whiteboard-animation、cs-board)、解说(video-podcast-maker、splicr、video-recap-skills)、带货(daihuo-jianshou)、营销批产(short-video-factory)、文字动效(TypeTale)、题材专用(hbg-classical-poem-silk-video) | 12 条 |

**读数**:原文这批项目的重心压在 `分镜` 与 `生成` 两段;`主体`(角色/场景/道具资产化)、`分集`(整本→分集切分)、`审片`(出片后质量评审)三段在 72 条里几乎没有专门做法 —— 尤其 `审片`,72 条里只有 4 条提到,其中 1 条已停更。

---

## 八、原文自身的结论(原样摘录,便于后续判断口径来源)

1. 开篇论断:"这个赛道真正的战场,早就不在'画布'或'剪辑器',而在'让 agent 当导演'的成片产线本身。而且下一轮竞争大概率不是比谁的模型强,而是比谁能把产线做成 agent 随手可用的 skill。"
2. 三条判断(原文"最后"一节):
   - **skill 化是最活跃的增量**:28/55 都是"装进 coding agent 的 skill",而不是独立 app;
   - **短剧是最卷的场景**:平台型里过半在做短剧 / 漫剧,"一句话→成片"是标配叙事;
   - **产线 > 模型**:几乎没有项目在卷模型本身,全在卷"剧本→分镜→生成→合成"的编排层。
3. 收敛信号:原文特意把星数不高的 `h3lite`(309⭐)与 `super-video-maker-skill`(233⭐)标为重点,理由是"技术栈选型跟头部平台几乎是同一套思路,说明打法正在收敛"。
4. 入场者信号:大厂(阿里 lumenx、小红书 FireRed-OpenStoryline)与学界(港大 ViMax)均已下场。
5. X 热度数据(原文用以佐证品类处于流量热区):AYi "6 个插件替代剪映 SVIP" 20.7 万浏览、video-shotcraft 17.7 万、HyperFrames 开源 15.8 万、video-use 11.5 万。

---

## 九、本文的边界与未核实项

1. **全部条目描述均来自该飞书文档一行摘要**,本文未逐个打开 72 个仓库读 README / 代码。凡标 `(推)` 的"输入 → 输出"是依据那一行做的最小推断,**不可当作仓库事实引用**;要用于任何判断前需回原仓库核实。
2. **星数与"最近更新"日期是原文 2026-08-25 的快照**,现已不同步。
3. 原文自称 55 个,附录实际枚举 58 个(28+27+3),本文按 58 计;"28/55" 这一比例说法随之存在出入。
4. 正文 5 处配图无法读取图内文字,若图中另有条目或数据,本文未覆盖。
5. "没赶上更新窗口"的 7 条里有 4 条原文只给星数与停更日期、未给功能描述,本文如实标注"未知",未做名称之外的推断。
6. 本文只做提炼与阶段映射,不含任何采纳建议;是否落地任何一项由用户决定。
