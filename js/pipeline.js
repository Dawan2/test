/* ============ pipeline.js 创作主线(协同层) ============
 * 把分散的功能串成一条可见的主线:剧本→主体→分集→分镜→生成→成片。
 * 项目详情/分集工作区/跑批中心共用同一组件;每一步可点击直达对应页面,
 * 「下一步」chip 根据数据状态实时推导当前最该做的动作。
 */
(function () {
  window.Pipeline = {};

  /* 全链路状态推导(项目级):制片→剧本→导演→主体→分集→分镜→生成→成片→剧壳→切片,贯穿项目页与分镜工作区 */
  function calc(p) {
    const eps = p.episodes || [];
    const totalShots = eps.reduce((n, e) => n + (e.shots || []).length, 0);
    const vDone = eps.reduce((n, e) => n + (e.shots || []).filter(s => Store.shotVideoReady(s)).length, 0); // 就绪=真实出片(离线模拟在线时不计入)
    const composed = eps.filter(e => Store.epComposedReady(e)).length;
    const anyStale = eps.some(e => (e.shots || []).some(s => Store.shotVideoStale(p, s))); // 输入已变更:旧成片视为过期,主线退回"未完成"
    const sh = p.shell || {};
    return [
      { key: 'prod', name: '制片', done: !!(sh.selling || sh.owner || sh.startDate), doing: false },
      { key: 'script', name: '剧本', done: !!(p.script || p.extractDone), doing: false },
      { key: 'director', name: '导演', done: !!(p.concept && p.concept.statement), doing: false },
      { key: 'subjects', name: '主体', done: (p.subjects || []).length > 0, doing: false },
      { key: 'eps', name: '分集', done: eps.length > 0, doing: false },
      { key: 'shots', name: '分镜', done: eps.length > 0 && eps.every(e => (e.shots || []).length > 0), doing: eps.some(e => (e.shots || []).length > 0) },
      { key: 'gen', name: '剪辑', done: totalShots > 0 && vDone === totalShots, doing: vDone > 0 }, // 剪辑台:转场/调序/审片选优/合成(分镜视频在「分镜」步骤生成)
      { key: 'film', name: '成片', done: eps.length > 0 && composed === eps.length && !anyStale, doing: composed > 0 },
      { key: 'shell', name: '剧壳', done: !!(p.shell && p.shell.dist && (p.shell.dist.introLong || p.shell.dist.posterV || p.shell.dist.logline)), doing: false }, // 剧壳=项目级发行物料包(主海报/简介/卖点)
      { key: 'clips', name: '切片', done: eps.some(e => (e.clips || []).length > 0), doing: false },
    ];
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

  /* 可点击主线 HTML(每一步可点,直达对应环节) */
  Pipeline.html = function (p, opts) {
    opts = opts || {};
    const steps = calc(p);
    const cur = steps.findIndex(s => !s.done);
    return `<div class="row" style="justify-content:${opts.center === false ? 'flex-start' : 'center'};align-items:center;flex-wrap:wrap;gap:6px;${opts.style || 'margin:2px 0 14px'}">
      ${steps.map((s, i) => `
      ${i ? '<span class="small muted">→</span>' : ''}
      <span class="tag ${s.done ? 'green' : (s.doing || i === cur) ? 'cyan' : ''}" data-step="${s.key}" style="cursor:pointer${i === cur ? ';font-weight:600;box-shadow:0 0 0 1px var(--accent)' : ''}"
        title="${s.done ? '已完成,点击回看' : i === cur ? '当前步骤,点击前往' : s.doing ? '进行中,点击继续' : '未开始,点击前往'}">${s.done ? '✓ ' : ''}${s.name}</span>`).join('')}
    </div>`;
  };

  Pipeline.hashOf = hashOf; // 供外部指定视图后跳转(__epView)
  Pipeline.calc = calc; // 供项目页 tab 打完成勾(流程条已并入 tab 行)

  Pipeline.bind = function (root, p) {
    root.querySelectorAll('[data-step]').forEach(t => t.onclick = () => { location.hash = hashOf(p, t.dataset.step); });
  };

  /* 项目级下一步(项目详情页用) */
  Pipeline.nextForProject = function (p) {
    const eps = p.episodes || [];
    if (!(p.script || p.extractDone)) return { txt: '📄 上传剧本', hash: '#/project/' + p.id };
    if (!(p.subjects || []).length) return { txt: '🎭 主体提取与生成', hash: '#/project/' + p.id + '/roles' };
    if (!eps.length) return { txt: '📖 新建分集', hash: '#/project/' + p.id };
    const noShots = eps.find(e => !(e.shots || []).length);
    if (noShots) return { txt: `🧠 生成分镜:${noShots.title}`, hash: `#/project/${p.id}/episode/${noShots.id}` };
    const undone = eps.find(e => (e.shots || []).some(s => !Store.shotVideoReady(s)));
    if (undone) return { txt: `🎬 继续生成:${undone.title}`, hash: `#/project/${p.id}/episode/${undone.id}` };
    const uncomp = eps.find(e => !Store.epComposedReady(e));
    if (uncomp) return { txt: `🎞 合成成片:${uncomp.title}`, hash: `#/project/${p.id}/episode/${uncomp.id}` };
    return { txt: '🏭 量产跑批 / 导出交付', hash: '#/project/' + p.id + '/produce' };
  };

  /* 项目级上一步(项目详情页用):当前首个未完成步骤的前一步 */
  Pipeline.prevForProject = function (p) {
    const steps = calc(p);
    const cur = steps.findIndex(s => !s.done);
    const idx = (cur === -1 ? steps.length - 1 : cur) - 1;
    if (idx < 0) return null;
    return { key: steps[idx].key, txt: steps[idx].name, hash: hashOf(p, steps[idx].key) };
  };

  /* 分集级上一步(分集工作区用,返回动作而非跳转) */
  Pipeline.prevForEp = function (p, ep) {
    const shots = ep.shots || [];
    if (!shots.length) return { key: 'subjects', txt: '← 上一步:主体/剧本' };
    const undone = shots.filter(s => !s.video || s.video.status !== 'done').length;
    if (undone) return { key: 'shots', txt: '← 上一步:生成分镜' };
    if (!Store.epComposedReady(ep)) return { key: 'gen', txt: '← 上一步:生成视频' }; // 统一就绪判定
    return { key: 'film', txt: '← 上一步:合成成片' };
  };

  /* 分集级下一步(分集工作区用,返回动作而非跳转) */
  Pipeline.nextForEp = function (p, ep) {
    const shots = ep.shots || [];
    if (!shots.length) return { key: 'shots', txt: '🧠 生成分镜' };
    const undone = shots.filter(s => !s.video || s.video.status !== 'done').length;
    if (undone) return { key: 'gen', txt: `🎬 生成视频(${undone} 镜待出)` };
    if (!Store.epComposedReady(ep)) return { key: 'film', txt: '🎞 合成成片' }; // 统一就绪判定
    return { key: 'export', txt: '导出 ⬇' };
  };
})();
