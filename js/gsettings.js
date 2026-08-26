/* ============ gsettings.js 偏好学习页(专家工坊 + 专家雇佣) ============ */
(function () {
  window.Views = window.Views || {};

  const DEFAULTS = {
    tplImage: '{style}风格,{subject},精美画面,细节丰富,高质量',
    tplVideo: '{style}风格,{shot},电影感运镜,光影氛围浓郁',
    tplReview: '按技术层/匹配层/导演层三维评审{shot},输出结构化 JSON 报告',
    defLLM: '', defImageModel: '', defVideoModel: '', defVoice: '',
    defImageBackup: '', defVideoBackup: '', // 备用线路(''=内置 MODELS 第 2 条,'无'=不启用)
    defQuality: '720p', defRatio: '16:9',
    directorSetting: null, // {style,光影,色调,情感氛围,服化道审美,表演气质,inject}
  };
  const DIR_DIMS = ['光影', '色调', '情感氛围', '服化道审美', '表演气质'];
  window.DIR_DIMS = DIR_DIMS; // R15 收敛:导演设定五维名全局唯一来源(understanding 引用)
  const DIR_STYLES = ['漫剧', '动漫', '写实'];
  const EXPERT_ROLES = ['导演', '编剧', '摄像', '策划', '其他'];

  /* 导演设定回退模板(LLM 失败时按风格给默认文案) */
  function dirFallback(style) {
    const base = {
      漫剧: { 光影: '高对比漫画光影,轮廓光鲜明,关键情绪点用聚光突出。', 色调: '饱和明快的漫剧色调,主色不超过三种,反派场景压暗偏冷。', 情感氛围: '情绪外放、节奏明快,强戏剧冲突,夸张与克制交替。', 服化道审美: '二次元美型人设,服饰线条简洁有符号感,配饰突出角色标签。', 表演气质: '舞台化表演,表情张力大,台词节奏干脆利落。' },
      动漫: { 光影: '柔和赛璐璐光影,空气感通透,逆光场景带光晕。', 色调: '清新自然的动画色系,天空与植被高饱和,肤色温暖。', 情感氛围: '细腻治愈与热血并存,留白与爆发交替,重氛围渲染。', 服化道审美: '日系动画人设,服装日常中带设计感,配色协调。', 表演气质: '生活化自然表演,微表情丰富,情绪递进细腻。' },
      写实: { 光影: '电影级写实布光,自然光效为主,阴影层次丰富,低调光比。', 色调: '低饱和电影色调,青橙对比,暗部偏冷高光偏暖。', 情感氛围: '克制内敛,暗流涌动,以氛围与细节叙事而非台词。', 服化道审美: '真实质感服化道,做旧与使用痕迹,符合人物身份与年代。', 表演气质: '电影化内敛表演,微表情与肢体语言优先,克制留白。' },
    };
    return Object.assign({ style }, base[style] || base['漫剧']);
  }

  /* AI 生成导演设定(LLM 优先,失败回退模板) */
  async function genDirectorSetting(style, scriptText) {
    try {
      if (!API.isReady()) throw new Error('LLM 未配置');
      const out = await API.chatJSON({
        system: '你是资深影视导演。',
        messages: [{ role: 'user', content: `为一部「${style}」风格的短剧制定导演设定,返回 JSON:{"光影":"2-3句","色调":"2-3句","情感氛围":"2-3句","服化道审美":"2-3句","表演气质":"2-3句"}。要求具体可执行、风格统一。${scriptText ? '剧本前段参考:\n' + scriptText.slice(0, 5000) : '(暂无剧本,按风格通用设定)'}` }],
        temperature: 0.6, max_tokens: 1200,
      });
      if (!out || !out.光影) throw new Error('LLM 返回结构不完整');
      const ds = { style };
      DIR_DIMS.forEach(d => ds[d] = String(out[d] || ''));
      U.toast('导演设定已生成(' + style + ')', 'success');
      return ds;
    } catch (e) {
      U.toast('LLM 生成失败:' + e.message + ',已按风格套用默认导演设定', 'error', 3500);
      return dirFallback(style);
    }
  }

  /* 注入摘要:系统三类风格且开关开时,拼接到提示词 */
  window.directorInject = function (projectStyle) {
    const ds = (Store.state.settings || {}).directorSetting;
    if (!ds || ds.inject === false) return '';
    if (!DIR_STYLES.includes(ds.style)) return ''; // 自定义风格不自动注入
    const parts = DIR_DIMS.filter(d => ds[d]).map(d => d + ':' + ds[d].slice(0, 40));
    return parts.length ? '。导演设定:' + parts.join(';') : '';
  };

  /* 导演设定编辑卡片(专家工坊页与分集工作区共用) */
  window.openDirectorSetting = function (p, scriptText, onSaved) {
    const cur = (Store.state.settings || {}).directorSetting || dirFallback(p.style || '漫剧');
    let style = DIR_STYLES.includes(cur.style) ? cur.style : (DIR_STYLES.includes(p.style) ? p.style : '漫剧');
    const ds = Object.assign({}, cur, { style });
    if (ds.inject === undefined) ds.inject = true;
    U.openModal({
      title: '🎬 导演设定' + (p.name ? ' · ' + p.name : ''),
      wide: true,
      body: `
      <div class="row" style="gap:8px;margin-bottom:12px">
        <span class="small muted">风格:</span>
        ${DIR_STYLES.map(st => `<div class="model-opt ${style === st ? 'sel' : ''}" data-ds="${st}">${st}</div>`).join('')}
        <span class="grow"></span>
        <button class="btn sm primary" data-x="gen">✨ AI 生成导演设定</button>
        <button class="btn sm" data-x="reset">↺ 恢复系统默认</button>
      </div>
      <div class="hint" style="margin-bottom:10px">导演设定会注入所有生成的提示词(文生图/文生视频/审片参考)。<span style="color:var(--yellow)">自定义风格下不自动注入</span>,可用下方开关手动控制。</div>
      <div data-cards>
        ${DIR_DIMS.map(d => `
        <div class="card" style="margin-bottom:8px;padding:10px 12px">
          <b class="small" style="color:var(--accent)">${d}</b>
          <textarea class="input small" rows="2" data-dd="${d}" style="margin-top:6px">${U.esc(ds[d] || '')}</textarea>
        </div>`).join('')}
      </div>
      <div class="check-line" data-x="inject"><span class="switch ${ds.inject ? 'on' : ''}"></span><span class="small">注入所有生成提示词</span></div>`,
      footer: `<button class="btn" data-x="cancel">取消</button><button class="btn primary" data-x="ok">保存导演设定</button>`,
      onMount(m, close) {
        m.querySelectorAll('[data-ds]').forEach(o => o.onclick = () => { style = o.dataset.ds; ds.style = style; m.querySelectorAll('[data-ds]').forEach(x => x.classList.toggle('sel', x === o)); });
        m.querySelector('[data-x=inject]').onclick = () => {
          ds.inject = !ds.inject;
          m.querySelector('[data-x=inject] .switch').classList.toggle('on', ds.inject);
        };
        const collect = () => DIR_DIMS.forEach(d => ds[d] = m.querySelector(`[data-dd="${d}"]`).value.trim());
        const refill = async (regen) => {
          collect();
          const btn = m.querySelector('[data-x=gen]');
          btn.disabled = true; btn.innerHTML = '<span class="spinner"></span> 生成中…';
          const nd = regen ? await genDirectorSetting(style, scriptText) : dirFallback(style);
          btn.disabled = false; btn.textContent = '✨ AI 生成导演设定';
          DIR_DIMS.forEach(d => { ds[d] = nd[d] || ''; m.querySelector(`[data-dd="${d}"]`).value = ds[d]; });
        };
        m.querySelector('[data-x=gen]').onclick = () => refill(true);
        m.querySelector('[data-x=reset]').onclick = () => refill(false);
        m.querySelector('[data-x=cancel]').onclick = close;
        m.querySelector('[data-x=ok]').onclick = () => {
          collect();
          Store.state.settings = Store.state.settings || {};
          Store.state.settings.directorSetting = ds;
          Store.save(); close();
          U.toast('导演设定已保存,将注入后续生成', 'success');
          if (onSaved) onSaved();
        };
      },
    });
  };
  window.getSettings = function () {
    const s = (Store.state.settings || {});
    return Object.assign({}, DEFAULTS, s);
  };
  window.genDirectorSetting = genDirectorSetting; // 暴露给精细模式解析流程(director.js):自动生成导演风格设定
  window.resetSettings = function () {
    Store.state.settings = Object.assign({}, DEFAULTS);
    Store.save();
  };

  const QUALITIES = ['480p', '720p', '1080p'];
  const RATIOS = ['16:9', '9:16', '1:1'];
  const VOICE_LIST = Voice.NARRATOR_PRESETS; // R4:voice.js 为唯一来源(加载顺序 voice.js 在前)

  /* 专家体系(EXPERTS 预置库/雇佣·解雇/自进化/工坊 FORGE_SYS/normExpertDraft)已拆至 experts.js
   * (window.Experts;window.EXPERT_DIRECTORS/allExperts/hiredExpert/projType 同在该文件挂载)。
   * 本文件顶部偏好设置域常量经 window.GSettings 供 experts.js 解构(加载顺序:本文件在前)。 */
  window.GSettings = { DEFAULTS, DIR_DIMS, DIR_STYLES, EXPERT_ROLES, dirFallback };

  Views.gsettings = function (main) {
    const s = getSettings();
    /* 专家域成员(experts.js)与全局雇佣态:闭包内别名保持页面代码引用不变 */
    const { EXPERTS, customExperts, hireExpert, delCustomExpert, evolveExpert, toLab, FORGE_SYS, normExpertDraft } = window.Experts;
    const hiredExpert = window.hiredExpert;
    const allExperts = window.allExperts;
    let mode = 'forge'; // forge=专家工坊(元智能体生成/手写专家 skill) | expert=专家雇佣
    let forgeDraft = null; // 元智能体最近一版生成稿
    const forgeChat = [];  // 本次会话消息(不持久化)

    main.innerHTML = `
    <div class="page" style="max-width:980px">
      <div class="page-head">
        <div>
          <div class="page-title">偏好学习</div>
          <div class="page-sub"><b>专家工坊</b>:与元智能体对话生成或手动编写自定义专家 skill(导演/编剧/摄像/策划…),加入专家库后即可雇佣 · <b>专家雇佣</b>:平台预置与我的自定义 AI 专家,一键雇佣调用</div>
        </div>
      </div>
      <div class="tabs">
        <div class="tab ${mode === 'forge' ? 'active' : ''}" data-gmode="forge">🧪 专家工坊</div>
        <div class="tab ${mode === 'expert' ? 'active' : ''}" data-gmode="expert">🎬 专家雇佣</div>
      </div>
      <div data-gbody></div>
    </div>`;
    const body = main.querySelector('[data-gbody]');
    main.querySelectorAll('[data-gmode]').forEach(t => t.onclick = () => {
      mode = t.dataset.gmode;
      main.querySelectorAll('[data-gmode]').forEach(x => x.classList.toggle('active', x === t));
      mode === 'forge' ? renderForge() : renderExperts();
    });

    /* ==================== 专家工坊 ==================== */
    function renderForge() {
      body.innerHTML = `
      <div class="card" style="margin-bottom:16px;border-color:var(--accent)">
        <b>🧪 元智能体 · 对话生成专家 skill</b>
        <div class="hint" style="margin:4px 0 12px;line-height:1.8">告诉元智能体你想要什么专家(导演/编剧/摄像/策划…题材、风格、擅长点),它为你生成完整专家 skill;可多轮对话改稿(如「节奏再快一点」),满意后「＋ 加入专家库」,即可在「专家雇佣」全局雇佣或到板块中调用。每次生成 1 积分。</div>
        <div data-fmsgs style="max-height:240px;overflow-y:auto;margin-bottom:10px"></div>
        <div data-fdraft></div>
        <div class="row" style="gap:8px;align-items:flex-end">
          <textarea class="input small grow" data-f-in rows="2" placeholder="如:我想要一个擅长重生复仇题材的短剧导演,节奏快、钩子狠,画面偏电影感"></textarea>
          <button class="btn primary sm" data-x="fsend" style="flex:none">发送(1积分)</button>
        </div>
      </div>
      <div class="card" style="margin-bottom:16px">
        <div class="row" style="justify-content:space-between;align-items:center">
          <div><b>✏ 手动编写专家 skill</b><div class="hint" style="margin:2px 0 0">不依赖 AI,直接手写人设/导演五维/提示词模板</div></div>
          <button class="btn sm" data-x="ftoggle">展开</button>
        </div>
        <div data-fform style="display:none;margin-top:12px"></div>
      </div>
      <div class="card" style="margin-bottom:16px">
        <b>📚 我的专家库</b><span class="small muted" style="margin-left:8px">工坊生成/手写的自定义专家,可全局雇佣或到板块中调用</span>
        <div data-flib style="margin-top:12px"></div>
      </div>
      <div class="card">
        <div class="row" style="justify-content:space-between;align-items:center">
          <div><b>⚙ 全局默认值</b><div class="hint" style="margin:2px 0 0">未雇佣专家时的回退:默认提示词模板/模型/画质比例/导演设定/内容安全</div></div>
          <button class="btn sm" data-x="dtoggle">展开</button>
        </div>
        <div data-fdefs style="display:none;margin-top:12px"></div>
      </div>`;
      renderForgeMsgs();
      renderForgeDraft();
      renderForgeLib();
      body.querySelector('[data-x=fsend]').onclick = sendForge;
      body.querySelector('[data-x=ftoggle]').onclick = () => {
        const host = body.querySelector('[data-fform]');
        if (host.style.display === 'none') openExpertForm(null, null);
        else { host.style.display = 'none'; host.innerHTML = ''; body.querySelector('[data-x=ftoggle]').textContent = '展开'; }
      };
      body.querySelector('[data-x=dtoggle]').onclick = () => {
        const host = body.querySelector('[data-fdefs]');
        const show = host.style.display === 'none';
        host.style.display = show ? '' : 'none';
        body.querySelector('[data-x=dtoggle]').textContent = show ? '收起' : '展开';
        if (show) renderDefaults(host); // 每次展开重渲染,反映最新配置
      };
    }

    /* ---- A. 元智能体对话 ---- */
    function renderForgeMsgs() {
      const host = body.querySelector('[data-fmsgs]');
      if (!host) return;
      host.innerHTML = forgeChat.length ? forgeChat.map(mm => mm.role === 'user'
        ? `<div class="row" style="justify-content:flex-end;margin-bottom:6px"><span class="tag cyan" style="max-width:85%;white-space:pre-wrap;line-height:1.6">${U.esc(mm.content)}</span></div>`
        : `<div class="row" style="margin-bottom:6px"><span class="tag" style="max-width:85%;line-height:1.6">🧪 已生成/更新专家 skill,预览见下方卡片;可继续对话改稿</span></div>`).join('')
        : '<div class="small muted">暂无对话,在下方描述你想要的专家</div>';
      host.scrollTop = host.scrollHeight;
    }
    async function sendForge() {
      const ta = body.querySelector('[data-f-in]');
      const text = ta.value.trim();
      if (!text) return;
      if (!API.isReady()) return U.toast('需要真实 LLM 在线才能生成专家 skill,请先到「模型配置」完成配置', 'error', 3500);
      if (!U.requireCredits(1, '生成专家 skill')) return;
      forgeChat.push({ role: 'user', content: text });
      ta.value = '';
      renderForgeMsgs();
      const btn = body.querySelector('[data-x=fsend]');
      btn.disabled = true; btn.innerHTML = '<span class="spinner"></span> 生成中…';
      // 计费走标准五件套(登记→扣费→执行→失败退费),任务监控可对账
      const out = await Tasks.run({ type: '专家工坊', model: 'LLM', target: '生成专家 skill', cost: 1, actionName: '生成专家 skill' }, async (tk) => {
        try {
          const out = await API.chatJSON({
            model: (Store.state.settings || {}).defLLM || API.getConfig().model,
            system: FORGE_SYS,
            messages: forgeChat.slice(-10), // 带会话历史,支持多轮改稿
            temperature: 0.7, max_tokens: 2400,
            billingAction: 'llm.skill', operationId: tk.id,
          });
          if (!out || !out.name || !out.persona) throw new Error('LLM 返回结构不完整');
          return out;
        } catch (e) {
          forgeChat.pop(); // 撤回本次提问,避免失败请求污染改稿历史
          throw e;
        }
      });
      btn.disabled = false; btn.textContent = '发送(1积分)';
      if (out) {
        forgeChat.push({ role: 'assistant', content: JSON.stringify(out) });
        forgeDraft = normExpertDraft(out);
        renderForgeMsgs();
        renderForgeDraft();
      } else {
        renderForgeMsgs();
        U.toast('生成失败,已退费(详见任务监控)', 'error', 3500);
      }
    }

    /* ---- 生成结果预览卡 ---- */
    function renderForgeDraft() {
      const host = body.querySelector('[data-fdraft]');
      if (!host) return;
      const e = forgeDraft;
      if (!e) { host.innerHTML = ''; return; }
      host.innerHTML = `
      <div class="card" style="padding:14px 16px;margin-bottom:10px;background:var(--bg2)">
        <div class="row" style="gap:8px;align-items:center;margin-bottom:6px;flex-wrap:wrap">
          <span style="font-size:20px">${U.esc(e.ico)}</span><b>${U.esc(e.name)}</b>
          <span class="tag purple">${U.esc(e.role)}</span>
          <span class="tag ${e.kind === 'function' ? 'yellow' : 'cyan'}">${e.kind === 'function' ? '功能专家' : U.esc(e.style)}</span>
          <span class="tag green">新草稿</span>
        </div>
        <div class="row wrap" style="gap:4px;margin-bottom:6px">${e.tags.map(t => `<span class="tag">${U.esc(t)}</span>`).join('')}</div>
        <p class="small muted" style="line-height:1.7;margin-bottom:6px">${U.esc(e.desc)}</p>
        <div class="small muted" style="line-height:1.7;margin-bottom:6px"><b>人设:</b>${U.esc(e.persona.slice(0, 80))}${e.persona.length > 80 ? '…' : ''}</div>
        ${e.kind === 'style' ? `
        <div class="small muted" style="line-height:1.7;border-top:1px dashed var(--border2);padding-top:6px">
          ${DIR_DIMS.map(d => `<div>· <b>${d}</b>:${U.esc((e.dims[d] || '').slice(0, 20))}…</div>`).join('')}
          <div>· <b>模板</b>:文生图/文生视频/审片 三件套已生成(编辑可查看全文)</div>
        </div>` : ''}
        <div class="row" style="gap:8px;margin-top:8px">
          <button class="btn sm" data-x="fedit">✏ 编辑</button>
          <button class="btn sm primary" data-x="fadd">＋ 加入专家库</button>
          <button class="btn sm" data-x="fcont">↻ 继续对话修改</button>
        </div>
      </div>`;
      host.querySelector('[data-x=fedit]').onclick = () => openExpertForm(forgeDraft, null);
      host.querySelector('[data-x=fadd]').onclick = () => {
        customExperts().push(forgeDraft);
        const nm = forgeDraft.name;
        forgeDraft = null;
        Store.save();
        U.toast(`已加入专家库:「${nm}」,可到「专家雇佣」全局雇佣或到板块中调用`, 'success', 3500);
        renderForge();
      };
      host.querySelector('[data-x=fcont]').onclick = () => body.querySelector('[data-f-in]').focus();
    }

    /* ---- B. 手动编写/编辑表单(draft 预填;editId 非空=编辑已有自定义专家,保存覆盖) ---- */
    function openExpertForm(draft, editId) {
      const e = draft || { name: '', ico: '🧪', role: '导演', kind: 'style', style: '漫剧', tags: [], desc: '', persona: '', dims: {}, tpl: {} };
      const host = body.querySelector('[data-fform]');
      host.style.display = '';
      body.querySelector('[data-x=ftoggle]').textContent = '收起';
      host.innerHTML = `
      <div class="grid" style="grid-template-columns:1fr 1fr;gap:12px 18px">
        <label class="field"><span>专家名称 *</span><input class="input small" data-ef="name" value="${U.esc(e.name || '')}" placeholder="如:重生复仇导演"></label>
        <label class="field"><span>图标 emoji</span><input class="input small" data-ef="ico" value="${U.esc(e.ico || '')}" placeholder="🎬"></label>
        <label class="field"><span>角色方向</span><select class="select" data-ef="role">${EXPERT_ROLES.map(r => `<option ${e.role === r ? 'selected' : ''}>${r}</option>`).join('')}</select></label>
        <label class="field"><span>雇佣类型</span><select class="select" data-ef="kind">
          <option value="style" ${e.kind !== 'function' ? 'selected' : ''}>style · 全局风格雇佣</option>
          <option value="function" ${e.kind === 'function' ? 'selected' : ''}>function · 板块功能专家</option>
        </select></label>
        <label class="field"><span>适用风格</span><select class="select" data-ef="style">${DIR_STYLES.map(st => `<option ${e.style === st ? 'selected' : ''}>${st}</option>`).join('')}</select></label>
        <label class="field"><span>标签(逗号分隔,≤4)</span><input class="input small" data-ef="tags" value="${U.esc((e.tags || []).join(','))}" placeholder="悬疑,反转,强钩子"></label>
      </div>
      <label class="field"><span>简介(80字内)</span><textarea class="input small" rows="2" data-ef="desc" placeholder="擅长点与适用题材">${U.esc(e.desc || '')}</textarea></label>
      <label class="field"><span>系统人设提示词 persona *</span><textarea class="input small" rows="3" data-ef="persona" placeholder="你是…创作原则:…">${U.esc(e.persona || '')}</textarea></label>
      <div data-ef-style>
        <b class="small" style="color:var(--accent)">导演设定五维(kind=style 必填)</b>
        <div class="grid" style="grid-template-columns:1fr 1fr;gap:12px 18px;margin-top:6px">
          ${DIR_DIMS.map(d => `<label class="field"><span>${d}</span><textarea class="input small" rows="2" data-ef-dim="${d}">${U.esc((e.dims || {})[d] || '')}</textarea></label>`).join('')}
        </div>
        <b class="small" style="color:var(--accent)">提示词模板三件套(kind=style 必填,支持 {style}{subject}{shot} 变量)</b>
        <label class="field" style="margin-top:6px"><span>文生图模板</span><textarea class="input small" rows="2" data-ef-tpl="tplImage" placeholder="${U.esc(DEFAULTS.tplImage)}">${U.esc((e.tpl || {}).tplImage || '')}</textarea></label>
        <label class="field"><span>文生视频模板</span><textarea class="input small" rows="2" data-ef-tpl="tplVideo" placeholder="${U.esc(DEFAULTS.tplVideo)}">${U.esc((e.tpl || {}).tplVideo || '')}</textarea></label>
        <label class="field" style="margin-bottom:0"><span>审片模板</span><textarea class="input small" rows="2" data-ef-tpl="tplReview" placeholder="${U.esc(DEFAULTS.tplReview)}">${U.esc((e.tpl || {}).tplReview || '')}</textarea></label>
      </div>
      <div class="row" style="justify-content:flex-end;gap:8px;margin-top:12px">
        ${editId ? '<button class="btn" data-x="fevolve" style="margin-right:auto" title="从使用记录进化:把导演助手记忆里你的纠正/偏好蒸馏为该专家的进化条款,追加进人设(1积分)">🧠 从使用记录进化</button>' : ''}
        <button class="btn" data-x="fcancel">取消</button>
        <button class="btn primary" data-x="fsave">${editId ? '保存修改' : '保存进专家库'}</button>
      </div>`;
      const syncKind = () => { host.querySelector('[data-ef-style]').style.display = host.querySelector('[data-ef=kind]').value === 'style' ? '' : 'none'; };
      host.querySelector('[data-ef=kind]').onchange = syncKind;
      syncKind();
      host.querySelector('[data-x=fcancel]').onclick = () => { host.style.display = 'none'; host.innerHTML = ''; body.querySelector('[data-x=ftoggle]').textContent = '展开'; };
      const fevolve = host.querySelector('[data-x=fevolve]');
      if (fevolve) fevolve.onclick = () => { // 编辑区进化:直接作用于专家库中已存条目,成功后同步 persona 文本框
        const stored = customExperts().find(x => x.id === editId);
        if (!stored) return U.toast('该专家尚未入库,请先保存再进化', 'error');
        evolveExpert(stored, () => { host.querySelector('[data-ef=persona]').value = stored.persona; });
      };
      host.querySelector('[data-x=fsave]').onclick = () => {
        const g = k => host.querySelector(`[data-ef=${k}]`).value.trim();
        const ne = {
          id: editId || (draft && draft.id) || 'cx_' + Date.now(),
          custom: true,
          name: g('name'), ico: g('ico') || '🧪', role: g('role'), kind: g('kind'), style: g('style'),
          tags: g('tags').split(/[,，]/).map(t => t.trim()).filter(Boolean).slice(0, 4),
          desc: g('desc').slice(0, 80), persona: g('persona'),
        };
        if (!ne.name) return U.toast('请填写专家名称', 'error');
        if (!ne.persona) return U.toast('请填写系统人设提示词 persona', 'error');
        if (ne.kind === 'style') {
          ne.dims = {};
          DIR_DIMS.forEach(d => ne.dims[d] = host.querySelector(`[data-ef-dim="${d}"]`).value.trim());
          const missD = DIR_DIMS.find(d => !ne.dims[d]);
          if (missD) return U.toast('kind=style 需填齐导演五维,缺:「' + missD + '」', 'error', 3000);
          ne.tpl = {
            tplImage: host.querySelector('[data-ef-tpl=tplImage]').value.trim(),
            tplVideo: host.querySelector('[data-ef-tpl=tplVideo]').value.trim(),
            tplReview: host.querySelector('[data-ef-tpl=tplReview]').value.trim(),
          };
          if (!ne.tpl.tplImage || !ne.tpl.tplVideo || !ne.tpl.tplReview) return U.toast('kind=style 需填齐提示词模板三件套(文生图/文生视频/审片)', 'error', 3000);
        }
        const list = customExperts();
        const idx = list.findIndex(x => x.id === ne.id);
        if (idx >= 0) list[idx] = ne; else list.push(ne);
        if (forgeDraft && forgeDraft.id === ne.id) forgeDraft = null; // 草稿经编辑保存后清掉预览
        Store.save();
        U.toast(`已保存「${ne.name}」到专家库`, 'success');
        renderForge();
      };
    }

    /* ---- C. 我的专家库 ---- */
    function renderForgeLib() {
      const host = body.querySelector('[data-flib]');
      const list = customExperts();
      const hired = hiredExpert();
      host.innerHTML = list.length ? `<div class="grid" style="grid-template-columns:1fr 1fr;gap:14px">${list.map(e => `
        <div class="card" style="padding:14px 16px;background:var(--bg2)">
          <div class="row" style="gap:8px;margin-bottom:6px;align-items:center;flex-wrap:wrap">
            <span style="font-size:20px">${U.esc(e.ico)}</span><b>${U.esc(e.name)}</b>
            <span class="tag purple">${U.esc(e.role || '其他')}</span>
            ${e.kind === 'function' ? '<span class="tag yellow">功能专家</span>' : `<span class="tag cyan">${U.esc(e.style)}</span>`}
            <span class="tag green">我的</span>
            ${e.evolutions ? `<span class="tag" title="已自进化次数">🧠×${e.evolutions}</span>` : ''}
            ${hired && hired.id === e.id ? '<span class="tag green">✓ 雇佣中</span>' : ''}
          </div>
          <p class="small muted" style="line-height:1.7;margin-bottom:8px">${U.esc(e.desc || '')}</p>
          <div class="row" style="gap:8px;flex-wrap:wrap">
            ${e.kind === 'function'
              ? '<button class="btn sm" data-x="tolab">到板块中雇佣调用 →</button>'
              : `<button class="btn sm ${hired && hired.id === e.id ? '' : 'primary'}" data-chire="${e.id}" ${hired && hired.id === e.id ? 'disabled' : ''}>${hired && hired.id === e.id ? '✓ 雇佣中' : '⚡ 雇佣'}</button>`}
            <button class="btn sm" data-cedit="${e.id}">✏ 编辑</button>
            <button class="btn sm" data-cevolve="${e.id}" title="从使用记录进化:把导演助手记忆里你的纠正/偏好蒸馏为该专家的进化条款,追加进人设(1积分)">🧠 进化</button>
            <button class="btn sm" data-cdel="${e.id}">🗑 删除</button>
          </div>
        </div>`).join('')}</div>`
        : '<div class="small muted">还没有自定义专家,用上方「元智能体」对话生成,或展开「手动编写」</div>';
      host.querySelectorAll('[data-chire]').forEach(b => b.onclick = () => hireExpert(list.find(x => x.id === b.dataset.chire), renderForge));
      host.querySelectorAll('[data-cedit]').forEach(b => b.onclick = () => openExpertForm(list.find(x => x.id === b.dataset.cedit), b.dataset.cedit));
      host.querySelectorAll('[data-cdel]').forEach(b => b.onclick = () => delCustomExpert(b.dataset.cdel, renderForge));
      host.querySelectorAll('[data-cevolve]').forEach(b => b.onclick = () => evolveExpert(customExperts().find(x => x.id === b.dataset.cevolve), renderForge));
      host.querySelectorAll('[data-x=tolab]').forEach(b2 => b2.onclick = toLab);
    }

    /* ---- D. 全局默认值卡(原「全局配置」内容,作为无专家时的回退) ---- */
    function renderDefaults(host) {
      const s = getSettings(); // 实时取值:页面打开期间雇佣/解约专家会改写模板等键,旧快照会把专家改动渲染成旧值、保存时再存回去
      host.innerHTML = `
      <div class="row" style="justify-content:flex-end;margin-bottom:12px">
        <button class="btn" data-x="reset">↺ 恢复默认</button>
        <button class="btn primary" data-x="save">保存配置</button>
      </div>
      <div class="card" style="margin-bottom:16px">
        <b>默认提示词模板(系统提示词 skill,无专家雇佣时的回退模板)</b>
        <div class="hint" style="margin:4px 0 12px">支持变量:{style}=项目风格 {subject}=主体名 {shot}=分镜内容</div>
        <label class="field"><span>文生图模板</span><textarea class="input small" rows="2" data-f="tplImage">${U.esc(s.tplImage)}</textarea></label>
        <label class="field"><span>文生视频模板</span><textarea class="input small" rows="2" data-f="tplVideo">${U.esc(s.tplVideo)}</textarea></label>
        <label class="field" style="margin-bottom:0"><span>审片模板</span><textarea class="input small" rows="2" data-f="tplReview">${U.esc(s.tplReview)}</textarea></label>
      </div>
      <div class="card" style="margin-bottom:16px">
        <b>核心提示词 skill(主线流程系统提示词,在线改写即生效)</b>
        <div class="hint" style="margin:4px 0 12px">拆镜/本集理解/审片等主线 LLM 调用的系统提示词与评审指令,集中登记于 prompts.js;改写存为覆盖,清空即恢复系统默认。标注变量的条目支持变量替换。</div>
        ${Prompts.list().map(pr => `
        <label class="field"><span>${U.esc(pr.name)}${pr.overridden ? ' <span class="tag cyan" style="font-size:10px">已覆盖</span>' : ''}${pr.vars.length ? ` <span class="small muted">变量:${pr.vars.join(' ')}</span>` : ''}</span>
          <textarea class="input small" rows="${pr.def.length > 200 ? 6 : 2}" data-pk="${pr.key}" style="font-family:inherit">${U.esc(pr.value)}</textarea></label>`).join('')}
      </div>
      <div class="card" style="margin-bottom:16px">
        <b>默认模型</b>
        <div class="grid" style="grid-template-columns:1fr 1fr;gap:12px 18px;margin-top:12px">
          <label class="field"><span>LLM 模型</span>
            <select class="select" data-f="defLLM">${API.modelOptions(s.defLLM || API.getConfig().model, 12)}</select></label>
          <label class="field"><span>生图模型</span>
            <select class="select" data-f="defImageModel">${MODELS.image.map(mo => `<option ${s.defImageModel === mo ? 'selected' : ''}>${mo}</option>`).join('')}</select></label>
          <label class="field"><span>视频模型</span>
            <select class="select" data-f="defVideoModel">${MODELS.video.map(mo => `<option ${s.defVideoModel === mo ? 'selected' : ''}>${mo}</option>`).join('')}</select></label>
          <label class="field"><span>生图备用线路(主线路失败自动切换)</span>
            <select class="select" data-f="defImageBackup"><option value="" ${!s.defImageBackup ? 'selected' : ''}>默认(内置【线路2】)</option><option value="无" ${s.defImageBackup === '无' ? 'selected' : ''}>无(不启用)</option>${MODELS.image.map(mo => `<option ${s.defImageBackup === mo ? 'selected' : ''}>${mo}</option>`).join('')}</select></label>
          <label class="field"><span>视频备用线路(主线路失败自动切换)</span>
            <select class="select" data-f="defVideoBackup"><option value="" ${!s.defVideoBackup ? 'selected' : ''}>默认(内置【线路2】)</option><option value="无" ${s.defVideoBackup === '无' ? 'selected' : ''}>无(不启用)</option>${MODELS.video.map(mo => `<option ${s.defVideoBackup === mo ? 'selected' : ''}>${mo}</option>`).join('')}</select></label>
          <label class="field"><span>默认音色</span>
            <select class="select" data-f="defVoice">${VOICE_LIST.map(v => `<option ${(s.defVoice || VOICE_LIST[0]) === v ? 'selected' : ''}>${v}</option>`).join('')}</select></label>
        </div>
      </div>
      <div class="card" style="margin-bottom:16px">
        <div class="row" style="justify-content:space-between">
          <div><b>🎬 导演设定</b><div class="hint" style="margin:2px 0 0">光影/色调/情感氛围/服化道审美/表演气质 五维度,将注入所有生成的提示词</div></div>
          <button class="btn" data-x="dir">编辑导演设定</button>
        </div>
        <div data-dirsum style="margin-top:10px"></div>
      </div>
      <div class="card" style="margin-bottom:16px">
        <div class="row" style="justify-content:space-between">
          <div><b>🛡 内容安全与肖像授权</b><div class="hint" style="margin:2px 0 0">四类红线说明与生成排障指引;含真人肖像的素材须先完成「肖像授权声明」再报白</div></div>
          <div class="row" style="gap:8px">
            <button class="btn" data-x="rules">📜 内容安全规范</button>
            <button class="btn" data-x="certs">🪪 肖像授权声明</button>
          </div>
        </div>
        <div data-certsum style="margin-top:10px"></div>
      </div>
      <div class="card" style="margin-bottom:0">
        <b>默认画质与比例</b>
        <div class="grid" style="grid-template-columns:1fr 1fr;gap:12px 18px;margin-top:12px">
          <label class="field"><span>默认画质</span>
            <div class="model-row">${QUALITIES.map(q => `<div class="model-opt ${s.defQuality === q ? 'sel' : ''}" data-q="${q}">${q}</div>`).join('')}</div></label>
          <label class="field"><span>默认比例</span>
            <div class="model-row">${RATIOS.map(r => `<div class="model-opt ${s.defRatio === r ? 'sel' : ''}" data-r="${r}">${r}</div>`).join('')}</div></label>
        </div>
      </div>`;

      let quality = s.defQuality, ratio = s.defRatio;
      const renderDirSum = () => {
        const ds = (Store.state.settings || {}).directorSetting;
        host.querySelector('[data-dirsum]').innerHTML = ds
          ? `<div class="row wrap" style="gap:6px"><span class="tag cyan">${U.esc(ds.style)}</span><span class="tag ${ds.inject !== false ? 'green' : ''}">${ds.inject !== false ? '已开启注入' : '未注入'}</span>${DIR_DIMS.filter(d => ds[d]).map(d => `<span class="tag">${d}:${U.esc(ds[d].slice(0, 14))}…</span>`).join('')}</div>`
          : '<span class="small muted">未设置,点击「编辑导演设定」用 AI 按风格+剧本一键生成,或到「专家雇佣」直接雇佣平台导演</span>';
      };
      renderDirSum();
      host.querySelector('[data-x=dir]').onclick = () => {
        const p0 = Store.myProjects().find(x => x.script);
        openDirectorSetting({ name: '全局', style: (p0 && p0.style) || '漫剧' }, (p0 && p0.script) || '', renderDirSum);
      };
      /* ---- 内容安全常驻入口:规范弹窗 + 肖像认证状态/管理 ---- */
      const renderCertSum = () => {
        const certs = (Store.state.portraitCerts || []);
        host.querySelector('[data-certsum]').innerHTML = certs.length
          ? `<span class="tag green">🪪 已声明 ${certs.length} 人</span> ${certs.map(c => `<span class="tag">${U.esc(c.name)}(${U.esc(c.relation)})</span>`).join(' ')}`
          : '<span class="small muted">🪪 未声明:含真人肖像的素材需先完成「肖像授权声明」,才能提交报白</span>';
      };
      if (window.Compliance) {
        renderCertSum();
        host.querySelector('[data-x=rules]').onclick = () => Compliance.rulesModal();
        host.querySelector('[data-x=certs]').onclick = () => Compliance.certListModal(renderCertSum);
      }
      host.querySelectorAll('[data-q]').forEach(o => o.onclick = () => { quality = o.dataset.q; host.querySelectorAll('[data-q]').forEach(x => x.classList.toggle('sel', x === o)); });
      host.querySelectorAll('[data-r]').forEach(o => o.onclick = () => { ratio = o.dataset.r; host.querySelectorAll('[data-r]').forEach(x => x.classList.toggle('sel', x === o)); });
      host.querySelector('[data-x=reset]').onclick = () => {
        U.confirm('恢复全部全局配置为默认值(已雇佣的专家也会一并解雇)?', () => { resetSettings(); U.toast('已恢复默认', 'success'); renderDefaults(host); }, '恢复默认');
      };
      host.querySelector('[data-x=save]').onclick = () => {
        // H1 修复:合并而非整体替换,保留 directorSetting 等其他键(原写法静默丢数据)
        Store.state.settings = Object.assign({}, Store.state.settings, {
          tplImage: host.querySelector('[data-f=tplImage]').value,
          tplVideo: host.querySelector('[data-f=tplVideo]').value,
          tplReview: host.querySelector('[data-f=tplReview]').value,
          defLLM: host.querySelector('[data-f=defLLM]').value,
          defImageModel: host.querySelector('[data-f=defImageModel]').value,
          defVideoModel: host.querySelector('[data-f=defVideoModel]').value,
          defImageBackup: host.querySelector('[data-f=defImageBackup]').value,
          defVideoBackup: host.querySelector('[data-f=defVideoBackup]').value,
          defVoice: host.querySelector('[data-f=defVoice]').value,
          defQuality: quality, defRatio: ratio,
        });
        const pmap = {}; // 核心提示词覆盖:空文本/与默认相同即清除覆盖(Prompts.setAll 内部判默认)
        host.querySelectorAll('[data-pk]').forEach(t => pmap[t.dataset.pk] = t.value);
        Prompts.setAll(pmap);
        Store.save();
        U.toast('全局配置已保存,各生成入口默认值已更新', 'success', 3000);
      };
    }

    /* ==================== 专家雇佣(平台预置 + 我的自定义专家) ==================== */
    function renderExperts() {
      const hired = hiredExpert();
      const myStyle = customExperts().filter(e => e.kind !== 'function');
      const funcs = EXPERTS.filter(e => e.kind === 'function').concat(customExperts().filter(e => e.kind === 'function'));
      body.innerHTML = `
      ${hired ? `
      <div class="card" style="margin-bottom:14px;border-color:var(--accent);display:flex;gap:12px;align-items:center;padding:14px 18px">
        <span style="font-size:24px">${hired.ico}</span>
        <div class="grow"><b>当前雇佣:${hired.ico} ${U.esc(hired.name)}</b>
          <div class="small muted">其导演设定五维与提示词模板已注入全局配置,导演助手正以该人设与你协作</div></div>
        <button class="btn sm" data-x="fire">解雇并恢复默认</button>
      </div>` : `
      <div class="hint" style="margin-bottom:14px;line-height:1.8">AI 导演 Agent = 封装好的<b>风格化系统提示词 + 提示词模板 skill</b>(平台预置 + 「专家工坊」自定义)。雇佣后:① 导演设定五维注入所有生成提示词;② 文生图/文生视频/审片模板替换为该专家版本;③ 导演助手以该专家人设与你对话。可随时解雇恢复默认,解雇后也可在「专家工坊 → 全局默认值」里继续自填迭代。</div>`}
      <div class="grid" style="grid-template-columns:1fr 1fr;gap:14px">
        ${EXPERTS.filter(e => e.kind !== 'function').map(e => `
        <div class="card" style="padding:16px">
          <div class="row" style="gap:8px;margin-bottom:6px;align-items:center">
            <span style="font-size:20px">${e.ico}</span><b>${U.esc(e.name)}</b>
            <span class="tag cyan">${e.style}</span>
            ${hired && hired.id === e.id ? '<span class="tag green">✓ 雇佣中</span>' : ''}
          </div>
          <div class="row wrap" style="gap:4px;margin-bottom:8px">${e.tags.map(t => `<span class="tag">${t}</span>`).join('')}</div>
          <p class="small muted" style="line-height:1.7;margin-bottom:8px">${U.esc(e.desc)}</p>
          <div class="small muted" style="line-height:1.7;margin-bottom:10px;border-top:1px dashed var(--border2);padding-top:8px">
            ${DIR_DIMS.map(d => `<div>· <b>${d}</b>:${U.esc(e.dims[d].slice(0, 20))}…</div>`).join('')}
          </div>
          <button class="btn sm ${hired && hired.id === e.id ? '' : 'primary'}" data-hire="${e.id}" ${hired && hired.id === e.id ? 'disabled' : ''}>${hired && hired.id === e.id ? '✓ 雇佣中' : '⚡ 雇佣该导演'}</button>
        </div>`).join('')}
      </div>
      ${myStyle.length ? `
      <div style="margin:18px 0 10px"><b>🧪 我的专家</b><span class="small muted" style="margin-left:8px">「专家工坊」生成/手写的自定义专家,雇佣效果同平台预置</span></div>
      <div class="grid" style="grid-template-columns:1fr 1fr;gap:14px">
        ${myStyle.map(e => `
        <div class="card" style="padding:16px">
          <div class="row" style="gap:8px;margin-bottom:6px;align-items:center;flex-wrap:wrap">
            <span style="font-size:20px">${U.esc(e.ico)}</span><b>${U.esc(e.name)}</b>
            <span class="tag cyan">${U.esc(e.style)}</span>
            <span class="tag green">我的</span>
            ${e.evolutions ? `<span class="tag" title="已自进化次数">🧠×${e.evolutions}</span>` : ''}
            ${hired && hired.id === e.id ? '<span class="tag green">✓ 雇佣中</span>' : ''}
          </div>
          <div class="row wrap" style="gap:4px;margin-bottom:8px">${(e.tags || []).map(t => `<span class="tag">${U.esc(t)}</span>`).join('')}</div>
          <p class="small muted" style="line-height:1.7;margin-bottom:8px">${U.esc(e.desc || '')}</p>
          <div class="small muted" style="line-height:1.7;margin-bottom:10px;border-top:1px dashed var(--border2);padding-top:8px">
            ${DIR_DIMS.map(d => `<div>· <b>${d}</b>:${U.esc(((e.dims || {})[d] || '').slice(0, 20))}…</div>`).join('')}
          </div>
          <div class="row" style="gap:8px;flex-wrap:wrap">
            <button class="btn sm ${hired && hired.id === e.id ? '' : 'primary'}" data-hire="${e.id}" ${hired && hired.id === e.id ? 'disabled' : ''}>${hired && hired.id === e.id ? '✓ 雇佣中' : '⚡ 雇佣该导演'}</button>
            <button class="btn sm" data-cedit="${e.id}">✏ 编辑</button>
            <button class="btn sm" data-cevolve="${e.id}" title="从使用记录进化:把导演助手记忆里你的纠正/偏好蒸馏为该专家的进化条款,追加进人设(1积分)">🧠 进化</button>
            <button class="btn sm" data-cdel="${e.id}">🗑 删除</button>
          </div>
        </div>`).join('')}
      </div>` : ''}
      <div style="margin:18px 0 10px"><b>🧩 功能专家</b><span class="small muted" style="margin-left:8px">不做全局风格雇佣;供「项目管理 → 制片 → 智能体分工」各板块 Agent 按需调用,被调用板块的 Agent 即获得其专业能力</span></div>
      <div class="grid" style="grid-template-columns:1fr 1fr;gap:14px">
        ${funcs.map(e => `
        <div class="card" style="padding:16px">
          <div class="row" style="gap:8px;margin-bottom:6px;align-items:center;flex-wrap:wrap">
            <span style="font-size:20px">${U.esc(e.ico)}</span><b>${U.esc(e.name)}</b>
            <span class="tag yellow">功能专家</span>
            ${e.custom ? '<span class="tag green">我的</span>' : ''}
            ${e.custom && e.evolutions ? `<span class="tag" title="已自进化次数">🧠×${e.evolutions}</span>` : ''}
          </div>
          <div class="row wrap" style="gap:4px;margin-bottom:8px">${(e.tags || []).map(t => `<span class="tag">${U.esc(t)}</span>`).join('')}</div>
          <p class="small muted" style="line-height:1.7;margin-bottom:10px">${U.esc(e.desc || '')}</p>
          <div class="row" style="gap:8px;flex-wrap:wrap">
            <button class="btn sm" data-x="tolab">到板块中雇佣调用 →</button>
            ${e.custom ? `<button class="btn sm" data-cedit="${e.id}">✏ 编辑</button><button class="btn sm" data-cevolve="${e.id}" title="从使用记录进化:把导演助手记忆里你的纠正/偏好蒸馏为该专家的进化条款,追加进人设(1积分)">🧠 进化</button><button class="btn sm" data-cdel="${e.id}">🗑 删除</button>` : ''}
          </div>
        </div>`).join('')}
      </div>`;
      body.querySelectorAll('[data-x=tolab]').forEach(b2 => b2.onclick = toLab);
      body.querySelectorAll('[data-cedit]').forEach(b => b.onclick = () => {
        // 编辑自定义专家:切回专家工坊并打开预填表单
        mode = 'forge';
        main.querySelectorAll('[data-gmode]').forEach(x => x.classList.toggle('active', x.dataset.gmode === 'forge'));
        renderForge();
        const e = customExperts().find(x => x.id === b.dataset.cedit);
        if (e) openExpertForm(e, e.id);
      });
      body.querySelectorAll('[data-cdel]').forEach(b => b.onclick = () => delCustomExpert(b.dataset.cdel, renderExperts));
      body.querySelectorAll('[data-cevolve]').forEach(b => b.onclick = () => evolveExpert(customExperts().find(x => x.id === b.dataset.cevolve), renderExperts));

      body.querySelectorAll('[data-hire]').forEach(b => b.onclick = () => {
        hireExpert(allExperts().find(x => x.id === b.dataset.hire), renderExperts);
      });
      const fireBtn = body.querySelector('[data-x=fire]');
      if (fireBtn) fireBtn.onclick = () => U.confirm('解雇后恢复系统默认模板与导演设定,确认解雇吗?', () => {
        const s2 = Object.assign({}, Store.state.settings);
        delete s2.hiredExpert;
        s2.directorSetting = null;
        s2.tplImage = DEFAULTS.tplImage; s2.tplVideo = DEFAULTS.tplVideo; s2.tplReview = DEFAULTS.tplReview;
        Store.state.settings = s2;
        Store.save();
        U.toast('已解雇,恢复系统默认配置', 'success');
        renderExperts();
      }, '解雇');
    }

    renderForge();
  };
})();
