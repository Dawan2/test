#!/usr/bin/env node
/* ============ mcp.js 虎鲸漫剧 MCP server(stdio,零依赖) ============
 * 把 cli.js 的全链路命令包装为 MCP 工具,供支持 MCP 的 AI 助手(Claude Code/Cursor/Trae 等)
 * 以协议方式调用:工具调用 =  spawn node cli.js <命令>(stdout 纯 JSON 原样透传,exit code 映射 isError)。
 *
 * 协议:stdio 传输,换行分隔的 JSON-RPC 2.0 消息;实现 initialize/ping/tools/list/tools/call
 *   + resources/list|resources/read(只读状态资源,免反复拼工具调用)+ prompts/list|prompts/get(流程模板)。
 * 配置(客户端 mcpServers 示例):
 *   { "hujing": { "command": "node", "args": ["C:/Users/EDY/modelvideo-hujing/mcp.js"] } }
 * 认证:与 CLI 共用 ~/.hujing/config.json(先 node cli.js login);HUJING_SERVER/HUJING_TOKEN 环境变量优先。
 * 注意:生成类工具(gen-episode/gen-shot-video 等)为真实计费调用,计费/退费/幂等全部由服务端原样生效。 */
'use strict';
const { spawn } = require('child_process');
const path = require('path');
const readline = require('readline');

const CLI = path.join(__dirname, 'cli.js');
const CmdRegistry = require('./js/cmd-registry.js'); // 领域命令词表/描述单源(hujing_exec 等工具描述由此生成)
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
  { name: 'hujing_exec', description: '统一领域命令透传(与前端 Commands.execute 同名同结构;词表单源 cmd-registry.js):' + CmdRegistry.META.map(m => m.name + '(' + m.label + ')').join('、'), inputSchema: obj({ name: Object.assign({}, S, { description: '命令名:' + CmdRegistry.names().join(' / ') }), args: { type: 'object', description: '命令参数,如 {"pid":"..","epid":".."};各命令参数面见 cmd-registry.js' } }, ['name']), build: i => ['exec', i.name, '--args', JSON.stringify(i.args || {})] },
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

/* ---- 只读资源(§2.7):高频状态查询暴露成 resource,助手按 URI 直读,不必记工具参数面 ---- */
const RESOURCES = [
  { uri: 'hujing://projects', name: '项目列表', description: '项目列表(进度摘要),同 hujing_projects 工具', mimeType: 'application/json' },
];
const RESOURCE_TEMPLATES = [
  { uriTemplate: 'hujing://project/{pid}/show', name: '项目详情', description: '主体/分集/逐镜状态统计,同 hujing_project_show 工具', mimeType: 'application/json' },
  { uriTemplate: 'hujing://project/{pid}/workflow', name: '项目工作流状态', description: '主线各阶段完成度与下一步推荐(项目级),同 hujing_workflow 工具', mimeType: 'application/json' },
  { uriTemplate: 'hujing://project/{pid}/episode/{epid}/workflow', name: '分集工作流状态', description: '分集级阶段完成度与下一步推荐,同 hujing_workflow 工具', mimeType: 'application/json' },
];
/* URI → cli argv;不匹配返回 null */
function resourceArgv(uri) {
  const u = String(uri || '');
  if (u === 'hujing://projects') return ['projects'];
  let m = u.match(/^hujing:\/\/project\/([^/]+)\/show$/);
  if (m) return ['project-show', decodeURIComponent(m[1])];
  m = u.match(/^hujing:\/\/project\/([^/]+)\/workflow$/);
  if (m) return ['workflow', decodeURIComponent(m[1])];
  m = u.match(/^hujing:\/\/project\/([^/]+)\/episode\/([^/]+)\/workflow$/);
  if (m) return ['workflow', decodeURIComponent(m[1]), decodeURIComponent(m[2])];
  return null;
}
async function readResource(uri) {
  const argv = resourceArgv(uri);
  if (!argv) return { error: { code: -32602, message: '未知资源 URI:' + uri + '(可用资源见 resources/list)' } };
  const r = await runCli(argv);
  if (r.code !== 0) return { error: { code: -32603, message: (r.out || '资源读取失败') + (r.err ? ' [stderr] ' + r.err.slice(-300) : '') } };
  return { result: { contents: [{ uri: String(uri), mimeType: 'application/json', text: r.out || '{}' }] } };
}

/* ---- 流程模板(§2.7):把正确的工具调用序列一次交给助手,不用自己猜命令顺序 ---- */
const PROMPTS = [
  {
    name: 'hujing_new_drama', description: '新剧开工流程:从剧名/剧本到成片发布的正确工具调用序列',
    arguments: [
      { name: 'name', description: '剧名', required: true },
      { name: 'style', description: '风格(如 漫剧/真人短剧,可空)', required: false },
    ],
    build(a) {
      const style = a.style ? ',风格 "' + a.style + '"' : '';
      return [{ role: 'user', content: { type: 'text', text:
`新剧《${a.name}》开工(${style})。按以下顺序调用虎鲸漫剧工具,每步确认成功再进下一步:
1. hujing_project_create 建项目(有剧本文本文件就带 scriptFile),记下返回的 pid。
2. hujing_episode_add 逐集建分集(带 contentFile 写入剧本正文;后补用 hujing_episode_script)。写剧本会使下游理解/分镜自动判旧,属正常。
3. hujing_subject_add 建主要角色/场景主体并 genImage=true 生成参考图——空主体库会导致逐镜换脸,这步不要省。
4. hujing_storyboard 智能分镜(或 hujing_exec episode.generateStoryboard),然后 hujing_shots 检查分镜表。
5. 精修:hujing_shot_set 修订单镜提示词;逐镜 hujing_shot_confirm 确认(批量生成只跑已确认镜)。
6. hujing_exec episode.generateVideos 批量出片(未确认镜自动跳过并如实进 skipped)。
7. hujing_smart_review 整集审片;不达标镜修提示词后重生成。
8. hujing_compose 合成成片;hujing_export 下载 mp4+srt。
9. hujing_release_check 发布门检查(可 withBilling=true 对账)→ hujing_release 打版本。
约束:任何一步返回 blocked/isError,先读错误码(unconfirmed/no-credits/no-script)对症处理,不要跳步重试;随时可调 hujing_workflow 或读资源 hujing://project/{pid}/workflow 看下一步推荐。` } }];
    },
  },
  {
    name: 'hujing_failed_shots', description: '失败镜排查流程:断点续查→失败重跑→复审合成的正确顺序',
    arguments: [
      { name: 'pid', description: '项目 id', required: true },
      { name: 'epid', description: '分集 id', required: true },
    ],
    build(a) {
      return [{ role: 'user', content: { type: 'text', text:
`排查项目 ${a.pid} 分集 ${a.epid} 的失败镜,按此顺序:
1. hujing_workflow(pid="${a.pid}", epid="${a.epid}") 看阶段状态与阻塞项(或读资源 hujing://project/${a.pid}/episode/${a.epid}/workflow)。
2. hujing_shots 拉分镜表,筛 video.status=="failed" 的镜头,逐个读 error 与 upstreamId。
3. 轮询超时/任务失联类失败:hujing_wait(taskId=upstreamId) 断点续查——上游已成功会直接落片,不重复扣费。
4. 上游报错/质量不达标:hujing_shot_set 修订提示词 → hujing_gen_episode(failedOnly=true) 只重跑失败镜。
5. 全部转 done 后 hujing_smart_review 复审 → hujing_compose 合成。
禁止:不要带着失败镜直接 compose(skipIncomplete 仅限明确接受缺镜的场景);重跑前确认积分余额(hujing_credits)。` } }];
    },
  },
];

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
      return respond(id, { protocolVersion: PROTOCOL_VERSION, capabilities: { tools: {}, resources: {}, prompts: {} }, serverInfo: SERVER_INFO });
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
    if (method === 'resources/list') {
      return respond(id, { resources: RESOURCES, resourceTemplates: RESOURCE_TEMPLATES });
    }
    if (method === 'resources/templates/list') { // 旧版客户端单独拉模板
      return respond(id, { resourceTemplates: RESOURCE_TEMPLATES });
    }
    if (method === 'resources/read') {
      const r = await readResource(params && params.uri);
      return respond(id, r.result, r.error);
    }
    if (method === 'prompts/list') {
      return respond(id, { prompts: PROMPTS.map(p => ({ name: p.name, description: p.description, arguments: p.arguments })) });
    }
    if (method === 'prompts/get') {
      const p = params || {};
      const tpl = PROMPTS.find(x => x.name === p.name);
      if (!tpl) return respond(id, null, { code: -32602, message: '未知提示模板:' + p.name });
      const missing = tpl.arguments.filter(x => x.required && !(p.arguments || {})[x.name]);
      if (missing.length) return respond(id, null, { code: -32602, message: '缺必填参数:' + missing.map(x => x.name).join(',') });
      return respond(id, { description: tpl.description, messages: tpl.build(p.arguments || {}) });
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
process.stderr.write('[hujing-mcp] stdio MCP server 已就绪(' + TOOLS.length + ' 工具 + ' + (RESOURCES.length + RESOURCE_TEMPLATES.length) + ' 资源 + ' + PROMPTS.length + ' 提示模板,包装 cli.js)\n');
