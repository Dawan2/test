/* ============ storyboard.js 分集制作: AI分镜师 / 智能分镜 / 分镜创作 ============
 * 拆分边界(批次 D):CSV 导入导出 / 本地与资产导入 / 剪映导出桥接 / 预览播放器 openPlayer /
 * 合成 composeVideo+doCompose 已移入 js/sb-io.js(storyboard.js 之后加载,经 window.SB 桥接)。
 * 拆分边界(批次 E):四视图中栏/右栏 HTML 与绑定移入 js/sb-views.js(window.SBViews),
 * 视频生成链路移入 js/sb-gen.js(window.SBGen);均在 storyboard.js 之后、sb-io.js 之前加载,
 * 共享常量/辅助经 window.SB 解构,交叉调用运行时经 window.SBViews/window.SBGen 解析。 */
(function () {

  window.Views = window.Views || {};

  const VOICES = Voice.NARRATOR_PRESETS; // R4:voice.js 为唯一来源(加载顺序 voice.js 在前)
  const CAMERAS = WfCore.CAMERAS; // 二十一轮:单一来源下沉 wf-core.js(双端共享),此处委托保持 window.CAMERAS 出口不变
  const SB_MODELS = ['AI分镜师·旗舰', 'AI分镜师·标准', 'StoryMind-Pro', 'ShotGPT-5'];
  const TRANSITIONS = ['淡入淡出', '叠化', '匹配剪辑', '甩镜', '黑场', '闪白', '闪黑', '推拉转场', '旋转转场'];
  /* 分镜拆解硬规则(叙事细化/五层景别推进/信息密度控制,注入拆镜类 prompt):
   * 单一来源已下沉 wf-core.js(双端共享),此处委托保持 window.SB.SPLIT_RULES 出口不变 */
  const SPLIT_RULES = WfCore.SPLIT_RULES;

  /* 分镜视频提示词五段式标准结构(哆咪方法论,注入拆镜/润色类 prompt):
   * 风格氛围 + 场景环境 + 镜头运动 + 分镜内容 + 负面提示词;单一来源 wf-core.js */
  const PROMPT5 = WfCore.PROMPT5;
  /* 五段式段落定义(编辑面板结构化编辑器与 LLM 注入共用) */
  const PROMPT5_SECS = [
    { k: 'style', t: '1.风格氛围', h: '影视风格、色调、画质、年代感、情绪基调' },
    { k: 'scene', t: '2.场景环境', h: '时间、地点、天气、光线、背景元素、空间氛围' },
    { k: 'camera', t: '3.镜头运动', h: '景别、运镜方式、运动速度、视角、焦距效果' },
    { k: 'content', t: '4.分镜内容', h: '剧本中人物动作、表情以及台词' },
    { k: 'neg', t: '5.负面提示词', h: '如禁止出现 BGM、字幕、水印等' },
  ];

  /* ---- 存量重复镜头 id 去重(浏览器这一端的入口,与 CLI shots-dedupe 同一套规则) ----
   * 规则本身(首行留原 id、后面每处撞车各发一个新 id)只在 Domain.dupIdScan 一份,
   * 这里注入的只有浏览器那一端的发号器(Store.uid,前缀对齐新建镜头)与镜头侧的单位词(行);
   * 纯扫描不改任何字段,落库由调用方按 plan 逐条写。 */
  function dedupeShotScan(shots) {
    const scan = Domain.dupIdScan(shots, taken => {
      let nid;
      do { nid = Store.uid('sh'); } while (taken.has(nid));
      return nid;
    });
    return Object.assign({}, scan, { duplicates: scan.duplicates.map(d => ({ id: d.id, rows: d.n, keepOrder: d.keepOrder })) });
  }
  /* 旧审片报告的行对位在去重后会不会塌:同一份 Domain.reviewRows 在「当下这棵表」与「按计划改过 id 的表」
   * 上各跑一遍,落行不同的那几条就是去重后会退回首行的 perShot 条目。
   * 整集审片是按行出条目的(同 id 有几行就有几条),行对位靠「第几条同 id = 第几行同 id」;
   * 同 id 只剩一行之后那套序数就数不出后几行了。本入口只把这个数报给用户,一个字不改报告。 */
  function reviewCollapseCnt(ep, plan) {
    if (!ep.lastReview || !plan.length) return 0;
    const after = ep.shots.map(s => ({ id: s.id }));
    plan.forEach(x => { after[x.order].id = x.to; });
    const now = Domain.reviewRows(ep).map(t => t.i);
    const post = Domain.reviewRows({ shots: after, lastReview: ep.lastReview }).map(t => t.i);
    return now.filter((i, k) => i !== post[k]).length;
  }
  /* 去重弹窗:开弹窗只预览(算出计划,一个字不写库),按下确认那一下才落库——与 CLI 的 dry-run / --apply 两档同形。
   * 落库前按当下那棵树重算一遍(计划以真要写的这一份为准,新 id 现发,故预览里那批只是示意值)。
   * 一行不删(同 id 那几行各有各的画面与提示词,而单镜删除按 id 匹配会把它们一并删光),内容一个字不动。
   * 引用面按 id 解析的那几处一律落到首行,而首行留的就是原 id:当前选中镜(ep.uiSel)去重前后是同一行;
   * 镜头组的归属记在镜头行自己的 groupId 上、指的是组 id 不是镜头 id,改镜头 id 碰不到它。
   * 只有 ep.lastReview.perShot 那份旧报告例外(它按行出条目、行对位靠同 id 的序数),
   * 会塌几条现算现报在预览里——本槽只报不改,审片合入照旧。
   * 纯改分镜表、零上游零 LLM,不经 Tasks.run、不扣一分钱。 */
  function openShotDedupe(p, ep, main) {
    const shots = ep.shots || [];
    const pre = dedupeShotScan(shots);
    const collapse = reviewCollapseCnt(ep, pre.plan);
    const rowOf = i => `第 ${i + 1} 镜「${U.esc((shots[i] || {}).name || (shots[i] || {}).plot || '未命名')}」`;
    U.openModal({
      title: '🧹 镜头 id 去重',
      wide: true,
      body: `
      <div class="hint" style="margin:0 0 10px">本集共 ${shots.length} 镜,其中 ${pre.plan.length} 行与在前的行共用同一个 id(整树导入/恢复容易留下这种重复)。
        按 id 取镜的地方只找得到首行、后面几行结构性够不着,而批量生成按行逐行跑、逐行计费——同一个 id 存几行就收几笔视频钱。
        去重只改 id:首行留原 id、撞车行各改发一个新 id,<b>一行不删、画面与提示词一个字不动</b>。
        要"少几行"仍请自己删(删除按 id 匹配,同 id 那几行会一并删光,先想清留哪一行)。</div>
      ${pre.duplicates.map(d => `
      <div class="card row" style="padding:8px 12px;gap:8px;align-items:center;flex-wrap:wrap;margin-bottom:6px">
        <span class="tag yellow">${U.esc(d.id)}</span>
        <b class="small">${d.rows} 行</b>
        <span class="small muted grow">留 ${rowOf(d.keepOrder)} 的原 id,其余各发新 id</span>
      </div>`).join('')}
      <div class="small" style="margin:10px 0 6px"><b>改名计划(${pre.plan.length} 行)</b></div>
      <div style="max-height:34vh;overflow:auto;display:flex;flex-direction:column;gap:6px">
        ${pre.plan.map(x => `
        <div class="row small" style="gap:8px;align-items:center;flex-wrap:wrap">
          <span style="min-width:170px">${rowOf(x.order)}</span>
          <span class="tag">${U.esc(x.from)}</span>
          <span class="muted">→</span>
          <span class="tag green">${U.esc(x.to)}</span>
        </div>`).join('')}
      </div>
      <div class="hint" style="margin:10px 0 0">引用面:当前选中镜、按 id 取镜的那几处都按首行解析,而首行留的就是原 id,去重前后落到同一行;
        镜头组的归属记在镜头行自己身上(指的是组 id、不是镜头 id),一处都不用改。</div>
      ${collapse ? `<div class="hint" style="margin:8px 0 0;border-color:var(--yellow);color:var(--yellow)">⚠ 本集那份整集审片报告有 ${collapse} 条逐镜结论现在落在首行之外的行上:
        它按行出条目、行对位靠"第几条同 id = 第几行同 id",同 id 只剩一行之后这 ${collapse} 条会一起退回首行——
        整集报告上的镜号与按低分派生的重抽名单都跟着按首行算。去重不动这份报告(只改 id);要让逐行结论回位,去重后重跑一次整集审片(按当下这棵表重新出条目)。</div>` : ''}
      <div class="hint" style="margin:8px 0 0">这一屏还没写库。新 id 在按下确认那一下现发,与上面这批示意值不是同一批;哪几行改、哪一行留原 id 是定的。</div>`,
      footer: `<button class="btn" data-x="cancel">取消</button><button class="btn primary" data-x="apply">✓ 确认去重(改 ${pre.plan.length} 行的 id)</button>`,
      onMount(m, close) {
        m.querySelector('[data-x=cancel]').onclick = close;
        m.querySelector('[data-x=apply]').onclick = () => {
          const scan = dedupeShotScan(ep.shots || []);
          if (!scan.plan.length) { close(); return U.toast('本集分镜表里已经没有重复的镜头 id 了', 'info'); }
          scan.plan.forEach(x => { ep.shots[x.order].id = x.to; });
          Store.save(); close();
          U.toast(`已为 ${scan.plan.length} 镜改发新 id(首行留原 id,一行没删、画面与提示词没动)`, 'success', 4000);
          Views.episode(main, p.id, ep.id);
        };
      },
    });
  }

  /* ================= 分集工作区(三栏布局,对齐 3.png) ================= */
  Views.episode = function (main, pid, eid) {
    const p = Store.getProject(pid);
    const ep = p && p.episodes.find(e => e.id === eid);
    if (!ep) { location.hash = '#/project/' + pid; return; }
    if (!ep.shots) ep.shots = [];
    // 视图模式全局化(修复"换集丢视图"一类问题):当前浏览模式存 settings.epViewMode,任意入口切集都保持
    // 两种生成模式两个独立页面(分集卡片双入口):分镜表族=分镜脚本/分镜视频(+剪辑台经流程条进入);节拍板族=节拍板/镜头组
    const prodMode = (p.shell && p.shell.prodMode) || '分镜表'; // 仅「一键跑批」项目用于显示跑批中心入口
    const st0 = Store.state.settings = Store.state.settings || {};
    if (window.__epView) { st0.epViewMode = window.__epView; window.__epView = null; Store.save(); }
    if (!['board', 'shots', 'cut', 'bb', 'groups'].includes(st0.epViewMode)) st0.epViewMode = ep.boardMode ? 'board' : 'shots'; // 首次:兼容旧的集级标记
    const vm = st0.epViewMode;
    ep.boardMode = vm === 'board';
    ep.bbMode = vm === 'bb';
    // M8 修复:字段级迁移(旧分集缺新字段时补默认,而不是整体跳过)
    ep.sbConfig = Object.assign(defaultSBConfig(p), ep.sbConfig || {});
    if (!ep.uiSel || !ep.shots.some(s => s.id === ep.uiSel)) ep.uiSel = ep.shots[0] ? ep.shots[0].id : null;
    const sel = ep.shots.find(s => s.id === ep.uiSel) || null;
    const selIdx = sel ? ep.shots.indexOf(sel) : -1;
    // 视图规则:分镜脚本/分镜视频/节拍板/镜头组四视图由 tab 行切换;分镜视频下无分镜时给空态引导
    const showBoard = vm === 'board';
    const sm = window.__selMode;
    const doneCnt = ep.shots.filter(s => s.video && Store.shotVideoReady(s)).length;
    const uncfmCnt = ep.shots.filter(s => !s.confirm).length; // 镜头确认闸:待确认计数(confirm!==true 即未确认)
    // 跨集尾帧继承生效态:开关打开 + 上一集有末镜尾帧 + 本集第一镜未手动设首帧
    const prevTail = prevEpTail(p, ep);
    const f0 = ep.shots[0];
    const inheritPrevOn = !!(ep.sbConfig.inheritPrevEp && prevTail && f0 && (!f0.firstFrame || f0.__inheritPrevEp));
    /* 存量重复镜头 id 的入口:同 id 多行在分镜表里与两个不同镜头长得一样,故只在表里真有重复时露出来并报出行数。
     * 挂在集级顶栏这一行(四视图与剪辑台共用它),故只此一处四视图都看得见——各视图自己那个中栏头部不用再挂。
     * 整页只扫一遍分镜表:顶栏这个数与分镜卡片上那几枚「第几行 / 共几行」小标同读这一份扫描,
     * 逐行位次由 Domain.dupIdMarks 从它现派生(页面不再扫第二遍,也不再自己数一遍谁是首行);
     * 顶栏数的是要改几行(首行不算),卡片标的是撞了 id 的每一行。
     * 按钮上那句说明与四屏那几枚角标同一份模板(Domain.dupCopy),这一层只注入引用面与"点开就是计划"这一段。 */
    const dupScan = dedupeShotScan(ep.shots);
    const dupRows = dupScan.plan.length;
    const dupMarks = Domain.dupIdMarks(dupScan);
    const dupNote = Domain.dupCopy({
      shape: 'count', unit: '行', n: dupRows, scope: '本集',
      cta: ';点开' + Domain.dupGateNote('行'),
    }).title;
    const dedupeBtn = dupRows ? `<button class="btn sm" data-x="shotdedupe" title="${U.esc(dupNote)}">🧹 镜头 id 去重(${dupRows})</button>` : '';

    main.innerHTML = `
    <div class="page" style="max-width:none">
      <div class="row" style="margin-bottom:10px;gap:8px;flex-wrap:wrap">
        <button class="btn ghost sm" onclick="location.hash='#/project/${p.id}'">‹</button>
        ${prodMode === '一键跑批' ? `<span class="tag cyan" style="flex:none;align-self:center" title="一键跑批项目:Agent 全自动量产">🏭 一键跑批</span><button class="btn sm ghost" data-x="goproduce" style="flex:none" title="Agent 全自动跑批中心">跑批中心 ›</button>` : ''}
        <span class="grow"></span>
        <button class="btn sm primary" data-x="dd-sb" title="一键智能拆镜(含本集理解前置;可在参数配置开启「生成后自动评审修订」)">🧠 智能分镜</button>
        ${(ep.sbPlans || []).length > 1 ? `<button class="btn sm" data-x="sb-plans" title="上次智能分镜的 ${ep.sbPlans.length} 套候选拆镜方案,可重新对比并切换采用">🆚 方案对比(${ep.sbPlans.length})</button>` : ''}
        ${(ep.shotHistory || []).length ? `<button class="btn sm" data-x="sb-his" title="分镜表版本历史:整表覆盖前自动留档(近 ${ep.shotHistory.length} 版),可预览与回滚">🕘 历史(${ep.shotHistory.length})</button>` : ''}
        ${dedupeBtn}
        <button class="btn sm" data-x="quickedit" title="抽屉批量修改剧情/运镜">✏ 快速编辑</button>
        <button class="btn sm" data-x="genv" title="批量生成视频(每镜 5 积分)">🎬 生成视频</button>
        <button class="btn sm" data-x="epreview" title="全镜 AI 审片(每镜 5 积分)">🎬 整集审片</button>
        <button class="btn sm primary" data-x="compose" title="合成本集已出片镜头为成片">🎞 合成成片</button>
        <span class="grow"></span>
        <button class="btn sm" data-x="sb-config" title="分镜参数配置(开关/分镜数/审片/旁白音色)">⚙ 参数配置</button>
        <div class="dd">
          <button class="btn sm" data-x="dd-layout">🖥 显示方式 ▾</button>
          <div class="dd-menu" data-ddm="layout" style="display:none">
            <button data-lay="strip">🎞 时间轴<span class="small muted" style="display:block;font-weight:400">大屏在上,分镜横排在下</span></button>
            <button data-lay="column">📰 数列式<span class="small muted" style="display:block;font-weight:400">分镜竖排在左,大屏在右</span></button>
          </div>
        </div>
        ${vm === 'shots' ? `<div class="dd">
          <button class="btn sm" data-x="dd-batch">☑ 批量 ▾</button>
          <div class="dd-menu" data-ddm="batch" style="display:none">
            <button data-bop="final">🚩 定为终稿<span class="small muted" style="display:block;font-weight:400">锁定选中镜头,防误改(点缩略图「终稿」徽标解锁)</span></button>
            <button data-bop="keyframe">🖼 选帧入库<span class="small muted" style="display:block;font-weight:400">抽帧保存到资产库·关键帧</span></button>
            <button data-bop="hd">🔍 智能超清<span class="small muted" style="display:block;font-weight:400">批量视频超分(2K/4K)</span></button>
            <button data-bop="erase">🧹 字幕擦除<span class="small muted" style="display:block;font-weight:400">批量擦除对白/全局字幕</span></button>
            <button data-bop="review">🧐 一键审片<span class="small muted" style="display:block;font-weight:400">选中镜头批量 AI 评审</span></button>
          </div>
        </div>` : ''}
        <div class="dd">
          <button class="btn sm" data-x="dd-io">⇅ 导入/导出 ▾</button>
          <div class="dd-menu" data-ddm="io" style="display:none;left:auto;right:0">
            <button data-io="implocal">⬆ 本地上传<span class="small muted" style="display:block;font-weight:400">本地上传导入分镜</span></button>
            <button data-io="impassets">🗂 资产库导入<span class="small muted" style="display:block;font-weight:400">从资产库导入分镜</span></button>
            <button data-io="csvd">⬇ 下载CSV<span class="small muted" style="display:block;font-weight:400">下载分镜表 CSV</span></button>
            <button data-io="csvu">⬆ 上传CSV<span class="small muted" style="display:block;font-weight:400">上传分镜表 CSV</span></button>
          </div>
        </div>
      </div>

      ${window.Pipeline ? (() => {
        const nx = Pipeline.nextForEp(p, ep);
        const pv = Pipeline.prevForEp(p, ep);
        return `<div class="row" style="margin-bottom:8px;gap:8px;align-items:center;flex-wrap:wrap">
          ${Pipeline.html(p, { center: false, style: 'margin:0' })}
        </div>
      <div class="card" style="margin-bottom:8px;padding:8px 14px;display:flex;gap:8px;align-items:center;flex-wrap:wrap;border-color:var(--accent)">
        <span class="grow"></span>
        <span class="tag">${ep.shots.length} 镜</span>
        ${doneCnt ? `<span class="tag green">✓ 已出片 ${doneCnt}</span>` : ''}
        ${ep.shots.length ? `<span class="tag ${uncfmCnt ? 'yellow' : 'green'}" title="镜头确认闸:批量生成视频前须逐镜确认剧情与提示词">待确认 ${uncfmCnt}/${ep.shots.length}</span>` : ''}
        ${uncfmCnt ? '<button class="btn sm ghost" data-x="confirmall" style="padding:2px 10px" title="把本集全部镜头标记为已确认">✓ 全部确认</button>' : ''}
        ${inheritPrevOn ? '<span class="tag cyan" title="第一镜首帧自动续接上一集末镜尾帧,保持跨集画面连贯">🔗 续接上集</span>' : ''}
        ${Store.shotsStale(ep) ? '<span class="tag yellow" title="源剧本在拆镜后已修改,当前分镜对应旧版剧本;重新智能分镜/拆镜后恢复">剧本已修改·分镜待更新</span>' : ''}
        ${Store.understandingStale(ep) ? '<span class="tag yellow" title="源剧本在生成理解后已修改,当前理解对应旧版剧本">理解为旧版</span>' : ''}
        ${Store.epComposedReady(ep) ? `<span class="tag green">✓ 已出成片${ep.composedVia === 'shots' ? '·分镜表' : ep.composedVia === 'beats' ? '·节拍板' : ''}${Store.composedStaleByScript(ep) ? '<span title="源剧本在合成后已修改,建议重新合成"> · 剧本已改</span>' : ''}</span>` : (ep.composedUrl ? '<span class="tag yellow" title="合成输入已变化,重新合成后恢复">成片待更新</span>' : '')}
        ${ep.lastReview ? (() => { const stale = (ep.lastReview.perShot || []).some(ps => { const sh = (ep.shots || []).find(x => x.id === ps.shotId); return ps.videoInputHash && sh && sh.video && sh.video.inputHash && ps.videoInputHash !== sh.video.inputHash; }) || Store.reviewStaleByScript(ep); return `<span class="tag ${stale ? 'yellow' : 'green'}" data-x="lastreview" style="cursor:pointer" title="${stale ? '有镜头在审片后重新生成或源剧本已修改,均分为旧版结论' : '点击查看整集审片报告'}">整集均分 ${ep.lastReview.avg}${stale ? ' · 旧版' : ''}</span>`; })() : ''}
        ${pv ? `<button class="btn sm" data-x="prevstep" style="padding:3px 14px">${pv.txt}</button>` : ''}
        <button class="btn sm primary" data-x="nextstep" style="padding:3px 14px">${nx.txt}</button>
      </div>`;
      })() : `
      <div class="card" style="margin-bottom:8px;padding:8px 14px;display:flex;gap:8px;align-items:center;flex-wrap:wrap;border-color:var(--accent)">
        <span class="tag">${ep.shots.length} 镜</span>
        ${doneCnt ? `<span class="tag green">✓ 已出片 ${doneCnt}</span>` : ''}
        ${ep.shots.length ? `<span class="tag ${uncfmCnt ? 'yellow' : 'green'}" title="镜头确认闸:批量生成视频前须逐镜确认剧情与提示词">待确认 ${uncfmCnt}/${ep.shots.length}</span>` : ''}
        ${uncfmCnt ? '<button class="btn sm ghost" data-x="confirmall" style="padding:2px 10px" title="把本集全部镜头标记为已确认">✓ 全部确认</button>' : ''}
        ${inheritPrevOn ? '<span class="tag cyan" title="第一镜首帧自动续接上一集末镜尾帧,保持跨集画面连贯">🔗 续接上集</span>' : ''}
        ${Store.shotsStale(ep) ? '<span class="tag yellow" title="源剧本在拆镜后已修改,当前分镜对应旧版剧本;重新智能分镜/拆镜后恢复">剧本已修改·分镜待更新</span>' : ''}
        ${Store.understandingStale(ep) ? '<span class="tag yellow" title="源剧本在生成理解后已修改,当前理解对应旧版剧本">理解为旧版</span>' : ''}
        ${Store.epComposedReady(ep) ? `<span class="tag green">✓ 已出成片${ep.composedVia === 'shots' ? '·分镜表' : ep.composedVia === 'beats' ? '·节拍板' : ''}${Store.composedStaleByScript(ep) ? '<span title="源剧本在合成后已修改,建议重新合成"> · 剧本已改</span>' : ''}</span>` : (ep.composedUrl ? '<span class="tag yellow" title="合成输入已变化,重新合成后恢复">成片待更新</span>' : '')}
        ${ep.lastReview ? (() => { const stale = (ep.lastReview.perShot || []).some(ps => { const sh = (ep.shots || []).find(x => x.id === ps.shotId); return ps.videoInputHash && sh && sh.video && sh.video.inputHash && ps.videoInputHash !== sh.video.inputHash; }) || Store.reviewStaleByScript(ep); return `<span class="tag ${stale ? 'yellow' : 'green'}" data-x="lastreview" style="cursor:pointer" title="${stale ? '有镜头在审片后重新生成或源剧本已修改,均分为旧版结论' : '点击查看整集审片报告'}">整集均分 ${ep.lastReview.avg}${stale ? ' · 旧版' : ''}</span>`; })() : ''}
      </div>`}

      ${sm ? `
      <div class="card" style="margin-bottom:10px;padding:6px 14px">
        <div class="sel-bar">
          <b>${BatchOps.OPS[sm.op]} - 请选择视频</b>
          <button class="btn sm" data-x="selall">全选未出片</button>
          <span class="grow"></span>
          <span class="small muted">已选 ${sm.selected.size} 个</span>
          <button class="btn sm" data-x="selcancel">✕ 取消</button>
          <button class="btn sm primary" data-x="selconfirm" ${sm.selected.size ? '' : 'disabled'}>确认(${sm.selected.size})</button>
        </div>
      </div>` : ''}

      <div class="ws-body">
        <div class="ws-left">
          <div class="row" style="margin-bottom:10px;gap:6px;align-items:center">
            <div class="tabs" style="margin:0;flex:none">
              <div class="tab ${ep.leftTab === '分集' ? 'active' : ''}" data-ltab="分集">分集</div>
              <div class="tab ${(ep.leftTab || '内容') === '内容' ? 'active' : ''}" data-ltab="内容">内容</div>
            </div>
            <span class="grow"></span>
            <select class="select small" data-x="epswitch" title="切换分集" style="width:auto;max-width:52%;font-weight:700;padding:4px 6px">
              ${p.episodes.map(e => `<option value="${e.id}" ${e.id === ep.id ? 'selected' : ''}>${U.esc(e.title)} · ${(e.shots || []).length}镜</option>`).join('')}
            </select>
          </div>
          <div class="ws-left-body">
            ${(ep.leftTab || '内容') === '内容' ? leftContentHTML(p, ep) : leftEpisodesHTML(p, ep)}
          </div>
        </div>

        <div class="ws-center">
          <div class="tabs" style="margin-bottom:8px">
            ${(vm === 'bb' || vm === 'groups') ? `
            <div class="tab ${vm === 'bb' ? 'active' : ''}" data-vtab="bb">🥁 节拍板</div>
            <div class="tab ${vm === 'groups' ? 'active' : ''}" data-vtab="groups">🗂 镜头组</div>` : `
            <div class="tab ${vm === 'board' ? 'active' : ''}" data-vtab="board">📋 分镜脚本</div>
            <div class="tab ${vm === 'shots' ? 'active' : ''}" data-vtab="shots">🎞 分镜视频</div>`}
          </div>
          ${vm === 'bb' ? '<div data-bbview></div>' : vm === 'groups' ? '<div data-sgview></div>' : showBoard ? SB.scriptBoardHTML(p, ep) : sel ? (vm === 'cut' ? SBViews.cutHTML(p, ep, sel, selIdx, doneCnt, dupMarks) : SBViews.centerHTML(p, ep, sel, selIdx, doneCnt, dupMarks)) : `
          <div class="empty" style="padding-top:80px"><div class="ico">🎬</div>
            <p>本集还没有分镜。</p>
            <div class="row" style="justify-content:center;gap:8px;margin-top:12px">
              <button class="btn sm primary" data-x="goscript">📋 去分镜脚本创作</button>
              <button class="btn sm" data-x="gosb">🧠 直接生成分镜</button>
            </div>
          </div>`}
        </div>

        ${(vm === 'shots' || vm === 'cut') && sel ? `<div class="ws-right">${vm === 'cut' ? SBViews.cutRightHTML(p, ep, sel, selIdx) : SBViews.rightHTML(p, ep, sel, selIdx)}</div>` : ''}
      </div>
    </div>`;

    /* ---- 顶部按钮 ---- */
    // 视图模式切换:写入全局偏好(settings.epViewMode),任意入口换集都保持
    const setViewMode = vm => {
      Store.state.settings = Store.state.settings || {};
      Store.state.settings.epViewMode = vm;
      Store.save();
      Views.episode(main, p.id, ep.id);
      if (window.Agent && Agent.refreshGlobal) Agent.refreshGlobal();
    };
    // 一键跑批项目保留跑批中心入口(其余项目四种视图在工作区 tab 行自由切换)
    const goprod = main.querySelector('[data-x=goproduce]');
    if (goprod) goprod.onclick = () => { location.hash = '#/project/' + p.id + '/produce'; };
    // 集名下拉:切换到任意分集,视图模式由全局偏好自动保持
    main.querySelector('[data-x=epswitch]').onchange = e => { location.hash = `#/project/${p.id}/episode/${e.target.value}`; };
    // 空分镜的生成台引导
    const goscript = main.querySelector('[data-x=goscript]');
    if (goscript) goscript.onclick = () => setViewMode('board');
    const gosb = main.querySelector('[data-x=gosb]');
    if (gosb) gosb.onclick = () => { const t = main.querySelector('[data-x=dd-sb]'); if (t) t.click(); };
    // 创作主线:步骤点击跳转 + 上一步/下一步直接执行
    if (window.Pipeline) {
      Pipeline.bind(main, p);
      // 「分镜」步骤名按入口族显示:分镜表族→分镜表,节拍板族→节拍板(点击进对应页面)
      const bbFamily = vm === 'bb' || vm === 'groups';
      const shotsStep = main.querySelector('[data-step="shots"]');
      if (shotsStep) shotsStep.textContent = (shotsStep.textContent.trim().startsWith('✓') ? '✓ ' : '') + (bbFamily ? '节拍板' : '分镜表');
      // 工作区步骤条点击语义:分镜表/节拍板→对应族页面,剪辑→剪辑台,剧本/主体/分集/成片→回项目页对应 tab
      main.querySelectorAll('[data-step]').forEach(t => t.onclick = () => {
        const k = t.dataset.step;
        if (k === 'shots') return setViewMode(bbFamily ? 'bb' : 'board');
        if (k === 'gen') return setViewMode('cut'); // 「剪辑」步骤进剪辑台
        if (k === 'review') return Review.openEpisodeReview(p, ep, main); // 「审片」步骤开整集审片(成本确认在面板内)
        window.__projTab = { prod: '制片', script: '剧本', director: '导演', subjects: '主体', eps: '分集', film: '成片库', shell: '剧壳', clips: '切片' }[k] || '分集';
        location.hash = '#/project/' + p.id;
      });
      const nsb = main.querySelector('[data-x=nextstep]');
      if (nsb) nsb.onclick = () => {
        const nx = Pipeline.nextForEp(p, ep);
        if (nx.key === 'shots') { const t = main.querySelector('[data-x=dd-sb]'); if (t) t.click(); }
        else if (nx.key === 'gen') SB.runBatchOp(p, ep, main, 'video');
        else if (nx.key === 'review') Commands.execute('episode.smartReview', { pid: p.id, epid: ep.id, main, ui: true }).then(r => Commands.digest(r)); // 审片修订闭环(评审→修订→重抽→复审)
        else if (nx.key === 'film') Commands.execute('episode.compose', { pid: p.id, epid: ep.id, main, ui: true, force: true }).then(r => Commands.digest(r)); // 统一命令层(ui 模式;用户点名重来 → force)
        else if (nx.key === 'export') window.SB.openPlayer(p, ep, false); // 顶栏导出已并入预览:预览长视频内导出
        else if (nx.run) nx.run(main); // 带执行动作的下一步(如 regen-stale 批量重生成过期镜)
      };
      const psb = main.querySelector('[data-x=prevstep]');
      if (psb) psb.onclick = () => {
        const pv = Pipeline.prevForEp(p, ep);
        if (pv.key === 'subjects') location.hash = '#/project/' + p.id; // 回项目页(主体/剧本)
        else if (pv.key === 'shots') { const t = main.querySelector('[data-x=dd-sb]'); if (t) t.click(); }
        else if (pv.key === 'gen') SB.runBatchOp(p, ep, main, 'video');
        else if (pv.key === 'review') Review.openEpisodeReview(p, ep, main);
        else if (pv.key === 'film') Commands.execute('episode.compose', { pid: p.id, epid: ep.id, main, ui: true, force: true }).then(r => Commands.digest(r)); // 统一命令层(ui 模式;用户点名重来 → force)
      };
    }
    main.querySelector('[data-x=sb-config]').onclick = () => openSBConfig(p, ep, main);
    // 导演设定概要已并入左栏「内容」页本集理解区块(详细设定在项目「导演」板块);左栏底部按钮已移除
    // 本集理解:左栏「内容」页内联区块(场记与正文之间),点击打开编辑器
    const ust = main.querySelector('[data-x=underst2]');
    if (ust) ust.onclick = () => Understanding.openEditor(p, ep, main, Views.episode);
    // 「分镜序列」左栏入口已移除:拖拽调序能力已整合进中栏时间轴缩略图条
    // 顶栏「导演助手」已移除:统一由侧栏「虎鲸」元Agent 调用(集级内嵌面板不再挂载)
    const lr = main.querySelector('[data-x=lastreview]');
    if (lr) lr.onclick = () => Review.openEpisodeReport(p, ep, main);
    // 镜头确认闸:全部确认(有 U.confirm 二次确认)
    const cfa = main.querySelector('[data-x=confirmall]');
    if (cfa) cfa.onclick = () => U.confirm(`将本集全部 ${uncfmCnt} 个待确认镜头标记为已确认?建议先逐镜过目剧情与提示词。`, () => {
      ep.shots.forEach(s => s.confirm = true);
      Store.save();
      U.toast('本集镜头已全部确认', 'success');
      Views.episode(main, pid, eid);
    }, '全部确认');
    // 左栏底部 LLM 模型下拉已移除:拆镜模型统一取全局默认(偏好学习·全局默认值 defLLM),不在此单选
    // 分镜脚本创作层(无分镜默认,或显式切到「分镜脚本」)
    if (showBoard) SB.bindScriptBoard(main.querySelector('.ws-center'), p, ep, main, false);
    // 智能分镜(单按钮直接执行;评审修订循环已整合,原 AI分镜师入口移除;统一命令层 ui 模式:多方案对比窗保留)
    main.querySelector('[data-x=dd-sb]').onclick = () => Commands.execute('episode.generateStoryboard', { pid: p.id, epid: ep.id, main, ui: true }).then(r => Commands.digest(r));
    const plansBtn = main.querySelector('[data-x=sb-plans]');
    if (plansBtn) plansBtn.onclick = () => SB.openPlanCompare(p, ep, main);
    const hisBtn = main.querySelector('[data-x=sb-his]');
    if (hisBtn) hisBtn.onclick = () => SB.openShotHistory(p, ep, main);
    const ddBtn = main.querySelector('[data-x=shotdedupe]');
    if (ddBtn) ddBtn.onclick = () => openShotDedupe(p, ep, main);
    // 顶栏一级横排按钮(无下拉):各自直达原下拉项处理逻辑
    main.querySelector('[data-x=genv]').onclick = () => SB.runBatchOp(p, ep, main, 'video');
    main.querySelector('[data-x=epreview]').onclick = () => Review.openEpisodeReview(p, ep, main);
    main.querySelector('[data-x=compose]').onclick = () => {
      // 在线(FFmpeg 就绪)先经时间线编辑器微调出入点/顺序/取舍;离线或素材不足时走快速合成(统一命令层 ui 模式)
      if (window.Media && Media.isReady() && window.Timeline) {
        const usable = ep.shots.filter(s => (s.video && Store.shotVideoReady(s) && s.video.url) || s.image);
        if (usable.length) return Timeline.openCompose(p, ep, main);
      }
      Commands.execute('episode.compose', { pid: p.id, epid: ep.id, main, ui: true, force: true }).then(r => Commands.digest(r)); // 用户点名的合成 → force(成片已是最新也照旧重来)
    };
    // 显示方式▾:时间轴(默认)/数列式,偏好记忆在 settings.centerLayout
    bindDropdown(main, '[data-x=dd-layout]', '[data-ddm=layout]', item => {
      Store.state.settings = Store.state.settings || {};
      Store.state.settings.centerLayout = item.dataset.lay;
      Store.save();
      U.toast(item.dataset.lay === 'column' ? '已切换:数列式(竖排在左,大屏在右)' : '已切换:时间轴(大屏在上,横排在下)', 'success', 1800);
      Views.episode(main, pid, eid);
    }, '[data-lay]');
    main.querySelector('[data-x=quickedit]').onclick = () => SBViews.openQuickEdit(p, ep, main);
    // 批量▾:进入选择模式(卡片勾选 → 确认 → 专属面板);仅分镜视频视图渲染此下拉
    bindDropdown(main, '[data-x=dd-batch]', '[data-ddm=batch]', item => {
      if (window.BatchOps) BatchOps.enter(p, ep, main, item.dataset.bop);
    }, '[data-bop]');
    // 导入/导出▾:本地上传/资产库导入/下载CSV/上传CSV
    bindDropdown(main, '[data-x=dd-io]', '[data-ddm=io]', item => {
      ({ implocal: () => window.SB.openImportLocal(p, ep, main),
         impassets: () => window.SB.openImportAssets(p, ep, main),
         csvd: () => window.SB.exportShotCSV(p, ep),
         csvu: () => window.SB.openImportCSV(p, ep, main) })[item.dataset.io]();
    }, '[data-io]');
    // 多选操作(选择模式)
    const sc = main.querySelector('[data-x=selcancel]');
    if (sc) sc.onclick = () => BatchOps.exit(p, ep, main);
    const sa = main.querySelector('[data-x=selall]');
    if (sa) sa.onclick = () => BatchOps.selectAllUndone(p, ep, main);
    const sf = main.querySelector('[data-x=selconfirm]');
    if (sf) sf.onclick = () => BatchOps.confirm(p, ep, main);
    // 左栏 tab
    main.querySelectorAll('[data-ltab]').forEach(t => t.onclick = () => { ep.leftTab = t.dataset.ltab; Store.save(); Views.episode(main, pid, eid); });
    // 中栏顶部视图 tab:分镜脚本/分镜视频居左,节拍板/镜头组居右(四视图统一切换)
    main.querySelectorAll('[data-vtab]').forEach(t => t.onclick = () => setViewMode(t.dataset.vtab));
    // 节拍板/镜头组:页内挂载(内容模块各自渲染进中栏容器)
    if (vm === 'bb' && window.BeatBoard) BeatBoard.render(main.querySelector('[data-bbview]'), p, ep, main);
    if (vm === 'groups' && window.ShotGroups) ShotGroups.renderInto(main.querySelector('[data-sgview]'), p, ep, main, dupMarks);
    if ((vm === 'shots' || vm === 'cut') && sel) SBViews.bindCenter(main, p, ep, sel, selIdx), SBViews.bindRight(main, p, ep, sel, selIdx); // 分镜视频/剪辑两视图绑定分镜控件
    /* 卡片小标那条跳转:分镜视频与剪辑台共用中栏那条缩略图带,故这两档在这里绑一处;
     * 镜头组那条分镜时间线自己重渲(每渲一遍重挂),那一处在 ShotGroups.renderInto 里绑。
     * 少绑一档就有一档点了没反应——落点动作三档同读 SBViews.bindDupJump 那一处。 */
    if (vm === 'shots' || vm === 'cut') SBViews.bindDupJump(main);

    /* ---- 快捷键:←/→ 切换分镜,g 生成当前镜(焦点在表单控件或有弹窗时不响应) ---- */
    if (window.__epKeyH) document.removeEventListener('keydown', window.__epKeyH);
    window.__epKeyH = e => {
      if (!main.isConnected) { document.removeEventListener('keydown', window.__epKeyH); window.__epKeyH = null; return; }
      if (vm !== 'shots' && vm !== 'cut') return; // 快捷键只在分镜视频/剪辑视图生效(节拍板/镜头组/脚本层不响应)
      const t = e.target;
      if (t && /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)) return;
      const mroot = document.getElementById('modal-root');
      if (mroot && mroot.children.length) return;
      if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
        if (!ep.shots.length) return;
        e.preventDefault();
        const i = Math.max(0, ep.shots.findIndex(s => s.id === ep.uiSel));
        const n = (i + (e.key === 'ArrowRight' ? 1 : -1) + ep.shots.length) % ep.shots.length;
        ep.uiSel = ep.shots[n].id;
        Store.save();
        Views.episode(main, pid, eid);
      } else if ((e.key === 'g' || e.key === 'G') && sel) {
        Commands.execute('shot.generateVideo', { pid: p.id, epid: ep.id, sid: sel.id, main, ui: true }).then(r => Commands.digest(r)); // 等同点「生成视频」(统一命令层 ui 模式)
      }
    };
    document.addEventListener('keydown', window.__epKeyH);
  };

  /* ---- 左栏:内容(场记概要 + 本集正文连续呈现;替代旧的段落拆分) ---- */
  function leftContentHTML(p, ep) {
    const content = (ep.content || '').trim();
    if (!content) return '<div class="empty" style="padding:30px 10px"><div class="ico">📖</div><p class="small">本集暂无剧本内容</p></div>';
    const bd = ep.scriptBoard && ep.scriptBoard.scenes ? ep.scriptBoard : SB.deriveBoard(ep);
    const names = kind => p.subjects.filter(s => s.kind === kind).map(s => s.name);
    const chars = names('character'), sceneNames = names('scene'), propNames = names('prop');
    return `
    <b class="small">${U.esc(ep.title)} · 场记</b>
    <div class="small muted" style="margin:4px 0 8px">本集共 ${bd.scenes.length} 个场次 · 拆分镜前请先过一遍场记</div>
    <div style="max-height:38vh;overflow-y:auto">
      ${bd.scenes.map((sc, i) => {
        const all = [sc.title, sc.text, ...sc.beats.map(b => (b.plot || '') + ' ' + (b.shot || ''))].join(' ');
        const hitC = chars.filter(n => all.includes(n));
        const hitS = sceneNames.filter(n => all.includes(n));
        const hitP = propNames.filter(n => all.includes(n));
        const summary = ((sc.beats[0] && (sc.beats[0].plot || sc.beats[0].shot)) || sc.text || '').slice(0, 50);
        return `<div class="scene-block">
          <div class="scene-head">场 ${i + 1} · ${U.esc(sc.title)}</div>
          ${(hitC.length || hitS.length || hitP.length) ? `<div class="row wrap" style="gap:4px;margin:5px 0">
            ${hitC.map(n => `<span class="tag cyan" style="font-size:10px" title="人物">👤${U.esc(n)}</span>`).join('')}
            ${hitS.map(n => `<span class="tag green" style="font-size:10px" title="场景">🏞${U.esc(n)}</span>`).join('')}
            ${hitP.map(n => `<span class="tag yellow" style="font-size:10px" title="道具">🗡${U.esc(n)}</span>`).join('')}
          </div>` : ''}
          <div class="scene-text">简介:${U.esc(summary)}${summary.length >= 50 ? '…' : ''}</div>
        </div>`;
      }).join('')}
    </div>
    <div class="divider" style="margin:10px 0"></div>
    <div class="row" style="justify-content:space-between;cursor:pointer" data-x="underst2" title="点击编辑/重新生成本集理解">
      <b class="small">📖 本集理解</b>
      <span class="small muted">点击编辑 ›</span>
    </div>
    ${ep.understanding && window.Understanding
      ? `<div class="hint" style="margin-top:6px;line-height:1.8;max-height:20vh;overflow-y:auto">${U.esc(Understanding.toText(ep.understanding))}</div>`
      : '<div class="hint" style="margin-top:6px">尚未生成本集理解:智能分镜时自动生成,也可点击手动生成/编辑</div>'}
    ${(() => { // 导演设定概要并入本集理解(详细设定在项目「导演」板块);左栏底部按钮已移除
      const ds = (Store.state.settings || {}).directorSetting;
      if (!ds) return '<div class="hint" style="margin-top:8px">🎬 导演设定:未设置,可到项目「导演」板块详细设定</div>';
      const dims = (window.DIR_DIMS || []).filter(d => ds[d]);
      return `<div style="margin-top:8px"><b class="small">🎬 导演设定${ds.inject !== false ? '(注入中)' : '(未注入)'}</b>
        <div class="hint" style="margin-top:4px;line-height:1.8">${dims.length ? dims.map(d => `${d}:${U.esc(String(ds[d]).slice(0, 30))}`).join('<br>') : '已到项目「导演」板块详细设定'}</div></div>`;
    })()}
    <div class="row" style="justify-content:space-between;margin:10px 0 4px">
      <b class="small">本集正文</b>
      <span class="small muted">${content.length} 字</span>
    </div>
    <div class="scene-text" style="max-height:26vh;overflow-y:auto;white-space:pre-wrap;line-height:1.9">${U.esc(content)}</div>`;
  }
  function leftEpisodesHTML(p, ep) {
    return p.episodes.map(e => `
    <div class="scene-block" style="cursor:pointer;${e.id === ep.id ? 'border-color:var(--accent)' : ''}" data-goep="${e.id}" onclick="location.hash='#/project/${p.id}/episode/${e.id}'">
      <div class="scene-head">${U.esc(e.title)}</div>
      <div class="scene-text">${U.esc((e.content || '').slice(0, 40))}… <span class="tag ${e.shots && e.shots.length ? 'green' : ''}" style="font-size:10px">${e.shots && e.shots.length ? e.shots.length + ' 镜' : '未分镜'}</span></div>
    </div>`).join('');
  }

  /* 分镜脚本编辑器(deriveBoard/scriptBoardHTML/bindScriptBoard)已拆至 sb-board.js,
   * 经 window.SB 暴露;deriveBoard 原出口保留(sb-board Object.assign 回 window.SB)。 */
  /* openBoardModal 已移除:分镜脚本创作层统一走顶部"① 分镜脚本"tab 页内展示 */



  /* ---- 下拉菜单工具 ---- */
  // H2 修复:全局代理只绑一次(原实现每次渲染都 addEventListener,整页重渲染导致监听无限累积)
  // 下拉外部点击才收起;按下点在 .dd 内部(按钮/菜单项)时不收,否则菜单在 mousedown 即隐藏、click 永远到不了菜单项
  document.addEventListener('mousedown', e => {
    if (e.target && e.target.closest && e.target.closest('.dd')) return;
    document.querySelectorAll('.dd-menu').forEach(m => { m.style.display = 'none'; });
  });
  function bindDropdown(main, btnSel, menuSel, onItem, itemSel) {
    const btn = main.querySelector(btnSel), menu = main.querySelector(menuSel);
    if (!btn || !menu) return;
    btn.onclick = e => {
      e.stopPropagation();
      const show = menu.style.display === 'none';
      main.querySelectorAll('.dd-menu').forEach(x => x.style.display = 'none');
      menu.style.display = show ? '' : 'none';
    };
    menu.querySelectorAll(itemSel).forEach(it => it.onclick = () => { menu.style.display = 'none'; onItem(it); });
  }

  /* 兼容:旧代码中的整页刷新入口 */
  function renderShots(main, p, ep) { Views.episode(main, p.id, ep.id); }

  function defaultSBConfig(p) {
    const st = window.getSettings ? getSettings() : {};
    return {
      style: p.style, syncVoice: true, videoSyncAudio: false, subtitle: true,
      sbMode: 'create', autoOptimize: true, shotCount: 8, smartReview: false, maxRetry: Domain.REVISE_RETRY_DEFAULT, inheritPrevEp: false, sbAutoFix: true,
      narratorVoice: st.defVoice || VOICES[0],
      batchVideoModel: st.defVideoModel || MODELS.video[0], batchCamera: '固定镜头',
      batchStrategy: 'ref',
      quality: st.defQuality || '720p', ratio: st.defRatio || '16:9',
      sbModel: st.defLLM || API.getConfig().model || SB_MODELS[0],
    };
  }


  /* ================= 历史版本对比 / 应用此版 ================= */
  /* 非破坏性快照:覆盖 image/video/首尾帧前,把当前画面+提示词+首尾帧状态
   * unshift 进 history,供「历史版本」回滚;与最新一条 frame+url+首尾帧相同则跳过(去重)。 */
  function snapshotShot(s, type, model) {
    const frame = (s.video && Store.shotVideoReady(s) && s.video.frame) || s.image || null;
    const url = s.video && Store.shotVideoReady(s) ? (s.video.url || '') : '';
    if (!frame && !url && !s.prompt && !s.firstFrame && !s.lastFrame) return; // 空状态无快照价值
    s.history = s.history || [];
    const h0 = s.history[0];
    if (h0 && (h0.frame || null) === frame && (h0.url || '') === url
      && (h0.firstFrame || null) === (s.firstFrame || null) && (h0.lastFrame || null) === (s.lastFrame || null)) return; // 去重
    s.history.unshift({
      type: type || '快照', model: model || (s.video && s.video.model) || s.videoModel || '', time: Store.now(),
      prompt: s.prompt, frame, url, firstFrame: s.firstFrame || null, lastFrame: s.lastFrame || null,
    });
  }


  function blankShot(order, cfg) {
    return WfCore.blankShot(order, cfg, Store.uid); // 二十一轮:结构单一来源 wf-core.js(uid 经参数注入)
  }

  /* 文生视频模板取值(settings 原值,不并 gsettings DEFAULTS):与服务端 /api/wf/* 读 st.tplVideo 同源,
   * 未保存偏好且未雇佣专家时为空 → 不套模板,拼装结果与接入前一致 */
  function tplVideoOf() { return (Store.state.settings || {}).tplVideo || ''; }

  /* 新建/转换分镜默认提示词单一出口(字段全可选):
   * 有文生视频模板({style}=项目风格 {shot}=本镜要素)按模板成型,否则
   * 风格 + (情绪氛围) + 剧情 + (运镜/场景/出场主体);末尾统一接全局设定 + 负面约束,去空去重拼接 */
  function buildShotPrompt(p, o) {
    o = o || {};
    const shot = [
      o.emotion ? o.emotion + '氛围' : '',
      (o.plot || '').trim(),
      o.camera || '',
      o.scene || '',
      (o.characters || []).filter(Boolean).join('、'),
    ];
    const tpl = tplVideoOf();
    const parts = (tpl
      ? [WfCore.fillTplVideo(tpl, styleOf(p), shot.filter(Boolean).join(','))]
      : [styleOf(p) + '风格'].concat(shot)
    ).concat([p.globalSetting || '']).filter((x, i, arr) => x && arr.indexOf(x) === i);
    return parts.join(',') + negOf(p);
  }


  /* 当前是否仍停留在本分集页(路由 hash 形如 #/project/:pid/episode/:eid);异步回调重写 #main 前必须校验 */
  function onEpPage(p, ep) { return location.hash.indexOf(p.id + '/episode/' + ep.id) >= 0; }


  /* 上一集末镜尾帧(跨集继承用;无上一集或末镜无尾帧时返回 null) */
  function prevEpTail(p, ep) {
    const eps = (p && p.episodes) || [];
    const pi = eps.indexOf(ep);
    const prev = pi > 0 ? eps[pi - 1] : null;
    const last = prev && prev.shots && prev.shots.length ? prev.shots[prev.shots.length - 1] : null;
    return last && last.lastFrame ? last.lastFrame : null;
  }

  /* 生成策略表:单一来源下沉 domain.js(双端共享),此处回挂保持 window.SB/STRATEGIES 出口不变 */
  const STRATEGIES = Domain.STRATEGIES;

  /* LLM 拆镜族(genShotsLLM/normalizeLLMShot/publishLLMShots/推文出图/llmReview)与
   * 智能分镜 runSmartSB、本地兜底 publishShots 已拆至 sb-llm.js(window.SB);
   * 失败任务重试入口 window.__retryShotTask 已拆至 sb-batch.js。 */

  /* 分镜真实配音:豆包语音 TTS → s.audioUrl + s.audioMeta 渲染凭据(在线);失败抛错由调用方处理。
   * 音色配置与配音文本走 Domain 单源(与 CLI/合成侧清单同一口径);
   * opId 可选:计费操作键(调用方任务 id),透传服务端白名单计费(tts.gen) */
  async function ttsShot(p, ep, s, opId) {
    const vc = Domain.voiceCfgOf(p, ep, s);
    const text = Domain.audioTextOf(s);
    if (!text) throw new Error('该分镜无旁白/台词文本,无法配音');
    const voiceId = Voice.volcOf(vc.voice);
    const r = await Media.genTTS({
      text: text.slice(0, 300),
      voice: voiceId,
      speed: vc.rate,
      volume: Math.max(0.5, Math.min(2, (vc.volume || 5) / 5)),
      emotion: vc.emotion && vc.emotion !== '平静' ? Voice.emotionOf(vc.emotion) : undefined,
      billingAction: 'tts.gen', operationId: opId,
    });
    s.audio = true;
    s.audioUrl = r.url;
    // 渲染凭据:上游实际音色 id 取服务端回执(缺省回落本次送上游的 voice_type),参数/文本签名供判旧
    s.audioMeta = Domain.audioMetaWrite(vc, text, { url: r.url, duration: r.duration, voiceId: r.voice || voiceId, time: Store.now() });
    s.history = s.history || [];
    s.history.unshift({ type: '音频', model: '豆包语音·' + Voice.label(vc), time: Store.now() });
    return r;
  }

  /* 离线占位配音:无真实音轨,凭据如实标 offline(合成时不混音,清单可查) */
  function markOfflineAudio(p, ep, s, vc, modelLabel) {
    s.audio = true;
    s.audioMeta = Domain.audioMetaWrite(vc, Domain.audioTextOf(s), { offline: true, time: Store.now() });
    s.history = s.history || [];
    s.history.unshift({ type: '音频', model: modelLabel, time: Store.now() });
  }

  async function genAudio(p, ep, s, main) {
    if (s.__busy) return U.toast('该分镜正在处理中', 'info');
    s.__busy = true;
    try {
      const vc = Domain.voiceCfgOf(p, ep, s);
      const vlabel = Voice.label(vc);
      const online = !!(window.Media && Media.isReady());
      const rerender = () => { if (onEpPage(p, ep)) renderShots(main, p, ep); else Store.save(); };
      let ok = false, failMsg = '';
      // 计费五件套统一走 Tasks.run(登记→扣费→执行→失败退费),不再手写扣费/退费
      await Tasks.run({
        type: '生成音频', model: MODELS.tts[0] + '·' + vlabel + (online ? '' : '(离线模拟)'),
        target: `${ep.title}·镜头${s.order + 1}`, cost: COST.audio, actionName: `分镜音频生成(${vlabel})`,
        projectId: p.id, episodeId: ep.id, shotId: s.id,
      }, async tk => {
        try {
          if (online) {
            await ttsShot(p, ep, s, tk.id);
            Store.save();
            ok = true;
            return { filename: `镜头${s.order + 1}_配音.mp3`, dataURL: s.audioUrl };
          }
          await U.delay(700);
          markOfflineAudio(p, ep, s, vc, MODELS.tts[0] + '·' + vlabel + '(离线模拟)');
          Store.save();
          ok = true;
        } catch (e) {
          failMsg = (e && e.message) || String(e);
          throw e;
        }
      });
      if (ok) U.toast('音频生成完成(' + vlabel + (online ? '' : ',离线模拟') + ')', 'success');
      else if (failMsg) U.toast('配音失败,积分已自动返还:' + failMsg, 'error', 4000);
      rerender();
    } finally {
      s.__busy = false;
    }
  }

  /* ================= 智能分镜 ================= */
  /* ================= 参数配置(停靠面板,对齐 222.png) ================= */
  function openSBConfig(p, ep, main) {
    // 已打开则收起
    const existing = document.querySelector('.sb-dock');
    if (existing) { existing.remove(); return; }
    const c = ep.sbConfig;
    const dock = document.createElement('div');
    dock.className = 'sb-dock';
    dock.innerHTML = `
    <div class="sb-dock-head"><b>参数配置 -【${U.esc(ep.title)}】</b><button class="modal-close" data-x="close">✕</button></div>
    <div class="sb-dock-body">
      <div class="kv" style="margin-bottom:12px">
        <span class="k">视频风格</span><span><span class="tag cyan">${U.esc(c.style)}</span></span>
      </div>
      <div class="hint" style="margin:0 0 10px">项目创建时设定,此处仅显示不可修改</div>
      ${[
        ['subtitle', '是否合成字幕', '合成音视频时自动添加字幕'],
        ['autoOptimize', '自动优化提示词', '提示词自动优化,会增加分镜时间'],
        ['inheritPrevEp', '续写上一集末镜(跨集连贯)', '第一镜首帧自动 = 上一集最后一镜尾帧,保持跨集画面连贯'],
        ['smartReview', '智能审片(生成后自动评审)', '批量生成后逐镜自动审片,不达标自动重生成,直至达标或达到最大重试次数'],
        ['sbAutoFix', '生成后自动评审修订(AI 分镜师能力)', '智能分镜拆镜后,五角色 AI 评审打分,低于 90 分按评审意见自动修订重拆(最多 2 轮,不额外扣积分)'],
      ].map(([k, t, h]) => `
      <div class="check-line" data-sw="${k}"><span class="switch ${c[k] ? 'on' : ''}"></span><div><div class="small">${t}</div><div class="hint" style="margin:0">${h}</div></div></div>`).join('')}
      <div class="divider" style="margin:12px 0"></div>
      <label class="field"><span>分镜数量(根据文本长度浮动)</span><input class="input" type="number" data-f="shotCount" min="2" max="40" value="${c.shotCount}"></label>
      <label class="field"><span>分镜方案数(多方案对比择优)</span>
        <div class="model-row">
          ${[1, 2, 3].map(n => `<div class="model-opt ${(c.sbPlans || 1) === n ? 'sel' : ''}" data-pn="${n}">${n} 套</div>`).join('')}
        </div>
        <div class="hint">大于 1 套时:同一剧本并行拆 N 套候选分镜,五角色 AI 评审各打一次分,生成后弹出对比择优落定;每套 ${COST.smartSB} 积分(评审打分不另收,自动评审修订在多方案下不生效)</div>
      </label>
      <label class="field"><span>或:目标成片总时长(分钟,自动换算分镜数)</span>
        <input class="input" type="number" data-f="targetMin" min="1" max="15" step="0.5" placeholder="如 1.5,与单镜时长联动换算">
        <div class="hint" data-tgt-hint>填写后按 总时长 ÷ 单镜时长(${c.shotDur || 5}s) 自动计算分镜数</div>
      </label>
      <label class="field"><span>智能审片最大重生成次数(不达标自动重抽)</span>
        <div class="model-row">
          ${Domain.reviseRetryOptions().map(n => `<div class="model-opt ${Domain.reviseRetryLimit(c.maxRetry) === n ? 'sel' : ''}" data-mr="${n}">${n} 次</div>`).join('')}
        </div>
        <div class="hint">仅「智能审片」开启时生效;每镜评审 ${COST.review} 积分,重生成 ${COST.video} 积分/次</div>
      </label>
      <label class="field"><span>旁白音色</span>
        <div class="row" style="gap:6px">
          <select class="select grow" data-f="narratorVoice">${VOICES.map(v => `<option ${c.narratorVoice === v ? 'selected' : ''}>${v}</option>`).join('')}</select>
          <button class="btn sm primary" data-x="vcfg" title="配音设置(语速/音量/语调/情感)">默认音色 ▶</button>
        </div>
        <div class="hint" data-vcfgcur>${p.narration ? '当前旁白:' + U.esc(Voice.label(p.narration)) : '未设置旁白配音参数'}</div>
      </label>
    </div>
    <div class="sb-dock-foot"><button class="btn primary block" data-x="ok">保存配置并应用</button></div>`;
    // 停靠在左栏右侧(ws-left 之后,中栏让位)
    const left = main.querySelector('.ws-left');
    (left ? left.parentNode : main.querySelector('.page')).insertBefore(dock, left ? left.nextSibling : null);
    const closeDock = () => {
      dock.remove();
      document.removeEventListener('keydown', escH);
      if (window.__overlays) window.__overlays = window.__overlays.filter(o => o !== reg);
    };
    const escH = e => { if (e.key === 'Escape') closeDock(); };
    document.addEventListener('keydown', escH);
    // 注册到全局浮层清单:路由切换时 app.js 统一 close(会带走 Esc 监听)
    window.__overlays = window.__overlays || [];
    const reg = { close: closeDock };
    window.__overlays.push(reg);
    dock.querySelector('[data-x=close]').onclick = closeDock;

    dock.querySelectorAll('[data-sw]').forEach(el => el.onclick = () => {
      const k = el.dataset.sw;
      c[k] = !c[k];
      el.querySelector('.switch').classList.toggle('on', c[k]);
    });
    dock.querySelectorAll('[data-mr]').forEach(o => o.onclick = () => {
      c.maxRetry = +o.dataset.mr;
      dock.querySelectorAll('[data-mr]').forEach(x => x.classList.toggle('sel', x === o));
    });
    dock.querySelectorAll('[data-pn]').forEach(o => o.onclick = () => {
      c.sbPlans = +o.dataset.pn;
      dock.querySelectorAll('[data-pn]').forEach(x => x.classList.toggle('sel', x === o));
    });
    dock.querySelector('[data-x=vcfg]').onclick = () => {
      Voice.settingModal({
        title: '旁白配音 · ' + ep.title,
        value: p.narration,
        onSave(cfg2) {
          p.narration = cfg2;
          Store.save();
          const el = dock.querySelector('[data-vcfgcur]');
          if (el) el.textContent = '当前旁白:' + Voice.label(cfg2);
          U.toast('旁白配音已保存:' + Voice.label(cfg2), 'success');
        },
      });
    };
    dock.querySelector('[data-x=ok]').onclick = () => {
      // 目标总时长优先:自动换算分镜数 = 总时长 ÷ 单镜时长(单镜时长沿用现有配置,面板不再提供修改)
      const tgtMin = +dock.querySelector('[data-f=targetMin]').value || 0;
      c.shotCount = tgtMin > 0
        ? Math.max(2, Math.min(40, Math.round(tgtMin * 60 / (c.shotDur || 5))))
        : Math.max(2, Math.min(40, +dock.querySelector('[data-f=shotCount]').value || 8));
      c.narratorVoice = dock.querySelector('[data-f=narratorVoice]').value;
      // 批量应用旁白音色到已有分镜
      ep.shots.forEach(s => { s.voice = c.narratorVoice; });
      Store.save();
      closeDock();
      U.toast('参数配置已保存并应用', 'success');
      Views.episode(main, p.id, ep.id);
    };
  }

  /* runSmartSB/publishShots 已拆至 sb-llm.js;批量操作(runBatchOp/确认闸/定位/重试)已拆至 sb-batch.js,
   * 均经 window.SB 暴露(openConfirmGateModal 供 sb-gen.js 解构,加载顺序在本文件之后)。 */

  /* 智能审片闭环(autoSmartReview)与一键成片(oneClickProduce)已迁至 produce.js(量产域),
   * 由该文件 Object.assign 挂回 window.SB,外部调用点(episodes/produce 等)不变。 */


  /* window.SB 透出(批次 E 拆分):本地成员 + 共享给 sb-views.js/sb-gen.js 的常量与辅助;
   * 拆分前成员 syncFrames/framePH/batchGenVideos/shotVersions/estShotDuration 已移入 sb-gen.js,
   * 由 sb-gen.js 末尾 Object.assign 回挂 window.SB,外部调用点(sb-io/produce/timeline 等)不变。 */
  window.SB = { blankShot, buildShotPrompt, tplVideoOf, CAMERAS, renderShots, defaultSBConfig, snapshotShot, prevEpTail, onEpPage, ttsShot, genAudio, markOfflineAudio, dedupeShotScan, openShotDedupe, TRANSITIONS, VOICES, PROMPT5_SECS, SPLIT_RULES, PROMPT5, STRATEGIES };
  window.STRATEGIES = STRATEGIES; // 供 agent.js 等板块读取(单一来源,不再硬编码拷贝)
  window.CAMERAS = CAMERAS;
})();

