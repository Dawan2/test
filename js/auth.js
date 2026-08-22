/* ============ auth.js 注册 / 登录(后端优先,离线降级本地) ============ */
(function () {
  window.Views = window.Views || {};

  // 网络错误(后端不可达)与业务错误区分:offline 错误触发本地降级
  async function postJSON(url, body) {
    let res;
    try {
      res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    } catch (e) {
      const err = new Error('offline'); err.offline = true; throw err;
    }
    const j = await res.json().catch(() => ({ code: -1, message: '响应解析失败' }));
    if (!res.ok || j.code !== 0) { const err = new Error(j.message || ('请求失败(' + res.status + ')')); err.status = res.status; throw err; }
    return j.data;
  }

  Views.auth = function (app) {
    let mode = 'login'; // login | register
    let accountType = 'personal';

    function render() {
      app.innerHTML = `
      <div class="auth-page">
        <div class="auth-glow g1"></div>
        <div class="auth-glow g2"></div>
        <div class="auth-box">
          <div class="auth-logo">
            <div class="logo-orca auth-orca">${ORCA_SVG}</div>
            <div>
              <div class="auth-title">虎鲸漫剧</div>
              <div class="auth-sub">AI 短漫剧全流程智能创作平台</div>
            </div>
          </div>
          <div class="auth-slogan">讲好每一个故事！</div>
          <div class="tabs" style="justify-content:center">
            <div class="tab ${mode === 'login' ? 'active' : ''}" data-m="login">登录</div>
            <div class="tab ${mode === 'register' ? 'active' : ''}" data-m="register">注册</div>
          </div>
          <label class="field"><span>用户名</span><input class="input" data-f="username" placeholder="请输入用户名"></label>
          <label class="field"><span>密码</span><input class="input" type="password" data-f="password" placeholder="请输入密码"></label>
          ${mode === 'register' ? `
          <label class="field"><span>手机号(选填)</span><input class="input" data-f="phone" placeholder="用于账号找回(不发送验证码)"></label>
          <label class="field"><span>账号类型(公司主体账号拥有团队管理功能)</span>
            <div class="model-row">
              <div class="model-opt ${accountType === 'personal' ? 'sel' : ''}" data-at="personal">👤 个人账号</div>
              <div class="model-opt ${accountType === 'company' ? 'sel' : ''}" data-at="company">🏢 公司主体</div>
            </div>
          </label>` : ''}
          <button class="btn primary lg block" data-x="submit" style="margin-top:6px">${mode === 'login' ? '登 录' : '注册并登录'}</button>
          <div class="hint" style="text-align:center;margin-top:14px">账号存于本地后端(data/users.json,密码加盐哈希)<br>后端未启动时自动进入离线模式(仅存本机 localStorage)</div>
        </div>
      </div>`;

      app.querySelectorAll('[data-m]').forEach(t => t.onclick = () => { mode = t.dataset.m; render(); });
      app.querySelectorAll('[data-at]').forEach(t => t.onclick = () => { accountType = t.dataset.at; render(); });
      const submit = async () => {
        const username = app.querySelector('[data-f=username]').value.trim();
        const password = app.querySelector('[data-f=password]').value;
        const phoneEl = app.querySelector('[data-f=phone]');
        const phone = phoneEl ? phoneEl.value.trim() : '';
        if (!username || !password) return U.toast('请输入用户名和密码', 'error');
        const btn = app.querySelector('[data-x=submit]');
        btn.disabled = true;
        try {
          if (mode === 'register') {
            try {
              const r = await postJSON('/api/auth/register', { username, password, phone, accountType });
              Store.setToken(r.token);
              const pulled = await Store.pullState();
              if (pulled === 'empty') Store.freshStateFor(r.user);
              else if (pulled === 'error') U.toast('注册成功,但云端数据拉取失败,已保留本机数据,可稍后重试同步', 'error', 4000);
              U.toast('注册成功,已赠送 100 积分(云端同步已开启)', 'success', 3000);
            } catch (e) {
              if (!e.offline) throw e;
              const r = Store.register(username, password, accountType);
              if (!r.ok) { U.toast(r.msg, 'error'); btn.disabled = false; return; }
              U.toast('离线模式:账号保存在本机 localStorage(后端不可达)', 'info', 3500);
            }
          } else {
            try {
              const r = await postJSON('/api/auth/login', { username, password });
              Store.setToken(r.token);
              const pulled = await Store.pullState();
              if (pulled === 'empty') Store.freshStateFor(r.user);
              else if (pulled === 'error') U.toast('登录成功,但云端数据拉取失败,已保留本机数据,可稍后重试同步', 'error', 4000);
              if (window.U && U.syncBillingActions) { try { U.syncBillingActions(); } catch (_) {} } // 登录即同步服务端计费动作(COST 跟随白名单)
              U.toast('欢迎回来,' + r.user.username + '(云端数据已同步)', 'success');
            } catch (e) {
              if (!e.offline) throw e;
              const r = Store.login(username, password);
              if (!r.ok) { U.toast(r.msg + '(离线模式仅支持本机已注册账号)', 'error'); btn.disabled = false; return; }
              U.toast('离线模式登录成功(数据仅存本机)', 'info', 3000);
            }
          }
          // 重登返回:401 跳转时记录的来源页(无记录则默认项目列表)
          let back = '';
          try { back = sessionStorage.getItem('mv_hujing_login_from') || ''; sessionStorage.removeItem('mv_hujing_login_from'); } catch (_) { /* 存储满忽略 */ }
          location.hash = (back && back !== '#/login') ? back : '#/projects';
        } catch (e) {
          U.toast(e.message, 'error', 3200);
          btn.disabled = false;
        }
      };
      app.querySelector('[data-x=submit]').onclick = submit;
      app.querySelectorAll('.input').forEach(i => i.onkeydown = e => { if (e.key === 'Enter') submit(); });
    }
    render();
  };
})();
