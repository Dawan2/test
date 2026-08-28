# W154 · 交付包下载的兜底 catch:落不下来时再落一次同一套 API,还给用户一个空壳包

一句话:`js/release.js` 的 `downloadReleaseZip` 用 `Blob` + `URL.createObjectURL` + `a.click()`
把打好的 zip 落到用户磁盘上,这一步外面兜着
`catch (_) { ZipUtil.download(name, [{ name: 'project_meta.json', data: '空下载兜底:请重新打包' }]); }`。
兜底走的是**同一套** `Blob` / `URL.createObjectURL` / `a.click()`——主路径落不下来它同样落不下来;
偶尔落得下来时,给用户的是一个名字仍叫「交付包_*.zip」、里面只装着一句「请重新打包」的空壳,
而且函数照常往下走,把「交付包已下载:N 个文件,M/K 集成片」这条绿色成功提示发出去。
**打包结果(`buildReleaseZip`)一个字没动**,改的是"落地这一步失败了怎么说":如实抛错,配两条变异能转红的用例。

## 1. 病灶:兜底与主路径是同一条路

改之前那段(`js/release.js`):

```js
try {
  const blob = new Blob([r.bytes], { type: 'application/zip' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 3000);
} catch (_) { ZipUtil.download(name, [{ name: 'project_meta.json', data: '空下载兜底:请重新打包' }]); }
if (window.U) U.toast(`交付包已下载:${r.files} 个文件,…`, 'success', 4000);
```

`ZipUtil.download` 在 `js/ziputil.js` 里就是这五行:

```js
function download(filename, files) {
  const bytes = create(files);
  const blob = new Blob([bytes], { type: 'application/zip' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 3000);
}
```

逐句对照可见:`create` 那一步不同(它现打一个只有一个条目的 zip),`Blob` 之后的四句
与 `try` 里那四句**逐字同形**。兜底能不能落地,取决的是与主路径完全相同的浏览器能力。
于是这个 `catch` 只有两种归宿:

- **主路径失败的真实成因是对象 URL / 锚点下载不可用**(隐私模式禁用 `createObjectURL`、
  沙箱 iframe 无 `allow-downloads`、扩展拦下 `a.click()`)——兜底当场抛第二个异常,
  从 `downloadReleaseZip` 里逃出去。这一路**结论恰好是对的**(交付弹窗的按钮 `catch` 住并报「打包失败」),
  但它对得很偶然:靠的是兜底自己也炸,而不是这段代码想说什么。
- **主路径失败的成因与浏览器能力无关**(`r.bytes` 是坏的、内存不够、`new Blob` 对超大 bytes 抛错)——
  兜底那份只有几十字节的空壳反而落得下来。用户磁盘上多出一个正常大小的
  `交付包_剧名_v3.zip`,双击能打开,里面一个 `project_meta.json`,内容是「空下载兜底:请重新打包」;
  紧接着屏幕上弹出绿色的「交付包已下载:7 个文件,1/1 集成片」。

第二种是本槽要收的那一面:**用户手里是空壳,而平台告诉他交付成功了**。
名字里带着项目名和版本号,时间戳也对得上——把它误当成交付物发给下游,发现不了。

### 1.1 那句兜底文案本身也不诚实

`{ name: 'project_meta.json', data: '空下载兜底:请重新打包' }`——条目名叫
`project_meta.json`,而真交付包里的 `project_meta.json` 是项目摘要 JSON(见 `buildReleaseZip`)。
兜底这份不是 JSON,是一句中文。任何按名字读这份包的程序(包括平台自己的导入路径)拿到的是解析错误,
而不是「这包是空的」。

### 1.2 用户能不能看见失败

只有一个调用点,在同文件的交付检查弹窗里:

```js
m.querySelector('[data-x=pack]').onclick = async () => {
  btn.disabled = true; btn.textContent = '打包中...';
  try { await downloadReleaseZip(p); }
  catch (e) { U.toast('打包失败:' + e.message, 'error'); }
  finally { btn.disabled = false; btn.textContent = '📦 打包交付 ZIP'; }
};
```

失败播报的通道**本来就在**,而且是对的写法。缺的是 `downloadReleaseZip` 那一头:
兜底不抛,这个 `catch` 就永远不进——按钮一路走完,UI 上只有那条绿色的「交付包已下载」。
所以本槽不需要新造任何提示通道,只需要让失败真的走到它面前。

## 2. 处置:落不下来就如实失败

```js
} catch (e) {
  /* 落地失败就如实失败:兜底再调 ZipUtil.download 是同一套 Blob/createObjectURL/a.click,
   * 这条路不通时那条路同样不通;万一通了,落的是个名字仍叫「交付包」、里面只有一句
   * 「请重新打包」的空壳 zip,用户还会接着收到下面那条「交付包已下载 N 个文件」的成功提示。 */
  throw new Error('交付包已打好,但浏览器下载没能落地:' + ((e && e.message) || e) + '(请重试打包,或换用其他浏览器)');
}
```

三个决定各有理由:

- **抛而不是 toast**。`downloadReleaseZip` 是模块出口(`window.Release` 上导出),
  在这里自己弹提示等于替所有调用方决定播报方式;抛出去让唯一那个调用点按它自己的写法报。
  抛还有一个副作用是想要的:后面那两条 toast(成功提示、判旧提醒)与 `return r` 一并不再执行,
  失败之后不会再有任何一句话说「已下载」。
- **带上原因**。`e.message` 原样带进去——「createObjectURL 不可用」和「内存不足」对用户是两件事,
  第二件重试有用,第一件得换浏览器。文案里两条出路都写上。
- **说清是哪一步**。「交付包已打好,但浏览器下载没能落地」——包确实打好了(`buildReleaseZip` 已经返回),
  失败的只是落盘。用户重试打包是有意义的,不是"这个项目打不了包"。

`buildReleaseZip`、两条 toast、`return r`、打包按钮那段一个字未改。

## 3. 为什么不给一个"真的能用"的兜底

想过三种,都不做:

| 候选兜底 | 为什么不做 |
|---|---|
| `data:` URL + `a.click()` | 交付包动辄几十上百 MB(里面是 mp4),`data:` URL 有长度上限且要多一次 base64 全量编码;能落的场景恰好是包最小的场景 |
| 新开窗口 / `window.open` | 弹窗拦截比下载拦截更常见,换来的是第二种失败模式而不是可用性 |
| 把 bytes 存起来让用户"稍后重试" | 那是个新功能(要一个暂存区与一个重试入口),不是本槽这一面;真要做也不该藏在一个 `catch` 里 |

主路径失败是**环境级**的(浏览器不让这个页面落文件),不是"换个 API 就绕过去"的那种失败。
这一格上诚实比兜底值钱:告诉用户失败了、给出原因与两条出路,比塞给他一个能打开的空壳强。

## 4. 变异实测

改完逐条改回去跑 `node tests/unit.js release`(23 条),验完还原(`git diff` 只剩本槽改动):

| 变异 | 结果 |
|---|---|
| 整段退回基线(`catch (_) { ZipUtil.download(name, [{name:'project_meta.json',…}]) }`) | 红 2 条:`落地失败必须抛出去,不许静默兜底` + `按钮必须把失败播报出来:["交付包已下载:6 个文件,0/1 集成片(1 跳过)"]` |
| 静默吞掉(`catch (e) {}`) | 红 2 条,同上两条 |
| 抛错但不说是哪一步、不带原因(`throw new Error('打包出错')`) | 红 1 条:`报错要说清是下载这一步没落地并带上原因:打包出错` |
| 又抛错、又顺手落一份空壳包 | 红 2 条,都报文件数:`期望 0,实际 1`(第一条落在 `用户到手 0 个文件`,第二条落在 `报了失败就不该有文件落地`) |
| 只 `U.toast('下载失败','error')` 不抛 | 红 2 条:第一条报没抛;第二条报 toast 列表是 `["下载失败","交付包已下载:6 个文件,…"]`——失败与成功同屏 |

第三行与第四行是两条用例的**分工证明**:第三行只动文案,只有钉报错内容的那条红;
第四行文案对而多落了一个文件,两条都红在文件数上。
第五行专门拦"看起来报了错、其实没拦住后面那条成功提示"这一手。

## 5. 两条用例

都在 `tests/unit.js` 的 `release` 套件,共用新装配 `loadReleaseZip(urlFail)`——
把真 `js/ziputil.js` 装进沙箱,补 `Blob` / `URL` / `document.createElement` 三个最小桩,
`__clicks` 逐次记下"用户到手了什么文件、里面装的是什么";`urlFail` 让第 N 次
`URL.createObjectURL` 抛错(本槽两条都传 1,即主路径那次就抛)。

1. **`downloadReleaseZip` 那一层**:必须抛(基线在这里改落一个空壳并当成功返回)、
   报错要点名是下载这一步且带上原因、`__clicks` 为 0(主路径落不下来时用户不该再收到任何文件)、
   toast 列表里不许出现「交付包已下载」。
2. **打包按钮那一层**(真跑 `Release.openModal`,`U.openModal` 桩接住 `onMount` 并驱动
   `[data-x=pack]` 的 `onclick`):toast 以「打包失败:」开头、同屏不许有「交付包已下载」、
   `__clicks` 仍为 0、按钮 `disabled` 恢复 `false` 且文案回到「📦 打包交付 ZIP」(能重试)。

第二条是本槽头一回在单测里真跑交付检查弹窗的挂载与按钮点击(此前 `release` 套件只测到模块出口层)。

## 6. 本槽没做的事

- **不加回那行占位空 zip**。基线 `downloadReleaseZip` 开头还留着
  `ZipUtil.download(name, [{ name: 'PLACEHOLDER', data: '' }])`,是一次改到一半的编辑
  (紧跟的下一行注释本就写着「避免上一行占位生成额外空 zip」),本槽同轮删掉、注释换成
  "为什么不在这里调 `ZipUtil.download`"。这一手与 W152(分支 `cursor/w152-empty-zip-d529`)
  逐字同 diff,合入时按同一处删除收敛即可,**不要因为撞了就把那一行留回来**。
  那一面(用户每次实得两个文件、其中一个是空的)由 W152 记账,本文不重复。
- **不动 `_buildMaterialShim` 那处空 catch**。`buildReleaseZip` 里抓分镜文件那处
  `catch (_) {}` 失手时 `files` 少几个文件而 `summary` 不提,形态与本槽同类(失手被吞、回执照常报成功),
  但它坏的是**包的内容**不是**落地这一步**,收法是往 `summary` 加一类而不是抛错。
  W145 交接第 1 条已点过它,本槽一行未碰,**如实登记为仍欠**。
- **不动 `storyboardFailed` 那条**(W149 在收),本槽与它零重叠。
- **不改打包结果**。`buildReleaseZip` 的清单、`summary` 三格、`r.files`/`videosOK`/`stale` 与
  两条 toast 的文案逐字未动;`release` 套件既有 21 条全绿。
- **不摘任何 `gaps`**。`Skills` 的缺口表一个字未动(`js/release.js` 对 `Skills` 照旧零引用)。

## 7. 数字(live 现取)

| | 本槽前 | 本槽后 |
|---|---|---|
| `tests/unit.js` 用例数 | 509 | **511**(`release` 套件 21 → 23) |
| 单元测试 `FLOOR` / 主 README 明写数 | 509 | **511** |
| `tests/integration.js` | 130 | 未动(实跑 130/130 全绿) |
| 记账件份数 / 目录 README 明写数 / 记账件 `FLOOR` | 162 | **163**(含本文) |

`node tests/unit.js` 511/511、`node tests/integration.js` 130/130 全绿;
`node --check js/release.js` / `node --check tests/unit.js` 通过。
`tests/cli.smoke.js` 本槽未跑(改动全在浏览器侧 `js/release.js` 与单测,CLI 无 `downloadReleaseZip` 这条路径)。

## 8. 交接

1. **打包这条链上还有一处"失手被吞、回执照常报成功"**:`_buildMaterialShim` 那个空 catch(第 6 节)。
   它与本槽形态同类但落点不同——本槽收的是"包落不落得下来",它坏的是"包里少了几集分镜表",
   而 `r.files` 是按 `files.length` 现数的,少了就少了,toast 报的数还是对的,
   只有对着分集数才看得出来。收法得往 `summary` 加一类(与 `skipped`/`stale` 同层)。
2. **`ZipUtil.download` 现在只有 `js/exporter.js` 两个调用点**(素材导出、任务产物下载)。
   那两处没有第二条落地路径可退,失手时同样是静默的——如果要按本槽同一条纪律收,
   得先确认那两处的调用方有没有接住异常的地方(本槽没查,不写成结论)。
3. **本槽给 `release` 套件开了"真跑弹窗"这条路**(第 5 节第二条)。
   `U.openModal` 桩 + `querySelector` 记忆化节点这套装配可以直接复用到同文件其它按钮
   (打版本、回滚、门 fix 一键处置),那几条目前只测到模块出口层。
