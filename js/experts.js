/* ============ experts.js 专家体系(自 gsettings.js 拆分) ============
 * 平台预置专家库(EXPERTS)/自定义专家/雇佣·解雇/专家自进化/专家工坊(元智能体 FORGE_SYS)。
 * 依赖 gsettings.js 顶部的 DEFAULTS/DIR_DIMS/DIR_STYLES/dirFallback(经 window.GSettings 解构,
 * 加载顺序:gsettings.js 在前、本文件在后);window.Experts 供 gsettings 页面渲染运行时取用。 */
(function () {
  const { DEFAULTS, DIR_DIMS, DIR_STYLES, EXPERT_ROLES, dirFallback } = window.GSettings;

  /* ================= 专家雇佣:平台预置的 AI 导演 Agent(封装的风格化系统提示词 + 提示词模板 skill) =================
   * 雇佣 = 把该专家的导演设定五维 + 提示词模板写入全局配置,并让导演助手以其人设工作
   * 预置注册表数据双端单源 js/experts-data.js(服务端 /api/wf/* 据 projType 推导解说/剧情模式标注) */
  const EXPERTS = (window.ExpertsData && ExpertsData.EXPERTS) || [];
  window.EXPERT_DIRECTORS = EXPERTS;
  /* 自定义专家库(专家工坊生成/手写):持久化在 Store.state.customExperts */
  function customExperts() {
    Store.state.customExperts = Store.state.customExperts || [];
    return Store.state.customExperts;
  }
  /* 全部专家 = 平台预置 + 我的自定义(三条雇佣链路统一走这里) */
  window.allExperts = function () {
    return ExpertsData.allOf(Store.state.customExperts);
  };
  window.hiredExpert = function () {
    const id = (Store.state.settings || {}).hiredExpert;
    return allExperts().find(e => e.id === id) || null;
  };
  /* 项目生产类型:默认剧情模式;雇佣「出海解说剧导演」后全站按解说模式(重旁白)生产(推导逻辑双端单源 experts-data.js) */
  window.projType = function () {
    return ExpertsData.projTypeOf((Store.state.settings || {}).hiredExpert, Store.state.customExperts);
  };
  /* 生效专家方法论注入串(板块雇佣专家 > 全局雇佣专家):浏览器侧创作工作流的唯一装配口,
   * 与服务端 /api/wf/* 走同一个 WfCore.personaFor——同一雇佣状态下两端提示词逐字节一致 */
  window.personaNoteFor = function (p, board) {
    return WfCore.personaFor({
      experts: allExperts(), hiredId: (Store.state.settings || {}).hiredExpert,
      boards: (p && p.boards) || null, board,
    });
  };

  /* 雇佣 style 专家(预置与自定义共用):写入 hiredExpert + 导演设定五维 + 提示词三件套 */
  function hireExpert(e, done) {
    if (!e || e.kind === 'function' || !e.dims || !e.tpl) return;
    U.confirm(`雇佣「${e.name}」将:覆盖当前导演设定五维 + 文生图/文生视频/审片提示词模板,并让导演助手切换为该专家人设。确认雇佣吗?`, () => {
      Store.state.settings = Object.assign({}, Store.state.settings, {
        hiredExpert: e.id,
        directorSetting: Object.assign({ style: e.style, inject: true }, e.dims),
        tplImage: e.tpl.tplImage, tplVideo: e.tpl.tplVideo, tplReview: e.tpl.tplReview,
      });
      Store.save();
      U.toast(`已雇佣「${e.name}」:设定与模板已注入,导演助手已切换人设`, 'success', 3500);
      if (done) done();
    }, '⚡ 确认雇佣');
  }

  /* 删除自定义专家:若正被全局雇佣则一并解雇并恢复默认模板 */
  function delCustomExpert(id, done) {
    const e = customExperts().find(x => x.id === id);
    if (!e) return;
    const hired = (Store.state.settings || {}).hiredExpert === id;
    U.confirm(`删除自定义专家「${e.name}」?${hired ? '该专家正被全局雇佣,删除后将一并解雇并恢复系统默认模板。' : ''}`, () => {
      Store.state.customExperts = customExperts().filter(x => x.id !== id);
      if (hired) {
        const s2 = Object.assign({}, Store.state.settings);
        delete s2.hiredExpert;
        s2.directorSetting = null;
        s2.tplImage = DEFAULTS.tplImage; s2.tplVideo = DEFAULTS.tplVideo; s2.tplReview = DEFAULTS.tplReview;
        Store.state.settings = s2;
      }
      Store.save();
      U.toast('已删除「' + e.name + '」', 'success');
      if (done) done();
    }, '🗑 删除');
  }

  /* 预置专家的进化落点:自定义副本。预置注册表 js/experts-data.js 是浏览器与服务端共享的静态数据,
   * 原地往 persona 追加条款既存不进 Store(刷新即失),也会让 /api/wf/* 与浏览器两端漂移。
   * 副本记 from=派生源 id:雇佣事实仍挂在预置 id 上,WfCore.expertBoards 认 from,故副本自身还没被雇佣时
   * 生效板块仍按派生源算,蒸馏输入照样只吃这些板块的沉淀。同一预置专家只派生一份,再次进化落回同一副本。
   * 落点判定与副本造形走 WfCore.evolveTarget 双端单源(headless /api/wf/evolve-expert 同一份),
   * 本函数只做浏览器侧的副作用:入库 Store 与派生提示。 */
  function presetCopy(e) {
    const r = WfCore.evolveTarget(e, { presets: EXPERTS, customs: customExperts(), uid: 'cx_' + Date.now() });
    if (!r.copy) return r.target;
    customExperts().push(r.copy);
    Store.save();
    U.toast(`预置专家不可改写:已建可进化副本「${r.copy.name}」,条款写进副本,雇佣该副本后生效`, 'info', 4000);
    return r.copy;
  }

  /* ---- 🧠 专家自进化:把导演助手记忆里用户的纠正/偏好沉淀,一次 LLM 调用蒸馏为 ≤4 条「进化条款」追加进该专家 persona ----
   * 预置与自定义专家同一个人手入口、同一份计费口径(收费 1 积分,失败/无新增退费);预置专家的条款落到自定义副本。
   * 记忆源按该专家的生效板块过滤(判据双端单源 WfCore.expertBoards/memForBoards):蒸馏是写死进 persona,
   * 别的板块的沉淀混进来会让该专家在自己每条链路上都带着不属于它的口径;板块或条目取不到即在扣费前跳过。
   * 落点判定/提示词两半/条款规整/条款落 persona 一律走 WfCore(evolveTarget/evolveSystem/buildEvolveUser/
   * evolveClauses/evolveApply),与 headless 出口 /api/wf/evolve-expert 同一份——本函数只留浏览器侧的
   * 在线判定、计费五件套与 toast。
   * 回执 {ok,code,...}:toast 仍照旧播报(四个人手按钮的语义不变),命令层 expert.evolve 据此出结构化结果。 */
  async function evolveExpert(e, done) {
    if (!e) return { ok: false, code: 'no-expert', message: '专家不存在' };
    if (!API.isReady()) { U.toast('需要真实 LLM 在线才能进化,请先到「模型配置」完成配置', 'error', 3000); return { ok: false, code: 'offline', message: '需要真实 LLM 在线才能进化,请先到「模型配置」完成配置' }; }
    const boards = WfCore.expertBoards({
      expert: e, projects: Store.myProjects(), hiredId: (Store.state.settings || {}).hiredExpert,
      boards: (window.AGENT_BOARDS || []).map(b => b.key),
    });
    if (!boards.length) {
      const m0 = `「${e.name}」还没在任何板块生效(全局雇佣或到「制片 → 智能体分工」按板块雇佣),无法确定该蒸馏哪个板块的沉淀`;
      U.toast(m0, 'info', 4000);
      return { ok: false, code: 'no-board', message: m0 };
    }
    const bt = boards.join('/');
    const mem = WfCore.memForBoards(Store.state.agentMemory, boards).map(m => m.text);
    if (!mem.length) {
      const m1 = `「${bt}」板块暂无使用记录(导演助手记忆)可供进化,先在该板块与导演助手协作几轮再来`;
      U.toast(m1, 'info', 4000);
      return { ok: false, code: 'no-memory', message: m1, boards };
    }
    // 副本在两道闸之后才落库:闸没过就跳过,不给用户的专家库留一条什么也没蒸出来的副本
    const t = EXPERTS.some(x => x.id === e.id) ? presetCopy(e) : e;
    if (!U.requireCredits(1, '专家自进化')) return { ok: false, code: 'no-credits', message: '积分不足:专家自进化需 1 积分' };
    // 计费走标准五件套展开式(登记→扣费→执行→失败退费),任务监控可对账
    const tk = Tasks.start({ type: '专家自进化', model: 'LLM', target: t.name, cost: 1 });
    if (!U.charge(1, '专家自进化', tk.id)) { Tasks.fail(tk, '积分不足'); return { ok: false, code: 'no-credits', message: '积分不足:专家自进化需 1 积分' }; }
    try {
      const out = await API.chatJSON({
        model: (Store.state.settings || {}).defLLM || API.getConfig().model,
        system: WfCore.evolveSystem(bt), // 浏览器不传覆盖表:Prompts.get 隐式读 Store(与本文件其余取值口同纪律)
        messages: [{ role: 'user', content: WfCore.buildEvolveUser(t, bt, mem) }],
        temperature: 0.3, max_tokens: 600,
        billingAction: 'llm.evolve', operationId: tk.id,
      });
      const clauses = WfCore.evolveClauses(out, t.persona); // 含本地再去重一次(不重复落点已有条款)
      if (!clauses.length) {
        /* 十轮:LLM 蒸馏已成功(服务端 operation 已交付)——无新增条款是业务结论而非失败,
         * 不再本地退款(退款无对应服务端路径,下次同步会把余额改回,两端漂移) */
        Tasks.fail(tk, '无新增条款(蒸馏已完成,记忆与现有人设无增量)');
        U.toast('未蒸馏出新的进化条款(记忆与现有人设无增量),本次调用已消耗', 'info', 3500);
        return { ok: true, code: 'no-clause', expertId: t.id, name: t.name, boards, clauses: [], changed: false };
      }
      WfCore.evolveApply(t, clauses, new Date()); // 追加进 persona(已有条款段则并入)+ evolutions 计数
      Store.save();
      Tasks.done(tk);
      U.toast(`🧠「${t.name}」已进化:新增 ${clauses.length} 条进化条款(第 ${t.evolutions} 次进化)`, 'success', 3500);
      if (done) done();
      return { ok: true, code: 'done', expertId: t.id, name: t.name, from: t.from || '', boards, clauses, changed: true, evolutions: t.evolutions };
    } catch (err) {
      // 十轮:失败退款带 operationId——镜像到服务端按原账单退(服务端未交付自动退费,两端一致)
      U.refund(1, '专家自进化失败:' + (err.message || '未知错误'), tk.id);
      Tasks.fail(tk, err.message || '未知错误');
      U.toast('进化失败,已退费:' + err.message, 'error', 3500);
      return { ok: false, code: 'evolve', message: err.message || '未知错误' };
    }
  }

  /* 跳项目页「制片 → 智能体分工」雇佣功能专家 */
  function toLab() {
    const p0 = Store.myProjects()[0];
    if (!p0) return U.toast('请先创建一个项目', 'error');
    location.hash = '#/project/' + p0.id; // 项目页 → 制片 → 智能体分工
    U.toast('已进入项目页,请到「制片 → 智能体分工」对应板块点「🤝 雇佣专家」', 'info', 3500);
  }

  /* 元智能体的契约半:严格 JSON 字段面与改稿规则。人设句已收进注册表(forge.system),这半不开放覆盖——
   * 字段名改一个字 normExpertDraft 就取不到 name/persona,整轮生成失败。
   * 原字面里人设句与「只返回严格 JSON:」同在一行,故取值时直接相接、不补分隔符(缺省逐字节不变)。 */
  const FORGE_CONTRACT = `只返回严格 JSON:
{"name":"专家名(≤8字)","ico":"一个emoji","role":"导演|编剧|摄像|策划|其他","kind":"style|function","style":"漫剧|动漫|写实","tags":["≤4个"],"desc":"80字内简介","persona":"系统人设提示词(你是…创作原则…,具体可执行)","dims":{"光影":"","色调":"","情感氛围":"","服化道审美":"","表演气质":""},"tpl":{"tplImage":"文生图模板,含{style}{subject}变量","tplVideo":"文生视频模板,含{style}{shot}变量","tplReview":"审片模板,含{shot}变量"}}
规则:kind=style 表示全局风格雇佣专家,dims 与 tpl 必填(dims 五维仅 role=导演时给具体内容,其他 role 可给空字符串);kind=function 表示板块功能专家,不给 dims/tpl。用户提出修改意见时,在上一版基础上改稿并重新输出完整 JSON。`;

  /* 元智能体返回 → 规范化专家草稿(补齐缺省字段,保证 kind=style 可直接雇佣) */
  function normExpertDraft(o) {
    const e = {
      id: 'cx_' + Date.now(),
      custom: true,
      name: String(o.name || '').trim().slice(0, 20),
      ico: String(o.ico || '').trim() || '🧪',
      role: EXPERT_ROLES.includes(o.role) ? o.role : '其他',
      kind: o.kind === 'function' ? 'function' : 'style',
      style: DIR_STYLES.includes(o.style) ? o.style : '漫剧',
      tags: (Array.isArray(o.tags) ? o.tags : []).map(t => String(t).trim()).filter(Boolean).slice(0, 4),
      desc: String(o.desc || '').trim().slice(0, 80),
      persona: String(o.persona || '').trim(),
    };
    if (e.kind === 'style') {
      const fb = dirFallback(e.style);
      e.dims = {};
      DIR_DIMS.forEach(d => e.dims[d] = String((o.dims || {})[d] || fb[d] || ''));
      e.tpl = {
        tplImage: String((o.tpl || {}).tplImage || DEFAULTS.tplImage),
        tplVideo: String((o.tpl || {}).tplVideo || DEFAULTS.tplVideo),
        tplReview: String((o.tpl || {}).tplReview || DEFAULTS.tplReview),
      };
    }
    return e;
  }

  window.Experts = {
    EXPERTS, customExperts, hireExpert, delCustomExpert, evolveExpert, toLab, normExpertDraft,
    /* 消费侧(gsettings 工坊页)仍只见一个常量,取值口在此:每次读都过 Prompts.get(浏览器隐式读
     * Store 覆盖表),页面渲染时解构即拿当次生效值——用户在「全局默认值」改完提示词重进工坊就跟随。 */
    get FORGE_SYS() { return Prompts.get('forge.system') + FORGE_CONTRACT; },
  };
})();
