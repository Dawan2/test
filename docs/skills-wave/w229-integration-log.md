# W229 集成记账:W226 `shots-import` 镜头 id 唯一闸

新基线 `cursor/w227-integration-3c8f`,tip **`9b81c52`**(`git fetch` 后 `git rev-parse` 现取)。
**交接自称的 `caccbda` 是那条合入链的 merge 提交、不是分支 tip**——其后还有一个把份数与两格下限
校到 live 的 `docs` 提交 `9b81c52`(它把索引份数校到 241、`FLOOR` 抬到 241、README 那格抬到 648);
按自称那个 SHA 起手会把 W227 自己那份记账件与两格 `FLOOR` 一起丢掉。这已经是连续第三槽遇到同一形状
(W222 遇 `91d3768`、W227 遇 `fa6ac3a`),口径照旧:命令行里一个 SHA 都不从交接文里抄,
先 `fetch` 再 `rev-parse`,自称与现取不符时以现取为准。
被合入支 `cursor/w226-shot-id-unique-write-9a4c` 现取 head **`32c1d75`** 与自称同值,但同样是量出来的不是采信的。

本槽合**一条**已完成支,一次 `--no-ff` 且两个 parent 齐全:

| 序 | 被合入支 | 自称 head | 现取 head | merge commit | parents(现取) | 共同祖先(现取) |
|---|---|---|---|---|---|---|
| 1 | `cursor/w226-shot-id-unique-write-9a4c` | `32c1d75` | `32c1d75` | `73aec65` | `9b81c52` + `32c1d75` | `3e8893f`(W222) |

`git cat-file -p 73aec65` 数出 **2 行 `parent`**,是真 `--no-ff` 不是快进;全程没用过 `--ours`,
没用过 `git checkout <old> -- .`,三处冲突没有一处是靠机械丢掉一侧收的场。

叉点与交接给的基线对上:W226 从 W222(`3e8893f`)出,而基线这一侧自 W222 起又走了 W225/W227 两条合入链,
两支互不相识。故 W226 自称的 **644 / 237** 与基线自称的 **648 / 241**,在合完这棵树上**一个都不是答案**,
合完 live 是 **649 / 243**。

跳过的三件按口径一条没碰:在飞的 **W228**(成片子步 note,从 W227 出,可能改 `commands` 顶层 note)、
`master` 没合、没有开第三条功能支,也没有 cherry-pick 任何已在基线里的东西。

合完整棵产品树相对**叉点** `3e8893f` 只此四个文件,恰是两侧各自那份的并集:

```
git diff --numstat 3e8893f HEAD -- js/ server.js cli.js mcp.js billing.js index.html css/
15	1	cli.js             ← W226
13	2	js/commands.js     ← 基线侧(W224)
10	4	js/domain.js       ← 基线侧(W223)
5	2	js/produce.js      ← 基线侧(W224)
```

`cli.js` **+15 −1** 与 W226 单独对着叉点的 numstat 逐格相同(该支产品面只此一个文件);
`js/`(除上列两个基线侧文件外)/`mcp.js`/`server.js`/`billing.js`/`index.html`/`css/` 零 diff。

## 一、四棵树机检:**`cli.js` 是 `P1 == B`**

四份 blob 逐文件现取(`B` = 叉点 `3e8893f`,`P1` = 我方 `9b81c52`,`P2` = 对侧 `32c1d75`):

| 文件 | B | P1 | P2 | tip | 成色 |
|---|---|---|---|---|---|
| `cli.js` | `d55233f0` | `d55233f0` | `7dccfca8` | `7dccfca8` | **`P1 == B`,git 整份取对侧** |
| `js/commands.js` | `f9d86741` | `31c689e5` | `f9d86741` | `31c689e5` | `P2 == B`,整份取我方 |
| `js/domain.js` | `056d1783` | `8af2a73f` | `056d1783` | `8af2a73f` | `P2 == B`,整份取我方 |
| `js/produce.js` | `ba23f5d7` | `b943a175` | `ba23f5d7` | `b943a175` | `P2 == B`,整份取我方 |
| `js/plans.js` | `bebe8606` | `bebe8606` | `bebe8606` | `bebe8606` | 三树全同,两侧都没碰 |
| `js/skills.js` | `f7c0baf0` | `f7c0baf0` | `f7c0baf0` | `f7c0baf0` | 三树全同,两侧都没碰 |
| `README.md` | `139df67a` | `199514cf` | `e0e62e38` | `18020a7e` | 真并集(四份互不同) |
| `docs/skills-wave/README.md` | `2b172fe4` | `32f7dec3` | `d90dcbf2` | `a13e64b2` | 真并集(四份互不同) |
| `tests/unit.js` | `f05029ee` | `1f232b3e` | `c3632993` | `d82f072e` | 真并集(四份互不同) |

**产品面唯一那个 `P1 == B` 是 `cli.js`**:我方自 W222 起没碰过它(W225 那槽只动 `js/domain.js`、
W227 那槽只动 `js/commands.js` + `js/produce.js`),git **整份取对侧、不做任何 hunk 级取舍**。
合得"干净"不等于合得对——`cli.js` 一个冲突都没报,恰恰说明对侧在这个文件里带来的**每一处**都得逐条现取,
不能拿"没报冲突"当担保(§二)。

**注意 `js/plans.js` 与 `js/skills.js` 那两行是 `P1 == B` 的退化形态,不是同一件事**:它们三树 blob 全同,
两侧谁都没碰,"整份取对侧"取回来的就是叉点原样;真正需要逐条现取的 `P1 == B` 只有 `cli.js` 一个。
只按"P1 与 B 的 hash 相等"筛会把这两个也筛进来,量的时候要连 `P2` 一起看。

反过来 `js/commands.js` / `js/domain.js` / `js/produce.js` 是 `P2 == B`(整份取我方),故基线侧
W223/W224 那几堆判据不会被对侧顶掉,但同样逐条现取过(§三)。

## 二、`cli.js` 整份取对侧后逐条现取

交接点名「`cli.js` 若整份取对侧,核 `shots-import` 闸**且**不要丢掉 w227 侧其它 cli 改动(若有)」。
后半格先机检:**没有**——`git diff --numstat 3e8893f 9b81c52 -- cli.js` 输出 **0 行**,
`cli.js` 的 `P1` blob 与 `B` 逐字节相同(`d55233f0`),w227 侧在这个文件上一个字都没改,
故整份取对侧不存在顶掉任何东西的可能。这是量出来的结论,不是"看起来没冲突"。
tip 上的 `cli.js` blob `7dccfca8` 与 `P2` 逐字节相同,即对侧那份原样落地、一处没被裁掉。

闸本身在 `cli.js` 第 729–738 行,逐条现取:

| 点名 | tip 上现取到的 | 在不在 |
|---|---|---|
| 落库前设闸 | 第 733 行 `const taken = new Set(f.append ? (ep.shots \|\| []).map(s => s.id) : []);` 在 `ep.shots = …` 赋值**之前** | ✅ |
| 撞 id 改发新 id | `do { s.id = 'sh_' + Date.now().toString(36) + '_' + crypto.randomBytes(4).toString('hex'); } while (taken.has(s.id));` | ✅ |
| 口径同 `trashRestore` | 同为"撞了就重发 `sh_` 前缀新 id",不是拒收整行、也不是替用户合并两行 | ✅ |
| 首行保留用户 id | `taken` 在整表替换档起手为空集,故首行必不命中 `taken.has`,原样留住 | ✅ |
| 回报 `renamedIds` | 第 747 行回执 `{ …, renamedIds: renamed }`,另有 `log()` 一句明写"镜头 id 是分镜表唯一寻址键" | ✅ |
| `--append` 共用同一道闸 | `taken` 在 `f.append` 档预载表内已有 id,两档同一段代码 | ✅ |
| 选人那一侧一个字没动 | `cli.js:1052` 与 `js/commands.js:108` 仍是 `ids.has(s.id)` 按行筛 | ✅(有意不动,见 §九) |

`crypto` 在 `cli.js` 第 21 行早已 `require`,不是这一槽新引的依赖(零依赖约束未破)。

### 2.1 合完的树上真跑一遍(不是读源码猜)

`P1 == B` 不许只靠源级比对交差。在合完的树上起真 `server.js`(`MV_DATA_DIR`/`MV_UPLOADS_DIR`/`MV_CONFIG`
重定向到临时目录,端口 8177,不碰真实数据),用真 `cli.js` 走一遍两档:

```
$ node cli.js shots-import <pid> <epid> --file shots.json --json      # 三行:dup / dup / solo
1 镜的 id 与表内已有/本次重复,已改发新 id(镜头 id 是分镜表唯一寻址键,重复即无法逐镜寻址)
{"episode":"ep_…","imported":3,"total":3,"replaced":true,"renamedIds":1}

$ node cli.js shots-import <pid> <epid> --file shots2.json --append --json   # 一行:dup(撞表内已有)
1 镜的 id 与表内已有/本次重复,已改发新 id(镜头 id 是分镜表唯一寻址键,重复即无法逐镜寻址)
{"episode":"ep_…","imported":1,"total":4,"replaced":false,"renamedIds":1}

$ node cli.js shots <pid> <epid> --json    # 落库后 id 清单
dup                    ← 同 id 第一行(用户给的 id 原样留住)
sh_mtd9o4gw_69a15a52   ← 同 id 第二行(改发新 id)
solo                   ← 不撞的 id 一个字没动
sh_mtd9o4jo_a74d2170   ← --append 撞表内已有 id,同一道闸
```

四行四个 id 一个不重;`imported` 照旧是 3 与 1(闸改的是 id,不是替用户砍掉一行);
`renamedIds` 两档各报 1,不是静默改掉寻址键。这三格读数是在合完的树上现取的,不是从 W226 记账件里抄的。

## 三、`P2 == B` 那三个文件:基线侧的判据逐条复核没被顶掉

`js/commands.js` / `js/domain.js` / `js/produce.js` 是整份取我方,交接点名的保留项逐条现取:

| 点名 | tip 上现取到的 | 在不在 |
|---|---|---|
| W224 `smartReview` note | `js/commands.js` "一镜也没审" 两档文案(点名档 / 整集档)各一份 | ✅ |
| W224 `targets` 出口 | `js/produce.js` 空审档 `return { pass: 0, retry: 0, manual: 0, targets: 0 }`,正常出口带 `targets: targets.length` | ✅ |
| W223 四堆按点名 id 数 | `js/domain.js` `const hits = ids.map(id => shots.filter(s => s.id === id));`,`gone` 是 `hits.filter(h => !h.length).length` 不是减法 | ✅ |
| W216 镜头闸 | `emptyBatchNote` 入口 `Array.isArray(picked) && picked.length` | ✅ |
| W214 主体闸 | `emptySubjectImageNote` 入口同形,一行未被顶掉 | ✅ |
| W217 主体侧 `gone` 按 id | `ids.filter(id => !subs.some(…))`,不是"点名数 − 命中条数" | ✅ |
| W219 `manualCmd` 单点 | `js/plans.js` 里 `expert.evolve` 字面 **0** 处;全仓 `manual: true` 仍 **1** 处(`js/cmd-registry.js`) | ✅ |
| W210 `force` | `episode.compose` 参数面仍 `pid,epid,force,ui` | ✅ |
| W221 按钮测 | `pipeline` 套件 12 → 13(那条"整集全是过期终稿时按钮照旧挂着")在 tip 上现取到 | ✅ |

三个文件的 tip blob 与 `P1` 逐字节相同(`31c689e5` / `8af2a73f` / `b943a175`),即"整份取我方"确实是整份。

**W226 与基线侧改的是同一条链的两头,但不打照面**:W226 修的是**写入侧**(`cli.js` 落库闸),
W223 修的是**回执计数侧**(`js/domain.js` 四堆),两者一个不引另一个,机检也印证——两侧产品面零文件重叠。

## 四、冲突逐处怎么收的

三处冲突,一处没机械取侧。

### 4.1 `README.md` 第 611 行长行:**两侧都只改了数字**

那行 34196 字符。三份(`B`/`P1`/`P2`)字节长度**逐份相同**,先 `sed 's/[0-9]/#/g'` 掩数字再 `cmp`:

```
P1 vs B 掩码后:IDENTICAL(只改数字)
P2 vs B 掩码后:IDENTICAL(只改数字)
```

**这与 W222/W225/W227 三槽都不同**——那三槽都是一侧只改数字、另一侧插了一段散文,得求 opcode 分出来再取真并集;
本槽两侧都没动散文,故并集就是"同一份散文 + 数字按 live 定"。逐个数字对下来 82 个数只有第 0 个动过
(`B` 643 / `P1` 648 / `P2` 644),收成 live **649**。

收完做双向回验,两条都过:

- 整份 `README.md` 掩数字后与 `P2` **逐字节相同**(即对侧那句 `shots-import` 用法语义在,§4.2);
- 整份 `README.md` 掩数字后与 `P1` 只差**一行**,恰是那句用法行——反过来证明我方散文一个字没丢。

### 4.2 `README.md` 用法行:零冲突但得逐字核

交接明令「W226 给 `shots-import` 补了新语义,取并集,不要整行 ours 丢掉」。这一行 git **没报冲突**
(我方没碰它),自动取了对侧,tip 第 206 行现取:

```
node cli.js shots-import <pid> <epid> --file shots.json   # 数组:plot/camera/…/duration;带 id 的行按 id 认领原镜,撞表内已有/本次重复的 id 改发新 id 并回报 renamedIds
```

分号后那半是 W226 加的,在;分号前那半是叉点原样,也在。**没走"整行取 ours"**——那会把 README 里
唯一写着 `renamedIds` 的地方一起丢掉。

**另记一格「零冲突照样得对 live」**:同一份 README 里 `contract` 那格数字(全文第 492 个数)
只有我方一侧从 139 抬到 140,对侧那棵树上仍是 139,故 git 直接取了 140。零冲突不等于这个数就对,
合完单跑 `contract` 现取恰是 **140**,未再改。

### 4.3 目录索引表:取并集后按波次号归位

我方带 5 行(w221 / w223 / w224 / w225 / w227),对侧带 1 行(w226)。取并集后按波次号排,
**w226 归位到 w225 与 w227 之间**(追加表尾当场红在"索引行序"那条)。六行逐行与各自源树 `cmp` 回验:
w221/w223/w224/w225/w227 五行与 `P1` 逐字节相同,w226 一行与 `P2` 逐字节相同。
我方在表尾与 `## 一分钟摘要` 之间多的那个空行一并保留(对侧没有它,取并集即取上)。
份数字面两侧给的 241 / 237 都不是答案,按 live 收成 **243**(242 行 + 本文)。

### 4.4 `tests/unit.js`:两处纯数字冲突

两处都是掩数字后两侧逐字节相同的纯数字位,按 live 收:
`['单元测试', 648 / 644 → **649**` 与 `const FLOOR = 241 / 237 → **243**`。
W226 那条新用例(53 行)落在 `commands` 套件里,与我方 W227 的插入点不在同一处,git 逐 hunk 合上,
不是"两侧在同一插入点各追加一条、共用块尾"那个形状,故没有用上 W220 那三步手法。

## 五、数字:全部合完 live 重跑

合完先整跑一遍,让对账用例自己报差额——它当场报「期望 243,实际 242」(本文还没落地),
写完本文再跑即绿。一个数都不是从两侧记账件里抄的:

| 格 | W226 自称 | 基线自称 | **合完 live** |
|---|---|---|---|
| `unit` 总数 | 644 | 648 | **649** |
| `commands` | — | — | 47 → **48**(W226 那条) |
| `domain` | — | — | 38 → **39**(W223 那条) |
| `produce` | — | — | 17 → **19**(W224 两条) |
| `pipeline` | — | — | 12 → **13**(W221 那条) |
| `contract` | — | 140 | **140**(W227 那条;对侧没抬,复核 live 恰是它) |
| `plans` / `skills` | — | — | **17 / 95**(两侧都没加) |
| 记账件份数 | 237 | 241 | **243**(含本文) |
| `integration` | — | — | **147/147 全绿** |
| `cli.smoke` | — | — | **107/109**(见 §五之二) |

两格 `FLOOR` 按 live 抬:`tests/unit.js` 的 `FLOOR = 243`、`docs/skills-wave/README.md` 明写「共 243 份」,
与目录实况 243 份三方对齐。

**`commands` 套件 +1 落在 tip 上**(交接点名的那格):新增的是
`commands · CLI shots-import:同 id 两行进不了分镜表(撞 id 改发新 id),点名一次引擎就只收一行`,
按名点住、不是按数点住。

### 五之二、`cli.smoke` 单独整跑

`tests/cli.smoke.js` 非并行安全,单独整跑:**107/109**,两条失败:

| 失败条目 | 表现 | master 现跑对照 |
|---|---|---|
| `未登录 whoami → exit 3` | `exit=1` | 同名同表现 |
| `llm --json mock 链路` | `undefined` | 同名同表现 |

`master`(`9adcf0ff`)现跑 **51/53**,失败的就是这两条、名字与表现逐字相同,故是 master 同名失败不是本槽引入。
**另记一格给下一个人**:头一遍跑出 15/109 是**测试环境被污染**,不是回归——§2.1 那次 live 验证
往当前 shell 里 `export` 了 `HUJING_SERVER=http://localhost:8177`,而 `cli.smoke` 自己起在 8150 端口,
被这个环境变量整体劫走后逐条 `ECONNREFUSED`。`unset HUJING_SERVER HUJING_CONFIG_DIR MV_*` 后复跑即 107/109。
手工验证与冒烟同壳跑时,验证用的 env 要当场清掉再跑冒烟。

## 六、名集按 `|` 切做多重集

四棵源树与 tip 的快照都在全绿 commit 上取(643 / 648 / 644 / 649,名字后不会缀失败原因):

| 方向 | 新增 | 去掉 |
|---|---|---|
| `P1`(w227)相对 `B` | 5 | **0** |
| `P2`(w226)相对 `B` | 1 | **0** |

`P1` 那 5 条:`produce` 两条(空审回执说清原因 / 用户中止不冒充空审)、`pipeline` 一条(全终稿档按钮照挂)、
`domain` 一条(同 id 两镜四堆按点名 id 数)、`contract` 一条(断点条不藏按钮)。
`P2` 那 1 条:`commands` 那条 `shots-import` 唯一闸。

tip 上**基线独有 0 条、两支新增 5+1 条全在、零多出**,`643+5+1=649` 自洽。
**本槽两侧 `去掉` 都是 0**,即没有 W222/W225 那种"等量替换掉一条断言方向相反的用例"的形状
(那种只看数字看不出来,必须切多重集);这一格是量出来是 0,不是没量。

## 七、治理面:一格未动

- `js/skills.js` **四棵树 blob 全同**(`f7c0baf0`),故 `gaps()` **20 键**一个没剥、
  **SK-04 / G-11 / G-13 原样开着没装清**,`skills` 套件 95/95 全绿。
- `GUARD_TOPICS` **19** 条 / `TOPIC_FLOOR` **19** / 花名册 **19**,`GUARD_TOPICS_CLOSED` **0** 条,一条没销号。
- `expert.evolve` 仍不进 playbook `steps`(`js/plans.js` 里该字面 0 处),全仓 `manual: true` 仍 1 处。
- `episode.compose` 参数面仍 `pid,epid,force,ui`。
- 本文零相对路径互引(记账件自足,不借道 markdown 相对链接指向同目录别的记账件)。

## 八、本槽没做的四件事,与为什么

交接明令不代修,四件在 tip 上原样留着(逐条现取见 §九),两个方向的偷懒都没走——
既没顺手把它们捎带修了,也没把残留抹掉不写:

1. 存量重复 id 迁移;
2. `state-put` 逃生舱;
3. 选人双扣费;
4. 嵌套 `steps` note。

另外三件按口径没碰:没合 `master`、没开第三条功能支、没碰在飞的 W228。

## 九、交接:四格残留原样留着

### 9.1 未收(交接明令不代修):存量重复 id 迁移

W226 的闸只管**新进来的**导入。全仓现取**没有任何存量迁移实现**
(`dedupeShotIds` / `migrateShotIds` 之类一处都没有),故闸上线之前就已经躺在库里的同 id 多行不会被清。
形状与修好之后的对照:

- 闸后新导:同 id 两行 → `renamedIds: 1`,落库两个不同 id(§2.1 live 读数);
- 存量老数据:同 id 两行照旧躺着,点名该 id 仍是引擎实收两行、两笔 `video.gen`。

要收的话得单开一槽:落点是"读到分镜表时发现重复即改发新 id 并回报",而这会**改动已落库数据的寻址键**,
用户手上按老 id 记的脚本会失配,故不该顺手塞进集成槽里。

### 9.2 未收(交接明令不代修):`state-put` 逃生舱

`cli.js:1594` `CMD['state-put']` 是全量覆盖(`--force` 才放行),直接 `PUT /api/state`,
**中途不过 `shots-import` 那道闸、也不做任何镜头 id 唯一性校验**。故拿一份含同 id 两行的 `state.json`
灌进去,重复 id 照样落库。它是有意留的危险逃生舱(帮助文本明写"危险操作"),
但它意味着 §9.1 的存量重复**还能被再造出来**——收 9.1 那一槽得连它一起判,不然修完还会长回来。

### 9.3 未收(交接明令不代修):W223 残留——同 id 两镜时选人双扣费

两端选人闸仍按**行**筛:`cli.js:1052` 与 `js/commands.js:108` 都是
`(ep.shots || []).filter(s => !s.final && ids.has(s.id) …)`。同 id 两行在库时点名一次两行都跑,
一个 id 收两笔 `video.gen`,且两笔写回的都是首行(`findShot` 取首行,第二行永远寻不着)。

**W226 修完之后这一格的成因变窄了**:新导入这条路已经进不来重复 id(§2.1),
故 tip 上还能撞见这个形状的,**主要就是 §9.1 的存量数据与 §9.2 那条逃生舱灌进去的**。
这一格不许改成"选人按 id 去重只跑一行"来假过——那会把用户点名两行的正常子集也一并砍掉;
W226 的用例正文里也把这句写死了。

### 9.4 未收(交接明令不代修):W224 残留——一键成片子步 note 嵌套不播

`js/commands.js` 的 `episode.produce` 顶层仍回 `{ steps, url }`,子步的 `note` 嵌在
`steps[].result.note` 里;而 `digest` 现取只认顶层那一位(`const note = r.result && r.result.note;`)。
故 W224 那句"一镜也没审"在**单独点智能审片**时播得出来,走**一键成片**时播不出来。
在飞的 **W228 正是冲这一格去的**(可能改 `commands` 顶层 note),故本槽一个字没碰 `episode.produce`,
免得和它顶上。

### 9.5 给下一个人的三格

- **基线 tip 连续三槽都比交接自称多一个 `docs` 提交**(W222 遇 `91d3768`、W227 遇 `fa6ac3a`、本槽遇 `caccbda`)。
  这已经是稳定形状不是偶发:合入链最后那个校数字的 `docs` 提交,交接文往往写的是它前面那个 merge 提交。
  照旧 `fetch` + `rev-parse`,别从交接文抄 SHA。
- **`P1 == B` 的退化形态要认出来**(§一):三树全同的文件按 hash 筛也会落进 `P1 == B`,
  但那里面对侧什么都没带来,逐条现取的力气该花在真正只有对侧改过的那个文件上。
- **手工 live 验证与 `cli.smoke` 同壳跑要清 env**(§五之二):`HUJING_SERVER` 之类留在 shell 里
  会把冒烟整体劫到错端口,跑出一片 `ECONNREFUSED`,看着像大回归其实是自己污染的。
