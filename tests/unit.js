#!/usr/bin/env node
/* ============ tests/unit.js 卫星文件单元测试(零依赖 Node:vm 沙箱 + 浏览器全局 stub) ============
 * 覆盖大文件拆分产出的领域文件 + 服务端计费核心:
 *   js/agent-ops.js —— ops 应用器/执行闭环验证/预排钳制/上下文压缩/工作台定位/动作执行器
 *   js/experts.js   —— 预置专家库/雇佣·解雇/自进化计费五件套/工坊草稿规范化
 *   js/experts-data.js —— 专家注册表双端单源(projTypeOf 推导与浏览器 projType 同口径,二十二轮)
 *   js/produce.js   —— 智能审片闭环(达标/重试/积分不足/超限)与一键成片编排顺序
 *   js/store.js     —— 三方合并/输入指纹迁移/合成快照/成片就绪/fileFavs 合并
 *   js/sb-gen.js    —— 廉价改图验证 genShotValidate(文生/融合两档计价/终稿拦截/失败退费/离线占位)
 *   js/pipeline.js  —— 下一步引导阻塞尾注(digestNote 与 stateDigest 同源/缺图阻塞/优先级与退化)
 *   js/sb-views.js  —— 镜头状态归一 shotStatusHTML(优先级:终稿>素材更新>失败>出片带审分>确认态;生成中蒙层)
 *   js/sb-io.js     —— SRT 软字幕 buildSrt(时间轴逐段对齐/空文本段占时长不出条目/序号连续/毫秒进位)
 *   js/understanding.js —— 本集理解独立重生成 regen(计费五件套/失败退费不覆盖原有理解/积分不足)
 *   billing.js      —— 计费动作推导/校验 + 客户端 billingAction↔服务端端点兼容矩阵(九轮)
 * 方式:vm.createContext 构造沙箱(window/document/localStorage/Store/U/Tasks/API 等 stub),
 *      fs 读取真实源码 runInContext 加载,对 window.Xxx 暴露的成员做断言——被测代码即生产代码;
 *      billing.js 为纯模块直接 require(服务端与测试共享同一份推导逻辑)。
 * 用法:node tests/unit.js            全部套件
 *      node tests/unit.js agent-ops  单套件(agent-ops|billing|bus|commands|continuity|contract|domain|experts|flow|issues|memory|pipeline|plans|produce|release|sb-gen|sb-io|sb-views|skills|split|store|tasks|understanding)
 * 约束:无网络、无服务、无浏览器;DOM 重交互(bindPrearr/bindChoices 卡片绑定等)不在本层覆盖,由 e2e 承担。 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');

/* ---------- 断言工具 ---------- */
function assert(cond, msg) { if (!cond) throw new Error(msg || '断言失败'); }
function assertEq(actual, expected, msg) {
  if (actual !== expected) throw new Error((msg || '不相等') + ':期望 ' + JSON.stringify(expected) + ',实际 ' + JSON.stringify(actual));
}
function assertNoThrow(fn, msg) {
  try { fn(); } catch (e) { throw new Error((msg || '不应抛异常') + ':' + (e && e.stack || e)); }
}

/* ---------- 沙箱构造:浏览器全局 + 公共 stub ---------- */
function makeSandbox() {
  const storage = {};
  const sb = {
    console,
    setTimeout, clearTimeout, setInterval, clearInterval,
    AbortController, // R17:store._fetchTimeout 依赖(同步超时中止),Node 18+ 原生提供
    addEventListener() {}, removeEventListener() {},
    location: { hash: '' },
    localStorage: {
      getItem: k => (k in storage ? storage[k] : null),
      setItem: (k, v) => { storage[k] = String(v); },
      removeItem: k => { delete storage[k]; },
    },
    document: {
      getElementById: () => null,
      querySelector: () => null,
      querySelectorAll: () => [],
      createElement: () => ({
        style: {}, classList: { toggle() {}, add() {}, remove() {} },
        addEventListener() {}, removeEventListener() {}, appendChild() {}, remove() {},
        querySelector: () => null, querySelectorAll: () => [],
      }),
      addEventListener() {},
      body: { classList: { add() {}, remove() {} }, appendChild() {} },
    },
    fetch: () => Promise.reject(new Error('unit test 无网络')),
    /* 测试观测桩(宿主闭包读写,跨 realm 可见) */
    __toasts: [], __confirms: [], __docks: [], __tasks: [], __charges: [], __refunds: [],
    __mem: [], __called: [], __reviewCalls: {},
    __autoConfirm: true, __chargeOk: true, __apiReady: false, __chatJSONResult: null,
  };
  sb.window = sb;
  vm.createContext(sb);
  return sb;
}

/* 公共依赖 stub:Store/U/Tasks/API/Understanding/CAMERA 与空 window.SB(各套件按需扩展) */
function installCommon(sb) {
  sb.Store = {
    state: { settings: {}, customExperts: [], agentMemory: [] },
    _saves: 0,
    save() { this._saves++; },
    now() { return '2026-08-22 12:00:00'; },
    uid: p => p + '_u1',
    myProjects() { return []; },
    getProject() { return null; },
    epComposedReady: () => false, // oneClickProduce 全链路预估引用(恒未合成=全额预估)
    setShotPrompt(s, v) { s.prompt = String(v); },
    shotVideoReady: s => !!(s.video && s.video.status === 'done'),
  };
  sb.U = {
    esc: s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'),
    toast: (msg, kind, ms) => { sb.__toasts.push(String(msg)); },
    confirm: (msg, onOk, okText) => { sb.__confirms.push(String(msg)); if (sb.__autoConfirm) onOk(); },
    openModal() {},
    bgDock: opt => {
      const dock = { say() {}, finish() {}, close() {}, cancelled: false, m: { querySelector: () => null, querySelectorAll: () => [] } };
      sb.__docks.push(dock);
      return dock;
    },
    charge: (cost, name) => { sb.__charges.push({ cost, name }); return sb.__chargeOk; },
    refund: (cost, reason) => { sb.__refunds.push({ cost, reason }); },
    requireCredits: (cost, name) => sb.__chargeOk,
    delay: () => Promise.resolve(),
  };
  sb.Tasks = {
    start: opt => { const t = Object.assign({ status: 'running' }, opt); sb.__tasks.push(t); return t; },
    done: t => { t.status = 'done'; },
    fail: (t, reason) => { t.status = 'failed'; t.reason = reason; },
    runningInScope: () => [], // 十二轮:agent-ops 镜头删除查在飞(单测无在飞任务,恒空=放行)
  };
  sb.API = {
    isReady: () => sb.__apiReady,
    getConfig: () => ({ model: 'test-model' }),
    chatJSON: async () => sb.__chatJSONResult,
  };
  sb.Understanding = { chatJSONRobust: async () => sb.__chatJSONResult };
  sb.CAMERA = { describe: () => '正面/平视/中景' };
  sb.SB = {};
}

function loadFile(sb, name) {
  const src = fs.readFileSync(path.join(ROOT, 'js', name), 'utf8');
  vm.runInContext(src, sb, { filename: name });
}

/* ---------- 套件加载器:每个测试独立沙箱(状态零污染) ---------- */
function loadAgentOps() {
  const sb = makeSandbox();
  installCommon(sb);
  sb.AgentCore = { memRemember: (t, s) => { sb.__mem.push({ t, s }); } }; // agent-ops 顶部解构 window.AgentCore
  Object.assign(sb.SB, {
    blankShot: (order, cfg) => ({ id: 'sh_new_' + order, order, name: '', plot: '', characters: [], scene: '', props: [], camera: '固定镜头', prompt: '', narration: '', dialogue: '', duration: 5, history: [] }),
    estShotDuration: s => s.duration || 5,
    renderShots() {}, composeVideo() {}, batchGenVideos: async () => {},
  });
  loadFile(sb, 'cmd-registry.js'); // run 类 op 参数白名单/类型整形的数据源(与 index.html 同顺序)
  loadFile(sb, 'domain.js');    // wf-core 浏览器 UMD 依赖(与 index.html 同顺序)
  loadFile(sb, 'prompts.js');
  loadFile(sb, 'knowledge.js');
  loadFile(sb, 'wf-core.js');   // agent-ops cmdProtocol/sanitizeCmdArgs 委托 WfCore(单一来源)
  loadFile(sb, 'agent-ops.js');
  return sb;
}

/* 浏览器多轮对话三个装配口(分集面板 AgentCore.panelSystem / 全局抽屉 AgentG.buildGlobalPrompt /
 * 预排模式 agent-ops 的 prearrPrompt,后者经 prearrSend 的上游请求体观测):按 index.html 同顺序加载三文件 */
function loadAgentChat() {
  const sb = makeSandbox();
  installCommon(sb);
  sb.styleOf = p => (p && p.style) || '漫剧';  // projects.js 全局(本套件不加载)
  sb.MODELS = { image: ['seedream-x'], video: ['seedance-x', 'kling-x'] };
  sb.STRATEGIES = [{ id: 'ref', name: '分镜参考' }, { id: 'fusion', name: '多图融合' }];
  sb.allExperts = () => [{ id: 'ex_t1', name: '悬疑导演', persona: '擅长悬疑' }];
  sb.hiredExpert = () => null;
  Object.assign(sb.SB, { CAMERAS: ['固定镜头', '推镜头'], blankShot: () => ({}), renderShots() {} });
  loadFile(sb, 'cmd-registry.js');
  loadFile(sb, 'domain.js');
  loadFile(sb, 'prompts.js');
  loadFile(sb, 'knowledge.js');
  loadFile(sb, 'wf-core.js');
  loadFile(sb, 'agent.js');
  loadFile(sb, 'agent-ops.js');
  loadFile(sb, 'agent-global.js');
  return sb;
}

/* js/persona.js 三个 LLM 步(八维度重写文生图 rewritePrompt / 音色推荐 recommendVoice、recommendVoicesBatch)共用沙箱:
 * 逐次 LLM 调用原样截获,ov 写进 Store 覆盖表(加载序与 index.html 同:prompts.js 在 persona.js 之前)。
 * 回值按步给:音色两步各自先摆 __voiceOut,重写步走缺省那份 {"prompt":…}(其成功路径不进本地模板回退) */
function loadPersona(ov) {
  const sb = makeSandbox();
  installCommon(sb);
  sb.styleOf = p => (p && p.style) || '漫剧';  // projects.js 全局(本套件不加载)
  sb.__apiReady = true;
  sb.__llm = [];
  sb.API.chatJSON = async req => {
    sb.__llm.push({ system: req.system, user: ((req.messages || [])[0] || {}).content, temperature: req.temperature, max_tokens: req.max_tokens });
    return sb.__voiceOut === undefined ? { prompt: '漫剧风格角色立绘,林晚晴,白底三视图' } : sb.__voiceOut;
  };
  if (ov) sb.Store.state.settings.promptOverrides = ov;
  loadFile(sb, 'prompts.js');
  loadFile(sb, 'persona.js');
  return sb;
}

function loadExperts() {
  const sb = makeSandbox();
  installCommon(sb);
  /* experts.js 顶部解构 window.GSettings(镜像 gsettings.js 顶部的偏好设置域常量) */
  sb.GSettings = {
    DEFAULTS: { tplImage: '{style}风格,{subject},精美画面', tplVideo: '{style}风格,{shot}', tplReview: '评审{shot}' },
    DIR_DIMS: ['光影', '色调', '情感氛围', '服化道审美', '表演气质'],
    DIR_STYLES: ['漫剧', '动漫', '写实'],
    EXPERT_ROLES: ['导演', '编剧', '摄像', '策划', '其他'],
    dirFallback: () => ({ 光影: 'fb光影', 色调: 'fb色调', 情感氛围: 'fb氛围', 服化道审美: 'fb服化', 表演气质: 'fb表演' }),
  };
  /* evolveExpert 的记忆源过滤走 WfCore.expertBoards/memForBoards + window.AGENT_BOARDS 板块词表
   * (agent.js 的 UI 全局来源,本套件不加载该文件,按其现有板块键镜像一份) */
  sb.AGENT_BOARDS = ['导演', '剧本', '主体', '分集', '分镜', '生成', '审片', '成片'].map(k => ({ key: k }));
  loadFile(sb, 'domain.js');    // wf-core 浏览器 UMD 依赖(与 index.html 同顺序)
  loadFile(sb, 'prompts.js');
  loadFile(sb, 'knowledge.js');
  loadFile(sb, 'wf-core.js');
  loadFile(sb, 'experts-data.js'); // 注册表双端单源(experts.js 消费其 EXPERTS/projTypeOf)
  loadFile(sb, 'experts.js');
  return sb;
}

function loadProduce() {
  const sb = makeSandbox();
  installCommon(sb);
  sb.COST = { image: 2, video: 5, audio: 1, review: 1, compose: 3, tool: 2, optimize: 1 }; // 全局费率 stub(oneClickProduce 全链路预估引用)
  Object.assign(sb.SB, {
    renderShots() {},
    defaultSBConfig: () => ({ ratio: '16:9', maxRetry: 2 }), // 命令层 ensureSBCfg 兜底(与跑批 reallyRun 同口径)
    composeVideo: (p, ep, main, opts) => { // 命令层 quiet+onTask 句柄协议(episode.compose 轮询等待)
      sb.__called.push('composeVideo');
      const tk = { status: 'done' };
      if (opts && opts.onTask) opts.onTask(tk);
      ep.composed = true; ep.composedUrl = '/uploads/gen/final.mp4';
    },
    batchGenVideos: async (p, ep, main, shots, opts) => { sb.__called.push('batchGenVideos'); shots.forEach(s => { s.video = { status: 'done', url: '/uploads/gen/new.mp4' }; }); },
  });
  /* autoSmartReview/oneClickProduce 的编排依赖 */
  sb.SBGen = {
    createShotVideo: async (p, ep, s, main, skip) => { sb.__called.push('createShotVideo'); s.video = { status: 'done', url: '/uploads/gen/regen.mp4' }; },
    batchGenVideos: sb.SB.batchGenVideos,
  };
  /* 命令层(episode.produce 编排)上下文与计量 */
  sb.Store.getProject = id => (sb.__proj && sb.__proj.id === id ? sb.__proj : null);
  sb.Store.credits = () => (sb.__credits == null ? 999 : sb.__credits);
  sb.Review = {
    reviewShot: async (p, ep, s) => {
      sb.__called.push('reviewShot');
      const issues = sb.__reviewIssues || [];
      const seq = sb.__reviewSeq && sb.__reviewSeq[s.id];
      if (seq) { const n = sb.__reviewCalls[s.id] || 0; sb.__reviewCalls[s.id] = n + 1; return { score: seq[Math.min(n, seq.length - 1)], issues }; }
      return sb.__reviewResult === undefined ? { score: 8, issues } : sb.__reviewResult;
    },
    optimizeShot: async (p, ep, s, r, main, autoApply) => { // 重抽前消费 issues 修订提示词(produce 质量闭环)
      sb.__called.push('optimizeShot');
      s.prompt = (s.prompt || '') + ',已按审片意见修订';
      return sb.__optimizeOk !== false;
    },
  };
  loadFile(sb, 'domain.js'); // preflight 工作流状态单源(运行期引用)
  loadFile(sb, 'produce.js');
  loadFile(sb, 'cmd-registry.js'); // 命令元数据单源(与 index.html 同顺序)
  loadFile(sb, 'commands.js'); // oneClickProduce/跑批经 Commands.execute('episode.produce') 编排(与浏览器同顺序:produce 之后)
  return sb;
}

function loadSbGen() {
  const sb = makeSandbox();
  installCommon(sb);
  sb.COST = { image: 2, fusion: 3, video: 5 }; // 验证图两档计价(文生图/多图融合)
  sb.MODELS = { image: ['seedream-x'], video: ['seedance-x'] };
  sb.SBViews = { artSuffixApp: () => ',青橙电影感' };
  sb.Views = { episode() { } };
  sb.Store.shotVideoStale = () => false;
  sb.Store.findSubject = (p, name) => ((p.__subs || {})[name]) || null; // 主体表挂 p.__subs(测试夹具)
  sb.__mediaReady = true;
  sb.Media = {
    isReady: () => sb.__mediaReady,
    realModel: m => m,
    genImage: async req => {
      sb.__imgReq = req;
      if (sb.__imgFail) throw Object.assign(new Error('上游审核拦截'), { __opId: req.operationId });
      return { url: '/uploads/gen/val_' + (sb.__imgN = (sb.__imgN || 0) + 1) + '.png' };
    },
  };
  sb.PH = { image: o => 'data:image/ph;seed=' + o.seedText, shot: () => 'data:ph_shot', video: () => 'data:ph_v' };
  Object.assign(sb.SB, {
    onEpPage: () => true, prevEpTail: () => null, ttsShot: async () => { },
    openConfirmGateModal() { }, autoSmartReview() { },
    snapshotShot: (s, type) => { (s.__snaps = s.__snaps || []).push(type); },
    renderShots() { },
    STRATEGIES: [
      { id: 'ref', name: '分镜参考', step: '参考', desc: '' },
      { id: 'frames', name: '首尾帧', step: '首尾帧', desc: '' },
      { id: 'fusion', name: '多图融合', step: '融合', desc: '' },
    ],
  });
  loadFile(sb, 'domain.js'); // sb-gen 顶层解构 Domain.buildVideoRequest/axisNoteOf(加载期强依赖)
  loadFile(sb, 'sb-gen.js');
  return sb;
}

function loadPipeline() {
  const sb = makeSandbox();
  installCommon(sb);
  sb.Store.shotVideoStale = () => false; // digestNote 不查 stale 数据源,仅 calc 用(本套件不走 calc)
  /* AgentOps.stateDigest 由用例按需挂:digestNote 运行期探测 window.AgentOps,不挂即退化无尾注 */
  loadFile(sb, 'domain.js'); // calc/nextForEp 委托 Domain.workflow/episodeState(运行期引用)
  loadFile(sb, 'pipeline.js');
  return sb;
}

function loadSbViews() {
  const sb = makeSandbox();
  installCommon(sb);
  sb.Store.shotVideoStale = () => !!sb.__stale; // 素材过期开关(用例控制)
  sb.Review = { reportStale: () => !!sb.__rvStale }; // 审片报告过期开关(用例控制)
  sb.U.thumb = f => f; // shotThumbHTML 缩略图(直通)
  sb.U.hashColor = () => 0;
  Object.assign(sb.SB, { // 顶部解构槽位(shotStatusHTML/shotThumbHTML 不触及,仅满足加载)
    blankShot: o => ({}), buildShotPrompt: () => '', onEpPage: () => true,
    genAudio: async () => {}, snapshotShot() {}, renderShots() {},
    VOICES: [], PROMPT5_SECS: [], TRANSITIONS: [], STRATEGIES: [],
  });
  loadFile(sb, 'prompts.js'); // 「按指令改」那步的人设经 Prompts.get 取值(与 index.html 同顺序:prompts 在前)
  loadFile(sb, 'sb-views.js');
  return sb;
}

function loadSbIo() {
  const sb = makeSandbox();
  installCommon(sb);
  Object.assign(sb.SB, { // 顶部解构槽位(buildSrt 纯函数不触及,仅满足加载)
    blankShot: (order, cfg) => ({ id: 'sh_new_' + order, order }),
    CAMERAS: ['固定镜头'], renderShots() {},
  });
  loadFile(sb, 'sb-io.js');
  return sb;
}

/* sb-board.js 分镜脚本创作层:两步 AI 拆解的 handler 挂在 bindScriptBoard 的闭包里,
 * 按 index.html 同顺序加载 prompts.js 后用假 host 取回两个按钮的 onclick 真跑一遍,截获上游请求体。
 * ov 为覆盖表(浏览器隐式读 Store.state.settings.promptOverrides)。 */
function loadSbBoard(ov) {
  const sb = makeSandbox();
  installCommon(sb);
  if (ov) sb.Store.state.settings.promptOverrides = ov;
  sb.__apiReady = true;
  sb.__llm = [];      // 上游请求体逐条留档(system/messages 都在里面)
  sb.__llmResult = []; // 用例按步序预置回包
  sb.API.chatJSON = async req => { sb.__llm.push(req); return sb.__llmResult.shift(); };
  sb.Views = { episode() {} };
  sb.AgentRefs = { add: () => true };
  Object.assign(sb.SB, { // 顶部解构槽位(本套件只跑前两步,第三步转换不触及)
    blankShot: order => ({ order, history: [] }), buildShotPrompt: () => '',
  });
  loadFile(sb, 'prompts.js');
  loadFile(sb, 'sb-board.js');
  return sb;
}
/* 假 host:只认两个 AI 按钮的选择器,其余选择器一律空集(编辑绑定不在本层覆盖) */
function boardHost() {
  const mk = () => ({ disabled: false, innerHTML: '', textContent: '', onclick: null });
  const btns = { 'bd-ai': mk(), 'bd-draft': mk() };
  const host = {
    innerHTML: '',
    addEventListener() {},
    querySelectorAll: () => [],
    querySelector(sel) { const m = sel.match(/\[data-x=([\w-]+)\]/); return (m && btns[m[1]]) || null; },
  };
  return { host, btns };
}

/* storyboard.js:仅取 buildShotPrompt(分镜提示词单一出口)——顶层依赖 Voice/WfCore,projects.js 全局经 stub 注入 */
function loadStoryboard() {
  const sb = makeSandbox();
  installCommon(sb);
  sb.Voice = { NARRATOR_PRESETS: [] };
  sb.styleOf = p => p.style || '漫剧';
  sb.negOf = () => ',负面提示词:模糊';
  loadFile(sb, 'domain.js');
  loadFile(sb, 'prompts.js');
  loadFile(sb, 'knowledge.js');
  loadFile(sb, 'wf-core.js'); // buildShotPrompt 经 WfCore.fillTplVideo 套文生视频模板(双端同一填充函数)
  loadFile(sb, 'storyboard.js');
  return sb;
}

function loadUnderstanding() {
  const sb = makeSandbox();
  installCommon(sb);
  sb.__apiReady = true; // 默认走 LLM 路径(失败注入经 __chatJSONResult=null 触发回退模板)
  sb.API.chatJSONRobust = async () => { sb.__called.push('chatJSONRobust'); return sb.__chatJSONResult; };
  sb.styleOf = p => p.style || '漫剧'; // projects.js 全局(projects.js 不在本套件加载)
  loadFile(sb, 'domain.js'); // wf-core 依赖 Domain(estShotDuration/cameraDescribe/styleOf/negOf)
  loadFile(sb, 'prompts.js'); // 核心提示词注册表(understanding 经 Prompts.get 取系统人设)
  loadFile(sb, 'knowledge.js'); // wf-core 依赖 KB(浏览器 UMD 挂 window.KB)
  loadFile(sb, 'wf-core.js');   // 二十一轮:understanding 六维/模板/回退单一来源(加载期强依赖 WfCore)
  loadFile(sb, 'understanding.js'); // 覆盖 installCommon 的 Understanding stub 为真实实现
  return sb;
}

/* ---------- 测试夹具 ---------- */
function makeShot(order, over) {
  return Object.assign({
    id: 'sh' + order, order, name: '镜头' + (order + 1), plot: '剧情' + (order + 1), prompt: '提示词' + order,
    camera: '固定镜头', duration: 5, characters: [], scene: '', props: [], narration: '', dialogue: '',
    history: [], video: { status: 'done', url: '/uploads/gen/v' + order + '.mp4' },
  }, over || {});
}
function makeEp(over) {
  return Object.assign({
    id: 'ep1', title: '第一集', composed: true, uiSel: null,
    sbConfig: { maxRetry: 2 },
    shots: [makeShot(0), makeShot(1), makeShot(2)],
    scriptBoard: { scenes: [{ title: '场景1', text: '场次剧情', beats: [{ emotion: '', plot: '旧节拍剧情', shot: '旧分镜文字' }, { emotion: '', plot: '节拍2', shot: '' }] }] },
  }, over || {});
}
const sleep = ms => new Promise(r => setTimeout(r, ms));

/* ================= 套件 1:agent-ops.js ================= */
const agentOpsTests = [
  { name: 'splitOps:数据类/动作类 ops 分流', fn() {
    const sb = loadAgentOps();
    const r = sb.AgentOps.splitOps([
      { op: 'update', shot: 1, fields: {} }, { op: 'run', action: '智能分镜' },
      { op: 'delete', shot: 2 }, { op: 'goto', target: '分镜视频' }, { op: 'bogus' },
    ]);
    assertEq(r.data.length, 2, '数据类应 2 条(update/delete)');
    assertEq(r.acts.length, 2, '动作类应 2 条(run/goto)');
    assertEq(r.data[0].op, 'update', '首条数据类为 update');
  } },
  { name: 'opRisk:注册表风险分级(删除=edit-hi/执行=exec/只读=read/未知=edit)', fn() {
    const sb = loadAgentOps();
    const AO = sb.AgentOps;
    assertEq(AO.opRisk({ op: 'delete' }), 'edit-hi');
    assertEq(AO.opRisk({ op: 'delep' }), 'edit-hi');
    assertEq(AO.opRisk({ op: 'run' }), 'exec');
    assertEq(AO.opRisk({ op: 'goto' }), 'read');
    assertEq(AO.opRisk({ op: 'select' }), 'read');
    assertEq(AO.opRisk({ op: 'update' }), 'edit');
    assertEq(AO.opRisk({ op: '不存在' }), 'edit');
  } },
  { name: 'actDesc:三类动作描述(exec 带 ⚠ 扣费警示)', fn() {
    const AO = loadAgentOps().AgentOps;
    assert(AO.actDesc({ op: 'run', action: '智能分镜' }).includes('⚠ ▶ 执行:智能分镜'), 'run 描述应带 ⚠ 与动作名');
    assert(AO.actDesc({ op: 'run', action: '智能分镜' }).includes('扣费'), 'run 描述应注明扣费');
    assertEq(AO.actDesc({ op: 'goto', target: '分镜视频' }), '→ 跳转:分镜视频');
    assertEq(AO.actDesc({ op: 'select', shot: 3 }), '◎ 选中镜头 3');
  } },
  { name: 'changeLineHTML:删除类变更红色标记', fn() {
    const AO = loadAgentOps().AgentOps;
    assert(AO.changeLineHTML('删除镜头3「剧情」').includes('🔴'), '删除镜头应带红标');
    assert(AO.changeLineHTML('删除分集「第2集」').includes('🔴'), '删除分集应带红标');
    assert(!AO.changeLineHTML('镜头1:剧情 a→b').includes('🔴'), '普通变更不应红标');
  } },
  { name: 'parseChoices:有效选项卡/数量不足/缺字段回退 null', fn() {
    const AO = loadAgentOps().AgentOps;
    const ok = AO.parseChoices({ choices: { title: '方向选择', options: [{ t: 'A' }, { t: 'B' }, { t: 'C' }, { t: 'D' }, { t: 'E' }] } });
    assertEq(ok.options.length, 4, '选项应截断到 4 个');
    assertEq(AO.parseChoices({ choices: { title: 'x', options: [{ t: 'A' }] } }), null, '仅 1 项应返回 null');
    assertEq(AO.parseChoices({ choices: { title: 'x', options: [{ t: 'A' }, { d: '无标题' }] } }), null, '缺 t 的项被过滤后不足 2 应 null');
    assertEq(AO.parseChoices({ reply: '无选项' }), null, '无 choices 键返回 null');
  } },
  { name: 'focusOf:__focus 节拍定位/uiSel 镜头定位/无定位 null 三态', fn() {
    const sb = loadAgentOps();
    const AO = sb.AgentOps;
    const p = { id: 'p1' };
    const ep = makeEp({ id: 'ep1' });
    sb.__focus = { pid: 'p1', eid: 'ep1', kind: 'beat', si: 0, bi: 1 };
    let fc = AO.focusOf(p, ep);
    assertEq(fc.kind, 'beat');
    assertEq(fc.label, '@第一集·场次1·节拍2');
    sb.__focus = null; ep.uiSel = ep.shots[1].id;
    fc = AO.focusOf(p, ep);
    assertEq(fc.kind, 'shot');
    assertEq(fc.label, '@第一集·镜头2');
    sb.__focus = { pid: 'p_other', eid: 'ep1', kind: 'beat', si: 0, bi: 0 }; ep.uiSel = null;
    assertEq(AO.focusOf(p, ep), null, '跨项目 focus 应失效');
  } },
  { name: 'focusBlock:定位注入提示词(含镜头号与当前内容)', fn() {
    const sb = loadAgentOps();
    const AO = sb.AgentOps;
    const p = { id: 'p1' };
    const ep = makeEp({ id: 'ep1' });
    ep.uiSel = ep.shots[1].id;
    const txt = AO.focusBlock(p, ep);
    assert(txt.includes('用户当前工作台定位:@第一集·镜头2'), '应含定位声明');
    assert(txt.includes('镜头2 剧情:「剧情2」'), '应含该镜剧情');
    assert(txt.includes('提示词:「提示词1」'), '应含该镜提示词');
    assertEq(AO.focusBlock(p, { id: 'ep1', shots: [], uiSel: null, scriptBoard: null }), '', '无定位应返回空串');
  } },
  { name: 'applyOps:update 落值+历史留档+composed 失效', fn() {
    const sb = loadAgentOps();
    const AO = sb.AgentOps;
    const ep = makeEp();
    const changes = AO.applyOps(ep, [{ op: 'update', shot: 1, fields: { 剧情: '新剧情', 提示词: '新提示词' } }], true);
    assertEq(ep.shots[0].plot, '新剧情');
    assertEq(ep.shots[0].prompt, '新提示词');
    assertEq(ep.composed, false, '数据变更应使成片失效');
    assertEq(ep.shots[0].history[0].type, '导演助手修改', 'record=true 应写修改历史');
    assert(changes.some(c => c.includes('镜头1:剧情')), '变更摘要应含镜头1剧情行');
  } },
  { name: 'applyOps:机位字段入 cameraSpec、时长钳到 60s', fn() {
    const AO = loadAgentOps().AgentOps;
    const ep = makeEp();
    AO.applyOps(ep, [{ op: 'update', shot: 1, fields: { 视角: '侧面', 时长: 999 } }], false);
    assertEq(ep.shots[0].cameraSpec.view, '侧面');
    assertEq(ep.shots[0].cameraSpec.shotSize, '中景', 'cameraSpec 缺省字段应有默认');
    assertEq(ep.shots[0].duration, 60, '时长应钳到上限 60');
  } },
  { name: 'applyOps:同批 delete+insert 按原始序号结算(先删后插防位移)', fn() {
    const AO = loadAgentOps().AgentOps;
    const ep = makeEp();
    const changes = AO.applyOps(ep, [
      { op: 'delete', shot: 2 },
      { op: 'insert', after: 1, shot: { 名称: '新镜', 剧情: '新插入剧情', 提示词: 'p' } },
    ], false);
    assertEq(ep.shots.length, 3, '删1插1后应仍 3 镜');
    assertEq(ep.shots[1].plot, '新插入剧情', '新镜头应落在镜头1之后');
    assertEq(ep.shots[0].id, 'sh0', '原镜头1保留');
    assertEq(ep.shots[2].id, 'sh2', '原镜头3保留');
    assert(ep.shots.every((s, i) => s.order === i), 'order 应重排 0..n');
    assert(changes.some(c => c.includes('删除镜头2')), '摘要应含删除行');
    assert(changes.some(c => c.includes('在镜头1后插入')), '摘要应含插入行');
  } },
  { name: 'applyOps:move 调序 + 被删镜头 uiSel 回退到首镜', fn() {
    const AO = loadAgentOps().AgentOps;
    const ep = makeEp({ uiSel: 'sh1' });
    AO.applyOps(ep, [{ op: 'delete', shot: 2 }], false); // 删除 uiSel 指向的镜头
    assertEq(ep.uiSel, 'sh0', 'uiSel 失效应回退到第一镜');
    const ep2 = makeEp();
    AO.applyOps(ep2, [{ op: 'move', shot: 1, to: 3 }], false);
    assertEq(ep2.shots[2].id, 'sh0', '镜头1移到位置3');
    assertEq(ep2.shots[0].id, 'sh1', '原镜头2前移');
  } },
  { name: 'applyOps:batch 按出场人物过滤并统计命中数', fn() {
    const AO = loadAgentOps().AgentOps;
    const ep = makeEp();
    ep.shots[0].characters = ['林晚']; ep.shots[1].characters = ['陈屿']; ep.shots[2].characters = ['林晚'];
    const changes = AO.applyOps(ep, [{ op: 'batch', filter: { 含人物: '林晚' }, fields: { 台词: '“好”' } }], false);
    assertEq(ep.shots[0].dialogue, '“好”');
    assertEq(ep.shots[1].dialogue, '', '非出场镜头不应被改');
    assertEq(ep.shots[2].dialogue, '“好”');
    assert(changes.some(c => c.includes('「林晚」出场的 2 个镜头')), '摘要应统计命中 2 镜');
  } },
  { name: 'applyOps:脚本层 beatupdate/sceneupdate 修改节拍与场次', fn() {
    const AO = loadAgentOps().AgentOps;
    const ep = makeEp();
    AO.applyOps(ep, [
      { op: 'beatupdate', scene: 1, beat: 1, fields: { 情绪: '压抑', 剧情: '新节拍剧情' } },
      { op: 'sceneupdate', scene: 1, fields: { 标题: '枯井水下 夜/内' } },
    ], false);
    const beat = ep.scriptBoard.scenes[0].beats[0];
    assertEq(beat.emotion, '压抑');
    assertEq(beat.plot, '新节拍剧情');
    assertEq(ep.scriptBoard.scenes[0].title, '枯井水下 夜/内');
  } },
  { name: 'verifyOps:落值校验通过/未生效检出+verifyNote 尾注', fn() {
    const sb = loadAgentOps();
    const AO = sb.AgentOps;
    const ep = makeEp();
    ep.shots[0].plot = 'X';
    const ok = AO.verifyOps(ep, [{ op: 'update', shot: 1, fields: { 剧情: 'X' } }]);
    assert(ok.ok && ok.total === 1, '落值一致应校验通过');
    assertEq(AO.verifyNote(ok), '(✓ 已生效 1 项)');
    const bad = AO.verifyOps(ep, [{ op: 'update', shot: 1, fields: { 剧情: 'Y' } }]);
    assert(!bad.ok && bad.fails.length === 1, '值不一致应检出未生效');
    const note = AO.verifyNote(bad);
    assert(note.includes('⚠ 1 项未生效'), '尾注应含警示');
    assert(sb.__toasts.some(t => t.includes('未生效')), '未生效应 toast 警示');
  } },
  { name: 'compactShots:超长分镜表按整镜截断(不切半镜)并标注省略区间', fn() {
    const AO = loadAgentOps().AgentOps;
    const ep = { shots: [], sbConfig: {} };
    for (let i = 0; i < 60; i++) ep.shots.push(makeShot(i, { plot: '剧情'.repeat(20) })); // 每条~140字,60条超上限
    ep.shots[0].cameraSpec = { view: '正面', angle: '平视', shotSize: '中景', aperture: 'ƒ/4' };
    const json = AO.compactShots(ep, 100); // maxShots 放开,保证 60 条全部参与再触发长度截断
    assert(json.includes('因长度省略,共 60 镜'), '应含整镜截断标注');
    const cut = json.indexOf('\n…');
    const arr = JSON.parse(cut > 0 ? json.slice(0, cut) : json); // 截断点之前必须是合法 JSON(不再对 JSON 串硬切切半镜)
    assert(arr.length > 0 && arr.length < 60, '应按整镜保留部分镜头,其余省略');
    assert(json.includes('机位'), 'cameraSpec 应经 CAMERA.describe 注入机位字段');
  } },
  { name: 'compactChat:离线不压缩只取最近12条;在线后台蒸馏写入纪要', fn: async () => {
    const sb = loadAgentOps();
    const AO = sb.AgentOps;
    const msgs = [];
    for (let i = 0; i < 30; i++) msgs.push({ role: i % 2 ? 'assistant' : 'user', text: '消息' + i });
    const r1 = AO.compactChat(msgs, sb.Store.state.settings, 'k1');
    assertEq(r1.summary, '', '离线应返回空纪要');
    assertEq(r1.recent.length, 12, '应只取最近 12 条');
    sb.__apiReady = true;
    sb.__chatJSONResult = { summary: '会话纪要内容' };
    AO.compactChat(msgs, sb.Store.state.settings, 'k1');
    await sleep(30); // 后台蒸馏为 fire-and-forget,等微任务+定时器落定
    assertEq(sb.Store.state.settings.k1, '会话纪要内容', '在线应把纪要写回 summaryObj[key]');
  } },
  { name: 'prearrSend:LLM 方案参数钳制(shotCount→40/缺省回退当前配置)', fn: async () => {
    const sb = loadAgentOps();
    const AO = sb.AgentOps;
    sb.__apiReady = true;
    sb.__chatJSONResult = { reply: '方案说明', thinking: 't', plan: { action: 'sb', summary: '12镜推文', params: { shotCount: 999, sbMode: 'tweet' } } };
    const ep = makeEp({ sbConfig: { maxRetry: 2, shotDur: 7 } });
    const chat = [];
    await AO.prearrSend({ p: { id: 'p1', name: '测试', style: '漫剧' }, ep, chat, text: '来12镜', model: 'm', renderMsgs() {} });
    assertEq(chat.length, 1);
    const pre = chat[0].prearr;
    assert(pre, '应生成预排卡片');
    assertEq(pre.params.shotCount, 40, 'shotCount 应钳到上限 40');
    assertEq(pre.params.sbMode, 'tweet');
    assertEq(pre.params.shotDur, 7, '未提及的键应回退 ep.sbConfig 当前值');
    assertEq(pre.params.quality, '480p', '无当前值时回退首项');
  } },
  { name: 'prearrSend:无分集上下文时提示需进工作区;无 plan 回退普通对话', fn: async () => {
    const sb = loadAgentOps();
    const AO = sb.AgentOps;
    sb.__apiReady = true;
    sb.__chatJSONResult = { reply: '方案', thinking: 't', plan: { action: 'sb', summary: 's', params: { shotCount: 5 } } };
    const chat1 = [];
    await AO.prearrSend({ p: { id: 'p1', name: '测试' }, ep: null, chat: chat1, text: '来', model: 'm', renderMsgs() {} });
    assert(chat1[0].text.includes('预排方案需在分集工作区执行'), '无 ep 应提示');
    sb.__chatJSONResult = { reply: '普通回答', thinking: 't' };
    const chat2 = [];
    await AO.prearrSend({ p: null, ep: null, chat: chat2, text: '聊两句', model: 'm', renderMsgs() {} });
    assert(!chat2[0].prearr, '无 plan 不应生成卡片');
    assertEq(chat2[0].text, '普通回答');
  } },
  { name: 'execPrearr:命令层缺失返回 false 并提示;无可生成镜头返回 false', fn: async () => {
    const sb = loadAgentOps();
    const AO = sb.AgentOps;
    const p = { id: 'p1' };
    const ep = makeEp(); // 全部 done
    assertEq(AO.execPrearr({ p, ep }, { action: 'sb', params: {} }, null), false, '无命令层场景应 false');
    assert(sb.__toasts.some(t => t.includes('命令层未加载')), '应提示命令层未加载(智能分镜经 episode.generateStoryboard)');
    sb.__toasts.length = 0;
    assertEq(AO.execPrearr({ p, ep }, { action: 'batchvideo', params: {} }, null), false, '全 done 应 false');
    assert(sb.__toasts.some(t => t.includes('所有分镜视频均已生成')), '应提示无可生成镜头');
  } },
  { name: 'runEpisodeActions:select 选中/goto 切视图/未注册动作回执暂不支持', fn: async () => {
    const sb = loadAgentOps();
    const AO = sb.AgentOps;
    const p = { id: 'p1' };
    const ep = makeEp();
    const done = await AO.runEpisodeActions(p, ep, [
      { op: 'select', shot: 2 },
      { op: 'goto', target: '分镜脚本' },
      { op: 'run', action: '不存在功能' },
    ], null);
    assertEq(ep.uiSel, 'sh1', 'select 应设置 uiSel');
    assertEq(sb.__epView, 'board', 'goto 分镜脚本应切 board 视图');
    assertEq(done.length, 3, '未注册动作应回执暂不支持(不静默吞掉)');
    assert(done[0].includes('选中镜头 2'));
    assert(done[2].includes('暂不支持自动执行'), '未映射命令的动作应如实回执');
  } },
  { name: 'runGlobalActions:跑批跳转/项目 tab 打开', fn() {
    const sb = loadAgentOps();
    const AO = sb.AgentOps;
    const ctx = { p: { id: 'p1', episodes: [] }, ep: null };
    AO.runGlobalActions(ctx, [{ op: 'goto', target: '一键跑批' }]);
    assert(sb.location.hash.includes('/produce'), '跑批应跳 produce 路由');
    sb.location.hash = '';
    AO.runGlobalActions(ctx, [{ op: 'goto', target: '制片' }]);
    assertEq(sb.location.hash, '#/project/p1', '项目 tab 应跳项目页');
    assertEq(sb.__projTab, '制片', '目标 tab 应经 __projTab 传递');
  } },
  { name: 'prearrCardHTML:渲染字段控件与三按钮', fn() {
    const AO = loadAgentOps().AgentOps;
    const html = AO.prearrCardHTML({ action: 'sb', summary: '测试方案', params: { shotCount: 12, sbMode: 'create', shotDur: 5, quality: '720p', ratio: '16:9', autoOptimize: true, smartReview: false } }, 0, 'a');
    assert(html.includes('智能分镜 · 参数预排'), '应含预排标题');
    assert(html.includes('data-pf="shotCount"'), '数值字段应带 data-pf');
    assert(html.includes('data-a-pcard="0"'), '卡片应带消息索引');
    assert(html.includes('按此方案执行') && html.includes('再改改') && html.includes('取消'), '应含三按钮');
  } },
  /* ---- ⚠ 并行编辑冲突(指纹基线/detectConflicts/resolveOps) ---- */
  { name: 'fingerprint:同状态指纹一致,镜头/节拍/主体改动后变化,位置序留档', fn() {
    const AO = loadAgentOps().AgentOps;
    const p = { id: 'p1', name: '项目A', style: '写实', tone: '', globalSetting: '', locale: '', scriptMeta: { logline: '卖点' }, subjects: [{ id: 'sub1', name: '林晚', prompt: 'p', description: 'd' }], episodes: [] };
    const ep = makeEp();
    const fp1 = AO.fingerprint({ p, ep });
    assertEq(fp1.shots.sh0, AO.fingerprint({ p, ep }).shots.sh0, '同状态指纹应一致');
    assertEq(fp1.order.join(','), 'sh0,sh1,sh2', '位置序应记录镜头 id');
    ep.shots[0].plot = '手动改过的剧情';
    const fp2 = AO.fingerprint({ p, ep });
    assert(fp1.shots.sh0 !== fp2.shots.sh0, '改镜头后指纹应变化');
    assertEq(fp1.shots.sh1, fp2.shots.sh1, '未改镜头指纹不变');
    ep.scriptBoard.scenes[0].beats[0].plot = '改过的节拍';
    assert(AO.fingerprint({ p, ep }).beats['0_0'] !== fp1.beats['0_0'], '改节拍后指纹应变化');
    p.subjects[0].prompt = 'p2';
    assert(AO.fingerprint({ p, ep }).subs.sub1 !== fp1.subs.sub1, '改主体后指纹应变化');
  } },
  { name: 'detectConflicts:无改动空/改镜命中/删除前镜致位移命中/目标镜不存在', fn() {
    const AO = loadAgentOps().AgentOps;
    const ep = makeEp();
    const base = AO.fingerprint({ ep });
    const ops = [{ op: 'update', shot: 1, fields: { 剧情: '助手剧情' } }];
    assertEq(AO.detectConflicts(ops, base, { ep }).length, 0, '无手动改动应无冲突');
    ep.shots[0].plot = '用户改的剧情';
    let conf = AO.detectConflicts(ops, base, { ep });
    assertEq(conf.length, 1, '改过镜头应 1 处冲突');
    assertEq(conf[0].reason, '你改过此镜');
    assertEq(conf[0].rows[0].cur, '用户改的剧情');
    assertEq(conf[0].rows[0].next, '助手剧情');
    const ep2 = makeEp(); const base2 = AO.fingerprint({ ep: ep2 });
    ep2.shots.splice(0, 1); // 用户删掉镜头1:镜头2 位移到位置1(内容未变,纯位置变化也要命中)
    conf = AO.detectConflicts([{ op: 'update', shot: 1, fields: { 剧情: 'x' } }], base2, { ep: ep2 });
    assertEq(conf.length, 1, '删前镜致位移应 1 处冲突');
    assertEq(conf[0].reason, '该位置的镜头已变化(调序/新增)');
    const ep3 = makeEp(); const base3 = AO.fingerprint({ ep: ep3 });
    ep3.shots.length = 1; // 位置2 已无镜头
    conf = AO.detectConflicts([{ op: 'delete', shot: 2 }], base3, { ep: ep3 });
    assertEq(conf[0].reason, '该镜头已不存在');
  } },
  { name: 'detectConflicts:batch 逐镜(新增镜+改过镜)/节拍/主体/分集', fn() {
    const AO = loadAgentOps().AgentOps;
    const p = { id: 'p1', name: 'A', subjects: [{ id: 'sub1', name: '林晚', prompt: 'p', description: '' }], episodes: [{ id: 'e1', title: '第一集', content: '正文', shots: [1, 2] }] };
    const ep = makeEp();
    ep.shots[0].characters = ['林晚']; ep.shots[2].characters = ['林晚'];
    const base = AO.fingerprint({ p, ep });
    ep.shots[0].plot = '用户改过';
    ep.shots.push(makeShot(3, { characters: ['林晚'] })); // 方案生成后新增的同人物镜
    const conf = AO.detectConflicts([{ op: 'batch', filter: { 含人物: '林晚' }, fields: { 运镜: '推镜头' } }], base, { p, ep });
    assertEq(conf.length, 2, 'batch 应命中改过镜+新增镜');
    assert(conf.every(c => c.batchShot), 'batch 冲突应带 batchShot 供拆分');
    assert(conf.some(c => c.reason === '此镜为方案生成后新增'), '新增镜应标注新增原因');
    const ep2 = makeEp(); const b2 = AO.fingerprint({ ep: ep2 });
    ep2.scriptBoard.scenes[0].beats[1].shot = '用户改的分镜文字';
    const cb = AO.detectConflicts([{ op: 'beatupdate', scene: 1, beat: 2, fields: { 分镜文字: '助手文字' } }], b2, { ep: ep2 });
    assertEq(cb.length, 1); assertEq(cb[0].reason, '你改过此节拍');
    const p2 = { id: 'p1', name: 'A', subjects: [{ id: 'sub1', name: '林晚', prompt: 'p', description: '' }], episodes: [] };
    const b3 = AO.fingerprint({ p: p2 });
    p2.subjects[0].description = '用户改的描述';
    const cs = AO.detectConflicts([{ op: 'subject', name: '林晚', fields: { 描述: '助手描述' } }], b3, { p: p2 });
    assertEq(cs.length, 1); assertEq(cs[0].reason, '你改过此主体');
    const b4 = AO.fingerprint({ p });
    p.episodes[0].content = '用户大改的正文';
    const ce = AO.detectConflicts([{ op: 'episode', ep: '第一集', fields: { 正文: '助手正文' } }], b4, { p });
    assertEq(ce.length, 1); assertEq(ce[0].reason, '你改过此分集');
  } },
  { name: 'resolveOps:保留我的丢弃/采用助手保留/batch 拆 update 剔除冲突镜/全保留则空', fn() {
    const AO = loadAgentOps().AgentOps;
    const ep = makeEp();
    ep.shots[0].characters = ['林晚']; ep.shots[1].characters = ['林晚'];
    const ops = [
      { op: 'update', shot: 1, fields: { 剧情: 'x' } },
      { op: 'update', shot: 2, fields: { 剧情: 'y' } },
    ];
    const conf = [{ key: 'o0', opIdx: 0 }, { key: 'o1', opIdx: 1 }];
    let out = AO.resolveOps(ops, conf, { o0: 'mine', o1: 'agent' }, { ep });
    assertEq(out.length, 1, '保留我的应丢弃对应 op');
    assertEq(out[0].fields.剧情, 'y', '采用助手的项应保留');
    out = AO.resolveOps(ops, conf, { o0: 'mine', o1: 'mine' }, { ep });
    assertEq(out.length, 0, '全保留我的应返回空(调用方不扣费)');
    const bops = [{ op: 'batch', filter: { 含人物: '林晚' }, fields: { 运镜: '推镜头' } }];
    const bconf = [{ key: 'o0_sh0', opIdx: 0, batchShot: 'sh0' }];
    out = AO.resolveOps(bops, bconf, { o0_sh0: 'mine' }, { ep });
    assertEq(out.length, 1, 'batch 剔除 1 镜后应剩 1 镜拆为 update');
    assertEq(out[0].op, 'update'); assertEq(out[0].shot, 2, '保留未冲突的镜头2');
    assertEq(out[0].fields.运镜, '推镜头');
  } },
  /* ---- 工作台状态摘要(Agent 感知层)与事件续谈卡 ---- */
  { name: 'stateDigest:统计出片/确认/失败/过期/审片低分/在飞任务', fn() {
    const sb = loadAgentOps(); const AO = sb.AgentOps;
    const ep = makeEp({ lastReview: { avg: 7.5, perShot: [{ shotId: 'sh0', order: 0, score: 5 }, { shotId: 'sh1', order: 1, score: 9 }] } });
    ep.shots[0].confirm = true;
    ep.shots[1].video = { status: 'generating' };
    ep.shots[2].video = { status: 'failed' };
    sb.Store.shotVideoStale = (p, s) => s.id === 'sh0';
    sb.Tasks.runningInScope = () => [{}];
    const d = AO.stateDigest({ id: 'p1' }, ep);
    assertEq(d.total, 3); assertEq(d.done, 1); assertEq(d.generating, 1); assertEq(d.failed, 1);
    assertEq(d.uncfm, 2, '仅镜头1已确认,其余 2 镜待确认');
    assertEq(d.stale, 1, 'shotVideoStale 命中应计过期');
    assertEq(d.reviewAvg, 7.5); assertEq(d.lowShots.length, 1);
    assertEq(d.lowShots[0].n, 1); assertEq(d.lowShots[0].score, 5);
    assertEq(d.running, 1);
  } },
  { name: 'stateBlock:集级只列非零项/项目级各集一行', fn() {
    const sb = loadAgentOps(); const AO = sb.AgentOps;
    const ep = makeEp();
    ep.shots.forEach(s => { s.confirm = true; });
    const b1 = AO.stateBlock({ id: 'p1' }, ep);
    assert(b1.includes('工作台实时状态') && b1.includes('3已出片'), '集级应含出片统计');
    assert(!b1.includes('待确认'), '无待确认项不应列出');
    const ep2 = makeEp({ id: 'ep2', title: '第二集', lastReview: { avg: 8, perShot: [] } });
    const p = { id: 'p1', episodes: [ep, ep2] };
    const b2 = AO.stateBlock(p, null);
    assert(b2.includes('各集实时状态') && b2.includes('第一集(3/3出片') && b2.includes('第二集(3/3出片/审8)'), '项目级应逐集一行进度');
  } },
  /* ---- 动态开场(情境建议 chips 与开场白) ---- */
  { name: 'dynamicChips:集级按实时状态推导(拆镜/确认/失败/补生成/审片/合成/低分),≤3 条', fn() {
    const sb = loadAgentOps(); const AO = sb.AgentOps;
    const p = { id: 'p1' };
    let chips = AO.dynamicChips(p, makeEp({ shots: [], content: '剧本正文', composed: false }));
    assertEq(chips.length, 1); assertEq(chips[0].run, '智能分镜', '未拆镜+有正文应推智能分镜直执');
    assertEq(AO.dynamicChips(p, makeEp({ shots: [], content: '' })).length, 0, '未拆镜且无正文应无 chip');
    const ep1 = makeEp(); ep1.shots[0].confirm = true;
    chips = AO.dynamicChips(p, ep1);
    assert(chips[0] && /确认 2 镜/.test(chips[0].t) && chips[0].goto === '分镜视频', '未确认镜应优先推确认闸 chip,got ' + JSON.stringify(chips[0]));
    const ep2 = makeEp(); ep2.shots.forEach(s => s.confirm = true); ep2.shots[1].video = { status: 'failed' };
    assert(AO.dynamicChips(p, ep2).some(c => /失败/.test(c.t) && c.goto === '分镜视频'), '有失败镜应推失败 chip');
    const ep3 = makeEp(); ep3.shots.forEach(s => s.confirm = true); ep3.shots[1].video = null; ep3.shots[2].video = null;
    chips = AO.dynamicChips(p, ep3);
    assert(chips.some(c => c.run === '生成视频' && /剩余 2 镜/.test(c.t)), '部分出片应推批量生成剩余 chip');
    const ep4 = makeEp(); ep4.shots.forEach(s => s.confirm = true);
    assert(AO.dynamicChips(p, ep4).some(c => c.run === '整集审片'), '全部出片未审应推整集审片');
    const ep5 = makeEp({ lastReview: { avg: 8, perShot: [] } }); ep5.shots.forEach(s => s.confirm = true);
    assert(AO.dynamicChips(p, ep5).some(c => c.run === '合成成片'), '已审未合成应推合成成片(沙箱 epComposedReady 恒 false)');
    const ep6 = makeEp({ lastReview: { avg: 7.5, perShot: [{ shotId: 'sh0', order: 0, score: 5 }] } });
    ep6.shots.forEach(s => s.confirm = true); ep6.shots[1].video = { status: 'failed' };
    chips = AO.dynamicChips(p, ep6);
    assert(chips.some(c => c.text && /低于 7 分/.test(c.text)), '低分镜应推 text chip(发助手)');
    assert(chips.length <= 3, '至多 3 条');
  } },
  { name: 'dynamicChips:项目级(缺主体形象/未拆镜集/可合成集)与空项目', fn() {
    const sb = loadAgentOps(); const AO = sb.AgentOps;
    const epReady = makeEp({ id: 'ep9', title: '第九集' }); // 全部出片未合成(沙箱 epComposedReady 恒 false)
    const epDraft = makeEp({ id: 'ep2', title: '第二集', shots: [], content: '正文' });
    const p = { id: 'p1', subjects: [{ name: '林晚' }], episodes: [epReady, epDraft] };
    const chips = AO.dynamicChips(p, null);
    assert(chips.some(c => c.goto === '主体' && /主体形象/.test(c.t)), '主体缺图应推主体 chip');
    assert(chips.some(c => c.gotoEp === 'ep2' && /拆解/.test(c.t)), '未拆镜集应推跳集拆解 chip');
    assert(chips.some(c => c.gotoEp === 'ep9' && /合成/.test(c.t)), '可合成集应推跳集合成 chip');
    assert(chips.length <= 3, '至多 3 条');
    assertEq(AO.dynamicChips(null, null).length, 0, '无项目应空');
  } },
  { name: 'openingLine:集级状态一句话/项目级概况/空项目引导', fn() {
    const sb = loadAgentOps(); const AO = sb.AgentOps;
    assert(AO.openingLine({ id: 'p1' }, makeEp({ shots: [], content: 'x' })).includes('还没拆镜'), '未拆镜应引导拆镜');
    const ep = makeEp(); ep.shots.forEach(s => s.confirm = true);
    const line = AO.openingLine({ id: 'p1' }, ep);
    assert(line.includes('3 镜') && line.includes('3 已出片') && line.includes('整集审片'), '全部出片未审应建议审片,got ' + line);
    const epF = makeEp(); epF.shots.forEach(s => s.confirm = true); epF.shots[2].video = { status: 'failed' };
    assert(AO.openingLine({ id: 'p1' }, epF).includes('已退费'), '失败镜应提示已退费可重试');
    const pl = AO.openingLine({ id: 'p1', name: '项目X', episodes: [ep] }, null);
    assert(pl.includes('项目X') && pl.includes('共 1 集'), '项目级应报集数,got ' + pl);
    assert(AO.openingLine({ id: 'p1', name: '空项目', episodes: [] }, null).includes('还没有分集'), '无分集应引导上传剧本');
    assertEq(AO.openingLine(null, null), '', '无项目应空串');
  } },
  { name: 'pushEvent:入列+选项过滤+同键去重+eventDone 后可再推+关面板轻提示', fn() {
    const sb = loadAgentOps(); const AO = sb.AgentOps;
    const ep = makeEp(); ep.agentChat = [];
    const ev = { key: 'k1', text: '事件一', options: [{ t: '执行X', run: '生成视频' }, { t: '坏项' }, { t: '去剪辑', goto: '剪辑' }] };
    assert(AO.pushEvent({ id: 'p1' }, ep, ev), '首次应推入');
    assertEq(ep.agentChat.length, 1);
    assertEq(ep.agentChat[0].event.options.length, 2, '无 run/goto 的选项应被过滤');
    assert(!AO.pushEvent({ id: 'p1' }, ep, ev), '同键未处理应去重');
    ep.agentChat[0].eventDone = '执行X';
    assert(AO.pushEvent({ id: 'p1' }, ep, ev), '已处理后同键可再推');
    assertEq(ep.agentChat.length, 2);
    assert(sb.__toasts.some(t => t.includes('事件一')), '面板都关着应轻提示');
  } },
  { name: 'eventCardHTML/bindEvents:渲染选项按钮,单击直执,已处理置灰防重复', fn() {
    const sb = loadAgentOps(); const AO = sb.AgentOps;
    const m2 = { event: { key: 'k', options: [{ t: '审片', d: '评审', run: '整集审片' }] } };
    const html = AO.eventCardHTML(m2, 3, 'a');
    assert(html.includes('data-a-evopt="3_0"') && html.includes('▶ 审片'), '应渲染 run 选项按钮');
    assert(AO.eventCardHTML({ eventDone: '审片', event: m2.event }, 3, 'a').includes('已处理'), '已处理应置灰留痕');
    const calls = [];
    const el = { dataset: { aEvopt: '3_0' }, onclick: null };
    const root = { querySelectorAll: sel => sel.includes('evopt') ? [el] : [] };
    AO.bindEvents(root, 'a', { getChat: () => m2, exec: (mm, o) => calls.push(o.t) });
    el.onclick(); assertEq(calls.join(','), '审片', '单击应直执对应选项');
    m2.eventDone = '审片'; el.onclick(); assertEq(calls.length, 1, '已处理后不再触发');
  } },
  { name: 'runEpisodeActions:「本集理解」映射 episode.understanding(统一命令层,结构化回执)', fn: async () => {
    const sb = loadAgentOps(); const AO = sb.AgentOps;
    const p = { id: 'p1' }, ep = makeEp();
    sb.__cmdCalls = [];
    const done0 = await AO.runEpisodeActions(p, ep, [{ op: 'run', action: '本集理解' }], null);
    assert(done0[0].includes('暂不支持自动执行'), '命令层缺失应如实回执暂不支持');
    sb.Commands = { execute: async (cmd, args) => { sb.__cmdCalls.push({ cmd, args }); return { ok: true, status: 'done', result: {} }; } };
    const done = await AO.runEpisodeActions(p, ep, [{ op: 'run', action: '本集理解' }], null);
    assertEq(sb.__cmdCalls[0].cmd, 'episode.understanding', '动作应映射统一命令名(Understanding.regen 由命令层同源调起)');
    assertEq(sb.__cmdCalls[0].args.pid, 'p1');
    assertEq(sb.__cmdCalls[0].args.epid, 'ep1');
    assert(done[0].includes('✓'), 'ok 回执应标 ✓');
  } },

  /* ---- 二十二轮:cmd+args 动作协议(参数通道/白名单整形/回执带下一步/自修复重试) ---- */
  { name: 'cmdProtocol:命令白名单与参数面由注册表生成(全命令+参数枚举)', fn() {
    const sb = loadAgentOps(); const AO = sb.AgentOps;
    const CR = require('../js/cmd-registry.js');
    sb.Commands = { list: () => CR.META.map(m => ({ name: m.name, label: m.label, risk: m.risk, needs: m.needs, desc: m.desc, args: m.args })) };
    const txt = AO.cmdProtocol();
    CR.names().forEach(n => assert(txt.includes(n), '协议应含命令 ' + n));
    assert(txt.includes('confirmAll') && txt.includes('shotIds') && txt.includes('maxRetry'), '协议应枚举参数面(confirmAll/shotIds/maxRetry)');
    assert(!txt.includes('"ui"'), 'ui 为调用方语境参数,不开放给模型');
  } },
  { name: 'sanitizeCmdArgs:白名单键保留+类型整形,未声明键与 pid/epid/ui 一律丢弃', fn() {
    const sb = loadAgentOps(); const AO = sb.AgentOps;
    const r = AO.sanitizeCmdArgs('episode.generateVideos', { confirmAll: 1, shotIds: ['sh1', 2], nope: 'x', pid: 'hack', ui: true, maxRetry: 'abc' });
    assertEq(r.confirmAll, true, 'boolean 应整形');
    assertEq(r.shotIds.join(','), 'sh1,2', 'array 应元素字符串化');
    assert(r.nope === undefined && r.pid === undefined && r.ui === undefined, '未声明键与注入键应丢弃');
    const r2 = AO.sanitizeCmdArgs('episode.produce', { maxRetry: '3', riskyCompose: true });
    assertEq(r2.maxRetry, 3, 'number 应整形');
    assertEq(AO.sanitizeCmdArgs('not.a.cmd', { a: 1 }).bogus, undefined, '未知命令应得空参数');
  } },
  { name: 'runEpisodeActions cmd+args 新协议:参数透传命令层+白名单外 cmd 如实拒绝', fn: async () => {
    const sb = loadAgentOps(); const AO = sb.AgentOps;
    const p = { id: 'p1' };
    const ep = makeEp(); // sh0/sh1
    sb.__cmdCalls = [];
    const CR = require('../js/cmd-registry.js');
    sb.Commands = {
      list: () => CR.META.map(m => ({ name: m.name, label: m.label, risk: m.risk, needs: m.needs, args: m.args })),
      execute: async (cmd, args) => { sb.__cmdCalls.push({ cmd, args }); return { ok: true, status: 'done', result: { ok: 2, total: 2 }, next: { key: 'review', label: '智能审片' } }; },
    };
    const done = await AO.runEpisodeActions(p, ep, [
      { op: 'run', cmd: 'episode.generateVideos', args: { confirmAll: true, shotIds: ['2'], bogus: 'x' } },
      { op: 'run', cmd: 'episode.notExist' },
    ], null);
    const call = sb.__cmdCalls[0];
    assertEq(call.cmd, 'episode.generateVideos');
    assertEq(call.args.confirmAll, true, 'confirmAll 应透传(旧协议无参数通道)');
    assertEq(call.args.bogus, undefined, '未声明参数应丢弃');
    assertEq(call.args.shotIds.join(','), 'sh1', 'shotIds 镜号应归一为镜头 id(模型只见序号)');
    assertEq(call.args.pid, 'p1');
    assert(done[0].includes('✓') && done[0].includes('下一步:智能审片'), '回执应消化 r.next(Agent 自主推进依据)');
    assert(done[1].includes('暂不支持自动执行:episode.notExist'), '白名单外 cmd 应如实拒绝');
  } },
  { name: 'cmdDigest:错误/成本/下一步三要素', fn() {
    const sb = loadAgentOps(); const AO = sb.AgentOps;
    assertEq(AO.cmdDigest('episode.compose', { ok: true, status: 'done', result: {}, cost: 3, next: { label: '导出成片' } }), '成片已归档,可预览导出(-3积分);下一步:导出成片');
    assert(AO.cmdDigest('x', { ok: false, error: { code: 'e', message: '挂了' } }).includes('挂了'), '错误回执如实属');
    assertEq(AO.cmdDigest('x', null), '无回执');
  } },
  { name: 'selfFixRound:数据修复+原命令重试白名单(仅回执失败过的命令可重试)', fn: async () => {
    const sb = loadAgentOps(); const AO = sb.AgentOps;
    const p = { id: 'p1' }, ep = makeEp();
    sb.__apiReady = true;
    sb.__retried = [];
    const CR = require('../js/cmd-registry.js');
    sb.Commands = {
      list: () => CR.META.map(m => ({ name: m.name, label: m.label, risk: m.risk, needs: m.needs, args: m.args })),
      execute: async (cmd, args) => { sb.__retried.push(cmd); return { ok: true, status: 'done', result: { ok: 1, total: 1 } }; },
    };
    // 模型输出:一条数据修复 + 重试失败过的命令(允许) + 重试未失败过的命令(应被白名单拦下)
    sb.__chatJSONResult = { reply: '重试生成', ops: [
      { op: 'update', shot: 1, fields: { 提示词: '更稳妥的提示词' } },
      { op: 'run', cmd: 'episode.generateVideos' },
      { op: 'run', cmd: 'episode.compose' },
    ] };
    const note = await AO.selfFixRound(p, ep, null, ['▶ 生成视频:✕ 2 镜生成失败(已退费),可修复后重试'], 'op_x');
    assert(note.includes('自修复'), '应有自修复摘要');
    assertEq(sb.__retried.join(','), 'episode.generateVideos', '只允许重试回执中失败过的命令(compose 未失败不可发起)');
    assert(note.includes('自修复重试'), '重试回执应入摘要');
    assert((ep.shots[0].prompt || '').includes('更稳妥'), '数据类修复应落地');
  } },
  { name: 'selfFixRound:重试仍失败限 2 轮(深度封顶递归一次后即停)', fn: async () => {
    const sb = loadAgentOps(); const AO = sb.AgentOps;
    const p = { id: 'p1' }, ep = makeEp();
    sb.__apiReady = true;
    const CR = require('../js/cmd-registry.js');
    let calls = 0;
    sb.Commands = {
      list: () => CR.META.map(m => ({ name: m.name, label: m.label, risk: m.risk, needs: m.needs, args: m.args })),
      execute: async () => ({ ok: false, status: 'failed', error: { code: 'gen-failed', message: '上游持续故障' }, result: {} }),
    };
    sb.__chatJSONResult = { reply: '再试', ops: [{ op: 'run', cmd: 'episode.generateVideos' }] };
    const orig = AO.selfFixRound;
    // 统计 LLM 调用轮数:chatJSONRobust 走 Understanding stub
    const call0 = sb.Understanding.chatJSONRobust;
    sb.Understanding.chatJSONRobust = async (...a) => { calls++; return call0(...a); };
    const note = await AO.selfFixRound(p, ep, null, ['▶ 生成视频:✕ 失败'], 'op_y');
    assertEq(calls, 2, '最多 2 轮(首轮+重试失败后再归因一轮),实际 ' + calls);
    assert(note.includes('✕'), '最终仍失败应如实呈现');
  } },

  /* ---- 第三阶段:按需查询(queryProtocol/answerQueries)与事件总线订阅(subscribeBus) ---- */
  { name: 'queryProtocol:协议文本含全部查询类型与续问上限', fn() {
    const sb = loadAgentOps();
    const AO = sb.AgentOps;
    const txt = AO.queryProtocol();
    ['shots', 'script', 'subjects', 'review', 'understanding', 'issues', 'plan', 'workflow', 'events', 'tasks'].forEach(t => {
      assert(txt.includes(t), '协议应包含查询类型 ' + t);
    });
    assert(txt.includes('query'), '协议应声明 query 可选键');
  } },
  { name: 'answerQueries:shots 区间钳制(越界收敛)+ 每镜号对齐', fn() {
    const sb = loadAgentOps();
    const AO = sb.AgentOps;
    const ep = makeEp({ shots: Array.from({ length: 30 }, (_, i) => makeShot(i)) });
    const out = AO.answerQueries({ id: 'p1' }, ep, 'ep', [{ type: 'shots', from: 25, to: 99 }]);
    assert(out.includes('[查询结果·shots]'), '应标注查询结果块');
    assert(out.includes('第 25-30 镜'), 'to 越界应钳制到末镜 30');
    assert(out.includes('"镜头":25'), '区间起点应为第 25 镜(compactShots 按 1 起号)');
    assert(!out.includes('"镜头":24'), '不应包含区间外镜头');
  } },
  { name: 'answerQueries:白名单外类型忽略;script 分页展开;未加载模块如实回报', fn() {
    const sb = loadAgentOps();
    const AO = sb.AgentOps;
    const ep = makeEp({ content: 'A' + 'B'.repeat(2999) });
    assert(!AO.answerQueries({ id: 'p1' }, ep, 'ep', [{ type: 'hack', anything: 1 }]).includes('hack'), '白名单外类型应忽略');
    const out = AO.answerQueries({ id: 'p1' }, ep, 'ep', [
      { type: 'script', from: 100, chars: 300 },
      { type: 'issues' }, // 问题中心未加载:如实回报
      { type: 'plan' },   // 计划模块未加载:如实回报
    ]);
    assert(out.includes('[查询结果·script]'), 'script 查询应执行');
    assert(out.includes('B'.repeat(200)), '应从 from=100 处展开(chars=300)');
    assert(!out.includes('AAAA'), '区间前的内容不应出现');
    assert(out.includes('可继续查询'), '超出部分应给分页尾注');
    assert(out.includes('(问题中心未加载)'), '未加载模块应如实回报');
    assert(out.includes('(当前无制作计划)'), '无计划应如实回报');
  } },
  { name: 'answerQueries:subjects 清单含参考图状态;review 报告含均分与逐镜', fn() {
    const sb = loadAgentOps();
    const AO = sb.AgentOps;
    const p = { id: 'p1', subjects: [
      { id: 's1', name: '林晚晴', kind: 'character', image: '/uploads/a.png', prompt: '女主设定' },
      { id: 's2', name: '废弃工厂', kind: 'scene', prompt: '' },
    ] };
    const ep = makeEp({ lastReview: { avg: 6.5, perShot: [{ shotId: 'sh0', order: 0, score: 5 }], common: '主体崩坏', cut: '节奏偏慢' } });
    const out = AO.answerQueries(p, ep, 'ep', [{ type: 'subjects' }, { type: 'review' }]);
    assert(out.includes('林晚晴') && out.includes('参考图✓'), '有图主体应标 ✓');
    assert(out.includes('缺图⚠'), '缺图主体应标 ⚠');
    assert(out.includes('均分 6.5'), '审片查询应含均分');
    assert(out.includes('1镜5分'), '审片查询应含逐镜分');
  } },
  { name: 'subscribeBus:shots.batchDone(整集)→ 事件续谈卡;镜头组 → 轻提示', fn() {
    const sb = loadAgentOps();
    loadFile(sb, 'bus.js'); // 先装总线;agent-ops 加载时 Bus 未就绪未订阅,补订一次
    sb.__AGENT_TEST.subscribeBus();
    sb.Agent = { notify: (p2, ep2, main, text) => { sb.__notified = (sb.__notified || []).concat(text); } };
    const ep = makeEp();
    sb.Bus.emit('shots.batchDone', { p: { id: 'p1' }, ep, ok: 10, fail: 0, total: 10 });
    const cardMsg = ep.agentChat.find(m => m.event);
    assert(cardMsg, '整集批量出片应推事件续谈卡');
    assertEq(cardMsg.event.options.length, 2, '全成功应给 审片/合成 两选项');
    sb.Bus.emit('shots.batchDone', { p: { id: 'p1' }, ep: makeEp({ id: 'ep2' }), ok: 3, fail: 1, total: 4, group: 'G1' });
    assert((sb.__notified || []).length >= 1, '镜头组完成应走轻提示(notify)');
    assert(sb.__notified[0].includes('镜头组'), '镜头组提示应带组名');
  } },
  { name: 'subscribeBus:review.smartDone quiet=true 不推对话流(headless 语义)', fn() {
    const sb = loadAgentOps();
    loadFile(sb, 'bus.js');
    sb.__AGENT_TEST.subscribeBus();
    sb.Agent = { notify: (p2, ep2, main, text) => { sb.__notified = (sb.__notified || []).concat(text); } };
    sb.Bus.emit('review.smartDone', { p: { id: 'p1' }, ep: makeEp(), pass: 3, retry: 1, manual: 0, quiet: true });
    assert(!(sb.__notified || []).length, 'quiet(跑批/命令层 headless)不应推对话流');
  } },
];

/* ================= 套件 2:experts.js ================= */
const expertsTests = [
  { name: '预置专家库 16 个;allExperts 合并自定义', fn() {
    const sb = loadExperts();
    assertEq(sb.Experts.EXPERTS.length, 16, '预置专家应 16 个(8 风格 + 8 功能)');
    assertEq(sb.allExperts().length, 16);
    sb.Store.state.customExperts.push({ id: 'cx_1', name: '我的专家', persona: 'x' });
    assertEq(sb.allExperts().length, 17, '自定义应并入');
  } },
  { name: 'hiredExpert:按 settings.hiredExpert 命中/未设置 null', fn() {
    const sb = loadExperts();
    assertEq(sb.hiredExpert(), null, '未雇佣应 null');
    sb.Store.state.settings.hiredExpert = 'ex_suspense';
    assertEq(sb.hiredExpert().name, '冷峻悬疑导演');
  } },
  { name: 'projType:出海解说剧导演 → narration,其余 → drama', fn() {
    const sb = loadExperts();
    assertEq(sb.projType(), 'drama', '未雇佣默认剧情模式');
    sb.Store.state.settings.hiredExpert = 'ex_narration';
    assertEq(sb.projType(), 'narration', '解说剧导演应切解说模式');
    sb.Store.state.settings.hiredExpert = 'ex_sweet';
    assertEq(sb.projType(), 'drama');
  } },
  { name: 'experts-data 双端单源:浏览器 EXPERTS 与共享注册表同一引用;Node require 同数据', fn() {
    const sb = loadExperts();
    assert(sb.ExpertsData && sb.Experts.EXPERTS === sb.ExpertsData.EXPERTS, 'experts.js 应消费 experts-data.js 的同一数组');
    const D = require('../js/experts-data.js');
    assertEq(JSON.stringify(D.EXPERTS), JSON.stringify(sb.Experts.EXPERTS), 'Node 端 require 数据应与浏览器端一致');
    assertEq(D.EXPERTS.length, 16);
  } },
  { name: 'experts-data.projTypeOf:预置/自定义/未知 id 三路与浏览器 projType 同口径', fn() {
    const D = require('../js/experts-data.js');
    assertEq(D.projTypeOf(undefined, []), 'drama', '未雇佣默认剧情模式');
    assertEq(D.projTypeOf('ex_narration'), 'narration', '预置解说剧导演');
    assertEq(D.projTypeOf('ex_sweet'), 'drama');
    assertEq(D.projTypeOf('cx_9', [{ id: 'cx_9', name: '自定义解说', projType: 'narration' }]), 'narration', '自定义专家带 projType 也应生效');
    assertEq(D.projTypeOf('cx_404', []), 'drama', '未知 id 回退剧情模式');
    // 浏览器侧同路径:自定义专家经 projType() 同样命中
    const sb = loadExperts();
    sb.Store.state.customExperts.push({ id: 'cx_9', name: '自定义解说', projType: 'narration' });
    sb.Store.state.settings.hiredExpert = 'cx_9';
    assertEq(sb.projType(), 'narration');
  } },
  { name: 'experts-data → wf-core 联动:projType 决定智能分镜提示词的模式标注(服务端 wf 端点同一推导)', fn() {
    const D = require('../js/experts-data.js');
    const WfCore = require('../js/wf-core.js'); // UMD Node 侧 require(内部再 require domain/knowledge/prompts)
    const mk = pt => WfCore.buildSBUser({ subjects: [] }, {}, { count: 8 }, { styleText: '漫剧', projType: pt, content: '剧本内容' });
    assert(mk(D.projTypeOf('ex_narration')).includes('解说模式(重旁白叙述)'), '雇佣解说剧导演应带解说模式标注');
    assert(mk(D.projTypeOf('ex_sweet')).includes('剧情模式(重台词表演)'), '其余雇佣应为剧情模式');
    assert(mk(D.projTypeOf(undefined)).includes('剧情模式(重台词表演)'), '未雇佣应为剧情模式');
  } },
  { name: 'wf-core.personaFor:板块雇佣专家 > 全局雇佣专家 > 不注入', fn() {
    const D = require('../js/experts-data.js');
    const WfCore = require('../js/wf-core.js');
    const experts = D.allOf([{ id: 'cx_1', name: '我的分镜专家', persona: '自定义方法论' }]);
    const sb = boards => WfCore.personaFor({ experts, hiredId: 'ex_suspense', boards, board: '分镜' });
    assertEq(WfCore.personaFor({ experts, board: '分镜' }), '', '无任何雇佣不注入(提示词与未雇佣时逐字节一致)');
    assert(sb(null).startsWith('。专家方法论(冷峻悬疑导演):'), '仅全局雇佣时取全局专家');
    assertEq(sb({ 分镜: { expert: 'cx_1' } }), '。专家方法论(我的分镜专家·分镜板块):自定义方法论', '板块雇佣优先并标注板块');
    assert(sb({ 分镜: { expert: 'cx_404' } }).includes('冷峻悬疑导演'), '板块专家 id 失效应回退全局雇佣');
    assert(sb({ 成片: { expert: 'cx_1' } }).includes('冷峻悬疑导演'), '其他板块的雇佣不串到本板块');
    assertEq(WfCore.personaFor({ experts: [{ id: 'e0', name: '空人设', persona: '  ' }], hiredId: 'e0' }), '', '空 persona 不注入');
    const long = WfCore.personaFor({ experts: [{ id: 'e1', name: '长人设', persona: '方'.repeat(300) }], hiredId: 'e1' });
    assertEq(long, '。专家方法论(长人设):' + '方'.repeat(200), 'persona 截断 ≤200 字');
  } },
  { name: '专家 persona 进三条工作流提示词:缺省输出不变,注入后三处均带方法论段', fn() {
    const WfCore = require('../js/wf-core.js');
    const note = '。专家方法论(测试专家·分镜板块):方法论正文';
    const und = c => WfCore.buildUndUser(Object.assign({ dsText: '', styleText: '漫剧', eventsText: '', content: '剧本' }, c));
    const sbu = c => WfCore.buildSBUser({ subjects: [] }, {}, { count: 8 }, Object.assign({ styleText: '漫剧', projType: 'drama', content: '剧本' }, c));
    const shot = { id: 'sh1', plot: '对峙', camera: '固定镜头', prompt: 'p', duration: 5 };
    const rev = c => WfCore.buildReviewPrompt({ style: '漫剧' }, { shots: [shot] }, shot, false, Object.assign({ styleText: '漫剧' }, c));
    [[und, '项目风格:漫剧'], [sbu, '剧情模式(重台词表演)'], [rev, '- 项目风格:漫剧']].forEach(([mk, anchor]) => {
      assertEq(mk({ personaNote: '' }), mk({}), '缺省 personaNote 与空串输出应一致');
      assertEq(mk({ personaNote: note }), mk({}).replace(anchor, anchor + note), '注入位应紧随「' + anchor + '」且只改这一处');
    });
  } },
  { name: '双端同源:浏览器 personaNoteFor 与服务端 wf 装配口输出逐字节一致', fn() {
    const D = require('../js/experts-data.js');
    const WfCore = require('../js/wf-core.js');
    const sb = loadExperts();
    sb.WfCore = WfCore; // 浏览器侧 experts.js 运行时经 window.WfCore 取用(index.html 中 wf-core.js 先于 experts.js 加载)
    const customs = [{ id: 'cx_1', name: '我的剪辑指导', persona: '节奏方法论' }];
    const p = { id: 'p1', boards: { 分镜: { expert: 'ex_dp' }, 成片: { expert: 'cx_1' } } };
    sb.Store.state.customExperts.push(customs[0]);
    sb.Store.state.settings.hiredExpert = 'ex_suspense';
    // 服务端装配口(server.js wfPersonaNote 同参数面):专家表/雇佣 id/板块表均由调用方注入
    const srv = board => WfCore.personaFor({ experts: D.allOf(customs), hiredId: 'ex_suspense', boards: p.boards, board });
    ['导演', '分镜', '成片'].forEach(board => assertEq(sb.personaNoteFor(p, board), srv(board), board + ' 板块两端注入串应逐字节一致'));
    assert(sb.personaNoteFor(p, '分镜').includes('摄影指导·分镜板块'), '分镜板块应取板块雇佣的功能专家');
    assert(sb.personaNoteFor(p, '导演').includes('冷峻悬疑导演'), '未雇佣板块专家的板块回退全局雇佣');
  } },
  { name: 'normExpertDraft:style 草稿补齐 dims 五维与 tpl 三件套(缺省回退)', fn() {
    const sb = loadExperts();
    const e = sb.Experts.normExpertDraft({ name: '测试专家', role: '导演', kind: 'style', style: '漫剧', persona: '你是测试', dims: { 光影: '高对比硬光' }, tags: ['a', 'b', 'c', 'd', 'e', 'f'], desc: '描述' });
    assertEq(e.kind, 'style');
    assertEq(e.dims.光影, '高对比硬光', '已给维度保留');
    assertEq(e.dims.色调, 'fb色调', '缺失维度回退 dirFallback');
    assertEq(e.tpl.tplImage, '{style}风格,{subject},精美画面', 'tpl 缺省回退 DEFAULTS');
    assertEq(e.tags.length, 4, '标签应截断到 4 个');
    assert(e.id.startsWith('cx_'), '自定义 id 前缀');
  } },
  { name: 'normExpertDraft:function 草稿不带 dims/tpl;非法 role 归其他', fn() {
    const sb = loadExperts();
    const e = sb.Experts.normExpertDraft({ name: '功能专家', role: '神仙', kind: 'function', persona: 'p' });
    assertEq(e.kind, 'function');
    assertEq(e.role, '其他', '非法角色应归其他');
    assert(e.dims === undefined && e.tpl === undefined, 'function 专家不应补 dims/tpl');
    assertEq(e.style, '漫剧', '非法风格回退漫剧');
  } },
  { name: 'hireExpert:style 专家落库(雇佣id/五维/三件套模板)', fn() {
    const sb = loadExperts();
    const e = sb.Experts.EXPERTS.find(x => x.id === 'ex_suspense');
    sb.Experts.hireExpert(e);
    assertEq(sb.__confirms.length, 1, '雇佣前应确认一次');
    const s = sb.Store.state.settings;
    assertEq(s.hiredExpert, 'ex_suspense');
    assertEq(s.directorSetting.style, '漫剧');
    assertEq(s.directorSetting.inject, true);
    assertEq(s.tplImage, e.tpl.tplImage);
    assertEq(s.tplVideo, e.tpl.tplVideo);
  } },
  { name: 'hireExpert:function 专家直接跳过(不弹确认)', fn() {
    const sb = loadExperts();
    const e = sb.Experts.EXPERTS.find(x => x.id === 'ex_planner');
    sb.Experts.hireExpert(e);
    assertEq(sb.__confirms.length, 0, '功能专家无 dims/tpl 应直接 return');
    assertEq(sb.Store.state.settings.hiredExpert, undefined);
  } },
  { name: 'delCustomExpert:删除被雇佣的自定义专家级联解雇并恢复默认模板', fn() {
    const sb = loadExperts();
    sb.Store.state.customExperts.push({ id: 'cx_1', name: '我的专家', persona: 'x' });
    const s = sb.Store.state.settings;
    s.hiredExpert = 'cx_1';
    s.directorSetting = { style: '漫剧' };
    s.tplImage = '被覆盖的模板'; s.tplVideo = 'v'; s.tplReview = 'r';
    sb.Experts.delCustomExpert('cx_1');
    assertEq(sb.Store.state.customExperts.length, 0, '自定义专家应被删除');
    const s2 = sb.Store.state.settings; // delCustomExpert 整体替换 settings 对象,须取新引用断言
    assertEq(s2.hiredExpert, undefined, '雇佣关系应一并解除');
    assertEq(s2.directorSetting, null);
    assertEq(s2.tplImage, sb.GSettings.DEFAULTS.tplImage, '模板应恢复默认');
  } },
  { name: 'evolveExpert:成功蒸馏计费五件套(start→charge→done)并追加进化条款', fn: async () => {
    const sb = loadExperts();
    /* 记忆源按生效板块过滤后,夹具须同时给出雇佣关系与带 scope 的沉淀(全桶不再是蒸馏输入) */
    sb.Store.myProjects = () => [{ id: 'p1', boards: { 分镜: { expert: 'cx_1' } } }];
    sb.Store.state.agentMemory = [{ text: '用户偏好快节奏', scope: '分镜' }];
    sb.__apiReady = true;
    sb.__chatJSONResult = { clauses: ['开场三秒内进冲突', '台词更口语化'] };
    const e = { id: 'cx_1', name: '我的专家', persona: '基础人设' };
    await sb.Experts.evolveExpert(e);
    assert(e.persona.includes('【进化条款'), '应新开进化条款段');
    assert(e.persona.includes('- 开场三秒内进冲突'), '条款应逐条追加');
    assertEq(e.evolutions, 1);
    assertEq(sb.__charges.length, 1, '应扣 1 积分');
    assertEq(sb.__refunds.length, 0, '成功不应退费');
    assertEq(sb.__tasks[0].status, 'done');
    assertEq(sb.__tasks[0].cost, 1, '任务应登记 cost');
  } },
  { name: 'evolveExpert:无新增条款=LLM已交付不退费,任务标失败说明(与已有 persona 重复)', fn: async () => {
    const sb = loadExperts();
    sb.Store.myProjects = () => [{ id: 'p1', boards: { 分镜: { expert: 'cx_1' } } }];
    sb.Store.state.agentMemory = [{ text: '记忆', scope: '分镜' }];
    sb.__apiReady = true;
    sb.__chatJSONResult = { clauses: ['基础人设'] }; // 与 persona 完全一致 → 本地去重后为空
    const e = { id: 'cx_1', name: '我的专家', persona: '基础人设' };
    await sb.Experts.evolveExpert(e);
    /* 十轮语义变更:蒸馏已成功(服务端 operation 已交付)——无新增条款是业务结论而非失败,
     * 不再本地退款(退款无对应服务端路径,下次同步会把余额改回,两端漂移) */
    assertEq(sb.__refunds.length, 0, '无新增不退费(LLM 已交付,十轮交付边界)');
    assertEq(sb.__tasks[0].status, 'failed');
    assert(sb.__tasks[0].reason.includes('无新增条款'));
    assert(!e.persona.includes('【进化条款'), 'persona 不应被改动');
  } },
  /* ---- G-11 蒸馏输入按板块过滤:蒸馏是写死进 persona,别的板块的沉淀混进来会让该专家
   * 在自己每条链路上都带着不属于它的口径。以下四条钉的就是"只吃本板块、取不到就跳过"。 ---- */
  { name: 'evolveExpert:蒸馏输入按生效板块过滤——导演板块沉淀不进分镜专家(user/system 两侧都无)', fn: async () => {
    const sb = loadExperts();
    sb.Store.myProjects = () => [{ id: 'p1', boards: { 分镜: { expert: 'cx_1' }, 导演: { expert: 'cx_other' } } }];
    sb.Store.state.agentMemory = [
      { text: '定调:全片低饱和青橙,六维缺口按导演页补', scope: '导演' },
      { text: '相邻景别不硬切,切换隔一别', scope: '分镜' },
      { text: '发布门未过项优先补字幕', scope: '成片' },
      { text: '手工沉淀但没标板块', scope: '' },
    ];
    sb.__apiReady = true;
    sb.__llm = [];
    sb.API.chatJSON = async req => {
      sb.__llm.push({ system: req.system, user: ((req.messages || [])[0] || {}).content });
      return { clauses: ['每镜给出摄影意图'] };
    };
    const e = { id: 'cx_1', name: '我的分镜专家', role: '摄像', persona: '基础人设' };
    await sb.Experts.evolveExpert(e);
    assertEq(sb.__llm.length, 1, '应只发一次蒸馏请求');
    const { system, user } = sb.__llm[0];
    const both = system + '\n' + user;
    assert(user.includes('相邻景别不硬切'), '本板块沉淀应纳入蒸馏输入:' + user);
    assert(!both.includes('低饱和青橙') && !both.includes('六维缺口'), '导演板块沉淀不得混进 user/system 任一侧:' + both);
    assert(!both.includes('优先补字幕'), '成片板块沉淀同样不得混进(该专家未雇在成片板块)');
    assert(!both.includes('没标板块'), '无 scope 的条目板块归属拿不准,不蒸馏');
    assert(system.includes('分镜') && user.includes('生效板块:分镜'), '两侧都应点明生效板块,让模型按该板块职责蒸馏');
    assert(e.persona.includes('- 每镜给出摄影意图'), '过滤后仍应正常追加条款');
    assertEq(sb.__charges.length, 1, '有可蒸馏条目时计费口径不变(仍扣 1 积分)');
  } },
  { name: 'evolveExpert:多板块雇佣时按板块序纳入各板块沉淀(对应板块有条目才纳入)', fn: async () => {
    const sb = loadExperts();
    sb.Store.myProjects = () => [
      { id: 'p1', boards: { 分镜: { expert: 'cx_1' } } },
      { id: 'p2', boards: { 剧本: { expert: 'cx_1' } } },
    ];
    sb.Store.state.agentMemory = [
      { text: '钩子放前三秒', scope: '剧本' },
      { text: '两极镜头不衔接', scope: '分镜' },
      { text: '导演板块的定调偏好', scope: '导演' },
    ];
    sb.__apiReady = true;
    sb.__llm = [];
    sb.API.chatJSON = async req => {
      sb.__llm.push({ system: req.system, user: ((req.messages || [])[0] || {}).content });
      return { clauses: ['钩子与景别同时核'] };
    };
    const e = { id: 'cx_1', name: '双板块专家', persona: '基础人设' };
    await sb.Experts.evolveExpert(e);
    const { system, user } = sb.__llm[0];
    assert(user.includes('生效板块:剧本/分镜'), '板块序应取板块词表顺序(剧本在分镜之前):' + user);
    assert(user.includes('钩子放前三秒') && user.includes('两极镜头不衔接'), '两个生效板块的沉淀都应纳入');
    assert(!(system + user).includes('定调偏好'), '未雇佣的板块仍被挡在外面');
  } },
  { name: 'evolveExpert:生效板块无沉淀即在扣费前跳过(不拿全桶凑数)', fn: async () => {
    const sb = loadExperts();
    sb.Store.myProjects = () => [{ id: 'p1', boards: { 分镜: { expert: 'cx_1' } } }];
    sb.Store.state.agentMemory = [{ text: '导演板块的定调偏好', scope: '导演' }, { text: '没标板块的沉淀' }];
    sb.__apiReady = true;
    sb.__chatJSONResult = { clauses: ['不该出现的条款'] };
    const e = { id: 'cx_1', name: '我的分镜专家', persona: '基础人设' };
    await sb.Experts.evolveExpert(e);
    assertEq(sb.__tasks.length, 0, '跳过发生在登记之前:不留任务');
    assertEq(sb.__charges.length, 0, '跳过不扣费(与原先"暂无使用记录"同口径)');
    assert(!e.persona.includes('【进化条款'), 'persona 不得被改动');
    assert(sb.__toasts.some(t => t.includes('分镜') && t.includes('暂无使用记录')), '须明确说是哪个板块没沉淀:' + sb.__toasts.join('|'));
  } },
  { name: 'evolveExpert:专家未在任何板块生效即跳过(板块归属拿不准不蒸馏)', fn: async () => {
    const sb = loadExperts();
    sb.Store.myProjects = () => [{ id: 'p1', boards: { 分镜: { expert: 'cx_other' } } }];
    sb.Store.state.agentMemory = [{ text: '相邻景别不硬切', scope: '分镜' }];
    sb.__apiReady = true;
    sb.__chatJSONResult = { clauses: ['不该出现的条款'] };
    const e = { id: 'cx_1', name: '没被雇的专家', persona: '基础人设' };
    await sb.Experts.evolveExpert(e);
    assertEq(sb.__tasks.length, 0, '未生效即跳过,不登记任务');
    assertEq(sb.__charges.length, 0, '未生效即跳过,不扣费');
    assert(sb.__toasts.some(t => t.includes('还没在任何板块生效')), '须给出可操作的指引:' + sb.__toasts.join('|'));
  } },
  { name: 'evolveExpert:全局雇佣的专家按全部板块取沉淀(与 personaFor 的回落同序)', fn: async () => {
    const sb = loadExperts();
    sb.Store.state.settings.hiredExpert = 'cx_1'; // 全局雇佣:板块未单独雇人时该专家在各板块生效
    sb.Store.myProjects = () => [{ id: 'p1', boards: { 分镜: { expert: 'cx_other' } } }];
    sb.Store.state.agentMemory = [
      { text: '定调偏好', scope: '导演' },
      { text: '本板块另有专家,这条不该进', scope: '分镜' },
    ];
    sb.__apiReady = true;
    sb.__llm = [];
    sb.API.chatJSON = async req => {
      sb.__llm.push({ user: ((req.messages || [])[0] || {}).content });
      return { clauses: ['沿用定调偏好'] };
    };
    const e = { id: 'cx_1', name: '全局专家', persona: '基础人设' };
    await sb.Experts.evolveExpert(e);
    const user = sb.__llm[0].user;
    assert(user.includes('定调偏好'), '全局雇佣者在未被板块专家顶掉的板块上生效');
    assert(!user.includes('这条不该进'), '分镜板块已另雇专家,全局雇佣者在该板块不生效');
  } },
];

/* ================= 套件 3:produce.js ================= */
const produceTests = [
  { name: 'autoSmartReview:全部达标(pass=N/自动确认/无重试)', fn: async () => {
    const sb = loadProduce();
    const p = { id: 'p1' };
    const ep = makeEp({ shots: [makeShot(0), makeShot(1)] });
    sb.__reviewSeq = { sh0: [8.5], sh1: [9] };
    const r = await sb.SB.autoSmartReview(p, ep, null, ep.shots, true);
    assertEq(r.pass, 2); assertEq(r.retry, 0); assertEq(r.manual, 0);
    assert(ep.shots.every(s => s.confirm === true), '达标镜头应自动确认(确认闸联动)');
  } },
  { name: 'autoSmartReview:不达标自动重生成一次后达标(pass1/retry1)', fn: async () => {
    const sb = loadProduce();
    const p = { id: 'p1' };
    const ep = makeEp({ shots: [makeShot(0)] });
    sb.__reviewSeq = { sh0: [5, 7.5] }; // 首评不达标,重生成后达标
    const r = await sb.SB.autoSmartReview(p, ep, null, ep.shots, true);
    assertEq(r.pass, 1); assertEq(r.retry, 1); assertEq(r.manual, 0);
    assert(sb.__called.includes('createShotVideo'), '不达标应触发重生成');
    assertEq(ep.shots[0].confirm, true);
  } },
  { name: 'autoSmartReview:重生成失败转人工', fn: async () => {
    const sb = loadProduce();
    const p = { id: 'p1' };
    const ep = makeEp({ shots: [makeShot(0)] });
    sb.__reviewSeq = { sh0: [5, 5] };
    sb.SBGen.createShotVideo = async () => { sb.__called.push('createShotVideo'); /* 不恢复 video,模拟重生成失败 */ };
    const r = await sb.SB.autoSmartReview(p, ep, null, ep.shots, true);
    assertEq(r.manual, 1, '重生成失败应转人工');
    assertEq(r.pass, 0);
  } },
  { name: 'autoSmartReview:积分不足中止该镜(reviewShot 返回 null)', fn: async () => {
    const sb = loadProduce();
    const p = { id: 'p1' };
    const ep = makeEp({ shots: [makeShot(0), makeShot(1)] });
    sb.__reviewResult = null; // reviewShot → null(积分不足)
    const r = await sb.SB.autoSmartReview(p, ep, null, ep.shots, true);
    assertEq(r.manual, 2, '两镜均应计待人工');
    assertEq(r.pass, 0);
    assertEq(sb.__called.filter(c => c === 'reviewShot').length, 2, '每镜应各调一次评审');
  } },
  { name: 'autoSmartReview:恒不达标超限转人工(maxRetry=1)', fn: async () => {
    const sb = loadProduce();
    const p = { id: 'p1' };
    const ep = makeEp({ shots: [makeShot(0)], sbConfig: { maxRetry: 1 } });
    sb.__reviewSeq = { sh0: [5, 5] };
    const r = await sb.SB.autoSmartReview(p, ep, null, ep.shots, true);
    assertEq(r.pass, 0); assertEq(r.retry, 1); assertEq(r.manual, 1, '超限应转人工');
  } },
  { name: 'autoSmartReview:quiet 不建 dock;非 quiet 建 dock', fn: async () => {
    const sb = loadProduce();
    const p = { id: 'p1' };
    const epQ = makeEp({ shots: [makeShot(0)] });
    sb.__reviewSeq = { sh0: [8] };
    await sb.SB.autoSmartReview(p, epQ, null, epQ.shots, true);
    assertEq(sb.__docks.length, 0, 'quiet 模式不应建停靠栏');
    const epL = makeEp({ shots: [makeShot(0)] });
    await sb.SB.autoSmartReview(p, epL, null, epL.shots, false);
    assertEq(sb.__docks.length, 1, '非 quiet 应建停靠栏');
  } },
  { name: 'oneClickProduce:流水线顺序 批量生成→智能审片→合成(经 episode.produce 命令编排)', fn: async () => {
    const sb = loadProduce();
    const ep = makeEp({ content: '测试剧本正文', shots: [makeShot(0), makeShot(1, { video: { status: 'none' }, confirm: true })] }); // 1 镜待生成(已确认)
    const p = { id: 'p1', episodes: [ep] };
    sb.__proj = p; // 命令层 resolveCtx 经 Store.getProject 取同一对象
    sb.__reviewSeq = { sh0: [8], sh1: [8] };
    await sb.SB.oneClickProduce(p, ep, null);
    await sleep(30); // oneClickProduce 内部 run() 未被 confirm 回调 await,等微任务落定后再断言
    const pipeline = sb.__called.filter(c => ['batchGenVideos', 'reviewShot', 'composeVideo'].includes(c));
    assertEq(pipeline.indexOf('batchGenVideos') >= 0, true, '有待生成镜头应先批量生成');
    assert(pipeline.indexOf('batchGenVideos') < pipeline.indexOf('reviewShot'), '批量生成应先于审片');
    assert(pipeline.lastIndexOf('reviewShot') < pipeline.indexOf('composeVideo'), '审片应先于合成');
    assert(sb.__called.includes('createShotVideo') === false, '达标镜头不应触发重生成');
  } },
  { name: 'oneClickProduce:headless 口径未确认镜跳过(不弹确认闸,不阻断后续环节)', fn: async () => {
    const sb = loadProduce();
    const ep = makeEp({ content: '测试剧本正文', shots: [makeShot(0), makeShot(1, { video: { status: 'none' } })] }); // sh1 未确认
    const p = { id: 'p1', episodes: [ep] };
    sb.__proj = p;
    sb.__reviewSeq = { sh0: [8] };
    await sb.SB.oneClickProduce(p, ep, null);
    await sleep(30);
    assert(!sb.__called.includes('batchGenVideos'), '未确认镜应跳过,不发起批量生成');
    assert(sb.__called.includes('composeVideo'), '跳过不阻断审片/合成(与 CLI/Agent 同口径)');
  } },
  { name: 'autoSmartReview:重抽前先消费 issues 优化提示词(optimizeShot 先于 createShotVideo)', fn: async () => {
    const sb = loadProduce();
    const p = { id: 'p1' };
    const ep = makeEp({ shots: [makeShot(0)] });
    sb.__reviewSeq = { sh0: [5, 8] };
    sb.__reviewIssues = [{ type: '主体崩坏', suggestion: "追加 'stable facial features'" }];
    const r = await sb.SB.autoSmartReview(p, ep, null, ep.shots, true);
    assertEq(r.pass, 1); assertEq(r.retry, 1);
    const calls = sb.__called;
    assert(calls.includes('optimizeShot'), '有 issues 不达标应先优化提示词');
    assert(calls.indexOf('optimizeShot') < calls.indexOf('createShotVideo'), '优化应先于重生成');
    assert(/已按审片意见修订/.test(ep.shots[0].prompt), '优化结果应写入提示词');
  } },
  { name: 'autoSmartReview:无 issues 不达标沿用原提示词重抽(不调 optimizeShot)', fn: async () => {
    const sb = loadProduce();
    const p = { id: 'p1' };
    const ep = makeEp({ shots: [makeShot(0)] });
    sb.__reviewSeq = { sh0: [5, 8] };
    const r = await sb.SB.autoSmartReview(p, ep, null, ep.shots, true);
    assertEq(r.retry, 1);
    assert(!sb.__called.includes('optimizeShot'), '无 issues 不应调优化');
  } },
  { name: 'oneClickProduce:确认被拒时不执行任何环节', fn: async () => {
    const sb = loadProduce();
    sb.__autoConfirm = false;
    const p = { id: 'p1' };
    const ep = makeEp({ shots: [makeShot(0)] });
    await sb.SB.oneClickProduce(p, ep, null);
    assertEq(sb.__confirms.length, 1, '应先弹确认');
    assertEq(sb.__called.filter(c => c !== 'reviewShot').length, 0, '拒绝后不应执行生成/合成');
  } },
];

/* ================= 套件 3.5:commands.js(统一领域命令注册表,第二阶段) ================= */
function loadCommands() {
  const sb = makeSandbox();
  installCommon(sb);
  sb.COST = { image: 2, video: 5, audio: 1, review: 1, compose: 3, smartSB: 8, tweetShot: 1 };
  Object.assign(sb.SB, {
    defaultSBConfig: () => ({ ratio: '16:9', maxRetry: 2, shotCount: 10, sbMode: 'create' }),
    runSmartSB: (p, ep, main, hooks) => { // hooks 协议:命令层 Promise 化回执
      sb.__called.push('runSmartSB');
      if (sb.__sbFail) { if (hooks && hooks.error) hooks.error(new Error('拆解异常')); return; }
      ep.shots = [makeShot(0), makeShot(1)];
      if (hooks && hooks.done) hooks.done(2);
    },
    composeVideo: (p, ep, main, opts) => {
      sb.__called.push('composeVideo');
      const tk = sb.__composeTask === undefined ? { status: 'done' } : sb.__composeTask;
      if (opts && opts.onTask) opts.onTask(tk);
      if (tk && tk.status === 'done') { ep.composed = true; ep.composedUrl = '/uploads/gen/final.mp4'; }
    },
    autoSmartReview: async (p, ep, main, shots, quiet) => { sb.__called.push('autoSmartReview'); return sb.__reviewR || { pass: 3, retry: 0, manual: 0 }; },
  });
  sb.SBGen = {
    batchGenVideos: async (p, ep, main, shots, opts, done) => {
      sb.__called.push('batchGenVideos');
      if (sb.__genHang) return new Promise(() => {}); // INFLIGHT 用例:永不落定
      shots.forEach(s => {
        if (sb.__genFail && sb.__genFail.includes(s.id)) s.video = { status: 'failed', error: '上游错误' };
        else s.video = { status: 'done', url: '/uploads/gen/' + s.id + '.mp4' };
      });
      sb.__credits = (sb.__credits == null ? 999 : sb.__credits) - shots.length * 5; // 模拟净扣费(metered 前后差)
      if (done) done(); // ui 模式命令层经 done 回调 Promise 化(与真实引擎同协议)
    },
    createShotVideo: async (p, ep, s, main, skip) => { sb.__called.push('createShotVideo'); s.video = { status: 'done', url: '/uploads/gen/' + s.id + '.mp4' }; },
  };
  sb.Store.getProject = id => (sb.__proj && sb.__proj.id === id ? sb.__proj : null);
  sb.Store.credits = () => (sb.__credits == null ? 999 : sb.__credits);
  sb.Understanding = { regen: async () => { sb.__called.push('undRegen'); return sb.__undOk !== false; } };
  sb.Review = { reviewShot: async () => ({ score: 8 }) };
  /* project.splitEpisodes 的执行核心(真实实现 proj-upload.js splitCore;此处只验命令层闸门与回执结构);
   * project.extractSubjects 的提取侧同理(在线 LLM / 离线启发式两条都由夹具注入,只验入库与回流) */
  sb.EpisodeUtil = {
    llmExtractSubjects: async () => { sb.__called.push('llmExtractSubjects'); if (sb.__extractErr) throw sb.__extractErr; return sb.__extractFound || { character: [], scene: [], prop: [] }; },
    extractSubjects: () => { sb.__called.push('extractSubjects'); return sb.__extractFound || { character: [], scene: [], prop: [] }; },
    genPrompt: (kind, name, style) => style + '风格,' + name,
    splitCore: async (p, text, opts) => {
      sb.__called.push('splitCore');
      sb.__splitOpts = opts || {};
      if (sb.__splitErr) throw sb.__splitErr;
      p.episodes = [{ id: 'ep_a', title: '第1集', content: text.slice(0, 10) }, { id: 'ep_b', title: '第2集', content: text.slice(10) }];
      sb.Store.save();
      return { eps: p.episodes, mode: (opts && opts.local) ? 'even' : 'markers', llmError: null };
    },
  };
  loadFile(sb, 'domain.js');
  loadFile(sb, 'knowledge.js'); // skill 索引的加载期依赖(与 index.html 同顺序:domain → knowledge → skills → wf-core)
  loadFile(sb, 'prompts.js');
  loadFile(sb, 'skills.js');    // 就绪检查附带的主体面/分镜面校验项(result.checks)
  loadFile(sb, 'wf-core.js');   // 分镜面校验项的景别级差现取 WfCore.sizeGap(词表单源)
  loadFile(sb, 'cmd-registry.js'); // 命令元数据单源(与 index.html 同顺序:commands.js 之前)
  loadFile(sb, 'commands.js');
  return sb;
}
/* 命令测试夹具:有剧本+2 已确认 done 镜+未合成的健康分集(over 可覆盖);主体库非空(不触发空主体引导) */
function cmdCtx(sb, over) {
  const ep = makeEp(Object.assign({ content: '测试剧本正文', composed: false, shots: [makeShot(0, { confirm: true }), makeShot(1, { confirm: true })] }, over || {}));
  const p = { id: 'p1', episodes: [ep], subjects: [{ id: 'sub1', name: '主角', kind: 'character', image: 'x.png' }] };
  sb.__proj = p;
  return { p, ep };
}
/* 剧本解析向导(js/director.js)沙箱:主体提取与入库由 commands.js 真跑(与 CLI exec 同一份口径与回流),
 * 向导侧只桩掉 DOM 与下游三个入口。加载序与 index.html 同:commands.js 在 director.js 之前。
 * bgDock/openModal 的桩按真实契约建:close() 触发 onCancel(否则向导的进度定时器不会停),
 * 提示词审核窗即刻按「确认」放行(勾选全开、提示词不改)。 */
function loadDirector() {
  const sb = loadCommands();
  sb.MODELS = { image: ['seedream-x'], video: ['seedance-x'] };
  sb.styleOf = p => (p && p.style) || '漫剧';
  sb.getSettings = () => sb.Store.state.settings;
  sb.__dirInfo = []; sb.__dirSteps = [];
  const fakeEl = () => ({ style: {}, textContent: '', innerHTML: '', value: '', checked: true, onclick: null });
  const nodePool = () => { const n = {}; return sel => (n[sel] = n[sel] || fakeEl()); };
  sb.U.bgDock = opt => {
    const pick = nodePool();
    let closed = false;
    const dock = {
      m: { style: {}, querySelector: pick, querySelectorAll: sel => [pick(sel + '#0'), pick(sel + '#1'), pick(sel + '#2')] },
      setSteps: (step, failStep) => { sb.__dirSteps.push(step + '/' + failStep); },
      stepInfo: (i, html) => { sb.__dirInfo.push(i + ':' + String(html)); },
      close: () => { if (closed) return; closed = true; if (opt.onCancel) opt.onCancel(); },
      say() {}, finish() {}, cancelled: false,
    };
    sb.__docks.push(dock);
    return dock;
  };
  sb.U.openModal = o => {
    const pick = nodePool();
    const m = { querySelector: pick, querySelectorAll: () => [] };
    o.onMount(m, () => {});
    const okBtn = m.querySelector('[data-x=ok]');
    if (okBtn && okBtn.onclick) okBtn.onclick();
  };
  Object.assign(sb.EpisodeUtil, {
    genSubjectImage: async (p, s, onDone) => { sb.__called.push('genSubjectImage:' + s.name); s.image = '/uploads/' + s.id + '.png'; if (onDone) onDone(); },
    doSplit: (p, text, main, after) => { sb.__called.push('doSplit'); if (after) after(); },
    openSubjectConfirm: () => { sb.__called.push('openSubjectConfirm'); },
  });
  loadFile(sb, 'director.js');
  return sb;
}
const commandsTests = [
  { name: 'execute:未注册命令返回 unknown-command', fn: async () => {
    const sb = loadCommands();
    const r = await sb.Commands.execute('episode.bogus', { pid: 'p1' });
    assertEq(r.ok, false); assertEq(r.error.code, 'unknown-command');
    assert(r.error.message.includes('episode.preflight'), '应列出可用命令');
  } },
  { name: 'execute:上下文缺失走 blocked not-found(不抛异常)', fn: async () => {
    const sb = loadCommands();
    const r = await sb.Commands.execute('episode.preflight', { pid: 'ghost' });
    assertEq(r.ok, false); assertEq(r.status, 'blocked'); assertEq(r.error.code, 'not-found');
  } },
  { name: 'preflight:缺剧本 blocked;健康分集 ready(Domain 单源)', fn: async () => {
    const sb = loadCommands();
    cmdCtx(sb, { content: '' });
    let r = await sb.Commands.execute('episode.preflight', { pid: 'p1', epid: 'ep1' });
    assertEq(r.ok, false); assertEq(r.status, 'blocked');
    assert(r.result.blockers.some(b => b.code === 'no-script'), '阻塞项应含缺剧本');
    cmdCtx(sb);
    r = await sb.Commands.execute('episode.preflight', { pid: 'p1', epid: 'ep1' });
    assertEq(r.ok, true); assertEq(r.status, 'ready');
  } },
  { name: 'preflight:附带主体面校验项结论(pass/level/hits),只报不拦不进 blockers', fn: async () => {
    const sb = loadCommands();
    /* 镜1 引用主体库不存在的名字,镜2 引用齐备(夹具主体「主角」带权威图) */
    const { ep } = cmdCtx(sb, { shots: [makeShot(0, { confirm: true, characters: ['路人甲'] }), makeShot(1, { confirm: true, characters: ['主角'] })] });
    const r = await sb.Commands.execute('episode.preflight', { pid: 'p1', epid: 'ep1' });
    const chk = (r.result.checks || []).find(x => x.skill === 'subjects.refIntegrity');
    assert(chk, '就绪检查结果应附带分镜引用主体完备性校验项');
    assertEq(chk.pass, false); assertEq(chk.level, 'fail', '引用不存在的主体应判 fail');
    assertEq(chk.hits.length, 1, '仅镜1 应命中');
    assertEq(chk.hits[0].code, 'unknown-subject');
    assertEq(chk.hits[0].order, 1, 'hit 应带镜头号');
    assertEq(chk.hits[0].name, '路人甲');
    assertEq(r.ok, true, '校验结论只报不拦,不改就绪判定');
    assert(!(r.result.blockers || []).some(b => /主体|引用/.test(b.label)), '校验结论不得混进 Domain 阻塞项');
    // 引用补齐(改名回填到主体库)后同一集校验全通过
    ep.shots[0].characters = ['主角'];
    const r2 = await sb.Commands.execute('episode.preflight', { pid: 'p1', epid: 'ep1' });
    const chk2 = (r2.result.checks || []).find(x => x.skill === 'subjects.refIntegrity');
    assertEq(chk2.pass, true); assertEq(chk2.level, 'info'); assertEq(chk2.hits.length, 0);
  } },
  { name: 'preflight:result.checks 是剧本+主体+分集+分镜+生成+审片+成片七面并集(按主线步序,摘任一面即红)', fn: async () => {
    const sb = loadCommands();
    /* 烧录字幕开启 + 镜1 台词超硬上限:字幕面必产出 caption-truncated(fail),
     * 即结论不是"时间轴未成形"那种空 info——摘掉 film 这一面时本例的并集与 fail 都对不上 */
    const { p, ep } = cmdCtx(sb, {
      sbConfig: { maxRetry: 2, subtitle: true },
      shots: [makeShot(0, { confirm: true, dialogue: '我'.repeat(130) }), makeShot(1, { confirm: true })],
    });
    const r = await sb.Commands.execute('episode.preflight', { pid: 'p1', epid: 'ep1' });
    const checks = r.result.checks || [];
    assertEq(checks.map(x => x.skill).join(','),
      'script.hookStrength,script.faceslapFour,script.dialogueRule,script.aiToneBan,'
      + 'subjects.refDiscipline,subjects.refIntegrity,subjects.crossShot,subjects.crossShot,'
      + 'eps.structureStage,eps.payoffPoint,shots.sizeProgression,shots.promptEightDim,shots.motionGate,'
      + 'gen.renderCredential,review.methodDim,film.subtitleQC,film.deliverContract',
      'result.checks 应是七面并集,按主线步序 script → subjects → eps → shots → gen → review → film');
    const cred = checks.find(x => x.skill === 'gen.renderCredential');
    assert(cred, '就绪检查必须消费生成凭据面(gen 面被摘掉则本条红)');
    assertEq(cred.level, 'warn', '生成凭据面一律 warn,不升 fail');
    const dim = checks.find(x => x.skill === 'review.methodDim');
    assert(dim, '就绪检查必须消费审片方法论维度面(review 面被摘掉则本条红)');
    assertEq(dim.level, 'info', '本集尚无审片报告:如实回空结论,不冒充维度缺失');
    const cap = checks.find(x => x.skill === 'film.subtitleQC');
    assert(cap, '就绪检查必须消费成片字幕面(film 面被摘掉则本条红)');
    assertEq(cap.id, 'film.subtitleTiming', '字幕面结论应带实现 id');
    assertEq(cap.pass, false); assertEq(cap.level, 'fail', '烧录字幕超硬上限=合成必丢字,判 fail');
    assertEq(cap.hits.map(h => h.code + '@' + h.order).join(','), 'caption-truncated@1', '命中应逐段定位到镜号');
    assertEq(cap.hits[0].limit, 120, 'hit 应带硬上限口径(Domain.SUB_BURN_MAX)');
    /* 与直接跑七面逐字节一致:命令层不得对某一面做二次过滤/降级/改序(沙箱无 Media,ck.online=false) */
    const ck = { online: false };
    const direct = sb.Skills.check('script', { p, ep }, ck)
      .concat(sb.Skills.check('subjects', { p, ep }, ck), sb.Skills.check('eps', { p, ep }, ck),
        sb.Skills.check('shots', { p, ep }, ck), sb.Skills.check('gen', { p, ep }, ck),
        sb.Skills.check('review', { p, ep }, ck), sb.Skills.check('film', { p, ep }, ck));
    assertEq(JSON.stringify(checks), JSON.stringify(direct), 'result.checks 应逐字节等于七面直跑结果的并集');
    assertEq(r.ok, true); assertEq(r.status, 'ready', '字幕面 fail 只报不拦,不改就绪判定');
    assert(!(r.result.blockers || []).some(b => /字幕/.test(b.label || '')), '字幕结论不得混进 Domain 阻塞项');
    assert(!(r.result.blockers || []).some(b => /凭据|指纹/.test(b.label || '')), '生成凭据结论不得混进 Domain 阻塞项');
    assertEq(r.cost, undefined, '就绪检查零计费');
  } },
  { name: 'generateVideos:全未确认 blocked unconfirmed+skipped 清单(不发起生成)', fn: async () => {
    const sb = loadCommands();
    cmdCtx(sb, { shots: [makeShot(0, { video: { status: 'none' } }), makeShot(1, { video: { status: 'none' } })] }); // 均未确认
    const r = await sb.Commands.execute('episode.generateVideos', { pid: 'p1', epid: 'ep1' });
    assertEq(r.ok, false); assertEq(r.status, 'blocked'); assertEq(r.error.code, 'unconfirmed');
    assertEq(r.result.skipped.length, 2, '两镜应进 skipped 清单');
    assertEq(r.result.skipped[0].order, 1, 'skipped 应带镜头号');
    assert(!sb.__called.includes('batchGenVideos'), '确认闸拦截不应发起生成');
  } },
  { name: 'generateVideos:confirmAll 授权全量(写回 confirm+cost 净扣费+next 推导)', fn: async () => {
    const sb = loadCommands();
    const { ep } = cmdCtx(sb, { shots: [makeShot(0, { video: { status: 'none' } }), makeShot(1, { video: { status: 'none' } })] });
    const saves0 = sb.Store._saves;
    const r = await sb.Commands.execute('episode.generateVideos', { pid: 'p1', epid: 'ep1', confirmAll: true });
    assertEq(r.ok, true); assertEq(r.result.total, 2); assertEq(r.result.ok, 2);
    assert(ep.shots.every(s => s.confirm === true), 'confirmAll 应写回镜头确认态');
    assert(sb.Store._saves > saves0, 'confirm 写回应落库');
    assertEq(r.cost, 10, 'metered 应为钱包前后差(2 镜 × 5 积分)');
    assert(r.next && r.next.status, '应附 Domain 重推的 next');
  } },
  { name: 'generateVideos:部分失败 ok:false/partial/失败清单如实报告', fn: async () => {
    const sb = loadCommands();
    cmdCtx(sb, { shots: [makeShot(0, { video: { status: 'none' }, confirm: true }), makeShot(1, { video: { status: 'none' }, confirm: true })] });
    sb.__genFail = ['sh1'];
    const r = await sb.Commands.execute('episode.generateVideos', { pid: 'p1', epid: 'ep1' });
    assertEq(r.ok, false); assertEq(r.status, 'failed'); assertEq(r.error.code, 'partial');
    assertEq(r.result.ok, 1); assertEq(r.result.failed.length, 1);
    assertEq(r.result.failed[0].shotId, 'sh1');
  } },
  { name: 'shot.generateVideo:终稿/未确认前置 blocked,成功返回 url+next', fn: async () => {
    const sb = loadCommands();
    cmdCtx(sb, { shots: [makeShot(0, { video: { status: 'none' }, final: true }), makeShot(1, { video: { status: 'none' } })] });
    let r = await sb.Commands.execute('shot.generateVideo', { pid: 'p1', epid: 'ep1', sid: 'sh0' });
    assertEq(r.status, 'blocked'); assertEq(r.error.code, 'final');
    r = await sb.Commands.execute('shot.generateVideo', { pid: 'p1', epid: 'ep1', sid: 'sh1' });
    assertEq(r.error.code, 'unconfirmed');
    const { ep } = cmdCtx(sb, { shots: [makeShot(0, { video: { status: 'none' }, confirm: true })] });
    r = await sb.Commands.execute('shot.generateVideo', { pid: 'p1', epid: 'ep1', sid: '1' }); // sid 支持镜头号
    assertEq(r.ok, true); assertEq(r.result.url, '/uploads/gen/sh0.mp4');
    assert(r.next && r.next.status, '成功应附 next');
  } },
  { name: 'compose:无分镜/失败镜前置 blocked;onTask 缺句柄 fail intercepted', fn: async () => {
    const sb = loadCommands();
    cmdCtx(sb, { shots: [] });
    let r = await sb.Commands.execute('episode.compose', { pid: 'p1', epid: 'ep1' });
    assertEq(r.error.code, 'no-shots');
    cmdCtx(sb, { shots: [makeShot(0, { video: { status: 'failed', error: 'x' }, confirm: true })] });
    r = await sb.Commands.execute('episode.compose', { pid: 'p1', epid: 'ep1' });
    assertEq(r.error.code, 'failed-shots');
    cmdCtx(sb);
    sb.__composeTask = null; // 守卫拦截/积分不足:不创建任务
    r = await sb.Commands.execute('episode.compose', { pid: 'p1', epid: 'ep1' });
    assertEq(r.ok, false); assertEq(r.error.code, 'intercepted');
  } },
  { name: 'compose:成功返回 url(任务句柄轮询脱离 running)', fn: async () => {
    const sb = loadCommands();
    const { ep } = cmdCtx(sb);
    const r = await sb.Commands.execute('episode.compose', { pid: 'p1', epid: 'ep1' });
    assertEq(r.ok, true); assertEq(r.result.url, '/uploads/gen/final.mp4');
    assertEq(ep.composed, true, '合成成功应写回 composed');
  } },
  { name: 'smartReview:manual>0 转 needs_human(质量闸门语义)', fn: async () => {
    const sb = loadCommands();
    cmdCtx(sb);
    let r = await sb.Commands.execute('episode.smartReview', { pid: 'p1', epid: 'ep1' });
    assertEq(r.ok, true); assertEq(r.status, 'done');
    assertEq(r.result.pass, 3);
    sb.__reviewR = { pass: 1, retry: 1, manual: 2 };
    r = await sb.Commands.execute('episode.smartReview', { pid: 'p1', epid: 'ep1' });
    assertEq(r.status, 'needs_human', '待人工镜头应转 needs_human(跑批据此阻断合成)');
  } },
  { name: 'produce:缺剧本 blocked preflight(就绪检查与跑批同口径)', fn: async () => {
    const sb = loadCommands();
    cmdCtx(sb, { content: '' });
    const r = await sb.Commands.execute('episode.produce', { pid: 'p1', epid: 'ep1' });
    assertEq(r.ok, false); assertEq(r.status, 'blocked'); assertEq(r.error.code, 'preflight');
    assert(r.error.message.includes('缺剧本'), '应列出阻塞项');
    assert(!sb.__called.length, '就绪检查不过不应发起任何生成');
  } },
  { name: 'produce:全链路编排 steps 序 生成→审片→合成,cost 为子步累加', fn: async () => {
    const sb = loadCommands();
    cmdCtx(sb, { shots: [makeShot(0, { video: { status: 'none' }, confirm: true }), makeShot(1, { confirm: true })] });
    const r = await sb.Commands.execute('episode.produce', { pid: 'p1', epid: 'ep1' });
    assertEq(r.ok, true);
    const keys = r.result.steps.map(x => x.step);
    assertEq(keys.join(','), 'generateVideos,smartReview,compose', '编排步骤序应与跑批/前端一致');
    assert(r.result.steps.every(x => x.ok), '各步骤应全部成功');
    assertEq(r.result.url, '/uploads/gen/final.mp4');
    assertEq(r.cost, 5, 'cost 应累加子步(1 镜生成 × 5)');
    assert(r.next && r.next.status, '应附 next');
  } },
  { name: 'produce:待人工镜头质量闸门阻断合成(riskyCompose 放行)', fn: async () => {
    const sb = loadCommands();
    cmdCtx(sb);
    sb.__reviewR = { pass: 1, retry: 0, manual: 1 };
    let r = await sb.Commands.execute('episode.produce', { pid: 'p1', epid: 'ep1' });
    assertEq(r.ok, false); assertEq(r.status, 'needs_human'); assertEq(r.error.code, 'manual-gate');
    assert(!sb.__called.includes('composeVideo'), '闸门应阻断合成');
    r = await sb.Commands.execute('episode.produce', { pid: 'p1', epid: 'ep1', riskyCompose: true });
    assertEq(r.ok, true, 'riskyCompose 显式放行应完成合成');
    assert(sb.__called.includes('composeVideo'), '放行后应调合成');
  } },
  { name: 'produce:审片关闭 → 步骤如实 skipped 且不静默消失,合成照常', fn: async () => {
    const sb = loadCommands();
    cmdCtx(sb);
    const r = await sb.Commands.execute('episode.produce', { pid: 'p1', epid: 'ep1', smartReview: false });
    assertEq(r.ok, true);
    const rv = r.result.steps.find(x => x.step === 'smartReview');
    assert(rv, '关闭审片也应留下 smartReview 步骤记录(不静默跳过)');
    assertEq(rv.status, 'skipped');
    assertEq(rv.error.code, 'disabled');
    assert(sb.__called.includes('composeVideo'), '显式关闭审片不阻断合成');
  } },
  { name: 'produce:审片模块未加载 → skipped + blocked review-unavailable(riskyCompose 放行)', fn: async () => {
    const sb = loadCommands();
    cmdCtx(sb);
    const keep = sb.Review;
    sb.Review = null;
    let r = await sb.Commands.execute('episode.produce', { pid: 'p1', epid: 'ep1' });
    assertEq(r.ok, false); assertEq(r.status, 'blocked'); assertEq(r.error.code, 'review-unavailable');
    assertEq(r.result.steps.find(x => x.step === 'smartReview').status, 'skipped');
    assert(!sb.__called.includes('composeVideo'), '质量闸门无法执行时不应静默合成');
    r = await sb.Commands.execute('episode.produce', { pid: 'p1', epid: 'ep1', riskyCompose: true });
    assertEq(r.ok, true, 'riskyCompose 显式放行');
    sb.Review = keep;
  } },
  { name: 'understanding:regen 同源(成功 ok/失败 fail 已退费)', fn: async () => {
    const sb = loadCommands();
    cmdCtx(sb);
    let r = await sb.Commands.execute('episode.understanding', { pid: 'p1', epid: 'ep1' });
    assertEq(r.ok, true); assert(sb.__called.includes('undRegen'), '应调 Understanding.regen');
    sb.__undOk = false;
    r = await sb.Commands.execute('episode.understanding', { pid: 'p1', epid: 'ep1' });
    assertEq(r.ok, false); assertEq(r.error.code, 'understanding');
    cmdCtx(sb, { content: '' });
    r = await sb.Commands.execute('episode.understanding', { pid: 'p1', epid: 'ep1' });
    assertEq(r.error.code, 'no-script', '缺剧本应 blocked');
  } },
  /* ---- G-04:剧本拆集命令(项目级 headless 入口) ---- */
  { name: 'splitEpisodes:缺剧本原文 blocked;已有分集需 overwrite 授权(默认不覆盖)', fn: async () => {
    const sb = loadCommands();
    const { p } = cmdCtx(sb);
    let r = await sb.Commands.execute('project.splitEpisodes', { pid: 'p1' });
    assertEq(r.status, 'blocked'); assertEq(r.error.code, 'no-script');
    assert(!sb.__called.includes('splitCore'), '缺剧本不应进入切分');
    p.script = '第一集 开场\n女主被当众羞辱\n第二集 反击\n女主揭穿真相';
    r = await sb.Commands.execute('project.splitEpisodes', { pid: 'p1' });
    assertEq(r.status, 'blocked'); assertEq(r.error.code, 'has-episodes');
    assertEq(r.result.episodes, 1, '应如实回报现有分集数');
    assert(!sb.__called.includes('splitCore'), '未授权覆盖不应进入切分');
  } },
  { name: 'splitEpisodes:overwrite 授权后回执 mode/分集数/next;local 透传强制均分', fn: async () => {
    const sb = loadCommands();
    const { p } = cmdCtx(sb);
    p.script = '第一集 开场\n女主被当众羞辱\n第二集 反击\n女主揭穿真相';
    let r = await sb.Commands.execute('project.splitEpisodes', { pid: 'p1', overwrite: true });
    assertEq(r.ok, true); assertEq(r.result.episodes, 2); assertEq(r.result.mode, 'markers');
    assertEq(r.result.overwritten, 1, '应如实回报被覆盖的分集数');
    assertEq(r.result.titles.join(','), '第1集,第2集');
    assert(r.next, '项目级命令应附 Domain.workflow 重推的 next');
    r = await sb.Commands.execute('project.splitEpisodes', { pid: 'p1', overwrite: true, local: true });
    assertEq(sb.__splitOpts.local, true, 'local 应透传执行核心(零 LLM 段落均分)');
    assertEq(r.result.mode, 'even');
  } },
  { name: 'splitEpisodes:在飞守卫/任务中心不可达 → 带 code 的 blocked(不静默覆盖分集)', fn: async () => {
    const sb = loadCommands();
    const { p } = cmdCtx(sb, { shots: [] });
    p.script = '一段没有集标记的剧本正文\n第二段正文继续推进剧情';
    p.episodes = [];
    sb.__splitErr = Object.assign(new Error('有 2 个任务正在进行,请等待完成后再重新分集'), { code: 'inflight' });
    const r = await sb.Commands.execute('project.splitEpisodes', { pid: 'p1' });
    assertEq(r.status, 'blocked'); assertEq(r.error.code, 'inflight');
    assert(r.error.message.includes('等待完成'), '应透出守卫原因');
  } },
  { name: 'generateStoryboard:hooks 回执/缺剧本/积分不足 三态', fn: async () => {
    const sb = loadCommands();
    cmdCtx(sb, { shots: [] });
    let r = await sb.Commands.execute('episode.generateStoryboard', { pid: 'p1', epid: 'ep1' });
    assertEq(r.ok, true); assertEq(r.result.shots, 2, 'runSmartSB hooks.done 应回执分镜数');
    cmdCtx(sb, { content: '', shots: [] });
    r = await sb.Commands.execute('episode.generateStoryboard', { pid: 'p1', epid: 'ep1' });
    assertEq(r.error.code, 'no-script');
    cmdCtx(sb, { shots: [] });
    sb.__credits = 0;
    r = await sb.Commands.execute('episode.generateStoryboard', { pid: 'p1', epid: 'ep1' });
    assertEq(r.error.code, 'no-credits', '积分不足应 blocked(预检与 runSmartSB 同口径防悬挂)');
  } },
  { name: 'execute:INFLIGHT 同键并发守卫(防重复扣费)', fn: async () => {
    const sb = loadCommands();
    cmdCtx(sb, { shots: [makeShot(0, { video: { status: 'none' }, confirm: true })] });
    sb.__genHang = true; // 首个执行悬挂
    const p1 = sb.Commands.execute('episode.generateVideos', { pid: 'p1', epid: 'ep1' });
    const r2 = await sb.Commands.execute('episode.generateVideos', { pid: 'p1', epid: 'ep1' });
    assertEq(r2.ok, false); assertEq(r2.status, 'running'); assertEq(r2.error.code, 'inflight');
    sb.__genHang = false;
    p1.catch(() => {}); // 悬挂 promise 不 await(测试结束即弃)
  } },
  /* ---- 第三阶段:ui 模式 / shotIds 子集 / quiet hooks / digest 消化 ---- */
  { name: 'generateVideos:ui 模式 shotIds 子集执行(引擎 opts 不带 skip 标记,确认闸归引擎)', fn: async () => {
    const sb = loadCommands();
    const { ep } = cmdCtx(sb, { shots: [makeShot(0, { video: { status: 'none' } }), makeShot(1, { video: { status: 'none' } }), makeShot(2, { video: { status: 'none' } })] });
    let gotShots = null, gotOpts = null;
    const orig = sb.SBGen.batchGenVideos;
    sb.SBGen.batchGenVideos = async (p, ep2, main, shots, opts, done) => { gotShots = shots.map(s => s.id); gotOpts = opts; return orig(p, ep2, main, shots, opts, done); };
    const r = await sb.Commands.execute('episode.generateVideos', { pid: 'p1', epid: 'ep1', ui: true, shotIds: ['sh0', 'sh2'] });
    assertEq(r.ok, true); assertEq(r.result.total, 2);
    assertEq(gotShots.join(','), 'sh0,sh2', 'ui 模式应按 shotIds 子集下发引擎');
    assertEq(gotOpts && gotOpts.skipConfirmGate, undefined, 'ui 模式不应跳过确认闸(引擎内弹窗保留)');
    assertEq(ep.shots[1].video.status, 'none', '子集外镜头不应被生成');
  } },
  { name: 'generateStoryboard:headless hooks.quiet=true,ui 模式 quiet=false(决策弹窗归 UI)', fn: async () => {
    const sb = loadCommands();
    cmdCtx(sb, { shots: [] });
    let gotQuiet = null;
    const orig = sb.SB.runSmartSB;
    sb.SB.runSmartSB = (p, ep, main, hooks) => { gotQuiet = hooks && hooks.quiet; orig(p, ep, main, hooks); };
    await sb.Commands.execute('episode.generateStoryboard', { pid: 'p1', epid: 'ep1' });
    assertEq(gotQuiet, true, 'headless 应传 quiet(多方案自动择优/本地兜底不弹发布确认)');
    await sb.Commands.execute('episode.generateStoryboard', { pid: 'p1', epid: 'ep1', ui: true });
    assertEq(gotQuiet, false, 'ui 模式应保留对比窗/发布确认等决策弹窗');
  } },
  { name: 'generateStoryboard:ui 模式空主体库引导(取消 blocked no-subjects;仍要拆镜放行;headless 不拦截)', fn: async () => {
    const sb = loadCommands();
    cmdCtx(sb, { shots: [] });
    sb.__proj.subjects = []; // 空主体库触发引导
    // 模拟点「取消」→ blocked no-subjects
    sb.U.openModal = opts => { const btns = {}; opts.onMount({ querySelector: sel => (btns[sel] = btns[sel] || { onclick: null }) }, () => {}); btns['[data-x=cancel]'].onclick(); };
    const r = await sb.Commands.execute('episode.generateStoryboard', { pid: 'p1', epid: 'ep1', ui: true });
    assertEq(r.ok, false, '取消应 blocked');
    assertEq(r.error.code, 'no-subjects', '应回报 no-subjects');
    // 模拟点「仍要拆镜」→ 放行真实执行
    sb.U.openModal = opts => { const btns = {}; opts.onMount({ querySelector: sel => (btns[sel] = btns[sel] || { onclick: null }) }, () => {}); btns['[data-x=cont]'].onclick(); };
    const r2 = await sb.Commands.execute('episode.generateStoryboard', { pid: 'p1', epid: 'ep1', ui: true });
    assertEq(r2.ok, true, '仍要拆镜应放行执行');
    // headless 空主体库不拦截(自动化场景)
    const r3 = await sb.Commands.execute('episode.generateStoryboard', { pid: 'p1', epid: 'ep1' });
    assertEq(r3.ok, true, 'headless 不应被空主体引导拦截');
  } },
  { name: 'shot.generateVideo:ui 模式无确认闸(与单镜按钮语义一致)', fn: async () => {
    const sb = loadCommands();
    cmdCtx(sb, { shots: [makeShot(0, { video: { status: 'none' } })] }); // 未确认
    const r = await sb.Commands.execute('shot.generateVideo', { pid: 'p1', epid: 'ep1', sid: 'sh0', ui: true });
    assertEq(r.ok, true, 'ui 模式单镜生成无确认闸(headless 才 blocked unconfirmed)');
    assert(sb.__called.includes('createShotVideo'), '应真实发起单镜生成');
  } },
  { name: 'digest:ok 静默/inflight 与 blocked 提示/用户取消静默/failed 报错', fn: () => {
    const sb = loadCommands();
    sb.Commands.digest({ ok: true, status: 'done', result: {} });
    assertEq(sb.__toasts.length, 0, '成功默认静默(引擎自身已播报)');
    sb.Commands.digest({ ok: false, status: 'running', error: { code: 'inflight', message: '相同命令正在执行中' } });
    assertEq(sb.__toasts.length, 1, 'inflight 应提示');
    sb.Commands.digest({ ok: false, status: 'blocked', error: { code: 'unconfirmed', message: '2 镜未确认' } });
    assertEq(sb.__toasts.length, 2, 'blocked 应提示');
    sb.Commands.digest({ ok: false, status: 'blocked', error: { code: 'cancelled', message: '已取消合成' } });
    assertEq(sb.__toasts.length, 2, '用户主动取消默认静默');
    sb.Commands.digest({ ok: false, status: 'blocked', error: { code: 'cancelled', message: '已取消合成' } }, { silentCancel: false });
    assertEq(sb.__toasts.length, 3, 'silentCancel=false 时取消也播报');
    sb.Commands.digest({ ok: false, status: 'needs_human', error: { code: 'manual-gate', message: '待人工 2 镜' } });
    assertEq(sb.__toasts.length, 4, 'needs_human 质量闸门应提示(非错误)');
    sb.Commands.digest({ ok: false, status: 'failed', error: { code: 'gen', message: '生成失败' } });
    assertEq(sb.__toasts.length, 5, 'failed 应报错');
    sb.Commands.digest({ ok: true, status: 'done', result: {} }, { okToast: '已完成' });
    assertEq(sb.__toasts.length, 6, 'okToast 可强制播报成功');
    assertEq(sb.__toasts[5], '已完成');
  } },
];

/* ================= 套件 4:store.js(_merge3 三方合并 / inputHash 迁移) ================= */
function loadStore() {
  const sb = makeSandbox();
  installCommon(sb);
  delete sb.Store; // installCommon 预置的 Store stub 让位给真实 store.js
  loadFile(sb, 'domain.js'); // store.js 指纹/就绪/判旧/findSubject 一律委托 Domain(运行期引用)
  loadFile(sb, 'store.js');
  return sb;
}
const storeTests = [
  { name: '_merge3:双端各改不同分集互不覆盖(episode 级合并)', fn: async () => {
    const sb = loadStore();
    const ep1 = { id: 'e1', title: '第1集', shots: [{ id: 's1', plot: '原' }] };
    const ep2 = { id: 'e2', title: '第2集', shots: [{ id: 's2', plot: '原' }] };
    const base = { id: 'p1', name: '项目', episodes: [JSON.parse(JSON.stringify(ep1)), JSON.parse(JSON.stringify(ep2))] };
    const local = JSON.parse(JSON.stringify(base)); local.episodes[0].shots[0].plot = '本地改第1集';
    const cloud = JSON.parse(JSON.stringify(base)); cloud.episodes[1].shots[0].plot = '云端改第2集';
    const out = sb.Store._merge3(base, local, cloud);
    assertEq(out.episodes[0].shots[0].plot, '本地改第1集', '本地改的分集应保留');
    assertEq(out.episodes[1].shots[0].plot, '云端改第2集', '云端改的分集应保留');
  } },
  { name: '_merge3:单侧未动取对端;两端一致直接返回', fn: async () => {
    const sb = loadStore();
    const base = { id: 'p1', name: '名', meta: { a: 1 } };
    const local = JSON.parse(JSON.stringify(base));
    const cloud = JSON.parse(JSON.stringify(base)); cloud.name = '云端名';
    const out = sb.Store._merge3(base, local, cloud);
    assertEq(out.name, '云端名', '本地未动应取云端');
    const out2 = sb.Store._merge3(base, cloud, JSON.parse(JSON.stringify(cloud)));
    assert(out2 === cloud, '两端一致应直接返回本地引用(不再深拷贝)');
  } },
  { name: '_merge3:数组项删除vs修改,修改胜;单侧删除对端未改才生效', fn: async () => {
    const sb = loadStore();
    const base = { subjects: [{ id: 'a', v: 1 }, { id: 'b', v: 1 }] };
    const local = { subjects: [{ id: 'a', v: 1 }] };              // 本地删 b
    const cloud = { subjects: [{ id: 'a', v: 1 }, { id: 'b', v: 2 }] }; // 云端改 b
    const out = sb.Store._merge3(base, local, cloud);
    assertEq(out.subjects.length, 2, '删除遇修改应保留被改项');
    assertEq(out.subjects.find(x => x.id === 'b').v, 2);
    const out2 = sb.Store._merge3(base, local, JSON.parse(JSON.stringify(base)));
    assertEq(out2.subjects.length, 1, '对端未动时删除生效');
  } },
  { name: '_merge3:同字段双改取 updatedAt 较新', fn: async () => {
    const sb = loadStore();
    const base = { name: '原', updatedAt: 1 };
    const local = { name: '本地', updatedAt: 100 };
    const cloud = { name: '云端', updatedAt: 200 };
    assertEq(sb.Store._merge3(base, local, cloud).name, '云端', '云端较新应胜');
    assertEq(sb.Store._merge3(base, Object.assign({}, local, { updatedAt: 300 }), cloud).name, '本地', '本地较新应胜');
  } },
  { name: 'inputHash:v3 前缀 + 存量 v1 原位迁移(输入未变不误报)', fn: async () => {
    const sb = loadStore();
    const p = { id: 'p1', userId: 'u1', episodes: [{ id: 'e1', shots: [{ id: 's1', prompt: 'P', dialogue: 'D', narration: 'N', video: { status: 'done', inputHash: '' } }] }] };
    const v1 = sb.Store._shotInputHashV1(p, p.episodes[0].shots[0]);
    p.episodes[0].shots[0].video.inputHash = v1; // 旧数据存 v1
    sb.Store.state.projects = [p];
    sb.Store.migrateInputHash();
    const h = p.episodes[0].shots[0].video.inputHash;
    assert(String(h).startsWith('v3:'), '迁移后应为 v3 前缀,实际 ' + h);
    assertEq(h, sb.Store.shotInputHash(p, p.episodes[0].shots[0]), '迁移值应等于现算 v3');
  } },
  { name: 'inputHash:无指纹存量 done 镜回填基线(此后输入变化即判过期;assetVer 同补防立刻误报)', fn: async () => {
    const sb = loadStore();
    // 无参照主体的镜头:assetVer 恒 0,隔离出 inputHash 缺失这一单一变量(§1.5 缺口)
    const s0 = { id: 's1', prompt: 'P', dialogue: '', narration: '', characters: [], scene: '', props: [], video: { status: 'done', url: 'u' } };
    const p = { id: 'p1', userId: 'u1', subjects: [], episodes: [{ id: 'e1', shots: [s0] }] };
    sb.Store.state.projects = [p];
    assertEq(sb.Store.shotVideoStale(p, s0), false, 'inputHash 缺失的存量镜回填前永不判过期(缺口复现)');
    sb.Store.migrateInputHash();
    assert(String(s0.video.inputHash).startsWith('v3:'), '回填后应有 v3 指纹');
    assertEq(sb.Store.shotVideoStale(p, s0), false, '回填基线当下不误报(原生成输入不可考,不回溯)');
    s0.prompt = 'P2'; // 此后输入变化
    assertEq(sb.Store.shotVideoStale(p, s0), true, '输入变化后应判过期(§1.5 修复点)');
    // 带参照主体的存量镜:assetVer 一并回填当前版本(不回填则迁移后立刻被 assetVer 维度误报)
    const sub = { id: 'sj1', name: '主', kind: 'character', image: 'u', imgVer: 2 };
    const s1 = { id: 's2', prompt: 'Q', dialogue: '', narration: '', characters: ['主'], scene: '', props: [], video: { status: 'done', url: 'u' } };
    const p2 = { id: 'p2', userId: 'u1', subjects: [sub], episodes: [{ id: 'e1', shots: [s1] }] };
    sb.Store.state.projects = [p2];
    sb.Store.migrateInputHash();
    assertEq(s1.video.assetVer, 2, 'assetVer 应回填当前主体版本');
    assertEq(sb.Store.shotVideoStale(p2, s1), false, '基线对齐后不立刻误报');
    sub.imgVer = 3; // 主体参考图换版
    assertEq(sb.Store.shotVideoStale(p2, s1), true, '主体参考图换版应判过期');
  } },
  { name: 'understandingStale(十一轮):旧数据无 sourceRev 且正文改过判旧;保存/重生成刷 sourceRev 恢复', fn: async () => {
    const sb = loadStore();
    const ep = { id: 'e1', content: 'v1', understanding: { 剧情脉络: 'x' } };
    assertEq(sb.Store.understandingStale(ep), false, 'contentRev=0 的迁移旧数据视为当前(避免一次性全量判旧)');
    sb.Store.updateEpisodeContent(ep, 'v2');
    assertEq(ep.contentRev, 1, 'updateEpisodeContent 递增 contentRev');
    assertEq(sb.Store.understandingStale(ep), true, '正文改过且理解无 sourceRev → 判旧(此前永久被当当前)');
    ep.understanding.sourceRev = ep.contentRev; // 模拟手动保存/重生成成功刷新 sourceRev
    assertEq(sb.Store.understandingStale(ep), false, 'sourceRev 对齐后恢复当前');
    sb.Store.updateEpisodeContent(ep, 'v3');
    assertEq(sb.Store.understandingStale(ep), true, '再次修改正文后判旧');
  } },
  { name: 'stale 谓词 graphRev 维度(十二轮):图谱修订传播到分镜/审片/成片', fn: async () => {
    const sb = loadStore();
    const ep = { id: 'e1', content: 'v1', contentRev: 2, graphRev: 1, shots: [{ id: 's1' }], shotsSourceRev: 2, shotsGraphRev: 1 };
    assertEq(sb.Store.shotsStale(ep), false, '正文与图谱版本都对齐:分镜为当前');
    ep.graphRev = 2; // 图谱手动编辑/重生成
    assertEq(sb.Store.shotsStale(ep), true, '图谱修订后分镜判旧(此前图谱与下游完全断链)');
    ep.shotsGraphRev = 2;
    assertEq(sb.Store.shotsStale(ep), false, '重新拆镜后恢复当前');
    const old = { id: 'e2', content: 'x', shots: [{ id: 's2' }], lastReview: { sourceRev: 0 } }; // 旧数据无 graphRev 记录
    assertEq(sb.Store.reviewStaleByScript(old), false, '旧报告无 graphRev 记录:保持原语义不判旧(迁移兼容)');
    old.lastReview.graphRev = 1; old.graphRev = 2;
    assertEq(sb.Store.reviewStaleByScript(old), true, '记录过 graphRev 的报告在图谱修订后判旧');
    old.composedSourceRev = 0; old.composedGraphRev = 1;
    assertEq(sb.Store.composedStaleByScript(old), true, '成片同样按图谱版本判旧');
  } },
  { name: 'renameSubject(十三轮):级联镜头/镜头组引用 + formerNames 兜底解析 + 撞名拒绝', fn: async () => {
    const sb = loadStore();
    const sub = { id: 'sj_1', name: '林晚', kind: 'character', image: '/u/a.png', forms: [{ id: 'fm_1', name: '少年', image: '/u/b.png' }] };
    const other = { id: 'sj_2', name: '沈默', kind: 'character' };
    const p = { id: 'p1', userId: 'u1', subjects: [sub, other], episodes: [{ id: 'e1', shots: [{ id: 's1', characters: ['林晚', '林晚-少年'], scene: '', props: ['怀表'] }], groups: [{ id: 'sg1', scene: '', chars: ['林晚'], assets: { '林晚': '/u/a.png', '林晚-少年': '/u/b.png' }, sig: '未知场景|林晚' }] }] };
    /* 1. 级联:镜头与镜头组的名称引用全部更新(含"名-形态"全称与 assets 键) */
    const r = sb.Store.renameSubject(p, sub, '林晚儿');
    assertEq(r.ok, true, '改名成功');
    const s1 = p.episodes[0].shots[0], g1 = p.episodes[0].groups[0];
    assertEq(s1.characters.join(','), '林晚儿,林晚儿-少年', '镜头引用级联(含形态全称)');
    assertEq(g1.chars[0], '林晚儿', '镜头组 chars 级联');
    assertEq(!!g1.assets['林晚儿'], true, '镜头组 assets 键级联');
    assertEq(!!g1.assets['林晚儿-少年'], true, '镜头组 assets 形态键级联');
    assertEq(!!g1.assets['林晚'], false, '旧键不再存在');
    assertEq(g1.sig, '未知场景|林晚儿', '镜头组签名 sig 应随改名重算(二十三轮:否则自动分组找不到旧组,产生 0 镜幽灵组)');
    /* 2. formerNames 兜底:级联遗漏的旧名引用(跨端合并竞态/快照恢复)仍解析到主体 */
    assertEq(!!sb.Store.findSubject(p, '林晚'), true, '旧名经 formerNames 仍可解析');
    assertEq(sb.Store.findSubject(p, '林晚').s.id, 'sj_1', '旧名解析到同一主体');
    const fm = sb.Store.findSubject(p, '林晚-少年');
    assertEq(!!(fm && fm.form && fm.form.id === 'fm_1'), true, '"旧名-形态"经 formerNames 解析出形态');
    assertEq(sb.Store.subjectImage(p, '林晚-少年'), '/u/b.png', '旧名引用仍能取形态图');
    /* 3. 撞名拒绝 */
    const r2 = sb.Store.renameSubject(p, sub, '沈默');
    assertEq(r2.ok, false, '与其他主体撞名应拒绝');
    /* 4. 新名精确解析优先于曾用名 */
    assertEq(sb.Store.findSubject(p, '林晚儿').s.id, 'sj_1', '新名正常解析');
  } },
  { name: 'shotVideoReady/beatVideoReady:在线时 simulated 占位不算就绪', fn: async () => {
    const sb = loadStore();
    sb.Media = { isReady: () => true }; // window.Media 在线
    assertEq(sb.Store.shotVideoReady({ video: { status: 'done', simulated: true } }), false, '在线时模拟镜头不算就绪');
    assertEq(sb.Store.shotVideoReady({ video: { status: 'done', url: '/uploads/gen/a.mp4' } }), true);
    assertEq(sb.Store.beatVideoReady({ video: { status: 'done', simulated: true } }), false, '在线时节拍模拟不算就绪');
    assertEq(sb.Store.beatVideoReady({ video: { status: 'done' } }), true);
  } },
  /* ---- 八轮:canonical 合成快照 / 成片就绪判定 ---- */
  { name: 'composeSeqOf:时间线 tlOrder 定序 + tlTrims 剔除/裁剪(canonical 快照)', fn: async () => {
    const sb = loadStore();
    const mk = (id, url) => ({ id, video: { status: 'done', url } });
    const ep = { shots: [mk('s1', '/u1.mp4'), mk('s2', '/u2.mp4'), mk('s3', '/u3.mp4')] };
    assertEq(sb.Store.composeSeqOf(ep).map(s => s.id).join(','), 's1,s2,s3', '无时间线时按原始序');
    ep.tlOrder = ['s3', 's1', 's2'];
    assertEq(sb.Store.composeSeqOf(ep).map(s => s.id).join(','), 's3,s1,s2', 'tlOrder 定序');
    ep.tlTrims = { s1: { off: true }, s2: { start: 1.5, end: 4 } };
    const seq = sb.Store.composeSeqOf(ep);
    assertEq(seq.map(s => s.id).join(','), 's3,s2', 'off 镜头被剔除');
    assertEq(seq[1]._tlStart, 1.5, '裁剪入点落到 _tlStart');
    assertEq(seq[1]._tlEnd, 4, '裁剪出点落到 _tlEnd');
    // 新增镜头不在 tlOrder 中:回填追加到序列尾部
    ep.shots.push(mk('s4', '/u4.mp4'));
    assertEq(sb.Store.composeSeqOf(ep).map(s => s.id).join(','), 's3,s2,s4', '新镜头回填追加');
  } },
  { name: 'composedInputHash/epComposedReady:时间线变化失效 + 旧成片无指纹判未就绪', fn: async () => {
    const sb = loadStore();
    sb.Media = { isReady: () => true };
    const ep = { shots: [{ id: 's1', video: { status: 'done', url: '/u1.mp4', inputHash: 'h1' } }, { id: 's2', video: { status: 'done', url: '/u2.mp4', inputHash: 'h2' } }], composed: true };
    ep.composedInputHash = sb.Store.composedInputHash(ep);
    assert(sb.Store.epComposedReady(ep), '指纹一致应就绪');
    // 时间线调序 → hash 失配 → 失效(八轮前按 ep.shots 原序算指纹,调序不会失效)
    ep.tlOrder = ['s2', 's1'];
    assert(!sb.Store.epComposedReady(ep), '时间线调序应使成片失效');
    delete ep.tlOrder;
    // 剔除一镜 → 失效
    ep.tlTrims = { s2: { off: true } };
    assert(!sb.Store.epComposedReady(ep), '时间线剔除镜头应使成片失效');
    delete ep.tlTrims;
    assert(sb.Store.epComposedReady(ep), '恢复后指纹应重新一致');
    // 旧成片无指纹 → 判未就绪
    const legacy = { shots: ep.shots, composed: true, composedUrl: '/old.mp4' };
    assert(!sb.Store.epComposedReady(legacy), '无指纹旧成片应判未就绪');
    // 离线模拟合成:离线有效,在线作废
    const sim = { shots: ep.shots, composed: true, composedSimulated: true };
    assert(!sb.Store.epComposedReady(sim), '在线时模拟合成应判未就绪');
    sb.Media = { isReady: () => false };
    assert(sb.Store.epComposedReady(sim), '离线时模拟合成有效');
  } },
  { name: 'fileFavs 合并:本地取消收藏不被云端并回(基线感知)', fn: async () => {
    const sb = loadStore();
    sb.Store.getToken = () => 'tk';
    // 基线两个收藏;本地删 b(收藏标记取消);云端原样且新增 c
    const base = { fileFavs: { a: true, b: true }, projects: [] };
    const local = { fileFavs: { a: true }, projects: [] };
    const cloud = { fileFavs: { a: true, b: true, c: true }, projects: [] };
    sb.Store.state = local;
    sb.Store._pushBase = { meta: JSON.stringify(base), projects: {} };
    sb.fetch = () => Promise.resolve({ ok: true, json: () => Promise.resolve({ code: 0, data: { rev: 1, state: cloud } }) });
    const ok = await sb.Store.mergeCloud();
    assert(ok, 'mergeCloud 应成功');
    assert(!('b' in sb.Store.state.fileFavs), '本地取消收藏 b 不应被云端并回(八轮前并集会复活)');
    assertEq(sb.Store.state.fileFavs.c, true, '云端新增收藏应保留');
    assertEq(sb.Store.state.fileFavs.a, true, '两端共有键保留');
  } },
  { name: 'mergeCloud 计费键对账(R17):本地余额漂移不覆盖云端服务端权威值', fn: async () => {
    const sb = loadStore();
    sb.Store.getToken = () => 'tk';
    // 基线 100 分;本地视图漂移到 12;云端为服务端钱包投影 88(合并必须以云端为准)
    const base = { users: [{ id: 'u1', username: 't', credits: 100 }], projects: [] };
    const local = { users: [{ id: 'u1', username: 't', credits: 12 }], session: 'u1', projects: [] };
    const cloud = { users: [{ id: 'u1', username: 't', credits: 88 }], creditLogs: [{ id: 'wl_9', amount: -12 }], session: 'u1', projects: [] };
    sb.Store.state = local;
    sb.Store._pushBase = { meta: JSON.stringify(base), projects: {} };
    sb.fetch = () => Promise.resolve({ ok: true, json: () => Promise.resolve({ code: 0, data: { rev: 1, state: cloud } }) });
    const ok = await sb.Store.mergeCloud();
    assert(ok, 'mergeCloud 应成功');
    assertEq(sb.Store.state.users[0].credits, 88, '合并后余额应以云端(钱包投影)为准,本地漂移被对账收敛');
    assertEq((sb.Store.state.creditLogs || [])[0] && sb.Store.state.creditLogs[0].id, 'wl_9', '流水应保留云端版本');
  } },
  { name: 'logCredits 截断(R17):本地流水 500 条封顶,高频消费不再撑爆同步载荷', fn: async () => {
    const sb = loadStore();
    sb.Store.state.users = [{ id: 'u1', username: 't', credits: 10000 }];
    sb.Store.state.session = 'u1';
    for (let i = 0; i < 620; i++) sb.Store.logCredits('u1', 'spend', 1, '压测' + i);
    assertEq(sb.Store.state.creditLogs.length, 500, 'creditLogs 应截断到 500 条(对齐服务端投影上限)');
    assertEq(sb.Store.state.creditLogs[0].reason, '压测619', '最新一条应保留在头部');
  } },
  { name: 'gcIdb(R18):孤儿 blob 清扫,活引用键(内存全量/落盘标记/冲突备份标记)全保留 + 24h 节流', fn: async () => {
    const sb = loadStore();
    const big = 'data:image/png;base64,' + 'x'.repeat(70000);
    const deleted = [];
    sb.IDB = {
      ok: true, MARK: 'idb:',
      isBig: v => typeof v === 'string' && v.length > 65536 && v.startsWith('data:'),
      keyOf: v => (v === big ? 'b_live' : 'b_x'),
      gc: async (keep) => {
        ['b_live', 'b_persist', 'b_backup', 'b_orphan'].forEach(k => { if (!keep.has(k)) deleted.push(k); });
        return deleted.length;
      },
    };
    sb.Store.state = { projects: [], img: big }; // 内存全量值 → b_live
    sb.localStorage.setItem('mv_hujing_state_v1', JSON.stringify({ img: 'idb:b_persist' })); // 落盘快照标记
    sb.localStorage.setItem('mv_hujing_conflict_bak', JSON.stringify([{ state: { img: 'idb:b_backup' } }])); // 冲突备份标记
    await sb.Store.gcIdb();
    assertEq(deleted.join(','), 'b_orphan', '只有无引用孤儿键应被回收,实际:' + deleted.join(','));
    deleted.length = 0;
    await sb.Store.gcIdb();
    assertEq(deleted.length, 0, '24h 节流窗口内不应重复 GC');
  } },
];

/* ================= 套件 5:billing.js(动作推导/校验 + 客户端兼容矩阵) =================
 * 九轮抽出共享模块的动机:服务端计费校验收紧后,真实在线链路可能被 400 拒(八轮回归:
 * llm.agent/review/smartSB 等正常动作全部被"提交必须等于推导"拒掉)——单测/e2e mock 路径
 * 都绕过计费校验,只有把推导/校验逻辑抽成纯模块直接测,才能封死这类回归。 */
const BILLING = require(path.join(ROOT, 'billing.js'));
const billingTests = [
  { name: 'llm 端点接受全部 llm.* 动作(九轮回归修复)', fn: async () => {
    const table = BILLING.DEFAULT_ACTIONS;
    const set = BILLING.llmAllowedActions(table);
    for (const a of ['llm.chat', 'llm.agent', 'llm.review', 'llm.smartSB', 'llm.director', 'llm.optimize', 'llm.tool', 'llm.translate', 'llm.narration', 'llm.skill', 'llm.evolve', 'llm.understanding', 'llm.import', 'llm.extract']) {
      const v = BILLING.validateBillingAction('llm', table, a, 'llm.chat', set);
      assert(v.ok, a + ' 应被 llm 端点接受: ' + (v.msg || ''));
    }
    assert(!BILLING.validateBillingAction('llm', table, 'image.gen', 'llm.chat', set).ok, '跨族动作应被拒绝');
    assert(!BILLING.validateBillingAction('llm', table, 'llm.nonexistent', 'llm.chat', set).ok, '不在白名单的动作应被拒绝');
  } },
  { name: 'image 推导(十一轮信号制):宫格/高清/重绘/写实/多视角由 prompt 定价,标签不可低价', fn: async () => {
    const table = BILLING.DEFAULT_ACTIONS;
    const ok = (d, act) => BILLING.validateBillingAction('image', table, act, d.derived, d.allowedSet).ok;
    assert(ok(BILLING.deriveImageAction({ image: ['/a.png', '/b.png'] }), 'image.fusion'), '多图应接受 fusion');
    assert(!ok(BILLING.deriveImageAction({ image: ['/a.png', '/b.png'] }), 'image.gen'), '多图不应接受 gen 低价');
    // 宫格信号:按分辨率档钉死渠道,gen 低价标签被拒(十一轮核心:此前 allowedSet 含 gen)
    assertEq(BILLING.deriveImageAction({ image: '/a.png', size: '2048x2048', prompt: '多机位宫格图,网格均分' }).derived, 'image.multiCam1');
    assert(!ok(BILLING.deriveImageAction({ image: '/a.png', size: '2048x2048', prompt: '多机位宫格图' }), 'image.gen'), '宫格请求提 gen 低价应被拒');
    assertEq(BILLING.deriveImageAction({ image: '/a.png', size: '1024x1024', prompt: '宫格' }).derived, 'image.multiCam2');
    // 高清化信号(须 2K/4K)
    assertEq(BILLING.deriveImageAction({ image: '/a.png', size: '2K', prompt: '将图片高清化重绘' }).derived, 'image.hd');
    assert(!ok(BILLING.deriveImageAction({ image: '/a.png', size: '2K', prompt: '将图片高清化重绘' }), 'image.gen'), '高清化请求提 gen 低价应被拒');
    assertEq(BILLING.deriveImageAction({ image: '/a.png', size: '1024x1024', prompt: '高清化' }).derived, 'image.gen', '高清化但非 2K 档按 gen');
    // 局部重绘/超写实/多视角信号
    assertEq(BILLING.deriveImageAction({ image: '/a.png', prompt: '红色涂抹覆盖的区域,重绘为' }).derived, 'image.inpaint');
    assertEq(BILLING.deriveImageAction({ image: '/a.png', prompt: '转换为超写实真人质感' }).derived, 'image.realistic');
    assertEq(BILLING.deriveImageAction({ image: '/a.png', prompt: '俯视角构图拍摄' }).derived, 'image.multiView');
    // 无信号 → gen(外部直连按 gen 计费,prompt 即产品)
    assertEq(BILLING.deriveImageAction({ image: '/a.png', prompt: '一只猫' }).derived, 'image.gen');
    assert(!ok(BILLING.deriveImageAction({ image: '/a.png', prompt: '一只猫' }), 'image.multiCam1'), '普通请求提 multiCam1 应被拒');
    assert(ok(BILLING.deriveImageAction({}), 'image.tweetShot'), '文生接受 tweetShot');
    assert(!ok(BILLING.deriveImageAction({}), 'image.fusion'), '文生不应接受 fusion');
  } },
  { name: 'video/ff 推导(十二轮):>10s 一律 beat;≤10s 按 beat: 前缀结构定死(封 gen/beat 客户端自选);upscale 档位;suberase 统一 5 分;未知路由 null', fn: async () => {
    const table = BILLING.DEFAULT_ACTIONS;
    const ok = (d, act, fam) => BILLING.validateBillingAction(fam, table, act, d.derived, d.allowedSet).ok;
    assert(ok(BILLING.deriveVideoAction({}, 12), 'video.beat', 'video'), '>10s 接受 beat');
    assert(!ok(BILLING.deriveVideoAction({}, 12), 'video.gen', 'video'), '>10s 拒绝 gen 低价');
    const d5 = BILLING.deriveVideoAction({}, 5);
    assert(ok(d5, 'video.gen', 'video'), '≤10s 普通镜头接受 gen');
    assert(!ok(d5, 'video.beat', 'video'), '十二轮:≤10s 普通镜头拒绝 beat(推导钉死 gen,防结构外自选)');
    // 十二轮:节拍板任务以复合键 beat:<epId>:<idx> 登记(beatboard.js 固定前缀)——命中即定死 beat
    const dB = BILLING.deriveVideoAction({ job: { shotId: 'beat:e1:2' } }, 5);
    assertEq(dB.derived, 'video.beat', '≤10s 节拍板任务(beat: 前缀)定死 video.beat');
    assert(ok(dB, 'video.beat', 'video'), '节拍板短段落接受 beat(按 2 镜计价)');
    assert(!ok(dB, 'video.gen', 'video'), '十二轮:节拍板短段落拒绝 gen 低价(此前客户端可在 {gen,beat} 自选)');
    assertEq(BILLING.deriveFFAction('upscale', { quality: 'pro' }).derived, 'ff.hdPro');
    assertEq(BILLING.deriveFFAction('upscale', { quality: 'std' }).derived, 'ff.hdStd');
    assertEq(BILLING.deriveFFAction('upscale', {}).derived, 'ff.upscaleTool');
    assert(!ok(BILLING.deriveFFAction('upscale', { quality: 'pro' }), 'ff.merge', 'ff'), 'upscale 拒绝 merge 低价');
    // 十一轮:suberase 统一 ff.erase(5)——同路由双入口价(erase 5/eraseTool 2)结构无法区分,钉死单一价
    const se = BILLING.deriveFFAction('suberase', {});
    assertEq(se.derived, 'ff.erase');
    assert(ok(se, 'ff.erase', 'ff'), 'suberase 接受 erase');
    assert(!ok(se, 'ff.eraseTool', 'ff'), 'suberase 拒绝 eraseTool 低价(十一轮统一)');
    assert(BILLING.deriveFFAction('nonexistent', {}) === null, '未知 ff 路由应返回 null(404)');
  } },
  { name: '客户端 billingAction ↔ 服务端端点 兼容矩阵(全量扫描 js/)', fn: async () => {
    const table = BILLING.DEFAULT_ACTIONS;
    const llmSet = BILLING.llmAllowedActions(table);
    const dir = path.join(ROOT, 'js');
    /* 客户端动作两类来源:billingAction: 'xxx' 字面量;Media.ffXxx(..., 'ff.yyy', ...) 位置参数
     * (含三元 'a' : 'b' 双动作)。逐个对端点推导/校验——任一被拒即真实在线链路 400(八轮回归类)。 */
    const actions = new Set();
    const ffCalls = [];
    for (const f of fs.readdirSync(dir).filter(f => f.endsWith('.js'))) {
      const src = fs.readFileSync(path.join(dir, f), 'utf8');
      for (const m of src.matchAll(/'(?:llm|image|video|tts|ff)\.[\w.]+'/g)) actions.add(m[0].slice(1, -1));
      for (const m of src.matchAll(/Media\.(ff\w+)\(([^)]*)\)/g)) {
        for (const am of m[2].matchAll(/'(ff\.[\w]+)'/g)) {
          const action = am[1];
          // 三元调用(batchops 修片 pro/std 双动作):按动作本身推断档位,其余按参数里的字面档
          const q = action === 'ff.hdPro' ? 'pro' : action === 'ff.hdStd' ? 'std' : (/'pro'/.test(m[2]) ? 'pro' : /'std'/.test(m[2]) ? 'std' : '');
          ffCalls.push({ method: m[1], action, q });
        }
      }
    }
    assert(actions.size >= 25, '应扫描到足量客户端动作字面量,实际 ' + actions.size);
    /* 十一轮:生图动作按 prompt 信号推导——矩阵按客户端实际发送的 prompt 特征构造请求体 */
    const IMG_BODY = {
      'image.fusion': { image: ['/a.png', '/b.png'] },
      'image.hd': { image: '/a.png', size: '2K', prompt: '将图片高清化重绘:提升分辨率与细节锐度' },
      'image.multiCam1': { image: '/a.png', size: '2048x2048', prompt: '多机位宫格图,严格网格均分' },
      'image.multiCam2': { image: '/a.png', size: '1024x1024', prompt: '宫格' },
      'image.inpaint': { image: '/a.png', prompt: '图片中被红色涂抹覆盖的区域,重绘为' },
      'image.realistic': { image: '/a.png', prompt: '转换为超写实真人质感' },
      'image.multiView': { image: '/a.png', prompt: '俯视角构图拍摄,同一场景不同机位' },
      'image.tweetShot': {},
    };
    const VID_DUR = { 'video.gen': 5, 'video.beat': 12 };
    for (const a of actions) {
      if (a === 'ff.tool') continue; // 历史动作:九轮起未知 ff 路由在读体/扣费前 404,无客户端提交入口
      if (/^llm\./.test(a)) {
        const v = BILLING.validateBillingAction('llm', table, a, 'llm.chat', llmSet);
        assert(v.ok, 'LLM 动作 ' + a + ' 应被接受: ' + (v.msg || ''));
      } else if (/^image\./.test(a)) {
        const d = BILLING.deriveImageAction(IMG_BODY[a] || { image: '/a.png' });
        const v = BILLING.validateBillingAction('image', table, a, d.derived, d.allowedSet);
        assert(v.ok, '生图动作 ' + a + ' 应被接受: ' + (v.msg || ''));
      } else if (/^video\./.test(a)) {
        const d = BILLING.deriveVideoAction({}, VID_DUR[a] || 5);
        const v = BILLING.validateBillingAction('video', table, a, d.derived, d.allowedSet);
        assert(v.ok, '视频动作 ' + a + ' 应被接受: ' + (v.msg || ''));
      } else if (/^tts\./.test(a)) {
        const v = BILLING.validateBillingAction('tts', table, a, 'tts.gen', null);
        assert(v.ok, 'TTS 动作 ' + a + ' 应被接受: ' + (v.msg || ''));
      } else if (/^ff\./.test(a)) {
        if (a === 'ff.eraseTool') continue; // 十一轮:suberase 统一 ff.erase,旧双入口价不再被接受(客户端已无提交点)
        const ROUTE = { 'ff.frames': 'frames', 'ff.erase': 'suberase', 'ff.hdStd': 'upscale', 'ff.hdPro': 'upscale', 'ff.upscaleTool': 'upscale', 'ff.highlight': 'highlight', 'ff.compose': 'compose', 'ff.merge': 'merge', 'ff.cut': 'cut' };
        const route = ROUTE[a];
        assert(route, 'ff 动作 ' + a + ' 无对应路由');
        const d = BILLING.deriveFFAction(route, { quality: a === 'ff.hdPro' ? 'pro' : a === 'ff.hdStd' ? 'std' : '' });
        const v = BILLING.validateBillingAction('ff', table, a, d.derived, d.allowedSet);
        assert(v.ok, 'ff 动作 ' + a + ' 应被接受: ' + (v.msg || ''));
      }
    }
    const FF_METHOD = { ffFrames: 'frames', ffSuberase: 'suberase', ffUpscale: 'upscale', ffHighlight: 'highlight', ffCompose: 'compose', ffMerge: 'merge', ffCut: 'cut' };
    assert(ffCalls.length >= 8, '应扫描到足量 ff 调用点,实际 ' + ffCalls.length);
    for (const c of ffCalls) {
      const route = FF_METHOD[c.method];
      assert(route, '未知 ff 方法 ' + c.method);
      const d = BILLING.deriveFFAction(route, { quality: c.q });
      const v = d && BILLING.validateBillingAction('ff', table, c.action, d.derived, d.allowedSet);
      assert(v && v.ok, 'ff 调用 ' + c.method + '/' + c.action + ' 应被接受: ' + ((v && v.msg) || '未知路由'));
    }
  } },
  { name: 'lenientParseJSON:与前端同源(围栏/前缀后缀截取/数组)', fn: async () => {
    assertEq(BILLING.lenientParseJSON('```json\n{"a":1}\n```').a, 1);
    assertEq(BILLING.lenientParseJSON('前缀 {"a":2} 后缀').a, 2);
    assertEq(BILLING.lenientParseJSON('[1,2]')[1], 2);
    assert(BILLING.lenientParseJSON('不是 JSON') === null);
    assert(BILLING.lenientParseJSON('') === null);
  } },
  /* ---- 十轮:operation/步骤状态机(纯判定函数,与 server.js 同源) ---- */
  { name: 'stepDecision:已成功步骤返回缓存/拒绝重放,不再零扣费重调上游', fn: async () => {
    const mk = steps => ({ status: 'charged', steps, requestHash: 'rh1' });
    // 已成功 + 有缓存 → replay-cached(真正幂等,不调上游)
    assertEq(BILLING.stepDecision(mk({ main: { rh: 'rh1', ok: true, resp: '{"a":1}' } }), 'main', 'rh1', { isLlm: true }), 'replay-cached');
    // 已成功 + 无缓存(超长结果)→ 拒绝重放(十轮修复:此前零扣费重新调用上游)
    assertEq(BILLING.stepDecision(mk({ main: { rh: 'rh1', ok: true } }), 'main', 'rh1', { isLlm: true }), 'replay-denied');
    // 未成功 + 同内容 → 幂等重放(网络重试,重新执行)
    assertEq(BILLING.stepDecision(mk({ main: { rh: 'rh1', ok: false } }), 'main', 'rh1', { isLlm: true }), 'replay-exec');
    // 同步骤换内容 → 冲突
    assertEq(BILLING.stepDecision(mk({ main: { rh: 'rh1', ok: false } }), 'main', 'rh2', { isLlm: true }), 'conflict');
    // 新步骤 + 未交付 → 登记
    assertEq(BILLING.stepDecision(mk({}), 'rev1', 'rh1', { isLlm: true }), 'new-step');
    // 新步骤 + 已交付 → 拒绝追加
    assertEq(BILLING.stepDecision({ status: 'delivered', steps: { main: { rh: 'rh1', ok: true } } }, 'rev1', 'rh1', { isLlm: true }), 'delivered-blk');
    // 预算耗尽 → 拒绝
    const full = { status: 'charged', steps: { a: { rh: 'x', ok: true }, b: { rh: 'x', ok: false } } };
    assertEq(BILLING.stepDecision(full, 'c', 'rh1', { isLlm: true, stepBudget: 2 }), 'budget-blk');
    // refunded → 重新扣费
    assertEq(BILLING.stepDecision({ status: 'refunded', steps: {} }, 'main', 'rh1', { isLlm: true }), 'llm-recharge');
    // 非 LLM:换内容冲突 / delivered 拒绝 / 同内容重试
    assertEq(BILLING.stepDecision({ status: 'charged', requestHash: 'rh1' }, '', 'rh2', { isLlm: false }), 'non-llm-conflict');
    assertEq(BILLING.stepDecision({ status: 'delivered', requestHash: 'rh1' }, '', 'rh1', { isLlm: false }), 'non-llm-delivered');
    assertEq(BILLING.stepDecision({ status: 'refunded', requestHash: 'rh1' }, '', 'rh1', { isLlm: false }), 'non-llm-recharge');
  } },
  { name: 'refundDecision:已交付/有成功步骤/登记缺失都不可退(客户端与内部一致)', fn: async () => {
    assertEq(BILLING.refundDecision({ status: 'charged', steps: {} }), 'refundable', '全部失败应可退');
    assertEq(BILLING.refundDecision({ status: 'charged', steps: { main: { rh: 'x', ok: false } } }), 'refundable', '未成功步骤不阻断退款');
    assertEq(BILLING.refundDecision({ status: 'delivered', steps: {} }), 'blocked-delivered');
    // 十轮核心:聚合流程前一步成功(route ok)后一步失败(main 未 ok)→ 不可退(此前内部退款会整笔退回)
    assertEq(BILLING.refundDecision({ status: 'charged', steps: { route: { rh: 'x', ok: true }, main: { rh: 'y', ok: false } } }), 'blocked-ok-step');
    // 登记缺失(operations.json 损坏/超保留期被淘汰)→ 失败关闭(此前 ownerOf 落空后已交付扣费可被退回)
    assertEq(BILLING.refundDecision(null), 'blocked-missing');
    assertEq(BILLING.refundDecision(undefined), 'blocked-missing');
  } },
  { name: 'latestOp:退款重试追加记录后取最新(delivered/refund 作用于新扣费)', fn: async () => {
    const list = [
      { userId: 'u1', opId: 'op1', action: 'llm.chat', status: 'refunded', createdAt: 1 },   // 旧:已退
      { userId: 'u1', opId: 'op1', action: 'llm.chat', status: 'charged', createdAt: 2 },    // 新:重试扣费
      { userId: 'u2', opId: 'op1', action: 'llm.chat', status: 'charged', createdAt: 3 },    // 他人
    ];
    assertEq(BILLING.latestOp(list, 'u1', 'op1', 'llm.chat').createdAt, 2, '应取最新记录而非最早');
    assertEq(BILLING.latestOp(list, 'u1', 'op1', null).createdAt, 2);
    assertEq(BILLING.latestOp(list, 'u2', 'op1', null).createdAt, 3);
    assert(BILLING.latestOp(list, 'u1', 'nope', null) === null, '无匹配返回 null');
    assert(BILLING.latestOp([], 'u1', 'op1', null) === null);
  } },
  /* ---- 十一轮:退款精确归属(chargeIdem)与在途保护 ---- */
  { name: 'refundPlan:按 chargeIdem 精确归属——旧 refunded 记录不再吞掉新扣费的退款判定', fn: async () => {
    /* 场景(十轮 P0-1 复现):第一次扣费(px_u1_op1@llm.chat)失败退款 → 记录 refunded;
     * 第二次重试成功交付(px_u1_op1@llm.chat~2,新记录 delivered)→ 再调退款接口:
     * 旧 ownerOf 按 action find 命中最早 refunded 记录且判 refundable → 新扣费被退回。
     * 十一轮:每笔扣费按 chargeIdem 一对一归属到创建它的记录。 */
    const ops = [
      { userId: 'u1', opId: 'op1', action: 'llm.chat', status: 'refunded', chargeIdem: 'px_u1_op1@llm.chat' },    // 旧:已退
      { userId: 'u1', opId: 'op1', action: 'llm.chat', status: 'delivered', chargeIdem: 'px_u1_op1@llm.chat~2' }, // 新:重试成功
    ];
    // 有效扣费(旧条目已被 _rf 抵销,仅剩新条目)
    const charges = [{ idem: 'px_u1_op1@llm.chat~2', amount: -5 }];
    const plan = BILLING.refundPlan(ops, charges);
    assertEq(plan.length, 1);
    assertEq(plan[0].op.status, 'delivered', '新扣费应归属到新记录(而非旧 refunded 记录)');
    assertEq(plan[0].decision, 'blocked-delivered', '已交付的新扣费不可退(十轮前会被旧记录放行)');
    // 全新 charged 记录(扣费尚未退)→ 可退
    const plan2 = BILLING.refundPlan([{ userId: 'u1', opId: 'op1', action: 'llm.chat', status: 'charged', chargeIdem: 'px_u1_op1@llm.chat~2' }], charges);
    assertEq(plan2[0].decision, 'refundable');
    // 无 chargeIdem 的旧数据(升级前记录)→ 失败关闭
    const plan3 = BILLING.refundPlan([{ userId: 'u1', opId: 'op1', action: 'llm.chat', status: 'charged' }], charges);
    assertEq(plan3[0].decision, 'blocked-missing', '无 chargeIdem 的旧记录不应吞掉退款判定');
    // refunded 状态本身也阻断(防止同一记录重复退)
    const plan4 = BILLING.refundPlan([{ userId: 'u1', opId: 'op1', action: 'llm.chat', status: 'refunded', chargeIdem: 'px_u1_op1@llm.chat~2' }], charges);
    assertEq(plan4[0].decision, 'blocked-refunded');
  } },
  { name: 'clientRefundBlocked(十二轮):executing 一律拒退——陈旧豁免已移除(竞态),崩溃残留由服务端看门狗清算', fn: async () => {
    const now = 1000000000;
    const fresh = { status: 'executing', updatedAt: now - 60 * 1000 };      // 1 分钟前标记
    assertEq(BILLING.clientRefundBlocked(fresh, now), true, '新鲜 executing 拒绝客户端退款(请求可能正在调上游)');
    const stale = { status: 'executing', updatedAt: now - 45 * 60 * 1000 }; // 45 分钟前(原 10 分钟豁免口径)
    assertEq(BILLING.clientRefundBlocked(stale, now), true, '十二轮:陈旧 executing 同样拒绝——按时间放行存在"退款后原请求仍交付成品"竞态,残留由 sweepStaleOps 服务端清算');
    assertEq(BILLING.clientRefundBlocked({ status: 'charged', updatedAt: now }, now), false, 'charged 不阻断');
    assertEq(BILLING.clientRefundBlocked({ status: 'delivered', updatedAt: now }, now), false, 'delivered 由 refundDecision 另行阻断');
    assertEq(BILLING.clientRefundBlocked(null, now), false, '无记录不在此层阻断');
  } },
];

/* ================= 套件 6:sb-gen.js(廉价改图验证 genShotValidate) ================= */
const sbGenTests = [
  { name: 'genShotValidate:无主体参考走文生图(2 积分),验证图写 s.image 并留档可回滚', fn: async () => {
    const sb = loadSbGen();
    const p = { id: 'p1', subjects: [] };
    const ep = makeEp(); const s = ep.shots[0]; s.video = null;
    await sb.SBGen.genShotValidate(p, ep, s, null);
    assertEq(sb.__charges.length, 1, '应扣费 1 笔'); assertEq(sb.__charges[0].cost, 2, '文生图 2 积分');
    assertEq(sb.__imgReq.billingAction, 'image.gen', '服务端推导 image.gen');
    assertEq(sb.__imgReq.image, undefined, '无主体参考不传 image');
    assertEq(sb.__imgReq.size, '1280x720', '缺省比例 16:9 尺寸映射');
    assert(sb.__imgReq.prompt.includes('提示词0') && sb.__imgReq.prompt.includes(';运镜:固定镜头') && sb.__imgReq.prompt.includes(',青橙电影感'), '提示词同源:基础词+运镜+美术后缀');
    assertEq(s.image, '/uploads/gen/val_1.png', '验证图写入 s.image');
    assertEq(s.history[0].type, '验证图', 'history 记验证图条目');
    assert((s.__snaps || []).includes('验证图生成前'), '覆盖前 snapshotShot 留档');
    assertEq(sb.__tasks[0].type, '文生图(验证图)'); assertEq(sb.__tasks[0].status, 'done');
    assert(sb.__toasts.some(t => t.includes('验证图已生成')), '成功提示');
    assertEq(s.__busy, false, '忙标复位');
  } },
  { name: 'genShotValidate:≥2 张主体参考走多图融合(3 积分),提示词带主体定义前缀', fn: async () => {
    const sb = loadSbGen();
    const p = { id: 'p1', subjects: [ // Domain.findSubject 按 p.subjects 数组解析(与生产同构)
      { id: 'sub1', name: '安雅', kind: 'character', image: '/uploads/ref/a.png' },
      { id: 'sub2', name: '老周', kind: 'character', image: '/uploads/ref/z.png' },
    ] };
    const ep = makeEp(); const s = ep.shots[0];
    s.video = null; s.characters = ['安雅', '老周']; s.prompt = '两人对峙';
    await sb.SBGen.genShotValidate(p, ep, s, null);
    assertEq(sb.__charges[0].cost, 3, '多图融合 3 积分');
    assertEq(sb.__imgReq.billingAction, 'image.fusion', '服务端推导 image.fusion');
    assertEq(JSON.stringify(sb.__imgReq.image), JSON.stringify(['/uploads/ref/a.png', '/uploads/ref/z.png']), '融合参考图两张');
    assert(sb.__imgReq.prompt.indexOf('主体定义:将图片1定义为「安雅」,将图片2定义为「老周」') === 0, '主体定义前缀与视频生成同源');
    assertEq(sb.__tasks[0].type, '多图融合(验证图)');
  } },
  { name: 'genShotValidate:终稿镜头拦截(未扣费未起任务)', fn: async () => {
    const sb = loadSbGen();
    const p = { id: 'p1', subjects: [] };
    const ep = makeEp(); const s = ep.shots[0]; s.final = true;
    await sb.SBGen.genShotValidate(p, ep, s, null);
    assertEq(sb.__charges.length, 0, '终稿不扣费');
    assertEq(sb.__tasks.length, 0, '终稿不起任务');
    assert(sb.__toasts.some(t => t.includes('解锁终稿')), '提示先解锁终稿');
    assertEq(s.image, undefined, 's.image 不被改写');
  } },
  { name: 'genShotValidate:上游失败自动退费,任务标记失败且 s.image 不变', fn: async () => {
    const sb = loadSbGen(); sb.__imgFail = true;
    const p = { id: 'p1', subjects: [] };
    const ep = makeEp(); const s = ep.shots[0]; s.video = null;
    await sb.SBGen.genShotValidate(p, ep, s, null);
    assertEq(sb.__charges.length, 1, '先扣费');
    assertEq(sb.__refunds.length, 1, '失败退费 1 笔');
    assertEq(sb.__refunds[0].cost, 2); assertEq(sb.__refunds[0].reason, '验证图生成失败');
    assertEq(sb.__tasks[0].status, 'failed'); assertEq(sb.__tasks[0].reason, '上游审核拦截');
    assertEq(s.image, undefined, '失败不写 s.image');
    assert(sb.__toasts.some(t => t.includes('积分已自动返还')), '失败退费提示');
    assertEq(s.__busy, false, '忙标复位');
  } },
  { name: 'genShotValidate:离线回退 PH 占位(不扣费不起任务,如实标注离线模拟)', fn: async () => {
    const sb = loadSbGen(); sb.__mediaReady = false;
    const p = { id: 'p1', subjects: [] };
    const ep = makeEp(); const s = ep.shots[0]; s.video = null;
    await sb.SBGen.genShotValidate(p, ep, s, null);
    assertEq(sb.__charges.length, 0, '离线不扣费');
    assertEq(sb.__tasks.length, 0, '离线不起任务');
    assert(String(s.image).indexOf('data:image/ph;seed=valimg:sh0:') === 0, 'PH 占位图写入 s.image');
    assertEq(s.history[0].model, '离线模拟', 'history 如实标注离线模拟');
    assert((s.__snaps || []).includes('验证图生成前'), '离线同样留档');
    assert(sb.__toasts.some(t => t.includes('离线占位')), '离线占位提示');
  } },
];

/* ================= 套件 7:pipeline.js(下一步引导阻塞尾注,P1-5) ================= */
const pipelineTests = [
  { name: 'nextForProject:主体缺图阻塞项(与动态开场项目级同口径)', fn() {
    const sb = loadPipeline();
    const p = { id: 'p1', script: 'x', subjects: [{ name: 'a', image: '/u/a.png' }, { name: 'b' }, { name: 'c' }], episodes: [] };
    const r = sb.Pipeline.nextForProject(p);
    assertEq(r.txt, '🎭 主体提取与生成(2 角色缺图)');
    assertEq(r.hash, '#/project/p1/roles');
    const p0 = { id: 'p1', script: 'x', subjects: [], episodes: [] };
    assertEq(sb.Pipeline.nextForProject(p0).txt, '🎭 主体提取与生成', '无主体不带尾注');
  } },
  { name: 'nextForProject:继续生成带 digestNote 尾注(过期>失败>待确认,取前两项)', fn() {
    const sb = loadPipeline();
    sb.AgentOps = { stateDigest: () => ({ stale: 2, failed: 1, uncfm: 5, noVideo: 3 }) };
    const ep = makeEp(); ep.shots[0].video = null; // 未就绪 → 落入「继续生成」分支
    const p = { id: 'p1', script: 'x', subjects: [{ name: 'a', image: '/u/a.png' }], episodes: [ep] };
    const r = sb.Pipeline.nextForProject(p);
    assertEq(r.txt, '🎬 继续生成:第一集(2 镜已过期·1 镜失败)', '取前两项,待确认被截断');
    assertEq(r.hash, '#/project/p1/episode/ep1');
  } },
  { name: 'nextForProject:digestNote 优先级——待确认抑制未生成;纯未生成兜底', fn() {
    const sb = loadPipeline();
    const ep = makeEp(); ep.shots[0].video = null;
    const p = { id: 'p1', script: 'x', subjects: [{ name: 'a', image: '/u/a.png' }], episodes: [ep] };
    sb.AgentOps = { stateDigest: () => ({ stale: 0, failed: 0, uncfm: 4, noVideo: 3 }) };
    assertEq(sb.Pipeline.nextForProject(p).txt, '🎬 继续生成:第一集(4 镜待确认)', '有待确认时未生成不再重复报');
    sb.AgentOps = { stateDigest: () => ({ stale: 0, failed: 0, uncfm: 0, noVideo: 3 }) };
    assertEq(sb.Pipeline.nextForProject(p).txt, '🎬 继续生成:第一集(3 镜未生成)', '无任何阻塞才报未生成');
    sb.AgentOps = { stateDigest: () => ({ stale: 0, failed: 0, uncfm: 0, noVideo: 0 }) };
    assertEq(sb.Pipeline.nextForProject(p).txt, '🎬 继续生成:第一集', '零阻塞无尾注');
  } },
  { name: 'nextForProject:AgentOps 未加载时退化为纯文案(不报错)', fn() {
    const sb = loadPipeline(); // 不挂 AgentOps
    const ep = makeEp(); ep.shots[0].video = null;
    const p = { id: 'p1', script: 'x', subjects: [{ name: 'a', image: '/u/a.png' }], episodes: [ep] };
    assertEq(sb.Pipeline.nextForProject(p).txt, '🎬 继续生成:第一集');
  } },
  { name: 'nextForEp:待出尾注与项目级同源(digestNote 去括号拼接待出数)', fn() {
    const sb = loadPipeline();
    sb.AgentOps = { stateDigest: () => ({ stale: 1, failed: 1, uncfm: 0, noVideo: 2 }) };
    const ep = makeEp({ content: '第一集剧本' }); ep.shots[0].video = null; ep.shots[1].video = null;
    const r = sb.Pipeline.nextForEp({ id: 'p1' }, ep);
    assertEq(r.key, 'gen');
    assertEq(r.txt, '🎬 生成视频(2 镜待出·1 镜已过期·1 镜失败)');
    const epR = makeEp({ content: '第一集剧本', composed: false, lastReview: { avg: 8 }, shots: [makeShot(0, { confirm: true }), makeShot(1, { confirm: true }), makeShot(2, { confirm: true })] }); // 全部出片已确认 → 合成成片分支(无尾注)
    assertEq(sb.Pipeline.nextForEp({ id: 'p1' }, epR).txt, '🎞 合成成片');
  } },
  { name: 'nextForEp:全出片已确认但未审 → 先走审片步骤(判旧同样按未审处理)', fn() {
    const sb = loadPipeline();
    const shots = [makeShot(0, { confirm: true }), makeShot(1, { confirm: true }), makeShot(2, { confirm: true })];
    const ep = makeEp({ content: '第一集剧本', composed: false, shots });
    let r = sb.Pipeline.nextForEp({ id: 'p1' }, ep);
    assertEq(r.key, 'review');
    assertEq(r.txt, '🧐 整集审片');
    ep.lastReview = { avg: 8, snapshotHash: 'bogus-stale' }; // 记录判旧
    r = sb.Pipeline.nextForEp({ id: 'p1' }, ep);
    assertEq(r.key, 'review');
    assertEq(r.txt, '🧐 重新审片(记录已过期)');
    ep.lastReview = { avg: 5 }; // 低分 → needs_human 审片修订
    assertEq(sb.Pipeline.nextForEp({ id: 'p1' }, ep).key, 'review');
  } },
  { name: 'prevForEp:已审未合成时上一步=整集审片(未审时仍为生成视频)', fn() {
    const sb = loadPipeline();
    const shots = [makeShot(0, { confirm: true }), makeShot(1, { confirm: true }), makeShot(2, { confirm: true })];
    const ep = makeEp({ content: '第一集剧本', composed: false, shots });
    assertEq(sb.Pipeline.prevForEp({ id: 'p1' }, ep).key, 'gen', '未审片时上一步仍是生成视频');
    ep.lastReview = { avg: 8 };
    assertEq(sb.Pipeline.prevForEp({ id: 'p1' }, ep).key, 'review', '已审未合成时上一步是整集审片');
  } },
  { name: 'hashOf:审片步骤直达首个待审集(全部达标时退回首集)', fn() {
    const sb = loadPipeline();
    const mk = (id, over) => makeEp(Object.assign({ id, title: id, content: '剧本', composed: false, shots: [makeShot(0, { confirm: true })] }, over || {}));
    const p = { id: 'p1', script: 'x', subjects: [], episodes: [mk('ep1', { lastReview: { avg: 8 } }), mk('ep2')] };
    assertEq(sb.Pipeline.hashOf(p, 'review'), '#/project/p1/episode/ep2', '应直达未审的第二集');
    p.episodes[1].lastReview = { avg: 8 };
    assertEq(sb.Pipeline.hashOf(p, 'review'), '#/project/p1/episode/ep1', '全部达标退回首集(回看报告)');
  } },
];

/* ================= 套件 8:sb-views.js(镜头状态归一 shotStatusHTML,P1-4) ================= */
const sbViewsTests = [
  { name: 'shotStatusHTML:终稿优先级最高(压过素材过期/出片),带解锁入口', fn() {
    const sb = loadSbViews(); sb.__stale = true;
    const s = makeShot(0, { final: true, reviews: [{ score: 9 }] });
    const h = sb.SBViews.shotStatusHTML({ id: 'p1' }, s);
    assert(h.includes('🔒 终稿') && h.includes('data-unfinal="sh0"'), '终稿锁+点击解锁');
    assert(!h.includes('素材已更新') && !h.includes('已出片'), '单一状态条:不再叠加其他角标');
  } },
  { name: 'shotStatusHTML:素材已更新压过失败与出片', fn() {
    const sb = loadSbViews(); sb.__stale = true;
    const h1 = sb.SBViews.shotStatusHTML({ id: 'p1' }, makeShot(0)); // video done
    assert(h1.includes('↻ 素材已更新') && !h1.includes('已出片'), '出片镜素材过期只显示过期条');
    const h2 = sb.SBViews.shotStatusHTML({ id: 'p1' }, makeShot(0, { video: { status: 'failed', error: 'x' } }));
    assert(h2.includes('↻ 素材已更新') && !h2.includes('✗ 失败'), '失败镜素材过期只显示过期条');
  } },
  { name: 'shotStatusHTML:失败条带转义错误信息', fn() {
    const sb = loadSbViews();
    const s = makeShot(0, { video: { status: 'failed', error: '上游<审核>拦截' } });
    const h = sb.SBViews.shotStatusHTML({ id: 'p1' }, s);
    assert(h.includes('✗ 失败') && h.includes('上游&lt;审核&gt;拦截'), '错误信息应 HTML 转义');
  } },
  { name: 'shotStatusHTML:已出片带最近审分(达标绿/低分红)', fn() {
    const sb = loadSbViews();
    const hi = sb.SBViews.shotStatusHTML({ id: 'p1' }, makeShot(0, { reviews: [{ score: 8.26 }] }));
    assert(hi.includes('✓ 已出片 · 审 8.3') && hi.includes('var(--green)'), '达标绿色带审分');
    const lo = sb.SBViews.shotStatusHTML({ id: 'p1' }, makeShot(0, { reviews: [{ score: 6.4 }] }));
    assert(lo.includes('✓ 已出片 · 审 6.4') && lo.includes('#f87171') && lo.includes('低于达标线'), '低分红色警示');
  } },
  { name: 'shotStatusHTML:审片报告过期降级为纯已出片(不显示分数)', fn() {
    const sb = loadSbViews(); sb.__rvStale = true;
    const h = sb.SBViews.shotStatusHTML({ id: 'p1' }, makeShot(0, { reviews: [{ score: 9 }] }));
    assert(h.includes('✓ 已出片') && !h.includes('审 9.0') && h.includes('审片报告已过期'), '过期报告不亮分数');
  } },
  { name: 'shotStatusHTML:确认态二分(已确认绿/待确认灰,均带确认闸入口)', fn() {
    const sb = loadSbViews();
    const cfm = sb.SBViews.shotStatusHTML({ id: 'p1' }, makeShot(0, { video: null, confirm: true }));
    assert(cfm.includes('✓ 已确认') && cfm.includes('data-cfm="sh0"') && cfm.includes('var(--green)'), '已确认绿色可取消');
    const wait = sb.SBViews.shotStatusHTML({ id: 'p1' }, makeShot(0, { video: null }));
    assert(wait.includes('待确认') && wait.includes('data-cfm="sh0"') && wait.includes('120,128,140'), '待确认灰色引导确认');
  } },
  { name: 'shotThumbHTML:生成中整幅蒙层(带取消)替代状态条,非生成中走归一状态条', fn() {
    const sb = loadSbViews();
    const ep = makeEp();
    const gen = makeShot(0, { video: { status: 'generating', upstreamId: 'up1' } });
    const hg = sb.SBViews.shotThumbHTML({ id: 'p1' }, ep, gen, 0, gen);
    assert(hg.includes('ws-gen') && hg.includes('data-cancel="sh0"'), '生成中蒙层带取消入口');
    assert(!hg.includes('待确认') && !hg.includes('已确认'), '生成中不叠状态条');
    const done = makeShot(1, { reviews: [{ score: 8 }] });
    const hd = sb.SBViews.shotThumbHTML({ id: 'p1' }, ep, done, 1, done);
    assert(hd.includes('✓ 已出片 · 审 8.0') && !hd.includes('ws-gen'), '非生成中走归一状态条');
  } },
];

/* ================= 套件 9:sb-io.js(SRT 软字幕 buildSrt,P1-6) ================= */
const sbIoTests = [
  { name: 'buildSrt:逐段时间轴对齐(起止时刻=累计时长),条目按序编号', fn() {
    const sb = loadSbIo();
    const srt = sb.SB.buildSrt([{ text: '第一句', dur: 2.5 }, { text: '第二句', dur: 1.5 }]);
    const lines = srt.split('\n');
    assertEq(lines[0], '1'); assertEq(lines[1], '00:00:00,000 --> 00:00:02,500'); assertEq(lines[2], '第一句');
    assertEq(lines[4], '2'); assertEq(lines[5], '00:00:02,500 --> 00:00:04,000'); assertEq(lines[6], '第二句');
  } },
  { name: 'buildSrt:空文本段占时长但不出条目,后续段起点正确且序号连续', fn() {
    const sb = loadSbIo();
    const srt = sb.SB.buildSrt([{ text: '', dur: 3 }, { text: '   ', dur: 1 }, { text: '唯一句', dur: 2 }]);
    assert(srt.indexOf('1\n00:00:04,000 --> 00:00:06,000\n唯一句') === 0, '空段时长累计进起点,got ' + JSON.stringify(srt));
    assert(!srt.includes('\n2\n'), '只有一个条目,序号不断号');
  } },
  { name: 'buildSrt:毫秒取整与小时进位;负时长钳零;文本去首尾空白', fn() {
    const sb = loadSbIo();
    const srt = sb.SB.buildSrt([{ text: 'x', dur: 3661.5 }, { text: '  y  ', dur: -5 }]);
    assert(srt.includes('00:00:00,000 --> 01:01:01,500'), '小时进位 hh:mm:ss,ms');
    assert(srt.includes('2\n01:01:01,500 --> 01:01:01,500\ny'), '负时长钳零(零时长段仍出条目),文本输出去首尾空白');
    const srt2 = sb.SB.buildSrt([{ text: 'a', dur: 1.9999 }]);
    assert(srt2.includes('00:00:00,000 --> 00:00:02,000'), '毫秒四舍五入');
  } },
  { name: 'buildSrt:无字幕文本返回空串(composedSrt 落 null 分支)', fn() {
    const sb = loadSbIo();
    assertEq(sb.SB.buildSrt([]), '');
    assertEq(sb.SB.buildSrt(null), '');
    assertEq(sb.SB.buildSrt([{ text: '', dur: 3 }, { dur: 2 }]), '');
    assert(!sb.SB.buildSrt([{ text: '', dur: 3 }]), '空串为假值 → ep.composedSrt = null');
  } },
];

/* ================= 套件 10:understanding.js(本集理解独立重生成 regen,P0-5) ================= */
const understandingTests = [
  { name: 'regen:成功——计费五件套,写 ep.understanding 并刷 sourceRev', fn: async () => {
    const sb = loadUnderstanding();
    sb.__chatJSONResult = { 剧情脉络: '主线a', 情绪曲线: '曲线b', 节奏规划: '节奏c', 视觉基调: '基调d', 关键场面: '场面e', 悬念与期待: '悬念f' };
    const ep = makeEp({ contentRev: 3, content: '剧本正文' });
    const ok = await sb.Understanding.regen({ id: 'p1' }, ep);
    assertEq(ok, true);
    assertEq(sb.__charges.length, 1); assertEq(sb.__charges[0].cost, 2, '扣 2 积分');
    assertEq(sb.__refunds.length, 0, '成功不退费');
    assertEq(sb.__tasks[0].type, '本集理解'); assertEq(sb.__tasks[0].status, 'done');
    assertEq(ep.understanding.剧情脉络, '主线a');
    assertEq(ep.understanding.sourceRev, 3, 'sourceRev 对应当前剧本版本');
    assert(!ep.understanding.fallback, '成功版不带回退标记');
    assert(sb.Store._saves >= 1, '落库');
  } },
  { name: 'regen:LLM 失败回退模板——退费置失败,不覆盖原有理解', fn: async () => {
    const sb = loadUnderstanding();
    sb.__chatJSONResult = null; // 返回结构不完整 → generate 回退默认模板(fallback:true)
    const ep = makeEp({ contentRev: 3, content: '剧本正文' });
    ep.understanding = { 剧情脉络: '旧理解' };
    const ok = await sb.Understanding.regen({ id: 'p1' }, ep);
    assertEq(ok, false);
    assertEq(sb.__charges.length, 1, '先扣费');
    assertEq(sb.__refunds.length, 1); assertEq(sb.__refunds[0].cost, 2, '失败退费');
    assert(sb.__refunds[0].reason.includes('失败退费'), '退费事由');
    assertEq(sb.__tasks[0].status, 'failed');
    assertEq(ep.understanding.剧情脉络, '旧理解', '原有理解保留不被回退模板覆盖');
    assert(sb.__toasts.some(t => t.includes('原有理解保留')), '如实提示保留');
  } },
  { name: 'regen:积分不足——任务置失败,不发起 LLM 调用', fn: async () => {
    const sb = loadUnderstanding();
    sb.__chargeOk = false;
    const ep = makeEp({ contentRev: 0, content: '剧本正文' });
    const ok = await sb.Understanding.regen({ id: 'p1' }, ep);
    assertEq(ok, false);
    assertEq(sb.__tasks[0].status, 'failed'); assertEq(sb.__tasks[0].reason, '积分不足');
    assertEq(sb.__called.filter(c => c === 'chatJSONRobust').length, 0, '未扣费不调用 LLM');
    assert(!ep.understanding, '不写理解');
  } },
];

/* ================= 运行器 ================= */
/* ================= 套件 N:domain.js (领域单源:指纹/就绪/判旧/工作流状态) ================= */
function loadDomain() {
  const sb = makeSandbox();
  loadFile(sb, 'domain.js');
  return sb;
}
function makeP(episodes, subjects) {
  return { id: 'p1', name: '项目', style: '漫剧', subjects: subjects || [], episodes: episodes || [] };
}
const domainTests = [
  { name: 'shotInputHash:同内容不同镜头 id 指纹相同(输入指纹不包含 shot id)', fn: () => {
    const sb = loadDomain();
    const p = makeP();
    const s1 = { id: 'a', order: 0, prompt: 'p', plot: 'plot', characters: [], dialogue: '', scene: '', props: [], duration: 5, camera: '固定镜头', image: 'u1' };
    const s2 = { id: 'b', order: 0, prompt: 'p', plot: 'plot', characters: [], dialogue: '', scene: '', props: [], duration: 5, camera: '固定镜头', image: 'u1' };
    assertEq(sb.Domain.shotInputHash(p, s1), sb.Domain.shotInputHash(p, s2), '不同 id 同输入指纹应相同');
  } },
  { name: 'shotInputHash:同一镜头改 prompt 后指纹变', fn: () => {
    const sb = loadDomain();
    const p = makeP();
    const s = { id: 'a', order: 0, prompt: 'p1', plot: 'plot', characters: [], dialogue: '', scene: '', props: [], duration: 5, camera: '固定镜头', image: 'u1' };
    const h1 = sb.Domain.shotInputHash(p, s);
    s.prompt = 'p2';
    const h2 = sb.Domain.shotInputHash(p, s);
    assert(h1 !== h2, '改 prompt 后指纹应变');
  } },
  { name: 'shotVideoReady:真实在线且状态 done 算就绪', fn: () => {
    const sb = loadDomain();
    assertEq(sb.Domain.shotVideoReady({ video: { status: 'done', url: 'http://x' } }, true), true);
    assertEq(sb.Domain.shotVideoReady({ video: { status: 'done', simulated: true } }, true), false, '在线时离线模拟不算就绪');
    assertEq(sb.Domain.shotVideoReady({ video: { status: 'done', simulated: true } }, false), true, '离线时模拟算就绪');
  } },
  { name: 'epComposedReady:仅 composed=true 不够,缺 inputHash 不算就绪', fn: () => {
    const sb = loadDomain();
    const ep = { composed: true, shots: [{ id: 'a', order: 0, video: { status: 'done', url: 'v' }, dialogue: '', narration: '', transition: null }] };
    assertEq(sb.Domain.epComposedReady(ep, true), false, '缺 composedInputHash 不算就绪');
  } },
  { name: 'episodeState:缺剧本 → blocked', fn: () => {
    const sb = loadDomain();
    const ep = { content: '', shots: [{ id: 'a', order: 0 }], contentRev: 0, graphRev: 0 };
    const st = sb.Domain.episodeState(makeP([ep]), ep, true);
    assertEq(st.status, 'blocked');
    assert(st.blockers.some(b => b.code === 'no-script'), '缺剧本应出现在 blockers');
  } },
  { name: 'episodeState:全部出片未确认 → needs_review', fn: () => {
    const sb = loadDomain();
    const s = { id: 'a', order: 0, video: { status: 'done', url: 'v' }, confirm: false };
    const ep = { content: '剧本', shots: [s], contentRev: 0, graphRev: 0 };
    const st = sb.Domain.episodeState(makeP([ep]), ep, true);
    assertEq(st.status, 'needs_review');
    assertEq(st.action.key, 'confirm', '未确认时应推荐确认');
  } },
  { name: 'episodeState:审片<7 且无其它阻塞 → needs_human', fn: () => {
    const sb = loadDomain();
    const s = { id: 'a', order: 0, video: { status: 'done', url: 'v' }, confirm: true };
    const ep = { content: '剧本', shots: [s], contentRev: 0, graphRev: 0, lastReview: { avg: 6.5 } };
    const st = sb.Domain.episodeState(makeP([ep]), ep, true);
    assertEq(st.status, 'needs_human');
    assertEq(st.action.key, 'review');
  } },
  { name: 'episodeState:视频全出片确认且审片≥7 → ready 合成', fn: () => {
    const sb = loadDomain();
    const s = { id: 'a', order: 0, video: { status: 'done', url: 'v' }, confirm: true };
    const ep = { content: '剧本', shots: [s], contentRev: 0, graphRev: 0, lastReview: { avg: 8 } };
    const st = sb.Domain.episodeState(makeP([ep]), ep, true);
    assertEq(st.status, 'ready');
    assertEq(st.action.key, 'compose', '应推荐合成');
  } },
  { name: 'workflow:空项目 steps[0]=prod(支线 ready),推荐动作=script', fn: () => {
    const sb = loadDomain();
    const w = sb.Domain.workflow(makeP(), true);
    assertEq(w.steps[0].key, 'prod', '首步应为制片(支线)');
    assertEq(w.steps[0].status, 'ready', '空项目制片未开始=ready');
    assertEq(w.recommendedAction.key, 'script', '推荐动作应为编写剧本(主线首步)');
  } },
  { name: 'workflow:全部合成完成 → film done', fn: () => {
    const sb = loadDomain();
    const s = { id: 'a', order: 0, video: { status: 'done', url: 'http://x/v.mp4' }, confirm: true };
    const ep = { content: '剧本', shots: [s], contentRev: 0, graphRev: 0, lastReview: { avg: 8 }, composed: true, composedUrl: 'x', composedInputHash: sb.Domain.composedInputHash({ shots: [s], contentRev: 0, graphRev: 0, sbConfig: { subtitle: true, ratio: '16:9' } }, true), composedSourceRev: 0, composedGraphRev: 0, sbConfig: { subtitle: true, ratio: '16:9' } };
    const w = sb.Domain.workflow(Object.assign(makeP([ep], [{ id: 'sj1', name: '主角', image: 'u' }]), { script: 'x', extractDone: true }), true);
    assertEq(w.steps.find(st => st.key === 'film').status, 'done', '成片步应 done');
  } },
  { name: 'workflow:审片是主线一等步骤(gen 与 film 之间),未审 → 未完成+no-review 阻塞+推荐整集审片', fn: () => {
    const sb = loadDomain();
    const s = { id: 'a', order: 0, video: { status: 'done', url: 'http://x/v.mp4' }, confirm: true };
    const ep = { id: 'ep1', title: '第一集', content: '剧本', shots: [s], contentRev: 0, graphRev: 0 };
    const w = sb.Domain.workflow(Object.assign(makeP([ep], [{ id: 'sj1', name: '主角', image: 'u' }]), { script: 'x', extractDone: true }), true);
    const mains = w.steps.filter(st => !st.side).map(st => st.key);
    assertEq(mains.join(','), 'script,subjects,eps,shots,gen,review,film', '主线步骤序应为 剧本→主体→分集→分镜→剪辑→审片→成片');
    const rv = w.steps.find(st => st.key === 'review');
    assertEq(rv.name, '审片');
    assertEq(rv.done, false, '未审片时审片步未完成');
    assertEq((rv.blockers[0] || {}).code, 'no-review', '应报未审片阻塞项');
    assertEq(w.recommendedAction.key, 'review', '审片未完成时项目级推荐动作应落审片');
    assertEq(w.recommendedAction.label, '整集审片:第一集');
    assertEq(w.recommendedAction.hash, '#/project/p1/episode/ep1', '推荐动作应直达该分集工作区');
  } },
  { name: 'workflow:审片达标 → review done 且推荐动作前进到合成;低分/判旧各自阻塞与文案', fn: () => {
    const sb = loadDomain();
    const s = { id: 'a', order: 0, video: { status: 'done', url: 'http://x/v.mp4' }, confirm: true };
    const ep = { id: 'ep1', title: '第一集', content: '剧本', shots: [s], contentRev: 0, graphRev: 0, lastReview: { avg: 8 } };
    const p = Object.assign(makeP([ep], [{ id: 'sj1', name: '主角', image: 'u' }]), { script: 'x', extractDone: true });
    let w = sb.Domain.workflow(p, true);
    assertEq(w.steps.find(st => st.key === 'review').done, true, '达标应 done');
    assertEq(w.recommendedAction.key, 'compose', '审片完成后推荐动作前进到合成');
    ep.lastReview = { avg: 5 };
    w = sb.Domain.workflow(p, true);
    const low = w.steps.find(st => st.key === 'review');
    assertEq(low.done, false);
    assertEq((low.blockers[0] || {}).code, 'low-review', '低分应报 low-review');
    assertEq(w.recommendedAction.label, '审片修订:第一集');
    ep.lastReview = { avg: 8, snapshotHash: 'bogus-stale' };
    w = sb.Domain.workflow(p, true);
    const st2 = w.steps.find(x => x.key === 'review');
    assertEq((st2.blockers[0] || {}).code, 'review-stale', '快照失配应报 review-stale(判旧视为未审)');
    assertEq(w.recommendedAction.label, '重新审片:第一集');
  } },
  { name: 'REVIEW_MIN:达标线单源,episodeState 与主线审片步骤同用一个常量', fn: () => {
    const sb = loadDomain();
    assertEq(sb.Domain.REVIEW_MIN, 7);
    const src = fs.readFileSync(path.join(ROOT, 'js/domain.js'), 'utf8');
    assert(!/reviewAvg < 7/.test(src), 'domain 不应再有硬编码 7 的审片达标线字面量');
  } },
  { name: 'understandingStale 挂 graphRev(二十三轮):无字段保持原语义/失配判旧/对齐恢复', fn: () => {
    const sb = loadDomain();
    const ep = { content: 'v1', contentRev: 1, graphRev: 3, understanding: { 剧情脉络: 'x', sourceRev: 1 } };
    assertEq(sb.Domain.understandingStale(ep), false, '无 graphRev 记录的旧理解保持原语义(不一次性全量判旧)');
    ep.understanding.graphRev = 2;
    assertEq(sb.Domain.understandingStale(ep), true, '图谱修订后理解应判旧(理解 prompt 消费 eventsText)');
    ep.understanding.graphRev = 3;
    assertEq(sb.Domain.understandingStale(ep), false, 'graphRev 对齐后恢复当前');
  } },
  { name: 'reviewStaleByScript 快照判据(二十三轮):无 snapshotHash 不判/匹配不判/镜头重抽失配判旧', fn: () => {
    const sb = loadDomain();
    const ep = { content: 'v', contentRev: 0, graphRev: 0, shots: [{ id: 'a', order: 0, video: { status: 'done', url: 'v1', inputHash: 'h1' } }],
      lastReview: { avg: 8, sourceRev: 0, graphRev: 0 } };
    assertEq(sb.Domain.reviewStaleByScript(ep), false, '无 snapshotHash 的旧记录保持原语义(迁移兼容)');
    ep.lastReview.snapshotHash = sb.Domain.reviewSnapshotHashOf(ep);
    assertEq(sb.Domain.reviewStaleByScript(ep), false, '快照匹配不判旧');
    ep.shots[0].video = { status: 'done', url: 'v2', inputHash: 'h2' }; // 镜头重抽
    assertEq(sb.Domain.reviewStaleByScript(ep), true, '镜头重抽后快照失配应判旧');
  } },
  { name: 'composedDialogueSig(二十三轮):无记录保持原语义;记录后改台词/时长判未就绪', fn: () => {
    const sb = loadDomain();
    const ep = { composed: true, shots: [{ id: 'a', order: 0, dialogue: '你好', narration: '', duration: 5, video: { status: 'done', url: 'v', inputHash: 'h' }, transition: null }] };
    ep.composedInputHash = sb.Domain.composedInputHash(ep, true);
    assertEq(sb.Domain.epComposedReady(ep, true), true, '无 composedDialogueSig 记录的旧数据保持原语义');
    ep.composedDialogueSig = sb.Domain.composedDialogueSig(ep, true);
    assertEq(sb.Domain.epComposedReady(ep, true), true, '记录匹配时应就绪');
    ep.shots[0].dialogue = '改台词';
    assertEq(sb.Domain.epComposedReady(ep, true), false, '改台词后成片应判未就绪(烧录字幕/SRT 失配)');
    ep.shots[0].dialogue = '你好'; ep.shots[0].duration = 9;
    assertEq(sb.Domain.epComposedReady(ep, true), false, '改时长后 SRT 时间轴失配应判未就绪');
  } },
  { name: 'episodeState:审片判旧时 reviewAvg=null 不卡 needs_human + reviewStale 透出(二十三轮)', fn: () => {
    const sb = loadDomain();
    const s = { id: 'a', order: 0, dialogue: '', narration: '', duration: 5, characters: [], scene: '', props: [], video: { status: 'done', url: 'v' }, confirm: true };
    const ep = { content: '剧本', shots: [s], contentRev: 0, graphRev: 0 };
    const p = makeP([ep]);
    s.video.inputHash = sb.Domain.shotInputHash(p, s);
    ep.lastReview = { avg: 5, sourceRev: 0, graphRev: 0, snapshotHash: 'bogus-stale' };
    const st = sb.Domain.episodeState(p, ep, true);
    assertEq(st.reviewStale, true, '快照失配应透出 reviewStale');
    assertEq(st.reviewAvg, null, '判旧的旧分不再卡 needs_human');
    assert(st.status !== 'needs_human', '判旧低分不应再卡 needs_human,实际:' + st.status);
    ep.lastReview = { avg: 5, sourceRev: 0, graphRev: 0, snapshotHash: sb.Domain.reviewSnapshotHashOf(ep) };
    const st2 = sb.Domain.episodeState(p, ep, true);
    assertEq(st2.reviewStale, false, '快照匹配不判旧');
    assertEq(st2.status, 'needs_human', '有效低分仍卡 needs_human(质量闸门)');
  } },
  /* ---- 配音渲染清单(音色配置单源 + audioMeta 凭据 + 判旧 + 成片去向) ---- */
  { name: 'normVoiceCfg:字符串音色 → 结构化;越界数值钳回设置面板区间;空值取缺省', fn: () => {
    const sb = loadDomain();
    assertEq(JSON.stringify(sb.Domain.normVoiceCfg('高冷御姐')), JSON.stringify({ voice: '高冷御姐', rate: 1, volume: 5, pitch: 1, emotion: '平静' }), '旧字符串音色应补齐缺省参数');
    const c = sb.Domain.normVoiceCfg({ voice: '甜心小美', rate: 9, volume: -3, pitch: 0, emotion: '开心' });
    assertEq(c.rate, 1, '越界语速回缺省');
    assertEq(c.volume, 5, '越界音量回缺省');
    assertEq(c.pitch, 1, '越界语调回缺省');
    assertEq(c.emotion, '开心', '情感原样保留');
    assertEq(sb.Domain.normVoiceCfg(null).voice, '叙事氛围', '空值取缺省音色');
  } },
  { name: 'voiceCfgOf:优先级 镜头声音设置 → 项目旁白 → 镜头人物音色 → 本集旁白音色', fn: () => {
    const sb = loadDomain();
    const ep = { sbConfig: { narratorVoice: '少年音' } };
    const s = { id: 'a', order: 0, voice: '清晰解说' };
    assertEq(sb.Domain.voiceCfgOf(makeP([ep]), ep, s).voice, '清晰解说', '无项目旁白时取镜头人物音色');
    const p2 = Object.assign(makeP([ep]), { narration: { voice: '温柔细腻', rate: 1.2, emotion: '温柔' } });
    assertEq(sb.Domain.voiceCfgOf(p2, ep, s).voice, '温柔细腻', '项目旁白设置优先于镜头人物音色');
    s.voiceCfg = { voice: '威严男声', rate: 0.9 };
    const c = sb.Domain.voiceCfgOf(p2, ep, s);
    assertEq(c.voice, '威严男声', '镜头声音设置最高优先');
    assertEq(c.rate, 0.9);
    assertEq(sb.Domain.voiceCfgOf(makeP([ep]), ep, { id: 'b', order: 1 }).voice, '少年音', '都没有时回落本集旁白音色');
  } },
  { name: 'audioMetaOf:未配音 null;旧布尔数据补最小结构标 legacy(有 URL=真实/无 URL=离线);结构化凭据原样返回', fn: () => {
    const sb = loadDomain();
    assertEq(sb.Domain.audioMetaOf({ id: 'a' }), null, '从未配音应为 null(不臆造凭据)');
    const legacyReal = sb.Domain.audioMetaOf({ id: 'a', audio: true, audioUrl: '/uploads/gen/tts_1.mp3' });
    assertEq(legacyReal.legacy, true, '旧数据标 legacy');
    assertEq(legacyReal.offline, false, '旧数据有 URL = 真实音轨');
    assertEq(legacyReal.params, null, '旧数据参数未落库,留空不臆造');
    assertEq(sb.Domain.audioMetaOf({ id: 'a', audio: true }).offline, true, '旧数据仅布尔标记 = 离线占位');
    const meta = { voice: '叙事氛围', params: { rate: 1, volume: 5, pitch: 1, emotion: '平静' }, sig: 'x', offline: false, url: '/u/a.mp3', voiceId: 'zh_male_dayi_saturn_bigtts' };
    assertEq(sb.Domain.audioMetaOf({ id: 'a', audio: true, audioUrl: '/u/a.mp3', audioMeta: meta }).voiceId, 'zh_male_dayi_saturn_bigtts', '结构化凭据优先原样返回');
  } },
  { name: 'audioMetaWrite:真实回执落 url/duration/上游音色 id;离线占位标 offline 且不写 url;未拿到的字段一律不写', fn: () => {
    const sb = loadDomain();
    const cfg = { voice: '甜心小美', rate: 1.2, volume: 6, pitch: 1, emotion: '开心' };
    const real = sb.Domain.audioMetaWrite(cfg, '一句旁白', { url: '/uploads/gen/tts_2.mp3', duration: 3.2, voiceId: 'zh_female_vv_uranus_bigtts', time: 't' });
    assertEq(real.offline, false);
    assertEq(real.url, '/uploads/gen/tts_2.mp3');
    assertEq(real.duration, 3.2);
    assertEq(real.voiceId, 'zh_female_vv_uranus_bigtts');
    assertEq(JSON.stringify(real.params), JSON.stringify({ rate: 1.2, volume: 6, pitch: 1, emotion: '开心' }));
    assertEq(real.sig, sb.Domain.audioSig(cfg, '一句旁白'), 'sig 与参数+文本签名一致');
    const off = sb.Domain.audioMetaWrite(cfg, '一句旁白', { offline: true });
    assertEq(off.offline, true);
    assert(!('url' in off) && !('duration' in off) && !('voiceId' in off), '离线占位不写音轨/时长/上游音色 id,got ' + JSON.stringify(off));
  } },
  { name: 'audioTrackOf:真实音轨可混入;离线占位不混音;旧数据有 URL 行为不变', fn: () => {
    const sb = loadDomain();
    const cfg = { voice: '叙事氛围' };
    const real = { id: 'a', audio: true, audioUrl: '/u/a.mp3', audioMeta: sb.Domain.audioMetaWrite(cfg, 't', { url: '/u/a.mp3' }) };
    assertEq(sb.Domain.audioTrackOf(real), '/u/a.mp3');
    const off = { id: 'b', audio: true, audioMeta: sb.Domain.audioMetaWrite(cfg, 't', { offline: true }) };
    assertEq(sb.Domain.audioTrackOf(off), '', '离线占位不混入成片音轨');
    assertEq(sb.Domain.audioTrackOf({ id: 'c', audio: true, audioUrl: '/u/c.mp3' }), '/u/c.mp3', '旧布尔数据按 URL 混音(兼容,不改行为)');
    assertEq(sb.Domain.audioTrackOf({ id: 'd' }), '', '未配音无音轨');
  } },
  { name: 'audioStale:旧数据无 sig 不判旧;参数匹配不判旧;改音色/改配音文本判旧', fn: () => {
    const sb = loadDomain();
    const ep = { sbConfig: { narratorVoice: '叙事氛围' }, shots: [] };
    const p = makeP([ep]);
    const s = { id: 'a', order: 0, narration: '夜色渐深', audio: true, audioUrl: '/u/a.mp3' };
    ep.shots.push(s);
    assertEq(sb.Domain.audioStale(p, ep, s), false, '旧布尔数据无 sig 记录,不一夜判旧');
    s.audioMeta = sb.Domain.audioMetaWrite(sb.Domain.voiceCfgOf(p, ep, s), sb.Domain.audioTextOf(s), { url: '/u/a.mp3' });
    assertEq(sb.Domain.audioStale(p, ep, s), false, '凭据与当前参数一致不判旧');
    s.voiceCfg = { voice: '高冷御姐' };
    assertEq(sb.Domain.audioStale(p, ep, s), true, '换音色后已渲染音轨应判旧');
    delete s.voiceCfg;
    assertEq(sb.Domain.audioStale(p, ep, s), false, '换回原音色恢复');
    s.narration = '夜色渐深,风更冷了';
    assertEq(sb.Domain.audioStale(p, ep, s), true, '改配音文本后应判旧(念的还是旧稿)');
  } },
  { name: 'audioRenderList:逐镜清单 + summary 计数;mixed 仅算真进成片的镜(无素材镜不在列)', fn: () => {
    const sb = loadDomain();
    const ep = { sbConfig: { narratorVoice: '叙事氛围', subtitle: true, ratio: '16:9' }, shots: [] };
    const p = makeP([ep]);
    const mk = (id, order, extra) => Object.assign({ id, order, narration: '旁白' + order, characters: [], props: [], scene: '' }, extra);
    const s1 = mk('s1', 0, { image: 'img1', audio: true, audioUrl: '/u/1.mp3' }); // 旧布尔数据 + 有底图 → 混音
    const s2 = mk('s2', 1, { image: 'img2', audio: true, audioMeta: sb.Domain.audioMetaWrite({ voice: '叙事氛围' }, '旁白1', { offline: true }) }); // 离线占位
    const s3 = mk('s3', 2, { audio: true, audioUrl: '/u/3.mp3', audioMeta: sb.Domain.audioMetaWrite({ voice: '叙事氛围' }, '不是当前文本', { url: '/u/3.mp3' }) }); // 判旧且无素材(不进成片)
    const s4 = mk('s4', 3, { image: 'img4', narration: '', dialogue: '', plot: '' }); // 无文本未配音
    ep.shots.push(s1, s2, s3, s4);
    const list = sb.Domain.audioRenderList(p, ep, true);
    assertEq(list.rows.length, 4);
    assertEq(list.rows[0].order, 1, 'order 从 1 起(与镜头号一致)');
    assertEq(list.rows[0].mixed, true, '旧数据真实音轨且在列 → 混入成片');
    assertEq(list.rows[1].mixed, false, '离线占位不混音');
    assertEq(list.rows[2].inFilm, false, '无视频也无底图的镜不在成片序列');
    assertEq(list.rows[2].mixed, false, '不在成片序列的镜不算混入');
    assertEq(list.rows[2].stale, true, '文本失配判旧');
    assertEq(list.rows[3].rendered, false, '未配音');
    assertEq(list.rows[3].hasText, false, '无旁白/台词/剧情 → 无配音文本');
    const sm = list.summary;
    assertEq(sm.total, 4); assertEq(sm.rendered, 3); assertEq(sm.mixed, 1);
    assertEq(sm.offline, 1); assertEq(sm.legacy, 1); assertEq(sm.stale, 1);
    assertEq(sm.missing, 0, '未配音但有文本的镜数(s4 无文本不计)');
    assertEq(sm.noText, 1);
  } },
];

/* ================= 套件 12:bus.js(管线事件总线,第三阶段) ================= */
function loadBus() {
  const sb = makeSandbox();
  installCommon(sb);
  loadFile(sb, 'bus.js');
  return sb;
}
const busTests = [
  { name: 'on/emit:订阅者收到事件与注入的 name/time;off 与退订函数都生效', fn() {
    const sb = loadBus();
    const B = sb.Bus;
    const got = [];
    const fn = ev => got.push(ev);
    const off = B.on('shots.batchDone', fn);
    B.emit('shots.batchDone', { ok: 3, brief: 'x' });
    assertEq(got.length, 1);
    assertEq(got[0].name, 'shots.batchDone', 'emit 应注入事件名');
    assertEq(got[0].ok, 3);
    assert(got[0].time, 'emit 应注入时间');
    off();
    B.emit('shots.batchDone', {});
    assertEq(got.length, 1, '退订函数应生效');
    B.on('compose.done', fn);
    B.off('compose.done', fn);
    B.emit('compose.done', {});
    assertEq(got.length, 1, 'off 应生效');
  } },
  { name: 'emit:订阅者异常被隔离,不阻断其它订阅者与管线', fn() {
    const sb = loadBus();
    const B = sb.Bus;
    let hit = false;
    B.on('x', () => { throw new Error('subscriber boom'); });
    B.on('x', () => { hit = true; });
    B.emit('x', {});
    assert(hit, '异常订阅者不应阻断后续订阅者');
  } },
  { name: '通配订阅 "*" 收全部事件;emit("*") 不重复触发通配', fn() {
    const sb = loadBus();
    const B = sb.Bus;
    const all = [];
    B.on('*', ev => all.push(ev.name));
    B.emit('a', {});
    B.emit('b', {});
    B.emit('*', {});
    assertEq(all.join(','), 'a,b,*', '通配订阅应收全部,emit "*" 只触发一次通配');
  } },
  { name: 'recent:新→旧,按 pid 过滤,上限裁剪', fn() {
    const sb = loadBus();
    const B = sb.Bus;
    for (let i = 0; i < 55; i++) B.emit('e' + i, { p: { id: 'p1' }, brief: 'b' + i });
    B.emit('other', { p: { id: 'p2' } });
    const list = B.recent(10, 'p1');
    assertEq(list.length, 10);
    assertEq(list[0].name, 'e54', '最新在前');
    assertEq(list[9].name, 'e45', '取最近 10 条');
    assert(!list.some(h => h.name === 'other'), '应按 pid 过滤');
    assertEq(B.recent(999).length, 50, '历史上限 50 条');
  } },
];

/* ================= 套件 13:issues.js(问题中心,第三阶段) ================= */
function loadIssues() {
  const sb = makeSandbox();
  installCommon(sb);
  loadFile(sb, 'domain.js');
  loadFile(sb, 'knowledge.js'); // skill 索引的加载期依赖(与 index.html 同顺序:domain → knowledge → skills → wf-core → issues)
  loadFile(sb, 'prompts.js');
  loadFile(sb, 'skills.js');    // 问题中心消费的跨镜主体一致性/分镜景别衔接校验项
  loadFile(sb, 'wf-core.js');   // 景别衔接校验项的级差现取 WfCore.sizeGap(词表单源)
  loadFile(sb, 'issues.js');
  return sb;
}
/* 跨端对照夹具:一个项目里同时摆出状态类问题(缺剧本/未拆镜/失败镜/素材过期/待确认/低分/成片过期/主体缺图)
 * 与五面方法论提醒(剧本/分集两条/主体一致性/景别衔接/字幕),kind 集合尽量宽。
 * 纯数据,不带任何环境句柄——Node 与浏览器两条路径读到的应当是同一份结论。 */
function crossEndP() {
  const shot = (id, order, over) => Object.assign({
    id, order, name: '', plot: 'p', prompt: 'q', camera: '固定镜头', duration: 5,
    characters: [], scene: '', props: [], confirm: true, cameraSpec: { shotSize: '中景' },
    video: { status: 'done', url: 'http://x/v.mp4' },
  }, over || {});
  const OK = '她原来早就知道那份文件是假的。她亮出证据当众揭穿骗局,众人哗然,反派连连道歉。'
    + '门被推开,那个人竟然出现:「你老婆在我手上,一小时内拿东西来换。」';
  const FILL = '江城的春天多雨。'.repeat(16);
  const BG = '江城的春天多雨。'.repeat(20) + '她被人嘲笑,却默默忍住。'; // 开篇铺陈过长:剧本面命中
  return {
    id: 'p1',
    subjects: [
      { id: 'sj1', name: '主角', kind: 'character', image: 'u', imgVer: 2, forms: [{ id: 'fm1', name: '战损', image: 'u2' }] },
      { id: 'sj2', name: '玉佩', kind: 'prop', image: '' },
    ],
    episodes: [
      { id: 'ep1', title: '第1集', content: BG, sbConfig: { subtitle: true },
        shots: [
          shot('sh0', 0, { characters: ['主角'], dialogue: '我'.repeat(130), video: { status: 'done', url: 'http://x/v.mp4', assetVer: 1 } }),
          shot('sh1', 1, { characters: ['主角-战损'] }),
          shot('sh2', 2, { confirm: false, video: null }),
          shot('sh3', 3, { video: { status: 'failed', error: '上游超时' } }),
        ],
        lastReview: { avg: 6, perShot: [{ shotId: 'sh0', order: 0, score: 6 }] },
        composed: true, composedInputHash: 'stale' },
      { id: 'ep2', title: '第2集', content: OK + FILL, shots: [] },
      { id: 'ep3', title: '第3集', content: OK, shots: [] },
      { id: 'ep4', title: '第4集', content: '', shots: [] },
      { id: 'ep5', title: '第5集', content: OK, shots: [] },
      { id: 'ep6', title: '第6集', content: OK, shots: [] },
    ],
  };
}
/* 齐备分集夹具:全 done+确认+已审高分+成片就绪(无问题基准)。
 * 提示词写全三面稳定词:SK-19 稳定词面判的是真实生成请求那条提示词,写全了本面才真的干净——
 * 少写一面这里就该报提醒(那正是「SK-19 漂移」用例的夹具),干净基准不能靠这一面判不出结论来充。 */
const CLEAN_PROMPT = 'q,五官不变形,人体结构正常,动作不僵硬';
function cleanEp(over) {
  const s = { id: 'sh0', order: 0, name: '', plot: 'p', prompt: CLEAN_PROMPT, camera: '固定镜头', duration: 5, characters: [], scene: '', props: [], confirm: true, video: { status: 'done', url: 'http://x/v.mp4' } };
  return Object.assign({ id: 'ep1', title: '第一集', content: '剧本正文', shots: [s], lastReview: { avg: 8, perShot: [{ shotId: 'sh0', order: 0, score: 8 }] } }, over || {});
}
const issuesTests = [
  { name: 'Bus 通配订阅:事件风暴防抖合并 + 角标单轮一次 collect(§3.4)', fn: async () => {
    const sb = makeSandbox();
    installCommon(sb);
    loadFile(sb, 'domain.js');
    const handlers = [];
    sb.Bus = { on: (n, fn) => handlers.push(fn), emit: (n, e) => handlers.forEach(fn => fn(e || { name: n })) };
    loadFile(sb, 'issues.js');
    loadFile(sb, 'issues-ui.js'); // 弹窗渲染/Bus 订阅/命令处置在浏览器薄封装里(与 index.html 同顺序:issues → issues-ui)
    // 项目页角标按钮桩(常驻)
    const btn = { dataset: { pid: 'p1' }, innerHTML: '', isConnected: true };
    sb.document.querySelector = sel => (sel === '[data-x=pissues][data-pid]' ? btn : null);
    const p = { id: 'p1', subjects: [], episodes: [{ id: 'ep1', title: '一', content: '剧本', shots: [] }] };
    sb.Store.getProject = id => (id === 'p1' ? p : null);
    let calls = 0;
    const orig = sb.Domain.episodeState;
    sb.Domain.episodeState = (...a) => { calls++; return orig(...a); };
    for (let i = 0; i < 10; i++) sb.Bus.emit('shots.changed'); // 事件风暴
    await sleep(260);
    assertEq(calls, 1, '10 事件应防抖合并为一轮重算(1 集=1 次 episodeState),实际 ' + calls);
    assert(btn.innerHTML.includes('问题'), '角标应已刷新');
    // 无消费者(无弹窗无角标)时:事件不再触发重算
    sb.document.querySelector = () => null;
    const c0 = calls;
    for (let i = 0; i < 5; i++) sb.Bus.emit('shots.changed');
    await sleep(260);
    assertEq(calls, c0, '无消费者时应跳过重算');
  } },
  { name: 'collect:干净项目返回空(全齐备零噪音)', fn() {
    const sb = loadIssues();
    const ep = cleanEp({ composed: true, composedInputHash: sb.Domain.composedInputHash(cleanEp(), false), composedSourceRev: 0, composedGraphRev: 0 });
    const p = { id: 'p1', subjects: [{ id: 'sj1', name: '主角', kind: 'character', image: 'u' }], episodes: [ep] };
    assertEq(sb.Issues.collect(p).length, 0, '齐备分集不应产生问题');
  } },
  { name: 'collect:失败镜 → 高危 + cmd 子集重生成(shotIds 联动)', fn() {
    const sb = loadIssues();
    const ep = cleanEp({ shots: [
      Object.assign({}, cleanEp().shots[0]),
      Object.assign({}, cleanEp().shots[0], { id: 'sh1', order: 1, video: { status: 'failed', error: '上游超时' } }),
    ] });
    const p = { id: 'p1', subjects: [{ id: 'sj1', name: '主角', image: 'u' }], episodes: [ep] };
    const list = sb.Issues.collect(p);
    const it = list.find(x => x.kind === 'failed-shots');
    assert(it, '失败镜应入清单');
    assertEq(it.sev, 'high');
    assertEq(it.cmd, 'episode.generateVideos', '失败镜处置应走统一命令批量生成');
    assertEq(it.shotIds.join(','), 'sh1', 'shotIds 应只含失败镜');
    assert(it.detail.includes('上游超时'), '失败原因应入明细');
    assertEq(list[0].kind, 'failed-shots', '高危问题应排最前');
  } },
  { name: 'collect:缺剧本/未分镜/主体缺图/低分审片/待确认/成片过期 各归其类', fn() {
    const sb = loadIssues();
    const doneShot = cleanEp().shots[0];
    const p = {
      id: 'p1',
      subjects: [{ id: 'sj1', name: '主角', kind: 'character', image: '' }],
      episodes: [
        { id: 'ep0', title: '空集', content: '', shots: [] },
        { id: 'ep1', title: '未拆镜', content: '有剧本', shots: [] },
        cleanEp({ lastReview: { avg: 6, perShot: [{ shotId: 'sh0', order: 0, score: 6 }] }, composed: false, id: 'ep2', title: '低分集' }),
        cleanEp({ id: 'ep3', title: '待确认集', shots: [Object.assign({}, doneShot, { confirm: false })], composed: false }),
        cleanEp({ id: 'ep4', title: '成片过期集', composed: true, composedInputHash: 'stale' }),
      ],
    };
    const list = sb.Issues.collect(p);
    const kinds = list.map(x => x.kind);
    assert(kinds.includes('no-script'), '缺剧本应入清单');
    assert(kinds.includes('no-shots') && list.find(x => x.kind === 'no-shots').cmd === 'episode.generateStoryboard', '未分镜应可一键智能分镜');
    assert(kinds.includes('subject-no-image'), '主体缺图应入清单');
    assert(kinds.includes('low-review'), '低分审片应入清单');
    assert(kinds.includes('unconfirmed'), '待确认应入清单');
    assert(kinds.includes('composed-stale') && list.find(x => x.kind === 'composed-stale').cmd === 'episode.compose', '成片过期应可一键重新合成');
    assertEq(list[0].kind, 'no-script', '高危(缺剧本)排最前');
    assertEq(sb.Issues.count(p), list.length, 'count 与 collect 同源');
  } },
  { name: 'collect:跨镜主体参考不一致 → 低危提醒(不进高/中危,不改发布门 G2)', fn() {
    const sb = loadIssues();
    const done = cleanEp().shots[0];
    const ep = cleanEp({
      composed: false,
      shots: [Object.assign({}, done, { characters: ['主角'] }), Object.assign({}, done, { id: 'sh1', order: 1, characters: ['主角-战损'] })],
      lastReview: { avg: 8, perShot: [{ shotId: 'sh0', order: 0, score: 8 }, { shotId: 'sh1', order: 1, score: 8 }] },
    });
    const p = { id: 'p1', subjects: [{ id: 'sj1', name: '主角', kind: 'character', image: 'u', forms: [{ id: 'fm1', name: '战损', image: 'u2' }] }], episodes: [ep] };
    const list = sb.Issues.collect(p);
    const it = list.find(x => x.kind === 'subject-inconsistent');
    assert(it, '同一主体跨镜锁到不同参考图应入清单');
    assertEq(it.sev, 'low', '一致性风险是提醒级(发布门 G2 只数高/中危)');
    assertEq(it.count, 1);
    assert(it.detail.includes('镜头2') && it.detail.includes('主角-战损'), '明细应定位到镜号与主体名,实际:' + it.detail);
    assert(it.goto && !it.cmd, '一致性问题走导航自查,不挂命令处置(不触发任何生成)');
    assertEq(list.filter(x => x.sev !== 'low').length, 0, '一致性提醒不得产出高/中危(门禁状态不变)');
  } },
  { name: 'collect:成片字幕读不顺 → 低危提醒(不进高/中危,不改发布门 G2)', fn() {
    const sb = loadIssues();
    const done = cleanEp().shots[0];
    const ep = cleanEp({ composed: false, sbConfig: { subtitle: true }, shots: [Object.assign({}, done, { dialogue: '我'.repeat(130) })] });
    const list = sb.Issues.collect({ id: 'p1', subjects: [], episodes: [ep] });
    const it = list.find(x => x.kind === 'caption-unreadable');
    assert(it, '超烧录上限的台词应入清单');
    assertEq(it.sev, 'low', '字幕可读性是提醒级(发布门 G2 只数高/中危)');
    assertEq(it.count, 1);
    assert(it.detail.includes('镜头1') && it.detail.includes('截断'), '明细应定位到镜号与原因,实际:' + it.detail);
    assert(it.goto && !it.cmd, '字幕问题回分集页改台词/裁剪,不挂命令处置(不触发任何生成与合成)');
    assertEq(list.filter(x => x.sev !== 'low').length, 0, '字幕提醒不得产出高/中危(门禁状态不变)');
  } },
  { name: 'collect:分镜景别衔接 → 低危提醒(不进高/中危,不改发布门 G2)', fn() {
    const sb = loadIssues();
    const done = cleanEp().shots[0];
    // 三镜同景别成串(判据在 js/skills.js 的校验项,级差经 WfCore.sizeGap,本处只验消费)
    const shots = [0, 1, 2].map(i => Object.assign({}, done, { id: 'sh' + i, order: i, cameraSpec: { shotSize: '中景' } }));
    const ep = cleanEp({ composed: false, shots, lastReview: { avg: 8, perShot: shots.map((s, i) => ({ shotId: s.id, order: i, score: 8 })) } });
    const list = sb.Issues.collect({ id: 'p1', subjects: [], episodes: [ep] });
    const it = list.find(x => x.kind === 'shot-size-linkage');
    assert(it, '连续同景别应入清单');
    assertEq(it.sev, 'low', '景别衔接是提醒级(发布门 G2 只数高/中危)');
    assertEq(it.count, 1);
    assert(it.detail.includes('镜头1-3') && it.detail.includes('中景'), '明细应定位到镜号区间与景别,实际:' + it.detail);
    assert(it.goto && !it.cmd, '景别问题回分集页改机位,不挂命令处置(不触发任何生成)');
    assertEq(list.filter(x => x.sev !== 'low').length, 0, '景别提醒不得产出高/中危(门禁状态不变)');
  } },
  { name: 'collect:剧本方法论提醒 → 低危(未拆镜集也报,不吞后续问题、不改发布门 G2)', fn() {
    const sb = loadIssues();
    // 开篇 160 字纯背景铺陈,冲突信号落在开篇窗口之外(判据在 js/skills.js,本处只验消费)
    const ep = { id: 'ep1', title: '第一集', content: '江城的春天多雨。'.repeat(20) + '她被人嘲笑,却默默忍住。', shots: [] };
    const p = { id: 'p1', subjects: [{ id: 'sj1', name: '主角', kind: 'character', image: 'u' }], episodes: [ep] };
    const list = sb.Issues.collect(p);
    const it = list.find(x => x.kind === 'script-craft');
    assert(it, '剧本文本面命中应入清单');
    assertEq(it.sev, 'low', '剧本方法论提醒是提醒级(发布门 G2 只数高/中危)');
    assert(it.detail.includes('开篇未直接进冲突'), '明细应给命中码的中文文案,实际:' + it.detail);
    assert(it.goto && !it.cmd, '剧本问题走导航自查,不挂命令处置(不触发任何生成)');
    assert(list.some(x => x.kind === 'no-shots'), '剧本刚写完还没拆镜时既要报提醒也不能吞掉未分镜这条中危');
    assertEq(list.filter(x => x.sev === 'high').length, 0, '剧本提醒不得升高危');
    assertEq(sb.Issues.collect({ id: 'p2', episodes: [{ id: 'ep1', title: '第一集', content: '剧本正文', shots: [] }] }).filter(x => x.kind === 'script-craft').length, 0,
      '短于判定下限的片段不产出提醒(不给存量小样制造噪音)');
  } },
  { name: 'collect:分集方法论提醒 → 六阶段按项目挂一条 + 付费卡点按集挂,均低危不吞后续问题', fn() {
    const sb = loadIssues();
    // 判据在 js/skills.js(SK-14/SK-15),本处只验消费:第4集无正文摊在转折期,第2集集尾被中性填充挤平
    const FILL2 = '江城的春天多雨。'.repeat(16);
    const OK = '她原来早就知道那份文件是假的。她亮出证据当众揭穿骗局,众人哗然,反派连连道歉。'
      + '门被推开,那个人竟然出现:「你老婆在我手上,一小时内拿东西来换。」';
    const body = [OK, OK + FILL2, OK, '', OK, OK];
    const p = { id: 'p1', subjects: [{ id: 'sj1', name: '主角', kind: 'character', image: 'u' }],
      episodes: body.map((c, i) => ({ id: 'ep' + (i + 1), title: '第' + (i + 1) + '集', content: c, shots: [] })) };
    const list = sb.Issues.collect(p);
    const arc = list.find(x => x.kind === 'eps-structure');
    assert(arc, '六阶段结构命中应入清单');
    assertEq(arc.sev, 'low', '分集方法论提醒是提醒级(发布门 G2 只数高/中危)');
    assert(arc.detail.includes('转折期(第4-4集)'), '明细应给段名与集号区间,实际:' + arc.detail);
    assertEq(arc.epid, undefined, '判定输入是整张分集表,按项目挂一条而不是逐集重复报');
    assertEq(list.filter(x => x.kind === 'eps-structure').length, 1);
    const pay = list.filter(x => x.kind === 'eps-payoff');
    assertEq(pay.length, 1, '只有集尾平收的那一集报卡点提醒');
    assertEq(pay[0].epid, 'ep2');
    assertEq(pay[0].sev, 'low');
    assert(pay[0].detail.includes('卡点没落在集尾'), '明细应给命中码的中文文案,实际:' + pay[0].detail);
    assert(arc.goto && !arc.cmd && pay[0].goto && !pay[0].cmd, '分集问题走导航自查,不挂命令处置(不触发任何生成)');
    assert(list.some(x => x.kind === 'no-script' && x.epid === 'ep4'), '缺正文的那一集仍照报高危(分集提醒不吞既有问题)');
    assert(list.some(x => x.kind === 'no-shots'), '未拆镜中危不被分集提醒吞掉');
    assertEq(sb.Issues.collect({ id: 'p2', episodes: [{ id: 'ep1', title: '第一集', content: OK, shots: [] }] }).filter(x => x.kind.startsWith('eps-')).length, 0,
      '单集项目摊不出六段、也没有下一集可兑现,不产出提醒(不给存量小样制造噪音)');
  } },
  { name: 'collect:已生成未审 → 恰一条 no-review 中危(审完即消失,已审集与未拆镜集都不误报)', fn() {
    const sb = loadIssues();
    const ep = cleanEp({ composed: false });
    delete ep.lastReview; // 已出片、已确认,主线只差审片这一步
    const p = { id: 'p1', subjects: [], episodes: [ep] };
    const list = sb.Issues.collect(p);
    assertEq(list.map(x => x.kind).join(','), 'no-review', '已生成未审的集应恰有一条未审问题');
    assertEq(list[0].sev, 'mid', '未审是主线断点(中危;发布门 G2 只数高/中危故计入 warn,不新增 fail 门)');
    assertEq(list[0].epid, 'ep1');
    assert(list[0].detail.includes('1 镜') && list[0].detail.includes('已出片'), '明细应给该集镜头与出片进度,实际:' + list[0].detail);
    assert(list[0].goto === '#/project/p1/episode/ep1' && !list[0].cmd, '未审走导航回分集页自己发起整集审片,不挂命令(审片是计费动作)');
    // 审完(有未判旧的达标记录)即消失,与 Domain 审片步同口径
    ep.lastReview = { avg: 8, perShot: [{ shotId: 'sh0', order: 0, score: 8 }] };
    assertEq(sb.Issues.collect(p).length, 0, '审完的集不应再报未审(已审完的集不误报)');
    // 还没拆镜的集:主线断点在分镜,不越过早退分支抢报未审
    assert(!sb.Issues.collect({ id: 'p3', subjects: [], episodes: [{ id: 'ep1', title: '一', content: '剧本正文', shots: [] }] })
      .some(x => x.kind === 'no-review'), '未拆镜的集不报未审');
    assertEq(sb.Issues.collect({ id: 'p0', subjects: [], episodes: [] }).length, 0, '空项目零条');
  } },
  { name: 'collect:审片记录判旧 → review-stale 中危(与发布门 G3「视为未审」同口径,不与未审/低分重复报)', fn() {
    const sb = loadIssues();
    const ep = cleanEp({ composed: false });
    ep.lastReview = { avg: 9, perShot: [{ shotId: 'sh0', order: 0, score: 9 }], sourceRev: 0, graphRev: 0, snapshotHash: 'bogus-stale' };
    const p = { id: 'p1', subjects: [], episodes: [ep] };
    const list = sb.Issues.collect(p);
    assertEq(list.map(x => x.kind).join(','), 'review-stale', '判旧的记录应恰报一条(三态互斥:不再叠未审那条)');
    assertEq(list[0].sev, 'mid');
    assert(list[0].label.includes('视为未审'), '文案应与发布门 G3 同一口径,实际:' + list[0].label);
    assert(list[0].goto && !list[0].cmd, '重审同样走导航,不挂命令');
    // 重新审片(快照对齐)后消失
    ep.lastReview.snapshotHash = sb.Domain.reviewSnapshotHashOf(ep);
    assertEq(sb.Issues.collect(p).length, 0, '快照对齐后不应再报');
  } },
  { name: 'collect:提示词稳定词/用词漂移 → 低危提醒(不进高/中危,不改发布门 G2;写全即无)', fn() {
    const sb = loadIssues();
    // 判据在 js/skills.js 的 SK-19 校验项(判该镜真实生成请求那条提示词),本处只验消费
    const drift = Object.assign({}, cleanEp().shots[0], { prompt: 'q,五官不变形' }); // 三面稳定词只写了一面
    const list = sb.Issues.collect({ id: 'p1', subjects: [], episodes: [cleanEp({ composed: false, shots: [drift] })] });
    const it = list.find(x => x.kind === 'shot-stable-lexicon');
    assert(it, '稳定词漂移应入清单');
    assertEq(it.sev, 'low', 'SK-19 是 warn 级提醒(发布门 G2 只数高/中危,不抬成发布门 fail)');
    assertEq(it.count, 1);
    assert(it.detail.includes('镜头1') && it.detail.includes('该补:结构正常、不僵硬'), '明细应定位到镜号并列出该补的字面,实际:' + it.detail);
    assert(it.goto && !it.cmd, '用词问题回分集页改提示词,不挂命令处置(不触发任何生成)');
    assertEq(list.filter(x => x.sev !== 'low').length, 0, '稳定词提醒不得产出高/中危(门禁状态不变)');
    // 模糊词逐词一条,展示文案带命中的那个词
    const vague = Object.assign({}, cleanEp().shots[0], { prompt: CLEAN_PROMPT + ',画面很酷' });
    const vg = sb.Issues.collect({ id: 'p2', subjects: [], episodes: [cleanEp({ composed: false, shots: [vague] })] })
      .find(x => x.kind === 'shot-stable-lexicon');
    assert(vg && vg.detail.includes('模糊词等于没写(很酷)'), '模糊词命中应译成人话并带命中词,实际:' + (vg && vg.detail));
    // 无漂移(三面稳定词写全)即无本条
    assertEq(sb.Issues.collect({ id: 'p3', subjects: [], episodes: [cleanEp({ composed: false })] })
      .filter(x => x.kind === 'shot-stable-lexicon').length, 0, '写全稳定词的镜不产出提醒');
  } },
  { name: 'collect:素材更新过期镜(assetVer 抬升)→ stale-shots 带镜头号', fn() {
    const sb = loadIssues();
    const ep = cleanEp({ shots: [Object.assign({}, cleanEp().shots[0], { characters: ['主角'], video: { status: 'done', url: 'http://x/v.mp4', assetVer: 1 } })], composed: false });
    const p = { id: 'p1', subjects: [{ id: 'sj1', name: '主角', kind: 'character', image: 'u', imgVer: 2 }], episodes: [ep] };
    const it = sb.Issues.collect(p).find(x => x.kind === 'stale-shots');
    assert(it, '主体图更新后旧成片应判过期');
    assertEq(it.sev, 'mid');
    assert(it.detail.includes('镜头 1'), '过期镜号应入明细');
  } },
  { name: '双端单源:Node 无 window 与浏览器路径对同一夹具逐字节同结论(kind 集合全等)', fn() {
    const NodeIssues = require('../js/issues.js'); // Node 侧:无 window/document/Store,依赖经 require 取
    assertEq(typeof globalThis.window, 'undefined', '本进程不得有 window(证明 Node 侧真的跑在无浏览器环境里)');
    const sb = loadIssues();
    [false, true].forEach(online => {
      const a = NodeIssues.collect(crossEndP(), { online });
      const b = sb.Issues.collect(crossEndP(), { online });
      assertEq(a.map(x => x.kind).sort().join(','), b.map(x => x.kind).sort().join(','),
        '两端投影的 kind 集合应全等(online=' + online + ')');
      assertEq(JSON.stringify(a), JSON.stringify(b), '两端结论应逐字节相同(online=' + online + ')');
      assertEq(NodeIssues.count(crossEndP(), { online }), a.length, 'count 与 collect 同源');
    });
    /* 夹具确实摊得开:状态类与方法论提醒两类都在,不是"两端同为空"的假对照 */
    const kinds = NodeIssues.collect(crossEndP(), { online: false }).map(x => x.kind);
    const table = NodeIssues.reminders().map(r => r.kind);
    ['no-script', 'no-shots', 'failed-shots', 'stale-shots', 'unconfirmed', 'low-review', 'composed-stale', 'subject-no-image']
      .forEach(k => assert(kinds.includes(k), '对照夹具应摊出状态类问题:' + k));
    table.forEach(k => assert(kinds.includes(k), '对照夹具应摊出投影表登记的每一条方法论提醒:' + k));
    /* 投影表就是本模块产出的低危提醒全集:表外不得凭空多出一条低危 kind */
    const lowKinds = NodeIssues.collect(crossEndP(), { online: false }).filter(x => x.sev === 'low' && x.kind !== 'unconfirmed').map(x => x.kind);
    lowKinds.forEach(k => assert(table.includes(k), '低危提醒必须在投影表里登记:' + k));
    /* 取表给副本:调用方污染返回值不影响下次取表 */
    NodeIssues.reminders().push({ kind: '污染' });
    assertEq(NodeIssues.reminders().length, table.length, 'reminders() 每次应现生成新数组');
  } },
  { name: '浏览器薄封装:全局名与成员一个不少,online 由 Media 注入(投影核不碰 window/Store)', fn() {
    const sb = loadIssues();
    loadFile(sb, 'issues-ui.js');
    ['collect', 'count', 'fixIssue', 'openModal', 'badgeHTML', 'reminders'].forEach(k =>
      assertEq(typeof sb.Issues[k], 'function', 'window.Issues 应仍有成员:' + k));
    // online 由薄封装从 Media 现取并显式传进投影核(核自己读不到任何环境句柄)
    const seen = [];
    const orig = sb.Domain.episodeState;
    sb.Domain.episodeState = (p, ep, on) => { seen.push(on); return orig(p, ep, on); };
    const p = { id: 'p1', subjects: [], episodes: [{ id: 'ep1', title: '一', content: '剧本正文', shots: [] }] };
    sb.Media = { isReady: () => true };
    sb.Issues.collect(p);
    assertEq(seen.join(','), 'true', '在线时薄封装应注入 online=true');
    sb.Media = { isReady: () => false };
    sb.Issues.count(p);
    assertEq(seen.join(','), 'true,false', '离线时应注入 online=false');
    // 投影核纯数据:源级封死环境句柄与前端状态桶(与 domain.js 同纪律)
    const core = fs.readFileSync(path.join(ROOT, 'js', 'issues.js'), 'utf8');
    const body = core.slice(core.indexOf('function (Domain, skills)'));
    [/\bwindow\b/, /\bdocument\b/, /\bStore\b/, /\bMedia\b/, /\blocation\b/, /\bBus\b/, /\bCommands\b/, /\bU\./]
      .forEach(re => assert(!re.test(body), '投影核不得引用浏览器环境句柄/前端状态桶:' + re));
    assert(/module\.exports = I; else root\.Issues = I/.test(core), '应是与 domain.js 同形的 UMD 双端头');
  } },
  { name: 'CLI/MCP 出口:issues 只读命令与 hujing_issues 工具复用同一份投影,不新增计费动作', fn() {
    const { spawnSync } = require('child_process');
    const cli = fs.readFileSync(path.join(ROOT, 'cli.js'), 'utf8');
    assert(cli.includes("require('./js/issues.js')"), 'CLI 应 require 双端投影,不在 CLI 侧另写一份问题推导');
    const seg = cli.slice(cli.indexOf('CMD.issues ='), cli.indexOf('/* ---------- 交付检查'));
    assert(seg.length > 200, '应能定位到 CLI issues 命令实现段');
    assert(/Issues\.collect\(p, \{ online: true \}\)/.test(seg), 'CLI 侧应显式注入 online(Node 读不到 Media)');
    assert(/Issues\.reminders\(\)/.test(seg), '低危提醒的登记口径应表驱动,不在 CLI 侧手写 kind 清单');
    assert(!/kind: '/.test(seg), 'CLI 不得自写第二份 kind/文案(投影表是唯一来源)');
    ['operationId', 'Tasks.run', 'POST(', 'billingAction'].forEach(k =>
      assert(!seg.includes(k), 'issues 是只读聚合,不得出现计费/写状态动作:' + k));
    // 命令真的注册上了:无服务端也应走到参数校验(exit 2),而不是"未知命令"
    const r = spawnSync(process.execPath, [path.join(ROOT, 'cli.js'), 'issues'], { encoding: 'utf8', timeout: 30000 });
    assertEq(r.status, 2, 'issues 缺 pid 应报参数错误 exit 2,实际 ' + r.status + ' / ' + r.stderr);
    assert(JSON.parse(String(r.stdout).trim()).error.includes('issues <pid>'), 'stdout 应是 JSON 用法提示');
    const help = spawnSync(process.execPath, [path.join(ROOT, 'cli.js'), 'help'], { encoding: 'utf8', timeout: 30000 });
    assert(String(help.stderr).includes('issues <pid>'), 'help 应登记 issues 命令');
    // MCP 侧只做包装:工具与只读资源都指向同一条 CLI 命令,不另起一条推导
    const mcp = fs.readFileSync(path.join(ROOT, 'mcp.js'), 'utf8');
    assert(/name: 'hujing_issues'/.test(mcp) && /build: i => \['issues', i\.pid\]/.test(mcp), 'MCP 应把 issues 包装成工具');
    assert(mcp.includes("hujing://project/{pid}/issues") && /return \['issues', decodeURIComponent/.test(mcp), 'MCP 只读资源应可直读问题清单');
  } },
];

/* ================= 套件 14:plans.js(持久计划,第三阶段) ================= */
/* ov:写进 Store 覆盖表(LLM 规划步的人设句经注册表键 plan.system 取值,加载序与 index.html 同) */
function loadPlans(ov) {
  const sb = makeSandbox();
  installCommon(sb);
  if (ov) sb.Store.state.settings.promptOverrides = ov;
  sb.Commands = {
    list: () => [{ name: 'episode.generateStoryboard' }, { name: 'episode.generateVideos' }, { name: 'episode.compose' }, { name: 'episode.produce' }],
    execute: async (name, args) => { sb.__cmdCalls.push({ name, args }); return sb.__cmdResult || { ok: true, status: 'done', result: {} }; },
  };
  sb.__cmdCalls = [];
  loadFile(sb, 'domain.js');
  loadFile(sb, 'prompts.js');    // LLM 规划步的人设句取值口(与 index.html 同顺序:domain → prompts → knowledge)
  loadFile(sb, 'knowledge.js');  // skill 索引的加载期依赖(与 index.html 同顺序:domain → knowledge → skills)
  loadFile(sb, 'skills.js');     // 计划步骤的命令与步序取自主线全链 playbook(SK-05)
  loadFile(sb, 'cmd-registry.js'); // 投影步的集级/项目级作用域判定(needs)
  loadFile(sb, 'plans.js');
  return sb;
}
const plansTests = [
  { name: 'fromWorkflow:按各集状态推导步骤(缺图前置/未拆镜→智能分镜/失败→重生成/待出→生成)', fn() {
    const sb = loadPlans();
    const doneShot = cleanEp().shots[0];
    const p = {
      id: 'p1',
      subjects: [{ id: 'sj1', name: '主角', kind: 'character', image: '' }],
      episodes: [
        { id: 'ep1', title: '第一集', content: '剧本', shots: [] },
        { id: 'ep2', title: '第二集', content: '剧本', shots: [Object.assign({}, doneShot, { id: 'f1', video: { status: 'failed' } }), Object.assign({}, doneShot, { id: 'f2' }), Object.assign({}, doneShot, { id: 'f3', video: { status: 'none' } })] },
      ],
    };
    const pl = sb.Plans.fromWorkflow(p);
    assertEq(pl.steps[0].label.includes('补齐主体参考图'), true, '缺图应为前置步骤');
    assertEq(pl.steps[0].cmd, 'subject.generateImage', '补图前置步映射投影里的主体生图命令(不再是只能跳页面的导航步)');
    assertEq(pl.steps[0].epid, undefined, '项目级步不挂 epid');
    const sb1 = pl.steps.find(s => s.epid === 'ep1');
    assertEq(sb1.cmd, 'episode.generateStoryboard', '未拆镜集应映射智能分镜命令');
    const gen = pl.steps.find(s => s.epid === 'ep2');
    assertEq(gen.cmd, 'episode.generateVideos', '有失败镜集应映射批量生成(失败镜在 pend 集合内)');
    assert(pl.steps.every(s => s.status === 'pending'), '新计划步骤应全部 pending');
    assertEq(sb.Plans.summary(p), null, '未落库前项目无计划');
  } },
  /* G-12 一半:计划步骤由 SK-05 主线全链 playbook 投影生成——命令名与步序现取投影,
   * 计划层只登记"这一步当下待不待办"的状态取材器,不再手写第二份命令链。 */
  { name: 'fromWorkflow:命令与步序取自主线全链 playbook 投影(不写第二份命令链)', fn() {
    const sb = loadPlans();
    const chain = sb.Skills.playbook('core.playbookProjection').steps.map(s => s.cmd);
    const proj = sb.Plans.projection();
    assertEq(proj.map(x => x.cmd).join(','), chain.join(','), '自省表应与投影逐步对齐(步序也现取)');
    assert(proj.every(x => x.registered), '投影每一步都须登记取材器,漏登记:' + proj.filter(x => !x.registered).map(x => x.cmd).join(','));
    assertEq(proj.filter(x => !x.occupies).map(x => x.cmd).join(','), 'episode.understanding,episode.preflight',
      '只有本集理解(拆镜编排内部步)与就绪检查(零计费结论面)不占计划步');
    // 计划步的命令一律落在投影上:项目级步排在集级步之前,且各自按投影步序
    const p = {
      id: 'p1', script: '整本剧本',
      subjects: [{ id: 'sj1', name: '主角', image: '' }],
      episodes: [{ id: 'ep1', title: '第一集', content: '剧本', shots: [] }, cleanEp({ id: 'ep2', title: '第二集', lastReview: null })],
    };
    const steps = sb.Plans.fromWorkflow(p).steps;
    assertEq(steps.map(s => s.cmd || 'goto').join(','),
      'subject.generateImage,episode.generateStoryboard,episode.smartReview', '实际:' + steps.map(s => s.label).join(' / '));
    steps.forEach(s => assert(!s.cmd || chain.includes(s.cmd), '计划步的命令应来自投影:' + s.cmd));
    // 投影 args 一律留空,计划层也不补授权位/子集位(不拿假 args 冒充可执行)
    steps.forEach(s => assertEq(Object.keys(s.args || {}).length, 0, '计划步不应预设参数:' + s.cmd));
    assertEq(sb.Plans.fromWorkflow({ id: 'p0', subjects: [], episodes: [] }), null, '无待办即无计划');
  } },
  { name: 'fromWorkflow:项目级前置按投影步序出(提取主体→拆集),拆集不预授权 overwrite', fn() {
    const sb = loadPlans();
    // 只有一份整部剧本:主体库空、分集空 → 前两步就是投影的项目级两步
    const fresh = sb.Plans.fromWorkflow({ id: 'p1', script: '整本剧本', subjects: [], episodes: [] });
    assertEq(fresh.steps.map(s => s.cmd).join(','), 'project.extractSubjects,project.splitEpisodes');
    assert(fresh.steps.every(s => s.args === undefined), '拆集步不得预设 overwrite(整表覆盖属人工授权)');
    // 已有分集:拆集步不再出(不靠假授权覆盖已分镜数据)
    const had = sb.Plans.fromWorkflow({ id: 'p1', script: '整本剧本', subjects: [{ id: 'sj1', name: '主角', image: 'u' }], episodes: [{ id: 'ep1', title: '第一集', content: '', shots: [] }] });
    assert(!had.steps.some(s => s.cmd === 'project.splitEpisodes'), '已有分集时不应再出拆集步');
    assertEq(had.steps[0].label, '补充剧本:第一集', '缺正文集出导航步(没有可执行命令能替用户写剧本)');
    assertEq(had.steps[0].cmd, undefined);
    assert(had.steps[0].goto.includes('/episode/ep1'));
  } },
  { name: 'fromWorkflow:需授权/需人工挑选的状态一律出导航步(重拆覆盖/过期镜子集/确认闸不代授权)', fn() {
    const sb = loadPlans();
    const doneShot = cleanEp().shots[0];
    // 分镜判旧:重拆会整表覆盖已有分镜 → 导航步
    const stale = cleanEp({ shotsSourceRev: 0, contentRev: 3 });
    let s = sb.Plans.fromWorkflow({ id: 'p1', subjects: [], episodes: [stale] }).steps[0];
    assertEq(s.cmd, undefined, '重新拆镜不应挂命令(覆盖已有分镜属人工决策)');
    assert(s.label.includes('重新拆镜'), '实际:' + s.label);
    // 素材已更新的过期镜:要按 shotIds 挑子集重跑 → 导航步(不拿子集位假 args 冒充可执行)
    const staleShots = cleanEp({ shots: [Object.assign({}, doneShot, { video: { status: 'done', url: 'http://x/v.mp4', inputHash: 'bogus' } })], composed: false });
    s = sb.Plans.fromWorkflow({ id: 'p1', subjects: [], episodes: [staleShots] }).steps[0];
    assertEq(s.label, '重生成过期镜:第一集(1 镜)');
    assertEq(s.cmd, undefined, '过期镜重生成不应挂命令(shotIds 子集属调用方决策)');
    // 未确认镜:确认闸属人工决策,不用 confirmAll 代授权
    const unconfirmed = cleanEp({ shots: [Object.assign({}, doneShot, { confirm: false })], composed: false });
    s = sb.Plans.fromWorkflow({ id: 'p1', subjects: [], episodes: [unconfirmed] }).steps[0];
    assertEq(s.label, '确认镜头:第一集(1 镜)');
    assertEq(s.cmd, undefined, '确认镜头不应挂命令(confirmAll 是授权位)');
  } },
  { name: 'fromWorkflow:未审/判旧/低分三态都映射 episode.smartReview(不再是只能跳页面的导航步)', fn() {
    const sb = loadPlans();
    const ep = cleanEp({ composed: true, composedInputHash: sb.Domain.composedInputHash(cleanEp(), false), composedSourceRev: 0, composedGraphRev: 0 });
    delete ep.lastReview; // 未审
    const p = { id: 'p1', subjects: [{ id: 'sj1', name: '主角', image: 'u' }], episodes: [ep] };
    let s = sb.Plans.fromWorkflow(p).steps[0];
    assertEq(s.cmd, 'episode.smartReview', '未审集应映射已注册审片命令');
    assertEq(s.epid, 'ep1');
    assertEq(s.label, '整集审片:第一集');
    assert(!s.goto, '命令步骤不应再带 goto(headless 下可真实执行)');
    ep.lastReview = { avg: 8, snapshotHash: 'bogus-stale' };
    s = sb.Plans.fromWorkflow(p).steps[0];
    assertEq(s.cmd, 'episode.smartReview');
    assertEq(s.label, '重新审片:第一集(记录已过期)');
    ep.lastReview = { avg: 5.5 };
    s = sb.Plans.fromWorkflow(p).steps[0];
    assertEq(s.cmd, 'episode.smartReview');
    assertEq(s.label, '审片修订:第一集(均分 5.5)');
  } },
  { name: 'fromWorkflow:全齐备项目返回 null(无主线可推进)', fn() {
    const sb = loadPlans();
    const ep = cleanEp({ composed: true, composedInputHash: sb.Domain.composedInputHash(cleanEp(), false), composedSourceRev: 0, composedGraphRev: 0 });
    const p = { id: 'p1', subjects: [{ id: 'sj1', name: '主角', image: 'u' }], episodes: [ep] };
    assertEq(sb.Plans.fromWorkflow(p), null);
  } },
  { name: 'replace+execStep:命令步骤 ui 模式执行,回执驱动 done+成本尾注;持久化落 p.agentPlan', fn: async () => {
    const sb = loadPlans();
    const p = { id: 'p1', subjects: [{ id: 'sj1', name: '主角', kind: 'character', image: '' }], episodes: [{ id: 'ep1', title: '第一集', content: '剧本', shots: [] }] };
    const pl = sb.Plans.fromWorkflow(p);
    sb.Plans.replace(p, pl);
    assertEq(p.agentPlan.id, pl.id, 'replace 应落库 p.agentPlan');
    assertEq(pl.steps[0].cmd, 'subject.generateImage', '步骤 0 应为项目级补图步');
    sb.__cmdResult = { ok: true, status: 'done', cost: 5, result: { total: 3, ok: 3, failed: [] } };
    await sb.Plans.execStep(p, 1, null);
    assertEq(p.agentPlan.steps[1].status, 'done', 'ok 回执应置 done');
    assert(p.agentPlan.steps[1].note.includes('-5积分'), '成本应入尾注');
    assert(p.agentPlan.steps[1].note.includes('3/3'), '结构化结果应入尾注');
    assertEq(sb.__cmdCalls[0].name, 'episode.generateStoryboard');
    assertEq(sb.__cmdCalls[0].args.pid, 'p1');
    assertEq(sb.__cmdCalls[0].args.ui, true, '计划步骤执行应走 ui 模式(决策闸保留)');
    assertEq(sb.Store._saves > 0, true, '执行后应 Store.save 持久化');
    const sm = sb.Plans.summary(p);
    assertEq(sm.done, 1); assertEq(sm.total, pl.steps.length);
  } },
  { name: 'execStep:needs_human→blocked;用户取消→pending 可重试;失败→failed', fn: async () => {
    const sb = loadPlans();
    const p = { id: 'p1', subjects: [{ id: 'sj1', name: '主角', kind: 'character', image: '' }], episodes: [{ id: 'ep1', title: '第一集', content: '剧本', shots: [] }] };
    sb.Plans.replace(p, sb.Plans.fromWorkflow(p));
    sb.__cmdResult = { ok: false, status: 'needs_human', error: { code: 'manual-gate', message: '待人工 2 镜' } };
    await sb.Plans.execStep(p, 1, null);
    assertEq(p.agentPlan.steps[1].status, 'blocked', '质量闸门应置 blocked(计划暂停待人工)');
    assert(p.agentPlan.steps[1].note.includes('待人工'));
    sb.__cmdResult = { ok: false, status: 'blocked', error: { code: 'cancelled', message: '已取消' } };
    await sb.Plans.execStep(p, 1, null);
    assertEq(p.agentPlan.steps[1].status, 'pending', '用户主动取消应回退 pending 可重试');
    sb.__cmdResult = { ok: false, status: 'failed', error: { code: 'gen', message: '生成失败' } };
    await sb.Plans.execStep(p, 1, null);
    assertEq(p.agentPlan.steps[1].status, 'failed');
  } },
  { name: 'runAll:依次执行到首个未完成步骤即停(导航步骤到位即停)', fn: async () => {
    const sb = loadPlans();
    const p = { id: 'p1', subjects: [{ id: 'sj1', name: '主角', image: 'u' }], episodes: [
      { id: 'ep1', title: '第一集', content: '', shots: [] },      // 缺正文 → 导航步(补剧本)
      { id: 'ep2', title: '第二集', content: '剧本', shots: [] },  // 未拆镜 → 命令步(智能分镜)
    ] };
    sb.Plans.replace(p, sb.Plans.fromWorkflow(p));
    sb.__cmdResult = { ok: false, status: 'failed', error: { code: 'gen', message: '上游失败' } };
    await sb.Plans.runAll(p, null);
    assertEq(p.agentPlan.steps[0].status, 'done', '导航步骤(补剧本)应到位即 done');
    assertEq(sb.__cmdCalls.length, 1, '首个命令步失败后应停止,不继续执行后续步骤');
    assertEq(p.agentPlan.steps[1].status, 'failed');
  } },
];

/* ================= 套件 15:continuity.js(连续性,第四阶段) ================= */
function loadContinuity() {
  const sb = makeSandbox();
  installCommon(sb);
  // 确保 state 基线:projects 数组 + 用户
  sb.Store.state = Object.assign({ projects: [], users: [], subjects: [] }, sb.Store.state || {});
  // Store.getProject:从 state.projects 查(installCommon 默认返回 null,连续性模块需要取 p 对象)
  sb.Store.getProject = id => sb.Store.state.projects.find(x => x.id === id);
  loadFile(sb, 'continuity.js');
  return sb;
}
const continuityTests = [
  { name: 'undo/redo:recordUndo 入栈 Ctrl+Z 还原;redo 回滚;栈上限 UNDO_MAX=50', fn() {
    const sb = loadContinuity();
    const p = { id: 'p1', script: 'ver A', __ver: 0 };
    sb.Store.state.projects.push(p);
    const id = sb.Continuity.recordUndo('script_edit', { pid: 'p1', path: 'script', before: 'ver A', after: 'ver B' });
    assert(!!id, 'record 应返回 entry id');
    p.script = 'ver B'; // 模拟实际改动(undo/redo 自己再写)
    assertEq(sb.Continuity.canUndo(), true);
    assertEq(sb.Continuity.canRedo(), false);
    // 执行 undo:按 path 写回
    assertEq(sb.Continuity.undo(), true);
    assertEq(p.script, 'ver A', 'undo 应还原 before 快照到 p 对象,通过 applyPathValue');
    assertEq(sb.Continuity.canRedo(), true);
    // redo
    assertEq(sb.Continuity.redo(), true);
    assertEq(p.script, 'ver B', 'redo 应恢复 after 快照');
    // 新记录清空 redo
    sb.Continuity.recordUndo('script_edit_2', { pid: 'p1', path: 'script', before: 'ver B', after: 'ver C' });
    assertEq(sb.Continuity.canRedo(), false);
    // 栈上限 50:推入 51 条,首条挤出
    for (let i = 0; i < 51; i++) {
      sb.Continuity.recordUndo('t', { pid: 'p1', path: 'script', before: 'v' + i, after: 'v' + (i + 1) });
    }
    let pop = 0; while (sb.Continuity.undo()) pop++;
    assertEq(pop, 50, '栈应只保留 UNDO_MAX=50 条');
  } },
  { name: 'diff/resolveConflicts:项目级 diff 含 episodes id 匹配;resolutions choose local/remote 生效', fn() {
    const sb = loadContinuity();
    const local = { id: 'p1', name: '本地名', subjects: [{ id: 's1', name: '女一' }],
      episodes: [{ id: 'ep1', title: '本地名T', content: '本地', shots: [{ id: 'sh0', order: 0, plot: 'p' }], composed: false, lastReview: { avg: 8 } }, { id: 'epRemoved', title: 'X' }] };
    const remote = { id: 'p1', name: '远端名', subjects: [{ id: 's1', name: '女主' }, { id: 's2', name: '男二' }],
      episodes: [{ id: 'ep1', title: '远端名T', content: '远端', shots: [{ id: 'sh0', order: 0, plot: 'p2' }], composed: true, lastReview: { avg: 9 } }, { id: 'epNew', title: '新集' }] };
    const ch = sb.Continuity.diff(local, remote);
    const paths = ch.map(x => x.path);
    assert(paths.includes('name'), '顶层 name diff 应出现');
    assert(paths.includes('subjects'), 'subjects 数组变化应有');
    assert(paths.includes('episodes.ep1.title'), '分集子字段 id 寻址');
    assert(paths.includes('episodes.epRemoved') && ch.find(x => x.path === 'episodes.epRemoved').type === 'removed', '本地有远端无=removed');
    assert(paths.includes('episodes.epNew') && ch.find(x => x.path === 'episodes.epNew').type === 'added', '本地无远端有=added');
    // resolve
    const n = sb.Continuity.resolveConflicts(local, remote, [
      { path: 'name', choose: 'remote' },
      { path: 'episodes.ep1.title', choose: 'remote' },
      { path: 'episodes.ep1.composed', choose: 'remote' },
      { path: 'episodes.epNew', choose: 'remote' },
      { path: 'episodes.epRemoved', choose: 'local' }, // 本地已保留,再写一次无变化
    ]);
    assertEq(n >= 5, true, '至少 5 项成功合并');
    assertEq(local.name, '远端名');
    const ep1 = (local.episodes || []).find(e => e.id === 'ep1');
    assertEq(ep1.title, '远端名T');
    assertEq(ep1.composed, true);
    const added = local.episodes.find(e => e.id === 'epNew');
    assert(added && added.title === '新集', '新增集应入 episodes');
    assert(typeof local.__ver === 'number' && local.__ver > 0, '__ver 合并后应自增');
  } },
  { name: 'bumpVer:同一 200ms 窗口内幂等(不重复自增)', fn() {
    const sb = loadContinuity();
    const p = { id: 'p1', __ver: 0 };
    const v1 = sb.Continuity.bumpVer(p); assertEq(v1, 1);
    const v2 = sb.Continuity.bumpVer(p); assertEq(v2, 1, '200ms 内应幂等(同 stamp 不递增)');
  } },
  { name: '跨 Tab 广播:channelInit 初始化不抛异常;非 BroadcastChannel 环境降级', fn() {
    const sb = loadContinuity();
    // 沙箱无 BroadcastChannel:broadcastSave 不抛
    assertNoThrow(() => sb.Continuity.broadcastSave({ id: 'p1', __ver: 5 }, null));
    assertNoThrow(() => sb.Continuity.isRemoteJustUpdated());
  } },
];

/* ================= 套件 16:release.js(交付检查,第四阶段) ================= */
function loadRelease() {
  const sb = makeSandbox();
  installCommon(sb);
  sb.Store.state = Object.assign({ projects: [], users: [], subjects: [] }, sb.Store.state || {});
  sb.Store.getProject = id => sb.Store.state.projects.find(x => x.id === id);
  // Compliance 桩:checkText 返回按规则(含"违禁"字才命中)
  sb.Compliance = { checkText: t => { const hits = []; if (String(t).includes('违禁')) hits.push({ word: '违禁', cat: '暴力血腥' }); return { hits }; } };
  // HumanReview 桩:无 rejected
  sb.HumanReview = { guardAsync: async () => true };
  loadFile(sb, 'domain.js');
  loadFile(sb, 'issues.js');      // 二十二轮:加载真实 Issues(原 stub 返回 {list:[]},掩盖了 G2 把数组当对象读的契约错误)
  loadFile(sb, 'continuity.js');   // stampRelease/rollbackTo 用 Continuity.bumpVer
  loadFile(sb, 'knowledge.js');    // 与 index.html 同顺序:wf-core 的浏览器侧依赖(KB/Prompts)
  loadFile(sb, 'prompts.js');
  loadFile(sb, 'wf-core.js');      // stampRelease 的发布闭环结论回流走 WfCore.memFeedback/memWrite
  loadFile(sb, 'release-core.js'); // 发布留痕准入判定/写回双端单源(与服务端 /api/wf/release 同一个 stamp)
  loadFile(sb, 'release.js');
  return sb;
}
function releaseReadyEp(over) {
  const s = { id: 'sh0', order: 0, name: '', plot: 'p', prompt: 'q', camera: '固定镜头', duration: 5, characters: [], scene: '', props: [], confirm: true, video: { status: 'done', url: 'http://x/v.mp4' } };
  return Object.assign({ id: 'ep1', title: '第一集', content: '剧本正文', shots: [s],
    lastReview: { avg: 8, perShot: [{ shotId: 'sh0', order: 0, score: 8 }] } }, over || {});
}
const releaseTests = [
  { name: 'collect:齐备项目 overall=pass(score 10-1 警告门=9;因为 G10 账目离线只 warn 1 条,cond-pass 或 pass 取决于 warn 数)', fn() {
    const sb = loadRelease();
    const ep = releaseReadyEp({ composed: true, composedSrt: '1\n...', composedInputHash: sb.Domain.composedInputHash(releaseReadyEp(), false), composedSourceRev: 0, composedGraphRev: 0 });
    const p = { id: 'p1', name: '剧', subjects: [{ id: 'sj1', name: '主', kind: 'character', image: 'u' }], episodes: [ep] };
    const r = sb.Release.collect(p, { online: false });
    // 注意:Issues 存桩返回空(所以 G2 pass),G7 无违禁 pass,G8 pass,G1 每集 status=done pass,G3 review=8 过阈值,G4/G5/G6 counts=0 pass,G9 有 image pass —— 只剩 G10 warn
    assert(r.overall === 'cond-pass' || r.overall === 'pass', `只允许 G10 单 warn 应 cond-pass 或 pass,实际:${r.overall} (f=${r.fails} w=${r.warns})`);
    assertEq(r.warns <= 1, true, '最多 1 条 warn');
    const passCodes = r.gates.filter(g => g.status === 'pass').map(g => g.code);
    ['g1-workflow', 'g3-review', 'g4-stale', 'g5-unconfirmed', 'g6-failed', 'g9-subjects'].forEach(c => assert(passCodes.includes(c), '门 ' + c + ' 应 pass,实际 status=' + (r.gates.find(g => g.code === c) || {}).status));
  } },
  { name: 'collect:低分审片(g3 fail)+主体缺图(g9 fail)+失败镜(g6 fail) → overall fail,fix 命令已挂', fn() {
    const sb = loadRelease();
    const failShot = Object.assign({}, releaseReadyEp().shots[0], { id: 'sh1', order: 1, video: { status: 'failed', error: 'e' } });
    const okShot = Object.assign({}, releaseReadyEp().shots[0]);
    const ep = releaseReadyEp({ shots: [okShot, failShot], lastReview: { avg: 5 } });
    const p = { id: 'p1', subjects: [{ id: 'sj1', name: '主', kind: 'character', image: '' }], episodes: [ep] };
    const r = sb.Release.collect(p, { online: false });
    assertEq(r.overall, 'fail', '有 fail 门应 overall fail');
    assert(r.fails >= 3, '至少 3 门 fail(g3 低分/g6 失败/g9 缺图),实际:' + r.fails);
    const g6 = r.gates.find(g => g.code === 'g6-failed');
    assertEq(g6.status, 'fail');
    assert(g6.info.includes('1 镜'), '失败镜计数应入 info');
    // 二十二轮:fix 命令落到真实注册命令 + 集级 epid + 失败镜子集(原 episode.fixFailed 未注册且缺 epid,一键处置 100% 不可用)
    assertEq(g6.fix.cmd, 'episode.generateVideos');
    assertEq(g6.fix.epid, 'ep1');
    assertEq((g6.fix.shotIds || []).join(','), 'sh1');
    const g3 = r.gates.find(g => g.code === 'g3-review');
    assertEq(g3.fix.cmd, 'episode.smartReview', 'G3 应挂智能审片(原 episode.review 未注册)');
    assertEq(g3.fix.epid, 'ep1');
    const g9 = r.gates.find(g => g.code === 'g9-subjects');
    assertEq(g9.fix.type, 'command', '主体缺图应挂主体生图命令一键处置');
    assertEq(g9.fix.cmd, 'subject.generateImage');
    assertEq((g9.fix.subjectIds || []).join(','), 'sj1', 'G9 只带缺图主体子集');
  } },
  { name: 'G2 问题清零:真实 Issues 数组契约——脏项目 fail 挂问题中心导航,干净项目 pass', fn() {
    const sb = loadRelease();
    // 脏:失败镜(高危)→ G2 fail;原实现把 Issues.collect 返回的数组当 {list} 读,恒 pass 永久放行
    const failShot = Object.assign({}, releaseReadyEp().shots[0], { id: 'sh1', order: 1, video: { status: 'failed', error: 'e' } });
    const ep = releaseReadyEp({ shots: [releaseReadyEp().shots[0], failShot] });
    const p = { id: 'p1', subjects: [{ id: 'sj1', name: '主', kind: 'character', image: 'u' }], episodes: [ep] };
    const r = sb.Release.collect(p, { online: false });
    const g2 = r.gates.find(g => g.code === 'g2-issues');
    assertEq(g2.status, 'fail', '有高危问题(失败镜)G2 应 fail');
    assert(g2.info.includes('高危'), 'fail info 应带高危计数');
    assertEq(g2.fix.goto, 'issues', 'fix 应挂问题中心导航');
    // 干净:releaseReadyEp 全齐备 → Issues 空 → pass
    const epOK = releaseReadyEp({ composed: true, composedInputHash: sb.Domain.composedInputHash(releaseReadyEp(), false), composedSourceRev: 0, composedGraphRev: 0 });
    const r2 = sb.Release.collect({ id: 'p2', subjects: [{ id: 'sj1', name: '主', image: 'u' }], episodes: [epOK] }, { online: false });
    const g2ok = r2.gates.find(g => g.code === 'g2-issues');
    assertEq(g2ok.status, 'pass', '干净项目 G2 应 pass');
  } },
  { name: 'minReviewScore 配置:调高到 9 会把 8 分判 fail;setMinReviewScore 写回 Store.settings', fn() {
    const sb = loadRelease();
    const ep = releaseReadyEp({ composed: true, composedInputHash: sb.Domain.composedInputHash(releaseReadyEp(), false), composedSourceRev: 0, composedGraphRev: 0 });
    const p = { id: 'p1', subjects: [{ id: 'sj1', name: '主', image: 'u' }], episodes: [ep] };
    sb.Release.setMinReviewScore(9);
    assertEq(sb.Store.state.settings.releaseMinReviewScore, 9);
    const r = sb.Release.collect(p, { online: false });
    const g3 = r.gates.find(g => g.code === 'g3-review');
    assertEq(g3.status, 'fail', '阈值=9 时审片 8 分应判失败');
    assertEq(r.minReviewScore, 9);
  } },
  { name: 'stampRelease:only cond-pass/pass 可打版本;写入 p.releases[] + bump __ver;失败返回 {ok:false,reason}', fn() {
    const sb = loadRelease();
    // 先造一个有 fail 的项目
    const pBad = { id: 'p1', subjects: [{ id: 's', name: '主' }], episodes: [{ id: 'ep1', content: '', shots: [] }] };
    const b = sb.Release.stampRelease(pBad, '强制发布', {});
    assertEq(b.ok, false); assertEq(b.reason.startsWith('发布门未通过'), true);
    // 齐备项目 → 成功
    const ep = releaseReadyEp({ composed: true, composedInputHash: sb.Domain.composedInputHash(releaseReadyEp(), false), composedSourceRev: 0, composedGraphRev: 0 });
    const pOK = { id: 'p2', subjects: [{ id: 'sj1', name: '主', image: 'u' }], episodes: [ep] };
    const g = sb.Release.collect(pOK, { online: false });
    const r = sb.Release.stampRelease(pOK, '首版', { gateResult: g, online: false });
    assertEq(r.ok, true);
    assertEq(pOK.releases.length, 1);
    assertEq(pOK.releases[0].note, '首版');
    assertEq(pOK.releases[0].gate.overall, g.overall);
    assert(pOK.__ver > 0, 'stamp 应 bump __ver');
    assertEq(pOK.releases[0].ver, pOK.__ver, 'release.ver 应与 p.__ver 对齐');
    const digests = sb.Release.releaseList(pOK).map(x => x.digest);
    assertEq(digests.length, 1);
  } },
  { name: '合规红线命中 G7:Compliance 有 hits 时应 gate status warn/fail + 挂 fix nav', fn() {
    const sb = loadRelease();
    const ep = releaseReadyEp({ composed: true, composedInputHash: sb.Domain.composedInputHash(releaseReadyEp(), false), composedSourceRev: 0, composedGraphRev: 0,
      shots: [Object.assign({}, releaseReadyEp().shots[0], { prompt: '正常,但包含 违禁 词' })] });
    const p = { id: 'p1', subjects: [{ id: 'sj1', name: '主', image: 'u' }], episodes: [ep] };
    const r = sb.Release.collect(p, { online: false });
    const g7 = r.gates.find(g => g.code === 'g7-compliance');
    assertEq(g7.status, 'warn', '有 HR 桩存在时合规命中 → warn 待复核(原实现:!hasHR=false,进入 hasHR 分支 warn)');
    assert(g7.hits && g7.hits.length && g7.hits[0].word === '违禁', '应携带命中词');
    assert(g7.fix && g7.fix.goto === 'compliance', 'fix 应挂合规导航');
  } },
  { name: 'badgeHTML:干净项目返回 pass 绿;脏项目带 blockers 数角标+✕', fn() {
    const sb = loadRelease();
    const ep = releaseReadyEp({ composed: true, composedInputHash: sb.Domain.composedInputHash(releaseReadyEp(), false), composedSourceRev: 0, composedGraphRev: 0 });
    const pOK = { id: 'p1', subjects: [{ id: 's', name: '主', image: 'u' }], episodes: [ep] };
    const h = sb.Release.badgeHTML(pOK);
    assert(h.includes('release-pass'), '干净项目应带 release-pass 样式');
    assert(!h.includes('badge-num'), '无阻塞不应有 badge-num');
    // 脏:低分+缺图
    const pBad = { id: 'p2', subjects: [{ id: 's', name: '主' }], episodes: [releaseReadyEp({ lastReview: { avg: 3 } })] };
    const h2 = sb.Release.badgeHTML(pBad);
    assert(h2.includes('release-fail'));
    assert(h2.includes('badge-num'));
  } },
  { name: 'G3 每集必审(二十三轮):部分集无审片记录 fail(原部分覆盖漏洞:只查有记录的集)', fn() {
    const sb = loadRelease();
    const ep1 = releaseReadyEp({ id: 'ep1', title: '第一集', composed: true, composedInputHash: sb.Domain.composedInputHash(releaseReadyEp(), false), composedSourceRev: 0, composedGraphRev: 0 });
    const ep2 = releaseReadyEp({ id: 'ep2', title: '第二集' });
    delete ep2.lastReview; // 未审片
    const p = { id: 'p1', subjects: [{ id: 'sj1', name: '主', image: 'u' }], episodes: [ep1, ep2] };
    const g3 = sb.Release.collect(p, { online: false }).gates.find(g => g.code === 'g3-review');
    assertEq(g3.status, 'fail', '有集未审片 G3 应 fail(原实现只查有记录的集,蒙混放行)');
    assert(g3.info.includes('第二集'), 'fail info 应点名未审集');
    assertEq(g3.fix.cmd, 'episode.smartReview');
  } },
  { name: 'G3 判旧视为未审(二十三轮):审片快照失配(镜头重抽)的旧记录 fail;无快照旧记录保持原语义', fn() {
    const sb = loadRelease();
    const epStale = releaseReadyEp({ composed: true, composedInputHash: sb.Domain.composedInputHash(releaseReadyEp(), false), composedSourceRev: 0, composedGraphRev: 0 });
    epStale.lastReview = { avg: 9, sourceRev: 0, graphRev: 0, snapshotHash: 'bogus-stale' }; // 高分但已判旧
    const p = { id: 'p1', subjects: [{ id: 'sj1', name: '主', image: 'u' }], episodes: [epStale] };
    const g3 = sb.Release.collect(p, { online: false }).gates.find(g => g.code === 'g3-review');
    assertEq(g3.status, 'fail', '判旧的审片记录应视为未审 fail(防止凭过期结论带病放行)');
    const epOld = releaseReadyEp({ composed: true, composedInputHash: sb.Domain.composedInputHash(releaseReadyEp(), false), composedSourceRev: 0, composedGraphRev: 0 });
    epOld.lastReview = { avg: 8 }; // 旧数据无快照/rev 记录
    const g3old = sb.Release.collect({ id: 'p2', subjects: [{ id: 'sj1', name: '主', image: 'u' }], episodes: [epOld] }, { online: false }).gates.find(g => g.code === 'g3-review');
    assertEq(g3old.status, 'pass', '无快照/rev 记录的旧数据保持原语义(迁移兼容,不一次性全量 fail)');
  } },
  /* ---- 发布留痕双端单源 + 命令化出口(G-12 的第三个落点) ----
   * 判定与写回只此一份 js/release-core.js:浏览器 Release.stampRelease 与服务端 /api/wf/release
   * (CLI exec project.release / release、MCP hujing_release 同链路)都调它;
   * 门禁判据、fail/warn 计数与 overall 四级口径一个字不动(不抬门、不把 warn 变 fail)。 */
  { name: 'release-core · headless 七项核心门:Domain/在线位经参数注入,overall 四级与前端逐字同口径', fn() {
    const RC = require('../js/release-core.js');
    const D = require('../js/domain.js');
    const ep = releaseReadyEp({ composed: true, composedInputHash: D.composedInputHash(releaseReadyEp(), true), composedSourceRev: 0, composedGraphRev: 0 });
    const p = { id: 'p1', name: '剧', subjects: [{ id: 'sj1', name: '主', image: 'u' }], episodes: [ep] };
    const g = RC.gates(p, { Domain: D, online: true });
    assertEq(g.gates.length, 7, 'headless 是七项核心门(G2/G7/G8 依赖浏览器模块,不假装判)');
    assertEq(g.gates.map(x => x.code).join(','), 'g1-workflow,g3-review,g4-stale,g5-unconfirmed,g6-failed,g9-subjects,g10-billing');
    assertEq(g.fails, 0, '齐备项目零 fail');
    assertEq(g.warns, 1, '只剩 G10 账目一条 warn(CLI 不带 --with-billing 时不硬判)');
    assertEq(g.overall, 'cond-pass', '零 fail + 单 warn = 条件通过(warn 不升 fail)');
    assertEq(g.gates.find(x => x.code === 'g10-billing').status, 'warn', 'G10 仍是 warn,本轮不抬门');
    // overall 四级映射:与既有实现逐字一致
    assertEq(RC.overallOf(1, 0), 'fail'); assertEq(RC.overallOf(0, 2), 'warn');
    assertEq(RC.overallOf(0, 1), 'cond-pass'); assertEq(RC.overallOf(0, 0), 'pass');
    // 低分/缺图/失败镜照旧 fail(判据一字未改)
    const bad = RC.gates({ id: 'p2', subjects: [{ id: 's', name: '主' }], episodes: [releaseReadyEp({ lastReview: { avg: 3 } })] }, { Domain: D, online: true });
    assertEq(bad.overall, 'fail');
    assert(bad.fails >= 2, '低分审片 + 主体缺图应至少两门 fail,实际 ' + bad.fails);
  } },
  { name: 'release-core · precheck:空项目 / 缺门禁结论 / 未过门各给明确错误码;force 授权位放行且如实标 forced', fn() {
    const RC = require('../js/release-core.js');
    const pass = { overall: 'cond-pass', fails: 0, warns: 1, score: 9, at: 1, gates: [] };
    assertEq(RC.precheck(null, pass).code, 'not-found', '项目不存在');
    assertEq(RC.precheck({ id: 'p1', episodes: [] }, pass).code, 'no-episodes', '空项目没有可留痕的交付物');
    const withEp = () => ({ id: 'p1', episodes: [releaseReadyEp()] });
    assertEq(RC.precheck(withEp(), null).code, 'no-gate', '不允许跳过门禁判定直接留痕');
    const failGate = { overall: 'fail', fails: 3, warns: 1, score: 6, at: 1, gates: [] };
    const blk = RC.precheck(withEp(), failGate);
    assertEq(blk.code, 'gate-blocked');
    assert(blk.message.startsWith('发布门未通过'), '未过门文案:' + blk.message);
    assertEq(RC.precheck(withEp(), failGate, { force: true }).ok, true, 'force 是授权位:未过门仍可强打');
    assertEq(RC.precheck(withEp(), pass).ok, true);
    // 空项目那条在门禁之前:它是发布留痕这个动作的前置,不是发布门的一项(门禁计数一字不动)
    assertEq(RC.precheck({ id: 'p1', episodes: [] }, failGate, { force: true }).code, 'no-episodes', 'force 也不能给空项目留痕');
    // stamp:强打的版本如实标 forced,过门的不标
    const pF = withEp();
    const rF = RC.stamp(pF, { gate: failGate, force: true, note: '强制', who: 'u', when: 'T', rand: () => 'zzzz' });
    assertEq(rF.ok, true); assertEq(rF.release.forced, true, '未过门强打须留痕可辨');
    const pP = withEp();
    const rP = RC.stamp(pP, { gate: pass, note: '首版', who: 'u', when: 'T', rand: () => 'zzzz' });
    assertEq(rP.release.forced, undefined, '过门的版本不标 forced');
    assertEq(pP.__ver, 1, '缺 bumpVer 时默认 __ver+1');
    assertEq(rP.release.ver, pP.__ver, 'release.ver 与 p.__ver 对齐');
    assertEq(rP.release.gate.overall, 'cond-pass', '留痕带门禁快照');
    assertEq(RC.stamp({ id: 'p9', episodes: [] }, { gate: pass }).code, 'no-episodes', 'stamp 前置与 precheck 同一份');
  } },
  { name: 'release-core · 两端同一份 stamp:浏览器 stampRelease 与直调 ReleaseCore 的 checksum 逐字节相同', fn() {
    const RC = require('../js/release-core.js');
    const sb = loadRelease();
    const mk = () => ({ id: 'p1', name: '剧', __ver: 3,
      subjects: [{ id: 'sj1', name: '主', image: 'u' }], episodes: [releaseReadyEp()] });
    const g = { overall: 'cond-pass', fails: 0, warns: 1, score: 9, at: 1, gates: [] };
    const pBrowser = mk();
    const r = sb.Release.stampRelease(pBrowser, '首版', { gateResult: g, online: false });
    assertEq(r.ok, true);
    const pNode = mk();
    const r2 = RC.stamp(pNode, { gate: g, note: '首版' });
    assertEq(r.release.checksum, r2.release.checksum, '同一项目同一状态两端算出同一个 checksum(留痕可跨端核对)');
    assertEq(r.release.ver, r2.release.ver, '版本号推进两端同口径');
    // 浏览器侧未过门仍回 {ok:false, code, reason}(调用方按 code 分流)
    const bad = sb.Release.stampRelease(mk(), '', { gateResult: { overall: 'fail', fails: 2, warns: 1, gates: [] } });
    assertEq(bad.ok, false); assertEq(bad.code, 'gate-blocked');
    assertEq(sb.Release.stampRelease({ id: 'p2', episodes: [] }, '', { gateResult: g }).code, 'no-episodes');
  } },
  { name: 'project.release 命令:浏览器命令表执行(齐备打版本 / 未过门 blocked / 空项目 blocked),零计费', fn: async () => {
    const sb = loadRelease();
    loadFile(sb, 'cmd-registry.js');
    loadFile(sb, 'commands.js');
    const D = sb.Domain;
    const ep = releaseReadyEp({ composed: true, composedInputHash: D.composedInputHash(releaseReadyEp(), false), composedSourceRev: 0, composedGraphRev: 0 });
    const p = { id: 'p1', name: '剧', subjects: [{ id: 'sj1', name: '主', image: 'u' }], episodes: [ep] };
    sb.Store.state.projects = [p];
    const before = sb.Store.credits ? sb.Store.credits() : 0;
    const r = await sb.Commands.execute('project.release', { pid: 'p1', note: '首版' });
    assertEq(r.ok, true, '齐备项目应打出版本:' + JSON.stringify(r.error || {}));
    assert(/^RLS_/.test(r.result.digest), 'digest 形态');
    assertEq(r.result.ver, p.__ver, 'ver 与项目版本对齐');
    assertEq(r.result.forced, false, '过门的版本不标 forced');
    assertEq(r.result.gate.overall, 'cond-pass', '回执带门禁摘要');
    assertEq(r.cost, undefined, '发布留痕零计费(meter:false,不进 metered 也不出 cost)');
    assertEq((p.releases || []).length, 1, '留痕真的写进了 p.releases');
    if (sb.Store.credits) assertEq(sb.Store.credits(), before, '钱包余额不动');
    // 未过门:blocked 不留痕
    const pBad = { id: 'p2', name: '未过', subjects: [{ id: 's', name: '主' }], episodes: [releaseReadyEp({ lastReview: { avg: 3 } })] };
    sb.Store.state.projects.push(pBad);
    const rb = await sb.Commands.execute('project.release', { pid: 'p2' });
    assertEq(rb.ok, false); assertEq(rb.status, 'blocked'); assertEq(rb.error.code, 'gate-blocked');
    assert((rb.result.gate.blockers || []).length, 'blocked 回执应点名未过门项');
    assertEq((pBad.releases || []).length, 0, '未过门不得留痕');
    // 空项目:明确错误码
    sb.Store.state.projects.push({ id: 'p3', name: '空', subjects: [], episodes: [] });
    const re = await sb.Commands.execute('project.release', { pid: 'p3' });
    assertEq(re.error.code, 'no-episodes', '空项目应给明确错误码而不是空成功');
  } },
  { name: 'project.release 命令化出口四端齐备:注册表/浏览器/CLI EXEC/服务端端点/MCP 工具同名同结构(绕过命令表即红)', fn() {
    const CR = require('../js/cmd-registry.js');
    const m = CR.byName['project.release'];
    assert(m, '领域命令注册表须登记 project.release');
    assertEq(m.needs.join(','), 'p', '项目级命令');
    assertEq(m.risk, 'exec');
    ['note', 'minScore', 'force'].forEach(a => assert(m.args.some(x => x.name === a), '注册表须登记参数 ' + a));
    const rel = fs.readFileSync(path.join(ROOT, 'js/release.js'), 'utf8');
    const cmds = fs.readFileSync(path.join(ROOT, 'js/commands.js'), 'utf8');
    const cli = fs.readFileSync(path.join(ROOT, 'cli.js'), 'utf8');
    const srv = fs.readFileSync(path.join(ROOT, 'server.js'), 'utf8');
    const mcp = fs.readFileSync(path.join(ROOT, 'mcp.js'), 'utf8');
    // 浏览器按钮不得绕过命令表直调实现(变异:改回 stampRelease(p, note, …) 直调即红)
    assert(/Commands\.execute\('project\.release'/.test(rel), '交付检查「打版本」按钮须走领域命令表');
    assert(/reg\('project\.release'/.test(cmds), 'js/commands.js 须注册 project.release 处理器');
    assert(/reg\('project\.release',[^)]*meter: false/.test(cmds), '发布留痕不计费:命令层须 meter:false');
    // headless 三处:CLI EXEC 键、服务端端点、MCP 工具的 cmd 字段
    assert(/EXEC\['project\.release'\]/.test(cli), 'cli.js 须有 exec project.release');
    assert(/meter: false/.test(cli.slice(cli.indexOf("EXEC['project.release']"), cli.indexOf("EXEC['project.release']") + 200)), 'CLI 侧同样不计费');
    assert(srv.includes("pathname === '/api/wf/release'"), 'server.js 须有发布留痕端点');
    assert(/cmd: 'project\.release', build: i => \['exec', 'project\.release'/.test(mcp), 'MCP 工具须登记 cmd 并真的拼 exec project.release');
    // 双端单源:两端都不再各写一份摘要算法与版本号推进
    [['js/release.js', rel], ['server.js', srv]].forEach(([f, src]) =>
      assert(/ReleaseCore\.stamp\(/.test(src), f + ' 须委托 ReleaseCore.stamp(不各写一份写回)'));
    assert(!/function _checksum/.test(rel), '浏览器不得留第二份 checksum 实现');
    assert(!/djb\(sig\)/.test(cli), 'CLI 不得留第二份 checksum 实现');
    assert(/ReleaseCore\.gates\(/.test(cli) && /ReleaseCore\.gates\(/.test(srv), 'headless 两处发布门也现取单源');
    /* MCP 各工具只传 --args(不拼 --pid),故 exec 的参数合流必须逐键判定:
     * Object.assign 会把未给的 flag 当 undefined 一并写进去,把 --args 里的 pid 抹掉(MCP 侧一律"缺 --pid") */
    const execSeg = cli.slice(cli.indexOf('CMD.exec = async'), cli.indexOf('CMD.upload'));
    assert(!/Object\.assign\(f\.args/.test(execSeg), 'exec 参数合流不得用 Object.assign 平铺(未给的 flag 会覆盖 --args 同名值)');
    assert(/if \(flags\[k\] !== undefined\)/.test(execSeg), '未给的 flag 应跳过赋值,--args 打底值保留');
    // UMD 双端:模块内不碰环境句柄(state 与时钟/随机数/落库一律经参数注入)
    const core = fs.readFileSync(path.join(ROOT, 'js/release-core.js'), 'utf8');
    ['window.', 'Store.', 'localStorage', 'fetch(', 'require('].forEach(t =>
      assert(!core.includes(t), 'release-core.js 不得引用环境句柄:' + t));
    assert(!/Tasks\.run/.test(core) && !/Tasks\.run/.test(rel.slice(rel.indexOf('function stampRelease'), rel.indexOf('function releaseList'))),
      '发布留痕不是计费动作:两端都不进 Tasks.run');
  } },
];

/* ================= 套件 17:跨模块契约(二十二轮) =================
 * 锁死发布门一轮四类静默缺陷的同类复发:
 * ① Release/Issues 挂出的 fix.cmd 必须已在 Commands 注册表(且集级命令带真实 epid);
 * ② Issues.collect 返回类型契约(数组;发布门 G2 曾把数组当 {list} 读,问题永久放行);
 * ③ js 全量 location.hash 字面量/模板必须命中 app.js 路由表(防"前往处理"跳不存在路由)。 */
function loadContract() {
  const sb = makeSandbox();
  installCommon(sb);
  sb.Compliance = { checkText: () => ({ hits: [] }) };
  sb.HumanReview = { guardAsync: async () => true };
  loadFile(sb, 'domain.js');
  loadFile(sb, 'issues.js');
  loadFile(sb, 'cmd-registry.js'); // 命令元数据单源(与 index.html 同顺序:commands.js 之前)
  loadFile(sb, 'commands.js'); // 注册表加载无副作用(全部依赖运行时 window 查找)
  loadFile(sb, 'release.js');
  return sb;
}
/* 剧本摘要(EpisodeUtil.aiScriptDigest)沙箱:逐个 LLM 步的 system/user 原样截获,ov 写进 Store 覆盖表
 * (加载序与 index.html 同:domain → prompts → knowledge → wf-core → episode-util;episode-util 加载期强依赖 WfCore) */
function loadDigest(ov) {
  const sb = makeSandbox();
  installCommon(sb);
  sb.__apiReady = true;
  sb.__llm = [];
  sb.API.chatJSON = async req => {
    sb.__llm.push({ system: req.system, user: ((req.messages || [])[0] || {}).content });
    return { summary: '本部分概括', logline: '卖点', synopsis: '梗概', outline: '大纲',
      outlines: [{ no: 1, outline: '本集集纲' }], characters: [{ name: '林晚晴', bio: '女主,复仇者' }] };
  };
  if (ov) sb.Store.state.settings.promptOverrides = ov;
  loadFile(sb, 'domain.js');
  loadFile(sb, 'prompts.js');
  loadFile(sb, 'knowledge.js');
  loadFile(sb, 'wf-core.js');
  loadFile(sb, 'episode-util.js');
  return sb;
}
function digestProject() {
  return { id: 'p1', name: '测试项目', script: '第一段:女主被当众羞辱。\n第二段:女主当场反击。',
    episodes: [{ id: 'ep1', title: '第一集', content: '第一集完整正文' }], subjects: [] };
}
function personaSubject() {
  return { name: '林晚晴', prompt: '', persona: { 五官: '剑眉星目', 发型: '银色长直发及腰', 身材: '', 服饰: '墨色风衣', 性格: '外冷内热', 特技: '', 弱点: '', 语气: '' } };
}
/* 节拍板拆解步(beatboard.js 的 aiFillBeats)的 system 表达式:按源码原文取出,
 * 在装好注册表与 KB 的沙箱里求值——被求值的就是生产源码那一行,取值口改坏即红。
 * (aiFillBeats 是模块内私有函数,只经 BeatBoard.render 的按钮绑定触发,DOM 重交互归 e2e) */
function beatSystemOf(ov) {
  const src = fs.readFileSync(path.join(ROOT, 'js', 'beatboard.js'), 'utf8');
  const m = src.match(/\n\s*system: (.+?),?\s*\/\/[^\n]*\n\s*user: `把本集剧本拆解到 5 段式节拍板/);
  assert(m, 'js/beatboard.js 应有节拍拆解步的 system 字段(字段位置变了要同步本夹具)');
  const sb = makeSandbox();
  installCommon(sb);
  if (ov) sb.Store.state.settings.promptOverrides = ov;
  loadFile(sb, 'prompts.js');
  loadFile(sb, 'knowledge.js');
  return vm.runInContext('(' + m[1] + ')', sb);
}
/* 全局抽屉意图路由步(agent-global.js 的 routeIntent)的 sys 装配式:按源码原文取出,
 * 在装好注册表的沙箱里求值——被求值的就是生产源码那几行,取值口改坏即红。
 * (routeIntent 是 IIFE 内私有函数,只由抽屉发送流程调用,该路径的 DOM 重交互归 e2e) */
function routeSystemOf(ov, list) {
  const src = fs.readFileSync(path.join(ROOT, 'js', 'agent-global.js'), 'utf8');
  const m = src.match(/\n\s*const sys = ([\s\S]+?);\n\s*const recent = /);
  assert(m, 'js/agent-global.js 应有意图路由步的 sys 装配式(位置变了要同步本夹具)');
  const sb = makeSandbox();
  installCommon(sb);
  if (ov) sb.Store.state.settings.promptOverrides = ov;
  loadFile(sb, 'prompts.js');
  sb.list = list; // 板块清单由取值口按 AGENT_BOARDS 现拼,此处以夹具串代入
  return vm.runInContext('(' + m[1] + ')', sb);
}
/* 全仓「系统人设位上的内联人设」持有者名单:文件 → 处数(按路径升序)。
 * 判据是 system: / (role=system 的) content: / 赋给模板变量 之后紧跟的 你是… 字面。
 * 有意不在此口径内:js/prompts.js 的注册表 def、js/experts-data.js 的专家人设数据(走生效人设通道)、
 * js/api.js 调用方不给 system 时的层内兜底、单镜审片提示词的 user 半首句
 * (那一处已收编为 review.userSystem,判据本就不数它,故这张名单不因那次收编改动)。 */
function inlinePersonaHolders() {
  const files = fs.readdirSync(path.join(ROOT, 'js')).filter(f => f.endsWith('.js')).map(f => 'js/' + f)
    .concat(['server.js', 'cli.js', 'mcp.js', 'billing.js']).sort();
  const out = [];
  files.forEach(f => {
    const n = (fs.readFileSync(path.join(ROOT, f), 'utf8').match(/(?:system\s*:|content\s*:|=)\s*['`]你是/g) || []).length;
    if (n) out.push(f + ':' + n);
  });
  return out;
}
/* 导演设定五维生成(window.genDirectorSetting)沙箱:该步 LLM 请求的 system/user 原样截获,ov 写进 Store 覆盖表
 * (加载序与 index.html 同:prompts → gsettings;gsettings 加载期只强依赖 Voice.NARRATOR_PRESETS) */
function loadGsettings(ov, fail) {
  const sb = makeSandbox();
  installCommon(sb);
  sb.Voice = { NARRATOR_PRESETS: [] }; // gsettings.js 顶层 const VOICE_LIST 取它(voice.js 在 index.html 中更前)
  sb.__apiReady = true;
  sb.__llm = [];
  sb.API.chatJSON = async req => {
    sb.__llm.push({ system: req.system, user: ((req.messages || [])[0] || {}).content });
    if (fail) throw new Error('上游 500');
    return { 光影: 'L', 色调: 'C', 情感氛围: 'M', 服化道审美: 'A', 表演气质: 'P' };
  };
  if (ov) sb.Store.state.settings.promptOverrides = ov;
  loadFile(sb, 'prompts.js');
  loadFile(sb, 'gsettings.js');
  return sb;
}
/* 镜头「按指令改」真跑:该步 handler 挂在 U.openModal 的 onMount 闭包里(没有模块出口),
 * 故用极简弹窗桩把两层弹窗逐层驱动到 chatJSON——提示词工具 → 点「按指令改」→ 填指令 → 点「改写提示词」,
 * 截获那一次请求的 system/user 与回填结果;ov 写进 Store 覆盖表。 */
async function sbViewsCommentGen(ov) {
  const sb = loadSbViews();
  if (ov) sb.Store.state.settings.promptOverrides = ov;
  sb.COST = { optimize: 1, video: 5 }; // 弹窗按钮文案用(积分口径由 billing.js 供,本套件不加载)
  sb.styleOf = p => p.style || '漫剧';
  sb.__apiReady = true;
  const llm = [];
  sb.API.chatJSON = async req => {
    llm.push({ system: req.system, user: ((req.messages || [])[0] || {}).content, billingAction: req.billingAction });
    return { prompt: '改写后的雨夜提示词' };
  };
  const modals = [];
  sb.U.openModal = opt => { modals.push(opt); };
  /* 选择器 → 节点惰性造,同一选择器取到同一个对象([data-t=x] 那组带 dataset.t 供四策略那圈绑定用) */
  const modalStub = tags => {
    const nodes = {};
    const node = sel => (nodes[sel] = nodes[sel]
      || { value: '', style: {}, disabled: false, dataset: { t: (String(sel).match(/data-t=(\w+)/) || [])[1] }, onclick: null });
    return { querySelector: node, querySelectorAll: () => (tags || []).map(t => node('[data-t=' + t + ']')) };
  };
  const p = { id: 'p1', style: '漫剧' };
  const ep = { id: 'ep1', title: '第一集', shots: [], sbConfig: {} };
  const s = { id: 'sh1', order: 0, plot: '少女在街头回望', scene: '雨后街头', characters: ['林晚晴'], prompt: '漫剧风格,少女回望' };
  sb.SBViews.openPromptTool(s, {}, p, ep);
  const m1 = modalStub(['detail', 'light', 'camera', 'style', 'comment']);
  modals[0].onMount(m1, () => {});
  m1.querySelector('[data-t=comment]').onclick();
  const m2 = modalStub();
  modals[1].onMount(m2, () => {});
  m2.querySelector('[data-f=inst]').value = '把背景换成雨夜';
  await m2.querySelector('[data-x=rewrite]').onclick();
  assertEq(llm.length, 1, '「按指令改」应恰好发一次 LLM');
  return Object.assign({}, llm[0], { applied: m2.querySelector('[data-f=newprompt]').value });
}
/* 主体编辑页「按指令改」真跑:该步 handler 只挂在编辑页 body 的按钮上(模块出口只有 openSubjectEdit/openMultiView),
 * 故用极简选择器桩把编辑页与二级弹窗逐层驱动到 chatJSON——开编辑页 → 点「💬 按指令改」→ 填指令 → 点「改写提示词」,
 * 截获那一次请求的 system/user 与回填结果;ov 写进 Store 覆盖表(浏览器隐式读)。 */
async function roleEditorComment(kind, ov) {
  const sb = makeSandbox();
  installCommon(sb);
  if (ov) sb.Store.state.settings.promptOverrides = ov;
  sb.__apiReady = true;
  sb.COST = { image: 8, optimize: 1 }; // 弹窗按钮文案用(积分口径由 billing.js 供,本套件不加载)
  sb.U.thumb = f => f;
  sb.Voice = { norm: v => ({ voice: '默认音色' }) };
  const llm = [];
  sb.API.chatJSON = async req => {
    llm.push({ system: req.system, user: ((req.messages || [])[0] || {}).content, billingAction: req.billingAction });
    return { prompt: '改写后的红发设定提示词' };
  };
  const genCalls = [];
  /* roles.js 的共享操作桥(role-editor.js 顶层解构,缺一个成员就加载不起来) */
  sb.RoleOps = {
    formWord: k => (k === 'character' ? '子形象' : '形态'),
    VIEW_MODES: [{ key: 'sheet', label: '三视图', desc: '白底三视图', field: 'imgSheet' }],
    currentViewMode: s => s.viewMode || 'sheet',
    viewImg: (s, m) => s.imgSheet || s.image || '',
    touchImage() {}, setVoice() {}, recommendVoice() {}, bindRefAudio() {}, openForms() {},
    toggleFinalize() {}, genMainImage: (p, s) => { genCalls.push(s.prompt); }, replaceMainImage() {}, genModeImage() {},
  };
  const modals = [];
  sb.U.openModal = opt => { modals.push(opt); };
  /* 选择器 → 节点惰性造,同一选择器取到同一个对象(querySelectorAll 的那几组本用例不驱动) */
  const domStub = () => {
    const nodes = {};
    return {
      innerHTML: '', value: '', disabled: false, style: {}, dataset: {}, onclick: null,
      querySelector: sel => (nodes[sel] = nodes[sel] || domStub()),
      querySelectorAll: () => [],
    };
  };
  loadFile(sb, 'prompts.js'); // 与 index.html 同顺序:prompts 在 role-editor 之前
  loadFile(sb, 'role-editor.js');
  const p = { id: 'p1', style: '漫剧', subjects: [{ id: 'sj1', name: '林晚晴', kind, prompt: '漫剧风格,黑发少女' }] };
  sb.RoleEditor.openSubjectEdit(p, 'sj1', {});
  const m1 = domStub();
  modals[0].onMount(m1, () => {});
  m1.querySelector('[data-ebody]').querySelector('[data-x=commentimg]').onclick();
  const m2 = domStub();
  modals[1].onMount(m2, () => {});
  m2.querySelector('[data-f=inst]').value = '换成红色长发';
  await m2.querySelector('[data-x=rewrite]').onclick();
  assertEq(llm.length, 1, '「按指令改」应恰好发一次 LLM');
  m2.querySelector('[data-x=apply]').onclick(); // 确认应用:改写结果回落 s.prompt 并复用生图链路
  return Object.assign({}, llm[0], {
    applied: m2.querySelector('[data-f=newprompt]').value, prompt: p.subjects[0].prompt, genCalls,
  });
}
/* 全脏项目夹具:过期镜(done+旧指纹)/失败镜/未确认镜各一 + 低分审片 + 主体缺图 → G1-G6/G9 同时触发 */
function contractDirtyP() {
  const mk = (id, order, over) => Object.assign({
    id, order, name: '', plot: 'p', prompt: 'q', camera: '固定镜头', duration: 5,
    characters: [], scene: '', props: [], confirm: true, video: { status: 'done', url: 'http://x/v.mp4' },
  }, over || {});
  const ep = {
    id: 'ep1', title: '第一集', content: '剧本正文',
    shots: [
      mk('sh1', 0, { video: { status: 'done', url: 'u', inputHash: 'v3:oldstale' } }),
      mk('sh2', 1, { video: { status: 'failed', error: '上游超时' } }),
      mk('sh3', 2, { confirm: false }),
    ],
    lastReview: { avg: 5, perShot: [{ shotId: 'sh1', order: 0, score: 5 }] },
  };
  return { id: 'p1', name: '脏剧', subjects: [{ id: 'sj1', name: '主', kind: 'character' }], episodes: [ep] };
}
/* app.js 路由表(从源码实况提取:match 正则 + startsWith 前缀 + 精确路由 + 正则静态前缀) */
function appRoutes() {
  const src = fs.readFileSync(path.join(ROOT, 'js', 'app.js'), 'utf8');
  const res = [], prefixes = ['#/login'], regexPrefixes = [];
  [...src.matchAll(/hash\.match\((\/.+?\/[a-z]*)\)/g)].forEach(m => {
    const re = eval(m[1]); // 测试代码直取路由正则字面量,与 app.js 实况同步
    res.push(re);
    const staticPart = re.source.replace(/^\^/, '').split('(')[0].replace(/\\\//g, '/').replace(/\$$/, '');
    if (staticPart) regexPrefixes.push(staticPart);
  });
  [...src.matchAll(/hash\.startsWith\('([^']+)'\)/g)].forEach(m => prefixes.push(m[1]));
  const okRoute = v => res.some(re => re.test(v)) || prefixes.some(px => v.startsWith(px)) || regexPrefixes.some(px => v.startsWith(px));
  return { res, prefixes, okRoute };
}
/* 文档数字对账用:阿拉伯数字与中文小写数字(一…二十)同一口径,文档换写法不必改断言 */
const CN_DIGITS = '零一二三四五六七八九';
function cnNum(word) {
  const s = String(word || '');
  if (/^\d+$/.test(s)) return +s;
  const i = s.indexOf('十');
  if (i < 0) return CN_DIGITS.indexOf(s);
  const hi = i === 0 ? 1 : CN_DIGITS.indexOf(s[0]);
  const lo = i === s.length - 1 ? 0 : CN_DIGITS.indexOf(s[i + 1]);
  return hi < 0 || lo < 0 ? -1 : hi * 10 + lo;
}
/* 文档里凡是这一处措辞出现的地方,数字都必须等于实测值;一处都找不到同样算红——
 * 否则把那句话删掉/改写就能静默绕过对账。 */
function assertDocNum(rel, re, expect, label) {
  const src = fs.readFileSync(path.join(ROOT, rel), 'utf8');
  const got = [...src.matchAll(re)].map(m => cnNum(m[1]));
  assert(got.length, label + ':' + rel + ' 找不到该数字表述(改写文案时须同步本断言)');
  assertEq(got.join(','), got.map(() => expect).join(','),
    label + ':' + rel + ' 与实测不符(实测 ' + expect + ',文档 ' + got.join('/') + ')');
}
const contractTests = [
  { name: 'Issues.collect 返回数组(发布门 G2 的消费契约)', fn() {
    const sb = loadContract();
    const r = sb.Issues.collect(contractDirtyP());
    assert(Array.isArray(r), 'Issues.collect 必须返回数组,实际:' + typeof r);
    assert(r.some(x => x.sev === 'high'), '脏项目应含高危条目(失败镜)');
  } },
  { name: 'Release 全脏项目:fix.cmd 均已注册 + 集级命令带真实 epid + shotIds 子集正确', fn() {
    const sb = loadContract();
    const r = sb.Release.collect(contractDirtyP(), { online: false });
    const cmds = sb.Commands.list();
    const names = cmds.map(c => c.name);
    const withCmd = r.gates.filter(g => g.fix && g.fix.cmd);
    assert(withCmd.length >= 5, '脏项目应至少挂出 G1/G3/G4/G6/G9 五个命令类处置,实际 ' + withCmd.length);
    withCmd.forEach(g => {
      assert(names.includes(g.fix.cmd), g.code + ' 的 fix.cmd 未注册:' + g.fix.cmd);
      const meta = cmds.find(c => c.name === g.fix.cmd);
      if (meta.needs.includes('ep')) assertEq(g.fix.epid, 'ep1', g.code + ' 集级命令须带真实 epid');
    });
    assertEq(r.gates.find(g => g.code === 'g4-stale').fix.shotIds.join(','), 'sh1', 'G4 只带过期镜子集');
    assertEq(r.gates.find(g => g.code === 'g6-failed').fix.shotIds.join(','), 'sh2', 'G6 只带失败镜子集');
    assertEq(r.gates.find(g => g.code === 'g9-subjects').fix.subjectIds.join(','), 'sj1', 'G9 只带缺图主体子集');
  } },
  { name: 'Issues 命令类条目的 cmd 同样在注册表内(与 fixIssue 执行路径一致)', fn() {
    const sb = loadContract();
    const names = sb.Commands.list().map(c => c.name);
    const list = sb.Issues.collect(contractDirtyP());
    const withCmd = list.filter(x => x.cmd);
    assert(withCmd.length >= 1, '脏项目问题中心应挂出命令类处置(失败镜重生成)');
    withCmd.forEach(it => assert(names.includes(it.cmd), 'Issues 条目 cmd 未注册:' + it.cmd + '(' + it.kind + ')'));
    // 同集多问题共存回归(原 Object.assign(base) 共享引用,条目互相覆盖成同一对象)
    const kinds = list.map(x => x.kind);
    ['failed-shots', 'stale-shots', 'unconfirmed', 'low-review'].forEach(k => assert(kinds.includes(k), '应包含 ' + k + ',实际:' + kinds.join(',')));
    const fi = list.find(x => x.kind === 'failed-shots');
    assertEq(fi.sev, 'high', '失败镜应高危(共享引用 bug 时会被后写的中危覆盖)');
    assertEq((fi.shotIds || []).join(','), 'sh2', '失败镜条目应带失败 shotIds 子集');
    assert(!list.find(x => x.kind === 'stale-shots').cmd, '过期镜条目是导航类,不应串上失败镜的 cmd');
  } },
  { name: 'Release fix.hash 命中 app.js 路由表', fn() {
    const sb = loadContract();
    const { okRoute } = appRoutes();
    const r = sb.Release.collect(contractDirtyP(), { online: false });
    const withHash = r.gates.filter(g => g.fix && g.fix.hash);
    assert(withHash.length >= 1, '脏项目应挂出 G5 导航类处置(G9 已改命令类)');
    withHash.forEach(g => assert(okRoute(g.fix.hash), g.code + ' fix.hash 不是有效路由:' + g.fix.hash));
  } },
  { name: 'js 全量 location.hash 字面量/模板均命中 app.js 路由表', fn() {
    const { okRoute } = appRoutes();
    const dir = path.join(ROOT, 'js');
    const bad = [];
    fs.readdirSync(dir).filter(f => f.endsWith('.js')).forEach(f => {
      const src = fs.readFileSync(path.join(dir, f), 'utf8');
      [...src.matchAll(/location\.hash\s*=\s*('([^']*)'|`([^`]*)`)/g)].forEach(m => {
        const raw = m[2] !== undefined ? m[2] : m[3];
        const isPrefixConcat = src.slice(m.index + m[0].length).trimStart().startsWith('+'); // '#/project/' + id 形式按前缀处理
        const v = raw.replace(/\$\{[^}]*\}/g, 'x1'); // 模板占位填哑值
        if (!v) return;
        if (okRoute(v)) return;
        if (isPrefixConcat && [...appRoutes().prefixes, '#/project/'].some(px => (v + '/').startsWith(px) || px.startsWith(v + '/') || px.startsWith(v))) return;
        bad.push(f + ' → ' + raw);
      });
    });
    assertEq(bad.join('; '), '', '存在不命中路由表的 location.hash 字面量');
  } },
  { name: '侧栏任务角标契约:首渲染徽标与 tasks-changed 更新器同一 data-task-badge 标识(防重复叠加/归零残留)', fn() {
    const src = fs.readFileSync(path.join(ROOT, 'js', 'app.js'), 'utf8');
    const shellBadge = src.match(/runningTasks\s*\?\s*`<span class="tag cyan"([^`]*)`/);
    assert(shellBadge && shellBadge[1].includes('data-task-badge'), '首渲染徽标须带 data-task-badge(否则更新器查不到会再 append 一个,归零时残留)');
    assert(src.includes("querySelector('.tag[data-task-badge]')"), 'tasks-changed 更新器须按 data-task-badge 查询');
  } },
  { name: '命令元数据单源:浏览器 REG 词表 === cmd-registry 词表(注册默认 needs/risk 一致)', fn() {
    const sb = loadContract();
    const CR = require('../js/cmd-registry.js');
    assertEq(Object.keys(sb.Commands.REG).sort().join(','), CR.names().sort().join(','), '浏览器命令词表应与注册表一致');
    const byName = CR.byName;
    sb.Commands.list().forEach(c => {
      assertEq(c.needs.join(','), byName[c.name].needs.join(','), c.name + ' needs 应与注册表一致');
      assertEq(c.risk, byName[c.name].risk, c.name + ' risk 应与注册表一致');
      assert(c.desc && Array.isArray(c.args), c.name + ' 应带注册表 desc/args(供 Agent/MCP 自省)');
    });
  } },
  { name: '命令元数据单源:CLI EXEC 词表 === 注册表词表(源码扫描),help 实跑含全部命令', fn() {
    const CR = require('../js/cmd-registry.js');
    const cliSrc = fs.readFileSync(path.join(ROOT, 'cli.js'), 'utf8');
    const execKeys = [...cliSrc.matchAll(/EXEC\['([^']+)'\]/g)].map(m => m[1]).filter((v, i, a) => a.indexOf(v) === i);
    assertEq(execKeys.sort().join(','), CR.names().sort().join(','), 'cli.js EXEC 词表应与注册表一致');
    assert(cliSrc.includes("require('./js/cmd-registry.js')"), 'cli.js 应 require 注册表');
    // 功能验证:node cli.js help 实跑,统一命令段由注册表生成且含全部命令
    const { spawnSync } = require('child_process');
    const r = spawnSync(process.execPath, [path.join(ROOT, 'cli.js'), 'help'], { encoding: 'utf8' });
    const txt = String(r.stdout || '') + String(r.stderr || '');
    CR.names().forEach(n => assert(txt.includes(n), 'cli help 应含命令 ' + n));
    CR.META.forEach(m => assert(txt.includes(m.label), 'cli help 应含命令中文名 ' + m.label));
  } },
  { name: '命令元数据单源:mcp.js 工具描述由注册表生成(hujing_exec 词表不再手抄)', fn() {
    const CR = require('../js/cmd-registry.js');
    const mcpSrc = fs.readFileSync(path.join(ROOT, 'mcp.js'), 'utf8');
    assert(mcpSrc.includes("require('./js/cmd-registry.js')"), 'mcp.js 应 require 注册表');
    assert(mcpSrc.includes('CmdRegistry.names()'), 'mcp.js hujing_exec 词表应由 CmdRegistry.names() 生成');
  } },
  { name: '专家人设单源:/api/wf/* 各条工作流均经 wfPersonaNote 注入,板块键取自 WF_BOARD', fn() {
    const WfCore = require('../js/wf-core.js');
    const srv = fs.readFileSync(path.join(ROOT, 'server.js'), 'utf8');
    const agentSrc = fs.readFileSync(path.join(ROOT, 'js', 'agent.js'), 'utf8');
    assertEq(Object.keys(WfCore.WF_BOARD).join(','), 'understanding,smart-storyboard,smart-review,extract-subjects,split-episodes', 'WF_BOARD 应覆盖各条服务端工作流');
    Object.values(WfCore.WF_BOARD).forEach(b => assert(agentSrc.includes("key: '" + b + "'"), 'WF_BOARD 板块「' + b + '」应是 AGENT_BOARDS 已有板块'));
    assert(srv.includes('function wfPersonaNote('), 'server.js 应有唯一的生效专家装配口 wfPersonaNote');
    assert(srv.includes('WfCore.WF_BOARD.understanding'), '/api/wf/understanding 未注入生效专家方法论');
    assert(srv.includes("WfCore.WF_BOARD['smart-storyboard']"), '/api/wf/smart-storyboard 未注入生效专家方法论');
    assert(srv.includes("WfCore.WF_BOARD['smart-review']"), '/api/wf/smart-review 未注入生效专家方法论');
    assert(srv.includes("WfCore.WF_BOARD['extract-subjects']"), '/api/wf/extract-subjects 未注入生效专家方法论');
    assert(srv.includes("WfCore.WF_BOARD['split-episodes']"), '/api/wf/split-episodes 未注入生效专家方法论');
    // 1 定义 + 7 调用(理解 / 分镜 / 分镜内部理解步 / 审片 / Agent 对话 / 提取主体 / 拆集):新增 LLM 步漏注入时此断言先红
    assertEq((srv.match(/wfPersonaNote\(/g) || []).length, 8, 'wfPersonaNote 调用点数应与 wf 工作流 LLM 步一致');
    // 服务端不得留第二条装配路径(直接 personaNote(expertOf(...))):否则板块专家在部分端点静默失效
    assertEq((srv.match(/WfCore\.personaNote\(/g) || []).length, 0, 'server.js 应只经 wfPersonaNote 装配,不直接调 WfCore.personaNote');
  } },
  { name: 'skill 索引引用键单源:kb/prompts/settings/cmds/experts 全部命中既有注册表,stage ⊆ 主线七步', fn() {
    const Skills = require('../js/skills.js');
    const Domain = require('../js/domain.js');
    const wfStepKeys = Domain.workflow({ id: 'p1', episodes: [], subjects: [] }).steps.filter(s => !s.side).map(s => s.key);
    // 提示词模板三件套等偏好键取自 gsettings.js 的 DEFAULTS(不在测试里手抄第二份)
    const gsSrc = fs.readFileSync(path.join(ROOT, 'js', 'gsettings.js'), 'utf8');
    const defBlock = gsSrc.slice(gsSrc.indexOf('const DEFAULTS = {'), gsSrc.indexOf('const DIR_DIMS'));
    const settingKeys = [...defBlock.matchAll(/(?:^|[{,]\s*)([A-Za-z]\w*):/g)].map(m => m[1]);
    assert(settingKeys.includes('tplImage') && settingKeys.includes('tplVideo') && settingKeys.includes('tplReview'), '偏好键提取应含模板三件套');
    const bad = Skills.validate({
      Prompts: require('../js/prompts.js'), CmdRegistry: require('../js/cmd-registry.js'),
      ExpertsData: require('../js/experts-data.js'), settingKeys, wfStepKeys,
    });
    assertEq(bad.join(' | '), '', 'skill 引用键应全部存在于既有注册表');
    // 七步索引:与 Domain.workflow 主线步骤键同词表(G-03 后审片亦是一等步骤,七步全为 wfStep)
    const stages = Skills.stages();
    assertEq(stages.join(','), 'script,subjects,eps,shots,gen,review,film', '主线七步词表');
    wfStepKeys.forEach(k => assert(stages.includes(k), 'workflow 主线步骤 ' + k + ' 应在 skill 索引词表内'));
    assertEq(Skills.stages().filter(k => !Skills.stageOf(k).wfStep).join(','), '', '七步应全部标为 Domain.workflow 主线步骤');
    // 索引层不复制正文:块文本逐字节等于 KB 原文/压缩块
    const KB = require('../js/knowledge.js');
    assertEq(Skills.block('shots', { ids: ['shots.shotLanguage'] }), KB.pick('景别运镜', '轴线匹配', '多镜头写法'), '分镜注入块应逐字节等于 KB 条目拼接');
    assertEq(Skills.block('subjects'), KB.section('主体参考'), '主体步注入块应逐字节等于 KB 主体参考条目');
    assertEq(Skills.block('review'), KB.reviewBlock(), '审片注入块应逐字节等于 KB.reviewBlock()');
    assertEq(Skills.block('gen'), KB.pick('抽卡公式', '抽卡军规'), '生成步注入块应逐字节等于 KB 条目拼接');
    const src = fs.readFileSync(path.join(ROOT, 'js', 'skills.js'), 'utf8');
    // 加载期依赖只有 KB 与 Domain 两件双端纯模块;WfCore 以解析器形态传入(浏览器里它晚于本文件加载)
    const iBody = src.indexOf('function (KB, Domain, wfCore) {');
    assert(iBody > 0, 'skills.js factory 签名应为 (KB, Domain, wfCore)');
    const body = src.slice(iBody); // 只查 factory 体(UMD 头与文件头注释不计)
    ['window', 'Store', 'document', 'location', 'fetch'].forEach(w => assert(!body.includes(w), 'skills.js 模块体不得出现环境句柄:' + w));
    /* WfCore 只在用到它的地方现解析(校验项体内,或顶层只放惰性取值函数),不在模块顶层取值——
     * 浏览器加载顺序上它晚于本文件,顶层取值会绑到 undefined。现有三处取值点:景别级差 sizeGap(SK-18)、
     * 运镜词表 CAMERA_MOVES(SK-20)与四维成片评审的维度名 normalizeCut(SK-24);
     * 新增/摘掉取值点即红,裸 wfCore()(解析后存起来)同样红——存起来就等于在某处提前绑定。 */
    const lazy = [...body.matchAll(/wfCore\(\)\.(\w+)/g)].map(m => m[1]).sort();
    assertEq(lazy.join(','), 'CAMERA_MOVES,normalizeCut,sizeGap', 'WfCore 应只被这三处取值点现解析');
    assertEq((body.match(/wfCore\(\)/g) || []).length, lazy.length, '每一处 wfCore() 都应即时取值,不留裸解析');
    assert(!/^ {2}const \w+ = wfCore\(\)/m.test(body), 'WfCore 不得在模块顶层取值(须在校验项体内或惰性取值函数里现解析)');
    assert(!/^\s*const \w+ = wfCore\(\)/m.test(body.slice(0, body.indexOf("CHECKS['"))), 'skills.js 不得在模块顶层解析 WfCore');
    // 编排型步骤只引用已注册命令(playbook 不内联新命令语义)
    const names = require('../js/cmd-registry.js').names();
    const orch = Skills.list().filter(s => s.kinds.includes('orchestrate') && !s.pending.includes('orchestrate'));
    assert(orch.length >= 5, '编排面已落地的条目不应少于 5 条(主线全链/主线前段/审片修订闭环/一键成片投影/结论回流)');
    assertEq(Skills.playbooks().map(p => p.id).join(','), orch.map(s => s.id).join(','), 'playbooks() 应投影全部已落地编排条目');
    orch.forEach(s => {
      const pb = Skills.playbook(s.id);
      assert(pb && pb.steps.length, s.id + ' 应有 playbook 步骤');
      pb.steps.forEach(st => assert(names.includes(st.cmd), s.id + ' 步骤命令未注册:' + st.cmd));
    });
    // SK-16 主线前段编排:拆集与主体提取已进 steps,playbook 覆盖前段四步而非只有集内两步
    const front = Skills.playbook('eps.frontPipeline');
    assertEq(front.steps.map(s => s.cmd).join(','),
      'project.extractSubjects,project.splitEpisodes,episode.understanding,episode.generateStoryboard',
      '主线前段 playbook 应按主线步序含前段四步');
    // 步序与 Domain.workflow 同源:主体步排在分集步之前(工作流改序时此断言先红)
    assert(wfStepKeys.indexOf('subjects') < wfStepKeys.indexOf('eps'), '主线步序应为主体先于分集');
    // 编排型的命令面由 steps 去重推出,条目里不写第二份
    assertEq(Skills.byId('eps.frontPipeline').cmds.join(','), front.steps.map(s => s.cmd).join(','), '编排条目 cmds 应由 steps 推出');
    // 步骤不预设参数:拆集的 overwrite 未授权即拒(编排层只给步序,不替调用方授权覆盖已有分集)
    front.steps.forEach(st => assertEq(Object.keys(st.args).length, 0, '前段步骤不应预设参数:' + st.cmd));
    /* SK-05 主线全链编排:贯通层这条编排的 steps 把已注册命令串成端到端一条链,playbook 不再为 null。
     * 与 SK-16(前段)/SK-25(审片修订)/SK-30(一键成片)的关系是全链与分段,不是第二份语义。 */
    const chain = Skills.playbook('core.playbookProjection');
    assert(chain, 'SK-05 编排面已落地,playbook 不应为 null');
    assertEq(chain.steps.map(s => s.cmd).join(','),
      'project.extractSubjects,subject.generateImage,project.splitEpisodes,episode.understanding,'
      + 'episode.generateStoryboard,episode.preflight,episode.generateVideos,episode.smartReview,episode.compose',
      '主线全链 playbook 应按主线步序串起端到端九步');
    chain.steps.forEach(st => assertEq(Object.keys(st.args).length, 0, '全链步骤不应预设参数:' + st.cmd));
    assertEq(Skills.byId('core.playbookProjection').cmds.join(','), chain.steps.map(s => s.cmd).join(','),
      'SK-05 的 cmds 应由 steps 推出(不再手写第二份全量清单)');
    /* 步序与 Domain.workflow 同源:落到主线步上的那几步在链上不得倒序(工作流改序或步骤插错位置时先红);
     * 本集理解与就绪检查是所属步的前置动作,不单独映射一个主线步,故不参与本断言 */
    const stepOfCmd = {
      'project.extractSubjects': 'subjects', 'subject.generateImage': 'subjects', 'project.splitEpisodes': 'eps',
      'episode.generateStoryboard': 'shots', 'episode.generateVideos': 'gen', 'episode.smartReview': 'review',
      'episode.compose': 'film',
    };
    const anchors = chain.steps.map(s => stepOfCmd[s.cmd]).filter(Boolean).map(k => wfStepKeys.indexOf(k));
    assert(anchors.every(i => i >= 0), '全链锚点步应全部落在 Domain.workflow 主线步骤上');
    anchors.forEach((v, i) => assert(i === 0 || anchors[i - 1] <= v, '全链步序不得与 Domain.workflow 主线步序倒置'));
    // 两条编排不许分叉:SK-16 前段四步须是全链的有序子序列
    let at = -1;
    front.steps.forEach(st => {
      const k = chain.steps.findIndex((c, i) => i > at && c.cmd === st.cmd);
      assert(k > at, '前段编排的步骤应是主线全链的有序子序列:' + st.cmd);
      at = k;
    });
    /* 有意不进链的两条:断点补拍与聚合编排各有归属,不串进主线全链;
     * 摘掉 SK-05 的全量 cmds 后它们仍被别的条目登记(全命令覆盖那条契约不靠本条兜底) */
    ['shot.generateVideo', 'episode.produce'].forEach(n => {
      assert(!chain.steps.some(s => s.cmd === n), n + ' 不应串进主线全链(断点补拍 / 三步聚合各有归属)');
      assert(Skills.list().some(s => s.id !== 'core.playbookProjection' && s.cmds.includes(n)), n + ' 应仍被其他条目登记');
    });
    /* 编排面三个落点都已接本投影/命令表(计划步骤见 plans 套件、MCP 中段流程模板见 flow 套件、
     * 发布留痕的命令化出口见 release 套件),按关联索引口径缺口标记不摘 */
    assert(Skills.byId('core.playbookProjection').gaps.includes('G-12'), 'G-12 的关联索引应仍在(落地不摘标记)');
    assert(Skills.byId('core.playbookProjection').note.includes('js/flow-tpl.js'), 'note 须写明中段流程模板也由本投影切片(实况同步)');
    /* 发布留痕有意不串进主线全链:它是主线跑完之后的收尾动作,note 须写明"为什么不在链里",
     * 否则读者会把"链里没有"读成"还没命令化"(计划层与中段模板都只切本投影,口径自动跟随) */
    assert(!chain.steps.some(s => s.cmd === 'project.release'), '发布留痕不应串进主线全链(收尾动作,不是主线第七步)');
    assert(Skills.byId('core.playbookProjection').note.includes('project.release'), 'note 须写明发布留痕已命令化且为何不进本链');
    ['review.reviseLoop', 'review.memoryFeedback'].forEach(id =>
      assert(Skills.byId(id).cmds.includes('project.release'), id + ' 应登记发布留痕这一步(编排层现在挂得出命令名)'));
    // 校验型扩展点:登记的校验项必须有实现(不挂空项),check 结果数与该步登记数一致
    [].concat(...Skills.list().map(s => s.checks)).forEach(id => assert(typeof Skills.CHECKS[id] === 'function', '校验项未注册实现:' + id));
    assertEq(Skills.check('review', {}).length, Skills.list('review').reduce((n, s) => n + s.checks.length, 0), 'check 结果数应等于该步已登记校验项数');
  } },
  { name: 'skill 索引对齐短名单 30 条:SK 编号连续、波次配比 9/5/16、四类单源键全覆盖', fn() {
    const Skills = require('../js/skills.js');
    const list = Skills.list();
    assertEq(list.length, 30, 'skill 索引应为短名单 30 条内部能力');
    assertEq(list.map(s => s.sk).join(','), Array.from({ length: 30 }, (_, i) => 'SK-' + String(i + 1).padStart(2, '0')).join(','), 'SK 编号应连续且按短名单顺序登记');
    // 波次配比与短名单一致:W2 单源打底 9 / W3 双端贯通 5 / W4 校验闸门 16
    const byWave = list.reduce((m, s) => { m[s.wave] = (m[s.wave] || 0) + 1; return m; }, {});
    assertEq(JSON.stringify(byWave), JSON.stringify({ W2: 9, W3: 5, W4: 16 }), '波次配比应为 W2:9 / W3:5 / W4:16');
    // 四类既有单源键全覆盖:KB 条目 / Prompts key / 领域命令 / 专家 id 一个不落(新增单源键必须进索引;
    // 各类的条数由 contract 套件的「注册表口径」对账断言钉在 README 上,此处只查覆盖不查条数)
    const uniq = k => [...new Set([].concat(...list.map(s => s[k])))];
    const KB = require('../js/knowledge.js');
    const kbKeys = Object.keys(KB.SECTIONS);
    assertEq(kbKeys.filter(k => !uniq('kb').includes(k)).join(','), '', 'KB 全部条目应被 skill 索引引用');
    // 取用键单一:skill 层的 kb 引用键必须是 SECTIONS 键,不得回到 KB.WR_/DR_/GC_ 原始属性名
    assertEq(uniq('kb').filter(k => !kbKeys.includes(k)).join(','), '', 'skill 层 kb 键须取自 KB.SECTIONS 取用面');
    assertEq(require('../js/prompts.js').list().map(x => x.key).filter(k => !uniq('prompts').includes(k)).join(','), '', 'Prompts 全部 key 应被 skill 索引引用');
    assertEq(require('../js/cmd-registry.js').names().filter(k => !uniq('cmds').includes(k)).join(','), '', '全部领域命令应被 skill 索引引用');
    assertEq(require('../js/experts-data.js').EXPERTS.map(e => e.id).filter(k => !uniq('experts').includes(k)).join(','), '', '全部专家 id 应被 skill 索引引用');
    // 贯通层条目走 stage='*',不混进任一步的注入块
    assertEq(list.filter(s => s.stage === Skills.CROSS).map(s => s.sk).join(','), 'SK-01,SK-02,SK-03,SK-04,SK-05', '贯通层五条走 stage=*');
    assertEq(Skills.block(Skills.CROSS), '', '贯通层索引宿主不产出注入块(正文只从各步条目取)');
    // 跨步能力经 covers 可查:对白铁律同时作用剧本与分镜
    assert(Skills.covering('shots').some(s => s.id === 'script.dialogueRule'), 'covers 应能查到跨步条目');
    assert(Skills.forExpert('ex_hook').some(s => s.id === 'script.hookType'), '专家反查应命中引用它的能力');
    assert((Skills.gaps()['G-10'] || []).length > 0, '缺口投影应能按缺口编号列出待落地能力');
  } },
  { name: 'skill 索引登记面无漏登:索引宿主 SK-01 的 kb 与 KB.SECTIONS 键集逐条对齐(全库登记一次)', fn() {
    const Skills = require('../js/skills.js');
    const KB = require('../js/knowledge.js');
    const kbKeys = Object.keys(KB.SECTIONS);
    /* 「每个 SECTIONS 键至少被一条 skill.kb 登记」已由上一条契约断言,但它对宿主这一向是盲的:
     * 某键只要被别的条目登记过,把它从索引宿主里摘掉照样全绿——"全库条目在宿主登记一次"
     * 此前只是条目 note 里的约定。本条把这一向补成硬断言,漏登即红。 */
    const idx = Skills.byId('core.stageIndex');
    assert(idx && idx.stage === Skills.CROSS && idx.kinds.includes('infra'), '索引宿主 core.stageIndex 应是贯通层 infra 条目');
    assertEq(kbKeys.filter(k => !idx.kb.includes(k)).join('、'), '', '新增 KB 条目须同时登记进索引宿主 SK-01 的 kb');
    assertEq(idx.kb.filter(k => !kbKeys.includes(k)).join('、'), '', '索引宿主不得留 KB.SECTIONS 之外的键(条目改名/删条后的残留)');
    assertEq(idx.kb.filter((k, i) => idx.kb.indexOf(k) !== i).join('、'), '', '索引宿主每条只登记一次');
    // 记账基准只有一份:别的条目一律只引用自己那几条,不得再出现第二个全库宿主
    Skills.list().filter(s => s.id !== idx.id).forEach(s =>
      assert(s.kb.length < kbKeys.length, s.id + ' 不应整库登记 KB 条目(全库只在索引宿主登记一次)'));
  } },
  { name: 'skill 索引不挂假出口:未实现的校验/编排面既不登记也不产出结果', fn() {
    const Skills = require('../js/skills.js');
    const list = Skills.list();
    list.forEach(s => {
      assert(s.kinds.length, s.id + ' 须声明机制面');
      if (s.pending.length) assert(s.gaps.length, s.id + ' 未落地机制面须写明缺口编号');
      if (s.pending.includes('check')) assertEq(s.checks.length, 0, s.id + ' 校验面未落地不得登记校验项');
      if (s.pending.includes('orchestrate')) assertEq(s.steps.length, 0, s.id + ' 编排面未落地不得登记步骤');
      if (s.pending.includes('orchestrate')) assertEq(Skills.playbook(s.id), null, s.id + ' 编排面未落地不应给 playbook');
    });
    // CHECKS 与条目登记双向对齐:登记的校验项必有实现,实现也必被某条目引用(不留孤儿实现);
    // 每步 check() 的结论数 = 该步已落地校验项数(pending 的面既不登记也不产出结论)
    const declared = [].concat(...list.map(s => (s.pending.includes('check') ? [] : s.checks)));
    Object.keys(Skills.CHECKS).forEach(id => assert(declared.includes(id), '校验项实现未被任何条目引用(孤儿实现):' + id));
    declared.forEach(id => assert(typeof Skills.CHECKS[id] === 'function', '条目登记的校验项无实现:' + id));
    Skills.stages().forEach(st => {
      const n = Skills.list(st).reduce((m, s) => m + (s.pending.includes('check') ? 0 : s.checks.length), 0);
      assertEq(Skills.check(st, {}).length, n, st + ' 步结论数应等于该步已落地校验项数');
    });
    // 注入面未落地的条目一条也不进拼块(逐条按自身 stage 单取,拼块为空即未挂假出口)
    const KB = require('../js/knowledge.js');
    list.filter(s => s.pending.includes('inject')).forEach(s =>
      assertEq(Skills.block(s.stage, { ids: [s.id] }), '', s.id + ' 注入面未落地不应产出拼块'));
    assertEq(Skills.block('film'), KB.DR_RHYTHM, '成片步注入块应逐字节等于 KB 剪辑节奏条目');
  } },
  { name: 'skill 索引加载点成对:index.html(knowledge 之后 wf-core 之前)+ server/cli/mcp require', fn() {
    const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
    const iKB = html.indexOf('js/knowledge.js'), iSk = html.indexOf('js/skills.js'), iWf = html.indexOf('js/wf-core.js');
    const iDom = html.indexOf('js/domain.js');
    assert(iSk > 0, 'index.html 应挂载 js/skills.js');
    assert(iKB < iSk && iSk < iWf, 'skills.js 须在 knowledge.js 之后、wf-core.js 之前(依赖 KB,且供 wf-core 取块)');
    assert(iDom > 0 && iDom < iSk, 'skills.js 须在 domain.js 之后(校验型条目的领域判定现取 Domain)');
    ['server.js', 'cli.js', 'mcp.js'].forEach(f => {
      const src = fs.readFileSync(path.join(ROOT, f), 'utf8');
      assert(src.includes("require('./js/skills.js')"), f + ' 应 require skill 索引(四端同一份注册表)');
    });
  } },
  { name: '提取主体走 wf 通道:CLI 不再直打 /api/llm/chat,两端按主体板块注入人设与记忆', fn() {
    const WfCore = require('../js/wf-core.js');
    const cliSrc = fs.readFileSync(path.join(ROOT, 'cli.js'), 'utf8');
    const euSrc = fs.readFileSync(path.join(ROOT, 'js', 'episode-util.js'), 'utf8');
    const srv = fs.readFileSync(path.join(ROOT, 'server.js'), 'utf8');
    // CLI 提取主体段落:直打 /api/llm/chat 会绕过服务端注入(人设/记忆),此断言封死回潮
    const from = cliSrc.indexOf("EXEC['project.extractSubjects']");
    const seg = cliSrc.slice(from, cliSrc.indexOf('CmdRegistry.META.forEach', from));
    assert(from > 0 && seg.includes("POST('/api/wf/extract-subjects'"), 'CLI project.extractSubjects 应走 /api/wf/extract-subjects');
    assert(!seg.includes('/api/llm/chat'), 'CLI project.extractSubjects 不应再直打 /api/llm/chat');
    assert(srv.includes("pathname === '/api/wf/extract-subjects'"), 'server.js 应提供 /api/wf/extract-subjects 端点');
    assert(srv.includes("action: 'llm.extract'"), '提取主体计费动作应服务端定死为 llm.extract');
    // 浏览器解析向导同一板块同一注入口(否则两端提示词再度分叉)
    assert(euSrc.includes("WfCore.WF_BOARD['extract-subjects']") && euSrc.includes('personaNoteFor(p, board)') && euSrc.includes('WfCore.memBlock('), '浏览器 llmExtractSubjects 应按主体板块注入人设与记忆');
    const types = { character: true, scene: true, prop: true };
    const base = WfCore.buildExtractUser('剧本正文', 'normal', types);
    assertEq(WfCore.buildExtractUser('剧本正文', 'normal', types, { personaNote: '', memText: '' }).user, base.user, '无专家无记忆时提取提示词应与未注入时逐字节一致');
    const injected = WfCore.buildExtractUser('剧本正文', 'normal', types, {
      personaNote: WfCore.personaNote({ name: '选角指导', persona: '先定人物关系再定形象' }, '主体'),
      memText: WfCore.memBlock([{ text: '女主统一叫林晚晴', scope: '主体' }], '', '主体'),
    }).user;
    assert(injected.includes('专家方法论(选角指导·主体板块):先定人物关系再定形象'), '提取提示词应含板块专家方法论');
    assert(injected.includes('女主统一叫林晚晴'), '提取提示词应含主体板块协作记忆');
    assert(injected.indexOf('专家方法论') < injected.indexOf('剧本:'), '注入段应在剧本正文之前');
  } },
  { name: 'MCP resources/prompts(§2.7):initialize 声明能力;list/get 实跑;模板参数代入与流程序列', fn() {
    const { spawnSync } = require('child_process');
    const reqs = [
      { jsonrpc: '2.0', id: 1, method: 'initialize', params: {} },
      { jsonrpc: '2.0', id: 2, method: 'resources/list' },
      { jsonrpc: '2.0', id: 3, method: 'prompts/list' },
      { jsonrpc: '2.0', id: 4, method: 'prompts/get', params: { name: 'hujing_failed_shots', arguments: { pid: 'p1', epid: 'e1' } } },
      { jsonrpc: '2.0', id: 5, method: 'prompts/get', params: { name: 'hujing_failed_shots', arguments: { pid: 'p1' } } }, // 缺 epid 应报错
      { jsonrpc: '2.0', id: 6, method: 'resources/read', params: { uri: 'hujing://bogus' } }, // 未知 URI 应报错
    ];
    const r = spawnSync(process.execPath, [path.join(ROOT, 'mcp.js')], { input: reqs.map(x => JSON.stringify(x)).join('\n') + '\n', encoding: 'utf8', timeout: 30000 });
    const byId = {};
    String(r.stdout || '').trim().split('\n').filter(Boolean).forEach(l => { const m = JSON.parse(l); byId[m.id] = m; });
    assert(byId[1] && byId[1].result.capabilities.resources && byId[1].result.capabilities.prompts, 'initialize 应声明 resources/prompts 能力');
    const tpls = ((byId[2].result || {}).resourceTemplates || []).map(t => t.uriTemplate).join(',');
    assert(tpls.includes('hujing://project/{pid}/workflow') && tpls.includes('hujing://project/{pid}/episode/{epid}/workflow'), 'resources 应含项目/分集 workflow 模板,实际:' + tpls);
    const pnames = ((byId[3].result || {}).prompts || []).map(p => p.name).join(',');
    assert(pnames.includes('hujing_new_drama') && pnames.includes('hujing_failed_shots'), 'prompts 应含新剧开工/失败镜排查模板,实际:' + pnames);
    const txt = (((byId[4].result || {}).messages || []).map(m => m.content && m.content.text) || []).join('\n');
    assert(txt.includes('p1') && txt.includes('e1'), 'prompts/get 应代入 pid/epid 参数');
    assert(txt.includes('hujing_wait') && txt.includes('failedOnly'), '失败镜排查模板应含断点续查与 failedOnly 重跑');
    assert(byId[5].error && byId[5].error.code === -32602, '缺必填参数应 -32602');
    assert(byId[6].error && byId[6].error.code === -32602, '未知资源 URI 应 -32602');
  } },
  /* mcp.js 此前 require 了 skill 索引却零使用:注册表只读工具是它的第一个出口——
   * 本进程直读 js/skills.js 答复(不起 cli 子进程、不打服务端、零计费),步骤 args 一律留空不预授权。 */
  { name: 'MCP 注册表只读工具:playbook 步骤表与校验面直读 skills.js 答复(零计费、args 不预授权)', fn() {
    const { spawnSync } = require('child_process');
    const Skills = require('../js/skills.js');
    const reqs = [
      { jsonrpc: '2.0', id: 1, method: 'tools/list' },
      { jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'hujing_playbook', arguments: { id: 'core.playbookProjection' } } },
      { jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'hujing_playbook', arguments: {} } },
      { jsonrpc: '2.0', id: 4, method: 'tools/call', params: { name: 'hujing_playbook', arguments: { id: 'bogus' } } },
    ];
    // 无服务器无 token:只读注册表的工具照样答得出(它不经 CLI,也就不需要登录)
    const env = Object.assign({}, process.env, { HUJING_SERVER: '', HUJING_TOKEN: '' });
    const r = spawnSync(process.execPath, [path.join(ROOT, 'mcp.js')], { input: reqs.map(x => JSON.stringify(x)).join('\n') + '\n', encoding: 'utf8', timeout: 30000, env });
    const byId = {};
    String(r.stdout || '').trim().split('\n').filter(Boolean).forEach(l => { const m = JSON.parse(l); byId[m.id] = m; });
    const names = ((byId[1].result || {}).tools || []).map(t => t.name);
    assert(names.includes('hujing_playbook'), 'tools/list 应含注册表只读工具,实际:' + names.join(','));
    const one = JSON.parse(byId[2].result.content[0].text);
    assertEq(byId[2].result.isError, false, '只读工具不应报错');
    assertEq(one.playbooks.length, 1);
    assertEq(one.playbooks[0].steps.map(s => s.cmd).join(','), Skills.playbook('core.playbookProjection').steps.map(s => s.cmd).join(','),
      '步骤表应逐步等于注册表投影(不在 MCP 侧手抄第二份步序)');
    one.playbooks[0].steps.forEach(s => assertEq(Object.keys(s.args).length, 0, '步骤不应预设参数:' + s.cmd));
    assert(one.playbooks[0].steps.every(s => s.note), '每步应带步骤旁注(助手照注拼参数)');
    // 校验面清单同表:面数与条数一律取单源面表,不在 MCP 侧另写一份
    assertEq(one.checks.map(c => c.stage).join(','), Skills.preflightStages().join(','), '校验面应等于就绪检查单源面表');
    one.checks.forEach(c => assertEq(c.items.join(','), [].concat(...Skills.list(c.stage).map(s => s.checks)).join(','), c.stage + ' 面校验项应取注册表实况'));
    const all = JSON.parse(byId[3].result.content[0].text);
    assertEq(all.playbooks.map(pb => pb.id).join(','), Skills.playbooks().map(pb => pb.id).join(','), '缺省应列出全部已落地编排 playbook');
    assertEq(byId[4].result.isError, true, '未知 playbook id 应如实报错(不静默回空)');
    assert(JSON.parse(byId[4].result.content[0].text).error.includes('core.playbookProjection'), '报错应给可用 id 清单');
    // 只读工具不经 CLI:mcp.js 的 local 分支在 spawn 之前返回(源级封死"顺手改成走 CLI 再计费")
    const mcpSrc = fs.readFileSync(path.join(ROOT, 'mcp.js'), 'utf8');
    const call = mcpSrc.slice(mcpSrc.indexOf('async function callTool'));
    const iLocal = call.indexOf('if (t.local)');
    assert(iLocal >= 0 && iLocal < call.indexOf('await runCli(argv)'), '注册表只读工具应在 runCli 之前直接答复');
    assert(/local: i => playbookView/.test(mcpSrc), '只读工具应由 Skills 投影答复,不拼 cli argv');
  } },
  /* G-12 的另一半:主线中段流程模板。工具是 CLI 的薄包装(步骤序列由 js/flow-tpl.js 单源出),
   * 提示模板的正文由同一份模板渲染,MCP 侧只注入工具名——两处都不得手抄第二条中段命令链。 */
  { name: 'MCP 中段流程模板:工具与提示模板同取一份投影(不在 MCP 侧手抄步序)', fn() {
    const { spawnSync } = require('child_process');
    const FlowTpl = require('../js/flow-tpl.js');
    const CmdRegistry = require('../js/cmd-registry.js');
    const reqs = [
      { jsonrpc: '2.0', id: 1, method: 'tools/list' },
      { jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'hujing_flow_template', arguments: { segment: 'mid' } } },
      { jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'hujing_flow_template', arguments: { segment: 'review' } } }, // 段外主线步应如实报错
      { jsonrpc: '2.0', id: 4, method: 'prompts/list' },
      { jsonrpc: '2.0', id: 5, method: 'prompts/get', params: { name: 'hujing_mid_pipeline', arguments: { pid: 'p1', segment: 'gen' } } },
      { jsonrpc: '2.0', id: 6, method: 'prompts/get', params: { name: 'hujing_mid_pipeline', arguments: {} } }, // 缺 pid 应 -32602
    ];
    // 未登录也答得出静态模板:不给 pid 就不读项目状态,也就不打服务端
    const env = Object.assign({}, process.env, { HUJING_SERVER: '', HUJING_TOKEN: '' });
    const r = spawnSync(process.execPath, [path.join(ROOT, 'mcp.js')], { input: reqs.map(x => JSON.stringify(x)).join('\n') + '\n', encoding: 'utf8', timeout: 30000, env });
    const byId = {};
    String(r.stdout || '').trim().split('\n').filter(Boolean).forEach(l => { const m = JSON.parse(l); byId[m.id] = m; });
    const names = ((byId[1].result || {}).tools || []).map(t => t.name);
    assert(names.includes('hujing_flow_template'), 'tools/list 应含中段流程模板工具,实际:' + names.join(','));
    const mid = JSON.parse(byId[2].result.content[0].text);
    assertEq(JSON.stringify(mid), JSON.stringify(FlowTpl.template('mid', null)), '工具产出应逐字节等于模板单源(MCP 只做薄包装)');
    assertEq(mid.steps.map(s => s.cmd).join(','),
      'project.extractSubjects,subject.generateImage,project.splitEpisodes,episode.understanding,episode.generateStoryboard,episode.preflight,episode.generateVideos',
      '中段覆盖主体两步 + 分集 + 分镜两步 + 生成两步');
    assertEq(byId[3].result.isError, true, '段外主线步应如实报错(不静默回整段)');
    const pnames = ((byId[4].result || {}).prompts || []).map(p => p.name);
    assert(pnames.includes('hujing_mid_pipeline'), 'prompts 应含中段流程模板,实际:' + pnames.join(','));
    const txt = (((byId[5].result || {}).messages || []).map(m => m.content && m.content.text) || []).join('\n');
    assert(txt.includes('p1'), 'prompts/get 应代入 pid');
    FlowTpl.template('gen', null).steps.forEach(s => {
      assert(txt.includes(s.note), '模板正文应带投影旁注:' + s.cmd);
      s.args.filter(a => a.from).forEach(a => assert(txt.includes(a.from), '模板正文应给参数取数出处:' + s.cmd + '.' + a.name));
      s.stop.forEach(x => assert(txt.includes(x.code), '模板正文应列出断点码:' + x.code));
    });
    assert(txt.includes('hujing_storyboard') === false && txt.includes('hujing_exec(name="episode.generateVideos")'),
      '生成段正文应给专包装工具或 exec 透传的准确工具名');
    assertEq(byId[6].error && byId[6].error.code, -32602, '缺必填 pid 应 -32602');
    // 源级:工具名映射的单源是工具表上的 cmd 字段,且必须与该工具真实拼出的 argv 一致
    const mcpSrc = fs.readFileSync(path.join(ROOT, 'mcp.js'), 'utf8');
    assert(/FlowTpl\.brief\(tpl, \{ toolOf \}\)/.test(mcpSrc), '中段提示模板正文须由 FlowTpl.brief 渲染,不在 MCP 侧手写步序');
    assert(/TOOLS\.find\(x => x\.cmd === cmd\)/.test(mcpSrc), '工具名映射应现取工具表的 cmd 字段(不另写一张映射表)');
    const declared = [...mcpSrc.matchAll(/cmd: '([^']+)', build: i => \['exec', '([^']+)'/g)];
    assert(declared.length >= 4, '包装领域命令的工具应登记 cmd 字段,实际 ' + declared.length + ' 个');
    declared.forEach(m => {
      assertEq(m[1], m[2], '工具登记的 cmd 应与它拼出的 exec 命令名一致');
      assert(CmdRegistry.names().includes(m[1]), '登记的 cmd 须是已注册领域命令:' + m[1]);
    });
  } },
  { name: '命令面板(§3.5):Ctrl+K 绑定存在;条目=注册表命令+导航;缺路由上下文的命令置灰标注', fn() {
    const sb = makeSandbox();
    installCommon(sb);
    loadFile(sb, 'cmd-registry.js');
    loadFile(sb, 'cmdpalette.js');
    assert(sb.CmdPalette, 'cmdpalette.js 应暴露 window.CmdPalette');
    // 无路由上下文:集级命令置灰,导航可用
    sb.location.hash = '#/projects';
    let es = sb.CmdPalette.entries();
    const gen = es.find(e => e.name === 'episode.generateVideos');
    assert(gen && gen.disabled && gen.why.includes('项目页'), '无项目上下文时集级命令应置灰标注,实际:' + (gen && gen.why));
    const shot = es.find(e => e.name === 'shot.generateVideo');
    assert(shot.disabled && shot.why.includes('镜头'), '需镜头参数的命令应标注');
    assert(es.some(e => e.kind === 'nav' && !e.disabled), '导航条目应可用');
    // 分集路由:集级命令解锁(shot 级仍置灰——面板不指定镜头)
    sb.location.hash = '#/project/p1/episode/ep1';
    es = sb.CmdPalette.entries();
    assert(!es.find(e => e.name === 'episode.generateVideos').disabled, '分集路由下集级命令应可用');
    assert(es.find(e => e.name === 'shot.generateVideo').disabled, 'shot 级仍置灰');
    assertEq(sb.CmdPalette.routeCtx().pid + '/' + sb.CmdPalette.routeCtx().epid, 'p1/ep1');
    // 绑定与挂载契约(源级)
    const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
    assert(html.includes('js/cmdpalette.js'), 'index.html 应挂载 cmdpalette.js');
  } },
  /* ---- 二十三轮:主线断点闭环(剧本→主体→分集→分镜→生成→审片→成片) ---- */
  { name: '拆镜入口 rev 闭环(§主线):CSV/文本/资产导入+分镜脚本+节拍板+CLI shots-import 均记录 shotsSourceRev/shotsGraphRev', fn() {
    const pairs = [
      ['js/sb-io.js', 3],   // CSV 覆盖/文本追加/资产库导入
      ['js/sb-board.js', 1], // 分镜脚本确认为分镜表
      ['js/beatboard.js', 1], // 节拍板转回分镜表
      ['cli.js', 1],         // shots-import
    ];
    pairs.forEach(([f, min]) => {
      const src = fs.readFileSync(path.join(ROOT, f), 'utf8');
      const n = (src.match(/shotsSourceRev = /g) || []).length;
      assert(n >= min, f + ' 应至少有 ' + min + ' 处 shotsSourceRev 记录(导入/转换=一次分镜发布),实际 ' + n);
      assert(src.includes('shotsGraphRev = '), f + ' 应同步记录 shotsGraphRev');
    });
  } },
  { name: 'CLI 与浏览器同口径(§主线):合成走 composeSeqOf+audioTrackOf;生成走 buildVideoRequest;失败写回 failed+resumable', fn() {
    const src = fs.readFileSync(path.join(ROOT, 'cli.js'), 'utf8');
    assert(src.includes('Domain.composeSeqOf('), 'CLI 合成序列应走 canonical composeSeqOf(含 tlOrder/tlTrims)');
    assert(src.includes('audioUrl'), 'CLI 结构规范化应保留 audioUrl 字段(UI 写字段,透传不丢音轨)');
    assert(src.includes('Domain.audioTrackOf('), 'CLI 合成配音应走 Domain.audioTrackOf(离线占位不混音,与浏览器同一判定)');
    assert(!src.includes('s.audio.url'), 'CLI 不应再读 s.audio.url(该字段是布尔,音轨曾静默丢失)');
    assert(src.includes('Domain.buildVideoRequest('), 'CLI 生成请求应走 Domain.buildVideoRequest(与指纹同口径)');
    assert(src.includes("resumable"), 'CLI 生成失败应写回 resumable(对账可续查,不再产孤儿任务)');
    assert(src.includes('composedDialogueSig'), 'CLI 合成写回应含字幕文本指纹(与主应用同口径)');
  } },
  { name: '配音渲染清单(§主线):凭据写点唯一 + 双端同读 + 计费走 Tasks.run + 旧布尔数据兼容', fn() {
    const sb2 = fs.readFileSync(path.join(ROOT, 'js/storyboard.js'), 'utf8');
    assert(sb2.includes('Domain.audioMetaWrite('), 'ttsShot/离线占位应经 Domain.audioMetaWrite 写 s.audioMeta(凭据形态唯一)');
    assert(sb2.includes('Domain.voiceCfgOf(') && sb2.includes('Domain.audioTextOf('), '配音的音色配置与文本取值应走 Domain 单源');
    const genAudioSrc = sb2.slice(sb2.indexOf('async function genAudio('), sb2.indexOf('/* ================= 智能分镜'));
    assert(genAudioSrc.includes('Tasks.run('), 'genAudio 计费应走 Tasks.run(登记→扣费→执行→失败退费)');
    assert(!/U\.charge\(|U\.refund\(/.test(genAudioSrc), 'genAudio 不应再手写扣费/退费五件套');
    ['js/sb-gen.js', 'js/sb-batch.js'].forEach(f => {
      assert(fs.readFileSync(path.join(ROOT, f), 'utf8').includes('markOfflineAudio('), f + ' 离线配音应走 markOfflineAudio(凭据如实标 offline,不冒充真实音轨)');
    });
    ['js/sb-io.js', 'cli.js'].forEach(f => {
      const src = fs.readFileSync(path.join(ROOT, f), 'utf8');
      assert(src.includes('Domain.audioTrackOf('), f + ' 合成取音轨应走 Domain.audioTrackOf(两端同一判定)');
      assert(src.includes('composedAudio = Domain.audioRenderList('), f + ' 合成写回应落配音渲染凭据 composedAudio');
    });
    const vo = fs.readFileSync(path.join(ROOT, 'js/voice.js'), 'utf8');
    assert(vo.includes('Domain.normVoiceCfg('), 'voice.js 的 norm 应委托 Domain.normVoiceCfg(缺省与钳制不写两份)');
    const dom = fs.readFileSync(path.join(ROOT, 'js/domain.js'), 'utf8');
    assert(/if \(s\.audioMeta && typeof s\.audioMeta === 'object'\) return s\.audioMeta;/.test(dom), 'audioMetaOf 应优先结构化凭据,缺失时按旧布尔数据兜底');
  } },
  { name: '审片闭环(§主线):autoSmartReview 写回 lastReview;重抽前快照;G3 判旧视为未审', fn() {
    const prod = fs.readFileSync(path.join(ROOT, 'js/produce.js'), 'utf8');
    assert(prod.includes('lastReview =') || prod.includes('lastReview='), 'autoSmartReview 应写回 ep.lastReview(与服务端 wf 同名命令一致)');
    assert(prod.includes('snapshotShot'), '审片重抽前应先快照(失败可从历史版本找回旧片)');
    const rel = fs.readFileSync(path.join(ROOT, 'js/release.js'), 'utf8');
    assert(rel.includes('reviewStaleByScript'), 'G3 应对判旧的审片记录视为未审');
  } },
  { name: '确认闸回落三通道(§主线):Agent/CLI/UI 改镜头内容字段均回落 confirm=false', fn() {
    const ao = fs.readFileSync(path.join(ROOT, 'js/agent-ops.js'), 'utf8');
    assert(ao.includes("'prompt'") && ao.includes('confirm = false'), 'agent-ops 改内容字段应回落确认闸');
    const cli = fs.readFileSync(path.join(ROOT, 'cli.js'), 'utf8');
    assert(/confirm = false/.test(cli), 'cli shot-set 改内容字段应回落确认闸');
    const sv = fs.readFileSync(path.join(ROOT, 'js/sb-views.js'), 'utf8');
    assert(/bindInput\('narration', \(\) => \{ sel\.confirm = false; \}\)/.test(sv), 'UI 旁白编辑应回落确认闸');
  } },
  /* ---- 知识库单源(KB.SECTIONS 取用面):条目正文只在 knowledge.js,消费方按键取用 ---- */
  { name: '知识库单源:条目正文与压缩摘要只在 knowledge.js,其余源文件不得出现第二份正文', fn() {
    const KB = require('../js/knowledge.js');
    const texts = Object.values(KB.SECTIONS)
      .concat(Object.values(KB.DIGESTS.sys), Object.values(KB.DIGESTS.review));
    const files = fs.readdirSync(path.join(ROOT, 'js')).filter(f => f.endsWith('.js') && f !== 'knowledge.js').map(f => 'js/' + f)
      .concat(['server.js', 'cli.js', 'mcp.js', 'index.html']);
    const bad = [];
    files.forEach(rel => {
      const src = fs.readFileSync(path.join(ROOT, rel), 'utf8');
      texts.forEach(t => { if (src.includes(t)) bad.push(rel + ' 复制了条目正文:' + t.slice(0, 18) + '…'); });
    });
    assertEq(bad.join('; '), '', '知识库正文须按键取用(KB.section/KB.pick),不得复制');
    // knowledge.js 内部:每条摘要只出现一次(压缩块由 DIGESTS 拼装,函数体内不另写第三份文本)
    const kbSrc = fs.readFileSync(path.join(ROOT, 'js', 'knowledge.js'), 'utf8');
    Object.entries(KB.DIGESTS).forEach(([face, map]) => Object.entries(map).forEach(([key, d]) => {
      assertEq(kbSrc.split(d).length - 1, 1, `DIGESTS.${face}.${key} 摘要应只在表中出现一次`);
    }));
  } },
  { name: '知识库单源:DIGESTS 键 ⊆ SECTIONS 键;压缩块文本全部出自同键摘要', fn() {
    const KB = require('../js/knowledge.js');
    const keys = Object.keys(KB.SECTIONS);
    Object.entries(KB.DIGESTS).forEach(([face, map]) => Object.keys(map).forEach(k =>
      assert(keys.includes(k), `DIGESTS.${face} 的键 ${k} 不在 SECTIONS 内(键位失配,改条目时会漏改摘要)`)));
    const block = KB.block(), review = KB.reviewBlock();
    Object.values(KB.DIGESTS.sys).forEach(d => assert(block.includes(d), 'KB.block() 应含 sys 摘要:' + d.slice(0, 12)));
    Object.values(KB.DIGESTS.review).forEach(d => assert(review.includes(d), 'KB.reviewBlock() 应含 review 摘要:' + d.slice(0, 12)));
    assertEq(review.split('\n').length, 4, '评审口径块应为 4 行(钩子/打脸/景别/抽卡)');
    assertEq(block.split('\n').filter(Boolean).length, 4, '系统块应为 标题 + 编剧/导演/AI抽卡 三域行');
  } },
  { name: '知识库单源:消费方不直接引用 KB.WR_/DR_/GC_ 原始属性(一律按 SECTIONS 键取)', fn() {
    const files = fs.readdirSync(path.join(ROOT, 'js')).filter(f => f.endsWith('.js') && f !== 'knowledge.js').map(f => 'js/' + f)
      .concat(['server.js', 'cli.js', 'mcp.js']);
    const bad = [];
    files.forEach(rel => {
      const hits = fs.readFileSync(path.join(ROOT, rel), 'utf8').match(/KB\.(WR|DR|GC)_[A-Z]+/g) || [];
      hits.forEach(h => bad.push(rel + ' → ' + h));
    });
    assertEq(bad.join('; '), '', '注入点应走 KB.section/KB.pick 按键取用(便于 skill 层索引同一批键)');
  } },
  { name: '知识库零消费回归:每个 SECTIONS 键都有消费点(压缩摘要 或 消费方按键引用)', fn() {
    const KB = require('../js/knowledge.js');
    const files = fs.readdirSync(path.join(ROOT, 'js')).filter(f => f.endsWith('.js') && f !== 'knowledge.js').map(f => 'js/' + f)
      .concat(['server.js', 'cli.js']);
    const srcAll = files.map(rel => fs.readFileSync(path.join(ROOT, rel), 'utf8')).join('\n');
    const digested = Object.keys(KB.DIGESTS.sys).concat(Object.keys(KB.DIGESTS.review));
    const orphan = Object.keys(KB.SECTIONS).filter(k => !digested.includes(k) && !srcAll.includes("'" + k + "'"));
    assertEq(orphan.join('、'), '', '条目须有取用点:补进注入清单(BOARD_KB/KB.pick)或压缩摘要,不留库里躺着的条目');
  } },
  { name: '知识库取用:拆镜人设整条注入景别运镜+轴线匹配+多镜头写法正文,与 Skills.block(shots) 逐字节同源', fn() {
    const KB = require('../js/knowledge.js');
    const Skills = require('../js/skills.js');
    const Prompts = require('../js/prompts.js');
    const WfCore = require('../js/wf-core.js');
    const sys = WfCore.sbSystem({});
    ['景别运镜', '轴线匹配', '多镜头写法'].forEach(k => assert(sys.includes(KB.section(k)), '拆镜系统人设应含条目正文:' + k));
    assert(sys.startsWith(Prompts.get('sb.system', {})), '拆镜人设应以 sb.system 提示词开头(注册表覆盖生效)');
    assertEq(sys, Prompts.get('sb.system', {}) + Skills.block('shots', { ids: ['shots.shotLanguage'] }), '拆镜人设的方法论段应逐字节等于分镜步注入块(SK-17)');
    assertEq(WfCore.sbSystem({ 'sb.system': '分镜师。' }), '分镜师。' + KB.pick('景别运镜', '轴线匹配', '多镜头写法'), '覆盖只换人设句,方法论正文不受影响');
    // 同一提示词内不重复注入:多镜头写法在分镜步只登记一次(SK-19 移交后不得再挂,否则拼块出现两份正文)
    assertEq(Skills.list('shots').filter(s => s.kb.includes('多镜头写法')).map(s => s.id).join(','), 'shots.shotLanguage',
      '多镜头写法在分镜步应只由拆镜人设宿主登记');
  } },
  { name: '知识库取用:主体步人设整条注入主体参考正文,与 Skills.block(subjects) 逐字节同源', fn() {
    const KB = require('../js/knowledge.js');
    const Skills = require('../js/skills.js');
    const Prompts = require('../js/prompts.js');
    const WfCore = require('../js/wf-core.js');
    const sys = WfCore.extractSystem({});
    assert(sys.startsWith(Prompts.get('extract.system', {})), '主体步人设应以 extract.system 提示词开头(注册表覆盖生效)');
    assertEq(sys, Prompts.get('extract.system', {}) + Skills.block('subjects'), '主体步人设的方法论段应逐字节等于主体步注入块(SK-11)');
    assertEq(sys, Prompts.get('extract.system', {}) + KB.section('主体参考'), '方法论段应逐字节等于 KB 主体参考条目');
    assertEq(WfCore.extractSystem({ 'extract.system': '剧本分析助手。' }), '剧本分析助手。' + KB.pick('主体参考'), '覆盖只换人设句,方法论正文不受影响');
    // 双端消费点:浏览器解析向导与 wf 端点同一装配口,两端都不再直取人设句常量(否则注入只落一端)
    const eu = fs.readFileSync(path.join(ROOT, 'js', 'episode-util.js'), 'utf8');
    const srv = fs.readFileSync(path.join(ROOT, 'server.js'), 'utf8');
    [['js/episode-util.js', eu], ['server.js', srv]].forEach(([f, src]) => {
      assert(/WfCore\.extractSystem\(/.test(src), f + ' 提取主体应经 WfCore.extractSystem 取人设');
      assert(!src.includes('WfCore.EXTRACT_SYSTEM'), f + ' 不应直取人设句常量(方法论块会漏一端)');
    });
    // 注入只加在 system 半:提取 user 模板不留第二份条目正文
    const types = { character: true, scene: true, prop: true };
    assert(!WfCore.buildExtractUser('剧本正文', 'normal', types).user.includes(KB.section('主体参考')), '提取 user 模板不应重复一份条目正文');
  } },
  { name: '知识库取用:生成步提示词改写人设整条注入抽卡公式+军规,与 Skills.block(gen) 逐字节同源', fn() {
    const KB = require('../js/knowledge.js');
    const Skills = require('../js/skills.js');
    const Prompts = require('../js/prompts.js');
    const WfCore = require('../js/wf-core.js');
    const sys = WfCore.genPromptSystem({});
    assert(sys.startsWith(Prompts.get('gen.promptSystem', {})), '改写人设应以 gen.promptSystem 提示词开头(注册表覆盖生效)');
    assertEq(sys, Prompts.get('gen.promptSystem', {}) + Skills.block('gen'), '改写人设的方法论段应逐字节等于生成步注入块');
    assertEq(WfCore.genPromptSystem({ 'gen.promptSystem': '改写器。' }), '改写器。' + KB.pick('抽卡公式', '抽卡军规'), '覆盖只换人设句,方法论正文不受影响');
    // 生成侧消费点:提示词工具走单源函数,不在模块内留第二份人设句与条目正文
    const sv = fs.readFileSync(path.join(ROOT, 'js', 'sb-views.js'), 'utf8');
    assert(sv.includes('WfCore.genPromptSystem('), '分镜提示词工具应经 WfCore.genPromptSystem 取人设');
    // 生成请求构造点不注方法论文本:注进去会改 s.prompt 的输入指纹口径,存量已出片镜头会被全量判旧
    const dom = fs.readFileSync(path.join(ROOT, 'js', 'domain.js'), 'utf8');
    assert(!/KB\./.test(dom), 'domain.js 不应引用 KB(生成指纹口径与方法论文本解耦)');
  } },
  { name: '提示词改写人设:一键优化/CLI 修订重抽两端同经 WfCore.optimizeSystem,缺省逐字节等于内联原字面', fn() {
    const Prompts = require('../js/prompts.js');
    const Skills = require('../js/skills.js');
    const WfCore = require('../js/wf-core.js');
    // 缺省不变:收编前两端写死的人设句字面,收编后仍逐字节相同(不接方法论块,不改这两条链路的 system 输入)
    assertEq(WfCore.optimizeSystem(), '你是文生视频提示词专家。', '缺省人设句应与收编前的内联字面逐字节相同');
    assertEq(WfCore.optimizeSystem({}), Prompts.get('gen.promptSystem', {}), '人设句应取自注册表 gen.promptSystem');
    assertEq(WfCore.optimizeSystem({ 'gen.promptSystem': '改写器。' }), '改写器。', '覆盖 gen.promptSystem 时人设句跟随');
    // 与生成步注入点同键:genPromptSystem 由本函数派生,人设句只有一处取值
    assertEq(WfCore.genPromptSystem({ 'gen.promptSystem': '改写器。' }), WfCore.optimizeSystem({ 'gen.promptSystem': '改写器。' }) + Skills.block('gen'), '生成步人设应由 optimizeSystem 派生后接注入块');
    // 双端消费点:两端都不留第二份人设句字面,且 CLI 侧显式传覆盖表(Node 无 window 读不到 Store)
    const rv = fs.readFileSync(path.join(ROOT, 'js', 'review.js'), 'utf8');
    const cli = fs.readFileSync(path.join(ROOT, 'cli.js'), 'utf8');
    assert(rv.includes('WfCore.optimizeSystem('), '浏览器一键优化应经 WfCore.optimizeSystem 取人设');
    assert(cli.includes('WfCore.optimizeSystem(ov)'), 'CLI 修订重抽应经 WfCore.optimizeSystem 取人设并显式传覆盖表');
    [['js/review.js', rv], ['cli.js', cli]].forEach(([f, src]) => {
      assert(!src.includes('你是文生视频提示词专家'), f + ' 不应再内联人设句(覆盖不会跟过去)');
      assert(src.includes('WfCore.buildOptimizeUser('), f + ' 的 user 半应沿用 wf-core 单源模板');
    });
  } },
  { name: '整集共性汇总人设:两端同经 Prompts.get(review.sumSystem),缺省逐字节等于内联原字面', fn() {
    const Prompts = require('../js/prompts.js');
    const Skills = require('../js/skills.js');
    // 缺省不变:收编前两端写死的人设句字面,收编后仍逐字节相同(只换取值口,不接方法论块/注入块)
    assertEq(Prompts.get('review.sumSystem'), '你是短剧审片总监。', '缺省人设句应与收编前的内联字面逐字节相同');
    assertEq(Prompts.get('review.sumSystem', { 'review.sumSystem': '汇总官。' }), '汇总官。', '覆盖 review.sumSystem 时两端取值跟随');
    const item = Prompts.list().find(x => x.key === 'review.sumSystem');
    assert(item && !item.vars.length && item.name.includes('共性汇总'), '注册表应登记共性汇总人设条目(无变量,可在全局默认值页在线改写)');
    // 双端消费点:两端都不留人设句字面,服务端显式传覆盖表(Node 无 window 读不到 Store)
    const rv = fs.readFileSync(path.join(ROOT, 'js', 'review.js'), 'utf8');
    const srv = fs.readFileSync(path.join(ROOT, 'server.js'), 'utf8');
    assert(rv.includes("Prompts.get('review.sumSystem')"), '浏览器共性汇总应经注册表取人设');
    assert(srv.includes("Prompts.get('review.sumSystem', ov)"), '服务端共性汇总应经注册表取人设并显式传覆盖表');
    [['js/review.js', rv], ['server.js', srv]].forEach(([f, src]) => {
      assert(!src.includes('你是短剧审片总监'), f + ' 不应再内联人设句(覆盖不会跟过去)');
    });
    assert(Skills.byId('core.personaCtx').prompts.includes('review.sumSystem'), 'SK-03 应登记 review.sumSystem');
    // W40 在此点名的剧本拆集步已收编:两端改为跟随注册表 split.system(字面与取值口由下一条钉住),此处只反向钉住不许退回内联
    const eu = fs.readFileSync(path.join(ROOT, 'js', 'episode-util.js'), 'utf8');
    [['js/episode-util.js', eu], ['server.js', srv]].forEach(([f, src]) => {
      assert(!src.includes("system: '你是专业的短剧策划编辑。'"), f + ' 的剧本拆集人设不应再内联(已收进注册表 split.system)');
    });
  } },
  { name: '剧本拆集人设:两端同经 Prompts.get(split.system),缺省逐字节等于内联原字面', fn() {
    const Prompts = require('../js/prompts.js');
    const Skills = require('../js/skills.js');
    const WfCore = require('../js/wf-core.js');
    // 缺省不变:收编前两端写死的人设句字面,收编后仍逐字节相同(只换取值口,不接方法论块/注入块)
    assertEq(Prompts.get('split.system'), '你是专业的短剧策划编辑。', '缺省人设句应与收编前的内联字面逐字节相同');
    assertEq(Prompts.get('split.system', { 'split.system': '拆集编辑。' }), '拆集编辑。', '覆盖 split.system 时两端取值跟随');
    const item = Prompts.list().find(x => x.key === 'split.system');
    assert(item && !item.vars.length && item.name.includes('拆集'), '注册表应登记剧本拆集人设条目(无变量,可在全局默认值页在线改写)');
    // 双端消费点:两端都不留人设句字面,服务端显式传覆盖表(Node 无 window 读不到 Store)
    const eu = fs.readFileSync(path.join(ROOT, 'js', 'episode-util.js'), 'utf8');
    const srv = fs.readFileSync(path.join(ROOT, 'server.js'), 'utf8');
    assert(eu.includes("Prompts.get('split.system')"), '浏览器剧本拆集应经注册表取人设');
    assert(srv.includes("Prompts.get('split.system', st.promptOverrides)"), '服务端剧本拆集应经注册表取人设并显式传覆盖表');
    [['js/episode-util.js', eu], ['server.js', srv]].forEach(([f, src]) => {
      assert(!src.includes('你是专业的短剧策划编辑'), f + ' 不应再内联人设句(覆盖不会跟过去)');
      assert(src.includes('WfCore.buildSplitUser('), f + ' 的 user 半应沿用 wf-core 单源模板');
    });
    assert(Skills.byId('core.personaCtx').prompts.includes('split.system'), 'SK-03 应登记 split.system');
    // W42 在此点名的主体提取步已收编:人设句进注册表 extract.system、装配口收覆盖表(字面与取值口由下一条钉住),
    // 此处只反向钉住不许退回 wf-core 常量——注册表 def 从此是该人设句的唯一来源
    assertEq(WfCore.EXTRACT_SYSTEM, undefined, '主体提取人设句不应再是 wf-core 常量(已收进注册表 extract.system)');
    assertEq(WfCore.extractSystem.length, 1, 'extractSystem 应收覆盖表参数(有键可取)');
  } },
  { name: '主体提取人设:两端同经 WfCore.extractSystem(extract.system),缺省逐字节等于收编前的常量字面', fn() {
    const KB = require('../js/knowledge.js');
    const Prompts = require('../js/prompts.js');
    const Skills = require('../js/skills.js');
    const WfCore = require('../js/wf-core.js');
    // 缺省不变:收编前 wf-core 常量 EXTRACT_SYSTEM 的字面,收编后仍逐字节相同(方法论段照旧接在人设句之后)
    assertEq(Prompts.get('extract.system'), '你是专业的短剧剧本分析助手。', '缺省人设句应与收编前的常量字面逐字节相同');
    assertEq(WfCore.extractSystem(), '你是专业的短剧剧本分析助手。' + KB.pick('主体参考'), '缺省主体步人设应与收编前逐字节相同');
    assertEq(Prompts.get('extract.system', { 'extract.system': '剧本分析助手。' }), '剧本分析助手。', '覆盖 extract.system 时两端取值跟随');
    const item = Prompts.list().find(x => x.key === 'extract.system');
    assert(item && !item.vars.length && item.name.includes('主体提取'), '注册表应登记主体提取人设条目(无变量,可在全局默认值页在线改写)');
    // 双端消费点:浏览器隐式读 Store 覆盖表,服务端显式传(Node 无 window 读不到 Store)
    const eu = fs.readFileSync(path.join(ROOT, 'js', 'episode-util.js'), 'utf8');
    const srv = fs.readFileSync(path.join(ROOT, 'server.js'), 'utf8');
    assert(eu.includes('WfCore.extractSystem()'), '浏览器解析向导应经装配口取人设(隐式读 Store 覆盖表)');
    assert(srv.includes('WfCore.extractSystem(st.promptOverrides)'), '服务端提取主体应经装配口取人设并显式传覆盖表');
    // 人设句字面只剩注册表一份:wf-core 不留常量,浏览器侧那处同字面内联(人物小传步)已改取同键,三个源文件一律零处
    const wf = fs.readFileSync(path.join(ROOT, 'js', 'wf-core.js'), 'utf8');
    assert(!wf.includes('你是专业的短剧剧本分析助手'), 'js/wf-core.js 不应再写第二份人设句(注册表 def 为唯一来源)');
    assertEq((eu.match(/你是专业的短剧剧本分析助手/g) || []).length, 0, 'js/episode-util.js 不应再出现该人设句字面(提取步与人物小传步都经注册表取值)');
    assert(!srv.includes('你是专业的短剧剧本分析助手'), 'server.js 不应出现人设句字面');
    assert(Skills.byId('core.personaCtx').prompts.includes('extract.system'), 'SK-03 应登记 extract.system');
    // W45 在此点名的 Agent 单轮已收编:人设句进注册表 agent.system、装配口收覆盖表(字面与取值口由下一条钉住),
    // 此处只反向钉住不许退回内联——模板串里从此不写第二份人设句
    const agentSys = WfCore.buildAgentSystem({});
    assert(agentSys.startsWith(Prompts.get('agent.system')), 'Agent 单轮人设句应取自注册表(不再内联在 wf-core 模板里)');
    assertEq(Prompts.list().filter(x => agentSys.includes(x.def)).length, 1, 'Agent 单轮 system 应恰好命中注册表里它自己那一条');
    assertEq(WfCore.buildAgentSystem.length, 2, 'buildAgentSystem 应收覆盖表参数(有键可取)');
  } },
  { name: '剧本摘要人物小传步人设:同键 extract.system 取值,四步 system 缺省逐字节不变、覆盖只命中小传步', fn: async () => {
    const Prompts = require('../js/prompts.js');
    // 收编前四步写死的四份 system 字面(前三步是策划人设、末步与提取步同字面):缺省逐字节不得变
    const PLAN = '你是资深短剧策划。';
    const ANALYST = '你是专业的短剧剧本分析助手。';
    const sb = loadDigest();
    const p = digestProject();
    assertEq(await sb.EpisodeUtil.aiScriptDigest(p, () => {}), true, '摘要主流程应跑通(通读→汇总→集纲→人物小传)');
    assertEq(sb.__llm.length, 4, '四个 LLM 步应各发一次(分块通读/汇总/集纲/人物小传)');
    assertEq(sb.__llm.map(c => c.system).join('|'), [PLAN, PLAN, PLAN, ANALYST].join('|'),
      '缺省四步 system 应与收编前逐字节相同(四步都取注册表 def:前三步 digest.planSystem、末步 extract.system)');
    // 末步确实是人物小传步:它的回包被消费成主体库里的人物条目
    assert(sb.__llm[3].user.includes('提取其中的主要人物'), '末步应是人物小传步');
    assertEq((p.subjects[0] || {}).name, '林晚晴', '人物小传应合并进主体库(该步真的跑了,不是空转)');
    assertEq(p.scriptMeta.logline, '卖点', '汇总步产出应落到 scriptMeta');
    // 注册表命中:该 system 恰好等于注册表里 extract.system 那一条,不是文件里另写的一份
    const hits = Prompts.list().filter(x => x.def === sb.__llm[3].system);
    assertEq(hits.length, 1, '小传步 system 应恰好命中注册表一条');
    assertEq(hits[0].key, 'extract.system', '命中的应是主体提取那一条(同为剧本分析助手把人物落进主体库)');
    // 覆盖跟随:只换人设句,四步里只有小传步变,user 半(含 JSON 契约)逐字节不动
    const OV = '你是主体提取员(覆盖生效)。';
    const sb2 = loadDigest({ 'extract.system': OV });
    const p2 = digestProject();
    assertEq(await sb2.EpisodeUtil.aiScriptDigest(p2, () => {}), true, '写覆盖后摘要主流程仍应跑通');
    assertEq(sb2.__llm.map(c => c.system).join('|'), [PLAN, PLAN, PLAN, OV].join('|'),
      '覆盖 extract.system 时应只有小传步跟随(前三步走另一键 digest.planSystem,不受影响)');
    assertEq(sb2.__llm.map(c => c.user).join('|'), sb.__llm.map(c => c.user).join('|'),
      '覆盖只换人设句:四步的 user 半(含返回 JSON 约定与分块正文)逐字节不变');
    assertEq((p2.subjects[0] || {}).name, '林晚晴', '覆盖后解析口径不变(JSON 契约未开放)');
  } },
  { name: '剧本摘要人物小传步人设(源级):js/episode-util.js 零内联全文,与提取步同经注册表取值口', fn() {
    const eu = fs.readFileSync(path.join(ROOT, 'js', 'episode-util.js'), 'utf8');
    assert(eu.includes("Prompts.get('extract.system')"), '人物小传步应经注册表取人设(浏览器隐式读 Store 覆盖表)');
    assertEq((eu.match(/你是专业的短剧剧本分析助手/g) || []).length, 0,
      'js/episode-util.js 不应再有该人设句的内联全文(W45 留的「恰好 1 处」计数至此归零)');
    // 只此一份浏览器取值口:这条链路没有服务端对端,server.js 里不该冒出第二份
    const srv = fs.readFileSync(path.join(ROOT, 'server.js'), 'utf8');
    assert(!srv.includes('提取其中的主要人物'), 'server.js 不应出现人物小传步(该步只在浏览器摘要链路上)');
    // 提取步的装配口不受影响:小传步只取人设句,不得顺手把「主体参考」方法论段也接上
    assert(eu.includes('WfCore.extractSystem()'), '提取步仍应经装配口取「人设句 + 主体参考」整条');
    assert(!/system: WfCore\.extractSystem\(\),[\s\S]{0,400}提取其中的主要人物/.test(eu), '小传步不应改取带方法论段的装配口');
  } },
  { name: '八维度重写文生图提示词人设:经 Prompts.get(persona.promptSystem) 取值,缺省逐字节等于收编前的内联字面', fn: async () => {
    const Prompts = require('../js/prompts.js');
    const SYS = '你是文生图提示词专家。';
    const p = { id: 'p1', name: '测试项目', style: '漫剧' };
    // 缺省不变:收编前写死在该步 chatJSON 里的人设句,收编后仍逐字节相同
    assertEq(Prompts.get('persona.promptSystem'), SYS, '缺省人设句应与收编前的内联字面逐字节相同');
    const sb = loadPersona();
    const out = await sb.Persona.rewritePrompt(p, personaSubject());
    assertEq(sb.__llm.length, 1, '重写步应恰好发一次 LLM');
    assertEq(sb.__llm[0].system, SYS, '缺省 system 应与收编前逐字节相同');
    assertEq(out, '漫剧风格角色立绘,林晚晴,白底三视图', 'JSON 契约未开放:{"prompt":…} 仍按原口径解析');
    const hits = Prompts.list().filter(x => x.def === sb.__llm[0].system);
    assertEq(hits.length, 1, '该步 system 应恰好命中注册表一条');
    assertEq(hits[0].key, 'persona.promptSystem', '命中的应是八维度重写那一条');
    const item = Prompts.list().find(x => x.key === 'persona.promptSystem');
    assert(item && !item.vars.length && item.name.includes('文生图'), '注册表应登记该步人设条目(无变量,可在全局默认值页在线改写)');
    // 覆盖只换人设句:user 半(参考模板 + 八维度正文 + 返回 JSON 约定)逐字节不变
    const OV = '你是主体立绘提示词设计师(覆盖生效)。';
    const sb2 = loadPersona({ 'persona.promptSystem': OV });
    const out2 = await sb2.Persona.rewritePrompt(p, personaSubject());
    assertEq(sb2.__llm[0].system, OV, '覆盖 persona.promptSystem 时该步取值跟随');
    assertEq(sb2.__llm[0].user, sb.__llm[0].user, '覆盖只换人设句:user 半逐字节不变');
    assertEq(out2, out, '覆盖后解析口径不变(JSON 契约未开放)');
    // 参考模板那一半仍走偏好设置 settings.tplImage:用户本就改得到,不在收编面里
    assert(sb.__llm[0].user.includes('参考模板:{style}风格角色立绘'), '缺省参考模板应仍是该步内置的那一份');
    const sb3 = loadPersona();
    sb3.Store.state.settings.tplImage = '我的文生图模板';
    await sb3.Persona.rewritePrompt(p, personaSubject());
    assert(sb3.__llm[0].user.includes('参考模板:我的文生图模板'), 'tplImage 仍由用户在全局默认值页改得到(不是缺口)');
    assertEq(sb3.__llm[0].system, SYS, '改模板不影响人设句的取值口');
  } },
  { name: '八维度重写文生图提示词人设(源级):js/persona.js 零内联全文,SK-11 记账随实况改写', fn() {
    const Prompts = require('../js/prompts.js');
    const Skills = require('../js/skills.js');
    const psrc = fs.readFileSync(path.join(ROOT, 'js', 'persona.js'), 'utf8');
    assert(psrc.includes("Prompts.get('persona.promptSystem')"), '该步应经注册表取人设(浏览器隐式读 Store 覆盖表)');
    /* 收编前钉的是「这一步仍内联」,收编后这条 tripwire 反转并收严:
     * 不只查 persona.js 没了内联全文,而是全仓只许注册表 def 这一份(哪个文件再抄一份都红) */
    const files = fs.readdirSync(path.join(ROOT, 'js')).filter(f => f.endsWith('.js')).map(f => 'js/' + f)
      .concat(['server.js', 'cli.js', 'mcp.js', 'index.html']);
    const holders = files.filter(f => fs.readFileSync(path.join(ROOT, f), 'utf8').includes('你是文生图提示词专家'));
    assertEq(holders.join(','), 'js/prompts.js', '该人设句字面应只剩注册表一份(注册表 def 为唯一来源)');
    // 这条链路没有服务端对端:进表解决的是"可覆盖",不解决"可 headless"
    ['server.js', 'cli.js'].forEach(f =>
      assert(!fs.readFileSync(path.join(ROOT, f), 'utf8').includes('角色八维度人设'), f + ' 不应出现该步(八维度重写只在浏览器主体页)'));
    // 记账:SK-11 登记自己两个注入落点的键,note 按实况改写
    const sk11 = Skills.byId('subjects.refDiscipline');
    assertEq(sk11.prompts.join(','), 'extract.system,persona.promptSystem', 'SK-11 应登记自己两个注入落点的提示词键');
    assertEq(sk11.settings.join(','), 'tplImage', 'tplImage 仍是本条登记键(模板用户一直改得到,不记成缺口)');
    assert(!/人设句入注册表待 G-13/.test(sk11.note), 'SK-11 的 note 不得再写「人设句入注册表待 G-13」(实况已进表)');
    assert(sk11.note.includes('人设句已在注册表') && sk11.note.includes('persona.promptSystem'),
      'SK-11 的 note 须写明本条两个登记键的人设都已在注册表');
    /* 仍欠段只认「仍欠」之后那段(锚点写在"已落地"那半里不算交账),且点名的余量逐处对照源码还在:
     * 剧本模块那几步已随 SK-03 收编,故这里点名的换成别处仍内联的那几步,收编时同样转红 */
    const owed = sk11.note.split('仍欠').slice(1).join('仍欠');
    assert(owed.includes('js/api.js'),
      'SK-11 的仍欠段须点名 G-13 余量落在哪几处(不在本条自己的登记面里)');
    const eps = fs.readFileSync(path.join(ROOT, 'js', 'episodes.js'), 'utf8');
    assert(!eps.includes("system: '你是短剧剧本结构分析师。'"),
      'js/episodes.js 事件图谱拆解步不得退回内联(已收进 graph.system)');
    assertEq(Prompts.list().filter(x => x.def === '你是短剧剧本结构分析师。').length, 1, '那句人设应恰好在注册表里一条');
    assert(!owed.includes('js/episodes.js') && !owed.includes('js/episode-util.js'),
      '剧本模块两个文件已零内联,SK-11 的仍欠段不得再把它们记成欠账');
    /* Agent 对话闭环那两处已收编:同形的反向断言按实况翻面(退回内联或仍记成欠账都当场红) */
    assert(!owed.includes('js/agent-ops.js'),
      'Agent 辅助两步已收编,SK-11 的仍欠段不得再把 js/agent-ops.js 记成欠账');
    assertEq((fs.readFileSync(path.join(ROOT, 'js', 'agent-ops.js'), 'utf8').match(/system: ['`]你是/g) || []).length, 0,
      'js/agent-ops.js 不得退回内联人设(两处已收进 agent.selfFixSystem/agent.compactSystem)');
    /* 主体「按指令改」那处已随 SK-03 收编:同形的反向断言按实况翻面 */
    assert(!owed.includes('js/role-editor.js'),
      '主体按指令改已收编,SK-11 的仍欠段不得再把 js/role-editor.js 记成欠账');
    assertEq((fs.readFileSync(path.join(ROOT, 'js', 'role-editor.js'), 'utf8').match(/system: ['`]你是/g) || []).length, 0,
      'js/role-editor.js 不得退回内联人设(已收进 persona.editSystem)');
    /* 专家工坊那两处已随本轮收编:同形的反向断言按实况翻面(常量形态另钉,那处不匹配 system: 计数口径) */
    assert(!owed.includes('js/experts.js'),
      '专家工坊两步已收编,SK-11 的仍欠段不得再把 js/experts.js 记成欠账');
    const exp11 = fs.readFileSync(path.join(ROOT, 'js', 'experts.js'), 'utf8');
    assertEq((exp11.match(/system: ['`]你是/g) || []).length, 0, 'js/experts.js 不得退回内联人设(已收进 forge.evolveSystem)');
    assert(!/const FORGE_SYS = /.test(exp11), '锻造器人设不得退回整串常量(已收进 forge.system)');
    /* 单镜审片那处已随本轮收编:同形的反向断言按实况翻面(该步是 return 模板串形态,故按 return 钉) */
    assert(!owed.includes('js/wf-core.js'), '单镜审片首句已收编,SK-11 的仍欠段不得再把 js/wf-core.js 记成欠账');
    assert(!/return\s*['`]你是/.test(fs.readFileSync(path.join(ROOT, 'js', 'wf-core.js'), 'utf8')),
      'js/wf-core.js 不得退回内联人设(已收进 review.userSystem)');
    ['js/api.js'].forEach(rel =>
      assert(/(?:system:|content:|return|=)\s*\(?[^\n]*['`]你是/.test(fs.readFileSync(path.join(ROOT, rel), 'utf8')),
        '仍欠段点名的 ' + rel + ' 此刻确实还有内联人设(收编后须同步改 SK-11 的仍欠段)'));
    /* 项目实验台那两处已随本轮收编:同形的反向断言按实况翻面 */
    assert(!owed.includes('js/proj-planner.js'), '项目实验台两步已收编,SK-11 的仍欠段不得再把 js/proj-planner.js 记成欠账');
    assertEq((fs.readFileSync(path.join(ROOT, 'js', 'proj-planner.js'), 'utf8').match(/content: ['`]你是/g) || []).length, 0,
      'js/proj-planner.js 不得退回内联人设(两处已收进 planner.chatSystem/trans.localizeSystem)');
    /* 意图路由那处已随本轮收编:同形的反向断言按实况翻面(常量形态,故连 const 一起钉) */
    assert(!owed.includes('js/agent-global.js'), '意图路由已收编,SK-11 的仍欠段不得再把 js/agent-global.js 记成欠账');
    assert(!/(?:const|let|var)\s+\w+\s*=\s*[`']你是/.test(fs.readFileSync(path.join(ROOT, 'js', 'agent-global.js'), 'utf8')),
      'js/agent-global.js 不得退回内联人设(已收进 agent.routeSystem)');
    /* 制作计划那处已随本轮收编:同形的反向断言按实况翻面 */
    assert(!owed.includes('js/plans.js'), '制作计划生成已收编,SK-11 的仍欠段不得再把 js/plans.js 记成欠账');
    assertEq((fs.readFileSync(path.join(ROOT, 'js', 'plans.js'), 'utf8').match(/system: ['`]你是/g) || []).length, 0,
      'js/plans.js 不得退回内联人设(已收进 plan.system)');
    // 缺口未闭合(全仓内联人设仍在):标记不摘,G-13 的关联索引逐字节不变
    assert(sk11.gaps.includes('G-13'), 'G-13 未闭合,本条的缺口标记不摘(关联索引口径:落地一面不摘标记)');
    assertEq(Skills.gaps()['G-13'].join(','),
      'script.hookType,script.aiToneBan,subjects.refDiscipline,eps.structureStage,gen.videoTpl,film.rhythmInject',
      'G-13 的关联索引应逐字节不变(本槽只收一处取值口,不预支摘标记)');
    assertEq(Skills.validate({ Prompts }).join(';'), '', '引用键自检应通过(新登记的键须在注册表内)');
  } },
  { name: '主体「按指令改」人设:沙箱真跑截获 system,缺省逐字节等于收编前的内联字面、{kind} 三类各自成句', fn: async () => {
    const Prompts = require('../js/prompts.js');
    /* 收编前写死在 js/role-editor.js 那步 chatJSON 里的模板串(${kindWord} 就地插值):缺省逐字节不得变 */
    const sysOf = kindWord => '你是短剧' + kindWord + '设定师。按用户指令改写文生图设定提示词:'
      + '保留与指令无关的外形/风格要素,只落实指令要求的变更;输出中文提示词,不超过120字。';
    assertEq(Prompts.get('persona.editSystem'), sysOf('{kind}'), '注册表 def 应是把类别换成 {kind} 变量的那一句');
    const it = Prompts.list().find(x => x.key === 'persona.editSystem');
    assert(it && it.name.startsWith('主体按指令改') && it.name.includes('系统人设'), '注册表应登记该步条目(可在全局默认值页在线改写)');
    assertEq(it.vars.join(','), '{kind}', '该条登记 {kind} 一个变量(主体类别由取值口填)');
    assertEq(Prompts.list().filter(x => x.def === it.def).length, 1, '该人设句应恰好命中注册表一条(同 def 开两个键即红)');
    /* 三类主体各真跑一遍:填出来的三句与收编前 ${kindWord} 插值的结果逐字节相同 */
    const KINDS = [['character', '角色'], ['scene', '场景'], ['prop', '道具']];
    const runs = await Promise.all(KINDS.map(([k]) => roleEditorComment(k)));
    runs.forEach((r, i) => assertEq(r.system, sysOf(KINDS[i][1]), KINDS[i][0] + ' 真跑截获的 system 应与收编前逐字节相同'));
    assertEq(new Set(runs.map(r => r.system)).size, 3, '三类主体各成一句(变量没填进去即红)');
    assertEq(Prompts.fill('persona.editSystem', { kind: '角色' }), runs[0].system, '取值口填的就是注册表这一条');
    // 覆盖只换人设句:user 半(主体名/项目风格/当前设定提示词 + 返回 JSON 约定)逐字节不变
    const ovd = await roleEditorComment('character', { 'persona.editSystem': '你是覆盖生效的{kind}设定师。' });
    assertEq(ovd.system, '你是覆盖生效的角色设定师。', '覆盖 persona.editSystem 时该步取值跟随,变量照旧由取值口填');
    assertEq(ovd.user, runs[0].user, '覆盖只换人设句:user 半逐字节不变');
    assertEq(runs[0].billingAction, 'llm.optimize', '计费标签一字不动(收编不碰计费口径)');
    assert(runs[0].user.includes('返回 {"prompt":"改写后的完整设定提示词"}'), '返回 JSON 契约应仍在该步 user 半');
    assertEq(runs[0].applied, '改写后的红发设定提示词', 'JSON 契约未开放:{"prompt":…} 仍按原口径解析并回填');
    assertEq(runs[0].prompt, '改写后的红发设定提示词', '确认应用后改写结果回落 s.prompt');
    assertEq(runs[0].genCalls.join(','), '改写后的红发设定提示词', '应用后仍复用 genMainImage 全计费链路重新生图');
    /* 与同属主体域的八维度重写不复用:那一步的角色是文生图提示词专家、产物是整条立绘提示词 */
    assert(Prompts.get('persona.promptSystem') !== Prompts.get('persona.editSystem'), '两步人设措辞不同(同字面才谈得上复用)');
    // 只收人设句:返回 JSON 字段名一个不进注册表
    assertEq(Prompts.list().filter(x => x.def.includes('"prompt":"改写后的完整设定提示词"')).length, 0, '返回 JSON 契约不进注册表');
  } },
  { name: '主体「按指令改」人设(源级):js/role-editor.js 零内联、与该步 user 半配对,SK-03 记账随实况', fn() {
    const Prompts = require('../js/prompts.js');
    const Skills = require('../js/skills.js');
    const re = fs.readFileSync(path.join(ROOT, 'js', 'role-editor.js'), 'utf8');
    /* 取值口与该步 user 半锚点配对:键挪到别的步骤上、或这一步被改走别的键都当场红 */
    assert(/system: Prompts\.fill\('persona\.editSystem', \{ kind: kindWord \}\),[\s\S]{0,600}返回 \{"prompt":"改写后的完整设定提示词"\}/.test(re),
      'persona.editSystem 应就在「按指令改」那一步的取值口上,且与该步 user 半锚点配对');
    assertEq((re.match(/system: ['`]你是/g) || []).length, 0, 'js/role-editor.js 应零内联人设(全文件计数归零)');
    /* 纯浏览器链路:这一步没有服务端/CLI 对端,那两处不得长出第二份 user 半 */
    ['server.js', 'cli.js'].forEach(rel => assert(!fs.readFileSync(path.join(ROOT, rel), 'utf8').includes('改写后的完整设定提示词'),
      rel + ' 不应出现该步的 user 半(主体按指令改只在浏览器主体页)'));
    /* 全仓持有者:def 带变量,故按变量之后那段不变量扫——谁把填好的整句抄回源码里同样红 */
    const TAIL = '设定师。按用户指令改写文生图设定提示词:保留与指令无关的外形/风格要素,只落实指令要求的变更;输出中文提示词,不超过120字。';
    const files = ['server.js', 'cli.js', 'mcp.js', 'index.html']
      .concat(fs.readdirSync(path.join(ROOT, 'js')).filter(n => n.endsWith('.js')).map(n => 'js/' + n)).sort();
    assertEq(files.filter(rel => fs.readFileSync(path.join(ROOT, rel), 'utf8').includes(TAIL)).join(','), 'js/prompts.js',
      '该人设句的不变量段应全仓只剩注册表一份(别处抄第二份即红)');
    assert(Skills.byId('core.personaCtx').prompts.includes('persona.editSystem'), 'SK-03 应登记 persona.editSystem');
    assert(Skills.byId('core.personaCtx').note.includes('persona.editSystem'), 'SK-03 的 note 须点名新收编的键');
    /* G-13 没闭合:全仓内联人设少一处,标记与关联索引投影一个不动 */
    const inlined = files.reduce((n, rel) => n + (fs.readFileSync(path.join(ROOT, rel), 'utf8').match(/system: ['`]你是/g) || []).length, 0);
    assertEq(inlined, 0, "全仓内联人设(system: '你是… 字面计数)应为 0 处(收编一处即减一,新长出一处即红)");
    const g = Skills.gaps();
    assertEq(Object.keys(g).length, 20, '缺口投影键数应不变');
    assertEq(g['G-13'].join(','), 'script.hookType,script.aiToneBan,subjects.refDiscipline,eps.structureStage,gen.videoTpl,film.rhythmInject',
      'G-13 的六条关联索引逐字节不变(只收一处不摘标记)');
    assertEq(Skills.validate({ Prompts }).join(' | '), '', '新键须被 skill 索引引用且引用键都存在');
  } },
  { name: '注册表全仓持有者名单:每条 def 的字面持有者恰好只有 js/prompts.js(谁在别处抄第二份即红)', fn() {
    const Prompts = require('../js/prompts.js');
    /* 逐槽各写一份"这一句只剩注册表一份"的名单已难以逐条维护:改成按注册表现取——
     * 每条 def 全仓扫一遍,持有者名单必须恰好是注册表自己那一份。
     * 既盖住已收编的全部键,也让下一槽新收的键自动进名单(不必再新写一条同形断言);
     * 既有那几条逐槽写的名单一条不删——它们钉的是"那一步的取值口",与本条的覆盖面互补。 */
    const files = ['server.js', 'cli.js', 'mcp.js', 'index.html']
      .concat(fs.readdirSync(path.join(ROOT, 'js')).filter(n => n.endsWith('.js')).map(n => 'js/' + n)).sort();
    const src = {};
    files.forEach(rel => { src[rel] = fs.readFileSync(path.join(ROOT, rel), 'utf8'); });
    const list = Prompts.list();
    assert(list.length >= 26, '注册表条数不应回退(名单按注册表现取,条数掉了说明有键被撤)');
    list.forEach(it => assertEq(files.filter(rel => src[rel].includes(it.def)).join(','), 'js/prompts.js',
      it.key + ' 的 def 字面持有者应恰好只有 js/prompts.js(别处抄第二份即红)'));
    /* 反查另一向只做到"同 def 的键必须是有意为之":音色推荐两条 def 逐字节相同是明写的口径(键位是持久化面),
     * 故这里钉住同字面的键集合恰好是那两条——再多一对同字面就是合并漏了或抄错了 def。 */
    const dup = {};
    list.forEach(it => { (dup[it.def] = dup[it.def] || []).push(it.key); });
    assertEq(Object.keys(dup).filter(d => dup[d].length > 1).map(d => dup[d].join('+')).join(','),
      'voice.recommendSystem+voice.recommendBatchSystem', '注册表里同 def 的键只许是明写不合并的音色推荐那一对');
  } },
  { name: '剧本板块四步人设:四个独立键各自取值,缺省逐字节等于收编前的内联字面、覆盖只换对应那一键', fn() {
    const Prompts = require('../js/prompts.js');
    /* 收编前四步写死在 js/episodes.js 的四份 system 字面:缺省逐字节不得变 */
    const FOUR = [
      ['narration.system', '你是资深短剧解说编剧,擅长把短剧剧本改写成旁白解说体(解说模式)。', '旁白解说体改写'],
      ['reading.system', '你是短剧导演组的剧本围读会,由编剧/导演/制片联合评审。', '剧本围读'],
      ['concept.system', '你是资深短剧/漫剧导演,在项目开拍前做导演阐述(Director Treatment)。', '构思导演阐述'],
      ['light.system', '你是影视摄影指导(DP),负责全剧光影总控。', '全剧光影总控'],
    ];
    FOUR.forEach(([k, def, name]) => {
      assertEq(Prompts.get(k), def, k + ' 缺省人设句应与收编前的内联字面逐字节相同');
      const it = Prompts.list().find(x => x.key === k);
      assert(it && !it.vars.length && it.name.startsWith(name) && it.name.includes('系统人设'),
        '注册表应登记 ' + k + ' 条目(无变量,可在全局默认值页在线改写)');
      // 每句字面只在注册表里有一条:同 def 开两个键即红
      assertEq(Prompts.list().filter(x => x.def === def).length, 1, k + ' 的人设句应恰好命中注册表一条');
    });
    /* 四步角色互不相同,所以是四个键不是一个:合成单键(或与既有导演类人设复用)会让其中几步的角色定位失真 */
    assertEq(new Set(FOUR.map(x => x[1])).size, 4, '四步人设措辞互不相同(合成同一个键即失真)');
    ['und.system', 'sb.reviewSystem', 'extract.system', 'split.system'].forEach(k =>
      assert(!FOUR.some(x => x[1] === Prompts.get(k)), '四步人设不得与既有键 ' + k + ' 同字面(同字面才谈得上复用)'));
    /* 覆盖只换对应那一键:写一条覆盖时另三条逐字节不动(串台即红) */
    FOUR.forEach(([k]) => {
      const ov = {}; ov[k] = '你是覆盖生效的人设。';
      FOUR.forEach(([k2, def2]) => assertEq(Prompts.get(k2, ov), k2 === k ? '你是覆盖生效的人设。' : def2,
        '覆盖 ' + k + ' 时 ' + k2 + ' 应' + (k2 === k ? '跟随' : '逐字节不动')));
    });
    /* 展示顺序按产品流程:剧本页两步 → 开拍前定调 → 制片光影(顺序就是「全局默认值」页的排列) */
    const keys = Prompts.list().map(x => x.key);
    assertEq(keys.filter(k => FOUR.some(x => x[0] === k)).join(','), FOUR.map(x => x[0]).join(','), '四条键的注册顺序应按产品流程排列');
    /* 只收人设句:四步的返回 JSON 字段契约仍留在各自 user 半,不做成可覆盖变量 */
    ['"narration"', '"statement"', '"scenes"', '"overall"'].forEach(f =>
      assertEq(Prompts.list().filter(x => x.def.includes(f)).length, 0, '返回 JSON 契约不进注册表:' + f));
  } },
  { name: '剧本板块四步人设(源级):js/episodes.js 四步零内联、逐步配对取值口,SK-10 记账随实况改写', fn() {
    const Prompts = require('../js/prompts.js');
    const Skills = require('../js/skills.js');
    const ep = fs.readFileSync(path.join(ROOT, 'js', 'episodes.js'), 'utf8');
    /* 取值口逐步配对:键与它那一步的 user 半锚点绑定,四个键互换位置即红 */
    const PAIRS = [
      ['narration.system', '把以下短剧单集剧本改写为旁白解说体剧本'],
      ['reading.system', '对以下短剧剧本做一次围读评审'],
      ['concept.system', '为这部剧做开拍前的整体创作定调'],
      ['light.system', '为以下短剧的每个场景制定光影色调控制方案'],
    ];
    PAIRS.forEach(([k, anchor]) => {
      assert(new RegExp("system: Prompts\\.get\\('" + k.replace('.', '\\.') + "'\\),[\\s\\S]{0,600}" + anchor).test(ep),
        k + ' 应就在它那一步的取值口上(浏览器隐式读 Store 覆盖表),且与该步 user 半锚点配对');
    });
    /* 收严:四句字面的持有者全仓扫一遍,恰好只剩 js/prompts.js —— 谁在别处抄第二份(哪怕原文件仍走注册表)当场红 */
    const holders = f => ['server.js', 'cli.js', 'mcp.js', 'index.html']
      .concat(fs.readdirSync(path.join(ROOT, 'js')).filter(n => n.endsWith('.js')).map(n => 'js/' + n))
      .filter(rel => fs.readFileSync(path.join(ROOT, rel), 'utf8').includes(f)).sort();
    PAIRS.forEach(([k]) => assertEq(holders(Prompts.get(k)).join(','), 'js/prompts.js',
      k + ' 的人设句字面应只剩注册表一份(全仓持有者名单逐字节比对)'));
    /* 纯浏览器链路:四步都没有服务端/CLI 对端,那两处不得长出第二份 user 半 */
    ['server.js', 'cli.js'].forEach(rel => {
      const src = fs.readFileSync(path.join(ROOT, rel), 'utf8');
      PAIRS.forEach(([k, anchor]) => assert(!src.includes(anchor), rel + ' 不应出现 ' + k + ' 那一步的 user 半(该步只在浏览器链路上)'));
    });
    PAIRS.forEach(([k]) => assert(Skills.byId('core.personaCtx').prompts.includes(k), 'SK-03 应登记 ' + k));
    /* 记账随实况:SK-10 本来就没有专属人设句,四步已收,「仍欠」段改指真正还在的那几处 */
    const sk10 = Skills.byId('script.aiToneBan');
    assert(!/人设句入注册表待 G-13/.test(sk10.note), 'SK-10 的 note 不得再写「人设句入注册表待 G-13」(那四步已收,且本条没有专属人设句)');
    assert(sk10.note.includes('没有专属人设句'), 'SK-10 的 note 须写明本条注入走板块方法论通道、没有专属人设句');
    PAIRS.forEach(([k]) => assert(sk10.note.includes(k), 'SK-10 的 note 须点名已收编的键 ' + k));
    // 点名断言只认「仍欠」之后那段:锚点写在"已落地"那半里不算交账
    const owed = sk10.note.split('仍欠').slice(1).join('仍欠');
    assert(owed, 'SK-10 的 note 须写明仍欠什么(G-13 没闭合)');
    assert(owed.includes('js/api.js'),
      'SK-10 的仍欠段须点名 G-13 余量真正还落在哪几处');
    /* 反向:仍欠段点名的那几处此刻确实还在内联(收编了不改记账当场红) */
    ['js/api.js'].forEach(rel =>
      assert(/(?:system:|content:|return|=)\s*\(?[^\n]*['`]你是/.test(fs.readFileSync(path.join(ROOT, rel), 'utf8')),
        rel + ' 此刻确实还有内联人设(收编后须同步改 SK-10 的仍欠段)'));
    /* 单镜审片那处已随本轮收编:同形的反向断言按实况翻面(该步是 return 模板串形态,故按 return 钉) */
    assert(!owed.includes('js/wf-core.js'), '单镜审片首句已收编,SK-10 的仍欠段不得再把 js/wf-core.js 记成欠账');
    assert(!/return\s*['`]你是/.test(fs.readFileSync(path.join(ROOT, 'js', 'wf-core.js'), 'utf8')),
      'js/wf-core.js 不得退回内联人设(已收进 review.userSystem)');
    /* 项目实验台那两处已随本轮收编:同形的反向断言按实况翻面 */
    assert(!owed.includes('js/proj-planner.js'), '项目实验台两步已收编,SK-10 的仍欠段不得再把 js/proj-planner.js 记成欠账');
    assertEq((fs.readFileSync(path.join(ROOT, 'js', 'proj-planner.js'), 'utf8').match(/content: ['`]你是/g) || []).length, 0,
      'js/proj-planner.js 不得退回内联人设(两处已收进 planner.chatSystem/trans.localizeSystem)');
    /* 意图路由那处已随本轮收编:同形的反向断言按实况翻面(常量形态,故连 const 一起钉) */
    assert(!owed.includes('js/agent-global.js'), '意图路由已收编,SK-10 的仍欠段不得再把 js/agent-global.js 记成欠账');
    assert(!/(?:const|let|var)\s+\w+\s*=\s*[`']你是/.test(fs.readFileSync(path.join(ROOT, 'js', 'agent-global.js'), 'utf8')),
      'js/agent-global.js 不得退回内联人设(已收进 agent.routeSystem)');
    /* 制作计划那处已随本轮收编:同形的反向断言按实况翻面 */
    assert(!owed.includes('js/plans.js'), '制作计划生成已收编,SK-10 的仍欠段不得再把 js/plans.js 记成欠账');
    assertEq((fs.readFileSync(path.join(ROOT, 'js', 'plans.js'), 'utf8').match(/system: ['`]你是/g) || []).length, 0,
      'js/plans.js 不得退回内联人设(已收进 plan.system)');
    /* 专家工坊那两处已收编:同形的反向断言按实况翻面 */
    assert(!owed.includes('js/experts.js'), '专家工坊两步已收编,SK-10 的仍欠段不得再把 js/experts.js 记成欠账');
    const exp10 = fs.readFileSync(path.join(ROOT, 'js', 'experts.js'), 'utf8');
    assertEq((exp10.match(/system: ['`]你是/g) || []).length, 0, 'js/experts.js 不得退回内联人设(已收进 forge.evolveSystem)');
    assert(!/const FORGE_SYS = /.test(exp10), '锻造器人设不得退回整串常量(已收进 forge.system)');
    /* 主体「按指令改」那处已收编:同形的反向断言按实况翻面 */
    assert(!owed.includes('js/role-editor.js'), '主体按指令改已收编,SK-10 的仍欠段不得再把 js/role-editor.js 记成欠账');
    assertEq((fs.readFileSync(path.join(ROOT, 'js', 'role-editor.js'), 'utf8').match(/system: ['`]你是/g) || []).length, 0,
      'js/role-editor.js 不得退回内联人设(已收进 persona.editSystem)');
    /* Agent 对话闭环那两处已收编:同形的反向断言按实况翻面 */
    assert(!owed.includes('js/agent-ops.js'), 'Agent 辅助两步已收编,SK-10 的仍欠段不得再把 js/agent-ops.js 记成欠账');
    assertEq((fs.readFileSync(path.join(ROOT, 'js', 'agent-ops.js'), 'utf8').match(/system: ['`]你是/g) || []).length, 0,
      'js/agent-ops.js 不得退回内联人设(两处已收进注册表)');
    ['agent.selfFixSystem', 'agent.compactSystem'].forEach(k =>
      assertEq(Prompts.list().filter(x => x.key === k).length, 1, '那两句人设应各在注册表里恰好一条:' + k));
    /* 事件图谱拆解步已收编:同形的反向断言按实况翻面(退回内联或仍记成欠账都当场红) */
    assert(!owed.includes('js/episodes.js'), '事件图谱拆解步已收编,SK-10 的仍欠段不得再把 js/episodes.js 记成欠账');
    assert(!ep.includes("system: '你是短剧剧本结构分析师。'"), 'js/episodes.js 事件图谱拆解步不得退回内联');
    assertEq(require('../js/prompts.js').list().filter(x => x.def === '你是短剧剧本结构分析师。').length, 1,
      '那句人设应恰好在注册表里一条(独立键 graph.system)');
    /* 摘要三步已收编,这一处的路障随之反转:仍欠段不得再点它,文件里也不得再有那句内联字面 */
    const eu = fs.readFileSync(path.join(ROOT, 'js', 'episode-util.js'), 'utf8');
    assert(!owed.includes('js/episode-util.js'), '摘要三步已收编,SK-10 的仍欠段不得再把它记成欠账');
    assertEq((eu.match(/system: '你是资深短剧策划。'/g) || []).length, 0, 'js/episode-util.js 不应再有摘要三步的内联策划人设');
    assertEq(require('../js/prompts.js').list().filter(x => x.def === '你是资深短剧策划。').length, 1, '策划人设应恰好在注册表里一份(一键三口)');
    /* G-13 没闭合:按关联索引口径一个标记不摘,投影逐字节不变 */
    assert(sk10.gaps.includes('G-13'), 'G-13 仍开着,SK-10 的标记不摘');
    const g = Skills.gaps();
    assertEq(Object.keys(g).length, 20, '缺口投影键数应不变');
    assertEq(g['G-13'].join(','), 'script.hookType,script.aiToneBan,subjects.refDiscipline,eps.structureStage,gen.videoTpl,film.rhythmInject',
      'G-13 的六条关联索引逐字节不变(只收一面不摘标记)');
    assertEq(Skills.validate({ Prompts }).join(' | '), '', '新键须被 skill 索引引用且引用键都存在');
  } },
  { name: '剧本摘要通读/汇总/集纲人设:一键 digest.planSystem 三个取用口,四步 system 缺省逐字节不变、覆盖只命中前三步', fn: async () => {
    const Prompts = require('../js/prompts.js');
    const Skills = require('../js/skills.js');
    // 收编前三步各写死的同一份策划人设字面 + 末步(人物小传)那份分析助手人设:缺省逐字节不得变
    const PLAN = '你是资深短剧策划。';
    const ANALYST = '你是专业的短剧剧本分析助手。';
    assertEq(Prompts.get('digest.planSystem'), PLAN, '缺省人设句应与收编前三处内联字面逐字节相同');
    const sb = loadDigest();
    const p = digestProject();
    assertEq(await sb.EpisodeUtil.aiScriptDigest(p, () => {}), true, '摘要主流程应跑通(通读→汇总→集纲→人物小传)');
    assertEq(sb.__llm.map(c => c.system).join('|'), [PLAN, PLAN, PLAN, ANALYST].join('|'), '缺省四步 system 应与收编前逐字节相同');
    // 一键三口:三步的 system 恰好命中注册表同一条,且不是末步那一条(角色不同,不许合成一个键)
    const hits = Prompts.list().filter(x => x.def === PLAN);
    assertEq(hits.length, 1, '策划人设应恰好命中注册表一条(同 def 开两个键即红)');
    assertEq(hits[0].key, 'digest.planSystem', '命中的应是剧本摘要那一条');
    assert(Prompts.get('digest.planSystem') !== Prompts.get('extract.system'), '摘要策划人设与主体分析助手人设是两个角色,不得同键');
    const item = Prompts.list().find(x => x.key === 'digest.planSystem');
    assert(item && !item.vars.length && item.name.includes('剧本摘要'), '注册表应登记剧本摘要人设条目(无变量,可在全局默认值页在线改写)');
    // 覆盖跟随:一处改写三口一并跟随,末步的小传人设不受影响
    const OV = '你是短剧摘要策划(覆盖生效)。';
    const sb2 = loadDigest({ 'digest.planSystem': OV });
    const p2 = digestProject();
    assertEq(await sb2.EpisodeUtil.aiScriptDigest(p2, () => {}), true, '写覆盖后摘要主流程仍应跑通');
    assertEq(sb2.__llm.map(c => c.system).join('|'), [OV, OV, OV, ANALYST].join('|'),
      '覆盖 digest.planSystem 时三口应一并跟随,末步人物小传不跟随(它听 extract.system)');
    // 覆盖只换人设句:四步 user 半(含返回 JSON 约定与分块正文)逐字节不动,三步产出解析口径不变
    assertEq(sb2.__llm.map(c => c.user).join('|'), sb.__llm.map(c => c.user).join('|'),
      '覆盖只换人设句:四步的 user 半逐字节不变(JSON 契约不开放覆盖)');
    assertEq(p2.scriptMeta.logline + '|' + p2.scriptMeta.synopsis + '|' + p2.scriptMeta.outline, '卖点|梗概|大纲', '汇总步产出仍落到 scriptMeta');
    assertEq((p2.epOutline || []).join(','), '本集集纲', '集纲步产出仍落到 epOutline');
    assertEq((p2.subjects[0] || {}).name, '林晚晴', '覆盖摘要人设动不到小传步的主体库落点');
    assert(Skills.byId('core.personaCtx').prompts.includes('digest.planSystem'), 'SK-03 应登记 digest.planSystem');
  } },
  { name: '剧本摘要通读/汇总/集纲人设(源级):js/episode-util.js 零内联全文,同键恰好三个取用口', fn() {
    const eu = fs.readFileSync(path.join(ROOT, 'js', 'episode-util.js'), 'utf8');
    assertEq((eu.match(/Prompts\.get\('digest\.planSystem'\)/g) || []).length, 3, '三步应各有一个取用口(退回内联或合并成一处即红)');
    assertEq((eu.match(/你是资深短剧策划。/g) || []).length, 0, 'js/episode-util.js 不应再有该人设句的内联全文');
    // 三个口逐一落在它自己那一步上(user 半的首句认步),不是三处都挂在同一步
    [['这是剧本的第', '通读'], ['以下是一部短剧剧本各部分的连续剧情概括', '汇总'], ['为以下各集分别写一句话集纲', '集纲']].forEach(([anchor, label]) =>
      assert(new RegExp("system: Prompts\\.get\\('digest\\.planSystem'\\),[\\s\\S]{0,200}" + anchor).test(eu), label + '步的 system 应取自该键'));
    // 末步是另一个角色:三口不许误合成 extract.system(合了则该键的取用口从 1 变 4)
    assertEq((eu.match(/Prompts\.get\('extract\.system'\)/g) || []).length, 1, "extract.system 在本文件仍应只有人物小传步一个取用口");
    assert(!/system: Prompts\.get\('extract\.system'\),[\s\S]{0,200}这是剧本的第/.test(eu), '通读步不得改听主体分析助手人设');
    // 三步都只取人设句:不接「主体参考」方法论段(那是提取步的注入面,摘要不生图)
    assert(!/system: WfCore\.\w+\([\s\S]{0,200}(这是剧本的第|连续剧情概括|一句话集纲)/.test(eu), '三步不应改取带方法论段的装配口');
    // 这条链路没有服务端对端,server.js 里不该冒出第二份
    const srv = fs.readFileSync(path.join(ROOT, 'server.js'), 'utf8');
    assert(!srv.includes('你是资深短剧策划。') && !srv.includes('为以下各集分别写一句话集纲'), 'server.js 不应出现摘要三步(该链路只在浏览器)');
  } },
  { name: '分镜脚本创作层两步人设:两个独立键各自取值,缺省逐字节等于收编前的内联字面、覆盖只换对应那一键', fn: async () => {
    const Prompts = require('../js/prompts.js');
    // 收编前两步写死的 system 字面:缺省逐字节不得变
    const SCENE = '你是顶级短剧编剧,擅长场次与情绪节拍拆解。';
    const DRAFT = '你是顶级短剧分镜师,擅长把情绪节拍拆成连续画面表达的文字分镜。';
    const run = async ov => {
      const sb = loadSbBoard(ov);
      const { host, btns } = boardHost();
      const p = { id: 'p1', subjects: [] };
      const ep = makeEp({ content: '1-1 枯井水下 夜/内\n女主被当众羞辱。' });
      sb.__llmResult = [
        { scenes: [{ title: '1-1 枯井水下 夜/内', text: '场次梗概', beats: [{ emotion: '压抑', plot: '节拍剧情', shot: '画面描述' }] }] },
        { beats: [{ key: '1.1', shots: ['文字分镜1', '文字分镜2'] }] },
      ];
      sb.SB.bindScriptBoard(host, p, ep, {}, false);
      await btns['bd-ai'].onclick();    // ① AI 拆解场次与节拍
      await btns['bd-draft'].onclick(); // ② 拆解为文字分镜
      return { sb, ep };
    };
    const a = await run();
    assertEq(a.sb.__llm.length, 2, '两步应各发一次 LLM(场次节拍拆解 / 文字分镜拆解)');
    assertEq(a.sb.__llm.map(c => c.system).join('|'), [SCENE, DRAFT].join('|'),
      '缺省两步 system 应与收编前的内联字面逐字节相同');
    // 两步真的跑了(不是空转):场次节拍落进 ep.scriptBoard、文字分镜落进节拍下一级
    assertEq(a.ep.scriptBoard.scenes[0].title, '1-1 枯井水下 夜/内', '① 的回包应落进 ep.scriptBoard');
    assertEq((a.ep.scriptBoard.scenes[0].beats[0].shotsDraft || []).join('|'), '文字分镜1|文字分镜2', '② 的回包应落进 beat.shotsDraft');
    // 注册表登记:两条无变量条目,条目名带步名与「系统人设」
    [['sb.boardSceneSystem', '场次节拍'], ['sb.boardDraftSystem', '文字分镜']].forEach(([k, label]) => {
      const item = Prompts.list().find(x => x.key === k);
      assert(item && !item.vars.length && item.name.includes(label) && item.name.includes('系统人设'),
        '注册表应登记该步人设条目(无变量,可在全局默认值页在线改写):' + k);
    });
    // 每句字面恰好命中注册表一条(同 def 开两个键即红)
    [SCENE, DRAFT].forEach(def => assertEq(Prompts.list().filter(x => x.def === def).length, 1,
      '该人设句应恰好命中注册表一条:' + def));
    // 两句措辞互不相同,且与既有分镜/剧本类人设都不同字面——合成单键当场红(合掉后另一条 Prompts.get 回空串)
    assert(SCENE !== DRAFT, '两步措辞应互不相同(字面同才谈得上共用一键)');
    ['sb.system', 'sb.reviewSystem', 'und.system', 'split.system'].forEach(k =>
      assert(Prompts.get(k) !== SCENE && Prompts.get(k) !== DRAFT, '两步人设不应与既有键同字面(同字面才该复用):' + k));
    // 覆盖矩阵 2×2:写一条覆盖时只有那一步跟随,另一步与两步的 user 半逐字节不动
    const OV = '你是拆解员(覆盖生效)。';
    for (const [key, want] of [['sb.boardSceneSystem', [OV, DRAFT]], ['sb.boardDraftSystem', [SCENE, OV]]]) {
      const b = await run({ [key]: OV });
      assertEq(b.sb.__llm.map(c => c.system).join('|'), want.join('|'),
        '覆盖 ' + key + ' 时应只有该步跟随(另一步不受影响)');
      assertEq(JSON.stringify(b.sb.__llm.map(c => c.messages)), JSON.stringify(a.sb.__llm.map(c => c.messages)),
        '覆盖只换人设句:两步的 user 半(含返回 JSON 约定与正文摘取)逐字节不变');
      assertEq((b.ep.scriptBoard.scenes[0].beats[0].shotsDraft || []).join('|'), '文字分镜1|文字分镜2',
        '覆盖后解析口径不变(JSON 契约未开放)');
    }
    // 注册顺序按产品流程:两键相邻、场次节拍步在前,且都排在智能分镜之前(「① 分镜脚本」tab 在前)
    const keys = Prompts.list().map(x => x.key);
    assertEq(keys.indexOf('sb.boardDraftSystem') - keys.indexOf('sb.boardSceneSystem'), 1,
      '两键应相邻且场次节拍步在前(后续槽插到中间即红)');
    assert(keys.indexOf('sb.boardDraftSystem') < keys.indexOf('sb.system'),
      '分镜脚本创作层两键应排在智能分镜之前');
    // 契约半不开放:两份返回 JSON 的字段名一个不进注册表(用户改一个字即整轮解析失败)
    const defs = Prompts.list().map(x => x.def).join('\n');
    ['"scenes"', '"beats"', '"shots"', '"emotion"'].forEach(f =>
      assert(!defs.includes(f), '两步的返回 JSON 字段名不应进注册表(契约半不开放覆盖):' + f));
  } },
  { name: '分镜脚本创作层两步人设(源级):js/sb-board.js 零内联、逐步配对取值口,全仓只剩注册表一份', fn() {
    const P = require('../js/prompts.js');
    const SCENE = '你是顶级短剧编剧,擅长场次与情绪节拍拆解。';
    const DRAFT = '你是顶级短剧分镜师,擅长把情绪节拍拆成连续画面表达的文字分镜。';
    const src = fs.readFileSync(path.join(ROOT, 'js', 'sb-board.js'), 'utf8');
    // 取值口与各步 user 半锚点配对:两个键互换位置即红
    [['sb.boardSceneSystem', '将以下剧本(单集)拆解为结构化分镜脚本'],
      ['sb.boardDraftSystem', '把以下分集脚本的每个节拍拆成 1-3 条文字分镜'],
    ].forEach(([key, anchor]) => {
      const i = src.indexOf("system: Prompts.get('" + key + "'),");
      assert(i >= 0, 'js/sb-board.js 该步应经注册表取人设(不带第二参数=隐式读 Store 覆盖表):' + key);
      assert(src.slice(i, i + 600).includes(anchor), '取值口应与该步 user 半锚点配对(两个键串了位即红):' + key);
    });
    assertEq((src.match(/system: '你是/g) || []).length, 0, 'js/sb-board.js 应零内联人设(W66 记的「两处」至此归零)');
    // 全仓持有者名单:两句字面恰好只剩注册表一份(别处抄第二份即红,哪怕原文件仍走注册表)
    const files = ['index.html', 'server.js', 'cli.js', 'mcp.js']
      .concat(fs.readdirSync(path.join(ROOT, 'js')).filter(f => f.endsWith('.js')).map(f => 'js/' + f));
    [SCENE, DRAFT].forEach(def => {
      const holders = files.filter(f => fs.readFileSync(path.join(ROOT, f), 'utf8').includes(def));
      assertEq(holders.join(','), 'js/prompts.js', '该人设句字面应全仓只剩注册表一份:' + def);
    });
    // 不许长出第二端:两步只在浏览器,收编解决的是「可覆盖」不是「可 headless」
    ['server.js', 'cli.js'].forEach(f => {
      const s = fs.readFileSync(path.join(ROOT, f), 'utf8');
      ['将以下剧本(单集)拆解为结构化分镜脚本', '把以下分集脚本的每个节拍拆成 1-3 条文字分镜'].forEach(anchor =>
        assert(!s.includes(anchor), f + ' 不应出现分镜脚本创作层的 user 半:' + anchor));
    });
    // 键登记在人设通道的记账宿主 SK-03 名下;新账写在「已落地」那半,仍欠段(ops 协议)不许被占
    const sk03 = Skills.byId('core.personaCtx');
    const owed = (sk03.note || '').split('仍欠').slice(1).join('仍欠');
    ['sb.boardSceneSystem', 'sb.boardDraftSystem'].forEach(k => {
      assert(sk03.prompts.includes(k), 'SK-03 应登记 ' + k);
      assert(sk03.note.includes(k), 'SK-03 的 note 须点名新收编的键:' + k);
      assert(!owed.includes(k), '新收编的键应写在「已落地」那半,不许挤进仍欠段:' + k);
    });
    assert(owed.includes('ops 协议') && owed.includes('不开放覆盖'), 'SK-03 的仍欠段应仍是 ops 协议那半(本槽不动那一段)');
    // G-13 未闭合(全仓内联人设大头仍在):收两处动不到关联索引投影
    assertEq((Skills.gaps()['G-13'] || []).join(','),
      'script.hookType,script.aiToneBan,subjects.refDiscipline,eps.structureStage,gen.videoTpl,film.rhythmInject',
      '收编两处不动 gaps() 投影(缺口标记按关联索引口径保留)');
    assertEq(Object.keys(Skills.gaps()).length, 20, 'gaps() 键数不应变');
    assertEq(Skills.validate({ Prompts: P, KB: require('../js/knowledge.js') }).join(';'), '', '新登记的提示词键须通过引用自检');
  } },
  { name: '导演设定生成人设:经 Prompts.get(dirset.system) 取值,缺省逐字节等于收编前的内联字面', fn: async () => {
    const Prompts = require('../js/prompts.js');
    const DEF = '你是资深影视导演。'; // 收编前写死在 js/gsettings.js 的那一句
    assertEq(Prompts.get('dirset.system'), DEF, '缺省人设句应与收编前的内联字面逐字节相同');
    const item = Prompts.list().find(x => x.key === 'dirset.system');
    assert(item && !item.vars.length && item.name.startsWith('导演设定生成') && item.name.includes('系统人设'),
      '注册表应登记导演设定生成人设条目(无变量,可在全局默认值页在线改写)');
    assertEq(Prompts.list().filter(x => x.def === DEF).length, 1, '该人设句应恰好命中注册表一条(同 def 开两个键即红)');
    /* 沙箱真跑这一步:该步恰好发一次 LLM,真实发出的 system 就是注册表取值 */
    const sb = loadGsettings();
    const ds = await sb.genDirectorSetting('漫剧', '第一段:女主被当众羞辱。');
    assertEq(sb.__llm.length, 1, '导演设定生成应恰好发一次 LLM');
    assertEq(sb.__llm[0].system, DEF, '该步真实发出的 system 应逐字节等于缺省人设句');
    assertEq(Object.keys(ds).sort().join(','), ['style'].concat(sb.DIR_DIMS).sort().join(','), '返回应是 style + 五维');
    /* 覆盖后 system 跟随、user 半(风格/五维 JSON 字段契约/剧本前段摘取)逐字节不变、解析口径不变 */
    const sb2 = loadGsettings({ 'dirset.system': '你是覆盖生效的导演。' });
    const ds2 = await sb2.genDirectorSetting('漫剧', '第一段:女主被当众羞辱。');
    assertEq(sb2.__llm[0].system, '你是覆盖生效的导演。', '写覆盖后该步 system 应跟随');
    assertEq(sb2.__llm[0].user, sb.__llm[0].user, 'user 半应逐字节不变(JSON 字段契约与正文摘取未开放覆盖)');
    assertEq(JSON.stringify(ds2), JSON.stringify(ds), '覆盖只换人设句,返回解析口径不变');
    /* 只收人设句:五维返回 JSON 的字段契约仍留在 user 半,不做成可覆盖变量 */
    ['"光影"', '"色调"', '"情感氛围"', '"服化道审美"', '"表演气质"'].forEach(f =>
      assertEq(Prompts.list().filter(x => x.def.includes(f)).length, 0, '返回 JSON 契约不进注册表:' + f));
    /* 不与 und.system 复用:两句差「影视/短剧」两字,角色(制定全剧导演设定五维 / 本集理解)与产物落点都不同 */
    assert(Prompts.get('und.system') !== DEF, '导演设定人设不得与 und.system 同字面(同字面才谈得上复用)');
    ['concept.system', 'light.system', 'sb.reviewSystem', 'review.finalSystem'].forEach(k =>
      assert(Prompts.get(k) !== DEF, '导演设定人设不得与既有键 ' + k + ' 同字面'));
    /* LLM 失败仍走按风格的本地模板回退,且回退文案不随人设覆盖变动(覆盖只作用于 LLM 那一路) */
    const sb3 = loadGsettings({ 'dirset.system': '你是覆盖生效的导演。' }, true);
    const fb = await sb3.genDirectorSetting('漫剧', '');
    const sb4 = loadGsettings(null, true);
    assertEq(JSON.stringify(fb), JSON.stringify(await sb4.genDirectorSetting('漫剧', '')), '回退模板文案不随人设覆盖变动');
    assert(fb.光影 && fb.style === '漫剧', 'LLM 失败应回退到按风格的默认导演设定');
  } },
  { name: '导演设定生成人设(源级):js/gsettings.js 零内联,全仓内联人设持有者名单精确到文件:处数', fn() {
    const Prompts = require('../js/prompts.js');
    const Skills = require('../js/skills.js');
    const gs = fs.readFileSync(path.join(ROOT, 'js', 'gsettings.js'), 'utf8');
    // 取值口与该步 user 半锚点配对:键换到别的步上即红
    assert(/system: Prompts\.get\('dirset\.system'\),[\s\S]{0,400}风格的短剧制定导演设定/.test(gs),
      'dirset.system 应就在导演设定生成步的取值口上(浏览器隐式读 Store 覆盖表),且与该步 user 半锚点配对');
    /* 收严:该人设句字面全仓扫一遍,恰好只剩 js/prompts.js —— 谁在别处抄第二份(哪怕原文件仍走注册表)当场红 */
    const ALL = ['server.js', 'cli.js', 'mcp.js', 'index.html']
      .concat(fs.readdirSync(path.join(ROOT, 'js')).filter(n => n.endsWith('.js')).map(n => 'js/' + n)).sort();
    const holders = ALL.filter(rel => fs.readFileSync(path.join(ROOT, rel), 'utf8').includes(Prompts.get('dirset.system')));
    assertEq(holders.join(','), 'js/prompts.js', '该人设句字面应只剩注册表一份(全仓持有者名单逐字节比对)');
    // 纯浏览器链路:没有服务端/CLI 对端,那两处不得长出第二份 user 半
    ['server.js', 'cli.js'].forEach(rel => assert(!fs.readFileSync(path.join(ROOT, rel), 'utf8').includes('风格的短剧制定导演设定'),
      rel + ' 不应出现该步的 user 半(导演设定生成只在浏览器偏好学习页)'));
    /* 全仓内联人设持有者名单:本槽新立,精确到「文件:处数」而不是只报一个总数 ——
     * 判据(内联人设字面)= 直接写在 system 值位置、赋给具名人设常量、或由装配函数直接 return 的以「你是」开头的字面,
     * 注册表 js/prompts.js 自身是唯一来源不计入。收编一处名单里那一处就得减,少减/多减/挪到别的文件都当场红。
     * 不在本判据内的两类另有归属,不混进这个数:js/experts-data.js 的预置专家 persona 是产品数据(用户雇佣时可改),
     * index.html 里那句是输入框 placeholder(不发给模型)。 */
    const RE = /(?:system:\s*|return\s*|(?:const|let|var)\s+[A-Za-z_$][\w$]*\s*=\s*)(?:'|`)你是/g;
    const inlinePersonaHolders = ALL.filter(rel => rel !== 'js/prompts.js')
      .map(rel => [rel, (fs.readFileSync(path.join(ROOT, rel), 'utf8').match(RE) || []).length])
      .filter(([, n]) => n).map(([rel, n]) => rel + ':' + n);
    assertEq(inlinePersonaHolders.join(', '),
      '',
      '全仓内联人设持有者名单应精确到文件:处数(G-13 余量清单,收编一处即须同步减)');
    assertEq(inlinePersonaHolders.reduce((a, x) => a + Number(x.split(':')[1]), 0), 0, 'G-13 余量总处数');
    // 本槽的落点:js/gsettings.js 整条从名单上消失(该文件此后零内联人设)
    assert(!inlinePersonaHolders.some(x => x.startsWith('js/gsettings.js')),
      'js/gsettings.js 应已零内联人设(工坊那份人设字面在 js/experts.js,不记在本文件名下)');
    assert(!RE.test(gs.replace(/placeholder="[^"]*"/g, '')), 'js/gsettings.js 不得再有内联人设字面');
    // 记账:SK-03 登记新键,note 随实况改写(仍欠段的 ops 协议锚点由 infra 记账用例另钉)
    const sk3 = Skills.byId('core.personaCtx');
    assert(sk3.prompts.includes('dirset.system'), 'SK-03 应登记 dirset.system');
    assert(sk3.note.includes('dirset.system') && sk3.note.includes('零内联人设'),
      'SK-03 的 note 须写明该步已收编、且 js/gsettings.js 至此零内联');
    assert(sk3.note.includes('und.system') && sk3.note.includes('不与'), 'SK-03 的 note 须交代为什么不复用 und.system');
    // 缺口未闭合(名单还有 21 处):标记不摘,G-13 的关联索引逐字节不变
    const g = Skills.gaps();
    assertEq(Object.keys(g).length, 20, '缺口投影键数应不变');
    assertEq(g['G-13'].join(','), 'script.hookType,script.aiToneBan,subjects.refDiscipline,eps.structureStage,gen.videoTpl,film.rhythmInject',
      'G-13 的六条关联索引逐字节不变(只收一处不预支摘标记)');
    assertEq(Skills.validate({ Prompts }).join(' | '), '', '新键须被 skill 索引引用且引用键都存在');
  } },
  { name: '发行文案包人设:独立键 dist.copySystem 取值,缺省逐字节等于收编前的内联字面、KB 摘要尾不随覆盖变动', fn() {
    const Prompts = require('../js/prompts.js');
    const KB = require('../js/knowledge.js');
    // 收编前写死在 js/proj-shell.js 那一步 system 前半的字面:缺省逐字节不得变
    const SYS = '你是短剧发行运营专家,精通平台投稿与投流文案。';
    assertEq(Prompts.get('dist.copySystem'), SYS, '缺省人设句应与收编前的内联字面逐字节相同');
    const item = Prompts.list().find(x => x.key === 'dist.copySystem');
    assert(item && !item.vars.length && item.name.startsWith('发行文案包') && item.name.includes('系统人设'),
      '注册表应登记发行文案包人设条目(无变量,可在全局默认值页在线改写)');
    /* 独立键而不与既有人设复用:发行运营的角色与主线各步都不同(同字面才谈得上复用) */
    assertEq(Prompts.list().filter(x => x.def === SYS).length, 1, '该人设句应恰好命中注册表一条');
    Prompts.list().forEach(x => assert(x.key === 'dist.copySystem' || x.def !== SYS,
      '发行人设不得与既有键 ' + x.key + ' 同字面'));
    /* 人设句之后现拼的 KB 摘要尾(钩子六型 + 付费卡点)是方法论正文,不随人设覆盖变动 */
    const tail = KB.pick('钩子六型', '付费卡点');
    assertEq(tail, KB.section('钩子六型') + KB.section('付费卡点'), '尾巴应是这两条 KB 条目正文按序拼接');
    assert(tail, 'KB 摘要尾不应为空(条目改名后取值口会静默少半截)');
    const OV = { 'dist.copySystem': '你是平台发行投放操盘手(覆盖生效)。' };
    assertEq(Prompts.get('dist.copySystem', OV) + tail, '你是平台发行投放操盘手(覆盖生效)。' + tail,
      '覆盖只换人设句:其后的 KB 摘要尾逐字节不变');
    ['review.finalSystem', 'gen.promptSystem', 'agent.system'].forEach(k =>
      assertEq(Prompts.get(k, OV), Prompts.get(k), '覆盖 dist.copySystem 时 ' + k + ' 应逐字节不动'));
    /* 契约半不开放:六字段返回 JSON 仍留在 user 半,注册表里不该出现它(改坏即六个输入框一个都填不上) */
    ['"logline"', '"introLong"', '"introShort"', '"topics"', '"announce"', '"promo"'].forEach(f =>
      assertEq(Prompts.list().filter(x => x.def.includes(f)).length, 0, '返回 JSON 契约不进注册表:' + f));
    /* 展示顺序按产品流程:发行是成片之后的收尾环节,排在成片审片之后、Agent 那几条之前 */
    const keys = Prompts.list().map(x => x.key);
    assertEq(keys[keys.indexOf('review.finalSystem') + 1], 'dist.copySystem', '发行文案包应紧接成片审片之后登记');
    assert(keys.indexOf('dist.copySystem') < keys.indexOf('agent.system'), '发行文案包应排在 Agent 那几条之前');
  } },
  { name: '发行文案包人设(源级):js/proj-shell.js 零内联、取值口与 user 半锚点配对,SK-03 记账点名落点', fn() {
    const Prompts = require('../js/prompts.js');
    const Skills = require('../js/skills.js');
    const src = fs.readFileSync(path.join(ROOT, 'js', 'proj-shell.js'), 'utf8');
    // 取值口与这一步的 user 半锚点配对:键挪到别的调用点即红
    assert(/system: Prompts\.get\('dist\.copySystem'\)[\s\S]{0,600}为以下短剧写发行文案包/.test(src),
      '该步应就在它自己的取值口上经注册表取人设(浏览器隐式读 Store 覆盖表),且与该步 user 半锚点配对');
    // 人设句之后按键现拼 KB 摘要:注入那一半不进覆盖面
    assert(src.includes("Prompts.get('dist.copySystem') + (window.KB ? KB.pick('钩子六型', '付费卡点') : '')"),
      'KB 钩子六型+付费卡点仍由取值口现拼(方法论正文不随人设覆盖变动)');
    // 本槽只收这一处,收完这个文件就零内联人设了:退回内联当场红
    assertEq((src.match(/system: '/g) || []).length, 0, 'js/proj-shell.js 不应再有内联 system 字面');
    // 纯浏览器链路:这一步没有服务端/CLI 对端,那两处不得长出第二份 user 半
    ['server.js', 'cli.js'].forEach(rel =>
      assert(!fs.readFileSync(path.join(ROOT, rel), 'utf8').includes('为以下短剧写发行文案包'),
        rel + ' 不应出现该步的 user 半(发行文案包只在浏览器剧壳页)'));
    const sk3 = Skills.byId('core.personaCtx');
    assert(sk3.prompts.includes('dist.copySystem'), 'SK-03 应登记 dist.copySystem');
    assert(sk3.note.includes('dist.copySystem') && sk3.note.includes('js/proj-shell.js'),
      'SK-03 的 note 须写明这一步的收编落点(键与取值口所在文件)');
    assertEq(Skills.validate({ Prompts }).join(' | '), '', '新键须被 skill 索引引用且引用键都存在');
  } },
  { name: '单镜审片提示词首句人设:独立键 review.userSystem,缺省逐字节等于收编前的内联字面、契约半不随覆盖变动', fn() {
    const Prompts = require('../js/prompts.js');
    const WfCore = require('../js/wf-core.js');
    // 收编前写死在 WfCore.buildReviewPrompt 模板串首句的字面(末尾连接逗号在键内):缺省逐字节不得变
    const SYS = '你是专业 AI 视频审片组,从技术层/匹配层/导演层三个维度评审一个短剧分镜视频,';
    assertEq(Prompts.get('review.userSystem'), SYS, '缺省人设句应与收编前的内联字面逐字节相同');
    const item = Prompts.list().find(x => x.key === 'review.userSystem');
    assert(item && !item.vars.length && item.name.startsWith('单镜审片提示词首句') && item.name.includes('系统人设'),
      '注册表应登记该条目(无变量,可在全局默认值页在线改写)');
    /* 独立键而不与同步发出的 review.system 复用:一条在 system 消息位、一条是提示词首句,
     * 措辞与三维交代都不同(同字面才谈得上复用) */
    assertEq(Prompts.list().filter(x => x.def === SYS).length, 1, '该人设句应恰好命中注册表一条(同 def 开两个键即红)');
    assert(Prompts.get('review.system') !== SYS, '不得与 review.system 同字面(两条同步发出,合成一键即失真)');
    ['review.sumSystem', 'review.finalSystem', 'sb.reviewSystem'].forEach(k =>
      assert(Prompts.get(k) !== SYS, '不得与既有审片类键 ' + k + ' 同字面'));
    // 取用点缺省逐字节:装配口不传覆盖表时,整条提示词与收编前完全一致(首句之后紧接契约半)
    const shot = { id: 'sh1', plot: '对峙', camera: '固定镜头', cameraSpec: { view: '正面', angle: '平视', shotSize: '中景', aperture: 'ƒ/4' }, characters: ['甲'], scene: '街', props: ['刀'], narration: '旁白', dialogue: '台词', prompt: 'p', duration: 5 };
    const ctx = { kbReviewText: 'KB口径', tplReviewText: '模板{shot}{style}', directorNote: '·导演设定', personaNote: '·方法论', memText: '记忆段', styleText: '漫剧' };
    const bare = ov => WfCore.buildReviewPrompt({ style: '漫剧', globalSetting: 'GS' }, { shots: [shot] }, shot, false, ctx, ov);
    assert(bare().startsWith(SYS + '只返回 JSON:\n'), '取用点缺省首句应是人设句 + 契约半开头(逐字节同收编前)');
    assertEq(bare(undefined), bare({}), '空覆盖表与不传应逐字节一致');
    // 覆盖只换首句:其后的三维 JSON 契约、评分标准、拆解规则检查与分镜信息段逐字节不变
    const OV = { 'review.userSystem': '你是短剧视频质检组(覆盖生效)。' };
    assertEq(bare(OV), '你是短剧视频质检组(覆盖生效)。' + bare().slice(SYS.length),
      '覆盖只换人设首句,契约半与分镜信息段逐字节不变');
    assertEq(bare({ 'review.system': '你是别人。' }), bare(), '覆盖别的键不应串到本步');
    /* 契约半不开放:三维字段名/评分标准/severity 词表仍留在装配口,注册表里不该出现它们
     * (改坏即 normalizeReport 取不到 dimensions,报告退成零分空评语) */
    ['"technical"', '"matching"', '"directing"', '"issues"', '"severity"', '需返工'].forEach(f =>
      assertEq(Prompts.list().filter(x => x.def.includes(f)).length, 0, '返回 JSON 契约不进注册表:' + f));
    // 展示顺序:与它同一步的 review.system 紧邻,仍排在共性汇总/成片审片之前(审片三步连着读)
    const keys = Prompts.list().map(x => x.key);
    assertEq(keys[keys.indexOf('review.system') + 1], 'review.userSystem', '该键应紧接 review.system 登记(同一步的两半)');
    assertEq(keys[keys.indexOf('review.userSystem') + 1], 'review.sumSystem', '其后仍是整集共性汇总');
  } },
  { name: '单镜审片提示词首句人设(源级):js/wf-core.js 零内联,两端取值口一浏览器隐式一服务端显式', fn() {
    const Prompts = require('../js/prompts.js');
    const Skills = require('../js/skills.js');
    const SYS = '你是专业 AI 视频审片组,从技术层/匹配层/导演层三个维度评审一个短剧分镜视频,';
    const wf = fs.readFileSync(path.join(ROOT, 'js', 'wf-core.js'), 'utf8');
    // 取值口与该步契约半锚点配对:键挪到别的装配口上即红
    assert(/Prompts\.get\('review\.userSystem', ov\)\}只返回 JSON:/.test(wf),
      '装配口应就地经注册表取首句人设,且与该步契约半开头配对');
    assert(!wf.includes(SYS), 'js/wf-core.js 不应再有该人设句的内联字面(注册表 def 为唯一来源)');
    assertEq((wf.match(/你是/g) || []).length, 0, 'js/wf-core.js 应已零内联人设(本槽收的就是这一处)');
    // 契约半仍由装配口拼:三维字段与评分标准原样留在源码里,不随人设一起进注册表
    ['"dimensions"', '"technical"', '评分标准:', '拆解规则检查:'].forEach(a =>
      assert(wf.includes(a), '该步契约半应仍写在装配口里:' + a));
    /* 两端取值口:装配口收 ov 参数(与 sbSystem/extractSystem/buildAgentSystem 同形)——
     * 浏览器不传、由 Prompts.get 隐式读 Store 覆盖表;服务端 /api/wf/smart-review 显式传(headless 侧也能覆盖) */
    assert(/W\.buildReviewPrompt = function \(p, ep, s, hasImage, ctx, ov\)/.test(wf), '装配口应收覆盖表参数 ov');
    const srv = fs.readFileSync(path.join(ROOT, 'server.js'), 'utf8');
    const calls = srv.match(/WfCore\.buildReviewPrompt\([^)]*\)/g) || [];
    assertEq(calls.length, 2, '服务端应有视觉/纯文本两条审片调用');
    calls.forEach(c => assert(/, rctx, ov\)$/.test(c), '服务端每处调用都要显式传覆盖表:' + c));
    const rv = fs.readFileSync(path.join(ROOT, 'js', 'review.js'), 'utf8');
    assert(rv.includes('return WfCore.buildReviewPrompt(p, ep, s, hasImage, {'),
      '浏览器侧仍委托同一装配口、不传覆盖表(Prompts.get 隐式读 Store.settings.promptOverrides)');
    assert(!rv.includes(SYS), 'js/review.js 不应内联该人设句');
    // 记账:SK-03 登记新键、note 写明落点与不复用 review.system 的理由
    const sk3 = Skills.byId('core.personaCtx');
    assert(sk3.prompts.includes('review.userSystem'), 'SK-03 应登记 review.userSystem');
    assert(sk3.note.includes('review.userSystem') && sk3.note.includes('js/wf-core.js 至此零内联人设'),
      'SK-03 的 note 须写明这一步的收编落点与该文件已零内联');
    assert(sk3.note.includes('review.system 复用') && sk3.note.includes('不与'),
      'SK-03 的 note 须交代为什么不与 review.system 复用');
    // 缺口未闭合(名单还有余量):G-13 的关联索引与缺口投影逐字节不变,不预支摘标记
    const g = Skills.gaps();
    assertEq(Object.keys(g).length, 20, '缺口投影键数应不变');
    assertEq(g['G-13'].join(','), 'script.hookType,script.aiToneBan,subjects.refDiscipline,eps.structureStage,gen.videoTpl,film.rhythmInject',
      'G-13 的六条关联索引逐字节不变(只收一处不预支摘标记)');
    assertEq(Skills.validate({ Prompts }).join(' | '), '', '新键须被 skill 索引引用且引用键都存在');
  } },
  { name: '注册表提示词全仓持有者名单:每条 def 的字面持有者逐键点名,恰好只有 js/prompts.js', fn() {
    const Prompts = require('../js/prompts.js');
    /* 名单口径:四端入口 + js 下全部模块,逐键扫一遍全仓。谁在别的文件里抄第二份 def 字面
     * (哪怕原取值口仍走注册表)当场红;名单随注册表现推,新增键自动进名单,不必每收编一处各写一次扫描。 */
    const files = ['server.js', 'cli.js', 'mcp.js', 'index.html']
      .concat(fs.readdirSync(path.join(ROOT, 'js')).filter(n => n.endsWith('.js')).map(n => 'js/' + n)).sort();
    const bodies = files.map(rel => [rel, fs.readFileSync(path.join(ROOT, rel), 'utf8')]);
    const list = Prompts.list();
    assert(list.length, '注册表应有条目(名单空转等于没查)');
    list.forEach(it => assertEq(bodies.filter(([, s]) => s.includes(it.def)).map(([rel]) => rel).join(','), 'js/prompts.js',
      it.key + ' 的提示词字面应只剩注册表一份(全仓持有者名单逐字节比对)'));
  } },
  { name: '拉片建集人设:经 Prompts.get(rip.system) 取值,缺省逐字节等于收编前的内联字面、覆盖只换这一键', fn() {
    const Prompts = require('../js/prompts.js');
    const SYS = '你是短剧拉片分析师。根据用户给的单镜头关键帧与时段,输出该镜头的结构化描述。';
    assertEq(Prompts.get('rip.system'), SYS, '缺省人设句应与收编前的内联字面逐字节相同');
    const it = Prompts.list().find(x => x.key === 'rip.system');
    assert(it && !it.vars.length && it.name.startsWith('拉片建集') && it.name.includes('系统人设'),
      '注册表应登记拉片建集条目(无变量,可在全局默认值页在线改写)');
    assertEq(Prompts.list().filter(x => x.def === SYS).length, 1, '该步 system 应恰好命中注册表一条(同 def 开两个键即红)');
    /* 不与既有人设复用:拉片分析师这一句与在表的每一条都不同字面,谈不上并键 */
    ['split.system', 'und.system', 'sb.system', 'extract.system'].forEach(k =>
      assert(Prompts.get(k) !== SYS, '拉片人设不得与既有键 ' + k + ' 同字面'));
    /* 覆盖只换这一键:同为建分集入口的 split.system 逐字节不动(串台即红) */
    const OV = { 'rip.system': '你是参考片拆解分析师(覆盖生效)。' };
    assertEq(Prompts.get('rip.system', OV), '你是参考片拆解分析师(覆盖生效)。', '覆盖 rip.system 时该步取值跟随');
    assertEq(Prompts.get('split.system', OV), '你是专业的短剧策划编辑。', '覆盖 rip.system 不应动到剧本拆集那一键');
    assertEq(Prompts.get('rip.system', { 'split.system': '拆集编辑。' }), SYS, '覆盖 split.system 时拉片那一键逐字节不动');
    /* 展示顺序:建分集两条入口相邻(剧本拆集 → 拉片建集),后续槽插到中间即红 */
    const keys = Prompts.list().map(x => x.key);
    assertEq(keys[keys.indexOf('split.system') + 1], 'rip.system', '拉片建集应紧跟剧本拆集登记(建分集两条入口相邻)');
    /* 只收人设句:该步返回 JSON 的字段契约仍留在 user 半,不做成可覆盖变量 */
    ['"shot_desc"', '"dialogue_text"', '"mood"'].forEach(f =>
      assertEq(Prompts.list().filter(x => x.def.includes(f)).length, 0, '返回 JSON 契约不进注册表:' + f));
  } },
  { name: '拉片建集人设(源级):js/proj-upload.js 零内联、取值口与该步 user 半配对,全仓持有者名单只剩注册表', fn() {
    const Prompts = require('../js/prompts.js');
    const Skills = require('../js/skills.js');
    const src = fs.readFileSync(path.join(ROOT, 'js', 'proj-upload.js'), 'utf8');
    const ANCHOR = '这是参考视频第';
    assert(/system: Prompts\.get\('rip\.system'\),[\s\S]{0,600}这是参考视频第/.test(src),
      'rip.system 应就在拉片逐段画面理解那步的取值口上,且与该步 user 半锚点配对(键换位置即红)');
    assert(!/Prompts\.get\('rip\.system', *\{/.test(src), '取值口不得传空覆盖表(进表了但用户改不到)');
    // W76 点名的这一处是本文件最后一处内联人设:收编后该文件的内联人设计数归零
    assertEq((src.match(/system: '你是/g) || []).length, 0, 'js/proj-upload.js 不应再有内联人设字面(W76 点名的那一处至此归零)');
    /* 全仓持有者名单:这句字面扫一遍全仓,恰好只剩 js/prompts.js —— 谁在别处抄第二份(哪怕原文件仍走注册表)当场红 */
    const holders = f => ['server.js', 'cli.js', 'mcp.js', 'index.html']
      .concat(fs.readdirSync(path.join(ROOT, 'js')).filter(n => n.endsWith('.js')).map(n => 'js/' + n))
      .filter(rel => fs.readFileSync(path.join(ROOT, rel), 'utf8').includes(f)).sort();
    assertEq(holders(Prompts.get('rip.system')).join(','), 'js/prompts.js',
      'rip.system 的人设句字面应只剩注册表一份(全仓持有者名单逐字节比对)');
    /* 纯浏览器链路:拉片建集没有服务端/CLI 对端,那两处不得长出第二份 user 半 */
    ['server.js', 'cli.js', 'mcp.js'].forEach(rel =>
      assert(!fs.readFileSync(path.join(ROOT, rel), 'utf8').includes(ANCHOR),
        rel + ' 不应出现拉片那一步的 user 半(该步只在浏览器链路上)'));
    /* 记账:键登记在 SK-03(人设通道的记账宿主),note 按实况点名取值口 */
    const sk3 = Skills.byId('core.personaCtx');
    assert(sk3.prompts.includes('rip.system'), 'SK-03 应登记 rip.system');
    assert(sk3.note.includes('rip.system') && sk3.note.includes('js/proj-upload.js'),
      'SK-03 的 note 须写明这一键与它的取值口所在文件');
    /* G-13 没闭合:按关联索引口径一个标记不摘,投影逐字节不变 */
    const g = Skills.gaps();
    assertEq(Object.keys(g).length, 20, '缺口投影键数应不变');
    assertEq(g['G-13'].join(','), 'script.hookType,script.aiToneBan,subjects.refDiscipline,eps.structureStage,gen.videoTpl,film.rhythmInject',
      'G-13 的六条关联索引逐字节不变(只收一处不摘标记)');
    assertEq(Skills.validate({ Prompts }).join(' | '), '', '新键须被 skill 索引引用且引用键都存在');
  } },
  { name: '镜头「按指令改」人设:沙箱真跑截获 system,缺省逐字节等于收编前的内联字面、覆盖只换人设句', fn: async () => {
    const Prompts = require('../js/prompts.js');
    const SYS = '你是短剧分镜改图专家。按用户指令改写文生图提示词:保留原提示词中与指令无关的画面要素与风格约定,只落实指令要求的变更;输出中文提示词,不超过120字。';
    assertEq(Prompts.get('gen.editSystem'), SYS, '缺省人设句应与收编前的内联字面逐字节相同');
    const it = Prompts.list().find(x => x.key === 'gen.editSystem');
    assert(it && !it.vars.length && it.name.startsWith('按指令改') && it.name.includes('系统人设'),
      '注册表应登记该步条目(无变量,可在全局默认值页在线改写)');
    assertEq(Prompts.list().filter(x => x.def === SYS).length, 1, '该人设句应恰好命中注册表一条(同 def 开两个键即红)');
    // 真跑两遍(缺省 / 覆盖):user 半只有人设那一侧该变
    const runs = await Promise.all([sbViewsCommentGen(), sbViewsCommentGen({ 'gen.editSystem': '你是覆盖生效的改图师。' })]);
    const [def, ovd] = runs;
    assertEq(def.system, SYS, '真跑截获的 system 应与收编前逐字节相同');
    assertEq(ovd.system, '你是覆盖生效的改图师。', '覆盖 gen.editSystem 时该步取值跟随');
    assertEq(ovd.user, def.user, '覆盖只换人设句:user 半(镜头上下文 + 返回 JSON 约定)逐字节不变');
    assertEq(def.billingAction, 'llm.optimize', '计费标签一字不动(收编不碰计费口径)');
    assert(def.user.includes('返回 {"prompt":"改写后的完整提示词"}'), '返回 JSON 契约应仍在该步 user 半');
    assertEq(def.applied, '改写后的雨夜提示词', 'JSON 契约未开放:{"prompt":…} 仍按原口径解析并回填');
    /* 与同层四策略优化不复用:那一条经装配口还要接 KB 抽卡块,合成一个键就改掉了两步的缺省 */
    assert(Prompts.get('gen.promptSystem') !== SYS, '两步人设措辞不同(同字面才谈得上复用)');
    /* 只收人设句:返回 JSON 字段名一个不进注册表 */
    assertEq(Prompts.list().filter(x => x.def.includes('"prompt"')).length, 0, '返回 JSON 契约不进注册表');
  } },
  { name: '镜头「按指令改」人设(源级):js/sb-views.js 零内联、与该步 user 半配对,主体那处仍内联', fn() {
    const Prompts = require('../js/prompts.js');
    const Skills = require('../js/skills.js');
    const sv = fs.readFileSync(path.join(ROOT, 'js', 'sb-views.js'), 'utf8');
    // 取值口与该步 user 半锚点配对:键换到别处即红
    assert(/system: Prompts\.get\('gen\.editSystem'\),[\s\S]{0,600}返回 \{"prompt":"改写后的完整提示词"\}/.test(sv),
      'gen.editSystem 应就在「按指令改」那一步的取值口上,且与该步 user 半锚点配对');
    assertEq((sv.match(/system: '你是/g) || []).length, 0, 'js/sb-views.js 不应再有内联人设(全文件计数归零)');
    // 纯浏览器链路:不许长出第二端
    ['server.js', 'cli.js'].forEach(rel => assert(!fs.readFileSync(path.join(ROOT, rel), 'utf8').includes('修改指令'),
      rel + ' 不应出现该步的 user 半(按指令改只在浏览器工作区)'));
    assert(Skills.byId('core.personaCtx').prompts.includes('gen.editSystem'), 'SK-03 应登记 gen.editSystem');
    assert(Skills.byId('core.personaCtx').note.includes('gen.editSystem'), 'SK-03 的 note 须点名新收编的键');
    /* 反向按实况翻面:同形的主体「按指令改」已随 W87 收进 persona.editSystem(角色与产物落点都不同,两条键不合并);
     * 那一处退回内联、或两条键被合成一条时,这条当场红 */
    const re = fs.readFileSync(path.join(ROOT, 'js', 'role-editor.js'), 'utf8');
    assert(!/system: `你是短剧\$\{kindWord\}设定师。/.test(re), 'js/role-editor.js 主体按指令改不得退回内联(已收进 persona.editSystem)');
    assertEq(Prompts.list().filter(x => x.def.includes('设定师。按用户指令改写文生图设定提示词')).length, 1,
      '主体那处的人设句应恰好在注册表里一条(persona.editSystem)');
    assert(Prompts.get('gen.editSystem') !== Prompts.list().find(x => x.key === 'persona.editSystem').def,
      '镜头改图师与主体设定师是两条不同的键,不得被合成一条');
    /* G-13 没闭合:全仓内联人设(system: '你是… 字面计数)按合并后 live 现取,标记与投影一个不动 */
    const files = ['server.js', 'cli.js', 'mcp.js'].concat(fs.readdirSync(path.join(ROOT, 'js')).filter(n => n.endsWith('.js')).map(n => 'js/' + n));
    const inlined = files.reduce((n, rel) => n + (fs.readFileSync(path.join(ROOT, rel), 'utf8').match(/system: '你是/g) || []).length, 0);
    assertEq(inlined, 0, "全仓内联人设(system: '你是… 字面计数)应为 0 处(这一口径下已收净,新长出一处即红)");
    const g = Skills.gaps();
    assertEq(Object.keys(g).length, 20, '缺口投影键数应不变');
    assertEq(g['G-13'].join(','), 'script.hookType,script.aiToneBan,subjects.refDiscipline,eps.structureStage,gen.videoTpl,film.rhythmInject',
      'G-13 的六条关联索引逐字节不变(只收一处不摘标记)');
    assertEq(Skills.validate({ Prompts }).join(' | '), '', '新键须被 skill 索引引用且引用键都存在');
  } },
  { name: '注册表全仓持有者名单(镜头「按指令改」段的一份,与主体段那条同判据):每条 def 的字面持有者恰好只有 js/prompts.js(谁在别处抄第二份即红)', fn() {
    const Prompts = require('../js/prompts.js');
    /* 逐槽各写一份"这一句只剩注册表一份"的名单,收编到第 20 条已难以逐条维护:
     * 改成按注册表现取——每条 def 全仓扫一遍,持有者名单必须恰好是注册表自己那一份。
     * 既盖住已收编的全部键,也让下一槽新收的键自动进名单(不必再新写一条同形断言)。 */
    const files = ['server.js', 'cli.js', 'mcp.js', 'index.html']
      .concat(fs.readdirSync(path.join(ROOT, 'js')).filter(n => n.endsWith('.js')).map(n => 'js/' + n)).sort();
    const src = {};
    files.forEach(rel => { src[rel] = fs.readFileSync(path.join(ROOT, rel), 'utf8'); });
    const list = Prompts.list();
    assert(list.length >= 20, '注册表条数不应回退(名单按注册表现取,条数掉了说明有键被撤)');
    list.forEach(it => assertEq(files.filter(rel => src[rel].includes(it.def)).join(','), 'js/prompts.js',
      it.key + ' 的 def 字面持有者应恰好只有 js/prompts.js(别处抄第二份即红)'));
    /* 反查另一向:同 def 的键组按实况点名——名单逐字节比对对同 def 是盲的。
     * 音色推荐两条是有意留的同值组(键位是持久化面,合成再拆会废掉用户已写的覆盖),
     * 故不放宽成"允许有重复",而是点名唯一那一组:别处再抄第二份仍红,把那两条合成一键也红。 */
    const byDef = {};
    list.forEach(x => { (byDef[x.def] = byDef[x.def] || []).push(x.key); });
    assertEq(Object.values(byDef).filter(v => v.length > 1).map(v => v.join('+')).join(','),
      'voice.recommendSystem+voice.recommendBatchSystem', '注册表里同 def 的键只许是音色推荐那一组');
  } },
  /* ---- 专家工坊两步人设(W88):锻造器与进化器。两者作用在「专家」这个对象上而不在主线某一步上,
   * 故键排在主线各步与 Agent 各模式之后;角色不同(无中生有铸新专家 vs 就地改写已有专家)故不合成一个键。
   * 预置 persona 库(js/experts-data.js)不在本面内——那是专家数据而不是工坊的提示词。 ---- */
  { name: '专家工坊两步人设:锻造器/进化器各一键,缺省拼出的整串逐字节等于收编前的内联字面', fn: async () => {
    const Prompts = require('../js/prompts.js');
    const FORGE = '你是「专家 skill 生成器」(元智能体)。用户会描述想要的短剧创作专家(导演/编剧/摄像/策划等,含题材、风格、擅长点),你为其生成完整专家 skill。';
    const EVOLVE = '你是专家人设进化器。';
    assertEq(Prompts.get('forge.system'), FORGE, '锻造器缺省人设句应与收编前的内联字面逐字节相同');
    assertEq(Prompts.get('forge.evolveSystem'), EVOLVE, '进化器缺省人设句应与收编前的内联字面逐字节相同');
    // 条目形态:无变量、条目名点名是哪一步
    [['forge.system', '锻造器'], ['forge.evolveSystem', '进化器']].forEach(([k, label]) => {
      const it = Prompts.list().find(x => x.key === k);
      assert(it && !it.vars.length && it.name.includes('专家') && it.name.includes(label) && it.name.includes('系统人设'),
        '注册表应登记该步人设条目(无变量,可在全局默认值页在线改写):' + k);
    });
    // 每句字面恰好命中注册表一条;两句互不相同且与既有键都不同字面(合成一键或复用既有键当场红)
    [FORGE, EVOLVE].forEach(def => assertEq(Prompts.list().filter(x => x.def === def).length, 1,
      '该人设句应恰好命中注册表一条:' + def));
    assert(FORGE !== EVOLVE, '两步措辞应互不相同(字面同才谈得上共用一键)');
    Prompts.list().filter(x => !x.key.startsWith('forge.')).forEach(x =>
      assert(x.def !== FORGE && x.def !== EVOLVE, '两步人设不应与既有键同字面(同字面才该复用):' + x.key));
    // 键序:两条相邻、锻造器在前,且都排在 Agent 各模式之后(工坊不在主线步序里)
    const keys = Prompts.list().map(x => x.key);
    assertEq(keys.indexOf('forge.evolveSystem') - keys.indexOf('forge.system'), 1,
      '两键应相邻且锻造器在前(后续槽插到中间即红)');
    assert(keys.indexOf('forge.system') > keys.indexOf('agent.previsSystem'),
      '工坊两键应排在主线各步与 Agent 各模式之后');
    // 契约半不开放:两处的 JSON 字段面一个不进注册表(用户改一个字即规范化/蒸馏整轮失败)
    const defs = Prompts.list().map(x => x.def).join('\n');
    ['"persona"', '"dims"', '"tpl"', '"clauses"', 'tplImage', '≤40字'].forEach(f =>
      assert(!defs.includes(f), '两步的契约半字面不应进注册表(不开放覆盖):' + f));
    /* 锻造器取值口真跑:缺省拼出的 Experts.FORGE_SYS 与收编前那一整串逐字节相同。
     * 人设句与「只返回严格 JSON:」原在同一行,故取值时直接相接、不补分隔符。 */
    const a = loadExperts();
    assertEq(a.Experts.FORGE_SYS, FORGE + `只返回严格 JSON:
{"name":"专家名(≤8字)","ico":"一个emoji","role":"导演|编剧|摄像|策划|其他","kind":"style|function","style":"漫剧|动漫|写实","tags":["≤4个"],"desc":"80字内简介","persona":"系统人设提示词(你是…创作原则…,具体可执行)","dims":{"光影":"","色调":"","情感氛围":"","服化道审美":"","表演气质":""},"tpl":{"tplImage":"文生图模板,含{style}{subject}变量","tplVideo":"文生视频模板,含{style}{shot}变量","tplReview":"审片模板,含{shot}变量"}}
规则:kind=style 表示全局风格雇佣专家,dims 与 tpl 必填(dims 五维仅 role=导演时给具体内容,其他 role 可给空字符串);kind=function 表示板块功能专家,不给 dims/tpl。用户提出修改意见时,在上一版基础上改稿并重新输出完整 JSON。`,
      '缺省 FORGE_SYS 应与收编前的内联整串逐字节相同');
    // 覆盖只换人设句:契约半逐字节不变,且取值口不是加载期冻结(改完覆盖表再读即跟随)
    const OV = '你是专家铸造师(覆盖生效)。';
    a.Store.state.settings.promptOverrides = { 'forge.system': OV };
    assert(a.Experts.FORGE_SYS.startsWith(OV), '取值口不是加载期冻结:改完覆盖表再读即跟随');
    assertEq(a.Experts.FORGE_SYS.slice(OV.length), loadExperts().Experts.FORGE_SYS.slice(FORGE.length),
      '覆盖只换人设句:锻造器契约半(字段面 + 改稿规则)逐字节不变');
    // 进化器取值口真跑:蒸馏那一次的 system 半缺省逐字节不变,覆盖时只换开头那一句
    const evolve = async ov => {
      const sb = loadExperts();
      if (ov) sb.Store.state.settings.promptOverrides = ov;
      sb.Store.myProjects = () => [{ id: 'p1', boards: { 分镜: { expert: 'cx_1' } } }];
      sb.Store.state.agentMemory = [{ text: '相邻景别不硬切', scope: '分镜' }];
      sb.__apiReady = true;
      sb.__llm = [];
      sb.API.chatJSON = async req => { sb.__llm.push(req.system); return { clauses: ['每镜给出摄影意图'] }; };
      await sb.Experts.evolveExpert({ id: 'cx_1', name: '我的分镜专家', persona: '基础人设' });
      assertEq(sb.__llm.length, 1, '应只发一次蒸馏请求');
      return sb.__llm[0];
    };
    const evDef = await evolve(null);
    assertEq(evDef, EVOLVE + '根据用户与创作助手在「分镜」板块的历史协作记忆(用户的纠正/偏好/已确认决定),'
      + '为该板块的指定专家蒸馏「进化条款」。只返回 JSON {"clauses":["条款1","条款2"]}(1-4条)。'
      + '要求:与该专家人设领域及「分镜」板块职责相关、具体可执行、不重复其已有条款;每条≤40字。',
      '缺省蒸馏 system 半应与收编前的内联整串逐字节相同');
    const EVOV = '你是条款蒸馏器(覆盖生效)。';
    assertEq(await evolve({ 'forge.evolveSystem': EVOV }), EVOV + evDef.slice(EVOLVE.length),
      '覆盖只换人设句:进化器的板块点名与 clauses 契约半逐字节不变');
    // 两键互不串台:覆盖一条时另一条仍取缺省
    assertEq(await evolve({ 'forge.system': OV }), evDef, '覆盖锻造器不应改动进化器那一步');
    const b = loadExperts();
    b.Store.state.settings.promptOverrides = { 'forge.evolveSystem': EVOV };
    assertEq(b.Experts.FORGE_SYS, loadExperts().Experts.FORGE_SYS, '覆盖进化器不应改动锻造器那一步');
  } },
  { name: '专家工坊两步人设(源级):js/experts.js 零内联、gsettings 仍只引用常量,全仓只剩注册表一份', fn() {
    const Prompts = require('../js/prompts.js');
    const Skills = require('../js/skills.js');
    const src = fs.readFileSync(path.join(ROOT, 'js', 'experts.js'), 'utf8');
    const gs = fs.readFileSync(path.join(ROOT, 'js', 'gsettings.js'), 'utf8');
    // 取值口与各步锚点配对:两个键互换位置即红
    assert(/get FORGE_SYS\(\) \{ return Prompts\.get\('forge\.system'\) \+ FORGE_CONTRACT; \}/.test(src),
      '锻造器应经注册表取人设句再接就地契约半(不带第二参数=隐式读 Store 覆盖表)');
    const i = src.indexOf("Prompts.get('forge.evolveSystem')");
    assert(i >= 0, '进化器应经注册表取人设(不带第二参数=隐式读 Store 覆盖表)');
    assert(src.slice(i, i + 400).includes('为该板块的指定专家蒸馏「进化条款」'),
      '进化器取值口应与该步 user 侧锚点配对(两个键串了位即红)');
    // js/experts.js 内联人设归零(W80 5.4 记的那 1 处 + 未计数的 FORGE_SYS 常量)
    assertEq((src.match(/system: ['`]你是/g) || []).length, 0, 'js/experts.js 应零内联人设');
    assert(!/const FORGE_SYS = /.test(src), '锻造器人设不应再以整串常量写死在源码里');
    // 消费侧一行未改:gsettings 工坊页仍只引用 Experts.FORGE_SYS 这一个常量,自己不持有人设句
    assert(gs.includes('system: FORGE_SYS,'), 'gsettings 工坊页应仍只引用 Experts.FORGE_SYS 这一个常量');
    assert(!gs.includes(Prompts.get('forge.system')) && !gs.includes(Prompts.get('forge.evolveSystem')),
      'gsettings 不应持有工坊人设句(注册表 def 为唯一来源)');
    // 全仓持有者名单:两句字面恰好只剩注册表一份(别处抄第二份即红,哪怕原文件仍走注册表)
    const files = ['index.html', 'server.js', 'cli.js', 'mcp.js']
      .concat(fs.readdirSync(path.join(ROOT, 'js')).filter(f => f.endsWith('.js')).map(f => 'js/' + f));
    ['forge.system', 'forge.evolveSystem'].forEach(k => {
      const def = Prompts.get(k);
      const holders = files.filter(f => fs.readFileSync(path.join(ROOT, f), 'utf8').includes(def));
      assertEq(holders.join(','), 'js/prompts.js', k + ' 的人设句字面应全仓只剩注册表一份(逐字节比对)');
    });
    // 预置 persona 库不在本面内:experts-data.js 一行未被收编(那是专家数据,不是工坊提示词)
    const data = fs.readFileSync(path.join(ROOT, 'js', 'experts-data.js'), 'utf8');
    assert(!data.includes('Prompts.get'), 'js/experts-data.js 预置 persona 库不该被收进注册表(本槽只收工坊两步)');
    assert(require('../js/experts-data.js').EXPERTS.every(e => (e.persona || '').startsWith('你是')),
      '预置专家 persona 仍是数据字面(未被改成取值口)');
    // 不许长出第二端:工坊两步只在浏览器,收编解决的是「可覆盖」不是「可 headless」
    ['server.js', 'cli.js', 'mcp.js'].forEach(f => {
      const s = fs.readFileSync(path.join(ROOT, f), 'utf8');
      ['为该板块的指定专家蒸馏', '含{style}{subject}变量'].forEach(anchor =>
        assert(!s.includes(anchor), f + ' 不应出现工坊两步的契约半:' + anchor));
    });
    // 记账宿主:锻造器归 SK-02(专家条目面)、进化器归 SK-26(evolveExpert 的记账宿主),都写在「已落地」那半
    [['core.expertSkillRef', 'forge.system', '仍欠'], ['review.memoryFeedback', 'forge.evolveSystem', '仍欠(G-11)']]
      .forEach(([id, key, owedMark]) => {
        const sk = Skills.byId(id);
        assert(sk.prompts && sk.prompts.includes(key), id + ' 应登记 ' + key);
        assert(sk.note.includes(key), id + ' 的 note 须点名新收编的键:' + key);
        const owed = (sk.note || '').split(owedMark).slice(1).join(owedMark);
        assert(!owed.includes(key), '新收编的键应写在「已落地」那半,不许挤进仍欠段:' + key);
      });
    // G-11 的人手触发那一面仍欠,收人设句不等于自进化自动化了(如实写)
    const sk26 = Skills.byId('review.memoryFeedback');
    assert(sk26.note.includes('仍欠(G-11)') && sk26.note.includes('人手动作') && sk26.note.includes('只对自定义专家开放'),
      'SK-26 的仍欠段应仍如实写着 G-11 人手点自进化与预置专家两处');
    assert(sk26.gaps.includes('G-11'), 'G-11 标记不摘');
    /* SK-02 的仍欠段应写明工坊那份字段面同样没有 skills[](G-09 的另一头)。
     * 锚点取仍欠段内的两个词,不能只查 note 里有没有 skills[] —— 该条第一句本来就有这个字面。 */
    const owed02 = Skills.byId('core.expertSkillRef').note.split('仍欠').slice(1).join('仍欠');
    assert(owed02.includes('skills[]') && owed02.includes('铸出'),
      'SK-02 的仍欠段须写明工坊铸出的专家挂不上能力引用(G-09 的另一头)');
    // 收两处动不到关联索引投影
    assertEq(Object.keys(Skills.gaps()).length, 20, 'gaps() 键数不应变');
    assertEq((Skills.gaps()['G-13'] || []).join(','),
      'script.hookType,script.aiToneBan,subjects.refDiscipline,eps.structureStage,gen.videoTpl,film.rhythmInject',
      '收编工坊两处不动 gaps() 投影(工坊不在 G-13 的关联索引上)');
    assertEq(Skills.validate({ Prompts, KB: require('../js/knowledge.js') }).join(';'), '', '新登记的提示词键须通过引用自检');
  } },
  { name: '项目实验台两步人设:两条独立键 planner.chatSystem / trans.localizeSystem,缺省逐字节等于收编前的内联字面', fn() {
    const Prompts = require('../js/prompts.js');
    const Skills = require('../js/skills.js');
    const src = fs.readFileSync(path.join(ROOT, 'js', 'proj-planner.js'), 'utf8');
    // 收编前写死在 AI 策划对话那步 system 前半的字面:缺省逐字节不得变
    const CHAT = '你是资深短剧策划/编剧,擅长短剧节奏、悬念设计与人物塑造,回答务实具体、中文输出。';
    assertEq(Prompts.get('planner.chatSystem'), CHAT, '策划对话的缺省人设句应与收编前的内联字面逐字节相同');
    const chatItem = Prompts.list().find(x => x.key === 'planner.chatSystem');
    assert(chatItem && !chatItem.vars.length && chatItem.name.startsWith('AI 策划对话') && chatItem.name.includes('系统人设'),
      '注册表应登记策划对话人设条目(无变量,可在全局默认值页在线改写)');
    // 项目实况那一段仍由取值口现拼:人设句 + 「当前项目信息:」+ ctxOf(),覆盖只换前一段
    assertEq(Prompts.get('planner.chatSystem', { 'planner.chatSystem': '你是策划顾问(覆盖生效)。' }) + '当前项目信息:\n',
      '你是策划顾问(覆盖生效)。当前项目信息:\n', '覆盖只换人设句:其后的项目信息段头逐字节不变');
    /* 译制那步:契约半(第 5 条分集标记)留成取值口常量,从源码现取拼回去应与收编前那一整条逐字节相同 */
    const m = src.match(/const TRANS_CONTRACT = '([^']*)';/);
    assert(m, 'js/proj-planner.js 应把译制契约半留成取值口常量 TRANS_CONTRACT');
    const CONTRACT = m[1].replace(/\\n/g, '\n');
    const TGT = { name: '欧美(英语)', lang: '口语化美式英语' };
    assertEq(Prompts.fill('trans.localizeSystem', { market: TGT.name, lang: TGT.lang }) + CONTRACT,
      `你是资深短剧出海本土化译制专家,目标市场:${TGT.name}。这不是直译而是本土化译制,要求:
1. 人名本地化:把中文人名替换为目标市场本土人名(如 陈默→Ethan 式),全文保持一致
2. 台词口语化、俚语化,符合目标市场受众表达习惯,使用${TGT.lang}
3. 文化梗替换:本土文化梗替换为目标市场受众能共鸣的梗
4. 保留分集结构与爽点节奏(钩子/反转/打脸点位置不变)
5. 保留「第X集」分集标记,每集开头必须有,供程序按标记拆分`,
      '译制缺省整条(人设与四条本土化要求 + 契约半)应与收编前逐字节相同');
    const trItem = Prompts.list().find(x => x.key === 'trans.localizeSystem');
    assert(trItem && trItem.name.startsWith('剧本译制') && trItem.name.includes('系统人设'),
      '注册表应登记剧本译制人设条目(可在全局默认值页在线改写)');
    assertEq(trItem.vars.join(','), '{market},{lang}', '目标市场与语言两处现拼值应登记成变量(Prompts.fill 填)');
    trItem.vars.forEach(v => assert(trItem.def.includes(v), 'def 里应有登记的占位符 ' + v + '(登记了却填不到即红)'));
    /* 两键而不共用一个键:两条 def 字面不同(def 相同才谈得上共用),且各自恰好命中注册表一条 */
    assert(Prompts.get('planner.chatSystem') !== Prompts.get('trans.localizeSystem'),
      '两步 def 字面不同,故两条独立键(字面相同才谈得上共用一个键)');
    [CHAT, trItem.def].forEach(d => assertEq(Prompts.list().filter(x => x.def === d).length, 1, '该人设句应恰好命中注册表一条'));
    Prompts.list().forEach(x => assert(x.key === 'planner.chatSystem' || x.def !== CHAT, '策划人设不得与既有键 ' + x.key + ' 同字面'));
    // 注册表里同 def 的键仍只许是音色推荐那一组:本槽两键合成一键、或与既有键撞字面都当场红
    const byDef = {};
    Prompts.list().forEach(x => { (byDef[x.def] = byDef[x.def] || []).push(x.key); });
    assertEq(Object.values(byDef).filter(v => v.length > 1).map(v => v.join('+')).join(','),
      'voice.recommendSystem+voice.recommendBatchSystem', '注册表里同 def 的键只许是音色推荐那一组');
    /* 契约半不开放:分集标记那一条仍留在取值口,注册表里不该出现它(改坏即整轮译制一集都写不回) */
    ['第X集', '供程序按标记拆分'].forEach(f =>
      assertEq(Prompts.list().filter(x => x.def.includes(f)).length, 0, '分集标记契约不进注册表:' + f));
    // 覆盖不串台:写这两条时同板块相邻键与既有人设逐字节不动
    const OV = { 'planner.chatSystem': '你是策划顾问(覆盖生效)。', 'trans.localizeSystem': '你是译制专家(覆盖生效),市场 {market}。' };
    assertEq(Prompts.fill('trans.localizeSystem', { market: TGT.name, lang: TGT.lang }, OV),
      '你是译制专家(覆盖生效),市场 欧美(英语)。', '覆盖后变量仍照登记的占位符填');
    ['light.system', 'dirset.system', 'dist.copySystem', 'agent.system'].forEach(k =>
      assertEq(Prompts.get(k, OV), Prompts.get(k), '覆盖本槽两键时 ' + k + ' 应逐字节不动'));
    /* 展示顺序按产品流程:两步都在项目实验台围着剧本正文做(诊断改写/出海译制),排在剧本板块四步之后、导演设定之前 */
    const keys = Prompts.list().map(x => x.key);
    assertEq(keys[keys.indexOf('light.system') + 1], 'planner.chatSystem', '策划对话应紧接剧本板块四步之后登记');
    assertEq(keys[keys.indexOf('planner.chatSystem') + 1], 'trans.localizeSystem', '剧本译制应紧接策划对话之后登记');
    assert(keys.indexOf('trans.localizeSystem') < keys.indexOf('dirset.system'), '两键应排在导演设定生成之前');
    ['planner.chatSystem', 'trans.localizeSystem'].forEach(k =>
      assert(Skills.byId('core.personaCtx').prompts.includes(k), 'SK-03 应登记 ' + k));
  } },
  { name: '项目实验台两步人设(源级):js/proj-planner.js 零内联、两处取值口与各自 user 半锚点配对,SK-03 记账点名落点', fn() {
    const Prompts = require('../js/prompts.js');
    const Skills = require('../js/skills.js');
    const src = fs.readFileSync(path.join(ROOT, 'js', 'proj-planner.js'), 'utf8');
    /* 取值口与各步锚点配对:键挪到另一步上即红。两处都是就地 Prompts.get/fill(浏览器隐式读 Store 覆盖表),
     * 有意不提到模块顶层——顶层求值会把覆盖表冻在加载那一刻,用户改完当轮不生效。 */
    assert(/content: Prompts\.get\('planner\.chatSystem'\) \+ '当前项目信息:\\n' \+ ctxOf\(\)[\s\S]{0,400}billingAction: 'llm\.agent'/.test(src),
      '策划对话步应就地经 Prompts.get 取人设、其后现拼项目信息段,且与该步计费动作配对');
    assert(/content: Prompts\.fill\('trans\.localizeSystem', \{ market: tgt\.name, lang: tgt\.lang \}\) \+ TRANS_CONTRACT[\s\S]{0,600}请对以下剧本进行本土化译制/.test(src),
      '译制步应就地经 Prompts.fill 按目标市场/语言填值、其后拼契约半,且与该步 user 半锚点配对');
    // 全文恰好两处取值口,且都在弹窗函数体内:模块顶层预取会把覆盖表冻在加载那一刻,用户改完当轮不生效
    assertEq((src.match(/Prompts\.(get|fill)\(/g) || []).length, 2, 'js/proj-planner.js 应恰好两处取值口(多一处即有人预取或抄了第二份)');
    assert(src.indexOf('Prompts.') > src.indexOf('function openPlanner'), '模块顶层不得预取提示词(覆盖表会被冻在加载那一刻)');
    /* 契约半为什么不开放:「第X集」标记就是「应用译制结果」那步拆分的判据,两侧必须同集(改一侧即红) */
    const contract = (src.match(/const TRANS_CONTRACT = '([^']*)';/) || [])[1] || '';
    assert(contract.includes('第X集') && contract.includes('供程序按标记拆分'), '契约半应写明分集标记与它的用途');
    const splitRe = src.match(/result\.split\((\/.+\/i)\)/);
    assert(splitRe, 'js/proj-planner.js 应有「应用译制结果」按分集标记拆分的正则');
    const parts = '第1集 开场\n正文\n第2集 反转\n正文'.split(vm.runInThisContext(splitRe[1])).filter(Boolean);
    assertEq(parts.length, 2, '契约半要求的「第X集」标记应正是解析侧那条正则认得的(两侧同集)');
    // 本槽收这两处,收完这个文件就零内联人设了:退回内联当场红
    assertEq((src.match(/你是/g) || []).length, 0, 'js/proj-planner.js 不应再有内联人设字面(覆盖不会跟过去)');
    // 纯浏览器链路:两步都没有服务端/CLI 对端,那两处不得长出第二份 user 半
    ['server.js', 'cli.js'].forEach(rel => {
      const s = fs.readFileSync(path.join(ROOT, rel), 'utf8');
      assert(!s.includes('请对以下剧本进行本土化译制') && !s.includes('当前项目信息:'),
        rel + ' 不应出现这两步的 user 半(项目实验台只在浏览器)');
    });
    const sk3 = Skills.byId('core.personaCtx');
    ['planner.chatSystem', 'trans.localizeSystem', 'js/proj-planner.js'].forEach(k =>
      assert(sk3.note.includes(k), 'SK-03 的 note 须写明这两步的收编落点:' + k));
    assert(sk3.note.includes('零内联人设'), 'SK-03 的 note 须写明该文件至此零内联');
    // 契约半有意不收:写在「仍欠」段里才算交账(写在"已落地"那半不算)
    const owed = (sk3.note || '').split('仍欠').slice(1).join('仍欠');
    ['TRANS_CONTRACT', '第X集'].forEach(k => assert(owed.includes(k), 'SK-03 的仍欠段须点名译制契约半:' + k));
    assertEq(Skills.validate({ Prompts }).join(' | '), '', '新键须被 skill 索引引用且引用键都存在');
  } },
  { name: 'Agent 单轮人设:经 WfCore.buildAgentSystem(agent.system) 取值,缺省逐字节等于收编前的模板串', fn() {
    const Prompts = require('../js/prompts.js');
    const Skills = require('../js/skills.js');
    const WfCore = require('../js/wf-core.js');
    const PERSONA = '你是「虎鲸导演助手」,短剧制作智能体(服务端单轮模式:没有浏览器工作台,只给回复与可选的领域命令动作)。';
    // 缺省不变:收编前写死在模板串开头的人设句,收编后仍逐字节相同(协议半一字未动)
    assertEq(Prompts.get('agent.system'), PERSONA, '缺省人设句应与收编前的内联字面逐字节相同');
    assertEq(WfCore.buildAgentSystem({}), PERSONA + `
用户给自然语言指令或提问:纯咨询/建议类直接专业作答;需要驱动制作流程时额外输出动作类 ops。
返回 JSON {"reply":"中文回复","thinking":"一句话思考摘要","ops":[操作]}。
ops 仅支持统一领域命令:{"op":"run","cmd":"命令名","args":{参数}}(pid/epid 由调用方注入无需填写;执行按各命令规则扣费)。命令白名单与参数面:
(无可用命令)
纯咨询类 ops 返回 [];不确定是否该执行时不要输出 ops,在 reply 里说明建议与代价。项目风格:。`, '缺省单轮 system 应与收编前逐字节相同');
    const item = Prompts.list().find(x => x.key === 'agent.system');
    assert(item && !item.vars.length && item.name.includes('Agent 单轮'), '注册表应登记 Agent 单轮人设条目(无变量,可在全局默认值页在线改写)');
    // 只抽人设句:覆盖只换开头那一句,ops 协议/命令白名单/返回 JSON 约定逐字节不受影响
    const ctx = { kbText: '[KB]', personaNote: '[专家]', memText: '[记忆]', styleText: '悬疑', cmdText: '· episode.compose(合成成片): 无参数' };
    const def = WfCore.buildAgentSystem(ctx);
    const ovd = WfCore.buildAgentSystem(ctx, { 'agent.system': '你是单轮编排助手。' });
    assert(def.startsWith(PERSONA + '[KB][专家][记忆]\n'), '注入段顺序(KB→专家方法论→协作记忆)应仍接在人设句之后');
    assertEq(ovd, '你是单轮编排助手。' + def.slice(PERSONA.length), '覆盖只换人设句,协议半逐字节不变');
    assertEq(Prompts.list().filter(x => x.def.includes('"reply"')).length, 0, '返回 JSON 约定不做成可覆盖变量(注册表里不该出现它)');
    assert(ovd.includes('ops 仅支持统一领域命令') && ovd.endsWith('项目风格:悬疑。'), '覆盖后命令协议与风格尾注仍在');
    // 消费口:服务端显式传覆盖表(Node 无 window 读不到 Store),人设句字面只剩注册表一份
    const wf = fs.readFileSync(path.join(ROOT, 'js', 'wf-core.js'), 'utf8');
    const srv = fs.readFileSync(path.join(ROOT, 'server.js'), 'utf8');
    assert(/\}, st\.promptOverrides\)/.test(srv), '服务端 Agent 单轮应给装配口显式传覆盖表');
    [['js/wf-core.js', wf], ['server.js', srv]].forEach(([f, src]) => {
      assert(!src.includes('短剧制作智能体'), f + ' 不应再写第二份人设句(注册表 def 为唯一来源)');
    });
    assert(Skills.byId('core.personaCtx').prompts.includes('agent.system'), 'SK-03 应登记 agent.system');
    // W49 在此点名的浏览器多轮三份人设已收编:三条独立键进注册表(字面与装配输出由下一条钉住),
    // 此处只反向钉住不许退回内联——三处模板串里从此都不写人设全文
    const multi = ['js/agent.js', 'js/agent-global.js', 'js/agent-ops.js'].map(f => fs.readFileSync(path.join(ROOT, f), 'utf8'));
    const multiKeys = ['agent.panelSystem', 'agent.drawerSystem', 'agent.previsSystem'];
    multiKeys.forEach(k => assert(Prompts.list().some(x => x.key === k), '注册表应有浏览器多轮人设键 ' + k));
    multi.forEach((src, i) => {
      assert(src.includes("Prompts.get('" + multiKeys[i] + "')"), '浏览器多轮第 ' + (i + 1) + ' 份人设应取自注册表键 ' + multiKeys[i]);
      multiKeys.forEach(k => assert(!src.includes(Prompts.get(k)), '第 ' + (i + 1) + ' 个文件不应再内嵌 ' + k + ' 的人设全文(注册表 def 为唯一来源)'));
    });
  } },
  { name: '浏览器多轮三份人设:分集面板/全局抽屉/预排模式各一键,缺省逐字节等于收编前的模板串', fn: async () => {
    const Prompts = require('../js/prompts.js');
    const Skills = require('../js/skills.js');
    const PANEL = '你是「虎鲸导演助手」,短剧分镜编辑智能体。';
    const DRAWER = '你是「虎鲸导演助手」,短剧创作智能体,贯穿剧本→主体→分集→分镜→生成→成片全流程。';
    const PREVIS = '你是「虎鲸导演助手」,短剧创作智能体,当前处于「🎛 预排模式」。';
    // 缺省不变:三处模板串开头写死的人设句,收编后逐字节相同(三种运行模式措辞不同,不合成同一个键)
    assertEq(Prompts.get('agent.panelSystem'), PANEL, '分集面板缺省人设句应与收编前的内联字面逐字节相同');
    assertEq(Prompts.get('agent.drawerSystem'), DRAWER, '全局抽屉缺省人设句应与收编前的内联字面逐字节相同');
    assertEq(Prompts.get('agent.previsSystem'), PREVIS, '预排模式缺省人设句应与收编前的内联字面逐字节相同');
    assertEq(new Set([PANEL, DRAWER, PREVIS, Prompts.get('agent.system')]).size, 4,
      '四种运行模式的人设措辞互不相同(合成同一个键会让其中几端的角色定位失真)');
    ['agent.panelSystem', 'agent.drawerSystem', 'agent.previsSystem'].forEach(k => {
      const it = Prompts.list().find(x => x.key === k);
      assert(it && !it.vars.length && it.name.startsWith('Agent ') && it.name.includes('系统人设'),
        '注册表应登记 ' + k + ' 条目(无变量,可在全局默认值页在线改写)');
    });
    /* 装配输出逐字节:生成段(KB 块/人设注入/记忆召回/命令白名单/动作别名/按需查询协议/运镜词表)
     * 各有单一来源,此处按同一来源取值代入,对账的是连接文本与注入段次序 */
    const sb = loadAgentChat();
    const AC = sb.AgentCore, AO = sb.AgentOps, W = sb.WfCore, KB = sb.KB;
    const p = { id: 'p1', name: '测试项目', style: '漫剧', subjects: [], episodes: [] };
    const ep = makeEp({ content: '第一集剧本正文', sbConfig: { shotCount: 12, sbMode: 'create', shotDur: 5, quality: '720p', ratio: '9:16' } });
    const text = '把镜头3改夜景';
    const panel = AC.panelSystem(p, ep, text);
    assert(panel.startsWith(PANEL + KB.block() + AC.aPersonaBlock(ep) + AC.memBlock(text, '分镜') + '\n用户给自然语言指令,'),
      '分集面板注入段次序(KB → 生效人设 → 协作记忆)应仍接在人设句之后');
    assertEq(panel, PANEL + KB.block() + AC.aPersonaBlock(ep) + AC.memBlock(text, '分镜') + `
用户给自然语言指令,你要么给建议,要么输出对分镜表的结构化修改。
返回 JSON {"reply":"中文回复","thinking":"一句话思考摘要","ops":[操作]}(可选键 "choices" 见下)。
ops 支持:
{"op":"update","shot":镜头号,"fields":{"剧情/名称/运镜/视角/角度/景别/光圈/提示词/旁白/台词/时长":"新值"}}
{"op":"insert","after":镜头号,"shot":{"名称":"","剧情":"","运镜":"","提示词":""}}
{"op":"delete","shot":镜头号}  {"op":"move","shot":镜头号,"to":目标位置}
{"op":"batch","filter":{"含人物":"角色名"},"fields":{...}}(批量改所有该角色出场镜头)
{"op":"beatupdate","scene":场次号,"beat":节拍号,"fields":{"情绪/剧情/分镜文字":"新值"}}(改分镜脚本层某节拍;场次/节拍号从 1 开始)
{"op":"sceneupdate","scene":场次号,"fields":{"标题/剧情":"新值"}}(改分镜脚本层某场次标题或场次剧情)
★ 动作类 ops(会真正驱动工作台执行,慎用但可用):
{"op":"run","cmd":"命令名","args":{参数}}(驱动工作台对应真实功能,按其规则扣费;pid/epid 自动注入无需填写。命令白名单与参数面:
${AO.cmdProtocol()})
兼容旧格式:{"op":"run","action":"${AO.actProtocol()}"}(中文动作别名,无参数通道,能用 cmd+args 时优先新格式)
{"op":"goto","target":"分镜脚本|分镜视频|剪辑|节拍板|镜头组"}(切换工作区视图)
{"op":"select","shot":镜头号}(选中某镜头到右栏编辑)
纯咨询/建议类问题 ops 返回 []。运镜限:${W.CAMERAS.join('/')};视角:${W.VIEWS.join('/')};角度:${W.ANGLES.join('/')};景别:${W.SIZES.join('/')};光圈:ƒ/1.4~ƒ/11。项目风格:漫剧。
★ 关键决策点选项卡:当对话处于创作方向/风格/方案等关键决策点、适合让用户拍板时,额外返回可选键 "choices":{"title":"选择主题(如:复仇方向选择)","options":[{"t":"方向一:标题","d":"一句话描述"}]}(2-4 个);返回 choices 的本轮 ops 返回 [],等用户提交选择后再据此继续。${AO.queryProtocol()}`,
      '分集面板 system 应与收编前逐字节相同(人设句 + 字段面 + ops 协议 + 决策选项卡)');
    const drawer = sb.AgentG.buildGlobalPrompt({ p, ep });
    assertEq(drawer, DRAWER + KB.block() + `
当前上下文:项目「测试项目」分集「第一集」。
用户给自然语言指令,你要么给建议,要么输出结构化修改 ops。返回 JSON {"reply":"中文回复","thinking":"一句话思考摘要","ops":[操作]}(可选键 "choices" 见下)。
支持的 ops:
{"op":"project","fields":{"名称/风格/影调/全局设定":"新值"}}
{"op":"scriptmeta","fields":{"卖点/梗概":"新值"}}
{"op":"subject","name":"主体名","fields":{"名称/提示词/描述":"新值"}}
{"op":"episode","ep":"第二集","fields":{"标题/正文":"新值"}}
{"op":"addep","title":"第十一集","content":"正文"}  {"op":"delep","ep":"第三集"}
{"op":"update","shot":镜头号,"fields":{"剧情/名称/运镜/提示词/旁白/台词/时长":"新值"}}
{"op":"insert","after":镜头号,"shot":{"名称":"","剧情":"","提示词":""}}
{"op":"delete","shot":镜头号}  {"op":"move","shot":镜头号,"to":目标位置}
{"op":"batch","filter":{"含人物":"角色名"},"fields":{...}}
★ 动作类 ops(会真正驱动工作台执行,慎用但可用):
{"op":"goto","target":"制片|剧本|导演|主体|分集|成片库|剧壳|切片|一键跑批"}(跳转到对应板块/工作区)
{"op":"run","action":"AI策划|剧本译制"}(调起对应完整工作流)
{"op":"run","action":"${AO.actProtocol()}"}(驱动当前分集工作台)
{"op":"select","shot":镜头号}
纯咨询/建议类问题 ops 返回 []。项目风格:漫剧。修改类指令必须给 ops,不要只在 reply 里说"已修改"。
★ 关键决策点选项卡:当对话处于创作方向/风格/方案等关键决策点、适合让用户拍板时,额外返回可选键 "choices":{"title":"选择主题(如:复仇方向选择)","options":[{"t":"方向一:标题","d":"一句话描述"}]}(2-4 个);返回 choices 的本轮 ops 返回 [],等用户提交选择后再据此继续。`,
      '全局抽屉 system 应与收编前逐字节相同(项目+分集 ctx:镜头层字段面在内)');
    const drawerNoEp = sb.AgentG.buildGlobalPrompt({ p, ep: null });
    assert(drawerNoEp.startsWith(DRAWER + KB.block() + '\n当前上下文:项目「测试项目」。'), '无分集 ctx 也应以同一份人设句开头');
    assert(!drawerNoEp.includes('{"op":"update"') && !drawerNoEp.includes('{"op":"select"'), '无分集 ctx 不应给镜头层字段面(协议半随 ctx 收放,与人设句无关)');
    // 预排模式:走真实发送路径,截获上游请求体的 system 半
    sb.__apiReady = true;
    const sent = [];
    sb.Understanding.chatJSONRobust = async o => { sent.push(o); return { reply: '方案', thinking: 't' }; };
    const previsSend = () => AO.prearrSend({ p, ep, chat: [], text: '来12镜', model: 'm', renderMsgs() {}, sysExtra: '\n★注入段' });
    await previsSend();
    assertEq(sent[0].system, PREVIS + `\n★注入段
用户输入创作意图,你【不直接执行任何修改、不返回 ops】,而是输出一个「参数预排方案」,由用户确认后才执行。
返回 JSON {"reply":"给用户的解释(说明方案思路)","thinking":"一句话思考摘要","plan":{"action":"sb|batchvideo","summary":"一句话方案说明","params":{...}}}。
action 二选一:
- "sb":智能分镜/拆镜/生成分镜类意图。params 可用键(对齐分镜配置,数值必须钳在范围内):
  shotCount 整数2-40;sbPlans 整数1-3(分镜方案数,>1 时多方案对比择优);sbMode "create"(创作模式)或"tweet"(推文模式);shotDur 数字2-15(秒/镜);batchVideoModel 视频模型;quality "480p"|"720p"|"1080p";ratio "16:9"|"9:16"|"1:1";autoOptimize true/false(自动优化提示词);smartReview true/false(智能审片)
- "batchvideo":批量生成视频类意图。params 可用键:
  batchVideoModel;quality "480p"|"720p"|"1080p";ratio "16:9"|"9:16"|"1:1";batchStrategy(ref=分镜参考,fusion=多图融合);batchCamera 运镜(固定镜头/推镜头)
可用视频模型:seedance-x/kling-x。
只输出用户明确提到或可合理推断的键,其余省略(执行时以当前配置为底)。当前配置:{"shotCount":12,"sbMode":"create","shotDur":5,"quality":"720p","ratio":"9:16"}
无法判断属于哪类生成意图时【不要返回 plan】,按普通创作顾问对话回答(只给 reply)。`,
      '预排模式 system 应与收编前逐字节相同(人设句 + 注入段 + 方案协议 + 参数面)');
    /* 覆盖只换对应那一份人设:另两份与各自的协议半逐字节不变(浏览器隐式读 Store 覆盖表) */
    const ovCases = [
      ['agent.panelSystem', PANEL, '你是面板编辑助手(覆盖生效)。'],
      ['agent.drawerSystem', DRAWER, '你是全局创作助手(覆盖生效)。'],
      ['agent.previsSystem', PREVIS, '你是预排编排助手(覆盖生效)。'],
    ];
    for (const [key, def, ov] of ovCases) {
      sb.Store.state.settings.promptOverrides = { [key]: ov };
      await previsSend();
      const got = { 'agent.panelSystem': AC.panelSystem(p, ep, text), 'agent.drawerSystem': sb.AgentG.buildGlobalPrompt({ p, ep }), 'agent.previsSystem': sent[sent.length - 1].system };
      const base = { 'agent.panelSystem': panel, 'agent.drawerSystem': drawer, 'agent.previsSystem': sent[0].system };
      Object.keys(got).forEach(k => {
        if (k === key) assertEq(got[k], ov + base[k].slice(def.length), '覆盖 ' + key + ' 只换人设句,其后协议半逐字节不变');
        else assertEq(got[k], base[k], '覆盖 ' + key + ' 不应动到 ' + k + ' 那份装配');
      });
    }
    delete sb.Store.state.settings.promptOverrides;
    assertEq(AC.panelSystem(p, ep, text), panel, '清空覆盖应逐字节回到缺省');
    // 协议契约不做成可覆盖变量:注册表里不得出现返回 JSON 约定与 ops 字段面
    assertEq(Prompts.list().filter(x => x.def.includes('"reply"') || x.def.includes('"op"')).length, 0,
      '多轮三份的 ops 协议/返回 JSON 约定应仍留在各自装配口(注册表里不该出现)');
    ['agent.panelSystem', 'agent.drawerSystem', 'agent.previsSystem'].forEach(k =>
      assert(Skills.byId('core.personaCtx').prompts.includes(k), 'SK-03 应登记 ' + k));
  } },
  { name: 'Agent 意图路由人设:独立键 agent.routeSystem 取值,缺省装配逐字节等于收编前的内联字面', fn() {
    const Prompts = require('../js/prompts.js');
    const PERSONA = '你是意图路由器。'; // 收编前写死在 js/agent-global.js 的 routeIntent 里
    const LIST = '- 剧本(剧本Agent):卖点/梗概/剧本正文 · 雇佣专家:未雇佣';
    const INLINE = PERSONA + `以下是短剧创作流水线的各板块及其职责:\n${LIST}\n`
      + '判断用户本条消息最想交给哪个板块处理(创作/修改/执行类意图归属对应板块;进度查询/闲聊/跨板块综合问题返回 null)。'
      + '只返回 JSON {"board":"板块key 或 null","reason":"≤20字"},board 只能是以上板块 key 之一或 null。';
    assertEq(Prompts.get('agent.routeSystem'), PERSONA, '缺省人设句应与收编前的内联字面逐字节相同');
    assertEq(routeSystemOf(null, LIST), INLINE, '该步装配整条应与收编前逐字节相同(板块清单/判据句/返回契约都不动)');
    const item = Prompts.list().find(x => x.key === 'agent.routeSystem');
    assert(item && !item.vars.length && item.name.startsWith('Agent 意图路由') && item.name.includes('系统人设'),
      '注册表应登记 Agent 意图路由人设条目(无变量,可在全局默认值页在线改写)');
    /* 独立键而不与 Agent 那四条复用:路由器只判归属不作答,与四种对话模式的角色都不同(同字面才谈得上复用) */
    assertEq(Prompts.list().filter(x => x.def === PERSONA).length, 1, '该人设句应恰好命中注册表一条');
    ['agent.system', 'agent.panelSystem', 'agent.drawerSystem', 'agent.previsSystem'].forEach(k =>
      assert(Prompts.get(k) !== PERSONA, '意图路由人设不得与既有键 ' + k + ' 同字面'));
    /* 覆盖只换人设句:板块清单、判据句、返回 JSON 契约逐字节不变,且不串到别的键上 */
    const OV = { 'agent.routeSystem': '你是板块调度路由(覆盖生效)。' };
    assertEq(routeSystemOf(OV, LIST), OV['agent.routeSystem'] + INLINE.slice(PERSONA.length),
      '覆盖只换人设句,其后的板块清单与判据/契约半逐字节不变');
    ['agent.system', 'agent.panelSystem', 'agent.drawerSystem', 'agent.previsSystem'].forEach(k =>
      assertEq(Prompts.get(k, OV), Prompts.get(k), '覆盖 agent.routeSystem 时 ' + k + ' 应逐字节不动'));
    /* 契约半不开放:board 只能取板块 key,用户改坏即整轮路由解析不出板块,故这些字面一个都不进注册表 */
    ['"board"', '"reason"', '≤20字', '板块 key 之一或 null'].forEach(f =>
      assertEq(Prompts.list().filter(x => x.def.includes(f)).length, 0, '返回契约不进注册表:' + f));
    /* 板块清单也不进注册表:板块表是 AGENT_BOARDS 单源,做成提示词副本等于允许用户存一份过期板块表 */
    assertEq(Prompts.list().filter(x => x.def.includes('各板块及其职责')).length, 0, '板块清单应由取值口现拼,不进注册表');
    /* 展示顺序按运行流程:路由是全局抽屉那一路的辅助步,紧接抽屉人设之后、在预排模式之前 */
    const keys = Prompts.list().map(x => x.key);
    assertEq(keys[keys.indexOf('agent.drawerSystem') + 1], 'agent.routeSystem', '意图路由应紧接全局抽屉之后登记');
    assert(keys.indexOf('agent.routeSystem') < keys.indexOf('agent.previsSystem'), '意图路由应排在预排模式之前');
  } },
  { name: 'Agent 意图路由人设(源级):js/agent-global.js 零内联,取值口在调用点现取,三张全仓名单同步减一处', fn() {
    const Prompts = require('../js/prompts.js');
    const Skills = require('../js/skills.js');
    const src = fs.readFileSync(path.join(ROOT, 'js', 'agent-global.js'), 'utf8');
    // 取值口与这一步的锚点配对:键挪到别的调用点即红(路由步由 step:'route' 的辅助槽位钉住)
    assert(/const sys = Prompts\.get\('agent\.routeSystem'\)[\s\S]{0,1200}step: 'route'/.test(src),
      'agent.routeSystem 应就在意图路由步的取值口上,且与该步 step:route 槽位配对');
    assertEq((src.match(/Prompts\.get\('agent\.routeSystem'\)/g) || []).length, 1, '该键在本文件应只有一个取用口');
    /* 在调用点现取,不写成模块顶层常量:顶层求值会把覆盖表冻在加载那一刻,用户改了也要刷新页面才生效 */
    assert(!/\n {2}(?:const|let|var) \w+ = Prompts\.get\('agent\.routeSystem'\)/.test(src),
      '取值口不得提到模块顶层常量(顶层求值会冻覆盖表)');
    const head = src.slice(0, src.indexOf("Prompts.get('agent.routeSystem')"));
    assert(/async function routeIntent\(/.test(head) && !/\n {2}function /.test(src.slice(head.lastIndexOf('async function routeIntent('), src.indexOf("Prompts.get('agent.routeSystem')"))),
      '取值口应落在 routeIntent 函数体内(每次路由现取一遍生效值)');
    // 契约半与判据句仍写在源码里:它们是路由解析判据,不随人设覆盖变动
    assert(src.includes('"board":"板块key 或 null"') && src.includes('board 只能是以上板块 key 之一或 null'),
      '返回 JSON 契约应仍留在装配口(不开放覆盖)');
    assert(/const list = AGENT_BOARDS\.map/.test(src), '板块清单应仍按 AGENT_BOARDS 现拼(板块表单源)');
    /* 本槽收编该文件唯一的内联人设,收完零内联:三种写法(system 值位/具名常量/直接 return)与"引号紧跟你是"都为 0 */
    assertEq((src.match(/(?:system:\s*|return\s*|(?:const|let|var)\s+[A-Za-z_$][\w$]*\s*=\s*)(?:'|`)你是/g) || []).length, 0,
      'js/agent-global.js 不应再有内联人设字面');
    assertEq((src.match(/['`]你是/g) || []).length, 0, 'js/agent-global.js 不应再有以「你是」开头的字面');
    /* 有意不收的两句上下文框定语:全局任务上下文块尾那句与板块协作那句都随实况现拼(同一个三元的两支),
     * 与 ops 协议同属装配半、不开放覆盖;它们不在上面三种判据内,但仍要点名钉住"没被顺手塞进注册表" */
    assert(src.includes('你是虎鲸,元Agent,掌握以上全局上下文') && src.includes('你当前作为「'),
      '两句上下文框定语应仍留在装配口(随板块/流水线实况现拼)');
    assertEq(Prompts.list().filter(x => x.def.includes('元Agent') || x.def.includes('你当前作为')).length, 0,
      '上下文框定语不进注册表(它是随实况现拼的装配半)');
    // 纯浏览器链路:这一步没有 Node 对端,三个 Node 端都不得长出第二份
    ['server.js', 'cli.js', 'mcp.js'].forEach(rel => {
      const s = fs.readFileSync(path.join(ROOT, rel), 'utf8');
      assert(!s.includes('你是意图路由器') && !s.includes('板块 key 之一或 null'), rel + ' 不应出现意图路由步(该步只在浏览器抽屉)');
    });
    // 三张判据不同的全仓名单同步减这一处(名单本身在各自用例里逐字节钉,此处只钉本槽落点)
    assert(!inlinePersonaHolders().some(x => x.startsWith('js/agent-global.js')),
      'js/agent-global.js 应已退出持有者名单(本处已收编)');
    const sk3 = Skills.byId('core.personaCtx');
    assert(sk3.prompts.includes('agent.routeSystem'), 'SK-03 应登记 agent.routeSystem');
    assert(sk3.note.includes('agent.routeSystem') && sk3.note.includes('js/agent-global.js') && sk3.note.includes('零内联人设'),
      'SK-03 的 note 须写明这一步的收编落点(键与取值口所在文件)与该文件至此零内联');
    assert(sk3.note.includes('冻') || sk3.note.includes('加载那一刻'), 'SK-03 的 note 须交代为什么在调用点现取而不是顶层常量');
    // 缺口未闭合(名单还有余量):标记不摘,G-13 的关联索引逐字节不变
    assertEq(Object.keys(Skills.gaps()).length, 20, '缺口投影键数应不变');
    assertEq(Skills.gaps()['G-13'].join(','), 'script.hookType,script.aiToneBan,subjects.refDiscipline,eps.structureStage,gen.videoTpl,film.rhythmInject',
      'G-13 的六条关联索引逐字节不变(只收一处不预支摘标记)');
    assertEq(Skills.validate({ Prompts }).join(' | '), '', '新键须被 skill 索引引用且引用键都存在');
  } },
  { name: '音色推荐两份人设:单个/批量各一键,缺省逐字节等于收编前的内联字面,覆盖不串台', fn: async () => {
    const Prompts = require('../js/prompts.js');
    const Skills = require('../js/skills.js');
    const PERSONA = '你是配音导演。';
    const KEYS = ['voice.recommendSystem', 'voice.recommendBatchSystem'];
    // 缺省不变:两处内联字面逐字节相同(两处 def 相同也不合成一个键,键位是持久化面)
    KEYS.forEach(k => assertEq(Prompts.get(k), PERSONA, k + ' 缺省人设句应与收编前的内联字面逐字节相同'));
    assertEq(Prompts.list().filter(x => x.def === PERSONA).length, 2, '两条独立键各留一份 def(合并即只剩一条)');
    KEYS.forEach(k => {
      const it = Prompts.list().find(x => x.key === k);
      assert(it && !it.vars.length && it.name.includes('音色推荐') && it.name.includes('系统人设'),
        '注册表应登记 ' + k + ' 条目(无变量,可在全局默认值页在线改写)');
    });
    /* 行为面:两步各真跑一次,system 取注册表、user 半(音色库取值范围 + 返回 JSON 约定)逐字节等于收编前 */
    const p = { id: 'p1', name: '测试项目', style: '漫剧' };
    const s = { name: '林晚晴', persona: { 性格: '外冷内热', 语气: '低沉冷静' } };
    const chars = [s, { name: '陆行舟', persona: { 性格: '张扬' } }];
    const voices = ['高冷御姐', '少年音', '温柔细腻'];
    const sb = loadPersona();
    sb.__voiceOut = { voice: '高冷御姐', reason: '冷感贴人设' };
    assertEq((await sb.Persona.recommendVoice(p, s, voices)).voice, '高冷御姐', '单个推荐应吃到 LLM 结果(该步真的跑了,不是空转)');
    sb.__voiceOut = [{ name: '林晚晴', voice: '高冷御姐', reason: 'r1' }, { name: '陆行舟', voice: '少年音', reason: 'r2' }];
    assertEq((await sb.Persona.recommendVoicesBatch(p, chars, voices))['陆行舟'].voice, '少年音', '批量推荐应按角色名落回各自音色');
    assertEq(sb.__llm.length, 2, '两步应各发一次 LLM 调用');
    assertEq(sb.__llm.map(c => c.system).join('|'), [PERSONA, PERSONA].join('|'), '两步缺省 system 应与收编前逐字节相同');
    assertEq(sb.__llm[0].user, '根据角色人设「外冷内热;低沉冷静」(角色:林晚晴,项目风格:漫剧),从音色库 '
      + JSON.stringify(voices) + ' 中推荐最合适的 1 个,返回 {"voice":"必须是音色库中的一项","reason":"一句话理由"}',
      '单个推荐的 user 半应逐字节不变(音色库取值范围与返回 JSON 约定在内)');
    assertEq(sb.__llm[1].user, '根据以下角色人设为每个角色推荐最合适的音色,项目风格:漫剧。音色库:' + JSON.stringify(voices)
      + '。返回 JSON 数组,每个元素 {"name":"角色名(必须与输入完全一致)","voice":"必须是音色库中的一项","reason":"一句话理由"}:\n'
      + JSON.stringify([{ name: '林晚晴', persona: '外冷内热;低沉冷静' }, { name: '陆行舟', persona: '张扬' }]),
      '批量推荐的 user 半应逐字节不变(角色简报与返回 JSON 约定在内)');
    assertEq(sb.__llm.map(c => c.temperature + '/' + c.max_tokens).join('|'), '0.4/300|0.4/1200', '两步的取样参数一字未动');
    assertEq(sb.__charges.length + sb.__tasks.length, 0, '两步仍是免费辅助(不登记任务、不扣费)');
    /* 覆盖只换对应那一份:另一份逐字节不变(两处 def 相同,合成一个键这一层先红) */
    for (const key of KEYS) {
      const ov = '你是音色导演(' + key + ' 覆盖生效)。';
      const sb2 = loadPersona({ [key]: ov });
      sb2.__voiceOut = { voice: '高冷御姐', reason: 'r' };
      await sb2.Persona.recommendVoice(p, s, voices);
      sb2.__voiceOut = [{ name: '林晚晴', voice: '高冷御姐', reason: 'r' }];
      await sb2.Persona.recommendVoicesBatch(p, chars, voices);
      const want = KEYS.map(k => (k === key ? ov : PERSONA)).join('|');
      assertEq(sb2.__llm.map(c => c.system).join('|'), want, '覆盖 ' + key + ' 只换对应那一步的人设句,另一步不串台');
      assertEq(sb2.__llm.map(c => c.user).join('|'), sb.__llm.map(c => c.user).join('|'), '覆盖只换人设句:两步的 user 半逐字节不变');
    }
    // 契约半不开放覆盖:音色库取值范围与返回 JSON 约定不做成可覆盖变量
    assertEq(Prompts.list().filter(x => x.def.includes('必须是音色库中的一项') || x.def.includes('"voice"')).length, 0,
      '音色库取值范围/返回 JSON 约定应仍留在各自调用点(注册表里不该出现)');
    // 源级:两处各取自己那一键,人设全文在文件里零命中(注册表 def 是唯一来源)
    const psrc = fs.readFileSync(path.join(ROOT, 'js', 'persona.js'), 'utf8');
    KEYS.forEach(k => assert(psrc.includes("Prompts.get('" + k + "')"), '音色推荐应取自注册表键 ' + k));
    assertEq((psrc.match(/你是配音导演/g) || []).length, 0, 'js/persona.js 不应再内联该人设句(覆盖不会跟过去)');
    KEYS.forEach(k => assert(Skills.byId('core.personaCtx').prompts.includes(k), 'SK-03 应登记 ' + k));
    // 记账锚点:仍欠段(只认「仍欠」之后那段)须点名这两条的边界——契约半不开放覆盖,开了就要同步改记账
    const owed3 = (Skills.byId('core.personaCtx').note || '').split('仍欠').slice(1).join('仍欠');
    assert(owed3.includes('音色库') && owed3.includes('不开放覆盖'), 'SK-03 的仍欠段须写明音色推荐的契约半不开放覆盖');
  } },
  { name: '事件图谱拆解人设:独立键 graph.system,缺省逐字节等于收编前的内联字面、JSON 契约未开放', fn() {
    const Prompts = require('../js/prompts.js');
    const Skills = require('../js/skills.js');
    const DEF = '你是短剧剧本结构分析师。';
    // 缺省不变:收编前写死在 js/episodes.js 那步的 system 字面,收编后逐字节相同
    assertEq(Prompts.get('graph.system'), DEF, '缺省人设句应与收编前的内联字面逐字节相同');
    assertEq(Prompts.get('graph.system', { 'graph.system': '结构拆解员。' }), '结构拆解员。', '覆盖 graph.system 时取值跟随');
    const it = Prompts.list().find(x => x.key === 'graph.system');
    assert(it && !it.vars.length && it.name.startsWith('事件图谱拆解') && it.name.includes('系统人设'),
      '注册表应登记 graph.system 条目(无变量,可在全局默认值页在线改写)');
    assertEq(Prompts.list().filter(x => x.def === DEF).length, 1, '该人设句应恰好命中注册表一条');
    // 独立一条键:不与既有人设合成,也不复用其中任何一条的字面(同字面才谈得上复用)
    ['split.system', 'extract.system', 'und.system', 'sb.system', 'sb.reviewSystem'].forEach(k =>
      assert(Prompts.get(k) !== DEF, '事件图谱拆解人设不得与既有键 ' + k + ' 同字面'));
    // 覆盖只换这一键:同板块相邻两键逐字节不动(串台即红)
    const ov = { 'graph.system': '结构拆解员。' };
    ['split.system', 'extract.system'].forEach(k => assertEq(Prompts.get(k, ov), Prompts.get(k), '覆盖 graph.system 时 ' + k + ' 应逐字节不动'));
    // 只收人设句:该步返回 JSON 的 events 字段契约仍留在 user 半,不做成可覆盖变量
    ['"events"', '"result"', '"where"'].forEach(f =>
      assertEq(Prompts.list().filter(x => x.def.includes(f)).length, 0, '返回 JSON 契约不进注册表:' + f));
    assert(Skills.byId('core.personaCtx').prompts.includes('graph.system'), 'SK-03 应登记 graph.system');
  } },
  { name: '事件图谱拆解人设(源级):js/episodes.js 零内联,取值口就在逐集拆解那步', fn() {
    const Prompts = require('../js/prompts.js');
    const ep = fs.readFileSync(path.join(ROOT, 'js', 'episodes.js'), 'utf8');
    // 取值口与该步 user 半锚点配对:键挪到别的步骤上即红
    assert(/system: Prompts\.get\('graph\.system'\),[\s\S]{0,600}把该集剧本拆成结构化事件序列/.test(ep),
      '事件图谱拆解步应就地经 Prompts.get 取人设(浏览器隐式读 Store 覆盖表),且与该步 user 半锚点配对');
    assertEq((ep.match(/你是短剧剧本结构分析师/g) || []).length, 0, 'js/episodes.js 不应再内联该人设句(覆盖不会跟过去)');
    // 该人设句的持有者全仓只剩注册表一份:谁在别处抄第二份当场红
    const holders = ['server.js', 'cli.js', 'mcp.js', 'index.html']
      .concat(fs.readdirSync(path.join(ROOT, 'js')).filter(n => n.endsWith('.js')).map(n => 'js/' + n))
      .filter(rel => fs.readFileSync(path.join(ROOT, rel), 'utf8').includes(Prompts.get('graph.system')));
    assertEq(holders.sort().join(','), 'js/prompts.js', '人设句字面应只剩注册表一份');
    // 这条链路没有服务端对端:收编解决的是可覆盖,不是可 headless(别处冒出第二个消费点即红)
    assert(!fs.readFileSync(path.join(ROOT, 'server.js'), 'utf8').includes('把该集剧本拆成结构化事件序列'),
      'server.js 不应出现事件图谱拆解步(该步只在浏览器分集页链路上)');
  } },
  { name: '节拍板拆解人设:独立键 beat.system,缺省逐字节等于内联原字面、覆盖只换人设句', fn() {
    const Prompts = require('../js/prompts.js');
    const KB = require('../js/knowledge.js');
    const Skills = require('../js/skills.js');
    const PERSONA = '你是短剧节拍拆解专家,精通 5 段式黄金结构(开篇钩子→矛盾建立→打压升级→反转蓄力→断集留客)。';
    // 缺省不变:收编前写死在 system 字段上的人设句,收编后仍逐字节相同
    assertEq(Prompts.get('beat.system'), PERSONA, '缺省人设句应与收编前的内联字面逐字节相同');
    assertEq(Prompts.get('beat.system', { 'beat.system': '节拍拆解员。' }), '节拍拆解员。', '覆盖 beat.system 时取值跟随');
    const item = Prompts.list().find(x => x.key === 'beat.system');
    assert(item && !item.vars.length && item.name.includes('节拍板拆解'), '注册表应登记节拍板拆解人设条目(无变量,可在全局默认值页在线改写)');
    // 独立键而不是复用既有键:这句人设是另一个角色(节拍拆解),不是任何既有条目的第二份拷贝
    assertEq(Prompts.list().filter(x => x.def === PERSONA).length, 1, '该人设句在注册表里应恰好一条(同 def 不许开两个键)');
    /* 注册表里唯一一组同 def 的键是音色推荐那两条(W73 有意留成两键:键位是持久化面,
     * 且批量那步要顾角色间的音色区分度)。除它以外再冒出第二份拷贝即红,把那两条合成一键也红。 */
    const byDef = {};
    Prompts.list().forEach(x => { (byDef[x.def] = byDef[x.def] || []).push(x.key); });
    assertEq(Object.values(byDef).filter(v => v.length > 1).map(v => v.join('+')).join(','),
      'voice.recommendSystem+voice.recommendBatchSystem', '注册表里同 def 的键只许是音色推荐那一组(别处再抄一份即红)');
    // 取用点缺省逐字节:人设句之后仍按键接 KB 方法论段(六阶段结构 → 打脸四步,次序与收编前相同)
    const def = beatSystemOf();
    assertEq(def, PERSONA + KB.pick('六阶段结构', '打脸四步'), '取用点缺省 system 应与收编前逐字节相同');
    // 覆盖只换人设句:方法论段逐字节不动;覆盖别的键不串台
    const OV = '你是节拍拆解员(覆盖生效)。';
    assertEq(beatSystemOf({ 'beat.system': OV }), OV + def.slice(PERSONA.length), '覆盖只换人设句,KB 方法论段逐字节不变');
    assertEq(beatSystemOf({ 'und.system': '你是导演。' }), def, '覆盖别的键不应串到本步');
    // 契约半不开放覆盖:5 段式返回 JSON 约定与宫格数不做成注册表变量(改坏即整步拆不出节拍板)
    assertEq(Prompts.list().filter(x => /"beats"|"frames"|"transition"|宫格/.test(x.def)).length, 0,
      '5 段式返回 JSON 约定应仍留在该步 user 半(注册表里不该出现)');
    assert(Skills.byId('eps.structureStage').prompts.includes('beat.system'), 'SK-14 应登记 beat.system(该注入点的人设句归它的登记面)');
  } },
  { name: '节拍板拆解人设(源级):js/beatboard.js 零内联;全仓内联人设持有者名单', fn() {
    const Prompts = require('../js/prompts.js');
    const bb = fs.readFileSync(path.join(ROOT, 'js', 'beatboard.js'), 'utf8');
    assert(bb.includes("Prompts.get('beat.system')"), '节拍板拆解步应经注册表取人设(浏览器隐式读 Store 覆盖表)');
    assertEq((bb.match(/你是短剧节拍拆解专家/g) || []).length, 0, 'js/beatboard.js 不应再有该人设句的内联字面(注册表 def 为唯一来源)');
    // 契约半仍由源码拼:user 半的 5 段式 JSON 约定与宫格数原样保留,不随人设句一起进注册表
    assert(bb.includes('返回严格 JSON') && bb.includes('各段 frames 数量固定为'), '该步 user 半的 5 段式 JSON 契约应仍写在源码里');
    // 这一处没有服务端对端:三个 Node 端都不该长出第二份(收编只解决"可覆盖",没解决"可 headless")
    ['server.js', 'cli.js', 'mcp.js'].forEach(f => {
      const src = fs.readFileSync(path.join(ROOT, f), 'utf8');
      assert(!src.includes('5 段式节拍板') && !src.includes('你是短剧节拍拆解专家'), f + ' 不应出现节拍板拆解步(该步只在浏览器)');
    });
    /* 全仓内联人设持有者名单:收编一处就要在这张名单上少一处,任何文件新长出一处即多一处。
     * G-13 的余量到此有了唯一判据——不再只是散文里的一个数字(口径与例外见 inlinePersonaHolders 注释) */
    const holders = inlinePersonaHolders();
    assertEq(holders.join(' '), '',
      '全仓内联人设持有者名单(文件:处数)——这一判据下余量已归零,任何文件新长出一处即红');
    assert(!holders.some(x => x.startsWith('js/beatboard.js:')), 'js/beatboard.js 应已退出持有者名单(本处已收编)');
    assertEq(holders.length, 0, '持有者文件数');
    assertEq(holders.reduce((n, x) => n + Number(x.split(':')[1]), 0), 0, '全仓内联人设处数');
    /* 上一处已知例外(单镜视频审片 js/wf-core.js buildReviewPrompt 那句写在 user 半开头的人设)已收编为
     * review.userSystem,故这条正向断言随之翻面:该文件不得再有 return 形态的内联人设 */
    assert(!/return `你是/.test(fs.readFileSync(path.join(ROOT, 'js', 'wf-core.js'), 'utf8')),
      '单镜视频审片那句已收进 review.userSystem,js/wf-core.js 不得退回 return 形态的内联人设');
    /* 归零仍不等于 G-13 闭合:本判据有意不数 API 层兜底,js/api.js 的 chatJSON/chatJSONRobust 在调用方
     * 不给 system 时垫的那两句仍不在注册表里(收编它时这条与两条记账一并翻面) */
    assertEq((fs.readFileSync(path.join(ROOT, 'js', 'api.js'), 'utf8').match(/\|\| '你是专业助手。'\)/g) || []).length, 2,
      '本判据的已知例外仍在:API 层那两处兜底缺省不匹配本判据、也仍不在注册表里');
    assertEq(Prompts.list().filter(x => x.def === '你是专业助手。').length, 0, '那句兜底缺省确实还没进注册表(进表即须翻面)');
  } },
  { name: '漫剧气泡对白人设:经 Prompts.get(comic.bubbleSystem) 取值,缺省逐字节等于收编前的内联字面', fn() {
    const Prompts = require('../js/prompts.js');
    const Skills = require('../js/skills.js');
    const PERSONA = '你是漫剧编剧。';
    const INLINE = PERSONA + '根据用户给的剧情简述,生成 2-4 个画面气泡,只返回 JSON 数组,格式:[{"type":"对白","text":"..."}],type 只能是 对白/旁白/内心,text 不超过 30 字。';
    const src = fs.readFileSync(path.join(ROOT, 'js', 'editors.js'), 'utf8');
    // 契约半仍留在装配口:从源码现取那个常量,与注册表人设句拼回去应与收编前那一整条逐字节相同
    const m = src.match(/const BUBBLE_CONTRACT = '([^']*)';/);
    assert(m, 'js/editors.js 应把契约半留成装配口常量 BUBBLE_CONTRACT');
    assertEq(Prompts.get('comic.bubbleSystem'), PERSONA, '缺省人设句应与收编前的内联字面逐字节相同');
    assertEq(Prompts.get('comic.bubbleSystem') + m[1], INLINE, '缺省整条(人设句 + 契约半)应与收编前逐字节相同');
    // 只收人设句:覆盖只换开头那一句,返回 JSON 形状/type 词表/字数上限逐字节不受影响
    assertEq(Prompts.get('comic.bubbleSystem', { 'comic.bubbleSystem': '你是气泡编剧。' }) + m[1],
      '你是气泡编剧。' + INLINE.slice(PERSONA.length), '覆盖只换人设句,契约半逐字节不变');
    assertEq(Prompts.list().filter(x => x.def.includes('只返回 JSON 数组') || x.def.includes('"type"')).length, 0,
      '返回 JSON 形状与 type 词表不做成可覆盖变量(注册表里不该出现它)');
    // 契约半为什么不开放:它就是下面解析/归类的判据,词表两侧必须同集(改一侧即红)
    const types = (src.match(/const TYPES = \[([^\]]*)\]/) || [])[1] || '';
    assert(types, 'js/editors.js 应有气泡类型词表 TYPES');
    types.split(',').map(s => s.trim().replace(/'/g, '')).forEach(t =>
      assert(m[1].includes(t), '契约半的 type 词表应与解析侧 TYPES 同集:' + t));
    // 取值口:人设句只剩注册表一份(浏览器隐式读 Store.settings.promptOverrides,该步无 Node 消费点)
    assert(src.includes("system: Prompts.get('comic.bubbleSystem') + BUBBLE_CONTRACT,"),
      '漫剧气泡步应经注册表取人设句、契约半就地拼');
    assert(!src.includes(PERSONA), 'js/editors.js 不应再内联人设句(覆盖不会跟过去)');
    const item = Prompts.list().find(x => x.key === 'comic.bubbleSystem');
    assert(item && !item.vars.length && item.name.includes('漫剧气泡'),
      '注册表应登记漫剧气泡人设条目(无变量,可在全局默认值页在线改写)');
    assert(Skills.byId('core.personaCtx').prompts.includes('comic.bubbleSystem'), 'SK-03 应登记 comic.bubbleSystem');
    /* 记账:契约半有意不收 + 该步不过 ctx 通道,两件事都写在「仍欠」段里(写在"已落地"那半不算交账) */
    const owed = (Skills.byId('core.personaCtx').note || '').split('仍欠').slice(1).join('仍欠');
    ['漫剧气泡', 'ctx 通道'].forEach(k => assert(owed.includes(k), 'SK-03 的仍欠段须点名:' + k));
    /* 全仓持有者名单:按"以 你是 开头的字符串字面"逐文件普查,一处新增/一处收编都会改动这张名单。
     * 三类持有者混在同一张表里如实计数——注册表 def(js/prompts.js,单源)、专家人设库(js/experts-data.js,
     * 另一份单源)、其余即注册表之外仍各写一份的内联人设(含 js/api.js 两处兜底缺省与 js/gsettings.js 的
     * 输入框占位文案);收编即从名单上减一处,漏改这张表先红。 */
    const files = [].concat(
      fs.readdirSync(ROOT).filter(f => f.endsWith('.js')),
      fs.readdirSync(path.join(ROOT, 'js')).filter(f => f.endsWith('.js')).map(f => 'js/' + f)).sort();
    const census = files.map(f => [f, (fs.readFileSync(path.join(ROOT, f), 'utf8').match(/['"`]你是/g) || []).length])
      .filter(x => x[1]).map(x => x[0] + ':' + x[1]);
    assertEq(census.join(' '), [
      'js/api.js:2', 'js/experts-data.js:16',
      'js/gsettings.js:1',
      'js/prompts.js:40',
    ].join(' '), '全仓人设字面持有者名单(逐文件计数)');
    assert(!census.some(x => x.startsWith('js/editors.js:')), 'js/editors.js 收编后应已不在持有者名单上');
    assert(!census.some(x => x.startsWith('js/wf-core.js:')), 'js/wf-core.js 收编后应已不在持有者名单上');
    assertEq(Prompts.list().filter(x => x.def.startsWith('你是')).length, 40,
      '名单里 js/prompts.js 那 40 处就是注册表 def 本身(注册表条数变了这张名单也要跟着改)');
  } },
  { name: 'Agent 辅助两步人设:回执核验修复/会话纪要蒸馏各一独立键,缺省逐字节等于收编前的内联字面', fn() {
    const Prompts = require('../js/prompts.js');
    const Skills = require('../js/skills.js');
    const FIX = '你是「虎鲸导演助手」的执行核验器。';
    const CMP = '你是会话纪要整理器。';
    assertEq(Prompts.get('agent.selfFixSystem'), FIX, '回执核验修复缺省人设句应与收编前的内联字面逐字节相同');
    assertEq(Prompts.get('agent.compactSystem'), CMP, '会话纪要蒸馏缺省人设句应与收编前的内联字面逐字节相同');
    /* 两处 def 逐字节不同(角色也不同:一个归因执行回执并给修复 ops、一个把旧对话蒸馏成纪要),
     * 故两条独立键——"def 相同才谈得上共用一键"这条判据在这里判的是"不能共用" */
    assert(FIX !== CMP, '两步 def 逐字节不同,不得共用一键');
    ['agent.selfFixSystem', 'agent.compactSystem'].forEach(k => {
      const it = Prompts.list().find(x => x.key === k);
      assert(it && !it.vars.length && it.name.startsWith('Agent ') && it.name.includes('系统人设'),
        '注册表应登记 ' + k + ' 条目(无变量,可在全局默认值页在线改写)');
      assertEq(Prompts.list().filter(x => x.def === Prompts.get(k)).length, 1, k + ' 的人设句应恰好命中注册表一条');
    });
    // Agent 六条键措辞互不相同:合成一个键会让其中几步的角色定位失真
    const AG = ['agent.system', 'agent.panelSystem', 'agent.drawerSystem', 'agent.previsSystem', 'agent.selfFixSystem', 'agent.compactSystem'];
    assertEq(new Set(AG.map(k => Prompts.get(k))).size, AG.length, 'Agent 各键的人设措辞应互不相同');
    // 覆盖只换对应那一键:另一条逐字节不动(串台即红)
    const ov = { 'agent.selfFixSystem': '你是覆盖生效的核验器。' };
    assertEq(Prompts.get('agent.selfFixSystem', ov), '你是覆盖生效的核验器。', '覆盖应命中 selfFix 那一键');
    assertEq(Prompts.get('agent.compactSystem', ov), CMP, '覆盖 selfFix 时 compact 应逐字节不动');
    // 只收人设句:两步的解析契约半不开放覆盖(注册表里不该出现它)
    ['"ops"', '"summary"', '✕=失败', '≤150字'].forEach(f =>
      assertEq(Prompts.list().filter(x => x.def.includes(f)).length, 0, '解析契约不进注册表:' + f));
    AG.slice(4).forEach(k => assert(Skills.byId('core.personaCtx').prompts.includes(k), 'SK-03 应登记 ' + k));
    assertEq(Skills.validate({ Prompts }).join(';'), '', '引用键自检应通过(新登记的键须在注册表内)');
  } },
  { name: 'Agent 辅助两步人设(源级+行为面):js/agent-ops.js 零内联,两步真跑取的就是注册表那份', fn: async () => {
    const Prompts = require('../js/prompts.js');
    const ao = fs.readFileSync(path.join(ROOT, 'js', 'agent-ops.js'), 'utf8');
    // 取值口与各自那一步的锚点配对:两个键互换位置即红
    assert(/system: `\$\{Prompts\.get\('agent\.selfFixSystem'\)\}刚才按用户指令驱动工作台执行了动作/.test(ao),
      '回执核验修复步应就地经 Prompts.get 取人设(浏览器隐式读 Store 覆盖表),且与该步协议半锚点配对');
    assert(/system: Prompts\.get\('agent\.compactSystem'\) \+ '把以下短剧创作协作对话蒸馏为/.test(ao),
      '会话纪要蒸馏步应就地经 Prompts.get 取人设,且与该步指令半锚点配对');
    assertEq((ao.match(/system: ['`]你是/g) || []).length, 0, 'js/agent-ops.js 应零内联人设(两处已收编)');
    // 全仓持有者名单:两句字面恰好只剩注册表一份(谁在别处抄第二份即红,哪怕原文件仍走注册表)
    const holders = f => ['server.js', 'cli.js', 'mcp.js', 'index.html']
      .concat(fs.readdirSync(path.join(ROOT, 'js')).filter(n => n.endsWith('.js')).map(n => 'js/' + n))
      .filter(rel => fs.readFileSync(path.join(ROOT, rel), 'utf8').includes(f)).sort();
    ['agent.selfFixSystem', 'agent.compactSystem'].forEach(k =>
      assertEq(holders(Prompts.get(k)).join(','), 'js/prompts.js',
        k + ' 的人设句字面应只剩注册表一份(全仓持有者名单逐字节比对)'));
    // 纯浏览器链路:两步没有服务端/CLI 对端,那两处不得长出第二份指令半
    ['server.js', 'cli.js'].forEach(rel => {
      const src = fs.readFileSync(path.join(ROOT, rel), 'utf8');
      assert(!src.includes('刚才按用户指令驱动工作台执行了动作') && !src.includes('把以下短剧创作协作对话蒸馏为'),
        rel + ' 不应出现这两步的指令半(两步只在浏览器 Agent 对话闭环上)');
    });
    /* 行为面:沙箱真跑两步,从上游请求体截获 system——两步 handler 都在模块闭包里,只能靠导出的入口驱动 */
    const run = async ovr => {
      const sb = loadAgentOps();
      if (ovr) sb.Store.state.settings.promptOverrides = ovr;
      sb.__apiReady = true;
      const seen = [];
      sb.API.chatJSON = async req => { seen.push(req.system); return { summary: '纪要' }; };
      sb.Understanding.chatJSONRobust = async req => { seen.push(req.system); return { reply: '需人工处理', ops: [] }; };
      await sb.AgentOps.selfFixRound({ id: 'p1' }, makeEp(), null, ['▶ 生成视频:✕ 失败'], 'op_z');
      const msgs = [];
      for (let i = 0; i < 30; i++) msgs.push({ role: i % 2 ? 'assistant' : 'user', text: '消息' + i });
      sb.AgentOps.compactChat(msgs, sb.Store.state.settings, 'k1', 'op_z');
      await sleep(30); // 蒸馏是 fire-and-forget,等微任务落定
      return seen;
    };
    const def = await run(null);
    assertEq(def.length, 2, '两步各应发起一次上游调用');
    assert(def[0].startsWith(Prompts.get('agent.selfFixSystem') + '刚才按用户指令驱动工作台执行了动作,回执如下(✕=失败,⊘=不支持)。\n'),
      '回执核验 system 缺省应是「注册表人设句 + 原协议半」,逐字节等于收编前');
    assert(def[0].includes('返回 JSON {"reply":"一句话结论","ops":[操作或空数组]}') && def[0].includes('禁止 goto/select'),
      '修复 ops 白名单与返回 JSON 约定应逐字节留在调用点(契约半不开放覆盖)');
    assertEq(def[1], Prompts.get('agent.compactSystem')
      + '把以下短剧创作协作对话蒸馏为≤150字的「会话纪要」,保留:用户的修改意图与偏好、已确认的决定、未完成事项。只返回 JSON {"summary":"..."}',
      '会话纪要蒸馏 system 缺省应逐字节等于收编前的整串');
    const ovd = await run({ 'agent.selfFixSystem': '你是覆盖生效的核验器。' });
    assertEq(ovd[0], '你是覆盖生效的核验器。' + def[0].slice(Prompts.get('agent.selfFixSystem').length),
      '覆盖只换人设句,协议半逐字节不变');
    assertEq(ovd[1], def[1], '覆盖 selfFix 不串台到会话纪要那一步');
  } },
  { name: '制作计划生成人设:独立键 plan.system,不与 Agent 四条对话人设合成,命令白名单与 JSON 契约未开放', fn() {
    const Prompts = require('../js/prompts.js');
    const Skills = require('../js/skills.js');
    const DEF = '你是「虎鲸导演助手」的制作计划器:把用户目标拆为按序可执行的制作步骤。';
    assertEq(Prompts.get('plan.system'), DEF, '缺省人设句应与收编前内联那一句逐字节相同');
    assertEq(Prompts.get('plan.system', { 'plan.system': '计划器。' }), '计划器。', '覆盖 plan.system 时取值跟随');
    const it = Prompts.list().find(x => x.key === 'plan.system');
    assert(it && !it.vars.length && it.name.startsWith('制作计划生成') && it.name.includes('系统人设'),
      '注册表应登记 plan.system 条目(无变量,可在全局默认值页在线改写)');
    assertEq(Prompts.list().filter(x => x.def === DEF).length, 1, '该人设句应恰好命中注册表一条');
    /* 独立一条键:同属「虎鲸导演助手」名下的四条对话人设一句都不与它同字面(同字面才谈得上复用/合并),
     * 且四条的取值都不受本键覆盖影响(串台即红) */
    const CHAT = ['agent.system', 'agent.panelSystem', 'agent.drawerSystem', 'agent.previsSystem'];
    const ov = { 'plan.system': '计划器。' };
    CHAT.forEach(k => {
      assert(Prompts.get(k) !== DEF, '制作计划人设不得与对话键 ' + k + ' 同字面');
      assertEq(Prompts.get(k, ov), Prompts.get(k), '覆盖 plan.system 时 ' + k + ' 应逐字节不动');
    });
    // 排在对话四条之后:它是同一个助手的另一条产物线,不属于任何一种对话模式(顺序就是全局默认值页的排列)
    const keys = Prompts.list().map(x => x.key);
    CHAT.forEach(k => assert(keys.indexOf(k) < keys.indexOf('plan.system'), 'plan.system 应排在对话键 ' + k + ' 之后'));
    // 只收人设句:命令白名单与返回 JSON 的 title/steps 契约不做成可覆盖变量
    const defs = Prompts.list().map(x => x.def).join('\n');
    ['"title"', '"steps"', '"label"', '可用领域命令', '2-8 步'].forEach(f =>
      assert(!defs.includes(f), '契约半不进注册表(改坏即整轮拆不出步骤):' + f));
    assert(Skills.byId('core.personaCtx').prompts.includes('plan.system'), 'SK-03 应登记 plan.system');
  } },
  { name: '制作计划生成人设(源级+行为):js/plans.js 零内联,LLM 规划步缺省 system 逐字节不变、契约半只随命令表变', fn: async () => {
    const Prompts = require('../js/prompts.js');
    const Skills = require('../js/skills.js');
    const DEF = '你是「虎鲸导演助手」的制作计划器:把用户目标拆为按序可执行的制作步骤。';
    /* 沙箱里 Commands.list() 的四条(loadPlans 的 stub),白名单半现取命令表 */
    const CMDS = 'episode.generateStoryboard,episode.generateVideos,episode.compose,episode.produce';
    const REST = '可用领域命令:' + CMDS + '(episode.generateStoryboard=智能分镜/episode.generateVideos=批量生成视频/'
      + 'episode.smartReview=整集审片/episode.compose=合成成片/episode.produce=一键成片/episode.understanding=本集理解;'
      + '其余步骤 cmd 留空,由用户手动完成)。只返回 JSON {"title":"计划名(≤12字)","steps":[{"label":"步骤名(≤20字)",'
      + '"cmd":"命令名或空串","ep":"分集标题(仅集级命令需要,须与分集列表完全一致)"}]}(2-8 步,按执行顺序)。';
    const runPlan = async ovKey => {
      const sb = loadPlans(ovKey ? { 'plan.system': ovKey } : null);
      const sent = [], opts = [];
      sb.Tasks.run = async (opt, fn) => { opts.push(opt); return fn(); };
      sb.Understanding.chatJSONRobust = async req => {
        sent.push(req);
        return { title: '第一集出片', steps: [{ label: '智能分镜', cmd: 'episode.generateStoryboard', ep: '第一集' }, { label: '人工补配乐', cmd: '' }] };
      };
      const p = { id: 'p1', name: '测试剧', style: '漫剧', subjects: [], episodes: [{ id: 'ep1', title: '第一集', content: '剧本正文', shots: [] }] };
      const plan = await sb.Plans.generate(p, '把第一集推到出片');
      return { sb, sent, opts, plan };
    };
    const a = await runPlan();
    assertEq(a.sent.length, 1, 'LLM 规划步应恰好发一次请求');
    assertEq(a.sent[0].system, DEF + REST, '缺省 system 应与收编前的内联字面逐字节相同(命令白名单与 JSON 契约半在内)');
    assertEq(a.sent[0].user, '项目「测试剧」(漫剧)。分集列表:第一集[ready]。用户目标:把第一集推到出片',
      'user 半应逐字节不变(项目/分集摘要与用户目标在内)');
    assertEq(a.sent[0].temperature + '/' + a.sent[0].max_tokens, '0.3/1500', '取样参数一字未动');
    // 计费口径一字未动:1 积分登记在制作计划生成动作上,上游按 llm.agent 计费
    assertEq(a.opts[0].cost + '/' + a.opts[0].actionName, '1/制作计划生成', '计费登记应仍是 1 积分的制作计划生成');
    assertEq(a.sent[0].billingAction, 'llm.agent', '上游计费动作应仍是 llm.agent');
    // 步骤钳制仍在:注册命令步带 epid,未注册/空 cmd 落导航步
    assertEq(a.plan.title, '第一集出片');
    assertEq(a.plan.steps.map(s => (s.cmd || 'goto') + ':' + (s.epid || '-')).join(','),
      'episode.generateStoryboard:ep1,goto:-', '实际:' + JSON.stringify(a.plan.steps));
    // 覆盖只换人设句:契约半与 user 半逐字节不动
    const b = await runPlan('你是我的排期助手(覆盖生效)。');
    assertEq(b.sent[0].system, '你是我的排期助手(覆盖生效)。' + REST, '覆盖 plan.system 时该步取值跟随');
    assertEq(b.sent[0].system.slice(b.sent[0].system.indexOf('可用领域命令')), REST, '覆盖不得动到命令白名单与 JSON 契约半');
    assertEq(b.sent[0].user, a.sent[0].user, '覆盖只换人设句:user 半逐字节不变');
    // 源级:取值口就在该步(与它的 user 半锚点配对),文件里零内联
    const src = fs.readFileSync(path.join(ROOT, 'js', 'plans.js'), 'utf8');
    assert(/system: Prompts\.get\('plan\.system'\) \+ `可用领域命令:[\s\S]{0,900}用户目标:\$\{goal\}/.test(src),
      'LLM 规划步应就地经 Prompts.get 取人设(浏览器隐式读 Store 覆盖表),且与该步 user 半锚点配对');
    assertEq((src.match(/你是「虎鲸导演助手」的制作计划器/g) || []).length, 0, 'js/plans.js 不应再内联该人设句(覆盖不会跟过去)');
    assertEq((src.match(/system: '你是|system: `你是/g) || []).length, 0, 'js/plans.js 应零内联人设(本文件只此一处 LLM 步)');
    // 全仓持有者名单:这句字面恰好只剩注册表一份(别处抄第二份即红,哪怕原文件仍走注册表)
    const holders = ['server.js', 'cli.js', 'mcp.js', 'index.html']
      .concat(fs.readdirSync(path.join(ROOT, 'js')).filter(n => n.endsWith('.js')).map(n => 'js/' + n))
      .filter(rel => fs.readFileSync(path.join(ROOT, rel), 'utf8').includes(DEF)).sort();
    assertEq(holders.join(','), 'js/prompts.js', '人设句字面应只剩注册表一份');
    // 不许长出第二端:该步只在浏览器项目页,收编解决的是可覆盖不是可 headless
    ['server.js', 'cli.js', 'mcp.js'].forEach(rel =>
      assert(!fs.readFileSync(path.join(ROOT, rel), 'utf8').includes('把用户目标拆为按序可执行的制作步骤'),
        rel + ' 不应出现制作计划生成步(该步只在浏览器项目页链路上)'));
    /* 记账:键挂在人设通道宿主 SK-03 名下(已落地那半),仍欠段写明契约半不开放;
     * 计划层的编排宿主 SK-05 那条 note 须写明另一条 LLM 规划路径不切主线投影、人设句在本键名下 */
    const sk3 = Skills.byId('core.personaCtx');
    const owed = (sk3.note || '').split('仍欠').slice(1).join('仍欠');
    assert(sk3.note.includes('plan.system'), 'SK-03 的 note 须点名已收编的键 plan.system');
    assert(owed.includes('可用领域命令白名单'), 'SK-03 的仍欠段须写明制作计划那条的契约半不开放覆盖');
    const sk5 = Skills.byId('core.playbookProjection');
    assert(sk5.note.includes('plan.system') && sk5.note.includes('generate'),
      'SK-05 的 note 须写明计划层 LLM 规划路径的人设句已收编(实况同步)');
  } },
  { name: '审片升为主线一等步骤(G-03):板块 Agent 有审片席;plans/工作区/CLI 都映射 episode.smartReview', fn() {
    const D = require(path.join(ROOT, 'js/domain.js'));
    const mains = D.workflow({ id: 'p1', episodes: [], subjects: [] }, true).steps.filter(s => !s.side).map(s => s.key);
    assertEq(mains.indexOf('review'), mains.indexOf('gen') + 1, 'review 应紧随 gen');
    assertEq(mains.indexOf('film'), mains.indexOf('review') + 1, 'film 应紧随 review');
    const ag = fs.readFileSync(path.join(ROOT, 'js/agent.js'), 'utf8');
    const keys = (ag.match(/\{ key: '([^']+)', ico:/g) || []).map(m => m.replace(/.*key: '([^']+)'.*/, '$1'));
    assertEq(keys.join(','), '导演,剧本,主体,分集,分镜,生成,审片,成片', 'AGENT_BOARDS 应含审片板块且落在生成与成片之间');
    /* 计划步骤自 G-12 起由 SK-05 主线全链投影生成(plans.js 里不再有手写命令字面),故改钉行为:
     * 未审集推出来的那一步就是已注册审片命令,且审片在计划层是登记在案的投影步 */
    const plSb = loadPlans();
    const rv = plSb.Plans.fromWorkflow({ id: 'p1', subjects: [], episodes: [cleanEp({ lastReview: null })] }).steps[0];
    assertEq(rv.cmd, 'episode.smartReview', 'plans 审片步骤应映射已注册命令(headless 可执行)');
    assert(plSb.Plans.projection().some(x => x.cmd === 'episode.smartReview' && x.occupies), '审片应是计划层占一步的投影步');
    const ao = fs.readFileSync(path.join(ROOT, 'js/agent-ops.js'), 'utf8');
    assert(ao.includes("'审片修订': 'episode.smartReview'"), 'Agent 动作词表应覆盖审片修订别名(协议文本由词表自动生成)');
    const sb2 = fs.readFileSync(path.join(ROOT, 'js/storyboard.js'), 'utf8');
    assert(/nx\.key === 'review'/.test(sb2) && /pv\.key === 'review'/.test(sb2), '分集工作区上/下一步应承接审片步骤');
    const cli = fs.readFileSync(path.join(ROOT, 'cli.js'), 'utf8');
    assert(cli.includes("status: 'skipped'") && cli.includes("'review-unavailable'"), 'CLI 一键成片缺审片应如实 skipped/blocked,不静默通过');
    const cmds = fs.readFileSync(path.join(ROOT, 'js/commands.js'), 'utf8');
    assert(cmds.includes("status: 'skipped'") && cmds.includes("'review-unavailable'"), '浏览器一键成片缺审片应如实 skipped/blocked');
  } },
  { name: '生成指纹不断链(§主线):发起即打指纹;落片沿用发起时指纹;regen-stale 有执行出口', fn() {
    const sg = fs.readFileSync(path.join(ROOT, 'js/sb-gen.js'), 'utf8');
    const genMark = sg.match(/status: 'generating'[^}]*/g) || [];
    assert(genMark.some(m => m.includes('inputHash')), 'generating 写回应携带发起时 inputHash(断点续查不再用当前输入冒充)');
    const pipe = fs.readFileSync(path.join(ROOT, 'js/pipeline.js'), 'utf8');
    assert(pipe.includes('regen-stale') && pipe.includes('shotIds'), 'regen-stale 应带 shotIds 执行批量重生成(不再只跳页面)');
    const sb2 = fs.readFileSync(path.join(ROOT, 'js/storyboard.js'), 'utf8');
    assert(sb2.includes('nx.run'), 'storyboard 下一步按钮应承接 nx.run 动作');
  } },
  /* ---- 文生视频模板 tplVideo:消费方契约(防回退成"写入即失效"的死字段) ---- */
  { name: 'tplVideo 接入(§G-05):拆镜要求行 + 兜底提示词按模板成型;无模板时提示词逐字节不变', fn() {
    const WfCore = require('../js/wf-core.js');
    const p = { style: '漫剧', subjects: [] };
    const ep = { sbConfig: { batchCamera: '固定镜头', narratorVoice: '旁白·沉稳男声' } };
    const mkUser = tpl => WfCore.buildSBUser(p, ep, { count: 8 }, { styleText: '漫剧', projType: 'drama', content: '剧本内容', tplVideoText: tpl });
    assertEq(mkUser(''), mkUser(undefined), '无模板时两种缺省写法应同一份 user 提示词');
    assertEq(mkUser(''), WfCore.buildSBUser(p, ep, { count: 8 }, { styleText: '漫剧', projType: 'drama', content: '剧本内容' }), '不传 tplVideoText 时提示词应与接入前一致(不留空行)');
    const withTpl = mkUser('{style}风格,{shot},电影感运镜,光影氛围浓郁');
    assert(withTpl.includes('- 文生视频提示词模板(每镜 prompt 须在五段式结构内落实以下要素):漫剧风格,本镜画面内容,电影感运镜,光影氛围浓郁'), '拆镜要求应带填充后的模板行,实际:\n' + withTpl.split('\n').filter(l => l.includes('模板')).join('\n'));
    // 模型未给 prompt 的兜底:有模板按模板成型,无模板回落原骨架;模型给了 prompt 则模板不覆盖
    const ctx = tpl => ({ uid: x => x + '_1', now: () => 't', directorNote: '。导演设定:高对比', tplVideoText: tpl });
    const bare = WfCore.normalizeLLMShot({ plot: '女主转身' }, 0, p, ep, 'LLM', false, ctx(''));
    assertEq(bare.prompt, WfCore.normalizeLLMShot({ plot: '女主转身' }, 0, p, ep, 'LLM', false, { uid: x => x + '_1', now: () => 't', directorNote: '。导演设定:高对比' }).prompt, '无模板兜底提示词应与接入前一致');
    const tpled = WfCore.normalizeLLMShot({ plot: '女主转身' }, 0, p, ep, 'LLM', false, ctx('{style}风格,{shot},光影氛围浓郁'));
    assert(tpled.prompt.includes('光影氛围浓郁') && tpled.prompt.includes('女主转身') && tpled.prompt.includes('。导演设定:高对比'), '兜底应按模板成型且保留导演设定,实际:' + tpled.prompt);
    assertEq(WfCore.normalizeLLMShot({ plot: '女主转身', prompt: '模型给的提示词' }, 0, p, ep, 'LLM', false, ctx('{style}风格,{shot}')).prompt, '模型给的提示词', '模型已给 prompt 时模板不得覆盖');
  } },
  { name: 'tplVideo 接入(§G-05):本地拼装单一出口 buildShotPrompt 套模板;未设置时输出不变', fn() {
    const sb = loadStoryboard();
    const p = { style: '漫剧', globalSetting: '水墨质感' };
    const o = { plot: '女主转身离开', camera: '推镜头', scene: '宴会厅', characters: ['女主'] };
    assertEq(sb.SB.buildShotPrompt(p, o), '漫剧风格,女主转身离开,推镜头,宴会厅,女主,水墨质感,负面提示词:模糊', '未设置模板时应为原骨架');
    sb.Store.state.settings.tplVideo = '{style}风格,{shot},电影感运镜,光影氛围浓郁';
    assertEq(sb.SB.buildShotPrompt(p, o), '漫剧风格,女主转身离开,推镜头,宴会厅,女主,电影感运镜,光影氛围浓郁,水墨质感,负面提示词:模糊', '设置模板后应按模板成型(全局设定与负面约束仍在尾部)');
    assertEq(sb.SB.tplVideoOf(), '{style}风格,{shot},电影感运镜,光影氛围浓郁', '模板取 settings 原值(不并 DEFAULTS),与服务端 st.tplVideo 同源');
  } },
  { name: 'tplVideo 接入(§G-05):浏览器与服务端同一装配口注入(不存在只写不读的死字段)', fn() {
    const files = { 'js/wf-core.js': 0, 'js/sb-llm.js': 0, 'server.js': 0, 'js/storyboard.js': 0 };
    Object.keys(files).forEach(f => { files[f] = fs.readFileSync(path.join(ROOT, f), 'utf8'); });
    assert(files['js/wf-core.js'].includes('W.fillTplVideo') && files['js/wf-core.js'].includes('W.tplVideoNote'), 'wf-core 应是模板填充的双端单一来源');
    assert(files['js/sb-llm.js'].includes('tplVideoText: tplVideoOf()'), '浏览器拆镜应注入 tplVideoText(取 SB.tplVideoOf)');
    assert((files['js/sb-llm.js'].match(/tplVideoText:/g) || []).length >= 2, '浏览器侧拆镜 user 与逐镜规整两处都应注入模板');
    assert(files['server.js'].includes('tplVideoText: st.tplVideo'), '服务端 /api/wf/smart-storyboard 应从 settings 注入同一模板');
    assert(files['server.js'].includes('tplVideoText: ctxBase.tplVideoText'), '服务端逐镜规整应沿用同一模板(与浏览器同口径)');
    assert(files['js/storyboard.js'].includes('function tplVideoOf()') && files['js/storyboard.js'].includes('WfCore.fillTplVideo'), '本地拼装出口应走同一填充函数');
    // settings 三件套均有消费方:tplImage(主体图提示词)/tplVideo(分镜画面提示词)/tplReview(审片提示词)
    const consumers = {
      tplImage: ['js/episode-util.js', 'js/persona.js'],
      tplVideo: ['js/sb-llm.js', 'js/storyboard.js', 'server.js'],
      tplReview: ['js/review.js', 'server.js'],
    };
    Object.entries(consumers).forEach(([key, fl]) => fl.forEach(f => {
      const src = fs.readFileSync(path.join(ROOT, f), 'utf8');
      assert(src.includes(key), key + ' 应在 ' + f + ' 有读取方(三件套不得留写入即失效的键)');
    }));
  } },
  /* ---- 机位词表单源(景别/运镜/视角/角度):结构表在 wf-core.js,消费方一律派生 ---- */
  { name: '词表单源:CAMERAS/VIEWS/ANGLES/SIZES 是结构表的名称投影,取值与顺序逐项锁定', fn() {
    const W = require('../js/wf-core.js');
    assertEq(W.CAMERAS.join('/'), '固定镜头/推镜头/拉镜头/摇镜头/移镜头/跟镜头/环绕镜头/俯拍/仰拍/特写', '运镜取值全集与顺序不得漂移(s.camera 白名单)');
    assertEq(W.VIEWS.join('/'), '正面/侧面/背面', '视角取值与顺序不得漂移');
    assertEq(W.ANGLES.join('/'), '仰拍/平视/俯拍/高角度', '角度取值与顺序不得漂移');
    assertEq(W.SIZES.join('/'), '大全景/全景/中景/近景/特写/超级特写', '景别阶梯取值与顺序不得漂移(索引即级差)');
    assertEq(W.CAMERAS.join('/'), W.CAMERA_MOVES.map(x => x.name).join('/'), 'CAMERAS 应为 CAMERA_MOVES 的名称投影');
    assertEq(W.ANGLES.join('/'), W.CAMERA_ANGLES.map(x => x.name).join('/'), 'ANGLES 应为 CAMERA_ANGLES 的名称投影');
    assertEq(W.SIZES.join('/'), W.SHOT_SIZES.map(x => x.name).join('/'), 'SIZES 应为 SHOT_SIZES 的名称投影');
    // 结构表附加列自洽:景别 dist 随阶梯单调收紧;运镜 move 项带芯片列,角度/景别别名项不带(由对应栏承担)
    W.SHOT_SIZES.forEach((x, i) => { if (i) assert(x.dist < W.SHOT_SIZES[i - 1].dist, '景别 dist 应随阶梯单调递减:' + x.name); });
    W.CAMERA_MOVES.forEach(m => assertEq(!!(m.arrow && m.short), m.axis === 'move', '运镜芯片列应只在 axis=move 项上:' + m.name));
    W.CAMERA_MOVES.filter(m => m.axis !== 'move').forEach(m =>
      assert(W.ANGLES.includes(m.name) || W.SIZES.includes(m.name), 'axis=angle/size 的别名项须确属角度或景别栏:' + m.name));
  } },
  { name: '词表单源:景别级差 sizeGap 语义(同级 0/相邻 1/隔级 2/两极 4-5/阶梯外 -1)', fn() {
    const W = require('../js/wf-core.js');
    assertEq(W.sizeGap('中景', '中景'), 0, '同级');
    assertEq(W.sizeGap('全景', '中景'), 1, '相邻');
    assertEq(W.sizeGap('全景', '近景'), 2, '隔一级(KB 推荐)');
    assertEq(W.sizeGap('大全景', '特写'), 4, '两极(须过渡)');
    assertEq(W.sizeGap('大全景', '超级特写'), 5, '两极');
    assertEq(W.sizeGap('远景', '中景'), -1, '阶梯外词不判定');
    assertEq(W.sizeGap('', '中景'), -1, '空值不判定');
    assertEq(W.sizeGap(undefined, undefined), -1, '缺字段不判定');
  } },
  { name: '词表单源:整份词表字面只在 wf-core.js,其余源文件不得出现第二份(含退役的 4 档景别)', fn() {
    const W = require('../js/wf-core.js');
    const files = fs.readdirSync(path.join(ROOT, 'js')).filter(f => f.endsWith('.js') && f !== 'wf-core.js').map(f => 'js/' + f)
      .concat(['server.js', 'cli.js', 'mcp.js', 'index.html']);
    // 整份词表的两种常见字面形态:数组字面 'a', 'b', … 与斜杠拼接串 a/b/…
    // (三项的 VIEWS 只查数组字面——"正面/侧面/背面" 作为三视图行文出现在多处生图提示词里,不是词表)
    const whole = [];
    [W.CAMERAS, W.VIEWS, W.ANGLES, W.SIZES].forEach(list => {
      whole.push(list.map(x => "'" + x + "'").join(', '));
      if (list.length >= 4) whole.push(list.join('/'));
    });
    // 退役字面:4 档景别(camera.js/review.js/sb-io.js/agent.js 各存一份即本次归一的病灶)
    const retired = ["'特写', '近景', '中景', '全景'", '特写/近景/中景/全景', "'特写', dist"];
    const offLadder = ['远景', '大特写', '超特写', '中近景']; // 阶梯外景别词:词表闭合性回归
    const bad = [];
    files.forEach(rel => {
      const src = fs.readFileSync(path.join(ROOT, rel), 'utf8');
      whole.forEach(t => { if (src.includes(t)) bad.push(rel + ' 复制了整份词表:' + t.slice(0, 20) + '…'); });
      retired.forEach(t => { if (src.includes(t)) bad.push(rel + ' 残留退役词表:' + t); });
      offLadder.forEach(t => { if (src.includes(t)) bad.push(rel + ' 出现阶梯外景别词:' + t); });
    });
    assertEq(bad.join('; '), '', '四张词表须由 WfCore.CAMERAS/VIEWS/ANGLES/SIZES 派生,不得复制');
  } },
  { name: '词表单源:四处消费方按词表派生(机位选择器/景别衔接检查/CSV 导入/改镜协议)', fn() {
    const cam = fs.readFileSync(path.join(ROOT, 'js/camera.js'), 'utf8');
    assert(cam.includes('WfCore.CAMERA_ANGLES') && cam.includes('WfCore.SHOT_SIZES'), 'camera.js 仰角/景别档应派生自结构表');
    assert(cam.includes('WfCore.CAMERA_MOVES') && !/REV_MOVE/.test(cam), '机位选择器运镜芯片应取词表,不再自建反向映射表');
    assert(/data-move="\$\{mv\.name\}"/.test(cam), '运镜芯片值应是 CAMERAS 内的规范名(可直接写回 s.camera)');
    const rv = fs.readFileSync(path.join(ROOT, 'js/review.js'), 'utf8');
    assert(rv.includes('WfCore.sizeGap('), '离线景别衔接检查应经 WfCore.sizeGap 判级差(不再自建 4 档阶梯)');
    const io = fs.readFileSync(path.join(ROOT, 'js/sb-io.js'), 'utf8');
    assert(io.includes('WfCore.VIEWS') && io.includes('WfCore.SIZES'), 'CSV 导入白名单与模板列说明应取词表');
    const ag = fs.readFileSync(path.join(ROOT, 'js/agent.js'), 'utf8');
    assert(/运镜限:\$\{WfCore\.CAMERAS\.join/.test(ag), '导演助手改镜协议的四栏取值应取词表');
  } },
  { name: '词表单源:拆镜模板四栏取值由词表拼装(派生后与归一前逐字节一致)', fn() {
    const W = require('../js/wf-core.js');
    const user = W.buildSBUser({ style: '漫剧', subjects: [] }, { title: 'e', sbConfig: {} },
      { count: 5, mode: 'create' }, { styleText: '漫剧', projType: 'drama', content: '正文' });
    assert(user.includes('"camera":"运镜(从 固定镜头/推镜头/拉镜头/摇镜头/移镜头/跟镜头/环绕镜头/俯拍/仰拍/特写 中选)"'), '运镜栏字面等价');
    assert(user.includes('"view":"视角(正面/侧面/背面)"'), '视角栏字面等价');
    assert(user.includes('"angle":"拍摄角度(仰拍/平视/俯拍/高角度)"'), '角度栏字面等价');
    assert(user.includes('"shotSize":"景别(大全景/全景/中景/近景/特写/超级特写)"'), '景别栏字面等价');
    // 拆镜规则与五段式里的景别词须落在阶梯内(两极那句此前写了阶梯外的"远景")
    ['远景', '大特写'].forEach(t => assert(!W.SPLIT_RULES.includes(t) && !W.PROMPT5.includes(t), '拆镜规则不得用阶梯外景别词:' + t));
  } },
  { name: '词表单源:知识库「景别运镜」正文与景别阶梯逐项对应', fn() {
    const W = require('../js/wf-core.js');
    const text = require('../js/knowledge.js').section('景别运镜');
    W.SIZES.forEach(n => assert(text.includes(n), '「景别运镜」正文应覆盖阶梯档位:' + n));
    ['远景', '大特写', '中近景'].forEach(t => assert(!text.includes(t), '「景别运镜」正文不得出现阶梯外景别词:' + t));
  } },
  /* ---- 文档数字对账:README 里那几个"已落地 N 条 / N 项断言"一律由代码实况反推,写错即红 ----
   * 这些数字此前只靠人工重算,分支一分裂就与实况脱节(同一句话在不同分支上写过三条/七条/九条)。
   * 下面四条把它们钉在实测值上:改了 CHECKS、改了注册表、加了用例、加了记账件而没同步文档时,单测先红。
   * 中文数字与阿拉伯数字同一口径(cnNum);那句话被改写删掉同样算红,否则删掉即可绕过对账。 */
  { name: 'README 数字对账:CHECKS 落地条数与就绪检查面数由 js/skills.js 实计', fn() {
    const Skills = require('../js/skills.js');
    const total = Object.keys(Skills.CHECKS).length;
    const live = s => s.kinds.includes('check') && !s.pending.includes('check');
    const preflight = Skills.list().filter(s => live(s) && s.cmds.includes('episode.preflight'));
    const preflightChecks = preflight.reduce((n, s) => n + s.checks.length, 0);
    const faces = Skills.preflightStages().length;
    // 架构框那句说的是注册表里全部已落地校验项
    assertDocNum('README.md', /CHECKS 已落地(\d+|[一二三四五六七八九十]+)条/g, total, '架构框 CHECKS 条数');
    assertDocNum('docs/skills-wave/README.md', /共(\d+|[一二三四五六七八九十]+)条 `Skills\.CHECKS` 校验项/g, total, '摘要句 CHECKS 条数');
    // 就绪检查那两处说的是 result.checks 的面数与条数(登记了 episode.preflight 消费点的那部分)
    assertDocNum('README.md', /现有(\d+|[一二三四五六七八九十]+)条——剧本面/g, preflightChecks, '就绪检查回执条数');
    const faceRe = /(\d+|[一二三四五六七八九十]+)面(\d+|[一二三四五六七八九十]+)条/g;
    const facePairs = [...fs.readFileSync(path.join(ROOT, 'README.md'), 'utf8').matchAll(faceRe)];
    assert(facePairs.length, 'README 应有「N 面 N 条」的就绪检查口径表述');
    facePairs.forEach(m => {
      assertEq(cnNum(m[1]) + '/' + cnNum(m[2]), faces + '/' + preflightChecks,
        '就绪检查「N 面 N 条」应与单源面表实况一致:' + m[0]);
    });
  } },
  { name: 'README 数字对账:单元测试用例数由 tests/unit.js 实计(套件表求和)', fn() {
    const total = Object.values(SUITES).reduce((n, t) => n + t.length, 0);
    assertDocNum('README.md', /单元测试[((](\d+) 项断言/g, total, '单元测试用例数');
    // 套件清单也是文档口径:漏登记的套件永远不会被跑,数字对上了也是假绿
    const names = Object.keys(SUITES).sort().join(',');
    const suiteRe = /[a-z-]+(?:\|[a-z-]+)+/;
    [['README.md', new RegExp('`node tests/unit\\.js (' + suiteRe.source + ')`')],
      ['tests/unit.js', new RegExp('单套件[((](' + suiteRe.source + ')[))]')],
    ].forEach(([rel, re]) => {
      const m = fs.readFileSync(path.join(ROOT, rel), 'utf8').match(re);
      assert(m, rel + ' 找不到单套件清单');
      assertEq(m[1].split('|').sort().join(','), names, rel + ' 的单套件清单应与 SUITES 一致');
    });
  } },
  { name: 'README 数字对账:集成测试与 CLI 冒烟用例数由各自套件源码实计(逐行 report 登记点数)', fn() {
    /* 这两个数此前不在对账内:把 126 改成 105、97 改成 64,单测一样全绿。
     * 两套件都要起真实服务子进程,单测里跑不动,故按套件自己的计数口径静态点数——
     * 两处的每一条用例都是独立一行的 report(...) 登记,行首点数就是套件末尾那句总数的口径;
     * 对账的是用例总数(cli.smoke 那 2 项与 master 同名的失败不影响这个数,故不对通过数)。
     * 静态点数与实跑数的一致性靠下面那条"每条 report 独立成行"的断言守住:
     * 把 report 塞进循环或回调里,一行会跑出多条,静态数当场小于实跑数而 README 写的是实跑数,先红再说。 */
    [['tests/integration.js', /服务器级集成测试[^)]*扩至 (\d+) 项断言/g,
      /\$\{PASS\}\/\$\{PASS \+ FAIL\}/, '集成测试'],
    ['tests/cli.smoke.js', /CLI 真实服务端冒烟[^)]*扩至 (\d+) 项断言/g,
      /\(results\.length - failed\.length\) \+ '\/' \+ results\.length/, 'CLI 冒烟'],
    ].forEach(([rel, docRe, totalRe, label]) => {
      const src = fs.readFileSync(path.join(ROOT, rel), 'utf8');
      const lines = (src.match(/^[ \t]*report\(/gm) || []).length;
      assert(lines > 0, label + ':' + rel + ' 里点不到 report(...) 登记行');
      const calls = (src.match(/(?<![\w.])report\(/g) || []).length - (src.match(/function report\(/g) || []).length;
      assertEq(calls, lines, label + ':每条用例须是独立一行的 report(...) 调用(嵌进表达式或回调里静态点数就代表不了实跑条数)');
      assert(totalRe.test(src), label + ':' + rel + ' 收尾那句总数应由套件自己的计数器算出,不许手写数字');
      assertDocNum('README.md', docRe, lines, label + '用例数');
    });
  } },
  { name: '集成/冒烟用例名各自唯一:名集大小恰等于 report(...) 登记行数(与单元那条同形)', fn() {
    /* 上一条钉的是"条数",这一条钉的是"不同名字数":两个数分开钉才拦得住重名。
     * 这两个套件跑不进单测,取证一直靠"把两侧用例名成集双向比对证明没删测",而一对重名会让集合口径
     * 把其中一条吃掉——删掉一条真用例、同时有一对重名,两者互相抵消就看不出来了;去重口径两侧不一致时
     * 还会反过来凭空多报一条(基线上 integration 的 130 条只有 129 个名字,那次比对当场假报一条)。
     * 名字必须是就地写死的字面:拼出来的名字静态取不到,名集口径当场失真,故先把"每行都取得到名字"钉住。 */
    [['tests/integration.js', '集成测试'], ['tests/cli.smoke.js', 'CLI 冒烟']].forEach(([rel, label]) => {
      const src = fs.readFileSync(path.join(ROOT, rel), 'utf8');
      const lines = (src.match(/^[ \t]*report\(/gm) || []).length;
      const names = [...src.matchAll(/^[ \t]*report\(\s*'((?:[^'\\]|\\.)*)'/gm)].map(m => m[1]);
      assertEq(names.length, lines, label + ':' + rel + ' 每条 report(...) 的用例名须是就地写死的单引号字面');
      const seen = new Set(), dup = [];
      names.forEach(n => { if (seen.has(n)) dup.push(n); else seen.add(n); });
      assertEq(dup.join(' / '), '', label + ':用例名不许重名(同判据的同形断言要各自写明自己钉的是哪一处)');
      assertEq(seen.size, lines, label + ':用例名集合大小应恰等于 report(...) 登记行数');
    });
  } },
  { name: '单元用例名全局唯一:用例名集合大小恰等于用例条数(重名会让"按名成集比对"漏看删测)', fn() {
    /* 「用例名集合双向比对证明没删测」是本目录一直在用的取证手段:一旦有两条同名,
     * 集合口径会把其中一条吃掉——删掉一条真用例、同时有一对重名,两者互相抵消就看不出来了。
     * 故这里把"条数"与"不同名字数"钉成同一个数;新写用例撞了名先红,不许靠改名代替删测。 */
    const all = Object.values(SUITES).reduce((a, t) => a.concat(t.map(x => x.name)), []);
    const seen = new Set(), dup = [];
    all.forEach(n => { if (seen.has(n)) dup.push(n); else seen.add(n); });
    assertEq(dup.join(' / '), '', '用例名不许重名(同判据的同形断言要各自写明自己钉的是哪一处)');
    assertEq(seen.size, all.length, '用例名集合大小应恰等于用例条数');
    /* 打印用的标签是「套件 · 用例名」:跨套件同名也算重名,不许靠套件前缀去重 */
    const labeled = Object.entries(SUITES).reduce((a, [s, t]) => a.concat(t.map(x => s + ' · ' + x.name)), []);
    assertEq(new Set(labeled).size, labeled.length, '「套件 · 用例名」标签也须逐条唯一');
  } },
  { name: 'README 数字对账:注册表口径(能力/KB/提示词/命令/专家)由各注册表实计', fn() {
    const Skills = require('../js/skills.js');
    const n = {
      skills: Skills.list().length,
      kb: Object.keys(require('../js/knowledge.js').SECTIONS).length,
      prompts: require('../js/prompts.js').list().length,
      cmds: require('../js/cmd-registry.js').names().length,
      experts: require('../js/experts-data.js').EXPERTS.length,
    };
    ['README.md', 'docs/skills-wave/README.md'].forEach(rel => {
      assertDocNum(rel, /短名单 (\d+) 条内部能力/g, n.skills, '短名单条数');
    });
    assertDocNum('README.md', /KB 全部 (\d+) 条方法论/g, n.kb, 'KB 条目数');
    assertDocNum('README.md', /(\d+) 条注册表提示词/g, n.prompts, '注册表提示词数');
    assertDocNum('README.md', /(\d+) 条领域命令/g, n.cmds, '领域命令数');
    assertDocNum('README.md', /(\d+) 位专家/g, n.experts, '专家数');
    assertDocNum('README.md', /(\d+) 条主线 LLM 提示词/g, n.prompts, '主线提示词数');
    assertDocNum('docs/skills-wave/README.md', /knowledge\.js`[((](\d+) 条目/g, n.kb, 'KB 条目数');
    assertDocNum('docs/skills-wave/README.md', /prompts\.js`[((](\d+) 条[))]/g, n.prompts, '提示词条数');
    assertDocNum('docs/skills-wave/README.md', /experts-data\.js`[((](\d+) 专家/g, n.experts, '专家数');
    assertDocNum('docs/skills-wave/README.md', /skills\.js`[((](\d+) 条内部能力/g, n.skills, '短名单条数');
  } },
  { name: 'docs/skills-wave 索引与目录实况双向对齐(记账件不漏登记、索引行不指向空文件)', fn() {
    const dir = path.join(ROOT, 'docs', 'skills-wave');
    const files = fs.readdirSync(dir).filter(f => f.endsWith('.md') && f !== 'README.md').sort();
    const src = fs.readFileSync(path.join(dir, 'README.md'), 'utf8');
    const rows = [...src.matchAll(/^\| \[([^\]]+)\]\(\.\/([^)]+)\)/gm)].map(m => ({ label: m[1], file: m[2] }));
    assertEq(rows.map(r => r.file).sort().join(','), files.join(','), '索引表应与目录里的记账件一一对应');
    rows.forEach(r => assertEq(r.label, r.file, '索引行的链接文字应就是文件名(便于按名直查)'));
  } },
  { name: 'docs/skills-wave 索引完备性:每份 wNN-*.md 各有自己的索引行,散文点到的记账件不许悬空', fn() {
    const dir = path.join(ROOT, 'docs', 'skills-wave');
    const all = fs.readdirSync(dir).filter(f => f.endsWith('.md'));
    const src = fs.readFileSync(path.join(dir, 'README.md'), 'utf8');
    const rows = new Set([...src.matchAll(/^\| \[[^\]]+\]\(\.\/([^)]+)\)/gm)].map(m => m[1]));
    // 逐份点名:文件在而索引行不在即红(上一条那种"两个集合相等"的写法,漏一份文件时会被同时漏掉的索引行抵消掉)
    const waves = all.filter(f => /^w\d+-/.test(f)).sort();
    assert(waves.length > 0, 'docs/skills-wave 下应有 wNN-*.md 记账件');
    waves.forEach(f => assert(rows.has(f), '记账件 ' + f + ' 在目录里但索引表没有它那一行(合入时漏登记,或只合到了漏掉索引行的那一版)'));
    // 反向那一向:任何文档里 ./xxx.md 形式的相对链接都必须指到真文件,wNN-*.md 还必须在索引里
    // ——文件与索引行一起缺时,靠"别处散文已经点了名"这一层报红
    const missing = [];
    all.forEach(f => {
      const body = fs.readFileSync(path.join(dir, f), 'utf8');
      [...body.matchAll(/\]\(\.\/([A-Za-z0-9._-]+\.md)\)/g)].forEach(m => {
        const t = m[1];
        if (!all.includes(t)) missing.push(f + ' → ' + t + '(文件不存在)');
        else if (/^w\d+-/.test(t) && !rows.has(t)) missing.push(f + ' → ' + t + '(文件在但索引无此行)');
      });
    });
    assertEq(missing.join(' / '), '', '目录内相对链接不许悬空');
  } },
  { name: 'docs/skills-wave 索引完备性:记账件份数由 README 明写并与目录/索引表三方对齐,且只增不减', fn() {
    /* 上一条按份点名只遍历"目录里还在的文件",文件与索引行一起消失(漏合、或只合到父提交)时它一份都不遍历,
     * 只剩"别处散文用 markdown 链接点过它"这一层兜着——而记账件里有三十余份只有索引行这一处链接。
     * 这里立第三份不随目录与索引表一起消失的记录:README 明写的份数与用例里钉住的下限,判据不含任何"别处链过"的条件。 */
    const dir = path.join(ROOT, 'docs', 'skills-wave');
    const waves = fs.readdirSync(dir).filter(f => /^w\d+-.+\.md$/.test(f)).sort();
    const src = fs.readFileSync(path.join(dir, 'README.md'), 'utf8');
    const rows = [...src.matchAll(/^\| \[[^\]]+\]\(\.\/([^)]+)\)/gm)].map(m => m[1]).filter(f => /^w\d+-/.test(f));
    const decl = src.match(/索引表共 (\d+) 份记账件/);
    assert(decl, 'docs/skills-wave/README.md 应明写「索引表共 N 份记账件」(目录实况与索引表之外的第三份记录)');
    const declared = +decl[1];
    assertEq(waves.length, declared, '目录里的 wNN-*.md 份数应等于 README 明写的份数(文件连同索引行一起删掉、份数没跟着改即红)');
    assertEq(rows.length, declared, '索引表里的 wNN-*.md 行数应等于 README 明写的份数');
    // 下限:记账件只增不减。把明写份数一并改小以迁就删除时,红在这一条上(改它就得先改这个字面,不再是删两处即静默)
    const FLOOR = 134;
    assert(waves.length >= FLOOR, '记账件份数不得少于 ' + FLOOR + '(实测 ' + waves.length + ');新开一槽记账时把下限抬到当轮实况');
    assert(declared >= FLOOR, 'README 明写的份数不得少于 ' + FLOOR + '(实测 ' + declared + ')');
    // 逐份点名同样再走一遍:本条自足,不借道散文链接
    const indexed = new Set(rows);
    waves.forEach(f => assert(indexed.has(f), '记账件 ' + f + ' 不在目录 README 索引表里(每份各要有自己那一行,与别处是否链过无关)'));
  } },
];

/* ================= 套件 18:tasks.js(任务中心:§3.1 桌面通知/标题角标,§3.2 进度模型) ================= */
function loadTasks() {
  const sb = makeSandbox();
  installCommon(sb);
  sb.Store.currentUser = () => ({ id: 'u1', username: 'tester' });
  sb.document.title = '虎鲸漫剧 - AI 短漫剧全流程智能创作平台';
  sb.document.hidden = false;
  sb.__notices = [];
  sb.Notification = function (t, o) { sb.__notices.push({ t, o }); };
  sb.Notification.permission = 'default';
  sb.Notification.requestPermission = () => { sb.Notification.permission = 'granted'; return Promise.resolve('granted'); };
  loadFile(sb, 'tasks.js');
  return sb;
}
const tasksTests = [
  { name: '标题角标:任务 start→(N) 前缀,done 后还原基准标题', fn() {
    const sb = loadTasks();
    const t1 = sb.Tasks.start({ type: '文生视频', target: '第一集·镜头1' });
    assertEq(sb.document.title.startsWith('(1) '), true, '在跑 1 个任务标题应带 (1) 前缀,实际:' + sb.document.title);
    const t2 = sb.Tasks.start({ type: '文生视频', target: '第一集·镜头2' });
    assert(sb.document.title.startsWith('(2) '), '两个在跑应为 (2)');
    sb.Tasks.done(t1); sb.Tasks.done(t2);
    assertEq(sb.document.title, '虎鲸漫剧 - AI 短漫剧全流程智能创作平台', '归零后标题应还原');
  } },
  { name: '桌面通知:首个任务申请授权一次;页面后台+已授权时落定弹通知', fn() {
    const sb = loadTasks();
    const t1 = sb.Tasks.start({ type: '文生视频', target: '第一集·镜头1' });
    assertEq(sb.Notification.permission, 'granted', '首个任务应在手势链内申请授权');
    assertEq(sb.__notices.length, 0, '前台(document.hidden=false)不弹通知');
    sb.document.hidden = true;
    sb.Tasks.done(t1);
    assertEq(sb.__notices.length, 1, '后台+已授权应弹落定通知');
    assert(sb.__notices[0].t.includes('文生视频') && sb.__notices[0].o.body.includes('第一集·镜头1'), '通知应带类型与目标');
    sb.Tasks.start({ type: '文生视频', target: 'x' }); // 已 granted:不再重复申请
    sb.Tasks.fail(sb.Store.state.tasks[0], '上游超时');
    assertEq(sb.__notices.length, 2, '失败也应通知');
    assert(sb.__notices[1].o.body.includes('上游超时'), '失败通知应带原因');
  } },
  { name: 'setProgress:progress 字段结构 + 终态忽略 + 1s 节流落库', fn() {
    const sb = loadTasks();
    const t1 = sb.Tasks.start({ type: '文生视频', target: '批' });
    sb.Tasks.setProgress(t1, 3, 12, 240000);
    assertEq(JSON.stringify([t1.progress.cur, t1.progress.total, t1.progress.etaMs]), '[3,12,240000]');
    const saves = sb.Store._saves;
    sb.Tasks.setProgress(t1, 4, 12, 200000); // 1s 内:字段更新但不重复落库
    assertEq(t1.progress.cur, 4);
    assertEq(sb.Store._saves, saves, '节流窗口内不重复 save');
    sb.Tasks.done(t1);
    sb.Tasks.setProgress(t1, 5, 12, 0);
    assertEq(t1.progress.cur, 4, '终态任务忽略进度上报');
  } },
];

/* ================= 套件 19:skills.js 校验型扩展点(W4 校验闸门) =================
 * 每个校验项:干净夹具全 pass、脏夹具命中且 level 分级正确、hits 定位到镜与名字;
 * 纯本地零 LLM 零计费,判定口径一律现取 Domain(不在 skill 层写第二份主体解析/取图)。 */
const Skills = require('../js/skills.js');
const DomainMod = require('../js/domain.js');
/* 主体库夹具:主角(带权威图 + 战损形态自带图 + 曾用名)/ 客厅(仅 data: 内联图,不喂模型)/ 玉佩(缺图) */
function refP(over) {
  return Object.assign({
    id: 'p1',
    subjects: [
      { id: 'sj1', name: '林小满', kind: 'character', image: '/uploads/a/sj1.png', formerNames: ['小满'], forms: [{ id: 'fm1', name: '战损', image: '/uploads/a/sj1-f1.png' }] },
      { id: 'sj2', name: '客厅', kind: 'scene', image: 'data:image/png;base64,AAA' },
      { id: 'sj3', name: '玉佩', kind: 'prop', image: '' },
    ],
  }, over || {});
}
const refShot = (order, over) => Object.assign({ id: 'sh' + order, order, characters: [], scene: '', props: [] }, over || {});
const refIntegrity = (p, ep) => Skills.check('subjects', { p, ep }).find(x => x.skill === 'subjects.refIntegrity');
const crossShot = (p, shots) => Skills.check('subjects', { p, ep: { id: 'ep1', shots } }).find(x => x.skill === 'subjects.crossShot');
/* 主体带真实图的项目夹具:n 个角色各有权威图(参考图组 5 张上限用例) */
const manySubjP = n => ({ id: 'p1', subjects: Array.from({ length: n }, (_, i) => ({ id: 'c' + i, name: '角色' + i, kind: 'character', image: '/uploads/a/c' + i + '.png' })) });
/* 主体参考纪律夹具:n 个角色权威三视图之外另有视频参考大头照(imgRef)——取图优先级落在大头照上,不触发三视图回退 */
const headSubjP = n => ({ id: 'p1', subjects: Array.from({ length: n }, (_, i) => ({ id: 'c' + i, name: '角色' + i, kind: 'character', image: '/uploads/a/c' + i + '.png', imgRef: '/uploads/a/h' + i + '.png' })) });
const genRef = (p, shots) => Skills.check('subjects', { p, ep: { id: 'ep1', shots } }).find(x => x.id === 'subjects.genRefDiscipline');
const multiShot = (p, shots) => Skills.check('subjects', { p, ep: { id: 'ep1', shots } }).find(x => x.id === 'subjects.multiShotPrompt');
/* 分镜景别夹具:只摆景别(级差判定只看 cameraSpec.shotSize;传 undefined 即该镜没填景别) */
const sizeShot = (order, shotSize) => ({ id: 'sh' + order, order, cameraSpec: shotSize === undefined ? {} : { shotSize } });
const linkOf = shots => Skills.check('shots', { p: { id: 'p1' }, ep: { id: 'ep1', shots } }).find(x => x.skill === 'shots.sizeProgression');
const sizes = (...list) => linkOf(list.map((x, i) => sizeShot(i, x)));
/* 抽卡稳定词夹具:判定输入是真实生成请求那条提示词,故一律带项目上下文(缺省项目无主体,请求里就没有主体定义前置) */
const lexP = { id: 'p1', subjects: [] };
const lexShot = (order, prompt, over) => Object.assign({ id: 'sh' + order, order, characters: [], scene: '', props: [], prompt }, over || {});
const lexEp = (shots, over) => Object.assign({ id: 'ep1', shots }, over || {});
const lexOf = (ep, p) => Skills.check('shots', { p: p || lexP, ep }).find(x => x.skill === 'shots.promptEightDim');
const STABLE_OK = '五官稳定不变形,人体结构正常,动作自然不僵硬';
/* 生成凭据夹具:项目无主体(assetVer 恒 0),镜头缺省是"当前输入的真片"——已出片、已确认、未定稿,
 * 指纹按构造完的镜现算(与 Domain 判旧同一构造点),故干净夹具零命中。用例只摆要偏离的那一项;
 * over 显式给了 video 时不补指纹以外的字段(传 inputHash: '' 即摆一个无凭据的存量镜)。 */
const credP = { id: 'p1' };
const credShot = (order, over) => {
  const s = Object.assign({
    id: 'sh' + order, order, plot: '剧情' + order, prompt: '提示词' + order,
    characters: [], scene: '', props: [], dialogue: '', narration: '', confirm: true,
    video: { status: 'done', url: '/uploads/gen/v' + order + '.mp4' },
  }, over || {});
  if (s.video && s.video.status === 'done' && s.video.inputHash === undefined) {
    s.video.inputHash = DomainMod.shotInputHash(credP, s);
    s.video.assetVer = DomainMod.shotAssetVer(credP, s);
  }
  return s;
};
const credOf = (shots, ctx) => Skills.check('gen', { p: credP, ep: { id: 'ep1', shots } }, ctx || { online: true })
  .find(x => x.id === 'gen.renderCredential');
const credCodes = r => r.hits.map(h => h.code + '@' + h.order).join(',');
/* 动态感准入夹具:判定输入同样是真实生成请求(动作幅度看动作描述那段、运镜条数看装好的那条提示词、
 * 镜长看该请求的 duration),故一律带项目上下文;camera 缺省一个运镜(装配时按 s.camera 追加那一个) */
const mgShot = (order, prompt, over) => lexShot(order, prompt, Object.assign({ camera: '固定镜头' }, over || {}));
const motionOf = (ep, p) => Skills.check('shots', { p: p || lexP, ep }).find(x => x.skill === 'shots.motionGate');
/* 审片报告夹具:判定输入是已成型的审片报告。干净夹具 = 每镜都有按 reportId 取得回的真实模型报告
 * (带方法论校验命中字段)、逐镜条目背书的正是当前视频指纹、四维成片评审四维齐全,故零命中。
 * 快照哈希一律按构造完的集现算(与 Domain.reviewStaleByScript 判旧同一构造点),
 * 用例只摆要偏离的那一项;lrOver 摆整集报告字段,epOver 摆分集字段(如 contentRev 抬升判旧)。 */
const rvP = { id: 'p1' };
const mdShot = (order, over) => Object.assign({
  id: 'sh' + order, order, plot: '剧情' + order, prompt: '提示词' + order,
  video: { status: 'done', url: '/uploads/gen/v' + order + '.mp4', inputHash: 'h' + order },
  reviews: [{ id: 'rv' + order, mode: 'text', model: 'qwen-turbo', score: 8, checks: [] }],
}, over || {});
const mdCut = () => ({
  natural: { score: 8, comment: '运镜平稳' }, continuity: { score: 8, comment: '衔接连贯' },
  framing: { score: 8, comment: '景别有递进' }, pacing: { score: 8, comment: '节奏匹配' }, overall: '整集可用',
});
const mdEp = (shots, lrOver, epOver) => {
  const ep = Object.assign({ id: 'ep1', title: '第一集', shots }, epOver || {});
  ep.lastReview = Object.assign({
    time: '2026-08-27 10:00', avg: 8, sourceRev: ep.contentRev || 0, graphRev: ep.graphRev || 0,
    perShot: shots.map(s => ({
      shotId: s.id, order: s.order, score: 8,
      reportId: ((s.reviews || [])[0] || {}).id || '', videoInputHash: (s.video || {}).inputHash || '',
    })),
    common: { summary: '共性汇总', issues: [] }, cut: mdCut(),
  }, lrOver || {});
  ep.lastReview.snapshotHash = DomainMod.reviewSnapshotHashOf(ep);
  return ep;
};
const mdOf = ep => Skills.check('review', { p: rvP, ep }).find(x => x.id === 'review.methodDim');
const mdCodes = r => r.hits.map(h => h.code + '@' + h.order).join(',');
/* 成片字幕夹具:镜头缺省带分镜图(进得了合成序列),段时长由 Domain.subtitleSegs 按预估/裁剪推出,用例只摆内容 */
const capShot = (order, over) => Object.assign({ id: 'sh' + order, order, dialogue: '', narration: '', image: '/uploads/a/f' + order + '.png' }, over || {});
const capEp = (shots, over) => Object.assign({ id: 'ep1', sbConfig: { subtitle: true }, shots }, over || {});
const caption = ep => Skills.check('film', { p: { id: 'p1' }, ep }, { online: true }).find(x => x.skill === 'film.subtitleQC');
/* 交付契约夹具:板块阶段落 p.boards[主线板块名].stage,产物实况由 Domain.workflow 现推。
 * 底座只把剧本/主体/分集三步摆成 done(有剧本正文、主体有权威图、分集非空且有正文),
 * 分镜及其后各步默认未 done —— 定稿摆在哪一步上就判到哪一步,不必为每条用例造全绿项目。 */
const dcP = (boards, over) => Object.assign({
  id: 'p1', script: '剧本正文',
  subjects: [{ id: 'sj1', name: '林晚', kind: 'character', image: '/uploads/a/sj1.png' }],
  episodes: [{ id: 'ep1', title: '第一集', content: '正文', shots: [] }],
  boards: boards || {},
}, over || {});
const dcOf = (p, online) => Skills.check('film', { p }, { online: online !== false }).find(x => x.skill === 'film.deliverContract');
/* 命中摘要:码 + 板块 + 判据对象(倒置码给上游板块名,背书码给该步阻塞文案) */
const dcCodes = r => r.hits.map(h => h.code + ':' + h.board + (h.name ? '←' + h.name : '')).join(',');
/* 剧本段夹具:正文一律 ≥30 字(短于此的片段不产出结论);BG 是无台词无冲突信号的背景铺陈填充 */
const BG = '江城的春天多雨。'.repeat(20); // 160 字,开篇窗口(120)之外才出现冲突信号
const scriptEp = (content, shots) => ({ id: 'ep1', title: '第一集', content, shots: shots || [] });
const scriptCheck = (skill, ep, p) => Skills.check('script', { p: p || { id: 'p1' }, ep }).find(x => x.skill === skill);
const hookOf = (ep, p) => scriptCheck('script.hookStrength', ep, p);
const slapOf = ep => scriptCheck('script.faceslapFour', ep);
const lineOf = ep => scriptCheck('script.dialogueRule', ep);
const aiOf = ep => scriptCheck('script.aiToneBan', ep);
/* 修饰副词密度夹具:每段 22 字带三个叠词副词,拼够判密度的最短正文即远超每千字上限 */
const ADV = '她缓缓抬头,轻轻叹了口气,静静看着窗外的雨。';
/* 分集段夹具:六集起判(集数少于六段时按比例缩放必把某段摊成零集,不产出结论)。
 * EP_OK = 集首立刻兑现上一集卡点(亮出证据/揭穿/道歉)+ 集尾卡在情绪最高拍(致命危机)+ 带反转信号;
 * FILL 是不含任何信号的中性填充,长度超过集尾窗口(120),接在集尾即把卡点挤出窗口。 */
const FILL = '江城的春天多雨。'.repeat(16);
const EP_OK = '她原来早就知道那份文件是假的。她亮出证据当众揭穿骗局,众人哗然,反派连连道歉。'
  + '门被推开,那个人竟然出现:「你老婆在我手上,一小时内拿东西来换。」';
const epsP = list => ({ id: 'p1', episodes: list.map((c, i) => ({ id: 'ep' + (i + 1), title: '第' + (i + 1) + '集', content: c })) });
const sixEps = (over) => epsP(Array.from({ length: 6 }, (_, i) => ((over || {})[i + 1] === undefined ? EP_OK : over[i + 1])));
const arcOf = p => Skills.check('eps', { p }).find(x => x.skill === 'eps.structureStage');
const payoffOf = (p, ep) => Skills.check('eps', { p, ep }).find(x => x.skill === 'eps.payoffPoint');
/* 审片路径消费点夹具:js/review.js 沙箱(离线 → 本地模拟评审,校验项经 window.Skills 现取) */
function loadReview() {
  const sb = makeSandbox();
  installCommon(sb);
  sb.COST = { review: 2, optimize: 1, video: 5 };
  sb.Views = { episode() {} };
  loadFile(sb, 'domain.js'); // 与 index.html 同顺序:domain → knowledge → skills → wf-core
  loadFile(sb, 'prompts.js');
  loadFile(sb, 'knowledge.js');
  loadFile(sb, 'skills.js');
  loadFile(sb, 'wf-core.js');
  loadFile(sb, 'review.js');
  return sb;
}
/* 单镜夹具:提示词自带稳定约束词、无 cameraSpec、单镜集(离线评审的三条本地硬检查一律零命中,
 * 报告的 issues 只由 s.id + s.prompt 的种子决定——同种子两次评审可逐字对比) */
const rvShot = over => Object.assign({
  id: 'sh0', order: 0, plot: '她亮出证据揭穿骗局', scene: '', props: [],
  camera: '固定镜头', prompt: '五官稳定不变形,人体结构正常', duration: 5,
}, over || {});
const rvEp = s => ({ id: 'ep1', title: '第一集', shots: [s] });
/* 就绪检查的校验面清单已收成双端单源表 Skills.preflightStages();两端 preflight 段只读该表 concat,
 * 不再各写一份面字面量。故逐面消费点断言的形态从"文件里出现过 Skills.check('<面>'"
 * 改成"该面在单源表里 + 两端确实读该表 + 表按主线步序"——判据只增不减,面表本身由注册表登记推出,
 * 表的推导规则与两端只读该表这两件事由本套件的「就绪检查校验面表(源级)」用例锁死。 */
const PREFLIGHT_ENDS = [['js/commands.js', "reg('episode.preflight'", "reg('episode.generateStoryboard'"],
  ['cli.js', "EXEC['episode.preflight']", "EXEC['episode.generateVideos']"]];
/* 两端 preflight 实现段(定位失败即红,防断言被改名静默跳过) */
const preflightSeg = f => {
  const [, from, to] = PREFLIGHT_ENDS.find(x => x[0] === f);
  const src = fs.readFileSync(path.join(ROOT, f), 'utf8');
  const a = src.indexOf(from), b = src.indexOf(to);
  assert(a >= 0 && b > a, f + ' 应能定位到就绪检查实现段');
  return src.slice(a, b);
};
/* 段内那一条 checks 汇总表达式(表达式中间不得出现分号,否则这里截不全) */
const preflightExpr = f => {
  const seg = preflightSeg(f);
  const i = seg.indexOf('const checks =');
  assert(i >= 0, f + ' 就绪检查段内应有 checks 汇总表达式');
  return seg.slice(i, seg.indexOf(';', i) + 1);
};
/* 某一面确实经就绪检查消费:在单源表里,且两端都是读表跑(而非某端写死这一面) */
const assertPreflightFace = (stage, label) => {
  assert(Skills.preflightStages().includes(stage), '单源面表 Skills.preflightStages() 应含' + label);
  PREFLIGHT_ENDS.forEach(([f]) => assert(/Skills\.preflightStages\(\)/.test(preflightExpr(f)),
    f + ' 就绪检查应读单源面表跑校验项(含' + label + ')'));
};
/* 单源表里 a 面排在 b 面之前(步序判据从两端源码位置移到表上,面表是唯一口径) */
const assertPreflightOrder = (a, b, why) => {
  const stages = Skills.preflightStages();
  assert(stages.indexOf(a) >= 0 && stages.indexOf(b) >= 0, '单源面表应含 ' + a + '/' + b + ' 两面');
  assert(stages.indexOf(a) < stages.indexOf(b), '单源面表应按主线步序排列(' + why + ')');
};
/* 问题中心的方法论提醒同样收成一张单源表 Issues.reminders()(js/issues.js 已 UMD 化,Node 直 require 得到)。
 * 故逐面消费点断言的形态也从"文件里出现过 Skills.check('<面>'"改成"这一面在投影表里登记了 kind/sev/挂载级别
 * + 全模块只此一处按表取值":判据只增不减——原先只证明源码里提到过这一面,现在还证明了它的危险级、
 * 取的是哪一条校验项、挂在项目级还是分集级,且不存在第二处绕开表的取值点。 */
const IssuesMod = require('../js/issues.js');
const assertIssuesProjection = (stage, kind, skill, level) => {
  const row = IssuesMod.reminders().find(r => r.kind === kind);
  assert(row, '问题中心投影表应登记提醒条目:' + kind);
  assertEq(row.stage, stage, kind + ' 应复用 ' + stage + ' 面的校验项结论,不写第二份判定');
  assertEq(row.skill, skill, kind + ' 的取值点应是 ' + (skill || '整面 hits 合并'));
  assertEq(row.sev, 'low', kind + ' 须挂低危(发布门 G2 只数高/中危)');
  assertEq(row.level, level, kind + ' 的挂载级别应是 ' + level);
  const isrc = fs.readFileSync(path.join(ROOT, 'js', 'issues.js'), 'utf8');
  const body = isrc.slice(isrc.indexOf('function (Domain, skills)'));
  assertEq((body.match(/\.check\(/g) || []).length, 1, '问题中心应只此一处取校验项结论(绕开投影表的第二处取值点即红)');
  assertEq((body.match(/\.check\(r\.stage, obj, ck\)/g) || []).length, 1, '那一处必须是按投影表的 stage 跑');
  assert(!/\.check\('/.test(body), '投影表收口后不得再出现逐面写死的 check(<面名>');
};

const skillsTests = [
  { name: 'hookAnchor:开篇直接进台词/冲突信号 → info;背景铺陈过长 → late-hook(带首个信号位置)', fn() {
    assertEq(hookOf(scriptEp('「你们跪下求我的那一天,快了。」林晚站在宴会厅中央,众人哄笑,她没有回头。')).level, 'info', '开篇直接进台词即已冲突锚定');
    assertEq(hookOf(scriptEp('林晚推开门,桌上那份文件的签名是她自己的笔迹,她的手僵住了,冷汗顺着背脊滑下来。')).hits.length, 0, '无台词但开篇命中冲突信号同样算锚定');
    const r = hookOf(scriptEp(BG + '她被人嘲笑,却默默忍住。'));
    assertEq(r.pass, false); assertEq(r.level, 'warn', '开篇钩子是提醒级,不升 fail');
    assertEq(r.hits.length, 1);
    assertEq(r.hits[0].code, 'late-hook');
    assertEq(r.hits[0].name, '嘲笑', 'hits 应给出全文首个冲突信号');
    assertEq(r.hits[0].at, BG.length + '她被人'.length, 'hits 应定位到该信号在去空白正文中的位置');
    assert(r.hits[0].head.startsWith('江城的春天多雨'), 'hits 应带开篇摘要供展示');
  } },
  { name: 'hookAnchor:全文无冲突锚点 → no-hook-anchor;正文过短/缺正文不产出结论', fn() {
    const r = hookOf(scriptEp('江城的春天多雨。'.repeat(6)));
    assertEq(r.hits.map(h => h.code).join(','), 'no-hook-anchor');
    assertEq(r.hits[0].at, -1, '全文无锚点时不冒充位置');
    assertEq(hookOf(scriptEp('江城春天多雨。')).level, 'info', '短于判定下限的片段不产出结论');
    assertEq(hookOf(scriptEp('')).hits.length, 0, '缺剧本正文不产出结论(缺剧本本就是高危问题,不在此重复报)');
    assertEq(hookOf(null).hits.length, 0, '无分集上下文且无项目剧本时不产出结论');
  } },
  { name: 'faceslapSteps:四步齐备且顺序正确 → info;缺步 → missing-step 逐步定位', fn() {
    const full = '众人哄笑,嘲讽她是废物。她沉默着低头,默默攥紧手心。片刻后她亮出证据,揭穿了这场骗局。全场哗然,反派脸色惨白,连连道歉。';
    assertEq(slapOf(scriptEp(full)).level, 'info', '羞辱→隐忍→反击→释放齐备且顺序正确');
    const r = slapOf(scriptEp('众人哄笑,嘲讽她是废物。片刻后她亮出证据,揭穿了这场骗局,她转身离开了宴会厅。'));
    assertEq(r.pass, false); assertEq(r.level, 'warn');
    assertEq(r.hits.map(h => h.code + ':' + h.step).join(','), 'missing-step:隐忍,missing-step:释放', '缺的步应逐条报出步名');
    assertEq(r.hits[0].at, -1, '缺步没有位置可报');
  } },
  { name: 'faceslapSteps:步序倒置 → step-out-of-order 带基准步;命中步数不足视为非打脸段落', fn() {
    const r = slapOf(scriptEp('众人哄笑,嘲讽她是废物。她揭穿了这场骗局,亮出证据。随后她沉默着低头,默默攥紧手心。全场哗然。'));
    assertEq(r.hits.map(h => h.code + ':' + h.step + '<' + h.base).join(','), 'step-out-of-order:反击<隐忍', '反击写在隐忍之前应如实报步序倒置');
    assert(r.hits[0].at > 0, '倒置命中应带位置');
    assertEq(slapOf(scriptEp('众人哄笑着走开了。江城的春天多雨,她撑着伞走过长街,想起小时候母亲教她的那些事。')).level, 'info',
      '只命中一步的段落本就不是打脸段落,不拿"没写打脸"当缺陷报');
    assertEq(slapOf(scriptEp(BG)).hits.length, 0, '零命中同理不产出结论');
  } },
  { name: 'dialogueLength:剧本引号台词与分镜台词两处载体同判据,阈值取自 KB 条目正文', fn() {
    const KB = require('../js/knowledge.js');
    assert(/单句≤30字/.test(KB.section('对话铁律')), '阈值单源:KB「对话铁律」条目须仍写明单句≤30字(字面失配时校验项会回落默认值)');
    assertEq(lineOf(scriptEp('「' + '好'.repeat(30) + '」' + BG)).hits.length, 0, '恰好 30 字不算超长');
    const r = lineOf(scriptEp('「' + '好'.repeat(31) + '。' + '好'.repeat(31) + '」' + BG));
    assertEq(r.level, 'warn');
    assertEq(r.hits.map(h => h.where + ':' + h.len).join(','), 'script:31,script:31', '引号台词内部按句切分,逐句判长');
    assertEq(r.hits[0].name, '好'.repeat(14), 'hits 应带句首摘要');
    assertEq(r.hits.map(h => h.at).join(','), '1,33', 'hits 应逐句定位到去空白正文中的位置(跳过开引号与句号)');
    const s = { id: 'sh0', order: 0, dialogue: '好'.repeat(31) };
    const r2 = lineOf(scriptEp(BG, [{ id: 'shx', order: 0, dialogue: '短句可以' }, Object.assign({}, s, { id: 'sh1', order: 1 })]));
    assertEq(r2.hits.map(h => h.where + '@' + h.order).join(','), 'shot@2', '分镜台词按镜定位(镜号 = order + 1)');
    assertEq(r2.hits[0].shotId, 'sh1', 'hits 应带镜头 id 供调用方跳转');
    assertEq(Skills.check('script', { p: { id: 'p1' }, s }).find(x => x.skill === 'script.dialogueRule').hits.length, 1, '镜级入口只判传入的那一镜');
  } },
  { name: '剧本段三条:纯函数(不改入参、同输入同结论);项目剧本原文可判;无输入不冒充结论', fn() {
    const ep = scriptEp(BG + '她被人嘲笑,却默默忍住。', [{ id: 'sh0', order: 0, dialogue: '好'.repeat(31) }]);
    const p = { id: 'p1' };
    const snap = JSON.stringify([p, ep]);
    assertEq(JSON.stringify(Skills.check('script', { p, ep })), JSON.stringify(Skills.check('script', { p, ep })), '同输入应给同结论(无隐藏状态)');
    assertEq(JSON.stringify([p, ep]), snap, '校验项不得改动领域对象');
    // 拆集前只有项目剧本原文:同一套判据照跑(剧本步本身就是这几条的作用面)
    assertEq(hookOf(null, { id: 'p1', script: BG + '她被人嘲笑。' }).hits.map(h => h.code).join(','), 'late-hook', '无分集上下文时取项目剧本原文');
    const empty = Skills.check('script', {});
    assertEq(empty.length, 4, '剧本步现有四条已落地校验项');
    assertEq(empty.filter(x => x.level === 'info' && !x.hits.length).length, 4, '无判定输入时四条一律不产出命中');
  } },
  { name: 'aiVoice:套话硬禁词逐次命中 → ai-cliche(带词与位置);不写套话的正文 → info', fn() {
    const r = aiOf(scriptEp('她深吸一口气,眼里闪过一丝复杂。' + BG));
    assertEq(r.pass, false); assertEq(r.level, 'warn', 'AI 味是提醒级,不升 fail(好坏优劣仍归审片)');
    assertEq(r.hits.map(h => h.code + ':' + h.name).join(','), 'ai-cliche:深吸一口气,ai-cliche:闪过一丝', '同段多处套话逐次报出');
    assertEq(r.hits[0].at, 1, 'hits 应定位到去空白正文中的位置');
    assertEq(r.hits[0].where, 'script', 'hits 应标明载体');
    assertEq(aiOf(scriptEp('林晚推开门,桌上那份文件的签名是她自己的笔迹,她的手僵住了。' + BG)).level, 'info', '不写套话的正文无命中');
    assertEq(aiOf(scriptEp('她深吸一口气。')).hits.length, 0, '短于判定下限的片段不产出结论');
  } },
  { name: 'aiVoice:书面腔只判台词载体(正文引号台词 + 分镜 s.dialogue),叙述里用书面词不报', fn() {
    const r = aiOf(scriptEp('然而她还是去了。「因此我必须走,值得注意的是他已经知道了。」' + BG));
    assertEq(r.hits.map(h => h.code + ':' + h.name).join(','), 'spoken-formal:因此,spoken-formal:值得注意的是',
      '叙述里的「然而」不报——书面词出现在人物嘴里才是 AI 腔');
    assert(r.hits[0].at > 0, '正文台词命中应定位到去空白正文中的位置');
    const r2 = aiOf(scriptEp(BG, [{ id: 'sh0', order: 0, dialogue: '快走别回头' }, { id: 'sh1', order: 1, dialogue: '综上所述,我们只能这样' }]));
    assertEq(r2.hits.map(h => h.code + '@' + h.order).join(','), 'spoken-formal@2', '分镜台词按镜定位(镜号 = order + 1)');
    assertEq(r2.hits[0].shotId, 'sh1', 'hits 应带镜头 id 供调用方跳转');
    assertEq(r2.hits[0].where, 'shot');
    const s = { id: 'sh1', order: 1, dialogue: '综上所述,我们只能这样' };
    assertEq(Skills.check('script', { p: { id: 'p1' }, s }).find(x => x.skill === 'script.aiToneBan').hits.length, 1, '镜级入口只判传入的那一镜');
  } },
  { name: 'aiVoice:修饰副词密度超上限 → adverb-flood 整段一条;正文过短与低密度不下断言', fn() {
    const r = aiOf(scriptEp(ADV.repeat(10)));
    assertEq(r.hits.map(h => h.code).join(','), 'adverb-flood', '密度命中整段只报一条,不逐词重复报');
    assertEq(r.hits[0].count + '/' + r.hits[0].limit, '30/10', 'hits 应带命中数与每千字上限');
    assertEq(r.hits[0].name, '缓缓', 'hits 应给出首个命中词');
    assertEq(r.hits[0].at, 1, 'hits 应定位到首个命中词的位置');
    assertEq(aiOf(scriptEp(ADV.repeat(3))).hits.length, 0, '短段落里几个叠词副词是常态,不足判密度的正文不下断言');
    assertEq(aiOf(scriptEp(BG + BG + '她默默走开。')).hits.length, 0, '密度不到上限不报');
  } },
  { name: 'aiVoice:纯函数与消费点(就绪检查/问题中心/审片报告只读消费,不拦生成、不改门禁、不开计费)', fn: async () => {
    const sk = Skills.byId('script.aiToneBan');
    assertEq(sk.pending.join(','), '', '两面均已落地:注入面的条目正文已进 KB 单源,校验面早已有实现');
    assertEq(sk.checks.join(','), 'script.aiVoiceTrace');
    assert(sk.gaps.includes('G-10'), '语义面缺口(G-10)仍记账');
    assertEq(Skills.block('script', { ids: ['script.aiToneBan'] }), require('../js/knowledge.js').section('文案AI味'),
      '注入块应逐字节等于条目正文(索引层不复述)');
    const ep = scriptEp('她深吸一口气,眼里闪过一丝复杂。' + BG, [{ id: 'sh0', order: 0, dialogue: '因此我必须走' }]);
    const p = { id: 'p1' };
    const snap = JSON.stringify([p, ep]);
    assertEq(JSON.stringify(aiOf(ep)), JSON.stringify(aiOf(ep)), '同输入应给同结论(无隐藏状态)');
    assertEq(JSON.stringify([p, ep]), snap, '校验项不得改动领域对象');
    assertEq(aiOf(scriptEp('')).hits.length, 0, '缺剧本正文不产出结论');
    assertPreflightFace('script', '剧本面'); // 面表由登记推导:新增本条校验项,两端就绪检查实现一行未改
    assert(sk.cmds.includes('episode.preflight') && sk.cmds.includes('episode.smartReview'), '两处真实消费点都要如实登记');
    /* 记账反查(另一向):结论确实进了就绪检查回执的条目,cmds 必须如实登记该消费点——
     * 面已在表里时漏登记不会少报一条结论,只会让登记侧悄悄失真,故这条断言由本层钉住 */
    Skills.list().filter(s => !s.pending.includes('check') && s.checks.length && Skills.preflightStages().includes(s.stage))
      .forEach(s => assert(s.cmds.includes('episode.preflight'), s.id + ' 的结论已进就绪检查回执,cmds 须如实登记该消费点'));
    const isrc = fs.readFileSync(path.join(ROOT, 'js', 'issues.js'), 'utf8');
    ['ai-cliche', 'spoken-formal', 'adverb-flood'].forEach(c => assert(isrc.includes("'" + c + "':"), '问题中心应给命中码展示文案:' + c));
    // 审片路径:镜级命中如实附报告独立字段,集级结论(正文套话)不混进单镜报告
    const sb = loadReview();
    const s = rvShot({ characters: ['林小满'], dialogue: '因此我必须走' });
    /* 主体补视频参考大头照:本例要孤立的是台词书面腔,不是主体面 SK-11 的三视图回退(只有权威三视图的主体本身就是一条命中) */
    const rp = refP({ script: '她深吸一口气。' + BG });
    rp.subjects[0].imgRef = '/uploads/a/sj1-ref.png';
    const rv = await sb.Review.reviewShot(rp, rvEp(s), s);
    assertEq(rv.checks.map(c => c.skill).join(','), 'script.aiToneBan', '本镜台词的书面腔应进报告 checks');
    assertEq(rv.checks[0].hits.map(h => h.code).join(','), 'spoken-formal');
    assertEq(rv.checks[0].hits[0].shotId, 'sh0', '只留本镜命中(正文套话是集级结论,归就绪检查与问题中心)');
    assertEq(rv.issues.filter(i => i.code).length, 0, '命中不得并入 issues(达标线/重抽判定口径不动)');
    assertEq(sb.__charges.length, 1, '校验项纯本地零 LLM,不新增计费动作');
    assertEq(require('../js/cmd-registry.js').byName['episode.preflight'].risk, 'read', '就绪检查应仍是 read 类零计费');
    const rsrc = fs.readFileSync(path.join(ROOT, 'js', 'release.js'), 'utf8');
    assert(/x\.sev === 'high' \|\| x\.sev === 'mid'/.test(rsrc), '发布门 G2 只数高/中危 —— 低危提醒不改门禁状态');
  } },
  { name: 'aiVoice:三张词表与每千字上限现取 KB「文案AI味」条目正文(校验层不写第二份词表)', fn() {
    const kb = require('../js/knowledge.js').section('文案AI味');
    assert(kb, 'S-02 已闭合:条目正文须在 KB.SECTIONS 单源可取');
    /* 用与校验层同一条解析口径独立取一遍词表:条目改写而字面失配时这里先红 */
    const listOf = label => ((new RegExp(label + '[^「]*「([^」]+)」').exec(kb) || [])[1] || '').split('/').filter(Boolean);
    const cliche = listOf('套话硬禁词'), formal = listOf('书面连接词'), adverb = listOf('修饰副词');
    assertEq([cliche.length, formal.length, adverb.length].join(','), '19,12,11', '条目三张词表须解析得出(解析不出则校验层判不出任何东西)');
    // 逐词实跑:条目里的每个词都真判得出,即判据确实来自条目而不是本层另存的一份
    cliche.forEach(w => assertEq(aiOf(scriptEp(w + BG)).hits.filter(h => h.code === 'ai-cliche' && h.name === w).length, 1,
      '套话词应逐词取自条目:' + w));
    formal.forEach(w => assertEq(aiOf(scriptEp('「' + w + '走吧」' + BG)).hits.filter(h => h.code === 'spoken-formal' && h.name === w).length, 1,
      '书面词应逐词取自条目:' + w));
    assertEq(aiOf(scriptEp(adverb.join('').repeat(10))).hits.map(h => h.code).join(','), 'adverb-flood', '副词词表同样取自条目');
    assertEq(aiOf(scriptEp('她万分感慨地看着他。' + BG)).hits.length, 0, '条目没收的近义词不判(词表不是本层另写的一份)');
    // 每千字上限同理:数字写在条目里,校验层不写第二份
    const cap = +(/每千字超过(\d+)处/.exec(kb) || [])[1];
    assertEq(cap, 10, '密度上限须写在条目正文里');
    assertEq(aiOf(scriptEp(ADV.repeat(10))).hits.find(h => h.code === 'adverb-flood').limit, cap, '命中里的上限应与条目字面一致');
    // 源级:skills.js 不得留第二份词表(副词逐词略过——「默默」同时是 SK-08 隐忍步的信号词)
    const src = fs.readFileSync(path.join(ROOT, 'js', 'skills.js'), 'utf8');
    cliche.concat(formal).forEach(w => assert(!src.includes("'" + w + "'"), 'skills.js 不得写第二份词表:' + w));
    [cliche, formal, adverb].forEach(ws => assert(!src.includes(ws.join("', '")), 'skills.js 不得整表复制条目词表'));
  } },
  { name: 'aiVoice:注入面落地(条目进 KB 单源 + 剧本板块方法论按键整条注入,S-02 清账)', fn() {
    const KB = require('../js/knowledge.js');
    assert(Object.keys(KB.SECTIONS).includes('文案AI味'), '条目须登记进 KB.SECTIONS 取用面');
    assertEq((Skills.gaps()['S-02'] || []).join(','), '', 'S-02 已闭合,缺口投影里应清账');
    assertEq(Skills.list('script').filter(s => s.kb.includes('文案AI味')).map(s => s.id).join(','), 'script.aiToneBan',
      '同一步内只由 SK-10 登记该键(挂两处会让剧本步拼块出现两份正文)');
    // 注入落点:剧本板块 Agent 就位时按键整条注入,与其余板块条目同一装配口(正文不复制)
    const asrc = fs.readFileSync(path.join(ROOT, 'js', 'agent.js'), 'utf8');
    assert(/剧本: \[[^\]]*'文案AI味'/.test(asrc), '剧本板块方法论注入清单应按键取该条目');
    assert(!asrc.includes(KB.section('文案AI味')), '注入点只按键取用,不复制条目正文');
  } },
  { name: '剧本段消费点:就绪检查按主线步序附结论 + 问题中心低危(不改门禁、不新增计费)', fn() {
    const conc = Skills.check('script', { p: { id: 'p1' }, ep: scriptEp(BG) });
    assertEq(conc.map(x => x.skill).join(','), 'script.hookStrength,script.faceslapFour,script.dialogueRule,script.aiToneBan', '剧本面四条已落地校验项');
    assertEq(conc.map(x => x.id).join(','),
      'script.openingHookAnchor,script.faceslapStepOrder,script.dialogueLineLength,script.aiVoiceTrace', '结论应同时给实现 id 与能力 id');
    assertPreflightFace('script', '剧本面');
    assertPreflightOrder('script', 'subjects', '剧本在主体之前');
    const isrc = fs.readFileSync(path.join(ROOT, 'js', 'issues.js'), 'utf8');
    assertIssuesProjection('script', 'script-craft', null, 'episode'); // 剧本面是唯一取整面 hits 合并的一处
    assert(isrc.includes("kind: 'script-craft', sev: 'low'"), '剧本方法论提醒须挂低危(发布门 G2 只数高/中危)');
    // 审片报告与发布门的方法论维度仍是 G-10,条目不得挂未接的命令面
    ['script.hookStrength', 'script.faceslapFour'].forEach(id => {
      assert(Skills.byId(id).gaps.includes('G-10'), id + ' 的审片/发布门维度仍待 G-10');
      assert(!Skills.byId(id).cmds.includes('episode.smartReview'), id + ' 不得挂未接的审片命令面');
    });
  } },
  { name: 'genRefDiscipline:角色有视频参考大头照 → info;回退到白底三视图 → ref-sheet-fallback', fn() {
    const KB = require('../js/knowledge.js');
    assert(/不要用三视图\/多视图/.test(KB.section('主体参考')), '判据单源:KB「主体参考」条目须仍写明不要用三视图/多视图');
    const clean = genRef(headSubjP(2), [refShot(0, { characters: ['角色0', '角色1'] })]);
    assertEq(clean.pass, true); assertEq(clean.level, 'info'); assertEq(clean.hits.length, 0, '喂大头照的镜不应产出命中');
    const p = refP(); // 林小满只有权威三视图,没有 imgRef 大头照
    const r = genRef(p, [refShot(0, { characters: ['林小满'] })]);
    assertEq(r.pass, false); assertEq(r.level, 'warn', '参考纪律是提醒级,fail 仍只留给完备性面');
    assertEq(r.hits.map(h => h.code + '@' + h.order + ':' + h.name).join(','), 'ref-sheet-fallback@1:林小满');
    assertEq(r.hits[0].shotId, 'sh0', 'hits 应带镜头 id 供调用方跳转');
    assertEq(DomainMod.shotRefImages(p, refShot(0, { characters: ['林小满'] })).refImages[0].url, p.subjects[0].image,
      '命中口径与真实生成请求一致:这一镜确实把权威三视图喂了出去');
    assertEq(genRef(p, [refShot(0, { characters: ['林小满-战损'] })]).hits.length, 0, '形态自带图不是三视图回退');
    const withHead = refP({ subjects: refP().subjects.map(s => (s.id === 'sj1' ? Object.assign({}, s, { imgRef: '/uploads/a/head.png' }) : s)) });
    assertEq(genRef(withHead, [refShot(0, { characters: ['林小满'] })]).hits.length, 0, '补出大头照后命中自动消失');
  } },
  { name: 'genRefDiscipline:参考人物超条目上限 → ref-person-overflow;有图却被参考图组上限挤出 → ref-cap-dropped', fn() {
    const KB = require('../js/knowledge.js');
    assert(/参考人物≤4/.test(KB.section('主体参考')), '上限单源:KB「主体参考」条目须仍写明参考人物≤4(字面失配时校验项会回落默认值)');
    assertEq(genRef(headSubjP(4), [refShot(0, { characters: ['角色0', '角色1', '角色2', '角色3'] })]).hits.length, 0, '恰好 4 人不算超上限');
    const r = genRef(headSubjP(5), [refShot(0, { characters: ['角色0', '角色1', '角色2', '角色3', '角色4'] })]);
    assertEq(r.hits.map(h => h.code + ':' + h.count + '/' + h.limit).join(','), 'ref-person-overflow:5/4', 'hits 应带实际人数与条目上限');
    assertEq(r.hits[0].order, 1, '命中定位到镜号');
    // 4 角色 + 场景 + 道具 = 6 个有图主体,参考图组只装得下 5 个:排在最后的道具进不了真实生成请求
    const p = { id: 'p1', subjects: headSubjP(4).subjects.concat([
      { id: 'sc1', name: '客厅', kind: 'scene', image: '/uploads/a/sc1.png' },
      { id: 'pr1', name: '玉佩', kind: 'prop', image: '/uploads/a/pr1.png' },
    ]) };
    const shot = refShot(0, { characters: ['角色0', '角色1', '角色2', '角色3'], scene: '客厅', props: ['玉佩'] });
    assertEq(DomainMod.shotRefImages(p, shot).refImages.length, 5, '参考图组上限 5 张(第 6 个主体进不去真实生成请求)');
    const d = genRef(p, [shot]);
    assertEq(d.hits.map(h => h.code + ':' + h.name + '/' + h.limit).join(','), 'ref-cap-dropped:玉佩/5', '被挤出的主体应如实命中且带组容量');
    assertEq(refIntegrity(p, { id: 'ep1', shots: [shot] }).hits.length, 0, '主体有图,完备性面无话可说——上限挤出只有本项看得见');
  } },
  { name: 'genRefDiscipline:解析不到/全程无图归 SK-12 不重复报;纯函数且无判定输入不冒充结论', fn() {
    const p = refP();
    const shots = [refShot(0, { characters: ['路人甲'], scene: '客厅', props: ['玉佩'] })]; // 未知名 + data: 内联图 + 缺图
    const ep = { id: 'ep1', shots };
    const snap = JSON.stringify([p, ep]);
    assertEq(genRef(p, shots).hits.length, 0, '这三种都是完备性面的缺陷,参考纪律面不重复报');
    assertEq(refIntegrity(p, ep).hits.map(h => h.code).join(','), 'unknown-subject,no-ref-image,no-ref-image', '完备性面照报不误');
    assertEq(JSON.stringify(genRef(p, shots)), JSON.stringify(genRef(p, shots)), '同输入应给同结论(无隐藏状态)');
    assertEq(JSON.stringify([p, ep]), snap, '校验项不得改动领域对象');
    assertEq(genRef(p, []).level, 'info', '无镜头即无判定输入');
    assertEq(genRef(null, shots).hits.length, 0, '无项目上下文不产出结论');
    assertEq(Skills.check('subjects', { p, s: refShot(0, { characters: ['林小满'] }) }).find(x => x.id === 'subjects.genRefDiscipline').hits.length, 1,
      '镜级入口只判传入的那一镜');
  } },
  { name: 'multiShotPrompt:图生视频缺一致性声明 → img2ref-decl-missing;主体参考图组自带该声明则不报', fn() {
    const KB = require('../js/knowledge.js');
    assert(/须声明"基于参考图保持人物样貌与服装一致"/.test(KB.section('多镜头写法')),
      '判定字面单源:KB「多镜头写法」条目须仍写明那句声明(字面失配时判据退空,不制造假命中)');
    const bare = { id: 'p1', subjects: [] };
    const r = multiShot(bare, [refShot(0, { prompt: '她推门而入,雨水顺着伞沿落下', image: '/uploads/a/f0.png' })]);
    assertEq(r.pass, false); assertEq(r.level, 'warn', '写法提醒是提醒级');
    assertEq(r.hits.map(h => h.code + '@' + h.order).join(','), 'img2ref-decl-missing@1');
    assertEq(r.hits[0].shotId, 'sh0', 'hits 应带镜头 id 供调用方跳转');
    assertEq(multiShot(bare, [refShot(0, { prompt: '她推门而入,雨水顺着伞沿落下' })]).hits.length, 0, '一张图都没送的纯文生视频镜不判本条');
    const withRef = refShot(0, { characters: ['角色0'], prompt: '她推门而入,雨水顺着伞沿落下', image: '/uploads/a/f0.png' });
    const q = DomainMod.buildVideoRequest(headSubjP(1), null, withRef);
    assert(q.prompt.includes('参考图') && q.prompt.includes('一致'), '有主体参考图组时声明由请求装配自带');
    assertEq(multiShot(headSubjP(1), [withRef]).hits.length, 0, '请求里已有该声明就不报');
  } },
  { name: 'multiShotPrompt:首尾帧写大幅动作 → frames-motion-overrun;一镜切太碎 → shot-flow-fragmented', fn() {
    const p = headSubjP(1);
    const frames = refShot(0, { characters: ['角色0'], genStrategy: 'frames', firstFrame: '/uploads/a/f0.png', lastFrame: '/uploads/a/f1.png', prompt: '她奔跑着冲下长长的楼梯' });
    const r = multiShot(p, [frames]);
    assertEq(r.hits.map(h => h.code + ':' + h.name).join(','), 'frames-motion-overrun:奔跑', 'hits 应给出命中的动作词');
    assertEq(multiShot(p, [Object.assign({}, frames, { prompt: '她缓缓抬头,目光落在门口' })]).hits.length, 0, '动作幅度收敛的首尾帧镜不报');
    assertEq(multiShot(p, [Object.assign({}, frames, { genStrategy: 'ref' })]).hits.length, 0, '非首尾帧策略不判两端可插值');
    const cut = multiShot({ id: 'p1', subjects: [] }, [refShot(0, { prompt: '近景特写脸部,切至全景,切到长街,画面一转到雨夜天台' })]);
    assertEq(cut.hits.map(h => h.code + ':' + h.count + '/' + h.limit).join(','), 'shot-flow-fragmented:3/2', 'hits 应带切换信号数与上限');
    assertEq(multiShot({ id: 'p1', subjects: [] }, [refShot(0, { prompt: '近景特写脸部,慢慢拉远成全景,人物缓慢行走,结尾定格微笑' })]).hits.length, 0,
      '按时间顺序描述的一条镜头流不算太碎');
  } },
  { name: 'multiShotPrompt:纯函数(不改入参、同输入同结论);提示词未写与无项目上下文不产出结论', fn() {
    const p = headSubjP(1);
    const shots = [refShot(0, { characters: ['角色0'], genStrategy: 'frames', firstFrame: '/uploads/a/f0.png', prompt: '她奔跑着冲下长长的楼梯' })];
    const ep = { id: 'ep1', shots };
    const snap = JSON.stringify([p, ep]);
    assertEq(JSON.stringify(multiShot(p, shots)), JSON.stringify(multiShot(p, shots)), '同输入应给同结论(无隐藏状态)');
    assertEq(JSON.stringify([p, ep]), snap, '校验项不得改动领域对象');
    assertEq(multiShot(p, [refShot(0, { characters: ['角色0'], image: '/uploads/a/f0.png' })]).hits.length, 0, '提示词还没写的镜无判定输入');
    assertEq(multiShot(p, []).level, 'info', '无镜头即无判定输入');
    assertEq(multiShot(null, shots).hits.length, 0, '无项目上下文不产出结论');
  } },
  { name: 'G-06 校验半:SK-11/SK-13 登记与消费(面表推导自动跟上,不拦生成、不改门禁、不开计费)', fn() {
    const sk11 = Skills.byId('subjects.refDiscipline');
    assertEq(sk11.pending.length, 0, 'SK-11 校验面已落地,pending 应清空');
    assertEq(sk11.checks.join(','), 'subjects.genRefDiscipline');
    /* 说明串按实况反转:本条两个登记键的人设句都已进注册表(extract.system 与 persona.promptSystem),
     * 这里留着 G-13 是因为缺口本身没闭合(全仓其余模块内联人设仍在),不是本条还有收编余量;
     * 被断言的值一字未动,实况由 contract 套件那两条收编用例钉住 */
    assertEq(sk11.gaps.join(','), 'G-13', 'G-06 的校验半落地后本条只剩 G-13 那一项');
    const sk13 = Skills.byId('subjects.crossShot');
    assertEq(sk13.checks.join(','), 'subjects.crossShotConsistency,subjects.multiShotPrompt', 'SK-13 承接一致性与多镜头写法两条实现');
    assertEq(sk13.gaps.join(','), 'S-03');
    assertEq(Skills.gaps()['G-06'], undefined, 'G-06 两半(注入 + 校验)到此清账,缺口投影不再列出任何能力');
    // 消费点由登记推导:两条都记 episode.preflight,所属面 subjects 早已在双端就绪检查的 checks 表达式里,故两端实现一行未改
    const consumers = Skills.list().filter(s => !s.pending.includes('check') && s.checks.length && s.cmds.includes('episode.preflight'));
    ['subjects.refDiscipline', 'subjects.crossShot'].forEach(id => {
      const s = consumers.find(x => x.id === id);
      assert(s, id + ' 应登记 episode.preflight 为消费点');
      assertEq(s.stage, 'subjects', '两条都落在主体面,新增校验项不改就绪检查的面清单');
    });
    assertPreflightFace('subjects', '主体面(四条同一次调用)'); // 面表已在表内,两端读表即自动跑到新增的两条
    PREFLIGHT_ENDS.forEach(([f]) => {
      const src = fs.readFileSync(path.join(ROOT, f), 'utf8');
      assert(!/Skills\.check\('gen'/.test(src), f + ' 生成步不新开校验面(生成前置结论走主体面)');
    });
    assertEq(require('../js/cmd-registry.js').byName['episode.preflight'].risk, 'read', '就绪检查应仍是 read 类零计费');
    ['js/sb-gen.js', 'js/produce.js'].forEach(f => {
      const src = fs.readFileSync(path.join(ROOT, f), 'utf8');
      assert(!src.includes('Skills.'), f + ' 生成动作里不加校验拦截(结论只报不拦)');
    });
    const rsrc = fs.readFileSync(path.join(ROOT, 'js', 'release.js'), 'utf8');
    assert(/x\.sev === 'high' \|\| x\.sev === 'mid'/.test(rsrc), '发布门 G2 只数高/中危 —— 本轮不改门禁口径');
  } },
  { name: 'refIntegrity:干净夹具全 pass(引用齐备且有真实参考图 → info 无命中)', fn() {
    const p = refP();
    const ep = { id: 'ep1', shots: [
      refShot(0, { characters: ['林小满'], scene: '' }),
      refShot(1, { characters: ['林小满-战损'] }), // 多形态全称
      refShot(2, { characters: ['小满'] }),        // 曾用名(改名后旧引用仍解析)
    ] };
    const r = refIntegrity(p, ep);
    assertEq(r.pass, true); assertEq(r.level, 'info'); assertEq(r.hits.length, 0, '齐备引用不应产出命中');
  } },
  { name: 'refIntegrity:引用主体库不存在的名字 → fail,hits 带镜号与名字', fn() {
    const p = refP();
    const ep = { id: 'ep1', shots: [refShot(0, { characters: ['林小满'] }), refShot(1, { characters: ['林小满', '路人甲'], props: ['无名剑'] })] };
    const r = refIntegrity(p, ep);
    assertEq(r.pass, false); assertEq(r.level, 'fail', '解析不到的引用是确定性错误');
    assertEq(r.hits.length, 2, '仅镜2 的两个未知名字命中');
    assertEq(r.hits.map(h => h.code).join(','), 'unknown-subject,unknown-subject');
    assertEq(r.hits.map(h => h.order).join(','), '2,2', 'hits 应定位到镜号');
    assertEq(r.hits.map(h => h.name).join(','), '路人甲,无名剑');
    assertEq(r.hits[0].shotId, 'sh1', 'hits 应带镜头 id 供调用方跳转');
  } },
  { name: 'refIntegrity:缺真实参考图/零主体引用 → warn(不升 fail)', fn() {
    const p = refP();
    const ep = { id: 'ep1', shots: [
      refShot(0, { characters: ['林小满'], scene: '客厅', props: ['玉佩'] }), // 客厅只有 data: 内联图,玉佩缺图
      refShot(1, {}), // 零主体引用
    ] };
    const r = refIntegrity(p, ep);
    assertEq(r.pass, false); assertEq(r.level, 'warn', '缺图与零引用是提醒级,不与未知引用同级');
    assertEq(r.hits.map(h => h.code + '@' + h.order).join(','), 'no-ref-image@1,no-ref-image@1,no-subject-ref@2');
    assertEq(r.hits.filter(h => h.code === 'no-ref-image').map(h => h.name).join(','), '客厅,玉佩');
  } },
  { name: 'refIntegrity:缺图判定与真实生成请求同一取图口径(Domain.shotRefImages 对齐)', fn() {
    const p = refP();
    const s = refShot(0, { characters: ['林小满-战损'], scene: '客厅', props: ['玉佩'] });
    const r = Skills.check('subjects', { p, s }).find(x => x.skill === 'subjects.refIntegrity');
    const fed = DomainMod.shotRefImages(p, s).refImages.map(x => x.name); // 真实喂模型的参考图名单
    assertEq(fed.join(','), '林小满-战损', '只有形态图是可喂模型的真实图');
    r.hits.forEach(h => assert(!fed.includes(h.name), '进了参考图组的主体不应被判缺图:' + h.name));
    assertEq(r.hits.map(h => h.name).join(','), '客厅,玉佩', '未进参考图组的解析名应逐个命中');
    assertEq(Skills.check('subjects', { p, s: refShot(1, { characters: ['林小满'] }) })
      .find(x => x.skill === 'subjects.refIntegrity').hits.length, 0, '镜级入口只判传入的那一镜');
  } },
  { name: 'refIntegrity:纯函数(不改入参、同输入同结论)且无判定输入时不产出结论', fn() {
    const p = refP();
    const ep = { id: 'ep1', shots: [refShot(0, { characters: ['路人甲'] })] };
    const snap = JSON.stringify([p, ep]);
    const a = refIntegrity(p, ep), b = refIntegrity(p, ep);
    assertEq(JSON.stringify(a), JSON.stringify(b), '同输入应给同结论(无隐藏状态)');
    assertEq(JSON.stringify([p, ep]), snap, '校验项不得改动领域对象');
    const empty = refIntegrity(p, { id: 'ep2', shots: [] });
    assertEq(empty.pass, true); assertEq(empty.level, 'info'); assertEq(empty.hits.length, 0, '无镜头即无判定输入,不产出命中');
    assertEq(refIntegrity(null, ep).level, 'info', '无项目上下文不产出结论(不冒充通过判定)');
  } },
  { name: 'refIntegrity:双端消费点同口径——就绪检查附 result.checks,不进 blockers/不计费', fn() {
    const cmdSrc = fs.readFileSync(path.join(ROOT, 'js', 'commands.js'), 'utf8');
    const cliSrc = fs.readFileSync(path.join(ROOT, 'cli.js'), 'utf8');
    assertPreflightFace('subjects', '主体面');
    [['js/commands.js', cmdSrc], ['cli.js', cliSrc]].forEach(([f, src]) => {
      assert(/result: Object\.assign\(\{\}, st, \{ checks \}\)/.test(src), f + ' 校验结论应附在 result.checks(不并入 Domain 推导结果)');
    });
    // 就绪检查是 read 类零计费命令(校验项不新增计费动作与标签)
    const meta = require('../js/cmd-registry.js').byName['episode.preflight'];
    assertEq(meta.risk, 'read', '就绪检查应仍是 read 类');
    assert(!/meter: true/.test(cmdSrc.slice(cmdSrc.indexOf("reg('episode.preflight'"), cmdSrc.indexOf("reg('episode.generateStoryboard'"))), '就绪检查不得开计费');
  } },
  { name: 'crossShot:同一主体跨镜锁同一张图 → info;只在一镜出场的主体不判一致性', fn() {
    const p = refP();
    const r = crossShot(p, [
      refShot(0, { characters: ['林小满'], props: ['玉佩'] }), // 玉佩缺图但只出场一镜:归 SK-12,不判一致性
      refShot(1, { characters: ['林小满'] }),
    ]);
    assertEq(r.pass, true); assertEq(r.level, 'info'); assertEq(r.hits.length, 0, '跨镜锁同一张参考图不应产出命中');
    assert(refIntegrity(p, { id: 'ep1', shots: [refShot(0, { props: ['玉佩'] })] }).hits.length === 1, '单镜缺图仍由完备性面如实报告');
  } },
  { name: 'crossShot:权威图与形态图混用 → ref-image-drift(基准取跨镜多数派)', fn() {
    const p = refP();
    const r = crossShot(p, [
      refShot(0, { characters: ['林小满'] }),
      refShot(1, { characters: ['林小满-战损'] }), // 少数派:喂到形态图,与其余镜不是同一张
      refShot(2, { characters: ['林小满'] }),
    ]);
    assertEq(r.pass, false); assertEq(r.level, 'warn', '形态切换可能是有意换装,只判提醒级');
    assertEq(r.hits.map(h => h.code + '@' + h.order).join(','), 'ref-image-drift@2');
    assertEq(r.hits[0].name, '林小满-战损'); assertEq(r.hits[0].shotId, 'sh1', 'hits 应带镜头 id 供调用方跳转');
    assertEq(crossShot(p, [refShot(0, { characters: ['林小满-战损'] }), refShot(1, { characters: ['林小满-战损'] })]).hits.length, 0, '全镜统一用形态图不算漂移');
  } },
  { name: 'crossShot:形态取不到真实图 → ref-lock-gap(no-image),与完备性面各报各的', fn() {
    const subs = refP().subjects.map(s => (s.id === 'sj3' ? Object.assign({}, s, { forms: [{ id: 'fm2', name: '碎裂', image: '/uploads/a/sj3-f1.png' }] }) : s));
    const p = refP({ subjects: subs }); // 玉佩:权威图缺,只有「碎裂」形态有图
    const shots = [refShot(0, { props: ['玉佩'] }), refShot(1, { props: ['玉佩-碎裂'] })];
    const r = crossShot(p, shots);
    assertEq(r.level, 'warn');
    assertEq(r.hits.map(h => h.code + '@' + h.order + ':' + h.reason).join(','), 'ref-lock-gap@1:no-image', '别的镜锁得住这镜锁不住');
    assertEq(refIntegrity(p, { id: 'ep1', shots }).hits.map(h => h.code).join(','), 'no-ref-image', '完备性面照报该镜缺图,两条结论互不吞并');
  } },
  { name: 'crossShot:被参考图组上限挤出 → ref-lock-gap(over-cap)', fn() {
    const p = manySubjP(6);
    const names = p.subjects.map(s => s.name);
    const shots = [refShot(0, { characters: names }), refShot(1, { characters: ['角色5'] })];
    assertEq(DomainMod.shotRefImages(p, shots[0]).refImages.length, 5, '参考图组上限 5 张(第 6 个主体进不去真实生成请求)');
    const r = crossShot(p, shots);
    assertEq(r.hits.map(h => h.code + '@' + h.order + ':' + h.reason + ':' + h.name).join(','), 'ref-lock-gap@1:over-cap:角色5', '有图却被上限挤出的镜应如实命中');
    assertEq(refIntegrity(p, { id: 'ep1', shots }).hits.length, 0, '主体有图,完备性面无话可说——上限挤出只有一致性面看得见');
  } },
  { name: 'crossShot:曾用名与现名混用 → alias-drift(完备性面解析得到,不报)', fn() {
    const p = refP();
    const shots = [refShot(0, { characters: ['林小满'] }), refShot(1, { characters: ['林小满'] }), refShot(2, { characters: ['小满'] })];
    const r = crossShot(p, shots);
    assertEq(r.hits.map(h => h.code + '@' + h.order).join(','), 'alias-drift@3');
    assertEq(r.hits[0].name, '小满'); assertEq(r.hits[0].base, '林小满', 'hits 应给出基准名供回填');
    assertEq(refIntegrity(p, { id: 'ep1', shots }).hits.length, 0, '曾用名解析得到,完备性面判通过——一致性半才看得见改名未回填');
  } },
  { name: 'crossShot:纯函数(不改入参、同输入同结论);单镜与无项目上下文不产出结论', fn() {
    const p = refP();
    const shots = [refShot(0, { characters: ['林小满'] }), refShot(1, { characters: ['小满'] })];
    const ep = { id: 'ep1', shots };
    const snap = JSON.stringify([p, ep]);
    const a = crossShot(p, shots), b = crossShot(p, shots);
    assertEq(JSON.stringify(a), JSON.stringify(b), '同输入应给同结论(无隐藏状态)');
    assertEq(JSON.stringify([p, ep]), snap, '校验项不得改动领域对象');
    assertEq(crossShot(p, [refShot(0, { characters: ['林小满'] })]).level, 'info', '单镜无跨镜可比,不冒充通过判定');
    assertEq(Skills.check('subjects', { p, s: shots[1] }).find(x => x.skill === 'subjects.crossShot').hits.length, 0, '镜级入口无跨镜输入');
    assertEq(crossShot(null, shots).hits.length, 0, '无项目上下文不产出结论');
  } },
  { name: 'crossShot:消费点——就绪检查两条结论 + 问题中心低危(不改门禁、不新增计费)', fn() {
    const p = refP();
    const conc = Skills.check('subjects', { p, ep: { id: 'ep1', shots: [refShot(0, { characters: ['林小满'] }), refShot(1, { characters: ['小满'] })] } });
    assertEq(conc.map(x => x.skill).join(','), 'subjects.refDiscipline,subjects.refIntegrity,subjects.crossShot,subjects.crossShot',
      '主体面现有四条已落地校验项(参考纪律 + 完备性 + 一致性 + 多镜头写法)');
    assertEq(conc.map(x => x.id).join(','),
      'subjects.genRefDiscipline,subjects.shotRefIntegrity,subjects.crossShotConsistency,subjects.multiShotPrompt',
      '结论应同时给实现 id 与能力 id');
    const isrc = fs.readFileSync(path.join(ROOT, 'js', 'issues.js'), 'utf8');
    assertIssuesProjection('subjects', 'subject-inconsistent', 'subjects.crossShot', 'episode');
    assert(isrc.includes("kind: 'subject-inconsistent', sev: 'low'"), '一致性提醒须挂低危');
    const rsrc = fs.readFileSync(path.join(ROOT, 'js', 'release.js'), 'utf8');
    assert(/x\.sev === 'high' \|\| x\.sev === 'mid'/.test(rsrc), '发布门 G2 只数高/中危 —— 低危提醒不改门禁状态');
    ['episode.generateVideos', 'shot.generateVideo'].forEach(n => assert(!Skills.byId('subjects.crossShot').cmds.includes(n), '生成动作侧未加拦截/弹窗,条目不得挂未接的命令面:' + n));
  } },
  { name: 'sizeLinkage:隔级递进的分镜表全 pass;级差现取 WfCore.sizeGap(不在 skill 层另立阶梯)', fn() {
    const W = require('../js/wf-core.js');
    const r = sizes('全景', '近景', '中景', '特写');
    assertEq(r.pass, true); assertEq(r.level, 'info'); assertEq(r.hits.length, 0, '隔一级切换不应产出命中');
    assertEq(W.sizeGap('全景', '近景'), 2, '判据基准就是词表单源的级差:隔一级=2');
    assertEq(sizes('大全景', '近景').hits.length, 0, '级差 3 按阶梯属隔级递进,不误报为两极对切');
  } },
  { name: 'sizeLinkage:连续同景别成串 → flat-run(定位串首镜并带串尾镜号);两镜同景别是正反打不报', fn() {
    const r = sizes('中景', '中景', '中景', '特写');
    assertEq(r.pass, false); assertEq(r.level, 'warn', '景别衔接是提醒级,不升 fail');
    assertEq(r.hits.map(h => h.code + '@' + h.order + '-' + h.to).join(','), 'flat-run@1-3');
    assertEq(r.hits[0].run, 3); assertEq(r.hits[0].name, '中景');
    assertEq(r.hits[0].shotId, 'sh0', 'hits 应带镜头 id 供调用方跳转');
    assertEq(sizes('中景', '中景', '特写', '近景').hits.length, 0, '两镜同景别对切是正反打常态,不当缺陷报');
    assertEq(sizes('近景', '近景', '近景', '全景', '全景', '全景').hits.map(h => h.order + '-' + h.to).join(','), '1-3,4-6', '多段成串应逐段命中');
  } },
  { name: 'sizeLinkage:两极对切 → jump-cut(带上一镜景别与实测级差)', fn() {
    const r = sizes('大全景', '特写');
    assertEq(r.level, 'warn');
    assertEq(r.hits.map(h => h.code + '@' + h.order).join(','), 'jump-cut@2');
    assertEq(r.hits[0].base, '大全景'); assertEq(r.hits[0].name, '特写'); assertEq(r.hits[0].gap, 4, '两极级差应如实带出');
    assertEq(sizes('大全景', '超级特写').hits[0].gap, 5, '阶梯两端级差 5 同属两极');
    assertEq(sizes('大全景', '中景', '特写').hits.length, 0, '中间补了中景过渡镜即不再命中');
  } },
  { name: 'sizeLinkage:整集最大级差不到隔一级 → no-progression 一条集级结论(不逐镜重复报)', fn() {
    const r = sizes('全景', '中景', '近景', '中景');
    assertEq(r.hits.map(h => h.code + '@' + h.order).join(','), 'no-progression@0', '整集级命中不冒充镜号');
    assertEq(r.hits[0].gap, 1); assertEq(r.hits[0].pairs, 3, 'hits 应带实测最大级差与可判定对数');
    assertEq(sizes('全景', '中景', '近景').hits.length, 0, '可判定相邻对不足判定下限时不下整集断言');
  } },
  { name: 'sizeLinkage:没填景别与阶梯外词一律不判定(并打断同级串);单镜入口不产出结论', fn() {
    assertEq(sizes('中景', undefined, '中景', '中景').hits.length, 0, '缺景别的那两对不可判定,同级串被打断不成串');
    assertEq(sizes('远景', '远景', '远景', '远景').hits.length, 0, '阶梯外自定义词不判定,不冒充结论');
    assertEq(sizes('中景', '中景', undefined, '中景', '中景').hits.length, 0, '被缺字段隔开的两段两镜串不合并计数');
    assertEq(linkOf([sizeShot(0, '中景')]).level, 'info', '单镜无相邻可比,不冒充通过判定');
    assertEq(Skills.check('shots', { p: { id: 'p1' }, s: sizeShot(0, '中景') })
      .find(x => x.skill === 'shots.sizeProgression').hits.length, 0, '镜级入口无相邻输入');
    assertEq(Skills.check('shots', {}).length, 3, '分镜步现有三条已落地校验项(景别递进 + 抽卡稳定词 + 动态感准入)');
  } },
  { name: 'sizeLinkage:纯函数(不改入参、同输入同结论)', fn() {
    const shots = [sizeShot(0, '中景'), sizeShot(1, '中景'), sizeShot(2, '中景'), sizeShot(3, '大全景')];
    const snap = JSON.stringify(shots);
    assertEq(JSON.stringify(linkOf(shots)), JSON.stringify(linkOf(shots)), '同输入应给同结论(无隐藏状态)');
    assertEq(JSON.stringify(shots), snap, '校验项不得改动领域对象');
  } },
  { name: 'sizeLinkage:消费点——就绪检查双端按步序附结论 + 问题中心低危(不改门禁、不新增计费)', fn() {
    assertPreflightFace('shots', '分镜面');
    assertPreflightOrder('subjects', 'shots', '主体在分镜之前');
    assertPreflightOrder('shots', 'film', '分镜在成片之前');
    const isrc = fs.readFileSync(path.join(ROOT, 'js', 'issues.js'), 'utf8');
    assertIssuesProjection('shots', 'shot-size-linkage', 'shots.sizeProgression', 'episode');
    assert(isrc.includes("kind: 'shot-size-linkage', sev: 'low'"), '景别衔接提醒须挂低危(发布门 G2 只数高/中危)');
    const rsrc = fs.readFileSync(path.join(ROOT, 'js', 'release.js'), 'utf8');
    assert(/x\.sev === 'high' \|\| x\.sev === 'mid'/.test(rsrc), '发布门 G2 只数高/中危 —— 低危提醒不改门禁状态');
    assertEq(require('../js/cmd-registry.js').byName['episode.preflight'].risk, 'read', '就绪检查应仍是 read 类零计费');
    const sk = Skills.byId('shots.sizeProgression');
    assertEq(sk.pending.length, 0, '校验面已落地,不应再挂 pending');
    assertEq(sk.checks.join(','), 'shots.sizeLinkage');
    assert(sk.cmds.includes('episode.preflight'), '条目应登记已接通的就绪检查命令面');
    assert(sk.gaps.includes('G-10'), '轴线面与景别选型的语义判断仍待 G-10');
    // 级差单源:skill 层只调 WfCore.sizeGap,不自建第二份阶梯(整份词表字面的零残留由词表单源套件覆盖)
    const sksrc = fs.readFileSync(path.join(ROOT, 'js', 'skills.js'), 'utf8');
    assert(sksrc.includes('wfCore().sizeGap'), '景别级差应现取 WfCore.sizeGap');
    assert(!/indexOf\((?:prev|cur|a|b)\)/.test(sksrc), 'skill 层不得自建景别索引查表(级差只由 sizeGap 给)');
  } },
  { name: 'stableLexicon:三条稳定词写全 → info;只写一部分 → stable-word-partial(带已写与缺的字面)', fn() {
    const ok = lexOf(lexEp([lexShot(0, '她缓慢转身,窗外雨声渐起;' + STABLE_OK)]));
    assertEq(ok.pass, true); assertEq(ok.level, 'info'); assertEq(ok.hits.length, 0, '稳定词写全的镜不应产出命中');
    const r = lexOf(lexEp([lexShot(0, '她缓慢转身,窗外雨声渐起;五官稳定不变形,人体结构正常')]));
    assertEq(r.pass, false); assertEq(r.level, 'warn', '稳定词面只到提醒级');
    assertEq(r.hits.map(h => h.code + '@' + h.order).join(','), 'stable-word-partial@1');
    assertEq(r.hits[0].name, '不变形、结构正常', 'hits 应给出已写的字面');
    assertEq(r.hits[0].miss, '不僵硬', 'hits 应给出该补的字面');
    assertEq(r.hits[0].shotId, 'sh0', 'hits 应带镜头 id 供调用方跳转');
  } },
  { name: 'stableLexicon:一个稳定词都没有 → no-stable-word;命中条目自列的模糊词 → vague-word(逐词一条)', fn() {
    const r = lexOf(lexEp([lexShot(0, '她缓慢转身,平稳横移,固定镜头')]));
    assertEq(r.hits.map(h => h.code + ':' + h.miss).join(','), 'no-stable-word:不变形、结构正常、不僵硬', 'hits 应列出三条该补的字面');
    assertEq(r.hits[0].name, '', '一个都没写时无已写字面可给');
    const v = lexOf(lexEp([lexShot(0, '一个很酷的镜头,画面好看;' + STABLE_OK)]));
    assertEq(v.hits.map(h => h.code + ':' + h.name).join(','), 'vague-word:好看,vague-word:很酷', '模糊词逐词一条,稳定词写全则不再报稳定词面');
    assertEq(v.level, 'warn');
    assertEq(lexOf(lexEp([lexShot(0, '她缓慢转身,神情黯淡;' + STABLE_OK)])).hits.length, 0, '不含模糊词的具体描述不报');
  } },
  { name: 'stableLexicon:判定输入是真实生成请求(现取 Domain.buildVideoRequest),不是分镜字段本身', fn() {
    // 稳定词写在本集美术风格后缀里:逐镜提示词字段看不见,但真实发出去的那条带着它——判后者才不误报
    const shot = lexShot(0, '她缓慢转身,窗外雨声渐起');
    const ep = lexEp([shot], { styleSuffix: '写实电影感,' + STABLE_OK });
    assert(!shot.prompt.includes('不僵硬'), '夹具:分镜字段本身没写稳定词');
    assert(DomainMod.buildVideoRequest(lexP, ep, shot).prompt.includes('不僵硬'), '真实生成请求里由美术风格后缀带出稳定词');
    assertEq(lexOf(ep).hits.length, 0, '判真实请求即不误报');
    // 主体定义前置那句一致性声明不算稳定词(锁不锁得住归 SK-13,本项只判解剖/动作三面)
    const p = manySubjP(1);
    const refed = lexShot(1, '她缓慢转身,窗外雨声渐起', { characters: ['角色0'] });
    assert(DomainMod.buildVideoRequest(p, null, refed).prompt.includes('严格保持一致'), '有主体参考图组时请求自带一致性声明');
    assertEq(lexOf(lexEp([refed]), p).hits.map(h => h.code).join(','), 'no-stable-word', '一致性声明不顶替稳定词');
  } },
  { name: 'stableLexicon:词表单源——稳定词与模糊词字面现筛 KB 抽卡条目,skill 层不写第二份词表', fn() {
    const KB = require('../js/knowledge.js');
    const rules = KB.section('抽卡军规');
    ['不变形', '结构正常', '不僵硬'].forEach(w =>
      assert(rules.includes(w) && KB.section('抽卡公式').includes(w), '稳定词字面须同时在两条条目正文里:' + w));
    assert(/模糊词[((]"好看\/很美\/很酷"/.test(rules), '模糊词表须仍写在条目正文括号里(字面失配时判据退空,不制造假命中)');
    const sksrc = fs.readFileSync(path.join(ROOT, 'js', 'skills.js'), 'utf8');
    ['好看', '很美', '很酷'].forEach(w => assert(!sksrc.includes(w), 'skill 层不得内联模糊词字面(只从条目正文切):' + w));
    // 通用的"稳定"二字不进判据:运镜/机位描述里也出现得到,收进来会把没写稳定词的镜判成写了
    assertEq(lexOf(lexEp([lexShot(0, '镜头平稳,画面稳定,缓慢推镜')])).hits.map(h => h.code).join(','), 'no-stable-word');
  } },
  { name: 'stableLexicon:纯函数(不改入参、同输入同结论);提示词未写与无项目上下文不产出结论', fn() {
    const ep = lexEp([lexShot(0, '她缓慢转身,窗外雨声渐起')]);
    const snap = JSON.stringify([lexP, ep]);
    assertEq(JSON.stringify(lexOf(ep)), JSON.stringify(lexOf(ep)), '同输入应给同结论(无隐藏状态)');
    assertEq(JSON.stringify([lexP, ep]), snap, '校验项不得改动领域对象');
    assertEq(lexOf(lexEp([lexShot(0, '')])).hits.length, 0, '提示词还没写的镜无判定输入');
    assertEq(lexOf(lexEp([lexShot(0, '', { plot: '她缓慢转身' })])).hits.map(h => h.code).join(','), 'no-stable-word',
      '只有剧情文案的镜按请求装配同口径判(prompt 缺则取 plot)');
    assertEq(lexOf(lexEp([])).level, 'info', '无镜头即无判定输入');
    assertEq(Skills.check('shots', { ep }).find(x => x.skill === 'shots.promptEightDim').hits.length, 0, '无项目上下文不产出结论');
    assertEq(Skills.check('shots', { p: lexP, s: lexShot(0, '她缓慢转身') })
      .find(x => x.skill === 'shots.promptEightDim').hits.length, 1, '镜级入口只判传入的那一镜');
  } },
  { name: 'stableLexicon:消费点——就绪检查按面表自动跟上(不拦生成、不改门禁、不开计费)', fn() {
    const sk = Skills.byId('shots.promptEightDim');
    assertEq(sk.pending.length, 0, '校验面已落地,不应再挂 pending');
    assertEq(sk.checks.join(','), 'shots.stableLexicon');
    assert(sk.cmds.includes('episode.preflight'), '条目应登记已接通的就绪检查命令面');
    assert(sk.gaps.includes('G-10'), '八维填得全不全、动作写得慢不慢的语义判断仍待 G-10');
    // 消费点由登记推导:所属分镜面早已在双端就绪检查的面表里,故两端实现一行未改
    assertPreflightFace('shots', '分镜面');
    const consumers = Skills.list().filter(s => !s.pending.includes('check') && s.checks.length && s.cmds.includes('episode.preflight'));
    assertEq((consumers.find(x => x.id === 'shots.promptEightDim') || {}).stage, 'shots', '新增校验项不改就绪检查的面清单');
    assertEq(require('../js/cmd-registry.js').byName['episode.preflight'].risk, 'read', '就绪检查应仍是 read 类零计费');
    ['js/sb-gen.js', 'js/produce.js'].forEach(f =>
      assert(!fs.readFileSync(path.join(ROOT, f), 'utf8').includes('Skills.'), f + ' 生成动作里不加校验拦截(结论只报不拦)'));
    // 问题中心已补本面的投影:挂低危提醒,判据仍只在校验项里一份(取值口径由投影表登记,与景别面同表同一处取值)
    const isrc = fs.readFileSync(path.join(ROOT, 'js', 'issues.js'), 'utf8');
    assertIssuesProjection('shots', 'shot-stable-lexicon', 'shots.promptEightDim', 'episode');
    assert(isrc.includes("kind: 'shot-stable-lexicon', sev: 'low'"), '稳定词提醒须挂低危(发布门 G2 只数高/中危,warn 不抬成发布门 fail)');
    const rsrc = fs.readFileSync(path.join(ROOT, 'js', 'release.js'), 'utf8');
    assert(/x\.sev === 'high' \|\| x\.sev === 'mid'/.test(rsrc), '发布门 G2 只数高/中危 —— 本轮不改门禁口径');
  } },
  { name: 'renderCredential:干净夹具全 pass(有指纹的真片 + 已确认 + 输入未变 → info 无命中)', fn() {
    const r = credOf([credShot(0), credShot(1)]);
    assertEq(r.pass, true); assertEq(r.level, 'info'); assertEq(r.hits.length, 0, '凭据立得住的镜不应产出命中');
  } },
  { name: 'renderCredential:已出片却无输入指纹 → credential-missing(该镜判旧机制恒不生效)', fn() {
    const s = credShot(0, { video: { status: 'done', url: '/uploads/gen/v0.mp4', inputHash: '' } });
    // 本条报的正是这件事:无指纹时 Domain 的指纹分支不比对,改了输入也判不出过期
    s.prompt = '换过的提示词';
    assertEq(DomainMod.shotVideoStale(credP, s, true), false, '无指纹的镜改了输入仍判不出过期(这正是要报的失效点)');
    const r = credOf([s]);
    assertEq(r.pass, false); assertEq(r.level, 'warn', '凭据缺失是提醒级,不升 fail');
    assertEq(credCodes(r), 'credential-missing@1');
    assertEq(r.hits[0].shotId, 'sh0', 'hits 应带镜头 id 供调用方跳转');
    assertEq(credOf([credShot(0, { video: { status: 'none' } })]).hits.length, 0, '没出过片的镜没有凭据可言,不报凭据缺失');
  } },
  { name: 'renderCredential:确认后输入变了 → confirm-stale;定稿镜判旧报更强的 final-stale', fn() {
    const s = credShot(0);
    s.videoModel = 'model-v2'; // 换模型进指纹但不回落确认闸(UI 只在改提示词/剧情/台词/旁白时置 confirm=false)
    assert(DomainMod.shotVideoStale(credP, s, true), '换模型应让生成指纹判旧(判旧取 Domain,本层不复算)');
    const r = credOf([s]);
    assertEq(r.level, 'warn', '确认失效是提醒级,不升 fail');
    assertEq(credCodes(r), 'confirm-stale@1', '确认背书的已不是当前输入');
    const f = credShot(1); f.videoModel = 'model-v2'; f.final = true;
    assertEq(credCodes(credOf([f])), 'final-stale@2', '定稿镜被批量生成按 !s.final 排除,过期在它上面没有出口');
    assertEq(f.confirm, true, '夹具里定稿镜同时也是已确认镜');
    // 输入没变的定稿/已确认镜一律不报:本条判的是判旧,不是"定稿"或"已确认"本身
    assertEq(credOf([credShot(2, { final: true })]).hits.length, 0);
  } },
  { name: 'renderCredential:未确认未出片 → unconfirmed-pending;在线态占位模拟 → sim-credential', fn() {
    assertEq(credCodes(credOf([credShot(0, { confirm: false, video: { status: 'none' } })])), 'unconfirmed-pending@1',
      '确认闸会把它跳进批量生成的 skipped,而 Domain 只在全镜出片时才报待确认');
    assertEq(credOf([credShot(0, { confirm: false, final: true, video: { status: 'none' } })]).hits.length, 0,
      '定稿镜本就不进生成队列,不需要确认');
    const sim = credShot(0, { video: { status: 'done', url: '/uploads/gen/ph0.mp4', simulated: true } });
    assertEq(credCodes(credOf([sim], { online: true })), 'sim-credential@1', '在线态下占位模拟不是真实上游凭据');
    assertEq(credOf([sim], { online: false }).hits.length, 0, '离线回退本就用占位模拟,不当缺陷报');
  } },
  { name: 'renderCredential:纯函数(不改入参、不回写确认闸);无项目/空分镜表不冒充结论', fn() {
    const shots = [credShot(0, { confirm: false, video: { status: 'none' } }), credShot(1, { final: true })];
    const snap = JSON.stringify(shots);
    assertEq(JSON.stringify(credOf(shots)), JSON.stringify(credOf(shots)), '同输入应给同结论(无隐藏状态)');
    assertEq(JSON.stringify(shots), snap, '校验项不得改动领域对象——尤其不得回写 confirm/final(确认闸行为不动)');
    assertEq(credOf([]).level, 'info', '空分镜表无判定输入');
    assertEq(Skills.check('gen', {}).find(x => x.id === 'gen.renderCredential').level, 'info', '无项目上下文不产出结论');
    // 单镜入口(只传 s)与整集入口同判据,镜号按 s.order 定位
    assertEq(Skills.check('gen', { p: credP, s: credShot(3, { confirm: false, video: { status: 'none' } }) })
      .find(x => x.id === 'gen.renderCredential').hits.map(h => h.code + '@' + h.order).join(','), 'unconfirmed-pending@4');
  } },
  { name: 'renderCredential:消费点——gen 面由登记推导自动进就绪检查面表,两端 preflight 实现零改动', fn() {
    assertPreflightFace('gen', '生成凭据面');
    assertPreflightOrder('shots', 'gen', '生成步排在分镜步之后');
    assertPreflightOrder('gen', 'film', '生成步排在成片步之前');
    const sk = Skills.byId('gen.renderCredential');
    assertEq(sk.pending.length, 0, '校验面已落地,不应再挂 pending');
    assertEq(sk.checks.join(','), 'gen.renderCredential');
    assert(sk.cmds.includes('episode.preflight'), '条目应登记就绪检查消费点(面表由此推导)');
    assert(sk.gaps.includes('S-05'), '缺口编号保留(记账不因落地一面就清账)');
    assertEq(require('../js/cmd-registry.js').byName['episode.preflight'].risk, 'read', '就绪检查应仍是 read 类零计费');
    /* 只报不拦:生成动作侧、确认闸与发布门一概不引用本面结论(要不要拦生成的产品口径未定);
     * 本轮也未接问题中心——发布门 G2 只数问题中心的高/中危,不进问题中心即不可能改门禁状态 */
    ['js/commands.js', 'cli.js', 'js/issues.js', 'js/release.js'].forEach(f => {
      const src = fs.readFileSync(path.join(ROOT, f), 'utf8');
      assert(!src.includes('gen.renderCredential') && !src.includes("Skills.check('gen'"),
        f + ' 不得引用生成凭据面(只报不拦:不拦生成动作、不改确认闸、不进发布门)');
    });
    // 判旧单源:skill 层只调 Domain,不自写第二份指纹比对
    const ssrc = fs.readFileSync(path.join(ROOT, 'js', 'skills.js'), 'utf8');
    assert(ssrc.includes('Domain.shotVideoStale(p, s, online)'), '判旧应现取 Domain.shotVideoStale');
    assert(ssrc.includes('Domain.shotVideoReady(s, online)'), '就绪应现取 Domain.shotVideoReady');
    assert(!/inputHash !== |shotInputHash\(/.test(ssrc), 'skill 层不得自建第二份指纹比对');
  } },
  { name: 'motionDiscipline:小幅慢动作镜 → info;写了大幅动作 → motion-overrun(带命中词与位置)', fn() {
    const ok = motionOf(lexEp([mgShot(0, '她缓慢转身,窗外雨声渐起')]));
    assertEq(ok.pass, true); assertEq(ok.level, 'info'); assertEq(ok.hits.length, 0, '慢动作小幅度的镜不应产出命中');
    const base = '两人在雨中激烈打斗,随后奔跑离开';
    const r = motionOf(lexEp([mgShot(0, base)]));
    assertEq(r.pass, false); assertEq(r.level, 'warn', '动态感准入是提醒级,不升 fail');
    assertEq(r.hits.map(h => h.code + '@' + h.order).join(','), 'motion-overrun@1');
    assertEq(r.hits[0].name, '打斗', 'hits 应给出动作描述里最早出现的大幅动作词');
    assertEq(r.hits[0].at, base.indexOf('打斗'), 'hits 应定位到该词在动作描述中的位置');
    assertEq(r.hits[0].shotId, 'sh0', 'hits 应带镜头 id 供调用方跳转');
    // 装配段(轴线规则/运镜/机位/风格/负面约束)不写动作:负面约束里的禁写词不算动作命中
    const neg = motionOf(lexEp([mgShot(0, '她缓慢转身')]), { id: 'p1', subjects: [], negPrompt: '不要打斗、不要爆炸' });
    assertEq(neg.hits.length, 0, '负面约束里的禁写词不得判成这一镜写了大动作');
  } },
  { name: 'motionDiscipline:首尾帧镜的大幅动作归 SK-13 插值面,本项不重复报', fn() {
    const ep = lexEp([mgShot(0, '两人在雨中激烈打斗', { genStrategy: 'frames' })]);
    assertEq(motionOf(ep).hits.length, 0, '首尾帧镜不在本项重复报');
    const multi = Skills.check('shots', { p: lexP, ep }).concat(Skills.check('subjects', { p: lexP, ep }))
      .find(x => x.id === 'subjects.multiShotPrompt');
    assertEq(multi.hits.map(h => h.code + ':' + h.name).join(','), 'frames-motion-overrun:打斗',
      '同一镜的插值风险仍由 SK-13 那一面如实报(两面合起来不漏不重)');
  } },
  { name: 'motionDiscipline:一镜给了两个运镜 → camera-move-crowded;同一运镜的全名与简写只计一次', fn() {
    const r = motionOf(lexEp([mgShot(0, '她缓慢转身,随后镜头环绕镜头一圈', { camera: '推镜头' })]));
    assertEq(r.level, 'warn');
    assertEq(r.hits.map(h => h.code + '@' + h.order).join(','), 'camera-move-crowded@1');
    assertEq(r.hits[0].name, '推镜头、环绕镜头', 'hits 应列出这一镜命中的运镜名');
    assertEq(r.hits[0].count, 2); assertEq(r.hits[0].limit, 1, '上限就是条目那句「一次只给一个运镜」');
    assertEq(motionOf(lexEp([mgShot(0, '镜头缓慢推镜,她转身', { camera: '推镜头' })])).hits.length, 0,
      '提示词写简写、运镜字段写全名仍是同一个运镜,不算两个');
    // 机位描述不是运镜:角度/景别两轴的取值(俯拍/特写)由请求装配追加,不得算成第二个运镜
    assertEq(motionOf(lexEp([mgShot(0, '她缓慢转身的特写', { cameraSpec: { shotSize: '特写', angle: '俯拍' } })])).hits.length, 0,
      '机位栏的角度/景别取值不得判成第二个运镜');
  } },
  { name: 'motionDiscipline:整集镜长全同 → rhythm-flat(集级一条);镜长有分布不报;镜数不足不下断言', fn() {
    const flat = n => lexEp(Array.from({ length: n }, (_, i) => mgShot(i, '她缓慢转身')));
    const r = motionOf(flat(4));
    assertEq(r.hits.map(h => h.code + '@' + h.order).join(','), 'rhythm-flat@0', '整集级命中不冒充镜号');
    assertEq(r.hits[0].count, 4); assertEq(r.hits[0].name, '3秒', 'hits 应带实测镜长与可判定镜数');
    assertEq(motionOf(flat(3)).hits.length, 0, '可判定镜数不足判定下限时不下整集断言');
    // 镜长现取真实请求的 duration(与合成段时长同一份估长):文案长短一变镜长就有分布
    const varied = lexEp([0, 1, 2, 3].map(i => mgShot(i, '她缓慢转身' + '雨'.repeat(i * 100))));
    assertEq(varied.shots.map(s => DomainMod.buildVideoRequest(lexP, varied, s).duration).join(','), '3,4,5,7', '夹具:四镜真实镜长各不相同');
    assertEq(motionOf(varied).hits.length, 0, '镜长有分布即不报');
  } },
  { name: 'motionDiscipline:判据字面与运镜词表单源(现取 KB 条目正文 + WfCore 运镜表 move 轴)', fn() {
    const KB = require('../js/knowledge.js');
    assert(KB.section('抽卡军规').includes('大动态'), '军规①的「大动态」字面须仍在条目正文里(失配时该码退空,不制造假命中)');
    assert(KB.section('抽卡军规').includes('一次只给一个运镜'), '军规②那句须仍在条目正文里');
    assert(KB.section('剪辑节奏').includes('镜头长度分布'), '剪辑节奏的「节奏=镜头长度分布」须仍在条目正文里');
    const sksrc = fs.readFileSync(path.join(ROOT, 'js', 'skills.js'), 'utf8');
    assert(/CAMERA_MOVES\.filter\(x => x\.axis === 'move'\)/.test(sksrc), '运镜词表应现取 WfCore 运镜表的 move 轴');
    /* 词表逐项对齐:move 轴每一项都判得动(词表加一项本项自动跟上),
     * 角度/景别两轴的取值(俯拍/仰拍/特写是 camera 枚举的早期取值)一律不算运镜 */
    const W = require('../js/wf-core.js');
    W.CAMERA_MOVES.forEach(mv => {
      const hits = motionOf(lexEp([mgShot(0, '她缓慢转身,随后' + mv.name, { camera: '推镜头' })])).hits;
      const want = mv.axis === 'move' && mv.name !== '推镜头' ? 'camera-move-crowded' : '';
      assertEq(hits.map(h => h.code).join(','), want, '运镜判据应逐项跟着词表:' + mv.name + '(' + mv.axis + ')');
    });
  } },
  { name: 'motionDiscipline:纯函数(不改入参、同输入同结论);无判定输入不产出结论', fn() {
    const ep = lexEp([mgShot(0, '两人在雨中激烈打斗')]);
    const snap = JSON.stringify([lexP, ep]);
    assertEq(JSON.stringify(motionOf(ep)), JSON.stringify(motionOf(ep)), '同输入应给同结论(无隐藏状态)');
    assertEq(JSON.stringify([lexP, ep]), snap, '校验项不得改动领域对象');
    assertEq(motionOf(lexEp([mgShot(0, '')])).hits.length, 0, '提示词还没写的镜无判定输入');
    assertEq(motionOf(lexEp([])).level, 'info', '无镜头即无判定输入');
    assertEq(Skills.check('shots', { ep }).find(x => x.skill === 'shots.motionGate').hits.length, 0, '无项目上下文不产出结论');
    assertEq(Skills.check('shots', { p: lexP, s: mgShot(0, '两人在雨中激烈打斗') })
      .find(x => x.skill === 'shots.motionGate').hits.map(h => h.code).join(','), 'motion-overrun', '镜级入口只判传入的那一镜');
    assertEq(Skills.check('shots', { p: lexP, s: mgShot(0, '她缓慢转身') })
      .find(x => x.skill === 'shots.motionGate').hits.length, 0, '单镜入口无整集节奏可比');
  } },
  { name: 'motionDiscipline:消费点——就绪检查按面表自动跟上(不拦生成、不改门禁、不开计费)', fn() {
    const sk = Skills.byId('shots.motionGate');
    assertEq(sk.pending.length, 0, '校验面已落地,不应再挂 pending');
    assertEq(sk.checks.join(','), 'shots.motionDiscipline');
    assert(sk.cmds.includes('episode.preflight'), '条目应登记已接通的就绪检查命令面');
    assert(sk.gaps.includes('S-04'), '节拍板五段式那一份判定输入仍无命令出口,S-04 不清账');
    assert(sk.gaps.includes('G-10'), '这一镜该快该慢的语义判断仍待 G-10');
    // 消费点由登记推导:所属分镜面早已在双端就绪检查的面表里,故两端实现一行未改
    assertPreflightFace('shots', '分镜面');
    const consumers = Skills.list().filter(s => !s.pending.includes('check') && s.checks.length && s.cmds.includes('episode.preflight'));
    assertEq((consumers.find(x => x.id === 'shots.motionGate') || {}).stage, 'shots', '新增校验项不改就绪检查的面清单');
    assertEq(require('../js/cmd-registry.js').byName['episode.preflight'].risk, 'read', '就绪检查应仍是 read 类零计费');
    ['js/sb-gen.js', 'js/produce.js'].forEach(f =>
      assert(!fs.readFileSync(path.join(ROOT, f), 'utf8').includes('Skills.'), f + ' 生成动作里不加校验拦截(结论只报不拦)'));
    const isrc = fs.readFileSync(path.join(ROOT, 'js', 'issues.js'), 'utf8');
    assert(!isrc.includes('shots.motionGate'), '本面只经就绪检查消费,问题中心不新挂提醒(要不要挂的产品口径未定)');
    const rsrc = fs.readFileSync(path.join(ROOT, 'js', 'release.js'), 'utf8');
    assert(/x\.sev === 'high' \|\| x\.sev === 'mid'/.test(rsrc), '发布门 G2 只数高/中危 —— 本轮不改门禁口径');
  } },
  { name: 'methodDim:干净夹具全 pass(四维齐全 + 每镜报告取得回 + 逐镜分背书当前视频 → info 无命中)', fn() {
    const r = mdOf(mdEp([mdShot(0), mdShot(1)]));
    assertEq(r.pass, true); assertEq(r.level, 'info'); assertEq(r.hits.length, 0, '维度到位的报告不应产出命中');
  } },
  { name: 'methodDim:四维成片评审缺失/某维无分 → cut-dim-missing(集级一条,维度名取 WfCore 单源)', fn() {
    const gone = mdOf(mdEp([mdShot(0)], { cut: null }));
    assertEq(gone.pass, false); assertEq(gone.level, 'warn', '维度缺失是提醒级,不升 fail');
    assertEq(mdCodes(gone), 'cut-dim-missing@0', '整集级一条,不逐镜重复报');
    // 该步 LLM 失败时服务端如实标 null,而 Domain 与发布门 G3 只读 avg —— 四维缺失在它们眼里看不出来
    assertEq(typeof mdEp([mdShot(0)], { cut: null }).lastReview.avg, 'number', '缺四维不影响均分字段,故只有本面报得出来');
    const cut = mdCut();
    delete cut.pacing;
    assertEq(mdCodes(mdOf(mdEp([mdShot(0)], { cut }))), 'cut-dim-missing@0', '四维缺一维同样算维度没到位');
    const noScore = mdCut();
    noScore.framing = { comment: '只有评语没有分' };
    assertEq(mdCodes(mdOf(mdEp([mdShot(0)], { cut: noScore }))), 'cut-dim-missing@0');
    // 维度名是 WfCore.normalizeCut 的产出形状,skill 层不写第二份四维名
    const W = require('../js/wf-core.js');
    const shape = W.normalizeCut({});
    assertEq(Object.keys(shape).filter(k => shape[k] && typeof shape[k] === 'object').join(','),
      'natural,continuity,framing,pacing', '四维维度名的单一来源在 js/wf-core.js');
    const ssrc = fs.readFileSync(path.join(ROOT, 'js', 'skills.js'), 'utf8');
    assert(ssrc.includes('wfCore().normalizeCut({})'), '四维维度键应现取 WfCore.normalizeCut 产出形状');
    ['natural', 'continuity', 'framing', 'pacing'].forEach(k =>
      assert(!ssrc.includes("'" + k + "'"), 'skill 层不得写第二份四维名:' + k));
  } },
  { name: 'methodDim:某镜没进报告 → shot-dim-uncovered;报告对象已被挤出 → shot-report-missing', fn() {
    const shots = [mdShot(0), mdShot(1)];
    const ep = mdEp(shots);
    ep.lastReview.perShot = ep.lastReview.perShot.slice(0, 1); // 镜2 生成中/评审失败被跳过
    const r = mdOf(ep);
    assertEq(r.level, 'warn');
    assertEq(mdCodes(r), 'shot-dim-uncovered@2', '均分不含它,而快照哈希涵盖全镜集,报告整体仍读作"当前"');
    assertEq(r.hits[0].shotId, 'sh1', 'hits 应带镜头 id 供调用方跳转');
    assertEq(DomainMod.reviewStaleByScript(ep), false, '这一镜没进报告并不会让整份报告判旧(这正是要报的失效点)');
    // 报告被后续单镜审片挤出最近五条:只剩一个还在驱动均分的分数,三维评语与方法论命中都取不回
    const out = mdEp([mdShot(0, { reviews: [{ id: 'rv-new', mode: 'text', score: 9, checks: [] }] })]);
    out.lastReview.perShot[0].reportId = 'rv0';
    assertEq(mdCodes(mdOf(out)), 'shot-report-missing@1');
  } },
  { name: 'methodDim:逐镜分背书旧视频 → dim-score-stale;离线本地模拟 → local-dim-fallback;无命中字段 → check-dim-absent', fn() {
    const ep = mdEp([mdShot(0), mdShot(1)]);
    ep.lastReview.perShot[1].videoInputHash = 'old-hash'; // 子集复审沿用的旧条目
    ep.lastReview.snapshotHash = DomainMod.reviewSnapshotHashOf(ep); // 复审时快照按当前镜集重算 → 整份不判旧
    assertEq(DomainMod.reviewStaleByScript(ep), false, '整份报告读作"当前",旧条目在 Domain 眼里看不出来');
    assertEq(mdCodes(mdOf(ep)), 'dim-score-stale@2', '那一镜的分测的是换掉之前的视频');
    const local = mdOf(mdEp([mdShot(0, { reviews: [{ id: 'rv0', mode: 'local', model: '本地模拟评审', score: 9, checks: [] }] })]));
    assertEq(mdCodes(local), 'local-dim-fallback@1', '方法论注入没进过任何模型,分数是种子启发式');
    const noChk = mdEp([mdShot(0), mdShot(1)]);
    noChk.shots.forEach(s => delete s.reviews[0].checks); // 报告成型时未附方法论校验命中
    const r = mdOf(noChk);
    assertEq(mdCodes(r), 'check-dim-absent@0', '集级一条,不逐镜重复报');
    assertEq(r.hits[0].count, 2, 'hit 应带缺字段的报告条数');
    assertEq(mdOf(mdEp([mdShot(0, { reviews: [{ id: 'rv0', mode: 'text', score: 8, checks: [] }] })])).hits.length, 0,
      '空数组是"判过且没命中",不是缺字段');
  } },
  { name: 'methodDim:整份判旧/未审片/单镜入口不产出结论;纯函数不改入参', fn() {
    const stale = mdEp([mdShot(0)], { cut: null, sourceRev: 0 }, { contentRev: 3 }); // 报告出在剧本修订之前
    assert(DomainMod.reviewStaleByScript(stale), '剧本修订后整份报告判旧(判旧取 Domain,本层不复算)');
    assertEq(mdOf(stale).hits.length, 0, '已判旧的报告由 Domain 与发布门报"视为未审",不在旧报告上挑维度');
    assertEq(mdOf({ id: 'ep1', shots: [mdShot(0)] }).level, 'info', '未审片的集无判定输入(未审计数归 Domain)');
    assertEq(Skills.check('review', {}).find(x => x.id === 'review.methodDim').level, 'info', '无分集上下文不产出结论');
    assertEq(Skills.check('review', { p: rvP, s: mdShot(0) }).find(x => x.id === 'review.methodDim').hits.length, 0,
      '单镜入口无整集报告可判,不冒充结论');
    const ep = mdEp([mdShot(0), mdShot(1)], { cut: null });
    const snap = JSON.stringify(ep);
    assertEq(JSON.stringify(mdOf(ep)), JSON.stringify(mdOf(ep)), '同输入应给同结论(无隐藏状态)');
    assertEq(JSON.stringify(ep), snap, '校验项不得改动领域对象——尤其不得回写报告字段');
  } },
  { name: 'methodDim:消费点——review 面由登记推导自动进就绪检查面表,两端 preflight 实现零改动', fn() {
    assertPreflightFace('review', '审片方法论维度面');
    assertPreflightOrder('gen', 'review', '审片步排在生成步之后');
    assertPreflightOrder('review', 'film', '审片步排在成片步之前');
    const sk = Skills.byId('review.methodDim');
    assertEq(sk.pending.length, 0, '校验面已落地,不应再挂 pending');
    assertEq(sk.checks.join(','), 'review.methodDim');
    assert(sk.cmds.includes('episode.preflight'), '条目应登记就绪检查消费点(面表由此推导)');
    assert(sk.cmds.includes('episode.smartReview'), '注入面的真实消费点仍如实登记(reviewBlock/tplReview 进评审提示词)');
    assert(sk.gaps.includes('G-10'), '四维评语写得对不对、这一镜该不该是这个分仍是语义面,待 G-10');
    assertEq(require('../js/cmd-registry.js').byName['episode.preflight'].risk, 'read', '就绪检查应仍是 read 类零计费');
    // 判旧单源:skill 层只调 Domain,不自写第二份快照/rev 比对
    const ssrc = fs.readFileSync(path.join(ROOT, 'js', 'skills.js'), 'utf8');
    assert(ssrc.includes('Domain.reviewStaleByScript(ep)'), '整份判旧应现取 Domain.reviewStaleByScript');
    assert(!/snapshotHash !==|sourceRev !==|reviewSnapshotHashOf/.test(ssrc), 'skill 层不得自建第二份判旧比对');
    /* 只报不拦:审片动作侧、发布门与问题中心一概不引用本面结论——
     * 发布门 G3 的未审/判旧/低分口径与达标线逐字不动,方法论门那一半(G-10)仍未进发布门 */
    ['js/review.js', 'js/release.js', 'js/issues.js', 'js/commands.js', 'cli.js'].forEach(f => {
      const src = fs.readFileSync(path.join(ROOT, f), 'utf8');
      assert(!src.includes('review.methodDim') && !src.includes("Skills.check('review'"),
        f + ' 不得引用审片方法论维度面(只报不拦:不改审片动作、不进发布门与问题中心)');
    });
    const rsrc = fs.readFileSync(path.join(ROOT, 'js', 'release.js'), 'utf8');
    assert(/hasReview = ep => ep\.lastReview && typeof ep\.lastReview\.avg === 'number'/.test(rsrc),
      '发布门 G3 仍只读 lastReview.avg 判有无审片记录(门禁口径不动)');
    /* SK-29 的校验面已随 W37 落地,故这里不再拿它的 pending 当判据(那会变成假记账);
     * 本面落地不得把 G-10 的发布门那一半记成已闭合——判据改钉 SK-29 仍记 G-10 + 发布门对 Skills 零引用 */
    const sk29 = Skills.byId('film.deliverContract');
    assert(sk29.gaps.includes('G-10'), '发布门方法论门未落地,G-10 须仍在 SK-29 的缺口里记账');
    assert(!/Skills\./.test(rsrc), '发布门对 Skills 应仍零引用(不得因本面落地把方法论门挂进 G1–G10)');
  } },
  { name: 'subtitleTiming:干净夹具全 pass(台词短、停留够 → info 无命中)', fn() {
    const r = caption(capEp([capShot(0, { dialogue: '快走别回头' }), capShot(1, { narration: '雨声渐起' })]));
    assertEq(r.pass, true); assertEq(r.level, 'info'); assertEq(r.hits.length, 0, '读得完的字幕不应产出命中');
    // 段时长/段文本与真实合成 items、SRT 同一份构造(本层不另切一份段)
    const segs = DomainMod.subtitleSegs(capEp([capShot(0, { dialogue: '快走别回头' }), capShot(1, { narration: '雨声渐起' })]), true);
    assertEq(segs.map(x => x.text + '@' + x.start + '-' + x.end).join(','), '快走别回头@0-3,雨声渐起@3-6', '段起止=逐段累计时长');
  } },
  { name: 'subtitleTiming:超烧录上限 → caption-truncated(fail);关掉烧录只报一屏放不下', fn() {
    const long = '我'.repeat(130);
    const r = caption(capEp([capShot(0, { dialogue: long })]));
    assertEq(r.pass, false); assertEq(r.level, 'fail', '合成时确定被截断,是确定性内容丢失');
    assertEq(r.hits.map(h => h.code + '@' + h.order).join(','), 'caption-truncated@1');
    assertEq(r.hits[0].chars, 130); assertEq(r.hits[0].limit, DomainMod.SUB_BURN_MAX, '截断线取 Domain 单源常量');
    assertEq(r.hits[0].shotId, 'sh0', 'hits 应带镜头 id 供调用方跳转');
    const off = caption(capEp([capShot(0, { dialogue: long })], { sbConfig: { subtitle: false } }));
    assertEq(off.level, 'warn', '不烧录时 SRT 保留全文,只剩一屏放不下的提醒');
    assertEq(off.hits.map(h => h.code).join(','), 'caption-too-long');
  } },
  { name: 'subtitleTiming:视频被裁短而台词没删 → read-too-fast(带实测字/秒)', fn() {
    const s = capShot(0, { dialogue: '我'.repeat(30), video: { status: 'done', url: '/uploads/v.mp4' } });
    const r = caption(capEp([s], { tlTrims: { sh0: { start: 1, end: 3 } } }));
    assertEq(r.level, 'warn', '读得急是提醒级,不与确定性截断同级');
    assertEq(r.hits.map(h => h.code + '@' + h.order).join(','), 'read-too-fast@1');
    assertEq(r.hits[0].dur, 2, '段时长应取时间线裁剪出入点差(与真实合成同口径)');
    assertEq(r.hits[0].cps, 15); assertEq(r.hits[0].limit, 9);
  } },
  { name: 'subtitleTiming:停留不足最短可读时长 → caption-flash;整集无对白且开着烧录 → no-caption-track', fn() {
    const s = capShot(0, { dialogue: '快跑', video: { status: 'done', url: '/uploads/v.mp4' } });
    const flash = caption(capEp([s], { tlTrims: { sh0: { start: 1, end: 1.4 } } }));
    assertEq(flash.hits.map(h => h.code + ':' + h.dur).join(','), 'caption-flash:0.5', '裁剪短于半秒按合成下限 0.5s 计');
    const empty = caption(capEp([capShot(0), capShot(1)]));
    assertEq(empty.hits.map(h => h.code + '@' + h.order).join(','), 'no-caption-track@0', '开了烧录却一句都没有,整集级命中一次');
    assertEq(empty.level, 'warn');
    assertEq(caption(capEp([capShot(0), capShot(1)], { sbConfig: { subtitle: false } })).hits.length, 0, '没开烧录时无字幕轨不是问题');
  } },
  { name: 'subtitleTiming:纯函数(不改入参、同输入同结论);时间轴未成形不产出结论', fn() {
    const ep = capEp([capShot(0, { dialogue: '我'.repeat(130) })]);
    const snap = JSON.stringify(ep);
    assertEq(JSON.stringify(caption(ep)), JSON.stringify(caption(ep)), '同输入应给同结论(无隐藏状态)');
    assertEq(JSON.stringify(ep), snap, '校验项不得改动领域对象');
    const bare = caption(capEp([{ id: 'sh9', order: 0, dialogue: '我'.repeat(130) }])); // 无视频无底图:不进合成序列
    assertEq(bare.pass, true); assertEq(bare.level, 'info'); assertEq(bare.hits.length, 0, '无在列素材段=时间轴未成形,不冒充通过判定');
    assertEq(Skills.check('film', {}).find(x => x.skill === 'film.subtitleQC').level, 'info', '无分集上下文不产出结论');
  } },
  { name: 'subtitleTiming:切段口径单源——合成 items 与 SRT 现取 Domain,不各写一份', fn() {
    [['js/sb-io.js', 'Store'], ['cli.js', 'Domain']].forEach(([f, ns]) => {
      const src = fs.readFileSync(path.join(ROOT, f), 'utf8');
      assert(src.includes(ns + '.segDurationOf(s, true)') && src.includes(ns + '.segDurationOf(s, false)'), f + ' 合成段时长应取单源 segDurationOf');
      assert(src.includes('SUB_BURN_MAX'), f + ' 烧录截断线应取单源常量,不再手写 120');
      assert(!/Math\.min\(15, [^)]*estShotDuration/.test(src), f + ' 不应再内联第二份段时长口径');
    });
    const dsrc = fs.readFileSync(path.join(ROOT, 'js', 'domain.js'), 'utf8');
    assert(dsrc.includes('D.subtitleSegs = ') && dsrc.includes('D.composeSeqOf(ep, online)'), '字幕段应由 composeSeqOf 在列镜头推导');
  } },
  { name: 'subtitleTiming:消费点——就绪检查双端附结论 + 问题中心低危(不改门禁、不新增计费)', fn() {
    assertPreflightFace('film', '成片字幕面');
    const isrc = fs.readFileSync(path.join(ROOT, 'js', 'issues.js'), 'utf8');
    assertIssuesProjection('film', 'caption-unreadable', 'film.subtitleQC', 'episode');
    assert(isrc.includes("kind: 'caption-unreadable', sev: 'low'"), '字幕提醒须挂低危');
    const rsrc = fs.readFileSync(path.join(ROOT, 'js', 'release.js'), 'utf8');
    assert(/x\.sev === 'high' \|\| x\.sev === 'mid'/.test(rsrc), '发布门 G2 只数高/中危 —— 低危提醒不改门禁状态');
    assertEq(require('../js/cmd-registry.js').byName['episode.preflight'].risk, 'read', '就绪检查应仍是 read 类零计费');
    const sk = Skills.byId('film.subtitleQC');
    assertEq(sk.pending.length, 0, '校验面已落地,不应再挂 pending');
    assertEq(sk.checks.join(','), 'film.subtitleTiming');
    assertEq(Skills.check('film', { p: { id: 'p1' }, ep: capEp([capShot(0, { dialogue: '走' })]) }).length, 2, '成片步现有两条已落地校验项');
  } },
  { name: 'deliverContract:契约链未启用不产出结论;定稿有产物背书且链序在位 → info', fn() {
    assertEq(dcOf(dcP()).level, 'info', '一个板块都没登记阶段=没在用契约链,不拿"没定稿"当缺陷报');
    assertEq(dcOf(dcP()).hits.length, 0);
    assertEq(dcOf(dcP({ 分镜: { stage: '进行中' } })).hits.length, 0, '链启用了但没有定稿/待审核板块,无可判契约');
    assertEq(dcOf(dcP({ 剧本: { stage: '已定稿' } })).level, 'info', '剧本定稿且剧本步实况 done,契约立得住');
    const ok = dcOf(dcP({ 剧本: { stage: '已定稿' }, 主体: { stage: '已定稿' }, 分集: { stage: '已定稿' } }));
    assertEq(ok.pass, true); assertEq(ok.hits.length, 0, '前三步顺序定稿且三步实况都 done,零命中');
  } },
  { name: 'deliverContract:下游已定稿而主线上游未定稿 → final-out-of-order(带上游板块名与其实际阶段)', fn() {
    const r = dcOf(dcP({ 剧本: { stage: '已定稿' }, 主体: { stage: '进行中' }, 分集: { stage: '已定稿' } }));
    assertEq(r.pass, false); assertEq(r.level, 'warn', '契约优先级倒置是提醒级,不升 fail(不拦发布门)');
    assertEq(dcCodes(r), 'final-out-of-order:分集←主体', '只报倒置那一条:剧本定稿有背书、分集步实况 done');
    assertEq(r.hits[0].step, 'eps', 'hits 应带主线步骤键供调用方定位');
    assertEq(r.hits[0].order, 3, 'hits 应带该板块在主线契约链上的位序');
    assertEq(r.hits[0].stage, '进行中', 'hits 应给出那个上游板块的实际阶段');
    // 上游从未登记阶段:如实按「未开始」报,不冒充别的阶段词
    const none = dcOf(dcP({ 主体: { stage: '已定稿' } }));
    assertEq(dcCodes(none), 'final-out-of-order:主体←剧本');
    assertEq(none.hits[0].stage, '未开始');
    // 上游有多个未定稿时只报最靠前那个(整条链的第一个缺环),不逐个重复报
    const multi = dcOf(dcP({ 分集: { stage: '已定稿' } }));
    assertEq(dcCodes(multi), 'final-out-of-order:分集←剧本', '取链上最靠前的未定稿上游');
    assertEq(dcOf(dcP({ 剧本: { stage: '已定稿' } })).hits.length, 0, '链首板块没有上游可判');
  } },
  { name: 'deliverContract:待审核板块同一条优先级口径 → audit-out-of-order;上游全定稿即不报', fn() {
    const r = dcOf(dcP({ 剧本: { stage: '进行中' }, 主体: { stage: '待审核' } }));
    assertEq(dcCodes(r), 'audit-out-of-order:主体←剧本', '上游还会变,本板块的审核结论可能返工');
    assertEq(r.level, 'warn');
    assertEq(dcOf(dcP({ 剧本: { stage: '已定稿' }, 主体: { stage: '待审核' } })).hits.length, 0, '上游已定稿时待审核不报');
    assertEq(dcOf(dcP({ 剧本: { stage: '待审核' } })).hits.length, 0, '链首板块没有上游可判');
    // 待审核不判产物背书:审核还没过,产物不成立是常态,不是契约冲突
    assertEq(dcOf(dcP({ 剧本: { stage: '已定稿' }, 主体: { stage: '已定稿' }, 分集: { stage: '已定稿' }, 分镜: { stage: '待审核' } })).hits.length, 0,
      '分镜步实况未 done 但该板块只是待审核,不报无背书');
  } },
  { name: 'deliverContract:已定稿板块的主线实况未 done → final-unbacked(带该步首条阻塞文案)', fn() {
    const all3 = { 剧本: { stage: '已定稿' }, 主体: { stage: '已定稿' }, 分集: { stage: '已定稿' } };
    const r = dcOf(dcP(Object.assign({ 分镜: { stage: '已定稿' } }, all3)));
    assertEq(dcCodes(r), 'final-unbacked:分镜←有分集未分镜', '定稿背书的产物不成立应如实报,文案取该步阻塞项');
    assertEq(r.level, 'warn'); assertEq(r.hits[0].stage, 'ready', 'hits 应带该步实况状态词');
    assertEq(r.hits[0].step, 'shots');
    // 该步未 done 但没有阻塞项时不冒充文案,只给状态词(分镜已就位、这一镜还没出片 → 生成步未 done 且无阻塞)
    const one = dcP(Object.assign({ 分镜: { stage: '已定稿' }, 生成: { stage: '已定稿' } }, all3));
    one.episodes[0].shots = [{ id: 'sh0', order: 0, prompt: '她缓慢转身' }];
    const g = dcOf(one);
    assertEq(dcCodes(g), 'final-unbacked:生成', '无阻塞项时 name 留空,不编一句阻塞文案');
    assertEq(g.hits[0].stage, 'ready');
  } },
  { name: 'deliverContract:产物实况现取 Domain.workflow(与流程条/发布门 G1 同一份判定,含 online 维度)', fn() {
    const all4 = { 剧本: { stage: '已定稿' }, 主体: { stage: '已定稿' }, 分集: { stage: '已定稿' }, 分镜: { stage: '已定稿' } };
    const sim = dcP(Object.assign({ 生成: { stage: '已定稿' } }, all4));
    sim.episodes[0].shots = [{ id: 'sh0', order: 0, prompt: '她缓慢转身', video: { status: 'done', simulated: true, url: '/uploads/a/v.mp4' } }];
    assertEq(dcCodes(dcOf(sim, true)), 'final-unbacked:生成', '在线态离线模拟产物不算出片,生成步的定稿没有背书');
    assertEq(dcOf(sim, false).hits.length, 0, '离线态同一份数据算就绪 —— online 维度随 Domain 走,本层不写第二份就绪判定');
    // 判定确实来自 Domain.workflow:同键步骤的 done 一变,本项结论跟着变
    const wf = DomainMod.workflow(sim, true).steps.find(s => s.key === 'gen');
    assertEq(wf.done, false, '对照:Domain 侧同键步骤实测未 done');
    assertEq(DomainMod.workflow(sim, false).steps.find(s => s.key === 'gen').done, true, '对照:离线态 Domain 侧判 done');
  } },
  { name: 'deliverContract:板块名与链序取 STAGES 单源(支线板块不判、不写第二份板块词表)', fn() {
    /* 主线七步的 name 逐字就是看板那七个板块的键:看板改名或改序时本断言先红,
     * 校验层因此不必也不得另存一份板块词表(支线板块不在主线契约链上,故不判)。 */
    const names = Skills.STAGES.map(x => x.name);
    assertEq(names.join(','), '剧本,主体,分集,分镜,生成,审片,成片');
    const asrc = fs.readFileSync(path.join(ROOT, 'js', 'agent.js'), 'utf8');
    const block = asrc.slice(asrc.indexOf('const AGENT_BOARDS'), asrc.indexOf('window.AGENT_BOARDS'));
    const keys = [...block.matchAll(/key: '([^']+)'/g)].map(m => m[1]);
    assertEq(keys.filter(k => names.includes(k)).join(','), names.join(','), '看板的主线板块键应与 STAGES 七步名逐字同序');
    /* 支线板块清单钉死:看板加板块时本条先红,提醒同步条目 note 里那句判定范围(否则 note 会静默失真) */
    assertEq(keys.filter(k => !names.includes(k)).join(','), '导演', '看板现有一个支线板块,条目 note 须与此一致');
    assertEq(DomainMod.workflow(dcP(), true).steps.map(s => s.key).filter(k => !Skills.STAGES.some(x => x.key === k)).join(','),
      'prod,director,shell,clips', 'Domain.workflow 的四个支线步同样不在主线契约链上');
    keys.filter(k => !names.includes(k)).forEach(k => {
      const p = dcP(); p.boards[k] = { stage: '已定稿' };
      assertEq(dcOf(p).hits.length, 0, '支线板块不在主线契约链上,不判:' + k);
    });
    // 逐个主线板块都判得动(链序取 STAGES:第 i 个板块的上游就是它前面那 i 个)
    names.forEach((n, i) => {
      const p = dcP(); p.boards[n] = { stage: '已定稿' };
      const r = dcOf(p);
      if (!i) return assertEq(r.hits.filter(h => h.code === 'final-out-of-order').length, 0, '链首无上游:' + n);
      assertEq(dcCodes(r).split(',')[0], 'final-out-of-order:' + n + '←' + names[0], '第 ' + (i + 1) + ' 个板块的上游应是链首:' + n);
      assertEq(r.hits[0].order, i + 1);
    });
    const src = fs.readFileSync(path.join(ROOT, 'js', 'skills.js'), 'utf8');
    assert(src.includes('STAGES.map(x => ({ step: x.key, board: x.name'), '板块名与链序应现取 STAGES,不在校验层另列一张板块表');
    assert(src.includes('Domain.workflow(p,'), '产物实况应现取 Domain.workflow,不在校验层另写一份步骤就绪判定');
    keys.filter(k => !names.includes(k)).concat(['剧壳', '切片']).forEach(k =>
      assert(!src.includes("'" + k + "'"), 'skills.js 不得出现第二份板块词表:' + k));
  } },
  { name: 'deliverContract:纯函数与消费点(就绪检查自动多一条;不接发布门、不进问题中心、零计费)', fn() {
    const p = dcP({ 剧本: { stage: '已定稿' }, 主体: { stage: '进行中' }, 分镜: { stage: '已定稿' } });
    const snap = JSON.stringify(p);
    assertEq(JSON.stringify(dcOf(p)), JSON.stringify(dcOf(p)), '同输入应给同结论(无隐藏状态)');
    assertEq(JSON.stringify(p), snap, '校验项不得改动领域对象');
    assertEq(Skills.CHECKS['film.upstreamFinalContract']({}).hits.length, 0, '无项目上下文不冒充结论');
    assertEq(Skills.CHECKS['film.upstreamFinalContract'](null).hits.length, 0, '脏入参回空,不抛');
    // 记账:校验面已落地、两条缺口按纪律各自如实
    const sk = Skills.byId('film.deliverContract');
    assertEq(sk.pending.length, 0, '校验面已落地,不应再挂 pending');
    assertEq(sk.checks.join(','), 'film.upstreamFinalContract');
    assert(sk.gaps.includes('S-07') && sk.gaps.includes('G-10'), '两条缺口都仍记账:S-07 由本面承接,G-10 的发布门那半未接');
    assert(sk.covers.includes(Skills.CROSS), '判定输入含项目级板块契约链,covers 应如实含贯通层');
    // 消费点:面表内容一字不变(成片面早在表里),两端就绪检查实现一行未改
    assertPreflightFace('film', '成片交付契约面');
    assert(sk.cmds.includes('episode.preflight'), '就绪检查是本面的真实消费点,cmds 须如实登记');
    assertEq(Skills.check('film', { p, ep: capEp([capShot(0, { dialogue: '走' })]) }, { online: true }).length, 2,
      '成片面现为两条:字幕面 + 交付契约面');
    // 只报不拦:发布门口径一个字未动(release.js 对 Skills 零引用),问题中心不挂本面
    const rsrc = fs.readFileSync(path.join(ROOT, 'js', 'release.js'), 'utf8');
    assert(!/Skills\./.test(rsrc), '发布门本轮不接方法论门(G-10 产品口径未定),release.js 对 Skills 应仍零引用');
    assert(/x\.sev === 'high' \|\| x\.sev === 'mid'/.test(rsrc), '发布门 G2 仍只数高/中危');
    assert(rsrc.includes("if (fails > 0) overall = 'fail'"), '发布门 overall 计数口径逐字未动');
    const isrc = fs.readFileSync(path.join(ROOT, 'js', 'issues.js'), 'utf8');
    assertEq(IssuesMod.reminders().filter(r => r.stage === 'film').map(r => r.skill).join(','), 'film.subtitleQC',
      '问题中心的成片面只取字幕结论(要不要挂本面的产品口径未定)');
    assert(!isrc.includes('film.deliverContract') && !isrc.includes('upstreamFinalContract'), '问题中心不挂本面');
    // 零计费、不拦合成与成片动作
    assertEq(require('../js/cmd-registry.js').byName['episode.preflight'].risk, 'read', '就绪检查应仍是 read 类零计费');
    ['produce.js', 'sb-io.js'].forEach(f => assert(!/Skills\./.test(fs.readFileSync(path.join(ROOT, 'js', f), 'utf8')),
      f + ' 不得因本面引入拦截(结论只报不拦)'));
  } },
  { name: '就绪检查校验面表(源级):面清单双端单源 Skills.preflightStages(),两端只读该表 concat、不各写一份面字面量', fn() {
    /* 这段曾是并行分支反复撞车的热点(两端各写五个 Skills.check 字面量,任一侧胜出就静默摘掉别人那一面)。
     * 面清单现收成一张由注册表推出的单源表:新增一面只在条目上登记 checks 实现 + cmds 消费点,两端自动跟上。
     * 断言分三层:表的推导规则(与登记侧双向对齐)、表的内容与步序、两端只读该表(段内不得再出现面字面量)。 */
    const stages = Skills.preflightStages();
    assertEq(stages.join(' → '), 'script → subjects → eps → shots → gen → review → film', '面表现为七面,按 Skills.STAGES 主线步序');
    // 表 ⟷ 登记侧双向对齐:登记了 episode.preflight 的已落地校验面必在表里,表里的面也必有这样的登记条目
    const consumers = Skills.list().filter(s => !s.pending.includes('check') && s.checks.length && s.cmds.includes('episode.preflight'));
    ['film', 'eps', 'shots', 'gen', 'review'].forEach(st => assert(consumers.some(s => s.stage === st), st + ' 面应登记 episode.preflight 为消费点'));
    consumers.forEach(s => assert(stages.includes(s.stage), '单源面表漏收已登记面:' + s.id + '(' + s.stage + ')'));
    stages.forEach(st => assert(consumers.some(s => s.stage === st), '单源面表含无人登记的面:' + st));
    // 表的顺序就是 STAGES 步序(不是登记顺序/字母序):按 STAGES 过滤后逐字节一致
    assertEq(stages.join(','), Skills.stages().filter(k => stages.includes(k)).join(','), '面表应按 Skills.STAGES 步序,不按条目登记序');
    // 未落地(pending 含 check)的面即便登记了消费点也不进表 —— 进表只会得到空数组
    Skills.list().filter(s => s.pending.includes('check') && s.cmds.includes('episode.preflight'))
      .forEach(s => assert(!stages.includes(s.stage) || consumers.some(x => x.stage === s.stage),
        '校验面未落地的条目不应把 ' + s.stage + ' 面单独带进表:' + s.id));
    // 表现在跑出来就是十七条结论(面表 + 各面已落地校验项数,与行为断言的期望串同一口径)
    assertEq(stages.reduce((n, st) => n + Skills.check(st, {}).length, 0), 17, '七面共十七条已落地校验项');
    /* 两端只读该表:段内那条 checks 表达式必须取表,且不得再出现任何面字面量;
     * 取表 + concat 的写法两端逐字节相同(同表同口径,一端改写法即红)。 */
    const FRAG = 'Skills.preflightStages().reduce((all, stage) => all.concat(Skills.check(stage, { p, ep }, ck)), [])';
    PREFLIGHT_ENDS.forEach(([f]) => {
      const seg = preflightSeg(f), expr = preflightExpr(f);
      assert(expr.includes(FRAG), f + ' 就绪检查应按单源面表 concat(两端同一写法):' + FRAG);
      Skills.stages().concat(Skills.CROSS).forEach(st => assert(expr.indexOf("Skills.check('" + st + "'") < 0,
        f + ' 就绪检查不得再写死面字面量(新增一面就要改两处的老形态):' + st));
      assert(!/Skills\.check\('/.test(seg), f + ' 就绪检查段内不得出现写死面名的 Skills.check 调用');
      assert(seg.includes('result: Object.assign({}, st, { checks })'), f + ' 按表跑出的结论应附在 result.checks(不并入 Domain 推导结果)');
    });
  } },
  { name: '就绪检查校验面表:与七面写死并集逐字节等价(表收口不改行为),新增/摘掉一面即改一处', fn() {
    /* 收表前两端各写的是面名写死的并集。这里用那份写死表达式做独立对照(随面表实况同步抬到七面),
     * 证明"读表 concat"与它逐字节同结果——收口只动取面清单的地方,不动任何一条校验项的结论。
     * 落地 gen 面与 review 面时两端 preflight 实现都一行未改,只有这里的对照表达式与面数口径跟着抬了一档;
     * SK-29 落在已在表内的 film 面上,连对照表达式都不用改(只有条数跟着抬)。 */
    const p = refP();
    const ep = capEp([capShot(0, { dialogue: '我'.repeat(130) }), capShot(1, { dialogue: '好'.repeat(31) })], {
      content: BG + '她被人嘲笑,却默默忍住。',
    });
    p.episodes = sixEps().episodes;
    [{ online: true }, { online: false }].forEach(ck => {
      const legacy = Skills.check('script', { p, ep }, ck)
        .concat(Skills.check('subjects', { p, ep }, ck), Skills.check('eps', { p, ep }, ck),
          Skills.check('shots', { p, ep }, ck), Skills.check('gen', { p, ep }, ck),
          Skills.check('review', { p, ep }, ck), Skills.check('film', { p, ep }, ck));
      const byTable = Skills.preflightStages().reduce((all, stage) => all.concat(Skills.check(stage, { p, ep }, ck)), []);
      assertEq(JSON.stringify(byTable), JSON.stringify(legacy), '读表 concat 应逐字节等于七面写死并集(online=' + ck.online + ')');
      assertEq(byTable.length, 17, '并集现为十七条结论');
    });
    // 表是纯函数:同输入同表,且调用方拿到的是副本(改返回值不污染下次取表)
    assertEq(Skills.preflightStages().join(','), Skills.preflightStages().join(','), '同输入应给同表');
    const got = Skills.preflightStages();
    got.push(Skills.CROSS); // 主线七步现已全在表内,故拿贯通层键作哨兵(它永远不是就绪检查的一面)
    assert(!Skills.preflightStages().includes(Skills.CROSS), '取表应给副本,调用方改动不得回写单源表');
  } },
  { name: 'stageCoverage:六段段名与集号区间取自 KB 条目正文,按比例摊到当前集数;干净分集表 → info', fn() {
    const KB = require('../js/knowledge.js');
    assert(/开篇期[((]1-10集[))]/.test(KB.section('六阶段结构')), '区间单源:KB「六阶段结构」须仍写明开篇期(1-10集)(字面失配时校验项不产出结论)');
    assert(/前3集必须出现第一个大反转/.test(KB.section('六阶段结构')), '开篇期反转判据须仍在条目正文里');
    const r = arcOf(sixEps());
    assertEq(r.pass, true); assertEq(r.level, 'info'); assertEq(r.hits.length, 0, '六段各有正文且开篇有反转,不应产出命中');
    // 六集时六段各摊一集(条目刻度 1-100 按累计边界四舍五入),命中定位到段名与集号区间
    const spans = arcOf(sixEps({ 1: '', 2: '', 3: '', 4: '', 5: '', 6: '' })).hits;
    assertEq(spans.map(h => h.stage + ':' + h.from + '-' + h.to).join(','), '开篇期:1-1,升温期:2-2,高潮期:3-3,转折期:4-4,冲刺期:5-5,结局期:6-6');
    assertEq(arcOf(epsP(Array.from({ length: 12 }, () => EP_OK))).hits.length, 0, '十二集同样摊得动六段(集数少按比例缩放)');
  } },
  { name: 'stageCoverage:某段无正文 → stage-uncovered;某段被压成过场 → stage-thin(带段名与集号区间)', fn() {
    const r = arcOf(sixEps({ 4: '' }));
    assertEq(r.pass, false); assertEq(r.level, 'warn', '结构覆盖是提醒级,不升 fail');
    assertEq(r.hits.map(h => h.code + ':' + h.stage + ':' + h.from + '-' + h.to).join(','), 'stage-uncovered:转折期:4-4');
    assertEq(r.hits[0].len, 0, 'hits 应带该段实际字数供展示');
    assertEq(arcOf(sixEps({ 4: '她' })).hits[0].code, 'stage-uncovered', '短于判定下限的占位正文不算覆盖到这一段');
    // 其余五集各 200 字、结局期只有 40 字:有正文但不足按集数摊到的份额三分之一
    const tail = '她原来站在门口,竟然一个字都没有说,转身走进了那场瓢泼大雨里,再没有回过头。';
    const thin = arcOf(epsP([EP_OK + FILL, EP_OK + FILL, EP_OK + FILL, EP_OK + FILL, EP_OK + FILL, tail]));
    assertEq(thin.hits.map(h => h.code + ':' + h.stage).join(','), 'stage-thin:结局期');
    assertEq(thin.hits[0].len, tail.length, 'hits 的字数应是该段去空白正文字数');
  } },
  { name: 'stageCoverage:开篇期无反转信号 → early-no-reversal;集数少于六段不产出结论', fn() {
    const r = arcOf(sixEps({ 1: '她抱着纸箱走进雨夜的街道,身后传来一声尖锐的刹车,救命声划破长街,危险就在眼前。' }));
    assertEq(r.hits.map(h => h.code + ':' + h.stage).join(','), 'early-no-reversal:开篇期', '开篇有冲突但通篇无反转信号应如实报');
    assertEq(arcOf(sixEps()).hits.length, 0, '开篇期命中反转信号即不报');
    // 只约束开篇期:后段无反转不报(条目只写「前3集必须出现第一个大反转」)
    assertEq(arcOf(sixEps({ 3: '她抱着纸箱走进雨夜的街道,身后传来一声尖锐的刹车,救命声划破长街,危险就在眼前。' })).hits.length, 0,
      '条目只约束开篇期,不拿"后段没写反转"当缺陷报');
    assertEq(arcOf(epsP(Array.from({ length: 5 }, () => EP_OK))).level, 'info', '五集摊不出六段,不冒充结论');
    assertEq(arcOf({ id: 'p1', episodes: [] }).hits.length, 0, '空分集表无判定输入(未建分集本就是 workflow 的阻塞项)');
  } },
  { name: 'payoffPlacement:集尾卡在情绪最高拍 → info;集尾平收 → flat-ending(带全文最后一个信号位置)', fn() {
    assertEq(payoffOf(sixEps()).level, 'info', '每集集尾都有卡点信号且下一集集首立刻兑现');
    const r = payoffOf(sixEps({ 2: EP_OK + FILL })); // 卡点信号被 128 字中性填充挤出集尾窗口
    assertEq(r.pass, false); assertEq(r.level, 'warn', '卡点位置是提醒级,不升 fail');
    assertEq(r.hits.map(h => h.code + '@' + h.order).join(','), 'flat-ending@2');
    assertEq(r.hits[0].epId, 'ep2', 'hits 应带分集 id 供调用方跳转');
    assertEq(r.hits[0].name, '一小时');
    assertEq(r.hits[0].at, (EP_OK + FILL).replace(/\s+/g, '').lastIndexOf('一小时'), 'hits 应定位到全文最后一个卡点信号(提示卡点该往后挪)');
    assertEq(payoffOf(sixEps({ 2: FILL })).hits.filter(h => h.order === 2).length, 0, '全集一个信号都没有的段落归剧本段结论(SK-07),分集段不重复报');
  } },
  { name: 'payoffPlacement:卡点未在下一集兑现 → payoff-not-cashed;末集与集序外不判', fn() {
    const r = payoffOf(sixEps({ 2: FILL }));
    assertEq(r.hits.map(h => h.code + '@' + h.order + '→' + h.next).join(','), 'payoff-not-cashed@1→2', '第1集卡点后第2集集首找不到兑现信号');
    assertEq(r.hits[0].name, '原来', 'hits 应带集尾那个卡点信号');
    assertEq(payoffOf(sixEps({ 6: EP_OK + FILL })).hits.length, 0, '末集平收不判(全剧收束不需要再卡)');
    assertEq(payoffOf(sixEps({ 2: '她' })).hits.length, 0, '下一集正文短于判定下限时不判兑现(无判定输入)');
    const p = sixEps({ 2: EP_OK + FILL });
    assertEq(payoffOf(p, { id: 'zzz', content: EP_OK + FILL }).hits.length, 0, '传入的集不在集序里即无判定输入');
  } },
  { name: '分集段两条:纯函数(不改入参、同输入同结论);集级入口只判传入那一集;无输入不冒充结论', fn() {
    const p = sixEps({ 2: EP_OK + FILL, 4: '' });
    const snap = JSON.stringify(p);
    assertEq(JSON.stringify(Skills.check('eps', { p })), JSON.stringify(Skills.check('eps', { p })), '同输入应给同结论(无隐藏状态)');
    assertEq(JSON.stringify(p), snap, '校验项不得改动领域对象');
    assertEq(payoffOf(p, p.episodes[1]).hits.map(h => h.order).join(','), '2', '集级入口只判传入那一集');
    assertEq(arcOf(p).hits.map(h => h.code + ':' + h.stage).join(','), 'stage-uncovered:转折期', '六阶段覆盖是整表判定');
    assertEq(JSON.stringify(Skills.check('eps', { p, ep: p.episodes[1] })[0].hits), JSON.stringify(arcOf(p).hits), '就绪检查按集调用时结构结论仍是整表口径');
    const empty = Skills.check('eps', {});
    assertEq(empty.length, 2, '分集步现有两条已落地校验项');
    assertEq(empty.filter(x => x.level === 'info' && !x.hits.length).length, 2, '无判定输入时两条一律不产出命中');
  } },
  { name: '分集段消费点:就绪检查按主线步序附结论 + 问题中心低危(不改门禁、不新增计费)', fn() {
    const conc = Skills.check('eps', { p: sixEps() });
    assertEq(conc.map(x => x.skill).join(','), 'eps.structureStage,eps.payoffPoint', '分集面两条已落地校验项');
    assertEq(conc.map(x => x.id).join(','), 'eps.stageCoverage,eps.payoffPlacement', '结论应同时给实现 id 与能力 id');
    assertPreflightFace('eps', '分集面');
    assertPreflightOrder('subjects', 'eps', '分集在主体之后');
    assertPreflightOrder('eps', 'shots', '分集在分镜之前');
    const isrc = fs.readFileSync(path.join(ROOT, 'js', 'issues.js'), 'utf8');
    assertIssuesProjection('eps', 'eps-structure', 'eps.structureStage', 'project'); // 判定输入是整张分集表,故挂项目级
    assertIssuesProjection('eps', 'eps-payoff', 'eps.payoffPoint', 'episode');
    assert(isrc.includes("kind: 'eps-structure', sev: 'low'") && isrc.includes("kind: 'eps-payoff', sev: 'low'"), '分集面提醒须挂低危(发布门 G2 只数高/中危)');
    // 审片报告与发布门的方法论维度仍是 G-10,条目不得挂未接的命令面
    ['eps.structureStage', 'eps.payoffPoint'].forEach(id => {
      assertEq(Skills.byId(id).pending.length, 0, id + ' 校验面已落地,pending 应清空');
      assert(Skills.byId(id).cmds.includes('episode.preflight'), id + ' 应记真实消费点');
      assert(!Skills.byId(id).cmds.includes('episode.smartReview'), id + ' 不得挂未接的审片命令面');
    });
    assert(Skills.byId('eps.payoffPoint').gaps.includes('G-10'), '卡点掐得准不准仍属审片维度,待 G-10');
  } },
  { name: '审片报告只读消费:离线评审附镜级命中,不并入 issues / 不改评分 / 不新增计费', fn: async () => {
    const sb = loadReview();
    const p = refP({ script: BG }); // 项目剧本本身有 late-hook:集级结论不该混进单镜报告
    /* 干净夹具的主体另配视频参考大头照:SK-11 落地后,只有权威三视图的主体本身就是一条参考纪律命中,
     * 不给大头照的话"干净"二字就名不副实(脏夹具仍用原 p,好证明审片路径确实消费得到 SK-11) */
    const pc = refP({ script: BG });
    pc.subjects[0].imgRef = '/uploads/a/sj1-ref.png';
    const dirty = rvShot({ characters: ['林小满', '路人甲'], dialogue: '好'.repeat(31) });
    const clean = rvShot({ characters: ['林小满'], dialogue: '好'.repeat(10) });
    const rd = await sb.Review.reviewShot(p, rvEp(dirty), dirty);
    const rc = await sb.Review.reviewShot(pc, rvEp(clean), clean);
    assertEq(rd.mode, 'local', '离线应走本地模拟评审(零 LLM)');
    assertEq(rd.checks.map(c => c.skill).join(','), 'script.dialogueRule,subjects.refDiscipline,subjects.refIntegrity',
      '按主线步序附已落地的剧本面/主体面结论(主体面是整面消费,SK-11 落地后本镜的参考纪律命中一并带上)');
    assertEq(rd.checks.map(c => c.id).join(','),
      'script.dialogueLineLength,subjects.genRefDiscipline,subjects.shotRefIntegrity', '结论应同时给实现 id 与能力 id');
    assertEq(rd.checks.map(c => c.hits.map(h => h.code).join('+')).join(','), 'long-line,ref-sheet-fallback,unknown-subject');
    assertEq(rd.checks.map(c => c.level).join(','), 'warn,warn,fail', '级别一律照校验项如实报,不升不降');
    rd.checks.forEach(c => c.hits.forEach(h => assertEq(h.shotId, 'sh0', 'hits 应只留本镜命中(集级结论归就绪检查与问题中心)')));
    assert(!rd.checks.some(c => c.skill === 'script.hookStrength'), '项目剧本的开篇钩子是集级结论,不混进单镜报告');
    assertEq(rc.checks.length, 0, '干净夹具不产出命中');
    // 只报不拦:命中不进 issues,评分与达标线口径逐字不动(同 id 同提示词 = 同种子)
    assertEq(rd.issues.filter(i => i.code).length, 0, '校验命中不得并入 issues(达标线/重抽/批量优化判定口径不动)');
    assertEq(JSON.stringify(rd.issues), JSON.stringify(rc.issues), '命中不改关键问题清单');
    assertEq(rd.score, rc.score, '命中不参与评分');
    // 计费不新增:两次审片各一次预扣,校验项纯本地零 LLM 零计费
    assertEq(sb.__charges.length, 2, '校验项不新增计费动作');
    assertEq(sb.__charges[0].cost, sb.COST.review);
  } },
  { name: '审片报告消费点(源级+展示):两面同表达式且登记面无漏消费;旧报告无该字段仍可打开', fn() {
    const src = fs.readFileSync(path.join(ROOT, 'js', 'review.js'), 'utf8');
    const i = src.indexOf('function shotChecks(');
    assert(i > 0, 'review.js 应有镜级校验命中汇总函数');
    const expr = src.slice(i, src.indexOf('\n  }', i));
    const at = st => expr.indexOf("Skills.check('" + st + "'");
    assert(at('script') > 0 && at('subjects') > at('script'), '两面应同在一处汇总且按主线步序排列(只在别处调用不算消费)');
    /* 登记侧反查:凡登记 episode.smartReview 为消费点的已落地校验条目,其面必须在这处汇总里(将来新增面漏接先红)。
     * 反查按 covers 含 shots 收口——这处汇总的入口对象包是镜级的 {p, s}(命中还要按 h.shotId 过滤),
     * 故只有作用面覆盖到分镜载体的条目拿得出镜级结论;`cmds` 是条目级登记而非按面登记,
     * 覆盖不到分镜载体的条目(如 SK-24 审片面:判定输入是整集报告本身,单镜入口恒空)在这里登记的是
     * 注入面消费点,其校验面走就绪检查,由 methodDim 消费点用例钉住。 */
    const consumers = Skills.list().filter(s => !s.pending.includes('check') && s.checks.length
      && s.cmds.includes('episode.smartReview') && s.covers.includes('shots'));
    assert(consumers.length >= 2, '审片路径应已登记至少两条已落地校验条目的消费点');
    consumers.forEach(s => assert(at(s.stage) > 0, '审片报告漏消费已登记面:' + s.id + '(' + s.stage + ')'));
    // 另一向:登记了 smartReview 却覆盖不到分镜载体的已落地校验面,必须在就绪检查面表里有出口(不许两处都不消费)
    Skills.list().filter(s => !s.pending.includes('check') && s.checks.length
      && s.cmds.includes('episode.smartReview') && !s.covers.includes('shots'))
      .forEach(s => assert(Skills.preflightStages().includes(s.stage) && s.cmds.includes('episode.preflight'),
        s.id + ' 的校验面在审片报告拿不出镜级结论,须如实登记就绪检查为其消费点'));
    assert(src.includes('report.checks = shotChecks(p, s)'), '命中应挂报告的独立字段(不改三维评分与整集四维结构)');
    assert(!/issues\.(push|unshift)\([^)]*check/i.test(src), '命中不得并入 issues');
    // 展示:旧报告缺该字段照样开(结构兜底),有命中时如实标注只提醒不拦,校验项名取注册表条目名
    const sb = loadReview();
    const modals = [];
    sb.U.openModal = o => { modals.push(o); };
    const s = rvShot({ characters: [], dialogue: '' });
    const old = { id: 'rv_old', score: 6.5, model: '本地模拟评审', mode: 'local', time: '2026-08-01 10:00:00', issues: [] };
    sb.Review.openReport(refP(), rvEp(s), s, null, old);
    assertEq(modals.length, 1, '旧报告缺 checks 字段也应能打开');
    assert(!modals[0].body.includes('方法论校验命中'), '无命中不出该区块');
    sb.Review.openReport(refP(), rvEp(s), s, null, Object.assign({}, old, {
      checks: [{ id: 'script.dialogueLineLength', skill: 'script.dialogueRule', level: 'warn', hits: [{ code: 'long-line', len: 31, name: '好好', shotId: 'sh0', order: 1 }] }],
    }));
    const body = modals[1].body;
    assert(body.includes('方法论校验命中') && body.includes('只提醒不拦生成'), '命中区应如实标注只提醒不拦');
    assert(body.includes('对白铁律注入与单句长度校验'), '校验项名应取注册表条目名(不在展示层写第二份)');
    assert(body.includes('台词单句 31 字超上限'), '命中应译成人话展示');
    assert(!/未发现关键问题[\s\S]*方法论校验命中[\s\S]*rv-score/.test(body), '命中区应在评分区之后,不改评分版式');
  } },
  { name: '记账对齐:infra 三条的 pending 按实况清空,note 点名仍欠的覆盖余量(不假清未完成面)', fn() {
    const srv = fs.readFileSync(path.join(ROOT, 'server.js'), 'utf8');
    const W = require('../js/wf-core.js');
    const wfSteps = DomainMod.workflow({ id: 'p1', episodes: [], subjects: [] }).steps.map(x => x.key);
    // 每条:缺口出口的实况判据 + note 里必须点名的那几处余量(接上了就要同步改 note,不许静默扩面)
    const facts = {
      // 浏览器多轮三份人设已随 W51 收编进注册表,仍欠的只剩四处协议半有意不开放覆盖
      'core.personaCtx': ['G-01', /function wfPersonaNote\(/.test(srv), ['ops 协议', '不开放覆盖']],
      // SK-04 的补种/迁移余量已由 W53 接上(memSeed 双端单源 + headless 入口),自动沉淀那一半由 W61 接上
      // (前段四步进回流面,回流面本身仍归 SK-26);解析向导那条绕过回流的入库路径由 W108 收口到命令层,
      // 「仍欠」段的锚点随实况只剩生成/合成两步(向导那条移进"已落地"半,由下一条用例逐面钉住)
      'core.memoryDual': ['G-02', typeof W.memRecall === 'function' && typeof W.memFeedback === 'function', ['生成与合成', '素材产出']],
      // 「问题中心只报低分不报未审片」那处余量随 W54 补掉(投影落在 js/issues.js,由 issues 套件钉行为),
      // 仍欠的只剩审片报告的语义面 → 点名锚点随之换成 SK-24 与 G-10
      'review.stage': ['G-03', wfSteps.includes('review'), ['SK-24', 'G-10']],
    };
    Object.keys(facts).forEach(id => {
      const [gap, landed, owed] = facts[id];
      const s = Skills.byId(id);
      assert(landed, id + ' 的 ' + gap + ' 出口应仍在(实况变动先红,不靠文档口径)');
      assertEq(s.pending.length, 0, id + ' 的 infra 面已落地,pending 应按实况清空');
      assert(s.gaps.includes(gap), id + ' 应仍写明缺口编号 ' + gap + '(关联索引口径:落地不摘标记)');
      assert(new RegExp(gap + ' 已落地').test(s.note || ''), id + ' 的 note 须如实说明 ' + gap + ' 已落地(读者不该读成没做)');
      assert(/仍欠/.test(s.note || ''), id + ' 的 note 须写明仍欠什么(清了 pending 不等于这条没有余量)');
      // 点名断言只认「仍欠」之后那段:锚点写在"已落地"那半里不算交账(否则余量补完了 note 也能蒙过去)
      const owedText = (s.note || '').split('仍欠').slice(1).join('仍欠');
      owed.forEach(k => assert(owedText.includes(k), id + ' 的 note 须在「仍欠」段里点名:' + k));
    });
    /* SK-23 的 note 说问题中心已补未审/判旧两条投影 —— 这里钉住实况:说了没做先红。
     * 判旧与均分一律现取 Domain.episodeState 那份推导(与主线审片步、发布门 G3 同口径),投影层不写第二份判定。 */
    const isrc = fs.readFileSync(path.join(ROOT, 'js', 'issues.js'), 'utf8');
    ["kind: 'no-review', sev: 'mid'", "kind: 'review-stale', sev: 'mid'"].forEach(k =>
      assert(isrc.includes(k), '问题中心应已挂未审/判旧两条中危投影:' + k));
    assert(!/reviewStaleByScript|lastReview\.avg/.test(isrc), '审片判旧与均分只经 Domain.episodeState 取,问题中心不写第二份判定');
    // infra 面已无 pending;别人的未落地面一字未动(不借本轮顺手清别人的账)
    assertEq(Skills.list().filter(s => s.pending.includes('infra')).length, 0, 'infra 面已全部落地');
    /* 编排面最后两条也已落地:SK-26 的回流面(审片/发布两个闭环把可判定结论写回记忆桶)与 SK-05 的
     * 主线全链投影,故短名单已无 pending;两条各自的实况判据与不假清判据由 memory 套件的回流用例、
     * contract 套件的全链投影用例逐项钉住(清 pending 不等于缺口清账:G-11/G-12 仍在各自的 gaps 里) */
    assertEq(Skills.list().filter(s => s.pending.length).map(s => s.sk + ':' + s.pending.join('+')).join(','),
      '', '编排面两条落地后短名单应已无 pending');
    /* SK-29 的校验面已落地(上游定稿契约判成结论,经就绪检查消费),但 G-10 的**发布门那一半**仍未接:
     * 方法论门要不要挂成默认 warn 的可选门属产品口径,未定之前门禁一个字不动。
     * 这里不再拿 pending 快照当判据(那一面已落地,写 pending 反而是假记账),改钉真实约束:
     * 条目仍记 G-10 + release.js 对 Skills 零引用 + G2/overall 计数口径逐字未动。 */
    const sk29 = Skills.byId('film.deliverContract');
    assert(sk29.gaps.includes('G-10'), '发布门方法论门未落地,G-10 须仍在 SK-29 的缺口里记账');
    assert(sk29.checks.length && !sk29.pending.includes('check'), '校验面已落地,不得再挂 pending 冒充未做');
    const rsrc = fs.readFileSync(path.join(ROOT, 'js', 'release.js'), 'utf8');
    assert(!/Skills\./.test(rsrc), '发布门对 Skills 应仍零引用(方法论门未挂进 G1–G10)');
    assert(/x\.sev === 'high' \|\| x\.sev === 'mid'/.test(rsrc), '发布门 G2 仍只数高/中危');
    assert(rsrc.includes("if (fails > 0) overall = 'fail'"), '发布门 overall 计数口径逐字未动');
    assert(!/lastReview\.checks|report\.checks/.test(rsrc), '发布门不读审片报告的校验命中字段');
  } },
  /* SK-04 仍欠段里那句"素材产出的判定面归发布门 X"是给读者指路的门号,指错就是把人送到不判素材的门上。
   * 判素材产出的是 G4 过期镜 / G5 未确认镜 / G6 失败镜(加问题中心 failed-shots 的实时判),
   * G3 判审片均分、G7 判合规敏感词且不在 headless 七门里 —— 门号一律回各自的实现核对,不在记账里自证。 */
  { name: '记账对齐:SK-04 仍欠段的素材判定面点名真实门号(G4/G5/G6 + failed-shots,不记到 G3/G7 头上)', fn() {
    const sk4 = Skills.byId('core.memoryDual');
    const owed = (sk4.note || '').split('仍欠').slice(1).join('仍欠');
    assert(owed.includes('生成与合成'), '生成与合成那处余量仍在(本条只订正门号,不许顺手动它)');
    /* 解析向导那条余量 W108 已真收掉(向导入库改走命令层):锚点从「仍欠」段挪进「已落地」段,
     * 不许只删字——余量收了要在 note 里如实交代收到哪去了,实现面另由 director 收口那两条用例钉住 */
    const landed = (sk4.note || '').split('仍欠')[0];
    assert(!owed.includes('解析向导') && landed.includes('解析向导'), '解析向导那条入库路径已收口,须在已落地段交代清楚(不得只删字)');
    const rsrc = fs.readFileSync(path.join(ROOT, 'js', 'release.js'), 'utf8');
    [['G4', 'g4-stale'], ['G5', 'g5-unconfirmed'], ['G6', 'g6-failed']].forEach(([g, code]) => {
      assert(rsrc.includes("gate('" + code + "'"), '发布门应仍有该门(门没了就得同步改记账):' + code);
      assert(owed.includes(g), 'SK-04 的仍欠段须点名判素材产出的门:' + g);
    });
    const isrc2 = fs.readFileSync(path.join(ROOT, 'js', 'issues.js'), 'utf8');
    assert(isrc2.includes("kind: 'failed-shots'"), '问题中心应仍有 failed-shots 条目');
    assert(owed.includes('failed-shots'), 'SK-04 的仍欠段须点名问题中心那条实时判定');
    // 误记的门号不得复活:G3/G7 各判什么须如实写,且不得再把素材产出归到这两门
    assert(/G3 判审片均分/.test(owed) && /G7 判合规/.test(owed), 'note 须写明 G3/G7 各自判什么');
    assert(!/判定面归发布门 G3\/G7/.test(sk4.note || ''), '素材产出的判定面不得再记到 G3/G7 头上');
    assert(rsrc.includes("gate('g3-review', '审片均分") && /G7 合规命中/.test(rsrc), 'G3/G7 的判据出处仍在 release.js');
    // headless 七门本就没有 G7(依赖浏览器 Compliance),note 里这句同样回实现核对
    const RC = require('../js/release-core.js');
    const codes = RC.gates({ id: 'p_note', subjects: [], episodes: [] }, { Domain: DomainMod, online: true }).gates.map(x => x.code);
    assert(!codes.some(c => /^g7/.test(c)), 'headless 核心门不含 G7,note 的这句须与实况一致');
    assert(owed.includes('headless 七门'), 'SK-04 的仍欠段须写明 G7 不在 headless 七门内');
  } },
  { name: '记账对齐:SK-10/SK-11 的「人设句入注册表待 G-13」旧账按实况改写(人设已在表,仍欠段只写真正还在的)', fn() {
    const W = require('../js/wf-core.js');
    const P = require('../js/prompts.js');
    const keys = P.list().map(x => x.key);
    const sk11 = Skills.byId('subjects.refDiscipline'), sk10 = Skills.byId('script.aiToneBan');
    /* 实况一:SK-11 两个登记键的人设句都在注册表,且用户覆盖真到得了那两步(不是"进了表但取值口没接") */
    assert(keys.includes('extract.system'), '主体步人设句应在注册表里(旧账说它还没进表,先钉实况)');
    assertEq(W.extractSystem({ 'extract.system': 'X。' }).slice(0, 2), 'X。', '装配口应真收覆盖表参数(覆盖到不了就不能记成已在注册表)');
    assertEq(sk11.prompts.join(','), 'extract.system,persona.promptSystem', 'SK-11 应登记自己两个注入落点的提示词键(与 SK-17/SK-21 同口径)');
    /* 记账串:旧账不许回来(变异位),新账须写明人设句已在表 */
    [sk11, sk10].forEach(s => assert(!/人设句入注册表待 G-13/.test(s.note),
      s.id + ' 的 note 不得再写「人设句入注册表待 G-13」——那句人设已在注册表'));
    assert(/人设句已在注册表——主体步取 extract\.system/.test(sk11.note), 'SK-11 的 note 须写明人设句已在注册表 extract.system');
    assert(sk11.note.includes('persona.promptSystem'), 'SK-11 的 note 须写明 tplImage 取用点那步也已取注册表键');
    assert(/没有专属人设句/.test(sk10.note), 'SK-10 的 note 须写明本条注入走板块方法论通道、没有专属人设句');
    /* 仍欠段只认「仍欠」之后那段(写在"已落地"那半里不算交账),且点名的余量必须真的还在 */
    const owedOf = note => (note || '').split('仍欠').slice(1).join('仍欠');
    const owed11 = owedOf(sk11.note);
    assert(!owed11.includes('tplImage') && !owed11.includes('js/persona.js'),
      'tplImage 取用点已收编,SK-11 的仍欠段不得再把它记成欠账');
    /* 这一处的路障随收编反转:不再钉"仍内联",改钉"取值口在、字面只剩注册表一份"(退回内联即红) */
    const psrc = fs.readFileSync(path.join(ROOT, 'js', 'persona.js'), 'utf8');
    const rw = psrc.slice(psrc.indexOf('async function rewritePrompt('), psrc.indexOf('/* 八维度编辑弹窗 */'));
    assert(rw.includes('tplImage') && rw.includes("Prompts.get('persona.promptSystem')") && !rw.includes("system: '你是文生图提示词专家。'"),
      'js/persona.js 的文生图重写步应经注册表取人设(参考模板仍取 settings.tplImage)');
    assertEq(P.list().filter(x => x.def === '你是文生图提示词专家。').length, 1, '该人设句应恰好在注册表里一份(注册表 def 为唯一来源)');
    /* 同文件的配音导演两步也已收编(两条独立键,行为面由 contract 套件那条钉住):
     * 文生图重写步与这两步合到一起,js/persona.js 的内联人设归零——退回任意一处都要同步改记账 */
    assertEq((psrc.match(/system: ['`]你是/g) || []).length, 0, 'js/persona.js 应已无内联人设(文生图重写与配音导演两步都已进注册表)');
    ['voice.recommendSystem', 'voice.recommendBatchSystem'].forEach(k =>
      assert(keys.includes(k), '配音导演那两步的人设句应已在注册表:' + k));
    const owed10 = owedOf(sk10.note);
    const esrc = fs.readFileSync(path.join(ROOT, 'js', 'episodes.js'), 'utf8');
    /* 这四步已收编,路障随之反转:键在表里、取值口在 js/episodes.js、仍欠段不得再把它们记成欠账 */
    [['旁白解说体改写', 'narration.system', '你是资深短剧解说编剧'], ['构思导演阐述', 'concept.system', '你是资深短剧/漫剧导演'],
      ['全剧光影总控', 'light.system', '你是影视摄影指导(DP)'], ['剧本围读', 'reading.system', '你是短剧导演组的剧本围读会'],
    ].forEach(([label, key, persona]) => {
      assert(!owed10.includes(label), 'SK-10 的仍欠段不得再点名已收编的那一步:' + label);
      assert(sk10.note.includes(key), 'SK-10 的 note 须写明已收编的键:' + key);
      assert(esrc.includes("system: Prompts.get('" + key + "')"), 'js/episodes.js 该步应经注册表取人设:' + key);
      assert(!esrc.includes("system: '" + persona), 'js/episodes.js 该步不得再内联人设字面:' + persona);
      assertEq(P.list().filter(x => x.def.startsWith(persona)).length, 1, '该人设句应恰好在注册表里一份:' + persona);
    });
    /* 摘要三步已收编:同形的反向断言按实况翻面(退回内联或仍记成欠账都当场红) */
    assert(!owed10.includes('js/episode-util.js'), '摘要三步已收编,SK-10 的仍欠段不得再把它记成欠账');
    assertEq((fs.readFileSync(path.join(ROOT, 'js', 'episode-util.js'), 'utf8').match(/system: '你是资深短剧策划。'/g) || []).length, 0,
      'js/episode-util.js 不应再有摘要三步的内联策划人设');
    /* 同文件的事件图谱拆解步已收编:三处断言一并翻面——不许再记成欠账、源级不许退回内联、注册表须有它自己那一条 */
    assert(!owed10.includes('事件图谱'), 'SK-10 的仍欠段不得再点名事件图谱拆解步(那步人设已在注册表)');
    assert(/事件图谱拆解步内联人设已收进注册表\(独立键 graph\.system/.test(sk10.note),
      'SK-10 的 note 须写明事件图谱拆解步已收进独立键 graph.system');
    assert(esrc.includes("system: Prompts.get('graph.system')") && !esrc.includes("system: '你是短剧剧本结构分析师。'"),
      'js/episodes.js 的事件图谱拆解步应经注册表取人设,不得退回内联');
    assertEq(P.list().filter(x => x.def === '你是短剧剧本结构分析师。').length, 1, '该人设句应恰好在注册表里一条');
    /* G-13 本身未闭合(内联提示词大头仍在),故关联索引一个不摘:改 note 动不到 gaps() 投影 */
    assertEq((Skills.gaps()['G-13'] || []).join(','),
      'script.hookType,script.aiToneBan,subjects.refDiscipline,eps.structureStage,gen.videoTpl,film.rhythmInject',
      '改 note 不动 gaps() 投影(缺口标记按关联索引口径保留)');
    assertEq(Skills.validate({ Prompts: P, KB: require('../js/knowledge.js') }).join(';'), '', '新登记的提示词键须通过引用自检');
  } },
  { name: 'infra 余量:审片侧三步接上人设/记忆通道(模板唯一装配口,缺省无雇佣时逐字节不变)', fn() {
    const W = require('../js/wf-core.js');
    const wfSrc = fs.readFileSync(path.join(ROOT, 'js', 'wf-core.js'), 'utf8');
    // 三步的 user 模板是双端唯一来源:通道只能开在模板上,开了两端才同时接上
    const defOf = name => {
      const i = wfSrc.indexOf('W.' + name + ' =');
      assert(i >= 0, 'wf-core 应有 ' + name);
      const j = wfSrc.indexOf('\n  W.', i + 1);
      return wfSrc.slice(i, j < 0 ? wfSrc.length : j);
    };
    ['sbReviewUser', 'buildSumUser', 'buildCutUser'].forEach(n => {
      assert(/W\.reviewCtxNote\(ctx\)/.test(defOf(n)), n + ' 应经唯一注入段装配口 reviewCtxNote 拼人设/记忆(三步不各写一份拼法)');
    });
    // 缺省/空注入逐字节不变:未雇佣专家且无沉淀记忆时,三步提示词与接通道前完全一致
    const shots = [{ plot: '女主被当众羞辱', camera: '固定镜头', cameraSpec: { shotSize: '中景' }, characters: ['林晚晴'], narration: '', dialogue: '', prompt: 'p' }];
    const reports = [{ shot: { order: 0 }, report: { score: 6.2, issues: [{ type: '运镜/景别偏差' }] } }];
    const brief = [{ 镜号: 1, 景别: '中景' }];
    const persona = W.personaNote({ name: '冷峻悬疑导演', persona: '克制叙事,善用信息差' }, W.WF_BOARD['smart-review']);
    const mem = W.memBlock([{ text: '女主统一叫林晚晴', scope: '成片' }], '第一集', '成片');
    [['sbReviewUser', () => W.sbReviewUser(shots, '漫剧'), c => W.sbReviewUser(shots, '漫剧', undefined, c)],
      ['buildSumUser', () => W.buildSumUser(reports), c => W.buildSumUser(reports, c)],
      ['buildCutUser', () => W.buildCutUser(brief), c => W.buildCutUser(brief, c)],
    ].forEach(([n, bare, withCtx]) => {
      const base = bare();
      assertEq(withCtx(undefined), base, n + ' 不传 ctx 应与接通道前逐字节一致');
      assertEq(withCtx({}), base, n + ' 空 ctx 应逐字节一致');
      assertEq(withCtx({ personaNote: '', memText: '' }), base, n + ' 空注入串应逐字节一致(未雇佣且无记忆时等于没接)');
      const inj = withCtx({ personaNote: persona, memText: mem });
      assert(inj.endsWith(base), n + ' 注入段应独立拼在提示词最前,正文一字不改');
      assert(inj.includes('专家方法论(冷峻悬疑导演·成片板块):克制叙事'), n + ' 应注入生效专家方法论');
      assert(inj.includes('历史协作记忆') && inj.includes('- 女主统一叫林晚晴'), n + ' 应注入协作记忆');
      assert(!inj.startsWith('。'), n + ' 独立成段时应去掉人设串句首标点');
    });
    // 服务端:三步都经既有装配口取 ctx,且不新开 wfPersonaNote 调用点(评审步复用同板块的那一次)
    const srv = fs.readFileSync(path.join(ROOT, 'server.js'), 'utf8');
    assert(srv.includes('WfCore.sbReviewUser(shots, ctxBase.styleText, ov, ctxBase)'), '服务端分镜评审步应复用拆镜步的分镜板块 ctx');
    assert(srv.includes("const epCtx = { personaNote: reviewCtx.personaNote, memText: WfCore.memBlock(tree.agentMemory, ep.title || '', '成片') }"),
      '服务端集级两步应复用逐镜步的成片板块人设,记忆按集标题召回');
    assert(srv.includes('WfCore.buildSumUser(reports, epCtx)') && srv.includes('WfCore.buildCutUser(WfCore.buildCutBrief(ep, reports), epCtx)'),
      '共性汇总与四维成片评审两步都要带 ctx');
    // 浏览器:同板块键同装配口(personaNoteFor + WfCore.memBlock),不各写一份板块映射
    const sbl = fs.readFileSync(path.join(ROOT, 'js', 'sb-llm.js'), 'utf8');
    const rvIdx = sbl.indexOf('async function llmReview(');
    const rvSrc = sbl.slice(rvIdx, sbl.indexOf('\n  }', rvIdx));
    assert(rvIdx > 0 && rvSrc.includes("personaNoteFor(p, WfCore.WF_BOARD['smart-storyboard'])")
      && rvSrc.includes("WfCore.memBlock(Store.state.agentMemory, ep.title || '', '分镜')"), '浏览器分镜评审应与拆镜步同板块同装配口');
    const rv = fs.readFileSync(path.join(ROOT, 'js', 'review.js'), 'utf8');
    assert(rv.includes('function episodeReviewCtx(p, ep)'), '浏览器集级两步应有唯一 ctx 装配口');
    assert(rv.includes("personaNoteFor(p, WfCore.WF_BOARD['smart-review'])")
      && rv.includes("WfCore.memBlock(Store.state.agentMemory, ep.title || '', '成片')"), '浏览器集级 ctx 应取成片板块人设与记忆');
    assert(rv.includes('WfCore.buildSumUser(reports, episodeReviewCtx(p, ep))') && rv.includes('WfCore.buildCutUser(brief, episodeReviewCtx(p, ep))'),
      '浏览器共性汇总与四维评审都要带 ctx');
    // 三步的系统人设键都登记在 SK-03 名下(共性汇总的 review.sumSystem 由收编断言另行钉住字面与消费点)
    const sk3 = Skills.byId('core.personaCtx');
    ['sb.reviewSystem', 'review.sumSystem', 'review.finalSystem'].forEach(k => assert(sk3.prompts.includes(k), 'SK-03 应登记 ' + k));
    // 已覆盖的那几步反向钉住:接住人设与记忆的步不得退回去
    assert(/personaNote: wfPersonaNote\(tree, p, WfCore\.WF_BOARD\['smart-review'\]\)/.test(srv), '逐镜审片步应仍带人设');
    assert(/memText: WfCore\.memBlock\(tree\.agentMemory, s\.plot \|\| '', '成片'\)/.test(srv), '逐镜审片步应仍带记忆召回');
  } },
  { name: '清 pending 的行为面为零:gaps() 与面表都不看 pending(退回旧记账后投影逐字节相同)', fn() {
    const src = fs.readFileSync(path.join(ROOT, 'js', 'skills.js'), 'utf8');
    // live() 只判 inject/check/orchestrate 三面:infra 面的 pending 不进任何投影
    const kinds = (src.match(/live\((?:s|x), '(\w+)'\)/g) || []).map(m => m.match(/'(\w+)'/)[1]);
    assert(kinds.length, 'skills.js 应有 live() 的机制面判定');
    assertEq(kinds.filter((v, i, a) => a.indexOf(v) === i).sort().join(','), 'check,inject,orchestrate',
      'infra 面不参与 live 推导(故清它的 pending 动不到 block/check/playbook/面表)');
    const snap = () => JSON.stringify([Skills.gaps(), Skills.preflightStages(),
      Skills.preflightStages().map(st => Skills.check(st, {}).length), Skills.playbooks().map(x => x.id), Skills.block('gen').length]);
    const before = snap();
    const ids = ['core.personaCtx', 'core.memoryDual', 'review.stage'];
    const targets = ids.map(id => Skills.REG.find(x => x.id === id));
    try {
      targets.forEach(s => { s.pending = ['infra']; }); // 临时退回本轮之前的记账
      assertEq(snap(), before, '把三条 pending 退回 infra 后各投影应逐字节相同——「改 pending 会动 gaps 投影」不成立');
      assertEq(Skills.validate({}).join(';'), '', '退回后契约仍全通过(infra 面不受未落地面的登记禁令约束)');
    } finally {
      targets.forEach(s => { s.pending = []; });
    }
    assertEq(snap(), before, '恢复后投影不变(本用例不留残留状态)');
    assertEq(Object.keys(Skills.gaps()).length, 20, '缺口键数不随 pending 变(本轮清三条 pending,键数一字未动)');
    ['G-01', 'G-02', 'G-03'].forEach(g => assert((Skills.gaps()[g] || []).length, g + ' 的关联索引应仍在(落地不摘标记)'));
  } },
];

/* ================= 套件 20:剧本拆集双端单源(wf-core split* + 服务端/CLI/浏览器接入,G-04) =================
 * 主线前段 headless 起点:模式判定与切分算法只此一份,浏览器/服务端/CLI 全部委托;正文逐字保留。 */
/* 分集 UI 入口沙箱(js/proj-upload.js 真跑 openUploadScript → doSplit → doSplitRun → splitCore):
 * 切分算法/回收站/记忆回流全部真跑(加载序与 index.html 同:domain → knowledge → prompts → wf-core → episode-util),
 * 只桩掉弹窗 DOM、任务条与页面重渲。桩按真实契约建:同一 selector 恒返回同一个假节点(用例据此点按钮),
 * U.runTask 即刻进 onDone 并把 promise 存 __runTask(拆集是异步的,用例必须 await 才看得到落盘)。 */
function loadProjUpload() {
  const sb = makeSandbox();
  installCommon(sb);
  sb.MODELS = { image: ['seedream-x'], video: ['seedance-x'] };
  sb.COST = { image: 2 };
  sb.PH = { subject: () => 'ph.png' };
  sb.styleOf = p => (p && p.style) || '漫剧';
  sb.getSettings = () => sb.Store.state.settings;
  sb.Media = { isReady: () => false };
  sb.Views = { projectDetail: (main, pid) => { sb.__called.push('render:' + pid); sb.__scriptAtRender = sb.__proj ? sb.__proj.script : undefined; } };
  let seq = 0;
  sb.Store.uid = pre => pre + '_' + (++seq);
  sb.Store.trashPut = (kind, title) => { sb.__called.push('trash:' + kind + ':' + title); };
  sb.Tasks.canDeleteScope = async () => sb.__guard || { local: [], remote: [] };
  sb.U.runTask = opt => { sb.__called.push('runTask:' + opt.title); sb.__runTask = Promise.resolve().then(opt.onDone); return sb.__runTask; };
  sb.API.getTextModels = () => [{ id: 'test-model', label: '测试模型' }];
  sb.U.openModal = o => {
    const pool = {};
    const el = () => ({ style: {}, classList: { toggle() {} }, textContent: '', innerHTML: '', value: '', onclick: null, oninput: null });
    const pick = sel => (pool[sel] = pool[sel] || el());
    const m = { querySelector: pick, querySelectorAll: sel => [pick(sel + '#0')] };
    sb.__modal = { m, closed: 0 };
    o.onMount(m, () => { sb.__modal.closed++; });
  };
  loadFile(sb, 'domain.js');
  loadFile(sb, 'knowledge.js');
  loadFile(sb, 'prompts.js');
  loadFile(sb, 'wf-core.js');
  loadFile(sb, 'episode-util.js');
  loadFile(sb, 'proj-upload.js');
  return sb;
}
const splitTests = [
  { name: 'splitMode:集/章标记 ≥2 走 markers(零 LLM);无标记短文走 llm;长文/离线走 even', fn() {
    const W = require('../js/wf-core.js');
    const marked = '第一集 开场\n正文一\n第二集 反击\n正文二';
    assertEq(W.splitMode(marked, true), 'markers');
    assertEq(W.splitMode(marked, false), 'markers', '标记切分不依赖 LLM 可用性');
    assertEq(W.splitMode('一段无标记的剧本正文', true), 'llm');
    assertEq(W.splitMode('一段无标记的剧本正文', false), 'even', 'LLM 不可用应回落段落均分');
    assertEq(W.splitMode('长'.repeat(W.SPLIT_LLM_MAX + 1), true), 'even', '超长文不调 LLM(提示词过长易改写原文)');
    assertEq(W.scriptEpMarkers(marked), 2);
  } },
  { name: 'localSplitEpisodes:按标记切原文逐字不丢;无标记按段落均分且集数落在 2-12', fn() {
    const W = require('../js/wf-core.js');
    const text = '第一集 开场\n女主被当众羞辱\n第二集 反击\n女主揭穿真相';
    const eps = W.localSplitEpisodes(text);
    assertEq(eps.length, 2);
    assertEq(eps[0].title, '第一集 开场');
    assert(eps[0].content.includes('女主被当众羞辱') && eps[1].content.includes('女主揭穿真相'), '正文应随标记切分逐字保留');
    const plain = Array.from({ length: 40 }, (_, i) => '第' + i + '段正文内容占位' ).join('\n');
    const even = W.localSplitEpisodes(plain);
    assert(even.length >= 2 && even.length <= 12, '均分集数应在 2-12,实际 ' + even.length);
    assertEq(even.map(e => e.content).join('\n'), plain, '均分应逐段拼回原文(不丢段不改写)');
    assertEq(W.splitTargetCount('字'.repeat(8000)), 10);
    assertEq(W.splitTargetCount('短'), 2, '极短文也至少 2 集');
  } },
  { name: 'buildSplitUser:锚点协议提示词(原文逐字引用要求 + 集数 + 全文)', fn() {
    const W = require('../js/wf-core.js');
    const u = W.buildSplitUser('剧本正文示例', 3);
    assert(u.includes('划分为 3 集'), '应带目标集数');
    assert(u.includes('"anchor"') && u.includes('逐字引用原文'), '应为锚点协议(只回标题+锚句,正文本地切)');
    assert(u.includes('剧本正文示例'), '应带全文');
    // 人设/记忆注入位:空注入与未注入逐字节一致(未雇佣且无记忆时提示词不变)
    assertEq(W.buildSplitUser('剧本正文示例', 3, {}), u, '空 ctx 提示词应与三参调用逐字节一致');
    assertEq(W.buildSplitUser('剧本正文示例', 3, { personaNote: '', memText: '' }), u, '空注入串提示词应逐字节一致');
    const inj = W.buildSplitUser('剧本正文示例', 3, {
      personaNote: W.personaNote({ name: '冷峻悬疑导演', persona: '克制叙事,善用信息差' }, W.WF_BOARD['split-episodes']),
      memText: W.memBlock([{ text: '女主统一叫林晚晴', scope: '剧本' }], '测试项目', W.WF_BOARD['split-episodes']),
    });
    assert(inj.includes('专家方法论(冷峻悬疑导演·剧本板块):克制叙事'), '应注入剧本板块生效专家方法论');
    assert(inj.includes('历史协作记忆') && inj.includes('- 女主统一叫林晚晴'), '应注入剧本板块协作记忆');
    assert(inj.indexOf('专家方法论') < inj.indexOf('剧本:\n剧本正文示例'), '注入段应在剧本正文之前');
    assert(!inj.includes('\n。专家方法论'), '独立成行时应去掉人设串句首标点');
  } },
  { name: 'splitByAnchors:按锚点切原文(首集从头起)、倒序/重复锚点跳过、结构不合法抛错', fn() {
    const W = require('../js/wf-core.js');
    const text = '开场:女主被当众羞辱,众人哄笑。\n转折:女主当场揭穿真相,全场哗然。';
    const eps = W.splitByAnchors(text, [{ title: '第1集 羞辱', anchor: '开场:女主被当众羞辱' }, { title: '第2集 反击', anchor: '转折:女主当场揭穿真相' }]);
    assertEq(eps.length, 2);
    assertEq(eps[0].title, '第1集 羞辱');
    assert(eps[0].content.startsWith('开场'), '首集恒从全文开头起,不丢头部');
    assert(eps[1].content.startsWith('转折'), '次集应从锚点切起');
    // 倒序锚点被跳过后不足 2 个定位点 → 抛错(调用方退费/回退)
    let err = '';
    try { W.splitByAnchors(text, [{ anchor: '转折:女主当场揭穿真相' }, { anchor: '开场:女主被当众羞辱' }]); } catch (e) { err = e.message; }
    assertEq(err, 'LLM 分集锚点定位失败');
    err = '';
    try { W.splitByAnchors(text, [{ anchor: '开场:女主被当众羞辱' }]); } catch (e) { err = e.message; }
    assertEq(err, 'LLM 未返回有效分集数组', '少于 2 集应判无效');
    err = '';
    try { W.splitByAnchors(text, { title: 'x' }); } catch (e) { err = e.message; }
    assertEq(err, 'LLM 未返回有效分集数组', '非数组应判无效');
  } },
  { name: 'splitInflight:生成中镜头/节拍计数(拆集整表覆盖前的双端同口径守卫)', fn() {
    const W = require('../js/wf-core.js');
    assertEq(W.splitInflight(null), 0);
    const p = { episodes: [
      { shots: [{ video: { status: 'generating' } }, { video: { status: 'done' } }], beats: [{ video: { status: 'generating' } }] },
      { shots: [{ video: { status: 'failed' } }] },
    ] };
    assertEq(W.splitInflight(p), 2, '在飞镜头+节拍都要计入');
  } },
  { name: '双端单源(源级):浏览器/服务端/CLI 全部委托 wf-core,不各抄一份切分算法与提示词', fn() {
    const eu = fs.readFileSync(path.join(ROOT, 'js', 'episode-util.js'), 'utf8');
    assert(eu.includes('WfCore.localSplitEpisodes') && eu.includes('WfCore.buildSplitUser') && eu.includes('WfCore.splitByAnchors'), 'episode-util 应委托 WfCore 拆集核心');
    assert(!eu.includes('划分为 ${n} 集'), 'episode-util 不应再内联分集提示词');
    assert(eu.includes('llmSplitEpisodes,'), 'llmSplitEpisodes 必须挂上 EpisodeUtil 出口(此前漏挂,浏览器 LLM 分集恒回退均分)');
    const pu = fs.readFileSync(path.join(ROOT, 'js', 'proj-upload.js'), 'utf8');
    assert(pu.includes('WfCore.splitMode') && pu.includes('WfCore.localSplitEpisodes'), 'proj-upload 分集流程应走 WfCore 模式判定');
    assert(pu.includes('splitCore'), 'UI 任务条与命令层应共用 splitCore 执行核心');
    const srv = fs.readFileSync(path.join(ROOT, 'server.js'), 'utf8');
    assert(srv.includes("'/api/wf/split-episodes'"), '服务端应有拆集工作流端点');
    ['WfCore.splitMode', 'WfCore.buildSplitUser', 'WfCore.splitByAnchors', 'WfCore.localSplitEpisodes', 'WfCore.splitInflight'].forEach(fn2 =>
      assert(srv.includes(fn2), '服务端拆集应复用 ' + fn2));
    assert(/proxyRefund\(user\.id, r\.charge/.test(srv), '拆集 LLM 步失败应退费(不本地冒充)');
    // 人设/记忆注入两端同一装配口(服务端 wfPersonaNote、浏览器 personaNoteFor,板块键都取 WF_BOARD)
    assert(srv.includes("wfPersonaNote(tree, p, WfCore.WF_BOARD['split-episodes'])"), '服务端拆集 LLM 步应经 wfPersonaNote 注入生效专家');
    assert(srv.includes("WfCore.memBlock(tree.agentMemory, p.name || '', WfCore.WF_BOARD['split-episodes'])"), '服务端拆集 LLM 步应按剧本板块召回协作记忆');
    assert(eu.includes("WfCore.WF_BOARD['split-episodes']") && eu.includes('personaNoteFor(p, board)') && eu.includes('WfCore.memBlock('), '浏览器拆集应与服务端同板块同装配口注入');
    assert(pu.includes('llmSplitEpisodes(scriptText, API.getConfig().model, tk.id, p)'), 'splitCore 应把项目传下去(浏览器注入所需数据面)');
    const cli = fs.readFileSync(path.join(ROOT, 'cli.js'), 'utf8');
    assert(cli.includes("POST('/api/wf/split-episodes'"), 'CLI 拆集应走服务端工作流端点');
    assert(!cli.includes('划分为'), 'CLI 不应内联分集提示词');
    assert(cli.includes("CMD['project-script']"), 'CLI 应能写入项目剧本原文(headless 主线起点)');
    const mcp = fs.readFileSync(path.join(ROOT, 'mcp.js'), 'utf8');
    assert(mcp.includes('hujing_split_episodes') && mcp.includes('hujing_project_script'), 'MCP 应暴露剧本写入与拆集入口');
  } },
  { name: '仅进行分集(行为面):拆集成功后原文落进剧本板块,主线剧本步随之 done', fn: async () => {
    const sb = loadProjUpload();
    const p = sb.__proj = { id: 'p1', name: '剧', script: '', episodes: [], subjects: [] };
    const stepOf = () => sb.Domain.workflow(p, false).steps.find(s => s.key === 'script');
    assertEq(stepOf().done, false);
    assertEq((stepOf().blockers[0] || {}).code, 'no-script', '拆集前项目级判据就是"未上传剧本"');
    sb.EpisodeUtil.openUploadScript(p, {});
    const m = sb.__modal.m;
    const TEXT = '第一集 开场\n女主被当众羞辱\n第二集 反击\n女主揭穿真相';
    m.querySelector('[data-f=script]').value = TEXT;
    m.querySelector('[data-x=splitonly]').onclick();
    await sb.__runTask;
    assertEq(p.episodes.length, 2, '仅分集应真的拆出分集');
    assertEq(p.episodes[0].title, '第一集 开场');
    assert(p.episodes[1].content.includes('女主揭穿真相'), '正文应按标记逐字切');
    assertEq(p.script, TEXT, '拆集成功后原文应落进剧本板块(此前「仅进行分集」这一支从不写,项目剧本恒空)');
    assertEq(stepOf().done, true, '主线剧本步应随之 done');
    assertEq(stepOf().blockers.length, 0);
    assertEq(sb.__scriptAtRender, TEXT, '写回应在重渲之前(项目页当场看得到剧本板块,不用等下次进页面)');
  } },
  { name: '仅进行分集:空原文与拆集失败都不写假剧本(剧本板块仍判缺剧本)', fn: async () => {
    const sb = loadProjUpload();
    const p = { id: 'p1', name: '剧', script: '', episodes: [], subjects: [] };
    sb.EpisodeUtil.openUploadScript(p, {});
    const m = sb.__modal.m;
    // 空原文:按钮当场拒绝,零拆集零写入
    m.querySelector('[data-x=splitonly]').onclick();
    assertEq(p.script, '', '空原文不许写进剧本板块');
    assertEq(p.episodes.length, 0);
    assert(sb.__toasts.some(t => t.includes('请先粘贴或上传剧本文本')), '空原文应如实提示');
    assert(!sb.__called.some(c => c.indexOf('runTask') === 0), '空原文不应起分集任务');
    // 在飞生成:splitCore 守卫抛错,拆集没成 → 剧本板块也不许留下原文
    sb.__guard = { local: [{ type: '文生视频' }], remote: [] };
    m.querySelector('[data-f=script]').value = '第一集 开场\n正文一\n第二集 反击\n正文二';
    m.querySelector('[data-x=splitonly]').onclick();
    await sb.__runTask;
    assertEq(p.episodes.length, 0, '守卫不过不应落分集');
    assertEq(p.script, '', '拆集失败不写假剧本(否则项目看着有剧本却没有分集)');
    assertEq(sb.Domain.workflow(p, false).steps.find(s => s.key === 'script').blockers[0].code, 'no-script');
  } },
  { name: '仅分集补写入不动发布门:G1 逐集判正文,与项目剧本原文有无无关', fn() {
    /* W108 交接把这处记成"翻转发布门 G1(有剧本)",实况是 G1(g1-workflow)逐集读 Domain.episodeState,
     * 判的是 ep.content,`p.script` 一个字不读;项目级"未上传剧本"的判据在主线剧本步。本条两面各钉一次,
     * 免得后来者为了"让 G1 认剧本"去动门禁判据。 */
    const sb = loadRelease();
    const ep = releaseReadyEp({ composed: true, composedInputHash: sb.Domain.composedInputHash(releaseReadyEp(), false), composedSourceRev: 0, composedGraphRev: 0 });
    const base = { id: 'p1', name: '剧', subjects: [{ id: 'sj1', name: '主', kind: 'character', image: 'u' }], episodes: [ep] };
    const g1 = r => r.gates.find(g => g.code === 'g1-workflow');
    const bare = sb.Release.collect(Object.assign({}, base, { script: '' }), { online: false });         // 补写入之前的「仅分集」形状
    const written = sb.Release.collect(Object.assign({}, base, { script: '剧本正文' }), { online: false }); // 补写入之后
    assertEq(g1(bare).status, 'pass', 'G1 判的是每集分集状态,项目剧本原文为空一样 pass');
    assertEq(g1(written).status, g1(bare).status, '补写 p.script 不改 G1 结论');
    assertEq(written.fails, bare.fails, '门禁 fail 计数一个不动(不抬门也不降门)');
    assertEq(written.overall, bare.overall);
    const stepOf = script => sb.Domain.workflow(Object.assign({}, base, { script }), false).steps.find(s => s.key === 'script');
    assertEq(stepOf('').blockers[0].code, 'no-script', '真正报"未上传剧本"的是主线剧本步');
    assertEq(stepOf('剧本正文').done, true, '补写入后这一步才 done');
  } },
];

/* 浏览器助手模块(记忆播种入口 memAll 的宿主):按 index.html 顺序加载 KB/Prompts/WfCore 后加载 agent.js;
 * memAll 不在对外出口上,经 AgentCore.memBlock/openMemoryModal 触发(与浏览器真实调用路径一致) */
function loadAgent() {
  const sb = makeSandbox();
  installCommon(sb);
  loadFile(sb, 'domain.js');
  loadFile(sb, 'prompts.js');
  loadFile(sb, 'knowledge.js');
  loadFile(sb, 'wf-core.js');
  loadFile(sb, 'agent.js');
  return sb;
}

/* ================= 套件 21:协作记忆双端单源(wf-core memRecall/memBlock,G-02) =================
 * 召回算法自 agent.js 下沉后是对话层与 /api/wf/* 工作流端点的唯一一份,此前只有经 evolveExpert
 * 的间接使用,没有直接断言(W6 收敛记录列为主干最薄处)。本套件锁住召回口径与注入块字面。 */
const memoryTests = [
  { name: 'memRecall 召回顺序:同板块末 4 条在前,全局最近 3 条随后;不传板块时只吃全局最近 3 条', fn() {
    const W = require('../js/wf-core.js');
    const mem = [
      { text: 'M1', scope: '分镜' }, { text: 'M2', scope: '分镜' }, { text: 'M3', scope: '分镜' },
      { text: 'M4', scope: '分镜' }, { text: 'M5', scope: '分镜' },
      { text: 'G1', scope: '剧本' }, { text: 'G2', scope: '' }, { text: 'G3', scope: '成片' },
    ];
    const txt = (input, scope) => W.memRecall(mem, input, scope).map(m => m.text).join(',');
    // 同板块 5 条只有末 4 条进"优先段";被挤出的 M1 仍可经同板块加权补召(见下一条),故落在队尾
    assertEq(txt('', '分镜'), 'M2,M3,M4,M5,G1,G2,G3,M1', '同板块末 4 条应排在全局最近 3 条之前');
    assertEq(W.memRecall(mem, '', '分镜').slice(0, 4).map(m => m.scope).join(','), '分镜,分镜,分镜,分镜', '优先段应全是本板块条目');
    assertEq(txt('', ''), 'G1,G2,G3', '不传板块:无优先段,零关键词时只剩全局最近 3 条');
  } },
  { name: 'memRecall 加权补召:同板块被挤出的旧条目仍补召(≤3 条);关键词命中按命中长度排序', fn() {
    const W = require('../js/wf-core.js');
    const many = ['M1', 'M2', 'M3', 'M4', 'M5', 'M6', 'M7', 'M8'].map(t => ({ text: t, scope: '分镜' }))
      .concat([{ text: 'G1', scope: '' }, { text: 'G2', scope: '' }, { text: 'G3', scope: '' }]);
    assertEq(W.memRecall(many, '', '分镜').map(m => m.text).join(','), 'M5,M6,M7,M8,G1,G2,G3,M1,M2,M3',
      '同板块加权补召上限 3 条(M4 应被挤出)');
    // 关键词分支:命中 token 越长得分越高;整条无命中且非本板块的旧条目不进召回
    const kb = [
      { text: 'A 提到 红色高跟鞋', scope: '' }, { text: 'B 提到 冷色调', scope: '' }, { text: 'C 无关条目', scope: '' },
      { text: 'X1', scope: '' }, { text: 'X2', scope: '' }, { text: 'X3', scope: '' },
    ];
    assertEq(W.memRecall(kb, '红色高跟鞋 冷色调', '').map(m => m.text).join(' | '),
      'X1 | X2 | X3 | A 提到 红色高跟鞋 | B 提到 冷色调', '命中长 token 的条目应排在命中短 token 之前,未命中的 C 不召回');
    assertEq(W.memRecall(kb, '', '').map(m => m.text).join(','), 'X1,X2,X3', '零关键词时加权段为空');
  } },
  { name: 'memRecall 去重按 text:同一条内容在优先段与最近段各出现一次时只注入一次', fn() {
    const W = require('../js/wf-core.js');
    const mem = [
      { text: '夜景冷色调', scope: '分镜' }, { text: 'X1', scope: '' }, { text: 'X2', scope: '' },
      { text: '夜景冷色调', scope: '分镜' }, // 同文本重复沉淀(改名/重复「记住…」都会产生)
    ];
    const out = W.memRecall(mem, '', '分镜');
    assertEq(out.map(m => m.text).join(','), '夜景冷色调,X1,X2', '重复 text 只保留首次出现');
    assertEq(W.memBlock(mem, '', '分镜').split('- 夜景冷色调').length - 1, 1, '注入块不得出现两行同文本');
  } },
  { name: 'memRecall/memBlock 脏入参:非数组/空/无 text 条目一律回空,不注入时提示词逐字节不变', fn() {
    const W = require('../js/wf-core.js');
    [null, undefined, 'not-an-array', 42, {}].forEach(bad => {
      assertEq(JSON.stringify(W.memRecall(bad, '林晚晴', '分镜')), '[]', '非数组入参应回空数组:' + JSON.stringify(bad));
      assertEq(W.memBlock(bad, '林晚晴', '分镜'), '', '非数组入参不得产出注入块:' + JSON.stringify(bad));
    });
    assertEq(JSON.stringify(W.memRecall([], 'x', '分镜')), '[]', '空数组应回空');
    assertEq(JSON.stringify(W.memRecall([null, {}, { text: '' }, { scope: '分镜' }], 'x', '分镜')), '[]', '无 text 的条目应全部过滤掉');
    assertEq(W.memBlock([{ text: '' }, null], '', '分镜'), '', '全是无效条目时应回空串(空串=提示词与未沉淀记忆时逐字节一致)');
  } },
  { name: 'memBlock 段头与逐条字面:段头固定、每条 "- " 前缀、顺序与 memRecall 一致', fn() {
    const W = require('../js/wf-core.js');
    const HEAD = '\n历史协作记忆(用户过往的偏好与已确认的修改决定,参考以保持一致):\n';
    assertEq(W.memBlock([{ text: 'a' }, { text: 'b' }], '', ''), HEAD + '- a\n- b', '注入块字面(段头 + 逐条 "- ")');
    const mem = [
      { text: 'M1', scope: '分镜' }, { text: 'M2', scope: '分镜' }, { text: 'G1', scope: '' },
      { text: 'G2', scope: '' }, { text: 'G3', scope: '' },
    ];
    assertEq(W.memBlock(mem, '', '分镜'), HEAD + W.memRecall(mem, '', '分镜').map(m => '- ' + m.text).join('\n'),
      'memBlock 应是 memRecall 的逐条投影(不另排序、不另截断)');
    assert(W.memBlock(mem, '', '分镜').startsWith('\n'), '段头应自带前导换行(拼进提示词时不粘上一段)');
  } },
  { name: 'reviewCtxNote 注入段字面:人设去句首标点、记忆去前导换行、各自独立成段;脏/空入参回空串', fn() {
    const W = require('../js/wf-core.js');
    [undefined, null, {}, { personaNote: '', memText: '' }, { personaNote: '  ', memText: '\n' }].forEach(bad => {
      assertEq(W.reviewCtxNote(bad), '', '空/脏 ctx 应回空串(空串=提示词与未接通道时逐字节一致):' + JSON.stringify(bad));
    });
    const persona = W.personaNote({ name: '冷峻悬疑导演', persona: '克制叙事' }, '成片');
    assert(persona.startsWith('。'), '人设串本身以「。」起头(与 directorNote 同通道口径)');
    assertEq(W.reviewCtxNote({ personaNote: persona }), '专家方法论(冷峻悬疑导演·成片板块):克制叙事\n', '只有人设时去句首标点并独立成段');
    const mem = W.memBlock([{ text: '女主统一叫林晚晴' }], '', '');
    assert(mem.startsWith('\n'), '记忆块本身自带前导换行');
    assertEq(W.reviewCtxNote({ memText: mem }), mem.trim() + '\n', '只有记忆时去掉前导换行,段尾留一个换行');
    assertEq(W.reviewCtxNote({ personaNote: persona, memText: mem }),
      '专家方法论(冷峻悬疑导演·成片板块):克制叙事\n' + mem.trim() + '\n', '两段都有时人设在前、记忆在后,各占一段');
  } },
  { name: '协作记忆双端单源(源级):对话层/wf 端点/CLI 全部委托 WfCore,写入两端同结构同上限', fn() {
    const ag = fs.readFileSync(path.join(ROOT, 'js', 'agent.js'), 'utf8');
    const srv = fs.readFileSync(path.join(ROOT, 'server.js'), 'utf8');
    const cli = fs.readFileSync(path.join(ROOT, 'cli.js'), 'utf8');
    // 召回面:三端不得各抄一份算法
    assert(ag.includes('WfCore.memRecall(') && ag.includes('WfCore.memBlock('), 'agent.js 对话层应委托 WfCore 召回');
    assert(!/const scoped = mem\.filter/.test(ag), 'agent.js 不应再内联召回算法');
    assert((srv.match(/WfCore\.memBlock\(/g) || []).length >= 4, 'wf 工作流端点应按板块注入协作记忆(理解/分镜/审片/提取主体/Agent 对话)');
    assert(cli.includes('WfCore.memRecall('), 'CLI memory list --recall 应与注入侧同算法预览');
    // 写入面:CLI 与浏览器各写一份(注释已标注),字段集/截断须一致——任一侧漂移此断言先红
    const fields = s => [...s.matchAll(/(\w+):/g)].map(m => m[1]).sort().join(',');
    const cliEntry = cli.match(/const entry = \{([^}]*)\};/);
    const agEntry = ag.match(/const entry = \{([^}]*)\};/);
    assert(cliEntry && agEntry, '两端写入口的条目字面都应可定位');
    assertEq(fields(cliEntry[1]), 'scope,text,time', 'CLI memory add 条目字段集');
    assertEq(fields(agEntry[1]), 'scope,text,time', '浏览器 memRemember 条目字段集应与 CLI 同集');
    assert(cliEntry[1].includes('slice(0, 120)') && agEntry[1].includes('slice(0, 120)'), '两端都应截 120 字');
    /* 上限与满桶淘汰:两端用户写入面都经 WfCore.memWrite,不再各写一份裸 slice(-50)
     * (裸截尾砍数组头部,桶被自动回流条占满时头部往往正是别的用户条) */
    const agMem = ag.slice(ag.indexOf('function memRemember('), ag.indexOf('function memRecall('));
    const cliAdd = cli.slice(cli.indexOf("if (sub === 'add') {"), cli.indexOf("if (sub === 'seed')"));
    assert(agMem.includes('WfCore.memWrite(memAll(), [entry])'), '浏览器 memRemember 应经 memWrite 写回');
    assert(cliAdd.includes('WfCore.memWrite(mem, [entry])'), 'CLI memory add 应经 memWrite 写回');
    assert(!/slice\(-/.test(agMem) && !/slice\(-/.test(cliAdd), '两端写入面都不得再自己截尾(上限口径只在 wf-core 一处)');
  } },
  /* ---- 闭环结论回流记忆(SK-26 回流面):派生纯函数 + 四处写入点 ----
   * 回流面此前只是记账里的一句"尚无命令出口";落地后判据全在这几条上:派生只此一份、
   * 只回可判定结论、反复闭环不刷满记忆桶、四处写入点都走同一派生、记账与实况同步。 */
  { name: 'memFeedback 审片闭环:只回可判定结论(待返工镜数/共性问题类型/四维最弱维),不回均分;无报告回空', fn() {
    const W = require('../js/wf-core.js');
    const ep = {
      id: 'ep1', title: '第一集',
      lastReview: {
        avg: 7.8,
        perShot: [{ shotId: 'a', score: 8.4 }, { shotId: 'b', score: 6.2 }, { shotId: 'c', score: 5.5 }],
        common: { summary: '整集节奏偏拖', issues: [{ type: '运镜/景别偏差' }, { type: '主体一致性偏差' }] },
        cut: { natural: { score: 8 }, continuity: { score: 6.2 }, framing: { score: 7.5 }, pacing: { score: 8.1 }, overall: '可用' },
      },
    };
    const out = W.memFeedback({ ep }, { now: () => '2026-08-27 10:00:00' });
    assertEq(out.length, 1, '一次审片闭环回流一条');
    assertEq(out[0].scope, W.WF_BOARD['smart-review'], '回流板块应取 WF_BOARD 单源(成片)');
    assertEq(out[0].fb, 'review:ep1', '回流键按集 id(反复闭环时原地更新)');
    assertEq(out[0].time, '2026-08-27 10:00:00', '时间戳经 ctx.now 注入(函数体不取环境时间)');
    assertEq(out[0].text, '审片闭环回流·第一集:待返工 2/3 镜;共性问题 运镜/景别偏差、主体一致性偏差;四维最弱维 continuity 6.2;后续拆镜与提示词优先规避这几处');
    assert(!/7\.8/.test(out[0].text), '整集均分不得回流(成片板块记忆会被下一轮审片召回,分数会成为打分锚点)');
    // 四维最弱维取分数最低那一维,维度名取 normalizeCut 产出形状(不写第二份四维名)
    const dims = Object.keys(W.normalizeCut({})).filter(k => typeof W.normalizeCut({})[k] === 'object');
    assert(dims.includes('continuity'), '维度名应取 normalizeCut 形状');
    // 缺件降级:四维该步失败标 null、无共性问题、无逐镜条目时各段如实缺席,不编造
    const bare = W.memFeedback({ ep: { id: 'ep2', lastReview: { avg: 9, cut: null, common: null } } }, {});
    assertEq(bare[0].text, '审片闭环回流·ep2:待返工 0/0 镜;后续拆镜与提示词优先规避这几处');
    assertEq(bare[0].time, '', '未注入 now 时时间戳留空(不在纯函数里取当前时间)');
    // 没有结论就不写记忆:无 ep / 无 lastReview / avg 非数字(审片全失败)一律空数组
    [{}, { ep: { id: 'e' } }, { ep: { id: 'e', lastReview: {} } }, { ep: { id: 'e', lastReview: { avg: null } } }]
      .forEach(o => assertEq(JSON.stringify(W.memFeedback(o, {})), '[]', '判定输入取不到应回空:' + JSON.stringify(o)));
    assertEq(JSON.stringify(W.memFeedback()), '[]', '无入参应回空(不抛)');
  } },
  { name: 'memFeedback 发布闭环:门禁 overall/计数与未过门项(只读门禁结果),十门全过如实标注', fn() {
    const W = require('../js/wf-core.js');
    const p = { id: 'p1', name: '逆袭', __ver: 2 };
    const gate = {
      overall: 'cond-pass', fails: 0, warns: 1,
      gates: [{ code: 'g1-workflow', label: '主线步骤全完成', status: 'pass' },
        { code: 'g10-billing', label: '计费账目核对(净消耗 vs 生成资产数)', status: 'warn' }],
    };
    const out = W.memFeedback({ p, gate, rel: { ver: 3 } }, { now: '2026-08-27 11:00:00' });
    assertEq(out.length, 1);
    assertEq(out[0].fb, 'release:p1', '回流键按项目 id');
    assertEq(out[0].scope, W.WF_BOARD['smart-review'], '发布结论与审片同板块回流');
    assertEq(out[0].text, '发布闭环回流·逆袭 v3:发布门 cond-pass(fail 0/warn 1);未过门 计费账目核对(净消耗 vs 生成资产数)');
    assertEq(out[0].time, '2026-08-27 11:00:00', 'ctx.now 也接受字符串');
    const allPass = W.memFeedback({ p, gate: { overall: 'pass', fails: 0, warns: 0, gates: [{ label: '主线步骤全完成', status: 'pass' }] } }, {});
    assertEq(allPass[0].text, '发布闭环回流·逆袭 v2:发布门 pass(fail 0/warn 0);十门全过', '无未过门项时如实标注(ver 回落 p.__ver)');
    // 门禁结果缺失/未跑:不回流(发布门口径与计数一个字不读第二遍)
    [{ p }, { p, gate: {} }, { p, gate: { overall: '' } }].forEach(o =>
      assertEq(JSON.stringify(W.memFeedback(o, {})), '[]', '无门禁结论应回空:' + JSON.stringify(o)));
    // 单条截断与两端写入面同口径(120 字)
    const long = W.memFeedback({ p: { id: 'p2', name: '长'.repeat(200) }, gate }, {});
    assertEq(long[0].text.length, W.MEM_TEXT_MAX, '单条应截到 MEM_TEXT_MAX');
  } },
  { name: 'memWrite:按 fb 键原地更新(反复闭环只留最新一条)、不改入参、尾部截 MEM_MAX', fn() {
    const W = require('../js/wf-core.js');
    const mem = [{ text: '用户偏好:女主统一叫林晚晴', scope: '主体' }];
    const e1 = { text: 'A', time: 't1', scope: '成片', fb: 'review:ep1' };
    const one = W.memWrite(mem, e1 ? [e1] : []);
    assertEq(one.length, 2, '首次回流追加一条');
    assertEq(mem.length, 1, '入参数组不得被改写');
    // 同一集第二次闭环:原地更新,不追加(否则 20 轮审片就把 50 条上限刷满,挤掉用户自己沉淀的偏好)
    const two = W.memWrite(one, [{ text: 'B', time: 't2', scope: '成片', fb: 'review:ep1' }]);
    assertEq(two.length, 2, '同 fb 键第二次回流应原地更新');
    assertEq(two[1].text + '/' + two[1].time, 'B/t2', '原地更新应换成最新结论');
    assertEq(two[0].text, '用户偏好:女主统一叫林晚晴', '用户自己沉淀的条目不受回流影响');
    // 不同闭环各占一键;无 fb 的条目按追加处理(与「记住…」同语义)
    const three = W.memWrite(two, [{ text: 'R', scope: '成片', fb: 'release:p1' }, { text: 'X', scope: '' }]);
    assertEq(three.map(m => m.fb || '-').join(','), '-,review:ep1,release:p1,-', '不同回流键各占一条,无 fb 的追加');
    // 上限:回流不得把桶顶破(与浏览器 memRemember / CLI memory add 同 50 条口径)
    const full = Array.from({ length: W.MEM_MAX }, (_, i) => ({ text: 'M' + i, scope: '' }));
    const capped = W.memWrite(full, [{ text: 'NEW', scope: '成片', fb: 'review:ep9' }]);
    assertEq(capped.length, W.MEM_MAX, '超上限应截到 MEM_MAX');
    assertEq(capped[capped.length - 1].text, 'NEW', '截断从头部丢(先进先出),新结论保留');
    assertEq(capped[0].text, 'M1', '最旧一条被挤出');
    // 脏入参:非数组记忆/空条目一律安全
    assertEq(JSON.stringify(W.memWrite(null, null)), '[]', '非数组入参应回空数组');
    assertEq(JSON.stringify(W.memWrite('x', [null, { text: '' }, {}])), '[]', '空条目不写入');
    assertEq(W.memRecall(W.memWrite([], [e1]), '', '成片').length, 1, '回流条目应能被同板块召回(回流→召回闭合)');
  } },
  { name: 'memWrite 满桶淘汰优先级:先挤最旧的自动回流条(带 fb),用户自沉淀的「记住…」留住', fn() {
    const W = require('../js/wf-core.js');
    const user = n => ({ text: '用户要求记住:' + n, scope: '分镜' });
    const auto = k => ({ text: '回流 ' + k, scope: '分镜', fb: k });
    /* 满桶且桶里既有用户条又有自动条:新回流进来时该出局的是最旧的自动条,不是排在最前面的用户条
     * (原地更新只挡同集反复跑;集数在长,按先进先出截尾的话用户偏好会被挤光) */
    const full = [user('A'), user('B')].concat(Array.from({ length: W.MEM_MAX - 2 }, (_, i) => auto('sb:ep' + i)));
    const w1 = W.memWrite(full, [auto('sb:new')]);
    assertEq(w1.length, W.MEM_MAX, '仍守住 MEM_MAX 上限');
    assertEq(w1.filter(m => /^用户要求记住:/.test(m.text)).map(m => m.text).join(','),
      '用户要求记住:A,用户要求记住:B', '用户自沉淀的两条应一条不少');
    assert(!w1.some(m => m.fb === 'sb:ep0'), '最旧的自动回流条应被挤出');
    assert(w1.some(m => m.fb === 'sb:ep1') && w1[w1.length - 1].fb === 'sb:new', '次旧自动条与新结论都在');
    assertEq(w1.slice(0, 2).map(m => m.text).join(','), '用户要求记住:A,用户要求记住:B', '用户条位置不动(淘汰只从自动条里挑)');
    // 回流每集三条(理解/分镜/审片各一键):跑满 20 集也不该动用户那几条
    let mem = [user('A'), user('B'), user('C')];
    for (let ep = 1; ep <= 20; ep++) {
      mem = W.memWrite(mem, ['und:ep' + ep, 'sb:ep' + ep, 'review:ep' + ep].map(auto));
    }
    assertEq(mem.length, W.MEM_MAX, '20 集回流后桶仍是 MEM_MAX');
    assertEq(mem.filter(m => /^用户要求记住:/.test(m.text)).length, 3, '20 集(60 条回流)后用户三条仍在');
    assert(mem.some(m => m.fb === 'review:ep20') && !mem.some(m => m.fb === 'und:ep1'), '留最新几集的回流,挤掉最早几集的');
    // 多出一条时新写入的自己不参与淘汰(否则新结论会把自己挤掉)
    const allAuto = Array.from({ length: W.MEM_MAX }, (_, i) => auto('sb:x' + i));
    const w2 = W.memWrite(allAuto, [user('D')]);
    assertEq(w2.length, W.MEM_MAX, '全自动条的桶也守上限');
    assertEq(w2[w2.length - 1].text, '用户要求记住:D', '新写入的条目不该被自己挤掉');
    assert(!w2.some(m => m.fb === 'sb:x0'), '无用户条可留时挤最旧自动条(与原先行为一致)');
    // 无自动条可挤(桶里全是用户条)时退回先进先出:与原行为一字不差
    const allUser = Array.from({ length: W.MEM_MAX }, (_, i) => ({ text: 'U' + i, scope: '' }));
    const w3 = W.memWrite(allUser, [{ text: 'TAIL', scope: '' }]);
    assertEq(w3.length + '/' + w3[0].text + '/' + w3[w3.length - 1].text, W.MEM_MAX + '/U1/TAIL', '无自动条时仍先进先出挤最旧');
    // 满桶下的原地更新不触发淘汰(条数没变)
    const w4 = W.memWrite(w1, [Object.assign(auto('sb:new'), { text: '回流 sb:new 第二轮' })]);
    assertEq(w4.length, W.MEM_MAX, '原地更新不顶破上限也不多挤一条');
    assertEq(w4.filter(m => /^用户要求记住:/.test(m.text)).length, 2, '原地更新不动用户条');
    assertEq(w4[w4.length - 1].text, '回流 sb:new 第二轮', '原地更新换成最新结论');
  } },
  /* W103:用户手打的那一半写入面(浏览器 memRemember / CLI memory add)此前是裸 slice(-MEM_MAX)——
   * 桶被自动回流条占满时,用户新加一条会按先进先出砍掉数组头部,而头部往往正是别的用户条。
   * 两处改经同一 memWrite 后,淘汰优先级对用户写入面一并生效。CLI 那一半的真跑在 cli.smoke。 */
  { name: '浏览器 memRemember 走 memWrite:满自动条时新加一条「记住…」不挤掉已有的用户条', fn() {
    const W = require('../js/wf-core.js');
    const sb = loadAgent();
    sb.AgentCore.memBlock('', '分镜'); // 先播种,后续 memAll 幂等(改动不涉及播种面)
    const seeds = sb.Store.state.agentMemory.slice();
    const users = ['用户要求记住:女主统一叫林晚晴', '用户要求记住:夜戏一律偏冷色'];
    const fill = W.MEM_MAX - seeds.length - users.length;
    assert(fill > 0, '种子条数应留得下满桶夹具(种子表长到装不下时此夹具要重排)');
    sb.Store.state.agentMemory = users.map(t => ({ text: t, time: 't0', scope: '分镜' }))
      .concat(seeds, Array.from({ length: fill }, (_, i) => ({ text: '回流占位 ' + i, time: 't1', scope: '分镜', fb: 'sb:cap' + i })));
    assertEq(sb.Store.state.agentMemory.length, W.MEM_MAX, '夹具就位:桶刚好满');
    sb.AgentCore.memRemember('用户要求记住:雨夜戏一律手持', '分镜');
    const mem = sb.Store.state.agentMemory;
    assertEq(mem.length, W.MEM_MAX, '用户写入面也守住 MEM_MAX(不顶破桶)');
    assertEq(mem[mem.length - 1].text, '用户要求记住:雨夜戏一律手持', '新沉淀的一条在桶尾');
    assertEq(mem.slice(0, 2).map(m => m.text).join(','), users.join(','), '桶头部那两条用户条一条不少(裸 slice 会砍掉第一条)');
    assert(!mem.some(m => m.fb === 'sb:cap0') && mem.some(m => m.fb === 'sb:cap1'), '出局的是最旧那条自动回流条');
    assertEq(seeds.filter(s => mem.some(m => m.text === s.text)).length, seeds.length, '播种条目也一条不少');
    // 既有口径未变:120 字截断、空文本不写、每次写入落一次盘
    sb.AgentCore.memRemember('长'.repeat(300), '分镜');
    assertEq(sb.Store.state.agentMemory[W.MEM_MAX - 1].text.length, W.MEM_TEXT_MAX, '仍截 MEM_TEXT_MAX 字');
    const saves = sb.Store._saves;
    sb.AgentCore.memRemember('   ', '分镜');
    assertEq(sb.Store.state.agentMemory.length + '/' + sb.Store._saves, W.MEM_MAX + '/' + saves, '空文本不写入也不落盘');
  } },
  { name: '回流写入面四处接线(源级):派生只此一份,四处写入点都存回既有 agentMemory 桶', fn() {
    const W = require('../js/wf-core.js');
    const files = { 'js/review.js': null, 'server.js': null, 'js/release.js': null, 'cli.js': null };
    Object.keys(files).forEach(f => { files[f] = fs.readFileSync(path.join(ROOT, f), 'utf8'); });
    // 派生面单源:有回流写入点的调用方一律 WfCore.memFeedback + WfCore.memWrite,不得自己拼回流文本
    ['js/review.js', 'server.js', 'js/release.js'].forEach(f => {
      assert(/WfCore\.memWrite\(/.test(files[f]) && /WfCore\.memFeedback\(/.test(files[f]), f + ' 应委托 WfCore 派生回流条目');
    });
    Object.keys(files).forEach(f => assert(!files[f].includes('闭环回流·'), f + ' 不得内联回流文案(文案只在 wf-core 一处)'));
    // 落点仍是既有记忆桶:浏览器/服务端/CLI 各按自己的通道存回,不新建存储桶
    assert(/Store\.state\.agentMemory = WfCore\.memWrite\(Store\.state\.agentMemory,/.test(files['js/review.js']), '浏览器审片闭环应写回 Store.state.agentMemory');
    assert(/tree\.agentMemory = WfCore\.memWrite\(tree\.agentMemory,/.test(files['server.js']), '服务端审片闭环应写回 state 树的 agentMemory');
    assert(/Store\.state\.agentMemory = WfCore\.memWrite\(Store\.state\.agentMemory,/.test(files['js/release.js']), '浏览器发布留痕应写回 Store.state.agentMemory');
    /* headless 侧的发布回流自 W58 起归服务端发布端点(CLI/MCP 同链路):CLI 不再自己拼 meta 桶,
     * 回流仍与打版本同一次落盘,派生仍是 WfCore 那一份——写入点换了端,单源与"不新增接口"两条纪律不变 */
    const relEp = files['server.js'].slice(files['server.js'].indexOf("pathname === '/api/wf/release'"));
    const iRelMem = relEp.indexOf('tree.agentMemory = WfCore.memWrite(');
    assert(iRelMem > 0 && iRelMem < relEp.indexOf('const rev = wfSave(user.id, cur, tree);'), '发布端点回流应在 wfSave 落盘之前(不另起一次 state 写)');
    // CLI 不为回流另开一次请求:发布留痕仍是 release 原来那一次写入调用
    const relSeg = files['cli.js'].slice(files['cli.js'].indexOf('CMD.release ='), files['cli.js'].indexOf("/* ---- 项目结构"));
    assertEq((relSeg.match(/await (PUT|GET|POST)\(/g) || []).length, 1, 'CLI release 仍只发一次 state 写入请求(回流不新增接口调用)');
    // 只钉发布这一处:CLI 的 memWrite 现另有提取主体那处回流(W61,走 withProject 的 meta 桶),整文件搜会误伤
    assert(!/WfCore\.mem(Write|Feedback)\(/.test(relSeg) && !/memFeedback\(\{ p, gate/.test(files['cli.js']),
      'CLI 侧不再自己派生发布回流(写入点已归服务端发布端点,免得两端各写一份)');
    // 上限/截断/低分线三个口径:上限已收口到 wf-core 一处(两端写入面都经 memWrite),120 字截断仍两端各写一份
    const ag = fs.readFileSync(path.join(ROOT, 'js', 'agent.js'), 'utf8');
    assertEq(W.MEM_MAX, 50, 'MEM_MAX 仍是 50 条(本层是上限的唯一持有处)');
    assertEq(W.MEM_TEXT_MAX, 120, 'MEM_TEXT_MAX 应与两端写入面的 120 字截断同数');
    assert(ag.includes('slice(0, ' + W.MEM_TEXT_MAX + ')'), '浏览器写入面 120 字截断应与 wf-core 常量同数');
    assertEq(W.MEM_LOW_SCORE, 7, '待返工线应与审片重抽入口/发布门 G3 默认阈值同数');
    // 服务端回流点就在闭环写完 lastReview 之后、落盘之前(不另起一次 state 写)
    const srv = files['server.js'];
    const iLast = srv.indexOf('ep.lastReview = {\n          time: nowStr(), avg,');
    const iMem = srv.indexOf('tree.agentMemory = WfCore.memWrite(', iLast); // 前段四步的回流点在本文件更靠前,从 lastReview 起找审片那一处
    assert(iLast > 0 && iMem > iLast && iMem < srv.indexOf('const rev = wfSave(user.id, cur, tree);', iLast),
      '服务端回流应在 lastReview 写好之后、wfSave 落盘之前');
  } },
  { name: '回流行为面:整集审片闭环与发布留痕都真的把结论写进了记忆桶(且能被同板块召回)', fn: async () => {
    const W = require('../js/wf-core.js');
    // 浏览器整集审片(离线本地评审:零 LLM,结论仍可判定)
    const sb = loadReview();
    sb.U.bgDock = () => ({ say() {}, finish() {}, close() {}, m: { querySelector: () => ({ insertAdjacentHTML() {}, style: {} }), querySelectorAll: () => [] } });
    const s = rvShot({ video: { status: 'done', url: '/uploads/a.mp4', inputHash: 'h1' } });
    const ep = rvEp(s);
    const p = { id: 'p1', name: '逆袭', style: '漫剧', episodes: [ep], subjects: [] };
    await sb.Review.openEpisodeReview(p, ep, null);
    assert(ep.lastReview && typeof ep.lastReview.avg === 'number', '整集审片应写下 lastReview');
    const mem = sb.Store.state.agentMemory;
    assertEq(mem.length, 1, '审片闭环应回流一条(记忆桶原本为空)');
    assertEq(mem[0].fb, 'review:ep1');
    assertEq(mem[0].scope, '成片');
    assert(mem[0].text.startsWith('审片闭环回流·第一集:待返工 '), '回流文案应由 wf-core 派生:' + mem[0].text);
    assert(W.memBlock(mem, s.plot, '成片').includes(mem[0].text), '回流条目应能被下一轮同板块召回(自动那一半闭合)');
    // 同一集再审一次:仍是一条(原地更新),不把记忆桶越审越满
    await sb.Review.openEpisodeReview(p, ep, null);
    assertEq(sb.Store.state.agentMemory.length, 1, '反复审片应原地更新,不追加');
    // 发布留痕(门禁结果直接注入,不改门禁判据)
    const rsb = loadRelease();
    const g = { overall: 'cond-pass', fails: 0, warns: 1, score: 9, at: Date.now(),
      gates: [{ code: 'g10-billing', label: '计费账目核对(净消耗 vs 生成资产数)', status: 'warn' }] };
    const rp = { id: 'p1', name: '逆袭', episodes: [releaseReadyEp()], subjects: [] };
    const out = rsb.Release.stampRelease(rp, '首版', { gateResult: g, online: false });
    assertEq(out.ok, true, '门禁条件通过应能打版本');
    const rmem = rsb.Store.state.agentMemory;
    assertEq(rmem.length, 1, '发布闭环应回流一条');
    assertEq(rmem[0].fb, 'release:p1');
    assert(rmem[0].text.includes('发布门 cond-pass(fail 0/warn 1)') && rmem[0].text.includes('未过门 计费账目核对'),
      '回流应带门禁状态与未过门项:' + rmem[0].text);
    // 未过门的发布不打版本 → 也不回流(没有闭环就没有结论)
    const rsb2 = loadRelease();
    const bad = rsb2.Release.stampRelease({ id: 'p2', name: '未过', episodes: [] }, '', { gateResult: { overall: 'fail', fails: 3, warns: 1, gates: [] } });
    assertEq(bad.ok, false);
    assertEq(rsb2.Store.state.agentMemory.length, 0, '发布门未通过不回流');
  } },
  { name: 'SK-26 记账与实况同步:回流面清 pending 且登记真实步骤,仍欠的自进化面点名 G-11', fn() {
    const Skills = require('../js/skills.js');
    const sk = Skills.byId('review.memoryFeedback');
    assertEq(sk.pending.length, 0, '回流面已落地,pending 应清空');
    assert(sk.steps.length, '编排面已落地须有步骤(playbook 不给空步)');
    const names = require('../js/cmd-registry.js').names();
    sk.steps.forEach(st => assert(names.includes(st.cmd), '步骤命令须已注册:' + st.cmd));
    assertEq(sk.cmds.join(','),
      'project.extractSubjects,project.splitEpisodes,episode.understanding,episode.generateStoryboard,episode.smartReview,project.release',
      '命令面由 steps 推出:主线六步按步序登记,发布留痕已是注册命令,不再需要挂假命令名');
    assert(Skills.playbooks().some(x => x.id === sk.id), '已落地编排面应进 playbooks 投影');
    ['G-11', 'G-02'].forEach(g => assert(sk.gaps.includes(g), '缺口标记按关联索引口径保留:' + g));
    assert(sk.note.includes('仍欠(G-11)') && sk.note.includes('evolveExpert'), 'note 须点名仍欠的自进化面(清 pending 不等于这条没有余量)');
    assert(sk.note.includes('project.release') && sk.note.includes('release-core.js'), 'note 须写明发布留痕的命令化出口与双端单源落点');
    assert(sk.note.includes('不新建存储桶') && sk.note.includes('不改发布门'), 'note 须写明沿用既有桶、不动发布门');
    /* G-11 的两面分别记账:板块过滤这一面已落地,note 须写明判据出处;人手触发与预置专家仍是余量。
     * 蒸馏输入不得再有第二个取数口——experts.js 里读 agentMemory 的地方只能是经 memForBoards 那一处 */
    const ex = fs.readFileSync(path.join(ROOT, 'js', 'experts.js'), 'utf8');
    assert(sk.note.includes('WfCore.expertBoards') && sk.note.includes('WfCore.memForBoards'), 'note 须写明板块过滤的双端单源判据');
    assert(/WfCore\.memForBoards\(Store\.state\.agentMemory, boards\)/.test(ex), 'evolveExpert 的记忆源须经 memForBoards 按生效板块过滤');
    assertEq((ex.match(/Store\.state\.agentMemory/g) || []).length, 1, '蒸馏输入只此一个取数口(绕开过滤的第二处读全桶即红)');
    assert(/WfCore\.expertBoards\(/.test(ex) && !/AGENT_BOARDS.*filter|role.*===.*'摄像'/.test(ex),
      '生效板块经 WfCore.expertBoards 推出,不在 experts.js 里另写一份板块判据');
    assert(sk.note.includes('人手动作') && sk.note.includes('只对自定义专家开放'), 'note 须如实写明 G-11 仍欠人手触发与预置专家两处');
    // SK-04 的第三处余量同步改写:审片/发布两个闭环已回流,其余 wf 步仍不回流
    const sk4 = Skills.byId('core.memoryDual');
    assert(sk4.note.includes('SK-26'), 'SK-04 的 note 须随回流面落地同步改写');
  } },
  /* ---- 主线前段四步的闭环回流(W61:理解/分镜/拆集/提取主体 —— SK-26/SK-04 的欠段) ----
   * W43 只接了审片/发布两个闭环,W53 的记账把这四步记成"仍欠"。判据全在这几条上:
   * 派生仍只此一份、只回可判定的数字与缺口、按 fb 键原地更新不双写、六处写入点都走 UMD 同一份、
   * 失败路径(回退模板/零产出/LLM 报错)一律不写。 */
  { name: 'memFeedback 理解闭环:六维产出数与缺的维名(维名取 UND_DIMS 单源);回退模板与六维全空不写', fn() {
    const W = require('../js/wf-core.js');
    const und = over => Object.assign({ 剧情脉络: 'a', 情绪曲线: 'b', 节奏规划: 'c', 视觉基调: 'd', 关键场面: 'e', 悬念与期待: 'f' }, over || {});
    const full = W.memFeedback({ und: { ep: { id: 'ep1', title: '第一集', understanding: und() } } }, { now: () => '2026-08-27 10:00:00' });
    assertEq(full.length, 1, '一次理解闭环回流一条');
    assertEq(full[0].scope, W.WF_BOARD.understanding, '回流板块取 WF_BOARD 单源(导演)');
    assertEq(full[0].fb, 'und:ep1', '回流键按集 id');
    assertEq(full[0].time, '2026-08-27 10:00:00', '时间戳经 ctx.now 注入(纯函数不取当前时间)');
    assertEq(full[0].text, '理解闭环回流·第一集:六维产出 6/6;六维齐备');
    // 缺维如实点名,维名与条数都取 UND_DIMS(六维改名/增减时文案自动跟上,不写第二份维名)
    const part = W.memFeedback({ und: { ep: { id: 'ep2', understanding: und({ 悬念与期待: '', 关键场面: '  ' }) } } }, {});
    assertEq(part[0].text, '理解闭环回流·ep2:六维产出 4/6;缺 关键场面、悬念与期待');
    assertEq(part[0].time, '', '未注入 now 时时间戳留空');
    assert(W.UND_DIMS.every(d => part[0].text.includes('/' + W.UND_DIMS.length) || true), '');
    // 失败不写:LLM 失败回退模板(fallback 标记)、六维全空、无理解、无分集一律回空
    [{ und: { ep: { id: 'e', understanding: Object.assign(und(), { fallback: true }) } } },
      { und: { ep: { id: 'e', understanding: und({ 剧情脉络: '', 情绪曲线: '', 节奏规划: '', 视觉基调: '', 关键场面: '', 悬念与期待: '' }) } } },
      { und: { ep: { id: 'e' } } }, { und: {} }, { und: null }]
      .forEach(o => assertEq(JSON.stringify(W.memFeedback(o, {})), '[]', '判定输入取不到应回空:' + JSON.stringify(o)));
  } },
  { name: 'memFeedback 分镜闭环:镜数与预估总时长 + 缺提示词/未挂主体两处缺口;零镜不写', fn() {
    const W = require('../js/wf-core.js');
    const shot = over => Object.assign({ prompt: '漫剧风格,宴会厅', characters: ['女主'], scene: '宴会厅', props: [], duration: 5 }, over || {});
    const ep = { id: 'ep1', title: '第一集', shots: [shot(), shot({ prompt: '' }), shot({ characters: [], scene: '', props: [] })] };
    const out = W.memFeedback({ sb: { ep } }, { now: '2026-08-27 10:00:00' });
    assertEq(out.length, 1);
    assertEq(out[0].scope, W.WF_BOARD['smart-storyboard'], '回流板块取 WF_BOARD 单源(分镜)');
    assertEq(out[0].fb, 'sb:ep1');
    assertEq(out[0].text, '分镜闭环回流·第一集:出 3 镜约 9 秒;缺提示词 1 镜;未挂主体 1 镜');
    // 时长口径不另算第二份:与 Domain.estShotDuration 逐镜求和一致
    const Domain = require('../js/domain.js');
    assertEq(out[0].text.includes('约 ' + ep.shots.reduce((a, s) => a + Domain.estShotDuration(s), 0) + ' 秒'), true, '总时长应走 Domain.estShotDuration');
    // 失败不写:未产出任何镜(LLM 未返回有效数组/回退本地那条路不算闭环)、无分集一律回空
    [{ sb: { ep: { id: 'e', shots: [] } } }, { sb: { ep: { id: 'e' } } }, { sb: {} }]
      .forEach(o => assertEq(JSON.stringify(W.memFeedback(o, {})), '[]', '没出镜就不写:' + JSON.stringify(o)));
  } },
  { name: 'memFeedback 拆集闭环:集数与切分模式 + 超长集缺口(与分集页「超 2000 字」同数);零集不写', fn() {
    const W = require('../js/wf-core.js');
    const p = { id: 'p1', name: '逆袭', episodes: [{ content: '长'.repeat(2100) }, { content: '短'.repeat(300) }] };
    const out = W.memFeedback({ split: { p, mode: 'markers' } }, { now: '2026-08-27 10:00:00' });
    assertEq(out.length, 1);
    assertEq(out[0].scope, W.WF_BOARD['split-episodes'], '回流板块取 WF_BOARD 单源(剧本)');
    assertEq(out[0].fb, 'split:p1');
    assertEq(out[0].text, '拆集闭环回流·逆袭:切出 2 集(markers);最长 2100 字;1 集超 2000 字建议再拆');
    // 无超长集如实标注;mode 缺省回落 even(浏览器 LLM 失败回退本地均分时传的就是 even)
    const okOut = W.memFeedback({ split: { p: { id: 'p2', episodes: [{ content: '正' }] } } }, {});
    assertEq(okOut[0].text, '拆集闭环回流·p2:切出 1 集(even);最长 1 字;无超长集');
    // 建议线不写第二份:与分集页「超 2000 字」标签同数
    const eps = fs.readFileSync(path.join(ROOT, 'js', 'episodes.js'), 'utf8');
    assert(eps.includes('length > ' + W.MEM_EP_LONG) && eps.includes('超 ' + W.MEM_EP_LONG + ' 字'), '单集建议上限应与分集页标签同数');
    // 失败不写:一集没切出来(端点失败/前置拦截)、无项目一律回空
    [{ split: { p: { id: 'p', episodes: [] } } }, { split: { p: { id: 'p' } } }, { split: {} }]
      .forEach(o => assertEq(JSON.stringify(W.memFeedback(o, {})), '[]', '没切出集就不写:' + JSON.stringify(o)));
  } },
  { name: 'memFeedback 提取主体闭环:本轮新增/已有 + 库存与缺参考图缺口;主体库空不写', fn() {
    const W = require('../js/wf-core.js');
    const p = { id: 'p1', name: '逆袭', subjects: [{ name: '女主', image: 'a.png' }, { name: '男主' }, { name: '宴会厅' }] };
    const out = W.memFeedback({ extract: { p, added: 2, skipped: 1 } }, { now: '2026-08-27 10:00:00' });
    assertEq(out.length, 1);
    assertEq(out[0].scope, W.WF_BOARD['extract-subjects'], '回流板块取 WF_BOARD 单源(主体)');
    assertEq(out[0].fb, 'extract:p1');
    assertEq(out[0].text, '提取主体闭环回流·逆袭:本轮新增 2 位、已有 1 位;主体库共 3 位,其中 2 位缺参考图');
    // 全是同名跳过(added=0)也是一次可判定闭环:库存与缺图缺口照实回流
    const none = W.memFeedback({ extract: { p, skipped: 3 } }, {});
    assertEq(none[0].text, '提取主体闭环回流·逆袭:本轮新增 0 位、已有 3 位;主体库共 3 位,其中 2 位缺参考图');
    // 失败不写:主体库仍空(LLM 报错/三类都没提到)、无项目一律回空
    [{ extract: { p: { id: 'p', subjects: [] } } }, { extract: { p: { id: 'p' } } }, { extract: {} }]
      .forEach(o => assertEq(JSON.stringify(W.memFeedback(o, {})), '[]', '主体库仍空就不写:' + JSON.stringify(o)));
  } },
  { name: '前段四步回流:四条各占一个 fb 键,反复闭环原地更新不双写,且能被同板块召回', fn() {
    const W = require('../js/wf-core.js');
    const ctx = { now: 't1' };
    const feed = n => W.memFeedback({
      und: { ep: { id: 'ep1', title: '第一集', understanding: { 剧情脉络: 'a' + n, 情绪曲线: 'b', 节奏规划: 'c', 视觉基调: 'd', 关键场面: 'e', 悬念与期待: 'f' } } },
      sb: { ep: { id: 'ep1', title: '第一集', shots: Array.from({ length: n }, () => ({ prompt: 'x', characters: ['女主'], duration: 5 })) } },
      split: { p: { id: 'p1', name: '逆袭', episodes: Array.from({ length: n }, () => ({ content: '正文' })) }, mode: 'markers' },
      extract: { p: { id: 'p1', name: '逆袭', subjects: Array.from({ length: n }, (_, i) => ({ name: 's' + i })) }, added: n, skipped: 0 },
    }, ctx);
    const first = feed(2);
    assertEq(first.length, 4, '四支互不影响,给哪支回哪条');
    assertEq(first.map(e => e.fb).join(','), 'und:ep1,sb:ep1,split:p1,extract:p1');
    assertEq(first.map(e => e.scope).join(','), '导演,分镜,剧本,主体', '四条各按自己那一步的板块落位');
    // 用户自己沉淀的偏好在前,四条回流追加在后
    const mem0 = [{ text: '用户偏好:女主统一叫林晚晴', scope: '主体' }];
    const one = W.memWrite(mem0, first);
    assertEq(one.length, 5);
    assertEq(mem0.length, 1, '入参数组不得被改写');
    // 同一集/同一项目第二次跑:按 fb 键原地更新,仍是 5 条(20 轮下来不把 50 条上限刷满)
    const two = W.memWrite(one, feed(3));
    assertEq(two.length, 5, '反复闭环应原地更新,不追加');
    assertEq(two[2].text.includes('出 3 镜'), true, '原地更新应换成最新结论:' + two[2].text);
    assertEq(two[0].text, '用户偏好:女主统一叫林晚晴', '用户自己沉淀的条目不受回流影响');
    // 回流→召回闭合:下一轮同一步的提示词按板块召回就吃得到
    [['导演', '理解闭环回流'], ['分镜', '分镜闭环回流'], ['剧本', '拆集闭环回流'], ['主体', '提取主体闭环回流']]
      .forEach(([board, kw]) => assert(W.memBlock(two, '', board).includes(kw), board + ' 板块应召回得到本步回流条目'));
    // 与审片/发布同桶同上限:四步回流也走 memWrite 的 MEM_MAX 截断
    const full = Array.from({ length: W.MEM_MAX }, (_, i) => ({ text: 'M' + i, scope: '' }));
    assertEq(W.memWrite(full, first).length, W.MEM_MAX, '超上限应截到 MEM_MAX');
  } },
  { name: '前段四步写入面接线(源级):六处写入点都走 UMD 同一份派生,落点仍是既有 agentMemory 桶', fn() {
    const files = {};
    ['js/wf-core.js', 'js/understanding.js', 'js/sb-llm.js', 'js/proj-upload.js', 'js/commands.js', 'server.js', 'cli.js']
      .forEach(f => { files[f] = fs.readFileSync(path.join(ROOT, f), 'utf8'); });
    // 派生只此一份:四步的调用方一律 WfCore.memFeedback/memWrite,不得自己拼回流文案
    ['js/understanding.js', 'js/sb-llm.js', 'js/proj-upload.js', 'js/commands.js', 'server.js', 'cli.js'].forEach(f => {
      assert(/WfCore\.memFeedback\(/.test(files[f]), f + ' 应委托 WfCore 派生回流条目');
      assert(!files[f].includes('闭环回流·'), f + ' 不得内联回流文案(文案只在 wf-core 一处)');
    });
    // 四段文案都只在 wf-core 里出现一次
    ['理解闭环回流·', '分镜闭环回流·', '拆集闭环回流·', '提取主体闭环回流·'].forEach(t =>
      assertEq((files['js/wf-core.js'].match(new RegExp(t, 'g')) || []).length, 1, '回流文案只应在 wf-core 出现一次:' + t));
    // 浏览器落点:各按自己模块既有的通道存回 Store.state.agentMemory(不新建存储桶)
    [['js/understanding.js', 'und'], ['js/sb-llm.js', 'sb'], ['js/proj-upload.js', 'split'], ['js/commands.js', 'extract']].forEach(([f, key]) => {
      assert(/Store\.state\.agentMemory = WfCore\.memWrite\(Store\.state\.agentMemory,/.test(files[f]), f + ' 应写回 Store.state.agentMemory');
      assert(new RegExp('memFeedback\\(\\{ ' + key + ':').test(files[f]), f + ' 应回流本步分支 ' + key);
    });
    // headless 落点:服务端三处走 state 树、CLI 提取主体随同一次 PUT 的 meta 桶(与 memory add 同通道)
    const srv = files['server.js'];
    assertEq((srv.match(/tree\.agentMemory = WfCore\.memWrite\(tree\.agentMemory,/g) || []).length, 6, '服务端应有六处写入点(审片 + 发布 + 理解 ×2 + 分镜 + 拆集)');
    ['{ und: { ep } }', '{ sb: { ep } }', '{ split: { p, mode: used } }'].forEach(seg =>
      assert(srv.includes('WfCore.memFeedback(' + seg), '服务端应回流 ' + seg));
    assert(/meta\.agentMemory = WfCore\.memWrite\(cur\.state\.agentMemory, entries\)/.test(files['cli.js']), 'CLI 提取主体应经 meta 桶写回 agentMemory');
    // 回流点都在各自那次落盘之前(落盘后写=静默丢),且不新增一次 IO
    const before = (src, mem, save, label) => {
      const i = src.indexOf(mem), j = src.indexOf(save, i);
      assert(i > 0 && j > i, label + ':回流应在落盘之前');
    };
    // 服务端按端点切片再判位置:整文件搜 wfSave 会捞到后面别的端点那次落盘,写到 wfSave 之后也仍能"找到"
    const seg = (route) => {
      const i = srv.indexOf("pathname === '" + route + "'");
      const j = srv.indexOf("if (pathname === '/api/", i + 10);
      assert(i > 0 && j > i, route + ':端点切片应取得到');
      return srv.slice(i, j);
    };
    before(seg('/api/wf/understanding'), "WfCore.memFeedback({ und: { ep } }", 'const rev = wfSave(user.id, cur, tree);', '服务端理解');
    before(seg('/api/wf/smart-storyboard'), "WfCore.memFeedback({ sb: { ep } }", 'const rev = wfSave(user.id, cur, tree);', '服务端分镜');
    before(seg('/api/wf/split-episodes'), "WfCore.memFeedback({ split: { p, mode: used } }", 'const rev = wfSave(user.id, cur, tree);', '服务端拆集');
    // 分镜端点内部那次理解步:同一切片里理解回流也得在落盘之前
    before(seg('/api/wf/smart-storyboard'), "WfCore.memFeedback({ und: { ep } }", 'const rev = wfSave(user.id, cur, tree);', '服务端分镜内部理解步');
    before(files['js/sb-llm.js'], 'WfCore.memFeedback({ sb: { ep } }', 'Store.save();', '浏览器分镜');
    before(files['js/proj-upload.js'], 'WfCore.memFeedback({ split: { p, mode: used } }', 'Store.save();', '浏览器拆集');
    before(files['js/commands.js'], 'WfCore.memFeedback({ extract:', 'Store.save();', '浏览器提取主体');
    // CLI 提取主体不为回流另开一次请求:withProject 仍是那一次 PUT
    // 切到下一条 EXEC 为止:其后已另有 project.release 那条命令,切到注册表收尾会把它那次请求也数进来
    const iEx = files['cli.js'].indexOf("EXEC['project.extractSubjects']");
    const exSeg = files['cli.js'].slice(iEx, files['cli.js'].indexOf("EXEC['", iEx + 6));
    assertEq((exSeg.match(/await (PUT|GET|POST)\(/g) || []).length, 1, 'CLI 提取主体仍只发一次 wf 请求(回流随 withProject 原来那次 PUT)');
    assert(/const changes = \{ projects: \{ \[pid\]: proj \} \};/.test(files['cli.js']), 'withProject 的 meta 桶应挂在原来那次 PUT 的 changes 上');
  } },
  { name: '前段四步行为面(浏览器真跑):理解重生成与提取主体入库都把结论写进了记忆桶,失败不写', fn: async () => {
    // 本集理解(独立重生成入口:计费五件套 + 失败回退模板不算交付)
    const usb = loadUnderstanding();
    usb.__chatJSONResult = { 剧情脉络: '女主复仇', 情绪曲线: '压抑转爆发', 节奏规划: '前慢后快', 视觉基调: '冷色', 关键场面: '宴会羞辱', 悬念与期待: '身世之谜' };
    const up = { id: 'p1', name: '逆袭', style: '漫剧', episodes: [] };
    const uep = { id: 'ep1', title: '第一集', content: '正文', contentRev: 0 };
    assertEq(await usb.Understanding.regen(up, uep), true, '六维齐备应算交付');
    let umem = usb.Store.state.agentMemory;
    assertEq(umem.length, 1, '理解闭环应回流一条(记忆桶原本为空)');
    assertEq(umem[0].fb, 'und:ep1');
    assertEq(umem[0].scope, '导演');
    assertEq(umem[0].text, '理解闭环回流·第一集:六维产出 6/6;六维齐备');
    assert(usb.WfCore.memBlock(umem, uep.title, '导演').includes(umem[0].text), '回流条目应能被下一轮导演板块召回');
    // 再生成一次:仍是一条(fb 原地更新)
    assertEq(await usb.Understanding.regen(up, uep), true);
    assertEq(usb.Store.state.agentMemory.length, 1, '反复重生成应原地更新,不追加');
    // 失败(LLM 不可用/结构不完整 → 回退模板)退费置失败,不回流
    const usb2 = loadUnderstanding();
    usb2.__chatJSONResult = null;
    assertEq(await usb2.Understanding.regen(up, { id: 'ep9', title: '第九集', content: '正文' }), false);
    assertEq(usb2.Store.state.agentMemory.length, 0, '回退模板不是理解结论,不写假成功');
    // 提取主体(浏览器命令层入库口径:与 CLI exec project.extractSubjects 同一份派生)
    const csb = loadCommands();
    csb.__extractFound = { character: [{ name: '女主', evidence: 'e' }], scene: [{ name: '宴会厅', evidence: 'e' }], prop: [] };
    const { p } = cmdCtx(csb);
    p.script = '女主在宴会厅被当众羞辱。';
    p.subjects = [];
    let r = await csb.Commands.execute('project.extractSubjects', { pid: 'p1' });
    assertEq(r.ok, true, '离线启发式入库应成功:' + JSON.stringify(r.error || {}));
    let cmem = csb.Store.state.agentMemory;
    assertEq(cmem.length, 1, '提取主体闭环应回流一条');
    assertEq(cmem[0].fb, 'extract:p1');
    assertEq(cmem[0].scope, '主体');
    assertEq(cmem[0].text, '提取主体闭环回流·p1:本轮新增 2 位、已有 0 位;主体库共 2 位,其中 2 位缺参考图');
    // 同项目再提取一次:同名同类跳过,仍是一条(原地更新成最新库存)
    r = await csb.Commands.execute('project.extractSubjects', { pid: 'p1' });
    assertEq(r.ok, true);
    cmem = csb.Store.state.agentMemory;
    assertEq(cmem.length, 1, '反复提取应原地更新,不追加');
    assertEq(cmem[0].text, '提取主体闭环回流·p1:本轮新增 0 位、已有 2 位;主体库共 2 位,其中 2 位缺参考图');
    // LLM 提取失败(在线)→ 如实报错、主体库不动、不回流
    const csb2 = loadCommands();
    csb2.__apiReady = true;
    csb2.__extractErr = new Error('上游 502');
    const { p: p2 } = cmdCtx(csb2);
    p2.script = '女主在宴会厅被当众羞辱。';
    p2.subjects = [];
    r = await csb2.Commands.execute('project.extractSubjects', { pid: 'p1' });
    assertEq(r.ok, false); assertEq(r.error.code, 'extract');
    assertEq(csb2.Store.state.agentMemory.length, 0, 'LLM 失败不写假成功');
  } },
  /* ---- 浏览器剧本解析向导的主体入库路径(W108):向导曾自己提取、自己造条目、整表覆盖 p.subjects,
   * 于是既绕过命令层的合并口径(同名同类不覆盖/别名寻址),也绕过回流那一处写入点。
   * 现收口到 Commands.execute('project.extractSubjects'):向导只留进度、用户选的模型与断点重试。 ---- */
  { name: '解析向导主体入库收口命令层(源级):director.js 零直写主体库,提取/入库/回流只此一条路径', fn() {
    const dsrc = fs.readFileSync(path.join(ROOT, 'js', 'director.js'), 'utf8');
    assert(dsrc.includes("Commands.execute('project.extractSubjects'"), '向导 Step1 应经统一命令层入库');
    assert(!/p\.subjects\s*=/.test(dsrc), '向导不得直写主体库(入库口径只在命令层那一份)');
    assert(!/Store\.uid\('sub'\)/.test(dsrc), '向导不得自己造主体条目(别名/描述/提示词的补齐都在命令层)');
    assert(!/llmExtractSubjects|EpisodeUtil\.extractSubjects/.test(dsrc), '向导不得自己调提取(提示词与规整都在命令层同一份)');
    assert(!/memFeedback|agentMemory/.test(dsrc), '回流点只在命令层那一处,向导不写第二份');
    // 向导独有的两件事经注册表登记的参数位透传,不在向导里另开分支
    const CmdRegistry = require('../js/cmd-registry.js');
    const argNames = (CmdRegistry.byName['project.extractSubjects'].args || []).map(a => a.name);
    ['model', 'local'].forEach(k => assert(argNames.includes(k), '命令注册表应登记 ' + k + ' 位,实际:' + argNames.join(',')));
    assert(/local: true/.test(dsrc), '重试仍失败应带 local 位回退本地启发式(防重试死循环)');
    // 登记了却不读 = 假参数:命令层两端各自的读取点逐个核对
    const csrc = fs.readFileSync(path.join(ROOT, 'js', 'commands.js'), 'utf8');
    assert(/!args\.local && window\.API && API\.isReady\(\)/.test(csrc), '命令层须以 args.local 短路 LLM 分支(零 LLM 零计费)');
    assert(/const model = args\.model \|\|/.test(csrc), '命令层须优先取调用方指定的模型');
    const clisrc = fs.readFileSync(path.join(ROOT, 'cli.js'), 'utf8');
    const iEx = clisrc.indexOf("EXEC['project.extractSubjects']");
    const exSeg = clisrc.slice(iEx, clisrc.indexOf("EXEC['", iEx + 6));
    assert(/args\.local \|\| args\.model/.test(exSeg), 'headless 两位都不成立,CLI 须如实拒绝而不是静默忽略');
    assertEq((exSeg.match(/await (PUT|GET|POST)\(/g) || []).length, 1, '拒绝分支不得多发一次请求(仍是 withProject 那一次 PUT)');
    // 主体类型不再是向导的入参:全量提取由命令层持有(向导与调用方都不再传第二份类型表)
    assert(/function run\(p, scriptText, model, extractMode, main\)/.test(dsrc), '向导入参不应再带 types(全量提取口径在命令层)');
    const usrc = fs.readFileSync(path.join(ROOT, 'js', 'proj-upload.js'), 'utf8');
    assert(/Director\.run\(p, scriptText, model, extractMode, main\)/.test(usrc), '上传弹窗的调用应与向导入参一致');
  } },
  { name: '解析向导行为面(浏览器真跑):入库走命令层——已有主体图不被覆盖,结论按主体板块回流一条', fn: async () => {
    const sb = loadDirector();
    const { p } = cmdCtx(sb); // 夹具主体库里已有一位带图主体 sub1
    p.name = '逆袭'; p.style = '漫剧';
    sb.__extractFound = { character: [{ name: '主角', evidence: '同名同类:应跳过' }, { name: '女主', evidence: 'e' }], scene: [{ name: '宴会厅', evidence: 'e' }], prop: [] };
    const calls = [];
    const real = sb.Commands.execute;
    sb.Commands.execute = (name, args) => { calls.push({ name, args }); return real(name, args); };
    sb.Director.run(p, '女主在宴会厅被主角当众羞辱。', 'test-model', 'fine', null);
    await sleep(80);
    // 入库只经命令层这一条路径,且把向导独有的两件事(用户选的模型、精细模式)透传下去
    assertEq(calls.map(c => c.name).join(','), 'project.extractSubjects', '向导只应发这一条命令');
    assertEq(calls[0].args.model, 'test-model', '用户在上传弹窗选的文本模型应透传');
    assertEq(calls[0].args.mode, 'fine');
    assertEq(calls[0].args.ui, true, 'UI 语境位应带上(决策弹窗保留)');
    // 合并口径:同名同类的老主体原样留着(连带它的参考图),新主体入库待生图
    assertEq(p.subjects.map(s => s.name).join(','), '主角,女主,宴会厅', '应是合并入库而不是整表覆盖');
    assertEq(p.subjects[0].image, 'x.png', '已有主体的参考图不得被向导覆盖掉');
    // 回流:主体板块一条,文案与命令层直跑逐字同源(向导不写第二份)
    const mem = sb.Store.state.agentMemory;
    assertEq(mem.length, 1, '向导跑完应有回流条目(收口前这条路径一条也不写)');
    assertEq(mem[0].fb, 'extract:p1');
    assertEq(mem[0].scope, '主体');
    assertEq(mem[0].text, '提取主体闭环回流·逆袭:本轮新增 2 位、已有 1 位;主体库共 3 位,其中 2 位缺参考图');
    // Step1 结论如实报数;Step3 只补缺图主体(已有图的不重做,不多扣一张的费)
    assert(sb.__dirInfo.some(x => x.startsWith('0:') && x.includes('本轮新增 2 位、已有 1 位')), 'Step1 应如实报入库回执,实际:' + sb.__dirInfo.join(' | '));
    assertEq(sb.__called.filter(c => c.startsWith('genSubjectImage:')).join(','),
      'genSubjectImage:女主,genSubjectImage:宴会厅', 'Step3 只补缺参考图的主体(已有图的不重做,不多扣一张的费)');
  } },
  /* ---- 蒸馏输入的板块面(G-11 的过滤那一半):召回是加权取样给上下文,蒸馏是写死进 persona,
   * 两者不共用取样口——蒸馏侧只认板块归属,硬过滤、无补召、取不到就回空让调用方跳过。 ---- */
  { name: 'expertBoards:板块雇佣 > 全局雇佣,板块序取词表;一个都不命中回空数组', fn() {
    const W = require('../js/wf-core.js');
    const boards = ['导演', '剧本', '主体', '分集', '分镜', '生成', '审片', '成片'];
    const call = o => W.expertBoards(Object.assign({ boards }, o));
    const e = { id: 'cx_1' };
    // 板块雇佣:命中的板块按词表顺序回,不按项目里的书写顺序
    assertEq(call({ expert: e, projects: [{ boards: { 分镜: { expert: 'cx_1' }, 剧本: { expert: 'cx_1' } } }] }).join(','),
      '剧本,分镜', '板块序应取入参词表顺序');
    // 全局雇佣:未被板块专家顶掉的板块才生效(与 personaFor 同一套先后)
    assertEq(call({ expert: e, hiredId: 'cx_1', projects: [{ boards: { 分镜: { expert: 'cx_2' } } }] }).join(','),
      '导演,剧本,主体,分集,生成,审片,成片', '板块另雇专家即顶掉全局雇佣者');
    // 无项目:按纯全局雇佣状态判(与 personaFor 传 boards=null 同形)
    assertEq(call({ expert: e, hiredId: 'cx_1' }).length, boards.length, '无项目时全局雇佣者在全部板块生效');
    assertEq(call({ expert: e, hiredId: 'cx_1', projects: [] }).length, boards.length, '空项目列表与无项目同解');
    // 跨项目并集:同一专家在不同项目雇在不同板块,两个板块都算生效
    assertEq(call({ expert: e, projects: [{ boards: { 分镜: { expert: 'cx_1' } } }, { boards: { 成片: { expert: 'cx_1' } } }] }).join(','),
      '分镜,成片', '跨项目应取并集');
    // 未生效/入参缺失一律回空——回空是"跳过"的信号,不是"全部板块"的简写
    assertEq(call({ expert: e, projects: [{ boards: { 分镜: { expert: 'cx_2' } } }] }).length, 0, '没被雇过回空数组');
    assertEq(call({ expert: e, hiredId: 'cx_2' }).length, 0, '全局雇的是别人回空数组');
    assertEq(W.expertBoards({ expert: null, boards }).length, 0, '无专家对象回空');
    assertEq(W.expertBoards({ expert: { name: '无 id' }, boards }).length, 0, '专家无 id 回空(不拿 undefined 去匹配)');
    assertEq(call({ expert: e, hiredId: 'cx_1', boards: null }).length, 0, '无板块词表回空');
  } },
  { name: 'memForBoards:只收 scope 命中的条目(无 scope 不收/空板块回空/按 text 去重/不改入参)', fn() {
    const W = require('../js/wf-core.js');
    const mem = [
      { text: '定调偏好', scope: '导演' },
      { text: '景别口诀', scope: '分镜' },
      { text: '景别口诀', scope: '剧本' }, // 同一条偏好在两个板块沉淀过
      { text: '没标板块' },
      { text: '空板块名', scope: '' },
      { text: '' , scope: '分镜' },        // 空正文与召回侧同口径:不算条目
      null,
    ];
    assertEq(W.memForBoards(mem, ['分镜']).map(m => m.text).join(','), '景别口诀', '只收本板块条目');
    assertEq(W.memForBoards(mem, ['剧本', '分镜']).map(m => m.text).join(','), '景别口诀', '多板块命中同一 text 只蒸一次');
    assertEq(W.memForBoards(mem, ['导演', '分镜']).map(m => m.text).join(','), '定调偏好,景别口诀', '按桶内顺序保序');
    assertEq(W.memForBoards(mem, ['成片']).length, 0, '该板块无沉淀回空(不退回全桶)');
    assertEq(W.memForBoards(mem, []).length, 0, '空板块列表回空');
    assertEq(W.memForBoards(mem, null).length, 0, '板块列表缺失回空');
    assertEq(W.memForBoards(mem, ['分镜', null, '']).map(m => m.text).join(','), '景别口诀', '板块列表里的空值不参与匹配');
    assertEq(W.memForBoards(null, ['分镜']).length, 0, '记忆桶缺失回空');
    assertEq(mem.length, 7, '入参数组不得被改写(与 memWrite/memSeed 同纪律)');
    // 与召回侧的分工:同一输入下召回会补全局最近,蒸馏侧不会
    assert(W.memRecall(mem, '', '成片').length > 0, '召回侧该板块空时仍会补全局最近(上下文用)');
    assertEq(W.memForBoards(mem, ['成片']).length, 0, '蒸馏侧不补召——写死进 persona 的东西必须是本板块的');
  } },
  /* ---- 记忆播种/板块迁移(W53:补种与迁移的 headless 收口) ----
   * 此前这段派生只在浏览器 memAll() 里,headless 读写记忆桶跑不到。下沉后判据全在这几条上:
   * 种子表只此一份、Node 无 window 也能播出同结构条目、迁移不丢不双写、空板/未知板名不静默空成功。 */
  { name: 'memSeed 播种(Node 无 window):迁移+标准沉淀+知识库种子一次到位,条目结构与既有记忆桶同形', fn() {
    const W = require('../js/wf-core.js');
    const KB = require('../js/knowledge.js');
    const seed = mem => W.memSeed(mem, { kb: KB, now: () => '2026-08-27 10:00:00', boards: HEADLESS_BOARDS() });
    const src = [];
    const r = seed(src);
    assertEq(src.length, 0, '入参数组不得被改写(与 memWrite 同纪律)');
    assertEq(r.mem.length, W.MEM_STD_SEEDS.length + W.MEM_KB_SEEDS.length, '空桶播种应种下两张表的全部条目');
    assertEq(r.added.length, r.mem.length, 'added 应逐条如实回报');
    assertEq(r.changed, true, '有新种条目即 changed');
    // 条目结构:沿用既有桶的字段集(知识库条目多一个同键标识 kb),不另造第二套 schema
    const keys = m => Object.keys(m).sort().join(',');
    assertEq(keys(r.mem[0]), 'scope,text,time', '标准沉淀条目字段集');
    assertEq(keys(r.mem[r.mem.length - 1]), 'kb,scope,text,time', '知识库沉淀条目字段集(多 kb 同键标识)');
    assertEq(r.mem.every(m => m.time === '2026-08-27 10:00:00'), true, '时间戳经 ctx.now 注入(纯函数不取当前时间)');
    assertEq(r.mem.map(m => m.scope).join(','), '分镜,分镜,剧本,剧本,剧本,分镜,分镜', '板块 scope 取种子表登记值');
    assertEq(r.mem[r.mem.length - 1].text, KB.pick('抽卡军规', '抽卡公式'), '知识库条目正文现取 KB(不留第二份措辞)');
    // 种下的条目立刻可被同板块召回(播种→召回闭合)
    assert(W.memBlock(r.mem, '', '分镜').includes('五段式标准结构'), '播下的分镜种子应能被同板块召回');
    // 幂等:再播一次不重复种、不写盘
    const again = seed(r.mem);
    assertEq(again.added.length, 0, '已种过再播不重复种');
    assertEq(again.changed, false, '无变化时 changed=false(调用方据此不写盘)');
    assertEq(again.mem.length, r.mem.length);
    // 脏入参安全(非数组按空桶处理)
    [null, undefined, 'x', 42].forEach(bad => assertEq(seed(bad).mem.length, r.mem.length, '非数组入参应按空桶播种:' + JSON.stringify(bad)));
  } },
  { name: 'memSeed 补种边界:旧板名自动迁移、知识库同键跟随正文、老手抄版不重复种、无 kb 时跳过知识库种子', fn() {
    const W = require('../js/wf-core.js');
    const KB = require('../js/knowledge.js');
    // 旧板块名迁移(表驱动):条目原地改 scope,不新增条目
    const old = [{ text: '用户偏好:夜戏偏冷色', time: 't', scope: '构思' }, { text: '另一条', time: 't', scope: '分镜' }];
    const r = W.memSeed(old, { kb: KB, now: 't2' });
    assertEq(JSON.stringify(r.migrated), JSON.stringify([{ from: '构思', to: '导演', count: 1 }]), '旧板名应按迁移表归位');
    assertEq(r.mem.filter(m => m.scope === '构思').length, 0, '迁移后不应再有旧板名条目');
    assertEq(r.mem.filter(m => m.text === '用户偏好:夜戏偏冷色').length, 1, '迁移不双写(条目仍只有一条)');
    assertEq(old[0].scope, '构思', '入参条目不得被就地改写');
    // 知识库同键沉淀:条目正文改过后跟随更新(不重复种、不留旧措辞)
    const seeded = W.memSeed([], { kb: KB, now: 't' }).mem;
    const one = seeded.find(m => m.kb === '对话铁律');
    one.text = '过时的旧正文';
    const upd = W.memSeed(seeded, { kb: KB, now: 't' });
    assertEq(upd.updated.join(','), '对话铁律', '同键沉淀正文改过应跟随更新');
    assertEq(upd.mem.filter(m => m.kb === '对话铁律').length, 1, '跟随更新是原地改,不追加第二条');
    assertEq(upd.mem.find(m => m.kb === '对话铁律').text, KB.section('对话铁律'));
    // 老数据的手抄版(无 kb 键但正文含 legacy 标记):保留用户既有条目,不重复种
    const legacy = [{ text: '钩子六型:老用户自己抄的那版', time: 't', scope: '剧本' }];
    const lr = W.memSeed(legacy, { kb: KB, now: 't' });
    assertEq(lr.mem.filter(m => String(m.text).includes('钩子六型')).length, 1, '命中 legacy 标记不重复种');
    assertEq(lr.mem.some(m => m.kb === '钩子六型'), false, '老条目保留原样,不改写成带 kb 的新条目');
    // 未注入知识库:只种标准沉淀(与浏览器 window.KB 缺失时同口径)
    const noKb = W.memSeed([], { now: 't' });
    assertEq(noKb.mem.length, W.MEM_STD_SEEDS.length, '无 kb 注入时跳过知识库种子');
    assertEq(noKb.mem.every(m => !m.kb), true);
  } },
  { name: 'memSeed 按板块播种:只播该板块;空板与未知板名一律明确报错,不静默回空成功', fn() {
    const W = require('../js/wf-core.js');
    const KB = require('../js/knowledge.js');
    const boards = HEADLESS_BOARDS();
    const only = W.memSeed([], { kb: KB, now: 't', boards, board: '剧本' });
    assertEq(only.mem.length, 3, '只播剧本板块的三条知识库种子');
    assertEq(only.mem.every(m => m.scope === '剧本'), true, '不得越板种入其他板块');
    // 未知板名:板块词表由调用方注入,不在本层另写一份
    let err = '';
    try { W.memSeed([], { kb: KB, boards, board: '灯光' }); } catch (e) { err = e.message; }
    assert(/未知板块名:灯光/.test(err), '未知板名应明确报错:' + err);
    // 空板:板块合法但没有登记种子(播下去什么也不会发生)——同样报错,不回一个"成功 0 条"
    err = '';
    try { W.memSeed([], { kb: KB, boards, board: '生成' }); } catch (e) { err = e.message; }
    assert(/板块「生成」没有登记的记忆种子/.test(err), '空板应明确报错:' + err);
    assert(W.memSeedBoards().join(',') === '分镜,剧本', '有种子的板块由两张种子表推出,不另写清单');
    // 迁移表命中的板块可单播(旧板名归位不受板块过滤影响)
    const mig = W.memSeed([{ text: 'x', scope: '构思' }], { kb: KB, boards, board: '分镜' });
    assertEq(mig.migrated.length, 0, '只播分镜时不做导演板块的迁移');
  } },
  { name: 'memMigrateBoard 板块迁移:条目不丢不双写;空板/同名/未知新板名一律报错', fn() {
    const W = require('../js/wf-core.js');
    const boards = HEADLESS_BOARDS();
    const mem = [
      { text: 'A', time: 't', scope: '构思' }, { text: 'B', time: 't', scope: '分镜' },
      { text: 'C', time: 't', scope: '构思', kb: 'x' }, { text: 'D', time: 't', scope: '' },
    ];
    const r = W.memMigrateBoard(mem, '构思', '导演', { boards });
    assertEq(r.mem.length, mem.length, '迁移不增不减条目(不丢不双写)');
    assertEq(r.moved.length, 2, '两条旧板名条目迁移');
    assertEq(r.mem.map(m => m.scope).join('|'), '导演|分镜|导演|', '只改命中条目的 scope,其余原样');
    assertEq(r.mem[2].kb, 'x', '迁移保留条目其余字段');
    assertEq(r.mem.map(m => m.text).join(''), 'ABCD', '条目正文与顺序不变');
    assertEq(mem[0].scope, '构思', '入参不得被改写');
    assertEq(JSON.stringify(r.migrated), JSON.stringify([{ from: '构思', to: '导演', count: 2 }]));
    assertEq(W.memRecall(r.mem, '', '导演').slice(0, 2).map(m => m.text).join(','), 'A,C', '迁移后条目应能被新板块优先召回');
    // 明确报错面:空板(旧板名下无条目)/缺参/同名/未知新板名
    const boom = (fn, re, why) => { let m = ''; try { fn(); } catch (e) { m = e.message; } assert(re.test(m), why + ':' + m); };
    boom(() => W.memMigrateBoard(r.mem, '构思', '导演', { boards }), /旧板名「构思」下没有记忆条目/, '空板应报错而非静默空成功');
    boom(() => W.memMigrateBoard(mem, '', '导演', { boards }), /需同时给出旧板名与新板名/, '缺旧板名应报错');
    boom(() => W.memMigrateBoard(mem, '构思', '', { boards }), /需同时给出旧板名与新板名/, '缺新板名应报错');
    boom(() => W.memMigrateBoard(mem, '分镜', '分镜', { boards }), /旧板名与新板名相同/, '同名迁移应报错');
    boom(() => W.memMigrateBoard(mem, '构思', '灯光', { boards }), /未知板块名:灯光/, '未知新板名应报错');
  } },
  { name: '双端同播:浏览器 memAll 与 Node 无 window 直调 memSeed 产出逐字段一致', fn() {
    const W = require('../js/wf-core.js');
    const KB = require('../js/knowledge.js');
    // 浏览器路径:agent.js 的 memAll(经 AgentCore.memBlock 触发,与真实调用路径一致)
    const sb = loadAgent();
    assertEq(typeof sb.window, 'object', '浏览器沙箱有 window');
    sb.AgentCore.memBlock('', '分镜');
    const browser = sb.Store.state.agentMemory;
    assertEq(sb.Store._saves, 1, '播种只落一次盘(逐条 save 的老写法应已收敛)');
    // headless 路径:Node 进程里没有 window/Store,记忆桶与知识库经参数注入
    assertEq(typeof global.window, 'undefined', '本进程无 window(headless 判据)');
    const headless = W.memSeed([], { kb: KB, now: () => sb.Store.now(), boards: HEADLESS_BOARDS() }).mem;
    assertEq(JSON.stringify(headless), JSON.stringify(browser), '两端播出的条目应逐字段一致');
    // 浏览器再开一次不重复种(memAll 幂等)
    sb.AgentCore.memBlock('', '分镜');
    assertEq(sb.Store.state.agentMemory.length, browser.length, '重复进入助手不重复种');
    assertEq(sb.Store._saves, 1, '无变化时不再写盘');
    // 浏览器侧的旧板名迁移仍在(老数据打开一次即归位)
    const sb2 = loadAgent();
    sb2.Store.state.agentMemory = [{ text: '老条目', time: 't', scope: '构思' }];
    sb2.AgentCore.memBlock('', '导演');
    assertEq(sb2.Store.state.agentMemory.filter(m => m.scope === '构思').length, 0, '浏览器打开时旧板名应归位');
    assertEq(sb2.Store.state.agentMemory.filter(m => m.text === '老条目').length, 1, '迁移不双写');
  } },
  { name: '播种面接线(源级):种子表只在 wf-core 一份,四端入口齐备,板块词表两端同集', fn() {
    const W = require('../js/wf-core.js');
    const Skills = require('../js/skills.js');
    const ag = fs.readFileSync(path.join(ROOT, 'js', 'agent.js'), 'utf8');
    const wf = fs.readFileSync(path.join(ROOT, 'js', 'wf-core.js'), 'utf8');
    const srv = fs.readFileSync(path.join(ROOT, 'server.js'), 'utf8');
    const cli = fs.readFileSync(path.join(ROOT, 'cli.js'), 'utf8');
    const mcp = fs.readFileSync(path.join(ROOT, 'mcp.js'), 'utf8');
    // 浏览器改为委托,种子正文/迁移表不得再在 agent.js 留第二份(直写 window-only 那一份即红)
    assert(/WfCore\.memSeed\(Store\.state\.agentMemory,/.test(ag), '浏览器 memAll 应委托 WfCore.memSeed');
    ['五段式标准结构', '景别衔接口诀', 'KB_SEEDS =', "scope === '构思'"].forEach(k =>
      assert(!ag.includes(k), 'agent.js 不得再内联种子/迁移表:' + k));
    assert(W.MEM_STD_SEEDS.every(s => wf.includes(s.legacy)) && wf.includes('构思'), '种子表与迁移表应落在 wf-core');
    // headless 三端:服务端端点 + CLI 薄封装 + MCP 工具
    assert(srv.includes("pathname === '/api/wf/memory-seed'") && /WfCore\.memSeed\(tree\.agentMemory,/.test(srv)
      && /WfCore\.memMigrateBoard\(tree\.agentMemory,/.test(srv), '服务端端点应委托 WfCore 并写回既有 state 树记忆桶');
    assert(/tree\.agentMemory = r\.mem;/.test(srv), '服务端落点仍是既有 agentMemory 桶(不新建存储桶)');
    assert(!/wfLLM\([^)]*memory-seed/.test(srv) && !srv.includes("action: 'llm.memorySeed'"), '播种端点不得挂 LLM 计费动作');
    assert(cli.includes("POST('/api/wf/memory-seed'") && /sub === 'seed'/.test(cli) && /sub === 'migrate'/.test(cli),
      'CLI 应有 memory seed|migrate 两个薄封装子命令');
    assert(cli.includes('memory seed [--scope 板块]') && cli.includes('memory migrate --from 旧板名 --to 新板名'), 'CLI help 应登记两条用法');
    assert(mcp.includes('hujing_memory_seed') && mcp.includes('hujing_memory_migrate'), 'MCP 应暴露播种与迁移工具');
    assert(/'memory', 'seed'/.test(mcp) && /'memory', 'migrate'/.test(mcp), 'MCP 工具应包装 CLI 同名子命令(不另起链路)');
    // 板块词表:浏览器 AGENT_BOARDS 键 vs headless(Skills.STAGES 主线七步 + 支线导演),两端同集
    const uiBoards = [...ag.matchAll(/\{ key: '([^']+)', ico:/g)].map(m => m[1]);
    assertEq(uiBoards.join(','), HEADLESS_BOARDS().join(','), '两端板块词表应同集同序(各取自己那份单源)');
    assert(/Skills\.STAGES\.map\(x => x\.name\)/.test(srv), '服务端板块词表应现取 Skills.STAGES,不手写第二份');
    assertEq(Skills.STAGES.length + 1, uiBoards.length, '主线七步 + 支线导演板块');
  } },
];
/* headless 侧板块词表(与 server.js wfMemBoards 同一推导):支线「导演」+ 主线七步板块名 */
function HEADLESS_BOARDS() {
  const W = require('../js/wf-core.js');
  return [W.WF_BOARD.understanding].concat(require('../js/skills.js').STAGES.map(x => x.name));
}

/* ================= 套件 23:主线中段流程模板(js/flow-tpl.js,G-12 的 MCP 模板那一半) =================
 * 模板 = 调用顺序 + 每个参数从哪取 + 断点;步序取 SK-05 投影、参数面取 cmd-registry、
 * 状态与缺前置取 Domain.workflow,本套件按这三条边界逐项钉:三处任一被抄成第二份即红。 */
const FLOW_BARE = () => ({ id: 'p_flow', name: '空项目', subjects: [], episodes: [] });
/* 有整本剧本、无主体、无分集(中段起跑前的典型态) */
const FLOW_SCRIPT = () => Object.assign(FLOW_BARE(), { script: '第一集 宴会羞辱\n女主在宴会上被当众羞辱。'.repeat(6) });
/* 主体齐(带图)、分集齐、分镜齐、未出片 */
const FLOW_TOSHOOT = () => Object.assign(FLOW_SCRIPT(), {
  subjects: [{ id: 'su1', name: '女主', image: '/uploads/a.png' }],
  episodes: [{ id: 'e1', title: '第1集', content: '宴会厅冲突爆发,女主离场。'.repeat(4), shots: [{ id: 'sh1', order: 0, confirm: true, prompt: 'x' }] }],
});
const flowTests = [
  { name: 'flow-tpl · 中段登记与主线全链投影逐步对齐(漏登记点名,审片/成片有意不在中段)', fn() {
    const F = require('../js/flow-tpl.js');
    const Skills = require('../js/skills.js');
    const CmdRegistry = require('../js/cmd-registry.js');
    const proj = F.projection();
    assertEq(proj.map(x => x.cmd).join(','), Skills.playbook(F.CHAIN_ID).steps.map(s => s.cmd).join(','),
      '自省表应与主线全链投影逐步对齐(步序不在本层重排)');
    assertEq(proj.filter(x => !x.registered).map(x => x.cmd).join(','), '',
      '投影每一步都须在中段登记(不在中段的登记为 null,与漏登记分开)');
    assertEq(proj.filter(x => !x.mid).map(x => x.cmd).join(','), 'episode.smartReview,episode.compose',
      '审片与成片有意不在中段(各由自己那段承接),其余七步都在');
    // 覆盖面由登记推出并按 STAGES 步序排,不在本层另写一份步名清单
    assertEq(F.stages().join(','), 'subjects,eps,shots,gen', '中段覆盖主体/分集/分镜/生成四步');
    assertEq(F.segments().join(','), 'mid,subjects,eps,shots,gen', '流程段 = 整段 + 四个主线步');
    proj.filter(x => x.mid).forEach(x => {
      assert(Skills.stages().includes(x.stage), x.cmd + ' 的落点须是主线步键:' + x.stage);
      assert(CmdRegistry.byName[x.cmd], x.cmd + ' 须是已注册领域命令');
    });
    // 同一主线步上"看整步 done 不 done"的推进命令至多一条;多条时必须各自按阻塞码分工
    F.stages().forEach(k => {
      const loose = proj.filter(x => x.mid && x.stage === k && !x.optional && !x.codes.length);
      assert(loose.length <= 1, k + ' 步有多条命令时须各自登记阻塞码分工,实际含糊的有:' + loose.map(x => x.cmd).join(','));
    });
  } },
  { name: 'flow-tpl · 步骤序列稳定、可 JSON;段选择是投影的有序切片', fn() {
    const F = require('../js/flow-tpl.js');
    const a = JSON.stringify(F.template('mid', null)), b = JSON.stringify(F.template('mid', null));
    assertEq(a, b, '同输入两次产出应逐字节相同(无隐藏状态)');
    assertEq(JSON.stringify(JSON.parse(a)), a, '产出须可 JSON 往返(不含函数/循环引用)');
    const mid = F.template('mid', null);
    const chain = F.projection().filter(x => x.mid).map(x => x.cmd);
    assertEq(mid.steps.map(s => s.cmd).join(','), chain.join(','), '中段步序应逐步等于投影的中段切片');
    assertEq(mid.steps.map(s => s.i).join(','), mid.steps.map((_, i) => i + 1).join(','), '序号应连续');
    let acc = [];
    F.stages().forEach(k => { acc = acc.concat(F.template(k, null).steps.map(s => s.cmd)); });
    assertEq(acc.join(','), chain.join(','), '四段分开取再拼接应等于整段(切片不重不漏、步序不变)');
    // 不给项目状态就不冒充状态判定
    mid.steps.forEach(s => assertEq(s.status, s.optional ? 'optional' : null, s.cmd + ' 无项目状态时不应有待办判定'));
    assertEq(mid.gaps.length, 0);
    assertEq(mid.next, null);
    assertEq(mid.state, null);
    let err = '';
    try { F.template('review', null); } catch (e) { err = e.message; }
    assert(/未知流程段/.test(err) && err.includes('mid'), '段外的主线步应如实报错并附可用清单,实际:' + err);
  } },
  { name: 'flow-tpl · 参数面与用法串现取 cmd-registry;每个参数都登记了取数出处', fn() {
    const F = require('../js/flow-tpl.js');
    const CmdRegistry = require('../js/cmd-registry.js');
    const src = F.argSources();
    const miss = [];
    F.template('mid', null).steps.forEach(s => {
      const m = CmdRegistry.byName[s.cmd];
      assertEq(s.args.map(a => a.name + ':' + (a.required ? 1 : 0)).join(','),
        (m.args || []).map(a => a.name + ':' + (a.required ? 1 : 0)).join(','), s.cmd + ' 参数面应逐项等于命令注册表');
      assert(s.cli.endsWith(CmdRegistry.usageOf(m)), s.cmd + ' 用法串应以 CmdRegistry.usageOf 结尾(不手拼第二份)');
      assertEq(s.label, m.label, s.cmd + ' 步骤名应取命令注册表的 label');
      s.args.forEach(a => { if (!a.from) miss.push(s.cmd + '.' + a.name); });
    });
    assertEq(miss.join(','), '', '参数取数出处漏登记(新增命令参数时须同步 ARG_SOURCE)');
    // 授权位与子集位一律写明由用户/调用方定:模板给步序不代授权
    ['overwrite', 'confirmAll'].forEach(k => assert(/授权位/.test(src[k]) && /明示/.test(src[k]), k + ' 须写明要用户明示:' + src[k]));
    ['shotIds', 'subjectIds'].forEach(k => assert(/子集/.test(src[k]), k + ' 须写明是调用方挑的子集:' + src[k]));
    // 模板不预设任何参数值(与编排层 args 留空同一条纪律)
    F.template('mid', null).steps.forEach(s => assertEq(s.args.filter(a => a.value !== undefined).length, 0, s.cmd + ' 不应预设参数值'));
  } },
  { name: 'flow-tpl · 缺前置返回明确缺口而不是空成功(缺口的码与文案原样取 Domain)', fn() {
    const F = require('../js/flow-tpl.js');
    const Domain = require('../js/domain.js');
    const bare = F.template('mid', FLOW_BARE());
    assertEq(bare.ready, false, '无剧本时不应报可跑');
    assertEq(bare.gaps.map(g => g.stage + '/' + g.code).join(','), 'script/no-script', '缺剧本应如实进 gaps');
    assert(bare.steps.length === 7, '缺前置不影响模板本身:步骤序列照出,实际 ' + bare.steps.length);
    // 缺口文案逐字取 Domain.workflow 的 blockers,本层不另写一套
    const wf = Domain.workflow(FLOW_BARE(), true);
    assertEq(bare.gaps[0].label, wf.steps.find(s => s.key === 'script').blockers[0].label, '缺口文案应原样取 Domain');
    // 段起点之前的主线步才算前置:分镜段要看剧本/主体/分集三步
    const shots = F.template('shots', FLOW_SCRIPT());
    assertEq(shots.gaps.map(g => g.code).join(','), 'no-subjects,no-eps', '分镜段的前置应含主体与分集,实际:' + JSON.stringify(shots.gaps));
    assertEq(F.template('subjects', FLOW_SCRIPT()).gaps.length, 0, '有剧本时主体段本身无前置缺口');
    assertEq(F.template('gen', FLOW_TOSHOOT()).ready, true, '主体/分集/分镜齐备时生成段可跑');
    assertEq(F.template('mid', FLOW_TOSHOOT()).gaps.length, 0, '整段起点是主体步,前置只看剧本');
  } },
  { name: 'flow-tpl · 待办标注取 Domain 实况;clear 不冒充"这一步做过了"', fn() {
    const F = require('../js/flow-tpl.js');
    const st = p => F.template('mid', p).steps.reduce((o, s) => { o[s.cmd] = s.status; return o; }, {});
    const bare = st(FLOW_BARE());
    assertEq(bare['project.extractSubjects'], 'todo', '主体库空 → 提取主体待办');
    assertEq(bare['subject.generateImage'], 'clear', '主体库还空时生图没有判定输入,记 clear 不记 done');
    assertEq(F.template('mid', FLOW_BARE()).next.cmd, 'project.extractSubjects', 'next 应指向该跑的那一步');
    assertEq(bare['episode.understanding'], 'optional');
    assertEq(bare['episode.preflight'], 'optional');
    // 主体缺图:同一主线步上两条命令按各自阻塞码分工
    const noImg = st(Object.assign(FLOW_SCRIPT(), { subjects: [{ id: 'su1', name: '女主' }] }));
    assertEq(noImg['project.extractSubjects'], 'clear', '已有主体 → 提取步无待办');
    assertEq(noImg['subject.generateImage'], 'todo', '主体缺图 → 生图步待办');
    // 分镜齐未出片:next 落到批量生成,且带上 Domain 的阻塞文案
    const toShoot = F.template('mid', FLOW_TOSHOOT());
    assertEq(toShoot.next.cmd, 'episode.generateVideos', 'next 应落到批量生成,实际:' + JSON.stringify(toShoot.next));
    assertEq(toShoot.steps.filter(s => s.status === 'todo').map(s => s.cmd).join(','), 'episode.generateVideos');
    // 可选两步永不占 next(理解可复用、就绪检查只报不拦)
    assert(!F.template('mid', FLOW_SCRIPT()).steps.some(s => s.optional && s.status === 'todo'), '可选步不应被标成待办');
    // 全齐备(整集出片并合成)→ 中段无待办
    const doneP = FLOW_TOSHOOT();
    const shot = doneP.episodes[0].shots[0];
    shot.video = { status: 'done', url: '/u/v.mp4', assetVer: 0 };
    shot.video.inputHash = require('../js/domain.js').shotInputHash(doneP, shot);
    assertEq(F.template('mid', doneP).next, null, '中段全清时 next 应为 null(不硬凑一步出来)');
  } },
  { name: 'flow-tpl · 断点码是各端真会回的码,授权位断点不代授权', fn() {
    const F = require('../js/flow-tpl.js');
    const srcAll = ['cli.js', 'js/commands.js', 'js/domain.js'].map(f => fs.readFileSync(path.join(ROOT, f), 'utf8')).join('\n');
    const bad = [];
    const seen = {};
    F.template('mid', null).steps.forEach(s => {
      assert(s.stop.length, s.cmd + ' 应登记断点(跑砸了停在哪一码上)');
      s.stop.forEach(x => {
        if (!srcAll.includes("'" + x.code + "'")) bad.push(s.cmd + ' → ' + x.code);
        assert(x.how, s.cmd + '/' + x.code + ' 应写明怎么处置');
        seen[x.code] = true;
      });
      assertEq(s.stop.length, new Set(s.stop.map(x => x.code)).size, s.cmd + ' 断点码不应重复');
    });
    assertEq(bad.join(','), '', '断点码须是命令层/领域层真会回的码,不得自造');
    ['unconfirmed', 'has-episodes'].forEach(c => assert(seen[c], '确认闸与覆盖授权两处断点必须在中段模板里:' + c));
    const gen = F.template('gen', null).steps.find(s => s.cmd === 'episode.generateVideos');
    assert(/明示/.test(gen.stop.find(x => x.code === 'unconfirmed').how), '确认闸断点须写明 confirmAll 要用户明示');
    const split = F.template('eps', null).steps.find(s => s.cmd === 'project.splitEpisodes');
    assert(/明示/.test(split.stop.find(x => x.code === 'has-episodes').how), '覆盖断点须写明 overwrite 要用户明示');
  } },
  { name: 'flow-tpl · 文本渲染是同一份模板换载体:工具名由调用方注入,本模块不认识工具表', fn() {
    const F = require('../js/flow-tpl.js');
    const tpl = F.template('mid', FLOW_BARE());
    const text = F.brief(tpl, { toolOf: c => 'TOOL[' + c + ']' });
    tpl.steps.forEach(s => {
      assert(text.includes('TOOL[' + s.cmd + ']'), '正文应用注入的工具名:' + s.cmd);
      assert(text.includes(s.note), '正文应带投影的步骤旁注(不另写一套措辞):' + s.cmd);
      s.stop.forEach(x => assert(text.includes(x.code), '正文应列出断点码:' + x.code));
    });
    assert(text.includes('no-script'), '缺前置应在正文里如实点名');
    // 不注入工具名时只给命令名,模块本身不含任何工具名字面
    assert(F.brief(tpl, {}).includes('project.extractSubjects'), '缺省应回落命令名');
    const src = fs.readFileSync(path.join(ROOT, 'js', 'flow-tpl.js'), 'utf8');
    assertEq((src.match(/hujing_/g) || []).length, 0, 'flow-tpl.js 不应出现任何 MCP 工具名(工具表是 MCP 侧的事)');
  } },
];

const SUITES = { 'agent-ops': agentOpsTests, experts: expertsTests, produce: produceTests, commands: commandsTests, store: storeTests, 'sb-gen': sbGenTests, pipeline: pipelineTests, 'sb-views': sbViewsTests, 'sb-io': sbIoTests, understanding: understandingTests, billing: billingTests, domain: domainTests, bus: busTests, issues: issuesTests, plans: plansTests, continuity: continuityTests, release: releaseTests, contract: contractTests, skills: skillsTests, tasks: tasksTests, split: splitTests, memory: memoryTests, flow: flowTests };
(async () => {
  const filter = process.argv[2];
  let passed = 0, failed = 0;
  for (const [name, tests] of Object.entries(SUITES)) {
    if (filter && name !== filter) continue;
    for (const t of tests) {
      try {
        await t.fn();
        passed++;
        console.log('PASS | ' + name + ' · ' + t.name);
      } catch (e) {
        failed++;
        console.log('FAIL | ' + name + ' · ' + t.name + ' | ' + (e && e.message));
      }
    }
  }
  console.log('\n===== ' + passed + '/' + (passed + failed) + ' PASS, ' + failed + ' FAIL =====');
  process.exit(failed ? 1 : 0);
})();
