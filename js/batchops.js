/* ============ batchops.js 分集全局五操作:选择模式 + 专属面板 ============
 * 顶部工具条 → 选择模式(卡片勾选) → 确认 → 专属面板
 * 定为终稿 / 选帧入库(资产库·关键帧) / 智能超清(智能修片) / 字幕擦除 / 一键审片
 */
(function () {
  const OPS = { final: '定为终稿', keyframe: '选帧入库', hd: '智能超清', erase: '字幕擦除', review: '一键审片' };

  const frameOf = s => (Store.shotVideoReady(s) && s.video.frame) || s.image || null; // 统一就绪判定:在线时模拟占位帧不入库/不修片
  const fmt2 = t => t.toFixed(2) + 's';
  const refresh = (p, ep, main) => { if (main && main.isConnected) Views.episode(main, p.id, ep.id); };

  /* ================= 选择模式 ================= */
  function enter(p, ep, main, op) {
    if (!ep.shots.length) return U.toast('暂无分镜可选择', 'error');
    window.__selMode = { op, selected: new Set() };
    refresh(p, ep, main);
  }
  function exit(p, ep, main) {
    window.__selMode = null;
    refresh(p, ep, main);
  }
  function toggle(shotId, p, ep, main) {
    const sm = window.__selMode;
    if (!sm) return;
    sm.selected.has(shotId) ? sm.selected.delete(shotId) : sm.selected.add(shotId);
    refresh(p, ep, main);
  }
  /* 全选未出片:一键选中所有 video.status!=='done' 的分镜 */
  function selectAllUndone(p, ep, main) {
    const sm = window.__selMode;
    if (!sm) return;
    const pend = ep.shots.filter(s => !s.video || s.video.status !== 'done');
    pend.forEach(s => sm.selected.add(s.id));
    U.toast(`已全选 ${pend.length} 个未出片分镜`, 'success');
    refresh(p, ep, main);
  }
  function confirm(p, ep, main) {
    const sm = window.__selMode;
    if (!sm || !sm.selected.size) return U.toast('请先点选视频卡片', 'error');
    const shots = ep.shots.filter(s => sm.selected.has(s.id));
    const op = sm.op;
    window.__selMode = null;
    refresh(p, ep, main);
    if (op === 'final') return doBatchFinal(p, ep, shots, main);
    if (op === 'keyframe') return keyframePanel(p, ep, shots, main, 0);
    if (op === 'hd') return hdPanel(p, ep, shots, main);
    if (op === 'erase') return erasePanel(p, ep, shots, main);
    if (op === 'review') return reviewConfirm(p, ep, shots, main);
  }

  /* ================= 定为终稿(批量) ================= */
  function doBatchFinal(p, ep, shots, main) {
    const already = shots.filter(s => s.final);
    shots.forEach(s => { s.final = true; });
    Store.save();
    refresh(p, ep, main);
    U.toast(`已将 ${shots.length} 个分镜定为终稿` + (already.length ? `(其中 ${already.length} 个原本已是终稿,可在卡片上解锁)` : ''), 'success', 3000);
  }

  /* ================= 选帧入库 →「资产库·关键帧」 ================= */
  function keyframePanel(p, ep, shots, main, idx) {
    const s = shots[idx];
    const src = frameOf(s);
    if (!src) {
      U.toast(`镜头 ${s.order + 1} 暂无画面,已跳过`, 'error');
      return idx + 1 < shots.length ? keyframePanel(p, ep, shots, main, idx + 1) : null;
    }
    const groups = Store.myGroups();
    const dur = (window.SB && SB.estShotDuration ? SB.estShotDuration(s) : (s.duration || 5));
    let t = 0, hdOn = false, hdModel = 'Volcengine,图片超分,enhance-image(模拟)';
    const total = shots.length;

    U.openModal({
      title: `资产库·关键帧${total > 1 ? `(${idx + 1}/${total})` : ''}`,
      wide: true,
      body: `
      <label class="field"><span>素材名称 *</span><input class="input" data-f="kname" value="${U.esc(ep.title)}_镜头${s.order + 1}"></label>
      <label class="field"><span>所属文件夹 *</span>
        <select class="select" data-f="kgrp">
          <option value="">未分组</option>
          ${groups.map(g => `<option value="${g.id}">${U.esc(g.name)}</option>`).join('')}
          <option value="__new">＋ 新建文件夹…</option>
        </select>
        <div class="row" style="margin-top:6px;display:none" data-newgrp>
          <input class="input" data-f="newgrpname" placeholder="输入新文件夹名称">
          <button class="btn sm" data-x="mkgrp">创建</button>
        </div>
      </label>
      <div class="row" style="justify-content:space-between;margin-bottom:6px">
        <b class="small">帧预览</b>
        <span class="small" style="color:var(--purple);font-weight:600" data-tc>${fmt2(0)} / ${fmt2(dur)}</span>
      </div>
      <div style="position:relative;border-radius:10px;overflow:hidden;background:#000;margin-bottom:12px">
        <img src="${src}" style="width:100%;display:block;aspect-ratio:16/9;object-fit:cover">
        <span class="mini-badge" style="bottom:8px;background:rgba(0,0,0,.65);color:#fff" data-cur>⏱ ${fmt2(0)}</span>
      </div>
      <b class="small">视频时间轴</b>
      <div class="kf-tl" data-tl style="margin-top:6px;background-image:url('${src}');background-size:cover;background-position:center">
        <div style="position:absolute;inset:0;background:repeating-linear-gradient(90deg,rgba(0,0,0,.35) 0 2px,transparent 2px 40px),linear-gradient(rgba(10,12,18,.15),rgba(10,12,18,.15))"></div>
        <div class="cursor" data-cursor style="left:0%"></div>
      </div>
      <div class="kf-ticks">${Array.from({ length: Math.min(5, dur + 1) }, (_, i) => { const sec = Math.round(i * dur / Math.min(4, dur)); return `<span>${sec}s</span>`; }).join('')}</div>
      <div class="divider" style="text-align:center;position:relative"><span style="background:var(--panel);padding:0 12px;position:relative;top:-10px" class="small muted">高清设置(可选)</span></div>
      <div class="row" style="justify-content:space-between;margin-top:2px">
        <div><b class="small">图片高清</b><div class="hint" style="margin:2px 0 0">可选择模型进行图片高清。</div></div>
        <div class="row">
          <span class="small muted" data-hdst>已关闭</span>
          <span class="switch" data-x="hdsw"></span>
        </div>
      </div>
      <div data-hdbox style="display:none;margin-top:8px">
        <select class="select small" data-f="hdmodel">${['Volcengine,图片超分,enhance-image(模拟)', 'SophNet,Banana(渠道一),NB2-S-4K(模拟)'].map(mo => `<option>${mo}</option>`).join('')}</select>
      </div>`,
      footer: `
        <div class="row" style="width:100%;justify-content:flex-end;gap:10px;align-items:flex-end">
          <div style="text-align:right"><span class="cost-pill">限时免费</span><br><button class="btn" data-x="cancel">取消</button></div>
          <button class="btn primary" data-x="ok" style="padding:10px 28px">⚡ 提交</button>
        </div>`,
      onMount(m, close) {
        // 文件夹新建
        m.querySelector('[data-f=kgrp]').onchange = e => {
          m.querySelector('[data-newgrp]').style.display = e.target.value === '__new' ? '' : 'none';
        };
        m.querySelector('[data-x=mkgrp]').onclick = () => {
          const n = m.querySelector('[data-f=newgrpname]').value.trim();
          if (!n) return U.toast('请输入文件夹名称', 'error');
          const g = { id: Store.uid('grp'), userId: Store.currentUser().id, name: n, shared: [], time: Store.now() };
          Store.state.assets.groups.push(g); Store.save();
          const sel = m.querySelector('[data-f=kgrp]');
          const opt = document.createElement('option');
          opt.value = g.id; opt.textContent = n; opt.selected = true;
          sel.insertBefore(opt, sel.lastElementChild);
          sel.value = g.id;
          m.querySelector('[data-newgrp]').style.display = 'none';
          U.toast('文件夹已创建:' + n, 'success');
        };
        // 时间轴拖动取帧
        const tl = m.querySelector('[data-tl]'), cursor = m.querySelector('[data-cursor]');
        const setT = frac => {
          t = Math.max(0, Math.min(dur, Math.round(frac * dur * 100) / 100));
          cursor.style.left = (t / dur * 100) + '%';
          m.querySelector('[data-tc]').textContent = `${fmt2(t)} / ${fmt2(dur)}`;
          m.querySelector('[data-cur]').textContent = '⏱ ' + fmt2(t);
        };
        let dragging = false;
        const frac = e => { const r = tl.getBoundingClientRect(); return (e.clientX - r.left) / r.width; };
        tl.addEventListener('mousedown', e => { dragging = true; setT(frac(e)); e.preventDefault(); });
        // M6 修复:命名监听并先移除,防止选帧面板重复打开导致累积
        const onMove = e => { if (dragging) setT(frac(e)); };
        const onUp = () => { dragging = false; };
        if (window.__kfMove) { document.removeEventListener('mousemove', window.__kfMove); document.removeEventListener('mouseup', window.__kfUp); }
        window.__kfMove = onMove; window.__kfUp = onUp;
        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup', onUp);
        // 高清开关
        m.querySelector('[data-x=hdsw]').onclick = () => {
          hdOn = !hdOn;
          m.querySelector('[data-x=hdsw]').classList.toggle('on', hdOn);
          m.querySelector('[data-hdst]').textContent = hdOn ? '已开启' : '已关闭';
          m.querySelector('[data-hdbox]').style.display = hdOn ? '' : 'none';
        };
        m.querySelector('[data-f=hdmodel]').onchange = e => hdModel = e.target.value;
        m.querySelector('[data-x=cancel]').onclick = close;
        m.querySelector('[data-x=ok]').onclick = async () => {
          const name = m.querySelector('[data-f=kname]').value.trim();
          if (!name) return U.toast('请填写素材名称', 'error');
          const groupId = (v => v === '__new' ? null : v)(m.querySelector('[data-f=kgrp]').value) || null;
          const btn = m.querySelector('[data-x=ok]');
          btn.disabled = true; btn.innerHTML = '<span class="spinner"></span> 取帧中…';
          const frame = await captureFrame(src, t, dur, s);
          if (hdOn) { await U.delay(900); }
          Store.state.assets.subjects.push({
            id: Store.uid('as'), userId: Store.currentUser().id, kind: 'keyframe', name,
            image: frame, prompt: s.prompt || '', tags: hdOn ? ['关键帧', '已高清'] : ['关键帧'],
            groupId, fromProject: p.name + ' / ' + ep.title, time: Store.now(),
            frameTime: fmt2(t), hdModel: hdOn ? hdModel : null,
          });
          s.history = s.history || [];
          s.history.unshift({ type: '选帧入库', model: hdOn ? '图片高清' : '限时免费', time: Store.now() });
          Store.save();
          Tasks.done(Tasks.start({ type: '选帧入库', model: hdOn ? hdModel : '限时免费', target: `${ep.title}·镜头${s.order + 1}@${fmt2(t)}`, projectId: p.id, episodeId: ep.id, shotId: s.id }), { filename: name + '.png', dataURL: frame });
          U.toast(hdOn ? `帧(${fmt2(t)})已高清入库` : `帧(${fmt2(t)})已加入资产库·关键帧`, 'success');
          close();
          if (main) refresh(p, ep, main);
          if (idx + 1 < total) keyframePanel(p, ep, shots, main, idx + 1);
          else if (total > 1) U.toast(`${total} 个分镜已全部入库完成`, 'success', 3000);
        };
      },
    });
  }

  /* 取帧:真图绘制+时间码水印;失败回退占位图 */
  function captureFrame(src, t, dur, s) {
    return new Promise(resolve => {
      const cv = document.createElement('canvas');
      cv.width = 640; cv.height = 360;
      const ctx = cv.getContext('2d');
      const img = new Image();
      let settled = false;
      // 占位回退:加载失败 / 跨域绘制被拦截(SecurityError)/ 超时共用,保证 Promise 必 resolve
      const fallback = () => {
        if (settled) return;
        settled = true;
        resolve(PH.image({ label: '关键帧 ' + fmt2(t), sub: (s.plot || '').slice(0, 16), kind: 'shot', w: 640, h: 360, seedText: 'kf:' + s.id + ':' + t }));
      };
      img.onload = () => {
        try {
          ctx.drawImage(img, 0, 0, 640, 360);
          ctx.fillStyle = 'rgba(0,0,0,.55)';
          ctx.fillRect(640 - 150, 360 - 34, 150, 34);
          ctx.fillStyle = '#fff';
          ctx.font = '600 15px sans-serif';
          ctx.fillText(`⏱ ${fmt2(t)} / ${fmt2(dur)}`, 640 - 140, 360 - 12);
          const url = cv.toDataURL('image/png'); // 跨域图片此处抛 SecurityError
          if (settled) return;
          settled = true;
          resolve(url);
        } catch (e) { fallback(); }
      };
      img.onerror = fallback;
      setTimeout(fallback, 8000); // 兜底:加载/绘制卡死时 8s 超时回退
      img.src = src;
    });
  }

  /* ================= 智能超清 →「智能修片」 ================= */
  function hdPanel(p, ep, shots, main) {
    let res = '1080P', fpsMode = 'follow', fps = 30, scene = '短剧', ver = '标准版';
    const price = () => (ver === '专业版' ? COST.hdPro : COST.hdStd) * shots.length;
    // label:芯片显示文案(分辨率值与服务端映射表一致用 720P/1080P,显示仍小写 p)
    const rpill = (g, v, cur, extra, label) => `<div class="rpill ${cur === v ? 'sel' : ''}" data-g="${g}" data-v="${v}"><i></i>${label || v}${extra || ''}</div>`;
    U.openModal({
      title: `智能修片${shots.length > 1 ? `(已选 ${shots.length} 个视频)` : ''}`,
      wide: true,
      body: `
      <label class="field"><span>目标分辨率</span>
        <div class="row wrap" style="gap:10px">${['720P', '1080P', '2K', '4K'].map(r => rpill('res', r, res, '', r.replace('P', 'p'))).join('')}</div>
      </label>
      <label class="field"><span>输出帧率</span>
        <div class="row wrap" style="gap:10px;align-items:center">
          <div class="rpill ${fpsMode === 'follow' ? 'sel' : ''}" data-g="fpsm" data-v="follow"><i></i>跟随原视频</div>
          <div class="rpill ${fpsMode === 'custom' ? 'sel' : ''}" data-g="fpsm" data-v="custom"><i></i>自定义</div>
          <input class="input" type="number" min="1" max="120" value="${fps}" data-f="fps" style="width:90px" ${fpsMode === 'custom' ? '' : 'disabled'}>
          <span class="small muted">1-120</span>
        </div>
      </label>
      <label class="field"><span>场景</span>
        <div class="row wrap" style="gap:10px">${['通用', '短剧', 'UGC短视频', 'AIGC内容', '老片修复'].map(sc2 => rpill('scene', sc2, scene)).join('')}</div>
      </label>
      <label class="field"><span>版本</span>
        <div class="row wrap" style="gap:10px">
          ${rpill('ver', '标准版', ver, `(${COST.hdStd} 积分/镜)`)}
          ${rpill('ver', '专业版', ver, `(${COST.hdPro} 积分/镜)`)}
        </div>
      </label>`,
      footer: `
        <div class="row" style="width:100%;justify-content:flex-end;gap:10px;align-items:flex-end">
          <button class="btn" data-x="cancel">取消</button>
          <div style="text-align:right"><span class="cost-pill" data-costpill>${price()} 积分</span><br><button class="btn primary" data-x="ok" style="padding:10px 28px">⚡ 提交</button></div>
        </div>`,
      onMount(m, close) {
        m.querySelectorAll('[data-g]').forEach(o => o.onclick = () => {
          const g = o.dataset.g, v = o.dataset.v;
          if (g === 'res') res = v;
          else if (g === 'fpsm') { fpsMode = v; m.querySelector('[data-f=fps]').disabled = v !== 'custom'; }
          else if (g === 'scene') scene = v;
          else if (g === 'ver') ver = v;
          m.querySelectorAll(`[data-g="${g}"]`).forEach(x => x.classList.toggle('sel', x === o));
          m.querySelector('[data-costpill]').textContent = price() + ' 积分';
        });
        m.querySelector('[data-f=fps]').onchange = e => fps = Math.max(1, Math.min(120, +e.target.value || 30));
        m.querySelector('[data-x=cancel]').onclick = close;
        m.querySelector('[data-x=ok]').onclick = async () => {
          close();
          await processHD(p, ep, shots, main, { res, fpsMode, fps, scene, ver }); // 逐条扣费在 processHD 内按镜进行
        };
      },
    });
  }

  async function processHD(p, ep, shots, main, cfg) {
    const per = cfg.ver === '专业版' ? COST.hdPro : COST.hdStd;
    const shotUrl = s => (Store.shotVideoReady(s) && s.video.url) || null; // 统一就绪判定:在线时模拟占位无真实视频不可修片
    const optsOf = s => ({ type: '智能修片', model: `enhance-image·${cfg.res}·${cfg.ver}`, target: `${ep.title}·镜头${s.order + 1}`, cost: per, actionName: `智能修片 ${cfg.res}·${cfg.ver}`, projectId: p.id, episodeId: ep.id, shotId: s.id });
    // 在线:FFmpeg 真实超分(lanczos+unsharp);逐条扣费统一走 Tasks.runBatch,
    // 每镜单独 登记→扣费→处理→失败/无源退该镜费用,余额不足仅该镜失败(替代原"整批预扣+手写逐镜退费")
    if (window.Media && Media.isReady()) {
      const r = await Tasks.runBatch(optsOf, shots, async (s, tk) => {
        const url = shotUrl(s);
        if (!url) { const e = new Error('该镜无服务端真实视频'); e.refundReason = `镜头${s.order + 1} 修片退费`; throw e; }
        U.toast(`镜头${s.order + 1} 超分处理中(${cfg.res})…`, 'info', 2500);
        // 七轮:修片按白名单高价动作计费(ff.hdStd=20/ff.hdPro=100,与服务端定价一致),operationId=任务 id
        const rr = await Media.ffUpscale(url, cfg.res, cfg.ver === '专业版' ? 'pro' : 'std', cfg.ver === '专业版' ? 'ff.hdPro' : 'ff.hdStd', tk.id);
        s.video = Object.assign({}, s.video, { url: rr.url });
        s.upscaled = { res: cfg.res, scene: cfg.scene, ver: cfg.ver, fps: cfg.fpsMode === 'follow' ? '跟随原视频' : cfg.fps + 'fps', time: Store.now() };
        s.history = s.history || [];
        s.history.unshift({ type: `智能修片 ${cfg.res}·${cfg.scene}·${cfg.ver}`, model: 'FFmpeg lanczos+unsharp·' + cfg.res, time: Store.now(), url: rr.url });
        return { filename: `镜头${s.order + 1}_超清${cfg.res}.mp4`, dataURL: rr.url };
      }, (s, ok, outOrErr) => {
        if (!ok && outOrErr && outOrErr.message && !String(outOrErr.message).includes('无服务端真实视频'))
          U.toast(`镜头${s.order + 1} 修片失败,已退费:` + outOrErr.message, 'error', 4000);
        Store.save();
        refresh(p, ep, main);
      });
      U.toast(`智能修片完成:成功 ${r.ok} 镜${r.fail ? `,失败 ${r.fail} 镜(已退费)` : ''}`, r.fail ? 'info' : 'success', 3500);
      return;
    }
    // 离线模式:占位徽标(同一生命周期逐条登记扣费)
    await new Promise(done => U.runTask({
      title: '智能修片处理中(离线模拟)',
      steps: shots.map(s => ({ label: `镜头 ${s.order + 1} · ${cfg.res} · ${cfg.scene}`, ms: 1100 })),
      onDone: done,
    }));
    await Tasks.runBatch(optsOf, shots, async (s) => {
      s.upscaled = { res: cfg.res, scene: cfg.scene, ver: cfg.ver, fps: cfg.fpsMode === 'follow' ? '跟随原视频' : cfg.fps + 'fps', time: Store.now() };
      s.history = s.history || [];
      s.history.unshift({ type: `智能修片 ${cfg.res}·${cfg.scene}·${cfg.ver}`, model: 'Volcengine,图片超分,enhance-image(模拟)', time: Store.now() });
    });
    Store.save();
    refresh(p, ep, main);
    U.openModal({
      title: '✅ 智能修片完成',
      body: `<p style="line-height:2">已完成 ${shots.length} 个视频的修片:${cfg.res} · ${cfg.scene} · ${cfg.ver} · ${cfg.fpsMode === 'follow' ? '跟随原视频帧率' : cfg.fps + 'fps'}。<br><span class="muted small">分镜卡已显示「已超清 ${cfg.res}」徽标,处理记录已写入生成历史。</span></p>`,
      footer: `<button class="btn" data-x="close">关闭</button><button class="btn primary" data-x="dl">⬇ 下载结果清单</button>`,
      onMount(m, close2) {
        m.querySelector('[data-x=close]').onclick = close2;
        m.querySelector('[data-x=dl]').onclick = () => {
          U.downloadText(`智能修片结果_${ep.title}.txt`, `智能修片结果\n分集:${ep.title}\n参数:${cfg.res} / ${cfg.scene} / ${cfg.ver} / ${cfg.fpsMode === 'follow' ? '跟随原视频' : cfg.fps + 'fps'}\n镜头:${shots.map(s => s.order + 1).join('、')}\n时间:${Store.now()}`);
          U.toast('结果清单已下载', 'success');
        };
      },
    });
  }

  /* ================= 字幕擦除 ================= */
  function erasePanel(p, ep, shots, main) {
    let mode = '对白字幕擦除';
    const price = () => COST.erase * shots.length;
    U.openModal({
      title: `字幕擦除${shots.length > 1 ? `(已选 ${shots.length} 个视频)` : ''}`,
      body: `
      <label class="field"><span>擦除模式</span>
        <div class="row wrap" style="gap:10px">
          <div class="rpill sel" data-m="对白字幕擦除"><i></i>对白字幕擦除</div>
          <div class="rpill" data-m="全局字幕擦除"><i></i>全局字幕擦除</div>
        </div>
        <div class="hint">对白字幕擦除:仅擦除人物对白区域;全局字幕擦除:清除画面内全部字幕。</div>
      </label>`,
      footer: `
        <div class="row" style="width:100%;justify-content:flex-end;gap:10px;align-items:flex-end">
          <button class="btn" data-x="cancel">取消</button>
          <div style="text-align:right"><span class="cost-pill">${price()} 积分</span><br><button class="btn primary" data-x="ok" style="padding:10px 28px">⚡ 提交</button></div>
        </div>`,
      onMount(m, close) {
        m.querySelectorAll('[data-m]').forEach(o => o.onclick = () => { mode = o.dataset.m; m.querySelectorAll('[data-m]').forEach(x => x.classList.toggle('sel', x === o)); });
        m.querySelector('[data-x=cancel]').onclick = close;
        m.querySelector('[data-x=ok]').onclick = async () => {
          close();
          const shotUrl = s => (Store.shotVideoReady(s) && s.video.url) || null; // 统一就绪判定
          const optsOf = s => ({ type: '字幕擦除', model: 'FFmpeg delogo·' + mode, target: `${ep.title}·镜头${s.order + 1}`, cost: COST.erase, actionName: `字幕擦除(${mode})`, projectId: p.id, episodeId: ep.id, shotId: s.id });
          // 在线:FFmpeg delogo 真实擦除;逐条扣费统一走 Tasks.runBatch,
          // 每镜单独 登记→扣费→擦除→失败/无源退该镜费用,余额不足仅该镜失败(替代原"整批预扣+手写逐镜退费")
          if (window.Media && Media.isReady()) {
            const r = await Tasks.runBatch(optsOf, shots, async (s, tk) => {
              const url = shotUrl(s);
              if (!url) { const e = new Error('该镜无服务端真实视频'); e.refundReason = `镜头${s.order + 1} 擦除退费`; throw e; }
              U.toast(`镜头${s.order + 1} 字幕擦除中…`, 'info', 2500);
              const rr = await Media.ffSuberase(url, mode, 'ff.erase', tk.id); // 七轮:白名单动作+稳定 operationId(任务 id)
              s.video = Object.assign({}, s.video, { url: rr.url });
              s.subtitleErased = true;
              s.history = s.history || [];
              s.history.unshift({ type: '字幕擦除(' + mode + ')', model: 'FFmpeg delogo·' + mode, time: Store.now(), url: rr.url });
              return { filename: `镜头${s.order + 1}_去字幕.mp4`, dataURL: rr.url };
            }, (s, ok, outOrErr) => {
              if (!ok && outOrErr && outOrErr.message && !String(outOrErr.message).includes('无服务端真实视频'))
                U.toast(`镜头${s.order + 1} 擦除失败,已退费:` + outOrErr.message, 'error', 4000);
              Store.save();
              refresh(p, ep, main);
            });
            U.toast(`字幕擦除完成:成功 ${r.ok} 镜${r.fail ? `,失败 ${r.fail} 镜(已退费)` : ''}(${mode})`, r.fail ? 'info' : 'success', 3500);
            return;
          }
          // 离线模式:占位徽标(同一生命周期逐条登记扣费)
          await new Promise(done => U.runTask({
            title: '字幕擦除 · ' + mode + '(离线模拟)',
            steps: [{ label: '字幕区域检测', ms: 900 }, ...shots.map(s => ({ label: `镜头 ${s.order + 1} 擦除重建`, ms: 900 })), { label: '导出', ms: 600 }],
            onDone: done,
          }));
          await Tasks.runBatch(optsOf, shots, async (s) => {
            s.subtitleErased = true;
            s.history = s.history || [];
            s.history.unshift({ type: '字幕擦除(' + mode + ')', model: 'erasevideosubtitle(模拟)', time: Store.now() });
          });
          Store.save();
          refresh(p, ep, main);
          U.toast(`字幕擦除完成(${shots.length} 镜,${mode})`, 'success');
        };
      },
    });
  }

  /* ================= 一键审片(确认弹窗,对齐 4.png) ================= */
  function reviewConfirm(p, ep, shots, main) {
    const first = shots[0];
    const epIdx = (p.episodes || []).findIndex(e => e.id === ep.id) + 1;
    const target = shots.length === 1 ? `'视频 #${epIdx}·${first.order + 1}'` : `选中的 ${shots.length} 个视频`;
    const total = COST.review * shots.length;
    U.openModal({
      title: '一键审片',
      body: `<p style="line-height:2">是否要对${target}进行一键审片?系统将基于当前任务的视频与提示词生成审片报告。</p>`,
      footer: `
        <div class="row" style="width:100%;justify-content:flex-end;gap:10px;align-items:flex-end">
          <button class="btn" data-x="cancel">取消</button>
          <div style="text-align:right"><span class="cost-pill">${total} 积分</span><br><button class="btn primary" data-x="ok" style="padding:10px 28px">确认</button></div>
        </div>`,
      onMount(m, close) {
        m.querySelector('[data-x=cancel]').onclick = close;
        m.querySelector('[data-x=ok]').onclick = async () => {
          if (!U.requireCredits(total, `一键审片×${shots.length}`)) return;
          close();
          const reports = [];
          for (const s of shots) {
            const r = await Review.reviewShot(p, ep, s);
            if (r) reports.push({ shot: s, report: r });
          }
          refresh(p, ep, main);
          if (!reports.length) return;
          if (reports.length === 1) return Review.openReport(p, ep, reports[0].shot, main, reports[0].report);
          openReviewSummary(p, ep, reports, main);
        };
      },
    });
  }

  /* 多镜审片汇总 */
  function openReviewSummary(p, ep, reports, main) {
    const avg = Math.round(reports.reduce((a, x) => a + x.report.score, 0) / reports.length * 10) / 10;
    U.openModal({
      title: `一键审片汇总(${reports.length} 镜)`,
      wide: true,
      body: `
      <div class="rv-head">
        <div><div class="rv-score-label">平均得分</div><div class="rv-score">${avg.toFixed(1)} <small>/ 10</small></div></div>
        <div class="rv-chips">
          <span class="rv-chip">≥8.5 ${reports.filter(x => x.report.score >= 8.5).length} 镜</span>
          <span class="rv-chip mid">${Domain.REVIEW_MIN}~8.5 ${reports.filter(x => x.report.score >= Domain.REVIEW_MIN && x.report.score < 8.5).length} 镜</span>
          <span class="rv-chip low">&lt;${Domain.REVIEW_MIN} ${reports.filter(x => x.report.score < Domain.REVIEW_MIN).length} 镜</span>
        </div>
      </div>
      <div class="card" style="margin-top:14px;padding:14px">
        ${reports.map(x => `
        <div class="rv-bar-row" data-jump="${x.shot.id}">
          <span class="small" style="width:52px;flex:none">镜头 ${x.shot.order + 1}</span>
          <div class="rv-bar-track"><div class="rv-bar-fill ${x.report.score < Domain.REVIEW_MIN ? 'low' : ''}" style="width:${x.report.score * 10}%"></div></div>
          <b style="width:34px;text-align:right;color:${x.report.score >= 8 ? 'var(--green)' : x.report.score >= Domain.REVIEW_MIN ? 'var(--yellow)' : 'var(--red)'}">${x.report.score.toFixed(1)}</b>
        </div>`).join('')}
        <div class="hint" style="margin-top:6px">点击某镜查看完整审片报告</div>
      </div>`,
      footer: `<button class="btn primary" data-x="close">完成</button>`,
      onMount(m, close) {
        m.querySelector('[data-x=close]').onclick = close;
        m.querySelectorAll('[data-jump]').forEach(row => row.onclick = () => {
          const s = ep.shots.find(x => x.id === row.dataset.jump);
          close();
          Review.openReport(p, ep, s, main, s.reviews[0]);
        });
      },
    });
  }

  window.BatchOps = { OPS, enter, exit, toggle, selectAllUndone, confirm, keyframePanel, hdPanel, erasePanel }; // R11 收窄:仅导出外部使用的成员
})();
