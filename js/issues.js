/* ============ issues.js 问题中心投影(双端:浏览器 window.Issues / Node require) ============
 * 项目级待处理问题单一聚合:失败镜/过期镜/未分镜/缺剧本/未审片/审片记录过期/低分审片/待确认/成片过期/
 * 主体缺图/跨镜主体不一致/提示词稳定词/字幕读不顺,外加剧本/主体/分集三步的前置门槛断点,
 * 逐项由 Domain.episodeState(blockers/counts/审片三态)与 Domain.gateBlockers(项目级前置三步)推导——
 * 与流程条/下一步/跑批/CLI 同一口径,不自造第二套状态,码名也与 Domain 的阻塞码同一份;
 * 方法论低危提醒逐项由 Skills.check 的既有结论投影,判据一条不在本层。
 * 环境差异(在线与否)经 ctx.online 显式传入,项目树经参数传入,本模块不读 window/Media/Store;
 * 纯数据推导,无 DOM/网络/存储副作用,可安全运行于 vm 沙箱、Node(cli.js/mcp.js)与浏览器。
 * 弹窗渲染、Bus 订阅与命令层处置在浏览器薄封装 js/issues-ui.js(它保持 window.Issues 全局名不变)。
 * 加载点成对:index.html 在 skills.js 之后、issues-ui.js 之前;cli.js require。 */
(function (root, factory) {
  const isNode = typeof module === 'object' && module.exports;
  const I = factory(isNode ? require('./domain.js') : root.Domain, isNode ? () => require('./skills.js') : () => root.Skills);
  if (isNode) module.exports = I; else root.Issues = I;
})(typeof self !== 'undefined' ? self : globalThis, function (Domain, skills) {
  'use strict';

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
  /* 分镜提示词稳定词面命中码 → 展示文案(同上:判据只在 js/skills.js 的校验项里一份) */
  const LEX = {
    'no-stable-word': '提示词一个稳定词都没写',
    'stable-word-partial': '稳定词只写了一部分',
    'vague-word': '模糊词等于没写',
  };
  /* 命中 → 一行明细:镜号 + 码文案 + 命中的模糊词 / 该补的稳定词字面 */
  const lexLine = h => `镜头${h.order}${LEX[h.code] || h.code}`
    + (h.code === 'vague-word' ? `(${h.name})` : h.miss ? `(该补:${h.miss})` : '');
  /* 跨镜主体一致性命中 → 一行明细:镜号 + 主体名 + 码文案 */
  const consistLine = h => `镜头${h.order}「${h.name}」${CONSIST[h.code] || h.code}`;
  /* 字幕命中 → 一行明细:镜号(整集级命中无镜号)+ 字数/停留 + 码文案 */
  const captionLine = h => (h.order ? `镜头${h.order}` : '整集')
    + (h.chars ? `(${h.chars}字/${h.dur}秒)` : '') + (CAPTION[h.code] || h.code);

  const KB_TAIL = '——判据取自知识库条目,只提醒不拦生成';

  /* ================= 提醒投影表(面 → 校验项 id → kind/sev/挂载级别 单源) =================
   * 每行就是一条方法论提醒的完整投影口径,collect 只按表跑,不再逐面手写取值点:
   *   stage  取哪一面(与 Skills.check 的面键同词表)
   *   skill  取该面哪一条校验项的 hits;null 表示整面 hits 合并
   *   level  挂在项目级(判定输入是整张分集表这类项目对象)还是分集级
   *   phase  分集级条目排在未拆镜/判旧等早退分支之前(pre)还是之后(post)
   *   name / line / cap / tail  标题词、单条明细写法、明细最多列几条(null=全列且不缀「等 N 处」)、明细尾注
   * 判据一条都不在本表:命中与命中码全部来自 js/skills.js 的校验项,本表只定"哪一档危险级、挂在哪一级、文案怎么写"。
   * 危险级一律 low:发布门 G2 只数高/中危,方法论提醒只报不拦,不改门禁状态也不进 Domain 的阻塞项。 */
  const REMINDERS = [
    { kind: 'eps-structure', sev: 'low', stage: 'eps', skill: 'eps.structureStage', level: 'project', phase: 'pre',
      name: '六阶段结构提醒', line: stageLine, cap: 4, tail: KB_TAIL },
    { kind: 'script-craft', sev: 'low', stage: 'script', skill: null, level: 'episode', phase: 'pre',
      name: '剧本方法论提醒', line: craftLine, cap: 4, tail: KB_TAIL },
    { kind: 'eps-payoff', sev: 'low', stage: 'eps', skill: 'eps.payoffPoint', level: 'episode', phase: 'pre',
      name: '付费卡点提醒', line: payoffLine, cap: null, tail: KB_TAIL },
    { kind: 'subject-inconsistent', sev: 'low', stage: 'subjects', skill: 'subjects.crossShot', level: 'episode', phase: 'post',
      name: '跨镜主体参考不一致', line: consistLine, cap: 4, tail: '——同一主体形象易在镜间漂移' },
    { kind: 'shot-size-linkage', sev: 'low', stage: 'shots', skill: 'shots.sizeProgression', level: 'episode', phase: 'post',
      name: '景别衔接提醒', line: sizeLine, cap: 4, tail: KB_TAIL },
    { kind: 'shot-stable-lexicon', sev: 'low', stage: 'shots', skill: 'shots.promptEightDim', level: 'episode', phase: 'post',
      name: '提示词稳定词/用词提醒', line: lexLine, cap: 4,
      tail: '——判的是该镜真实发出去的那条提示词,判据取自知识库条目,只提醒不拦生成' },
    { kind: 'caption-unreadable', sev: 'low', stage: 'film', skill: 'film.subtitleQC', level: 'episode', phase: 'post',
      name: '字幕读不顺', line: captionLine, cap: 4, tail: '——成片字幕与 SRT 同一时间轴,合成前改台词/裁剪最省事' },
  ];

  /* ================= 前置门槛投影表(项目级断点 → 危险级/落点/一行说明) =================
   * 键就是 Domain.gateBlockers 的阻塞码,collect 只按表投影:命中与命中文案全部取那一份
   * (流程条 workflow 的剧本/主体/分集三步读的也是它),本层不另判一遍、也不另起一套码名。
   * 为什么要有这一档:collect 的主体是逐集循环,空项目/只有剧本/只有主体时循环体一步都不进——
   * 主线断在剧本/主体/分集这三步时,问题中心此前一条问题都收不出来,断点只有流程条看得见。
   * 危险级:主体缺图沿用中危(与发布门 G9 判的是同一件事,原就在清单里);
   * 其余三条门槛态一律低危——发布门 G2 只数高/中危,主线前置已由 G1(每集 done)/G3(有分集且审片达标)
   * 各自把关,问题中心不在 G2 上再叠一层(尤其不让 G2 转而去读 p.script 这类交付前不该判的项)。 */
  const GATES = {
    'no-script': { sev: 'low', at: '', detail: () => '项目还没有剧本原文:提取主体与拆集读的都是它,先写入整本' },
    'no-subjects': { sev: 'low', at: '/roles', detail: () => '主体库还空:先提取主体再生成权威参考图,分镜与生成都按主体锁形象' },
    'subjects-no-image': { sev: 'mid', at: '/roles', detail: p => {
      const ns = (p.subjects || []).filter(s => !s.image);
      return '缺参考图的主体参与生成会触发防废片警示:' + ns.slice(0, 6).map(s => s.name).join('、') + (ns.length > 6 ? ` 等 ${ns.length} 个` : '');
    } },
    'no-eps': { sev: 'low', at: '', detail: () => '还没有分集:先按整本剧本拆集,分镜/生成/审片/成片都挂在分集上' },
  };

  /* ================= 分集级阻塞码投影表(Domain.episodeState 的阻塞码 → 危险级) =================
   * 键就是那份阻塞码全集(Domain.epBlockerCodes()),逐集循环按本表取危险级出条目——
   * 码名与危险级各只此一份,分支里不再逐条手写 kind/sev,本层也不另起近义码。
   * 与前置门槛那张表的差别只在形状:门槛按码查表投影,分集这一档的条目还要带各自的明细/处置/早退,
   * 故仍是逐集循环里的分支;可枚举的是码与危险级,漏投由契约用例逐码点名(见 EPB_SKIP)。 */
  const EPB = {
    'no-script': 'high', 'no-shots': 'mid', 'shots-stale': 'mid', 'failed-shots': 'high',
    'stale-shots': 'mid', 'unconfirmed': 'low', 'composed-stale': 'mid',
  };
  /* 有意不投的分集级阻塞码 + 理由(不投是写下来的决定,不是漏掉;白名单之外漏投即红) */
  const EPB_SKIP = {
    'no-episode': '逐集循环的入参恒取自项目的分集表,拿不到"分集不存在"这一态——它是 episodeState 给按 id 查单集的调用方兜底的空态,不是项目里的待处理问题',
  };

  /* 取该行的命中:整面结论按面缓存(同一面上挂多条投影只跑一次),再按校验项 id 分给各行。
   * 这是本模块唯一一处 Skills 取值点——面字面量只在表里,取不到注册表(未加载)时如实回空。 */
  function hitsOf(S, r, obj, ck, cache) {
    if (!S) return [];
    const res = cache[r.stage] || (cache[r.stage] = S.check(r.stage, obj, ck) || []);
    return r.skill ? ((res.find(x => x.skill === r.skill) || {}).hits || []) : [].concat(...res.map(x => x.hits));
  }
  const labelOf = (r, n, ep) => (ep ? `「${ep.title}」` : '分集表 ') + n + ' 处' + r.name;
  const detailOf = (r, hits) => (r.cap ? hits.slice(0, r.cap) : hits).map(r.line).join(';')
    + (r.cap && hits.length > r.cap ? ` 等 ${hits.length} 处` : '') + r.tail;

  /* ================= 问题清单推导(纯数据,可 vm 沙箱与 Node 直跑) =================
   * 条目:{ kind, sev(high|mid|low), count, label, detail, epid?, epTitle?, cmd?, shotIds?, goto? }
   * ctx:{ online } 由调用方注入(浏览器薄封装按在线态取,CLI/服务端按登录态给);
   * cmd 条目由调用方经统一命令层带 {pid,epid,shotIds} 处置,goto 条目直接跳转——两者都在本层之外发生;
   * shotIds 是本层派生出的镜头子集(有就是准的、空就不出这个字段),两类条目都可能带,
   * 带在 goto 条目上时是"该动这几镜"的清单(要人先改提示词/自己挑),不代表本层替调用方按下处置。 */
  function collect(p, ctx) {
    const out = [];
    if (!p) return out;
    const on = !!(ctx || {}).online;
    const ck = { online: on };
    const S = skills();
    /* 按表投影一档提醒:hits 为空不出条目;base 给分集级条目带 epid/epTitle */
    const emit = (level, phase, obj, cache, base) => {
      REMINDERS.forEach(r => {
        if (r.level !== level || r.phase !== phase) return;
        const hits = hitsOf(S, r, obj, ck, cache);
        if (!hits.length) return;
        out.push(Object.assign({}, base, {
          kind: r.kind, sev: r.sev, count: hits.length,
          label: labelOf(r, hits.length, obj.ep), detail: detailOf(r, hits),
          goto: obj.ep ? `#/project/${p.id}/episode/${obj.ep.id}` : '#/project/' + p.id,
        }));
      });
    };
    /* 项目级前置门槛(剧本/主体/分集三步):码与标题原样取 Domain.gateBlockers,本层只定危险级、落点与说明。
     * 表外的码一律不投(Domain 那边新增一档而本表没跟上,由 tests/unit.js 的包含关系断言点名报出) */
    (Domain && Domain.gateBlockers ? Domain.gateBlockers(p) : []).forEach(g => {
      const t = GATES[g.code];
      if (!t) return;
      out.push({ kind: g.code, sev: t.sev, count: g.count || 1, label: g.label, detail: t.detail(p, g), goto: '#/project/' + p.id + t.at });
    });
    /* 项目级提醒:判定输入是整张分集表,故按项目挂一条而不是逐集重复报 */
    emit('project', 'pre', { p }, {}, null);
    (p.episodes || []).forEach((ep, i) => {
      const st = Domain ? Domain.episodeState(p, ep, on) : { counts: {}, blockers: [] };
      const c = st.counts || {};
      const base = { epid: ep.id, epTitle: ep.title || ('第' + (i + 1) + '集') };
      const obj = { p, ep }, cache = {};
      /* 每条问题必须 Object.assign({}, base, …) 新开对象:同一集可挂多条问题,直接改 base 会让已入组条目全部串成同一引用(二十二轮修复) */
      if (!(ep.content || '').trim()) {
        out.push(Object.assign({}, base, { kind: 'no-script', sev: EPB['no-script'], count: 1, label: `「${ep.title}」缺剧本正文`, detail: '无剧本无法拆镜与生成本集理解', goto: `#/project/${p.id}/episode/${ep.id}` }));
        return;
      }
      /* 剧本文本面与付费卡点位置排在未分镜等早退分支之前:剧本刚写完还没拆镜时正是这几条最该看得见的时候 */
      emit('episode', 'pre', obj, cache, base);
      if (!c.total) { out.push(Object.assign({}, base, { kind: 'no-shots', sev: EPB['no-shots'], count: 1, label: `「${ep.title}」未生成分镜`, detail: '已有剧本未拆镜,可直接智能分镜', cmd: 'episode.generateStoryboard' })); return; }
      if (st.shotsStale) { out.push(Object.assign({}, base, { kind: 'shots-stale', sev: EPB['shots-stale'], count: 1, label: `「${ep.title}」分镜表基于旧剧本/图谱`, detail: '剧本或事件图谱修订后未重新拆镜', goto: `#/project/${p.id}/episode/${ep.id}` })); return; }
      /* 明细里的镜号是给人看的序号,取 Domain.shotNo(分镜表实位),不读会与实位漂移的 s.order:
       * 这条的 shotIds 按 id 精确带出,而人要照明细上的号回分集页找那几镜——两半报同一个号才对得上。
       * fs 恒取自 ep.shots 的过滤子集,shotNo 回不到 0,故不写表外镜那档 '?' 兜底(下面过期镜同理)。 */
      if (c.failed) {
        const fs = (ep.shots || []).filter(s => s.video && s.video.status === 'failed');
        out.push(Object.assign({}, base, {
          kind: 'failed-shots', sev: EPB['failed-shots'], count: c.failed, label: `「${ep.title}」${c.failed} 镜生成失败`,
          detail: fs.map(s => `镜头${Domain.shotNo(ep.shots, s)}:${String(s.video.error || '未知错误').slice(0, 36)}`).slice(0, 4).join(';') + (fs.length > 4 ? '…' : '') + '(失败已退费,可重试)',
          cmd: 'episode.generateVideos', shotIds: fs.map(s => s.id),
        }));
      }
      /* 过期镜里混着定稿的那几镜时,「建议重生成」这句话对它们不成立:两端批量重生成一律锁 !s.final
       * (js/commands.js 的 episode.generateVideos 全量与子集两条路径都锁),定稿过期镜按下去也跑不到。
       * 分堆与那句说明现取 Domain(与发布门 G4 同一份),本层既不自写终稿判据、也不另拼一种说法。
       * count 照旧是过期镜总数:把定稿过期镜从这条里剔出去等于放宽发布门 G2(它数的是本清单的高/中危
       * 条目,而这条在不在只看 c.stale),本条只在明细尾巴上加一句,发射条件与计数一个都不动;
       * 也照旧不挂 cmd——处置仍是导航回分集页,由人按那句话决定先解锁哪几镜。 */
      if (c.stale) {
        const sp = Domain.staleShotSplit(p, ep, on);
        const staleIds = new Set(sp.all);
        const ss = (ep.shots || []).filter(s => staleIds.has(s.id));
        out.push(Object.assign({}, base, { kind: 'stale-shots', sev: EPB['stale-shots'], count: c.stale, label: `「${ep.title}」${c.stale} 镜素材已更新(过期)`, detail: `镜头 ${ss.map(s => Domain.shotNo(ep.shots, s)).slice(0, 8).join('、')}${ss.length > 8 ? '…' : ''} 生成后输入有变化,建议重生成` + Domain.staleSplitNote(sp.rerun.length, sp.locked.length), goto: `#/project/${p.id}/episode/${ep.id}` }));
      }
      if (c.unconfirmed && !c.generating) out.push(Object.assign({}, base, { kind: 'unconfirmed', sev: EPB['unconfirmed'], count: c.unconfirmed, label: `「${ep.title}」${c.unconfirmed} 镜待确认`, detail: '未确认镜头不参与批量生成,先过确认闸', goto: `#/project/${p.id}/episode/${ep.id}` }));
      /* 审片步骤未完成:kind 就是 Domain 分集级审片门槛 episodeState().reviewGate 归好的那个码,
       * 三态(no-review/review-stale/low-review)与主线 review 步逐集同判,本层不再自己比达标线、判旧,
       * 也不靠挂载位置隐式设第二道门——"这一集当下能不能审"由 reviewGate 一处说了算(unready 即不出条目,
       * 上面那几个早退分支正是它的三个不可审条件,报的是上游那一步的断点)。
       * 判旧那条与发布门 G3「视为未审」同口径,三态互斥不重复报;
       * 处置走导航到分集页自己发起整集审片,不挂命令(审片是计费动作,问题中心不代按)。 */
      if (st.reviewGate === 'review-stale') {
        out.push(Object.assign({}, base, { kind: 'review-stale', sev: 'mid', count: 1, label: `「${ep.title}」审片记录已过期(视为未审)`, detail: `剧本/图谱修订或镜头重抽后旧结论不再算数,${c.total} 镜需重新整集审片`, goto: `#/project/${p.id}/episode/${ep.id}` }));
      } else if (st.reviewGate === 'no-review') {
        out.push(Object.assign({}, base, { kind: 'no-review', sev: 'mid', count: 1, label: `「${ep.title}」未审片`, detail: `已有 ${c.total} 镜${c.done ? `、${c.done} 镜已出片` : ''}${ep.composed ? `、成片已合成` : ''},审片步骤未完成——主线卡在审片`, goto: `#/project/${p.id}/episode/${ep.id}` }));
      }
      if (st.reviewGate === 'low-review') { // 判旧(rev/快照失配)的旧分不再报问题;「需重审」语义由上面 review-stale 那条承接
        const lows = Domain.reviseTargets(ep); // 低分镜面与修订闭环重抽面同一份派生(达标线/判旧/交集不写第二份)
        /* 重抽面非空时把它的 shotId 投影一并带出:该修哪几镜这一份已经算出来了,只给人看的 detail 文案
         * 等于让编排层(CLI issues / MCP / 助手)照文案回抠一遍或自筛一遍低分镜——那就是第二份名单。
         * 投影取 Domain.reviseShotIds(它就是这个子集参数的单源),调用侧不就地 map 一份同样的东西。
         * 空重抽面不出这个字段:子集位上的空数组等于"整集"(见 js/commands.js 的子集过滤),
         * 会把只该修几镜的活儿放大成整集重跑,与 failed-shots 从不带空子集同口径。
         * 仍不挂 cmd:重抽前要先按审片意见改提示词,原样重跑只是再抽一次卡——处置照旧导航到分集页,
         * shotIds 是给人挑的清单,不是编排层替人按下那一下(与过期镜那条同一条纪律)。 */
        const low = Object.assign({}, base, { kind: 'low-review', sev: 'mid', count: lows.length || 1, label: `「${ep.title}」审片均分 ${st.reviewAvg} 低于达标线`, detail: lows.length ? `低分镜:${lows.map(x => x.order + '镜' + x.score + '分').slice(0, 6).join('、')}` : '整体质量待修订(可让助手按问题清单优化提示词)', goto: `#/project/${p.id}/episode/${ep.id}` });
        if (lows.length) low.shotIds = Domain.reviseShotIds(ep);
        out.push(low);
      }
      if (ep.composed && !st.composedReady) out.push(Object.assign({}, base, { kind: 'composed-stale', sev: EPB['composed-stale'], count: 1, label: `「${ep.title}」成片已过期`, detail: '合成输入或剧本已变化,需重新合成', cmd: 'episode.compose' }));
      /* 跨镜主体一致性 / 分镜景别衔接 / 提示词稳定词 / 成片字幕可读性:四条同为投影表里的分集级低危提醒
       * (景别与稳定词同属 shots 面,表的整面缓存保证一次跑完按条目分挂,不重复跑整面) */
      emit('episode', 'post', obj, cache, base);
    });
    const SEV = { high: 0, mid: 1, low: 2 };
    const sevOf = x => (SEV[x] === undefined ? 9 : SEV[x]);
    return out.sort((a, b) => sevOf(a.sev) - sevOf(b.sev));
  }

  /* 未解决问题数(项目页角标) */
  function count(p, ctx) { return collect(p, ctx).length; }

  /* 提醒投影表的只读投影(每次现生成副本,调用方污染不回写本表) */
  function reminders() {
    return REMINDERS.map(r => ({ kind: r.kind, sev: r.sev, stage: r.stage, skill: r.skill, level: r.level, phase: r.phase, name: r.name }));
  }
  /* 前置门槛投影表的只读投影(同上现生成副本):kind 就是 Domain.gateBlockers 的阻塞码,两侧码集由契约用例钉住 */
  function gates() {
    return Object.keys(GATES).map(code => ({ kind: code, sev: GATES[code].sev, level: 'project' }));
  }
  /* 分集级阻塞码投影表的只读投影(同上现生成副本):kind 就是 Domain.episodeState 的阻塞码 */
  function epBlockers() {
    return Object.keys(EPB).map(code => ({ kind: code, sev: EPB[code], level: 'episode' }));
  }
  /* 不投的分集级阻塞码白名单(契约断言用,每次现生成副本) */
  function epSkips() { return Object.assign({}, EPB_SKIP); }

  return { collect, count, reminders, gates, epBlockers, epSkips };
});
