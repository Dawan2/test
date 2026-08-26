/* ============ role-editor.js 主体编辑页(自 roles.js 拆分) ============
 * 聚合精修/配音/设定/资产/定稿模块的大弹窗 + 场景画板(多视角/多机位宫格)。
 * 共享操作(genMainImage/setVoice/openForms 等)仍住在 roles.js,经 window.RoleOps 桥接;
 * window.RoleEditor 供 roles.js 浏览页调用,对外无其他消费方。 */
(function () {
  const { currentViewMode, viewImg, VIEW_MODES, formWord, touchImage, setVoice, recommendVoice, bindRefAudio, openForms, toggleFinalize, genMainImage, replaceMainImage, genModeImage } = window.RoleOps;

  /* ---------- 主体按指令改:一句自然语言 → LLM 改写设定提示词 → 复用 genMainImage 链路重新生图 ----------
   * 与分镜「按指令改」同模式:改写走轻量 LLM(llm.optimize),生图走 Tasks 全计费链路(失败退费/touchImage 打点不变)。 */
  function openSubjectComment(p, s, done) {
    if (!API.isReady()) return U.toast('按指令改需要配置 LLM(改写提示词),请先登录后端或在「API 设置」配置直连', 'error');
    const kindWord = { character: '角色', scene: '场景', prop: '道具' }[s.kind] || s.kind;
    U.openModal({
      title: '按指令改 · ' + s.name,
      body: `
      <div class="hint" style="margin-bottom:10px">说一句要改成什么样(如「换成红色长发」「背景改成雨夜街道」「加上战损伤痕」),AI 结合当前设定提示词改写;确认后立即按新提示词重新生图。</div>
      <label class="field"><span>修改指令</span><textarea class="input" data-f="inst" rows="2" placeholder="换成红色长发…"></textarea></label>
      <div data-newp style="display:none;margin-top:8px">
        <label class="field"><span>改写后的设定提示词(可再编辑)</span><textarea class="input" data-f="newprompt" rows="5"></textarea></label>
      </div>`,
      footer: `<button class="btn" data-x="cancel">取消</button>
        <button class="btn" data-x="rewrite">改写提示词(-${COST.optimize}积分)</button>
        <button class="btn primary" data-x="apply" disabled>应用并重新生图(-${COST.image}积分)</button>`,
      onMount(m, close) {
        m.querySelector('[data-x=cancel]').onclick = close;
        m.querySelector('[data-x=rewrite]').onclick = async () => {
          const inst = m.querySelector('[data-f=inst]').value.trim();
          if (!inst) return U.toast('请先填写修改指令', 'error');
          const btn = m.querySelector('[data-x=rewrite]');
          btn.disabled = true;
          try {
            U.toast('AI 改写提示词中…', 'info');
            const out = await API.chatJSON({
              system: `你是短剧${kindWord}设定师。按用户指令改写文生图设定提示词:保留与指令无关的外形/风格要素,只落实指令要求的变更;输出中文提示词,不超过120字。`,
              messages: [{ role: 'user', content: `主体:${s.name}(${kindWord})\n项目风格:${p.style || ''}\n当前设定提示词:${s.prompt || '(空,请据名称与指令撰写)'}\n\n修改指令:${inst}\n\n返回 {"prompt":"改写后的完整设定提示词"}` }],
              temperature: 0.7, max_tokens: 500, billingAction: 'llm.optimize',
            });
            if (!out || !out.prompt) throw new Error('LLM 返回为空');
            m.querySelector('[data-f=newprompt]').value = String(out.prompt);
            m.querySelector('[data-newp]').style.display = '';
            m.querySelector('[data-x=apply]').disabled = false;
            U.toast('提示词已改写,确认后可立即重新生图', 'success');
          } catch (e) {
            U.toast('改写失败:' + e.message, 'error', 3500);
          } finally { btn.disabled = false; }
        };
        m.querySelector('[data-x=apply]').onclick = () => {
          const np = m.querySelector('[data-f=newprompt]').value.trim();
          if (!np) return U.toast('提示词为空', 'error');
          s.prompt = np;
          Store.save();
          close();
          genMainImage(p, s, done); // 同一链路:任务登记/扣费/失败退费/touchImage 打点全复用
        };
      },
    });
  }

  /* ================= 主体编辑页:聚合精修/配音/设定/资产/定稿模块的大弹窗 =================
   * openSubjectEdit(p, sid, {onDone}):onDone 在任何修改后调用(浏览页传 render 刷新卡片) */
  function openSubjectEdit(p, sid, opts) {
    const { onDone } = opts || {};
    const s = p.subjects.find(x => x.id === sid);
    if (!s) return;
    let vm = currentViewMode(s); // 编辑页预览模式,与卡片联动(同写 s.viewMode)
    const close = U.openModal({
      title: '精修主体 · ' + s.name,
      xl: true,
      body: '<div data-ebody></div>',
      footer: '<button class="btn" data-x="close">✕ 关闭</button>',
      onMount(m, closeFn) {
        m.querySelector('[data-x=close]').onclick = closeFn; // 注意:不能在此读外层 const close(TDZ,onMount 同步执行时尚未赋值)
        renderBody(m);
      },
      onClose() { onDone && onDone(); }, // 关闭时兜底刷新浏览页
    });

    function renderBody(m) {
      const body = m.querySelector('[data-ebody]');
      const isChar = s.kind === 'character';
      const img = viewImg(s, vm);
      /* 编辑页内任何修改后的统一出口:落库 + 重渲编辑页 + 回调刷新浏览页 */
      const done = () => { Store.save(); renderBody(m); onDone && onDone(); };
      body.innerHTML = `
      <div class="grid" style="grid-template-columns:300px 1fr;gap:18px">
        <div>
          <div class="imgbox" style="height:280px;border-radius:10px;overflow:hidden;background:var(--bg2);display:flex;align-items:center;justify-content:center;margin-bottom:8px">
            ${img ? `<img src="${U.thumb(img)}" style="width:100%;height:100%;object-fit:cover">` : '<span class="muted small">未生成图片</span>'}
          </div>
          <div class="row" style="gap:4px">
            ${VIEW_MODES.map(x => `<button class="btn ghost sm ${vm === x.key ? 'primary' : ''}" style="flex:1;padding:2px 0;font-size:11px" data-evm="${x.key}" title="${x.desc}">${x.label}${s[x.field] ? ' ●' : ''}</button>`).join('')}
          </div>
          <div class="hint" style="margin:6px 0 8px">●=已生成该模式图;未生成的模式回退显示当前参考图</div>
          <button class="btn sm primary" style="width:100%" data-x="setref" title="把当前预览模式的图写入权威参考">📌 设为当前参考图</button>
          <div class="hint" style="margin-top:6px">权威参考图(s.image)用于美术确认与多机位;「视频参考」大头照(imgRef)生成视频时优先作为主体参考图发给模型(官方:三视图易被误判为多主体,大头照防 ID 漂移);未生成视频参考图时回退用权威参考图。</div>
        </div>
        <div>
          <b>🖼 图像</b>
          <div class="row wrap" style="gap:6px;margin:8px 0">
            <button class="btn sm primary" data-x="genimg" title="AI 生成主体图(-${COST.image}积分,直接写入权威参考图)">✨ AI 生图</button>
            <button class="btn sm" data-x="commentimg" title="说一句要改成什么样,AI 改写设定提示词并重新生图(-${COST.optimize}+${COST.image}积分)">💬 按指令改</button>
            <button class="btn sm" data-x="chatref" title="加入对话:把本主体挂进导演助手(全局)引用,对话里精准@它">📎 加入对话</button>
            <button class="btn sm" data-x="upimg" title="上传图片替换权威参考图">⬆ 换图</button>
            <button class="btn sm" data-x="board" title="跳转画板精修(局部重绘/超清/人物超写实)">🎨 画板精修</button>
          </div>
          <div class="divider" style="margin:10px 0"></div>
          <b>按模式生成 / 替换</b>
          ${VIEW_MODES.map(x => `
          <div class="row" style="gap:6px;margin-top:8px;justify-content:space-between">
            <span class="small">${x.label} <span class="muted">(${x.desc})</span> ${s[x.field] ? '<span class="tag green" style="font-size:10px">已生成</span>' : '<span class="tag" style="font-size:10px">未生成</span>'}</span>
            <span class="row" style="gap:4px">
              <button class="btn ghost sm" data-mgen="${x.key}" title="AI 生成${x.label}(-${COST.image}积分)">✨ 生成</button>
              <button class="btn ghost sm" data-mup="${x.key}" title="上传替换${x.label}">⬆ 上传</button>
            </span>
          </div>`).join('')}
        </div>
      </div>
      <div class="divider"></div>
      ${isChar ? `
      <b>🎙 配音</b>
      <div class="row wrap" style="gap:6px;margin:8px 0">
        <button class="btn sm" data-x="voice">🎙 ${U.esc(Voice.norm(s.voiceCfg || s.voice).voice)}</button>
        <button class="btn sm" data-x="vrec" title="按性格推荐音色">✨ 推荐</button>
        <button class="btn sm" data-x="refaudio" title="绑定音色参考音频,生成视频时随角色资产注入">🎵 音色参考${s.refAudio ? '(' + U.esc(s.refAudio.name) + ')' : ''}</button>
      </div>
      <div class="divider"></div>
      <b>🧬 设定</b>
      <div class="row wrap" style="gap:6px;margin:8px 0">
        <button class="btn sm" data-x="persona">🧬 八维度</button>
      </div>
      <div class="divider"></div>` : ''}
      <b>🗂 资产</b>
      <div class="row wrap" style="gap:6px;margin:8px 0">
        <button class="btn sm" data-x="forms" title="同一主体挂多个${formWord(s.kind)}(角色:少年期/战损妆;道具:破损态/发光态),按「名称-${formWord(s.kind)}名」在分镜中引用">🧩 ${formWord(s.kind)}${(s.forms || []).length ? '(' + s.forms.length + ')' : ''}</button>
        <button class="btn sm" data-x="multi" title="一次生图产出宫格变体(1 次调用顶 ${s.kind === 'scene' ? '多机位' : '多角度'}N 张,同批风格一致),切分后可入资产库或直接存为${formWord(s.kind)}">🎥 ${s.kind === 'scene' ? '多视角/多机位' : '多角度宫格'}</button>
        <button class="btn sm" data-x="saveasset">🗂 存入资产库</button>
      </div>
      <div class="divider"></div>
      <b>✓ 定稿</b>
      <div class="row" style="gap:8px;margin-top:8px;align-items:center">
        <button class="btn sm ${s.isSubject ? 'primary' : ''}" data-x="finalize" title="定稿=锁定当前形象为该主体权威参考,生成时优先按主体级参考使用">${s.isSubject ? '✓ 已定稿(点击取消)' : '⚡ 定稿'}</button>
        ${s.isSubject
          ? `<span class="small muted">定稿时间:${U.esc(s.subjectAt || '')};换图/设参考图会使定稿失效,需重新定稿</span>`
          : '<span class="small muted">定稿后当前形象锁定为权威参考,生成视频时按主体级参考优先使用</span>'}
      </div>`;

      /* ---- 顶部:三模式切换(与卡片联动)+ 设为当前参考图 ---- */
      body.querySelectorAll('[data-evm]').forEach(b => b.onclick = () => {
        vm = b.dataset.evm;
        s.viewMode = vm; // 记忆预览模式,浏览卡片同步
        done();
      });
      body.querySelector('[data-x=setref]').onclick = () => {
        const url = viewImg(s, vm);
        if (!url) return U.toast('当前模式还没有图片,请先生成或上传', 'error');
        if (s.image === url) return U.toast('该图已是当前权威参考图', 'info');
        s.image = url;
        // 权威参考变更视为形象变更:定稿失效,需重新定稿锁定
        if (s.isSubject) { s.isSubject = false; U.toast('参考图已更换,定稿已失效,请确认后重新定稿', 'info', 3000); }
        touchImage(p, s); // 打点 imgVer:全项目引用联动
        renderBody(m); onDone && onDone();
      };
      /* ---- 图像区 ---- */
      body.querySelector('[data-x=genimg]').onclick = () => genMainImage(p, s, done);
      body.querySelector('[data-x=commentimg]').onclick = () => openSubjectComment(p, s, done);
      body.querySelector('[data-x=chatref]').onclick = () => { // 📎 加入对话:主体挂进全局导演助手引用(subject ops 仅全局抽屉可执行)
        AgentRefs.add({ kind: 'subject', pid: p.id, id: s.id, label: '@' + s.name });
        if (window.AgentG && AgentG.isOpen && !AgentG.isOpen()) Agent.toggleGlobal();
      };
      body.querySelector('[data-x=upimg]').onclick = () => replaceMainImage(p, s, done);
      body.querySelector('[data-x=board]').onclick = () => {
        const url = viewImg(s, vm) || s.image;
        if (!url) return U.toast('请先生成或上传主体图片', 'error');
        window.__projTab = '主体'; // 画板关闭后回到项目「主体」tab
        window.__toolPrefill = { name: s.name, image: url };
        close();
        location.hash = '#/editor/ps';
      };
      /* ---- 按模式生成/替换 ---- */
      body.querySelectorAll('[data-mgen]').forEach(b => b.onclick = () => {
        const x = VIEW_MODES.find(v => v.key === b.dataset.mgen);
        genModeImage(p, s, x, done);
      });
      body.querySelectorAll('[data-mup]').forEach(b => b.onclick = async () => {
        const x = VIEW_MODES.find(v => v.key === b.dataset.mup);
        const f = await U.readAndUpload('image/*');
        if (!f) return;
        s[x.field] = f.url; // 模式预览图:只写对应字段,不动权威参考 s.image
        U.toast(`${x.label}已替换`, 'success');
        done();
      });
      /* ---- 配音区 / 设定区(仅角色) ---- */
      if (isChar) {
        body.querySelector('[data-x=voice]').onclick = () => setVoice(p, s, done);
        body.querySelector('[data-x=vrec]').onclick = () => recommendVoice(p, s, done);
        body.querySelector('[data-x=refaudio]').onclick = () => bindRefAudio(p, s, done);
        body.querySelector('[data-x=persona]').onclick = () => Persona.openEditor(p, s, done);
      }
      /* ---- 资产区 ---- */
      body.querySelector('[data-x=forms]').onclick = () => openForms(p, s, done);
      const multiBtn = body.querySelector('[data-x=multi]');
      if (multiBtn) multiBtn.onclick = () => openMultiView(p, s.id, done);
      body.querySelector('[data-x=saveasset]').onclick = () => window.saveSubjectToAssets(p, s.id, onDone);
      /* ---- 定稿区 ---- */
      body.querySelector('[data-x=finalize]').onclick = () => toggleFinalize(p, s, done);
    }
  }

  /* ---------- 场景画板:多视角(3D 球体)/ 多机位视角(宫格生图组);全 kind 开放(角色/道具多角度→存形态) ---------- */
  function openMultiView(p, sid, rerender) {
    const s = p.subjects.find(x => x.id === sid);
    const kindWord = s.kind === 'character' ? '角色' : s.kind === 'prop' ? '道具' : '场景';
    const viewPhrase = s.kind === 'scene' ? '同一场景不同机位' : `同一${kindWord}不同角度`;
    let tab = 'view'; // view=多视角 | grid=多机位
    // 多视角状态
    let az = 0, el = 0, dist = 1.0, viewMode = 'custom', presetSel = new Set(), viewResults = [];
    // 多机位状态
    let cols = 3, chIdx = 0, ratio = '1:1', camOn = false, gridImg = null, cells = [];
    const camState = { body: CAMERA.BODIES[0], lens: CAMERA.LENSES[0], focal: 35, aperture: 'ƒ/4' };

    const close = U.openModal({
      title: `🎥 ${s.kind === 'scene' ? '场景画板' : kindWord + '画板'} · ` + s.name,
      xl: true,
      body: '<div data-body></div>',
      onMount(m) { render(m); },
    });

    function render(m) {
      const body = m.querySelector('[data-body]');
      body.innerHTML = `
      <div class="tabs">
        <div class="tab ${tab === 'view' ? 'active' : ''}" data-t="view">🌐 多视角(3 积分/视角)</div>
        <div class="tab ${tab === 'grid' ? 'active' : ''}" data-t="grid">🎥 ${s.kind === 'scene' ? '多机位视角' : '多角度'}(宫格生图)</div>
      </div>
      ${tab === 'view' ? viewTabHTML() : gridTabHTML()}`;
      body.querySelectorAll('[data-t]').forEach(t => t.onclick = () => { tab = t.dataset.t; render(m); });
      if (tab === 'view') bindView(body, m); else bindGrid(body, m);
    }

    /* ===== 多视角 ===== */
    function viewTabHTML() {
      return `
      <div class="grid" style="grid-template-columns:260px 1fr;gap:18px">
        <div>
          <canvas data-sphere width="250" height="250" style="width:100%;border-radius:12px;background:var(--bg2);border:1px solid var(--border);cursor:grab"></canvas>
          <div class="hint" style="text-align:center">拖动旋转 · 实时联动方位角/仰角</div>
          <div class="tag cyan" style="display:block;text-align:center;margin-top:6px" data-readout>方位${az}°·仰角${el}°·距离${dist.toFixed(1)}</div>
        </div>
        <div>
          <div class="tabs" style="margin-bottom:10px">
            <div class="tab ${viewMode === 'custom' ? 'active' : ''}" data-vm="custom">自定义</div>
            <div class="tab ${viewMode === 'batch' ? 'active' : ''}" data-vm="batch">批量(9 机位预设)</div>
          </div>
          ${viewMode === 'custom' ? `
          <label class="field"><span>方位角 <b data-v-az>${az}°</b></span><input type="range" min="0" max="359" value="${az}" data-s="az" style="width:100%;accent-color:var(--accent)"></label>
          <label class="field"><span>仰角 <b data-v-el>${el}°</b></span><input type="range" min="-30" max="60" value="${el}" data-s="el" style="width:100%;accent-color:var(--accent)"></label>
          <label class="field"><span>距离 <b data-v-dist>${dist.toFixed(1)}</b></span><input type="range" min="0" max="20" value="${Math.round(dist * 10)}" data-s="dist" style="width:100%;accent-color:var(--accent)"></label>` : `
          <div class="model-row wrap" style="max-height:170px;overflow-y:auto">
            ${CAMERA.PRESETS.map(pr => `<div class="model-opt ${presetSel.has(pr.id) ? 'sel' : ''}" data-pr="${pr.id}">${pr.name}</div>`).join('')}
          </div>
          <div class="row" style="margin-top:8px"><button class="btn sm" data-x="selall">全选</button><span class="small muted">已选 ${presetSel.size} 个机位</span></div>`}
          <div class="divider"></div>
          <button class="btn primary" data-x="genv">生成视角图(消耗 <b data-cost>${viewMode === 'custom' ? COST.multiView : Math.max(1, presetSel.size) * COST.multiView}</b> 积分)</button>
          <div data-vresults class="row wrap" style="margin-top:12px;gap:8px">
            ${viewResults.map((r, i) => `<img src="${U.thumb(r.img)}" data-vr="${i}" title="${U.esc(r.label)}" style="width:96px;height:96px;object-fit:cover;border-radius:8px;cursor:pointer;border:1.5px solid var(--border2)">`).join('')}
          </div>
          ${viewResults.length ? '<div class="hint" style="margin-top:6px">点击视角图设为场景主图</div>' : ''}
        </div>
      </div>`;
    }

    function bindView(body, m) {
      // 3D 球体
      const cv = body.querySelector('[data-sphere]');
      const ctx = cv.getContext('2d');
      function drawSphere() {
        const W = 250, R = 105, cx = W / 2, cy = W / 2;
        ctx.clearRect(0, 0, W, W);
        ctx.strokeStyle = '#2a2f3d'; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.arc(cx, cy, R, 0, 7); ctx.stroke();
        for (let i = 1; i < 4; i++) { // 纬线
          ctx.beginPath(); ctx.ellipse(cx, cy, R, R * Math.sin(i * Math.PI / 8) * 0.9, 0, 0, 7); ctx.stroke();
        }
        for (let i = 0; i < 4; i++) { // 经线
          ctx.beginPath(); ctx.ellipse(cx, cy, R * Math.abs(Math.cos(i * Math.PI / 4)) || 1, R, 0, 0, 7); ctx.stroke();
        }
        // 机位标记
        const rad = az * Math.PI / 180, elr = el * Math.PI / 180;
        const px = cx + R * Math.cos(elr) * Math.sin(rad) * 0.92;
        const py = cy - R * Math.sin(elr) * 0.92;
        ctx.fillStyle = '#22d3ee';
        ctx.beginPath(); ctx.arc(px, py, 7, 0, 7); ctx.fill();
        ctx.strokeStyle = 'rgba(34,211,238,.4)'; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.arc(px, py, 12, 0, 7); ctx.stroke();
      }
      drawSphere();
      let dragging = false;
      cv.onmousedown = e => { dragging = true; e.preventDefault(); };
      // M6 修复:先移除再绑定,防多视角面板重复 render 导致 mouseup 累积
      if (window.__mvUp) document.removeEventListener('mouseup', window.__mvUp);
      window.__mvUp = () => { dragging = false; };
      document.addEventListener('mouseup', window.__mvUp);
      cv.onmousemove = e => {
        if (!dragging) return;
        az = (az + Math.round(e.movementX * 1.5) + 360) % 360;
        el = Math.max(-30, Math.min(60, el - Math.round(e.movementY)));
        sync();
      };
      function sync() {
        drawSphere();
        const ro = body.querySelector('[data-readout]');
        if (ro) ro.textContent = `方位${az}°·仰角${el}°·距离${dist.toFixed(1)}`;
        ['az', 'el', 'dist'].forEach(k => {
          const s = body.querySelector(`[data-s="${k}"]`);
          if (s) s.value = k === 'dist' ? Math.round(dist * 10) : (k === 'az' ? az : el);
          const b = body.querySelector(`[data-v-${k}]`);
          if (b) b.textContent = k === 'dist' ? dist.toFixed(1) : (k === 'az' ? az + '°' : el + '°');
        });
      }
      body.querySelectorAll('[data-s]').forEach(s => s.oninput = () => {
        if (s.dataset.s === 'az') az = +s.value;
        else if (s.dataset.s === 'el') el = +s.value;
        else dist = +s.value / 10;
        sync();
      });
      body.querySelectorAll('[data-vm]').forEach(t => t.onclick = () => { viewMode = t.dataset.vm; render(m); });
      body.querySelectorAll('[data-pr]').forEach(o => o.onclick = () => {
        presetSel.has(o.dataset.pr) ? presetSel.delete(o.dataset.pr) : presetSel.add(o.dataset.pr);
        render(m);
      });
      const selall = body.querySelector('[data-x=selall]');
      if (selall) selall.onclick = () => { CAMERA.PRESETS.forEach(pr => presetSel.add(pr.id)); render(m); };
      body.querySelectorAll('[data-vr]').forEach(im => im.onclick = () => {
        const r = viewResults[+im.dataset.vr];
        s.image = r.img; touchImage(p, s); // 设为场景主图:形象变更打点
        U.toast('已将「' + r.label + '」设为场景主图', 'success');
        setTimeout(rerender, 100);
      });
      body.querySelector('[data-x=genv]').onclick = async () => {
        if (window.__rolesGenBusy) return U.toast('生成中,请稍候', 'info');
        window.__rolesGenBusy = true;
        try {
          const jobs = viewMode === 'custom'
            ? [{ label: `方位${az}°·仰角${el}°·距离${dist.toFixed(1)}` }]
            : CAMERA.PRESETS.filter(pr => presetSel.has(pr.id)).map(pr => ({ label: pr.name }));
          if (!jobs.length) return U.toast('请至少选择一个批量角度', 'error');
          const cost = jobs.length * COST.multiView;
          const useReal = window.Media && Media.isReady();
          const tk = Tasks.start({ type: '多视角生图', model: useReal ? MODELS.image[0] : MODELS.image[0] + '(模拟)', target: s.name, cost, projectId: p.id });
          if (!U.charge(cost, `场景多视角×${jobs.length}:${s.name}`)) { Tasks.fail(tk, '积分不足'); return; }
          // i2i 参考图:仅真实图片(服务端缓存路径/远程 url)才传给模型,占位 dataURL 不喂
          const refImg = s.image && !s.image.startsWith('data:') ? s.image : undefined;
          viewResults = [];
          let failCnt = 0;
          for (let jIdx = 0; jIdx < jobs.length; jIdx++) {
            const j = jobs[jIdx];
            if (useReal) {
              try {
                const r = await Media.genImage({
                  prompt: `${s.name}${s.description ? ',' + s.description : ''},${j.label}视角,${viewPhrase},电影美术设定图`,
                  size: '1024x1024', image: refImg,
                  billingAction: 'image.multiView', operationId: tk.id + '_mv' + jIdx, // 多视角逐张计费(索引做后缀防中文标签被规整后撞键;与预扣 jobs.length×COST.multiView 对齐)
                });
                viewResults.push({ label: j.label, img: r.url });
              } catch (e) {
                failCnt++;
                U.refund(COST.multiView, `多视角失败:${s.name} ${j.label}`, (e && e.__opId) || (tk.id + '_mv' + jIdx)); // 十七轮:镜像关联原 operation
                U.toast(`「${j.label}」生成失败,已退费:` + e.message, 'error', 3500);
              }
            } else {
              await U.delay(700);
              viewResults.push({ label: j.label, img: PH.image({ label: s.name, sub: j.label, kind: 'scene', w: 360, h: 360, seedText: 'mv:' + s.name + ':' + j.label + Date.now() % 991 }) });
            }
            render(m);
          }
          // 有产物记 done(带首张产物),全失败记 fail(费用已逐张退)
          if (viewResults.length) Tasks.done(tk, { filename: `${s.name}_多视角_${viewResults[0].label}.png`, dataURL: viewResults[0].img });
          else Tasks.fail(tk, '全部视角生成失败');
          U.toast(`多视角生成完成(${viewResults.length} 张${failCnt ? `,失败 ${failCnt} 张已退费` : ''})`, failCnt ? 'info' : 'success');
        } finally { window.__rolesGenBusy = false; }
      };
    }

    /* ===== 多机位视角(宫格生图组) ===== */
    function gridTabHTML() {
      const ch = CAMERA.CHANNELS[chIdx];
      const camPanel = CAMERA.configPanel(camState);
      return `
      <div class="grid" style="grid-template-columns:1fr 1fr;gap:18px">
        <div>
          <label class="field"><span>机位布局</span>
            <div class="model-row">${[[2, '4宫格 (2×2)'], [3, '9宫格 (3×3)'], [4, '16宫格 (4×4)'], [5, '25宫格 (5×5)']].map(([c, t]) => `<div class="model-opt ${cols === c ? 'sel' : ''}" data-cols="${c}">${t}</div>`).join('')}</div>
          </label>
          <label class="field"><span>提示词(选填)</span><input class="input" data-f="gprompt" placeholder="输入多机位视角提示词"></label>
          <label class="field"><span>渠道选择</span>
            <div class="model-row">${CAMERA.CHANNELS.map((c, i) => `<div class="model-opt ${i === chIdx ? 'sel' : ''}" data-ch="${i}">${c.label}</div>`).join('')}</div>
            <div class="hint">${U.esc(ch.model)}(模拟)</div>
          </label>
          <label class="field"><span>比例选择</span>
            <div class="model-row">${['1:1', '16:9', '9:16'].map(r => `<div class="model-opt ${ratio === r ? 'sel' : ''}" data-ratio="${r}">${r}</div>`).join('')}</div>
          </label>
          <div class="check-line" data-x="camsw"><span class="switch ${camOn ? 'on' : ''}"></span>摄像机配置(机身/镜头/焦距/光圈)</div>
          <div data-camwrap style="display:${camOn ? '' : 'none'};margin-top:8px">${camPanel.html}</div>
          <button class="btn primary" style="margin-top:12px" data-x="gen">生成宫格图(消耗 ${ch.cost} 积分)</button>
        </div>
        <div>
          <div class="imgbox" style="border-radius:10px;overflow:hidden;background:var(--bg2);min-height:220px;display:flex;align-items:center;justify-content:center" data-gpreview>
            ${gridImg ? `<img src="${U.thumb(gridImg)}" style="width:100%;display:block">` : '<div class="gen-tip">🎥<span>宫格生图预览区</span></div>'}
          </div>
          ${gridImg ? `
          <div class="row wrap" style="margin-top:10px;gap:6px">
            <button class="btn sm" data-x="split">✂ 宫格切分</button>
            <button class="btn sm" data-x="savegrp">💾 保存宫格生图组</button>
            <button class="btn sm" data-x="export">⬇ 导出组</button>
          </div>` : ''}
        </div>
      </div>`;
    }

    /* 真实宫格图客户端切分:共用 U.cropGridCells(均分裁格 → dataURL) */
    function cropGridCells(imgUrl, n) { return U.cropGridCells(imgUrl, n); }

    function bindGrid(body, m) {
      const camPanel = CAMERA.configPanel(camState);
      camPanel.bind(body.querySelector('[data-camwrap]') || body);
      body.querySelectorAll('[data-cols]').forEach(o => o.onclick = () => { cols = +o.dataset.cols; render(m); });
      body.querySelectorAll('[data-ch]').forEach(o => o.onclick = () => { chIdx = +o.dataset.ch; render(m); });
      body.querySelectorAll('[data-ratio]').forEach(o => o.onclick = () => { ratio = o.dataset.ratio; render(m); });
      body.querySelector('[data-x=camsw]').onclick = () => { camOn = !camOn; render(m); };
      body.querySelector('[data-x=gen]').onclick = async () => {
        if (window.__rolesGenBusy) return U.toast('生成中,请稍候', 'info');
        window.__rolesGenBusy = true;
        try {
          const ch = CAMERA.CHANNELS[chIdx];
          const promptTxt = body.querySelector('[data-f=gprompt]').value.trim();
          const tk = Tasks.start({ type: '多机位宫格', model: ch.model, target: s.name, cost: ch.cost, projectId: p.id });
          if (!U.charge(ch.cost, `多机位${cols * cols}宫格:${s.name}(${ch.model})`)) { Tasks.fail(tk, '积分不足'); return; }
          const box = body.querySelector('[data-gpreview]');
          const sizeMap = ch.hiRes
            ? { '1:1': '2048x2048', '16:9': '2048x1152', '9:16': '1152x2048' }  // 渠道一:2K 高精
            : { '1:1': '1024x1024', '16:9': '1280x720', '9:16': '720x1280' };   // 渠道二:标清
          if (window.Media && Media.isReady()) {
            // 真实生成:一张多机位宫格图(i2i 参考场景主图),再客户端均分切格
            box.innerHTML = `<div class="gen-tip"><div class="spinner"></div><div>真实模型宫格生图中(约 1 分钟)…</div></div>`;
            const refImg = s.image && !s.image.startsWith('data:') ? s.image : undefined;
            const camSpec = camOn ? CAMERA.buildSpec(camState) : '';
            try {
              const r = await Media.genImage({
                prompt: `${s.name}${s.description ? ',' + s.description : ''}${promptTxt ? ',' + promptTxt : ''},${cols}x${cols} ${s.kind === 'scene' ? '多机位' : '多角度'}宫格图,严格 ${cols} 行 ${cols} 列网格均分,每格${viewPhrase}的变体(正面/侧面/背面/俯拍/仰拍/特写等),电影美术设定图,网格线清晰${camSpec ? ',' + camSpec : ''}`,
                size: sizeMap[ratio] || '1024x1024', image: refImg,
                billingAction: ch.id === 'ch1' ? 'image.multiCam1' : 'image.multiCam2', operationId: tk.id, // 渠道一 2K 高精 21 / 渠道二标清 11(服务端白名单)
              });
              gridImg = r.url;
              cells = await cropGridCells(r.url, cols);
              if (!cells.length) {
                /* 十轮:切分失败不再退款——宫格图已由上游成功生成(服务端 operation 已交付),
                 * gridImg 保留在预览中可手动保存使用;切分是本地后处理,失败不构成"未交付"。
                 * 此前本地退款无 operationId,服务端余额不变,下次同步会把余额改回(两端漂移) */
                Tasks.fail(tk, '宫格切分失败(原图已生成并保留)');
                Store.save();
                U.toast('宫格切分失败(跨域等),原图已生成可手动使用;本次不退费', 'error', 5000);
                render(m);
                return;
              }
              Store.save();
              Tasks.done(tk, { filename: `${s.name}_多机位${cols * cols}宫格.png`, dataURL: gridImg });
              U.toast(`${cols * cols} 宫格生图完成${camSpec ? '(' + camSpec + ')' : ''}`, 'success', 3000);
            } catch (e) {
              U.refund(ch.cost, `多机位宫格失败:${s.name}`, (e && e.__opId) || tk.id); // 十七轮:镜像关联原 operation
              Tasks.fail(tk, e.message);
              U.toast('宫格生图失败,积分已自动返还:' + e.message, 'error', 4000);
            }
            render(m);
            return;
          }
          // 离线模式:占位宫格
          await U.progressIn(box, 1600 + cols * 200, ch.label + ' 宫格生图中(离线模拟)');
          const salt = Date.now() % 997;
          gridImg = PH.grid(s.name + (promptTxt ? '·' + promptTxt.slice(0, 8) : ''), s.kind || 'scene', cols, salt + (camOn ? CAMERA.buildSpec(camState) : ''));
          cells = PH.gridCells(s.name, s.kind || 'scene', cols, salt);
          Store.save();
          Tasks.done(tk, { filename: `${s.name}_多机位${cols * cols}宫格.png`, dataURL: gridImg });
          U.toast(`${cols * cols} 宫格生图完成(离线模拟)${camOn ? '(' + CAMERA.buildSpec(camState) + ')' : ''}`, 'success', 3000);
          render(m);
        } finally { window.__rolesGenBusy = false; }
      };
      const splitBtn = body.querySelector('[data-x=split]');
      if (splitBtn) splitBtn.onclick = () => openSplit(m);
      const saveBtn = body.querySelector('[data-x=savegrp]');
      if (saveBtn) saveBtn.onclick = () => openSaveGroup();
      const expBtn = body.querySelector('[data-x=export]');
      if (expBtn) expBtn.onclick = () => {
        U.downloadDataURL(`${s.name}_多机位${cols * cols}宫格.png`, gridImg);
        U.downloadText(`${s.name}_宫格组清单.txt`, `宫格生图组导出\n场景:${s.name}\n布局:${cols * cols} 宫格(${cols}×${cols})\n渠道:${CAMERA.CHANNELS[chIdx].model}\n比例:${ratio}\n机位配置:${camOn ? CAMERA.buildSpec(camState) : '默认'}\n导出时间:${Store.now()}\n共 ${cells.length} 个机位格`);
        U.toast('宫格组已导出(图+清单)', 'success');
      };
    }

    /* 宫格切分:选格拆成单张 */
    function openSplit(parentM) {
      const sel = new Set();
      U.openModal({
        title: '宫格切分(按住 Shift 键可批量选择)',
        wide: true,
        body: `
        <div style="display:grid;grid-template-columns:repeat(${cols},1fr);gap:6px" data-splitgrid>
          ${cells.map((c, i) => `<img src="${U.thumb(c)}" data-cell="${i}" style="width:100%;border-radius:6px;cursor:pointer;border:2px solid transparent">`).join('')}
        </div>
        <div class="row" style="margin-top:10px;justify-content:space-between">
          <span class="small muted" data-selcnt>已选 0 格</span>
          <div class="row">
            <button class="btn sm" data-x="dl">⬇ 下载选中</button>
            <button class="btn sm" data-x="toforms" title="选中格直接存为该主体的${formWord(s.kind)},分镜按「${s.name}-形态名」引用">🧩 存为${formWord(s.kind)}</button>
            <button class="btn sm primary" data-x="toasset">🗂 拆分入资产库</button>
          </div>
        </div>`,
        onMount(m2) {
          m2.querySelectorAll('[data-cell]').forEach(im => im.onclick = () => {
            const i = +im.dataset.cell;
            sel.has(i) ? sel.delete(i) : sel.add(i);
            im.style.borderColor = sel.has(i) ? 'var(--accent)' : 'transparent';
            m2.querySelector('[data-selcnt]').textContent = '已选 ' + sel.size + ' 格';
          });
          m2.querySelector('[data-x=dl]').onclick = () => {
            if (!sel.size) return U.toast('请先选择要拆分的宫格', 'error');
            [...sel].forEach(i => U.downloadDataURL(`${s.name}_宫格-${i + 1}.png`, cells[i]));
            U.toast('已下载 ' + sel.size + ' 张宫格拆分图', 'success');
          };
          m2.querySelector('[data-x=toasset]').onclick = () => {
            if (!sel.size) return U.toast('请先选择要拆分的宫格', 'error');
            const u = Store.currentUser();
            [...sel].forEach(i => Store.state.assets.subjects.push({
              id: Store.uid('as'), userId: u.id, kind: 'scene', name: `${s.name}·宫格-${i + 1}`,
              image: cells[i], prompt: '', tags: ['宫格切分'], groupId: null, fromProject: p.name, time: Store.now(),
            }));
            Store.save();
            U.toast(`拆分成功,${sel.size} 张已入资产库`, 'success');
          };
          /* 宫格分配闭环:选中格 → 该主体形态图(与资产库同口径存 dataURL;命名自动,后续可在形态管理改名) */
          m2.querySelector('[data-x=toforms]').onclick = async () => {
            if (!sel.size) return U.toast('请先选择要拆分的宫格', 'error');
            s.forms = s.forms || [];
            let upCnt = 0;
            for (const i of [...sel]) {
              let img = cells[i];
              const up = await U.uploadData(`${s.name}_宫格-${i + 1}.png`, img); // 在线传服务端换 /uploads/ 短路径,离线回退 dataURL
              if (up) { img = up; upCnt++; }
              s.forms.push({ id: Store.uid('fm'), name: `格${i + 1}`, image: img, time: Store.now() });
            }
            Store.save();
            U.toast(`${sel.size} 格已存为${formWord(s.kind)}${upCnt ? '(已传服务端)' : ''},可在「🧩 ${formWord(s.kind)}」中管理改名`, 'success', 3500);
            rerender && rerender();
          };
        },
      });
    }

    /* 保存宫格生图组:选择或创建分组 + 标签 */
    function openSaveGroup() {
      const groups = Store.myGroups();
      const COMMON_TAGS = ['场景机位', '宫格组', '多机位', '备用视角'];
      let groupId = '', newGroup = '', tags = new Set(['宫格组']), newTag = '';
      U.openModal({
        title: '保存宫格生图组',
        body: `
        <label class="field"><span>选择或创建分组</span>
          <select class="select" data-f="grp"><option value="">未分组</option>${groups.map(g => `<option value="${g.id}">${U.esc(g.name)}</option>`).join('')}</select>
          <div class="row" style="margin-top:6px"><input class="input" data-f="newgrp" placeholder="或输入新分组名称"><button class="btn sm" data-x="mkgrp">新建分组</button></div>
        </label>
        <label class="field"><span>选择或创建标签(至少一个)</span>
          <div class="model-row">${COMMON_TAGS.map(t => `<div class="model-opt sel" data-tag="${t}">${t}</div>`).join('')}</div>
          <div class="row" style="margin-top:6px"><input class="input" data-f="newtag" placeholder="或输入新标签"><button class="btn sm" data-x="mktag">新建标签</button></div>
        </label>`,
        footer: `<button class="btn" data-x="cancel">取消</button><button class="btn primary" data-x="ok">保存中...</button>`,
        onMount(m2, close2) {
          const okBtn = m2.querySelector('[data-x=ok]');
          okBtn.textContent = '确定';
          m2.querySelector('[data-x=mkgrp]').onclick = () => {
            const n = m2.querySelector('[data-f=newgrp]').value.trim();
            if (!n) return U.toast('请输入分组名称', 'error');
            const g = { id: Store.uid('grp'), userId: Store.currentUser().id, name: n, shared: [], time: Store.now() };
            Store.state.assets.groups.push(g); Store.save();
            const sel = m2.querySelector('[data-f=grp]');
            sel.innerHTML += `<option value="${g.id}" selected>${U.esc(n)}</option>`;
            sel.value = g.id;
            U.toast('分组已创建', 'success');
          };
          m2.querySelectorAll('[data-tag]').forEach(o => o.onclick = () => {
            tags.has(o.dataset.tag) ? tags.delete(o.dataset.tag) : tags.add(o.dataset.tag);
            o.classList.toggle('sel', tags.has(o.dataset.tag));
          });
          m2.querySelector('[data-x=mktag]').onclick = () => {
            const n = m2.querySelector('[data-f=newtag]').value.trim();
            if (!n) return U.toast('请输入标签名', 'error');
            tags.add(n);
            const row = m2.querySelector('.model-row');
            const chip = document.createElement('div');
            chip.className = 'model-opt sel';
            chip.textContent = n;
            chip.onclick = () => { tags.delete(n); chip.remove(); };
            row.appendChild(chip);
            U.toast('标签已添加', 'success');
          };
          m2.querySelector('[data-x=cancel]').onclick = close2;
          okBtn.onclick = async () => {
            if (!tags.size) return U.toast('请至少选择一个标签', 'error');
            groupId = m2.querySelector('[data-f=grp]').value || null;
            okBtn.disabled = true; okBtn.innerHTML = '<span class="spinner"></span> 保存中...';
            await U.delay(900);
            const u = Store.currentUser();
            Store.state.assets.subjects.push({
              id: Store.uid('as'), userId: u.id, kind: 'scene', name: `${s.name}·多机位组(${cols * cols}宫格)`,
              image: gridImg, prompt: '', tags: [...tags], groupId, fromProject: p.name, time: Store.now(),
            });
            cells.forEach((c, i) => Store.state.assets.subjects.push({
              id: Store.uid('as'), userId: u.id, kind: 'scene', name: `${s.name}·宫格-${i + 1}`,
              image: c, prompt: '', tags: [...tags], groupId, fromProject: p.name, time: Store.now(),
            }));
            Store.save();
            close2();
            U.toast(`宫格生图组已保存(1 组 + ${cells.length} 张单格)`, 'success', 3000);
          };
        },
      });
    }
  }

  window.RoleEditor = { openSubjectEdit, openMultiView };
})();
