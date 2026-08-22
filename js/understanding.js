/* ============ understanding.js AI 导演「本集理解」两阶段分镜 ============
 * Step1 本集理解(导演设定+剧本→六维理解) → Step2 分镜生成(注入理解约束)
 */
(function () {
  const DIMS = ['剧情脉络', '情绪曲线', '节奏规划', '视觉基调', '关键场面', '悬念与期待'];

  /* 带重试+修复的 JSON 调用(R1 收敛:转发到 API.chatJSONRobust,4 个调用点不动) */
  const chatJSONRobust = opt => API.chatJSONRobust(opt);

  /* 章节事件图谱:取本集结构化事件,供分镜/拆解精准调用剧情骨架 */
  window.eventsOfEpisode = function (p, ep) {
    const g = ((p && p.eventGraph) || []).find(x => x.epId === (ep && ep.id));
    if (!g || !g.events || !g.events.length) return '';
    return g.events.map((e, i) => `E${i + 1} [${e.who || '?'}@${e.where || '?'}] ${e.what || ''}${e.result ? ' → ' + e.result : ''}`).join('\n');
  };

  /* 构思定调注入(项目「构思」页保存后生效):导演阐述/美术/光影/节奏/表演压缩注入生成提示词 */
  window.conceptInject = function (p) {
    const c = (p && p.concept) || {};
    if (c.inject === false) return '';
    const parts = [];
    if (c.statement) parts.push('导演阐述:' + c.statement.slice(0, 60));
    if (c.artStyle) parts.push('美术风格:' + c.artStyle.slice(0, 40));
    if (c.lighting) parts.push('光影基调:' + c.lighting.slice(0, 30));
    if (c.editPace) parts.push('剪辑节奏:' + c.editPace.slice(0, 30));
    if (c.performance) parts.push('表演气质:' + c.performance.slice(0, 30));
    return parts.length ? '。构思定调:' + parts.join(';') : '';
  };

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
        system: '你是资深短剧导演。',
        billingAction: bAction || 'llm.understanding', operationId: opId, step,
        user: `基于导演风格与本集剧本,生成本集导演理解,返回 JSON:
{"剧情脉络":"1-3句","情绪曲线":"1-3句","节奏规划":"1-3句","视觉基调":"1-3句","关键场面":"1-3句","悬念与期待":"2-4条,本集应埋的悬念点与观众期待感设计(如信息延迟揭露、结尾钩子、反转伏笔),用分号分隔"}
${dsText ? '已确认的全局导演设定:\n' + dsText : '(未设置全局导演风格,按项目风格理解)'}
项目风格:${styleOf(p)}
本集剧本(前 6000 字):
${(ep.content || '').slice(0, 6000)}`,
        temperature: 0.5, max_tokens: 1500,
      });
      if (!out || !out.剧情脉络) throw new Error('返回结构不完整');
      const u = {};
      DIMS.forEach(d => u[d] = String(out[d] || ''));
      u.time = Store.now();
      return u;
    } catch (e) {
      U.toast('本集理解生成失败:' + e.message + ',已按风格生成默认理解', 'error', 3200);
      const u = {
        剧情脉络: `围绕「${ep.title}」主线矛盾展开,开场建立冲突,中段升级,结尾留钩子。`,
        情绪曲线: '由平静铺垫到冲突爆发,情绪逐镜抬升,高潮后短暂回落留白。',
        节奏规划: '前 1/3 建置节奏稍缓,中段加快剪辑密度,高潮一镜到底,收尾放缓。',
        视觉基调: `${styleOf(p)}风格,光影随情绪明暗变化,主体突出、背景虚化。`,
        关键场面: '核心对峙场面与情绪反转点,需给到特写与长时间停留。',
        悬念与期待: '关键信息延迟揭露,中段埋一处反转伏笔;结尾留核心悬念钩子,强化观众追更期待。',
        time: Store.now(),
        fallback: true, // 标记默认模板(重生成处据此退费置失败,不算假成功)
      };
      return u;
    }
  }
  function DIMS_DIR(ds) {
    const dims = window.DIR_DIMS || ['光影', '色调', '情感氛围', '服化道审美', '表演气质']; // R15 引用 gsettings 收敛来源
    return dims.filter(d => ds[d]).map(d => `${d}:${ds[d]}`).join('\n');
  }
  function toText(u) {
    if (!u) return '';
    return DIMS.filter(d => u[d]).map(d => `【${d}】${u[d]}`).join('\n');
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
          const tk = Tasks.start({ type: '本集理解', model: '重生成', target: ep.title, cost: 2, projectId: p.id, episodeId: ep.id });
          if (!U.charge(2, '重新生成本集理解(' + ep.title + ')', tk.id)) { Tasks.fail(tk, '积分不足'); return; }
          const btn = m.querySelector('[data-x=regen]');
          btn.disabled = true; btn.innerHTML = '<span class="spinner"></span> 生成中…';
          const nu = await generate(p, ep, tk.id);
          btn.disabled = false; btn.textContent = '↻ 重新生成(-2积分)';
          if (nu.fallback) { // 生成失败(回退默认模板):退费置失败,不覆盖原有理解
            U.refund(2, '重新生成本集理解失败退费(' + ep.title + ')', tk.id);
            Tasks.fail(tk, '生成失败,已退费');
            U.toast('本集理解重新生成失败,已退费,原有理解保留', 'error', 3200);
            return;
          }
          Tasks.done(tk);
          DIMS.forEach(d => { u[d] = nu[d]; m.querySelector(`[data-ud="${d}"]`).value = nu[d]; });
          u.time = nu.time;
          u.sourceRev = ep.contentRev || 0; // 十一轮:重生成成功刷 sourceRev(否则迁移旧数据被判旧后永不过期)
          ep.understanding = u;
          Store.save();
          U.toast('本集理解已重新生成', 'success');
        };
        m.querySelector('[data-x=cancel]').onclick = close;
        m.querySelector('[data-x=ok]').onclick = () => {
          collect();
          u.sourceRev = ep.contentRev || 0; // 十一轮:手动保存视为用户确认对应当前剧本(不再判旧)
          ep.understanding = u;
          Store.save(); close();
          U.toast('本集理解已保存,将注入分镜生成', 'success');
          if (ViewsEpisode) ViewsEpisode(main, p.id, ep.id);
        };
      },
    });
  }

  window.Understanding = { generate, run, openEditor, toText, DIMS, chatJSONRobust };
})();
