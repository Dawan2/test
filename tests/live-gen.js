/* ============ tests/live-gen.js 真实生成链路验收(节拍板 + 镜头组) ============
 * ⚠ 警告:本脚本会真实调用火山引擎上游(生视频/LLM)并消耗 config.json 里配置的 key 额度!
 * 仅在需要验收真实生成链路时运行:node tests/live-gen.js
 * 覆盖:节拍板(AI拆解 → 单段生成 → 批量生成 → 五段合成成片,含磁盘文件校验)
 *       镜头组(自动分组 → 绑定资产 → 整组生成)
 * 全程走页面真实 UI 点击,state 落服务端,结束自动清理测试账号与生成产物。
 */
const PORT = 8141;
const BASE = `http://localhost:${PORT}`;
const CHROME = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const ROOT = require('path').join(__dirname, '..');
const { spawn } = require('child_process');
const fs = require('fs');
const sleep = ms => new Promise(r => setTimeout(r, ms));

const results = [];
function report(name, ok, detail) { results.push({ name, ok, detail: detail || '' }); console.log((ok ? 'PASS' : 'FAIL') + ' | ' + name + (detail ? ' | ' + String(detail).slice(0, 220) : '')); }

let server, chrome, uid, token;
const madeFiles = []; // 生成产物,结束清理
function cleanup() {
  try { chrome && chrome.kill('SIGKILL'); } catch (e) {}
  try { server && server.kill('SIGKILL'); } catch (e) {}
  if (uid) {
    const D = ROOT + '/data/';
    try { fs.writeFileSync(D + 'users.json', JSON.stringify(JSON.parse(fs.readFileSync(D + 'users.json', 'utf8')).filter(x => x.username !== '__live__'), null, 2)); } catch (e) {}
    try { fs.writeFileSync(D + 'sessions.json', JSON.stringify(JSON.parse(fs.readFileSync(D + 'sessions.json', 'utf8')).filter(t => t.userId !== uid), null, 2)); } catch (e) {}
    for (const f2 of ['states/' + uid + '.json', 'states/' + uid + '.json.bak']) { try { fs.unlinkSync(D + f2); } catch (e) {} }
    try { fs.rmSync(D + 'states/' + uid + '.history', { recursive: true }); } catch (e) {}
    try { fs.rmSync(D + 'usage/' + uid + '.jsonl'); } catch (e) {}
    try { fs.rmSync(ROOT + '/uploads/' + uid, { recursive: true }); } catch (e) {}
  }
  madeFiles.forEach(fp => { try { fs.unlinkSync(fp); } catch (e) {} });
  setTimeout(() => { try { fs.rmSync(ROOT + '/tests/.chrome-live', { recursive: true, force: true }); } catch (e) {} }, 1500);
}

// 真实测试图(上游要求参考图 ≥300px):用服务端自带 ffmpeg 生成 640x360 纯色 PNG
function makePng(fp, color) {
  require('child_process').execSync(`"${ROOT}\\bin\\ffmpeg.exe" -y -f lavfi -i color=c=${color}:s=640x360 -frames:v 1 "${fp}"`, { stdio: 'ignore' });
  return 'data:image/png;base64,' + fs.readFileSync(fp).toString('base64');
}

async function main() {
  server = spawn(process.execPath, [ROOT + '/server.js'], { env: Object.assign({}, process.env, { PORT: String(PORT) }), stdio: 'ignore' });
  await sleep(1800);

  // 注册 + 上传两张主体图(真实 /uploads/ 路径)
  let res = await fetch(BASE + '/api/auth/register', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: '__live__', password: 'live12345678', accountType: 'personal' }),
  });
  let reg = await res.json();
  if (reg.code !== 0 && /已存在/.test(reg.message || '')) { // 上次中断残留:直接登录复用
    res = await fetch(BASE + '/api/auth/login', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: '__live__', password: 'live12345678' }),
    });
    reg = await res.json();
  }
  if (reg.code !== 0) throw new Error('auth: ' + reg.message);
  uid = reg.data.user.id; token = reg.data.token;
  // 复用时重置 state(取当前 rev)
  const cur0 = await (await fetch(BASE + '/api/state', { headers: { 'Authorization': 'Bearer ' + token } })).json();
  const rev0 = cur0.code === 0 ? (cur0.data.rev || 0) : 0;
  const tmpA = ROOT + '/tests/.tmp-char.png', tmpB = ROOT + '/tests/.tmp-scene.png';
  const pngA = makePng(tmpA, 'darkred'), pngB = makePng(tmpB, 'darkblue');
  madeFiles.push(tmpA, tmpB);
  const up = async (name, dataUrl) => {
    const r = await (await fetch(BASE + '/api/upload', {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
      body: JSON.stringify({ name, mime: 'image/png', dataBase64: dataUrl.split(',')[1] }),
    })).json();
    if (r.code !== 0) throw new Error('upload: ' + r.message);
    return r.data.url;
  };
  const imgChar = await up('女主.png', pngA);
  const imgScene = await up('宴会厅.png', pngB);

  const beat = (idx, name, grids, tr) => ({
    id: 'bt' + idx, idx, name, grids, emotion: '', timeRange: `${(idx - 1) * 5}-${idx * 5}s`, styleParam: '',
    frames: Array.from({ length: grids }, (_, k) => ({ img: '', text: '' })), // 留空,先测 AI 拆解填充
    transition: '', transitionNote: '', video: { status: 'none' },
  });
  const state = {
    users: [{ id: uid, username: '__live__', password: '', accountType: 'personal', phone: '', credits: 5000, createdAt: '2026/8/21' }],
    session: uid, creditLogs: [], orders: [],
    projects: [{
      id: 'p_live', userId: uid, name: '链路验收剧', mode: 'workflow', type: 'drama', style: '漫剧', tone: '无', faceStyle: '亚洲',
      shell: { platform: '抖音', lang: '中文', prodMode: '分镜表' },
      subjects: [
        { id: 'sj_c1', name: '女主', kind: 'character', image: imgChar, imgRef: imgChar, prompt: '年轻女主,长发,红裙', forms: [], description: '年轻女主,长发,红裙' },
        { id: 'sj_s1', name: '宴会厅', kind: 'scene', image: imgScene, prompt: '奢华宴会厅', forms: [] },
      ],
      episodes: [{
        id: 'ep_l1', title: '第一集', order: 0, status: 'storyboarded',
        content: '女主走进宴会厅,全场安静。女配上前嘲讽,男主冷眼旁观。女主攥紧手包,转身离开,眼神变得坚定。',
        shots: [
          { id: 'sh1', order: 0, name: '', characters: ['女主'], scene: '宴会厅', props: [], camera: '固定镜头', plot: '女主走进宴会厅,全场安静', narration: '', dialogue: '', voice: '旁白·沉稳男声', prompt: '漫剧风格,女主红裙走进宴会厅,众人侧目,冷调灯光', promptHistory: [], image: null, videoModel: '', video: { status: 'none' }, audio: false, history: [], transition: null, axisRule: '', intent: '', duration: 5 },
          { id: 'sh2', order: 1, name: '', characters: ['女主'], scene: '宴会厅', props: [], camera: '推镜头', plot: '女主转身离开,眼神坚定', narration: '', dialogue: '', voice: '旁白·沉稳男声', prompt: '漫剧风格,女主转身离开宴会厅,背影坚定,冷色调', promptHistory: [], image: null, videoModel: '', video: { status: 'none' }, audio: false, history: [], transition: null, axisRule: '', intent: '', duration: 5 },
        ],
        sbConfig: { ratio: '16:9', subtitle: false, syncVoice: false, shotDur: 5 },
        beats: [beat(1, '开篇钩子', 3), beat(2, '矛盾建立', 3), beat(3, '打压升级', 3), beat(4, '反转蓄力', 3), beat(5, '断集留客', 2)],
      }],
      script: '女主走进宴会厅被羞辱,转身离开暗下决心复仇。', createdAt: '2026/8/21',
    }],
    assets: { subjects: [], groups: [] }, favorites: [], materials: [], fileFavs: {},
    assetReviews: [], portraitCerts: [], settings: { complianceAccepted: '2026/8/21' }, tasks: [], team: { members: [], inviteCode: null }, trash: [],
  };
  res = await fetch(BASE + '/api/state', {
    method: 'PUT', headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
    body: JSON.stringify({ rev: rev0, state }),
  });
  if ((await res.json()).code !== 0) throw new Error('put state failed');

  chrome = spawn(CHROME, ['--headless=new', '--disable-gpu', '--remote-debugging-port=9242', '--no-first-run', '--user-data-dir=' + ROOT + '/tests/.chrome-live', 'about:blank'], { stdio: 'ignore' });
  await sleep(3000);
  const targets = await (await fetch('http://localhost:9242/json/list')).json();
  const page = targets.find(t => t.type === 'page');
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  let mid = 0; const pending = {}; const consoleErrs = [];
  ws.onmessage = ev => {
    const m = JSON.parse(ev.data);
    if (m.id && pending[m.id]) { pending[m.id](m); delete pending[m.id]; }
    if (m.method === 'Runtime.exceptionThrown') consoleErrs.push('EXC|' + (m.params.exceptionDetails.exception && m.params.exceptionDetails.exception.description || m.params.exceptionDetails.text || '').slice(0, 300));
    if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') {
      const t = m.params.args.map(a => a.value || a.description || '').join(' ');
      if (!/Failed to load resource|ERR_|404/.test(t)) consoleErrs.push('CONSOLE|' + t.slice(0, 200));
    }
  };
  const send = (method, params) => new Promise(resolve => { const id = ++mid; pending[id] = resolve; ws.send(JSON.stringify({ id, method, params })); });
  await new Promise(r => { ws.onopen = r; });
  await send('Runtime.enable', {});
  await send('Page.enable', {});
  const evalJs = async (expr, awaitP) => {
    const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: !!awaitP });
    const rr = r.result || {};
    if (rr.exceptionDetails) return '__EXC:' + (rr.exceptionDetails.exception && rr.exceptionDetails.exception.description || rr.exceptionDetails.text || '').slice(0, 200);
    return rr.result ? rr.result.value : undefined;
  };
  // 轮询页面 state 直到条件满足或超时
  const waitFor = async (name, expr, timeoutMin) => {
    const deadline = Date.now() + timeoutMin * 60000;
    let last = '';
    while (Date.now() < deadline) {
      const v = await evalJs(expr);
      last = typeof v === 'string' ? v : JSON.stringify(v);
      if (v === true || (v && v.ok)) { report(name, true, last === 'true' ? '' : last); return true; }
      await sleep(10000);
      process.stdout.write('.');
    }
    report(name, false, '超时(' + timeoutMin + 'min),最后状态:' + last);
    return false;
  };

  // ---- 登录并进入节拍板 ----
  await send('Page.navigate', { url: BASE + '/index.html' });
  await sleep(2500);
  await evalJs(`(async () => {
    const j = await (await fetch('/api/auth/login', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({username:'__live__', password:'live12345678'}) })).json();
    localStorage.setItem('mv_hujing_token', j.data.token);
    if (window.Store && Store.setToken) Store.setToken(j.data.token);
    await Store.pullState();
    window.__epView = 'bb';
    location.hash = '#/project/p_live/episode/ep_l1';
    return 'ok';
  })()`, true);
  await sleep(2000);

  // ============ 节拍板链路 ============
  // 1. AI 拆解(真实 LLM)
  await evalJs(`document.querySelector('[data-x=aifill]').click()`);
  await waitFor('节拍板·AI拆解填充(LLM)', `(Store.getProject('p_live').episodes[0].beats.every(b=>b.frames.every(f=>f.text)) || Store.getProject('p_live').episodes[0].beats.some(b=>b.frames.some(f=>f.text)))`, 3);
  report('节拍板·拆解后 prompt 实时组装非空', await evalJs(`(document.querySelector('[data-prompt]')||{}).value||''`).then(v => String(v).length > 50));

  // 2. 单段生成(Beat1,真实上游)
  await evalJs(`document.querySelector('[data-x=gen]').click()`);
  const g1 = await waitFor('节拍板·Beat1 真实生成(≤30s 长段落)', `(()=>{const b=Store.getProject('p_live').episodes[0].beats[0];return b.video.status==='done'&&b.video.url?{ok:true,url:b.video.url}:b.video.status==='failed'?{ok:true,fail:b.video.error}:false})()`, 6);
  if (g1) {
    const st = await evalJs(`(()=>{const b=Store.getProject('p_live').episodes[0].beats[0];return {status:b.video.status,url:b.video.url||'',err:b.video.error||''}})()`);
    if (st && st.status === 'done' && st.url) {
      const fp = ROOT + st.url.replace(/\//g, '\\');
      const ok = fs.existsSync(fp) && fs.statSync(fp).size > 10000;
      report('节拍板·Beat1 视频落盘(uploads/gen,>10KB)', ok, st.url + ' ' + (fs.existsSync(fp) ? fs.statSync(fp).size : 0) + 'B');
      if (ok) madeFiles.push(fp);
    } else {
      report('节拍板·Beat1 生成', false, 'failed: ' + (st && st.err || 'unknown'));
    }
  }

  // 3. 批量生成剩余 4 段(含确认弹窗)
  await evalJs(`document.querySelector('[data-x=genall]').click()`); await sleep(800);
  await evalJs(`(document.querySelector('.modal-mask [data-x=ok]')||{click(){}}).click()`);
  await waitFor('节拍板·批量生成 5 段全出片', `Store.getProject('p_live').episodes[0].beats.every(b=>b.video.status==='done'&&b.video.url)`, 20);
  const allSt = await evalJs(`Store.getProject('p_live').episodes[0].beats.map(b=>b.video.status).join(',')`);
  report('节拍板·5 段状态', String(allSt).split(',').every(x => x === 'done'), String(allSt));
  const beatUrls = await evalJs(`Store.getProject('p_live').episodes[0].beats.map(b=>b.video&&b.video.url||'')`);
  (beatUrls || []).forEach(u => { if (u) { const fp = ROOT + u.replace(/\//g, '\\'); if (fs.existsSync(fp)) madeFiles.push(fp); } });

  // 4. 合成五段成片(真实 FFmpeg)
  await evalJs(`const b=document.querySelector('[data-x=bbcompose]'); if(b) b.click()`); await sleep(500);
  await waitFor('节拍板·五段合成成片', `(()=>{const e=Store.getProject('p_live').episodes[0];return e.composed&&e.composedUrl?{ok:true,url:e.composedUrl}:false})()`, 8);
  const compUrl = await evalJs(`(Store.getProject('p_live').episodes[0].composedUrl)||''`);
  if (compUrl) {
    const fp = ROOT + String(compUrl).replace(/\//g, '\\');
    const ok = fs.existsSync(fp) && fs.statSync(fp).size > 50000;
    report('节拍板·成片落盘(>50KB)', ok, compUrl + ' ' + (fs.existsSync(fp) ? fs.statSync(fp).size : 0) + 'B');
    if (ok) madeFiles.push(fp);
  }

  // ============ 镜头组链路 ============
  await evalJs(`window.__epView='groups'; window.__reroute()`); await sleep(1500);
  // 5. 自动分组
  await evalJs(`document.querySelector('[data-x=autogroup]').click()`); await sleep(800);
  const gCnt = await evalJs(`(Store.getProject('p_live').episodes[0].groups||[]).length`);
  report('镜头组·自动分组(≥1 组)', gCnt >= 1, 'groups=' + gCnt);
  // 6. 绑定资产(同名自动预选 → 保存)
  await evalJs(`document.querySelector('[data-gbind]').click()`); await sleep(500);
  await evalJs(`(document.querySelector('.modal-mask [data-x=ok]')||{click(){}}).click()`); await sleep(800);
  const bound = await evalJs(`(()=>{const g=Store.getProject('p_live').episodes[0].groups[0];return {assets:Object.keys(g.assets||{}).length, scene:!!g.sceneImage}})()`);
  report('镜头组·绑定资产(角色+场景)', bound && bound.assets >= 1 && bound.scene, JSON.stringify(bound));
  // 7. 整组生成(带组前缀注入,2 镜真实上游)
  await evalJs(`document.querySelector('[data-ggen]').click()`); await sleep(800);
  // 可能有断点校准/确认弹窗
  await evalJs(`(document.querySelector('.modal-mask [data-x=all]')||document.querySelector('.modal-mask [data-x=ok]')||{click(){}}).click()`);
  await waitFor('镜头组·整组 2 镜真实生成', `(()=>{const ss=Store.getProject('p_live').episodes[0].shots;return ss.every(s=>s.video&&s.video.status==='done'&&s.video.url)?{ok:true}:ss.some(s=>s.video&&s.video.status==='failed')?{ok:true,fail:ss.map(s=>s.video.error||'').join('|').slice(0,150)}:false})()`, 12);
  const shotSt = await evalJs(`Store.getProject('p_live').episodes[0].shots.map(s=>({st:s.video.status,url:s.video.url||'',err:s.video.error||''}))`);
  report('镜头组·2 镜状态', (shotSt || []).every(x => x.st === 'done'), JSON.stringify(shotSt).slice(0, 200));
  (shotSt || []).forEach(x => { if (x.url) { const fp = ROOT + x.url.replace(/\//g, '\\'); if (fs.existsSync(fp)) madeFiles.push(fp); } });
  // 生成历史应标注组名(组级前缀注入证据)
  const histModel = await evalJs(`(((Store.getProject('p_live').episodes[0].shots[0].history||[])[0])||{}).model||''`);
  report('镜头组·生成历史标注组名/前缀注入', String(histModel).length > 0, String(histModel));

  // 控制台错误总览
  report('全程无页面异常', !(consoleErrs.length), consoleErrs.slice(0, 3).join(' ;; '));
}

main()
  .catch(e => { console.error('FATAL', e); report('运行中断', false, e.message); })
  .finally(() => {
    const fails = results.filter(r => !r.ok);
    console.log(`\n===== ${results.length - fails.length}/${results.length} PASS, ${fails.length} FAIL =====`);
    cleanup();
    setTimeout(() => process.exit(fails.length ? 2 : 0), 800);
  });
