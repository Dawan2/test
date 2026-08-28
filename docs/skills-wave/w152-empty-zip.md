# W152 · 打包交付一次给两个 zip,其中一个是空的

一句话:`js/release.js` 的 `downloadReleaseZip` 在真下载之前先 `ZipUtil.download(name,
[{ name: 'PLACEHOLDER', data: '' }])` 落了一份只装一个空条目的 zip,紧接着下一行注释就写着
「正确写法:用 `URL.createObjectURL`,**避免上一行占位生成额外空 zip**」——注释说的那件事没做,
占位那次下载一直留着。于是每按一次「📦 打包交付 ZIP」用户实得两个同名 zip,
先落地的那个 120 字节、解开只有一个叫 `PLACEHOLDER` 的空文件,浏览器还给后落地的真包加个 `(1)`。
本槽删掉占位那一行,配两条用例把「一次打包只落一个文件」和「落地的就是打好的那份包」钉住。

## 1. 病灶:占位那一行本来就是要被删掉的

改之前那段(第 352 行起):

```js
async function downloadReleaseZip(p, opts) {
  const r = await buildReleaseZip(p, opts);
  const name = '交付包_' + safeName(p.name) + '_v' + (p.__ver || 0) + '.zip';
  ZipUtil.download(name, [{ name: 'PLACEHOLDER', data: '' }]);  // 先占位触发下载;ZipUtil.download 接受 files,直接重写
  // 正确写法:用 URL.createObjectURL,避免上一行占位生成额外空 zip
  try { …new Blob([r.bytes])… a.click()… }
  catch (_) { ZipUtil.download(name, [{ name: 'project_meta.json', data: '空下载兜底:请重新打包' }]); }
  …两条 toast…
  return r;
}
```

`ZipUtil.download(filename, files)`(`js/ziputil.js` 第 96 行)不是"准备下载"也不是"取个句柄",
它自己就是一整条下载:`create(files)` → `new Blob` → `createElement('a')` → `a.click()`。
所以那一行落的是**一个完整的、已经到用户硬盘上的 zip 文件**,内容是 `create` 出来的最小合法 zip:
一个 local file header + 一个 central directory entry + EOCD,共 120 字节,条目名 `PLACEHOLDER`、长度 0。

紧跟的注释把这件事说得很清楚——它在描述"下面这段才是正确写法,它的存在就是为了不要上一行那个空 zip"。
两行合起来是一次**改到一半的编辑**:新写法补上了,旧写法没删。代码与注释在同一处互相打脸,
而两边说的是同一件事该怎么做,不是两种口径之争,故本槽按注释执行:删占位行,保留 blob 那段。

### 1.1 用户侧看到的

按一次按钮:

| 落地顺序 | 文件名 | 大小 | 解开是什么 |
|---|---|---|---|
| 第 1 个 | `交付包_剧_v3.zip` | 120 B | 一个空文件 `PLACEHOLDER` |
| 第 2 个 | `交付包_剧_v3 (1).zip` | 2277 B(本槽夹具实测) | 真交付包(videos/subtitles/storyboard/meta/README) |

同名、同后缀、同一秒落地,谁是真包只能靠大小或解开看。而 toast 只报一句
「交付包已下载:7 个文件,1/1 集成片」——**它报的是真包的口径,一个字都没提旁边那个空的**,
用户按大小挑错了也不会有任何提示。这一面在 `w145-browser-gate-catch.md` 第 7 节交接里提过打包路径
「失手被吞、回执照常报成功」的同类形态,那说的是分镜文件少了没人说,本槽这条是**多出来的那个没人说**。

## 2. 处置:删掉占位那一行

```js
const name = '交付包_' + safeName(p.name) + '_v' + (p.__ver || 0) + '.zip';
// 直接落 buildReleaseZip 已经打好的 bytes:再走一次 ZipUtil.download 等于另打一个包,用户会多收到一个 zip
try { …原样… }
```

只删一行、改一句注释,`try`/`catch` 两段与两条 toast 一个字未动。
注释换成说明"为什么不在这里调 `ZipUtil.download`",因为那才是下一个人真会犯的错
(`ZipUtil.download` 名字看着像"落地这个包",实际是"打一个新包并落地")。

`buildReleaseZip` 一个字没碰:打包清单、跳过统计、判旧警告、返回值的
`files`/`videosOK`/`videosSkipped`/`stale`/`size` 全部照旧,故 toast 文案与打版本那条路都不受影响。

## 3. 有意没动的:兜底那条 `catch`

`catch (_) { ZipUtil.download(name, [{ name: 'project_meta.json', data: '空下载兜底:请重新打包' }]); }`
本槽保留原样,只用一条用例把它现有的行为钉住(仍只落一个文件、包里只有那张说明、不冒充交付包)。
它有两处可议但都不是本槽这一面:

1. **兜底走的是同一套 API**。`Blob` 构造或 `createObjectURL` 真的不可用时,`ZipUtil.download` 里
   一模一样的两步同样不可用,兜底只在"第一次失败、第二次成功"这类偶发情形下真管用。
2. **它给的是一个能打开的 zip 而不是一句报错**。用户拿到一个叫「交付包_…zip」、解开只有一行
   「请重新打包」的文件,这与 `AGENTS.md`「失败如实报错,不用占位冒充」是同一类问题的弱化版。

两条都该收,但收法是改失败回执(报错 + 不落文件),与本槽"删掉一行多余的下载"不同源,
如实登记为仍欠,见第 6 节。

W149 的分镜失败留痕(`storyboardFailed` 之类)在本 HEAD 的 `js/release.js` 里**尚未合入**
(全仓零命中),故第 1 节那处 `_buildMaterialShim` 空 `catch` 与 zip 的失败记账本槽一律不碰,
不抢那一整包。

## 4. 用例与变异实测

两条用例都在 `release` 套件,共用新加的沙箱装配 `loadReleaseZip(urlFail)`:在既有 `loadRelease()`
之上注入 `TextEncoder`、记录用的 `Blob`/`URL`/`document.createElement`,再按 `index.html` 的方式
把**真的** `js/ziputil.js` 装进沙箱——落地的是真 zip 字节,断言逐条读 local file header 拿条目名
(`zipEntries`,STORE 无压缩故不必解压)。`urlFail` 让第 N 次 `createObjectURL` 抛错,用来走兜底那条路。

| 用例 | 钉住什么 |
|---|---|
| 一次打包只落一个文件 | `__clicks.length === 1`、文件名、落地 bytes 长度等于 `r.bytes`、7 条清单逐条相等、`r.files` 与落地条目数同口径、toast 那句 |
| 对象 URL 失败时走兜底 | 仍只落一个、文件名不变、包里只有 `project_meta.json` 那张说明、`r.files` 仍按真交付包报 |

变异逐条改回去跑 `node tests/unit.js release`,验完还原:

| 变异 | 结果 |
|---|---|
| 退回基线(占位那一行 + 那句注释) | 红 2 条:`用户到手的文件数:期望 1,实际 2` + 兜底那条 `createObjectURL 不可用`(占位那次下载先撞上失败,而它不在 `try` 里,整个调用直接抛出去) |
| 只把兜底那句 `catch` 掏空(`catch (_) {}`) | 红 1 条:只有第二条,`兜底不叠加下载:期望 1,实际 0` |
| 只把兜底包的条目换成 `PLACEHOLDER` 空条目 | 红 1 条:只有第二条,`兜底包只放那张"请重新打包"的说明:期望 "project_meta.json",实际 "PLACEHOLDER"` |
| 只把 blob 里的 `r.bytes` 换成另打的空包 | 红 1 条:只有第一条,`落地的就是 buildReleaseZip 那份 bytes:期望 2277,实际 120` |

后三行是两条用例的分工证明:兜底那条路坏了只红第二条、落地内容被掉包只红第一条,报错文案不混。
第一行两条同红是有意的——占位那一行同时破坏"只落一个"与"兜底那条路走得通",
两条各从自己那一面报出来,含义不重叠。

## 5. 数字(live 现取)

| | 本槽前 | 本槽后 |
|---|---|---|
| `tests/unit.js` 用例数 | 509 | **511**(release 套件 +2) |
| 单元测试 `FLOOR` / 主 README 明写数 | 509 | **511** |
| `tests/integration.js` | 130 | 未动(实跑 130/130 全绿) |
| 记账件份数 / 目录 README 明写数 / 记账件 `FLOOR` | 162 | **163**(含本文) |

`node tests/unit.js` 511/511、`node tests/integration.js` 130/130 全绿;
`node --check js/release.js` / `node --check tests/unit.js` 通过。
主 README 另两处按行为同步:回归测试段 `release.js` 那串加了「交付 ZIP 落地面」一句,
功能段「交付 ZIP 打包」那条补了 `downloadReleaseZip` 一次只落一个文件的说明。

## 6. 交接

1. **兜底那条 `catch` 仍欠**(第 3 节两点)。收它的人要一并判「失败时到底给不给文件」:
   本槽的用例钉的是**现有行为**(落一个只装说明的 zip),真改成"报错 + 不落文件"时那条用例要同轮改,
   这是有意的——它现在的作用是让这次改动变成一个要写理由的显式决定,而不是静默换掉。
2. **`buildReleaseZip` 里 `_buildMaterialShim` 那处空 `catch` 一行未碰**。抓分镜文件失手时
   `files` 少几条而 `summary` 不提、toast 照常报成功,`w145-browser-gate-catch.md` 第 7 节第 1 条
   已经登记过收法(往 `summary` 加一类)。本槽新加的第一条用例正好给它备好了取数口:
   落地清单是逐条比对的,少一条当场看得见。
3. **W149 的分镜失败留痕本 HEAD 上没有**。若后续把那一包合进来,注意它与本槽改的是同一个函数的
   不同段(它在 `buildReleaseZip` 的循环体,本槽在 `downloadReleaseZip` 的第一行),
   代码层面不重叠;要撞的是第一条用例里那份 7 条清单——加了失败留痕条目就得同轮改那个期望值。
4. **不摘任何 `gaps`**。`Skills` 的缺口表一个字未动(`js/release.js` 对 `Skills` 照旧零引用)。
