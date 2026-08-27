/* ============ sb-io.js 分镜 IO 区(批次 D 从 storyboard.js 拆出的尾部自足区块) ============
 * 拆分边界:剪映导出桥接 / 分镜表 CSV 导入导出 / 本地与资产导入 / 预览播放器 / 合成成片。
 * 内部依赖(blankShot/CAMERAS/renderShots)经 window.SB 桥接;对外出口仍挂在 window.SB 上,引用方不变。
 * 加载顺序:必须在 storyboard.js 之后(index.html)。 */
(function () {
  const { blankShot, CAMERAS, renderShots } = window.SB;

  /* ================= 剪映导入包导出(零依赖 ZIP,STORE) ================= */
  async function exportJianYing(p, ep) {
    const US = s => Math.round(s * 1e6); // 秒→微秒
    let cursor = 0;
    const videoSegs = [], audioSegs = [], textSegs = [], matVideos = [], matTexts = [];
    ep.shots.forEach((s, i) => {
      const dur = (window.SB && SB.estShotDuration ? SB.estShotDuration(s) : (s.duration || 5));
      const start = cursor;
      const hasVideo = Store.shotVideoReady(s) && s.video.url; // 统一就绪判定:在线时模拟占位不打包为真实 mp4
      const vid = 'v_' + s.id, mid = 'm_' + s.id;
      videoSegs.push({ id: vid, material_id: mid, target_timerange: { start: US(start), duration: US(dur) } });
      // 有真实成片则引用 mp4 素材,否则回退帧图(photo)
      matVideos.push(hasVideo
        ? { id: mid, path: 'materials/shot_' + (i + 1) + '.mp4', duration: US(dur), type: 'video' }
        : { id: mid, path: 'materials/shot_' + (i + 1) + '.png', duration: US(dur), type: 'photo' });
      if (s.narration) audioSegs.push({ id: 'a_' + s.id, material_id: 'narr', target_timerange: { start: US(start), duration: US(dur) }, text: s.narration });
      const cap = s.dialogue || '';
      if (cap) {
        const tid = 't_' + s.id;
        textSegs.push({ id: tid, material_id: tid, target_timerange: { start: US(start), duration: US(dur) } });
        matTexts.push({ id: tid, content: cap });
      }
      cursor += dur;
    });
    const draftContent = {
      _comment: '由 虎鲸漫剧生成 · 剪映草稿最小可用结构(公开格式尽力对齐)',
      canvas_config: { width: 1920, height: 1080, ratio: '16:9' },
      duration: US(cursor),
      fps: 30,
      tracks: [
        { type: 'video', segments: videoSegs },
        { type: 'audio', segments: audioSegs },
        { type: 'text', segments: textSegs },
      ],
      materials: { videos: matVideos, audios: [], texts: matTexts },
    };
    const meta = {
      _comment: '由 虎鲸漫剧生成',
      draft_name: `${p.name}_${ep.title}`,
      tm_draft_create: Date.now(),
      tm_duration: US(cursor),
      draft_materials_count: { video: matVideos.length, audio: audioSegs.length, text: matTexts.length },
    };
    const files = [
      { name: 'draft_content.json', data: JSON.stringify(draftContent, null, 2) },
      { name: 'draft_meta_info.json', data: JSON.stringify(meta, null, 2) },
      { name: 'README.txt', data: `剪映导入包使用说明\n=====================\n1. 本包由 虎鲸漫剧导出,内含剪映草稿最小结构与分镜素材(已生成视频的镜为真实 mp4,未生成的为帧图 PNG)。\n2. 用法:把解压后的文件夹整个放入剪映草稿目录(Windows: 文档\\JianyingPro Drafts),在剪映草稿列表中打开。\n3. 分镜数:${ep.shots.length} · 总时长:${cursor}s · 导出时间:${Store.now()}\n` },
    ];
    for (let i = 0; i < ep.shots.length; i++) {
      const s = ep.shots[i];
      const vurl = Store.shotVideoReady(s) && s.video.url;
      if (vurl) {
        try {
          const buf = await (await fetch(vurl)).arrayBuffer(); // 真实成片 mp4 直接打包(同源 /uploads 路径)
          files.push({ name: `materials/shot_${i + 1}.mp4`, data: new Uint8Array(buf) });
          continue;
        } catch (_) { /* 拉取失败回退帧图 */ }
      }
      const img = (Store.shotVideoReady(s) && s.video.frame) || s.image || PH.shot(s.plot, s.order);
      files.push({ name: `materials/shot_${i + 1}.png`, data: await ZipUtil.dataURLtoBytes(img) });
    }
    const fname = `剪映导入包_${ep.title.replace(/[\\/:*?"<>|]/g, '_')}.zip`;
    const bytes = ZipUtil.create(files);
    // 转 dataURL 便于任务中心二次下载
    let bin = '';
    const CH = 0x8000;
    for (let i = 0; i < bytes.length; i += CH) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + CH));
    const dataURL = 'data:application/zip;base64,' + btoa(bin);
    U.downloadDataURL(fname, dataURL);
    U.toast(`剪映草稿已导出(${ep.shots.length} 镜,含 ${files.length} 个文件)`, 'success', 3000);
    // M7 修复:不把 zip dataURL 塞进 state.tasks,二次下载按 regenType 重生成
    return { filename: fname, regenType: 'jianying' };
  }

  /* ================= 分镜表 CSV 导入/导出 ================= */
  const CSV_HEADERS = ['镜头号', '镜头名称', '剧情内容', '运镜', '机位视角', '机位角度', '景别', '光圈', '旁白', '台词', '出场人物', '出场场景', '出场物品', '图片提示词', '视频提示词', '时长秒'];

  function shotToCSVRow(s, i) {
    const cs = s.cameraSpec || {};
    return [i + 1, s.name || '', s.plot || '', s.camera || '', cs.view || '', cs.angle || '', cs.shotSize || '', cs.aperture || '',
      s.narration || '', (s.dialogue || '').replace(/^[“"]|[”"]$/g, ''), (s.characters || []).join('、'), s.scene || '', (s.props || []).join('、'),
      s.imagePrompt || '', s.prompt || '', (window.SB && SB.estShotDuration ? SB.estShotDuration(s) : (s.duration || 5))];
  }

  function exportShotCSV(p, ep) {
    if (!ep.shots.length) return U.toast('暂无分镜可导出', 'error');
    const rows = [CSV_HEADERS].concat(ep.shots.map((s, i) => shotToCSVRow(s, i)));
    const csv = U.toCSV(rows);
    const fname = `分镜表_${p.name}_${ep.title}.csv`;
    U.downloadText(fname, csv);
    const tk = Tasks.start({ type: '导出分镜表', model: '本地CSV', target: ep.title, projectId: p.id, episodeId: ep.id });
    Tasks.done(tk, { filename: fname, text: csv });
    U.toast(`分镜表已导出(${ep.shots.length} 行,UTF-8 带 BOM,可直接用 Excel 编辑)`, 'success', 3000);
  }

  function csvTemplate() {
    return U.toCSV([
      CSV_HEADERS,
      ['# 列说明:运镜可选 固定镜头/推/拉/摇/移/跟/环绕/俯拍/仰拍/特写;机位视角 正面/侧面/背面;机位角度 仰拍/平视/俯拍/高角度;景别 特写/近景/中景/全景;光圈 ƒ/1.4~ƒ/11;出场人物/物品用「、」分隔;提示词列有内容则导入后直接使用(不再自动生成)'],
      [1, '示例镜头', '林雪走进深夜咖啡馆,与陈风对峙', '推镜头', '正面', '平视', '中景', 'ƒ/4', '雨夜,旧账该算了', '你来了', '林雪、陈风', '深夜咖啡馆', '青铜钥匙', '漫剧风格,深夜咖啡馆内景,暖黄灯光', '漫剧风格,推镜头,林雪与陈风对峙,冷色调', 5],
    ]);
  }

  function openImportCSV(p, ep, main) {
    let rows = null, usePrompts = true, warned = false, fname = '';
    U.openModal({
      title: '上传分镜表(CSV)',
      wide: true,
      body: `
      <div class="row" style="justify-content:space-between;margin-bottom:10px">
        <div class="dropzone" data-x="file" style="flex:1;padding:14px">点击选择 CSV 文件(支持 UTF-8/GBK,引号转义与内嵌换行)</div>
        <button class="btn sm" data-x="tpl" style="margin-left:10px">⬇ 下载空白模板</button>
      </div>
      <div data-preview></div>
      <div class="check-line" data-x="usep" style="margin-top:10px"><span class="checkbox on">✓</span><span>使用分镜表中的提示词(图片/视频提示词列有内容的分镜直接采用,不再自动生成;关闭或字段为空则留待后续 LLM 生成)</span></div>
      <div class="check-line" data-x="warn" style="margin-top:6px;color:var(--red)"><span class="checkbox"></span><span><b>⚠ 我已知晓:导入将覆盖当前分集所有分镜,且不可找回</b></span></div>`,
      footer: `<button class="btn" data-x="cancel">取消</button><button class="btn primary" data-x="ok" disabled>确认导入(-2积分)</button>`,
      onMount(m, close) {
        m.querySelector('[data-x=tpl]').onclick = () => {
          U.downloadText('分镜表模板.csv', csvTemplate());
          U.toast('模板已下载(含一行示例)', 'success');
        };
        m.querySelector('[data-x=usep]').onclick = () => {
          usePrompts = !usePrompts;
          const cb = m.querySelector('[data-x=usep] .checkbox');
          cb.classList.toggle('on', usePrompts); cb.textContent = usePrompts ? '✓' : '';
        };
        m.querySelector('[data-x=warn]').onclick = () => {
          warned = !warned;
          const cb = m.querySelector('[data-x=warn] .checkbox');
          cb.classList.toggle('on', warned); cb.textContent = warned ? '✓' : '';
        };
        m.querySelector('[data-x=file]').onclick = async () => {
          const f = await U.readFile('.csv,.txt,text/csv,text/plain', false);
          if (!f) return;
          fname = f.name;
          const parsed = U.parseCSV(f.data);
          // 跳过表头行与注释行
          rows = parsed.filter((r, i) => !(i === 0 && String(r[0]).trim() === '镜头号') && !String(r[0]).trim().startsWith('#'));
          rows = rows.filter(r => r.length >= 3 && String(r[2] || r[1] || '').trim());
          m.querySelector('[data-x=file]').textContent = `已选择:${f.name}(${parsed.length} 行)`;
          m.querySelector('[data-preview]').innerHTML = rows.length ? `
            <div class="card" style="padding:10px 12px;margin-top:10px">
              <b class="small">解析到 ${rows.length} 个分镜,预览前 3 行:</b>
              <table class="tbl" style="margin-top:8px"><thead><tr><th>#</th><th>剧情内容</th><th>运镜</th><th>视频提示词</th></tr></thead><tbody>
                ${rows.slice(0, 3).map((r, i) => `<tr><td>${i + 1}</td><td class="small">${U.esc(String(r[2] || '').slice(0, 30))}</td><td class="small">${U.esc(r[3] || '')}</td><td class="small">${U.esc(String(r[14] || '').slice(0, 24)) || '<span class="muted">(空,待生成)</span>'}</td></tr>`).join('')}
              </tbody></table>
            </div>` : '<div class="hint" style="margin-top:10px;color:var(--red)">未解析到有效数据行,请检查 CSV 格式(可下载空白模板对照)</div>';
          m.querySelector('[data-x=ok]').disabled = !rows.length;
        };
        m.querySelector('[data-x=cancel]').onclick = close;
        m.querySelector('[data-x=ok]').onclick = () => {
          if (!rows || !rows.length) return;
          if (!warned) return U.toast('请先勾选知晓「覆盖不可找回」警告', 'error');
          const tk = Tasks.start({ type: '导入分镜表', model: 'CSV·' + fname, target: ep.title, cost: 2, projectId: p.id, episodeId: ep.id });
          if (!U.charge(2, `导入分镜表(${ep.title},${rows.length}行)`)) { Tasks.fail(tk, '积分不足'); return; }
          const VIEWS = ['正面', '侧面', '背面'], ANGLES = ['仰拍', '平视', '俯拍', '高角度'], SIZES = ['特写', '近景', '中景', '全景'];
          const newShots = rows.map((r, i) => {
            const ns = blankShot(i, ep.sbConfig);
            ns.name = String(r[1] || '').trim();
            ns.plot = String(r[2] || '').trim() || String(r[1] || '').trim();
            const cam = String(r[3] || '').trim();
            if (cam) ns.camera = cam;
            const view = String(r[4] || '').trim(), ang = String(r[5] || '').trim(), size = String(r[6] || '').trim(), ap = String(r[7] || '').trim();
            ns.cameraSpec = {
              view: VIEWS.includes(view) ? view : '正面',
              angle: ANGLES.includes(ang) ? ang : '平视',
              shotSize: SIZES.includes(size) ? size : '中景',
              aperture: ap || 'ƒ/4',
            };
            ns.narration = String(r[8] || '').trim();
            ns.dialogue = String(r[9] || '').trim() ? '“' + String(r[9]).trim() + '”' : '';
            ns.characters = String(r[10] || '').split(/[、,，]/).map(x => x.trim()).filter(Boolean).slice(0, 3);
            ns.scene = String(r[11] || '').trim();
            ns.props = String(r[12] || '').split(/[、,，]/).map(x => x.trim()).filter(Boolean).slice(0, 2);
            ns.imagePrompt = String(r[13] || '').trim();
            const vp = String(r[14] || '').trim();
            ns.prompt = (usePrompts && vp) ? vp : '';
            ns.duration = Math.max(1, Math.min(60, parseInt(r[15], 10) || 5));
            ns.history = [{ type: '导入分镜表', model: fname, time: Store.now() }];
            return ns;
          });
          ep.shots = newShots;
          ep.uiSel = newShots[0] ? newShots[0].id : null;
          ep.composed = false;
          ep.lastReview = null; // 整表覆盖:旧审片报告的 shotId 全部失效,口径同 beatsToShots/sb-batch 全删路径
          ep.shotsSourceRev = ep.contentRev || 0; // 记录分镜对应的剧本版本(剧本修改后判旧)
          ep.shotsGraphRev = ep.graphRev || 0;    // 记录分镜对应的事件图谱版本(图谱修订后判旧)
          Store.save();
          Tasks.done(tk);
          close();
          U.toast(`已导入 ${newShots.length} 个分镜${usePrompts ? '(提示词按表采用)' : '(提示词留待生成)'}`, 'success', 3000);
          renderShots(main, p, ep);
        };
      },
    });
  }

  /* ================= 导入分镜(本地上传 / 资产库导入) ================= */
  function openImportLocal(p, ep, main) {
    U.openModal({
      title: '导入分镜 · 本地上传',
      wide: true,
      body: `
      <div class="hint" style="margin-bottom:10px">粘贴分镜文本(每行/每段一个分镜),或上传 txt/doc/docx/pdf 文件自动解析。格式支持「剧情|运镜」竖线分隔。</div>
      <textarea class="input" data-f="txt" rows="8" placeholder="林雪走进咖啡馆|推镜头&#10;陈风说道:你来了|固定镜头"></textarea>
      <div class="row" style="margin-top:10px;justify-content:space-between">
        <button class="btn sm" data-x="file">⬆ 上传剧本文件(txt/doc/docx/pdf)</button>
        <span class="small muted" data-cnt>0 段</span>
      </div>`,
      footer: `<button class="btn" data-x="cancel">取消</button><button class="btn primary" data-x="ok">解析并导入</button>`,
      onMount(m, close) {
        const ta = m.querySelector('[data-f=txt]');
        ta.oninput = () => m.querySelector('[data-cnt]').textContent = ta.value.split(/\n+/).filter(x => x.trim()).length + ' 段';
        m.querySelector('[data-x=file]').onclick = async () => {
          const btn = m.querySelector('[data-x=file]');
          btn.disabled = true; btn.innerHTML = '<span class="spinner"></span> 解析中…';
          const r = await U.readScriptFile((x, n) => btn.textContent = `解析 PDF ${x}/${n} 页…`);
          btn.disabled = false; btn.textContent = '⬆ 上传剧本文件(txt/doc/docx/pdf)';
          if (r && !r.error) { ta.value = r.text.slice(0, 20000); ta.dispatchEvent(new Event('input')); U.toast('文件已解析', 'success'); }
          else if (r && r.error) U.toast(r.error, 'error');
        };
        m.querySelector('[data-x=cancel]').onclick = close;
        m.querySelector('[data-x=ok]').onclick = () => {
          const lines = ta.value.split(/\n+/).map(x => x.trim()).filter(Boolean);
          if (!lines.length) return U.toast('请先粘贴或上传分镜文本', 'error');
          lines.forEach(line => {
            const [plot, cam] = line.split('|').map(x => x && x.trim());
            const ns = blankShot(ep.shots.length, ep.sbConfig);
            ns.plot = (plot || line).slice(0, 120);
            if (cam && CAMERAS.includes(cam)) ns.camera = cam;
            const dq = ns.plot.match(/([一-龥]{2,4})[:：]([^。!?\n]{2,40})/);
            if (dq) ns.dialogue = '“' + dq[2] + '”';
            ns.prompt = `${styleOf(p)}风格,${ns.camera},${ns.plot.slice(0, 40)}`;
            ns.history = [{ type: '导入分镜', model: '本地上传', time: Store.now() }];
            ep.shots.push(ns);
          });
          ep.shots.forEach((x, i) => x.order = i);
          ep.composed = false;
          // 追加导入同样把分镜表对齐到当前剧本/图谱版本(剧本或图谱修改后判旧)
          ep.shotsSourceRev = ep.contentRev || 0;
          ep.shotsGraphRev = ep.graphRev || 0;
          Store.save(); close();
          U.toast(`已导入 ${lines.length} 个分镜`, 'success');
          renderShots(main, p, ep);
        };
      },
    });
  }

  function openImportAssets(p, ep, main) {
    const assets = Store.myAssets().filter(a => a.image);
    U.openModal({
      title: '导入分镜 · 资产库导入',
      wide: true,
      body: assets.length ? `
      <div class="hint" style="margin-bottom:10px">点击资产图片,以其画面与提示词创建新分镜(可多选)。</div>
      <div class="grid subj-grid" style="max-height:50vh;overflow-y:auto">
        ${assets.map(a => `
        <div class="card subj-card" data-as="${a.id}" style="cursor:pointer">
          <div class="imgbox" style="height:100px"><img src="${a.image}"></div>
          <div class="small" style="margin-top:5px">${U.esc(a.name)} <span class="tag">${U.esc(a.kind)}</span></div>
        </div>`).join('')}
      </div>` : '<div class="empty"><div class="ico">🗂️</div><p>资产库暂无带图资产,请先在角色页或选帧入库保存图片资产</p></div>',
      footer: `<button class="btn primary" data-x="ok">完成</button>`,
      onMount(m, close) {
        let n = 0;
        m.querySelectorAll('[data-as]').forEach(c => c.onclick = () => {
          const a = assets.find(x => x.id === c.dataset.as);
          const ns = blankShot(ep.shots.length, ep.sbConfig);
          ns.plot = a.name;
          ns.prompt = a.prompt || `${styleOf(p)}风格,${a.name}`;
          ns.image = a.image;
          ns.history = [{ type: '导入分镜', model: '资产库导入', time: Store.now() }];
          ep.shots.push(ns);
          ep.shots.forEach((x, i) => x.order = i);
          ep.composed = false;
          // 追加导入同样把分镜表对齐到当前剧本/图谱版本(剧本或图谱修改后判旧)
          ep.shotsSourceRev = ep.contentRev || 0;
          ep.shotsGraphRev = ep.graphRev || 0;
          Store.save();
          c.style.borderColor = 'var(--green)';
          n++;
          U.toast(`已导入「${a.name}」为分镜(第 ${n} 个)`, 'success', 1200);
        });
        m.querySelector('[data-x=ok]').onclick = () => { close(); renderShots(main, p, ep); };
      },
    });
  }

  /* ================= 预览长视频(对齐 预览长视频.png:左胶片列+播放器) ================= */
  function openPlayer(p, ep, autoplay) {
    const playable = ep.shots.filter(s => Store.shotVideoReady(s) || s.image); // 统一就绪判定:在线时模拟占位按分镜图预览
    if (!playable.length) return U.toast('暂无可预览的分镜画面', 'error');
    let idx = 0, playing = false, timer = null;
    U.openModal({
      title: '预览长视频',
      xl: true,
      body: `
      <div class="row" style="gap:14px;align-items:flex-start">
        <div data-filmcol style="width:130px;flex:none;max-height:52vh;overflow-y:auto;display:flex;flex-direction:column;gap:8px">
          ${playable.map((s, i) => {
            const f = (Store.shotVideoReady(s) && s.video.frame) || s.image;
            return `<div class="ws-thumb" data-film="${i}" style="width:100%">
              <div class="ws-thumb-img" style="aspect-ratio:16/9">${f ? `<img src="${f}">` : '<div class="ws-thumb-empty">无画面</div>'}</div>
              <div class="ws-thumb-name">${i + 1}. ${U.esc((s.name || s.plot || '').slice(0, 8))}</div>
            </div>`;
          }).join('')}
        </div>
        <div class="grow">
          <div class="player-stage">
            <div data-mediaslot style="position:absolute;inset:0"></div>
            <div class="scan" style="position:absolute;inset:0;pointer-events:none;background:repeating-linear-gradient(0deg,transparent 0 3px,rgba(0,0,0,.15) 3px 4px)"></div>
            <div class="badge" style="position:absolute;top:10px;left:10px;font-size:11px;padding:3px 9px;border-radius:6px;background:rgba(0,0,0,.6);color:#9be8f5;pointer-events:none" data-info></div>
            ${ep.sbConfig.subtitle ? `<div style="position:absolute;bottom:14px;left:0;right:0;text-align:center;color:#fff;text-shadow:0 1px 4px #000;font-size:15px;padding:0 20px;pointer-events:none" data-sub></div>` : ''}
          </div>
          <div class="player-bar">
            <button class="btn sm" data-x="play">▶ 播放</button>
            <input type="range" min="0" max="${playable.length - 1}" value="0" data-seek>
            <span class="small muted" data-pos>1 / ${playable.length}</span>
          </div>
          <div class="row" style="justify-content:center;gap:10px;margin-top:10px">
            <button class="btn" data-x="playall">⏵ 从头连看</button>
            <button class="btn primary" data-x="compose2">🎞 合成成片</button>
          </div>
        </div>
      </div>`,
      onClose() { playing = false; clearTimeout(timer); },
      onMount(m, close) {
        const info = m.querySelector('[data-info]'), sub = m.querySelector('[data-sub]'),
          pos = m.querySelector('[data-pos]'), slot = m.querySelector('[data-mediaslot]'),
          seek = m.querySelector('[data-seek]'), playBtn = m.querySelector('[data-x=play]');
        const vurlOf = s => Store.shotVideoReady(s) && s.video.url ? s.video.url : null;
        const frameOf = s => (Store.shotVideoReady(s) && s.video.frame) || s.image;
        const posterOf = f => f && (f.startsWith('/uploads/') || f.startsWith('data:image/jpeg')) ? f : ''; // PH 占位不作 poster
        const curVideo = () => slot.querySelector('video');
        function show(i) {
          idx = i;
          const s = playable[i];
          const vurl = vurlOf(s);
          const f = frameOf(s);
          // 有真实成片地址则播视频(播完自动切下一镜),否则静帧 1.6s 步进
          slot.innerHTML = vurl
            ? `<video src="${vurl}"${posterOf(f) ? ` poster="${posterOf(f)}"` : ''} controls style="position:absolute;inset:0;width:100%;height:100%;object-fit:contain;background:#000"></video>`
            : `<img src="${f}" style="position:absolute;inset:0;width:100%;height:100%;object-fit:contain">`;
          const v = curVideo();
          if (v) {
            v.onended = () => { if (playing) tick(); };
            if (playing) v.play().catch(() => {});
          }
          info.textContent = `镜头 ${s.order + 1} · ${s.camera}${s.transition ? ' · ⤳' + s.transition : ''}`;
          if (sub) sub.textContent = s.dialogue || s.narration || '';
          pos.textContent = (i + 1) + ' / ' + playable.length;
          seek.value = i;
          m.querySelectorAll('[data-film]').forEach(f2 => f2.classList.toggle('sel', +f2.dataset.film === i));
        }
        function tick() {
          if (!playing) return;
          if (idx + 1 >= playable.length) { playing = false; playBtn.textContent = '▶ 播放'; return; }
          show(idx + 1);
          if (!curVideo()) timer = setTimeout(tick, 1600); // 静帧走定时器;视频走 onended
        }
        playBtn.onclick = () => {
          playing = !playing;
          playBtn.textContent = playing ? '⏸ 暂停' : '▶ 播放';
          const v = curVideo();
          if (v) { playing ? v.play().catch(() => {}) : v.pause(); return; }
          if (playing) { if (idx >= playable.length - 1) show(0); tick(); }
        };
        seek.oninput = () => { playing = false; playBtn.textContent = '▶ 播放'; show(+seek.value); };
        m.querySelectorAll('[data-film]').forEach(f2 => f2.onclick = () => { playing = false; playBtn.textContent = '▶ 播放'; show(+f2.dataset.film); });
        m.querySelector('[data-x=playall]').onclick = () => {
          show(0); playing = true; playBtn.textContent = '⏸ 暂停';
          if (!curVideo()) tick(); // 静帧起步;视频在 show() 里已自动播
        };
        m.querySelector('[data-x=compose2]').onclick = () => { close(); Commands.execute('episode.compose', { pid: p.id, epid: ep.id, main: document.getElementById('main'), ui: true }).then(r => Commands.digest(r)); }; // 统一命令层(ui 模式)
        show(0);
        if (autoplay) { playing = true; playBtn.textContent = '⏸ 暂停'; if (!curVideo()) tick(); }
      },
    });
  }

  /* ================= 合成成片(素材不齐时二次确认,对齐 合成长视频.png) ================= */
  /* 失败节点阻塞合成:本集存在失败镜头时弹窗阻塞,须重新生成成功(或移除)后才能合成;
   * 「去处理」跳回分镜工作区并定位第一个失败镜。返回 true=无失败镜可继续。
   * quiet(跑批)模式:不弹窗不跳转(detached sink 上弹窗会拽走用户/无人渲染),由调用方记录失败原因 */
  function guardFailedShots(p, ep, main, quiet) {
    const failed = ep.shots.filter(s => s.video && s.video.status === 'failed');
    if (!failed.length) return true;
    if (quiet) return false;
    U.openModal({
      title: '存在失败镜头,无法合成',
      body: `
      <div style="margin-bottom:10px;line-height:1.8">存在 <b style="color:var(--red)">${failed.length}</b> 个失败镜头,须重新生成成功(或移除)后才能合成成片。</div>
      ${failed.map(s => `
      <div class="row" style="gap:10px;align-items:center;padding:7px 10px;border:1px solid var(--border2);border-radius:10px;margin-bottom:6px">
        <span class="tag cyan" style="flex:none">镜头 ${s.order + 1}</span>
        <span class="small grow" style="line-height:1.5">${U.esc((s.plot || '(未填写剧情)').slice(0, 50))}</span>
        <span class="tag" style="flex:none;color:var(--red)">✗ 失败</span>
      </div>`).join('')}`,
      footer: `<button class="btn" data-x="cancel">取消</button><button class="btn primary" data-x="go">去处理</button>`,
      onMount(m, close) {
        m.querySelector('[data-x=cancel]').onclick = close;
        m.querySelector('[data-x=go]').onclick = () => {
          close();
          ep.uiSel = failed[0].id; // 定位第一个失败镜
          Store.save();
          if (main && main.isConnected && location.hash.indexOf(p.id + '/episode/' + ep.id) >= 0) Views.episode(main, p.id, ep.id);
          else location.hash = '#/project/' + p.id + '/episode/' + ep.id;
        };
      },
    });
    return false;
  }

  /* ================= SRT 软字幕(P1-6:合成时按时间轴同步产出,导出菜单另存) =================
   * 与 doCompose items 同源:每段时长现取 Store.segDurationOf(口径下沉 domain.js,字幕质检同用一份);
   * 转场 xfade 重叠由服务端定,客户端字幕按硬切时间轴近似(逐段对齐,误差 ≤ 转场时长);空文本段占时长但不出条目 */
  function srtTime(sec) {
    const ms = Math.max(0, Math.round(sec * 1000));
    const h = String(Math.floor(ms / 3600000)).padStart(2, '0');
    const m = String(Math.floor((ms % 3600000) / 60000)).padStart(2, '0');
    const s = String(Math.floor((ms % 60000) / 1000)).padStart(2, '0');
    return `${h}:${m}:${s},${String(ms % 1000).padStart(3, '0')}`;
  }
  function buildSrt(segs) { // segs:[{text,dur}] 全量时间轴段(与合成 items 同序)
    let t = 0, n = 0; const out = [];
    (segs || []).forEach(sg => {
      const start = t; t += Math.max(0, sg.dur || 0);
      const txt = String(sg.text || '').trim();
      if (!txt) return;
      out.push(`${++n}\n${srtTime(start)} --> ${srtTime(t)}\n${txt}\n`);
    });
    return out.join('\n');
  }

  function composeVideo(p, ep, main, opts) {
    if (!ep.shots.length) return U.toast('暂无分镜', 'error');
    const quiet = opts && opts.quiet;
    if (!guardFailedShots(p, ep, main, quiet)) return; // 失败镜头阻塞合成(先于素材不齐确认;quiet 不弹窗不跳转)
    const ready = ep.shots.filter(s => Store.shotVideoReady(s)); // 统一就绪判定:在线时 simulated 占位不算已生成(以分镜图代替,不进真实成片)
    if (!quiet && ready.length < ep.shots.length) {
      return U.confirm(`共 ${ep.shots.length} 个分镜,仅 ${ready.length} 个已生成视频。未生成(含离线模拟占位)的分镜将使用分镜图代替,确定合成吗?`, () => doCompose(p, ep, main, opts), '仍要合成');
    }
    doCompose(p, ep, main, opts);
  }

  async function doCompose(p, ep, main, opts) {
    const quiet = opts && opts.quiet;
    if (!guardFailedShots(p, ep, main, quiet)) return; // 失败镜头阻塞合成(覆盖时间线编辑器等直接调 doCompose 的入口,在扣费前拦截)
    // 未生成(none/generating/离线模拟占位)镜头维持原语义:以分镜图代替/无素材则跳过;quiet 模式无前置确认弹窗,toast 提示
    const notReady = ep.shots.filter(s => !Store.shotVideoReady(s));
    if (quiet && notReady.length) U.toast(`${notReady.length} 个未生成(含离线模拟)镜头将以分镜图代替(无素材的跳过)`, 'info', 3000);
    const tk = Tasks.start({ type: '合成成片', model: '本地合成', target: ep.title, cost: COST.compose, projectId: p.id, episodeId: ep.id });
    if (opts && opts.onTask) opts.onTask(tk); // 跑批轮询句柄:调用方据此等待本次任务(而非按 episodeId 误抓旧任务)
    if (!U.charge(COST.compose, '合成成片(' + ep.title + ')')) { Tasks.fail(tk, '积分不足'); return; }
    // 真实合成:服务端 FFmpeg(逐段规格化 → 拼接 → 字幕烧录),素材须为 /uploads/ 路径(占位 dataURL 先上传)
    const hasMaterial = ep.shots.some(s => (Store.shotVideoReady(s) && s.video.url) || s.image);    // 在线但零素材:退费置失败并提示,不落离线占位分支(占位仅 !Media.isReady() 时进入)
    if (window.Media && Media.isReady() && !hasMaterial) {
      U.refund(COST.compose, '合成成片:无可合成素材');
      Tasks.fail(tk, '无可合成素材');
      U.toast('暂无可合成素材,请先生成分镜图/视频素材', 'error', 3500);
      return;
    }
    if (window.Media && Media.isReady() && hasMaterial) {
      // 后台任务侧边栏:合成期间页面可操作,可最小化
      const dock = U.bgDock({ title: `🎞 合成成片 · ${ep.title}` });
      dock.say('⏳ 收集分镜素材(占位图上传服务端)…');
      if (window.Bus) Bus.emit('compose.start', { p, ep, main, subtitle: !!ep.sbConfig.subtitle, brief: `开始合成「${ep.title}」成片` }); // 事件总线:Agent 对话流订阅转译
      try {
        const items = [];
        const srtSegs = []; // SRT 软字幕时间轴(与 items 同序同段;文本取旁白+台词,与字幕烧录开关无关)
        // 八轮:合成序列与就绪指纹同源——缺省走 Store.composeSeqOf(canonical 时间线快照:tlOrder 定序/
        // tlTrims 剔除裁剪),时间线编辑器不再自拼 shotsOverride,消除"合成序列与指纹口径分裂"
        const shotList = (opts && opts.shotsOverride) || Store.composeSeqOf(ep);
        let itemIdx = 0;
        for (const s of shotList) {
          const it = { text: ep.sbConfig.subtitle ? String(s.dialogue || s.narration || '').slice(0, Store.SUB_BURN_MAX) : '' };
          let segDur = 0; // 该段在成片时间轴上的时长(SRT 用)
          if (s.audioUrl) it.audio = s.audioUrl; // 逐镜 TTS 配音混入成片音轨
          // 真实转场(2026-08 六轮):转场记在后一镜 s.transition(该镜与前一镜之间),随段传给服务端 xfade/acrossfade
          if (itemIdx > 0 && s.transition) it.transition = { type: String(s.transition).slice(0, 12) };
          if (Store.shotVideoReady(s) && s.video.url) { // 统一就绪判定:模拟占位镜走分镜图分支
            it.video = s.video.url;
            if (typeof s._tlStart === 'number') it.start = s._tlStart; // 时间线裁剪:入点
            if (typeof s._tlEnd === 'number') it.end = s._tlEnd;       // 时间线裁剪:出点
            segDur = Store.segDurationOf(s, true);
          }
          else if (s.image) {
            let img = s.image;
            if (img.startsWith('data:')) { // 占位/截帧 dataURL 先传服务端
              const ext = img.startsWith('data:image/jpeg') ? '.jpg' : '.png';
              img = await U.uploadData('shot_' + (s.order + 1) + ext, img);
            }
            if (!img) continue;
            it.image = img;
            it.dur = Store.segDurationOf(s, false);
            segDur = it.dur;
          } else continue; // 该镜无任何素材,跳过
          items.push(it);
          srtSegs.push({ text: String(s.dialogue || s.narration || '').trim(), dur: segDur });
          itemIdx++;
        }
        if (!items.length) throw new Error('没有可合成的素材(分镜图/视频需先生成)');
        dock.say(`⏳ 逐段规格化 → 拼接 ${items.length} 段${ep.sbConfig.subtitle ? ' → 字幕烧录' : ''}(FFmpeg 处理中,数分钟)…`);
        const r = await Media.ffCompose(items, ep.sbConfig.ratio || '16:9', !!ep.sbConfig.subtitle, 'ff.compose', tk.id);
        // 不支持的转场类型已降级为硬切:如实提示,不静默忽略
        if (r.transitions && Array.isArray(r.transitions.degraded) && r.transitions.degraded.length) {
          U.toast(`以下转场暂不支持真实渲染,已降级为硬切:${r.transitions.degraded.map(d => '镜头' + (d.index + 1) + '·' + d.type).join('、')}`, 'info', 5000);
        }
        if (dock.cancelled) { /* 用户关闭了面板:任务已完成,照常落库 */ }
        dock.finish(`<b style="color:var(--green)">✓ 合成完成(${r.count} 段)${buildSrt(srtSegs) ? ' · 字幕 SRT 已同步产出' : ''}</b>`);
        if (window.Bus) Bus.emit('compose.done', { p, ep, main, count: r.count || 0, brief: `「${ep.title}」合成完成(${r.count} 镜)` }); // 事件总线:Agent 对话流事件续谈卡(未审片优先审片)
        ep.composed = true;
        delete ep.composedSimulated; // 真实合成成功:显式清除旧离线模拟标记,避免永久被判为模拟
        ep.composedAt = Store.now();
        ep.composedUrl = r.url; // 真实成片(服务端 mp4)
        ep.composedSrt = buildSrt(srtSegs) || null; // SRT 软字幕与成片同时间轴同步产出(导出▾「导出字幕 SRT」;无对白/旁白则为 null)
        ep.composedVia = 'shots'; // 来源轨:分镜合成(成片库据此标「分镜表」)
        ep.composedInputHash = Store.composedInputHash(ep); // 七轮:记录合成输入指纹,之后调序/裁剪/换素材/改转场 → 自动失效
        ep.composedDialogueSig = Store.composedDialogueSig(ep); // 二十三轮:记录字幕文本/时长指纹,之后改台词/旁白 → 成片判未就绪
        ep.composedSourceRev = ep.contentRev || 0; // 十轮:记录合成时的剧本版本(剧本修改后提示重合成)
        ep.composedGraphRev = ep.graphRev || 0;    // 十二轮:记录合成时的图谱版本(图谱修订后判旧)
        Store.save();
        Tasks.done(tk, { filename: `${p.name}_${ep.title}_成片.mp4`, dataURL: r.url });
        if (quiet) { U.toast(`「${ep.title}」合成完成`, 'success'); return; }
        U.openModal({
          title: '🎉 合成成功',
          body: `<p style="line-height:2">长视频「${U.esc(p.name)} · ${U.esc(ep.title)}」已合成完成!<br><span class="muted small">共 ${r.count} 个镜头 · 已归档至成片库</span></p>
            <video src="${r.url}" controls style="width:100%;border-radius:10px;margin-top:6px"></video>`,
          footer: `<button class="btn" data-x="close">关闭</button><button class="btn" data-x="dlv">⬇ 下载成片 mp4</button><button class="btn primary" data-x="export">⬇ 更多导出</button>`,
          onMount(m, close) {
            m.querySelector('[data-x=close]').onclick = close;
            m.querySelector('[data-x=dlv]').onclick = () => {
              U.downloadDataURL(`${p.name}_${ep.title}_成片.mp4`, r.url);
              U.toast('成片已开始下载', 'success');
            };
            m.querySelector('[data-x=export]').onclick = e => Exporter.dropdown(e.target, { p, ep });
          },
        });
        Views.episode(main, p.id, ep.id);
        return;
      } catch (e) {
        /* 十六轮 合成超时语义:前端 600s 超时但服务端可能仍在合成(结果已落服务端日志,7 天可领取)——
         * 与真实失败区分提示:退费镜像照常发起(服务端已交付会拒退并按服务端余额回写本地),
         * 任务保留计费键(tk.id),用户可稍后在「任务中心」⇩ 领取结果 */
        const recoverable = !!(e && e.__recoverable);
        const tail = recoverable ? '服务端可能仍在合成:若未交付将自动退费,若已交付可到「任务中心」⇩ 领取结果' : '积分已自动返还';
        dock.finish(`<b style="color:var(--red)">✕ 合成失败:${U.esc(e.message)}(${tail})</b>`);
        if (window.Bus) Bus.emit('compose.failed', { p, ep, main, error: `${e.message}(${tail})`, brief: `「${ep.title}」合成失败` }); // 事件总线:Agent 对话流订阅转译
        U.refund(COST.compose, '合成成片失败', tk.id);
        Tasks.fail(tk, e.message);
        U.toast('合成失败:' + e.message + '(' + tail + ')', 'error', 4500);
        return;
      }
    }
    // 离线模式:占位合成(仅清单,无真实成片)
    U.runTask({
      title: '合成成片' + (quiet ? '(' + ep.title + ')' : ''),
      steps: [
        { label: '分镜序列校验', ms: 800 },
        { label: '转场渲染', ms: 1100 },
        { label: ep.sbConfig.subtitle ? '字幕烧录' : '音轨合成', ms: 900 },
        { label: '成片封装导出', ms: 1000 },
      ],
      onDone() {
        ep.composed = true;
        ep.composedSimulated = true; // 离线模拟合成标记:在线时不算"真实成片"(主线/跑批会要求重新合成)
        ep.composedAt = Store.now();
        ep.composedVia = 'shots'; // 来源轨:分镜合成(离线占位同样标注)
        Store.save();
        const lines = [
          '虎鲸漫剧 · 长视频合成清单',
          '======================================',
          '项目:' + p.name, '分集:' + ep.title, '风格:' + styleOf(p),
          '合成时间:' + ep.composedAt, '字幕:' + (ep.sbConfig.subtitle ? '已烧录' : '无'),
          '分镜数:' + ep.shots.length, '',
          ...ep.shots.map((s, i) => `${String(i + 1).padStart(2, '0')}. [${s.camera}] ${s.plot.slice(0, 40)}${s.transition ? '  ⤳转场:' + s.transition : ''}`),
          '', '讲好每一个故事! 🐋',
        ].join('\n');
        Tasks.done(tk, { filename: `${p.name}_${ep.title}_成片.txt`, text: lines });
        if (quiet) { U.toast(`「${ep.title}」合成完成`, 'success'); return; }
        U.openModal({
          title: '🎉 合成成功',
          body: `<p style="line-height:2">长视频「${U.esc(p.name)} · ${U.esc(ep.title)}」已合成完成!<br><span class="muted small">共 ${ep.shots.length} 个镜头 · 已归档至成片库(模拟)</span></p>`,
          footer: `<button class="btn" data-x="close">关闭</button><button class="btn" data-x="dl">下载清单 txt</button><button class="btn primary" data-x="export">⬇ 下载成片</button>`,
          onMount(m, close) {
            m.querySelector('[data-x=close]').onclick = close;
            m.querySelector('[data-x=dl]').onclick = () => {
              U.downloadText(`${p.name}_${ep.title}_成片.txt`, lines);
              U.toast('合成清单已下载', 'success');
            };
            // 去导出:真导出成片(HTML 播放器/剪映草稿/素材包)
            m.querySelector('[data-x=export]').onclick = e => Exporter.dropdown(e.target, { p, ep });
          },
        });
        Views.episode(main, p.id, ep.id);
      },
    });
  }

  /* 对外出口保持挂在 window.SB 上(exporter.js / 任务中心重下等引用不变) */
  Object.assign(window.SB, { exportJianYing, shotToCSVRow, CSV_HEADERS, exportShotCSV, openImportCSV, openImportLocal, openImportAssets, openPlayer, composeVideo, doCompose, buildSrt });
})();
