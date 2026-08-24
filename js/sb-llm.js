/* ============ sb-llm.js LLM 拆镜族 + 智能分镜 + 本地分集生成(自 storyboard.js 拆分) ============
 * genShotsLLM/normalizeLLMShot/publishLLMShots/推文出图/llmReview 五角色评审 +
 * runSmartSB(智能分镜入口,两阶段:本集理解→分镜生成) + publishShots(本地兜底拆分)。
 * 加载顺序:storyboard.js 之后;共享辅助经 window.SB 解构,批量操作运行时经 SB.runBatchOp(sb-batch.js)。 */
(function () {
  const { blankShot, CAMERAS, snapshotShot, buildShotPrompt, renderShots, onEpPage, VOICES, SPLIT_RULES, PROMPT5 } = window.SB;

  /* ================= LLM 分镜生成(失败时调用方回退本地 publishShots) ================= */
  async function genShotsLLM(p, ep, { model, count, mode, optimize, adv, feedback, opId, step }) {
    // 主体清单带上已有形态:引导模型在 characters/props 里输出「名-形态」全称
    const withForms = sj => sj.name + ((sj.forms || []).length ? `(形态:${sj.forms.map(f => f.name).join('/')})` : '');
    const charNames = p.subjects.filter(s => s.kind === 'character').map(withForms).join('、') || '无';
    const sceneNames = p.subjects.filter(s => s.kind === 'scene').map(withForms).join('、') || '无';
    const propNames = p.subjects.filter(s => s.kind === 'prop').map(withForms).join('、') || '无';
    const user = `将以下剧集剧本拆分为约 ${count} 个专业分镜(拆解规则优先,可略超),返回 JSON 数组,每个元素:
{"plot":"剧情内容(一句话)","camera":"运镜(从 固定镜头/推镜头/拉镜头/摇镜头/移镜头/跟镜头/环绕镜头/俯拍/仰拍/特写 中选)","view":"视角(正面/侧面/背面)","angle":"拍摄角度(仰拍/平视/俯拍/高角度)","shotSize":"景别(大全景/全景/中景/近景/特写/超级特写)","characters":["出场人物名"],"scene":"场景名","props":["道具名"],"narration":"旁白(没有则空字符串)","dialogue":"台词(没有则空字符串)","prompt":"文生视频中文画面提示词","duration":时长秒数,"strategy":"生成策略(ref/frames/fusion)"}
要求:
- 项目风格:${styleOf(p)}${p.globalSetting ? ',全局美学设定:' + p.globalSetting : ''};项目类型:${window.projType && projType() === 'narration' ? '解说模式(重旁白叙述)' : '剧情模式(重台词表演)'}${window.directorInject ? directorInject(p.style) : ''}${window.conceptInject ? conceptInject(p) : ''}
${langOf(p) ? '- 语言要求:' + langOf(p).slice(1) : ''}
${(p.genres || []).length ? '- 题材看点:' + p.genres.join('/') : ''}
${ep.understanding && window.Understanding ? '- 本集导演理解(必须遵循):\n' + Understanding.toText(ep.understanding) : ''}
- 分镜模式:${mode === 'tweet' ? '推文模式(画面信息密度高、海报感强)' : '创作模式'}
${adv ? `- 视觉风格:${adv.visual};全片总时长约 ${adv.totalSec} 秒;单镜最长 ${adv.maxShotSec} 秒;分镜密度:${adv.density}` : ''}
- 剧本缺少旁白/台词时请补写,须贴合剧情与人物性格
- strategy 按画面动态选型:静态对白/动作幅度小→ref(分镜图参考);大动作/打斗/需衔接上一镜→frames(首尾帧链);多主体同框且一致性要求高→fusion(多图融合)
- ${SPLIT_RULES}
- ${PROMPT5}
- ${optimize ? 'prompt 要电影级详尽:构图/光影/氛围/风格限定词' : 'prompt 简洁准确,一句话'}
- characters/scene/props 优先使用已登记主体:人物[${charNames}]、场景[${sceneNames}]、物品[${propNames}];主体带「(形态:…)」时,剧情涉及该特定形态须输出「名-形态」全称(如 安仲凯-少年期)
${feedback ? '★ 上一轮评审意见(必须逐条修订后再输出):\n' + feedback + '\n' : ''}
${window.eventsOfEpisode && eventsOfEpisode(p, ep) ? '★ 本集事件图谱(剧情骨架,分镜需依序覆盖以下事件,不得遗漏转折点):\n' + eventsOfEpisode(p, ep) + '\n' : ''}
剧本:
${(ep.content || '').slice(0, 12000)}`;
    const out = await API.chatJSON({
      model,
      system: '你是顶级短剧分镜师(AI 分镜师),输出直接可拍的连续剧分镜脚本。运镜与景别由你按剧情情绪自主推荐(用户界面不提供手填),并自觉遵守轴线规则。' + (window.KB ? KB.DR_SHOT + KB.DR_AXIS : ''),
      messages: [{ role: 'user', content: user }],
      temperature: 0.6, max_tokens: 6000,
      billingAction: 'llm.smartSB', operationId: opId, step, // 聚合计费:同 operation 按步骤登记(九轮:每轮拆解为独立步骤槽位)
    });
    if (!Array.isArray(out) || !out.length) throw new Error('LLM 未返回有效分镜数组');
    // 拆解规则优先:允许略超 count,最多容忍 count+3
    const trimmed = out.length > count + 3 ? out.slice(0, count + 3) : out;
    const shots = trimmed.map((raw, i) => normalizeLLMShot(raw, i, p, ep, model, mode === 'tweet'));
    // 内容安全:LLM 返回的逐镜提示词统一自检,命中打标提醒(不阻断拆镜,正式生成时再拦截)
    if (window.Compliance) {
      const bad = [];
      shots.forEach((s, i) => {
        const hits = Compliance.checkText(s.prompt || '').hits;
        if (hits.length) { s.__complianceHits = hits; bad.push(i + 1); }
      });
      if (bad.length) U.toast(`内容安全提示:第 ${bad.join('、')} 镜提示词含敏感词(已打标),生成前请修改;若素材含真人肖像,请确认已完成「肖像授权声明」`, 'error', 4500);
    }
    return shots;
  }

  function normalizeLLMShot(raw, i, p, ep, modelName, tweet) {
    raw = raw || {};
    const s = blankShot(i, ep.sbConfig);
    s.plot = String(raw.plot || '').slice(0, 150) || ('镜头 ' + (i + 1));
    const cam = String(raw.camera || '');
    s.camera = CAMERAS.includes(cam) ? cam : (CAMERAS.find(c => cam.includes(c.replace('镜头', ''))) || ep.sbConfig.batchCamera);
    s.characters = Array.isArray(raw.characters) ? raw.characters.map(String).slice(0, 3) : [];
    s.scene = String(raw.scene || '');
    s.props = Array.isArray(raw.props) ? raw.props.map(String).slice(0, 2) : [];
    s.narration = String(raw.narration || '');
    s.dialogue = String(raw.dialogue || '');
    s.voice = s.dialogue && s.characters[0] ? '角色音·' + s.characters[0] : ep.sbConfig.narratorVoice;
    s.prompt = (String(raw.prompt || '') || `${styleOf(p)}风格,${s.camera},${s.plot.slice(0, 40)}${window.directorInject ? directorInject(p.style) : ''}`) + negOf(p);
    // 机位专业字段(视角/角度/景别)
    const VIEWS = ['正面', '侧面', '背面'], ANGLES = ['仰拍', '平视', '俯拍', '高角度'], SIZES = ['大全景', '全景', '中景', '近景', '特写', '超级特写'];
    s.cameraSpec = {
      view: VIEWS.includes(raw.view) ? raw.view : '正面',
      angle: ANGLES.includes(raw.angle) ? raw.angle : '平视',
      shotSize: SIZES.includes(raw.shotSize) ? raw.shotSize : '中景',
      aperture: 'ƒ/4',
    };
    s.duration = Math.max(2, Math.min(15, +raw.duration || 5));
    /* 拆镜策略建议:LLM 按画面动态为每镜标注建议生成策略(静态对白→ref/大动作→frames/多主体→fusion),
     * 仅作建议存 strategyHint(不直接覆盖 genStrategy,用户在右栏/批量入口一键采纳) */
    s.strategyHint = ['ref', 'frames', 'fusion'].includes(raw.strategy) ? raw.strategy : null;
    s.history = [{ type: '分镜', model: modelName, time: Store.now() }];
    if (tweet) s.image = PH.shot(s.plot, s.order);
    return s;
  }

  function publishLLMShots(p, ep, main, shots, modelName, tweet, opId) {
    ep.shots = shots;
    ep.status = 'storyboarded';
    ep.composed = false;
    ep.shotsSourceRev = ep.contentRev || 0; // 十轮:记录分镜对应的剧本版本(剧本修改后判旧)
    ep.shotsGraphRev = ep.graphRev || 0;    // 十二轮:记录分镜对应的事件图谱版本(图谱修订后判旧)
    Store.save();
    U.toast(`LLM 已生成并发布 ${shots.length} 个分镜(${modelName})`, 'success', 3000);
    Views.episode(main, p.id, ep.id);
    if (tweet) genTweetImages(p, ep, main, shots, opId); // 推文模式:占位图异步替换为真实出图
  }

  /* 推文模式真实出图:在线逐镜文生图替换占位(费用已按 shotCount×COST.tweetShot 预扣);
   * 失败该镜退费并保留占位;离线不调用维持占位。inflight 防重,完成仅在本集页时重渲。
   * 每镜独立 operationId(opId+镜序):服务端逐镜计费 image.tweetShot,与预扣 N×COST.tweetShot 总额一致 */
  const __tweetInflight = new Set();
  async function genTweetImages(p, ep, main, shots, opId) {
    if (!(window.Media && Media.isReady())) return;
    for (const s of shots) {
      if (__tweetInflight.has(s.id)) continue;
      __tweetInflight.add(s.id);
      try {
        const r = await Media.genImage({ prompt: s.prompt || s.plot, size: '1280x720', model: Media.realModel(MODELS.image[0]), billingAction: 'image.tweetShot', operationId: opId ? opId + '_tw' + s.order : undefined });
        snapshotShot(s, '推文占位图', '占位图'); // 真实出图替换前,保留占位状态可回滚
        s.image = r.url;
        Store.save();
        if (onEpPage(p, ep)) renderShots(main, p, ep);
      } catch (e) {
        U.refund(COST.tweetShot, `镜头${s.order + 1} 推文分镜图生成失败`);
        U.toast(`镜头${s.order + 1} 推文分镜图生成失败,积分已返还:` + e.message, 'error', 3500);
      } finally {
        __tweetInflight.delete(s.id);
      }
    }
  }

  /* 多角色评审打分 */
  async function llmReview(shots, p, model, opId, step) {
    const brief = shots.map((s, i) => ({ 镜号: i + 1, 剧情: s.plot, 运镜: s.camera, 景别: (s.cameraSpec && s.cameraSpec.shotSize) || '中景', 出场: s.characters, 旁白: s.narration, 台词: s.dialogue, 提示词: (s.prompt || '').slice(0, 80) }));
    const user = `以编剧/导演/摄像/动效师/审片五个角色评审以下分镜脚本(项目风格:${styleOf(p)}),返回 JSON:
{"score":综合评分(60-99的整数),"comments":[{"role":"编剧","text":"评语"},{"role":"导演","text":"..."},{"role":"摄像","text":"..."},{"role":"动效师","text":"..."},{"role":"审片","text":"..."}]}
要求:comments 恰好 5 条;若 score 低于 90,评语必须指出具体镜号与可修改的问题,供下一轮修订。
摄像角色必查景别衔接口诀:相邻景别不硬切(前后镜景别相同/相邻扣一分并指出镜号)、景别切换隔一别(优先跨一级)、两极镜头不衔接(大全景/远景与特写/超级特写不得直接对切,须中景过渡)。
分镜脚本:
${JSON.stringify(brief)}`;
    const out = await API.chatJSON({
      model,
      system: '你是资深影视审片专家组。',
      messages: [{ role: 'user', content: user }],
      temperature: 0.4, max_tokens: 1800,
      billingAction: 'llm.smartSB', operationId: opId, step, // 评审轮次并入聚合计费(九轮:独立步骤槽位)
    });
    out.score = Math.max(60, Math.min(99, parseInt(out.score, 10) || 75));
    if (!Array.isArray(out.comments) || !out.comments.length) out.comments = [{ role: '审片', text: '整体评估完成' }];
    return out;
  }

  function runSmartSB(p, ep, main) {
    if (!ep.content || !ep.content.trim()) return U.toast('本分集暂无剧本内容,请先在分集管理补充', 'error');
    if (Store.shotsStale(ep)) U.toast('源剧本在拆镜后已修改,本次智能分镜将按新剧本重新拆解(旧分镜被覆盖)', 'info', 4000); // 十轮:剧本→分镜失效传播
    const c = ep.sbConfig;
    const tweetCost = c.sbMode === 'tweet' ? c.shotCount * COST.tweetShot : 0;
    const total = COST.smartSB + tweetCost;
    // 五件套时序:先登记后扣费(扣费失败 fail),消除"已扣费但无任务记录"的中断窗口
    let tk = Tasks.start({ type: '智能分镜', model: API.isReady() ? c.sbModel : '本地生成', target: ep.title, cost: total, projectId: p.id, episodeId: ep.id });
    if (!U.charge(total, `智能分镜(${c.sbModel})${c.sbMode === 'tweet' ? '+推文分镜图×' + c.shotCount : ''}`)) { Tasks.fail(tk, '积分不足'); return; }
    // 两阶段:Step1 本集理解 → Step2 分镜生成(总价不变,理解含在内)
    // 九轮:同 opId + 各自独立 step 槽位(und/gen1/gen2/rev1/rev2)——服务端按步骤登记,
    // 聚合流程一笔扣费幂等合并;修订轮次内容不同 → 不同步骤槽位(同槽位换内容会被 409 拒)
    Understanding.run(p, ep, main, {
      billingAction: 'llm.smartSB', operationId: tk.id, step: 'und',
      onDone: async () => {
        if (API.isReady()) {
          try {
            let genRound = 0;
            let shots = await genShotsLLM(p, ep, {
              model: c.sbModel, count: c.shotCount, mode: c.sbMode, optimize: c.autoOptimize, opId: tk.id, step: 'gen' + (++genRound),
            });
            /* 生成后自动评审修订(整合原 AI 分镜师能力):五角色评审打分,<90 分按评审意见重拆,最多 2 轮 */
            if (c.sbAutoFix) {
              for (let round = 1; round <= 2; round++) {
                try {
                  const rv = await llmReview(shots, p, c.sbModel, tk.id, 'rev' + round);
                  if (rv.score >= 90) { U.toast(`评审通过(${rv.score} 分),质量达标`, 'success', 2500); break; }
                  if (round >= 2) { U.toast(`评审 ${rv.score} 分,已达最大修订轮次,按当前版本发布`, 'info', 3000); break; }
                  U.toast(`评审 ${rv.score} 分,按评审意见自动修订重拆(第 ${round} 轮)…`, 'info', 3500);
                  const feedback = '综合评分 ' + rv.score + ' 分,评审意见:\n' + rv.comments.map(x => x.role + ':' + x.text).join('\n');
                  shots = await genShotsLLM(p, ep, { model: c.sbModel, count: c.shotCount, mode: c.sbMode, optimize: c.autoOptimize, feedback, opId: tk.id, step: 'gen' + (++genRound) });
                } catch (e) {
                  U.toast('评审修订中断,按当前版本发布:' + e.message, 'error', 3000);
                  break;
                }
              }
            }
            Tasks.done(tk);
            publishLLMShots(p, ep, main, shots, c.sbModel, c.sbMode === 'tweet', tk.id);
            return shots.length;
          } catch (e) {
            Tasks.fail(tk, 'LLM 智能分镜失败,已回退本地生成:' + e.message);
            U.toast('LLM 智能分镜失败:' + e.message + ',已回退本地生成', 'error', 4000);
            // 回退本地生成用新任务(cost 0:费用已扣且失败不退),保证最终状态能 done
            tk = Tasks.start({ type: '智能分镜', model: '本地生成(回退)', target: ep.title, cost: 0, projectId: p.id, episodeId: ep.id });
          }
        }
        if (tk.status === 'running') Tasks.done(tk);
        publishShots(p, ep, main, { model: c.sbModel, tweet: c.sbMode === 'tweet' });
        return ep.shots.length;
      },
      onError: e => { // chain 执行链意外异常:退费+置失败,不留"扣费无记录"窗口(opKey 关联计费 operation,服务端按原账单退)
        U.refund(total, '智能分镜执行异常', tk.id);
        Tasks.fail(tk, '智能分镜执行异常:' + (e && e.message || e));
        U.toast('智能分镜执行异常,已退费:' + (e && e.message || e), 'error', 3500);
      },
    });
  }

  /* ================= 分镜生成(两种入口共用) ================= */
  function publishShots(p, ep, main, cfg) {
    const c = ep.sbConfig;
    const paras = (ep.content || '').split(/\n+/).map(x => x.trim()).filter(Boolean);
    const n = Math.min(c.shotCount || 8, Math.max(3, paras.length));
    const per = Math.max(1, Math.ceil(paras.length / n));
    const shots = [];
    const charNames = p.subjects.filter(s => s.kind === 'character').map(s => s.name);
    const sceneNames = p.subjects.filter(s => s.kind === 'scene').map(s => s.name);
    const propNames = p.subjects.filter(s => s.kind === 'prop').map(s => s.name);

    for (let i = 0; i < paras.length && shots.length < n; i += per) {
      const text = paras.slice(i, i + per).join(' ');
      const s = blankShot(shots.length, c);
      s.plot = text.slice(0, 120);
      s.characters = charNames.filter(nm => text.includes(nm)).slice(0, 3);
      s.scene = sceneNames.find(nm => text.includes(nm)) || sceneNames[0] || '';
      s.props = propNames.filter(nm => text.includes(nm)).slice(0, 2);
      s.camera = c.batchCamera !== '固定镜头' ? c.batchCamera : CAMERAS[shots.length % CAMERAS.length];
      // 解说模式全文旁白;剧情模式尝试提取台词(两种格式分开匹配:引号直引 / 「角色:台词」)
      const dq1 = text.match(/[“"]([^”"]{2,40})[”"]/);
      const dq2 = !dq1 && text.match(/([一-龥]{2,4})[:：]([^。!?\n]{2,40})/);
      const line = dq1 ? dq1[1] : dq2 ? dq2[2] : '';
      if (window.projType && projType() === 'narration') {
        s.narration = text.slice(0, 60);
        s.voice = c.narratorVoice;
      } else if (line) {
        s.dialogue = '“' + (line.length > 40 ? line.slice(0, 40) : line) + '”';
        s.voice = s.characters[0] ? '角色音·' + s.characters[0] : VOICES[2];
      } else {
        s.narration = text.slice(0, 50);
        s.voice = c.narratorVoice;
      }
      s.prompt = buildShotPrompt(p, { plot: s.plot.slice(0, 40), camera: s.camera, scene: s.scene, characters: s.characters });
      if (cfg.tweet) s.image = PH.shot(s.plot, s.order); // 推文模式自动带分镜图
      s.history = [{ type: '分镜', model: cfg.model || c.sbModel, time: Store.now() }];
      shots.push(s);
    }
    ep.shots = shots;
    ep.status = 'storyboarded';
    ep.composed = false;
    ep.shotsSourceRev = ep.contentRev || 0; // 十轮:记录分镜对应的剧本版本(剧本修改后判旧)
    ep.shotsGraphRev = ep.graphRev || 0;    // 十二轮:记录分镜对应的事件图谱版本(图谱修订后判旧)
    Store.save();
    U.confirm(`已发布 ${shots.length} 个分镜。下一步:批量生成视频?`, () => SB.runBatchOp(p, ep, main, 'video'), '批量生成视频');
    Views.episode(main, p.id, ep.id);
    if (cfg.tweet) genTweetImages(p, ep, main, shots); // 推文模式:占位图异步替换为真实出图
  }

  Object.assign(window.SB, { genShotsLLM, publishLLMShots, llmReview, runSmartSB, publishShots });
})();
