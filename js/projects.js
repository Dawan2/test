/* ============ projects.js 项目管理 ============ */
(function () {
  window.Views = window.Views || {};

  /* 画风库/影调/风格串/负面约束:单一来源已下沉 js/domain.js(双端共享,CLI 同口径),此处仅回挂 */
  const STYLE_LIB = Domain.STYLE_LIB;
  window.STYLE_LIB = STYLE_LIB;
  const TONE_PRESETS = Domain.TONE_PRESETS;
  window.TONE_PRESETS = TONE_PRESETS;
  window.styleOf = Domain.styleOf;
  window.negOf = Domain.negOf;
  /* 目标市场/语言(项目级,海外本土剧):zh 为国内默认,其余为出海市场 */
  const LOCALES = [
    { id: 'zh', name: '国内中文', tag: '🇨🇳 国内' },
    { id: 'en', name: '欧美 English', tag: '🌍 欧美' },
    { id: 'sea', name: '东南亚 English', tag: '🌴 东南亚' },
    { id: 'jp', name: '日韩', tag: '🗾 日韩' },
  ];
  window.LOCALES = LOCALES;
  window.localeOf = p => LOCALES.find(x => x.id === (p.locale || 'zh')) || LOCALES[0];
  /* 台词语言指令片段(注入分镜/策划 prompt;zh 返回空串):二十一轮下沉 wf-core.js(双端共享),此处回挂保持 window.langOf 出口 */
  window.langOf = WfCore.langOf;
  /* 人物脸型 prompt 片段(出海剧选非亚洲;faceStyle 未设置时按目标市场 locale 推导) */
  window.faceOf = p => p.faceStyle === '非亚洲' ? ',欧美面孔' : p.faceStyle === '混合' ? '' : p.faceStyle ? ',亚洲面孔' : ({ en: ',欧美面孔', sea: ',东南亚面孔', jp: ',东亚面孔' }[p.locale] || ',亚洲面孔');
  window.MODELS = {
    script: ['虎鲸·剧本大模型 v2', 'DeepScript-Pro', 'GLM-Screenplay'],
    image: ['Volcengine,豆包 Seedream 5.0 Pro,doubao-seedream-5-0-pro-260628',
      'Volcengine,【线路2】豆包 Seedream 4.5,doubao-seedream-4-5-260928'], // 备用线路 model-id 可按实际渠道调整,配置在偏好学习·全局默认值
    video: ['Volcengine,Seedance 2.0 Mini,doubao-seedance-2-0-mini-260615', // 默认(便宜,日常抽卡用它)
      'Volcengine,Seedance 2.5 长段落,doubao-seedance-2-5-260628', // 4-30s 连续时长、多模态参考≤50;节拍板/镜头组里显式选用
      'Volcengine,【线路2】Seedance 2.0 标准版,doubao-seedance-2-0-260615'], // 备用线路 model-id 可按实际渠道调整,配置在偏好学习·全局默认值
    edit: ['Volcengine,seedream i2i 指令编辑,doubao-seedream-5-0-pro-260628', 'FFmpeg,本地视频处理,ffmpeg-local'],
    storyboard: ['AI分镜师·旗舰', 'AI分镜师·标准', 'StoryMind-Pro', 'ShotGPT-5'],
    tts: ['豆包语音 seed-tts-2.0'],
  };
  // 积分价目:多机位渠道价以 CAMERA.CHANNELS 为准(渠道一21/渠道二11)
  window.COST = {
    image: 2, tweetShot: 3, video: 5, audio: 1, aiDirector: 10, smartSB: 4, compose: 3, tool: 2,
    multiView: 3, fusion: 3, hd: 1, adjust: 2, inpaint: 2, realistic: 3, highlight: 5, multiCam1: 21, multiCam2: 11,
    review: 5, optimize: 1, erase: 5, hdStd: 20, hdPro: 100, jianying: 3,
  };

  /* ---- 官方案例(案例克隆):一键复制为新项目,含完整示例数据 ---- */
  function buildSampleProject(u) {
    const script = `第一集 雨夜相遇
深夜十一点,暴雨。林晚抱着被淋湿的纸箱冲进街角的便利店,风铃轻响。值夜班的陈屿从柜台后抬头,递过去一条干毛巾。两人目光相遇,谁都没有先开口。`;
    const shot = (i, plot, camera, characters, scene, prompt, dialogue) => ({
      id: Store.uid('sh'), order: i, characters, scene, props: [],
      camera, plot, narration: '', dialogue: dialogue || '', voice: '旁白·沉稳男声',
      prompt, promptHistory: [], image: null, videoModel: MODELS.video[0],
      video: { status: 'none' }, audio: false, history: [], transition: null,
      axisRule: '', intent: '',
      genStrategy: 'ref', inheritTail: false, firstFrame: null, lastFrame: null, name: '', duration: 5,
    });
    return {
      id: Store.uid('p'), userId: u.id, name: '官方案例·雨夜便利店(副本)',
      desc: '都市情感短剧示例:雨夜便利店的一次相遇。含现成角色/场景/分镜,可直接体验制作全流程。',
      mode: 'workflow', type: 'drama', style: '漫剧', tone: '青橙电影感', customStyleImg: null, cover: null,
      globalSetting: '电影感光影,雨夜冷色调,霓虹反光',
      createdAt: Store.now(), script, extractDone: true, canvas: null,
      subjects: [
        { id: Store.uid('sj'), name: '林晚', kind: 'character', image: PH.subject('林晚', 'character'), prompt: '漫剧风格角色立绘,林晚,24岁都市女性,及肩黑发,米色风衣,神情疲惫却倔强,全身像,纯白背景' },
        { id: Store.uid('sj'), name: '陈屿', kind: 'character', image: PH.subject('陈屿', 'character'), prompt: '漫剧风格角色立绘,陈屿,26岁便利店夜班店员,黑色围裙,气质温和,全身像,纯白背景' },
        { id: Store.uid('sj'), name: '便利店', kind: 'scene', image: PH.subject('便利店', 'scene'), prompt: '漫剧风格,深夜便利店内景,暖色灯光,货架整齐,玻璃门外雨夜霓虹,无人场景' },
      ],
      episodes: [{
        id: Store.uid('ep'), title: '第1集 雨夜相遇', content: script, status: 'storyboarded',
        shots: [
          shot(0, '雨夜街道,林晚抱着纸箱奔跑躲雨,霓虹在积水里碎成光斑', '跟镜头', ['林晚'], '', '漫剧·青橙电影感风格,雨夜街道,霓虹倒影,林晚抱着纸箱奔跑,电影感跟拍'),
          shot(1, '林晚推开便利店门,风铃轻响,暖光扑面而来', '推镜头', ['林晚'], '便利店', '漫剧·青橙电影感风格,便利店门口,林晚推门,暖光与雨夜冷暖对比'),
          shot(2, '陈屿递出毛巾,两人目光相遇,时间仿佛停住', '特写', ['林晚', '陈屿'], '便利店', '漫剧·青橙电影感风格,双人特写,陈屿递毛巾,林晚抬眼,浅景深', '……谢谢。'),
        ],
      }],
    };
  }

  /* ---- 项目卡片上那一两枚同 id 重复角标 ----
   * 数由 EpisodeOps.dupIdBadges 现取(它再读两侧已有的 RoleOps.dedupeScan / SB.dedupeShotScan,
   * 规则本身仍在 Domain.dupIdScan 一份):这一屏不认识去重规则,也不再数一遍谁是首位/首行,
   * 报的数与项目详情面 tab 行那两枚逐字同一个(要改几位 / 要改几行,首位与首行不算)。
   * 只在这个项目真有重复时才多长这一行,干净项目的卡片一个像素都不动。 */
  function dupCardTags(p, d) {
    if (!d || (!d.seats && !d.rows)) return '';
    const epNote = d.eps.map(x => U.esc(x.title) + ' ' + x.rows + ' 行').join('、');
    return `
              <div class="row wrap" style="margin-top:8px;gap:6px">
                ${d.seats ? `<span class="tag yellow" data-dupsubj="${p.id}" style="cursor:pointer" title="这个项目的主体库里有 ${d.seats} 位主体与在前的位共用同一个 id(按 id 只找得到首位、批量补图却逐位计费)。点这里进这个项目的「主体」页,那边页头有「🧹 主体 id 去重」(先看计划,确认才改 id,一位不删、零积分)">🧹 主体 id 重复 ${d.seats} 位</span>` : ''}
                ${d.rows ? `<span class="tag yellow" data-dupshot="${p.id}" style="cursor:pointer" title="这个项目 ${d.eps.length} 集的分镜表里共有 ${d.rows} 行镜头与在前的行共用同一个 id(按 id 只取得到首行、批量生成却逐行计费):${epNote}。${d.eps.length === 1 ? '点这里直接进那一集的工作区' : '点这里进这个项目的「分集」列表,撞车那几集的卡片上各有一枚角标可点进去'},那边顶栏有「🧹 镜头 id 去重」(先看计划,确认才改 id,一行不删、零积分)">🧹 镜头 id 重复 ${d.rows} 行(${d.eps.length} 集)</span>` : ''}
              </div>`;
  }

  Views.projects = function (main) {
    const u = Store.currentUser();
    let search = '', page = 1;
    const PER = 10;

    function render() {
      const all = Store.myProjects();
      const list = all.filter(p => !search || p.name.toLowerCase().includes(search.toLowerCase()));
      const pages = Math.max(1, Math.ceil(list.length / PER));
      page = Math.min(page, pages);
      const shown = list.slice((page - 1) * PER, page * PER);

      /* 同 id 重复角标:整屏只扫这一遍,页头那一枚与卡片上那几枚同读它。
       * 扫的是内存里那棵树(Store.myProjects() 回的就是 state.projects 上那几个对象,整树随 /api/state
       * 一次拉齐),逐项目一次线性过 id、一次网都不打;为角标去逐项目打网是不必要的。
       * 有意按全量项目扫而不是只扫这一页:卡片角标被搜索词筛掉或翻页翻过去时一枚也看不见,
       * 页头那一枚正是为那一路留的(它报的数不受搜索词与页码影响)。
       * 纯展示:零写库、零任务、零扣费,收拾仍走那两页各自那道预览 + 确认闸。 */
      const dupOf = {};
      const dirty = [];
      all.forEach(p => {
        const d = window.EpisodeOps && EpisodeOps.dupIdBadges ? EpisodeOps.dupIdBadges(p) : null;
        if (d && (d.seats || d.rows)) { dupOf[p.id] = d; dirty.push(p); }
      });
      const dirtyNote = dirty.slice(0, 5).map(x => U.esc(x.name) + ' '
        + [dupOf[x.id].seats ? '主体 ' + dupOf[x.id].seats + ' 位' : '', dupOf[x.id].rows ? '镜头 ' + dupOf[x.id].rows + ' 行' : ''].filter(Boolean).join('、')).join(';')
        + (dirty.length > 5 ? ` 等 ${dirty.length} 个` : '');

      main.innerHTML = `
      <div class="page">
        <div class="page-head">
          <div style="width:340px;max-width:50vw">
            <input class="input" data-f="search" placeholder="🔍 搜索项目名称" value="${U.esc(search)}">
          </div>
          ${dirty.length ? `<span class="tag yellow" data-x="dupall" style="align-self:center;cursor:pointer" title="全部 ${all.length} 个项目里有 ${dirty.length} 个存着同 id 的主体或镜头(这个数按全量项目算,不受搜索词与页码影响——被筛掉或翻过去的那几个,卡片上那枚角标一枚也看不见):${dirtyNote}。按 id 只取得到首位/首行,而批量补图逐位计费、批量生成逐行计费。点这里${dirty.length === 1 ? '直接进那个项目' : '清掉搜索词、翻到第一个撞车项目那一页'},收拾走「🧹 主体 id 去重」/「🧹 镜头 id 去重」那道预览 + 确认闸(一位不删、一行不删,零积分)">🧹 ${dirty.length} 个项目有重复 id</span>` : ''}
          <button class="btn primary" data-x="new">＋ 新建项目</button>
        </div>
        <div class="card" style="margin-bottom:14px;padding:14px 16px;border-color:var(--accent);cursor:pointer" data-x="goprod">
          <div class="row" style="justify-content:space-between;align-items:center">
            <div class="row" style="gap:10px;align-items:center;min-width:0">
              <span style="font-size:22px">🏭</span>
              <div style="min-width:0">
                <b class="small">量产跑批中心</b>
                <div class="hint" style="margin:2px 0 0">Agent 全自动:架构在两大流派之上,原本人工操作的环节变成一路点选,自动跑到成片</div>
              </div>
            </div>
            <button class="btn sm primary" style="flex:none">进入跑批中心 ›</button>
          </div>
        </div>
        <div class="card" style="margin-bottom:14px;padding:12px 16px">
          <div class="row" style="justify-content:space-between;align-items:center">
            <div class="row" style="gap:10px;align-items:center;min-width:0">
              <span style="font-size:22px">📦</span>
              <div style="min-width:0">
                <b class="small">官方案例 · 雨夜便利店</b>
                <div class="hint" style="margin:2px 0 0">含 2 角色 + 1 场景 + 3 个已填充分镜,复制后可直接体验分镜/镜头组/生成/导出全流程</div>
              </div>
            </div>
            <button class="btn sm primary" data-x="clone" style="flex:none">⚡ 复制为新项目</button>
          </div>
        </div>
        ${all.length === 0 ? `
          <div class="empty">
            <div class="ico">🐋</div>
            <p>还没有项目，点击右上角「新建项目」开始创作吧</p>
            <p class="small" style="margin-top:8px">讲好每一个故事！</p>
          </div>` : shown.length === 0 ? `
          <div class="empty"><div class="ico">🔍</div><p>没有匹配「${U.esc(search)}」的项目</p></div>` : `
        <div class="grid proj-grid">
          ${shown.map(p => `
          <div class="card proj-card" data-pid="${p.id}">
            <div class="proj-cover" style="background:linear-gradient(135deg,hsl(${U.hashColor(p.name)},68%,92%),hsl(${(U.hashColor(p.name) + 40) % 360},72%,87%))">
              ${p.cover ? `<img src="${U.thumb(p.cover)}">` : `<div style="text-align:center"><div class="ph">🐋</div><div class="small muted">${U.esc(p.style)}</div></div>`}
            </div>
            <div class="proj-body">
              <div class="proj-name">${U.esc(p.name)}</div>
              <div class="proj-desc">${U.esc(p.desc || '暂无描述')}</div>
              <div class="row" style="margin-top:10px;justify-content:space-between">
                <span class="small muted">📅 ${U.esc(p.createdAt)}</span>
                ${p.shell && p.shell.prodMode === '一键跑批' ? '<span class="tag cyan">🏭 一键跑批</span>' : ''}
              </div>${dupCardTags(p, dupOf[p.id])}
              <div class="row" style="margin-top:8px;justify-content:space-between">
                <span class="small muted">${(p.episodes || []).length} 集 · ${(p.subjects || []).length} 主体</span>
                <button class="btn ghost sm danger btn-del" data-del="${p.id}">删除</button>
              </div>
            </div>
          </div>`).join('')}
        </div>
        <div class="row" style="justify-content:center;margin-top:22px;gap:14px">
          <span class="small muted">共 ${list.length} 条</span>
          <span class="tag">10条/页</span>
          <button class="btn sm" data-x="prev" ${page <= 1 ? 'disabled' : ''}>‹</button>
          <span class="tag cyan">${page}</span>
          <button class="btn sm" data-x="next" ${page >= pages ? 'disabled' : ''}>›</button>
        </div>`}
      </div>`;

      main.querySelector('[data-f=search]').oninput = e => { search = e.target.value; page = 1; render(); const inp = main.querySelector('[data-f=search]'); inp.focus(); inp.setSelectionRange(inp.value.length, inp.value.length); };
      main.querySelector('[data-x=new]').onclick = () => openNewProject();
      /* 量产跑批中心:有一键跑批项目则进最近一个的跑批中心展开页,没有则引导新建 */
      main.querySelector('[data-x=goprod]').onclick = () => {
        const bp = Store.myProjects().filter(p => p.shell && p.shell.prodMode === '一键跑批');
        if (bp.length) { location.hash = '#/project/' + bp[bp.length - 1].id + '/produce'; return; }
        U.confirm('还没有一键跑批项目,现在以此模式新建一个吗?', () => openNewProject('一键跑批'), '新建跑批项目');
      };
      main.querySelector('[data-x=clone]').onclick = () => {
        const sp = buildSampleProject(u);
        Store.state.projects.push(sp);
        Store.save();
        U.toast('案例已复制为新项目,开始你的改编吧', 'success');
        location.hash = '#/project/' + sp.id;
      };
      const pv = main.querySelector('[data-x=prev]'); if (pv) pv.onclick = () => { page--; render(); };
      const nx = main.querySelector('[data-x=next]'); if (nx) nx.onclick = () => { page++; render(); };
      /* 三枚重复角标各点到能收拾它的那一处(stopPropagation:卡片本身那次跳转只进默认 tab,会盖掉落点)。
       * 主体 → 那个项目的「主体」页;镜头 → 只有一集撞车时直接进那一集的工作区,多集进「分集」列表;
       * 页头那一枚 → 只有一个撞车项目时直接进去,多个则清掉搜索词并翻到第一个撞车项目那一页
       * ——不清就可能整屏都被过滤掉,卡片那几枚角标一枚也看不见。本槽只导航,一个字不写库。 */
      main.querySelectorAll('[data-dupsubj]').forEach(t => t.onclick = e => {
        e.stopPropagation();
        window.__projTab = '主体';
        location.hash = '#/project/' + t.dataset.dupsubj;
      });
      main.querySelectorAll('[data-dupshot]').forEach(t => t.onclick = e => {
        e.stopPropagation();
        const d = dupOf[t.dataset.dupshot];
        if (d && d.eps.length === 1) { location.hash = `#/project/${t.dataset.dupshot}/episode/${d.eps[0].id}`; return; }
        window.__projTab = '分集';
        location.hash = '#/project/' + t.dataset.dupshot;
      });
      const dupAllBtn = main.querySelector('[data-x=dupall]');
      if (dupAllBtn) dupAllBtn.onclick = () => {
        if (dirty.length === 1) { location.hash = '#/project/' + dirty[0].id; return; }
        search = ''; page = Math.floor(all.indexOf(dirty[0]) / PER) + 1; render();
      };
      main.querySelectorAll('.proj-card').forEach(c => {
        c.onclick = e => {
          if (e.target.closest('.btn-del')) return;
          const p = Store.getProject(c.dataset.pid);
          location.hash = '#/project/' + p.id; // 画布模式已下线,一律进工作流项目页
        };
      });
      main.querySelectorAll('[data-del]').forEach(b => b.onclick = async () => {
        const p = Store.getProject(b.dataset.del);
        // 在飞拦截(十一轮):本地 running/background 任务 + 服务端 running jobs 合并判定——
        // 刷新后本地 background 已收敛为 failed,但服务端 job 可能仍在生成(防孤儿上游成本)
        const guard = window.Tasks ? await Tasks.canDeleteScope({ projectId: p.id }) : { local: [], remote: [] };
        if (guard.remote == null) return U.toast('任务中心暂时不可达,无法确认是否有在途生成任务,请稍后重试', 'error');
        if (guard.local.length) return U.toast(`该项目有 ${guard.local.length} 个任务正在进行(${guard.local[0].type} 等),请等待完成后再删除`, 'error');
        if (guard.remote.length) return U.toast(`服务端仍有 ${guard.remote.length} 个生成任务在跑(刷新后本地已不可见),请等待完成或超时后再删除`, 'error');
        U.confirm(`确定删除项目「${p.name}」吗？项目内分集、分镜数据将一并删除;删除后可在回收站恢复(保留 7 天)。`, () => {
          Store.trashPut('project', p.name, p); // 软删除:完整快照进回收站,7 天可恢复
          Store.state.projects = Store.state.projects.filter(x => x.id !== p.id);
          Store.save();
          U.toast('项目已删除,可在回收站恢复(保留 7 天)', 'success');
          render();
        }, '删除');
      });
    }
    render();
  };

  function openNewProject(preset) {
    /* 剧壳介绍页:只收基础信息;风格/影调/题材等定调内容在「导演」页完成,制片信息在「制片→项目概况」可查可改 */
    /* 分镜脚本/分镜视频/节拍板/镜头组四视图在工作区 tab 行统一切换,创建时不再选制作模式;
     * 「一键跑批」为 Agent 全自动量产开关(创建后不可改),跑批中心入口在工作区顶栏;preset 预置开关态(跑批中心入口带入) */
    let autoRun = preset === '一键跑批', platform = '抖音', lang = '中文';
    const PLATFORMS = ['抖音', '快手', '红果', '视频号', 'TikTok(出海)', '其他'];
    const LANGS = ['中文', 'English', '日韩语', '其他小语种'];
    const u0 = Store.currentUser();
    U.openModal({
      title: '新建项目(剧壳)',
      wide: true,
      body: `
      <div class="hint" style="margin-bottom:12px">只填剧壳基础信息;美术风格/影调/节奏等定调在建项后到「导演」页完成,本页内容在「制片 → 项目概况」随时可查可改。</div>
      <div class="grid" style="grid-template-columns:1fr 1fr;gap:14px 20px">
        <label class="field"><span>剧名 *</span><input class="input" data-f="name" placeholder="如:虎鲸奇缘"></label>
        <label class="field"><span>项目负责人</span><input class="input" data-f="owner" value="${U.esc(u0 ? u0.username : '')}" placeholder="负责人姓名"></label>
      </div>
      <label class="field"><span>简介</span><textarea class="input" data-f="desc" rows="2" placeholder="一句话介绍你的故事…"></textarea></label>
      <label class="field"><span>核心卖点</span><input class="input" data-f="selling" placeholder="如:皮影照妖×契约复仇,3 秒一个钩子"></label>
      <div class="grid" style="grid-template-columns:1fr 1fr;gap:14px 20px">
        <label class="field"><span>面向发行平台</span>
          <div class="model-row wrap">${PLATFORMS.map((x, i) => `<div class="model-opt ${i === 0 ? 'sel' : ''}" data-g="platform" data-v="${x}">${x}</div>`).join('')}</div>
        </label>
        <label class="field"><span>基础语言</span>
          <div class="model-row wrap">${LANGS.map((x, i) => `<div class="model-opt ${i === 0 ? 'sel' : ''}" data-g="lang" data-v="${x}">${x}</div>`).join('')}</div>
        </label>
      </div>
      <label class="field"><span>目标受众</span><input class="input" data-f="audience" placeholder="如:18-35 岁女性,下沉市场爽剧受众"></label>
      <div class="grid" style="grid-template-columns:1fr 1fr 1fr;gap:14px 16px">
        <label class="field"><span>立项日期</span><input class="input" type="date" data-f="startDate"></label>
        <label class="field"><span>交片日期</span><input class="input" type="date" data-f="dueDate"></label>
        <label class="field"><span>关键时间节点</span><input class="input" data-f="milestones" placeholder="如:围读 8/20 · 定稿 8/25"></label>
      </div>
      <div class="check-line" data-x="autorun" style="margin-top:2px"><span class="switch ${autoRun ? 'on' : ''}"></span><div><div>🏭 一键跑批(Agent 全自动量产)</div><div class="hint" style="margin:0">创建后不可修改;开启后分集工作区顶栏带「跑批中心」入口,选集选模板即自动出片</div></div></div>`,
      footer: `<button class="btn" data-x="cancel">取消</button><button class="btn primary" data-x="ok">创建项目</button>`,
      onMount(m, close) {
        m.querySelectorAll('.model-opt').forEach(o => o.onclick = () => {
          const g = o.dataset.g, v = o.dataset.v;
          if (g === 'platform') platform = v; else if (g === 'lang') lang = v;
          m.querySelectorAll(`.model-opt[data-g=${g}]`).forEach(x => x.classList.toggle('sel', x.dataset.v === v));
        });
        const ar = m.querySelector('[data-x=autorun]');
        ar.onclick = () => { autoRun = !autoRun; ar.querySelector('.switch').classList.toggle('on', autoRun); };
        m.querySelector('[data-x=cancel]').onclick = close;
        m.querySelector('[data-x=ok]').onclick = () => {
          const name = m.querySelector('[data-f=name]').value.trim();
          if (!name) return U.toast('请输入剧名', 'error');
          const u = Store.currentUser();
          const p = {
            id: Store.uid('p'), userId: u.id, name,
            desc: m.querySelector('[data-f=desc]').value.trim(),
            mode: 'workflow', type: 'drama', style: '漫剧', tone: '无', faceStyle: '亚洲', negPrompt: '', customStyleImg: null, cover: null, // 画布模式已下线:一律工作流+剧情模式
            locale: 'zh', genres: [], globalSetting: '',
            shell: { // 剧壳:基础信息(制片→项目概况 可查可改)
              platform, lang, prodMode: autoRun ? '一键跑批' : '分镜表',
              audience: m.querySelector('[data-f=audience]').value.trim(),
              selling: m.querySelector('[data-f=selling]').value.trim(),
              owner: m.querySelector('[data-f=owner]').value.trim(),
              startDate: m.querySelector('[data-f=startDate]').value,
              dueDate: m.querySelector('[data-f=dueDate]').value,
              milestones: m.querySelector('[data-f=milestones]').value.trim(),
            },
            createdAt: Store.now(),
            script: '', subjects: [], episodes: [], extractDone: false,
            canvas: null,
          };
          Store.state.projects.push(p);
          Store.save();
          close();
          U.toast(`项目「${name}」创建成功,可先到「导演」页完成定调`, 'success', 3000);
          location.hash = '#/project/' + p.id;
        };
      },
    });
  }
  window.openNewProject = openNewProject;
})();
