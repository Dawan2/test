/* ============ sb-gen.js 分镜视频生成链路:单镜/批量生成、首尾帧、历史版本、连抽(拆自 storyboard.js) ============
 * 加载顺序:storyboard.js、sb-views.js 之后,sb-io.js 之前;共享常量/辅助顶部经 window.SB 解构,
 * 美术后缀 SBViews.artSuffixApp 运行时解析。拆分前 window.SB 成员在末尾回挂,外部调用点不变。 */
(function () {
  const { onEpPage, prevEpTail, ttsShot, openConfirmGateModal, autoSmartReview, snapshotShot, renderShots, STRATEGIES } = window.SB;

  function shotVersions(s) {
    // 汇总带画面/提示词的版本(取自 history,新条目在最上)
    const vers = [];
    (s.history || []).forEach(h => {
      if (h.frame || h.prompt || h.url) vers.push({ time: h.time, model: h.model, strategy: h.strategy, prompt: h.prompt, frame: h.frame, url: h.url || '', type: h.type, firstFrame: h.firstFrame || null, lastFrame: h.lastFrame || null });
    });
    return vers;
  }

  function openVersions(p, ep, s, main) {
    const vers = shotVersions(s);
    const score = (s.reviews || [])[0] ? (s.reviews[0].score.toFixed(1) + ' 分') : '未审';
    const curFrame = (Store.shotVideoReady(s) && s.video.frame) || s.image; // 统一就绪判定
    let selIdx = 0;
    let onKey = null;
    U.openModal({
      title: `历史版本 · 镜头 ${s.order + 1}(${vers.length} 版)`,
      wide: true,
      body: (vers.length ? `<div class="hint" style="margin:0 0 10px">⌨ ↑↓ 切换分镜 · ←→ 选择版本 · Enter 应用此版</div>` : '') + (vers.length ? vers.map((v, i) => `
      <div class="card" style="margin-bottom:10px;padding:12px" data-vcard="${i}">
        <div class="row" style="gap:12px;align-items:flex-start">
          <div class="ws-thumb-img" style="width:120px;flex:none;aspect-ratio:16/9">
            ${v.frame ? `<img src="${U.thumb(v.frame)}">` : '<div class="ws-thumb-empty">无画面</div>'}
          </div>
          <div class="grow">
            <div class="row wrap" style="gap:5px;margin-bottom:5px">
              <span class="tag cyan">v${vers.length - i}</span>
              <span class="tag">${U.esc(v.type)}</span>
              ${v.url ? '<span class="tag green" title="该版本留存有视频文件,对比时可播放">🎬 可播放</span>' : ''}
              ${v.strategy ? `<span class="tag purple">${({ fusion: '多图融合', frames: '首尾帧', ref: '分镜参考' })[v.strategy] || v.strategy}</span>` : ''}
              <span class="tag yellow">审核 ${score}</span>
            </div>
            <div class="small muted" style="margin-bottom:4px">${U.esc(v.model)} · ${U.esc(v.time)}</div>
            <div class="hint" style="margin:0">${U.esc((v.prompt || '').slice(0, 70))}${(v.prompt || '').length > 70 ? '…' : ''}</div>
          </div>
          <div class="row" style="gap:5px;flex:none">
            <button class="btn sm" data-cmp="${i}">对比</button>
            <button class="btn sm primary" data-apply="${i}">应用此版</button>
          </div>
        </div>
      </div>`).join('') : '<div class="empty"><p>暂无带画面/提示词的版本,生成视频或优化提示词后自动记录</p></div>'),
      onMount(m, close) {
        // 键盘导航(↑↓切分镜 ←→切方案),仅当本弹窗在最上层时响应
        const highlight = () => {
          m.querySelectorAll('[data-vcard]').forEach((c, i) => { c.style.outline = i === selIdx ? '2px solid var(--accent)' : ''; });
          const cur = m.querySelector(`[data-vcard="${selIdx}"]`);
          if (cur) cur.scrollIntoView({ block: 'nearest' });
        };
        const isTop = () => document.getElementById('modal-root').lastElementChild === m;
        onKey = e => {
          if (!isTop()) return;
          if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
            e.preventDefault();
            const ni = ep.shots.indexOf(s) + (e.key === 'ArrowDown' ? 1 : -1);
            if (ni < 0 || ni >= ep.shots.length) return;
            close();
            openVersions(p, ep, ep.shots[ni], main);
          } else if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
            e.preventDefault();
            if (!vers.length) return;
            selIdx = (selIdx + (e.key === 'ArrowRight' ? 1 : -1) + vers.length) % vers.length;
            highlight();
          } else if (e.key === 'Enter') {
            const b = m.querySelector(`[data-apply="${selIdx}"]`);
            if (b) b.click();
          }
        };
        document.addEventListener('keydown', onKey);
        highlight();
        m.querySelectorAll('[data-cmp]').forEach(b => b.onclick = () => {
          const v = vers[+b.dataset.cmp];
          const curUrl = s.video && s.video.status === 'done' ? s.video.url : '';
          // 有视频地址用可播放 video,否则退回静帧图
          const mediaBox = (url, frame, side) => url
            ? `<video data-cmpv="${side}" src="${U.esc(url)}" ${frame ? `poster="${U.esc(frame)}"` : ''} controls preload="metadata"></video>`
            : frame ? `<img src="${U.esc(frame)}">` : '<div class="hint">无画面</div>';
          const bothVideo = !!(curUrl && v.url);
          U.openModal({
            title: '版本对比:当前版 vs v' + (vers.length - +b.dataset.cmp),
            xxl: true,
            body: `
            ${bothVideo ? `
            <div class="row" style="gap:10px;align-items:center;margin-bottom:10px;padding:8px 14px;background:var(--panel2);border-radius:10px;flex:none">
              <button class="btn sm primary" data-x="sync-play">▶ 同步播放</button>
              <input type="range" data-x="sync-seek" min="0" max="1000" value="0" style="flex:1" title="同一时间轴:拖动则两个视频同步跳转">
              <span class="small muted" data-x="sync-time" style="flex:none;min-width:96px;text-align:right">0.0s / 0.0s</span>
            </div>` : ''}
            <div class="rv-compare big">
              <div class="box">
                <h5>当前版${curUrl ? '(视频可播放)' : '(静帧)'}</h5>
                ${mediaBox(curUrl, curFrame, 'a')}
                <div class="cmp-meta">
                  <div class="small" style="line-height:1.8">${U.esc(s.prompt)}</div>
                  <div class="hint" style="margin-top:6px">运镜:${U.esc(s.camera)} · 策略:${({ fusion: '多图融合', frames: '首尾帧', ref: '分镜参考' })[s.genStrategy || 'ref']}</div>
                </div>
              </div>
              <div class="box" style="border-color:rgba(167,139,250,.4)">
                <h5 style="color:var(--purple)">历史版 v${vers.length - +b.dataset.cmp}(${U.esc(v.time)})${v.url ? '(视频可播放)' : '(静帧)'}</h5>
                ${mediaBox(v.url, v.frame, 'b')}
                ${!v.url ? '<div class="hint" style="margin-bottom:6px">该版本生成时未留存视频文件(模拟生成或早期版本),仅可对比静帧;新生成的版本支持视频对比</div>' : ''}
                <div class="cmp-meta">
                  <div class="small" style="line-height:1.8">${U.esc(v.prompt || '(无提示词记录)')}</div>
                  <div class="hint" style="margin-top:6px">模型:${U.esc(v.model)}${v.strategy ? ' · 策略:' + ({ fusion: '多图融合', frames: '首尾帧', ref: '分镜参考' })[v.strategy] : ''}</div>
                </div>
              </div>
            </div>`,
            onMount(mm) {
              // 双视频同步播放:同一时间轴,播放/暂停/拖动联动,漂移自动校正
              const va = mm.querySelector('[data-cmpv=a]'), vb = mm.querySelector('[data-cmpv=b]');
              if (!va || !vb) return;
              const btn = mm.querySelector('[data-x=sync-play]');
              const seek = mm.querySelector('[data-x=sync-seek]');
              const timeEl = mm.querySelector('[data-x=sync-time]');
              const dur = () => Math.min(va.duration || 0, vb.duration || 0) || 0;
              const syncBtn = () => { btn.textContent = (va.paused || vb.paused) ? '▶ 同步播放' : '⏸ 同步暂停'; };
              btn.onclick = () => {
                if (va.paused || vb.paused) { vb.currentTime = va.currentTime; va.play(); vb.play(); }
                else { va.pause(); vb.pause(); }
                syncBtn();
              };
              seek.oninput = () => {
                const t = (+seek.value / 1000) * dur();
                va.currentTime = t; vb.currentTime = t;
              };
              va.ontimeupdate = () => {
                const d = dur();
                if (d > 0) seek.value = Math.round((Math.min(va.currentTime, d) / d) * 1000);
                timeEl.textContent = va.currentTime.toFixed(1) + 's / ' + (va.duration || 0).toFixed(1) + 's';
                if (Math.abs(va.currentTime - vb.currentTime) > 0.3) vb.currentTime = va.currentTime; // 漂移>0.3s 校正
              };
              va.onplay = () => { if (vb.paused) { vb.currentTime = va.currentTime; vb.play(); } syncBtn(); };
              va.onpause = () => { if (!vb.paused) vb.pause(); syncBtn(); };
              va.onended = () => { vb.pause(); syncBtn(); };
              syncBtn();
            },
          });
        });
        m.querySelectorAll('[data-apply]').forEach(b => b.onclick = () => {
          const i = +b.dataset.apply;
          const v = vers[i];
          const vno = vers.length - i;
          snapshotShot(s, '回滚前状态', '版本回滚'); // 回滚自身也可再回滚:先留档当前状态
          if (v.prompt) Store.setShotPrompt(s, v.prompt);
          if (v.frame) {
            s.image = v.frame;
            s.video = { status: 'done', model: v.model || s.videoModel, frame: v.frame };
            if (v.url) s.video.url = v.url; // 历史版带视频地址则一并恢复,可继续播放
          }
          if (v.firstFrame) s.firstFrame = v.firstFrame; // 版本带首/尾帧快照则一并恢复
          if (v.lastFrame) s.lastFrame = v.lastFrame;
          syncFrames(ep, p);
          s.history = s.history || [];
          s.history.unshift({ type: '回滚至 v' + vno, model: v.model || '版本回滚', time: Store.now(), prompt: s.prompt, frame: v.frame || null, url: v.url || '', firstFrame: s.firstFrame || null, lastFrame: s.lastFrame || null });
          Store.save(); close();
          U.toast(`已应用 v${vno} 为当前版本`, 'success');
          renderShots(main, p, ep);
        });
      },
      onClose() { if (onKey) document.removeEventListener('keydown', onKey); },
    });
  }

  /* ================= 历史版本对比/应用此版 END ================= */


  /* 首尾帧占位图(带首帧/尾帧标注的变体) */
  function framePH(s, kind) {
    return PH.image({
      label: (kind === 'first' ? '首帧' : '尾帧') + ' · 镜头' + (s.order + 1),
      sub: (s.plot || '').slice(0, 16), kind: 'shot', w: 480, h: 270,
      seedText: 'frame:' + kind + ':' + s.id + ':' + (s.plot || '') + (kind === 'last' ? ':tail' : ''),
    });
  }

  /* 首/尾帧生成入口:在线走真实文生图(seedream 16:9),失败如实退费;离线回退占位图 */
  async function genShotFrame(p, ep, s, kind, main) {
    if (s.__busy) return U.toast('该分镜正在处理中', 'info');
    s.__busy = true;
    try {
      const label = kind === 'first' ? '首帧' : '尾帧';
      if (kind === 'first' ? s.firstFrame : s.lastFrame) snapshotShot(s, label + '替换前'); // 旧帧留档可回滚
      const rerender = () => { Store.save(); if (onEpPage(p, ep)) Views.episode(main, p.id, ep.id); };
      if (!(window.Media && Media.isReady())) {
        if (kind === 'first') { s.firstFrame = framePH(s, 'first'); s.__inheritPrevEp = false; }
        else { s.lastFrame = framePH(s, 'last'); syncFramesWithNote(ep, p); }
        rerender();
        U.toast(label + '已重新生成(离线占位)', 'success');
        return;
      }
      const tk = Tasks.start({ type: '文生图(' + label + ')', model: MODELS.image[0], target: `${ep.title}·镜头${s.order + 1}`, cost: COST.image, projectId: p.id, episodeId: ep.id, shotId: s.id });
      if (!U.charge(COST.image, label + '生成:镜头' + (s.order + 1))) { Tasks.fail(tk, '积分不足'); return; }
      U.toast(label + '真实模型生成中(约 1 分钟)…', 'info');
      try {
        const prompt = (s.prompt || s.plot || '镜头画面') + ',电影感,' + label + '画面';
        const r = await Media.genImage({ prompt, size: '1280x720', model: Media.realModel(MODELS.image[0]), billingAction: 'image.gen', operationId: tk.id });
        if (kind === 'first') { s.firstFrame = r.url; s.__inheritPrevEp = false; }
        else { s.lastFrame = r.url; syncFramesWithNote(ep, p); }
        Store.save();
        Tasks.done(tk, { filename: `镜头${s.order + 1}_${label}.png`, dataURL: r.url });
        U.toast(label + '已生成' + (kind === 'last' ? ',开启继承的下一镜已联动' : ''), 'success');
      } catch (e) {
        U.refund(COST.image, label + '生成失败', (e && e.__opId) || tk.id); // 十七轮:镜像关联原 operation(服务端按原账单退)
        Tasks.fail(tk, e.message);
        U.toast(label + '生成失败,积分已自动返还:' + e.message, 'error', 4000);
      }
      rerender();
    } finally {
      s.__busy = false;
    }
  }

  /* 首帧宫格海选:一次文生图出 2×2 构图变体(1 次计费顶 4 张,同批风格一致),切分后 4 选 1 回填首帧;
   * 整图 1280x720 均分 → 每格 640x360 恰为 16:9,与首帧画幅一致;选中格传服务端换 /uploads/ 路径 */
  async function genShotFramePick(p, ep, s, main) {
    if (s.__busy) return U.toast('该分镜正在处理中', 'info');
    s.__busy = true;
    try {
      const rerender = () => { Store.save(); if (onEpPage(p, ep)) Views.episode(main, p.id, ep.id); };
      let cells = [];
      if (!(window.Media && Media.isReady())) {
        cells = PH.gridCells('镜头' + (s.order + 1), 'shot', 2, Date.now() % 991);
        U.toast('海选宫格已生成(离线占位)', 'info');
      } else {
        const tk = Tasks.start({ type: '文生图(首帧海选)', model: MODELS.image[0], target: `${ep.title}·镜头${s.order + 1}`, cost: COST.image, projectId: p.id, episodeId: ep.id, shotId: s.id });
        if (!U.charge(COST.image, '首帧海选(2×2 宫格):镜头' + (s.order + 1))) { Tasks.fail(tk, '积分不足'); return; }
        U.toast('首帧海选宫格生成中(约 1 分钟)…', 'info');
        try {
          const prompt = (s.prompt || s.plot || '镜头画面') + ',2x2 宫格图,严格 2 行 2 列网格均分,每格同一镜头的不同构图方案(角度与景别变体),电影感首帧画面,网格线清晰';
          const r = await Media.genImage({ prompt, size: '1280x720', model: Media.realModel(MODELS.image[0]), billingAction: 'image.gen', operationId: tk.id });
          cells = await U.cropGridCells(r.url, 2);
          if (!cells.length) {
            // 与主体宫格同口径:原图已由上游交付,切分是本地后处理,失败不退费;原图直接回填首帧
            snapshotShot(s, '首帧替换前');
            s.firstFrame = r.url; s.__inheritPrevEp = false;
            Store.save();
            Tasks.done(tk, { filename: `镜头${s.order + 1}_首帧海选.png`, dataURL: r.url });
            U.toast('宫格切分失败(跨域等),原图已直接回填首帧;本次不退费', 'info', 4500);
            rerender();
            return;
          }
          Tasks.done(tk, { filename: `镜头${s.order + 1}_首帧海选宫格.png`, dataURL: r.url });
        } catch (e) {
          U.refund(COST.image, '首帧海选失败:镜头' + (s.order + 1), (e && e.__opId) || tk.id); // 十七轮:镜像关联原 operation
          Tasks.fail(tk, e.message);
          U.toast('首帧海选失败,积分已自动返还:' + e.message, 'error', 4000);
          return;
        }
      }
      /* 4 选 1:点选格 → 上传 → 回填首帧(覆盖前留档可回滚) */
      let picked = -1;
      U.openModal({
        title: `首帧海选 · 镜头${s.order + 1}(4 选 1)`,
        wide: true,
        body: `
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px">
          ${cells.map((c, i) => `<img src="${U.thumb(c)}" data-cell="${i}" style="width:100%;border-radius:6px;cursor:pointer;border:2px solid transparent;display:block">`).join('')}
        </div>
        <div class="hint" style="margin-top:8px">同一批生成的 4 个构图方案,风格一致;点击选定即回填首帧。</div>`,
        footer: `<button class="btn" data-x="cancel">放弃</button><button class="btn primary" data-x="ok" disabled>选定此格为首帧</button>`,
        onMount(m, close) {
          const ok = m.querySelector('[data-x=ok]');
          m.querySelectorAll('[data-cell]').forEach(im => im.onclick = () => {
            picked = +im.dataset.cell;
            m.querySelectorAll('[data-cell]').forEach(x => x.style.borderColor = 'transparent');
            im.style.borderColor = 'var(--accent)';
            ok.disabled = false;
          });
          m.querySelector('[data-x=cancel]').onclick = close;
          ok.onclick = async () => {
            if (picked < 0) return;
            ok.disabled = true; ok.innerHTML = '<span class="spinner"></span> 回填中…';
            let img = cells[picked];
            const up = await U.uploadData(`镜头${s.order + 1}_首帧海选-${picked + 1}.png`, img);
            if (up) img = up;
            snapshotShot(s, '首帧替换前');
            s.firstFrame = img; s.__inheritPrevEp = false;
            Store.save();
            close();
            U.toast(`海选方案 ${picked + 1} 已设为镜头${s.order + 1} 首帧`, 'success');
            rerender();
          };
        },
      });
    } finally {
      s.__busy = false;
    }
  }

  /* ================= 廉价改图验证 =================
   * 改提示词/换主体后,先出一张静态验证图(2~3 积分,约 1 分钟)再决定是否出视频(5~10 积分,数分钟):
   * 提示词与主体参考和视频生成同源(shotRefImages 打标 + 运镜/机位 + 美术后缀 + 负面约束),
   * 验证图写入 s.image(ref 策略下次生成直接作分镜参考;已出片镜头因 inputHash 变化如实判"素材已更新·建议重生成"),
   * 覆盖前 snapshotShot 留档可回滚。计费确定性:主体参考 ≥2 张走多图融合(服务端一律推导 image.fusion),
   * 否则纯文生图(服务端无图一律 image.gen)——均与 prompt 内容信号无关,客户端标签恒匹配 */
  async function genShotValidate(p, ep, s, main) {
    if (s.final) return U.toast('该分镜已定为终稿,请先「解锁终稿」', 'error');
    if (s.__busy) return U.toast('该分镜正在处理中', 'info');
    if (window.Compliance && !Compliance.guardText(s.prompt || '')) {
      U.toast(`镜头${s.order + 1} 提示词含敏感词已被内容安全拦截(未扣费):${Compliance.GUIDE}`, 'error', 4000);
      return;
    }
    s.__busy = true;
    try {
      const rerender = () => { Store.save(); if (onEpPage(p, ep)) Views.episode(main, p.id, ep.id); };
      const { refImages, suffix } = shotRefImages(p, s); // 与视频生成同源的主体参考(打标)
      const refs = (refImages || []).map(r => r.url).filter(u => u && !String(u).startsWith('data:')).slice(0, 5);
      const fusion = refs.length >= 2;
      const cost = fusion ? COST.fusion : COST.image;
      const base = s.prompt || s.plot || '镜头画面';
      const cam = (s.camera ? `;运镜:${s.camera}` : '') + (s.cameraSpec ? `,机位:${(window.CAMERA && CAMERA.describe(s.cameraSpec)) || ''}` : '');
      const prompt = (fusion ? suffix : '') + base + cam + SBViews.artSuffixApp(p, ep, base) + (window.negOf ? negOf(p) : '');
      const size = ({ '1:1': '1024x1024', '9:16': '720x1280' })[(ep.sbConfig || {}).ratio] || '1280x720'; // 与 role-editor 同映射
      const offline = !(window.Media && Media.isReady());
      const tk = offline ? null : Tasks.start({ type: fusion ? '多图融合(验证图)' : '文生图(验证图)', model: MODELS.image[0], target: `${ep.title}·镜头${s.order + 1}`, cost, projectId: p.id, episodeId: ep.id, shotId: s.id });
      if (!offline && !U.charge(cost, '验证图生成:镜头' + (s.order + 1))) { Tasks.fail(tk, '积分不足'); return; }
      try {
        let url;
        if (offline) { // 离线回退 PH 占位(与 framePH 同约,不冒充真实出图)
          url = PH.image({ label: '验证图 · 镜头' + (s.order + 1), sub: (s.plot || '').slice(0, 16), kind: 'shot', w: 480, h: 270, seedText: 'valimg:' + s.id + ':' + Date.now() % 997 });
        } else {
          U.toast('验证图生成中(约 1 分钟)…', 'info');
          const r = await Media.genImage({
            prompt, size, model: Media.realModel(MODELS.image[0]),
            image: fusion ? refs : undefined, // ≥2 张主体参考走多图融合;单/无主体纯文生(计费推导确定性,见函数头注释)
            billingAction: fusion ? 'image.fusion' : 'image.gen', operationId: tk.id,
          });
          url = r.url;
        }
        snapshotShot(s, '验证图生成前'); // 覆盖 s.image 前留档可回滚
        s.image = url;
        s.history = s.history || [];
        s.history.unshift({ type: '验证图', model: offline ? '离线模拟' : MODELS.image[0], time: Store.now(), prompt: s.prompt, frame: url });
        Store.save();
        if (tk) Tasks.done(tk, { filename: `镜头${s.order + 1}_验证图.png`, dataURL: url });
        U.toast('验证图已生成并设为分镜参考图,满意后点「生成视频」' + (Store.shotVideoStale(p, s) ? '(本镜已出片视频标记为素材已更新)' : '') + (offline ? '(离线占位)' : ''), 'success', 3500);
      } catch (e) {
        U.refund(cost, '验证图生成失败', (e && e.__opId) || tk.id); // 镜像关联原 operation(服务端按原账单退)
        Tasks.fail(tk, e.message);
        U.toast('验证图生成失败,积分已自动返还:' + e.message, 'error', 4000);
      }
      rerender();
    } finally {
      s.__busy = false;
    }
  }

  /* 继承联动:开继承的分镜首帧 = 上一镜尾帧;传 p 时叠加跨集尾帧继承(续写上一集末镜) */
  function syncFrames(ep, p) {
    ep.shots.forEach((s, i) => {
      if (s.inheritTail && i > 0) s.firstFrame = ep.shots[i - 1].lastFrame || null;
    });
    // 跨集继承:第一镜首帧 = 上一集末镜尾帧(第一镜未手动设置首帧时生效,__inheritPrevEp 标记自动写入值)
    if (p && ep.sbConfig && ep.sbConfig.inheritPrevEp && ep.shots.length) {
      const first = ep.shots[0];
      const tail = prevEpTail(p, ep);
      if (tail && (!first.firstFrame || first.__inheritPrevEp)) {
        first.firstFrame = tail;
        first.__inheritPrevEp = true;
      }
    }
  }
  /* 十六轮 级联提示:素材变更(重生成尾帧/视频)后调用——syncFrames 会把尾帧联动到开启继承的
   * 后续分镜首帧,其中已有成片的分镜因输入指纹变化自动判"素材已更新·建议重生成";
   * 如实提示影响面,不再静默级联(渲染链路内的 syncFrames 调用仍走静默版,避免每次重渲弹提示) */
  function syncFramesWithNote(ep, p) {
    const before = new Map();
    ep.shots.forEach((s, i) => { if (s.inheritTail && i > 0 && s.video && s.video.status === 'done') before.set(s.id, s.firstFrame || null); });
    syncFrames(ep, p);
    const hit = [];
    ep.shots.forEach(s => { if (before.has(s.id) && before.get(s.id) !== (s.firstFrame || null)) hit.push(s.order + 1); });
    if (hit.length) U.toast(`尾帧联动:镜头${hit.join('、')} 的首帧已随上一镜尾帧更新,其已生成视频标记为"素材已更新·建议重生成"`, 'info', 4500);
  }

  /* 连抽 ×N:同参数连出 N 版(逐版扣费/失败退费即停;合规承诺/敏感词/真人审核只做一次),
   * 每版覆盖前自动留档( snapshotShot ),版本卡可对比选优 */
  async function drawShotTimes(p, ep, s, main, n) {
    if (n <= 1) return createShotVideo(p, ep, s, main);
    if (s.final) return U.toast('该分镜已定为终稿,请先「解锁终稿」', 'error');
    if (window.Compliance && !(await Compliance.ensureAccepted())) return;
    if (window.Compliance && !Compliance.guardText(s.prompt || '')) {
      U.toast(`镜头${s.order + 1} 提示词含敏感词已被内容安全拦截(未扣费):${Compliance.GUIDE}`, 'error', 4000);
      return;
    }
    if (__genInflight.has(s.id)) return U.toast('该分镜正在生成中', 'info');
    const drawPer = shotVideoBilling(s).cost; // 八轮:长镜头(>10s)按 2 镜计价,连抽预估同步
    if (Store.credits() < drawPer * n) n = Math.max(1, Math.floor(Store.credits() / drawPer)); // 余额不足按可承受次数降级
    const run = async () => {
      __genInflight.add(s.id);
      let ok = 0;
      try {
        for (let i = 0; i < n; i++) {
          const histLen = (s.history || []).length;
          await createShotVideo(p, ep, s, main, true, true); // skipReviewGuard+keepInflight:守卫与在飞标记均由外层持有——内层 finally 不提前释放(此前第 1 版结束即删标记,2..N 版期间防重闸失效)
          if (s.video && s.video.status === 'done' && (s.history || []).length > histLen) ok++;
          else break; // 失败/积分不足即停
        }
      } finally { __genInflight.delete(s.id); }
      if (ok > 1) U.toast(`连抽完成:${ok}/${n} 版已入版本记录,到「版本与审片」对比选优`, 'success', 3500);
    };
    if (window.HumanReview) return HumanReview.guard(HumanReview.shotImageUrls(p, s), run);
    return run();
  }

  /* ---- 主体参考(打标)/canonical 生成请求/时长预估/轴线规则:实现已下沉 domain.js(双端单一来源,
   * CLI 经 require 复用同一构造点,CLI 生成请求与指纹和主应用逐字节一致);此处仅委托保持局部签名不变 ---- */
  /* 二十轮:轮询等待透传——onProgress 把"已等待 Xs"写到分镜卡蒙层(不动取消按钮,整卡不重渲) */
  function waitProgress(main, s) {
    const t0 = Date.now();
    return () => {
      const el = main && main.querySelector(`[data-wait="${s.id}"]`);
      if (el) el.textContent = ' · 已等待 ' + Math.round((Date.now() - t0) / 1000) + 's';
    };
  }
  function shotRefImages(p, s) {
    return Domain.shotRefImages(p, s);
  }

  /* 轴线规则系统默认(已从用户填写项下线):固定注入生成提示词;分镜数据上的 axisRule(AI 拆镜管线产出)优先 */
  const axisNoteOf = Domain.axisNoteOf;

  /* canonical 视频生成请求(六轮建立 / 七轮策略映射 / 双端单源):真实生成请求的唯一构造点。
   * Store.shotInputHash 对 Domain.buildVideoRequest 返回值做稳定序列化——生成逻辑与过期判定共用同一份字段清单。 */
  const buildVideoRequest = Domain.buildVideoRequest;
  /* frames 策略前置校验(七轮):缺真实首帧时阻止生成并明确引导——不允许拿占位 dataURL 静默退化成文生视频 */
  function framesStrategyBlocked(s) {
    return (s.genStrategy || 'ref') === 'frames' && !(s.firstFrame && !String(s.firstFrame).startsWith('data:'));
  }
  /* 逐镜视频计费(八轮):预估时长>10s 的长镜头按 2 镜计价(video.beat),与服务端"时长推导动作"一致
   * (服务端拒绝长视频提 video.gen 低价标签;口径=buildVideoRequest 的 duration=estShotDuration(s)) */
  function shotVideoBilling(s) {
    const long = estShotDuration(s) > 10;
    return { cost: long ? COST.video * 2 : COST.video, action: long ? 'video.beat' : 'video.gen' };
  }

  /* 单镜时长自动预估(不由人工填写;实现下沉 domain.js,双端同口径) */
  function estShotDuration(s, promptOverride) {
    return Domain.estShotDuration(s, promptOverride);
  }

  /* ================= 单镜视频生成 ================= */
  const __genInflight = new Set(); // 在飞生成分镜:防 guard 确认窗/生成期间重复触发导致双重扣费

  /* 断点续查:页面刷新/中断后,按 s.video.upstreamId 查询原上游任务
   * 已成功 → 直接落片(登记 0 积分"恢复"任务,不重复扣费);仍在生成 → 提示等待并阻止重复发起;
   * 已失败/查询异常 → 清除 resumable 标记,返回 false 由调用方按普通生成重走 */
  async function tryResumeShotVideo(p, ep, s, main) {
    let st;
    try { st = await Media.checkVideo(s.video.upstreamId); }
    catch (e) {
      s.video.resumable = false; Store.save();
      U.toast('恢复查询失败:' + e.message + ',本次将按普通生成重新计费', 'info', 3000);
      return false;
    }
    if (st.status === 'succeeded' && st.videoUrl) {
      const strategy = STRATEGIES.find(x => x.id === (s.genStrategy || 'ref')) || STRATEGIES[0];
      const tk = Tasks.start({ type: '文生视频(恢复)', model: (s.video.model || '上游任务') + '·断点续查', target: `${ep.title}·镜头${s.order + 1}`, cost: 0, projectId: p.id, episodeId: ep.id, shotId: s.id });
      try {
        const frame = await Media.captureFrameUp(st.videoUrl, 0.1, 'frame_' + s.id + '.jpg');
        const tail = await Media.captureFrameUp(st.videoUrl, 'end', 'tail_' + s.id + '.jpg');
        s.video = { status: 'done', model: s.video.model || '', url: st.videoUrl, frame: frame || PH.video(s.plot, s.order), assetVer: Store.shotAssetVer(p, s), inputHash: Store.shotInputHash(p, s), upstreamId: s.video.upstreamId };
        s.image = s.image || frame || PH.shot(s.plot, s.order);
        s.lastFrame = tail || frame || framePH(s, 'last');
        finishVideoDone(p, ep, s, main, tk, `${ep.title}·镜头${s.order + 1}`, strategy, 0);
        U.toast(`镜头${s.order + 1} 已恢复上次中断的生成结果(未重复扣费)`, 'success', 3500);
        return true;
      } catch (e) {
        Tasks.fail(tk, e.message);
        s.video = { status: 'failed', error: '恢复失败:' + e.message };
        Store.save();
        return false;
      }
    }
    if (st.status === 'running' || st.status === 'queued') {
      U.toast(`镜头${s.order + 1} 的上游任务仍在生成中,请稍后再点「生成」恢复结果(避免重复扣费)`, 'info', 4000);
      return true; // 阻止立刻重新发起(同输入会被服务端幂等复用,但先扣费体验差)
    }
    s.video.resumable = false; Store.save(); // 上游已失败/未知:按普通生成重走
    return false;
  }

  async function createShotVideo(p, ep, s, main, skipReviewGuard, keepInflight) {
    if (s.final) return U.toast('该分镜已定为终稿,请先「解锁终稿」', 'error');
    if (!skipReviewGuard) {
      // 合规承诺:首次生成前须同意「上传与创作合规承诺」
      if (window.Compliance && !(await Compliance.ensureAccepted())) return;
      // 内容安全前置拦截:提示词命中敏感词直接中止(不扣费)
      if (window.Compliance && !Compliance.guardText(s.prompt || '')) {
        U.toast(`镜头${s.order + 1} 提示词含敏感词已被内容安全拦截(未扣费):${Compliance.GUIDE}`, 'error', 4000);
        return;
      }
      // 仅首次进入时检查+占位;guard 递归重入(skipReviewGuard)时标记已在,跳过,结束时统一释放
      if (__genInflight.has(s.id)) return U.toast('该分镜正在生成中', 'info');
      __genInflight.add(s.id);
    }
    // 真人审核预审:被驳回的真人素材直接阻止生成,审核中需确认
    if (!skipReviewGuard && window.HumanReview) {
      let proceeded = false;
      HumanReview.guard(HumanReview.shotImageUrls(p, s), () => { proceeded = true; createShotVideo(p, ep, s, main, true); });
      if (!proceeded) {
        // guard 弹窗(驳回提示/待审核确认)未放行即被关闭时,释放在飞标记
        const root = document.getElementById('modal-root');
        const gm = root && root.lastElementChild;
        if (gm) {
          const mo = new MutationObserver(() => {
            if (proceeded || !gm.isConnected) { mo.disconnect(); if (!proceeded) __genInflight.delete(s.id); }
          });
          mo.observe(root, { childList: true });
        } else __genInflight.delete(s.id);
      }
      return;
    }
    try {
      // 断点续查:上次生成被页面刷新中断且上游任务 id 尚在 → 先查原任务;
      // 已成功直接落片(不重复扣费),仍在生成则提示等待,已失败则清除标记按普通生成重走
      if (window.Media && Media.isReady() && s.video && s.video.status === 'failed' && s.video.resumable && s.video.upstreamId) {
        const resumed = await tryResumeShotVideo(p, ep, s, main);
        if (resumed) return;
      }
      const strategy = STRATEGIES.find(st => st.id === (s.genStrategy || 'ref'));
      // frames 策略前置校验(七轮):缺真实首帧时阻止生成(在线),引导先生成首帧——不再静默退化成文生视频
      if (framesStrategyBlocked(s)) {
        if (window.Media && Media.isReady()) {
          /* 十六轮 状态可逆:预校验未过(未扣费未发起)不再把旧成片覆盖为 failed——
           * 旧视频/分镜图保持原状,仅提示引导(此前一点重抽就丢失旧成片展示,只能去版本记录翻) */
          U.toast('首尾帧策略缺真实首帧,已阻止生成:请先生成/上传首帧,或切换「分镜参考」策略', 'error', 4200);
          return;
        }
      }
      const target = `${ep.title}·镜头${s.order + 1}`;
      // 音色参考:出场角色绑定的音频随生成注入(同一角色的多形态只计一次)
      const vrefIds = new Set();
      (s.characters || []).forEach(c => { const r = Store.findSubject(p, c); if (r && r.s.refAudio) vrefIds.add(r.s.id); });
      const vrefCnt = vrefIds.size;
      // 注册主体:出场角色中已注册主体的按主体级参考优先(标注,接真实 API 时走主体机制)
      const regIds = new Set();
      (s.characters || []).forEach(c => { const r = Store.findSubject(p, c); if (r && r.s.isSubject) regIds.add(r.s.id); });
      const regCnt = regIds.size;
      const vBill = shotVideoBilling(s); // 八轮:长镜头(>10s)按 video.beat 2 镜计价,与前端确认弹窗口径一致
      const tk = Tasks.start({ type: '文生视频', model: (s.videoModel || ep.sbConfig.batchVideoModel) + '·' + strategy.name + (vrefCnt ? `·音色参考×${vrefCnt}` : '') + (regCnt ? `·主体×${regCnt}` : ''), target, cost: vBill.cost, projectId: p.id, episodeId: ep.id, shotId: s.id });
      if (!U.charge(vBill.cost, `分镜视频生成(${s.videoModel || ep.sbConfig.batchVideoModel}·${strategy.name}${vBill.cost > COST.video ? '·长镜头×2' : ''})`)) { Tasks.fail(tk, '积分不足'); return; }
      if (s.genStrategy === 'frames') {
        syncFrames(ep, p);
        if (!s.firstFrame) { s.firstFrame = framePH(s, 'first'); }
      }
      snapshotShot(s, '重新生成前'); // 覆盖旧 video/image 前留档(已成功生成并入档的版本去重跳过)
      s.video = { status: 'generating', model: s.videoModel || ep.sbConfig.batchVideoModel };
      Store.save(); renderShots(main, p, ep);
      // 在线走火山引擎真实文生视频(数分钟,直接 await),失败如实退费;离线回退 PH 占位
      if (window.Media && Media.isReady()) {
        try {
          // canonical 请求构造:prompt 含主体定义/轴线/运镜/机位/美术后缀/负面约束;计费 billingAction+operationId(任务 id)
          const req = buildVideoRequest(p, ep, s);
          const r = await Media.genVideo(Object.assign({}, req, {
            model: Media.realModel(req.model),
            job: { projectId: p.id, episodeId: ep.id, shotId: s.id }, // 服务端任务中心:同镜同输入幂等复用
            onCreated: id => { if (s.video && s.video.status === 'generating') { s.video.upstreamId = id; Store.save(); } }, // 落 upstreamId,刷新后可断点续查
            onProgress: waitProgress(main, s), // 二十轮:等待时长透传到分镜卡蒙层
            billingAction: vBill.action,
            operationId: tk.id,
          }));
          const frame = await Media.captureFrameUp(r.videoUrl, 0.1, 'frame_' + s.id + '.jpg'); // 截帧即传服务端,state 只存短路径
          const tail = await Media.captureFrameUp(r.videoUrl, 'end', 'tail_' + s.id + '.jpg');
          s.video = { status: 'done', model: s.video.model, url: r.videoUrl, frame: frame || PH.video(s.plot, s.order), assetVer: Store.shotAssetVer(p, s), inputHash: Store.shotInputHash(p, s), upstreamId: s.video.upstreamId }; // assetVer/inputHash:生成时输入指纹,之后提示词/台词/素材变更则提示"素材已更新·建议重生成"
          s.image = s.image || frame || PH.shot(s.plot, s.order);
          s.lastFrame = tail || frame || framePH(s, 'last'); // 尾帧取自真实视频结尾,供下一镜继承
          finishVideoDone(p, ep, s, main, tk, target, strategy, vrefCnt);
          return;
        } catch (e) {
          s.video = { status: 'failed', error: e.message, model: s.video.model, upstreamId: s.video.upstreamId, resumable: !!s.video.upstreamId }; // 保留 upstreamId:轮询超时类失败可再点生成走断点续查
          if (e.__pending) {
            // 九轮:10 分钟超时——任务仍在后台生成,不退本地镜像(服务端 30 分钟标 stale/60 分钟兜底退款;重试同 opId 幂等续查)
            U.toast(e.message, 'info', 5000);
            Tasks.background(tk, '上游仍在生成,稍后重试可免费续查'); // 十轮:后台态计入删除拦截
          } else {
            U.refund(vBill.cost, '分镜视频生成失败', (e && e.__opId) || tk.id); // 镜像关联原 operation,服务端按账本退(幂等防双退)
            U.toast('视频生成失败,积分已自动返还:' + e.message, 'error', 4000);
            Tasks.fail(tk, e.message);
          }
          Store.save();
          if (onEpPage(p, ep)) renderShots(main, p, ep);
          return;
        }
      }
      // 离线模式:占位视频帧(simulated 标记:在线后不计入"生成完成",避免模拟产物冒充真实出片)
      await new Promise(res => U.runTask({
        title: strategy.name + ' 生成中(离线模拟)', cancellable: false,
        steps: [{ label: strategy.step, ms: 1600 + Math.random() * 800 }],
        onDone: res,
      }));
      s.video = { status: 'done', simulated: true, model: s.video.model, frame: PH.video(s.plot, s.order), assetVer: Store.shotAssetVer(p, s), inputHash: Store.shotInputHash(p, s) }; // assetVer/inputHash:素材版本戳,语义同真实路径
      s.image = s.image || PH.shot(s.plot, s.order);
      s.lastFrame = framePH(s, 'last'); // 尾帧写入,供下一镜继承
      finishVideoDone(p, ep, s, main, tk, target, strategy, vrefCnt);
    } finally {
      if (!keepInflight) __genInflight.delete(s.id); // keepInflight(连抽外层持有):内层不提前释放在飞标记
    }
  }

  /* 视频生成完成后的公共收尾:首尾帧联动/历史/同步语音/任务登记/重渲 */
  function finishVideoDone(p, ep, s, main, tk, target, strategy, vrefCnt) {
    syncFramesWithNote(ep, p); // 十六轮:尾帧取自新视频,级联影响继承镜时如实提示
    s.history = s.history || [];
    s.history.unshift({ type: '视频', model: s.video.model, time: Store.now(), strategy: s.genStrategy || 'ref', prompt: s.prompt, frame: s.video.frame, url: s.video.url || '', voiceRef: vrefCnt, firstFrame: s.firstFrame || null, lastFrame: s.lastFrame || null });
    if (ep.sbConfig.syncVoice && !s.audio) syncVoiceShot(p, ep, s, main); // 在线真实 TTS(异步),离线打标记
    ep.composed = false; // 重新生成后需重新合成
    Store.save();
    Tasks.done(tk, { filename: `${target}_视频帧.png`, dataURL: s.video.frame });
    U.toast(`分镜视频生成完成(${strategy.name}策略${ep.sbConfig.syncVoice ? ',已同步语音' : ''})`, 'success');
    if (onEpPage(p, ep)) renderShots(main, p, ep); else Store.save();
  }

  /* 同步语音(生成视频后自动配音):在线走真实 TTS(后台异步,不阻塞视频流程);离线仅打标记 */
  function syncVoiceShot(p, ep, s, main) {
    if (window.Media && Media.isReady()) {
      ttsShot(p, ep, s).then(() => {
        Store.save();
        if (onEpPage(p, ep)) renderShots(main, p, ep);
        U.toast(`镜头${s.order + 1} 配音完成`, 'success');
      }).catch(e => U.toast(`镜头${s.order + 1} 配音失败:` + e.message, 'error', 3500));
    } else {
      s.audio = true;
      s.history = s.history || [];
      s.history.unshift({ type: '音频', model: MODELS.tts[0], time: Store.now() });
    }
  }

  /* 批量/镜头组共用的逐镜生成实现:逐条扣费(余额不足仅该镜失败)、音色参考统计、
   * 同步语音、生成后重置合成态。opts: {groupName, prefix} — 有 prefix 时注入组级
   * 一致性前缀(不污染原 prompt,仅记录到历史),history 的 model 标注组名。 */
  async function batchGenVideos(p, ep, main, shots, opts, done) {
    opts = opts || {};
    // 镜头确认闸:待生成镜头须全部 confirm=true 才放行(统一拦在本函数入口,覆盖工作区/项目页/镜头组/一键成片等所有调用方)
    if (!opts.skipConfirmGate) {
      const unconfirmed = shots.filter(s => !s.confirm);
      if (unconfirmed.length) { openConfirmGateModal(p, ep, main, shots, unconfirmed, opts, done); return; }
    }
    const gn = opts.groupName;
    // 合规承诺:首次生成前须同意「上传与创作合规承诺」(命令层 headless 调用传 skipCompliance 跳过交互弹窗)
    if (!opts.skipCompliance && window.Compliance && !(await Compliance.ensureAccepted())) { done && done(); return; }
    // 九轮:逐镜按预估时长登记成本(长镜头>10s 按 2 镜计价)——与实际扣费一致,
    // 任务监控/"今日消耗"不再按单镜价少记一半(八轮前统一 COST.video)
    const tks = shots.map(s => Tasks.start({ type: '文生视频', model: (s.videoModel || ep.sbConfig.batchVideoModel) + (gn ? '·镜头组' : '·' + (({ fusion: '多图融合', frames: '首尾帧', ref: '分镜参考' })[s.genStrategy || 'ref'])), target: gn ? `${ep.title}·${gn}·镜头${s.order + 1}` : `${ep.title}·镜头${s.order + 1}`, cost: shotVideoBilling(s).cost, projectId: p.id, episodeId: ep.id, shotId: s.id }));
    const useReal = window.Media && Media.isReady(); // 已登录后端:走火山引擎真实文生视频(逐镜数分钟)
    // 后台任务侧边栏:逐镜状态可视、可最小化、✕ 中止;页面全程可操作
    const dock = useReal ? U.bgDock({ title: `🎬 ${gn ? '镜头组「' + gn + '」' : ep.title} · 批量生成视频(${shots.length} 镜)` }) : null;
    const upd = (i, html) => { const el = dock && dock.m.querySelector(`[data-bd="${i}"]`); if (el) el.innerHTML = html; };
    if (dock) {
      shots.forEach((s, i) => dock.say(`<span data-bd="${i}">⏳ 镜头${s.order + 1} 等待中</span>`));
      if (window.Bus) Bus.emit('shots.batchStart', { p, ep, main, total: shots.length, group: gn || undefined, brief: `${gn ? '镜头组「' + gn + '」' : '整集'}开始批量生成 ${shots.length} 镜` }); // 事件总线:Agent 对话流订阅转译
    } else {
      await new Promise(res => U.runTask({
        title: gn ? `镜头组「${gn}」生成中` : '批量生成视频中', cancellable: false,
        steps: shots.slice(0, 6).map(s => ({ label: '镜头 ' + (s.order + 1), ms: 900 })),
        onDone: res,
      }));
    }
    let okCnt = 0, failCnt = 0, noFunds = false, blockedCnt = 0;
    const failed = []; // 失败镜头清单 {s, err}:批量结束后汇总弹窗可单独/全部重试
    for (let i = 0; i < shots.length; i++) {
      const s = shots[i];
      if (dock && dock.cancelled) { Tasks.fail(tks[i], '用户取消'); failCnt++; failed.push({ s, err: '用户取消' }); upd(i, `✕ 镜头${s.order + 1} 已取消(未扣费)`); continue; }
      // 内容安全前置拦截:提示词命中敏感词直接失败该镜(不扣费;十六轮:不再覆盖旧成片为 failed,保持原状)
      if (window.Compliance) {
        const hits = Compliance.checkText(s.prompt || '').hits;
        if (hits.length) {
          Tasks.fail(tks[i], '内容安全拦截:含敏感词(' + hits.map(h => h.word).join('、') + ')');
          failCnt++; blockedCnt++;
          failed.push({ s, err: '内容安全拦截:含敏感词(' + hits.map(h => h.word).join('、') + ')' });
          upd(i, `✕ 镜头${s.order + 1} 内容安全拦截(未扣费)`);
          Store.save();
          continue;
        }
      }
      const vBill = shotVideoBilling(s); // 八轮:长镜头(>10s)按 video.beat 2 镜计价(与服务端时长推导一致)
      if (noFunds || !U.charge(vBill.cost, `分镜视频生成(${gn ? gn : ep.title}·镜头${s.order + 1}${vBill.cost > COST.video ? '·长镜头×2' : ''})`)) {
        Tasks.fail(tks[i], '积分不足'); failCnt++; noFunds = true; failed.push({ s, err: '积分不足' }); upd(i, `✕ 镜头${s.order + 1} 积分不足`); continue;
      }
      // frames 策略前置校验(七轮):缺真实首帧阻止生成(不扣费即退),引导先生成首帧
      if (useReal && framesStrategyBlocked(s)) {
        U.refund(vBill.cost, `镜头${s.order + 1} 缺真实首帧退费`);
        Tasks.fail(tks[i], '首尾帧策略缺真实首帧(请先生成首帧或切换策略)');
        failCnt++; failed.push({ s, err: '首尾帧策略缺真实首帧' });
        upd(i, `✕ 镜头${s.order + 1} 缺真实首帧(已退费)`);
        continue;
      }
      // 音色参考:出场角色绑定的音频随生成注入(按主体 id 去重)
      const vrefIds = new Set();
      (s.characters || []).forEach(c => { const r = Store.findSubject(p, c); if (r && r.s.refAudio) vrefIds.add(r.s.id); });
      const effPrompt = (opts.prefix ? opts.prefix + ' ' : '') + (s.prompt || '');
      snapshotShot(s, '重新生成前'); // 覆盖旧 video/image 前留档(已入档版本去重跳过)
      if (useReal) {
        s.video = { status: 'generating', model: s.videoModel || ep.sbConfig.batchVideoModel };
        upd(i, `🎬 镜头${s.order + 1} 生成中…`);
        if (onEpPage(p, ep)) renderShots(main, p, ep);
        try {
          // canonical 请求构造(promptOverride=镜头组前缀注入后的实际发送口径);计费逐镜独立(任务 id)
          const req = buildVideoRequest(p, ep, s, { promptOverride: effPrompt || s.plot });
          const t0 = Date.now(); // 二十轮:等待时长透传 dock 行(数分钟等待不再只有 spinner)
          const r = await Media.genVideo(Object.assign({}, req, {
            model: Media.realModel(req.model),
            job: { projectId: p.id, episodeId: ep.id, shotId: s.id }, // 服务端任务中心:同镜同输入幂等复用
            onCreated: id => { if (s.video && s.video.status === 'generating') { s.video.upstreamId = id; Store.save(); } },
            onProgress: () => upd(i, `🎬 镜头${s.order + 1} 生成中…已等待 ${Math.round((Date.now() - t0) / 1000)}s`),
            billingAction: vBill.action,
            operationId: tks[i].id,
          }));
          const frame = await Media.captureFrameUp(r.videoUrl, 0.1, 'frame_' + s.id + '.jpg'); // 截帧即传服务端,state 只存短路径
          const tail = await Media.captureFrameUp(r.videoUrl, 'end', 'tail_' + s.id + '.jpg');
          s.video = { status: 'done', model: s.video.model, url: r.videoUrl, frame: frame || PH.video(s.plot, s.order), assetVer: Store.shotAssetVer(p, s), inputHash: Store.shotInputHash(p, s), upstreamId: s.video.upstreamId }; // assetVer/inputHash:生成时输入指纹
          s.image = s.image || frame || PH.shot(s.plot, s.order);
          s.lastFrame = tail || frame || framePH(s, 'last');
          s.history = s.history || [];
          s.history.unshift({ type: '视频', model: s.video.model + (gn ? '·' + gn : ''), time: Store.now(), strategy: s.genStrategy || 'ref', prompt: effPrompt, frame: s.video.frame, url: s.video.url || '', voiceRef: vrefIds.size, firstFrame: s.firstFrame || null, lastFrame: s.lastFrame || null });
          if (ep.sbConfig.syncVoice && !s.audio) syncVoiceShot(p, ep, s, main);
          Tasks.done(tks[i], { filename: `${gn || ep.title}_镜头${s.order + 1}_视频帧.png`, dataURL: s.video.frame });
          okCnt++;
          upd(i, `<span style="color:var(--green)">✓ 镜头${s.order + 1} 完成</span>`);
        } catch (e) {
          // 真实模式失败:该镜如实失败;保留 upstreamId 供断点续查。九轮:超时(__pending)不退费
          s.video = { status: 'failed', error: e.message, model: s.video.model, upstreamId: s.video.upstreamId, resumable: !!s.video.upstreamId };
          if (e.__pending) {
            upd(i, `<span style="color:var(--yellow)">⏳ 镜头${s.order + 1} 超时仍在后台生成,可稍后重试续查(未重复扣费)</span>`);
            Tasks.background(tks[i], '上游仍在生成,稍后重试可免费续查'); // 十轮:后台态计入删除拦截
          } else {
            U.refund(vBill.cost, `镜头${s.order + 1} 视频生成失败`, (e && e.__opId) || tks[i].id); // 镜像关联原 operation
            upd(i, `<span style="color:var(--red)">✕ 镜头${s.order + 1} 失败(已退费)</span> <span class="small muted">${U.esc(Media.friendlyError(e).msg.slice(0, 50))}</span>`);
            U.toast(`镜头${s.order + 1} 生成失败,积分已返还:` + e.message, 'error', 4000);
            Tasks.fail(tks[i], e.message);
          }
          failCnt++;
          failed.push({ s, err: e.message });
        }
        Store.save();
        if (onEpPage(p, ep)) renderShots(main, p, ep);
        continue;
      }
      // 离线模式:占位视频帧(simulated 标记:在线后不计入"生成完成",避免模拟产物冒充真实出片)
      s.video = { status: 'done', simulated: true, model: s.videoModel || ep.sbConfig.batchVideoModel, frame: PH.video(s.plot, s.order), assetVer: Store.shotAssetVer(p, s), inputHash: Store.shotInputHash(p, s) }; // assetVer/inputHash:素材版本戳
      s.image = s.image || PH.shot(s.plot, s.order);
      s.lastFrame = framePH(s, 'last');
      s.history = s.history || [];
      s.history.unshift({ type: '视频', model: s.video.model + (gn ? '·' + gn : ''), time: Store.now(), strategy: s.genStrategy || 'ref', prompt: effPrompt, frame: s.video.frame, voiceRef: vrefIds.size, firstFrame: s.firstFrame || null, lastFrame: s.lastFrame || null });
      if (ep.sbConfig.syncVoice && !s.audio) {
        s.audio = true;
        s.history.unshift({ type: '音频', model: MODELS.tts[0], time: Store.now() });
      }
      Tasks.done(tks[i], { filename: `${gn || ep.title}_镜头${s.order + 1}_视频帧.png`, dataURL: s.video.frame });
      okCnt++;
    }
    if (blockedCnt) U.toast(`有 ${blockedCnt} 镜因提示词含敏感词被内容安全拦截(未扣费):${Compliance.GUIDE}`, 'error', 4500);
    syncFramesWithNote(ep, p); // 十六轮:批量出新尾帧后,级联影响继承镜时如实提示
    ep.composed = false; // 重新生成后需重新合成
    Store.save();
    const summary = gn
      ? `镜头组「${gn}」生成完成:${okCnt}/${shots.length} 成功${failCnt ? `,${failCnt} 项失败(未扣费),可单独或全部重试` : ''}(已注入一致性前缀)`
      : `批量生成完成:${okCnt}/${shots.length} 成功${failCnt ? `,${failCnt} 项失败(未扣费),可单独或全部重试` : ''}`;
    U.toast(summary, failCnt ? 'info' : 'success', gn ? undefined : 3000);
    if (dock) dock.finish(`<b style="color:${failCnt ? 'var(--yellow)' : 'var(--green)'}">${summary}</b>`);
    if (window.Bus) Bus.emit('shots.batchDone', { p, ep, main, ok: okCnt, fail: failCnt, total: shots.length, group: gn || undefined, brief: `批量生成完成:${okCnt}/${shots.length} 成功${failCnt ? ',' + failCnt + ' 失败' : ''}` }); // 事件总线:整集推事件续谈卡,镜头组走轻提示(Agent 侧转译,原 pushEvent/notify 语义不变)
    // 失败结果汇总弹窗:逐镜诊断+单独重试/全部重试;可关闭,不阻断(命令层 quiet 调用跳过弹窗,失败清单走结构化返回)
    if (failed.length && !opts.quiet) openBatchRetryModal(p, ep, main, shots.length, failed);
    if (onEpPage(p, ep)) renderShots(main, p, ep); else Store.save();
    // 智能审片闭环:开启时生成后自动评审+不达标重生成
    if (!opts.skipSmartReview && ep.sbConfig && ep.sbConfig.smartReview && window.Review && okCnt) {
      await autoSmartReview(p, ep, main, shots);
    }
    done && done();
  }

  /* 批量生成失败结果汇总弹窗:{成功}/{总数} + 失败镜头逐镜诊断与「重试」+ 底部「全部重试」。
   * 弹窗可关闭不阻断;单项重试走单镜生成 createShotVideo(扣费/失败退费/真人审核 guard 语义与现状一致),
   * 全部重试对剩余失败镜跑 batchGenVideos(与「批量操作→生成视频」相同的 HumanReview.guard 预审)。 */
  function openBatchRetryModal(p, ep, main, total, failed) {
    const okCnt = total - failed.length;
    const errOf = err => (window.Media ? Media.friendlyError(err).msg : String(err)).slice(0, 80); // 一句话错误摘要
    // 二十轮:积分不足镜未扣费无费可退,汇总文案按实区分(此前统一写"已自动退费"误导)
    const noFundsCnt = failed.filter(f => f.err === '积分不足').length;
    const failHint = noFundsCnt === failed.length ? '积分不足未扣费,充值后可重试'
      : noFundsCnt ? '生成失败镜已退费,积分不足镜未扣费,可单独或全部重试'
      : '失败镜已自动退费,可单独或全部重试';
    U.openModal({
      title: '批量生成结果',
      body: `
      <div style="margin-bottom:12px"><b style="color:var(--green)">${okCnt}/${total} 成功</b><span class="muted">,</span> <b style="color:var(--red)">${failed.length} 项失败</b><span class="hint" style="display:inline;margin:0 0 0 8px">${failHint}</span></div>
      ${failed.map((f, i) => `
      <div class="row" style="gap:10px;align-items:center;padding:8px 10px;border:1px solid var(--border2);border-radius:10px;margin-bottom:8px" data-frow="${i}">
        <span class="tag cyan" style="flex:none">镜头 ${f.s.order + 1}</span>
        <span class="small grow" style="line-height:1.5;word-break:break-all" data-fmsg>${U.esc(errOf(f.err))}</span>
        <button class="btn sm primary" data-fre="${i}" style="flex:none">↻ 重试</button>
      </div>`).join('')}`,
      footer: `<button class="btn" data-x="close">关闭</button><button class="btn primary" data-x="reall">↻ 全部重试(剩余 ${failed.length} 镜)</button>`,
      onMount(m, close) {
        m.querySelector('[data-x=close]').onclick = close;
        const alive = () => failed.filter(f => !(f.s.video && f.s.video.status === 'done')); // 剩余未成功的失败镜
        const updFoot = () => { const b = m.querySelector('[data-x=reall]'); const n = alive().length; b.textContent = `↻ 全部重试(剩余 ${n} 镜)`; b.disabled = !n; };
        m.querySelectorAll('[data-fre]').forEach(b => b.onclick = async () => {
          const f = failed[+b.dataset.fre];
          const row = m.querySelector(`[data-frow="${b.dataset.fre}"]`);
          b.disabled = true; b.textContent = '生成中…';
          await createShotVideo(p, ep, f.s, main); // 单镜重试:内部含扣费/失败退费/真人审核 guard
          if (f.s.video && f.s.video.status === 'done') {
            row.style.borderColor = 'var(--green)'; // 该行标记成功
            row.querySelector('[data-fmsg]').innerHTML = '<b style="color:var(--green)">✓ 重试成功</b>';
            b.remove();
          } else {
            b.disabled = false; b.textContent = '↻ 重试';
            row.querySelector('[data-fmsg]').textContent = errOf((f.s.video && f.s.video.error) || f.err);
          }
          updFoot();
        });
        m.querySelector('[data-x=reall]').onclick = () => {
          const rest = alive().map(f => f.s);
          if (!rest.length) { close(); return U.toast('失败镜头已全部重试成功', 'success'); }
          close();
          if (window.HumanReview) {
            const urls = [...new Set(rest.flatMap(s => HumanReview.shotImageUrls(p, s)))];
            return HumanReview.guard(urls, () => batchGenVideos(p, ep, main, rest));
          }
          batchGenVideos(p, ep, main, rest);
        };
      },
    });
  }

  window.SBGen = { shotVersions, openVersions, framePH, genShotFrame, genShotFramePick, genShotValidate, syncFrames, shotRefImages, axisNoteOf, estShotDuration, shotVideoBilling, createShotVideo, finishVideoDone, syncVoiceShot, batchGenVideos, openBatchRetryModal, drawShotTimes, isInflight: id => __genInflight.has(id) };
  /* 拆分前 window.SB 的成员继续透出(sb-io.js/produce.js/timeline.js/beatboard.js 等 SB.xxx 调用点不变) */
  Object.assign(window.SB, { syncFrames, framePH, batchGenVideos, shotVersions, estShotDuration, buildVideoRequest });
})();
