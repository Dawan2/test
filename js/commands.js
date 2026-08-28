/* ============ commands.js 统一领域命令注册表(第二阶段;第三阶段补 UI 模式) ============
 * Commands.execute(name, args) → Promise<{ ok, status, result?, error?, cost?, next? }>
 *   - ok:     是否成功;status: done/blocked/failed/needs_human/running(与 WorkflowState 同词汇)
 *   - result: 命令结构化结果;error: {code,message};cost: 本次实际净扣费(Store.credits 前后差值,含子调用扣费与退费回补)
 *   - next:   执行后按 Domain.episodeState/workflow 重推的建议动作(与流程条/下一步/CLI workflow 同口径)
 * UI 按钮、导演助手(Agent)、量产跑批共用本注册表;CLI 侧经 `hujing exec` 对齐同一命令名与结果结构。
 *
 * headless 约定(Agent/跑批/CLI 语境,默认):不弹决策类弹窗(U.confirm/确认闸/合规承诺/失败重试汇总),
 *   未确认镜头跳过并在 result.skipped 如实报告(与 CLI gen-episode 同口径);信息性 toast/后台面板保留。
 * ui 模式(args.ui=true,UI 按钮语境):决策弹窗全部保留(确认闸/合规承诺/真人预审 guardAsync/失败重试汇总/
 *   审片后台面板),命令仍回结构化回执;调用方经 Commands.digest 统一消化命令级拦截(blocked/inflight 等),
 *   引擎执行过程的成败提示由引擎自身负责(toast/弹窗/后台面板),不重复播报。
 * 引擎全部复用现有函数编排(SBGen.batchGenVideos/SB.composeVideo/SB.autoSmartReview/SB.runSmartSB/
 *   Understanding.regen),计费五件套/失败退费/任务登记链路原样不变。
 * 加载顺序:produce.js 之后、agent.js 之前;全部依赖运行时 window 查找(无加载时绑定,可 vm 沙箱测试)。
 */
(function () {
  const REG = {};
  const INFLIGHT = new Set(); // 执行中守卫:name+pid+epid+sid 粒度,防 Agent/重试并发重入(重复扣费)

  /* ---- 统一返回构造 ---- */
  const ok = (result, extra) => Object.assign({ ok: true, status: 'done', result: result || {} }, extra);
  const fail = (code, message, extra) => Object.assign({ ok: false, status: 'failed', error: { code, message: String(message || code) } }, extra);
  const blocked = (code, message, result) => ({ ok: false, status: 'blocked', error: { code, message: String(message || code) }, result: result || {} });

  const online = () => !!(window.Media && Media.isReady && Media.isReady());
  /* 渲染汇流排:调用方未传 main 时用 detached sink(与跑批同模式,不上屏) */
  const sinkOf = args => (args && args.main) || document.createElement('div');
  /* 分集参数兜底:未打开过工作区的集 sbConfig 可能缺键(与跑批 reallyRun 同口径) */
  const ensureSBCfg = (p, ep) => { ep.sbConfig = Object.assign(window.SB && SB.defaultSBConfig ? SB.defaultSBConfig(p) : {}, ep.sbConfig || {}); return ep.sbConfig; };

  /* 执行后统一推导 next(流程条/下一步/CLI workflow 同一口径) */
  function nextOf(p, ep) {
    if (!window.Domain || !p) return null;
    if (ep) { const st = Domain.episodeState(p, ep, online()); return Object.assign({ status: st.status }, st.action || {}); }
    const wf = Domain.workflow(p, online());
    return wf.recommendedAction || null;
  }

  /* ---- 命令注册:元数据默认值取自双端单源 cmd-registry.js,本地 meta(meter 等执行侧差异)覆盖 ---- */
  function reg(name, meta, handler) {
    const rm = (typeof CmdRegistry !== 'undefined' && CmdRegistry.byName[name]) || {};
    REG[name] = Object.assign({ name, risk: 'exec', meter: true, needs: ['p', 'ep'] }, rm, meta, { handler });
  }

  /* 生产就绪检查(read):Domain.episodeState 单源推导,流程条/下一步/CLI 同口径;
   * result.checks 附各校验面结论(Skills.check,纯本地零 LLM 零计费),面清单与步序一律读双端单源表
   * Skills.preflightStages()(现为 script → subjects → eps → shots → gen → review → film),本层不写第二份面清单——只报不拦:
   * 不进 blockers、不改 ok/status,与 CLI exec 同一份结论 */
  reg('episode.preflight', { risk: 'read', meter: false, label: '生产就绪检查' }, async ({ p, ep }) => {
    const st = Domain.episodeState(p, ep, online());
    const ck = { online: online() };
    const checks = window.Skills
      ? Skills.preflightStages().reduce((all, stage) => all.concat(Skills.check(stage, { p, ep }, ck)), [])
      : [];
    return { ok: st.status !== 'blocked' && !st.shotsStale, status: st.status, result: Object.assign({}, st, { checks }) };
  });

  /* 智能分镜(exec):runSmartSB hooks Promise 化;缺剧本/积分不足走 blocked(预检与 runSmartSB 同口径,防 hooks 不触发悬挂);
   * headless 传 quiet:多方案自动择优发布、本地兜底不弹「下一步批量生成」确认(ui 模式原样保留对比窗/确认弹窗) */
  reg('episode.generateStoryboard', { label: '智能分镜' }, ({ p, ep, args }) => metered(REG['episode.generateStoryboard'], () => new Promise(resolve => {
    if (!(ep.content || '').trim()) return resolve(blocked('no-script', '本分集暂无剧本内容,请先补充剧本'));
    const start = () => {
      const c = ensureSBCfg(p, ep);
      const planN = Math.max(1, Math.min(3, +c.sbPlans || 1));
      const total = (window.COST ? COST.smartSB : 0) * planN + (c.sbMode === 'tweet' ? c.shotCount * (window.COST ? COST.tweetShot : 0) : 0);
      if (window.Store && Store.credits && Store.credits() < total) return resolve(blocked('no-credits', '积分不足:智能分镜需 ' + total + ' 积分'));
      window.SB.runSmartSB(p, ep, sinkOf(args), {
        quiet: !args.ui,
        done: () => { const r = ok({ shots: (ep.shots || []).length, plans: (ep.sbPlans || []).length }); r.next = nextOf(p, ep); resolve(r); },
        error: e => resolve(fail('smartSB', (e && e.message) || e)),
      });
    };
    /* 二十轮:空主体库引导(ui 模式)——主体库为空时拆出的分镜 characters=[] 无参考可注,
     * 主体缺失类提醒永不触发,用户到成片才发现每镜换脸;拆镜前主动引导先提取主体(可仍继续)。
     * headless(CLI/跑批)不拦截:自动化场景由调用方自行保证主体就绪 */
    if (args.ui && !(p.subjects || []).length && window.U) {
      return U.openModal({
        title: '主体库为空',
        body: `<p style="line-height:1.9">当前项目尚未提取任何主体(角色/场景/道具)。<br>没有主体参考,生成视频时无法锁定角色形象,<b style="color:var(--red)">极易出现每镜换脸</b>,且主体缺失类提醒不会触发。<br>建议先「上传剧本 → 解析剧本(精细模式)」提取主体并生成参考图。</p>`,
        footer: `<button class="btn" data-x="cancel">取消</button><button class="btn" data-x="go">去提取主体</button><button class="btn primary" data-x="cont">仍要拆镜</button>`,
        onMount(m, close) {
          m.querySelector('[data-x=cancel]').onclick = () => { close(); resolve(blocked('no-subjects', '已取消:建议先提取主体再拆镜')); };
          m.querySelector('[data-x=go]').onclick = () => {
            close();
            resolve(blocked('no-subjects', '已转去提取主体,完成后请重新拆镜'));
            if (window.EpisodeUtil && EpisodeUtil.openUploadScript) EpisodeUtil.openUploadScript(p, sinkOf(args) || document.getElementById('main'));
          };
          m.querySelector('[data-x=cont]').onclick = () => { close(); start(); };
        },
      });
    }
    start();
  })));

  /* 批量生成视频(exec):headless 确认闸口径=未确认镜跳过(与 CLI gen-episode 一致);confirmAll 显式授权全量;
   * ui 模式:确认闸/合规承诺/真人预审/失败重试汇总/审片联动弹窗全保留(done 回调 Promise 化);
   * args.shotIds 子集执行(UI 断点校准/建议策略壳传子集;CLI --args 同参) */
  reg('episode.generateVideos', { label: '批量生成视频' }, ({ p, ep, args }) => metered(REG['episode.generateVideos'], async () => {
    ensureSBCfg(p, ep);
    let pend = (ep.shots || []).filter(s => !s.final && !Store.shotVideoReady(s));
    if (Array.isArray(args.shotIds) && args.shotIds.length) { const ids = new Set(args.shotIds); pend = pend.filter(s => ids.has(s.id)); }
    if (!pend.length) { const r = ok({ total: 0, ok: 0, failed: [], skipped: [] }); r.next = nextOf(p, ep); return r; }
    let skipped = [];
    if (args.ui) {
      if (window.HumanReview && HumanReview.guardAsync) { // 真人素材预审:驳回/取消如实 blocked(与 runBatchOp 原预审闸同口径)
        const urls = [...new Set(pend.flatMap(s => HumanReview.shotImageUrls(p, s)))];
        if (!(await HumanReview.guardAsync(urls))) return blocked('human-review', '真人素材预审未放行,已取消生成', { total: 0, ok: 0, failed: [], skipped: [] });
      }
      await new Promise(res => SBGen.batchGenVideos(p, ep, sinkOf(args), pend, {}, res));
      skipped = pend.filter(s => !Store.shotVideoReady(s) && !(s.video && s.video.status === 'failed'))
        .map(s => ({ shotId: s.id, order: s.order + 1, reason: s.confirm ? '未执行' : '未确认' }));
    } else {
      const unconfirmed = pend.filter(s => !s.confirm);
      if (args.confirmAll) { unconfirmed.forEach(s => { s.confirm = true; }); Store.save(); }
      const todo = pend.filter(s => s.confirm);
      skipped = args.confirmAll ? [] : unconfirmed.map(s => ({ shotId: s.id, order: s.order + 1, reason: '未确认' }));
      if (!todo.length) return blocked('unconfirmed', unconfirmed.length + ' 镜未确认已跳过(confirmAll 可授权全量生成)', { total: 0, ok: 0, failed: [], skipped });
      pend = todo;
      await SBGen.batchGenVideos(p, ep, sinkOf(args), todo, { skipConfirmGate: true, skipSmartReview: true, skipCompliance: true, quiet: true });
    }
    const failed = pend.filter(s => s.video && s.video.status === 'failed').map(s => ({ shotId: s.id, order: s.order + 1, error: String(s.video.error || '').slice(0, 80) }));
    const okCnt = pend.filter(s => Store.shotVideoReady(s)).length;
    const r = { ok: failed.length === 0, status: failed.length ? 'failed' : 'done', result: { total: pend.length, ok: okCnt, failed, skipped } };
    if (failed.length) r.error = { code: okCnt ? 'partial' : 'gen-failed', message: failed.length + ' 镜生成失败(已退费),可修复后重试' };
    r.next = nextOf(p, ep);
    return r;
  }));

  /* 单镜生成(exec):createShotVideo(skipReviewGuard) — 确认闸/敏感词由命令层前置,断点续查/扣费/失败退费原样;
   * ui 模式:无确认闸(与原单镜按钮语义一致,确认闸只管批量),合规承诺/真人预审经 awaitable 闸,取消如实 blocked */
  reg('shot.generateVideo', { label: '单镜生成', needs: ['p', 'ep', 's'] }, ({ p, ep, s, args }) => metered(REG['shot.generateVideo'], async () => {
    ensureSBCfg(p, ep);
    if (s.final) return blocked('final', '该分镜已定为终稿,请先「解锁终稿」');
    if (!args.ui && !s.confirm) return blocked('unconfirmed', '镜头未确认:请先确认本镜(或经 episode.generateVideos confirmAll 授权)');
    if (window.Compliance) {
      const hits = Compliance.checkText(s.prompt || '').hits;
      if (hits.length) return blocked('compliance', '提示词含敏感词:' + hits.map(h => h.word).join('、'));
      if (args.ui && !(await Compliance.ensureAccepted())) return blocked('compliance-declined', '已取消:需先同意「上传与创作合规承诺」');
    }
    if (args.ui && window.HumanReview && HumanReview.guardAsync) {
      if (!(await HumanReview.guardAsync(HumanReview.shotImageUrls(p, s)))) return blocked('human-review', '真人素材预审未放行,已取消生成');
    }
    await SBGen.createShotVideo(p, ep, s, sinkOf(args), true);
    if (s.video && s.video.status === 'done') { const r = ok({ shotId: s.id, url: s.video.url || '', simulated: !!s.video.simulated }); r.next = nextOf(p, ep); return r; }
    return fail('gen', (s.video && s.video.error) || '生成未完成', { result: { shotId: s.id, status: s.video && s.video.status } });
  }));

  /* 智能审片(exec):autoSmartReview 闭环(不达标先修订提示词再重抽);manual>0 → needs_human;
   * ui 模式 quiet=false(后台面板可视),headless 默认 quiet */
  reg('episode.smartReview', { label: '智能审片' }, ({ p, ep, args }) => metered(REG['episode.smartReview'], async () => {
    if (!window.Review || !window.SB || !SB.autoSmartReview) return fail('unavailable', '审片模块未加载');
    ensureSBCfg(p, ep);
    // shotIds 子集复审(与 CLI/服务端同参):修订重抽后只复检指定镜
    const shots = Array.isArray(args.shotIds) && args.shotIds.length ? (ep.shots || []).filter(s => args.shotIds.includes(s.id)) : ep.shots;
    const r = await SB.autoSmartReview(p, ep, sinkOf(args), shots, args.ui ? false : args.quiet !== false);
    const out = ok(r);
    if (r && r.manual > 0) out.status = 'needs_human'; // 待人工镜头:质量闸门语义,produce/跑批据此阻断合成
    out.next = nextOf(p, ep);
    return out;
  }));

  /* 合成成片(exec):composeVideo + onTask 句柄轮询(原跑批等待逻辑下沉);
   * headless quiet+失败镜头前置 blocked;ui 模式保留素材不齐确认/失败镜阻塞弹窗(用户取消 → blocked cancelled 静默) */
  reg('episode.compose', { label: '合成成片' }, ({ p, ep, args }) => metered(REG['episode.compose'], async () => {
    ensureSBCfg(p, ep);
    if (!(ep.shots || []).length) return blocked('no-shots', '暂无分镜');
    if (!args.ui) {
      const failedCnt = ep.shots.filter(s => s.video && s.video.status === 'failed').length;
      if (failedCnt) return blocked('failed-shots', failedCnt + ' 个失败镜头阻塞合成,请先处理', { failed: failedCnt });
    }
    let ct = null;
    window.SB.composeVideo(p, ep, sinkOf(args), { quiet: !args.ui, onTask: tk => { ct = tk; } });
    if (!ct) return args.ui ? blocked('cancelled', '已取消合成') : fail('intercepted', '合成被拦截(积分不足/无可合成素材)');
    for (let i = 0; i < 200 && ct.status === 'running'; i++) await U.delay(3000); // 上限 10 分钟,每 3s 一次
    if (ct.status === 'done') { const r = ok({ url: ep.composedUrl || '', count: (ep.shots || []).length }); r.next = nextOf(p, ep); return r; }
    return fail('compose', ct.status === 'failed' ? ('合成失败:' + (ct.reason || '')) : '合成超时未完成(任务仍在后台,可稍后重试)');
  }));

  /* 剧本拆集(exec,项目级):执行核心 EpisodeUtil.splitCore(模式判定/切分算法经 WfCore 双端单源,
   * 与服务端 /api/wf/split-episodes 同口径);已有分集一律要求 overwrite 显式授权(整表覆盖不可撤销,
   * 旧分集进回收站 7 天可恢复;UI 的「重新分集」按钮仍走 doSplit 的覆盖确认弹窗),在飞生成拒绝覆盖 */
  reg('project.splitEpisodes', { label: '剧本拆集', needs: ['p'] }, ({ p, args }) => metered(REG['project.splitEpisodes'], async () => {
    const text = String(p.script || '').trim();
    if (!text) return blocked('no-script', '项目暂无剧本原文,请先上传剧本');
    if (!window.EpisodeUtil || !EpisodeUtil.splitCore) return fail('unavailable', '分集模块未加载');
    const had = (p.episodes || []).length;
    if (had && !args.overwrite) return blocked('has-episodes', `已有 ${had} 个分集:重新分集会整表覆盖(含分镜数据),需 overwrite 显式授权`, { episodes: had });
    let r;
    try {
      r = await EpisodeUtil.splitCore(p, text, { local: !!args.local, say: args.ui ? (t => U.toast(t, 'info', 3500)) : undefined });
    } catch (e) {
      if (e && e.code) return blocked(e.code, e.message);
      return fail('split', (e && e.message) || e);
    }
    const out = ok({ episodes: r.eps.length, mode: r.mode, overwritten: had, llmError: r.llmError || null, titles: r.eps.map(e => e.title) });
    out.next = nextOf(p, null);
    return out;
  }));

  /* 本集理解(exec):Understanding.regen(计费/失败退费与编辑器「重新生成」同源) */
  reg('episode.understanding', { label: '本集理解' }, ({ p, ep }) => metered(REG['episode.understanding'], async () => {
    if (!window.Understanding || !Understanding.regen) return fail('unavailable', '理解模块未加载');
    if (!(ep.content || '').trim()) return blocked('no-script', '本分集暂无剧本内容,请先补充剧本');
    const okU = await Understanding.regen(p, ep);
    return okU ? ok({}) : fail('understanding', '本集理解生成失败(已退费)');
  }));

  /* 主体生图(exec):缺参考图主体批量生成(subjectIds 可指定子集,含已有图重生);
   * 逐主体走 EpisodeUtil.genSubjectImage(Tasks.run 五件套:登记→扣费→执行→失败退费),发布门 G9 一键处置同入口 */
  reg('subject.generateImage', { label: '主体生图' }, ({ p, args }) => metered(REG['subject.generateImage'], async () => {
    if (!window.EpisodeUtil || !EpisodeUtil.genSubjectImage) return fail('unavailable', '主体图模块未加载');
    const ids = Array.isArray(args.subjectIds) && args.subjectIds.length ? new Set(args.subjectIds) : null;
    const todo = (p.subjects || []).filter(s => ids ? ids.has(s.id) : !s.image);
    if (!todo.length) { const r = ok({ total: 0, ok: 0, failed: [] }); r.next = nextOf(p); return r; }
    const failed = [];
    let okCnt = 0;
    for (const s of todo) {
      if (window.COST && Store.credits() < COST.image) { failed.push({ subjectId: s.id, name: s.name, error: '积分不足' }); continue; }
      const before = s.image;
      await EpisodeUtil.genSubjectImage(p, s, null, !!before); // 子集含已有图项时按重新生成语义
      if (s.image && s.image !== before) okCnt++;
      else failed.push({ subjectId: s.id, name: s.name, error: '生成失败(已退费)' });
    }
    const r = { ok: failed.length === 0, status: failed.length ? 'failed' : 'done', result: { total: todo.length, ok: okCnt, failed } };
    if (failed.length) r.error = { code: okCnt ? 'partial' : 'gen-failed', message: failed.length + ' 位主体生图失败,可重试' };
    r.next = nextOf(p);
    return r;
  }));

  /* 提取主体(exec):项目剧本(无则各集正文)→ LLM 语义提取角色/场景/道具合并入库——同名同类不覆盖
   * (缺提示词/人设/描述的补齐),新主体待生图;在线 LLM 失败如实报错(服务端已退费),离线回退本地启发式;
   * 提示词与规整 wf-core 单源(CLI project.extractSubjects 同源)。
   * args.model:调用方指定文本模型(剧本解析向导里用户选的那个),缺省取默认 LLM 设置;
   * args.local:强制本地启发式(零 LLM 零计费)——向导离线/重试回退走它,故浏览器不再有第二条入库路径 */
  reg('project.extractSubjects', { label: '提取主体' }, ({ p, args }) => metered(REG['project.extractSubjects'], async () => {
    if (!window.EpisodeUtil || !EpisodeUtil.llmExtractSubjects) return fail('unavailable', '主体提取模块未加载');
    const text = String(p.script || '').trim() || (p.episodes || []).map(e => e.content || '').filter(Boolean).join('\n').trim();
    if (!text) return blocked('no-script', '项目暂无剧本内容,请先上传剧本');
    const mode = args.mode === 'fine' ? 'fine' : 'normal';
    const types = { character: true, scene: true, prop: true };
    let found, usedLLM = false;
    if (!args.local && window.API && API.isReady()) {
      const model = args.model || (Store.state.settings || {}).defLLM || API.getConfig().model;
      const tk = Tasks.start({ type: '剧本解析', model, target: p.name, projectId: p.id });
      try { found = await EpisodeUtil.llmExtractSubjects(text, mode, types, model, tk.id, p); usedLLM = true; Tasks.done(tk); }
      catch (e) { Tasks.fail(tk, 'LLM 提取失败:' + e.message); return fail('extract', 'LLM 提取失败(已退费):' + e.message); }
    } else {
      found = EpisodeUtil.extractSubjects(text, mode, types);
    }
    p.subjects = p.subjects || [];
    let added = 0, skipped = 0;
    ['character', 'scene', 'prop'].forEach(kind => (found[kind] || []).forEach(s => {
      const exist = p.subjects.find(x => x.kind === kind && (x.name === s.name || (x.formerNames || []).includes(s.name) || (s.aliases || []).includes(x.name)));
      if (exist) {
        if (!exist.prompt && s.prompt) exist.prompt = s.prompt;
        if (!exist.persona && s.persona) exist.persona = s.persona;
        if (!exist.description && s.description) exist.description = s.description;
        skipped++;
        return;
      }
      added++;
      p.subjects.push({
        id: Store.uid('sub'), kind, name: s.name, evidence: s.evidence, description: s.description || '',
        prompt: s.prompt || EpisodeUtil.genPrompt(kind, s.name, Domain.styleOf(p)),
        persona: s.persona,
        // 生图模型取全局默认值页的偏好(浏览器侧字段默认,不属入库口径;缺省由 genSubjectImage 兜底)
        model: (window.getSettings ? getSettings().defImageModel : '') || (window.MODELS ? MODELS.image[0] : ''),
        // 别名入 formerNames:分镜按别名引用时 findSubject 仍能解析到本主体(与解析向导入库口径一致)
        formerNames: (s.aliases || []).slice(0, 10),
        image: null, status: 'pending',
      });
    }));
    /* 提取主体闭环结论按板块回流协作记忆(主体板块):/api/wf/extract-subjects 只出候选不写回 state,
     * 入库口径归调用方,故回流也挂在入库这一步(与 CLI exec project.extractSubjects 同一份 WfCore 派生);
     * 记忆桶经参数注入后存回既有 state.agentMemory,挂在原本那次 Store.save() 之前 */
    Store.state.agentMemory = WfCore.memWrite(Store.state.agentMemory,
      WfCore.memFeedback({ extract: { p, added, skipped } }, { now: Store.now }));
    Store.save();
    const r = ok({ added, skipped, total: p.subjects.length, llm: usedLLM, truncated: !!found.truncated });
    r.next = nextOf(p);
    return r;
  }));

  /* 发布留痕(exec,项目级):过发布门后打版本 + 写一条 releases 留痕。
   * 判定与写回走 js/release-core.js 双端单源(与服务端 /api/wf/release、CLI 同一份 stamp);
   * 门禁结论仍由 Release.collect 出(浏览器十项门,判据与计数口径一字未动),本层不另判一遍;
   * 未过门一律 blocked(force 授权位由调用方明示),空项目 blocked;零 LLM 零计费,故 meter:false。 */
  reg('project.release', { label: '发布留痕', needs: ['p'], meter: false }, ({ p, args }) => {
    if (!window.Release || !Release.stampRelease) return fail('unavailable', '交付检查模块未加载');
    const gate = args.gateResult || Release.collect(p, { online: online() });
    const r = Release.stampRelease(p, args.note, {
      gateResult: gate, online: online(), force: !!args.force, minScore: args.minScore,
    });
    if (!r.ok) return blocked(r.code || 'gate-blocked', r.reason, { gate: ReleaseCore.brief(r.gate || gate) });
    const out = ok({ digest: r.release.digest, ver: r.release.ver, checksum: r.release.checksum, forced: !!r.release.forced, gate: ReleaseCore.brief(gate) });
    out.next = nextOf(p);
    return out;
  });

  /* 专家自进化(exec,项目外):把该专家生效板块的协作记忆沉淀蒸馏为 ≤4 条进化条款追加进其 persona。
   * 引擎复用 Experts.evolveExpert(四个人手按钮同一个函数、同一份板块过滤与同一份计费五件套),
   * 本层只做「按 id 或名称取到专家 → 转结构化回执」,不另起一套蒸馏——与 CLI/MCP 的 headless 出口
   * (/api/wf/evolve-expert)判据同源。needs 为空:它作用在专家上,不吃 pid/epid,故 next 也不推。 */
  reg('expert.evolve', { label: '专家自进化', needs: [] }, ({ args }) => metered(REG['expert.evolve'], async () => {
    if (!window.Experts || !Experts.evolveExpert) return fail('unavailable', '专家模块未加载');
    const key = String(args.expert || '').trim();
    if (!key) return blocked('not-found', '缺 expert(专家 id 或名称)');
    const all = window.allExperts ? allExperts() : [];
    const e = all.find(x => x.id === key) || all.find(x => x.name === key);
    if (!e) return blocked('not-found', '专家不存在:' + key);
    const r = await Experts.evolveExpert(e);
    if (!r) return fail('evolve', '进化未返回结果');
    if (r.ok) return ok({ expertId: r.expertId, name: r.name, from: r.from || '', boards: r.boards || [], clauses: r.clauses || [], changed: !!r.changed, evolutions: r.evolutions || 0 });
    // 两道闸/离线/积分不足一律是前置拦截(零调用零计费),蒸馏本身报错才算失败
    return r.code === 'evolve' ? fail('evolve', r.message) : blocked(r.code, r.message, { boards: r.boards || [] });
  }));

  /* 一键成片(exec,编排):就绪检查 → 批量生成 → 智能审片(质量闸门) → 合成成片;
   * 待人工镜头默认阻断合成(riskyCompose 放行);审片被关闭/模块缺失时步骤如实登记 skipped
   * (模块缺失=质量闸门无法执行,默认 blocked,riskyCompose 放行);onStep(stepKey) 供跑批行内状态回报;
   * 子执行一律 headless(一键成片语义=一次确认后无值守;审片后台面板经 quiet/ui 字段单独控制) */
  reg('episode.produce', { label: '一键成片', meter: false }, async ({ p, ep, args }) => {
    const steps = [];
    const cost = () => steps.reduce((n, x) => n + (x.cost || 0), 0);
    const push = (key, r) => { steps.push({ step: key, ok: r.ok, status: r.status, cost: r.cost || 0, result: r.result, error: r.error || null }); return r; };
    const onStep = typeof args.onStep === 'function' ? args.onStep : () => {};
    const sub = Object.assign({}, args, { ui: false });
    ensureSBCfg(p, ep);
    // 1. 就绪检查(与跑批 preflight 同口径)
    onStep('就绪检查');
    const st = Domain.episodeState(p, ep, online());
    if (st.status === 'blocked' || st.shotsStale) return Object.assign(blocked('preflight', '就绪检查未通过:' + (st.blockers.map(b => b.label).join('/') || '分镜已过期'), { steps, blockers: st.blockers }), { cost: 0, next: nextOf(p, ep) });
    if (!(ep.shots || []).length) return Object.assign(blocked('no-shots', '未分镜', { steps }), { cost: 0, next: nextOf(p, ep) });
    // 2. 批量生成(失败镜不阻塞后续,合成前统一拦截)
    onStep('批量生成视频');
    const g = push('generateVideos', await execute('episode.generateVideos', sub));
    // 3. 智能审片(主线一等步骤,默认开;不达标先修订提示词再重抽)——缺审片一律如实登记,不静默跳过
    if (args.smartReview === false) {
      steps.push({ step: 'smartReview', ok: false, status: 'skipped', cost: 0, result: null, error: { code: 'disabled', message: '审片已按参数关闭(smartReview:false),质量闸门未执行' } });
    } else if (!window.Review) {
      steps.push({ step: 'smartReview', ok: false, status: 'skipped', cost: 0, result: null, error: { code: 'unavailable', message: '审片模块未加载,质量闸门未执行' } });
      if (!args.riskyCompose) return Object.assign({ ok: false, status: 'blocked', error: { code: 'review-unavailable', message: '审片模块未加载,质量闸门无法执行(riskyCompose 可放行)' }, result: { steps } }, { cost: cost(), next: nextOf(p, ep) });
    } else {
      onStep('智能审片');
      ep.sbConfig.maxRetry = Domain.reviseRetryLimit(args.maxRetry, ep.sbConfig.maxRetry);
      const rv = push('smartReview', await execute('episode.smartReview', args));
      // 质量闸门:存在待人工镜头默认阻断合成(防止带病成片),仅显式 riskyCompose 放行
      if (rv.result && rv.result.manual > 0 && !args.riskyCompose) {
        return Object.assign({ ok: false, status: 'needs_human', error: { code: 'manual-gate', message: '待人工 ' + rv.result.manual + ' 镜,质量闸门已阻断合成(riskyCompose 可放行)' }, result: { steps } }, { cost: cost(), next: nextOf(p, ep) });
      }
    }
    // 4. 合成成片
    onStep('合成成片');
    const c = push('compose', await execute('episode.compose', sub));
    if (!c.ok) return Object.assign({ ok: false, status: c.status, error: c.error, result: { steps } }, { cost: cost(), next: nextOf(p, ep) });
    return Object.assign(ok({ steps, url: c.result.url }), { cost: cost(), next: nextOf(p, ep) });
  });

  /* ---- 计费计量:Store.credits 前后差值(本地口径,含子调用全部扣费与退费回补) ---- */
  async function metered(cmd, fn) {
    if (!cmd.meter || !window.Store || !Store.credits) return fn();
    const c0 = Store.credits();
    const r = await fn();
    r.cost = Math.max(0, c0 - Store.credits());
    return r;
  }

  /* ---- 上下文解析:pid/epid/sid → {p,ep,s};缺失抛 {code,message} ---- */
  function resolveCtx(args, needs) {
    const out = { args };
    if (!needs.includes('p')) return out;
    const p = window.Store && Store.getProject(args.pid);
    if (!p) throw { code: 'not-found', message: '项目不存在:' + (args.pid || '(缺 pid)') };
    out.p = p;
    if (!needs.includes('ep')) return out;
    const ep = (p.episodes || []).find(e => e.id === args.epid);
    if (!ep) throw { code: 'not-found', message: '分集不存在:' + (args.epid || '(缺 epid)') };
    out.ep = ep;
    if (!needs.includes('s')) return out;
    const s = (ep.shots || []).find(x => x.id === args.sid) || (ep.shots || [])[(+args.sid) - 1]; // sid 支持 id 或镜头号
    if (!s) throw { code: 'not-found', message: '镜头不存在:' + (args.sid || '(缺 sid)') };
    out.s = s;
    return out;
  }

  /* ---- 统一入口 ---- */
  async function execute(name, args) {
    const cmd = REG[name];
    if (!cmd) return fail('unknown-command', '未注册命令:' + name + '(可用:' + Object.keys(REG).join(', ') + ')');
    args = args || {};
    const key = name + ':' + (args.pid || '') + ':' + (args.epid || '') + ':' + (args.sid || '');
    if (cmd.risk === 'exec') {
      if (INFLIGHT.has(key)) return { ok: false, status: 'running', error: { code: 'inflight', message: '相同命令正在执行中,等待完成后再试' }, result: {} };
      INFLIGHT.add(key);
    }
    try {
      const ctx = resolveCtx(args, cmd.needs);
      return await cmd.handler(ctx);
    } catch (e) {
      if (e && e.code === 'not-found') return blocked('not-found', e.message);
      return fail('exception', (e && e.message) || e);
    } finally {
      INFLIGHT.delete(key);
    }
  }

  /* 自省:list 供 Agent/CLI/MCP 发现可用命令(名称/语义/风险级/参数面;desc/args 来自 cmd-registry.js 单源) */
  function list() {
    return Object.keys(REG).map(n => ({ name: n, label: REG[n].label || n, risk: REG[n].risk, needs: REG[n].needs, desc: REG[n].desc || '', args: REG[n].args || [] }));
  }

  /* ---- UI 调用方统一消化命令回执(第三阶段) ----
   * 命令级拦截(blocked/inflight/failed/needs_human)统一 toast 口径,引擎执行过程提示不重复播报;
   * 用户主动取消(cancelled/compliance-declined/human-review 等决策类 blocked)默认静默(opts.silentCancel=false 可开);
   * 成功默认静默(引擎自身已 toast/弹窗),opts.okToast 可强制播报。返回 r 便于调用方链式读 result/next。 */
  function digest(r, opts) {
    opts = opts || {};
    if (!r) return r;
    if (r.ok) { if (opts.okToast) U.toast(opts.okToast === true ? '执行完成' : opts.okToast, 'success'); return r; }
    const code = r.error && r.error.code, msg = (r.error && r.error.message) || '执行未完成';
    if (r.status === 'running' || code === 'inflight') { U.toast(msg, 'info', 2500); return r; }
    if (r.status === 'blocked') {
      const silent = code === 'cancelled' || code === 'compliance-declined' || code === 'human-review';
      if (!silent || opts.silentCancel === false) U.toast(msg, 'info', 3200);
      return r;
    }
    if (r.status === 'needs_human') { U.toast(msg, 'info', 4000); return r; } // 质量闸门:待人工,非错误
    U.toast(msg, 'error', 4000); // failed
    return r;
  }

  window.Commands = { execute, list, digest, REG };
})();
