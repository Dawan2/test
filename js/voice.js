/* ============ voice.js 旁白配音设置体系(音色库/音色选择/声音设置) ============ */
(function () {
  /* ---- 音色库(~50 个;multiEmotion=多情感) ---- */
  const LIB = [
    ['叙事氛围', '男', '中年', '叙事', 0, '沉稳有磁性的叙事男声,适合正剧旁白'],
    ['温柔细腻', '女', '青年', '叙事', 0, '温柔舒缓,情感类旁白首选'],
    ['清晰解说', '男', '青年', '解说', 0, '吐字清晰,知识类解说'],
    ['直率松弛', '男', '青年', '对话', 0, '自然松弛的日常感'],
    ['醇厚成熟', '男', '中年', '叙事', 0, '醇厚低音,纪录片质感'],
    ['饱满情绪', '男', '青年', '对话', 0, '情绪饱满,冲突戏张力强'],
    ['憨厚沙哑', '男', '中年', '对话', 0, '憨厚带沙哑,草根角色'],
    ['尖锐灵动', '女', '少年', '对话', 0, '高亮灵动,活泼角色'],
    ['憨厚慵懒', '男', '中年', '对话', 0, '慵懒随性,喜剧配角'],
    ['奶气萌娃', '男', '少年', '对话', 0, '奶声奶气,儿童角色'],
    ['威严男声', '男', '中年', '纪录片', 0, '威严庄重,帝王/旁白'],
    ['清甜元气', '女', '少年', '对话', 0, '清甜有元气,少女感'],
    ['甜心小美', '女', '青年', '对话', 1, '甜美亲切,支持多情感'],
    ['高冷御姐', '女', '青年', '对话', 1, '高冷气场,支持多情感'],
    ['傲娇霸总', '男', '青年', '对话', 1, '傲娇强势,支持多情感'],
    ['广州德哥', '男', '中年', '对话', 0, '广府腔调,市井大哥'],
    ['京腔侃爷', '男', '中年', '对话', 1, '京片子侃大山,支持多情感'],
    ['邻居阿姨', '女', '中年', '对话', 1, '热心肠街坊感,支持多情感'],
    ['优柔公子', '男', '青年', '对话', 1, '温润犹豫,古风公子,支持多情感'],
    ['儒雅男友', '男', '青年', '对话', 0, '儒雅温和的书卷气'],
    ['俊朗男友', '男', '青年', '对话', 1, '俊朗清亮,支持多情感'],
    ['北京小爷', '男', '青年', '对话', 1, '痞帅京腔,支持多情感'],
    ['柔美女友', '女', '青年', '对话', 1, '柔美甜糯,支持多情感'],
    ['阳光青年', '男', '青年', '广告', 0, '阳光有感染力,广告口播'],
    ['魅力女友', '女', '青年', '对话', 1, '魅力成熟女声,支持多情感'],
    ['爽快思思', '女', '青年', '对话', 1, '爽快利落,支持多情感'],
    ['纯真少女', '女', '少年', '对话', 0, '纯真稚嫩,初恋感'],
    ['奶气小生', '男', '少年', '对话', 0, '青涩奶气,少年主角'],
    ['精灵向导', '女', '青年', '解说', 0, '轻盈灵动,引导式解说'],
    ['闷油瓶小哥', '男', '青年', '对话', 0, '少言冷峻,闷葫芦型'],
    ['黯刃秦主', '男', '中年', '对话', 0, '阴沉霸气,权谋君主'],
    ['霸道总裁', '男', '青年', '广告', 0, '强势自信,总裁气场'],
    ['妩媚可人', '女', '青年', '对话', 0, '妩媚柔媚,风情角色'],
    ['邪魅御姐', '女', '青年', '对话', 0, '邪魅危险,反派女一'],
    ['嚣张小哥', '男', '青年', '对话', 0, '嚣张跋扈,刺头角色'],
    ['油腻大叔', '男', '中年', '对话', 0, '油腻圆滑,市井中年'],
    ['孤傲公子', '男', '青年', '叙事', 0, '孤傲清冷,剑客人设'],
    ['胡子叔叔', '男', '老年', '纪录片', 0, '沧桑胡子拉碴,长者感'],
    ['性感魅惑', '女', '青年', '广告', 0, '性感低哑,魅惑氛围'],
    ['病弱公子', '男', '青年', '对话', 0, '虚弱温润,病美人'],
    ['邪魅女王', '女', '中年', '对话', 0, '邪魅高冷,女王气场'],
    ['傲慢青年', '男', '青年', '对话', 0, '傲慢轻蔑,纨绔子弟'],
    ['薛荔男生', '男', '青年', '对话', 0, '清爽学生气'],
    ['爽朗少年', '男', '少年', '广告', 0, '爽朗朝气,运动少年'],
    ['撒娇男友', '男', '青年', '对话', 0, '软糯撒娇,奶狗系'],
    ['温柔男友', '男', '青年', '对话', 0, '温柔体贴,暖男系'],
    ['温顺少年', '男', '少年', '对话', 0, '温顺乖巧,弟弟系'],
    ['粘人男友', '男', '青年', '对话', 0, '粘人聒噪,忠犬系'],
    ['磁性低音', '男', '中年', '纪录片', 0, '磁性低音炮,深夜电台'],
    ['活泼明快', '女', '少年', '广告', 0, '活泼明快,元气广告腔'],
  ].map((a, i) => ({ id: 'v' + (i + 1), name: a[0], gender: a[1], age: a[2], scene: a[3], multiEmotion: !!a[4], desc: a[5] }));

  /* 复刻音色功能已下线(2026-08 产品决策):音色库只含系统音色 */
  const all = () => LIB;

  const SCENES = ['叙事', '对话', '广告', '纪录片', '解说'];
  const AGES = ['少年', '青年', '中年', '老年'];
  const GENDERS = ['男', '女'];
  const EMOTIONS = ['平静', '开心', '悲伤', '愤怒', '温柔', '严肃', '兴奋', '恐惧'];
  // R4 收敛:7 项旁白音色为全局唯一来源(storyboard/gsettings 复用)
  const NARRATOR_PRESETS = ['旁白·沉稳男声', '旁白·知性女声', '少年音', '少女音', '磁性大叔音', '冷艳御姐音', '苍老智者音'];
  /* 旧数据兼容:字符串 voice → 结构化(实现下沉 domain.js,配音清单与 CLI 同一份规范化) */
  const norm = v => Domain.normVoiceCfg(v);
  const byName = name => all().find(v => v.name === name) || null;
  const favs = () => { if (!Store.state.favVoices) Store.state.favVoices = []; return Store.state.favVoices; };
  const isFav = id => favs().includes(id);
  function toggleFav(id) {
    const f = favs();
    const i = f.indexOf(id);
    i >= 0 ? f.splice(i, 1) : f.push(id);
    Store.save();
    return i < 0;
  }
  function label(v) {
    const c = norm(v);
    return `${c.voice}·${c.rate}x·${c.emotion}`;
  }

  /* ---- 火山引擎真实音色映射(voice_type):Agent Plan 语音仅含 seed-tts-2.0 音色(8 个),全部就近映射 ---- */
  const V2 = {
    m1: 'zh_male_dayi_saturn_bigtts',             // 大壹(视频配音,男)
    m2: 'zh_male_ruyayichen_saturn_bigtts',       // 儒雅逸辰(视频配音,男)
    f1: 'zh_female_vv_uranus_bigtts',             // vivi 2.0(通用,女,中英)
    f2: 'zh_female_meilinvyou_saturn_bigtts',     // 魅力女友
    f3: 'zh_female_jitangnv_saturn_bigtts',       // 鸡汤女
    f4: 'zh_female_santongyongns_saturn_bigtts',  // 流畅女声
    f5: 'zh_female_mizai_saturn_bigtts',          // 黑猫侦探社咪仔(活泼)
    f6: 'zh_female_xueayi_saturn_bigtts',         // 儿童绘本(少年感)
  };
  const VOLC_MAP = {
    '叙事氛围': V2.m1, '温柔细腻': V2.f4, '清晰解说': V2.m1, '直率松弛': V2.m2, '醇厚成熟': V2.m1,
    '饱满情绪': V2.m2, '憨厚沙哑': V2.m1, '尖锐灵动': V2.f5, '憨厚慵懒': V2.m2, '奶气萌娃': V2.f6,
    '威严男声': V2.m1, '清甜元气': V2.f5, '甜心小美': V2.f1, '高冷御姐': V2.f2, '傲娇霸总': V2.m2,
    '广州德哥': V2.m1, '京腔侃爷': V2.m1, '邻居阿姨': V2.f3, '优柔公子': V2.m2, '儒雅男友': V2.m2,
    '俊朗男友': V2.m2, '北京小爷': V2.m1, '柔美女友': V2.f1, '阳光青年': V2.m2, '魅力女友': V2.f2,
    '爽快思思': V2.f4, '纯真少女': V2.f1, '奶气小生': V2.f6, '精灵向导': V2.f5, '闷油瓶小哥': V2.m2,
    '黯刃秦主': V2.m1, '霸道总裁': V2.m1, '妩媚可人': V2.f2, '邪魅御姐': V2.f2, '嚣张小哥': V2.m1,
    '油腻大叔': V2.m1, '孤傲公子': V2.m2, '胡子叔叔': V2.m1, '性感魅惑': V2.f2, '病弱公子': V2.m2,
    '邪魅女王': V2.f2, '傲慢青年': V2.m2, '薛荔男生': V2.m2, '爽朗少年': V2.m1, '撒娇男友': V2.m2,
    '温柔男友': V2.m2, '温顺少年': V2.m2, '粘人男友': V2.m1, '磁性低音': V2.m1, '活泼明快': V2.f5,
  };
  /* 情感中文 → 火山 emotion 英文(不被该音色支持时服务端自动降级去情感重试) */
  const EMOTION_MAP = { '平静': 'neutral', '开心': 'happy', '悲伤': 'sad', '愤怒': 'angry', '温柔': 'neutral', '严肃': 'neutral', '兴奋': 'excited', '恐惧': 'fear' };
  /* 音色名 → 火山 voice_type;旁白预设按性别回退 2.0 通用音色 */
  function volcOf(name) {
    if (VOLC_MAP[name]) return VOLC_MAP[name];
    const v = byName(name);
    const female = v ? v.gender === '女' : /女声|少女|御姐|女孩/.test(String(name));
    return female ? V2.f1 : V2.m1;
  }

  /* ---- 试听:Web Speech API(zh-CN) ---- */
  function speak(text, cfg) {
    try {
      if (!window.speechSynthesis) { U.toast('当前浏览器不支持语音合成', 'error'); return; }
      speechSynthesis.cancel();
      const c = norm(cfg);
      const u = new SpeechSynthesisUtterance(text || '各位观众,欢迎收看本集精彩内容');
      u.lang = 'zh-CN';
      u.rate = Math.max(0.5, Math.min(2, c.rate));
      u.volume = Math.max(0, Math.min(1, c.volume / 10));
      u.pitch = Math.max(0.5, Math.min(2, c.pitch));
      speechSynthesis.speak(u);
    } catch (e) { U.toast('试听失败:' + e.message, 'error'); }
  }

  /* ================= 音色选择弹窗(对齐 99.png) ================= */
  function pickModal(current, onPick) {
    let tab = 'sys', fScene = '', fAge = '', fGender = '', sel = byName(current) ? current : current;
    U.openModal({
      title: '音色选择',
      xl: true,
      body: `
      <div class="tabs">
        <div class="tab ${tab === 'sys' ? 'active' : ''}" data-t="sys">系统音色(${all().length})</div>
        <div class="tab" data-t="fav">收藏音色(<span data-favcnt>${favs().length}</span>)</div>
      </div>
      <div class="row wrap" style="gap:8px;margin-bottom:12px">
        <select class="select small" data-f="scene" style="width:auto"><option value="">全部场景</option>${SCENES.map(s => `<option>${s}</option>`).join('')}</select>
        <select class="select small" data-f="age" style="width:auto"><option value="">全部年龄</option>${AGES.map(s => `<option>${s}</option>`).join('')}</select>
        <select class="select small" data-f="gender" style="width:auto"><option value="">全部性别</option>${GENDERS.map(s => `<option>${s}</option>`).join('')}</select>
        <button class="btn sm" data-x="reset">重置筛选</button>
      </div>
      <div data-grid style="max-height:46vh;overflow-y:auto"></div>`,
      footer: `<button class="btn" data-x="cancel">取消</button><button class="btn primary" data-x="ok">确定</button>`,
      onMount(m, close) {
        const grid = m.querySelector('[data-grid]');
        function list() {
          let arr = tab === 'sys' ? all() : all().filter(v => isFav(v.id));
          if (fScene) arr = arr.filter(v => v.scene === fScene);
          if (fAge) arr = arr.filter(v => v.age === fAge);
          if (fGender) arr = arr.filter(v => v.gender === fGender);
          return arr;
        }
        function renderGrid() {
          const arr = list();
          grid.innerHTML = tab === 'fav' && !arr.length && !fScene && !fAge && !fGender
            ? '<div class="empty"><div class="ico">☆</div><p>暂无收藏音色,点击音色上的 ☆ 收藏常用音色</p></div>'
            : arr.length ? `<div class="voice-grid">${arr.map(v => `
              <div class="voice-cell ${sel === v.name ? 'sel' : ''}" data-v="${U.esc(v.name)}">
                <button class="btn ghost sm" data-play="${U.esc(v.id)}" title="试听">▶</button>
                <div class="grow" style="min-width:0">
                  <div class="small" style="font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${v.name}${v.multiEmotion ? '<span class="tag green" style="font-size:9px;margin-left:5px">多情感</span>' : ''}</div>
                  <div class="hint" style="margin:0">${v.gender} · ${v.age} · ${v.scene}</div>
                </div>
                <button class="btn ghost sm" data-fav="${v.id}" title="收藏">${isFav(v.id) ? '⭐' : '☆'}</button>
              </div>`).join('')}</div>`
              : '<div class="empty"><p>没有符合筛选条件的音色</p></div>';
          grid.querySelectorAll('[data-v]').forEach(c => c.onclick = e => {
            if (e.target.closest('button')) return;
            sel = c.dataset.v;
            grid.querySelectorAll('[data-v]').forEach(x => x.classList.toggle('sel', x.dataset.v === sel));
          });
          grid.querySelectorAll('[data-play]').forEach(b => b.onclick = () => {
            const v = all().find(x => x.id === b.dataset.play);
            speak(`你好,我是音色${v.name},${v.desc}`, { voice: v.name, rate: 1, volume: 7, pitch: v.gender === '女' ? 1.2 : v.age === '老年' ? 0.8 : 1 });
          });
          grid.querySelectorAll('[data-fav]').forEach(b => b.onclick = () => {
            const added = toggleFav(b.dataset.fav);
            b.textContent = added ? '⭐' : '☆';
            m.querySelector('[data-favcnt]').textContent = favs().length;
            U.toast(added ? '已收藏' : '已取消收藏', 'success', 900);
          });
        }
        m.querySelectorAll('[data-t]').forEach(t => t.onclick = () => {
          tab = t.dataset.t;
          m.querySelectorAll('[data-t]').forEach(x => x.classList.toggle('active', x === t));
          renderGrid();
        });
        m.querySelector('[data-f=scene]').onchange = e => { fScene = e.target.value; renderGrid(); };
        m.querySelector('[data-f=age]').onchange = e => { fAge = e.target.value; renderGrid(); };
        m.querySelector('[data-f=gender]').onchange = e => { fGender = e.target.value; renderGrid(); };
        m.querySelector('[data-x=reset]').onclick = () => {
          fScene = fAge = fGender = '';
          m.querySelectorAll('.select').forEach(s => s.value = '');
          renderGrid();
        };
        m.querySelector('[data-x=cancel]').onclick = close;
        m.querySelector('[data-x=ok]').onclick = () => {
          if (!sel) return U.toast('请先选择一个音色', 'error');
          close();
          onPick(sel);
        };
        renderGrid();
      },
    });
  }

  /* ================= 声音设置弹窗(对齐 88.png) ================= */
  function settingModal({ title, value, onSave }) {
    const cfg = norm(value);
    U.openModal({
      title: title || '声音设置',
      body: `
      <div class="row" style="gap:10px;margin-bottom:14px">
        <span class="tag cyan" style="font-size:13px;padding:6px 12px">🎙 ${U.esc(cfg.voice)}</span>
        <button class="btn sm primary" data-x="pick">音色选择</button>
      </div>
      <label class="field"><span>语速 <b data-v-rate>${cfg.rate.toFixed(1)}x</b></span>
        <input type="range" min="5" max="20" step="1" value="${Math.round(cfg.rate * 10)}" data-f="rate" style="width:100%;accent-color:var(--accent)"></label>
      <label class="field"><span>音量 <b data-v-volume>${cfg.volume}</b></span>
        <input type="range" min="0" max="10" step="1" value="${cfg.volume}" data-f="volume" style="width:100%;accent-color:var(--accent)"></label>
      <label class="field"><span>语调 <b data-v-pitch>${cfg.pitch.toFixed(1)}x</b></span>
        <input type="range" min="5" max="20" step="1" value="${Math.round(cfg.pitch * 10)}" data-f="pitch" style="width:100%;accent-color:var(--accent)"></label>
      <label class="field"><span>情感</span>
        <div class="row" style="gap:8px">
          <select class="select grow" data-f="emotion">${EMOTIONS.map(e => `<option ${cfg.emotion === e ? 'selected' : ''}>${e}</option>`).join('')}</select>
          <span class="small" data-emohint></span>
        </div>
      </label>`,
      footer: `<button class="btn" data-x="try">▶ 试听</button><span class="grow"></span><button class="btn" data-x="cancel">取消</button><button class="btn primary" data-x="ok">确定选择</button>`,
      onMount(m, close) {
        const emoSel = m.querySelector('[data-f=emotion]');
        function refreshEmo() {
          const v = byName(cfg.voice);
          const multi = v ? v.multiEmotion : true;
          emoSel.disabled = !multi;
          m.querySelector('[data-emohint]').innerHTML = multi ? '' : '<span style="color:var(--yellow)">⚠ 当前音色不支持多情感</span>';
        }
        const bindSlider = (k, fmt) => {
          m.querySelector(`[data-f=${k}]`).oninput = e => {
            cfg[k] = k === 'volume' ? +e.target.value : +(e.target.value / 10).toFixed(1);
            m.querySelector(`[data-v-${k}]`).textContent = fmt(cfg[k]);
          };
        };
        bindSlider('rate', v => v.toFixed(1) + 'x');
        bindSlider('volume', v => v);
        bindSlider('pitch', v => v.toFixed(1) + 'x');
        emoSel.onchange = () => cfg.emotion = emoSel.value;
        refreshEmo();
        m.querySelector('[data-x=pick]').onclick = () => {
          pickModal(cfg.voice, name => {
            cfg.voice = name;
            m.querySelector('.tag.cyan').textContent = '🎙 ' + name;
            refreshEmo();
          });
        };
        m.querySelector('[data-x=try]').onclick = () => speak('各位观众,欢迎收看本集精彩内容', cfg);
        m.querySelector('[data-x=cancel]').onclick = close;
        m.querySelector('[data-x=ok]').onclick = () => {
          const v = byName(cfg.voice);
          if (v && !v.multiEmotion) cfg.emotion = '平静';
          close();
          onSave(Object.assign({}, cfg));
        };
      },
    });
  }

  window.Voice = { get LIB() { return all(); }, SCENES, AGES, GENDERS, EMOTIONS, NARRATOR_PRESETS, norm, byName, favs, isFav, toggleFav, label, speak, pickModal, settingModal, volcOf, emotionOf: cn => EMOTION_MAP[cn] || 'neutral' };
})();
