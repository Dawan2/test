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
  /* 主体解析结果 → 引用全称(多形态为"主体名-形态名") */
  D.subjectFullName = r => (r ? (r.form ? r.s.name + '-' + r.form.name : r.s.name) : '');
  /* 主体解析结果 → 可喂模型的真实参考图(形态图优先,其次主体权威图;data: 内联图不喂模型,视为无图) */
  D.subjectRefImage = function (r) {
    const img = r ? ((r.form && r.form.image) || r.s.imgRef || r.s.image) : '';
    return (img && !String(img).startsWith('data:')) ? img : '';
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
      const img = D.subjectRefImage(r);
      const key = r.s.id + (r.form ? '|' + r.form.id : '');
      if (img && !seen.has(key)) { seen.add(key); subs.push({ name: D.subjectFullName(r), image: img }); }
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
  /* ================= 镜头配音(TTS 渲染清单) =================
   * 配音的唯一解释:哪套音色配置生效、已渲染音轨用的是什么参数、能否混入成片。
   * 浏览器(storyboard/sb-gen/sb-batch)渲染后写回 s.audioMeta,合成侧(sb-io.js / cli.js)据此取音轨并落清单凭据;
   * 旧数据(s.audio 布尔 + s.audioUrl,参数只在 s.history 文案里)按已知事实读出,未知参数留空不臆造。 */
  D.VOICE_DEFAULT = { voice: '叙事氛围', rate: 1.0, volume: 5, pitch: 1.0, emotion: '平静' };
  /* 音色配置规范化(旧数据兼容:字符串音色名 → 结构化;越界数值钳到声音设置面板同区间) */
  D.normVoiceCfg = function (v) {
    const num = (x, lo, hi, dft) => { const n = +x; return Number.isFinite(n) && n >= lo && n <= hi ? n : dft; };
    const c = Object.assign({}, D.VOICE_DEFAULT, typeof v === 'string' ? { voice: v } : (v || null));
    return {
      voice: String(c.voice || D.VOICE_DEFAULT.voice),
      rate: num(c.rate, 0.5, 2, D.VOICE_DEFAULT.rate),
      volume: num(c.volume, 0, 10, D.VOICE_DEFAULT.volume),
      pitch: num(c.pitch, 0.5, 2, D.VOICE_DEFAULT.pitch),
      emotion: String(c.emotion || D.VOICE_DEFAULT.emotion),
    };
  };
  /* 该镜生效音色配置(优先级:镜头声音设置 → 项目旁白设置 → 镜头人物音色 → 本集旁白音色) */
  D.voiceCfgOf = function (p, ep, s) {
    return D.normVoiceCfg((s && s.voiceCfg) || (p && p.narration) || (s && s.voice) || (ep && ep.sbConfig && ep.sbConfig.narratorVoice) || null);
  };
  /* 配音文本(与送上游同一取值:旁白优先,其次台词,兜底剧情) */
  D.audioTextOf = function (s) {
    return String((s && s.narration) || (s && s.dialogue) || '').trim() || String((s && s.plot) || '').trim();
  };
  /* 配音参数签名:音色+语速+音量+语调+情感+配音文本(任一项变化 → 已渲染音轨判旧) */
  D.audioSig = function (cfg, text) {
    const c = D.normVoiceCfg(cfg);
    return [c.voice, c.rate, c.volume, c.pitch, c.emotion, String(text || '')].join('|');
  };
  D.audioSigOf = function (p, ep, s) {
    return D.audioSig(D.voiceCfgOf(p, ep, s), D.audioTextOf(s));
  };
  /* 渲染凭据构造(唯一写点口径):out 取渲染回执——真实 TTS 传 {url, duration, voiceId(上游音色 id)},
   * 离线占位传 {offline:true}(无音轨,不混入成片);未拿到的字段一律不写,不用缺省值冒充 */
  D.audioMetaWrite = function (cfg, text, out) {
    out = out || {};
    const c = D.normVoiceCfg(cfg);
    const m = {
      voice: c.voice,
      params: { rate: c.rate, volume: c.volume, pitch: c.pitch, emotion: c.emotion },
      sig: D.audioSig(c, text),
      offline: !!out.offline,
    };
    if (out.voiceId) m.voiceId = String(out.voiceId);
    if (out.url) m.url = String(out.url);
    if (+out.duration > 0) m.duration = +out.duration;
    if (out.time) m.time = String(out.time);
    return m;
  };
  /* 渲染凭据读取:结构化 audioMeta 优先;旧布尔数据补最小结构并标 legacy(参数未落库,凭据不全);
   * 从未配音返回 null */
  D.audioMetaOf = function (s) {
    if (!s || !(s.audio || s.audioUrl)) return null;
    if (s.audioMeta && typeof s.audioMeta === 'object') return s.audioMeta;
    return { legacy: true, voice: '', params: null, sig: '', offline: !s.audioUrl, url: s.audioUrl || '' };
  };
  /* 可混入成片的真实音轨地址(离线占位/无音轨不混音;旧数据有 URL 即真实音轨,行为不变) */
  D.audioTrackOf = function (s) {
    const m = D.audioMetaOf(s);
    return (m && m.url && !m.offline) ? String(m.url) : '';
  };
  /* 已渲染音轨与当前生效参数/文本不符 → 建议重配音;
   * 无 sig 记录的旧数据不判旧(参数当时未落库,无法证明失配,存量不一夜变红) */
  D.audioStale = function (p, ep, s) {
    const m = D.audioMetaOf(s);
    if (!m || !m.sig) return false;
    return m.sig !== D.audioSigOf(p, ep, s);
  };
  /* 配音渲染清单(成片可追溯凭据):逐镜列出渲染参数与去向,summary 供合成前提示与写回落库 */
  D.audioRenderList = function (p, ep, online) {
    const inFilm = new Set(D.composeSeqOf(ep, online).map(s => s.id));
    const rows = ((ep && ep.shots) || []).map(s => {
      const m = D.audioMetaOf(s);
      const track = D.audioTrackOf(s);
      return {
        shotId: s.id,
        order: (+s.order || 0) + 1,
        rendered: !!m,
        offline: !!(m && m.offline),
        legacy: !!(m && m.legacy),
        voice: (m && m.voice) || '',
        voiceId: (m && m.voiceId) || '',
        params: (m && m.params) || null,
        url: (m && m.url) || '',
        duration: (m && +m.duration > 0) ? +m.duration : null,
        cfgNow: D.voiceCfgOf(p, ep, s),
        stale: D.audioStale(p, ep, s),
        hasText: !!D.audioTextOf(s),
        inFilm: inFilm.has(s.id),
        mixed: !!track && inFilm.has(s.id),
      };
    });
    const n = f => rows.filter(f).length;
    return {
      rows,
      summary: {
        total: rows.length,
        rendered: n(r => r.rendered),
        mixed: n(r => r.mixed),
        offline: n(r => r.offline),
        legacy: n(r => r.legacy),
        stale: n(r => r.stale),
        missing: n(r => !r.rendered && r.hasText),
        noText: n(r => !r.hasText),
      },
    };
  };

  /* 分镜表是否拆自当前剧本与事件图谱(shotsSourceRev/shotsGraphRev 在拆镜发布时记录;无记录的旧数据视为当前) */
  D.shotsStale = function (ep) {
    if (!ep || !ep.shots || !ep.shots.length) return false;
    if (ep.shotsSourceRev !== undefined && ep.shotsSourceRev !== (ep.contentRev || 0)) return true;
    if (ep.shotsGraphRev !== undefined && ep.shotsGraphRev !== (ep.graphRev || 0)) return true;
    return false;
  };
  /* 本集理解是否对应当前剧本与事件图谱(理解 prompt 注入图谱;
   * graphRev 为后加字段,旧数据无此字段保持原语义,不一次性全量判旧) */
  D.understandingStale = function (ep) {
    if (!ep || !ep.understanding) return false;
    if (ep.understanding.graphRev !== undefined && ep.understanding.graphRev !== (ep.graphRev || 0)) return true;
    if (ep.understanding.sourceRev === undefined) return (ep.contentRev || 0) > 0;
    return ep.understanding.sourceRev !== (ep.contentRev || 0);
  };
  /* 整集审片快照哈希(与 wf-core.js reviewSnapshotHashOf 同字面:镜头 ID 集顺序 + 每镜视频指纹/地址)——
   * 新增/删除/调序/任一镜重生成后整集报告判旧;写侧唯一来源仍在 wf-core,本函数供判旧只读(双端可用) */
  D.reviewSnapshotHashOf = function (ep) {
    const sig = ((ep && ep.shots) || []).map(s => [s.id, (s.video && s.video.inputHash) || '', (s.video && s.video.url) || ''].join('|')).join('‖');
    let h = 5381;
    for (let i = 0; i < sig.length; i++) h = ((h << 5) + h + sig.charCodeAt(i)) >>> 0;
    return 'r:' + h.toString(36);
  };
  /* 整集审片是否基于当前剧本、图谱与镜头集快照(任一维度判旧 → 旧分不再驱动门禁/状态;
   * 迁移兼容:无 sourceRev/graphRev/snapshotHash 记录的旧数据保持原语义,不判旧) */
  D.reviewStaleByScript = function (ep) {
    if (!ep || !ep.lastReview) return false;
    if (ep.lastReview.sourceRev !== undefined && ep.lastReview.sourceRev !== (ep.contentRev || 0)) return true;
    if (ep.lastReview.graphRev !== undefined && ep.lastReview.graphRev !== (ep.graphRev || 0)) return true;
    if (ep.lastReview.snapshotHash !== undefined && ep.lastReview.snapshotHash !== D.reviewSnapshotHashOf(ep)) return true;
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
  /* 成片字幕文本签名:在列镜头(与 composeSeqOf 同序列)dialogue||narration + 分镜时长的拼接散列——
   * 烧录字幕与 SRT 取该文本(sb-io.js),时长影响 SRT 时间轴;合成写回时记录 ep.composedDialogueSig,
   * 合成后改台词/时长 → 成片判旧。迁移兼容:该字段存在才比对,旧数据无记录保持原语义 */
  D.composedDialogueSig = function (ep, online) {
    if (!ep) return '';
    const sig = D.composeSeqOf(ep, online).map(s => [s.id, s.dialogue || '', s.narration || '', s.duration || ''].join('|')).join('‖');
    let h = 5381;
    for (let i = 0; i < sig.length; i++) h = ((h << 5) + h + sig.charCodeAt(i)) >>> 0;
    return 'd:' + h.toString(36);
  };
  /* 成片时间轴单段时长(秒):视频段取时间线裁剪出入点差(无裁剪回落预估时长),图片段按 2-15s 钳制。
   * 真实合成 items(sb-io.js doCompose / cli.js composeItems)与字幕时间轴共用本口径,不各写一份。 */
  D.segDurationOf = function (s, hasVideo) {
    const est = D.estShotDuration(s);
    if (!hasVideo) return Math.max(2, Math.min(15, est));
    return (typeof s._tlStart === 'number' && typeof s._tlEnd === 'number') ? Math.max(0.5, s._tlEnd - s._tlStart) : est;
  };
  /* 烧录字幕单条硬上限(字):超出部分合成时被截断(SRT 软字幕仍保留全文) */
  D.SUB_BURN_MAX = 120;
  /* 成片字幕时间轴段:与真实合成 items 同源同序(composeSeqOf 在列镜头,文本取台词优先旁白),
   * 逐段带累计起止秒——SRT 产出与字幕质检(js/skills.js SK-28)共用本构造,不各切一份段 */
  D.subtitleSegs = function (ep, online) {
    let t = 0;
    return D.composeSeqOf(ep, online).map(s => {
      const dur = D.segDurationOf(s, !!(D.shotVideoReady(s, online) && s.video && s.video.url));
      const seg = { id: s.id, order: (+s.order || 0) + 1, text: String(s.dialogue || s.narration || '').trim(), dur, start: t, end: t + dur };
      t += dur;
      return seg;
    });
  };
  /* 成片就绪(真实):composed 且非离线模拟 且 合成输入未变化 且 剧本/图谱版本仍为合成时版本。
   * 剧本/图谱维度(原独立 composedStaleByScript)并入:技术上存在成片文件 ≠ 业务上仍是最新成片;
   * 无指纹/无 rev 记录的旧数据:无指纹判未就绪(无法证明输入未变),无 rev 记录保持原语义(迁移兼容)。 */
  D.epComposedReady = function (ep, online) {
    if (!ep || !ep.composed) return false;
    if (ep.composedSimulated) return !online;
    if (!ep.composedInputHash) return false;
    if (ep.composedInputHash !== D.composedInputHash(ep, online)) return false;
    if (ep.composedDialogueSig !== undefined && ep.composedDialogueSig !== D.composedDialogueSig(ep, online)) return false; // 字幕文本/时长在合成后变化(无记录的旧数据不比对)
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
   * 主线七步:剧本→主体→分集→分镜→剪辑→审片→成片;制片/导演/剧壳/切片为支线(side),不阻塞主线。 */

  /* 审片达标线:分集状态与主线审片步骤共用的唯一常量(发布门 G3 另有可配阈值 releaseMinReviewScore,
   * 那是交付前的更严门禁;本常量只管主线推导,双端同值不读 Store) */
  D.REVIEW_MIN = 7;

  /* 修订循环重抽面(审片修订闭环 SK-25 的编排入参,双端单源):
   * 从整集审片报告推导"下一轮该修订重抽哪几镜"——判据 = 最近一份报告里低于达标线 REVIEW_MIN 的镜,
   * 与当前分镜表取交集(报告写下之后被删掉的镜不出面),已定稿镜不出面(定稿不重抽,与可审镜口径一致)。
   * 报告判旧(reviewStaleByScript)一律回空:旧分不驱动重抽,与发布门 G3「视为未审」同口径。
   * order 取当前分镜表实位(1 起)而非报告里记的旧位,顺序按实位;编排层与展示层都读这一份,
   * 调用方不再各自攒一份会与分镜表漂移的名单。 */
  D.reviseTargets = function (ep) {
    if (!ep || !ep.lastReview || D.reviewStaleByScript(ep)) return [];
    const shots = ep.shots || [];
    return (ep.lastReview.perShot || [])
      .filter(x => x && typeof x.score === 'number' && x.score < D.REVIEW_MIN)
      .map(x => ({ x, i: shots.findIndex(s => s.id === x.shotId) }))
      .filter(t => t.i >= 0 && !shots[t.i].final)
      .sort((a, b) => a.i - b.i)
      .map(t => ({ shotId: t.x.shotId, order: t.i + 1, score: t.x.score, reportId: t.x.reportId || '' }));
  };
  /* 修订循环重抽子集参数:episode.generateVideos / episode.smartReview 的 shotIds 由本函数派生 */
  D.reviseShotIds = ep => D.reviseTargets(ep).map(t => t.shotId);

  /* 修订循环收敛次数(审片修订闭环 SK-25 的另一个编排入参,双端单源):
   * "复审不达标还能重来几次"的取值口径 —— 整数轮次,取值域 1..5,缺省 2。
   * 上限存在的理由是每一轮都真花钱(重生成 COST.video + 复审 COST.review),不设限即无限扣费;
   * 下限 1 是"至少给一次改正机会",0 轮等于关掉修订闭环,那由 smartReview 开关表达,不用次数表达。
   * 参数配置面板(1..5)与命令注册表 maxRetry 的登记区间同读这三个常量,不另写一份。 */
  D.REVISE_RETRY_MIN = 1;
  D.REVISE_RETRY_MAX = 5;
  D.REVISE_RETRY_DEFAULT = 2;
  /* 候选值按优先级依次传入(如 命令入参 → 分集 sbConfig),第一个能读成非零数的胜出,
   * 都读不出来(缺省/空串/null/非数字/0)时回 REVISE_RETRY_DEFAULT;越界向内钳,小数截整。 */
  D.reviseRetryLimit = function () {
    for (let i = 0; i < arguments.length; i++) {
      const n = +arguments[i];
      if (!Number.isFinite(n) || n === 0) continue;
      return Math.max(D.REVISE_RETRY_MIN, Math.min(D.REVISE_RETRY_MAX, Math.floor(n)));
    }
    return D.REVISE_RETRY_DEFAULT;
  };
  /* 可选轮次(参数配置面板的次数选项由此派生,不在 UI 侧另写一遍区间) */
  D.reviseRetryOptions = function () {
    const out = [];
    for (let n = D.REVISE_RETRY_MIN; n <= D.REVISE_RETRY_MAX; n++) out.push(n);
    return out;
  };

  /* 分集级阻塞码登记表:episodeState 只按本表出码,不写第二处字面(项目级 workflow 里同名的聚合档同读本表)。
   * 表兼枚举面——分集阻塞码有两个按码分工的消费方(问题中心逐集循环里的条目分支、流程模板 flow-tpl 的断点登记),
   * 两处都是"表外的码一律不投"而且不投是静默的:新增一档时谁没跟上,那一态就在问题清单/断点说明上凭空消失,
   * 夹具摊不摊得到都看不出来。故 D.epBlockerCodes() 把码全集报出来,由契约用例逐码点名各消费方的实际投影。 */
  const EPB = {
    noEpisode: 'no-episode', script: 'no-script', shots: 'no-shots', shotsStale: 'shots-stale',
    failed: 'failed-shots', stale: 'stale-shots', unconfirmed: 'unconfirmed', composedStale: 'composed-stale',
  };
  D.epBlockerCodes = () => Object.keys(EPB).map(k => EPB[k]);

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
    if (!ep) return { status: 'blocked', counts, blockers: [{ code: EPB.noEpisode, label: '分集不存在' }], action: null };
    const hasScript = !!(ep.content || '').trim();
    if (!hasScript) bl(EPB.script, '缺剧本正文');
    if (counts.total === 0) bl(EPB.shots, '未生成分镜');
    const shotsStale = D.shotsStale(ep);
    if (shotsStale) bl(EPB.shotsStale, '分镜表基于旧剧本/图谱');
    if (counts.failed) bl(EPB.failed, counts.failed + ' 镜生成失败');
    if (counts.stale) bl(EPB.stale, counts.stale + ' 镜素材已更新');
    if (counts.unconfirmed && counts.done === counts.total && counts.total > 0) bl(EPB.unconfirmed, counts.unconfirmed + ' 镜待确认');
    const reviewStale = D.reviewStaleByScript(ep); // 剧本/图谱修订或镜头重抽后旧审片记录判旧
    const reviewAvg = !reviewStale && ep.lastReview && typeof ep.lastReview.avg === 'number' ? ep.lastReview.avg : null; // 判旧的旧分不再卡 needs_human(旧版语义由展示层承接)
    /* 分集级审片门槛(单源:凡是"这一集该不该去审"的判断都读这一份,消费方不各设一道门)。
     * 先判这一集当下能不能审:缺正文 / 未拆镜 / 分镜判旧时整集审片无从谈起——哪怕手上还留着一份报告,
     * 那份审的也不是当前分镜表,主线断点落在上游那几步,审片这一步不对它出结论(档位记 unready)。
     * 门槛与本函数 status 的可达性同一条:needs_human 只在这三关都过了之后才可能命中。
     * 过了门槛按既有三态归码,码字面就是 review 步阻塞码与问题中心 kind,达标回 'pass'。 */
    const reviewGate = !hasScript || counts.total === 0 || shotsStale ? 'unready'
      : reviewStale ? 'review-stale'
        : reviewAvg === null ? 'no-review'
          : reviewAvg < D.REVIEW_MIN ? 'low-review' : 'pass';
    const composedReady = D.epComposedReady(ep, online);
    if (ep.composed && !composedReady) bl(EPB.composedStale, '成片已过期(输入或剧本已变化)');

    let status, action = null;
    if (blockers.some(b => b.code === EPB.script)) { status = 'blocked'; action = { key: 'script', label: '编写剧本' }; }
    else if (counts.total === 0) { status = 'ready'; action = { key: 'shots', label: '生成分镜' }; }
    else if (shotsStale) { status = 'stale'; action = { key: 'reshoot', label: '重新拆镜' }; }
    else if (counts.generating > 0) { status = 'running'; action = null; }
    else if (counts.failed > 0) { status = 'blocked'; action = { key: 'fix-failed', label: '处理失败镜' }; }
    else if (counts.done < counts.total) { status = 'ready'; action = { key: 'gen', label: '生成视频' }; }
    else if (counts.stale > 0) { status = 'stale'; action = { key: 'regen-stale', label: '重生成过期镜' }; }
    else if (counts.unconfirmed > 0) { status = 'needs_review'; action = { key: 'confirm', label: '确认镜头' }; }
    else if (reviewAvg !== null && reviewAvg < D.REVIEW_MIN) { status = 'needs_human'; action = { key: 'review', label: '审片修订' }; }
    else if (!composedReady) {
      status = ep.composed ? 'stale' : 'ready';
      action = { key: 'compose', label: ep.composed ? '重新合成' : '合成成片' };
    } else status = 'done';
    return { status, counts, blockers, action, reviewAvg, reviewStale, reviewGate, composedReady, shotsStale };
  };

  /* 项目整本原文(下游命令读入的那一份文本,没有即空串):拆集按它切分,提取主体先读它再回退各集正文。
   * 与门槛派生的「剧本这一步走过没有」不是同一问:gateBlockers 认 extractDone 也算走过
   * (提取过主体的老项目流程条上剧本步画 ✓),但那类项目里整本原文并不在库——
   * 「这一步走过了」是进度,「原文读不读得到」是输入,消费方按自己要的那一问取,两问不许互相冒充。 */
  D.projectScript = p => String((p && p.script) || '').trim();

  /* 前置门槛的阻塞码登记表:gateBlockers 只按本表出码,不写第二处字面。
   * 表兼枚举面——门槛派生有三个消费方(流程条 workflow 按 step 取,问题中心 Issues.gates() 与
   * 计划层 TODO_OF 按码取),三处都是"表外的码一律不投"而且不投是静默的,新增一档时谁没跟上
   * 没有夹具摊得到;故 D.gateCodes() 把码全集报出来,由契约用例逐码点名各消费方的实际投影。 */
  const GATE = { script: 'no-script', subjects: 'no-subjects', noImage: 'subjects-no-image', eps: 'no-eps' };
  D.gateCodes = () => Object.keys(GATE).map(k => GATE[k]);

  /* 项目级前置门槛断点(剧本/主体/分集三步的阻塞项,双端单源):
   * 这三步的判定输入全是项目对象本身(整本剧本 / 主体库 / 分集表),与逐集推导无关——
   * 故单独收成一函数,workflow 的这三步与问题中心同读本份,码名与文案不在两处各写一遍。
   * 逐项 { step, code, label, count?(计数类阻塞的条目数) };空项目/只有剧本/只有主体三态正由本函数出结论。 */
  D.gateBlockers = function (p) {
    const eps = (p && p.episodes) || [];
    const subjects = (p && p.subjects) || [];
    const noImg = subjects.filter(s => !s.image).length;
    const out = [];
    if (!(p && (p.script || p.extractDone))) out.push({ step: 'script', code: GATE.script, label: '未上传剧本' });
    if (!subjects.length) out.push({ step: 'subjects', code: GATE.subjects, label: '未提取主体' });
    else if (noImg) out.push({ step: 'subjects', code: GATE.noImage, label: noImg + ' 个主体缺权威图', count: noImg });
    if (!eps.length) out.push({ step: 'eps', code: GATE.eps, label: '未建分集' });
    return out;
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
    /* 审片分类(逐集只数 episodeState 已归好的 reviewGate:判旧、达标线与"这一集能不能审"都在那里判过一遍,
     * 此处不另写判据——尚不可审的集(缺正文/未拆镜/分镜判旧)不计进任何一档,断点由上游那几步各自报) */
    const rvOf = code => epStates.filter(st => st.reviewGate === code).length;
    const rvPass = rvOf('pass');
    const rvLow = rvOf('low-review');
    const rvStale = rvOf('review-stale');
    const rvNone = rvOf('no-review');
    const noImg = subjects.filter(s => !s.image).length;
    const gates = D.gateBlockers(p); // 前置三步(剧本/主体/分集)的阻塞项与问题中心同读一份
    const gateOf = k => gates.filter(g => g.step === k).map(g => ({ code: g.code, label: g.label }));
    const sh = (p && p.shell) || {};
    const step = (key, name, done, doing, blockers, action, side) => ({
      key, name, done: !!done, doing: !!doing, side: !!side,
      status: done ? 'done' : doing ? 'running' : 'ready',
      blockers: blockers || [], action: action || null,
    });
    const steps = [
      step('prod', '制片', !!(sh.selling || sh.owner || sh.startDate), false, null, null, true),
      step('script', '剧本', !!(p && (p.script || p.extractDone)), false,
        gateOf('script'),
        { key: 'script', label: '上传剧本', hash: '#/project/' + p.id }),
      step('director', '导演', !!(p && p.concept && p.concept.statement), false, null, null, true),
      step('subjects', '主体', subjects.length > 0 && noImg === 0, subjects.length > 0 && noImg > 0,
        gateOf('subjects'),
        { key: 'subjects', label: noImg ? `主体提取与生成(${noImg} 角色缺图)` : '主体提取与生成', hash: '#/project/' + p.id + '/roles' }),
      step('eps', '分集', eps.length > 0, false,
        gateOf('eps'),
        { key: 'eps', label: '新建分集', hash: '#/project/' + p.id }),
      step('shots', '分镜', eps.length > 0 && epStates.every(st => st.counts.total > 0) && !anyShotsStale, epStates.some(st => st.counts.total > 0),
        (() => {
          const noShot = epStates.find(st => st.counts.total === 0);
          if (noShot) return [{ code: EPB.shots, label: '有分集未分镜' }];
          if (anyShotsStale) return [{ code: EPB.shotsStale, label: '分镜表基于旧剧本/图谱' }];
          return [];
        })(),
        null),
      step('gen', '剪辑', totalShots > 0 && vDone === totalShots && staleShots === 0, vDone > 0,
        (() => {
          const b = [];
          const failed = epStates.reduce((n, st) => n + st.counts.failed, 0);
          if (failed) b.push({ code: EPB.failed, label: failed + ' 镜生成失败' });
          if (staleShots) b.push({ code: EPB.stale, label: staleShots + ' 镜素材已更新' });
          return b;
        })(),
        null),
      step('review', '审片', eps.length > 0 && rvPass === eps.length, rvPass > 0 || rvLow > 0,
        (() => {
          const b = [];
          if (rvNone) b.push({ code: 'no-review', label: rvNone + ' 集未审片' });
          if (rvStale) b.push({ code: 'review-stale', label: rvStale + ' 集审片记录已过期' });
          if (rvLow) b.push({ code: 'low-review', label: rvLow + ' 集审片均分低于 ' + D.REVIEW_MIN });
          return b;
        })(),
        null),
      step('film', '成片', eps.length > 0 && composedCnt === eps.length, composedCnt > 0,
        (() => {
          const staleFilm = epStates.filter(st => st.status === 'stale' && st.counts.done === st.counts.total && st.counts.total > 0).length;
          return staleFilm ? [{ code: EPB.composedStale, label: staleFilm + ' 集成片已过期' }] : [];
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
      /* 无静态动作的步骤(分镜/剪辑/审片/成片):定位最需推进的分集 */
      const epOf = pred => { const i = epStates.findIndex(pred); return i >= 0 ? eps[i] : null; };
      if (cur.key === 'shots') {
        const ep = epOf(st => st.counts.total === 0) || epOf(st => st.shotsStale);
        if (ep) recommendedAction = { key: 'shots', label: (epStates[eps.indexOf(ep)].shotsStale ? '重新拆镜:' : '生成分镜:') + ep.title, hash: `#/project/${p.id}/episode/${ep.id}` };
      } else if (cur.key === 'gen') {
        const ep = epOf(st => st.counts.total > 0 && (st.counts.done < st.counts.total || st.counts.stale > 0 || st.counts.failed > 0));
        if (ep) recommendedAction = { key: 'gen', label: '继续生成:' + ep.title, hash: `#/project/${p.id}/episode/${ep.id}` };
      } else if (cur.key === 'review') {
        const i = epStates.findIndex(st => st.reviewGate !== 'pass' && st.reviewGate !== 'unready'); // 尚不可审的集不冒充"该审这一集"
        const ep = i >= 0 ? eps[i] : null;
        if (ep) {
          const st = epStates[i];
          const label = st.reviewGate === 'low-review' ? '审片修订:' : st.reviewGate === 'review-stale' ? '重新审片:' : '整集审片:';
          recommendedAction = { key: 'review', label: label + ep.title, hash: `#/project/${p.id}/episode/${ep.id}` };
        }
      } else if (cur.key === 'film') {
        const ep = epOf(st => !st.composedReady);
        if (ep) recommendedAction = { key: 'compose', label: '合成成片:' + ep.title, hash: `#/project/${p.id}/episode/${ep.id}` };
      }
    }
    return { steps, epStates, recommendedAction };
  };

  return D;
});
