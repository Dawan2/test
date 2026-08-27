/* ============ sb-views.js 分集工作区四视图:中栏/右栏 HTML 与交互绑定(拆自 storyboard.js) ============
 * 加载顺序:storyboard.js 之后、sb-gen.js 之前;共享常量/辅助顶部经 window.SB 解构,
 * 生成链路函数(shotVersions/estShotDuration/syncFrames 等)运行时经 window.SBGen 调用。 */
(function () {
  const { blankShot, buildShotPrompt, onEpPage, genAudio, snapshotShot, renderShots, VOICES, PROMPT5_SECS, TRANSITIONS, STRATEGIES } = window.SB;

  /* ---- 剧情概要区(时间轴下方;只保留剧情概要,与正在播放的分镜逐镜对齐) ---- */
  /* 时间轴布局:逐镜概要横排轨道,与时间轴同格同宽、滚动联动;点击概要格切镜 */
  function scriptTrackHTML(p, ep, sel, selIdx) {
    return `
    <div class="row" style="margin-top:8px;justify-content:space-between">
      <b class="small muted">📖 剧情概要 · 镜头 ${selIdx + 1}/${ep.shots.length}(随时间轴联动)</b>
    </div>
    <div class="ws-reftrack" data-reftrack>
      ${ep.shots.map((s, i) => `
      <div class="ws-refcell ${s.id === sel.id ? 'sel' : ''}" data-ref="${s.id}" title="点击切换到镜头 ${i + 1}"><b>${i + 1}.</b> ${U.esc(s.plot || '(未填写)')}</div>`).join('')}
      <div style="flex:none;width:140px"></div>
    </div>`;
  }
  /* 数列式布局(无横向时间轴):当前镜剧情概要单行卡 */
  function scriptRefHTML(p, ep, sel, selIdx) {
    return `
    <div class="card ws-ref" style="margin-top:10px;padding:10px 14px">
      <div class="ws-ref-row"><span class="tag cyan">剧情 · 镜头 ${selIdx + 1}</span><span>${U.esc(sel.plot || '(未填写)')}</span></div>
    </div>`;
  }

  /* ---- 镜头状态归一(P1-4):分散角标(确认闸/审片红标/终稿锁/素材过期/完成勾)合并为单一状态条,颜色分级、纯 UI 归并不动数据。
   * 优先级:终稿 > 素材已更新 > 失败 > 已出片(带审分) > 已确认 > 待确认;生成中不走过场条——整幅蒙层(带取消)即其状态。 ---- */
  function shotStatusHTML(p, s) {
    const vstat = (s.video && s.video.status) || 'none';
    const base = 'position:absolute;left:5px;bottom:5px;font-size:10px;padding:2px 7px;border-radius:5px;font-weight:700;color:#fff;';
    if (s.final) return `<span data-unfinal="${s.id}" style="${base}background:rgba(245,158,11,.95);cursor:pointer" title="已定为终稿(点击解锁,解锁后可重新生成/回收)">🔒 终稿</span>`;
    if (Store.shotVideoStale(p, s)) return `<span style="${base}background:rgba(245,158,11,.95)" title="引用素材已更新,下次生成自动用新图;建议重新生成该镜">↻ 素材已更新</span>`;
    if (vstat === 'failed') return `<span style="${base}background:#f87171" title="${U.esc(s.video.error || '生成失败')}">✗ 失败</span>`;
    if (vstat === 'done') {
      const rv = (s.reviews || [])[0];
      if (rv && !(window.Review && Review.reportStale(s))) {
        const low = rv.score < 7;
        return `<span style="${base}background:${low ? '#f87171' : 'var(--green)'}" title="最近审片 ${rv.score.toFixed(1)} 分${low ? ',低于达标线 7.0,建议重抽' : ''}">✓ 已出片 · 审 ${rv.score.toFixed(1)}</span>`;
      }
      return `<span style="${base}background:var(--green)" title="已出片${rv ? '(审片报告已过期,建议重审)' : ''}">✓ 已出片</span>`;
    }
    return s.confirm
      ? `<span data-cfm="${s.id}" style="${base}background:var(--green);cursor:pointer" title="已确认(点击取消确认)">✓ 已确认</span>`
      : `<span data-cfm="${s.id}" style="${base}background:rgba(120,128,140,.88);cursor:pointer" title="待确认:点击确认本镜剧情与提示词;未确认镜头不参与批量生成">待确认</span>`;
  }

  /* ---- 单镜缩略图块(分镜视频/剪辑两视图共用;column 时补 width:100% 撑满竖列) ---- */
  function shotThumbHTML(p, ep, s, i, sel, col) {
    const sm = window.__selMode;
    const f = (Store.shotVideoReady(s) && s.video.frame) || s.image; // 统一就绪判定:在线时模拟占位帧不作缩略图
    const svurl = Store.shotVideoReady(s) && s.video.url;
    // 有真实视频但封面缺失/是 PH 占位(png dataURL):用 <video preload=metadata> 直接显示首帧
    const phFrame = f && String(f).startsWith('data:image/png');
    const useVideoThumb = svurl && (!f || phFrame);
    const vstat = (s.video && s.video.status) || 'none';
    const isSelMode = sm && sm.selected.has(s.id);
    return `
      <div class="ws-thumb shot-card ${s.id === sel.id ? 'sel' : ''} ${sm ? 'sel-mode' : ''} ${isSelMode ? 'sel-on' : ''} ${vstat === 'generating' ? 'gen' : ''}" data-shot="${s.id}" draggable="${sm ? 'false' : 'true'}" title="点击切换 · 拖动调序"${col ? ' style="width:100%"' : ''}>
        <div class="ws-thumb-img">
          ${sm ? `<div class="sel-check ${isSelMode ? 'on' : ''}">✓</div>` : ''}
          ${useVideoThumb
            ? `<video src="${svurl}" preload="metadata" muted style="width:100%;height:100%;object-fit:cover;pointer-events:none"></video>`
            : f ? `<img src="${U.thumb(f)}">` : '<div class="ws-thumb-empty">无画面</div>'}
          ${vstat === 'generating' ? `<div class="ws-gen"><span class="spinner"></span>生成中<span data-wait="${s.id}"></span>${s.video.upstreamId ? `<span class="ws-cancel" data-cancel="${s.id}" title="取消生成:积分退回,上游结果不再交付">✕ 取消</span>` : ''}</div>` : shotStatusHTML(p, s)}
        </div>
        <div class="ws-thumb-name">${(() => { const g = s.groupId && (ep.groups || []).find(x => x.id === s.groupId); return g ? `<span style="color:hsl(${U.hashColor(g.id) % 360},70%,55%)" title="镜头组:${U.esc(g.name)}">●</span> ` : ''; })()}${i + 1}. ${U.esc((s.name || s.plot || '镜头' + (i + 1)).slice(0, 10))}</div>
      </div>`;
  }

  /* ---- 播放器块(分镜视频/剪辑共用) ---- */
  function playerBlockHTML(p, ep, sel, selIdx) {
    const frame = (sel.video && sel.video.status === 'done' && sel.video.frame) || sel.image;
    const vurl = sel.video && sel.video.status === 'done' && sel.video.url; // 真实成片地址(有就直接播视频,不再只显示静帧)
    const failed = sel.video && sel.video.status === 'failed';
    const ferr = failed && window.Media ? Media.friendlyError(sel.video.error) : null; // 失败原因 + 调整建议
    const poster = frame && (frame.startsWith('/uploads/') || frame.startsWith('data:image/jpeg')) ? frame : ''; // PH 占位图(png dataURL)不作 poster
    return `
    <div class="player-stage" data-x="bigplay" style="cursor:pointer">
      ${vurl
        ? `<video src="${vurl}"${poster ? ` poster="${poster}"` : ''} controls style="position:absolute;inset:0;width:100%;height:100%;object-fit:contain;background:#000" data-pv></video>`
        : ferr
          ? `<div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;background:rgba(70,20,30,.28);padding:20px">
              <div class="card" style="max-width:540px;padding:16px 18px;text-align:left;cursor:default" data-x="stopadv">
                <b style="color:var(--red)">✕ 本镜视频生成失败(积分已自动返还)</b>
                <div class="small" style="margin:8px 0;line-height:1.6;word-break:break-all"><span class="muted">上游返回:</span>${U.esc(ferr.msg)}</div>
                <div class="hint" style="line-height:1.7">💡 ${U.esc(ferr.advice)}</div>
                <div class="row" style="margin-top:10px;gap:8px">
                  <button class="btn sm" data-x="editprompt">✏ 修改提示词</button>
                  <button class="btn sm" data-x="valimg" title="廉价改图验证:先按当前提示词出静态验证图(2~3 积分,约 1 分钟),画面满意后再抽视频">🖼 先出验证图</button>
                  <button class="btn sm primary" data-x="retrygen">↻ 调整后重新生成</button>
                </div>
              </div>
            </div>`
          : frame ? `<img src="${frame}">` : '<span class="muted">暂无画面 — 点击右栏「生成视频」生成本镜视频</span>'}
      <div class="scan" style="position:absolute;inset:0;pointer-events:none;background:repeating-linear-gradient(0deg,transparent 0 3px,rgba(0,0,0,.15) 3px 4px)"></div>
      ${ep.sbConfig.subtitle && (sel.dialogue || sel.narration) && !vurl ? `<div style="position:absolute;bottom:12px;left:0;right:0;text-align:center;color:#fff;text-shadow:0 1px 4px #000;font-size:14px;padding:0 20px;pointer-events:none">${U.esc(sel.dialogue || sel.narration)}</div>` : ''}
      <div class="badge" style="position:absolute;top:10px;left:10px;font-size:11px;padding:3px 9px;border-radius:6px;background:rgba(0,0,0,.6);color:#9be8f5;pointer-events:none">镜头 ${selIdx + 1} · ${U.esc(sel.camera)}${sel.cameraSpec ? ' · ' + U.esc(CAMERA.describe(sel.cameraSpec)) : ''}</div>
      ${Store.shotVideoStale(p, sel) ? '<div style="position:absolute;top:10px;right:10px;font-size:11px;padding:3px 9px;border-radius:6px;background:rgba(245,158,11,.92);color:#fff;pointer-events:none" title="引用素材已更新,下次生成自动用新图;建议重新生成该镜">⚠ 素材已更新·建议重生成</div>' : ''}
      <div style="position:absolute;bottom:10px;right:12px;font-size:12px;color:#fff;text-shadow:0 1px 3px #000;pointer-events:none">0:00 / 0:${String(SBGen.estShotDuration(sel)).padStart(2, '0')}</div>
    </div>`;
  }

  /* ---- 生成进度条块(分镜视频/剪辑共用) ---- */
  function progressBlockHTML(p, ep, doneCnt) {
    const pct = ep.shots.length ? Math.round(doneCnt / ep.shots.length * 100) : 0;
    return `
      <div class="progress" style="margin-top:8px"><i style="width:${pct}%"></i></div>
      <div class="row" style="justify-content:space-between;margin-top:4px">
        <span class="small muted">已生成 ${doneCnt}/${ep.shots.length} 镜</span>
        <span class="row" style="gap:8px;align-items:center">
          ${ep.uiAutoPlay ? '<span class="tag cyan" style="font-size:10px">连播中</span>' : ''}
          <button class="btn sm ${ep.uiAutoPlay ? 'primary' : 'ghost'}" data-x="autoplay" style="padding:2px 12px" title="从当前镜头开始,一个播完自动播放下一段(无视频的镜头自动跳过)">${ep.uiAutoPlay ? '⏸ 停止连播' : '⏵ 连播'}</button>
          <span class="small muted">点击缩略图切换 · 拖动缩略图调序 · 点击播放器全屏预览</span>
        </span>
      </div>`;
  }

  /* ---- 版本与审片卡(分镜视频右栏/剪辑右栏共用) ----
   * 旧版标记(2026-08 六轮;八轮正向证明):报告指纹与当前视频指纹都存在且一致才算当前,
   * 缺任一侧指纹/视频不存在/不一致 → 显示"旧版",不再冒充最近审片 */
  function versCardHTML(sel) {
    const vers = SBGen.shotVersions(sel);
    const lastReview = (sel.reviews || [])[0] || null;
    const reviewStale = !!(lastReview && window.Review && Review.reportStale(sel));
    return `
      <div class="card" style="padding:12px;margin-bottom:10px">
        <div class="row" style="justify-content:space-between;margin-bottom:8px;flex-wrap:wrap;gap:6px">
          <b class="small">🗂 版本与审片${lastReview ? ` <span class="tag ${reviewStale ? 'yellow' : lastReview.score >= 7 ? 'green' : 'red'}" title="${reviewStale ? '该报告审的是重新生成前的旧版视频,建议重新审片' : ''}">最近审片 ${lastReview.score.toFixed(1)}${reviewStale ? ' · 旧版' : ''}</span>` : ''}</b>
          <div class="row" style="gap:6px;flex-wrap:wrap">
            <button class="btn sm" data-ract="review" title="对本镜进行 AI 审片评分">⊙ 一键审片</button>
            ${vers.length ? `<button class="btn sm" data-ract="vers" title="查看/对比/回滚本镜历史版本">🗂 全部版本(${vers.length})</button>` : ''}
            ${(sel.reviews || []).length ? `<button class="btn sm" data-ract="reviews" title="查看本镜审片记录">🧐 审片记录(${sel.reviews.length})</button>` : ''}
          </div>
        </div>
        ${vers.length ? `<div class="row wrap" style="gap:6px">
          ${vers.slice(0, 4).map((v, i) => `<div class="ws-hist" data-x="vers" style="cursor:pointer" title="点击查看全部版本/对比/回滚"><div class="ws-hist-body"><b>v${vers.length - i} · ${U.esc(v.type)}</b><span>${U.esc((v.model || '').slice(0, 18))}</span><span class="small muted">${U.esc(v.time)}</span></div></div>`).join('')}
        </div>${vers.length > 4 ? `<div class="hint" style="margin:6px 0 0">共 ${vers.length} 版,点卡片或「全部版本」对比选优</div>` : ''}` : '<div class="hint" style="margin:0">暂无版本:生成视频后自动记录,每次覆盖前自动留档可回滚</div>'}
      </div>`;
  }


  function centerHTML(p, ep, sel, selIdx, doneCnt) {
    const layout = (Store.state.settings || {}).centerLayout === 'column' ? 'column' : 'strip';
    /* 单镜缩略图/播放器/进度条均为共用件(剪辑视图同用),见上方 shotThumbHTML/playerBlockHTML/progressBlockHTML */
    const thumbOf = (s, i, col) => shotThumbHTML(p, ep, s, i, sel, col);
    const playerHTML = playerBlockHTML(p, ep, sel, selIdx);
    const progressHTML = progressBlockHTML(p, ep, doneCnt);
    const headHTML = `
    <div class="row" style="margin-bottom:8px;gap:8px">
      <b class="crumb" data-x="rename" title="点击改名" style="margin:0">${selIdx + 1}.${U.esc(sel.name || (sel.plot || '').slice(0, 12) || '镜头' + (selIdx + 1))} ✏</b>
      <span class="grow"></span>
      ${sel.final ? '<span class="tag yellow">🚩 终稿</span>' : ''}
      ${sel.transition ? `<span class="tag purple">⤳ ${U.esc(sel.transition)}</span>` : ''}
    </div>`;
    /* 时间轴下方只保留剧情概要区(随时间轴联动);原底部生成命令条已移除——模型/时长/生成视频/引用资产/快捷提示词均在右栏 */
    const footHTML = layout === 'column' ? scriptRefHTML(p, ep, sel, selIdx) : scriptTrackHTML(p, ep, sel, selIdx);
    /* 数列式:分镜竖列在左(可滚),大屏+进度+剧情概要卡在右(对齐预览长视频布局) */
    if (layout === 'column') return `
    ${headHTML}
    <div class="row" style="gap:12px;align-items:flex-start">
      <div data-strip style="width:158px;flex:none;max-height:calc(100vh - 300px);overflow-y:auto;display:flex;flex-direction:column;gap:8px">
        ${ep.shots.map((s, i) => thumbOf(s, i, true)).join('')}
        <div class="ws-thumb ws-thumb-add" data-x="addshot" title="末尾新增分镜" style="width:100%">＋</div>
      </div>
      <div class="grow" style="min-width:0">
        ${playerHTML}
        ${progressHTML}
        ${footHTML}
      </div>
    </div>`;
    /* 时间轴(默认):大屏在上,分镜横排在下 */
    return `
    ${headHTML}
    ${playerHTML}
    <div class="ws-strip-wrap">
      <div class="ws-strip" data-strip>
        ${ep.shots.map((s, i) => thumbOf(s, i, false)).join('')}
        <div class="ws-thumb ws-thumb-add" data-x="addshot" title="末尾新增分镜">＋</div>
      </div>
      ${progressHTML}
    </div>
    ${footHTML}`;
  }

  /* ================= 剪辑视图(「生成」步骤独立页:排顺序 · 定转场 · 审片选优 · 合成出片) ================= */
  /* 转场选择弹窗(剪辑槽位/转场卡共用);转场记在后一镜 s.transition 上(该镜与前一镜之间),
   * 合成时随段传服务端 xfade/acrossfade 真实渲染(不支持类型降级硬切并提示) */
  function openTransPicker(p, ep, s, main) {
    const idx = ep.shots.indexOf(s);
    U.openModal({
      title: '转场(镜头 ' + idx + ' → 镜头 ' + (idx + 1) + ')',
      body: `<div class="hint" style="margin:0 0 10px">转场是后期剪辑参数,不参与 AI 生成;合成/导出时按此衔接(服务端 FFmpeg xfade 渐变/叠化/黑场/闪白等真实渲染,匹配剪辑等类型降级为硬切)</div>
      <div class="model-row wrap">${['(无·硬切)'].concat(TRANSITIONS).map(t => `<div class="model-opt" data-tr="${t === '(无·硬切)' ? '' : t}">${t}</div>`).join('')}</div>`,
      onMount(m, close) {
        m.querySelectorAll('[data-tr]').forEach(o => o.onclick = () => {
          s.transition = o.dataset.tr || null; Store.save();
          close(); Views.episode(main, p.id, ep.id);
          U.toast(o.dataset.tr ? '转场已设置:' + o.dataset.tr : '已改为无转场(硬切)', 'success');
        });
      },
    });
  }

  /* 中栏(剪辑):播放器 + 带转场槽的时间轴(槽位在后一镜之前,点击设置该镜与前一镜的转场) */
  function cutHTML(p, ep, sel, selIdx, doneCnt) {
    return `
    <div class="row" style="margin-bottom:8px;gap:8px">
      <b class="crumb" data-x="rename" title="点击改名" style="margin:0">${selIdx + 1}.${U.esc(sel.name || (sel.plot || '').slice(0, 12) || '镜头' + (selIdx + 1))} ✏</b>
      <span class="grow"></span>
      <span class="small muted">✂ 剪辑台:拖动调序 · 点 ⇄ 槽定转场 · 右栏审片选优后合成</span>
    </div>
    ${playerBlockHTML(p, ep, sel, selIdx)}
    <div class="ws-strip-wrap">
      <div class="ws-strip" data-strip>
        ${ep.shots.map((s, i) => shotThumbHTML(p, ep, s, i, sel, false) + (i < ep.shots.length - 1 ? `
        <div class="cut-slot ${ep.shots[i + 1].transition ? 'on' : ''}" data-tslot="${ep.shots[i + 1].id}" title="转场:镜头${i + 1} → ${i + 2}(点击设置)">${ep.shots[i + 1].transition ? '⤳ ' + U.esc(ep.shots[i + 1].transition) : '⇄'}</div>` : '')).join('')}
        <div class="ws-thumb ws-thumb-add" data-x="addshot" title="末尾新增分镜">＋</div>
      </div>
      ${progressBlockHTML(p, ep, doneCnt)}
    </div>`;
  }

  /* 右栏(剪辑):转场设置 + 版本与审片 + 合成出口(时间线微调/预览/合成) */
  function cutRightHTML(p, ep, sel, selIdx) {
    return `
    <div class="ws-right-body">
      <div class="card" style="padding:12px;margin-bottom:10px">
        <b class="small">⇄ 转场 · 镜头${selIdx} → 镜头${selIdx + 1}</b>
        ${selIdx === 0 ? '<div class="hint" style="margin-top:6px">第一镜无上一镜,无需转场</div>' : `
        <div class="row wrap" style="gap:5px;margin-top:8px">
          <span class="tag ${!sel.transition ? 'cyan' : ''}" style="cursor:pointer" data-ctr="">无(硬切)</span>
          ${TRANSITIONS.map(t => `<span class="tag ${sel.transition === t ? 'cyan' : ''}" style="cursor:pointer" data-ctr="${t}">${t}</span>`).join('')}
        </div>
        <div class="hint" style="margin-top:6px">转场为后期剪辑参数,不参与 AI 生成;也可点时间轴上的 ⇄ 槽位快速设置</div>`}
      </div>
      ${versCardHTML(sel)}
      <div class="ws-right-foot">
        <button class="btn sm" data-x="cuttl" style="width:100%;margin-bottom:6px" title="逐镜微调入点/出点、调整顺序、取舍分镜">🎞 时间线微调(出入点/顺序/取舍)</button>
        <div class="row" style="gap:6px">
          <button class="btn" data-x="cutpreview">▶ 预览长视频</button>
          <button class="btn primary grow" data-x="cutcompose">🎞 合成成片 <span class="cost-pill" style="margin:0 0 0 6px">${COST.compose} 积分</span></button>
        </div>
      </div>
    </div>`;
  }

  /* ---- 美术风格后缀:实现下沉 domain.js(双端单一来源);注入本集每个分镜的生成提示词(已含不重复) ---- */
  function artSuffixOf(p, ep) {
    return Domain.artSuffixOf(p, ep);
  }
  function artSuffixApp(p, ep, base) {
    return Domain.artSuffixApp(p, ep, base);
  }

  /* 美术风格后缀编辑弹窗:附项目风格/影调/专家/导演设定参照,保存后注入本集全部分镜提示词 */
  function openArtSuffix(p, ep, main) {
    const ds = (Store.state.settings || {}).directorSetting;
    const expert = window.hiredExpert && window.hiredExpert();
    const dsTxt = ds ? (window.DIR_DIMS || []).map(d => d + '「' + (ds[d] || '—') + '」').join('、') : '';
    U.openModal({
      title: '🎨 美术风格(' + U.esc(ep.title || '') + ')',
      body: `
      <div class="card" style="padding:10px 12px;margin-bottom:10px;background:var(--bg2)">
        <div class="small" style="line-height:2">
          <div><span class="muted">项目画风·影调:</span>${U.esc(styleOf(p))}</div>
          ${p.globalSetting ? `<div><span class="muted">全局设定:</span>${U.esc(p.globalSetting)}</div>` : ''}
          ${expert ? `<div><span class="muted">雇佣专家:</span>${U.esc(expert.name)}</div>` : ''}
          ${dsTxt ? `<div><span class="muted">导演设定:</span>${U.esc(dsTxt)}</div>` : ''}
        </div>
      </div>
      <label class="field"><span>本集美术风格后缀(留空则使用上方默认风格)</span>
        <textarea class="input" data-f="suf" rows="3" placeholder="${U.esc(styleOf(p))}">${U.esc(ep.styleSuffix || '')}</textarea></label>
      <div class="hint">作为系统后缀自动解析追加到本集每个待生成分镜的提示词末尾(提示词已包含则不重复追加)</div>`,
      footer: `<button class="btn" data-x="reset">恢复默认</button><button class="btn primary" data-x="ok">保存</button>`,
      onMount(m, close) {
        m.querySelector('[data-x=ok]').onclick = () => { ep.styleSuffix = m.querySelector('[data-f=suf]').value.trim(); Store.save(); close(); Views.episode(main, p.id, ep.id); U.toast('美术风格已保存,将注入本集分镜提示词', 'success'); };
        m.querySelector('[data-x=reset]').onclick = () => { delete ep.styleSuffix; Store.save(); close(); Views.episode(main, p.id, ep.id); U.toast('已恢复为项目默认风格', 'success'); };
      },
    });
  }

  /* ---- 右栏:分镜/素材/声音 ---- */
  function rightHTML(p, ep, sel, selIdx) {
    const tab = ep.rightTab || '分镜';
    const subjOf = name => {
      const r = Store.findSubject(p, name);
      return r ? (r.form ? { name, image: r.form.image, kind: r.s.kind, refAudio: r.s.refAudio } : r.s) : null;
    };
    /* 分镜 tab 预计算:连抽数/主体缺失与缺图/素材审核警示/参考图/识别补充(版本与审片数据由 versCardHTML 自算)
     * 十六轮 主体缺失标记:引用名在主体库中找不到(被删除,formerNames 也兜不住)与"主体在但缺图"分开标记——
     * 前者生成时完全不带主体参考(静默丢一致性),后者只是废片风险高 */
    const drawN = [1, 2, 3].includes(ep.uiDrawN) ? ep.uiDrawN : 1;
    const missSubj = [], missImg = [];
    (sel.characters || []).forEach(c => { const sj = subjOf(c); if (!sj) missSubj.push(c); else if (!(sj.image || sj.imgRef)) missImg.push(c); });
    if (sel.scene) { const sj = subjOf(sel.scene); if (!sj) missSubj.push(sel.scene); else if (!(sj.image || sj.imgRef)) missImg.push(sel.scene); }
    (sel.props || []).forEach(pr => { if (!subjOf(pr)) missSubj.push(pr); });
    const revStatus = {}; (Store.state.assetReviews || []).forEach(r => { if (r.url && !(r.url in revStatus)) revStatus[r.url] = r.status; });
    const shotUrls = window.HumanReview ? HumanReview.shotImageUrls(p, sel) : [];
    const rejCnt = shotUrls.filter(u2 => revStatus[u2] === 'rejected').length;
    const pendCnt = shotUrls.filter(u2 => revStatus[u2] === 'pending').length;
    const warnLines = [];
    if (missSubj.length) warnLines.push(`出场主体不存在:${missSubj.map(U.esc).join('、')}——可能已被删除,生成时将不带其参考;请到「主体」重建,或从分镜中移除`);
    if (missImg.length) warnLines.push(`出场主体缺图:${missImg.map(U.esc).join('、')}——废片风险高,先到「主体」补图或注册主体`);
    if (rejCnt) warnLines.push(`${rejCnt} 个引用素材真人审核未通过,生成会被拦截,请更换或重新提交审核`);
    if (pendCnt) warnLines.push(`${pendCnt} 个引用素材真人审核中,通过前生成可能失败`);
    const warnBar = warnLines.length ? `<div class="card" style="padding:8px 12px;margin-bottom:10px;border-color:var(--yellow);background:rgba(245,158,11,.08)"><b class="small" style="color:var(--yellow)">⚠ 防废片提醒</b>${warnLines.map(w => `<div class="small" style="margin-top:4px;line-height:1.7">${w}</div>`).join('')}</div>` : '';
    const refs = recognizedRefs(p, sel); // 提示词/剧情中识别到的资产参考图(缩略行)
    const listedNames = new Set([...(sel.characters || []), sel.scene, ...(sel.props || [])].filter(Boolean));
    const recogExtra = assetsInText(p, (sel.prompt || '') + '　' + (sel.plot || '')).filter(n => !listedNames.has(n.name) && ![...listedNames].some(b2 => n.name.startsWith(b2 + '-')));
    return `
    <div class="card" style="padding:8px 12px;margin-bottom:10px">
      <div class="row" style="gap:8px;align-items:center">
        <b class="small" style="flex:none">🎨 美术风格</b>
        <span class="small muted grow" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${U.esc(artSuffixOf(p, ep))}">${U.esc(artSuffixOf(p, ep)) || '(未设置,点 ✏ 定义)'}</span>
        <button class="btn ghost sm" data-ract="artsuffix" title="编辑本集美术风格后缀">✏</button>
      </div>
      <div class="hint" style="margin:4px 0 0">作为系统后缀自动解析追加到本集每个待生成分镜的提示词中(已包含则不重复)</div>
    </div>
    <div class="tabs" style="margin-bottom:10px">
      ${['分镜', '素材', '声音'].map(t => `<div class="tab ${tab === t ? 'active' : ''}" data-rtab="${t}">${t}</div>`).join('')}
    </div>
    ${tab === '分镜' ? `
    <div class="ws-right-body">
      <label class="field" style="margin-bottom:8px"><span>剧情内容</span>
        ${!sel.plot || ep.uiPlotEdit
          ? `<textarea class="input small" rows="2" data-r="plot" placeholder="本镜剧情(一句话)">${U.esc(sel.plot || '')}</textarea>${ep.uiPlotEdit && sel.plot ? '<div class="row" style="justify-content:flex-end;margin-top:4px"><button class="btn ghost sm" data-x="plotdone" style="padding:2px 10px">✓ 完成</button></div>' : ''}`
          : `<div class="small" data-x="plotview" title="点击编辑剧情" style="cursor:text;background:var(--bg2);border:1px solid var(--border);border-radius:8px;padding:6px 10px;line-height:2">${assetChipsHTML(p, sel.plot)}</div>`}
      </label>
      <label class="field" style="margin-bottom:8px"><span>视频出镜(出场主体)</span>
        <div class="row wrap" style="gap:5px;align-items:center">
          <span class="small muted" style="flex:none;width:56px">参考角色</span>
          ${(sel.characters || []).map(c => { const sj = subjOf(c); if (!sj) return `<span class="tag red" title="✕ 主体不存在(可能已删除),生成时将不带其参考——到「主体」重建或从分镜移除">✕ ${U.esc(c)}</span>`; const noImg = !(sj.image || sj.imgRef); return `<span class="tag ${noImg ? 'red' : 'cyan'}" title="${noImg ? '⚠ 缺主体图,废片风险高(到「主体」补图)' : '已绑定主体图'}">${noImg ? '⚠ ' : '🖼 '}${U.esc(c)}</span>`; }).join('') || '<span class="small muted">无</span>'}
        </div>
        <div class="row wrap" style="gap:5px;align-items:center;margin-top:5px">
          <span class="small muted" style="flex:none;width:56px">参考场景</span>
          ${sel.scene ? (() => { const sj = subjOf(sel.scene); if (!sj) return `<span class="tag red" title="✕ 场景主体不存在(可能已删除),生成时将不带其参考——到「主体」重建或从分镜移除">✕ ${U.esc(sel.scene)}</span>`; const noImg = !(sj.image || sj.imgRef); return `<span class="tag ${noImg ? 'red' : 'green'}" title="${noImg ? '⚠ 缺场景图(到「主体」补图)' : '已绑定场景图'}">${noImg ? '⚠ ' : '🏞 '}${U.esc(sel.scene)}</span>`; })() : '<span class="small muted">无</span>'}
        </div>
        <div class="row wrap" style="gap:5px;align-items:center;margin-top:5px">
          <span class="small muted" style="flex:none;width:56px">参考道具</span>
          ${(sel.props || []).map(pr => subjOf(pr) ? `<span class="tag yellow">🗡 ${U.esc(pr)}</span>` : `<span class="tag red" title="✕ 道具主体不存在(可能已删除)——到「主体」重建或从分镜移除">✕ ${U.esc(pr)}</span>`).join('') || '<span class="small muted">无</span>'}
        </div>
        ${recogExtra.length ? `<div class="row wrap" style="gap:5px;margin-top:5px;align-items:center">
          <span class="small muted" style="flex:none">已识别:</span>
          ${recogExtra.map(n => `<span class="tag ${ASSET_TAG[n.kind] || 'cyan'}" style="font-size:10px">${U.esc(n.name)}</span>`).join('')}
        </div>` : ''}
      </label>
      <label class="field" style="margin-bottom:8px"><span>镜头意图</span><input class="input small" data-r="intent" value="${U.esc(sel.intent || '')}" placeholder="这个镜头为什么存在(可选;运镜/轴线由分镜智能体按规则自动处理)"></label>
      <div class="card" style="padding:12px;margin-bottom:10px">
        <div class="row" style="justify-content:space-between;margin-bottom:6px">
          <b class="small">📝 生成提示词 · 镜头${selIdx + 1}(预估 ${SBGen.estShotDuration(sel)} 秒)</b>
          <span class="small muted" data-x="pcount">${(sel.prompt || '').length} 字</span>
        </div>
        <textarea class="input small" rows="8" data-r="prompt">${U.esc(sel.prompt)}</textarea>
        ${refs.length ? `<div class="row wrap" style="gap:8px;margin-top:8px;align-items:center">
          <span class="small muted" style="flex:none">参考图:</span>
          ${refs.map((r, i) => `<img data-refimg="${i}" src="${U.thumb(r.img)}" title="${U.esc(r.name)}(点击放大核对)" style="width:64px;height:64px;object-fit:cover;border-radius:8px;cursor:pointer;border:1px solid var(--border)">`).join('')}
        </div>` : ''}
        <div class="row wrap" style="gap:6px;margin-top:8px">
          <button class="btn sm" data-ract="smartref" title="扫描提示词中的资产名,自动关联参考图">⌖ 智能识别</button>
          <button class="btn sm" data-ract="atref" title="角色/场景/道具按 @名称 注入并关联参考图">＠ 引用资产</button>
          <button class="btn sm" data-ract="bigprompt" title="全屏编辑本镜提示词(内含提示词润色/历史提示词/收藏提示词)">🔍 大屏编辑</button>
        </div>
      </div>
      ${warnBar}
      <div class="card" style="padding:12px;margin-bottom:10px">
        <b class="small">生成设置</b>
        <div class="row wrap" style="gap:6px;margin-top:6px">
          ${STRATEGIES.map(st => `<div class="rpill ${((sel.genStrategy || 'ref') === st.id ? 'sel' : '')}" data-strategy="${st.id}" style="min-width:0;padding:6px 12px;font-size:12px"><i></i>${st.name}</div>`).join('')}
        </div>
        <div class="hint" style="margin-top:5px">${STRATEGIES.find(st => st.id === (sel.genStrategy || 'ref')).desc}</div>
        ${sel.strategyHint && (sel.genStrategy || 'ref') !== sel.strategyHint ? `<div class="row" style="gap:6px;margin-top:6px;align-items:center"><span class="tag purple" style="font-size:10px" title="拆镜时按画面动态给出的策略建议">拆镜建议:${(STRATEGIES.find(st => st.id === sel.strategyHint) || {}).name || sel.strategyHint}</span><button class="btn ghost sm" data-ract="adopthint">采纳</button></div>` : ''}
        ${(sel.genStrategy === 'frames') ? `
        <div class="row" style="gap:10px;margin-top:10px">
          <div style="flex:1">
            <div class="small muted" style="margin-bottom:4px">首帧</div>
            <div class="ws-thumb-img" style="aspect-ratio:16/9">${sel.firstFrame ? `<img src="${U.thumb(sel.firstFrame)}">` : '<div class="ws-thumb-empty">未设置</div>'}</div>
            <div class="row" style="gap:4px;margin-top:4px">
              <button class="btn ghost sm" data-ract="ffirst">↻ 生成首帧</button>
              <button class="btn ghost sm" data-ract="fpick" title="宫格海选:一次文生图出 2×2 构图变体(1 次 ${COST.image} 积分顶 4 张,同批风格一致),4 选 1 回填首帧">🀄 海选</button>
            </div>
          </div>
          <div style="flex:1">
            <div class="small muted" style="margin-bottom:4px">尾帧</div>
            <div class="ws-thumb-img" style="aspect-ratio:16/9">${sel.lastFrame ? `<img src="${U.thumb(sel.lastFrame)}">` : '<div class="ws-thumb-empty">生成视频后写入</div>'}</div>
            <button class="btn ghost sm" style="margin-top:4px" data-ract="flast">↻ 生成尾帧</button>
          </div>
        </div>
        <div class="check-line" data-ract="inherit" style="margin-top:8px;${selIdx === 0 ? 'opacity:.5' : ''}">
          <span class="switch ${sel.inheritTail ? 'on' : ''}"></span>
          <span class="small">继承前镜尾帧${selIdx === 0 ? '(第一镜无上一镜,不可用)' : '(首帧自动 = 上一镜尾帧,保持画面连贯)'}</span>
        </div>` : ''}
        <div class="row" style="gap:6px;margin-top:10px">
          <button class="btn sm grow" data-ract="valimg" ${sel.final ? 'disabled title="已定为终稿,解锁后可重新生成"' : ''} title="廉价改图验证:改提示词/换主体后,先按当前输入出一张静态验证图(主体参考≥2 张按多图融合 3 积分,否则文生图 2 积分,约 1 分钟),满意后再点「生成视频」;验证图自动设为分镜参考图(ref 策略生效),覆盖前自动留档可回滚">🖼 出验证图 <span class="cost-pill" style="margin:0 0 0 6px">${COST.image}~${COST.fusion} 积分</span></button>
        </div>
        <div class="hint" style="margin-top:4px">改图先验证:出图 2~3 积分 ≈ 1 分钟,远比直接抽视频(${COST.video} 积分起)便宜;验证图即 ref 策略的分镜参考图</div>
      </div>
      ${versCardHTML(sel)}
      <div class="row" style="gap:5px;flex-wrap:wrap;margin-bottom:10px;align-items:center">
        <div class="dd">
          <button class="btn ghost sm" data-x="dd-ops">⋯ 分镜操作 ▾</button>
          <div class="dd-menu" data-ddm="ops" style="display:none">
            <button data-ract="chatref">📎 加入对话<span class="small muted" style="display:block;font-weight:400">把本镜挂进导演助手引用,对话里精准@它</span></button>
            <button data-ract="insert">＋ 插入分镜<span class="small muted" style="display:block;font-weight:400">在本镜之后插入空白分镜</span></button>
            <button data-ract="trans">⇄ 新增转场<span class="small muted" style="display:block;font-weight:400">本镜与下一镜之间</span></button>
            <button data-ract="dl">⬇ 下载本镜</button>
            <button data-ract="recycle">♻ 回收到待生成<span class="small muted" style="display:block;font-weight:400">清掉画面与视频,留档可回滚</span></button>
            <button data-ract="more">🧰 更多工具<span class="small muted" style="display:block;font-weight:400">超分/去字幕/抽帧等</span></button>
          </div>
        </div>
        <span class="grow"></span>
        <button class="btn ghost sm danger" data-ract="del">🗑 删除分镜</button>
      </div>
      <div class="ws-right-foot">
        <div class="row" style="gap:6px;margin-bottom:6px;align-items:center">
          <select class="select small grow" data-r="vmodel">${MODELS.video.map(mo => `<option ${sel.videoModel === mo ? 'selected' : ''}>${mo}</option>`).join('')}</select>
          <span class="small muted" style="flex:none" title="按上方提示词与台词自动预估,无需手填">约 <b data-x="durest">${SBGen.estShotDuration(sel)}</b> 秒</span>
        </div>
        <div class="row" style="gap:6px;margin-bottom:6px;align-items:center">
          <span class="small muted" style="flex:none">连抽</span>
          <div class="model-row" style="gap:4px">${[1, 2, 3].map(n => `<div class="model-opt ${drawN === n ? 'sel' : ''}" data-drawn="${n}" style="padding:3px 10px;font-size:12px">×${n}</div>`).join('')}</div>
          <span class="grow"></span>
          <span class="small muted" style="flex:none">合计 ${COST.video * drawN} 积分</span>
        </div>
        <div class="row" style="gap:6px">
          <button class="btn primary grow" data-ract="create" ${sel.final ? 'disabled title="已定为终稿,解锁后可重新生成"' : ''}>${drawN > 1 ? `连抽×${drawN}` : '生成视频'} <span class="cost-pill" style="margin:0 0 0 6px">${COST.video * drawN} 积分</span></button>
          ${Store.shotVideoReady(sel) && !sel.final ? `<button class="btn" data-ract="redraw" title="不改任何参数,同提示词直接再抽一版(-${COST.video}积分)">🔁 再抽</button>` : ''}
          ${Store.shotVideoReady(sel) && ep.sbConfig.syncVoice ? `<button class="btn" data-ract="audio" ${sel.final ? 'disabled' : ''}>🔊 音频</button>` : ''}
        </div>
      </div>
    </div>` : tab === '素材' ? `
    <div class="ws-right-body">
      <b class="small">本镜关联主体素材</b>
      <div class="grid" style="grid-template-columns:1fr 1fr;gap:8px;margin-top:10px">
        ${[(sel.characters || []).map(c => ({ n: c, k: 'character' })), sel.scene ? [{ n: sel.scene, k: 'scene' }] : [], (sel.props || []).map(pr => ({ n: pr, k: 'prop' }))].flat().map(({ n, k }) => {
          const sj = subjOf(n);
          return `<div class="card" style="padding:8px">
            <div style="height:80px;border-radius:6px;overflow:hidden;background:var(--bg2);display:flex;align-items:center;justify-content:center">
              ${sj && sj.image ? `<img src="${U.thumb(sj.image)}" style="width:100%;height:100%;object-fit:cover">` : '<span class="small muted">未生成图</span>'}
            </div>
            <div class="small" style="margin-top:5px">${U.esc(n)} <span class="tag ${k === 'character' ? 'cyan' : k === 'scene' ? 'green' : 'yellow'}" style="font-size:10px">${{ character: '角色', scene: '场景', prop: '道具' }[k]}</span>${sj && sj.isSubject ? '<span class="tag green" style="font-size:10px">📌 主体</span>' : ''}</div>
            ${sj && sj.refAudio ? `<audio controls src="${U.esc(sj.refAudio.url)}" title="音色参考:${U.esc(sj.refAudio.name)}" style="width:100%;height:24px;margin-top:5px"></audio>` : ''}
          </div>`;
        }).join('') || '<div class="empty"><p class="small">本镜无关联主体</p></div>'}
      </div>
      <button class="btn sm" style="margin-top:10px" data-ract="keyframe">🖼 选帧入库(资产库·关键帧)</button>
    </div>` : `
    <div class="ws-right-body">
      <label class="field"><span>旁白</span><textarea class="input small" rows="3" data-r="narration">${U.esc(sel.narration || '')}</textarea></label>
      <label class="field"><span>台词</span><input class="input small" data-r="dialogue" value="${U.esc(sel.dialogue || '')}"></label>
      <label class="field"><span>人物音色</span>
        <select class="select small" data-r="voice">${VOICES.map(v => `<option ${sel.voice === v ? 'selected' : ''}>${v}</option>`).join('')}</select>
      </label>
      <div class="kv" style="margin-bottom:10px">
        <span class="k">同步语音</span><span class="tag ${ep.sbConfig.syncVoice ? 'green' : ''}">${ep.sbConfig.syncVoice ? '已开启' : '已关闭'}</span>
        <span class="k">合成字幕</span><span class="tag ${ep.sbConfig.subtitle ? 'green' : ''}">${ep.sbConfig.subtitle ? '已开启' : '已关闭'}</span>
        ${(() => { // 配音渲染凭据:本镜音轨用的是什么音色参数、能否混入成片(旧数据无参数记录时如实标注)
          const m = Domain.audioMetaOf(sel);
          if (!m) return '';
          const pm = m.params;
          const desc = m.legacy || !pm ? '旧数据(参数未落库)' : `${m.voice}·${pm.rate}x·音量${pm.volume}·${pm.emotion}`;
          const state = m.offline ? '<span class="tag yellow">离线占位(不混入成片)</span>'
            : Domain.audioStale(p, ep, sel) ? '<span class="tag yellow">参数/文本已变更,建议重配音</span>'
              : '<span class="tag green">可混入成片</span>';
          return `<span class="k">已配音</span><span>${U.esc(desc)}${m.voiceId ? `<span class="small muted" title="上游音色 id"> ${U.esc(m.voiceId)}</span>` : ''}</span>
        <span class="k">配音状态</span><span>${state}</span>`;
        })()}
      </div>
      <button class="btn sm primary" data-ract="audio" ${sel.final ? 'disabled' : ''}>🔊 生成音频(-${COST.audio}积分)</button>
    </div>`}
    </div>`;
  }

  /* ---- 中栏交互 ---- */
  function bindCenter(main, p, ep, sel, selIdx) {
    main.querySelector('[data-x=rename]').onclick = () => {
      U.openModal({
        title: '分镜命名',
        body: `<label class="field"><span>镜头名称</span><input class="input" data-f="n" value="${U.esc(sel.name || '')}" placeholder="${U.esc((sel.plot || '').slice(0, 12))}"></label>`,
        footer: `<button class="btn primary" data-x="ok">保存</button>`,
        onMount(m, close) {
          m.querySelector('[data-x=ok]').onclick = () => { sel.name = m.querySelector('[data-f=n]').value.trim(); Store.save(); close(); Views.episode(main, p.id, ep.id); };
        },
      });
    };
    main.querySelector('[data-x=bigplay]').onclick = e => {
      if (e.target && e.target.closest && e.target.closest('[data-pv]')) return; // 点在真实视频上:交给播放器控件,不抢事件
      if (e.target && e.target.closest && e.target.closest('[data-x=stopadv],[data-x=retrygen],[data-x=editprompt],[data-x=valimg]')) return; // 失败诊断卡片:按钮自处理,不触发全屏预览
      window.SB.openPlayer(p, ep, false);
    };
    // 失败诊断卡片:修改提示词 / 廉价验证图 / 重新生成
    const epb = main.querySelector('[data-x=editprompt]');
    if (epb) epb.onclick = e => { e.stopPropagation(); openPromptPanel(p, ep, sel, main); };
    const vig = main.querySelector('[data-x=valimg]');
    if (vig) vig.onclick = e => { e.stopPropagation(); SBGen.genShotValidate(p, ep, sel, main); };
    const rpg = main.querySelector('[data-x=retrygen]');
    if (rpg) rpg.onclick = e => { e.stopPropagation(); Commands.execute('shot.generateVideo', { pid: p.id, epid: ep.id, sid: sel.id, main, ui: true }).then(r => Commands.digest(r)); }; // 统一命令层(ui 模式)
    // 剧情概要轨道:点击概要格切镜;与时间轴双向滚动联动;渲染后选中镜居中(概要起始位随时间轴滑动)
    main.querySelectorAll('.ws-refcell[data-ref]').forEach(c => c.onclick = () => {
      if (window.__selMode) return;
      ep.uiSel = c.dataset.ref;
      Store.save();
      Views.episode(main, p.id, ep.id);
    });
    const stripEl = main.querySelector('[data-strip]');
    const refTrack = main.querySelector('[data-reftrack]');
    if (stripEl && refTrack) {
      let syncing = false;
      const sync = (from, to) => { if (syncing) return; syncing = true; to.scrollLeft = from.scrollLeft; syncing = false; };
      stripEl.addEventListener('scroll', () => sync(stripEl, refTrack));
      refTrack.addEventListener('scroll', () => sync(refTrack, stripEl));
      const selThumb = stripEl.querySelector('.ws-thumb.sel');
      if (selThumb) {
        const sr = stripEl.getBoundingClientRect(), tr = selThumb.getBoundingClientRect();
        stripEl.scrollLeft += (tr.left + tr.width / 2) - (sr.left + sr.width / 2);
        refTrack.scrollLeft = stripEl.scrollLeft;
      }
    }
    /* ---- 时间轴连播:当前镜播完自动切下一镜(无视频的镜头跳过),到末尾自动停止 ---- */
    const advancePlay = () => {
      for (let i = selIdx + 1; i < ep.shots.length; i++) {
        const s2 = ep.shots[i];
        if (s2.video && s2.video.status === 'done' && s2.video.url) {
          ep.uiSel = s2.id;
          Store.save();
          Views.episode(main, p.id, ep.id);
          const v2 = main.querySelector('[data-pv]');
          if (v2) v2.play().catch(() => U.toast('浏览器拦截了自动播放,请点一下播放键继续连播', 'info', 3000));
          return;
        }
      }
      ep.uiAutoPlay = false;
      Store.save();
      U.toast('连播完成,已到最后一镜', 'success');
      Views.episode(main, p.id, ep.id);
    };
    const pv = main.querySelector('[data-pv]');
    if (pv) pv.addEventListener('ended', () => { if (ep.uiAutoPlay) advancePlay(); });
    const apBtn = main.querySelector('[data-x=autoplay]');
    if (apBtn) apBtn.onclick = () => {
      ep.uiAutoPlay = !ep.uiAutoPlay;
      Store.save();
      if (!ep.uiAutoPlay) { Views.episode(main, p.id, ep.id); return; }
      Views.episode(main, p.id, ep.id); // 先重渲出「连播中」态,再播新元素
      const v2 = main.querySelector('[data-pv]');
      if (v2) v2.play().catch(() => U.toast('浏览器拦截了自动播放,请点一下播放键开始连播', 'info', 3000));
      else advancePlay(); // 当前镜无视频:切到下一镜可播的
    };
    // 存量占位封面后台升级:有真实视频但封面缺失/为 PH 占位(png dataURL)时,后台截首帧上传替换(每次渲染最多 2 镜)
    if (window.Media && Media.captureFrameUp) {
      let upgraded = 0;
      for (const s of ep.shots) {
        if (upgraded >= 2) break;
        const vurl = s.video && s.video.status === 'done' && s.video.url;
        const f = s.video && s.video.frame;
        if (vurl && (!f || String(f).startsWith('data:image/png'))) {
          upgraded++;
          Media.captureFrameUp(vurl, 0.1, 'cover_' + s.id + '.jpg').then(url => {
            if (url) { s.video.frame = url; Store.save(); if (onEpPage(p, ep)) Views.episode(main, p.id, ep.id); }
          });
        }
      }
    }
    main.querySelector('[data-x=addshot]').onclick = () => {
      const ns = blankShot(ep.shots.length, ep.sbConfig);
      ns.plot = '(新分镜,请在右栏编辑剧情)';
      ns.prompt = buildShotPrompt(p, { plot: ns.plot });
      ep.shots.push(ns);
      ep.uiSel = ns.id;
      Store.save(); Views.episode(main, p.id, ep.id);
    };
    // 缩略图点击:选择模式勾选 / 普通切换选中
    main.querySelectorAll('.ws-thumb[data-shot]').forEach(t => t.onclick = e => {
      if (window.__selMode) {
        if (e.target.closest('button')) return;
        BatchOps.toggle(t.dataset.shot, p, ep, main);
        return;
      }
      ep.uiSel = t.dataset.shot;
      Store.save();
      Views.episode(main, p.id, ep.id);
    });
    // 缩略图拖拽调序(整合原「分镜序列」弹窗能力到时间轴,落子即存;选择模式下禁用)
    let dragId = null;
    main.querySelectorAll('.ws-thumb[data-shot]').forEach(t => {
      t.addEventListener('dragstart', () => { if (window.__selMode) return; dragId = t.dataset.shot; t.style.opacity = '.5'; });
      t.addEventListener('dragend', () => { t.style.opacity = ''; });
      t.addEventListener('dragover', e => { if (dragId && dragId !== t.dataset.shot) e.preventDefault(); });
      t.addEventListener('drop', e => {
        e.preventDefault();
        if (!dragId || dragId === t.dataset.shot) return;
        const from = ep.shots.findIndex(x => x.id === dragId), to = ep.shots.findIndex(x => x.id === t.dataset.shot);
        dragId = null;
        if (from < 0 || to < 0 || from === to) return;
        ep.shots.splice(to, 0, ep.shots.splice(from, 1)[0]);
        ep.shots.forEach((s, i) => s.order = i);
        Store.save();
        U.toast('排序已保存', 'success', 1200);
        Views.episode(main, p.id, ep.id); // 重渲即刷新序号与首尾帧继承联动(syncFrames 在渲染链路内)
      });
    });
    // 终稿解锁:点缩略图「终稿」徽标解除锁定(定终稿入口在 批量▾ 选择模式)
    main.querySelectorAll('[data-unfinal]').forEach(b => b.onclick = e => {
      if (window.__selMode) return;
      e.stopPropagation();
      const s = ep.shots.find(x => x.id === b.dataset.unfinal);
      if (!s) return;
      s.final = false;
      Store.save();
      U.toast(`镜头${ep.shots.indexOf(s) + 1} 已解锁终稿,可重新生成`, 'success');
      Views.episode(main, p.id, ep.id);
    });
    // 镜头确认闸:点缩略图角标 确认/取消确认本镜(整页重渲,角标与顶部计数同步;原底部命令条的确认钮并入此处)
    main.querySelectorAll('[data-cfm]').forEach(b => b.onclick = e => {
      if (window.__selMode) return; // 选择模式下整卡用于勾选
      e.stopPropagation();
      const s = ep.shots.find(x => x.id === b.dataset.cfm);
      if (!s) return;
      s.confirm = !s.confirm;
      Store.save();
      U.toast(`镜头${ep.shots.indexOf(s) + 1} ${s.confirm ? '已确认' : '已取消确认'}`, 'success');
      Views.episode(main, p.id, ep.id);
    });
    // 取消生成(R19):在途视频任务主动中止——服务端转 cancelled 并按原账单退款,上游晚成功不再交付;
    // 本地不落 upstreamId(已取消不可续查),积分以服务端权威余额回写(本路径不走 U.refund 镜像)
    main.querySelectorAll('[data-cancel]').forEach(b => b.onclick = e => {
      if (window.__selMode) return;
      e.stopPropagation();
      const s = ep.shots.find(x => x.id === b.dataset.cancel);
      if (!s || !s.video || s.video.status !== 'generating' || !s.video.upstreamId) return;
      U.confirm(`取消镜头${ep.shots.indexOf(s) + 1} 的视频生成?已扣积分将退回,上游任务即使晚成功也不再交付。`, async () => {
        try {
          await Media.cancelVideo(s.video.upstreamId);
          s.video = { status: 'failed', error: '已取消生成(积分已退回)', model: s.video.model };
          Store.save();
          if (U.syncCreditsFromServer) U.syncCreditsFromServer(); // 服务端已退:余额回写对齐
          U.toast(`镜头${ep.shots.indexOf(s) + 1} 已取消,积分已退回`, 'success');
          Views.episode(main, p.id, ep.id);
        } catch (err) {
          U.toast('取消失败:' + err.message, 'error', 3500);
        }
      });
    });
    /* ---- 剪辑视图专属:转场槽/转场卡/时间线微调/预览/合成 ---- */
    main.querySelectorAll('[data-tslot]').forEach(t => t.onclick = () => {
      const s2 = ep.shots.find(x => x.id === t.dataset.tslot);
      if (s2) openTransPicker(p, ep, s2, main);
    });
    main.querySelectorAll('[data-ctr]').forEach(t => t.onclick = () => {
      sel.transition = t.dataset.ctr || null;
      Store.save();
      Views.episode(main, p.id, ep.id);
    });
    const cutTl = main.querySelector('[data-x=cuttl]');
    if (cutTl) cutTl.onclick = () => { if (window.Timeline) Timeline.openCompose(p, ep, main); };
    const cutPv = main.querySelector('[data-x=cutpreview]');
    if (cutPv) cutPv.onclick = () => window.SB.openPlayer(p, ep, false);
    const cutCp = main.querySelector('[data-x=cutcompose]');
    if (cutCp) cutCp.onclick = () => {
      if (window.Media && Media.isReady() && window.Timeline) {
        const usable = ep.shots.filter(s => (Store.shotVideoReady(s) && s.video.url) || s.image); // 统一就绪判定
        if (usable.length) return Timeline.openCompose(p, ep, main);
      }
      Commands.execute('episode.compose', { pid: p.id, epid: ep.id, main, ui: true }).then(r => Commands.digest(r)); // 统一命令层(ui 模式)
    };
  }

  /* ---- 右栏交互 ---- */
  function bindRight(main, p, ep, sel, selIdx) {
    const rerender = () => { Store.save(); Views.episode(main, p.id, ep.id); };
    main.querySelectorAll('[data-rtab]').forEach(t => t.onclick = () => { ep.rightTab = t.dataset.rtab; Store.save(); Views.episode(main, p.id, ep.id); });
    // 字段编辑(即改即存,不整页刷新避免丢焦点)
    const bindInput = (k, fn) => {
      const el = main.querySelector(`[data-r="${k}"]`);
      if (el) el.onchange = () => { const old = sel[k]; sel[k] = el.value; if (fn) fn(el.value, old); Store.save(); };
    };
    bindInput('plot', () => { sel.confirm = false; }); // 内容修改自动回落为未确认(镜头确认闸)
    // 提示词统一走 Store.setShotPrompt(自动留档 promptHistory)
    const promptEl = main.querySelector('[data-r="prompt"]');
    if (promptEl) promptEl.onchange = () => { sel.confirm = false; Store.setShotPrompt(sel, promptEl.value); };
    bindInput('narration', () => { sel.confirm = false; }); bindInput('dialogue', () => { sel.confirm = false; }); // 旁白/台词影响时长预估与字幕,同样回落确认闸(与 Agent/CLI 同口径)
    bindInput('voice'); bindInput('vmodel');
    // 单镜时长:不再人工填写,按提示词+台词自动预估(estShotDuration),输入提示词时实时刷新
    const durEstEl = main.querySelector('[data-x=durest]');
    bindInput('intent'); // 运镜/轴线不再为用户字段:由分镜智能体按 KB 规则自动赋予,生成时系统默认注入
    // 生成策略
    main.querySelectorAll('[data-strategy]').forEach(o => o.onclick = () => {
      sel.genStrategy = o.dataset.strategy;
      if (sel.genStrategy === 'frames' && !sel.firstFrame && sel.inheritTail) SBGen.syncFrames(ep, p);
      if (sel.genStrategy === 'frames' && !sel.firstFrame && selIdx > 0 && !sel.inheritTail) sel.firstFrame = SBGen.framePH(sel, 'first');
      if (sel.genStrategy === 'frames' && !sel.firstFrame && selIdx === 0) sel.firstFrame = SBGen.framePH(sel, 'first');
      Store.save(); Views.episode(main, p.id, ep.id);
    });
    main.querySelectorAll('[data-ract]').forEach(b => b.onclick = () => {
      const ddm = b.closest('[data-ddm]'); if (ddm) ddm.style.display = 'none'; // 菜单项触发后收起下拉
      const act = b.dataset.ract;
      if (act === 'ffirst') { SBGen.genShotFrame(p, ep, sel, 'first', main); return; }
      if (act === 'fpick') { SBGen.genShotFramePick(p, ep, sel, main); return; }
      if (act === 'flast') { SBGen.genShotFrame(p, ep, sel, 'last', main); return; }
      if (act === 'adopthint') { // 采纳拆镜策略建议(与手动点选策略同一套 frames 初始化)
        if (!sel.strategyHint) return;
        sel.genStrategy = sel.strategyHint;
        if (sel.genStrategy === 'frames' && !sel.firstFrame) {
          if (sel.inheritTail) SBGen.syncFrames(ep, p);
          if (!sel.firstFrame) sel.firstFrame = SBGen.framePH(sel, 'first');
        }
        Store.save(); Views.episode(main, p.id, ep.id);
        U.toast('已按拆镜建议切换生成策略', 'success');
        return;
      }
      if (act === 'inherit') {
        if (selIdx === 0) return U.toast('第一镜无上一镜,无法继承尾帧', 'error');
        sel.inheritTail = !sel.inheritTail;
        if (sel.inheritTail) {
          const prev = ep.shots[selIdx - 1];
          if (!prev.lastFrame) { sel.inheritTail = false; return U.toast('上一镜尚无尾帧(请先生成上一镜视频或点"生成尾帧")', 'error'); }
          SBGen.syncFrames(ep, p);
          U.toast('已开启继承:首帧 = 上一镜尾帧', 'success');
        }
        rerender(); return;
      }
      if (act === 'create') { // 单抽走统一命令层(ui 模式);连抽×N 为 UI 专属多版流程,维持 drawShotTimes
        const drawN = ep.uiDrawN || 1;
        if (drawN <= 1) Commands.execute('shot.generateVideo', { pid: p.id, epid: ep.id, sid: sel.id, main, ui: true }).then(r => Commands.digest(r));
        else SBGen.drawShotTimes(p, ep, sel, main, drawN);
      }
      else if (act === 'valimg') SBGen.genShotValidate(p, ep, sel, main); // 廉价改图验证:先出静态验证图再决定出视频
      else if (act === 'redraw') Commands.execute('shot.generateVideo', { pid: p.id, epid: ep.id, sid: sel.id, main, ui: true }).then(r => Commands.digest(r)); // 再抽一次:同参数直接重生成(统一命令层 ui 模式)
      else if (act === 'audio') genAudio(p, ep, sel, main);
      else if (act === 'del') U.confirm('删除该分镜?', async () => {
        // 在飞拦截(十一轮):本地任务 + 服务端 running jobs 合并判定(防刷新后孤儿上游任务)
        const guard = window.Tasks ? await Tasks.canDeleteScope({ shotId: sel.id }) : { local: [], remote: [] };
        if (guard.remote == null) return U.toast('任务中心暂时不可达,无法确认是否有在途生成任务,请稍后重试', 'error');
        if (guard.local.length) return U.toast('该分镜正在生成/处理中,请等待完成后再删除', 'error');
        if (guard.remote.length) return U.toast('服务端仍有该镜的生成任务在跑,请等待完成或超时后再删除', 'error');
        ep.shots = ep.shots.filter(x => x.id !== sel.id); ep.shots.forEach((x, i) => x.order = i); ep.uiSel = ep.shots[0] ? ep.shots[0].id : null; rerender(); U.toast('已删除', 'success');
      }, '删除');
      else if (act === 'dl') downloadShot(sel);
      else if (act === 'recycle') { if (sel.final) return U.toast('该分镜已定为终稿,请先「解锁终稿」', 'error'); snapshotShot(sel, '回收前状态'); sel.video = { status: 'none' }; sel.image = null; rerender(); U.toast('已回收到待生成状态', 'success'); }
      else if (act === 'chatref') { // 📎 加入对话:本镜挂进导演助手引用(集级面板 chips,发送时活内容注入 LLM)
        AgentRefs.add({ kind: 'shot', pid: p.id, eid: ep.id, id: sel.id, label: `@镜头${selIdx + 1}${sel.name ? '·' + String(sel.name).slice(0, 8) : ''}` });
        if (!ep.agentOpen) { ep.agentOpen = true; Store.save(); Views.episode(main, p.id, ep.id); }
      }
      else if (act === 'more') openMoreTools(p, sel);
      else if (act === 'artsuffix') openArtSuffix(p, ep, main);
      else if (act === 'bigprompt') openPromptPanel(p, ep, sel, main, true);
      else if (act === 'atref') openAssetPicker(p, ep, sel, main);
      else if (act === 'smartref') smartLinkAssets(p, ep, sel, main);
      else if (act === 'fav') favPrompt(p, ep, sel);
      else if (act === 'hist') openPromptHistory(sel);
      else if (act === 'vers') SBGen.openVersions(p, ep, sel, main);
      else if (act === 'ptool') openPromptTool(sel, main, p, ep);
      else if (act === 'review') Review.openReport(p, ep, sel, main);
      else if (act === 'reviews') Review.openReviewHistory(p, ep, sel, main);
      else if (act === 'keyframe') BatchOps.keyframePanel(p, ep, [sel], main, 0);
      else if (act === 'insert') {
        const ns = blankShot(selIdx + 1, ep.sbConfig);
        ns.plot = '(新插入分镜,请在右栏编辑剧情)';
        ns.prompt = buildShotPrompt(p, { plot: ns.plot });
        ep.shots.splice(selIdx + 1, 0, ns);
        ep.shots.forEach((x, i) => x.order = i);
        ep.uiSel = ns.id;
        rerender(); U.toast('已插入空白分镜', 'success');
      }
      else if (act === 'trans') openTransPicker(p, ep, sel, main); // 转场设置统一走剪辑视图的 openTransPicker
    });
    // 剧情:只读高亮块 ↔ 编辑态切换(编辑态存 ep.uiPlotEdit)
    const plotView = main.querySelector('[data-x=plotview]');
    if (plotView) plotView.onclick = () => { ep.uiPlotEdit = true; Store.save(); Views.episode(main, p.id, ep.id); };
    const plotDone = main.querySelector('[data-x=plotdone]');
    if (plotDone) plotDone.onclick = () => { ep.uiPlotEdit = false; Store.save(); Views.episode(main, p.id, ep.id); };
    // 提示词字数实时统计 + 时长实时预估(oninput 不触发重渲,与 onchange 保存并存)
    const pcEl = main.querySelector('[data-x=pcount]');
    if (promptEl) promptEl.addEventListener('input', () => {
      if (pcEl) pcEl.textContent = promptEl.value.length + ' 字';
      if (durEstEl) durEstEl.textContent = SBGen.estShotDuration(sel, promptEl.value);
    });
    // 连抽 ×N(本集记忆,存 ep.uiDrawN)
    main.querySelectorAll('[data-drawn]').forEach(o => o.onclick = () => { ep.uiDrawN = +o.dataset.drawn; Store.save(); Views.episode(main, p.id, ep.id); });
    // 版本卡 → 全部版本弹窗(对比/回滚)
    main.querySelectorAll('[data-x=vers]').forEach(c => c.onclick = () => SBGen.openVersions(p, ep, sel, main));
    // 参考图缩略行 → 点击放大核对
    const refsNow = recognizedRefs(p, sel);
    main.querySelectorAll('[data-refimg]').forEach(t => t.onclick = () => {
      const r = refsNow[+t.dataset.refimg];
      if (!r) return;
      U.openModal({ title: '参考图 · ' + r.name, body: `<img src="${r.img}" style="width:100%;border-radius:10px">`, footer: '<button class="btn" data-x="ok">关闭</button>', onMount(m2, close2) { m2.querySelector('[data-x=ok]').onclick = close2; } });
    });
    // 分镜操作 ⋯ 下拉(项的 data-ract 由上方统一分派,点击后收起)
    const opsBtn = main.querySelector('[data-x=dd-ops]'), opsMenu = main.querySelector('[data-ddm=ops]');
    if (opsBtn && opsMenu) opsBtn.onclick = e => {
      e.stopPropagation();
      const show = opsMenu.style.display === 'none';
      main.querySelectorAll('.dd-menu').forEach(x => x.style.display = 'none');
      opsMenu.style.display = show ? '' : 'none';
    };
    // 提示词工具下拉已下线:智能识别/引用资产/大屏编辑为一级按钮,润色/历史/收藏并入大屏编辑弹窗
  }

  /* ================= 资产引用(@/智能识别) ================= */
  /* 把主体(或形态,全称"角色名-形态名")关联到分镜出场列表 */
  function attachAssetName(p, sel, fullName) {
    const r = Store.findSubject(p, fullName);
    if (!r) return null;
    if (r.s.kind === 'scene') { sel.scene = fullName; return '场景'; }
    if (r.s.kind === 'prop') { sel.props = sel.props || []; if (!sel.props.includes(fullName)) sel.props.push(fullName); return '道具'; }
    sel.characters = sel.characters || [];
    if (!sel.characters.includes(fullName)) sel.characters.push(fullName);
    return '角色';
  }

  /* 文本内联资产高亮:文本中出现的资产名(主体名/形态全称"角色名-形态名",
   * 按长度降序匹配避免子串误伤)渲染成彩色 chip,颜色与出场 tag 体系一致(角色 cyan/场景 green/物品 yellow)。
   * 两遍替换:先占位 token 再换回 chip,避免短名命中已注入 chip 内的长名文本。 */
  const ASSET_TAG = { character: 'cyan', scene: 'green', prop: 'yellow' };
  function assetNamesOf(p) {
    const names = [];
    (p.subjects || []).forEach(sj => {
      (sj.forms || []).forEach(f => names.push({ name: sj.name + '-' + f.name, kind: sj.kind }));
      names.push({ name: sj.name, kind: sj.kind });
    });
    names.sort((a, b) => b.name.length - a.name.length);
    return names;
  }
  function assetChipsHTML(p, text) {
    let html = U.esc(text || '');
    const hits = [];
    assetNamesOf(p).forEach(n => {
      const esc = U.esc(n.name);
      if (!esc || html.indexOf(esc) < 0) return;
      hits.push({ esc, kind: n.kind });
      html = html.split(esc).join('\u0001' + (hits.length - 1) + '\u0002');
    });
    return html.replace(/\u0001(\d+)\u0002/g, (_, i) => {
      const h = hits[+i];
      return `<span class="tag ${ASSET_TAG[h.kind] || 'cyan'}" style="font-size:10px;padding:0 6px;margin:0 1px">${h.esc}</span>`;
    });
  }
  /* 文本中识别到的资产清单(去重:命中形态全称后不再重复计主体名) */
  function assetsInText(p, text) {
    let rest = text || '';
    const found = [];
    assetNamesOf(p).forEach(n => {
      if (rest.includes(n.name)) { found.push(n); rest = rest.split(n.name).join(' '); }
    });
    return found;
  }

  /* 提示词/剧情中识别到的资产及其主体参考图(右栏「参考图」缩略行用,只留有图的) */
  function recognizedRefs(p, s) {
    return assetsInText(p, (s.prompt || '') + '　' + (s.plot || ''))
      .map(n => ({ name: n.name, kind: n.kind, img: Store.subjectImage(p, n.name) }))
      .filter(x => x.img);
  }

  /* 智能识别:扫描提示词+剧情中的资产名(含形态全称),自动关联参考图 */
  function smartLinkAssets(p, ep, sel, main) {
    const text = (sel.prompt || '') + '　' + (sel.plot || '');
    const hits = [];
    (p.subjects || []).forEach(sj => {
      const formHits = (sj.forms || []).filter(f => text.includes(sj.name + '-' + f.name)).map(f => sj.name + '-' + f.name);
      if (formHits.length) hits.push(...formHits);
      else if (text.includes(sj.name)) hits.push(sj.name);
    });
    if (!hits.length) return U.toast('提示词/剧情中未识别到资产名(角色/场景/道具)', 'info');
    const added = [];
    [...new Set(hits)].forEach(n => { if (attachAssetName(p, sel, n)) added.push(n); });
    Store.save();
    U.toast(`智能识别完成:已关联 ${added.join('、')}`, 'success', 3000);
    Views.episode(main, p.id, ep.id);
  }

  /* ＠ 引用资产选择器:点击注入 @名称 到提示词并关联参考图 */
  function openAssetPicker(p, ep, sel, main) {
    const items = [];
    (p.subjects || []).forEach(sj => {
      items.push({ name: sj.name, image: sj.image, kind: sj.kind, form: false });
      (sj.forms || []).forEach(f => items.push({ name: sj.name + '-' + f.name, image: f.image || sj.image, kind: sj.kind, form: true }));
    });
    if (!items.length) return U.toast('项目暂无主体资产,请先在角色页提取主体', 'error');
    const KIND_TAG = { character: 'cyan', scene: 'green', prop: 'yellow' };
    const KIND_TXT = { character: '角色', scene: '场景', prop: '道具' };
    let changed = false;
    U.openModal({
      title: '＠ 引用资产 · 镜头' + (sel.order + 1),
      wide: true,
      body: `
      <div class="hint" style="margin:0 0 10px">点击资产:名称以「@名称」注入提示词,并关联为该镜参考素材(多图融合策略自动使用;含形态资产)。</div>
      <div class="grid" style="grid-template-columns:repeat(auto-fill,minmax(120px,1fr));max-height:46vh;overflow-y:auto">
        ${items.map(it => `
        <div class="card" style="padding:8px;cursor:pointer" data-asset="${U.esc(it.name)}">
          <div style="height:76px;border-radius:6px;overflow:hidden;background:var(--bg2);display:flex;align-items:center;justify-content:center;margin-bottom:6px">
            ${it.image ? `<img src="${U.thumb(it.image)}" style="width:100%;height:100%;object-fit:cover">` : '<span class="small muted">无图</span>'}
          </div>
          <div class="small" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${U.esc(it.name)}">${U.esc(it.name)}</div>
          <span class="tag ${KIND_TAG[it.kind]}" style="font-size:10px">${KIND_TXT[it.kind]}${it.form ? '·形态' : ''}</span>
        </div>`).join('')}
      </div>`,
      footer: `<button class="btn primary" data-x="done">完成</button>`,
      onMount(m, close) {
        m.querySelectorAll('[data-asset]').forEach(c => c.onclick = () => {
          const n = c.dataset.asset;
          const kindName = attachAssetName(p, sel, n);
          if (!(sel.prompt || '').includes('@' + n)) {
            // 统一写入:旧 prompt 自动留档
            Store.setShotPrompt(sel, (sel.prompt || '') + (sel.prompt ? ' ' : '') + '@' + n);
          }
          changed = true;
          Store.save();
          c.style.outline = '2px solid var(--accent)';
          U.toast(`已引用${kindName}「${n}」`, 'success');
        });
        m.querySelector('[data-x=done]').onclick = close;
      },
      onClose() { if (changed) Views.episode(main, p.id, ep.id); },
    });
  }

  function downloadShot(s) {
    if (s.video && s.video.status === 'done' && s.video.url) { U.downloadDataURL(`分镜${s.order + 1}_视频.mp4`, s.video.url); U.toast('分镜视频已开始下载', 'success'); }
    else if (s.video && s.video.status === 'done') { U.downloadDataURL(`分镜${s.order + 1}_视频帧.png`, s.video.frame); U.toast('视频帧已下载', 'success'); }
    else if (s.image) { U.downloadDataURL(`分镜${s.order + 1}_图片.png`, s.image); U.toast('分镜图已下载', 'success'); }
    else U.toast('该分镜暂无可下载内容', 'error');
  }

  /* ================= 提示词面板 ================= */
  function openPromptPanel(p, ep, s, main, big) {
    U.openModal({
      title: (big ? '大屏编辑 · ' : '') + '分镜提示词(镜头 ' + (s.order + 1) + ')',
      wide: !big, xl: big,
      body: `
      <label class="field"><span>剧情内容</span><textarea class="input" data-f="plot" rows="${big ? 3 : 2}">${U.esc(s.plot)}</textarea></label>
      <label class="field"><span>生成提示词(可编辑)</span><textarea class="input" data-f="prompt" rows="${big ? 10 : 5}">${U.esc(s.prompt)}</textarea></label>
      <div class="card" style="padding:10px 12px;margin:0 0 10px">
        <div class="row" style="justify-content:space-between;align-items:center;cursor:pointer" data-x="p5toggle">
          <b class="small">📐 五段式标准结构</b>
          <span class="small muted" data-p5-arrow>▸ 展开</span>
        </div>
        <div class="hint" style="margin:4px 0 0">风格氛围 + 场景环境 + 镜头运动 + 分镜内容 + 负面提示词,确保信息完整且精准;角色 @名 / 场景 $名 / 道具 #名</div>
        <div data-p5body style="display:none;margin-top:10px">
          ${PROMPT5_SECS.map(sec => `
          <label class="field" style="margin-bottom:8px"><span>${sec.t}</span>
            <textarea class="input small" rows="2" data-p5="${sec.k}" placeholder="${sec.h}"></textarea>
          </label>`).join('')}
          <div class="row" style="justify-content:flex-end;gap:8px">
            <button class="btn sm" data-x="p5fill">按本镜信息预填</button>
            <button class="btn sm primary" data-x="p5compose">组合为提示词</button>
          </div>
        </div>
      </div>
      <div class="row wrap">
        <span class="small muted">快捷操作:</span>
        <button class="btn sm" data-x="fav">⭐ 收藏提示词</button>
        <button class="btn sm" data-x="hist">🕘 历史提示词</button>
        <button class="btn sm" data-x="tool">🧰 提示词润色</button>
      </div>`,
      footer: `<button class="btn" data-x="cancel">取消</button><button class="btn primary" data-x="ok">保存</button>`,
      onMount(m, close) {
        // 五段式结构化编辑器:预填/组合
        const p5val = k => (m.querySelector(`[data-p5="${k}"]`).value || '').trim();
        const p5set = (k, v) => { m.querySelector(`[data-p5="${k}"]`).value = v || ''; };
        const p5fill = () => {
          const cs = s.cameraSpec || {};
          p5set('style', styleOf(p) + (p.globalSetting ? ',' + p.globalSetting : ''));
          p5set('scene', s.scene || ''); // 场景名,时间/天气/光线等由用户补充
          p5set('camera', [cs.shotSize, s.camera, cs.view ? cs.view + '视角' : '', cs.angle, cs.aperture].filter(Boolean).join(','));
          p5set('content', (s.plot || '') + (s.dialogue ? '。台词:' + s.dialogue : s.narration ? '。旁白:' + s.narration : ''));
          p5set('neg', p.negPrompt || '禁止出现 BGM、字幕、水印');
        };
        m.querySelector('[data-x=p5toggle]').onclick = () => {
          const body = m.querySelector('[data-p5body]');
          const show = body.style.display === 'none';
          body.style.display = show ? '' : 'none';
          m.querySelector('[data-p5-arrow]').textContent = show ? '▾ 收起' : '▸ 展开';
          if (show && !p5val('style') && !p5val('content')) p5fill(); // 首次展开自动预填
        };
        m.querySelector('[data-x=p5fill]').onclick = () => { p5fill(); U.toast('已按本镜信息预填五段', 'success'); };
        m.querySelector('[data-x=p5compose]').onclick = () => {
          const parts = PROMPT5_SECS.filter(sec => sec.k !== 'neg').map(sec => p5val(sec.k)).filter(Boolean);
          let composed = parts.join('。');
          const neg = p5val('neg');
          if (neg) composed += (composed ? '。' : '') + '负面提示词:' + neg;
          if (!composed) return U.toast('五段内容均为空,请先填写', 'error');
          m.querySelector('[data-f=prompt]').value = composed;
          U.toast('已按五段式结构组合,保存后生效', 'success');
        };
        m.querySelector('[data-x=fav]').onclick = () => favPrompt(p, ep, s);
        m.querySelector('[data-x=hist]').onclick = () => openPromptHistory(s);
        m.querySelector('[data-x=tool]').onclick = () => openPromptTool(s, main, p, ep);
        m.querySelector('[data-x=cancel]').onclick = close;
        m.querySelector('[data-x=ok]').onclick = () => {
          const np = m.querySelector('[data-f=prompt]').value.trim();
          const nplot = m.querySelector('[data-f=plot]').value.trim();
          const changed = np !== s.prompt || nplot !== s.plot;
          if (np !== s.prompt) Store.setShotPrompt(s, np);
          s.plot = nplot;
          if (changed) s.confirm = false; // 内容修改自动回落为未确认(镜头确认闸)
          Store.save(); close(); U.toast('提示词已保存', 'success');
          renderShots(main, p, ep);
        };
      },
    });
  }

  function favPrompt(p, ep, s) {
    Store.state.favorites.unshift({
      id: Store.uid('fav'), userId: Store.currentUser().id,
      projectId: p.id, episodeId: ep.id, shotId: s.id,
      prompt: s.prompt, model: s.videoModel || ep.sbConfig.batchVideoModel, time: Store.now(),
    });
    Store.save();
    U.toast('已收藏到我的收藏', 'success');
  }

  function openPromptHistory(s) {
    const hist = s.promptHistory || [];
    U.openModal({
      title: '历史提示词(镜头 ' + (s.order + 1) + ')',
      body: hist.length ? hist.map((h, i) => `
        <div class="card" style="margin-bottom:10px;padding:12px">
          <div class="small muted" style="margin-bottom:5px">#${hist.length - i} · ${h.time}</div>
          <div class="small">${U.esc(h.prompt || '(初始版本)')}</div>
        </div>`).join('') : '<div class="empty"><p>暂无历史版本,修改提示词后自动记录</p></div>',
    });
  }

  function openPromptTool(s, main, p, ep) {
    U.openModal({
      title: '提示词工具',
      body: `
      <div class="hint" style="margin-bottom:12px">选择一种优化策略,AI 将改写当前提示词:</div>
      <div class="model-row" style="flex-direction:column;align-items:stretch">
        <div class="model-opt" data-t="detail">✨ 增强细节描写</div>
        <div class="model-opt" data-t="light">💡 强化光影氛围</div>
        <div class="model-opt" data-t="camera">🎥 补充镜头语言</div>
        <div class="model-opt" data-t="style">🎨 统一项目风格(${U.esc(p.style)})</div>
        <div class="model-opt" data-t="comment">💬 按指令改(说一句要改成什么样,AI 改写后可立即重新生成)</div>
      </div>`,
      onMount(m, close) {
        m.querySelectorAll('[data-t]').forEach(o => o.onclick = async () => {
          if (o.dataset.t === 'comment') return; // 按指令改:单独接线(forEach 后会重新绑定)
          close();
          const strat = {
            detail: '增强细节描写,补充材质/纹理/微表情等画面细节',
            light: '强化光影氛围,加入布光方式、体积光、色调等描述',
            camera: '补充专业镜头语言(景别/构图/景深),运镜为' + s.camera,
            style: '统一为「' + styleOf(p) + '」项目风格,保持全局美学一致',
          }[o.dataset.t];
          // 优先真实 LLM 优化,失败回退本地规则追加
          if (API.isReady()) {
            try {
              U.toast('LLM 优化提示词中…', 'info');
              const out = await API.chatJSON({
                system: WfCore.genPromptSystem(), // 注册表人设 + 抽卡公式/军规按键注入(js/wf-core.js 单源)
                messages: [{ role: 'user', content: `请${strat}。优化以下分镜提示词,保持原意,返回 {"prompt":"优化后的中文提示词"}:\n${s.prompt}` }],
                temperature: 0.7, max_tokens: 800,
              });
              if (!out || !out.prompt) throw new Error('LLM 返回为空');
              Store.setShotPrompt(s, String(out.prompt));
              s.confirm = false; // 提示词被改写,自动回落为未确认
              U.toast('提示词已由 LLM 优化', 'success');
              renderShots(main, p, ep);
              return;
            } catch (e) {
              U.toast('LLM 优化失败:' + e.message + ',已回退本地优化', 'error', 3500);
            }
          }
          await U.delay(600);
          const addon = { detail: ',超精细细节,8K 画质,纹理清晰', light: ',电影级布光,体积光,氛围感拉满', camera: ',' + s.camera + ',专业分镜构图,景深控制', style: ',' + styleOf(p) + '风格统一,全局美学一致' }[o.dataset.t];
          Store.setShotPrompt(s, (s.prompt || '') + addon);
          s.confirm = false; // 提示词被改写,自动回落为未确认
          U.toast('提示词已优化(本地规则)', 'success');
          renderShots(main, p, ep);
        });
        m.querySelector('[data-t=comment]').onclick = () => { close(); openCommentGen(s, main, p, ep); };
      },
    });
  }

  /* ---------- 按指令改(评论生成):一句自然语言 → LLM 结合镜头上下文改写提示词 → 应用并可立即重新生成 ----------
   * 与上方四策略优化同层但更自由:用户指令驱动;改写走轻量 LLM(同优化路径的直连计费惯例,llm.optimize 标签),
   * 重生成复用 SBGen.createShotVideo 完整管线(确认闸/计费/历史快照不变)。 */
  function openCommentGen(s, main, p, ep) {
    if (!API.isReady()) return U.toast('按指令改需要配置 LLM(改写提示词),请先登录后端或在「API 设置」配置直连', 'error');
    const cur = (s.video && s.video.status === 'done' && s.video.frame) || s.image || '';
    U.openModal({
      title: '按指令改 · 镜头' + (s.order + 1),
      body: `
      <div class="hint" style="margin-bottom:10px">说一句要改成什么样(如「把背景换成雨夜」「人物换成红裙」「镜头拉远成全景」),AI 结合当前提示词与镜头上下文改写;确认新提示词后可立即重新生成。</div>
      ${cur && !String(cur).startsWith('data:') ? `<div class="ws-thumb-img" style="width:220px;aspect-ratio:16/9;margin-bottom:10px"><img src="${U.thumb(cur)}"></div>` : ''}
      <label class="field"><span>修改指令</span><textarea class="input" data-f="inst" rows="2" placeholder="把背景换成雨夜…"></textarea></label>
      <div data-newp style="display:none;margin-top:8px">
        <label class="field"><span>改写后的提示词(可再编辑)</span><textarea class="input" data-f="newprompt" rows="5"></textarea></label>
      </div>`,
      footer: `<button class="btn" data-x="cancel">取消</button>
        <button class="btn" data-x="rewrite">改写提示词(-${COST.optimize}积分)</button>
        <button class="btn primary" data-x="apply" disabled>应用并重新生成(-${COST.video}积分)</button>`,
      onMount(m, close) {
        m.querySelector('[data-x=cancel]').onclick = close;
        m.querySelector('[data-x=rewrite]').onclick = async () => {
          const inst = m.querySelector('[data-f=inst]').value.trim();
          if (!inst) return U.toast('请先填写修改指令', 'error');
          const btn = m.querySelector('[data-x=rewrite]');
          btn.disabled = true;
          try {
            U.toast('AI 改写提示词中…', 'info');
            const out = await API.chatJSON({
              system: '你是短剧分镜改图专家。按用户指令改写文生图提示词:保留原提示词中与指令无关的画面要素与风格约定,只落实指令要求的变更;输出中文提示词,不超过120字。',
              messages: [{ role: 'user', content: `镜头剧情:${s.plot || '(无)'}\n场景:${s.scene || '(无)'}\n出场:${(s.characters || []).join('、') || '(无)'}\n项目风格:${p.style || ''}\n当前提示词:${s.prompt || '(空,请据剧情与指令撰写)'}\n\n修改指令:${inst}\n\n返回 {"prompt":"改写后的完整提示词"}` }],
              temperature: 0.7, max_tokens: 500, billingAction: 'llm.optimize',
            });
            if (!out || !out.prompt) throw new Error('LLM 返回为空');
            m.querySelector('[data-f=newprompt]').value = String(out.prompt);
            m.querySelector('[data-newp]').style.display = '';
            m.querySelector('[data-x=apply]').disabled = false;
            U.toast('提示词已改写,确认后可立即重新生成', 'success');
          } catch (e) {
            U.toast('改写失败:' + e.message, 'error', 3500);
          } finally { btn.disabled = false; }
        };
        m.querySelector('[data-x=apply]').onclick = () => {
          const np = m.querySelector('[data-f=newprompt]').value.trim();
          if (!np) return U.toast('提示词为空', 'error');
          Store.setShotPrompt(s, np);
          s.confirm = false; // 提示词被改写,自动回落为未确认
          close();
          renderShots(main, p, ep);
          U.confirm(`提示词已更新。立即按新提示词重新生成镜头${s.order + 1} 的视频?(-${COST.video}积分)`, () => {
            Commands.execute('shot.generateVideo', { pid: p.id, epid: ep.id, sid: s.id, main, ui: true }).then(r => Commands.digest(r)); // 统一命令层(ui 模式)
          }, '立即重新生成');
        };
      },
    });
  }

  /* ================= 更多工具 ================= */
  /* 分镜画面沉淀为主体新形态(素材反哺):某镜出图效果好→挂为主体形态,分镜按「名-形态」全称引用 */
  function saveShotAsForm(p, s) {
    const src = (s.video && s.video.status === 'done' && s.video.frame) || s.image;
    if (!src || String(src).startsWith('data:')) return U.toast('该分镜暂无真实画面(占位图不能作形态图),请先生成', 'error');
    if (!(p.subjects || []).length) return U.toast('项目还没有主体,请先到「主体」创建', 'error');
    U.openModal({
      title: '存为主体形态 · 镜头' + (s.order + 1),
      body: `
      <div class="row" style="gap:12px;align-items:flex-start">
        <div class="ws-thumb-img" style="width:150px;flex:none;aspect-ratio:16/9"><img src="${U.thumb(src)}"></div>
        <div style="flex:1">
          <label class="field"><span>选择主体</span>
            <select class="select" data-f="subj">${p.subjects.map(x => `<option value="${x.id}">${U.esc(x.name)}(${{ character: '角色', scene: '场景', prop: '道具' }[x.kind] || x.kind})</option>`).join('')}</select>
          </label>
          <label class="field"><span>形态名称</span><input class="input" data-f="fname" placeholder="如:战损妆 / 少年期 / 发光态"></label>
          <div class="hint">创建后分镜可用「主体名-形态名」全称引用该画面;同名形态自动追加序号。</div>
        </div>
      </div>`,
      footer: `<button class="btn" data-x="cancel">取消</button><button class="btn primary" data-x="ok">创建形态</button>`,
      onMount(m, close) {
        m.querySelector('[data-x=cancel]').onclick = close;
        m.querySelector('[data-x=ok]').onclick = () => {
          const sub = p.subjects.find(x => x.id === m.querySelector('[data-f=subj]').value);
          let name = m.querySelector('[data-f=fname]').value.trim();
          if (!sub) return U.toast('请选择主体', 'error');
          if (!name) return U.toast('请输入形态名称', 'error');
          if (name.includes('-')) return U.toast('形态名不能包含 "-"', 'error');
          sub.forms = sub.forms || [];
          if (sub.forms.some(f => f.name === name)) name = name + '-' + (sub.forms.length + 1);
          sub.forms.push({ id: Store.uid('fm'), name, image: src, time: Store.now() });
          Store.save();
          U.toast(`已创建「${sub.name}-${name}」,分镜可按全称引用`, 'success');
          close();
        };
      },
    });
  }

  /* 分镜画面沉淀为资产库主体(与便捷工具融合入库同规:名称/类型/标签/分组 + 入库自动报白) */
  function saveShotAsAsset(p, s) {
    const src = (s.video && s.video.status === 'done' && s.video.frame) || s.image;
    if (!src || String(src).startsWith('data:')) return U.toast('该分镜暂无真实画面(占位图不能入库),请先生成', 'error');
    const groups = Store.myGroups();
    U.openModal({
      title: '存入资产库 · 镜头' + (s.order + 1),
      body: `
      <div class="row" style="gap:12px;align-items:flex-start;margin-bottom:10px">
        <div class="ws-thumb-img" style="width:150px;flex:none;aspect-ratio:16/9"><img src="${U.thumb(src)}"></div>
        <label class="field" style="flex:1;margin:0"><span>主体名称</span><input class="input" data-f="name" value="${U.esc('镜头' + (s.order + 1) + '·' + (s.plot || '').slice(0, 10))}"></label>
      </div>
      <label class="field"><span>主体类型</span>
        <div class="model-row">${[['character', '角色'], ['scene', '场景'], ['prop', '道具']].map(([v, n], i) => `<div class="model-opt ${i === 0 ? 'sel' : ''}" data-kind="${v}">${n}</div>`).join('')}</div>
      </label>
      <label class="field"><span>选择标签</span>
        <div class="model-row wrap">${['主角', '配角', '反派', '核心场景', '关键道具'].map((t, i) => `<div class="model-opt ${i === 0 ? 'sel' : ''}" data-tag="${t}">${t}</div>`).join('')}</div>
      </label>
      <label class="field"><span>选择分组</span>
        <select class="select" data-f="group">
          <option value="">未分组</option>
          ${groups.map(g => `<option value="${g.id}">${U.esc(g.name)}</option>`).join('')}
        </select>
      </label>`,
      footer: `<button class="btn" data-x="cancel">取消</button><button class="btn primary" data-x="ok">保存主体</button>`,
      onMount(m, close) {
        let kind = 'character', tag = '主角';
        m.querySelectorAll('[data-kind]').forEach(o => o.onclick = () => { kind = o.dataset.kind; m.querySelectorAll('[data-kind]').forEach(x => x.classList.toggle('sel', x === o)); });
        m.querySelectorAll('[data-tag]').forEach(o => o.onclick = () => { tag = o.dataset.tag; m.querySelectorAll('[data-tag]').forEach(x => x.classList.toggle('sel', x === o)); });
        m.querySelector('[data-x=cancel]').onclick = close;
        m.querySelector('[data-x=ok]').onclick = () => {
          const name = m.querySelector('[data-f=name]').value.trim();
          if (!name) return U.toast('请填写主体名称', 'error');
          const u = Store.currentUser();
          const item = {
            id: Store.uid('as'), userId: u.id, kind, name,
            image: src, prompt: (s.prompt || '').slice(0, 200), tags: [tag], forms: [],
            groupId: m.querySelector('[data-f=group]').value || null,
            fromProject: p.name, time: Store.now(),
          };
          Store.state.assets.subjects.push(item);
          Store.save(); close();
          U.toast(`「${name}」已保存到资产库,已自动提交报白审核`, 'success');
          if (window.HumanReview) HumanReview.submitAsset(item);
        };
      },
    });
  }

  function openMoreTools(p, s) {
    const tools = [
      ['✂', '视频剪辑', '对视频进行裁剪、分割与拼接。'],
      ['🎬', '视频编辑', '基于提示词对视频内容进行编辑(人物替换/背景替换)。'],
      ['🔍', '视频超分', '提升视频分辨率,支持 2K/4K。'],
      ['🧹', '视频去字幕', '智能擦除视频中的对白字幕。'],
      ['🧬', '存为主体形态', '把本镜画面存为某主体的新形态(战损妆/特殊状态等),分镜按「名-形态」全称引用。'],
      ['🗂', '存入资产库', '把本镜画面沉淀为资产库主体,跨项目复用(入库自动报白)。'],
    ];
    U.openModal({
      title: '更多工具(镜头 ' + (s.order + 1) + ')',
      body: tools.map(t => `<div class="check-line" data-tool="${t[1]}"><span style="font-size:16px">${t[0]}</span><div><div>${t[1]}</div><div class="hint" style="margin:0">${t[2]}</div></div></div>`).join(''),
      onMount(m, close) {
        m.querySelectorAll('[data-tool]').forEach(c => c.onclick = () => {
          const name = c.dataset.tool;
          close();
          if (name === '存为主体形态') { saveShotAsForm(p, s); return; }
          if (name === '存入资产库') { saveShotAsAsset(p, s); return; }
          // 视频超分/视频去字幕:跳转便捷工具页的真功能(带分镜素材预填),不再占位
          if (name === '视频超分' || name === '视频去字幕') {
            const src = (s.video && s.video.status === 'done' && s.video.frame) || s.image;
            if (!src) return U.toast('该分镜暂无画面素材,请先生成', 'error');
            window.__toolPrefill = { tool: name === '视频超分' ? 'upscale' : 'subtitle', name: `镜头${s.order + 1}·${name}`, image: src, video: (s.video && s.video.status === 'done' && s.video.url) || null };
            location.hash = '#/tools';
            return;
          }
          U.runTask({
            title: name + '(模拟处理)',
            steps: [{ label: '读取视频流', ms: 700 }, { label: name + '处理中', ms: 1400 }, { label: '导出结果', ms: 600 }],
            onDone: () => U.toast(name + '完成(模拟),结果已应用到当前分镜', 'success'),
          });
        });
      },
    });
  }

  /* ================= 快速编辑 ================= */
  /* ================= 快速编辑(右侧抽屉,对齐 快速编辑分镜.png) ================= */
  function openQuickEdit(p, ep, main) {
    if (!ep.shots.length) return U.toast('暂无分镜可编辑', 'error');
    document.querySelectorAll('.qe-drawer').forEach(x => x.remove());
    const drawer = document.createElement('div');
    drawer.className = 'qe-drawer';
    drawer.innerHTML = `
    <div class="qe-head"><b>分镜描述</b><button class="modal-close" data-x="cancel">✕</button></div>
    <div class="qe-sub">快速批量编辑分镜剧情与运镜(支持一次性修改所有镜头的剧情内容描述与运镜)</div>
    <div class="qe-body">
      ${ep.shots.map((s, i) => `
      <div class="card" style="margin-bottom:12px;padding:12px">
        <div class="row" style="margin-bottom:8px">
          <span class="tag cyan">镜头 ${i + 1}${s.name ? ' · ' + U.esc(s.name) : ''}</span>
          <span class="tag ${Store.shotVideoReady(s) ? 'green' : ''}">${Store.shotVideoReady(s) ? '已出片' : '待生成'}</span>
        </div>
        <label class="field" style="margin-bottom:8px"><span>剧情内容</span>
          <div class="row" style="gap:6px;align-items:flex-start;flex-wrap:nowrap">
            <button class="btn ghost sm" data-qsplit="${i}" title="在光标处把剧情切分为两个分镜" style="flex:none;padding:4px 7px;margin-top:2px">○</button>
            <textarea class="input small grow" rows="3" data-qp="${i}">${U.esc(s.plot)}</textarea>
          </div></label>
        <div class="row" style="gap:8px">
          <label class="field grow" style="margin-bottom:0"><span>运镜</span>
            <input class="input small" data-qc="${i}" value="${U.esc(s.camera)}"></label>
          <label class="field" style="margin-bottom:0"><span>音色</span>
            <select class="select small" data-qcv="${i}" style="width:auto">${VOICES.map(v => `<option ${s.voice === v ? 'selected' : ''}>${v}</option>`).join('')}</select></label>
        </div>
      </div>`).join('')}
    </div>
    <div class="qe-foot"><button class="btn" data-x="cancel2">取消</button><button class="btn primary" data-x="ok">全部保存</button></div>`;
    document.body.appendChild(drawer);
    // 注册到全局浮层清单:路由切换时 app.js 统一 close,抽屉不残留
    window.__overlays = window.__overlays || [];
    const reg = { close: () => close() };
    window.__overlays.push(reg);
    const close = () => {
      drawer.remove();
      if (window.__overlays) window.__overlays = window.__overlays.filter(o => o !== reg);
    };
    drawer.querySelector('[data-x=cancel]').onclick = close;
    drawer.querySelector('[data-x=cancel2]').onclick = close;
    drawer.querySelector('[data-x=ok]').onclick = () => {
      ep.shots.forEach((s, i) => {
        const q = drawer.querySelector(`[data-qp="${i}"]`);
        const nplot = q ? q.value.trim() : s.plot;
        const qc = drawer.querySelector(`[data-qc="${i}"]`);
        const ncam = qc ? (qc.value.trim() || s.camera) : s.camera;
        if (nplot !== s.plot || ncam !== s.camera) s.confirm = false; // 内容修改自动回落为未确认(镜头确认闸)
        s.plot = nplot; s.camera = ncam;
        const qv = drawer.querySelector(`[data-qcv="${i}"]`); if (qv) s.voice = qv.value;
      });
      Store.save(); close(); U.toast('全部分镜已更新', 'success');
      renderShots(main, p, ep);
    };
    // 点圆点切分镜头:光标处(无光标取中点)把剧情一分为二,后半生成新分镜插入其后
    drawer.querySelectorAll('[data-qsplit]').forEach(b => {
      b.onmouseenter = () => { b.textContent = '✂'; };
      b.onmouseleave = () => { b.textContent = '○'; };
      b.onclick = () => {
        const i = +b.dataset.qsplit;
        const ta = drawer.querySelector(`[data-qp="${i}"]`);
        const text = ta ? ta.value : ep.shots[i].plot;
        if (!text || text.trim().length < 2) return U.toast('剧情内容太短,无法切分', 'error');
        let pos = ta && ta.selectionStart > 0 && ta.selectionStart < text.length ? ta.selectionStart : Math.floor(text.length / 2);
        const head = text.slice(0, pos).trim(), tail = text.slice(pos).trim();
        if (!head || !tail) return U.toast('切分点太靠边缘,请把光标移到剧情中间', 'error');
        // 先把抽屉里未保存的编辑写回,避免重开抽屉时丢失
        ep.shots.forEach((x, xi) => {
          const q = drawer.querySelector(`[data-qp="${xi}"]`); if (q) x.plot = q.value;
          const qc = drawer.querySelector(`[data-qc="${xi}"]`); if (qc) x.camera = qc.value.trim() || x.camera;
          const qv = drawer.querySelector(`[data-qcv="${xi}"]`); if (qv) x.voice = qv.value;
        });
        const cur = ep.shots[i];
        const ns = blankShot(i + 1, ep.sbConfig);
        // 拷贝当前镜配置(运镜/音色/出场/模型/策略),只替换剧情与提示词
        ns.camera = cur.camera; ns.voice = cur.voice; ns.videoModel = cur.videoModel; ns.genStrategy = cur.genStrategy;
        ns.characters = (cur.characters || []).slice(); ns.scene = cur.scene; ns.props = (cur.props || []).slice();
        ns.plot = tail;
        ns.prompt = window.SB && SB.buildShotPrompt ? SB.buildShotPrompt(p, { plot: tail }) : styleOf(p) + '风格,' + tail + negOf(p);
        cur.plot = head;
        cur.confirm = false; // 切分改写了本镜剧情,自动回落为未确认(新镜 ns 默认未确认)
        ep.shots.splice(i + 1, 0, ns);
        ep.shots.forEach((x, xi) => x.order = xi);
        Store.save();
        close();
        openQuickEdit(p, ep, main);
        renderShots(main, p, ep);
        U.toast('已切分为两个分镜', 'success');
      };
    });
  }

  window.SBViews = { scriptTrackHTML, scriptRefHTML, shotThumbHTML, shotStatusHTML, playerBlockHTML, progressBlockHTML, versCardHTML, centerHTML, rightHTML, cutHTML, cutRightHTML, openTransPicker, bindCenter, bindRight, openPromptPanel, favPrompt, openPromptHistory, openPromptTool, openAssetPicker, smartLinkAssets, attachAssetName, assetChipsHTML, assetsInText, assetNamesOf, recognizedRefs, openMoreTools, openQuickEdit, openArtSuffix, artSuffixOf, artSuffixApp, downloadShot };
})();
