/* ============ director.js 「AI 导演正在为您理解剧本」全屏进度页 ============
 * 真实驱动:Step1 LLM 主体提取 → Step2 提示词/八维度(随提取合并) → Step3 批量主体图
 * 进度与 ETA 反映真实流程状态;失败步骤可断点重试。
 */
(function () {
  /* 步骤权重与预估耗时(秒,ETA 用) */
  const STEPS = [
    { key: 'extract', title: 'Step 1', name: '主体提取', desc: '识别主要角色、关键场景与核心道具', weight: 0.45, est: 9 },
    { key: 'prompt', title: 'Step 2', name: '提示词生成', desc: '生成主体画面提示词与八维度人设', weight: 0.05, est: 0.5 },
    { key: 'images', title: 'Step 3', name: '主体图生成', desc: '批量生成主体图片', weight: 0.5, est: 0 }, // est 动态 = 1.2s × 主体数
  ];
  const IMG_EST = 1.2;

  /* ETA:已完成步骤的实际/预估剔除,当前步按进度折算剩余,未开始步全计 */
  function estimateRemaining(stepIdx, stepFrac, imgTotal) {
    let remain = 0;
    STEPS.forEach((st, i) => {
      const est = st.key === 'images' ? IMG_EST * Math.max(1, imgTotal) : st.est;
      if (i < stepIdx) return;
      if (i === stepIdx) remain += est * (1 - stepFrac);
      else remain += est;
    });
    return Math.max(1, Math.round(remain));
  }
  const fmtEta = sec => sec >= 60 ? `${Math.floor(sec / 60)} 分 ${String(sec % 60).padStart(2, '0')} 秒` : `${sec} 秒`;

  /**
   * 开始创作全流程
   * p 项目; scriptText 剧本; model LLM 模型; extractMode normal|fine; types {character,scene,prop}; main 容器
   */
  function run(p, scriptText, model, extractMode, types, main) {
    p.script = scriptText;
    Store.save();
    const st = {
      step: 0,               // 当前步骤 0..2,3=完成
      failStep: -1, failReason: '',
      subjects: null,        // step1 产物
      llmUsed: false, extractMs: 0,
      genTotal: 0, genDone: 0, genFailed: 0,
      closed: false,
    };
    let tk = null; // Tasks 任务(主体提取)

    /* ---- 侧边栏(复用 U.bgDock steps 模式:非模态停靠右侧,解析期间页面保持可操作;路由切换不中断) ---- */
    document.querySelectorAll('.dir-dock').forEach(x => x.remove());
    // 重复解析先终止上一轮;✕ 关闭中断;侧边栏不随路由切换关闭(解析期间允许正常操作/切页)
    if (window.__dirActive) window.__dirActive();
    const dock = U.bgDock({
      title: '🐋🎬 AI 导演正在理解剧本',
      sub: '后台解析中,您可以继续操作页面 · 智能分析剧本内容,提取核心主体信息',
      steps: STEPS.map(s => ({ title: `${s.title} | ${s.name}`, desc: s.desc })),
      onRetry: () => retry(),
      onCancel: () => { st.closed = true; clearInterval(timer); if (window.__dirActive) window.__dirActive = null; },
    });
    const ov = dock.m;
    window.__dirActive = () => closeOverlay();

    const $ = sel => ov.querySelector(sel);
    const barEl = $('[data-bar]'), pctEl = $('[data-pct]'), etaEl = $('[data-eta]');

    /* ---- 进度条缓动(真实状态驱动,调用期间逼近不越界) ---- */
    let displayPct = 0, targetPct = 0;
    const timer = setInterval(() => {
      if (st.closed) return;
      if (displayPct < targetPct) displayPct = Math.min(targetPct, displayPct + Math.max(0.2, (targetPct - displayPct) * 0.08));
      const frac = st.step >= 3 ? 1 : Math.max(0, (displayPct - weightBefore(st.step)) / STEPS[st.step].weight);
      barEl.style.width = displayPct + '%';
      pctEl.textContent = Math.round(displayPct) + '%';
      etaEl.textContent = '预计还需 ' + fmtEta(st.step >= 3 ? 0 : estimateRemaining(st.step, Math.min(1, frac), st.genTotal || 6));
      dock.setSteps(st.step, st.failStep);
    }, 120);
    const weightBefore = i => STEPS.slice(0, i).reduce((a, s) => a + s.weight, 0) * 100;
    const setTarget = (step, frac) => { st.step = step; targetPct = weightBefore(step) + STEPS[step].weight * 100 * Math.min(1, frac); };

    const info = (i, t) => dock.stepInfo(i, t);

    /* bgDock 的 close 幂等;收尾(st.closed/定时器/__dirActive)统一在 onCancel */
    function closeOverlay() { dock.close(); }

    /* ================= Step 1:主体提取(fromRetry=true 时 LLM 再失败回退本地启发式,避免重试死循环) ================= */
    async function stepExtract(fromRetry) {
      st.failStep = -1;
      setTarget(0, 0.05);
      tk = Tasks.start({ type: '剧本解析', model: API.isReady() ? model : '本地启发式', target: p.name, projectId: p.id });
      const local = EpisodeUtil.extractSubjects(scriptText, extractMode, types);
      let found = local, llmNote = '';
      if (!API.isReady()) {
        // 离线:本地启发式质量有限,明确告知并引导登录后端用 LLM 精确提取
        U.toast('当前离线:主体为本地粗略提取(可能不准)。启动 node server.js 并登录后端账号后,将用 LLM 精确提取', 'info', 4500);
      }
      const t0 = Date.now();
      // 缓动推进到 90% 等待真实结果
      const crawl = setInterval(() => { if (st.step === 0 && st.failStep !== 0) setTarget(0, Math.min(0.9, (Date.now() - t0) / (STEPS[0].est * 1000))); }, 300);
      try {
        if (API.isReady()) {
          const llm = await EpisodeUtil.llmExtractSubjects(scriptText, extractMode, types, model, tk.id); // 七轮:任务 id 作稳定计费操作键
          found = {
            character: llm.character.length ? llm.character : local.character,
            scene: llm.scene.length ? llm.scene : local.scene,
            prop: llm.prop.length ? llm.prop : local.prop,
          };
          st.llmUsed = true;
          llmNote = llm.truncated ? '(已截取前 15000 字)' : '';
        }
      } catch (e) {
        clearInterval(crawl);
        if (fromRetry) {
          // 重试后 LLM 仍失败:回退已算好的本地启发式结果继续(防重试死循环)
          found = local;
          llmNote = '(LLM 重试仍失败,已回退本地启发式)';
        } else {
          Tasks.fail(tk, 'LLM 提取失败:' + e.message);
          st.failStep = 0; st.failReason = 'LLM 提取失败:' + e.message + '(可重试,重试再失败将自动回退本地启发式)';
          ov.querySelector('[data-errmsg]').textContent = st.failReason;
          setTarget(0, 0.05);
          return false;
        }
      }
      clearInterval(crawl);
      if (st.closed) return false; // 关闭后中断:耗时操作后落库前检查
      st.extractMs = Date.now() - t0;
      const subjects = [];
      ['character', 'scene', 'prop'].forEach(kind => {
        if (!types[kind]) return;
        found[kind].forEach(s => subjects.push({
          id: Store.uid('sub'), kind, name: s.name, evidence: s.evidence,
          prompt: s.prompt || EpisodeUtil.genPrompt(kind, s.name, styleOf(p)),
          persona: s.persona,
          model: (window.getSettings ? getSettings().defImageModel : '') || MODELS.image[0],
          image: null, status: 'pending',
        }));
      });
      st.subjects = subjects;
      st.genTotal = subjects.length;
      p.subjects = subjects;
      Store.save();
      if (tk.status === 'running') Tasks.done(tk);
      const cnt = `已识别 ${found.character.length} 角色 · ${found.scene.length} 场景 · ${found.prop.length} 道具 ${llmNote}(耗时 ${(st.extractMs / 1000).toFixed(1)}s)`;
      info(0, `<span style="color:var(--green)">✓ ${cnt}</span>`);
      setTarget(0, 1);
      return true;
    }

    /* ================= Step 2:提示词/八维度(随提取合并,如实标注) ================= */
    async function stepPrompt() {
      setTarget(1, 0);
      const t0 = Date.now();
      // 提示词与人设已随 step1 同一 LLM 调用返回;本地启发式结果由模板即时生成,均无需二次调用
      const missing = st.subjects.filter(s => !s.prompt);
      missing.forEach(s => s.prompt = EpisodeUtil.genPrompt(s.kind, s.name, styleOf(p)));
      const personaCnt = st.subjects.filter(s => s.persona).length;
      const ms = Date.now() - t0;
      Store.save();
      info(1, `<span style="color:var(--green)">✓ 提示词与八维度人设已随提取一并生成(${personaCnt} 份人设,耗时 ${ms}ms&lt;1s)</span>`);
      setTarget(1, 1);
      return true;
    }

    /* ================= Step 2.5:提示词人工审核(确认/修改/勾选后才进入批量生图) ================= */
    /* 暂停向导,弹出审核窗:逐主体可改提示词、可取消勾选;确认返回 true,取消返回 false */
    function reviewPrompts() {
      return new Promise(resolve => {
        ov.style.visibility = 'hidden'; // 审核窗置于向导之上
        const KIND_TAG = { character: ['角色', 'purple'], scene: ['场景', 'cyan'], prop: ['道具', 'yellow'] };
        U.openModal({
          title: `📝 主体提示词审核(${st.subjects.length} 个主体)`,
          xl: true,
          maskClose: false,
          body: `
          <div class="hint" style="margin-bottom:10px">生图前请审核每个主体的画面提示词:可直接修改文本;取消勾选的主体本次不生成(之后仍可在主体确认页单独生成)。</div>
          <div style="max-height:52vh;overflow:auto;display:flex;flex-direction:column;gap:10px">
            ${st.subjects.map((s, i) => { const [kn, kc] = KIND_TAG[s.kind] || [s.kind, '']; return `
            <div class="card" style="padding:10px 12px">
              <div class="row" style="justify-content:space-between;margin-bottom:6px">
                <div class="row" style="gap:8px">
                  <span class="tag ${kc}">${kn}</span><b>${U.esc(s.name)}</b>
                  ${s.evidence ? `<span class="small muted">${U.esc(String(s.evidence).slice(0, 30))}</span>` : ''}
                </div>
                <label class="row" style="gap:4px;cursor:pointer;flex:none"><input type="checkbox" data-ck="${i}" checked> <span class="small">生成</span></label>
              </div>
              <textarea class="input" data-pp="${i}" rows="2" style="font-size:12.5px">${U.esc(s.prompt || '')}</textarea>
            </div>`; }).join('')}
          </div>`,
          footer: `<button class="btn" data-x="abort">取消流程</button><button class="btn primary" data-x="ok">✓ 确认提示词,开始生成主体图</button>`,
          onMount(m, close) {
            m.querySelector('[data-x=abort]').onclick = () => { close(); resolve(false); };
            m.querySelector('[data-x=ok]').onclick = () => {
              st.subjects.forEach((s, i) => {
                const ta = m.querySelector(`[data-pp="${i}"]`);
                if (ta && ta.value.trim()) s.prompt = ta.value.trim();
                s.__skipGen = !m.querySelector(`[data-ck="${i}"]`).checked;
              });
              Store.save();
              close();
              resolve(true);
            };
          },
        });
      }).then(ok => { ov.style.visibility = ''; return ok; });
    }

    /* ================= Step 3:批量主体图(N/M 真实计数,逐主体走 EpisodeUtil.genSubjectImage) ================= */
    async function stepImages() {
      st.failStep = -1;
      setTarget(2, st.genTotal ? st.genDone / st.genTotal : 0);
      const pend = st.subjects.filter(s => !s.image && !s.__skipGen); // __skipGen:审核时取消勾选的主体本次跳过
      st.genTotal = pend.length;
      if (!pend.length) { setTarget(2, 1); return true; }
      // 积分预检:逐主体由 genSubjectImage 扣费(失败自动返还),这里先确认至少生得起一张
      if (!U.requireCredits(COST.image, `批量生成主体图×${pend.length}(导演进度页)`)) {
        st.failStep = 2; st.failReason = '积分不足';
        ov.querySelectorAll('[data-errmsg]')[2].textContent = st.failReason;
        return false;
      }
      for (const s of pend) {
        if (st.closed) return false; // 关闭后中断
        if (Store.credits() < COST.image) break; // 余额不足即止(genSubjectImage 已提示)
        info(2, `正在生成 ${st.genDone + 1}/${st.genTotal}:${U.esc(s.name)}…`);
        if (!(window.Media && Media.isReady())) await U.delay(700 + Math.random() * 600); // 离线模拟的向导节奏(真实生图自身耗时,无需假延迟)
        await EpisodeUtil.genSubjectImage(p, s, () => {
          if (s.image) st.genDone++; else st.genFailed++;
          info(2, `已生成 ${st.genDone}/${st.genTotal} 张主体图`);
          setTarget(2, st.genTotal ? st.genDone / st.genTotal : 1);
        });
        if (st.closed) return false; // 关闭后中断:生图耗时操作后检查
      }
      setTarget(2, 1);
      // 如实汇报:有失败/未完成不弹「全部完成」
      if (st.genFailed > 0 || st.genDone < st.genTotal) {
        info(2, `<span style="color:var(--yellow)">⚠ 完成 ${st.genDone}/${st.genTotal},失败 ${st.genFailed} 张</span>`);
      }
      return true;
    }

    /* ---- 断点重试 ---- */
    async function retry() {
      const from = st.failStep;
      st.failStep = -1;
      if (from === 0) { if (await stepExtract(true)) await runChain(1); }
      else if (from === 2) { if (await stepImages()) finish(); }
    }

    async function runChain(from) {
      if (from <= 1 && !(await stepPrompt())) return;
      // 人工审核点:生图前确认/修改提示词(取消则中止流程,主体已存,可在主体确认页继续)
      if (from <= 2 && !(await reviewPrompts())) { closeOverlay(); U.toast('已取消批量生图,主体已保存,可在「主体管理」中继续', 'info', 3500); return; }
      if (from <= 2 && !(await stepImages())) return;
      finish();
    }

    function finish() {
      if (st.closed) return; // 已关闭:不再弹主体确认
      st.step = 3;
      targetPct = 100;
      dock.setSteps(st.step, st.failStep);
      if (st.genFailed > 0 || st.genDone < st.genTotal) {
        info(2, `<span style="color:var(--yellow)">⚠ 主体图完成 ${st.genDone}/${st.genTotal},失败 ${st.genFailed} 张(可在主体确认页重新生成)</span>`);
      } else {
        info(2, `<span style="color:var(--green)">✓ 全部 ${st.genTotal} 张主体图生成完成</span>`);
      }
      setTimeout(() => {
        closeOverlay();
        // 精细模式追加内容(普通模式的全部产出 + 导演风格设定):分集 → 规范文本信息提取 → 导演风格设定
        const fineExtras = () => {
          // 规范文本信息:一句话梗概/大纲/人物小传/集纲(全文通读,后台静默)
          if (window.EpisodeUtil && EpisodeUtil.aiScriptDigest && API.isReady()) {
            EpisodeUtil.aiScriptDigest(p, () => {}).then(ok => { if (ok) U.toast('规范文本信息(梗概/大纲/小传/集纲)已生成', 'success', 2500); }).catch(() => {});
          }
          // 导演风格设定:AI 生成并开启注入(精细模式追加)
          if (window.genDirectorSetting) {
            genDirectorSetting(p.style || '漫剧', (scriptText || '').slice(0, 5000)).then(ds => {
              Store.state.settings = Store.state.settings || {};
              Store.state.settings.directorSetting = Object.assign({ inject: true }, ds);
              Store.save();
              U.toast('导演风格设定已生成并开启注入', 'success', 3000);
            }).catch(() => {});
          }
        };
        // 流程打通:主体解析完成后若尚未分集,自动按剧情分集(生成每集正文),避免「解析剧本」只出主体不出正文
        if (!p.episodes.length && window.EpisodeUtil && EpisodeUtil.doSplit) {
          U.toast('主体解析完成,继续按剧情分集(生成每集正文)…', 'info', 3000);
          EpisodeUtil.doSplit(p, scriptText, main, fineExtras);
        } else {
          fineExtras();
        }
        EpisodeUtil.openSubjectConfirm(p, main); // 落到现有主体确认弹窗
      }, 700);
    }

    /* ---- 启动 ---- */
    (async () => {
      dock.setSteps(st.step, st.failStep);
      if (await stepExtract()) await runChain(1);
    })();

    return { state: st, retry };
  }

  window.Director = { run, estimateRemaining, fmtEta }; // R11 收窄(STEPS 仅内部使用)
})();
