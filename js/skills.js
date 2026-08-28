/* ============ skills.js 主线 skill 索引注册表(双端 UMD) ============
 * 只做索引不存正文:每条 skill 记录它在主线七步(剧本/主体/分集/分镜/生成/审片/成片)上的位置,
 * 以及对既有单源件的引用键——KB 条目(键取 `KB.SECTIONS` 取用面,与其余注入点同一套键)与压缩块
 * (js/knowledge.js)、提示词 key(js/prompts.js)、
 * 提示词模板三件套键(偏好设置)、领域命令名(js/cmd-registry.js)、专家 id(js/experts-data.js)。
 * 方法论与提示词正文永远只有一份,本文件不复制任何一段。
 * 条目 = 一条内部能力(SK-01…SK-30 短名单):`kinds` 记它由哪几种机制面构成(注入/校验/编排/基础设施),
 * `pending` 如实记其中哪几面在主线上**还没有出口**(必须同时用 `gaps` 写明缺口编号)——
 * 未实现的面一律不挂假出口:pending 含 check 的条目 checks 必须为空,pending 含 orchestrate 的 steps 必须为空,
 * pending 含 inject 的条目不进 block() 拼块。
 * 约束(与 domain.js/wf-core.js/prompts.js 同纪律):模块内不碰浏览器环境句柄与前端状态桶;
 * 环境差异经 ctx 显式注入;引用键的存在性由 Skills.validate(deps) 自检——除 KB 与 Domain 外的注册表
 * 在浏览器加载顺序里晚于本文件,故一律由调用方注入,本模块不做加载期绑定。
 * 加载期依赖两件双端纯模块:KB(条目正文)与 Domain(校验型条目的领域判定,如主体按名查找),
 * 判定口径一律现取 Domain,本层不写第二份。WfCore(机位词表与景别级差)在浏览器加载顺序里晚于本文件,
 * 故以解析器形态传入、取值时现解析,加载期不绑定——本层仍不写第二份景别阶梯。
 * 加载点成对:index.html 在 domain.js/knowledge.js 之后、wf-core.js 之前;server.js/cli.js/mcp.js 同处 require。
 */
(function (root, factory) {
  const isNode = typeof module === 'object' && module.exports;
  const S = factory(isNode ? require('./knowledge.js') : root.KB, isNode ? require('./domain.js') : root.Domain,
    isNode ? () => require('./wf-core.js') : () => root.WfCore);
  if (isNode) module.exports = S; else root.Skills = S;
})(typeof self !== 'undefined' ? self : globalThis, function (KB, Domain, wfCore) {
  'use strict';

  /* 主线七步:key 与 Domain.workflow 主线步骤键同词表(审片经 G-03 升为一等步骤后七步全为 wfStep) */
  const STAGES = [
    { key: 'script', name: '剧本', wfStep: true },
    { key: 'subjects', name: '主体', wfStep: true },
    { key: 'eps', name: '分集', wfStep: true },
    { key: 'shots', name: '分镜', wfStep: true },
    { key: 'gen', name: '生成', wfStep: true },
    { key: 'review', name: '审片', wfStep: true },
    { key: 'film', name: '成片', wfStep: true },
  ];
  const CROSS = '*'; // 贯通层:作用在七步之上的索引/基础设施条目
  const KINDS = ['inject', 'check', 'orchestrate', 'infra'];
  const WAVES = ['W2', 'W3', 'W4']; // 落地波次:W2 单源打底 / W3 双端贯通 / W4 校验闸门

  /* 校验型扩展点:id → (obj, ctx) => {pass, level:'info'|'warn'|'fail', hits:[]};纯本地、零 LLM、零计费。
   * obj 是领域对象包 {p, ep, s}(镜级校验项收 s,集级收 ep),ctx 收调用侧差异(如 online);
   * hits 逐条记命中位置与原因码,供调用方如实展示,不在本层拼文案。
   * 结论只报不拦:任何校验项都不改既有阻塞项(Domain.episodeState.blockers)、发布门口径与计费动作。
   * 未注册的校验项不得被 skill 引用(validate 会报),尚无实现的校验面一律留在条目 pending 里。 */
  const CHECKS = {};

  /* ---- 剧本段校验宿主(S-01):判定输入是剧本正文本身 ----
   * 文本源:有分集上下文取该集正文,否则取项目剧本原文(拆集前的整本也判得动);
   * 判定一律在**去空白正文**上做,位置 at 与字数同一口径,换行/缩进不影响结论。
   * 三条校验项全部是本地词法命中:零 LLM、零计费,只判"文本层看得见的编排缺失",
   * 好坏优劣仍归 LLM 审片(G-10),本层不冒充质量评分,结论一律 warn 不升 fail。 */
  const scriptTextOf = o => String((o.ep ? o.ep.content : (o.p && o.p.script)) || '');
  const compact = t => String(t === null || t === undefined ? '' : t).replace(/\s+/g, '');
  const SCRIPT_MIN = 30; // 短于此的正文(片段/占位)无判定输入,不冒充结论
  /* 台词行:成对引号包住的一段(中英文引号通用,单段上限防不配对引号吞掉全文) */
  const LINE_RE = /[「『“"‘][^「『」』”"‘’]{1,200}[」』”"’]/;
  /* 词表中最早出现的那个词及其位置;无命中回 {at:-1} */
  const firstOf = (t, words) => {
    let at = -1, word = '';
    words.forEach(w => { const i = t.indexOf(w); if (i >= 0 && (at < 0 || i < at)) { at = i; word = w; } });
    return { at, word };
  };
  /* 词表中最晚出现的那个词及其位置(集尾判定用);无命中回 {at:-1} */
  const lastOf = (t, words) => {
    let at = -1, word = '';
    words.forEach(w => { const i = t.lastIndexOf(w); if (i > at) { at = i; word = w; } });
    return { at, word };
  };

  /* SK-07 开篇钩子锚定:KB「钩子六型」的"前3秒必须冲突锚定,直接进冲突,背景后面补"落到剧本文本上——
   * 只判开篇窗口内有没有冲突锚点(直接进台词,或命中六型的字面冲突信号),不判钩子选得好不好。
   *   late-hook       窗口内没有、正文后面才有 → warn(开篇是背景铺陈,冲突锚定被推迟,hit 带首个信号位置)
   *   no-hook-anchor  全文都找不到冲突锚点 → warn(整段无冲突落点,通常是梗概/设定稿而非可拍剧本) */
  const HOOK_HEAD = 120; // 开篇窗口字数(去空白):按约 4.5 字/秒口播量,覆盖开篇十余秒的可判定范围
  /* 冲突信号词:钩子六型六类各取其字面可判定的信号(身份反转/误会揭穿/致命危机/情感极限/秘密曝光/打脸预备) */
  const HOOK_SIGNALS = [
    '跪下', '求我', '凭什么', '滚出去', '闭嘴', '给我记住', '你算什么',
    '僵住', '笔迹', '证据', '真相', '原来', '竟然', '不对劲',
    '在我手上', '一小时', '来不及', '救命', '危险', '威胁', '绑走', '刀', '血',
    '离婚', '退婚', '分手', '别走', '背叛', '出轨', '骗了',
    '藏得', '秘密', '曝光', '揭穿', '照片', '录音',
    '嘲笑', '哄笑', '好戏', '刚开始', '冷笑', '羞辱', '当众',
  ];
  CHECKS['script.openingHookAnchor'] = function (obj) {
    const t = compact(scriptTextOf(obj || {}));
    if (t.length < SCRIPT_MIN) return { pass: true, level: 'info', hits: [] };
    const q = t.search(LINE_RE);
    const sig = firstOf(t, HOOK_SIGNALS);
    let at = -1, name = '';
    if (q >= 0) { at = q; name = '台词'; }
    if (sig.at >= 0 && (at < 0 || sig.at < at)) { at = sig.at; name = sig.word; }
    if (at >= 0 && at < HOOK_HEAD) return { pass: true, level: 'info', hits: [] };
    const hits = at < 0
      ? [{ code: 'no-hook-anchor', at: -1, name: '', head: t.slice(0, 24) }]
      : [{ code: 'late-hook', at, name, head: t.slice(0, 24) }];
    return { pass: false, level: 'warn', hits };
  };

  /* SK-08 打脸四步完备性:KB「打脸四步」的 羞辱→隐忍→反击→释放 四步落到剧本文本上——
   * 每步一组字面信号词,记其在正文中的首现位置。
   *   missing-step       四步里某步一个信号词都没有 → warn(打脸段落缺环节,爽点兑现不成立)
   *   step-out-of-order  某步首现早于前一已命中步 → warn(步序倒置,反击写在隐忍之前则落差无从积累)
   * 命中步数低于 FACESLAP_MIN 时视为本集本就不是打脸段落,直接不产出结论——
   * 不是每集都该有打脸,拿"没写打脸"当缺陷报是噪音。 */
  const FACESLAP_MIN = 2;
  /* 各步信号词只收该步独有的字面:哪一步都可能写的通用词(如"当众""跪下")一律不收——
   * 一个词同时属于两步会把步序判成假倒置,宁可漏判也不制造噪音 */
  const FACESLAP_STEPS = [
    { step: '羞辱', words: ['羞辱', '嘲讽', '讥讽', '嘲笑', '哄笑', '奚落', '轻蔑', '不屑', '瞧不起', '看不起', '废物', '丢人', '辱骂'] },
    { step: '隐忍', words: ['隐忍', '忍住', '强忍', '沉默', '低头', '咽下', '不吭声', '退让', '攥紧', '握紧', '默默', '一言不发', '没有反驳'] },
    { step: '反击', words: ['反击', '揭穿', '揭露', '真相', '摊牌', '亮出', '证据', '打脸', '逆转', '冷冷', '反问'] },
    { step: '释放', words: ['震惊', '哗然', '傻眼', '愣住', '惨白', '求饶', '道歉', '恐惧', '鸦雀无声', '扬长而去', '淡然', '刮目相看'] },
  ];
  CHECKS['script.faceslapStepOrder'] = function (obj) {
    const t = compact(scriptTextOf(obj || {}));
    if (t.length < SCRIPT_MIN) return { pass: true, level: 'info', hits: [] };
    const at = FACESLAP_STEPS.map(g => firstOf(t, g.words).at);
    if (at.filter(i => i >= 0).length < FACESLAP_MIN) return { pass: true, level: 'info', hits: [] };
    const hits = [];
    FACESLAP_STEPS.forEach((g, i) => { if (at[i] < 0) hits.push({ code: 'missing-step', step: g.step, at: -1 }); });
    let prev = -1, prevStep = '';
    FACESLAP_STEPS.forEach((g, i) => {
      if (at[i] < 0) return;
      if (prev >= 0 && at[i] < prev) hits.push({ code: 'step-out-of-order', step: g.step, base: prevStep, at: at[i] });
      prev = at[i]; prevStep = g.step;
    });
    return { pass: !hits.length, level: hits.length ? 'warn' : 'info', hits };
  };

  /* SK-10 文案 AI 味的文本层检出:判定输入是给人看的文案两处载体——剧本正文与分镜 s.dialogue
   * (与 SK-09 同两处载体,一份实现判两处)。三条判据全是本地词法命中,零 LLM 零计费:
   *   ai-cliche     命中 AI 套话硬禁词 → warn(逐次记词与位置;台词载体记镜号)
   *   spoken-formal 台词写成书面连接词 → warn(只判台词载体:人物嘴里不说"综上所述")
   *   adverb-flood  正文修饰副词密度超上限 → warn(整段一条,不逐词重复报)
   * 只判词法层看得见的痕迹:这一句有没有人味、像不像这个人物说的话属语义判断,
   * 仍归 LLM 审片(G-10),本层不冒充语义审片,结论一律 warn 不升 fail。
   * 三张词表与每千字上限一律现取 KB「文案AI味」条目正文(条目前三条即这三条判据的硬清单,
   * 「…」内以 / 分隔),本层不写第二份词表——改条目即改判据,字面失配时契约测试先红。 */
  const AI_KB = String(KB.section('文案AI味') || '');
  const aiWords = label => {
    const m = new RegExp(label + '[^「]*「([^」]+)」').exec(AI_KB);
    return m ? m[1].split('/').map(w => w.trim()).filter(Boolean) : [];
  };
  const AI_CLICHE = aiWords('套话硬禁词');
  /* 书面连接词:叙述里用得上,从人物嘴里说出来就是没落地的成品腔,故只判台词载体 */
  const FORMAL_WORDS = aiWords('书面连接词');
  /* 修饰副词:单个都正常,通篇堆砌才是痕迹,故只按密度判、不逐词报 */
  const ADVERB_WORDS = aiWords('修饰副词');
  const ADVERB_MIN = 200;   // 判密度的最短正文(去空白):短段落里一两个叠词副词是常态,不下密度断言
  const ADVERB_PER_K = +((AI_KB.match(/每千字超过(\d+)处/) || [])[1] || 0) || 10; // 每千字修饰副词命中上限
  /* 词表在文本中的全部命中(逐词逐次),按位置排序即阅读顺序;词表内无互为前缀的词,不会重复计同一段 */
  const allOf = (t, words) => {
    const out = [];
    words.forEach(w => { for (let i = t.indexOf(w); i >= 0; i = t.indexOf(w, i + w.length)) out.push({ at: i, word: w }); });
    return out.sort((a, b) => a.at - b.at);
  };
  CHECKS['script.aiVoiceTrace'] = function (obj) {
    const o = obj || {};
    const hits = [];
    const body = compact(scriptTextOf(o));
    if (body.length >= SCRIPT_MIN) {
      allOf(body, AI_CLICHE).forEach(x => hits.push({ code: 'ai-cliche', where: 'script', at: x.at, name: x.word }));
      const re = new RegExp(LINE_RE.source, 'g'); // 每次现开:全局正则的 lastIndex 不跨调用留状态
      for (let m = re.exec(body); m; m = re.exec(body)) {
        allOf(m[0].slice(1, -1), FORMAL_WORDS)
          .forEach(x => hits.push({ code: 'spoken-formal', where: 'script', at: m.index + 1 + x.at, name: x.word }));
      }
      const ad = allOf(body, ADVERB_WORDS);
      if (body.length >= ADVERB_MIN && ad.length * 1000 > body.length * ADVERB_PER_K) {
        hits.push({ code: 'adverb-flood', where: 'script', at: ad[0].at, name: ad[0].word, count: ad.length, limit: ADVERB_PER_K });
      }
    }
    ((o.ep && o.ep.shots) || (o.s ? [o.s] : [])).forEach(s => {
      const line = compact(s.dialogue);
      if (!line) return;
      const loc = { where: 'shot', shotId: s.id, order: (+s.order || 0) + 1 };
      allOf(line, AI_CLICHE).forEach(x => hits.push(Object.assign({ code: 'ai-cliche', name: x.word }, loc)));
      allOf(line, FORMAL_WORDS).forEach(x => hits.push(Object.assign({ code: 'spoken-formal', name: x.word }, loc)));
    });
    return { pass: !hits.length, level: hits.length ? 'warn' : 'info', hits };
  };

  /* SK-09 台词单句长度(对白铁律的校验半):KB「对话铁律」的"单句≤30字"落到两处台词载体上——
   * 剧本正文的引号台词,与分镜表的 s.dialogue(条目 covers 含 shots,同一判据两处载体一份实现)。
   *   long-line  单句去空白字数超阈值 → warn(hit 带载体、镜号与句首摘要)
   * 阈值现取 KB 条目正文,不在本层写第二份数字(条目改写而字面失配时契约测试先红)。 */
  const DIALOGUE_MAX = +((String(KB.section('对话铁律') || '').match(/单句≤(\d+)字/) || [])[1] || 0) || 30;
  const SENT_SPLIT = /[。!?!?;;…]+|——/;
  CHECKS['script.dialogueLineLength'] = function (obj) {
    const o = obj || {};
    const hits = [];
    /* 一段台词按句切分逐句判长;base 给出该段在去空白正文中的起点(分镜台词以镜定位,不报正文位置) */
    const push = (where, text, loc, base) => {
      const raw = compact(text);
      let cur = 0;
      raw.split(SENT_SPLIT).forEach(sent => {
        const at = raw.indexOf(sent, cur);
        cur = at + sent.length;
        if (sent.length > DIALOGUE_MAX) {
          hits.push(Object.assign({ code: 'long-line', where, len: sent.length, name: sent.slice(0, 14) },
            base === undefined ? {} : { at: base + at }, loc));
        }
      });
    };
    const body = compact(scriptTextOf(o));
    const re = new RegExp(LINE_RE.source, 'g'); // 每次现开:全局正则的 lastIndex 不跨调用留状态
    for (let m = re.exec(body); m; m = re.exec(body)) push('script', m[0].slice(1, -1), {}, m.index + 1);
    ((o.ep && o.ep.shots) || (o.s ? [o.s] : [])).forEach(s => push('shot', s.dialogue, { shotId: s.id, order: (+s.order || 0) + 1 }));
    return { pass: !hits.length, level: hits.length ? 'warn' : 'info', hits };
  };

  /* ---- 主体面生成前置判定基面(SK-11/SK-13 的 G-06 校验半共用) ----
   * 判定输入是该镜**真实的生成请求**:请求现取 Domain.buildVideoRequest(与真实发送、生成指纹同一构造点),
   * 参考图组与取图优先级现取 Domain.shotRefImages/subjectRefImage,本层不写第二份装配与第二份取图。
   * 提示词正文取 s.prompt 优先 s.plot(与请求装配同口径):两者都空即该镜还没有可判定的提示词,不产出结论。
   * 与其余校验项同纪律:纯本地词法/计数,零 LLM 零计费,结论只到 warn——不进 blockers、不改发布门、不拦生成动作。 */
  const shotsOf = o => (o.s ? [o.s] : ((o.ep && o.ep.shots) || []));
  const promptOf = s => String(s.prompt || s.plot || '');
  /* 引用名去重后逐个解析:回 [{name, full, r}],解析不到的名字略过(那是 SK-12 的完备性面) */
  const refsOf = (p, s) => {
    const out = [], seen = {};
    [].concat(s.characters || [], s.scene ? [s.scene] : [], s.props || [])
      .map(n => String(n === null || n === undefined ? '' : n).trim()).filter(Boolean)
      .forEach(name => {
        const r = Domain.findSubject(p, name);
        if (!r) return;
        const full = Domain.subjectFullName(r);
        if (seen[full]) return;
        seen[full] = 1;
        out.push({ name, full, r });
      });
    return out;
  };
  /* 词表命中次数(逐词累加,用于"太碎"这类计数判据) */
  const countOf = (t, words) => words.reduce((n, w) => {
    let c = 0;
    for (let i = t.indexOf(w); i >= 0; i = t.indexOf(w, i + w.length)) c++;
    return n + c;
  }, 0);

  /* SK-11 主体参考纪律生成前置校验(G-06 校验半的主体参考面):逐镜看真实生成请求的参考图组守不守条目纪律。
   *   ref-person-overflow 该镜进参考图组的人物主体超过条目上限 → warn
   *                       (条目②「参考人物≤4,越多越易识别模糊」;上限现取条目正文,本层不写第二份数字)
   *   ref-cap-dropped     该主体有真实图却没进参考图组(被 5 张上限挤出)→ warn(这一镜拿不到它的参考)
   *   ref-sheet-fallback  人物主体没有视频参考大头照,喂进去的是白底三视图权威图 → warn
   *                       (条目③「人物参考用大头照+全身照,不要用三视图/多视图,模型会误判为多个主体」;
   *                        取图优先级里大头照本就排在权威图之前,补出 s.imgRef 后本命中自动消失)
   * 引用名解析不到、主体全程无图归 SK-12,跨镜锁不一致归 SK-13,本项只报这一镜的参考纪律;
   * 一律 warn:参考纪律影响的是抽卡命中率而非"必然拿不到参考",fail 仍只留给完备性面。 */
  const REF_PERSON_MAX = +((String(KB.section('主体参考') || '').match(/参考人物≤(\d+)/) || [])[1] || 0) || 4;
  CHECKS['subjects.genRefDiscipline'] = function (obj) {
    const o = obj || {};
    const p = o.p;
    const shots = shotsOf(o);
    if (!p || !shots.length) return { pass: true, level: 'info', hits: [] };
    const hits = [];
    shots.forEach(s => {
      const order = (+s.order || 0) + 1;
      const fed = {}; // 本镜真实进了参考图组的全称 → 图 url
      Domain.shotRefImages(p, s).refImages.forEach(x => { fed[x.name] = x.url; });
      let persons = 0;
      refsOf(p, s).forEach(({ full, r }) => {
        const img = Domain.subjectRefImage(r);
        if (!img) return; // 主体全程无真实图:SK-12 已如实报缺图,本项不重复
        if (!fed[full]) { hits.push({ code: 'ref-cap-dropped', shotId: s.id, order, name: full, limit: Object.keys(fed).length }); return; }
        if (r.s.kind !== 'character') return;
        persons++;
        if (img === r.s.image && img !== r.s.imgRef) hits.push({ code: 'ref-sheet-fallback', shotId: s.id, order, name: full, limit: 0 });
      });
      if (persons > REF_PERSON_MAX) hits.push({ code: 'ref-person-overflow', shotId: s.id, order, name: '', limit: REF_PERSON_MAX, count: persons });
    });
    return { pass: !hits.length, level: hits.length ? 'warn' : 'info', hits };
  };

  /* SK-13 多镜头写法生成前置校验(G-06 校验半的多镜头写法面):逐镜看送出去的提示词守不守条目三条写法纪律。
   *   img2ref-decl-missing 送了图(图生视频:输入图或参考图组)却在提示词里找不到"基于参考图保持一致"的声明 → warn
   *                        (条目「图生视频须声明…」;有主体参考图组时该声明由请求装配自带,故只在无主体参考的镜上命中)
   *   frames-motion-overrun 首尾帧策略的镜写了大幅动作 → warn(条目「首尾帧策略时动作幅度收敛,保证两端画面可插值」)
   *   shot-flow-fragmented  一镜提示词里镜头切换信号过多 → warn(条目「按时间顺序描述镜头流,不要太碎」)
   * 声明的判定字面取自条目那句"须声明"的原话(真实请求里这句由主体定义后缀给出,措辞不同但同一条纪律),
   * 条目改写到关键词不在了判据自然退空——不拿失配的字面制造假命中。 */
  const MULTI_DECL = (String(KB.section('多镜头写法') || '').match(/须声明"([^"]*)"/) || [])[1] || '';
  const DECL_WORDS = ['参考图', '一致'].filter(w => MULTI_DECL.indexOf(w) >= 0);
  /* 大幅动作词:位移大、姿态变化剧烈的那一类动作——首尾帧两端画面插不出来,抽卡也稳不住;
   * SK-13 的首尾帧插值面与 SK-20 的动态感准入面共用本表,不写第二份 */
  const BIG_MOTION = ['奔跑', '狂奔', '飞奔', '疾驰', '追逐', '打斗', '厮打', '翻滚', '跳跃', '跃起',
    '摔倒', '扑倒', '坠落', '爆炸', '冲刺', '急转', '挥拳', '旋转'];
  /* 镜头切换信号:一镜之内出现多次即是把好几个镜头挤进一条提示词 */
  const CUT_SIGNALS = ['切至', '切到', '切换', '快切', '转场', '闪回', '画面一转', '镜头一转'];
  const CUT_MAX = 2;
  CHECKS['subjects.multiShotPrompt'] = function (obj) {
    const o = obj || {};
    const p = o.p;
    const shots = shotsOf(o);
    if (!p || !shots.length) return { pass: true, level: 'info', hits: [] };
    const hits = [];
    shots.forEach(s => {
      const base = promptOf(s);
      if (!base) return; // 提示词还没写,无判定输入
      let q;
      try { q = Domain.buildVideoRequest(p, o.ep, s); } catch (_) { return; } // 数据残缺装不出请求即无判定输入
      const at = { shotId: s.id, order: (+s.order || 0) + 1 };
      const push = (code, name, extra) => hits.push(Object.assign({ code }, at, { name }, extra || {}));
      if (DECL_WORDS.length && (q.image || q.lastFrame || (q.refImages || []).length)
        && !DECL_WORDS.every(w => String(q.prompt || '').indexOf(w) >= 0)) push('img2ref-decl-missing', '');
      if (q.strategy === 'frames') {
        const m = firstOf(base, BIG_MOTION);
        if (m.at >= 0) push('frames-motion-overrun', m.word);
      }
      const cuts = countOf(base, CUT_SIGNALS);
      if (cuts > CUT_MAX) push('shot-flow-fragmented', '', { count: cuts, limit: CUT_MAX });
    });
    return { pass: !hits.length, level: hits.length ? 'warn' : 'info', hits };
  };

  /* SK-12 分镜引用主体完备性(S-03 的完备性半):逐镜看 characters/scene/props 的引用名能否落到主体库,
   * 落到的主体(含形态)有没有可喂模型的真实参考图。主体按名查找与取图优先级一律走 Domain
   * (findSubject 含多形态全称与曾用名兜底;subjectRefImage 与真实生成请求同一取图口径),本层不写第二份。
   *   unknown-subject 引用名在主体库解析不到 → fail(该名字无参考可注,必是错字、漏提取或改名未回填)
   *   no-ref-image    解析到主体但无真实参考图 → warn(生成时该主体不进参考图组)
   *   no-subject-ref  该镜一个主体都不引用 → warn(无主体锁定,易换脸)
   * 同一名字在多镜命中即多条 hit(按镜计位),调用方自行聚合展示。 */
  CHECKS['subjects.shotRefIntegrity'] = function (obj) {
    const o = obj || {};
    const p = o.p;
    const shots = o.s ? [o.s] : ((o.ep && o.ep.shots) || []);
    if (!p || !shots.length) return { pass: true, level: 'info', hits: [] };
    const hits = [];
    shots.forEach(s => {
      const order = (+s.order || 0) + 1;
      const names = [].concat(s.characters || [], s.scene ? [s.scene] : [], s.props || [])
        .map(n => String(n === null || n === undefined ? '' : n).trim()).filter(Boolean);
      if (!names.length) { hits.push({ code: 'no-subject-ref', shotId: s.id, order, name: '' }); return; }
      names.forEach(name => {
        const r = Domain.findSubject(p, name);
        if (!r) { hits.push({ code: 'unknown-subject', shotId: s.id, order, name }); return; }
        if (!Domain.subjectRefImage(r)) hits.push({ code: 'no-ref-image', shotId: s.id, order, name: Domain.subjectFullName(r) });
      });
    });
    const level = hits.some(h => h.code === 'unknown-subject') ? 'fail' : hits.length ? 'warn' : 'info';
    return { pass: !hits.length, level, hits };
  };

  /* SK-13 跨镜头主体一致性(S-03 的一致性半):同一主体被多镜引用时,看它在镜间「锁」得一不一致——
   * 每镜实际喂进生成请求的参考图现取 Domain.shotRefImages(与真实生成同一份构造,含 5 张上限),
   * 引用名与全称现取 Domain.findSubject/subjectFullName,本层不写第二份取图与解析。
   * 单镜的绝对缺陷(名字解析不到、主体全程无图)归 SK-12,本项只报跨镜差异:
   *   ref-image-drift 该镜喂到的参考图与基准镜不是同一张(权威图与形态图混用、形态间切换)→ warn
   *   ref-lock-gap    别的镜锁得住这镜锁不住:该形态取不到真实图(no-image)或被参考图组上限挤出(over-cap)→ warn
   *   alias-drift     同一主体同一形态跨镜被不同名字引用(改名后旧名残留、别名混用)→ warn
   * 基准 = 该主体跨镜出现最多的那张图/那个名字(并列取先出现者);形态不同属有意换装,不按名字漂移判。
   * 一致性风险一律 warn,fail 留给"必然拿不到参考"的完备性面(SK-12)。 */
  CHECKS['subjects.crossShotConsistency'] = function (obj) {
    const o = obj || {};
    const p = o.p;
    const shots = (o.ep && o.ep.shots) || [];
    if (!p || shots.length < 2) return { pass: true, level: 'info', hits: [] }; // 单镜无跨镜可比,不冒充通过判定
    const per = new Map(); // 主体 id → 逐镜引用记录(按镜序)
    shots.forEach(s => {
      const order = (+s.order || 0) + 1;
      const fed = {}; // 本镜真实进了参考图组的全称 → 图 url
      Domain.shotRefImages(p, s).refImages.forEach(x => { fed[x.name] = x.url; });
      const seen = {};
      [].concat(s.characters || [], s.scene ? [s.scene] : [], s.props || [])
        .map(n => String(n === null || n === undefined ? '' : n).trim()).filter(Boolean)
        .forEach(name => {
          if (seen[name]) return; // 同镜同名重复引用只计一次
          seen[name] = 1;
          const r = Domain.findSubject(p, name);
          if (!r) return; // 解析不到的引用是 SK-12 的完备性面,本项不重复报
          const full = Domain.subjectFullName(r);
          const rec = { shotId: s.id, order, name, full, image: Domain.subjectRefImage(r), fed: fed[full] || '' };
          if (!per.has(r.s.id)) per.set(r.s.id, []);
          per.get(r.s.id).push(rec);
        });
    });
    /* 众数(并列取先出现者):跨镜比对的基准 */
    const modeOf = (recs, pick) => {
      const cnt = {};
      let best = '', bestN = 0;
      recs.forEach(x => {
        const v = pick(x);
        if (!v) return;
        const n = (cnt[v] = (cnt[v] || 0) + 1);
        if (n > bestN) { bestN = n; best = v; }
      });
      return best;
    };
    const hits = [];
    per.forEach(recs => {
      const shotIds = {};
      recs.forEach(x => { shotIds[x.shotId] = 1; });
      if (Object.keys(shotIds).length < 2) return; // 只在一镜出场的主体无一致性可言
      const baseImg = modeOf(recs, x => x.fed);
      if (baseImg) recs.forEach(x => {
        if (!x.fed) hits.push({ code: 'ref-lock-gap', shotId: x.shotId, order: x.order, name: x.full, reason: x.image ? 'over-cap' : 'no-image' });
        else if (x.fed !== baseImg) hits.push({ code: 'ref-image-drift', shotId: x.shotId, order: x.order, name: x.full });
      });
      const byFull = new Map(); // 同一形态内部才比引用名:形态不同是换装,不是别名混用
      recs.forEach(x => { if (!byFull.has(x.full)) byFull.set(x.full, []); byFull.get(x.full).push(x); });
      byFull.forEach(g => {
        const baseName = modeOf(g, x => x.name);
        g.forEach(x => { if (x.name !== baseName) hits.push({ code: 'alias-drift', shotId: x.shotId, order: x.order, name: x.name, base: baseName }); });
      });
    });
    return { pass: !hits.length, level: hits.length ? 'warn' : 'info', hits };
  };

  /* ---- 分镜段校验宿主(SK-18 景别面):判定输入是分镜表的景别序列 ----
   * 相邻两镜的级差一律经 WfCore.sizeGap 取(景别阶梯的唯一定义在 js/wf-core.js,本层不写第二份阶梯);
   * 级差 -1(缺景别或阶梯外自定义词)即不可判定——既不算递进也不算跳切,并打断连续同级串,
   * 不拿"没填景别"冒充结论。判据是 KB「景别运镜」衔接那句落到级差上:相邻景别不硬切、
   * 优先隔一级切换、两极(大全景↔特写)须用全景或中景过渡。
   * 与剧本段/主体段同纪律:纯本地词法与级差判定、零 LLM、零计费,结论一律 warn 不升 fail;
   * 这一镜景别选得对不对、有没有摄影层面的设计意图这类语义判断仍归 LLM 审片(G-10)。 */
  const SIZE_STEP = 2;      // 推荐递进级差(隔一级):整集达不到即景别几乎没动过
  const SIZE_POLAR = 4;     // 两极对切的级差下限:须补全景或中景过渡
  const FLAT_RUN = 3;       // 连续同景别镜数达此值即成串(两镜同景别是正反打常态,不报)
  const SIZE_MIN_PAIRS = 3; // 整集级结论的判定下限:可判定的相邻对少于此数不下整集断言

  /* SK-18 景别递进与跳切:逐对看相邻镜级差,再回看整集有没有用上隔级递进。
   *   flat-run       连续 FLAT_RUN 镜以上同景别 → warn(hit 定位到串首镜并带串尾镜号与串长)
   *   jump-cut       相邻两镜级差达两极 → warn(缺过渡镜,hit 带上一镜景别与实测级差)
   *   no-progression 整集可判定的相邻对里最大级差不到隔一级 → warn(整集级一条,不逐镜重复报)
   * 单镜入口(只传 s)无相邻可比,不产出结论;轴线面(越轴/匹配剪辑)的判定输入是机位方位,
   * 分镜字段无承载,仍归 G-10,不在本项冒充。 */
  CHECKS['shots.sizeLinkage'] = function (obj) {
    const o = obj || {};
    const shots = (o.ep && o.ep.shots) || [];
    if (shots.length < 2) return { pass: true, level: 'info', hits: [] };
    const sizeGap = wfCore().sizeGap;
    const sizeOf = s => String(((s || {}).cameraSpec || {}).shotSize || '');
    const at = s => ({ shotId: s.id, order: (+s.order || 0) + 1 });
    const hits = [];
    let pairs = 0, top = -1, run = 1;
    /* 同级串收尾:够长即记一条并把串长归零(不够长的串是正反打,静默丢弃) */
    const flush = end => {
      if (run >= FLAT_RUN) {
        const head = shots[end - run + 1];
        hits.push(Object.assign({ code: 'flat-run', name: sizeOf(head), base: '', gap: 0, run, to: (+shots[end].order || 0) + 1 }, at(head)));
      }
      run = 1;
    };
    for (let i = 1; i < shots.length; i++) {
      const prev = sizeOf(shots[i - 1]), cur = sizeOf(shots[i]);
      const gap = sizeGap(prev, cur);
      if (gap < 0) { flush(i - 1); continue; }
      pairs++;
      if (gap > top) top = gap;
      if (gap === 0) { run++; continue; }
      flush(i - 1);
      if (gap >= SIZE_POLAR) hits.push(Object.assign({ code: 'jump-cut', name: cur, base: prev, gap }, at(shots[i])));
    }
    flush(shots.length - 1);
    if (pairs >= SIZE_MIN_PAIRS && top < SIZE_STEP) {
      hits.push({ code: 'no-progression', shotId: '', order: 0, name: '', base: '', gap: top, run: 0, to: 0, pairs });
    }
    return { pass: !hits.length, level: hits.length ? 'warn' : 'info', hits };
  };

  /* ---- 分镜段生成前置判定基面(SK-19 稳定词面):判定输入是该镜真实的生成请求提示词 ----
   * 提示词现取 Domain.buildVideoRequest(与真实发送、生成指纹同一构造点),主体定义前置、轴线规则、
   * 运镜机位、美术风格后缀与负面约束一并在内——判的就是模型最终读到的那一条,本层不另拼第二份提示词;
   * 判定一律在去空白提示词上做,与其余段同一基面。判定字面从条目正文里现筛,条目改写到字面不在了判据自然退空。 */
  const GC_LEX = String(KB.section('抽卡军规') || '') + String(KB.section('抽卡公式') || '');
  /* 稳定词:军规③「必加稳定词」与公式骨架末尾那串约束共有的解剖/动作三面(五官不变形、人体结构正常、动作不僵硬)。
   * 通用的"稳定"二字不收——运镜与机位描述里也出现得到(平稳横移/固定镜头),收进来会把没写稳定词的镜判成写了;
   * 第四面「同一角色服装发型一致」不收——有主体参考图组时那句声明由请求装配自带,跨镜锁不锁得住归 SK-13。 */
  const STABLE_WORDS = ['不变形', '结构正常', '不僵硬'].filter(w => GC_LEX.indexOf(w) >= 0);
  /* 模糊词:军规⑤自己列在括号里的那串(按 / 切),本层不外扩词表 */
  const VAGUE_WORDS = String((String(KB.section('抽卡军规') || '').match(/模糊词[((]"([^"]*)"/) || [])[1] || '')
    .split('/').map(w => w.trim()).filter(Boolean);

  /* SK-19 抽卡稳定词(抽卡两条条目的校验半):逐镜看真实发出去的那条提示词有没有把稳定词写全、有没有写模糊词。
   *   no-stable-word      整条提示词一个稳定词都没有 → warn(军规③;hit 的 miss 列出该补的字面)
   *   stable-word-partial 稳定词只写了一部分 → warn(name 给已写的、miss 给缺的)
   *   vague-word          命中条目自列的模糊词 → warn(军规⑤「等于没写」,逐词一条)
   * 提示词还没写的镜(prompt/plot 都空)与数据残缺装不出请求的镜无判定输入,不产出结论。
   * 八维填得全不全、动作写得慢不慢这类语义判断仍归 LLM 审片(G-10),本项只判文本层看得见的字面;
   * 结论一律 warn 只报不拦:不进 blockers、不改发布门口径、不拦生成动作、不改计费。 */
  CHECKS['shots.stableLexicon'] = function (obj) {
    const o = obj || {};
    const p = o.p;
    const list = o.s ? [o.s] : ((o.ep && o.ep.shots) || []);
    if (!p || !list.length || !STABLE_WORDS.length) return { pass: true, level: 'info', hits: [] };
    const hits = [];
    list.forEach(s => {
      if (!String(s.prompt || s.plot || '')) return;
      let q;
      try { q = Domain.buildVideoRequest(p, o.ep, s); } catch (_) { return; }
      const t = compact(q.prompt);
      const at = { shotId: s.id, order: (+s.order || 0) + 1 };
      const got = STABLE_WORDS.filter(w => t.indexOf(w) >= 0);
      if (!got.length) hits.push(Object.assign({ code: 'no-stable-word' }, at, { name: '', miss: STABLE_WORDS.join('、') }));
      else if (got.length < STABLE_WORDS.length) {
        hits.push(Object.assign({ code: 'stable-word-partial' }, at,
          { name: got.join('、'), miss: STABLE_WORDS.filter(w => got.indexOf(w) < 0).join('、') }));
      }
      VAGUE_WORDS.forEach(w => {
        if (t.indexOf(w) >= 0) hits.push(Object.assign({ code: 'vague-word' }, at, { name: w, miss: '' }));
      });
    });
    return { pass: !hits.length, level: hits.length ? 'warn' : 'info', hits };
  };

  /* ---- 生成段校验宿主(SK-22 生成凭据面):判定输入是该镜的生成凭据与确认态 ----
   * 凭据 = s.video 那份产物记录(状态 / 输入指纹 inputHash / 离线模拟标记)与确认闸字段(s.confirm、s.final)。
   * 判旧与就绪一律现取 Domain.shotVideoStale/shotVideoReady(与流程条、分集状态、批量生成同一份判定),
   * 本层不写第二份指纹比对;在线与否取 ctx.online,与 Domain 判就绪同参。
   * 判据都是既有机制自身的失效点——判旧机制对这一镜恒不生效、确认背书的已不是当前输入、
   * 定稿/确认闸把这一镜挡在生成之外——而不是 Domain 已经数过的那几个计数的复述。
   * 与其余校验项同纪律:纯本地读字段、零 LLM、零计费,结论一律 warn 不升 fail;
   * 不进 blockers、不改发布门口径、不改确认闸行为(不写回 s.confirm/s.final)、不改计费动作。 */

  /* SK-22 生成凭据与确认失效:逐镜看产物凭据立不立得住、确认态还算不算数。
   *   credential-missing  已出片却没有输入指纹 → warn(Domain.shotVideoStale 的指纹分支只在有指纹时比对,
   *                       这一镜此后改提示词/换参考图都不会判过期,旧片会一直冒充新成果)
   *   sim-credential      在线态下产物是离线占位模拟 → warn(凭据不是真实上游产物;
   *                       Domain 把它计进 noVideo,计数里看不出这一镜其实有个占位片)
   *   final-stale         已定稿且输入已变 → warn(批量生成按 !s.final 排除定稿镜,
   *                       「重生成过期镜」对它无效,过期在这一镜上没有出口)
   *   confirm-stale       已确认且输入已变 → warn(确认背书的是变更前的输入——改主体图/画幅/风格后缀
   *                       都会让指纹判旧却不回落确认闸,确认闸放行的是过期产物)
   *   unconfirmed-pending 未确认、未定稿且还没有真实产物 → warn(批量生成会把它跳进 skipped;
   *                       Domain 只在全镜出片时才报待确认,部分完成时这一镜是静默被跳过的)
   * 同镜可多条命中(凭据面与确认面各判各的);定稿与确认同时命中判旧时只报定稿那条——
   * 定稿是更强的断点,两条一起报只是同一件事说两遍。 */
  CHECKS['gen.renderCredential'] = function (obj, ctx) {
    const o = obj || {};
    const p = o.p;
    const shots = shotsOf(o);
    if (!p || !shots.length) return { pass: true, level: 'info', hits: [] };
    const online = !!(ctx || {}).online;
    const hits = [];
    shots.forEach(s => {
      const v = s.video || {};
      const at = { shotId: s.id, order: (+s.order || 0) + 1 };
      const push = code => hits.push(Object.assign({ code }, at));
      if (v.status === 'done') {
        if (!v.inputHash) push('credential-missing');
        if (v.simulated && online) push('sim-credential');
      }
      if (Domain.shotVideoStale(p, s, online)) {
        if (s.final) push('final-stale');
        else if (s.confirm) push('confirm-stale');
      }
      if (!s.confirm && !s.final && !Domain.shotVideoReady(s, online)) push('unconfirmed-pending');
    });
    return { pass: !hits.length, level: hits.length ? 'warn' : 'info', hits };
  };

  /* ---- 分镜段动态感准入基面(SK-20 动态感面):判定输入分两段取,取哪一段跟着判据走 ----
   * 动作幅度判 s.prompt 优先 s.plot 那段动作描述(与请求装配同口径):装配段(轴线规则/运镜/机位/
   * 美术风格/负面约束)本就不写动作,把负面约束里"不要打斗"这类禁写词算进来只会造假命中;
   * 运镜条数判 Domain.buildVideoRequest 装出的真实提示词——运镜是装配时按 s.camera 追加的,
   * 一镜给了几个运镜只在装好的那条上看得全;镜长取该请求的 duration(与合成段时长同一份估长)。
   * 运镜词表现取 WfCore 运镜表里 axis='move' 那几项(角度/景别两轴的取值不是运镜,收进来会把机位描述
   * 算成第二个运镜),本层不写第二份词表。判据字面一律现取条目正文,条目改写到字面不在了判据自然退空。
   * 与其余段同纪律:纯本地词法与计数、零 LLM 零计费,结论一律 warn 只报不拦。 */
  const GC_RULES = String(KB.section('抽卡军规') || '');
  const BIG_MOTION_RULE = GC_RULES.indexOf('大动态') >= 0;        // 军规①「动作写慢写连续…不写这类大动态」
  const ONE_MOVE_RULE = GC_RULES.indexOf('一次只给一个运镜') >= 0; // 军规②「运镜写稳写简单」
  const FLAT_RHYTHM_RULE = String(KB.section('剪辑节奏') || '').indexOf('镜头长度分布') >= 0;
  const RHYTHM_MIN = 4; // 整集级结论的判定下限:可判定镜数少于此不下整集断言(三两镜谈不上长度分布)
  /* 运镜判据的取值:词表内的运镜全名,另收其去掉"镜头"二字的简写(条目示例里两种形态都写得到);
   * 同一运镜命中全名或简写只计一次,不会把一个运镜算成两个 */
  const moveNames = () => wfCore().CAMERA_MOVES.filter(x => x.axis === 'move').map(x => x.name);

  /* SK-20 镜头动态感准入(剪辑节奏与抽卡军规的校验半):逐镜看这一镜的动态写得进不进模型的稳定区间,
   * 再回看整集镜长有没有分布。
   *   motion-overrun      动作描述里写了大幅动作 → warn(军规①;首尾帧镜的同一判据归 SK-13 的插值面,
   *                       本项不重复报——那一镜的插值风险已如实报过)
   *   camera-move-crowded 一镜给了两个以上运镜 → warn(军规②「一次只给一个运镜」,hit 列出命中的运镜名;
   *                       提示词里另写了运镜而与 s.camera 不是同一个时也在此命中)
   *   rhythm-flat         整集每一镜的真实镜长都一样 → warn(剪辑节奏「节奏=镜头长度分布」,
   *                       整集级一条,不逐镜重复报)
   * 提示词还没写的镜与数据残缺装不出请求的镜无判定输入,不产出结论;单镜入口无整集节奏可比。
   * 这一镜该快该慢、动态感够不够这类语义判断仍归 LLM 审片(G-10),本项只判文本层与计数看得见的部分;
   * 节拍板五段式产出上的动态感准入(S-04)仍无判定输入,不在本项冒充。 */
  CHECKS['shots.motionDiscipline'] = function (obj) {
    const o = obj || {};
    const p = o.p;
    const list = shotsOf(o);
    if (!p || !list.length) return { pass: true, level: 'info', hits: [] };
    const moves = moveNames();
    const hits = [];
    const durs = [];
    list.forEach(s => {
      const base = promptOf(s);
      if (!base) return; // 提示词还没写,无判定输入
      let q;
      try { q = Domain.buildVideoRequest(p, o.ep, s); } catch (_) { return; } // 数据残缺装不出请求即无判定输入
      const at = { shotId: s.id, order: (+s.order || 0) + 1 };
      const push = (code, name, extra) => hits.push(Object.assign({ code }, at, { name }, extra || {}));
      durs.push(q.duration);
      if (BIG_MOTION_RULE && q.strategy !== 'frames') {
        const m = firstOf(compact(base), BIG_MOTION);
        if (m.at >= 0) push('motion-overrun', m.word, { at: m.at });
      }
      if (ONE_MOVE_RULE) {
        const t = compact(q.prompt);
        const got = moves.filter(n => t.indexOf(n) >= 0 || t.indexOf(n.replace(/镜头$/, '镜')) >= 0);
        if (got.length > 1) push('camera-move-crowded', got.join('、'), { count: got.length, limit: 1 });
      }
    });
    if (FLAT_RHYTHM_RULE && durs.length >= RHYTHM_MIN && durs.every(d => d === durs[0])) {
      hits.push({ code: 'rhythm-flat', shotId: '', order: 0, name: durs[0] + '秒', count: durs.length, limit: 0 });
    }
    return { pass: !hits.length, level: hits.length ? 'warn' : 'info', hits };
  };

  /* ---- 审片段校验宿主(SK-24 方法论维度面):判定输入是这一集已成型的审片报告 ----
   * 报告 = ep.lastReview(整集:逐镜条目 perShot、四维成片评审 cut)与逐镜报告 s.reviews——
   * 逐镜报告一律按 perShot.reportId 精确取(与整集报告视图同口径),不拿"最近一条"冒充当时的结论。
   * 判据是本条注入面那两条提示词键的落点在报告里到位没有:review.finalSystem 出的四维成片评审、
   * review.system 出的镜级三维报告;四维维度名现取 WfCore.normalizeCut 的产出形状(维度名的唯一定义
   * 在 js/wf-core.js,本层不写第二份四维名)。整份判旧现取 Domain.reviewStaleByScript
   * (与分集状态、问题中心、发布门 G3 同一份判定):已判旧的报告不产出结论——那已被如实报成"视为未审",
   * 重审会整份重建,在旧报告上挑维度只是同一件事说两遍。未审/判旧/低分三类计数同归 Domain,本层不复述,
   * 报的是既有机制自身的失效点:某一维度整段没进报告、某几镜从未进过报告、报告对象已取不回、
   * 逐镜分背书的已不是当前视频、分数出自离线本地模拟(方法论没进过任何模型)。
   * 与其余校验项同纪律:纯本地读字段、零 LLM、零计费,结论一律 warn 不升 fail;
   * 不进 blockers、不改发布门 G3 口径与达标线、不改审片动作与计费。 */

  /* 四维成片评审的维度键:现取 WfCore.normalizeCut 空输入的产出形状(overall 是整集总评不是维度,
   * 按值形状排除);四维改名或增减时本判据自动跟上,不留第二份维度名 */
  const cutDims = () => {
    const shape = wfCore().normalizeCut({});
    return Object.keys(shape).filter(k => shape[k] && typeof shape[k] === 'object');
  };

  /* SK-24 方法论维度进审片报告:逐集看报告里那几个方法论维度到位没有、逐镜分还算不算数。
   *   cut-dim-missing     四维成片评审缺失或某一维无分 → warn(集级一条;该步 LLM 失败时如实标 null,
   *                       而 Domain 与发布门 G3 只读 avg,四维缺失在报告上看不出来)
   *   shot-dim-uncovered  该镜在 perShot 里没有条目 → warn(生成中/评审失败的镜会被跳过,
   *                       整集均分不含它,而快照哈希涵盖全镜集,报告整体仍读作"当前")
   *   shot-report-missing perShot 条目按 reportId 取不回报告 → warn(被后续单镜审片挤出最近五条,
   *                       三维评语与方法论校验命中都取不回,只剩一个还在驱动均分的分数)
   *   dim-score-stale     该条目背书的视频指纹与当前不一致而整份报告未判旧 → warn
   *                       (子集复审沿用的旧条目:那一镜的分测的是换掉之前的视频)
   *   local-dim-fallback  该镜报告出自离线本地模拟评审 → warn(方法论注入没进过任何模型,
   *                       分数是种子启发式,却与真实评分同样计入均分与发布门 G3)
   *   check-dim-absent    报告里没有方法论校验命中字段 → warn(集级一条带条数;
   *                       该报告成型时未附命中,"没有命中"不等于判过且干净)
   * 单镜入口(只传 s)与未审片的集无判定输入,不产出结论。四维评语写得对不对、
   * 这一镜的分该不该是这个数属语义判断,仍归 LLM 审片(G-10),本层不冒充。 */
  CHECKS['review.methodDim'] = function (obj) {
    const o = obj || {};
    const ep = o.ep;
    const lr = ep && ep.lastReview;
    if (!lr || typeof lr.avg !== 'number') return { pass: true, level: 'info', hits: [] };
    if (Domain.reviewStaleByScript(ep)) return { pass: true, level: 'info', hits: [] };
    const per = lr.perShot || [];
    const hits = [];
    const cut = lr.cut;
    if (!cut || cutDims().some(k => !cut[k] || typeof cut[k].score !== 'number')) {
      hits.push({ code: 'cut-dim-missing', shotId: '', order: 0, count: 0 });
    }
    let noChecks = 0;
    (ep.shots || []).forEach(s => {
      const at = { shotId: s.id, order: (+s.order || 0) + 1, count: 0 };
      const rec = per.find(x => x.shotId === s.id);
      if (!rec) { hits.push(Object.assign({ code: 'shot-dim-uncovered' }, at)); return; }
      const rep = (s.reviews || []).find(r => r.id === rec.reportId);
      if (!rep) { hits.push(Object.assign({ code: 'shot-report-missing' }, at)); return; }
      if ((rec.videoInputHash || '') !== ((s.video && s.video.inputHash) || '')) {
        hits.push(Object.assign({ code: 'dim-score-stale' }, at));
      }
      if (rep.mode === 'local') hits.push(Object.assign({ code: 'local-dim-fallback' }, at));
      if (!Array.isArray(rep.checks)) noChecks++;
    });
    if (noChecks) hits.push({ code: 'check-dim-absent', shotId: '', order: 0, count: noChecks });
    return { pass: !hits.length, level: hits.length ? 'warn' : 'info', hits };
  };

  /* 字幕可读性判据(成片字幕/对白面的三条阈值):
   *   CAP_CPS       阅读速度上限(字/秒):超出即观众看不完一条字幕
   *   CAP_MIN_DUR   单条最短停留(秒):低于此值字幕一闪而过
   *   CAP_ONE_SCREEN 一屏可容纳字数:超出即一条字幕塞满画面,建议拆条
   * 烧录硬截断上限不在此处再写一份,现取 Domain.SUB_BURN_MAX(与合成时的截断同一常量)。 */
  const CAP_CPS = 9;
  const CAP_MIN_DUR = 1;
  const CAP_ONE_SCREEN = 40;

  /* SK-28 成片字幕时间轴与阅读速度(S-06):判定输入是合成时间轴段——段序列/段时长/段文本现取
   * Domain.subtitleSegs(与真实合成 items、SRT 软字幕同一份构造:composeSeqOf 在列镜头、
   * 裁剪出入点差定时长、文本取台词优先旁白),本层不写第二份切段与取文本。
   *   caption-truncated 烧录字幕开启且单条超硬上限 → fail(合成时确定被截断,这段对白必丢字)
   *   caption-too-long  单条字数超一屏可容纳量 → warn(未到截断线但一条塞满画面,建议拆条)
   *   read-too-fast     单条字数/停留秒数超阅读速度上限 → warn(字幕跟不上,常见于视频被裁短而台词没删)
   *   caption-flash     单条停留不足最短可读时长 → warn(字幕一闪而过)
   *   no-caption-track  烧录字幕开启但全集在列段无一条文本 → warn(成片不出字,对白/旁白多半漏填)
   * 结论只报不拦:不进 blockers、不改发布门口径、不改计费动作。 */
  CHECKS['film.subtitleTiming'] = function (obj, ctx) {
    const o = obj || {};
    const ep = o.ep;
    if (!ep) return { pass: true, level: 'info', hits: [] };
    const segs = Domain.subtitleSegs(ep, (ctx || {}).online);
    if (!segs.length) return { pass: true, level: 'info', hits: [] }; // 无在列素材段=时间轴尚未成形,不冒充通过判定
    const burn = !!(ep.sbConfig && ep.sbConfig.subtitle);
    const hits = [];
    let texted = 0;
    segs.forEach(sg => {
      const chars = sg.text.replace(/\s/g, '').length;
      if (!chars) return;
      texted++;
      const dur = sg.dur > 0 ? sg.dur : 0;
      const at = { shotId: sg.id, order: sg.order, chars, dur };
      if (burn && chars > Domain.SUB_BURN_MAX) hits.push(Object.assign({ code: 'caption-truncated', limit: Domain.SUB_BURN_MAX }, at));
      else if (chars > CAP_ONE_SCREEN) hits.push(Object.assign({ code: 'caption-too-long', limit: CAP_ONE_SCREEN }, at));
      if (dur > 0 && chars / dur > CAP_CPS) hits.push(Object.assign({ code: 'read-too-fast', cps: Math.round(chars / dur * 10) / 10, limit: CAP_CPS }, at));
      if (dur < CAP_MIN_DUR) hits.push(Object.assign({ code: 'caption-flash', limit: CAP_MIN_DUR }, at));
    });
    if (burn && !texted) hits.push({ code: 'no-caption-track', shotId: '', order: 0, chars: 0, dur: 0, limit: 0 });
    const level = hits.some(h => h.code === 'caption-truncated') ? 'fail' : hits.length ? 'warn' : 'info';
    return { pass: !hits.length, level, hits };
  };

  /* ---- 成片段交付契约基面(SK-29 交付契约门):判定输入是板块定稿链与主线产物实况 ----
   * 板块看板把主线每一步登记成一个板块,阶段落 p.boards[板块名].stage(未开始/进行中/待审核/已定稿);
   * 已定稿板块的内容此前只经助手上下文注入下游板块(「上游已定稿,权威约束,不得偏离」)——
   * 那是给模型的文本约束,不是可判定的门(S-07)。本面把它判成结论,两向各判一件事:
   * 契约优先级(下游定稿须由上游定稿背书)与定稿的产物背书(定稿背书的那一步实况得站得住)。
   * 板块名与链序现取本模块 STAGES 主线七步表(七步的 name 逐字就是那七个板块键),不写第二份板块词表;
   * 产物实况现取 Domain.workflow 的同键步骤(与流程条、发布门 G1 同一份推导),不写第二份就绪判定;
   * 阶段取值是持久化字段值(与助手侧上游定稿传导判的是同一字面),不是本层另存的词表。
   * 看板另有一个支线板块(导演定调)不在主线七步表里,本面不判它——支线不在主线契约链上,
   * 也不为它在本层另存一份板块词表;Domain.workflow 那四个支线步(制片/导演/剧壳/切片)同理不在链上。
   * 判定范围因此窄于看板改阶段那一刻的软闸门(它按看板全序提醒,含导演板块),条目 note 写明。
   * 与其余段同纪律:纯本地读字段、零 LLM 零计费,结论一律 warn 只报不拦——不进 blockers、
   * 不改发布门 G1–G10 的 fail/warn 计数与 overall、不改交付打包行为。 */
  const BOARD_FINAL = '已定稿';
  const BOARD_AUDIT = '待审核';
  const boardStageOf = (p, board) => String(((p.boards || {})[board] || {}).stage || '');

  /* SK-29 交付契约门(上游定稿契约的校验半):逐个主线板块看这份契约立不立得住。
   *   final-out-of-order  已定稿板块的主线上游还有未定稿板块 → warn(契约优先级倒置:注入给下游的
   *                       「上游已定稿」缺环,本板块的定稿背书的是一份尚未定稿的上游)
   *   audit-out-of-order  待审核板块的主线上游还有未定稿板块 → warn(同一条优先级口径的较轻一档:
   *                       上游还会变,本板块的审核结论可能返工)
   *   final-unbacked      已定稿板块对应的主线步骤实况未 done → warn(定稿背书的产物不成立;
   *                       name 取该步首条阻塞文案,无阻塞项时给该步实况状态词)
   * 一个板块都没登记过阶段的项目没有契约链,无判定输入,不产出结论(没在用看板不算缺陷)。
   * 定稿的内容对不对、契约本身该怎么写这类语义判断仍归 LLM 审片(G-10);
   * 方法论门要不要进发布门(挂成默认 warn 的可选门)的产品口径未定,本面不改门禁一个字。 */
  CHECKS['film.upstreamFinalContract'] = function (obj, ctx) {
    const o = obj || {};
    const p = o.p;
    if (!p) return { pass: true, level: 'info', hits: [] };
    const chain = STAGES.map(x => ({ step: x.key, board: x.name, stage: boardStageOf(p, x.name) }));
    if (!chain.some(x => x.stage)) return { pass: true, level: 'info', hits: [] }; // 契约链未启用,无判定输入
    const hits = [];
    const push = (code, x, i, name, stage) => hits.push({ code, board: x.board, step: x.step, order: i + 1, name, stage });
    chain.forEach((x, i) => {
      if (x.stage !== BOARD_FINAL && x.stage !== BOARD_AUDIT) return;
      const up = chain.slice(0, i).find(u => u.stage !== BOARD_FINAL);
      if (up) push(x.stage === BOARD_FINAL ? 'final-out-of-order' : 'audit-out-of-order', x, i, up.board, up.stage || '未开始');
    });
    if (chain.some(x => x.stage === BOARD_FINAL)) {
      const steps = Domain.workflow(p, !!(ctx || {}).online).steps;
      chain.forEach((x, i) => {
        if (x.stage !== BOARD_FINAL) return;
        const st = steps.find(w => w.key === x.step);
        if (!st || st.done) return;
        push('final-unbacked', x, i, ((st.blockers || [])[0] || {}).label || '', st.status || '');
      });
    }
    return { pass: !hits.length, level: hits.length ? 'warn' : 'info', hits };
  };

  /* ---- 分集段校验宿主(S-01 分集半):判定输入是分集表本身 ----
   * 两条都要集序:六阶段覆盖看全表按比例摊到六段后每段有没有判得动的正文,付费卡点看集尾与下一集集首——
   * 故一律现取 p.episodes(集序取数组序,与 Domain 同口径),取不到集序即无判定输入,不冒充结论。
   * 判定基面与判定下限沿用剧本段:去空白正文、短于 SCRIPT_MIN 的集视为无正文。
   * 与剧本段同纪律:纯本地词法命中、零 LLM、零计费,结论一律 warn 不升 fail;
   * 阶段配比是否得当、卡点掐得准不准这类语义判断仍归 LLM 审片(G-10),本层不冒充。 */
  const epsOf = o => (o && o.p && o.p.episodes) || [];
  const epText = e => compact(e && e.content);

  /* SK-14 六阶段结构覆盖:KB「六阶段结构」的六段区间(开篇期 1-10 集 … 结局期 86-100 集)现取条目正文解析,
   * 本层不写第二份段名与区间;条目「集数少按比例缩放」落到当前集数上,按累计边界四舍五入摊成不重叠区间。
   *   stage-uncovered   该段区间内没有一集有判得动的正文 → warn(这一段弧线在分集表上是空的)
   *   stage-thin        该段正文字数不足按集数摊到的份额三分之一 → warn(有集但被压成过场)
   *   early-no-reversal 开篇期区间内找不到反转信号 → warn(条目「前3集必须出现第一个大反转」)
   * 集数少于六段时按比例缩放必把某段摊成零集,无判定输入,直接不产出结论。 */
  const STRUCT_STAGES = (() => {
    const re = /([\u4e00-\u9fa5]{2}期)[((](\d+)-(\d+)/g;
    const t = String(KB.section('六阶段结构') || '');
    const out = [];
    for (let m = re.exec(t); m; m = re.exec(t)) out.push({ name: m[1], from: +m[2], to: +m[3] });
    return out;
  })();
  /* 反转信号词:反转五式五类各取其字面可判定的信号(身份/立场/真相/感情/命运反转) */
  const REVERSAL_SIGNALS = [
    '反转', '逆转', '翻盘', '其实', '原来', '竟然', '居然', '没想到', '真相', '假的', '骗',
    '冒充', '身份', '揭穿', '揭露', '曝光', '背叛', '出轨', '幕后', '摊牌', '翻脸', '认错',
  ];
  const THIN_RATIO = 3; // 份额的几分之一算被压成过场:取三分之一,分集长度天然不均,宁可漏判也不制造噪音
  CHECKS['eps.stageCoverage'] = function (obj) {
    const eps = epsOf(obj);
    if (STRUCT_STAGES.length < 2 || eps.length < STRUCT_STAGES.length) return { pass: true, level: 'info', hits: [] };
    const n = eps.length;
    const len = eps.map(e => epText(e).length);
    const total = len.reduce((a, b) => a + b, 0);
    const arc = STRUCT_STAGES[STRUCT_STAGES.length - 1].to; // 条目给的全剧刻度(1-100)
    const bound = x => Math.round(x * n / arc);
    const hits = [];
    STRUCT_STAGES.forEach((st, i) => {
      const from = bound(st.from - 1) + 1, to = Math.max(from, bound(st.to));
      const idx = [];
      for (let k = from; k <= to; k++) idx.push(k - 1);
      const base = { stage: st.name, from, to };
      const sum = idx.reduce((a, k) => a + len[k], 0);
      if (!idx.some(k => len[k] >= SCRIPT_MIN)) { hits.push(Object.assign({ code: 'stage-uncovered', len: sum }, base)); return; }
      if (sum * THIN_RATIO < total * idx.length / n) hits.push(Object.assign({ code: 'stage-thin', len: sum }, base));
      if (i > 0) return; // 「前3集必须出现第一个大反转」只约束开篇期
      const head = idx.map(k => epText(eps[k])).join('');
      const sig = firstOf(head, REVERSAL_SIGNALS);
      if (sig.at < 0) hits.push(Object.assign({ code: 'early-no-reversal', len: sum }, base));
    });
    return { pass: !hits.length, level: hits.length ? 'warn' : 'info', hits };
  };

  /* SK-15 付费卡点位置:KB「付费卡点」的"卡在情绪最高那一拍——反转即将揭晓、爽点即将兑现的前一秒"与
   * "卡点之后第一集立刻兑现"落到集与集之间——卡点位置就是集尾,兑现位置就是下一集集首。
   *   flat-ending       集尾窗口内一个卡点信号都没有,而本集别处有 → warn(情绪最高拍写在集中段,卡点没落在集尾)
   *   payoff-not-cashed 集尾有卡点信号,下一集开篇窗口却找不到兑现信号 → warn(承诺的爽点落空)
   * 末集不判 flat-ending(全剧收束不需要再卡);全集一个信号都没有的段落归剧本段结论(SK-07),此处不重复报;
   * 下一集正文短于判定下限时不判兑现(无判定输入)。两组词表都不新写:
   * 卡点信号 = 冲突信号(SK-07 那套)+ 反转信号(SK-14 那套),情绪最高那一拍的字面就是这两类;
   * 兑现信号 = 打脸四步的反击/释放两步词表,爽点兑现的字面就是那两步。 */
  const PAYOFF_TAIL = 120; // 集尾窗口字数(去空白):与开篇窗口同一口播口径,覆盖结尾十余秒
  const PAYOFF_SIGNALS = HOOK_SIGNALS.concat(REVERSAL_SIGNALS);
  const CASH_SIGNALS = FACESLAP_STEPS.slice(2).reduce((a, g) => a.concat(g.words), []);
  CHECKS['eps.payoffPlacement'] = function (obj) {
    const o = obj || {};
    const eps = epsOf(o);
    if (!eps.length) return { pass: true, level: 'info', hits: [] };
    const pick = o.ep ? eps.filter(e => e === o.ep || (e.id && e.id === o.ep.id)) : eps;
    const hits = [];
    pick.forEach(e => {
      const i = eps.indexOf(e);
      const t = epText(e);
      if (t.length < SCRIPT_MIN) return;
      const order = i + 1;
      const sig = firstOf(t.slice(-PAYOFF_TAIL), PAYOFF_SIGNALS);
      if (sig.at < 0) {
        const back = lastOf(t, PAYOFF_SIGNALS);
        if (i + 1 < eps.length && back.at >= 0) hits.push({ code: 'flat-ending', epId: e.id, order, at: back.at, name: back.word });
        return;
      }
      const nt = epText(eps[i + 1]);
      if (nt.length < SCRIPT_MIN) return;
      if (firstOf(nt.slice(0, HOOK_HEAD), CASH_SIGNALS).at < 0) {
        hits.push({ code: 'payoff-not-cashed', epId: e.id, order, next: order + 1, name: sig.word });
      }
    });
    return { pass: !hits.length, level: hits.length ? 'warn' : 'info', hits };
  };

  /* 短名单 30 条内部能力(SK-01…SK-30):id 取 `stage.name` 形态,与 SK 编号一一对应。
   * covers 写该能力实际作用到的主线步骤(缺省=stage 本身);gaps 记该条已知贯通缺口编号(G-xx 图谱既有,S-xx 本轮新登记)。 */
  const REG = [
    /* ---- 贯通层 ---- */
    {
      id: 'core.stageIndex', sk: 'SK-01', name: '主线步骤方法论索引', stage: CROSS, wave: 'W2', kinds: ['infra'],
      kb: ['编剧八律', '六阶段结构', '钩子六型', '反转五式', '打脸四步', '付费卡点', '对话铁律',
        '人物体系', '剧本诊断', '文案AI味', '场面调度', '景别运镜', '轴线匹配', '剪辑节奏',
        '抽卡公式', '抽卡军规', '多镜头写法', '主体参考'],
      kbBlocks: ['block', 'reviewBlock'], gaps: ['G-08', 'G-15'],
      note: '索引宿主本身:KB 全条目在此登记一次(契约断言,漏登即红),各步条目只引用自己那几条;本条不进 block() 拼块',
    },
    {
      id: 'core.expertSkillRef', sk: 'SK-02', name: '专家条目挂能力引用', stage: CROSS, wave: 'W2', kinds: ['infra'],
      prompts: ['forge.system'],
      experts: ['ex_suspense', 'ex_sweet', 'ex_hotblood', 'ex_healing', 'ex_cinema', 'ex_narration', 'ex_revenge',
        'ex_power', 'ex_planner', 'ex_localize', 'ex_hook', 'ex_pleasure', 'ex_dialogue', 'ex_structure', 'ex_dp',
        'ex_editor'],
      gaps: ['G-09'],
      note: '专家→能力反查出口 Skills.forExpert(id);专家条目侧的 skills[] 正向字段待 G-09。'
        + '自定义专家的铸造口(专家工坊锻造器)人设句已收编为独立键 forge.system,取值口在 js/experts.js'
        + '(gsettings 工坊页仍只引用 Experts.FORGE_SYS 这一个常量,消费侧一行未改),浏览器隐式读全局默认值页的覆盖表;'
        + '它只有浏览器一个消费点,收编解决的是可覆盖不是可 headless。'
        + '仍欠:锻造器那份严格 JSON 的字段面与改稿规则仍写死在调用点、不开放覆盖'
        + '(用户改坏 normExpertDraft 就取不到 name/persona,整轮生成失败);'
        + '且那份字段面里同样没有 skills[] —— 工坊铸出的专家从出生起就挂不上能力引用,与 G-09 是同一个缺口的两头',
    },
    {
      id: 'core.personaCtx', sk: 'SK-03', name: '生效人设经 ctx 过服务端', stage: CROSS, wave: 'W3',
      kinds: ['infra'],
      prompts: ['split.system', 'extract.system', 'digest.planSystem', 'graph.system', 'sb.boardSceneSystem', 'sb.boardDraftSystem', 'sb.system', 'sb.reviewSystem', 'und.system', 'review.system', 'review.userSystem', 'review.sumSystem', 'review.finalSystem',
        'agent.system', 'agent.panelSystem', 'agent.drawerSystem', 'agent.previsSystem', 'agent.selfFixSystem', 'agent.compactSystem',
        'narration.system', 'reading.system', 'concept.system', 'light.system',
        'voice.recommendSystem', 'voice.recommendBatchSystem', 'comic.bubbleSystem', 'dirset.system', 'dist.copySystem',
        'rip.system', 'gen.editSystem', 'persona.editSystem', 'plan.system', 'agent.routeSystem', 'planner.chatSystem', 'trans.localizeSystem'],
      cmds: ['episode.understanding', 'episode.generateStoryboard', 'episode.smartReview'], gaps: ['G-01'],
      note: 'G-01 已落地:服务端 /api/wf/* 各端点经唯一装配口 wfPersonaNote 注入生效人设(板块雇佣 > 全局雇佣),'
        + '浏览器同装配口;infra 面的 pending 已按实况清空(gaps() 只投影 gaps 字段、不看 pending,清账动不到投影),'
        + '缺口标记按关联索引口径保留。审片侧三步的人设通道已补齐——分镜评审 sb.reviewSystem 随分镜板块 ctx、'
        + '四维成片评审 review.finalSystem 与整集共性汇总 review.sumSystem 随成片板块 ctx,'
        + '三步的 user 模板经 WfCore.reviewCtxNote 统一拼注入段,两端同口径且未雇佣时逐字节不变;'
        + '共性汇总与剧本拆集的人设句都已收进注册表,两端同经 Prompts.get 取值、缺省逐字节不变;'
        + '主体提取的人设句同形收编为 extract.system,装配口 WfCore.extractSystem 随之收覆盖表参数,'
        + '五条工作流(拆集/本集理解/智能分镜/智能审片/提取主体)的 system 半至此全部可被用户覆盖;'
        + 'Agent 单轮对话步的人设句同形收编为 agent.system,装配口 WfCore.buildAgentSystem 随之收覆盖表参数,'
        + '/api/wf/* 六个 LLM 端点的人设句至此全部在注册表内;'
        + '浏览器多轮三份人设同形收编为三条独立键(分集面板 agent.panelSystem/全局抽屉 agent.drawerSystem/'
        + '预排模式 agent.previsSystem——三种运行模式措辞不同,不合成一个键),装配口分别是 AgentCore.panelSystem/'
        + 'AgentG.buildGlobalPrompt/agent-ops 的 prearrPrompt,浏览器隐式读全局默认值页的覆盖表,'
        + '单轮与多轮的人设句至此全部在注册表内。'
        + '剧本模块四步(旁白解说体改写 narration.system/剧本围读 reading.system/构思导演阐述 concept.system/'
        + '全剧光影总控 light.system——四步角色互不相同,四条独立键)同形收编,取值口都在 js/episodes.js 经 Prompts.get,'
        + '这四条与多轮那三条同口径:只有浏览器一个消费点,收编解决的是可覆盖不是可 headless。'
        + '音色推荐两步(按人设推单个音色/全部角色批量推)的人设句同形收编为两条独立键'
        + '(voice.recommendSystem/voice.recommendBatchSystem——两处 def 逐字节相同仍不合并:'
        + '键位是持久化面,合成一条再拆回来会废掉已写的覆盖,且批量那步要顾角色间的音色区分度),'
        + '取值口就在调用点 Persona.recommendVoice/recommendVoicesBatch,浏览器隐式读全局默认值页的覆盖表。'
        + '剧本摘要链路(EpisodeUtil.aiScriptDigest)通读/汇总/集纲三步同一句策划人设,收编为一条 digest.planSystem 键、'
        + '三个 Prompts.get 取用口(三处字面逐字节相同,不拆三键),末步人物小传是另一个角色仍同 extract.system。'
        + '分镜脚本创作层两步的人设句同形收编为两条独立键(场次节拍拆解 sb.boardSceneSystem/'
        + '文字分镜拆解 sb.boardDraftSystem——编剧与分镜师两个角色,措辞与产物落点都不同,不合成一个键),'
        + '两步在 js/sb-board.js 同经 Prompts.get 取值、缺省逐字节不变,'
        + '与多轮那三份同为只有浏览器一个消费点的键(用户在「全局默认值」页改得到)。'
        + '分集页事件图谱拆解步的人设句同形收编为独立键 graph.system(取值口在 js/episodes.js 就地经 Prompts.get,'
        + '浏览器隐式读全局默认值页的覆盖表);它与多轮那三条同口径:只有浏览器一个消费点,收编解决的是可覆盖不是可 headless。'
        + '对话面之外另收了一处:漫剧编辑器 AI 生成对白步的人设句成键 comic.bubbleSystem,'
        + '装配口在 js/editors.js 就地拼(人设句 + 契约半),浏览器隐式读覆盖表、缺省逐字节不变。'
        + '导演设定五维的 AI 生成步(js/gsettings.js 的 genDirectorSetting)同形收编为 dirset.system,'
        + '取值口经 Prompts.get 隐式读覆盖表、与前四条同口径(纯浏览器链路,只解决可覆盖);'
        + '该键不与 und.system 复用——两句差「影视/短剧」两字,角色与产物落点都不同;'
        + 'js/gsettings.js 至此零内联人设(工坊元智能体那份人设字面在 js/experts.js,不在本文件名下)。'
        + '剧壳发行文案包那步(js/proj-shell.js 的 AI 文案包)的人设句同形收编为 dist.copySystem,'
        + '取值口经 Prompts.get,其后按键接的 KB 钩子六型+付费卡点仍由取值口现拼(方法论正文不随覆盖变动),'
        + '同为纯浏览器链路的一个消费点。'
        + '拉片建集逐段画面理解那步的人设同形收编为 rip.system,取值口在 js/proj-upload.js 经 Prompts.get,'
        + '与剧本拆集并列为建分集的两条入口(同样只有浏览器一个消费点)。'
        + '镜头「按指令改」那步的人设同形收编为 gen.editSystem(取值口在 js/sb-views.js 经 Prompts.get),'
        + '与同层四策略优化的 gen.promptSystem 有意不合并——那条经装配口还要接 KB 抽卡块,复用即改变缺省。'
        + 'Agent 对话闭环的两个辅助步同形收编为两条独立键(执行回执核验修复 agent.selfFixSystem/'
        + '会话纪要蒸馏 agent.compactSystem——两句 def 逐字节不同、角色也不同,不共用一键),'
        + '取值口都在 js/agent-ops.js 的 selfFixRound/compactChat 就地经 Prompts.get,'
        + 'js/agent-ops.js 的内联人设至此归零。'
        + '主体编辑页「按指令改」那步的人设句同形收编为独立键 persona.editSystem(取值口在 js/role-editor.js 就地经 '
        + 'Prompts.fill 填主体类别变量 {kind};分镜那侧同形入口的角色与产物落点都不同,不合成一条)。'
        + '制作计划 LLM 规划步(js/plans.js generate)的人设句同形收编为独立键 plan.system——角色是"制作计划器",'
        + '出的是按序可执行的步骤表而不是对话回复,故不与对话四条(单轮/分集面板/全局抽屉/预排)合成一个键;'
        + '取值口就在该步经 Prompts.get,同为只有浏览器一个消费点的键。'
        + '全局抽屉的意图路由辅助步(js/agent-global.js 的 routeIntent,step:route)人设句同形收编为 agent.routeSystem,'
        + '取值口在函数体内经 Prompts.get 现取(写成模块顶层常量会把覆盖表冻在加载那一刻),'
        + '板块清单按 AGENT_BOARDS 现拼、判据句与 {"board","reason"} 返回契约仍留在装配口不开放覆盖;'
        + 'js/agent-global.js 至此零内联人设(该文件另有两句上下文框定语不在本判据内:'
        + '全局任务上下文块尾那句与板块协作那句都是随实况现拼的装配半,与 ops 协议同不开放覆盖)。'
        + '项目实验台两步(js/proj-planner.js 的 AI 策划对话/剧本译制)的人设句同形收编为两条独立键'
        + '(planner.chatSystem/trans.localizeSystem——两处 def 字面不同,故不共用一个键),'
        + '策划那步取值口经 Prompts.get、其后的「当前项目信息:」上下文仍由取值口现拼,'
        + '译制那步经 Prompts.fill 按 {market}/{lang} 填目标市场与语言;'
        + 'js/proj-planner.js 至此零内联人设,两键同为纯浏览器链路的一个消费点。'
        + '单镜审片那一步的提示词首句人设(WfCore.buildReviewPrompt 的 user 半开头)同形收编为 review.userSystem,'
        + '装配口随之收覆盖表参数(浏览器 js/review.js 不传、由 Prompts.get 隐式读,服务端 /api/wf/smart-review 显式传),'
        + '该键不与同步发出的 review.system 复用——一条在 system 消息位、一条是提示词首句,措辞与三维交代都不同;'
        + 'js/wf-core.js 至此零内联人设。'
        + '仍欠:四处的 ops 协议/字段面/命令白名单/返回 JSON 约定仍由各自装配口拼、不开放覆盖'
        + '(那半是 ops 解析契约,用户改坏即整轮无 ops);'
        + '音色推荐两条同理只收人设句——音色库取值范围与返回 JSON 约定仍写在各自调用点、不开放覆盖'
        + '(用户改坏即推荐值落不回音色库,只能退随机);'
        + '漫剧气泡那处同口径——返回 JSON 形状与 type 词表是解析判据,同样只收人设句不开放契约半;'
        + '剧本译制那处同口径——「第X集」分集标记是「应用译制结果」按标记拆分的判据,'
        + '那一条留在取值口常量 TRANS_CONTRACT、不开放覆盖(用户改坏即整轮译制一集都写不回);'
        + '该步也不过本条的 ctx 通道(编辑器工具步不注入生效人设与协作记忆,只是人设句进了注册表);'
        + '主体按指令改那条同理只收人设句——主体名/项目风格/当前设定提示词的摘取与返回 JSON 约定仍写在调用点、'
        + '不开放覆盖(用户改坏即改写结果落不回设定提示词);'
        + '制作计划那条同理只收人设句——可用领域命令白名单与返回 JSON 的 title/steps 契约仍就地拼、不开放覆盖'
        + '(用户改坏即整轮拆不出有效步骤,该步 1 积分失败退费);'
        + '多轮那三份与音色推荐两份都没有 Node 第二消费点,两端只落在取值口'
        + '(同一注册表键 + Prompts.get 读覆盖),不是两个消费点',
    },
    {
      id: 'core.memoryDual', sk: 'SK-04', name: '长期记忆双端与召回纯函数', stage: CROSS, wave: 'W3',
      kinds: ['infra'], gaps: ['G-02'],
      note: 'G-02 已落地:召回策略(同板块最近若干 + 全局最近若干)已抽为 WfCore.memRecall/memBlock 双端同用,'
        + '写入面浏览器「记住…」与 CLI memory add 同结构同上限、MCP 只读资源同链路;记忆种子不在 KB 条目面;'
        + 'infra 面的 pending 已按实况清空,缺口标记按关联索引口径保留(G-02 另由 SK-26 的回流面持有)。'
        + '审片侧三步的记忆召回已补齐(与 SK-03 同三步同 ctx:分镜评审按集标题走分镜板块,集级两步按集标题走成片板块)。'
        + '补种与板块迁移已下沉 WfCore.memSeed/memMigrateBoard 双端单源:浏览器 memAll 与 headless'
        + '(/api/wf/memory-seed + CLI memory seed|migrate + MCP 同名工具)吃同一份种子表与迁移表,'
        + '空板/未知板名如实报错不静默空成功。'
        + '自动沉淀本轮结论(那一面归 SK-26 的回流面)现覆盖主线六个闭环:审片、发布,'
        + '加前段四步理解/分镜/拆集/提取主体——四步各按自己那一步的板块写回同一个 state.agentMemory。'
        + '浏览器剧本解析向导那条绕过回流的入库路径已收掉:向导 Step1 的提取与入库改经 '
        + 'Commands.execute(project.extractSubjects),与 CLI exec 同一份合并口径与同一处回流点'
        + '(提取主体的回流点仍只在命令层——端点只出候选不写回 state,入库口径归调用方,回流就该挂在入库那一步)。'
        + '仍欠一处覆盖余量:生成与合成两步没有可判定的结构化结论可回流'
        + '(素材产出的判定面归发布门 G4 过期镜 / G5 未确认镜 / G6 失败镜与问题中心 failed-shots;'
        + 'G3 判审片均分、G7 判合规敏感词且不在 headless 七门内,两者都不判素材产出);'
        + '播种是显式动作(headless 侧不在读记忆时自动跑,免得读一次写一次盘)',
    },
    {
      id: 'core.playbookProjection', sk: 'SK-05', name: 'playbook 由注册表投影', stage: CROSS, wave: 'W4',
      kinds: ['orchestrate'],
      steps: [
        { cmd: 'project.extractSubjects', args: {}, note: '提取主体:整部剧本先立主体库,下游每镜才锁得住参考' },
        { cmd: 'subject.generateImage', args: {}, note: '主体生图:缺参考图的主体补齐真实图,主体步才算齐备' },
        { cmd: 'project.splitEpisodes', args: {}, note: '剧本拆集:整本切成分集,拿到集 id 后转入集内各步' },
        { cmd: 'episode.understanding', args: {}, note: '本集理解:先出人物/情绪/场景口径' },
        { cmd: 'episode.generateStoryboard', args: {}, note: '智能分镜:按理解口径拆镜' },
        { cmd: 'episode.preflight', args: {}, note: '就绪检查:出片前把各面校验结论过一遍(零 LLM 零计费,只报不拦)' },
        { cmd: 'episode.generateVideos', args: {}, note: '批量生成:整集出片,未确认镜如实跳过' },
        { cmd: 'episode.smartReview', args: {}, note: '智能审片:逐镜评审 + 共性汇总 + 四维成片评审' },
        { cmd: 'episode.compose', args: {}, note: '合成成片:拼接并写回软字幕' },
      ],
      gaps: ['G-12'],
      note: '编排型条目的步骤投影出口 Skills.playbooks();本条自己的 steps 是主线全链投影——'
        + '按 Domain.workflow 的主线步序(主体→分集→分镜→生成→审片→成片)把已注册领域命令串成一条端到端步骤表,'
        + 'SK-16 前段四步是它的前段子序列,SK-25/SK-30 各持审片修订与一键成片两段;cmds 由 steps 推出不写第二份。'
        + 'args 一律留空:授权位(拆集 overwrite、批量生成 confirmAll、合成放行 riskyCompose)与'
        + '模式位(拆集 local、提取 mode、子集 shotIds/subjectIds)属调用方决策,编排层只给步序不预设授权。'
        + '两条命令有意不进本链:shot.generateVideo 是断点补拍不是主线一步(登记在 SK-11/SK-21/SK-22),'
        + 'episode.produce 是生成→审片→合成三步的聚合(登记在 SK-29/SK-30),与本链并列而非串进本链——'
        + '故本条不再手写全量 cmds,全部领域命令仍被索引覆盖由契约断言反查。'
        + '制作计划的步骤已改由本投影生成(js/plans.js fromWorkflow:命令名与步序现取本条 steps,'
        + '每步只在计划层登记"当下待不待办"的状态取材器,需要授权或人工挑选的状态出导航步不代授权);'
        + '计划层另一条生成路径(js/plans.js generate:1 积分按用户目标 LLM 拆步)有意不切本投影——'
        + '它拆的是用户自己那个目标而不是主线全链,故只受命令注册表钳制(cmd 必须已注册),'
        + '人设句收在注册表键 plan.system 名下(登记在 SK-03);'
        + 'MCP 中段流程模板也由本投影切片(js/flow-tpl.js 按主体/分集/分镜/生成四段取本条 steps 的有序切片,'
        + '每步补"参数从哪取"与"断点在哪一码",经 cli flow-template 与 MCP 工具/提示模板出口,只读零计费不代授权)。'
        + 'G-12 的第三个落点也已接上:发布留痕收进命令注册表成 project.release(浏览器按钮/CLI/服务端端点/MCP 同名同结构),'
        + '编排层现在为它挂得出命令名(登记在 SK-25/SK-26)。本链步序仍止于合成成片——'
        + '发布留痕是整条主线跑完之后的收尾动作,不是主线的第七步,故不串进本投影,'
        + '制作计划与中段流程模板也就不为它出步(两处都只切本投影,口径自动一致)',
    },
    /* ---- 剧本 ---- */
    {
      id: 'script.hookType', sk: 'SK-06', name: '开篇钩子选型注入', stage: 'script', wave: 'W2', kinds: ['inject'],
      kb: ['钩子六型', '编剧八律'], experts: ['ex_hook'], gaps: ['G-13', 'G-04'],
    },
    {
      id: 'script.hookStrength', sk: 'SK-07', name: '开篇钩子强度校验', stage: 'script', wave: 'W4',
      kinds: ['check'], kb: ['钩子六型'], checks: ['script.openingHookAnchor'],
      cmds: ['episode.preflight'], experts: ['ex_hook'], gaps: ['G-10', 'G-04', 'S-01'],
      note: '只判开篇窗口内有无冲突锚点(本地词法、零 LLM),不判钩子选型好坏——'
        + '钩型优劣属审片维度,待 G-10;经就绪检查与问题中心消费,结论只报不拦',
    },
    {
      id: 'script.faceslapFour', sk: 'SK-08', name: '打脸四步完备性校验', stage: 'script', wave: 'W4',
      kinds: ['check'], kb: ['打脸四步', '反转五式'], checks: ['script.faceslapStepOrder'],
      cmds: ['episode.preflight'], experts: ['ex_pleasure'], gaps: ['G-10', 'G-04', 'S-01'],
      note: '四步词序与 KB 条目同序;命中步数不足即判本集非打脸段落,不产出结论('
        + '不是每集都该有打脸);篇幅配比(40%/30%/30%)与爽点强度递进属审片维度,待 G-10',
    },
    {
      id: 'script.dialogueRule', sk: 'SK-09', name: '对白铁律注入与单句长度校验', stage: 'script',
      covers: ['script', 'shots'], wave: 'W2', kinds: ['inject', 'check'],
      kb: ['对话铁律', '人物体系'], prompts: ['sb.system'], checks: ['script.dialogueLineLength'],
      cmds: ['episode.generateStoryboard', 'episode.preflight', 'episode.smartReview'],
      experts: ['ex_dialogue'], gaps: ['G-15', 'G-10', 'S-01'],
      note: '注入面 W2 落地;校验面判剧本正文引号台词与分镜 s.dialogue 两处载体的单句长度,'
        + '阈值现取 KB「对话铁律」正文不写第二份数字;经就绪检查、问题中心与审片报告消费——'
        + '审片路径只读附本镜命中(独立字段,不并入 issues、不改三维/四维评分与达标线);'
        + '潜台词/说明文式台词等语义面属审片维度,待 G-10',
    },
    {
      id: 'script.aiToneBan', sk: 'SK-10', name: '文案 AI 味硬禁与痕迹检出', stage: 'script',
      covers: ['script', 'shots'], wave: 'W4', kinds: ['inject', 'check'],
      kb: ['文案AI味'], checks: ['script.aiVoiceTrace'], cmds: ['episode.preflight', 'episode.smartReview'],
      experts: ['ex_dialogue'], gaps: ['G-13', 'G-10'],
      note: '注入面 S-02 落地:条目正文自撰后进 KB 单源(「文案AI味」),落点是剧本板块方法论注入清单;'
        + '校验面只做本地词法命中(套话硬禁词、台词书面腔、修饰副词密度),零 LLM 零计费——'
        + '三张词表与每千字上限一律现取该条目正文,校验层不写第二份词表,注入与校验两面同一份判据;'
        + '两处载体与 SK-09 同(剧本正文引号台词与分镜 s.dialogue),'
        + '经就绪检查、问题中心与审片报告消费,审片路径只读附本镜命中(独立字段,不并入 issues、不改评分与达标线);'
        + '有没有人味、像不像这个人物说的话属语义面,待 G-10。'
        + '本条注入走板块方法论通道、没有专属人设句;剧本板块那四步内联人设已收进注册表——'
        + '旁白解说体改写 narration.system/剧本围读 reading.system/构思导演阐述 concept.system/全剧光影总控 light.system,'
        + '四步在 js/episodes.js 同经 Prompts.get 取值、用户在「全局默认值」页改得到(键登记在 SK-03 名下)。'
        + 'js/episode-util.js 剧本摘要的通读/汇总/集纲三步(策划人设)同形收编为一条 digest.planSystem 三个取用口,'
        + '同板块的事件图谱拆解步内联人设已收进注册表(独立键 graph.system,取值口在 js/episodes.js 逐集拆解那步)'
        + '——剧本模块两个文件的内联人设至此归零;'
        + 'js/agent-ops.js 的执行核验器与会话纪要整理器同形收编为 agent.selfFixSystem/agent.compactSystem 两条独立键,'
        + '该文件的内联人设也随之归零。'
        + 'js/experts.js 专家工坊那两处(锻造器与进化器)同形收编为 forge.system/forge.evolveSystem,该文件也随之归零。'
        + 'js/plans.js 制作计划 LLM 规划步的人设句同形收编为 plan.system,该文件也随之归零。'
        + 'js/agent-global.js 全局抽屉的意图路由辅助步同形收编为 agent.routeSystem,该文件也随之归零。'
        + 'js/proj-planner.js 项目实验台的 AI 策划对话与剧本译制两步同形收编为 planner.chatSystem/trans.localizeSystem,'
        + '该文件也随之归零——按「system:/content:/= 后紧跟人设句」这一口径全仓余量至此为零。'
        + '单镜视频审片(js/wf-core.js 的 buildReviewPrompt)那句写在 user 半开头的人设也已收编为 review.userSystem,'
        + '判据更宽那张名单最后计着的一处随之归零——主线各步的装配口至此再无内联人设。'
        + '仍欠 G-13 的已不在任何一步的装配口上,而是 API 层那两处兜底缺省:'
        + 'js/api.js 的 chatJSON/chatJSONRobust 在调用方不给 system 时垫「你是专业助手。」,'
        + '它不属于任何一步、不在注册表里,用户既取不到也覆盖不到,故缺口未闭合、标记不摘',
    },
    /* ---- 主体 ---- */
    {
      id: 'subjects.refDiscipline', sk: 'SK-11', name: '主体参考纪律注入与生成前置校验', stage: 'subjects',
      covers: ['subjects', 'gen'], wave: 'W4', kinds: ['inject', 'check'],
      kb: ['主体参考'], prompts: ['extract.system', 'persona.promptSystem'], settings: ['tplImage'],
      checks: ['subjects.genRefDiscipline'],
      cmds: ['episode.preflight', 'shot.generateVideo', 'subject.generateImage'],
      gaps: ['G-13'],
      note: '注入面落在主体步系统人设 WfCore.extractSystem(浏览器解析向导与 /api/wf/extract-subjects 同一份),'
        + '本条拼块即该条目正文;人设句已在注册表——主体步取 extract.system,'
        + '另一登记键 settings.tplImage 的取用点(js/persona.js 八维度重写文生图提示词那步)取 persona.promptSystem,'
        + '两处装配口都经 Prompts.get 取值、用户在「全局默认值」页改得到(模板本身也一直改得到),'
        + '故本条自己的登记面已无收编余量;剧本模块那几步、Agent 对话闭环的辅助两步与专家工坊那两步都已收编。'
        + '单镜视频审片 js/wf-core.js 的 buildReviewPrompt 那句 user 半首句人设也已收编为 review.userSystem,'
        + '主线各步的装配口至此再无内联人设。'
        + '仍欠 G-13 的不在本条名下、也不在任何一步的装配口上:剩的是 js/api.js 的 chatJSON/chatJSONRobust '
        + '在调用方不给 system 时垫的那两处兜底缺省(「你是专业助手。」),它不在注册表里、用户覆盖不到,'
        + '缺口未闭合故按关联索引口径不摘标记。'
        + '生成请求构造点(Domain.buildVideoRequest)不注方法论文本,生成指纹口径不动;'
        + '校验半判定输入就是那份请求的参考图组(人物数上限、被上限挤出、三视图当视频参考),'
        + '经就绪检查双端消费,结论只报不拦、不改生成动作',
    },
    {
      id: 'subjects.refIntegrity', sk: 'SK-12', name: '分镜引用主体完备性校验', stage: 'subjects',
      covers: ['subjects', 'shots'], wave: 'W4', kinds: ['check'],
      kb: ['主体参考'], checks: ['subjects.shotRefIntegrity'],
      cmds: ['episode.preflight', 'episode.smartReview'], gaps: ['S-03'],
      note: '主体按名查找(含多形态全称)与取图口径复用 Domain,不在本层再写一份;'
        + '校验项经就绪检查(episode.preflight)双端消费,审片报告(episode.smartReview)只读附本镜命中'
        + '(独立字段,不并入 issues、不改评分与达标线);结论只报不拦;S-03 的一致性半由 SK-13 承接',
    },
    {
      id: 'subjects.crossShot', sk: 'SK-13', name: '跨镜头主体一致性校验', stage: 'subjects',
      covers: ['subjects', 'gen'], wave: 'W4', kinds: ['check'],
      kb: ['多镜头写法', '主体参考'], checks: ['subjects.crossShotConsistency', 'subjects.multiShotPrompt'],
      cmds: ['episode.preflight'], gaps: ['S-03'],
      note: '与 SK-12 成对闭合 S-03:完备性看单镜引用能否落到主体,一致性看同一主体跨镜锁得一不一致;'
        + '每镜实际参考图现取 Domain.shotRefImages(与真实生成请求同一份构造,含参考图组上限)。'
        + '「多镜头写法」的校验面是第二条实现(G-06 校验半):逐镜看送出去的提示词有无图生视频一致性声明、'
        + '首尾帧镜有无大幅动作、一镜里镜头切换是不是太碎。两条都经就绪检查(生成前置)双端消费,结论只报不拦;'
        + '批量/单镜生成动作里不加拦截也不加弹窗(要不要拦生成的产品口径未定),故 cmds 不挂那两个命令面',
    },
    /* ---- 分集 ---- */
    {
      id: 'eps.structureStage', sk: 'SK-14', name: '六阶段结构注入与分集覆盖校验', stage: 'eps', wave: 'W2',
      kinds: ['inject', 'check'], kb: ['六阶段结构'], prompts: ['beat.system'], checks: ['eps.stageCoverage'],
      cmds: ['episode.preflight'], experts: ['ex_structure'], gaps: ['G-13', 'G-04', 'S-01'],
      note: 'kb 顺序与节拍板拆解注入点一致;拆集补服务端属 W3,覆盖校验属 W4。'
        + '该注入点的人设句已收进注册表独立键 beat.system(浏览器隐式读全局默认值页的覆盖表),'
        + '与本条目正文同为该步 system 半的两半、用户都改得到——注入面至此单源;'
        + '仍不开放覆盖的是该步 user 半的 5 段式返回 JSON 约定(段名/宫格数/衔接词表/节拍帧结构),'
        + '那半是解析契约,改坏即整步拆不出节拍板;该步只在浏览器,没有服务端对端。'
        + '校验面按条目区间比例摊到当前集数,判每段有无判得动的正文与开篇期有无反转信号;'
        + '各段该写什么戏(核心冲突爆发/线索汇聚)是语义面,待 G-10。'
        + 'G-13 标记按关联索引口径保留:全仓其余模块的内联人设仍是大头,不因本处落地而摘',
    },
    {
      id: 'eps.payoffPoint', sk: 'SK-15', name: '付费卡点位置校验', stage: 'eps', wave: 'W4',
      kinds: ['check'], kb: ['付费卡点'], checks: ['eps.payoffPlacement'],
      cmds: ['episode.preflight'], experts: ['ex_pleasure'], gaps: ['G-10', 'G-04', 'S-01'],
      note: '卡点位置就是集尾、兑现位置就是下一集集首,故判定输入是集序而非单集正文;'
        + '词表不新写(卡点信号取 SK-07 冲突信号 + SK-14 反转信号,兑现信号取打脸四步的反击/释放两步);'
        + '经就绪检查与问题中心消费,结论只报不拦',
    },
    {
      id: 'eps.frontPipeline', sk: 'SK-16', name: '主线前段编排', stage: 'eps',
      covers: ['script', 'subjects', 'eps', 'shots'], wave: 'W3', kinds: ['orchestrate'], gaps: ['G-04'],
      steps: [
        { cmd: 'project.extractSubjects', args: {}, note: '提取主体:整部剧本先立主体库,下游每镜才锁得住参考' },
        { cmd: 'project.splitEpisodes', args: {}, note: '剧本拆集:整本切成分集,拿到集 id 后本编排转入集内两步' },
        { cmd: 'episode.understanding', args: {}, note: '本集理解:先出人物/情绪/场景口径' },
        { cmd: 'episode.generateStoryboard', args: {}, note: '智能分镜:按理解口径拆镜' },
      ],
      note: '四步按主线步序排(主体→分集→集内理解→分镜,与 Domain.workflow 同序),'
        + 'cmds 面由 steps 推出不写第二份;G-04 的服务端工作流出口四步都已就位,headless 可从一份整部剧本起跑。'
        + 'args 一律留空:授权位(拆集 overwrite——已有分集时未授权即拒,防误删已分镜数据)与'
        + '模式位(拆集 local、提取 mode)属调用方决策,编排层只给步序不预设授权',
    },
    /* ---- 分镜 ---- */
    {
      id: 'shots.shotLanguage', sk: 'SK-17', name: '镜头语言词表归一与注入', stage: 'shots', wave: 'W2',
      kinds: ['inject'], kb: ['景别运镜', '轴线匹配', '多镜头写法'], prompts: ['sb.system'],
      cmds: ['episode.generateStoryboard'], experts: ['ex_dp'], gaps: ['G-07', 'G-14'],
      note: 'kb 顺序与 WfCore.sbSystem 注入点一致;词表以 WfCore 的景别/运镜/视点/角度四表为准。'
        + '「多镜头写法」自 SK-19 移来:它治的是逐镜 prompt 的镜头流写法,落点就是拆镜人设这一处,'
        + '同一提示词内不重复注入(SK-19 不再登记该键)',
    },
    {
      id: 'shots.sizeProgression', sk: 'SK-18', name: '景别递进与轴线校验', stage: 'shots',
      covers: ['shots', 'review'], wave: 'W4', kinds: ['check'],
      kb: ['景别运镜', '轴线匹配'], prompts: ['sb.reviewUser', 'review.system'], checks: ['shots.sizeLinkage'],
      cmds: ['episode.preflight'],
      experts: ['ex_dp'], gaps: ['G-10'],
      note: '景别衔接口诀另以文本形态落在 sb.reviewUser 评审指令里,校验面判据同出 KB「景别运镜」条目;'
      + '级差一律经 WfCore.sizeGap 取景别阶梯单源,本层不写第二份阶梯——落地面只判景别递进与跳切,'
      + '轴线面(越轴/匹配剪辑)的判定输入是机位方位,分镜字段无承载,仍归 G-10;'
      + '经就绪检查与问题中心消费,结论只报不拦——审片报告尚未消费本面'
      + '(景别递进是跨镜判定,审片的镜级入口取不到相邻镜,判定输入未定),故不登记 episode.smartReview',
    },
    {
      id: 'shots.promptEightDim', sk: 'SK-19', name: '抽卡八维公式与军规注入与稳定词校验', stage: 'shots',
      covers: ['shots', 'gen'], wave: 'W2', kinds: ['inject', 'check'],
      kb: ['抽卡公式', '抽卡军规'], prompts: ['sb.system'], settings: ['tplVideo'],
      checks: ['shots.stableLexicon'],
      cmds: ['episode.generateStoryboard', 'episode.preflight'], gaps: ['G-15', 'G-05', 'G-10'],
      note: '索引面 W2 落地;校验面判的是真实生成请求那条提示词(现取 Domain.buildVideoRequest)——'
        + '稳定词写没写全、有没有写条目自列的模糊词,词表一律从两条条目正文里现筛不写第二份。'
        + '「多镜头写法」移交 SK-17(拆镜人设注入面)后本条不再登记该键,G-06 随之从本条清账;'
        + '本条两条抽卡条目的提示词落点是生成步人设 WfCore.genPromptSystem(SK-21 同键登记)。'
        + '经就绪检查与问题中心消费(所属分镜面已在双端单源面表里,两端实现不必改;'
        + '问题中心按集挂一条低危提醒,warn 不抬成发布门 fail),结论只报不拦、不拦生成动作;'
        + '八维填得全不全这类语义判断仍归 G-10',
    },
    {
      id: 'shots.motionGate', sk: 'SK-20', name: '镜头动态感准入校验', stage: 'shots',
      covers: ['shots', 'gen'], wave: 'W4',
      kinds: ['check'], kb: ['剪辑节奏', '抽卡军规'], checks: ['shots.motionDiscipline'],
      cmds: ['episode.generateStoryboard', 'episode.preflight'],
      gaps: ['G-10', 'S-04'],
      note: '校验面落在分镜表这一份判定输入上:动作幅度判逐镜动作描述(大幅动作词与 SK-13 首尾帧插值面共用一份,'
        + '首尾帧镜归那一面不重复报)、运镜条数判 Domain.buildVideoRequest 装出的真实提示词'
        + '(运镜词表现取 WfCore 运镜表 axis=move 那几项)、镜长分布取该请求的 duration;'
        + '经就绪检查消费(所属分镜面已在双端单源面表里,两端实现不必改),结论只报不拦、不拦生成动作。'
        + 'S-04 未清账:节拍板五段式产出那一份判定输入仍无领域命令出口,该面不在本条冒充;'
        + '这一镜该快该慢、动态感够不够属语义面,待 G-10',
    },
    /* ---- 生成 ---- */
    {
      id: 'gen.videoTpl', sk: 'SK-21', name: '视频提示词模板落位与抽卡方法论注入', stage: 'gen', wave: 'W2',
      kinds: ['inject'], kb: ['抽卡公式', '抽卡军规'], prompts: ['gen.promptSystem'], settings: ['tplVideo'],
      cmds: ['shot.generateVideo', 'episode.generateVideos'],
      experts: ['ex_suspense', 'ex_sweet', 'ex_hotblood', 'ex_healing', 'ex_cinema', 'ex_narration', 'ex_revenge', 'ex_power'],
      gaps: ['G-13'],
      note: '注入面两半:模板半(tplVideo)经 WfCore.fillTplVideo 落在提示词成型链路(拆镜要素要求、'
        + '模型未给 prompt 的兜底、本地拼装出口 SB.buildShotPrompt),模板为空时输出逐字节不变;'
        + '方法论半按键整条注入提示词改写人设 WfCore.genPromptSystem——本条拼块即那两条条目正文,'
        + '生成请求构造点(Domain.buildVideoRequest)不注方法论文本,生成指纹口径不动;'
        + 'G-06 的注入半在此闭合(多镜头写法进 SK-17 拆镜人设、主体参考进 SK-11 主体人设),'
        + '校验半(生成前置 warn)由 SK-11/SK-13 的校验项承接,G-06 两半到此清账;'
        + '模块内联提示词入注册表的覆盖面待 G-13',
    },
    {
      id: 'gen.renderCredential', sk: 'SK-22', name: '生成凭据与确认失效校验', stage: 'gen', wave: 'W4',
      kinds: ['check'], kb: ['抽卡军规'], checks: ['gen.renderCredential'],
      cmds: ['episode.preflight', 'shot.generateVideo', 'episode.generateVideos'], gaps: ['S-05'],
      note: '只读既有判旧指纹与未确认计数出 warn,不改计费动作、不新增计费标签、不改确认闸行为。'
        + '判旧与就绪现取 Domain.shotVideoStale/shotVideoReady(与流程条、分集状态、批量生成同一份判定),'
        + '本层不写第二份指纹比对;报的是既有机制自身的失效点——无指纹的镜判旧恒不生效、'
        + '确认与定稿背书的已不是当前输入、未确认镜会被批量生成静默跳过——不复述 Domain 已有的计数。'
        + '本条把 gen 面带进就绪检查双端单源面表 Skills.preflightStages()(由登记推导,两端实现未改);'
        + '生成动作侧只登记消费点不加拦截:确认闸与发布门口径一概不动,结论只报不拦',
    },
    /* ---- 审片 ---- */
    {
      id: 'review.stage', sk: 'SK-23', name: '审片升为主线一等步骤', stage: 'review', wave: 'W3',
      kinds: ['infra'], prompts: ['review.system', 'review.finalSystem'],
      cmds: ['episode.smartReview'], gaps: ['G-03'],
      note: 'G-03 已落地:Domain.workflow 含审片步、STAGES 里 review 的 wfStep 已为 true,'
        + '流程条/项目级推荐动作/计划步骤(映射 episode.smartReview)/板块智能体「审片」四处消费面同步到位;'
        + 'infra 面的 pending 已按实况清空,缺口标记按关联索引口径保留;'
        + '问题中心已补未审(no-review)与记录判旧(review-stale)两条中危投影,'
        + '与本步 blockers 同一口径、判旧那条与发布门 G3「视为未审」同口径,判据不写第二份。'
        + '仍欠:审片步在就绪检查面表里的校验面已随 SK-24 落地,'
        + '而报告好坏优劣的语义面(方法论门那一半)仍待 G-10;'
        + '审片不作分集级硬阻塞(硬门禁仍归发布门 G3)是既定口径,不算欠账',
    },
    {
      id: 'review.methodDim', sk: 'SK-24', name: '方法论维度进审片报告', stage: 'review', wave: 'W4',
      kinds: ['inject', 'check'], kbBlocks: ['reviewBlock'],
      prompts: ['review.system', 'review.finalSystem'], settings: ['tplReview'],
      checks: ['review.methodDim'], cmds: ['episode.smartReview', 'episode.preflight'],
      experts: ['ex_editor'], gaps: ['G-10'],
      note: '维度口径以 script.hookType / script.faceslapFour / shots.shotLanguage / shots.promptEightDim 的条目为准,不在本条重复登记。'
        + '校验面判的是注入面那两条提示词键的落点在报告里到位没有——四维成片评审(review.finalSystem)缺失或某维无分、'
        + '镜级报告(review.system)没覆盖到的镜、报告对象已被挤出取不回、逐镜分背书的已不是当前视频、'
        + '分数出自离线本地模拟、报告里没有方法论校验命中字段;四维维度名现取 WfCore.normalizeCut 产出形状,'
        + '整份判旧现取 Domain.reviewStaleByScript(与分集状态、问题中心、发布门 G3 同一份判定)——'
        + '已判旧的报告不产出结论,未审/判旧/低分三类计数归 Domain,本层不复述。'
        + '本条把 review 面带进就绪检查双端单源面表 Skills.preflightStages()(由登记推导,两端实现未改);'
        + '审片路径登记的是注入面消费点(reviewBlock/tplReview 进评审提示词),校验面的判定输入是整集报告本身,'
        + '单镜入口拿不出结论故不进报告的镜级 checks;结论只报不拦——不进 blockers、'
        + '不改发布门 G3 与达标线、不改审片动作与计费,方法论门(SK-29)仍待 G-10/S-07',
    },
    {
      id: 'review.reviseLoop', sk: 'SK-25', name: '审片修订闭环编排', stage: 'review',
      covers: ['review', 'gen', 'film'], wave: 'W3', kinds: ['orchestrate'], gaps: ['G-03', 'G-12'],
      prompts: ['gen.promptSystem'], // 修订步的人设句:浏览器一键优化与 CLI 修订重抽同经 WfCore.optimizeSystem 取
      steps: [
        { cmd: 'episode.smartReview', args: { quiet: true }, note: '整集逐镜评审:低分镜与共性问题落 lastReview' },
        { cmd: 'episode.generateVideos', args: {}, note: '按审片问题修订提示词后只重跑低分镜(shotIds 子集由编排层现取实况派生,不预设在登记里)' },
        { cmd: 'episode.smartReview', args: {}, note: '复审:同一份派生出来的子集,仍有待人工镜则回 needs_human' },
        { cmd: 'episode.compose', args: {}, note: '达标后合成成片' },
        { cmd: 'project.release', args: {}, note: '收尾留痕:过发布门后打版本号,未过门如实 blocked 不留痕(force 授权位留空由用户明示)' },
      ],
      note: 'G-12 在本条的落点已接上:发布留痕从"两端各一份实现、都在领域命令注册表之外"改成一条已注册命令 '
        + 'project.release——准入判定与写回收进 js/release-core.js 双端单源(浏览器 Release.stampRelease、'
        + '服务端 /api/wf/release 同一个 stamp,环境差异经参数注入),浏览器交付检查的「打版本」按钮改走命令表,'
        + 'CLI `exec project.release` / `release` 与 MCP hujing_release 同名同结构同链路。'
        + '本条 steps 因此补上收尾这一步:修订闭环达标合成之后就是留痕,args 仍留空——'
        + 'force 是授权位(未过门强打),归用户明示,编排层不代授权。'
        + '发布留痕零 LLM、零上游、零计费:它只写 p.releases 与 p.__ver,不进 Tasks.run 也不走 wfLLM,'
        + '门禁判据、fail/warn 计数与 overall 四级口径一个字未动(不抬门也不把 warn 变 fail)。'
        + 'G-03 分两面记:重抽面这一面已落地——「该重抽哪几镜」收进 Domain.reviseTargets 双端单源'
        + '(达标线取 REVIEW_MIN、报告判旧回空与发布门 G3「视为未审」同口径、与当前分镜表取交集、定稿镜不重抽、'
        + 'order 取分镜表实位),WfCore.reviseSubset 在其上按 reportId 回取报告补逐镜修正意见;'
        + 'CLI produce 闭环每轮现取实况派生重抽面再传 shotIds,不再摘回执里那份会与分镜表漂移的 lowShots,'
        + '服务端 /api/wf/smart-review 的 lowShots、助手工作台摘要与审片完成卡、问题中心 low-review 同读这一份。'
        + '收敛次数这一面也已落地:「复审不达标还能重来几轮」收进 Domain.reviseRetryLimit 双端单源'
        + '(整数轮次、取值域 REVISE_RETRY_MIN..MAX = 1..5、缺省 2,候选值按优先级择先——命令入参先于分集 sbConfig,'
        + '读不出来才回缺省;上限的理由是每轮都真扣费,下限 1 是至少给一次改正机会,'
        + '要零轮请关 smartReview 开关而不是把次数写 0),CLI produce、浏览器 autoSmartReview 与命令层 '
        + 'episode.produce 同读这一份,三处不再各钳一份 1-5 缺省,参数配置面板的次数选项也由它派生。'
        + '仍欠(G-03):两端闭环形态仍不同构——浏览器 autoSmartReview 把重试嵌在逐镜循环里(一镜连着重抽到达标为止),'
        + 'CLI produce 是整集低分子集重抽一轮再复审(集外循环),同一份次数口径在两端数的不是同一件事;'
        + '要合成一份得先定浏览器侧进度面板语义与逐镜计费节奏能否改成分轮,属产品口径,尚未定',
    },
    {
      id: 'review.memoryFeedback', sk: 'SK-26', name: '审片结论按板块回流专家', stage: 'review',
      covers: ['review', CROSS], wave: 'W4', kinds: ['orchestrate'],
      prompts: ['forge.evolveSystem'],
      experts: ['ex_editor'], gaps: ['G-11', 'G-02'],
      steps: [
        { cmd: 'project.extractSubjects', args: {}, note: '提取主体入库收尾即把本轮新增/已有位数、主体库总量与缺参考图位数写回主体板块记忆桶' },
        { cmd: 'project.splitEpisodes', args: {}, note: '拆集收尾即把集数、切分模式与超长集数写回剧本板块记忆桶' },
        { cmd: 'episode.understanding', args: {}, note: '本集理解收尾即把六维产出数与缺的维名写回导演板块记忆桶' },
        { cmd: 'episode.generateStoryboard', args: {}, note: '智能分镜收尾即把镜数/预估总时长与缺提示词、未挂主体两处缺口写回分镜板块记忆桶' },
        { cmd: 'episode.smartReview', args: {}, note: '审片闭环收尾即把该集可判定结论(待返工镜数/共性问题类型/四维最弱维)写回成片板块记忆桶,下一轮审片提示词按板块召回时吃到' },
        { cmd: 'project.release', args: {}, note: '发布闭环收尾同理:门禁状态与未过门项写回项目级记忆桶(未过门不留痕也就不回流)' },
      ],
      /* 命令面 = steps 六步(回流闭环)+ expert.evolve。后者有意**不进 steps**:它是人手动作,
       * 串进步序等于把"跑完主线就该进化"写成编排口径,那正是 G-11 余面要先定产品口径的那件事。 */
      cmds: ['project.extractSubjects', 'project.splitEpisodes', 'episode.understanding',
        'episode.generateStoryboard', 'episode.smartReview', 'project.release', 'expert.evolve'],
      note: '回流面覆盖主线六个闭环:审片、发布,加前段四步理解/分镜/拆集/提取主体。各步收尾把**可判定**结论'
        + '(待返工镜数、共性问题类型、四维最弱维、发布门状态与未过门项;六维产出数与缺的维名;镜数与缺提示词/未挂主体镜数;'
        + '集数与超长集数;新增主体位数与缺参考图位数)写回既有记忆桶 state.agentMemory,派生只此一份 '
        + 'WfCore.memFeedback/memWrite(记忆数组经参数注入,函数体不碰环境句柄),按回流键 fb 原地更新——'
        + '同一集/同一项目反复闭环只留最新一条。上限 50 条仍在,但集数会自己长:回流每集占三条,'
        + '故满桶淘汰按优先级来——先挤最旧的自动回流条(带 fb),用户自沉淀的「记住…」留住,'
        + '桶里没有自动条时才退回先进先出。用户手打那一半的写入面(浏览器 memRemember、CLI memory add)'
        + '也走这同一个 memWrite,故桶被自动条占满时新加一条「记住…」挤的仍是自动条,不会挤掉别的用户条。'
        + '写入点浏览器与 headless 各一套且都走同一份 UMD 派生:审片(review.js / /api/wf/smart-review)、'
        + '发布留痕(release.js stampRelease / 服务端 /api/wf/release,CLI `exec project.release` 与 MCP 同链路)、'
        + '理解(understanding.js / /api/wf/understanding 与智能分镜内部理解步)、'
        + '分镜(sb-llm.js publishLLMShots / /api/wf/smart-storyboard)、拆集(proj-upload.js splitCore / /api/wf/split-episodes)、'
        + '提取主体(端点只出候选不写 state,回流挂入库口径:js/commands.js 与 CLI exec,后者随 withProject 同一次 PUT 的 meta 桶写回)。'
        + '"回流专家"的自动那一半即经此闭合:条目带板块 scope,下一轮同板块提示词按 WfCore.memBlock 召回吃到。'
        + '整集均分有意不回流——成片板块记忆会被下一轮逐镜审片召回,把上一轮分数喂回评分方等于设锚点;'
        + '失败路径(理解回退模板、拆镜回退本地、LLM 报错、零产出)一律不写,没有结论就不冒充。'
        + '沿用既有记忆桶与自定义专家副本,不新建存储桶、不改预置专家数据、不改发布门 G1–G10 判据与计数口径、不新增计费。'
        + 'steps 六步都是已注册命令:发布留痕的命令化出口(G-12 的第三个落点)已接上——'
        + '判定与写回收进 js/release-core.js 双端单源,出口是 project.release,'
        + '编排层不再需要为这一步挂假命令名,主线六个回流闭环因此都能被 playbook 投影出来。'
        + '蒸馏侧的板块面已补齐:evolveExpert 的记忆源按该专家的生效板块硬过滤,判据双端单源 '
        + 'WfCore.expertBoards(板块雇佣 > 全局雇佣,与 personaFor 同一套)+ WfCore.memForBoards'
        + '(只收 scope 命中的条目,无 scope 的手工沉淀不收),板块或条目取不到在扣费前跳过——'
        + '别的板块的沉淀不再混进本专家 persona,也不拿全量记忆桶凑数。'
        + '蒸馏那一步的人设句(进化器)也已收编为独立键 forge.evolveSystem,取值口在 WfCore.evolveSystem 经 Prompts.get,'
        + '缺省逐字节不变、用户在「全局默认值」页改得到——蒸馏用什么口径提炼条款不再写死;'
        + '与工坊锻造器 forge.system 分两条键(无中生有铸新专家 vs 就地改写已有专家,角色不同)。'
        + '同样只收人设句:返回 JSON 的 clauses 约定、1-4 条上限与每条 ≤40 字仍由该步 user 半与 system 契约半拼,'
        + '不开放覆盖(改坏即整轮蒸馏不出条款,且已交付的那次调用不退费)。'
        + '预置专家那一面也已补齐:专家雇佣页的预置卡(风格与功能两类)挂同一个「🧠 进化」按钮,走同一个 '
        + 'evolveExpert、同一份板块过滤与同一份计费口径(1 积分,五件套,两道闸仍在扣费之前)——'
        + '预置注册表 experts-data.js 是双端共享的静态数据,改不得也存不住,故条款落到该预置专家的自定义副本'
        + '(副本记 from=派生源,同一预置专家只派生一份;副本自身未被雇佣时生效板块按派生源算,'
        + 'WfCore.expertBoards 认 from),副本被雇佣后其条款才进链路。'
        + 'headless 那一面也已补齐:蒸馏四步(落点 evolveTarget/提示词两半 evolveSystem+buildEvolveUser/'
        + '条款规整 evolveClauses/落 persona evolveApply)下沉 js/wf-core.js 双端单源,出口是领域命令 expert.evolve——'
        + '浏览器 Commands 走 evolveExpert、CLI exec 与 MCP hujing_expert_evolve 走服务端 /api/wf/evolve-expert'
        + '(计费 llm.evolve 服务端定死,两道闸仍在扣费之前 400 拦下,预置专家同样落自定义副本);'
        + '本条的 cmds 因此比 steps 多一条 expert.evolve,而它有意不进 steps——'
        + '编排步序里出现"进化"就等于把自动蒸馏写成了口径。'
        + '仍欠(G-11):蒸馏仍是人手动作——回流条目要人点「🧠 进化」或显式发一条 expert.evolve 才进 persona,'
        + '自动进化仍无出口;补 headless 出口只是把人手那条路从一端变四端,'
        + '人设句可覆盖同样不改这一面——改得到提炼口径,改不出自动触发',
    },
    /* ---- 成片 ---- */
    {
      id: 'film.rhythmInject', sk: 'SK-27', name: '剪辑节奏注入成片评审与时间线建议', stage: 'film', wave: 'W2',
      kinds: ['inject'], kb: ['剪辑节奏'], prompts: ['review.finalSystem'], cmds: ['episode.compose'],
      experts: ['ex_editor'], gaps: ['G-15', 'G-13'],
    },
    {
      id: 'film.subtitleQC', sk: 'SK-28', name: '字幕时间轴与阅读速度校验', stage: 'film', wave: 'W4',
      kinds: ['check'], checks: ['film.subtitleTiming'], cmds: ['episode.compose', 'episode.preflight'],
      gaps: ['S-06'],
      note: '判定输入是合成时间轴段:段序列/段时长/段文本现取 Domain.subtitleSegs(与真实合成 items、'
        + 'SRT 软字幕同一份构造),烧录截断线现取 Domain.SUB_BURN_MAX——本层不写第二份切段口径;'
        + '经就绪检查与问题中心消费(S-06 结构化质检结论落地),结论只报不拦',
    },
    {
      id: 'film.deliverContract', sk: 'SK-29', name: '交付契约门', stage: 'film',
      covers: ['film', CROSS], wave: 'W4',
      kinds: ['check'], checks: ['film.upstreamFinalContract'],
      cmds: ['episode.compose', 'episode.produce', 'episode.preflight'], gaps: ['G-10', 'S-07'],
      note: '校验面落在上游定稿契约这一份判定输入上:板块名与链序现取 STAGES 主线七步表(七步的 name 逐字'
        + '就是那七个板块键)、产物实况现取 Domain.workflow 的同键步骤(与流程条、发布门 G1 同一份推导),'
        + '本层不写第二份板块词表与第二份就绪判定;判两向——下游定稿/待审核而上游未定稿(契约优先级倒置)、'
        + '已定稿板块背书的那一步实况未 done(定稿无产物背书)。'
        + '判定范围窄于看板改阶段那一刻的软闸门(那处按看板全序提醒):看板的支线板块(导演定调)'
        + '与 Domain.workflow 的四个支线步都不在主线七步表里,本面不判它们,也不为它们另存一份板块词表。'
        + '经就绪检查消费(所属成片面已在双端单源面表里,两端实现不必改),结论只报不拦、不改交付打包行为。'
        + 'G-10 未清账:方法论门进发布门(挂成默认 warn 的可选门)的产品口径未定,本条一行未动 js/release.js 的'
        + 'G1–G10 与 overall 计数;定稿内容对不对属语义面,同待 G-10。'
        + 'S-07 由本条的可判定结论承接,契约优先级从"只注入给模型的文本约束"变成两端拿得到的 warn 结论',
    },
    {
      id: 'film.produceProjection', sk: 'SK-30', name: '一键成片编排 playbook 化', stage: 'film', wave: 'W4',
      kinds: ['orchestrate'], cmds: ['episode.produce', 'episode.compose'], gaps: ['G-12'],
      steps: [
        { cmd: 'episode.produce', args: { smartReview: true }, note: '一键成片:批量生成→智能审片→合成,内部按 maxRetry 重试;风险位仍走既有决策' },
      ],
      note: '本条只做既有编排命令的 playbook 投影,不内联第二份成片语义;风险位中断后的补合成走 episode.compose',
    },
  ];

  const ARR = ['kb', 'kbBlocks', 'prompts', 'settings', 'cmds', 'experts', 'checks', 'gaps', 'covers', 'kinds', 'pending'];
  REG.forEach(s => {
    s.steps = s.steps || [];
    ARR.forEach(k => { s[k] = s[k] || []; });
    if (!s.covers.length) s.covers = [s.stage];
    /* 编排型的命令面由 steps 推出,不在条目里手写第二份 */
    if (!s.cmds.length) s.cmds = s.steps.map(x => x.cmd).filter((v, i, a) => a.indexOf(v) === i);
  });

  const copy = s => Object.assign({}, s, ARR.reduce((o, k) => { o[k] = s[k].slice(); return o; }, {}),
    { steps: s.steps.map(x => Object.assign({}, x, { args: Object.assign({}, x.args) })) });
  /* 某一机制面是否已有出口:kinds 里声明了且不在 pending 里 */
  const live = (s, kind) => s.kinds.indexOf(kind) >= 0 && s.pending.indexOf(kind) < 0;

  return {
    STAGES, CROSS, KINDS, WAVES, CHECKS, REG,
    stages: () => STAGES.map(x => x.key),
    stageOf: key => STAGES.find(x => x.key === key) || null,
    /* 就绪检查(episode.preflight)的校验面表:双端单一来源,浏览器命令层与 CLI 只读本表 concat,
     * 不各写一份面清单(这段曾是并行分支反复撞车的热点,任一侧胜出都会静默摘掉别人那一面)。
     * 面 = 注册表里"校验面已落地且把 episode.preflight 登记为消费点"的条目所属主线步,按 STAGES 步序去重;
     * 故新增一面只需在该条目上登记 checks 实现与 cmds: ['episode.preflight'],两端自动跟上,不必再各改一处实现。
     * pending 含 check 的条目(校验面尚无实现)不进表——它们没有结论可产出,进表也只会得到空数组。 */
    preflightStages() {
      return STAGES.map(x => x.key)
        .filter(k => REG.some(s => s.stage === k && live(s, 'check') && s.cmds.indexOf('episode.preflight') >= 0));
    },
    list(stage) { return REG.filter(s => !stage || s.stage === stage).map(copy); },
    /* 按作用面取:含把该步写进 covers 的跨步条目(list 只给主 stage) */
    covering(stage) { return REG.filter(s => s.covers.indexOf(stage) >= 0).map(copy); },
    byId(id) { const s = REG.find(x => x.id === id); return s ? copy(s) : null; },
    /* 专家 → 引用它的能力(SK-02 反查出口:专家条目侧不存第二份 skills[]) */
    forExpert(id) { return REG.filter(s => s.experts.indexOf(id) >= 0).map(copy); },

    /* 注入型:按 stage 拼方法论块,文本一律现取 KB(索引层不缓存、不复述)。
     * 注入面尚无出口(pending 含 inject)的条目不参与拼块。
     * ctx:{ids:[skillId] 只取指定条目(既有注入点逐字节对齐用), sep 连接符(默认空串,与既有注入点一致)} */
    block(stage, ctx) {
      const c = ctx || {};
      const parts = [];
      REG.forEach(s => {
        if (s.stage !== stage || !live(s, 'inject')) return;
        if (c.ids && c.ids.indexOf(s.id) < 0) return;
        s.kb.forEach(k => { if (KB.section(k)) parts.push(KB.section(k)); });
        s.kbBlocks.forEach(b => { if (typeof KB[b] === 'function') parts.push(KB[b]()); });
      });
      return parts.join(c.sep === undefined ? '' : c.sep);
    },

    /* 校验型:跑该步已注册的校验项(纯本地、零 LLM、零计费);无校验项即空数组 */
    check(stage, obj, ctx) {
      const out = [];
      REG.forEach(s => {
        if (s.stage !== stage || !live(s, 'check')) return;
        s.checks.forEach(id => {
          const fn = CHECKS[id];
          if (typeof fn !== 'function') return;
          const r = fn(obj, ctx || {}) || {};
          out.push({ id, skill: s.id, pass: r.pass !== false, level: r.level || 'warn', hits: r.hits || [] });
        });
      });
      return out;
    },

    /* 编排型:步骤只引用已注册领域命令名,不内联新命令语义 */
    playbook(id) {
      const s = REG.find(x => x.id === id && live(x, 'orchestrate'));
      if (!s) return null;
      return { id: s.id, title: s.title || s.name, steps: copy(s).steps };
    },
    playbooks() { return REG.filter(s => live(s, 'orchestrate')).map(s => this.playbook(s.id)); },

    /* 缺口投影:缺口编号 → 引用它的能力 id(W3/W4 排期与验收挂钩用) */
    gaps() {
      const m = {};
      REG.forEach(s => s.gaps.forEach(g => { (m[g] = m[g] || []).push(s.id); }));
      return m;
    },

    /* 引用键自检:deps={KB?,Prompts?,CmdRegistry?,ExpertsData?,settingKeys?,wfStepKeys?},缺的注册表跳过对应检查。
     * 返回问题清单(空数组=全通过),供契约测试与启动期自检使用。 */
    validate(deps) {
      const d = deps || {};
      const kb = d.KB || KB;
      const promptKeys = d.Prompts ? d.Prompts.list().map(x => x.key) : null;
      const cmdNames = d.CmdRegistry ? d.CmdRegistry.names() : null;
      const expertIds = d.ExpertsData ? (d.ExpertsData.EXPERTS || []).map(e => e.id) : null;
      const stageKeys = STAGES.map(x => x.key).concat(CROSS);
      const bad = [];
      const seen = {}, seenSk = {};
      const push = (who, msg) => bad.push(who + ': ' + msg);
      REG.forEach(s => {
        if (seen[s.id]) push(s.id, 'id 重复');
        seen[s.id] = 1;
        if (!/^SK-\d\d$/.test(s.sk || '')) push(s.id, '短名单编号缺失或非法:' + s.sk);
        else if (seenSk[s.sk]) push(s.id, '短名单编号重复:' + s.sk);
        seenSk[s.sk] = 1;
        if (stageKeys.indexOf(s.stage) < 0) push(s.id, 'stage 不在主线七步:' + s.stage);
        if (WAVES.indexOf(s.wave) < 0) push(s.id, '波次非法:' + s.wave);
        s.covers.forEach(k => { if (stageKeys.indexOf(k) < 0) push(s.id, 'covers 不在主线七步:' + k); });
        if (s.covers.indexOf(s.stage) < 0) push(s.id, 'covers 须含自身 stage');
        if (!s.kinds.length) push(s.id, '须声明至少一种机制面');
        s.kinds.forEach(k => { if (KINDS.indexOf(k) < 0) push(s.id, 'kind 非法:' + k); });
        s.pending.forEach(k => { if (s.kinds.indexOf(k) < 0) push(s.id, 'pending 面未在 kinds 声明:' + k); });
        if (s.pending.length && !s.gaps.length) push(s.id, '有未落地机制面须写明缺口编号');
        s.kb.forEach(k => { if (typeof (kb.SECTIONS || {})[k] !== 'string') push(s.id, 'KB 条目不存在:' + k); });
        s.kbBlocks.forEach(b => { if (typeof kb[b] !== 'function') push(s.id, 'KB 压缩块不存在:' + b); });
        s.checks.forEach(c => { if (typeof CHECKS[c] !== 'function') push(s.id, '校验项未注册:' + c); });
        if (promptKeys) s.prompts.forEach(k => { if (promptKeys.indexOf(k) < 0) push(s.id, '提示词 key 不存在:' + k); });
        if (d.settingKeys) s.settings.forEach(k => { if (d.settingKeys.indexOf(k) < 0) push(s.id, '偏好设置键不存在:' + k); });
        if (expertIds) s.experts.forEach(e => { if (expertIds.indexOf(e) < 0) push(s.id, '专家 id 不存在:' + e); });
        if (cmdNames) s.cmds.forEach(n => { if (cmdNames.indexOf(n) < 0) push(s.id, '命令名不存在:' + n); });
        s.steps.forEach((st, i) => {
          if (cmdNames && cmdNames.indexOf(st.cmd) < 0) push(s.id, '步骤 ' + (i + 1) + ' 命令名不存在:' + st.cmd);
          const meta = d.CmdRegistry && d.CmdRegistry.byName[st.cmd];
          if (!meta) return;
          const argNames = (meta.args || []).map(a => a.name);
          Object.keys(st.args || {}).forEach(k => { if (argNames.indexOf(k) < 0) push(s.id, '步骤 ' + (i + 1) + ' 参数不在命令 args:' + k); });
        });
        /* 已有出口的机制面必须真的拿得出东西;尚无出口的面一律不挂假出口 */
        if (live(s, 'inject') && !s.kb.length && !s.kbBlocks.length) push(s.id, '注入型须引用 KB 条目或压缩块');
        if (live(s, 'check') && !s.checks.length) push(s.id, '校验型须引用已注册校验项');
        if (live(s, 'orchestrate') && !s.steps.length) push(s.id, '编排型须有 steps');
        if (s.pending.indexOf('check') >= 0 && s.checks.length) push(s.id, '校验面未落地不得登记校验项');
        if (s.pending.indexOf('orchestrate') >= 0 && s.steps.length) push(s.id, '编排面未落地不得登记步骤');
      });
      if (d.wfStepKeys) {
        STAGES.forEach(st => {
          if (st.wfStep && d.wfStepKeys.indexOf(st.key) < 0) push('STAGES', 'stage 声明为工作流步骤但不在 Domain.workflow:' + st.key);
        });
      }
      return bad;
    },
  };
});
