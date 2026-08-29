/* ============ shotgroups.js 镜头组 ============
 * 按"场景+出场角色"把分镜自动分组;组级绑定参考资产(角色/场景主体图,只绑一次)+
 * 组级一致性前缀词(整组生成时注入每镜 prompt),从源头压住跨镜角色/场景漂移。
 * 分集工作区中栏「镜头组」tab 页内视图:组卡片管理 + 分镜时间线(移动到组)。
 */
(function () {
  window.ShotGroups = {};

  /* 主体防崩坏约束词,作为新建组的默认前缀(单一来源:store.js window.CONSIST_PREFIX) */
  const DEFAULT_PREFIX = window.CONSIST_PREFIX;

  const groupsOf = ep => (ep.groups = ep.groups || []);
  const sigOf = s => (s.scene || '未知场景') + '|' + (s.characters || []).slice().sort().join('、');
  const groupShots = (ep, g) => ep.shots.filter(s => s.groupId === g.id);
  const totalDur = shots => shots.reduce((sum, s) => sum + (window.SB && SB.estShotDuration ? SB.estShotDuration(s) : (s.duration || 5)), 0);

  /* ---------- 自动分组:按 场景+角色 签名聚合,保留已有组的前缀/资产/命名 ---------- */
  ShotGroups.autoGroup = function (p, ep) {
    const gs = groupsOf(ep);
    const bySig = {};
    ep.shots.forEach(s => { const k = sigOf(s); (bySig[k] = bySig[k] || []).push(s); });
    Object.keys(bySig).forEach(k => {
      const [scene, charsStr] = k.split('|');
      let g = gs.find(x => x.sig === k);
      if (!g) {
        g = { id: Store.uid('sg'), sig: k, name: '', nameManual: false, scene, chars: charsStr ? charsStr.split('、') : [], prefix: DEFAULT_PREFIX, assets: {}, sceneImage: '' };
        gs.push(g);
      }
      if (!g.nameManual) g.name = `${scene}-${charsStr || '无角色'}-组${gs.indexOf(g) + 1}`;
      bySig[k].forEach(s => { s.groupId = g.id; });
    });
    Store.save();
    return gs.length;
  };

  /* 分场元数据(日夜/内外/功能/情绪),整组生成时拼入 effPrompt(prefix 之后) */
  const META_DEFS = [
    ['day', '日夜', ['日景', '夜景', '黄昏', '清晨']],
    ['place', '内外', ['室内', '室外']],
    ['func', '功能', ['铺垫', '冲突', '高潮', '反转', '悬念']],
    ['mood', '情绪', ['平静', '紧张', '压抑', '激昂', '悲伤', '喜悦']],
  ];
  function groupMetaStr(g) {
    const m = g.meta || {};
    return [m.day, m.place, m.func ? m.func + '段' : '', m.mood ? m.mood + '氛围' : ''].filter(Boolean).join(',');
  }

  /* ---------- 组级批量生成视频(复用批量生成模式,注入组前缀) ---------- */
  async function genGroupVideo(p, ep, main, g, done) {
    const pend = groupShots(ep, g).filter(s => !s.final && (!s.video || s.video.status !== 'done'));
    if (!pend.length) return U.toast('该组所有分镜均已生成视频', 'info');
    const start = (shots, onDone) => {
      // 真人审核预审:分镜引用图 + 组绑定资产图一并校验
      if (window.HumanReview) {
        const urls = [...new Set(shots.flatMap(s => HumanReview.shotImageUrls(p, s))
          .concat(Object.values(g.assets || {}), g.sceneImage || []))].filter(Boolean);
        return HumanReview.guard(urls, () => genGroupVideoRun(p, ep, main, g, shots, onDone));
      }
      return genGroupVideoRun(p, ep, main, g, shots, onDone);
    };
    if (pend.length <= 3) return start(pend, done);
    // >3 镜:断点校准,先跑前 3 镜确认效果再放量
    U.openModal({
      title: '生成全组视频 · ' + g.name,
      body: `<p style="line-height:2">将为组内 <b>${pend.length}</b> 个未出片分镜生成视频(每镜 <b style="color:var(--yellow)">${COST.video}</b> 积分)。<br>· <b>逐条扣减</b>:每镜单独扣费,余额不足时仅该镜失败<br>· 单镜失败自动返还该镜积分<br>· 建议先校准前 3 镜,确认效果后再放量</p>`,
      footer: `<button class="btn" data-x="cancel">取消</button><button class="btn" data-x="all">直接全部生成</button><button class="btn primary" data-x="first3">先校准前 3 镜(-${3 * COST.video}积分)</button>`,
      onMount(m, close) {
        m.querySelector('[data-x=cancel]').onclick = close;
        m.querySelector('[data-x=all]').onclick = () => { close(); start(pend, done); };
        m.querySelector('[data-x=first3]').onclick = () => {
          close();
          // 前 3 镜实际完成后才询问放量(guard 拦截时 done 不会触发,不弹继续窗)
          const showRest = () => {
            done && done();
            const rest = pend.slice(3).filter(s => !s.video || s.video.status !== 'done');
            if (!rest.length) return;
            U.confirm(`前 3 镜已生成。继续生成剩余 ${rest.length} 镜(约 ${rest.length * COST.video} 积分,逐条扣减)?`, () => start(rest, done), '继续生成');
          };
          start(pend.slice(0, 3), showRest);
        };
      },
    });
  }
  /* 生成实现复用 storyboard 的批量逻辑(逐条扣费/音色参考/同步语音/重置合成态两边一致) */
  async function genGroupVideoRun(p, ep, main, g, pend, done) {
    // 分场元数据拼在组前缀之后注入每镜 effPrompt(如"日景,室内,悬念段,紧张氛围")
    const ms = groupMetaStr(g);
    const prefix = (g.prefix || '') + (ms ? (g.prefix ? ' ' : '') + ms : '');
    return window.SB.batchGenVideos(p, ep, main, pend, { groupName: g.name, prefix }, done);
  }

  /* ---------- 资产绑定弹窗:为组内每个角色/场景选定参考主体图 ---------- */
  function openBindAssets(p, ep, g, done) {
    // 候选:项目主体 + 资产库主体(有图的)
    const lib = Store.myAssets().filter(a => a.image).map(a => ({ name: a.name, image: a.image, from: '资产库' }));
    const proj = (p.subjects || []).flatMap(s => {
      const arr = s.image ? [{ name: s.name, image: s.image, from: '本项目' }] : [];
      (s.forms || []).forEach(f => { if (f.image) arr.push({ name: s.name + '-' + f.name, image: f.image, from: '本项目·形态' }); });
      return arr;
    });
    const slots = (g.chars || []).map(c => ({ key: c, kind: 'character' }))
      .concat(g.scene ? [{ key: g.scene, kind: 'scene' }] : []);
    if (!slots.length) return U.toast('该组没有角色/场景,无需绑定资产', 'info');
    const opts = slot => {
      const all = proj.concat(lib);
      return `<option value="">(不绑定)</option>` + all.map(s =>
        `<option value="${U.esc(s.image)}" ${(slot.kind === 'scene' ? g.sceneImage : (g.assets || {})[slot.key]) === s.image ? 'selected' : ''}>${U.esc(s.name)}(${s.from})</option>`).join('');
    };
    U.openModal({
      title: '绑定资产 · ' + g.name,
      body: `
      <div class="hint" style="margin:0 0 10px">组级资产只绑一次,整组生成时作为参考图注入。同名主体已自动预选。</div>
      ${slots.map(slot => `
      <div class="row" style="gap:10px;margin-bottom:10px;align-items:center">
        <span class="tag ${slot.kind === 'scene' ? 'green' : 'cyan'}" style="flex:none">${slot.kind === 'scene' ? '🏞 场景' : '👤 角色'}</span>
        <b class="small" style="width:90px;flex:none;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${U.esc(slot.key)}</b>
        <select class="select small grow" data-bind="${slot.kind === 'scene' ? '@scene' : U.esc(slot.key)}">${opts(slot)}</select>
      </div>`).join('')}`,
      footer: `<button class="btn" data-x="cancel">取消</button><button class="btn primary" data-x="ok">保存绑定</button>`,
      onMount(m, close) {
        // 同名主体自动预选(未绑定时)
        m.querySelectorAll('[data-bind]').forEach(sel => {
          if (sel.value) return;
          const key = sel.dataset.bind;
          const want = key === '@scene' ? g.scene : key;
          const match = [...sel.options].find(o => o.text.startsWith(want + '('));
          if (match) sel.value = match.value;
        });
        m.querySelector('[data-x=cancel]').onclick = close;
        m.querySelector('[data-x=ok]').onclick = () => {
          g.assets = g.assets || {};
          m.querySelectorAll('[data-bind]').forEach(sel => {
            const key = sel.dataset.bind;
            if (key === '@scene') g.sceneImage = sel.value;
            else if (sel.value) g.assets[key] = sel.value;
            else delete g.assets[key];
          });
          Store.save(); close();
          U.toast('组资产已绑定', 'success');
          done && done();
        };
      },
    });
  }

  /* ---------- 镜头组视图(分集工作区中栏「镜头组」tab,页内挂载;box=中栏容器) ----------
   * dupMarks 是集级顶栏那一份扫描派生出的逐行位次(Domain.dupIdMarks),本视图只渲不算:
   * 下面那条分镜时间线是这一档唯一渲得出分镜行的地方,同 id 那几行的重复标记挂在它上面。 */
  ShotGroups.renderInto = function (box, p, ep, main, dupMarks) {
    renderPanel();
    function renderPanel() {
      const gs = groupsOf(ep);
      const groupedCnt = ep.shots.filter(s => s.groupId).length;
      box.innerHTML = `
      <div class="row" style="margin-bottom:12px;justify-content:space-between">
        <span class="small muted">按"场景 + 出场角色"自动分组 · 已分组 ${groupedCnt}/${ep.shots.length} 镜 · 共 ${totalDur(ep.shots)}s</span>
        <button class="btn sm primary" data-x="autogroup">⚡ 自动分组</button>
      </div>
      ${!gs.length ? '<div class="empty" style="padding:26px"><div class="ico">🗂</div><p class="small">还没有镜头组,点击「自动分组」按场景+角色聚合分镜</p></div>' : `
      <div style="margin-bottom:14px">
        ${gs.map(g => {
          const shots = groupShots(ep, g);
          const doneCnt = shots.filter(s => Store.shotVideoReady(s)).length; // 统一就绪判定:在线时模拟占位不算出片
          return `
          <div class="card" style="padding:12px 14px;margin-bottom:10px">
            <div class="row" style="justify-content:space-between;margin-bottom:8px">
              <div class="row" style="gap:6px;min-width:0;flex-wrap:wrap">
                <b class="small" data-grename="${g.id}" title="点击重命名" style="cursor:pointer">${U.esc(g.name)} ✏</b>
                <span class="tag green">🏞 ${U.esc(g.scene)}</span>
                ${(g.chars || []).map(c => `<span class="tag cyan">👤 ${U.esc(c)}</span>`).join('')}
                ${Object.keys(g.meta || {}).map(k => `<span class="tag purple">${U.esc(g.meta[k])}</span>`).join('')}
                ${(ep.beats || []).filter(bt => bt.groupId === g.id).map(bt => `<span class="tag yellow" title="已绑定到节拍板(1节拍=1镜头组)">🥁 Beat${bt.idx}</span>`).join('')}
              </div>
              <span class="small muted" style="flex:none">${doneCnt}/${shots.length} 镜已出 · ${totalDur(shots)}s</span>
            </div>
            <div class="row" style="gap:8px;margin-bottom:8px;align-items:center;flex-wrap:wrap">
              ${(g.chars || []).map(c => {
                const img = (g.assets || {})[c];
                return `<div style="text-align:center">
                  <div style="width:52px;height:52px;border-radius:8px;overflow:hidden;background:var(--bg2);display:flex;align-items:center;justify-content:center;border:1px solid ${img ? 'var(--accent)' : 'var(--border)'}">
                    ${img ? `<img src="${U.thumb(img)}" style="width:100%;height:100%;object-fit:cover">` : '<span class="small muted" style="font-size:10px">待绑定</span>'}
                  </div>
                  <div class="small muted" style="font-size:10px;max-width:52px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${U.esc(c)}</div>
                </div>`;
              }).join('')}
              ${g.scene ? `<div style="text-align:center">
                <div style="width:52px;height:52px;border-radius:8px;overflow:hidden;background:var(--bg2);display:flex;align-items:center;justify-content:center;border:1px solid ${g.sceneImage ? 'var(--green)' : 'var(--border)'}">
                  ${g.sceneImage ? `<img src="${U.thumb(g.sceneImage)}" style="width:100%;height:100%;object-fit:cover">` : '<span class="small muted" style="font-size:10px">待绑定</span>'}
                </div>
                <div class="small muted" style="font-size:10px;max-width:52px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${U.esc(g.scene)}</div>
              </div>` : ''}
              <button class="btn sm" data-gbind="${g.id}">⊕ 绑定资产</button>
            </div>
            <textarea class="input small" rows="2" data-gprefix="${g.id}" placeholder="组级一致性前缀词,整组生成时注入每镜 prompt">${U.esc(g.prefix || '')}</textarea>
            <div class="row" style="gap:6px;margin-top:8px;flex-wrap:wrap;align-items:center">
              <span class="small muted" style="flex:none">分场:</span>
              ${META_DEFS.map(([k, label, opts]) => `
              <select class="select small" style="width:auto;flex:none" data-gmeta="${g.id}:${k}" title="${label}">
                <option value="">${label}</option>
                ${opts.map(o => `<option ${((g.meta || {})[k] === o) ? 'selected' : ''}>${o}</option>`).join('')}
              </select>`).join('')}
            </div>
            <div class="row" style="gap:6px;margin-top:8px">
              <button class="btn sm primary" data-ggen="${g.id}" ${doneCnt === shots.length && shots.length ? 'disabled' : ''}>🎬 生成全组视频(-${COST.video * (shots.length - doneCnt)}积分)</button>
              <button class="btn sm" data-glocate="${g.id}">定位到分镜</button>
              <button class="btn sm danger" data-gdel="${g.id}">解散组</button>
            </div>
          </div>`;
        }).join('')}
      </div>`}
      <b class="small">🕐 分镜时间线(${ep.shots.length} 镜 · ${totalDur(ep.shots)}s)</b>
      <div style="margin-top:8px">
        ${ep.shots.map((s, i) => `
        <div class="row" style="gap:8px;padding:6px 4px;border-bottom:1px solid var(--border);align-items:center">
          <span class="small muted" style="width:34px;flex:none">#${i + 1}</span>
          <span class="small grow" style="cursor:pointer;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" data-tlshot="${s.id}" title="点击定位到该分镜(切到分镜视频视图)">${U.esc(s.name || (s.plot || '').slice(0, 24) || '镜头' + (i + 1))}</span>
          ${SBViews.dupRowTag(dupMarks, ep.shots.indexOf(s))}
          <span class="small muted" style="flex:none">${(window.SB && SB.estShotDuration ? SB.estShotDuration(s) : (s.duration || 5))}s</span>
          <select class="select small" style="width:170px;flex:none" data-tlmove="${s.id}">
            <option value="">未分组</option>
            ${gs.map(g => `<option value="${g.id}" ${s.groupId === g.id ? 'selected' : ''}>${U.esc(g.name)}</option>`).join('')}
          </select>
        </div>`).join('') || '<div class="empty" style="padding:20px"><p class="small">暂无分镜</p></div>'}
      </div>`;

      /* ---- 事件 ---- */
      const rerender = () => renderPanel();
      // 定位到分镜:选中该镜并切回「分镜视频」视图
      const locate = sid => {
        ep.uiSel = sid;
        Store.state.settings = Store.state.settings || {};
        Store.state.settings.epViewMode = 'shots';
        Store.save();
        Views.episode(main, p.id, ep.id);
      };
      box.querySelector('[data-x=autogroup]').onclick = () => {
        if (!ep.shots.length) return U.toast('暂无分镜可分组', 'error');
        const n = ShotGroups.autoGroup(p, ep);
        U.toast(`自动分组完成,共 ${n} 个镜头组`, 'success');
        rerender();
      };
      box.querySelectorAll('[data-grename]').forEach(b => b.onclick = () => {
        const g = groupsOf(ep).find(x => x.id === b.dataset.grename);
        U.openModal({
          title: '重命名镜头组',
          body: `<label class="field"><span>组名称</span><input class="input" data-f="n" value="${U.esc(g.name)}"></label>`,
          footer: `<button class="btn primary" data-x="ok">保存</button>`,
          onMount(m2, close2) {
            m2.querySelector('[data-x=ok]').onclick = () => {
              const v = m2.querySelector('[data-f=n]').value.trim();
              if (v) { g.name = v; g.nameManual = true; Store.save(); }
              close2(); rerender();
            };
          },
        });
      });
      box.querySelectorAll('[data-gprefix]').forEach(t => t.onchange = () => {
        const g = groupsOf(ep).find(x => x.id === t.dataset.gprefix);
        if (g) { g.prefix = t.value; Store.save(); U.toast('组前缀词已保存', 'success'); }
      });
      box.querySelectorAll('[data-gmeta]').forEach(sel => sel.onchange = () => {
        const [gid, key] = sel.dataset.gmeta.split(':');
        const g = groupsOf(ep).find(x => x.id === gid);
        if (!g) return;
        g.meta = g.meta || {};
        if (sel.value) g.meta[key] = sel.value; else delete g.meta[key];
        Store.save(); rerender();
      });
      box.querySelectorAll('[data-gbind]').forEach(b => b.onclick = () => {
        const g = groupsOf(ep).find(x => x.id === b.dataset.gbind);
        openBindAssets(p, ep, g, rerender);
      });
      box.querySelectorAll('[data-ggen]').forEach(b => b.onclick = () => {
        const g = groupsOf(ep).find(x => x.id === b.dataset.ggen);
        genGroupVideo(p, ep, main, g, () => { rerender(); Views.episode(main, p.id, ep.id); });
      });
      box.querySelectorAll('[data-glocate]').forEach(b => b.onclick = () => {
        const g = groupsOf(ep).find(x => x.id === b.dataset.glocate);
        const first = groupShots(ep, g)[0];
        if (first) locate(first.id);
      });
      box.querySelectorAll('[data-gdel]').forEach(b => b.onclick = () => {
        const g = groupsOf(ep).find(x => x.id === b.dataset.gdel);
        U.confirm(`解散镜头组「${g.name}」?组内分镜保留,仅解除分组。`, () => {
          ep.shots.forEach(s => { if (s.groupId === g.id) s.groupId = null; });
          (ep.beats || []).forEach(bt => { if (bt.groupId === g.id) bt.groupId = null; }); // 节拍板绑定一并解除,不留悬空 groupId
          ep.groups = groupsOf(ep).filter(x => x.id !== g.id);
          Store.save(); rerender();
        }, '解散');
      });
      box.querySelectorAll('[data-tlshot]').forEach(t => t.onclick = () => locate(t.dataset.tlshot));
      box.querySelectorAll('[data-tlmove]').forEach(sel => sel.onchange = () => {
        const s = ep.shots.find(x => x.id === sel.dataset.tlmove);
        if (s) { s.groupId = sel.value || null; Store.save(); rerender(); }
      });
    }
  };
})();
