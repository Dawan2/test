/* ============ placeholder.js canvas 程序化生成占位图 ============ */
(function () {
  const P = {};
  const cache = {};
  const cacheKeys = [];
  const CACHE_MAX = 50; // FIFO 上限,防占位图缓存无限膨胀
  function cacheGet(k) { return cache[k]; }
  function cacheSet(k, v) {
    if (cache[k]) return;
    cacheKeys.push(k);
    cache[k] = v;
    if (cacheKeys.length > CACHE_MAX) delete cache[cacheKeys.shift()];
  }

  function mulberry(seed) {
    let a = seed >>> 0;
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function seedOf(str) {
    let h = 2166136261;
    for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
  }

  /**
   * 生成占位图 dataURL
   * opt: {label, sub, kind:'character'|'scene'|'prop'|'shot'|'video'|'tool', w, h, seedText}
   */
  P.image = function (opt) {
    const key = JSON.stringify(opt);
    // 显式 noCache(每次换盐、永不复用)不进缓存;此前用正则猜 seedText 是否掺时间,
    // 但 Date.now() 求值后只剩 1-3 位数字,正则恒不命中→所有图都进缓存,挤光可复用条目
    const cacheable = !opt.noCache;
    if (cacheable && cacheGet(key)) return cacheGet(key);
    const w = opt.w || 480, h = opt.h || 270;
    const cv = document.createElement('canvas');
    cv.width = w; cv.height = h;
    const ctx = cv.getContext('2d');
    const rnd = mulberry(seedOf(opt.seedText || opt.label || 'mv'));
    const hue = Math.floor(rnd() * 360);
    const hue2 = (hue + 40 + Math.floor(rnd() * 80)) % 360;

    // 背景渐变
    const g = ctx.createLinearGradient(0, 0, w, h);
    g.addColorStop(0, `hsl(${hue},45%,${14 + rnd() * 8}%)`);
    g.addColorStop(1, `hsl(${hue2},55%,${22 + rnd() * 12}%)`);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);

    // 装饰图形
    const kind = opt.kind || 'shot';
    ctx.save();
    if (kind === 'character') {
      // 人形剪影
      const cx = w / 2 + (rnd() - 0.5) * w * 0.2, cy = h * 0.62, r = h * 0.17;
      ctx.fillStyle = `hsla(${hue2},70%,72%,.9)`;
      ctx.beginPath(); ctx.arc(cx, cy - r * 1.5, r * 0.72, 0, 7); ctx.fill(); // 头
      ctx.beginPath(); // 身体
      ctx.moveTo(cx - r * 1.15, cy + h * 0.42);
      ctx.quadraticCurveTo(cx, cy - r * 0.9, cx + r * 1.15, cy + h * 0.42);
      ctx.closePath(); ctx.fill();
      for (let i = 0; i < 4; i++) { // 光斑
        ctx.fillStyle = `hsla(${hue},80%,70%,${0.08 + rnd() * 0.1})`;
        ctx.beginPath(); ctx.arc(rnd() * w, rnd() * h, 10 + rnd() * 30, 0, 7); ctx.fill();
      }
    } else if (kind === 'scene') {
      // 山/建筑剪影 + 地平线
      ctx.fillStyle = `hsla(${hue},40%,30%,.85)`;
      ctx.beginPath(); ctx.moveTo(0, h);
      let y = h * (0.45 + rnd() * 0.2);
      for (let x = 0; x <= w; x += w / 8) { ctx.lineTo(x, y + (rnd() - 0.5) * h * 0.25); }
      ctx.lineTo(w, h); ctx.closePath(); ctx.fill();
      ctx.fillStyle = `hsla(${hue2},35%,18%,.9)`;
      ctx.beginPath(); ctx.moveTo(0, h);
      y = h * 0.72;
      for (let x = 0; x <= w; x += w / 6) { ctx.lineTo(x, y + (rnd() - 0.5) * h * 0.12); }
      ctx.lineTo(w, h); ctx.closePath(); ctx.fill();
      // 太阳/月亮
      ctx.fillStyle = `hsla(${(hue + 60) % 360},85%,72%,.85)`;
      ctx.beginPath(); ctx.arc(w * (0.2 + rnd() * 0.6), h * (0.18 + rnd() * 0.2), h * 0.09, 0, 7); ctx.fill();
    } else if (kind === 'prop') {
      // 几何物体 + 底座
      const cx = w / 2, cy = h * 0.55, s = h * 0.22;
      ctx.fillStyle = `hsla(${hue2},65%,62%,.95)`;
      const shape = Math.floor(rnd() * 3);
      ctx.beginPath();
      if (shape === 0) ctx.roundRect ? ctx.roundRect(cx - s, cy - s, s * 2, s * 1.6, 10) : ctx.rect(cx - s, cy - s, s * 2, s * 1.6);
      else if (shape === 1) { ctx.moveTo(cx, cy - s); ctx.lineTo(cx + s, cy + s * 0.7); ctx.lineTo(cx - s, cy + s * 0.7); ctx.closePath(); }
      else ctx.arc(cx, cy - s * 0.1, s, 0, 7);
      ctx.fill();
      ctx.fillStyle = 'rgba(0,0,0,.3)';
      ctx.beginPath(); ctx.ellipse(cx, cy + s * 0.95, s * 1.4, s * 0.25, 0, 0, 7); ctx.fill();
    } else {
      // shot/video/tool: 胶片感构图 —— 斜线条 + 取景框
      for (let i = 0; i < 5; i++) {
        ctx.strokeStyle = `hsla(${(hue + i * 30) % 360},70%,60%,${0.12 + rnd() * 0.15})`;
        ctx.lineWidth = 2 + rnd() * 5;
        ctx.beginPath();
        ctx.moveTo(rnd() * w, 0); ctx.lineTo(rnd() * w, h); ctx.stroke();
      }
      ctx.strokeStyle = 'rgba(255,255,255,.35)';
      ctx.lineWidth = 1.5;
      const m = Math.min(w, h) * 0.09;
      [[m, m, 1, 1], [w - m, m, -1, 1], [m, h - m, 1, -1], [w - m, h - m, -1, -1]].forEach(([x, yy, sx, sy]) => {
        ctx.beginPath(); ctx.moveTo(x + sx * 22, yy); ctx.lineTo(x, yy); ctx.lineTo(x, yy + sy * 22); ctx.stroke();
      });
    }
    ctx.restore();

    // 暗角
    const vg = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.3, w / 2, h / 2, Math.max(w, h) * 0.75);
    vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,.42)');
    ctx.fillStyle = vg; ctx.fillRect(0, 0, w, h);

    // 文字标注
    const label = opt.label || '';
    if (label) {
      ctx.textAlign = 'center';
      ctx.fillStyle = 'rgba(255,255,255,.95)';
      ctx.font = `600 ${Math.round(h * 0.11)}px "PingFang SC","Microsoft YaHei",sans-serif`;
      ctx.shadowColor = 'rgba(0,0,0,.6)'; ctx.shadowBlur = 6;
      ctx.fillText(label.slice(0, 12), w / 2, h * 0.82);
      if (opt.sub) {
        ctx.font = `${Math.round(h * 0.058)}px sans-serif`;
        ctx.fillStyle = 'rgba(255,255,255,.72)';
        ctx.fillText(String(opt.sub).slice(0, 26), w / 2, h * 0.82 + h * 0.1);
      }
      ctx.shadowBlur = 0;
    }
    // 左上角水印
    ctx.textAlign = 'left';
    ctx.font = `${Math.round(h * 0.05)}px sans-serif`;
    ctx.fillStyle = 'rgba(255,255,255,.5)';
    ctx.fillText('🐋 虎鲸漫剧', 10, h * 0.08 + 8);

    const url = cv.toDataURL('image/png');
    if (cacheable) cacheSet(key, url);
    return url;
  };

  // 主体图(每次换盐:同名主体重生成占位图有变化)
  P.subject = (name, kind) => P.image({ label: name, sub: { character: '角色主体', scene: '场景主体', prop: '道具主体' }[kind] || '主体', kind, w: 480, h: 360, seedText: 'subj:' + kind + name + Date.now() % 997, noCache: true });
  // 分镜图
  P.shot = (text, idx) => P.image({ label: '镜头 ' + idx, sub: (text || '').slice(0, 20), kind: 'shot', w: 480, h: 270, seedText: 'shot:' + idx + ':' + text });
  // 视频帧(每次换盐)
  P.video = (text, idx) => P.image({ label: '▶ 视频 ' + idx, sub: (text || '').slice(0, 18), kind: 'video', w: 480, h: 270, seedText: 'vid:' + idx + ':' + text + Math.floor(Math.random() * 999), noCache: true });

  // 宫格生图(cols×cols 一张宫格大图)
  P.grid = function (label, kind, cols, seedSalt) {
    cols = cols || 3;
    const cell = 240, gap = 4, w = cols * cell + (cols + 1) * gap;
    const cv = document.createElement('canvas');
    cv.width = w; cv.height = w;
    const ctx = cv.getContext('2d');
    ctx.fillStyle = '#0c0e13';
    ctx.fillRect(0, 0, w, w);
    // 同步逐格绘制(种子随机配色 + 机位标注)
    for (let i = 0; i < cols * cols; i++) {
      const x = gap + (i % cols) * (cell + gap), y = gap + Math.floor(i / cols) * (cell + gap);
      const sub = document.createElement('canvas');
      sub.width = cell; sub.height = cell;
      const sctx = sub.getContext('2d');
      const rnd = mulberry(seedOf('grid:' + label + ':' + (seedSalt || '') + ':' + i));
      const hue = Math.floor(rnd() * 360), hue2 = (hue + 50) % 360;
      const g = sctx.createLinearGradient(0, 0, cell, cell);
      g.addColorStop(0, `hsl(${hue},45%,${14 + rnd() * 8}%)`);
      g.addColorStop(1, `hsl(${hue2},55%,${22 + rnd() * 10}%)`);
      sctx.fillStyle = g; sctx.fillRect(0, 0, cell, cell);
      sctx.fillStyle = `hsla(${hue},40%,32%,.85)`;
      sctx.beginPath(); sctx.moveTo(0, cell);
      let yy = cell * 0.55;
      for (let xx = 0; xx <= cell; xx += cell / 6) sctx.lineTo(xx, yy + (rnd() - 0.5) * cell * 0.3);
      sctx.lineTo(cell, cell); sctx.closePath(); sctx.fill();
      sctx.fillStyle = `hsla(${(hue + 60) % 360},85%,72%,.8)`;
      sctx.beginPath(); sctx.arc(cell * (0.2 + rnd() * 0.6), cell * 0.22, cell * 0.08, 0, 7); sctx.fill();
      sctx.fillStyle = 'rgba(255,255,255,.75)';
      sctx.font = `${Math.round(cell * 0.09)}px sans-serif`;
      sctx.fillText((label || '').slice(0, 8) + ' · 机位' + (i + 1), 8, cell - 10);
      ctx.drawImage(sub, x, y);
    }
    return cv.toDataURL('image/png');
  };

  // 宫格单格图数组(宫格切分用)
  P.gridCells = function (label, kind, cols, seedSalt) {
    const n = cols * cols;
    return Array.from({ length: n }, (_, i) => P.image({
      label: '宫格-' + (i + 1), sub: label, kind: kind || 'scene', w: 360, h: 360,
      seedText: 'gridcell:' + label + ':' + (seedSalt || '') + ':' + i,
    }));
  };

  window.PH = P;
})();
