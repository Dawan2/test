/* ============ produce.js 量产跑批中心(工业化量产轨) ============
 * 设计精神:量产不给选择,只给默认值。用户只做三个决策——选哪几集、用什么模板、点开始。
 * 引擎走统一领域命令(第二阶段):Commands.execute('episode.produce') 逐集编排
 *   就绪检查 → 批量生成 → 智能审片(质量闸门) → 合成,与 Agent「一键成片」/CLI 同口径。
 * 渲染汇流排用 detached sink,避免生成链路内部的 renderShots 把跑批页替换掉。
 */
(function () {
  window.Views = window.Views || {};

  Views.produce = function (main, pid) {
    const p = Store.getProject(pid);
    if (!p) { location.hash = '#/projects'; return; }
    const sink = document.createElement('div'); // 渲染汇流排(不上屏)
    // 跑批配置模板(页内存量,跑批时写入各集 sbConfig)
    const cfg = { smartReview: true, maxRetry: 2, skipComposed: true, riskyCompose: false };
    let running = false;
    const runState = {}; // epId -> {status:'idle'|'running'|'done'|'failed'|'skipped', note}

    const epProgress = ep => {
      const shots = ep.shots || [];
      const v = shots.filter(s => Store.shotVideoReady(s)).length; // 就绪=真实出片(离线模拟在线时不计入,会重新生成)
      return { shots: shots.length, vDone: v };
    };
    const selected = () => (p.episodes || []).filter(e => e.__sel);

    /* 全链路预估(逐镜时长计价):视频(长镜头按 2 镜)+ 配音(开启同步语音的集)+ 审片(N+2 步,重抽另计)+ 合成
     * 十六轮口径统一:视频预估走 SBGen.shotVideoBilling(预估时长 estShotDuration>10s 判长镜头),
     * 与实际扣费同一推导(此前用遗留字段 s.duration 判长镜,与 estShotDuration 口径分叉会少估) */
    const vCostOf = s => (window.SBGen && SBGen.shotVideoBilling ? SBGen.shotVideoBilling(s).cost : (estDur(s) > 10 ? COST.video * 2 : COST.video));
    const estDur = s => (window.SBGen && SBGen.estShotDuration ? SBGen.estShotDuration(s) : (s.duration || 3));
    function estimate() {
      let video = 0, audio = 0, review = 0, compose = 0;
      selected().forEach(ep => {
        (ep.shots || []).forEach(s => {
          if (!s.final && !Store.shotVideoReady(s)) video += vCostOf(s);
        });
        if (ep.sbConfig && ep.sbConfig.syncVoice) audio += (ep.shots || []).filter(s => !s.audio).length * COST.audio;
        if (cfg.smartReview) review += ((ep.shots || []).length + 2) * COST.review; // N 镜 + 共性汇总 + 四维评审,重抽另计
        if (!Store.epComposedReady(ep)) compose += COST.compose; // 离线模拟合成的集在线时重新合成
      });
      return { video, audio, review, compose, total: video + audio + review + compose };
    }

    function render() {
      const eps = p.episodes || [];
      const est = estimate();
      main.innerHTML = `
      <div class="page">
        <div class="crumb" onclick="location.hash='#/project/${p.id}'">‹ 返回 ${U.esc(p.name)}</div>
        <div class="page-head">
          <div>
            <div class="page-title">🏭 量产跑批中心</div>
            <div class="page-sub">${U.esc(styleOf(p))} · ${eps.length} 集 · 选集 → 设模板 → 开始,其余交给流水线</div>
          </div>
          <div class="row">
            <button class="btn" data-x="selall">全选</button>
            <button class="btn" data-x="selundone">全选未完成</button>
            <button class="btn primary" data-x="run" ${running ? 'disabled' : ''}>⚡ 开始跑批${est.total ? ` · 预计 ${est.total} 积分` : ''}</button>
          </div>
        </div>

        ${window.Pipeline ? Pipeline.html(p, { center: false, style: 'margin:0 0 12px' }) : ''}
        <div class="card" style="padding:12px 16px;margin-bottom:14px">
          <div class="row wrap" style="gap:18px;align-items:center">
            <b class="small">跑批模板</b>
            <span class="check-line" data-cfg="smartReview" style="margin:0"><span class="switch ${cfg.smartReview ? 'on' : ''}"></span><span class="small">智能审片(不达标自动重抽)</span></span>
            <span class="row" style="gap:5px;align-items:center"><span class="small muted">最大重抽</span>
              ${[1, 2, 3].map(n => `<span class="tag ${cfg.maxRetry === n ? 'cyan' : ''}" style="cursor:pointer" data-mr="${n}">${n} 次</span>`).join('')}
            </span>
            <span class="check-line" data-cfg="skipComposed" style="margin:0"><span class="switch ${cfg.skipComposed ? 'on' : ''}"></span><span class="small">跳过已合成集</span></span>
            <span class="check-line" data-cfg="riskyCompose" style="margin:0" title="默认:存在待人工镜头的集阻断合成,防止带病成片;开启后放行"><span class="switch ${cfg.riskyCompose ? 'on' : ''}"></span><span class="small">带风险合成(待人工不阻断)</span></span>
            <span class="small muted" style="margin-left:auto" title="逐镜时长计价(长镜头按 2 镜);审片重抽与提示词优化另计">预估:视频 ${est.video} + 配音 ${est.audio} + 审片 ${est.review} + 合成 ${est.compose} = <b style="color:var(--yellow)">${est.total}</b> 积分</span>
          </div>
        </div>

        ${!eps.length ? '<div class="empty"><div class="ico">🏭</div><p>暂无分集,请先在项目管理中创建分集并生成分镜</p></div>' : `
        <div class="card" style="padding:0;overflow:hidden">
          <table class="tbl">
            <thead><tr><th style="width:36px"></th><th>分集</th><th>分镜</th><th>视频</th><th>审片均分</th><th>成片</th><th>跑批状态</th></tr></thead>
            <tbody>
              ${eps.map(ep => {
                const { shots, vDone } = epProgress(ep);
                const st = runState[ep.id] || {};
                const skip = cfg.skipComposed && Store.epComposedReady(ep); // 只跳过"真实合成"的集;离线模拟合成在线时重跑
                return `<tr style="${st.status === 'running' ? 'background:rgba(34,211,238,.06)' : ''}">
                  <td><input type="checkbox" data-sel="${ep.id}" ${ep.__sel ? 'checked' : ''} ${skip || running ? 'disabled' : ''}></td>
                  <td class="small"><b>${U.esc(ep.title)}</b>${skip ? ' <span class="tag green">已合成将跳过</span>' : ''}</td>
                  <td class="small">${shots ? shots + ' 镜' : '<span class="muted">未分镜</span>'}</td>
                  <td class="small">${shots ? `${vDone}/${shots}` : '—'}</td>
                  <td class="small">${ep.lastReview ? (() => { const stale = window.Review && Review.episodeReviewStale(ep); return `<span class="tag ${stale ? 'yellow' : ep.lastReview.avg >= 7 ? 'green' : 'yellow'}" title="${stale ? '镜头集或任一镜视频版本在审片后已变化,均分为旧版结论' : ''}">${ep.lastReview.avg}${stale ? '·旧版' : ''}</span>`; })() : '<span class="muted">—</span>'}</td>
                  <td class="small">${Store.epComposedReady(ep) ? '<span class="tag green">✓</span>' : ep.composed ? (ep.composedUrl ? '<span class="tag yellow" title="合成输入已变化(调序/裁剪/换素材等),跑批将重新合成">待更新</span>' : '<span class="tag yellow" title="离线模拟合成,在线后将重新合成">模拟</span>') : '<span class="muted">—</span>'}</td>
                  <td class="small">${st.status === 'running' ? '<span class="tag cyan"><span class="spinner" style="width:9px;height:9px"></span> ' + U.esc(st.note || '执行中') + '</span>'
                    : st.status === 'done' ? `<span class="tag green">✓ ${U.esc(st.note || '完成')}</span>`
                    : st.status === 'failed' ? `<span class="tag red">✕ ${U.esc(st.note || '失败')}</span>`
                    : st.status === 'skipped' ? `<span class="tag">⊘ ${U.esc(st.note || '跳过')}</span>`
                    : '<span class="muted">待跑</span>'}</td>
                </tr>`;
              }).join('')}
            </tbody>
          </table>
        </div>`}
        <div class="hint" style="margin-top:10px">流水线:就绪检查 → 逐集串行 批量生成 → 智能审片(不达标先修订提示词再重抽)→ 合成成片;逐镜逐条扣费,失败自动返还;跑批中断后再点开始即为断点续跑(已完成环节自动跳过)。审片超限转"待人工"的集默认阻断合成(可开"带风险合成"放行),点进分集精修即可。</div>
      </div>`;

      main.querySelectorAll('[data-sel]').forEach(c => c.onchange = () => {
        const ep = eps.find(x => x.id === c.dataset.sel);
        ep.__sel = c.checked;
        render();
      });
      main.querySelector('[data-x=selall]').onclick = () => { eps.forEach(e => { e.__sel = !(cfg.skipComposed && Store.epComposedReady(e)); }); render(); };
      main.querySelector('[data-x=selundone]').onclick = () => { eps.forEach(e => { e.__sel = !Store.epComposedReady(e); }); render(); }; // 统一就绪判定:输入已变化的集也算未完成
      main.querySelectorAll('[data-cfg]').forEach(el => el.onclick = () => {
        const k = el.dataset.cfg;
        cfg[k] = !cfg[k];
        render();
      });
      main.querySelectorAll('[data-mr]').forEach(t => t.onclick = () => { cfg.maxRetry = +t.dataset.mr; render(); });
      main.querySelector('[data-x=run]').onclick = startRun;
      if (window.Pipeline) {
        Pipeline.bind(main, p);
        // 跑批页是生成语境:步骤点击带去明确视图(分镜→脚本层,其余→生成台);制片/剧本/导演/剧壳/切片回项目页对应 tab
        main.querySelectorAll('[data-step]').forEach(t => {
          const k = t.dataset.step;
          const projTab = { prod: '制片', script: '剧本', director: '导演', eps: '分集', shell: '剧壳', clips: '切片', subjects: '主体', film: '成片库' }[k];
          t.onclick = () => {
            if (projTab) { window.__projTab = projTab; location.hash = '#/project/' + p.id; return; }
            window.__epView = k === 'shots' ? 'board' : 'shots';
            location.hash = Pipeline.hashOf(p, k);
          };
        });
      }
    }

    /* 生产就绪检查(preflight):Domain.episodeState 统一推导,与流程条/下一步/CLI 同一口径;
     * 硬阻塞(缺剧本/分镜过期/失败镜)的集列出阻塞项、可一键前往处理,继续跑批则自动剔除 */
    function preflight(list, onPass) {
      const online = !!(window.Media && Media.isReady && Media.isReady());
      const hard = list.map(ep => ({ ep, st: Domain.episodeState(p, ep, online) }))
        .filter(x => x.st.status === 'blocked' || x.st.shotsStale);
      if (!hard.length) return onPass(list, []);
      const rest = list.filter(ep => !hard.some(x => x.ep.id === ep.id));
      U.openModal({
        title: '🛡 生产就绪检查',
        wide: true,
        body: `<p style="line-height:1.8">以下 <b>${hard.length}</b> 集存在硬阻塞,直接跑批只会浪费生成费。可逐项前往处理,或跳过这些集继续:</p>
        <table class="tbl" style="margin-top:6px"><thead><tr><th>分集</th><th>阻塞项</th><th style="width:110px"></th></tr></thead>
        <tbody>${hard.map(x => `<tr><td class="small"><b>${U.esc(x.ep.title)}</b></td>
          <td class="small">${x.st.blockers.length ? x.st.blockers.map(b => `<span class="tag red" style="margin:0 4px 4px 0">${U.esc(b.label)}</span>`).join('') : '<span class="muted">—</span>'}</td>
          <td><button class="btn sm" data-fix="${x.ep.id}">前往处理 ›</button></td></tr>`).join('')}</tbody></table>`,
        footer: `<button class="btn" data-x="cancel">取消跑批</button>${rest.length ? `<button class="btn primary" data-x="go">跳过 ${hard.length} 集,继续跑批</button>` : ''}`,
        onMount(m, close) {
          m.querySelectorAll('[data-fix]').forEach(b => b.onclick = () => {
            close();
            window.__epView = 'shots';
            location.hash = `#/project/${p.id}/episode/${b.dataset.fix}`;
          });
          m.querySelector('[data-x=cancel]').onclick = close;
          const go = m.querySelector('[data-x=go]');
          if (go) go.onclick = () => { close(); onPass(rest, hard.map(x => x.ep)); };
        },
      });
    }

    async function startRun() {
      const list = selected().filter(ep => !(cfg.skipComposed && Store.epComposedReady(ep)));
      if (!list.length) return U.toast('请先勾选要跑批的分集', 'error');
      preflight(list, reallyRun);
    }

    async function reallyRun(list, blockedEps) {
      (blockedEps || []).forEach(ep => { runState[ep.id] = { status: 'skipped', note: '就绪检查拦截' }; });
      if (!list.length) { render(); return U.toast('勾选集均未通过就绪检查,请先处理阻塞项', 'error'); }
      const noShots = list.filter(ep => !(ep.shots || []).length);
      const est = estimate();
      U.confirm(`将对 ${list.length} 集依次执行流水线(预计消耗约 ${est.total} 积分,逐条扣减、失败返还)。${noShots.length ? `\n注意:${noShots.length} 集未分镜将跳过。` : ''}开始跑批吗?`, async () => {
        running = true;
        const t0 = Date.now();
        const summary = [];
        for (const ep of list) {
          runState[ep.id] = { status: 'running', note: '准备中' };
          render();
          const et0 = Date.now();
          try {
            // 应用跑批模板(带默认值兜底:未打开过分集页的集 sbConfig 可能只有两个键)
            ep.sbConfig = Object.assign(window.SB && SB.defaultSBConfig ? SB.defaultSBConfig(p) : {}, ep.sbConfig, { smartReview: cfg.smartReview, maxRetry: cfg.maxRetry });
            if (!(ep.shots || []).length) {
              runState[ep.id] = { status: 'skipped', note: '未分镜' };
              summary.push({ ep, note: '跳过(未分镜)' });
              continue;
            }
            /* 统一领域命令(第二阶段):episode.produce 编排 就绪检查→批量生成→智能审片(质量闸门)→合成,
             * 与 Agent「一键成片」/CLI 同口径;headless:未确认镜跳过,失败镜合成前统一拦截,onStep 回报行内状态 */
            const r = await Commands.execute('episode.produce', {
              pid: p.id, epid: ep.id, main: sink,
              smartReview: cfg.smartReview, maxRetry: cfg.maxRetry, riskyCompose: cfg.riskyCompose,
              onStep: key => { runState[ep.id] = { status: 'running', note: key }; render(); },
            });
            const sec = Math.round((Date.now() - et0) / 1000);
            const rv = ((r.result && r.result.steps) || []).find(x => x.step === 'smartReview');
            const rvR = rv && rv.result;
            let reviewNote = cfg.smartReview ? (rvR ? `达标${rvR.pass}·重抽${rvR.retry}·待人工${rvR.manual}` : '—') : '未开启';
            if (rvR && rvR.manual > 0 && cfg.riskyCompose) reviewNote += '·带风险合成';
            if (r.ok) {
              runState[ep.id] = { status: 'done', note: `${sec}s · ${reviewNote}` };
            } else if (r.status === 'needs_human') {
              runState[ep.id] = { status: 'failed', note: `待人工 ${rvR ? rvR.manual : 0} 镜,已阻断合成(开"带风险合成"可放行)` };
            } else {
              runState[ep.id] = { status: 'failed', note: ((r.error && r.error.message) || '失败').slice(0, 30) };
            }
            summary.push({ ep, note: runState[ep.id].note, sec });
          } catch (err) {
            runState[ep.id] = { status: 'failed', note: String(err.message || err).slice(0, 30) };
            summary.push({ ep, note: '异常:' + runState[ep.id].note });
          }
          render();
        }
        running = false;
        render();
        // 汇总
        const totalSec = Math.round((Date.now() - t0) / 1000);
        const doneCnt = summary.filter(x => runState[x.ep.id].status === 'done').length;
        U.openModal({
          title: '🏭 跑批完成',
          wide: true,
          body: `
          <p style="line-height:1.9">共 ${summary.length} 集,成功 <b style="color:var(--green)">${doneCnt}</b> 集,总耗时 ${Math.floor(totalSec / 60)} 分 ${totalSec % 60} 秒。</p>
          <table class="tbl" style="margin-top:8px"><thead><tr><th>分集</th><th>结果</th></tr></thead>
          <tbody>${summary.map(x => `<tr><td class="small">${U.esc(x.ep.title)}</td><td class="small">${U.esc(x.note || '')}</td></tr>`).join('')}</tbody></table>`,
          footer: `<button class="btn" data-x="dl">⬇ 导出汇总</button><button class="btn primary" data-x="ok">完成</button>`,
          onMount(m, close) {
            m.querySelector('[data-x=ok]').onclick = close;
            m.querySelector('[data-x=dl]').onclick = () => {
              const lines = [`跑批汇总 · ${p.name}`, '时间:' + Store.now(), `共 ${summary.length} 集,成功 ${doneCnt} 集,耗时 ${totalSec}s`, '',
                ...summary.map(x => `${x.ep.title}:${x.note || ''}`)];
              U.downloadText(`跑批汇总_${p.name}.txt`, lines.join('\n'));
              U.toast('汇总已导出', 'success');
            };
          },
        });
      }, '⚡ 开始跑批');
    }

    render();
  };

  /* ================= 智能审片闭环(自 storyboard.js 迁入量产域) ================= */
  /* 生成后逐镜评审,不达标自动重生成,最多 maxRetry 次(审片 COST.review/镜,重生成 COST.video/次)
   * 非模态:进度走右侧后台侧边栏(可最小化/可中止),页面全程可操作 */
  async function autoSmartReview(p, ep, main, shots, quiet) {
    const maxRetry = Math.max(1, Math.min(5, ep.sbConfig.maxRetry || 2));
    const targets = (shots || ep.shots).filter(s => s.video && Store.shotVideoReady(s) && !s.final);
    if (!targets.length) return { pass: 0, retry: 0, manual: 0 };
    const dock = quiet ? null : U.bgDock({ title: `🧠 智能审片 · ${ep.title}(${targets.length} 镜)` });
    if (dock) {
      dock.say(`达标线 7.0 分 · 不达标先按问题修订提示词再重生成(每镜最多 ${maxRetry} 次)· 超限转人工处理 · 评审期间可正常操作页面`);
      if (window.Bus) Bus.emit('review.smartStart', { p, ep, main, total: targets.length, maxRetry, brief: `智能审片开始(${targets.length} 镜)` }); // 事件总线:Agent 对话流订阅转译(quiet/headless 不发,与原 notify 条件一致)
    }
    const say = h => { if (dock) dock.say(h); };
    let passCnt = 0, retryCnt = 0, manualCnt = 0;
    const lastRep = {}; // 每镜最后一次审片报告(重抽后再审会覆盖),用于收尾写回整集 lastReview
    for (const s of targets) {
      if (dock && dock.cancelled) { say(`⏹ 用户中止审片`); break; }
      let pass = false;
      for (let attempt = 0; attempt <= maxRetry && !pass; attempt++) {
        if (dock && dock.cancelled) break;
        say(`▶ 镜头 ${s.order + 1} 评审中${attempt ? `(第 ${attempt} 次重生成后)` : ''}…`);
        const r = await Review.reviewShot(p, ep, s);
        if (!r) { say('&nbsp;&nbsp;积分不足,审片中止'); manualCnt++; break; }
        lastRep[s.id] = r;
        if (r.score >= 7) { pass = true; passCnt++; s.confirm = true; say(`&nbsp;&nbsp;✅ <b style="color:var(--green)">${r.score.toFixed(1)}</b> 分,达标(已自动确认)`); } // 审片达标 = 系统替你确认(镜头确认闸联动)
        else if (attempt < maxRetry) {
          retryCnt++;
          // 先消费审片 issues 修订提示词再重抽(避免同一问题反复付费重生成);
          // optimizeShot(autoApply)内部扣 COST.optimize 并写入提示词,失败/积分不足则沿用原提示词
          const issueCnt = (r.issues || []).length;
          if (issueCnt && window.Review && Review.optimizeShot) {
            say(`&nbsp;&nbsp;⚠️ <b style="color:var(--yellow)">${r.score.toFixed(1)}</b> 分不达标,先按 ${issueCnt} 条问题修订提示词…`);
            const okOpt = await Review.optimizeShot(p, ep, s, r, main, true);
            say(okOpt ? '&nbsp;&nbsp;✏️ 提示词已按审片意见修订,重新生成…' : `&nbsp;&nbsp;⚠️ <b style="color:var(--yellow)">${r.score.toFixed(1)}</b> 分不达标(优化未执行),沿用原提示词重生成…`);
          } else {
            say(`&nbsp;&nbsp;⚠️ <b style="color:var(--yellow)">${r.score.toFixed(1)}</b> 分不达标,自动重生成…`);
          }
          if (window.SB && SB.snapshotShot) SB.snapshotShot(s, '审片重抽前'); // 覆盖旧 video 前留档(与正常重生成路径同一快照函数):重抽失败/积分不足时旧片可从历史版本回滚
          s.video = { status: 'none' };
          await SBGen.createShotVideo(p, ep, s, main, true);
          if (!s.video || !Store.shotVideoReady(s)) { say('&nbsp;&nbsp;重生成失败,转人工处理'); manualCnt++; break; }
        } else {
          say(`&nbsp;&nbsp;❌ <b style="color:var(--red)">${r.score.toFixed(1)}</b> 分,已达最大重试,转人工处理`);
          manualCnt++;
        }
      }
    }
    const summary = `完成:达标 ${passCnt} 镜 · 自动重生成 ${retryCnt} 次 · 待人工 ${manualCnt} 镜`;
    say(`<span class="hi">━━ ${summary} ━━</span>`);
    if (dock) dock.finish(`<b style="color:${manualCnt ? 'var(--yellow)' : 'var(--green)'}">━━ ${summary} ━━</b>`);
    if (quiet) U.toast(`智能审片完成(${ep.title}):达标 ${passCnt} · 重抽 ${retryCnt} 次 · 待人工 ${manualCnt}`, manualCnt ? 'info' : 'success', 3500);
    if (window.Bus) Bus.emit('review.smartDone', { p, ep, main, pass: passCnt, retry: retryCnt, manual: manualCnt, quiet: !!quiet, brief: `智能审片完成:达标 ${passCnt} · 重抽 ${retryCnt} · 待人工 ${manualCnt}` }); // 事件总线:Agent 订阅转译(quiet/headless 由订阅侧静默)
    /* 写回整集审片记录(与 review.js openEpisodeReview / 服务端 wf smart-review 同构):
     * 此前全程只写单镜 s.reviews/s.confirm,ep.lastReview 缺失 → 发布门 G3 判"无审片记录"、
     * 问题中心/分集页均分不更新;snapshotHash 用 wf-core 同口径(重抽后按最新视频状态计算) */
    const reviewed = targets.filter(s => lastRep[s.id]);
    if (reviewed.length) {
      ep.lastReview = {
        time: Store.now(),
        avg: Math.round(reviewed.reduce((a, s) => a + lastRep[s.id].score, 0) / reviewed.length * 10) / 10,
        snapshotHash: window.WfCore && WfCore.reviewSnapshotHashOf ? WfCore.reviewSnapshotHashOf(ep) : undefined,
        sourceRev: ep.contentRev || 0,
        graphRev: ep.graphRev || 0,
        perShot: reviewed.map(s => ({ shotId: s.id, order: s.order, score: lastRep[s.id].score, reportId: lastRep[s.id].id, videoInputHash: lastRep[s.id].videoInputHash || '' })),
        common: { summary: '', issues: [] }, // 闭环不做整集共性汇总/四维评审(结构规整,整集报告页防空指针)
        cut: null,
      };
    }
    Store.save(); // 达标镜头的 confirm=true 与整集 lastReview 落库
    if (main && main.isConnected) window.SB.renderShots(main, p, ep);
    return { pass: passCnt, retry: retryCnt, manual: manualCnt };
  }

  /* 一键成片(EP 卡片入口):批量生成 → 智能审片 → 合成 */
  async function oneClickProduce(p, ep, main) {
    if (!ep.shots.length) return U.toast('该集还没有分镜,请先生成分镜', 'error');
    const pend = ep.shots.filter(s => !s.final && (!s.video || !Store.shotVideoReady(s)));
    /* 全链路预估明细(与跑批中心同口径):视频逐镜时长计价 + 配音(未出音频镜)+ 审片(N+2 步,重抽另计)+ 合成
     * 十六轮:视频预估与实际扣费同一推导(SBGen.shotVideoBilling,预估时长判长镜头) */
    const billOf = s => (window.SBGen && SBGen.shotVideoBilling ? SBGen.shotVideoBilling(s).cost : ((window.SBGen && SBGen.estShotDuration ? SBGen.estShotDuration(s) : (s.duration || 3)) > 10 ? COST.video * 2 : COST.video));
    const vCost = pend.reduce((n, s) => n + billOf(s), 0);
    const audioPend = ep.sbConfig && ep.sbConfig.syncVoice ? ep.shots.filter(s => !s.audio).length : 0;
    const rCost = (ep.shots.length + 2) * COST.review;
    const cCost = Store.epComposedReady(ep) ? 0 : COST.compose;
    const estLine = [pend.length ? `视频 ${vCost}` : '', audioPend ? `配音 ${audioPend * COST.audio}` : '', `审片 ${rCost}`, cCost ? `合成 ${cCost}` : '']
      .filter(Boolean).join(' + ');
    // 统一领域命令(第二阶段):与跑批/Agent「一键成片」同走 episode.produce;quiet=false 保留审片后台面板
    const run = async () => {
      const r = await Commands.execute('episode.produce', { pid: p.id, epid: ep.id, main, quiet: false });
      if (r.ok) U.toast('一键成片完成,成片已归档可预览导出', 'success', 3500);
      else if (r.error) U.toast('一键成片中断:' + r.error.message, r.status === 'needs_human' ? 'info' : 'error', 4000);
    };
    U.confirm(`一键成片将依次执行:${pend.length ? `批量生成 ${pend.length} 镜 → ` : ''}智能审片(不达标自动重生成)→ 合成成片。\n预计消耗:${estLine} = ${vCost + audioPend * COST.audio + rCost + cCost} 积分(逐条扣减、失败返还;审片重抽另计)。开始吗?`, () => {
      if (pend.length && window.HumanReview) {
        const urls = [...new Set(pend.flatMap(s => HumanReview.shotImageUrls(p, s)))];
        return HumanReview.guard(urls, run);
      }
      run();
    }, '⚡ 开始一键成片');
  }

  /* 迁移回挂:storyboard.js 的 window.SB 导出已移除这两项,外部引用(SB.autoSmartReview/SB.oneClickProduce)不变 */
  Object.assign(window.SB, { autoSmartReview, oneClickProduce });
})();
