/* ============ sb-batch.js 批量操作 + 失败任务重试(自 storyboard.js 拆分) ============
 * runBatchOp(批量生成视频/音频/合成音视频/全删)/ openConfirmGateModal(镜头确认闸)/ jumpToShot /
 * window.__retryShotTask(任务监控页 ↻ 重试入口)。
 * 加载顺序:storyboard.js 之后、sb-gen.js 之前(openConfirmGateModal 挂回 window.SB 供其解构)。 */
(function () {
  const { renderShots, onEpPage, ttsShot } = window.SB;

  /* ================= 失败任务重试入口(任务监控页 ↻ 调用) ================= */
  window.__retryShotTask = function (t) {
    if (!t || !t.projectId || !t.episodeId || !t.shotId) return false;
    const p = Store.getProject(t.projectId);
    const ep = p && (p.episodes || []).find(e => e.id === t.episodeId);
    const s = ep && (ep.shots || []).find(x => x.id === t.shotId);
    if (!p || !ep || !s) return false;
    if (t.type !== '文生视频' && t.type !== '生成音频') return false;
    const run = () => {
      const main = document.getElementById('main');
      if (!main) return;
      if (t.type === '文生视频') SBGen.createShotVideo(p, ep, s, main);
      else SB.genAudio(p, ep, s, main);
    };
    const targetHash = `#/project/${p.id}/episode/${ep.id}`;
    if (location.hash === targetHash) run();
    else { location.hash = targetHash; setTimeout(run, 400); }
    return true;
  };

  /* ================= 批量操作(下拉直执,对齐 批量操作.png) ================= */
  /* 定位到指定镜头(确认闸/失败阻塞「去处理」跳转共用):在分镜工作区则重渲选中,否则跳路由 */
  function jumpToShot(p, ep, main, s) {
    ep.uiSel = s.id;
    Store.state.settings = Store.state.settings || {};
    Store.state.settings.epViewMode = 'shots'; // 定位分镜一律落到分镜视频视图(确认角标/生成控件只在该视图)
    Store.save();
    if (main && onEpPage(p, ep)) Views.episode(main, p.id, ep.id);
    else location.hash = '#/project/' + p.id + '/episode/' + ep.id;
  }

  /* 镜头确认闸弹窗(批量出片前强制逐镜过目):列出未确认镜头(镜号+剧情摘要),
   * 明确出路:去逐镜确认(定位第一个未确认镜)/ 全部确认并继续 / 仅生成已确认镜头(有才显示)/ 取消 */
  function openConfirmGateModal(p, ep, main, shots, unconfirmed, opts, done) {
    const confirmed = shots.filter(s => s.confirm);
    const go = list => SBGen.batchGenVideos(p, ep, main, list, Object.assign({}, opts, { skipConfirmGate: true }), done);
    U.openModal({
      title: '镜头确认闸',
      body: `
      <div style="margin-bottom:10px;line-height:1.8">共 <b style="color:var(--yellow)">${unconfirmed.length}</b> 个镜头待确认。批量出片前请逐镜过目剧情与提示词(先确认再放量,避免批量返工)。</div>
      <div style="max-height:40vh;overflow-y:auto">
        ${unconfirmed.map(s => `
        <div class="row" style="gap:10px;align-items:center;padding:7px 10px;border:1px solid var(--border2);border-radius:10px;margin-bottom:6px">
          <span class="tag cyan" style="flex:none">镜头 ${s.order + 1}</span>
          <span class="small grow" style="line-height:1.5">${U.esc((s.plot || '(未填写剧情)').slice(0, 60))}</span>
          <span class="tag" style="flex:none">待确认</span>
        </div>`).join('')}
      </div>`,
      footer: `<button class="btn" data-x="cancel">取消</button>${confirmed.length ? `<button class="btn" data-x="only">仅生成已确认镜头(${confirmed.length})</button>` : ''}<button class="btn" data-x="all">全部确认并继续</button><button class="btn primary" data-x="go">去逐镜确认</button>`,
      onMount(m, close) {
        m.querySelector('[data-x=cancel]').onclick = () => { close(); done && done(); };
        const only = m.querySelector('[data-x=only]');
        if (only) only.onclick = () => { close(); go(confirmed); };
        m.querySelector('[data-x=all]').onclick = () => {
          unconfirmed.forEach(s => s.confirm = true);
          Store.save();
          close();
          go(shots);
        };
        m.querySelector('[data-x=go]').onclick = () => {
          close();
          done && done();
          jumpToShot(p, ep, main, unconfirmed[0]);
          U.toast('请逐镜过目并点「✓ 确认本镜」,确认后再发起批量生成', 'info', 3500);
        };
      },
    });
  }


  async function runBatchOp(p, ep, main, op) {
    if (!ep.shots.length) return U.toast('暂无分镜', 'error');
    if (op === 'video') {
      const pend = ep.shots.filter(s => !s.final && (!s.video || !Store.shotVideoReady(s)));
      if (!pend.length) return U.toast('所有分镜视频均已生成', 'info');
      // 真人审核预审:批量生成同样校验引用素材
      if (window.HumanReview) {
        const urls = [...new Set(pend.flatMap(s => HumanReview.shotImageUrls(p, s)))];
        return HumanReview.guard(urls, () => runBatchOp(p, ep, main, 'video:noguard'));
      }
      return runBatchOp(p, ep, main, 'video:noguard'); // 无审核模块时直接继续
    }
    if (op === 'video:noguard') {
      const pend = ep.shots.filter(s => !s.final && (!s.video || !Store.shotVideoReady(s)));
      if (!pend.length) return U.toast('所有分镜视频均已生成', 'info');
      const per = COST.video;
      // 逐条扣减:每镜单独扣费,余额不足时仅该镜失败
      const run = shots => SBGen.batchGenVideos(p, ep, main, shots);
      if (pend.length <= 3) { await run(pend); return; }
      // >3 镜:断点校准(先校准 3 张再放量)
      U.openModal({
        title: '批量生成视频',
        body: `<p style="line-height:2">将为 <b>${pend.length}</b> 个未出片分镜生成视频(每镜 <b style="color:var(--yellow)">${per}</b> 积分)。<br>· <b>逐条扣减</b>:每镜单独扣费,余额不足时仅该镜失败<br>· 单镜失败自动返还该镜积分<br>· 建议先校准前 3 镜,确认效果后再放量,避免批量返工</p>`,
        footer: `<button class="btn" data-x="cancel">取消</button><button class="btn" data-x="all">直接全部生成</button><button class="btn primary" data-x="first3">先校准前 3 镜(-${3 * per}积分)</button>`,
        onMount(m, close) {
          m.querySelector('[data-x=cancel]').onclick = close;
          m.querySelector('[data-x=all]').onclick = async () => { close(); await run(pend); };
          m.querySelector('[data-x=first3]').onclick = async () => {
            close();
            await run(pend.slice(0, 3));
            const rest = pend.slice(3).filter(s => !s.video || !Store.shotVideoReady(s));
            if (!rest.length) return;
            U.openModal({
              title: '校准完成',
              body: `<p style="line-height:2">前 3 镜已生成,可回工作区查看效果。<br>继续生成剩余 <b>${rest.length}</b> 镜(约 <b style="color:var(--yellow)">${rest.length * per}</b> 积分,逐条扣减)?</p>`,
              footer: `<button class="btn" data-x="no">先不生成</button><button class="btn primary" data-x="yes">继续生成剩余 ${rest.length} 镜</button>`,
              onMount(m2, close2) {
                m2.querySelector('[data-x=no]').onclick = close2;
                m2.querySelector('[data-x=yes]').onclick = async () => { close2(); await run(rest); };
              },
            });
          };
        },
      });
      return;
    } else if (op === 'audio') {
      const pend = ep.shots.filter(s => !s.audio);
      if (!pend.length) return U.toast('所有分镜均已有音频', 'info');
      // 逐条扣费统一走 Tasks.runBatch:每镜单独 登记→扣费→合成→失败/取消退该镜费用,
      // 余额不足仅该镜失败;取消时剩余镜不再扣费(替代原"整批预扣+手写逐镜退费")
      const optsOf = s => ({ type: '生成音频', model: MODELS.tts[0] + '·' + Voice.label(Voice.norm(p.narration || s.voice || ep.sbConfig.narratorVoice)), target: `${ep.title}·镜头${s.order + 1}`, cost: COST.audio, actionName: '生成音频', projectId: p.id, episodeId: ep.id, shotId: s.id });
      if (window.Media && Media.isReady()) {
        // 在线:豆包语音真实 TTS,逐镜合成;后台侧边栏逐镜状态
        const dock = U.bgDock({ title: `🔊 ${ep.title} · 批量配音(${pend.length} 镜)` });
        pend.forEach((s, i) => dock.say(`<span data-bd="${i}">⏳ 镜头${s.order + 1} 等待中</span>`));
        const upd = (i, html) => { const el = dock.m.querySelector(`[data-bd="${i}"]`); if (el) el.innerHTML = html; };
        const r = await Tasks.runBatch(optsOf, pend, async (s, tk) => {
          if (dock.cancelled) { const e = new Error('用户取消'); e.stopBatch = true; throw e; }
          upd(pend.indexOf(s), `🔊 镜头${s.order + 1} 合成中…`);
          await ttsShot(p, ep, s, tk.id);
          return { filename: `镜头${s.order + 1}_配音.mp3`, dataURL: s.audioUrl };
        }, (s, ok, outOrErr, tk, i) => {
          const msg = (outOrErr && outOrErr.message) || '';
          if (ok) upd(i, `<span style="color:var(--green)">✓ 镜头${s.order + 1} 完成</span>`);
          else if (msg === '已取消') upd(i, `✕ 镜头${s.order + 1} 已取消(未扣费)`);
          else if (msg === '积分不足') upd(i, `<span style="color:var(--red)">✕ 镜头${s.order + 1} 积分不足</span>`);
          else {
            upd(i, `<span style="color:var(--red)">✕ 镜头${s.order + 1} 失败(已退费)</span>`);
            U.toast(`镜头${s.order + 1} 配音失败,已退费:` + msg, 'error', 3500);
          }
          Store.save();
        });
        const summary = `批量音频生成完成:成功 ${r.ok} 镜${r.fail ? `,失败 ${r.fail} 镜(已退费)` : ''}${r.cancelled ? `,取消 ${r.cancelled} 镜(未扣费)` : ''}`;
        dock.finish(`<b>${summary}</b>`);
        U.toast(summary, (r.fail || r.cancelled) ? 'info' : 'success', 3500);
        renderShots(main, p, ep);
        return;
      }
      // 离线模式:同一生命周期逐条登记扣费(占位音频无失败路径)
      await U.delay(800);
      await Tasks.runBatch(optsOf, pend, async (s) => {
        s.audio = true;
        s.history = s.history || [];
        s.history.unshift({ type: '音频', model: MODELS.tts[0] + '(离线模拟)', time: Store.now() });
        Store.save();
      });
      Store.save(); U.toast('批量音频生成完成(离线模拟)', 'success');
    } else if (op === 'merge') {
      const ok = ep.shots.filter(s => s.video && Store.shotVideoReady(s) && s.audio);
      if (!ok.length) return U.toast('没有同时具备视频和音频的分镜', 'error');
      const tk = Tasks.start({ type: '合成音视频', model: '本地合成', target: ep.title, projectId: p.id, episodeId: ep.id });
      // 在线:FFmpeg 真实混流(需分镜同时有服务端视频与真实配音);后台侧边栏逐镜状态
      // 2026-08 六轮:FFmpeg 纳入服务端白名单计费(ff.merge=1/镜),本地同步逐镜扣费保持视图一致
      const mergeable = ok.filter(s => s.video.url && s.audioUrl);
      if (window.Media && Media.isReady() && mergeable.length) {
        const dock = U.bgDock({ title: `🎬🔊 ${ep.title} · 批量合成音视频(${mergeable.length} 镜)` });
        mergeable.forEach(s => dock.say(`<span data-bm="${s.id}">⏳ 镜头${s.order + 1} 等待中</span>`));
        const updM = (s, html) => { const el = dock.m.querySelector(`[data-bm="${s.id}"]`); if (el) el.innerHTML = html; };
        let okCnt = 0, failCnt = 0, noFunds = false;
        for (const s of mergeable) {
          if (dock.cancelled) { updM(s, `✕ 镜头${s.order + 1} 已取消`); failCnt++; continue; }
          if (noFunds || !U.charge(1, `合成音视频:镜头${s.order + 1}`)) { noFunds = true; updM(s, `<span style="color:var(--red)">✕ 镜头${s.order + 1} 积分不足</span>`); failCnt++; continue; }
          updM(s, `🎬 镜头${s.order + 1} 混流中…`);
          try {
            const r = await Media.ffMerge(s.video.url, s.audioUrl, 'ff.merge', tk.id + '_m' + s.order);
            s.merged = true;
            s.mergedUrl = r.url;
            okCnt++;
            updM(s, `<span style="color:var(--green)">✓ 镜头${s.order + 1} 完成</span>`);
          } catch (e) {
            U.refund(1, `镜头${s.order + 1} 混流失败退费`, tk.id + '_m' + s.order);
            failCnt++;
            updM(s, `<span style="color:var(--red)">✕ 镜头${s.order + 1} 失败(已退费)</span>`);
            U.toast(`镜头${s.order + 1} 合成失败:` + e.message, 'error', 3500);
          }
        }
        Store.save();
        if (!okCnt && failCnt) Tasks.fail(tk, '全部失败'); else Tasks.done(tk); // 全败不置完成
        dock.finish(`<b>合成完成:成功 ${okCnt} 镜${failCnt ? `,失败 ${failCnt}` : ''}</b>`);
        U.toast(`已合成 ${okCnt} 个分镜的音视频${failCnt ? `,失败 ${failCnt}` : ''}${ok.length > mergeable.length ? `(另 ${ok.length - mergeable.length} 镜无真实配音/视频,跳过)` : ''}`, failCnt ? 'info' : 'success', 4000);
        renderShots(main, p, ep);
        return;
      }
      // 离线模式:仅打标记
      await new Promise(res => U.runTask({
        title: '批量合成音视频(离线模拟)',
        steps: [{ label: '对齐音轨', ms: 900 }, { label: ep.sbConfig.subtitle ? '烧录字幕' : '跳过字幕', ms: 800 }, { label: '封装输出', ms: 700 }],
        onDone: res,
      }));
      ok.forEach(s => { s.merged = true; });
      Store.save();
      Tasks.done(tk);
      U.toast(`已合成 ${ok.length} 个分镜的音视频(离线模拟)`, 'success');
    } else if (op === 'delete') {
      U.confirm(`确定删除本集全部 ${ep.shots.length} 个分镜吗?此操作不可恢复。`, async () => {
        // 在飞拦截(十一轮):本地任务 + 服务端 running jobs 合并判定(防刷新后孤儿上游任务)
        const guard = window.Tasks ? await Tasks.canDeleteScope({ episodeId: ep.id }) : { local: [], remote: [] };
        if (guard.remote == null) return U.toast('任务中心暂时不可达,无法确认是否有在途生成任务,请稍后重试', 'error');
        if (guard.local.length) return U.toast(`本集有 ${guard.local.length} 个任务正在进行(${guard.local[0].type} 等),请等待完成后再全删`, 'error');
        if (guard.remote.length) return U.toast(`服务端仍有 ${guard.remote.length} 个生成任务在跑,请等待完成或超时后再全删`, 'error');
        ep.shots = [];
        ep.uiSel = null;
        ep.composed = false; // 全删后旧成片已无分镜支撑:重置合成态,防进度条/成片库显示幽灵成片(与 CSV 导入等三条路径口径一致)
        ep.lastReview = null; // 逐镜审片报告引用的 shotId 已全部失效
        Store.save();
        U.toast('已删除全部分镜', 'success');
        renderShots(main, p, ep);
      }, '全部删除');
      return;
    }
    renderShots(main, p, ep);
  }

  Object.assign(window.SB, { jumpToShot, openConfirmGateModal, runBatchOp });
})();
