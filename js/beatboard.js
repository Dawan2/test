/* ============ beatboard.js 节拍板(BeatBoard 工业化生产体系) ============
 * 核心公式:1 剧情节拍 = 1 镜头组 = 1 块节拍板 = 1 次 AI 长段落生成(≤10s)。
 * 单集固定 5 段式黄金结构,组内运镜剪辑归 AI,组间衔接归人工。
 * 复用现有体系:积分/任务/真人审核/影调(styleOf)/一致性前缀;在线走 Media.genVideo
 * 真实长段落生成(Seedance2.5 专属,时长按段落区间解析,≤30s),失败如实报错退费;离线回退占位模拟。
 */
(function () {
  window.BeatBoard = {};

  /* 5 段式黄金叙事结构(系统固化,不可增删) */
  const BEAT_DEFS = [
    { name: '开篇钩子', emotion: '好奇/悬念', timeRange: '0-15s', grids: 3 },
    { name: '矛盾建立', emotion: '紧张/对立', timeRange: '15-30s', grids: 3 },
    { name: '打压升级', emotion: '压抑/愤怒', timeRange: '30-45s', grids: 3 },
    { name: '反转蓄力', emotion: '蓄力/期待', timeRange: '45-60s', grids: 3 },
    { name: '断集留客', emotion: '震惊/悬念', timeRange: '60-75s', grids: 2 },
  ];
  /* 组间衔接规则库(后期剪辑参数,不参与 AI 生成) */
  const TRANSITION_LIB = ['音频预接', '螺口顺滑过渡', '卡点硬切', 'BGM升调截断', '黑屏断钩子'];
  /* 一致性前缀默认值(单一来源:store.js window.CONSIST_PREFIX,与镜头组共用) */
  const DEFAULT_BB_PREFIX = window.CONSIST_PREFIX;

  function ensureBeats(ep) {
    if (ep.bbPrefix === undefined) ep.bbPrefix = DEFAULT_BB_PREFIX; // 集级一致性前缀(可在编辑页改)
    if (Array.isArray(ep.beats) && ep.beats.length === 5) return ep.beats;
    ep.beats = BEAT_DEFS.map((d, i) => ({
      id: Store.uid('bt'), idx: i + 1, name: d.name, grids: d.grids,
      emotion: d.emotion, timeRange: d.timeRange, styleParam: '',
      frames: Array.from({ length: d.grids }, (_, k) => ({ img: '', text: '' })),
      transition: '', transitionNote: '',
      video: { status: 'none' }, genTime: '',
    }));
    return ep.beats;
  }

  /* 本段生成时长:由时长区间解析(PRD:叙事时长严格匹配段落区间,单板≤30s) */
  function beatDuration(b) {
    const m = String(b.timeRange || '').match(/(\d+(?:\.\d+)?)\s*[-–~至]\s*(\d+(?:\.\d+)?)/);
    const d = m ? (+m[2] - +m[1]) : 10;
    return Math.max(4, Math.min(30, Math.round(d)));
  }

  /* 长段落生成 Prompt 自动组装(实时;PRD 6.1 固定通用前缀 + 6.2 五条强制规则 + 万能填充公式) */
  function buildPrompt(p, ep, b) {
    const frames = b.frames.map((f, k) => `节拍帧${k + 1}:${f.text || '(未填写)'}`).join('\n');
    return `${styleOf(p)}风格,统一画风,高清8K画质,极致细节,人物五官稳定无漂移,角色比例统一,光影层次高级,色彩干净通透,动态流畅自然,无崩坏画面,无画风突变,无多余水印文字。${ep.bbPrefix ? '\n' + ep.bbPrefix : ''}
本段为5段式短剧第${b.idx}段「${b.name}」,核心情绪:${b.emotion || '未设定'}。叙事时长严格匹配区间 ${b.timeRange}(约${beatDuration(b)}秒),单板不超过30秒。
强制规则:严格遵循宫格节拍帧从左至右时序叙事;AI 自主完成组内运镜、景别切换、镜头快切与画面过渡,无需人工细分单镜头;贴合本段核心情绪氛围,镜头节奏适配剧情松紧,不拖沓、无无效留白;仅以节拍帧为叙事脉络参考,保留 AI 创意空间,画面自然不僵硬:
${frames}${b.styleParam ? '\n本段生成参数:' + b.styleParam : ''}${p.globalSetting ? '\n全局设定:' + p.globalSetting : ''}${window.negOf && p.negPrompt ? '\n负面约束:' + p.negPrompt : ''}`;
  }

  /* 渲染守卫:仅当用户仍停留在该集节拍板页(hash 对应该集且仍处于 bbMode)才重渲,
   * 否则只存数据,防止异步生成完成时盖掉用户已切走的页面 */
  function renderIfCurrent(main, p, ep) {
    if (main && main.isConnected && ep.bbMode && location.hash === `#/project/${p.id}/episode/${ep.id}`) BeatBoard.render(main, p, ep);
    else Store.save();
  }

  /* ---------- 单板生成(在线走火山引擎真实文生视频,失败如实抛错退费;离线回退占位模拟) ---------- */
  async function genBeat(p, ep, b, main, skipGuard) {
    if (b.video.status === 'generating') return U.toast('该节拍板正在生成中', 'info');
    if (!skipGuard && window.HumanReview) {
      // 校验范围:节拍帧图片 + 本集镜头组绑定资产(g.assets 值与 g.sceneImage,若存在)
      const urls = [...new Set(b.frames.map(f => f.img)
        .concat((ep.groups || []).flatMap(g => Object.values(g.assets || {}).concat(g.sceneImage || [])))
        .filter(Boolean))];
      // 包装为可 await:放行时等生成完成;被拦截(驳回/确认窗未点)时 50ms 后按未放行返回,
      // 由调用方依据 b.video.status 判断(批量循环会中止,确认窗稍后仍可单独放行)
      return new Promise(resolve => {
        let settled = false;
        const done = () => { if (!settled) { settled = true; resolve(); } };
        HumanReview.guard(urls, async () => { await genBeat(p, ep, b, main, true); done(); });
        setTimeout(() => { if (b.video.status !== 'generating') done(); }, 50);
      });
    }
    b.promptFinal = buildPrompt(p, ep, b);
    // 十轮:断点续查——此前失败保留的 upstreamId(超时/中断)优先查一次上游:已成功直接落片
    // (0 积分恢复,不重复扣费),仍在生成提示等待,已失败按普通生成重走
    if (window.Media && Media.isReady() && b.video && b.video.status === 'failed' && b.video.upstreamId) {
      try {
        const st = await Media.checkVideo(b.video.upstreamId);
        if (st.status === 'succeeded' && st.videoUrl) {
          const frame = await Media.captureFrameUp(st.videoUrl, 0.1, 'beat_' + p.id + '_' + b.idx + '.jpg');
          b.video = { status: 'done', url: st.videoUrl, frame: frame || PH.video(`${b.name}|${(b.frames[0] || {}).text || ep.title}`, b.idx) };
          Store.save(); renderIfCurrent(main, p, ep);
          return U.toast(`Beat${b.idx}「${b.name}」已恢复上次生成结果(不重复计费)`, 'success', 3500);
        }
        if (st.status === 'running' || st.status === 'queued') return U.toast('上游任务仍在生成中,请稍后再试(或等待完成后恢复)', 'info', 3500);
      } catch (_) { /* 查询失败按普通生成重走 */ }
    }
    const cost = COST.video * 2; // 长段落出片按 2 镜计
    await Tasks.run({ type: '节拍板生成', model: `${((ep.bbModel || MODELS.video[0]).split(',')[1] || 'Seedance')}·${beatDuration(b)}s`, target: `${ep.title}·Beat${b.idx} ${b.name}`, cost, actionName: `节拍板生成(Beat${b.idx} ${b.name})`, projectId: p.id, episodeId: ep.id }, async (tk) => {
      b.video = { status: 'generating' };
      Store.save(); renderIfCurrent(main, p, ep);
      // 真实生成:提示词用节拍帧文本拼装的 promptFinal,直接 await(数分钟)
      if (window.Media && Media.isReady()) {
        try {
          // 首帧参考:第一枚节拍帧是真实图片(非占位 dataURL)时作为 i2v 首帧
          const f0 = (b.frames[0] || {}).img;
          const r = await Media.genVideo({
            prompt: b.promptFinal,
            ratio: (ep.sbConfig && ep.sbConfig.ratio) || '16:9',
            duration: beatDuration(b), // PRD:叙事时长严格匹配段落区间(≤30s)
            model: Media.realModel(ep.bbModel || MODELS.video[0]), // 默认 2.0-mini;顶栏可显式切 Seedance 2.5 长段落
            image: f0 && !f0.startsWith('data:') ? f0 : undefined,
            billingAction: 'video.beat', // 长段落按 2 镜计价(服务端白名单,与本地 2×COST.video 一致)
            operationId: tk.id,
            // 十轮:节拍段也登记服务端任务中心(shotId 用 beat 复合键)——超时/失败后再点「生成」
            // 同段同输入命中 findActiveJob 幂等复用原上游任务,不再重复创建 operation 与上游任务(此前未传 job,
            // 十分钟后重试会双开上游,原任务可能继续成功形成重复成本);upstreamId 落 state 供断点续查
            job: { projectId: p.id, episodeId: ep.id, shotId: 'beat:' + ep.id + ':' + b.idx },
            onCreated: id => { if (b.video && b.video.status === 'generating') { b.video.upstreamId = id; Store.save(); } },
          });
          const frame = await Media.captureFrameUp(r.videoUrl, 0.1, 'beat_' + p.id + '_' + b.idx + '.jpg'); // 截帧即传服务端,防 base64 撑爆 localStorage
          b.video = { status: 'done', url: r.videoUrl, frame: frame || PH.video(`${b.name}|${(b.frames[0] || {}).text || ep.title}`, b.idx) };
        } catch (e) {
          // 真实模式失败:抛错由 Tasks.run 统一处理(__noRefund 跳过退费),不用占位视频冒充
          b.video = { status: 'failed', error: e.message, upstreamId: b.video && b.video.upstreamId, resumable: !!(b.video && b.video.upstreamId) }; // PRD:失败状态+错误提示(可直接重试;保留 upstreamId 供续查)
          Store.save();
          renderIfCurrent(main, p, ep);
          if (e.__pending) {
            // 九轮:10 分钟超时,任务仍在后台生成(不退费;服务端 30 分钟标 stale 查上游、60 分钟兜底退款,重试幂等续查)
            U.toast(`Beat${b.idx}「${b.name}」生成超时,任务仍在后台——稍后可重试续查,若最终失败服务端自动退费(60 分钟兜底)`, 'info', 5000);
          } else {
            const fe = Media.friendlyError(e);
            U.toast(`Beat${b.idx}「${b.name}」生成失败,积分已返还:${fe.msg}。💡 ${fe.advice}`, 'error', 5000);
          }
          throw e;
        }
      } else {
        // 离线模式:占位视频帧
        await new Promise(res => U.runTask({
          title: `Beat${b.idx}「${b.name}」长段落生成中(离线模拟)`, cancellable: false,
          steps: [{ label: '节拍帧锚点解析', ms: 900 }, { label: 'AI 自主运镜剪辑', ms: 1400 }, { label: '长段落合成(≤30s)', ms: 900 }],
          onDone: res,
        }));
        b.video = { status: 'done', frame: PH.video(`${b.name}|${(b.frames[0] || {}).text || ep.title}`, b.idx), simulated: true }; // simulated:在线时不算就绪(批量生成/合成不认占位)
      }
      b.genTime = Store.now();
      ep.composed = false;
      Store.save();
      U.toast(`Beat${b.idx}「${b.name}」生成完成`, 'success');
      renderIfCurrent(main, p, ep);
      return { filename: `${ep.title}_Beat${b.idx}${b.name}_视频帧.png`, dataURL: b.video.frame };
    });
  }

  /* ---------- 批量生成全部节拍板(逐条扣费) ---------- */
  async function genAllBeats(p, ep, main) {
    const pend = ep.beats.filter(b => !Store.beatVideoReady(b) && b.video.status !== 'generating'); // 统一就绪判定:在线时模拟占位不算已生成
    if (!pend.length) return U.toast('所有节拍板均已生成', 'info');
    U.confirm(`将为 ${pend.length} 块节拍板依次生成(每块 ${COST.video * 2} 积分,逐条扣减,失败自动返还)。开始吗?`, async () => {
      for (const b of pend) {
        await genBeat(p, ep, b, main);
        if (!Store.beatVideoReady(b)) break; // 失败/积分不足即停
      }
    }, '开始生成');
  }

  /* ---------- AI 拆解节拍板:LLM 按本集剧本+本集理解填充 5 段(情绪/节拍帧/衔接),失败回退本地粗拆 ---------- */
  function applyAIFill(ep, arr) {
    let n = 0;
    ep.beats.forEach((b, i) => {
      const d = arr[i];
      if (!d) return;
      if (d.emotion) b.emotion = String(d.emotion).slice(0, 20);
      if (d.styleParam) b.styleParam = String(d.styleParam).slice(0, 60);
      if (Array.isArray(d.frames)) d.frames.slice(0, b.grids).forEach((t, k) => { if (t && !b.frames[k].text) { b.frames[k].text = String(t).slice(0, 120); n++; } });
      if (d.transition && TRANSITION_LIB.includes(d.transition) && !b.transition) b.transition = d.transition; // 命中规则库才写入
    });
    return n;
  }
  /* 离线/LLM 失败回退:按分镜脚本(场次→节拍)文本顺序铺入 5 段宫格 */
  function localFillBeats(p, ep) {
    const bd = ep.scriptBoard && ep.scriptBoard.scenes ? ep.scriptBoard : (window.SB && SB.deriveBoard ? SB.deriveBoard(ep) : null);
    const pool = [];
    if (bd) bd.scenes.forEach(sc => sc.beats.forEach(bt => { const t = (bt.shot || bt.plot || '').trim(); if (t) pool.push(t); }));
    if (!pool.length && ep.content) ep.content.split(/\n+/).map(x => x.trim()).filter(x => x.length > 4).forEach(x => pool.push(x));
    let n = 0;
    if (pool.length) {
      const total = ep.beats.reduce((s2, b) => s2 + b.grids, 0); // 3+3+3+3+2=14
      let cursor = 0;
      ep.beats.forEach(b => b.frames.forEach(f => {
        if (f.text) { cursor++; return; }
        const idx = Math.min(pool.length - 1, Math.floor(cursor / total * pool.length));
        f.text = pool[idx].slice(0, 120); n++; cursor++;
      }));
    }
    return n;
  }
  async function aiFillBeats(p, ep, main) {
    const content = (ep.content || '').trim();
    if (!content) return U.toast('本集暂无剧本内容,请先在分集管理补充', 'error');
    Tasks.run({ type: '节拍板拆解', model: (ep.sbConfig && ep.sbConfig.sbModel) || '默认 LLM', target: ep.title, cost: COST.smartSB, actionName: '节拍板 AI 拆解(' + ep.title + ')', projectId: p.id, episodeId: ep.id }, async (tk) => {
      const underst = ep.understanding && window.Understanding ? Understanding.toText(ep.understanding) : '';
      const gridsStr = ep.beats.map(x => x.grids).join(',');
      let filled = 0, usedLLM = false;
      if (window.Understanding && window.API && API.isReady()) {
        try {
          const out = await Understanding.chatJSONRobust({
            model: (ep.sbConfig || {}).sbModel,
            system: '你是短剧节拍拆解专家,精通 5 段式黄金结构(开篇钩子→矛盾建立→打压升级→反转蓄力→断集留客)。' + (window.KB ? KB.WR_STRUCTURE + KB.WR_FACESLAP : ''),
            user: `把本集剧本拆解到 5 段式节拍板,返回严格 JSON:\n{"beats":[{"emotion":"本段核心情绪(≤8字)","styleParam":"本段 AI 风格参数(≤20字,可空)","frames":["节拍帧画面描述(一句,含人物动作/表情/关键道具)",...],"transition":"到下一组的衔接规则"}×5]}\n要求:5 段依次为 开篇钩子/矛盾建立/打压升级/反转蓄力/断集留客;各段 frames 数量固定为 ${gridsStr}(宫格时序即播放时序);transition 从 ${TRANSITION_LIB.join('/')} 中选;节拍帧描述要可直接用于文生视频。\n本集理解:${underst.slice(0, 600) || '(未生成)'}\n剧本:\n${content.slice(0, 6000)}`,
            temperature: 0.5, max_tokens: 4000,
            billingAction: 'llm.smartSB', operationId: tk.id, // 七轮:与任务同 opId(服务端 llm.smartSB 与本地 COST.smartSB 同价,解析重试不重复扣)
          });
          if (out && Array.isArray(out.beats)) { filled = applyAIFill(ep, out.beats); usedLLM = true; }
        } catch (e) {
          // LLM 失败回退本地粗拆:服务端已自动退费,本地镜像同步退(任务核减成本,口径一致)
          Tasks.partialRefund(tk, 1, COST.smartSB, '节拍板拆解失败回退本地,已退费');
        }
      }
      if (!usedLLM) filled = localFillBeats(p, ep);
      Store.save();
      BeatBoard.render(main, p, ep);
      U.toast(usedLLM ? `AI 拆解完成:已填充 ${filled} 个空节拍帧(已有内容不覆盖)` : `LLM 不可用,已按剧本本地粗拆 ${filled} 个空节拍帧`, usedLLM ? 'success' : 'info', 3500);
    });
  }

  /* ---------- 合成五段成片:5 段全部出片后按节拍顺序拼接(归档成片库,与分镜合成共用 ep.composed* 字段) ---------- */
  async function composeBeats(p, ep, main) {
    if (!ep.beats.every(x => Store.beatVideoReady(x) && x.video.url)) return U.toast('还有节拍段未出片(离线模拟占位在线时需真实重做),5 段全部生成后才能合成', 'error'); // 统一就绪判定
    if (!window.Media || !Media.isReady()) return U.toast('合成需要后端在线(服务端 FFmpeg)', 'error', 3200);
    Tasks.run({ type: '合成成片', model: '本地合成·节拍板五段', target: ep.title, cost: COST.compose, actionName: '合成成片(' + ep.title + '·节拍板)', projectId: p.id, episodeId: ep.id }, async (tk) => {
      const items = ep.beats.map(x => ({ video: x.video.url })); // 节拍段间衔接为后期剪辑参数(音频预接/BGM 截断等),合成按硬切
      const r = await Media.ffCompose(items, (ep.sbConfig && ep.sbConfig.ratio) || '16:9', false, 'ff.compose', tk.id);
      ep.composed = true;
      delete ep.composedSimulated; // 真实合成成功:显式清除旧离线模拟标记,避免永久被判为模拟
      ep.composedAt = Store.now(); ep.composedUrl = r.url;
      ep.composedVia = 'beats'; // 来源轨:节拍板五段合成(成片库据此标「节拍板」)
      ep.composedInputHash = Store.composedInputHash(ep); // 七轮:节拍段素材变化 → 成片自动失效
      ep.composedSourceRev = ep.contentRev || 0; // 十轮:记录合成时的剧本版本(剧本修改后提示重合成)
      ep.composedGraphRev = ep.graphRev || 0;    // 十二轮:记录合成时的图谱版本(图谱修订后判旧)
      Store.save();
      BeatBoard.render(main, p, ep);
      U.toast('五段成片已合成,已归档成片库', 'success');
      return { filename: `${p.name}_${ep.title}_节拍板成片.mp4`, dataURL: r.url };
    });
  }

  /* ---------- 转回分镜表:5 段节拍 → 本集分镜(每段一镜;已有分镜整体覆盖,沿用项目覆盖惯例) ---------- */
  function beatsToShots(p, ep, main) {
    const oldCnt = (ep.shots || []).length;
    U.confirm(
      `将把 5 段节拍转换为本集分镜:每段一镜(名称=BeatN+节拍名,剧情=节拍帧文本拼接,时长自动预估,已生成段落视频直接挂到对应分镜)。${oldCnt ? `注意:本集已有 ${oldCnt} 个分镜,转换后将整体覆盖,不备份、不可找回。` : ''}确定转换吗?`,
      () => {
        const cfg = ep.sbConfig || (window.SB && SB.defaultSBConfig ? SB.defaultSBConfig(p) : { batchCamera: '固定镜头', batchVideoModel: MODELS.video[0], batchStrategy: 'ref', narratorVoice: '' });
        ep.shots = ep.beats.map((b, i) => {
          const ns = (window.SB && SB.blankShot) ? SB.blankShot(i, cfg) : { id: Store.uid('sh'), order: i, characters: [], scene: '', props: [], camera: '固定镜头', plot: '', prompt: '', video: { status: 'none' }, history: [] };
          ns.name = `Beat${b.idx} ${b.name}`;
          ns.plot = b.frames.map((f, k) => String(f.text || '').trim()).filter(Boolean).join('。') || b.name;
          ns.duration = (window.SB && SB.estShotDuration) ? SB.estShotDuration(ns) : 10;
          if (b.video && b.video.status === 'done' && b.video.url) {
            ns.video = { status: 'done', url: b.video.url, frame: b.video.frame || '' };
            // 回填输入指纹基线(与 store.js 存量迁移同语义):当下不误报,此后素材/输入变更即判旧
            if (window.Domain) { ns.video.inputHash = Domain.shotInputHash(p, ns); ns.video.assetVer = Domain.shotAssetVer(p, ns); }
          }
          ns.history = [{ type: '节拍板转入', model: 'BeatBoard', time: Store.now() }];
          return ns;
        });
        ep.uiSel = ep.shots[0] ? ep.shots[0].id : null;
        ep.composed = false;  // 分镜整体覆盖:旧成片已无分镜支撑(对齐批量全删口径)
        ep.lastReview = null; // 逐镜审片报告引用的 shotId 已全部失效
        ep.shotsSourceRev = ep.contentRev || 0; // 记录分镜对应的剧本版本(剧本修改后判旧)
        ep.shotsGraphRev = ep.graphRev || 0;    // 记录分镜对应的事件图谱版本(图谱修订后判旧)
        Store.state.settings.epViewMode = 'shots'; // 转完进入分镜视频视图(全局视图偏好)
        Store.save();
        U.toast('已转换为 5 个分镜(Beat1~5),进入分镜视频视图', 'success');
        Views.episode(main, p.id, ep.id);
      }, '⇄ 转回分镜表');
  }

  /* ---------- 工程导出 ---------- */
  function exportProject(p, ep) {
    const data = {
      project: p.name, episode: ep.title, style: styleOf(p), exportedAt: Store.now(),
      beats: ep.beats.map(b => ({
        beat: `Beat${b.idx} ${b.name}`, emotion: b.emotion, timeRange: b.timeRange,
        frames: b.frames.map((f, k) => ({ frame: k + 1, text: f.text, hasImage: !!f.img })),
        transitionToNext: b.transition ? b.transition + (b.transitionNote ? '(' + b.transitionNote + ')' : '') : '未设置',
        promptFinal: buildPrompt(p, ep, b),
        videoStatus: b.video.status,
      })),
    };
    U.downloadText(`${p.name}_${ep.title}_节拍板工程.json`, JSON.stringify(data, null, 2));
    U.toast('节拍板工程已导出', 'success');
  }

  /* ================= 主渲染(分集工作区中栏「节拍板」tab,页内挂载;main=中栏内容容器) ================= */
  BeatBoard.render = function (main, p, ep) {
    ensureBeats(ep);
    if (!ep.bbSel || !ep.beats.some(b => b.id === ep.bbSel)) ep.bbSel = ep.beats[0].id;
    const b = ep.beats.find(x => x.id === ep.bbSel);
    const beatReady = x => Store.beatVideoReady(x); // 统一就绪判定(Store 谓词):在线时模拟占位不算出片
    const doneCnt = ep.beats.filter(beatReady).length;
    const allDone = ep.beats.every(x => Store.beatVideoReady(x) && x.video.url); // 5 段全部真实出片才可合成(统一就绪判定)
    const busy = b.video.status === 'generating'; // 生成中锁定当前板块编辑(PRD 12.2,防内容错乱)
    const gName = id => { const g = (ep.groups || []).find(g2 => g2.id === id); return g ? g.name : ''; };

    main.innerHTML = `
    <div>
      <div class="row" style="margin-bottom:10px;gap:8px;flex-wrap:wrap;align-items:center">
        <span class="tag yellow">🥁 节拍板</span>
        <span class="tag cyan">${U.esc(styleOf(p))}</span>
        <span class="tag">${doneCnt}/5 段已出片</span>
        <select class="select small" data-x="bbmodel" style="width:auto;max-width:230px" title="生成本段所用模型:默认 Seedance 2.0 Mini(省钱);需要长段落高一致性时显式选 2.5(更贵)">${MODELS.video.map(mo => `<option ${(ep.bbModel || MODELS.video[0]) === mo ? 'selected' : ''}>${U.esc(mo)}</option>`).join('')}</select>
        <span class="grow"></span>
        <button class="btn sm" data-x="aifill" title="按本集剧本与本集理解,AI 自动填充 5 段的核心情绪/节拍帧描述/衔接建议(-${COST.smartSB}积分)">✨ AI 拆解节拍板</button>
        <button class="btn sm" data-x="reset" title="仅清空自定义内容(节拍帧图文/风格参数/衔接),结构宫格与模板参数不动,已生成视频保留">↺ 重置模板</button>
        <button class="btn sm" data-x="export">⬇ 导出工程</button>
        <button class="btn sm primary" data-x="genall" ${doneCnt === 5 ? 'disabled' : ''}>⚡ 批量生成全部节拍</button>
      </div>
      <div class="bb-body">
        <div class="bb-nav">
          ${ep.beats.map(x => `
          <div class="bb-nav-item ${x.id === b.id ? 'active' : ''}" data-beat="${x.id}">
            <span class="bb-nav-idx">Beat${x.idx}</span>
            <span class="bb-nav-name">${x.name}${x.groupId && gName(x.groupId) ? `<span class="small muted" style="display:block;font-weight:400;font-size:10px">🗂 ${U.esc(gName(x.groupId))}</span>` : ''}</span>
            <span class="bb-nav-status ${x.video.status === 'done' ? 'done' : x.video.status === 'generating' ? 'ing' : ''}">${x.video.status === 'done' ? '✓' : x.video.status === 'generating' ? '…' : x.video.status === 'failed' ? '✗' : ''}</span>
          </div>`).join('')}
          <div class="hint" style="margin-top:10px;padding:0 4px">5 段式结构系统固化,不可增删;宫格时序锁定左→右。</div>
        </div>
        <div class="bb-main">
          ${busy ? `<div class="card" style="padding:10px 14px;margin-bottom:12px;border-color:var(--accent)"><span class="small"><span class="spinner"></span> ⏳ 本段生成中,编辑已临时锁定,生成完成后自动解锁</span></div>` : ''}
          <div class="card" style="padding:14px 16px;margin-bottom:12px">
            <div class="row wrap" style="gap:14px;align-items:flex-end">
              <div><div class="small muted">节拍名称(固定)</div><b>Beat${b.idx} · ${b.name}</b></div>
              <label class="field" style="margin:0;min-width:160px"><span>核心情绪</span><input class="input small" data-f="emotion" value="${U.esc(b.emotion)}" ${busy ? 'disabled' : ''}></label>
              <label class="field" style="margin:0;width:110px"><span>时长区间</span><input class="input small" data-f="timeRange" value="${U.esc(b.timeRange)}" ${busy ? 'disabled' : ''}></label>
              <label class="field" style="margin:0;flex:1;min-width:180px"><span>本段 AI 风格参数(选填)</span><input class="input small" data-f="styleParam" value="${U.esc(b.styleParam)}" placeholder="如:冷色调、慢节奏、大量特写" ${busy ? 'disabled' : ''}></label>
              <label class="field" style="margin:0;min-width:150px"><span>绑定镜头组(1节拍=1镜头组)</span>
                <select class="select small" data-f="group" ${busy ? 'disabled' : ''}>
                  <option value="">未绑定</option>
                  ${(ep.groups || []).map(g => `<option value="${g.id}" ${b.groupId === g.id ? 'selected' : ''}>${U.esc(g.name)}</option>`).join('')}
                </select>
              </label>
            </div>
            <label class="field" style="margin:10px 0 0"><span>一致性前缀(与镜头组防崩坏约束词一致,注入 Prompt 画风画质段之后)</span><input class="input small" data-f="bbPrefix" value="${U.esc(ep.bbPrefix || '')}" ${busy ? 'disabled' : ''}></label>
          </div>

          <div class="card" style="padding:14px 16px;margin-bottom:12px">
            <div class="row" style="justify-content:space-between;align-items:center">
              <b class="small">节拍帧宫格(${b.grids} 宫格,时序锁定)</b>
              <button class="btn sm" data-x="pullgrp" title="把镜头组已绑定的角色/场景参考图按序填入空宫格">🗂 带入镜头组资产</button>
            </div>
            <div class="row" style="gap:12px;margin-top:10px;align-items:stretch">
              ${b.frames.map((f, k) => `
              <div class="bb-cell">
                <div class="small muted" style="margin-bottom:5px">节拍帧${k + 1}</div>
                <div class="bb-cell-img" data-frame-img="${k}" title="点击上传图片" style="position:relative">
                  ${f.img ? `<img src="${U.thumb(f.img)}">${busy ? '' : `<button data-frame-del="${k}" title="删除图片" style="position:absolute;right:2px;top:2px;width:18px;height:18px;border:none;border-radius:50%;background:rgba(0,0,0,.55);color:#fff;cursor:pointer;line-height:1;font-size:11px">✕</button>`}` : '<span class="small muted">点击上传<br>(可选)</span>'}
                </div>
                <textarea class="input small" rows="3" data-frame-text="${k}" placeholder="节拍帧${k + 1}画面描述(自动带入 Prompt)" ${busy ? 'disabled' : ''}>${U.esc(f.text)}</textarea>
              </div>`).join('')}
            </div>
            <div class="hint" style="margin-top:8px">无图片时仅用文本描述生成;上传图片后优先图文联动。宫格顺序即播放时序,禁止乱序。</div>
          </div>

          <div class="card" style="padding:14px 16px;margin-bottom:12px">
            <b class="small">本组 → 下一组 衔接指令</b>
            <div class="hint" style="margin:2px 0 8px">本内容为后期剪辑参数,不参与 AI 生成</div>
            ${b.idx === 5
              ? '<div class="small" style="line-height:1.8;padding:6px 10px;background:var(--bg2);border-radius:8px">本集结束,无转场:直接截断黑屏,留存悬念(末段固定规则,不可修改)</div>'
              : `<div class="row wrap" style="gap:6px;margin-bottom:8px">
              ${TRANSITION_LIB.map(t => `<span class="tag ${b.transition === t ? 'cyan' : ''}" style="cursor:pointer;${busy ? 'opacity:.5;pointer-events:none' : ''}" data-tr="${t}">${t}</span>`).join('')}
            </div>
            <input class="input small" data-f="transitionNote" value="${U.esc(b.transitionNote)}" placeholder="自定义衔接话术(选填),供后期剪辑直接使用" ${busy ? 'disabled' : ''}>`}
          </div>

          <div class="card" style="padding:14px 16px">
            <div class="row" style="justify-content:space-between;margin-bottom:8px">
              <b class="small">Seedance2.5 专属 Prompt(实时组装)</b>
              <div class="row" style="gap:6px">
                <button class="btn sm" data-x="copy">⧉ 复制 Prompt</button>
                <button class="btn sm primary" data-x="gen" ${b.video.status === 'generating' ? 'disabled' : ''}>🎬 生成本段视频(-${COST.video * 2}积分)</button>
              </div>
            </div>
            <textarea class="input small" rows="8" readonly data-prompt style="background:var(--bg2)">${U.esc(buildPrompt(p, ep, b))}</textarea>
            <div class="row" style="margin-top:8px;justify-content:space-between">
              <span class="small muted">状态:${b.video.status === 'done' ? '✅ 已生成 · ' + U.esc(b.genTime || '') : b.video.status === 'generating' ? '⏳ 生成中' : b.video.status === 'failed' ? '✕ 生成失败(可重试)' : '待生成'}</span>
              ${b.video.status === 'done' ? `<button class="btn sm" data-x="dl">⬇ 下载本段视频帧</button>` : ''}
            </div>
            ${b.video.status === 'done' && b.video.frame ? `<div style="margin-top:10px;border-radius:10px;overflow:hidden;max-width:480px"><img src="${U.thumb(b.video.frame)}" style="width:100%;display:block"></div>` : ''}
          </div>
        </div>
      </div>

      <div class="card" style="margin-top:12px;padding:14px 16px">
        <div class="row" style="justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px">
          <b class="small">🎞 成片总览(5 段归档 + 衔接方案)</b>
          <div class="row" style="gap:6px">
            <button class="btn sm" data-x="toshots" title="把 5 段节拍转为本集分镜(每段一镜,已有分镜将被覆盖)">⇄ 转回分镜表</button>
            <button class="btn sm" data-x="reuse" title="复制 5 段结构/情绪/参数/衔接到新分集,节拍帧内容清空(已生成视频不复制)">♻ 复用到新分集</button>
            <button class="btn sm primary" data-x="bbcompose" ${allDone ? '' : 'disabled title="5 段全部出片后可合成"'}>🎞 合成五段成片(-${COST.compose}积分)</button>
          </div>
        </div>
        <div class="row wrap" style="gap:10px;margin-top:10px">
          ${ep.beats.map(x => `
          <div class="bb-film">
            <div class="bb-film-img">${x.video.status === 'done' && x.video.frame ? `<img src="${U.thumb(x.video.frame)}">` : `<span class="small muted">Beat${x.idx}<br>未生成</span>`}</div>
            <div class="small" style="margin-top:4px">Beat${x.idx} ${x.name}</div>
            <div class="hint" style="margin:0">衔接:${U.esc(x.transition || '未设置')}${x.transitionNote ? '(' + U.esc(x.transitionNote) + ')' : ''}</div>
          </div>`).join('')}
        </div>
      </div>
    </div>`;

    /* ---- 事件 ---- */
    main.querySelectorAll('[data-beat]').forEach(t => t.onclick = () => { ep.bbSel = t.dataset.beat; Store.save(); BeatBoard.render(main, p, ep); });
    // 基础信息即改即存 + Prompt 实时刷新
    const bindLive = (key, sel) => {
      const el = main.querySelector(sel);
      if (el) el.oninput = () => { b[key] = el.value; Store.save(); const pv = main.querySelector('[data-prompt]'); if (pv) pv.value = buildPrompt(p, ep, b); };
    };
    bindLive('emotion', '[data-f=emotion]');
    bindLive('timeRange', '[data-f=timeRange]');
    bindLive('styleParam', '[data-f=styleParam]');
    // 一致性前缀:集级字段(ep.bbPrefix),即改即存并实时刷新 Prompt
    const bp = main.querySelector('[data-f=bbPrefix]');
    if (bp) bp.oninput = () => { ep.bbPrefix = bp.value; Store.save(); const pv = main.querySelector('[data-prompt]'); if (pv) pv.value = buildPrompt(p, ep, b); };
    const tn = main.querySelector('[data-f=transitionNote]');
    if (tn) tn.oninput = () => { b.transitionNote = tn.value; Store.save(); };
    main.querySelectorAll('[data-tr]').forEach(t => t.onclick = () => { b.transition = t.dataset.tr; Store.save(); BeatBoard.render(main, p, ep); });
    // 宫格
    main.querySelectorAll('[data-frame-text]').forEach(t => t.oninput = () => {
      b.frames[+t.dataset.frameText].text = t.value; Store.save();
      const pv = main.querySelector('[data-prompt]'); if (pv) pv.value = buildPrompt(p, ep, b);
    });
    main.querySelectorAll('[data-frame-img]').forEach(c => c.onclick = async e => {
      if (e.target && e.target.closest && e.target.closest('[data-frame-del]')) return; // 删除钮自处理
      if (busy) return U.toast('本段生成中,编辑已临时锁定', 'info');
      const f = await U.readAndUpload('image/*');
      if (!f) return;
      b.frames[+c.dataset.frameImg].img = f.url;
      Store.save(); BeatBoard.render(main, p, ep);
    });
    // 宫格图片删除(PRD:上传占位框支持删除)
    main.querySelectorAll('[data-frame-del]').forEach(x => x.onclick = e => {
      e.stopPropagation();
      b.frames[+x.dataset.frameDel].img = '';
      Store.save(); BeatBoard.render(main, p, ep);
    });
    main.querySelector('[data-x=copy]').onclick = () => {
      const txt = main.querySelector('[data-prompt]').value;
      (navigator.clipboard ? navigator.clipboard.writeText(txt) : Promise.reject()).then(
        () => U.toast('Prompt 已复制,可直接投喂 Seedance2.5', 'success'),
        () => { U.downloadText(`Beat${b.idx}_${b.name}_prompt.txt`, txt); U.toast('剪贴板不可用,已下载 TXT', 'info'); });
    };
    main.querySelector('[data-x=gen]').onclick = () => genBeat(p, ep, b, main);
    main.querySelector('[data-x=genall]').onclick = () => genAllBeats(p, ep, main);
    main.querySelector('[data-x=export]').onclick = () => exportProject(p, ep);
    // 模型选择(默认 2.0 Mini;显式选 2.5 才走 2.5,存 ep.bbModel)
    const bbm = main.querySelector('[data-x=bbmodel]');
    if (bbm) bbm.onchange = () => { ep.bbModel = bbm.value; Store.save(); U.toast('本集节拍板模型:' + bbm.value.split(',')[1], 'success', 1500); };
    // AI 拆解:只填空节拍帧,已有内容不覆盖
    main.querySelector('[data-x=aifill]').onclick = () => {
      const empty = ep.beats.reduce((n2, x) => n2 + x.frames.filter(f => !f.text).length, 0);
      if (!empty) return U.toast('所有节拍帧已有描述(如需重来请先清空)', 'info');
      aiFillBeats(p, ep, main);
    };
    // 绑定镜头组(1节拍=1镜头组):带入资产时优先只带本组
    const grpSel = main.querySelector('[data-f=group]');
    if (grpSel) grpSel.onchange = () => { b.groupId = grpSel.value || null; Store.save(); BeatBoard.render(main, p, ep); };
    const bbComp = main.querySelector('[data-x=bbcompose]');
    if (bbComp) bbComp.onclick = () => composeBeats(p, ep, main);
    // 转回分镜表:5 段节拍 → 每段一镜(覆盖本集分镜,转完跳分镜视频视图)
    const toShotsBtn = main.querySelector('[data-x=toshots]');
    if (toShotsBtn) toShotsBtn.onclick = () => beatsToShots(p, ep, main);
    // 一键重置模板(PRD 12.3:仅清自定义内容,结构/宫格/模板参数不动,已生成视频保留)
    main.querySelector('[data-x=reset]').onclick = () => U.confirm('一键重置:清空本集 5 段的节拍帧图文/风格参数/衔接设置,恢复系统默认模板(已生成视频与工程结构保留)。确定吗?', () => {
      ep.beats.forEach((b2, i) => {
        const d = BEAT_DEFS[i];
        b2.emotion = d.emotion; b2.timeRange = d.timeRange; b2.styleParam = '';
        b2.frames.forEach(f => { f.img = ''; f.text = ''; });
        b2.transition = ''; b2.transitionNote = '';
      });
      ep.bbPrefix = DEFAULT_BB_PREFIX;
      Store.save(); BeatBoard.render(main, p, ep);
      U.toast('已重置为系统模板(5 段结构与宫格未动)', 'success');
    }, '一键重置');
    // 复用到新分集(PRD 项目复用:复制结构/参数/衔接,仅清空节拍帧内容,不复制已生成视频)
    const reuseBtn = main.querySelector('[data-x=reuse]');
    if (reuseBtn) reuseBtn.onclick = () => {
      U.openModal({
        title: '复用节拍板工程到新分集',
        body: `<label class="field"><span>新分集标题</span><input class="input" data-f="t" value="第${p.episodes.length + 1}集"></label>
        <div class="hint">复制 5 段结构、情绪/时长/风格参数与衔接方案;节拍帧内容清空,已生成视频不复制。</div>`,
        footer: '<button class="btn" data-x="cancel">取消</button><button class="btn primary" data-x="ok">创建并打开</button>',
        onMount(m, close) {
          m.querySelector('[data-x=cancel]').onclick = close;
          m.querySelector('[data-x=ok]').onclick = () => {
            const title = m.querySelector('[data-f=t]').value.trim() || `第${p.episodes.length + 1}集`;
            const nep = {
              id: Store.uid('ep'), title, content: '', order: p.episodes.length, shots: [], status: 'draft',
              bbPrefix: ep.bbPrefix,
              beats: ep.beats.map(b2 => ({
                id: Store.uid('bt'), idx: b2.idx, name: b2.name, grids: b2.grids,
                emotion: b2.emotion, timeRange: b2.timeRange, styleParam: b2.styleParam,
                frames: b2.frames.map(() => ({ img: '', text: '' })),
                transition: b2.transition, transitionNote: b2.transitionNote, groupId: null,
                video: { status: 'none' }, genTime: '',
              })),
            };
            p.episodes.push(nep);
            Store.save(); close();
            U.toast(`已复用到「${title}」(节拍板视图偏好自动保持)`, 'success');
            location.hash = `#/project/${p.id}/episode/${nep.id}`;
          };
        },
      });
    };
    // 带入镜头组绑定资产:按组序填入空宫格(本段已绑定组时只带本组)
    const pullBtn = main.querySelector('[data-x=pullgrp]');
    if (pullBtn) pullBtn.onclick = () => {
      if (busy) return U.toast('本段生成中,编辑已临时锁定', 'info');
      const imgs = [];
      const gs = b.groupId ? (ep.groups || []).filter(g => g.id === b.groupId) : (ep.groups || []);
      gs.forEach(g => {
        Object.values(g.assets || {}).forEach(u => u && imgs.push(u));
        if (g.sceneImage) imgs.push(g.sceneImage);
      });
      if (!imgs.length) return U.toast(b.groupId ? '绑定的镜头组还没有绑定资产,请先到「镜头组」tab 绑定' : '镜头组还没有绑定资产,请先到「镜头组」tab 绑定(或在上方绑定镜头组)', 'info');
      let filled = 0;
      ep.beats.forEach(bt => bt.frames.forEach(f => {
        if (!f.img && imgs.length) { f.img = imgs.shift(); filled++; }
      }));
      if (!filled) return U.toast('所有宫格已有图片', 'info');
      Store.save(); BeatBoard.render(main, p, ep);
      U.toast(`已带入 ${filled} 张镜头组参考图`, 'success');
    };
    const dl = main.querySelector('[data-x=dl]');
    if (dl) dl.onclick = () => { U.downloadDataURL(`Beat${b.idx}_${b.name}_视频帧.png`, b.video.frame); U.toast('已下载', 'success'); };
  };
})();
