/* ============ timeline.js 时间线编辑器 ============
 * 合成成片前:逐镜微调出入点(入点/出点裁剪)、调整顺序、取舍分镜,确认后再合成。
 * 入口:分镜工作台「🎞 合成成片」(在线 FFmpeg 时先经过本编辑器)。
 * 状态持久化在 ep.tlOrder(镜头顺序) 与 ep.tlTrims(每镜 {start,end,off})。
 */
(function () {
  window.Timeline = {};

  function realDur(url) { // 读视频真实时长(元数据)
    return new Promise(res => {
      const v = document.createElement('video');
      v.preload = 'metadata';
      v.onloadedmetadata = () => res(v.duration || 0);
      v.onerror = () => res(0);
      setTimeout(() => res(0), 8000);
      v.src = url;
    });
  }

  Timeline.openCompose = function (p, ep, main) {
    const usable = ep.shots.filter(s => (Store.shotVideoReady(s) && s.video.url) || s.image); // 统一就绪判定:在线时模拟占位不算可用视频
    if (!usable.length) return U.toast('没有可合成的素材(分镜图/视频需先生成)', 'error', 3200);

    // 顺序与裁剪状态(持久化)
    ep.tlOrder = (Array.isArray(ep.tlOrder) ? ep.tlOrder : []).filter(id => usable.some(s => s.id === id));
    usable.forEach(s => { if (!ep.tlOrder.includes(s.id)) ep.tlOrder.push(s.id); });
    ep.tlTrims = ep.tlTrims || {};
    const durCache = {}; // shotId → 真实视频时长(惰性读取)

    U.openModal({
      title: '🎞 时间线编辑 · ' + ep.title,
      xxl: true,
      body: `
      <div class="hint" style="margin-bottom:10px">合成前微调:为每镜设置<b>入点/出点</b>(裁剪秒数)、用 ◀ ▶ 调整顺序、✕ 剔除本段;确认后按时间线合成。总时长 <b data-tl-total>…</b></div>
      <video data-tl-prev controls style="width:100%;max-height:300px;background:#0d0b1e;border-radius:10px;margin-bottom:12px;display:none"></video>
      <div data-tl-track style="display:flex;gap:10px;overflow-x:auto;padding:6px 2px 12px"></div>`,
      footer: `
        <button class="btn" data-x="tl-all">全选</button>
        <button class="btn" data-x="tl-none">全不选</button>
        <span class="grow"></span>
        <button class="btn" data-x="tl-cancel">取消</button>
        <button class="btn primary" data-x="tl-go">🎞 开始合成</button>`,
      onMount(m, close) {
        const track = m.querySelector('[data-tl-track]');
        const prev = m.querySelector('[data-tl-prev]');
        let prevTimer = null;

        const trimOf = s => ep.tlTrims[s.id] || (ep.tlTrims[s.id] = {});
        const clipDur = async s => {
          const vurl = Store.shotVideoReady(s) && s.video.url;
          if (!vurl) return Math.max(2, Math.min(15, (window.SB && SB.estShotDuration ? SB.estShotDuration(s) : s.duration || 3)));
          if (durCache[s.id] === undefined) durCache[s.id] = await realDur(vurl);
          return durCache[s.id] || (window.SB && SB.estShotDuration ? SB.estShotDuration(s) : (s.duration || 5));
        };
        const fmt = t => (Math.round(t * 10) / 10).toFixed(1) + 's';

        async function updTotal() {
          let sum = 0, cnt = 0;
          for (const id of ep.tlOrder) {
            const s = usable.find(x => x.id === id);
            const tr = trimOf(s);
            if (tr.off) continue;
            cnt++;
            const d = await clipDur(s);
            sum += (typeof tr.end === 'number' ? tr.end : d) - (tr.start || 0);
          }
          m.querySelector('[data-tl-total]').textContent = fmt(Math.max(0, sum)) + `(已选 ${cnt}/${ep.tlOrder.length} 段)`;
        }

        function cardHTML(s, idx) {
          const tr = trimOf(s);
          const thumb = (Store.shotVideoReady(s) && s.video.frame) || s.image;
          const isV = !!(Store.shotVideoReady(s) && s.video.url);
          return `
          <div class="card" data-clip="${s.id}" style="min-width:190px;max-width:190px;padding:8px;${tr.off ? 'opacity:.45' : ''}">
            <div class="ws-thumb-img" style="aspect-ratio:16/9;position:relative">
              ${thumb ? `<img src="${U.thumb(thumb)}" style="width:100%;height:100%;object-fit:cover">` : '<div class="ws-thumb-empty">无画面</div>'}
              <span class="tag cyan" style="position:absolute;top:4px;left:4px;font-size:10px">#${idx + 1}</span>
            </div>
            <div class="small" style="margin:5px 0 4px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${U.esc(s.plot || s.name || '')}">${U.esc((s.plot || s.name || '镜头 ' + (s.order + 1)).slice(0, 16))}</div>
            ${isV ? `
            <div class="row" style="gap:4px;margin-bottom:4px">
              <span class="small muted" style="flex:none">入</span><input class="input small" data-tl-in="${s.id}" type="number" min="0" step="0.1" value="${tr.start || 0}" style="width:64px;padding:2px 6px">
              <span class="small muted" style="flex:none">出</span><input class="input small" data-tl-out="${s.id}" type="number" min="0.2" step="0.1" value="${typeof tr.end === 'number' ? tr.end : ''}" placeholder="末" data-dur="${s.id}" style="width:64px;padding:2px 6px">
            </div>` : `<div class="small muted" style="margin-bottom:4px">图片段(时长 ${Math.max(2, Math.min(15, (window.SB && SB.estShotDuration ? SB.estShotDuration(s) : s.duration || 3)))}s)</div>`}
            <div class="row" style="gap:4px">
              ${isV ? `<button class="btn ghost sm" data-tl-play="${s.id}" title="预览 入点→出点">▶</button>` : ''}
              <button class="btn ghost sm" data-tl-l="${s.id}" title="前移" ${idx === 0 ? 'disabled' : ''}>◀</button>
              <button class="btn ghost sm" data-tl-r="${s.id}" title="后移" ${idx === ep.tlOrder.length - 1 ? 'disabled' : ''}>▶</button>
              <span class="grow"></span>
              <button class="btn ghost sm ${tr.off ? '' : 'danger'}" data-tl-off="${s.id}" title="${tr.off ? '恢复本段' : '剔除本段'}">${tr.off ? '↩' : '✕'}</button>
            </div>
          </div>`;
        }

        function renderTrack() {
          track.innerHTML = ep.tlOrder.map((id, i) => cardHTML(usable.find(s => s.id === id), i)).join('');
          bindTrack();
          updTotal();
        }

        function bindTrack() {
          track.querySelectorAll('[data-tl-l]').forEach(b => b.onclick = () => {
            const i = ep.tlOrder.indexOf(b.dataset.tlL);
            if (i > 0) { [ep.tlOrder[i - 1], ep.tlOrder[i]] = [ep.tlOrder[i], ep.tlOrder[i - 1]]; Store.save(); renderTrack(); }
          });
          track.querySelectorAll('[data-tl-r]').forEach(b => b.onclick = () => {
            const i = ep.tlOrder.indexOf(b.dataset.tlR);
            if (i >= 0 && i < ep.tlOrder.length - 1) { [ep.tlOrder[i + 1], ep.tlOrder[i]] = [ep.tlOrder[i], ep.tlOrder[i + 1]]; Store.save(); renderTrack(); }
          });
          track.querySelectorAll('[data-tl-off]').forEach(b => b.onclick = () => {
            const tr = trimOf(usable.find(s => s.id === b.dataset.tlOff));
            tr.off = !tr.off; Store.save(); renderTrack();
          });
          track.querySelectorAll('[data-tl-in]').forEach(inp => inp.onchange = () => {
            const s = usable.find(x => x.id === inp.dataset.tlIn);
            const tr = trimOf(s);
            tr.start = Math.max(0, +inp.value || 0);
            if (typeof tr.end === 'number' && tr.end <= tr.start + 0.2) tr.end = tr.start + 0.2;
            Store.save(); renderTrack();
          });
          track.querySelectorAll('[data-tl-out]').forEach(inp => inp.onchange = () => {
            const s = usable.find(x => x.id === inp.dataset.tlOut);
            const tr = trimOf(s);
            const v = +inp.value;
            if (inp.value === '' || !(v > 0)) { delete tr.end; } else tr.end = Math.max((tr.start || 0) + 0.2, v);
            Store.save(); renderTrack();
          });
          track.querySelectorAll('[data-tl-play]').forEach(b => b.onclick = async () => {
            const s = usable.find(x => x.id === b.dataset.tlPlay);
            const tr = trimOf(s);
            const d = await clipDur(s);
            if (typeof tr.end !== 'number') { tr.end = d; Store.save(); renderTrack(); } // 首次预览回填真实末点
            const start = tr.start || 0, end = typeof tr.end === 'number' ? tr.end : d;
            prev.style.display = '';
            prev.src = s.video.url;
            prev.currentTime = start;
            prev.play().catch(() => {});
            clearInterval(prevTimer);
            prevTimer = setInterval(() => { if (prev.currentTime >= end) { prev.pause(); clearInterval(prevTimer); } }, 100);
            prev.scrollIntoView({ block: 'nearest' });
          });
        }

        m.querySelector('[data-x=tl-all]').onclick = () => { ep.tlOrder.forEach(id => { trimOf(usable.find(s => s.id === id)).off = false; }); Store.save(); renderTrack(); };
        m.querySelector('[data-x=tl-none]').onclick = () => { ep.tlOrder.forEach(id => { trimOf(usable.find(s => s.id === id)).off = true; }); Store.save(); renderTrack(); };
        m.querySelector('[data-x=tl-cancel]').onclick = close;
        m.querySelector('[data-x=tl-go]').onclick = () => {
          // 八轮:合成序列统一走 Store.composeSeqOf(canonical 时间线快照,与就绪指纹同源),
          // 这里只做非空校验,不再自拼 shotsOverride
          const list = Store.composeSeqOf(ep);
          if (!list.length) return U.toast('时间线为空:请至少保留一段', 'error');
          clearInterval(prevTimer);
          close();
          window.SB.doCompose(p, ep, main);
        };

        renderTrack();
      },
      onClose() { clearInterval(prevTimer); }, // 弹窗任意方式关闭(✕/遮罩/取消)都要停掉预览轮询,防 100ms 定时器空转泄漏
    });
  };
})();
