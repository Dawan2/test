/* ============ compliance.js 内容安全合规体系 ============
 * ① 敏感词库 + 文本前置拦截(checkText/guardText),覆盖 政治与价值观/色情低俗/暴力血腥/明星名人与版权 四类红线;
 * ② 肖像白名单认证(state.portraitCerts):含真人肖像素材须先认证,再提交 HumanReview 报白审核;
 * ③ 上传与创作合规承诺(ensureAccepted):首次上传/生成前须勾选同意权属与合规承诺;
 * ④ 内容安全规范弹窗(rulesModal):常驻入口在「偏好学习 → 全局配置」。
 * 明确边界:不做 AI 水印;不接真实联网审核(真人预审维持 humanreview.js 的本地模拟)。
 * 词库说明:以下为常见示例词,可按运营需要持续扩充(每类直接往数组追加即可)。
 */
(function () {
  window.Compliance = {};

  /* ---- 敏感词库(示例词,可扩展) ---- */
  const WORDS = {
    '政治与价值观': [
      '颠覆国家', '分裂国家', '颜色革命', '政变', '反动', '恐怖主义', '极端主义', '邪教', '法轮功',
      '台独', '港独', '藏独', '疆独', '纳粹', '法西斯', '仇恨言论', '民族歧视', '种族歧视',
      '毒品', '制毒', '贩毒', '赌博', '洗钱', 'terrorism', 'nazi', 'cult',
    ],
    '色情低俗': [
      '色情', '淫秽', '裸体', '裸露', '露点', '性爱', '性交', '卖淫', '嫖娼', '约炮', '援交',
      '强奸', '猥亵', '性骚扰', '偷窥', '走光', '情色', '三级片', '儿童色情', '未成年人性暗示',
      'porn', 'nsfw', 'nude', 'hentai',
    ],
    '暴力血腥': [
      '血腥', '残杀', '屠杀', '虐杀', '碎尸', '分尸', '斩首', '砍头', '肢解', '爆头', '枪杀',
      '酷刑', '自残', '自杀', '割腕', '爆炸袭击', '恐怖袭击', '绑架', '劫持', '尸体', '血肉模糊',
      'gore', 'massacre', 'beheading', 'suicide',
    ],
    // 明星名人(占位保护,泛指未经授权的真人名人肖像)+ 知名动漫 IP / 影视版权角色
    '明星名人与版权': [
      '明星同款', '艺人肖像', '名人肖像', '网红同款', '偶像同款',
      '迪士尼', '米老鼠', '漫威', '星球大战', '哈利波特', '皮卡丘', '宝可梦', '哆啦A梦',
      '海贼王', '火影忍者', '名侦探柯南', '鬼灭之刃', '奥特曼', '初音未来', '宫崎骏',
      '小猪佩奇', '熊出没', '喜羊羊', '王者荣耀', '原神',
      'disney', 'marvel', 'naruto', 'pokemon',
    ],
  };
  /* 排障引导话术(拦截/失败提示统一口径) */
  const GUIDE = '请修改提示词后重试;若素材含真人肖像,请确认已完成「肖像授权声明」';
  Compliance.GUIDE = GUIDE;

  /* ---- 文本自检:返回 {hits:[{word,cat}]}(按 词+类 去重) ---- */
  Compliance.checkText = function (text) {
    const t = String(text || '').toLowerCase();
    if (!t) return { hits: [] };
    const seen = new Set(), hits = [];
    Object.keys(WORDS).forEach(cat => {
      WORDS[cat].forEach(w => {
        if (t.includes(w.toLowerCase()) && !seen.has(cat + '|' + w)) { seen.add(cat + '|' + w); hits.push({ word: w, cat }); }
      });
    });
    return { hits };
  };

  /* ---- 生成前文本拦截:无命中 true;命中弹「内容安全提示」并返回 false ---- */
  Compliance.guardText = function (text, opts) {
    opts = opts || {};
    const { hits } = Compliance.checkText(text);
    if (!hits.length) return true;
    const cats = {};
    hits.forEach(h => (cats[h.cat] = cats[h.cat] || []).push(h.word));
    U.openModal({
      title: '🛡 内容安全提示',
      body: `
      <div class="small" style="line-height:1.8">检测到以下内容命中平台内容安全红线,本次生成已被拦截(未扣费):</div>
      ${Object.keys(cats).map(cat => `
      <div class="card" style="padding:10px 12px;margin-top:8px">
        <b class="small" style="color:var(--red)">${U.esc(cat)}</b>
        <div class="row wrap" style="gap:5px;margin-top:6px">${cats[cat].map(w => `<span class="tag">${U.esc(w)}</span>`).join('')}</div>
      </div>`).join('')}
      <div class="hint" style="margin-top:12px;line-height:1.8">若生成失败,请检查提示词是否包含敏感词,或确认上传素材是否已通过肖像认证。${GUIDE}。</div>`,
      footer: `<button class="btn" data-x="rules">查看内容规范</button><button class="btn primary" data-x="back">返回修改</button>`,
      onMount(m, close) {
        m.querySelector('[data-x=rules]').onclick = () => { close(); Compliance.rulesModal(); };
        m.querySelector('[data-x=back]').onclick = close;
      },
    });
    return false;
  };

  /* ---- 内容安全规范弹窗(四类红线 + 肖像与版权要求 + 上传权属承诺) ---- */
  Compliance.rulesModal = function () {
    U.openModal({
      title: '📜 内容安全规范',
      wide: true,
      body: `
      <div class="hint" style="margin:0 0 12px;line-height:1.8">平台对全部生成内容执行内容安全审核,命中以下红线的提示词/素材将被拦截,生成失败不扣费。</div>
      <div class="card" style="padding:12px;margin-bottom:10px">
        <b class="small" style="color:var(--red)">🚫 内容安全红线(四类)</b>
        <div class="small" style="line-height:1.9;margin-top:6px">
          · <b>政治与价值观</b>:禁止危害国家安全、颠覆分裂、恐怖主义、邪教、仇恨与歧视言论,及涉毒、赌博、洗钱等违法内容;<br>
          · <b>色情低俗</b>:禁止色情淫秽、裸露性暗示、性服务交易、性骚扰类内容;严格落实<b>未成年保护</b>,严禁任何涉及未成年人的性暗示或不雅内容;<br>
          · <b>暴力血腥</b>:禁止血腥虐杀、肢解酷刑、自残自杀、爆炸恐怖袭击等过度暴力内容;<br>
          · <b>明星名人与版权</b>:严禁使用明星、政治人物、知名网红肖像;禁止上传或使用动漫 IP、影视版权角色素材(如迪士尼/漫威/日漫角色等)。
        </div>
      </div>
      <div class="card" style="padding:12px;margin-bottom:10px">
        <b class="small" style="color:var(--cyan)">🪪 肖像与素材要求(双审核通道)</b>
        <div class="small" style="line-height:1.9;margin-top:6px">
          · 上传含真人肖像的照片/视频前,须先完成<b>「肖像白名单认证」</b>(本人或已获授权);未授权肖像将被拦截;<br>
          · 含真人的素材需提交「真人审核」报白,审核通过后才会作为共享资产用于生成(资产库 → 真人审核);<br>
          · 剧集工具内生成时对提示词自动审核,命中敏感词即拦截并提示修改。
        </div>
      </div>
      <div class="card" style="padding:12px">
        <b class="small" style="color:var(--yellow)">✍️ 上传权属承诺</b>
        <div class="small" style="line-height:1.9;margin-top:6px">上传素材即表示您承诺:对该素材享有合法知识产权或已取得合法授权;素材不含未授权的他人肖像,不含明星/政治人物/知名网红肖像,不含受版权保护的动漫 IP 或影视角色。因素材权属问题引发的纠纷由上传者自行承担责任。</div>
      </div>`,
      footer: `<button class="btn primary" data-x="ok">我已知晓</button>`,
      onMount(m, close) { m.querySelector('[data-x=ok]').onclick = close; },
    });
  };

  /* ---- 上传与创作合规承诺:首次上传/生成前确认;同意存 settings.complianceAccepted ---- */
  Compliance.ensureAccepted = function () {
    Store.state.settings = Store.state.settings || {};
    if (Store.state.settings.complianceAccepted) return Promise.resolve(true);
    return new Promise(resolve => {
      let done = false;
      const finish = v => { if (!done) { done = true; resolve(v); } };
      U.openModal({
        title: '✍️ 上传与创作合规承诺',
        maskClose: false,
        body: `
        <div class="small" style="line-height:1.9">在开始上传素材与 AI 生成前,请确认并承诺:<br>
        ① 您对上传的全部素材享有<b>合法知识产权或已取得合法授权</b>;<br>
        ② 不上传含未授权真人肖像的素材;含本人/已获授权真人肖像的素材,先完成<b>「肖像白名单认证」</b>再提交报白审核;<br>
        ③ 不上传明星、政治人物、知名网红肖像,不上传动漫 IP 或影视版权角色素材;<br>
        ④ 不生成政治敏感、色情低俗、暴力血腥及侵害未成年人权益的内容(详见内容安全规范)。</div>
        <label class="check-line" style="margin-top:12px;cursor:pointer" data-x="agree">
          <input type="checkbox" data-f="agree" style="margin-right:6px"><span class="small">已阅读并同意《内容安全规范》与上述承诺</span>
        </label>`,
        footer: `<button class="btn" data-x="rules">查看内容规范</button><button class="btn" data-x="no">暂不同意</button><button class="btn primary" data-x="ok" disabled>同意并继续</button>`,
        onMount(m, close) {
          const okBtn = m.querySelector('[data-x=ok]');
          m.querySelector('[data-f=agree]').onchange = e => { okBtn.disabled = !e.target.checked; };
          m.querySelector('[data-x=rules]').onclick = () => Compliance.rulesModal();
          m.querySelector('[data-x=no]').onclick = () => { close(); finish(false); };
          okBtn.onclick = () => {
            Store.state.settings.complianceAccepted = Store.now();
            Store.save();
            close(); finish(true);
            U.toast('已确认合规承诺,感谢配合', 'success');
          };
        },
        onClose() { finish(false); },
      });
    });
  };

  /* ================= 肖像授权声明(原"白名单认证";本地自我声明,非平台审核) =================
   * state.portraitCerts[] = {id, name, idNo(证件号后4位,可选), relation(本人/已获授权), time} */
  function certs() { Store.state.portraitCerts = Store.state.portraitCerts || []; return Store.state.portraitCerts; }

  /* 是否存在任一授权声明 */
  Compliance.isCertified = function () { return certs().length > 0; };

  /* 授权声明表单:姓名 + 关系(本人/已获授权)+ 证件号后4位(可选)+ 承诺勾选 */
  Compliance.certModal = function (onChange) {
    U.openModal({
      title: '🪪 肖像授权声明',
      body: `
      <div class="hint" style="margin:0 0 12px;line-height:1.8">声明后,含该肖像的真人素材才能提交报白并用于生成。本声明为本地自我承诺(非平台审核),须确保肖像为本人或已获合法授权;严禁声明明星、政治人物、知名网红等未授权肖像。</div>
      <label class="field"><span>肖像人姓名</span><input class="input" data-f="name" placeholder="本人或已获授权的肖像人姓名"></label>
      <div class="grid" style="grid-template-columns:1fr 1fr;gap:12px">
        <label class="field"><span>与本人关系</span>
          <select class="select" data-f="relation"><option>本人</option><option>已获授权</option></select></label>
        <label class="field"><span>证件号后 4 位(可选)</span><input class="input" data-f="idno" maxlength="4" placeholder="用于权属核验"></label>
      </div>
      <label class="check-line" style="cursor:pointer" data-x="agree">
        <input type="checkbox" data-f="agree" style="margin-right:6px"><span class="small">我承诺:该肖像为本人或已取得合法授权,不冒用他人/名人肖像,愿承担相应法律责任</span>
      </label>`,
      footer: `<button class="btn" data-x="cancel">取消</button><button class="btn primary" data-x="ok" disabled>提交声明</button>`,
      onMount(m, close) {
        const okBtn = m.querySelector('[data-x=ok]');
        m.querySelector('[data-f=agree]').onchange = e => { okBtn.disabled = !e.target.checked; };
        m.querySelector('[data-x=cancel]').onclick = close;
        okBtn.onclick = () => {
          const name = m.querySelector('[data-f=name]').value.trim();
          if (!name) return U.toast('请输入肖像人姓名', 'error');
          const idNo = m.querySelector('[data-f=idno]').value.trim();
          if (idNo && !/^\d{4}$/.test(idNo)) return U.toast('证件号后 4 位应为 4 位数字', 'error');
          certs().unshift({ id: Store.uid('pc'), name, idNo, relation: m.querySelector('[data-f=relation]').value, time: Store.now() });
          Store.save(); close();
          U.toast(`「${name}」肖像授权声明已提交`, 'success');
          onChange && onChange();
        };
      },
    });
  };

  /* 授权声明列表:查看/新增/删除(删除需确认) */
  Compliance.certListModal = function (onChange) {
    const paint = (m, close) => {
      const list = certs();
      m.querySelector('[data-clist]').innerHTML = !list.length
        ? '<div class="empty"><div class="ico">🪪</div><p>暂无声明,点击「＋ 新增声明」完成肖像授权声明</p></div>'
        : list.map(c => `
        <div class="card" style="padding:10px 12px;margin-bottom:8px;display:flex;gap:10px;align-items:center">
          <span style="font-size:20px">🪪</span>
          <div class="grow" style="min-width:0">
            <b class="small">${U.esc(c.name)}</b>
            <span class="tag ${c.relation === '本人' ? 'green' : 'cyan'}" style="margin-left:6px">${U.esc(c.relation)}</span>
            <div class="hint" style="margin:2px 0 0">${c.idNo ? '证件尾号 ' + U.esc(c.idNo) + ' · ' : ''}声明时间:${U.esc(c.time)}</div>
          </div>
          <button class="btn sm danger" data-crm="${c.id}">删除</button>
        </div>`).join('');
      m.querySelectorAll('[data-crm]').forEach(b => b.onclick = () => {
        const c = certs().find(x => x.id === b.dataset.crm);
        U.confirm(`确定删除「${c ? c.name : ''}」的肖像授权声明吗?删除后含该肖像的真人素材将无法再提交报白。`, () => {
          Store.state.portraitCerts = certs().filter(x => x.id !== b.dataset.crm);
          Store.save(); paint(m, close);
          U.toast('声明已删除', 'success');
          onChange && onChange();
        }, '删除');
      });
    };
    U.openModal({
      title: '🪪 肖像授权声明',
      body: `
      <div class="hint" style="margin:0 0 12px;line-height:1.8">已声明的肖像人可用于真人素材报白;未授权肖像(明星/政治人物/知名网红)一经发现将移除并拦截相关素材。声明为本地自我承诺,非平台审核。</div>
      <div data-clist></div>`,
      footer: `<button class="btn" data-x="close">关闭</button><button class="btn primary" data-x="add">＋ 新增声明</button>`,
      onMount(m, close) {
        paint(m, close);
        m.querySelector('[data-x=close]').onclick = close;
        m.querySelector('[data-x=add]').onclick = () => { close(); Compliance.certModal(onChange); };
      },
    });
  };
})();
