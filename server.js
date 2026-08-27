/* ============ server.js 虎鲸漫剧 · 零依赖本地后端 v1.1 ============
 * 仅用 Node 内置模块(http/fs/path/crypto),node server.js 即可启动。
 * v1.1 增强:原子写/.bak 恢复、state 快照历史、LLM 逐用户计量/重试/限流、
 * 上传管理(列表/删除/配额)、sessions 持久化、改密/注销、防爆破锁定、
 * 安全响应头、请求日志滚动、健康检查、优雅退出、config.json 全配置。
 * v1.2 新增:火山引擎(ARK)生图/生视频代理 /api/volc/*,生成结果抓存本地 uploads/gen/。
 */
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawn } = require('child_process');
const https = require('https');

const ROOT = __dirname;
/* MV_DATA_DIR / MV_UPLOADS_DIR / MV_CONFIG 环境变量可重定向数据·上传·配置文件
 * (十二轮:tests/integration.js 用临时目录隔离真实用户数据/密钥/缓存,缺省与原行为完全一致) */
const DATA_DIR = process.env.MV_DATA_DIR ? path.resolve(process.env.MV_DATA_DIR) : path.join(ROOT, 'data');
const USERS_FILE = path.join(DATA_DIR, 'users.json');
const SESSIONS_FILE = path.join(DATA_DIR, 'sessions.json');
const STATES_DIR = path.join(DATA_DIR, 'states');
const USAGE_DIR = path.join(DATA_DIR, 'usage');
const UPLOADS_DIR = process.env.MV_UPLOADS_DIR ? path.resolve(process.env.MV_UPLOADS_DIR) : path.join(ROOT, 'uploads');
const GEN_CACHE_DIR = path.join(UPLOADS_DIR, 'gen'); // 火山引擎生成结果本地缓存(图片/视频)
const CONFIG_FILE = process.env.MV_CONFIG ? path.resolve(process.env.MV_CONFIG) : path.join(ROOT, 'config.json');
const LOG_FILE = path.join(DATA_DIR, 'server.log');

const BODY_LIMIT = 120 * 1024 * 1024; // 视频上传需要(单文件上限见 uploadMaxMB)
const FILE_LIMIT = 10 * 1024 * 1024; // 旧默认,实际上传上限走 CONFIG.uploadMaxMB
const SESSION_TTL = 7 * 24 * 3600 * 1000;
const MODELS_CACHE_TTL = 10 * 60 * 1000;
const HISTORY_KEEP = 5;
const LOG_MAX = 5 * 1024 * 1024;
const VERSION = '1.2.0';
const BOOT_TS = Date.now();
/* 火山引擎(ARK)生图/生视频默认模型(已开通,勿随意改 ID) */
const VOLC_IMAGE_MODEL = 'doubao-seedream-5-0-pro-260628';
const VOLC_VIDEO_MODEL = 'doubao-seedance-2-0-mini-260615'; // 默认 2.0-mini(成本优先);Seedance 2.5(doubao-seedance-2-5-260628)由节拍板/镜头组显式选择时传入
const GEN_CACHE_MAX = 50 * 1024 * 1024; // 单个生成文件下载上限 50MB

/* ---------- 配置(config.json 全字段可覆盖) ---------- */
const CONFIG_DEFAULT = {
  port: 8000,
  baseUrl: 'https://api.qnaigc.com/v1',
  apiKey: '', // 不再内置 key:仅从 config.json 的 apiKey 或环境变量 LLM_API_KEY 读取
  llmModel: '', // 强制覆盖 chat 上游模型(如 Agent/Coding Plan 填 deepseek-v4-pro 或 ark-code-latest);空则透传前端所选
  llmModelFallbacks: [], // 备用模型链:主模型请求失败时依次切换(如 ["glm-5.3","kimi-k3"])
  llmTimeoutMs: 120000,
  volcBaseUrl: 'https://ark.cn-beijing.volces.com/api/v3',
  volcApiKey: '', // 火山引擎生图/生视频 Key:仅从 config.json 的 volcApiKey 或环境变量 VOLC_API_KEY 读取
  volcTimeoutMs: 180000, // 生图较慢(实测约 60-70s),超时给足 150s+
  volcVideoDurations: [], // 视频时长约束:空=按模型自动(2.0 系列吸附 5s/10s,2.5+ 连续 4-30s);数组=离散档强制吸附,{min,max}=连续区间
  ttsApiKey: '', // 语音合成 API Key(X-Api-Key);空则回退 apiKey(Agent Plan 套餐 key 可直接用)
  ttsAppId: '', // 语音服务 AppID(X-Api-App-Id,旧鉴权,非 Plan 通道用)
  ttsAccessKey: '', // 语音服务 Access Key(X-Api-Access-Key,旧鉴权);空则回退 volcApiKey
  ttsResourceId: 'seed-tts-2.0', // TTS 资源 ID(Agent Plan 语音仅含 doubao-seed-tts-2.0)
  ttsBaseUrl: '', // 空=Agent Plan 专属通道 /api/v3/plan/tts/unidirectional(勿用公共通道,否则产生额外费用)
  uploadQuotaMB: 200,
  uploadMaxMB: 85, // 单文件上传上限;通道为 base64+JSON(×4/3 膨胀),85MB 编码后 ~113MB 仍在请求体 120MB 硬限内
  registerOpen: true,
  admins: [], // 管理员用户名列表(空时首个注册用户默认管理员)
  ffmpegPath: '', // 空=自动:环境变量 FFMPEG_PATH → bin/ffmpeg.exe → PATH 里的 ffmpeg
  relayProbeTimeoutMs: 6000, // 公图中转缓存 URL 用前探活超时(Range 首字节请求)
  relayUploadEnabled: true, // 参考视频公网中转(litterbox/0x0)开关:false 时带本站参考视频的请求直接 400(隐私优先)
  host: '127.0.0.1', // 监听地址;外部部署需显式改 '0.0.0.0'(本地工具默认不出网卡)
  corsOrigin: '', // 跨域来源;空=不放开(同源使用);需要跨域时填完整 Origin
  genCacheDays: 3, // uploads/gen/ 未被任何用户 state 引用且超过该天数的文件自动清理(0=不清理)
};
function loadConfig() {
  let c = {};
  try { c = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8')); } catch (_) {}
  return Object.assign({}, CONFIG_DEFAULT, c);
}
const CONFIG = loadConfig();
if (!CONFIG.apiKey) CONFIG.apiKey = process.env.LLM_API_KEY || '';
if (!CONFIG.volcApiKey) CONFIG.volcApiKey = process.env.VOLC_API_KEY || '';
if (!CONFIG.ttsApiKey) CONFIG.ttsApiKey = process.env.TTS_API_KEY || '';
const PORT = +(process.env.PORT || CONFIG.port);

/* ---------- 目录 ---------- */
for (const d of [DATA_DIR, STATES_DIR, USAGE_DIR, UPLOADS_DIR, GEN_CACHE_DIR]) fs.mkdirSync(d, { recursive: true });

/* ---------- 持久化:原子写 + .bak/.bak2 两代备份恢复 ---------- */
function writeJSON(file, obj) {
  const tmp = file + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(obj));
  // 双代备份(二十轮):备份位滚动 .bak→.bak2,第一次损坏用掉 .bak 后仍有一代旧数据可退
  try { if (fs.existsSync(file + '.bak')) fs.renameSync(file + '.bak', file + '.bak2'); } catch (_) {}
  try { if (fs.existsSync(file)) fs.copyFileSync(file, file + '.bak'); } catch (_) {}
  fs.renameSync(tmp, file);
}
/* 任意内容原子写(二十二轮):tmp + rename,写到一半崩溃/并发不写出半截文件(缓存音频/字幕临时文本/用量聚合共用) */
function writeFileAtomic(file, data, opts) {
  const tmp = file + '.tmp' + process.pid;
  fs.writeFileSync(tmp, data, opts);
  fs.renameSync(tmp, file);
}
function readJSON(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); }
  catch (_) {
    for (const bk of [file + '.bak', file + '.bak2']) {
      try {
        const bak = JSON.parse(fs.readFileSync(bk, 'utf8'));
        // rename 直取(二十轮):不经 writeJSON——写备份会先把当前坏文件复制进备份位,刚救回的 .bak 立刻被坏数据覆盖(自毒化)
        try { fs.renameSync(bk, file); } catch (_) {}
        console.warn('[store] ' + path.basename(file) + ' 损坏,已从 ' + path.basename(bk) + ' 恢复');
        return bak;
      } catch (_) {}
    }
    return fallback;
  }
}
const uid = p => (p || 'id') + '_' + Date.now().toString(36) + crypto.randomBytes(4).toString('hex');
const nowStr = () => new Date().toLocaleString('zh-CN', { hour12: false });
const dayStr = ts => new Date(ts).toISOString().slice(0, 10);

/* ---------- 响应 ---------- */
const SEC_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'no-referrer',
};
if (CONFIG.corsOrigin) SEC_HEADERS['Access-Control-Allow-Origin'] = CONFIG.corsOrigin; // 默认同源不放开;显式配置才允许跨域
function sendJSON(res, httpCode, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(httpCode, Object.assign({
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  }, SEC_HEADERS));
  res.end(body);
}
const ok = (res, data) => sendJSON(res, 200, { code: 0, data });
const fail = (res, httpCode, message, code) => sendJSON(res, httpCode, { code: code || httpCode, message });

/* ---------- 上游错误聚合(按日计数落盘 data/errstats.json,/api/health 透出今日计数) ---------- */
const ERR_FILE = path.join(DATA_DIR, 'errstats.json');
let errStats = {};
try { errStats = JSON.parse(fs.readFileSync(ERR_FILE, 'utf8')); } catch (_) {}
let errDirty = false;
function trackErr(kind) { // kind: volc4xx/volc5xx/llm/ffmpeg
  const day = new Date().toISOString().slice(0, 10);
  (errStats[day] = errStats[day] || {})[kind] = (errStats[day][kind] || 0) + 1;
  errDirty = true;
}
setInterval(() => {
  if (!errDirty) return;
  errDirty = false;
  const days = Object.keys(errStats).sort().slice(-30); // 只留近 30 天
  errStats = Object.fromEntries(days.map(d => [d, errStats[d]]));
  try { fs.writeFileSync(ERR_FILE, JSON.stringify(errStats)); } catch (_) {}
}, 15000).unref();

function readBody(req, limit) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', c => {
      size += c.length;
      if (size > (limit || BODY_LIMIT)) {
        req.pause();
        const e = new Error('请求体过大'); e.httpStatus = 413; reject(e); return;
      }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}
async function readJSONBody(req, limit) {
  const buf = await readBody(req, limit); // 分端点上限(七轮):limit 逐端点收窄,未传时回落全局 BODY_LIMIT(120MB)
  try { return JSON.parse(buf.toString('utf8') || '{}'); }
  catch (_) { const e = new Error('请求体不是合法 JSON'); e.httpStatus = 400; throw e; }
}

/* ---------- 请求日志(滚动) ---------- */
function rotateLogIfNeeded() {
  try {
    if (fs.existsSync(LOG_FILE) && fs.statSync(LOG_FILE).size > LOG_MAX) {
      const bak1 = LOG_FILE + '.1';
      try { fs.unlinkSync(bak1); } catch (_) {}
      fs.renameSync(LOG_FILE, bak1);
    }
  } catch (_) {}
}
function logRequest(req, status, ms) {
  rotateLogIfNeeded();
  const line = `${new Date().toISOString()} ${req.socket.remoteAddress || '-'} ${req.method} ${req.url} ${status} ${ms}ms\n`;
  try { fs.appendFileSync(LOG_FILE, line); } catch (_) {}
}

/* ---------- 用户与会话(持久化) ---------- */
let users = readJSON(USERS_FILE, []);
if (!Array.isArray(users)) { console.error('[store] users.json 无法解析,已重置为空数组(旧文件已保留 .bak)'); users = []; }
else console.log(`[store] users.json 校验通过,共 ${users.length} 个账号`);

const sessions = new Map();
(function loadSessions() {
  const raw = readJSON(SESSIONS_FILE, {});
  const now = Date.now();
  let n = 0;
  for (const [t, s] of Object.entries(raw)) {
    if (s && s.exp > now) { sessions.set(t, s); n++; }
  }
  if (n) console.log(`[store] 恢复 ${n} 个有效会话`);
})();
function flushSessions() {
  const obj = {};
  const now = Date.now();
  for (const [t, s] of sessions) if (s.exp > now) obj[t] = s;
  try { writeJSON(SESSIONS_FILE, obj); } catch (_) {}
}

const hashPassword = (pwd, salt) => crypto.scryptSync(pwd, salt, 64).toString('hex');
const newToken = () => crypto.randomBytes(24).toString('hex');
const publicUser = u => ({ id: u.id, username: u.username, phone: u.phone || '', accountType: u.accountType, createdAt: u.createdAt });

function createSession(userId) {
  const token = newToken();
  sessions.set(token, { userId, exp: Date.now() + SESSION_TTL });
  flushSessions();
  return token;
}
function authUser(req) {
  let token = '';
  const h = req.headers.authorization || '';
  if (h.startsWith('Bearer ')) token = h.slice(7);
  if (!token) { // 媒体标签(<img>/<video> 无法带 Authorization)走登录时种下的会话 cookie
    const ck = String(req.headers.cookie || '').match(/(?:^|;\s*)mv_token=([^\s;]+)/);
    if (ck) token = ck[1];
  }
  const s = token && sessions.get(token);
  if (!s || s.exp < Date.now()) { if (s) { sessions.delete(token); flushSessions(); } return null; }
  return users.find(u => u.id === s.userId) || null;
}
/* 登录会话 cookie(媒体鉴权用;与 Bearer 同一 token,会话吊销即失效) */
function setSessionCookie(res, token) {
  res.setHeader('Set-Cookie', `mv_token=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${Math.floor(SESSION_TTL / 1000)}`);
}
function clearSessionCookie(res) {
  res.setHeader('Set-Cookie', 'mv_token=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0');
}
/* /uploads/ URL 路径规范化(R14):先做段级校验再谈 ACL——拒绝 .. / . 段与反斜杠,
 * 防"/uploads/gen/../<他人uid>/x" 借 gen/ 共享前缀通过 startsWith 判定、path.join 折叠后越权读他人文件;
 * 通过则返回 posix 规范化路径(供前缀/归属/共享集合一致比对),非法一律 null */
function normUploadsPath(p) {
  p = String(p || '');
  if (!p.startsWith('/uploads/') || p.includes('\\')) return null;
  if (p.split('/').some(s => s === '..' || s === '.')) return null;
  return path.posix.normalize(p);
}
/* 媒体访问 ACL:本人目录 / 队友共享资产引用文件 / 服务端产物(gen/thumbs,内容寻址) */
function mediaAllowed(userId, p) {
  p = normUploadsPath(p);
  if (!p) return false;
  const rest = p.slice('/uploads/'.length);
  if (rest.startsWith('gen/') || rest.startsWith('thumbs/')) return true;
  if (rest.startsWith(userId + '/')) return true;
  return sharedPathsFor(userId).has(p);
}

/* 登录防爆破:同 IP 1 分钟失败 5 次锁 5 分钟 */
const loginGuard = new Map(); // ip -> {fails, first, lockUntil}
function guardCheck(ip) {
  const g = loginGuard.get(ip);
  if (g && g.lockUntil && g.lockUntil > Date.now()) return Math.ceil((g.lockUntil - Date.now()) / 1000);
  return 0;
}
function guardFail(ip) {
  const now = Date.now();
  let g = loginGuard.get(ip);
  if (!g || now - g.first > 60000) g = { fails: 0, first: now, lockUntil: 0 };
  g.fails++;
  if (g.fails >= 5) { g.lockUntil = now + 5 * 60000; g.fails = 0; g.first = now; }
  loginGuard.set(ip, g);
  return g.lockUntil > now;
}
const guardOk = ip => loginGuard.delete(ip);

/* 注册限流:同 IP 每小时最多注册 10 个账号 */
const registerGuard = new Map(); // ip -> [时间戳]
function registerLimited(ip) {
  const now = Date.now();
  const arr = (registerGuard.get(ip) || []).filter(t => now - t < 3600000);
  if (arr.length >= 10) { registerGuard.set(ip, arr); return true; }
  arr.push(now);
  registerGuard.set(ip, arr);
  return false;
}

/* ---------- state 树 + 快照历史 ---------- */
const stateFile = userId => path.join(STATES_DIR, userId.replace(/[^\w-]/g, '') + '.json');
const historyDir = userId => path.join(STATES_DIR, userId.replace(/[^\w-]/g, '') + '.history');
function blankStateFor(u) {
  const t = nowStr();
  return {
    rev: 0,
    state: {
      users: [{ id: u.id, username: u.username, password: '', accountType: u.accountType, phone: u.phone || '', credits: 100, createdAt: u.createdAt }],
      session: u.id,
      creditLogs: [{ id: uid('log'), userId: u.id, type: 'gain', amount: 100, balance: 100, reason: '新用户注册赠送', time: t }],
      orders: [],
      projects: [],
      assets: { subjects: [], groups: [] },
      favorites: [],
      materials: [],
      fileFavs: {},     // 文件资产收藏(对齐前端骨架)
      assetReviews: [], // 真人审核记录(对齐前端骨架)
      settings: {},  // R13 对齐前端骨架
      tasks: [],     // R13 对齐前端骨架
      team: { members: [], inviteCode: null },
      portraitCerts: [], // 肖像白名单认证(对齐前端骨架)
      trash: [],         // 回收站(对齐前端骨架)
    },
  };
}
function snapshotState(userId, cur) {
  if (!cur || cur.state == null) return;
  try {
    const dir = historyDir(userId);
    fs.mkdirSync(dir, { recursive: true });
    writeJSON(path.join(dir, (cur.rev || 0) + '.json'), { rev: cur.rev || 0, savedAt: new Date().toISOString(), state: cur.state });
    // 只留最近 HISTORY_KEEP 份
    const files = fs.readdirSync(dir).filter(f => f.endsWith('.json') && !f.endsWith('.bak')).map(f => parseInt(f)).filter(n => !isNaN(n)).sort((a, b) => b - a);
    files.slice(HISTORY_KEEP).forEach(rev => {
      try { fs.unlinkSync(path.join(dir, rev + '.json')); } catch (_) {}
      try { fs.unlinkSync(path.join(dir, rev + '.json.bak')); } catch (_) {}
    });
  } catch (_) {}
}

/* ---------- LLM 计量/限流/重试 ---------- */
const USAGE_MAX = 2 * 1024 * 1024; // jsonl 超过 2MB 即压缩为按天×模型聚合行
const usageFile = userId => path.join(USAGE_DIR, userId.replace(/[^\w-]/g, '') + '.jsonl');
function recordUsage(userId, model, usage) {
  if (!usage) return;
  const pt = usage.prompt_tokens || 0, ct = usage.completion_tokens || 0;
  const tt = usage.total_tokens || (pt + ct);
  const file = usageFile(userId);
  try {
    fs.appendFileSync(file, JSON.stringify({ ts: Date.now(), model, pt, ct, tt }) + '\n');
    compactUsageFile(file);
  } catch (_) {}
}
/* 超限压缩:逐行聚合为 {ts, model, pt:0, ct:0, tt:合计, calls:N}(按天×模型一行) */
function compactUsageFile(file) {
  try {
    if (fs.statSync(file).size <= USAGE_MAX) return;
    const lines = fs.readFileSync(file, 'utf8').split('\n').filter(Boolean);
    const buckets = new Map(); // day|model -> 聚合行
    for (const l of lines) {
      let r;
      try { r = JSON.parse(l); } catch (_) { continue; }
      const d = dayStr(r.ts || Date.now());
      const m = r.model || 'unknown';
      const key = d + '|' + m;
      let b = buckets.get(key);
      if (!b) { b = { ts: new Date(d + 'T00:00:00.000Z').getTime(), model: m, tt: 0, calls: 0 }; buckets.set(key, b); }
      b.tt += r.tt || 0;
      b.calls += r.calls || 1; // 兼容已有聚合行
    }
    const out = [...buckets.values()].sort((a, b) => a.ts - b.ts)
      .map(b => JSON.stringify({ ts: b.ts, model: b.model, pt: 0, ct: 0, tt: b.tt, calls: b.calls }))
      .join('\n') + '\n';
    writeFileAtomic(file, out); // 原子写:用量聚合重写不留半截文件
  } catch (_) {}
}
function aggregateUsage(userId) {
  const file = usageFile(userId);
  compactUsageFile(file); // 读取前兜底压缩,保证旧文件也有界
  let lines = [];
  try { lines = fs.readFileSync(file, 'utf8').split('\n').filter(Boolean); } catch (_) {}
  const today = dayStr(Date.now());
  const agg = { today: { calls: 0, tokens: 0 }, total: { calls: 0, tokens: 0 }, byModel: {}, byDay: {} };
  // 最近 14 天逐日聚合(数据看板趋势图用)
  for (let i = 13; i >= 0; i--) agg.byDay[dayStr(Date.now() - i * 86400000)] = { day: dayStr(Date.now() - i * 86400000).slice(5), calls: 0, tokens: 0 };
  lines.forEach(l => {
    let r;
    try { r = JSON.parse(l); } catch (_) { return; }
    const n = r.calls || 1; // 聚合行带 calls 字段则累加,否则计 1 次调用
    agg.total.calls += n;
    agg.total.tokens += r.tt || 0;
    const d = dayStr(r.ts);
    if (d === today) { agg.today.calls += n; agg.today.tokens += r.tt || 0; }
    if (agg.byDay[d]) { agg.byDay[d].calls += n; agg.byDay[d].tokens += r.tt || 0; }
    const m = r.model || 'unknown';
    if (!agg.byModel[m]) agg.byModel[m] = { model: m, calls: 0, tokens: 0 };
    agg.byModel[m].calls += n;
    agg.byModel[m].tokens += r.tt || 0;
  });
  agg.byModel = Object.values(agg.byModel).sort((a, b) => b.tokens - a.tokens).slice(0, 10);
  agg.byDay = Object.values(agg.byDay);
  return agg;
}

/* 限流:单用户并发≤4、每秒≤2 次 */
const llmActive = new Map();   // uid -> 并发数
const llmRecent = new Map();   // uid -> [时间戳]
function rateLimitOk(userId) {
  if ((llmActive.get(userId) || 0) >= 4) return false;
  const now = Date.now();
  const arr = (llmRecent.get(userId) || []).filter(t => now - t < 1000);
  if (arr.length >= 2) { llmRecent.set(userId, arr); return false; }
  arr.push(now);
  llmRecent.set(userId, arr);
  llmActive.set(userId, (llmActive.get(userId) || 0) + 1);
  return true;
}
const rateLimitDone = userId => llmActive.set(userId, Math.max(0, (llmActive.get(userId) || 1) - 1));

let modelsCache = { time: 0, data: null };
async function llmUpstream(pathname, opts, timeoutMs) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    return await fetch(CONFIG.baseUrl.replace(/\/+$/, '') + pathname, Object.assign({
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + CONFIG.apiKey },
      signal: ctrl.signal,
    }, opts || {}));
  } finally { clearTimeout(timer); }
}
/* 429/502/503/网络错误 自动重试最多 2 次(退避 1s/3s) */
async function llmUpstreamRetry(pathname, opts, timeoutMs) {
  const delays = [1000, 3000];
  let lastErr = null;
  for (let attempt = 0; attempt <= 2; attempt++) {
    let res;
    try {
      res = await llmUpstream(pathname, opts, timeoutMs);
    } catch (e) {
      lastErr = e;
      if (attempt < 2) { await new Promise(r => setTimeout(r, delays[attempt])); continue; }
      throw e;
    }
    if ([429, 502, 503].includes(res.status) && attempt < 2) {
      try { await res.text(); } catch (_) {}
      await new Promise(r => setTimeout(r, delays[attempt]));
      continue;
    }
    return res;
  }
  throw lastErr || new Error('LLM 上游重试失败');
}

/* ---------- 火山引擎(ARK)生图/生视频上游 ---------- */
async function volcUpstream(pathname, opts, timeoutMs) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    return await fetch(CONFIG.volcBaseUrl.replace(/\/+$/, '') + pathname, Object.assign({
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + CONFIG.volcApiKey },
      signal: ctrl.signal,
    }, opts || {}));
  } finally { clearTimeout(timer); }
}
/* 生成结果 URL 为 24h 临时签名链接:抓存本地 uploads/gen/ 供前端刷新后访问;
 * 下载失败/超限返回 null,调用方回退原始 url */
async function cacheGenFile(remoteUrl, ext) {
  try {
    // 内容寻址(remoteUrl 哈希作文件名):同一任务被前端多次轮询时直接复用已抓存文件,
    // 不再每次轮询重复下载 50MB 副本撑爆 uploads/gen/
    const name = 'gen_' + crypto.createHash('sha1').update(String(remoteUrl)).digest('hex').slice(0, 16) + ext;
    const dest = path.join(GEN_CACHE_DIR, name);
    if (fs.existsSync(dest)) return '/uploads/gen/' + name;
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 120000);
    let r;
    try { r = await fetch(remoteUrl, { signal: ctrl.signal }); } finally { clearTimeout(timer); }
    if (!r.ok) return null;
    const len = +(r.headers.get('content-length') || 0);
    if (len > GEN_CACHE_MAX) return null;
    const buf = Buffer.from(await r.arrayBuffer());
    if (!buf.length || buf.length > GEN_CACHE_MAX) return null;
    await fs.promises.writeFile(dest, buf); // 异步写,不阻塞事件循环(大文件期间其他请求照常)
    return '/uploads/gen/' + name;
  } catch (_) { return null; }
}
/* 上游错误消息统一提取(对齐 /api/llm/chat 风格) */
function volcFailMsg(r, text, what) {
  trackErr(r.status >= 500 ? 'volc5xx' : 'volc4xx'); // 上游失败计数(429 也按 4xx 计)
  let detail = '';
  try { const j = JSON.parse(text); detail = (j.error && (j.error.message || j.error.code)) || ''; } catch (_) {}
  const msg = r.status === 401 ? '火山引擎 Key 无效(上游 401),请检查 config.json 的 volcApiKey'
    : r.status === 429 ? '上游限流或额度不足(429)'
    : r.status >= 500 ? what + '服务端错误(' + r.status + ')'
    : what + '请求失败(' + r.status + ')';
  return msg + (detail ? ':' + String(detail).slice(0, 120) : '');
}
/* 上游 200 响应体 → JSON:网关降级页/空体等非 JSON 内容时抛带 502 语义的业务错误,
 * 不再裸抛 SyntaxError 落入全局 catch 被误标 400 且透出内部细节 */
function parseUpstreamJSON(text, what) {
  try { return JSON.parse(text); } catch (_) {
    const e = new Error(what + '返回内容异常(非 JSON)');
    e.httpStatus = 502;
    throw e;
  }
}
/* 参考图规整:本站 /uploads/ 本地路径读盘转 dataURL(ARK 无法回源本站);dataURL/远程 url 原样透传。
 * 所有权隔离:userId 非空时统一走 localUploadPath 判定(仅放行 本人目录/服务端产物/队友共享资产引用的文件),
 * 堵住"借生图/生视频代理内联他人文件"的旁路;返回 null 表示路径非法、越权或文件不存在。 */
function inlineRefImage(img, userId) {
  img = String(img || '');
  if (!img.startsWith('/uploads/')) return img;
  let fp;
  if (userId) fp = localUploadPath(img, userId);
  else fp = localUploadPath(img, null); // 免鉴权路由兼容旧行为(无 ACL,仅路径解析;R14 起同享 normUploadsPath 与 UPLOADS_DIR 拼接)
  if (!fp) return null;
  const ext = path.extname(fp).slice(1).toLowerCase();
  const mime = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp' }[ext] || 'image/png';
  return `data:${mime};base64,` + fs.readFileSync(fp).toString('base64');
}

/* ---------- FFmpeg 本地视频处理(合成成片/超分/去字幕/关键帧/高光智剪/音视频合并) ---------- */
const FFMPEG_BIN = process.env.FFMPEG_PATH || CONFIG.ffmpegPath || path.join(ROOT, 'bin', 'ffmpeg.exe');
const FFPROBE_BIN = process.env.FFPROBE_PATH || (CONFIG.ffmpegPath ? CONFIG.ffmpegPath.replace(/ffmpeg(\.exe)?$/i, 'ffprobe$1') : path.join(ROOT, 'bin', 'ffprobe.exe'));
const FF_FONT = process.env.FF_FONT || 'C:/Windows/Fonts/msyh.ttc'; // 字幕烧录字体(微软雅黑)
function ffmpegOk() { return fs.existsSync(FFMPEG_BIN); }
/* 执行 ffmpeg/ffprobe;stderr 截尾留 64KB;resolve(stderr 全文, 供 showinfo 解析) */
function runFF(bin, args, timeoutMs) {
  return new Promise((resolve, reject) => {
    let cp;
    try { cp = spawn(bin, args, { windowsHide: true }); } catch (e) { return reject(new Error('无法启动 FFmpeg:' + e.message)); }
    let err = '';
    cp.stderr.on('data', d => { err += d.toString(); if (err.length > 65536) err = err.slice(-65536); });
    const timer = setTimeout(() => { try { cp.kill(); } catch (_) {} reject(new Error('FFmpeg 处理超时(' + Math.round((timeoutMs || 300000) / 1000) + 's)')); }, timeoutMs || 300000);
    cp.on('error', e => { clearTimeout(timer); reject(new Error('无法启动 FFmpeg:' + e.message)); });
    cp.on('close', code => {
      clearTimeout(timer);
      if (code === 0) return resolve(err);
      trackErr('ffmpeg'); // 执行失败计数(启动失败/超时走上面两个 reject,属同类)
      const tail = err.split('\n').map(s => s.trim()).filter(Boolean).slice(-3).join(' | ');
      reject(new Error('FFmpeg 执行失败' + (tail ? ':' + tail.slice(0, 200) : '(exit ' + code + ')')));
    });
  });
}
function ffprobeOut(args) {
  return new Promise((resolve, reject) => {
    let cp;
    try { cp = spawn(FFPROBE_BIN, args, { windowsHide: true }); } catch (e) { return reject(new Error('无法启动 ffprobe:' + e.message)); }
    let s = '';
    cp.stdout.on('data', d => s += d);
    // R14:与 runFF 同口径加超时——ffprobe 挂起(损坏文件/句柄异常)会让请求永挂、执行锁与 executing 双悬挂
    const timer = setTimeout(() => { try { cp.kill(); } catch (_) {} reject(new Error('ffprobe 解析超时(60s)')); }, 60000);
    cp.on('error', e => { clearTimeout(timer); reject(new Error('无法启动 ffprobe:' + e.message)); });
    cp.on('close', c => { clearTimeout(timer); c === 0 ? resolve(s) : reject(new Error('ffprobe 解析失败')); });
  });
}
async function ffprobeDuration(fp) {
  const s = await ffprobeOut(['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', fp]);
  return Math.max(0.1, parseFloat(String(s).trim()) || 0);
}
async function ffprobeVideoInfo(fp) {
  const s = await ffprobeOut(['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height', '-of', 'csv=p=0', fp]);
  const m = String(s).match(/(\d+)\s*,\s*(\d+)/);
  return { w: m ? +m[1] : 1280, h: m ? +m[2] : 720 };
}
async function ffprobeHasAudio(fp) {
  const s = await ffprobeOut(['-v', 'error', '-select_streams', 'a:0', '-show_entries', 'stream=codec_type', '-of', 'csv=p=0', fp]);
  return /audio/.test(s);
}
/* 团队共享授权索引(团队↔资产贯通):userId 可访问的队友共享资产文件。
 * 精确到路径:仅放行"共享给我的分组内资产实际引用的 /uploads/ 文件"(主体图/参考大头照/形态图/参考音频),
 * 队友目录里的其他文件仍不可越权访问;内存缓存 10s,共享关系/资产引用变化最迟 10s 生效 */
const _sharedPathsCache = new Map(); // userId → { at, paths:Set }
function sharedPathsFor(userId) {
  const hit = _sharedPathsCache.get(userId);
  if (hit && Date.now() - hit.at < 10000) return hit.paths;
  const paths = new Set();
  try {
    const me = users.find(x => x.id === userId);
    if (me) {
      const mates = new Set();
      teamsOfUser(teamsDB(), userId).forEach(t => (t.members || []).forEach(m => { if (m.userId && m.userId !== userId) mates.add(m.userId); }));
      mates.forEach(uid2 => {
        const st = readJSON(stateFile(uid2), { state: null }).state;
        if (!st || !st.assets) return;
        (st.assets.groups || []).forEach(g => {
          if (!(g.shared || []).includes(me.username)) return;
          (st.assets.subjects || []).forEach(a => {
            if (a.groupId !== g.id) return;
            // 共享授权校验 review 状态:仅 本地可用/无检查记录/存量 approved 放行(pending/rejected 与 UI 隐藏口径一致)
            if (!(a.review == null || a.review === '' || a.review === 'local_available' || a.review === 'approved')) return;
            [a.image, a.imgRef, a.refAudio && a.refAudio.url].concat((a.forms || []).map(f => f && f.image)).forEach(u => {
              if (typeof u === 'string' && u.startsWith('/uploads/')) paths.add(u);
            });
          });
        });
      });
    }
  } catch (_) { /* 索引构建失败按无共享处理,不影响鉴权主流程 */ }
  _sharedPathsCache.set(userId, { at: Date.now(), paths });
  return paths;
}
/* 本站 /uploads/ 路径 → 本地绝对路径(防穿越,需存在);否则 null。
 * 所有权隔离:userId 非空时只允许 /uploads/<自己>/、服务端产物目录 /uploads/gen|thumbs/
 * 与"队友共享给我的资产实际引用的文件"(见 sharedPathsFor);
 * (鉴权路由内的 FFmpeg/上游处理全部传 userId,封死借服务处理他人文件;免鉴权路由传 null 兼容) */
function localUploadPath(p, userId) {
  p = normUploadsPath(p); // R14:先规范化拒 ..,再做所有权前缀判定(此前 ACL 在未规范化串上判定,可被 gen/../ 穿越)
  if (!p) return null;
  const rest = p.slice('/uploads/'.length);
  const SHARED = ['gen/', 'thumbs/']; // 服务端生成物缓存(内容寻址,非用户私有)
  if (userId && !SHARED.some(s => rest.startsWith(s)) && !rest.startsWith(userId + '/')
    && !sharedPathsFor(userId).has(p)) return null;
  const fp = path.join(UPLOADS_DIR, rest.replace(/\//g, path.sep)); // R14:按 UPLOADS_DIR 拼接(MV_UPLOADS_DIR 重定向后按 ROOT 拼必失效)
  return fp.startsWith(UPLOADS_DIR + path.sep) && fs.existsSync(fp) ? fp : null; // 前缀带分隔符,与 serveStatic 的防穿越口径一致
}
function ffOutName(ext) {
  const name = 'proc_' + Date.now().toString(36) + crypto.randomBytes(3).toString('hex') + ext;
  return { abs: path.join(GEN_CACHE_DIR, name), url: '/uploads/gen/' + name };
}
/* 本地文件 → 临时公网 URL(供上游回源取视频素材;零依赖手写 multipart)
 * 主用 litterbox.catbox.moe(1 小时自动过期),备用 0x0.st(≥30 天);均返回纯文本直链
 * 图床策略:缓存 URL + 用前探活(Range 请求),失效自动重传,不再拿过期链接撞上游 */
const relayCache = new Map(); // key(fp+mtime) → { url, at }
function relayProbe(url) { // Range 探活:2xx/206 且能取到首字节视为有效
  return new Promise(resolve => {
    try {
      const u = new URL(url);
      const req = https.request({ host: u.host, path: u.pathname + u.search, method: 'GET', headers: { Range: 'bytes=0-0', 'User-Agent': 'modelvideo-hujing/1.2' } }, r => {
        r.resume();
        resolve(r.statusCode === 200 || r.statusCode === 206);
      });
      req.on('error', () => resolve(false));
      req.setTimeout(CONFIG.relayProbeTimeoutMs || 6000, () => { req.destroy(); resolve(false); });
      req.end();
    } catch (_) { resolve(false); }
  });
}
function relayUpload(fp) {
  const providers = [
    { host: 'litterbox.catbox.moe', path: '/resources/internals/api.php', field: 'fileToUpload', extra: { reqtype: 'fileupload', time: '1h' } },
    { host: '0x0.st', path: '/', field: 'file', extra: {} },
  ];
  const tryOne = pv => new Promise((resolve, reject) => {
    const boundary = '----mvrelay' + crypto.randomBytes(8).toString('hex');
    const fname = path.basename(fp).replace(/[^\w.-]/g, '_');
    const parts = [];
    Object.entries(pv.extra).forEach(([k, v]) => {
      parts.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${k}"\r\n\r\n${v}\r\n`));
    });
    parts.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${pv.field}"; filename="${fname}"\r\nContent-Type: ${/\.(mp3|wav|m4a)$/i.test(fname) ? 'audio/mpeg' : 'video/mp4'}\r\n\r\n`));
    parts.push(fs.readFileSync(fp));
    parts.push(Buffer.from(`\r\n--${boundary}--\r\n`));
    const body = Buffer.concat(parts);
    const req = https.request({
      host: pv.host, path: pv.path, method: 'POST',
      headers: { 'Content-Type': 'multipart/form-data; boundary=' + boundary, 'Content-Length': body.length, 'User-Agent': 'modelvideo-hujing/1.2' },
    }, r => {
      let s = '';
      r.on('data', d => s += d);
      r.on('end', () => {
        const url = s.trim();
        if (r.statusCode === 200 && /^https?:\/\/\S+$/.test(url)) return resolve(url);
        reject(new Error(pv.host + ' 返回异常(HTTP ' + r.statusCode + '):' + url.slice(0, 80)));
      });
    });
    req.on('error', e => reject(new Error(pv.host + ' 连接失败:' + e.message)));
    req.setTimeout(120000, () => { req.destroy(); reject(new Error(pv.host + ' 上传超时(120s)')); });
    req.write(body); req.end();
  });
  return tryOne(providers[0]).catch(e1 => tryOne(providers[1]).catch(e2 => { throw new Error(e1.message + ' ; ' + e2.message); }));
}
/* 对外入口:优先复用缓存(探活通过),失效/未缓存则重传并写入缓存 */
async function relayPublicUrl(fp) {
  const key = fp + ':' + Math.round(fs.statSync(fp).mtimeMs);
  const cached = relayCache.get(key);
  if (cached && await relayProbe(cached.url)) return cached.url;
  const url = await relayUpload(fp);
  relayCache.set(key, { url, at: Date.now() });
  return url;
}

/* ---------- 充值/支付(个人收款码人工审核 + 卡密兑换;积分写用户 state 树,rev 自增触发前端 409 重拉) ---------- */
const PAYCFG_FILE = path.join(DATA_DIR, 'payconfig.json');
const PAYCODES_FILE = path.join(DATA_DIR, 'paycodes.json');
const PAYREQ_FILE = path.join(DATA_DIR, 'payrequests.json');
const PAYCFG_DEFAULT = {
  rate: 10, // 1 元 = rate 积分
  giftTiers: [{ min: 10000, gift: 0.03 }, { min: 5000, gift: 0.025 }, { min: 3000, gift: 0.02 }],
  qrWechat: '', qrAlipay: '', // 收款码图片(/uploads/ 路径,管理端上传设置)
  packs: [
    { name: '体验版', yuan: 10 }, { name: '入门版', yuan: 50 }, { name: '标准版', yuan: 200 },
    { name: '专业版', yuan: 500 }, { name: '旗舰版', yuan: 3000 }, { name: '企业版', yuan: 5000 }, { name: '企业版 Pro', yuan: 10000 },
  ],
};
function payCfg() { return Object.assign({}, PAYCFG_DEFAULT, readJSON(PAYCFG_FILE, {})); }
function giftFor(cfg, yuan) {
  const t = (cfg.giftTiers || []).filter(x => yuan >= x.min).sort((a, b) => b.min - a.min)[0];
  return t ? t.gift : 0;
}
function isAdmin(user) {
  if ((CONFIG.admins || []).includes(user.username)) return true;
  return !!(users.length && users[0].id === user.id); // 首个注册用户默认管理员
}
/* ---------- 独立钱包:只追加账本(data/wallets/<uid>.json)为唯一积分权威 ----------
 * 充值/扣费/退费全部走账本(条目带幂等键 idem,重复提交只记一次),state 树里的
 * users[].credits/creditLogs/orders 降级为投影(读时注入、写后同步,rev 不动)——
 * 钱包与创作 state 分离:充值/消费不再递增创作 rev,多端创作的 409 冲突根源就此收敛。 */
const WALLETS_DIR = path.join(DATA_DIR, 'wallets');
fs.mkdirSync(WALLETS_DIR, { recursive: true });
function walletFile(uid2) { return path.join(WALLETS_DIR, uid2 + '.json'); }
/* 读取钱包(不存在则从 legacy state 的 credits 开户迁移,原值平移,余额可对账) */
function readWallet(uid2) {
  const w = readJSON(walletFile(uid2), null);
  if (w && Array.isArray(w.entries)) return w;
  const st = readJSON(stateFile(uid2), { rev: 0, state: null });
  const bal = Math.max(0, serverCredits(st.state, uid2) || 0);
  const nw = { balance: bal, entries: [{ seq: 1, ts: Date.now(), type: 'migrate', amount: bal, balanceAfter: bal, reason: '账本迁移:沿用原积分余额', idem: 'migrate_' + uid2 }] };
  writeJSON(walletFile(uid2), nw);
  return nw;
}
/* R19:只追加审计日志(data/audit.jsonl)——钱包 3000 条滚动截断后,完整资金/交付轨迹仍可对账。
 * 钱(wallet 条目)与货(结果交付)双轨同文件;超 5MB 轮转一代(与请求日志同模式)。写失败静默,不阻断业务。 */
const AUDIT_FILE = path.join(DATA_DIR, 'audit.jsonl');
const AUDIT_MAX = 5 * 1024 * 1024;
function auditAppend(kind, obj) {
  try {
    if (fs.existsSync(AUDIT_FILE) && fs.statSync(AUDIT_FILE).size > AUDIT_MAX) {
      const bak1 = AUDIT_FILE + '.1';
      try { fs.unlinkSync(bak1); } catch (_) {}
      fs.renameSync(AUDIT_FILE, bak1);
    }
    fs.appendFileSync(AUDIT_FILE, JSON.stringify(Object.assign({ ts: Date.now(), kind }, obj)) + '\n');
  } catch (_) {}
}
/* 追加账目:amount 正负号即方向;idem 幂等(重复提交返回原条目,不重复记账) */
function walletAppend(uid2, type, amount, reason, idem) {
  const w = readWallet(uid2);
  if (idem) {
    const hit = w.entries.find(e => e.idem === idem);
    if (hit) return { dup: true, entry: hit, wallet: w };
    // 二十轮:滚动截断淘汰条目的幂等键仍在索引内拒重放(截断不再掏空双扣/双退防护)
    if ((w.archivedIdems || []).includes(idem)) return { dup: true, entry: null, wallet: w };
  }
  const seq = (w.entries.length ? w.entries[w.entries.length - 1].seq : 0) + 1;
  const balance = Math.max(0, (w.balance || 0) + amount);
  const entry = { seq, ts: Date.now(), type, amount, balanceAfter: balance, reason: String(reason || '').slice(0, 80), idem: idem || null };
  w.entries.push(entry);
  w.balance = balance;
  if (w.entries.length > 3000) { // 账本滚动上限(保留最近 3000 条)
    const evicted = w.entries.slice(0, w.entries.length - 3000);
    w.entries = w.entries.slice(-3000);
    /* 二十轮:淘汰条目整机归档到 wallets/<uid>.archive.jsonl(退款/对账依据不随截断销毁,
     * 与 audit.jsonl 双轨互证)+ 幂等键索引留钱包内(上限 2 万条滚动);跨窗口的退款判定
     * 对归档条目失败关闭(宁可少退不可多退),人工对账以归档+审计为准 */
    try { fs.appendFileSync(walletFile(uid2) + '.archive.jsonl', evicted.map(e => JSON.stringify(e)).join('\n') + '\n'); } catch (_) {}
    w.archivedIdems = (w.archivedIdems || []).concat(evicted.map(e => e.idem).filter(Boolean)).slice(-20000);
  }
  writeJSON(walletFile(uid2), w);
  auditAppend('wallet', { uid: uid2, seq: entry.seq, type, amount, balanceAfter: balance, reason: entry.reason, idem: entry.idem });
  return { dup: false, entry, wallet: w };
}
/* 账本 → state 投影:同步 users[].credits/creditLogs/orders(不动 rev,前端各视图照常可读) */
function syncWalletProjection(uid2, wallet, entry, opts) {
  opts = opts || {};
  const f = stateFile(uid2);
  const cur = readJSON(f, { rev: 0, state: null });
  if (!cur.state) return; // 账本先行,前端 state 尚未初始化:投影待其首次落盘时补齐
  const st = cur.state;
  st.users = st.users || [];
  let u = st.users.find(x => x.id === uid2);
  if (!u) { u = { id: uid2, username: opts.username || '', credits: 0, createdAt: nowStr() }; st.users.push(u); }
  u.credits = wallet.balance;
  if (entry) {
    st.creditLogs = st.creditLogs || [];
    if (!st.creditLogs.some(l => l.id === 'wl_' + entry.seq)) {
      st.creditLogs.unshift({ id: 'wl_' + entry.seq, userId: uid2, type: entry.type === 'refund' ? 'refund' : entry.amount >= 0 ? 'gain' : 'spend', amount: Math.abs(entry.amount), balance: entry.balanceAfter, reason: entry.reason, time: nowStr() });
      st.creditLogs = st.creditLogs.slice(0, 500);
    }
  }
  if (opts.order) { st.orders = st.orders || []; st.orders.unshift(opts.order); }
  writeJSON(f, { rev: cur.rev || 0, state: st }); // rev 不动:钱包与创作分离
}
/* 服务端直加/扣积分(充值/卡密/管理员调整/镜像扣退的统一入口):账本 + 投影。
 * 幂等重放(dup)时跳过投影副作用:订单/流水不重复入账——崩溃窗口内重试不重复发放 */
function grantCredits(userId, amount, opts) {
  opts = opts || {};
  const r = walletAppend(userId, opts.type || (amount >= 0 ? 'recharge' : 'spend'), amount, opts.reason, opts.idem || null);
  syncWalletProjection(userId, r.wallet, r.dup ? null : r.entry, r.dup ? {} : opts);
  return true;
}
/* 上传文件引用扫描(八轮:递归全量):删除前查本人 state 中所有等于目标 URL 的字符串,
 * 输出带名称标注的结构路径。不再维护手写字段清单——节拍板视频/整集成片/切片/剧壳海报/
 * 审片报告快照/回收站等任何新模块的引用自动覆盖,杜绝"新增字段忘更新扫描"的漏删。 */
function findFileRefs(userId, url) {
  const refs = [];
  const st = readJSON(stateFile(userId), { state: null }).state;
  if (!st) return refs;
  const seen = new Set();
  const push = (where) => { if (refs.length < 20 && !seen.has(where)) { seen.add(where); refs.push(where); } };
  const LABEL_KEYS = ['name', 'title', 'label', 'fileName'];
  const TOP_LABEL = { projects: '项目', episodes: '分集', shots: '镜头', subjects: '主体', beats: '节拍', trash: '回收站', materials: '素材库', assetReviews: '审核记录', assets: '资产库', clips: '切片' };
  (function walk(node, path) {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) { node.forEach((v, i) => walk(v, path + '[' + (i + 1) + ']')); return; }
    for (const k in node) {
      const v = node[k];
      if (typeof v === 'string') { if (v === url) push(path + '.' + k); }
      else if (v && typeof v === 'object') {
        let label = '';
        for (const lk of LABEL_KEYS) { if (typeof v[lk] === 'string' && v[lk]) { label = v[lk].slice(0, 14); break; } }
        const seg = TOP_LABEL[k] ? TOP_LABEL[k] : k;
        walk(v, path + '.' + seg + (label ? '「' + label + '」' : ''));
      }
    }
  })(st, '数据');
  return refs;
}

/* ---------- 服务端权威计费:计费/会话键剥离 + 扣退镜像 + 退费窗卫 ----------
 * 前端 U.charge/U.refund 是唯一计费咽喉,经 /api/billing/* 镜像到服务端;
 * state 同步时剥离这些键,客户端无法靠 PUT/restore 改余额或回滚刷积分 */
const BILLING_KEYS = ['users', 'creditLogs', 'orders', 'session'];
/* 把 state 中的计费/会话键替换为服务端当前值(无则删除);余额以钱包账本为准 */
function shieldBilling(state, serverState, userId) {
  if (!state || typeof state !== 'object') return state;
  const src = (serverState && serverState.state) || {};
  for (const k of BILLING_KEYS) {
    if (src[k] !== undefined) state[k] = JSON.parse(JSON.stringify(src[k]));
    else delete state[k];
  }
  if (userId && state.users) {
    const u = state.users.find(x => x.id === userId);
    if (u) u.credits = readWallet(userId).balance;
  }
  return state;
}
/* 服务端视角的用户余额 */
function serverCredits(state, userId) {
  const u = state && state.users && state.users.find(x => x.id === userId);
  return u ? (u.credits || 0) : 0;
}
/* ---- 统一服务端白名单计费(2026-08 六轮;九轮核心抽出 billing.js 与单元测试共享) ----
 * 价格唯一权威在服务端(前端 COST 经 GET /api/billing/actions 同步,两端一致);
 * 客户端只提交 billingAction + operationId(任务 id),不提交金额——价格不可篡改;
 * 动作推导/校验/宽松解析在 billing.js 单一定义,tests/unit.js 对其做客户端兼容矩阵测试 */
const BILLING = require('./billing');
/* 二十一轮:服务端工作流端点(/api/wf/*)的双端单源——领域推导(domain)与三条 LLM 编排
 * 提示词/规整(wf-core)与浏览器/CLI 逐字节一致;Prompts/KB 为提示词注册表与知识库文本 */
const Domain = require('./js/domain.js');
const WfCore = require('./js/wf-core.js');
const Prompts = require('./js/prompts.js');
const KB = require('./js/knowledge.js');
const ExpertsData = require('./js/experts-data.js'); // 专家注册表双端单源(二十二轮):wf 端点据 hiredExpert 推导 projType
const BILLING_ACTIONS = Object.assign({}, BILLING.DEFAULT_ACTIONS, CONFIG.billingActions || {});
/* 前端 COST 键 → 服务端动作(同步投影用;config 覆盖价格后前端自动跟随) */
const COST_PROJECTION = {
  image: 'image.gen', tweetShot: 'image.tweetShot', multiView: 'image.multiView', fusion: 'image.fusion',
  hd: 'image.hd', inpaint: 'image.inpaint', realistic: 'image.realistic', multiCam1: 'image.multiCam1', multiCam2: 'image.multiCam2',
  video: 'video.gen', audio: 'tts.gen', smartSB: 'llm.smartSB', aiDirector: 'llm.director',
  review: 'llm.review', optimize: 'llm.optimize', tool: 'llm.tool', compose: 'ff.compose',
  erase: 'ff.erase', hdStd: 'ff.hdStd', hdPro: 'ff.hdPro', highlight: 'ff.highlight',
};
/* operationId 规整(账本 idem 的组成部分,仅允许安全字符) */
function sanitizeOpId(x) { return String(x || '').replace(/[^\w.-]/g, '').slice(0, 64); }
/* 端点动作校验薄封装(九轮):推导/校验核心在 billing.js(与单元测试共享);
 * LLM 族放行全部 llm.*(消息体无法区分业务用途,价差上界=白名单价,已知残留)——
 * 九轮回归修复:八轮的"提交必须等于推导"把 llm.agent/review/smartSB 等正常动作全 400 拒了 */
function billAction(res, family, b, derived, allowedSet) {
  const a = b && b.billingAction;
  const submitted = (a == null || a === '') ? derived : String(a);
  const v = BILLING.validateBillingAction(family, BILLING_ACTIONS, submitted, derived, allowedSet);
  if (!v.ok) { fail(res, 400, v.msg, 400); return null; }
  return v.action;
}
const lenientParseJSON = BILLING.lenientParseJSON;
/* ---- operation 计费状态机(十轮):data/operations.json 登记每个具名计费操作 ----
 * op = { userId, opId, action, endpoint, requestHash, status: charged|delivered|refunded, steps, createdAt, updatedAt }
 * 流转: charged →(交付成功) delivered / →(未交付失败) refunded;refunded 后同请求重试 → 追加新记录(~n 新扣费)
 * 非 LLM:同 (opId, action) 绑定 requestHash(请求体指纹)——换内容复用同 opId → 409;delivered 后不可重放;
 * LLM(步骤化):聚合流程一次扣费多步调用,按 step 槽位管理——
 *   同 step 同内容且未成功 → 幂等重放(网络重试);同 step 换内容 → 409;
 *   已成功步骤 → 有缓存响应直接返回缓存(真正幂等),无缓存拒绝重放(十轮:此前会零扣费重新调用上游);
 *   新 step 仅未交付时允许且受 stepBudget 限制;main 步成功即交付 → 交付后不再接受新 step。
 *   任一步骤成功即计入"已有成功调用"——客户端退款被拒;内部退款同样保护(十轮:此前聚合流程
 *   前一步成功后一步失败会整笔退回,前序成果变免费交付)。
 * 退款重试多记录(十轮):refunded 后同 opId 重试追加新记录,opFind 一律取最新——交付/退款作用于最新扣费。 */
const OPS_FILE = path.join(DATA_DIR, 'operations.json');
const OPS_KEEP_MS = 90 * 24 * 3600 * 1000; // 保留期须覆盖退款授权窗口(退费窗卫 24h,90 天冗余充足)
const OPS_RESP_MAX = 8 * 1024;             // 步骤响应缓存上限(超长结果不缓存,重放将被拒绝)
function opsDB() { const db = readJSON(OPS_FILE, { list: [] }); if (!Array.isArray(db.list)) db.list = []; return db; }
function saveOps(db) {
  /* 十轮:截断从"全局最近 5000 条"改为按时间保留 90 天——operations 是退款授权的失败关闭依据,
   * 被淘汰的已交付 operation 会让 ownerOf 落空、已交付扣费重新可退(九轮漏洞);保留期内上限 50000 条兜底 */
  const cutoff = Date.now() - OPS_KEEP_MS;
  const kept = db.list.filter(o => (o.updatedAt || o.createdAt || 0) >= cutoff);
  db.list = kept.length > 50000 ? kept.slice(-50000) : kept;
  writeJSON(OPS_FILE, db);
}
/* 取最新一条匹配记录(十轮:退款重试会追加新记录,交付/退款必须作用于最新扣费,而非最早的旧记录) */
function opFind(db, userId, opId, action) { return BILLING.latestOp(db.list, userId, opId, action); }
/* 请求指纹:计费元数据(含 step 槽位名)不参与,其余请求体全量 —— 同 opId 换任何生成参数都会失配 */
function requestHashOf(obj) {
  const o = Object.assign({}, obj);
  delete o.operationId; delete o.billingAction; delete o.step;
  delete o._projectId; // 成本归集标签:只进 operation 台账,不进请求指纹(同 op 跨环境重放不失配)
  return crypto.createHash('sha256').update(JSON.stringify(o)).digest('hex').slice(0, 32);
}
/* 步骤交付(十一轮;十二轮返回布尔):标记 step.ok=true 并缓存响应文本;final=true(main 步/
 * 非 LLM 端点)时 operation 进入 delivered——已 refunded 的 operation 不再翻转。
 * 返回 false=该 operation 已退款(或无登记),调用方据此不再把结果发给客户端——
 * 此前只挡数据库状态翻转,原 HTTP 请求仍会把成品返回(退款+白拿成品竞态) */
function opStepDelivered(userId, opId, action, step, final, respText) {
  if (!opId || String(opId).startsWith('direct_')) return true; // 直连/无登记:无退款语义,照常交付
  const db = opsDB();
  const op = opFind(db, userId, opId, action);
  if (!op) return true; // 登记缺失(旧数据):不阻断正常交付
  if (op.status === 'refunded') return false; // 已退款:不再交付(退款即终态)
  if (step) {
    op.steps = op.steps || {};
    if (op.steps[step]) { op.steps[step].ok = true; }
    else op.steps[step] = { rh: '', ok: true };
    if (respText && String(respText).length <= OPS_RESP_MAX) op.steps[step].resp = String(respText);
  }
  if (final && op.status !== 'delivered') op.status = 'delivered';
  op.updatedAt = Date.now();
  saveOps(db);
  return true;
}
function opDelivered(userId, opId, action) { return opStepDelivered(userId, opId, action, null, true); }
/* 在途执行标记(十一轮 P0-2):扣费成功后、调上游前标记——客户端退款对新鲜 executing 一律拒绝
 * (请求可能正在调上游,退款后原请求完成仍会交付结果);失败路径的 proxyRefund 是 executing 的
 * 正常出口(refunded 覆盖),不受影响 */
function opMarkExecuting(userId, opId, action) {
  if (!opId || String(opId).startsWith('direct_')) return;
  const db = opsDB();
  const op = opFind(db, userId, opId, action);
  if (op && op.status === 'charged') { op.status = 'executing'; op.updatedAt = Date.now(); saveOps(db); }
}
/* 并发执行锁(十一轮 P0-4):同 (userId, opId, action, step) 的并发请求在首个执行期间直接 409——
 * 此前 LLM 走 replay-exec / 非 LLM 复用已有扣费后都会继续调上游,一次扣费可获得多次模型调用。
 * 二十二轮:锁落盘 data/locks.json——进程崩溃/重启后,看门狗对「未正常解锁且仍在执行窗口内」的 opId 保持保守
 * (不判崩溃残留、不退款;ffmpeg 子进程等可能存活过重启);正常解锁即除名,重启后重试不吃假 409。 */
const LOCKS_FILE = path.join(DATA_DIR, 'locks.json');
const LOCK_KEEP_MS = 30 * 60 * 1000; // 与看门狗 OP_EXECUTE_STALE_MS 同窗口
const EXEC_LOCKS = new Map();   // 并发锁(仅本进程语义:重启后为空,重试不再 409)
const RECENT_LOCKS = new Map(); // 崩溃残留保守集(key→at):未正常解锁的锁,窗口期内看门狗视为仍在执行
try {
  const ldb = readJSON(LOCKS_FILE, { list: [] });
  (Array.isArray(ldb.list) ? ldb.list : []).forEach(x => { if (x && x.key && Date.now() - (x.at || 0) < LOCK_KEEP_MS) RECENT_LOCKS.set(x.key, x.at); });
} catch (_) {}
function locksPersist() { try { writeJSON(LOCKS_FILE, { list: [...RECENT_LOCKS.entries()].map(([key, at]) => ({ key, at })) }); } catch (_) {} }
function execLock(key) {
  if (EXEC_LOCKS.has(key)) return false;
  EXEC_LOCKS.set(key, true);
  RECENT_LOCKS.set(key, Date.now()); locksPersist();
  return true;
}
function execUnlock(key) {
  EXEC_LOCKS.delete(key);
  if (RECENT_LOCKS.delete(key)) locksPersist(); // 正常解锁除名:不留保守窗口
}
/* 看门狗视角的在途 opId 集合:本进程持锁 ∪ 崩溃残留窗口内的未解锁锁(锁键 <域>:<uid>:<opId>[:<action>]);顺带清超期项 */
function lockedOpIds() {
  const now = Date.now();
  const out = new Set();
  const merge = m => { for (const k of m.keys()) { const opId = k.split(':')[2]; if (opId) out.add(opId); } };
  merge(EXEC_LOCKS);
  let pruned = false;
  for (const [k, at] of RECENT_LOCKS) {
    if (now - at >= LOCK_KEEP_MS) { RECENT_LOCKS.delete(k); pruned = true; continue; }
    const opId = k.split(':')[2]; if (opId) out.add(opId);
  }
  if (pruned) locksPersist();
  return out;
}
/* 某 operation 的全部扣费条目(idem: px_<uid>_<opId>@<action> 或 ~n 重试后缀)
 * R14:可选 action 维度——传 action 时只取该动作的扣费(退费归集与扣费登记的 (opId,action) 口径对齐,
 * 防同一 opId 跨端点复用时一个动作的失败退款误退另一动作的未交付扣费) */
function opChargeEntries(wallet, userId, opId, action) {
  const re = action
    ? new RegExp('^px_' + userId + '_' + opId + '@' + action.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '(~\\d+)?$')
    : new RegExp('^px_' + userId + '_' + opId + '@[^~]+(~\\d+)?$');
  return wallet.entries.filter(e => e.idem && re.test(e.idem));
}
/* 该 operation 下"已扣且未退"的有效条目(每条charge的退费 idem = chargeIdem + '_rf') */
function effectiveCharges(wallet, userId, opId, action) {
  const refunded = new Set(wallet.entries.filter(e => e.type === 'refund' && e.idem).map(e => e.idem));
  return opChargeEntries(wallet, userId, opId, action).filter(c => !refunded.has(c.idem + '_rf'));
}
/* 按次原子扣费(十轮):action 白名单定价 + operation/步骤状态机(判定核心在 billing.js
 * stepDecision 纯函数,此处编排 IO——server 侧状态机决策与单元测试同源)。
 * - 非 LLM 端点(生图/视频/TTS/FFmpeg,高单价):严格绑定 requestHash,delivered 后不可重放。
 * - LLM 端点:step 槽位制;已成功步骤有缓存则返回缓存(真正幂等),无缓存拒绝重放
 *   (十轮:此前会零扣费再执行一次,重放遇上游失败还可能退掉首轮已交付扣费)。
 * - 无 operationId 的直连调用:每次随机 opId 全新扣费(无登记,不可退款)。 */
function proxyCharge(res, userId, action, reason, operationId, endpoint, reqBody, opts) {
  const cost = BILLING_ACTIONS[action];
  if (cost == null || cost <= 0) return { cost: 0, serverCharged: false, refundIdem: null, opId: null };
  const isLlm = /^llm\./.test(action);
  const stepBudget = isLlm ? ((opts && opts.stepBudget) || 8) : 0;
  const step = isLlm ? (sanitizeOpId(reqBody && reqBody.step) || 'main') : '';
  const opId = sanitizeOpId(operationId);
  const rh = requestHashOf(reqBody);
  const odb = opsDB();
  if (opId) {
    const op = opFind(odb, userId, opId, action);
    if (op) {
      const dec = BILLING.stepDecision(op, step, rh, { isLlm, stepBudget });
      if (dec === 'non-llm-conflict') { fail(res, 409, '该 operationId 已绑定其他请求内容,不能复用(每次生成请使用新的任务)', 409); return null; }
      /* 十三轮结果恢复:已交付 operation 的同内容重放先查结果日志——命中直接带回已付费结果
       * (recovered:true),不再 409;无日志(旧数据/超保留期)维持 409 失败关闭 */
      if (dec === 'non-llm-delivered') {
        const rec = resultFind(userId, opId);
        if (rec && rec.payload) {
          resultMarkClaimed(userId, opId);
          return { cost: 0, serverCharged: false, refundIdem: null, opId, action, recovered: rec.payload };
        }
        fail(res, 409, '该操作已成功交付,不能重复执行(结果已生成,请到原任务查看)', 409); return null;
      }
      if (dec === 'conflict') { fail(res, 409, '该步骤的请求内容已变化,不能复用(请使用新的任务或步骤)', 409); return null; }
      if (dec === 'replay-cached') return { cost: 0, serverCharged: false, refundIdem: null, opId, action, cachedResp: op.steps[step].resp };
      if (dec === 'replay-denied') { fail(res, 409, '该步骤已成功执行且结果过大未缓存,不能重放(请使用新的任务)', 409); return null; }
      if (dec === 'replay-exec') return { cost: 0, serverCharged: false, refundIdem: null, opId, action }; // 幂等重放(网络重试)
      if (dec === 'delivered-blk') { fail(res, 409, '该操作已成功交付,不能再追加调用步骤', 409); return null; }
      if (dec === 'budget-blk') { fail(res, 409, `该 operationId 的调用步骤已达上限(${stepBudget} 步,聚合流程含理解/拆解/评审/修订多步),请使用新的任务`, 409); return null; }
      if (dec === 'new-step') {
        op.steps = op.steps || {};
        op.steps[step] = { rh, ok: false };
        op.updatedAt = Date.now();
        saveOps(odb);
        return { cost: 0, serverCharged: false, refundIdem: null, opId, action }; // 新步骤:聚合流程内免费步(整操作只扣一次)
      }
      // non-llm-recharge / llm-recharge:refunded 后同 opId 重试 → 走下方重新扣费(追加新记录)
    }
  }
  const finalOpId = opId || ('direct_' + userId + '_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6));
  const prefix = 'px_' + userId + '_' + finalOpId + '@' + action;
  const wallet = readWallet(userId);
  const mine = opChargeEntries(wallet, userId, finalOpId).filter(c => c.idem.startsWith(prefix));
  const refunded = new Set(wallet.entries.filter(e => e.type === 'refund' && e.idem).map(e => e.idem));
  const eff = mine.filter(c => !refunded.has(c.idem + '_rf'));
  if (eff.length) return { cost: -eff[eff.length - 1].amount, serverCharged: false, refundIdem: eff[eff.length - 1].idem + '_rf', opId: finalOpId, action }; // 已扣未退(wallet 层兜底,如 op 登记丢失的六轮旧账单)
  if (wallet.balance < cost) { fail(res, 402, '积分不足,请充值后再生成', 402); return null; }
  let chargeIdem = prefix + (mine.length > 0 ? '~' + (mine.length + 1) : ''); // 退款后重试 → 新条目
  let r = walletAppend(userId, 'charge', -cost, reason, chargeIdem);
  // 二十轮:幂等键撞上归档索引(旧 operation 跨截断窗口重放)时换新后缀实扣——dup 静默放行会变免费执行
  for (let n = mine.length + 2; r.dup && n < mine.length + 100; n++) {
    chargeIdem = prefix + '~' + n;
    r = walletAppend(userId, 'charge', -cost, reason, chargeIdem);
  }
  syncWalletProjection(userId, r.wallet, r.entry, {});
  if (opId) {
    /* 十一轮:新记录保存本次扣费的完整 chargeIdem(含 ~n 重试后缀)——退款按 idem 一对一精确归属,
     * 修复"退款重试后新扣费映射到旧 refunded 记录"导致的已交付扣费被退回 */
    // projectId 成本归集:前端在项目页内发起的调用注入 _projectId(视频任务取 job 三元组);未标记归入 unlabeled
    const pid = sanitizeOpId(reqBody && reqBody._projectId) || sanitizeOpId(reqBody && reqBody.job && reqBody.job.projectId) || null;
    odb.list.push({ userId, opId, action, endpoint: endpoint || '', requestHash: rh, status: 'charged', chargeIdem, projectId: pid, steps: isLlm ? { [step]: { rh, ok: false } } : undefined, createdAt: Date.now(), updatedAt: Date.now() });
    saveOps(odb);
  }
  return { cost, serverCharged: true, refundIdem: chargeIdem + '_rf', opId: finalOpId, chargeIdem, action };
}
/* 未交付自动退费(九轮重写):按"该 operation 是否仍有有效未退扣费"判定,而非"本次 HTTP 是否新扣"——
 * 复用已扣费 operation 的重试失败同样能退回原扣费(八轮前 serverCharged:false 直接跳过,原扣费悬挂)。
 * 具名 operation 走 refundOperation(幂等;内部路径不受交付限制——服务端确知失败);直连调用维持账本幂等键路径 */
function proxyRefund(userId, charge, reason) {
  if (!charge || !charge.opId) return;
  if (String(charge.opId).startsWith('direct_')) {
    if (!charge.serverCharged || !charge.refundIdem) return;
    const r = walletAppend(userId, 'refund', charge.cost, '服务未交付退费:' + String(reason || '').slice(0, 40), charge.refundIdem);
    if (!r.dup) syncWalletProjection(userId, r.wallet, r.entry, {});
    return;
  }
  refundOperation(userId, charge.opId, '服务未交付:' + String(reason || '').slice(0, 40), false, charge.action || null);
}
/* operation 级退款(退款端点/晚失败/超时闭环共用):退该 operation 全部未退扣费,金额取自原账单。
 * 退款保护(十一轮,归属与判定核心在 billing.js refundPlan/refundDecision):按 chargeIdem
 * 精确归属每笔扣费到其创建记录——已 delivered/refunded、聚合已有成功步骤(部分交付)、登记缺失
 * 一律不退(客户端与内部一致;失败关闭,宁可少退不可多退)。返回实退总额。
 * R14:可选 action 维度——传 action 时记录与扣费均按 (opId,action) 归集,防同一 opId 跨端点复用时
 * 互相误退(扣费登记本就按 (opId,action),退费口径对齐);不传(旧客户端退款端点)维持 opId 宽口径。 */
function refundOperation(userId, opId, reason, clientInitiated, action) {
  const odb = opsDB();
  const ops = odb.list.filter(o => o.userId === userId && o.opId === opId && (!action || o.action === action));
  const w = readWallet(userId);
  const eff = effectiveCharges(w, userId, opId, action || null);
  let total = 0, dirty = false;
  for (const item of BILLING.refundPlan(ops, eff)) {
    if (item.decision !== 'refundable') continue; // blocked-delivered/refunded/ok-step/missing:一律不退
    const c = item.charge; // 十二轮 P0:refundPlan 返回键为 charge(此前误用 item.char → undefined.amount 崩溃,所有退款路径 500)
    const r = walletAppend(userId, 'refund', -c.amount, '退费:' + String(reason || c.reason || '').slice(0, 50), c.idem + '_rf');
    if (!r.dup) {
      syncWalletProjection(userId, r.wallet, r.entry, {});
      total += -c.amount;
      item.op.status = 'refunded'; item.op.updatedAt = Date.now(); dirty = true;
    }
  }
  if (dirty) saveOps(odb);
  return total;
}
/* executing 崩溃残留看门狗(十二轮 P1):同步付费端点(生图/TTS/FFmpeg/LLM)请求最长数分钟,
 * executing 超 30 分钟必为进程崩溃/重启残留(扣费后未走到交付/退款任一出口);有活动 job 的
 * operation(视频等异步任务)跳过——其终态/退款由任务中心对账闭环负责。
 * 残留走内部退款(refundPlan 判定;部分交付 blocked-ok-step 不退,只收敛为 failed 终态不再悬挂)。
 * 5 分钟周期 + 退款端点/任务中心入口触发(幂等)——executing 对客户端永久拒退后,
 * 崩溃残留的退款出口完全由本看门狗承担。
 * R14+二十二轮:退款前先查执行锁——锁已落盘(data/locks.json),进程崩溃/重启后窗口期内仍保守视为
 * "可能仍在执行"(如 80 段合成合法跑 40+ 分钟、ffmpeg 子进程存活过重启),绝不清算;
 * 超过窗口且未正常解锁的陈旧 executing 才是崩溃残留。
 * 同时按 (opId,action) 归集退款,与扣费登记口径对齐。 */
const OP_EXECUTE_STALE_MS = 30 * 60 * 1000;
const RESULT_CLAIM_RETRY_MAX = 3;        // 结果领取失败自动重试次数(幂等 + 指数退避)
function sweepStaleOps(forceRefund) {
  // 1) 先做结果领取重试:executing → 先查 results.json 是否已经有交付,有则直接转为 succeeded(用户未 claim 也不算白跑),
  //    本轮没 claim 的失败结果(claimRetries < 最大)不直接判失败,给下次 retry 机会,避免 sweep 竞态误伤。
  let odb = opsDB();
  let dirty = false;
  odb.list.forEach(o => {
    if (o.status !== 'executing') return;
    const r = resultFind(o.userId, o.opId);
    if (r && r.payload && (r.payload.url || r.payload.done)) {   // 结果已经交付
      const cur = opFind(odb, o.userId, o.opId, o.action);      // 用同一 odb 引用,避免每次 opsDB() 重读新实例修改丢失
      if (cur && cur.status === 'executing') {
        cur.status = 'succeeded'; cur.updatedAt = Date.now(); cur.resultSavedAt = r.savedAt; dirty = true;
        auditAppend('stale_recover', { uid: o.userId, opId: o.opId, action: o.action || null, at: Date.now() });
      }
    }
  });
  if (dirty) saveOps(odb);
  // 2) 原来的 executing→退款→failed 看门狗(在结果重试之后执行,避免"结果日志已在途中但 sweep 先退款"的窗口)
  odb = opsDB();
  const stale = odb.list.filter(o => o.status === 'executing' && Date.now() - (o.updatedAt || o.createdAt || 0) > OP_EXECUTE_STALE_MS);
  if (!stale.length) return;
  const jdb = jobsDB();
  const activeOps = new Set(jdb.list.filter(j => j.status === 'running' || j.status === 'needs_reconcile').map(j => j.billingOperationId).filter(Boolean));
  const locked = lockedOpIds(); // 在途 opId 集合:本进程持锁 ∪ 崩溃残留窗口内未解锁锁(二十二轮锁落盘,重启不丢"仍在执行"判据)
  dirty = false;
  stale.forEach(o => {
    if (activeOps.has(o.opId) || locked.has(o.opId)) return; // 活动任务/本进程仍在执行:跳过,防误伤合法长任务
    // 领取重试:claimRetries 超限才退款,否则 +1 计数 + 延后 updatedAt,下轮 sweep 再看
    // forceRefund=true(用户通过 /billing/refund 发起人工干预)时跳过 claimRetries,立即进入退款终态,避免 3 次 2min*3=6min 的等待
    let cur0 = opFind(odb, o.userId, o.opId, o.action);
    if (cur0 && cur0.status === 'executing' && !forceRefund) {
      cur0.claimRetries = (cur0.claimRetries || 0) + 1;
      if (cur0.claimRetries < RESULT_CLAIM_RETRY_MAX) {
        cur0.updatedAt = Date.now() - OP_EXECUTE_STALE_MS + 2 * 60 * 1000; // 延后 2 分钟,下次 sweep 前不再次触发
        dirty = true; return;
      }
    }
    refundOperation(o.userId, o.opId, '执行残留看门狗(进程崩溃/重启,' + Math.round(OP_EXECUTE_STALE_MS / 60000) + ' 分钟未终态)', false, o.action || null);
    odb = opsDB(); // 重新读取(refundOperation 已按其判定落盘 refunded)
    const cur = opFind(odb, o.userId, o.opId, o.action);
    if (cur && cur.status === 'executing') { cur.status = 'failed'; cur.updatedAt = Date.now(); dirty = true; }
  });
  if (dirty) saveOps(odb);
}

/* ---------- operation 结果日志(十三轮):与账本分离的结果恢复 ----------
 * 生图/TTS/FFmpeg 交付成功即把结果 URL 落 data/results.json(不含金额,与 operations.json 账本分工)——
 * 此前"服务端已 delivered 但响应在网络中丢失/进程在回包前崩溃"后,同 opId 重试只得到 409,
 * 用户已付费的结果永久丢失(视频有任务中心续查,同步端点无恢复通道)。
 * 恢复:proxyCharge 对 non-llm-delivered(同 opId 同请求体重放)先查日志,命中直接返回结果
 * (recovered:true),不再 409;GET /api/operations/:opId/result 供客户端主动领取(标 claimed)。
 * LLM 走 steps[].resp 缓存(≤8KB)不重复入日志;直连(direct_)无 operationId 不入日志。 */
const RESULTS_FILE = path.join(DATA_DIR, 'results.json');
const RESULTS_KEEP_MS = 7 * 24 * 3600 * 1000; // 保留期对齐生成缓存清理窗口(结果引用的 uploads/gen 文件最长存活)
const RESULTS_MAX = 3000;
function resultsDB() {
  const db = readJSON(RESULTS_FILE, { list: [] });
  if (!Array.isArray(db.list)) return { list: [] };
  return db;
}
function saveResults(db) {
  const cutoff = Date.now() - RESULTS_KEEP_MS;
  const kept = db.list.filter(r => (r.savedAt || 0) >= cutoff);
  db.list = kept.length > RESULTS_MAX ? kept.slice(-RESULTS_MAX) : kept;
  writeJSON(RESULTS_FILE, db);
}
function resultPut(userId, opId, action, endpoint, payload) {
  if (!opId || String(opId).startsWith('direct_')) return;
  try {
    const db = resultsDB();
    const i = db.list.findIndex(r => r.userId === userId && r.opId === opId);
    const rec = { userId, opId, action, endpoint, payload: payload || {}, savedAt: Date.now(), claimed: false };
    if (i >= 0) db.list[i] = rec; else db.list.push(rec);
    saveResults(db);
    auditAppend('deliver', { uid: userId, opId, action, endpoint, url: String((payload || {}).url || '').slice(0, 120) }); // R19:货轨(结果落库即交付凭证)
  } catch (_) { /* 结果日志失败不阻断交付 */ }
}
function resultFind(userId, opId) {
  return resultsDB().list.find(r => r.userId === userId && r.opId === opId) || null;
}
function resultMarkClaimed(userId, opId) {
  try {
    const db = resultsDB();
    const r = db.list.find(x => x.userId === userId && x.opId === opId);
    if (r && !r.claimed) { r.claimed = true; saveResults(db); }
  } catch (_) {}
}

/* ---------- 生成任务中心(data/jobs.json:断点续查/幂等/审计的持久化登记) ----------
 * 视频上游任务 id 此前只存在浏览器局部变量里,刷新/重启即失联;现统一登记:
 * 创建时按 userId+shotId+inputHash 幂等(同镜同输入只允许一个活动任务,避免重复扣费与重复生成);
 * 轮询时回写状态;30 分钟未终态标 stale、60 分钟转 needs_reconcile 由对账查上游后再定终态/退款。 */
const JOBS_FILE = path.join(DATA_DIR, 'jobs.json');
const JOBS_MAX = 500;
const JOB_STALE_MS = 30 * 60 * 1000;
function jobsDB() {
  const db = readJSON(JOBS_FILE, { list: [] });
  if (!Array.isArray(db.list)) return { list: [] };
  return db;
}
function saveJobs(db) {
  // 上限截断(新的在前);running 任务永不淘汰(截断只作用于已终态条目,防旧运行中任务被挤掉失联)
  const running = db.list.filter(j => j.status === 'running');
  const rest = db.list.filter(j => j.status !== 'running');
  db.list = rest.slice(0, Math.max(0, JOBS_MAX - running.length)).concat(running);
  try { writeJSON(JOBS_FILE, db); } catch (e) { console.error('[jobs] 落盘失败:', e); }
}
function jobUpstreamHash(b) {
  const sig = JSON.stringify({
    prompt: b.prompt, ratio: b.ratio, duration: b.duration, model: b.model,
    image: b.image, lastFrame: b.lastFrame, refVideo: b.refVideo,
    refImages: Array.isArray(b.refImages) ? b.refImages.map(x => x && x.url) : undefined,
    refAudio: b.refAudio,
  });
  return crypto.createHash('sha1').update(sig).digest('hex');
}
/* 同镜同输入的进行中任务(幂等复用其 upstreamId,不再创建新上游任务)
 * 十一轮 P1-4:复用窗口从 30 分钟放宽到 60 分钟终态截止——此前 30~60 分钟间重试会绕过复用
 * 双开上游任务(重复成本);60 分钟后任务已转 needs_reconcile(非 running),自然不再复用 */
function findActiveJob(db, userId, job, inputHash) {
  if (!job || !job.shotId) return null;
  const now = Date.now();
  return db.list.find(j => j.userId === userId && j.shotId === job.shotId && j.inputHash === inputHash
    && j.status === 'running' && now - (j.createdAt || 0) < JOB_FINAL_MS) || null;
}
function jobRegister(db, userId, upstreamId, job, inputHash, billing, status) {
  db.list.unshift({
    id: uid('job'), upstreamId, userId,
    projectId: job && job.projectId || null, episodeId: job && job.episodeId || null, shotId: job && job.shotId || null,
    inputHash, status: status || 'running', createdAt: Date.now(), updatedAt: Date.now(), videoUrl: '',
    billingOperationId: (billing && billing.opId) || null, billingAction: (billing && billing.action) || null,
    billingCost: (billing && billing.cost) || 0, refunded: false,
  });
  saveJobs(db);
  return db.list[0];
}
/* 二十轮:删除登记行(创建占位在上游失败/退回时撤销,不占用幂等位) */
function jobRemove(id) {
  const db = jobsDB();
  const n = db.list.length;
  db.list = db.list.filter(j => j.id !== id);
  if (db.list.length !== n) saveJobs(db);
}
/* 超时清扫(十一轮三档):30 分钟未终态 → 标 stale(不退款,轮询时先查一次上游再定——
 * 任务在第 30 分钟附近刚成功时不再被直接退款+拒交付);60 分钟仍未终态 → needs_reconcile
 * (不再直接退款!)——由 reconcileStaleJobs 对账查询上游后再定:已成功 → 交付落片;
 * 已失败或仍在跑(60 分钟后基本不可能成功)→ timed_out+退款(终极兜底,防用户不再轮询时
 * 扣费永久悬挂)。统一在 /api/jobs 与视频轮询入口触发 + 5 分钟周期兜底(幂等)。 */
const JOB_FINAL_MS = 60 * 60 * 1000;
function sweepJobs() {
  const db = jobsDB();
  let changed = false;
  db.list.forEach(j => {
    const age = Date.now() - (j.createdAt || 0);
    if (j.status === 'creating' && age > 5 * 60 * 1000) {
      j.__drop = true; changed = true; // 二十轮:创建占位超 5 分钟未转 running = 进程崩溃残留,清除让出幂等位(扣费由 executing 看门狗兜底退款)
    } else if (j.status === 'running' && age > JOB_FINAL_MS) {
      j.status = 'needs_reconcile'; j.updatedAt = Date.now(); changed = true; // 60 分钟:转待对账,由对账查上游后再定退款
    } else if (j.status === 'running' && age > JOB_STALE_MS && !j.stale) {
      j.stale = true; j.updatedAt = Date.now(); changed = true; // 30 分钟:标待对账,不退款
    }
  });
  if (changed) { db.list = db.list.filter(j => !j.__drop); saveJobs(db); }
}
/* 任务退款闭环(十一轮 P1-4):检查 refundOperation 实退金额>0 才落 refunded 标记——
 * 此前不看返回值直接写 true,退款被判 blocked(登记缺失/已交付)时会假标"已退"掩盖账实不符 */
function refundJob(j, reason) {
  if (!j || !j.billingOperationId || j.refunded) return;
  let got = 0;
  try { got = refundOperation(j.userId, j.billingOperationId, reason, false, j.billingAction || null); } catch (_) { return; }
  if (got > 0) jobUpdate(jobsDB(), j.upstreamId, { refunded: true });
}
/* needs_reconcile 对账(十一轮 P1-4):60 分钟未终态的任务先查上游再决定退款,不再盲退——
 * 上游已成功(视频已出)→ 抓存落片并标 operation delivered(用户晚到也能拿到结果);
 * 上游已失败/succeeded 无地址 → failed+退款;上游仍在跑/未知 → timed_out+退款(对账过上游,
 * 非 60 分钟盲退)。上游查询失败(网络)保留 needs_reconcile 下轮再试。
 * /api/jobs 与视频轮询入口触发 + 5 分钟周期兜底;RECONCILING 防并发双跑。 */
let RECONCILING = false;
async function reconcileStaleJobs() {
  if (RECONCILING || !CONFIG.volcApiKey) return;
  const pend = jobsDB().list.filter(j => j.status === 'needs_reconcile' && j.upstreamId);
  if (!pend.length) return;
  RECONCILING = true;
  try {
    for (const j of pend) {
      try {
        const r = await volcUpstream('/contents/generations/tasks/' + j.upstreamId, null, 30000);
        if (!r.ok && r.status !== 404) continue; // 瞬时上游错误(5xx/超时):保留待对账下轮再试;404=任务已不存在,按终态处理
        const data = r.ok ? parseUpstreamJSON(await r.text(), '任务对账') : null;
        const st = data && data.status;
        const remoteUrl = data && data.content && data.content.video_url;
        if (st === 'succeeded' && remoteUrl) {
          const videoUrl = (await cacheGenFile(remoteUrl, '.mp4')) || remoteUrl;
          /* 十二轮交付守卫:operation 已退款(看门狗等路径)→ 结果不再交付,job 转 cancelled,
           * 防客户端 reconcileJobs 从任务中心把已退款视频拉回本地(退款+白拿成品) */
          const jPre = jobsDB().list.find(x => x.upstreamId === j.upstreamId);
          if (jPre && jPre.billingOperationId && !jPre.refunded
            && !opDelivered(j.userId, jPre.billingOperationId, jPre.billingAction)) {
            jobUpdate(jobsDB(), j.upstreamId, { status: 'cancelled', error: '该操作已退款,结果不再交付' });
            continue;
          }
          jobUpdate(jobsDB(), j.upstreamId, { status: 'succeeded', videoUrl, remoteUrl }); // remoteUrl 兜底存档:本地缓存被清理后仍可溯源
        } else if (st === 'succeeded' || st === 'failed') {
          const msg = st === 'failed' ? ((data.error && data.error.message) || '上游生成失败') : 'succeeded 无视频地址';
          jobUpdate(jobsDB(), j.upstreamId, { status: 'failed', error: msg });
          refundJob(jobsDB().list.find(x => x.upstreamId === j.upstreamId), '任务对账:' + msg);
        } else {
          jobUpdate(jobsDB(), j.upstreamId, { status: 'timed_out', error: '任务超时(60 分钟未终态,对账上游无结果)' });
          refundJob(jobsDB().list.find(x => x.upstreamId === j.upstreamId), '任务超时(' + Math.round(JOB_FINAL_MS / 60000) + ' 分钟未终态,终极退款)');
        }
      } catch (_) { /* 上游查询失败:保留 needs_reconcile,下轮再试 */ }
    }
  } finally { RECONCILING = false; }
}
setInterval(() => { try { sweepJobs(); sweepStaleOps(); } catch (_) {} reconcileStaleJobs().catch(() => {}); }, 5 * 60 * 1000).unref();
/* 单向状态机(十二轮 P1):running → needs_reconcile → succeeded/failed/timed_out/cancelled,
 * 任一终态不可再翻转——后台对账与视频轮询可并发查询同一任务,旧响应(如 running 空回写)
 * 此前可覆盖另一路刚写入的 succeeded。终态后的非状态字段(refunded/videoUrl 等)仍可补写 */
const JOB_TERMINAL = new Set(['succeeded', 'failed', 'timed_out', 'cancelled']);
function jobUpdate(db, upstreamId, patch) {
  const j = db.list.find(x => x.upstreamId === upstreamId);
  if (!j) return;
  if (JOB_TERMINAL.has(j.status) && patch.status && patch.status !== j.status) return; // 终态保护:旧响应不得翻转
  Object.assign(j, patch, { updatedAt: Date.now() });
  // 八轮:超时判定统一收口到 sweepJobs(timed_out+退款)——此处不再顺带标 failed,
  // 消除"另一条路径标记超时但不退款"的分叉(jobUpdate 的调用方 GET 已先 sweep,该分支本已不可达)
  saveJobs(db);
}

/* ---------- uploads/gen/ 缓存清理:引用扫描 + 保留期 ----------
 * 删除「未被任何用户 state 引用」且「超过 genCacheDays 天」的生成缓存文件(默认 3 天,0=关闭)。
 * 引用根(十二轮扩):用户 state(data/states/*.json 中的 /uploads/gen/<name> 字符串)
 * + 任务中心 jobs.json 的 videoUrl——后台对账成功后视频先落 jobs、用户未打开项目时 state
 * 尚无引用,此前默认 3 天即被清理,jobs 随后返回失效地址。 */
function sweepGenCache() {
  try {
    const days = +(CONFIG.genCacheDays === undefined ? 3 : CONFIG.genCacheDays);
    if (!days) return;
    const referenced = new Set();
    try {
      for (const f of fs.readdirSync(STATES_DIR)) {
        if (!f.endsWith('.json')) continue;
        try {
          const txt = fs.readFileSync(path.join(STATES_DIR, f), 'utf8');
          for (const m of txt.matchAll(/\/uploads\/gen\/([\w.-]+)/g)) referenced.add(m[1]);
        } catch (_) {}
      }
    } catch (_) {}
    /* 十二轮:任务中心兜底引用——非终态与已成功任务的 videoUrl 同样计入引用名单
     * (已成功但用户尚未领取的结果不能清理;cancelled/timed_out 已退款不含可领取结果) */
    try {
      const jdb = readJSON(JOBS_FILE, { list: [] });
      for (const j of (jdb && jdb.list) || []) {
        if (!j.videoUrl) continue;
        const m = String(j.videoUrl).match(/\/uploads\/gen\/([\w.-]+)/);
        if (m) referenced.add(m[1]);
      }
    } catch (_) {}
    /* 十五轮:结果日志兜底引用——TTS/FFmpeg/生图已交付但客户端尚未认领(超时/断线)的结果
     * 同样计入引用名单:此前默认 3 天即清,领取端点(保留 7 天)随后返回失效地址 */
    try {
      const rdb = readJSON(RESULTS_FILE, { list: [] });
      for (const r of (rdb && rdb.list) || []) {
        const u = r && r.payload && r.payload.url;
        const m = u && String(u).match(/\/uploads\/gen\/([\w.-]+)/);
        if (m) referenced.add(m[1]);
      }
    } catch (_) {}
    const cutoff = Date.now() - days * 24 * 3600 * 1000;
    let removed = 0, freed = 0;
    for (const f of fs.readdirSync(GEN_CACHE_DIR)) {
      const fp = path.join(GEN_CACHE_DIR, f);
      try {
        const st = fs.statSync(fp);
        if (!st.isFile() || st.mtimeMs >= cutoff || referenced.has(f)) continue;
        fs.unlinkSync(fp); removed++; freed += st.size;
      } catch (_) {}
    }
    if (removed) console.log(`[gen-cache] 清理未引用且超期文件 ${removed} 个,释放 ${(freed / 1048576).toFixed(1)}MB`);
    /* R19:thumbs 一并清扫——键为 sha1(源路径+mtime),源文件删除/更新后旧缩略图永久孤儿;
     * 纯缓存按需懒重生,超期即删无引用名单负担 */
    try {
      const THUMBS_DIR = path.join(UPLOADS_DIR, 'thumbs');
      let tRemoved = 0;
      for (const f of fs.readdirSync(THUMBS_DIR)) {
        const fp = path.join(THUMBS_DIR, f);
        try {
          const st = fs.statSync(fp);
          if (!st.isFile() || st.mtimeMs >= cutoff) continue;
          fs.unlinkSync(fp); tRemoved++;
        } catch (_) {}
      }
      if (tRemoved) console.log(`[gen-cache] 清理超期缩略图 ${tRemoved} 个`);
    } catch (_) {}
  } catch (_) { /* 清理失败不影响服务 */ }
}
sweepGenCache();
setInterval(sweepGenCache, 24 * 3600 * 1000).unref();

/* ---------- 团队(真实成员体系;数据存 data/teams.json) ---------- */
const TEAMS_FILE = path.join(DATA_DIR, 'teams.json');
const TEAM_MAX = 50; // 单团队成员上限
function teamsDB() {
  const db = readJSON(TEAMS_FILE, { list: [] });
  if (!db || !Array.isArray(db.list)) return { list: [] };
  return db;
}
/* 我所属的团队(owner 或 member 均算);多项目组:返回数组,teamOfUser 取第一个兼容旧逻辑 */
function teamsOfUser(db, userId) {
  return db.list.filter(t => t.ownerId === userId || (t.members || []).some(m => m.userId === userId));
}
function teamOfUser(db, userId) {
  return teamsOfUser(db, userId)[0] || null;
}
function newInviteCode(db) {
  let code = '';
  do { code = 'MV-' + crypto.randomBytes(3).toString('hex').toUpperCase(); }
  while (db.list.some(t => t.inviteCode === code));
  return code;
}
/* "2026/8/18 19:08:18"(nowStr 格式)→ epoch */
function parseCnTime(s) {
  const m = String(s || '').match(/(\d+)\/(\d+)\/(\d+)\s+(\d+):(\d+):(\d+)/);
  return m ? new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]).getTime() : 0;
}
/* 成员真实消耗聚合:直接读 data/states/<userId>.json 的 creditLogs(spend-refund 净额)与 tasks(type 含'视频'/'节拍板' 计视频任务);
 * 附带最近 31 天逐日 {spend, videos},供前端趋势图按 日/周/月 粒度聚合 */
function teamMemberStats(m) {
  const cur = readJSON(stateFile(m.userId), { state: null });
  const st = cur.state || {};
  const logs = Array.isArray(st.creditLogs) ? st.creditLogs : [];
  const tasks = Array.isArray(st.tasks) ? st.tasks : [];
  const days = {}; // day -> {day, spend, videos}
  const bump = (ts, spend, videos) => {
    if (!ts) return;
    const d = dayStr(ts);
    const o = days[d] = days[d] || { day: d, spend: 0, videos: 0 };
    o.spend += spend; o.videos += videos;
  };
  let netSpend = 0, videoCnt = 0, last = 0;
  logs.forEach(l => {
    const amt = +(l.amount || 0);
    const v = l.type === 'spend' ? amt : l.type === 'refund' ? -amt : 0;
    netSpend += v;
    const ts = parseCnTime(l.time);
    if (v) bump(ts, v, 0);
    if (ts > last) last = ts;
  });
  tasks.forEach(t => {
    const isV = /视频|节拍板/.test(String(t.type || ''));
    if (isV) videoCnt++;
    const ts = +t.startedAt || 0;
    if (ts) bump(ts, 0, isV ? 1 : 0);
    if (ts > last) last = ts;
  });
  const minDay = dayStr(Date.now() - 31 * 86400000);
  const byDay = Object.values(days).filter(d => d.day >= minDay).sort((a, b) => (a.day < b.day ? -1 : 1));
  return { userId: m.userId, username: m.username, role: m.role, netSpend, videoCnt, taskCnt: tasks.length, lastActive: last || null, byDay };
}

/* ---------- 静态托管 ---------- */
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.gif': 'image/gif', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.ico': 'image/x-icon',
  '.mp4': 'video/mp4', '.webm': 'video/webm', '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.m4a': 'audio/mp4',
  '.txt': 'text/plain; charset=utf-8', '.md': 'text/markdown; charset=utf-8', '.bat': 'text/plain; charset=utf-8',
  '.bcmap': 'application/octet-stream', '.pfb': 'application/octet-stream',
};
function serveStatic(req, res, pathname) {
  let rel;
  try { rel = decodeURIComponent(pathname); } catch (_) { return fail(res, 400, 'Bad path'); }
  // 统一规范化:反斜杠转正斜杠、折叠重复斜杠、消除 . 与 ..(防 /data\x、//config.json、/%2e%2e/ 绕过)
  rel = rel.replace(/\\/g, '/');
  if (!rel.startsWith('/')) rel = '/' + rel;
  rel = path.posix.normalize(rel);
  // 兜底(七轮):canonical /uploads 路径只允许走上方媒体鉴权路由——
  // 任何方法/编码/大小写变体落到这里都视为绕过尝试,直接拒绝(磁盘访问大小写不敏感,/UPLOADS 同样命中)
  if (rel.toLowerCase().startsWith('/uploads/')) return fail(res, 403, 'Forbidden(上传文件须走媒体鉴权路由)', 403);
  if (rel === '/' || rel === '') rel = '/index.html';
  const lower = rel.toLowerCase();
  if (lower === '/data' || lower.startsWith('/data/') || lower === '/config.json' || lower === '/server.js'
    || lower.includes('/.') || rel.includes('..')) {
    return fail(res, 403, 'Forbidden');
  }
  const abs = path.normalize(path.join(ROOT, rel));
  // L13 修复:前缀比较需带分隔符,防兄弟目录(如 modelvideo-hujing-evil)误放行
  if (abs !== ROOT && !abs.startsWith(ROOT + path.sep)) return fail(res, 403, 'Forbidden');
  fs.stat(abs, (err, st) => {
    if (err || !st.isFile()) {
      if (!rel.startsWith('/api') && !path.extname(rel)) return serveFile(res, path.join(ROOT, 'index.html'), req);
      return fail(res, 404, 'Not Found');
    }
    serveFile(res, abs, req);
  });
}
/* js/css 目录最新 mtime(html 的 ETag 与版本号注入都用它,任一前端文件变更即失效重取) */
function frontEndStamp() {
  let max = 0;
  for (const dir of ['js', 'css']) {
    try {
      for (const f of fs.readdirSync(path.join(ROOT, dir))) {
        if (!/\.(js|css)$/.test(f)) continue;
        const mt = fs.statSync(path.join(ROOT, dir, f)).mtimeMs;
        if (mt > max) max = mt;
      }
    } catch (_) {}
  }
  return Math.round(max);
}
function serveFile(res, abs, req) {
  const ext = path.extname(abs).toLowerCase();
  const headers = { 'Content-Type': MIME[ext] || 'application/octet-stream' };
  if (ext === '.svg') headers['Content-Disposition'] = 'attachment'; // 存量 SVG 一律下载,防存储型 XSS
  // HTML:注入 js/css 版本号(?v=文件 mtime),ETag 混入前端目录最新 mtime——彻底杜绝新旧混版缓存
  if (ext === '.html') {
    let html = fs.readFileSync(abs, 'utf8');
    html = html.replace(/(src|href)="((?:js|css)\/[^"?]+)"/g, (m, attr, rel) => {
      try { return `${attr}="${rel}?v=${Math.round(fs.statSync(path.join(ROOT, rel)).mtimeMs)}"`; } catch (_) { return m; }
    });
    const st = fs.statSync(abs);
    const etag = '"' + st.size.toString(16) + '-' + frontEndStamp().toString(16) + '"';
    headers['ETag'] = etag;
    headers['Cache-Control'] = 'no-cache';
    if (req && req.headers['if-none-match'] === etag) { res.writeHead(304, SEC_HEADERS); return res.end(); }
    res.writeHead(200, Object.assign(headers, SEC_HEADERS));
    return res.end(html);
  }
  // ETag + no-cache:每次 revalidate,内容未变返回 304;防热更新后浏览器跑新旧混版 JS
  try {
    const st = fs.statSync(abs);
    const etag = '"' + st.size.toString(16) + '-' + Math.round(st.mtimeMs).toString(16) + '"';
    headers['ETag'] = etag;
    headers['Cache-Control'] = 'no-cache';
    if (req && req.headers['if-none-match'] === etag) { res.writeHead(304, SEC_HEADERS); return res.end(); }
    // Range 支持(视频拖进度条 seek):按字节区间返回 206,避免整文件重下
    headers['Accept-Ranges'] = 'bytes';
    headers['Content-Length'] = st.size;
    const range = req && req.headers.range;
    if (range) {
      const m = String(range).match(/^bytes=(\d*)-(\d*)$/);
      if (m && (m[1] !== '' || m[2] !== '')) {
        let start = m[1] === '' ? Math.max(0, st.size - (+m[2] || 1)) : +m[1]; // "bytes=-N" 取末尾 N 字节
        let end = m[2] === '' ? st.size - 1 : Math.min(+m[2], st.size - 1);
        if (start <= end && start < st.size) {
          headers['Content-Range'] = `bytes ${start}-${end}/${st.size}`;
          headers['Content-Length'] = end - start + 1;
          res.writeHead(206, Object.assign(headers, SEC_HEADERS));
          // 流错误兜底(二十轮):磁盘读失败不再让异常冒泡崩进程
          return fs.createReadStream(abs, { start, end })
            .on('error', () => { try { res.destroy(); } catch (_) {} })
            .pipe(res);
        }
        res.writeHead(416, Object.assign({ 'Content-Range': `bytes */${st.size}` }, SEC_HEADERS));
        return res.end();
      }
    }
  } catch (_) {}
  res.writeHead(200, Object.assign(headers, SEC_HEADERS));
  fs.createReadStream(abs)
    .on('error', () => { try { res.destroy(); } catch (_) {} }) // 流错误兜底(二十轮)
    .pipe(res);
}

/* ---------- 上传配额 ---------- */
function userUploadBytes(userId) {
  const dir = path.join(UPLOADS_DIR, userId);
  let total = 0;
  try {
    for (const f of fs.readdirSync(dir)) {
      if (f.startsWith('tmp_')) continue; // R19:上传原子写残留(崩溃窗口)不计配额,由上传路径顺带清理
      try { total += fs.statSync(path.join(dir, f)).size; } catch (_) {}
    }
  } catch (_) {}
  return total;
}

/* ---------- 服务端工作流内部 LLM 调用(二十一轮) ----------
 * /api/wf/* 端点的编排内核:复用 /api/llm/chat 同一条计费/状态机/并发锁/重试/JSON 修复链路,
 * 但计费动作由服务端按工作流定死(不接受客户端 billingAction——llm.* 族标签套利在工作流端点消失);
 * opt.step 走步骤槽位(同 operationId 聚合一笔扣费,stepBudget 8);失败一律先退费再抛错,
 * 调用方如实回报(服务端工作流不回退本地模板冒充交付——离线兜底是浏览器语义,服务端恒在线语义)。 */
function wfMockOut(kind) {
  if (kind === 'und') return { 剧情脉络: 'mock 脉络:冲突开场中段升级结尾留钩', 情绪曲线: 'mock 曲线:铺垫到爆发', 节奏规划: 'mock 节奏:前缓后快', 视觉基调: 'mock 基调:主体突出', 关键场面: 'mock 场面:对峙与反转', 悬念与期待: 'mock 悬念:结尾钩子' };
  if (kind === 'shots') return [
    { plot: '钩子开场:女主被当众羞辱', camera: '固定镜头', view: '正面', angle: '平视', shotSize: '中景', characters: [], scene: '', props: [], narration: '', dialogue: '你们会后悔的。', prompt: '漫剧风格,宴会厅,女主被嘲讽,冷色调', duration: 5, strategy: 'ref' },
    { plot: '女主转身离开暗下决心', camera: '推镜头', view: '背面', angle: '平视', shotSize: '全景', characters: [], scene: '', props: [], narration: '', dialogue: '', prompt: '漫剧风格,女主转身离开,背影坚定', duration: 5, strategy: 'ref' },
  ];
  if (kind === 'sbReview') return { score: 92, comments: [{ role: '审片', text: 'mock 达标' }] };
  if (kind === 'shotReview') return { score: 8.2, dimensions: { technical: { score: 8, comment: 'mock 技术评语', suggestion: 'mock 建议' }, matching: { score: 8, comment: 'mock 匹配评语', suggestion: 'mock 建议' }, directing: { score: 8, comment: 'mock 导演评语', suggestion: 'mock 建议' } }, issues: [] };
  if (kind === 'sum') return { summary: 'mock 整集总评', issues: [] };
  if (kind === 'cut') return { natural: { score: 8, comment: 'mock' }, continuity: { score: 8, comment: 'mock' }, framing: { score: 8, comment: 'mock' }, pacing: { score: 8, comment: 'mock' }, overall: 'mock 整集剪辑总评' };
  return { reply: 'mock' };
}
async function wfLLM(userId, opt) {
  // opt: {action, reason, opId, step, wfName, model, system, user|messages, temperature, max_tokens, projectId, mockKind}
  // 测试 mock(与 /api/llm/chat 同约定):不调上游也不扣费
  if (process.env.MOCK_LLM === '1' || CONFIG.mockLlm) return { parsed: wfMockOut(opt.mockKind), model: 'mock-llm', mock: true };
  // proxyCharge 需要 res 写失败响应——内部调用用收集型 shim,转为抛出
  const shim = { __st: 0, __msg: '', writeHead(c) { this.__st = c; }, end(b) { try { this.__msg = (JSON.parse(b) || {}).message || ''; } catch (_) {} } };
  const charge = proxyCharge(shim, userId, opt.action, opt.reason || ('工作流(' + opt.action + ')'), opt.opId, 'wf/' + (opt.wfName || 'llm'), { step: opt.step, _projectId: opt.projectId }, { stepBudget: opt.stepBudget || 8 });
  if (!charge) { const e = new Error(shim.__msg || '计费校验未通过'); e.httpStatus = shim.__st || 402; throw e; }
  if (charge.cachedResp != null) { // 已成功步骤的同内容重放:直接恢复缓存(不重复调上游/扣费)
    const parsed = lenientParseJSON(charge.cachedResp);
    if (parsed === null) { const e = new Error('该步骤缓存结果解析失败,请使用新的任务'); e.httpStatus = 409; throw e; }
    return { parsed, cached: true, charge };
  }
  const step = sanitizeOpId(opt.step) || 'main';
  const lockKey = 'wf:' + userId + ':' + charge.opId + ':' + opt.action + ':' + step;
  if (!execLock(lockKey)) { const e = new Error('该操作正在执行中,请勿并发重复提交'); e.httpStatus = 409; throw e; }
  try {
    opMarkExecuting(userId, charge.opId, opt.action);
    const messages = opt.messages || [{ role: 'user', content: opt.user }];
    // llmModel 配置后强制覆盖(与 /api/llm/chat 同规则:Agent/Coding Plan 路由模型优先,链式互备)
    const models = CONFIG.llmModel ? [CONFIG.llmModel].concat(CONFIG.llmModelFallbacks || []) : [opt.model || 'qwen-turbo'];
    let r = null, model = models[0];
    for (const m of models) {
      model = m;
      try {
        r = await llmUpstreamRetry('/chat/completions', {
          method: 'POST',
          body: JSON.stringify({ model: m, messages, temperature: typeof opt.temperature === 'number' ? opt.temperature : 0.7, max_tokens: Math.min(+(opt.max_tokens || 4000), 16000), stream: false }),
        }, CONFIG.llmTimeoutMs || 120000);
      } catch (e) {
        throw new Error(e.name === 'AbortError' ? 'LLM 请求超时(含重试)' : '无法连接 LLM 上游服务,请检查网络(已自动重试 2 次)');
      }
      if (r.ok) break;
    }
    const text = await r.text();
    if (!r.ok) {
      trackErr('llm');
      let detail = '';
      try { const j = JSON.parse(text); detail = (j.error && (j.error.message || j.error.code)) || ''; } catch (_) {}
      throw new Error((r.status === 401 ? 'LLM Key 无效(上游 401),请检查服务端 config.json' : 'LLM 请求失败(' + r.status + ')') + (detail ? ':' + String(detail).slice(0, 120) : ''));
    }
    const data = parseUpstreamJSON(text, 'LLM');
    recordUsage(userId, model, data.usage);
    let content = data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content;
    if (!content) throw new Error('LLM 上游返回空内容');
    // jsonMode 交付校验 + 服务端内部修复(≤2 次,同一扣费内;与 /api/llm/chat 同语义)
    let parsed = lenientParseJSON(content);
    for (let att = 0; parsed === null && att < 2; att++) {
      try {
        const rr = await llmUpstreamRetry('/chat/completions', {
          method: 'POST',
          body: JSON.stringify({ model, messages: [{ role: 'user', content: '以下内容格式损坏,请修复为合法 JSON,只返回修复结果,不要输出任何解释:\n' + String(content).slice(0, 6000) }], temperature: 0, max_tokens: Math.min(+(opt.max_tokens || 4000), 16000), stream: false }),
        }, CONFIG.llmTimeoutMs || 120000);
        if (!rr.ok) break;
        const d2 = parseUpstreamJSON(await rr.text(), 'LLM 修复');
        const c2 = d2.choices && d2.choices[0] && d2.choices[0].message && d2.choices[0].message.content;
        if (!c2) break;
        content = c2;
        parsed = lenientParseJSON(content);
      } catch (_) { break; }
    }
    if (parsed === null) throw new Error('LLM 内容解析失败');
    if (!opStepDelivered(userId, charge.opId, opt.action, step, step === 'main', content)) { const e = new Error('该操作已退款,结果不再交付'); e.httpStatus = 409; throw e; }
    return { parsed, content, charge, model };
  } catch (e) {
    proxyRefund(userId, charge, e.message); // 未交付退费(部分交付保护/幂等由账本判定)
    throw e;
  } finally { execUnlock(lockKey); }
}
/* wf 端点共用:读 state 定位项目/分集;写回与 /api/state PUT 同路径(快照 + rev+1) */
function wfLoadCtx(userId, pid, epid) {
  const cur = readJSON(stateFile(userId), { rev: 0, state: null });
  const tree = cur.state;
  const p = tree && (tree.projects || []).find(x => x.id === pid);
  const ep = p && (p.episodes || []).find(e => e.id === epid);
  return { cur, tree, p, ep };
}
function wfSave(userId, cur, tree) {
  snapshotState(userId, cur);
  const next = (cur.rev || 0) + 1;
  writeJSON(stateFile(userId), { rev: next, state: tree });
  return next;
}
/* 分镜参数兜底(服务端无 storyboard.js UI 默认值;ep.sbConfig 已存在时以其为准) */
function wfSbConfig(tree, ep) {
  const st = (tree && tree.settings) || {};
  const c = Object.assign({
    sbModel: st.defLLM || '', shotCount: 8, sbMode: 'create', sbPlans: 1, sbAutoFix: true, autoOptimize: true,
    batchCamera: '固定镜头', narratorVoice: st.defVoice || '旁白·沉稳男声', batchVideoModel: st.defVideoModel || '', batchStrategy: 'ref',
  }, ep.sbConfig || {});
  ep.sbConfig = c;
  return c;
}

/* ---------- API 路由 ---------- */
const server = http.createServer(async (req, res) => {
  const t0 = Date.now();
  const u = new URL(req.url, 'http://x');
  const pathname = u.pathname;
  // 静态走原始路径:new URL 会把 '//config.json' 解析成主机名,绕过规范化
  const rawPath = req.url.split('?')[0];
  // canonical 静态路径(七轮):一次解码+规范化,媒体 ACL 与 serveStatic 兜底统一以它判定——
  // 封死 /uploads%2F…、/%75ploads/…、/UPLOADS/… 等编码或大小写变体绕过(磁盘访问本身大小写不敏感)
  let canonPath = '';
  try { canonPath = path.posix.normalize(decodeURIComponent(rawPath).replace(/\\/g, '/')); } catch (_) { canonPath = ''; }
  res.on('finish', () => { if (pathname.startsWith('/api/')) logRequest(req, res.statusCode, Date.now() - t0); });

  if (req.method === 'OPTIONS') {
    res.writeHead(204, Object.assign({
      'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type,Authorization',
    }, SEC_HEADERS));
    return res.end();
  }

  // 上传媒体路由(六轮鉴权 / 七轮 canonical 判定):登录 + mediaAllowed ACL(本人目录/队友共享引用/服务端产物);
  // <img>/<video> 标签凭登录时种下的 mv_token cookie 鉴权
  if (!pathname.startsWith('/api/') && (req.method === 'GET' || req.method === 'HEAD')
    && canonPath && canonPath.toLowerCase().startsWith('/uploads/')) {
    const mUser = authUser(req);
    if (!mUser) return fail(res, 401, '登录后才能访问上传文件', 401);
    if (!mediaAllowed(mUser.id, canonPath)) return fail(res, 403, '无权访问该文件', 403);
    const mAbs = path.normalize(path.join(UPLOADS_DIR, canonPath.slice('/uploads/'.length))); // R14:按 UPLOADS_DIR 拼接(MV_UPLOADS_DIR 重定向后按 ROOT 拼必 403)
    if (!mAbs.startsWith(UPLOADS_DIR + path.sep)) return fail(res, 403, 'Forbidden');
    return fs.stat(mAbs, (err, st) => {
      if (err || !st.isFile()) return fail(res, 404, 'Not Found');
      serveFile(res, mAbs, req);
    });
  }

  if (!pathname.startsWith('/api/')) return serveStatic(req, res, rawPath);

  try {
    /* ---- 健康检查(免 token) ---- */
    if (pathname === '/api/health' && req.method === 'GET') {
      const today = new Date().toISOString().slice(0, 10);
      return ok(res, { ok: true, uptime: Math.round((Date.now() - BOOT_TS) / 1000), users: users.length, version: VERSION, errors: errStats[today] || {} });
    }

    /* ---- 认证(免 token) ---- */
    if (pathname === '/api/auth/register' && req.method === 'POST') {
      if (!CONFIG.registerOpen) return fail(res, 403, '注册已关闭,请联系管理员');
      const ip = req.socket.remoteAddress || '-';
      if (registerLimited(ip)) return fail(res, 429, '注册过于频繁,请稍后再试', 429);
      const b = await readJSONBody(req, 16 * 1024); // 分端点上限(七轮)
      const username = String(b.username || '').trim();
      const password = String(b.password || '');
      const phone = String(b.phone || '').trim();
      const accountType = b.accountType === 'company' ? 'company' : 'personal';
      if (username.length < 2 || username.length > 20) return fail(res, 400, '用户名需 2~20 个字符');
      if (password.length < 6) return fail(res, 400, '密码至少 6 位');
      if (users.some(x => x.username.toLowerCase() === username.toLowerCase())) return fail(res, 400, '用户名已存在');
      const salt = crypto.randomBytes(16).toString('hex');
      const user = {
        id: uid('u'), username, phone, accountType,
        salt, hash: hashPassword(password, salt), createdAt: nowStr(),
      };
      users.push(user);
      writeJSON(USERS_FILE, users);
      writeJSON(stateFile(user.id), blankStateFor(user));
      const token = createSession(user.id);
      setSessionCookie(res, token); // 媒体标签鉴权用(<img>/<video> 无法带 Authorization 头)
      return ok(res, { token, user: publicUser(user) });
    }

    if (pathname === '/api/auth/login' && req.method === 'POST') {
      const ip = req.socket.remoteAddress || '-';
      const lockedSec = guardCheck(ip);
      if (lockedSec) return fail(res, 429, `失败次数过多,已锁定,请 ${lockedSec} 秒后再试`, 429);
      const b = await readJSONBody(req, 16 * 1024); // 分端点上限(七轮)
      const user = users.find(x => x.username.toLowerCase() === String(b.username || '').trim().toLowerCase());
      const passOk = user && (() => {
        const h = hashPassword(String(b.password || ''), user.salt);
        const a = Buffer.from(h, 'hex'), c = Buffer.from(user.hash, 'hex');
        return a.length === c.length && crypto.timingSafeEqual(a, c);
      })();
      if (!passOk) {
        const locked = guardFail(ip);
        return fail(res, locked ? 429 : 400, locked ? '失败次数过多,账号已锁定 5 分钟' : '用户名或密码错误', locked ? 429 : 400);
      }
      guardOk(ip);
      const token = createSession(user.id);
      setSessionCookie(res, token); // 媒体标签鉴权用(<img>/<video> 无法带 Authorization 头)
      return ok(res, { token, user: publicUser(user) });
    }

    /* ---- 缩略图/海报帧(列表页只载小图,原图按需) ----
     * GET /api/thumb?src=/uploads/... → 400px 宽缩略图(图片→webp,视频→抽 0.5s 帧 jpg)
     * 懒生成 + 按 路径+mtime 缓存到 uploads/thumbs/;ffmpeg 缺失时 302 回原图
     * 2026-08 六轮:与 /uploads 媒体路由同口径鉴权(登录 + mediaAllowed ACL;cookie/Bearer 均可) */
    if (pathname === '/api/thumb' && req.method === 'GET') {
      const tUser = authUser(req);
      if (!tUser) return fail(res, 401, '登录后才能访问素材缩略图', 401);
      const src = u.searchParams.get('src') || '';
      if (!mediaAllowed(tUser.id, src)) return fail(res, 403, '无权访问该素材', 403);
      const abs = localUploadPath(src, tUser.id);
      if (!abs) return fail(res, 404, '素材不存在');
      const isVideo = /\.(mp4|webm)$/i.test(abs);
      const isImage = /\.(png|jpe?g|webp|gif)$/i.test(abs);
      if (!isVideo && !isImage) return fail(res, 400, '不支持的素材类型');
      const THUMBS_DIR = path.join(UPLOADS_DIR, 'thumbs');
      const mtime = Math.round(fs.statSync(abs).mtimeMs);
      const key = crypto.createHash('sha1').update(abs + mtime).digest('hex').slice(0, 16);
      const ext = isVideo ? '.jpg' : '.webp';
      const outAbs = path.join(THUMBS_DIR, key + ext);
      if (!fs.existsSync(outAbs)) {
        if (!ffmpegOk()) { res.writeHead(302, { Location: src }); return res.end(); } // 无 ffmpeg:回源原图
        fs.mkdirSync(THUMBS_DIR, { recursive: true });
        try {
          const args = isVideo
            ? ['-y', '-ss', '0.5', '-i', abs, '-frames:v', '1', '-vf', 'scale=400:-2', '-q:v', '4', outAbs]
            : ['-y', '-i', abs, '-vf', "scale='min(400,iw)':-2", '-q:v', '4', outAbs];
          await runFF(FFMPEG_BIN, args, 60000);
        } catch (e) {
          res.writeHead(302, { Location: src }); return res.end(); // 生成失败:回源原图,不阻断列表
        }
      }
      const body = fs.readFileSync(outAbs);
      res.writeHead(200, Object.assign({
        'Content-Type': isVideo ? 'image/jpeg' : 'image/webp',
        'Content-Length': body.length,
        'Cache-Control': 'public, max-age=31536000, immutable', // key 含 mtime,内容变即换 key
      }, SEC_HEADERS));
      return res.end(body);
    }

    /* ---- 以下全部需要 token ---- */
    const user = authUser(req);
    if (!user) return fail(res, 401, '未登录或登录已过期', 401);

    if (pathname === '/api/auth/me' && req.method === 'GET') return ok(res, { user: publicUser(user) });

    if (pathname === '/api/auth/logout' && req.method === 'POST') {
      const h = req.headers.authorization || '';
      const token = h.startsWith('Bearer ') ? h.slice(7) : '';
      sessions.delete(token);
      const ck = String(req.headers.cookie || '').match(/(?:^|;\s*)mv_token=([^\s;]+)/); // R14:纯 cookie 会话场景一并吊销(此前 sessions.delete('') 空操作,共用机器上已复制的 cookie token 登出后仍可用)
      if (ck) sessions.delete(ck[1]);
      flushSessions();
      clearSessionCookie(res); // 登出清媒体会话 cookie(共用机器上的媒体访问随之失效)
      return ok(res, { loggedOut: true });
    }

    if (pathname === '/api/auth/password' && req.method === 'POST') {
      const b = await readJSONBody(req, 16 * 1024); // 分端点上限(七轮)
      const oldH = hashPassword(String(b.oldPassword || ''), user.salt);
      const a = Buffer.from(oldH, 'hex'), c = Buffer.from(user.hash, 'hex');
      if (a.length !== c.length || !crypto.timingSafeEqual(a, c)) return fail(res, 400, '原密码不正确');
      const np = String(b.newPassword || '');
      if (np.length < 6) return fail(res, 400, '新密码至少 6 位');
      user.salt = crypto.randomBytes(16).toString('hex');
      user.hash = hashPassword(np, user.salt);
      writeJSON(USERS_FILE, users);
      // 改密后吊销该用户除当前 token 外的所有会话(并落盘)
      const h = req.headers.authorization || '';
      const curToken = h.startsWith('Bearer ') ? h.slice(7) : '';
      for (const [t, s] of sessions) if (s.userId === user.id && t !== curToken) sessions.delete(t);
      flushSessions();
      return ok(res, { changed: true });
    }

    if (pathname === '/api/state' && req.method === 'GET') {
      const s = readJSON(stateFile(user.id), { rev: 0, state: null });
      if (s.state && s.state.users) {
        const u = s.state.users.find(x => x.id === user.id);
        if (u) u.credits = readWallet(user.id).balance; // 余额以钱包账本为准(投影可能滞后)
      }
      return ok(res, { rev: s.rev || 0, state: s.state || null });
    }

    if (pathname === '/api/state' && req.method === 'PUT') {
      const b = await readJSONBody(req, 64 * 1024 * 1024); // 分端点上限(七轮):全量 state/项目桶推送 64MB(大对象走 IDB 标记,不在此)
      const cur = readJSON(stateFile(user.id), { rev: 0, state: null });
      const clientRev = +(b.rev || 0);
      if ((cur.rev || 0) !== clientRev) {
        return fail(res, 409, '数据版本冲突(rev 不匹配),请重新拉取最新数据', 409);
      }
      // 增量合并(前端按桶推送变化):meta 桶整组替换;projects 按 id 覆盖/删除;旧版全量 state 覆盖仍兼容
      if (b.changes && typeof b.changes === 'object') {
        if (!cur.state) return fail(res, 400, '服务端无基线数据,请全量推送', 400);
        snapshotState(user.id, cur); // 快照旧版本
        const tree = cur.state;
        // 计费/会话键服务端权威:先留存,合并后回填(客户端 meta 整组替换不可覆盖/删除它们)
        const billingSnapshot = {};
        for (const k of BILLING_KEYS) if (tree[k] !== undefined) billingSnapshot[k] = JSON.parse(JSON.stringify(tree[k]));
        if (b.changes.meta && typeof b.changes.meta === 'object') {
          for (const k in tree) if (k !== 'projects') delete tree[k];
          Object.assign(tree, b.changes.meta);
        }
        if (b.changes.projects && typeof b.changes.projects === 'object') {
          tree.projects = tree.projects || [];
          for (const pid in b.changes.projects) {
            const i = tree.projects.findIndex(x => x.id === pid);
            if (i >= 0) tree.projects[i] = b.changes.projects[pid]; else tree.projects.push(b.changes.projects[pid]);
          }
        }
        if (Array.isArray(b.changes.deletedProjects) && b.changes.deletedProjects.length) {
          const del = new Set(b.changes.deletedProjects);
          tree.projects = (tree.projects || []).filter(x => !del.has(x.id));
        }
        for (const k of BILLING_KEYS) { if (billingSnapshot[k] !== undefined) tree[k] = billingSnapshot[k]; else delete tree[k]; }
        if (tree.users) { const u = tree.users.find(x => x.id === user.id); if (u) u.credits = readWallet(user.id).balance; } // 余额以账本为准
        const next = (cur.rev || 0) + 1;
        writeJSON(stateFile(user.id), { rev: next, state: tree });
        return ok(res, { rev: next });
      }
      if (!b.state || typeof b.state !== 'object') return fail(res, 400, 'state 不能为空');
      snapshotState(user.id, cur); // 快照旧版本
      shieldBilling(b.state, cur, user.id); // 计费/会话键服务端权威:剥离客户端值,回填服务端当前值(余额取账本)
      const next = (cur.rev || 0) + 1;
      writeJSON(stateFile(user.id), { rev: next, state: b.state });
      return ok(res, { rev: next });
    }

    if (pathname === '/api/state/history' && req.method === 'GET') {
      const dir = historyDir(user.id);
      let list = [];
      try {
        list = fs.readdirSync(dir).filter(f => /^\d+\.json$/.test(f)).map(f => {
          const st = fs.statSync(path.join(dir, f));
          const meta = readJSON(path.join(dir, f), {});
          return { rev: parseInt(f), time: meta.savedAt || st.mtime.toISOString(), size: st.size };
        }).sort((a, b) => b.rev - a.rev);
      } catch (_) {}
      return ok(res, list);
    }

    if (pathname === '/api/state/restore' && req.method === 'POST') {
      const b = await readJSONBody(req, 4096); // 分端点上限(七轮):仅提交快照 rev
      const rev = +(b.rev || 0);
      const snap = readJSON(path.join(historyDir(user.id), rev + '.json'), null);
      if (!snap || snap.state == null) return fail(res, 404, '快照不存在:rev ' + rev);
      const cur = readJSON(stateFile(user.id), { rev: 0, state: null });
      snapshotState(user.id, cur); // 恢复前也留一份当前快照
      shieldBilling(snap.state, cur, user.id); // 计费/会话键不随快照回滚(高余额快照→消费→恢复刷积分被封死;余额取账本)
      const next = (cur.rev || 0) + 1;
      writeJSON(stateFile(user.id), { rev: next, state: snap.state });
      return ok(res, { rev: next, restoredFrom: rev });
    }

    /* ---- 计费动作白名单:前端 COST 同步源(价格唯一权威在服务端,客户端不可提交价格) ---- */
    if (pathname === '/api/billing/actions' && req.method === 'GET') {
      const costs = {};
      for (const k in COST_PROJECTION) costs[k] = BILLING_ACTIONS[COST_PROJECTION[k]];
      return ok(res, { actions: BILLING_ACTIONS, costs });
    }

    /* ---- 退款(六轮重写 / 七轮交付权限):只认 operationId,金额由服务端按原账本判定 ----
     * 客户端提交的 cost/reason 不参与金额计算;仅可退"未交付"的 operation(charged/refunded 前的有效扣费),
     * 已 delivered(成功交付)的 operation 拒绝退款——正常消费不可由客户端主动刷回;
     * 服务端内部退款(上游失败/超时)不受此限(只在未交付路径触发)。
     * 无登记的 operation(本地计费/复用未扣/六轮前旧账单)返回 refunded:0,前端本地视图照常 */
    if (pathname === '/api/billing/refund' && req.method === 'POST') {
      const b = await readJSONBody(req, 4096);
      const opId = sanitizeOpId(b.operationId) || sanitizeOpId(String(b.idem || '').replace(/_rf$/, ''));
      if (!opId) return fail(res, 400, '退款需提供 operationId(金额由服务端按原账本判定,不接受客户端提交金额)', 400);
      const refAction = sanitizeOpId(b.billingAction) || null; // R14:可选动作维度——携带时按 (opId,action) 归集,跨端点同 opId 不误退
      sweepStaleOps(true); // 十二轮:先清扫 executing 崩溃残留(无活动 job 且超 30 分钟 → 服务端自动退款/转终态);客户端请求即人工干预,跳过 claimRetries 延迟窗口立即清算
      const odb = opsDB();
      const ops = odb.list.filter(o => o.userId === user.id && o.opId === opId && (!refAction || o.action === refAction));
      /* 十轮:客户端退款授权失败关闭——operation 登记缺失(operations.json 损坏/超保留期被淘汰)时
       * 一律 refunded:0,不再继续扫钱包扣费(此前 ownerOf 落空后已交付扣费可被退回;内部退款同口径) */
      if (!ops.length) {
        return ok(res, { refunded: 0, balance: readWallet(user.id).balance, deduped: true, noRecord: true });
      }
      /* 十一轮 P0-2(十二轮收紧):executing 一律拒绝客户端退款——"发起生成→立即退款→等原请求返回
       * 结果"的套利窗口(退款后原请求完成仍会交付);崩溃残留已由上方 sweepStaleOps 服务端清算,
       * 不再按时间放行客户端在途退款(FFmpeg 等合法长任务可超任意时限,按时间放行必有竞态) */
      const latest = opFind(odb, user.id, opId, null);
      if (latest && BILLING.clientRefundBlocked(latest)) {
        return fail(res, 409, '该操作正在执行中,请等待完成后按结果处理(成功不可退,失败/崩溃残留由服务端自动退费)', 409);
      }
      /* 九轮:客户端退款须逐条"确无可退"才拒——已 delivered,或聚合 operation 已有任何成功步骤
       * (辅助步成功=已消耗上游服务)都视为已交付,不可客户端退款;服务端内部失败退款不受此限 */
      const hasOkStep = o => o.steps && Object.values(o.steps).some(st => st && st.ok);
      if (ops.length && !ops.some(o => o.status !== 'delivered' && !hasOkStep(o))) {
        return fail(res, 403, '该操作已成功交付(或已有成功调用),不可退款(失败路径的服务端退款已自动完成)', 403);
      }
      const refunded = refundOperation(user.id, opId, b.reason || '客户端发起退费', true, refAction);
      // 八轮:退款即取消关联在途任务(封死"前端超时本地退款后,上游晚成功又把视频发回来"的免费窗口;
      // cancelled 为退款终态,轮询端点不再查上游、不再交付)
      if (refunded > 0) {
        const jdb = jobsDB();
        let dirty = false;
        jdb.list.forEach(j => {
          // 十一轮:needs_reconcile 同属未终态在途——退款即取消,防对账晚到把结果交付给已退款用户
          if (j.billingOperationId === opId && (!refAction || j.billingAction === refAction) && (j.status === 'running' || j.status === 'needs_reconcile')) { j.status = 'cancelled'; j.updatedAt = Date.now(); dirty = true; }
        });
        if (dirty) saveJobs(jdb);
      }
      return ok(res, { refunded, balance: readWallet(user.id).balance, deduped: refunded === 0 });
    }

    /* ---- operation 结果领取(十三轮):结果日志的主动恢复入口 ----
     * 生图/TTS/FFmpeg 交付成功即落结果日志;同 opId 重试在 proxyCharge 内自动恢复(recovered:true),
     * 本端点供客户端按 operationId 主动领取(标记 claimed,幂等——重复领取返回同一结果)。 */
    if (pathname.startsWith('/api/operations/') && pathname.endsWith('/result') && req.method === 'GET') {
      let opId = '';
      try { opId = sanitizeOpId(decodeURIComponent(pathname.slice('/api/operations/'.length, -'/result'.length))); } catch (_) { return fail(res, 400, '非法 operationId 编码', 400); } // R14:畸形 % 编码转 400 而非 500
      if (!opId) return fail(res, 400, '缺少 operationId', 400);
      const rec = resultFind(user.id, opId);
      if (!rec) return ok(res, { found: false });
      resultMarkClaimed(user.id, opId);
      return ok(res, { found: true, action: rec.action, endpoint: rec.endpoint, payload: rec.payload, savedAt: rec.savedAt, claimed: true });
    }
    /* ---- 项目版本对比(跨设备协作:客户端本地 ver vs 服务端 ver) ----
     * GET /api/projects/:id/compare?ver=<client__ver>[&since=<lastUpdateTs>]
     * 返回:{serverVer, match, updatedAt, epidUpdates:[{epid, ver}]} match=true 版本一致,match=false 冲突或服务端更新
     * 客户端拿到 match=false 后再自行拉 /api/state 合并,或 POST /state/restore 回滚 */
    if (pathname.startsWith('/api/projects/') && pathname.endsWith('/compare') && req.method === 'GET') {
      let pid;
      try { pid = decodeURIComponent(pathname.slice('/api/projects/'.length, -'/compare'.length)); } catch (_) { return fail(res, 400, '非法 projectId 编码', 400); }
      if (!pid) return fail(res, 400, '缺少 projectId', 400);
      const cur = readJSON(stateFile(user.id), { rev: 0, state: null });
      const p = (cur.state && cur.state.projects || []).find(x => x.id === pid);
      if (!p) return fail(res, 404, '项目不存在', 404);
      const clientVer = +((u.searchParams && u.searchParams.get('ver')) || 0);
      const serverVer = +(p.__ver || 0);
      const epidUpdates = (p.episodes || []).map(ep => ({ id: ep.id, ver: +(ep.__ver || 0), title: ep.title || null }));
      return ok(res, {
        serverVer, clientVer, match: clientVer === serverVer,
        rev: cur.rev || 0,
        updatedAt: p.__lastSaved || null,
        epidUpdates,
        digest: (p.releases && p.releases.length) ? p.releases[p.releases.length - 1].digest : null,
      });
    }
    /* ---- 多项目增量更新(跨设备协作长轮询) ----
     * GET /api/projects/updates?since=<msTimestamp>&limit=20
     * 返回:{updates:[{pid, ver, updatedAt, epidUpdates}], serverTime} —— 只返回 since 之后有变动的项目 */
    if (pathname === '/api/projects/updates' && req.method === 'GET') {
      const since = +((u.searchParams && u.searchParams.get('since')) || 0);
      const limit = Math.min(100, +((u.searchParams && u.searchParams.get('limit')) || 20));
      const cur = readJSON(stateFile(user.id), { rev: 0, state: null });
      const list = (cur.state && cur.state.projects || []).filter(p => +(p.__lastSaved || 0) > since)
        .map(p => ({
          id: p.id, name: p.name,
          ver: +(p.__ver || 0),
          updatedAt: p.__lastSaved || null,
          epidUpdates: (p.episodes || []).map(ep => ({ id: ep.id, ver: +(ep.__ver || 0) })),
        })).slice(0, limit);
      return ok(res, { updates: list, serverTime: Date.now(), rev: cur.rev || 0 });
    }
    /* ---- 钱包账本:余额 + 最近 100 条流水(审计/对账只读视图) ---- */
    if (pathname === '/api/wallet' && req.method === 'GET') {
      const w = readWallet(user.id);
      return ok(res, { balance: w.balance, entries: w.entries.slice(-100).reverse() });
    }

    /* ---- 项目维度成本聚合:operation 台账(projectId 在扣费登记时落标)按 (opId,action) 取最新记录
     * 汇总——金额取动作白名单价(服务端权威);refunded 终态记退回,净消耗=charged-refunded;
     * 未标 projectId 的调用(百宝箱工具/旧数据)归 unlabeled,不摊进任何项目 */
    if (pathname === '/api/billing/usage' && req.method === 'GET') {
      const odb = opsDB();
      const latest = {};
      odb.list.forEach(o => {
        if (o.userId !== user.id) return;
        const k = o.opId + '|' + o.action;
        if (!latest[k] || (o.createdAt || 0) >= (latest[k].createdAt || 0)) latest[k] = o;
      });
      const mkBucket = () => ({ count: 0, charged: 0, refunded: 0, families: {} });
      const projects = {}, unlabeled = mkBucket();
      for (const k in latest) {
        const o = latest[k];
        const price = BILLING_ACTIONS[o.action] || 0;
        const b = o.projectId ? (projects[o.projectId] = projects[o.projectId] || mkBucket()) : unlabeled;
        const fam = String(o.action || '').split('.')[0];
        const fb = b.families[fam] = b.families[fam] || { count: 0, charged: 0, refunded: 0 };
        for (const s of [b, fb]) { s.count++; s.charged += price; if (o.status === 'refunded') s.refunded += price; }
      }
      return ok(res, { projects, unlabeled });
    }

    if (pathname === '/api/upload' && req.method === 'POST') {
      const b = await readJSONBody(req, BODY_LIMIT); // 唯一需要大请求体的端点:base64 通道(uploadMaxMB×4/3 ≈ 113MB,其余端点均已收窄)
      const name = String(b.name || 'file').slice(0, 80);
      const b64 = String(b.dataBase64 || '');
      if (!b64) return fail(res, 400, '缺少文件数据');
      const bytes = Math.floor(b64.length * 0.75);
      const fileMax = (CONFIG.uploadMaxMB || 100) * 1024 * 1024;
      if (bytes > fileMax) return fail(res, 413, `单文件不能超过 ${CONFIG.uploadMaxMB || 100}MB`);
      const quota = (CONFIG.uploadQuotaMB ?? 200) * 1024 * 1024;
      if (userUploadBytes(user.id) + bytes > quota) {
        return fail(res, 413, `上传配额已满(每用户 ${CONFIG.uploadQuotaMB ?? 200}MB),请先清理历史文件`, 413);
      }
      const ext = (path.extname(name).toLowerCase().replace(/[^\w.]/g, '') || '').slice(0, 6);
      const ALLOW = ['.png', '.jpg', '.jpeg', '.webp', '.gif', '.mp4', '.webm', '.mp3', '.wav', '.m4a', '.txt', '.json']; // 不允许 svg/html,防存储型 XSS
      if (!ALLOW.includes(ext)) return fail(res, 400, '不支持的文件类型:' + (ext || '无扩展名'));
      const hash = crypto.createHash('sha1').update(name + Date.now() + crypto.randomBytes(6)).digest('hex').slice(0, 16);
      const dir = path.join(UPLOADS_DIR, user.id);
      fs.mkdirSync(dir, { recursive: true });
      /* R19:tmp+rename 原子落盘(媒体路由不会读到写了一半的文件);
       * 配额检查→落盘串行化(每用户锁):并发上传同过配额检查的 TOCTOU 超配就此封死 */
      const upLock = 'upload:' + user.id;
      if (!execLock(upLock)) return fail(res, 409, '有上传正在进行,请稍后重试', 409);
      try {
        const quota2 = (CONFIG.uploadQuotaMB ?? 200) * 1024 * 1024;
        if (userUploadBytes(user.id) + bytes > quota2) {
          return fail(res, 413, `上传配额已满(每用户 ${CONFIG.uploadQuotaMB ?? 200}MB),请先清理历史文件`, 413);
        }
        // 崩溃残留的 tmp_ 顺带清理(1 小时前的必为残留——持锁期间正常写入秒级完成)
        try {
          for (const f of fs.readdirSync(dir)) {
            if (!f.startsWith('tmp_')) continue;
            try { if (Date.now() - fs.statSync(path.join(dir, f)).mtimeMs > 3600 * 1000) fs.unlinkSync(path.join(dir, f)); } catch (_) {}
          }
        } catch (_) {}
        const file = path.join(dir, hash + ext);
        const tmp = path.join(dir, 'tmp_' + crypto.randomBytes(8).toString('hex'));
        fs.writeFileSync(tmp, Buffer.from(b64, 'base64'));
        fs.renameSync(tmp, file);
        return ok(res, { url: `/uploads/${user.id}/${hash}${ext}` });
      } finally { execUnlock(upLock); }
    }

    if (pathname === '/api/uploads' && req.method === 'GET') {
      const dir = path.join(UPLOADS_DIR, user.id);
      let files = [];
      try {
        files = fs.readdirSync(dir).filter(f => !f.startsWith('tmp_')).map(f => {
          const st = fs.statSync(path.join(dir, f));
          return { name: f, url: `/uploads/${user.id}/${f}`, size: st.size, mtime: st.mtime.toISOString() };
        }).sort((a, b) => b.mtime.localeCompare(a.mtime));
      } catch (_) {}
      return ok(res, { files, usedBytes: userUploadBytes(user.id), quotaMB: CONFIG.uploadQuotaMB ?? 200 });
    }

    if (pathname.startsWith('/api/uploads/') && req.method === 'DELETE') {
      let fname = '';
      try { fname = decodeURIComponent(pathname.slice('/api/uploads/'.length)); } catch (_) { return fail(res, 400, '非法文件名编码', 400); } // R14:畸形 % 编码转 400 而非 500
      if (!fname || fname.includes('/') || fname.includes('\\') || fname.includes('..')) {
        return fail(res, 403, '非法文件名', 403);
      }
      const abs = path.normalize(path.join(UPLOADS_DIR, user.id, fname));
      if (!abs.startsWith(path.join(UPLOADS_DIR, user.id))) return fail(res, 403, 'Forbidden', 403);
      if (!fs.existsSync(abs)) return fail(res, 404, '文件不存在');
      // 引用检查(七轮):删除前扫描本人 state,仍被主体/分镜/素材库/审核记录引用时返回 409+引用清单;
      // ?force=1 强制删除(由用户在前端确认,引用处后续按"媒体缺失"处理)
      if (u.searchParams.get('force') !== '1') {
        const refs = findFileRefs(user.id, '/uploads/' + user.id + '/' + fname);
        if (refs.length) return fail(res, 409, '文件仍被以下位置引用:' + refs.join(';'), 409);
      }
      fs.unlinkSync(abs);
      return ok(res, { deleted: fname });
    }

    if (pathname === '/api/llm/usage' && req.method === 'GET') {
      return ok(res, aggregateUsage(user.id));
    }

    if (pathname === '/api/llm/models' && req.method === 'GET') {
      if (!CONFIG.apiKey) return fail(res, 503, '服务端未配置 LLM key,请创建 config.json 并填入 apiKey(或设置环境变量 LLM_API_KEY)', 503);
      if (modelsCache.data && Date.now() - modelsCache.time < MODELS_CACHE_TTL) return ok(res, modelsCache.data);
      const r = await llmUpstreamRetry('/models', null, 30000);
      if (!r.ok) {
        // 上游无 /models(如 Agent/Coding Plan 端点):用配置的模型链合成列表,保证前端下拉可用
        if (CONFIG.llmModel) {
          const chain = [CONFIG.llmModel].concat(CONFIG.llmModelFallbacks || []);
          const syn = { object: 'list', data: chain.map((m, i) => ({ id: m, object: 'model', name: m + (i === 0 ? '(主用)' : '(备用' + i + ')') })) };
          modelsCache = { time: Date.now(), data: syn };
          return ok(res, syn);
        }
        return fail(res, r.status === 401 ? 502 : r.status, '上游模型列表获取失败(' + r.status + ')', r.status);
      }
      const data = await r.json();
      modelsCache = { time: Date.now(), data };
      return ok(res, data);
    }

    if (pathname === '/api/llm/chat' && req.method === 'POST') {
      if (!CONFIG.apiKey) return fail(res, 503, '服务端未配置 LLM key,请创建 config.json 并填入 apiKey(或设置环境变量 LLM_API_KEY)', 503);
      if (!rateLimitOk(user.id)) return fail(res, 429, '请求过于频繁,请稍候', 429);
      try {
        const b = await readJSONBody(req, 2 * 1024 * 1024); // 分端点上限(七轮):LLM 消息体 2MB(默认 120MB 会放大内存攻击面)
        if (!Array.isArray(b.messages) || !b.messages.length) return fail(res, 400, 'messages 不能为空');
        // 统一服务端白名单计费(九轮:llm.* 同族内业务用途无法从消息体结构区分——族内全部放行,
        // 价格上界=白名单价,标签由客户端声明,为已知残留;operation/步骤状态机;上游失败自动退费)
        const llmAction = billAction(res, 'llm', b, 'llm.chat', BILLING.llmAllowedActions(BILLING_ACTIONS));
        if (!llmAction) return; // 400 已返回(动作族不符)
        // 测试 mock:MOCK_LLM=1(或 config.mockLlm)时不调上游也不扣费,但放在动作校验之后——
        // e2e 仍覆盖计费动作兼容矩阵(九轮:此前 mock 在校验前返回,八轮 400 回归测不出来)
        if (process.env.MOCK_LLM === '1' || CONFIG.mockLlm) {
          const txt = JSON.stringify(b.messages);
          const out = /拆分|分镜|JSON 数组/.test(txt)
            ? [
                { plot: '钩子开场:女主被当众羞辱', camera: '固定镜头', characters: [], scene: '', props: [], narration: '', dialogue: '你们会后悔的。', prompt: '漫剧风格,宴会厅,女主被嘲讽,冷色调', duration: 5 },
                { plot: '女主转身离开暗下决心', camera: '推镜头', characters: [], scene: '', props: [], narration: '', dialogue: '', prompt: '漫剧风格,女主转身离开,背影坚定', duration: 5 },
              ]
            : { reply: 'mock 回复', thinking: 'mock', ops: [] };
          return ok(res, { id: 'mock', model: 'mock-llm', choices: [{ index: 0, message: { role: 'assistant', content: JSON.stringify(out) } }], usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 } });
        }
        const charge = proxyCharge(res, user.id, llmAction, 'LLM(' + llmAction + ')', b.operationId, 'llm/chat', b, { stepBudget: 8 });
        if (!charge) return; // 402/409 已返回
        /* 十轮:已成功步骤的重放恢复——直接返回缓存响应,不再调用上游(真正幂等;网络重试场景
         * 客户端没收到首轮响应时由此拿回结果)。缓存响应是原文文本,按 raw 语义原样回传 */
        if (charge.cachedResp != null) {
          const cached = charge.cachedResp;
          const parsed = b.jsonMode ? lenientParseJSON(cached) : undefined;
          if (b.jsonMode && parsed === null) return fail(res, 409, '该步骤缓存结果解析失败,请使用新的任务', 409);
          res.writeHead(200, Object.assign({ 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }, SEC_HEADERS));
          return res.end(JSON.stringify({
            code: 0,
            data: { id: 'cached', model: 'cache', choices: [{ index: 0, message: { role: 'assistant', content: cached } }], usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 }, cached: true },
            parsed: b.jsonMode ? parsed : undefined,
          }));
        }
        /* 十一轮 P0-2/P0-4:标记 executing(客户端在途退款被拒)+ 并发锁——同 (opId,action,step)
         * 的并发请求在首个执行期间 409,不再"一次扣费多次调上游"(此前并发走 replay-exec 直通) */
        const llmStep = sanitizeOpId(b.step) || 'main';
        const lockKey = 'llm:' + user.id + ':' + charge.opId + ':' + llmAction + ':' + llmStep;
        if (!execLock(lockKey)) return fail(res, 409, '该操作正在执行中,请勿并发重复提交(稍后重试可恢复结果)', 409);
        try {
        opMarkExecuting(user.id, charge.opId, llmAction);
        const llmFailRefund = (code, msg, status) => {
          proxyRefund(user.id, charge, msg);
          return fail(res, code, msg, status);
        };
        // llmModel 配置后强制覆盖(如 Agent/Coding Plan 路由模型);llmModelFallbacks 为依次备用的模型链
        const models = CONFIG.llmModel ? [CONFIG.llmModel].concat(CONFIG.llmModelFallbacks || []) : [b.model || 'qwen-turbo'];
        let r, model;
        for (const m of models) {
          model = m;
          try {
            r = await llmUpstreamRetry('/chat/completions', {
              method: 'POST',
              body: JSON.stringify({
                model: m,
                messages: b.messages,
                temperature: typeof b.temperature === 'number' ? b.temperature : 0.7,
                max_tokens: Math.min(+(b.max_tokens || 4000), 16000),
                stream: false,
              }),
            }, CONFIG.llmTimeoutMs || 120000);
          } catch (e) {
            if (e.name === 'AbortError') return llmFailRefund(504, `LLM 请求超时(${Math.round((CONFIG.llmTimeoutMs || 120000) / 1000)}s,含重试)`, 504);
            return llmFailRefund(502, '无法连接 LLM 上游服务,请检查网络(已自动重试 2 次)', 502);
          }
          if (r.ok) break; // 成功即止;失败则换备用模型再试(套餐内多模型互备)
        }
        const text = await r.text();
        if (!r.ok) {
          trackErr('llm');
          let detail = '';
          try { const j = JSON.parse(text); detail = (j.error && (j.error.message || j.error.code)) || ''; } catch (_) {}
          const msg = r.status === 401 ? 'LLM Key 无效(上游 401),请检查服务端 config.json'
            : r.status === 429 ? '上游限流或额度不足(429,已自动重试)'
            : r.status >= 500 ? 'LLM 服务端错误(' + r.status + ',已自动重试)'
            : 'LLM 请求失败(' + r.status + ')';
          const tried = models.length > 1 ? '[已尝试模型链 ' + models.join(' → ') + '] ' : '';
          return llmFailRefund(r.status === 401 ? 502 : r.status, tried + msg + (detail ? ':' + String(detail).slice(0, 120) : ''), r.status);
        }
        let data;
        try { data = parseUpstreamJSON(text, 'LLM'); }
        catch (e) { return llmFailRefund(502, e.message, 502); } // 上游 200 但内容异常:未交付,退费
        recordUsage(user.id, model, data.usage); // 逐用户计量
        let content = data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content;
        if (!content) return llmFailRefund(502, 'LLM 上游返回空内容', 502); // 与前端"内容为空"同语义:未交付退费(消息避开客户端重试正则)
        /* jsonMode 交付校验 + 服务端内部修复(九轮):前端 chatJSON/chatJSONRobust 声明期望 JSON——
         * 解析失败时服务端自行让模型修复自己的输出(≤2 次,同一扣费内),修复成功即交付并回传 parsed;
         * 仍失败则未交付退费 + 502(消息避开客户端 /JSON|内容为空/ 重试正则,直接走调用方回退/退款路径)。
         * 由此客户端不再需要修复重试(直连模式仍保留本地兜底),delivered 后的步骤重放窗口彻底消失。 */
        let parsed;
        if (b.jsonMode) {
          parsed = lenientParseJSON(content);
          for (let att = 0; parsed === null && att < 2; att++) {
            try {
              const rr = await llmUpstreamRetry('/chat/completions', {
                method: 'POST',
                body: JSON.stringify({
                  model,
                  messages: [{ role: 'user', content: '以下内容格式损坏,请修复为合法 JSON,只返回修复结果,不要输出任何解释:\n' + String(content).slice(0, 6000) }],
                  temperature: 0,
                  max_tokens: Math.min(+(b.max_tokens || 4000), 16000),
                  stream: false,
                }),
              }, CONFIG.llmTimeoutMs || 120000);
              if (!rr.ok) break;
              const t2 = await rr.text();
              const d2 = parseUpstreamJSON(t2, 'LLM 修复');
              const c2 = d2.choices && d2.choices[0] && d2.choices[0].message && d2.choices[0].message.content;
              if (!c2) break;
              content = c2;
              data = d2; // 响应体对齐修复后内容(前端 raw 兜底与 parsed 一致)
              parsed = lenientParseJSON(content);
            } catch (_) { break; }
          }
          if (parsed === null) {
            proxyRefund(user.id, charge, '业务 JSON 解析失败');
            return fail(res, 502, 'LLM 内容解析失败(已自动退费)', 502);
          }
        }
        /* 步骤交付(十一轮):main 步(客户端未声明 step)成功 → operation delivered(拒绝后续新步骤);
         * 辅助步(und/gen/rev/route/cmp,客户端显式声明)成功 → 仅标记该步 ok(聚合流程可继续),
         * 但"已有成功调用"同样阻断退款;响应文本缓存到步骤(≤8KB)供同内容重放恢复 */
        const step = sanitizeOpId(b.step) || 'main';
        /* 十二轮交付守卫:已退款的 operation 不再回传 LLM 响应内容(退款+白拿成品竞态) */
        if (!opStepDelivered(user.id, charge.opId, llmAction, step, step === 'main', content)) return fail(res, 409, '该操作已退款,结果不再交付', 409);
        res.writeHead(200, Object.assign({ 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }, SEC_HEADERS));
        return res.end(JSON.stringify(b.jsonMode ? { code: 0, data, parsed } : { code: 0, data }));
        } finally { execUnlock(lockKey); } // 十一轮并发锁:请求结束(成功/失败/异常)统一释放
      } finally {
        rateLimitDone(user.id);
      }
    }

    /* ---- 火山引擎(ARK)生图/生视频代理 ---- */
    if (pathname === '/api/volc/image' && req.method === 'POST') {
      if (!CONFIG.volcApiKey) return fail(res, 503, '服务端未配置火山引擎 key,请在 config.json 填入 volcApiKey(或设置环境变量 VOLC_API_KEY)', 503);
      if (!rateLimitOk(user.id)) return fail(res, 429, '请求过于频繁,请稍候', 429);
      let charge = null; // 声明在 try 外:catch 统一退费引用安全(读 body 失败时为 null 不退)
      try {
        const b = await readJSONBody(req, 64 * 1024 * 1024); // 分端点上限(七轮):图生图/多视角可携带 dataURL 参考图
        const prompt = String(b.prompt || '').trim();
        if (!prompt) return fail(res, 400, 'prompt 不能为空');
        /* 服务端按次原子扣费(十一轮:价格由请求结构+prompt 信号决定——多图融合/宫格/高清化/局部重绘/
         * 超写实/多视角各定死对应动作,客户端标签不再参与定价;未交付自动退费含未捕获异常统一走 catch) */
        const dImg = BILLING.deriveImageAction(b);
        const action = billAction(res, 'image', b, dImg.derived, dImg.allowedSet);
        if (!action) return; // 400 已返回(结构/信号不符)
        charge = proxyCharge(res, user.id, action, '生图(' + action + '):' + prompt.slice(0, 24), b.operationId, 'volc/image', b);
        if (!charge) return; // 402/409 已返回
        /* 十三轮结果恢复:同 opId 同内容重放且日志命中 → 直接带回已付费结果(响应丢失/崩溃后重试) */
        if (charge.recovered) return ok(res, Object.assign({}, charge.recovered, { recovered: true }));
        /* 十一轮 P0-2/P0-4:executing 标记(客户端在途退款被拒)+ 并发锁(同 opId 并发不再复用扣费双开上游) */
        const imgLock = 'img:' + user.id + ':' + charge.opId + ':' + action;
        if (!execLock(imgLock)) return fail(res, 409, '该操作正在执行中,请勿并发重复提交', 409);
        try {
        opMarkExecuting(user.id, charge.opId, action);
        const failRefund = (code, msg, status) => {
          proxyRefund(user.id, charge, msg);
          return fail(res, code, msg, status);
        };
        const payload = {
          model: String(b.model || VOLC_IMAGE_MODEL),
          prompt,
          size: String(b.size || '1024x1024'),
          response_format: 'url',
        };
        if (b.image) { // 可选参考图(i2i):base64 dataURL / 远程 url / 本站 /uploads/ 路径;数组=多图融合(≤6 张)
          const arr = Array.isArray(b.image) ? b.image.slice(0, 6) : [b.image];
          const refs = arr.map(x => inlineRefImage(x, user.id));
          if (refs.some(r => !r)) return failRefund(400, '参考图不存在', 400);
          payload.image = Array.isArray(b.image) ? refs : refs[0];
        }
        let r;
        try {
          r = await volcUpstream('/images/generations', { method: 'POST', body: JSON.stringify(payload) }, CONFIG.volcTimeoutMs || 180000);
        } catch (e) {
          if (e.name === 'AbortError') return failRefund(504, `生图请求超时(${Math.round((CONFIG.volcTimeoutMs || 180000) / 1000)}s)`, 504);
          return failRefund(502, '无法连接火山引擎生图服务,请检查网络', 502);
        }
        const text = await r.text();
        if (!r.ok) return failRefund(r.status === 401 ? 502 : r.status, volcFailMsg(r, text, '生图'), r.status);
        const data = parseUpstreamJSON(text, '生图');
        const remoteUrl = data.data && data.data[0] && data.data[0].url;
        if (!remoteUrl) return failRefund(502, '生图返回内容为空', 502);
        const local = await cacheGenFile(remoteUrl, '.jpeg'); // 临时签名 URL → 本地缓存
        /* 十二轮交付守卫:operation 已被看门狗/对账退款 → 不再把成品发给客户端(退款+白拿成品竞态) */
        if (!opDelivered(user.id, charge.opId, action)) return fail(res, 409, '该操作已退款,结果不再交付', 409);
        resultPut(user.id, charge.opId, action, 'volc/image', { url: local || remoteUrl, remoteUrl }); // 十三轮:结果日志(重放恢复)
        return ok(res, { url: local || remoteUrl, remoteUrl });
        } finally { execUnlock(imgLock); } // 十一轮并发锁统一释放
      } catch (e) {
        // 八轮:未捕获异常统一退费(上游 200 但非 JSON 体/缓存抓存失败等此前会裸抛 500 不退款)
        if (charge) proxyRefund(user.id, charge, e && e.message);
        if (e && e.httpStatus) return fail(res, e.httpStatus, e.message, e.httpStatus);
        return fail(res, 502, '生图处理异常:' + ((e && e.message) || '未知错误'), 502);
      } finally {
        rateLimitDone(user.id);
      }
    }

    if (pathname === '/api/volc/video' && req.method === 'POST') {
      if (!CONFIG.volcApiKey) return fail(res, 503, '服务端未配置火山引擎 key,请在 config.json 填入 volcApiKey(或设置环境变量 VOLC_API_KEY)', 503);
      if (!rateLimitOk(user.id)) return fail(res, 429, '请求过于频繁,请稍候', 429);
      let charge = null; // 声明在 try 外:catch 统一退费引用安全(读 body 失败时为 null 不退)
      try {
        const b = await readJSONBody(req, 64 * 1024 * 1024); // 分端点上限(七轮):首/尾帧、参考音频可为 dataURL 内联
        const prompt = String(b.prompt || '').trim();
        if (!prompt) return fail(res, 400, 'prompt 不能为空');
        const ratio = String(b.ratio || '16:9');
        const model = String(b.model || VOLC_VIDEO_MODEL);
        // 时长约束按模型分档:Seedance 2.0 系列仅 5s/10s 离散档(任意值会被上游 400 拒绝);2.5 起支持 4-30s 连续;
        // config.json 的 volcVideoDurations 可强制覆盖:数组=离散档吸附(如 [5,10]),对象 {min,max}=连续区间
        const rawDur = Math.max(1, Math.min(30, Number.isFinite(+b.duration) && +b.duration > 0 ? +b.duration : 5)); // 非数字/非正值回退默认,防 NaN 进 --duration
        let duration;
        const dc = CONFIG.volcVideoDurations;
        if (Array.isArray(dc) && dc.length) duration = dc.map(Number).filter(isFinite).reduce((best, d) => Math.abs(d - rawDur) < Math.abs(best - rawDur) ? d : best, dc[0]);
        else if (dc && isFinite(+dc.min) && isFinite(+dc.max)) duration = Math.max(+dc.min, Math.min(+dc.max, Math.round(rawDur)));
        else if (/seedance-2-0/.test(model)) duration = Math.abs(rawDur - 5) <= Math.abs(rawDur - 10) ? 5 : 10;
        else duration = Math.max(4, Math.min(30, Math.round(rawDur)));
        // 可选首帧参考图(i2v):base64 dataURL、远程 url 或本站 /uploads/ 本地路径(服务端读盘转 dataURL 透传)
        const content = [{ type: 'text', text: `${prompt} --ratio ${ratio} --duration ${duration}` }];
        if (b.image) {
          const ref = inlineRefImage(b.image, user.id);
          if (!ref) return fail(res, 400, '参考图不存在');
          content.push({ type: 'image_url', image_url: { url: ref }, role: 'first_frame' }); // 首帧(与尾帧/参考组合时上游强制要求 role)
        }
        // 主体参考图(多模态参考,role=reference_image,与 prompt 中的主体定义"图片N=「名字」"对应;≤8 张):
        // 始终随包发送,不再因存在首帧/尾帧而静默丢弃(主体关联是一致性核心);若上游不允许混用,见下方混用重试
        let refSent = 0;
        if (Array.isArray(b.refImages)) {
          for (const ri of b.refImages.slice(0, 8)) {
            const ref = ri && ri.url ? inlineRefImage(ri.url, user.id) : null;
            if (ref) { content.push({ type: 'image_url', image_url: { url: ref }, role: 'reference_image' }); refSent++; }
          }
        }
        // 可选尾帧参考(首尾帧策略):role=last_frame
        if (b.lastFrame) {
          const ref = inlineRefImage(b.lastFrame, user.id);
          if (!ref) return fail(res, 400, '尾帧参考图不存在');
          content.push({ type: 'image_url', image_url: { url: ref }, role: 'last_frame' });
        }
        // 可选参考视频(视频编辑/延展/多段衔接):上游要求公网可访问 URL(role=reference_video);
        // 本站 /uploads/ 本地视频先经临时托管(litterbox 1h / 0x0.st)转公网链接,≤20MB;可在 config.json relayUploadEnabled:false 关闭
        let relayedVideo = false;
        if (b.refVideo) {
          let refUrl = String(b.refVideo);
          if (!refUrl.startsWith('http')) {
            const vp = localUploadPath(refUrl, user.id); // 所有权隔离:只允许本人上传/服务端产物
            if (!vp) return fail(res, 400, '参考视频不存在(需为本站 /uploads/ 路径且属于当前用户)');
            if (fs.statSync(vp).size > 20 * 1024 * 1024) return fail(res, 400, '参考视频超过 20MB,暂不支持');
            if (CONFIG.relayUploadEnabled === false) return fail(res, 400, '参考视频公网中转已在服务端禁用(relayUploadEnabled:false),请改用公网可访问的视频地址');
            try {
              refUrl = await relayPublicUrl(vp);
              relayedVideo = true;
            } catch (e) {
              return fail(res, 502, '参考视频公网托管失败:' + e.message + '(可检查网络或稍后重试)', 502);
            }
          }
          content.push({ type: 'video_url', video_url: { url: refUrl }, role: 'reference_video' });
        }
        // 可选音色参考(角色绑定的音频,role=reference_audio):dataURL 内联透传;
        // 上游限制:音频不能是唯一参考输入,须随首帧/参考图/参考视频一同发送(故放在最后判)
        if (b.refAudio) {
          let au = String(b.refAudio);
          if (!au.startsWith('http') && !au.startsWith('data:')) {
            const ap = localUploadPath(au, user.id); // 所有权隔离
            if (!ap) return fail(res, 400, '参考音频不存在(需为本站 /uploads/ 路径且属于当前用户)');
            const ext = path.extname(ap).slice(1).toLowerCase();
            const mime = { mp3: 'audio/mpeg', wav: 'audio/wav', m4a: 'audio/mp4' }[ext] || 'audio/mpeg';
            au = `data:${mime};base64,` + fs.readFileSync(ap).toString('base64');
          }
          if (content.length > 1 && !(b.image && b.lastFrame)) content.push({ type: 'audio_url', audio_url: { url: au }, role: 'reference_audio' });
          // 跳过条件:无其他参考素材(上游 400),或首尾帧同时存在(reference 不能与首尾帧组合混用)
        }
        // 任务中心:同镜同输入存在进行中任务时直接复用其 upstreamId(幂等,避免重复创建上游任务/重复计费)
        let droppedFrames = false; // 声明前置:复用分支提前 return 也要引用,避免 TDZ
        const inputHash = jobUpstreamHash(b);
        const jdb = jobsDB();
        const active = findActiveJob(jdb, user.id, b.job, inputHash);
        if (active) return ok(res, { id: active.upstreamId, duration, droppedFrames, reused: true });
        // 二十轮:创建中占位检查——同镜同输入已有创建占位(尚未拿到 upstreamId)直接 409,
        // 封死"幂等检查 → 上游创建(最长 120s)→ 登记"窗口内快速双击/双端各建一个上游任务的双开双扣
        if (b.job && b.job.shotId && jdb.list.some(j => j.userId === user.id && j.shotId === b.job.shotId && j.inputHash === inputHash && j.status === 'creating')) {
          return fail(res, 409, '该镜头相同输入的视频任务正在创建中,请稍后重试(将复用原任务,不重复扣费)', 409);
        }
        // 服务端按次原子扣费(九轮:动作推导核心在 billing.js——请求时长>10s 一律 video.beat(长视频按
        // 2 镜计价,封死"长视频提 video.gen 低价"套利);≤10s 允许 gen/beat(节拍板短段落平价属产品定价);
        // operation 状态机绑定请求指纹——同 opId 换提示词/素材重放被拒;复用不扣;交付在轮询 succeeded 时标记)
        const dVid = BILLING.deriveVideoAction(b, rawDur);
        const vAction = billAction(res, 'video', b, dVid.derived, dVid.allowedSet);
        if (!vAction) return; // 400 已返回(动作族不符/时长档不符)
        charge = proxyCharge(res, user.id, vAction, '生视频(' + vAction + '):' + prompt.slice(0, 24), b.operationId, 'volc/video', b);
        if (!charge) return; // 402/409 已返回
        /* 十一轮 P0-2/P0-4:executing 标记 + 并发锁(同 opId 并发不再复用已有扣费后双开上游任务) */
        const vidLock = 'vid:' + user.id + ':' + charge.opId + ':' + vAction;
        if (!execLock(vidLock)) return fail(res, 409, '该操作正在执行中,请勿并发重复提交', 409);
        let placeholder = null; // 外层可见:未捕获异常路径也要撤销占位
        try {
        opMarkExecuting(user.id, charge.opId, vAction);
        // 二十轮:上游调用前先同步登记 creating 占位行(带 shotId+inputHash 唯一约束)——
        // 占位在先,并发请求在上一个请求等待上游期间即被上方 409 拦下;失败路径撤销占位(退费后重试不受阻)
        placeholder = (b.job && b.job.shotId) ? jobRegister(jobsDB(), user.id, '', b.job, inputHash, charge, 'creating') : null;
        const failRefund = (code, msg, status) => {
          if (placeholder) jobRemove(placeholder.id);
          proxyRefund(user.id, charge, msg); // 服务未交付:服务端本次实扣原路退回
          return fail(res, code, msg, status);
        };
        let r;
        try {
          r = await volcUpstream('/contents/generations/tasks', {
            method: 'POST',
            // 参数走 prompt 后缀:--ratio 16:9 --duration 5
            body: JSON.stringify({ model, content }),
          }, 60000);
        } catch (e) {
          if (e.name === 'AbortError') return failRefund(504, '创建视频任务超时(60s)', 504);
          return failRefund(502, '无法连接火山引擎视频服务,请检查网络', 502);
        }
        let text = await r.text();
        // 混用兜底:部分模型不允许首帧/尾帧与主体参考图同包;命中混用类 400 时,以主体关联为准去掉首尾帧自动重试一次
        if (!r.ok && refSent && (b.image || b.lastFrame) && /mix|together|混用|冲突/i.test(text)) {
          const content2 = content.filter(c => c.role !== 'first_frame' && c.role !== 'last_frame');
          try {
            r = await volcUpstream('/contents/generations/tasks', { method: 'POST', body: JSON.stringify({ model, content: content2 }) }, 60000);
            text = await r.text();
            droppedFrames = r.ok;
          } catch (e) {
            if (e.name === 'AbortError') return failRefund(504, '创建视频任务超时(60s)', 504);
            return failRefund(502, '无法连接火山引擎视频服务,请检查网络', 502);
          }
        }
        if (!r.ok) return failRefund(r.status === 401 ? 502 : r.status, volcFailMsg(r, text, '视频任务创建'), r.status);
        const data = parseUpstreamJSON(text, '视频任务创建');
        if (!data.id) return failRefund(502, '视频任务创建失败:未返回任务 id', 502);
        // 二十轮:占位行转正(写入真实 upstreamId/running);占位被意外清除时兜底重新登记。
        // R14 同原则:重读最新快照——上方两次上游 await 期间他请求对 jobs.json 的写入不能被旧快照整体回滚
        if (placeholder) {
          const pdb = jobsDB();
          const row = pdb.list.find(j => j.id === placeholder.id);
          if (row) { row.upstreamId = data.id; row.status = 'running'; row.updatedAt = Date.now(); saveJobs(pdb); }
          else jobRegister(pdb, user.id, data.id, b.job, inputHash, charge);
        } else {
          jobRegister(jobsDB(), user.id, data.id, b.job, inputHash, charge); // 登记到服务端任务中心(断点续查/审计;含计费操作,晚失败可自动退费)
        }
        return ok(res, { id: data.id, duration, droppedFrames, relayedVideo }); // duration=档位吸附后的实际上游时长;droppedFrames=混用兜底已去首尾帧;relayedVideo=参考视频经公网中转
        } finally { execUnlock(vidLock); } // 十一轮并发锁统一释放
      } catch (e) {
        // 八轮:未捕获异常统一退费(创建返回非 JSON 体等此前会裸抛 500 不退款)
        if (placeholder) jobRemove(placeholder.id); // 二十轮:异常路径撤销创建占位(让出幂等位)
        if (charge) proxyRefund(user.id, charge, e && e.message);
        if (e && e.httpStatus) return fail(res, e.httpStatus, e.message, e.httpStatus);
        return fail(res, 502, '视频任务创建异常:' + ((e && e.message) || '未知错误'), 502);
      } finally {
        rateLimitDone(user.id);
      }
    }

    if (pathname.startsWith('/api/volc/video/') && req.method === 'GET') {
      if (!CONFIG.volcApiKey) return fail(res, 503, '服务端未配置火山引擎 key,请在 config.json 填入 volcApiKey(或设置环境变量 VOLC_API_KEY)', 503);
      sweepJobs(); // 超时清扫(七轮):任何轮询都顺带全量清扫过期任务(十一轮:清扫只转 needs_reconcile,退款由对账定)
      reconcileStaleJobs().catch(() => {}); // 十一轮 P1-4:顺带后台对账其它待对账任务(不阻塞本次响应)
      let taskId = '';
      try { taskId = decodeURIComponent(pathname.slice('/api/volc/video/'.length)); } catch (_) { return fail(res, 400, '非法任务 id 编码', 400); } // R14:畸形 % 编码转 400 而非 500
      if (!/^[\w-]+$/.test(taskId)) return fail(res, 400, '非法任务 id');
      // 任务归属校验:仅本人登记的任务可查询;未登记任务一律 404(关闭早期遗留任务的首查认领,封死跨账号任务 id 探测)
      {
        const jdb0 = jobsDB();
        const own = jdb0.list.find(j => j.upstreamId === taskId);
        if (own && own.userId !== user.id) return fail(res, 403, '无权查询该任务', 403);
        if (!own) return fail(res, 404, '任务不存在或未登记', 404);
        // 八轮:退款终态任务(timed_out 超时清扫/cancelled 客户端退款连带取消)不再查上游——
        // 晚到的上游成功不会翻转已退款的 operation,也不把视频发给已拿回积分的请求
        // (统一三套超时语义:前端等待、服务端清扫、上游晚成,退款即终态)
        // 十一轮:timed_out 只在"对账过上游仍无终态"后落定(60 分钟),文案与语义同步;
        // needs_reconcile 不在拦截之列——放行查上游正是它的对账出口
        if (own.status === 'timed_out' || own.status === 'cancelled') {
          return ok(res, {
            status: own.status,
            error: own.status === 'timed_out' ? '任务超时(60 分钟未终态且对账上游无结果,积分已由服务端退回)' : '任务已取消并退款',
          });
        }
        // R14:其余终态(succeeded/failed)直接回本地登记态——不再打上游:上游任务过期(404)后
        // 已交付任务的轮询不应返回上游错误;failed 终态也不重复触发晚失败退款判定(无效 IO)
        if (own.status === 'succeeded') return ok(res, { status: 'succeeded', videoUrl: own.videoUrl || '', remoteUrl: own.remoteUrl || '' });
        if (own.status === 'failed') return ok(res, { status: 'failed', error: own.error || '上游生成失败' });
      }
      let r;
      try {
        r = await volcUpstream('/contents/generations/tasks/' + taskId, null, 30000);
      } catch (e) {
        if (e.name === 'AbortError') return fail(res, 504, '视频任务查询超时(30s)', 504);
        return fail(res, 502, '无法连接火山引擎视频服务,请检查网络', 502);
      }
      const text = await r.text();
      if (!r.ok) return fail(res, r.status === 401 ? 502 : r.status, volcFailMsg(r, text, '视频任务查询'), r.status);
      const data = parseUpstreamJSON(text, '视频任务查询');
      const out = { status: data.status || 'unknown' };
      const remoteUrl = data.content && data.content.video_url;
      if (remoteUrl) {
        out.remoteUrl = remoteUrl;
        // succeeded 后把 mp4 抓存本地,刷新/导出仍可用;失败回退原始 url
        out.videoUrl = data.status === 'succeeded' ? (await cacheGenFile(remoteUrl, '.mp4')) || remoteUrl : remoteUrl;
      }
      if (data.error) out.error = data.error.message || String(data.error.code || data.error);
      // 任务中心:回写终态;可交付结果校验(八轮)——succeeded 且拿到视频地址才算交付并标 operation delivered;
      // succeeded 无地址视同失败退款;已退款任务(j.refunded)禁止晚交付翻转
      if (out.status === 'succeeded') {
        if (!out.videoUrl) {
          // succeeded 但无地址:不可交付,按失败处理并退款(八轮;十一轮 refundJob 校验实退金额)
          out.status = 'failed';
          out.error = '上游 succeeded 但未返回视频地址,已自动退费';
          jobUpdate(jobsDB(), taskId, { status: 'failed', error: out.error });
          refundJob(jobsDB().list.find(x => x.upstreamId === taskId), 'succeeded 无视频地址');
        } else {
          /* 十二轮交付守卫:operation 已退款 → 不回传视频地址,job 转 cancelled 终态
           * (退款+白拿成品竞态;jobUpdate 终态保护下此转换不可再被旧响应翻转) */
          const jdbD0 = jobsDB();
          const jD0 = jdbD0.list.find(x => x.upstreamId === taskId);
          if (jD0 && jD0.billingOperationId && !jD0.refunded
            && !opDelivered(user.id, jD0.billingOperationId, jD0.billingAction)) {
            jobUpdate(jobsDB(), taskId, { status: 'cancelled', error: '该操作已退款,结果不再交付' });
            return ok(res, { status: 'cancelled', error: '该操作已退款,结果不再交付' });
          }
          jobUpdate(jobsDB(), taskId, { status: 'succeeded', videoUrl: out.videoUrl || remoteUrl || '', remoteUrl: remoteUrl || '' });
        }
      }
      else if (out.status === 'failed') {
        jobUpdate(jobsDB(), taskId, { status: 'failed', error: out.error || '' });
        // 晚失败退款闭环:任务登记了计费操作且尚未退款 → 按原账单幂等退回(与客户端退款镜像共用幂等键,防双退)
        refundJob(jobsDB().list.find(x => x.upstreamId === taskId), '视频任务失败(轮询检出)');
      }
      else {
        // 十一轮 P1-4:needs_reconcile(60 分钟未终态)对账后上游仍无终态 → 终极兜底退款
        // (与 reconcileStaleJobs 同口径:此刻上游基本不可能成功;退款即终态,晚到成功不翻转)
        const jdbQ = jobsDB();
        const jQ = jdbQ.list.find(x => x.upstreamId === taskId);
        if (jQ && jQ.status === 'needs_reconcile') {
          jobUpdate(jdbQ, taskId, { status: 'timed_out', error: '任务超时(60 分钟未终态,对账上游无结果)' });
          refundJob(jobsDB().list.find(x => x.upstreamId === taskId), '任务超时(' + Math.round(JOB_FINAL_MS / 60000) + ' 分钟未终态,终极退款)');
          return ok(res, { status: 'timed_out', error: '任务超时(60 分钟未终态且对账上游无结果,积分已由服务端退回)' });
        }
        jobUpdate(jobsDB(), taskId, {});
      }
      return ok(res, out);
    }

    /* ---- 视频任务取消(R19):用户主动中止在途任务——job 转 cancelled 终态 + 按原账单退款。
     * 与客户端退款镜像分离的原因:在途视频 operation 恒为 executing(交付发生在轮询 succeeded),
     * 客户端退款端点对 executing 一律 409(P0-2 套利拦截);取消是服务端内部退款(幂等键同源防双退)。
     * 安全闭环:cancelled 终态后轮询短路不查上游(2238),晚到的上游成功被交付守卫拦下(2283)——
     * 退款与成品不可兼得。幂等:已 cancelled 返回 already;已终态(成功/失败/超时)409 不重复退款。 */
    if (pathname.startsWith('/api/volc/video/') && pathname.endsWith('/cancel') && req.method === 'POST') {
      let taskId = '';
      try { taskId = decodeURIComponent(pathname.slice('/api/volc/video/'.length, -'/cancel'.length)); } catch (_) { return fail(res, 400, '非法任务 id 编码', 400); }
      if (!/^[\w-]+$/.test(taskId)) return fail(res, 400, '非法任务 id');
      const jdb = jobsDB();
      const j = jdb.list.find(x => x.upstreamId === taskId);
      if (!j) return fail(res, 404, '任务不存在或未登记(创建中的任务请稍候再取消)', 404);
      if (j.userId !== user.id) return fail(res, 403, '无权取消该任务', 403);
      if (j.status === 'cancelled') return ok(res, { cancelled: true, already: true, refunded: 0 });
      if (JOB_TERMINAL.has(j.status)) return fail(res, 409, '任务已终态(' + j.status + '),不可取消', 409);
      jobUpdate(jdb, taskId, { status: 'cancelled', error: '用户取消生成' }); // 先落终态:终态保护下并发轮询不得翻转
      refundJob(jobsDB().list.find(x => x.upstreamId === taskId), '用户取消生成'); // 内部退款:退款成功置 refunded(交付守卫依据)
      const jr = jobsDB().list.find(x => x.upstreamId === taskId); // 重读最新快照(refundJob 内部按新快照落 refunded)
      return ok(res, { cancelled: true, refunded: !!(jr && jr.refunded) });
    }

    /* ---- 任务中心:本人最近生成任务(视频断点续查/审计) ---- */
    if (pathname === '/api/jobs' && req.method === 'GET') {
      sweepJobs(); // 超时清扫(七轮):任何查询都顺带全量清扫过期任务(用户不再轮询也不再悬挂)
      sweepStaleOps(); // 十二轮:顺带清扫 executing 崩溃残留(幂等)
      reconcileStaleJobs().catch(() => {}); // 十一轮 P1-4:待对账任务后台查上游再定退款(不阻塞本次响应)
      const db = jobsDB();
      const mine = db.list.filter(j => j.userId === user.id);
      // running/needs_reconcile/timed_out/cancelled 恒置前(稳定排序保持组内时序):历史任务超 100 条时活动/待对账任务不被挤出截断窗口
      const front = s => s === 'running' || s === 'needs_reconcile' || s === 'timed_out' || s === 'cancelled';
      mine.sort((a, b) => (front(a.status) ? 0 : 1) - (front(b.status) ? 0 : 1));
      return ok(res, { list: mine.slice(0, 100) });
    }

    /* ---- FFmpeg 本地视频处理(输入须为本站 /uploads/ 路径;产物存 uploads/gen/) ---- */
    if (pathname.startsWith('/api/ffmpeg/') && req.method === 'POST') {
      const ff = pathname.slice('/api/ffmpeg/'.length);
      // 九轮:未知子路由在限流计数前 404——八轮前置于 rateLimitOk 之后直接 return,不进 finally
      // 的 rateLimitDone,同一用户探 4 次未知路由会把并发计数占满到重启(429 泄漏)
      if (!BILLING.deriveFFAction(ff, null)) return fail(res, 404, '接口不存在', 404);
      if (!ffmpegOk()) return fail(res, 503, '服务端未找到 FFmpeg(bin/ffmpeg.exe 或 FFMPEG_PATH)', 503);
      if (!rateLimitOk(user.id)) return fail(res, 429, '请求过于频繁,请稍候', 429);
      let charge = null; // 声明在 try 外:catch 退费引用安全(读 body 失败时为 null 不退)
      let ffActionUsed = null; // 交付标记用
      try {
        const b = await readJSONBody(req, 8 * 1024 * 1024);
        /* 各子路由的推导计费动作(九轮:推导核心在 billing.js,与单元测试共享)——路由唯一确定;
         * upscale 按 quality 档位细分(pro→ff.hdPro/std→ff.hdStd/缺省→工具级),客户端标签不再参与定价;
         * suberase 十一轮统一 ff.erase(5)——deriveFFAction 钉死单一价,客户端标签不再参与定价) */
        const dFF = BILLING.deriveFFAction(ff, b);
        const ffAction = billAction(res, 'ff', b, dFF.derived, dFF.allowedSet);
        if (!ffAction) return; // 400 已返回(动作族不符/推导不符)
        ffActionUsed = ffAction;
        charge = proxyCharge(res, user.id, ffAction, 'FFmpeg(' + ffAction + ')', b.operationId, 'ffmpeg/' + ff, b);
        if (!charge) return; // 402/409 已返回
        /* 十三轮结果恢复:同 opId 同内容重放且日志命中 → 直接带回已付费处理结果(响应丢失/崩溃后重试) */
        if (charge.recovered) return ok(res, Object.assign({}, charge.recovered, { recovered: true }));
        /* 十一轮 P0-2/P0-4:executing 标记 + 并发锁(同 opId 并发不再复用扣费后重复执行 FFmpeg) */
        const ffLock = 'ff:' + user.id + ':' + charge.opId + ':' + ffAction;
        if (!execLock(ffLock)) return fail(res, 409, '该操作正在执行中,请勿并发重复提交', 409);
        try {
        opMarkExecuting(user.id, charge.opId, ffAction);
        const ffFail = (code, msg, status) => {
          proxyRefund(user.id, charge, msg);
          return fail(res, code, msg, status);
        };
        const ffOk = data => {
          /* 十二轮交付守卫:已退款的 operation 不再回传处理结果(退款+白拿成品竞态) */
          if (!opDelivered(user.id, charge.opId, ffAction)) return fail(res, 409, '该操作已退款,结果不再交付', 409);
          resultPut(user.id, charge.opId, ffAction, 'ffmpeg/' + ff, data); // 十三轮:结果日志(重放恢复;各子路由结果含 url 等字段)
          return ok(res, data);
        };

        /* 关键帧提取:{video,count?} → 按时间轴均匀抽帧 {frames:[url]};
         * 或 {video,times:[秒]} 定点抽帧(拉片按场景段中点取关键帧),与 count 二选一,均 ≤24 帧 */
        if (ff === 'frames') {
          const fp = localUploadPath(b.video, user.id); // 所有权隔离:只处理本人上传/服务端产物
          if (!fp) return ffFail(400, '视频不存在(需为本站 /uploads/ 路径)', 400);
          const dur = await ffprobeDuration(fp);
          let ts;
          if (Array.isArray(b.times) && b.times.length) {
            ts = b.times.map(t => +t).filter(t => Number.isFinite(t) && t >= 0 && t < dur).slice(0, 24);
            if (!ts.length) return ffFail(400, 'times 无有效时间点(需在 0~时长 秒内)', 400);
          } else {
            const count = Math.max(1, Math.min(24, +(b.count || 6)));
            ts = Array.from({ length: count }, (_, i) => (dur * (i + 0.5)) / count);
          }
          const frames = [];
          for (const t of ts) {
            const out = ffOutName('.jpg');
            await runFF(FFMPEG_BIN, ['-y', '-ss', t.toFixed(2), '-i', fp, '-frames:v', '1', '-q:v', '3', '-vf', 'scale=640:-2', out.abs], 60000);
            frames.push(out.url);
          }
          return ffOk({ frames, duration: Math.round(dur * 10) / 10 });
        }

        /* 字幕擦除:{video,mode?} → delogo 区域修复(对白:底部居中横带;全局:顶部+底部整带) */
        if (ff === 'suberase') {
          const fp = localUploadPath(b.video, user.id); // 所有权隔离:只处理本人上传/服务端产物
          if (!fp) return ffFail(400, '视频不存在(需为本站 /uploads/ 路径)', 400);
          const { w, h } = await ffprobeVideoInfo(fp);
          const even = n => Math.max(2, Math.floor(n / 2) * 2);
          const filters = b.mode === '全局字幕擦除'
            ? [`delogo=x=2:y=2:w=${even(w - 4)}:h=${even(h * 0.09)}`, `delogo=x=2:y=${even(h * 0.74)}:w=${even(w - 4)}:h=${even(h * 0.24)}`]
            : [`delogo=x=${even(w * 0.06)}:y=${even(h * 0.76)}:w=${even(w * 0.88)}:h=${even(h * 0.20)}`];
          const out = ffOutName('.mp4');
          await runFF(FFMPEG_BIN, ['-y', '-i', fp, '-vf', filters.join(','), '-c:v', 'libx264', '-crf', '21', '-preset', 'veryfast', '-c:a', 'copy', '-movflags', '+faststart', out.abs]);
          return ffOk({ url: out.url });
        }

        /* 视频超清:{video,res?,quality?} → lanczos 放大 + unsharp 锐化;quality=pro 时更高码率慢压(cr18/preset medium/强锐化) */
        if (ff === 'upscale') {
          const fp = localUploadPath(b.video, user.id); // 所有权隔离:只处理本人上传/服务端产物
          if (!fp) return ffFail(400, '视频不存在(需为本站 /uploads/ 路径)', 400);
          const target = { '720P': 720, '1080P': 1080, '2K': 1440, '4K': 2160 }[String(b.res || '1080P')] || 1080;
          const pro = String(b.quality || '') === 'pro';
          const out = ffOutName('.mp4');
          await runFF(FFMPEG_BIN, ['-y', '-i', fp, '-vf',
            pro ? `scale=-2:${target}:flags=lanczos,unsharp=7:7:0.8:7:7:0.2,eq=saturation=1.05` : `scale=-2:${target}:flags=lanczos,unsharp=5:5:0.5:5:5:0.0`,
            '-c:v', 'libx264', '-crf', pro ? '18' : '20', '-preset', pro ? 'medium' : 'veryfast', '-c:a', 'copy', '-movflags', '+faststart', out.abs], 600000);
          return ffOk({ url: out.url, res: String(b.res || '1080P'), quality: pro ? 'pro' : 'std' });
        }

        /* 高光智剪:{video,min_duration?,max_duration?,max_number?,cut_mode?} → 场景探测切段,取每场景开头拼接 */
        if (ff === 'highlight') {
          const fp = localUploadPath(b.video, user.id); // 所有权隔离:只处理本人上传/服务端产物
          if (!fp) return ffFail(400, '视频不存在(需为本站 /uploads/ 路径)', 400);
          const dur = await ffprobeDuration(fp);
          const minD = Math.max(2, +(b.min_duration || 30));
          const maxD = Math.max(minD, +(b.max_duration || 180));
          const maxN = Math.max(1, Math.min(5, +(b.max_number || 1)));
          // Pass1:场景切换探测(showinfo pts_time)
          const log = await runFF(FFMPEG_BIN, ['-i', fp, '-vf', "select='gt(scene,0.3)',showinfo", '-f', 'null', '-'], 600000).catch(() => '');
          const cuts = [...log.matchAll(/pts_time:([\d.]+)/g)].map(m => +m[1]).filter(t => t > 0.5 && t < dur - 0.5);
          const points = [0, ...new Set(cuts.map(t => Math.round(t * 10) / 10)), dur];
          // 每个场景取开头一段(长度夹在 min/max 内,且不超场景实际长度)
          let segs = [];
          for (let i = 0; i < points.length - 1; i++) {
            const len = points[i + 1] - points[i];
            if (len < 1.5) continue;
            segs.push({ start: points[i], dur: Math.round(Math.min(len, Math.max(Math.min(len, minD), Math.min(len, maxD))) * 10) / 10 });
          }
          if (!segs.length) segs = [{ start: 0, dur: Math.round(Math.min(dur, maxD) * 10) / 10 }]; // 无场景切换:整段截
          /* detect_only(拉片):只探测不渲染——返回全部场景段(按时间序,max_number 放宽到 24),
           * 调用方自取段中点抽帧+理解;与智剪同价(场景探测是价值本体,渲染只是顺路) */
          if (b.detect_only) {
            const cap = Math.max(1, Math.min(24, +(b.max_number || 24)));
            let all = segs.sort((a, b2) => a.start - b.start);
            if (all.length > cap) all = all.sort((a, b2) => b2.dur - a.dur).slice(0, cap).sort((a, b2) => a.start - b.start); // 超上限:保留最长段(时间序)
            return ffOk({ segments: all, scenes: points.length - 1, duration: dur, detectOnly: true });
          }
          segs.sort((a, b2) => b2.dur - a.dur);
          const picked = (b.cut_mode === 'Single' ? segs.slice(0, 1) : segs.slice(0, maxN))
            .sort((a, b2) => a.start - b.start);
          // Pass2:trim + concat 一次出片(无音轨则补静音)
          const hasA = await ffprobeHasAudio(fp);
          const args = ['-y', '-i', fp];
          if (!hasA) args.push('-f', 'lavfi', '-i', 'anullsrc=r=44100:cl=stereo');
          const parts = [], outs = [];
          picked.forEach((sg, i) => {
            parts.push(`[0:v]trim=${sg.start}:${(sg.start + sg.dur).toFixed(1)},setpts=PTS-STARTPTS[v${i}]`);
            parts.push(hasA
              ? `[0:a]atrim=${sg.start}:${(sg.start + sg.dur).toFixed(1)},asetpts=PTS-STARTPTS,aformat=sample_rates=44100:channel_layouts=stereo[a${i}]`
              : `[1:a]atrim=0:${sg.dur.toFixed(1)},asetpts=PTS-STARTPTS,aformat=sample_rates=44100:channel_layouts=stereo[a${i}]`);
            outs.push(`[v${i}][a${i}]`);
          });
          parts.push(outs.join('') + `concat=n=${picked.length}:v=1:a=1[outv][outa]`);
          const out = ffOutName('.mp4');
          await runFF(FFMPEG_BIN, [...args, '-filter_complex', parts.join(';'), '-map', '[outv]', '-map', '[outa]', '-c:v', 'libx264', '-crf', '21', '-preset', 'veryfast', '-c:a', 'aac', '-movflags', '+faststart', out.abs], 600000);
          return ffOk({ url: out.url, segments: picked, scenes: points.length - 1, duration: dur });
        }

        /* 合成成片:{items:[{video?|image?,dur?,text?,audio?,transition?}],ratio?,subtitle?} → 统一规格化+拼接+可选字幕烧录+逐段配音混轨
         * 2026-08 六轮:支持真实转场——items[i].transition={type,duration?} 表示第 i-1→i 段之间的转场(转场记在后一镜),
         * 视频走 xfade、音频走 acrossfade;不支持/未设置的边界降级为硬切并在响应 transitions.degraded 中如实上报 */
        if (ff === 'compose') {
          const items = (Array.isArray(b.items) ? b.items : []).slice(0, 80);
          if (!items.length) return ffFail(400, 'items 不能为空', 400);
          const XF_MAP = { '淡入淡出': 'fade', '叠化': 'fade', '黑场': 'fadeblack', '闪黑': 'fadeblack', '闪白': 'fadewhite', '推拉转场': 'smoothleft', '旋转转场': 'circleopen', '甩镜': 'wipeleft' };
          const [W, H] = { '9:16': [720, 1280], '1:1': [960, 960] }[String(b.ratio)] || [1280, 720];
          const doSub = b.subtitle !== false;
          const fontEsc = FF_FONT.replace(/\\/g, '/').replace(':', '\\:');
          const args = ['-y'], parts = [], outs = [], tmpFiles = [];
          try {
            // 第一遍:收集素材与配音路径,确定输入序号(分镜素材 0..N-1,配音 N..N+X-1,静音源最后)
            const meta = [];
            const audioFiles = [];
            for (let i = 0; i < items.length; i++) {
              const it = items[i];
              const vpath = it.video ? localUploadPath(it.video, user.id) : null;
              const ipath = !vpath && it.image ? localUploadPath(it.image, user.id) : null;
              if (!vpath && !ipath) return ffFail(400, `第 ${i + 1} 段素材不存在(需为本站 /uploads/ 路径)`, 400);
              const apath = it.audio ? localUploadPath(it.audio, user.id) : null;
              if (it.audio && !apath) return ffFail(400, `第 ${i + 1} 段配音不存在(需为本站 /uploads/ 路径)`, 400);
              let aidx = -1;
              if (apath) { aidx = items.length + audioFiles.length; audioFiles.push(apath); }
              meta.push({ it, vpath, ipath, apath, aidx });
            }
            const silentIdx = items.length + audioFiles.length;
            const segDur = []; // 各段规格化后时长(转场 offset/时长钳制依据)
            for (let i = 0; i < items.length; i++) {
              const { it, vpath, ipath, aidx } = meta[i];
              const fullDur = vpath ? await ffprobeDuration(vpath) : Math.max(1, Math.min(30, +(it.dur || 3)));
              // 时间线编辑:视频段支持自定义入点/出点(it.start/it.end,秒);图片段不受影响
              const tStart = vpath ? Math.max(0, Math.min(fullDur - 0.2, +(it.start || 0))) : 0;
              const tEnd = vpath ? Math.max(tStart + 0.2, Math.min(fullDur, +(it.end || fullDur))) : fullDur;
              const dur = Math.round((tEnd - tStart) * 100) / 100;
              segDur.push(dur);
              if (vpath) args.push('-i', vpath); else args.push('-loop', '1', '-t', String(dur), '-i', ipath);
              // 视频流也裁齐到容器时长(与音轨 atrim 对齐,防段内音画不等长累积成后续段错位)
              let vchain = `[${i}:v]trim=start=${tStart.toFixed(2)}:end=${tEnd.toFixed(2)},setpts=PTS-STARTPTS,scale=${W}:${H}:force_original_aspect_ratio=decrease:force_divisible_by=2,pad=${W}:${H}:(ow-iw)/2:(oh-ih)/2,fps=30,format=yuv420p`;
              const text = doSub ? String(it.text || '').trim() : '';
              if (text) {
                const tf = path.join(GEN_CACHE_DIR, 'sub_' + Date.now().toString(36) + '_' + i + '.txt');
                writeFileAtomic(tf, text, 'utf8'); // 原子写:drawtext 不读半截字幕文本
                tmpFiles.push(tf);
                vchain += `,drawtext=fontfile='${fontEsc}':textfile='${tf.replace(/\\/g, '/').replace(':', '\\:')}':fontcolor=white:fontsize=${Math.round(W / 26)}:box=1:boxcolor=black@0.45:boxborderw=12:line_spacing=6:x=(w-text_w)/2:y=h-text_h-${Math.round(H * 0.08)}`;
              }
              parts.push(vchain + `[v${i}]`);
              const hasA = vpath ? await ffprobeHasAudio(vpath) : false;
              // 基础音轨(原声或静音)与画面同段裁剪;有配音再 amix 混入 TTS 音轨
              const baseChain = (hasA
                ? `[${i}:a]apad,atrim=start=${tStart.toFixed(2)}:end=${tEnd.toFixed(2)}`
                : `[${silentIdx}:a]atrim=0:${dur.toFixed(2)}`) + `,asetpts=PTS-STARTPTS,aformat=sample_rates=44100:channel_layouts=stereo`;
              if (aidx >= 0) {
                parts.push(baseChain + `[base${i}]`);
                parts.push(`[${aidx}:a]apad,atrim=0:${dur.toFixed(2)},asetpts=PTS-STARTPTS,aformat=sample_rates=44100:channel_layouts=stereo[tts${i}]`);
                parts.push(`[base${i}][tts${i}]amix=inputs=2:duration=first:normalize=0[a${i}]`);
              } else {
                parts.push(baseChain + `[a${i}]`);
              }
              outs.push(`[v${i}][a${i}]`);
            }
            audioFiles.forEach(ap => args.push('-i', ap));
            args.push('-f', 'lavfi', '-i', 'anullsrc=r=44100:cl=stereo');
            // 拼接策略:无转场 → 一次 concat(原路径);请求过转场(即使全部不支持)→ 逐边界链式(xfade/acrossfade 或硬切 concat),
            // 不支持类型降级并进 degraded 上报(七轮:全部不支持时也要如实报告,不静默吞掉)
            const trans = items.map(it => it && it.transition && typeof it.transition === 'object' ? it.transition : null);
            const anyTrans = trans.slice(1).some(t => t);
            const appliedT = [], degradedT = [];
            if (anyTrans) {
              let curV = 'v0', curA = 'a0', curDur = segDur[0] || 0;
              for (let i = 1; i < items.length; i++) {
                const t = trans[i];
                const xf = t && XF_MAP[t.type];
                if (t && !xf) degradedT.push({ index: i, type: t.type }); // 不支持的转场类型:降级硬切并上报
                if (xf) {
                  const d = Math.max(0.2, Math.min(+(t.duration || 0.6) || 0.6, (segDur[i - 1] || 1) * 0.4, (segDur[i] || 1) * 0.4)); // 钳制:转场不吃光相邻短片
                  parts.push(`[${curV}][v${i}]xfade=transition=${xf}:duration=${d.toFixed(2)}:offset=${Math.max(0, curDur - d).toFixed(2)}[xv${i}]`);
                  parts.push(`[${curA}][a${i}]acrossfade=d=${d.toFixed(2)}[xa${i}]`);
                  curV = `xv${i}`; curA = `xa${i}`;
                  curDur += (segDur[i] || 0) - d;
                  appliedT.push({ index: i, type: t.type });
                } else {
                  parts.push(`[${curV}][${curA}][v${i}][a${i}]concat=n=2:v=1:a=1[cv${i}][ca${i}]`);
                  curV = `cv${i}`; curA = `ca${i}`;
                  curDur += segDur[i] || 0;
                }
              }
              parts.push(`[${curV}]null[outv]`);
              parts.push(`[${curA}]anull[outa]`);
            } else {
              parts.push(outs.join('') + `concat=n=${items.length}:v=1:a=1[outv][outa]`);
            }
            const out = ffOutName('.mp4');
            await runFF(FFMPEG_BIN, [...args, '-filter_complex', parts.join(';'), '-map', '[outv]', '-map', '[outa]', '-c:v', 'libx264', '-crf', '21', '-preset', 'veryfast', '-c:a', 'aac', '-movflags', '+faststart', out.abs], 120000 + items.length * 45000);
            return ffOk({ url: out.url, count: items.length, transitions: { applied: appliedT.length, degraded: degradedT } });
          } finally {
            tmpFiles.forEach(f => { try { fs.unlinkSync(f); } catch (_) {} }); // 含早退/抛错路径统一清理字幕临时文件
          }
        }

        /* 音视频合并:{video,audio} → 画面流拷贝+音轨混封(-shortest) */
        if (ff === 'merge') {
          const vp = localUploadPath(b.video, user.id), ap = localUploadPath(b.audio, user.id); // 所有权隔离
          if (!vp) return ffFail(400, '视频不存在(需为本站 /uploads/ 路径)', 400);
          if (!ap) return ffFail(400, '音频不存在(需为本站 /uploads/ 路径)', 400);
          const out = ffOutName('.mp4');
          await runFF(FFMPEG_BIN, ['-y', '-i', vp, '-i', ap, '-c:v', 'copy', '-c:a', 'aac', '-shortest', '-movflags', '+faststart', out.abs], 300000);
          return ffOk({ url: out.url });
        }

        /* 视频剪辑:{video,segments:[{start,end}]} → 保留指定时间段并拼接(剪辑器导出用) */
        if (ff === 'cut') {
          const fp = localUploadPath(b.video, user.id); // 所有权隔离:只处理本人上传/服务端产物
          if (!fp) return ffFail(400, '视频不存在(需为本站 /uploads/ 路径)', 400);
          const dur = await ffprobeDuration(fp);
          const segs = (Array.isArray(b.segments) ? b.segments : [])
            .map(s2 => ({ start: Math.max(0, +s2.start || 0), end: Math.min(dur, +s2.end || 0) }))
            .filter(s2 => s2.end - s2.start >= 0.2)
            .sort((a, b2) => a.start - b.start)
            .slice(0, 60);
          if (!segs.length) return ffFail(400, '没有有效的保留片段', 400);
          const hasA = await ffprobeHasAudio(fp);
          const args = ['-y', '-i', fp];
          if (!hasA) args.push('-f', 'lavfi', '-i', 'anullsrc=r=44100:cl=stereo');
          const parts = [], outs = [];
          segs.forEach((sg, i) => {
            parts.push(`[0:v]trim=${sg.start.toFixed(2)}:${sg.end.toFixed(2)},setpts=PTS-STARTPTS[v${i}]`);
            parts.push(hasA
              ? `[0:a]atrim=${sg.start.toFixed(2)}:${sg.end.toFixed(2)},asetpts=PTS-STARTPTS,aformat=sample_rates=44100:channel_layouts=stereo[a${i}]`
              : `[1:a]atrim=0:${(sg.end - sg.start).toFixed(2)},asetpts=PTS-STARTPTS,aformat=sample_rates=44100:channel_layouts=stereo[a${i}]`);
            outs.push(`[v${i}][a${i}]`);
          });
          parts.push(outs.join('') + `concat=n=${segs.length}:v=1:a=1[outv][outa]`);
          const out = ffOutName('.mp4');
          await runFF(FFMPEG_BIN, [...args, '-filter_complex', parts.join(';'), '-map', '[outv]', '-map', '[outa]', '-c:v', 'libx264', '-crf', '21', '-preset', 'veryfast', '-c:a', 'aac', '-movflags', '+faststart', out.abs], 600000);
          return ffOk({ url: out.url, segments: segs.length });
        }

        return fail(res, 404, '接口不存在');
        } finally { execUnlock(ffLock); } // 十一轮并发锁统一释放
      } catch (e) {
        if (charge) proxyRefund(user.id, charge, e.message); // 处理异常:未交付,按原账单退费
        return fail(res, 502, e.message || 'FFmpeg 处理失败', 502);
      } finally {
        rateLimitDone(user.id);
      }
    }

    /* ---- 豆包语音合成 TTS(V3 HTTP chunked 单向流式;音频落 uploads/gen/) ---- */
    if (pathname === '/api/volc/tts' && req.method === 'POST') {
      const ttsKey = CONFIG.ttsApiKey || CONFIG.apiKey; // Agent Plan:key 与 LLM 共用
      if (!ttsKey && !CONFIG.ttsAppId) {
        return fail(res, 503, '服务端未配置语音合成凭据(config.json 填 ttsApiKey 或 apiKey)', 503);
      }
      if (!rateLimitOk(user.id)) return fail(res, 429, '请求过于频繁,请稍候', 429);
      let charge = null; // 声明在 try 外:catch 退费引用安全(读 body 失败时为 null 不退)
      try {
        const b = await readJSONBody(req, 16 * 1024 * 1024); // 分端点上限(七轮):音色参考音频可为 dataURL 内联
        const text = String(b.text || '').trim();
        if (!text) return fail(res, 400, 'text 不能为空');
        if (Buffer.byteLength(text, 'utf8') > 1000) return fail(res, 400, '文本过长(≤1000 字节,约 300 字)');
        // 服务端按次原子扣费(七轮:动作族校验;operation 状态机绑定请求指纹;未交付路径自动退费)
        const tAction = billAction(res, 'tts', b, 'tts.gen');
        if (!tAction) return; // 400 已返回(动作族不符)
        charge = proxyCharge(res, user.id, tAction, '语音合成:' + text.slice(0, 30), b.operationId, 'volc/tts', b);
        if (!charge) return; // 402/409 已返回
        /* 十三轮结果恢复:同 opId 同内容重放且日志命中 → 直接带回已付费音频(响应丢失/崩溃后重试) */
        if (charge.recovered) return ok(res, Object.assign({}, charge.recovered, { recovered: true }));
        /* 十一轮 P0-2/P0-4:executing 标记 + 并发锁(同 opId 并发不再重复调 TTS 上游) */
        const ttsLock = 'tts:' + user.id + ':' + charge.opId + ':' + tAction;
        if (!execLock(ttsLock)) return fail(res, 409, '该操作正在执行中,请勿并发重复提交', 409);
        try {
        opMarkExecuting(user.id, charge.opId, tAction);
        const speaker = String(b.voice || 'zh_female_vv_uranus_bigtts');
        const resource = CONFIG.ttsResourceId || 'seed-tts-2.0';
        const audioParams = { format: 'mp3', sample_rate: 24000 };
        if (typeof b.speed === 'number' && b.speed > 0) audioParams.speech_rate = Math.round((Math.max(0.5, Math.min(2, b.speed)) - 1) * 100);
        if (typeof b.volume === 'number' && b.volume > 0) audioParams.loudness_rate = Math.round((Math.max(0.5, Math.min(2, b.volume)) - 1) * 100);
        const adds = {};
        if (b.emotion) { adds.emotion = String(b.emotion); adds.enable_emotion = true; adds.emotion_scale = Math.max(1, Math.min(5, +(b.emotionScale || 4))); }
        const mkBody = withEmotion => JSON.stringify({
          user: { uid: user.id },
          req_params: {
            text, speaker, audio_params: audioParams,
            additions: JSON.stringify(withEmotion ? adds : {}),
          },
        });
        const ttsUrl = new URL(CONFIG.ttsBaseUrl || 'https://openspeech.bytedance.com/api/v3/plan/tts/unidirectional');
        // Request-Id 每次调用单独生成:情感降级重试复用同一 id 会被上游按幂等去重返回缓存错误
        const mkHeaders = () => {
          const h = { 'Content-Type': 'application/json', 'X-Api-Resource-Id': resource, 'X-Api-Request-Id': crypto.randomUUID() };
          if (ttsKey) h['X-Api-Key'] = ttsKey;
          else { h['X-Api-App-Id'] = CONFIG.ttsAppId; h['X-Api-Access-Key'] = CONFIG.ttsAccessKey || CONFIG.volcApiKey; }
          return h;
        };
        // 流式分块 JSON 行:逐行解析,累积音频 base64;带情感失败时降级去情感重试一次
        const callTts = withEmotion => new Promise((resolve, reject) => {
          const req = https.request({
            hostname: ttsUrl.hostname, port: ttsUrl.port || 443, path: ttsUrl.pathname + ttsUrl.search, method: 'POST', headers: mkHeaders(),
          }, r => {
            let buf = '', audio = '', duration = 0, errMsg = '';
            const parseLine = line => {
              line = line.trim();
              if (!line) return;
              let j; try { j = JSON.parse(line); } catch (_) { return; }
              const code = (j.header && j.header.code) ?? j.code;
              if (code && code !== 0 && code !== 3000 && code !== 20000000) errMsg = (j.header && j.header.message) || j.message || ('code ' + code);
              const chunk = j.data || (j.payload && (j.payload.audio || j.payload.data)) || '';
              if (chunk) audio += chunk;
              const dur = (j.addition && j.addition.duration) || (j.payload && j.payload.addition && j.payload.addition.duration);
              if (dur) duration = +dur || duration;
            };
            r.on('data', d => {
              buf += d.toString('utf8');
              let idx;
              while ((idx = buf.indexOf('\n')) >= 0) { parseLine(buf.slice(0, idx)); buf = buf.slice(idx + 1); }
            });
            r.on('end', () => {
              if (buf.trim()) parseLine(buf); // 末行无换行符的兜底解析
              errMsg ? reject(new Error(errMsg)) : audio ? resolve({ audio, duration }) : reject(new Error('TTS 上游未返回音频(HTTP ' + r.statusCode + ')'));
            });
          });
          req.on('error', e => reject(new Error('无法连接语音合成服务:' + e.message)));
          req.setTimeout(120000, () => { req.destroy(); reject(new Error('语音合成超时(120s)')); });
          req.write(mkBody(withEmotion)); req.end();
        });
        let out;
        try { out = await callTts(true); }
        catch (e) {
          if (!b.emotion) throw e;
          out = await callTts(false).catch(() => { throw e; }); // 情感参数不被该音色支持时降级重试
        }
        const name = 'tts_' + Date.now().toString(36) + crypto.randomBytes(3).toString('hex') + '.mp3';
        writeFileAtomic(path.join(GEN_CACHE_DIR, name), Buffer.from(out.audio, 'base64')); // 原子写:半截 mp3 不被当有效缓存交付
        /* 十二轮交付守卫:已退款的 operation 不再回传音频地址(退款+白拿成品竞态) */
        if (!opDelivered(user.id, charge.opId, tAction)) return fail(res, 409, '该操作已退款,结果不再交付', 409);
        resultPut(user.id, charge.opId, tAction, 'volc/tts', { url: '/uploads/gen/' + name, duration: out.duration, voice: speaker }); // 十三轮:结果日志(重放恢复)
        return ok(res, { url: '/uploads/gen/' + name, duration: out.duration, voice: speaker });
        } finally { execUnlock(ttsLock); } // 十一轮并发锁统一释放
      } catch (e) {
        proxyRefund(user.id, charge, e && e.message); // 未交付:服务端本次实扣自动退回
        return fail(res, 502, '语音合成失败:' + e.message, 502);
      } finally {
        rateLimitDone(user.id);
      }
    }

    /* ---- 充值/支付(收款码人工审核 + 卡密) ---- */
    if (pathname === '/api/pay/config' && req.method === 'GET') {
      const c = payCfg();
      return ok(res, { rate: c.rate, packs: c.packs, giftTiers: c.giftTiers, qrWechat: c.qrWechat, qrAlipay: c.qrAlipay, isAdmin: isAdmin(user) });
    }
    if (pathname === '/api/pay/redeem' && req.method === 'POST') {
      const b = await readJSONBody(req, 64 * 1024); // 分端点上限(七轮)
      const code = String(b.code || '').trim().toUpperCase();
      if (!code) return fail(res, 400, '请输入卡密');
      const db = readJSON(PAYCODES_FILE, { list: [] });
      const card = db.list.find(x => x.code === code);
      if (!card) return fail(res, 400, '卡密不存在,请核对后重试');
      if (card.usedBy) return fail(res, 400, '该卡密已于 ' + card.usedAt + ' 被使用');
      const granted = grantCredits(user.id, card.credits, {
        idem: 'redeem_' + code, // 幂等键(七轮):崩溃窗口内重试同卡密不重复发放(账本级去重)
        reason: '卡密兑换(' + code + ')', username: user.username,
        order: { id: uid('o'), userId: user.id, orderNo: 'KM' + Date.now().toString(36).toUpperCase(), amountYuan: 0, credits: card.credits, gifted: 0, planName: '卡密兑换', channel: '卡密', time: nowStr() },
      });
      if (!granted) return fail(res, 409, '账号数据未就绪,请先打开一次页面再兑换', 409);
      card.usedBy = user.id; card.usedByName = user.username; card.usedAt = nowStr();
      // 两步写一致性:状态落盘失败(磁盘满/权限/崩溃)时反向回收本次发放,卡密保持可用,重试不重复发放
      try {
        writeJSON(PAYCODES_FILE, db);
      } catch (e) {
        grantCredits(user.id, -card.credits, { reason: '卡密状态落盘失败自动回收(' + code + ')' });
        console.error('[redeem] 卡密状态落盘失败,已回收积分:', e);
        const err = new Error('卡密状态保存失败,本次兑换已自动回滚,请稍后重试'); err.httpStatus = 500; throw err;
      }
      return ok(res, { credits: card.credits });
    }
    if (pathname === '/api/pay/request' && req.method === 'POST') {
      const b = await readJSONBody(req, 64 * 1024); // 分端点上限(七轮)
      const yuan = +(b.yuan || 0);
      if (!isFinite(yuan) || yuan < 1) return fail(res, 400, '金额非法');
      const yuanCapped = Math.min(100000, yuan);
      const cfg = payCfg();
      const credits = Math.round(yuanCapped * cfg.rate);
      const gifted = Math.round(credits * giftFor(cfg, yuanCapped));
      const proof = String(b.proof || '');
      if (proof && !proof.startsWith('/uploads/')) return fail(res, 400, '凭证须先上传到服务端');
      const db = readJSON(PAYREQ_FILE, { list: [] });
      const r0 = {
        id: uid('pr'), userId: user.id, username: user.username,
        planName: String(b.planName || '自定义').slice(0, 30), yuan: yuanCapped, credits, gifted,
        channel: String(b.channel || '微信支付').slice(0, 10), note: String(b.note || '').slice(0, 200), proof,
        status: 'pending', createdAt: nowStr(), handledAt: null, adminNote: '',
      };
      db.list.unshift(r0);
      writeJSON(PAYREQ_FILE, db);
      return ok(res, { id: r0.id, status: 'pending', credits, gifted });
    }
    if (pathname === '/api/pay/requests' && req.method === 'GET') {
      const db = readJSON(PAYREQ_FILE, { list: [] });
      return ok(res, { list: db.list.filter(x => x.userId === user.id).slice(0, 50) });
    }
    if (pathname === '/api/admin/requests' && req.method === 'GET') {
      if (!isAdmin(user)) return fail(res, 403, '无管理员权限', 403);
      const db = readJSON(PAYREQ_FILE, { list: [] });
      const st = u.searchParams.get('status');
      return ok(res, { list: db.list.filter(x => !st || x.status === st).slice(0, 200) });
    }
    if (pathname === '/api/admin/handle' && req.method === 'POST') {
      if (!isAdmin(user)) return fail(res, 403, '无管理员权限', 403);
      const b = await readJSONBody(req, 64 * 1024); // 分端点上限(七轮)
      const db = readJSON(PAYREQ_FILE, { list: [] });
      const r0 = db.list.find(x => x.id === String(b.id || ''));
      if (!r0) return fail(res, 404, '申请不存在');
      if (r0.status !== 'pending') return fail(res, 400, '该申请已处理过');
      if (b.action === 'approve') {
        const granted = grantCredits(r0.userId, r0.credits + r0.gifted, {
          idem: 'payreq_' + r0.id, // 幂等键(七轮):崩溃窗口内重试同申请不重复发放(账本级去重)
          reason: `充值到账(${r0.planName} ¥${r0.yuan}${r0.gifted ? ',含赠送 ' + r0.gifted : ''})`, username: r0.username,
          order: { id: uid('o'), userId: r0.userId, orderNo: 'MV' + Date.now().toString(36).toUpperCase(), amountYuan: r0.yuan, credits: r0.credits, gifted: r0.gifted, planName: r0.planName, channel: r0.channel, time: nowStr() },
        });
        if (!granted) return fail(res, 409, '对方账号数据未就绪(未登录过前端)', 409);
        r0.status = 'approved';
      } else if (b.action === 'reject') {
        r0.status = 'rejected';
      } else return fail(res, 400, 'action 须为 approve/reject');
      r0.handledAt = nowStr();
      r0.adminNote = String(b.note || '').slice(0, 200);
      // 两步写一致性:申请状态落盘失败时反向回收已发积分,申请保持 pending,管理员重试不重复发放
      try {
        writeJSON(PAYREQ_FILE, db);
      } catch (e) {
        if (r0.status === 'approved') grantCredits(r0.userId, -(r0.credits + r0.gifted), { reason: '充值状态落盘失败自动回收(' + r0.id + ')' });
        console.error('[admin/handle] 申请状态落盘失败,已回收积分:', e);
        const err = new Error('申请状态保存失败,本次审批已自动回滚,请稍后重试'); err.httpStatus = 500; throw err;
      }
      return ok(res, { status: r0.status });
    }
    if (pathname === '/api/admin/codes' && req.method === 'POST') {
      if (!isAdmin(user)) return fail(res, 403, '无管理员权限', 403);
      const b = await readJSONBody(req, 64 * 1024); // 分端点上限(七轮)
      const count = Math.max(1, Math.min(100, +(b.count || 1)));
      const credits = Math.max(1, Math.min(1000000, +(b.credits || 0)));
      const db = readJSON(PAYCODES_FILE, { list: [] });
      const made = [];
      for (let i = 0; i < count; i++) {
        const code = 'MV-' + crypto.randomBytes(4).toString('hex').toUpperCase() + '-' + crypto.randomBytes(2).toString('hex').toUpperCase();
        db.list.unshift({ code, credits, note: String(b.note || '').slice(0, 80), createdAt: nowStr(), usedBy: null, usedAt: null });
        made.push(code);
      }
      writeJSON(PAYCODES_FILE, db);
      return ok(res, { codes: made, credits });
    }
    if (pathname === '/api/admin/codes' && req.method === 'GET') {
      if (!isAdmin(user)) return fail(res, 403, '无管理员权限', 403);
      const db = readJSON(PAYCODES_FILE, { list: [] });
      return ok(res, { list: db.list.slice(0, 200) });
    }
    if (pathname === '/api/admin/payconfig' && req.method === 'POST') {
      if (!isAdmin(user)) return fail(res, 403, '无管理员权限', 403);
      const b = await readJSONBody(req, 16 * 1024); // 分端点上限(七轮)
      const cur = payCfg();
      if (b.rate) cur.rate = Math.max(1, Math.min(1000, Math.round(+b.rate)));
      if (Array.isArray(b.packs)) {
        const packs = b.packs.filter(p => p && p.name && +p.yuan > 0).map(p => ({ name: String(p.name).slice(0, 20), yuan: Math.round(+p.yuan) }));
        if (packs.length) cur.packs = packs;
      }
      if (typeof b.qrWechat === 'string') cur.qrWechat = b.qrWechat.slice(0, 120);
      if (typeof b.qrAlipay === 'string') cur.qrAlipay = b.qrAlipay.slice(0, 120);
      writeJSON(PAYCFG_FILE, cur);
      return ok(res, { saved: true });
    }
    if (pathname === '/api/admin/credits' && req.method === 'POST') {
      if (!isAdmin(user)) return fail(res, 403, '无管理员权限', 403);
      const b = await readJSONBody(req, 16 * 1024); // 分端点上限(七轮)
      const target = users.find(x => x.username === String(b.username || ''));
      if (!target) return fail(res, 404, '用户不存在');
      const delta = Math.trunc(+b.delta || 0);
      if (!delta) return fail(res, 400, '调整数量不能为 0');
      const granted = grantCredits(target.id, delta, { reason: '管理员调整:' + String(b.reason || '').slice(0, 80), username: target.username, type: delta > 0 ? 'gain' : 'spend', idem: 'admin_' + target.id + '_' + delta + '_' + String(b.reason || '').slice(0, 20) + '_' + Math.floor(Date.now() / 5000) }); // R14:5 秒窗口幂等——双击/重试同参数调整只入账一次,窗口外的人工重复调整不受影响
      if (!granted) return fail(res, 409, '对方账号数据未就绪(未登录过前端)', 409);
      return ok(res, { adjusted: delta });
    }

    /* ---- 团队/项目组(真实成员;数据存 data/teams.json;支持一人创建/加入多个项目组) ---- */
    if (pathname === '/api/team' && req.method === 'GET') {
      const db = teamsDB();
      const teams = teamsOfUser(db, user.id);
      return ok(res, { teams, team: teams[0] || null, isAdmin: isAdmin(user) });
    }
    if (pathname === '/api/team/create' && req.method === 'POST') {
      const b = await readJSONBody(req, 16 * 1024); // 分端点上限(七轮)
      const name = String(b.name || '').trim().slice(0, 30);
      if (name.length < 2) return fail(res, 400, '项目组名称需 2~30 个字符');
      const db = teamsDB();
      if (db.list.some(t => t.ownerId === user.id && t.name === name)) return fail(res, 400, '你已有同名项目组,换个名称区分');
      const t = {
        id: uid('team'), name, ownerId: user.id, ownerName: user.username,
        members: [{ userId: user.id, username: user.username, role: 'owner', joinedAt: nowStr() }],
        inviteCode: newInviteCode(db), createdAt: nowStr(),
      };
      db.list.push(t);
      writeJSON(TEAMS_FILE, db);
      return ok(res, { team: t });
    }
    if (pathname === '/api/team/join' && req.method === 'POST') {
      const b = await readJSONBody(req, 16 * 1024); // 分端点上限(七轮)
      const code = String(b.code || '').trim().toUpperCase();
      if (!code) return fail(res, 400, '请输入邀请码');
      const db = teamsDB();
      const t = db.list.find(x => x.inviteCode === code);
      if (!t) return fail(res, 404, '邀请码无效,请核对后重试');
      if ((t.members || []).some(m => m.userId === user.id)) return fail(res, 400, '你已是该项目组成员');
      if ((t.members || []).length >= TEAM_MAX) return fail(res, 400, `该项目组成员已达上限(${TEAM_MAX} 人)`);
      t.members.push({ userId: user.id, username: user.username, role: 'member', joinedAt: nowStr() });
      writeJSON(TEAMS_FILE, db);
      return ok(res, { team: t });
    }
    if (pathname === '/api/team/leave' && req.method === 'POST') {
      const b = await readJSONBody(req, 16 * 1024); // 分端点上限(七轮)
      const db = teamsDB();
      const mine = teamsOfUser(db, user.id);
      const t = (b.teamId && mine.find(x => x.id === b.teamId)) || null;
      if (!t) return fail(res, 404, b.teamId ? '你不在这个项目组中' : '请指定要退出的项目组(teamId)');
      if (t.ownerId === user.id) return fail(res, 400, '负责人不能退出项目组(可先移除全部成员)');
      t.members = t.members.filter(m => m.userId !== user.id);
      writeJSON(TEAMS_FILE, db);
      return ok(res, { left: true });
    }
    if (pathname === '/api/team/kick' && req.method === 'POST') {
      const b = await readJSONBody(req, 16 * 1024); // 分端点上限(七轮)
      const targetId = String(b.userId || '');
      const db = teamsDB();
      const owned = db.list.filter(x => x.ownerId === user.id);
      const t = (b.teamId && owned.find(x => x.id === b.teamId)) || null;
      if (!t) return fail(res, 403, '仅项目组负责人可移除成员(需指定你负责的 teamId)', 403);
      if (targetId === t.ownerId) return fail(res, 400, '负责人不能被移除');
      const m = (t.members || []).find(x => x.userId === targetId);
      if (!m) return fail(res, 404, '该成员不在项目组中');
      t.members = t.members.filter(x => x.userId !== targetId);
      writeJSON(TEAMS_FILE, db);
      return ok(res, { kicked: targetId, username: m.username });
    }
    if (pathname === '/api/team/invite/refresh' && req.method === 'POST') {
      const b = await readJSONBody(req, 16 * 1024); // 分端点上限(七轮)
      const db = teamsDB();
      const owned = db.list.filter(x => x.ownerId === user.id);
      const t = (b.teamId && owned.find(x => x.id === b.teamId)) || null;
      if (!t) return fail(res, 403, '仅项目组负责人可刷新邀请码(需指定你负责的 teamId)', 403);
      t.inviteCode = newInviteCode(db);
      writeJSON(TEAMS_FILE, db);
      return ok(res, { inviteCode: t.inviteCode });
    }
    if (pathname === '/api/team/stats' && req.method === 'GET') {
      const db = teamsDB();
      const mine = teamsOfUser(db, user.id);
      const teamId = u.searchParams.get('teamId') || '';
      const t = (teamId && mine.find(x => x.id === teamId)) || null;
      if (!t) return fail(res, 404, teamId ? '你不在这个项目组中' : '请指定项目组(teamId)');
      return ok(res, { teamId: t.id, members: (t.members || []).map(teamMemberStats) });
    }

    /* ---- 团队资产贯通:队友共享给我的资产(只读) ----
     * 共享声明在属主 state(assets.groups[].shared=用户名列表),本端点按 teams.json 队友关系
     * 拉取各队友 state,收集"shared 含我的用户名"的分组内资产(本地可用/无检查记录/存量 approved);
     * 前端资产库「协作者共享给我的资产」区据此渲染,文件访问经 sharedPathsFor 精确授权 */
    if (pathname === '/api/assets/shared' && req.method === 'GET') {
      const mates = new Map(); // userId → username
      teamsOfUser(teamsDB(), user.id).forEach(t => (t.members || []).forEach(m => { if (m.userId && m.userId !== user.id) mates.set(m.userId, m.username); }));
      const list = [];
      mates.forEach((mname, uid2) => {
        const st = readJSON(stateFile(uid2), { state: null }).state;
        if (!st || !st.assets) return;
        (st.assets.groups || []).forEach(g => {
          if (!(g.shared || []).includes(user.username)) return;
          (st.assets.subjects || []).forEach(a => {
            if (a.groupId === g.id && (!a.review || a.review === 'local_available' || a.review === 'approved'))
              list.push(Object.assign({}, a, { ownerUserId: uid2, ownerUsername: mname, sharedGroup: g.name || '' }));
          });
        });
      });
      return ok(res, { list });
    }

    /* ---------- 服务端工作流端点(二十一轮) ----------
     * 智能分镜/本集理解/智能审片的 LLM 编排下沉服务端——CLI/MCP/外部 Agent 不再依赖浏览器引擎;
     * 计费动作服务端定死(不接受客户端标签),提示词/规整与浏览器同源(js/wf-core.js);
     * 失败退费+如实报错(不本地冒充);写回 state 与 /api/state PUT 同路径。 */
    if (pathname === '/api/wf/understanding' && req.method === 'POST') {
      if (!CONFIG.apiKey && !(process.env.MOCK_LLM === '1' || CONFIG.mockLlm)) return fail(res, 503, '服务端未配置 LLM key,请创建 config.json 并填入 apiKey', 503);
      if (!rateLimitOk(user.id)) return fail(res, 429, '请求过于频繁,请稍候', 429);
      try {
        const b = await readJSONBody(req, 1024 * 1024);
        const { cur, tree, p, ep } = wfLoadCtx(user.id, String(b.pid || ''), String(b.epid || ''));
        if (!p) return fail(res, 404, '项目不存在', 404);
        if (!ep) return fail(res, 404, '分集不存在', 404);
        if (!(ep.content || '').trim()) return fail(res, 400, '本分集暂无剧本内容,请先补充剧本', 400);
        const st = (tree && tree.settings) || {};
        const r = await wfLLM(user.id, {
          action: 'llm.understanding', reason: '本集理解(' + ep.title + ')', opId: sanitizeOpId(b.operationId) || uid('wfund'), step: 'main', wfName: 'understanding',
          model: st.defLLM || 'qwen-turbo', system: Prompts.get('und.system', st.promptOverrides),
          user: WfCore.buildUndUser({
            dsText: WfCore.dimsText(st.directorSetting), styleText: Domain.styleOf(p), eventsText: WfCore.eventsOfEpisode(p, ep), content: (ep.content || '').slice(0, 6000),
            // 雇佣专家方法论 + 协作记忆(导演板块):与浏览器 understanding.js 委托点同源注入
            personaNote: WfCore.personaNote(ExpertsData.expertOf(st.hiredExpert, tree.customExperts)),
            memText: WfCore.memBlock(tree.agentMemory, ep.title || '', '导演'),
          }),
          temperature: 0.5, max_tokens: 1500, projectId: p.id, mockKind: 'und',
        });
        if (!WfCore.undValid(r.parsed)) { if (r.charge) proxyRefund(user.id, r.charge, '理解结构不完整'); return fail(res, 502, '本集理解返回结构不完整(已退费)', 502); }
        ep.understanding = WfCore.undNormalize(r.parsed, nowStr);
        ep.understanding.sourceRev = ep.contentRev || 0; // 记录理解对应的剧本版本(剧本修改后判旧)
        ep.understanding.graphRev = ep.graphRev || 0;    // 记录理解对应的事件图谱版本(图谱修订后判旧)
        const rev = wfSave(user.id, cur, tree);
        return ok(res, { rev, understanding: ep.understanding });
      } catch (e) {
        return fail(res, e.httpStatus || 502, e.message || '本集理解生成失败', e.httpStatus || 502);
      } finally { rateLimitDone(user.id); } // 限流计数配对释放(泄漏 4 次后永久 429)
    }

    if (pathname === '/api/wf/smart-storyboard' && req.method === 'POST') {
      if (!CONFIG.apiKey && !(process.env.MOCK_LLM === '1' || CONFIG.mockLlm)) return fail(res, 503, '服务端未配置 LLM key,请创建 config.json 并填入 apiKey', 503);
      if (!rateLimitOk(user.id)) return fail(res, 429, '请求过于频繁,请稍候', 429);
      try {
        const b = await readJSONBody(req, 1024 * 1024);
        const { cur, tree, p, ep } = wfLoadCtx(user.id, String(b.pid || ''), String(b.epid || ''));
        if (!p) return fail(res, 404, '项目不存在', 404);
        if (!ep) return fail(res, 404, '分集不存在', 404);
        if (!(ep.content || '').trim()) return fail(res, 400, '本分集暂无剧本内容,请先补充剧本', 400);
        const st = (tree && tree.settings) || {};
        const ov = st.promptOverrides;
        const c = wfSbConfig(tree, ep);
        const planN = Math.max(1, Math.min(3, +b.sbPlans || +c.sbPlans || 1));
        const count = Math.max(2, Math.min(40, +b.shotCount || +c.shotCount || 8));
        const opId = sanitizeOpId(b.operationId) || uid('wfsb');
        const ctxBase = {
          styleText: Domain.styleOf(p),
          // 二十二轮:projType 与浏览器同源推导(experts-data.projTypeOf)——雇佣解说剧导演后服务端工作流提示词同样带「解说模式」标注
          projType: ExpertsData.projTypeOf(st.hiredExpert, tree.customExperts),
          directorNote: WfCore.directorNote(st.directorSetting), conceptNote: WfCore.conceptInject(p),
          // 雇佣专家方法论 + 协作记忆(分镜板块):与浏览器 sb-llm.js 委托点同源注入
          personaNote: WfCore.personaNote(ExpertsData.expertOf(st.hiredExpert, tree.customExperts)),
          memText: WfCore.memBlock(tree.agentMemory, ep.title || '', '分镜'),
          langText: WfCore.langOf(p), genres: p.genres, eventsText: WfCore.eventsOfEpisode(p, ep),
          content: (ep.content || '').slice(0, 12000),
        };
        // Step1 本集理解:存在且未过期复用(0 调用);否则同 opId step 'und' 聚合并写回
        if (!(ep.understanding && !Domain.understandingStale(ep))) {
          const ru = await wfLLM(user.id, {
            action: 'llm.smartSB', reason: '智能分镜(' + ep.title + ')', opId, step: 'und', wfName: 'smart-storyboard',
            model: c.sbModel || st.defLLM || 'qwen-turbo', system: Prompts.get('und.system', ov),
            user: WfCore.buildUndUser({
              dsText: WfCore.dimsText(st.directorSetting), styleText: ctxBase.styleText, eventsText: ctxBase.eventsText, content: (ep.content || '').slice(0, 6000),
              personaNote: ctxBase.personaNote, memText: WfCore.memBlock(tree.agentMemory, ep.title || '', '导演'),
            }),
            temperature: 0.5, max_tokens: 1500, projectId: p.id, mockKind: 'und',
          });
          if (!WfCore.undValid(ru.parsed)) { if (ru.charge) proxyRefund(user.id, ru.charge, '理解结构不完整'); return fail(res, 502, '本集理解返回结构不完整(已退费)', 502); }
          ep.understanding = WfCore.undNormalize(ru.parsed, nowStr);
          ep.understanding.sourceRev = ep.contentRev || 0;
          ep.understanding.graphRev = ep.graphRev || 0; // 记录理解对应的事件图谱版本(图谱修订后判旧)
        }
        ctxBase.understandingText = WfCore.undToText(ep.understanding);
        const genShots = async (feedback, stepTag) => {
          const r = await wfLLM(user.id, {
            action: 'llm.smartSB', reason: '智能分镜(' + ep.title + ')', opId, step: stepTag, wfName: 'smart-storyboard',
            model: c.sbModel || st.defLLM || 'qwen-turbo', system: WfCore.sbSystem(ov),
            user: WfCore.buildSBUser(p, ep, { count, mode: c.sbMode, optimize: c.autoOptimize, feedback }, ctxBase),
            temperature: 0.6, max_tokens: 6000, projectId: p.id, mockKind: 'shots',
          });
          if (!Array.isArray(r.parsed) || !r.parsed.length) { if (r.charge) proxyRefund(user.id, r.charge, '未返回有效分镜数组'); throw Object.assign(new Error('LLM 未返回有效分镜数组(已退费)'), { httpStatus: 502 }); }
          const trimmed = r.parsed.length > count + 3 ? r.parsed.slice(0, count + 3) : r.parsed; // 拆解规则优先,最多容忍 count+3
          return trimmed.map((raw, i) => WfCore.normalizeLLMShot(raw, i, p, ep, c.sbModel || 'LLM', c.sbMode === 'tweet', { uid, now: nowStr, directorNote: ctxBase.directorNote, phImage: null })); // 服务端推文模式不留占位图(真实出图走 gen-shot-image)
        };
        const reviewShots = async (shots, stepTag) => {
          const r = await wfLLM(user.id, {
            action: 'llm.smartSB', reason: '分镜评审(' + ep.title + ')', opId, step: stepTag, wfName: 'smart-storyboard',
            model: c.sbModel || st.defLLM || 'qwen-turbo', system: Prompts.get('sb.reviewSystem', ov),
            user: WfCore.sbReviewUser(shots, ctxBase.styleText, ov),
            temperature: 0.4, max_tokens: 1800, projectId: p.id, mockKind: 'sbReview',
          });
          return WfCore.sbReviewNormalize(r.parsed);
        };
        let shots, plans = [];
        if (planN > 1) {
          // 多方案:逐套 gen+评审打分(headless 自动择优——浏览器 quiet 同语义,对比留痕 ep.sbPlans 可回看官换)
          for (const lb of ['A', 'B', 'C'].slice(0, planN)) {
            const sh = await genShots(null, 'gen' + lb);
            let score = null, comments = [];
            try { const rv = await reviewShots(sh, 'rev' + lb); score = rv.score; comments = rv.comments; } catch (e) { /* 评审失败不影响采用(该步已退费) */ }
            plans.push({ label: lb, shots: sh, score, comments });
          }
          const best = plans.slice().sort((x, y) => (y.score || 0) - (x.score || 0))[0];
          plans.forEach(x => x.adopted = x === best);
          shots = best.shots;
        } else {
          shots = await genShots(null, 'gen1');
          // 生成后自动评审修订(与浏览器 sbAutoFix 同口径):<90 分按评审意见重拆,最多 2 轮
          if (c.sbAutoFix !== false && b.sbAutoFix !== false) {
            for (let round = 1; round <= 2; round++) {
              let rv;
              try { rv = await reviewShots(shots, 'rev' + round); } catch (e) { break; } // 评审中断按当前版本发布
              if (rv.score >= 90 || round >= 2) break;
              shots = await genShots('综合评分 ' + rv.score + ' 分,评审意见:\n' + rv.comments.map(x => x.role + ':' + x.text).join('\n'), 'gen' + (round + 1));
            }
          }
        }
        // 发布(与 publishLLMShots 同语义:整表覆盖前留档 ≤8 版 → 覆盖 → 剧本/图谱版本戳)
        if (ep.shots && ep.shots.length) {
          ep.shotHistory = ep.shotHistory || [];
          ep.shotHistory.unshift({
            id: uid('sv'), time: nowStr(), label: '覆盖前:' + ((ep.shots[0].history && ep.shots[0].history[0] && ep.shots[0].history[0].model) || '旧分镜'),
            shots: JSON.parse(JSON.stringify(ep.shots)), sourceRev: ep.shotsSourceRev, graphRev: ep.shotsGraphRev,
          });
          if (ep.shotHistory.length > 8) ep.shotHistory.length = 8;
        }
        ep.shots = shots;
        ep.status = 'storyboarded';
        ep.composed = false;
        ep.shotsSourceRev = ep.contentRev || 0;
        ep.shotsGraphRev = ep.graphRev || 0;
        ep.sbPlans = plans.length
          ? plans.map(pl => ({ id: uid('pl'), label: pl.label, score: pl.score, comments: pl.comments, shots: pl.shots, model: c.sbModel, contentRev: ep.contentRev || 0, time: nowStr(), adopted: !!pl.adopted }))
          : [];
        const rev = wfSave(user.id, cur, tree);
        return ok(res, { rev, shots: shots.length, plans: plans.length, adopted: plans.length ? (plans.find(x => x.adopted) || {}).label : undefined });
      } catch (e) {
        return fail(res, e.httpStatus || 502, e.message || '智能分镜生成失败', e.httpStatus || 502);
      } finally { rateLimitDone(user.id); }
    }

    if (pathname === '/api/wf/smart-review' && req.method === 'POST') {
      if (!CONFIG.apiKey && !(process.env.MOCK_LLM === '1' || CONFIG.mockLlm)) return fail(res, 503, '服务端未配置 LLM key,请创建 config.json 并填入 apiKey', 503);
      if (!rateLimitOk(user.id)) return fail(res, 429, '请求过于频繁,请稍候', 429);
      try {
        const b = await readJSONBody(req, 1024 * 1024);
        const { cur, tree, p, ep } = wfLoadCtx(user.id, String(b.pid || ''), String(b.epid || ''));
        if (!p) return fail(res, 404, '项目不存在', 404);
        if (!ep) return fail(res, 404, '分集不存在', 404);
        const st = (tree && tree.settings) || {};
        const ov = st.promptOverrides;
        // 可审镜=已出片且非终稿非在飞(与 autoSmartReview 目标口径一致);
        // shotIds 子集复审(CLI produce 修订重抽后只复审低分镜,结果合并进上次整集报告)
        const subsetIds = Array.isArray(b.shotIds) && b.shotIds.length ? new Set(b.shotIds.map(String)) : null;
        let targets = (ep.shots || []).filter(s => !s.final && Domain.shotVideoReady(s, true) && !(s.video && s.video.status === 'generating'));
        if (subsetIds) targets = targets.filter(s => subsetIds.has(s.id));
        if (!targets.length) return fail(res, 400, subsetIds ? '指定镜头均不可审(需已出片且非终稿)' : '没有可审片的已出片镜头(需先生成视频)', 400);
        const opBase = sanitizeOpId(b.operationId) || uid('wfrv');
        const reviewCtx = {
          kbReviewText: KB.reviewBlock(), tplReviewText: st.tplReview || '', directorNote: WfCore.directorNote(st.directorSetting), styleText: Domain.styleOf(p),
          personaNote: WfCore.personaNote(ExpertsData.expertOf(st.hiredExpert, tree.customExperts)), // 雇佣专家方法论(与浏览器 review.js 委托点同源)
        };
        const reports = [], failed = [];
        for (const s of targets) {
          const opId = opBase + '_s' + (s.order + 1); // 每镜独立 operation(与前端逐镜计费口径一致)
          const rctx = Object.assign({}, reviewCtx, { memText: WfCore.memBlock(tree.agentMemory, s.plot || '', '成片') }); // 协作记忆逐镜召回(成片板块,与浏览器同算法)
          // 画面:当前视频首帧优先(与被审对象同源);/uploads/ 路径服务端直读转 base64(与前端 fetch+FileReader 同义)
          let dataUrl = null;
          const img = (s.video && s.video.frame) || s.image;
          if (img && String(img).startsWith('data:')) dataUrl = img;
          else if (img && String(img).startsWith('/uploads/')) {
            const ap = localUploadPath(String(img), user.id);
            if (ap) {
              try {
                const ext = path.extname(ap).slice(1).toLowerCase();
                const mime = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp' }[ext] || 'image/png';
                dataUrl = `data:${mime};base64,` + fs.readFileSync(ap).toString('base64');
              } catch (_) { /* 读图失败回退纯文本评审 */ }
            }
          }
          let report = null, lastErr = null;
          if (dataUrl) {
            for (const model of WfCore.VISION_MODELS) { // 视觉模型链逐个尝试(与前端同序;失败步已退费,换模型重扣)
              try {
                const r = await wfLLM(user.id, {
                  action: 'llm.review', reason: '审片:镜头' + (s.order + 1), opId, step: 'main', wfName: 'smart-review',
                  model, system: Prompts.get('review.system', ov),
                  messages: [{ role: 'user', content: [{ type: 'text', text: WfCore.buildReviewPrompt(p, ep, s, true, rctx) }, { type: 'image_url', image_url: { url: dataUrl } }] }],
                  temperature: 0.3, max_tokens: 2500, projectId: p.id, mockKind: 'shotReview',
                });
                report = WfCore.normalizeReport(r.parsed, p, ep, s, model, 'vision', { uid, now: nowStr });
                break;
              } catch (e) { lastErr = e; }
            }
          } else {
            try {
              const r = await wfLLM(user.id, {
                action: 'llm.review', reason: '审片:镜头' + (s.order + 1), opId, step: 'main', wfName: 'smart-review',
                model: st.defLLM || 'qwen-turbo', system: Prompts.get('review.system', ov),
                user: WfCore.buildReviewPrompt(p, ep, s, false, rctx),
                temperature: 0.3, max_tokens: 2500, projectId: p.id, mockKind: 'shotReview',
              });
              report = WfCore.normalizeReport(r.parsed, p, ep, s, r.model || 'text', 'text', { uid, now: nowStr });
            } catch (e) { lastErr = e; }
          }
          if (!report) { failed.push({ shotId: s.id, order: s.order + 1, error: String((lastErr && lastErr.message) || '评审失败').slice(0, 80) }); continue; }
          // 版本绑定:记录审片时的视频输入指纹/地址(镜头重生成后旧报告判"旧版")
          report.videoInputHash = (s.video && s.video.inputHash) || '';
          report.videoUrl = (s.video && s.video.url) || '';
          report.reviewedAt = Date.now();
          s.reviews = s.reviews || [];
          s.reviews.unshift(report);
          s.reviews = s.reviews.slice(0, 5);
          s.history = s.history || [];
          s.history.unshift({ type: '审片 ' + report.score + ' 分', model: report.model, time: report.time });
          reports.push({ shot: s, report });
        }
        if (!reports.length) return fail(res, 502, '全部镜头评审失败(已逐步退费):' + ((failed[0] || {}).error || '未知原因'), 502);
        // 共性汇总 + 四维成片评审(单步失败不拖垮整单:该步已退费,如实标 null 并回执错误);
        // 子集复审沿用上次整集共性/四维结论(只更新逐镜分,不重复扣汇总费)
        const prev = subsetIds && ep.lastReview ? ep.lastReview : null;
        let common = null, cut = null, sumErr, cutErr;
        if (prev) { common = prev.common || null; cut = prev.cut || null; }
        else {
          try {
            const r = await wfLLM(user.id, { action: 'llm.review', reason: '整集共性汇总(' + ep.title + ')', opId: opBase + '_sum', step: 'main', wfName: 'smart-review', model: st.defLLM || 'qwen-turbo', system: '你是短剧审片总监。', user: WfCore.buildSumUser(reports), temperature: 0.4, max_tokens: 1200, projectId: p.id, mockKind: 'sum' });
            common = WfCore.normalizeSum(r.parsed);
          } catch (e) { sumErr = e.message; }
          try {
            const r = await wfLLM(user.id, { action: 'llm.review', reason: '四维成片评审(' + ep.title + ')', opId: opBase + '_cut', step: 'main', wfName: 'smart-review', model: st.defLLM || 'qwen-turbo', system: Prompts.get('review.finalSystem', ov), user: WfCore.buildCutUser(WfCore.buildCutBrief(ep, reports)), temperature: 0.3, max_tokens: 1500, projectId: p.id, mockKind: 'cut' });
            cut = WfCore.normalizeCut(r.parsed);
          } catch (e) { cutErr = e.message; }
        }
        // 逐镜分合并:子集复审只替换被复审镜的条目,其余沿用上次(整集均分按合并后口径)
        const newPer = reports.map(x => ({ shotId: x.shot.id, order: x.shot.order, score: x.report.score, reportId: x.report.id, videoInputHash: x.report.videoInputHash || '' }));
        const perShot = prev
          ? (prev.perShot || []).filter(x => !newPer.some(y => y.shotId === x.shotId) && (ep.shots || []).some(s2 => s2.id === x.shotId)).concat(newPer).sort((a, b2) => a.order - b2.order)
          : newPer;
        const avg = Math.round(perShot.reduce((a, x) => a + x.score, 0) / perShot.length * 10) / 10;
        // lastReview 与浏览器 openEpisodeReview 同构(快照哈希/sourceRev/graphRev 同口径判旧)
        ep.lastReview = {
          time: nowStr(), avg,
          snapshotHash: WfCore.reviewSnapshotHashOf(ep),
          sourceRev: ep.contentRev || 0,
          graphRev: ep.graphRev || 0,
          perShot,
          common, cut,
        };
        const rev = wfSave(user.id, cur, tree);
        return ok(res, {
          rev, avg, reviewed: reports.length, failed,
          // 低分镜带 shotId 与修正意见串(fixes):CLI produce 据此修订提示词后 shotIds 子集重抽+复审;
          // 合并口径下未复审的历史低分镜同样在列(fixes 仅新报告可给)
          lowShots: perShot.filter(x => x.score < 7).map(x => {
            const fresh = reports.find(y => y.shot.id === x.shotId);
            return { shotId: x.shotId, order: x.order + 1, score: x.score, fixes: fresh ? WfCore.reviewFixes(fresh.report) : undefined };
          }),
          common, cut, sumErr: sumErr || undefined, cutErr: cutErr || undefined,
        });
      } catch (e) {
        return fail(res, e.httpStatus || 502, e.message || '智能审片失败', e.httpStatus || 502);
      } finally { rateLimitDone(user.id); }
    }

    return fail(res, 404, '接口不存在');
  } catch (e) {
    if (e.message === '请求体过大') {
      res.on('finish', () => req.destroy()); // 等 413 响应体发完再断开,避免客户端收不到响应
      return fail(res, 413, '请求体过大(>120MB)');
    }
    if (e && e.httpStatus) return fail(res, e.httpStatus, e.message || '请求处理失败', e.httpStatus); // 业务语义错误(非法 JSON/上游非 JSON 等)
    console.error('[server] 未预期错误:', e); // 系统类异常(fs 路径等内部细节)只进日志,不透给客户端
    return fail(res, 500, '服务器内部错误,请稍后重试', 500);
  }
});

server.listen(PORT, CONFIG.host || '127.0.0.1', () => {
  console.log(`[虎鲸漫剧] 本地后端 v${VERSION} 已启动`);
  console.log(`  地址:     http://localhost:${PORT}(监听 ${CONFIG.host || '127.0.0.1'};外部访问需在 config.json 设 host:'0.0.0.0')`);
  console.log(`  数据目录: ${DATA_DIR}`);
  console.log(`  上传目录: ${UPLOADS_DIR}(配额 ${CONFIG.uploadQuotaMB}MB/人)`);
  console.log(`  LLM 上游: ${CONFIG.baseUrl}(超时 ${CONFIG.llmTimeoutMs}ms,注册${CONFIG.registerOpen ? '开放' : '关闭'})`);
  console.log(`  生图/视频: ${CONFIG.volcBaseUrl}(${CONFIG.volcApiKey ? '已配置 volcApiKey' : '未配置 volcApiKey,/api/volc/* 返回 503'})`);
});

/* ---------- 进程级异常兜底(二十轮) ---------- */
// 未捕获异常/Promise 拒绝只记录不退出:一次流错误/回调抛错不再拖垮全进程(在途付费操作变 executing 残留)
process.on('uncaughtException', e => { console.error('[server] uncaughtException:', e); });
process.on('unhandledRejection', e => { console.error('[server] unhandledRejection:', e); });

/* ---------- 优雅退出 ---------- */
function shutdown(sig) {
  console.log(`\n[server] 收到 ${sig},正在保存会话并退出…`);
  flushSessions();
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 1500);
}
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
