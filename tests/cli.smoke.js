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
  r = cli('exec', 'episode.bogus', '--pid', pid, '--epid', epid);
  report('exec 未知命令 → exit 2', r.code === 2 && /未注册命令|可用/.test(String(r.out && r.out.error || r.err)), 'exit=' + r.code);

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

  // ---- workflow 统一工作流状态(domain.js 单源口径) ----
  r = cli('workflow', pid);
  report('workflow 项目级(steps+recommendedAction)', r.code === 0 && Array.isArray(r.out.steps) && !!r.out.recommendedAction, (r.out && r.out.recommendedAction && r.out.recommendedAction.key) || '');
  r = cli('workflow', pid, epid);
  report('workflow 分集级(未出片 → ready/gen)', r.code === 0 && r.out.status === 'ready' && r.out.action && r.out.action.key === 'gen' && r.out.counts.total === 2, JSON.stringify((r.out && r.out.counts) || {}));
  r = cli('workflow', 'p_not_exist');
  report('workflow 不存在项目 → exit 4', r.code === 4, 'exit=' + r.code);

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
