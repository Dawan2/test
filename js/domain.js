/* ============ domain.js 领域单一来源(双端:浏览器 window.Domain / Node require) ============
 * 指纹(shotInputHash/composedInputHash)、就绪判定(shotVideoReady/epComposedReady)、
 * 判旧(shotsStale/composedStaleByScript 等)、canonical 生成请求(buildVideoRequest)、
 * 工作流状态(workflow/episodeState)的**字面单源**:
 *   - 浏览器:index.html 在 store.js 之前加载,store/sb-gen/pipeline/produce 一律委托调用;
 *   - Node:cli.js require('./js/domain.js'),写回字段与指纹和主应用逐字节一致。
 * 环境差异(在线与否)经 online 参数显式传入,本模块不读 window/Media;
 * 纯数据推导,无 DOM/网络/存储副作用,可安全运行于 vm 沙箱与 CLI。 */
(function (root, factory) {
  const D = factory();
  if (typeof module === 'object' && module.exports) module.exports = D;
  else root.Domain = D;
})(typeof self !== 'undefined' ? self : globalThis, function () {
  const D = {};

  /* ================= 风格常量(自 projects.js 下沉,单一来源) ================= */
  D.STYLE_LIB = [
    { name: '漫剧', kw: '日系唯美,线条流畅,色彩明快', hue: 320 },
    { name: '动漫', kw: '2D 平涂,高分镜感', hue: 200 },
    { name: '写实', kw: '照片级真实,自然光', hue: 30 },
    { name: '经典古装', kw: '宫廷华服,工笔质感', hue: 0 },
    { name: '现代短剧', kw: '都市实景,网剧布光', hue: 210 },
    { name: '院线电影风', kw: '电影级光影,胶片颗粒', hue: 40 },
    { name: '黑泽明', kw: '黑白对比,磅礴构图', hue: 240 },
    { name: '诺兰', kw: '冷调宏大,写实硬核', hue: 220 },
    { name: '王家卫', kw: '暧昧霓虹,抽帧质感', hue: 280 },
    { name: '韦斯·安德森', kw: '对称构图,马卡龙色', hue: 45 },
    { name: '邵氏武侠', kw: '复古胶片,武侠片厂', hue: 15 },
    { name: '银翼杀手', kw: '赛博废墟,蓝橙霓虹', hue: 190 },
    { name: '欧美竖屏剧', kw: '竖屏网剧质感,Lifetime频道感,自然光', hue: 20 },
    { name: '韩剧风尚', kw: '清新唯美,柔光,韩剧色调', hue: 350 },
    { name: '东南亚热剧', kw: '高饱和,热烈明快,热带光影', hue: 160 },
    { name: '暗黑狼人', kw: '暗黑哥特,月光冷调,神秘氛围', hue: 260 },
  ];
  D.TONE_PRESETS = ['无', '电影级逆光', '怀旧香港', '悬疑电影', '纪实主义', '赛博朋克', '青橙电影感'];
  /* 画风+影调合成风格串(在库画风追加关键词包;老项目自定义风格不在库时 kw 为空,行为不变) */
  D.styleOf = p => {
    p = p || {};
    const base = (p.style || '漫剧') + (p.tone && p.tone !== '无' ? '·' + p.tone : '');
    const it = D.STYLE_LIB.find(x => x.name === p.style);
    return it ? base + ',' + it.kw : base;
  };
  /* 反向提示词后缀(负面约束) */
  D.negOf = p => (p && p.negPrompt) ? '。负面约束:' + p.negPrompt : '';

  /* ================= 主体解析(自 store.js 下沉,含多形态与曾用名/别名兜底) ================= */
  /* 按名称查找项目主体,支持多形态全称"角色名-形态名";命中返回 {s, form},否则 null。
   * 曾用名兜底:主体改名/提取别名入 formerNames 后,镜头里的旧名引用仍能解析到主体。 */
  D.findSubject = function (p, name) {
    const subs = (p && p.subjects) || [];
    const s = subs.find(x => x.name === name);
    if (s) return { s, form: null };
    for (const x of subs) {
      const f = (x.forms || []).find(f => (x.name + '-' + f.name) === name);
      if (f) return { s: x, form: f };
    }
    for (const x of subs) {
      if (!(x.formerNames || []).includes(name)) continue;
      return { s: x, form: null };
    }
    for (const x of subs) {
      if (!(x.formerNames || []).length) continue;
      const hit = name.startsWith(x.name + '-') ? name.slice(x.name.length + 1) : null;
      const oldHead = (x.formerNames || []).find(fn2 => name.startsWith(fn2 + '-'));
      const formName = hit || (oldHead ? name.slice(oldHead.length + 1) : null);
      if (!formName) continue;
      const f = (x.forms || []).find(fm => fm.name === formName);
      if (f) return { s: x, form: f };
    }
    return null;
  };
  /* 该镜引用主体(含形态,按主体计)的 imgVer 最大值;无引用或未打点则为 0 */
  D.shotAssetVer = function (p, s) {
    let v = 0;
    const seen = new Set();
    const push = name => {
      const r = name && D.findSubject(p, name);
      if (r && !seen.has(r.s.id)) { seen.add(r.s.id); v = Math.max(v, r.s.imgVer || 0); }
    };
    (s.characters || []).forEach(push);
    push(s.scene);
    (s.props || []).forEach(push);
    return v;
  };

  /* ================= canonical 视频生成请求(自 sb-gen.js 下沉,单一构造点) ================= */
  D.STRATEGIES = [
    { id: 'fusion', name: '多图融合', desc: '关联素材直接空间融合渲染', step: '素材融合渲染中' },
    { id: 'frames', name: '首尾帧', desc: '控制起始与结束画面,插值生成', step: '首帧→尾帧→插值' },
    { id: 'ref', name: '分镜参考', desc: '先生成分镜图确认构图再转视频', step: '参考图构图渲染中' },
  ];
  /* 单镜时长自动预估:台词/旁白按约 4.5 字/秒 + 提示词动作密度,3-15s 钳制 */
  D.estShotDuration = function (s, promptOverride) {
    const speak = String(((s.dialogue || '') + (s.narration || ''))).replace(/\s/g, '').length;
    const action = String(promptOverride !== undefined ? promptOverride : (s.prompt || s.plot || '')).replace(/\s/g, '').length;
    return Math.max(3, Math.min(15, Math.round(2 + speak / 4.5 + action / 60)));
  };
  /* 中文机位描述(与 camera.js CAM.describe 同一实现,单一来源) */
  D.cameraDescribe = function (cs) {
    if (!cs) return '';
    const parts = [];
    if (cs.view) parts.push(cs.view + '视角');
    if (cs.angle) parts.push(cs.angle);
    if (cs.shotSize) parts.push(cs.shotSize);
    return parts.join('·');
  };
  /* 主体参考(打标):收集本镜出场主体中已有真实主体图的,随参考图传模型并生成主体定义后缀 */
  D.shotRefImages = function (p, s) {
    const seen = new Set();
    const subs = [];
    const push = name => {
      const r = name && D.findSubject(p, name);
      if (!r) return;
      const img = (r.form && r.form.image) || r.s.imgRef || r.s.image;
      const fullName = r.form ? r.s.name + '-' + r.form.name : r.s.name;
      const key = r.s.id + (r.form ? '|' + r.form.id : '');
      if (img && !String(img).startsWith('data:') && !seen.has(key)) { seen.add(key); subs.push({ name: fullName, image: img }); }
    };
    (s.characters || []).forEach(push);
    push(s.scene);
    (s.props || []).forEach(push);
    const refImages = subs.slice(0, 5).map(rs => ({ name: rs.name, url: rs.image }));
    const suffix = refImages.length
      ? `主体定义:${refImages.map((rs, i) => `将图片${i + 1}定义为「${rs.name}」`).join(',')};视频中这些主体的形象、服饰、发型须与对应参考图严格保持一致,同一主体全程不漂移,不出现重复人物或分身。`
      : '';
    let refAudio = null;
    for (const c of (s.characters || [])) {
      const r = D.findSubject(p, c);
      if (r && r.s.refAudio && r.s.refAudio.url && !String(r.s.refAudio.url).startsWith('data:')) { refAudio = r.s.refAudio.url; break; }
    }
    return { refImages, suffix, refAudio };
  };
  /* 轴线规则系统默认:固定注入生成提示词;分镜数据上的 axisRule(AI 拆镜管线产出)优先 */
  D.axisNoteOf = s => `;镜头遵循180度轴线规则,机位位于动作轴线同侧,不越轴${s.axisRule ? ',' + s.axisRule : ''}`;
  /* 美术风格后缀:默认取项目风格+影调,可按集自定义;注入本集每个分镜的生成提示词(已含不重复) */
  D.artSuffixOf = function (p, ep) {
    if (ep && ep.styleSuffix !== undefined && ep.styleSuffix !== null && String(ep.styleSuffix).trim() !== '') return String(ep.styleSuffix).trim();
    const parts = [D.styleOf(p)];
    if (p && p.globalSetting) parts.push(p.globalSetting);
    return parts.join(',');
  };
  D.artSuffixApp = function (p, ep, base) {
    const suf = D.artSuffixOf(p, ep);
    if (!suf) return '';
    return (base || '').includes(suf) ? '' : ',' + suf;
  };
  /* canonical 视频生成请求:真实生成请求与输入指纹的唯一构造点。
   * prompt = 主体定义前置 + 剧情提示词 + 轴线规则 + 运镜 + 机位 + 美术风格后缀 + 负面约束;
   * 参考图按生成策略映射:ref→s.image(缺则首帧)、frames→s.firstFrame/s.lastFrame、fusion→主体参考图组。
   * opts.promptOverride:批量/镜头组场景的前缀注入(与实际发送口径一致) */
  D.buildVideoRequest = function (p, ep, s, opts) {
    opts = opts || {};
    const realRef = v => (v && !String(v).startsWith('data:')) ? v : undefined; // 仅真实图片(服务端路径/远程 url)喂模型
    const strategy = D.STRATEGIES.find(st => st.id === (s.genStrategy || 'ref')) || D.STRATEGIES[0];
    const { refImages, suffix, refAudio } = D.shotRefImages(p, s);
    let image;
    if (strategy.id === 'frames') image = realRef(s.firstFrame);
    else if (strategy.id === 'fusion') image = undefined;
    else image = realRef(s.image) || realRef(s.firstFrame);
    const base = opts.promptOverride !== undefined ? opts.promptOverride : (s.prompt || s.plot);
    const camNote = s.camera ? `;运镜:${s.camera}` : '';
    const specNote = s.cameraSpec ? `,机位:${D.cameraDescribe(s.cameraSpec)}${s.cameraSpec.aperture ? ' ' + s.cameraSpec.aperture : ''}` : '';
    return {
      prompt: suffix + base + D.axisNoteOf(s) + camNote + specNote + D.artSuffixApp(p, ep, base) + D.negOf(p),
      ratio: (ep && ep.sbConfig && ep.sbConfig.ratio) || '16:9',
      duration: D.estShotDuration(s),
      model: s.videoModel || (ep && ep.sbConfig && ep.sbConfig.batchVideoModel) || '',
      image,
      lastFrame: strategy.id === 'frames' ? realRef(s.lastFrame) : undefined,
      refImages, refAudio,
      strategy: strategy.id,
    };
  };

  /* ================= 指纹与就绪/判旧(自 store.js 下沉) ================= */
  /* 生成输入全量签名(v3):序列化 canonical 生成请求(与真实发送同一构造点) */
  D.buildGenerationSignature = function (p, s) {
    const ep = ((p && p.episodes) || []).find(e => (e.shots || []).some(x => x.id === s.id));
    try {
      const q = D.buildVideoRequest(p, ep, s);
      return JSON.stringify([q.prompt, q.ratio, q.duration, q.model, q.image || '', q.lastFrame || '',
        (q.refImages || []).map(r => r.name + ':' + r.url).join(';'), q.refAudio || '', D.shotAssetVer(p, s)]);
    } catch (_) { /* 数据残缺时回退内联推导(字段口径与 buildVideoRequest 一致) */ }
    const realRef = v => { const t = String(v || ''); return (t.startsWith('/') || t.startsWith('http')) ? t : ''; };
    const names = [].concat(s.characters || [], s.scene ? [s.scene] : [], s.props || []);
    const refParts = names.map(name => {
      const r = name && D.findSubject(p, name);
      if (!r) return '';
      const img = realRef((r.form && r.form.image) || r.s.imgRef || r.s.image);
      return r.s.id + (r.form ? '|' + r.form.id : '') + ':' + img;
    }).filter(Boolean);
    let refAudio = '';
    for (const c of (s.characters || [])) {
      const r = c && D.findSubject(p, c);
      const au = r && r.s.refAudio && realRef(r.s.refAudio.url);
      if (au) { refAudio = au; break; }
    }
    const sb = (ep && ep.sbConfig) || {};
    const art = ep
      ? (String(ep.styleSuffix == null ? '' : ep.styleSuffix).trim()
        || [D.styleOf(p), (p && p.globalSetting) || ''].filter(Boolean).join(','))
      : '';
    return [
      s.prompt || s.plot || '',
      s.dialogue || '',
      s.narration || '',
      s.axisRule || '',
      art,
      sb.ratio || '16:9',
      s.videoModel || sb.batchVideoModel || '',
      s.genStrategy || 'ref',
      realRef(s.firstFrame),
      s.genStrategy === 'frames' ? realRef(s.lastFrame) : '',
      refParts.join(';'),
      refAudio,
      D.shotAssetVer(p, s),
    ].join('‖');
  };
  /* 镜头生成输入指纹(v3):buildGenerationSignature 的散列;存于 s.video.inputHash,输入变化即判过期 */
  D.shotInputHash = function (p, s) {
    const sig = D.buildGenerationSignature(p, s);
    let h = 5381;
    for (let i = 0; i < sig.length; i++) h = ((h << 5) + h + sig.charCodeAt(i)) >>> 0;
    return 'v3:' + h.toString(36);
  };
  /* v1 指纹(旧算法,仅用于存量迁移比对) */
  D.shotInputHashV1 = function (p, s) {
    const sig = [s.prompt || '', s.dialogue || '', s.narration || '', D.shotAssetVer(p, s)].join('‖');
    let h = 5381;
    for (let i = 0; i < sig.length; i++) h = ((h << 5) + h + sig.charCodeAt(i)) >>> 0;
    return h.toString(36);
  };
  /* 视频就绪(真实):done 且非"离线模拟冒充"——simulated 产物仅离线(online=false)时才算就绪 */
  D.shotVideoReady = function (s, online) {
    if (!s.video || s.video.status !== 'done') return false;
    if (s.video.simulated && online) return false;
    return true;
  };
  /* 视频已生成,但生成后 引用素材更新过 或 提示词/台词等输入变化 → 建议重生成 */
  D.shotVideoStale = function (p, s, online) {
    if (!s.video || s.video.status !== 'done') return false;
    if (D.shotAssetVer(p, s) > (s.video.assetVer || 0)) return true;
    return !!(s.video.inputHash && s.video.inputHash !== D.shotInputHash(p, s));
  };
  /* 分镜表是否拆自当前剧本与事件图谱(shotsSourceRev/shotsGraphRev 在拆镜发布时记录;无记录的旧数据视为当前) */
  D.shotsStale = function (ep) {
    if (!ep || !ep.shots || !ep.shots.length) return false;
    if (ep.shotsSourceRev !== undefined && ep.shotsSourceRev !== (ep.contentRev || 0)) return true;
    if (ep.shotsGraphRev !== undefined && ep.shotsGraphRev !== (ep.graphRev || 0)) return true;
    return false;
  };
  /* 本集理解是否对应当前剧本 */
  D.understandingStale = function (ep) {
    if (!ep || !ep.understanding) return false;
    if (ep.understanding.sourceRev === undefined) return (ep.contentRev || 0) > 0;
    return ep.understanding.sourceRev !== (ep.contentRev || 0);
  };
  /* 整集审片是否基于当前剧本与图谱 */
  D.reviewStaleByScript = function (ep) {
    if (!ep || !ep.lastReview) return false;
    if (ep.lastReview.sourceRev !== undefined && ep.lastReview.sourceRev !== (ep.contentRev || 0)) return true;
    if (ep.lastReview.graphRev !== undefined && ep.lastReview.graphRev !== (ep.graphRev || 0)) return true;
    return false;
  };
  /* 成片是否基于当前剧本与图谱(合成时记录 composedSourceRev/composedGraphRev) */
  D.composedStaleByScript = function (ep) {
    if (!ep) return false;
    if (ep.composedSourceRev !== undefined && ep.composedSourceRev !== (ep.contentRev || 0)) return true;
    if (ep.composedGraphRev !== undefined && ep.composedGraphRev !== (ep.graphRev || 0)) return true;
    return false;
  };
  /* canonical 合成快照:时间线编辑器的顺序/裁剪/剔除规则的唯一权威实现——
   * 真实合成 items 与 composedInputHash 共用同一份序列(tlOrder 定序、tlTrims[id].off 剔除、start/end 落 _tlStart/_tlEnd) */
  D.composeSeqOf = function (ep, online) {
    const shots = (ep && ep.shots) || [];
    const usable = shots.filter(s => (D.shotVideoReady(s, online) && s.video.url) || s.image);
    const trims = (ep && ep.tlTrims) || {};
    const order = (Array.isArray(ep && ep.tlOrder) ? ep.tlOrder : []).filter(id => usable.some(s => s.id === id));
    usable.forEach(s => { if (!order.includes(s.id)) order.push(s.id); });
    return order
      .map(id => usable.find(s => s.id === id))
      .filter(s => s && !(trims[s.id] && trims[s.id].off))
      .map(s => {
        const tr = trims[s.id] || {};
        const c = Object.assign({}, s);
        if (typeof tr.start === 'number' && tr.start > 0) c._tlStart = tr.start;
        if (typeof tr.end === 'number') c._tlEnd = tr.end;
        return c;
      });
  };
  /* 成片合成输入指纹:与合成 items 完全同源(顺序/素材版本/输入指纹/裁剪/转场/配音 + 字幕/画幅/来源轨) */
  D.composedInputHash = function (ep, online) {
    if (!ep) return '';
    let sig;
    if (ep.composedVia === 'beats') {
      sig = (ep.beats || []).map(b => [b.id, (b.video && b.video.url) || '', (b.video && b.video.inputHash) || ''].join('|')).join('‖');
    } else {
      sig = D.composeSeqOf(ep, online).map(s => [
        s.id,
        (D.shotVideoReady(s, online) && s.video.url) || s.image || '',
        (s.video && s.video.inputHash) || '',
        typeof s._tlStart === 'number' ? s._tlStart : '',
        typeof s._tlEnd === 'number' ? s._tlEnd : '',
        s.transition || '',
        s.audioUrl || '',
      ].join('|')).join('‖');
    }
    const full = [sig, (ep.sbConfig && ep.sbConfig.subtitle) ? 1 : 0, (ep.sbConfig && ep.sbConfig.ratio) || '16:9', ep.composedVia || ''].join('¶');
    let h = 5381;
    for (let i = 0; i < full.length; i++) h = ((h << 5) + h + full.charCodeAt(i)) >>> 0;
    return 'c:' + h.toString(36);
  };
  /* 成片就绪(真实):composed 且非离线模拟 且 合成输入未变化 且 剧本/图谱版本仍为合成时版本。
   * 剧本/图谱维度(原独立 composedStaleByScript)并入:技术上存在成片文件 ≠ 业务上仍是最新成片;
   * 无指纹/无 rev 记录的旧数据:无指纹判未就绪(无法证明输入未变),无 rev 记录保持原语义(迁移兼容)。 */
  D.epComposedReady = function (ep, online) {
    if (!ep || !ep.composed) return false;
    if (ep.composedSimulated) return !online;
    if (!ep.composedInputHash) return false;
    if (ep.composedInputHash !== D.composedInputHash(ep, online)) return false;
    if (D.composedStaleByScript(ep)) return false;
    return true;
  };
  /* 节拍板出片就绪(真实):与 shotVideoReady 同语义的节拍段版本 */
  D.beatVideoReady = function (b, online) {
    if (!b || !b.video || b.video.status !== 'done') return false;
    if (b.video.simulated && online) return false;
    return true;
  };

  /* ================= 工作流状态(唯一解释:流程条/下一步/Agent/跑批/CLI 同读) =================
   * 状态词:blocked(有阻塞项)/ ready(可立即推进)/ running(在飞)/
   *          needs_review(待确认/审片)/ needs_human(待人工)/ stale(产物过期)/ done。
   * 主线七步:剧本→主体→分集→分镜→生成→成片;制片/导演/剧壳/切片为支线(side),不阻塞主线。 */

  /* 分集级业务状态:counts + status + blockers + 推荐动作 */
  D.episodeState = function (p, ep, online) {
    const shots = (ep && ep.shots) || [];
    const counts = { total: shots.length, done: 0, generating: 0, failed: 0, noVideo: 0, stale: 0, unconfirmed: 0, final: 0 };
    shots.forEach(s => {
      if (s.final) counts.final++;
      if (!s.confirm) counts.unconfirmed++;
      const st = s.video && s.video.status;
      if (st === 'done') {
        if (D.shotVideoReady(s, online)) counts.done++; else counts.noVideo++; // 离线模拟在线时不计已出片
        if (D.shotVideoStale(p, s, online)) counts.stale++;
      } else if (st === 'generating') counts.generating++;
      else if (st === 'failed') counts.failed++;
      else counts.noVideo++;
    });
    const blockers = [];
    const bl = (code, label) => blockers.push({ code, label });
    if (!ep) return { status: 'blocked', counts, blockers: [{ code: 'no-episode', label: '分集不存在' }], action: null };
    if (!(ep.content || '').trim()) bl('no-script', '缺剧本正文');
    if (counts.total === 0) bl('no-shots', '未生成分镜');
    const shotsStale = D.shotsStale(ep);
    if (shotsStale) bl('shots-stale', '分镜表基于旧剧本/图谱');
    if (counts.failed) bl('failed-shots', counts.failed + ' 镜生成失败');
    if (counts.stale) bl('stale-shots', counts.stale + ' 镜素材已更新');
    if (counts.unconfirmed && counts.done === counts.total && counts.total > 0) bl('unconfirmed', counts.unconfirmed + ' 镜待确认');
    const reviewAvg = ep.lastReview && typeof ep.lastReview.avg === 'number' ? ep.lastReview.avg : null;
    const composedReady = D.epComposedReady(ep, online);
    if (ep.composed && !composedReady) bl('composed-stale', '成片已过期(输入或剧本已变化)');

    let status, action = null;
    if (blockers.some(b => b.code === 'no-script')) { status = 'blocked'; action = { key: 'script', label: '编写剧本' }; }
    else if (counts.total === 0) { status = 'ready'; action = { key: 'shots', label: '生成分镜' }; }
    else if (shotsStale) { status = 'stale'; action = { key: 'reshoot', label: '重新拆镜' }; }
    else if (counts.generating > 0) { status = 'running'; action = null; }
    else if (counts.failed > 0) { status = 'blocked'; action = { key: 'fix-failed', label: '处理失败镜' }; }
    else if (counts.done < counts.total) { status = 'ready'; action = { key: 'gen', label: '生成视频' }; }
    else if (counts.stale > 0) { status = 'stale'; action = { key: 'regen-stale', label: '重生成过期镜' }; }
    else if (counts.unconfirmed > 0) { status = 'needs_review'; action = { key: 'confirm', label: '确认镜头' }; }
    else if (reviewAvg !== null && reviewAvg < 7) { status = 'needs_human'; action = { key: 'review', label: '审片修订' }; }
    else if (!composedReady) {
      status = ep.composed ? 'stale' : 'ready';
      action = { key: 'compose', label: ep.composed ? '重新合成' : '合成成片' };
    } else status = 'done';
    return { status, counts, blockers, action, reviewAvg, composedReady, shotsStale };
  };

  /* 项目级工作流:主线步骤(含支线标记),逐步 status/done/doing/blockers/recommendedAction */
  D.workflow = function (p, online) {
    const eps = (p && p.episodes) || [];
    const subjects = (p && p.subjects) || [];
    const epStates = eps.map(ep => D.episodeState(p, ep, online));
    const totalShots = epStates.reduce((n, st) => n + st.counts.total, 0);
    const vDone = epStates.reduce((n, st) => n + st.counts.done, 0);
    const staleShots = epStates.reduce((n, st) => n + st.counts.stale, 0);
    const anyShotsStale = epStates.some(st => st.shotsStale);
    const composedCnt = epStates.filter(st => st.composedReady).length;
    const noImg = subjects.filter(s => !s.image).length;
    const sh = (p && p.shell) || {};
    const step = (key, name, done, doing, blockers, action, side) => ({
      key, name, done: !!done, doing: !!doing, side: !!side,
      status: done ? 'done' : doing ? 'running' : 'ready',
      blockers: blockers || [], action: action || null,
    });
    const steps = [
      step('prod', '制片', !!(sh.selling || sh.owner || sh.startDate), false, null, null, true),
      step('script', '剧本', !!(p && (p.script || p.extractDone)), false,
        !(p && (p.script || p.extractDone)) ? [{ code: 'no-script', label: '未上传剧本' }] : [],
        { key: 'script', label: '上传剧本', hash: '#/project/' + p.id }),
      step('director', '导演', !!(p && p.concept && p.concept.statement), false, null, null, true),
      step('subjects', '主体', subjects.length > 0 && noImg === 0, subjects.length > 0 && noImg > 0,
        !subjects.length ? [{ code: 'no-subjects', label: '未提取主体' }] : noImg ? [{ code: 'subjects-no-image', label: noImg + ' 个主体缺权威图' }] : [],
        { key: 'subjects', label: noImg ? `主体提取与生成(${noImg} 角色缺图)` : '主体提取与生成', hash: '#/project/' + p.id + '/roles' }),
      step('eps', '分集', eps.length > 0, false,
        !eps.length ? [{ code: 'no-eps', label: '未建分集' }] : [],
        { key: 'eps', label: '新建分集', hash: '#/project/' + p.id }),
      step('shots', '分镜', eps.length > 0 && epStates.every(st => st.counts.total > 0) && !anyShotsStale, epStates.some(st => st.counts.total > 0),
        (() => {
          const noShot = epStates.find(st => st.counts.total === 0);
          if (noShot) return [{ code: 'no-shots', label: '有分集未分镜' }];
          if (anyShotsStale) return [{ code: 'shots-stale', label: '分镜表基于旧剧本/图谱' }];
          return [];
        })(),
        null),
      step('gen', '剪辑', totalShots > 0 && vDone === totalShots && staleShots === 0, vDone > 0,
        (() => {
          const b = [];
          const failed = epStates.reduce((n, st) => n + st.counts.failed, 0);
          if (failed) b.push({ code: 'failed-shots', label: failed + ' 镜生成失败' });
          if (staleShots) b.push({ code: 'stale-shots', label: staleShots + ' 镜素材已更新' });
          return b;
        })(),
        null),
      step('film', '成片', eps.length > 0 && composedCnt === eps.length, composedCnt > 0,
        (() => {
          const staleFilm = epStates.filter(st => st.status === 'stale' && st.counts.done === st.counts.total && st.counts.total > 0).length;
          return staleFilm ? [{ code: 'composed-stale', label: staleFilm + ' 集成片已过期' }] : [];
        })(),
        null),
      step('shell', '剧壳', !!(p && p.shell && p.shell.dist && (p.shell.dist.introLong || p.shell.dist.posterV || p.shell.dist.logline)), false, null, null, true),
      step('clips', '切片', eps.some(e => (e.clips || []).length > 0), false, null, null, true),
    ];
    /* 项目级推荐动作:主线首个未完成步骤(支线不参与阻塞) */
    let recommendedAction = null;
    const cur = steps.find(s => !s.side && !s.done);
    if (!cur) recommendedAction = { key: 'produce', label: '量产跑批 / 导出交付', hash: '#/project/' + p.id + '/produce' };
    else if (cur.action) recommendedAction = cur.action;
    else {
      /* 无静态动作的步骤(分镜/生成/成片):定位最需推进的分集 */
      const epOf = pred => { const i = epStates.findIndex(pred); return i >= 0 ? eps[i] : null; };
      if (cur.key === 'shots') {
        const ep = epOf(st => st.counts.total === 0) || epOf(st => st.shotsStale);
        if (ep) recommendedAction = { key: 'shots', label: (epStates[eps.indexOf(ep)].shotsStale ? '重新拆镜:' : '生成分镜:') + ep.title, hash: `#/project/${p.id}/episode/${ep.id}` };
      } else if (cur.key === 'gen') {
        const ep = epOf(st => st.counts.total > 0 && (st.counts.done < st.counts.total || st.counts.stale > 0 || st.counts.failed > 0));
        if (ep) recommendedAction = { key: 'gen', label: '继续生成:' + ep.title, hash: `#/project/${p.id}/episode/${ep.id}` };
      } else if (cur.key === 'film') {
        const ep = epOf(st => !st.composedReady);
        if (ep) recommendedAction = { key: 'compose', label: '合成成片:' + ep.title, hash: `#/project/${p.id}/episode/${ep.id}` };
      }
    }
    return { steps, epStates, recommendedAction };
  };

  return D;
});
