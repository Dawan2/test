/* ============ sb-board.js 分镜脚本编辑器(自 storyboard.js 拆分) ============
 * 场次 → 情绪节拍 → 分镜文字 创作层:deriveBoard 粗拆 / scriptBoardHTML 渲染 / bindScriptBoard 绑定。
 * 加载顺序:storyboard.js 之后(经 window.SB 解构 blankShot/buildShotPrompt);
 * deriveBoard 挂回 window.SB(beatboard/episodes 经 SB.deriveBoard 消费,对外引用不变)。 */
(function () {
  const { blankShot, buildShotPrompt } = window.SB;

  /* ================= 分镜脚本编辑器(场次 → 情绪节拍 → 分镜文字;生成视频前的创作层) ================= */
  /* 从集剧本自动粗拆:场次按"第X集/第X场/2-1"等标记切,节拍按段落切(AI 拆解可精化) */
  function deriveBoard(ep) {
    const text = (ep.content || '').trim();
    const scenes = [];
    const parts = text.split(/\n(?=\s*(?:第[一二三四五六七八九十0-9]+[集场]|\d+[-–]\d+|\d+、|【场景))/).filter(s2 => s2.trim());
    (parts.length ? parts : [text]).forEach((pt, i) => {
      const lines = pt.split(/\n+/).map(x => x.trim()).filter(Boolean);
      const head = lines[0] || '';
      const isMarker = /^(第[一二三四五六七八九十0-9]+[集场]|\d+[-–]\d+|\d+、|【场景)/.test(head) && head.length <= 40;
      const title = isMarker ? head : '场次 ' + (i + 1);
      const body = (isMarker ? lines.slice(1) : lines).join('\n') || pt;
      const paras = body.split(/\n+|(?<=。)/).map(x => x.trim()).filter(x => x.length > 1);
      const beats = (paras.length ? paras : [body]).map(x => ({ emotion: '', plot: x.slice(0, 60), shot: x }));
      scenes.push({ title, text: body, beats });
    });
    return { scenes };
  }

  function scriptBoardHTML(p, ep) {
    if (!ep.scriptBoard || !ep.scriptBoard.scenes) ep.scriptBoard = deriveBoard(ep);
    const bd = ep.scriptBoard;
    if (!bd._ui) bd._ui = { scenes: {}, beats: {}, level: 2 }; // level: 0=只看场次 1=展开到节拍标题 2=全部展开(默认)
    const ui = bd._ui;
    const scOpen = si => ui.level === 0 ? false : (ui.scenes[si] !== undefined ? ui.scenes[si] : true);
    const btOpen = (si, bi) => ui.level === 0 ? false : ui.level === 1 ? false : (ui.beats[si + '_' + bi] !== undefined ? ui.beats[si + '_' + bi] : true);
    const beatCnt = bd.scenes.reduce((n, sc) => n + sc.beats.length, 0);
    return `
    <div style="padding:4px 2px">
      <div class="row" style="margin-bottom:10px;gap:8px;flex-wrap:wrap">
        <b>📋 分镜脚本 · ${U.esc(ep.title)}</b>
        <span class="tag cyan">${bd.scenes.length} 场次 · ${beatCnt} 节拍</span>
        <span class="grow"></span>
        <div class="model-row" style="gap:4px">
          ${[[0, '只看场次'], [1, '展开到节拍'], [2, '全部展开']].map(([lv, lb]) => `<div class="model-opt ${ui.level === lv ? 'sel' : ''}" data-bd-level="${lv}" style="padding:3px 10px;font-size:12px">${lb}</div>`).join('')}
        </div>
        <button class="btn sm" data-x="bd-ai">✨ AI 拆解场次与节拍</button>
        <button class="btn sm" data-x="bd-draft">🧠 拆解为文字分镜</button>
        <button class="btn sm" data-x="bd-autoflow" title="一键到底:AI 拆解场次节拍 → 拆解文字分镜 → 确认为分镜表,中途不停顿;如需逐步检查修改,请用左侧分步按钮">⚡ 一键拆解并确认</button>
        <button class="btn sm" data-x="bd-addscene">＋ 添加场次</button>
        <button class="btn sm primary" data-x="bd-toshots">✅ 确认为分镜表 →</button>
      </div>
      <div class="hint" style="margin-bottom:12px">这是生成视频前的创作层:按「场次 → 剧情 → 情绪节拍 → 分镜文字」组织内容,全部可编辑;「AI 拆解」只是初稿,以你的修改为准。</div>
      <div style="max-height:calc(100vh - 320px);overflow-y:auto;display:flex;flex-direction:column;gap:12px">
        ${bd.scenes.map((sc, si) => {
          const open = scOpen(si);
          return `
        <div class="card" style="padding:12px 14px">
          <div class="row" style="gap:8px;margin-bottom:${open ? '8' : '0'}px">
            <span class="tag purple" data-sc-fold="${si}" style="cursor:pointer" title="折叠/展开该场次">${open ? '▾' : '▸'} 场次 ${si + 1}</span>
            <input class="input small grow" data-sc-title="${si}" value="${U.esc(sc.title)}" placeholder="场次标题(如 2-1 枯井水下 夜/内)">
            <span class="small muted" style="flex:none">${sc.beats.length} 节拍</span>
            <button class="btn sm ghost" data-sc-ref="${si}" title="加入对话:把该场次挂进导演助手引用,对话里精准@它">📎</button>
            <button class="btn sm danger" data-sc-del="${si}" title="删除该场次">🗑</button>
          </div>
          ${!open ? `<div class="small muted" style="margin-top:6px;cursor:pointer" data-sc-fold="${si}">${U.esc((sc.text || '').slice(0, 60))}…</div>` : `
          <label class="field" style="margin-bottom:8px"><span class="small muted">场次剧情(原文/梗概)</span>
            <textarea class="input small" rows="2" data-sc-text="${si}">${U.esc(sc.text)}</textarea></label>
          ${sc.beats.map((b, bi) => {
            const bOpen = btOpen(si, bi);
            return !bOpen ? `
          <div class="row" data-bt-fold="${si}_${bi}" style="gap:8px;padding:5px 10px;margin:6px 0;background:var(--panel2);border-radius:8px;cursor:pointer;align-items:center" title="点击展开该节拍">
            <span class="small muted" style="flex:none">▸ 节拍 ${bi + 1}</span>
            ${b.emotion ? `<span class="tag cyan" style="font-size:10px">${U.esc(b.emotion)}</span>` : ''}
            <span class="small" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${U.esc((b.plot || b.shot || '(空)').slice(0, 42))}</span>
            <button class="btn ghost sm" data-bt-ref="${si}_${bi}" title="加入对话:把该节拍挂进导演助手引用" style="flex:none;padding:2px 6px">📎</button>
          </div>` : `
          <div style="border-left:3px solid var(--accent);padding:6px 10px;margin:8px 0;background:var(--panel2);border-radius:0 8px 8px 0">
            <div class="row" style="gap:6px;margin-bottom:6px">
              <span class="small muted" style="flex:none;cursor:pointer" data-bt-fold="${si}_${bi}" title="折叠该节拍">▾ 节拍 ${bi + 1}</span>
              <input class="input small" data-bt-emo="${si}_${bi}" value="${U.esc(b.emotion)}" placeholder="情绪节拍(如:压抑/铺垫/反转/爆发)" style="width:200px">
              <span class="grow"></span>
              <button class="btn ghost sm" data-bt-ref="${si}_${bi}" title="加入对话:把该节拍挂进导演助手引用">📎</button>
              <button class="btn ghost sm" data-bt-del="${si}_${bi}" title="删除该节拍">✕</button>
            </div>
            <input class="input small" data-bt-plot="${si}_${bi}" value="${U.esc(b.plot)}" placeholder="该节拍剧情(一句话)" style="margin-bottom:6px">
            <textarea class="input small" rows="2" data-bt-shot="${si}_${bi}" placeholder="分镜文字:用于画面连续表达的镜头内容(谁在哪、做什么、什么氛围)">${U.esc(b.shot)}</textarea>
            ${(b.shotsDraft || []).length ? `
            <div style="margin-top:6px;border-top:1px dashed var(--border2);padding-top:6px">
              <div class="small muted" style="margin-bottom:4px">文字分镜(${b.shotsDraft.length} 条,可编辑):</div>
              ${b.shotsDraft.map((d, di) => `
              <div class="row" style="gap:6px;margin-bottom:5px;align-items:flex-start">
                <span class="tag cyan" style="font-size:10px;flex:none;margin-top:6px">${bi + 1}-${di + 1}</span>
                <textarea class="input small" rows="1" data-draft="${si}_${bi}_${di}" style="font-size:12px">${U.esc(d)}</textarea>
                <button class="btn ghost sm" data-draft-del="${si}_${bi}_${di}" style="flex:none" title="删除">✕</button>
              </div>`).join('')}
            </div>` : ''}
            <div class="row" style="margin-top:4px">
              <button class="btn ghost sm" data-draft-add="${si}_${bi}" style="font-size:11px">＋ 文字分镜</button>
            </div>
          </div>`; }).join('')}
          <button class="btn ghost sm" data-bt-add="${si}" style="margin-top:4px">＋ 添加节拍</button>`}
        </div>`; }).join('')}
      </div>
    </div>`;
  }

  /* 编辑绑定:输入失焦即存(不重渲保焦点);增删场次/节拍后重渲 */
  function bindScriptBoard(host, p, ep, main, inModal) {
    const bd = ep.scriptBoard;
    const rerender = inModal
      ? () => { host.innerHTML = scriptBoardHTML(p, ep); bindScriptBoard(host, p, ep, main, true); }
      : () => Views.episode(main, p.id, ep.id);
    // 索引关联:用户聚焦/点击某场次或节拍时记录定位(window.__focus),导演助手据此自动 @ 关联当前操作板块
    // focusin+click 双通道:覆盖键盘聚焦与鼠标点选(部分环境 focus 事件被抑制时 click 兜底)
    const setFocus = f => { window.__focus = Object.assign({ pid: p.id, eid: ep.id }, f); if (window.Agent && Agent.refreshFocusChip) Agent.refreshFocusChip(); };
    const trackFocus = e => {
      const d = e.target && e.target.dataset; if (!d) return;
      if (d.btEmo || d.btPlot || d.btShot) { const [a, b] = (d.btEmo || d.btPlot || d.btShot).split('_').map(Number); setFocus({ kind: 'beat', si: a, bi: b }); }
      else if (d.draft) { const [a, b] = d.draft.split('_').map(Number); setFocus({ kind: 'beat', si: a, bi: b }); }
      else if (d.scTitle !== undefined || d.scText !== undefined) setFocus({ kind: 'scene', si: +(d.scTitle !== undefined ? d.scTitle : d.scText) });
    };
    host.addEventListener('focusin', trackFocus);
    host.addEventListener('click', trackFocus);
    // 层级折叠:场次/节拍/全局层级(状态存 bd._ui,随 state 持久化)
    host.querySelectorAll('[data-sc-fold]').forEach(el => el.onclick = e => {
      if (e.target && e.target.closest && e.target.closest('input,textarea,button')) return;
      const si = +el.dataset.scFold;
      setFocus({ kind: 'scene', si });
      const curOpen = bd._ui.scenes[si] !== undefined ? bd._ui.scenes[si] : true;
      bd._ui.level = 2; // 单点操作后脱离全局"只看场次"态
      bd._ui.scenes[si] = !curOpen;
      Store.save(); rerender();
    });
    host.querySelectorAll('[data-bt-fold]').forEach(el => el.onclick = e => {
      if (e.target && e.target.closest && e.target.closest('input,textarea,button')) return;
      const key = el.dataset.btFold;
      const [fsi, fbi] = key.split('_').map(Number);
      setFocus({ kind: 'beat', si: fsi, bi: fbi });
      const curOpen = bd._ui.beats[key] !== undefined ? bd._ui.beats[key] : true;
      bd._ui.level = 2;
      bd._ui.beats[key] = !curOpen;
      Store.save(); rerender();
    });
    host.querySelectorAll('[data-bd-level]').forEach(el => el.onclick = () => {
      bd._ui.level = +el.dataset.bdLevel;
      bd._ui.scenes = {}; bd._ui.beats = {}; // 全局层级切换时清掉单点状态
      Store.save(); rerender();
    });
    host.querySelectorAll('[data-sc-title]').forEach(el => el.onchange = () => { bd.scenes[+el.dataset.scTitle].title = el.value; Store.save(); });
    host.querySelectorAll('[data-sc-text]').forEach(el => el.onchange = () => { bd.scenes[+el.dataset.scText].text = el.value; Store.save(); });
    host.querySelectorAll('[data-bt-emo]').forEach(el => el.onchange = () => { const [a, b] = el.dataset.btEmo.split('_'); bd.scenes[+a].beats[+b].emotion = el.value; Store.save(); });
    host.querySelectorAll('[data-bt-plot]').forEach(el => el.onchange = () => { const [a, b] = el.dataset.btPlot.split('_'); bd.scenes[+a].beats[+b].plot = el.value; Store.save(); });
    host.querySelectorAll('[data-bt-shot]').forEach(el => el.onchange = () => { const [a, b] = el.dataset.btShot.split('_'); bd.scenes[+a].beats[+b].shot = el.value; Store.save(); });
    host.querySelectorAll('[data-sc-del]').forEach(el => el.onclick = () => {
      bd.scenes.splice(+el.dataset.scDel, 1); Store.save(); rerender();
    });
    host.querySelectorAll('[data-bt-del]').forEach(el => el.onclick = () => {
      const [a, b] = el.dataset.btDel.split('_'); bd.scenes[+a].beats.splice(+b, 1); Store.save(); rerender();
    });
    host.querySelectorAll('[data-bt-add]').forEach(el => el.onclick = () => {
      bd.scenes[+el.dataset.btAdd].beats.push({ emotion: '', plot: '', shot: '' }); Store.save(); rerender();
    });
    // 📎 加入对话:场次/节拍挂进导演助手引用(集级面板 chips,发送时活内容注入 LLM);弹窗内只加引用不开面板
    const refOpen = ok => { if (ok && !inModal && !ep.agentOpen) { ep.agentOpen = true; Store.save(); Views.episode(main, p.id, ep.id); } };
    host.querySelectorAll('[data-sc-ref]').forEach(el => el.onclick = () => {
      const si = +el.dataset.scRef;
      refOpen(AgentRefs.add({ kind: 'scene', pid: p.id, eid: ep.id, id: String(si), label: `@场次${si + 1}${bd.scenes[si] && bd.scenes[si].title ? '·' + String(bd.scenes[si].title).slice(0, 8) : ''}` }));
    });
    host.querySelectorAll('[data-bt-ref]').forEach(el => el.onclick = () => {
      const [a, b] = el.dataset.btRef.split('_').map(Number);
      refOpen(AgentRefs.add({ kind: 'beat', pid: p.id, eid: ep.id, id: a + '_' + b, label: `@场次${a + 1}·节拍${b + 1}` }));
    });
    // 文字分镜(节拍下一级):增删改
    host.querySelectorAll('[data-draft]').forEach(el => el.onchange = () => {
      const [a, b, d] = el.dataset.draft.split('_').map(Number);
      bd.scenes[a].beats[b].shotsDraft[d] = el.value; Store.save();
    });
    host.querySelectorAll('[data-draft-add]').forEach(el => el.onclick = () => {
      const [a, b] = el.dataset.draftAdd.split('_').map(Number);
      const beat = bd.scenes[a].beats[b];
      beat.shotsDraft = beat.shotsDraft || [];
      beat.shotsDraft.push(beat.shot || beat.plot || '');
      Store.save(); rerender();
    });
    host.querySelectorAll('[data-draft-del]').forEach(el => el.onclick = () => {
      const [a, b, d] = el.dataset.draftDel.split('_').map(Number);
      bd.scenes[a].beats[b].shotsDraft.splice(d, 1); Store.save(); rerender();
    });
    /* ---- 三步拆解函数(分步按钮与「⚡ 一键到底」共用;均读 ep.scriptBoard 实时引用,按钮 DOM 状态由调用方管理) ---- */
    // ① AI 拆解场次与节拍:成功 true(内部 save+toast+重渲);失败/离线 false(内部 toast,不重渲,调用方恢复按钮)
    const aiSplit = async () => {
      if (!API.isReady()) { U.toast('AI 拆解需要真实 LLM(请登录后端)', 'error', 3000); return false; }
      try {
        const out = await API.chatJSON({
          model: ep.sbConfig.sbModel,
          system: '你是顶级短剧编剧,擅长场次与情绪节拍拆解。',
          messages: [{ role: 'user', content: `将以下剧本(单集)拆解为结构化分镜脚本,返回 JSON:
{"scenes":[{"title":"场次标题(沿用原文场次标记,如 2-1 枯井水下 夜/内)","text":"该场剧情梗概(保留原文关键信息)","beats":[{"emotion":"情绪节拍(如 压抑/铺垫/反转/爆发/释怀)","plot":"该节拍剧情(一句话)","shot":"分镜文字:画面化的镜头内容描述(谁在哪、做什么、氛围光影),用于连续画面表达"}]}]}
要求:按场次组织;每场 2-5 个节拍,按剧情发展顺序;shot 必须是可视化描述,不要抽象概括;不要编造原文没有的剧情。
${window.eventsOfEpisode && eventsOfEpisode(p, ep) ? '★ 本集事件图谱(剧情骨架,拆解需依序覆盖以下事件,不得遗漏转折点):\n' + eventsOfEpisode(p, ep) + '\n' : ''}
剧本:
${(ep.content || '').slice(0, 8000)}` }],
          temperature: 0.5, max_tokens: 6000,
        });
        if (!out || !Array.isArray(out.scenes) || !out.scenes.length) throw new Error('LLM 未返回有效拆解结构');
        ep.scriptBoard = {
          scenes: out.scenes.map(sc => ({
            title: String(sc.title || ''), text: String(sc.text || ''),
            beats: (Array.isArray(sc.beats) ? sc.beats : []).map(b => ({ emotion: String(b.emotion || ''), plot: String(b.plot || ''), shot: String(b.shot || '') })),
          })).filter(sc => sc.beats.length),
        };
        Store.save();
        U.toast(`AI 拆解完成:${ep.scriptBoard.scenes.length} 场次`, 'success');
        rerender();
        return true;
      } catch (e) { U.toast('AI 拆解失败:' + e.message, 'error', 3500); return false; }
    };
    // ② 拆解为文字分镜:LLM 把每个节拍拆成 1-3 条文字分镜;LLM 失败/离线回退本地按句粗拆(不中断流程),恒 true;重渲由调用方
    const draftSplit = async () => {
      const cur = ep.scriptBoard; // ① 成功后会替换 scriptBoard,必须实时引用
      const localSplit = () => cur.scenes.forEach(sc => sc.beats.forEach(b => {
        const parts = String(b.shot || b.plot || '').split(/(?<=[。!?;])|\n+/).map(x => x.trim()).filter(x => x.length > 1);
        b.shotsDraft = parts.length ? parts : [b.shot || b.plot || ''];
      }));
      if (!API.isReady()) {
        localSplit();
        Store.save();
        U.toast('离线模式:已按句粗拆(登录后端可用 AI 精拆)', 'info', 3000);
        return true;
      }
      try {
        const brief = cur.scenes.map((sc, si) => `场次${si + 1}「${sc.title}」:\n` + sc.beats.map((b, bi) => `  节拍${si + 1}.${bi + 1}[${b.emotion || '平'}] ${b.plot || b.shot}`).join('\n')).join('\n');
        const out = await API.chatJSON({
          model: ep.sbConfig.sbModel,
          system: '你是顶级短剧分镜师,擅长把情绪节拍拆成连续画面表达的文字分镜。',
          messages: [{ role: 'user', content: `把以下分集脚本的每个节拍拆成 1-3 条文字分镜,返回 JSON:
{"beats":[{"key":"场次号.节拍号(如 1.2)","shots":["文字分镜1","文字分镜2"]}]}
每条文字分镜 = 一个连续画面镜头的可视化描述(谁在哪、做什么动作、景别氛围),镜头之间要有叙事连续性;不编造原文没有的剧情。
脚本:
${brief.slice(0, 6000)}` }],
          temperature: 0.5, max_tokens: 6000,
        });
        if (!out || !Array.isArray(out.beats)) throw new Error('LLM 未返回有效分镜结构');
        out.beats.forEach(ob => {
          const m = String(ob.key || '').match(/(\d+)\.(\d+)/);
          if (!m) return;
          const sc = cur.scenes[+m[1] - 1];
          const beat = sc && sc.beats[+m[2] - 1];
          if (beat && Array.isArray(ob.shots) && ob.shots.length) beat.shotsDraft = ob.shots.map(String);
        });
        Store.save();
        U.toast('已拆解为文字分镜,请在页内检查修改后「确认为分镜表」', 'success', 3000);
        return true;
      } catch (e) {
        U.toast('AI 拆解失败,已按句粗拆:' + e.message, 'error', 3500);
        localSplit();
        Store.save();
        return true;
      }
    };
    // ③ 确认为分镜表:有文字分镜一条一镜,无则节拍本身一镜(覆盖确认由调用方处理)
    const toShots = () => {
      const cur = ep.scriptBoard;
      const charNames = p.subjects.filter(s => s.kind === 'character').map(s => s.name);
      const shots = [];
      cur.scenes.forEach(sc => sc.beats.forEach(b => {
        // 有文字分镜(下一级)则一条一镜;没有则节拍本身一镜
        const units = (b.shotsDraft || []).filter(x => x.trim());
        const lines = units.length ? units : [(b.shot || b.plot || sc.text)];
        lines.forEach((text, ui) => {
          if (!text || !text.trim()) return;
          const s = blankShot(shots.length, ep.sbConfig);
          s.name = (sc.title || '').slice(0, 10) + (b.emotion ? '·' + b.emotion : '') + (lines.length > 1 ? '·' + (ui + 1) : '');
          s.plot = (b.plot || text).slice(0, 120);
          s.characters = charNames.filter(nm => text.includes(nm)).slice(0, 3);
          s.scene = (sc.title || '').replace(/^第[一二三四五六七八九十0-9]+[集场]\s*/, '').split(/[\s,，]/)[0] || '';
          s.prompt = buildShotPrompt(p, { plot: text.slice(0, 80), emotion: b.emotion });
          if (window.projType && projType() === 'narration') s.narration = (b.plot || text).slice(0, 60);
          s.history = [{ type: '分镜', model: '分镜脚本转换', time: Store.now() }];
          shots.push(s);
        });
      }));
      if (!shots.length) return U.toast('节拍内容为空,无法转换', 'error');
      ep.shots = shots;
      ep.status = 'storyboarded';
      ep.composed = false;
      Store.state.settings = Store.state.settings || {};
      Store.state.settings.epViewMode = 'shots'; // 确认后进入分镜表/生成台(全局视图偏好)
      Store.save();
      U.toast(`已生成 ${shots.length} 个分镜,进入生成环节`, 'success', 3000);
      if (inModal) { document.querySelector('.modal-mask .modal-close').click(); }
      Views.episode(main, p.id, ep.id);
    };
    // 拆解为文字分镜(分步按钮):页内展示不跳页
    const draftBtn = host.querySelector('[data-x=bd-draft]');
    if (draftBtn) draftBtn.onclick = async () => {
      draftBtn.disabled = true; draftBtn.innerHTML = '<span class="spinner"></span> 拆解中…';
      await draftSplit();
      rerender();
    };
    const addSc = host.querySelector('[data-x=bd-addscene]');
    if (addSc) addSc.onclick = () => {
      bd.scenes.push({ title: '场次 ' + (bd.scenes.length + 1), text: '', beats: [{ emotion: '', plot: '', shot: '' }] });
      Store.save(); rerender();
    };
    const aiBtn = host.querySelector('[data-x=bd-ai]');
    if (aiBtn) aiBtn.onclick = async () => {
      aiBtn.disabled = true; aiBtn.innerHTML = '<span class="spinner"></span> 拆解中…';
      const ok = await aiSplit(); // 成功内部已重渲(按钮随视图卸载);失败不重渲,恢复按钮
      if (!ok) { aiBtn.disabled = false; aiBtn.textContent = '✨ AI 拆解场次与节拍'; }
    };
    // ⚡ 一键到底:①→②→③ 中途不停顿(覆盖确认入口一次问清);分步按钮保留逐步检查修改的控制感
    const autoBtn = host.querySelector('[data-x=bd-autoflow]');
    if (autoBtn) autoBtn.onclick = async () => {
      if (!API.isReady()) return U.toast('一键拆解需要真实 LLM(请登录后端);离线可用「🧠 拆解为文字分镜」本地粗拆分步执行', 'error', 3600);
      const go = async () => {
        autoBtn.disabled = true; autoBtn.innerHTML = '<span class="spinner"></span> ① 拆解场次节拍…';
        if (!await aiSplit()) { autoBtn.disabled = false; autoBtn.innerHTML = '⚡ 一键拆解并确认'; return; } // ① 失败不重渲,恢复按钮
        await draftSplit(); // ② LLM 失败自动回退本地粗拆,不中断
        toShots();          // ③ 转换落分镜表(内部跳分镜视频视图)
      };
      if (ep.shots.length) U.confirm(`一键到底:AI 拆解场次节拍 → 拆解文字分镜 → 确认为分镜表(覆盖现有 ${ep.shots.length} 个分镜),中途不停顿;如需逐步检查修改请用分步按钮。确定继续吗?`, go, '一键到底');
      else go();
    };
    const toBtn = host.querySelector('[data-x=bd-toshots]');
    if (toBtn) toBtn.onclick = () => {
      const beatsTotal = ep.scriptBoard.scenes.reduce((n, sc) => n + sc.beats.length, 0);
      if (!beatsTotal) return U.toast('请先添加场次与节拍', 'error');
      if (ep.shots.length) U.confirm(`当前已有 ${ep.shots.length} 个分镜,转换将覆盖,确定继续吗?`, toShots, '覆盖转换');
      else toShots();
    };
  }

  Object.assign(window.SB, { deriveBoard, scriptBoardHTML, bindScriptBoard });
})();
