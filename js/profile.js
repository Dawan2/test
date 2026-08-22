/* ============ profile.js 个人中心: 积分中心 / 积分记录 / 充值查询 / 充值管理(admin) ============ */
(function () {
  window.Views = window.Views || {};

  /* 离线兜底档位(在线时以服务端 /api/pay/config 为准) */
  const PLANS_OFFLINE = [
    { name: '体验版', yuan: 10 }, { name: '入门版', yuan: 50 }, { name: '标准版', yuan: 200 },
    { name: '专业版', yuan: 500 }, { name: '旗舰版', yuan: 3000 }, { name: '企业版', yuan: 5000 }, { name: '企业版 Pro', yuan: 10000 },
  ];

  /* 支付接口封装(统一 token + 错误抛出) */
  async function payReq(path, opts) {
    const res = await fetch(path, Object.assign({
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + Store.getToken() },
    }, opts || {}));
    const j = await res.json().catch(() => null);
    if (!res.ok || !j || j.code !== 0) throw new Error((j && j.message) || ('请求失败(' + res.status + ')'));
    return j.data;
  }

  Views.profile = function (main, initMode) {
    let mode = initMode === 'api' ? 'api' : 'credit'; // 两种模式:积分管理 | API 设置
    let tab = 'center';
    let cfg = null; // /api/pay/config(rate/packs/giftTiers/qr/isAdmin)

    const giftFor = yuan => {
      const tiers = (cfg && cfg.giftTiers) || [{ min: 10000, gift: 0.03 }, { min: 5000, gift: 0.025 }, { min: 3000, gift: 0.02 }];
      const t = tiers.filter(x => yuan >= x.min).sort((a, b) => b.min - a.min)[0];
      return t ? t.gift : 0;
    };
    const rate = () => (cfg && cfg.rate) || 10;
    const packs = () => (cfg && cfg.packs && cfg.packs.length ? cfg.packs : PLANS_OFFLINE);

    function render() {
      const u = Store.currentUser(); // 每次渲染重新取:兑换后 pullState 会替换 state,闭包旧引用会过期
      const logs = Store.state.creditLogs.filter(l => l.userId === u.id);
      const orders = Store.state.orders.filter(o => o.userId === u.id);
      const online = !!Store.getToken();

      main.innerHTML = `
      <div class="page">
        <div class="page-head">
          <div>
            <div class="page-title">个人中心</div>
            <div class="page-sub">${U.esc(u.username)} · ${u.accountType === 'company' ? '公司主体' : '个人账号'} · 注册于 ${U.esc(u.createdAt)}</div>
          </div>
          <div class="row">
            <button class="btn" data-x="pwd">🔑 修改密码</button>
            <div class="card" style="padding:12px 22px;text-align:center">
              <div class="stat-num" data-credit-num>${u.credits}</div>
              <div class="stat-label">当前积分</div>
            </div>
          </div>
        </div>
        <div class="tabs">
          <div class="tab ${mode === 'credit' ? 'active' : ''}" data-mode="credit">💎 积分管理</div>
          <div class="tab ${mode === 'api' ? 'active' : ''}" data-mode="api">🔌 API 设置</div>
        </div>
        ${mode === 'api' ? '<div data-aphost style="max-width:760px"></div>' : `
        <div class="tabs sub">
          <div class="tab ${tab === 'center' ? 'active' : ''}" data-tab="center">💎 积分中心</div>
          <div class="tab ${tab === 'logs' ? 'active' : ''}" data-tab="logs">📜 积分记录(${logs.length})</div>
          <div class="tab ${tab === 'orders' ? 'active' : ''}" data-tab="orders">🧾 充值查询(${orders.length})</div>
          ${cfg && cfg.isAdmin ? `<div class="tab ${tab === 'admin' ? 'active' : ''}" data-tab="admin">🛠 充值管理</div>` : ''}
        </div>
        ${tab === 'center' ? renderCenter(online) : tab === 'logs' ? renderLogs(logs) : tab === 'admin' ? renderAdmin() : renderOrders(orders)}`}
      </div>`;

      main.querySelectorAll('[data-mode]').forEach(t => t.onclick = () => { mode = t.dataset.mode; render(); });
      if (mode === 'api') { API.renderSettingsPanel(main.querySelector('[data-aphost]')); return; }
      main.querySelectorAll('[data-tab]').forEach(t => t.onclick = () => { tab = t.dataset.tab; render(); });
      main.querySelector('[data-x=pwd]').onclick = openChangePwd;
      if (tab === 'center') bindCenter();
      if (tab === 'orders') loadMyRequests();
      if (tab === 'admin') bindAdmin();
      loadUsage();
    }

    /* ---- 修改密码(后端在线时可用) ---- */
    function openChangePwd() {
      if (!Store.getToken()) return U.toast('离线模式不支持修改密码(请启动 node server.js 并登录后端账号)', 'error', 3200);
      U.openModal({
        title: '修改密码',
        body: `
        <label class="field"><span>原密码</span><input class="input" type="password" data-f="old" placeholder="请输入原密码"></label>
        <label class="field"><span>新密码</span><input class="input" type="password" data-f="new" placeholder="至少 6 位"></label>
        <label class="field"><span>确认新密码</span><input class="input" type="password" data-f="new2" placeholder="再次输入新密码"></label>`,
        footer: `<button class="btn" data-x="cancel">取消</button><button class="btn primary" data-x="ok">确认修改</button>`,
        onMount(m, close) {
          m.querySelector('[data-x=cancel]').onclick = close;
          m.querySelector('[data-x=ok]').onclick = async () => {
            const oldP = m.querySelector('[data-f=old]').value;
            const newP = m.querySelector('[data-f=new]').value;
            const new2 = m.querySelector('[data-f=new2]').value;
            if (newP.length < 6) return U.toast('新密码至少 6 位', 'error');
            if (newP !== new2) return U.toast('两次输入的新密码不一致', 'error');
            try {
              const res = await fetch('/api/auth/password', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + Store.getToken() },
                body: JSON.stringify({ oldPassword: oldP, newPassword: newP }),
              });
              const j = await res.json();
              if (!res.ok || j.code !== 0) return U.toast(j.message || '修改失败', 'error');
              close();
              U.toast('密码修改成功,下次登录请使用新密码', 'success', 3000);
            } catch (e) {
              U.toast('无法连接后端,请确认 node server.js 已启动', 'error');
            }
          };
        },
      });
    }

    /* ---- 服务端用量卡片 ---- */
    async function loadUsage() {
      const box = main.querySelector('[data-usage]');
      if (!box) return;
      if (!Store.getToken()) { box.style.display = 'none'; return; }
      try {
        const res = await fetch('/api/llm/usage', { headers: { 'Authorization': 'Bearer ' + Store.getToken() } });
        const j = await res.json();
        if (!res.ok || j.code !== 0) throw new Error();
        const d = j.data;
        box.innerHTML = `
        <div class="row" style="justify-content:space-between;margin-bottom:10px">
          <b>📊 服务端 LLM 用量</b>
          <span class="small muted">今日 ${d.today.calls} 次调用 · ${d.today.tokens.toLocaleString()} tokens</span>
        </div>
        <div class="grid stat-grid" style="margin-bottom:10px">
          <div class="card stat-card" style="padding:10px"><div class="stat-num" style="font-size:20px">${d.total.calls}</div><div class="stat-label">累计调用</div></div>
          <div class="card stat-card" style="padding:10px"><div class="stat-num" style="font-size:20px">${d.total.tokens.toLocaleString()}</div><div class="stat-label">累计 tokens</div></div>
        </div>
        ${d.byModel.length ? `<table class="tbl"><thead><tr><th>模型</th><th>调用次数</th><th>tokens</th></tr></thead><tbody>
          ${d.byModel.map(m => `<tr><td class="small">${U.esc(m.model)}</td><td>${m.calls}</td><td>${m.tokens.toLocaleString()}</td></tr>`).join('')}
        </tbody></table>` : '<div class="hint">暂无调用记录,使用 AI 功能后此处展示计量</div>'}`;
      } catch (e) {
        box.style.display = 'none';
      }
    }

    function renderCenter(online) {
      const tiers = (cfg && cfg.giftTiers) || [];
      return `
      <div class="hint" style="margin-bottom:14px">基础规则:<b style="color:var(--yellow)">1 元 = ${rate()} 积分</b>${tiers.length ? ';满赠:' + tiers.map(t => `¥${t.min.toLocaleString()}+ 赠 ${(t.gift * 100).toFixed(1)}%`).join(' / ') : ''}。创作失败系统自动返还积分。${online ? '' : '<b style="color:var(--red)">当前离线,充值不可用。</b>'}</div>
      <div class="grid recharge-grid">
        ${packs().map(pl => { const g = giftFor(pl.yuan); return `
        <div class="card recharge-card ${g ? 'hot' : ''}" data-plan="${U.esc(pl.name)}" data-yuan="${pl.yuan}" ${g ? `data-badge="满赠${(g * 100).toFixed(0)}%"` : ''}>
          <b>${U.esc(pl.name)}</b>
          <div class="recharge-price">¥${pl.yuan.toLocaleString()}</div>
          <div class="recharge-credits">💎 ${(pl.yuan * rate()).toLocaleString()} 积分</div>
          ${g ? `<div class="recharge-gift">+赠送 ${Math.round(pl.yuan * rate() * g).toLocaleString()} 积分(${(g * 100).toFixed(1)}%)</div>` : '<div class="recharge-gift" style="color:var(--text3)">无赠送</div>'}
        </div>`; }).join('')}
        <div class="card recharge-card" data-plan="__custom">
          <b>自定义金额</b>
          <div class="recharge-price" style="font-size:17px;line-height:2.2">¥ <input class="input" data-f="custom" type="number" min="1" placeholder="金额" style="width:100px;display:inline-block;text-align:center"></div>
          <div class="recharge-credits">灵活适配需求</div>
          <div class="recharge-gift" style="color:var(--text3)">满赠档同样适用</div>
        </div>
      </div>
      <div class="card" style="margin-top:16px">
        <b>🎫 卡密兑换</b>
        <div class="row" style="margin-top:10px">
          <input class="input grow" data-f="redeem" placeholder="输入卡密(如 MV-XXXX-XXXX)" style="text-transform:uppercase">
          <button class="btn primary" data-x="redeem" ${online ? '' : 'disabled'}>兑换</button>
        </div>
      </div>
      <div class="card" style="margin-top:16px" data-usage>
        <div class="hint"><span class="spinner"></span> 服务端用量加载中…</div>
      </div>`;
    }

    function bindCenter() {
      main.querySelectorAll('[data-plan]').forEach(c => c.onclick = e => {
        if (e.target && e.target.tagName === 'INPUT') return; // 自定义金额卡内的输入框点击不触发充值弹窗
        if (!Store.getToken()) return U.toast('离线模式无法充值,请启动后端并登录', 'error', 3200);
        const name = c.dataset.plan;
        if (name === '__custom') {
          const v = +c.querySelector('[data-f=custom]').value;
          if (!v || v < 1) return U.toast('请输入自定义充值金额(≥1 元)', 'error');
          openPay('自定义 ¥' + v, v);
        } else {
          openPay(name, +c.dataset.yuan);
        }
      });
      const rd = main.querySelector('[data-x=redeem]');
      if (rd) rd.onclick = async () => {
        const inp = main.querySelector('[data-f=redeem]');
        const code = inp.value.trim();
        if (!code) return U.toast('请输入卡密', 'error');
        rd.disabled = true;
        try {
          const r = await payReq('/api/pay/redeem', { method: 'POST', body: JSON.stringify({ code }) });
          await Store.pullState(); // 服务端已加分,重拉刷新
          U.toast(`兑换成功!到账 ${r.credits.toLocaleString()} 积分`, 'success', 3000);
          render();
        } catch (e) {
          U.toast(e.message, 'error', 3500);
        } finally { rd.disabled = false; }
      };
    }

    /* ---- 支付弹窗:收款码 + 提交凭证 → 人工审核 ---- */
    function openPay(planName, yuan) {
      const g = giftFor(yuan);
      const credits = Math.round(yuan * rate());
      const gifted = Math.round(credits * g);
      let channel = '微信支付';
      let proof = '';
      const qrFor = ch => ch === '微信支付' ? (cfg && cfg.qrWechat) : ch === '支付宝' ? (cfg && cfg.qrAlipay) : '';
      U.openModal({
        title: '确认充值 · ' + planName,
        body: `
        <div class="kv" style="margin-bottom:14px">
          <span class="k">充值版本</span><span>${U.esc(planName)}</span>
          <span class="k">充值金额</span><span style="color:var(--yellow);font-weight:700">¥${yuan.toLocaleString()}</span>
          <span class="k">获得积分</span><span>💎 ${credits.toLocaleString()}${gifted ? ` + 赠送 ${gifted.toLocaleString()}` : ''} = <b style="color:var(--green)">${(credits + gifted).toLocaleString()}</b></span>
        </div>
        <label class="field"><span>支付渠道</span>
          <div class="model-row">${['微信支付', '支付宝', '对公转账'].map((ch, i) => `<div class="model-opt ${i === 0 ? 'sel' : ''}" data-ch="${ch}">${ch}</div>`).join('')}</div>
        </label>
        <div data-qr style="text-align:center;margin:10px 0"></div>
        <label class="field"><span>支付备注(选填,如转账后 4 位/订单号)</span><input class="input" data-f="note" placeholder="便于管理员核对"></label>
        <label class="field"><span>支付凭证截图(选填)</span><div class="dropzone" data-x="proof" style="padding:12px">点击上传截图</div></label>`,
        footer: `<button class="btn" data-x="cancel">取消</button><button class="btn primary" data-x="pay">我已支付,提交审核</button>`,
        onMount(m, close) {
          const renderQR = () => {
            const qr = qrFor(channel);
            m.querySelector('[data-qr]').innerHTML = qr
              ? `<img src="${qr}" style="max-width:220px;border-radius:10px;border:1px solid var(--border)"><div class="hint" style="margin-top:6px">请使用${channel}扫码支付 ¥${yuan.toLocaleString()}</div>`
              : `<div class="hint" style="padding:14px">${channel === '对公转账' ? '请联系管理员获取对公账户信息' : '管理员尚未配置收款码,请线下联系管理员支付'}</div>`;
          };
          renderQR();
          m.querySelectorAll('[data-ch]').forEach(o => o.onclick = () => {
            channel = o.dataset.ch;
            m.querySelectorAll('[data-ch]').forEach(x => x.classList.toggle('sel', x === o));
            renderQR();
          });
          m.querySelector('[data-x=proof]').onclick = async () => {
            const f = await U.readAndUpload('image/*', { maxMB: 10 });
            if (f && f.server) { proof = f.url; m.querySelector('[data-x=proof]').innerHTML = `<img src="${proof}" style="max-height:60px;border-radius:6px">`; }
            else if (f) U.toast('凭证上传失败(需后端在线)', 'error');
          };
          m.querySelector('[data-x=cancel]').onclick = close;
          m.querySelector('[data-x=pay]').onclick = async () => {
            const btn = m.querySelector('[data-x=pay]');
            btn.disabled = true; btn.innerHTML = '<span class="spinner"></span> 提交中…';
            try {
              await payReq('/api/pay/request', {
                method: 'POST',
                body: JSON.stringify({ planName, yuan, channel, note: m.querySelector('[data-f=note]').value.trim(), proof }),
              });
              close();
              U.toast('已提交充值申请,管理员审核通过后积分自动到账', 'success', 3500);
              tab = 'orders';
              render();
            } catch (e) {
              btn.disabled = false; btn.textContent = '我已支付,提交审核';
              U.toast(e.message, 'error', 3500);
            }
          };
        },
      });
    }

    /* ---- 充值查询:我的申请(含审核状态) + 已到账订单 ---- */
    async function loadMyRequests() {
      const box = main.querySelector('[data-myreq]');
      if (!box) return;
      if (!Store.getToken()) { box.style.display = 'none'; return; }
      try {
        const d = await payReq('/api/pay/requests');
        if (!d.list.length) { box.style.display = 'none'; return; }
        const ST = { pending: ['待审核', 'yellow'], approved: ['已到账', 'green'], rejected: ['已拒绝', 'red'] };
        box.innerHTML = `<b style="display:block;margin-bottom:8px">充值申请</b>
        <table class="tbl"><thead><tr><th>版本</th><th>金额</th><th>积分</th><th>渠道</th><th>状态</th><th>申请时间</th></tr></thead><tbody>
          ${d.list.map(r => { const [t, c] = ST[r.status] || [r.status, '']; return `<tr>
            <td>${U.esc(r.planName)}</td>
            <td style="color:var(--yellow);font-weight:600">¥${r.yuan.toLocaleString()}</td>
            <td>💎 ${(r.credits + r.gifted).toLocaleString()}</td>
            <td>${U.esc(r.channel)}</td>
            <td><span class="tag ${c}">${t}</span>${r.adminNote ? `<div class="small muted">${U.esc(r.adminNote)}</div>` : ''}</td>
            <td class="muted small">${U.esc(r.createdAt)}</td></tr>`; }).join('')}
        </tbody></table>`;
      } catch (e) { box.style.display = 'none'; }
    }

    function renderLogs(logs) {
      if (!logs.length) return '<div class="empty"><div class="ico">📜</div><p>暂无积分流水</p></div>';
      const TYPE = { gain: ['获得', 'green'], spend: ['消耗', 'red'], refund: ['返还', 'cyan'], recharge: ['充值', 'yellow'] };
      return `<table class="tbl"><thead><tr><th>时间</th><th>类型</th><th>变动</th><th>余额</th><th>说明</th></tr></thead><tbody>
        ${logs.map(l => { const [t, c] = TYPE[l.type] || ['其他', '']; return `<tr>
          <td class="muted small">${U.esc(l.time)}</td>
          <td><span class="tag ${c}">${t}</span></td>
          <td style="color:var(--${l.type === 'spend' ? 'red' : 'green'});font-weight:600">${l.type === 'spend' ? '-' : '+'}${l.amount}</td>
          <td>${l.balance}</td>
          <td class="small">${U.esc(l.reason)}</td></tr>`; }).join('')}
      </tbody></table>`;
    }

    function renderOrders(orders) {
      return `<div class="card" style="margin-bottom:14px" data-myreq><div class="hint"><span class="spinner"></span> 充值申请加载中…</div></div>` +
        (!orders.length ? '<div class="empty"><div class="ico">🧾</div><p>暂无到账记录</p></div>'
          : `<b style="display:block;margin-bottom:8px">已到账订单</b><table class="tbl"><thead><tr><th>订单号</th><th>版本</th><th>充值金额</th><th>积分(含赠送)</th><th>支付渠道</th><th>充值时间</th></tr></thead><tbody>
        ${orders.map(o => `<tr>
          <td class="small" style="font-family:monospace">${U.esc(o.orderNo)}</td>
          <td>${U.esc(o.planName)}</td>
          <td style="color:var(--yellow);font-weight:600">¥${o.amountYuan.toLocaleString()}</td>
          <td>💎 ${(o.credits + o.gifted).toLocaleString()}${o.gifted ? `<span class="small muted">(赠${o.gifted})</span>` : ''}</td>
          <td>${U.esc(o.channel)}</td>
          <td class="muted small">${U.esc(o.time)}</td></tr>`).join('')}
      </tbody></table>`);
    }

    /* ================= 充值管理(admin) ================= */
    function renderAdmin() {
      return `
      <div class="card" style="margin-bottom:14px">
        <div class="row" style="justify-content:space-between"><b>📥 充值申请审核</b>
          <button class="btn sm" data-x="refresh">刷新</button></div>
        <div data-reqlist style="margin-top:10px"><div class="hint"><span class="spinner"></span> 加载中…</div></div>
      </div>
      <div class="grid" style="grid-template-columns:1fr 1fr;gap:14px">
        <div class="card">
          <b>🎫 生成卡密</b>
          <label class="field" style="margin-top:10px"><span>每张积分</span><input class="input" data-f="ccredits" type="number" value="100" min="1"></label>
          <label class="field"><span>数量(≤100)</span><input class="input" data-f="ccount" type="number" value="5" min="1" max="100"></label>
          <label class="field"><span>备注(选填)</span><input class="input" data-f="cnote" placeholder="如:8 月活动"></label>
          <button class="btn primary block" data-x="gencodes" style="margin-top:6px">生成</button>
          <div data-codes style="margin-top:10px"></div>
        </div>
        <div class="card">
          <b>⚙ 收款与费率配置</b>
          <label class="field" style="margin-top:10px"><span>费率(1 元 = N 积分)</span><input class="input" data-f="rate" type="number" value="${rate()}" min="1"></label>
          <label class="field"><span>微信收款码</span><div class="dropzone" data-x="qrw" style="padding:12px">${cfg && cfg.qrWechat ? `<img src="${cfg.qrWechat}" style="max-height:60px">` : '点击上传'}</div></label>
          <label class="field"><span>支付宝收款码</span><div class="dropzone" data-x="qra" style="padding:12px">${cfg && cfg.qrAlipay ? `<img src="${cfg.qrAlipay}" style="max-height:60px">` : '点击上传'}</div></label>
          <button class="btn primary block" data-x="savecfg" style="margin-top:6px">保存配置</button>
          <hr style="border-color:var(--border);margin:14px 0">
          <b>💎 手动调整积分</b>
          <label class="field" style="margin-top:10px"><span>用户名</span><input class="input" data-f="auser" placeholder="用户名"></label>
          <label class="field"><span>数量(负数扣减)</span><input class="input" data-f="adelta" type="number" placeholder="如 500 或 -100"></label>
          <label class="field"><span>原因</span><input class="input" data-f="areason" placeholder="调整原因"></label>
          <button class="btn block" data-x="adjust" style="margin-top:6px">执行调整</button>
        </div>
      </div>`;
    }

    function bindAdmin() {
      const loadReqs = async () => {
        const box = main.querySelector('[data-reqlist]');
        try {
          const d = await payReq('/api/admin/requests');
          if (!d.list.length) { box.innerHTML = '<div class="hint">暂无充值申请</div>'; return; }
          const ST = { pending: ['待审核', 'yellow'], approved: ['已到账', 'green'], rejected: ['已拒绝', 'red'] };
          box.innerHTML = `<table class="tbl"><thead><tr><th>用户</th><th>版本</th><th>金额</th><th>积分</th><th>渠道</th><th>凭证</th><th>状态</th><th>操作</th></tr></thead><tbody>
            ${d.list.map(r => { const [t, c] = ST[r.status] || [r.status, '']; return `<tr>
              <td>${U.esc(r.username)}</td>
              <td>${U.esc(r.planName)}</td>
              <td style="color:var(--yellow)">¥${r.yuan.toLocaleString()}</td>
              <td>💎 ${(r.credits + r.gifted).toLocaleString()}</td>
              <td>${U.esc(r.channel)}${r.note ? `<div class="small muted">${U.esc(r.note)}</div>` : ''}</td>
              <td>${r.proof ? `<a href="${r.proof}" target="_blank">查看</a>` : '<span class="muted">无</span>'}</td>
              <td><span class="tag ${c}">${t}</span><div class="small muted">${U.esc(r.createdAt)}</div></td>
              <td>${r.status === 'pending' ? `
                <button class="btn sm primary" data-approve="${r.id}">通过</button>
                <button class="btn sm" data-reject="${r.id}">拒绝</button>` : ''}</td>
            </tr>`; }).join('')}
          </tbody></table>`;
          box.querySelectorAll('[data-approve]').forEach(b2 => b2.onclick = () => handleReq(b2.dataset.approve, 'approve'));
          box.querySelectorAll('[data-reject]').forEach(b2 => b2.onclick = () => {
            U.openModal({
              title: '拒绝充值申请',
              body: `<label class="field"><span>拒绝原因(将展示给用户)</span><input class="input" data-f="note" placeholder="如:未查到该笔转账"></label>`,
              footer: `<button class="btn" data-x="no">取消</button><button class="btn primary" data-x="yes">确认拒绝</button>`,
              onMount(m2, close2) {
                m2.querySelector('[data-x=no]').onclick = close2;
                m2.querySelector('[data-x=yes]').onclick = () => { close2(); handleReq(b2.dataset.reject, 'reject', m2.querySelector('[data-f=note]').value.trim()); };
              },
            });
          });
        } catch (e) { box.innerHTML = '<div class="hint">加载失败:' + U.esc(e.message) + '</div>'; }
      };
      const handleReq = async (id, action, note) => {
        try {
          await payReq('/api/admin/handle', { method: 'POST', body: JSON.stringify({ id, action, note }) });
          U.toast(action === 'approve' ? '已通过,积分已到账对方账号' : '已拒绝', 'success');
          loadReqs();
        } catch (e) { U.toast(e.message, 'error', 3500); }
      };
      loadReqs();
      main.querySelector('[data-x=refresh]').onclick = loadReqs;

      main.querySelector('[data-x=gencodes]').onclick = async () => {
        const credits = +main.querySelector('[data-f=ccredits]').value;
        const count = +main.querySelector('[data-f=ccount]').value;
        const note = main.querySelector('[data-f=cnote]').value.trim();
        if (!credits || credits < 1) return U.toast('请输入每张积分', 'error');
        try {
          const d = await payReq('/api/admin/codes', { method: 'POST', body: JSON.stringify({ credits, count, note }) });
          main.querySelector('[data-codes]').innerHTML = `
            <div class="hint" style="margin-bottom:6px">已生成 ${d.codes.length} 张(每张 💎${d.credits}):</div>
            <textarea class="input" rows="${Math.min(8, d.codes.length + 1)}" readonly style="font-family:monospace;font-size:12px">${d.codes.join('\n')}</textarea>`;
          U.toast('卡密已生成,请复制保存', 'success');
        } catch (e) { U.toast(e.message, 'error', 3500); }
      };

      let qrW = cfg ? cfg.qrWechat : '', qrA = cfg ? cfg.qrAlipay : '';
      main.querySelector('[data-x=qrw]').onclick = async () => {
        const f = await U.readAndUpload('image/*', { maxMB: 10 });
        if (f && f.server) { qrW = f.url; main.querySelector('[data-x=qrw]').innerHTML = `<img src="${qrW}" style="max-height:60px">`; }
        else if (f) U.toast('上传失败(需后端在线)', 'error');
      };
      main.querySelector('[data-x=qra]').onclick = async () => {
        const f = await U.readAndUpload('image/*', { maxMB: 10 });
        if (f && f.server) { qrA = f.url; main.querySelector('[data-x=qra]').innerHTML = `<img src="${qrA}" style="max-height:60px">`; }
        else if (f) U.toast('上传失败(需后端在线)', 'error');
      };
      main.querySelector('[data-x=savecfg]').onclick = async () => {
        try {
          await payReq('/api/admin/payconfig', {
            method: 'POST',
            body: JSON.stringify({ rate: +main.querySelector('[data-f=rate]').value, qrWechat: qrW, qrAlipay: qrA }),
          });
          cfg = Object.assign(cfg || {}, { rate: +main.querySelector('[data-f=rate]').value, qrWechat: qrW, qrAlipay: qrA });
          U.toast('配置已保存', 'success');
        } catch (e) { U.toast(e.message, 'error', 3500); }
      };

      main.querySelector('[data-x=adjust]').onclick = async () => {
        const username = main.querySelector('[data-f=auser]').value.trim();
        const delta = +main.querySelector('[data-f=adelta]').value;
        const reason = main.querySelector('[data-f=areason]').value.trim();
        if (!username) return U.toast('请输入用户名', 'error');
        if (!delta) return U.toast('请输入非零数量', 'error');
        try {
          await payReq('/api/admin/credits', { method: 'POST', body: JSON.stringify({ username, delta, reason }) });
          U.toast(`已${delta > 0 ? '增加' : '扣减'} ${Math.abs(delta)} 积分(${username})`, 'success');
        } catch (e) { U.toast(e.message, 'error', 3500); }
      };
    }

    /* 首屏:拉支付配置(决定档位/收款码/管理员 tab),再渲染 */
    if (Store.getToken()) {
      payReq('/api/pay/config').then(d => { cfg = d; render(); }).catch(() => { cfg = null; render(); });
    }
    render();
  };
})();
