/* ============ flow-tpl.js 主线中段流程模板(双端 UMD) ============
 * 主线 剧本→主体→分集→分镜→生成→审片→成片 的**中段**(主体/分集/分镜/生成)可调用流程模板:
 * 给调用方一份机读的「调用顺序 + 每个参数从哪取 + 断点怎么处理」,而不是再抄一套提示词。
 * 三处一律现取既有单源,本层不写第二份:
 *   - 步序与命令名 → SK-05 主线全链 playbook 投影(js/skills.js core.playbookProjection);
 *   - 参数面与用法串 → js/cmd-registry.js(args/label/risk/usageOf);
 *   - 待办与缺前置   → Domain.workflow 的同键主线步及其 blockers(与流程条/CLI workflow 同口径)。
 * 本层只登记注册表答不出的三件事:投影每一步落在中段哪一主线步、它的待办由哪几个阻塞码判、
 * 跑砸了在哪一码上断点。零 LLM、零计费、无网络与存储副作用,产出可 JSON 序列化。
 * 环境差异(在线与否、MCP 工具名)经参数显式注入,本模块不碰 window,也不认识任何一端的工具表。
 * 消费点:cli.js 的 `flow-template` 命令,以及 mcp.js 包装它的那个工具与中段流程提示模板。 */
(function (root, factory) {
  const isNode = typeof module === 'object' && module.exports;
  const F = factory(
    isNode ? require('./domain.js') : root.Domain,
    isNode ? require('./skills.js') : root.Skills,
    isNode ? require('./cmd-registry.js') : root.CmdRegistry);
  if (isNode) module.exports = F; else root.FlowTpl = F;
})(typeof self !== 'undefined' ? self : globalThis, function (Domain, Skills, CmdRegistry) {
  'use strict';
  const F = {};

  const CHAIN_ID = 'core.playbookProjection'; // 主线全链九步:模板的步序与命令名一律取它
  const ALL = 'mid';                          // 缺省流程段:整个中段
  const chainOf = () => ((Skills.playbook(CHAIN_ID)) || { steps: [] }).steps;
  const stageName = key => ((Skills.stageOf(key) || {}).name || key);

  const stop = (code, how) => ({ code, how });
  /* 就绪检查是只报不拦的结论面:它自己不失败,断点是它报出来的那几个阻塞码 */
  const PREFLIGHT_STOP = ['no-script', 'no-shots', 'shots-stale', 'failed-shots', 'stale-shots']
    .map(code => stop(code, '就绪检查只报不拦:按 blockers 回到对应步处理完再往下,不要带着阻塞项出片'));

  /* 分集级阻塞码里有意不进中段断点的那几档 + 理由(与投影步登记 null 同一纪律:不进是写下来的决定,不是漏掉)。
   * Domain.epBlockerCodes() 的其余码都得在某一步的 stop 里接住——漏一档就是"跑砸在这一码上却没写怎么处置",
   * 调用方只能自己猜;哪一档漏了由契约用例按码点名。 */
  const STOP_SKIP = {
    'no-episode': '中段每一步都按 epid 寻址已存在的分集,拿不到这一态:分集不存在是调用方 epid 给错,由命令层如实报错,不是流程断点',
    'composed-stale': '成片不在中段:重新合成的时机与断点由成片那段承接(SK-30),中段不越界替它写处置',
  };

  /* 投影步 → 中段登记:{stage 落在哪一主线步, codes 待办由哪几个阻塞码判, optional 占不占推进位, stop 断点}。
   * 登记为 null = 该投影步**有意不在中段**(审片/成片各由自己那段承接,首尾两条流程模板已覆盖)——
   * 投影哪天多一步而这里没跟上,F.projection() 的契约断言点名报出漏的是哪个命令,不静默漏掉一步。
   * codes 为空 = 该主线步上只有这一条推进命令,待办直接看那一步 done 不 done;
   * codes 非空 = 同一主线步上有多条命令(主体步的提取与生图),各自按清掉的阻塞码分工。 */
  const STEP_META = {
    'project.extractSubjects': {
      stage: 'subjects', codes: ['no-subjects'],
      stop: [
        stop('no-script', '项目还没有剧本原文:先写入整本(project-script),提取主体读的就是它'),
        stop('no-credits', '积分不足:补足后重跑,已扣的失败步服务端自动退费'),
      ],
    },
    'subject.generateImage': {
      stage: 'subjects', codes: ['subjects-no-image'],
      stop: [stop('no-credits', '积分不足:逐主体计费、失败逐个退费,补足后只跑剩下的 subjectIds 即可')],
    },
    'project.splitEpisodes': {
      stage: 'eps', codes: ['no-eps'],
      stop: [
        stop('no-script', '同上:拆集的输入也是项目剧本原文'),
        stop('has-episodes', '已有分集:覆盖会连同已有分镜数据一起换掉,属人工授权——拿到用户明示再带 overwrite 重来'),
      ],
    },
    'episode.understanding': {
      stage: 'shots', codes: [], optional: true,
      stop: [
        stop('no-script', '该集没有正文:先写入分集剧本(episode-script)'),
        stop('no-credits', '积分不足:补足后重跑'),
      ],
    },
    'episode.generateStoryboard': {
      stage: 'shots', codes: [],
      stop: [
        stop('no-script', '该集没有正文:先写入分集剧本(episode-script)'),
        stop('shots-stale', '分镜表基于旧剧本/图谱:重拆会整表覆盖(含已出片镜),属人工决策——拿到用户明示再重拆'),
        stop('no-credits', '积分不足:补足后重跑,方案数越多越贵'),
      ],
    },
    'episode.preflight': { stage: 'gen', codes: [], optional: true, stop: PREFLIGHT_STOP },
    'episode.generateVideos': {
      stage: 'gen', codes: [],
      stop: [
        stop('unconfirmed', '未确认镜被跳过并如实进 skipped:逐镜确认(shot-confirm)后重跑;confirmAll 等于替用户过确认闸,要用户明示'),
        stop('failed-shots', '有失败镜:失败已退费,修提示词后用 shotIds 只重跑这些镜,不要整集重来'),
        stop('inflight', '同键在飞:上一轮同参数还没落定,等它终态再跑,别重复扣费'),
        stop('no-credits', '积分不足:补足后用 shotIds 续跑剩下的镜(已出片的镜不会重复扣费)'),
      ],
    },
    // 审片与成片不在中段:各自的编排与断点由 SK-25/SK-30 与失败镜排查那条流程模板承接
    'episode.smartReview': null,
    'episode.compose': null,
  };

  /* 参数取数出处:键是 cmd-registry 的参数名(跨命令同名同义),值回答"这个值从哪来"。
   * 授权位与子集位一律写明由调用方/用户定——模板给步序不代授权,与编排层 args 留空同一条纪律。 */
  const ARG_SOURCE = {
    pid: '项目 id:项目列表或新建项目回执的 id',
    epid: '分集 id:项目详情的 episodes[].id(拆集回执也带回新建的分集)',
    ui: '留空:CLI/MCP 一律 headless,这一位只给浏览器语境保留决策弹窗',
    mode: '调用方决定:缺省 normal,fine 走更详尽的人设维度',
    subjectIds: '主体列表里 hasImage=false 的 id 子集;留空即全部缺图主体',
    overwrite: '授权位:已有分集时必须由用户明示,模板不代授权',
    local: '模式位:调用方决定,强制走本地零 LLM 路径(拆集按段落均分、提取主体按本地启发式,零计费);headless 不可用',
    model: '浏览器语境:剧本解析向导里用户选的文本模型;CLI/MCP 留空(服务端按账号默认 LLM 设置定模型,不接受调用方指定)',
    shotCount: '调用方决定:分镜数量 2-40,缺省 8',
    sbPlans: '调用方决定:候选方案数 1-3,方案越多越贵',
    shotIds: '分镜表里筛出的镜头 id 子集(失败镜/过期镜/复审重抽);留空即整集',
    confirmAll: '授权位:等于替用户过确认闸,必须由用户明示;缺省先逐镜确认再跑',
    noImage: '调用方决定:跳过缺底图镜头的补图',
  };

  /* 中段覆盖的主线步:由登记推出并按 STAGES 步序排,本层不另写一份步名清单 */
  const midStages = () => Skills.stages().filter(k =>
    Object.keys(STEP_META).some(c => STEP_META[c] && STEP_META[c].stage === k));

  F.CHAIN_ID = CHAIN_ID;
  F.ALL = ALL;
  F.stages = midStages;
  F.segments = () => [ALL].concat(midStages());
  F.argSources = () => Object.assign({}, ARG_SOURCE);
  /* 不进中段断点的分集级阻塞码白名单(契约断言用,每次现生成副本) */
  F.stopSkips = () => Object.assign({}, STOP_SKIP);

  /* 投影自省(契约断言用):主线全链投影每一步 → 中段登记了吗、落在哪一步、占不占推进位 */
  F.projection = function () {
    return chainOf().map(x => {
      const m = STEP_META[x.cmd];
      return {
        cmd: x.cmd,
        registered: Object.prototype.hasOwnProperty.call(STEP_META, x.cmd),
        mid: !!m, stage: m ? m.stage : null,
        optional: !!(m && m.optional), codes: m ? m.codes.slice() : [],
      };
    });
  };

  /* 流程模板:segment='mid' 或中段某一主线步;p 给了就按 Domain 实况标注待办与缺前置,不给即静态模板。
   * 缺前置(段起点之前的主线步还有 blockers)一律进 gaps 并置 ready=false——不拿"步骤都在"冒充可跑。
   * status:todo=它要清的阻塞项当下就在 / clear=当下没有它要处理的事(不等于"这一步做过了":
   * 主体库还空时主体生图也是 clear,该跑的是它前面那一步,next 给的就是那一步)/ optional=不占推进位 /
   * null=没给项目状态,只出静态模板不冒充状态判定。 */
  F.template = function (segment, p, opts) {
    const seg = segment || ALL;
    if (F.segments().indexOf(seg) < 0) throw new Error('未知流程段:' + seg + '(可用:' + F.segments().join(' / ') + ')');
    const chain = chainOf();
    if (!chain.length) throw new Error('主线全链 playbook 投影缺位:' + CHAIN_ID);
    const order = Skills.stages();
    const want = seg === ALL ? midStages() : [seg];
    const online = !opts || opts.online !== false;
    const wf = p ? Domain.workflow(p, online) : null;
    const stepOf = key => (wf ? wf.steps.find(s => s.key === key) : null) || null;

    /* 缺前置:段起点之前的主线步身上还挂着的阻塞项,原样取 Domain 的码与文案,本层不另判一遍 */
    const gaps = [];
    if (wf) {
      order.slice(0, order.indexOf(want[0])).forEach(k => {
        const st = stepOf(k);
        (st ? st.blockers : []).forEach(b => gaps.push({ stage: k, stageName: stageName(k), code: b.code, label: b.label }));
      });
    }

    const steps = [];
    chain.forEach(proj => {
      const meta = STEP_META[proj.cmd];
      if (!meta || want.indexOf(meta.stage) < 0) return;
      const m = CmdRegistry.byName[proj.cmd];
      if (!m) return; // 投影只引用已注册命令;真缺了由契约断言点名,不在这里拼半条用法串
      const st = stepOf(meta.stage);
      const hits = st ? st.blockers.filter(b => !meta.codes.length || meta.codes.indexOf(b.code) >= 0) : [];
      const todo = !st ? true : (meta.codes.length ? hits.length > 0 : !st.done);
      const usage = CmdRegistry.usageOf(m);
      steps.push({
        i: steps.length + 1,
        cmd: proj.cmd, stage: meta.stage, stageName: stageName(meta.stage),
        label: m.label, risk: m.risk, optional: !!meta.optional,
        note: proj.note || '',
        cli: 'node cli.js exec ' + proj.cmd + (usage ? ' ' + usage : ''),
        args: (m.args || []).map(a => ({
          name: a.name, type: a.type, required: !!a.required, desc: a.desc || '', from: ARG_SOURCE[a.name] || '',
        })),
        stop: (meta.stop || []).map(x => ({ code: x.code, how: x.how })),
        status: meta.optional ? 'optional' : (wf ? (todo ? 'todo' : 'clear') : null),
        why: (wf && !meta.optional && todo && hits.length) ? hits.map(b => b.label).join(';') : '',
      });
    });

    const next = steps.find(s => s.status === 'todo') || null;
    return {
      segment: seg, chain: CHAIN_ID,
      title: '主线中段:' + want.map(stageName).join(' → '),
      stages: want.map(k => ({ key: k, name: stageName(k) })),
      steps,
      gaps, ready: !gaps.length,
      next: next ? { i: next.i, cmd: next.cmd, stage: next.stage, why: next.why } : null,
      state: p ? { pid: p.id, name: p.name || '', online: online } : null,
    };
  };

  /* 文本渲染:同一份模板换个载体(MCP 流程提示模板),不另写一套措辞。
   * ctx.toolOf(cmd) 由调用方注入——工具名是各端自己的事,本模块不认识任何工具表;缺省只给命令名。 */
  F.brief = function (tpl, ctx) {
    const toolOf = (ctx && typeof ctx.toolOf === 'function') ? ctx.toolOf : (() => '');
    const lines = [];
    tpl.steps.forEach(s => {
      const tool = toolOf(s.cmd);
      lines.push(`${s.i}. 【${s.stageName}】${s.label}${s.optional ? '(可选:只报结论/可复用,不占推进位)' : ''} — ${tool || s.cmd}`);
      lines.push('   步意:' + s.note);
      const args = s.args.filter(a => a.from).map(a => a.name + '=' + a.from);
      if (args.length) lines.push('   参数从哪取:' + args.join(';'));
      if (s.stop.length) { // 同一处置的码合并成一条,正文不重复同一句话(JSON 里仍逐码一条)
        const g = [];
        s.stop.forEach(x => { const h = g.find(y => y.how === x.how); if (h) h.codes.push(x.code); else g.push({ how: x.how, codes: [x.code] }); });
        lines.push('   断点:' + g.map(x => x.codes.join('/') + ' → ' + x.how).join(';'));
      }
    });
    if (tpl.gaps.length) lines.push('缺前置(先补齐再进中段):' + tpl.gaps.map(g => g.stageName + '/' + g.code + ' ' + g.label).join(';'));
    return lines.join('\n');
  };

  return F;
});
