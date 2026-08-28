/* ============ release-core.js 发布留痕(打版本)双端单源(UMD,零依赖) ============
 * 「成片发布留痕」这一动作的**准入判定**与**写回**只此一份:浏览器 js/release.js 的
 * Release.stampRelease、服务端 /api/wf/release(CLI `exec project.release` / `release` 与 MCP 同链路)
 * 都调本模块同一个 stamp(),两端不各写一份摘要算法与版本号推进逻辑。
 * 三条边界:
 *   - 本层不判发布门,只**消费**门禁结论(gate 由调用方注入):浏览器注入 Release.collect 的十项门,
 *     headless 注入本模块 gates() 的七项核心门——门禁判据、fail/warn 计数与 overall 口径一个字不改;
 *   - 环境差异(时钟、随机数、用户名、版本号推进器、落库)一律经参数显式注入,模块内不碰 window /
 *     不读 Store / 不发请求 / 不落盘,只在传进来的项目对象上写 p.releases 与 p.__ver;
 *   - 记忆回流不在本层派生:那一份在 js/wf-core.js(memFeedback/memWrite),调用方拿 stamp 回执自己写回。
 * gates() 是 headless 侧(CLI release-check / 服务端端点)的七项核心门,与浏览器 Release.collect 的
 * 十项门有意不同——G2 问题清零 / G7 合规 / G8 真人素材审核依赖浏览器模块,headless 拿不到就不假装判。
 * 零 LLM、零计费、零网络:发布留痕本来就不是计费动作,本模块也不引入任何。 */
(function (root, factory) {
  const R = factory();
  if (typeof module === 'object' && module.exports) module.exports = R;
  else root.ReleaseCore = R;
})(typeof self !== 'undefined' ? self : globalThis, function () {
  'use strict';

  const NOTE_MAX = 500;           // 发布说明截断(两端同数)
  const PASS_OVERALL = ['pass', 'cond-pass']; // 可打版本的两种 overall(cond-pass = 只剩账目/合规待后台确认)
  const DEFAULT_MIN_SCORE = 7;    // 审片均分默认阈值(与 settings.releaseMinReviewScore 缺省同数)

  /** 门禁结论是否放行打版本(唯一判据,两端不各写一份) */
  function passed(gate) { return !!gate && PASS_OVERALL.indexOf(gate.overall) >= 0; }

  /* ---------- headless 发布门:七项核心门(Domain 经参数注入) ----------
   * G1 主线就绪 / G3 审片均分 / G4 过期镜 / G5 未确认镜 / G6 失败镜 / G9 主体缺图 / G10 计费账目。
   * 判据与 overall 四级计数与既有 CLI 实现逐字一致(本轮只是把它挪进双端单源,不抬门也不降门)。 */
  function gates(p, opts) {
    opts = opts || {};
    const Domain = opts.Domain;
    const online = opts.online !== false;
    let minScore = +opts.minScore;
    if (!isFinite(minScore) || minScore < 0) minScore = DEFAULT_MIN_SCORE;
    const eps = (p && p.episodes) || [];
    const gate = (code, label, status, info) => ({ code, label, status, info: info || '' });
    const list = [];
    let fails = 0, warns = 0;
    // G1 workflow 每集 status === 'done'
    // Domain 是本层的必注入依赖:漏注入不许落进下面的 catch 降成 warn——判不出来就不等于"没有未过门项",
    // 那会让本该 fail 的 G1 在回执上算成 fails 0(浏览器那半的 warn 说的是页面模块未加载,与调用方漏传不是一回事)。
    if (!Domain || typeof Domain.episodeState !== 'function') {
      list.push(gate('g1-workflow', '主线步骤全完成', 'fail', '缺 Domain 注入:主线状态判不出来')); fails++;
    } else try {
      const blockers = [];
      eps.forEach(ep => {
        const st = Domain.episodeState(p, ep, online);
        if (st.status !== 'done') blockers.push({ ep: ep.title || ep.id, status: st.status, label: (st.action && st.action.label) || '' });
      });
      if (blockers.length) { list.push(gate('g1-workflow', '主线步骤全完成', 'fail', blockers.map(b => b.ep + '(' + b.status + (b.label ? ':' + b.label : '') + ')').join('；'))); fails++; }
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
    // G4/G5/G6 counts 聚合(三门同一次遍历,故判不出来时三门同一个结论,不会出现"G4 说判不出来、G5 说 0 镜")
    // 这一次遍历失手不许静静吞掉:吞了三门就照常印「0 镜 pass」,等于宣称"查过了,一镜不缺",
    // 而实际上一镜未查(半途抛出时更坏——拿半截计数当全量报)。缺注入按未过门算、Domain 自身抛错按 warn 记。
    const agg = { stale: 0, unconfirmed: 0, failed: 0 };
    // 过期镜里定稿的那几镜批量重生成锁着不放:与浏览器 G4 同读 Domain.staleShotSplit/staleSplitNote,
    // 两端不各拼一句"其中几镜要人工"(计数与判旧本来就是同一份,说法分家的话回执就有两种口径)。
    const staleSplit = { rerun: 0, locked: 0 };
    let aggErr = null;
    if (!Domain || typeof Domain.episodeState !== 'function') aggErr = { status: 'fail', info: '缺 Domain 注入:镜次计数判不出来' };
    else try {
      eps.forEach(ep => {
        const st = Domain.episodeState(p, ep, online);
        ['stale', 'unconfirmed', 'failed'].forEach(k => { agg[k] += (st.counts && +st.counts[k]) || 0; });
        // 本层对注入 Domain 的硬契约只有 episodeState(缺它上面已按未过门算);分堆是回执上的增量,
        // 注入方给的是只带 episodeState 的窄 Domain 时退回原样只报总数,不把这门连累成"判不出来"。
        if (typeof Domain.staleShotSplit === 'function') {
          const sp = Domain.staleShotSplit(p, ep, online);
          staleSplit.rerun += sp.rerun.length;
          staleSplit.locked += sp.locked.length;
        }
      });
    } catch (e) { aggErr = { status: 'warn', info: 'Domain 异常:' + e.message }; }
    [['g4-stale', '过期镜=0', 'stale'], ['g5-unconfirmed', '未确认镜=0', 'unconfirmed'], ['g6-failed', '失败镜=0', 'failed']].forEach(t => {
      if (aggErr) {
        list.push(gate(t[0], t[1], aggErr.status, aggErr.info));
        if (aggErr.status === 'fail') fails++; else warns++;
        return;
      }
      const note = t[0] === 'g4-stale' && Domain && typeof Domain.staleSplitNote === 'function'
        ? Domain.staleSplitNote(staleSplit.rerun, staleSplit.locked) : '';
      list.push(gate(t[0], t[1], agg[t[2]] ? 'fail' : 'pass', agg[t[2]] + ' 镜' + note)); if (agg[t[2]]) fails++;
    });
    // G9 主体缺图
    const noImg = ((p && p.subjects) || []).filter(s => !s.image).length;
    list.push(gate('g9-subjects', '主体图齐全=0缺图', noImg ? 'fail' : 'pass', noImg ? noImg + ' 缺图' : ((p && p.subjects) || []).length + ' 位就位'));
    if (noImg) fails++;
    // G10 计费账目(服务端有接口时真正对账:项目 usage.net 与 jobs 完成总量吻合——CLI 在此只跑接口,不硬判)
    list.push(gate('g10-billing', '计费账目核对(净消耗 vs 生成资产数)', 'warn', '--with-billing 时会调用 /api/billing/usage 与 /api/jobs 交叉验证'));
    warns++;
    return { overall: overallOf(fails, warns), gates: list, fails, warns, score: 10 - fails - warns, minReviewScore: minScore, at: Date.now() };
  }
  /** 四级 overall(fail / warn / cond-pass / pass):两端同一份计数口径 */
  function overallOf(fails, warns) {
    if (fails > 0) return 'fail';
    if (warns > 1) return 'warn';
    return warns === 1 ? 'cond-pass' : 'pass';
  }

  /** 门禁摘要(命令回执面):只给结论与未过门项,不复述整份门禁清单(两端回执同形) */
  function brief(g) {
    if (!g) return null;
    return {
      overall: g.overall, fails: g.fails, warns: g.warns, score: g.score,
      blockers: (g.gates || []).filter(x => x.status !== 'pass').map(x => ({ code: x.code, label: x.label, status: x.status })),
    };
  }

  /* ---------- 内容摘要:djb2(项目版本 + 分集/主体形态) ----------
   * 打完版本号后取:同一项目同一状态在两端算出同一个 checksum(留痕可跨端核对)。 */
  function checksum(p) {
    const sig = {
      ver: (p && p.__ver) || 0, name: (p && p.name) || '',
      epCount: ((p && p.episodes) || []).length,
      eps: ((p && p.episodes) || []).slice(0, 10).map(e => ({
        id: e.id, title: e.title, shots: (e.shots || []).length,
        composed: !!e.composed, reviewAvg: e.lastReview && e.lastReview.avg,
      })),
      subs: ((p && p.subjects) || []).map(s => ({ id: s.id, name: s.name, hasImg: !!s.image })),
    };
    const s = JSON.stringify(sig);
    let h = 5381;
    for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
    return 'v' + ((p && p.__ver) || 0) + '_' + h.toString(36);
  }

  /* ---------- 准入判定:空项目 / 缺门禁结论 / 未过门,一律给明确错误码 ----------
   * 空项目那条是本轮补的:七项核心门在「0 集」上全部 pass(没有集就没有不达标的集),
   * headless 因此能给一个没有任何成片的项目打版本。它不是发布门的一项(不改门禁判据与计数),
   * 而是发布留痕这个动作自己的前置——没有成片就没有可留痕的交付物。 */
  function precheck(p, gate, opts) {
    opts = opts || {};
    if (!p || !p.id) return { ok: false, code: 'not-found', message: '项目不存在' };
    if (!((p.episodes || []).length)) return { ok: false, code: 'no-episodes', message: '项目暂无分集:没有可发布的成片,请先拆集出片再打版本' };
    if (!gate) return { ok: false, code: 'no-gate', message: '缺发布门结论:发布留痕必须带门禁判定(不允许跳过检查直接留痕)' };
    if (!passed(gate) && !opts.force) {
      return { ok: false, code: 'gate-blocked', message: '发布门未通过(fail=' + (gate.fails || 0) + ',warn=' + (gate.warns || 0) + ')' };
    }
    return { ok: true };
  }

  /* ---------- 写回:打版本号 + 追加一条 releases 留痕 ----------
   * opts:{ gate 门禁结论(必填), force 授权位, note 发布说明, who 发布人, when 展示时间串,
   *        rand 随机后缀, bumpVer 版本号推进器(缺省 __ver+1), savedAt 落库时间戳 }
   * 返回 { ok, release, gate } 或 { ok:false, code, message, gate };调用方负责落库与记忆回流。 */
  function stamp(p, opts) {
    opts = opts || {};
    const gate = opts.gate;
    const chk = precheck(p, gate, opts);
    if (!chk.ok) return Object.assign({ gate: gate || null }, chk);
    const bump = typeof opts.bumpVer === 'function' ? opts.bumpVer : (proj => { proj.__ver = (proj.__ver || 0) + 1; });
    bump(p);
    const ver = p.__ver || 0;
    const rel = {
      digest: 'RLS_' + Date.now().toString(36) + '_' + String(opts.rand ? opts.rand() : Math.random().toString(36).slice(2, 7)),
      ver,
      checksum: checksum(p),
      when: opts.when || new Date().toLocaleString('zh-CN', { hour12: false }),
      who: String(opts.who || 'anonymous'),
      note: String(opts.note || '').slice(0, NOTE_MAX),
      gate: { overall: gate.overall, fails: gate.fails, warns: gate.warns, score: gate.score, at: gate.at },
      snapshotAt: Date.now(),
      snapshotVer: ver,
    };
    if (!passed(gate)) rel.forced = true; // 强制打的版本如实留痕:回滚/对账时看得出这一版没过门
    p.releases = p.releases || [];
    p.releases.push(rel);
    if (opts.savedAt) p.__lastSaved = opts.savedAt;
    return { ok: true, release: rel, gate };
  }

  return { NOTE_MAX, PASS_OVERALL, DEFAULT_MIN_SCORE, passed, gates, overallOf, brief, checksum, precheck, stamp };
});
