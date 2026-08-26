/* ============ tests/e2e.js 全功能回归(无头 Chrome + CDP,零依赖) ============
 * 用法:node tests/e2e.js   (自动起临时服务/无头浏览器,跑完自动清理,退出码 0=全过)
 * 覆盖:登录 → 项目管理 → 项目详情 8 tab → 主体(新建/生图/音色) → 分集卡双入口与预估
 *       → 分镜脚本/分镜视频/剪辑台/节拍板/镜头组 五视图交互 → 资产库/百宝箱/偏好学习/
 *       看板/个人中心/团队/回收站 → 离线 file:// 模式
 * 约定:每轮功能改动后必跑;失败项会带页面侧 exception 详情。不触发真实 LLM/生图扣费调用。
 */
const PORT = 8140;
const BASE = `http://localhost:${PORT}`;
const CHROME = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const ROOT = require('path').join(__dirname, '..');
const { spawn } = require('child_process');
const fs = require('fs');
const sleep = ms => new Promise(r => setTimeout(r, ms));

const results = [];
function report(name, ok, detail) { results.push({ name, ok, detail: detail || '' }); console.log((ok ? 'PASS' : 'FAIL') + ' | ' + name + (detail ? ' | ' + detail : '')); }

let server, chrome, uid;
function cleanup() {
  try { chrome && chrome.kill('SIGKILL'); } catch (e) {}
  try { server && server.kill('SIGKILL'); } catch (e) {}
  if (uid) { // 清掉 e2e 账号数据
    const D = ROOT + '/data/';
    try { fs.writeFileSync(D + 'users.json', JSON.stringify(JSON.parse(fs.readFileSync(D + 'users.json', 'utf8')).filter(x => x.username !== '__e2e__'), null, 2)); } catch (e) {}
    try { fs.writeFileSync(D + 'sessions.json', JSON.stringify(JSON.parse(fs.readFileSync(D + 'sessions.json', 'utf8')).filter(t => t.userId !== uid), null, 2)); } catch (e) {}
    for (const f2 of ['states/' + uid + '.json', 'states/' + uid + '.json.bak']) { try { fs.unlinkSync(D + f2); } catch (e) {} }
    try { fs.rmSync(D + 'states/' + uid + '.history', { recursive: true }); } catch (e) {}
  }
  setTimeout(() => { try { fs.rmSync(ROOT + '/tests/.chrome-e2e', { recursive: true, force: true }); } catch (e) {} }, 1500);
}

async function main() {
  // ---- 起临时服务(MOCK_LLM=1:LLM 链路走罐头返回,不扣上游费用) ----
  server = spawn(process.execPath, [ROOT + '/server.js'], { env: Object.assign({}, process.env, { PORT: String(PORT), MOCK_LLM: '1' }), stdio: 'ignore' });
  await sleep(1800);

  // ---- 注册(已存在则登录)+ 写入富状态 ----
  let res = await fetch(BASE + '/api/auth/register', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: '__e2e__', password: 'e2e12345678', accountType: 'company' }),
  });
  let reg = await res.json();
  if (reg.code !== 0 && /已存在/.test(reg.message || '')) {
    res = await fetch(BASE + '/api/auth/login', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: '__e2e__', password: 'e2e12345678' }),
    });
    reg = await res.json();
  }
  if (reg.code !== 0) throw new Error('auth: ' + reg.message);
  uid = reg.data.user.id;
  const token = reg.data.token;
  const cur = await (await fetch(BASE + '/api/state', { headers: { 'Authorization': 'Bearer ' + token } })).json();
  const curRev = cur.code === 0 ? (cur.data.rev || 0) : 0;

  const shot = (i, over) => Object.assign({
    id: 'sh' + i, order: i, name: '', characters: ['女主'], scene: '宴会厅', props: [],
    camera: '固定镜头', plot: '镜头' + (i + 1) + '剧情:女主转身离开宴会厅', narration: '', dialogue: i === 0 ? '我们结束了。' : '',
    voice: '旁白·沉稳男声', prompt: '漫剧风格,女主在宴会厅转身,冷色调,镜头' + (i + 1),
    promptHistory: [], image: null, videoModel: 'Volcengine,Seedance 2.5 长段落(待接入),seedance-2-5-pro(模拟)',
    video: { status: 'none' }, audio: false, history: [], transition: null, axisRule: '', intent: '', duration: 5,
  }, over || {});
  const s0 = shot(0, { groupId: 'sg_1', video: { status: 'done', url: '/uploads/gen/fake0.mp4', frame: '/uploads/gen/fake0.jpg', model: 'test' }, confirm: true, history: [{ type: '视频', model: 'm1', time: '2026/8/20', prompt: '旧提示词', frame: '/uploads/gen/fake0.jpg', url: '/uploads/gen/fake0.mp4' }] });
  const s1 = shot(1, { video: { status: 'failed', error: '测试失败:duration not supported' } });
  const s2 = shot(2, { reviews: [{ score: 6.2, time: '2026/8/21', comments: [] }] }); // 缺 dimensions 的旧格式记录,验证兜底
  const state = {
    users: [{ id: uid, username: '__e2e__', password: '', accountType: 'company', phone: '', credits: 500, createdAt: '2026/8/21' }],
    session: uid, creditLogs: [], orders: [],
    projects: [{
      id: 'p_e2e', userId: uid, name: 'E2E 验证剧', mode: 'workflow', type: 'drama', style: '漫剧', tone: '无', faceStyle: '亚洲',
      shell: { platform: '抖音', lang: '中文', prodMode: '分镜表', selling: '复仇逆袭' },
      concept: { statement: '测试' },
      subjects: [
        { id: 'sj_c1', name: '女主', kind: 'character', image: '/uploads/gen/nv.jpg', imgRef: '/uploads/gen/nv_head.jpg', prompt: '女主', forms: [], description: '冷艳女主' },
        { id: 'sj_c2', name: '无图角色', kind: 'character', image: '', prompt: '', forms: [] },
        { id: 'sj_s1', name: '宴会厅', kind: 'scene', image: '/uploads/gen/hall.jpg', prompt: '宴会厅', forms: [] },
      ],
      episodes: [
        {
          id: 'ep_e1', title: '第一集', order: 0, status: 'storyboarded', content: '第一集正文:女主在宴会厅被羞辱,转身离开,暗下决心复仇。'.repeat(20),
          shots: [s0, s1, s2],
          groups: [{ id: 'sg_1', sig: '宴会厅|女主', name: '宴会厅-女主-组1', scene: '宴会厅', chars: ['女主'], prefix: 'x', assets: {}, sceneImage: '' }],
          sbConfig: { ratio: '16:9', subtitle: true, syncVoice: true, shotDur: 5, batchVideoModel: 'Volcengine,Seedance 2.5 长段落(待接入),seedance-2-5-pro(模拟)' },
          beats: [
            { id: 'bt1', idx: 1, name: '开篇钩子', grids: 3, emotion: '好奇', timeRange: '0-15s', styleParam: '', frames: [{ img: '', text: '冲突开场' }, { img: '', text: '' }, { img: '', text: '' }], transition: '卡点硬切', transitionNote: '', video: { status: 'done', url: '/uploads/gen/b1.mp4', frame: '/uploads/gen/b1.jpg' }, genTime: '2026/8/21' },
            { id: 'bt2', idx: 2, name: '矛盾建立', grids: 3, emotion: '紧张', timeRange: '15-30s', styleParam: '', frames: [{ img: '', text: '' }, { img: '', text: '' }, { img: '', text: '' }], transition: '', transitionNote: '', video: { status: 'none' } },
            { id: 'bt3', idx: 3, name: '打压升级', grids: 3, emotion: '压抑', timeRange: '30-45s', styleParam: '', frames: [{ img: '', text: '' }, { img: '', text: '' }, { img: '', text: '' }], transition: '', transitionNote: '', video: { status: 'none' } },
            { id: 'bt4', idx: 4, name: '反转蓄力', grids: 3, emotion: '蓄力', timeRange: '45-60s', styleParam: '', frames: [{ img: '', text: '' }, { img: '', text: '' }, { img: '', text: '' }], transition: '', transitionNote: '', video: { status: 'none' } },
            { id: 'bt5', idx: 5, name: '断集留客', grids: 2, emotion: '悬念', timeRange: '60-75s', styleParam: '', frames: [{ img: '', text: '' }, { img: '', text: '' }], transition: '', transitionNote: '', video: { status: 'none' } },
          ],
        },
        { id: 'ep_e2', title: '第二集', order: 1, status: 'draft', content: '第二集正文。'.repeat(60), shots: [] },
      ],
      script: '全剧剧本内容。'.repeat(50), createdAt: '2026/8/21',
    }],
    assets: { subjects: [], groups: [] }, favorites: [], materials: [], fileFavs: {},
    assetReviews: [], portraitCerts: [], settings: {}, tasks: [], team: { members: [], inviteCode: null }, trash: [],
  };
  res = await fetch(BASE + '/api/state', {
    method: 'PUT', headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
    body: JSON.stringify({ rev: curRev, state }),
  });
  if ((await res.json()).code !== 0) throw new Error('put state failed');

  // ---- 启动无头 Chrome(CDP) ----
  chrome = spawn(CHROME, ['--headless=new', '--disable-gpu', '--remote-debugging-port=9240', '--no-first-run', '--user-data-dir=' + ROOT + '/tests/.chrome-e2e', 'about:blank'], { stdio: 'ignore' });
  await sleep(3000);
  const targets = await (await fetch('http://localhost:9240/json/list')).json();
  const page = targets.find(t => t.type === 'page');
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  let mid = 0; const pending = {}; const consoleErrs = [];
  ws.onmessage = ev => {
    const m = JSON.parse(ev.data);
    if (m.id && pending[m.id]) { pending[m.id](m); delete pending[m.id]; }
    if (m.method === 'Runtime.exceptionThrown') consoleErrs.push('EXC|' + (m.params.exceptionDetails.exception && m.params.exceptionDetails.exception.description || m.params.exceptionDetails.text || '').slice(0, 400));
    if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') {
      const t = m.params.args.map(a => a.value || a.description || '').join(' ');
      if (!/Failed to load resource|ERR_|404/.test(t)) consoleErrs.push('CONSOLE|' + t.slice(0, 300)); // 假素材 404 属预期
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
  const go = async hash => { consoleErrs.length = 0; await evalJs(`location.hash='${hash}'`); await sleep(1200); };
  const errs = tag => { const e = consoleErrs.slice(); consoleErrs.length = 0; return e.length ? tag + ':' + e.join(' ;; ') : ''; };
  const clickTab = async t => { await evalJs(`[...document.querySelectorAll('[data-tab]')].find(x=>x.textContent.trim().startsWith('${t}')).click()`); await sleep(900); };

  // ---- 登录 ----
  await send('Page.navigate', { url: BASE + '/index.html' });
  await sleep(2500);
  const login = await evalJs(`(async () => {
    const j = await (await fetch('/api/auth/login', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({username:'__e2e__', password:'e2e12345678'}) })).json();
    localStorage.setItem('mv_hujing_token', j.data.token);
    if (window.Store && Store.setToken) Store.setToken(j.data.token);
    await Store.pullState();
    location.hash = '#/projects';
    return 'ok';
  })()`, true);
  await sleep(1500);
  report('登录+拉取state', login === 'ok', String(login));

  // ---- 项目管理页 + 新建项目弹窗 ----
  await go('#/projects');
  report('项目管理页渲染', await evalJs(`document.querySelectorAll('.proj-card').length`) >= 1, errs('项目页'));
  await evalJs(`document.querySelector('[data-x=new]').click()`); await sleep(500);
  report('新建项目弹窗(含一键跑批开关)', await evalJs(`!!document.querySelector('[data-x=autorun]')`), errs('新建项目'));
  await evalJs(`(document.querySelector('.modal-mask [data-x=cancel]')||document.querySelector('.modal-close')).click()`); await sleep(300);

  // ---- 项目详情 8 tab ----
  await go('#/project/p_e2e');
  for (const t of ['制片', '剧本', '导演', '主体', '分集', '成片库', '剧壳', '切片']) {
    await clickTab(t);
    report('项目tab·' + t, !(consoleErrs.length), errs('tab ' + t));
  }
  await clickTab('剧壳');
  report('剧壳=项目级物料包(发行信息/双海报/合规/宣发)', await evalJs(`!!document.querySelector('[data-sd-aicopy]') && document.querySelectorAll('[data-sd-aiposter]').length===2 && !!document.querySelector('[data-sd-export]')`));

  // ---- 主体页 ----
  await clickTab('主体');
  report('主体页:新建主体按钮', await evalJs(`document.querySelectorAll('[data-x=newsubj]').length`) === 1);
  report('主体页:缺图卡 AI 生图按钮(无图角色)', await evalJs(`document.querySelectorAll('[data-genone]').length`) === 1);
  report('主体页:补齐主体图(1)', (await evalJs(`(document.querySelector('[data-x=genall]')||{}).textContent||''`)).includes('1'));
  report('主体卡:音色绑定按钮(角色卡)', await evalJs(`document.querySelectorAll('[data-voice]').length`) >= 2, errs('主体页'));
  await evalJs(`document.querySelector('[data-x=newsubj]').click()`); await sleep(400);
  report('新建主体弹窗(类型/名称/描述/立即生图开关)', await evalJs(`!!document.querySelector('[data-nk]') && !!document.querySelector('[data-x=withimg]')`));
  await evalJs(`document.querySelector('.modal-mask [data-x=cancel]').click()`); await sleep(300);

  // ---- 分集卡 ----
  await clickTab('分集');
  report('分集卡:分镜表/节拍板双入口', await evalJs(`document.querySelectorAll('[data-enter^="board:"]').length`) === 2 && await evalJs(`document.querySelectorAll('[data-enter^="bb:"]').length`) === 2);
  report('分集卡:镜头组 1 组标签', await evalJs(`[...document.querySelectorAll('.tag')].some(t=>t.textContent.includes('镜头组 1 组'))`));
  report('分集卡:第二集预估镜数', await evalJs(`[...document.querySelectorAll('.tag')].some(t=>t.textContent.includes('预估'))`));

  // ---- 分镜表族:分镜脚本 ----
  await evalJs(`window.__epView='board'; location.hash='#/project/p_e2e/episode/ep_e2'`); await sleep(1500);
  report('分镜脚本页(脚本层渲染)', await evalJs(`!!document.querySelector('[data-bd-toshots]') || !!document.querySelector('[data-sc-fold]')`), errs('脚本层'));
  report('分镜表族 tab 行只有 分镜脚本/分镜视频', await evalJs(`[...document.querySelectorAll('[data-vtab]')].map(t=>t.textContent.trim()).join(',')`) === '📋 分镜脚本,🎞 分镜视频');
  report('主线步骤名:分镜表族显示「分镜表」', (await evalJs(`(document.querySelector('[data-step=shots]')||{}).textContent||''`)).includes('分镜表'));

  // ---- 智能分镜(mock LLM 全链路,不扣上游费用) ----
  await evalJs(`document.querySelector('[data-x=dd-sb]').click()`);
  {
    const deadline = Date.now() + 90000;
    let n = 0;
    while (Date.now() < deadline) {
      n = await evalJs(`(Store.getProject('p_e2e').episodes.find(e=>e.id==='ep_e2').shots||[]).length`);
      if (n >= 2) break;
      await sleep(3000);
    }
    report('智能分镜(mock LLM):产出 2 镜', n >= 2, 'shots=' + n);
  }

  // ---- 分镜视频页 ----
  await evalJs(`window.__epView='shots'; location.hash='#/project/p_e2e/episode/ep_e1'; window.__reroute && 0`); await sleep(1500);
  report('分镜视频页:缩略图 3 张', await evalJs(`document.querySelectorAll('.ws-thumb[data-shot]').length`) === 3, errs('分镜视频'));
  report('右栏:提示词卡/预估秒数/连抽/版本卡', await evalJs(`!!document.querySelector('[data-r=prompt]') && !!document.querySelector('[data-x=durest]') && document.querySelectorAll('[data-drawn]').length===3 && !!document.querySelector('[data-x=dd-ops]')`));
  report('右栏:出场主体三行标签', await evalJs(`[...document.querySelectorAll('.field .muted')].filter(x=>['参考角色','参考场景','参考道具'].includes(x.textContent.trim())).length`) === 3);
  report('右栏:一级横栏 智能识别/引用资产/大屏编辑', await evalJs(`['smartref','atref','bigprompt'].every(a=>document.querySelector('[data-ract='+a+']'))`));
  await evalJs(`document.querySelectorAll('.ws-thumb[data-shot]')[1].click()`); await sleep(900);
  report('失败镜头:错误卡+建议+修改提示词入口', await evalJs(`!!document.querySelector('[data-x=retrygen]') && !!document.querySelector('[data-x=editprompt]')`));
  await evalJs(`document.querySelectorAll('.ws-thumb[data-shot]')[0].click()`); await sleep(700);
  report('剧情概要联动轨格数=3', await evalJs(`document.querySelectorAll('.ws-refcell').length`) === 3);
  report('缩略图状态条(归一):已出片/失败/待确认', await evalJs(`const ts=[...document.querySelectorAll('.ws-thumb[data-shot]')]; ts.length===3 && ts[0].textContent.includes('✓ 已出片') && ts[1].textContent.includes('✗ 失败') && ts[2].textContent.includes('待确认') && !!ts[2].querySelector('[data-cfm]') && document.querySelectorAll('[data-cfm]').length===1`));
  await evalJs(`const ta=document.querySelector('[data-r=prompt]'); ta.value=ta.value+'，追加更多动作描写内容用于测试预估联动'; ta.dispatchEvent(new Event('input'))`); await sleep(300);
  report('提示词输入→字数/预估秒数联动', await evalJs(`+((document.querySelector('[data-x=durest]')||{}).textContent||'0')`) > 3);
  await evalJs(`[...document.querySelectorAll('[data-drawn]')].find(o=>o.dataset.drawn==='2').click()`); await sleep(900);
  report('连抽×2:按钮文案与合计积分', String(await evalJs(`((document.querySelector('[data-ract=create]')||{}).textContent||'')`)).includes('连抽×2'));
  await evalJs(`document.querySelector('[data-ract=bigprompt]').click()`); await sleep(500);
  report('大屏编辑内含 收藏/历史/润色', await evalJs(`!!document.querySelector('[data-x=fav]') && !!document.querySelector('[data-x=hist]') && !!document.querySelector('[data-x=tool]')`));
  await evalJs(`document.querySelector('.modal-mask [data-x=cancel]').click()`); await sleep(300);

  // ---- 深度交互(分镜视频页) ----
  await evalJs(`document.querySelector('[data-x=quickedit]').click()`); await sleep(500);
  report('快速编辑抽屉打开', await evalJs(`document.body.textContent.includes('快速编辑')`));
  await evalJs(`(document.querySelector('.qe-close,[data-x=qeclose]')||{click(){}}).click()`); await sleep(300);
  await evalJs(`document.querySelector('[data-x=sb-config]').click()`); await sleep(500);
  report('参数配置停靠面板打开', await evalJs(`!!document.querySelector('.sb-dock')`));
  await evalJs(`(document.querySelector('.sb-dock [data-x=close]')||{click(){}}).click()`); await sleep(300);
  await evalJs(`document.querySelector('[data-x=dd-layout]').click()`); await sleep(300);
  await evalJs(`document.querySelector('[data-lay=column]').click()`); await sleep(1000);
  report('数列式布局切换(竖列缩略图)', await evalJs(`document.querySelectorAll('.ws-thumb[data-shot]').length`) === 3, errs('数列式'));
  await evalJs(`document.querySelector('[data-x=dd-layout]').click()`); await sleep(300);
  await evalJs(`document.querySelector('[data-lay=strip]').click()`); await sleep(900);
  await evalJs(`document.querySelector('[data-x=dd-batch]').click()`); await sleep(300);
  await evalJs(`document.querySelector('[data-bop=review]').click()`); await sleep(800);
  report('批量▾进入选择模式(选择条出现)', await evalJs(`!!document.querySelector('[data-x=selconfirm]')`));
  await evalJs(`document.querySelector('[data-x=selall]').click()`); await sleep(600);
  report('全选未出片生效', await evalJs(`((document.querySelector('[data-x=selconfirm]')||{}).textContent||'').includes('2')`));
  await evalJs(`document.querySelector('[data-x=selcancel]').click()`); await sleep(600);
  await evalJs(`document.querySelectorAll('.ws-thumb[data-shot]')[0].click()`); await sleep(700);
  await evalJs(`document.querySelector('[data-ract=vers]').click()`); await sleep(500);
  report('全部版本弹窗(含应用此版)', await evalJs(`document.body.textContent.includes('历史版本') && document.body.textContent.includes('应用此版')`));
  await evalJs(`const m=document.querySelector('.modal-mask'); if(m) m.querySelector('.modal-close').click()`); await sleep(300);
  await evalJs(`document.querySelectorAll('.ws-thumb[data-shot]')[2].click()`); await sleep(700);
  await evalJs(`document.querySelector('[data-ract=reviews]').click()`); await sleep(500);
  report('审片记录弹窗(旧格式记录兜底,6.2 分)', await evalJs(`document.body.textContent.includes('6.2')`));
  await evalJs(`const m=document.querySelector('.modal-mask'); if(m) m.querySelector('.modal-close').click()`); await sleep(300);
  await evalJs(`document.querySelector('[data-x=dd-ops]').click()`); await sleep(300);
  await evalJs(`[...document.querySelectorAll('[data-ddm=ops] [data-ract]')].find(x=>x.dataset.ract==='more').click()`); await sleep(500);
  report('⋯分镜操作→更多工具弹窗', await evalJs(`!!document.querySelector('.modal-mask')`), errs('更多工具'));
  await evalJs(`const m=document.querySelector('.modal-mask'); if(m) m.querySelector('.modal-close').click()`); await sleep(300);

  // ---- 剪辑台 ----
  await evalJs(`window.__epView='cut'; window.__reroute()`); await sleep(1200);
  report('剪辑台:转场槽 2 个', await evalJs(`document.querySelectorAll('[data-tslot]').length`) === 2, errs('剪辑台'));
  report('剪辑台:tab 行无剪辑 tab', await evalJs(`document.querySelectorAll('[data-vtab]').length`) === 2);
  await evalJs(`document.querySelector('[data-tslot]').click()`); await sleep(400);
  report('转场槽点击→转场弹窗', await evalJs(`!!document.querySelector('.modal-mask [data-tr]')`));
  await evalJs(`const m=document.querySelector('.modal-mask'); if(m) m.querySelector('.modal-close').click()`); await sleep(300);
  await evalJs(`document.querySelectorAll('.ws-thumb[data-shot]')[1].click()`); await sleep(700);
  report('剪辑台:转场卡+版本卡+合成出口', await evalJs(`document.querySelectorAll('[data-ctr]').length >= 9 && !!document.querySelector('[data-x=cutcompose]') && !!document.querySelector('[data-x=cuttl]')`));

  // ---- 节拍板族 ----
  await evalJs(`window.__epView='bb'; window.__reroute()`); await sleep(1500);
  report('节拍板页:5 段导航+AI拆解+重置+导出', await evalJs(`document.querySelectorAll('[data-beat]').length === 5 && !!document.querySelector('[data-x=aifill]') && !!document.querySelector('[data-x=reset]')`), errs('节拍板'));
  report('节拍板族 tab 行只有 节拍板/镜头组', await evalJs(`[...document.querySelectorAll('[data-vtab]')].map(t=>t.textContent.trim()).join(',')`) === '🥁 节拍板,🗂 镜头组');
  report('主线步骤名:节拍板族显示「节拍板」', (await evalJs(`(document.querySelector('[data-step=shots]')||{}).textContent||''`)).includes('节拍板'));
  report('节拍板:绑定镜头组下拉含组1', String(await evalJs(`((document.querySelector('[data-f=group]')||{}).textContent||'')`)).includes('宴会厅'));
  report('节拍板:Beat5 固定无转场提示', await evalJs(`[...document.querySelectorAll('[data-beat]')][4].click(), new Promise(r=>setTimeout(()=>r(document.body.textContent.includes('直接截断黑屏')),600))`), true);
  await evalJs(`document.querySelector('[data-x=pullgrp]').click()`); await sleep(400);
  report('带入镜头组资产(未绑定→提示路径)', !(consoleErrs.length), errs('带入资产'));

  // ---- 镜头组页 ----
  await evalJs(`[...document.querySelectorAll('[data-vtab]')].find(t=>t.textContent.includes('镜头组')).click()`); await sleep(900);
  report('镜头组页:组卡+分镜时间线+Beat 标记', await evalJs(`document.querySelectorAll('[data-ggen]').length`) === 1 && await evalJs(`document.querySelectorAll('[data-tlmove]').length`) === 3, errs('镜头组'));
  await evalJs(`document.querySelector('[data-glocate]').click()`); await sleep(1200);
  report('镜头组定位→切到分镜视频页', await evalJs(`document.querySelectorAll('.ws-thumb[data-shot]').length`) === 3);

  // ---- 其他主页面 ----
  await go('#/assets');
  report('资产库页', !(consoleErrs.length), errs('资产库'));
  await go('#/tools');
  await evalJs(`[...document.querySelectorAll('[data-tool]')].find(c=>c.dataset.tool==='fusion').click()`); await sleep(500);
  report('百宝箱:融合生成弹窗', await evalJs(`!!document.querySelector('[data-x=lib]') && !!document.querySelector('[data-f=prompt]')`), errs('融合生成'));
  await evalJs(`const m=document.querySelector('.modal-mask'); if(m) m.querySelector('.modal-close').click()`); await sleep(300);
  await go('#/gsettings');
  report('偏好学习:新专家在库(钩子工程师/剪辑指导)', await evalJs(`allExperts().some(e=>e.id==='ex_hook') && allExperts().some(e=>e.id==='ex_editor') && allExperts().length >= 14`));
  await go('#/dashboard');
  report('数据看板页', !(consoleErrs.length), errs('看板'));
  await go('#/profile');
  report('个人中心页', !(consoleErrs.length), errs('个人中心'));
  await go('#/team');
  report('团队管理页', !(consoleErrs.length), errs('团队'));
  await go('#/trash');
  report('回收站页', !(consoleErrs.length), errs('回收站'));

  // ---- 虎鲸全局助手 ----
  await evalJs(`document.querySelector('[data-x=agent-global]').click()`); await sleep(800);
  report('虎鲸全局助手抽屉打开', await evalJs(`!!document.querySelector('.dir-dock.pipe-dock')`), errs('虎鲸'));
  await evalJs(`(document.querySelector('.dir-dock.pipe-dock [data-x=min]')||{click(){}}).click()`); await sleep(300);

  // ---- 离线 file:// 模式 ----
  consoleErrs.length = 0;
  await send('Page.navigate', { url: 'file:///' + ROOT.replace(/\\/g, '/') + '/index.html' });
  await sleep(4000);
  report('离线模式启动(file:// 登录页/专家库)', await evalJs(`document.body.textContent.includes('登录') && !!window.KB && allExperts().length >= 14`), errs('离线'));
}

main()
  .catch(e => { console.error('FATAL', e); report('运行中断', false, e.message); })
  .finally(() => {
    const fails = results.filter(r => !r.ok);
    console.log(`\n===== ${results.length - fails.length}/${results.length} PASS, ${fails.length} FAIL =====`);
    cleanup();
    setTimeout(() => process.exit(fails.length ? 2 : 0), 800);
  });
