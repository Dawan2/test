/* ============ continuity.js 连续性管理(undo/redo + 跨Tab同步 + 崩溃恢复快照 + 版本号) ============
 * 四大能力:
 * 1. 全局 undo/redo 栈: Continuity.recordUndo(tag, {pid, epid, snapshotFn}) — tag 表示操作类型(script_edit / shot_edit / subject_edit / ep_meta)
 *    snapshotFn 返回要保存的快照(对象),栈深 UNDO_MAX=50,Ctrl+Z/Ctrl+Y 触发,还原时替换 p/ep 指定字段并重渲染,emit Bus 'continuity.undo' / 'continuity.redo'
 * 2. 跨 Tab BroadcastChannel('hujing-sync'):Store.save 后广播 {type:'save', pid, epid, __ver, userId};收到后判断是否同项目,静默刷新(Store.hydrate + Bus emit 'continuity.remote-save')
 * 3. 崩溃恢复快照:编辑操作调度 Continuity.scheduleSnapshot(p, epid) — debounce 800ms 写 IDB 的 'crsnap_'+uid+'_'+pid+'_'+epid
 *    项目打开时 Continuity.checkCrashRecovery(p) 查询 IDB 快照,若快照存在且 ts 大于 p.__lastSaved(或 p 无保存标记)则弹恢复提示"检测到未保存编辑,是否恢复?"
 *    恢复后写回 Store 并清快照,忽略则删快照
 * 4. 版本号 __ver:Store.save 前 p.__ver++(每项目独立),__ver 后端 compare API 也用同字段判冲突
 *    离线→在线登录后 Continuity.mergeConflict(p, remoteVer) 对比 p.__ver 与远端,不一致时调 diff 函数,Bus emit 'continuity.conflict' 开冲突弹窗
 *
 * 设计约束:
 * - 纯逻辑模块,不依赖 UI 渲染;只改 Store 状态 + 发 Bus 事件
 * - 所有写入失败静默降级(写 IDB 失败/ BroadcastChannel 不可用都不阻断主流程)
 * - undo/redo 的快照尽量小:只存被改动子对象(如 ep.content / ep.shots[shotIdx]),而非整个 p 深拷贝 */
(function () {
  const UNDO_MAX = 50;
  const SNAP_DEBOUNCE_MS = 800;
  const CHANNEL_NAME = 'hujing-sync';
  const SNAP_PREFIX = 'crsnap_';     // crsnap_<userId>_<pid>_<epid>

  /* ---------- 工具 ---------- */
  const uid = () => (typeof Store !== 'undefined' && Store.uid ? Store.uid('c') : ('c_' + Math.random().toString(36).slice(2, 10)));
  const deepClone = o => {
    if (o == null) return o;
    if (typeof o !== 'object') return o;
    if (Array.isArray(o)) return o.map(deepClone);
    const out = {};
    for (const k in o) out[k] = deepClone(o[k]);
    return out;
  };
  const userId = () => {
    try { return ((Store && Store.state && Store.state.user) || {}).id || 'local'; } catch (_) { return 'local'; }
  };
  const hasIDB = () => !!(window.IDB && typeof IDB.put === 'function' && IDB.ok);

  /* ---------- 1. undo / redo 栈 ---------- */
  /** 栈元素: {id, tag, pid, epid, path, before, after, at}  path 形如 'episodes.3.shots.7' 或 'script' 或 'subjects.2' */
  const undoStack = [];
  const redoStack = [];
  let recording = false;

  /** 外部在编辑开始前抓"前值",编辑完成后提交 recordUndo(before, after) */
  function capturePathValue(p, epid, path) {
    if (!p) return undefined;
    const parts = String(path || '').split('.').filter(Boolean);
    let node = p;
    for (let i = 0; i < parts.length; i++) {
      if (node == null) return undefined;
      const key = parts[i];
      if (key === 'epid') {
        if (!epid) return undefined;
        node = (p.episodes || []).find(e => e.id === epid);
      } else if (typeof node[key] !== 'undefined') {
        node = node[key];
      } else return undefined;
    }
    return deepClone(node);
  }
  function applyPathValue(p, epid, path, value) {
    if (!p || !path) return false;
    const parts = String(path).split('.').filter(Boolean);
    if (!parts.length) return false;
    let node = p;
    for (let i = 0; i < parts.length - 1; i++) {
      const key = parts[i];
      if (key === 'epid') {
        if (!epid) return false;
        node = (p.episodes || []).find(e => e.id === epid);
      } else {
        if (node[key] == null || typeof node[key] !== 'object') node[key] = {};
        node = node[key];
      }
      if (!node) return false;
    }
    const lastKey = parts[parts.length - 1];
    if (lastKey === 'epid') return false;
    node[lastKey] = deepClone(value);
    return true;
  }

  /** 记录一次可撤销操作。path: 'script' / 'subjects.<idx>' / 'epid.shots' / 'epid.shots.<idx>' / 'epid.content' 等 */
  function recordUndo(tag, opts) {
    if (!opts || !opts.pid || !opts.path || opts.before === undefined) return null;
    if (recording) return null;
    const entry = {
      id: uid(), tag: tag || 'edit',
      pid: opts.pid, epid: opts.epid || null,
      path: opts.path,
      before: opts.before, after: opts.after !== undefined ? opts.after : deepClone(opts.before),
      at: Date.now(),
    };
    undoStack.push(entry);
    if (undoStack.length > UNDO_MAX) undoStack.shift();
    redoStack.length = 0;     // 新记录清空 redo
    if (window.Bus) Bus.emit('continuity.undo-change', { pid: opts.pid, epid: opts.epid || null, canUndo: undoStack.length > 0, canRedo: false });
    return entry.id;
  }
  function canUndo() { return undoStack.length > 0; }
  function canRedo() { return redoStack.length > 0; }

  function _restore(entry, direction) {
    if (!window.Store) return false;
    const p = Store.getProject(entry.pid);
    if (!p) return false;
    const snapshot = direction === 'undo' ? entry.before : entry.after;
    const ok = applyPathValue(p, entry.epid, entry.path, snapshot);
    if (!ok) return false;
    p.__ver = (p.__ver || 0) + 1;
    Store.save();
    if (window.Bus) Bus.emit(direction === 'undo' ? 'continuity.undo' : 'continuity.redo',
      { pid: entry.pid, epid: entry.epid || null, tag: entry.tag, path: entry.path });
    return true;
  }
  function undo() {
    const e = undoStack.pop();
    if (!e) return false;
    recording = true;
    try {
      if (_restore(e, 'undo')) redoStack.push(e);
      else { recording = false; return false; }
    } finally { recording = false; }
    if (window.Bus) Bus.emit('continuity.undo-change', { pid: e.pid, epid: e.epid, canUndo: canUndo(), canRedo: canRedo() });
    return true;
  }
  function redo() {
    const e = redoStack.pop();
    if (!e) return false;
    recording = true;
    try {
      if (_restore(e, 'redo')) undoStack.push(e);
      else { recording = false; return false; }
    } finally { recording = false; }
    if (window.Bus) Bus.emit('continuity.undo-change', { pid: e.pid, epid: e.epid, canUndo: canUndo(), canRedo: canRedo() });
    return true;
  }

  /* ---------- 2. 跨 Tab BroadcastChannel 同步 ---------- */
  let channel = null;
  let lastRemoteAt = 0;
  function channelInit() {
    if (channel) return;
    if (typeof BroadcastChannel === 'undefined') return;
    try {
      channel = new BroadcastChannel(CHANNEL_NAME);
      channel.onmessage = ev => {
        const msg = ev.data || {};
        if (!msg.type || msg.userId !== userId()) return;     // 非同账号不同步(多账号场景隔离)
        if (msg.origin && msg.origin === _selfOrigin) return; // 自己发的忽略
        lastRemoteAt = Date.now();
        if (msg.type === 'save') _handleRemoteSave(msg);
        else if (msg.type === 'ping' && window.Bus) Bus.emit('continuity.remote-ping', msg);
      };
    } catch (_) { channel = null; }
  }
  const _selfOrigin = 'tab_' + Math.random().toString(36).slice(2, 10);
  function _handleRemoteSave(msg) {
    if (!window.Store) return;
    if (typeof Store.loadSilent === 'function') Store.loadSilent(); // 静默刷新内存态
    if (window.Bus) Bus.emit('continuity.remote-save', { pid: msg.pid, epid: msg.epid || null, __ver: msg.__ver, origin: msg.origin });
    // 提示
    try {
      if (window.U && typeof U.toast === 'function' && msg.pid) {
        const p = Store.getProject(msg.pid);
        if (p) U.toast(`「${p.name}」已在其他标签页更新,本地已同步`, 'info', 2500);
      }
    } catch (_) {}
  }
  function broadcastSave(p, epid) {
    channelInit();
    if (!channel) return;
    try {
      const msg = { type: 'save', userId: userId(), pid: p && p.id, epid: epid || null, __ver: p && p.__ver, origin: _selfOrigin, at: Date.now() };
      channel.postMessage(msg);
    } catch (_) {}
  }
  function isRemoteJustUpdated(winMs) { return Date.now() - lastRemoteAt < (winMs || 1000); }

  /* ---------- 3. 崩溃恢复快照 ---------- */
  const snapTimers = {};  // key: pid+':'+epid → timeout id
  function snapKey(pid, epid) { return SNAP_PREFIX + userId() + '_' + pid + '_' + (epid || '__project__'); }
  function scheduleSnapshot(p, epid) {
    if (!p || !p.id) return;
    const key = p.id + ':' + (epid || '__project__');
    if (snapTimers[key]) clearTimeout(snapTimers[key]);
    snapTimers[key] = setTimeout(() => _writeSnapshot(p, epid), SNAP_DEBOUNCE_MS);
  }
  function _writeSnapshot(p, epid) {
    if (!hasIDB()) return;
    try {
      const snap = {
        pid: p.id, epid: epid || null,
        ts: Date.now(),
        userId: userId(),
        savedVer: p.__ver || 0,
        epidData: epid ? deepClone((p.episodes || []).find(e => e.id === epid)) : null,
        projectSnapshot: !epid ? deepClone(p) : null,  // 项目级改动才写整项目;分集级只写分集(小)
      };
      IDB.put(snapKey(p.id, epid), snap).catch(() => {});
      if (window.Bus) Bus.emit('continuity.snapshot-saved', { pid: p.id, epid: epid || null });
    } catch (_) {}
  }
  /** 删除快照(保存/放弃后调用) */
  function clearSnapshot(pid, epid) {
    if (!hasIDB()) return;
    IDB.del(snapKey(pid, epid)).catch(() => {});
  }
  /** 项目打开时检查崩溃快照;返回 Promise<null | {pid, epid, snap, p_current}>,由 UI 决定是否弹恢复 */
  async function checkCrashRecovery(p) {
    if (!p || !p.id) return null;
    if (!hasIDB()) return null;
    const keys = [snapKey(p.id, null)].concat((p.episodes || []).map(ep => snapKey(p.id, ep.id)));
    const snaps = [];
    await Promise.all(keys.map(async k => { try { const s = await IDB.get(k); if (s) snaps.push(s); } catch (_) {} }));
    if (!snaps.length) return null;
    // 过滤:快照 savedVer === p.__ver 且 p 有 __lastSaved 说明保存过,快照没用
    const fresh = snaps.filter(s => {
      if (s.savedVer < (p.__ver || 0)) return false;            // 快照版本比当前老,丢
      if (p.__lastSaved && s.ts < (p.__lastSaved || 0)) return false; // 快照时间早于上次保存时间,丢
      return true;
    });
    if (!fresh.length) { snaps.forEach(s => clearSnapshot(s.pid, s.epid)); return null; }
    return { pid: p.id, snaps: fresh, currentVer: p.__ver || 0, currentSaved: p.__lastSaved || 0 };
  }
  /** 应用恢复:把快照写回 Store,清快照 */
  async function applyRecovery(p, recovery) {
    if (!p || !recovery || !recovery.snaps) return 0;
    let applied = 0;
    for (const s of recovery.snaps) {
      if (s.epid) {
        const idx = (p.episodes || []).findIndex(e => e.id === s.epid);
        if (idx >= 0 && s.epidData) { p.episodes[idx] = deepClone(s.epidData); applied++; }
      } else if (s.projectSnapshot) {
        // 项目级:合并 episodes 之外的字段;episodes 保留当前(以免覆盖分集级已恢复)
        const curEps = p.episodes;
        Object.assign(p, s.projectSnapshot);
        if (curEps && curEps.length) p.episodes = curEps;
        applied++;
      }
      clearSnapshot(s.pid, s.epid);
    }
    if (applied) {
      p.__ver = (p.__ver || 0) + 1;
      if (window.Store && typeof Store.save === 'function') Store.save();
    }
    if (window.Bus) Bus.emit('continuity.recovery-applied', { pid: p.id, applied });
    return applied;
  }
  function discardRecovery(recovery) {
    if (!recovery || !recovery.snaps) return 0;
    recovery.snaps.forEach(s => clearSnapshot(s.pid, s.epid));
    if (window.Bus) Bus.emit('continuity.recovery-discarded', { pid: recovery.pid });
    return recovery.snaps.length;
  }

  /* ---------- 4. 版本号 / 冲突合并(离线→在线) ---------- */
  /** bumpVer:Store.save 前调用;幂等(一次 save 内多次只加一)——通过 p.__verStamp 判 */
  function bumpVer(p) {
    if (!p) return 0;
    const now = Date.now();
    if (p.__verStamp && now - p.__verStamp < 200) return p.__ver || 0; // 200ms 窗口内同一 save 不重复自增
    p.__verStamp = now;
    p.__ver = (p.__ver || 0) + 1;
    p.__lastSaved = now;
    return p.__ver;
  }
  /** 简单 diff:返回 [{path, local, remote, type:'changed'|'added'|'removed'}] (浅对比一层 + episodes 二级匹配 id) */
  function diff(localP, remoteP) {
    const changes = [];
    if (!localP || !remoteP) return changes;
    const topKeys = ['name', 'script', 'style', 'shell', 'subjects', 'plan', 'releases'];
    topKeys.forEach(k => {
      const a = JSON.stringify(localP[k]); const b = JSON.stringify(remoteP[k]);
      if (a !== b) changes.push({ path: k, local: localP[k], remote: remoteP[k], type: (a === undefined ? 'added' : b === undefined ? 'removed' : 'changed') });
    });
    const lEps = localP.episodes || []; const rEps = remoteP.episodes || [];
    lEps.forEach(ep => {
      const r = rEps.find(x => x.id === ep.id);
      if (!r) changes.push({ path: 'episodes.' + ep.id, local: ep, remote: undefined, type: 'removed' });
      else {
        const subs = ['title', 'content', 'shots', 'composed', 'composedSrt', 'lastReview'];
        subs.forEach(k => {
          const a = JSON.stringify(ep[k]); const b = JSON.stringify(r[k]);
          if (a !== b) changes.push({ path: 'episodes.' + ep.id + '.' + k, local: ep[k], remote: r[k],
            type: (a === undefined ? 'added' : b === undefined ? 'removed' : 'changed') });
        });
      }
    });
    rEps.forEach(ep => { if (!lEps.find(x => x.id === ep.id)) changes.push({ path: 'episodes.' + ep.id, local: undefined, remote: ep, type: 'added' }); });
    return changes;
  }
  /** 合并冲突:按 resolutions = [{path, choose:'local'|'remote'}] 逐项应用;返回成功合并数 */
  function resolveConflicts(p, remoteP, resolutions) {
    if (!p || !remoteP || !Array.isArray(resolutions)) return 0;
    let done = 0;
    resolutions.forEach(r => {
      const val = r.choose === 'remote' ? _readDot(remoteP, r.path) : _readDot(p, r.path);
      if (_writeDot(p, r.path, val)) done++;
    });
    if (done) bumpVer(p);
    return done;
  }
  function _readDot(obj, path) {
    const parts = String(path || '').split('.').filter(Boolean);
    let n = obj;
    for (let i = 0; i < parts.length; i++) {
      const k = parts[i];
      if (Array.isArray(n)) { const t = n.find(x => x && x.id === k); n = t; }
      else if (n && typeof n === 'object') n = n[k];
      else return undefined;
      if (n === undefined) break;
    }
    return n;
  }
  function _writeDot(obj, path, val) {
    const parts = String(path || '').split('.').filter(Boolean);
    if (!parts.length) return false;
    let n = obj;
    for (let i = 0; i < parts.length - 1; i++) {
      const k = parts[i];
      if (Array.isArray(n)) { const t = n.find(x => x && x.id === k); if (!t) return false; n = t; }
      else { if (!n || typeof n !== 'object') return false; if (n[k] == null) n[k] = (/\d/.test(parts[i + 1]) ? [] : {}); n = n[k]; }
    }
    const last = parts[parts.length - 1];
    if (Array.isArray(n)) {
      const idx = n.findIndex(x => x && x.id === last);
      if (val === undefined) { if (idx >= 0) { n.splice(idx, 1); return true; } return false; }
      if (idx >= 0) n[idx] = val; else n.push(val);
    } else if (n && typeof n === 'object') {
      if (val === undefined) delete n[last]; else n[last] = val;
    } else return false;
    return true;
  }

  /* ---------- 5. 后台任务自动续查:启动扫描最近 30 分钟未终态 jobs ---------- */
  async function resumeRecentTasks() {
    if (!window.API || typeof API.getJobs !== 'function') return 0;
    if (!window.Tasks || typeof Tasks.syncRunningFromServer !== 'function') return 0;
    try {
      const jobs = await API.getJobs({ limit: 50 });
      if (!jobs || !jobs.length) return 0;
      const running = jobs.filter(j => j.status === 'running' || j.status === 'needs_reconcile');
      if (!running.length) return 0;
      // 交给 Tasks.syncRunningFromServer 继续轮询
      Tasks.syncRunningFromServer(running);
      return running.length;
    } catch (_) { return 0; }
  }

  /* ---------- 6. 键盘快捷键绑定(Ctrl+Z / Ctrl+Y) ---------- */
  let _kbBound = false;
  function bindKeyboard() {
    if (_kbBound || typeof window === 'undefined' || !window.document) return;
    _kbBound = true;
    window.document.addEventListener('keydown', e => {
      // 输入框/文本域不拦截(避免冲突浏览器默认)
      const tag = (e.target && e.target.tagName || '').toLowerCase();
      const editable = tag === 'input' || tag === 'textarea' || tag === 'select' ||
        (e.target && e.target.isContentEditable);
      if (editable) return;
      const mod = e.ctrlKey || e.metaKey;
      if (!mod || e.altKey || e.shiftKey) return;
      if (e.key === 'z' || e.key === 'Z') { e.preventDefault(); undo(); }
      else if (e.key === 'y' || e.key === 'Y') { e.preventDefault(); redo(); }
    });
  }

  /* ---------- 导出 ---------- */
  window.Continuity = {
    // 1. undo/redo
    recordUndo, capturePathValue, canUndo, canRedo, undo, redo,
    // 2. 跨 Tab
    broadcastSave, isRemoteJustUpdated,
    // 3. 崩溃快照
    scheduleSnapshot, checkCrashRecovery, applyRecovery, discardRecovery, clearSnapshot,
    // 4. 版本与冲突
    bumpVer, diff, resolveConflicts,
    // 5. 任务续查
    resumeRecentTasks,
    // 6. 键盘
    bindKeyboard,
    // 常量(测试用)
    UNDO_MAX, SNAP_DEBOUNCE_MS, SNAP_PREFIX,
  };
  if (typeof window !== 'undefined') {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bindKeyboard);
    else bindKeyboard();
  }
})();
