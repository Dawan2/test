# W149 · 交付包打包吞掉抓分镜失败:zip 少一集分镜,回执照报成功

一句话:`js/release.js` 的 `buildReleaseZip` 抓分镜文件那段兜着一个 `catch (_) {}`,
`Exporter` 抛错时这一集的整个 `storyboard/` 目录**一个文件都不进包**——兜底 CSV 长在 `else` 分支上,
抓取失败这一路走不到它——而回执 `{files, videosOK, videosSkipped, stale}` 里没有任何一格记这件事,
下载提示照印「交付包已下载:N 个文件」。**用户把包发出去、对方拆开才发现缺分镜。**
本槽把这一路收成与上面成片 mp4 那一路同纪律:失手如实登记 + 回退内置分镜表 + 下载时另出一条错误提示。

W145 文末把本文件里两处空 `catch` 一并登记为仍欠(`buildReleaseZip` 抓分镜、底部 `Bus.on('*')`)。
第二处的 `catch` 本身查下来确实无害,**但审它时量出它兜着的那段代码在自喂自**(第 3 节),
故本槽的处置是:那个 `catch` 一个字不动,它兜着的那处**实害**收掉。
**G4–G6 段(W145 的活)一个字没碰**,`js/release-core.js` 也一行未动。

## 1. 病灶:失败这一路既不落文件,也不落回执

改之前那段:

```js
if (window.Exporter && typeof Exporter._buildMaterialShim === 'function') {
  const mf = window.Exporter._buildMaterialShim || (() => []);
  try {
    const list = await mf(p, ep);
    list.forEach(f => files.push({ name: 'storyboard/' + epName + '/' + f.name, data: f.data }));
  } catch (_) {}
} else {
  // 兜底:至少一份 CSV + shots list
  files.push({ name: 'storyboard/' + epName + '_分镜表.csv', data: … });
}
```

两处一起塌:

| | 改前 | 实况 |
|---|---|---|
| 包里 | 这一集 `storyboard/` 空目录(兜底 CSV 在 `else`,够不着) | 交付包缺这一集全部分镜表与提示词附件 |
| 回执 | `videosSkipped` `stale` 都是空,`files` 只是个总数 | 缺了几集、缺的是哪几集,回执上一个字看不出来 |
| 下载提示 | 「交付包已下载:N 个文件,M/K 集成片」`success` | 与齐全的包长得**一模一样** |
| 包内 `README.txt` | 只列「跳过的视频」与「过期提醒」 | 拆包的人手边唯一那份说明也没这一栏 |

**同一个函数里紧挨着的成片 mp4 那一路没有这个毛病**:抓取失败 `summary.skipped.push(ep.title + ':成片抓取失败 ' + e.message)`,
进回执、进包内 `README.txt`、进下载提示。抓分镜这一路是这个函数里唯一一处**失手完全不留痕**的。

## 2. 处置:与 mp4 那一路同纪律

```js
let storyboardOK = false;
if (window.Exporter && typeof Exporter._buildMaterialShim === 'function') {
  try {
    const list = await Exporter._buildMaterialShim(p, ep);
    if (!Array.isArray(list)) throw new Error('分镜文件清单不是数组');
    list.map(f => ({ name: 'storyboard/' + epName + '/' + f.name, data: f.data })).forEach(f => files.push(f));
    storyboardOK = true;
  } catch (e) {
    summary.storyboardFailed.push((ep.title || ep.id) + ':分镜文件抓取失败 ' + e.message + '(已回退内置分镜表)');
  }
}
if (!storyboardOK) files.push(fallbackStoryboard(ep, epName));
```

四处要点:

1. **兜底从 `else` 挪成 `if (!storyboardOK)`**,原 `else` 里那段抽成 `fallbackStoryboard(ep, epName)`。
   于是"抓取失手"与"`Exporter` 没加载"走同一条兜底,交付包里这一集**不再可能整个分镜目录为空**。
2. **失手另记一格 `summary.storyboardFailed`**,不并进 `videosSkipped`——那一格说的是成片,
   混在一起的话回执上「跳过 3 项」既可能是没合成、也可能是分镜读崩,读回执的人分不出该去重合成还是该查 `Exporter`。
   这一格同时进返回值、进包内 `README.txt` 新增的一栏、进 `downloadReleaseZip` 另出的那条 `error` 提示。
3. **清单先整批算完再入列**(`list.map(…).forEach(push)`)。原写法是边遍历边 `push`,
   `list` 里某个元素读 `f.name` 抛错时前半截已经进了 `files`,再叠上兜底那份,
   包里会出现"半截 shim 产物 + 一份兜底 CSV"混着的分镜目录。`map` 抛在任何 `push` 之前,这个形态不可能出现。
4. **`list` 不是数组当失手记**。`shim` 回 `undefined` 时原写法在 `list.forEach` 上抛 `TypeError`、被同一个空 `catch` 吞掉,
   结果与抛错一样(目录空 + 回执无痕),故按同一格记。

`const mf = window.Exporter._buildMaterialShim || (() => [])` 那行连同它上面那句自问自答的注释一并去掉:
外层 `if` 已经判过 `typeof … === 'function'`,`||` 那半永远取不到。

### 2.1 为什么不是"打包整个失败"

`buildReleaseZip` 现有纪律是**缺什么报什么、不拦交付**:没合成的集记 `skipped` 照样出包,
成片判旧记 `stale` 照样出包(注释明写"只警告不拦截打包")。抓分镜失手抛出去的话,
这一次打包连已经抓到的 mp4 与 SRT 一起丢掉,而这两样往往正是用户当下要的。
故本槽取同一纪律:**照样出包,但包里缺什么、回执与提示上就得写着什么**。
门禁那一侧(`collect` 的 G1–G10)一个字没动——打包不是发布门的一项。

### 2.2 计费

`buildReleaseZip` / `downloadReleaseZip` 全程零 LLM 零上游调用,不走 `Tasks.run`、不扣费,
故没有退费这一说;本槽也没给它加计费。发布留痕那条既有断言(两端都不进 `Tasks.run`)原样全绿。

## 3. 底部 `Bus.on('*')`:那个 `catch` 不动,它兜着的那段有实害

### 3.1 `catch` 本身:确实无害,故不动

```js
try {
  if (window.Bus) Bus.on('*', ev => { … });
} catch (_) {}
```

三条判据都指向"不动":

1. **它只兜住"注册订阅"这一下**,不兜回调。回调是 `Bus.emit` 稍后同步调起来的,
   那里另有一层 `try { fn(ev) } catch (e) { /* 订阅者异常不阻断管线 */ }`——回调抛出的东西根本走不到这个 `catch`。
2. **`Bus.on` 是全函数**(`js/bus.js`:判 `name`/`fn` → 塞进 `Set` → 回退订句柄,无 IO 无抛出)。
   走得到这个 `catch` 的唯一情形是 `window.Bus` 在场而 `Bus.on` 不是函数,即 `bus.js` 没加载或被桩顶掉——
   这是**页面加载期的环境降级**,与本文件其余 `if (window.X)` 守卫同一类,吞掉它符合既有纪律
   (W137 第 4 节已就浏览器侧同类边界写过这条口径)。
3. **下游是空的**:`release.dirty` 全树**零订阅者**(唯一发出点就是这里)。吞掉注册最坏的后果是
   一次 tab 角标没实时重算,而角标每次渲染都现取 `badgeHTML(p) → collect(p)`,下一次重绘自动补上。
   **它进不了交付包,也改不了任何一门门禁结论。**

第 1、2、3 条各有断言钉着(见第 4 节那条用例末尾三段)。**订阅者从零变一的那天**,
第 3 条的前提就没了——那时再回头掂量这个 `catch`,判据落在"注册失手要不要让角标那一侧知道"。

### 3.2 但它兜着的那段在自喂自:一条主线事件转 1695 次

审第 3.1 时用真 `bus.js` 跑了一遍,量出这个:

```js
Bus.on('*', ev => {
  const nm = String(ev.name);
  if (nm.startsWith('shots.') || … ) Bus.emit('release.dirty', ev);   // ← 整条源事件当 payload
});
```

`Bus.emit` 那头是 `const ev = Object.assign({ name }, payload || {})`——**`payload` 后写,`payload.name` 把事件名顶掉了**。
于是转发出去的那条事件,分发用的是 `'release.dirty'`,而事件对象上写着 `'shots.batchDone'`;
通配订阅拿到它、按 `ev.name` 判来源,认定这是条主线事件,**再转一次**。自喂自,直到爆栈。

爆栈那个 `RangeError` 正好落在 `emit` 的订阅者隔离 `catch` 里被吃掉,所以**一声不吭**。基线 `25aa1c0` 实测:

| | 基线 | 本槽后 |
|---|---|---|
| 一条 `shots.batchDone` 触发 `release.dirty` 次数 | **1695**(爆栈为止) | **1** |
| 事件留痕 50 格里的事件种类 | **1 种**(全是这条被复制的) | 如实,各事件都在 |
| `Bus.recent(12)` 回什么 | 12 条一模一样的同一条 | 最近 12 条真事件 |

**这有产品危害,且不在角标那一侧**:`Bus.recent(12, pid)` 是 Agent 按需查询里 `t === 'events'`
那一路的取数口(`js/agent-ops.js`),即用户问"最近发生了什么"时助手照着念的那份。
一条主线事件跑完,这份留痕就只剩它自己 50 份复制,整场会话此前发生过的事**全被挤没**——
助手于是言之凿凿地回答一件被复制了 50 遍的事,并且说不出别的。这不是"角标晚刷一拍",是**回执在说假话**。

### 3.3 两处一起收(各一行)

- `js/bus.js`:`Object.assign({}, payload || {}, { name })`——**事件名由 `emit` 定,`payload` 顶不掉**。
  这是根:任何调用方把一条事件原样转发出去,都会踩同一个坑,不该由每个转发点各自记得绕开。
  全树扫过,除本处外没有第二个 `emit` 的 payload 带 `name` 键,故这一改对其余调用点零行为变化。
- `js/release.js`:`Bus.emit('release.dirty', { src: nm, p: ev.p, ep: ev.ep, brief: ev.brief })`——
  源事件名走 `src`,不占 `name`。改完这一处**单独**也够堵住自喂自,但转发件仍该带得出"是被谁触发的",
  而原写法把整条源事件递出去正是为了这个;这里只是把它挪到一个不与总线契约打架的键上。

两处**各有各的判据**(第 4 节 M5/M6 分别只红一条),不靠对方兜底。

## 4. 加的测与变异实测

新增 4 条(`release` 3 条、`bus` 1 条)。七条变异逐条改回去跑 `node tests/unit.js release` 与 `… bus`,验完还原:

| 变异 | 结果 |
|---|---|
| M1 整段退回基线形态(空 `catch` + 兜底留在 `else`) | 红 2:「两集抓分镜都失手应各记一条,实际 []」+「抓分镜失手须另有一条提示」 |
| M2 失手照记,但兜底不补(`Exporter` 在场就不回退) | 红 1,且点名 `storyboard/` 空:「期望 …1_第一集_分镜表.csv,…2_第二集_分镜表.csv,实际 ""」 |
| M3 回执照记,去掉 `downloadReleaseZip` 那条错误提示 | 红 1,只红下载那条(打包那条不动——两条分工不串味) |
| M4 兜底照补,但不记 `storyboardFailed`(即"静默替换") | 红 2:回执为空 + 提示缺 |
| M5 `js/bus.js` 退回 `Object.assign({ name }, payload)` | 红 1,**只在 `bus` 套件**:「emit 的回执名…期望 release.dirty,实际 shots.batchDone」 |
| M6 `js/release.js` 转发退回递整条 `ev` | 红 1,**只在 `release` 套件**:`src` 恒 `undefined`(条数仍是 5——`bus.js` 那一改挡住了自喂自) |
| M7 M5+M6 一起退(= 基线) | 红 2:`release` 那条当场量出自喂自(实际值印出上千条 `shots.batchDone<undefined`)+ `bus` 那条 |

分工读得出来:M5/M6 各红各的,证明两处判据互不代偿;M2/M3/M4 三条把"记了没有 / 补了没有 / 说了没有"
拆成三格,坏哪一格报哪一格。**正面那一段在七次变异里一次没红**——抓取正常时仍走 `Exporter` 那份清单
(`storyboard/1_第一集/分镜表.csv` 逐字钉住)、回执不报失败、下载不多那条噪音提示,判据确实没动。

## 5. 数字(live 现取)

| | 本槽前 | 本槽后 |
|---|---|---|
| `tests/unit.js` 用例数 | 504 | **508**(`release` 19 → 22、`bus` 4 → 5) |
| 单元测试 `FLOOR` / 主 README 明写数 | 504 | **508** |
| `tests/integration.js` | 130 | 未动(复核过) |
| `tests/cli.smoke.js` | 102 | 未动 |
| 记账件份数 / 目录 README 明写数 / 记账件 `FLOOR` | 159 | **160**(含本文) |

`node tests/unit.js` 508/508、`node tests/integration.js` 130/130 全绿;
`node --check` 过 `js/release.js`、`js/bus.js`、`tests/unit.js`。
`tests/cli.smoke.js` 与 `tests/e2e.js` 本槽未跑(改动面全在浏览器侧两个文件,CLI/服务端零 diff)。

## 6. 本槽没做的事

- **不碰 G4–G6**(W145 的活,且 W145 此刻未在 `w146` 树里)。`js/release-core.js` 一行未动。
- **不碰底部那个 `catch (_) {}`**,理由与它到期的条件写在第 3.1 节。
- **不动打包的拦截口径**:失手照样出包(第 2.1 节),不抬发布门,不给打包加计费。
- **不给 `release.dirty` 加订阅者**。角标仍是每次渲染现取,本槽只让这条事件发得对。

## 7. 交接

1. **`downloadReleaseZip` 开头那两行占位下载还在**:`ZipUtil.download(name, [{name:'PLACEHOLDER'}])`
   先落一个空 zip、紧接着注释写着"避免上一行占位生成额外空 zip"再走 `Blob` 那条正路——
   注释与代码相反,用户每次打包实际会收到**两个文件**,其中一个是空的。本槽没收(与抓分镜那处不同源,
   且它是"多一个"不是"少一个",危害等级低一档),但它确实是这个函数里下一处该收的。
2. **`summary.skipped` 里的集名取 `ep.title` 不带兜底**(`ep.title + ':成片抓取失败 …'`),
   没标题的集在回执上印成 `undefined:成片抓取失败`。本槽新加那一格用的是 `(ep.title || ep.id)`,
   两格写法就此不齐;顺手改会动到既有回执字面,留给下一槽连同上一条一起收。
3. **`Bus.emit` 的 payload 契约至此只钉住了 `name` 一个键**。`time` 同样会被 payload 顶掉
   (`if (!ev.time)` 判的是合并后的值,转发件会带着源事件的旧时间戳进留痕)。
   这一条本槽没收:它不造成自喂自,且"转发件沿用源事件时间"未必是错的,得先定口径再动。
