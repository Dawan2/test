/* ============ persona.js 八维度人设(外形+内在) ============ */
(function () {
  const DIMS = ['五官', '发型', '身材', '服饰', '性格', '特技', '弱点', '语气'];

  function blankPersona() {
    return { 五官: '', 发型: '', 身材: '', 服饰: '', 性格: '', 特技: '', 弱点: '', 语气: '' };
  }

  /* 按八维度重写文生图提示词(LLM 优先,失败回退模板拼接) */
  async function rewritePrompt(p, s) {
    const ps = s.persona || {};
    const filled = DIMS.filter(d => (ps[d] || '').trim());
    if (!filled.length) { U.toast('请先填写八维度内容', 'error'); return null; }
    try {
      if (!API.isReady()) throw new Error('LLM 未配置');
      const tpl = (Store.state.settings || {}).tplImage || '{style}风格角色立绘,{subject},外形特征:{traits},角色设定图:白底三视图(正面/侧面/背面横向并排),精致五官,服装细节丰富,纯白背景';
      const out = await API.chatJSON({
        system: Prompts.get('persona.promptSystem'),
        messages: [{ role: 'user', content: `根据以下角色八维度人设,写一段中文文生图画面提示词(以外形维度为主:五官/发型/身材/服饰,性格气质体现在神态上),返回 {"prompt":"..."}。参考模板:${tpl}\n角色名:${s.name}\n${filled.map(d => d + ':' + ps[d]).join('\n')}` }],
        temperature: 0.6, max_tokens: 600,
      });
      if (!out || !out.prompt) throw new Error('LLM 返回为空');
      return String(out.prompt);
    } catch (e) {
      U.toast('LLM 重写失败:' + e.message + ',已用本地模板生成', 'error', 3000);
      const traits = ['五官', '发型', '身材', '服饰'].filter(d => ps[d]).map(d => ps[d]).join(',');
      const inner = ['性格', '特技'].filter(d => ps[d]).map(d => ps[d]).join(',');
      return `${styleOf(p)}风格角色立绘,${s.name}${window.faceOf ? faceOf(p) : ''},${traits || '形象鲜明'}${inner ? ',气质:' + inner : ''}${EpisodeUtil.buildSubjectPrompt(s, 'sheet', '')}${window.negOf ? negOf(p) : ''}`;
    }
  }

  /* 八维度编辑弹窗 */
  function openEditor(p, s, onDone) {
    if (!s.persona) s.persona = blankPersona();
    U.openModal({
      title: '🧬 八维度人设 · ' + s.name,
      wide: true,
      body: `
      <div class="hint" style="margin-bottom:10px">外形(五官、发型、身材、服饰)+ 内在(性格、特技、弱点、语气),编辑后可一键重写文生图提示词。</div>
      <div class="grid" style="grid-template-columns:1fr 1fr;gap:10px 16px">
        ${DIMS.map(d => `
        <label class="field" style="margin-bottom:0"><span>${d}${['性格', '特技', '弱点', '语气'].includes(d) ? ' <span class="tag purple" style="font-size:10px">内在</span>' : ' <span class="tag cyan" style="font-size:10px">外形</span>'}</span>
          <input class="input small" data-pd="${d}" value="${U.esc(s.persona[d] || '')}" placeholder="${{ 五官: '如:剑眉星目,高鼻梁', 发型: '如:银色长直发及腰', 身材: '如:高挑纤细', 服饰: '如:墨色风衣配青铜吊坠', 性格: '如:外冷内热,隐忍', 特技: '如:剑术超群,过目不忘', 弱点: '如:恐高,不善言辞', 语气: '如:低沉冷静,偶有讽刺' }[d]}"></label>`).join('')}
      </div>`,
      footer: `
        <button class="btn" data-x="rewrite">✨ 按八维度重写提示词</button>
        <span class="grow"></span>
        <button class="btn" data-x="cancel">取消</button>
        <button class="btn primary" data-x="ok">保存人设</button>`,
      onMount(m, close) {
        const collect = () => DIMS.forEach(d => s.persona[d] = m.querySelector(`[data-pd="${d}"]`).value.trim());
        m.querySelector('[data-x=rewrite]').onclick = async () => {
          collect();
          const btn = m.querySelector('[data-x=rewrite]');
          btn.disabled = true; btn.innerHTML = '<span class="spinner"></span> 重写中…';
          const prompt = await rewritePrompt(p, s);
          btn.disabled = false; btn.textContent = '✨ 按八维度重写提示词';
          if (prompt) {
            s.prompt = prompt;
            Store.save();
            U.toast('提示词已按八维度重写并应用', 'success', 3000);
            if (onDone) onDone();
          }
        };
        m.querySelector('[data-x=cancel]').onclick = close;
        m.querySelector('[data-x=ok]').onclick = () => {
          collect();
          Store.save(); close();
          U.toast('八维度人设已保存', 'success');
          if (onDone) onDone();
        };
      },
    });
  }

  /* 按性格推荐音色(LLM 优先,失败回退随机) */
  async function recommendVoice(p, s, voices) {
    const persona = s.persona || {};
    const hint = [persona.性格, persona.语气].filter(Boolean).join(';') || s.name;
    try {
      if (!API.isReady()) throw new Error('LLM 未配置');
      const out = await API.chatJSON({
        system: Prompts.get('voice.recommendSystem'),
        messages: [{ role: 'user', content: `根据角色人设「${hint}」(角色:${s.name},项目风格:${styleOf(p)}),从音色库 ${JSON.stringify(voices)} 中推荐最合适的 1 个,返回 {"voice":"必须是音色库中的一项","reason":"一句话理由"}` }],
        temperature: 0.4, max_tokens: 300,
      });
      if (!out || !voices.includes(out.voice)) throw new Error('LLM 推荐无效');
      return { voice: out.voice, reason: String(out.reason || '') };
    } catch (e) {
      const v = voices[Math.floor(Math.random() * voices.length)];
      return { voice: v, reason: 'LLM 不可用,随机推荐(可重新点击)' };
    }
  }

  /* 批量按人设推荐音色:全部角色一次 LLM 调用(与单个推荐同为免费辅助,不计费);
   * 返回 {角色名:{voice,reason}},LLM 未覆盖/不可用的角色回退随机,保证每角色都有值 */
  async function recommendVoicesBatch(p, chars, voices) {
    const brief = chars.map(s => {
      const ps = s.persona || {};
      return { name: s.name, persona: [ps.性格, ps.语气].filter(Boolean).join(';') || s.name };
    });
    const fallback = reason => {
      const map = {};
      chars.forEach(s => map[s.name] = { voice: voices[Math.floor(Math.random() * voices.length)], reason });
      return map;
    };
    try {
      if (!API.isReady()) throw new Error('LLM 未配置');
      const out = await API.chatJSON({
        system: Prompts.get('voice.recommendBatchSystem'),
        messages: [{ role: 'user', content: `根据以下角色人设为每个角色推荐最合适的音色,项目风格:${styleOf(p)}。音色库:${JSON.stringify(voices)}。返回 JSON 数组,每个元素 {"name":"角色名(必须与输入完全一致)","voice":"必须是音色库中的一项","reason":"一句话理由"}:\n${JSON.stringify(brief)}` }],
        temperature: 0.4, max_tokens: 1200,
      });
      if (!Array.isArray(out)) throw new Error('LLM 返回无效');
      const map = {};
      out.forEach(o => { if (o && o.name && voices.includes(o.voice)) map[o.name] = { voice: o.voice, reason: String(o.reason || '') }; });
      chars.forEach(s => { if (!map[s.name]) map[s.name] = { voice: voices[Math.floor(Math.random() * voices.length)], reason: 'LLM 未覆盖,随机推荐' }; });
      return map;
    } catch (e) {
      return fallback('LLM 不可用,随机推荐');
    }
  }

  window.Persona = { DIMS, blankPersona, openEditor, rewritePrompt, recommendVoice, recommendVoicesBatch };
})();
