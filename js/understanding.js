/* ============ understanding.js AI 导演「本集理解」两阶段分镜 ============
 * Step1 本集理解(导演设定+剧本→六维理解) → Step2 分镜生成(注入理解约束)
 */
(function () {
  const DIMS = WfCore.UND_DIMS; // 二十一轮:六维单一来源下沉 wf-core.js(双端共享),键名出口不变

  /* 带重试+修复的 JSON 调用(R1 收敛:转发到 API.chatJSONRobust,4 个调用点不动) */
  const chatJSONRobust = opt => API.chatJSONRobust(opt);

  /* 章节事件图谱:取本集结构化事件,供分镜/拆解精准调用剧情骨架。
   * 十二轮:图谱与正文版本断链修复——sourceRev 失配(或旧数据无 sourceRev 且正文改过)时不再注入,
   * 防"新正文+旧图谱"同时喂给 AI 拆解/智能分镜;旧图谱仍可在剧本页查看编辑,重新生成后恢复注入。
   * 二十一轮:实现下沉 wf-core.js(双端共享),此处委托保持 window.eventsOfEpisode 出口不变 */
  window.eventsOfEpisode = function (p, ep) { return WfCore.eventsOfEpisode(p, ep); };

  /* 构思定调注入(项目「构思」页保存后生效):导演阐述/美术/光影/节奏/表演压缩注入生成提示词;
   * 二十一轮:实现下沉 wf-core.js,此处委托保持 window.conceptInject 出口不变 */
  window.conceptInject = function (p) { return WfCore.conceptInject(p); };

  /* 生成本集理解(LLM 优先,失败回退模板);opId/bAction/step 可选:计费操作键/动作/步骤槽位
   * (重生成入口不传 step=main 步即交付;智能分镜聚合流程传 llm.smartSB 同 opId + step:'und'
   * 辅助步 → 与总价一笔扣费幂等合并,不重复计) */
  async function generate(p, ep, opId, bAction, step) {
    const ds = (Store.state.settings || {}).directorSetting;
    const dsText = ds ? DIMS_DIR(ds) : '';
    try {
      if (!API.isReady()) throw new Error('LLM 未配置');
      const out = await chatJSONRobust({
        model: (Store.state.settings || {}).defLLM || API.getConfig().model,
        system: Prompts.get('und.system'),
        billingAction: bAction || 'llm.understanding', operationId: opId, step,
        // 二十一轮:user 模板拼装下沉 wf-core.js(双端单一来源,逐字节一致);
        // 生效专家方法论(导演板块雇佣 > 全局雇佣)+ 协作记忆注入,与服务端 /api/wf/understanding 同一装配口
        user: WfCore.buildUndUser({
          dsText, styleText: styleOf(p), eventsText: eventsOfEpisode(p, ep), content: (ep.content || '').slice(0, 6000),
          personaNote: window.personaNoteFor ? personaNoteFor(p, WfCore.WF_BOARD.understanding) : '',
          memText: WfCore.memBlock(Store.state.agentMemory, ep.title || '', '导演'),
        }),
        temperature: 0.5, max_tokens: 1500,
      });
      if (!out || !out.剧情脉络) throw new Error('返回结构不完整');
      return WfCore.undNormalize(out, Store.now); // 六维归一 + time 戳(单一来源 wf-core.js)
    } catch (e) {
      U.toast('本集理解生成失败:' + e.message + ',已按风格生成默认理解', 'error', 3200);
      // 回退默认模板(单一来源 wf-core.js;fallback:true 标记——重生成处据此退费置失败,不算假成功)
      return WfCore.undFallback(p, ep, Store.now, styleOf(p));
    }
  }
  function DIMS_DIR(ds) {
    return WfCore.dimsText(ds); // 二十一轮:导演设定五维文本下沉 wf-core.js(不再依赖 window.DIR_DIMS 兜底数组)
  }
  function toText(u) {
    return WfCore.undToText(u); // 二十一轮:六维文本化下沉 wf-core.js
  }

  /* ================= 两阶段进度侧边栏(复用 U.bgDock steps 模式,与剧本解析一致的 dir-dock 停靠样式,不阻塞操作) ================= */
  function run(p, ep, main, { onDone, onError, billingAction, operationId, step }) {
    const st = { step: 0, closed: false, understanding: null, failStep: -1, failReason: '' };
    document.querySelectorAll('.dir-dock').forEach(x => x.remove());
    const hasDS = !!(Store.state.settings || {}).directorSetting;
    // ✕ 关闭中断;侧边栏不随路由切换关闭;与剧本解析共用 __dirActive 互斥(同时只跑一个)
    if (window.__dirActive) window.__dirActive();
    const dock = U.bgDock({
      title: '🐋🎬 AI 导演正在执行本集分镜理解',
      sub: '后台运行中,您可以继续操作页面 · ' + (hasDS ? '基于已确认的全局导演风格,生成本集导演理解与分镜' : '未设置全局导演风格,将按项目风格理解'),
      steps: [
        { title: 'Step 1 | 本集理解', desc: hasDS ? '基于已确认的全局导演风格' : '未设置全局导演风格,将按项目风格理解' },
        { title: 'Step 2 | 分镜生成', desc: '生成镜头结构与分镜描述' },
      ],
      onRetry: () => chain(1),
      onCancel: () => { st.closed = true; clearInterval(timer); if (window.__dirActive) window.__dirActive = null; },
    });
    const ov = dock.m;
    window.__dirActive = () => dock.close();
    const $ = sel => ov.querySelector(sel);
    const barEl = $('[data-bar]'), pctEl = $('[data-pct]'), etaEl = $('[data-eta]');
    let displayPct = 0, targetPct = 0;
    const ESTS = [8, 14];
    const timer = setInterval(() => {
      if (st.closed) return;
      if (displayPct < targetPct) displayPct = Math.min(targetPct, displayPct + Math.max(0.2, (targetPct - displayPct) * 0.08));
      barEl.style.width = displayPct + '%';
      pctEl.textContent = Math.round(displayPct) + '%';
      const frac = st.step >= 2 ? 1 : Math.max(0, displayPct / 100 - (st.step ? 0.45 : 0)) / (st.step ? 0.55 : 0.45);
      const remain = st.step >= 2 ? 0 : Math.max(1, Math.round(ESTS[st.step] * (1 - Math.min(1, frac)) + (st.step === 0 ? ESTS[1] : 0)));
      etaEl.textContent = '预计还需 ' + Director.fmtEta(remain);
      dock.setSteps(st.step, st.failStep);
    }, 120);
    const setTarget = (step, frac) => { st.step = step; targetPct = (step === 0 ? 45 * frac : 45 + 55 * frac); };
    const info = (i, t) => dock.stepInfo(i, t);
    /* bgDock 的 close 幂等;收尾(st.closed/定时器/__dirActive)统一在 onCancel */
    const close = () => dock.close();

    async function chain(retryFrom) {
      try {
        // Step 1(L4 修复:Step2 重试不应重生成已成功的 Step1——存在且未过期才复用)
        setTarget(0, 0.1);
        if (ep.understanding && !Store.understandingStale(ep)) {
          st.understanding = ep.understanding;
          info(0, '<span style="color:var(--green)">✓ 已存在本集理解,直接复用(0s)</span>');
        } else {
          if (ep.understanding) info(0, '源剧本已修改,旧理解过期——按新剧本重新生成本集理解');
          const tk = Tasks.start({ type: '本集理解', model: API.isReady() ? ((Store.state.settings || {}).defLLM || API.getConfig().model) : '本地模板', target: ep.title, projectId: p.id, episodeId: ep.id });
          const t0 = Date.now();
          const crawl = setInterval(() => setTarget(0, Math.min(0.9, (Date.now() - t0) / 8000)), 300);
          // 七轮:runSmartSB 聚合流程传入同一 operationId+动作(+九轮 step 辅助槽位)→ 与总价一笔扣费幂等合并(理解含在智能分镜价内,不重复计)
          st.understanding = await generate(p, ep, operationId, billingAction, step);
          clearInterval(crawl);
          ep.understanding = st.understanding;
          ep.understanding.sourceRev = ep.contentRev || 0; // 十轮:记录理解对应的剧本版本(剧本修改后判旧)
          ep.understanding.graphRev = ep.graphRev || 0;    // 记录理解对应的事件图谱版本(图谱修订后判旧)
          Store.save();
          Tasks.done(tk);
          info(0, `<span style="color:var(--green)">✓ 本集理解已生成(${((Date.now() - t0) / 1000).toFixed(1)}s):${U.esc(st.understanding.剧情脉络.slice(0, 30))}…</span>`);
        }
        setTarget(0, 1);
        // Step 2
        setTarget(1, 0.1);
        const result = await onDone(); // 由调用方执行 genShotsLLM + publish
        if (result === false) {
          st.failStep = 1;
          ov.querySelectorAll('[data-errmsg]')[1].textContent = '分镜生成失败(可重试)';
          return;
        }
        setTarget(1, 1);
        info(1, `<span style="color:var(--green)">✓ 已生成 ${result} 个分镜</span>`);
        setTimeout(close, 700);
      } catch (e) {
        // 执行链意外异常:侧边栏置失败态,并回调调用方退费/置失败任务(不留扣费无记录窗口)
        st.failStep = 1;
        const errs = ov.querySelectorAll('[data-errmsg]');
        if (errs[1]) errs[1].textContent = '执行异常:' + (e && e.message || e);
        if (onError) try { onError(e); } catch (_) { /* 回调自身异常不再扩散 */ }
      }
    }
    chain(0);
    return st;
  }

  /* 独立生成/重生成入口(编辑器「重新生成」按钮与拉片完成事件卡共用):
   * 计费五件套(Tasks.start→charge→generate→失败退费→done);失败回退模板视为未交付,退费且不覆盖原有理解 */
  async function regen(p, ep) {
    const tk = Tasks.start({ type: '本集理解', model: (Store.state.settings || {}).defLLM || (API.isReady() ? API.getConfig().model : '本地模板'), target: ep.title, cost: 2, projectId: p.id, episodeId: ep.id });
    if (!U.charge(2, '重新生成本集理解(' + ep.title + ')', tk.id)) { Tasks.fail(tk, '积分不足'); return false; }
    U.toast('本集理解生成中…', 'info', 2200);
    const nu = await generate(p, ep, tk.id);
    if (nu.fallback) { // 生成失败(回退默认模板):退费置失败,不覆盖原有理解
      U.refund(2, '重新生成本集理解失败退费(' + ep.title + ')', tk.id);
      Tasks.fail(tk, '生成失败,已退费');
      U.toast('本集理解生成失败,已退费' + (ep.understanding ? ',原有理解保留' : ''), 'error', 3200);
      return false;
    }
    Tasks.done(tk);
    nu.sourceRev = ep.contentRev || 0; // 生成成功刷 sourceRev(对应器当前剧本版本,不判旧)
    nu.graphRev = ep.graphRev || 0;    // 同步刷 graphRev(对应器当前图谱版本)
    ep.understanding = nu;
    Store.save();
    U.toast('本集理解已生成,将注入智能分镜/提示词优化/视频生成', 'success', 3000);
    return true;
  }

  /* ================= 「📖 本集理解」查看/编辑/重生成 ================= */
  function openEditor(p, ep, main, ViewsEpisode) {
    if (!ep.understanding) ep.understanding = null;
    const u = ep.understanding || Object.fromEntries(DIMS.map(d => [d, '']));
    U.openModal({
      title: '📖 本集理解 · ' + ep.title,
      wide: true,
      body: `
      <div class="hint" style="margin-bottom:10px">本集导演理解将作为约束注入智能分镜与 AI 分镜师的生成提示词。</div>
      ${DIMS.map(d => `
      <div class="card" style="margin-bottom:8px;padding:10px 12px">
        <b class="small" style="color:var(--accent)">${d}</b>
        <textarea class="input small" rows="2" data-ud="${d}" style="margin-top:6px">${U.esc(u[d] || '')}</textarea>
      </div>`).join('')}
      ${u.time ? `<div class="hint">生成于 ${U.esc(u.time)}</div>` : '<div class="hint">尚未生成本集理解</div>'}`,
      footer: `
        <button class="btn" data-x="regen">↻ 重新生成(-2积分)</button>
        <span class="grow"></span>
        <button class="btn" data-x="cancel">关闭</button>
        <button class="btn primary" data-x="ok">保存</button>`,
      onMount(m, close) {
        const collect = () => DIMS.forEach(d => u[d] = m.querySelector(`[data-ud="${d}"]`).value.trim());
        m.querySelector('[data-x=regen]').onclick = async () => {
          const btn = m.querySelector('[data-x=regen]');
          btn.disabled = true; btn.innerHTML = '<span class="spinner"></span> 生成中…';
          const ok = await regen(p, ep); // 独立入口:计费五件套+失败退费不覆盖原有理解(与拉片完成事件卡共用)
          btn.disabled = false; btn.textContent = '↻ 重新生成(-2积分)';
          if (!ok) return;
          DIMS.forEach(d => { u[d] = ep.understanding[d]; m.querySelector(`[data-ud="${d}"]`).value = ep.understanding[d]; }); // 草稿与文本域同步为新理解(再点保存即此版)
          u.time = ep.understanding.time;
        };
        m.querySelector('[data-x=cancel]').onclick = close;
        m.querySelector('[data-x=ok]').onclick = () => {
          collect();
          u.sourceRev = ep.contentRev || 0; // 十一轮:手动保存视为用户确认对应当前剧本(不再判旧)
          u.graphRev = ep.graphRev || 0;    // 手动保存同样认领当前图谱版本
          ep.understanding = u;
          Store.save(); close();
          U.toast('本集理解已保存,将注入分镜生成', 'success');
          if (ViewsEpisode) ViewsEpisode(main, p.id, ep.id);
        };
      },
    });
  }

  window.Understanding = { generate, regen, run, openEditor, toText, DIMS, chatJSONRobust };
})();
