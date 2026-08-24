/* ============ proj-upload.js 剧本上传/主体确认/分集生成域(自 episodes.js 拆分) ============
 * 上传剧本弹窗、主体确认+AI 生图弹窗、doSplit 分集流程;
 * 入口增补到 window.EpisodeUtil(genSubjectImage/doSplit/openSubjectConfirm/openUploadScript),
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
        // 九轮统一在飞拦截;十二轮升级异步守卫:本地任务 + 服务端 running/needs_reconcile jobs
        // 合并判定(重新分集会覆盖全部旧分集,刷新后本地已 failed 但服务端仍在生成时同样禁止)
        const guard = window.Tasks ? await Tasks.canDeleteScope({ projectId: p.id }) : { local: [], remote: [] };
        if (guard.remote == null) { U.toast('任务中心暂时不可达,无法确认是否有在途生成任务,请稍后重试', 'error'); return; }
        if (guard.local.length) { U.toast(`有 ${guard.local.length} 个任务正在进行(${guard.local[0].type} 等),请等待完成后再重新分集`, 'error'); return; }
        if (guard.remote.length) { U.toast(`服务端仍有 ${guard.remote.length} 个生成任务在跑,请等待完成或超时后再重新分集`, 'error'); return; }
        let eps = null;
        const hasMarkers = (scriptText.match(/第[一二三四五六七八九十百千0-9]+[集章回篇]/g) || []).length >= 2;
        const tk = Tasks.start({ type: '剧本分集', model: !hasMarkers && API.isReady() ? API.getConfig().model : '本地拆分', target: p.name, projectId: p.id });
        // 无明显"第X集"标记且 API 可用时,由 LLM 锚点分集(正文逐字切原文);长文直接本地均分保原文
        if (!hasMarkers && API.isReady()) {
          if (scriptText.length > 15000) {
            U.toast('剧本较长且无集标记:按段落节奏本地均分(原文逐字保留)', 'info', 3500);
          } else {
            try {
              U.toast('正在调用 LLM 按剧情节奏分集…', 'info');
              eps = await EpisodeUtil.llmSplitEpisodes(scriptText, API.getConfig().model, tk.id); // 七轮:任务 id 作稳定计费操作键
            } catch (e) {
              Tasks.fail(tk, 'LLM 分集失败,已回退本地均分:' + e.message);
              U.toast('LLM 分集失败:' + e.message + ',已回退本地均分逻辑', 'error', 4000);
            }
          }
        }
        if (!eps) eps = EpisodeUtil.splitEpisodes(scriptText);
        // 覆盖前旧分集快照进回收站(7 天可恢复),与确认文案一致
        (p.episodes || []).forEach(oldEp => Store.trashPut('episode', oldEp.title, { projectId: p.id, ep: oldEp }));
        p.episodes = eps.map((e, i) => ({ id: Store.uid('ep'), title: e.title, content: e.content, order: i, shots: [], status: 'draft' }));
        Store.save();
        if (tk.status === 'running') Tasks.done(tk);
        const wordInfo = eps.map((e, i) => `第${i + 1}集 ${e.content.length}字`).join('、');
        const over = eps.filter(e => e.content.length > 2000).length;
        U.toast(`分集成功,共 ${eps.length} 集(${wordInfo})${over ? `,${over} 集超 2000 字建议拆分` : ''}`, over ? 'info' : 'success', 4000);
        Views.projectDetail(main, p.id);
        if (after) after(); // 分集完成后的后续链路(如普通模式的规范文本信息提取)
      },
    });
  }

  Object.assign(window.EpisodeUtil, { genSubjectImage, doSplit, openSubjectConfirm, openUploadScript });
})();
