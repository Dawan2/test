/* ============ proj-shell.js 剧壳 tab(自 episodes.js 拆分) ============
 * 项目级发行物料包:发行信息/双海报/AI 文案包/合规授权/宣发物料。
 * 原 projectDetail 闭包函数,拆分后参数化 (p)/(p, main, render);
 * 经 window.ProjTabs.shell 暴露,episodes.js 的 renderBody/bind 调用。 */
(function () {
  window.ProjTabs = window.ProjTabs || {};

  /* ================= 📦 剧壳(项目级发行物料包:基础信息/视觉物料/合规授权/宣发文案) =================
   * 行业口径(2025-2026 微短剧发行):海报为项目级主视觉(不做每集海报);上线须备案号/发行许可证,
   * AIGC 内容须标识,素材授权须覆盖正片+宣发+投流;宣发物料=定档文案/话题/投流文案/预告切片 */
  function renderShellEp(p) {
    const d = p.shell.dist = p.shell.dist || {};
    const PLATFORMS = ['抖音', '快手', '红果', '视频号', '小程序', 'TikTok', 'ReelShort'];
    const epCnt = p.episodes.length;
    const certified = window.Compliance && Compliance.isCertified && Compliance.isCertified();
    const rejCnt = (Store.state.assetReviews || []).filter(r => r.status === 'rejected').length;
    const posterBox = (key, label, ratio, sub) => `
      <div style="flex:1;min-width:220px">
        <div class="ws-thumb-img" style="aspect-ratio:${ratio}">${d[key] ? `<img src="${U.thumb(d[key])}" style="width:100%;height:100%;object-fit:cover">` : `<div class="ws-thumb-empty">${label}</div>`}</div>
        <div class="small muted" style="margin:4px 0">${label} · ${sub}</div>
        <div class="row" style="gap:4px">
          <button class="btn ghost sm" data-sd-up="${key}">⬆ 上传</button>
          <button class="btn ghost sm" data-sd-aiposter="${key}" title="AI 生成(-${COST.image} 积分)">✨ AI 生成</button>
          ${d[key] ? `<button class="btn ghost sm" data-sd-dl="${key}">⬇ 下载</button>` : ''}
        </div>
      </div>`;
    return `
    <div class="card" style="padding:10px 14px;margin-bottom:12px"><span class="small muted">项目级发行物料包:剧名/简介/主海报/合规备案/宣发文案——上线发行与投流投稿在此一站备齐。海报是<b>全剧一张主视觉</b>,不做每集海报;分集的高光素材在「切片」页生产。全部失焦即存。</span></div>

    <div class="card" style="padding:14px 16px;margin-bottom:12px">
      <div class="row" style="justify-content:space-between;align-items:center;margin-bottom:10px">
        <b class="small">📋 发行信息</b>
        <button class="btn sm" data-sd-aicopy title="按剧本与卖点 AI 生成:卖点/双版简介/话题/投流文案/定档文案(1 积分/次,失败自动退费)">✨ AI 生成文案包(-1积分)</button>
      </div>
      <div class="grid" style="grid-template-columns:1fr 1fr;gap:10px 18px">
        <label class="field"><span>发行剧名</span><input class="input" data-sd="distName" value="${U.esc(d.distName || p.name)}"></label>
        <label class="field"><span>副标题/别名(选填)</span><input class="input" data-sd="alias" value="${U.esc(d.alias || '')}" placeholder="如:又名《…》"></label>
        <label class="field"><span>出品方/厂牌</span><input class="input" data-sd="studio" value="${U.esc(d.studio || '')}"></label>
        <label class="field"><span>署名(导演/编剧)</span><input class="input" data-sd="credits" value="${U.esc(d.credits || '')}" placeholder="导演:× × · 编剧:× ×"></label>
      </div>
      <label class="field"><span>一句话卖点(推荐位/投流核心钩)</span><input class="input" data-sd="logline" value="${U.esc(d.logline || (p.shell.selling || ''))}"></label>
      <label class="field"><span>长简介(平台详情页,≤200字)</span><textarea class="input" rows="3" data-sd="introLong">${U.esc(d.introLong || '')}</textarea></label>
      <label class="field"><span>短简介(推荐位/搜索摘要,≤40字)</span><input class="input" data-sd="introShort" value="${U.esc(d.introShort || '')}"></label>
      <div class="grid" style="grid-template-columns:1fr 1fr;gap:10px 18px">
        <label class="field"><span>题材标签(空格分隔)</span><input class="input" data-sd="genres" value="${U.esc(d.genres || '')}" placeholder="复仇 逆袭 都市"></label>
        <label class="field"><span>话题标签(空格分隔)</span><input class="input" data-sd="topics" value="${U.esc(d.topics || '')}" placeholder="#新剧来袭 #逆袭"></label>
      </div>
      <label class="field"><span>目标平台(点选)</span>
        <div class="model-row wrap">${PLATFORMS.map(x => `<div class="model-opt ${(d.platforms || []).includes(x) ? 'sel' : ''}" data-sd-plat="${x}">${x}</div>`).join('')}</div>
      </label>
      <div class="hint" style="margin:0">规格:${epCnt} 集 · 画幅 ${U.esc((p.concept && p.concept.ratio) || '16:9')} · 目标市场 ${U.esc(p.shell.lang || '中文')}/${U.esc(p.shell.platform || '抖音')}(剧壳基础信息在「制片 → 项目概况」维护)</div>
    </div>

    <div class="card" style="padding:14px 16px;margin-bottom:12px">
      <b class="small">🖼 视觉物料(全剧主视觉)</b>
      <div class="row" style="gap:14px;margin-top:10px;align-items:flex-start;flex-wrap:wrap">
        ${posterBox('posterV', '竖版主海报', '3/4', '3:4 推荐位/投流')}
        ${posterBox('posterH', '横版海报', '16/9', '16:9 banner/头图')}
      </div>
    </div>

    <div class="card" style="padding:14px 16px;margin-bottom:12px">
      <b class="small">🛡 合规与授权</b>
      <div class="grid" style="grid-template-columns:1fr 1fr;gap:10px 18px;margin-top:10px">
        <label class="field"><span>备案号/发行许可证号</span><input class="input" data-sd="recordNo" value="${U.esc(d.recordNo || '')}" placeholder="网络剧片发行许可证或上线备案号"></label>
        <label class="field"><span>定档信息</span><input class="input" data-sd="launchText" value="${U.esc(d.launchText || '')}" placeholder="如:9月1日 10:00 全网首播"></label>
      </div>
      <div class="check-line" data-sd-aimark style="margin-top:4px"><span class="switch ${d.aiMark ? 'on' : ''}"></span><div><div>AI 生成内容标识</div><div class="hint" style="margin:0">成片含 AI 生成内容,上线时按平台与监管要求显著标注(监管要求:未标注许可证/备案号不得上线引流)</div></div></div>
      <div class="hint" style="margin:8px 0 0">素材授权:肖像授权 ${certified ? '<span class="tag green">已声明</span>' : '<span class="tag red">未声明(偏好学习 → 内容安全规范)</span>'} · 被驳回素材 ${rejCnt ? `<span class="tag red">${rejCnt} 个(资产库 → 真人审核)</span>` : '<span class="tag green">0</span>'}(授权须覆盖正片+宣发+投流)</div>
    </div>

    <div class="card" style="padding:14px 16px;margin-bottom:12px">
      <div class="row" style="justify-content:space-between;align-items:center">
        <b class="small">📣 宣发物料</b>
        <button class="btn sm" data-sd-export>⬇ 导出物料包 TXT</button>
      </div>
      <label class="field" style="margin-top:10px"><span>定档/官宣文案</span><textarea class="input" rows="2" data-sd="announce">${U.esc(d.announce || '')}</textarea></label>
      <label class="field"><span>投流文案 ×3(不同角度,信息流广告用)</span><textarea class="input" rows="3" data-sd="promo" placeholder="每行一条">${U.esc(d.promo || '')}</textarea></label>
      <div class="hint" style="margin:0">预告/高光切片:到「切片」页从成片截取;预告片可直接用「切片」产出或「剪辑台 → 合成成片」的首集。</div>
    </div>`;
  }

  function bindShellEp(p, main, render) {
    const d = p.shell.dist = p.shell.dist || {};
    const save = () => { d.updatedAt = Store.now(); Store.save(); };
    main.querySelectorAll('[data-sd]').forEach(inp => inp.onchange = () => {
      d[inp.dataset.sd] = inp.value.trim(); save(); U.toast('已保存', 'success', 900);
    });
    main.querySelectorAll('[data-sd-plat]').forEach(o => o.onclick = () => {
      d.platforms = d.platforms || [];
      const i = d.platforms.indexOf(o.dataset.sdPlat);
      i >= 0 ? d.platforms.splice(i, 1) : d.platforms.push(o.dataset.sdPlat);
      o.classList.toggle('sel', i < 0); save();
    });
    const aim = main.querySelector('[data-sd-aimark]');
    if (aim) aim.onclick = () => { d.aiMark = !d.aiMark; aim.querySelector('.switch').classList.toggle('on', d.aiMark); save(); };
    main.querySelectorAll('[data-sd-up]').forEach(b => b.onclick = async () => {
      const f = await U.readAndUpload('image/*', { maxMB: 10 });
      if (f) { d[b.dataset.sdUp] = f.url; save(); render(); U.toast('海报已更新', 'success'); }
    });
    main.querySelectorAll('[data-sd-dl]').forEach(b => b.onclick = () => {
      U.downloadDataURL(`${p.name}_${b.dataset.sdDl === 'posterV' ? '竖版主海报' : '横版海报'}.jpg`, d[b.dataset.sdDl]);
    });
    main.querySelectorAll('[data-sd-aiposter]').forEach(b => b.onclick = async () => {
      const key = b.dataset.sdAiposter;
      if (!window.Media || !Media.isReady()) return U.toast('需要后端与火山引擎生图配置', 'error', 3200);
      b.disabled = true; b.innerHTML = '<span class="spinner"></span> 生成中…';
      // 计费走标准五件套(登记→扣费→执行→失败退费),任务监控可对账
      const out = await Tasks.run({
        type: 'AI 主海报', model: '火山生图', target: `${p.name}·${key === 'posterV' ? '竖版' : '横版'}`,
        cost: COST.image, actionName: 'AI 主海报(' + (key === 'posterV' ? '竖版' : '横版') + ')', projectId: p.id,
      }, async (tk) => {
        const r = await Media.genImage({
          prompt: `短剧主海报,${styleOf(p)}风格,剧名《${d.distName || p.name}》,${d.logline || p.shell.selling || ''},${d.introShort || d.introLong || ''},电影海报构图,标题字区域留白,精美画面,高识别度,无水印`,
          size: key === 'posterV' ? '1152x2048' : '2048x1152',
          billingAction: 'image.gen', operationId: tk.id,
        });
        d[key] = r.url; save();
        return true;
      });
      b.disabled = false; b.textContent = '✨ AI 生成';
      if (out) { render(); U.toast('海报已生成', 'success'); }
      else U.toast('海报生成失败,已退费(详见任务监控)', 'error', 3500);
    });
    // AI 文案包:一次 LLM 调用填 卖点/双版简介/话题/定档/投流文案(1 积分/次,失败退费)
    const aiCopy = main.querySelector('[data-sd-aicopy]');
    if (aiCopy) aiCopy.onclick = async () => {
      if (!API.isReady()) return U.toast('需要真实 LLM(请登录后端)', 'error', 3000);
      // 七轮:计费对齐服务端(llm.agent=1),任务 id 作 operationId
      const tk = Tasks.start({ type: '发行文案包', model: 'LLM', target: p.name, cost: 1, projectId: p.id });
      if (!U.charge(1, 'AI 发行文案包', tk.id)) { Tasks.fail(tk, '积分不足'); return; }
      aiCopy.disabled = true; aiCopy.innerHTML = '<span class="spinner"></span> 生成中…';
      try {
        const out = await API.chatJSON({
          model: (Store.state.settings || {}).defLLM || API.getConfig().model,
          system: '你是短剧发行运营专家,精通平台投稿与投流文案。' + (window.KB ? KB.WR_HOOKS + KB.WR_PAYOFF : ''),
          messages: [{ role: 'user', content: `为以下短剧写发行文案包,返回严格 JSON {"logline":"一句话卖点(≤25字,带钩子)","introLong":"长简介(≤200字,平台详情页风格)","introShort":"短简介(≤40字)","topics":"话题标签(3-5个,#开头空格分隔)","announce":"定档官宣文案(≤80字)","promo":"投流文案3条,每条一行,不同角度(悬念/爽点/情感)"}。剧名:${p.name};风格:${p.style};卖点:${p.shell.selling || '(无)'};题材:${(p.genres || []).join('/') || '未设'};剧情节选:${(p.script || p.episodes.map(e2 => e2.content || '').join('\n')).slice(0, 1500)}` }],
          temperature: 0.7, max_tokens: 1200,
          billingAction: 'llm.agent', operationId: tk.id,
        });
        ['logline', 'introLong', 'introShort', 'topics', 'announce', 'promo'].forEach(k => { if (out[k]) d[k] = String(out[k]); });
        save(); render();
        Tasks.done(tk);
        U.toast('发行文案包已生成,可直接修改', 'success');
      } catch (e) {
        U.refund(1, 'AI 发行文案包失败退费', tk.id);
        Tasks.fail(tk, e.message);
        U.toast('生成失败:' + e.message, 'error', 3500); aiCopy.disabled = false; aiCopy.textContent = '✨ AI 生成文案包';
      }
    };
    // 导出物料包 TXT
    const exp = main.querySelector('[data-sd-export]');
    if (exp) exp.onclick = () => {
      const txt = `《${d.distName || p.name}》发行物料包\n导出时间:${Store.now()}\n==============================
发行剧名:${d.distName || p.name}${d.alias ? '\n副标题:' + d.alias : ''}
出品方:${d.studio || '—'} · 署名:${d.credits || '—'}
一句话卖点:${d.logline || '—'}
长简介:${d.introLong || '—'}
短简介:${d.introShort || '—'}
题材标签:${d.genres || '—'} · 话题:${d.topics || '—'}
目标平台:${(d.platforms || []).join('/') || '—'}
规格:${p.episodes.length} 集 · ${(p.concept && p.concept.ratio) || '16:9'} · ${p.shell.lang || '中文'}
备案号/许可证:${d.recordNo || '(未填写)'} · AI 标识:${d.aiMark ? '需标注' : '未勾选'} · 定档:${d.launchText || '—'}
定档文案:${d.announce || '—'}
投流文案:\n${d.promo || '—'}
视觉物料:竖版主海报${d.posterV ? '✓' : '✗'} · 横版海报${d.posterH ? '✓' : '✗'}(图片在系统内下载)`;
      U.downloadText(`${p.name}_发行物料包.txt`, txt);
      U.toast('物料包已导出', 'success');
    };
  }

  window.ProjTabs.shell = { render: renderShellEp, bind: bindShellEp };
})();
