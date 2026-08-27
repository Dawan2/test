/* ============ issues.js 问题中心(协同层,第三阶段) ============
 * 项目级待处理问题单一聚合:失败镜/过期镜/未分镜/缺剧本/低分审片/待确认/成片过期/主体缺图/跨镜主体不一致/字幕读不顺,
 * 逐项由 Domain.episodeState(blockers/counts)推导——与流程条/下一步/跑批/CLI 同一口径,不自造第二套状态。
 * 每项问题带可操作处置:命令类(episode.generateVideos shotIds 子集重生成/智能分镜/重新合成)经统一命令层
 * ui 模式执行;导航类跳对应页面。入口:项目页「问题」按钮(角标=未解决数,Bus 事件驱动实时刷新)。 */
(function () {

  const online = () => !!(window.Media && Media.isReady && Media.isReady());

  /* 跨镜主体一致性命中码 → 展示文案(判据在 js/skills.js 的校验项,本层只管展示,不写第二份判定) */
  const CONSIST = {
    'ref-image-drift': '参考图与其余镜不是同一张',
    'ref-lock-gap': '未进参考图组(形象无锁)',
    'alias-drift': '引用名与其余镜不统一',
  };
  /* 成片字幕命中码 → 展示文案(同上:判据在校验项,本层只管展示) */
  const CAPTION = {
    'caption-truncated': '超烧录上限,合成时被截断',
    'caption-too-long': '一条字幕塞满画面,建议拆条',
    'read-too-fast': '停留太短,字幕读不完',
    'caption-flash': '字幕一闪而过',
    'no-caption-track': '开了烧录字幕却无一句对白/旁白',
  };
  /* 剧本文本面命中码 → 展示文案(同上:判据只在 js/skills.js 的校验项里一份) */
  const CRAFT = {
    'no-hook-anchor': '全文未见冲突锚点',
    'late-hook': '开篇未直接进冲突',
    'missing-step': '打脸四步缺环节',
    'step-out-of-order': '打脸四步步序倒置',
    'long-line': '台词单句超长',
    'ai-cliche': 'AI 套话',
    'spoken-formal': '台词写成书面腔',
    'adverb-flood': '修饰副词堆砌',
  };
  /* 命中 → 一行明细:码文案 + 定位(打脸步名 / 台词摘要 / 镜号) */
  const craftLine = h => (CRAFT[h.code] || h.code)
    + (h.step ? `「${h.step}」` : h.name ? `「${h.name}」` : '')
    + (h.order ? `(镜头${h.order})` : '');
  /* 分集面命中码 → 展示文案(同上:判据只在 js/skills.js 的校验项里一份) */
  const EPSC = {
    'stage-uncovered': '这一段弧线没有正文',
    'stage-thin': '这一段被压成过场',
    'early-no-reversal': '开篇期未见反转',
    'flat-ending': '结尾平收,卡点没落在集尾',
    'payoff-not-cashed': '卡点承诺未在下一集兑现',
  };
  /* 六阶段覆盖命中 → 一行明细:码文案 + 段名与集号区间 */
  const stageLine = h => `${h.stage || ''}(第${h.from}-${h.to}集)${EPSC[h.code] || h.code}`;
  /* 付费卡点命中 → 一行明细:码文案 + 兑现落空时点到下一集 */
  const payoffLine = h => (EPSC[h.code] || h.code) + (h.next ? `(应在第${h.next}集兑现)` : '');
  /* 分镜景别面命中码 → 展示文案(同上:判据只在 js/skills.js 的校验项里一份) */
  const SIZE = {
    'flat-run': '连续同景别,没有递进',
    'jump-cut': '两极对切,缺过渡镜',
    'no-progression': '景别几乎没动过,始终没用上隔级切换',
  };
  /* 命中 → 一行明细:镜号区间(整集级命中无镜号)+ 码文案 + 景别走向 */
  const sizeLine = h => (h.order ? `镜头${h.order}${h.to > h.order ? '-' + h.to : ''}` : '整集')
    + (SIZE[h.code] || h.code) + (h.base ? `(${h.base}→${h.name})` : h.name ? `(${h.name})` : '');

  /* ================= 问题清单推导(纯数据,可 vm 沙箱测试) =================
   * 条目:{ kind, sev(high|mid|low), count, label, detail, epid?, epTitle?, cmd?, shotIds?, goto? }
   * cmd 条目经 Commands.execute(cmd,{pid,epid,shotIds,ui:true}) 处置;goto 条目直接跳转。 */
  function collect(p) {
    const out = [];
    if (!p) return out;
    const on = online();
    /* 项目级:主体缺权威参考图(生成防废片警示的前置阻塞) */
    const noImg = (p.subjects || []).filter(s => !s.image);
    if (noImg.length) out.push({
      kind: 'subject-no-image', sev: 'mid', count: noImg.length,
      label: `${noImg.length} 个主体缺权威参考图`,
      detail: '缺参考图的主体参与生成会触发防废片警示:' + noImg.slice(0, 6).map(s => s.name).join('、') + (noImg.length > 6 ? ` 等 ${noImg.length} 个` : ''),
      goto: '#/project/' + p.id + '/roles',
    });
    /* 项目级:六阶段结构覆盖(js/skills.js SK-14 校验项,纯本地零 LLM 零计费)——判定输入是整张分集表,
     * 故按项目挂一条而不是逐集重复报;低危只报不拦,不改门禁状态也不进 Domain 的阻塞项 */
    const arc = window.Skills ? (Skills.check('eps', { p }).find(x => x.skill === 'eps.structureStage') || {}).hits || [] : [];
    if (arc.length) out.push({
      kind: 'eps-structure', sev: 'low', count: arc.length,
      label: `分集表 ${arc.length} 处六阶段结构提醒`,
      detail: arc.slice(0, 4).map(stageLine).join(';') + (arc.length > 4 ? ` 等 ${arc.length} 处` : '')
        + '——判据取自知识库条目,只提醒不拦生成',
      goto: '#/project/' + p.id,
    });
    (p.episodes || []).forEach((ep, i) => {
      const st = window.Domain ? Domain.episodeState(p, ep, on) : { counts: {}, blockers: [] };
      const c = st.counts || {};
      const base = { epid: ep.id, epTitle: ep.title || ('第' + (i + 1) + '集') };
      /* 每条问题必须 Object.assign({}, base, …) 新开对象:同一集可挂多条问题,直接改 base 会让已入组条目全部串成同一引用(二十二轮修复) */
      if (!(ep.content || '').trim()) {
        out.push(Object.assign({}, base, { kind: 'no-script', sev: 'high', count: 1, label: `「${ep.title}」缺剧本正文`, detail: '无剧本无法拆镜与生成本集理解', goto: `#/project/${p.id}/episode/${ep.id}` }));
        return;
      }
      /* 剧本文本面校验项(js/skills.js SK-07/08/09/10,纯本地零 LLM 零计费):开篇钩子锚定 / 打脸四步 / 台词单句长度 / 文案 AI 味 →
       * 低危提醒,只报不拦——发布门 G2 只数高/中危,本项不改门禁状态,也不进 Domain 的阻塞项。
       * 位置在未分镜等早退分支之前:剧本刚写完还没拆镜时正是这几条最该看得见的时候 */
      const craft = window.Skills ? [].concat(...Skills.check('script', { p, ep }).map(x => x.hits)) : [];
      if (craft.length) out.push(Object.assign({}, base, {
        kind: 'script-craft', sev: 'low', count: craft.length,
        label: `「${ep.title}」${craft.length} 处剧本方法论提醒`,
        detail: craft.slice(0, 4).map(craftLine).join(';') + (craft.length > 4 ? ` 等 ${craft.length} 处` : '')
          + '——判据取自知识库条目,只提醒不拦生成',
        goto: `#/project/${p.id}/episode/${ep.id}`,
      }));
      /* 付费卡点位置(js/skills.js SK-15 校验项,同上纯本地零 LLM 零计费):集尾是不是情绪最高那一拍、
       * 卡点承诺有没有在下一集兑现——与剧本面同为低危提醒,同样排在未拆镜等早退分支之前 */
      const payoff = window.Skills ? (Skills.check('eps', { p, ep }).find(x => x.skill === 'eps.payoffPoint') || {}).hits || [] : [];
      if (payoff.length) out.push(Object.assign({}, base, {
        kind: 'eps-payoff', sev: 'low', count: payoff.length,
        label: `「${ep.title}」${payoff.length} 处付费卡点提醒`,
        detail: payoff.map(payoffLine).join(';') + '——判据取自知识库条目,只提醒不拦生成',
        goto: `#/project/${p.id}/episode/${ep.id}`,
      }));
      if (!c.total) { out.push(Object.assign({}, base, { kind: 'no-shots', sev: 'mid', count: 1, label: `「${ep.title}」未生成分镜`, detail: '已有剧本未拆镜,可直接智能分镜', cmd: 'episode.generateStoryboard' })); return; }
      if (st.shotsStale) { out.push(Object.assign({}, base, { kind: 'shots-stale', sev: 'mid', count: 1, label: `「${ep.title}」分镜表基于旧剧本/图谱`, detail: '剧本或事件图谱修订后未重新拆镜', goto: `#/project/${p.id}/episode/${ep.id}` })); return; }
      if (c.failed) {
        const fs = (ep.shots || []).filter(s => s.video && s.video.status === 'failed');
        out.push(Object.assign({}, base, {
          kind: 'failed-shots', sev: 'high', count: c.failed, label: `「${ep.title}」${c.failed} 镜生成失败`,
          detail: fs.map(s => `镜头${s.order + 1}:${String(s.video.error || '未知错误').slice(0, 36)}`).slice(0, 4).join(';') + (fs.length > 4 ? '…' : '') + '(失败已退费,可重试)',
          cmd: 'episode.generateVideos', shotIds: fs.map(s => s.id),
        }));
      }
      if (c.stale) {
        const ss = (ep.shots || []).filter(s => Domain.shotVideoStale(p, s, on));
        out.push(Object.assign({}, base, { kind: 'stale-shots', sev: 'mid', count: c.stale, label: `「${ep.title}」${c.stale} 镜素材已更新(过期)`, detail: `镜头 ${ss.map(s => s.order + 1).slice(0, 8).join('、')}${ss.length > 8 ? '…' : ''} 生成后输入有变化,建议重生成`, goto: `#/project/${p.id}/episode/${ep.id}` }));
      }
      if (c.unconfirmed && !c.generating) out.push(Object.assign({}, base, { kind: 'unconfirmed', sev: 'low', count: c.unconfirmed, label: `「${ep.title}」${c.unconfirmed} 镜待确认`, detail: '未确认镜头不参与批量生成,先过确认闸', goto: `#/project/${p.id}/episode/${ep.id}` }));
      if (!st.reviewStale && st.reviewAvg !== null && st.reviewAvg !== undefined && st.reviewAvg < 7) { // 判旧(rev/快照失配)的旧分不再报问题;「需重审」语义由分集页/报告页「旧版」标记承接
        const lows = ((ep.lastReview || {}).perShot || []).filter(x => x.score < 7);
        out.push(Object.assign({}, base, { kind: 'low-review', sev: 'mid', count: lows.length || 1, label: `「${ep.title}」审片均分 ${st.reviewAvg} 低于达标线`, detail: lows.length ? `低分镜:${lows.map(x => (x.order + 1) + '镜' + x.score + '分').slice(0, 6).join('、')}` : '整体质量待修订(可让助手按问题清单优化提示词)', goto: `#/project/${p.id}/episode/${ep.id}` }));
      }
      if (ep.composed && !st.composedReady) out.push(Object.assign({}, base, { kind: 'composed-stale', sev: 'mid', count: 1, label: `「${ep.title}」成片已过期`, detail: '合成输入或剧本已变化,需重新合成', cmd: 'episode.compose' }));
      /* 跨镜主体一致性(js/skills.js 校验项,纯本地零 LLM 零计费):同一主体在镜间锁到的参考图/引用名不一致 →
       * 低危提醒,只报不拦——发布门 G2 只数高/中危,本项不改门禁状态,也不进 Domain 的阻塞项 */
      const consist = window.Skills ? (Skills.check('subjects', { p, ep }).find(x => x.skill === 'subjects.crossShot') || {}).hits || [] : [];
      if (consist.length) out.push(Object.assign({}, base, {
        kind: 'subject-inconsistent', sev: 'low', count: consist.length,
        label: `「${ep.title}」${consist.length} 处跨镜主体参考不一致`,
        detail: consist.slice(0, 4).map(h => `镜头${h.order}「${h.name}」${CONSIST[h.code] || h.code}`).join(';')
          + (consist.length > 4 ? ` 等 ${consist.length} 处` : '') + '——同一主体形象易在镜间漂移',
        goto: `#/project/${p.id}/episode/${ep.id}`,
      }));
      /* 分镜景别递进与跳切(js/skills.js SK-18 校验项,纯本地零 LLM 零计费):级差经 WfCore.sizeGap 判,
       * 连续同景别/两极对切/整集无递进 → 低危提醒,只报不拦——发布门 G2 只数高/中危,本项不改门禁状态 */
      const sizes = window.Skills ? (Skills.check('shots', { p, ep }).find(x => x.skill === 'shots.sizeProgression') || {}).hits || [] : [];
      if (sizes.length) out.push(Object.assign({}, base, {
        kind: 'shot-size-linkage', sev: 'low', count: sizes.length,
        label: `「${ep.title}」${sizes.length} 处景别衔接提醒`,
        detail: sizes.slice(0, 4).map(sizeLine).join(';') + (sizes.length > 4 ? ` 等 ${sizes.length} 处` : '')
          + '——判据取自知识库条目,只提醒不拦生成',
        goto: `#/project/${p.id}/episode/${ep.id}`,
      }));
      /* 成片字幕/对白可读性(js/skills.js 校验项,纯本地零 LLM 零计费):以合成时间轴段判阅读速度与截断 →
       * 低危提醒,只报不拦——发布门 G2 只数高/中危,本项不改门禁状态,也不进 Domain 的阻塞项 */
      const caption = window.Skills ? (Skills.check('film', { p, ep }, { online: on }).find(x => x.skill === 'film.subtitleQC') || {}).hits || [] : [];
      if (caption.length) out.push(Object.assign({}, base, {
        kind: 'caption-unreadable', sev: 'low', count: caption.length,
        label: `「${ep.title}」${caption.length} 处字幕读不顺`,
        detail: caption.slice(0, 4).map(h => (h.order ? `镜头${h.order}` : '整集') + (h.chars ? `(${h.chars}字/${h.dur}秒)` : '') + (CAPTION[h.code] || h.code)).join(';')
          + (caption.length > 4 ? ` 等 ${caption.length} 处` : '') + '——成片字幕与 SRT 同一时间轴,合成前改台词/裁剪最省事',
        goto: `#/project/${p.id}/episode/${ep.id}`,
      }));
    });
    const SEV = { high: 0, mid: 1, low: 2 };
    const sevOf = x => (SEV[x] === undefined ? 9 : SEV[x]);
    return out.sort((a, b) => sevOf(a.sev) - sevOf(b.sev));
  }

  /* 未解决问题数(项目页角标) */
  function count(p) { return collect(p).length; }

  /* ================= 处置动作 ================= */
  async function fixIssue(p, it, main, onDone) {
    if (it.cmd) {
      if (!window.Commands) { U.toast('命令层未加载,请稍后重试', 'error'); return; }
      const r = await Commands.execute(it.cmd, { pid: p.id, epid: it.epid, shotIds: it.shotIds, main: main || document.getElementById('main'), ui: true });
      Commands.digest(r);
      if (onDone) onDone(r);
      return r;
    }
    if (it.goto) { location.hash = it.goto; if (onDone) onDone(null); return null; }
  }

  /* ================= 问题中心弹窗 ================= */
  let openState = null; // {p, bodyEl, close, main} 弹窗开着时 Bus 事件驱动重算

  const SEV_TAG = { high: ['red', '高'], mid: ['yellow', '中'], low: ['', '低'] };
  const FIX_LABEL = { 'episode.generateVideos': '▶ 重生成', 'episode.generateStoryboard': '▶ 智能分镜', 'episode.compose': '▶ 重新合成' };

  function issueRow(p, it, idx) {
    const [cls, name] = SEV_TAG[it.sev] || ['', ''];
    return `
    <div class="card" style="padding:10px 12px;margin-bottom:8px">
      <div class="row" style="gap:6px;align-items:flex-start">
        ${cls ? `<span class="tag ${cls}" style="flex:none;font-size:10px">${name}</span>` : ''}
        <div class="grow">
          <div class="small" style="font-weight:600">${U.esc(it.label)}</div>
          <div class="small muted" style="margin-top:2px;line-height:1.5">${U.esc(it.detail)}</div>
        </div>
        ${it.cmd ? `<button class="btn sm primary" data-ifx="${idx}" style="flex:none">${FIX_LABEL[it.cmd] || '▶ 处理'}</button>`
        : it.goto ? `<button class="btn sm" data-igoto="${idx}" style="flex:none">→ 去处理</button>` : ''}
      </div>
    </div>`;
  }

  function paintBody(list) {
    const { p, bodyEl, main } = openState;
    const list2 = list || collect(p); // §3.4:调用方可传入共享重算结果(防抖轮内 badge 与弹窗同一快照)
    const hi = list2.filter(x => x.sev === 'high').length, mid = list2.filter(x => x.sev === 'mid').length, low = list2.length - hi - mid;
    bodyEl.innerHTML = list2.length ? `
      <div class="hint" style="margin-bottom:10px">全项目待处理问题聚合(失败/过期/未分镜/低分/待确认/缺图,与流程条同一套状态推导):
        <span class="tag red" style="font-size:10px">高 ${hi}</span> <span class="tag yellow" style="font-size:10px">中 ${mid}</span> <span class="tag" style="font-size:10px">低 ${low}</span>
        ——命令类问题一键处置(经统一命令层,含确认闸/预审),导航类跳转对应页面。</div>
      ${list2.map((it, idx) => issueRow(p, it, idx)).join('')}` : '<div class="empty"><p class="small muted">🎉 项目无待处理问题,主线畅通。</p></div>';
    bodyEl.querySelectorAll('[data-ifx]').forEach(b => b.onclick = async () => {
      const it = list2[+b.dataset.ifx]; // 快照索引与渲染行对齐(处置后 paintBody() 无参重算刷新)
      if (!it) return;
      b.disabled = true;
      await fixIssue(p, it, main, () => paintBody());
      paintBody();
    });
    bodyEl.querySelectorAll('[data-igoto]').forEach(b => b.onclick = () => {
      const it = list2[+b.dataset.igoto];
      if (it && it.goto) { openState.close(); location.hash = it.goto; }
    });
  }

  function openModal(p, main) {
    if (openState && openState.close) openState.close();
    U.openModal({
      title: `🩺 问题中心 · ${U.esc(p.name)}`,
      wide: true,
      body: '<div data-issues-body></div>',
      onMount(m, close) {
        openState = { p, bodyEl: m.querySelector('[data-issues-body]'), close, main };
        paintBody();
      },
    });
  }

  /* Bus 通配订阅:管线事件(生成/审片/合成落定)驱动弹窗与项目页角标实时重算。
   * §3.4:150ms 防抖合并事件风暴;一轮防抖内 badge 与弹窗共享同一次 collect 快照——
   * 此前每个事件各自全量重算(collect 对每集推导 episodeState/shotInputHash,大项目=每事件 2×全项目扫描) */
  function bindBus() {
    if (!window.Bus || bindBus._done) return;
    bindBus._done = true;
    let timer = null;
    Bus.on('*', () => {
      const modalOpen = !!(openState && openState.bodyEl && openState.bodyEl.isConnected);
      const btn = document.querySelector('[data-x=pissues][data-pid]');
      if (!modalOpen && !btn) return;
      clearTimeout(timer);
      timer = setTimeout(() => {
        const cache = {}; // pid → 本轮 collect 快照
        const collect1 = p => (cache[p.id] = cache[p.id] || collect(p));
        const modalStillOpen = !!(openState && openState.bodyEl && openState.bodyEl.isConnected);
        if (modalStillOpen) paintBody(collect1(openState.p));
        if (btn.isConnected) {
          const p = Store.getProject(btn.dataset.pid);
          if (p) btn.innerHTML = badgeHTML(p, collect1(p));
        }
      }, 150);
    });
  }
  if (typeof document !== 'undefined') bindBus();

  /* 项目页入口按钮内联 HTML(角标实时重算用同一实现;list 可传入共享快照) */
  function badgeHTML(p, list) {
    const n = list ? list.length : count(p);
    return `🩺 问题${n ? ` <b style="color:var(--red)">${n}</b>` : ''}`;
  }

  window.Issues = { collect, count, fixIssue, openModal, badgeHTML };
})();
