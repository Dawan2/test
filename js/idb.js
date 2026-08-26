/* ============ idb.js IndexedDB 大对象存储(零依赖,两阶段提交) ============
 * state 中的大 dataURL(>64KB)本地持久化时替换为 'idb:<key>' 标记,原值存 IndexedDB:
 * localStorage 只留标记,配额压力解除;内存与云端同步始终是全量值(云端无配额限制,跨设备不破坏)。
 * 两阶段提交:标记只在对应键"已确认写入 IDB"后才落 localStorage——
 *   第一阶段 persist 时调度写入并保留原值;写入确认后(whenIdle 回调触发重写)才替换为标记。
 *   写失败进重试队列,原值始终留在 localStorage,断电/写失败最坏退化为全量落盘,不产生取不回的标记。
 * ok 标志:init 异步打开成功后置 true;受限环境(file:// 等打不开 IDB)保持 false,
 * 本地持久化自动退化为纯 JSON 全量落盘(不写标记,不会产生取不回的引用)。 */
(function () {
  const DB_NAME = 'mv_hujing_blobs';
  const STORE = 'blobs';
  const MARK = 'idb:';
  const THRESHOLD = 65536; // 64KB 以上的 data: 串才离线到 IDB
  let dbp = null;
  let ok = false;

  function open() {
    if (dbp) return dbp;
    dbp = new Promise((resolve, reject) => {
      try {
        const rq = indexedDB.open(DB_NAME, 1);
        rq.onupgradeneeded = () => { if (!rq.result.objectStoreNames.contains(STORE)) rq.result.createObjectStore(STORE); };
        rq.onsuccess = () => resolve(rq.result);
        rq.onerror = () => reject(rq.error || new Error('indexedDB open failed'));
        rq.onblocked = () => reject(new Error('indexedDB blocked'));
      } catch (e) { reject(e); }
    });
    return dbp;
  }

  /* 写入(失败向上抛,由 offload 决定重试/降级,不再静默吞错) */
  async function put(k, v) {
    const db = await open();
    await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put(v, k);
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error || new Error('tx abort'));
    });
  }

  function get(k) {
    return open().then(db => new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readonly');
      const rq = tx.objectStore(STORE).get(k);
      rq.onsuccess = () => resolve(rq.result);
      rq.onerror = () => reject(rq.error);
    })).catch(() => undefined);
  }

  function del(k) {
    return open().then(db => new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).delete(k);
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    })).catch(() => {});
  }

  /* 内容寻址键:全串双哈希(djb2+sdbm 64bit)+ 长度——替代旧采样哈希(每 7 字符采一字,
   * 大量 blob 时碰撞概率不可忽略,内容寻址键碰撞会造成串值);同值同键,重复离线幂等 */
  function keyOf(s) {
    let h1 = 5381, h2 = 52711;
    for (let i = 0; i < s.length; i++) {
      const c = s.charCodeAt(i);
      h1 = (h1 * 33 + c) >>> 0;
      h2 = (h2 * 31 + c) >>> 0;
    }
    return 'b_' + h1.toString(36) + '_' + h2.toString(36) + '_' + s.length.toString(36);
  }

  const pending = {};          // 在途写入
  const failed = {};           // 写入失败待重试(两阶段:失败键不落标记,原值留 localStorage)
  const FAILED_MAX = 50;       // R18:失败队列上限——IDB 持续不可写(配额/隐私模式)时不再无限囤积 dataURL 撑内存;
                               // 被挤出的键原值仍在 localStorage,下次 persist 的 markerReplacer 会自然重新调度,不丢数据
  const confirmed = new Set(); // 已确认写入 IDB 的键(仅确认键才允许替换为标记)
  let onIdleCb = null;         // "在途清零且又有新确认"时的持久回调(store 注册,重写标记版快照)
  let confirmedDirty = false;  // 上次回调后又有新确认键(无新增不空转重写)
  let openPending = true;      // open 未落定前视为在途(避免回调提前触发)

  function settle() {
    if (onIdleCb && !openPending && !Object.keys(pending).length && confirmedDirty) {
      confirmedDirty = false; // 先清标志防回调内再触发死循环
      try { onIdleCb(); } catch (_) { }
    }
  }
  /* 离线调度:同一键在途只写一次;完成入确认集并置脏(两阶段第一阶段) */
  function offload(key, val) {
    if (confirmed.has(key) || (key in pending)) return;
    pending[key] = 1;
    put(key, val)
      .then(() => { delete pending[key]; confirmed.add(key); confirmedDirty = true; settle(); })
      .catch(() => {
        delete pending[key];
        const ks = Object.keys(failed);
        if (ks.length >= FAILED_MAX) delete failed[ks[0]]; // R18:挤出最旧一条(其原值仍在 localStorage,下轮 persist 重调度)
        failed[key] = val; // 失败进重试队列,下一轮 persist 再试
      });
  }
  /* 重试失败写入(每次持久化开始时调用一次) */
  function beginPersist() {
    Object.keys(failed).forEach(k => { const v = failed[k]; delete failed[k]; offload(k, v); });
  }

  function isBig(v) { return typeof v === 'string' && v.length > THRESHOLD && v.startsWith('data:'); }

  /* JSON.stringify replacer:大 dataURL → 'idb:b_xxx' 标记(仅本地持久化路径使用)。
   * 两阶段提交:只有已确认写入 IDB 的键才替换为标记;未确认键保留原值并调度写入,
   * 确认后由 whenIdle 触发的重写落标记——localStorage 不会出现取不回的标记 */
  function markerReplacer(_k, v) {
    if (isBig(v)) {
      const key = keyOf(v);
      if (confirmed.has(key)) return MARK + key;
      offload(key, v);
      return v;
    }
    return v;
  }

  /* 注册"写入全部落定"持久回调:每当一批新写入确认完成(在途清零)即触发一次,
   * store 据此重写标记版快照——修复旧实现的一次性回调:新大对象首次保存时 IDB 写入成功
   * 但 marker 快照未再落盘,配额失败窗口内刷新会整对象丢失 */
  function onIdle(cb) { onIdleCb = cb; settle(); }

  /* 启动水合:递归把 state 中的标记还原为原值(首渲前调用一次;
   * 等待 open 落定再判可用,消除"ok 尚未置位即水合"的竞态;
   * 找不到原值的孤儿标记置空串(不再原样保留,防其作为路径送入上游/FFmpeg),不阻断启动) */
  async function hydrate(obj) {
    if (!obj || typeof obj !== 'object') return 0;
    try { await open(); } catch (_) { return 0; } // 受限环境打不开:整体跳过(ok=false,持久化本就不写标记)
    const hits = [];
    (function walk(node) {
      if (!node || typeof node !== 'object') return;
      if (Array.isArray(node)) { node.forEach(walk); return; }
      for (const k in node) {
        const v = node[k];
        if (typeof v === 'string' && v.startsWith(MARK)) hits.push([node, k, v]);
        else if (v && typeof v === 'object') walk(v);
      }
    })(obj);
    if (!hits.length) return 0;
    const cache = {};
    await Promise.all([...new Set(hits.map(h => h[2].slice(MARK.length)))].map(async key => { cache[key] = await get(key); }));
    let n = 0;
    hits.forEach(([node, k, v]) => {
      const val = cache[v.slice(MARK.length)];
      if (val !== undefined) { node[k] = val; n++; confirmed.add(v.slice(MARK.length)); } // 七轮:水合成功的键入确认集——刷新后不再重写 IDB/重跑落定回调
      else node[k] = '';
    });
    return n;
  }

  /* R18 引用清扫(标记-清扫):内容寻址键同值同键,store 侧收集当前仍被引用的键集,
   * 删项目/镜头/清空回收站后遗留在 IDB 的孤儿 blob 在此回收。keep 之外的键一律删除;
   * 全程失败静默(GC 是后台优化,绝不影响主流程),返回删除条数 */
  function listKeys() {
    return open().then(db => new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readonly');
      const os = tx.objectStore(STORE);
      const rq = os.getAllKeys ? os.getAllKeys() : null;
      if (!rq) { // 老浏览器无 getAllKeys:游标兜底
        const keys = [];
        const cur = os.openKeyCursor();
        cur.onsuccess = () => { if (cur.result) { keys.push(cur.result.key); cur.result.continue(); } else resolve(keys); };
        cur.onerror = () => reject(cur.error);
        return;
      }
      rq.onsuccess = () => resolve(rq.result || []);
      rq.onerror = () => reject(rq.error);
    })).catch(() => []);
  }
  async function gc(keep) {
    if (!ok) return 0;
    const keepSet = keep instanceof Set ? keep : new Set(keep || []);
    const keys = await listKeys();
    let n = 0;
    for (const k of keys) {
      if (keepSet.has(k)) continue;
      await del(k);
      confirmed.delete(k); // 确认集同步剔除:同值再次离线时会重新写入(键还在 confirmed 会被误认为已在库)
      n++;
    }
    return n;
  }

  /* 初始化探测:受限环境保持 ok=false,全程退化纯 localStorage */
  open().then(() => { ok = true; openPending = false; settle(); }).catch(() => { ok = false; openPending = false; settle(); });

  /* R18:申请持久化存储权限——浏览器在空间压力下不再自动清除本应用的 IDB(作品素材不是缓存);
   * 结果 true/false 不影响功能(仅降低被驱逐概率),拒绝/不支持均静默 */
  try { if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {}); } catch (_) {}

  window.IDB = { get, put, del, gc, listKeys, hydrate, markerReplacer, beginPersist, onIdle, keyOf, MARK, isBig, get ok() { return ok; } };
})();
