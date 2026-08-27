/* ============ proj-upload.js 剧本上传/主体确认/分集生成域(自 episodes.js 拆分) ============
 * 上传剧本弹窗、主体确认+AI 生图弹窗、doSplit 分集流程(执行核心 splitCore 与命令层共用);
 * 入口增补到 window.EpisodeUtil(genSubjectImage/doSplit/splitCore/openSubjectConfirm/openUploadScript),
 * episodes.js 与 director.js 等消费方经 EpisodeUtil.* 调用,对外契约不变。 */
(function () {
  /* ---------- 上传剧本 ---------- */
  function openUploadScript(p, main) {
    let scriptText = p.script || '';
    const textModels = API.getTextModels(8);
    let model = (textModels.find(t => t.id === API.getConfig().model) || textModels[0]).id;
    let extractMode = 'normal';
    const types = { character: true, scene: true, prop: true }; // 主体类型不再让用户勾选:精细模式默认全量提取(角色/场景/道具)

    U.openModal({
      title: '上传剧本(支持整部剧本,最大 20 万字)',
      xl: true,
      body: `
      <div class="grid" style="grid-template-columns:1.4fr 1fr;gap:18px">
        <div>
          <textarea class="input" data-f="script" rows="16" placeholder="粘贴剧本文本,或点击下方上传 txt/doc/docx/pdf 文件…(支持 20 万字)">${U.esc(scriptText)}</textarea>
          <div class="row" style="margin-top:10px;justify-content:space-between">
            <button class="btn sm" data-x="file">⬆ 上传剧本文件(txt/doc/docx/pdf)</button>
            <span class="small muted" data-count>${scriptText.length} / 200000 字</span>
          </div>
          <div class="small" data-validate style="margin-top:8px"></div>
        </div>
        <div>
          <label class="field"><span>选择模型(真实 LLM${API.isReady() ? '' : ',当前未配置 API,将回退本地启发式'})</span>
            <div class="model-row">${textModels.map(t => `<div class="model-opt ${t.id === model ? 'sel' : ''}" data-model="${U.esc(t.id)}">${U.esc(t.label)}</div>`).join('')}</div>
          </label>
          <label class="field"><span>提取模式</span>
            <div class="model-row">
              <div class="model-opt sel" data-em="normal">普通模式</div>
              <div class="model-opt" data-em="fine">精细模式</div>
            </div>
            <div class="hint">普通模式:剧本原文进入剧本板块,只提取规范文本信息(一句话梗概/大纲/人物小传/集纲/每集正文);精细模式:在普通模式基础上,追加导演风格设定与主体(角色/场景/道具)主图生成——即分镜与生成之前的全部准备工作。</div>
          </label>
        </div>
      </div>`,
      footer: `
        <button class="btn" data-x="cancel">取消</button>
        <button class="btn" data-x="splitonly">仅进行分集</button>
        <button class="btn primary" data-x="start">解析剧本</button>`,
      onMount(m, close) {
        const ta = m.querySelector('[data-f=script]');
        // 分集规则校验(防抖 500ms):章/集混用警告、标记计数
        let vTimer = null, vResult = EpisodeUtil.validateScriptRules(scriptText || '');
        const renderValidate = () => {
          const el = m.querySelector('[data-validate]');
          const color = vResult.level === 'warn' ? 'var(--yellow)' : vResult.level === 'ok' ? 'var(--green)' : 'var(--text3)';
          el.innerHTML = scriptText.trim() ? `<span style="color:${color}">${vResult.level === 'warn' ? '⚠ ' : vResult.level === 'ok' ? '✓ ' : 'ℹ '}${U.esc(vResult.msg)}</span>` : '';
        };
        const doValidate = () => { vResult = EpisodeUtil.validateScriptRules(scriptText); renderValidate(); };
        renderValidate();
        ta.oninput = () => {
          scriptText = ta.value.slice(0, 200000);
          m.querySelector('[data-count]').textContent = scriptText.length + ' / 200000 字';
          clearTimeout(vTimer);
          vTimer = setTimeout(doValidate, 500);
        };
        // 混用警告存在时,按钮需二次确认
        const confirmIfMixed = next => {
          if (vResult.mixed) return U.confirm(vResult.msg + '。仍要继续吗?', next, '仍要继续');
          next();
        };
        m.querySelector('[data-x=file]').onclick = async () => {
          const btn = m.querySelector('[data-x=file]');
          const orig = btn.textContent;
          btn.disabled = true; btn.innerHTML = '<span class="spinner"></span> 解析文件中…';
          const r = await U.readScriptFile((x, n) => { btn.textContent = `正在解析 PDF(第 ${x}/${n} 页)…`; });
          btn.disabled = false; btn.textContent = orig;
          if (!r) return;
          if (r.error) return U.toast(r.error, 'error', 3500); // 不清空已有内容
          scriptText = r.text.slice(0, 200000);
          ta.value = scriptText;
          ta.dispatchEvent(new Event('input'));
          U.toast(`已提取 ${scriptText.length} 字(${r.name})`, 'success', 3000);
          if (r.warn) U.toast('旧版 .doc 提取效果有限,建议另存为 .docx 或 .txt 后重新上传', 'info', 4500);
        };
        m.querySelectorAll('[data-model]').forEach(o => o.onclick = () => {
          model = o.dataset.model;
          m.querySelectorAll('[data-model]').forEach(x => x.classList.toggle('sel', x === o));
        });
        m.querySelectorAll('[data-em]').forEach(o => o.onclick = () => {
          extractMode = o.dataset.em;
          m.querySelectorAll('[data-em]').forEach(x => x.classList.toggle('sel', x === o));
        });
        const getText = () => { scriptText = ta.value.trim(); return scriptText; };
        m.querySelector('[data-x=cancel]').onclick = close;
        m.querySelector('[data-x=splitonly]').onclick = () => {
          if (!getText()) return U.toast('请先粘贴或上传剧本文本', 'error');
          confirmIfMixed(() => { close(); doSplit(p, scriptText, main); });
        };
        m.querySelector('[data-x=start]').onclick = () => {
          if (!getText()) return U.toast('请先粘贴或上传剧本文本', 'error');
          confirmIfMixed(() => {
            close();
            p.script = scriptText; // 原文进剧本板块(主网页),供导演/分镜等下游使用
            Store.save();
            if (extractMode === 'fine') {
              // 精细模式:导演风格设定 + 主体主图生成(含分集与文本信息,见 Director.run 流程尾部)
              Director.run(p, scriptText, model, extractMode, types, main);
            } else {
              // 普通模式:先分集(原文逐字),再全文提取规范文本信息(梗概/大纲/人物小传/集纲)
              doSplit(p, scriptText, main, () => EpisodeUtil.runDigestDock(p, main));
            }
          });
        };
      },
    });
  }


  /* ---------- 主体确认 + AI 生图 ---------- */
  /* 单个主体图生成(主体确认弹窗与角色/场景管理页共用):
   * 八轮:收敛到 Tasks.run 五件套(登记→扣费→执行→done/失败退费;退费镜像带 operationId,服务端可对账);
   * onDone 由调用方重渲,regen 为重新生成。
   * 在线时走火山引擎真实生图(Media.genImage),失败如实报错退费;离线回退 PH 占位 */
  async function genSubjectImage(p, s, onDone, regen) {
    s.model = s.model || MODELS.image[0];
    const box = document.querySelector(`[data-imgbox="${s.id}"]`);
    await Tasks.run({ type: '文生图(主体图)', model: s.model, target: s.name, cost: COST.image, actionName: `AI生图:${s.name}(${s.model})`, projectId: p.id }, async (tk) => {
      // 真实生成:用主体自带文生图提示词,没有用名称+描述拼
      if (window.Media && Media.isReady()) {
        const prompt = (s.prompt || (s.name + (s.description ? ',' + s.description : '')))
          + (s.kind === 'character' && !/三视图|纯白背景/.test(s.prompt || '') ? EpisodeUtil.buildSubjectPrompt(s, 'sheet', '') : ''); // 角色一律按白底三视图人设图生成(统一出口)
        if (box) box.innerHTML = `<div class="gen-tip"><div class="spinner"></div><div>真实模型生成中(约 1 分钟)…</div></div>`;
        // 真实模式失败抛错由 Tasks.run 统一退费,不用占位图冒充产物
        const r = await Media.genImage({ prompt, model: Media.realModel(s.model), billingAction: 'image.gen', operationId: tk.id });
        s.image = r.url;
      } else {
        // 离线模式:本地占位图
        if (box) await U.progressIn(box, 1200 + Math.random() * 800, s.model + ' 生成中(离线模拟)');
        s.image = PH.subject(s.name + (regen ? Date.now() % 991 : ''), s.kind);
      }
      s.status = 'done';
      Store.save();
      U.toast(`「${s.name}」图片生成完成`, 'success');
      if (onDone) onDone();
      return { filename: `主体图_${s.name}.png`, dataURL: s.image };
    });
  }

  function openSubjectConfirm(p, main) {
    let tab = 'character';
    let batchModel = MODELS.image[0];

    const KIND_NAME = { character: '角色', scene: '场景', prop: '道具' }; // 与主体页命名对齐

    function bodyHTML() {
      const list = p.subjects.filter(s => s.kind === tab);
      return `
      <div class="tabs">
        ${['character', 'scene', 'prop'].map(k => `<div class="tab ${tab === k ? 'active' : ''}" data-tab="${k}">${KIND_NAME[k]}主体(${p.subjects.filter(s => s.kind === k).length})</div>`).join('')}
      </div>
      ${list.length === 0 ? '<div class="empty"><div class="ico">🔍</div><p>未提取到该类主体</p></div>' : `
      <div class="grid subj-grid">
        ${list.map(s => `
        <div class="card subj-card" data-sid="${s.id}">
          <div class="imgbox" data-imgbox="${s.id}">
            ${s.image ? `<img src="${U.thumb(s.image)}">` : `<div class="gen-tip" style="background:none">🖼<span>待生成图片</span></div>`}
          </div>
          <div class="row" style="justify-content:space-between;margin-bottom:6px">
            <b>${U.esc(s.name)}</b>
            <span class="tag ${s.kind === 'character' ? 'cyan' : s.kind === 'scene' ? 'green' : 'yellow'}">${KIND_NAME[s.kind]}</span>
          </div>
          <div class="hint" style="margin:0 0 8px">提取依据:${U.esc(s.evidence || '')}</div>
          <label class="field" style="margin-bottom:8px"><span>AI 生成描述提示词(可修改)</span>
            <textarea class="input small" rows="2" data-prompt="${s.id}">${U.esc(s.prompt)}</textarea>
          </label>
          <select class="select small" data-model-sel="${s.id}" style="margin-bottom:8px">
            ${MODELS.image.map(mo => `<option ${s.model === mo ? 'selected' : ''}>${mo}</option>`).join('')}
          </select>
          <div class="row">
            <button class="btn sm primary" data-gen="${s.id}">AI生图(-${COST.image}积分)</button>
            ${s.image ? `<button class="btn sm" data-regen="${s.id}">重新生成</button>` : ''}
            <button class="btn sm" data-upload="${s.id}">本地上传</button>
            ${s.kind === 'character' ? `<button class="btn sm" data-persona="${s.id}">🧬 八维度</button>` : ''}
          </div>
        </div>`).join('')}
      </div>`}
      <div class="divider"></div>
      <div class="row wrap" style="justify-content:space-between">
        <div class="row">
          <span class="small muted">批量生图模型:</span>
          <select class="select small" data-batch-model style="width:auto">${MODELS.image.map(mo => `<option>${mo}</option>`).join('')}</select>
        </div>
        <button class="btn primary" data-x="batchall">⚡ 批量生成全部主体图片</button>
      </div>`;
    }

    const close = U.openModal({
      title: '确认主体并生成图片',
      xl: true,
      body: '<div data-body></div>',
      footer: `<button class="btn" data-x="later">稍后处理</button><button class="btn primary" data-x="save">保存主体并生成分集</button>`,
      onMount(m, c2) {
        m.querySelector('[data-x=later]').onclick = () => { c2(); Views.projectDetail(main, p.id); };
        m.querySelector('[data-x=save]').onclick = () => {
          p.extractDone = true;
          Store.save();
          c2();
          U.toast('主体已保存', 'success');
          doSplit(p, p.script, main);
        };
        renderBody(m);
      },
    });

    function renderBody(m) {
      m.querySelector('[data-body]').innerHTML = bodyHTML();
      m.querySelectorAll('[data-tab]').forEach(t => t.onclick = () => { tab = t.dataset.tab; renderBody(m); });
      m.querySelector('[data-batch-model]').onchange = e => batchModel = e.target.value;
      m.querySelectorAll('[data-prompt]').forEach(t => t.onchange = () => {
        const s = p.subjects.find(x => x.id === t.dataset.prompt); s.prompt = t.value; Store.save();
      });
      m.querySelectorAll('[data-model-sel]').forEach(sel => sel.onchange = () => {
        const s = p.subjects.find(x => x.id === sel.dataset.modelSel); s.model = sel.value; Store.save();
      });
      m.querySelectorAll('[data-gen]').forEach(b => b.onclick = () => genOne(b.dataset.gen, m));
      m.querySelectorAll('[data-regen]').forEach(b => b.onclick = () => genOne(b.dataset.regen, m, true));
      m.querySelectorAll('[data-upload]').forEach(b => b.onclick = async () => {
        const s = p.subjects.find(x => x.id === b.dataset.upload);
        const f = await U.readFile('image/*', true);
        if (f) {
          const url = await U.uploadData(f.name, f.data);
          s.image = url || f.data;
          s.status = 'uploaded'; Store.save();
          U.toast(url ? '图片已上传至服务端' : '已使用本地上传图片(离线 base64)', 'success');
          renderBody(m);
        }
      });
      m.querySelectorAll('[data-persona]').forEach(b => b.onclick = () => {
        const s = p.subjects.find(x => x.id === b.dataset.persona);
        Persona.openEditor(p, s, () => renderBody(m));
      });
      m.querySelector('[data-x=batchall]').onclick = async () => {
        const pending = p.subjects.filter(s => !s.image);
        if (!pending.length) return U.toast('所有主体均已有图片', 'info');
        // 逐条调用单个生成流程(逐条扣费/失败返还),先预检至少生得起一张
        if (!U.requireCredits(COST.image, `批量生成主体图×${pending.length}(${batchModel})`)) return;
        for (const s of pending) {
          if (Store.credits() < COST.image) break; // 余额不足即止(genSubjectImage 已提示)
          s.model = batchModel;
          await genSubjectImage(p, s);
        }
        U.toast(`批量生成完成,共 ${pending.filter(s => s.image).length} 张`, 'success');
        renderBody(m);
      };
    }

    async function genOne(sid, m, regen) {
      const s = p.subjects.find(x => x.id === sid);
      await genSubjectImage(p, s, () => renderBody(m), regen);
    }
  }

  /* ---------- 生成分集 ---------- */
  function doSplit(p, scriptText, main, after) {
    // M2 修复:已有分集时先确认(整体覆盖不可恢复);在飞生成中禁止覆盖,防孤儿扣费
    if (p.episodes && p.episodes.length) {
      const inflight = p.episodes.reduce((n, e) => n
        + (e.shots || []).filter(s => s.video && s.video.status === 'generating').length
        + (e.beats || []).filter(b => b.video && b.video.status === 'generating').length, 0);
      if (inflight > 0) return U.toast(`有 ${inflight} 个镜头/节拍正在生成,请等待完成后再重新分集`, 'error');
      return U.confirm(`将覆盖现有 ${p.episodes.length} 个分集及其分镜数据(覆盖前各分集会进入回收站,7 天内可恢复)。确定重新分集吗?`, () => doSplitRun(p, scriptText, main, after), '仍要分集');
    }
    doSplitRun(p, scriptText, main, after);
  }
  /* 分集拆分执行核心(UI 任务条与命令层 project.splitEpisodes 共用,无 DOM 依赖):
   * 在飞守卫 → 登记任务 → 按 WfCore.splitMode 切分(llm 失败回退本地均分)→ 旧分集进回收站 → 整表覆盖写回。
   * 守卫不过抛带 code 的 Error(调用方决定 toast 或结构化回执);opts.say 进度播报、opts.local 强制本地均分。
   * 返回 {eps, mode, llmError}(mode: markers/llm/even,与服务端 /api/wf/split-episodes 同词表)。 */
  async function splitCore(p, scriptText, opts) {
    opts = opts || {};
    const say = opts.say || (() => {});
    // 九轮统一在飞拦截;十二轮升级异步守卫:本地任务 + 服务端 running/needs_reconcile jobs
    // 合并判定(重新分集会覆盖全部旧分集,刷新后本地已 failed 但服务端仍在生成时同样禁止)
    const guard = window.Tasks ? await Tasks.canDeleteScope({ projectId: p.id }) : { local: [], remote: [] };
    if (guard.remote == null) throw Object.assign(new Error('任务中心暂时不可达,无法确认是否有在途生成任务,请稍后重试'), { code: 'tasks-unreachable' });
    if (guard.local.length) throw Object.assign(new Error(`有 ${guard.local.length} 个任务正在进行(${guard.local[0].type} 等),请等待完成后再重新分集`), { code: 'inflight' });
    if (guard.remote.length) throw Object.assign(new Error(`服务端仍有 ${guard.remote.length} 个生成任务在跑,请等待完成或超时后再重新分集`), { code: 'inflight' });
    // 无明显"第X集"标记且 API 可用时由 LLM 锚点分集(正文逐字切原文);长文/离线按段落均分保原文
    const mode = opts.local ? 'even' : WfCore.splitMode(scriptText, API.isReady());
    if (mode === 'llm') say('正在调用 LLM 按剧情节奏分集…');
    else if (!opts.local && API.isReady() && WfCore.scriptEpMarkers(scriptText) < 2) say('剧本较长且无集标记:按段落节奏本地均分(原文逐字保留)');
    const tk = Tasks.start({ type: '剧本分集', model: mode === 'llm' ? API.getConfig().model : '本地拆分', target: p.name, projectId: p.id });
    let eps = null, llmError = null;
    if (mode === 'llm') {
      try {
        eps = await EpisodeUtil.llmSplitEpisodes(scriptText, API.getConfig().model, tk.id, p); // 七轮:任务 id 作稳定计费操作键;p 供剧本板块人设/记忆注入
      } catch (e) {
        llmError = e.message;
        Tasks.fail(tk, 'LLM 分集失败,已回退本地均分:' + e.message);
      }
    }
    if (!eps) eps = WfCore.localSplitEpisodes(scriptText);
    // 覆盖前旧分集快照进回收站(7 天可恢复),与确认文案一致
    (p.episodes || []).forEach(oldEp => Store.trashPut('episode', oldEp.title, { projectId: p.id, ep: oldEp }));
    p.episodes = eps.map((e, i) => ({ id: Store.uid('ep'), title: e.title, content: e.content, order: i, shots: [], status: 'draft' }));
    const used = llmError ? 'even' : mode;
    /* 拆集闭环结论按板块回流协作记忆(剧本板块):派生走 WfCore 双端单源(与服务端 /api/wf/split-episodes 同一份),
     * 记忆桶经参数注入后存回既有 state.agentMemory;mode 传实际用上的那个(LLM 失败回退时如实记 even) */
    Store.state.agentMemory = WfCore.memWrite(Store.state.agentMemory,
      WfCore.memFeedback({ split: { p, mode: used } }, { now: Store.now }));
    Store.save();
    if (tk.status === 'running') Tasks.done(tk);
    return { eps: p.episodes, mode: used, llmError };
  }
  function doSplitRun(p, scriptText, main, after) {
    U.runTask({
      title: '生成分集',
      steps: [
        { label: '剧本结构分析', ms: 900 },
        { label: '识别集/章标记', ms: 800 },
        { label: '拆分剧情段落', ms: 1100 },
        { label: '分集落盘', ms: 700 },
      ],
      onDone: async () => {
        let r;
        try {
          r = await splitCore(p, scriptText, { say: t => U.toast(t, 'info', 3500) });
        } catch (e) { U.toast(e.message, 'error'); return; }
        if (r.llmError) U.toast('LLM 分集失败:' + r.llmError + ',已回退本地均分逻辑', 'error', 4000);
        const eps = r.eps;
        const wordInfo = eps.map((e, i) => `第${i + 1}集 ${e.content.length}字`).join('、');
        const over = eps.filter(e => e.content.length > 2000).length;
        U.toast(`分集成功,共 ${eps.length} 集(${wordInfo})${over ? `,${over} 集超 2000 字建议拆分` : ''}`, over ? 'info' : 'success', 4000);
        Views.projectDetail(main, p.id);
        if (after) after(); // 分集完成后的后续链路(如普通模式的规范文本信息提取)
      },
    });
  }

  /* ---------- 拉片建集:参考视频 → 场景切段 → 逐段画面理解 → 可编辑分镜表 ----------
   * 链路:ff.highlight(detect_only 只探测不渲染) → ff.frames(times 段中点定点抽帧)
   *   → 逐段 VLM 理解(llm.understanding,同 opId 分 step,≤8 段对齐服务端 stepBudget)
   *   → 本地确定性组装 shots(不再加 LLM 汇总层:VLM 段级 JSON 已够,避免二次幻觉与加价)。
   * VLM 不可用时降级:跳过理解,按纯时间结构建集(描述留空待填),已交付步骤扣费不退、失败步骤服务端自动退费。 */
  const RIP_MAX = 8; // 服务端 llm/chat stepBudget=8:同 opId 同动作最多 8 步
  function openRip(p, main) {
    if (!Media.isReady()) return U.toast('拉片需要登录后端(FFmpeg 场景探测 + LLM 理解都走服务端),请先登录', 'error');
    let file = null, busy = false, rows = null; // rows: 预览编辑态的分镜行
    U.openModal({
      title: '拉片建集(参考视频 → 分镜表)',
      wide: true,
      body: `
      <label class="field"><span>新分集标题</span><input class="input" data-f="title" value="拉片 第${p.episodes.length + 1}集"></label>
      <div class="row" style="gap:10px;align-items:center">
        <button class="btn sm" data-x="pick">⬆ 选择参考视频</button>
        <span class="small muted" data-vname>未选择(场景探测按镜头切换切段,建议 ≤10 分钟的成片/剧集)</span>
      </div>
      <div data-preview style="margin-top:8px"></div>
      <label class="field" style="margin-top:8px"><span>分析段数(段数越多理解越细;每段 2 积分)</span>
        <div class="model-row">
          <div class="model-opt sel" data-n="4">4 段</div>
          <div class="model-opt" data-n="6">6 段</div>
          <div class="model-opt" data-n="8">8 段(最细)</div>
        </div>
      </label>
      <div class="small muted" data-prog style="margin-top:8px"></div>
      <div data-result style="margin-top:8px"></div>`,
      footer: `<button class="btn" data-x="cancel">取消</button>
        <button class="btn primary" data-x="run" disabled>开始拉片(-${COST.highlight + COST.tool}积分起)</button>
        <button class="btn primary" data-x="create" style="display:none">创建分集</button>`,
      onMount(m, close) {
        let maxN = 4;
        const prog = m.querySelector('[data-prog]');
        const setProg = t => { prog.textContent = t; };
        m.querySelector('[data-x=cancel]').onclick = () => { if (!busy) close(); };
        m.querySelectorAll('[data-n]').forEach(o => o.onclick = () => {
          if (busy) return;
          maxN = +o.dataset.n;
          m.querySelectorAll('[data-n]').forEach(x => x.classList.toggle('sel', x === o));
          m.querySelector('[data-x=run]').textContent = `开始拉片(-${COST.highlight + COST.tool + maxN * 2}积分)`;
        });
        m.querySelector('[data-x=pick]').onclick = async () => {
          const inp = document.createElement('input');
          inp.type = 'file'; inp.accept = 'video/*';
          inp.onchange = async () => {
            const f = inp.files && inp.files[0];
            if (!f) return;
            setProg('上传中…');
            const up = await U.readAndUpload(f);
            if (!up || !up.url) { setProg(''); return U.toast('上传失败(拉片必须传到服务端,离线 base64 不可用)', 'error'); }
            file = { name: f.name, url: up.url };
            m.querySelector('[data-vname]').textContent = f.name + '(' + (f.size / 1048576).toFixed(1) + 'MB)';
            m.querySelector('[data-preview]').innerHTML = `<video src="${U.esc(up.url)}" controls style="max-width:100%;max-height:180px;border-radius:8px"></video>`;
            m.querySelector('[data-x=run]').disabled = false;
            setProg('');
          };
          inp.click();
        };
        /* 关键帧 url → dataURL(VLM 只收 base64;上游取不到本站 localhost 路径) */
        const toDataURL = async url => {
          const b = await (await fetch(url)).blob();
          return new Promise((res2, rej) => { const r = new FileReader(); r.onload = () => res2(r.result); r.onerror = rej; r.readAsDataURL(b); });
        };
        m.querySelector('[data-x=run]').onclick = async () => {
          if (!file || busy) return;
          busy = true;
          const runBtn = m.querySelector('[data-x=run]');
          runBtn.disabled = true;
          Tasks.run({ type: '拉片建集', model: '场景探测+画面理解', target: file.name, cost: COST.highlight + COST.tool + maxN * 2, actionName: '拉片建集(' + file.name + ')', projectId: p.id }, async (tk) => {
            // 1) 场景探测(不渲染)
            setProg('1/3 场景探测切段中…');
            const det = await Media.ffHighlight(file.url, { detect_only: true, min_duration: 2, max_duration: 60, max_number: maxN }, 'ff.highlight', tk.id);
            const segs = (det.segments || []).slice(0, RIP_MAX);
            if (!segs.length) throw new Error('未探测到有效场景段');
            // 2) 段中点定点抽帧
            setProg(`2/3 抽取 ${segs.length} 段关键帧…`);
            const fr = await Media.ffFrames(file.url, { times: segs.map(s => s.start + s.dur / 2) }, 'ff.frames', tk.id);
            const frames = fr.frames || [];
            // 3) 逐段画面理解(VLM 失败降级:该段留空,全部失败则纯时间结构)
            rows = segs.map((s, i) => ({ start: s.start, dur: s.dur, frame: frames[i] || '', plot: '', camera: '', scene: '', characters: [], dialogue: '', mood: '' }));
            let vlmOk = 0;
            for (let i = 0; i < rows.length; i++) {
              setProg(`3/3 画面理解 ${i + 1}/${rows.length}…`);
              try {
                const dataUrl = await toDataURL(rows[i].frame);
                const out = await API.chatJSON({
                  system: '你是短剧拉片分析师。根据用户给的单镜头关键帧与时段,输出该镜头的结构化描述。',
                  messages: [{ role: 'user', content: [
                    { type: 'text', text: `这是参考视频第 ${i + 1} 个场景段(${rows[i].start.toFixed(1)}s 起,约 ${rows[i].dur.toFixed(1)}s)的关键帧。输出 JSON:{"shot_desc":"画面内容≤40字","camera":"推测机位/运镜(如 固定镜头/推镜头/手持跟拍)","scene":"场景名","characters":["画面人物外观特征,无则空数组"],"dialogue_text":"画面可见台词/字幕,无则空串","mood":"情绪基调≤8字"}` },
                    { type: 'image_url', image_url: { url: dataUrl } },
                  ] }],
                  max_tokens: 600, billingAction: 'llm.understanding', operationId: tk.id, step: 'vlm' + i,
                });
                rows[i].plot = String(out.shot_desc || '');
                rows[i].camera = String(out.camera || '');
                rows[i].scene = String(out.scene || '');
                rows[i].characters = Array.isArray(out.characters) ? out.characters.map(String).filter(Boolean).slice(0, 4) : [];
                rows[i].dialogue = String(out.dialogue_text || '');
                rows[i].mood = String(out.mood || '');
                vlmOk++;
              } catch (e) {
                if (i === 0) U.toast('画面理解不可用(当前模型可能不支持图片输入):' + e.message + ',后续按纯时间结构建集', 'error', 4500);
                break; // 首段即失败:模型不具备视觉能力,不再逐段浪费调用(失败步骤服务端已自动退费)
              }
            }
            return { vlmOk };
          }).then(r => {
            /* 余额以服务端权威回写:Tasks.run 按预估(7+2N)本地预扣,服务端按实际交付步骤计费
             * (VLM 部分失败仅扣成功步,失败步自动退费)——多步聚合链的本地镜像漂移在此对齐 */
            if (U.syncCreditsFromServer) U.syncCreditsFromServer();
            if (!r) { busy = false; runBtn.disabled = false; setProg(''); return; } // 任务失败(已 toast)
            setProg('');
            renderRows();
            runBtn.style.display = 'none';
            m.querySelector('[data-x=create]').style.display = '';
          });
        };
        /* 拉片结果预览:行内可编辑(创建前最后校对) */
        const renderRows = () => {
          m.querySelector('[data-result]').innerHTML = `
          <div class="small" style="margin-bottom:6px;color:var(--green)">探测到 ${rows.length} 个场景段,逐段校对后创建分集(画面描述/台词可直接改):</div>
          <div style="max-height:320px;overflow:auto;display:flex;flex-direction:column;gap:8px">
            ${rows.map((r, i) => `
            <div class="card" style="display:grid;grid-template-columns:96px 1fr;gap:8px;padding:8px">
              <div>${r.frame ? `<img src="${U.esc(r.frame)}" style="width:96px;border-radius:6px;display:block">` : ''}
                <div class="small muted" style="margin-top:4px">#${i + 1} · ${r.dur.toFixed(1)}s</div></div>
              <div style="display:flex;flex-direction:column;gap:4px">
                <input class="input small" data-r="plot" data-i="${i}" placeholder="画面/剧情描述" value="${U.esc(r.plot)}">
                <div class="row" style="gap:6px">
                  <input class="input small" data-r="camera" data-i="${i}" placeholder="机位/运镜" value="${U.esc(r.camera)}" style="flex:1">
                  <input class="input small" data-r="scene" data-i="${i}" placeholder="场景" value="${U.esc(r.scene)}" style="flex:1">
                </div>
                <input class="input small" data-r="dialogue" data-i="${i}" placeholder="可见台词/字幕(无则留空)" value="${U.esc(r.dialogue)}">
              </div>
            </div>`).join('')}
          </div>`;
          m.querySelectorAll('[data-r]').forEach(inp => inp.oninput = () => { rows[+inp.dataset.i][inp.dataset.r] = inp.value; });
        };
        m.querySelector('[data-x=create]').onclick = () => {
          if (!rows || !rows.length) return;
          const title = m.querySelector('[data-f=title]').value.trim() || ('拉片 第' + (p.episodes.length + 1) + '集');
          const cfg = (window.SB && SB.defaultSBConfig) ? SB.defaultSBConfig() : { batchCamera: '固定镜头', narratorVoice: '', batchVideoModel: '', batchStrategy: 'ref' };
          const shots = rows.map((r, i) => {
            const s = SB.blankShot(i, cfg);
            s.plot = r.plot;
            s.camera = r.camera || cfg.batchCamera;
            s.scene = r.scene;
            s.characters = r.characters;
            s.dialogue = r.dialogue;
            s.duration = Math.max(2, Math.round(r.dur));
            s.prompt = [r.mood, r.scene, r.plot].filter(Boolean).join(','); // 文生图底稿:情绪+场景+画面(风格后缀由生成管线统一追加)
            s.image = r.frame || null; // 关键帧作分镜底图(重新生成会覆盖,历史可溯)
            s.history = [{ type: '拉片建集', model: '场景探测' + (r.plot ? '+画面理解' : ''), time: Store.now() }];
            return s;
          });
          // content 落拉片文字记录:本集理解/智能分镜等主线工具可直接接续使用
          const content = shots.map((s, i) => `镜头${i + 1}(${s.duration}s)${s.scene ? ' ' + s.scene : ''}:${s.plot || '(待补画面描述)'}${s.dialogue ? ' 台词:' + s.dialogue : ''}`).join('\n');
          p.episodes.push({ id: Store.uid('ep'), title, content, order: p.episodes.length, shots, status: 'draft' });
          Store.save();
          close();
          U.toast(`分集「${title}」已创建:${shots.length} 个镜头(关键帧已作分镜底图)`, 'success', 4000);
          // 事件续谈卡:拉片完成的下一步引导(消息留存在新集助手对话流,进入分集即可见)
          // 拉片产出是时间轴文字记录,「本集理解」能显著提升后续提示词优化/视频生成质量,推荐先行
          const newEp = p.episodes[p.episodes.length - 1];
          if (window.Bus) Bus.emit('episode.ripped', { p, ep: newEp, main, count: shots.length, brief: `拉片建集完成:${shots.length} 镜` }); // 事件总线:Agent 对话流事件续谈卡(推荐先跑本集理解)
          Views.projectDetail(main, p.id);
        };
      },
    });
  }

  Object.assign(window.EpisodeUtil, { genSubjectImage, doSplit, splitCore, openSubjectConfirm, openUploadScript, openRip });
})();
