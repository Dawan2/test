/* ============ tools.js 百宝箱(便捷工具 + 项目实验台二级页) ============ */
(function () {
  window.Views = window.Views || {};

  const TOOLS = [
    { id: 'subtitle', ico: '🧹', name: '字幕去除', desc: '上传视频,支持对白字幕擦除和全局字幕擦除,完成后可直接下载。' },
    { id: 'edit', ico: '🎬', name: '视频编辑', desc: '上传原视频,输入编辑提示词(@参考图),模型重绘生成编辑结果(需开通视频编辑模型)。' },
    { id: 'upscale', ico: '🔍', name: '视频超清', desc: '上传需要超分的视频,支持多种分辨率提升选项。' },
    { id: 'keyframe', ico: '🎞', name: '关键帧提取', desc: '服务端使用 FFmpeg 按时间轴均匀抽帧,完成后可直接下载。' },
    { id: 'highlight', ico: '⚡', name: '高光智剪', desc: '接入视频素材,AI 自动识别高光片段生成爆款剪辑,支持开场钩子。' },
    { id: 'multiview', ico: '🎥', name: '多角度生成器', desc: '一张图生成不同拍摄视角:8 向水平环绕 × 4 档俯仰 × 3 档景别,6 个预设一键出图' },
    { id: 'fusion', ico: '🧬', name: '融合生成', desc: '资产库/本地多张图片融合成一张新图,可保存为资产主体(角色/场景/道具)。' },
    { id: 'comic', ico: '💬', name: '漫剧编辑器', desc: '为分镜图添加对白/旁白/内心独白气泡,AI 生成对白,导出 PNG。', route: '#/editor/comic' },
    { id: 'cutter', ico: '✂', name: '视频剪辑器', desc: '时间轴分割片段、删除冗余、导出剪辑清单。', route: '#/editor/cutter' },
    { id: 'ps', ico: '🎨', name: '画板(PS)', desc: '局部重绘涂抹蒙版 / 超清 enhance-image / 画面调整七项滑块。', route: '#/editor/ps' },
  ];

  Views.tools = function (main) {
    let mode = 'tools'; // tools=便捷工具 | lab=项目实验台(实验室规划中功能;AI策划/剧本译制已升级为功能专家)

    function renderLab() {
      return `
      <div class="card" style="padding:16px;margin-bottom:14px">
        <div class="row" style="gap:10px;align-items:center;flex-wrap:wrap">
          <b>🧪 项目实验台</b>
          <span class="small muted">「AI 策划」「剧本译制」已升级为功能专家 Agent:请到「偏好学习 → 专家雇佣」查看,或直接在「制片 → 智能体分工」对应板块雇佣调用。</span>
        </div>
      </div>
      <div class="grid proj-grid">${(window.EpisodeLab ? EpisodeLab.LAB : []).map(([name, desc]) => `
      <div class="card" style="padding:16px">
        <div class="row" style="justify-content:space-between;margin-bottom:8px">
          <b>${name}</b>
          <span class="tag yellow">规划中</span>
        </div>
        <div class="hint" style="margin:0;line-height:1.8">${desc}</div>
      </div>`).join('')}</div>`;
    }

    function render() {
      main.innerHTML = `
    <div class="page">
      <div class="page-head">
        <div>
          <div class="page-title">百宝箱</div>
          <div class="page-sub">字幕去除 · 视频编辑 · 视频超清 · 关键帧提取 · 高光智剪 · 多角度生成 · 融合生成 · 三个专业编辑器;「项目实验台」收纳实验室/AI策划/剧本译制</div>
        </div>
      </div>
      <div class="tabs" style="margin-bottom:14px">
        <div class="tab ${mode === 'tools' ? 'active' : ''}" data-mode="tools">🧰 便捷工具</div>
        <div class="tab ${mode === 'lab' ? 'active' : ''}" data-mode="lab">🧪 项目实验台</div>
      </div>
      ${mode === 'tools' ? `
      <div class="grid tool-grid">
        ${TOOLS.map(t => `
        <div class="card tool-card" data-tool="${t.id}" ${t.route ? `data-route="${t.route}"` : ''}>
          <div class="tool-ico">${t.ico}</div>
          <b>${t.name}</b>
          <div class="hint" style="margin-top:6px">${t.desc}</div>
        </div>`).join('')}
      </div>` : renderLab()}
    </div>`;
      main.querySelectorAll('[data-mode]').forEach(t => t.onclick = () => { mode = t.dataset.mode; render(); });
      main.querySelectorAll('[data-tool]').forEach(c => c.onclick = () => {
        if (c.dataset.route) { location.hash = c.dataset.route; return; }
        openTool(c.dataset.tool);
      });
    }

    render();
    // 从分镜卡片「智能超清/字幕擦除」跳入时自动打开对应工具并带入素材
    if (window.__toolPrefill) {
      const pf = window.__toolPrefill;
      window.__toolPrefill = null;
      U.toast('已带入分镜素材:' + pf.name, 'info');
      openTool(pf.tool, pf);
    }
  };

  /* ---- 上传/预填公共件(R12 收敛,原 4+2 份复制) ---- */
  /* FFmpeg 处理需视频在服务端:上传成功后 file.url 为 /uploads/ 路径(file.server=true);
   * 离线/上传失败时禁用运行钮(不再产出假结果) */
  function wireUpload(m, onFile) {
    m.querySelector('[data-x=up]').onclick = async () => {
      const f = await U.readAndUpload('video/*', { maxMB: 100 });
      if (!f) return;
      m.querySelector('[data-x=up]').textContent = '已选择:' + f.name;
      m.querySelector('[data-preview]').innerHTML = f.server
        ? `<div class="video-ph" style="max-width:320px;margin:10px auto"><video src="${f.url}" controls style="width:100%;border-radius:8px"></video></div>`
        : fakeVideoCard(f.name);
      m.querySelector('[data-x=run]').disabled = !f.server;
      if (!f.server) U.toast('视频未上传到服务端,FFmpeg 处理不可用(请先启动后端)', 'error', 3500);
      onFile && onFile(f);
    };
  }
  function applyPrefill(m, prefill) {
    if (!prefill) return null;
    m.querySelector('[data-x=up]').textContent = '已带入:' + prefill.name;
    const ok = !!(prefill.video && String(prefill.video).startsWith('/uploads/'));
    m.querySelector('[data-preview]').innerHTML = ok
      ? `<div class="video-ph" style="max-width:320px;margin:10px auto"><video src="${prefill.video}" controls style="width:100%;border-radius:8px"></video></div>`
      : `<div class="video-ph" style="max-width:320px;margin:10px auto"><img src="${prefill.image}"><div class="scan"></div></div>`;
    m.querySelector('[data-x=run]').disabled = !ok;
    if (!ok) U.toast('该分镜暂无服务端真实视频,无法处理(请先生成视频)', 'error', 3500);
    return { name: prefill.name, url: prefill.video, server: ok };
  }
  /* 处理完成的结果卡片:在线播放 + 下载 */
  function resultVideoCard(res, title, url, extra) {
    res.innerHTML = `
    <div class="card" style="margin-top:12px;padding:14px">
      <b>${title}</b>${extra || ''}
      <video src="${url}" controls style="width:100%;border-radius:8px;margin-top:10px"></video>
      <div class="row" style="margin-top:10px;justify-content:flex-end"><button class="btn sm primary" data-x="dlv">⬇ 下载视频</button></div>
    </div>`;
    res.querySelector('[data-x=dlv]').onclick = () => {
      U.downloadDataURL(title + '_' + Date.now() + '.mp4', url);
      U.toast('视频已开始下载', 'success');
    };
  }

  function openTool(id, prefill) {
    ({ subtitle, edit, upscale, keyframe, highlight, multiview: multiviewTool, fusion: fusionTool })[id](prefill);
  }

  /* ---- 高光智剪 ---- */
  function highlight() {
    let file = null;
    const hp = { min_duration: 30, max_duration: 180, max_number: 1, cut_mode: 'Mixed' };
    const hook = { enable: false, min_duration: 5, max_duration: 15, min_clip_duration: 5, min_score: 3 };
    U.openModal({
      title: '⚡ 高光智剪',
      wide: true,
      body: `
      <div class="dropzone" data-x="up">点击上传视频素材</div>
      <div data-preview></div>
      <div class="grid" style="grid-template-columns:1fr 1fr;gap:10px 18px;margin-top:12px">
        <label class="field"><span>高光片段最短时长(秒)</span><input class="input" type="number" data-h="min_duration" value="30"></label>
        <label class="field"><span>高光片段最长时长(秒)</span><input class="input" type="number" data-h="max_duration" value="180"></label>
        <label class="field"><span>最多生成几段</span><input class="input" type="number" data-h="max_number" value="1" min="1" max="5"></label>
        <label class="field"><span>剪辑模式</span>
          <div class="model-row">
            <div class="model-opt sel" data-cm="Mixed">混剪 Mixed</div>
            <div class="model-opt" data-cm="Single">单段 Single</div>
          </div>
        </label>
      </div>
      <div class="check-line" data-x="hook"><span class="switch"></span><div><div>开场钩子</div><div class="hint" style="margin:0">开启后片头保留第一段高光作为钩子(场景探测切分)</div></div></div>
      <div data-result></div>`,
      footer: `<button class="btn" data-x="cancel">取消</button><button class="btn primary" data-x="run" disabled>开始智剪(-${COST.highlight}积分)</button>`,
      onMount(m, close) {
        wireUpload(m, f => file = f);
        m.querySelectorAll('[data-h]').forEach(el => el.onchange = () => hp[el.dataset.h] = Math.max(1, +el.value || 1));
        m.querySelectorAll('[data-cm]').forEach(o => o.onclick = () => { hp.cut_mode = o.dataset.cm; m.querySelectorAll('[data-cm]').forEach(x => x.classList.toggle('sel', x === o)); });
        m.querySelector('[data-x=hook]').onclick = () => {
          hook.enable = !hook.enable;
          m.querySelector('[data-x=hook] .switch').classList.toggle('on', hook.enable);
        };
        m.querySelector('[data-x=cancel]').onclick = close;
        m.querySelector('[data-x=run]').onclick = () => {
          Tasks.run({ type: '高光智剪', model: 'FFmpeg 场景探测·' + hp.cut_mode, target: file.name, cost: COST.highlight, actionName: '高光智剪(' + file.name + ')' }, async (tk) => {
            m.querySelector('[data-x=run]').disabled = true;
            const res = m.querySelector('[data-result]');
            res.innerHTML = '<div class="hint" style="margin-top:10px"><span class="spinner"></span> FFmpeg 场景切换探测 + 高光段拼接中(长视频需数分钟)…</div>';
            let r;
            try {
              r = await Media.ffHighlight(file.url, { min_duration: hp.min_duration, max_duration: hp.max_duration, max_number: hp.max_number, cut_mode: hp.cut_mode }, 'ff.highlight', tk.id);
            } catch (e) {
              // 失败:恢复运行钮 + 清 spinner + 提示,抛错由 Tasks.run 统一退费
              m.querySelector('[data-x=run]').disabled = false;
              res.innerHTML = '';
              U.toast('失败,积分已自动返还:' + e.message, 'error', 4000);
              throw e;
            }
            const fmt = s => String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(Math.floor(s % 60)).padStart(2, '0');
            res.innerHTML = `
            <div class="card" style="margin-top:12px;padding:14px">
              <b>识别到 ${r.scenes} 个场景,截取 ${r.segments.length} 段高光</b>
              ${hook.enable ? `<div class="tag cyan" style="margin-left:8px">开场钩子 = 片头首段</div>` : ''}
              ${r.segments.map((sg, i) => `<div class="row" style="justify-content:space-between;margin-top:10px">
                <span>片段 ${i + 1} · <b style="color:var(--accent)">${fmt(sg.start)} - ${fmt(sg.start + sg.dur)}</b> · ${hp.cut_mode === 'Mixed' ? '混剪' : '单段'}</span>
                <span class="tag yellow">场景切换探测</span>
              </div>`).join('')}
              <video src="${r.url}" controls style="width:100%;border-radius:8px;margin-top:12px"></video>
              <div class="row" style="margin-top:12px;justify-content:flex-end"><button class="btn sm primary" data-x="dl">⬇ 下载高光视频</button></div>
            </div>`;
            res.querySelector('[data-x=dl]').onclick = () => {
              U.downloadDataURL('高光智剪_' + file.name, r.url);
              U.toast('高光视频已开始下载', 'success');
            };
            U.toast('高光智剪完成', 'success');
            return { filename: '高光智剪_' + file.name + '.mp4', dataURL: r.url };
          });
        };
      },
    });
  }

  function fakeVideoCard(name) {
    return `<div class="video-ph" style="max-width:320px;margin:10px auto">
      <img src="${PH.image({ label: name, sub: '已上传视频', kind: 'video', w: 480, h: 270, seedText: 'tool:' + name + Date.now() % 997 })}">
      <div class="scan"></div><div class="play">▶</div>
    </div>`;
  }

  /* ---- 字幕去除 ---- */
  function subtitle(prefill) {
    let file = null, mode = '对白字幕擦除';
    U.openModal({
      title: '🧹 字幕去除',
      body: `
      <div class="dropzone" data-x="up">点击上传需要去除字幕的视频</div>
      <div data-preview></div>
      <label class="field" style="margin-top:12px"><span>擦除模式</span>
        <div class="model-row">${['对白字幕擦除', '全局字幕擦除'].map((m, i) => `<div class="model-opt ${i === 0 ? 'sel' : ''}" data-m="${m}">${m}</div>`).join('')}</div>
      </label>`,
      footer: `<button class="btn" data-x="cancel">取消</button><button class="btn primary" data-x="run" disabled>开始处理(-${COST.erase}积分)</button>`,
      onMount(m, close) {
        file = applyPrefill(m, prefill) || file;
        wireUpload(m, f => file = f);
        m.querySelectorAll('[data-m]').forEach(o => o.onclick = () => { mode = o.dataset.m; m.querySelectorAll('[data-m]').forEach(x => x.classList.toggle('sel', x === o)); });
        m.querySelector('[data-x=cancel]').onclick = close;
        m.querySelector('[data-x=run]').onclick = () => {
          Tasks.run({ type: '字幕去除', model: 'FFmpeg delogo·' + mode, target: file.name, cost: COST.erase, actionName: '字幕去除(' + mode + ')' }, async (tk) => {
            close();
            U.toast('字幕擦除重建中(数十秒到数分钟)…', 'info', 3000);
            const r = await Media.ffSuberase(file.url, mode, 'ff.erase', tk.id); // 十一轮:suberase 路由统一 ff.erase(双入口价是客户端自选低价漏洞)
            U.openModal({
              title: '🧹 字幕去除完成',
              body: `<div data-result></div>`,
              footer: `<button class="btn" data-x="close">关闭</button>`,
              onMount(m2, close2) {
                resultVideoCard(m2.querySelector('[data-result]'), '去字幕_' + file.name, r.url, `<div class="hint" style="margin-top:4px">${mode} · FFmpeg delogo 区域修复</div>`);
                m2.querySelector('[data-x=close]').onclick = close2;
              },
            });
            return { filename: '去字幕_' + file.name + '.mp4', dataURL: r.url };
          });
        };
      },
    });
  }

  /* ---- 视频编辑(真实上游:原视频 + 编辑提示词 + 可选参考图 → 模型重绘) ---- */
  function edit() {
    let file = null, refImg = null, model = MODELS.video[0];
    U.openModal({
      title: '🎬 视频编辑',
      body: `
      <div class="dropzone" data-x="up">点击上传原视频(≤20MB)</div>
      <div data-preview></div>
      <label class="field" style="margin-top:12px"><span>编辑提示词(可用 @ 引用参考图)</span><textarea class="input" data-f="prompt" rows="2" placeholder="如:将人物替换为古风造型,背景换成雪山"></textarea></label>
      <div class="grid" style="grid-template-columns:1fr 1fr 1fr;gap:12px">
        <label class="field"><span>参考图(可选)</span><div class="dropzone" data-x="ref" style="padding:12px">上传参考图</div></label>
        <label class="field"><span>模型</span><select class="select" data-f="model">${MODELS.video.map(mo => `<option>${mo}</option>`).join('')}</select></label>
        <label class="field"><span>清晰度</span><select class="select" data-f="q"><option>720P</option><option selected>1080P</option><option>2K</option><option>4K</option></select></label>
      </div>
      <div class="hint">原视频与参考图将作为参考输入随提示词一起提交给视频模型,生成编辑后的新视频(数分钟)。注意:原视频会经临时公网托管(1 小时过期)中转给上游,介意素材出网请勿使用。</div>
      <div data-result></div>`,
      footer: `<button class="btn" data-x="cancel">取消</button><button class="btn primary" data-x="run" disabled>生成编辑结果(-${COST.video}积分)</button>`,
      onMount(m, close) {
        wireUpload(m, f => file = f); // 需上传到服务端(参考视频随请求透传上游)
        m.querySelector('[data-x=ref]').onclick = async () => {
          const f = await U.readAndUpload('image/*', { maxMB: 10 });
          if (f && f.server) { refImg = f.url; m.querySelector('[data-x=ref]').innerHTML = `<img src="${refImg}" style="max-height:40px;border-radius:5px">`; }
          else if (f) U.toast('参考图上传失败(需后端在线)', 'error');
        };
        m.querySelector('[data-x=cancel]').onclick = close;
        m.querySelector('[data-x=run]').onclick = () => {
          const prompt = m.querySelector('[data-f=prompt]').value.trim();
          if (!prompt) return U.toast('请输入编辑提示词', 'error');
          // 内容安全前置拦截:提示词命中敏感词直接中止(不扣费)
          if (window.Compliance && !Compliance.guardText(prompt)) return;
          model = m.querySelector('[data-f=model]').value;
          Tasks.run({ type: '视频编辑', model, target: file.name, cost: COST.video, actionName: '视频编辑' }, async (tk) => {
            const res = m.querySelector('[data-result]');
            const btn = m.querySelector('[data-x=run]');
            btn.disabled = true;
            res.innerHTML = '<div class="hint" style="margin-top:10px"><span class="spinner"></span> 视频编辑生成中(模型重绘,约数分钟)…</div>';
            try {
              const r = await Media.genVideo({
                prompt,
                refVideo: file.url,
                image: refImg || undefined,
                model: Media.realModel(model),
                duration: 5,
                billingAction: 'video.gen', operationId: tk.id,
              });
              res.innerHTML = '';
              resultVideoCard(res, '视频编辑_' + file.name, r.videoUrl, `<div class="hint" style="margin-top:4px">${U.esc(model)} · 提示词:${U.esc(prompt.slice(0, 30))}</div>`);
              U.toast('视频编辑完成', 'success');
              return { filename: '视频编辑_' + file.name + '.mp4', dataURL: r.videoUrl };
            } catch (e) {
              res.innerHTML = '';
              btn.disabled = false;
              // 九轮:超时(__pending)任务仍在后台生成不退费(Tasks.run 经 __noRefund 跳过镜像退费)
              U.toast(e.__pending ? e.message : '视频编辑失败,积分已自动返还:' + e.message, e.__pending ? 'info' : 'error', 4000);
              throw e; // 保持 Tasks.run 统一失败链
            }
          });
        };
      },
    });
  }

  /* ---- 视频超清 ---- */
  function upscale(prefill) {
    let file = null, res = '1080P';
    U.openModal({
      title: '🔍 视频超清',
      body: `
      <div class="dropzone" data-x="up">点击上传需要超分的视频</div>
      <div data-preview></div>
      <label class="field" style="margin-top:12px"><span>分辨率提升选项</span>
        <div class="model-row">${['720P', '1080P', '2K', '4K'].map(r => `<div class="model-opt ${r === '1080P' ? 'sel' : ''}" data-r="${r}">${r}</div>`).join('')}</div>
      </label>`,
      footer: `<button class="btn" data-x="cancel">取消</button><button class="btn primary" data-x="run" disabled>开始超分(-${COST.tool}积分)</button>`,
      onMount(m, close) {
        file = applyPrefill(m, prefill) || file;
        wireUpload(m, f => file = f);
        m.querySelectorAll('[data-r]').forEach(o => o.onclick = () => { res = o.dataset.r; m.querySelectorAll('[data-r]').forEach(x => x.classList.toggle('sel', x === o)); });
        m.querySelector('[data-x=cancel]').onclick = close;
        m.querySelector('[data-x=run]').onclick = () => {
          Tasks.run({ type: '视频超清', model: 'FFmpeg lanczos+unsharp·' + res, target: file.name, cost: COST.tool, actionName: '视频超清(' + res + ')' }, async (tk) => {
            close();
            U.toast('视频超分处理中(数十秒到数分钟)…', 'info', 3000);
            const r = await Media.ffUpscale(file.url, res, undefined, 'ff.upscaleTool', tk.id);
            U.openModal({
              title: '🔍 视频超清完成',
              body: `<div data-result></div>`,
              footer: `<button class="btn" data-x="close">关闭</button>`,
              onMount(m2, close2) {
                resultVideoCard(m2.querySelector('[data-result]'), '超清_' + res + '_' + file.name, r.url, `<div class="hint" style="margin-top:4px">lanczos 放大 + unsharp 锐化 · 目标 ${res}</div>`);
                m2.querySelector('[data-x=close]').onclick = close2;
              },
            });
            return { filename: '超清_' + res + '_' + file.name + '.mp4', dataURL: r.url };
          });
        };
      },
    });
  }

  /* ---- 关键帧提取 ---- */
  function keyframe() {
    let file = null;
    U.openModal({
      title: '🎞 关键帧提取',
      body: `
      <div class="hint" style="margin-bottom:10px">上传视频后,服务端使用 <b>FFmpeg</b> 按时间轴均匀抽取 6 帧,完成后可直接下载。</div>
      <div class="dropzone" data-x="up">点击上传视频</div>
      <div data-preview></div>
      <div data-result></div>`,
      footer: `<button class="btn" data-x="cancel">取消</button><button class="btn primary" data-x="run" disabled>开始提取(-${COST.tool}积分)</button>`,
      onMount(m, close) {
        wireUpload(m, f => file = f);
        m.querySelector('[data-x=cancel]').onclick = close;
        m.querySelector('[data-x=run]').onclick = () => {
          Tasks.run({ type: '关键帧提取', model: 'FFmpeg 均匀抽帧', target: file.name, cost: COST.tool, actionName: '关键帧提取(FFmpeg)' }, async (tk) => {
            m.querySelector('[data-x=run]').disabled = true;
            const res = m.querySelector('[data-result]');
            res.innerHTML = '<div class="hint" style="margin-top:10px"><span class="spinner"></span> FFmpeg 抽帧中…</div>';
            let r;
            try {
              r = await Media.ffFrames(file.url, 6, 'ff.frames', tk.id);
            } catch (e) {
              // 失败:恢复运行钮 + 清 spinner + 提示,抛错由 Tasks.run 统一退费
              m.querySelector('[data-x=run]').disabled = false;
              res.innerHTML = '';
              U.toast('失败,积分已自动返还:' + e.message, 'error', 4000);
              throw e;
            }
            res.innerHTML = `<div class="grid" style="grid-template-columns:repeat(3,1fr);gap:8px;margin-top:12px">
              ${r.frames.map((fr, i) => `<img src="${fr}" style="width:100%;border-radius:7px;cursor:pointer" data-kf="${i}" title="点击下载">`).join('')}</div>
              <div class="hint" style="margin-top:8px">视频时长 ${r.duration}s,共提取 ${r.frames.length} 帧,点击图片即可下载。</div>`;
            res.querySelectorAll('[data-kf]').forEach(im => im.onclick = () => {
              U.downloadDataURL(`关键帧_${+im.dataset.kf + 1}.jpg`, r.frames[+im.dataset.kf]);
              U.toast('关键帧已下载', 'success');
            });
            return { filename: '关键帧_1.jpg', dataURL: r.frames[0] };
          });
        };
      },
    });
  }

  /* ---- 多角度生成器(一张参考图 → 8 向水平 × 4 档俯仰 × 3 档景别换视角生图) ---- */
  // 三段视角参数枚举
  const MV_H = ['正面', '右前', '右侧', '右后', '背面', '左后', '左侧', '左前']; // 水平环绕 8 档
  const MV_V = ['平视', '俯视', '仰视', '贴地(虫眼)']; // 垂直俯仰 4 档
  const MV_S = ['中景', '近景', '远景']; // 景别 3 档(默认中景)
  // 6 个一键预设:h/v/s 为上面三段枚举的索引
  const MV_PRESETS = [
    { id: 'frontTop', name: '正面俯视', h: 0, v: 1, s: 0 },
    { id: 'frontLow', name: '正面仰视', h: 0, v: 2, s: 0 },
    { id: 'side',     name: '侧面视角', h: 2, v: 0, s: 0 },
    { id: 'backDiag', name: '背斜视角', h: 3, v: 1, s: 0 },
    { id: 'panoTop',  name: '全景俯视', h: 0, v: 1, s: 2 },
    { id: 'ground',   name: '极度贴地', h: 0, v: 3, s: 1 },
  ];
  /* 预设"成品图风格"示意缩略图:内联 SVG data URI(80×48,无外部依赖),
   * 每个预设一套渐变配色 + 简笔图形暗示视角(俯视=上方圆锥、侧面=半边轮廓等) */
  function mvThumb(presetId) {
    const T = {
      frontTop: { c1: '#7dd3fc', c2: '#6366f1', // 俯视:镜头圆锥从上方罩向主体
        shape: '<path d="M40 0 L20 40 L60 40 Z" fill="rgba(255,255,255,.35)"/><ellipse cx="40" cy="40" rx="10" ry="5" fill="rgba(0,0,0,.45)"/>' },
      frontLow: { c1: '#fda4af', c2: '#f97316', // 仰视:主体自底部高耸入画
        shape: '<path d="M40 48 L31 10 L49 10 Z" fill="rgba(255,255,255,.4)"/><circle cx="40" cy="8" r="4" fill="rgba(0,0,0,.4)"/>' },
      side: { c1: '#a7f3d0', c2: '#10b981', // 侧面:半边轮廓 + 单眼
        shape: '<path d="M40 5 C54 5 58 18 58 24 C58 33 52 43 40 43 Z" fill="rgba(255,255,255,.45)"/><circle cx="47" cy="20" r="2.5" fill="rgba(0,0,0,.5)"/>' },
      backDiag: { c1: '#c4b5fd', c2: '#8b5cf6', // 背斜:旋转的背影块 + 斜向视线
        shape: '<rect x="28" y="8" width="22" height="32" rx="5" fill="rgba(255,255,255,.4)" transform="rotate(14 40 24)"/><path d="M18 40 L62 12" stroke="rgba(0,0,0,.35)" stroke-width="2"/>' },
      panoTop: { c1: '#fde68a', c2: '#eab308', // 全景俯视:俯瞰地块网格
        shape: '<g fill="rgba(255,255,255,.4)"><rect x="8" y="8" width="18" height="12" rx="2"/><rect x="30" y="8" width="18" height="12" rx="2"/><rect x="52" y="8" width="18" height="12" rx="2"/><rect x="8" y="24" width="18" height="12" rx="2"/><rect x="30" y="24" width="18" height="12" rx="2"/><rect x="52" y="24" width="18" height="12" rx="2"/></g>' },
      ground: { c1: '#fdba74', c2: '#92400e', // 极度贴地:前景元素夸张放大,地平线压到极高
        shape: '<rect x="0" y="34" width="80" height="14" fill="rgba(0,0,0,.3)"/><path d="M10 48 L16 20 L22 48 Z" fill="rgba(255,255,255,.5)"/><path d="M30 48 L37 12 L44 48 Z" fill="rgba(255,255,255,.45)"/><path d="M56 48 L62 24 L68 48 Z" fill="rgba(255,255,255,.5)"/><circle cx="66" cy="10" r="5" fill="rgba(255,255,255,.6)"/>' },
    };
    const t = T[presetId] || T.frontTop;
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="80" height="48" viewBox="0 0 80 48"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${t.c1}"/><stop offset="1" stop-color="${t.c2}"/></linearGradient></defs><rect width="80" height="48" fill="url(#g)"/>${t.shape}</svg>`;
    return 'data:image/svg+xml,' + encodeURIComponent(svg);
  }

  function multiviewTool(prefill) {
    let file = null;                 // 参考图(需服务端路径才喂模型)
    let hIdx = 0, vIdx = 0, sIdx = 0; // 三段视角参数(默认:正面/平视/中景)
    let presetId = null;              // 当前命中的预设(仅用于高亮,手动改参数即取消)
    U.openModal({
      title: '🎥 多角度生成器',
      wide: true,
      body: `
      <div class="dropzone" data-x="up">点击上传参考图(≤10MB)</div>
      <div data-preview></div>
      <label class="field" style="margin-top:12px"><span>水平环绕(8 向)</span>
        <div class="model-row wrap">${MV_H.map((h, i) => `<div class="model-opt ${i === 0 ? 'sel' : ''}" data-h="${i}">${h}</div>`).join('')}</div>
      </label>
      <label class="field"><span>垂直俯仰(4 档)</span>
        <div class="model-row">${MV_V.map((v, i) => `<div class="model-opt ${i === 0 ? 'sel' : ''}" data-v="${i}">${v}</div>`).join('')}</div>
      </label>
      <label class="field"><span>景别(3 档)</span>
        <div class="model-row">${MV_S.map((s, i) => `<div class="model-opt ${i === 0 ? 'sel' : ''}" data-s="${i}">${s}</div>`).join('')}</div>
      </label>
      <label class="field"><span>视角预设(一键加载)</span>
        <div class="grid" style="grid-template-columns:repeat(3,1fr);gap:8px">
          ${MV_PRESETS.map(p => `
          <div data-preset="${p.id}" style="cursor:pointer;text-align:center;padding:6px;border-radius:9px;border:1.5px solid var(--border)">
            <img src="${mvThumb(p.id)}" style="width:80px;height:48px;border-radius:6px;display:block;margin:0 auto 4px">
            <div class="small">${p.name}</div>
          </div>`).join('')}
        </div>
      </label>
      <label class="field"><span>额外提示词(可选,叠加强化视角效果)</span>
        <input class="input" data-f="extra" placeholder="极度贴地镜头,虫眼视角,前景元素夸张放大变形">
      </label>
      <div data-result></div>`,
      footer: `<button class="btn" data-x="cancel">取消</button><button class="btn primary" data-x="run" disabled>生成视角图(-${COST.multiView}积分)</button>`,
      onMount(m, close) {
        // 上传参考图:参考图必须传到服务端(参考图随请求透传上游模型)
        m.querySelector('[data-x=up]').onclick = async () => {
          const f = await U.readAndUpload('image/*', { maxMB: 10 });
          if (!f) return;
          m.querySelector('[data-x=up]').textContent = '已选择:' + f.name;
          m.querySelector('[data-preview]').innerHTML = `<div class="video-ph" style="max-width:320px;margin:10px auto"><img src="${f.url}"></div>`;
          if (f.server) { file = f; m.querySelector('[data-x=run]').disabled = false; }
          else U.toast('参考图上传失败(需后端在线)', 'error', 3000);
        };
        // 分镜等外部预填:图片需为服务端路径(/uploads/ 或远程 url)才可用
        if (prefill && prefill.image) {
          const ok = String(prefill.image).startsWith('/uploads/') || /^https?:\/\//.test(prefill.image);
          m.querySelector('[data-x=up]').textContent = '已带入:' + prefill.name;
          m.querySelector('[data-preview]').innerHTML = `<div class="video-ph" style="max-width:320px;margin:10px auto"><img src="${prefill.image}"></div>`;
          if (ok) { file = { name: prefill.name, url: prefill.image, server: true }; m.querySelector('[data-x=run]').disabled = false; }
          else U.toast('带入的图片不是服务端路径,无法作为参考图(请重新上传)', 'error', 3500);
        }
        // 三段选择条 + 预设高亮联动
        function sync() {
          m.querySelectorAll('[data-h]').forEach(o => o.classList.toggle('sel', +o.dataset.h === hIdx));
          m.querySelectorAll('[data-v]').forEach(o => o.classList.toggle('sel', +o.dataset.v === vIdx));
          m.querySelectorAll('[data-s]').forEach(o => o.classList.toggle('sel', +o.dataset.s === sIdx));
          m.querySelectorAll('[data-preset]').forEach(c => {
            const on = c.dataset.preset === presetId;
            c.style.borderColor = on ? 'var(--accent)' : 'var(--border)';
            c.style.boxShadow = on ? '0 0 0 2px rgba(34,211,238,.25)' : 'none';
          });
        }
        m.querySelectorAll('[data-h]').forEach(o => o.onclick = () => { hIdx = +o.dataset.h; presetId = null; sync(); });
        m.querySelectorAll('[data-v]').forEach(o => o.onclick = () => { vIdx = +o.dataset.v; presetId = null; sync(); });
        m.querySelectorAll('[data-s]').forEach(o => o.onclick = () => { sIdx = +o.dataset.s; presetId = null; sync(); });
        m.querySelectorAll('[data-preset]').forEach(c => c.onclick = () => {
          const p = MV_PRESETS.find(x => x.id === c.dataset.preset);
          hIdx = p.h; vIdx = p.v; sIdx = p.s; presetId = p.id; // 一键设置三段参数并高亮
          sync();
        });
        // 结果区:生成图 + 下载 + 再来一张(不清参数重新生成)
        function showResult(url) {
          const label = MV_H[hIdx] + MV_V[vIdx] + '·' + MV_S[sIdx];
          const res = m.querySelector('[data-result]');
          res.innerHTML = `
          <div class="card" style="margin-top:12px;padding:14px">
            <b>生成结果</b><span class="tag cyan" style="margin-left:8px">${label}</span>
            <img src="${url}" style="width:100%;border-radius:8px;margin-top:10px">
            <div class="row" style="margin-top:10px;justify-content:flex-end;gap:8px">
              <button class="btn sm" data-x="again">🔁 再来一张</button>
              <button class="btn sm primary" data-x="dl">⬇ 下载</button>
            </div>
          </div>`;
          res.querySelector('[data-x=dl]').onclick = () => {
            U.downloadDataURL('多角度_' + label + '_' + Date.now() + '.png', url);
            U.toast('图片已开始下载', 'success');
          };
          res.querySelector('[data-x=again]').onclick = () => gen();
        }
        function gen() {
          if (!window.Media || !Media.isReady()) return U.toast('需要后端在线与生图配置(请先登录后端)', 'error', 3200);
          const extra = m.querySelector('[data-f=extra]').value.trim();
          const prompt = `将参考图画面转换为${MV_H[hIdx]}${MV_V[vIdx]}视角、${MV_S[sIdx]}构图拍摄,保持主体形象、场景与画风一致${extra ? ',' + extra : ''}`;
          // 内容安全前置拦截:补充描述命中敏感词直接中止(不扣费)
          if (window.Compliance && !Compliance.guardText(prompt)) return;
          Tasks.run({ type: '多角度', model: MODELS.image[0], target: file.name, cost: COST.multiView, actionName: '多角度生成' }, async (tk) => {
            const btn = m.querySelector('[data-x=run]');
            const res = m.querySelector('[data-result]');
            btn.disabled = true;
            res.innerHTML = '<div class="hint" style="margin-top:10px"><span class="spinner"></span> 多角度生成中(按参考图重绘新视角)…</div>';
            try {
              const r = await Media.genImage({ prompt, size: '1280x720', model: Media.realModel(MODELS.image[0]), image: file.url, billingAction: 'image.multiView', operationId: tk.id });
              showResult(r.url);
              U.toast('多角度生成完成', 'success');
              return { filename: '多角度_' + MV_H[hIdx] + MV_V[vIdx] + '.png', dataURL: r.url };
            } catch (e) {
              // 失败:保留参数与素材、恢复按钮可重试,抛错由 Tasks.run 统一退费
              res.innerHTML = '';
              U.toast('多角度生成失败,积分已自动返还:' + e.message, 'error', 4000);
              throw e;
            } finally {
              btn.disabled = !file;
            }
          });
        }
        m.querySelector('[data-x=cancel]').onclick = close;
        m.querySelector('[data-x=run]').onclick = () => {
          if (!file) return U.toast('请先上传参考图', 'error');
          gen();
        };
      },
    });
  }

  /* ---- 融合生成(资产库/本地多张图片融合成新图 → 可保存为资产主体) ---- */
  function fusionTool() {
    const MAX = 6;                 // 参考图上限(与服务端 /api/volc/image 数组上限一致)
    let imgs = [];                 // {name,url}:/uploads/ 路径、远程 url 或 dataURL 均可透传上游
    let model = MODELS.image[0], size = '1024x1024', lastPrompt = '';
    U.openModal({
      title: '🧬 融合生成',
      wide: true,
      body: `
      <div class="row" style="gap:8px;flex-wrap:wrap">
        <button class="btn sm" data-x="up">⬆ 本地上传</button>
        <button class="btn sm" data-x="lib">🗂 从资产库选择</button>
        <span class="hint" style="margin:0;align-self:center">已选 <b data-x="cnt">0</b>/${MAX} 张(至少 2 张)</span>
      </div>
      <div class="row wrap" data-x="imgs" style="gap:10px;margin-top:10px"></div>
      <label class="field" style="margin-top:12px"><span>融合提示词</span>
        <textarea class="input" rows="2" data-f="prompt" placeholder="描述想要的融合效果,如:把图1的角色放进图2的场景,统一为图3的画风"></textarea>
      </label>
      <div class="grid" style="grid-template-columns:1fr 1fr;gap:10px 18px">
        <label class="field"><span>生图模型</span>
          <div class="model-row wrap">${MODELS.image.map((lb, i) => `<div class="model-opt ${i === 0 ? 'sel' : ''}" data-m="${i}">${U.esc(lb.split(',')[1] || lb)}</div>`).join('')}</div>
        </label>
        <label class="field"><span>画面比例</span>
          <div class="model-row">${[['1024x1024', '1:1'], ['1280x720', '16:9'], ['720x1280', '9:16']].map(([v, n], i) => `<div class="model-opt ${i === 0 ? 'sel' : ''}" data-sz="${v}">${n}</div>`).join('')}</div>
        </label>
      </div>
      <div data-result></div>`,
      footer: `<button class="btn" data-x="cancel">取消</button><button class="btn primary" data-x="run" disabled>开始融合(-${COST.fusion}积分)</button>`,
      onMount(m, close) {
        const runBtn = m.querySelector('[data-x=run]');
        function renderImgs() {
          m.querySelector('[data-x=cnt]').textContent = imgs.length;
          m.querySelector('[data-x=imgs]').innerHTML = imgs.map((f, i) => `
          <div style="position:relative;width:88px;text-align:center">
            <img src="${f.url}" style="width:88px;height:88px;object-fit:cover;border-radius:8px;display:block">
            <span class="tag cyan" style="position:absolute;left:4px;top:4px">图${i + 1}</span>
            <button data-rm="${i}" title="移除" style="position:absolute;right:2px;top:2px;width:20px;height:20px;border:none;border-radius:50%;background:rgba(0,0,0,.55);color:#fff;cursor:pointer;line-height:1">✕</button>
            <div class="small muted" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${U.esc(f.name)}</div>
          </div>`).join('');
          m.querySelectorAll('[data-rm]').forEach(b => b.onclick = () => { imgs.splice(+b.dataset.rm, 1); renderImgs(); });
          runBtn.disabled = imgs.length < 2;
        }
        function addImg(f) {
          if (imgs.length >= MAX) return U.toast('最多 ' + MAX + ' 张参考图', 'info');
          imgs.push(f); renderImgs();
        }
        m.querySelector('[data-x=up]').onclick = async () => {
          const f = await U.readAndUpload('image/*', { maxMB: 10 });
          if (!f) return;
          if (!f.server) return U.toast('参考图上传失败(需后端在线)', 'error', 3000);
          addImg({ name: f.name, url: f.url });
        };
        // 资产库多选弹窗:点卡片切换选中,确认后按序加入参考图列表
        m.querySelector('[data-x=lib]').onclick = () => {
          const list = (Store.state.assets.subjects || []).filter(a => a.image);
          if (!list.length) return U.toast('资产库中还没有图片', 'info');
          const picked = new Set();
          U.openModal({
            title: '从资产库选择(可多选)', wide: true,
            body: `<div class="grid" style="grid-template-columns:repeat(auto-fill,minmax(140px,1fr))">
              ${list.map((a, i) => `
              <div class="card" data-i="${i}" style="cursor:pointer;padding:8px">
                <img src="${a.image}" style="width:100%;height:90px;object-fit:cover;border-radius:6px;display:block">
                <div class="small" style="margin-top:6px">${U.esc(a.name || '未命名')}</div>
                ${a.kind ? `<span class="tag cyan" style="margin-top:4px">${U.esc(a.kind)}</span>` : ''}
              </div>`).join('')}
            </div>`,
            footer: `<button class="btn" data-x="cancel">取消</button><button class="btn primary" data-x="ok" disabled>加入所选(0)</button>`,
            onMount(m2, close2) {
              const okBtn = m2.querySelector('[data-x=ok]');
              m2.querySelectorAll('[data-i]').forEach(el => el.onclick = () => {
                const i = +el.dataset.i;
                picked.has(i) ? picked.delete(i) : picked.add(i);
                el.style.outline = picked.has(i) ? '2px solid var(--accent)' : 'none';
                okBtn.disabled = !picked.size;
                okBtn.textContent = `加入所选(${picked.size})`;
              });
              m2.querySelector('[data-x=cancel]').onclick = close2;
              okBtn.onclick = () => {
                [...picked].sort((a, b) => a - b).forEach(i => addImg({ name: list[i].name || '资产图', url: list[i].image }));
                close2();
              };
            },
          });
        };
        m.querySelectorAll('[data-m]').forEach(o => o.onclick = () => { model = MODELS.image[+o.dataset.m]; m.querySelectorAll('[data-m]').forEach(x => x.classList.toggle('sel', x === o)); });
        m.querySelectorAll('[data-sz]').forEach(o => o.onclick = () => { size = o.dataset.sz; m.querySelectorAll('[data-sz]').forEach(x => x.classList.toggle('sel', x === o)); });
        // 融合结果保存为资产主体(名称/类型/标签/分组),入库即报白(与 saveSubjectToAssets 同规)
        function saveSubject(url) {
          const groups = Store.myGroups();
          U.openModal({
            title: '保存为资产主体',
            body: `
            <label class="field"><span>主体名称</span><input class="input" data-f="name" placeholder="如:古风男主·战损版"></label>
            <label class="field"><span>主体类型</span>
              <div class="model-row">${[['character', '角色'], ['scene', '场景'], ['prop', '道具']].map(([v, n], i) => `<div class="model-opt ${i === 0 ? 'sel' : ''}" data-kind="${v}">${n}</div>`).join('')}</div>
            </label>
            <label class="field"><span>选择标签</span>
              <div class="model-row wrap">${['主角', '配角', '反派', '核心场景', '关键道具'].map((t, i) => `<div class="model-opt ${i === 0 ? 'sel' : ''}" data-tag="${t}">${t}</div>`).join('')}</div>
            </label>
            <label class="field"><span>选择分组</span>
              <select class="select" data-f="group">
                <option value="">未分组</option>
                ${groups.map(g => `<option value="${g.id}">${U.esc(g.name)}</option>`).join('')}
              </select>
            </label>`,
            footer: `<button class="btn" data-x="cancel">取消</button><button class="btn primary" data-x="ok">保存主体</button>`,
            onMount(m2, close2) {
              let kind = 'character', tag = '主角';
              m2.querySelectorAll('[data-kind]').forEach(o => o.onclick = () => { kind = o.dataset.kind; m2.querySelectorAll('[data-kind]').forEach(x => x.classList.toggle('sel', x === o)); });
              m2.querySelectorAll('[data-tag]').forEach(o => o.onclick = () => { tag = o.dataset.tag; m2.querySelectorAll('[data-tag]').forEach(x => x.classList.toggle('sel', x === o)); });
              m2.querySelector('[data-x=cancel]').onclick = close2;
              m2.querySelector('[data-x=ok]').onclick = () => {
                const name = m2.querySelector('[data-f=name]').value.trim();
                if (!name) return U.toast('请填写主体名称', 'error');
                const u = Store.currentUser();
                const item = {
                  id: Store.uid('as'), userId: u.id, kind, name,
                  image: url, prompt: lastPrompt, tags: [tag], forms: [],
                  groupId: m2.querySelector('[data-f=group]').value || null,
                  fromProject: '融合生成', time: Store.now(),
                };
                Store.state.assets.subjects.push(item);
                Store.save(); close2();
                U.toast(`「${name}」已保存到资产库,已自动提交报白审核`, 'success');
                if (window.HumanReview) HumanReview.submitAsset(item);
              };
            },
          });
        }
        function showResult(url) {
          const res = m.querySelector('[data-result]');
          res.innerHTML = `
          <div class="card" style="margin-top:12px;padding:14px">
            <b>融合结果</b><span class="tag cyan" style="margin-left:8px">${imgs.length} 图融合</span>
            <img src="${url}" style="width:100%;border-radius:8px;margin-top:10px">
            <div class="row" style="margin-top:10px;justify-content:flex-end;gap:8px">
              <button class="btn sm" data-x="again">🔁 再来一张</button>
              <button class="btn sm" data-x="dl">⬇ 下载</button>
              <button class="btn sm primary" data-x="save">💾 保存为主体</button>
            </div>
          </div>`;
          res.querySelector('[data-x=dl]').onclick = () => {
            U.downloadDataURL('融合生成_' + Date.now() + '.png', url);
            U.toast('图片已开始下载', 'success');
          };
          res.querySelector('[data-x=again]').onclick = () => gen();
          res.querySelector('[data-x=save]').onclick = () => saveSubject(url);
        }
        function gen() {
          if (!window.Media || !Media.isReady()) return U.toast('需要后端在线与生图配置(请先登录后端)', 'error', 3200);
          const userPrompt = m.querySelector('[data-f=prompt]').value.trim();
          if (!userPrompt) return U.toast('请填写融合提示词', 'error');
          lastPrompt = `将 ${imgs.length} 张参考图融合生成一张新图:${userPrompt};保持各参考图主体的形象与特征一致,画面自然统一`;
          // 内容安全前置拦截:命中敏感词直接中止(不扣费)
          if (window.Compliance && !Compliance.guardText(lastPrompt)) return;
          Tasks.run({ type: '融合生成', model, target: imgs.map(f => f.name).join('+'), cost: COST.fusion, actionName: '融合生成(' + imgs.length + '图)' }, async (tk) => {
            const res = m.querySelector('[data-result]');
            runBtn.disabled = true;
            res.innerHTML = '<div class="hint" style="margin-top:10px"><span class="spinner"></span> 多图融合生成中(按参考图融合重绘,约 1 分钟)…</div>';
            try {
              const r = await Media.genImage({ prompt: lastPrompt, size, model: Media.realModel(model), image: imgs.map(f => f.url), billingAction: 'image.fusion', operationId: tk.id });
              showResult(r.url);
              U.toast('融合生成完成', 'success');
              return { filename: '融合生成_' + Date.now() + '.png', dataURL: r.url };
            } catch (e) {
              // 失败:保留参数与素材、恢复按钮可重试,抛错由 Tasks.run 统一退费
              res.innerHTML = '';
              U.toast('融合生成失败,积分已自动返还:' + e.message, 'error', 4000);
              throw e;
            } finally {
              runBtn.disabled = imgs.length < 2;
            }
          });
        }
        m.querySelector('[data-x=cancel]').onclick = close;
        runBtn.onclick = () => {
          if (imgs.length < 2) return U.toast('融合生成至少需要 2 张参考图', 'error');
          gen();
        };
      },
    });
  }

})();
