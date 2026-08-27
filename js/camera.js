/* ============ camera.js 机位/摄影专业参数体系 ============
 * 本模块只管几何与器材(方位角/仰角几何、机身/镜头/焦距/光圈、多机位渠道):
 * 景别/运镜/视角/角度四张词表的单一来源在 js/wf-core.js(双端共享),此处一律派生,不另存一份。 */
(function () {
  const CAM = {};

  /* ---- 机位预设:视角·角度·景别(9 个) ---- */
  CAM.PRESETS = [
    { id: 'front-eye-close', name: '正面·平视·特写', azimuth: 0, elevation: 0, distance: 0.6 },
    { id: 'front-eye-medium', name: '正面·平视·中景', azimuth: 0, elevation: 0, distance: 1 },
    { id: 'front-eye-wide', name: '正面·平视·全景', azimuth: 0, elevation: 0, distance: 1.4 },
    { id: 'front-high-wide', name: '正面·俯拍·全景', azimuth: 0, elevation: 30, distance: 1.4 },
    { id: 'side-eye-close', name: '侧面·平视·特写', azimuth: 90, elevation: 0, distance: 0.6 },
    { id: 'side-eye-medium', name: '侧面·平视·中景', azimuth: 90, elevation: 0, distance: 1 },
    { id: 'side-eye-wide', name: '侧面·平视·全景', azimuth: 90, elevation: 0, distance: 1.4 },
    { id: 'back-eye-medium', name: '背面·平视·中景', azimuth: 180, elevation: 0, distance: 1 },
    { id: 'back-high-wide', name: '背面·俯拍·全景', azimuth: 180, elevation: 30, distance: 1.4 },
  ];

  /* ---- 八方向方位角(箭头图标) ---- */
  CAM.DIRECTIONS = [
    { name: '正面', deg: 0, arrow: '↑', en: 'front view' },
    { name: '右前', deg: 45, arrow: '↗', en: 'front-right quarter view' },
    { name: '右侧', deg: 90, arrow: '→', en: 'right side view' },
    { name: '右后', deg: 135, arrow: '↘', en: 'back-right quarter view' },
    { name: '背面', deg: 180, arrow: '↓', en: 'back view' },
    { name: '左后', deg: 225, arrow: '↙', en: 'back-left quarter view' },
    { name: '左侧', deg: 270, arrow: '←', en: 'left side view' },
    { name: '左前', deg: 315, arrow: '↖', en: 'front-left quarter view' },
  ];

  /* ---- 仰角档 / 景别档(词表单一来源在 wf-core.js,本处只是浏览器侧派生出口) ---- */
  CAM.ELEVATIONS = WfCore.CAMERA_ANGLES;
  CAM.SHOT_SIZES = WfCore.SHOT_SIZES;

  /* ---- 摄像机机身 / 镜头 / 焦距 / 光圈 ---- */
  CAM.BODIES = ['Arri Alexa 35', 'Arri Alexa 65', 'Arricam LT', 'ArriFlex 435', 'IMAX Film Camera', 'IMAX Keighley', 'Panavision DXL2', 'Red V-Raptor', 'Sony Venice'];
  CAM.LENSES = ['Canon K-35', 'Cooke Panchro', 'Cooke S4', 'Zeiss Ultra Prime', 'Arri Signature Prime', 'Helios', 'Panavision C-series', 'Panavision Primo', 'Hawk Class X'];
  CAM.FOCALS = [8, 14, 24, 35, 50, 75, 125]; // mm, 默认 35
  CAM.APERTURES = ['ƒ/1.4', 'ƒ/2', 'ƒ/2.8', 'ƒ/4', 'ƒ/5.6', 'ƒ/8', 'ƒ/11']; // 默认 ƒ/4

  /* ---- 多机位渠道(真实定价:渠道一 2K 高精,渠道二标清;均为 seedream 出图) ---- */
  CAM.CHANNELS = [
    { id: 'ch1', label: '渠道一 · 2K 高精(21 积分)', cost: 21, model: 'Volcengine,Seedream 5.0 Pro(2K),doubao-seedream-5-0-pro-260628', hiRes: true },
    { id: 'ch2', label: '渠道二 · 标清(11 积分)', cost: 11, model: 'Volcengine,Seedream 5.0 Pro(标清),doubao-seedream-5-0-pro-260628', hiRes: false },
  ];

  /* ---- 拼装英文摄影提示词:Shot on X with Y lens, 35mm, f/4 ---- */
  CAM.buildSpec = function (spec) {
    return `Shot on ${spec.body || CAM.BODIES[0]} with ${spec.lens || CAM.LENSES[0]} lens, ${spec.focal || 35}mm, ${String(spec.aperture || 'ƒ/4').replace('ƒ', 'f')}`;
  };

  /* ---- 中文机位描述(写进分镜提示词;单一实现在 domain.js,双端同口径) ---- */
  CAM.describe = function (cs) {
    return Domain.cameraDescribe(cs);
  };

  /* ---- 机位选择器弹窗(视角×角度×景别 + 光圈 + 运镜) ----
     opt: {value: 现有 cameraSpec, camera: 当前运镜, onSave(spec, cameraMove)};
     四栏取值全部来自 wf-core.js 词表,onSave 回传的运镜是 WfCore.CAMERAS 内的规范名(可直接写回 s.camera) */
  CAM.openSpecPicker = function (opt) {
    const cs = Object.assign({ view: '正面', angle: '平视', shotSize: '中景', aperture: 'ƒ/4' }, opt.value || {});
    let move = opt.camera || '固定镜头';
    const VIEWS = WfCore.VIEWS;
    const ANGLES = WfCore.ANGLES;
    const SIZES = WfCore.SIZES;
    // 运镜芯片取词表内的镜头运动项,芯片值即 s.camera 的规范名(俯拍/仰拍/特写 由角度、景别两栏承担,不重复出芯片)
    const MOVES = WfCore.CAMERA_MOVES.filter(m => m.axis === 'move');
    U.openModal({
      title: '🎥 机位设置(视角 × 角度 × 景别)',
      body: `
      <label class="field"><span>机位预设(9 宫格)</span>
        <div class="model-row">${CAM.PRESETS.map(pr => `<div class="model-opt" data-preset="${pr.id}">${pr.name}</div>`).join('')}</div>
      </label>
      <div class="grid" style="grid-template-columns:1fr 1fr 1fr;gap:8px 14px">
        <label class="field"><span>视角</span><div class="model-row">${VIEWS.map(v => `<div class="model-opt ${cs.view === v ? 'sel' : ''}" data-g="view" data-v="${v}">${v}</div>`).join('')}</div></label>
        <label class="field"><span>角度</span><div class="model-row">${ANGLES.map(v => `<div class="model-opt ${cs.angle === v ? 'sel' : ''}" data-g="angle" data-v="${v}">${v}</div>`).join('')}</div></label>
        <label class="field"><span>景别</span><div class="model-row">${SIZES.map(v => `<div class="model-opt ${cs.shotSize === v ? 'sel' : ''}" data-g="shotSize" data-v="${v}">${v}</div>`).join('')}</div></label>
      </div>
      <div class="grid" style="grid-template-columns:1fr 1fr;gap:8px 14px">
        <label class="field"><span>光圈</span>
          <div class="model-row">${CAM.APERTURES.map(a => `<div class="model-opt ${cs.aperture === a ? 'sel' : ''}" data-g="aperture" data-v="${a}">${a}</div>`).join('')}</div>
        </label>
        <label class="field"><span>运镜</span>
          <div class="model-row">${MOVES.map(mv => `<div class="model-opt ${mv.name === move ? 'sel' : ''}" data-move="${mv.name}">${mv.arrow} ${mv.short}</div>`).join('')}</div>
        </label>
      </div>`,
      footer: `<button class="btn" data-x="cancel">取消</button><button class="btn primary" data-x="ok">应用机位</button>`,
      onMount(m, close) {
        m.querySelectorAll('[data-preset]').forEach(o => o.onclick = () => {
          const pr = CAM.PRESETS.find(x => x.id === o.dataset.preset);
          const [view, angle, shotSize] = pr.name.split('·');
          cs.view = view; cs.angle = angle; cs.shotSize = shotSize;
          m.querySelectorAll('[data-g]').forEach(x => x.classList.toggle('sel', x.dataset.v === cs[x.dataset.g]));
          m.querySelectorAll('[data-preset]').forEach(x => x.classList.toggle('sel', x === o));
        });
        m.querySelectorAll('[data-g]').forEach(o => o.onclick = () => {
          cs[o.dataset.g] = o.dataset.v;
          m.querySelectorAll(`[data-g="${o.dataset.g}"]`).forEach(x => x.classList.toggle('sel', x === o));
        });
        m.querySelectorAll('[data-move]').forEach(o => o.onclick = () => {
          move = o.dataset.move;
          m.querySelectorAll('[data-move]').forEach(x => x.classList.toggle('sel', x === o));
        });
        m.querySelector('[data-x=cancel]').onclick = close;
        m.querySelector('[data-x=ok]').onclick = () => { close(); opt.onSave(cs, move); };
      },
    });
  };

  /* ---- 摄像机配置面板 HTML(机身/镜头/焦距/光圈),返回 {html, bind(el, state)} ---- */
  CAM.configPanel = function (state) {
    const html = `
    <div class="grid" style="grid-template-columns:1fr 1fr;gap:8px 14px" data-camcfg>
      <label class="field"><span>机身</span><select class="select small" data-cc="body">${CAM.BODIES.map(b => `<option ${state.body === b ? 'selected' : ''}>${b}</option>`).join('')}</select></label>
      <label class="field"><span>镜头</span><select class="select small" data-cc="lens">${CAM.LENSES.map(l => `<option ${state.lens === l ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
      <label class="field"><span>焦距</span><div class="model-row">${CAM.FOCALS.map(f => `<div class="model-opt ${state.focal === f ? 'sel' : ''}" data-cc-opt="focal" data-v="${f}">${f}mm</div>`).join('')}</div></label>
      <label class="field"><span>光圈</span><div class="model-row">${CAM.APERTURES.map(a => `<div class="model-opt ${state.aperture === a ? 'sel' : ''}" data-cc-opt="aperture" data-v="${a}">${a}</div>`).join('')}</div></label>
    </div>`;
    return {
      html,
      bind(el) {
        el.querySelectorAll('[data-cc]').forEach(sel => sel.onchange = () => state[sel.dataset.cc] = sel.value);
        el.querySelectorAll('[data-cc-opt]').forEach(o => o.onclick = () => {
          state[o.dataset.ccOpt] = o.dataset.ccOpt === 'focal' ? +o.dataset.v : o.dataset.v;
          el.querySelectorAll(`[data-cc-opt="${o.dataset.ccOpt}"]`).forEach(x => x.classList.toggle('sel', x === o));
        });
      },
    };
  };

  window.CAMERA = CAM;
})();
