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
 *      node tests/unit.js agent-ops  单套件(agent-ops|experts|produce|store|sb-gen|pipeline|sb-views|sb-io|understanding|billing|contract)
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
    sb.Store.state.agentMemory = [{ text: '用户偏好快节奏' }];
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
    sb.Store.state.agentMemory = [{ text: '记忆' }];
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
  /* project.splitEpisodes 的执行核心(真实实现 proj-upload.js splitCore;此处只验命令层闸门与回执结构) */
  sb.EpisodeUtil = {
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
  { name: 'preflight:result.checks 是剧本+主体+分集+分镜+成片字幕五面并集(按主线步序,摘任一面即红)', fn: async () => {
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
      'script.hookStrength,script.faceslapFour,script.dialogueRule,subjects.refIntegrity,subjects.crossShot,'
      + 'eps.structureStage,eps.payoffPoint,shots.sizeProgression,film.subtitleQC',
      'result.checks 应是五面并集,按主线步序 script → subjects → eps → shots → film');
    const cap = checks.find(x => x.skill === 'film.subtitleQC');
    assert(cap, '就绪检查必须消费成片字幕面(film 面被摘掉则本条红)');
    assertEq(cap.id, 'film.subtitleTiming', '字幕面结论应带实现 id');
    assertEq(cap.pass, false); assertEq(cap.level, 'fail', '烧录字幕超硬上限=合成必丢字,判 fail');
    assertEq(cap.hits.map(h => h.code + '@' + h.order).join(','), 'caption-truncated@1', '命中应逐段定位到镜号');
    assertEq(cap.hits[0].limit, 120, 'hit 应带硬上限口径(Domain.SUB_BURN_MAX)');
    /* 与直接跑五面逐字节一致:命令层不得对某一面做二次过滤/降级/改序(沙箱无 Media,ck.online=false) */
    const ck = { online: false };
    const direct = sb.Skills.check('script', { p, ep }, ck)
      .concat(sb.Skills.check('subjects', { p, ep }, ck), sb.Skills.check('eps', { p, ep }, ck),
        sb.Skills.check('shots', { p, ep }, ck), sb.Skills.check('film', { p, ep }, ck));
    assertEq(JSON.stringify(checks), JSON.stringify(direct), 'result.checks 应逐字节等于五面直跑结果的并集');
    assertEq(r.ok, true); assertEq(r.status, 'ready', '字幕面 fail 只报不拦,不改就绪判定');
    assert(!(r.result.blockers || []).some(b => /字幕/.test(b.label || '')), '字幕结论不得混进 Domain 阻塞项');
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
/* 齐备分集夹具:全 done+确认+已审高分+成片就绪(无问题基准) */
function cleanEp(over) {
  const s = { id: 'sh0', order: 0, name: '', plot: 'p', prompt: 'q', camera: '固定镜头', duration: 5, characters: [], scene: '', props: [], confirm: true, video: { status: 'done', url: 'http://x/v.mp4' } };
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
  { name: 'collect:素材更新过期镜(assetVer 抬升)→ stale-shots 带镜头号', fn() {
    const sb = loadIssues();
    const ep = cleanEp({ shots: [Object.assign({}, cleanEp().shots[0], { characters: ['主角'], video: { status: 'done', url: 'http://x/v.mp4', assetVer: 1 } })], composed: false });
    const p = { id: 'p1', subjects: [{ id: 'sj1', name: '主角', kind: 'character', image: 'u', imgVer: 2 }], episodes: [ep] };
    const it = sb.Issues.collect(p).find(x => x.kind === 'stale-shots');
    assert(it, '主体图更新后旧成片应判过期');
    assertEq(it.sev, 'mid');
    assert(it.detail.includes('镜头 1'), '过期镜号应入明细');
  } },
];

/* ================= 套件 14:plans.js(持久计划,第三阶段) ================= */
function loadPlans() {
  const sb = makeSandbox();
  installCommon(sb);
  sb.Commands = {
    list: () => [{ name: 'episode.generateStoryboard' }, { name: 'episode.generateVideos' }, { name: 'episode.compose' }, { name: 'episode.produce' }],
    execute: async (name, args) => { sb.__cmdCalls.push({ name, args }); return sb.__cmdResult || { ok: true, status: 'done', result: {} }; },
  };
  sb.__cmdCalls = [];
  loadFile(sb, 'domain.js');
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
    const sb1 = pl.steps.find(s => s.epid === 'ep1');
    assertEq(sb1.cmd, 'episode.generateStoryboard', '未拆镜集应映射智能分镜命令');
    const gen = pl.steps.find(s => s.epid === 'ep2');
    assertEq(gen.cmd, 'episode.generateVideos', '有失败镜集应映射批量生成(失败镜在 pend 集合内)');
    assert(pl.steps.every(s => s.status === 'pending'), '新计划步骤应全部 pending');
    assertEq(sb.Plans.summary(p), null, '未落库前项目无计划');
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
    assertEq(pl.steps[0].goto !== undefined, true, '步骤 0 应为导航类(补图)');
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
    const p = { id: 'p1', subjects: [{ id: 'sj1', name: '主角', image: '' }], episodes: [{ id: 'ep1', title: '第一集', content: '剧本', shots: [] }] };
    sb.Plans.replace(p, sb.Plans.fromWorkflow(p));
    sb.__cmdResult = { ok: false, status: 'failed', error: { code: 'gen', message: '上游失败' } };
    await sb.Plans.runAll(p, null);
    assertEq(p.agentPlan.steps[0].status, 'done', '导航步骤(补图)应到位即 done');
    assertEq(sb.__cmdCalls.length, 1, '首步失败后应停止,不继续执行后续步骤');
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
    assertEq(Skills.block('shots', { ids: ['shots.shotLanguage'] }), KB.pick('景别运镜', '轴线匹配'), '分镜注入块应逐字节等于 KB 条目拼接');
    assertEq(Skills.block('review'), KB.reviewBlock(), '审片注入块应逐字节等于 KB.reviewBlock()');
    const src = fs.readFileSync(path.join(ROOT, 'js', 'skills.js'), 'utf8');
    // 加载期依赖只有 KB 与 Domain 两件双端纯模块;WfCore 以解析器形态传入(浏览器里它晚于本文件加载)
    const iBody = src.indexOf('function (KB, Domain, wfCore) {');
    assert(iBody > 0, 'skills.js factory 签名应为 (KB, Domain, wfCore)');
    const body = src.slice(iBody); // 只查 factory 体(UMD 头与文件头注释不计)
    ['window', 'Store', 'document', 'location', 'fetch'].forEach(w => assert(!body.includes(w), 'skills.js 模块体不得出现环境句柄:' + w));
    // WfCore 只在校验项体内现解析,不在模块顶层绑定(否则浏览器加载顺序上取到 undefined)
    assertEq((body.match(/wfCore\(\)/g) || []).length, 1, 'WfCore 应只在用到它的校验项里现解析一次');
    assert(!/^\s*const \w+ = wfCore\(\)/m.test(body.slice(0, body.indexOf("CHECKS['"))), 'skills.js 不得在模块顶层解析 WfCore');
    // 编排型步骤只引用已注册命令(playbook 不内联新命令语义)
    const names = require('../js/cmd-registry.js').names();
    const orch = Skills.list().filter(s => s.kinds.includes('orchestrate') && !s.pending.includes('orchestrate'));
    assert(orch.length >= 3, '编排面已落地的条目不应少于 3 条(主线前段/审片修订闭环/一键成片投影)');
    assertEq(Skills.playbooks().map(p => p.id).join(','), orch.map(s => s.id).join(','), 'playbooks() 应投影全部已落地编排条目');
    orch.forEach(s => {
      const pb = Skills.playbook(s.id);
      assert(pb && pb.steps.length, s.id + ' 应有 playbook 步骤');
      pb.steps.forEach(st => assert(names.includes(st.cmd), s.id + ' 步骤命令未注册:' + st.cmd));
    });
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
    // 四类既有单源键全覆盖:KB 17 条 / Prompts 6 key / 命令 11 条 / 专家 16 位(新增单源键必须进索引)
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
    // 注入面未落地(如 tplVideo 零消费)的条目不进拼块
    const KB = require('../js/knowledge.js');
    assertEq(Skills.block('gen'), '', '生成步注入面待 G-05 定性,现不产出拼块');
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
  { name: '知识库取用:拆镜人设整条注入景别运镜+轴线匹配正文(按键取用后正文不缩水)', fn() {
    const KB = require('../js/knowledge.js');
    const WfCore = require('../js/wf-core.js');
    const sys = WfCore.sbSystem({});
    assert(sys.includes(KB.section('景别运镜')) && sys.includes(KB.section('轴线匹配')), '拆镜系统人设应含两条目正文');
    assert(sys.startsWith(require('../js/prompts.js').get('sb.system', {})), '拆镜人设应以 sb.system 提示词开头(注册表覆盖生效)');
  } },
  { name: '审片升为主线一等步骤(G-03):板块 Agent 有审片席;plans/工作区/CLI 都映射 episode.smartReview', fn() {
    const D = require(path.join(ROOT, 'js/domain.js'));
    const mains = D.workflow({ id: 'p1', episodes: [], subjects: [] }, true).steps.filter(s => !s.side).map(s => s.key);
    assertEq(mains.indexOf('review'), mains.indexOf('gen') + 1, 'review 应紧随 gen');
    assertEq(mains.indexOf('film'), mains.indexOf('review') + 1, 'film 应紧随 review');
    const ag = fs.readFileSync(path.join(ROOT, 'js/agent.js'), 'utf8');
    const keys = (ag.match(/\{ key: '([^']+)', ico:/g) || []).map(m => m.replace(/.*key: '([^']+)'.*/, '$1'));
    assertEq(keys.join(','), '导演,剧本,主体,分集,分镜,生成,审片,成片', 'AGENT_BOARDS 应含审片板块且落在生成与成片之间');
    const pl = fs.readFileSync(path.join(ROOT, 'js/plans.js'), 'utf8');
    assert(/rv:.*cmd: 'episode\.smartReview'/.test(pl), 'plans 审片步骤应映射已注册命令(headless 可执行)');
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
/* 分镜景别夹具:只摆景别(级差判定只看 cameraSpec.shotSize;传 undefined 即该镜没填景别) */
const sizeShot = (order, shotSize) => ({ id: 'sh' + order, order, cameraSpec: shotSize === undefined ? {} : { shotSize } });
const linkOf = shots => Skills.check('shots', { p: { id: 'p1' }, ep: { id: 'ep1', shots } }).find(x => x.skill === 'shots.sizeProgression');
const sizes = (...list) => linkOf(list.map((x, i) => sizeShot(i, x)));
/* 成片字幕夹具:镜头缺省带分镜图(进得了合成序列),段时长由 Domain.subtitleSegs 按预估/裁剪推出,用例只摆内容 */
const capShot = (order, over) => Object.assign({ id: 'sh' + order, order, dialogue: '', narration: '', image: '/uploads/a/f' + order + '.png' }, over || {});
const capEp = (shots, over) => Object.assign({ id: 'ep1', sbConfig: { subtitle: true }, shots }, over || {});
const caption = ep => Skills.check('film', { p: { id: 'p1' }, ep }, { online: true }).find(x => x.skill === 'film.subtitleQC');
/* 剧本段夹具:正文一律 ≥30 字(短于此的片段不产出结论);BG 是无台词无冲突信号的背景铺陈填充 */
const BG = '江城的春天多雨。'.repeat(20); // 160 字,开篇窗口(120)之外才出现冲突信号
const scriptEp = (content, shots) => ({ id: 'ep1', title: '第一集', content, shots: shots || [] });
const scriptCheck = (skill, ep, p) => Skills.check('script', { p: p || { id: 'p1' }, ep }).find(x => x.skill === skill);
const hookOf = (ep, p) => scriptCheck('script.hookStrength', ep, p);
const slapOf = ep => scriptCheck('script.faceslapFour', ep);
const lineOf = ep => scriptCheck('script.dialogueRule', ep);
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
    assertEq(empty.length, 3, '剧本步现有三条已落地校验项');
    assertEq(empty.filter(x => x.level === 'info' && !x.hits.length).length, 3, '无判定输入时三条一律不产出命中');
  } },
  { name: '剧本段消费点:就绪检查按主线步序附结论 + 问题中心低危(不改门禁、不新增计费)', fn() {
    const conc = Skills.check('script', { p: { id: 'p1' }, ep: scriptEp(BG) });
    assertEq(conc.map(x => x.skill).join(','), 'script.hookStrength,script.faceslapFour,script.dialogueRule', '剧本面三条已落地校验项');
    assertEq(conc.map(x => x.id).join(','), 'script.openingHookAnchor,script.faceslapStepOrder,script.dialogueLineLength', '结论应同时给实现 id 与能力 id');
    [['js/commands.js', fs.readFileSync(path.join(ROOT, 'js', 'commands.js'), 'utf8')], ['cli.js', fs.readFileSync(path.join(ROOT, 'cli.js'), 'utf8')]].forEach(([f, src]) => {
      assert(/Skills\.check\('script'/.test(src), f + ' 就绪检查应跑剧本面校验项');
      assert(src.indexOf("Skills.check('script'") < src.indexOf("Skills.check('subjects'"), f + ' 结论应按主线步序排列(剧本在主体之前)');
    });
    const isrc = fs.readFileSync(path.join(ROOT, 'js', 'issues.js'), 'utf8');
    assert(/Skills\.check\('script'/.test(isrc), '问题中心应复用同一校验项,不写第二份判定');
    assert(isrc.includes("kind: 'script-craft', sev: 'low'"), '剧本方法论提醒须挂低危(发布门 G2 只数高/中危)');
    // 审片报告与发布门的方法论维度仍是 G-10,条目不得挂未接的命令面
    ['script.hookStrength', 'script.faceslapFour'].forEach(id => {
      assert(Skills.byId(id).gaps.includes('G-10'), id + ' 的审片/发布门维度仍待 G-10');
      assert(!Skills.byId(id).cmds.includes('episode.smartReview'), id + ' 不得挂未接的审片命令面');
    });
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
    assertEq(Skills.check('subjects', { p, s: refShot(1, { characters: ['林小满'] }) })[0].hits.length, 0, '镜级入口只判传入的那一镜');
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
    [['js/commands.js', cmdSrc], ['cli.js', cliSrc]].forEach(([f, src]) => {
      assert(/Skills\.check\('subjects'/.test(src), f + ' 就绪检查应跑主体面校验项');
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
    assertEq(conc.map(x => x.skill).join(','), 'subjects.refIntegrity,subjects.crossShot', '主体面现有两条已落地校验项(完备性 + 一致性)');
    assertEq(conc[1].id, 'subjects.crossShotConsistency', '结论应同时给实现 id 与能力 id');
    const isrc = fs.readFileSync(path.join(ROOT, 'js', 'issues.js'), 'utf8');
    assert(/Skills\.check\('subjects'/.test(isrc), '问题中心应复用同一校验项,不写第二份判定');
    assert(isrc.includes("kind: 'subject-inconsistent', sev: 'low'"), '一致性提醒须挂低危');
    const rsrc = fs.readFileSync(path.join(ROOT, 'js', 'release.js'), 'utf8');
    assert(/x\.sev === 'high' \|\| x\.sev === 'mid'/.test(rsrc), '发布门 G2 只数高/中危 —— 低危提醒不改门禁状态');
    ['episode.generateVideos', 'shot.generateVideo'].forEach(n => assert(!Skills.byId('subjects.crossShot').cmds.includes(n), '生成侧消费待 G-06,条目不得挂未接的命令面:' + n));
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
    assertEq(Skills.check('shots', { p: { id: 'p1' }, s: sizeShot(0, '中景') })[0].hits.length, 0, '镜级入口无相邻输入');
    assertEq(Skills.check('shots', {}).length, 1, '分镜步现有一条已落地校验项');
  } },
  { name: 'sizeLinkage:纯函数(不改入参、同输入同结论)', fn() {
    const shots = [sizeShot(0, '中景'), sizeShot(1, '中景'), sizeShot(2, '中景'), sizeShot(3, '大全景')];
    const snap = JSON.stringify(shots);
    assertEq(JSON.stringify(linkOf(shots)), JSON.stringify(linkOf(shots)), '同输入应给同结论(无隐藏状态)');
    assertEq(JSON.stringify(shots), snap, '校验项不得改动领域对象');
  } },
  { name: 'sizeLinkage:消费点——就绪检查双端按步序附结论 + 问题中心低危(不改门禁、不新增计费)', fn() {
    [['js/commands.js', fs.readFileSync(path.join(ROOT, 'js', 'commands.js'), 'utf8')], ['cli.js', fs.readFileSync(path.join(ROOT, 'cli.js'), 'utf8')]].forEach(([f, src]) => {
      assert(/Skills\.check\('shots'/.test(src), f + ' 就绪检查应跑分镜面校验项');
      assert(src.indexOf("Skills.check('subjects'") < src.indexOf("Skills.check('shots'"), f + ' 结论应按主线步序排列(主体在分镜之前)');
      assert(src.indexOf("Skills.check('shots'") < src.indexOf("Skills.check('film'"), f + ' 结论应按主线步序排列(分镜在成片之前)');
    });
    const isrc = fs.readFileSync(path.join(ROOT, 'js', 'issues.js'), 'utf8');
    assert(/Skills\.check\('shots'/.test(isrc), '问题中心应复用同一校验项,不写第二份判定');
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
    [['js/commands.js', 'js'], ['cli.js', '']].forEach(([f]) => {
      const src = fs.readFileSync(path.join(ROOT, f), 'utf8');
      assert(/Skills\.check\('film'/.test(src), f + ' 就绪检查应跑成片字幕面校验项');
    });
    const isrc = fs.readFileSync(path.join(ROOT, 'js', 'issues.js'), 'utf8');
    assert(/Skills\.check\('film'/.test(isrc), '问题中心应复用同一校验项,不写第二份判定');
    assert(isrc.includes("kind: 'caption-unreadable', sev: 'low'"), '字幕提醒须挂低危');
    const rsrc = fs.readFileSync(path.join(ROOT, 'js', 'release.js'), 'utf8');
    assert(/x\.sev === 'high' \|\| x\.sev === 'mid'/.test(rsrc), '发布门 G2 只数高/中危 —— 低危提醒不改门禁状态');
    assertEq(require('../js/cmd-registry.js').byName['episode.preflight'].risk, 'read', '就绪检查应仍是 read 类零计费');
    const sk = Skills.byId('film.subtitleQC');
    assertEq(sk.pending.length, 0, '校验面已落地,不应再挂 pending');
    assertEq(sk.checks.join(','), 'film.subtitleTiming');
    assertEq(Skills.check('film', { p: { id: 'p1' }, ep: capEp([capShot(0, { dialogue: '走' })]) }).length, 1, '成片步现有一条已落地校验项');
  } },
  { name: '就绪检查校验面并集(源级):双端 preflight 段内 script/subjects/eps/shots/film 同在一条 checks 表达式,登记面无漏消费', fn() {
    /* 只断"文件里出现过 Skills.check('film'" 是有盲区的:算出来却不并进 result.checks 时照样通过。
     * 这里把断言收到 preflight 实现段内的那一条 checks 表达式上,并按登记侧反查有无漏消费的面。 */
    const consumers = Skills.list().filter(s => !s.pending.includes('check') && s.checks.length && s.cmds.includes('episode.preflight'));
    assert(consumers.some(s => s.stage === 'film'), '字幕面应登记 episode.preflight 为消费点');
    assert(consumers.some(s => s.stage === 'eps'), '分集面应登记 episode.preflight 为消费点');
    assert(consumers.some(s => s.stage === 'shots'), '分镜面应登记 episode.preflight 为消费点');
    [['js/commands.js', "reg('episode.preflight'", "reg('episode.generateStoryboard'"],
      ['cli.js', "EXEC['episode.preflight']", "EXEC['episode.generateVideos']"]].forEach(([f, from, to]) => {
      const src = fs.readFileSync(path.join(ROOT, f), 'utf8');
      const a = src.indexOf(from), b = src.indexOf(to);
      assert(a >= 0 && b > a, f + ' 应能定位到就绪检查实现段');
      const seg = src.slice(a, b);
      const i = seg.indexOf('const checks =');
      assert(i >= 0, f + ' 就绪检查段内应有 checks 汇总表达式');
      const expr = seg.slice(i, seg.indexOf(';', i) + 1);
      const at = st => expr.indexOf("Skills.check('" + st + "'");
      const order = ['script', 'subjects', 'eps', 'shots', 'film'];
      order.forEach(st => assert(at(st) > 0, f + ' checks 表达式应并入 ' + st + ' 面(只在段外调用不算消费)'));
      order.slice(1).forEach((st, k) => assert(at(order[k]) < at(st), f + ' 五面应按主线步序 ' + order.join(' → ') + ' 排列'));
      // 登记侧反查:凡登记了 episode.preflight 消费点的已落地校验条目,其所属面必须在这条表达式里(将来新增面漏接先红)
      consumers.forEach(s => assert(at(s.stage) > 0, f + ' 就绪检查漏消费已登记面:' + s.id + '(' + s.stage + ')'));
      assert(seg.includes('result: Object.assign({}, st, { checks })'), f + ' 五面并集应附在 result.checks(不并入 Domain 推导结果)');
    });
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
    [['js/commands.js', fs.readFileSync(path.join(ROOT, 'js', 'commands.js'), 'utf8')], ['cli.js', fs.readFileSync(path.join(ROOT, 'cli.js'), 'utf8')]].forEach(([f, src]) => {
      assert(/Skills\.check\('eps'/.test(src), f + ' 就绪检查应跑分集面校验项');
      assert(src.indexOf("Skills.check('subjects'") < src.indexOf("Skills.check('eps'"), f + ' 结论应按主线步序排列(分集在主体之后)');
    });
    const isrc = fs.readFileSync(path.join(ROOT, 'js', 'issues.js'), 'utf8');
    assert(/Skills\.check\('eps'/.test(isrc), '问题中心应复用同一校验项,不写第二份判定');
    assert(isrc.includes("kind: 'eps-structure', sev: 'low'") && isrc.includes("kind: 'eps-payoff', sev: 'low'"), '分集面提醒须挂低危(发布门 G2 只数高/中危)');
    // 审片报告与发布门的方法论维度仍是 G-10,条目不得挂未接的命令面
    ['eps.structureStage', 'eps.payoffPoint'].forEach(id => {
      assertEq(Skills.byId(id).pending.length, 0, id + ' 校验面已落地,pending 应清空');
      assert(Skills.byId(id).cmds.includes('episode.preflight'), id + ' 应记真实消费点');
      assert(!Skills.byId(id).cmds.includes('episode.smartReview'), id + ' 不得挂未接的审片命令面');
    });
    assert(Skills.byId('eps.payoffPoint').gaps.includes('G-10'), '卡点掐得准不准仍属审片维度,待 G-10');
  } },
];

/* ================= 套件 20:剧本拆集双端单源(wf-core split* + 服务端/CLI/浏览器接入,G-04) =================
 * 主线前段 headless 起点:模式判定与切分算法只此一份,浏览器/服务端/CLI 全部委托;正文逐字保留。 */
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
];

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
  { name: '协作记忆双端单源(源级):对话层/wf 端点/CLI 全部委托 WfCore,写入两端同结构同上限', fn() {
    const ag = fs.readFileSync(path.join(ROOT, 'js', 'agent.js'), 'utf8');
    const srv = fs.readFileSync(path.join(ROOT, 'server.js'), 'utf8');
    const cli = fs.readFileSync(path.join(ROOT, 'cli.js'), 'utf8');
    // 召回面:三端不得各抄一份算法
    assert(ag.includes('WfCore.memRecall(') && ag.includes('WfCore.memBlock('), 'agent.js 对话层应委托 WfCore 召回');
    assert(!/const scoped = mem\.filter/.test(ag), 'agent.js 不应再内联召回算法');
    assert((srv.match(/WfCore\.memBlock\(/g) || []).length >= 4, 'wf 工作流端点应按板块注入协作记忆(理解/分镜/审片/提取主体/Agent 对话)');
    assert(cli.includes('WfCore.memRecall('), 'CLI memory list --recall 应与注入侧同算法预览');
    // 写入面:CLI 与浏览器各写一份(注释已标注),字段集/截断/上限须一致——任一侧漂移此断言先红
    const fields = s => [...s.matchAll(/(\w+):/g)].map(m => m[1]).sort().join(',');
    const cliEntry = cli.match(/const entry = \{([^}]*)\};/);
    const agPush = ag.match(/mem\.push\(\{([^}]*)\}\);/);
    assert(cliEntry && agPush, '两端写入口的条目字面都应可定位');
    assertEq(fields(cliEntry[1]), 'scope,text,time', 'CLI memory add 条目字段集');
    assertEq(fields(agPush[1]), 'scope,text,time', '浏览器 memRemember 条目字段集应与 CLI 同集');
    assert(cliEntry[1].includes('slice(0, 120)') && agPush[1].includes('slice(0, 120)'), '两端都应截 120 字');
    assert(ag.includes('agentMemory = mem.slice(-50)') && cli.includes('mem.concat([entry]).slice(-50)'), '两端都应按最近 50 条截断');
  } },
];

const SUITES = { 'agent-ops': agentOpsTests, experts: expertsTests, produce: produceTests, commands: commandsTests, store: storeTests, 'sb-gen': sbGenTests, pipeline: pipelineTests, 'sb-views': sbViewsTests, 'sb-io': sbIoTests, understanding: understandingTests, billing: billingTests, domain: domainTests, bus: busTests, issues: issuesTests, plans: plansTests, continuity: continuityTests, release: releaseTests, contract: contractTests, skills: skillsTests, tasks: tasksTests, split: splitTests, memory: memoryTests };
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
