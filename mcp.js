#!/usr/bin/env node
/* ============ mcp.js 虎鲸漫剧 MCP server(stdio,零依赖) ============
 * 把 cli.js 的全链路命令包装为 MCP 工具,供支持 MCP 的 AI 助手(Claude Code/Cursor/Trae 等)
 * 以协议方式调用:工具调用 =  spawn node cli.js <命令>(stdout 纯 JSON 原样透传,exit code 映射 isError)。
 *
 * 协议:stdio 传输,换行分隔的 JSON-RPC 2.0 消息;实现 initialize/ping/tools/list/tools/call。
 * 配置(客户端 mcpServers 示例):
 *   { "hujing": { "command": "node", "args": ["C:/Users/EDY/modelvideo-hujing/mcp.js"] } }
 * 认证:与 CLI 共用 ~/.hujing/config.json(先 node cli.js login);HUJING_SERVER/HUJING_TOKEN 环境变量优先。
 * 注意:生成类工具(gen-episode/gen-shot-video 等)为真实计费调用,计费/退费/幂等全部由服务端原样生效。 */
'use strict';
const { spawn } = require('child_process');
const path = require('path');
const readline = require('readline');

const CLI = path.join(__dirname, 'cli.js');
const PROTOCOL_VERSION = '2024-11-05';
const SERVER_INFO = { name: 'hujing-manju', version: '1.0.0' };

/* ---- 工具表:name/description/inputSchema + build(input)→cli argv ---- */
const S = { type: 'string' };
const B = { type: 'boolean' };
const N = { type: 'number' };
const obj = (properties, required) => ({ type: 'object', properties, required: required || [] });
const pidEp = { pid: Object.assign({}, S, { description: '项目 id' }), epid: Object.assign({}, S, { description: '分集 id' }) };

const TOOLS = [
  { name: 'hujing_whoami', description: '当前登录身份与服务器地址', inputSchema: obj({}), build: () => ['whoami'] },
  { name: 'hujing_credits', description: '积分余额与最近流水', inputSchema: obj({}), build: () => ['credits'] },
  { name: 'hujing_usage', description: '成本归集:按项目聚合扣费净额(含 图/视/LLM/音/工具 动作族细分)', inputSchema: obj({ pid: Object.assign({}, S, { description: '项目 id(缺省为全部项目)' }) }), build: i => ['usage'].concat(i.pid ? [i.pid] : []) },
  { name: 'hujing_projects', description: '项目列表(进度摘要)', inputSchema: obj({}), build: () => ['projects'] },
  { name: 'hujing_project_show', description: '项目详情(主体/分集/逐镜状态统计)', inputSchema: obj({ pid: pidEp.pid }, ['pid']), build: i => ['project-show', i.pid] },
  { name: 'hujing_workflow', description: '统一工作流状态:主线各阶段完成度与下一步推荐(Domain 单源推导,与 UI/Agent 同口径)', inputSchema: obj({ pid: pidEp.pid, epid: Object.assign({}, S, { description: '分集 id(缺省为项目级)' }) }, ['pid']), build: i => ['workflow', i.pid].concat(i.epid ? [i.epid] : []) },
  { name: 'hujing_project_create', description: '新建项目(可选导入剧本文件)', inputSchema: obj({ name: Object.assign({}, S, { description: '剧名' }), style: Object.assign({}, S, { description: '风格,如 漫剧/真人短剧' }), scriptFile: Object.assign({}, S, { description: '剧本文本文件路径' }) }, ['name']), build: i => ['project-create', '--name', i.name].concat(i.style ? ['--style', i.style] : [], i.scriptFile ? ['--script-file', i.scriptFile] : []) },
  { name: 'hujing_episode_add', description: '新建分集(可选写入剧本正文)', inputSchema: obj({ pid: pidEp.pid, title: Object.assign({}, S, { description: '分集标题,如 第1集' }), contentFile: Object.assign({}, S, { description: '剧本正文文件路径' }) }, ['pid', 'title']), build: i => ['episode-add', i.pid, '--title', i.title].concat(i.contentFile ? ['--content-file', i.contentFile] : []) },
  { name: 'hujing_episode_script', description: '写入/替换分集剧本正文(contentRev+1,下游理解/分镜自动判旧)', inputSchema: obj({ pid: pidEp.pid, epid: pidEp.epid, contentFile: Object.assign({}, S, { description: '剧本正文文件路径' }) }, ['pid', 'epid', 'contentFile']), build: i => ['episode-script', i.pid, i.epid, '--content-file', i.contentFile] },
  { name: 'hujing_subjects', description: '主体(角色/场景/道具)列表', inputSchema: obj({ pid: pidEp.pid }, ['pid']), build: i => ['subjects', i.pid] },
  { name: 'hujing_subject_add', description: '新增主体(可选立即 AI 生成参考图)', inputSchema: obj({ pid: pidEp.pid, name: Object.assign({}, S, { description: '主体名' }), kind: Object.assign({}, S, { description: 'character|scene|prop(缺省 character)' }), desc: S, genImage: Object.assign({}, B, { description: '立即生成参考图(计费)' }) }, ['pid', 'name']), build: i => ['subject-add', i.pid, '--name', i.name].concat(i.kind ? ['--kind', i.kind] : [], i.desc ? ['--desc', i.desc] : [], i.genImage ? ['--gen-image'] : []) },
  { name: 'hujing_subject_image', description: '上传/生成主体参考图并回填(计费)', inputSchema: obj({ pid: pidEp.pid, subject: Object.assign({}, S, { description: '主体 id 或名称' }), file: Object.assign({}, S, { description: '本地图片路径' }), url: S, gen: Object.assign({}, B, { description: 'AI 生成(计费)' }) }, ['pid', 'subject']), build: i => ['subject-image', i.pid, i.subject].concat(i.file ? ['--file', i.file] : [], i.url ? ['--url', i.url] : [], i.gen ? ['--gen'] : []) },
  { name: 'hujing_shots', description: '分镜表(全字段 JSON)', inputSchema: obj(pidEp, ['pid', 'epid']), build: i => ['shots', i.pid, i.epid] },
  { name: 'hujing_shots_import', description: '批量导入分镜表(默认整表替换,--append 追加)', inputSchema: obj(Object.assign({}, pidEp, { file: Object.assign({}, S, { description: 'shots.json 文件路径' }), append: B }), ['pid', 'epid', 'file']), build: i => ['shots-import', i.pid, i.epid, '--file', i.file].concat(i.append ? ['--append'] : []) },
  { name: 'hujing_shot_set', description: '单镜字段补丁(剧情/提示词/旁白/台词等)', inputSchema: obj(Object.assign({}, pidEp, { sid: Object.assign({}, S, { description: '镜头 id 或序号' }), patch: { type: 'object', description: '字段补丁,如 {"prompt":"..."}' } }), ['pid', 'epid', 'sid', 'patch']), build: i => ['shot-set', i.pid, i.epid, i.sid, '--patch', JSON.stringify(i.patch)] },
  { name: 'hujing_shot_confirm', description: '镜头确认闸:确认/取消确认(批量生成只跑已确认镜)', inputSchema: obj(Object.assign({}, pidEp, { sid: Object.assign({}, S, { description: '镜头 id 或序号' }), off: Object.assign({}, B, { description: '取消确认' }) }), ['pid', 'epid', 'sid']), build: i => ['shot-confirm', i.pid, i.epid, i.sid].concat(i.off ? ['--off'] : []) },
  { name: 'hujing_storyboard', description: '智能分镜(服务端工作流:LLM 拆镜并写回分镜表,计费)', inputSchema: obj(Object.assign({}, pidEp, { plans: Object.assign({}, N, { description: '候选方案数 1-3' }), shotCount: Object.assign({}, N, { description: '分镜数量(2-40)' }) }), ['pid', 'epid']), build: i => ['exec', 'episode.generateStoryboard', '--args', JSON.stringify({ pid: i.pid, epid: i.epid, sbPlans: i.plans, shotCount: i.shotCount })] },
  { name: 'hujing_understanding', description: '本集理解(服务端工作流:LLM 剧情理解写回,计费)', inputSchema: obj(pidEp, ['pid', 'epid']), build: i => ['exec', 'episode.understanding', '--args', JSON.stringify({ pid: i.pid, epid: i.epid })] },
  { name: 'hujing_smart_review', description: '整集智能审片(服务端工作流:逐镜评审+共性汇总,需已出片,计费)', inputSchema: obj(pidEp, ['pid', 'epid']), build: i => ['exec', 'episode.smartReview', '--args', JSON.stringify({ pid: i.pid, epid: i.epid })] },
  { name: 'hujing_gen_episode', description: '整集批量生成视频(串行/断点续跑/逐镜报告,真实计费)', inputSchema: obj(Object.assign({}, pidEp, { failedOnly: Object.assign({}, B, { description: '只重跑失败镜' }), includeUnconfirmed: Object.assign({}, B, { description: '含未确认镜' }), noImage: Object.assign({}, B, { description: '跳过底图生成' }) }), ['pid', 'epid']), build: i => ['gen-episode', i.pid, i.epid].concat(i.failedOnly ? ['--failed-only'] : [], i.includeUnconfirmed ? ['--include-unconfirmed'] : [], i.noImage ? ['--no-image'] : []) },
  { name: 'hujing_gen_shot_video', description: '单镜生成视频写回(首帧=底图+主体参考,真实计费)', inputSchema: obj(Object.assign({}, pidEp, { sid: Object.assign({}, S, { description: '镜头 id 或序号' }), nowait: Object.assign({}, B, { description: '只创建任务不等待(返回 taskId 供 hujing_wait)' }) }), ['pid', 'epid', 'sid']), build: i => ['gen-shot-video', i.pid, i.epid, i.sid].concat(i.nowait ? ['--nowait'] : []) },
  { name: 'hujing_wait', description: '轮询任务到终态(断点续查:已成功直接落片不重复扣费)', inputSchema: obj({ taskId: Object.assign({}, S, { description: '上游任务 id' }), timeout: Object.assign({}, N, { description: '超时分钟数' }) }, ['taskId']), build: i => ['wait', i.taskId].concat(i.timeout ? ['--timeout', String(i.timeout)] : []) },
  { name: 'hujing_review_note', description: '人工评审写回(评分+评语进 s.reviews)', inputSchema: obj(Object.assign({}, pidEp, { sid: Object.assign({}, S, { description: '镜头 id 或序号' }), score: Object.assign({}, N, { description: '评分 0-10' }), comment: S }), ['pid', 'epid', 'sid', 'score']), build: i => ['review-note', i.pid, i.epid, i.sid, '--score', String(i.score)].concat(i.comment ? ['--comment', i.comment] : []) },
  { name: 'hujing_compose', description: '合成成片(拼接+字幕烧录,写回 SRT 软字幕,计费)', inputSchema: obj(Object.assign({}, pidEp, { ratio: Object.assign({}, S, { description: '如 16:9 / 9:16' }), noSubtitle: B, skipIncomplete: Object.assign({}, B, { description: '跳过未出片镜头' }) }), ['pid', 'epid']), build: i => ['compose', i.pid, i.epid].concat(i.ratio ? ['--ratio', i.ratio] : [], i.noSubtitle ? ['--no-subtitle'] : [], i.skipIncomplete ? ['--skip-incomplete'] : []) },
  { name: 'hujing_export', description: '下载成片 mp4 + 字幕 srt 到本地目录', inputSchema: obj(Object.assign({}, pidEp, { out: Object.assign({}, S, { description: '输出目录' }) }), ['pid', 'epid']), build: i => ['export', i.pid, i.epid].concat(i.out ? ['--out', i.out] : []) },
  { name: 'hujing_release_check', description: '发布门 10 项检查(与 UI 同口径;withBilling 跑服务端账目对账)', inputSchema: obj({ pid: pidEp.pid, minScore: N, withBilling: B }, ['pid']), build: i => ['release-check', i.pid].concat(i.minScore ? ['--min-score', String(i.minScore)] : [], i.withBilling ? ['--with-billing'] : []) },
  { name: 'hujing_release', description: '打发布版本(留痕 releases;通过/条件通过才执行,force 强制)', inputSchema: obj({ pid: pidEp.pid, note: S, minScore: N, force: B }, ['pid']), build: i => ['release', i.pid].concat(i.note ? ['--note', i.note] : [], i.minScore ? ['--min-score', String(i.minScore)] : [], i.force ? ['--force'] : []) },
  { name: 'hujing_exec', description: '统一领域命令透传(与前端 Commands.execute 同名同结构):episode.preflight/generateVideos/compose/produce、shot.generateVideo 等', inputSchema: obj({ name: Object.assign({}, S, { description: '命令名,如 episode.generateVideos' }), args: { type: 'object', description: '命令参数,如 {"pid":"..","epid":".."}' } }, ['name']), build: i => ['exec', i.name, '--args', JSON.stringify(i.args || {})] },
  { name: 'hujing_llm', description: 'LLM 透传(服务端 key;自由提示词,剧本/文案类辅助)', inputSchema: obj({ user: Object.assign({}, S, { description: '用户提示词' }), system: S, json: Object.assign({}, B, { description: '期望返回 JSON(自动解析)' }) }, ['user']), build: i => ['llm', '--user', i.user].concat(i.system ? ['--system', i.system] : [], i.json ? ['--json'] : []) },
];

/* ---- 调 CLI:stdout 纯 JSON 透传;exit code → isError(附 stderr 诊断) ---- */
function runCli(argv) {
  return new Promise(resolve => {
    let out = '', err = '';
    let cp;
    try { cp = spawn(process.execPath, [CLI].concat(argv), { cwd: __dirname, env: process.env }); }
    catch (e) { return resolve({ code: 1, out, err: String(e) }); }
    cp.stdout.on('data', d => { out += d; });
    cp.stderr.on('data', d => { err += d; });
    cp.on('error', e => resolve({ code: 1, out, err: err + String(e) }));
    cp.on('close', code => resolve({ code: code || 0, out: out.trim(), err: err.trim() }));
  });
}

async function callTool(name, input) {
  const t = TOOLS.find(x => x.name === name);
  if (!t) return { content: [{ type: 'text', text: '未知工具:' + name }], isError: true };
  let argv;
  try { argv = t.build(input || {}); }
  catch (e) { return { content: [{ type: 'text', text: '参数错误:' + ((e && e.message) || e) }], isError: true }; }
  const r = await runCli(argv);
  const text = r.out || '(无输出)';
  if (r.code === 0) return { content: [{ type: 'text', text }] };
  const diag = r.err ? '\n[stderr] ' + r.err.slice(-500) : '';
  return { content: [{ type: 'text', text: text + diag + `\n[exit ${r.code}:0 成功|1 通用|2 参数|3 未登录|4 不存在|5 服务端|6 积分不足|7 冲突]` }], isError: true };
}

/* ---- JSON-RPC 2.0 over stdio(换行分隔) ---- */
function respond(id, result, error) {
  const msg = { jsonrpc: '2.0', id };
  if (error) msg.error = error; else msg.result = result;
  process.stdout.write(JSON.stringify(msg) + '\n');
}

async function handle(msg) {
  const { id, method, params } = msg;
  const isNotif = id === undefined || id === null;
  try {
    if (method === 'initialize') {
      return respond(id, { protocolVersion: PROTOCOL_VERSION, capabilities: { tools: {} }, serverInfo: SERVER_INFO });
    }
    if (method === 'ping') return respond(id, {});
    if (method === 'tools/list') {
      return respond(id, { tools: TOOLS.map(t => ({ name: t.name, description: t.description, inputSchema: t.inputSchema })) });
    }
    if (method === 'tools/call') {
      const p = params || {};
      const result = await callTool(p.name, p.arguments);
      return respond(id, result);
    }
    if (isNotif) return; // notifications/initialized 等:不应答
    respond(id, null, { code: -32601, message: 'Method not found: ' + method });
  } catch (e) {
    if (!isNotif) respond(id, null, { code: -32603, message: String((e && e.message) || e) });
  }
}

const rl = readline.createInterface({ input: process.stdin, terminal: false });
rl.on('line', line => {
  const t = line.trim();
  if (!t) return;
  let msg;
  try { msg = JSON.parse(t); } catch (_) { return; } // 非 JSON 行静默忽略(容错)
  handle(msg);
});
process.stderr.write('[hujing-mcp] stdio MCP server 已就绪(' + TOOLS.length + ' 工具,包装 cli.js)\n');
