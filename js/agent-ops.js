/* ============ agent-ops.js 导演助手 ops 执行域(自 agent.js 拆分) ============
 * 动作执行器(run/select/goto 真实驱动工作台)/预排模式族/上下文与分镜压缩/工作台定位/
 * ops 应用器(update/insert/delete/move/batch + 脚本层)与执行闭环验证。
 * 加载顺序:agent.js 之后(agent.js 先建 window.AgentCore;本文件建 window.AgentOps 供其运行时取用)。 */
(function () {
  const AC = window.AgentCore;
  const FIELD_MAP = { 剧情: 'plot', 名称: 'name', 运镜: 'camera', 视角: 'view', 角度: 'angle', 景别: 'shotSize', 光圈: 'aperture', 提示词: 'prompt', 旁白: 'narration', 台词: 'dialogue', 时长: 'duration' };

  /* ================= 工作台动作执行器(Agent 真执行,不只是对话) =================
   * 动作类 ops 通过真实按钮点击驱动工作台,原功能的计费/退费/任务登记链路不变 */
  const DATA_OPS = ['update', 'insert', 'delete', 'move', 'batch', 'project', 'scriptmeta', 'subject', 'episode', 'addep', 'delep', 'beatupdate', 'sceneupdate'];
  const ACT_OPS = ['run', 'goto', 'select'];
  const splitOps = ops => ({
    data: (ops || []).filter(o => o && DATA_OPS.includes(o.op)),
    acts: (ops || []).filter(o => o && ACT_OPS.includes(o.op)),
  });

  /* ---- 工具注册表 + 分级审批(Codex Harness 理念):每个 op 注册风险级,决定预览标注与自动执行审批闸 ----
   * read=只读(自动模式直执行);edit=常规数据修改(预览卡照旧/自动直执行);edit-hi=高风险删除类(预览卡红色标记);
   * exec=真实驱动工作台(按该功能规则扣费,即使 agentAuto 开启也需 U.confirm 确认后才执行) */
  const OP_TOOLS = {
    update: { risk: 'edit', label: '修改镜头' }, insert: { risk: 'edit', label: '插入镜头' }, delete: { risk: 'edit-hi', label: '删除镜头' },
    move: { risk: 'edit', label: '移动镜头' }, batch: { risk: 'edit', label: '批量修改' }, beatupdate: { risk: 'edit', label: '修改节拍' }, sceneupdate: { risk: 'edit', label: '修改场次' },
    project: { risk: 'edit', label: '修改项目' }, scriptmeta: { risk: 'edit', label: '修改剧本' }, subject: { risk: 'edit', label: '修改主体' },
    episode: { risk: 'edit', label: '修改分集' }, addep: { risk: 'edit', label: '新建分集' }, delep: { risk: 'edit-hi', label: '删除分集' },
    select: { risk: 'read', label: '选中镜头' }, goto: { risk: 'read', label: '切换视图' }, run: { risk: 'exec', label: '执行功能' },
  };
  const opRisk = op => (OP_TOOLS[op && op.op] || { risk: 'edit' }).risk;
  /* 动作类 op → 预览/审批描述(exec 级 run 前加 ⚠ 并注明按该功能规则扣费) */
  function actDesc(o) {
    if (o.op === 'run') return `⚠ ▶ 执行:${o.action}(按该功能规则扣费)`;
    if (o.op === 'goto') return '→ 跳转:' + o.target;
    return '◎ 选中镜头 ' + o.shot;
  }
  /* 预览卡单行渲染(风险分组标注):edit-hi(删除镜头/分集)红色标记,exec 的 ⚠ 已在 actDesc 注明,edit 项照旧 */
  function changeLineHTML(c) {
    const hi = /^删除(镜头|分集)/.test(c);
    return `<div class="small"${hi ? ' style="color:var(--red)"' : ''}>· ${hi ? '🔴 ' : ''}${U.esc(c)}</div>`;
  }
  // 分镜工作区动作 → 真实按钮(下拉项处理函数绑定即生效,直接 click 即可触发)
  const WB_RUN = {
    '智能分镜': ['[data-x=dd-sb]'], '生成分镜': ['[data-x=dd-sb]'], // AI分镜师入口已整合进智能分镜(评审修订),不再单列
    'AI拆解': ['[data-x=bd-ai]'], '拆解场次节拍': ['[data-x=bd-ai]'], '拆解文字分镜': ['[data-x=bd-draft]'],
    '生成视频': ['[data-x=genv]'], '批量生成视频': ['[data-x=genv]'],
    '合成成片': ['[data-x=compose]'], '整集审片': ['[data-x=epreview]'], // 「预览长视频」顶栏入口已改为「显示方式」,预览播放器经成片库/Pipeline 进入
  };
  const WB_GOTO = { '分镜脚本': 'board', '脚本层': 'board', '分镜表': 'shots', '分镜视频': 'shots', '分镜表模式': 'shots', '剪辑': 'cut', '剪辑台': 'cut', '节拍板': 'bb', '节拍板模式': 'bb', '镜头组': 'groups' };
  function runEpisodeActions(p, ep, acts, main) {
    const done = [];
    for (const op of acts) {
      if (op.op === 'run') {
        const sels = WB_RUN[String(op.action || '').trim()];
        if (!sels) continue;
        sels.forEach(sel => { const el = main.querySelector(sel); if (el) el.click(); });
        done.push('▶ 执行:' + op.action);
      } else if (op.op === 'select') {
        const n = (+op.shot) - 1, s = ep.shots[n];
        if (s) { ep.uiSel = s.id; Store.save(); done.push('◎ 选中镜头 ' + (n + 1)); }
      } else if (op.op === 'goto') {
        const t = String(op.target || '').trim();
        if (t.includes('跑批')) { location.hash = '#/project/' + p.id + '/produce'; done.push('→ 一键跑批中心'); }
        else if (WB_GOTO[t]) { window.__epView = WB_GOTO[t]; done.push('→ 切换到' + t); }
      }
    }
    return done;
  }
  // 项目级/全局动作
  const PROJ_TAB_OF = { '制片': '制片', '剧本': '剧本', '导演': '导演', '主体': '主体', '分集': '分集', '成片库': '成片库', '剧壳': '剧壳', '切片': '切片' };
  function runGlobalActions(ctx, acts) {
    const { p, ep } = ctx;
    const done = [];
    for (const op of acts) {
      if (op.op === 'goto') {
        const t = String(op.target || '').trim();
        if (!p) continue;
        if (t.includes('跑批')) { location.hash = '#/project/' + p.id + '/produce'; done.push('→ 一键跑批中心'); }
        else if (t === '分镜' || t === '生成' || t === '剪辑') {
          const ep0 = ep || p.episodes[0];
          if (ep0) { window.__epView = t === '分镜' ? 'board' : (t === '生成' || t === '剪辑') ? 'cut' : 'shots'; location.hash = `#/project/${p.id}/episode/${ep0.id}`; done.push('→ ' + t + '(进入分集工作区)'); }
        } else if (PROJ_TAB_OF[t]) { window.__projTab = PROJ_TAB_OF[t]; location.hash = '#/project/' + p.id; done.push('→ 打开' + t); }
      } else if (op.op === 'run' && p) {
        const a = String(op.action || '').trim();
        if (/策划/.test(a) && window.EpisodeLab) { EpisodeLab.openPlanner(p, document.getElementById('main')); done.push('▶ 执行:AI 策划'); }
        else if (/译制/.test(a) && window.EpisodeLab) { EpisodeLab.openLocalize(p, document.getElementById('main')); done.push('▶ 执行:剧本译制'); }
      }
    }
    return done;
  }

  /* ================= 🎛 预排模式(创作意图 → 参数表单预填,用户确认后才执行) =================
   * 开启后生成类意图不走 ops/pending,而是让 LLM 返回「参数预排方案」,渲染为可编辑参数卡片;
   * 「按此方案执行」只把参数写入 ep.sbConfig 并调起真实功能入口,扣费/确认/失败语义全由原入口承担。 */

  // 预排参数字段定义:键与 ep.sbConfig 对齐(默认值见 storyboard.js defaultSBConfig)
  const PREARR_TITLE = { sb: '智能分镜 · 参数预排', batchvideo: '批量生成视频 · 参数预排' };
  const PREARR_FIELDS = {
    sb: [ // 分镜生成类
      { k: 'shotCount', t: '分镜数量', type: 'number', min: 2, max: 40 },
      { k: 'sbMode', t: '分镜模式', type: 'seg', opts: [['create', '创作模式'], ['tweet', '推文模式']] },
      { k: 'shotDur', t: '单镜时长(秒)', type: 'number', min: 2, max: 15 },
      { k: 'batchVideoModel', t: '视频模型', type: 'select', opts: () => (window.MODELS ? MODELS.video : []) },
      { k: 'quality', t: '画质', type: 'select', opts: ['480p', '720p', '1080p'] },
      { k: 'ratio', t: '比例', type: 'select', opts: ['16:9', '9:16', '1:1'] },
      { k: 'autoOptimize', t: '自动优化提示词', type: 'bool' },
      { k: 'smartReview', t: '智能审片(生成后自动评审)', type: 'bool' },
    ],
    batchvideo: [ // 批量生成类
      { k: 'batchVideoModel', t: '视频模型', type: 'select', opts: () => (window.MODELS ? MODELS.video : []) },
      { k: 'quality', t: '画质', type: 'select', opts: ['480p', '720p', '1080p'] },
      { k: 'ratio', t: '比例', type: 'select', opts: ['16:9', '9:16', '1:1'] },
      { k: 'batchStrategy', t: '生成策略', type: 'select', opts: () => (window.STRATEGIES ? STRATEGIES.map(s => [s.id, s.name]) : [['ref', '分镜参考'], ['fusion', '多图融合'], ['frames', '首尾帧']]) },
      { k: 'batchCamera', t: '运镜', type: 'select', opts: () => (window.SB && SB.CAMERAS ? SB.CAMERAS : (window.CAMERAS || [])) },
    ],
  };

  /* 参数钳制:以 ep.sbConfig 当前值为底,LLM 给出的值做类型/范围校验,未知键丢弃 */
  function clampPrearrParams(action, raw, ep) {
    const base = (ep && ep.sbConfig) || {};
    const out = {};
    (PREARR_FIELDS[action] || []).forEach(f => {
      const has = raw && raw[f.k] !== undefined;
      let v = has ? raw[f.k] : base[f.k];
      if (f.type === 'number') {
        v = Math.round(+v);
        if (!isFinite(v) || v <= 0) v = f.k === 'shotDur' ? 5 : 8;
        v = Math.max(f.min, Math.min(f.max, v));
      } else if (f.type === 'bool') {
        v = has ? (v === true || v === 'true' || v === 1) : !!base[f.k];
      } else { // select/seg:值必须落在可选清单内,否则回退当前配置,再退首项
        const opts = (typeof f.opts === 'function' ? f.opts() : f.opts).map(o => Array.isArray(o) ? o[0] : o);
        v = String(v == null ? '' : v);
        if (!opts.includes(v)) v = opts.includes(String(base[f.k])) ? String(base[f.k]) : String(opts[0] || '');
      }
      out[f.k] = v;
    });
    return out;
  }

  /* 方案摘要(用于记忆/消息尾注),如「12镜/推文模式/1080p/16:9」 */
  function prearrDigest(plan) {
    const pr = plan.params || {};
    const bits = [];
    if (plan.action === 'sb') {
      if (pr.shotCount) bits.push(pr.shotCount + '镜');
      bits.push(pr.sbMode === 'tweet' ? '推文模式' : '创作模式');
      if (pr.shotDur) bits.push(pr.shotDur + 's/镜');
    }
    if (pr.batchVideoModel) bits.push(pr.batchVideoModel);
    if (pr.quality) bits.push(pr.quality);
    if (pr.ratio) bits.push(pr.ratio);
    if (plan.action === 'batchvideo') {
      if (pr.batchStrategy) { const st = window.STRATEGIES && STRATEGIES.find(s => s.id === pr.batchStrategy); bits.push(st ? st.name : pr.batchStrategy); }
      if (pr.batchCamera) bits.push(pr.batchCamera);
    }
    return bits.join('/');
  }

  /* 预排方案卡片:可编辑参数表单(沿用 input/select/model-row/check-line 现有 CSS 类) */
  function prearrCardHTML(plan, msgIdx, pre) {
    const fields = PREARR_FIELDS[plan.action] || [];
    const fieldHTML = f => {
      const cur = plan.params[f.k];
      if (f.type === 'number') return `<label class="field"><span>${f.t}</span><input class="input" type="number" data-pf="${f.k}" min="${f.min}" max="${f.max}" value="${cur}"></label>`;
      if (f.type === 'bool') return `<div class="check-line" data-pbool="${f.k}"><span class="switch ${cur ? 'on' : ''}"></span><div class="small">${f.t}</div></div>`;
      if (f.type === 'seg') return `<label class="field"><span>${f.t}</span><div class="model-row">${f.opts.map(([v, t]) => `<div class="model-opt ${cur === v ? 'sel' : ''}" data-pseg="${v}" data-pfield="${f.k}">${t}</div>`).join('')}</div></label>`;
      const list = typeof f.opts === 'function' ? f.opts() : f.opts;
      return `<label class="field"><span>${f.t}</span><select class="select" data-pf="${f.k}">${list.map(o => { const [v, t] = Array.isArray(o) ? o : [o, o]; return `<option value="${U.esc(v)}" ${String(cur) === String(v) ? 'selected' : ''}>${U.esc(t)}</option>`; }).join('')}</select></label>`;
    };
    return `
    <div class="agent-preview" data-${pre}-pcard="${msgIdx}">
      <b class="small">🎛 ${PREARR_TITLE[plan.action] || '参数预排'}</b>
      <div class="hint" style="margin:4px 0 8px">${U.esc(plan.summary || '')}</div>
      ${fields.map(fieldHTML).join('')}
      <div class="row" style="gap:6px;margin-top:8px">
        <button class="btn sm primary" data-${pre}-prun="${msgIdx}">▶ 按此方案执行</button>
        <button class="btn sm" data-${pre}-pedit="${msgIdx}">✏ 再改改</button>
        <button class="btn sm" data-${pre}-pcancel="${msgIdx}">取消</button>
      </div>
    </div>`;
  }

  /* 卡片控件 → plan.params 双向同步(执行时直接读 plan.params) */
  function bindPrearrCard(card, plan) {
    const fields = PREARR_FIELDS[plan.action] || [];
    card.querySelectorAll('[data-pf]').forEach(el => el.onchange = () => {
      const f = fields.find(x => x.k === el.dataset.pf);
      plan.params[el.dataset.pf] = f && f.type === 'number'
        ? Math.max(f.min, Math.min(f.max, Math.round(+el.value) || f.min))
        : el.value;
    });
    card.querySelectorAll('[data-pbool]').forEach(el => el.onclick = () => {
      const k = el.dataset.pbool;
      plan.params[k] = !plan.params[k];
      el.querySelector('.switch').classList.toggle('on', !!plan.params[k]);
    });
    card.querySelectorAll('[data-pseg]').forEach(o => o.onclick = () => {
      plan.params[o.dataset.pfield] = o.dataset.pseg;
      card.querySelectorAll(`[data-pfield="${o.dataset.pfield}"]`).forEach(x => x.classList.toggle('sel', x === o));
    });
  }

  /* 按此方案执行:参数写入 ep.sbConfig → Store.save() → 调起真实功能入口(扣费/确认闸由原入口承担) */
  function execPrearr(ctx, plan, main) {
    const { p, ep } = ctx;
    if (!p || !ep) { U.toast('请先进入分集工作区再执行预排方案', 'error'); return false; }
    ep.sbConfig = ep.sbConfig || {};
    Object.assign(ep.sbConfig, plan.params);
    if (plan.action === 'batchvideo') {
      // 与「参数配置」面板一致:批量参数落到现有镜头(生成时优先读镜头自身字段)
      ep.shots.forEach(s => {
        s.videoModel = ep.sbConfig.batchVideoModel; s.camera = ep.sbConfig.batchCamera; s.genStrategy = ep.sbConfig.batchStrategy;
      });
    }
    Store.save();
    U.toast('参数已预排,正在发起…', 'info', 2000);
    const m = main || document.getElementById('main');
    if (plan.action === 'sb') {
      // 等价路径:点击工作台「智能分镜」真实入口(与 WB_RUN 一致,扣费/理解闸由 runSmartSB 承担)
      const btn = m && m.querySelector('[data-x=dd-sb]');
      if (!btn) { U.toast('未找到智能分镜入口,请切换到该分集的分镜工作区', 'error'); return false; }
      btn.click();
    } else {
      const pend = ep.shots.filter(s => !s.final && (!s.video || s.video.status !== 'done'));
      if (!pend.length) { U.toast('所有分镜视频均已生成', 'info'); return false; }
      const run = () => window.SB.batchGenVideos(p, ep, m, pend);
      if (window.HumanReview) { // 与原「批量生成视频」相同的真人审核预审闸,不绕过
        const urls = [...new Set(pend.flatMap(s => HumanReview.shotImageUrls(p, s)))];
        HumanReview.guard(urls, run);
      } else run();
    }
    return true;
  }

  /* 绑定卡片三按钮;h: {getChat, exec, edit, done, scope} */
  function bindPrearr(root, pre, h) {
    const dk = k => pre + k.charAt(0).toUpperCase() + k.slice(1);
    root.querySelectorAll(`[data-${pre}-pcard]`).forEach(card => {
      const m2 = h.getChat(+card.dataset[dk('pcard')]);
      if (m2 && m2.prearr) bindPrearrCard(card, m2.prearr);
    });
    root.querySelectorAll(`[data-${pre}-prun]`).forEach(b => b.onclick = () => {
      const m2 = h.getChat(+b.dataset[dk('prun')]);
      if (!m2 || !m2.prearr) return;
      const plan = m2.prearr;
      if (!h.exec(plan)) return; // 入口缺失/无可生成镜头:保留卡片待用户调整
      m2.prearr = null;
      m2.text += `\n(🎛 预排方案已确认:${plan.summary || PREARR_TITLE[plan.action]})`;
      AC.memRemember(`用户确认预排方案:${prearrDigest(plan)}${plan.summary ? ' — ' + plan.summary.slice(0, 50) : ''}`, h.scope);
      h.done();
    });
    root.querySelectorAll(`[data-${pre}-pedit]`).forEach(b => b.onclick = () => h.edit());
    root.querySelectorAll(`[data-${pre}-pcancel]`).forEach(b => b.onclick = () => {
      const m2 = h.getChat(+b.dataset[dk('pcancel')]);
      if (m2) { m2.prearr = null; m2.text += '(已取消预排)'; h.done(); }
    });
  }

  /* ---- 关键环节推荐选项卡(创作方向/风格/方案等关键决策点,Agent 给 2-4 个推荐选项,用户单选提交后继续) ----
   * LLM 协议:返回 JSON 可选键 "choices":{"title":"选择主题(如:复仇方向选择)","options":[{"t":"方向一:标题","d":"一句话描述"}](2-4个)} */
  function parseChoices(out) {
    const ch = out && out.choices;
    if (!ch || !Array.isArray(ch.options)) return null;
    const opts = ch.options.filter(o => o && o.t).slice(0, 4).map(o => ({ t: String(o.t).slice(0, 40), d: String(o.d || '').slice(0, 80) }));
    return opts.length >= 2 ? { title: String(ch.title || '请选择一个方向').slice(0, 30), options: opts } : null;
  }
  /* 选项卡渲染:标题(可折叠箭头)+ 单选选项卡 + 底部「提交」;已提交(choiceDone)后置灰展示结果,不可再改 */
  function choiceCardHTML(m2, msgIdx, pre) {
    const ch = m2.choices;
    if (m2.choiceDone) return `
    <div class="agent-choice done">
      <div class="agent-choice-head"><b>✓ ${U.esc(ch.title)}</b><span class="agent-choice-done-tag">已选择:${U.esc(m2.choiceDone)}</span></div>
    </div>`;
    return `
    <div class="agent-choice" data-${pre}-choice="${msgIdx}">
      <div class="agent-choice-head" data-${pre}-chfold title="点击折叠/展开"><span class="agent-choice-arrow">▾</span><b>${U.esc(ch.title)}</b><span class="agent-choice-hint">单选</span></div>
      <div class="agent-choice-opts">
        ${ch.options.map((o, oi) => `
        <div class="agent-choice-opt" data-${pre}-chopt="${oi}">
          <div class="agent-choice-t">${U.esc(o.t)}</div>
          ${o.d ? `<div class="agent-choice-d">${U.esc(o.d)}</div>` : ''}
          <span class="agent-choice-ck">✓</span>
        </div>`).join('')}
      </div>
      <button class="agent-choice-submit" data-${pre}-chsub="${msgIdx}" disabled>提交</button>
    </div>`;
  }
  /* 选项卡绑定(集级 a / 全局 g 前缀复用,同 bindPrearr 模式):单选 → 提交 → 置灰存 choiceDone + 以「我选择:xxx」自动发送 */
  function bindChoices(root, pre, h) { // h:{getChat, submit(m2, opt)}
    const dk = k => pre + k.charAt(0).toUpperCase() + k.slice(1);
    root.querySelectorAll(`[data-${pre}-choice]`).forEach(card => {
      const msgIdx = +card.dataset[dk('choice')];
      card.dataset.chSel = '';
      card.querySelectorAll(`[data-${pre}-chopt]`).forEach(opt => opt.onclick = () => {
        card.dataset.chSel = opt.dataset[dk('chopt')];
        card.querySelectorAll(`[data-${pre}-chopt]`).forEach(x => x.classList.toggle('sel', x === opt));
        const sub = card.querySelector(`[data-${pre}-chsub]`);
        if (sub) sub.disabled = false;
      });
      const fold = card.querySelector(`[data-${pre}-chfold]`);
      if (fold) fold.onclick = () => card.classList.toggle('fold');
      const sub = card.querySelector(`[data-${pre}-chsub]`);
      if (sub) sub.onclick = () => {
        const m2 = h.getChat(msgIdx);
        if (!m2 || !m2.choices || m2.choiceDone) return;
        const o = m2.choices.options[+card.dataset.chSel];
        if (!o) return;
        sub.disabled = true;
        h.submit(m2, o);
      };
    });
  }

  /* 预排模式 LLM 协议:返回 {"plan":{"action":"sb"|"batchvideo","summary":"一句话方案","params":{...}}} + {"reply":"给用户的解释"} */
  function prearrPrompt(p, ep, sysExtra) {
    const c = (ep && ep.sbConfig) || {};
    const vmodels = window.MODELS ? MODELS.video.join('/') : '';
    const cams = (window.SB && SB.CAMERAS ? SB.CAMERAS : (window.CAMERAS || [])).join('/');
    const strats = window.STRATEGIES ? STRATEGIES.map(s => s.id + '=' + s.name).join(',') : 'ref=分镜参考,fusion=多图融合,frames=首尾帧';
    return `你是「虎鲸导演助手」,短剧创作智能体,当前处于「🎛 预排模式」。${sysExtra || ''}
用户输入创作意图,你【不直接执行任何修改、不返回 ops】,而是输出一个「参数预排方案」,由用户确认后才执行。
返回 JSON {"reply":"给用户的解释(说明方案思路)","thinking":"一句话思考摘要","plan":{"action":"sb|batchvideo","summary":"一句话方案说明","params":{...}}}。
action 二选一:
- "sb":智能分镜/拆镜/生成分镜类意图。params 可用键(对齐分镜配置,数值必须钳在范围内):
  shotCount 整数2-40;sbMode "create"(创作模式)或"tweet"(推文模式);shotDur 数字2-15(秒/镜);batchVideoModel 视频模型;quality "480p"|"720p"|"1080p";ratio "16:9"|"9:16"|"1:1";autoOptimize true/false(自动优化提示词);smartReview true/false(智能审片)
- "batchvideo":批量生成视频类意图。params 可用键:
  batchVideoModel;quality "480p"|"720p"|"1080p";ratio "16:9"|"9:16"|"1:1";batchStrategy(${strats});batchCamera 运镜(${cams})
可用视频模型:${vmodels}。
只输出用户明确提到或可合理推断的键,其余省略(执行时以当前配置为底)。当前配置:${JSON.stringify({ shotCount: c.shotCount, sbMode: c.sbMode, shotDur: c.shotDur, batchVideoModel: c.batchVideoModel, quality: c.quality, ratio: c.ratio, autoOptimize: c.autoOptimize, smartReview: c.smartReview, batchStrategy: c.batchStrategy, batchCamera: c.batchCamera })}
无法判断属于哪类生成意图时【不要返回 plan】,按普通创作顾问对话回答(只给 reply)。`;
  }

  /* 预排模式发送(集级/板块助手共用):o={p, ep, chat, text, model, sysExtra, renderMsgs}
   * 七轮计费贯通:预排也是一次 LLM 调用(llm.agent=1/条,失败退费),解析重试共用同一 operationId 幂等 */
  async function prearrSend(o) {
    const { p, ep, chat, text, model } = o;
    const tk = Tasks.start({ type: '导演助手·预排', model, target: (ep ? ep.title : p ? p.name : '全局') + '·' + text.slice(0, 12), projectId: p && p.id, episodeId: ep && ep.id });
    const agOpId = 'ag_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    const paid = API.isReady() ? U.charge(1, '预排模式对话') : false;
    if (API.isReady() && !paid) {
      Tasks.fail(tk, '积分不足');
      chat.push({ role: 'assistant', text: '积分不足,预排对话每条 1 积分。', time: Store.now() });
      Store.save(); o.renderMsgs();
      return;
    }
    let out;
    try {
      let info = p ? `项目:${p.name}(${p.style || ''})\n` : '';
      if (ep) info += `分集:${ep.title},剧本 ${(ep.content || '').length} 字,已有分镜 ${ep.shots.length} 镜\n本集剧本摘要:${(ep.content || '').slice(0, 300)}\n`;
      out = await Understanding.chatJSONRobust({
        model,
        system: prearrPrompt(p, ep, o.sysExtra),
        user: info + `\n用户意图:${text}`,
        temperature: 0.4, max_tokens: 3000,
        billingAction: 'llm.agent', operationId: agOpId,
      });
      Tasks.done(tk);
    } catch (e) {
      if (paid) U.refund(1, '预排对话失败退费', agOpId);
      Tasks.fail(tk, e.message);
      chat.push({ role: 'assistant', text: '预排失败(' + e.message + '),未做任何改动。', time: Store.now() });
      Store.save(); o.renderMsgs();
      return;
    }
    const msg = { role: 'assistant', text: String(out.reply || '收到。'), thinking: String(out.thinking || ''), time: Store.now() };
    const plan = out.plan && PREARR_FIELDS[out.plan.action] ? out.plan : null; // action 无法判断时回退普通对话
    if (plan && ep) {
      msg.prearr = { action: plan.action, summary: String(plan.summary || ''), params: clampPrearrParams(plan.action, plan.params, ep) };
    } else if (plan && !ep) {
      msg.text += '\n(预排方案需在分集工作区执行,请先进入一个分集)';
    }
    chat.push(msg);
    Store.save();
    o.renderMsgs();
  }

  /* ---- 上下文压缩:消息 >24 条且 LLM 在线时,把较旧消息(除最近 12 条)静默蒸馏为 ≤150 字「会话纪要」 ----
   * 异步后台执行:不登记任务;压缩中用旧摘要,不阻塞发送;失败静默回退硬截。返回 {summary, recent}
   * 计费贯通:传当前消息的 operationId(与路由/回复共用同 opId,step:'cmp' 辅助步骤槽位)
   * ——蒸馏调用计入该条消息的 1 积分(九轮步骤状态机:辅助步不交付 operation),不再按 llm.chat 另扣 */
  const compacting = {}; // key → 是否压缩中(防并发重复蒸馏)
  function compactChat(arr, summaryObj, key, opId) {
    const list = Array.isArray(arr) ? arr : [];
    const recent = list.slice(-12);
    const summary = String((summaryObj && summaryObj[key]) || '');
    if (list.length > 24 && summaryObj && !compacting[key] && window.API && API.isReady()) {
      compacting[key] = true;
      const lines = list.slice(0, -12).map(m2 => (m2.role === 'user' ? '用户:' : '助手:') + String(m2.text || '').replace(/\s+/g, ' ').slice(0, 120));
      API.chatJSON({
        model: (Store.state.settings || {}).defLLM || API.getConfig().model,
        system: '你是会话纪要整理器。把以下短剧创作协作对话蒸馏为≤150字的「会话纪要」,保留:用户的修改意图与偏好、已确认的决定、未完成事项。只返回 JSON {"summary":"..."}',
        messages: [{ role: 'user', content: (summary ? '此前纪要:' + summary + '\n' : '') + '对话记录:\n' + lines.join('\n') }],
        temperature: 0.2, max_tokens: 400,
        billingAction: opId ? 'llm.agent' : undefined, operationId: opId, step: 'cmp',
      }).then(out => {
        if (out && out.summary) { summaryObj[key] = String(out.summary).slice(0, 300); Store.save(); }
      }).catch(() => { /* 静默回退硬截 */ }).then(() => { compacting[key] = false; });
    }
    return { summary, recent };
  }
  /* 最近消息 → 注入 prompt 的文本行(调用方自行剔除刚发出的本条) */
  function chatLines(recent) {
    return recent.map(m2 => (m2.role === 'user' ? '用户:' : '助手:') + String(m2.text || '').replace(/\s+/g, ' ').slice(0, 100)).join('\n');
  }

  /* ---- 分镜表压缩(长则截断) ---- */
  function compactShots(ep, maxShots) {    maxShots = maxShots || 20;
    const shots = ep.shots.slice(0, maxShots).map((s, i) => ({
      镜头: i + 1, 名称: (s.name || '').slice(0, 10), 剧情: (s.plot || '').slice(0, 50),
      运镜: s.camera, 机位: s.cameraSpec ? CAMERA.describe(s.cameraSpec) : '',
      提示词: (s.prompt || '').slice(0, 60), 旁白: (s.narration || '').slice(0, 30), 台词: (s.dialogue || '').slice(0, 30), 时长: (window.SB && SB.estShotDuration ? SB.estShotDuration(s) : (s.duration || 5)),
    }));
    let json = JSON.stringify(shots);
    if (json.length > 6000) json = json.slice(0, 6000) + '…(后续镜头截断,共' + ep.shots.length + '镜)';
    return json;
  }

  /* ---- 当前工作台定位(索引关联):用户在脚本层聚焦的场次/节拍,或分镜表选中镜头 ----
   * 用户在哪个板块操作,导演助手就默认针对哪里思考与修改;storyboard 脚本层通过 window.__focus 上报 */
  function focusOf(p, ep) {
    if (!p || !ep) return null;
    const f = window.__focus;
    const bd = ep.scriptBoard;
    if (f && f.pid === p.id && f.eid === ep.id && bd && bd.scenes) {
      if (f.kind === 'beat' && bd.scenes[f.si] && bd.scenes[f.si].beats[f.bi]) {
        return { kind: 'beat', si: f.si, bi: f.bi, label: `@${ep.title}·场次${f.si + 1}·节拍${f.bi + 1}`, scene: bd.scenes[f.si], beat: bd.scenes[f.si].beats[f.bi] };
      }
      if (f.kind === 'scene' && bd.scenes[f.si]) {
        return { kind: 'scene', si: f.si, label: `@${ep.title}·场次${f.si + 1}`, scene: bd.scenes[f.si] };
      }
    }
    const idx = (ep.shots || []).findIndex(s => s.id === ep.uiSel);
    if (idx >= 0) return { kind: 'shot', idx, label: `@${ep.title}·镜头${idx + 1}`, shot: ep.shots[idx] };
    return null;
  }
  /* 定位 → 注入 LLM 的上下文文本(含该定位的当前内容,助手据此直接改) */
  function focusBlock(p, ep) {
    const fc = focusOf(p, ep);
    if (!fc) return '';
    let txt = `\n★ 用户当前工作台定位:${fc.label} —— 用户说的「这里/这个/当前」默认指它,修改请优先针对它。`;
    if (fc.kind === 'beat') {
      const b = fc.beat;
      txt += `\n该定位当前内容:场次${fc.si + 1}「${(fc.scene.title || '').slice(0, 30)}」 节拍${fc.si + 1}.${fc.bi + 1} 情绪[${b.emotion || '平'}] 剧情:「${(b.plot || '').slice(0, 80)}」 分镜文字:「${(b.shot || '').slice(0, 140)}」`;
    } else if (fc.kind === 'scene') {
      txt += `\n该定位当前内容:场次${fc.si + 1}「${(fc.scene.title || '').slice(0, 30)}」 场次剧情:「${(fc.scene.text || '').slice(0, 140)}」`;
    } else if (fc.kind === 'shot') {
      const s = fc.shot;
      txt += `\n该定位当前内容:镜头${fc.idx + 1} 剧情:「${(s.plot || '').slice(0, 60)}」 提示词:「${(s.prompt || '').slice(0, 90)}」`;
    }
    return txt;
  }

  /* ---- ops 应用器(update/insert/delete/move/batch) ---- */
  function applyFields(s, fields, changes, idx, record) {
    Object.entries(fields || {}).forEach(([k, v]) => {
      const key = FIELD_MAP[k] || k;
      if (['view', 'angle', 'shotSize', 'aperture'].includes(key)) {
        s.cameraSpec = s.cameraSpec || { view: '正面', angle: '平视', shotSize: '中景', aperture: 'ƒ/4' };
        const old = s.cameraSpec[key];
        s.cameraSpec[key] = String(v);
        if (old !== s.cameraSpec[key]) changes.push(`镜头${idx + 1}:${k} ${old || '空'}→${String(v).slice(0, 12)}`);
      } else if (key === 'duration') {
        const old = s.duration;
        s.duration = Math.max(1, Math.min(60, +v || old || 5));
        if (old !== s.duration) changes.push(`镜头${idx + 1}:时长 ${old}→${s.duration}s`);
      } else if (key === 'prompt') {
        // 提示词统一走 Store.setShotPrompt 留档;预览试算(record=false,克隆对象)直接赋值,避免多余 save
        const old = s.prompt;
        if (record) Store.setShotPrompt(s, String(v));
        else s.prompt = String(v);
        if (String(old || '') !== s.prompt) changes.push(`镜头${idx + 1}:${k} ${String(old || '').slice(0, 10) || '空'}→${String(v).slice(0, 10)}`);
      } else {
        const old = s[key];
        s[key] = String(v);
        if (String(old || '') !== s[key]) changes.push(`镜头${idx + 1}:${k} ${String(old || '').slice(0, 10) || '空'}→${String(v).slice(0, 10)}`);
      }
    });
    if (record && changes._pushHistory !== false && Object.keys(fields || {}).length) {
      s.history = s.history || [];
      s.history.unshift({ type: '导演助手修改', model: '虎鲸导演助手', time: Store.now() });
    }
  }

  function mapShotFields(raw, ep) {
    const ns = window.SB.blankShot(ep.shots.length, ep.sbConfig);
    const f = raw || {};
    ns.name = String(f.名称 || f.name || '');
    ns.plot = String(f.剧情 || f.plot || '(新镜头,请完善剧情)');
    if (f.运镜) ns.camera = String(f.运镜);
    ns.prompt = String(f.提示词 || f.prompt || '');
    ns.narration = String(f.旁白 || '');
    ns.dialogue = String(f.台词 || '');
    ns.duration = Math.max(1, Math.min(60, +f.时长 || 5));
    ns.characters = Array.isArray(f.出场人物) ? f.出场人物.map(String).slice(0, 3) : [];
    ns.scene = String(f.出场场景 || f.场景 || '');
    ns.history = [{ type: '导演助手插入', model: '虎鲸导演助手', time: Store.now() }];
    return ns;
  }

  /**
   * 应用 ops 到 ep.shots,返回 changes 摘要数组
   * record=true 时给被改镜头写历史
   */
  function applyOps(ep, ops, record) {
    const changes = [];
    const dels = [], moves = [], inserts = [];
    (ops || []).forEach(op => {
      const n = (+op.shot) - 1;
      if (op.op === 'update') {
        const s = ep.shots[n];
        if (s) applyFields(s, op.fields, changes, n, record);
      } else if (op.op === 'beatupdate') {
        // 分镜脚本层:改某场次某节拍(情绪/剧情/分镜文字),场次/节拍号从 1 开始
        const sc = ep.scriptBoard && ep.scriptBoard.scenes && ep.scriptBoard.scenes[(+op.scene) - 1];
        const bt = sc && sc.beats[(+op.beat) - 1];
        if (bt) {
          const BF = { 情绪: 'emotion', 剧情: 'plot', 分镜文字: 'shot', 文字分镜: 'shot' };
          Object.entries(op.fields || {}).forEach(([k, v]) => {
            const key = BF[k] || k;
            if (!['emotion', 'plot', 'shot'].includes(key)) return;
            const old = bt[key];
            bt[key] = String(v);
            if (String(old || '') !== bt[key]) changes.push(`场次${op.scene}·节拍${op.beat}:${k} ${String(old || '空').slice(0, 10)}→${String(v).slice(0, 10)}`);
          });
        }
      } else if (op.op === 'sceneupdate') {
        // 分镜脚本层:改某场次标题/场次剧情
        const sc = ep.scriptBoard && ep.scriptBoard.scenes && ep.scriptBoard.scenes[(+op.scene) - 1];
        if (sc) {
          const SF = { 标题: 'title', 剧情: 'text', 内容: 'text' };
          Object.entries(op.fields || {}).forEach(([k, v]) => {
            const key = SF[k] || k;
            if (!['title', 'text'].includes(key)) return;
            const old = sc[key];
            sc[key] = String(v);
            if (String(old || '') !== sc[key]) changes.push(`场次${op.scene}:${k} ${String(old || '空').slice(0, 10)}→${String(v).slice(0, 10)}`);
          });
        }
      } else if (op.op === 'insert') {
        // 推迟结算:立即 splice 会让同批后续 op 的原始镜头号位移
        inserts.push({ after: Math.max(0, Math.min(ep.shots.length, +op.after || 0)), shot: op.shot });
      } else if (op.op === 'delete') {
        /* 十二轮:删除前查在飞任务(本地 + 近 2 分钟服务端任务快照,与 UI 删除同口径)——
         * Agent ops 应用器是同步路径无法 await canDeleteScope,靠 runningInScope 的快照兜底,
         * 刷新后本地已 failed 但服务端仍在生成时不删(孤儿上游成本) */
        const s = ep.shots[n];
        if (s && window.Tasks && Tasks.runningInScope({ shotId: s.id }).length) {
          changes.push(`镜头${n + 1}「${(s.plot || '').slice(0, 12)}」有生成/处理任务进行中,未删除`);
        } else dels.push(n);
      } else if (op.op === 'move') {
        moves.push({ from: n, to: (+op.to) - 1 });
      } else if (op.op === 'batch') {
        const who = op.filter && op.filter.含人物;
        let hit = 0;
        ep.shots.forEach((s, i) => {
          if (!who || (s.characters || []).includes(who)) { applyFields(s, op.fields, changes, i, record); hit++; }
        });
        if (who) changes.push(`批量:所有「${who}」出场的 ${hit} 个镜头已修改`);
      }
    });
    moves.forEach(({ from, to }) => {
      if (ep.shots[from]) {
        const [it] = ep.shots.splice(from, 1);
        const t = Math.max(0, Math.min(ep.shots.length, to));
        ep.shots.splice(t, 0, it);
        changes.push(`镜头${from + 1}移动到位置${t + 1}`);
      }
    });
    dels.sort((a, b) => b - a).forEach(n => {
      if (ep.shots[n]) { changes.push(`删除镜头${n + 1}「${(ep.shots[n].plot || '').slice(0, 12)}」`); ep.shots.splice(n, 1); }
    });
    // 删除结算完再插入:按原始 after 序号(扣除其前已删除镜头造成的左移),从小到大插入保持相对顺序
    inserts.sort((a, b) => a.after - b.after);
    let added = 0;
    inserts.forEach(ins => {
      const delBefore = dels.filter(d => d < ins.after).length;
      const pos = Math.max(0, Math.min(ep.shots.length, ins.after - delBefore + added));
      const ns = mapShotFields(ins.shot, ep);
      ep.shots.splice(pos, 0, ns);
      added++;
      changes.push(`在镜头${ins.after}后插入新镜头:「${(ns.plot || '').slice(0, 14)}」`);
    });
    ep.shots.forEach((s, i) => s.order = i);
    if (ep.uiSel && !ep.shots.some(s => s.id === ep.uiSel)) ep.uiSel = ep.shots[0] ? ep.shots[0].id : null;
    ep.composed = false;
    return changes;
  }

  /* ---- 执行闭环验证(Codex Harness 理念):applyOps 落数后逐项回读校验,结果如实反馈 ----
   * 依赖调用方在 applyOps 前已写好 ep.agentUndo 快照(两条应用路径均如此),以此获得 before 状态;act 类 ops 不在此校验(它们有自己的确认闸) */
  function verifyOps(ep, ops) {
    const fails = [];
    let total = 0;
    if (!ep) return { ok: true, total, fails };
    const list = (ops || []).filter(o => o && o.op);
    const before = ep.agentUndo && Array.isArray(ep.agentUndo.shots) ? ep.agentUndo.shots : null;
    const mixed = list.some(o => o.op === 'delete' || o.op === 'insert'); // 同批有增删时位置校验不可靠,move 退化为跳过精确校验
    const fieldHit = (s, k, v) => {
      if (!s) return false;
      const key = FIELD_MAP[k] || k;
      const cur = ['view', 'angle', 'shotSize', 'aperture'].includes(key) ? (s.cameraSpec || {})[key]
        : key === 'duration' ? s.duration : s[key];
      const want = key === 'duration' ? Math.max(1, Math.min(60, +v || cur || 5)) : String(v);
      return String(cur === undefined || cur === null ? '' : cur) === String(want);
    };
    list.forEach(op => {
      const n = (+op.shot) - 1;
      if (op.op === 'update' || op.op === 'batch') {
        const who = op.op === 'batch' && op.filter && op.filter.含人物;
        const targets = op.op === 'update' ? [[ep.shots[n], n]] : ep.shots.map((s, i) => [s, i]).filter(([s]) => !who || (s.characters || []).includes(who));
        targets.forEach(([s, i]) => Object.entries(op.fields || {}).forEach(([k, v]) => {
          total++;
          if (!fieldHit(s, k, v)) fails.push(`镜头${i + 1}:${k} 未生效`);
        }));
      } else if (op.op === 'beatupdate') {
        const BF = { 情绪: 'emotion', 剧情: 'plot', 分镜文字: 'shot', 文字分镜: 'shot' };
        const sc = ep.scriptBoard && ep.scriptBoard.scenes && ep.scriptBoard.scenes[(+op.scene) - 1];
        const bt = sc && sc.beats[(+op.beat) - 1];
        Object.entries(op.fields || {}).forEach(([k, v]) => {
          const key = BF[k] || k;
          if (!['emotion', 'plot', 'shot'].includes(key)) return;
          total++;
          if (!bt || String(bt[key] || '') !== String(v)) fails.push(`场次${op.scene}·节拍${op.beat}:${k} 未生效`);
        });
      } else if (op.op === 'sceneupdate') {
        const SF = { 标题: 'title', 剧情: 'text', 内容: 'text' };
        const sc = ep.scriptBoard && ep.scriptBoard.scenes && ep.scriptBoard.scenes[(+op.scene) - 1];
        Object.entries(op.fields || {}).forEach(([k, v]) => {
          const key = SF[k] || k;
          if (!['title', 'text'].includes(key)) return;
          total++;
          if (!sc || String(sc[key] || '') !== String(v)) fails.push(`场次${op.scene}:${k} 未生效`);
        });
      } else if (op.op === 'insert') {
        total++;
        const f = op.shot || {};
        const mark = String(f.名称 || f.name || f.剧情 || f.plot || '').slice(0, 10);
        const hit = mark ? ep.shots.some(s => (s.name || '').includes(mark) || (s.plot || '').includes(mark))
          : before ? ep.shots.length > before.length : ep.shots.length > 0;
        if (!hit) fails.push(`在镜头${op.after}后插入未生效`);
      } else if (op.op === 'delete') {
        total++;
        const old = before && before[n];
        if (old) {
          const still = old.id ? ep.shots.some(s => s.id === old.id)
            : ep.shots.some(s => (s.plot || '') === (old.plot || '') && (s.name || '') === (old.name || ''));
          if (still) fails.push(`删除镜头${n + 1} 未生效`);
        }
      } else if (op.op === 'move') {
        total++;
        const old = before && before[n];
        if (old && !mixed) {
          const t = Math.max(0, Math.min(ep.shots.length - 1, (+op.to) - 1));
          const cur = ep.shots[t];
          const same = cur && (old.id ? cur.id === old.id : (cur.plot || '') === (old.plot || '') && (cur.name || '') === (old.name || ''));
          if (!same) fails.push(`镜头${n + 1} 移动未到位`);
        }
      }
    });
    return { ok: !fails.length, total, fails };
  }
  /* 校验结果 → 消息尾注;有未生效项同时 toast 警示 */
  function verifyNote(v) {
    if (!v || !v.total) return '';
    if (v.ok) return `(✓ 已生效 ${v.total} 项)`;
    U.toast(`⚠ ${v.fails.length} 项修改未生效:${v.fails[0]}`, 'error', 3500);
    return `(⚠ ${v.fails.length} 项未生效:${v.fails.slice(0, 3).join(';')})`;
  }

  window.AgentOps = { splitOps, opRisk, actDesc, changeLineHTML, runEpisodeActions, runGlobalActions, prearrSend, prearrCardHTML, bindPrearr, bindChoices, parseChoices, choiceCardHTML, execPrearr, compactChat, chatLines, compactShots, focusOf, focusBlock, applyOps, verifyOps, verifyNote, OP_TOOLS, FIELD_MAP };
  window.__AGENT_TEST = { applyOps, compactShots, FIELD_MAP, focusOf, focusBlock, OP_TOOLS, verifyOps, compactChat };
})();
