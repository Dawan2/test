/* ============ billing.js 服务端计费核心(九轮抽出:server.js 与 tests/unit.js 共用) ============
 * 计费动作白名单 + 各付费端点的动作推导/校验 + jsonMode 宽松解析——价格唯一权威的单一定义点。
 * 抽出动机:单元测试直接对本模块做"客户端 billingAction ↔ 服务端端点"兼容矩阵,
 * 封死"服务端收紧校验把前端正常动作 400 拒掉"这类回归(测试路径/e2e mock 都绕不过计费校验)。
 * server.js 按自身 CONFIG.billingActions 覆盖价格后调用;价格表结构与推导规则在此单一维护。 */
'use strict';

/* 内置动作白名单(config.json billingActions 可覆盖价格;键即动作名,值即价格) */
const DEFAULT_ACTIONS = {
  // 生图(/api/volc/image)
  'image.gen': 2, 'image.tweetShot': 3, 'image.multiView': 3, 'image.fusion': 3,
  'image.hd': 1, 'image.inpaint': 2, 'image.realistic': 3, 'image.multiCam1': 21, 'image.multiCam2': 11,
  // 生视频(/api/volc/video)
  'video.gen': 5, 'video.beat': 10,
  // 语音合成(/api/volc/tts)
  'tts.gen': 1,
  // LLM(/api/llm/chat)
  'llm.chat': 1, 'llm.agent': 1, 'llm.evolve': 1, 'llm.skill': 1, 'llm.review': 5, 'llm.optimize': 1,
  'llm.narration': 2, 'llm.understanding': 2, 'llm.translate': 2, 'llm.import': 2, 'llm.smartSB': 4,
  'llm.director': 10, 'llm.tool': 2, 'llm.extract': 2,
  // FFmpeg(/api/ffmpeg/*)
  'ff.compose': 3, 'ff.hdStd': 20, 'ff.hdPro': 100, 'ff.erase': 5, 'ff.eraseTool': 2,
  'ff.highlight': 5, 'ff.upscaleTool': 2, 'ff.frames': 2, 'ff.merge': 1, 'ff.cut': 2, 'ff.tool': 2,
};

/* 动作族:billingAction 必须属于当前端点的族(跨端点套利拦截,如视频接口提 image.hd) */
const ACTION_FAMILY = { image: /^image\./, video: /^video\./, tts: /^tts\./, llm: /^llm\./, ff: /^ff\./ };

/* 端点动作校验:submitted 须属于 family 且在价格表内;再按 allowedSet(结构无法唯一定价的
 * 变体集合)或 derived(严格等于推导值)判定。返回 {ok,action} 或 {ok:false,msg}。 */
function validateBillingAction(family, table, submitted, derived, allowedSet) {
  const fam = ACTION_FAMILY[family];
  if (!fam || !fam.test(String(submitted)) || table[String(submitted)] == null) {
    return { ok: false, msg: 'billingAction 不属于本端点允许的动作族:' + String(submitted).slice(0, 30) };
  }
  if (allowedSet) {
    if (!allowedSet.includes(String(submitted))) {
      return { ok: false, msg: 'billingAction 与请求结构不符(本结构允许:' + allowedSet.join('/') + '):' + submitted };
    }
  } else if (String(submitted) !== String(derived)) {
    return { ok: false, msg: 'billingAction 与请求参数推导的计费动作不符(应为 ' + derived + '):' + submitted };
  }
  return { ok: true, action: String(submitted) };
}

/* LLM 端点接受集合:消息体结构无法区分业务用途(理解/评审/修订都是"发消息收回复"),
 * 同族动作全部放行(价格上界=白名单价,标签由客户端声明)——已知残留,彻底封死需服务端工作流编排 */
function llmAllowedActions(table) {
  return Object.keys(table).filter(k => ACTION_FAMILY.llm.test(k));
}

/* 生图端点推导(十一轮:价格由服务端按请求结构+prompt 信号决定,不再信任客户端标签)。
 * 多图(≥2)→ 严格 image.fusion;单图 i2i 按 prompt 内容信号推导业务动作——宫格/高清化/局部重绘/
 * 超写实/多视角各是不同的 prompt 工程(前端固定话术),命中即定死对应动作;无信号 → 仅 image.gen。
 * 这是真实的服务端可验证信号:生图的产品就是 prompt 本身,标签不再参与定价。
 * 纯文生 {gen,tweetShot}(推文模式与普通文生结构无差异,价差 1 分为可接受残留) */
function deriveImageAction(b) {
  b = b || {};
  if (Array.isArray(b.image) && b.image.length >= 2) {
    return { derived: 'image.fusion', allowedSet: null };
  }
  if (b.image) {
    const P = String(b.prompt || '');
    const size = String(b.size || '');
    // 多机位宫格:渠道按分辨率档钉死(2K 高精 multiCam1 / 标清 multiCam2)
    if (/宫格|多机位|网格均分/.test(P)) {
      return { derived: ['2048x2048', '2048x1152', '1152x2048'].includes(size) ? 'image.multiCam1' : 'image.multiCam2', allowedSet: null };
    }
    // 高清增强(须 2K/4K 目标档)
    if (/高清化|超清重绘|提升分辨率/.test(P) && (size === '2K' || size === '4K')) {
      return { derived: 'image.hd', allowedSet: null };
    }
    // 局部重绘(蒙版修复话术)
    if (/红色涂抹|局部重绘|蒙版覆盖/.test(P)) {
      return { derived: 'image.inpaint', allowedSet: null };
    }
    // 超写实转换
    if (/超写实|真人质感/.test(P)) {
      return { derived: 'image.realistic', allowedSet: null };
    }
    // 多视角(同主体不同机位/角度)
    if (/视角|机位拍摄|不同角度/.test(P)) {
      return { derived: 'image.multiView', allowedSet: null };
    }
    return { derived: 'image.gen', allowedSet: null };
  }
  return { derived: 'image.gen', allowedSet: ['image.gen', 'image.tweetShot'] };
}

/* 视频端点推导:请求时长>10s 一律 video.beat(长视频按 2 镜计价,封死长视频提 video.gen 低价);
 * ≤10s 允许 {gen,beat}(节拍板短段落按 2 镜平价属产品定价,非套利方向) */
function deriveVideoAction(b, rawDur) {
  const d = Number.isFinite(+rawDur) ? +rawDur : 5;
  return d > 10
    ? { derived: 'video.beat', allowedSet: null }
    : { derived: 'video.gen', allowedSet: ['video.gen', 'video.beat'] };
}

/* FFmpeg 端点推导:路由唯一确定;upscale 再按 quality 档位细分(pro→hdPro/std→hdStd/缺省→工具级);
 * suberase 十一轮统一为 ff.erase(5)——同一 delogo 路由的两个入口价(erase 5/eraseTool 2)结构上
 * 无法区分,属客户端自选低价漏洞,现钉死单一价;未知子路由返回 null(404) */
const FF_ROUTES = { frames: 'ff.frames', suberase: 'ff.erase', highlight: 'ff.highlight', compose: 'ff.compose', merge: 'ff.merge', cut: 'ff.cut' };
function deriveFFAction(ff, b) {
  if (ff === 'upscale') {
    const q = b && b.quality;
    return { derived: q === 'pro' ? 'ff.hdPro' : q === 'std' ? 'ff.hdStd' : 'ff.upscaleTool', allowedSet: null };
  }
  const derived = FF_ROUTES[ff];
  return derived ? { derived, allowedSet: null } : null;
}

/* 宽松 JSON 解析(与前端 api.js parseJSON 同算法):剥代码围栏→整串→截取 {...}/[...] 子串。
 * jsonMode 交付校验用——服务端能解析出的结果前端必然能解析,反之亦然(封死"服务端解析失败
 * 可退款、前端宽松解析却拿到可用结果"的套利窗口)。解析失败返回 null(区别于抛错)。 */
function lenientParseJSON(text) {
  let t = String(text || '').trim();
  t = t.replace(/^```(?:json)?/i, '').replace(/```\s*$/, '').trim();
  try { return JSON.parse(t); } catch (_) {}
  const i = t.indexOf('{'), j = t.lastIndexOf('}');
  if (i >= 0 && j > i) { try { return JSON.parse(t.slice(i, j + 1)); } catch (_) {} }
  const a = t.indexOf('['), b2 = t.lastIndexOf(']');
  if (a >= 0 && b2 > a) { try { return JSON.parse(t.slice(a, b2 + 1)); } catch (_) {} }
  return null;
}

/* ---- operation/步骤状态机判定(十轮抽出为纯函数,server.js 编排 IO,单测直接覆盖) ---- */

/* LLM 步骤重入判定:对 (op, step, rh) 返回处置决策。
 *  - replay-cached : 该步骤已成功且有缓存响应 → 直接返回缓存(真正幂等,不再调上游)
 *  - replay-denied : 该步骤已成功但无缓存(超长结果) → 拒绝重放
 *  - replay-exec   : 该步骤未成功且同内容 → 幂等重放(网络重试,重新执行)
 *  - conflict      : 该步骤内容已变化 → 409
 *  - new-step      : 新步骤槽位且未交付未超预算 → 登记(聚合内免费步)
 *  - delivered-blk : 新步骤但 operation 已交付 → 拒绝追加
 *  - budget-blk    : 步骤槽位超上限 → 拒绝
 *  - non-llm-*     : 非 LLM 同 opId 复用的三态(rh 冲突/delivered 拒绝/重新扣费) */
function stepDecision(op, step, rh, opts) {
  const o = opts || {};
  const stepBudget = o.stepBudget || 8;
  const isLlm = !!o.isLlm;
  if (!isLlm) {
    if (op.requestHash !== rh) return 'non-llm-conflict';
    if (op.status === 'delivered') return 'non-llm-delivered';
    return 'non-llm-recharge'; // refunded 后同内容重试 → 重新扣费(追加新记录)
  }
  if (op.status === 'refunded') return 'llm-recharge'; // 整笔已退 → 重新扣费
  const steps = op.steps || {};
  const prev = steps[step];
  if (prev) {
    if (prev.rh !== rh) return 'conflict';
    if (prev.ok) return prev.resp != null ? 'replay-cached' : 'replay-denied';
    return 'replay-exec';
  }
  if (op.status === 'delivered') return 'delivered-blk';
  if (Object.keys(steps).length >= stepBudget) return 'budget-blk';
  return 'new-step';
}

/* 退款授权判定:对单条 operation 记录返回可否退款。
 *  - refundable          : charged 且无任何成功步骤 → 可退(客户端/内部一致)
 *  - blocked-delivered   : 已 delivered → 不可退
 *  - blocked-refunded    : 已 refunded → 不可再退(十一轮:此前 refunded 旧记录被当 refundable,
 *                          退款重试后新扣费映射到旧记录时,已退过的旧记录又放行一次)
 *  - blocked-ok-step     : 聚合流程已有成功步骤(部分交付,上游成本已发生)→ 不可退
 *  - blocked-missing     : 登记缺失(被淘汰/文件损坏)→ 失败关闭,不可退 */
function refundDecision(op) {
  if (!op) return 'blocked-missing';
  if (op.status === 'delivered') return 'blocked-delivered';
  if (op.status === 'refunded') return 'blocked-refunded';
  if (op.steps && Object.values(op.steps).some(st => st && st.ok)) return 'blocked-ok-step';
  return 'refundable';
}

/* 退款计划(十一轮抽出纯函数):给定 operation 记录列表与有效扣费条目,按 chargeIdem 精确归属
 * 每笔扣费到其创建时的记录,返回 [{charge, op, decision}] —— server.refundOperation 据此逐条执行。
 * 归属规则:charge.idem === op.chargeIdem(完整匹配,含 ~n 重试后缀——重试记录存的就是完整 idem);
 * 找不到 → blocked-missing(旧数据无 chargeIdem / 记录被淘汰,失败关闭)。
 * 修复:此前 ownerOf 按 action find 最早记录,退款重试后新扣费映射到旧 refunded 记录,
 * refundDecision 判 refundable → 最新成功扣费被退回。 */
function refundPlan(ops, charges) {
  const byIdem = new Map();
  for (const op of (ops || [])) {
    if (op && op.chargeIdem) byIdem.set(String(op.chargeIdem), op);
  }
  return (charges || []).map(c => {
    const op = byIdem.get(String(c.idem || '')) || null;
    return { charge: c, op, decision: refundDecision(op) };
  });
}

/* 在途执行判定(十一轮):executing 且 updatedAt 未超时 → 客户端退款被拒(请求可能正在调上游,
 * 退款后原请求仍能交付);executing 超过 staleMs(默认 10 分钟)视为进程崩溃残留 → 放行退款。
 * 服务端内部退款(失败路径)不受此限——它正是 executing 的正常出口 */
function clientRefundBlocked(op, now, staleMs) {
  if (!op || op.status !== 'executing') return false;
  const t = now || Date.now();
  return (t - (op.updatedAt || 0)) < (staleMs || 10 * 60 * 1000);
}

/* 取最新一条匹配记录(退款重试会追加新记录,交付/退款必须作用于最新扣费,而非最早的旧记录) */
function latestOp(list, userId, opId, action) {
  let found = null;
  for (const o of (list || [])) {
    if (o.userId === userId && o.opId === opId && (!action || o.action === action)) found = o;
  }
  return found;
}

module.exports = { DEFAULT_ACTIONS, ACTION_FAMILY, validateBillingAction, llmAllowedActions, deriveImageAction, deriveVideoAction, deriveFFAction, FF_ROUTES, lenientParseJSON, stepDecision, refundDecision, refundPlan, clientRefundBlocked, latestOp };
