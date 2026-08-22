/* ============ camera.js 机位/摄影专业参数体系 ============ */
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

  /* ---- 仰角档 / 景别档 ---- */
  CAM.ELEVATIONS = [
    { name: '仰拍', deg: -30, en: 'low-angle shot' },
    { name: '平视', deg: 0, en: 'eye-level shot' },
    { name: '俯拍', deg: 30, en: 'elevated shot' },
    { name: '高角度', deg: 60, en: 'high-angle shot' },
  ];
  CAM.SHOT_SIZES = [
    { name: '特写', dist: 0.6, en: 'close-up' },
    { name: '近景', dist: 0.8, en: 'medium close-up' },
    { name: '中景', dist: 1, en: 'medium shot' },
    { name: '全景', dist: 1.4, en: 'wide shot' },
  ];

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

  /* ---- 中文机位描述(写进分镜提示词) ---- */
  CAM.describe = function (cs) {
    if (!cs) return '';
    const parts = [];
    if (cs.view) parts.push(cs.view + '视角');
    if (cs.angle) parts.push(cs.angle);
    if (cs.shotSize) parts.push(cs.shotSize);
    return parts.join('·');
  };

  /* ---- 机位选择器弹窗(视角×角度×景别 + 光圈 + 运镜八方向) ----
     opt: {value: 现有 cameraSpec, camera: 当前运镜, onSave(spec, cameraMove)} */
  CAM.openSpecPicker = function (opt) {
    const cs = Object.assign({ view: '正面', angle: '平视', shotSize: '中景', aperture: 'ƒ/4' }, opt.value || {});
    let move = opt.camera || '固定镜头';
    // 调用方传入的是中文运镜名(固定镜头/推镜头…,见 storyboard.js moveMap),反向映射为芯片值做初始高亮
    const REV_MOVE = { '固定镜头': '固定', '推镜头': '↑ 前推', '拉镜头': '↓ 后拉', '移镜头': '→ 右移', '环绕镜头': '↗ 右环绕', '摇镜头': '↘ 升镜' };
    if (REV_MOVE[move]) move = REV_MOVE[move];
    const VIEWS = ['正面', '侧面', '背面'];
    const ANGLES = CAM.ELEVATIONS.map(e => e.name);
    const SIZES = CAM.SHOT_SIZES.map(s => s.name);
    const MOVES = ['固定', '↑ 前推', '↓ 后拉', '← 左移', '→ 右移', '↖ 左环绕', '↗ 右环绕', '↙ 降镜', '↘ 升镜'];
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
        <label class="field"><span>运镜方向(八方向)</span>
          <div class="model-row">${MOVES.map((mv, i) => `<div class="model-opt ${mv === move ? 'sel' : ''}" data-move="${mv}">${mv}</div>`).join('')}</div>
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
