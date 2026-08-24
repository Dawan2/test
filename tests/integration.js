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
function req(method, p, body, token) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const r = http.request(BASE + p, {
      method,
      headers: Object.assign(
        { 'Content-Type': 'application/json' },
        data ? { 'Content-Length': Buffer.byteLength(data) } : {},
        token ? { Authorization: 'Bearer ' + token } : {},
      ),
    }, res => {
      let buf = '';
      res.on('data', d => { buf += d; });
      res.on('end', () => {
        let j = null;
        try { j = JSON.parse(buf); } catch (_) {}
        resolve({ status: res.statusCode, code: j && j.code, msg: j && j.msg || j && j.error, data: j && j.data, raw: buf });
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
function craftOp(userId, opId, action, status, chargeIdem, ageMs) {
  const ops = fs.existsSync(path.join(TMP, 'data', 'operations.json')) ? OPS() : { list: [] };
  ops.list.push({
    userId, opId, action, endpoint: 'volc/image', requestHash: 'x', status,
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

  console.log(`\n===== ${PASS}/${PASS + FAIL} PASS, ${FAIL} FAIL =====`);
}

main().catch(e => { console.error('集成测试异常:', e.message); FAIL++; })
  .finally(() => {
    if (server) { try { server.kill(); } catch (_) {} }
    try { fs.rmSync(TMP, { recursive: true, force: true }); } catch (_) {}
    process.exit(FAIL ? 1 : 0);
  });
