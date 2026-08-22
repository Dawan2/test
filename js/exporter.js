/* ============ exporter.js 统一导出下拉(成片/剪映草稿/批量素材) ============ */
(function () {
  const frameOf = s => (Store.shotVideoReady(s) && s.video.frame) || s.image || PH.shot(s.plot, s.order); // 统一就绪判定:在线时模拟占位帧不进导出

  /* /uploads/ 帧取回转 dataURL:导出 HTML 需内嵌图片,本地 file:// 打开才不裂图(失败保留原路径,在线打开仍可显示) */
  async function inlineFrame(img) {
    if (!img || !String(img).startsWith('/uploads/')) return img;
    try {
      const res = await fetch(img);
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const blob = await res.blob();
      return await new Promise((resolve, reject) => {
        const fr = new FileReader();
        fr.onload = () => resolve(fr.result);
        fr.onerror = () => reject(new Error('转 base64 失败'));
        fr.readAsDataURL(blob);
      });
    } catch (_) { return img; }
  }

  /* ================= 导出成片:自包含 HTML 播放器 ================= */
  async function buildFilmHTML(p, ep) {
    let convFail = 0;
    const shots = [];
    for (let i = 0; i < ep.shots.length; i++) {
      const s = ep.shots[i];
      const raw = frameOf(s);
      const img = await inlineFrame(raw);
      if (String(raw).startsWith('/uploads/') && img === raw) convFail++;
      shots.push({
        n: i + 1,
        name: s.name || (s.plot || '').slice(0, 12),
        img,
        sub: (s.dialogue || s.narration || ''),
        dur: (window.SB && SB.estShotDuration ? SB.estShotDuration(s) : (s.duration || 5)),
        camera: s.camera,
        real: String(raw).startsWith('/uploads/') || String(raw).startsWith('http'), // 以原始来源判定真实素材
      });
    }
    if (convFail > 0) U.toast(`${convFail} 个画面帧取回转码失败,将以服务端路径嵌入(离线打开时该镜可能裂图)`, 'info', 4000);
    const total = shots.reduce((a, s) => a + s.dur, 0);
    const list = shots.map(s => `【镜头 ${s.n}】${s.name} · ${s.camera} · ${s.dur}s · 字幕:${s.sub || '无'}${s.real ? ' · [真实素材]' : ''}`).join('\n');
    return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<title>成片 · ${esc(p.name)} ${esc(ep.title)} · 虎鲸漫剧</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{background:#0c0e13;color:#e8eaf0;font-family:"PingFang SC","Microsoft YaHei",sans-serif;display:flex;flex-direction:column;align-items:center;min-height:100vh;padding:24px}
h1{font-size:20px;margin-bottom:4px}
.sub{color:#9aa3b5;font-size:12px;margin-bottom:18px}
.stage{width:min(860px,94vw);aspect-ratio:16/9;background:#000;border-radius:14px;position:relative;overflow:hidden;border:1px solid #2a2f3d}
.stage img{width:100%;height:100%;object-fit:cover}
.scan{position:absolute;inset:0;background:repeating-linear-gradient(0deg,transparent 0 3px,rgba(0,0,0,.15) 3px 4px);pointer-events:none}
.cap{position:absolute;bottom:16px;left:0;right:0;text-align:center;color:#fff;text-shadow:0 1px 5px #000;font-size:17px;padding:0 30px;line-height:1.6}
.badge{position:absolute;top:10px;left:10px;font-size:11px;padding:3px 9px;border-radius:6px;background:rgba(0,0,0,.6);color:#9be8f5}
.bar{display:flex;align-items:center;gap:12px;width:min(860px,94vw);margin-top:14px}
button{background:#22d3ee;border:none;color:#04121a;font-weight:700;padding:8px 18px;border-radius:8px;cursor:pointer}
input[type=range]{flex:1;accent-color:#22d3ee}
.prog{height:6px;background:#1e222d;border-radius:4px;overflow:hidden;flex:1}
.prog i{display:block;height:100%;background:linear-gradient(90deg,#22d3ee,#6366f1);width:0%}
.strip{display:flex;gap:8px;margin-top:14px;width:min(860px,94vw);overflow-x:auto;padding-bottom:6px}
.thumb{flex:none;width:110px;cursor:pointer;opacity:.6;transition:.15s}
.thumb.on{opacity:1;outline:2px solid #22d3ee;border-radius:8px}
.thumb img{width:100%;aspect-ratio:16/9;object-fit:cover;border-radius:8px}
.thumb div{font-size:10px;color:#9aa3b5;margin-top:3px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.list{width:min(860px,94vw);margin-top:24px;background:#171a22;border:1px solid #2a2f3d;border-radius:12px;padding:16px 20px;font-size:13px;line-height:2;white-space:pre-wrap;color:#9aa3b5}
.brand{margin-top:18px;color:#5d6678;font-size:12px}
</style>
</head>
<body>
<h1>🐋 ${esc(p.name)} · ${esc(ep.title)}</h1>
<div class="sub">虎鲸漫剧 · 讲好每一个故事 · 共 ${shots.length} 镜 · 总时长 ${total}s · 导出时间 ${esc(Store.now())}</div>
<div class="stage">
  <img id="frame">
  <div class="scan"></div>
  <div class="badge" id="info"></div>
  <div class="cap" id="cap"></div>
</div>
<div class="bar">
  <button id="play">⏸ 暂停</button>
  <div class="prog"><i id="bar"></i></div>
  <span id="pos" style="font-size:12px;color:#9aa3b5"></span>
</div>
<div class="strip" id="strip"></div>
<div class="list" id="list">分镜清单
${esc(list)}</div>
<div class="brand">由 虎鲸漫剧导出 · 本文件自包含可离线播放</div>
<script>
const SHOTS=${JSON.stringify(shots).replace(/</g, '\\u003c')};
let i=0,playing=true,timer=null,elapsed=0;
const frame=document.getElementById('frame'),info=document.getElementById('info'),cap=document.getElementById('cap'),bar=document.getElementById('bar'),pos=document.getElementById('pos'),playBtn=document.getElementById('play'),strip=document.getElementById('strip');
SHOTS.forEach((s,k)=>{const d=document.createElement('div');d.className='thumb';d.innerHTML='<img src="'+s.img+'"><div>'+s.n+'. '+s.name+'</div>';d.onclick=()=>{show(k);};strip.appendChild(d);});
const totalDur=SHOTS.reduce((a,s)=>a+s.dur,0);
function show(k){i=k;elapsed=SHOTS.slice(0,k).reduce((a,s)=>a+s.dur,0);const s=SHOTS[i];frame.src=s.img;info.textContent='镜头 '+s.n+' · '+s.camera;cap.textContent=s.sub||'';pos.textContent=i+1+' / '+SHOTS.length;
[...strip.children].forEach((el,j)=>el.classList.toggle('on',j===i));strip.children[i]&&strip.children[i].scrollIntoView({behavior:'smooth',inline:'center'});}
function tick(){if(!playing)return;elapsed++;bar.style.width=(elapsed/totalDur*100)+'%';const acc=SHOTS.slice(0,i+1).reduce((a,s)=>a+s.dur,0);
if(elapsed>=acc){if(i+1>=SHOTS.length){playing=false;playBtn.textContent='↻ 重播';bar.style.width='100%';return;}show(i+1);}
timer=setTimeout(tick,1000);}
playBtn.onclick=()=>{playing=!playing;playBtn.textContent=playing?'⏸ 暂停':'▶ 播放';if(playing){if(i>=SHOTS.length-1&&elapsed>=totalDur)show(0);tick();}};
show(0);tick();
</script>
</body>
</html>`;
  }
  const esc = s => String(s == null ? '' : s).replace(/<\/script>/gi, '<\\/script>').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  async function exportFilm(p, ep, skipTask) {
    if (!ep.shots.length) return U.toast('暂无分镜', 'error');
    // 未出片/失败镜头如实统计提示(口径对齐合成路径的"N 个未生成镜头以分镜图代替";离线模拟在线时不算出片)
    const doneCnt = ep.shots.filter(s => s.video && Store.shotVideoReady(s)).length;
    const undone = ep.shots.length - doneCnt;
    if (undone > 0) U.toast(`${undone} 个镜头未出片,将以分镜图/占位图代替导出`, 'info', 3500);
    const html = await buildFilmHTML(p, ep);
    const fname = `成片_${p.name}_${ep.title}.html`;
    const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = fname;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 3000);
    if (!skipTask) {
      // 成片 HTML 可能数 MB:任务只存名称,二次下载时按 regenType 重新生成
      Tasks.run({ type: '导出成片', model: 'HTML播放器', target: ep.title, projectId: p.id, episodeId: ep.id },
        async () => ({ filename: fname, regenType: 'film' }));
    }
    U.toast('成片 HTML 播放器已导出(双击即可连播)', 'success', 3000);
  }

  /* ================= 批量导出素材 ZIP ================= */
  /* R7:首次导出与二次下载共用同一构建器(消除内容不一致) */
  async function buildMaterialFiles(p, ep) {
    const SB = window.SB;
    const files = [];
    for (let i = 0; i < ep.shots.length; i++) {
      const s = ep.shots[i];
      files.push({ name: `shot_${i + 1}.png`, data: await ZipUtil.dataURLtoBytes(frameOf(s)) });
      files.push({
        name: `shot_${i + 1}_提示词.txt`,
        data: `【镜头 ${i + 1}】${s.name || ''}\n剧情:${s.plot}\n运镜:${s.camera}${s.cameraSpec ? '\n机位:' + CAMERA.describe(s.cameraSpec) + (s.cameraSpec.aperture ? ' ' + s.cameraSpec.aperture : '') : ''}\n旁白:${s.narration || '无'}\n台词:${s.dialogue || '无'}\n视频提示词:${s.prompt}\n时长:${(window.SB && SB.estShotDuration ? SB.estShotDuration(s) : (s.duration || 5))}s`,
      });
    }
    files.push({ name: '分镜表.csv', data: U.toCSV([SB.CSV_HEADERS].concat(ep.shots.map((s, i) => SB.shotToCSVRow(s, i)))) });
    files.push({ name: 'README.txt', data: `素材包说明\n============\n项目:${p.name} · 分集:${ep.title}\n分镜数:${ep.shots.length}\n内容:shot_N.png 画面帧 / shot_N_提示词.txt 单镜提示词 / 分镜表.csv(可用 Excel 编辑后回导)\n导出时间:${Store.now()}\n由 虎鲸漫剧导出` });
    return files;
  }

  async function exportMaterials(p, ep) {
    if (!ep.shots.length) return U.toast('暂无分镜', 'error');
    const ok = await Tasks.run({ type: '批量导出素材', model: '本地ZIP', target: ep.title, cost: 2, actionName: `批量导出素材(${ep.title},${ep.shots.length}镜)`, projectId: p.id, episodeId: ep.id }, async () => {
      const files = await buildMaterialFiles(p, ep);
      const fname = `素材_${p.name}_${ep.title}.zip`;
      ZipUtil.download(fname, files);
      U.toast(`素材包已导出(${ep.shots.length} 镜 × (帧图+提示词) + 分镜表 CSV)`, 'success', 3000);
      return { filename: fname, regenType: 'materials' }; // 不存内容,二次下载重生成
    });
    return ok;
  }

  /* ================= 剪映草稿(收编到统一下拉) ================= */
  async function exportJianYing(p, ep) {
    // M7 修复:zip dataURL 可达数 MB,不塞 state.tasks,二次下载重生成
    return Tasks.run({ type: '导出剪映草稿', model: '本地ZIP', target: ep.title, cost: COST.jianying, actionName: '导出剪映草稿(' + ep.title + ')', projectId: p.id, episodeId: ep.id }, async () => {
      const out = await window.SB.exportJianYing(p, ep);
      return { filename: out.filename, regenType: 'jianying' };
    });
  }

  /* 任务中心二次下载:按类型重新生成(不占用 state 存大文件) */
  async function redownload(t) {
    const p = Store.getProject(t.projectId);
    const ep = p && (p.episodes || []).find(e => e.id === t.episodeId);
    if (!ep) return U.toast('原分集已不存在,无法重新生成', 'error');
    if (t.download.regenType === 'film') await exportFilm(p, ep, true);
    else if (t.download.regenType === 'materials') {
      const files = await buildMaterialFiles(p, ep);
      ZipUtil.download(t.download.filename, files);
    } else if (t.download.regenType === 'jianying') {
      await window.SB.exportJianYing(p, ep); // 重新生成并直接下载
    } else {
      U.toast('该任务无可用下载内容(旧版记录)', 'info', 3000);
    }
  }

  /* ================= 下拉组件 ================= */
  function dropdown(btn, { p, ep }) {
    document.querySelectorAll('.exp-menu').forEach(x => x.remove());
    const menu = document.createElement('div');
    menu.className = 'exp-menu';
    const items = [
      { ico: '🎬', name: '导出成片', sub: '智能成片并下载到本地(HTML 播放器)', tag: '免费', cls: 'green', run: () => exportFilm(p, ep) },
      { ico: '✂', name: '导出剪映草稿', sub: '智能剪辑成片并导出到剪映', tag: COST.jianying + ' 积分', cls: 'yellow', run: () => exportJianYing(p, ep) },
      { ico: '📦', name: '批量导出素材', sub: '导出全部分镜素材到本地(ZIP)', tag: '2 积分', cls: 'yellow', run: () => exportMaterials(p, ep) },
    ];
    menu.innerHTML = items.map((it, i) => `
      <div class="exp-item" data-i="${i}">
        <span class="exp-ico">${it.ico}</span>
        <div class="grow"><div class="exp-name">${it.name}</div><div class="exp-sub">${it.sub}</div></div>
        <span class="tag ${it.cls}">${it.tag}</span>
      </div>`).join('');
    document.body.appendChild(menu);
    const r = btn.getBoundingClientRect();
    menu.style.top = (r.bottom + 6) + 'px';
    menu.style.right = (window.innerWidth - r.right) + 'px';
    menu.querySelectorAll('[data-i]').forEach(el => el.onclick = () => {
      menu.remove();
      items[+el.dataset.i].run();
    });
    setTimeout(() => document.addEventListener('mousedown', function h(e) {
      if (!menu.contains(e.target) && e.target !== btn) { menu.remove(); document.removeEventListener('mousedown', h); }
    }), 10);
  }

  window.Exporter = { dropdown, exportJianYing, redownload }; // R11 收窄(exportFilm/exportMaterials 由 dropdown 内部调用)
})();
