/* ============ sb-llm.js LLM 拆镜族 + 智能分镜 + 本地分集生成(自 storyboard.js 拆分) ============
 * genShotsLLM/normalizeLLMShot/publishLLMShots/推文出图/llmReview 五角色评审 +
 * runSmartSB(智能分镜入口,两阶段:本集理解→分镜生成) + publishShots(本地兜底拆分)。
 * 加载顺序:storyboard.js 之后;共享辅助经 window.SB 解构,批量操作运行时经 SB.runBatchOp(sb-batch.js)。 */
(function () {
  const { blankShot, CAMERAS, snapshotShot, buildShotPrompt, renderShots, onEpPage, VOICES } = window.SB; // SPLIT_RULES/PROMPT5 已随拆镜模板下沉 wf-core.js

  /* ================= LLM 分镜生成(失败时调用方回退本地 publishShots) ================= */
  async function genShotsLLM(p, ep, { model, count, mode, optimize, adv, feedback, opId, step }) {
    // 二十一轮:拆镜 user 模板与系统人设拼装下沉 wf-core.js(双端单一来源,逐字节一致);
    // 主体清单带已有形态(引导模型输出「名-形态」全称)由 buildSBUser 内部统一处理
    const user = WfCore.buildSBUser(p, ep, { count, mode, optimize, adv, feedback }, {
      styleText: styleOf(p),
      projType: window.projType ? projType() : 'drama',
      directorNote: window.directorInject ? directorInject(p.style) : '',
      conceptNote: window.conceptInject ? conceptInject(p) : '',
      // 生效专家方法论(分镜板块雇佣 > 全局雇佣):与服务端 /api/wf/smart-storyboard 同一装配口
      personaNote: window.personaNoteFor ? personaNoteFor(p, WfCore.WF_BOARD['smart-storyboard']) : '',
      memText: WfCore.memBlock(Store.state.agentMemory, ep.title || '', '分镜'), // 协作记忆按板块召回(与对话层同算法)
      langText: (window.langOf ? langOf(p) : WfCore.langOf(p)),
      genres: p.genres,
      understandingText: ep.understanding && window.Understanding ? Understanding.toText(ep.understanding) : '',
      eventsText: window.eventsOfEpisode ? eventsOfEpisode(p, ep) : '',
      content: (ep.content || '').slice(0, 12000),
    });
    const out = await API.chatJSON({
      model,
      system: WfCore.sbSystem(),
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

  /* 二十一轮:逐字段白名单规整下沉 wf-core.js(双端单一来源);
   * 环境差异经 ctx 注入:uid/now 取自 Store,导演设定同原内联表达式,
   * 推文占位图经 phImage 回调注入(浏览器推文模式 s.image=PH.shot(剧情,镜序),服务端不留占位) */
  function normalizeLLMShot(raw, i, p, ep, modelName, tweet) {
    return WfCore.normalizeLLMShot(raw, i, p, ep, modelName, tweet, {
      uid: Store.uid, now: Store.now,
      directorNote: window.directorInject ? directorInject(p.style) : '',
      phImage: tweet ? (s => PH.shot(s.plot, s.order)) : null,
    });
  }

  function publishLLMShots(p, ep, main, shots, modelName, tweet, opId) {
    snapshotShots(ep, '覆盖前:' + (ep.shots[0] && ep.shots[0].history && ep.shots[0].history[0] ? ep.shots[0].history[0].model || '旧分镜' : '旧分镜')); // 版本历史:整表覆盖前自动留档
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
        // 十七轮:镜像关联原 operation(opId+'_tw'+镜序 与上方 genImage 传键同式;e.__opId 兜底自动生成的键)
        U.refund(COST.tweetShot, `镜头${s.order + 1} 推文分镜图生成失败`, (e && e.__opId) || (opId ? opId + '_tw' + s.order : undefined));
        U.toast(`镜头${s.order + 1} 推文分镜图生成失败,积分已返还:` + e.message, 'error', 3500);
      } finally {
        __tweetInflight.delete(s.id);
      }
    }
  }

  /* 多角色评审打分(二十一轮:brief/user 拼装与结果钳制下沉 wf-core.js) */
  async function llmReview(shots, p, model, opId, step) {
    const out = await API.chatJSON({
      model,
      system: Prompts.get('sb.reviewSystem'),
      messages: [{ role: 'user', content: WfCore.sbReviewUser(shots, styleOf(p)) }],
      temperature: 0.4, max_tokens: 1800,
      billingAction: 'llm.smartSB', operationId: opId, step, // 评审轮次并入聚合计费(九轮:独立步骤槽位)
    });
    return WfCore.sbReviewNormalize(out);
  }

  /* ================= 多方案对比(同集并行 N 套候选拆镜,评审打分择优落定) ================= */
  /* 并行生成 N 套;步骤槽位按方案编号隔离(genA/revA…,与单方案 gen1/rev1 不撞);
   * allSettled 容忍单套失败,全败才抛给调用方走本地兜底 */
  async function genPlans(p, ep, c, planN, opId) {
    const labels = ['A', 'B', 'C'];
    const rs = await Promise.allSettled(labels.slice(0, planN).map(async lb => {
      const shots = await genShotsLLM(p, ep, { model: c.sbModel, count: c.shotCount, mode: c.sbMode, optimize: c.autoOptimize, opId, step: 'gen' + lb });
      let score = null, comments = [];
      try { const rv = await llmReview(shots, p, c.sbModel, opId, 'rev' + lb); score = rv.score; comments = rv.comments; }
      catch (e) { U.toast(`方案 ${lb} 评审打分失败(不影响采用):` + e.message, 'info', 3000); }
      return { label: lb, shots, score, comments };
    }));
    const plans = rs.filter(r => r.status === 'fulfilled').map(r => r.value);
    if (!plans.length) throw new Error((rs[0] && rs[0].reason && rs[0].reason.message) || '全部方案生成失败');
    if (plans.length < planN) U.toast(`有 ${planN - plans.length} 套方案生成失败,按 ${plans.length} 套进入对比`, 'info', 3500);
    return plans;
  }

  /* 对比弹窗:逐套列镜(景别/运镜/剧情)+ 评审分与意见;采用即覆盖分镜表(可重复切换,旧方案保留到下次智能分镜) */
  function openPlanCompare(p, ep, main) {
    const plans = ep.sbPlans || [];
    if (!plans.length) return U.toast('暂无候选方案:在「参数配置」把分镜方案数调为 2-3 套后运行智能分镜', 'info');
    const stale = pl => pl.contentRev !== (ep.contentRev || 0);
    U.openModal({
      title: '🆚 分镜方案对比 · ' + U.esc(ep.title),
      xl: true,
      body: `
      <div class="hint" style="margin:0 0 10px">同一剧本并行拆解的 ${plans.length} 套候选,五角色 AI 评审已打分;对比剧情覆盖/运镜/景别后择优落定,采用即覆盖当前分镜表(不另扣费)。</div>
      <div class="row" style="align-items:stretch;gap:10px">
        ${plans.map(pl => `
        <div class="card grow" style="min-width:0;padding:10px 12px;display:flex;flex-direction:column">
          <div class="row" style="justify-content:space-between;margin-bottom:6px">
            <b>方案 ${pl.label}</b>
            <span class="row" style="gap:4px">
              ${stale(pl) ? '<span class="tag yellow" title="该方案基于旧版剧本拆解,剧本此后有修改">旧剧本</span>' : ''}
              ${pl.score != null ? `<span class="tag ${pl.score >= 90 ? 'green' : 'cyan'}" title="五角色评审综合分">${pl.score} 分</span>` : '<span class="tag">未评分</span>'}
              ${pl.adopted ? '<span class="tag green">✓ 采用中</span>' : ''}
            </span>
          </div>
          <div class="small muted" style="margin-bottom:6px">${pl.shots.length} 镜 · 约 ${pl.shots.reduce((a, s) => a + (s.duration || 5), 0)} 秒 · ${U.esc(pl.model || '')}</div>
          ${(pl.comments || []).length ? `<div class="small muted" style="margin-bottom:8px;border-top:1px dashed var(--border2);padding-top:6px">${pl.comments.slice(0, 2).map(cm => `<div title="${U.esc(cm.role)}:${U.esc(cm.text)}">· ${U.esc(cm.role)}:${U.esc(cm.text.slice(0, 40))}${cm.text.length > 40 ? '…' : ''}</div>`).join('')}</div>` : ''}
          <div style="max-height:38vh;overflow-y:auto;border-top:1px solid var(--border2);padding-top:6px;margin-bottom:8px">
            ${pl.shots.map((s, i) => `
            <div class="small" style="padding:4px 0;border-bottom:1px dashed var(--border2);line-height:1.5">
              <span class="muted">${i + 1}.</span> <span class="tag" style="font-size:10px">${U.esc((s.cameraSpec && s.cameraSpec.shotSize) || '中景')}</span> <span class="tag" style="font-size:10px">${U.esc(s.camera)}</span> ${U.esc((s.plot || '').slice(0, 50))}
            </div>`).join('')}
          </div>
          <button class="btn sm ${pl.adopted ? '' : 'primary'} block" style="margin-top:auto" data-adopt="${pl.id}" ${pl.adopted ? 'disabled' : ''}>${pl.adopted ? '✓ 当前分镜表' : '采用此方案'}</button>
        </div>`).join('')}
      </div>`,
      footer: `<button class="btn" data-x="close">暂不采用</button>`,
      onMount(m, close) {
        m.querySelector('[data-x=close]').onclick = close;
        m.querySelectorAll('[data-adopt]').forEach(b => b.onclick = () => {
          const pl = plans.find(x => x.id === b.dataset.adopt);
          if (!pl || pl.adopted) return;
          plans.forEach(x => x.adopted = x === pl);
          close();
          publishLLMShots(p, ep, main, pl.shots, (pl.model || '') + '·方案' + pl.label, ep.sbConfig.sbMode === 'tweet', pl.id);
        });
      },
    });
  }

  /* ================= 分镜表版本历史(整表覆盖前自动留档,可预览/回滚;保留近 8 版) ================= */
  function snapshotShots(ep, label) {
    if (!ep.shots || !ep.shots.length) return;
    ep.shotHistory = ep.shotHistory || [];
    ep.shotHistory.unshift({
      id: Store.uid('sv'), time: Store.now(), label: String(label || '旧分镜').slice(0, 40),
      shots: JSON.parse(JSON.stringify(ep.shots)),
      sourceRev: ep.shotsSourceRev, graphRev: ep.shotsGraphRev, // 随版保存判旧基准,回滚一并还原
    });
    if (ep.shotHistory.length > 8) ep.shotHistory.length = 8;
  }

  /* 历史弹窗:版本列表(时间/来源/镜数/前 2 镜剧情预览);回滚前当前表自动留档 */
  function openShotHistory(p, ep, main) {
    const his = ep.shotHistory || [];
    if (!his.length) return U.toast('暂无历史版本:整表覆盖(智能分镜发布/采用方案/本地拆镜)时自动留档', 'info');
    U.openModal({
      title: '🕘 分镜版本历史 · ' + U.esc(ep.title),
      wide: true,
      body: `
      <div class="hint" style="margin:0 0 10px">每次整表覆盖前自动留档(近 8 版);回滚会把当前分镜表先留档再恢复所选版本,不另扣费。已生成素材的镜头记录保留在版本内。</div>
      ${his.map((v, i) => `
      <div class="card" style="padding:10px 12px;margin-bottom:8px">
        <div class="row" style="justify-content:space-between;margin-bottom:4px">
          <b class="small">${i === 0 ? '最近 · ' : ''}${U.esc(v.time)} · ${U.esc(v.label)}</b>
          <span class="row" style="gap:6px">
            <span class="tag">${v.shots.length} 镜</span>
            <button class="btn ghost sm" data-prev="${v.id}">预览</button>
            <button class="btn sm" data-rb="${v.id}">↩ 回滚此版</button>
          </span>
        </div>
        <div class="small muted">${v.shots.slice(0, 2).map((s, j) => `${j + 1}. ${U.esc((s.plot || '').slice(0, 36))}`).join(' · ')}${v.shots.length > 2 ? ' …' : ''}</div>
        <div data-pvbox="${v.id}" style="display:none;max-height:30vh;overflow-y:auto;border-top:1px dashed var(--border2);margin-top:6px;padding-top:6px">
          ${v.shots.map((s, j) => `<div class="small" style="padding:3px 0;border-bottom:1px dashed var(--border2)"><span class="muted">${j + 1}.</span> <span class="tag" style="font-size:10px">${U.esc((s.cameraSpec && s.cameraSpec.shotSize) || '中景')}</span> ${U.esc((s.plot || '').slice(0, 60))}</div>`).join('')}
        </div>
      </div>`).join('')}`,
      footer: `<button class="btn" data-x="close">关闭</button>`,
      onMount(m, close) {
        m.querySelector('[data-x=close]').onclick = close;
        m.querySelectorAll('[data-prev]').forEach(b => b.onclick = () => {
          const box = m.querySelector('[data-pvbox="' + b.dataset.prev + '"]');
          if (box) box.style.display = box.style.display === 'none' ? '' : 'none';
        });
        m.querySelectorAll('[data-rb]').forEach(b => b.onclick = () => {
          const v = his.find(x => x.id === b.dataset.rb);
          if (!v) return;
          U.confirm(`回滚到「${v.time} · ${v.label}」(${v.shots.length} 镜)?当前分镜表将自动留档。`, () => {
            snapshotShots(ep, '回滚前自动留档');
            ep.shots = JSON.parse(JSON.stringify(v.shots));
            ep.shotsSourceRev = v.sourceRev;
            ep.shotsGraphRev = v.graphRev;
            ep.composed = false;
            Store.save();
            close();
            U.toast(`已回滚到 ${v.time} 版本(${v.shots.length} 镜)`, 'success');
            Views.episode(main, p.id, ep.id);
          }, '回滚');
        });
      },
    });
  }

  function runSmartSB(p, ep, main, hooks) {
    if (!ep.content || !ep.content.trim()) return U.toast('本分集暂无剧本内容,请先在分集管理补充', 'error');
    if (Store.shotsStale(ep)) U.toast('源剧本在拆镜后已修改,本次智能分镜将按新剧本重新拆解(旧分镜被覆盖)', 'info', 4000); // 十轮:剧本→分镜失效传播
    const c = ep.sbConfig;
    const planN = Math.max(1, Math.min(3, +c.sbPlans || 1)); // 多方案对比:同集并行 N 套候选拆镜,评审打分后择优落定
    const tweetCost = c.sbMode === 'tweet' ? c.shotCount * COST.tweetShot : 0;
    const total = COST.smartSB * planN + tweetCost;
    // 五件套时序:先登记后扣费(扣费失败 fail),消除"已扣费但无任务记录"的中断窗口
    let tk = Tasks.start({ type: '智能分镜', model: API.isReady() ? c.sbModel : '本地生成', target: ep.title + (planN > 1 ? '·' + planN + '方案' : ''), cost: total, projectId: p.id, episodeId: ep.id });
    if (!U.charge(total, `智能分镜(${c.sbModel})${planN > 1 ? '×' + planN + '方案' : ''}${c.sbMode === 'tweet' ? '+推文分镜图×' + c.shotCount : ''}`)) { Tasks.fail(tk, '积分不足'); return; }
    // 两阶段:Step1 本集理解 → Step2 分镜生成(总价不变,理解含在内)
    // 九轮:同 opId + 各自独立 step 槽位(und/gen1/gen2/rev1/rev2)——服务端按步骤登记,
    // 聚合流程一笔扣费幂等合并;修订轮次内容不同 → 不同步骤槽位(同槽位换内容会被 409 拒)
    const finish = async () => {
      if (API.isReady()) {
        try {
          /* 多方案分支:并行 N 套候选拆镜 + 各评审 1 次打分(不自动修订),进入对比择优;
           * headless(hooks.quiet):不弹对比窗,自动采用评审最高分方案直接发布(决策留痕 ep.sbPlans 可回看官换) */
          if (planN > 1) {
            const plans = await genPlans(p, ep, c, planN, tk.id);
            ep.sbPlans = plans.map(pl => ({ id: Store.uid('pl'), label: pl.label, score: pl.score, comments: pl.comments, shots: pl.shots, model: c.sbModel, contentRev: ep.contentRev || 0, time: Store.now() }));
            Tasks.done(tk);
            Store.save();
            if (hooks && hooks.quiet) {
              const best = ep.sbPlans.slice().sort((a, b) => (b.score || 0) - (a.score || 0))[0];
              if (best) { best.adopted = true; publishLLMShots(p, ep, main, best.shots, (best.model || '') + '·方案' + best.label + '(自动择优)', ep.sbConfig.sbMode === 'tweet', best.id); }
              return ep.sbPlans.length;
            }
            openPlanCompare(p, ep, main);
            return plans.length;
          }
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
          ep.sbPlans = []; // 单方案发布即作废旧候选(对比入口随空数组隐藏)
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
      ep.sbPlans = []; // 本地兜底发布同作废旧候选
      publishShots(p, ep, main, { model: c.sbModel, tweet: c.sbMode === 'tweet', quiet: !!(hooks && hooks.quiet) });
      return ep.shots.length;
    };
    Understanding.run(p, ep, main, {
      billingAction: 'llm.smartSB', operationId: tk.id, step: 'und',
      onDone: async () => { const n = await finish(); if (hooks && hooks.done) hooks.done(n); }, // hooks:命令层结构化回执(execute('episode.generateStoryboard'))
      onError: e => { // chain 执行链意外异常:退费+置失败,不留"扣费无记录"窗口(opKey 关联计费 operation,服务端按原账单退)
        U.refund(total, '智能分镜执行异常', tk.id);
        Tasks.fail(tk, '智能分镜执行异常:' + (e && e.message || e));
        U.toast('智能分镜执行异常,已退费:' + (e && e.message || e), 'error', 3500);
        if (hooks && hooks.error) hooks.error(e);
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
    snapshotShots(ep, '覆盖前:本地拆镜'); // 版本历史:整表覆盖前自动留档
    ep.shots = shots;
    ep.status = 'storyboarded';
    ep.composed = false;
    ep.shotsSourceRev = ep.contentRev || 0; // 十轮:记录分镜对应的剧本版本(剧本修改后判旧)
    ep.shotsGraphRev = ep.graphRev || 0;    // 十二轮:记录分镜对应的事件图谱版本(图谱修订后判旧)
    Store.save();
    if (!cfg.quiet) U.confirm(`已发布 ${shots.length} 个分镜。下一步:批量生成视频?`, () => SB.runBatchOp(p, ep, main, 'video'), '批量生成视频'); // headless 不弹决策弹窗
    Views.episode(main, p.id, ep.id);
    if (cfg.tweet) genTweetImages(p, ep, main, shots); // 推文模式:占位图异步替换为真实出图
  }

  Object.assign(window.SB, { genShotsLLM, publishLLMShots, llmReview, runSmartSB, publishShots, openPlanCompare, snapshotShots, openShotHistory });
})();
