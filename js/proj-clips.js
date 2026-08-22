/* ============ proj-clips.js 切片 + 成片库 tab(自 episodes.js 拆分) ============
 * 切片:从成片/分镜视频截取高光片段(FFmpeg 裁剪);成片库:已合成成片归档与播放预览。
 * 原 projectDetail 闭包函数,拆分后参数化 (p)/(p, main, render)/(p, ep);
 * 经 window.ProjTabs.clips / window.ProjTabs.films 暴露。 */
(function () {
  window.ProjTabs = window.ProjTabs || {};

  /* ================= ✂ 切片(投流挂载高光素材生产工作台) ================= */
  function renderClips(p) {
    return `
    <div class="card" style="padding:10px 14px;margin-bottom:12px"><span class="small muted">本剧上线后的投流挂载素材:从成片或分镜视频中截取高光片段(入点→出点),生成切片并下载/复用。每次切片消耗 ${COST.tool} 积分(服务端 FFmpeg 裁剪,失败自动退费)。</span></div>
    ${p.episodes.map(ep => {
      const hasFilm = !!ep.composedUrl;
      const vids = ep.shots.filter(s => s.video && Store.shotVideoReady(s) && s.video.url);
      if (!hasFilm && !vids.length) return '';
      const clips = ep.clips || [];
      return `
    <div class="card" style="padding:14px 16px;margin-bottom:12px">
      <div class="row" style="gap:10px;align-items:center;flex-wrap:wrap;margin-bottom:8px">
        <b>${U.esc(ep.title)}</b>
        <span class="tag ${hasFilm ? 'green' : ''}">${hasFilm ? '有成片' : ''}</span>
        <span class="small muted">${vids.length} 镜可取</span>
      </div>
      <div class="row" style="gap:14px;align-items:flex-start;flex-wrap:wrap">
        <div style="flex:1;min-width:320px">
          <div class="row" style="gap:8px;margin-bottom:6px;flex-wrap:wrap">
            <select class="select small" data-clip-src="${ep.id}" style="width:auto">
              ${hasFilm ? `<option value="${ep.composedUrl}">🎞 整集成片</option>` : ''}
              ${vids.map(s => `<option value="${s.video.url}">镜头${s.order + 1} · ${U.esc((s.plot || '').slice(0, 14))}</option>`).join('')}
            </select>
            <button class="btn sm" data-clip-in="${ep.id}">⏮ 设入点</button>
            <button class="btn sm" data-clip-out="${ep.id}">⏭ 设出点</button>
            <span class="small muted">入 <b data-clip-tin="${ep.id}">0.0s</b> · 出 <b data-clip-tout="${ep.id}">-</b></span>
          </div>
          <video data-clip-prev="${ep.id}" controls style="width:100%;max-height:280px;background:#0d0b1e;border-radius:10px"></video>
          <div class="row" style="gap:8px;margin-top:6px;flex-wrap:wrap">
            <input class="input small" data-clip-name="${ep.id}" placeholder="切片标题(如:第3集复仇高光)" style="width:220px">
            <button class="btn sm primary" data-clip-cut="${ep.id}">✂ 生成切片</button>
          </div>
        </div>
        <div style="width:280px;flex:none">
          <b class="small">本集切片(${clips.length})</b>
          <div style="max-height:300px;overflow-y:auto;margin-top:6px">
            ${clips.map(c => `
            <div class="card" style="padding:8px 10px;margin-bottom:6px;background:var(--panel2)">
              <div class="row" style="gap:6px;align-items:center">
                <span class="small grow" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${U.esc(c.name)}">${U.esc(c.name)}</span>
                <button class="btn ghost sm" data-clip-play="${ep.id}:${c.id}">▶</button>
                <button class="btn ghost sm" data-clip-dl="${ep.id}:${c.id}">⬇</button>
                <button class="btn ghost sm danger" data-clip-del="${ep.id}:${c.id}">✕</button>
              </div>
              <div class="small muted" style="font-size:10px">${c.start.toFixed(1)}s → ${c.end.toFixed(1)}s · ${U.esc(c.time)}</div>
            </div>`).join('') || '<div class="small muted">暂无切片</div>'}
          </div>
        </div>
      </div>
    </div>`; }).join('') || '<div class="empty"><div class="ico">✂</div><p>暂无可用视频素材:先合成成片或生成分镜视频</p></div>'}`;
  }

  function bindClips(p, main, render) {
    const clipUI = {}; // epId → {start,end}
    main.querySelectorAll('[data-clip-src]').forEach(sel => {
      const epId = sel.dataset.clipSrc;
      const prev = main.querySelector(`[data-clip-prev="${epId}"]`);
      const load = () => { if (prev && prev.src !== location.origin + sel.value) { prev.src = sel.value; prev.currentTime = 0; } };
      sel.onchange = load; load();
    });
    main.querySelectorAll('[data-clip-in]').forEach(b => b.onclick = () => {
      const prev = main.querySelector(`[data-clip-prev="${b.dataset.clipIn}"]`);
      (clipUI[b.dataset.clipIn] = clipUI[b.dataset.clipIn] || {}).start = prev.currentTime;
      main.querySelector(`[data-clip-tin="${b.dataset.clipIn}"]`).textContent = prev.currentTime.toFixed(1) + 's';
    });
    main.querySelectorAll('[data-clip-out]').forEach(b => b.onclick = () => {
      const prev = main.querySelector(`[data-clip-prev="${b.dataset.clipOut}"]`);
      (clipUI[b.dataset.clipOut] = clipUI[b.dataset.clipOut] || {}).end = prev.currentTime;
      main.querySelector(`[data-clip-tout="${b.dataset.clipOut}"]`).textContent = prev.currentTime.toFixed(1) + 's';
    });
    main.querySelectorAll('[data-clip-cut]').forEach(b => b.onclick = async () => {
      const epId = b.dataset.clipCut;
      const ep = p.episodes.find(e => e.id === epId);
      const sel = main.querySelector(`[data-clip-src="${epId}"]`);
      const prev = main.querySelector(`[data-clip-prev="${epId}"]`);
      const ui = clipUI[epId] || {};
      const start = ui.start || 0;
      const end = ui.end || (prev && prev.duration) || 0;
      if (!(end - start >= 0.5)) return U.toast('请先播放视频并「设入点/设出点」(间隔至少 0.5s)', 'error', 3200);
      const name = (main.querySelector(`[data-clip-name="${epId}"]`).value.trim()) || `${ep.title} 高光 ${start.toFixed(0)}-${end.toFixed(0)}s`;
      b.disabled = true; b.innerHTML = '<span class="spinner"></span> 裁剪中…';
      // 五件套计费(2026-08 六轮):FFmpeg cut 已入服务端白名单(ff.cut),本地同步扣费保持视图一致
      const tk = Tasks.start({ type: '生成切片', model: 'FFmpeg 裁剪', target: name, cost: COST.tool, projectId: p.id, episodeId: ep.id });
      if (!U.charge(COST.tool, '生成切片:' + name)) { Tasks.fail(tk, '积分不足'); b.disabled = false; b.textContent = '✂ 生成切片'; return; }
      try {
        const r = await Media.ffCut(sel.value, [{ start, end }], 'ff.cut', tk.id);
        (ep.clips = ep.clips || []).unshift({ id: Store.uid('clip'), name, src: sel.value, start, end, url: r.url, time: Store.now() });
        Store.save(); render();
        Tasks.done(tk, { filename: name + '.mp4', dataURL: r.url });
        U.toast('切片已生成:' + name, 'success');
      } catch (e) {
        U.refund(COST.tool, '生成切片失败:' + name, tk.id);
        Tasks.fail(tk, e.message);
        U.toast('切片失败:' + e.message, 'error', 3500); b.disabled = false; b.textContent = '✂ 生成切片';
      }
    });
    main.querySelectorAll('[data-clip-play]').forEach(b => b.onclick = () => {
      const [epId, cid] = b.dataset.clipPlay.split(':');
      const ep = p.episodes.find(e => e.id === epId);
      const c = (ep.clips || []).find(x => x.id === cid);
      if (!c) return;
      const prev = main.querySelector(`[data-clip-prev="${epId}"]`);
      prev.src = c.url; prev.currentTime = 0; prev.play().catch(() => {});
      prev.scrollIntoView({ block: 'nearest' });
    });
    main.querySelectorAll('[data-clip-dl]').forEach(b => b.onclick = () => {
      const [epId, cid] = b.dataset.clipDl.split(':');
      const ep = p.episodes.find(e => e.id === epId);
      const c = (ep.clips || []).find(x => x.id === cid);
      if (c) window.open(c.url, '_blank');
    });
    main.querySelectorAll('[data-clip-del]').forEach(b => b.onclick = () => {
      const [epId, cid] = b.dataset.clipDel.split(':');
      const ep = p.episodes.find(e => e.id === epId);
      ep.clips = (ep.clips || []).filter(x => x.id !== cid);
      Store.save(); render();
    });
  }

  /* ================= 🎞 成片库(已合成成片归档) ================= */
  function renderFilms(p) {
    const films = p.episodes.filter(e => e.composed);
    if (!films.length) return '<div class="empty"><div class="ico">🎞</div><p>暂无成片,在分镜工作区「合成成片」后归档于此</p></div>';
    return `<div class="grid proj-grid">${films.map(ep => `
    <div class="card proj-card" data-film="${ep.id}">
      <div class="proj-cover" style="height:110px;background:linear-gradient(135deg,hsl(${U.hashColor(ep.title)},68%,92%),hsl(${(U.hashColor(ep.title) + 40) % 360},72%,87%))">
        ${ep.composedUrl ? `<video src="${ep.composedUrl}" preload="metadata" muted style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover"></video>` : '<div class="ph" style="font-size:30px">🎞</div>'}
        <button class="btn ghost sm" data-playfilm="${ep.id}" style="position:absolute;left:6px;bottom:6px;background:rgba(0,0,0,.55);color:#fff;border:none" title="播放预览">▶ 播放</button>
      </div>
      <div class="proj-body">
        <div class="proj-name">${U.esc(ep.title)}</div>
        <div class="row" style="justify-content:space-between;margin-top:6px">
          ${Store.epComposedReady(ep) ? '<span class="tag green">已合成</span>' : '<span class="tag yellow" title="合成输入已变化(调序/裁剪/换素材等),旧成片保留可看,重新合成后恢复">成片待更新</span>'}${ep.composedVia === 'shots' ? '<span class="tag cyan" title="由分镜表合成">分镜表</span>' : ep.composedVia === 'beats' ? '<span class="tag yellow" title="由节拍板五段合成">节拍板</span>' : ''}
          <div class="row" style="gap:6px;align-items:center">
            <span class="small muted">${U.esc(ep.composedAt || '')}</span>
            <button class="btn sm btn-export" data-exp="${ep.id}" style="padding:3px 10px">导出 ⬇</button>
          </div>
        </div>
      </div>
    </div>`).join('')}</div>`;
  }

  /* 成片播放预览(真实 mp4,支持全屏);无 composedUrl 的老数据回退到逐镜预览 */
  function playFilm(p, ep) {
    if (!ep.composedUrl) { window.SB.openPlayer(p, ep, true); return; }
    U.openModal({
      title: '🎞 ' + ep.title,
      xl: true,
      body: `
      <video src="${ep.composedUrl}" controls autoplay style="width:100%;border-radius:10px;background:#000" data-pfv></video>
      <div class="row" style="margin-top:10px;justify-content:flex-end;gap:8px">
        <button class="btn sm" data-x="fs">⛶ 全屏播放</button>
        <button class="btn sm" data-x="dl">⬇ 下载 mp4</button>
      </div>`,
      onMount(m) {
        const v = m.querySelector('[data-pfv]');
        m.querySelector('[data-x=fs]').onclick = () => {
          if (v.requestFullscreen) v.requestFullscreen();
          else if (v.webkitRequestFullscreen) v.webkitRequestFullscreen();
          else U.toast('当前浏览器不支持全屏', 'error');
        };
        m.querySelector('[data-x=dl]').onclick = () => { U.downloadDataURL(`${p.name}_${ep.title}_成片.mp4`, ep.composedUrl); U.toast('成片已开始下载', 'success'); };
      },
    });
  }

  window.ProjTabs.clips = { render: renderClips, bind: bindClips };
  window.ProjTabs.films = { render: renderFilms, play: playFilm };
})();
