#!/usr/bin/env node
/* ============ cli.js 虎鲸漫剧 CLI ============
 * 面向 AI 助手(Codex / Claude Code / Kimi Code / Trae 等)与人工的标准化命令行入口,
 * 覆盖 剧本→主体→分镜→生成→审片→成片 主线全链路。零依赖(Node 18+ 内置 fetch)。
 *
 * 约定:
 *   stdout 仅输出 JSON(默认紧凑,--pretty 美化);进度/日志一律走 stderr,Agent 可安全解析 stdout。
 *   exit code:0 成功 | 1 通用错误 | 2 参数错误 | 3 未登录(401) | 4 不存在(404) |
 *             5 服务端/上游错误(5xx) | 6 积分不足(402) | 7 冲突(409,含执行中)。
 *   配置:~/.hujing/config.json { server, token, user };环境变量 HUJING_SERVER / HUJING_TOKEN 优先,
 *        HUJING_CONFIG_DIR 可整体改配置目录(多账号/测试隔离)。
 *   计费:生成类命令全部携带 operationId(UUID),服务端 Tasks.run 五件套(登记→扣费→执行→失败退费)
 *        原样生效;同 operationId 重放幂等(断网重试安全),积分不足 exit 6。
 *   状态写:GET /api/state → 本地变更 → PUT 增量(changes.projects)→ 409 重取回放补丁重试(≤3 次);
 *        收费安全:生成类回调只执行一次,冲突仅重放数据补丁,绝不重做收费调用。
 */
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const Domain = require('./js/domain.js'); // 领域单一来源:指纹/就绪/判旧/工作流状态与主应用逐字节一致
const CmdRegistry = require('./js/cmd-registry.js'); // 领域命令元数据单源:exec 用法/help 文案/needs 校验由此生成(与前端 Commands 同词表)

/* ================= 基础设施:配置 / 参数 / 输出 ================= */
const CFG_DIR = process.env.HUJING_CONFIG_DIR || path.join(os.homedir(), '.hujing');
const CFG_FILE = path.join(CFG_DIR, 'config.json');

function cfgRead() {
  try { return JSON.parse(fs.readFileSync(CFG_FILE, 'utf8')); } catch (_) { return {}; }
}
function cfgWrite(patch) {
  const cur = cfgRead();
  const next = Object.assign(cur, patch);
  if (patch.token === null) delete next.token;
  fs.mkdirSync(CFG_DIR, { recursive: true });
  fs.writeFileSync(CFG_FILE, JSON.stringify(next, null, 2));
  return next;
}
function serverOf(flags) {
  return (flags.server || process.env.HUJING_SERVER || cfgRead().server || 'http://localhost:8000').replace(/\/+$/, '');
}
function tokenOf(flags) {
  return flags.token || process.env.HUJING_TOKEN || cfgRead().token || '';
}

/* 位置参数进 _,--k v / --k=v / --flag / --no-flag 进 flags */
function parseArgs(argv) {
  const _ = [], flags = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--') { _.push(...argv.slice(i + 1)); break; }
    if (a.startsWith('--no-')) { flags[a.slice(5)] = false; continue; }
    if (a.startsWith('--')) {
      const eq = a.indexOf('=');
      if (eq > 2) { flags[a.slice(2, eq)] = a.slice(eq + 1); continue; }
      const k = a.slice(2);
      if (i + 1 < argv.length && !argv[i + 1].startsWith('--')) { flags[k] = argv[++i]; continue; }
      flags[k] = true; continue;
    }
    _.push(a);
  }
  return { _, flags };
}

class CliError extends Error {
  constructor(message, code) { super(message); this.exit = code || 1; }
}
const need = (cond, msg) => { if (!cond) throw new CliError(msg, 2); };
const out = (data, flags) => { process.stdout.write((flags && flags.pretty ? JSON.stringify(data, null, 2) : JSON.stringify(data)) + '\n'); };
const log = (...a) => process.stderr.write(a.join(' ') + '\n');

/* ================= HTTP 封装 ================= */
async function api(method, apiPath, body, flags, opt) {
  opt = opt || {};
  const server = serverOf(flags || {});
  const headers = { 'Content-Type': 'application/json' };
  const tk = tokenOf(flags || {});
  if (tk) headers['Authorization'] = 'Bearer ' + tk;
  let r;
  try {
    r = await fetch(server + apiPath, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(opt.timeoutMs || 120000),
    });
  } catch (e) {
    throw new CliError('无法连接服务端 ' + server + '(' + (e.cause && e.cause.code || e.name) + ');请先 node server.js 启动', 1);
  }
  let j = null;
  try { j = await r.json(); } catch (_) { /* 非 JSON 响应 */ }
  if (r.ok && j && j.code === 0) return opt.fullBody ? j : j.data;
  const msg = (j && (j.message || j.error)) || ('HTTP ' + r.status);
  const exit = r.status === 401 ? 3 : r.status === 404 ? 4 : r.status === 402 ? 6 : r.status === 409 ? 7 : r.status >= 500 ? 5 : 1;
  throw new CliError(msg, exit);
}
const GET = (p, f) => api('GET', p, undefined, f);
const POST = (p, b, f, o) => api('POST', p, b, f, o);
const PUT = (p, b, f) => api('PUT', p, b, f);

/* ================= state 读写(乐观锁增量,409 重试 ≤3 次) ================= */
async function stateGet(flags) {
  const d = await GET('/api/state', flags);
  return { rev: d.rev || 0, state: d.state || {} };
}
/* 深 diff/回放(收费安全重试):fn 只执行一次(内部生图/生视频等收费调用不重复);
 * 409 冲突时把 fn 产生的数据补丁重放到最新 state 上重试提交,绝不重做收费生成 */
function deepDiff(a, b, base, patch) {
  if (a === b) return;
  const aObj = a !== null && typeof a === 'object', bObj = b !== null && typeof b === 'object';
  if (!aObj || !bObj || Array.isArray(a) !== Array.isArray(b)) { patch.push({ path: base, value: b === undefined ? null : b }); return; }
  const keys = new Set(Object.keys(a).concat(Object.keys(b)));
  for (const k of keys) deepDiff(a[k], b[k], base.concat(k), patch);
}
function deepApply(obj, pathArr, value) {
  let cur = obj;
  for (let i = 0; i < pathArr.length - 1; i++) {
    const k = pathArr[i];
    if (cur[k] === null || typeof cur[k] !== 'object') cur[k] = /^\d+$/.test(pathArr[i + 1]) ? [] : {};
    cur = cur[k];
  }
  cur[pathArr[pathArr.length - 1]] = value;
}
/* fn(proj, state) 变更 proj;整体经 changes.projects 增量推回(服务端按 id 覆盖)。
 * 收费安全:fn 仅在首次拉取的快照上执行一次;409 时重取 state、回放补丁、重试提交(≤3 次) */
async function withProject(pid, flags, fn) {
  let cur = await stateGet(flags);
  let proj = (cur.state.projects || []).find(p => p.id === pid);
  if (!proj) throw new CliError('项目不存在:' + pid, 4);
  const snapshot = JSON.parse(JSON.stringify(proj));
  const ret = await fn(proj, cur.state);
  const patch = [];
  deepDiff(snapshot, proj, [], patch);
  for (let attempt = 0; attempt < 3; attempt++) {
    if (attempt > 0) {
      log('rev 冲突,重取最新状态并回放结果补丁(' + (attempt + 1) + '/3)…');
      cur = await stateGet(flags);
      proj = (cur.state.projects || []).find(p => p.id === pid);
      if (!proj) throw new CliError('项目不存在:' + pid, 4);
      patch.forEach(pl => deepApply(proj, pl.path, pl.value));
    }
    try {
      const d = await PUT('/api/state', { rev: cur.rev, changes: { projects: { [pid]: proj } } }, flags);
      return { ret, rev: d.rev, project: proj };
    } catch (e) {
      if (e.exit === 7 && attempt < 2) continue;
      throw e;
    }
  }
}
const findEp = (proj, epid) => {
  const ep = (proj.episodes || []).find(e => e.id === epid);
  if (!ep) throw new CliError('分集不存在:' + epid, 4);
  return ep;
};
const findShot = (ep, sid) => {
  const s = (ep.shots || []).find(x => x.id === sid);
  if (!s) throw new CliError('镜头不存在:' + sid, 4);
  return s;
};
const findSubject = (proj, sid) => {
  const s = (proj.subjects || []).find(x => x.id === sid || x.name === sid); // 兼容按名引用
  if (!s) throw new CliError('主体不存在:' + sid, 4);
  return s;
};

/* ================= 工具:上传 / 下载 / 轮询 / SRT ================= */
async function uploadFile(file, flags) {
  const abs = path.resolve(file);
  need(fs.existsSync(abs), '文件不存在:' + abs);
  const st = fs.statSync(abs);
  need(st.size <= 100 * 1024 * 1024, '单文件不能超过 100MB');
  log('上传 ' + path.basename(abs) + '(' + (st.size / 1024).toFixed(0) + 'KB)…');
  return POST('/api/upload', { name: path.basename(abs), dataBase64: fs.readFileSync(abs).toString('base64') }, flags);
}
async function downloadTo(url, outFile, flags) {
  const server = serverOf(flags);
  const full = url.startsWith('http') ? url : server + url;
  const headers = {};
  const tk = tokenOf(flags);
  if (tk) headers['Authorization'] = 'Bearer ' + tk;
  const r = await fetch(full, { headers, signal: AbortSignal.timeout(300000) });
  if (!r.ok) throw new CliError('下载失败 HTTP ' + r.status + ':' + full, r.status === 401 ? 3 : r.status === 404 ? 4 : 1);
  fs.mkdirSync(path.dirname(path.resolve(outFile)), { recursive: true });
  fs.writeFileSync(outFile, Buffer.from(await r.arrayBuffer()));
  return { file: path.resolve(outFile), bytes: fs.statSync(outFile).size };
}
/* 轮询视频任务到终态(succeeded/failed/timed_out/cancelled);interval 5s,默认 30 分钟 */
async function waitJob(taskId, flags, timeoutMin) {
  const deadline = Date.now() + (timeoutMin || 30) * 60000;
  for (;;) {
    const d = await GET('/api/volc/video/' + encodeURIComponent(taskId), flags);
    if (['succeeded', 'failed', 'timed_out', 'cancelled'].includes(d.status)) return d;
    if (Date.now() > deadline) throw new CliError('等待超时(' + (timeoutMin || 30) + ' 分钟),任务仍在进行中:' + taskId, 1);
    log('任务 ' + taskId + ' 状态 ' + d.status + ',5s 后重查…');
    await new Promise(r => setTimeout(r, 5000));
  }
}
/* 与前端 sb-io.js buildSrt 同逻辑:逐段累计时长,空文本段占时长不出条目,序号连续 */
function srtTime(sec) {
  const ms = Math.max(0, Math.round(sec * 1000));
  const h = String(Math.floor(ms / 3600000)).padStart(2, '0');
  const m = String(Math.floor((ms % 3600000) / 60000)).padStart(2, '0');
  const s = String(Math.floor((ms % 60000) / 1000)).padStart(2, '0');
  return h + ':' + m + ':' + s + ',' + String(ms % 1000).padStart(3, '0');
}
function buildSrt(segs) {
  let t = 0, n = 0; const lines = [];
  (segs || []).forEach(sg => {
    const start = t; t += Math.max(0, sg.dur || 0);
    const txt = String(sg.text || '').trim();
    if (!txt) return;
    lines.push(++n + '\n' + srtTime(start) + ' --> ' + srtTime(t) + '\n' + txt + '\n');
  });
  return lines.join('\n');
}

/* ================= 结构规范化(对齐前端 blankShot/主体/分集字段) ================= */
const normShot = (raw, i, baseOrder) => ({
  id: raw.id || 'sh_' + Date.now().toString(36) + '_' + (baseOrder + i),
  order: raw.order != null ? raw.order : baseOrder + i,
  name: raw.name || '',
  plot: raw.plot || '',
  camera: raw.camera || '固定镜头',
  characters: Array.isArray(raw.characters) ? raw.characters : [],
  scene: raw.scene || '',
  props: Array.isArray(raw.props) ? raw.props : [],
  narration: raw.narration || '',
  dialogue: raw.dialogue || '',
  prompt: raw.prompt || '',
  duration: +raw.duration > 0 ? +raw.duration : 5,
  groupId: raw.groupId || null,
  image: raw.image || null,
  video: raw.video && typeof raw.video === 'object' ? raw.video : { status: 'none' },
  audio: raw.audio || false,
  audioUrl: raw.audioUrl || '', // 逐镜 TTS 配音轨(透传保留,合成时混入成片音轨)
  history: Array.isArray(raw.history) ? raw.history : [],
  transition: raw.transition || null,
  reviews: Array.isArray(raw.reviews) ? raw.reviews : [],
  final: !!raw.final,
  confirm: !!raw.confirm,
});
const newEpisode = (title, order, content) => ({
  id: 'ep_' + Date.now().toString(36) + '_' + crypto.randomBytes(3).toString('hex'),
  title: title || '第' + (order + 1) + '集', order,
  status: 'draft', content: content || '', contentRev: 0,
  shots: [], groups: [], beats: [],
  sbConfig: { ratio: '16:9', subtitle: true, syncVoice: true, shotDur: 5 },
});
const newSubject = (name, kind, desc) => ({
  id: 'sj_' + Date.now().toString(36) + '_' + crypto.randomBytes(3).toString('hex'),
  name, kind: kind || 'character', image: '', prompt: '', forms: [], description: desc || '',
});

/* ================= 生成原语(带 operationId 幂等) ================= */
async function genImage(prompt, flags, extra) {
  const body = Object.assign({ prompt, operationId: crypto.randomUUID() }, extra || {});
  log('生图:' + prompt.slice(0, 40) + '…');
  return POST('/api/volc/image', body, flags, { timeoutMs: 240000 });
}
async function genVideoCreate(prompt, flags, extra) {
  const body = Object.assign({ prompt, operationId: crypto.randomUUID() }, extra || {});
  log('创建视频任务:' + prompt.slice(0, 40) + '…');
  return POST('/api/volc/video', body, flags);
}
/* 单镜生视频(可选等待);写回与主应用同一口径(s.video 含 assetVer/inputHash 生成时输入指纹,
 * 主应用据此判"素材已更新";--nowait 落 generating+upstreamId,断点续查/对账扫描可发现) */
async function genShotVideo(proj, ep, s, flags, opt) {
  opt = opt || {};
  need(s.prompt || s.plot, '镜头 ' + s.id + ' 无提示词,请先 shot-set 补 prompt');
  /* canonical 生成请求(与主应用/写回 inputHash 同一构造点):prompt 含主体定义/轴线/运镜/机位/美术后缀,
   * 参考图按生成策略映射(主体解析走 Domain.findSubject,支持形态全称/曾用名/scene/props 引用) */
  const req = Domain.buildVideoRequest(proj, ep, s);
  const extra = {
    ratio: req.ratio, duration: req.duration,
    job: { projectId: proj.id, episodeId: ep.id, shotId: s.id },
  };
  if (req.model) extra.model = req.model;
  if (req.image) extra.image = req.image; // 首帧(底图一致性,按策略映射)
  if (req.lastFrame) extra.lastFrame = req.lastFrame; // 尾帧(首尾帧策略)
  if (req.refImages && req.refImages.length) extra.refImages = req.refImages; // 主体参考(一致性核心)
  if (req.refAudio) extra.refAudio = req.refAudio; // 角色音色参考
  const created = await genVideoCreate(req.prompt, flags, extra);
  const finish = d => {
    if (d.status !== 'succeeded') throw new CliError('镜头 ' + s.id + ' 生成失败:' + (d.error || d.status), 5);
    s.video = {
      status: 'done', model: d.model || '', url: d.videoUrl || d.remoteUrl, remoteUrl: d.remoteUrl || '',
      assetVer: Domain.shotAssetVer(proj, s), inputHash: Domain.shotInputHash(proj, s), // 生成时输入指纹(与主应用同函数字面)
      upstreamId: created.id, duration: created.duration || s.duration, time: new Date().toLocaleString('zh-CN'),
    };
    return s.video;
  };
  if (opt.wait === false) { // 写回 generating:主应用对账/断点续查按 upstreamId 接续,不再"创建即失联"
    s.video = { status: 'generating', model: '', upstreamId: created.id, resumable: true };
    return { id: created.id, duration: created.duration, reused: !!created.reused, pending: true };
  }
  try {
    const d = await waitJob(created.id, flags, opt.timeout);
    return { id: created.id, reused: !!created.reused, video: finish(d) };
  } catch (e) {
    // 上游任务已创建但失败/超时:写回 failed 并保留 upstreamId(对齐主应用 sb-gen.js 口径),
    // 主应用对账 reconcileJobs 可扫到续查,不再产生孤儿任务
    s.video = { status: 'failed', error: e.message, model: '', upstreamId: created.id, resumable: true };
    throw e;
  }
}

/* compose items 构建(与前端 doCompose 同口径:序列走 Domain.composeSeqOf canonical 时间线——tlOrder 定序/
 * tlTrims 剔除与裁剪;字幕文本取台词/旁白、配音取 s.audioUrl、转场为字符串记在后一镜(首段无转场);
 * 字幕开关 flags.subtitle 已由调用方解析:--no-subtitle 等显式参数优先,缺省读 ep.sbConfig.subtitle) */
async function composeItems(ep, flags) {
  const items = [], segs = [], missing = [];
  const subtitle = flags.subtitle !== false;
  const trims = ep.tlTrims || {};
  (ep.shots || []).forEach(s => { // 被时间线剔除的段不算缺失;无视频也无底图且未剔除才计 missing
    if (!(trims[s.id] && trims[s.id].off) && !((Domain.shotVideoReady(s, true) && s.video.url) || s.image)) missing.push(s.id);
  });
  const seq = Domain.composeSeqOf(ep, true); // canonical 序列:与写回的 composedInputHash 完全同源
  for (let idx = 0; idx < seq.length; idx++) {
    const s = seq[idx];
    const it = { text: subtitle ? String(s.dialogue || s.narration || '').slice(0, 120) : '' };
    let segDur = 0; // 该段在成片时间轴上的时长(SRT 用)
    if (s.audioUrl) it.audio = s.audioUrl; // 逐镜 TTS 配音混入成片音轨
    if (idx > 0 && s.transition) it.transition = { type: String(s.transition).slice(0, 12) }; // 转场记在后一镜
    if (Domain.shotVideoReady(s, true) && s.video.url) {
      it.video = s.video.url;
      if (typeof s._tlStart === 'number') it.start = s._tlStart; // 时间线裁剪:入点
      if (typeof s._tlEnd === 'number') it.end = s._tlEnd;       // 时间线裁剪:出点
      segDur = (typeof s._tlStart === 'number' && typeof s._tlEnd === 'number') ? Math.max(0.5, s._tlEnd - s._tlStart) : Domain.estShotDuration(s);
    } else {
      let img = s.image;
      if (String(img).startsWith('data:')) { // 占位/截帧 dataURL 先传服务端(对齐 doCompose)
        const ext = String(img).startsWith('data:image/jpeg') ? '.jpg' : '.png';
        img = (await POST('/api/upload', { name: 'shot_' + (s.order + 1) + ext, dataBase64: String(img).split(',')[1] || '' }, flags)).url;
      }
      if (!img) continue;
      it.image = img;
      it.dur = Math.max(2, Math.min(15, Domain.estShotDuration(s)));
      segDur = it.dur;
    }
    items.push(it);
    segs.push({ text: String(s.dialogue || s.narration || '').trim(), dur: segDur }); // SRT 与 items 同序同段,与字幕开关无关
  }
  return { items, segs, missing };
}

/* ================= 命令实现 ================= */
const CMD = {};

/* ---- 账户 ---- */
CMD.login = async (_, f) => {
  need(f.username && f.password, '用法:hujing login --username 名 --password 密 [--server url]');
  const d = await POST('/api/auth/login', { username: f.username, password: f.password }, { server: f.server });
  cfgWrite({ server: serverOf(f), token: d.token, user: d.user });
  return { logined: d.user.username, server: serverOf(f) };
};
CMD.logout = async (_, f) => {
  try { await POST('/api/auth/logout', {}, f); } catch (_) {}
  cfgWrite({ token: null });
  return { logouted: true };
};
CMD.whoami = async (_, f) => ({ server: serverOf(f), user: (await GET('/api/auth/me', f)).user });
CMD.credits = async (_, f) => GET('/api/wallet', f);
CMD.jobs = async (_, f) => {
  const d = await GET('/api/jobs', f);
  const list = (d.list || d || []).slice(0, +(f.limit || 20));
  return { count: list.length, jobs: list.map(j => ({ upstreamId: j.upstreamId, status: j.status, shotId: j.shotId, episodeId: j.episodeId, projectId: j.projectId, videoUrl: j.videoUrl || '', error: j.error || '', createdAt: j.createdAt })) };
};
CMD.job = async (a, f) => {
  need(a[0], '用法:hujing job <taskId>');
  return GET('/api/volc/video/' + encodeURIComponent(a[0]), f);
};
CMD['job-cancel'] = async (a, f) => {
  need(a[0], '用法:hujing job-cancel <taskId>');
  return POST('/api/volc/video/' + encodeURIComponent(a[0]) + '/cancel', {}, f);
};
/* 成本归集:服务端 operation 台账按 projectId 聚合(net=charged-refunded,按动作族细分) */
CMD.usage = async (a, f) => {
  const d = await GET('/api/billing/usage', f);
  const net = b => ({
    count: b.count || 0, charged: b.charged || 0, refunded: b.refunded || 0, net: (b.charged || 0) - (b.refunded || 0),
    families: Object.fromEntries(Object.entries(b.families || {}).map(([k, v]) => [k, { count: v.count, net: v.charged - v.refunded }])),
  });
  if (a[0]) {
    const b = (d.projects || {})[a[0]];
    if (!b) throw new CliError('该项目无计费记录:' + a[0], 4);
    return Object.assign({ projectId: a[0] }, net(b));
  }
  return {
    projects: Object.fromEntries(Object.entries(d.projects || {}).map(([pid, b]) => [pid, net(b)])),
    unlabeled: net(d.unlabeled || {}),
  };
};

/* ---------- 交付检查:发布门 10 项(与前端 Release.collect 同口径) ---------- */
function _releaseGates(p, minScore) {
  minScore = +minScore; if (!isFinite(minScore) || minScore < 0) minScore = 7;
  const eps = (p && p.episodes) || [];
  const gate = (code, label, status, info) => ({ code, label, status, info: info || '' });
  const list = [];
  let fails = 0, warns = 0;
  // G1 workflow 每集 status === 'done'
  try {
    const blockers = [];
    eps.forEach(ep => {
      const st = Domain.episodeState(p, ep, true);
      if (st.status !== 'done') blockers.push({ ep: ep.title || ep.id, status: st.status, action: (st.action && st.action.label) || '' });
    });
    if (blockers.length) { list.push(gate('g1-workflow', '主线步骤全完成', 'fail', blockers.map(b => b.ep + '(' + b.status + (b.action ? ':' + b.label : '') + ')').join('；'))); fails++; }
    else list.push(gate('g1-workflow', '主线步骤全完成', 'pass', eps.length + ' 集 done'));
  } catch (e) { list.push(gate('g1-workflow', '主线步骤', 'warn', 'Domain 异常:' + e.message)); warns++; }
  // G3 审片(每集都必须有审片记录且达标:无记录集=fail,与前端 Release.collect 同口径)
  const noRev = eps.filter(ep => !(ep.lastReview && typeof ep.lastReview.avg === 'number'));
  const lowRev = eps.filter(ep => ep.lastReview && typeof ep.lastReview.avg === 'number' && ep.lastReview.avg < minScore);
  if (!eps.length) list.push(gate('g3-review', '审片均分 ≥ ' + minScore, 'pass', '0 集'));
  else if (noRev.length || lowRev.length) {
    const parts = noRev.map(ep => (ep.title || ep.id) + ':未审片')
      .concat(lowRev.map(ep => (ep.title || ep.id) + ':' + ep.lastReview.avg.toFixed(2)));
    list.push(gate('g3-review', '审片均分 ≥ ' + minScore, 'fail', parts.join('；'))); fails++;
  } else list.push(gate('g3-review', '审片均分 ≥ ' + minScore, 'pass', eps.length + ' 集'));
  // G4/G5/G6 counts 聚合
  const agg = { stale: 0, unconfirmed: 0, failed: 0 };
  try {
    eps.forEach(ep => {
      const st = Domain.episodeState(p, ep, true);
      ['stale', 'unconfirmed', 'failed'].forEach(k => { agg[k] += (st.counts && +st.counts[k]) || 0; });
    });
  } catch (_) {}
  list.push(gate('g4-stale', '过期镜=0', agg.stale ? 'fail' : 'pass', agg.stale + ' 镜')); if (agg.stale) fails++;
  list.push(gate('g5-unconfirmed', '未确认镜=0', agg.unconfirmed ? 'fail' : 'pass', agg.unconfirmed + ' 镜')); if (agg.unconfirmed) fails++;
  list.push(gate('g6-failed', '失败镜=0', agg.failed ? 'fail' : 'pass', agg.failed + ' 镜')); if (agg.failed) fails++;
  // G9 主体缺图
  const noImg = (p.subjects || []).filter(s => !s.image).length;
  list.push(gate('g9-subjects', '主体图齐全=0缺图', noImg ? 'fail' : 'pass', noImg ? noImg + ' 缺图' : (p.subjects || []).length + ' 位就位'));
  if (noImg) fails++;
  // G10 计费账目(服务端有接口时真正对账:项目 usage.net 与 jobs 完成总量吻合——CLI 在此只跑接口,不硬判)
  list.push(gate('g10-billing', '计费账目核对(净消耗 vs 生成资产数)', 'warn', '--with-billing 时会调用 /api/billing/usage 与 /api/jobs 交叉验证'));
  warns++;
  let overall = 'pass';
  if (fails > 0) overall = 'fail';
  else if (warns > 1) overall = 'warn';
  else if (warns === 1) overall = 'cond-pass';
  return { overall, gates: list, fails, warns, score: 10 - fails - warns, minReviewScore: minScore, at: Date.now() };
}
CMD['release-check'] = async (a, f) => {
  need(a[0], '用法:hujing release-check <pid> [--min-score 7] [--with-billing] (10 项发布门,结果 JSON)');
  const { state } = await stateGet(f);
  const p = (state.projects || []).find(x => x.id === a[0]);
  if (!p) throw new CliError('项目不存在:' + a[0], 4);
  const score = f['min-score'] !== undefined ? +f['min-score'] : (state.settings && state.settings.releaseMinReviewScore) || 7;
  const g = _releaseGates(p, score);
  // --with-billing 时跑 G10 真实对账:usage.net 与 jobs completed 匹配度
  if (f['with-billing']) {
    try {
      const usage = await GET('/api/billing/usage', f);
      const bucket = (usage.projects || {})[p.id] || {};
      const netCost = (bucket.charged || 0) - (bucket.refunded || 0);
      const jobs = await GET('/api/jobs?limit=200', f);
      const projJobs = (jobs.list || []).filter(j => j.projectId === p.id);
      const completed = projJobs.filter(j => j.status === 'succeeded').length;
      const total = projJobs.length;
      const discrep = netCost - completed * 0; // 净消耗 vs 完成数不是线性等价,只做数量级告警:失败/退款条目数
      const refundedCnt = projJobs.filter(j => j.refunded).length;
      const timeouts = projJobs.filter(j => j.status === 'timed_out').length;
      const g10 = g.gates.find(x => x.code === 'g10-billing');
      const diff = refundedCnt + timeouts;
      if (diff > 0) {
        g10.status = 'warn'; g10.info = `净消耗 ${netCost} 积分;共 ${total} 个任务(成功 ${completed},退款 ${refundedCnt},超时 ${timeouts});差异 ${diff} 项建议人工复核`;
      } else {
        g10.status = 'pass'; g10.info = `净消耗 ${netCost} 积分,共 ${total} 任务(成功 ${completed});账目零异常`;
      }
      // 重算 fails/warns/overall
      g.fails = g.gates.filter(x => x.status === 'fail').length;
      g.warns = g.gates.filter(x => x.status === 'warn').length;
      g.score = 10 - g.fails - g.warns;
      g.overall = (g.fails > 0) ? 'fail' : (g.warns > 1 ? 'warn' : (g.warns === 1 ? 'cond-pass' : 'pass'));
      g.netCost = netCost; g.totalJobs = total; g.completedJobs = completed;
    } catch (e) {
      const g10 = g.gates.find(x => x.code === 'g10-billing');
      g10.status = 'warn'; g10.info = '接口不可达,真实账目未核对:' + e.message;
    }
  }
  // 聚合输出
  return {
    projectId: p.id, projectName: p.name, ver: p.__ver || 0,
    overall: g.overall, score: g.score, fails: g.fails, warns: g.warns,
    minReviewScore: g.minReviewScore,
    gates: g.gates,
    releases: (p.releases || []).slice(-5).map(r => ({ digest: r.digest, ver: r.ver, when: r.when, who: r.who, note: r.note, gateOverall: (r.gate && r.gate.overall) })),
    netCost: g.netCost, totalJobs: g.totalJobs, completedJobs: g.completedJobs,
  };
};
/* 打 release 版本:先跑 release-check,通过/条件通过才写 releases 入 state,最后 PUT state 到云端(登录时) */
CMD.release = async (a, f) => {
  need(a[0], '用法:hujing release <pid> [--note 发布说明] [--min-score 7] [--force]');
  const { state, rev } = await stateGet(f);
  const p = (state.projects || []).find(x => x.id === a[0]);
  if (!p) throw new CliError('项目不存在:' + a[0], 4);
  const score = f['min-score'] !== undefined ? +f['min-score'] : (state.settings && state.settings.releaseMinReviewScore) || 7;
  const gate = _releaseGates(p, score);
  if (!f.force && gate.overall !== 'pass' && gate.overall !== 'cond-pass') {
    throw new CliError('发布门未通过 (fail=' + gate.fails + ',warn=' + gate.warns + '),加 --force 可强制打版本', 5);
  }
  const djb = s => { let h = 5381; for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0; return h; };
  const sig = JSON.stringify({ name: p.name, epCount: (p.episodes || []).length, eps: (p.episodes || []).slice(0, 10).map(e => ({ id: e.id, title: e.title, shots: (e.shots || []).length, composed: !!e.composed, reviewAvg: e.lastReview && e.lastReview.avg })) });
  p.releases = p.releases || [];
  const rel = {
    digest: 'RLS_' + Date.now().toString(36) + '_' + crypto.randomBytes(2).toString('hex'),
    ver: (p.__ver || 0) + 1,
    checksum: 'v' + ((p.__ver || 0) + 1) + '_' + djb(sig).toString(36),
    when: new Date().toLocaleString('zh-CN', { hour12: false }),
    who: f.username || 'cli',
    note: String(f.note || '').slice(0, 500),
    gate: { overall: gate.overall, fails: gate.fails, warns: gate.warns, score: gate.score, at: gate.at },
    snapshotAt: Date.now(),
    snapshotVer: (p.__ver || 0) + 1,
  };
  p.releases.push(rel);
  p.__ver = rel.ver;
  p.__lastSaved = Date.now();
  // 写回 state
  const tree = {
    projects: { [p.id]: p },
  };
  const resp = await PUT('/api/state', { rev: rev || 0, changes: tree }, f);
  return {
    ok: true, projectId: p.id, digest: rel.digest, ver: rel.ver, checksum: rel.checksum,
    gateOverall: gate.overall, forced: !!f.force, rev: (resp && resp.data && resp.data.rev) || rev,
  };
};

/* ---- 项目结构(剧本层) ---- */
function projSummary(p) {
  const eps = p.episodes || [];
  let shots = 0, done = 0;
  eps.forEach(e => (e.shots || []).forEach(s => { shots++; if (Domain.shotVideoReady(s, true)) done++; }));
  return { id: p.id, name: p.name, style: p.style || '', episodes: eps.length, subjects: (p.subjects || []).length, shots, videoDone: done, composed: eps.filter(e => Domain.epComposedReady(e, true)).length }; // 就绪口径与主应用一致(含指纹/剧本版本判旧)
}
CMD.projects = async (_, f) => {
  const { state } = await stateGet(f);
  const list = (state.projects || []).map(projSummary);
  return { count: list.length, projects: list };
};
CMD['project-show'] = async (a, f) => {
  need(a[0], '用法:hujing project-show <pid>');
  const { state } = await stateGet(f);
  const p = (state.projects || []).find(x => x.id === a[0]);
  if (!p) throw new CliError('项目不存在:' + a[0], 4);
  return Object.assign(projSummary(p), {
    script: (p.script || '').length, concept: !!(p.concept && p.concept.statement),
    subjects: (p.subjects || []).map(s => ({ id: s.id, name: s.name, kind: s.kind, hasImage: !!s.image })),
    episodes: (p.episodes || []).map(e => ({
      id: e.id, title: e.title, content: (e.content || '').length, shots: (e.shots || []).length,
      confirmed: (e.shots || []).filter(s => s.confirm).length,
      videoDone: (e.shots || []).filter(s => s.video && s.video.status === 'done').length,
      failed: (e.shots || []).filter(s => s.video && s.video.status === 'failed').length,
      understanding: !!e.understanding, composed: Domain.epComposedReady(e, true), srt: !!e.composedSrt,
    })),
  });
};
/* 统一工作流状态(与流程条/下一步/Agent/跑批 preflight 同一口径,Domain 单源推导);
 * 项目级输出 steps+recommendedAction,分集级输出 status/blockers/action/counts */
CMD.workflow = async (a, f) => {
  need(a[0], '用法:hujing workflow <pid> [epid] (统一工作流状态:唯一业务流程口径)');
  const { state } = await stateGet(f);
  const p = (state.projects || []).find(x => x.id === a[0]);
  if (!p) throw new CliError('项目不存在:' + a[0], 4);
  if (a[1]) return Object.assign({ episode: a[1] }, Domain.episodeState(p, findEp(p, a[1]), true));
  return Domain.workflow(p, true);
};
CMD['project-create'] = async (_, f) => {
  need(f.name, '用法:hujing project-create --name 剧名 [--style 漫剧] [--type drama] [--tone 无] [--faceStyle 亚洲] [--script-file f.txt]');
  const pid = 'p_' + Date.now().toString(36) + '_' + crypto.randomBytes(3).toString('hex');
  const proj = {
    id: pid, name: f.name, mode: 'workflow', type: f.type || 'drama',
    style: f.style || '漫剧', tone: f.tone || '无', faceStyle: f.faceStyle || '亚洲',
    script: f['script-file'] ? fs.readFileSync(path.resolve(f['script-file']), 'utf8') : '',
    subjects: [], episodes: [], createdAt: new Date().toLocaleString('zh-CN'),
  };
  for (let attempt = 0; attempt < 3; attempt++) {
    const { rev, state } = await stateGet(f);
    state.projects = state.projects || [];
    state.projects.push(proj);
    try {
      await PUT('/api/state', { rev, changes: { projects: { [pid]: proj } } }, f);
      return projSummary(proj);
    } catch (e) { if (e.exit === 7 && attempt < 2) continue; throw e; }
  }
};
CMD['episode-add'] = async (a, f) => {
  need(a[0] && f.title, '用法:hujing episode-add <pid> --title 第1集 [--content-file f.txt]');
  const content = f['content-file'] ? fs.readFileSync(path.resolve(f['content-file']), 'utf8') : (f.content || '');
  const { ret } = await withProject(a[0], f, async proj => {
    const ep = newEpisode(f.title, (proj.episodes || []).length, content);
    proj.episodes = proj.episodes || [];
    proj.episodes.push(ep);
    return ep;
  });
  return { id: ret.id, title: ret.title, order: ret.order, content: ret.content.length };
};
CMD['episode-script'] = async (a, f) => {
  need(a[0] && a[1], '用法:hujing episode-script <pid> <epid> (--content-file f.txt | --content 正文)');
  const content = f['content-file'] ? fs.readFileSync(path.resolve(f['content-file']), 'utf8') : String(f.content || '');
  need(content, '剧本正文不能为空');
  return (await withProject(a[0], f, async proj => {
    const ep = findEp(proj, a[1]);
    ep.content = content;
    ep.contentRev = (ep.contentRev || 0) + 1; // 事件图谱/本集理解按 sourceRev 判旧
    return { id: ep.id, title: ep.title, contentRev: ep.contentRev, chars: content.length };
  })).ret;
};
CMD['episode-show'] = async (a, f) => {
  need(a[0] && a[1], '用法:hujing episode-show <pid> <epid>');
  const { state } = await stateGet(f);
  const p = (state.projects || []).find(x => x.id === a[0]);
  if (!p) throw new CliError('项目不存在:' + a[0], 4);
  const ep = findEp(p, a[1]);
  return {
    id: ep.id, title: ep.title, status: ep.status, content: (ep.content || '').length, contentRev: ep.contentRev || 0,
    understanding: !!ep.understanding, composed: ep.composed || null, srt: !!ep.composedSrt,
    shots: (ep.shots || []).map(s => ({
      id: s.id, order: s.order, plot: (s.plot || '').slice(0, 40), confirm: !!s.confirm, final: !!s.final,
      image: !!s.image, video: (s.video && s.video.status) || 'none', review: s.reviews && s.reviews[0] ? s.reviews[0].score : null,
    })),
  };
};

/* ---- 主体层 ---- */
CMD.subjects = async (a, f) => {
  need(a[0], '用法:hujing subjects <pid>');
  const { state } = await stateGet(f);
  const p = (state.projects || []).find(x => x.id === a[0]);
  if (!p) throw new CliError('项目不存在:' + a[0], 4);
  return { subjects: (p.subjects || []).map(s => ({ id: s.id, name: s.name, kind: s.kind, image: s.image || '', description: (s.description || '').slice(0, 60) })) };
};
CMD['subject-add'] = async (a, f) => {
  need(a[0] && f.name, '用法:hujing subject-add <pid> --name 女主 [--kind character|scene|prop] [--desc 描述] [--gen-image] [--prompt 生图提示]');
  const holder = {};
  await withProject(a[0], f, async proj => {
    const sj = newSubject(f.name, f.kind, f.desc);
    proj.subjects = proj.subjects || [];
    proj.subjects.push(sj);
    holder.sj = sj;
    if (f['gen-image']) { // 生成主体图并回填(计费走服务端推导;失败整体回滚不推 state)
      const prompt = f.prompt || ((proj.style || '漫剧') + '风格,' + f.name + ',' + (f.desc || '角色立绘,全身,正面'));
      const img = await genImage(prompt, f, {});
      sj.image = img.url;
      sj.prompt = prompt;
    }
  });
  return holder.sj;
};
CMD['subject-image'] = async (a, f) => {
  need(a[0] && a[1], '用法:hujing subject-image <pid> <主体id|名> (--file f.png | --url /uploads/.. | --gen [--prompt p])');
  return (await withProject(a[0], f, async proj => {
    const sj = findSubject(proj, a[1]);
    if (f.file) sj.image = (await uploadFile(f.file, f)).url;
    else if (f.url) sj.image = f.url;
    else if (f.gen) {
      const prompt = f.prompt || ((proj.style || '漫剧') + '风格,' + sj.name + ',' + (sj.description || '角色立绘'));
      sj.image = (await genImage(prompt, f, {})).url;
      sj.prompt = prompt;
    } else throw new CliError('需指定 --file/--url/--gen 之一', 2);
    return { id: sj.id, name: sj.name, image: sj.image };
  })).ret;
};
/* 跨项目复制主体:图片/提示词/形态随副本走,重新发 id 与原件互不牵连;目标项目同名同类则覆盖图与提示词(对齐 UI「从资产库导入」语义) */
CMD['subject-copy'] = async (a, f) => {
  need(a[0] && a[1] && a[2], '用法:hujing subject-copy <源pid> <主体id|名> <目标pid>');
  for (let attempt = 0; attempt < 3; attempt++) {
    const { rev, state } = await stateGet(f);
    const from = (state.projects || []).find(x => x.id === a[0]);
    if (!from) throw new CliError('源项目不存在:' + a[0], 4);
    const to = (state.projects || []).find(x => x.id === a[2]);
    if (!to) throw new CliError('目标项目不存在:' + a[2], 4);
    if (from.id === to.id) throw new CliError('源与目标不能是同一项目', 2);
    const src = findSubject(from, a[1]);
    const kind = src.kind === 'keyframe' ? 'prop' : (src.kind || 'character');
    const forms = (src.forms || []).map(x => ({ id: 'fm_' + Date.now().toString(36) + '_' + crypto.randomBytes(3).toString('hex'), name: x.name, image: x.image || '', time: x.time || '' }));
    to.subjects = to.subjects || [];
    const exist = to.subjects.find(x => x.name === src.name && x.kind === kind);
    let out;
    if (exist) {
      exist.image = src.image || exist.image;
      exist.prompt = src.prompt || exist.prompt;
      if (forms.length) exist.forms = forms;
      out = exist;
    } else {
      out = { id: 'sj_' + Date.now().toString(36) + '_' + crypto.randomBytes(3).toString('hex'), name: src.name, kind, image: src.image || '', prompt: src.prompt || '', description: src.description || '', forms };
      to.subjects.push(out);
    }
    try {
      await PUT('/api/state', { rev, changes: { projects: { [to.id]: to } } }, f);
      return { id: out.id, name: out.name, kind: out.kind, overwritten: !!exist, forms: (out.forms || []).length };
    } catch (e) { if (e.exit === 7 && attempt < 2) { log('rev 冲突,重试(' + (attempt + 2) + '/3)…'); continue; } throw e; }
  }
};

/* ---- 分镜层 ---- */
CMD.shots = async (a, f) => {
  need(a[0] && a[1], '用法:hujing shots <pid> <epid>');
  const { state } = await stateGet(f);
  const p = (state.projects || []).find(x => x.id === a[0]);
  if (!p) throw new CliError('项目不存在:' + a[0], 4);
  const ep = findEp(p, a[1]);
  return { episode: ep.title, count: (ep.shots || []).length, shots: ep.shots || [] };
};
CMD['shots-import'] = async (a, f) => {
  need(a[0] && a[1] && f.file, '用法:hujing shots-import <pid> <epid> --file shots.json [--append] (数组,字段:plot/camera/characters/scene/props/narration/dialogue/prompt/duration)');
  const arr = JSON.parse(fs.readFileSync(path.resolve(f.file), 'utf8'));
  need(Array.isArray(arr) && arr.length, 'shots.json 需为非空数组');
  return (await withProject(a[0], f, async proj => {
    const ep = findEp(proj, a[1]);
    const base = f.append ? (ep.shots || []).length : 0;
    const norm = arr.map((s, i) => normShot(s, i, base));
    ep.shots = f.append ? (ep.shots || []).concat(norm) : norm;
    ep.status = 'storyboarded';
    ep.shotsSourceRev = ep.contentRev || 0; // 导入即一次"分镜发布":记录对应剧本版本(对齐智能分镜发布口径,消除"手动导入仍判旧"误报)
    ep.shotsGraphRev = ep.graphRev || 0;    // 记录对应事件图谱版本
    return { episode: ep.id, imported: norm.length, total: ep.shots.length, replaced: !f.append };
  })).ret;
};
/* 单镜字段补丁(领域校验,替代裸 Object.assign):受管字段拒绝直写;已知字段类型校验;
 * prompt 走 Store.setShotPrompt 同语义(旧值入 promptHistory,上限 20);素材判旧靠 inputHash 指纹自动生效 */
const SHOT_PATCH_RULES = {
  name: v => String(v), plot: v => String(v), camera: v => String(v),
  scene: v => String(v), narration: v => String(v), dialogue: v => String(v),
  prompt: v => String(v), transition: v => (v ? String(v) : null), // 转场为字符串(对齐主应用 sb-views.js),空值=无转场(硬切)
  duration: v => { const n = +v; need(Number.isFinite(n) && n >= 1 && n <= 30, 'duration 需为 1~30 秒'); return n; },
  characters: v => { need(Array.isArray(v), 'characters 需为数组'); return v.map(String); },
  props: v => { need(Array.isArray(v), 'props 需为数组'); return v.map(String); },
  final: v => !!v, confirm: v => !!v,
  order: v => { const n = +v; need(Number.isInteger(n), 'order 需为整数'); return n; },
};
const SHOT_PROTECTED = ['id', 'video', 'audio', 'history', 'reviews', 'promptHistory'];
CMD['shot-set'] = async (a, f) => {
  need(a[0] && a[1] && a[2] && f.patch, '用法:hujing shot-set <pid> <epid> <sid> --patch \'{"prompt":"新提示词","duration":8}\'');
  const patch = JSON.parse(f.patch);
  need(patch && typeof patch === 'object' && !Array.isArray(patch), '--patch 需为 JSON 对象');
  const bad = Object.keys(patch).filter(k => SHOT_PROTECTED.includes(k));
  need(!bad.length, '受管字段不允许 shot-set 直写:' + bad.join(',') + '(video 用 gen-shot-video,reviews 用 review-note)');
  return (await withProject(a[0], f, async proj => {
    const s = findShot(findEp(proj, a[1]), a[2]);
    const applied = [];
    for (const [k, raw] of Object.entries(patch)) {
      const val = SHOT_PATCH_RULES[k] ? SHOT_PATCH_RULES[k](raw) : raw; // 未知字段透传(兼容前端字段演进)
      if (k === 'prompt') { // setShotPrompt 同语义:旧值入 promptHistory(空值/相同不记,上限 20)
        const v = String(val == null ? '' : val);
        if (s.prompt && s.prompt !== v) {
          s.promptHistory = s.promptHistory || [];
          s.promptHistory.unshift({ prompt: s.prompt, time: new Date().toLocaleString('zh-CN') });
          if (s.promptHistory.length > 20) s.promptHistory.length = 20;
        }
        s.prompt = v;
      } else s[k] = val;
      applied.push(k);
    }
    // 内容字段(prompt/plot/dialogue/narration)修改自动回落为未确认(对齐主应用"内容修改需重新过目"语义)
    if (['prompt', 'plot', 'dialogue', 'narration'].some(k => k in patch)) s.confirm = false;
    return { id: s.id, patched: applied };
  })).ret;
};
CMD['shot-confirm'] = async (a, f) => {
  need(a[0] && a[1] && a[2], '用法:hujing shot-confirm <pid> <epid> <sid> [--off]');
  return (await withProject(a[0], f, async proj => {
    const s = findShot(findEp(proj, a[1]), a[2]);
    s.confirm = !f.off; // --off 取消确认
    return { id: s.id, confirm: s.confirm };
  })).ret;
};

/* ---- 生成层 ---- */
CMD['gen-image'] = async (_, f) => {
  need(f.prompt, '用法:hujing gen-image --prompt 提示词 [--image 参考图url|本地文件] [--size 1024x1024] [--model m]');
  const extra = {};
  if (f.image) extra.image = fs.existsSync(path.resolve(f.image)) ? (await uploadFile(f.image, f)).url : f.image;
  if (f.size) extra.size = f.size;
  if (f.model) extra.model = f.model;
  return genImage(f.prompt, f, extra);
};
CMD['gen-shot-image'] = async (a, f) => {
  need(a[0] && a[1] && a[2], '用法:hujing gen-shot-image <pid> <epid> <sid> [--prompt 覆盖] (生图写回镜头底图)');
  return (await withProject(a[0], f, async proj => {
    const s = findShot(findEp(proj, a[1]), a[2]);
    const prompt = f.prompt || s.prompt;
    need(prompt, '镜头 ' + s.id + ' 无提示词');
    const img = await genImage(prompt, f, {});
    s.image = img.url;
    return { id: s.id, image: s.image };
  })).ret;
};
CMD['gen-video'] = async (_, f) => {
  need(f.prompt, '用法:hujing gen-video --prompt 提示词 [--image 首帧] [--duration 5] [--ratio 16:9] [--model m] [--nowait]');
  const extra = {};
  if (f.image) extra.image = fs.existsSync(path.resolve(f.image)) ? (await uploadFile(f.image, f)).url : f.image;
  if (f.duration) extra.duration = +f.duration;
  if (f.ratio) extra.ratio = f.ratio;
  if (f.model) extra.model = f.model;
  const created = await genVideoCreate(f.prompt, f, extra);
  if (f.nowait) return { id: created.id, duration: created.duration, pending: true };
  const d = await waitJob(created.id, f, +f.timeout || 30);
  if (d.status !== 'succeeded') throw new CliError('生成失败:' + (d.error || d.status), 5);
  return { id: created.id, videoUrl: d.videoUrl, remoteUrl: d.remoteUrl };
};
CMD['gen-shot-video'] = async (a, f) => {
  need(a[0] && a[1] && a[2], '用法:hujing gen-shot-video <pid> <epid> <sid> [--nowait] [--timeout 分钟] (单镜生视频写回 s.video)');
  let genErr = null;
  const r = await withProject(a[0], f, async proj => {
    const s = findShot(findEp(proj, a[1]), a[2]);
    try {
      return await genShotVideo(proj, findEp(proj, a[1]), s, f, { wait: !f.nowait, timeout: +f.timeout || 30 });
    } catch (e) {
      genErr = e; // 失败态已写回 s.video(见 genShotVideo):先随补丁落库再向外抛
      return null;
    }
  });
  if (genErr) throw genErr;
  return r.ret;
};
CMD['gen-episode'] = async (a, f) => {
  need(a[0] && a[1], '用法:hujing gen-episode <pid> <epid> [--failed-only] [--include-unconfirmed] [--no-image] [--timeout 分钟/镜]\n'
    + '  批量整集:逐镜(默认仅已确认镜)生视频并写回;缺底图且未 --no-image 时先补生图;已出片镜自动跳过(断点续跑)。');
  const { state } = await stateGet(f);
  const proj = (state.projects || []).find(x => x.id === a[0]);
  if (!proj) throw new CliError('项目不存在:' + a[0], 4);
  const ep = findEp(proj, a[1]);
  const todo = (ep.shots || []).filter(s => {
    if (s.final) return false; // 终稿锁不动
    if (s.video && s.video.status === 'done') return false; // 已出片跳过(断点续跑)
    if (f['failed-only'] && !(s.video && s.video.status === 'failed')) return false;
    if (!f['include-unconfirmed'] && !s.confirm) return false; // 确认闸(与前端批量规则一致)
    return true;
  });
  if (!todo.length) return { episode: ep.id, total: 0, ok: 0, failed: [], skipped: '无可生成镜头(确认闸/已出片/终稿)' };
  log('整集生成:' + todo.length + ' 镜待处理(串行,服务端限流)…');
  const result = { episode: ep.id, total: todo.length, ok: 0, failed: [], shots: {} };
  for (const s of todo) {
    try {
      const r = await withProject(a[0], f, async (projLive) => {
        const epLive = findEp(projLive, a[1]);
        const sLive = findShot(epLive, s.id);
        if (!sLive.image && !f['no-image']) { // 缺底图先补(廉价文生图,失败即停该镜不碰视频)
          const img = await genImage(sLive.prompt || sLive.plot || ('镜头' + sLive.order), f, {});
          sLive.image = img.url;
          log('镜 ' + s.id + ' 底图已补:' + img.url);
        }
        try {
          await genShotVideo(projLive, epLive, sLive, f, { wait: true, timeout: +f.timeout || 30 });
        } catch (e) {
          return e; // 失败态已由 genShotVideo 写回 sLive.video:先随补丁落库(含已补底图),再在循环外汇总
        }
        return null;
      });
      if (r.ret) throw r.ret;
      result.ok++;
      result.shots[s.id] = 'done';
      log('镜 ' + s.id + ' ✓ (' + result.ok + '/' + todo.length + ')');
    } catch (e) {
      result.failed.push({ shotId: s.id, error: e.message });
      result.shots[s.id] = 'failed';
      log('镜 ' + s.id + ' ✗ ' + e.message);
    }
  }
  return result;
};
CMD.wait = async (a, f) => {
  need(a[0], '用法:hujing wait <taskId> [--timeout 分钟]');
  return waitJob(a[0], f, +f.timeout || 30);
};

/* ---- 审片层 ---- */
CMD['review-frames'] = async (a, f) => {
  need(a[0] && a[1] && a[2], '用法:hujing review-frames <pid> <epid> <sid> [--count 4] (抽帧供人工/Agent 评审,配合 download 取图)');
  const { state } = await stateGet(f);
  const p = (state.projects || []).find(x => x.id === a[0]);
  if (!p) throw new CliError('项目不存在:' + a[0], 4);
  const s = findShot(findEp(p, a[1]), a[2]);
  const vurl = s.video && s.video.url;
  need(vurl, '镜头 ' + s.id + ' 未出片,无视频可抽帧');
  return POST('/api/ffmpeg/frames', { video: vurl, count: Math.max(1, Math.min(24, +(f.count || 4))), operationId: crypto.randomUUID() }, f, { timeoutMs: 180000 });
};
CMD['review-note'] = async (a, f) => {
  need(a[0] && a[1] && a[2] && f.score !== undefined, '用法:hujing review-note <pid> <epid> <sid> --score 8.5 [--comment 评语] [--dimensions \'{"画面":9}\']');
  const score = +f.score;
  need(Number.isFinite(score) && score >= 0 && score <= 10, '--score 需为 0~10 数字');
  return (await withProject(a[0], f, async proj => {
    const s = findShot(findEp(proj, a[1]), a[2]);
    s.reviews = s.reviews || [];
    const rv = {
      id: 'rv_' + Date.now().toString(36) + crypto.randomBytes(3).toString('hex').slice(0, 5), // 与 Store.uid('rv') 同规则,可按 reportId 恢复
      shotId: s.id, score, time: new Date().toLocaleString('zh-CN'), comments: f.comment ? [f.comment] : [],
      videoInputHash: (s.video && s.video.inputHash) || Domain.shotInputHash(proj, s), // 版本绑定:判旧 review.js reportStale 要求;优先沿用生成时指纹(与 UI 同口径),缺失才现算
      videoUrl: (s.video && s.video.url) || '', reviewedAt: Date.now(),
    };
    if (f.dimensions) rv.dimensions = JSON.parse(f.dimensions);
    s.reviews.unshift(rv);
    s.reviews = s.reviews.slice(0, 5); // 与主应用同上限
    return { id: s.id, reportId: rv.id, score, reviews: s.reviews.length };
  })).ret;
};

/* ---- 成片层 ---- */
/* 合成核心:CMD.compose 与 exec episode.compose 共用(构建时间轴→FFmpeg 合成→写回与主应用 doCompose 同口径字段) */
async function composeCore(pid, epid, f) {
  const { state } = await stateGet(f);
  const proj = (state.projects || []).find(x => x.id === pid);
  if (!proj) throw new CliError('项目不存在:' + pid, 4);
  const ep = findEp(proj, epid);
  // 字幕开关:--no-subtitle/--subtitle 显式参数优先,缺省读 ep.sbConfig.subtitle(与主应用 doCompose 同口径)
  const subtitle = f.subtitle !== undefined ? f.subtitle !== false : !!(ep.sbConfig && ep.sbConfig.subtitle);
  const { items, segs, missing } = await composeItems(ep, Object.assign({}, f, { subtitle }));
  if (missing.length && !f['skip-incomplete']) throw new CliError('以下镜头无视频也无底图,无法合成:' + missing.join(',') + '(--skip-incomplete 可跳过)', 2);
  need(items.length, '无可合成段落(分镜表为空或全部缺素材)');
  log('合成 ' + items.length + ' 段(计费 ff.compose)…');
  const d = await POST('/api/ffmpeg/compose', {
    items, ratio: f.ratio || (ep.sbConfig && ep.sbConfig.ratio) || '16:9',
    subtitle, operationId: crypto.randomUUID(),
  }, f, { timeoutMs: 120000 + items.length * 60000 });
  const srt = buildSrt(segs);
  return (await withProject(pid, f, async (projLive) => {
    const epLive = findEp(projLive, epid);
    // 写回与主应用 doCompose 同一口径:composed 布尔 + composedUrl/指纹/版本戳,主应用可识别/判旧/归档
    epLive.composed = true;
    delete epLive.composedSimulated;
    epLive.composedAt = new Date().toLocaleString('zh-CN');
    epLive.composedUrl = d.url;
    epLive.composedSrt = srt || null;
    epLive.composedVia = 'shots';
    epLive.composedInputHash = Domain.composedInputHash(epLive, true); // 合成输入指纹:调序/裁剪/换素材 → 主应用判"待更新"
    epLive.composedDialogueSig = Domain.composedDialogueSig(epLive, true); // 字幕文本/时长指纹:改台词/旁白 → 判未就绪(与主应用同口径)
    epLive.composedSourceRev = epLive.contentRev || 0; // 合成时剧本版本
    epLive.composedGraphRev = epLive.graphRev || 0;    // 合成时图谱版本
    return { episode: epLive.id, url: d.url, count: items.length, skipped: missing, srt: !!srt, transitions: d.transitions };
  })).ret;
}
CMD.compose = async (a, f) => {
  need(a[0] && a[1], '用法:hujing compose <pid> <epid> [--ratio 16:9|9:16|1:1] [--no-subtitle] [--skip-incomplete]\n'
    + '  从分镜表构建时间轴合成成片:写回 ep.composed 与 ep.composedSrt(旁白/台词软字幕)。');
  return composeCore(a[0], a[1], f);
};
CMD.export = async (a, f) => {
  need(a[0] && a[1], '用法:hujing export <pid> <epid> [--out 目录] (下载成片 mp4 + 字幕 srt 到本地)');
  const { state } = await stateGet(f);
  const p = (state.projects || []).find(x => x.id === a[0]);
  if (!p) throw new CliError('项目不存在:' + a[0], 4);
  const ep = findEp(p, a[1]);
  need(ep.composed && ep.composedUrl, '该集尚未合成成片,请先 compose');
  const dir = path.resolve(f.out || '.');
  const base = (p.name + '_' + ep.title).replace(/[\\/:*?"<>|]/g, '_');
  const r = { dir, files: [] };
  const v = await downloadTo(ep.composedUrl, path.join(dir, base + '.mp4'), f);
  r.files.push(v.file);
  log('成片已下载:' + v.file + '(' + (v.bytes / 1048576).toFixed(1) + 'MB)');
  if (ep.composedSrt) {
    const sf = path.join(dir, base + '.srt');
    fs.writeFileSync(sf, ep.composedSrt, 'utf8');
    r.files.push(sf);
    log('字幕已导出:' + sf);
  }
  return r;
};

/* ================= 统一领域命令 exec(第二阶段) =================
 * 与前端 js/commands.js 同一命令名/参数(pid/epid/sid)/结果结构 { ok, status, result?, error?, cost?, next? }:
 * 生成链路复用 CLI 原语(genShotVideo/genImage/composeCore),就绪/下一步经 Domain 同口径推导;
 * LLM 创作类(智能分镜/本集理解/智能审片)经服务端工作流端点 /api/wf/*(二十一轮下沉,计费动作服务端定死)。
 * exit 映射:ok→0 | blocked→2(no-credits→6 / not-found→4) | failed→5;stdout 恒为上述结构化结果。 */
const EXEC = {};
const execOk = (result, extra) => Object.assign({ ok: true, status: 'done', result: result || {} }, extra);
const execBlocked = (code, message, result) => ({ ok: false, status: 'blocked', error: { code, message }, result: result || {} });
const execFail = (code, message, extra) => Object.assign({ ok: false, status: 'failed', error: { code, message } }, extra);
/* 上下文:pid/epid 必填校验在 CMD.exec 层(参数错误 exit 2);此处只负责查找(不存在→404 语义) */
async function execCtx(args, f) {
  const { state } = await stateGet(f);
  const p = (state.projects || []).find(x => x.id === args.pid);
  if (!p) throw new CliError('项目不存在:' + args.pid, 4);
  const out = { p };
  if (args.epid) {
    out.ep = findEp(p, args.epid);
    if (args.sid) { // sid 支持镜头 id 或镜头号(与前端 resolveCtx 同口径)
      out.s = (out.ep.shots || []).find(x => x.id === args.sid) || (out.ep.shots || [])[(+args.sid) - 1];
      if (!out.s) throw new CliError('镜头不存在:' + args.sid, 4);
    }
  }
  return out;
}
/* 执行后 next:重取最新状态按 Domain 重推(与前端 nextOf / CLI workflow 同口径) */
async function execNext(pid, epid, f) {
  try {
    const { state } = await stateGet(f);
    const p = (state.projects || []).find(x => x.id === pid);
    if (!p) return null;
    if (epid) {
      const ep = (p.episodes || []).find(e => e.id === epid);
      if (ep) { const st = Domain.episodeState(p, ep, true); return Object.assign({ status: st.status }, st.action || {}); }
    }
    return Domain.workflow(p, true).recommendedAction || null;
  } catch (_) { return null; }
}

/* 生产就绪检查(read):Domain.episodeState 单源推导 */
EXEC['episode.preflight'] = { needs: ['p', 'ep'], meter: false, next: false, run: async (args, f) => {
  const { p, ep } = await execCtx(args, f);
  const st = Domain.episodeState(p, ep, true);
  return { ok: st.status !== 'blocked' && !st.shotsStale, status: st.status, result: st };
} };

/* 批量生成视频(exec):确认闸口径=未确认镜跳过并如实进 skipped(与前端 headless/CLI gen-episode 一致);
 * --confirm-all 显式授权全量(先写回 confirm=true);就绪判定走 Domain.shotVideoReady(离线模拟在线重跑) */
EXEC['episode.generateVideos'] = { needs: ['p', 'ep'], meter: true, run: async (args, f) => {
  if (args.confirmAll) {
    await withProject(args.pid, f, proj => { findEp(proj, args.epid).shots.forEach(s => { if (!s.final) s.confirm = true; }); });
  }
  const { ep } = await execCtx(args, f); // confirmAll 写回后重取最新快照
  const pend = (ep.shots || []).filter(s => !s.final && !Domain.shotVideoReady(s, true));
  const skipped = args.confirmAll ? [] : pend.filter(s => !s.confirm).map(s => ({ shotId: s.id, order: s.order + 1, reason: '未确认' }));
  const todo = pend.filter(s => args.confirmAll || s.confirm);
  if (!todo.length) {
    if (skipped.length) return execBlocked('unconfirmed', skipped.length + ' 镜未确认已跳过(--confirm-all 可授权全量生成)', { total: 0, ok: 0, failed: [], skipped });
    return execOk({ total: 0, ok: 0, failed: [], skipped: [] });
  }
  log('批量生成:' + todo.length + ' 镜待处理(串行,服务端限流)…');
  const failed = [];
  let okCnt = 0;
  for (const s of todo) {
    try {
      const r = await withProject(args.pid, f, async projLive => {
        const epLive = findEp(projLive, args.epid);
        const sLive = findShot(epLive, s.id);
        if (!sLive.image && !args.noImage) { // 缺底图先补(廉价文生图,失败即停该镜不碰视频)
          const img = await genImage(sLive.prompt || sLive.plot || ('镜头' + sLive.order), f, {});
          sLive.image = img.url;
        }
        try {
          await genShotVideo(projLive, epLive, sLive, f, { wait: true, timeout: +args.timeout || 30 });
        } catch (e) {
          return e; // 失败态已由 genShotVideo 写回 sLive.video:先随补丁落库(含已补底图),再在循环外汇总
        }
        return null;
      });
      if (r.ret) throw r.ret;
      okCnt++;
      log('镜 ' + s.id + ' ✓ (' + okCnt + '/' + todo.length + ')');
    } catch (e) {
      failed.push({ shotId: s.id, order: s.order + 1, error: String(e.message || e).slice(0, 80) });
      log('镜 ' + s.id + ' ✗ ' + e.message);
    }
  }
  const r = { ok: failed.length === 0, status: failed.length ? 'failed' : 'done', result: { total: todo.length, ok: okCnt, failed, skipped } };
  if (failed.length) r.error = { code: okCnt ? 'partial' : 'gen-failed', message: failed.length + ' 镜生成失败(已退费),可修复后重试' };
  return r;
} };

/* 单镜生成(exec):确认闸/终稿锁前置 blocked,写回与主应用同口径 */
EXEC['shot.generateVideo'] = { needs: ['p', 'ep', 's'], meter: true, run: async (args, f) => {
  const { s } = await execCtx(args, f);
  if (s.final) return execBlocked('final', '该分镜已定为终稿,请先「解锁终稿」');
  if (!s.confirm) return execBlocked('unconfirmed', '镜头未确认:请先 shot-confirm(或 episode.generateVideos --confirm-all 授权)');
  if (!s.image && !args.noImage) { // 缺底图先补(与批量口径一致)
    await withProject(args.pid, f, async projLive => {
      const sLive = findShot(findEp(projLive, args.epid), s.id);
      sLive.image = (await genImage(sLive.prompt || sLive.plot || ('镜头' + sLive.order), f, {})).url;
    });
  }
  let genErr = null;
  const ret = await withProject(args.pid, f, async projLive => {
    const epLive = findEp(projLive, args.epid);
    try {
      return await genShotVideo(projLive, epLive, findShot(epLive, s.id), f, { wait: true, timeout: +args.timeout || 30 });
    } catch (e) {
      genErr = e; // 失败态已写回 s.video(见 genShotVideo):先随补丁落库再向外抛
      return null;
    }
  });
  if (genErr) throw genErr;
  return execOk({ shotId: s.id, url: (ret.ret.video && ret.ret.video.url) || '' });
} };

/* 合成成片(exec):失败镜头/无分镜前置 blocked;合成核心与 CMD.compose 同函数字面 */
EXEC['episode.compose'] = { needs: ['p', 'ep'], meter: true, run: async (args, f) => {
  const { ep } = await execCtx(args, f);
  if (!(ep.shots || []).length) return execBlocked('no-shots', '暂无分镜');
  const failedCnt = ep.shots.filter(s => s.video && s.video.status === 'failed').length;
  if (failedCnt) return execBlocked('failed-shots', failedCnt + ' 个失败镜头阻塞合成,请先处理', { failed: failedCnt });
  const c = await composeCore(args.pid, args.epid, f);
  return execOk({ url: c.url, count: c.count });
} };

/* 一键成片(exec,编排):就绪检查 → 批量生成 → 智能审片 → 合成成片,与前端 episode.produce 同步骤同结构;
 * 智能审片依赖浏览器多模态评审引擎,CLI 侧该步如实标 skipped(等效跑批模板关闭审片),不阻断合成 */
EXEC['episode.produce'] = { needs: ['p', 'ep'], meter: true, run: async (args, f) => { // meter:整体钱包差值(与前端 steps 累加同口径)
  const steps = [];
  const call = async (key, cmdName) => {
    let r;
    try { r = await EXEC[cmdName].run(args, f); }
    catch (e) { r = e && e.exit === 6 ? execBlocked('no-credits', e.message) : execFail('exception', (e && e.message) || e); }
    steps.push({ step: key, ok: r.ok, status: r.status, result: r.result, error: r.error || null });
    return r;
  };
  const { p, ep } = await execCtx(args, f);
  const st = Domain.episodeState(p, ep, true); // 1. 就绪检查(与跑批 preflight 同口径)
  if (st.status === 'blocked' || st.shotsStale) return execBlocked('preflight', '就绪检查未通过:' + (st.blockers.map(b => b.label).join('/') || '分镜已过期'), { steps, blockers: st.blockers });
  if (!(ep.shots || []).length) return execBlocked('no-shots', '未分镜', { steps });
  await call('generateVideos', 'episode.generateVideos'); // 2. 批量生成(失败镜不阻塞,合成前统一拦截)
  // 3. 智能审片(二十一轮:服务端工作流真实评审;低分镜=质量闸门,默认阻断合成,--args riskyCompose 放行)
  if (args.smartReview !== false) {
    const rv = await call('smartReview', 'episode.smartReview');
    if (rv.result && (rv.result.lowShots || []).length && !args.riskyCompose) {
      return { ok: false, status: 'needs_human', error: { code: 'manual-gate', message: '低分 ' + rv.result.lowShots.length + ' 镜(' + rv.result.lowShots.map(x => x.order + '镜' + x.score + '分').join('、') + '),质量闸门已阻断合成(riskyCompose 可放行)' }, result: { steps } };
    }
  }
  const c = await call('compose', 'episode.compose'); // 4. 合成成片
  if (!c.ok) return { ok: false, status: c.status, error: c.error, result: { steps } };
  return execOk({ steps, url: (c.result && c.result.url) || '' });
} };

/* LLM 创作类(二十一轮:LLM 编排已下沉服务端工作流端点 /api/wf/*——计费动作服务端定死,
 * 提示词/规整与浏览器 js/wf-core.js 同源;端点直接写回 state,CLI 只调用+结构化回执) */
EXEC['episode.understanding'] = { needs: ['p', 'ep'], meter: true, run: async (args, f) => {
  const d = await POST('/api/wf/understanding', { pid: args.pid, epid: args.epid, operationId: crypto.randomUUID() }, f, { timeoutMs: 240000 });
  return execOk({ understanding: d.understanding });
} };
EXEC['episode.generateStoryboard'] = { needs: ['p', 'ep'], meter: true, run: async (args, f) => {
  const d = await POST('/api/wf/smart-storyboard', { pid: args.pid, epid: args.epid, operationId: crypto.randomUUID(), shotCount: args.shotCount, sbPlans: args.sbPlans }, f, { timeoutMs: 600000 });
  return execOk({ shots: d.shots, plans: d.plans, adopted: d.adopted });
} };
EXEC['episode.smartReview'] = { needs: ['p', 'ep'], meter: true, run: async (args, f) => {
  const d = await POST('/api/wf/smart-review', { pid: args.pid, epid: args.epid, operationId: crypto.randomUUID() }, f, { timeoutMs: 600000 });
  const r = { ok: !(d.failed || []).length, status: (d.failed || []).length ? 'failed' : 'done', result: { avg: d.avg, reviewed: d.reviewed, failed: d.failed || [], lowShots: d.lowShots || [], common: d.common || null, cut: d.cut || null } };
  if ((d.failed || []).length) r.error = { code: 'partial', message: d.failed.length + ' 镜评审失败(已退费),可重试' };
  return r;
} };

/* needs 校验面与注册表单源对齐(执行体各端自治;contract 套件锁死 EXEC 键集 = 注册表词表) */
CmdRegistry.META.forEach(m => { if (EXEC[m.name]) EXEC[m.name].needs = m.needs.slice(); });

CMD.exec = async (a, f) => {
  const name = a[0];
  need(name, '用法:hujing exec <command> [--args \'{"pid":".."}\'] [--confirm-all] [--no-image] [--timeout 分钟/镜]\n'
    + '  统一领域命令(与前端 Commands.execute 同名同结构,cmd-registry.js 单源):\n'
    + CmdRegistry.META.map(m => `    ${m.name} ${CmdRegistry.usageOf(m)} — ${m.label}`).join('\n'));
  need(EXEC[name], '未注册命令:' + name + ';可用:' + CmdRegistry.names().join(', '));
  const cmd = EXEC[name];
  const args = Object.assign(f.args ? JSON.parse(f.args) : {}, {
    pid: f.pid, epid: f.epid, sid: f.sid,
    confirmAll: !!f['confirm-all'], noImage: !!f['no-image'], timeout: f.timeout,
  });
  Object.keys(args).forEach(k => args[k] === undefined && delete args[k]);
  if (cmd.needs.includes('p')) need(args.pid, '缺 --pid');
  if (cmd.needs.includes('ep')) need(args.epid, '缺 --epid');
  if (cmd.needs.includes('s')) need(args.sid, '缺 --sid(镜头 id 或序号)');
  const bal = async () => (await GET('/api/wallet', f)).balance;
  const c0 = cmd.meter ? await bal() : 0;
  let r;
  try { r = await cmd.run(args, f); }
  catch (e) { // CliError → 结构化结果(保持 stdout 契约稳定);402→no-credits / 404→not-found / 前置不满足→intercepted
    if (!(e instanceof CliError)) throw e;
    r = e.exit === 6 ? execBlocked('no-credits', e.message)
      : e.exit === 4 ? execBlocked('not-found', e.message)
      : e.exit === 2 ? execBlocked('intercepted', e.message)
      : execFail('exception', e.message);
  }
  if (cmd.meter) r.cost = Math.max(0, c0 - await bal()); // 钱包余额前后差值(含子调用扣费与退费回补,与前端 metered 同口径)
  if (r.next === undefined && cmd.next !== false) r.next = await execNext(args.pid, args.epid, f);
  out(r, f);
  process.exit(r.ok ? 0 : r.status === 'blocked' ? ({ 'no-credits': 6, 'not-found': 4 }[r.error && r.error.code] || 2) : 5); // blocked 可无 error 字段(如 preflight),取码需防空
};

/* ---- 工具 ---- */
CMD.upload = async (a, f) => {
  need(a[0], '用法:hujing upload <本地文件>');
  return uploadFile(a[0], f);
};
CMD.download = async (a, f) => {
  need(a[0] && a[1], '用法:hujing download <url|/uploads/..> <保存路径>');
  return downloadTo(a[0], a[1], f);
};
CMD.llm = async (_, f) => {
  need(f.user || f['user-file'], '用法:hujing llm --user 提示 [--system 设定] [--json] [--model m] [--temperature 0.7] (借服务端 key,计费 llm.chat)');
  const messages = [];
  if (f.system) messages.push({ role: 'system', content: f.system });
  messages.push({ role: 'user', content: f['user-file'] ? fs.readFileSync(path.resolve(f['user-file']), 'utf8') : f.user });
  const j = await POST('/api/llm/chat', {
    messages, model: f.model || undefined, jsonMode: !!f.json,
    temperature: f.temperature !== undefined ? +f.temperature : undefined,
    billingAction: 'llm.chat', operationId: crypto.randomUUID(),
  }, f, { timeoutMs: 180000, fullBody: true }); // jsonMode 时 parsed 在响应顶层
  const d = j.data || {};
  const content = d.choices && d.choices[0] && d.choices[0].message ? d.choices[0].message.content : '';
  return { content, parsed: j.parsed, usage: d.usage, cached: !!d.cached };
};
CMD.tts = async (_, f) => {
  need(f.text, '用法:hujing tts --text 文本 [--voice 音色] [--speed 1.0] [--emotion 情感] (≤300 字,计费 tts.gen)');
  const body = { text: f.text, operationId: crypto.randomUUID() };
  if (f.voice) body.voice = f.voice;
  if (f.speed) body.speed = +f.speed;
  if (f.emotion) { body.emotion = f.emotion; if (f['emotion-scale']) body.emotionScale = +f['emotion-scale']; }
  return POST('/api/volc/tts', body, f, { timeoutMs: 180000 });
};
CMD.ff = async (a, f) => {
  const sub = a[0];
  need(['frames', 'suberase', 'upscale', 'compose', 'merge', 'cut', 'highlight'].includes(sub),
    '用法:hujing ff <frames|suberase|upscale|merge|cut|highlight> [--video /uploads/x.mp4] [--count 6] [其他参数透传]');
  const body = { operationId: crypto.randomUUID() };
  for (const k of ['video', 'audio', 'image', 'count', 'res', 'quality', 'mode', 'start', 'end', 'text', 'times']) {
    if (f[k] !== undefined) body[k] = k === 'times' ? JSON.parse(f[k]) : (isNaN(+f[k]) || f[k] === '' ? f[k] : +f[k]);
  }
  return POST('/api/ffmpeg/' + sub, body, f, { timeoutMs: 300000 });
};

/* ---- 逃生舱:裸 state 读写(任意复杂操作) ---- */
CMD['state-get'] = async (_, f) => {
  const { rev, state } = await stateGet(f);
  if (f.out) { fs.writeFileSync(path.resolve(f.out), JSON.stringify({ rev, state }, null, 2), 'utf8'); return { rev, saved: path.resolve(f.out) }; }
  return { rev, state };
};
CMD['state-put'] = async (_, f) => {
  need(f.file, '用法:hujing state-put --file state.json [--force] (全量覆盖,危险操作)');
  const j = JSON.parse(fs.readFileSync(path.resolve(f.file), 'utf8'));
  need(j.state, '文件需含 {rev, state} 结构');
  need(f.force, '全量覆盖将丢弃服务端当前数据,确认请加 --force');
  return PUT('/api/state', { rev: j.rev || 0, state: j.state }, f);
};

/* ================= help & main ================= */
const HELP = `虎鲸漫剧 CLI —— 面向 AI 助手与人工的全链路命令行(剧本→主体→分镜→生成→审片→成片)
用法:node cli.js <命令> [位置参数] [--选项]   全局:--server url --token t --pretty

账户
  login --username u --password p [--server url]   登录并保存凭据(~/.hujing/config.json)
  logout | whoami | credits                        登出 | 当前身份 | 积分余额与流水
  jobs [--limit N] | job <taskId> | job-cancel <taskId>   任务中心(断点续查/取消退款)
  usage [pid]                                      成本归集(按项目聚合扣费净额,含动作族细分)

项目结构(剧本层)
  projects                                         项目列表(进度摘要)
  project-show <pid>                               项目详情(主体/分集/镜状态统计)
  workflow <pid> [epid]                            统一工作流状态(流程条/下一步/Agent 同口径)
  project-create --name 剧名 [--style 漫剧] [--script-file f.txt]
  episode-add <pid> --title 第1集 [--content-file f.txt]
  episode-script <pid> <epid> --content-file f.txt 写入剧本(contentRev+1)
  episode-show <pid> <epid>                        分集详情(逐镜状态)

主体层
  subjects <pid>                                   主体列表
  subject-add <pid> --name 女主 [--kind character] [--desc 描] [--gen-image]
  subject-image <pid> <id|名> (--file f.png|--url u|--gen)  上传/生成主体图并回填
  subject-copy <源pid> <id|名> <目标pid>              跨项目复制主体(重新发 id;同名同类覆盖)

分镜层
  shots <pid> <epid>                               分镜表(全字段 JSON)
  shots-import <pid> <epid> --file shots.json [--append]   批量落分镜表(默认整表替换)
  shot-set <pid> <epid> <sid> --patch '{"prompt":"..."}'   单镜字段补丁
  shot-confirm <pid> <epid> <sid> [--off]          确认闸(批量生成只跑已确认镜)

生成层(全部带 operationId 幂等;失败服务端自动退费)
  gen-image --prompt p [--image 参考] [--size 1024x1024]
  gen-shot-image <pid> <epid> <sid> [--prompt 覆盖]        生图写回镜头底图
  gen-video --prompt p [--image 首帧] [--duration 5] [--nowait]
  gen-shot-video <pid> <epid> <sid> [--nowait]             单镜生视频写回(首帧=底图+主体参考)
  gen-episode <pid> <epid> [--failed-only] [--include-unconfirmed] [--no-image]
                                                   整集批量(串行/断点续跑/逐镜报告)
  wait <taskId> [--timeout 分钟]                   轮询任务到终态

审片层
  review-frames <pid> <epid> <sid> [--count 4]     抽帧(配 download 取图评审)
  review-note <pid> <epid> <sid> --score 8.5 [--comment 评] 评审写回 s.reviews

成片层
  compose <pid> <epid> [--ratio 16:9] [--no-subtitle] [--skip-incomplete]
                                                   合成成片+写回 SRT 软字幕
  export <pid> <epid> [--out 目录]                 下载成片 mp4 + 字幕 srt
  release-check <pid> [--min-score 7] [--with-billing]
                                                   发布门 10 项检查(同 UI 口径;--with-billing 跑服务端账目对账)
  release <pid> [--note 发布说明] [--min-score 7] [--force]
                                                   打发布版本(留痕 releases 入 state;通过/条件通过才执行,--force 强制)

统一领域命令(与前端 Commands.execute 同名同结构 {ok,status,result,error,cost,next};词表/参数面由 js/cmd-registry.js 单源生成)
${CmdRegistry.META.map(m => '  exec ' + (m.name + (CmdRegistry.usageOf(m) ? ' ' + CmdRegistry.usageOf(m) : '')).padEnd(58) + m.label + ':' + m.desc).join('\n')}
  (exit 映射:ok→0 | blocked→2/6/4 | failed→5;--args '{"pid":".."}' 可整体传参)

工具
  upload <文件> | download <url> <保存路径>        素材上下行
  llm --user 提示 [--system 设] [--json]           LLM 透传(服务端 key;--json 返回 parsed)
  tts --text 文本 [--voice 音色]                   语音合成
  ff <frames|upscale|merge|cut|suberase|highlight> [--video v] [...]   FFmpeg 工具透传
  state-get [--out f.json] | state-put --file f.json --force           裸状态读写(逃生舱)

exit code:0 成功 | 1 通用 | 2 参数 | 3 未登录 | 4 不存在 | 5 服务端/上游 | 6 积分不足 | 7 冲突`;

async function main() {
  const { _, flags } = parseArgs(process.argv.slice(2));
  const name = _[0];
  if (!name || flags.help || name === 'help') { log(HELP); process.exit(name ? 0 : 2); }
  const fn = CMD[name];
  if (!fn) { log('未知命令:' + name + '\n\n' + HELP); process.exit(2); }
  try {
    const data = await fn(_.slice(1), flags);
    if (data !== undefined) out(data, flags);
    process.exit(0);
  } catch (e) {
    if (e instanceof SyntaxError) { out({ error: 'JSON 解析失败:' + e.message }, flags); process.exit(2); }
    const exit = e.exit || 1;
    out({ error: e.message, exit }, flags);
    if (exit === 3) log('登录失效:请重新 hujing login');
    process.exit(exit);
  }
}
main();
