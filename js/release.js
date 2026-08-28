/* ============ release.js 交付检查(发布门禁10项 + 版本留痕 + 交付物打包ZIP) ============
 * 10 类发布门(按 fail/warn/pass):
 *   G1  主线就绪:每集 Domain.episodeState.status === 'done' — fail
 *   G2  问题清零:Issues.collect(p) 返回数组,高/中危条目清零 — fail(有 unresolved 高/中危)
 *   G3  审片均分:每集都必须有未过期(rev/快照判旧=视为未审)的审片记录且 reviewAvg >= 阈值(默认 7,可配置 releaseMinReviewScore) — fail
 *   G4  素材过期镜 0:stale 镜清零 — fail
 *   G5  未确认镜 0:unconfirmed 清零 — fail
 *   G6  失败镜 0:failed 清零 — fail
 *   G7  合规:项目级敏感词(剧本+提示词)全量 Compliance.checkText — warn(命中可经 HumanReview 复核)
 *   G8  真人素材审核:HumanReview.guardAsync(所有主体 reference + 镜头 image)无 rejected — fail
 *   G9  主体缺图 0:p.subjects.filter(s=>!s.image).length === 0 — fail
 *   G10 计费账目核对:净消耗与台账零差异(离线/无接口不跑 warn) — warn
 *
 * 其他能力:
 * - Releases 留痕:p.releases = [{digest, ver, who, when, note, checksum, rollbackVer, gateResult}]
 * - 回滚:Rollback.release(p, digest) 把 state/history 快照恢复到对应 release 的 __ver
 * - 打包:buildReleaseZip(p) → mp4 + SRT + 分镜CSV/HTML + 项目元 JSON(通过 ZipUtil.create;无 mp4 可用时跳过并回报,
 *   分镜文件抓取失手回退内置分镜表并同样回报——包里缺什么一律进回执 + 下载提示 + 包内 README.txt,不静默按成功交付)
 * - 合规复核:G7 命中合规红线 → 把命中词/句子登记 HR 待复核(assetReviews 入队),HR 关闭后 G7 变为 pass
 * - 阈值配置:getSettings().releaseMinReviewScore,默认 7;DEFAULTS 增加该键(不侵入 gsettings.js 太多,仅 fallback)
 *
 * 依赖:window.Issues / window.Domain / window.Compliance / window.HumanReview / window.ZipUtil / window.Store
 *   / window.U / window.Bus(打版本落定发 release.stamped)/ window.Exporter(exportSrt/buildMaterialFiles 等)
 *   / window.WfCore(发布闭环结论回流记忆)
 *   / window.ReleaseCore(发布留痕的准入判定与写回:与服务端 /api/wf/release、CLI 同一份双端单源)
 * 所有依赖缺失时安全降级(对应门 warn + '模块未加载') */
(function () {
  /* ---------- 阈值(不侵入 gsettings.js DEFAULTS,fallback 7) ---------- */
  function minReviewScore() {
    try {
      const s = window.getSettings ? window.getSettings() : null;
      const v = +((s && s.releaseMinReviewScore) || (Store.state.settings && Store.state.settings.releaseMinReviewScore) || 7);
      return isFinite(v) && v >= 0 && v <= 10 ? v : 7;
    } catch (_) { return 7; }
  }
  function setMinReviewScore(v) {
    const n = Math.max(0, Math.min(10, +v || 0));
    Store.state.settings = Object.assign({}, Store.state.settings || {}, { releaseMinReviewScore: n });
    Store.save();
    return n;
  }

  /* ---------- 工具:门禁项 ---------- */
  function gate(code, label, status, info, extras) {
    return Object.assign({ code, label, status, info: info || '', fix: null }, extras || {});
  }
  // status: fail / warn / pass

  /* ---------- G1-G10 collect ---------- */
  function collect(p, opts) {
    opts = opts || {};
    /* online 与 Issues.collect/流程条同一判定(Media.isReady:有后端 token 才算在线)——
     * 不用 API.isReady:直连模式有 key 即 true,但未登录后端无法真实生成,会把模拟片判就绪(G1 与问题中心结论相反) */
    const online = opts.online !== false && (typeof Media !== 'undefined' && Media && typeof Media.isReady === 'function' && Media.isReady());
    const eps = (p && p.episodes) || [];
    const gates = [];
    const min = minReviewScore();

    /* G1 主线就绪 */
    try {
      if (typeof Domain !== 'undefined' && Domain.episodeState) {
        let blockers = [], first = null;
        eps.forEach(ep => {
          const st = Domain.episodeState(p, ep, online);
          if (st.status !== 'done') {
            blockers.push({ epid: ep.id, ep: ep.title || ep.id, status: st.status, label: (st.action && st.action.label) || '' });
            if (!first) first = { ep, st };
          }
        });
        if (blockers.length) {
          /* 处置按首个受阻集的实际状态派(Domain.epFixOf 单源):回执 info 已按「集名(状态:推荐动作)」点名,
           * 处置若恒挂一键成片,未拆镜/缺正文/失败镜/分镜判旧四态按下去只换来一句就绪检查拦截语——
           * 回执说的和按钮做的对不上。门的 pass 条件一字未动。 */
          gates.push(gate('g1-workflow', '主线步骤全完成', 'fail', blockers.map(b => `· ${b.ep}(${b.status}${b.label ? ':' + b.label : ''})`).join('；'),
            { severity: 'high', fix: Domain.epFixOf(p, first.ep, first.st) }));
        } else gates.push(gate('g1-workflow', '主线步骤全完成', 'pass', eps.length + ' 集全部 done'));
      } else gates.push(gate('g1-workflow', '主线步骤全完成', 'warn', 'Domain 模块未加载,无法校验'));
    } catch (e) { gates.push(gate('g1-workflow', '主线步骤全完成', 'warn', '校验异常:' + e.message)); }

    /* G2 问题清零(Issues.collect 返回数组,契约见 tests/unit.js release 套件) */
    try {
      if (typeof Issues !== 'undefined' && Issues.collect) {
        const list = Issues.collect(p);
        const unresolved = list.filter(x => x.sev === 'high' || x.sev === 'mid');
        if (unresolved.length) {
          const high = unresolved.filter(x => x.sev === 'high').length;
          const mid = unresolved.length - high;
          gates.push(gate('g2-issues', '问题清零(无高危/中危未解决)', high > 0 ? 'fail' : 'warn',
            `高危 ${high} 项,中危 ${mid} 项`,
            { severity: high > 0 ? 'high' : 'mid', fix: { type: 'nav', goto: 'issues' } }));
        } else gates.push(gate('g2-issues', '问题清零(无高危/中危未解决)', 'pass', list.length ? '仅 ' + list.filter(x => x.sev === 'low').length + ' 低危' : '0 问题'));
      } else gates.push(gate('g2-issues', '问题清零', 'warn', 'Issues 模块未加载'));
    } catch (e) { gates.push(gate('g2-issues', '问题清零', 'warn', '校验异常:' + e.message)); }

    /* G3 审片均分(每集都必须有审片记录且达标;记录判旧=视为未审 fail——
     * 剧本/图谱修订或镜头重抽后旧分不放行;无 sourceRev/graphRev/snapshotHash 的旧记录保持原语义不判旧) */
    try {
      const hasReview = ep => ep.lastReview && typeof ep.lastReview.avg === 'number';
      const staleOf = ep => (typeof Domain !== 'undefined' && Domain.reviewStaleByScript) ? !!Domain.reviewStaleByScript(ep) : false;
      const noReview = eps.filter(ep => !hasReview(ep));
      const stale = eps.filter(ep => hasReview(ep) && staleOf(ep));
      const fails = eps.filter(ep => hasReview(ep) && !staleOf(ep) && ep.lastReview.avg < min);
      if (!eps.length) {
        gates.push(gate('g3-review', '审片均分 ≥ ' + min, 'fail', '无分集'));
      } else if (noReview.length || stale.length || fails.length) {
        const parts = [];
        if (noReview.length) parts.push('未审:' + noReview.map(ep => (ep.title || ep.id)).join('、'));
        if (stale.length) parts.push('审片记录已过期(视为未审):' + stale.map(ep => (ep.title || ep.id)).join('、'));
        if (fails.length) parts.push('低于阈值:' + fails.map(ep => (ep.title || ep.id) + ':' + ep.lastReview.avg.toFixed(2)).join('、'));
        const first = noReview[0] || stale[0] || fails[0];
        gates.push(gate('g3-review', '审片均分 ≥ ' + min, 'fail', parts.join('；'),
          { fix: { type: 'command', cmd: 'episode.smartReview', epid: first.id } }));
      } else {
        const avgAll = (eps.reduce((s, ep) => s + ep.lastReview.avg, 0) / eps.length).toFixed(2);
        gates.push(gate('g3-review', '审片均分 ≥ ' + min, 'pass', eps.length + ' 集均分:' + avgAll));
      }
    } catch (e) { gates.push(gate('g3-review', '审片均分', 'warn', '校验异常:' + e.message)); }

    /* G4 过期镜 / G5 未确认 / G6 失败镜 (统一从 Domain.counts 聚合;fix 落到首个受累集并带 shotIds 子集)
     * 三门共用这一次遍历,遍历没跑成时不许拿初值 0 照常印「0 镜 → pass」:那等于在回执上告诉用户
     * "过期/未确认/失败镜都查过了,一镜不缺",而实际一镜未查(半途抛出更坏——拿半截计数当全量报)。
     * 判不出来按本模块既有降级纪律如实记 warn,与 G1 同形(模块未加载 / 校验异常各自点名),不抬成 fail。 */
    const agg = { stale: 0, unconfirmed: 0, failed: 0, noSubjectImage: 0 };
    /* 过期镜里定稿的那几镜批量重生成锁着不放(终稿产物不许被覆盖),处置按下去跑不到它们:
     * 分堆现取 Domain.staleShotSplit,与 counts.stale 同一份判旧函数,只用来在回执上把两堆分开报。 */
    const staleSplit = { rerun: 0, locked: 0 };
    let firstStale = null, firstFailed = null, firstUnconfirmed = null;
    let aggErr = (typeof Domain === 'undefined' || !Domain || !Domain.episodeState) ? 'Domain 模块未加载,无法校验' : null;
    if (!aggErr) {
      try {
        eps.forEach(ep => {
          const st = Domain.episodeState(p, ep, online);
          ['stale', 'unconfirmed', 'failed'].forEach(k => { agg[k] += (st.counts && +st.counts[k]) || 0; });
          const sp = Domain.staleShotSplit(p, ep, online);
          staleSplit.rerun += sp.rerun.length;
          staleSplit.locked += sp.locked.length;
          if (!firstStale && st.counts && +st.counts.stale)
            firstStale = { epid: ep.id, shotIds: sp.all, rerunShotIds: sp.rerun, lockedShotIds: sp.locked };
          if (!firstFailed && st.counts && +st.counts.failed)
            firstFailed = { epid: ep.id, shotIds: (ep.shots || []).filter(s => s.video && s.video.status === 'failed').map(s => s.id) };
          if (!firstUnconfirmed && st.counts && +st.counts.unconfirmed) firstUnconfirmed = { epid: ep.id };
        });
      } catch (e) { aggErr = '校验异常:' + e.message; }
    }
    if (aggErr) {
      gates.push(gate('g4-stale', '素材过期镜 = 0', 'warn', aggErr));
      gates.push(gate('g5-unconfirmed', '未确认镜 = 0', 'warn', aggErr));
      gates.push(gate('g6-failed', '失败镜 = 0', 'warn', aggErr));
    } else {
      /* 门槛一字未动:agg.stale 仍含定稿的过期镜,0/非 0 分档与 fix.shotIds 子集照旧。
       * 分报只加在回执上——info 尾巴上那句 + staleSplit 结构位(全项目计数,与 info 里的数同源),
       * fix 上另带这一集里跑得到/跑不到的两份镜号,免得用户按「N 镜过期」点下去再自己数少了哪几镜。 */
      gates.push(gate('g4-stale', '素材过期镜 = 0', agg.stale ? 'fail' : 'pass',
        agg.stale + ' 镜素材与当前剧本不一致' + Domain.staleSplitNote(staleSplit.rerun, staleSplit.locked),
        agg.stale && firstStale ? { severity: 'mid', staleSplit: { total: agg.stale, rerun: staleSplit.rerun, locked: staleSplit.locked },
          fix: { type: 'command', cmd: 'episode.generateVideos', epid: firstStale.epid, shotIds: firstStale.shotIds,
            rerunShotIds: firstStale.rerunShotIds, lockedShotIds: firstStale.lockedShotIds } } : null));
      gates.push(gate('g5-unconfirmed', '未确认镜 = 0', agg.unconfirmed ? 'fail' : 'pass', agg.unconfirmed + ' 镜用户未确认最终',
        agg.unconfirmed && firstUnconfirmed ? { fix: { type: 'nav', hash: '#/project/' + p.id + '/episode/' + firstUnconfirmed.epid } } : null));
      gates.push(gate('g6-failed', '失败镜 = 0', agg.failed ? 'fail' : 'pass', agg.failed + ' 镜生成失败未处理',
        agg.failed && firstFailed ? { severity: 'high', fix: { type: 'command', cmd: 'episode.generateVideos', epid: firstFailed.epid, shotIds: firstFailed.shotIds } } : null));
    }

    /* G7 合规命中 (剧本+所有主体+镜头台词/旁白/提示词) */
    try {
      if (typeof Compliance !== 'undefined' && Compliance.checkText) {
        const texts = [];
        if (p.script) texts.push(p.script);
        if (p.name) texts.push(p.name);
        (p.subjects || []).forEach(s => { texts.push(s.name || ''); texts.push(s.desc || ''); texts.push(s.persona || ''); });
        eps.forEach(ep => {
          texts.push(ep.title || ''); texts.push(ep.content || '');
          (ep.shots || []).forEach(s => {
            texts.push(s.plot || ''); texts.push(s.dialogue || ''); texts.push(s.narration || ''); texts.push(s.prompt || '');
          });
        });
        const all = texts.join('\n');
        const r = Compliance.checkText(all);
        if (r.hits.length) {
          // 合规复核:入队 HumanReview 待处理(用户配置允许时);没配置 HR 时判 warn
          const hasHR = typeof HumanReview !== 'undefined' && HumanReview && HumanReview.guardAsync;
          gates.push(gate('g7-compliance', '合规敏感词无命中', hasHR ? 'warn' : 'fail',
            `命中 ${r.hits.length} 条:${r.hits.map(h => h.cat + '/' + h.word).slice(0, 10).join('、')}${r.hits.length > 10 ? '…(+ ' + (r.hits.length - 10) + ')' : ''}`,
            { severity: 'high', hits: r.hits, fix: { type: 'nav', goto: 'compliance' } }));
        } else gates.push(gate('g7-compliance', '合规敏感词无命中', 'pass', '剧本+提示词+人设 共 ' + Math.round(all.length / 1024) + 'KB 文本 0 命中'));
      } else gates.push(gate('g7-compliance', '合规敏感词无命中', 'warn', 'Compliance 模块未加载'));
    } catch (e) { gates.push(gate('g7-compliance', '合规敏感词', 'warn', '校验异常:' + e.message)); }

    /* G8 HumanReview 真人素材审核 (主体 image + shots.image) */
    try {
      if (typeof HumanReview !== 'undefined' && HumanReview && HumanReview.guardAsync) {
        const urls = [];
        (p.subjects || []).forEach(s => { if (s.image) urls.push(s.image); });
        eps.forEach(ep => (ep.shots || []).forEach(s => { if (s.image) urls.push(s.image); if (s.video && s.video.frame) urls.push(s.video.frame); }));
        const uniqUrls = urls.filter((u, i) => u && urls.indexOf(u) === i);
        // 同步判 rejected:HR.guardAsync 是异步的,collect 阶段只做 rejected 缓存查(返回同步预筛)
        const rejected = uniqUrls.filter(u => {
          const recs = Store.state && Store.state.assetReviews;
          if (!recs) return false;
          const r = recs.find(x => x && (x.url === u || x.assetId === u));
          return r && r.status === 'rejected';
        });
        if (rejected.length) gates.push(gate('g8-humanreview', '真人素材审核无 rejected', 'fail', rejected.length + ' 个素材审核未通过',
          { severity: 'high', rejected, fix: { type: 'nav', goto: 'humanreview' } }));
        else gates.push(gate('g8-humanreview', '真人素材审核无 rejected', 'pass', uniqUrls.length ? uniqUrls.length + ' 个素材均可用' : '无外部素材(自产自用默认可用)'));
      } else gates.push(gate('g8-humanreview', '真人素材审核无 rejected', 'warn', 'HumanReview 模块未加载,无法校验'));
    } catch (e) { gates.push(gate('g8-humanreview', '真人素材审核', 'warn', '校验异常:' + e.message)); }

    /* G9 主体缺图 0(fix 走 subject.generateImage 命令,带缺图主体 id 子集,与角色页逐主体生图同链路) */
    const noImgList = (p.subjects || []).filter(s => !s.image);
    const noImg = noImgList.length;
    gates.push(gate('g9-subjects', '主体角色图齐全 = 0 缺图', noImg ? 'fail' : 'pass', noImg ? noImg + ' 位主体缺参考图' : (p.subjects || []).length + ' 位全部就位',
      noImg ? { fix: { type: 'command', cmd: 'subject.generateImage', subjectIds: noImgList.map(s => s.id) } } : null));

    /* G10 计费账目核对(离线/无接口 warn;在线时 CLI 端真正跑 /api/billing/usage 对账) */
    try {
      if (typeof API !== 'undefined' && API && API.isReady && API.isReady()) {
        gates.push(gate('g10-billing', '计费账目无差异', 'warn', '在线模式:请在 CLI 执行 `hujing release-check <pid>` 完成账目对账(需服务端账本访问权限)'));
      } else gates.push(gate('g10-billing', '计费账目无差异', 'warn', '离线/未登录:仅服务端可访问账本,建议登录后再执行发布门复核'));
    } catch (e) { gates.push(gate('g10-billing', '计费账目', 'warn', '校验异常:' + e.message)); }

    /* 汇总:无 fail + warn ≤1 门(G10 或 G7)才 overall pass */
    const fails = gates.filter(g => g.status === 'fail').length;
    const warns = gates.filter(g => g.status === 'warn').length;
    let overall = 'pass';
    if (fails > 0) overall = 'fail';
    else if (warns > 1) overall = 'warn';
    else if (warns === 1) {
      // 仅 G10 或 G7(有HR) warn → 算 "cond-pass"
      const wCodes = gates.filter(g => g.status === 'warn').map(g => g.code).sort().join(',');
      overall = (wCodes === 'g10-billing' || wCodes === 'g7-compliance') ? 'cond-pass' : 'warn';
    }
    // 角标:未通过项数(给 tab 行 badgeHTML 用)
    const blockers = fails + Math.max(0, warns - 1);
    return { overall, gates, fails, warns, score: 10 - fails - warns, blockers, minReviewScore: min, at: Date.now() };
  }

  /* ---------- 角标 HTML(项目页 tab 行) ---------- */
  function badgeHTML(p) {
    if (!p || !p.id) return '';
    try {
      const r = collect(p, { online: true });
      const cls = r.overall === 'pass' || r.overall === 'cond-pass' ? 'release-pass' : 'release-fail';
      const icon = r.overall === 'pass' ? '✓' : (r.overall === 'cond-pass' ? '◐' : '✕');
      return `<button class="tab-btn ${cls}" data-x="prelease" data-pid="${p.id}" title="交付检查:${r.blockers || 0} 项阻塞">📦<span class="release-icon">${icon}</span>${r.blockers ? `<span class="badge-num">${r.blockers}</span>` : ''}</button>`;
    } catch (_) { return `<button class="tab-btn" data-x="prelease" data-pid="${p && p.id}" title="交付检查">📦</button>`; }
  }

  /* ---------- Releases 版本留痕 ----------
   * 准入判定(空项目/缺门禁结论/未过门)与写回(打版本号 + 追加 releases 条目 + 内容摘要)
   * 一律走 js/release-core.js 双端单源——与服务端 /api/wf/release(CLI exec project.release 同链路)
   * 同一个 stamp();本层只负责浏览器这一端的环境注入(时钟/用户名/版本号推进器)与落库/广播。 */
  /** 打版本(只有 overall pass/cond-pass 才成功;否则返回 {ok:false, code, reason}) */
  function stampRelease(p, note, opts) {
    opts = opts || {};
    const g = opts.gateResult || collect(p, { online: opts.online });
    const r = ReleaseCore.stamp(p, {
      gate: g, force: !!opts.force, note,
      who: ((Store.state && Store.state.user) || {}).username || ((Store.state && Store.state.session) ? 'local' : 'anonymous'),
      when: Store.now(),
      // 版本号推进走既有协作续跑口径(200ms 窗口幂等),缺模块时退回 __ver+1
      bumpVer: proj => { if (window.Continuity && Continuity.bumpVer) Continuity.bumpVer(proj); else proj.__ver = (proj.__ver || 0) + 1; },
    });
    if (!r.ok) return { ok: false, code: r.code, reason: r.message, gate: r.gate };
    const rel = r.release;
    /* 发布闭环结论按板块回流协作记忆:门禁结果只读(overall/fails/warns 与未过门项的 label),
     * 派生走 WfCore 双端单源(与服务端发布端点同一份),写回既有 state.agentMemory;
     * 一个字不改 G1–G10 判据与 overall 计数口径,WfCore 未加载时静默跳过(与本模块其余降级同纪律) */
    if (window.WfCore && WfCore.memWrite) {
      Store.state.agentMemory = WfCore.memWrite(Store.state.agentMemory,
        WfCore.memFeedback({ p, gate: g, rel }, { now: Store.now }));
    }
    Store.save();
    if (window.Bus) Bus.emit('release.stamped', { pid: p.id, digest: rel.digest, ver: rel.ver });
    return { ok: true, release: rel, gate: g };
  }
  function releaseList(p) { return (p && p.releases) || []; }
  /** 回滚到指定 digest(通过 /api/state/history? 不,直接调 Store 现有 restore 路径不存在时 fallback 到 releases 内 snapshotVer 对比) */
  function rollbackTo(p, digest) {
    if (!p || !digest) return { ok: false, reason: '参数缺失' };
    p.releases = p.releases || [];
    const idx = p.releases.findIndex(r => r.digest === digest);
    if (idx < 0) return { ok: false, reason: '版本不存在' };
    const rel = p.releases[idx];
    // 实际回滚:优先走服务端 /api/state/restore(有 history 快照);否则降级为写 p.__rollbackVer 给客户端 UI 提示"手动导出/导入"
    // 注意:服务端 history 仅 rev 数字;因此 rollback 在纯前端路径下不保证字段还原,给出明确提示
    if (window.API && typeof API.restoreState === 'function') {
      return { ok: true, fallback: false, digest, message: '请调用 API.restoreState(对应 rev) 完成服务端历史回滚;当前 release 对应 snapshotVer=' + rel.snapshotVer };
    }
    return { ok: true, fallback: true, digest, snapshotVer: rel.snapshotVer, message: '离线模式:release 记录已标记回滚点,请通过「偏好学习 → 全局默认值 → 版本快照恢复」完成或手动导入项目备份' };
  }

  /* ---------- 交付物打包 ZIP(mp4 + SRT + 分镜CSV/HTML + 元JSON) ---------- */
  async function buildReleaseZip(p, opts) {
    opts = opts || {};
    if (!window.ZipUtil || !ZipUtil.create) throw new Error('ZipUtil 未加载,无法打包');
    const files = [];
    const eps = (p.episodes || []).slice();
    const summary = { ok: 0, skipped: [], stale: [], storyboardFailed: [] };

    for (let i = 0; i < eps.length; i++) {
      const ep = eps[i];
      const epName = (i + 1) + '_' + safeName(ep.title || ep.id);
      /* 判旧警告:成片/SRT 基于过期输入(调序/裁剪/改台词/剧本修订)时提示需先重合成——只警告不拦截打包 */
      if (ep.composed && typeof Domain !== 'undefined' && Domain.epComposedReady
        && !Domain.epComposedReady(ep, typeof Media !== 'undefined' && Media && Media.isReady && Media.isReady())) {
        summary.stale.push((ep.title || ep.id) + ':成片/SRT 已过期(合成输入或剧本已变化),建议先重新合成');
      }
      // 1) 成片 mp4:ep.composed 若是 /uploads/*.mp4 URL → 转 bytes;否则记 skipped
      if (ep.composed && String(ep.composed).startsWith('/uploads/') && !opts.skipVideo) {
        try {
          const bytes = await ZipUtil.dataURLtoBytes(ep.composed);
          if (bytes && bytes.length) { files.push({ name: 'videos/' + epName + '.mp4', data: bytes }); summary.ok++; }
          else summary.skipped.push(ep.title + ':成片 URL 抓取失败(空)');
        } catch (e) { summary.skipped.push(ep.title + ':成片抓取失败 ' + e.message); }
      } else if (!opts.skipVideo) summary.skipped.push(ep.title + ':无有效成片URL');
      // 2) SRT
      if (ep.composedSrt) {
        files.push({ name: 'subtitles/' + epName + '.srt', data: ep.composedSrt });
      }
      /* 3) 分镜 CSV/HTML (复用 Exporter.buildMaterialFiles — 如果加载)
       * 抓取失手不许静默:吞掉的话交付包少这一集的整个 storyboard/ 目录,而回执照报成功——
       * 用户拆包才发现缺文件。这里与上面成片那一路同纪律:如实登记进 summary 并回退内置分镜表,
       * 让交付包至少不缺这一集的分镜(files 先整批算完再入列,半截清单不会与兜底那份混着进包)。 */
      let storyboardOK = false;
      if (window.Exporter && typeof Exporter._buildMaterialShim === 'function') {
        try {
          const list = await Exporter._buildMaterialShim(p, ep);
          if (!Array.isArray(list)) throw new Error('分镜文件清单不是数组');
          list.map(f => ({ name: 'storyboard/' + epName + '/' + f.name, data: f.data })).forEach(f => files.push(f));
          storyboardOK = true;
        } catch (e) {
          summary.storyboardFailed.push((ep.title || ep.id) + ':分镜文件抓取失败 ' + e.message + '(已回退内置分镜表)');
        }
      }
      // 兜底:至少一份 CSV + shots list(Exporter 未加载,或上面抓取失手回退)
      if (!storyboardOK) files.push(fallbackStoryboard(ep, epName));
    }
    // 4) 项目元 JSON
    const meta = {
      project: { id: p.id, name: p.name, style: p.style, ver: p.__ver, updatedAt: p.__lastSaved, releases: (p.releases || []).slice(-5) },
      episodes: eps.map(e => ({
        id: e.id, title: e.title, shots: (e.shots || []).length,
        composed: !!e.composed, reviewAvg: e.lastReview && e.lastReview.avg, state: (window.Domain && Domain.episodeState ? Domain.episodeState(p, e, false).status : 'n/a')
      })),
      subjects: (p.subjects || []).map(s => ({ id: s.id, name: s.name, hasImg: !!s.image })),
      generatedAt: Store.now(),
      generator: '虎鲸漫剧(第四阶段交付包)',
    };
    files.push({ name: 'project_meta.json', data: JSON.stringify(meta, null, 2) });
    files.push({ name: 'README.txt', data:
`虎鲸漫剧 交付包
============
项目:${p.name}
版本:${meta.project.ver}  时间:${meta.generatedAt}
分集数:${eps.length}
打包清单:
 - videos/  — 各集成片 mp4(需登录后端合成成功,否则 skipped)
 - subtitles/ — 各集 SRT 软字幕(合成时产出,重新合成补齐)
 - storyboard/ — 各集分镜表 CSV/提示词
 - project_meta.json — 项目元数据/版本信息/发布留痕
 - README.txt — 本文件

跳过的视频:
${summary.skipped.length ? summary.skipped.map(s => ' - ' + s).join('\n') : ' (全部成功,共 ' + summary.ok + ' 集)'}

分镜文件抓取失败(这些集包内只有内置兜底分镜表,提示词等附件缺失):
${summary.storyboardFailed.length ? summary.storyboardFailed.map(s => ' - ' + s).join('\n') : ' (无)'}

过期提醒(建议重新合成后再交付):
${summary.stale.length ? summary.stale.map(s => ' - ' + s).join('\n') : ' (无)'}
` });

    const bytes = ZipUtil.create(files);
    return { bytes, files: files.length, videosOK: summary.ok, videosSkipped: summary.skipped,
      storyboardFailed: summary.storyboardFailed, stale: summary.stale, size: bytes.length };
  }
  /* 内置兜底分镜表:Exporter 未加载或抓取失手时,交付包里这一集至少还有一份分镜 CSV */
  function fallbackStoryboard(ep, epName) {
    const rows = [['镜号', '名称', '剧情', '运镜', '旁白', '台词', '时长', '状态']];
    (ep.shots || []).forEach((s, j) => rows.push([j + 1, s.name || '', s.plot || '', s.camera || '', s.narration || '', s.dialogue || '', (s.duration || 5), s.video && s.video.status || '']));
    return { name: 'storyboard/' + epName + '_分镜表.csv', data: rows.map(r => r.map(x => `"${String(x).replace(/"/g, '""')}"`).join(',')).join('\n') };
  }
  function safeName(s) { return String(s || '').replace(/[\\/:*?"<>|]+/g, '_').slice(0, 60) || 'untitled'; }
  async function downloadReleaseZip(p, opts) {
    const r = await buildReleaseZip(p, opts);
    const name = '交付包_' + safeName(p.name) + '_v' + (p.__ver || 0) + '.zip';
    // 直接落 buildReleaseZip 已经打好的 bytes:再走一次 ZipUtil.download 等于另打一个包,用户会多收到一个 zip
    try {
      const blob = new Blob([r.bytes], { type: 'application/zip' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = name;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 3000);
    } catch (e) {
      /* 落地失败就如实失败:兜底再调 ZipUtil.download 是同一套 Blob/createObjectURL/a.click,
       * 这条路不通时那条路同样不通;万一通了,落的是个名字仍叫「交付包」、里面只有一句
       * 「请重新打包」的空壳 zip,用户还会接着收到下面那条「交付包已下载 N 个文件」的成功提示。 */
      throw new Error('交付包已打好,但浏览器下载没能落地:' + ((e && e.message) || e) + '(请重试打包,或换用其他浏览器)');
    }
    if (window.U) U.toast(`交付包已下载:${r.files} 个文件,${r.videosOK}/${(p.episodes || []).length} 集成片${r.videosSkipped.length ? '(' + r.videosSkipped.length + ' 跳过)' : ''}`, 'success', 4000);
    // 抓分镜失手在下载回执上如实报出:只印文件数的话,缺分镜的包与齐全的包在用户眼里一模一样
    if (r.storyboardFailed && r.storyboardFailed.length && window.U)
      U.toast(`${r.storyboardFailed.length} 集分镜文件抓取失败,包内已回退内置分镜表(提示词等附件缺失),详见包内 README.txt`, 'error', 6000);
    if (r.stale && r.stale.length && window.U) U.toast(`注意:${r.stale.length} 集成片/SRT 已过期(输入或剧本已变化),建议先重新合成再交付`, 'info', 5000); // 判旧警告不拦截打包,如实提示
    return r;
  }

  /* ---------- 门禁 fix 统一执行器(发布门弹窗与制作台共用) ----------
   * command 类走统一命令层(ui 模式保留决策闸,带 epid/shotIds/subjectIds 子集);nav 类跳转/开对应面板。
   * onDone(r) 处置落定后回调(调用方重收门禁/重绘);opts.issuesAsSection:制作台单屏内「问题清零」导航不另开弹窗,仅重绘。 */
  function execFix(p, g, main, onDone, opts) {
    const fix = g && g.fix;
    if (!fix) return;
    if (fix.type === 'nav') {
      if (fix.goto === 'issues') { if (!(opts && opts.issuesAsSection)) { location.hash = '#/project/' + p.id; if (window.Issues) Issues.openModal(p, main); } }
      else if (fix.goto === 'compliance') { if (window.Compliance) Compliance.rulesModal(); }
      else if (fix.goto === 'humanreview') { U.toast('请前往「模型配置 - 肖像授权」与「素材审核」处理 rejected 项', 'info', 3000); }
      if (fix.hash) location.hash = fix.hash;
      if (onDone) onDone(null);
      return;
    }
    if (fix.type === 'command' && window.Commands && typeof Commands.execute === 'function') {
      return Commands.execute(fix.cmd, { pid: p.id, epid: fix.epid, shotIds: fix.shotIds, subjectIds: fix.subjectIds, main, ui: true })
        .then(Commands.digest)
        .then(r => { if (onDone) onDone(r); });
    }
  }

  /* ---------- 模态:打开交付检查 UI ---------- */
  function openModal(p, main) {
    if (!p || !p.id) return U && U.toast('项目不存在', 'error');
    const g0 = collect(p, { online: true });
    let gate = g0;
    const latest = (p.releases || []).slice(-1)[0];
    const cls = gate.overall === 'pass' ? 'ok' : (gate.overall === 'cond-pass' ? 'so-so' : 'bad');
    const body = `
    <div class="release-head release-${cls}">
      <div class="row" style="gap:14px;align-items:center">
        <div style="font-size:40px">${gate.overall === 'pass' ? '✅' : gate.overall === 'cond-pass' ? '⚠️' : '🚫'}</div>
        <div class="grow">
          <div class="rel-ver">项目版本 <b>v${p.__ver || 0}</b> · 交付检查评分 <b style="font-size:18px;margin:0 4px">${gate.score}</b>/10</div>
          <div class="rel-sub">${descOverall(gate.overall)} · 阻塞 ${gate.blockers} 项 · 失败 ${gate.fails} · 警告 ${gate.warns}</div>
        </div>
        <button class="btn" data-x="refresh">↻ 重新检查</button>
      </div>
    </div>
    <div class="release-threshold row" style="gap:10px;margin:12px 0;align-items:center;padding:10px 12px;border:1px dashed var(--border2);border-radius:10px">
      <span class="small muted">审片均分阈值(低于该值判失败):</span>
      <input type="number" min="0" max="10" step="0.5" class="input small" id="rls-score" value="${gate.minReviewScore}" style="width:80px">
      <button class="btn sm" data-x="setscore">保存阈值</button>
      <span class="small muted">审片均分 <b>${gate.minReviewScore}</b> 以上算通过(可按平台精度自调 6~8)</span>
    </div>
    <div id="rls-gates"></div>
    <div style="margin-top:14px">
      <div class="row" style="align-items:center;margin-bottom:8px"><b>📜 发布留痕</b><span class="small muted" style="margin-left:8px">通过发布门后可一键打版本号(留痕可回滚)</span></div>
      <div class="row" style="gap:8px;margin-bottom:10px">
        <textarea class="input small grow" id="rls-note" rows="1" placeholder="本次发布说明(如:首版/第 5 次修订/上线平台 ReelShort)...">${latest ? '基于上次发布修订' : ''}</textarea>
        <button class="btn primary" data-x="stamp" ${gate.overall !== 'pass' && gate.overall !== 'cond-pass' ? 'disabled' : ''}>📌 打版本</button>
        <button class="btn" data-x="pack">📦 打包交付 ZIP</button>
      </div>
      <div id="rls-releases"></div>
    </div>`;
    U.openModal({
      title: '📦 交付检查 · ' + p.name,
      wide: true,
      body,
      footer: `<button class="btn" data-x="close">关闭</button>`,
      onMount(m, close) {
        renderGates(); renderReleases();
        m.querySelector('[data-x=refresh]').onclick = () => { gate = collect(p, { online: true }); renderGates(); };
        m.querySelector('[data-x=setscore]').onclick = () => {
          const v = +m.querySelector('#rls-score').value;
          const nv = setMinReviewScore(v);
          m.querySelector('#rls-score').value = nv;
          gate = collect(p, { online: true }); renderGates();
          U.toast('审片均分阈值已设为 ' + nv, 'success');
        };
        /* 打版本按钮走领域命令表(project.release):与 CLI `exec project.release`、MCP hujing_release
         * 同名同结构同一条链路,按钮不再直调实现——绕过命令表就等于这个动作在 headless 侧不存在 */
        m.querySelector('[data-x=stamp]').onclick = async () => {
          const note = m.querySelector('#rls-note').value;
          if (gate.overall !== 'pass' && gate.overall !== 'cond-pass') return U.toast('发布门未通过,无法打版本', 'error');
          const r = await Commands.execute('project.release', { pid: p.id, note, gateResult: gate, ui: true });
          if (r.ok) { U.toast('已发布版本:' + String(r.result.digest).slice(0, 16), 'success'); renderReleases(); }
          else U.toast((r.error && r.error.message) || '打版本失败', 'error');
        };
        m.querySelector('[data-x=pack]').onclick = async () => {
          const btn = m.querySelector('[data-x=pack]');
          btn.disabled = true; btn.textContent = '打包中...';
          try { await downloadReleaseZip(p); }
          catch (e) { U.toast('打包失败:' + e.message, 'error'); }
          finally { btn.disabled = false; btn.textContent = '📦 打包交付 ZIP'; }
        };
        m.querySelector('[data-x=close]').onclick = close;
        function renderGates() {
          const host = m.querySelector('#rls-gates');
          if (!host) return;
          host.innerHTML = gate.gates.map(g => `
          <div class="release-gate release-gate-${g.status}">
            <div class="row" style="align-items:center;gap:10px">
              <span class="rel-ico">${g.status === 'pass' ? '✅' : g.status === 'warn' ? '⚠️' : '❌'}</span>
              <div class="grow"><b>${g.label}</b><div class="small muted" style="margin-top:2px">${U.esc(g.info || '')}</div></div>
              <span class="tag ${g.status === 'pass' ? 'green' : g.status === 'warn' ? 'yellow' : ''}">${g.status === 'pass' ? '通过' : g.status === 'warn' ? '警告' : '失败'}</span>
              ${g.fix ? `<button class="btn sm" data-fix="${g.code}">${g.fix.type === 'command' ? '一键处置' : '前往处理'}</button>` : ''}
            </div>
          </div>`).join('');
          host.querySelectorAll('[data-fix]').forEach(b => b.onclick = () => {
            const g2 = gate.gates.find(x => x.code === b.dataset.fix);
            if (!g2 || !g2.fix) return;
            if (g2.fix.type === 'nav') close(); // 导航类处置:先收弹窗再跳转/开对应面板
            b.disabled = true;
            execFix(p, g2, main, () => { gate = collect(p, { online: true }); renderGates(); });
          });
          // 更新 stamp 按钮
          const stampBtn = m.querySelector('[data-x=stamp]');
          if (stampBtn) stampBtn.disabled = !(gate.overall === 'pass' || gate.overall === 'cond-pass');
        }
        function renderReleases() {
          const host = m.querySelector('#rls-releases');
          if (!host) return;
          const list = releaseList(p);
          host.innerHTML = list.length
            ? `<div class="card" style="max-height:240px;overflow-y:auto;padding:10px 14px;background:var(--bg2)">${list.slice().reverse().map(r => `
                <div class="row rel-row" style="gap:10px;padding:6px 0;border-bottom:1px dashed var(--border)">
                  <span class="tag green">v${r.ver}</span>
                  <span class="tag ${r.gate && r.gate.overall === 'pass' ? 'green' : 'yellow'}">${r.gate ? r.gate.overall : ''}</span>
                  <span class="small" style="flex:1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis"><b>${U.esc(r.digest.slice(0, 14))}</b> · ${U.esc(r.when)} · ${U.esc(r.who)}${r.note ? ' · ' + U.esc(r.note).slice(0, 30) : ''}</span>
                  <button class="btn sm" data-roll="${r.digest}" title="回滚到此版本">↺ 回滚</button>
                </div>`).join('')}</div>`
            : '<div class="small muted" style="padding:8px">尚未打版本。通过发布门后在上方输入发布说明并点击「📌 打版本」留痕。</div>';
          host.querySelectorAll('[data-roll]').forEach(b => b.onclick = () => {
            const dig = b.dataset.roll;
            U.confirm('回滚到版本 ' + dig.slice(0, 14) + '?当前未发布的改动将丢失。', () => {
              const rb = rollbackTo(p, dig);
              U.toast(rb.message || (rb.ok ? '已完成回滚步骤' : '失败'), rb.ok ? 'info' : 'error');
              renderReleases();
            }, '版本回滚');
          });
        }
      },
    });
  }
  function descOverall(o) {
    return o === 'pass' ? '全部通过,可以发布' : o === 'cond-pass' ? '条件通过(仅账目/合规复核待后台确认),可打版本' : '未通过,需处理阻塞项';
  }

  /* ---------- 把 buildMaterialFiles 封装暴露给 release 用(不侵入 exporter.js) ---------- */
  window.Exporter = window.Exporter || {};
  if (typeof window.Exporter._buildMaterialShim !== 'function') {
    window.Exporter._buildMaterialShim = async function (p, ep) {
      // 与 exporter.js 内部 buildMaterialFiles 等价的简化版:CSV + 提示词 txt
      const out = [];
      const rows = [['镜号', '名称', '剧情', '运镜', '旁白', '台词', '时长', '提示词', '状态']];
      (ep.shots || []).forEach((s, j) => {
        rows.push([j + 1, s.name || '', s.plot || '', s.camera || '', s.narration || '', s.dialogue || '', (s.duration || 5), s.prompt || '', s.video && s.video.status || '']);
        out.push({ name: 'shot_' + (j + 1) + '_提示词.txt', data: `【镜头 ${j + 1}】${s.name || ''}\n剧情:${s.plot}\n运镜:${s.camera}\n旁白:${s.narration || '无'}\n台词:${s.dialogue || '无'}\n提示词:${s.prompt}\n时长:${s.duration || 5}s` });
      });
      out.push({ name: '分镜表.csv', data: rows.map(r => r.map(x => `"${String(x).replace(/"/g, '""')}"`).join(',')).join('\n') });
      out.push({ name: 'README.txt', data: `分集:${ep.title}\n分镜数:${(ep.shots || []).length}\n导出时间:${Store.now()}` });
      return out;
    };
  }

  /* ---------- 交付门角标的重算不在本文件挂钩 ----------
   * 角标由 js/episodes.js 的通配订阅重画(它按 Release.badgeHTML 现取),制作台三分区由 js/workbench.js
   * 的通配订阅重画;两处都不按事件名过滤,源事件那一轮就已经重算过。本文件曾再转一条 release.dirty
   * 去"触发重算",而三个通配订阅只是把同一轮防抖重置一遍——重绘一次不多,却让 Bus 的 50 格事件留痕
   * 一条主线事件占两格(Agent 的「最近发生了什么」按 Bus.recent 取,能回看的轮数当场对折)。 */

  /* ---------- 导出 ---------- */
  window.Release = {
    collect, badgeHTML, stampRelease, releaseList, rollbackTo,
    buildReleaseZip, downloadReleaseZip, openModal, execFix,
    minReviewScore, setMinReviewScore,
  };
  // 测试桩:在 __TEST 环境下不绑定键盘,纯逻辑测试
})();
