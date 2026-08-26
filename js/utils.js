/* ============ utils.js 通用工具: Toast / Modal / 模拟任务 ============ */
(function () {
  const U = {};

  U.esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  /* ---- 缩略图:本站 /uploads 素材走服务端 400px 缩略图,列表页不再载原图;dataURL/外链原样透传 ---- */
  U.thumb = url => (typeof url === 'string' && url.startsWith('/uploads/')) ? '/api/thumb?src=' + encodeURIComponent(url) : url;

  /* ---- Toast ---- */
  U.toast = function (msg, type, ms) {
    const root = document.getElementById('toast-root');
    const el = document.createElement('div');
    el.className = 'toast ' + (type || '');
    const ico = type === 'success' ? '✓' : type === 'error' ? '✕' : type === 'info' ? 'ℹ' : '●';
    el.innerHTML = `<span>${ico}</span><span>${U.esc(msg)}</span>`;
    root.appendChild(el);
    setTimeout(() => { el.style.opacity = '0'; el.style.transition = '.3s'; setTimeout(() => el.remove(), 300); }, ms || 2200);
  };

  /* ---- Modal ---- */
  // openModal({title, body(html), footer(html), wide, xl, xxl, onMount(el, close)})
  U.openModal = function (opt) {
    const root = document.getElementById('modal-root');
    const mask = document.createElement('div');
    mask.className = 'modal-mask';
    const cls = 'modal' + (opt.xxl ? ' xxl' : opt.xl ? ' xl' : opt.wide ? ' wide' : '');
    mask.innerHTML = `<div class="${cls}">
      <div class="modal-head"><h3>${U.esc(opt.title || '')}</h3><button class="modal-close">✕</button></div>
      <div class="modal-body">${opt.body || ''}</div>
      ${opt.footer ? `<div class="modal-foot">${opt.footer}</div>` : ''}
    </div>`;
    const close = () => { mask.remove(); if (opt.onClose) opt.onClose(); };
    mask.addEventListener('mousedown', e => { if (e.target === mask && opt.maskClose !== false) close(); });
    mask.querySelector('.modal-close').onclick = close;
    root.appendChild(mask);
    if (opt.onMount) opt.onMount(mask, close);
    return close;
  };

  U.confirm = function (msg, onOk, okText, onCancel) {
    let okHit = false;
    U.openModal({
      title: '确认操作',
      body: `<p style="line-height:1.8">${U.esc(msg)}</p>`,
      footer: `<button class="btn" data-x="no">取消</button><button class="btn primary" data-x="ok">${okText || '确定'}</button>`,
      onMount(m, close) {
        m.querySelector('[data-x=no]').onclick = close;
        m.querySelector('[data-x=ok]').onclick = () => { okHit = true; close(); onOk && onOk(); };
      },
      onClose() { if (!okHit && onCancel) onCancel(); }, // 取消/✕/遮罩关闭统一回执(命令层 guardAsync 用)
    });
  };

  /* ---- 后台任务侧边栏(非模态,可最小化;长任务期间页面保持可操作) ----
   * U.bgDock({title, sub, steps, onRetry, onCancel}) → {m, say(html), close(), finish(html), setSteps(step, failStep), stepInfo(i, html), cancelled}
   * - 「—」最小化为右下角胶囊(点击恢复);「✕」关闭并触发 onCancel(用于中止循环)
   * - finish(html) 显示完成态,3s 后自动关闭
   * - 可选 steps 模式:steps:[{title, desc}] 渲染进度条+ETA 行与步骤卡片(等待/进行中/完成/失败),
   *   失败步带「重试该步」按钮(onRetry(i) 回调);进度条/ETA 元素经 m.querySelector('[data-bar]/[data-pct]/[data-eta]') 自取 */
  U.bgDock = function (opt) {
    opt = opt || {};
    const ov = document.createElement('div');
    ov.className = 'dir-dock pipe-dock';
    // 多个后台面板共存时向右错开,避免完全遮挡
    const n = document.querySelectorAll('.dir-dock.pipe-dock:not(.min)').length;
    ov.innerHTML = `
      <div class="pipe-head">
        <b>${opt.title || '后台任务'}</b>
        <span class="grow"></span>
        <button class="btn ghost sm" data-x="min" title="最小化(后台继续运行)">—</button>
        <button class="btn ghost sm" data-x="close" title="取消并关闭">✕</button>
      </div>
      <div class="pipe-body">${opt.steps ? `
        ${opt.sub ? `<div class="dir-sub">${opt.sub}</div>` : ''}
        <div class="dir-bar-row">
          <div class="progress grow"><i data-bar style="width:0%"></i></div>
          <div class="dir-bar-meta"><b data-pct>0%</b><span class="dir-eta" data-eta>预计还需 …</span></div>
        </div>
        <div class="dir-steps">
          ${opt.steps.map((s, i) => `
          <div class="dir-step" data-step="${i}">
            <div class="dir-step-ico" data-ico>${i + 1}</div>
            <div class="grow">
              <div><b>${s.title}</b><span class="dir-step-st" data-st></span></div>
              <div class="hint" style="margin:2px 0 0">${s.desc}</div>
              <div class="dir-step-info small" data-info></div>
              <div class="dir-step-err" data-err style="display:none"><span data-errmsg></span><button class="btn sm danger" data-retry="${i}">↻ 重试该步</button></div>
            </div>
          </div>`).join('')}
        </div>` : '<div class="review-log" data-rlog style="max-height:none"></div>'}</div>`;
    if (n) ov.style.right = Math.min(n * 28, 112) + 'px';
    document.body.appendChild(ov);
    const state = { cancelled: false, closed: false };
    const close = () => {
      if (state.closed) return;
      state.closed = true; state.cancelled = true;
      ov.style.opacity = '0';
      setTimeout(() => ov.remove(), 300);
      if (opt.onCancel) opt.onCancel();
    };
    ov.querySelector('[data-x=close]').onclick = close;
    ov.querySelector('[data-x=min]').onclick = e => { e.stopPropagation(); ov.classList.add('min'); };
    ov.addEventListener('click', e => {
      if (ov.classList.contains('min') && !(e.target.closest && e.target.closest('[data-x=close],[data-x=min]'))) ov.classList.remove('min');
    });
    const logEl = ov.querySelector('[data-rlog]');
    const say = html => {
      if (state.closed || !logEl) return;
      logEl.innerHTML += `<div style="padding:3px 0;border-bottom:1px dashed var(--border2)">${html}</div>`;
      logEl.scrollTop = logEl.scrollHeight;
    };
    const finish = html => {
      if (state.closed) return;
      if (html) say(html);
      setTimeout(() => { if (!state.closed) { state.closed = true; ov.style.opacity = '0'; setTimeout(() => ov.remove(), 300); } }, 3000);
    };
    /* steps 模式:step=当前步序号(≥steps.length 视为全部完成),failStep=失败步(-1 表示无);stepInfo 写某步信息行 */
    const setSteps = (step, failStep) => {
      if (!opt.steps) return;
      ov.querySelectorAll('[data-step]').forEach(card => {
        const i = +card.dataset.step;
        const ico = card.querySelector('[data-ico]');
        const stEl = card.querySelector('[data-st]');
        const err = card.querySelector('[data-err]');
        card.classList.toggle('active', i === step && failStep !== i);
        card.classList.toggle('done', i < step || step >= opt.steps.length);
        card.classList.toggle('failed', failStep === i);
        if (failStep === i) { ico.textContent = '✕'; stEl.textContent = ' 失败'; err.style.display = ''; }
        else if (i < step || step >= opt.steps.length) { ico.textContent = '✓'; stEl.textContent = ' 已完成'; err.style.display = 'none'; }
        else if (i === step) { ico.innerHTML = '<span class="spinner"></span>'; stEl.textContent = ' 进行中'; err.style.display = 'none'; }
        else { ico.textContent = i + 1; stEl.textContent = ' 等待'; err.style.display = 'none'; }
      });
    };
    const stepInfo = (i, html) => { const el = ov.querySelector(`[data-step="${i}"] [data-info]`); if (el) el.innerHTML = html; };
    if (opt.steps) ov.querySelectorAll('[data-retry]').forEach(b => b.onclick = () => { if (opt.onRetry) opt.onRetry(+b.dataset.retry); });
    return { m: ov, say, close, finish, setSteps, stepInfo, get cancelled() { return state.cancelled; } };
  };

  /* ---- 进度弹窗: 模拟异步任务 ---- */
  // runTask({title, steps:[{label, ms}], onStep(i, api), onDone}) -> 显示进度条弹窗
  U.runTask = function (opt) {
    const steps = opt.steps;
    let i = 0, cancelled = false, finished = false;
    let scope = null; // 本弹窗 mask 元素:查询作用域限定其内,多弹窗并存时进度条/日志/步骤不再串台
    const close = U.openModal({
      title: opt.title || '处理中',
      maskClose: false,
      body: `
        <div class="step-flow">${steps.map((s, k) => `<div class="step" data-step="${k}">${U.esc(s.label)}</div>`).join('')}</div>
        <div class="progress" style="margin:8px 0 10px"><i style="width:0%"></i></div>
        <div class="small muted" data-log>准备中…</div>`,
      footer: opt.cancellable ? '<button class="btn" data-x="cancel">取消</button>' : '',
      onClose() { cancelled = true; if (!finished) opt.onCancel && opt.onCancel(); }, // ✕ 关闭同取消:停掉后续步骤链;成功收尾的 close 不触发 onCancel
      onMount(m, c) {
        scope = m;
        if (opt.cancellable) m.querySelector('[data-x=cancel]').onclick = () => c(); // onClose 统一收口置 cancelled
      },
    });
    const bar = () => scope && scope.querySelector('.progress > i');
    const log = t => { const l = scope && scope.querySelector('[data-log]'); if (l) l.textContent = t; };
    const markStep = (k, cls) => { const s = scope && scope.querySelector(`[data-step="${k}"]`); if (s) s.className = 'step ' + cls; };

    function next() {
      if (cancelled) return;
      if (i >= steps.length) { finished = true; close(); opt.onDone && opt.onDone(); return; }
      const st = steps[i];
      markStep(i, 'active');
      log(st.label + '…');
      const startW = (i / steps.length) * 100, endW = ((i + 1) / steps.length) * 100;
      const dur = st.ms || 1200, t0 = Date.now();
      (function tick() {
        if (cancelled) return;
        const p = Math.min(1, (Date.now() - t0) / dur);
        const b = bar(); if (b) b.style.width = (startW + (endW - startW) * p) + '%';
        if (p < 1) requestAnimationFrame(tick);
        else {
          markStep(i, 'done');
          if (opt.onStep) opt.onStep(i);
          i++;
          setTimeout(next, 150);
        }
      })();
    }
    setTimeout(next, 200);
    return { cancel: () => { cancelled = true; } };
  };

  /* ---- 通用异步模拟 ---- */
  U.delay = ms => new Promise(r => setTimeout(r, ms));
  // 在一个元素上显示进度条, 返回 Promise
  U.progressIn = function (el, ms, label) {
    return new Promise(resolve => {
      el.innerHTML = `<div class="gen-tip"><div class="spinner"></div><div>${U.esc(label || '生成中…')}</div>
        <div class="progress" style="width:80%"><i style="width:0%"></i></div></div>`;
      const bar = el.querySelector('.progress > i');
      const t0 = Date.now();
      (function tick() {
        const p = Math.min(1, (Date.now() - t0) / ms);
        if (bar) bar.style.width = (p * 100) + '%';
        if (p < 1) requestAnimationFrame(tick); else resolve();
      })();
    });
  };

  /* ---- 文件读取 / 下载 ---- */
  /* ---- 文本编码探测(BOM/UTF-8/GBK,修复 Windows 记事本 GBK 剧本乱码) ---- */
  function decodeText(buf) {
    if (buf[0] === 0xEF && buf[1] === 0xBB && buf[2] === 0xBF) return new TextDecoder('utf-8').decode(buf.subarray(3));
    if (buf[0] === 0xFF && buf[1] === 0xFE) return new TextDecoder('utf-16le').decode(buf.subarray(2));
    if (buf[0] === 0xFE && buf[1] === 0xFF) return new TextDecoder('utf-16be').decode(buf.subarray(2));
    try { return new TextDecoder('utf-8', { fatal: true }).decode(buf); }
    catch (e) { return new TextDecoder('gbk').decode(buf); }
  }

  U.readFile = function (accept, asDataURL) {
    return new Promise(resolve => {
      const inp = document.createElement('input');
      inp.type = 'file'; inp.accept = accept || '*/*';
      inp.onchange = () => {
        const f = inp.files[0];
        if (!f) return resolve(null);
        const rd = new FileReader();
        if (asDataURL) {
          rd.onload = () => resolve({ name: f.name, size: f.size, data: rd.result });
          rd.readAsDataURL(f); return;
        }
        rd.onload = () => resolve({ name: f.name, size: f.size, data: decodeText(new Uint8Array(rd.result)) });
        rd.readAsArrayBuffer(f);
      };
      inp.oncancel = () => resolve(null); // L5 修复:取消选择也要 resolve,防按钮永久 disabled
      inp.click();
    });
  };
  /* ================= CSV 工具(导出带 BOM,解析支持引号转义/内嵌换行) ================= */
  /* rows: 字符串数组的数组。含逗号/引号/换行的字段自动加引号,内嵌引号转 "" */
  U.toCSV = function (rows, withBOM) {
    const esc = v => {
      v = String(v == null ? '' : v);
      return /[",\n\r]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v;
    };
    const body = rows.map(r => r.map(esc).join(',')).join('\r\n');
    return (withBOM === false ? '' : '﻿') + body;
  };
  /* 手写 CSV 解析器:正确处理 "..." 转义、内嵌换行、"" 双引号 */
  U.parseCSV = function (text) {
    const rows = [];
    let row = [], field = '', inQ = false;
    text = String(text || '').replace(/^﻿/, '');
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (inQ) {
        if (c === '"') {
          if (text[i + 1] === '"') { field += '"'; i++; }
          else inQ = false;
        } else field += c;
      } else if (c === '"') inQ = true;
      else if (c === ',') { row.push(field); field = ''; }
      else if (c === '\n' || c === '\r') {
        if (c === '\r' && text[i + 1] === '\n') i++;
        row.push(field); field = '';
        rows.push(row); row = [];
      } else field += c;
    }
    if (field !== '' || row.length) { row.push(field); rows.push(row); }
    // 去掉末尾全空行
    while (rows.length && rows[rows.length - 1].every(f => !String(f).trim())) rows.pop();
    return rows;
  };

  U.downloadText = function (filename, text) {
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = filename; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 3000);
  };
  U.downloadDataURL = function (filename, dataURL) {
    const a = document.createElement('a'); a.href = dataURL; a.download = filename; a.click();
  };

  /* ================= 剧本文件解析(txt/md/docx/pdf/doc) ================= */

  /* PDF:pdf.js 逐页提取(按 y 坐标变化分行),扫描件报错 */
  async function extractPdfText(buf, onProgress) {
    if (!window.pdfjsLib) throw new Error('PDF 解析组件未加载(js/vendor/pdf.min.js)');
    pdfjsLib.GlobalWorkerOptions.workerSrc = 'js/vendor/pdf.worker.min.js';
    const pdf = await pdfjsLib.getDocument({
      data: buf,
      cMapUrl: 'js/vendor/cmaps/', cMapPacked: true,               // CJK 中文字体映射(必需)
      standardFontDataUrl: 'js/vendor/standard_fonts/',            // 标准字体数据
      isEvalSupported: false,
    }).promise;
    const n = pdf.numPages;
    const pages = [];
    for (let i = 1; i <= n; i++) {
      if (onProgress) onProgress(i, n);
      const page = await pdf.getPage(i);
      const tc = await page.getTextContent();
      // 按 y 坐标分组:同一 y 为同一行,y 变化 >2 换行
      const items = tc.items.slice().sort((a, b) => (b.transform[5] - a.transform[5]) || (a.transform[4] - b.transform[4]));
      let lastY = null, line = '';
      const lines = [];
      for (const it of items) {
        const y = Math.round(it.transform[5]);
        if (lastY !== null && Math.abs(y - lastY) > 2) { if (line.trim()) lines.push(line.trim()); line = ''; }
        line += it.str;
        lastY = y;
      }
      if (line.trim()) lines.push(line.trim());
      pages.push(lines.join('\n'));
    }
    const text = pages.join('\n\n').trim();
    if (!text) throw new Error('该 PDF 为扫描件,无法提取文字(无文字层),请改用 txt/docx');
    return text;
  }

  /* 旧版 .doc(Word 97-2003 二进制):尽力提取可打印字符段 */
  function extractDocText(buf) {
    const u16 = new TextDecoder('utf-16le', { fatal: false }).decode(buf);
    const runs = u16.match(/[一-龥A-Za-z0-9,。!?;:"'""''《》、·—\-()\s]{4,}/g) || [];
    let text = runs.map(s => s.trim()).filter(s => s.length >= 4 && /[一-龥A-Za-z]/.test(s)).join('\n');
    // UTF-16 提取过少时,补充单字节可打印区段(英文剧本)
    if (text.replace(/\s/g, '').length < 20) {
      const latin = new TextDecoder('latin1').decode(buf);
      const runs2 = latin.match(/[\x20-\x7E]{6,}/g) || [];
      const more = runs2.map(s => s.trim()).filter(s => /[A-Za-z]{3,}/.test(s)).join('\n');
      if (more.length > text.length) text = more;
    }
    return { text, warn: text.replace(/\s/g, '').length < 50 };
  }

  /**
   * 上传剧本文件并解析为纯文本
   * onProgress(page,total):PDF 逐页进度回调
   * 返回 {name,size,text,warn} | {error} | null(取消)
   */
  U.readScriptFile = function (onProgress) {
    return new Promise(resolve => {
      const inp = document.createElement('input');
      inp.type = 'file'; inp.accept = '.txt,.md,.doc,.docx,.pdf';
      inp.onchange = async () => {
        const f = inp.files[0];
        if (!f) return resolve(null);
        try {
          const buf = await f.arrayBuffer();
          const ext = (f.name.split('.').pop() || '').toLowerCase();
          let text = '', warn = false;
          if (ext === 'txt' || ext === 'md') {
            text = decodeText(new Uint8Array(buf));
          } else if (ext === 'docx') {
            if (!window.mammoth) throw new Error('docx 解析组件未加载(js/vendor/mammoth.browser.min.js)');
            const r = await mammoth.extractRawText({ arrayBuffer: buf });
            text = r.value || '';
            if (!text.trim()) throw new Error('docx 解析失败:内容为空或格式不受支持');
          } else if (ext === 'pdf') {
            text = await extractPdfText(new Uint8Array(buf), onProgress);
          } else if (ext === 'doc') {
            const r = extractDocText(new Uint8Array(buf));
            text = r.text; warn = r.warn;
          } else {
            return resolve({ error: '不支持的文件格式:.' + ext + '(支持 txt/md/doc/docx/pdf)' });
          }
          if (!text.trim()) return resolve({ error: '未能从「' + f.name + '」中提取到文字内容' });
          resolve({ name: f.name, size: f.size, text, warn });
        } catch (e) {
          resolve({ error: e.message || '文件解析失败' });
        }
      };
      inp.oncancel = () => resolve(null); // L5:取消选择同样 resolve
      inp.click();
    });
  };

  /* ---- 积分检查 ---- */
  U.requireCredits = function (n, actionName) {
    if (Store.credits() < n) {
      U.openModal({
        title: '积分不足',
        body: `<p style="line-height:1.9">「${U.esc(actionName)}」需要 <b style="color:var(--yellow)">${n}</b> 积分，当前余额 <b style="color:var(--yellow)">${Store.credits()}</b> 积分。<br>请先前往个人中心充值。</p>`,
        footer: '<button class="btn" data-x="no">取消</button><button class="btn primary" data-x="go">去充值</button>',
        onMount(m, close) {
          m.querySelector('[data-x=no]').onclick = close;
          m.querySelector('[data-x=go]').onclick = () => { close(); location.hash = '#/profile'; };
        },
      });
      return false;
    }
    return true;
  };

  /* ---- 上传到后端(有 token 且后端可达时),失败返回 null 由调用方回退 base64 ---- */
  U.uploadData = async function (name, dataURL) {
    if (!window.Store || !Store.getToken()) return null;
    // 超时保护(120s,覆盖大文件 base64 上传):挂起时返回 null 走离线回退,防调用方按钮永久 disabled
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 120000);
    try {
      const base64 = String(dataURL).split(',')[1];
      if (!base64) return null;
      const mime = String(dataURL).slice(5).split(';')[0] || 'application/octet-stream';
      const res = await fetch('/api/upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + Store.getToken() },
        body: JSON.stringify({ name, mime, dataBase64: base64 }),
        signal: ctrl.signal,
      });
      if (!res.ok) return null;
      const j = await res.json();
      return j.code === 0 ? j.data.url : null;
    } catch (_) { return null; }
    finally { clearTimeout(timer); }
  };

  /* ---- 宫格图客户端切分:整张宫格图按 cols×cols 均分裁成单元格 dataURL(失败回退 []) ---- */
  U.cropGridCells = function (imgUrl, cols) {
    return new Promise(resolve => {
      const im = new Image();
      im.crossOrigin = 'anonymous';
      im.onload = () => {
        const cw = Math.floor(im.width / cols), ch = Math.floor(im.height / cols);
        const out = [];
        for (let r = 0; r < cols; r++) for (let c = 0; c < cols; c++) {
          const cv = document.createElement('canvas');
          cv.width = cw; cv.height = ch;
          cv.getContext('2d').drawImage(im, c * cw, r * ch, cw, ch, 0, 0, cw, ch);
          out.push(cv.toDataURL('image/png'));
        }
        resolve(out);
      };
      im.onerror = () => resolve([]);
      im.src = imgUrl;
    });
  };

  /* ---- 选文件并上传九件套收敛(C 批):读文件 → 可选大小校验 → 上传服务端/回退 base64,统一 toast
   * 返回 {name, size, url} | null(取消或超限);url 为服务端地址或离线 base64 */
  U.readAndUpload = async function (accept, { maxMB } = {}) {
    // 合规承诺:首次上传前须同意「上传与创作合规承诺」(权属/肖像/版权)
    if (window.Compliance && !(await Compliance.ensureAccepted())) return null;
    const f = await U.readFile(accept, true);
    if (!f) return null;
    if (maxMB && f.size > maxMB * 1024 * 1024) { U.toast(`文件不能超过 ${maxMB}MB`, 'error'); return null; }
    const url = await U.uploadData(f.name, f.data);
    U.toast(url ? '已上传服务端' : '离线 base64(服务端不可用,使用本地数据)', url ? 'success' : 'info');
    return { name: f.name, size: f.size, url: url || f.data, server: !!url };
  };

  /* ---- 服务端计费镜像(退费,2026-08 六轮重写;八轮补结果对账):只提交 operationId,金额由服务端按原账本判定 ----
   * 真实扣费由服务端在各付费入口按 billingAction 白名单原子完成(本地 U.charge 仅做视图);
   * 前端失败退费镜像 operationId → 服务端退"该 operation 全部未退扣费"(与服务端未交付自动退费
   * 共用幂等键,天然防双退);客户端提交的金额不再被服务端采信(封死直连接口刷退款);
   * 服务端判定已交付(403)拒绝退款时,本地此前已加回的余额与服务端漂移 → 拉取服务端钱包回写本地,
   * 两端重新对齐(不再永久漂移到下次全量同步) */
  function syncCreditsFromServer() {
    const t = Store.getToken();
    if (!t || !window.Store || !Store.currentUser) return;
    fetch('/api/wallet', { headers: { Authorization: 'Bearer ' + t } })
      .then(r => r.json())
      .then(j => {
        if (j && j.code === 0 && typeof (j.data && j.data.balance) === 'number') {
          const u = Store.currentUser();
          if (u && u.credits !== j.data.balance) {
            u.credits = j.data.balance; // 服务端钱包为唯一权威
            Store.save();
            U.refreshCredits();
          }
        }
      })
      .catch(() => { /* 离线静默 */ });
  }
  U.syncCreditsFromServer = syncCreditsFromServer; // R19:服务端权威余额回写(取消任务等不退本地镜像的路径用)
  function refundMirror(operationId, reason) {
    const t = Store.getToken();
    if (!t || !operationId) return;
    try {
      fetch('/api/billing/refund', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + t },
        body: JSON.stringify({ operationId: String(operationId), reason: String(reason || '').slice(0, 60) }),
      })
        .then(r => r.json().catch(() => null))
        .then(j => {
          if (!j) return;
          /* 九轮:凡带 opKey 的镜像退款,无论服务端 成功/重复退款(0)/拒绝(403),一律以服务端余额
           * 回写本地——本地 U.refund 先行加上的额度与服务端实退额不再漂移(同一 op 重复退款本地
           * 多加的部分、服务端判定已交付拒退的部分都被校正;403/413 再拉一次钱包确认) */
          if (j.code === 0 && j.data && typeof j.data.balance === 'number') {
            const u = window.Store && Store.currentUser && Store.currentUser();
            if (u && u.credits !== j.data.balance) {
              u.credits = j.data.balance;
              Store.save();
              U.refreshCredits();
            }
          } else if (j.code === 403 || j.code === 413) {
            syncCreditsFromServer();
          }
        })
        .catch(() => { /* 离线/网络抖动静默:本地账本照常,下次拉取以服务端为准 */ });
    } catch (_) { /* 同上 */ }
  }

  /* ---- 服务端计费动作同步:GET /api/billing/actions → COST(价格唯一权威在服务端,两端一致) ---- */
  U.syncBillingActions = async function () {
    if (!Store.getToken() || !window.COST) return;
    try {
      const res = await fetch('/api/billing/actions', { headers: { Authorization: 'Bearer ' + Store.getToken() } });
      const j = await res.json();
      if (j && j.code === 0 && j.data && j.data.costs) {
        for (const k in j.data.costs) if (typeof j.data.costs[k] === 'number') COST[k] = j.data.costs[k];
      }
    } catch (_) { /* 离线:沿用本地默认价目 */ }
  };

  /* ---- 积分三件套收敛(R6):检查+扣费+刷新侧栏,返回是否成功 ----
   * opKey 可选:业务操作幂等键(供关联退费;扣费本身已由服务端代理按次收取,本地不再镜像) */
  U.charge = function (cost, actionName, opKey) {
    if (!U.requireCredits(cost, actionName)) return false;
    if (!Store.spend(cost, actionName)) return false;
    U.refreshCredits();
    U.__lastOpKey = opKey || null; // 供紧随其后的失败退费镜像关联同一业务操作
    return true;
  };

  /* ---- 退费对称封装(C 批):Store.refund + 刷新侧栏;opKey 关联原业务操作(幂等防双退) ---- */
  U.refund = function (cost, reason, opKey) {
    Store.refund(cost, reason);
    U.refreshCredits();
    if (opKey) refundMirror(String(opKey), reason); // 服务端按原账单退该 operation(无 opKey=本地计费,无需镜像)
  };

  /* ---- 积分刷新(侧栏) ---- */
  U.refreshCredits = function () {
    const el = document.querySelector('[data-credit-num]');
    if (el) el.textContent = Store.credits();
  };

  /* ---- 会话过期统一清理(七轮):清 token + session + 对账/计费同步 guard ----
   * 只清会话态,保留本地项目数据;app.js 路由按 session 判定登录,不清 session 会造成
   * "旧 session 把登录页重定向回项目页"的假登录态 */
  U.expireSession = function () {
    if (window.Store) {
      Store.clearToken();
      if (Store.state) Store.state.session = null; // 假登录态根因:路由以 state.session 判定
    }
    window.__jobsReconciled = false;  // 重登后重新对账
    window.__billingSynced = false;   // 重登后重新同步服务端计费动作
    U.refreshCredits();
  };

  /* ---- 401 统一处理:清会话 + 提示 + 跳登录页(记录来源 hash 便于重登返回) ----
   * api.js/media.js 的各 401 分支统一调用,避免用户困在"假登录态"反复报错 */
  U.authExpired = function () {
    U.expireSession();
    U.toast('登录已过期,请重新登录(本机已有改动会保留)', 'error', 3500);
    if (location.hash !== '#/login') {
      try { sessionStorage.setItem('mv_hujing_login_from', location.hash); } catch (_) { /* 存储满忽略 */ }
      location.hash = '#/login';
    }
  };

  /* ---- 哈希颜色 ---- */
  U.hashColor = function (str) {
    let h = 0;
    for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) >>> 0;
    return h % 360;
  };

  window.U = U;
})();
