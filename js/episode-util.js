/* ============ episode-util.js 剧本解析/主体提取/分集工具域(自 episodes.js 拆分) ============
 * 启发式主体提取(离线兜底)/LLM 主体提取/规范文本信息全文提取/LLM 剧本分集。
 * window.EpisodeUtil 为全站唯一出口(director/roles/persona 等消费);
 * genSubjectImage/doSplit/openSubjectConfirm 等执行侧入口由 proj-upload.js 增补到同一命名空间。 */
(function () {
  /* ---------- 启发式文本解析器(离线兜底;在线走 LLM 精确提取) ---------- */
  const SPEECH_VERBS = '说道问答复喊叫嚷嘀咕喃喃冷笑怒吼嘲笑惊呼感叹低语询问嘀咕';
  /* 名称可信性校验(LLM 与本地启发式结果共用入口:add()/norm 均经此过滤;
   * 算法下沉 wf-core.js 双端单源——CLI project.extractSubjects 同校验) */
  const isPlausibleName = WfCore.isPlausibleName;
  const SCENE_DICT = ['教室', '办公室', '会议室', '卧室', '客厅', '厨房', '医院', '学校', '公园', '街道', '大街', '小巷', '森林', '海边', '沙滩', '山顶', '山谷', '城市', '小镇', '村庄', '宫殿', '城堡', '寺庙', '实验室', '地下室', '仓库', '车站', '机场', '码头', '餐厅', '咖啡馆', '酒吧', '酒店', '商场', '图书馆', '博物馆', '监狱', '法庭', '战场', '飞船', '太空站', '洞穴', '祭坛', '武馆', '剧院'];
  const PROP_DICT = ['长剑', '短剑', '宝剑', '匕首', '长枪', '手枪', '步枪', '弓箭', '盾牌', '铠甲', '斗篷', '面具', '手机', '电脑', '信件', '信封', '钥匙', '项链', '戒指', '手镯', '古书', '日记', '地图', '盒子', '宝箱', '药瓶', '丹药', '鲜花', '灯笼', '罗盘', '怀表', '照片', '画卷', '玉佩', '令牌', '徽章', '法杖', '魔杖', '水晶球'];
  /* 各类主体上限(本地启发式宁缺毋滥) */
  const EXTRACT_CAP = { character: 12, scene: 8, prop: 8 };

  function extractSubjects(text, mode, types) {
    const out = { character: [], scene: [], prop: [] };
    const freq = {};
    const countOccur = nm => { if (freq[nm] !== undefined) return freq[nm]; let n = 0, i = -1; while ((i = text.indexOf(nm, i + 1)) >= 0) n++; freq[nm] = n; return n; };
    const add = (kind, name, evidence, minOccur) => {
      name = name.trim();
      if (!isPlausibleName(kind, name)) return; // 统一可信性校验:过滤台词碎片/动词短语
      if (out[kind].some(s => s.name === name)) return;
      if (out[kind].length >= EXTRACT_CAP[kind]) return;
      // 至少出现 2 次才算稳定实体(称谓/词典命中豁免)
      if (countOccur(name) < (minOccur || 2)) return;
      out[kind].push({ name, evidence });
    };
    /* 边界判定:名称前应紧跟句读/引号/换行等边界;句中捕获(如"只听张三说道")要求更高频次兜底 */
    const BOUNDARY = '\n\r 　。!??;；…—·“”"\'「」『』()(),，、:：';
    const atBoundary = idx => idx <= 0 || BOUNDARY.includes(text[idx - 1]);

    if (types.character) {
      // 人物名 + 说/道/问/答 等说话动词(说话动词前后都要剥掉,如"回答":剥"答","说道":剥"说道")
      const re1 = new RegExp(`([一-龥]{2,4})(?=[${SPEECH_VERBS}])`, 'g');
      let m;
      const cleanName = nm => {
        const CLEAN_VERBS = SPEECH_VERBS + '回'; // 「回」补入:覆盖"回答/回道"复合说话动词("赵铁柱回答"→赵铁柱)
        while (nm.length && CLEAN_VERBS.includes(nm[nm.length - 1])) nm = nm.slice(0, -1);
        while (nm.length && CLEAN_VERBS.includes(nm[0])) nm = nm.slice(1);
        return nm;
      };
      while ((m = re1.exec(text))) {
        const nm = cleanName(m[1]);
        // 句中捕获(前面是别的汉字)时,要求该名至少出现 3 次才采信,压制"答这个/说一遍/喊大"类台词碎片
        add('character', nm, '“' + text.slice(Math.max(0, m.index - 6), m.index + 8).replace(/\n/g, '') + '…”', atBoundary(m.index) ? 2 : 3);
      }
      // 人物名 + 冒号台词(该模式基本只出现在行首,天然带边界)
      const re2 = /([一-龥]{2,4})[:：]/g;
      while ((m = re2.exec(text))) {
        if (!atBoundary(m.index)) continue;
        add('character', cleanName(m[1]), '“' + text.slice(m.index, m.index + 10).replace(/\n/g, '') + '…”');
      }
      // 精细模式: 称呼/身份词(称谓本身就是强信号,豁免频次要求)
      if (mode === 'fine') {
        const re3 = /([一-龥]{2,4})(?:先生|小姐|老师|医生|队长|将军|大人|公子|姑娘)/g;
        while ((m = re3.exec(text))) add('character', m[1] + text.slice(m.index + m[1].length, m.index + m[0].length), '身份称谓识别', 1);
      }
    }
    if (types.scene) {
      SCENE_DICT.forEach(w => { if (text.includes(w)) add('scene', w, '场景词典命中', 1); });
      // "在/走进/来到/回到 + 地点" 模式
      const re = /(?:在|走进|来到|回到|位于|踏入)([一-龥]{2,8}?(?:室|房|厅|楼|街|城|村|店|园|山|海|林|站|场|宫|船|塔|桥|谷|洞|舱|台|镇))/g;
      let m;
      while ((m = re.exec(text))) add('scene', m[1], '“' + text.slice(m.index, m.index + 10) + '…”');
    }
    if (types.prop) {
      PROP_DICT.forEach(w => { if (text.includes(w)) add('prop', w, '物品词典命中', 1); });
    }
    return out;
  }

  /* 主体图提示词统一出口(角色/场景/道具 × 模式):默认 sheet=白底三视图设定图;
   * mode='ref' 为视频参考大头照(勿与三视图混喂视频模型,见 knowledge.js KB 口径);base 可覆盖默认「名称+描述」前缀 */
  function buildSubjectPrompt(s, mode, base) {
    const pre = base !== undefined ? base : s.name + (s.description ? ',' + s.description : '');
    const isChar = s.kind === 'character';
    if (mode === 'scene') return pre + (isChar ? ',典型场景定妆照,角色身处符合剧情氛围的剧中场景,氛围剧照,电影质感' : ',典型场景氛围剧照,电影美术质感');
    if (mode === 'half') return pre + (isChar ? ',白底正面半身照,精致五官,服装细节清晰,纯白背景' : ',白底正面定妆照,主体居中,纯白背景');
    // 视频参考(官方指南):大头照仅保留面部、中性表情、干净背景,减少肩颈/背景干扰,防 ID 漂移与双胞胎误判
    if (mode === 'ref') return pre + (isChar ? ',视频参考专用面部特写(大头照):仅保留头部,中性表情,纯色干净背景,面部五官清晰稳定精致,减少肩颈与背景干扰' : ',视频参考专用主体定格照:主体正面清晰居中,纯色干净背景,无多余杂物');
    return pre + (isChar ? ',角色设定图:白底三视图(正面/侧面/背面横向并排),精致五官,服装细节丰富,纯白背景' : ',白底三视图设定图(多角度横向并排),主体居中,纯白背景');
  }

  function genPrompt(kind, name, style) {
    const tpl = (window.getSettings ? getSettings().tplImage : '') || '{style}风格,{subject},精美画面';
    const base = tpl.replace(/\{style\}/g, style).replace(/\{subject\}/g, name) + (window.directorInject ? directorInject(style) : '');
    if (kind === 'character') return buildSubjectPrompt({ kind, name }, 'sheet', base);
    if (kind === 'scene') return `${base},广角构图,氛围感强,光影层次丰富,无人场景`;
    return `${base},单品特写,材质清晰,打光考究,灰底产品图`;
  }

  function splitEpisodes(text) {
    const marker = /第[一二三四五六七八九十百千0-9]+[集章回篇][^\n]*/g;
    const matches = [...text.matchAll(marker)];
    const eps = [];
    if (matches.length >= 2) {
      matches.forEach((m, i) => {
        const end = i + 1 < matches.length ? matches[i + 1].index : text.length;
        eps.push({ title: m[0].trim().slice(0, 20), content: text.slice(m.index, end).trim() });
      });
    } else {
      // 均分: 每集约 800 字, 在段落边界切
      const paras = text.split(/\n+/).filter(Boolean);
      const target = Math.min(12, Math.max(2, Math.ceil(text.length / 800)));
      const per = Math.ceil(paras.length / target);
      for (let i = 0; i < paras.length; i += per) {
        const chunk = paras.slice(i, i + per).join('\n');
        eps.push({ title: '第' + (eps.length + 1) + '集', content: chunk });
      }
    }
    return eps;
  }
  /* 分集规则校验:章/集标记不可混用,单集建议 ≤2000 字 */
  function validateScriptRules(text) {
    const chapters = (text.match(/第[一二三四五六七八九十百千0-9]+章/g) || []).length;
    const episodes = (text.match(/第[一二三四五六七八九十百千0-9]+集/g) || []).length;
    if (chapters && episodes) return { level: 'warn', mixed: true, chapters, episodes, msg: `检测到"第X章"(${chapters}个)与"第X集"(${episodes}个)混用,将无法正确分集,请统一为一种` };
    if (chapters) return { level: 'ok', mixed: false, chapters, episodes: 0, msg: `检测到 ${chapters} 个章节标记(第X章),将按此分集` };
    if (episodes) return { level: 'ok', mixed: false, chapters: 0, episodes, msg: `检测到 ${episodes} 个分集标记(第X集),将按此分集` };
    return { level: 'info', mixed: false, chapters: 0, episodes: 0, msg: '未检测到章节标记,将由 AI 智能分集' };
  }

  /* 从剧本文本正则粗提取基础信息(LLM 精修覆盖);原为 projectDetail 闭包内函数,拆分后参数化 */
  function deriveScriptMeta(p) {
    const t = (p.script || '').trim();
    const lines = t.split(/\n+/).map(x => x.trim()).filter(Boolean);
    const grab = re => { const m = t.match(re); return m ? m[1].trim() : ''; };
    return {
      title: p.scriptMeta && p.scriptMeta.title || (lines[0] || p.name).slice(0, 30),
      logline: p.scriptMeta && p.scriptMeta.logline || (lines.find(l => l.includes('|')) || '').slice(0, 60),
      positioning: grab(/版本定位[:：]\s*([^\n]+)/),
      totalEps: grab(/总集数[:：]\s*(\d+)/) || String(p.episodes.length || ''),
      duration: grab(/单集时长[:：]\s*([^\n]+)/),
      theme: grab(/核心命题[:：]\s*([^\n]+)/),
      synopsis: p.scriptMeta && p.scriptMeta.synopsis || '',
      outline: p.scriptMeta && p.scriptMeta.outline || '',
    };
  }

  /* ---------- LLM 主体提取(失败时调用方回退本地启发式;opId 供稳定计费操作键,解析重试不重复扣) ----------
   * 提示词与结果规整下沉 wf-core.js 双端单源(CLI project.extractSubjects 走 /api/wf/extract-subjects 同源),
   * 此处只保留浏览器 API 调用;p 传入时按主体板块注入生效专家方法论与协作记忆(与服务端同一装配口) */
  async function llmExtractSubjects(text, mode, types, model, opId, p) {
    const board = WfCore.WF_BOARD['extract-subjects'];
    const { user, truncated } = WfCore.buildExtractUser(text, mode, types, {
      personaNote: window.personaNoteFor ? personaNoteFor(p, board) : '',
      memText: WfCore.memBlock(Store.state.agentMemory, (p && p.name) || '', board),
    });
    // R1 收敛:统一走 API.chatJSONRobust(重试+修复内置)
    const out = await API.chatJSONRobust({
      model,
      system: WfCore.EXTRACT_SYSTEM,
      user,
      temperature: 0.3, max_tokens: 4000,
      operationId: opId,
    });
    return Object.assign(WfCore.normalizeExtracted(out), { truncated });
  }

  /* ---------- 规范文本信息全文提取(普通模式解析主流程 + 剧本页「AI 生成」共用) ----------
   * 全文分块通读(map)→ 汇总(reduce)产出 一句话卖点/故事梗概/故事大纲;逐集按完整正文生成集纲;
   * 人物小传合并进主体库(文本级,不生图)。prog 进度回调,shouldStop 返回 true 则中断(返回 false)。 */
  async function aiScriptDigest(p, prog, shouldStop) {
    if (!API.isReady()) throw new Error('需要真实 LLM(请登录后端)');
    const model = (Store.state.settings || {}).defLLM || API.getConfig().model;
    const say = prog || (() => {});
    const stop = shouldStop || (() => false);
    // ① 全文分块(段落边界,每块 ≤12000 字)
    const paras = String(p.script || '').split(/\n+/);
    const chunks = []; let cur = '';
    for (const pa of paras) {
      if (cur && (cur + '\n' + pa).length > 12000) { chunks.push(cur); cur = pa; } else cur = cur ? cur + '\n' + pa : pa;
      while (cur.length > 12000) { chunks.push(cur.slice(0, 12000)); cur = cur.slice(12000); } // 超长单段硬切
    }
    if (cur) chunks.push(cur);
    if (!chunks.length) throw new Error('项目还没有剧本内容,请先上传剧本');
    // ② map:逐块通读概括
    const partials = [];
    for (let i = 0; i < chunks.length; i++) {
      if (stop()) return false;
      say(`通读剧本 ${i + 1}/${chunks.length}…`);
      const o = await API.chatJSON({
        model, system: '你是资深短剧策划。',
        messages: [{ role: 'user', content: `这是剧本的第 ${i + 1}/${chunks.length} 部分,概括本部分剧情,返回 JSON {"summary":"≤150字,保留关键人物/事件/转折"}:\n${chunks[i]}` }],
        temperature: 0.4, max_tokens: 500,
      });
      partials.push(String((o && o.summary) || ''));
    }
    // ③ reduce:汇总卖点/梗概/大纲
    if (stop()) return false;
    say('汇总卖点/梗概/大纲…');
    const out = await API.chatJSON({
      model, system: '你是资深短剧策划。',
      messages: [{ role: 'user', content: `以下是一部短剧剧本各部分的连续剧情概括(共 ${chunks.length} 部分,已覆盖全文)。据此返回 JSON:
{"logline":"一句话卖点(≤40字,可用 | 分隔三层钩子)","synopsis":"故事梗概(≤220字,涵盖开端/发展/结局)","outline":"故事大纲(4-6句,按起承转合梳理主线与关键转折)"}
${partials.map((s, i) => `第${i + 1}部分:${s}`).join('\n')}` }],
      temperature: 0.5, max_tokens: 1500,
    });
    if (!out) throw new Error('返回为空');
    p.scriptMeta = Object.assign(deriveScriptMeta(p), p.scriptMeta || {}, {
      logline: String(out.logline || ''), synopsis: String(out.synopsis || ''), outline: String(out.outline || ''),
    });
    // ④ 集纲:逐集按完整正文生成(按 12000 字分组批量,不采样)
    if (p.episodes.length) {
      const groups = []; let g = [], len = 0;
      p.episodes.forEach((e, i) => {
        const c = (e.content || '');
        if (g.length && len + c.length > 12000) { groups.push(g); g = []; len = 0; }
        g.push(i); len += c.length;
      });
      if (g.length) groups.push(g);
      p.epOutline = p.epOutline || [];
      for (let gi = 0; gi < groups.length; gi++) {
        if (stop()) return false;
        say(`生成集纲 ${gi + 1}/${groups.length}…`);
        const idxs = groups[gi];
        const o2 = await API.chatJSON({
          model, system: '你是资深短剧策划。',
          messages: [{ role: 'user', content: `为以下各集分别写一句话集纲,返回 JSON {"outlines":[{"no":集号数字,"outline":"≤40字,概括本集核心剧情与钩子"}]}。必须逐集都写,依据各集完整正文:
${idxs.map(i => `【第${i + 1}集 ${p.episodes[i].title}】\n${p.episodes[i].content || '(空)'}`).join('\n\n')}` }],
          temperature: 0.4, max_tokens: 2000,
        });
        (Array.isArray(o2 && o2.outlines) ? o2.outlines : []).forEach(it => {
          const no = parseInt(it && it.no, 10);
          if (no >= 1 && no <= p.episodes.length) p.epOutline[no - 1] = String(it.outline || '');
        });
        idxs.forEach((i, k) => { if (!p.epOutline[i] && o2 && Array.isArray(o2.outlines) && o2.outlines[k]) p.epOutline[i] = String(o2.outlines[k].outline || ''); });
      }
    }
    // ⑤ 人物小传:基于全文分段概括提取,合并进主体库(文本级,不生图;已存在的主体不覆盖)
    if (stop()) return false;
    say('提取人物小传…');
    const bios = await API.chatJSON({
      model, system: '你是专业的短剧剧本分析助手。',
      messages: [{ role: 'user', content: `以下是一部短剧剧本的全文分段概括。提取其中的主要人物,返回 JSON {"characters":[{"name":"真实人名或稳定称谓","bio":"一句话人物小传(≤60字,含身份/性格/动机)"}]},最多 12 人;严禁把台词碎片、动词短语当作人名:
${partials.map((s, i) => `第${i + 1}部分:${s}`).join('\n').slice(0, 8000)}` }],
      temperature: 0.3, max_tokens: 1500,
    });
    (Array.isArray(bios && bios.characters) ? bios.characters : []).forEach(c => {
      const name = String((c && c.name) || '').trim();
      const bio = String((c && c.bio) || '').trim();
      if (!isPlausibleName('character', name)) return; // 过可信性校验,拦截台词碎片
      const exist = p.subjects.find(x => x.kind === 'character' && x.name === name);
      if (exist) { if (!exist.description && bio) exist.description = bio; return; }
      p.subjects.push({ id: Store.uid('sub'), kind: 'character', name, description: bio, evidence: '全文文本提取', image: null, status: 'pending' });
    });
    Store.save();
    return true;
  }

  /* 普通模式解析的后台进度入口:分集完成后在后台通读全文提取规范文本信息,完成后落到「剧本」页 */
  async function runDigestDock(p, main) {
    const d = U.bgDock({ title: '📖 剧本信息提取' });
    d.say('开始全文提取:一句话梗概/大纲/人物小传/集纲…');
    try {
      const ok = await aiScriptDigest(p, t => d.say(U.esc(t)), () => d.cancelled);
      if (!ok) { d.close(); return; }
      d.finish('✓ 规范文本信息提取完成,已在「剧本」页就绪');
    } catch (e) {
      d.finish('✕ 提取失败:' + U.esc(e.message));
    }
    window.__projTab = '剧本'; // 完成后落到剧本页查看结果
    Views.projectDetail(main, p.id);
  }

  /* ---------- LLM 剧本分集(无明显集标记时) ----------
   * 锚点协议:LLM 只回每集标题+开头原文锚句,本地按锚点切原文——正文逐字不动、不重写;
   * 长文(>15000 字)不调 LLM,返回 null 由调用方回退本地段落均分(同样保原文完整) */
  async function llmSplitEpisodes(text, model, opId) {
    const n = Math.min(12, Math.max(2, Math.ceil(text.length / 800)));
    if (text.length > 15000) return null;
    const user = `将以下剧本按剧情节奏划分为 ${n} 集,返回 JSON 数组,每个元素:
{"title":"第X集 标题","anchor":"该集正文开头的原文第一句(≤30字,必须逐字引用原文,不要改写)"}
要求:每集剧情相对完整、节奏卡点合理;第一集 anchor 为全文开头第一句;anchor 必须能在原文中逐字找到。
剧本:
${text}`;
    const out = await API.chatJSON({
      model,
      system: '你是专业的短剧策划编辑。',
      messages: [{ role: 'user', content: user }],
      temperature: 0.4, max_tokens: 2000,
      operationId: opId, // 稳定计费操作键(与所属任务同 id,解析重试不重复扣)
    });
    if (!Array.isArray(out) || out.length < 2) throw new Error('LLM 未返回有效分集数组');
    // 锚点定位:按返回顺序在原文中找锚句位置,切出原文段落
    const points = [];
    let from = 0;
    for (const o of out) {
      const anchor = String((o && o.anchor) || '').trim().slice(0, 30);
      if (!anchor) continue;
      let idx = text.indexOf(anchor, from);
      if (idx < 0) idx = text.indexOf(anchor.slice(0, 10), from); // 宽松兜底:前 10 字
      if (idx < 0) continue;
      if (points.length && idx <= points[points.length - 1].idx) continue; // 防倒序/重复
      points.push({ title: String((o && o.title) || '').trim().slice(0, 24), idx });
      from = idx + anchor.length;
    }
    if (points.length < 2) throw new Error('LLM 分集锚点定位失败');
    points[0].idx = 0; // 第一集恒从全文开头起,不丢头部
    return points.map((pt, i) => ({
      title: pt.title || '第' + (i + 1) + '集',
      content: text.slice(pt.idx, i + 1 < points.length ? points[i + 1].idx : text.length).trim(),
    })).filter(e => e.content.length > 10);
  }

  window.EpisodeUtil = { extractSubjects, genPrompt, buildSubjectPrompt, splitEpisodes, validateScriptRules, llmExtractSubjects, aiScriptDigest, runDigestDock, deriveScriptMeta };
})();
