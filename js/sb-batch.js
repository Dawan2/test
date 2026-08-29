/* ============ sb-batch.js 批量操作 + 失败任务重试(自 storyboard.js 拆分) ============
 * runBatchOp(批量生成视频/音频/合成音视频/全删)/ openConfirmGateModal(镜头确认闸)/ jumpToShot /
 * window.__retryShotTask(任务监控页 ↻ 重试入口)。
 * 加载顺序:storyboard.js 之后、sb-gen.js 之前(openConfirmGateModal 挂回 window.SB 供其解构)。
 * 待确认清单行上的镜号是给人看的,取 Domain.shotNo(ep.shots, s)(分镜表实位);
 * 任务名/扣费退费摘要/留痕文件名/opIds 标签是落库文本,仍按 s.order 记。 */
(function () {
  const { renderShots, onEpPage, ttsShot, markOfflineAudio } = window.SB;

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
      if (t.type === '文生视频') Commands.execute('shot.generateVideo', { pid: p.id, epid: ep.id, sid: s.id, main, ui: true }).then(r => Commands.digest(r)); // 统一命令层(ui 模式)
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
          <span class="tag cyan" style="flex:none">镜头 ${Domain.shotNo(ep.shots, s) || '?'}</span>
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
      // 执行走统一领域命令(ui 模式):真人预审 guardAsync/镜头确认闸/合规承诺/失败重试汇总由命令层与引擎保留;
      // 本函数只承担 UI 决策壳:二十轮收敛为「出片前置检查」单屏——成本预估 + 未确认清单 + 合规/审核状态一页问清
      // (原链路:成本弹窗 → 确认闸 → 合规承诺 → 真人预审最多 4 层;合规承诺/真人预审保留下游执行,此处降级为状态条展示)
      const pend = ep.shots.filter(s => !s.final && (!s.video || !Store.shotVideoReady(s)) && !(s.video && s.video.status === 'generating') && !(SBGen.isInflight && SBGen.isInflight(s.id))); // 防重闸:排除在飞/生成中镜
      if (!pend.length) return U.toast('所有分镜视频均已生成或正在生成中', 'info');
      const per = s => SBGen.shotVideoBilling(s).cost; // 预估与实际扣费同口径(estShotDuration 推导长镜头×2)
      const total = pend.reduce((n, s) => n + per(s), 0);
      // 拆镜策略建议:LLM 拆镜时按画面动态标注的建议策略,批量入口可一键采纳后执行
      const hints = pend.filter(s => s.strategyHint && (s.genStrategy || 'ref') !== s.strategyHint);
      const unconfirmed = pend.filter(s => !s.confirm);
      const confirmed = pend.filter(s => s.confirm);
      // 合规/真人审核状态条(记忆型承诺降级为状态展示,不再单占一屏)
      const accepted = !!(window.Compliance && (Store.state.settings || {}).complianceAccepted);
      const hrCnt = window.HumanReview && HumanReview.shotImageUrls ? new Set(pend.flatMap(s => HumanReview.shotImageUrls(p, s))).size : 0;
      const statusHTML = `
        <div class="small muted" style="line-height:1.9;margin-top:10px;border-top:1px dashed var(--border);padding-top:8px">
          · 合计约 <b style="color:var(--yellow)">${total}</b> 积分(长镜头按 2 镜计价);逐条扣减:每镜单独扣费,余额不足仅该镜失败,单镜失败自动退费<br>
          · 合规承诺:${accepted ? '✓ 已签署' : '未签署——执行时将要求签署一次'}${hrCnt ? `<br>· 真人素材 ${hrCnt} 项:执行前将有真人素材预审` : ''}${hints.length ? `<br>· <b>${hints.length}</b> 镜有拆镜建议策略(与当前设置不同,可按建议生成)` : ''}
        </div>`;
      // 逐条扣减:每镜单独扣费,余额不足时仅该镜失败;shotIds 子集执行(校准/放量两段)
      const run = shots => Commands.execute('episode.generateVideos', { pid: p.id, epid: ep.id, main, ui: true, shotIds: shots.map(s => s.id) }).then(r => Commands.digest(r));
      const applyHints = () => {
        // 采纳建议:hint 写入 genStrategy(frames 补首帧,与右栏采纳同一套初始化)
        hints.forEach(s => {
          s.genStrategy = s.strategyHint;
          if (s.genStrategy === 'frames' && !s.firstFrame) {
            if (s.inheritTail) SBGen.syncFrames(ep, p);
            if (!s.firstFrame) s.firstFrame = SBGen.framePH(s, 'first');
          }
        });
        Store.save();
      };
      // 成本决策屏(全部已确认时直接到此;含校准/放量/建议策略三选)
      const openCostScreen = list => {
        if (list.length <= 3) { run(list); return; }
        U.openModal({
          title: '出片前置检查',
          body: `<p style="line-height:2">将为 <b>${list.length}</b> 个未出片分镜生成视频。<br>· 建议先校准前 3 镜,确认效果后再放量,避免批量返工</p>${statusHTML}`,
          footer: `<button class="btn" data-x="cancel">取消</button>${hints.length ? '<button class="btn" data-x="hint">按建议策略生成</button>' : ''}<button class="btn" data-x="all">直接全部生成</button><button class="btn primary" data-x="first3">先校准前 3 镜(-${list.slice(0, 3).reduce((n, s) => n + per(s), 0)}积分)</button>`,
          onMount(m, close) {
            m.querySelector('[data-x=cancel]').onclick = close;
            m.querySelector('[data-x=all]').onclick = async () => { close(); await run(list); };
            const hintBtn = m.querySelector('[data-x=hint]');
            if (hintBtn) hintBtn.onclick = async () => { applyHints(); close(); await run(list); };
            m.querySelector('[data-x=first3]').onclick = async () => {
              close();
              await run(list.slice(0, 3));
              const rest = list.slice(3).filter(s => !s.video || !Store.shotVideoReady(s));
              if (!rest.length) return;
              U.openModal({
                title: '校准完成',
                body: `<p style="line-height:2">前 3 镜已生成,可回工作区查看效果。<br>继续生成剩余 <b>${rest.length}</b> 镜(约 <b style="color:var(--yellow)">${rest.reduce((n, s) => n + per(s), 0)}</b> 积分,逐条扣减)?</p>`,
                footer: `<button class="btn" data-x="no">先不生成</button><button class="btn primary" data-x="yes">继续生成剩余 ${rest.length} 镜</button>`,
                onMount(m2, close2) {
                  m2.querySelector('[data-x=no]').onclick = close2;
                  m2.querySelector('[data-x=yes]').onclick = async () => { close2(); await run(rest); };
                },
              });
            };
          },
        });
      };
      // 有未确认镜头:确认处置与成本/状态同屏(原确认闸独立一屏,现并入前置检查)
      if (unconfirmed.length) {
        U.openModal({
          title: '出片前置检查 · 镜头确认',
          body: `
          <div style="margin-bottom:10px;line-height:1.8">共 <b style="color:var(--yellow)">${unconfirmed.length}</b> 个镜头待确认。批量出片前请逐镜过目剧情与提示词(先确认再放量,避免批量返工)。</div>
          <div style="max-height:32vh;overflow-y:auto">
            ${unconfirmed.map(s => `
            <div class="row" style="gap:10px;align-items:center;padding:7px 10px;border:1px solid var(--border2);border-radius:10px;margin-bottom:6px">
              <span class="tag cyan" style="flex:none">镜头 ${Domain.shotNo(ep.shots, s) || '?'}</span>
              <span class="small grow" style="line-height:1.5">${U.esc((s.plot || '(未填写剧情)').slice(0, 60))}</span>
              <span class="tag" style="flex:none">待确认</span>
            </div>`).join('')}
          </div>${statusHTML}`,
          footer: `<button class="btn" data-x="cancel">取消</button>${confirmed.length ? `<button class="btn" data-x="only">仅生成已确认镜头(${confirmed.length})</button>` : ''}<button class="btn" data-x="all">全部确认并继续</button><button class="btn primary" data-x="go">去逐镜确认</button>`,
          onMount(m, close) {
            m.querySelector('[data-x=cancel]').onclick = () => { close(); };
            const only = m.querySelector('[data-x=only]');
            if (only) only.onclick = () => { close(); openCostScreen(confirmed); };
            m.querySelector('[data-x=all]').onclick = () => {
              unconfirmed.forEach(s => s.confirm = true);
              Store.save();
              close();
              openCostScreen(pend);
            };
            m.querySelector('[data-x=go]').onclick = () => {
              close();
              jumpToShot(p, ep, main, unconfirmed[0]);
              U.toast('请逐镜过目并点「✓ 确认本镜」,确认后再发起批量生成', 'info', 3500);
            };
          },
        });
        return;
      }
      openCostScreen(pend);
      return;
    } else if (op === 'audio') {
      const pend = ep.shots.filter(s => !s.audio);
      if (!pend.length) return U.toast('所有分镜均已有音频', 'info');
      // 逐条扣费统一走 Tasks.runBatch:每镜单独 登记→扣费→合成→失败/取消退该镜费用,
      // 余额不足仅该镜失败;取消时剩余镜不再扣费(替代原"整批预扣+手写逐镜退费")
      // 音色配置走 Domain.voiceCfgOf 单源(含镜头级声音设置,与 ttsShot 实际送上游的参数同一份)
      const optsOf = s => ({ type: '生成音频', model: MODELS.tts[0] + '·' + Voice.label(Domain.voiceCfgOf(p, ep, s)), target: `${ep.title}·镜头${s.order + 1}`, cost: COST.audio, actionName: '生成音频', projectId: p.id, episodeId: ep.id, shotId: s.id });
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
        markOfflineAudio(p, ep, s, Domain.voiceCfgOf(p, ep, s), MODELS.tts[0] + '(离线模拟)');
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
            // R15:inner opId 落任务——该镜超时但服务端已交付时,任务中心「领取结果」按此键找回并应用回分镜
            if (e && e.__opId) {
              tk.opIds = tk.opIds || [];
              if (!tk.opIds.some(x => x.opId === e.__opId)) tk.opIds.push({ opId: e.__opId, shotId: s.id, label: '镜头' + (s.order + 1) });
              Store.save();
            }
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
