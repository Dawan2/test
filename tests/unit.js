#!/usr/bin/env node
/* ============ tests/unit.js 卫星文件单元测试(零依赖 Node:vm 沙箱 + 浏览器全局 stub) ============
 * 覆盖大文件拆分产出的领域文件 + 服务端计费核心:
 *   js/agent-ops.js —— ops 应用器/执行闭环验证/预排钳制/上下文压缩/工作台定位/动作执行器
 *   js/experts.js   —— 预置专家库/雇佣·解雇/自进化计费五件套/工坊草稿规范化
 *   js/produce.js   —— 智能审片闭环(达标/重试/积分不足/超限)与一键成片编排顺序
 *   js/store.js     —— 三方合并/输入指纹迁移/合成快照/成片就绪/fileFavs 合并
 *   billing.js      —— 计费动作推导/校验 + 客户端 billingAction↔服务端端点兼容矩阵(九轮)
 * 方式:vm.createContext 构造沙箱(window/document/localStorage/Store/U/Tasks/API 等 stub),
 *      fs 读取真实源码 runInContext 加载,对 window.Xxx 暴露的成员做断言——被测代码即生产代码;
 *      billing.js 为纯模块直接 require(服务端与测试共享同一份推导逻辑)。
 * 用法:node tests/unit.js            全部套件
 *      node tests/unit.js agent-ops  单套件(agents-ops|experts|produce|store|billing)
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

/* ---------- 沙箱构造:浏览器全局 + 公共 stub ---------- */
function makeSandbox() {
  const storage = {};
  const sb = {
    console,
    setTimeout, clearTimeout, setInterval, clearInterval,
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
  loadFile(sb, 'experts.js');
  return sb;
}

function loadProduce() {
  const sb = makeSandbox();
  installCommon(sb);
  Object.assign(sb.SB, {
    renderShots() {},
    composeVideo: (p, ep, main) => { sb.__called.push('composeVideo'); },
    batchGenVideos: async (p, ep, main, shots, opts) => { sb.__called.push('batchGenVideos'); shots.forEach(s => { s.video = { status: 'done', url: '/uploads/gen/new.mp4' }; }); },
  });
  /* autoSmartReview/oneClickProduce 的编排依赖 */
  sb.SBGen = {
    createShotVideo: async (p, ep, s, main, skip) => { sb.__called.push('createShotVideo'); s.video = { status: 'done', url: '/uploads/gen/regen.mp4' }; },
    batchGenVideos: sb.SB.batchGenVideos,
  };
  sb.Review = {
    reviewShot: async (p, ep, s) => {
      sb.__called.push('reviewShot');
      const seq = sb.__reviewSeq && sb.__reviewSeq[s.id];
      if (seq) { const n = sb.__reviewCalls[s.id] || 0; sb.__reviewCalls[s.id] = n + 1; return { score: seq[Math.min(n, seq.length - 1)] }; }
      return sb.__reviewResult === undefined ? { score: 8 } : sb.__reviewResult;
    },
  };
  loadFile(sb, 'produce.js');
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
  { name: 'compactShots:超长分镜表截断到 6000 字上限并标注总数', fn() {
    const AO = loadAgentOps().AgentOps;
    const ep = { shots: [], sbConfig: {} };
    for (let i = 0; i < 60; i++) ep.shots.push(makeShot(i, { plot: '剧情'.repeat(20) })); // 每条~140字,60条超上限
    ep.shots[0].cameraSpec = { view: '正面', angle: '平视', shotSize: '中景', aperture: 'ƒ/4' };
    const json = AO.compactShots(ep, 100); // maxShots 放开,保证 60 条全部参与再触发长度截断
    assert(json.includes('后续镜头截断,共60镜'), '应含截断标注');
    assert(json.length <= 6100, '截断后不应超过上限+标注');
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
  { name: 'execPrearr:入口缺失返回 false 并提示;无可生成镜头返回 false', fn: async () => {
    const sb = loadAgentOps();
    const AO = sb.AgentOps;
    const p = { id: 'p1' };
    const ep = makeEp(); // 全部 done
    assertEq(AO.execPrearr({ p, ep }, { action: 'sb', params: {} }, null), false, '无按钮场景应 false');
    assert(sb.__toasts.some(t => t.includes('未找到智能分镜入口')), '应提示找不到智能分镜入口');
    sb.__toasts.length = 0;
    assertEq(AO.execPrearr({ p, ep }, { action: 'batchvideo', params: {} }, null), false, '全 done 应 false');
    assert(sb.__toasts.some(t => t.includes('所有分镜视频均已生成')), '应提示无可生成镜头');
  } },
  { name: 'runEpisodeActions:select 选中/goto 切视图/未注册动作跳过', fn() {
    const sb = loadAgentOps();
    const AO = sb.AgentOps;
    const p = { id: 'p1' };
    const ep = makeEp();
    const done = AO.runEpisodeActions(p, ep, [
      { op: 'select', shot: 2 },
      { op: 'goto', target: '分镜脚本' },
      { op: 'run', action: '不存在功能' },
    ], null);
    assertEq(ep.uiSel, 'sh1', 'select 应设置 uiSel');
    assertEq(sb.__epView, 'board', 'goto 分镜脚本应切 board 视图');
    assertEq(done.length, 2, '未注册动作应跳过');
    assert(done[0].includes('选中镜头 2'));
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
  { name: 'oneClickProduce:流水线顺序 批量生成→智能审片→合成', fn: async () => {
    const sb = loadProduce();
    const p = { id: 'p1' };
    const ep = makeEp({ shots: [makeShot(0), makeShot(1, { video: { status: 'none' } })] }); // 1 镜待生成
    sb.__reviewSeq = { sh0: [8], sh1: [8] };
    await sb.SB.oneClickProduce(p, ep, null);
    await sleep(30); // oneClickProduce 内部 run() 未被 confirm 回调 await,等微任务落定后再断言
    const pipeline = sb.__called.filter(c => ['batchGenVideos', 'reviewShot', 'composeVideo'].includes(c));
    assertEq(pipeline.indexOf('batchGenVideos') >= 0, true, '有待生成镜头应先批量生成');
    assert(pipeline.indexOf('batchGenVideos') < pipeline.indexOf('reviewShot'), '批量生成应先于审片');
    assert(pipeline.lastIndexOf('reviewShot') < pipeline.indexOf('composeVideo'), '审片应先于合成');
    assert(sb.__called.includes('createShotVideo') === false, '达标镜头不应触发重生成');
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

/* ================= 套件 4:store.js(_merge3 三方合并 / inputHash 迁移) ================= */
function loadStore() {
  const sb = makeSandbox();
  installCommon(sb);
  delete sb.Store; // installCommon 预置的 Store stub 让位给真实 store.js
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

/* ================= 运行器 ================= */
const SUITES = { 'agent-ops': agentOpsTests, experts: expertsTests, produce: produceTests, store: storeTests, billing: billingTests };
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
