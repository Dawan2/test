/* ============ review.js 一键审片(单镜/整集) ============
 * 输入:分镜剧情/旁白/台词/提示词/运镜/机位/出场主体(+有图时视觉模型连图审)
 * 输出:三层维度(技术层/匹配层/导演层)结构化报告 + Prompt 级修复建议
 * LLM 优先,失败回退本地模拟评分。
 */
(function () {
  const DIMS = [
    ['technical', '技术层', '画质质感、纹理还原度、物理结构合理性、有无穿模'],
    ['matching', '匹配层', '与 Prompt 的一致性:场景氛围、人物出场时间线、核心动作是否兑现'],
    ['directing', '导演层', '运镜构图电影感、氛围、景别是否符合 Prompt 要求'],
  ];
  const ISSUE_TYPES = ['时间线错乱/穿帮', '角色情绪/动作不符', '运镜/景别偏差', '主体一致性偏差', '画面质感不足'];
  const EN_FIXES = ["'Empty background initially'", "'Telephoto lens, shallow depth of field'", "'consistent character appearance'", "'soft cinematic lighting'", "'slow push-in camera movement'", "'background characters blurry'"];

  const fmt = s => String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(Math.floor(s % 60)).padStart(2, '0');
  // 分镜在全集中的时间码区间(按 duration 累计)
  function shotTimeRange(ep, s) {
    let start = 0;
    for (const x of ep.shots) { if (x.id === s.id) break; start += (window.SB && SB.estShotDuration ? SB.estShotDuration(x) : (x.duration || 5)); }
    return fmt(start) + ' - ' + fmt(start + (window.SB && SB.estShotDuration ? SB.estShotDuration(s) : (s.duration || 5)));
  }

  /* ================= 评审调用 ================= */
  /* 二十一轮:单镜评审提示词拼装下沉 wf-core.js(双端单一来源,逐字节一致);
   * 环境差异经 ctx 注入(知识库口径/评审模板/导演设定/风格串均同原内联表达式) */
  function buildReviewPrompt(p, ep, s, hasImage) {
    return WfCore.buildReviewPrompt(p, ep, s, hasImage, {
      kbReviewText: (window.KB && KB.reviewBlock) ? KB.reviewBlock() : '',
      tplReviewText: (window.getSettings && getSettings().tplReview) || '',
      directorNote: window.directorInject ? directorInject(p.style) : '',
      // 生效专家方法论(成片板块雇佣 > 全局雇佣):与服务端 /api/wf/smart-review 同一装配口
      personaNote: window.personaNoteFor ? personaNoteFor(p, WfCore.WF_BOARD['smart-review']) : '',
      memText: WfCore.memBlock(Store.state.agentMemory, s.plot || '', '成片'), // 协作记忆按板块召回(与对话层同算法)
      styleText: styleOf(p),
    });
  }

  /* 报告规整(二十一轮:下沉 wf-core.js;uid/now 经 ctx 注入) */
  function normalizeReport(raw, p, ep, s, model, mode) {
    return WfCore.normalizeReport(raw, p, ep, s, model, mode, { uid: Store.uid, now: Store.now });
  }

  async function llmReviewShot(p, ep, s, opId) {
    // 视觉评审画面优先取当前视频首帧(与被审对象同源);无真实视频再回退分镜图,防审到旧图
    let img = (Store.shotVideoReady(s) && s.video.frame) || s.image;
    // 真实生图是服务端 /uploads/ 路径,视觉模型需 base64 dataURL:先取回转码,失败回退纯文本评审
    if (img && String(img).startsWith('/uploads/')) {
      try {
        const res = await fetch(img);
        if (!res.ok) throw new Error('取图失败(' + res.status + ')');
        const blob = await res.blob();
        img = await new Promise((resolve, reject) => {
          const fr = new FileReader();
          fr.onload = () => resolve(fr.result);
          fr.onerror = () => reject(new Error('图片转 base64 失败'));
          fr.readAsDataURL(blob);
        });
      } catch (e) {
        U.toast('审片画面取回转码失败,本次回退纯文本评审:' + e.message, 'info', 3000);
        img = null;
      }
    }
    const useVision = !!img && String(img).startsWith('data:');
    const text = buildReviewPrompt(p, ep, s, useVision);
    if (!useVision) {
      const model = API.getConfig().model || 'qwen-turbo';
      const raw = await API.chatJSON({
        model, messages: [{ role: 'user', content: text }], temperature: 0.3, max_tokens: 2500,
        system: Prompts.get('review.system'),
        billingAction: 'llm.review', operationId: opId, // 服务端白名单计费(整集免单镜时同 operation 幂等)
      });
      return normalizeReport(raw, p, ep, s, model, 'text');
    }
    // 视觉模型按优先级逐个尝试(上游某模型 502/不可用时自动切换)
    const VISION_MODELS = ['qwen2.5-vl-72b-instruct', 'doubao-1.5-vision-pro', 'qwen-vl-max-2025-01-25'];
    let lastErr = null;
    for (const model of VISION_MODELS) {
      try {
        const raw = await API.chatJSON({
          model,
          messages: [{ role: 'user', content: [{ type: 'text', text }, { type: 'image_url', image_url: { url: img } }] }],
          temperature: 0.3, max_tokens: 2500,
          system: Prompts.get('review.system'),
          billingAction: 'llm.review', operationId: opId,
        });
        return normalizeReport(raw, p, ep, s, model, 'vision');
      } catch (e) { lastErr = e; }
    }
    throw lastErr || new Error('视觉模型均不可用');
  }

  /* ---- 镜级方法论校验命中(只读消费) ----
   * 跑已落地的剧本面/主体面校验项(js/skills.js 的 Skills.check,纯本地零 LLM 零计费),
   * 只取 hits 带本镜 shotId 的命中——集级结论(开篇钩子/打脸四步/整集字幕)归就绪检查与问题中心,本层不重复报。
   * 结论只报不拦:作为报告的独立字段,既不并入 issues(不参与达标线/重抽/批量优化判定)、
   * 不改三维评分与整集四维口径,也不进 Domain 阻塞项与发布门计数。 */
  function shotChecks(p, s) {
    if (!window.Skills || !p || !s) return [];
    return Skills.check('script', { p, s }).concat(Skills.check('subjects', { p, s }))
      .map(x => ({ id: x.id, skill: x.skill, level: x.level, hits: (x.hits || []).filter(h => h.shotId === s.id) }))
      .filter(x => x.hits.length);
  }
  /* 命中展示文案:判据一律在校验项里,本层只把 hits 译成人话(不写第二份口径) */
  const CHECK_TXT = {
    'long-line': h => `台词单句 ${h.len} 字超上限:「${h.name}…」`,
    'unknown-subject': h => `引用「${h.name}」在主体库解析不到`,
    'no-ref-image': h => `主体「${h.name}」无真实参考图,生成时不进参考图组`,
    'no-subject-ref': () => '本镜未引用任何主体,无形象锁定(易换脸)',
  };
  const checkLine = h => (CHECK_TXT[h.code] ? CHECK_TXT[h.code](h) : h.code + (h.name ? `「${h.name}」` : ''));
  const checkName = c => (window.Skills && (Skills.byId(c.skill) || {}).name) || c.skill;

  /* ---- 本地模拟评审(回退) ---- */
  function localReview(p, ep, s) {
    let h = 0;
    const seed = s.id + (s.prompt || '');
    for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
    const rnd = () => { h = (h * 1664525 + 1013904223) >>> 0; return h / 4294967296; };
    const sc = () => Math.round((6.2 + rnd() * 3.2) * 10) / 10;
    const report = {
      technical: {
        score: sc(),
        comment: `画面质感整体稳定,「${(s.scene || '主场景')}」的场景还原度较好;${(s.characters || [])[0] || '主体'}轮廓结构合理,未见明显穿模。局部纹理细节(材质边缘)有轻微涂抹感。`,
        suggestion: '在 Prompt 中补充材质限定词,增强纹理还原;保持主体结构描述稳定。',
      },
      matching: {
        score: sc(),
        comment: `核心剧情「${(s.plot || '').slice(0, 20)}…」基本兑现;场景氛围与 Prompt 一致。${(s.characters || []).length > 1 ? '多角色同框时出场时间线略显拥挤,存在"大合影"式堆叠风险。' : '人物出场节奏正常,核心动作已呈现。'}`,
        suggestion: '强化时间轴控制词,按 Prompt 设定的节点依次入场,避免元素同时堆积。',
      },
      directing: {
        score: sc(),
        comment: `${s.camera}运镜与${s.cameraSpec ? CAMERA.describe(s.cameraSpec) : '默认机位'}搭配具备电影感;景别选择贴合剧情情绪。背景层次感可进一步加强。`,
        suggestion: '可增加浅景深与长焦压缩描述,突出主体、虚化背景干扰。',
      },
    };
    const avg = Math.round(((report.technical.score + report.matching.score + report.directing.score) / 3) * 10) / 10;
    const issues = rnd() > 0.4 ? [{
      timeRange: shotTimeRange(ep, s),
      type: ISSUE_TYPES[Math.floor(rnd() * 3)],
      severity: '轻微',
      analysis: '本地启发式抽检发现画面与 Prompt 存在局部偏差(离线模拟评审,仅供参考)。',
      suggestion: '在 Prompt 中加入 ' + EN_FIXES[Math.floor(rnd() * EN_FIXES.length)] + ' 修正词后重新生成。',
    }] : [];
    // 拆解规则硬检查(离线同样生效):单镜台词超 40 字未拆镜
    if ((s.dialogue || '').length > 40) {
      issues.unshift({
        timeRange: shotTimeRange(ep, s),
        type: '运镜/景别偏差',
        severity: '严重',
        analysis: `本镜台词 ${(s.dialogue || '').length} 字,超过 40 字上限仍挤在单镜,节奏会拖沓。`,
        suggestion: '按"一镜一信息点"拆成多个分镜:长台词按语义断句拆镜,交替给说话人近景与听者反应镜头。',
      });
    }
    // KB 景别衔接检查:与上一镜同级/相邻(无递进)或两极对切(缺过渡)记轻微问题;
    // 级差经 WfCore.sizeGap 取自 wf-core.js 景别阶梯(词表单源),六档全覆盖,-1=任一端不在阶梯上不判定
    const shotIdx = (ep.shots || []).findIndex(x => x.id === s.id);
    const prevShot = shotIdx > 0 ? ep.shots[shotIdx - 1] : null;
    const curSize = (s.cameraSpec || {}).shotSize, prevSize = (prevShot && prevShot.cameraSpec || {}).shotSize;
    const gap = WfCore.sizeGap(prevSize, curSize);
    if (gap >= 0 && (gap <= 1 || gap >= 4)) {
      issues.push({
        timeRange: shotTimeRange(ep, s),
        type: '运镜/景别偏差',
        severity: '轻微',
        analysis: gap >= 4 ? `与上一镜两极对切(${prevSize}→${curSize}),缺少中景过渡,衔接生硬。`
          : gap === 0 ? `与上一镜景别相同(${curSize}),无递进变化,视觉节奏平。`
          : `与上一镜景别相邻(${prevSize}→${curSize}),隔一级切换更有递进感。`,
        suggestion: gap >= 4 ? '在两镜之间补一个中景过渡镜,或把本镜景别调为中景。' : '按"全景→中景→近景→特写"路径调整景别,优先隔一级切换。',
      });
    }
    // KB 抽卡军规检查:提示词缺"稳定/不变形"类约束词,记轻微问题
    if (!/稳定|不变形|不僵硬|结构正常/.test(s.prompt || '')) {
      issues.push({
        timeRange: shotTimeRange(ep, s),
        type: '主体一致性偏差',
        severity: '轻微',
        analysis: '提示词缺少"五官稳定不变形/人体结构正常/动作不僵硬"类稳定约束词,抽卡崩坏风险偏高。',
        suggestion: "在 Prompt 末尾追加稳定约束词,如 'consistent character appearance, stable facial features'(五官清晰稳定不变形、人体结构正常)。",
      });
    }
    return {
      id: Store.uid('rv'), shotId: s.id, time: Store.now(), model: '本地模拟评审', mode: 'local',
      score: avg, dimensions: report, issues, optimized: false,
    };
  }

  /* ---- 单镜审片入口(扣 2 积分) ----
   * 版本绑定(2026-08 六轮):报告记录审片时的 videoInputHash/videoUrl,镜头重新生成后旧报告标"旧版"不再冒充最近审片 */
  async function reviewShot(p, ep, s, opt) {
    opt = opt || {};
    /* 十六轮:视频生成中的分镜直接拦截(扣费前)——画面未定型,审出来的报告绑定空 inputHash,
     * 视频落片瞬间即判旧版,等于花钱买过时报告;整集审片路径已在 openEpisodeReview 预过滤,不会走到这 */
    if (!opt.free && s.video && s.video.status === 'generating') {
      U.toast(`镜头${s.order + 1} 视频仍在生成中,请生成完成后再审片`, 'error', 3000);
      return null;
    }
    const tk = Tasks.start({ type: '一键审片', model: API.isReady() ? '审片LLM' : '本地模拟评审', target: `${ep.title}·镜头${s.order + 1}`, cost: opt.free ? 0 : COST.review, projectId: p.id, episodeId: ep.id, shotId: s.id });
    if (!opt.free) {
      if (!U.charge(COST.review, `一键审片:镜头${s.order + 1}`, tk.id)) { Tasks.fail(tk, '积分不足'); return null; }
    }
    let report;
    const llmTried = API.isReady(); // 离线直接走本地回退(不算"失败",与单镜扣费口径一致);在线才走真实调用
    try {
      if (!llmTried) throw new Error('LLM 未配置或未登录后端');
      U.toast('审片模型评审中…', 'info', 1500);
      report = await llmReviewShot(p, ep, s, tk.id);
    } catch (e) {
      // 回退本地模拟仍会产出可用报告:任务不再标失败(原语义"付了钱拿到报告却显示红色失败"自相矛盾),
      // 改为完成后在 reason 注明回退来源,对账口径一致
      U.toast(llmTried ? 'LLM 审片失败:' + e.message + ',已回退本地模拟评审(该镜已退费)' : '离线模式,本地模拟评审', llmTried ? 'error' : 'info', 3500);
      report = localReview(p, ep, s);
      tk.reason = llmTried ? 'LLM 失败,已回退本地模拟评审(该镜已退费)' : '离线本地模拟评审';
      /* 九轮:在线失败时服务端该次调用已按未交付退费——本地预扣同步核减同一 operation,两端一致:
       * free 模式(整集预扣)经回调核减整集任务;单镜自扣模式此前漏退(八轮只处理了 free),补齐 */
      if (llmTried && opt.free && opt.onLLMFail) try { opt.onLLMFail(); } catch (_) {}
      else if (llmTried && !opt.free) Tasks.partialRefund(tk, 1, COST.review, 'LLM 审片失败回退本地,该镜退费', tk.id);
    }
    s.reviews = s.reviews || [];
    // 版本绑定:记录审片时的视频输入指纹/地址,镜头重新生成后旧报告可识别为"旧版"
    report.videoInputHash = (s.video && s.video.inputHash) || '';
    report.videoUrl = (s.video && s.video.url) || '';
    report.reviewedAt = Date.now();
    // 审片时的方法论校验命中(只读消费,LLM 与离线本地评审同附):独立字段,不并入 issues、不参与评分与达标线
    report.checks = shotChecks(p, s);
    s.reviews.unshift(report);
    s.reviews = s.reviews.slice(0, 5);
    s.history = s.history || [];
    s.history.unshift({ type: '审片 ' + report.score + ' 分', model: report.model, time: report.time });
    Store.save();
    if (tk.status === 'running') Tasks.done(tk);
    return report;
  }

  /* ================= 报告弹窗(对齐截图版式) ================= */
  const chipCls = v => v >= 8 ? '' : v >= 6 ? 'mid' : 'low';

  function reportModalHTML(p, ep, s, r) {
    const epIdx = (p.episodes || []).findIndex(e => e.id === ep.id) + 1;
    const modeName = { vision: '视觉模型连图审', text: '文本模型', local: '本地模拟' }[r.mode] || r.mode;
    return `
    <div class="rv-head">
      <div>
        <div class="rv-score-label">审核得分</div>
        <div class="rv-score">${r.score.toFixed(1)} <small>/ 10</small></div>
        <div class="hint" style="margin-top:4px">视频 #${epIdx}-${s.order + 1} · 审片结果预览 · ${U.esc(r.time)}<span class="rv-mode">${modeName} · ${U.esc(r.model)}</span>${r.optimized ? '<span class="tag green" style="margin-left:6px">已一键优化</span>' : ''}</div>
      </div>
      <div class="rv-chips">
        ${DIMS.map(([k, name]) => `<span class="rv-chip ${chipCls(r.dimensions[k].score)}">${name} ${r.dimensions[k].score.toFixed(1)}</span>`).join('')}
      </div>
    </div>
    <div class="rv-cols">
      ${DIMS.map(([k, name]) => `
      <div class="rv-col">
        <h4>${name} <span class="tag ${chipCls(r.dimensions[k].score) === 'low' ? 'red' : chipCls(r.dimensions[k].score) === 'mid' ? 'yellow' : 'green'}">${r.dimensions[k].score.toFixed(1)}</span></h4>
        <p>${U.esc(r.dimensions[k].comment)}</p>
        <div class="sg"><b>建议:</b>${U.esc(r.dimensions[k].suggestion)}</div>
      </div>`).join('')}
    </div>
    <div class="rv-issues">
      <b>关键问题定位</b>
      ${r.issues.length ? `
      <table class="tbl" style="margin-top:8px">
        <thead><tr><th style="width:110px">时间段</th><th style="width:130px">问题类型</th><th>分析</th><th>建议</th></tr></thead>
        <tbody>${r.issues.map(it => `<tr>
          <td class="muted">${U.esc(it.timeRange)}</td>
          <td><span class="tag ${it.severity === '严重' ? 'red' : 'yellow'}">${it.severity === '严重' ? '🔴 ' : ''}${U.esc(it.type)}</span></td>
          <td>${U.esc(it.analysis)}</td>
          <td>${U.esc(it.suggestion)}</td></tr>`).join('')}
        </tbody>
      </table>` : '<div class="hint" style="margin-top:8px">✓ 未发现关键问题,该分镜质量达标。</div>'}
    </div>
    ${r.checks.length ? `
    <div class="rv-issues" style="margin-top:14px">
      <b>方法论校验命中</b><span class="small muted">(知识库判据本地校验,零积分;只提醒不拦生成,不计入上方评分)</span>
      <table class="tbl" style="margin-top:8px">
        <thead><tr><th style="width:180px">校验项</th><th style="width:70px">级别</th><th>命中</th></tr></thead>
        <tbody>${r.checks.map(c => `<tr>
          <td class="small">${U.esc(checkName(c))}</td>
          <td><span class="tag ${c.level === 'fail' ? 'red' : 'yellow'}">${c.level === 'fail' ? '需修正' : '提醒'}</span></td>
          <td class="small">${c.hits.map(h => U.esc(checkLine(h))).join(';')}</td></tr>`).join('')}
        </tbody>
      </table>
    </div>` : ''}`;
  }

  /* 评审记录结构兜底:旧/外部数据可能缺 dimensions/issues 字段,读取处统一规整,防 undefined 崩溃 */
  function normReview(r) {
    r = r || {};
    const dims = {};
    DIMS.forEach(([k]) => {
      const d = (r.dimensions && r.dimensions[k]) || {};
      dims[k] = { score: +d.score || 0, comment: String(d.comment || ''), suggestion: String(d.suggestion || '') };
    });
    return Object.assign({}, r, {
      score: +r.score || 0, dimensions: dims,
      issues: Array.isArray(r.issues) ? r.issues : [],
      checks: Array.isArray(r.checks) ? r.checks : [], // 旧报告无校验命中字段:按空处理,不回补(不冒充当时的结论)
      time: r.time || '', model: r.model || '',
    });
  }

  function openReport(p, ep, s, main, existing) {
    (async () => {
      let r = existing;
      if (!r) {
        r = await reviewShot(p, ep, s);
        if (!r) return;
        if (main) renderShotsRef(main, p, ep);
      }
      r = normReview(r);
      const canRevise = r.issues.length && r.score < 7; // 达标(≥7)或无问题时不给重抽入口
      U.openModal({
        title: '一键审片报告预览',
        xl: true,
        body: reportModalHTML(p, ep, s, r),
        footer: `
          <button class="btn" data-x="export">⬇ 导出报告</button>
          <button class="btn" data-x="close">关闭</button>
          <button class="btn" data-x="opt">✨ 一键优化(-${COST.optimize}积分)</button>
          ${canRevise ? `<button class="btn primary" data-x="revise">✨ 按意见修订并重抽(-${COST.optimize + COST.video}积分)</button>` : ''}`,
        onMount(m, close) {
          m.querySelector('[data-x=close]').onclick = close;
          m.querySelector('[data-x=export]').onclick = () => exportReport(p, ep, s, r);
          m.querySelector('[data-x=opt]').onclick = () => { close(); optimizeShot(p, ep, s, r, main); };
          const reviseBtn = m.querySelector('[data-x=revise]');
          if (reviseBtn) reviseBtn.onclick = () => { close(); reviseAndRegen(p, ep, s, r, main); };
        },
      });
    })();
  }

  /* 审片闭环:先把 issues 建议落到提示词(optimizeShot 自动写入),确认视频费用后重抽本镜;
   * 生成失败/积分不足由 batchGenVideos 逐镜扣费与退费逻辑处理 */
  async function reviseAndRegen(p, ep, s, r, main) {
    const ok = await optimizeShot(p, ep, s, r, main, true);
    if (!ok) return; // 优化未执行(如积分不足),不重抽
    const doGen = () => window.SB.batchGenVideos(p, ep, main, [s], { skipConfirmGate: true }); // 用户刚确认过,不再弹镜头确认闸
    U.confirm(`提示词已按审片意见修订,重新生成本镜视频将消耗 ${COST.video} 积分(生成失败自动退费)。开始重抽吗?`, () => {
      if (window.HumanReview) return HumanReview.guard(HumanReview.shotImageUrls(p, s), doGen); // 与其他生成入口一致的真人素材预审
      doGen();
    }, '✨ 重抽');
  }

  function exportReport(p, ep, s, r) {
    const lines = [
      '一键审片报告 · 虎鲸漫剧', '='.repeat(40),
      `项目:${p.name} · 分集:${ep.title} · 镜头:${s.order + 1}`,
      `审核得分:${r.score.toFixed(1)} / 10(${r.model} · ${r.time})`, '',
      ...DIMS.map(([k, name]) => `【${name} ${r.dimensions[k].score.toFixed(1)}】\n评语:${r.dimensions[k].comment}\n建议:${r.dimensions[k].suggestion}\n`),
      '关键问题定位:',
      ...(r.issues.length ? r.issues.map(it => `- [${it.timeRange}] ${it.type}\n  分析:${it.analysis}\n  建议:${it.suggestion}`) : ['无']),
      '', '方法论校验命中(本地判据,只提醒不拦生成,不计入评分):',
      ...(r.checks.length ? r.checks.map(c => `- ${checkName(c)}(${c.level})\n  ${c.hits.map(checkLine).join(';')}`) : ['无']),
    ].join('\n');
    U.downloadText(`审片报告_${p.name}_${ep.title}_镜头${s.order + 1}.txt`, lines);
    U.toast('报告已导出', 'success');
  }

  /* ================= 一键优化(前后对比,确认后写入) ================= */
  async function optimizeShot(p, ep, s, r, main, autoApply) {
    const tk = Tasks.start({ type: '一键优化', model: API.isReady() ? '优化LLM' : '本地规则', target: `${ep.title}·镜头${s.order + 1}`, cost: COST.optimize, projectId: p.id, episodeId: ep.id, shotId: s.id });
    if (!U.charge(COST.optimize, `一键优化:镜头${s.order + 1}`, tk.id)) { Tasks.fail(tk, '积分不足'); return false; }
    const fixes = WfCore.reviewFixes(r); // 修正意见抽取与重写模板下沉 wf-core.js(CLI produce 修订重抽同源)
    let newPrompt = '', changes = '';
    try {
      if (!API.isReady()) throw new Error('LLM 未配置');
      const out = await API.chatJSON({
        system: WfCore.optimizeSystem(), // 人设句走注册表单源(js/wf-core.js),与 CLI 修订重抽同字面
        messages: [{ role: 'user', content: WfCore.buildOptimizeUser(styleOf(p), s.prompt, fixes) }],
        temperature: 0.6, max_tokens: 900,
        billingAction: 'llm.optimize', operationId: tk.id,
      });
      if (!out || !out.prompt) throw new Error('LLM 返回为空');
      newPrompt = String(out.prompt);
      changes = String(out.changes || '已按审片意见修订');
    } catch (e) {
      Tasks.fail(tk, 'LLM 优化失败,已回退本地规则:' + e.message);
      U.toast('LLM 优化失败:' + e.message + ',已回退本地规则优化', 'error', 3200);
      newPrompt = WfCore.localOptimizedPrompt(s.prompt, fixes);
      changes = '本地规则:追加审片建议修正词';
    }
    if (tk.status === 'running') Tasks.done(tk);
    const apply = () => {
      Store.setShotPrompt(s, newPrompt);
      r.optimized = true;
      s.history = s.history || [];
      s.history.unshift({ type: '一键优化', model: '审片优化', time: Store.now() });
      Store.save();
      if (main) renderShotsRef(main, p, ep);
      U.toast('提示词已优化并写入', 'success');
    };
    if (autoApply) { apply(); return true; }
    let confirmed = false; // 豁免标记:确认写入后关闭不再退费
    U.openModal({
      title: '✨ 一键优化 · 提示词对比确认',
      wide: true,
      maskClose: false, // 禁遮罩关闭,✕ 与「放弃」统一走 onClose 退费
      body: `
      <div class="hint" style="margin-bottom:10px">${U.esc(changes)}(依据 ${r.issues.length} 条关键问题建议)</div>
      <div class="rv-compare">
        <div class="box"><h5 class="muted">优化前</h5>${U.esc(s.prompt)}</div>
        <div class="box" style="border-color:rgba(52,211,153,.4)"><h5 style="color:var(--green)">优化后</h5>${U.esc(newPrompt)}</div>
      </div>`,
      footer: `<button class="btn" data-x="no">放弃</button><button class="btn primary" data-x="yes">确认写入</button>`,
      onClose() {
        /* 十轮:放弃优化不再退款——LLM 已成功返回优化结果(服务端 operation 已交付),优化建议
         * 文本已在弹窗完整展示,用户放弃只是选择不应用;此前本地退款无 operationId,服务端余额
         * 不变,下次同步还会把本地余额改回(两端漂移)。交付边界 = 服务端成功返回业务结果 */
        if (confirmed) return;
        U.toast('已放弃应用(优化建议已生成,不再退费)', 'info');
      },
      onMount(m, close) {
        m.querySelector('[data-x=no]').onclick = close;
        m.querySelector('[data-x=yes]').onclick = () => { confirmed = true; close(); apply(); };
      },
    });
    return true;
  }

  /* ================= 整集四维成片评审(镜头语言/衔接/景别/节奏) ================= */
  const CUT_DIMS = [
    ['natural', '镜头语言自然度', '运镜是否像真人摄影师拍摄,有无乱抖/鬼畜/毫无道理的旋转'],
    ['continuity', '衔接流畅度', '镜头切换时人物动作、位置、服装是否连贯,有无瞬移/突变(AI 视频最常见崩坏)'],
    ['framing', '景别合理性', '该拍脸时拍脸、对峙给中景、情绪给特写,有无乱切大全景'],
    ['pacing', '剪辑节奏适配', '镜头切换快慢是否匹配剧情情绪:冲突快切(1-2秒/镜)、抒情慢切(3-5秒/镜)'],
  ];
  /* ---- 审片版本判定(九轮强化):正向证明才有效 ----
   * 单镜报告:报告指纹与当前视频指纹都存在且一致、且视频 URL 未变才算"当前"——URL 变化
   * (超分/字幕擦除等后处理替换 URL 但保留原 inputHash,九轮补:此前这类后处理不判旧)→ 旧版。
   * 整集报告:快照哈希(镜头 ID 集顺序 + 每镜视频版本+URL)与当前不一致,或无快照(旧数据)→ 旧版;
   * 新增/删除/调序镜头、任一镜重新生成/后处理都会失配。 */
  function reportStale(s) {
    const r = (s.reviews || [])[0];
    if (!r) return false; // 无报告:不显示审片标签,无"旧版"语义
    if (!r.videoInputHash) return true; // 旧数据无指纹:无法证明仍对应当前视频
    if (!s.video || s.video.status !== 'done') return true; // 当前视频不存在(被删/重置):报告对象缺失
    if (!s.video.inputHash) return true;
    if (r.videoInputHash !== s.video.inputHash) return true;
    return (r.videoUrl || '') !== ((s.video && s.video.url) || ''); // URL 变化=审的是后处理前的旧视频
  }
  function reviewSnapshotHashOf(ep) {
    return WfCore.reviewSnapshotHashOf(ep); // 二十一轮:快照哈希下沉 wf-core.js(服务端写 lastReview 与浏览器同函数字面)
  }
  function episodeReviewStale(ep) {
    const lr = ep && ep.lastReview;
    if (!lr) return false;
    if (!lr.snapshotHash) return true; // 旧数据无快照:判旧
    return lr.snapshotHash !== reviewSnapshotHashOf(ep);
  }

  async function reviewEpisodeCut(p, ep, reports, opId, onLLMFail) {
    const brief = WfCore.buildCutBrief(ep, reports); // 二十一轮:brief 构造下沉 wf-core.js(时长经 Domain.estShotDuration 双端同口径)
    const fallback = () => {
      const avg = reports.reduce((a, x) => a + x.report.score, 0) / Math.max(1, reports.length);
      const sizes = new Set(reports.map(x => (x.shot.cameraSpec || {}).shotSize));
      const c = v => Math.round(Math.max(5.5, Math.min(9.5, v)) * 10) / 10;
      return {
        natural: { score: c(avg), comment: '运镜整体平稳(本地启发式评估),个别镜头运动幅度可再收敛。' },
        continuity: { score: c(avg - 0.3), comment: '相邻镜头主体位置与动作总体连贯,建议保持尾帧继承以进一步稳定衔接。' },
        framing: { score: c(avg + (sizes.size >= 3 ? 0.4 : -0.5)), comment: sizes.size >= 3 ? `景别有递进变化(使用了 ${sizes.size} 种景别),符合拆分原则。` : '景别单一,建议按"全景→中景→近景→特写"路径增加变化。' },
        pacing: { score: c(avg), comment: '镜头时长与情绪节奏总体匹配;冲突段落可加快切换,抒情段落适当延长。' },
        overall: '本地启发式四维评估(离线),仅供参考。',
      };
    };
    const cutTried = API.isReady(); // 离线直接走本地四维评估(不退费);在线才走真实调用
    try {
      if (!cutTried) throw new Error('LLM 未配置');
      const out = await API.chatJSON({
        system: Prompts.get('review.finalSystem'),
        messages: [{ role: 'user', content: WfCore.buildCutUser(brief) }], // 二十一轮:user 模板下沉 wf-core.js
        temperature: 0.3, max_tokens: 1500,
        billingAction: 'llm.review', operationId: opId,
      });
      return WfCore.normalizeCut(out); // 二十一轮:四维规整下沉 wf-core.js(本地启发式 fallback 保留在下方)
    } catch (e) {
      // 八轮:在线失败回退本地四维评估——服务端该步已按次退费,回调让本地预扣同步核减;离线跳过不退
      if (cutTried && onLLMFail) try { onLLMFail(); } catch (_) {}
      return fallback();
    }
  }

  /* ================= 整集审片 ================= */
  async function openEpisodeReview(p, ep, main) {
    /* 十六轮:生成中的分镜预过滤——画面未定型,审出来落片即旧版;费用按可审镜数计,如实提示跳过数 */
    const all = ep.shots || [];
    const shots = all.filter(s => !(s.video && s.video.status === 'generating'));
    const skipped = all.length - shots.length;
    if (!all.length) return U.toast('暂无分镜可审片', 'error');
    if (!shots.length) return U.toast(`${skipped} 个分镜视频均在生成中,请生成完成后再整集审片`, 'error', 3200);
    if (skipped) U.toast(`已跳过 ${skipped} 个仍在生成中的分镜(费用按可审的 ${shots.length} 镜计)`, 'info', 3000);
    // 并发守卫:整集审片全局只允许一个在飞(任务句柄为闭包局部,防串号;__epReviewEpId 供删除/覆盖拦截)
    if (window.__epReviewEpId) return U.toast('已有整集审片进行中,请等待完成或先取消后再发起', 'error');
    const cost = (shots.length + 2) * COST.review; // N 镜逐镜评审 + 1 次共性汇总 + 1 次四维成片评审(服务端按次白名单计费,总额一致)
    const tk = Tasks.start({ type: '整集审片', model: '审片LLM', target: ep.title, cost, projectId: p.id, episodeId: ep.id });
    if (!U.charge(cost, `整集审片:${ep.title}×${shots.length}`)) { Tasks.fail(tk, '积分不足'); return; }
    window.__epReviewEpId = ep.id;

    // 非模态:进度走右侧后台侧边栏(可最小化),✕ 中止并按未交付步骤退费
    let cancelled = false;
    /* 九轮:每步显式状态机 pending|done|refunded 替换八轮的 sumDone/cutDone 布尔——
     * 步骤失败已退款后,随后的取消不再重复计该步(八轮布尔会把已退款步骤又算进未完成再退一次) */
    const stepStates = { sum: 'pending', cut: 'pending' };
    const refundStep = (name, opId, why) => {
      if (stepStates[name] !== 'pending') return; // 已退款/已交付:不重复退
      stepStates[name] = 'refunded';
      Tasks.partialRefund(tk, 1, COST.review, why, opId);
    };
    const dock = U.bgDock({ title: `🎬 整集审片 · ${ep.title}(${shots.length} 镜)`, onCancel: () => { cancelled = true; } });
    dock.m.querySelector('.pipe-body').insertAdjacentHTML('afterbegin', '<div class="progress" style="margin-bottom:8px"><i style="width:0%"></i></div>');
    const bar = dock.m.querySelector('.progress > i');
    const say = h => { if (!cancelled) dock.say(h); };
    if (window.Bus) Bus.emit('review.episodeStart', { p, ep, main, total: shots.length, brief: `整集审片开始(${shots.length} 镜)` }); // 事件总线:Agent 对话流订阅转译
    function finishEarly() {
      // 取消时按未交付步骤退费(九轮:N 个单镜 + 仍 pending 的共性汇总/四维评审;
      // 已交付的步骤不退、已退款的步骤不重复计)。统一走 Tasks.partialRefund:退费同时核减
      // 任务登记成本,"今日消耗"只计已交付部分
      const leftSteps = ['sum', 'cut'].filter(k => stepStates[k] === 'pending').length;
      const left = (shots.length - reports.length) + leftSteps;
      if (left > 0) Tasks.partialRefund(tk, left, COST.review, '整集审片取消');
      if (tk.status === 'running') Tasks.fail(tk, '用户中途取消');
      if (window.__epReviewEpId === ep.id) window.__epReviewEpId = null;
      U.toast(left > 0 ? `整集审片已取消,未执行的 ${left} 步积分已返还` : '整集审片已取消', 'info');
    }

    const reports = [];
    for (let i = 0; i < shots.length; i++) {
      if (cancelled) { finishEarly(); return; }
      const s = shots[i];
      say(`<span class="hi">▶ 评审镜头 ${i + 1}/${shots.length}:${U.esc((s.plot || '').slice(0, 24))}…</span>`);
      // 八轮:free 模式下该镜 LLM 失败回退本地时,服务端已按次退费,本地预扣同步核减(步骤级对齐)
      const r = await reviewShot(p, ep, s, { free: true, onLLMFail: () => Tasks.partialRefund(tk, 1, COST.review, '单镜审片LLM失败回退本地,该步退费') });
      if (r) {
        reports.push({ shot: s, report: r });
        say(`&nbsp;&nbsp;得分 <b class="${r.score >= 8 ? 'ok' : 'warn'}">${r.score.toFixed(1)}</b> · 技术${r.dimensions.technical.score.toFixed(1)} 匹配${r.dimensions.matching.score.toFixed(1)} 导演${r.dimensions.directing.score.toFixed(1)} · ${r.issues.length} 个问题(${r.mode === 'local' ? '本地模拟' : r.model})`);
      }
      bar.style.width = ((i + 1) / (shots.length + 1) * 100) + '%';
    }
    if (cancelled) { finishEarly(); return; } // 最后一镜评审途中取消也要退费置失败,否则任务永 running

    // 整集共性问题汇总(LLM 优先)
    say('<span class="hi">▶ 汇总整集共性问题…</span>');
    let common = { summary: '', issues: [] };
    const sumTried = API.isReady(); // 离线直接走本地汇总(不退费,与单镜口径一致);在线才走真实调用
    try {
      if (!sumTried) throw new Error('LLM 未配置');
      const out = await API.chatJSON({
        system: '你是短剧审片总监。',
        messages: [{ role: 'user', content: WfCore.buildSumUser(reports) }], // 二十一轮:共性汇总 user 模板下沉 wf-core.js
        temperature: 0.4, max_tokens: 1200,
        billingAction: 'llm.review', operationId: tk.id + '_sum',
      });
      common = WfCore.normalizeSum(out); // 二十一轮:汇总规整下沉 wf-core.js
      stepStates.sum = 'done';
    } catch (e) {
      const types = {};
      reports.forEach(x => x.report.issues.forEach(i => types[i.type] = (types[i.type] || 0) + 1));
      common = {
        summary: '整集节奏与主体一致性总体可控(本地汇总),建议关注反复出现的问题类型并统一修正提示词。',
        issues: Object.entries(types).slice(0, 3).map(([type, n]) => ({ type, detail: `出现于 ${n} 个分镜`, suggestion: '建议在全局设定中统一约束,逐镜复查。' })),
      };
      // 九轮:在线失败回退本地汇总——服务端该步已按未交付退费,本地预扣同步核减同一 operation;
      // 离线本地汇总即"该步交付"(按原口径计费,取消时不重复退)
      if (sumTried) refundStep('sum', tk.id + '_sum', '共性汇总LLM失败回退本地,该步退费');
      else stepStates.sum = 'done';
    }
    if (cancelled) { finishEarly(); return; } // 汇总期间取消也要走取消收尾(不再把半成品报告存为完成)
    bar.style.width = '100%';
    // 四维成片评审(镜头语言/衔接/景别/节奏)
    if (!cancelled) say('<span class="hi">▶ 四维成片评审(镜头语言/衔接/景别/节奏)…</span>');
    const cut = cancelled ? null : await reviewEpisodeCut(p, ep, reports, tk.id + '_cut', () => {
      // 九轮:在线失败回退本地四维评估——服务端该步已退费,本地预扣核减同一 operation,两端一致
      refundStep('cut', tk.id + '_cut', '四维评审LLM失败回退本地,该步退费');
    });
    if (stepStates.cut === 'pending') stepStates.cut = 'done'; // 未触发退款回调 = LLM 成功或离线本地交付
    if (cancelled) { finishEarly(); return; } // 九轮:四维评审期间取消同样走取消收尾(八轮漏:完成后仍存报告标 done)
    const avg = Math.round(reports.reduce((a, x) => a + x.report.score, 0) / Math.max(1, reports.length) * 10) / 10;
    ep.lastReview = {
      time: Store.now(), avg,
      // 八轮:快照哈希(镜头 ID 集顺序 + 每镜视频版本)——新增/删除/调序/任一镜重生成后整集报告判旧;
      // 十轮:sourceRev 记录审片时的剧本版本(剧本修改后判旧);
      // 每镜记录 报告id + 审片时的视频输入指纹,旧报告打开时按 reportId 精确恢复
      snapshotHash: reviewSnapshotHashOf(ep),
      sourceRev: ep.contentRev || 0,
      graphRev: ep.graphRev || 0, // 十二轮:事件图谱修订后整集报告判旧(图谱是拆解/分镜的剧情骨架)
      perShot: reports.map(x => ({ shotId: x.shot.id, order: x.shot.order, score: x.report.score, reportId: x.report.id, videoInputHash: x.report.videoInputHash || '' })),
      common, cut,
    };
    Store.save();
    if (tk.status === 'running') Tasks.done(tk);
    if (window.__epReviewEpId === ep.id) window.__epReviewEpId = null;
    dock.finish(`<b style="color:var(--green)">━━ 整集审片完成:均分 ${avg} ━━</b>`);
    if (window.Bus) Bus.emit('review.episodeDone', { p, ep, main, avg, brief: `整集审片完成:均分 ${avg}` }); // 事件总线:Agent 对话流事件续谈卡(低分镜清单随消息留存,对话可见)
    if (main) renderShotsRef(main, p, ep);
    openEpisodeReport(p, ep, main, reports);
  }

  /* ---- 整集报告视图 ---- */
  function openEpisodeReport(p, ep, main, reports) {
    // 八轮:按 reportId 精确恢复参与报告(不再读 s.reviews[0]——镜头重新审片后旧整集报告会混入新单镜报告);
    // 报告对象已被挤出最近 5 条时,该镜标"原报告已缺失"(得分仍按 perShot 快照展示)
    const missing = [];
    reports = reports || (ep.lastReview ? ep.lastReview.perShot.map(ps => {
      const s = ep.shots.find(x => x.id === ps.shotId);
      if (!s) return null;
      const rep = (s.reviews || []).find(r => r.id === ps.reportId);
      if (!rep) { missing.push(ps); return null; }
      return { shot: s, report: rep };
    }).filter(Boolean) : []);
    if (!reports.length || !ep.lastReview) return U.toast('暂无整集审片数据,请先执行整集审片', 'error');
    const lr = ep.lastReview;
    const epStale = episodeReviewStale(ep); // 八轮:整集报告旧版判定(快照哈希)
    const unoptimized = reports.filter(x => !x.report.optimized && x.report.issues.length);
    U.openModal({
      title: '整集审片报告 · ' + ep.title,
      xl: true,
      body: `
      <div class="rv-head">
        <div>
          <div class="rv-score-label">整集均分${epStale ? ' <span class="tag yellow" title="镜头集或任一镜视频版本在审片后已变化,该均分为旧版结论,建议重新审片">旧版</span>' : ''}</div>
          <div class="rv-score">${lr.avg.toFixed(1)} <small>/ 10</small></div>
          <div class="hint" style="margin-top:4px">${ep.title} · 共 ${reports.length + missing.length} 镜 · ${U.esc(lr.time)}</div>
        </div>
        <div class="rv-chips">
          <span class="rv-chip">优秀 ${reports.filter(x => x.report.score >= 8.5).length} 镜</span>
          <span class="rv-chip mid">良好 ${reports.filter(x => x.report.score >= 7 && x.report.score < 8.5).length} 镜</span>
          <span class="rv-chip low">待返工 ${reports.filter(x => x.report.score < 7).length} 镜</span>
        </div>
      </div>
      <div class="card" style="margin-top:14px;padding:14px">
        <b>各镜得分</b>
        ${reports.map(x => `
        <div class="rv-bar-row" data-jump="${x.shot.id}" data-rid="${x.report.id}">
          <span class="small" style="width:52px;flex:none">镜头 ${x.shot.order + 1}</span>
          <div class="rv-bar-track"><div class="rv-bar-fill ${x.report.score < 7 ? 'low' : ''}" style="width:${x.report.score * 10}%"></div></div>
          <b style="width:34px;text-align:right;color:${x.report.score >= 8 ? 'var(--green)' : x.report.score >= 7 ? 'var(--yellow)' : 'var(--red)'}">${x.report.score.toFixed(1)}</b>
        </div>`).join('')}
        ${missing.map(ps => `
        <div class="rv-bar-row" style="opacity:.55" title="原报告已被后续审片挤出最近记录,得分按当时快照展示">
          <span class="small" style="width:52px;flex:none">镜头 ${(ps.order || 0) + 1}</span>
          <div class="rv-bar-track"><div class="rv-bar-fill low" style="width:${ps.score * 10}%"></div></div>
          <b style="width:34px;text-align:right;color:var(--yellow)">${(+ps.score || 0).toFixed(1)}</b>
          <span class="small muted" style="margin-left:8px">原报告已缺失</span>
        </div>`).join('')}
        <div class="hint" style="margin-top:6px">点击某镜查看该镜完整审片报告</div>
      </div>
      <div class="card" style="margin-top:14px;padding:14px">
        <b>整集共性问题</b>
        <p class="small muted" style="margin:8px 0;line-height:1.8">${U.esc((lr.common && lr.common.summary) || '（无共性汇总）')}</p>
        ${((lr.common && lr.common.issues) || []).length ? `<table class="tbl"><thead><tr><th style="width:150px">共性问题</th><th>涉及说明</th><th>建议</th></tr></thead><tbody>
          ${lr.common.issues.map(i => `<tr><td><span class="tag yellow">${U.esc(i.type)}</span></td><td class="small">${U.esc(i.detail)}</td><td class="small">${U.esc(i.suggestion)}</td></tr>`).join('')}
        </tbody></table>` : '<div class="hint">✓ 无整集级共性问题</div>'}
      </div>
      ${lr.cut ? `
      <div class="card" style="margin-top:14px;padding:14px">
        <b>四维成片评审</b><span class="small muted">(镜头语言/衔接/景别/节奏)</span>
        <div class="rv-cols" style="margin-top:10px">
          ${CUT_DIMS.map(([k, name]) => `
          <div class="rv-col">
            <h4>${name} <span class="tag ${chipCls(lr.cut[k].score) === 'low' ? 'red' : chipCls(lr.cut[k].score) === 'mid' ? 'yellow' : 'green'}">${lr.cut[k].score.toFixed(1)}</span></h4>
            <p>${U.esc(lr.cut[k].comment)}</p>
          </div>`).join('')}
        </div>
        ${lr.cut.overall ? `<div class="hint" style="margin-top:8px">${U.esc(lr.cut.overall)}</div>` : ''}
      </div>` : ''}`,
      footer: `
        <button class="btn" data-x="export">⬇ 导出整集报告</button>
        <button class="btn" data-x="close">关闭</button>
        <button class="btn primary" data-x="batch" ${unoptimized.length ? '' : 'disabled'}>✨ 批量一键优化(${unoptimized.length} 镜,-${unoptimized.length * COST.optimize}积分)</button>`,
      onMount(m, close) {
        m.querySelector('[data-x=close]').onclick = close;
        m.querySelectorAll('[data-jump]').forEach(row => row.onclick = () => {
          const s = ep.shots.find(x => x.id === row.dataset.jump);
          // 八轮:按整集报告记录的 reportId 打开当时的报告(而非最新一条,防"重新审片后旧整集报告混入新结论")
          const rep = s && (s.reviews || []).find(r => r.id === row.dataset.rid);
          if (!rep) return U.toast('该镜原报告已缺失(可能被后续审片挤出最近记录),可重新审片生成', 'error');
          close();
          openReport(p, ep, s, main, rep);
        });
        m.querySelector('[data-x=export]').onclick = () => {
          const lines = [`整集审片报告 · ${p.name} / ${ep.title}`, '='.repeat(40), `整集均分:${lr.avg}/10 · ${lr.time}`, '',
            ...reports.map(x => `镜头${x.shot.order + 1}:${x.report.score.toFixed(1)} 分(技术${x.report.dimensions.technical.score} 匹配${x.report.dimensions.matching.score} 导演${x.report.dimensions.directing.score})${x.report.issues.length ? ' 问题:' + x.report.issues.map(i => i.type).join('/') : ''}`),
            '', '整集共性问题:', (lr.common && lr.common.summary) || '（无）',
            ...(((lr.common && lr.common.issues) || []).map(i => `- ${i.type}:${i.detail} → ${i.suggestion}`)),
            ...(lr.cut ? ['', '四维成片评审:', ...CUT_DIMS.map(([k, name]) => `${name}:${lr.cut[k].score.toFixed(1)} 分 — ${lr.cut[k].comment}`), lr.cut.overall || ''] : [])];
          U.downloadText(`整集审片报告_${p.name}_${ep.title}.txt`, lines.join('\n'));
          U.toast('整集报告已导出', 'success');
        };
        const batchBtn = m.querySelector('[data-x=batch]');
        if (batchBtn && unoptimized.length) batchBtn.onclick = async () => {
          close();
          U.toast(`批量优化开始,共 ${unoptimized.length} 镜(串行执行)…`, 'info', 2500);
          let done = 0;
          for (const x of unoptimized) {
            const okk = await optimizeShot(p, ep, x.shot, x.report, null, true);
            if (okk) done++;
            U.toast(`批量优化进度 ${done}/${unoptimized.length}(镜头 ${x.shot.order + 1})`, 'info', 1500);
          }
          U.toast(`批量一键优化完成,${done} 镜提示词已更新`, 'success', 3000);
          if (main) renderShotsRef(main, p, ep);
        };
      },
    });
  }

  /* ---- 审片记录列表 ---- */
  function openReviewHistory(p, ep, s, main) {
    const list = (s.reviews || []).map(normReview); // 结构兜底:旧记录可能缺 dimensions/issues
    U.openModal({
      title: `审片记录 · 镜头 ${s.order + 1}(${list.length})`,
      body: list.length ? list.map((r, i) => `
        <div class="card" style="margin-bottom:10px;padding:12px;cursor:pointer" data-rv="${i}">
          <div class="row" style="justify-content:space-between">
            <b style="color:var(--purple);font-size:17px">${r.score.toFixed(1)} 分</b>
            <span class="small muted">${U.esc(r.time)} · ${U.esc(r.model)}</span>
          </div>
          <div class="row wrap" style="margin-top:6px;gap:5px">
            ${DIMS.map(([k, name]) => `<span class="tag ${chipCls(r.dimensions[k].score) === 'low' ? 'red' : chipCls(r.dimensions[k].score) === 'mid' ? 'yellow' : 'green'}">${name} ${r.dimensions[k].score.toFixed(1)}</span>`).join('')}
            ${r.optimized ? '<span class="tag cyan">已优化</span>' : ''}
          </div>
        </div>`).join('') : '<div class="empty"><p>暂无审片记录</p></div>',
      onMount(m) {
        m.querySelectorAll('[data-rv]').forEach(c => c.onclick = () => openReport(p, ep, s, main, list[+c.dataset.rv]));
      },
    });
  }

  // storyboard.js 的 renderShots 不可直接访问,通过事件刷新当前页
  function renderShotsRef(main, p, ep) {
    if (window.Views && Views.episode && main && main.isConnected) Views.episode(main, p.id, ep.id);
  }

  window.Review = { reviewShot, openReport, openEpisodeReview, openEpisodeReport, openReviewHistory, optimizeShot, reportStale, episodeReviewStale };
})();
