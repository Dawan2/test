/* ============ tests/cli.smoke.js CLI 真实服务端冒烟(零依赖) ============
 * 用法:node tests/cli.smoke.js   (自动起临时服务,跑完自动清理,退出码 0=全过)
 * 覆盖:login/whoami/credits → 项目/分集/剧本 → 主体 → 分镜导入/补丁/确认闸
 *       → llm(mock) → jobs → state 往返 → 错误路径语义 exit code → logout
 * 隔离:HUJING_CONFIG_DIR 指向临时目录,不碰真实 ~/.hujing;测试账号 __cli__ 用完即清。
 * 安全:不触发生图/生视频等真实计费调用(gen 链路已由 tests/live-gen.js 覆盖)。
 */
const PORT = 8150;
const BASE = `http://localhost:${PORT}`;
const ROOT = require('path').join(__dirname, '..');
const { spawn, spawnSync } = require('child_process');
const fs = require('fs');
const sleep = ms => new Promise(r => setTimeout(r, ms));

const CFG_DIR = ROOT + '/tests/.cli-smoke';
const CLI_ENV = Object.assign({}, process.env, { HUJING_CONFIG_DIR: CFG_DIR });
const results = [];
function report(name, ok, detail) { results.push({ name, ok, detail: detail || '' }); console.log((ok ? 'PASS' : 'FAIL') + ' | ' + name + (detail ? ' | ' + detail : '')); }

let server, uid;
function cli(...args) {
  const r = spawnSync(process.execPath, [ROOT + '/cli.js', ...args], { env: CLI_ENV, encoding: 'utf8' });
  let json = null;
  try { json = JSON.parse(String(r.stdout).trim()); } catch (_) {}
  return { code: r.status, out: json, raw: r.stdout, err: String(r.stderr || '') };
}
function cleanup() {
  try { server && server.kill('SIGKILL'); } catch (e) {}
  if (uid) { // 清掉冒烟账号数据(与 e2e 同口径)
    const D = ROOT + '/data/';
    try { fs.writeFileSync(D + 'users.json', JSON.stringify(JSON.parse(fs.readFileSync(D + 'users.json', 'utf8')).filter(x => x.username !== '__cli__'), null, 2)); } catch (e) {}
    try { fs.writeFileSync(D + 'sessions.json', JSON.stringify(JSON.parse(fs.readFileSync(D + 'sessions.json', 'utf8')).filter(t => t.userId !== uid), null, 2)); } catch (e) {}
    try { const ops = JSON.parse(fs.readFileSync(D + 'operations.json', 'utf8')); fs.writeFileSync(D + 'operations.json', JSON.stringify({ list: (ops.list || []).filter(o => o.userId !== uid) }, null, 2)); } catch (e) {}
    try { const w = JSON.parse(fs.readFileSync(D + 'wallets.json', 'utf8')); delete w[uid]; fs.writeFileSync(D + 'wallets.json', JSON.stringify(w, null, 2)); } catch (e) {}
    try { const j = JSON.parse(fs.readFileSync(D + 'jobs.json', 'utf8')); fs.writeFileSync(D + 'jobs.json', JSON.stringify({ list: (j.list || []).filter(x => x.userId !== uid) }, null, 2)); } catch (e) {}
    for (const f2 of ['states/' + uid + '.json', 'states/' + uid + '.json.bak']) { try { fs.unlinkSync(D + f2); } catch (e) {} }
    try { fs.rmSync(D + 'states/' + uid + '.history', { recursive: true }); } catch (e) {}
    try { fs.rmSync(ROOT + '/uploads/' + uid, { recursive: true, force: true }); } catch (e) {}
  }
  try { fs.rmSync(CFG_DIR, { recursive: true, force: true }); } catch (e) {}
}

async function main() {
  // ---- 起临时服务(MOCK_LLM=1:llm 走罐头返回,不扣上游费用) ----
  server = spawn(process.execPath, [ROOT + '/server.js'], { env: Object.assign({}, process.env, { PORT: String(PORT), MOCK_LLM: '1' }), stdio: 'ignore' });
  await sleep(1800);

  // ---- 注册账号(直接打 API;CLI 的 login 单独测) ----
  let res = await fetch(BASE + '/api/auth/register', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: '__cli__', password: 'cli12345678', accountType: 'personal' }),
  });
  let reg = await res.json();
  if (reg.code !== 0 && !/已存在/.test(reg.message || '')) throw new Error('register: ' + reg.message);

  // ---- 账户 ----
  let r = cli('whoami');
  report('未登录 whoami → exit 3', r.code === 3, 'exit=' + r.code);
  r = cli('login', '--username', '__cli__', '--password', 'wrong-password', '--server', BASE);
  report('错误密码 login → exit 1', r.code === 1, 'exit=' + r.code);
  r = cli('login', '--username', '__cli__', '--password', 'cli12345678', '--server', BASE);
  report('login', r.code === 0 && r.out && r.out.logined === '__cli__', r.err.trim().split('\n').pop() || '');
  r = cli('whoami');
  uid = r.out && r.out.user && r.out.user.id;
  report('whoami', r.code === 0 && !!uid, '');
  r = cli('credits');
  report('credits 余额结构', r.code === 0 && r.out && typeof r.out.balance === 'number', '');

  // ---- 项目结构(剧本层) ----
  r = cli('project-create', '--name', '冒烟剧', '--style', '漫剧');
  const pid = r.out && r.out.id;
  report('project-create', r.code === 0 && !!pid, '');
  r = cli('projects');
  report('projects 含新项目', r.code === 0 && (r.out.projects || []).some(p => p.id === pid), '');
  r = cli('episode-add', pid, '--title', '第1集', '--content', '女主转身离开宴会厅,暗下决心。');
  const epid = r.out && r.out.id;
  report('episode-add', r.code === 0 && !!epid, '');
  r = cli('episode-script', pid, epid, '--content', '完整剧本:宴会厅冲突爆发,女主离场。');
  report('episode-script contentRev+1', r.code === 0 && r.out.contentRev === 1, '');
  r = cli('episode-show', pid, epid);
  report('episode-show', r.code === 0 && r.out.id === epid && r.out.content > 0, '');

  // ---- 主体层 ----
  r = cli('subject-add', pid, '--name', '女主', '--desc', '冷艳长发');
  report('subject-add(不生图,零计费)', r.code === 0 && r.out.name === '女主', '');
  r = cli('subjects', pid);
  report('subjects 列表', r.code === 0 && (r.out.subjects || []).length === 1, '');
  r = cli('project-create', '--name', '冒烟剧B');
  const pidB = r.out && r.out.id;
  r = cli('subject-copy', pid, '女主', pidB);
  report('subject-copy 跨项目复制(重新发 id)', r.code === 0 && r.out && r.out.name === '女主' && r.out.overwritten === false, JSON.stringify(r.out || {}).slice(0, 60));
  r = cli('subject-copy', pid, '女主', pidB);
  report('subject-copy 同名覆盖语义', r.code === 0 && r.out && r.out.overwritten === true, '');
  r = cli('subjects', pidB);
  report('subject-copy 后目标项目仅 1 个主体', r.code === 0 && (r.out.subjects || []).length === 1, '');

  // ---- 分镜层 ----
  const shotsFile = CFG_DIR + '/shots.json';
  fs.mkdirSync(CFG_DIR, { recursive: true });
  fs.writeFileSync(shotsFile, JSON.stringify([
    { plot: '钩子:女主被当众羞辱', camera: '固定镜头', characters: ['女主'], scene: '宴会厅', dialogue: '你们会后悔的。', prompt: '漫剧风格,宴会厅,女主被嘲讽', duration: 5 },
    { plot: '女主转身离开', camera: '推镜头', characters: ['女主'], scene: '宴会厅', prompt: '漫剧风格,女主转身背影', duration: 5 },
  ]));
  r = cli('shots-import', pid, epid, '--file', shotsFile);
  report('shots-import 2 镜', r.code === 0 && r.out.imported === 2 && r.out.total === 2, '');
  r = cli('shots', pid, epid);
  const sid = r.out && r.out.shots && r.out.shots[0] && r.out.shots[0].id;
  report('shots 全字段读回', r.code === 0 && !!sid, '');
  r = cli('shot-set', pid, epid, sid, '--patch', '{"duration":8}');
  report('shot-set 补丁', r.code === 0 && r.out.patched.includes('duration'), '');
  r = cli('shot-set', pid, epid, sid, '--patch', '{"video":{"status":"done","url":"x"}}');
  report('shot-set 受管字段拦截(video) → exit 2', r.code === 2 && r.out && /受管字段/.test(r.out.error || ''), 'exit=' + r.code);
  r = cli('shot-confirm', pid, epid, sid);
  report('shot-confirm 确认闸', r.code === 0 && r.out.confirm === true, '');
  r = cli('shots', pid, epid);
  report('确认已写回', r.code === 0 && r.out.shots[0].confirm === true && r.out.shots[0].duration === 8, '');

  // ---- 生成层(仅零成本路径:确认闸/断点短路;真实生成链路走 tests/live-gen.js) ----
  r = cli('gen-episode', pid, epid, '--failed-only');
  report('gen-episode --failed-only 空集短路', r.code === 0 && r.out.total === 0, '');
  r = cli('episode-add', pid, '--title', '第2集');
  const ep2 = r.out && r.out.id;
  fs.writeFileSync(shotsFile, JSON.stringify([{ plot: '未确认镜', prompt: '漫剧风格,测试', duration: 5 }]));
  cli('shots-import', pid, ep2, '--file', shotsFile);
  r = cli('gen-episode', pid, ep2); // 全部未确认 → 确认闸拦截,零调用零计费
  report('gen-episode 确认闸拦截(未确认镜不跑)', r.code === 0 && r.out.total === 0 && /确认/.test(r.out.skipped || ''), '');

  // ---- 统一领域命令 exec(第二阶段:与前端 Commands.execute 同名同结构;仅零成本路径) ----
  r = cli('exec', 'episode.preflight', '--pid', pid, '--epid', epid);
  report('exec preflight 就绪(ready+counts)', r.code === 0 && r.out.ok === true && r.out.status === 'ready' && r.out.result.counts.total === 2, 'exit=' + r.code);
  { // 主体面校验项:导入两镜的场景「宴会厅」未提取为主体(fail),角色「女主」无参考图(warn);只报不拦,仍 ready
    const chk = ((r.out && r.out.result && r.out.result.checks) || []).find(c => c.skill === 'subjects.refIntegrity');
    const codes = chk ? chk.hits.map(h => h.code) : [];
    report('exec preflight 附主体面校验项(pass/level/hits,只报不拦)',
      !!chk && chk.pass === false && chk.level === 'fail' && r.out.ok === true && r.out.status === 'ready'
      && codes.filter(c => c === 'unknown-subject').length === 2 && codes.filter(c => c === 'no-ref-image').length === 2
      && chk.hits.every(h => h.order >= 1 && !!h.shotId),
      JSON.stringify(chk && { level: chk.level, hits: chk.hits.length }));
  }
  { // 成片字幕面校验项:两镜尚无视频/底图 → 合成时间轴未成形,如实给 info 空结论(不冒充通过判定)
    const cap = ((r.out && r.out.result && r.out.result.checks) || []).find(c => c.skill === 'film.subtitleQC');
    report('exec preflight 附成片字幕面校验项(时间轴未成形 → info 空结论)',
      !!cap && cap.id === 'film.subtitleTiming' && cap.pass === true && cap.level === 'info' && cap.hits.length === 0,
      JSON.stringify(cap && { level: cap.level, hits: cap.hits.length }));
  }
  r = cli('exec', 'episode.preflight', '--pid', pid, '--epid', ep2); // ep2 无剧本
  report('exec preflight 缺剧本 → blocked exit 2', r.code === 2 && r.out.ok === false && r.out.status === 'blocked' && r.out.result.blockers.some(b => b.code === 'no-script'), 'exit=' + r.code);
  r = cli('exec', 'episode.generateVideos', '--pid', pid, '--epid', ep2); // 未确认镜 → blocked,零生成零计费
  report('exec generateVideos 未确认 → blocked unconfirmed+skipped', r.code === 2 && r.out.error && r.out.error.code === 'unconfirmed' && r.out.result.skipped.length === 1, 'exit=' + r.code);
  r = cli('exec', 'shot.generateVideo', '--pid', pid, '--epid', epid, '--sid', '2'); // 镜头号寻址;镜2 未确认
  report('exec shot.generateVideo 未确认 → blocked(镜头号寻址)', r.code === 2 && r.out.error && r.out.error.code === 'unconfirmed', 'exit=' + r.code);
  r = cli('exec', 'episode.produce', '--pid', pid, '--epid', ep2); // 就绪检查不过(缺剧本)
  report('exec produce 就绪检查拦截 → blocked preflight', r.code === 2 && r.out.error && r.out.error.code === 'preflight', 'exit=' + r.code);
  r = cli('exec', 'episode.compose', '--pid', pid, '--epid', ep2); // 有分镜无素材 → 合成前置拦截
  report('exec compose 无素材 → blocked intercepted', r.code === 2 && r.out.error && r.out.error.code === 'intercepted', 'exit=' + r.code);
  r = cli('exec', 'episode.generateStoryboard', '--pid', pid, '--epid', epid);
  report('exec generateStoryboard(服务端工作流)→ ok+分镜写回', r.code === 0 && r.out && r.out.ok && r.out.result && r.out.result.shots >= 1, 'exit=' + r.code + ' ' + JSON.stringify(r.out && r.out.result || r.out));
  await sleep(1100); // wf 端点限流:单用户每秒 ≤2 次(上文智能分镜也是 wf 端点)
  r = cli('exec', 'project.extractSubjects', '--pid', pid); // 服务端工作流通道(人设/记忆由 /api/wf/extract-subjects 注入)
  report('exec project.extractSubjects(服务端工作流)→ ok+主体入库', r.code === 0 && r.out && r.out.ok && r.out.result && r.out.result.added >= 1 && r.out.result.total > r.out.result.added, 'exit=' + r.code + ' ' + JSON.stringify((r.out && r.out.result) || r.out));
  r = cli('exec', 'project.extractSubjects', '--pid', pidB); // 无剧本无分集正文 → blocked,零调用零计费
  report('exec project.extractSubjects 无剧本 → blocked no-script', r.code === 2 && r.out && r.out.error && r.out.error.code === 'no-script', 'exit=' + r.code);
  // 注册表的 local/model 两位只在浏览器语境成立(本地启发式提取与用户选模型),headless 如实拒绝不静默忽略
  r = cli('exec', 'project.extractSubjects', '--pid', pid, '--local');
  report('exec project.extractSubjects --local → blocked browser-only(零调用)', r.code === 2 && r.out && r.out.error && r.out.error.code === 'browser-only', 'exit=' + r.code + ' ' + JSON.stringify((r.out && r.out.error) || r.out));
  r = cli('exec', 'episode.bogus', '--pid', pid, '--epid', epid);
  report('exec 未知命令 → exit 2', r.code === 2 && /未注册命令|可用/.test(String(r.out && r.out.error || r.err)), 'exit=' + r.code);

  // ---- 主线前段 headless 起跑(G-04):整部剧本 → 拆集 → 分镜表(全程零浏览器) ----
  {
    const scriptFile = CFG_DIR + '/script.txt';
    fs.writeFileSync(scriptFile, '第一集 宴会羞辱\n女主在宴会上被当众羞辱,众人哄笑不止。\n第二集 反击\n女主当场揭穿对方伪装,全场哗然失色。');
    r = cli('project-create', '--name', '冒烟剧C·拆集');
    const pidC = r.out && r.out.id;
    r = cli('project-script', pidC, '--script-file', scriptFile);
    report('project-script 写入剧本原文(拆集输入就位)', r.code === 0 && r.out && r.out.chars > 20 && r.out.episodes === 0, JSON.stringify(r.out || {}).slice(0, 60));
    await sleep(1100); // 上文智能分镜与提取主体也是 wf 端点,进本段前先让限流窗口过去
    r = cli('exec', 'project.splitEpisodes', '--pid', pidC);
    report('exec project.splitEpisodes 标记切分 → ok+2 集(零 LLM)', r.code === 0 && r.out && r.out.ok && r.out.result.count === 2 && r.out.result.mode === 'markers', 'exit=' + r.code + ' ' + JSON.stringify(r.out && r.out.result || r.out).slice(0, 90));
    report('拆集后 next 指向下一步(Domain 重推)', !!(r.out && r.out.next && r.out.next.key), JSON.stringify((r.out && r.out.next) || {}).slice(0, 60));
    await sleep(1100); // wf 端点限流:单用户每秒 ≤2 次(与前端/集成测试同口径)
    r = cli('exec', 'project.splitEpisodes', '--pid', pidC);
    report('已有分集未授权 → blocked has-episodes exit 2(不覆盖已有分镜数据)', r.code === 2 && r.out && r.out.error && r.out.error.code === 'has-episodes', 'exit=' + r.code + ' ' + JSON.stringify((r.out && r.out.error) || {}).slice(0, 70));
    await sleep(1100);
    r = cli('exec', 'project.splitEpisodes', '--pid', pidC, '--overwrite', '--local');
    report('--overwrite --local 授权覆盖并强制段落均分', r.code === 0 && r.out && r.out.ok && r.out.result.mode === 'even' && r.out.result.overwritten === 2, 'exit=' + r.code + ' ' + JSON.stringify(r.out && r.out.result || r.out).slice(0, 90));
    r = cli('project-show', pidC);
    const epC = r.out && (r.out.episodes || [])[0];
    report('拆集分集带正文(下游理解/分镜可直接接续)', r.code === 0 && !!epC && epC.content > 10, JSON.stringify(epC || {}).slice(0, 80));
    await sleep(1100);
    r = cli('exec', 'episode.generateStoryboard', '--pid', pidC, '--epid', epC && epC.id);
    report('剧本→拆集→智能分镜 headless 链路贯通(分镜表已存在)', r.code === 0 && r.out && r.out.ok && r.out.result && r.out.result.shots >= 1, 'exit=' + r.code + ' ' + JSON.stringify(r.out && r.out.result || r.out).slice(0, 80));
    await sleep(1100);
  }

  // ---- 主线四步闭环结论回流(W61):理解/分镜/拆集/提取主体各按板块留一条可判定结论 ----
  {
    r = cli('memory', 'list');
    const fbs = ((r.out && r.out.list) || []).filter(m => m.fb);
    const byPre = pre => fbs.filter(m => String(m.fb).startsWith(pre + ':'));
    report('四步闭环结论都回流进了记忆桶(全程 headless,零浏览器)',
      r.code === 0 && byPre('und').length >= 1 && byPre('sb').length >= 1 && byPre('split').length === 1 && byPre('extract').length === 1,
      JSON.stringify(fbs.map(m => m.fb + '@' + m.scope)));
    const bd = pre => (byPre(pre)[0] || {}).scope;
    report('回流板块取 WF_BOARD 单源(导演/分镜/剧本/主体各归各位)',
      bd('und') === '导演' && bd('sb') === '分镜' && bd('split') === '剧本' && bd('extract') === '主体',
      [bd('und'), bd('sb'), bd('split'), bd('extract')].join(','));
    const ex = byPre('extract')[0] || {};
    report('提取主体回流文案可判定(新增/已有/库存/缺参考图都是数字)',
      String(ex.text || '').startsWith('提取主体闭环回流·') && /本轮新增 \d+ 位/.test(ex.text || '')
      && /主体库共 \d+ 位/.test(ex.text || '') && /\d+ 位缺参考图$/.test(ex.text || '') && !!ex.time,
      String(ex.text));
    const sp = byPre('split')[0] || {};
    report('拆集回流只留最新一条(同项目三次拆集不双写,模式如实记 even)',
      /切出 \d+ 集/.test(sp.text || '') && String(sp.text || '').includes('even'), String(sp.text));
    r = cli('memory', 'list', '--scope', '主体', '--recall', '主体库');
    report('回流条目可被同板块召回(下一轮提示词即刻吃到)',
      r.code === 0 && (r.out.recalled || []).some(m => String(m.text).startsWith('提取主体闭环回流·')),
      JSON.stringify((r.out && r.out.recalled || []).map(m => m.scope)));
    // 幂等:同项目再提取一次仍只有一条(fb 键原地更新,不把 50 条上限刷满)
    r = cli('memory', 'list');
    const totalBefore = (r.out && r.out.total) || 0;
    await sleep(1100);
    const again = cli('exec', 'project.extractSubjects', '--pid', pid);
    r = cli('memory', 'list');
    report('同项目重复提取主体只更新不双写(记忆桶条数不变)',
      again.code === 0 && r.code === 0 && r.out.total === totalBefore
      && (r.out.list || []).filter(m => String(m.fb || '').startsWith('extract:')).length === 1,
      'before=' + totalBefore + ' after=' + (r.out && r.out.total));
    // 失败路径不写:无剧本项目 blocked(零调用零计费),记忆桶一条不加
    const bad = cli('exec', 'project.extractSubjects', '--pid', pidB);
    r = cli('memory', 'list');
    report('提取主体失败路径不写假成功(blocked 项目不入记忆桶)',
      bad.code === 2 && r.code === 0 && r.out.total === totalBefore && !(r.out.list || []).some(m => m.fb === 'extract:' + pidB),
      'exit=' + bad.code + ' total=' + (r.out && r.out.total));
  }

  // ---- 工具层 ----
  r = cli('llm', '--user', '你好', '--json');
  report('llm --json mock 链路', r.code === 0 && r.out && typeof r.out.content === 'string', (r.out && String(r.out.content).slice(0, 24)) || r.err);
  r = cli('usage');
  report('usage 成本归集结构(mock 不扣费,台账为空)', r.code === 0 && r.out && r.out.projects !== undefined && r.out.unlabeled && typeof r.out.unlabeled.net === 'number', JSON.stringify((r.out && r.out.unlabeled) || {}).slice(0, 60));
  r = cli('usage', 'p_not_exist');
  report('usage 无记录项目 → exit 4', r.code === 4, 'exit=' + r.code);
  r = cli('jobs');
  report('jobs 任务列表', r.code === 0 && Array.isArray(r.out.jobs), '');
  r = cli('state-get', '--out', CFG_DIR + '/snap.json');
  report('state-get 落盘', r.code === 0 && fs.existsSync(CFG_DIR + '/snap.json'), '');

  // ---- 协作记忆(headless 播种/迁移:零 LLM 零计费,与浏览器同一份种子表) ----
  r = cli('memory', 'list');
  const memBefore = (r.out && r.out.total) || 0;
  report('memory list 读回记忆桶', r.code === 0 && Array.isArray(r.out.list), 'total=' + memBefore);
  await sleep(1100); // wf 端点限流
  r = cli('memory', 'seed');
  report('memory seed 播种(标准沉淀 + 知识库种子,零计费)', r.code === 0 && r.out && r.out.changed === true && r.out.added.length === 7 && r.out.total === memBefore + 7, 'exit=' + r.code + ' ' + JSON.stringify(r.out || {}).slice(0, 90));
  r = cli('memory', 'list');
  report('播种条目同通道读回(与浏览器条目同形:text/time/scope + kb)', r.code === 0 && r.out.total === memBefore + 7 && r.out.list.filter(m => m.kb).length === 5, 'total=' + (r.out && r.out.total));
  r = cli('memory', 'list', '--scope', '分镜', '--recall', '五段式');
  report('播种条目可被召回算法取到(headless 提示词即刻吃到)', r.code === 0 && (r.out.recalled || []).some(m => String(m.text).includes('五段式标准结构')), JSON.stringify((r.out && r.out.recalled || []).map(m => m.scope)));
  await sleep(1100);
  r = cli('memory', 'seed');
  report('重复播种幂等(changed=false,不重复种)', r.code === 0 && r.out && r.out.changed === false && r.out.added.length === 0, JSON.stringify(r.out || {}).slice(0, 80));
  await sleep(1100);
  r = cli('memory', 'seed', '--scope', '生成');
  report('空板播种如实报错(不静默空成功)', r.code !== 0 && /没有登记的记忆种子/.test(String((r.out && r.out.error) || r.err)), 'exit=' + r.code + ' ' + String((r.out && r.out.error) || r.err).slice(0, 60));
  await sleep(1100);
  r = cli('memory', 'migrate', '--from', '构思', '--to', '导演');
  report('空板迁移如实报错(旧板名下无条目)', r.code !== 0 && /没有记忆条目/.test(String((r.out && r.out.error) || r.err)), 'exit=' + r.code + ' ' + String((r.out && r.out.error) || r.err).slice(0, 60));
  r = cli('memory', 'bogus');
  report('memory 未知子命令 → exit 2(用法含 seed|migrate)', r.code === 2 && /seed\|migrate/.test(String((r.out && r.out.error) || r.err)), 'exit=' + r.code);

  /* ---- memory add 的满桶淘汰(W103):桶被自动回流条占满时,用户新加一条不该挤掉别的用户条 ----
   * add 的写入面已改经 WfCore.memWrite(与六处回流写入点同一份),淘汰优先级对用户写入面一并生效。
   * 夹具直打 PUT /api/state 灌到刚好 MEM_MAX 条(2 条用户沉淀 + 其余自动回流),再走真实 CLI 命令。
   * 放在记忆段末尾:整组 agentMemory 被夹具替换,后续用例不再读记忆桶。 */
  {
    const W = require(ROOT + '/js/wf-core.js');
    const tk = JSON.parse(fs.readFileSync(CFG_DIR + '/config.json', 'utf8')).token;
    const api = async (method, p, body) => {
      const res = await fetch(BASE + p, { method, headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + tk }, body: body ? JSON.stringify(body) : undefined });
      return res.json();
    };
    const capUser = ['用户要求记住:女主统一叫林晚晴', '用户要求记住:夜戏一律偏冷色'];
    const capMem = capUser.map(t => ({ text: t, time: '2026-08-27 10:00:00', scope: '分镜' }))
      .concat(Array.from({ length: W.MEM_MAX - capUser.length }, (_, i) => (
        { text: '分镜闭环回流·占位 ' + i, time: '2026-08-27 11:00:00', scope: '分镜', fb: 'sb:cap' + i })));
    const cur = await api('GET', '/api/state');
    await api('PUT', '/api/state', { rev: +((cur.data && cur.data.rev) || 0), changes: { meta: { agentMemory: capMem } } });
    r = cli('memory', 'list');
    report('满桶夹具就位(恰好 MEM_MAX 条:2 条用户沉淀 + 其余自动回流)',
      r.code === 0 && r.out.total === W.MEM_MAX && (r.out.list || []).filter(m => m.fb).length === W.MEM_MAX - 2,
      'total=' + (r.out && r.out.total));
    const added = cli('memory', 'add', '--text', '用户要求记住:雨夜戏一律手持', '--scope', '分镜');
    r = cli('memory', 'list');
    const memCap = (r.out && r.out.list) || [];
    report('memory add 满桶时仍守住 MEM_MAX(桶不被顶破)',
      added.code === 0 && r.code === 0 && memCap.length === W.MEM_MAX, 'exit=' + added.code + ' 条数 ' + memCap.length);
    report('已有的用户条一条不少,新加那条在桶尾(裸 slice 会砍掉最早那条用户条)',
      capUser.every(t => memCap.some(m => m.text === t)) && memCap[memCap.length - 1].text === '用户要求记住:雨夜戏一律手持',
      JSON.stringify(memCap.filter(m => /^用户要求记住:/.test(m.text || '')).map(m => m.text)));
    report('出局的是最旧那条自动回流条(sb:cap0 出局,sb:cap1 仍在)',
      !memCap.some(m => m.fb === 'sb:cap0') && memCap.some(m => m.fb === 'sb:cap1'),
      JSON.stringify(memCap.map(m => m.fb || '-')).slice(0, 160));
  }

  // ---- workflow 统一工作流状态(domain.js 单源口径) ----
  r = cli('workflow', pid);
  report('workflow 项目级(steps+recommendedAction)', r.code === 0 && Array.isArray(r.out.steps) && !!r.out.recommendedAction, (r.out && r.out.recommendedAction && r.out.recommendedAction.key) || '');
  r = cli('workflow', pid, epid);
  report('workflow 分集级(未出片 → ready/gen)', r.code === 0 && r.out.status === 'ready' && r.out.action && r.out.action.key === 'gen' && r.out.counts.total === 2, JSON.stringify((r.out && r.out.counts) || {}));
  r = cli('workflow', 'p_not_exist');
  report('workflow 不存在项目 → exit 4', r.code === 4, 'exit=' + r.code);

  // ---- 主线中段流程模板(只读零计费):CLI 与 MCP 同一份产出 ----
  {
    const FlowTpl = require(ROOT + '/js/flow-tpl.js');
    r = cli('flow-template'); // 不给 pid:静态模板,不读状态也不打服务端
    const staticTpl = r.out;
    report('flow-template 静态模板(中段七步,不读项目状态)',
      r.code === 0 && staticTpl && staticTpl.segment === 'mid' && staticTpl.steps.length === 7
      && staticTpl.steps.every(s => s.status === (s.optional ? 'optional' : null) && s.args.every(a => a.from)),
      'steps=' + ((staticTpl && staticTpl.steps || []).length));
    r = cli('flow-template', 'gen', pid); // 有分镜未出片:next 落到批量生成,上游未齐的那几步如实进 gaps
    report('flow-template 生成段带状态(next 落到批量生成;ready 与 gaps 一致)',
      r.code === 0 && r.out && r.out.next && r.out.next.cmd === 'episode.generateVideos'
      && r.out.ready === !r.out.gaps.length && r.out.gaps.every(g => g.code && g.label && g.stage),
      JSON.stringify((r.out && r.out.next) || {}) + ' gaps=' + JSON.stringify((r.out && r.out.gaps || []).map(g => g.code)));
    r = cli('flow-template', 'mid', pidB); // 项目 B 只有一个主体,无剧本无分集
    report('flow-template 缺前置如实进 gaps 且 ready=false(不空成功)',
      r.code === 0 && r.out && r.out.ready === false && (r.out.gaps || []).some(g => g.code === 'no-script'),
      JSON.stringify((r.out && r.out.gaps) || []).slice(0, 80));
    r = cli('flow-template', 'bogus');
    report('flow-template 未知流程段 → exit 2(附可用清单)', r.code === 2 && /flow-template \[mid\|/.test(String((r.out && r.out.error) || '')), 'exit=' + r.code);
    r = cli('flow-template', 'mid', 'p_not_exist');
    report('flow-template 不存在项目 → exit 4', r.code === 4, 'exit=' + r.code);
    // MCP 探测:工具是 CLI 的薄包装,同参产出应与上面逐字节相同(mcp.js 起 cli.js 子进程,沿用同一配置目录)
    const reqs = [
      { jsonrpc: '2.0', id: 1, method: 'tools/list' },
      { jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'hujing_flow_template', arguments: { segment: 'gen', pid } } },
      { jsonrpc: '2.0', id: 3, method: 'prompts/get', params: { name: 'hujing_mid_pipeline', arguments: { pid } } },
    ];
    const mcp = spawnSync(process.execPath, [ROOT + '/mcp.js'], { input: reqs.map(x => JSON.stringify(x)).join('\n') + '\n', encoding: 'utf8', env: CLI_ENV, timeout: 30000 });
    const byId = {};
    String(mcp.stdout || '').trim().split('\n').filter(Boolean).forEach(l => { try { const m = JSON.parse(l); byId[m.id] = m; } catch (_) {} });
    const tools = ((byId[1] && byId[1].result || {}).tools || []).map(t => t.name);
    report('MCP tools/list 探测到中段流程模板工具', tools.includes('hujing_flow_template'), tools.length + ' 工具');
    let mcpTpl = null;
    try { mcpTpl = JSON.parse(byId[2].result.content[0].text); } catch (_) {}
    report('MCP hujing_flow_template 与 CLI 同参产出逐字节相同(薄包装,零计费)',
      !!mcpTpl && JSON.stringify(mcpTpl) === JSON.stringify(cli('flow-template', 'gen', pid).out),
      mcpTpl ? 'next=' + JSON.stringify(mcpTpl.next) : String(mcp.stderr || '').slice(-80));
    const ptxt = (((byId[3] && byId[3].result || {}).messages || []).map(m => m.content && m.content.text) || []).join('\n');
    report('MCP hujing_mid_pipeline 正文由同一份模板渲染(步意/断点码齐全)',
      ptxt.includes(pid) && FlowTpl.template('mid', null).steps.every(s => ptxt.includes(s.note) && s.stop.every(x => ptxt.includes(x.code))),
      ptxt.length + ' 字');
  }

  // ---- 第四阶段交付检查:release-check / release(与前端 Release.collect 同口径) ----
  r = cli('release-check');
  report('release-check 缺 pid → exit 2(含用法)', r.code === 2 && /用法|release-check.*pid/.test(String((r.out && r.out.error) || r.err || '')), 'exit=' + r.code + ' ' + String((r.out && r.out.error) || r.err).slice(0, 50));
  r = cli('release-check', 'p_not_exist_xyz');
  report('release-check 不存在 pid → exit 4', r.code === 4, 'exit=' + r.code + ' ' + String((r.out && r.out.error) || r.err).slice(0, 50));
  r = cli('release-check', pid); // 基线项目(有 2 集 2 镜,有剧本,但无审片/无 done 状态) → 门 fail,overall=fail
  // 注:CLI 侧 _releaseGates 实现了 7 项核心门(G1主线/G3审片/G4过期/G5未确认/G6失败/G9主体缺图/G10计费账目),G2 issues/G7合规/G8真人素材因需前端浏览器模块(Compliance/HumanReview/Issues 事件/问题中心 DOM)暂未 CLI 同口径
  const gateCountExpected = 7;
  report('release-check 基线项目 → exit 0 + 结构齐全(' + gateCountExpected + ' 核心门 + overall/score)', r.code === 0 && r.out && r.out.projectId === pid && Array.isArray(r.out.gates) && r.out.gates.length === gateCountExpected && typeof r.out.overall === 'string' && typeof r.out.score === 'number',
    'overall=' + (r.out && r.out.overall) + ' gates=' + (r.out && r.out.gates && r.out.gates.length) + ' score=' + (r.out && r.out.score));
  const baselineOverall = r.out && r.out.overall;
  const baselineFails = r.out && r.out.fails;
  report('release-check 基线项目 overall=fail(主线未完成/无审片)', baselineOverall === 'fail' && baselineFails >= 2, 'overall=' + baselineOverall + ' fails=' + baselineFails);
  r = cli('release', pid); // 无 --force,门未通过 → exit 5(发布门未通过)
  report('release 基线项目无 --force → exit 5(发布门未通过)', r.code === 5 && /发布门未通过/.test(String((r.out && r.out.error) || r.err || '')), 'exit=' + r.code + ' ' + String((r.out && r.out.error) || r.err).slice(0, 60));
  r = cli('release', pid, '--force', '--note', '冒烟强制打版本 v1'); // --force 无视门禁 → 写 releases[] 入 state 后回 digest/ver
  report('release --force → exit 0 + digest/ver/forced=true', r.code === 0 && r.out && r.out.ok === true && typeof r.out.digest === 'string' && /^RLS_/.test(r.out.digest) && typeof r.out.ver === 'number' && r.out.forced === true,
    JSON.stringify(r.out || {}).slice(0, 80));
  r = cli('release-check', pid); // 再次 check 应有 releases 历史(上 5 条)
  report('release-check 打版本后 releases 回填 1 条', r.code === 0 && r.out && Array.isArray(r.out.releases) && r.out.releases.length === 1 && r.out.releases[0].digest && r.out.releases[0].gateOverall === baselineOverall,
    'releases=' + JSON.stringify(r.out && r.out.releases));
  r = cli('release', 'p_not_exist_xyz', '--force');
  report('release 不存在 pid → exit 4', r.code === 4, 'exit=' + r.code);

  // ---- 发布留痕的命令化出口:exec project.release(与上面 release 子命令同一条链路)+ MCP 工具 ----
  {
    r = cli('exec');
    report('exec 用法清单含 project.release(词表由 cmd-registry 单源生成)',
      /project\.release/.test(String((r.out && r.out.error) || r.err || '')), 'exit=' + r.code);
    r = cli('exec', 'project.release');
    report('exec project.release 缺 --pid → exit 2', r.code === 2 && /缺 --pid/.test(String((r.out && r.out.error) || r.err || '')), 'exit=' + r.code);
    r = cli('exec', 'project.release', '--pid', 'p_not_exist_xyz');
    report('exec project.release 不存在项目 → blocked not-found exit 4', r.code === 4 && r.out && r.out.error && r.out.error.code === 'not-found', 'exit=' + r.code);
    r = cli('exec', 'project.release', '--pid', pid); // 基线项目门未过
    report('exec project.release 未过门 → blocked gate-blocked exit 2(回执带未过门项)',
      r.code === 2 && r.out && r.out.error && r.out.error.code === 'gate-blocked' && ((r.out.result.gate || {}).blockers || []).length > 0,
      'exit=' + r.code + ' ' + JSON.stringify((r.out && r.out.error) || {}).slice(0, 70));
    r = cli('exec', 'project.release', '--pid', pid, '--force', '--note', '冒烟命令化打版本 v2');
    report('exec project.release --force → ok + digest/ver 递增 + forced=true + 零计费(无 cost 字段)',
      r.code === 0 && r.out && r.out.ok === true && /^RLS_/.test(r.out.result.digest) && r.out.result.ver === 2 && r.out.result.forced === true && r.out.cost === undefined,
      'exit=' + r.code + ' ' + JSON.stringify((r.out && r.out.result) || r.out).slice(0, 90));
    r = cli('release-check', pid);
    report('两条出口写的是同一份留痕(releases 累加到 2 条,ver 逐条递增)',
      r.code === 0 && (r.out.releases || []).length === 2 && r.out.releases[1].ver === r.out.releases[0].ver + 1 && r.out.releases[1].note === '冒烟命令化打版本 v2',
      JSON.stringify((r.out && r.out.releases || []).map(x => x.ver + ':' + x.note)));
    r = cli('exec', 'project.release', '--pid', pidB); // pidB 无分集
    report('exec project.release 空项目 → blocked no-episodes exit 2(明确错误码,不空成功)',
      r.code === 2 && r.out && r.out.error && r.out.error.code === 'no-episodes', 'exit=' + r.code + ' ' + JSON.stringify((r.out && r.out.error) || {}).slice(0, 70));
    // MCP:hujing_release 是同一条链路的薄包装(build 拼 exec project.release,不另走第二条实现)
    const reqs = [
      { jsonrpc: '2.0', id: 1, method: 'tools/list' },
      { jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'hujing_release', arguments: { pid: pidB } } },
      { jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'hujing_release', arguments: { pid, note: 'MCP 打版本 v3', force: true } } },
    ];
    const mcp = spawnSync(process.execPath, [ROOT + '/mcp.js'], { input: reqs.map(x => JSON.stringify(x)).join('\n') + '\n', encoding: 'utf8', env: CLI_ENV, timeout: 30000 });
    const byId = {};
    String(mcp.stdout || '').trim().split('\n').filter(Boolean).forEach(l => { try { const m = JSON.parse(l); byId[m.id] = m; } catch (_) {} });
    const tools = ((byId[1] && byId[1].result || {}).tools || []).map(t => t.name);
    report('MCP tools/list 含发布留痕工具', tools.includes('hujing_release'), tools.length + ' 工具');
    report('MCP 空项目如实 isError(不静默成功)', !!(byId[2] && byId[2].result && byId[2].result.isError) && /no-episodes/.test(byId[2].result.content[0].text),
      String((byId[2] && byId[2].result && byId[2].result.content[0].text) || mcp.stderr).slice(0, 80));
    let mcpRel = null;
    try { mcpRel = JSON.parse(byId[3].result.content[0].text); } catch (_) {}
    report('MCP hujing_release 走 exec 同链路(结构与 CLI 逐字段同形,ver 继续递增)',
      !!mcpRel && mcpRel.ok === true && /^RLS_/.test(mcpRel.result.digest) && mcpRel.result.ver === 3 && mcpRel.result.forced === true,
      mcpRel ? JSON.stringify(mcpRel.result).slice(0, 90) : String(mcp.stderr || '').slice(-80));
  }

  // ---- 错误路径语义 exit code ----
  r = cli('project-show', 'p_not_exist');
  report('不存在项目 → exit 4', r.code === 4, 'exit=' + r.code);
  r = cli('export', pid, epid);
  report('未合成 export → exit 2', r.code === 2, 'exit=' + r.code);
  r = cli('shot-set', pid, epid, sid); // 缺 --patch
  report('缺参数 → exit 2', r.code === 2, 'exit=' + r.code);
  r = cli('no-such-cmd');
  report('未知命令 → exit 2', r.code === 2, 'exit=' + r.code);

  // ---- 登出 ----
  r = cli('logout');
  report('logout', r.code === 0 && r.out.logouted === true, '');
  r = cli('whoami');
  report('登出后 whoami → exit 3', r.code === 3, 'exit=' + r.code);

  const failed = results.filter(x => !x.ok);
  console.log('\n==== CLI 冒烟:' + (results.length - failed.length) + '/' + results.length + ' 通过 ====');
  process.exit(failed.length ? 1 : 0);
}

process.on('exit', cleanup);
process.on('SIGINT', () => { cleanup(); process.exit(130); });
main().catch(e => { console.error('SMOKE ERROR:', e && e.message); cleanup(); process.exit(1); });
