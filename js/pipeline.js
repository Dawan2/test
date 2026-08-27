/* ============ pipeline.js 创作主线(协同层) ============
 * 把分散的功能串成一条可见的主线:剧本→主体→分集→分镜→生成→成片;制片/导演/剧壳/切片为支线。
 * 状态唯一来源 js/domain.js(workflow/episodeState):流程条、「下一步」、跑批、CLI workflow
 * 读同一套推导,不再各自解释业务数据;每一步可点击直达对应页面。 */
(function () {
  window.Pipeline = {};
  /* 在线判定:domain 就绪函数的环境参数 */
  const _online = () => !!(window.Media && Media.isReady());

  /* 全链路状态推导(项目级):委托 Domain.workflow——主线步骤(剧本/主体/分集/分镜/剪辑/成片)
   * + 支线步骤(制片/导演/剧壳/切片,side:true,不阻塞主线);键名与历史一致(tab 打勾/Agent 步骤图/跑批映射不变) */
  function calc(p) {
    return Domain.workflow(p, _online()).steps;
  }

  /* 步骤点击目标 */
  function hashOf(p, key) {
    const eps = p.episodes || [];
    const firstEp = eps[0];
    const undoneEp = eps.find(e => (e.shots || []).some(s => !Store.shotVideoReady(s)));
    const noShotEp = eps.find(e => !(e.shots || []).length);
    switch (key) {
      case 'prod': case 'script': case 'eps': case 'director': case 'shell': case 'clips': return '#/project/' + p.id;
      case 'subjects': return '#/project/' + p.id + '/roles';
      case 'shots': return noShotEp ? `#/project/${p.id}/episode/${noShotEp.id}` : (firstEp ? `#/project/${p.id}/episode/${firstEp.id}` : '#/project/' + p.id);
      case 'gen': return undoneEp ? `#/project/${p.id}/episode/${undoneEp.id}` : (firstEp ? `#/project/${p.id}/episode/${firstEp.id}` : '#/project/' + p.id);
      case 'film': return '#/project/' + p.id + '/produce';
      default: return '#/project/' + p.id;
    }
  }

  /* 可点击主线 HTML:主线步骤一行(当前步高亮),支线步骤小字一行;每一步可点,直达对应环节 */
  Pipeline.html = function (p, opts) {
    opts = opts || {};
    const steps = calc(p);
    const mains = steps.filter(s => !s.side);
    const sides = steps.filter(s => s.side);
    const cur = mains.findIndex(s => !s.done);
    const tagOf = (s, isCur) => `<span class="tag ${s.done ? 'green' : (s.doing || isCur) ? 'cyan' : ''}" data-step="${s.key}" style="cursor:pointer${isCur ? ';font-weight:600;box-shadow:0 0 0 1px var(--accent)' : ''}"
      title="${(s.blockers || []).length ? s.blockers.map(b => b.label).join(';') : s.done ? '已完成,点击回看' : isCur ? '当前步骤,点击前往' : s.doing ? '进行中,点击继续' : '未开始,点击前往'}">${s.done ? '✓ ' : ''}${s.name}</span>`;
    return `<div>
      <div class="row" style="justify-content:${opts.center === false ? 'flex-start' : 'center'};align-items:center;flex-wrap:wrap;gap:6px;${opts.style || 'margin:2px 0 4px'}">
      ${mains.map((s, i) => `${i ? '<span class="small muted">→</span>' : ''}${tagOf(s, i === cur)}`).join('')}
      </div>
      <div class="row" style="justify-content:${opts.center === false ? 'flex-start' : 'center'};align-items:center;flex-wrap:wrap;gap:6px;margin:0 0 10px">
        <span class="small muted">支线</span>${sides.map(s => tagOf(s, false)).join('')}
      </div>
    </div>`;
  };

  Pipeline.hashOf = hashOf; // 供外部指定视图后跳转(__epView)
  Pipeline.calc = calc; // 供项目页 tab 打完成勾(流程条已并入 tab 行)

  Pipeline.bind = function (root, p) {
    root.querySelectorAll('[data-step]').forEach(t => t.onclick = () => { location.hash = hashOf(p, t.dataset.step); });
  };

  /* 项目级下一步(项目详情页用):推荐动作由 Domain.workflow 唯一推导(阻塞细节与 P0-3 动态开场同源) */
  Pipeline.nextForProject = function (p) {
    const ra = Domain.workflow(p, _online()).recommendedAction;
    const icons = { script: '📄', subjects: '🎭', eps: '📖', shots: '🧠', gen: '🎬', compose: '🎞', produce: '🏭' };
    if (!ra) return { txt: '🏭 量产跑批 / 导出交付', hash: '#/project/' + p.id + '/produce' };
    let txt = ra.label;
    if (ra.key === 'gen') { // 生成步骤补阻塞尾注(过期/失败/待确认,与 AgentOps.stateDigest 同源)
      const epId = (ra.hash || '').split('/episode/')[1];
      const ep = (p.episodes || []).find(e => e.id === epId);
      if (ep) txt += digestNote(p, ep);
    }
    return { txt: (icons[ra.key] || '▶') + ' ' + txt, hash: ra.hash };
  };

  /* 阻塞项尾注:过期 > 失败 > 待确认 > 未生成,取前两项(如「(2 镜已过期·1 镜失败)」);AgentOps 未加载时退化为空 */
  function digestNote(p, ep) {
    if (!(window.AgentOps && AgentOps.stateDigest)) return '';
    const d = AgentOps.stateDigest(p, ep);
    const parts = [];
    if (d.stale) parts.push(`${d.stale} 镜已过期`);
    if (d.failed) parts.push(`${d.failed} 镜失败`);
    if (d.uncfm) parts.push(`${d.uncfm} 镜待确认`);
    if (!parts.length && d.noVideo) parts.push(`${d.noVideo} 镜未生成`);
    return parts.length ? `(${parts.slice(0, 2).join('·')})` : '';
  }

  /* 项目级上一步(项目详情页用):主线首个未完成步骤的前一步(支线不参与) */
  Pipeline.prevForProject = function (p) {
    const mains = calc(p).filter(s => !s.side);
    const cur = mains.findIndex(s => !s.done);
    const idx = (cur === -1 ? mains.length : cur) - 1;
    if (idx < 0) return null;
    return { key: mains[idx].key, txt: mains[idx].name, hash: hashOf(p, mains[idx].key) };
  };

  /* 分集级上一步(分集工作区用,返回动作而非跳转) */
  Pipeline.prevForEp = function (p, ep) {
    const st = Domain.episodeState(p, ep, _online());
    if (!st.counts.total) return { key: 'subjects', txt: '← 上一步:主体/剧本' };
    if (st.counts.done < st.counts.total) return { key: 'shots', txt: '← 上一步:生成分镜' };
    if (!st.composedReady) return { key: 'gen', txt: '← 上一步:生成视频' }; // 统一就绪判定
    return { key: 'film', txt: '← 上一步:合成成片' };
  };

  /* 分集级下一步(分集工作区用):Domain.episodeState 唯一推导——真实就绪/过期/失败/待确认/审片统一检查 */
  Pipeline.nextForEp = function (p, ep) {
    const st = Domain.episodeState(p, ep, _online());
    const c = st.counts;
    const note = digestNote(p, ep);
    switch (st.status) {
      case 'ready':
        if (st.action.key === 'shots') return { key: 'shots', txt: '🧠 生成分镜' };
        if (st.action.key === 'gen') return { key: 'gen', txt: `🎬 生成视频(${c.total - c.done} 镜待出${note ? '·' + note.slice(1, -1) : ''})` };
        return { key: 'film', txt: '🎞 合成成片' };
      case 'stale':
        if (st.action.key === 'reshoot') return { key: 'shots', txt: '🔄 重新拆镜(剧本/图谱已更新)' };
        if (st.action.key === 'regen-stale') return {
          key: 'regen-stale', txt: `🔄 重生成过期镜(${c.stale})`,
          /* 过期 done 镜被所有批量入口(!shotVideoReady 过滤)排除,唯一出口=命令层 shotIds 子集重生成;
           * 调用方(分集工作区「下一步」按钮)对带 run 的动作直接执行,不再映射批量入口 */
          run: main => Commands.execute('episode.generateVideos', {
            pid: p.id, epid: ep.id, main, ui: true,
            shotIds: (ep.shots || []).filter(s => Domain.shotVideoStale(p, s, _online())).map(s => s.id),
          }).then(r => Commands.digest(r)),
        };
        return { key: 'film', txt: '🎞 重新合成(已过期)' };
      case 'running': return { key: 'gen', txt: `⏳ 生成中(${c.generating} 镜在飞)` };
      case 'blocked':
        if (st.action && st.action.key === 'fix-failed') return { key: 'gen', txt: `⚠ 处理失败镜(${c.failed})` };
        return { key: 'script', txt: '📄 补充剧本' };
      case 'needs_review': return { key: 'confirm', txt: `👁 确认镜头(${c.unconfirmed} 待确认)` };
      case 'needs_human': return { key: 'review', txt: `🧠 审片修订(均分 ${st.reviewAvg})` };
      default: return { key: 'export', txt: '导出 ⬇' };
    }
  };
})();
