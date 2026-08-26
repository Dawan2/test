/* ============ api.js LLM 客户端(后端代理优先,可自定义直连)+ API 设置页 ============ */
(function () {
  const CFG_KEY = 'mv_hujing_api_cfg';
  const MODELS_CACHE_KEY = 'mv_hujing_models_cache';
  const CACHE_TTL = 10 * 60 * 1000;

  const DEFAULTS = {
    mode: 'proxy',                              // proxy=同源后端代理(免 key) | direct=自定义直连
    directBaseUrl: 'https://ark.cn-beijing.volces.com/api/plan/v3', // direct 模式专用
    directApiKey: '',                             // 直连 key 由用户在设置页自填(不内置,防泄露)
    model: 'deepseek-v4-flash-260425',
  };
  // 火山引擎 Coding Plan(Agent Plan)实测可用模型,端点 /api/plan/v3
  const RECOMMENDED = {
    'deepseek-v4-flash-260425': '快速',
    'glm-5-2-260617': '强力',
    'deepseek-v4-pro-260425': '最强',
  };

  const API = {
    _modelIds: null,
    _fetchTried: false,
    stats: { calls: 0, tokens: 0 },   // LLM 调用统计(TOKEN 计数供 AI分镜师状态栏)
    resetStats() { this.stats = { calls: 0, tokens: 0 }; },
    _track(data) {
      this.stats.calls++;
      const t = data && data.usage && (data.usage.total_tokens || (data.usage.prompt_tokens || 0) + (data.usage.completion_tokens || 0));
      if (t) this.stats.tokens += t;
    },

    getConfig() {
      let cfg = {};
      try { cfg = JSON.parse(localStorage.getItem(CFG_KEY) || '{}'); } catch (e) { cfg = {}; }
      // 旧版配置迁移:baseUrl+apiKey 直连 → direct 模式
      if (cfg.baseUrl && String(cfg.baseUrl).includes('://') && !cfg.mode) {
        cfg.mode = 'direct';
        cfg.directBaseUrl = cfg.baseUrl;
        cfg.directApiKey = cfg.apiKey || cfg.directApiKey;
        delete cfg.baseUrl; delete cfg.apiKey;
        localStorage.setItem(CFG_KEY, JSON.stringify(cfg));
      }
      return Object.assign({}, DEFAULTS, cfg);
    },
    setConfig(patch) {
      const cfg = Object.assign(this.getConfig(), patch);
      localStorage.setItem(CFG_KEY, JSON.stringify(cfg));
      return cfg;
    },
    isProxy() { return this.getConfig().mode !== 'direct'; },
    isReady() {
      const c = this.getConfig();
      if (c.mode === 'direct') return !!(c.directBaseUrl && c.directApiKey);
      return !!(window.Store && Store.getToken()); // 代理模式需先登录后端
    },

    /* ---- 非流式对话 ----
     * billingAction/operationId(可选):服务端白名单计费动作与幂等键;
     * step(九轮):聚合流程的步骤槽位名(und/gen/rev/route/cmp)——同 opId 多步调用按步骤登记,
     * main 步(不传 step)成功即交付;直连模式无代理计费,这些字段一律剥离(严格 OpenAI 兼容端点
     * 会因未知参数 400,九轮修复:此前直连也透传 billingAction/operationId/jsonMode);
     * jsonMode(九轮):服务端用同源宽松解析校验交付并在解析失败时内部修复(≤2 次),最终失败
     * 自动退费并 502——代理模式客户端不再重试,直连模式仍走本地 parseJSON 兜底 */
    async chat({ model, messages, temperature = 0.7, max_tokens = 4000, billingAction, operationId, jsonMode, step, out }) {
      const cfg = this.getConfig();
      const payload = { model: model || cfg.model, messages, temperature, max_tokens };
      if (cfg.mode === 'direct') {
        if (!cfg.directBaseUrl || !cfg.directApiKey) throw new Error('直连模式未配置,请在「API 设置」中填写 Base URL 与 Key');
        return this._chatDirect(cfg, payload); // 直连:计费/步骤字段不进 payload
      }
      if (billingAction) payload.billingAction = String(billingAction);
      if (operationId) payload.operationId = String(operationId);
      if (jsonMode) payload.jsonMode = true;
      if (step) payload.step = String(step);
      if (window.__billPid) payload._projectId = window.__billPid; // 成本归集标签(服务端 operation 台账按项目聚合)
      // 代理模式:走同源后端,Key 不出现在前端
      const token = window.Store && Store.getToken();
      if (!token) throw new Error('未登录后端(代理模式需要登录),或在「API 设置」切换为自定义直连');
      /* R15 断点闭环:单次请求抽为闭包——客户端 120s 超时但服务端已交付(结果缓存于步骤槽位)时,
       * 同 opId+step 同体重放一次:已交付命中 replay-cached 直接取回、未交付 replay-exec 重执行,
       * 均不重复扣费;修复"超时即放弃→结果搁浅、重做新 opId 重复扣费"的缺口(仅代理模式,直连无步骤语义) */
      const once = async () => {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 120000);
      let res;
      try {
        res = await fetch('/api/llm/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
          body: JSON.stringify(payload),
          signal: ctrl.signal,
        });
      } catch (e) {
        clearTimeout(timer);
        if (e.name === 'AbortError') throw new Error('请求超时(120s),请稍后重试');
        throw new Error('无法连接本地后端,请确认已运行 node server.js(或切换直连模式)');
      }
      // 超时保护覆盖响应体读取:读完再清计时器(服务端发头后挂起时不再无限等待)
      let j = null;
      try { j = await res.json(); } catch (e) {
        clearTimeout(timer);
        if (e.name === 'AbortError') throw new Error('请求超时(120s),请稍后重试');
        j = null; // 非 JSON 响应体,走下方统一错误分支
      }
      clearTimeout(timer);
      if (!res.ok || !j || j.code !== 0) {
        const msg = (j && j.message) || ('代理请求失败(' + res.status + ')');
        if (res.status === 401) { if (window.U && U.authExpired) U.authExpired(); throw new Error('登录已过期,请重新登录'); }
        if (res.status === 429) throw new Error(msg || '上游限流(429),请稍后再试');
        throw new Error(msg);
      }
      const data = j.data;
      if (out && j.parsed !== undefined) out.parsed = j.parsed; // 服务端 jsonMode 解析结果(八轮):成功=已交付;null=未交付
      this._track(data);
      const ch0 = data.choices && data.choices[0];
      const content = ch0 && ch0.message && ch0.message.content;
      // 空响应偶发于推理型模型(推理耗尽 max_tokens 或上游抖动),带出 finish_reason 便于定位
      if (!content) throw new Error('API 返回内容为空' + (ch0 && ch0.finish_reason ? '(finish_reason=' + ch0.finish_reason + ',可能被截断或过滤)' : ''));
      return content;
      };
      try {
        return await once();
      } catch (e) {
        if (operationId && /^请求超时/.test(String((e && e.message) || ''))) {
          if (window.U && U.toast) U.toast('请求超时,正在按原任务尝试恢复结果…', 'info');
          return await once(); // 同体重放:服务端步骤幂等,已交付直接取回不重复扣费
        }
        throw e;
      }
    },

    async _chatDirect(cfg, payload) {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 120000);
      let res;
      try {
        res = await fetch(cfg.directBaseUrl.replace(/\/+$/, '') + '/chat/completions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + cfg.directApiKey },
          body: JSON.stringify(Object.assign({}, payload, { stream: false })),
          signal: ctrl.signal,
        });
      } catch (e) {
        clearTimeout(timer);
        if (e.name === 'AbortError') throw new Error('请求超时(120s),请稍后重试');
        throw new Error('网络错误,无法连接 API 服务器,请检查 Base URL 与网络');
      }
      clearTimeout(timer); // fetch 已返回;下方 json 读取异常由 try/catch 兜底
      if (!res.ok) {
        const code = res.status;
        let detail = '';
        try { const j = await res.json(); detail = (j.error && (j.error.message || j.error.code)) || ''; } catch (_) {}
        if (code === 401) throw new Error('API Key 无效或已过期(401),请在「API 设置」中检查');
        if (code === 429) throw new Error('请求过于频繁或额度不足(429),请稍后再试');
        if (code === 402) throw new Error('API 账户余额不足(402)');
        if (code >= 500) throw new Error('API 服务端错误(' + code + '),请稍后重试');
        throw new Error('API 请求失败(' + code + ')' + (detail ? ':' + String(detail).slice(0, 120) : ''));
      }
      const data = await (async () => {
        try { return await res.json(); } catch (e) {
          if (e.name === 'AbortError') throw new Error('请求超时(120s),请稍后重试');
          throw new Error('API 返回内容异常(非 JSON)');
        }
      })();
      this._track(data);
      const ch0 = data.choices && data.choices[0];
      const content = ch0 && ch0.message && ch0.message.content;
      // 空响应偶发于推理型模型(推理耗尽 max_tokens 或上游抖动),带出 finish_reason 便于定位
      if (!content) throw new Error('API 返回内容为空' + (ch0 && ch0.finish_reason ? '(finish_reason=' + ch0.finish_reason + ',可能被截断或过滤)' : ''));
      return content;
    },

    /* ---- JSON 对话(健壮解析) ----
     * jsonMode(八轮):服务端用同源宽松解析验证交付并回传结果——服务端解析成功直接采信;
     * 失败(或直连模式)本地兜底解析。两端算法一致,不存在"服务端失败、前端成功"的免费窗口 */
    async chatJSON(opt) {
      const sys = { role: 'system', content: (opt.system || '你是专业助手。') + ' 只返回纯 JSON,不要输出 markdown 代码围栏或任何解释性文字。' };
      const srv = {};
      const text = await this.chat(Object.assign({}, opt, { messages: [sys].concat(opt.messages), jsonMode: true, out: srv }));
      if (srv.parsed !== undefined && srv.parsed !== null) return srv.parsed;
      return API.parseJSON(text);
    },
    parseJSON(text) {
      let t = String(text || '').trim();
      t = t.replace(/^```(?:json)?/i, '').replace(/```\s*$/, '').trim();
      try { return JSON.parse(t); } catch (_) {}
      const i = t.indexOf('{'), j = t.lastIndexOf('}');
      if (i >= 0 && j > i) { try { return JSON.parse(t.slice(i, j + 1)); } catch (_) {} }
      const a = t.indexOf('['), b = t.lastIndexOf(']');
      if (a >= 0 && b > a) { try { return JSON.parse(t.slice(a, b + 1)); } catch (_) {} }
      throw new Error('LLM 返回内容无法解析为 JSON');
    },

    /* JSON 加固版(R1 收敛):解析失败自动重试 1 次;仍失败让模型修复自己的输出
     * billingAction/operationId/step 透传服务端白名单计费与步骤槽位;
     * jsonMode(九轮):代理模式下服务端已做交付校验+内部修复(≤2 次)——失败以 502 返回且消息
     * 避开下方重试正则,直接抛给调用方走回退/退款;本方法的重试与修复主要服务直连模式 */
    async chatJSONRobust({ model, system, user, messages, temperature = 0.5, max_tokens = 4000, billingAction, operationId, step }) {
      const msgs = messages || [{ role: 'user', content: user }];
      const sysMsg = { role: 'system', content: (system || '你是专业助手。') + ' 只返回纯 JSON,不要输出 markdown 代码围栏或任何解释性文字。' };
      let raw = null, out = null, lastErr = null;
      for (let i = 0; i < 2 && !out; i++) {
        const srv = {};
        try {
          raw = await this.chat({ model, messages: [sysMsg].concat(msgs), temperature, max_tokens, billingAction, operationId, step, jsonMode: true, out: srv });
          out = (srv.parsed !== undefined && srv.parsed !== null) ? srv.parsed : this.parseJSON(raw);
        } catch (e) {
          lastErr = e;
          // 非解析类错误(网络/鉴权/服务端已修复失败的 502)直接抛;JSON 解析失败与上游空响应(直连偶发)重试
          if (!/JSON|内容为空/.test(e.message)) throw e;
        }
      }
      if (!out && raw) {
        try {
          const srv = {};
          const fixed = await this.chat({
            model,
            messages: [{ role: 'user', content: '以下内容是格式损坏的 JSON,请修复为合法 JSON,只返回修复结果,不要输出任何解释:\n' + raw.slice(0, 6000) }],
            temperature: 0, max_tokens, billingAction, operationId, step: step ? step + '_fix' : undefined, jsonMode: true, out: srv,
          });
          out = (srv.parsed !== undefined && srv.parsed !== null) ? srv.parsed : this.parseJSON(fixed);
        } catch (_) {}
      }
      if (!out) throw lastErr || new Error('LLM 返回解析失败');
      return out;
    },

    /* ---- 模型列表 ---- */
    _loadCachedIds() {
      try {
        const c = JSON.parse(localStorage.getItem(MODELS_CACHE_KEY) || 'null');
        if (c && Array.isArray(c.ids) && c.ids.length) return c.ids;
      } catch (_) {}
      return null;
    },
    async listModels(force) {
      if (!force && this._modelIds) return this._modelIds;
      const cachedRaw = this._loadCachedIds();
      if (!force && cachedRaw) {
        try {
          const c = JSON.parse(localStorage.getItem(MODELS_CACHE_KEY));
          if (Date.now() - c.time < CACHE_TTL) { this._modelIds = c.ids; return c.ids; }
        } catch (_) {}
      }
      const cfg = this.getConfig();
      let ids;
      if (cfg.mode === 'direct') {
        if (!cfg.directBaseUrl || !cfg.directApiKey) { if (cachedRaw) return cachedRaw; throw new Error('直连模式未配置'); }
        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), 30000);
        let res;
        try {
          res = await fetch(cfg.directBaseUrl.replace(/\/+$/, '') + '/models', {
            headers: { 'Authorization': 'Bearer ' + cfg.directApiKey },
            signal: ctrl.signal,
          });
        } catch (e) {
          clearTimeout(timer);
          if (e.name === 'AbortError') { if (cachedRaw) return cachedRaw; throw new Error('请求超时,请稍后重试'); }
          throw e;
        }
        clearTimeout(timer);
        if (!res.ok) { if (cachedRaw) return cachedRaw; throw new Error('获取模型列表失败(' + res.status + ')'); }
        const data = await res.json().catch(() => { throw new Error('模型列表返回内容异常(非 JSON)'); });
        ids = (data.data || []).map(m => m.id).filter(Boolean);
      } else {
        const token = window.Store && Store.getToken();
        if (!token) { if (cachedRaw) return cachedRaw; throw new Error('未登录后端,无法获取模型列表'); }
        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), 30000);
        let res;
        try {
          res = await fetch('/api/llm/models', { headers: { 'Authorization': 'Bearer ' + token }, signal: ctrl.signal });
        } catch (e) {
          clearTimeout(timer);
          if (e.name === 'AbortError') { if (cachedRaw) return cachedRaw; throw new Error('请求超时,请稍后重试'); }
          throw e;
        }
        clearTimeout(timer);
        if (!res.ok) {
          if (cachedRaw) return cachedRaw;
          if (res.status === 401) { if (window.U && U.authExpired) U.authExpired(); throw new Error('登录已过期,请重新登录'); }
          throw new Error('获取模型列表失败(' + res.status + '),请确认 node server.js 已启动');
        }
        const j = await res.json().catch(() => null);
        if (!j || j.code !== 0) { if (cachedRaw) return cachedRaw; throw new Error((j && j.message) || '获取模型列表失败'); }
        ids = (j.data.data || []).map(m => m.id).filter(Boolean);
      }
      ids.sort();
      if (!ids.length) throw new Error('模型列表为空');
      this._modelIds = ids;
      localStorage.setItem(MODELS_CACHE_KEY, JSON.stringify({ time: Date.now(), ids }));
      return ids;
    },
    async testConnection() {
      try {
        const ids = await this.listModels(true);
        return { ok: true, count: ids.length };
      } catch (e) {
        return { ok: false, msg: e.message };
      }
    },

    /* ---- 文本模型下拉数据(推荐优先,带标签) ---- */
    getTextModels(limit) {
      const ids = this._modelIds || this._loadCachedIds() || Object.keys(RECOMMENDED);
      const rec = Object.keys(RECOMMENDED).filter(r => ids.includes(r));
      const rest = ids.filter(i => !rec.includes(i));
      const list = rec.concat(rest).slice(0, limit || 40);
      if (!this._fetchTried && this.isReady()) {
        this._fetchTried = true;
        this.listModels().then(a => { this._modelIds = a; }).catch(() => {});
      }
      return list.map(id => ({ id, label: id + (RECOMMENDED[id] ? ' · ' + RECOMMENDED[id] : '') }));
    },
    /* R9 收敛:模型选项构建器(选中项不在列表则补头) */
    modelList(selectedId, limit) {
      let list = this.getTextModels(limit || 12);
      if (selectedId && !list.some(t => t.id === selectedId)) list = [{ id: selectedId, label: selectedId }].concat(list);
      return list;
    },
    modelOptions(selectedId, limit) {
      return this.modelList(selectedId, limit).map(t =>
        `<option value="${U.esc(t.id)}" ${t.id === selectedId ? 'selected' : ''}>${U.esc(t.label)}</option>`).join('');
    },
  };
  window.API = API;

  /* ================= API 设置页(面板化:个人中心「API 设置」tab 与旧 #/settings 路由共用) ================= */
  window.Views = window.Views || {};
  API.renderSettingsPanel = function (host) {
    const cfg = API.getConfig();

    function modelOptions(selected) {
      return API.getTextModels(60).map(t =>
        `<option value="${U.esc(t.id)}" ${t.id === selected ? 'selected' : ''}>${U.esc(t.label)}</option>`).join('');
    }

    function render() {
      const c = API.getConfig();
      host.innerHTML = `
      <div>
        <div class="hint" style="margin-bottom:12px">默认通过<b>本地后端代理</b>调用大模型(Key 保存在服务端 config.json,不出现在前端);也可切换为自定义直连,使用你自己的模型算力。<b>未配置或连接失败时,所有 AI 功能自动回退到本地模拟/启发式实现。</b></div>
        <div class="card">
          <label class="field"><span>调用模式</span>
            <div class="model-row">
              <div class="model-opt ${c.mode !== 'direct' ? 'sel' : ''}" data-m="proxy">🖥 后端代理(免 Key,推荐)</div>
              <div class="model-opt ${c.mode === 'direct' ? 'sel' : ''}" data-m="direct">🔑 自定义直连(高级)</div>
            </div>
            <div class="hint" data-modehint>${c.mode !== 'direct'
              ? '经 node server.js 的 /api/llm 转发,Key 由后端 config.json 管理,需先登录账号。'
              : '浏览器直连 OpenAI 兼容接口,Base URL 与 Key 仅保存在本机 localStorage。'}</div>
          </label>
          <div data-directbox style="display:${c.mode === 'direct' ? '' : 'none'}">
            <label class="field"><span>Base URL</span><input class="input" data-f="directBaseUrl" value="${U.esc(c.directBaseUrl)}" placeholder="https://api.example.com/v1"></label>
            <label class="field"><span>API Key(仅保存在本机)</span><input class="input" type="password" data-f="directApiKey" value="${U.esc(c.directApiKey)}" placeholder="sk-..."></label>
          </div>
          <label class="field"><span>默认文本模型(用于剧本拆集 / 主体提取 / 分镜生成 / 画布 LLM 节点)</span>
            <div class="row">
              <select class="select grow" data-f="model">${modelOptions(c.model)}</select>
              <button class="btn" data-x="refresh">↻ 刷新模型列表</button>
            </div>
            <div class="hint">标注含义:快速=低延迟低成本 · 免费=免计费 · 强力/最强=高质量慢速。生图/视频已接入火山引擎真实模型(doubao-seedream-5-0-pro / doubao-seedance-2-0-mini),经服务端代理调用,不走此 API。</div>
          </label>
          <div class="row" style="margin-top:6px">
            <button class="btn" data-x="test">⚡ 测试连接</button>
            <button class="btn primary" data-x="save">保存设置</button>
            <span class="small" data-result></span>
          </div>
          <div class="row" style="margin-top:10px">
            <span class="small muted">服务端代理状态:</span>
            <span class="small" data-health><span class="spinner"></span> 检测中…</span>
          </div>
        </div>
        <div class="card" style="margin-top:16px">
          <b>接入说明</b>
          <div class="hint" style="margin-top:8px;line-height:2">
            · 真实 LLM 已接入:主体提取、剧本分集、AI分镜师、智能分镜、提示词工具、画布 LLM 节点、漫剧 AI 对白。<br>
            · 代理模式:Key 存于项目根 <b>config.json</b>(不存在则用内置默认值,可自行创建覆盖 baseUrl/apiKey)。<br>
            · AI 生图 / 视频生成:已接入火山引擎真实模型(doubao-seedream-5-0-pro / doubao-seedance-2-0-mini),经服务端 /api/volc 代理调用(Key 存 config.json 的 volcApiKey),失败如实报错并自动退费;仅离线(未登录/后端不可达)时回退占位模拟。<br>
            · 经服务端代理的 LLM 调用按次计费(1 积分/次,虎鲸对话等咨询类同样计费,失败自动退费);直连模式消耗你自己的 API Key 额度。所有 LLM 调用串行执行,避免触发限流;失败自动回退本地实现。
          </div>
        </div>
      </div>`;

      let mode = c.mode === 'direct' ? 'direct' : 'proxy';
      host.querySelectorAll('[data-m]').forEach(o => o.onclick = () => {
        mode = o.dataset.m;
        host.querySelectorAll('[data-m]').forEach(x => x.classList.toggle('sel', x === o));
        host.querySelector('[data-directbox]').style.display = mode === 'direct' ? '' : 'none';
        host.querySelector('[data-modehint]').textContent = mode === 'direct'
          ? '浏览器直连 OpenAI 兼容接口,Base URL 与 Key 仅保存在本机 localStorage。'
          : '经 node server.js 的 /api/llm 转发,Key 由后端 config.json 管理,需先登录账号。';
      });
      const collect = () => ({
        mode,
        directBaseUrl: (host.querySelector('[data-f=directBaseUrl]') || { value: c.directBaseUrl }).value.trim(),
        directApiKey: (host.querySelector('[data-f=directApiKey]') || { value: c.directApiKey }).value.trim(),
        model: host.querySelector('[data-f=model]').value,
      });
      host.querySelector('[data-x=refresh]').onclick = async () => {
        const btn = host.querySelector('[data-x=refresh]');
        btn.disabled = true; btn.innerHTML = '<span class="spinner"></span> 拉取中';
        API.setConfig(collect());
        try {
          const ids = await API.listModels(true);
          const sel = host.querySelector('[data-f=model]');
          const cur = sel.value;
          sel.innerHTML = modelOptions(cur);
          U.toast(`模型列表已刷新,共 ${ids.length} 个模型`, 'success');
        } catch (e) { U.toast(e.message, 'error', 3200); }
        btn.disabled = false; btn.textContent = '↻ 刷新模型列表';
      };
      host.querySelector('[data-x=test]').onclick = async () => {
        const res = host.querySelector('[data-result]');
        API.setConfig(collect());
        res.innerHTML = '<span class="spinner"></span> 测试连接中…';
        const r = await API.testConnection();
        res.innerHTML = r.ok
          ? `<span class="tag green">✓ 连接成功,共 ${r.count} 个可用模型</span>`
          : `<span class="tag red">✕ ${U.esc(r.msg)}</span>`;
      };
      host.querySelector('[data-x=save]').onclick = () => {
        API.setConfig(collect());
        U.toast('API 设置已保存', 'success');
      };
      // 服务端代理健康状态
      (async () => {
        const el = host.querySelector('[data-health]');
        try {
          const res = await fetch('/api/health');
          const j = await res.json();
          if (!res.ok || j.code !== 0) throw new Error();
          const d = j.data;
          el.innerHTML = `<span class="tag green">🟢 在线 · v${U.esc(d.version)} · 运行 ${d.uptime}s · ${d.users} 个账号</span>`;
        } catch (e) {
          el.innerHTML = '<span class="tag red">⚫ 离线(node server.js 未启动,AI 功能回退本地模拟)</span>';
        }
      })();
    }
    render();
  };
})();
