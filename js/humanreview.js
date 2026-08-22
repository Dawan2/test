/* ============ humanreview.js 真人审核预审 ============
 * 含真人人脸的参考素材需先审后用。
 * 预审通过的素材才能放心用于文生视频/多图融合等生成,避免正式任务因素材审核失败浪费积分。
 * 当前为本地模拟审核通道(与生图/生视频占位模拟一致),接入真实视频 API 时替换 runReview 即可。
 */
(function () {
  window.HumanReview = {};
  /* 状态语义拆分:local_available=本地可用性检查通过(素材可访问,非平台审核);
   * approved 预留给真实审核/管理员通道(当前不产生,仅兼容存量数据);rejected=未通过 */
  const STATUS_NAME = { pending: '检查中', local_available: '本地可用', approved: '已审核', rejected: '未通过' };
  const STATUS_TAG = { pending: 'yellow', local_available: 'green', approved: 'green', rejected: '' };

  function myReviews() {
    const u = Store.currentUser();
    return (Store.state.assetReviews || []).filter(r => r.userId === (u && u.id));
  }
  /* 某素材最新一条审核记录(记录是 unshift 的,第一个即最新) */
  function recordOf(url) {
    if (!url) return null;
    return myReviews().find(r => r.url === url) || null;
  }

  /* 本地可用性检查(未接真实审核通道):素材可加载 → 标记 local_available(本地可用);无法访问 → 驳回。
   * "本地可用"仅代表素材可访问,不等同平台审核通过;接真实审核/管理员通道后替换本函数即可产生正式 approved */
  function runReview(rec, tk, onChange) {
    const finish = ok => {
      const label = rec.kind === 'asset' ? '资产可用性检查' : '真人素材检查';
      rec.status = ok ? 'local_available' : 'rejected';
      rec.reason = ok
        ? (rec.kind === 'asset' ? '本地可用性检查通过(素材可访问);未接真实审核通道,共享与商用前请自行确认授权' : '本地可用性检查通过(素材可访问);未接真实审核通道,用于生成前请自行确认肖像授权')
        : (rec.kind === 'asset' ? '素材无法访问或命中合规要求,检查未通过;请更换图片后重新提交' : '素材无法访问或已失效,请重新上传后再提交检查');
      rec.doneAt = Store.now();
      Store.save();
      if (ok) { Tasks.done(tk); U.toast(`「${rec.name}」${label}通过`, 'success'); }
      else { Tasks.fail(tk, rec.reason); U.toast(`「${rec.name}」${label}未通过:${rec.reason}`, 'error', 4000); }
      onChange && onChange();
    };
    const img = new Image();
    let settled = false;
    img.onload = () => { if (!settled) { settled = true; setTimeout(() => finish(true), 2500 + Math.random() * 2500); } };
    img.onerror = () => { if (!settled) { settled = true; setTimeout(() => finish(false), 1200); } };
    img.src = rec.url;
    // 兜底:10s 无响应视为不可访问
    setTimeout(() => { if (!settled) { settled = true; finish(false); } }, 10000);
  }

  /* 提交预审(入口:资产库文件卡片/审核记录页);先认证:未完成肖像授权声明先引导声明 */
  HumanReview.submit = function ({ name, url }, onChange) {
    const u = Store.currentUser();
    if (!u) return U.toast('请先登录', 'error');
    if (window.Compliance && !Compliance.isCertified()) {
      U.confirm('含真人肖像的素材需先完成「肖像授权声明」(本人或已获授权),声明后才能提交检查。现在去填写声明吗?', () => Compliance.certModal(onChange), '去声明');
      return;
    }
    if (!url) return U.toast('素材地址为空', 'error');
    const cur = recordOf(url);
    if (cur && cur.status === 'pending') return U.toast('该素材正在检查中,请稍候', 'info');
    if (cur && (cur.status === 'local_available' || cur.status === 'approved')) return U.toast('该素材已标记本地可用,无需重复提交', 'info'); // approved=存量数据,语义同本地可用
    Store.state.assetReviews = Store.state.assetReviews || [];
    const rec = {
      id: Store.uid('hr'), userId: u.id, name: name || '未命名素材', url,
      status: 'pending', reason: '', time: Store.now(), doneAt: '',
    };
    Store.state.assetReviews.unshift(rec);
    Store.save();
    const tk = Tasks.start({ type: '真人素材检查', model: '本地可用性检查', target: rec.name });
    U.toast(`「${rec.name}」已提交本地可用性检查`, 'success');
    onChange && onChange();
    runReview(rec, tk, onChange);
  };

  /* 素材状态徽标 html(无记录返回 '') */
  HumanReview.badge = function (url) {
    const r = recordOf(url);
    if (!r) return '';
    return `<span class="tag ${STATUS_TAG[r.status]}">🧑 ${STATUS_NAME[r.status]}</span>`;
  };

  /* ---- 资产本地可用性检查(标记→检查→入库) ----
   * 资产条目 review 字段状态机:undefined=自产自用默认可用 → 'pending'(检查中) → 'local_available'/'rejected';驳回可重新提交。
   * (approved 为真实审核通道预留,当前不产生;存量 approved 数据按本地可用兼容展示)
   * 记录与真人素材检查同存 state.assetReviews,带 kind:'asset' 与 assetId;检查完结回写资产条目 review 状态。 */
  function assetRecordOf(assetId) {
    if (!assetId) return null;
    return myReviews().find(r => r.kind === 'asset' && r.assetId === assetId) || null; // unshift,第一条即最新
  }
  HumanReview.assetRecordOf = assetRecordOf; // 供 assets.js 卡片取驳回原因

  /* 提交资产本地可用性检查(入口:saveSubjectToAssets 保存后 / 素材库「标记为资产」/ 卡片「重新检查」) */
  HumanReview.submitAsset = function (asset, onChange) {
    const u = Store.currentUser();
    if (!u) return U.toast('请先登录', 'error');
    if (!asset || !asset.id) return;
    const cur = assetRecordOf(asset.id);
    if (cur && cur.status === 'pending') return U.toast('该资产正在本地可用性检查中,请稍候', 'info');
    Store.state.assetReviews = Store.state.assetReviews || [];
    /* 直接记驳回的两类:真人未认证(引导认证,与 submit 的先声明一致)/ 资产缺图 */
    const rejectNow = reason => {
      asset.review = 'rejected';
      Store.state.assetReviews.unshift({ id: Store.uid('hr'), userId: u.id, kind: 'asset', assetId: asset.id, name: asset.name || '未命名资产', url: asset.image || '', status: 'rejected', reason, time: Store.now(), doneAt: Store.now() });
      Store.save();
      onChange && onChange();
    };
    if (window.Compliance && !Compliance.isCertified()) {
      rejectNow('未完成肖像授权声明,检查未通过;请先完成声明后重新提交');
      U.confirm('资产可用性检查需先完成「肖像授权声明」(本人或已获授权)。本次已记为未通过,现在去填写声明吗?', () => Compliance.certModal(onChange), '去声明');
      return;
    }
    if (!asset.image) return rejectNow('资产缺少图片,无法提交检查;请补图后重新提交');
    asset.review = 'pending';
    const rec = {
      id: Store.uid('hr'), userId: u.id, kind: 'asset', assetId: asset.id, name: asset.name || '未命名资产', url: asset.image,
      status: 'pending', reason: '', time: Store.now(), doneAt: '',
    };
    Store.state.assetReviews.unshift(rec);
    Store.save();
    const tk = Tasks.start({ type: '资产可用性检查', model: '本地可用性检查', target: rec.name });
    U.toast(`「${rec.name}」已提交本地可用性检查`, 'success');
    onChange && onChange();
    runReview(rec, tk, () => {
      // 检查完结回写资产条目 review(资产可能已被删除,防御)
      const a = Store.state.assets.subjects.find(x => x.id === asset.id);
      if (a) { a.review = rec.status; Store.save(); }
      onChange && onChange();
    });
  };

  /* 生成前校验:urls 中被驳回 → 弹窗阻止;审核中 → 确认后可继续;其余直接放行 */
  HumanReview.guard = function (urls, proceed) {
    const uniq = [...new Set((urls || []).filter(Boolean))];
    const rejected = uniq.map(u => ({ url: u, rec: recordOf(u) })).filter(x => x.rec && x.rec.status === 'rejected');
    if (rejected.length) {
      U.openModal({
        title: '🧑 真人素材审核未通过',
        body: `
        <div class="small" style="line-height:1.8">以下 ${rejected.length} 个真人素材未通过预审,继续使用将导致生成任务失败并浪费积分,请先更换素材或重新提交审核:</div>
        ${rejected.map(x => `
        <div class="card" style="padding:10px;margin-top:8px;display:flex;gap:10px;align-items:center">
          <img src="${U.thumb(x.url)}" style="width:64px;height:64px;object-fit:cover;border-radius:6px">
          <div class="grow" style="min-width:0">
            <b class="small">${U.esc(x.rec.name)}</b>
            <div class="hint" style="margin:2px 0 0">${U.esc(x.rec.reason || '审核未通过')}</div>
          </div>
          <span class="tag">未通过</span>
        </div>`).join('')}`,
        footer: `<button class="btn primary" data-x="ok">知道了</button>`,
        onMount(m, close) { m.querySelector('[data-x=ok]').onclick = close; },
      });
      return;
    }
    const pending = uniq.map(u => recordOf(u)).filter(r => r && r.status === 'pending');
    if (pending.length) {
      U.confirm(`有 ${pending.length} 个真人素材正在本地可用性检查中(${pending.map(r => r.name).join('、')})。仍要继续生成吗?`, proceed, '仍要生成');
      return;
    }
    proceed();
  };

  /* 收集一个分镜实际引用的图片(分镜图/首尾帧/出场角色主体图,支持多形态全称;主体取图优先级与 shotRefImages 一致:形态图 > 视频参考大头照 > 权威参考图) */
  HumanReview.shotImageUrls = function (p, s) {
    const urls = [s.image, s.firstFrame, s.lastFrame];
    (s.characters || []).forEach(n => {
      const r = Store.findSubject(p, n);
      const img = r ? ((r.form && r.form.image) || r.s.imgRef || r.s.image) : null;
      if (img) urls.push(img);
    });
    return urls.filter(Boolean);
  };
})();
