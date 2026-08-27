/* ============ editors.js 编辑器:漫剧/剪辑/画板 ============ */
(function () {
  window.Views = window.Views || {};

  /* ---------- 公共小工具 ---------- */
  function loadImg(src) {
    return new Promise(res => {
      const im = new Image();
      im.onload = () => res(im);
      im.onerror = () => res(null);
      im.src = src;
    });
  }
  function fmt(sec) {
    sec = Math.max(0, Math.round(sec));
    return String(Math.floor(sec / 60)).padStart(2, '0') + ':' + String(sec % 60).padStart(2, '0');
  }
  function rrect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }
  function wrapLines(ctx, text, maxW) {
    const lines = [];
    String(text || '').split('\n').forEach(para => {
      let line = '';
      for (const ch of para) {
        if (ctx.measureText(line + ch).width > maxW && line) { lines.push(line); line = ch; }
        else line += ch;
      }
      lines.push(line || ' ');
    });
    return lines.length ? lines : [' '];
  }

  /* ================================================================
     1. 漫剧图片编辑器
  ================================================================ */
  Views.comic = function (main) {
    let img = null;                 // 当前图(Image)
    let bubbles = [];               // {id,type,text,x,y,w,h}
    let sel = null;                 // 选中气泡 id
    let drag = null;                // {id,dx,dy}
    const CW = 960;
    const TYPES = ['对白', '旁白', '内心'];
    const TAGC = { '对白': 'cyan', '旁白': 'yellow', '内心': 'purple' };
    /* AI 生成对白的契约半:返回 JSON 形状与 type 词表就是下面解析/归类的判据,故留在装配口不开放覆盖
     * (改坏即整轮解析不出气泡);人设句走注册表键 comic.bubbleSystem,用户在「全局默认值 → 核心提示词 skill」改得到 */
    const BUBBLE_CONTRACT = '根据用户给的剧情简述,生成 2-4 个画面气泡,只返回 JSON 数组,格式:[{"type":"对白","text":"..."}],type 只能是 对白/旁白/内心,text 不超过 30 字。';

    main.innerHTML = `
    <div class="page">
      <div class="page-head">
        <div>
          <div class="page-title">漫剧编辑器</div>
          <div class="page-sub">为分镜图添加对白气泡与文字</div>
        </div>
        <div class="row">
          <button class="btn" data-x="upload">上传图片</button>
          <button class="btn" data-x="pick">从项目分镜选择</button>
          <button class="btn primary" data-x="export" disabled>导出 PNG</button>
        </div>
      </div>
      <div class="row wrap" style="align-items:flex-start">
        <div class="grow" style="min-width:420px">
          <div class="card" data-x="stage">
            <div class="dropzone">尚未选择图片<br><span class="small muted">点击上方「上传图片」或「从项目分镜选择」开始创作</span></div>
          </div>
        </div>
        <div style="width:330px">
          <div class="card">
            <b>气泡</b> <span class="hint">画布上可直接拖动</span>
            <div class="row" style="margin:10px 0">
              ${TYPES.map(t => `<button class="btn sm" data-x="add" data-t="${t}">+${t}</button>`).join('')}
            </div>
            <div data-x="list"></div>
            <div data-x="editor"></div>
          </div>
          <div class="card" style="margin-top:12px">
            <b>AI 生成对白</b>
            <label class="field" style="margin-top:10px"><span>剧情简述</span>
              <textarea class="input" data-x="plot" rows="3" placeholder="简述这一幕的剧情,AI 将自动铺 2-4 个气泡"></textarea>
            </label>
            <button class="btn block" data-x="ai">生成对白</button>
            <div class="hint" style="margin-top:8px">API 未配置或失败时,自动回退本地模板文案</div>
          </div>
        </div>
      </div>
    </div>`;

    const $ = s => main.querySelector(s);

    /* ---- 选图 ---- */
    $('[data-x=upload]').onclick = async () => {
      const f = await U.readFile('image/*', true);
      if (f) setImage(f.data);
    };
    $('[data-x=pick]').onclick = () => {
      const shots = [];
      (Store.state.projects || []).forEach(p => (p.episodes || []).forEach(e => (e.shots || []).forEach(s => {
        if (s.image) shots.push({ pn: p.name || '未命名项目', en: e.name || e.title || '分集', img: s.image, plot: s.plot || '' });
      })));
      if (!shots.length) return U.toast('项目中还没有可用的分镜图', 'info');
      U.openModal({
        title: '从项目分镜选择', wide: true,
        body: `<div class="grid" style="grid-template-columns:repeat(auto-fill,minmax(150px,1fr))">
          ${shots.map((o, i) => `
          <div class="card" data-i="${i}" style="cursor:pointer;padding:8px">
            <img src="${o.img}" style="width:100%;border-radius:6px;display:block">
            <div class="small muted" style="margin-top:6px">${U.esc(o.pn)} · ${U.esc(o.en)}</div>
            ${o.plot ? `<div class="small" style="margin-top:2px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${U.esc(o.plot)}</div>` : ''}
          </div>`).join('')}
        </div>`,
        onMount(m, close) {
          m.querySelectorAll('[data-i]').forEach(el => el.onclick = () => { setImage(shots[+el.dataset.i].img); close(); });
        }
      });
    };

    async function setImage(src) {
      const im = await loadImg(src);
      if (!im) return U.toast('图片加载失败', 'error');
      img = im; bubbles = []; sel = null;
      const h = Math.max(240, Math.round(CW * im.height / im.width));
      $('[data-x=stage]').innerHTML = `<canvas data-x="cv" width="${CW}" height="${h}" style="width:100%;display:block;border-radius:8px;cursor:move"></canvas>`;
      bindCanvas();
      $('[data-x=export]').disabled = false;
      redraw(); renderList(); renderEditor();
    }

    /* ---- 画布 ---- */
    /* 拖拽监听挂全局槽位(同 batchops __kfMove 模式):路由切走后旧闭包引用丢失、
       函数级变量无法再移除,会随每次进入编辑器净增 2 个 window 监听;槽位保证任意时刻至多一份 */
    function bindCanvas() {
      const cv = $('[data-x=cv]');
      cv.addEventListener('mousedown', e => {
        const p = cvPos(e, cv);
        for (let i = bubbles.length - 1; i >= 0; i--) {
          const b = bubbles[i];
          if (p.x >= b.x && p.x <= b.x + b.w && p.y >= b.y && p.y <= b.y + b.h) {
            sel = b.id; drag = { id: b.id, dx: p.x - b.x, dy: p.y - b.y };
            redraw(); renderList(); renderEditor();
            return;
          }
        }
        if (sel) { sel = null; redraw(); renderList(); renderEditor(); }
      });
      if (window.__comicMove) window.removeEventListener('mousemove', window.__comicMove);
      if (window.__comicUp) window.removeEventListener('mouseup', window.__comicUp);
      window.__comicMove = e => {
        if (!drag) return;
        const b = bubbles.find(x => x.id === drag.id);
        if (!b) { drag = null; return; }
        const p = cvPos(e, cv);
        b.x = Math.max(0, Math.min(cv.width - b.w, p.x - drag.dx));
        b.y = Math.max(0, Math.min(cv.height - b.h, p.y - drag.dy));
        redraw();
      };
      window.__comicUp = () => { drag = null; };
      window.addEventListener('mousemove', window.__comicMove);
      window.addEventListener('mouseup', window.__comicUp);
    }
    function cvPos(e, cv) {
      const r = cv.getBoundingClientRect();
      return { x: (e.clientX - r.left) * cv.width / r.width, y: (e.clientY - r.top) * cv.height / r.height };
    }

    function redraw() {
      const cv = $('[data-x=cv]');
      if (!cv || !img) return;
      const ctx = cv.getContext('2d');
      ctx.clearRect(0, 0, cv.width, cv.height);
      ctx.drawImage(img, 0, 0, cv.width, cv.height);
      bubbles.forEach(b => drawBubble(ctx, b, b.id === sel));
    }

    function drawBubble(ctx, b, active) {
      ctx.save();
      ctx.font = '16px "Microsoft YaHei",sans-serif';
      const lines = wrapLines(ctx, b.text, 220);
      const lh = 22, pad = 14;
      const w = Math.max(56, Math.max(...lines.map(l => ctx.measureText(l).width)) + pad * 2);
      const h = lines.length * lh + pad * 2 - 8;
      b.w = w; b.h = h;
      if (b.type === '对白') {
        ctx.fillStyle = '#ffffff';
        rrect(ctx, b.x, b.y, w, h, 10); ctx.fill();
        ctx.beginPath(); // 小三角尾巴(朝左下)
        ctx.moveTo(b.x + 20, b.y + h - 2);
        ctx.lineTo(b.x - 2, b.y + h + 26);
        ctx.lineTo(b.x + 44, b.y + h - 2);
        ctx.closePath(); ctx.fill();
        ctx.fillStyle = '#111111';
      } else if (b.type === '旁白') {
        ctx.fillStyle = 'rgba(0,0,0,.62)';
        rrect(ctx, b.x, b.y, w, h, 6); ctx.fill();
        ctx.fillStyle = '#ffd94d';
      } else { // 内心独白:虚线边框白底
        ctx.fillStyle = 'rgba(255,255,255,.92)';
        rrect(ctx, b.x, b.y, w, h, 10); ctx.fill();
        ctx.setLineDash([6, 4]);
        ctx.strokeStyle = '#333333'; ctx.lineWidth = 1.5;
        rrect(ctx, b.x, b.y, w, h, 10); ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = '#111111';
      }
      lines.forEach((l, i) => ctx.fillText(l, b.x + pad, b.y + pad + 8 + i * lh));
      if (active) {
        ctx.setLineDash([5, 4]);
        ctx.strokeStyle = '#4da3ff'; ctx.lineWidth = 2;
        ctx.strokeRect(b.x - 5, b.y - 5, w + 10, h + 10);
        ctx.setLineDash([]);
      }
      ctx.restore();
    }

    /* ---- 气泡管理 ---- */
    function addBubble(type, text, x, y) {
      const cv = $('[data-x=cv]');
      const b = {
        id: Store.uid('bb'), type, text,
        x: x != null ? x : 60 + Math.random() * (cv ? cv.width - 320 : 400),
        y: y != null ? y : 40 + Math.random() * (cv ? cv.height - 160 : 240),
        w: 0, h: 0
      };
      bubbles.push(b); sel = b.id;
      redraw(); renderList(); renderEditor();
    }
    main.querySelectorAll('[data-x=add]').forEach(btn => btn.onclick = () => {
      if (!img) return U.toast('请先选择图片', 'error');
      addBubble(btn.dataset.t, btn.dataset.t === '旁白' ? '旁白文字…' : '输入文字…');
    });

    function renderList() {
      $('[data-x=list]').innerHTML = bubbles.length
        ? bubbles.map((b, i) => `
          <div class="row" data-bid="${b.id}" style="padding:6px 8px;border:1px solid ${b.id === sel ? 'var(--accent)' : 'var(--border)'};border-radius:8px;margin-bottom:6px;cursor:pointer">
            <span class="tag ${TAGC[b.type]}">${b.type}</span>
            <span class="small grow" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${U.esc(b.text)}</span>
            <span class="small muted">#${i + 1}</span>
          </div>`).join('')
        : '<div class="empty">还没有气泡,点击上方按钮添加</div>';
      main.querySelectorAll('[data-bid]').forEach(el => el.onclick = () => {
        sel = el.dataset.bid; redraw(); renderList(); renderEditor();
      });
    }

    function renderEditor() {
      const b = bubbles.find(x => x.id === sel);
      const box = $('[data-x=editor]');
      if (!b) { box.innerHTML = ''; return; }
      box.innerHTML = `
        <div class="divider"></div>
        <label class="field"><span>气泡文字(${b.type})</span>
          <textarea class="input" data-x="btext" rows="3">${U.esc(b.text)}</textarea>
        </label>
        <div class="row" style="margin-top:8px">
          <button class="btn sm danger" data-x="bdel">删除气泡</button>
        </div>`;
      box.querySelector('[data-x=btext]').oninput = e => { b.text = e.target.value; redraw(); renderList(); };
      box.querySelector('[data-x=bdel]').onclick = () => {
        bubbles = bubbles.filter(x => x.id !== b.id); sel = null;
        redraw(); renderList(); renderEditor();
        U.toast('已删除气泡', 'success');
      };
    }

    /* ---- AI 生成对白 ---- */
    $('[data-x=ai]').onclick = async () => {
      if (!img) return U.toast('请先选择图片', 'error');
      const plot = $('[data-x=plot]').value.trim();
      if (!plot) return U.toast('请输入剧情简述', 'error');
      let arr = null;
      if (API.isReady()) {
        // 七轮计费贯通:本地镜像与服务端 llm.tool 同价,失败退回
        const aiOpId = 'ed_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
        const paid = U.charge(COST.tool, 'AI 生成对白');
        if (!paid) return U.toast('积分不足,AI 生成对白需 ' + COST.tool + ' 积分', 'error');
        try {
          U.toast('AI 生成中…', 'info', 1200);
          const r = await API.chatJSON({
            system: Prompts.get('comic.bubbleSystem') + BUBBLE_CONTRACT,
            messages: [{ role: 'user', content: '剧情:' + plot }],
            temperature: 0.8, max_tokens: 600,
            billingAction: 'llm.tool', operationId: aiOpId, // 服务端白名单计费(与本地 COST.tool 同价)
          });
          if (Array.isArray(r)) arr = r;
          else if (r && Array.isArray(r.bubbles)) arr = r.bubbles;
        } catch (e) { U.refund(COST.tool, 'AI 对白失败退费', aiOpId); arr = null; }
      }
      if (arr && arr.length) {
        U.toast('AI 已生成对白', 'success');
      } else {
        arr = localDialogue(plot);
        U.toast('AI 服务不可用,已回退本地模板文案', 'info');
      }
      arr.filter(o => o && o.text).slice(0, 4).forEach((o, i) => {
        const t = TYPES.includes(o.type) ? o.type : '对白';
        addBubble(t, String(o.text).slice(0, 60), 50 + i * 36, 36 + i * 68);
      });
      sel = null; redraw(); renderList(); renderEditor();
    };
    function localDialogue(plot) {
      const D = ['这不可能……你怎么会在这里?', '别说了,先离开这里!', '我一定要查清真相。', '等等,你听我解释!'];
      const N = ['夜色渐深,暗流正在涌动。', '没有人知道,命运的齿轮已经悄然转动。'];
      const I = ['(难道……他早就知道了?)', '(我绝对不能在这里倒下。)'];
      const pick = a => a[Math.floor(Math.random() * a.length)];
      return [
        { type: '旁白', text: plot.length > 24 ? plot.slice(0, 24) + '…' : plot },
        { type: '对白', text: pick(D) },
        { type: Math.random() > 0.5 ? '内心' : '对白', text: pick(Math.random() > 0.5 ? I : D) },
        { type: '旁白', text: pick(N) }
      ];
    }

    /* ---- 导出 ---- */
    $('[data-x=export]').onclick = () => {
      const cv = $('[data-x=cv]');
      if (!cv) return U.toast('请先选择图片', 'error');
      sel = null; redraw(); renderList();
      U.downloadDataURL('漫剧图-' + Date.now() + '.png', cv.toDataURL('image/png'));
      U.toast('已导出 PNG', 'success');
    };
  };

  /* ================================================================
     2. 视频剪辑
  ================================================================ */
  Views.cutter = function (main) {
    let file = null;        // {name,url,server,size?} 服务端视频源
    let dur = 0;            // 真实时长(秒,读视频元数据)
    let frames = [];        // 帧缩略图 dataURL(时间轴占位帧)
    let segs = [];          // {s,e,del} 百分比区间
    let sel = -1;

    main.innerHTML = `
    <div class="page">
      <div class="page-head">
        <div>
          <div class="page-title">视频剪辑</div>
          <div class="page-sub">上传视频后,点击时间轴添加分割点,删除不需要的片段</div>
        </div>
        <div class="row">
          <button class="btn" data-x="upload">上传视频</button>
          <button class="btn primary" data-x="export" disabled>导出成片(-${COST.tool}积分)</button>
        </div>
      </div>
      <div class="card" data-x="preview"><div class="empty">尚未上传视频</div></div>
      <div class="card" data-x="tlcard" style="display:none;margin-top:12px">
        <b>时间轴</b>
        <span class="hint">点击片段选中;点击下方刻度条添加分割点;也可点「添加分割点」在选中片段中间切一刀</span>
        <div data-x="track" style="position:relative;margin-top:12px;user-select:none"></div>
        <div data-x="ruler" style="position:relative;height:30px;margin-top:6px;border-top:1px solid var(--border);cursor:crosshair"></div>
        <div class="row" style="margin-top:12px">
          <button class="btn sm" data-x="addcut">添加分割点</button>
          <button class="btn sm danger" data-x="del">删除选中片段</button>
          <button class="btn sm" data-x="restore">全部恢复</button>
          <span class="grow"></span>
          <span class="small muted" data-x="tinfo"></span>
        </div>
      </div>
    </div>`;

    const $ = s => main.querySelector(s);

    /* ---- 上传(真实服务端视频,读出真实时长) ---- */
    $('[data-x=upload]').onclick = async () => {
      const f = await U.readAndUpload('video/*', { maxMB: 100 });
      if (!f) return;
      if (!f.server) return U.toast('视频需上传到服务端才能剪辑(请确认后端已启动)', 'error', 3500);
      file = f;
      // 读真实时长
      dur = await new Promise(res => {
        const v = document.createElement('video');
        v.preload = 'metadata';
        v.onloadedmetadata = () => res(Math.max(0.5, v.duration || 0));
        v.onerror = () => res(0);
        v.src = f.url;
        setTimeout(() => res(0), 8000);
      });
      if (!dur) return U.toast('无法读取视频时长(文件可能损坏)', 'error');
      const n = 8 + (Math.round(dur) % 5); // 8~12 帧
      frames = [];
      for (let i = 0; i < n; i++) {
        frames.push(PH.image({ label: '帧 ' + (i + 1), sub: fmt(dur * i / (n - 1)), kind: 'video', w: 192, h: 108, seedText: 'cut:' + f.name + ':' + i }));
      }
      segs = [{ s: 0, e: 100, del: false }];
      sel = -1;
      $('[data-x=preview]').innerHTML = `
        <div class="row wrap" style="align-items:center">
          <video src="${f.url}" controls preload="metadata" style="width:280px;border-radius:8px;background:#000"></video>
          <div style="margin-left:16px">
            <b>${U.esc(f.name)}</b>
            <div class="kv" style="margin-top:8px"><span class="muted">文件大小</span><span>${(f.size / 1048576).toFixed(1)} MB</span></div>
            <div class="kv"><span class="muted">时长</span><span>${fmt(dur)}</span></div>
            <div class="hint" style="margin-top:8px">在下方时间轴上点击刻度条添加分割点</div>
          </div>
        </div>`;
      $('[data-x=tlcard]').style.display = '';
      $('[data-x=export]').disabled = false;
      renderTrack(); renderRuler(); updateInfo();
      U.toast('视频已载入', 'success');
    };

    /* ---- 时间轴渲染 ---- */
    function renderTrack() {
      const track = $('[data-x=track]');
      track.innerHTML = `<div class="row" style="gap:2px;height:84px;align-items:stretch">` +
        segs.map((g, i) => {
          const w = g.e - g.s;
          const n = Math.max(1, Math.round(w / 9));
          let imgs = '';
          for (let k = 0; k < n; k++) {
            const fi = Math.min(frames.length - 1, Math.floor((g.s + w * (k + 0.5) / n) / 100 * frames.length));
            imgs += `<img src="${frames[fi]}" style="flex:1;min-width:0;height:100%;object-fit:cover;display:block">`;
          }
          return `<div data-seg="${i}" style="position:relative;width:${w}%;height:100%;display:flex;overflow:hidden;border-radius:6px;cursor:pointer;box-sizing:border-box;
            border:2px solid ${i === sel ? 'var(--accent)' : 'var(--border)'};
            opacity:${g.del ? 0.32 : 1};filter:${g.del ? 'grayscale(.8)' : 'none'}">${imgs}
            ${g.del ? '<span class="tag red" style="position:absolute">删</span>' : ''}
          </div>`;
        }).join('') + `</div>` +
        segs.filter(g => g.s > 0).map(g =>
          `<div style="position:absolute;left:${g.s}%;top:-4px;bottom:-4px;width:3px;background:var(--accent);border-radius:2px;pointer-events:none"></div>`
        ).join('');
      track.querySelectorAll('[data-seg]').forEach(el => el.onclick = () => {
        sel = +el.dataset.seg;
        renderTrack(); updateInfo();
      });
    }

    function renderRuler() {
      const ruler = $('[data-x=ruler]');
      let html = '';
      for (let p = 0; p <= 100; p += 10) {
        html += `<div style="position:absolute;left:${p}%;top:0;width:1px;height:${p % 20 === 0 ? 10 : 6}px;background:var(--text3)"></div>`;
        if (p % 20 === 0) html += `<div class="small muted" style="position:absolute;left:${p}%;top:12px;transform:translateX(-50%)">${fmt(dur * p / 100)}</div>`;
      }
      ruler.innerHTML = html;
      ruler.onclick = e => {
        const r = ruler.getBoundingClientRect();
        addCut((e.clientX - r.left) / r.width * 100);
      };
    }

    function updateInfo() {
      const kept = segs.filter(g => !g.del).reduce((a, g) => a + (g.e - g.s), 0);
      const g = segs[sel];
      $('[data-x=tinfo]').textContent =
        `共 ${segs.length} 个片段 · 删除 ${segs.filter(x => x.del).length} 个 · 成片约 ${fmt(dur * kept / 100)}` +
        (g ? ` · 选中 ${fmt(dur * g.s / 100)}-${fmt(dur * g.e / 100)}${g.del ? '(已删除)' : ''}` : '');
      $('[data-x=del]').textContent = g && g.del ? '恢复选中片段' : '删除选中片段';
    }

    /* ---- 片段操作 ---- */
    function addCut(p) {
      if (!file) return U.toast('请先上传视频', 'error');
      p = Math.max(1, Math.min(99, p));
      const i = segs.findIndex(g => p > g.s + 2 && p < g.e - 2);
      if (i < 0) return U.toast('该位置距离已有分割点太近', 'info');
      const g = segs[i];
      segs.splice(i, 1, { s: g.s, e: p, del: g.del }, { s: p, e: g.e, del: g.del });
      sel = i;
      renderTrack(); updateInfo();
      U.toast('已在 ' + fmt(dur * p / 100) + ' 处添加分割点', 'success');
    }
    $('[data-x=addcut]').onclick = () => {
      if (!file) return U.toast('请先上传视频', 'error');
      const g = segs[sel];
      addCut(g ? (g.s + g.e) / 2 : 50);
    };
    $('[data-x=del]').onclick = () => {
      const g = segs[sel];
      if (!g) return U.toast('请先点击选中一个片段', 'info');
      g.del = !g.del;
      renderTrack(); updateInfo();
      U.toast(g.del ? '片段已标记删除' : '片段已恢复', 'success');
    };
    $('[data-x=restore]').onclick = () => {
      if (!file) return U.toast('请先上传视频', 'error');
      segs.forEach(g => g.del = false);
      renderTrack(); updateInfo();
      U.toast('已恢复全部片段', 'success');
    };

    /* ---- 导出(真实 ffmpeg 裁剪拼接) ---- */
    $('[data-x=export]').onclick = () => {
      if (!file || !file.server) return U.toast('请先上传服务端视频', 'error');
      const keptSegs = segs.filter(g => !g.del);
      if (!keptSegs.length) return U.toast('不能删除全部片段', 'error');
      const segments = keptSegs.map(g => ({ start: dur * g.s / 100, end: dur * g.e / 100 }));
      Tasks.run({ type: '视频剪辑', model: 'FFmpeg 裁剪拼接', target: file.name, cost: COST.tool, actionName: '导出成片' }, async (tk) => {
        const btn = $('[data-x=export]');
        btn.disabled = true; btn.innerHTML = '<span class="spinner"></span> 导出中…';
        try {
          const r = await Media.ffCut(file.url, segments, 'ff.cut', tk.id);
          $('[data-x=preview]').innerHTML = `
            <b>导出结果(${r.segments} 段拼接)</b>
            <video src="${r.url}" controls style="width:100%;max-height:50vh;border-radius:10px;background:#000;margin-top:8px"></video>
            <div class="row" style="margin-top:8px;justify-content:flex-end"><button class="btn sm primary" data-x="dlcut">⬇ 下载成片</button></div>`;
          $('[data-x=dlcut]').onclick = () => { U.downloadDataURL('剪辑成片_' + file.name.replace(/\.[^.]+$/, '') + '.mp4', r.url); U.toast('已开始下载', 'success'); };
          U.toast('导出成功', 'success');
          return { filename: '剪辑成片_' + file.name.replace(/\.[^.]+$/, '') + '.mp4', dataURL: r.url };
        } catch (e) {
          U.toast('导出失败:' + e.message, 'error', 4000);
          throw e; // 保持 Tasks.run 退费链
        } finally {
          btn.disabled = false; btn.textContent = `导出成片(-${COST.tool}积分)`;
        }
      });
    };
  };

  /* ================================================================
     3. 画板 / 图像编辑
  ================================================================ */
  Views.ps = function (main) {
    let img = null;          // 当前图(Image)
    let tool = 'inpaint';
    let brush = 20;
    let painting = false;
    let adj = { bri: 0, exp: 0, con: 0, sh: 0, sat: 0, warm: 0, fade: 0 };
    const CW = 900;

    const ADJ_DEFS = [
      { k: 'bri', name: '亮度', min: -100, max: 100 },
      { k: 'exp', name: '曝光', min: -100, max: 100 },
      { k: 'con', name: '对比', min: -100, max: 100 },
      { k: 'sh', name: '阴影', min: -100, max: 100 },
      { k: 'sat', name: '饱和度', min: -100, max: 100 },
      { k: 'warm', name: '暖度', min: -50, max: 50 },
      { k: 'fade', name: '淡色', min: 0, max: 100 }
    ];

    main.innerHTML = `
    <div class="page">
      <div class="page-head">
        <div>
          <div class="page-title">画板</div>
          <div class="page-sub">局部重绘 · 图片超清 · 人物超写实 · 画面调整</div>
        </div>
        <div class="row">
          <button class="btn" data-x="upload">上传图片</button>
          <button class="btn" data-x="assets">从资产库选择</button>
          <button class="btn ghost" data-x="close" title="关闭画板,返回上一页">✕ 关闭</button>
        </div>
      </div>
      <div class="row wrap" style="align-items:flex-start">
        <div class="grow" style="min-width:420px">
          <div class="card" data-x="stage">
            <div class="dropzone">尚未选择图片<br><span class="small muted">点击上方「上传图片」或「从资产库选择」</span></div>
          </div>
        </div>
        <div style="width:340px">
          <div class="tabs">
            <div class="tab active" data-tool="inpaint">局部重绘</div>
            <div class="tab" data-tool="hd">超清</div>
            <div class="tab" data-tool="realistic">人物超写实</div>
            <div class="tab" data-tool="adjust">画面调整</div>
          </div>
          <div class="card" data-x="panel" style="margin-top:12px"></div>
        </div>
      </div>
    </div>`;

    const $ = s => main.querySelector(s);

    /* ---- 选图 ---- */
    $('[data-x=close]').onclick = () => { // 关闭画板:返回来源页(主体页跳转时经 __projTab 回到「主体」tab)
      if (history.length > 1) history.back(); else location.hash = '#/tools';
    };
    $('[data-x=upload]').onclick = async () => {
      const f = await U.readFile('image/*', true);
      if (f) setImage(f.data);
    };
    $('[data-x=assets]').onclick = () => {
      const list = (Store.state.assets.subjects || []).filter(a => a.image);
      if (!list.length) return U.toast('资产库中还没有图片', 'info');
      U.openModal({
        title: '从资产库选择', wide: true,
        body: `<div class="grid" style="grid-template-columns:repeat(auto-fill,minmax(150px,1fr))">
          ${list.map((a, i) => `
          <div class="card" data-i="${i}" style="cursor:pointer;padding:8px">
            <img src="${a.image}" style="width:100%;border-radius:6px;display:block">
            <div class="small" style="margin-top:6px">${U.esc(a.name || '未命名')}</div>
            ${a.kind ? `<span class="tag cyan" style="margin-top:4px">${U.esc(a.kind)}</span>` : ''}
          </div>`).join('')}
        </div>`,
        onMount(m, close) {
          m.querySelectorAll('[data-i]').forEach(el => el.onclick = () => { setImage(list[+el.dataset.i].image); close(); });
        }
      });
    };

    async function setImage(src) {
      const im = await loadImg(src);
      if (!im) return U.toast('图片加载失败', 'error');
      img = im;
      ADJ_DEFS.forEach(d => adj[d.k] = 0);
      const h = Math.max(240, Math.round(CW * im.height / im.width));
      $('[data-x=stage]').innerHTML = `
        <div style="position:relative">
          <canvas data-x="cv" width="${CW}" height="${h}" style="width:100%;display:block;border-radius:8px"></canvas>
          <canvas data-x="mask" width="${CW}" height="${h}" style="position:absolute;left:0;top:0;width:100%;height:100%;border-radius:8px"></canvas>
        </div>`;
      bindMask();
      redrawMain();
      renderPanel(); // 重置滑块/结果区,并同步蒙版层可点状态
    }

    /* ---- 主画布重绘(含画面调整滤镜) ---- */
    function redrawMain() {
      const cv = $('[data-x=cv]');
      if (!cv || !img) return;
      const ctx = cv.getContext('2d');
      const b = 1 + (adj.bri + adj.exp * 0.8 + adj.sh * 0.25) / 100;
      const c = 1 + adj.con / 100;
      const s = Math.max(0, 1 + adj.sat / 100);
      ctx.save();
      ctx.filter = `brightness(${b.toFixed(2)}) contrast(${c.toFixed(2)}) saturate(${s.toFixed(2)})`;
      ctx.clearRect(0, 0, cv.width, cv.height);
      ctx.drawImage(img, 0, 0, cv.width, cv.height);
      ctx.restore();
      if (adj.warm) { // 暖度:叠加半透明暖/冷色层
        ctx.fillStyle = adj.warm > 0
          ? `rgba(255,150,60,${(adj.warm / 50 * 0.22).toFixed(3)})`
          : `rgba(70,130,255,${(-adj.warm / 50 * 0.18).toFixed(3)})`;
        ctx.fillRect(0, 0, cv.width, cv.height);
      }
      if (adj.fade) { // 淡色:叠加半透明白层
        ctx.fillStyle = `rgba(255,255,255,${(adj.fade / 100 * 0.35).toFixed(3)})`;
        ctx.fillRect(0, 0, cv.width, cv.height);
      }
    }

    /* ---- 蒙版涂抹 ---- */
    function bindMask() {
      const mk = $('[data-x=mask]');
      const ctx = mk.getContext('2d');
      const pos = e => {
        const r = mk.getBoundingClientRect();
        return { x: (e.clientX - r.left) * mk.width / r.width, y: (e.clientY - r.top) * mk.height / r.height };
      };
      const dot = e => {
        const p = pos(e);
        ctx.fillStyle = 'rgba(255,60,60,.45)';
        ctx.beginPath(); ctx.arc(p.x, p.y, brush, 0, Math.PI * 2); ctx.fill();
      };
      mk.addEventListener('mousedown', e => { if (tool !== 'inpaint') return; painting = true; dot(e); });
      mk.addEventListener('mousemove', e => { if (painting && tool === 'inpaint') dot(e); });
      // M6 修复:重绑前先移除,防 window mouseup 累积
      if (window.__psMaskUp) window.removeEventListener('mouseup', window.__psMaskUp);
      window.__psMaskUp = () => { painting = false; };
      window.addEventListener('mouseup', window.__psMaskUp);
    }
    function clearMask() {
      const mk = $('[data-x=mask]');
      if (mk) mk.getContext('2d').clearRect(0, 0, mk.width, mk.height);
    }
    /* 当前画布合成导出(主图 + 可选蒙版红区)→ dataURL,供 seedream i2i 指令编辑 */
    function compositeSrc(withMask) {
      const cv = $('[data-x=cv]');
      if (!cv || !img) return null;
      const t = document.createElement('canvas');
      t.width = cv.width; t.height = cv.height;
      const c = t.getContext('2d');
      c.drawImage(cv, 0, 0);
      if (withMask) { const mk = $('[data-x=mask]'); if (mk) c.drawImage(mk, 0, 0); }
      return t.toDataURL('image/png');
    }

    /* ---- 工具面板 ---- */
    main.querySelectorAll('[data-tool]').forEach(t => t.onclick = () => {
      tool = t.dataset.tool;
      main.querySelectorAll('[data-tool]').forEach(x => x.classList.toggle('active', x === t));
      renderPanel();
    });

    function renderPanel() {
      const mk = $('[data-x=mask]');
      if (mk) {
        mk.style.pointerEvents = tool === 'inpaint' ? 'auto' : 'none';
        mk.style.cursor = tool === 'inpaint' ? 'crosshair' : 'default';
      }
      const box = $('[data-x=panel]');
      if (tool === 'inpaint') renderInpaint(box);
      else if (tool === 'hd') renderHd(box);
      else if (tool === 'realistic') renderRealistic(box);
      else renderAdjust(box);
    }

    /* -- a. 局部重绘 -- */
    function renderInpaint(box) {
      box.innerHTML = `
        <b>局部重绘</b>
        <div style="margin-top:6px"><span class="tag purple">Volcengine · seedream i2i 指令编辑</span></div>
        <div class="hint" style="margin-top:8px">在左侧图片上按住鼠标涂抹需要重绘的区域</div>
        <label class="field" style="margin-top:10px"><span>画笔粗度 <b data-x="bv">${brush}</b></span>
          <input type="range" data-x="brush" min="2" max="60" value="${brush}" style="width:100%">
        </label>
        <label class="field"><span>提示词</span>
          <textarea class="input" data-x="prompt" rows="3" placeholder="描述重绘后希望出现的内容"></textarea>
        </label>
        <div class="row" style="margin-top:8px">
          <button class="btn primary grow" data-x="run">开始重绘(-${COST.inpaint}积分)</button>
          <button class="btn" data-x="clear">清除蒙版</button>
        </div>
        <div data-x="result" style="margin-top:10px"></div>`;
      box.querySelector('[data-x=brush]').oninput = e => {
        brush = +e.target.value;
        box.querySelector('[data-x=bv]').textContent = brush;
      };
      box.querySelector('[data-x=clear]').onclick = () => { clearMask(); U.toast('蒙版已清除', 'success'); };
      box.querySelector('[data-x=run]').onclick = () => {
        if (!img) return U.toast('请先选择图片', 'error');
        const prompt = box.querySelector('[data-x=prompt]').value.trim();
        if (!prompt) return U.toast('请输入提示词', 'error');
        Tasks.run({ type: '局部重绘', model: 'seedream i2i 指令编辑', target: prompt.slice(0, 12), cost: COST.inpaint, actionName: '局部重绘' }, async (tk) => {
          const res = box.querySelector('[data-x=result]');
          if (window.Media && Media.isReady()) {
            // 真实 i2i:主图+红色涂抹区合成一张,指令模型只改红区
            res.innerHTML = '<div class="hint" style="margin-top:6px"><span class="spinner"></span> 真实模型重绘中(约 1 分钟)…</div>';
            try {
              const r = await Media.genImage({
                prompt: `图片中被红色涂抹覆盖的区域,重绘为:${prompt};其余区域保持原样,风格光影一致`,
                image: compositeSrc(true),
                billingAction: 'image.inpaint', operationId: tk.id,
              });
              res.innerHTML = '';
              setImage(r.url);
              clearMask();
              U.toast('重绘完成,蒙版已清空', 'success');
              return { filename: '局部重绘.png', dataURL: r.url };
            } catch (e) {
              // 失败:清 spinner + 提示,抛错由 Tasks.run 统一退费
              res.innerHTML = '';
              U.toast('失败,积分已自动返还:' + e.message, 'error', 4000);
              throw e;
            }
          }
          // 离线模式:占位图
          const h = $('[data-x=cv]').height;
          await U.progressIn(res, 1600, '重绘中(离线模拟)');
          const outImg = PH.image({ label: prompt.slice(0, 12), sub: '局部重绘', kind: 'shot', w: CW, h, seedText: 'inpaint:' + prompt + ':' + Date.now() % 997 });
          setImage(outImg);
          U.toast('重绘完成(离线模拟),蒙版已清空', 'success');
          return { filename: '局部重绘.png', dataURL: outImg };
        });
      };
    }

    /* -- b. 超清 -- */
    function renderHd(box) {
      let target = '2K';
      box.innerHTML = `
        <b>图片超清</b>
        <div style="margin-top:6px"><span class="tag purple">Volcengine · seedream i2i 高清增强</span></div>
        <label class="field" style="margin-top:12px"><span>目标分辨率</span>
          <div class="model-row">${['2K', '4K'].map((r, i) => `<div class="model-opt ${i === 0 ? 'sel' : ''}" data-r="${r}">${r}</div>`).join('')}</div>
        </label>
        <button class="btn primary block" data-x="run" style="margin-top:10px">开始超清(-${COST.hd}积分)</button>
        <div data-x="result" style="margin-top:10px"></div>`;
      box.querySelectorAll('[data-r]').forEach(el => el.onclick = () => {
        target = el.dataset.r;
        box.querySelectorAll('[data-r]').forEach(x => x.classList.toggle('sel', x === el));
      });
      box.querySelector('[data-x=run]').onclick = () => {
        if (!img) return U.toast('请先选择图片', 'error');
        Tasks.run({ type: '图片超清', model: 'seedream i2i 高清增强·' + target, target: '画板图', cost: COST.hd, actionName: '图片超清(' + target + ')' }, async (tk) => {
          const res = box.querySelector('[data-x=result]');
          if (window.Media && Media.isReady()) {
            res.innerHTML = '<div class="hint" style="margin-top:6px"><span class="spinner"></span> 真实模型高清增强中(约 1 分钟)…</div>';
            try {
              const r = await Media.genImage({
                prompt: `将图片高清化重绘:提升分辨率与细节锐度,修复模糊与噪点,画面内容与构图保持完全一致`,
                size: target, image: compositeSrc(false),
                billingAction: 'image.hd', operationId: tk.id,
              });
              res.innerHTML = '';
              setImage(r.url);
              U.toast('超清完成(' + target + ')', 'success');
              return { filename: '超清' + target + '.png', dataURL: r.url };
            } catch (e) {
              // 失败:清 spinner + 提示,抛错由 Tasks.run 统一退费
              res.innerHTML = '';
              U.toast('失败,积分已自动返还:' + e.message, 'error', 4000);
              throw e;
            }
          }
          // 离线模式:占位图
          const w = target === '4K' ? 3840 : 2048;
          const h = Math.round(w * img.height / img.width);
          await U.progressIn(res, 1800, '超分处理中(离线模拟)');
          const outImg = PH.image({ label: target + ' 超清', sub: w + '×' + h, kind: 'shot', w, h, seedText: 'hd:' + target + ':' + Date.now() % 997 });
          setImage(outImg);
          U.toast('超清完成(' + target + ',离线模拟)', 'success');
          return { filename: '超清' + target + '.png', dataURL: outImg };
        });
      };
    }

    /* -- c. 人物超写实(自 roles 画板并入) -- */
    function renderRealistic(box) {
      box.innerHTML = `
        <b>人物超写实</b>
        <div style="margin-top:6px"><span class="tag purple">seedream i2i · 漫剧形象 → 超写实真人质感</span></div>
        <div class="hint" style="margin-top:8px">将当前图片中的漫剧/卡通人物形象转换为超写实真人质感,五官与服饰细节保留。</div>
        <button class="btn primary block" data-x="run" style="margin-top:10px">开始转换(-${COST.realistic}积分)</button>
        <div data-x="result" style="margin-top:10px"></div>`;
      box.querySelector('[data-x=run]').onclick = () => {
        if (!img) return U.toast('请先选择图片', 'error');
        Tasks.run({ type: '人物超写实', model: 'seedream i2i 写实化', target: '画板图', cost: COST.realistic, actionName: '画板·人物超写实' }, async (tk) => {
          const res = box.querySelector('[data-x=result]');
          if (window.Media && Media.isReady()) {
            res.innerHTML = '<div class="hint" style="margin-top:6px"><span class="spinner"></span> 真实模型写实化转换中(约 1 分钟)…</div>';
            try {
              const r = await Media.genImage({
                prompt: '将画面中的漫剧/卡通人物转换为超写实真人质感:真实皮肤纹理与光影、摄影级细节,五官特征/发型/服饰/构图保持一致',
                image: compositeSrc(false),
                billingAction: 'image.realistic', operationId: tk.id,
              });
              res.innerHTML = '';
              setImage(r.url);
              U.toast('人物超写实完成', 'success');
              return { filename: '人物超写实.png', dataURL: r.url };
            } catch (e) {
              // 失败:清 spinner + 提示,抛错由 Tasks.run 统一退费
              res.innerHTML = '';
              U.toast('失败,积分已自动返还:' + e.message, 'error', 4000);
              throw e;
            }
          }
          // 离线模式:占位图
          const h = $('[data-x=cv]').height;
          await U.progressIn(res, 1600, '超写实转换中(离线模拟)');
          const outImg = PH.image({ label: '人物超写实', sub: '真人质感', kind: 'shot', w: CW, h, seedText: 'realistic:' + Date.now() % 997 });
          setImage(outImg);
          U.toast('人物超写实完成(离线模拟)', 'success');
          return { filename: '人物超写实.png', dataURL: outImg };
        });
      };
    }

    /* -- d. 画面调整 -- */
    function renderAdjust(box) {
      box.innerHTML = `
        <b>画面调整</b> <span class="hint">拖动滑块实时预览</span>
        ${ADJ_DEFS.map(d => `
        <label class="field" style="margin-top:10px"><span>${d.name} <b data-v="${d.k}">${adj[d.k]}</b></span>
          <input type="range" data-k="${d.k}" min="${d.min}" max="${d.max}" value="${adj[d.k]}" style="width:100%">
        </label>`).join('')}
        <div class="row" style="margin-top:12px">
          <button class="btn" data-x="reset">重置</button>
          <button class="btn primary grow" data-x="export">导出 PNG(-${COST.adjust}积分)</button>
        </div>`;
      box.querySelectorAll('[data-k]').forEach(sl => sl.oninput = () => {
        adj[sl.dataset.k] = +sl.value;
        box.querySelector(`[data-v="${sl.dataset.k}"]`).textContent = sl.value;
        redrawMain();
      });
      box.querySelector('[data-x=reset]').onclick = () => {
        ADJ_DEFS.forEach(d => adj[d.k] = 0);
        renderAdjust(box);
        redrawMain();
        U.toast('已重置全部调整', 'success');
      };
      box.querySelector('[data-x=export]').onclick = () => {
        const cv = $('[data-x=cv]');
        if (!cv || !img) return U.toast('请先选择图片', 'error');
        // 统一五件套:登记→扣费→导出→失败退费(原为裸 U.charge,无任务登记,任务监控不可对账)
        const tk = Tasks.start({ type: '画面调整导出', model: '本地', target: '画面调整', cost: COST.adjust });
        if (!U.charge(COST.adjust, '画面调整导出')) { Tasks.fail(tk, '积分不足'); return; }
        try {
          redrawMain();
          U.downloadDataURL('画面调整-' + Date.now() + '.png', cv.toDataURL('image/png'));
          Store.save();
          Tasks.done(tk);
          U.toast('已导出 PNG', 'success');
        } catch (e) {
          U.refund(COST.adjust, '画面调整导出失败');
          Tasks.fail(tk, e.message);
          U.toast('导出失败,积分已返还:' + e.message, 'error');
        }
      };
    }

    renderPanel();
    // 从角色卡「精修」跳入时带入主体图(沿用 tools.js 的 __toolPrefill 机制)
    if (window.__toolPrefill && window.__toolPrefill.image) {
      const pf = window.__toolPrefill;
      window.__toolPrefill = null;
      setImage(pf.image);
      if (pf.name) U.toast('已带入主体图:' + pf.name, 'info');
    }
  };
})();
