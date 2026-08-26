/* ============ roles.js 角色 / 场景管理页 ============ */
(function () {
  window.Views = window.Views || {};
  const KIND_NAME = { character: '角色', scene: '场景', prop: '道具' }; // 与分集页三行分类命名对齐
  /* 形态名称语义按主体类型区分:角色叫「子形象」,道具/场景叫「形态」 */
  const formWord = kind => (kind === 'character' ? '子形象' : '形态');

  /* ---- 四模式预览:定妆照(典型场景)/半身照(白底正面)/三视图(白底)/视频参考(大头照) ----
   * 数据:主体挂四个可选字段 imgScene/imgHalf/imgSheet/imgRef,均不落库默认值,展示走回退链 */
  const VIEW_MODES = [
    { key: 'scene', label: '定妆照', desc: '典型场景定妆照', field: 'imgScene' },
    { key: 'half', label: '半身照', desc: '白底正面半身照', field: 'imgHalf' },
    { key: 'sheet', label: '三视图', desc: '白底三视图', field: 'imgSheet' },
    { key: 'ref', label: '视频参考', desc: '大头照(面部特写,视频模型参考专用)', field: 'imgRef' },
  ];
  /* 当前预览模式:优先用户记忆的 s.viewMode(仅展示层,不影响生成链路);
   * 存量角色数据 s.image 即白底三视图设定图(不实际迁移字段),故角色默认按「三视图」模式展示,回退链自然落到 s.image */
  function currentViewMode(s) {
    if (s.viewMode && VIEW_MODES.some(m => m.key === s.viewMode)) return s.viewMode;
    return s.kind === 'character' ? 'sheet' : 'scene';
  }
  /* 模式图回退链:对应模式字段 → s.image(权威参考图) → 空(显示「未生成图片」) */
  function viewImg(s, modeKey) {
    const m = VIEW_MODES.find(x => x.key === modeKey);
    return (m && s[m.field]) || s.image || '';
  }
  /* 按模式 AI 生图的定制提示词(统一出口:EpisodeUtil.buildSubjectPrompt;ref=视频参考大头照,勿喂三视图给视频模型) */
  function modePrompt(s, m) { return EpisodeUtil.buildSubjectPrompt(s, m.key); }

  /* 形象变更统一出口(改资产→引用联动):打点 imgVer,并统计受影响镜头数提示需重做 */
  function touchImage(p, s) {
    Store.touchSubject(s);
    const n = Store.staleVideoCount(p);
    U.toast(n
      ? `形象已更新,全项目引用处下次生成自动用新图;${n} 个已生成视频的镜头建议重生成`
      : '形象已更新,全项目引用处下次生成自动用新图', 'info', 4000);
  }

  /* ================= 共享操作(浏览卡片已瘦身,以下由原卡片 handler 抽出,供主体编辑页调用) ================= */

  /* ---- AI 生图(写权威参考 s.image;与主体确认弹窗共用 EpisodeUtil.genSubjectImage) ---- */
  async function genMainImage(p, s, done) {
    const old = s.image;
    await EpisodeUtil.genSubjectImage(p, s, done);
    if (s.image && s.image !== old) touchImage(p, s); // 生图成功才打点(失败退费未换图)
  }

  /* ---- 换图:上传替换权威参考 s.image ---- */
  async function replaceMainImage(p, s, done) {
    const f = await U.readAndUpload('image/*');
    if (!f) return;
    s.image = f.url;
    // 换图后定稿失效(形象已变,需重新定稿锁定)
    if (s.isSubject) { s.isSubject = false; U.toast('形象已更换,定稿已失效,请确认后重新定稿', 'info', 3000); }
    touchImage(p, s);
    done && done();
  }

  /* ---- 按模式 AI 生图:只写对应模式字段(预览备选),不动权威参考 s.image,故不打 imgVer 点 ----
   * 八轮:收敛到 Tasks.run 五件套(登记→扣费→执行→done/失败退费;退费镜像带 operationId,服务端可对账) */
  async function genModeImage(p, s, m, done) {
    const model = MODELS.image[0];
    await Tasks.run({ type: '文生图(' + m.label + ')', model, target: s.name, cost: COST.image, actionName: `AI生图(${m.label}):${s.name}`, projectId: p.id }, async (tk) => {
      if (window.Media && Media.isReady()) {
        // 真实模式失败抛错由 Tasks.run 统一退费,不用占位图冒充产物
        const r = await Media.genImage({ prompt: modePrompt(s, m), model: Media.realModel(model), billingAction: 'image.gen', operationId: tk.id });
        s[m.field] = r.url;
      } else {
        await U.delay(900); // 离线模式:本地占位图
        s[m.field] = PH.subject(s.name + m.key + Date.now() % 991, s.kind);
      }
      Store.save();
      U.toast(`${m.label}已生成(可在顶部「设为当前参考图」生效为权威参考)`, 'success');
      done && done();
      return { filename: `${s.name}_${m.label}.png`, dataURL: s[m.field] };
    });
  }

  /* ---- 音色选择 ---- */
  function setVoice(p, s, done) {
    Voice.settingModal({
      title: '音色设置 · ' + s.name,
      value: s.voiceCfg || s.voice,
      onSave(cfg) {
        s.voiceCfg = cfg;
        s.voice = cfg.voice; // 兼容旧字符串字段
        Store.save();
        U.toast(`「${s.name}」音色已保存:${Voice.label(cfg)}`, 'success');
        done && done();
      },
    });
  }

  /* ---- 按性格推荐音色 ---- */
  async function recommendVoice(p, s, done) {
    const r = await Persona.recommendVoice(p, s, Voice.LIB.map(v => v.name));
    s.voiceCfg = Object.assign(Voice.norm(s.voiceCfg || s.voice), { voice: r.voice });
    s.voice = r.voice;
    Store.save();
    U.toast(`已按性格推荐「${r.voice}」:${r.reason}`, 'success', 3500);
    done && done();
  }

  /* ---- 批量推荐音色:全部角色一次 LLM 调用,试听确认后批量绑定 ---- */
  async function batchRecommendVoices(p, done) {
    const chars = p.subjects.filter(s => s.kind === 'character');
    if (!chars.length) return U.toast('项目暂无角色主体', 'info');
    const voices = Voice.LIB.map(v => v.name);
    U.toast('AI 配音导演正在为全部角色推荐音色…', 'info', 2200);
    const rec = await Persona.recommendVoicesBatch(p, chars, voices);
    U.openModal({
      title: `🎙 批量配音色(${chars.length} 个角色)`,
      wide: true,
      body: `
      <div class="hint" style="margin-bottom:10px">AI 按人设(性格/语气)推荐的音色,可逐角色改选与试听;确认后批量绑定(语速/语调等细项之后仍可在卡片「🎙」中单独调整)。</div>
      <div style="max-height:52vh;overflow:auto;display:flex;flex-direction:column;gap:8px">
        ${chars.map((s, i) => `
        <div class="card row" style="padding:8px 12px;gap:8px;align-items:center;flex-wrap:wrap">
          <b style="min-width:80px">${U.esc(s.name)}</b>
          <select class="input small" data-bv="${i}" style="min-width:150px">
            ${voices.map(v => `<option value="${U.esc(v)}" ${rec[s.name].voice === v ? 'selected' : ''}>${U.esc(v)}</option>`).join('')}
          </select>
          <button class="btn sm" data-try="${i}" title="试听所选音色(浏览器语音合成预览)">▶ 试听</button>
          <span class="small muted grow">${U.esc(rec[s.name].reason || '')}</span>
        </div>`).join('')}
      </div>`,
      footer: `<button class="btn" data-x="cancel">取消</button><button class="btn primary" data-x="ok">✓ 绑定全部音色</button>`,
      onMount(m, close) {
        m.querySelectorAll('[data-try]').forEach(btn => btn.onclick = () => {
          const i = +btn.dataset.try;
          const v = m.querySelector(`[data-bv="${i}"]`).value;
          const meta = Voice.byName(v) || {};
          Voice.speak(`你好,我是${chars[i].name}`, { voice: v, rate: 1, volume: 7, pitch: meta.gender === '女' ? 1.2 : meta.age === '老年' ? 0.8 : 1 });
        });
        m.querySelector('[data-x=cancel]').onclick = close;
        m.querySelector('[data-x=ok]').onclick = () => {
          chars.forEach((s, i) => {
            const v = m.querySelector(`[data-bv="${i}"]`).value;
            s.voiceCfg = Object.assign(Voice.norm(s.voiceCfg || s.voice), { voice: v });
            s.voice = v; // 兼容旧字符串字段
          });
          Store.save(); close();
          U.toast(`已为 ${chars.length} 个角色批量绑定音色`, 'success', 3000);
          done && done();
        };
      },
    });
  }

  /* ---- 音色参考音频绑定(音频与角色资产绑定,生成时随资产注入) ---- */
  function bindRefAudio(p, s, done) {
    U.openModal({
      title: '🎵 音色参考 · ' + s.name,
      body: `
      <div class="hint" style="margin:0 0 10px">绑定一段音频作为该角色的音色参考(建议 15 秒内),分镜生成视频时随角色资产自动注入。</div>
      ${s.refAudio ? `
      <div class="card" style="padding:12px;margin-bottom:10px">
        <div class="row" style="justify-content:space-between;margin-bottom:6px">
          <b class="small">${U.esc(s.refAudio.name)}</b>
          <span class="tag green">已绑定</span>
        </div>
        <audio controls src="${U.esc(s.refAudio.url)}" style="width:100%;height:32px"></audio>
      </div>` : '<div class="empty" style="padding:18px"><p class="small muted">尚未绑定音色参考音频</p></div>'}`,
      footer: `
        ${s.refAudio ? '<button class="btn danger" data-x="unbind">解绑</button>' : ''}
        <button class="btn primary" data-x="up">${s.refAudio ? '重新上传' : '上传音频'}</button>`,
      onMount(m, close) {
        const up = m.querySelector('[data-x=up]');
        if (up) up.onclick = async () => {
          const f = await U.readAndUpload('audio/*', { maxMB: 15 });
          if (!f) return;
          s.refAudio = { name: f.name, url: f.url, time: Store.now() };
          Store.save(); close();
          U.toast('音色参考已绑定', 'success');
          done && done();
        };
        const unbind = m.querySelector('[data-x=unbind]');
        if (unbind) unbind.onclick = () => {
          delete s.refAudio; Store.save(); close();
          U.toast('已解绑音色参考', 'success'); done && done();
        };
      },
    });
  }

  /* ---- 多形态管理(角色/场景/道具均可挂多个形态,按"名称-形态名"引用) ---- */
  function openForms(p, s, done) {
    const fw = formWord(s.kind); // 角色=子形象,道具/场景=形态
    s.forms = s.forms || [];
    const close = U.openModal({
      title: `🧩 ${s.kind === 'character' ? '子形象' : '多形态'} · ` + s.name,
      wide: true,
      body: '<div data-fbody></div>',
      onMount(m) { renderForms(m); },
    });
    function renderForms(m) {
      const body = m.querySelector('[data-fbody]');
      body.innerHTML = `
      <div class="hint" style="margin:0 0 10px">${fw}与默认形象平级,按「${U.esc(s.name)}-${fw}名」在分镜/镜头组中引用;「设为主图」可将${fw}图切换为主体当前形象。</div>
      <div class="row wrap" style="gap:10px;margin-bottom:12px">
        <div style="text-align:center">
          <div style="width:88px;height:88px;border-radius:8px;overflow:hidden;background:var(--bg2);border:2px solid var(--accent);display:flex;align-items:center;justify-content:center">
            ${s.image ? `<img src="${U.thumb(s.image)}" style="width:100%;height:100%;object-fit:cover">` : '<span class="small muted">无图</span>'}
          </div>
          <div class="small" style="margin-top:4px">默认形象</div>
        </div>
        ${s.forms.map(f => `
        <div style="text-align:center">
          <div style="width:88px;height:88px;border-radius:8px;overflow:hidden;background:var(--bg2);border:1px solid var(--border2);display:flex;align-items:center;justify-content:center">
            ${f.image ? `<img src="${U.thumb(f.image)}" style="width:100%;height:100%;object-fit:cover">` : '<span class="small muted">无图</span>'}
          </div>
          <div class="small" style="margin-top:4px;max-width:88px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${U.esc(s.name + '-' + f.name)}">${U.esc(f.name)}</div>
          <div class="row" style="gap:4px;justify-content:center;margin-top:4px">
            <button class="btn ghost sm" data-fmain="${f.id}" title="设为主图">⇧</button>
            <button class="btn ghost sm" data-fup="${f.id}" title="换图">⬆</button>
            <button class="btn ghost sm danger" data-frm="${f.id}" title="删除${fw}">✕</button>
          </div>
        </div>`).join('')}
      </div>
      <div class="row" style="gap:6px">
        <input class="input grow" data-f="fname" placeholder="新${fw}名称,如:${s.kind === 'character' ? '少年期 / 成年期 / 战损妆' : '破损态 / 发光态 / 旧化态'}">
        <button class="btn primary" data-x="addform">＋ 新建${fw}</button>
      </div>`;
      body.querySelector('[data-x=addform]').onclick = async () => {
        const name = body.querySelector('[data-f=fname]').value.trim();
        if (!name) return U.toast(`请输入${fw}名称`, 'error');
        if (name.includes('-')) return U.toast(`${fw}名不能包含 "-"`, 'error');
        if (s.forms.some(f => f.name === name)) return U.toast(`${fw}名已存在`, 'error');
        const f = await U.readAndUpload('image/*');
        const image = f ? f.url : '';
        s.forms.push({ id: Store.uid('fm'), name, image, time: Store.now() });
        Store.save();
        U.toast(`${fw}「${s.name}-${name}」已创建${f ? '' : '(可稍后换图)'}`, 'success');
        renderForms(m); done && done();
      };
      body.querySelectorAll('[data-fmain]').forEach(x => x.onclick = () => {
        const f = s.forms.find(y => y.id === x.dataset.fmain);
        if (!f || !f.image) return U.toast(`该${fw}还没有图片`, 'error');
        const old = s.image;
        s.image = f.image; f.image = old || f.image;
        touchImage(p, s); // 形象变更打点:引用联动 + 已生成视频"需重做"提示
        U.toast(`已将「${f.name}」设为默认形象`, 'success');
        renderForms(m); done && done();
      });
      body.querySelectorAll('[data-fup]').forEach(x => x.onclick = async () => {
        const f = s.forms.find(y => y.id === x.dataset.fup);
        const file = await U.readAndUpload('image/*');
        if (!file) return;
        f.image = file.url;
        touchImage(p, s); // 形态图变更同样视为该主体形象变更
        U.toast(`${fw}图已更新`, 'success');
        renderForms(m); done && done();
      });
      body.querySelectorAll('[data-frm]').forEach(x => x.onclick = () => {
        const f = s.forms.find(y => y.id === x.dataset.frm);
        U.confirm(`删除${fw}「${f.name}」?`, () => {
          s.forms = s.forms.filter(y => y.id !== f.id);
          Store.save(); renderForms(m); done && done();
        }, '删除');
      });
    }
  }

  /* ---- 定稿/取消定稿(原「注册主体」):锁定权威参考形象 ---- */
  function toggleFinalize(p, s, done) {
    if (s.isSubject) {
      s.isSubject = false; Store.save();
      U.toast(`「${s.name}」已取消定稿,生成时回退为普通参考图`, 'info');
      done && done(); return;
    }
    if (!s.image) return U.toast('请先生成或上传主体图片再定稿', 'error');
    s.isSubject = true;
    s.subjectAt = Store.now();
    Store.save();
    U.toast(`「${s.name}」已定稿:当前形象锁定为权威参考,生成视频时按主体级参考优先使用`, 'success', 3000);
    done && done();
  }

  Views.roles = function (main, pid, embedded) {
    const p = Store.getProject(pid);
    if (!p) { location.hash = '#/projects'; return; }
    let tab = 'character';
    // 分集页主体 tag 跳转联动:预定位到该主体所属分类 tab(卡片高亮滚动在 render 内消费)
    if (window.__roleFocus) {
      const f = p.subjects.find(x => x.id === window.__roleFocus);
      if (f) tab = f.kind;
    }

    function render() {
      const list = p.subjects.filter(s => s.kind === tab);
      const needGen = p.subjects.filter(s => !s.image); // 缺权威参考图的主体(此前流程未跑完的)
      const genAllBtn = needGen.length ? `<button class="btn sm primary" data-x="genall" title="为全部缺图主体一键 AI 生图(每张 -${COST.image} 积分,逐张扣费,余额不足即停)">✨ 补齐主体图(${needGen.length})</button>` : '';
      const newSubjBtn = `<button class="btn sm" data-x="newsubj" title="手动新建主体(角色/场景/道具),不经剧本解析">＋ 新建主体</button>`;
      const batchVoiceBtn = p.subjects.some(s => s.kind === 'character') ? `<button class="btn sm" data-x="bvoice" title="AI 按人设为全部角色推荐音色,试听确认后批量绑定">✨ 批量配音色</button>` : '';
      main.innerHTML = `
      <div class="page">
        ${embedded ? '' : `
        <div class="crumb" onclick="location.hash='#/project/${p.id}'">‹ 返回 ${U.esc(p.name)}</div>
        <div class="page-head">
          <div>
            <div class="page-title">角色 / 场景管理</div>
            <div class="page-sub">点击主体卡片进入编辑页:精修形象、配置音色、定稿锁定,确保多集一致性</div>
            <div class="hint" style="margin-top:4px">🎙 旁白配音在分集工作区 · 参数配置中设置</div>
          </div>
          <div class="row">
            ${newSubjBtn}
            ${batchVoiceBtn}
            ${genAllBtn}
            <button class="btn sm" data-x="importlib" title="把资产库里的主体导入本项目复用">📥 从资产库导入</button>
            ${p.narration ? `<span class="tag cyan">旁白:${U.esc(Voice.label(p.narration))}</span>` : '<span class="tag">旁白:未设置</span>'}
          </div>
        </div>`}
        ${embedded ? `<div class="row" style="justify-content:flex-end;margin-bottom:8px">
          ${newSubjBtn}
          ${batchVoiceBtn}
          ${genAllBtn}
          <button class="btn sm" data-x="importlib" title="把资产库里的主体导入本项目复用">📥 从资产库导入</button>
          ${p.narration ? `<span class="tag cyan">旁白:${U.esc(Voice.label(p.narration))}</span>` : '<span class="tag">旁白:未设置</span>'}
        </div>` : ''}
        <div class="tabs">
          <div class="tab ${tab === 'character' ? 'active' : ''}" data-tab="character">🎭 角色(${p.subjects.filter(s => s.kind === 'character').length})</div>
          <div class="tab ${tab === 'scene' ? 'active' : ''}" data-tab="scene">🏞 场景(${p.subjects.filter(s => s.kind === 'scene').length})</div>
          <div class="tab ${tab === 'prop' ? 'active' : ''}" data-tab="prop">🗡 道具(${p.subjects.filter(s => s.kind === 'prop').length})</div>
        </div>
        ${list.length === 0 ? `<div class="empty"><div class="ico">🎭</div><p>暂无${KIND_NAME[tab]}主体,请先通过「上传剧本 → 解析剧本」提取主体</p></div>` : `
        <div class="grid subj-grid">
          ${list.map(s => {
            const vm = currentViewMode(s);
            const img = viewImg(s, vm);
            return `
          <div class="card subj-card">
            <div class="imgbox" data-imgbox="${s.id}" style="cursor:pointer" title="点击打开主体编辑页(精修/配音/定稿)">${img ? `<img src="${U.thumb(img)}" ${vm === 'sheet' ? 'class="sheet"' : ''}>` : '<span class="muted small">未生成图片</span>'}</div>
            <div class="row" style="gap:4px;margin-bottom:8px">
              ${VIEW_MODES.map(m => `<button class="btn ghost sm ${vm === m.key ? 'primary' : ''}" style="flex:1;padding:2px 0;font-size:11px" data-vmode="${s.id}:${m.key}" title="${m.desc}">${m.label}</button>`).join('')}
            </div>
            <div class="row" style="justify-content:space-between;margin-bottom:8px">
              <b data-sname="${s.id}" style="cursor:pointer" title="点击打开主体编辑页">${U.esc(s.name)}</b>
              ${s.isSubject ? '<span class="tag green" title="已定稿:当前形象已锁定为该主体权威参考,生成时优先按主体级参考使用">✓ 已定稿</span>' : ''}
            </div>
            ${!s.image ? `<button class="btn sm primary" style="width:100%;margin-bottom:6px" data-genone="${s.id}" title="AI 生成主体图(-${COST.image}积分,直接写入权威参考图)">✨ AI 生图</button>` : ''}
            <div class="row" style="gap:4px">
              ${s.kind === 'character' ? `<button class="btn sm grow" data-voice="${s.id}" title="绑定该角色的说话音色(系统音色库/语速/语调/情感),生成配音与视频时使用">${(s.voiceCfg || s.voice) ? '🎙 ' + U.esc(Voice.norm(s.voiceCfg || s.voice).voice) : '🎙 绑定音色'}</button>
              <button class="btn sm" data-refaudio="${s.id}" title="绑定音色参考音频(生成视频时随角色资产注入)">🎵${s.refAudio ? ' ✓' : ''}</button>` : ''}
              <button class="btn sm danger" data-del="${s.id}" title="从本项目删除该主体(资产库中已存的副本不受影响)">🗑 删除</button>
            </div>
          </div>`; }).join('')}
        </div>`}
      </div>`;

      main.querySelectorAll('[data-tab]').forEach(t => t.onclick = () => { tab = t.dataset.tab; render(); });
      /* 分集页主体 tag 跳转联动:滚动到该主体卡片并短暂高亮(消费后即清除,避免后续重渲重复触发) */
      if (window.__roleFocus) {
        const fid = window.__roleFocus;
        window.__roleFocus = null;
        const box = main.querySelector(`[data-imgbox="${fid}"]`);
        const card = box && box.closest('.subj-card');
        if (card) {
          card.style.outline = '2px solid var(--accent)';
          card.style.boxShadow = '0 0 0 4px rgba(124,92,255,.18)';
          setTimeout(() => { card.style.outline = ''; card.style.boxShadow = ''; }, 2200);
          setTimeout(() => card.scrollIntoView({ behavior: 'smooth', block: 'center' }), 60);
        }
      }
      /* 从资产库导入主体(与「存入资产库」构成双向流通) */
      main.querySelector('[data-x=importlib]').onclick = () => {
        const lib = Store.myAssets();
        if (!lib.length) return U.toast('资产库暂无主体,可先在项目内「存入资产库」', 'info');
        const KIND_TAG = { character: 'cyan', scene: 'green', prop: 'yellow', keyframe: 'purple' };
        U.openModal({
          title: '📥 从资产库导入主体',
          wide: true,
          body: `
          <div class="hint" style="margin:0 0 10px">点击导入到本项目(同名会覆盖图片与提示词),资产库原件保留。</div>
          <div class="grid" style="grid-template-columns:repeat(auto-fill,minmax(130px,1fr));max-height:46vh;overflow-y:auto">
            ${lib.map(a => `
            <div class="card" style="padding:8px;cursor:pointer" data-libimp="${a.id}">
              <div style="height:80px;border-radius:6px;overflow:hidden;background:var(--bg2);display:flex;align-items:center;justify-content:center;margin-bottom:6px">
                ${a.image ? `<img src="${U.thumb(a.image)}" style="width:100%;height:100%;object-fit:cover">` : '<span class="small muted">无图</span>'}
              </div>
              <div class="small" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${U.esc(a.name)}</div>
              <span class="tag ${KIND_TAG[a.kind] || ''}" style="font-size:10px">${KIND_NAME[a.kind] || a.kind}</span>
              ${(a.forms || []).length ? `<span class="tag cyan" style="font-size:10px">🧩 ${a.forms.length} ${formWord(a.kind)}</span>` : ''}
            </div>`).join('')}
          </div>`,
          footer: `<button class="btn primary" data-x="done">完成</button>`,
          onMount(m, close) {
            m.querySelectorAll('[data-libimp]').forEach(c => c.onclick = () => {
              const a = lib.find(x => x.id === c.dataset.libimp);
              if (!a) return;
              const exist = p.subjects.find(x => x.name === a.name && x.kind === (a.kind === 'keyframe' ? 'prop' : a.kind));
              if (exist) {
                exist.image = a.image || exist.image;
                exist.prompt = a.prompt || exist.prompt;
                // 还原形态:重新发 id,避免与资产库原件互相牵连
                if ((a.forms || []).length) exist.forms = a.forms.map(f => ({ id: Store.uid('fm'), name: f.name, image: f.image || '', time: f.time || Store.now() }));
              } else {
                p.subjects.push({ id: Store.uid('sj'), name: a.name, kind: a.kind === 'keyframe' ? 'prop' : a.kind, image: a.image || '', prompt: a.prompt || '', forms: (a.forms || []).map(f => ({ id: Store.uid('fm'), name: f.name, image: f.image || '', time: f.time || Store.now() })) });
              }
              Store.save();
              c.style.outline = '2px solid var(--accent)';
              U.toast(`已导入「${a.name}」`, 'success');
            });
            m.querySelector('[data-x=done]').onclick = () => { close(); render(); };
          },
        });
      };
      /* ---- 三模式预览切换:仅改本卡片显示,并记忆到 s.viewMode(与编辑页联动) ---- */
      main.querySelectorAll('[data-vmode]').forEach(b => b.onclick = () => {
        const sep = b.dataset.vmode.indexOf(':');
        const s = p.subjects.find(x => x.id === b.dataset.vmode.slice(0, sep));
        if (!s) return;
        s.viewMode = b.dataset.vmode.slice(sep + 1);
        Store.save();
        render();
      });
      /* ---- 新建主体(不经剧本解析的手动路径):类型/名称/描述,可选创建后立即生图 ---- */
      const newSubj = main.querySelector('[data-x=newsubj]');
      if (newSubj) newSubj.onclick = () => {
        let kind = tab; // 默认当前分类 tab
        U.openModal({
          title: '＋ 新建主体',
          body: `
          <label class="field"><span>主体类型</span>
            <div class="model-row">${[['character', '🎭 角色'], ['scene', '🏞 场景'], ['prop', '🗡 道具']].map(([k, n]) => `<div class="model-opt ${k === kind ? 'sel' : ''}" data-nk="${k}">${n}</div>`).join('')}</div>
          </label>
          <label class="field"><span>名称 *</span><input class="input" data-f="name" placeholder="如:冷面掌柜"></label>
          <label class="field"><span>一句话描述(用于 AI 生图)</span><textarea class="input" rows="2" data-f="desc" placeholder="外形/服饰/气质关键词,如:四十岁后唐掌柜,深色长衫,八字胡,眼神精明"></textarea></label>
          <div class="check-line" data-x="withimg"><span class="switch on"></span><div><div>创建后立即 AI 生图</div><div class="hint" style="margin:0">生成权威参考图(-${COST.image} 积分);不勾选也可稍后在卡片上点「✨ AI 生图」</div></div></div>`,
          footer: `<button class="btn" data-x="cancel">取消</button><button class="btn primary" data-x="ok">创建主体</button>`,
          onMount(m, close) {
            let withImg = true;
            m.querySelectorAll('[data-nk]').forEach(o => o.onclick = () => { kind = o.dataset.nk; m.querySelectorAll('[data-nk]').forEach(x => x.classList.toggle('sel', x === o)); });
            const wi = m.querySelector('[data-x=withimg]');
            wi.onclick = () => { withImg = !withImg; wi.querySelector('.switch').classList.toggle('on', withImg); };
            m.querySelector('[data-x=cancel]').onclick = close;
            m.querySelector('[data-x=ok]').onclick = () => {
              const name = m.querySelector('[data-f=name]').value.trim();
              if (!name) return U.toast('请填写主体名称', 'error');
              if (p.subjects.some(x => x.name === name && x.kind === kind)) return U.toast('已存在同名同类型主体', 'error');
              const description = m.querySelector('[data-f=desc]').value.trim();
              const ns = { id: Store.uid('sj'), name, kind, description, image: '', prompt: description ? `${name},${description}` : '', forms: [], time: Store.now() };
              p.subjects.push(ns);
              Store.save(); close();
              U.toast(`主体「${name}」已创建`, 'success');
              if (withImg) genMainImage(p, ns, render); // 走与卡片「AI 生图」同一链路
              else render();
            };
          },
        });
      };
      /* ---- 卡片级/页级 AI 生图:补齐此前流程未跑完的主体图(写入权威参考 s.image) ---- */
      main.querySelectorAll('[data-genone]').forEach(b => b.onclick = () => {
        const s = p.subjects.find(x => x.id === b.dataset.genone);
        if (s) genMainImage(p, s, render);
      });
      const genAll = main.querySelector('[data-x=genall]');
      if (genAll) genAll.onclick = async () => {
        const todo = p.subjects.filter(s => !s.image);
        if (!todo.length) return;
        U.toast(`开始为 ${todo.length} 个缺图主体逐张生图…`, 'info', 2500);
        for (const s2 of todo) {
          if (Store.credits() < COST.image) { U.toast('余额不足,已停止;已生成的保留', 'error', 3500); break; }
          await genMainImage(p, s2); // 内部含任务登记/扣费/失败退费/打点
        }
        render();
      };
      /* ---- 卡片级音色绑定(角色):音色设置弹窗 / 音色参考音频 ---- */
      const bVoice = main.querySelector('[data-x=bvoice]');
      if (bVoice) bVoice.onclick = () => batchRecommendVoices(p, render);
      main.querySelectorAll('[data-voice]').forEach(b => b.onclick = () => {
        const s = p.subjects.find(x => x.id === b.dataset.voice);
        if (s) setVoice(p, s, render);
      });
      main.querySelectorAll('[data-refaudio]').forEach(b => b.onclick = () => {
        const s = p.subjects.find(x => x.id === b.dataset.refaudio);
        if (s) bindRefAudio(p, s, render);
      });
      /* ---- 点击预览图/姓名:打开主体编辑页(聚合精修/配音/定稿等模块;画板入口移至编辑页内) ---- */
      const openEdit = sid => window.RoleEditor.openSubjectEdit(p, sid, { onDone: render });
      main.querySelectorAll('[data-imgbox]').forEach(b => b.onclick = () => openEdit(b.dataset.imgbox));
      main.querySelectorAll('[data-sname]').forEach(b => b.onclick = () => openEdit(b.dataset.sname));
      /* 删除主体:统计引用镜头数供确认提示;分镜上的名字保留(用户可能重建同名主体),资产库副本独立不受影响 */
      main.querySelectorAll('[data-del]').forEach(b => b.onclick = () => {
        const s = p.subjects.find(x => x.id === b.dataset.del);
        if (!s) return;
        let refCnt = 0;
        p.episodes.forEach(e => (e.shots || []).forEach(sh => {
          if ((sh.characters || []).some(n => n === s.name || n.startsWith(s.name + '-')) || sh.scene === s.name || (sh.props || []).some(n => n === s.name || n.startsWith(s.name + '-'))) refCnt++;
        }));
        U.confirm(`删除主体「${s.name}」?${refCnt ? `全项目有 ${refCnt} 个分镜引用它,删除后这些引用将失去主体图联动;` : ''}资产库中已存的副本不受影响。`, () => {
          p.subjects = p.subjects.filter(x => x.id !== s.id);
          Store.save(); render();
          U.toast(`已删除主体「${s.name}」`, 'success');
        }, '🗑 删除');
      });
    }
    render();
  };

  /* 主体编辑页(精修/配音/设定/资产/定稿大弹窗)与场景画板已拆至 role-editor.js(window.RoleEditor)。
   * 共享操作经 window.RoleOps 桥接供其消费(加载顺序:本文件在前)。 */
  window.RoleOps = { KIND_NAME, formWord, VIEW_MODES, currentViewMode, viewImg, modePrompt, genMainImage, replaceMainImage, genModeImage, touchImage, setVoice, recommendVoice, bindRefAudio, openForms, toggleFinalize };
})();

