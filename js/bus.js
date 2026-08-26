/* ============ bus.js 管线事件总线(协同层,第三阶段) ============
 * 管线模块(生成/审片/合成/拉片)只 emit 结构化事件,不感知消费方;
 * 订阅方各自消化:Agent 对话流事件卡(agent-ops)、问题中心角标(issues)、计划进度(plans)。
 * 同步分发、订阅者异常隔离(不阻断管线);带会话内最近事件留痕(供 Agent 按需查询「最近发生了什么」)。
 * 事件名约定:<域>.<动作>:shots.batchStart|shots.batchDone|episode.ripped|compose.start|compose.done|
 * compose.failed|review.episodeStart|review.episodeDone|review.smartStart|review.smartDone|plan.step
 * payload 基础字段:p/ep/main(可选)+ 事件数据 + brief(一句话留痕,进最近事件列表)。
 * 加载顺序:domain.js 之后(store 之前亦可,无依赖);emit 点一律 window.Bus 守卫(未加载静默跳过)。 */
(function () {
  const subs = {}; // name → Set(fn);'*' 为通配订阅(接收全部事件)
  const HIST_MAX = 50;
  const history = []; // 最近事件(会话内,不落库):{name,time,pid,epid,brief}

  function on(name, fn) {
    if (!name || typeof fn !== 'function') return () => {};
    (subs[name] = subs[name] || new Set()).add(fn);
    return () => off(name, fn);
  }
  function off(name, fn) {
    const s = subs[name];
    if (s) s.delete(fn);
  }
  function emit(name, payload) {
    const ev = Object.assign({ name }, payload || {});
    if (!ev.time) ev.time = (window.Store && Store.now) ? Store.now() : new Date().toISOString();
    history.push({ name: ev.name, time: ev.time, pid: ev.p && ev.p.id, epid: ev.ep && ev.ep.id, brief: String(ev.brief || '') });
    if (history.length > HIST_MAX) history.splice(0, history.length - HIST_MAX);
    const fire = set => { if (set) set.forEach(fn => { try { fn(ev); } catch (e) { /* 订阅者异常不阻断管线 */ } }); };
    fire(subs[name]);
    if (name !== '*') fire(subs['*']);
    return ev;
  }
  /* 最近 n 条事件(新→旧;可按 pid 过滤) */
  function recent(n, pid) {
    const list = pid ? history.filter(h => h.pid === pid) : history.slice();
    return list.slice(-Math.max(1, n || 10)).reverse();
  }

  window.Bus = { on, off, emit, recent };
})();
