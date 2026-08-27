#!/usr/bin/env node
/* ============ tests/integration.js 服务器级集成测试(零依赖:真实 server.js 子进程 + HTTP) ============
 * 动机(十二轮):refundOperation 的 item.char 属性名错误让所有退款路径 500——单元测试只覆盖
 * billing.js 纯函数,发现不了 server.js 编排层的崩溃。本套件直接起真实服务进程打 HTTP:
 *   1. 生图上游失败 → 自动退费闭环(余额恢复 + operation refunded,修复前 500 且不退款)
 *   2. 退款端点幂等重放(修复前 500)
 *   3. executing 在途拒退(十二轮:一律 409)
 *   4. 崩溃残留看门狗(sweepStaleOps:30 分钟 executing 无活动 job → 服务端自动退款)
 *   5. 已交付拒退(403 失败关闭)
 * 隔离:MV_DATA_DIR/MV_UPLOADS_DIR/MV_CONFIG 指向临时目录,不触碰真实用户数据/密钥/缓存;
 *       VOLC_API_KEY 给假值——生图端点通过 503 闸门后在真实上游处快速失败(401/网络错误/超时),
 *       三种失败殊途同归走 failRefund→refundOperation,正是被测路径。
 * 用法:node tests/integration.js(需要能起子进程;上游网络不可达时超时兜底 volcTimeoutMs=5s)
 * 约束:不依赖浏览器/真实密钥;临时目录用后即删。 */
'use strict';
const fs = require('fs');
const path = require('path');
const http = require('http');
const os = require('os');
const { spawn } = require('child_process');

const ROOT = path.join(__dirname, '..');
const PORT = 8161;
const BASE = `http://127.0.0.1:${PORT}`;
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'mv-it-'));

let PASS = 0, FAIL = 0;
function report(name, cond, detail) {
  if (cond) { PASS++; console.log('PASS | ' + name); }
  else { FAIL++; console.log('FAIL | ' + name + (detail ? ' | ' + detail : '')); }
}
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

/* ---------- HTTP 薄封装 ---------- */
function req(method, p, body, token, headers) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const r = http.request(BASE + p, {
      method,
      headers: Object.assign(
        { 'Content-Type': 'application/json' },
        data ? { 'Content-Length': Buffer.byteLength(data) } : {},
        token ? { Authorization: 'Bearer ' + token } : {},
        headers || {},
      ),
    }, res => {
      let buf = '';
      res.on('data', d => { buf += d; });
      res.on('end', () => {
        let j = null;
        try { j = JSON.parse(buf); } catch (_) {}
        resolve({ status: res.statusCode, code: j && j.code, msg: j && j.msg || j && j.error, data: j && j.data, raw: buf, headers: res.headers });
      });
    });
    r.on('error', reject);
    r.setTimeout(30000, () => { r.destroy(); reject(new Error('HTTP 超时')); });
    if (data) r.write(data);
    r.end();
  });
}

/* ---------- 临时目录与配置 ---------- */
fs.mkdirSync(path.join(TMP, 'data'), { recursive: true });
fs.mkdirSync(path.join(TMP, 'uploads'), { recursive: true });
fs.writeFileSync(path.join(TMP, 'config.json'), JSON.stringify({
  registerOpen: true, genCacheDays: 0, volcTimeoutMs: 5000, host: '127.0.0.1',
}));

const OPS = () => JSON.parse(fs.readFileSync(path.join(TMP, 'data', 'operations.json'), 'utf8'));
const WALLETS = () => path.join(TMP, 'data', 'wallets');
const walletFile = uid => path.join(WALLETS(), uid + '.json');

/* 直接落一份 operation + 钱包扣费条目(模拟"扣费后进程崩溃/已交付"等编排层到不了的状态) */
function craftOp(userId, opId, action, status, chargeIdem, ageMs, rh) {
  const ops = fs.existsSync(path.join(TMP, 'data', 'operations.json')) ? OPS() : { list: [] };
  ops.list.push({
    userId, opId, action, endpoint: 'volc/image', requestHash: rh || 'x', status,
    chargeIdem, createdAt: Date.now() - (ageMs || 0), updatedAt: Date.now() - (ageMs || 0),
  });
  fs.writeFileSync(path.join(TMP, 'data', 'operations.json'), JSON.stringify(ops));
  const wf = walletFile(userId);
  const w = fs.existsSync(wf) ? JSON.parse(fs.readFileSync(wf, 'utf8')) : { balance: 0, entries: [] };
  const cost = 2;
  w.entries.push({ seq: w.entries.length + 1, ts: Date.now() - (ageMs || 0), type: 'charge', amount: -cost, balanceAfter: w.balance - cost, reason: 'craft:' + opId, idem: chargeIdem });
  w.balance -= cost;
  fs.writeFileSync(wf, JSON.stringify(w));
}

/* 服务端同源请求指纹:与 server.js requestHashOf 一致(剔除计费元数据后 sha256 前 32 位) */
const crypto = require('crypto');
function requestHashOf(obj) {
  const o = Object.assign({}, obj);
  delete o.operationId; delete o.billingAction; delete o.step;
  return crypto.createHash('sha256').update(JSON.stringify(o)).digest('hex').slice(0, 32);
}
/* 直接落一条结果日志(模拟"已交付但响应丢失"后的重放恢复) */
function craftResult(userId, opId, action, payload) {
  const fp = path.join(TMP, 'data', 'results.json');
  const db = fs.existsSync(fp) ? JSON.parse(fs.readFileSync(fp, 'utf8')) : { list: [] };
  db.list.push({ userId, opId, action, endpoint: 'volc/image', payload, savedAt: Date.now(), claimed: false });
  fs.writeFileSync(fp, JSON.stringify(db));
}

/* 直接落一条任务中心记录(模拟"已终态的任务"轮询短路) */
function craftJob(userId, upstreamId, status, extra) {
  const fp = path.join(TMP, 'data', 'jobs.json');
  const db = fs.existsSync(fp) ? JSON.parse(fs.readFileSync(fp, 'utf8')) : { list: [] };
  db.list.unshift(Object.assign({
    id: 'job_' + upstreamId, upstreamId, userId, projectId: null, episodeId: null, shotId: 's_craft',
    inputHash: 'h_craft', status, createdAt: Date.now(), updatedAt: Date.now(), videoUrl: '', remoteUrl: '',
    billingOperationId: null, billingAction: null, billingCost: 0, refunded: false,
  }, extra || {}));
  fs.writeFileSync(fp, JSON.stringify(db));
}

/* ---------- 主流程 ---------- */
let server = null;
async function main() {
  server = spawn(process.execPath, [path.join(ROOT, 'server.js')], {
    env: Object.assign({}, process.env, {
      PORT: String(PORT),
      MV_DATA_DIR: path.join(TMP, 'data'),
      MV_UPLOADS_DIR: path.join(TMP, 'uploads'),
      MV_CONFIG: path.join(TMP, 'config.json'),
      VOLC_API_KEY: 'fake-key-for-integration-test',
      MOCK_LLM: '1', // wf 工作流端点测试:LLM 调用走 mock(不扣费/不调上游),验证编排与 state 写回
    }),
    stdio: 'ignore',
  });
  /* 等服务就绪(health 免 token) */
  let up = false;
  for (let i = 0; i < 60 && !up; i++) {
    await sleep(500);
    try { up = (await req('GET', '/api/health')).status === 200; } catch (_) {}
  }
  if (!up) throw new Error('服务 30s 未就绪');

  /* 注册(首个用户默认管理员)+ 充值 */
  const reg = await req('POST', '/api/auth/register', { username: 'it_admin', password: 'it-pass-123' });
  report('注册成功', reg.status === 200 && reg.data && reg.data.token, reg.msg);
  const token = reg.data && reg.data.token;
  const uid = reg.data && reg.data.user && reg.data.user.id;
  const add = await req('POST', '/api/admin/credits', { username: 'it_admin', delta: 100, reason: 'integration' }, token);
  report('管理员充值 +100', add.status === 200, add.msg);
  let wallet = (await req('GET', '/api/wallet', null, token)).data;
  const BASE_BAL = wallet.balance; // 注册赠送 + 充值后的基线(断言全部相对基线,不依赖赠送数额)
  report('充值后余额正确', wallet.balance >= 100, '实际 ' + wallet.balance);

  /* ============ 测试 1(P0 回归):生图上游失败 → 自动退费闭环 ============
   * 修复前:failRefund→proxyRefund→refundOperation 读 item.char(undefined).amount 抛 TypeError →
   * 响应 500 且扣费悬挂不退。修复后:502/504 + 余额恢复 + operation refunded。 */
  const img = await req('POST', '/api/volc/image', { prompt: '集成测试图', billingAction: 'image.gen', operationId: 'it.img1' }, token);
  report('生图失败不 500(502/504 如实报错)', img.status !== 500, '实际 HTTP ' + img.status + ' ' + img.msg);
  wallet = (await req('GET', '/api/wallet', null, token)).data;
  report('自动退费:余额恢复基线', wallet.balance === BASE_BAL, '实际 ' + wallet.balance + '(基线 ' + BASE_BAL + ')');
  const ops1 = OPS().list.filter(o => o.opId === 'it.img1');
  report('operation 落 refunded 终态', ops1.length > 0 && ops1.every(o => o.status === 'refunded'), JSON.stringify(ops1.map(o => o.status)));
  report('operation 记录含 chargeIdem(退款精确归属依据)', ops1.length > 0 && !!ops1[0].chargeIdem, 'chargeIdem=' + (ops1[0] && ops1[0].chargeIdem));

  /* ============ 测试 2:退款端点幂等重放(修复前此处 500) ============ */
  const rf1 = await req('POST', '/api/billing/refund', { operationId: 'it.img1' }, token);
  report('退款重放 200 幂等(不再 500)', rf1.status === 200 && rf1.data.refunded === 0 && rf1.data.deduped === true, 'HTTP ' + rf1.status + ' ' + JSON.stringify(rf1.data));

  /* ============ 测试 3:executing 一律拒退(十二轮移除陈旧豁免) ============ */
  craftOp(uid, 'it.exec1', 'image.gen', 'executing', `px_${uid}_it.exec1@image.gen`, 0);
  const rf2 = await req('POST', '/api/billing/refund', { operationId: 'it.exec1' }, token);
  report('executing 在途拒退 409', rf2.status === 409, 'HTTP ' + rf2.status + ' ' + rf2.msg);

  /* ============ 测试 4:崩溃残留看门狗(30 分钟 executing 无活动 job → 自动退款) ============ */
  craftOp(uid, 'it.crash1', 'image.gen', 'executing', `px_${uid}_it.crash1@image.gen`, 40 * 60 * 1000);
  const rf3 = await req('POST', '/api/billing/refund', { operationId: 'it.crash1' }, token);
  wallet = (await req('GET', '/api/wallet', null, token)).data;
  const crashOps = OPS().list.filter(o => o.opId === 'it.crash1');
  report('看门狗清算崩溃残留:退款端点触发后 200', rf3.status === 200, 'HTTP ' + rf3.status + ' ' + rf3.msg);
  report('崩溃残留余额已恢复(基线 - exec1 占用 2)', wallet.balance === BASE_BAL - 2, '实际 ' + wallet.balance);
  report('崩溃残留 operation 转 refunded', crashOps.length > 0 && crashOps.every(o => o.status === 'refunded'), JSON.stringify(crashOps.map(o => o.status)));

  /* ============ 测试 5:已交付拒退(403 失败关闭) ============ */
  craftOp(uid, 'it.done1', 'image.gen', 'delivered', `px_${uid}_it.done1@image.gen`, 0);
  const rf4 = await req('POST', '/api/billing/refund', { operationId: 'it.done1' }, token);
  wallet = (await req('GET', '/api/wallet', null, token)).data;
  report('已交付拒退 403', rf4.status === 403, 'HTTP ' + rf4.status + ' ' + rf4.msg);
  report('已交付余额不动(基线 - exec1 2 - done1 2)', wallet.balance === BASE_BAL - 4, '实际 ' + wallet.balance);

  /* ============ 测试 6(十三轮):operation 结果日志——同 opId 重放恢复 + 主动领取 ============
   * 场景:已交付但响应在网络中丢失 → 客户端同 opId 同内容重试;此前 409 结果永久丢失,
   * 现在从结果日志带回已付费结果(recovered:true),不再调上游、不再扣费。 */
  const recBody = { prompt: '结果恢复测试图', billingAction: 'image.gen', operationId: 'it.rec1' };
  craftOp(uid, 'it.rec1', 'image.gen', 'delivered', `px_${uid}_it.rec1@image.gen`, 0, requestHashOf(recBody));
  craftResult(uid, 'it.rec1', 'image.gen', { url: '/uploads/gen/fake_rec.jpeg', remoteUrl: 'https://fake/img.jpeg' });
  const rec1 = await req('POST', '/api/volc/image', recBody, token);
  report('同 opId 重放恢复 200(不再 409)', rec1.status === 200 && rec1.data && rec1.data.recovered === true, 'HTTP ' + rec1.status + ' ' + JSON.stringify(rec1.data));
  report('恢复结果带回已付费 URL', rec1.data && rec1.data.url === '/uploads/gen/fake_rec.jpeg', JSON.stringify(rec1.data));
  wallet = (await req('GET', '/api/wallet', null, token)).data;
  report('恢复不重复扣费', wallet.balance === BASE_BAL - 6, '实际 ' + wallet.balance + '(基线-6:exec1/done1/rec1 各占 2)');
  const g1 = await req('GET', '/api/operations/it.rec1/result', null, token);
  report('结果领取端点 found+claimed', g1.status === 200 && g1.data && g1.data.found === true && g1.data.claimed === true && g1.data.payload.url === '/uploads/gen/fake_rec.jpeg', JSON.stringify(g1.data));
  const g2 = await req('GET', '/api/operations/it.rec1/result', null, token);
  report('重复领取幂等(同一结果)', g2.status === 200 && g2.data && g2.data.found === true && g2.data.payload.url === '/uploads/gen/fake_rec.jpeg', JSON.stringify(g2.data));
  const g3 = await req('GET', '/api/operations/it.none/result', null, token);
  report('无记录 found:false(失败关闭)', g3.status === 200 && g3.data && g3.data.found === false, JSON.stringify(g3.data));

  /* ============ 测试 7(R14 P0):/uploads 路径穿越——借 gen/ 共享前缀读他人私有文件 ============
   * 修复前:/api/thumb?src=/uploads/gen/../<他人uid>/x.png 的 ACL 在未规范化串上判定(gen/ 前缀放行),
   * path.join 折叠后落到他人目录 → 缩略图回传外泄。修复后:normUploadsPath 段级拒 .. → 403。 */
  const reg2 = await req('POST', '/api/auth/register', { username: 'it_victim', password: 'it-pass-456' });
  const token2 = reg2.data && reg2.data.token;
  const uid2 = reg2.data && reg2.data.user && reg2.data.user.id;
  report('第二用户注册成功', !!token2 && !!uid2, reg2.msg);
  const PNG1 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
  const up2 = await req('POST', '/api/upload', { name: 'secret.png', dataBase64: PNG1 }, token2);
  report('他人私有文件上传成功', up2.status === 200 && up2.data && up2.data.url, up2.msg);
  const victimPath = String(up2.data && up2.data.url || ''); // /uploads/<uid2>/<hash>.png
  const travPath = victimPath.replace('/uploads/' + uid2 + '/', '/uploads/gen/../' + uid2 + '/');
  const tTrav = await req('GET', '/api/thumb?src=' + encodeURIComponent(travPath), null, token);
  report('穿越缩略图被 403 拦截', tTrav.status === 403, 'HTTP ' + tTrav.status);
  const up1 = await req('POST', '/api/upload', { name: 'own.png', dataBase64: PNG1 }, token);
  const tOwn = await req('GET', '/api/thumb?src=' + encodeURIComponent(up1.data && up1.data.url || ''), null, token);
  report('本人文件缩略图不受影响(200/302)', tOwn.status === 200 || tOwn.status === 302, 'HTTP ' + tOwn.status);

  /* ============ 测试 8(R14 P1):跨动作退费隔离——同一 opId 用于两个动作,退一个不误退另一个 ============ */
  craftOp(uid, 'it.xact', 'image.gen', 'charged', `px_${uid}_it.xact@image.gen`, 0);
  craftOp(uid, 'it.xact', 'video.gen', 'charged', `px_${uid}_it.xact@video.gen`, 0);
  const rfX1 = await req('POST', '/api/billing/refund', { operationId: 'it.xact', billingAction: 'video.gen' }, token);
  wallet = (await req('GET', '/api/wallet', null, token)).data;
  const xactOps = OPS().list.filter(o => o.opId === 'it.xact');
  report('按动作退费:只退 video.gen 的 2 积分', rfX1.status === 200 && rfX1.data.refunded === 2, JSON.stringify(rfX1.data));
  report('image.gen 记录保持 charged(未误退)', xactOps.some(o => o.action === 'image.gen' && o.status === 'charged'), JSON.stringify(xactOps.map(o => o.action + ':' + o.status)));
  report('video.gen 记录转 refunded', xactOps.some(o => o.action === 'video.gen' && o.status === 'refunded'), JSON.stringify(xactOps.map(o => o.action + ':' + o.status)));
  report('余额只回一笔(基线 -8)', wallet.balance === BASE_BAL - 8, '实际 ' + wallet.balance);
  const rfX2 = await req('POST', '/api/billing/refund', { operationId: 'it.xact', billingAction: 'image.gen' }, token);
  wallet = (await req('GET', '/api/wallet', null, token)).data;
  report('另一动作可独立退费(基线 -6)', rfX2.status === 200 && rfX2.data.refunded === 2 && wallet.balance === BASE_BAL - 6, JSON.stringify(rfX2.data) + ' 余额 ' + wallet.balance);

  /* ============ 测试 9(R14 P2):终态 job 轮询短路——succeeded/failed 回本地登记态,不再打上游 ============
   * (假 key 下真实上游必 401/502;拿到本地终态即证明未打上游) */
  craftJob(uid, 'up_term1', 'succeeded', { videoUrl: '/uploads/gen/fake_term.mp4', remoteUrl: 'https://fake/v.mp4' });
  craftJob(uid, 'up_term2', 'failed', { error: '上游生成失败' });
  const pTerm1 = await req('GET', '/api/volc/video/up_term1', null, token);
  report('succeeded 任务回本地登记态(含 videoUrl)', pTerm1.status === 200 && pTerm1.data && pTerm1.data.status === 'succeeded' && pTerm1.data.videoUrl === '/uploads/gen/fake_term.mp4', 'HTTP ' + pTerm1.status + ' ' + JSON.stringify(pTerm1.data));
  const pTerm2 = await req('GET', '/api/volc/video/up_term2', null, token);
  report('failed 任务回本地登记态', pTerm2.status === 200 && pTerm2.data && pTerm2.data.status === 'failed', 'HTTP ' + pTerm2.status + ' ' + JSON.stringify(pTerm2.data));

  /* ============ 测试 10(R14 P2):管理员调整 5 秒窗口幂等——双击/重试同参数只入账一次 ============ */
  wallet = (await req('GET', '/api/wallet', null, token)).data;
  const balBeforeAdmin = wallet.balance;
  const adm1 = await req('POST', '/api/admin/credits', { username: 'it_admin', delta: 7, reason: 'idem-test' }, token);
  const adm2 = await req('POST', '/api/admin/credits', { username: 'it_admin', delta: 7, reason: 'idem-test' }, token);
  wallet = (await req('GET', '/api/wallet', null, token)).data;
  report('管理员调整两次请求均 200', adm1.status === 200 && adm2.status === 200, adm1.msg + ' / ' + adm2.msg);
  report('同窗口重复调整只入账一次(+7)', wallet.balance === balBeforeAdmin + 7, '实际 ' + wallet.balance + '(期前 ' + balBeforeAdmin + ')');

  /* ============ 测试 11(R14 P2):登出吊销 cookie 侧会话 ============ */
  const login2 = await req('POST', '/api/auth/login', { username: 'it_victim', password: 'it-pass-456' });
  const cookie2 = 'mv_token=' + (login2.data && login2.data.token);
  const lo = await req('POST', '/api/auth/logout', {}, null, { Cookie: cookie2 });
  report('cookie 会话登出 200', lo.status === 200, 'HTTP ' + lo.status);
  const meAfter = await req('GET', '/api/auth/me', null, null, { Cookie: cookie2 });
  report('登出后 cookie 会话已吊销(401)', meAfter.status === 401, 'HTTP ' + meAfter.status);

  /* ============ 测试 12(R19):邀请码端到端——创建/加入/重复加入/错码/刷新后旧码失效 ============ */
  const tc = await req('POST', '/api/team/create', { name: '集成测试剧组' }, token);
  const invCode = tc.data && tc.data.team && tc.data.team.inviteCode;
  const teamId = tc.data && tc.data.team && tc.data.team.id;
  report('创建项目组带回邀请码', tc.status === 200 && /^MV-/.test(String(invCode || '')), JSON.stringify(tc.data && tc.data.team && { inviteCode: invCode }));
  const jBad = await req('POST', '/api/team/join', { code: 'MV-XXXXXX' }, token2);
  report('错误邀请码 404', jBad.status === 404, 'HTTP ' + jBad.status + ' ' + jBad.msg);
  const jOk = await req('POST', '/api/team/join', { code: invCode }, token2);
  report('凭邀请码加入成功', jOk.status === 200 && jOk.data.team.members.some(m => m.userId === uid2 && m.role === 'member'), 'HTTP ' + jOk.status + ' ' + jOk.msg);
  const jDup = await req('POST', '/api/team/join', { code: invCode }, token2);
  report('重复加入 400(已是成员)', jDup.status === 400, 'HTTP ' + jDup.status + ' ' + jDup.msg);
  const jSmall = await req('POST', '/api/team/join', { code: String(invCode || '').toLowerCase() }, token2);
  report('邀请码大小写不敏感(小写也识别为成员)', jSmall.status === 400, 'HTTP ' + jSmall.status + ' ' + jSmall.msg);
  const rf3i = await req('POST', '/api/team/invite/refresh', { teamId }, token);
  const newCode = rf3i.data && rf3i.data.inviteCode;
  report('负责人刷新邀请码(新码不同)', rf3i.status === 200 && newCode && newCode !== invCode, JSON.stringify(rf3i.data));
  const jOld = await req('POST', '/api/team/join', { code: invCode }, token2);
  report('旧邀请码刷新后即失效(404)', jOld.status === 404, 'HTTP ' + jOld.status + ' ' + jOld.msg);
  const rfDeny = await req('POST', '/api/team/invite/refresh', { teamId }, token2);
  report('非负责人刷新邀请码 403', rfDeny.status === 403, 'HTTP ' + rfDeny.status + ' ' + rfDeny.msg);

  /* ============ 测试 13(R19):上传原子写——tmp_ 残留不计配额、不入文件列表 ============ */
  const dir2 = path.join(TMP, 'uploads', uid2);
  fs.writeFileSync(path.join(dir2, 'tmp_craftresidue'), Buffer.alloc(1024 * 1024)); // 1MB 假残留
  const old = new Date(Date.now() - 2 * 3600 * 1000); // mtime 拨到 2 小时前:持锁顺带清理只动超 1 小时的残留
  fs.utimesSync(path.join(dir2, 'tmp_craftresidue'), old, old);
  const list2 = await req('GET', '/api/uploads', null, token2);
  const names2 = (list2.data && list2.data.files || []).map(f => f.name);
  report('文件列表不含 tmp_ 残留', !names2.some(n => n.startsWith('tmp_')), names2.join(','));
  report('配额统计不含 tmp_ 残留(<1MB)', (list2.data && list2.data.usedBytes) < 1024 * 1024, '实际 ' + (list2.data && list2.data.usedBytes));
  const upClean = await req('POST', '/api/upload', { name: 'clean.png', dataBase64: PNG1 }, token2);
  report('超 1 小时 tmp_ 残留被上传顺带清理', upClean.status === 200 && !fs.existsSync(path.join(dir2, 'tmp_craftresidue')), 'HTTP ' + upClean.status);

  /* ============ 测试 14(R19):audit.jsonl 只追加审计——资金变动逐行落盘可对账 ============ */
  const auditFile = path.join(TMP, 'data', 'audit.jsonl');
  const auditLines = fs.existsSync(auditFile) ? fs.readFileSync(auditFile, 'utf8').trim().split('\n').map(l => { try { return JSON.parse(l); } catch (_) { return null; } }).filter(Boolean) : [];
  report('审计日志存在且含钱包条目', auditLines.length > 0 && auditLines.some(l => l.kind === 'wallet' && l.uid === uid), '行数 ' + auditLines.length);
  report('审计含管理员充值记录(idem 可对账)', auditLines.some(l => l.kind === 'wallet' && String(l.idem || '').startsWith('admin_') && l.amount === 100), JSON.stringify(auditLines.filter(l => l.kind === 'wallet').slice(-3)));

  /* ============ 测试 15(R19):视频任务取消——在途任务转 cancelled + 内部退款;幂等/越权/终态语义 ============
   * 在途视频 operation 恒为 executing(交付发生在轮询 succeeded),客户端退款端点一律 409;
   * 取消走服务端内部退款(refundDecision:executing refundable),晚到上游成功由交付守卫拦下。 */
  wallet = (await req('GET', '/api/wallet', null, token)).data;
  const balBeforeCancel = wallet.balance;
  craftOp(uid, 'it.cancel1', 'video.gen', 'executing', `px_${uid}_it.cancel1@video.gen`, 0);
  craftJob(uid, 'up_cancel1', 'running', { billingOperationId: 'it.cancel1', billingAction: 'video.gen' });
  const cc1 = await req('POST', '/api/volc/video/up_cancel1/cancel', {}, token);
  report('取消在途任务 200(cancelled+refunded)', cc1.status === 200 && cc1.data && cc1.data.cancelled === true && cc1.data.refunded === true, 'HTTP ' + cc1.status + ' ' + JSON.stringify(cc1.data));
  wallet = (await req('GET', '/api/wallet', null, token)).data;
  report('取消后余额退回(+2)', wallet.balance === balBeforeCancel, '实际 ' + wallet.balance + '(期前 ' + balBeforeCancel + ',扣 2 后退回 2)');
  const pCancel = await req('GET', '/api/volc/video/up_cancel1', null, token);
  report('取消后轮询短路回 cancelled(不查上游)', pCancel.status === 200 && pCancel.data && pCancel.data.status === 'cancelled', 'HTTP ' + pCancel.status + ' ' + JSON.stringify(pCancel.data));
  const cc2 = await req('POST', '/api/volc/video/up_cancel1/cancel', {}, token);
  wallet = (await req('GET', '/api/wallet', null, token)).data;
  report('重复取消幂等(already,不再退)', cc2.status === 200 && cc2.data && cc2.data.already === true && wallet.balance === balBeforeCancel, JSON.stringify(cc2.data) + ' 余额 ' + wallet.balance);
  const ccOther = await req('POST', '/api/volc/video/up_cancel1/cancel', {}, token2);
  report('他人任务取消 403', ccOther.status === 403, 'HTTP ' + ccOther.status);
  const ccNone = await req('POST', '/api/volc/video/up_notexist/cancel', {}, token);
  report('不存在任务取消 404', ccNone.status === 404, 'HTTP ' + ccNone.status);
  const ccTerm = await req('POST', '/api/volc/video/up_term1/cancel', {}, token);
  report('已终态(succeeded)任务取消 409', ccTerm.status === 409, 'HTTP ' + ccTerm.status + ' ' + ccTerm.msg);

  /* ============ 测试 16(P4 A2):跨设备协作版本对比 /compare —— ver 对齐/不对齐、字段结构 ============ */
  // 先写一个项目基线:通过 state PUT 增量推一个项目(含 __ver 和 episodes.__ver,模拟前端 save)
  let s0 = await req('GET', '/api/state', null, token);
  const rev0 = +(s0.data && s0.data.rev || 0);
  const demoPid = 'it_p_compare';
  const demoProject = {
    id: demoPid, name: '协作对比项目', __ver: 1, __lastSaved: Date.now(),
    episodes: [{ id: 'ep_c1', title: 'E1', __ver: 1 }, { id: 'ep_c2', title: 'E2', __ver: 1 }],
  };
  const put1 = await req('PUT', '/api/state', { rev: rev0, changes: { projects: { [demoPid]: demoProject } } }, token);
  report('协作基线项目 PUT state 成功', put1.status === 200 && +(put1.data && put1.data.rev) === rev0 + 1, 'HTTP ' + put1.status + ' rev=' + JSON.stringify(put1.data));
  // 服务端 ver=1,客户端 ver=1 → match=true
  const cmp1 = await req('GET', '/api/projects/' + demoPid + '/compare?ver=1', null, token);
  report('compare ver 对齐 → match=true 字段齐全', cmp1.status === 200 && cmp1.data && cmp1.data.match === true && cmp1.data.serverVer === 1 && Array.isArray(cmp1.data.epidUpdates) && cmp1.data.epidUpdates.length === 2 && cmp1.data.digest === null, JSON.stringify(cmp1.data));
  // 客户端拿过时 ver=0 询问 → match=false,serverVer=1
  const cmp2 = await req('GET', '/api/projects/' + demoPid + '/compare?ver=0', null, token);
  report('compare ver 落后 → match=false', cmp2.status === 200 && cmp2.data && cmp2.data.match === false && +cmp2.data.serverVer >= 1, JSON.stringify(cmp2.data));
  // 项目 bump 到 __ver=3(更新一集)再询问 ver=1 → match=false serverVer=3 epidUpdates 对齐
  const s1 = await req('GET', '/api/state', null, token);
  demoProject.__ver = 3;
  demoProject.__lastSaved = Date.now();
  demoProject.episodes[0].__ver = 5;
  const put2 = await req('PUT', '/api/state', { rev: +s1.data.rev, changes: { projects: { [demoPid]: demoProject } } }, token);
  report('项目 bump 后 state PUT 成功', put2.status === 200, 'HTTP ' + put2.status);
  const cmp3 = await req('GET', '/api/projects/' + demoPid + '/compare?ver=1', null, token);
  report('compare 服务端更新后 match=false + epidUpdates 带回分集 ver', cmp3.status === 200 && cmp3.data && cmp3.data.match === false && cmp3.data.serverVer === 3 && (cmp3.data.epidUpdates[0] && cmp3.data.epidUpdates[0].ver === 5), JSON.stringify(cmp3.data));
  const cmp4 = await req('GET', '/api/projects/not_exist_pid/compare?ver=0', null, token);
  report('compare 不存在项目 → 404', cmp4.status === 404, 'HTTP ' + cmp4.status);

  /* ============ 测试 17(P4 A2):跨设备协作增量更新 /updates —— since 过滤 + 空未来查询 ============ */
  const nowTs = Date.now();
  const upd1 = await req('GET', '/api/projects/updates?since=0&limit=50', null, token);
  report('updates since=0 返回包含协作项目(结构合法)', upd1.status === 200 && upd1.data && Array.isArray(upd1.data.updates) && upd1.data.updates.some(p => p.id === demoPid && +p.ver >= 3 && p.updatedAt && p.name === '协作对比项目') && typeof upd1.data.serverTime === 'number', JSON.stringify(upd1.data && { n: upd1.data.updates.length, first: upd1.data.updates[0] && upd1.data.updates[0].id, serverTime: upd1.data.serverTime }));
  const upd2 = await req('GET', '/api/projects/updates?since=' + (nowTs + 1e9), null, token); // 未来时间戳 → 空数组
  report('updates 未来 since → 空列表', upd2.status === 200 && upd2.data && Array.isArray(upd2.data.updates) && upd2.data.updates.length === 0, JSON.stringify(upd2.data));
  const upd3 = await req('GET', '/api/projects/updates?since=0&limit=1', null, token);
  report('updates limit 生效(只返回 1 条)', upd3.status === 200 && upd3.data && Array.isArray(upd3.data.updates) && upd3.data.updates.length <= 1, '实际长度=' + (upd3.data && upd3.data.updates && upd3.data.updates.length));

  /* ============ 测试 18(P4 A1):sweepStaleOps claimRetries —— results.json 有交付结果直接转 succeeded 不退款 ============ */
  wallet = (await req('GET', '/api/wallet', null, token)).data;
  const balBeforeRecover = wallet.balance;
  // 模拟:老于 40min 的 executing op + results.json 有 payload(url=已交付)
  craftOp(uid, 'it.stale_rec1', 'image.gen', 'executing', `px_${uid}_it.stale_rec1@image.gen`, 40 * 60 * 1000);
  craftResult(uid, 'it.stale_rec1', 'image.gen', { url: '/uploads/gen/stale_recovered.jpeg', done: true });
  // 触发 sweepStaleOps:借 POST /api/billing/refund 端点内部 sweepStaleOps 调用(该端点会顺带入 sweepStaleOps 主流程)
  const rfRecover = await req('POST', '/api/billing/refund', { operationId: 'it.stale_rec1' }, token);
  const recoverOps = OPS().list.filter(o => o.opId === 'it.stale_rec1');
  wallet = (await req('GET', '/api/wallet', null, token)).data;
  const finalStatus = recoverOps.length ? recoverOps[0].status : null;
  report('sweep 发现已交付结果 → operation 转 succeeded(不再退款) + refundOperation 不为 succeeded 重复退费(HTTP 200 + refunded=0 或因终态 blocked)', finalStatus === 'succeeded' && rfRecover.status === 200, 'op 状态=' + JSON.stringify(recoverOps.map(o => o.status)) + ' 退款端点 HTTP ' + rfRecover.status + ' refunded=' + JSON.stringify(rfRecover.data && rfRecover.data.refunded));
  report('sweep 已交付不退款(余额保持 craftOp 扣费后,合法已交付不退回)', wallet.balance === balBeforeRecover - 2, // craftOp 扣了 2 不退回(视为合法已交付)
    '实际 ' + wallet.balance + '(期前 ' + balBeforeRecover + ' craftOp 占用 2,合法已交付不退款)');

  /* ============ 测试 19-21(二十一轮):服务端工作流端点 /api/wf/*(MOCK_LLM 编排验证) ============ */
  const wfPid = 'it_p_wf';
  const wfProject = {
    id: wfPid, name: '工作流项目', style: '漫剧',
    episodes: [{ id: 'ep_w1', title: '第1集', content: '女主在宴会上被当众羞辱,转身立誓复仇。', contentRev: 0, shots: [] }],
  };
  {
    const sW = await req('GET', '/api/state', null, token);
    const putW = await req('PUT', '/api/state', { rev: +(sW.data && sW.data.rev || 0), changes: { projects: { [wfPid]: wfProject } } }, token);
    report('wf 项目种子 PUT 成功', putW.status === 200, 'HTTP ' + putW.status);

    // 19. 本集理解:编排 + state 写回(sourceRev/六维)(wf 端点限流 2 次/秒,调用间隔 600ms)
    await sleep(1100);
    const und = await req('POST', '/api/wf/understanding', { pid: wfPid, epid: 'ep_w1', operationId: 'it.wf.und1' }, token);
    report('wf/understanding 200 返回理解', und.status === 200 && und.data && und.data.understanding && !!und.data.understanding.剧情脉络, 'HTTP ' + und.status + ' ' + JSON.stringify(und.data || und.msg || und).slice(0, 150));
    const sU = await req('GET', '/api/state', null, token);
    const epU = (sU.data.state.projects.find(x => x.id === wfPid) || {}).episodes[0];
    report('理解已写回 state(sourceRev 对应当前剧本版本)', epU.understanding && epU.understanding.sourceRev === 0 && !!epU.understanding.time, JSON.stringify(epU.understanding || {}).slice(0, 100));
    await sleep(1100);
    const und404 = await req('POST', '/api/wf/understanding', { pid: wfPid, epid: 'ghost' }, token);
    report('wf/understanding 分集不存在 404', und404.status === 404, 'HTTP ' + und404.status);

    // 20. 智能分镜:理解复用 + 拆镜写回(版本戳/留档语义)
    await sleep(1100);
    const sb = await req('POST', '/api/wf/smart-storyboard', { pid: wfPid, epid: 'ep_w1', operationId: 'it.wf.sb1' }, token);
    report('wf/smart-storyboard 200 返回镜数', sb.status === 200 && sb.data && sb.data.shots >= 2, 'HTTP ' + sb.status + ' ' + JSON.stringify(sb.data));
    const sB = await req('GET', '/api/state', null, token);
    const epB = (sB.data.state.projects.find(x => x.id === wfPid) || {}).episodes[0];
    report('分镜写回:status/shotsSourceRev/字段规整', epB.status === 'storyboarded' && epB.shotsSourceRev === 0 && (epB.shots || []).length >= 2 && !!epB.shots[0].cameraSpec && !!epB.shots[0].prompt, JSON.stringify({ status: epB.status, n: (epB.shots || []).length, first: epB.shots && epB.shots[0] && { camera: epB.shots[0].camera, size: epB.shots[0].cameraSpec && epB.shots[0].cameraSpec.shotSize } }));
    await sleep(1100);
    const sbNoContent = await req('POST', '/api/wf/smart-storyboard', { pid: demoPid, epid: 'ep_c1' }, token);
    report('wf/smart-storyboard 无剧本 400', sbNoContent.status === 400, 'HTTP ' + sbNoContent.status);

    // 21. 智能审片:先给镜头落视频(done+inputHash),再审——逐镜报告+lastReview 同构写回
    const sR = await req('GET', '/api/state', null, token);
    const projR = sR.data.state.projects.find(x => x.id === wfPid);
    (projR.episodes[0].shots || []).forEach(s => { s.video = { status: 'done', url: '/uploads/gen/fake_' + s.id + '.mp4', inputHash: 'h_' + s.id, frame: null }; s.confirm = true; });
    const putR = await req('PUT', '/api/state', { rev: +(sR.data && sR.data.rev || 0), changes: { projects: { [wfPid]: projR } } }, token);
    report('镜头落视频 PUT 成功', putR.status === 200, 'HTTP ' + putR.status);
    await sleep(1100);
    const rv = await req('POST', '/api/wf/smart-review', { pid: wfPid, epid: 'ep_w1', operationId: 'it.wf.rv1' }, token);
    report('wf/smart-review 200 返回均分', rv.status === 200 && rv.data && typeof rv.data.avg === 'number' && rv.data.reviewed >= 2 && (rv.data.failed || []).length === 0, 'HTTP ' + rv.status + ' ' + JSON.stringify(rv.data || rv.raw || rv).slice(0, 200));
    report('审片回执含共性汇总与四维评审', rv.data && rv.data.common && rv.data.common.summary && rv.data.cut && rv.data.cut.natural, JSON.stringify({ common: rv.data && rv.data.common, cut: rv.data && rv.data.cut }).slice(0, 120));
    const sV = await req('GET', '/api/state', null, token);
    const epV = (sV.data.state.projects.find(x => x.id === wfPid) || {}).episodes[0];
    const lr = epV.lastReview || {};
    report('lastReview 同构写回(perShot/snapshotHash/sourceRev)', Array.isArray(lr.perShot) && lr.perShot.length >= 2 && typeof lr.snapshotHash === 'string' && lr.snapshotHash.startsWith('r:') && lr.sourceRev === 0 && lr.perShot.every(x => x.reportId && x.videoInputHash), JSON.stringify(lr).slice(0, 150));
    report('逐镜报告带版本绑定(videoInputHash)', (epV.shots[0].reviews || []).length > 0 && epV.shots[0].reviews[0].videoInputHash === 'h_' + epV.shots[0].id, JSON.stringify((epV.shots[0].reviews || [])[0] || {}).slice(0, 100));
    // 无可审镜 → 400
    await sleep(1100);
    const rvNone = await req('POST', '/api/wf/smart-review', { pid: demoPid, epid: 'ep_c1' }, token);
    report('wf/smart-review 无已出片镜 400', rvNone.status === 400, 'HTTP ' + rvNone.status);

    // 22. 提取主体(项目级工作流):无分集正文项目走 p.script;只出候选不写回 state
    await sleep(1100);
    const ex = await req('POST', '/api/wf/extract-subjects', { pid: wfPid, operationId: 'it.wf.ex1' }, token);
    const exFound = (ex.data && ex.data.found) || {};
    report('wf/extract-subjects 200 返回三类候选', ex.status === 200 && (exFound.character || []).length >= 1 && (exFound.scene || []).length >= 1 && (exFound.prop || []).length >= 1, 'HTTP ' + ex.status + ' ' + JSON.stringify(ex.data || ex.msg || ex).slice(0, 200));
    report('提取候选带别名/提示词(入库口径归调用方,端点不写回 state)', (exFound.character || [])[0] && Array.isArray(exFound.character[0].aliases) && !!exFound.character[0].prompt, JSON.stringify((exFound.character || [])[0] || {}).slice(0, 150));
    const sX = await req('GET', '/api/state', null, token);
    report('提取主体不写回 state(项目 subjects 未被端点改写)', !((sX.data.state.projects.find(x => x.id === wfPid) || {}).subjects || []).length, JSON.stringify(((sX.data.state.projects.find(x => x.id === wfPid) || {}).subjects || []).slice(0, 2)));
    await sleep(1100);
    const exNone = await req('POST', '/api/wf/extract-subjects', { pid: 'ghost_p' }, token);
    report('wf/extract-subjects 项目不存在 404', exNone.status === 404, 'HTTP ' + exNone.status);
  }

  console.log(`\n===== ${PASS}/${PASS + FAIL} PASS, ${FAIL} FAIL =====`);
}

main().catch(e => { console.error('集成测试异常:', e.message); FAIL++; })
  .finally(() => {
    if (server) { try { server.kill(); } catch (_) {} }
    try { fs.rmSync(TMP, { recursive: true, force: true }); } catch (_) {}
    process.exit(FAIL ? 1 : 0);
  });
