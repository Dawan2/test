/* ============ proj-planner.js 项目实验台域(自 episodes.js 拆分) ============
 * AI 策划助手(项目级策划对话)与 剧本译制(出海本土化)两个弹窗入口;
 * window.EpisodeLab 供百宝箱·项目实验台(tools.js)与导演助手动作执行器(agent.js)调用。 */
(function () {
  /* 实验室(规划中功能合集)与 AI 策划/剧本译制入口:已迁移至「百宝箱 → 项目实验台」二级页 */
  const LAB = [
    ['360视图', '上传/生成全景图,自由切换场景角度并截图入库。'],
    ['图片打光', '18 种灯光预设,360° 调整灯光角度。'],
    ['导演台', '3D 空间搭建场景,多机位确认构图,锁定人物站位。'],
  ];

  /* ---------- 🤖 AI 策划助手(项目级策划对话;1 积分/条·失败退费,「应用为剧本」不另计) ---------- */
  function openPlanner(p, main) {
    if (!API.isReady()) return U.toast('AI 策划需要真实 LLM,请先在「API 设置」中配置 API(或登录后端代理)', 'error', 4000);
    if (!p.plannerChat) p.plannerChat = [];
    const model = (Store.state.settings || {}).defLLM || API.getConfig().model;
    const QUICK = ['诊断整体剧情结构', '为每集设计结尾悬念钩子', '给我 3 个高反转创意', '优化人物关系与动机'];
    const ctxOf = () => [
      '项目名称:' + p.name,
      '风格影调:' + styleOf(p),
      '目标市场:' + localeOf(p).name + '(请按项目目标市场语言回复' + (langOf(p) ? ',' + langOf(p).slice(1) : '') + ')',
      '剧本(前 3000 字):\n' + (p.script || '(尚未上传剧本)').slice(0, 3000),
      '分集列表:\n' + (p.episodes.length ? p.episodes.map((e, i) => `${i + 1}.${e.title}(${(e.content || '').length}字)`).join('\n') : '(尚未分集)'),
    ].join('\n');

    U.openModal({
      title: '🤖 AI 策划 · ' + p.name,
      xl: true,
      body: `
      <div class="hint" style="margin-bottom:8px">资深短剧策划/编剧顾问,已了解本项目的名称/风格/影调/剧本/分集。对话 1 积分/条(失败自动退费);「应用为剧本」不再另计。</div>
      <div class="agent-chips" style="margin-bottom:8px">${QUICK.map(q => `<span class="tag" data-p-chip="${q}">${q}</span>`).join('')}</div>
      <div class="agent-msgs" data-p-msgs style="max-height:44vh;border:1px solid var(--border);border-radius:10px"></div>
      <div class="agent-input" style="padding:10px 0 0;border-top:none">
        <textarea class="input small" data-p-in rows="2" placeholder="向策划提问,如:第 2 集的结尾钩子怎么设计更抓人?"></textarea>
        <button class="btn primary sm" data-p="send">发送</button>
      </div>`,
      footer: `
        <select class="select small" data-p-ep style="width:auto">${p.episodes.map(e => `<option value="${e.id}">${U.esc(e.title)}</option>`).join('')}</select>
        <button class="btn" data-p="apply" title="将 AI 最新一条回复写入所选分集的剧本">应用为剧本</button>
        <span class="grow"></span>
        <button class="btn" data-p="close">关闭</button>`,
      onMount(m, close) {
        const msgsEl = m.querySelector('[data-p-msgs]');
        function renderMsgs() {
          msgsEl.innerHTML = p.plannerChat.length ? p.plannerChat.map(x => x.role === 'user'
            ? `<div class="agent-msg user"><div class="agent-bubble">${U.esc(x.text)}</div></div>`
            : `<div class="agent-msg"><div class="agent-bubble asst">${U.esc(x.text)}</div></div>`).join('')
            : '<div class="hint" style="text-align:center;padding:20px 8px">我是 AI 策划 🤖<br>可以聊剧情结构、悬念设计、人物动机;满意的回复可一键「应用为剧本」写入指定分集。</div>';
          msgsEl.scrollTop = msgsEl.scrollHeight;
        }
        async function send(text) {
          text = (text || '').trim();
          if (!text) return;
          p.plannerChat.push({ role: 'user', text, time: Store.now() });
          p.plannerChat = p.plannerChat.slice(-50);
          Store.save();
          renderMsgs();
          const tk = Tasks.start({ type: 'AI策划', model, target: p.name + '·' + text.slice(0, 12), projectId: p.id });
          // 七轮:策划对话计费对齐服务端(llm.agent=1/条),失败退回
          const plOpId = 'pl_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
          const paid = API.isReady() ? U.charge(1, 'AI 策划对话') : false;
          if (API.isReady() && !paid) { p.plannerChat.push({ role: 'assistant', text: '积分不足,AI 策划对话每条 1 积分。', time: Store.now() }); Store.save(); renderMsgs(); return; }
          try {
            const out = await API.chat({
              model,
              messages: [
                { role: 'system', content: '你是资深短剧策划/编剧,擅长短剧节奏、悬念设计与人物塑造,回答务实具体、中文输出。当前项目信息:\n' + ctxOf() },
              ].concat(p.plannerChat.slice(-20).map(x => ({ role: x.role, content: x.text }))),
              temperature: 0.7, max_tokens: 2500,
              billingAction: 'llm.agent', operationId: plOpId,
            });
            p.plannerChat.push({ role: 'assistant', text: String(out), time: Store.now() });
            Tasks.done(tk);
          } catch (e) {
            if (paid) U.refund(1, 'AI 策划对话失败退费', plOpId);
            Tasks.fail(tk, e.message);
            p.plannerChat.push({ role: 'assistant', text: '策划服务异常(' + e.message + '),请稍后重试。', time: Store.now() });
          }
          p.plannerChat = p.plannerChat.slice(-50);
          Store.save();
          renderMsgs();
        }
        m.querySelectorAll('[data-p-chip]').forEach(c => c.onclick = () => send(c.dataset.pChip));
        m.querySelector('[data-p=send]').onclick = () => {
          const inp = m.querySelector('[data-p-in]');
          send(inp.value);
          inp.value = '';
        };
        m.querySelector('[data-p-in]').onkeydown = e => {
          if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); m.querySelector('[data-p=send]').click(); }
        };
        m.querySelector('[data-p=apply]').onclick = () => {
          const last = p.plannerChat.slice().reverse().find(x => x.role === 'assistant' && x.text && x.text.indexOf('策划服务异常') !== 0);
          if (!last) return U.toast('暂无 AI 回复可应用', 'info');
          const ep = p.episodes.find(x => x.id === m.querySelector('[data-p-ep]').value);
          if (!ep) return U.toast('当前项目还没有分集,请先生成分集', 'error');
          U.confirm(`将用 AI 最新回复覆盖「${ep.title}」的剧本内容(${(ep.content || '').length} 字 → ${last.text.length} 字),且不可找回。确定应用吗?`, () => {
            Store.updateEpisodeContent(ep, last.text); // 十轮:统一入口,下游(理解/分镜/审片)标记旧版
            U.toast('已应用为「' + ep.title + '」剧本', 'success');
            Views.projectDetail(main, p.id);
          }, '应用');
        };
        m.querySelector('[data-p=close]').onclick = close;
        renderMsgs();
      },
    });
  }

  /* ---------- 🌐 剧本译制(剧本出海:本土化译制而非直译,保留分集结构与爽点节奏) ---------- */
  function openLocalize(p, main) {
    if (!API.isReady()) return U.toast('剧本译制需要真实 LLM,请先在「API 设置」中配置 API(或登录后端代理)', 'error', 4000);
    const src = (p.script && p.script.trim()) || p.episodes.map(e => `第${e.order + 1}集 ${e.title}\n` + (e.content || '')).join('\n\n');
    if (!src.trim()) return U.toast('当前项目还没有剧本内容,请先上传剧本或创建分集', 'error');
    const model = (Store.state.settings || {}).defLLM || API.getConfig().model;
    const TARGETS = [
      { id: 'en', name: '欧美(英语)', lang: '口语化美式英语' },
      { id: 'sea', name: '东南亚(英语)', lang: '简单地道的英语口语(东南亚受众)' },
      { id: 'jp', name: '日韩(日语)', lang: '日语' },
    ];
    let target = 'en', result = '';
    U.openModal({
      title: '🌐 剧本译制 · ' + p.name,
      xl: true,
      body: `
      <div class="hint" style="margin-bottom:8px">本土化译制而非直译:人名本地化(如 陈默→Ethan)、台词口语化俚语化、文化梗替换,保留分集结构与爽点节奏。</div>
      <label class="field"><span>目标市场</span>
        <div class="model-row">${TARGETS.map((t, i) => `<div class="model-opt ${i === 0 ? 'sel' : ''}" data-loc="${t.id}">${t.name}</div>`).join('')}</div>
      </label>
      <label class="field"><span>译制结果预览(确认后按分集标记写回)</span><textarea class="input" data-loc-out rows="14" readonly placeholder="选择目标市场后点击「开始译制」,结果将在此预览…"></textarea></label>`,
      footer: `<button class="btn" data-x="close">关闭</button><button class="btn" data-x="run">开始译制(2 积分)</button><button class="btn primary" data-x="apply">应用译制结果</button>`,
      onMount(m, close) {
        m.querySelectorAll('[data-loc]').forEach(o => o.onclick = () => {
          target = o.dataset.loc;
          m.querySelectorAll('[data-loc]').forEach(x => x.classList.toggle('sel', x === o));
        });
        m.querySelector('[data-x=close]').onclick = close;
        m.querySelector('[data-x=run]').onclick = async () => {
          const tgt = TARGETS.find(t => t.id === target);
          const tk = Tasks.start({ type: '剧本译制', model, target: p.name + '→' + tgt.name, cost: 2, projectId: p.id });
          if (!U.charge(2, `剧本译制(${p.name}→${tgt.name})`, tk.id)) { Tasks.fail(tk, '积分不足'); return; }
          const btn = m.querySelector('[data-x=run]');
          btn.disabled = true; btn.textContent = '译制中…';
          try {
            const out = await API.chat({
              model,
              messages: [
                {
                  role: 'system',
                  content: `你是资深短剧出海本土化译制专家,目标市场:${tgt.name}。这不是直译而是本土化译制,要求:
1. 人名本地化:把中文人名替换为目标市场本土人名(如 陈默→Ethan 式),全文保持一致
2. 台词口语化、俚语化,符合目标市场受众表达习惯,使用${tgt.lang}
3. 文化梗替换:本土文化梗替换为目标市场受众能共鸣的梗
4. 保留分集结构与爽点节奏(钩子/反转/打脸点位置不变)
5. 保留「第X集」分集标记,每集开头必须有,供程序按标记拆分`,
                },
                { role: 'user', content: '请对以下剧本进行本土化译制,直接输出译制后的完整剧本,不要输出解释:\n\n' + src.slice(0, 12000) },
              ],
              temperature: 0.7, max_tokens: 8000,
              billingAction: 'llm.translate', operationId: tk.id,
            });
            result = String(out);
            m.querySelector('[data-loc-out]').value = result;
            Tasks.done(tk);
            U.toast('译制完成,请预览后应用', 'success');
          } catch (e) {
            U.refund(2, '剧本译制失败', (e && e.__opId) || tk.id); // 十七轮:镜像关联原 operation(服务端按原账单退)
            Tasks.fail(tk, e.message);
            U.toast('译制失败:' + e.message, 'error', 3000);
          }
          btn.disabled = false; btn.textContent = '开始译制(2 积分)';
        };
        m.querySelector('[data-x=apply]').onclick = () => {
          if (!result.trim()) return U.toast('请先执行译制', 'info');
          if (!p.episodes.length) return U.toast('当前项目没有分集,请先生成分集', 'error');
          /* 按「第X集」分集标记拆分(兼容 Episode N / 第N話) */
          const parts = result.split(/(?=第\s*[0-9一二三四五六七八九十百]+\s*集|Episode\s+\d+|EP\.?\s*\d+|第\s*[0-9一二三四五六七八九十百]+\s*話)/i).map(s => s.trim()).filter(Boolean);
          if (parts.length < 2) return U.toast('未识别到分集标记,未应用', 'error'); // split 恒 ≥1,须至少 2 段才算识别到分集
          const n = Math.min(parts.length, p.episodes.length);
          U.confirm(`识别到 ${parts.length} 个译制分集,当前项目有 ${p.episodes.length} 集。${parts.length !== p.episodes.length ? `分集数不一致,将只覆盖前 ${n} 集。` : ''}应用将覆盖对应分集剧本且不可找回,确定应用吗?`, () => {
            p.episodes.slice().sort((a, b) => a.order - b.order).slice(0, n).forEach((ep, i) => { Store.updateEpisodeContent(ep, parts[i]); }); // 十轮:统一入口,下游标记旧版
            close();
            U.toast(`译制结果已写回 ${n} 个分集`, 'success');
            Views.projectDetail(main, p.id);
          }, '应用');
        };
      },
    });
  }

  window.EpisodeLab = { LAB, openPlanner, openLocalize }; // 百宝箱·项目实验台用
})();
