# W1 · 两篇飞书原文的抓取记录与交叉核对

> **本文性质**:抓取过程档案,不是资料提炼稿。两篇文档的内容清单分别在 `w1-feishu-doc-a-extract.md`(文档 A)与 `w1-feishu-doc-b-extract.md`(文档 B),本文**不重复条目内容**,只回答四件事:怎么抓到的、能看到多少、哪里被截断或取不到、以及**已提炼稿相对原文缺了哪些名字**。
> **核对时间**:2026-08-27。所有 HTTP 码、区块计数、提交时间均为当日实测,后续原文或仓库变动会使本文失效。

| 目标 | 链接 | 标题(实测 `document.title`) |
|---|---|---|
| 文档 A | `https://waytoagi.feishu.cn/wiki/ZEonw9QWdidPU4kcnP1cH1XpnTB` | 我扒完了 GitHub 上 55 个 AI 成片产线,得出一个结论 |
| 文档 B | `https://waytoagi.feishu.cn/wiki/D9VMwrysnibtO8kyzsHcPhqvnLe` | 我的 55 个 AI视频 Skill 全部开源,这是每一个的用法 |

---

## 一、可见性结论

**两篇都可匿名读全文,但只有"渲染后的浏览器"这一条路走得通。**

阻塞的性质要分清:不是内容权限阻塞(不需要飞书账号、不需要空间成员身份),而是**渲染阻塞 + API 鉴权阻塞**。文档正文由前端拿到数据后渲染,任何不执行 JS 的取法都只能拿到登录壳页;而带鉴权的 API 路径又要求 token。两条路各自堵死,合起来造成"看起来像要登录"的假象。

### 六条路径实测

| # | 路径 | 结果 | 判定 |
|---|---|---|---|
| 1 | `curl -L` 直连 wiki 链接(带浏览器 UA) | HTTP 200,但 `url_effective` 落到 `accounts.feishu.cn/accounts/page/login?...&redirect_uri=<原链接>&login_redirect_times=4`,92,193 字节全是登录壳,正文 0 字节。**两篇一致** | 不可用 |
| 2 | 飞书开放 API `open.feishu.cn/open-apis/wiki/v2/spaces/get_node?token=<token>` | HTTP 400 | 不可用 |
| 3 | 同上换 `wiki_token` 参数 | `{"code":99991661,"msg":"Missing access token for authorization."}` | 需 app token,环境无凭据 |
| 4 | 站内接口 `waytoagi.feishu.cn/space/api/wiki/v2/tree/get_info?wiki_token=<token>` | HTTP 200,body 为 `{"code":5,"msg":"Login Required","data":{}}` | 需登录态 |
| 5 | 站内接口 `space/api/obj/v2/<token>/content` | HTTP 302 | 需登录态 |
| 6 | 文本抽取代理(`WebFetch`/Exa、`r.jina.ai`) | 本次运行 Exa 返回 `429 RATE_LIMIT_EXCEEDED`;据两份提炼稿记录,可用时也只拿到首屏并在中途截断,`r.jina.ai` 在 3KB 处断且**丢失全部条目名** | 不可用/不可信 |
| 7 | **无头 Chrome + CDP** | **成功,两篇全文** | 采用 |

第 4 条值得单独记一笔:它返回 **HTTP 200 而不是 401/403**,把失败信息放在 body 的 `code:5` 里。只看状态码会误判成"抓到了"。

### 采用的抓取方式

与仓库 `tests/e2e.js` 同一套办法(`--headless=new` + `/json/list` 取 target + WebSocket 连 CDP),零额外依赖:

1. `google-chrome-stable --headless=new --window-size=1440,2400` 起进程,`Page.navigate` 到目标 URL,等 12 秒首屏;
2. 正文是**虚拟滚动惰性渲染**,滚出视口的块会被回收出 DOM,所以不能只读一次 `innerText`。用 `Input.dispatchMouseEvent` 派发真实 `mouseWheel`(`deltaY: 1400`,每 420ms 一次)逐屏推进,**每推一屏就采一次** `innerText` 并按行去重累积;
3. 同时累积全部 `<a>` 的 `textContent + href`——链接是条目名的独立佐证,且能补回正文里被省略号截断的 URL;
4. 滚到底后回顶再走一遍(虚拟列表回收会让单向滚动漏块);
5. 连续 25 次采集无新增即停。

产出:文档 A **138 条去重正文行 + 80 条链接**;文档 B **167 条去重正文行 + 53 条链接**。

---

## 二、截断点与嵌入失败点

用 `[data-block-type]` 统计区块构成,定位"取不到的东西到底是什么":

| | 文档 A | 文档 B |
|---|---|---|
| 区块类型计数 | `page 1 / text 11 / heading2 3 / ordered 3 / bullet 72` | `page 1 / image 4 / text 24 / heading1 3` |
| `<table>` 元素 | **0** | **0** |
| `image` 区块 | **0** | **4** |
| `<iframe>` | 1 | 1 |
| `<img>` 元素 | 31(全为界面图标/头像,非内容) | 35 |

> `bullet 72` 是滚动过程中的 DOM 快照数,不是文档条目总数——虚拟列表随时在回收,不能拿它当计数依据。

### 文档 A:没有嵌入失败点

正文全是 `text / heading2 / ordered / bullet`,**没有任何表格、图片或嵌入块**。全文取全,不存在取不到的内容。

⚠️ **与提炼稿的一处出入**:`w1-feishu-doc-a-extract.md` 记「唯一缺失:正文中的 5 处配图(截图)只有占位,图内文字无法读取」。**本次复现不出来**——文档 A 的 `image` 区块数为 0,页面里 31 个 `<img>` 全是界面元素。可能是原文在 08-25 到 08-27 之间删了配图,也可能是当时把界面图标误计为正文配图。**结论不变**:文档 A 没有图内文字形式的内容遗漏,72 条清单是完整的。

### 文档 B:4 个 `image` 区块——不是"渲染失败",是**截图**

`w1-feishu-doc-b-extract.md` 记这 4 块「渲染为 `Unable to print`,推测为飞书表格/同步块,渲染层未输出」。**这个诊断不对,而且方向相反**:

- 页面里 `<table>` 数量是 **0** ——文档 B 根本没有飞书表格块;
- 这 4 块的 `data-block-type` 就是 `image`,**是作者贴的表格截图**;
- 4 张图**全部加载成功**(`complete=true`,原始尺寸分别为 1199×511、1134×1280、1200×1122、1200×480),src 是 `blob:https://waytoagi.feishu.cn/<uuid>`。

也就是说:**没有任何渲染失败**。这些内容从来就不是文字,所以 `curl`、reader 代理、`WebFetch`、`innerText` 无论怎么试都必然拿不到——换抓取工具解决不了,只能读图。

**恢复办法(已验证可行)**:`blob:` 与页面同源,canvas 不会被 taint,因此可在页内 `drawImage` 后 `toDataURL('image/png')` 导出为 PNG 再读图:

```js
const im = document.querySelectorAll('[data-block-type="image"] img')[i];
const c = document.createElement('canvas');
c.width = im.naturalWidth; c.height = im.naturalHeight;
c.getContext('2d').drawImage(im, 0, 0);
return c.toDataURL('image/png');   // blob 同源,不抛 SecurityError
```

4 张图的实际内容:

| # | 尺寸 | 内容 | 价值 |
|---|---|---|---|
| 0 | 1199×511 | 「视频生产中自动调用的 dbs Skill」表,**5 行** | 订正提炼稿的 dbs 分组 |
| 1 | 1134×1280 | 「独立使用的 dbs Skill」表,**17 行 / 18 个名字**(含 `dbs` 主入口;`dbs-save / dbs-restore` 合占一行) | 22 个 dbs 名字在文档侧本来就能拿到,不必回仓库 |
| 2 | 1200×1122 | **「速查表」12 层 × Skill 数量 × 代表 Skill,末行「合计 55」** | **决定性证据,见第三章** |
| 3 | 1200×480 | 关联文章封面图 | 非内容 |

第 2 张图是本次核对的关键:它是文档自己给出的**全量分层计数表**,直接列出了正文没渲染出的名字。

---

## 三、与已提炼稿的交叉核对

### 3.1 文档 A:名字覆盖完整,72/72

把原文附录逐行解析后与 `w1-feishu-doc-a-extract.md` 全文比对:

- 附录实际枚举 **28(视频 skill)+ 27(一站式平台)+ 3(分镜/导演画布)= 58**,另有配套底座 **7**、没赶上窗口 **7**,合计 **72** —— 与提炼稿的计数完全一致;
- **72 个名字全部能在提炼稿中找到,零遗漏**。唯一未字面命中的 `story-flicks/ShortGPT` 只是写法差异(提炼稿写作 `story-flicks / ShortGPT`);
- 原文自称 55、附录实际 58 的矛盾属实,提炼稿的记录准确。

补记两处提炼稿未标的原文细节:

1. **`ArcReel` 的正文行与附录行描述不同**。正文写「小说→角色/场景/道具/分镜/视频/剪映草稿」,附录只写「小说→分镜/视频/剪映草稿」。提炼稿采的是正文口径(含"角色/场景/道具"),这是原文两处自身不一致,不是提炼错误——但后续若引用"ArcReel 覆盖主体段"这一判断,依据只在正文那一行。
2. **正文"窗口期"一段只点名 3 条**(`browser-use/video-use`、`NarratoAI`、`Pluviobyte/video-production-skills`),附录的"没赶上窗口的"才是 7 条。提炼稿按 7 条落表,正确。

### 3.2 文档 B:提炼稿说"缺 2 条名字不可恢复"——两条都已解决,且诊断需要订正

提炼稿的原始结论是:「第八层声明 6 个但正文只渲染出 5 个;第十一层声明 6 个但正文只渲染出 5 个。**2 个名字在文档侧不可恢复**」,并给出两个**未确证**的候选。现在两条都有确定答案,但答案跟候选都不一样。

#### (1) 第八层(视觉与封面)第 6 个 = **`ian-xiaohei-cat-illustrations`** — 确证

正文渲染出的 5 个:`ian-xiaohei-illustrations`、`skill-cover`、`editorial-dot-cover`、`editorial-collage-motion`、`rn-cover-skill`。第 6 个是 `ian-xiaohei-cat-illustrations`,三条独立证据互相印证:

- **文档自己的速查表截图**直接列名:「视觉与封面 | 6 | skill-cover、rn-cover-skill、**ian-xiaohei-cat-illustrations**、editorial-collage-motion」;
- **仓库在文档成文当日确实有这个目录**。`Pluviobyte/rnskill` 在 2026-07-27T02:56:21Z 的提交 `76e651c8`(提交信息就叫 *"feat: sync all 55 skills from content workspace"*)下,`skills/` 同时存在 `ian-xiaohei-cat-illustrations` 与 `ian-xiaohei-illustrations`;当日 08:40 的提交 `766e4eba`(*"chore: restore Ian's original Xiaohei skill"*)把 cat 版整个删掉,只留原版。文档 Modified July 28,正好卡在删除前后;
- **文档正文自己还在用这个名字**——「制作链」一段写「调 `ian-xiaohei-cat-illustrations` 生成插画」。且第八层第一条被描述为「Ian(伊恩)**原版**小黑正文配图」,"原版"这个措辞本身就预设了存在一个非原版(猫)变体;当日仓库 README 也正是把两者分别写作「小黑猫 IP 概念插画」与「小黑 IP 概念插画(**非猫形象**)」。

提炼稿把这个名字判为"文档提到、仓库当前没有",方向反了:它不是文档独有,而是**文档成文时仓库有、之后被删**。

#### (2) 第十一层(视频动效)第 6 个 = **不存在独立名字**,是 `rn-cover-skill` 被重复计数

这一层的"缺 1 个"根本不是渲染问题,是**文档自己的记账问题**:

- 速查表里「视觉与封面」6 个**列出了 `rn-cover-skill`**;而「视频动效」6 个只列出 5 个 `rn-*`;
- 当日仓库 README 把 `rn-cover-skill` 归在**「视频动效(HyperFrames)」**组,该组当日恰好 6 个:`rn-motion-director`、`rn-motion-replica`、`rn-dark-saas-video`、`rn-bw-text-opener`、`rn-replica-qc`、`rn-cover-skill`;
- 文档把 `rn-cover-skill` 的**描述搬到了第八层**,但**两层的计数都保留了 6**。

于是同一个 Skill 被算了两次。**文档的真实不重复 Skill 数是 54,不是 55。** 第十一层没有任何名字丢失,提炼稿列出的 5 条就是全部。

#### (3) 提炼稿的两个候选均被提交时间否掉

| 提炼稿候选 | 归属猜测 | 该目录首次提交时间 | 判定 |
|---|---|---|---|
| `rn-niulai-style-image` | 第八层第 6 个 | **2026-08-17T14:02:47Z** | 晚于文档 Modified July 28,成文时仓库中不存在 |
| `rn-human-motion-extractor` | 第十一层第 6 个 | **2026-08-25T16:48:51Z** | 同上,不成立 |

这两个都是文档发表后近一个月才加进仓库的,不可能出现在 7 月的文档里。提炼稿把它们标为"未确证"是审慎的,但结论应改为**排除**。

#### (4) 提炼稿另外还漏了 1 个名字:`chengfeng-videocut-skills`

这条不在提炼稿说的"缺 2 条"里,属于**未被察觉的遗漏**:

- 速查表截图:「视频编辑 | **4** | ra-local-talking-head-cut、video-use、ai-jian-koubo、**chengfeng-videocut-skills**」;
- 但正文第六节标题写的是「六、视频编辑(**3 个**)」,只展开 3 条。提炼稿按正文标题记 3 条,于是把它归进了"仓库有、文档正文未渲染出"一类;
- 实际上它 **2026-07-27T02:56:21Z 就在仓库里**,而且**文档速查表里有名字**——属于可从文档侧恢复的条目。

所以文档 B 逐条落名的正确总数是 **54 条**(提炼稿落名 53 条 + `ian-xiaohei-cat-illustrations`;`chengfeng-videocut-skills` 提炼稿已在第五章列出名字与说明,只是归类归错了)。

#### (5) 文档内部两套计数互相打架(原文自身问题,如实记录)

| 层 | 正文标题声明 | 速查表声明 |
|---|---|---|
| 三、视频下载 | 2 | **1** |
| 六、视频编辑 | **3** | 4 |
| 其余 10 层 | 一致 | 一致 |
| **合计** | 4+5+2+1+1+3+2+6+1+2+6+22 = **55** | 4+5+1+1+1+4+2+6+1+2+6+22 = **55** |

两套都凑到 55,但内部分配不同,两处 ±1 恰好抵消:正文把 `xiaohu-video-download`(不在 `rnskill`,属另一个仓库)算进"视频下载"因而是 2,速查表不算它因而是 1;正文不算 `chengfeng-videocut-skills` 因而"视频编辑"是 3,速查表算它因而是 4。**再叠加 `rn-cover-skill` 的重复计数,55 这个数字有 1 的虚高。**

对照仓库当日快照可以闭合:2026-07-27 的 `skills/` 共 **55 个目录** = 23 个 `dbs*`(含 `dbs` 主入口)+ 32 个非 dbs。文档口径 = 32 个非 dbs − `chengfeng-videocut-skills` + `xiaohu-video-download`(外部仓库)= 32,再 + 22 个 dbs(不含主入口)= **54 个不重复 Skill**。

#### (6) dbs 分组订正

提炼稿把「视频生产中自动调用」列为 4 条(`dbs-ai-check`、`dbs-hook`、`dbs-resonate`、`dbs-spread`),把 `dbs-content` 放进了"独立使用"。**截图里是 5 条**,`dbs-content`(内容创作诊断)属于自动调用组:

- 自动调用组(5):`dbs-hook`、`dbs-resonate`、`dbs-ai-check`、`dbs-content`、`dbs-spread`
- 独立使用组(17 行 / 18 名,含 `dbs` 主入口,`dbs-save / dbs-restore` 合占一行)
- 5 + 18 = **23** = 仓库 `dbs*` 目录数(含主入口),文档说的"22 个"是不含主入口的口径,与仓库一致 ✓

条目的用途描述提炼稿写得准确,只是这一条归组要调。

#### (7) 提炼稿仓库侧事实复核

`Pluviobyte/rnskill` 当前 `skills/` **57 个目录** ✓;dbs 系列 CC BY-NC 4.0 ✓;README 正文写"56 个"与目录数不符 ✓。提炼稿这几项均属实。

#### (8) 已取到但提炼稿未记的链接

链接累积把正文里被省略号截断的 URL 补回来了:

| 对象 | 完整链接 | 提炼稿状态 |
|---|---|---|
| 文档 B 原文出处 | `https://x.com/Pluvio9yte/status/2081648099680743554` | 记为 `…/status/208...`(截断) |
| `dbskill` 项目 | `https://github.com/dontbesilent2025/dbskill` | 只记了项目名 |
| `xiaohu-video-download` 实际位置 | `https://github.com/xiaohuailabs/xiaohu-video-translate/tree/main/skills/xiaohu-video-download` | 只记"仓库当前没有" |
| 文档 B 的前一篇 | `https://waytoagi.feishu.cn/wiki/Xv1mwZQg6iKWFekqd0nco9Dones` | 未记 |
| `ian-xiaohei` 原作者 | `https://github.com/helloianneo/ian-xiaohei-illustrations` | 未记 |

### 3.3 跨文档发现:两篇文档在一个点上接得上(两份提炼稿都未察觉)

**文档 A"没赶上更新窗口"名单里的第 5 条,其后继就是文档 B 的主体。**

- 文档 A 记:`Pluviobyte/video-production-skills`,621⭐,07-14 停更,「创作 / 复刻 / 动效 / 开场 / QA 的完整 skill 库」,并对整批落榜项目判断「**它们停了,但需求没消失——这正是窗口**」;
- 文档 B 的作者是 **雪踏乌云 · X `@Pluvio9yte`**,开源地址 `github.com/**Pluviobyte**/rnskill` —— **同一个 GitHub 账号**;
- `rnskill` 有一条提交 `9b3bc267`,2026-07-07,信息为 ***"Merge video-production-skills into rnskill with rn- prefix"***;
- 文档 A 给出的五个分类与 `rnskill` 的 `rn-` 组逐项对得上:创作→`rn-motion-director`、复刻→`rn-motion-replica`、动效→HyperFrames 组、开场→`rn-bw-text-opener`、QA→`rn-replica-qc`。GitHub API 显示该仓库 627⭐、最后推送 2026-07-14T02:28:53Z,描述为 *"Reusable AI video production skills library for creation, recreation, motion design, openers, and QA."*

**结论**:`video-production-skills` 不是"停更",是**被并入 `rnskill` 后自然停止更新**,`rn-` 前缀正是它并入时留下的痕迹。文档 A"停了但需求没消失"的判断**对这一条不成立**——需求没消失,项目也没死,只是换了仓库继续做,而且新仓库就是文档 B 通篇在讲的那一个。

这一点对后续判断的意义:文档 A 用"最近一个月是否更新"作筛选口径,会把**迁移/合并**误判成**停更**。引用文档 A 的落榜名单时,这 7 条都需要单独核实是否只是换了仓库。

---

## 四、结论与遗留

### 已闭合

1. 两篇文档均可匿名读全文,阻塞是渲染层与 API 鉴权层,不是内容权限;无头 Chrome + CDP + 滚轮推进虚拟列表是唯一可行取法,已复现两遍。
2. 文档 A 全文取全,**无嵌入失败点**,提炼稿名字覆盖 72/72 无遗漏。
3. 文档 B 的 4 个"渲染失败块"实为**表格截图**,可用 canvas 导出 PNG 后读图恢复,已恢复全部 4 张。
4. 提炼稿悬置的"缺 2 条名字"已结案:第八层第 6 个是 `ian-xiaohei-cat-illustrations`(三重证据);第十一层不缺名字,是 `rn-cover-skill` 被两层重复计数。
5. 额外发现提炼稿漏记 `chengfeng-videocut-skills` 的文档侧出处,以及 `dbs-content` 的分组应改到自动调用组。
6. 文档 B 自称的 55 个,不重复计数后实为 **54 个**。

### 遗留与风险

1. 文档 A 提炼稿记的"5 处配图"本次复现不出(`image` 区块为 0)。若后续要确认原文是否曾有配图,需要原文的历史版本,当前无从核实;不影响 72 条清单的完整性。
2. 本文所有仓库侧证据(目录快照、提交时间、README 分组)取自 `Pluviobyte/rnskill` 的公开提交历史,属**旁证**;文档 B 作者的真实分层意图无法直接验证,第十一层"重复计数"的结论是由速查表 + 当日 README 分组 + 计数闭合三者共同推出的,虽自洽但仍属推断。
3. 两篇文档的星数与更新日期都是各自成文当日的快照(A:08-25;B:07-28),现已不同步;`rnskill` 从 55 个目录涨到 57 个,继续漂移中。精确清单应以仓库为准并重取。
4. 本文不含任何原文提示词或代码正文的拷贝;`dbs` 系列为 CC BY-NC 4.0(非商业),任何形式的引用需先单独做许可评估。
5. 本文只做抓取记录与核对,**不含任何采纳建议**,是否使用其中任何信息由用户决定。
