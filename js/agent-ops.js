/* ============ agent-ops.js 导演助手 ops 执行域(自 agent.js 拆分) ============
 * 动作执行器(run/select/goto 真实驱动工作台)/预排模式族/上下文与分镜压缩/工作台定位/
 * ops 应用器(update/insert/delete/move/batch + 脚本层)与执行闭环验证。
 * 加载顺序:agent.js 之后(agent.js 先建 window.AgentCore;本文件建 window.AgentOps 供其运行时取用)。 */
(function () {
  const AC = window.AgentCore;
  const FIELD_MAP = { 剧情: 'plot', 名称: 'name', 运镜: 'camera', 视角: 'view', 角度: 'angle', 景别: 'shotSize', 光圈: 'aperture', 提示词: 'prompt', 旁白: 'narration', 台词: 'dialogue', 时长: 'duration' };

  /* ================= 工作台动作执行器(Agent 真执行,不只是对话) =================
   * 动作类 ops 通过真实按钮点击驱动工作台,原功能的计费/退费/任务登记链路不变 */
  const DATA_OPS = ['update', 'insert', 'delete', 'move', 'batch', 'project', 'scriptmeta', 'subject', 'episode', 'addep', 'delep', 'beatupdate', 'sceneupdate'];
  const ACT_OPS = ['run', 'goto', 'select'];
  const splitOps = ops => ({
    data: (ops || []).filter(o => o && DATA_OPS.includes(o.op)),
    acts: (ops || []).filter(o => o && ACT_OPS.includes(o.op)),
    // 二十轮:未注册的 op 名不再静默吞掉(此前模型输出陌生 op → "(已应用 0 项)"用户不知所以)
    unknown: (ops || []).filter(o => o && o.op && !DATA_OPS.includes(o.op) && !ACT_OPS.includes(o.op)),
  });

  /* ---- 工具注册表 + 分级审批(Codex Harness 理念):每个 op 注册风险级,决定预览标注与自动执行审批闸 ----
   * read=只读(自动模式直执行);edit=常规数据修改(预览卡照旧/自动直执行);edit-hi=高风险删除类(预览卡红色标记);
   * exec=真实驱动工作台(按该功能规则扣费,即使 agentAuto 开启也需 U.confirm 确认后才执行) */
  const OP_TOOLS = {
    update: { risk: 'edit', label: '修改镜头' }, insert: { risk: 'edit', label: '插入镜头' }, delete: { risk: 'edit-hi', label: '删除镜头' },
    move: { risk: 'edit', label: '移动镜头' }, batch: { risk: 'edit', label: '批量修改' }, beatupdate: { risk: 'edit', label: '修改节拍' }, sceneupdate: { risk: 'edit', label: '修改场次' },
    project: { risk: 'edit', label: '修改项目' }, scriptmeta: { risk: 'edit', label: '修改剧本' }, subject: { risk: 'edit', label: '修改主体' },
    episode: { risk: 'edit', label: '修改分集' }, addep: { risk: 'edit', label: '新建分集' }, delep: { risk: 'edit-hi', label: '删除分集' },
    select: { risk: 'read', label: '选中镜头' }, goto: { risk: 'read', label: '切换视图' }, run: { risk: 'exec', label: '执行功能' },
  };
  const opRisk = op => (OP_TOOLS[op && op.op] || { risk: 'edit' }).risk;
  /* ---- 动作类 op → 预览/审批描述(exec 级 run 前加 ⚠ 并注明按该功能规则扣费) ---- */
  function actDesc(o) {
    if (o.op === 'run') return `⚠ ▶ 执行:${o.action || o.cmd}(按该功能规则扣费)`;
    if (o.op === 'goto') return '→ 跳转:' + o.target;
    return '◎ 选中镜头 ' + o.shot;
  }
  /* 预览卡单行渲染(风险分组标注):edit-hi(删除镜头/分集)红色标记,exec 的 ⚠ 已在 actDesc 注明,edit 项照旧 */
  function changeLineHTML(c) {
    const hi = /^删除(镜头|分集)/.test(c);
    return `<div class="small"${hi ? ' style="color:var(--red)"' : ''}>· ${hi ? '🔴 ' : ''}${U.esc(c)}</div>`;
  }
  /* ---- 动作类 op → 统一领域命令(第二阶段:不再模拟点击按钮,结构化回执驱动反馈) ----
   * 命令经 Commands.execute 真实执行(headless:未确认镜跳过/不弹决策弹窗),结果 {ok,status,result,error,cost,next}
   * 回执摘要进聊天记录;视图类 goto/select 维持本地即时动作。 */
  const ACT_CMD = {
    '智能分镜': 'episode.generateStoryboard', '生成分镜': 'episode.generateStoryboard',
    'AI分镜师': 'episode.generateStoryboard', 'AI拆解': 'episode.generateStoryboard', '拆解文字分镜': 'episode.generateStoryboard',
    '生成视频': 'episode.generateVideos', '批量生成视频': 'episode.generateVideos',
    '合成成片': 'episode.compose', '整集审片': 'episode.smartReview', '审片修订': 'episode.smartReview', '重新审片': 'episode.smartReview',
    '一键成片': 'episode.produce', '本集理解': 'episode.understanding',
  };
  /* 动作协议文本(二十轮):由注册表自动生成注入 system prompt——协议宣称与可执行集合恒一致,
   * 模型照协议输出不再必得"⊘ 暂不支持"(此前提示词宣称 9 动作、注册表只 8 个且互有出入,白扣对话轮) */
  const actProtocol = () => Object.keys(ACT_CMD).join('|');
  /* cmd+args 动作协议(二十二轮):命令白名单与参数面由 cmd-registry.js 单源生成——
   * Agent 可执行面从 6 个固定中文动作扩到「全部领域命令 × 全参数空间」(confirmAll/shotIds/maxRetry 等) */
  const cmdProtocol = () => {
    const list = (window.Commands && Commands.list) ? Commands.list() : [];
    const T = { boolean: 'bool', number: '数字', string: '文本', array: '数组' };
    return list.map(c => {
      const args = (c.args || []).filter(a => ['pid', 'epid', 'ui'].indexOf(a.name) < 0); // pid/epid 上下文自动注入,ui 不开放
      const at = args.length
        ? args.map(a => `"${a.name}":${T[a.type] || a.type}${a.required ? '(必填)' : ''}${a.desc ? '—' + a.desc : ''}`).join(' ')
        : '无参数';
      return `· ${c.name}(${c.label}${c.risk === 'read' ? ',只读' : ''}): ${at}`;
    }).join('\n');
  };
  /* run 类 op 的参数白名单与类型整形(cmd-registry 单源):未声明的键丢弃,防模型幻觉参数污染执行/计费 */
  function sanitizeCmdArgs(cmdName, raw) {
    const meta = (typeof CmdRegistry !== 'undefined' && CmdRegistry.byName[cmdName]) || null;
    if (!meta) return {};
    const src = (raw && typeof raw === 'object' && !Array.isArray(raw)) ? raw : {};
    const out = {};
    (meta.args || []).forEach(a => {
      if (['pid', 'epid', 'ui'].indexOf(a.name) >= 0) return; // 上下文注入,不接受模型填写
      let v = src[a.name];
      if (v === undefined || v === null) return;
      if (a.type === 'boolean') v = !!v;
      else if (a.type === 'number') { v = +v; if (!isFinite(v)) return; }
      else if (a.type === 'array') { if (!Array.isArray(v)) return; v = v.map(x => String(x)).slice(0, 50); }
      else v = String(v);
      out[a.name] = v;
    });
    return out;
  }
  /* 结构化回执 → 一句话摘要(与 run 结果 ok/error/cost 对齐,Agent 据此如实汇报,不凭"已发起"声称成功);
   * 二十二轮:消化 r.next(Domain 重推的下一步建议)一并回执——Agent 拿到结构化「下一步」可自主推进多步任务 */
  function cmdDigest(cmd, r) {
    if (!r) return '无回执';
    if (r.error) return r.error.message + (r.cost ? '(-' + r.cost + '积分)' : '');
    const z = r.result || {};
    let s = '';
    if (cmd === 'episode.generateVideos') s = `出片 ${z.ok}/${z.total}` + (z.skipped && z.skipped.length ? `,跳过未确认 ${z.skipped.length} 镜` : '') + (z.failed && z.failed.length ? `,失败 ${z.failed.length} 镜(已退费)` : '');
    else if (cmd === 'episode.compose') s = '成片已归档,可预览导出';
    else if (cmd === 'episode.smartReview') s = `达标 ${z.pass}·重抽 ${z.retry}·待人工 ${z.manual}`;
    else if (cmd === 'episode.generateStoryboard') s = `分镜 ${z.shots} 镜` + (z.plans ? `(${z.plans} 套候选方案待择优)` : '');
    else if (cmd === 'episode.produce') s = '全流程完成:' + (z.steps || []).map(x => x.step + (x.ok ? '✓' : x.status === 'skipped' ? '⊘' : '✕')).join(' → ');
    else if (cmd === 'episode.understanding') s = '本集理解已更新';
    else s = '完成';
    s += (r.cost ? '(-' + r.cost + '积分)' : '');
    if (r.next && r.next.label) s += ';下一步:' + r.next.label;
    return s;
  }
  const WB_GOTO = { '分镜脚本': 'board', '脚本层': 'board', '分镜表': 'shots', '分镜视频': 'shots', '分镜表模式': 'shots', '剪辑': 'cut', '剪辑台': 'cut', '节拍板': 'bb', '节拍板模式': 'bb', '镜头组': 'groups' };
  async function runEpisodeActions(p, ep, acts, main) {
    const done = [];
    for (const op of acts) {
      if (op.op === 'run') {
        /* 二十二轮:cmd+args 新协议(白名单/参数整形自 cmd-registry 单源);旧中文别名 action 兼容层保留 */
        const alias = String(op.action || '').trim();
        const want = String(op.cmd || '').trim();
        const cmd = want || ACT_CMD[alias];
        const names = (window.Commands && Commands.list) ? Commands.list().map(c => c.name) : null; // 无 list 自省(测试桩)时信别名映射
        if (!cmd || !window.Commands || (names && !names.includes(cmd))) { done.push('⊘ 暂不支持自动执行:' + (want || alias || '?')); continue; }
        const args = Object.assign(sanitizeCmdArgs(cmd, op.args), { pid: p.id, epid: ep && ep.id, main });
        // shotIds 允许镜号或 id(模型只见分镜表序号):统一归一为镜头 id
        if (Array.isArray(args.shotIds) && ep) args.shotIds = args.shotIds.map(x => { const s = (ep.shots || []).find(y => y.id === x) || (ep.shots || [])[(+x) - 1]; return s ? s.id : String(x); });
        try {
          const r = await Commands.execute(cmd, args);
          done.push(`▶ ${alias || cmd}:${r.ok ? '✓' : '✕'} ${cmdDigest(cmd, r)}`);
        } catch (e) {
          done.push(`▶ ${alias || cmd}:✕ 异常(${(e && e.message) || e})`);
        }
      } else if (op.op === 'select') {
        const n = (+op.shot) - 1, s = ep.shots[n];
        if (s) { ep.uiSel = s.id; Store.save(); done.push('◎ 选中镜头 ' + (n + 1)); }
      } else if (op.op === 'goto') {
        const t = String(op.target || '').trim();
        if (t.includes('跑批')) { location.hash = '#/project/' + p.id + '/produce'; done.push('→ 一键跑批中心'); }
        else if (WB_GOTO[t]) { window.__epView = WB_GOTO[t]; done.push('→ 切换到' + t); }
      }
    }
    return done;
  }
  /* ---- 回执回喂自修复轮(二十轮;settings.agentSelfFix 开关,二十二轮起默认开——step:'fix' 辅助槽位本就不另扣费) ----
   * run 类命令的执行回执不再只拼进聊天文案:含失败(✕)/不支持(⊘)项时,回执作为新上下文追加一轮
   * 「核验/修复」调用——模型归因并可输出两类修复:数据类 ops(update/insert/move/batch/beatupdate/sceneupdate)
   * 与「重试同一个失败命令」的 run 重试(白名单=回执中失败过的命令,同 opId 幂等,服务端防双扣;最多 2 轮转人工);
   * 修复直接自动执行(沿用本条消息的 undo 快照,verifyOps 回读校验,与自动执行同纪律);
   * 计费复用本条消息的 operationId(step:'fix' 辅助步骤槽位,九轮状态机:辅助步不交付 operation,不另扣费)。
   * 返回追加进聊天文案的摘要;无修复动作/异常/离线均返回 ''(静默降级,不影响主流程)。 */
  async function selfFixRound(p, ep, main, receipts, opId, depth) {
    depth = depth || 0;
    const failed = (receipts || []).filter(x => /[✕⊘]/.test(x));
    if (!failed.length || !ep || !window.API || !API.isReady()) return '';
    let out = null;
    try {
      const call = (window.Understanding && Understanding.chatJSONRobust) ? Understanding.chatJSONRobust.bind(Understanding) : API.chatJSON;
      out = await call({
        model: (Store.state.settings || {}).defLLM || API.getConfig().model,
        system: `你是「虎鲸导演助手」的执行核验器。刚才按用户指令驱动工作台执行了动作,回执如下(✕=失败,⊘=不支持)。
请归因并修复:
- 能靠修改数据修复的(如提示词违规→改写提示词),输出数据类修复 ops(仅 update/insert/move/batch/beatupdate/sceneupdate);
- 临时性失败的动作(上游超时/限流/生成失败已退费),可输出 {"op":"run","cmd":"原命令名"} 重试一次(args 可修正,如 {"shotIds":["失败镜 id 或序号"]})——只允许重试回执里出现过的命令,禁止新动作,禁止 goto/select;
- 修不了的(积分不足/上游故障持续/镜头未确认/缺首帧等需人工决策的),不要输出 ops,只在 reply 里给用户一句建议。
返回 JSON {"reply":"一句话结论","ops":[操作或空数组]}`,
        user: `执行回执:\n${receipts.join('\n')}\n当前分镜表:\n${compactShots(ep)}${stateBlock(p, ep)}`,
        temperature: 0.3, max_tokens: 2000,
        billingAction: 'llm.agent', operationId: opId, step: 'fix',
      });
    } catch (_) { return ''; }
    if (!out) return '';
    const all = Array.isArray(out.ops) ? out.ops.filter(o => o && o.op) : [];
    const sp = splitOps(all);
    const fixes = sp.data;
    /* run 重试白名单:仅允许回执中失败过的命令(防自修复轮发起新动作/执行循环) */
    const retrySet = new Set();
    failed.forEach(x => {
      const m = String(x).match(/▶\s*([^:：]+)[:：]/);
      if (!m) return;
      const t = m[1].trim();
      const cmd = (window.Commands && Commands.list && Commands.list().some(c => c.name === t)) ? t : ACT_CMD[t];
      if (cmd) retrySet.add(cmd);
    });
    const retries = sp.acts
      .filter(o => o.op === 'run' && retrySet.has(String(o.cmd || '').trim() || ACT_CMD[String(o.action || '').trim()] || ''))
      .slice(0, 2);
    let note = '';
    if (fixes.length) {
      // 沿用本条消息已有 undo 快照(不覆盖——一次「↩ 撤销」回滚含自修复在内的全部改动)
      ep.agentUndo = ep.agentUndo || { shots: JSON.parse(JSON.stringify(ep.shots)), composed: ep.composed, board: JSON.parse(JSON.stringify(ep.scriptBoard || null)), time: Store.now() };
      let changes = [], vf = null;
      try {
        changes = applyOps(ep, fixes, true);
        vf = verifyOps(ep, fixes);
        Store.save();
        note = `\n(🩹 自修复:已自动修复 ${fixes.length} 项——${changes.slice(0, 2).join(';').slice(0, 60)}${vf ? ' ' + verifyNote(vf) : ''},可点「↩ 撤销」回滚)`;
      } catch (_) { note = '\n(🩹 自修复:修复方案应用失败,未做改动)'; }
    }
    if (retries.length) {
      const rr = await runEpisodeActions(p, ep, retries, main);
      note += '\n(🩹 自修复重试:' + rr.join(';') + ')';
      /* 限 2 轮:重试仍失败再归因一轮,更深即停转人工(防执行循环) */
      if (depth < 1 && /[✕⊘]/.test(rr.join(''))) {
        const deeper = await selfFixRound(p, ep, main, rr, opId, depth + 1);
        if (deeper) note += deeper;
      }
    }
    if (!note) return '\n(🩹 自修复:' + String(out.reply || '需人工处理,见上').slice(0, 80) + ')';
    return note;
  }
  // 项目级/全局动作
  const PROJ_TAB_OF = { '制片': '制片', '剧本': '剧本', '导演': '导演', '主体': '主体', '分集': '分集', '成片库': '成片库', '剧壳': '剧壳', '切片': '切片' };
  function runGlobalActions(ctx, acts) {
    const { p, ep } = ctx;
    const done = [];
    for (const op of acts) {
      if (op.op === 'goto') {
        const t = String(op.target || '').trim();
        if (!p) continue;
        if (t.includes('跑批')) { location.hash = '#/project/' + p.id + '/produce'; done.push('→ 一键跑批中心'); }
        else if (t === '分镜' || t === '生成' || t === '剪辑') {
          const ep0 = ep || p.episodes[0];
          if (ep0) { window.__epView = t === '分镜' ? 'board' : (t === '生成' || t === '剪辑') ? 'cut' : 'shots'; location.hash = `#/project/${p.id}/episode/${ep0.id}`; done.push('→ ' + t + '(进入分集工作区)'); }
        } else if (PROJ_TAB_OF[t]) { window.__projTab = PROJ_TAB_OF[t]; location.hash = '#/project/' + p.id; done.push('→ 打开' + t); }
      } else if (op.op === 'run' && p) {
        const a = String(op.action || '').trim();
        if (/策划/.test(a) && window.EpisodeLab) { EpisodeLab.openPlanner(p, document.getElementById('main')); done.push('▶ 执行:AI 策划'); }
        else if (/译制/.test(a) && window.EpisodeLab) { EpisodeLab.openLocalize(p, document.getElementById('main')); done.push('▶ 执行:剧本译制'); }
      }
    }
    return done;
  }

  /* ================= 🎛 预排模式(创作意图 → 参数表单预填,用户确认后才执行) =================
   * 开启后生成类意图不走 ops/pending,而是让 LLM 返回「参数预排方案」,渲染为可编辑参数卡片;
   * 「按此方案执行」只把参数写入 ep.sbConfig 并调起真实功能入口,扣费/确认/失败语义全由原入口承担。 */

  // 预排参数字段定义:键与 ep.sbConfig 对齐(默认值见 storyboard.js defaultSBConfig)
  const PREARR_TITLE = { sb: '智能分镜 · 参数预排', batchvideo: '批量生成视频 · 参数预排' };
  const PREARR_FIELDS = {
    sb: [ // 分镜生成类
      { k: 'shotCount', t: '分镜数量', type: 'number', min: 2, max: 40 },
      { k: 'sbPlans', t: '分镜方案数(多方案对比)', type: 'number', min: 1, max: 3 },
      { k: 'sbMode', t: '分镜模式', type: 'seg', opts: [['create', '创作模式'], ['tweet', '推文模式']] },
      { k: 'shotDur', t: '单镜时长(秒)', type: 'number', min: 2, max: 15 },
      { k: 'batchVideoModel', t: '视频模型', type: 'select', opts: () => (window.MODELS ? MODELS.video : []) },
      { k: 'quality', t: '画质', type: 'select', opts: ['480p', '720p', '1080p'] },
      { k: 'ratio', t: '比例', type: 'select', opts: ['16:9', '9:16', '1:1'] },
      { k: 'autoOptimize', t: '自动优化提示词', type: 'bool' },
      { k: 'smartReview', t: '智能审片(生成后自动评审)', type: 'bool' },
    ],
    batchvideo: [ // 批量生成类
      { k: 'batchVideoModel', t: '视频模型', type: 'select', opts: () => (window.MODELS ? MODELS.video : []) },
      { k: 'quality', t: '画质', type: 'select', opts: ['480p', '720p', '1080p'] },
      { k: 'ratio', t: '比例', type: 'select', opts: ['16:9', '9:16', '1:1'] },
      { k: 'batchStrategy', t: '生成策略', type: 'select', opts: () => (window.STRATEGIES ? STRATEGIES.map(s => [s.id, s.name]) : [['ref', '分镜参考'], ['fusion', '多图融合'], ['frames', '首尾帧']]) },
      { k: 'batchCamera', t: '运镜', type: 'select', opts: () => (window.SB && SB.CAMERAS ? SB.CAMERAS : (window.CAMERAS || [])) },
    ],
  };

  /* 参数钳制:以 ep.sbConfig 当前值为底,LLM 给出的值做类型/范围校验,未知键丢弃 */
  function clampPrearrParams(action, raw, ep) {
    const base = (ep && ep.sbConfig) || {};
    const out = {};
    (PREARR_FIELDS[action] || []).forEach(f => {
      const has = raw && raw[f.k] !== undefined;
      let v = has ? raw[f.k] : base[f.k];
      if (f.type === 'number') {
        v = Math.round(+v);
        if (!isFinite(v) || v <= 0) v = f.k === 'shotDur' ? 5 : 8;
        v = Math.max(f.min, Math.min(f.max, v));
      } else if (f.type === 'bool') {
        v = has ? (v === true || v === 'true' || v === 1) : !!base[f.k];
      } else { // select/seg:值必须落在可选清单内,否则回退当前配置,再退首项
        const opts = (typeof f.opts === 'function' ? f.opts() : f.opts).map(o => Array.isArray(o) ? o[0] : o);
        v = String(v == null ? '' : v);
        if (!opts.includes(v)) v = opts.includes(String(base[f.k])) ? String(base[f.k]) : String(opts[0] || '');
      }
      out[f.k] = v;
    });
    return out;
  }

  /* 方案摘要(用于记忆/消息尾注),如「12镜/推文模式/1080p/16:9」 */
  function prearrDigest(plan) {
    const pr = plan.params || {};
    const bits = [];
    if (plan.action === 'sb') {
      if (pr.shotCount) bits.push(pr.shotCount + '镜');
      bits.push(pr.sbMode === 'tweet' ? '推文模式' : '创作模式');
      if (pr.shotDur) bits.push(pr.shotDur + 's/镜');
    }
    if (pr.batchVideoModel) bits.push(pr.batchVideoModel);
    if (pr.quality) bits.push(pr.quality);
    if (pr.ratio) bits.push(pr.ratio);
    if (plan.action === 'batchvideo') {
      if (pr.batchStrategy) { const st = window.STRATEGIES && STRATEGIES.find(s => s.id === pr.batchStrategy); bits.push(st ? st.name : pr.batchStrategy); }
      if (pr.batchCamera) bits.push(pr.batchCamera);
    }
    return bits.join('/');
  }

  /* 预排方案卡片:可编辑参数表单(沿用 input/select/model-row/check-line 现有 CSS 类) */
  function prearrCardHTML(plan, msgIdx, pre) {
    const fields = PREARR_FIELDS[plan.action] || [];
    const fieldHTML = f => {
      const cur = plan.params[f.k];
      if (f.type === 'number') return `<label class="field"><span>${f.t}</span><input class="input" type="number" data-pf="${f.k}" min="${f.min}" max="${f.max}" value="${cur}"></label>`;
      if (f.type === 'bool') return `<div class="check-line" data-pbool="${f.k}"><span class="switch ${cur ? 'on' : ''}"></span><div class="small">${f.t}</div></div>`;
      if (f.type === 'seg') return `<label class="field"><span>${f.t}</span><div class="model-row">${f.opts.map(([v, t]) => `<div class="model-opt ${cur === v ? 'sel' : ''}" data-pseg="${v}" data-pfield="${f.k}">${t}</div>`).join('')}</div></label>`;
      const list = typeof f.opts === 'function' ? f.opts() : f.opts;
      return `<label class="field"><span>${f.t}</span><select class="select" data-pf="${f.k}">${list.map(o => { const [v, t] = Array.isArray(o) ? o : [o, o]; return `<option value="${U.esc(v)}" ${String(cur) === String(v) ? 'selected' : ''}>${U.esc(t)}</option>`; }).join('')}</select></label>`;
    };
    return `
    <div class="agent-preview" data-${pre}-pcard="${msgIdx}">
      <b class="small">🎛 ${PREARR_TITLE[plan.action] || '参数预排'}</b>
      <div class="hint" style="margin:4px 0 8px">${U.esc(plan.summary || '')}</div>
      ${fields.map(fieldHTML).join('')}
      <div class="row" style="gap:6px;margin-top:8px">
        <button class="btn sm primary" data-${pre}-prun="${msgIdx}">▶ 按此方案执行</button>
        <button class="btn sm" data-${pre}-pedit="${msgIdx}">✏ 再改改</button>
        <button class="btn sm" data-${pre}-pcancel="${msgIdx}">取消</button>
      </div>
    </div>`;
  }

  /* 卡片控件 → plan.params 双向同步(执行时直接读 plan.params) */
  function bindPrearrCard(card, plan) {
    const fields = PREARR_FIELDS[plan.action] || [];
    card.querySelectorAll('[data-pf]').forEach(el => el.onchange = () => {
      const f = fields.find(x => x.k === el.dataset.pf);
      plan.params[el.dataset.pf] = f && f.type === 'number'
        ? Math.max(f.min, Math.min(f.max, Math.round(+el.value) || f.min))
        : el.value;
    });
    card.querySelectorAll('[data-pbool]').forEach(el => el.onclick = () => {
      const k = el.dataset.pbool;
      plan.params[k] = !plan.params[k];
      el.querySelector('.switch').classList.toggle('on', !!plan.params[k]);
    });
    card.querySelectorAll('[data-pseg]').forEach(o => o.onclick = () => {
      plan.params[o.dataset.pfield] = o.dataset.pseg;
      card.querySelectorAll(`[data-pfield="${o.dataset.pfield}"]`).forEach(x => x.classList.toggle('sel', x === o));
    });
  }

  /* 按此方案执行:参数写入 ep.sbConfig → Store.save() → 经统一命令层调起真实功能(扣费/确认闸由命令与原入口承担) */
  function execPrearr(ctx, plan, main) {
    const { p, ep } = ctx;
    if (!p || !ep) { U.toast('请先进入分集工作区再执行预排方案', 'error'); return false; }
    ep.sbConfig = ep.sbConfig || {};
    Object.assign(ep.sbConfig, plan.params);
    if (plan.action === 'batchvideo') {
      // 与「参数配置」面板一致:批量参数落到现有镜头(生成时优先读镜头自身字段)
      ep.shots.forEach(s => {
        s.videoModel = ep.sbConfig.batchVideoModel; s.camera = ep.sbConfig.batchCamera; s.genStrategy = ep.sbConfig.batchStrategy;
      });
    }
    Store.save();
    U.toast('参数已预排,正在发起…', 'info', 2000);
    const m = main || document.getElementById('main');
    if (plan.action === 'sb') {
      // 统一命令层:智能分镜(与「智能分镜」按钮同一引擎 runSmartSB,结构化回执;预排卡片已含参数确认,执行不再弹决策窗)
      if (!window.Commands) { U.toast('命令层未加载,请稍后重试', 'error'); return false; }
      Commands.execute('episode.generateStoryboard', { pid: p.id, epid: ep.id, main: m }).then(r => Commands.digest(r));
    } else {
      const pend = ep.shots.filter(s => !s.final && (!s.video || s.video.status !== 'done'));
      if (!pend.length) { U.toast('所有分镜视频均已生成', 'info'); return false; }
      // 统一命令层(ui 模式):真人预审 guardAsync/镜头确认闸/合规承诺由命令层承担(用户已点「按此方案执行」,属交互语境)
      Commands.execute('episode.generateVideos', { pid: p.id, epid: ep.id, main: m, ui: true }).then(r => Commands.digest(r));
    }
    return true;
  }

  /* 绑定卡片三按钮;h: {getChat, exec, edit, done, scope} */
  function bindPrearr(root, pre, h) {
    const dk = k => pre + k.charAt(0).toUpperCase() + k.slice(1);
    root.querySelectorAll(`[data-${pre}-pcard]`).forEach(card => {
      const m2 = h.getChat(+card.dataset[dk('pcard')]);
      if (m2 && m2.prearr) bindPrearrCard(card, m2.prearr);
    });
    root.querySelectorAll(`[data-${pre}-prun]`).forEach(b => b.onclick = () => {
      const m2 = h.getChat(+b.dataset[dk('prun')]);
      if (!m2 || !m2.prearr) return;
      const plan = m2.prearr;
      if (!h.exec(plan)) return; // 入口缺失/无可生成镜头:保留卡片待用户调整
      m2.prearr = null;
      m2.text += `\n(🎛 预排方案已确认:${plan.summary || PREARR_TITLE[plan.action]})`;
      AC.memRemember(`用户确认预排方案:${prearrDigest(plan)}${plan.summary ? ' — ' + plan.summary.slice(0, 50) : ''}`, h.scope);
      h.done();
    });
    root.querySelectorAll(`[data-${pre}-pedit]`).forEach(b => b.onclick = () => h.edit());
    root.querySelectorAll(`[data-${pre}-pcancel]`).forEach(b => b.onclick = () => {
      const m2 = h.getChat(+b.dataset[dk('pcancel')]);
      if (m2) { m2.prearr = null; m2.text += '(已取消预排)'; h.done(); }
    });
  }

  /* ---- 关键环节推荐选项卡(创作方向/风格/方案等关键决策点,Agent 给 2-4 个推荐选项,用户单选提交后继续) ----
   * LLM 协议:返回 JSON 可选键 "choices":{"title":"选择主题(如:复仇方向选择)","options":[{"t":"方向一:标题","d":"一句话描述"}](2-4个)} */
  function parseChoices(out) {
    const ch = out && out.choices;
    if (!ch || !Array.isArray(ch.options)) return null;
    const opts = ch.options.filter(o => o && o.t).slice(0, 4).map(o => ({ t: String(o.t).slice(0, 40), d: String(o.d || '').slice(0, 80) }));
    return opts.length >= 2 ? { title: String(ch.title || '请选择一个方向').slice(0, 30), options: opts } : null;
  }
  /* 选项卡渲染:标题(可折叠箭头)+ 单选选项卡 + 底部「提交」;已提交(choiceDone)后置灰展示结果,不可再改 */
  function choiceCardHTML(m2, msgIdx, pre) {
    const ch = m2.choices;
    if (m2.choiceDone) return `
    <div class="agent-choice done">
      <div class="agent-choice-head"><b>✓ ${U.esc(ch.title)}</b><span class="agent-choice-done-tag">已选择:${U.esc(m2.choiceDone)}</span></div>
    </div>`;
    return `
    <div class="agent-choice" data-${pre}-choice="${msgIdx}">
      <div class="agent-choice-head" data-${pre}-chfold title="点击折叠/展开"><span class="agent-choice-arrow">▾</span><b>${U.esc(ch.title)}</b><span class="agent-choice-hint">单选</span></div>
      <div class="agent-choice-opts">
        ${ch.options.map((o, oi) => `
        <div class="agent-choice-opt" data-${pre}-chopt="${oi}">
          <div class="agent-choice-t">${U.esc(o.t)}</div>
          ${o.d ? `<div class="agent-choice-d">${U.esc(o.d)}</div>` : ''}
          <span class="agent-choice-ck">✓</span>
        </div>`).join('')}
      </div>
      <button class="agent-choice-submit" data-${pre}-chsub="${msgIdx}" disabled>提交</button>
    </div>`;
  }
  /* 选项卡绑定(集级 a / 全局 g 前缀复用,同 bindPrearr 模式):单选 → 提交 → 置灰存 choiceDone + 以「我选择:xxx」自动发送 */
  function bindChoices(root, pre, h) { // h:{getChat, submit(m2, opt)}
    const dk = k => pre + k.charAt(0).toUpperCase() + k.slice(1);
    root.querySelectorAll(`[data-${pre}-choice]`).forEach(card => {
      const msgIdx = +card.dataset[dk('choice')];
      card.dataset.chSel = '';
      card.querySelectorAll(`[data-${pre}-chopt]`).forEach(opt => opt.onclick = () => {
        card.dataset.chSel = opt.dataset[dk('chopt')];
        card.querySelectorAll(`[data-${pre}-chopt]`).forEach(x => x.classList.toggle('sel', x === opt));
        const sub = card.querySelector(`[data-${pre}-chsub]`);
        if (sub) sub.disabled = false;
      });
      const fold = card.querySelector(`[data-${pre}-chfold]`);
      if (fold) fold.onclick = () => card.classList.toggle('fold');
      const sub = card.querySelector(`[data-${pre}-chsub]`);
      if (sub) sub.onclick = () => {
        const m2 = h.getChat(msgIdx);
        if (!m2 || !m2.choices || m2.choiceDone) return;
        const o = m2.choices.options[+card.dataset.chSel];
        if (!o) return;
        sub.disabled = true;
        h.submit(m2, o);
      };
    });
  }

  /* ---- 工作台状态摘要(Agent 感知层):让助手看得见 生成/确认/审片/合成/在飞任务 实时状态,不只看得见创作字段 ---- */
  function stateDigest(p, ep) {
    const d = { total: 0, uncfm: 0, generating: 0, failed: 0, done: 0, stale: 0, noVideo: 0, reviewAvg: null, reviewStale: false, lowShots: [], composed: false, running: 0 };
    if (!ep) return d;
    (ep.shots || []).forEach(s => {
      d.total++;
      if (!s.confirm) d.uncfm++;
      const st = s.video && s.video.status;
      if (st === 'done') { d.done++; if (p && Store.shotVideoStale && Store.shotVideoStale(p, s)) d.stale++; }
      else if (st === 'generating') d.generating++;
      else if (st === 'failed') d.failed++;
      else d.noVideo++;
    });
    const lr = ep.lastReview;
    if (lr) {
      d.reviewAvg = lr.avg;
      d.reviewStale = !!(window.Review && Review.episodeReviewStale && Review.episodeReviewStale(ep));
      d.lowShots = (lr.perShot || []).filter(x => x.score < 7).map(x => {
        const i = (ep.shots || []).findIndex(s => s.id === x.shotId);
        // 二十轮:低分镜带审片问题原文(按 reportId 精确取回报告;被挤出最近 5 条时为空数组降级)
        const rep = i >= 0 ? ((ep.shots[i].reviews || []).find(r => r.id === x.reportId)) : null;
        return { n: i >= 0 ? i + 1 : (x.order || 0) + 1, score: x.score,
          issues: rep ? (rep.issues || []).slice(0, 2).map(it => String(it.analysis || it.type || '').slice(0, 40)) : [] };
      }).slice(0, 5);
    }
    d.composed = !!(Store.epComposedReady && Store.epComposedReady(ep));
    d.running = (window.Tasks && Tasks.runningInScope ? Tasks.runningInScope({ episodeId: ep.id }) : []).length;
    return d;
  }
  /* 状态摘要 → LLM 注入文本(只列非零项,简短;ep=null 时给项目级各集一行进度,≤8 集) */
  function stateBlock(p, ep) {
    if (ep) {
      const d = stateDigest(p, ep);
      const parts = [];
      if (d.total) {
        const seg = [`共${d.total}镜`];
        if (d.done) seg.push(`${d.done}已出片`);
        if (d.generating) seg.push(`${d.generating}生成中`);
        if (d.failed) seg.push(`${d.failed}失败`);
        if (d.noVideo) seg.push(`${d.noVideo}未生成`);
        if (d.uncfm) seg.push(`${d.uncfm}待确认`);
        if (d.stale) seg.push(`${d.stale}已过期(需重生成)`);
        parts.push('分镜:' + seg.join('/'));
      }
      if (d.reviewAvg !== null && d.reviewAvg !== undefined) {
        parts.push(`审片:均分${d.reviewAvg}${d.reviewStale ? '(旧版)' : ''}` + (d.lowShots.length ? `;低分镜:${d.lowShots.map(x => x.n + '镜' + x.score + '分').join('、')}` : ';全部达标'));
      } else if (d.done) parts.push('审片:未审');
      if (d.total && d.done === d.total) parts.push(d.composed ? '成片:已合成' : '成片:全部出片可合成');
      if (d.running) parts.push(`在飞任务:${d.running}个`);
      return parts.length ? `\n★ 工作台实时状态:${parts.join(';')}` : '';
    }
    if (!p) return '';
    const rows = (p.episodes || []).slice(0, 8).map(e => {
      const d = stateDigest(p, e);
      const seg = [];
      if (d.total) seg.push(`${d.done}/${d.total}出片`); else seg.push('未拆镜');
      if (d.failed) seg.push(`${d.failed}失败`);
      if (d.stale) seg.push(`${d.stale}过期`);
      if (d.reviewAvg !== null && d.reviewAvg !== undefined) seg.push(`审${d.reviewAvg}`);
      if (d.composed) seg.push('已合成');
      return `${e.title}(${seg.join('/')})`;
    });
    return rows.length ? `\n★ 各集实时状态:${rows.join('、')}` : '';
  }

  /* ---- 动态开场(情境建议):按本地实时状态推导情境 chips 与开场白,纯本地推导不耗 LLM ---- */
  /* 情境 chips:[{t,d,run|goto|gotoEp|text}] ≤3 条;run/goto/gotoEp 直执(按钮自带确认计费),text 作为指令发给助手(LLM 轮) */
  function dynamicChips(p, ep) {
    const out = [];
    if (ep) {
      const d = stateDigest(p, ep);
      if (!d.total) {
        if ((ep.content || '').trim()) out.push({ t: '拆解本集分镜', d: '智能分镜(含本集理解)', run: '智能分镜' });
        return out;
      }
      if (d.uncfm) out.push({ t: `确认 ${d.uncfm} 镜提示词`, d: '生成前先过一遍确认闸', goto: '分镜视频' });
      if (d.failed) out.push({ t: `处理 ${d.failed} 个失败镜`, d: '失败已退费,可改提示词重试', goto: '分镜视频' });
      if (d.stale) out.push({ t: `${d.stale} 镜已过期`, d: '输入已变更,需重新生成', goto: '分镜视频' });
      if (d.lowShots.length) out.push({ t: `修订 ${d.lowShots.length} 个低分镜`, d: '按审片问题清单优化提示词(发助手)', text: `镜头${d.lowShots.map(x => x.n).join('、')} 审片低于 7 分。具体问题:${d.lowShots.map(x => `镜头${x.n}(${x.score}分):${x.issues.join(';') || '详见审片报告'}`).join(' / ')}。请按这些问题优化这些镜头的提示词,保持风格一致性` });
      if (d.noVideo && d.done && !d.generating && !d.failed && d.noVideo + d.done === d.total) out.push({ t: `生成剩余 ${d.noVideo} 镜`, d: '批量生成,按规则扣费', run: '生成视频' });
      if (d.done === d.total && !d.stale) {
        if (d.reviewAvg === null || d.reviewAvg === undefined || d.reviewStale) out.push({ t: '整集审片', d: '四维评审把关', run: '整集审片' });
        else if (!d.composed) out.push({ t: '合成成片', d: '合成本集成片', run: '合成成片' });
      }
      return out.slice(0, 3);
    }
    if (!p) return out;
    const noImg = (p.subjects || []).filter(s => !s.image).length;
    if (noImg) out.push({ t: `补齐 ${noImg} 个主体形象`, d: '缺权威参考图,生成会触发防废片警示', goto: '主体' });
    const eps = p.episodes || [];
    const unShot = eps.find(e => !(e.shots || []).length && (e.content || '').trim());
    if (unShot) out.push({ t: `拆解「${unShot.title}」`, d: '已有剧本未拆镜', gotoEp: unShot.id });
    const failedEp = eps.find(e => stateDigest(p, e).failed);
    if (failedEp) out.push({ t: `「${failedEp.title}」有失败镜`, d: '失败已退费,可重试', gotoEp: failedEp.id });
    const readyEp = eps.find(e => { const d = stateDigest(p, e); return d.total && d.done === d.total && !d.stale && !d.composed; });
    if (readyEp) out.push({ t: `合成「${readyEp.title}」`, d: '全部出片,可合成', gotoEp: readyEp.id });
    return out.slice(0, 3);
  }
  /* 开场白(空对话占位,每次渲染重算):一句话告诉你这集/这个项目现在最该做什么 */
  function openingLine(p, ep) {
    if (ep) {
      const d = stateDigest(p, ep);
      if (!d.total) return `「${ep.title}」还没拆镜——可以智能分镜(含本集理解),或拉片建集。`;
      const seg = [`${d.total} 镜`];
      if (d.done) seg.push(`${d.done} 已出片`);
      if (d.generating) seg.push(`${d.generating} 生成中`);
      if (d.failed) seg.push(`${d.failed} 失败`);
      if (d.uncfm) seg.push(`${d.uncfm} 待确认`);
      if (d.stale) seg.push(`${d.stale} 已过期`);
      let tail = '';
      if (d.uncfm) tail = '建议先逐镜确认提示词。';
      else if (d.failed) tail = '失败镜已退费,可改提示词重试。';
      else if (d.stale) tail = '过期镜需重新生成。';
      else if (d.lowShots.length) tail = `镜头${d.lowShots.map(x => x.n).join('、')} 审片偏低,可让我按问题清单优化。`;
      else if (d.noVideo) tail = '可以批量生成剩余镜头。';
      else if (d.reviewAvg === null || d.reviewAvg === undefined || d.reviewStale) tail = '全部出片,建议先整集审片把关。';
      else if (!d.composed) tail = `审片均分 ${d.reviewAvg},可以合成成片了。`;
      else tail = '成片已合成,可去剪辑台导出交付。';
      return `「${ep.title}」${seg.join(' · ')}。${tail}`;
    }
    if (p) {
      const eps = p.episodes || [];
      if (!eps.length) return `「${p.name}」还没有分集——上传剧本自动分集,或拉片建集。`;
      const comps = eps.filter(e => Store.epComposedReady && Store.epComposedReady(e)).length;
      return `「${p.name}」共 ${eps.length} 集,${comps} 集已出成片。${comps < eps.length ? '点下方情境建议继续推进,或直接跟我说要做什么。' : '全部出片,可去成片库导出交付。'}`;
    }
    return '';
  }

  /* ---- 事件续谈卡(管线事件 → 对话流可操作卡片):批量出片/整集审片/合成/拉片完成时推入,选项直执真实工作流(run/goto 注册表,免 LLM 轮次) ---- */
  function pushEvent(p, ep, ev) { // ev:{key,text,options:[{t,d,run|goto}]}
    if (!ep || !ev || !ev.text) return false;
    ep.agentChat = ep.agentChat || [];
    if (ep.agentChat.slice(-8).some(x => x.event && x.event.key === ev.key && !x.eventDone)) return false; // 同事件未处理不重复推
    ep.agentChat.push({ role: 'assistant', text: ev.text, event: { key: ev.key, options: (ev.options || []).filter(o => o && o.t && (o.run || o.goto)).slice(0, 4) }, time: Store.now() });
    ep.agentChat = ep.agentChat.slice(-50);
    Store.save();
    // 面板开着→即时重渲;都关着→轻提示(消息留存对话流待看)
    const gOpen = window.AgentG && AgentG.isOpen && AgentG.isOpen();
    if (gOpen && AgentG.refreshGlobal) AgentG.refreshGlobal();
    if (ep.agentOpen && typeof document !== 'undefined') { const main = document.getElementById('main'); if (main && p && window.Views) Views.episode(main, p.id, ep.id); }
    if (!gOpen && !ep.agentOpen) U.toast('🐋 ' + String(ev.text).slice(0, 42), 'info', 2600);
    return true;
  }
  /* 事件卡渲染:选项即按钮(run ▶ / goto →)单击直执;已处理(eventDone)置灰留痕 */
  function eventCardHTML(m2, msgIdx, pre) {
    const ev = m2.event;
    if (!ev || !ev.options || !ev.options.length) return '';
    if (m2.eventDone) return `
    <div class="agent-choice done">
      <div class="agent-choice-head"><b>✓ 已处理</b><span class="agent-choice-done-tag">${U.esc(m2.eventDone)}</span></div>
    </div>`;
    return `
    <div class="agent-choice">
      <div class="agent-choice-opts">
        ${ev.options.map((o, oi) => `
        <div class="agent-choice-opt" data-${pre}-evopt="${msgIdx}_${oi}">
          <div class="agent-choice-t">${o.run ? '▶' : '→'} ${U.esc(o.t)}</div>
          ${o.d ? `<div class="agent-choice-d">${U.esc(o.d)}</div>` : ''}
        </div>`).join('')}
      </div>
    </div>`;
  }
  /* 事件卡绑定(集级 a / 全局 g 前缀复用,同 bindChoices 模式):单击选项 → h.exec 直执(run/goto 由面板提供落法) → 面板置 eventDone 留痕 */
  function bindEvents(root, pre, h) { // h:{getChat, exec(m2, o)}
    const dk = k => pre + k.charAt(0).toUpperCase() + k.slice(1);
    root.querySelectorAll(`[data-${pre}-evopt]`).forEach(el => el.onclick = () => {
      const [mi, oi] = String(el.dataset[dk('evopt')]).split('_').map(Number);
      const m2 = h.getChat(mi);
      if (!m2 || !m2.event || m2.eventDone) return;
      const o = m2.event.options[oi];
      if (o) h.exec(m2, o);
    });
  }

  /* ---- 管线事件总线订阅(第三阶段):管线模块(sb-gen/sb-io/review/produce/proj-upload)只 Bus.emit, ----
   * Agent 侧集中转译为对话流事件卡(pushEvent)/轻提示(notify),文案与选项与原直调完全等价;
   * 订阅者异常由 Bus 隔离,不阻断管线;emit 点不再感知 Agent 是否加载。 */
  function subscribeBus() {
    if (!window.Bus || subscribeBus._done) return;
    subscribeBus._done = true;
    Bus.on('shots.batchStart', ({ p, ep, main, total, group }) => {
      if (window.Agent && Agent.notify) Agent.notify(p, ep, main, group ? `🎬 镜头组「${group}」开始生成 ${total} 镜视频。` : `🎬 开始批量生成 ${total} 镜视频(每镜数分钟,右侧进度面板可最小化)。等待期间可以继续调整分镜或跟我说要改什么。`);
    });
    Bus.on('shots.batchDone', ({ p, ep, main, ok, fail, total, group }) => {
      const summary = group
        ? `镜头组「${group}」生成完成:${ok}/${total} 成功${fail ? `,${fail} 项失败(未扣费),可单独或全部重试` : ''}(已注入一致性前缀)`
        : `批量生成完成:${ok}/${total} 成功${fail ? `,${fail} 项失败(未扣费),可单独或全部重试` : ''}`;
      if (!group) { // 整集批量出片:事件续谈卡(下一步引导);镜头组局部生成保持轻提示
        pushEvent(p, ep, {
          key: `batchgen:${ok}/${total}/${fail}`,
          text: `📊 ${summary}。${fail ? '失败的镜已退费,可在失败汇总里单独/全部重试,或让我帮你改提示词后重试。' : '全部出片成功,下一步可以整集审片把关,或直接合成成片。'}`,
          options: fail
            ? [{ t: '去分镜视频处理失败镜', d: '失败镜已退费,可单独重试', goto: '分镜视频' }]
            : [{ t: '整集审片', d: '四维评审 + 低分标注', run: '整集审片' }, { t: '合成成片', d: '把已出片镜头合成本集成片', run: '合成成片' }],
        });
      } else if (window.Agent && Agent.notify) Agent.notify(p, ep, main, `📊 ${summary}。${fail ? '失败的镜已退费,可以让我帮你改提示词后重试。' : '下一步可以合成成片,或先让我整集审片。'}`);
    });
    Bus.on('episode.ripped', ({ p, ep, count }) => {
      pushEvent(p, ep, {
        key: 'rip:' + ep.id,
        text: `🎞 拉片建集完成:${count} 镜已生成分镜表(关键帧已作分镜底图)。拉片产出是时间轴文字记录,建议先跑「本集理解」定导演基调——后续提示词优化与视频生成都会注入它,质量更稳。`,
        options: [
          { t: '跑本集理解(推荐)', d: '导演理解前置(-2 积分),注入后续生成', run: '本集理解' },
          { t: '直接微调分镜表', d: '检查/修改拉片分镜(确认闸待确认)', goto: '分镜视频' },
          { t: '去生成视频', d: '批量生成,按规则扣费', run: '生成视频' },
        ],
      });
    });
    Bus.on('compose.start', ({ p, ep, main, subtitle }) => {
      if (window.Agent && Agent.notify) Agent.notify(p, ep, main, `🎞 开始合成「${ep.title}」成片(规格化+拼接${subtitle ? '+字幕烧录' : ''},数分钟)。可继续操作页面。`);
    });
    Bus.on('compose.done', ({ p, ep, main, count }) => {
      pushEvent(p, ep, {
        key: 'compose:' + count + ':' + (ep.shots || []).length,
        text: `✅ 「${ep.title}」成片合成完成(${count} 镜)!已归档成片库,可预览/导出;调整镜头后需重新合成。`,
        options: [
          ...(ep.lastReview ? [] : [{ t: '整集审片', d: '交付前四维评审把关', run: '整集审片' }]),
          { t: '去剪辑台', d: '预览时间线/导出交付', goto: '剪辑' },
        ],
      });
    });
    Bus.on('compose.failed', ({ p, ep, main, error }) => {
      if (window.Agent && Agent.notify) Agent.notify(p, ep, main, `⚠ 「${ep.title}」合成失败:${error}。可以检查素材后重试。`);
    });
    Bus.on('review.episodeStart', ({ p, ep, main, total }) => {
      if (window.Agent && Agent.notify) Agent.notify(p, ep, main, `🎬 整集审片开始(${total} 镜):进度在右侧面板,期间可正常操作页面。`);
    });
    Bus.on('review.episodeDone', ({ p, ep, main, avg }) => {
      const lows = ((ep.lastReview || {}).perShot || []).filter(x => x.score < 7).map(x => {
        const li = (ep.shots || []).findIndex(s => s.id === x.shotId);
        return (li >= 0 ? li + 1 : (x.order || 0) + 1) + '镜(' + x.score + '分)';
      });
      pushEvent(p, ep, {
        key: 'review:' + ((ep.lastReview || {}).time || avg),
        text: `🎬 整集审片完成:均分 ${avg}${lows.length ? ';低于 7 分:' + lows.slice(0, 6).join('、') : ',全部达标'}。报告已生成${lows.length ? ',需要的话我可以按问题清单逐镜优化提示词' : ''}。`,
        options: [{ t: '合成成片', d: '把已出片镜头合成本集成片', run: '合成成片' }, { t: '去剪辑台', d: '调序/转场/多机位选优', goto: '剪辑' }],
      });
    });
    Bus.on('review.smartStart', ({ p, ep, main, total, maxRetry }) => {
      if (window.Agent && Agent.notify) Agent.notify(p, ep, main, `🧠 智能审片开始(${total} 镜,达标线 7.0):逐镜评审,不达标自动重生成。进度在右侧面板,你可以继续干活。`);
    });
    Bus.on('review.smartDone', ({ p, ep, main, pass, retry, manual, quiet }) => {
      if (quiet) return; // headless(跑批/命令层 quiet 调用)不推对话流,由调用方结构化回执汇报
      const summary = `完成:达标 ${pass} 镜 · 自动重生成 ${retry} 次 · 待人工 ${manual} 镜`;
      if (window.Agent && Agent.notify) Agent.notify(p, ep, main, `🧠 智能审片${summary}${manual ? '。待人工的镜头跟我说,我帮你改提示词重抽。' : '。全部达标,可以合成成片了。'}`);
    });
  }
  if (typeof window !== 'undefined') subscribeBus();

  /* ================= Agent 按需查询(第三阶段):LLM 拉数据,不再只吃截断快照 =================
   * 默认注入的分镜表(前 20 镜)/剧本摘要(前 500 字)是截断的;LLM 需要更多数据时首轮返回
   * {"query":[{type,...}]},本地补齐后自动续问(≤2 轮,共用同 opId 的 q1/q2 步骤槽位,不另扣费)。
   * 查询全部本地即时执行(纯读),白名单类型 + 范围钳制,未加载的模块如实回报。 */
  const QUERY_TYPES = ['shots', 'script', 'subjects', 'review', 'understanding', 'issues', 'plan', 'workflow', 'events', 'tasks'];
  /* 协议文本(注入 system 提示词,集级/全局两个面板共用) */
  function queryProtocol() {
    return `\n★ 按需查询:上下文中的分镜表/剧本摘要是截断快照。若回答需要更多数据,本轮返回 JSON 可选键 "query":[{...}](1-3 条),系统会本地补齐后自动再问你一轮;拿到补齐数据后直接作答,不要再发 query(最多续问 2 轮)。
可用查询:{type:"shots",from:1,to:20}(分镜区间,镜头号闭区间);{type:"script",from:0,chars:1500}(本集正文展开);{type:"subjects"}(主体清单与参考图状态);{type:"review"}(整集审片报告);{type:"understanding"}(本集理解);{type:"issues"}(项目待处理问题清单);{type:"plan"}(当前制作计划与进度);{type:"workflow"}(项目主线状态);{type:"events"}(最近管线事件);{type:"tasks"}(在飞/最近任务)。`;
  }
  /* 执行查询 → 注入续问的文本块(白名单外的类型忽略;逐条异常隔离) */
  function answerQueries(p, ep, scope, qs) {
    const blocks = [];
    (Array.isArray(qs) ? qs : []).slice(0, 3).forEach(q => {
      const t = q && QUERY_TYPES.includes(q.type) ? q.type : null;
      if (!t) return;
      let txt = '(无数据)';
      try {
        if (t === 'shots' && ep) {
          const n = (ep.shots || []).length;
          if (!n) txt = '(本集暂无分镜)';
          else {
            const from = Math.max(1, Math.round(+q.from) || 1);
            const to = Math.min(n, Math.round(+q.to) || Math.min(n, from + 19));
            txt = compactShots({ shots: ep.shots.slice(from - 1, to) }, to - from + 1, from - 1) + `\n(共 ${n} 镜,本次返回第 ${from}-${to} 镜)`;
          }
        } else if (t === 'script' && ep) {
          const c = ep.content || '';
          const from = Math.max(0, Math.round(+q.from) || 0);
          const chars = Math.max(200, Math.min(4000, Math.round(+q.chars) || 1500));
          txt = c.slice(from, from + chars) + (c.length > from + chars ? `\n(共 ${c.length} 字,其后 ${c.length - from - chars} 字可继续查询)` : '');
        } else if (t === 'subjects' && p) {
          txt = (p.subjects || []).map(s => `· ${s.name}(${ { character: '角色', scene: '场景', prop: '道具' }[s.kind] || s.kind }) ${s.image ? '参考图✓' : '缺图⚠'}${(s.forms || []).length ? `,${s.forms.length} 形态` : ''}:${String(s.prompt || '').slice(0, 60)}`).join('\n') || '(暂无主体)';
        } else if (t === 'review' && ep) {
          const lr = ep.lastReview;
          // 二十轮:逐镜带审片问题原文(分析+建议),低分修订不再凭分数瞎改提示词;共性/剪辑建议放长
          const perRows = lr ? (lr.perShot || []).map(x => {
            const s = (ep.shots || []).find(y => y.id === x.shotId);
            const rep = s && (s.reviews || []).find(r => r.id === x.reportId);
            const iss = rep && (rep.issues || []).length
              ? ':' + rep.issues.slice(0, 3).map(it => `[${it.severity || ''}${it.type ? '·' + it.type : ''}]${String(it.analysis || '').slice(0, 60)}→${String(it.suggestion || '').slice(0, 60)}`).join(';')
              : '';
            return (x.order + 1) + '镜' + x.score + '分' + iss;
          }).join('、') : '';
          txt = !lr ? '(本集未审片)' : `均分 ${lr.avg}${window.Review && Review.episodeReviewStale && Review.episodeReviewStale(ep) ? '(旧版:剧本/图谱已变化)' : ''};逐镜:${perRows};共性问题:${String(lr.common || '无').slice(0, 300)};剪辑建议:${String(lr.cut || '无').slice(0, 200)}`;
        } else if (t === 'understanding' && ep) {
          const u = ep.understanding;
          txt = !u ? '(本集未生成本集理解)' : JSON.stringify(u).slice(0, 1500) + (window.Domain && Domain.understandingStale && Domain.understandingStale(ep) ? '(旧版:剧本已变化)' : '');
        } else if (t === 'issues' && p) {
          txt = window.Issues && Issues.collect ? Issues.collect(p).map(i => `· [${i.sev}] ${i.label} — ${i.detail}`).join('\n') || '(项目无待处理问题)' : '(问题中心未加载)';
        } else if (t === 'plan' && p) {
          const pl = window.Plans && Plans.of ? Plans.of(p) : null;
          txt = !pl ? '(当前无制作计划)' : `「${pl.title}」(${pl.steps.filter(s => s.status === 'done').length}/${pl.steps.length} 完成):${pl.steps.map(s => (s.status === 'done' ? '✓' : s.status === 'failed' ? '✕' : s.status === 'blocked' ? '⚠' : '○') + s.label).join(' → ')}`;
        } else if (t === 'workflow' && p) {
          txt = window.Domain ? Domain.workflow(p, !!(window.Media && Media.isReady && Media.isReady())).steps.map(s => `${s.done ? '✓' : s.side ? '·' : '▶'}${s.name}${(s.blockers || []).length ? '(' + s.blockers.map(b => b.label).join(';') + ')' : ''}`).join('\n') : '(Domain 未加载)';
        } else if (t === 'events') {
          txt = window.Bus && Bus.recent ? Bus.recent(12, p && p.id).map(h => `· ${h.time} ${h.name}${h.brief ? ' ' + h.brief : ''}`).join('\n') || '(最近无管线事件)' : '(事件总线未加载)';
        } else if (t === 'tasks' && ep) {
          const run = (window.Tasks && Tasks.runningInScope ? Tasks.runningInScope({ episodeId: ep.id }) : []).map(t2 => `${t2.type}·${t2.target}`);
          const rec = ((window.Store && Store.state && Store.state.tasks) || []).slice(0, 10).map(t2 => `${t2.status === 'running' ? '⏳' : t2.status === 'failed' ? '✕' : t2.status === 'done' ? '✓' : '◌'}${t2.type}·${t2.target}`);
          txt = (run.length ? `在飞:${run.join('、')}\n` : '在飞:无\n') + '最近:' + (rec.join('、') || '无');
        }
      } catch (e) { txt = '(查询失败:' + ((e && e.message) || e) + ')'; }
      blocks.push(`\n[查询结果·${t}]\n${txt}`);
    });
    return blocks.join('');
  }

  /* 预排模式 LLM 协议:返回 {"plan":{"action":"sb"|"batchvideo","summary":"一句话方案","params":{...}}} + {"reply":"给用户的解释"} */
  function prearrPrompt(p, ep, sysExtra) {
    const c = (ep && ep.sbConfig) || {};
    const vmodels = window.MODELS ? MODELS.video.join('/') : '';
    const cams = (window.SB && SB.CAMERAS ? SB.CAMERAS : (window.CAMERAS || [])).join('/');
    const strats = window.STRATEGIES ? STRATEGIES.map(s => s.id + '=' + s.name).join(',') : 'ref=分镜参考,fusion=多图融合,frames=首尾帧';
    return `你是「虎鲸导演助手」,短剧创作智能体,当前处于「🎛 预排模式」。${sysExtra || ''}
用户输入创作意图,你【不直接执行任何修改、不返回 ops】,而是输出一个「参数预排方案」,由用户确认后才执行。
返回 JSON {"reply":"给用户的解释(说明方案思路)","thinking":"一句话思考摘要","plan":{"action":"sb|batchvideo","summary":"一句话方案说明","params":{...}}}。
action 二选一:
- "sb":智能分镜/拆镜/生成分镜类意图。params 可用键(对齐分镜配置,数值必须钳在范围内):
  shotCount 整数2-40;sbPlans 整数1-3(分镜方案数,>1 时多方案对比择优);sbMode "create"(创作模式)或"tweet"(推文模式);shotDur 数字2-15(秒/镜);batchVideoModel 视频模型;quality "480p"|"720p"|"1080p";ratio "16:9"|"9:16"|"1:1";autoOptimize true/false(自动优化提示词);smartReview true/false(智能审片)
- "batchvideo":批量生成视频类意图。params 可用键:
  batchVideoModel;quality "480p"|"720p"|"1080p";ratio "16:9"|"9:16"|"1:1";batchStrategy(${strats});batchCamera 运镜(${cams})
可用视频模型:${vmodels}。
只输出用户明确提到或可合理推断的键,其余省略(执行时以当前配置为底)。当前配置:${JSON.stringify({ shotCount: c.shotCount, sbMode: c.sbMode, shotDur: c.shotDur, batchVideoModel: c.batchVideoModel, quality: c.quality, ratio: c.ratio, autoOptimize: c.autoOptimize, smartReview: c.smartReview, batchStrategy: c.batchStrategy, batchCamera: c.batchCamera })}
无法判断属于哪类生成意图时【不要返回 plan】,按普通创作顾问对话回答(只给 reply)。`;
  }

  /* 预排模式发送(集级/板块助手共用):o={p, ep, chat, text, model, sysExtra, renderMsgs}
   * 七轮计费贯通:预排也是一次 LLM 调用(llm.agent=1/条,失败退费),解析重试共用同一 operationId 幂等 */
  async function prearrSend(o) {
    const { p, ep, chat, text, model } = o;
    const tk = Tasks.start({ type: '导演助手·预排', model, target: (ep ? ep.title : p ? p.name : '全局') + '·' + text.slice(0, 12), projectId: p && p.id, episodeId: ep && ep.id });
    const agOpId = 'ag_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    const paid = API.isReady() ? U.charge(1, '预排模式对话') : false;
    if (API.isReady() && !paid) {
      Tasks.fail(tk, '积分不足');
      chat.push({ role: 'assistant', text: '积分不足,预排对话每条 1 积分。', time: Store.now() });
      Store.save(); o.renderMsgs();
      return;
    }
    let out;
    try {
      let info = p ? `项目:${p.name}(${p.style || ''})\n` : '';
      if (ep) info += `分集:${ep.title},剧本 ${(ep.content || '').length} 字,已有分镜 ${ep.shots.length} 镜\n本集剧本摘要:${(ep.content || '').slice(0, 300)}\n`;
      out = await Understanding.chatJSONRobust({
        model,
        system: prearrPrompt(p, ep, o.sysExtra),
        user: info + `\n用户意图:${text}`,
        temperature: 0.4, max_tokens: 3000,
        billingAction: 'llm.agent', operationId: agOpId,
      });
      Tasks.done(tk);
    } catch (e) {
      if (paid) U.refund(1, '预排对话失败退费', agOpId);
      Tasks.fail(tk, e.message);
      chat.push({ role: 'assistant', text: '预排失败(' + e.message + '),未做任何改动。', time: Store.now() });
      Store.save(); o.renderMsgs();
      return;
    }
    const msg = { role: 'assistant', text: String(out.reply || '收到。'), thinking: String(out.thinking || ''), time: Store.now() };
    const plan = out.plan && PREARR_FIELDS[out.plan.action] ? out.plan : null; // action 无法判断时回退普通对话
    if (plan && ep) {
      msg.prearr = { action: plan.action, summary: String(plan.summary || ''), params: clampPrearrParams(plan.action, plan.params, ep) };
    } else if (plan && !ep) {
      msg.text += '\n(预排方案需在分集工作区执行,请先进入一个分集)';
    }
    chat.push(msg);
    Store.save();
    o.renderMsgs();
  }

  /* ---- 上下文压缩:消息 >24 条且 LLM 在线时,把较旧消息(除最近 12 条)静默蒸馏为 ≤150 字「会话纪要」 ----
   * 异步后台执行:不登记任务;压缩中用旧摘要,不阻塞发送;失败静默回退硬截。返回 {summary, recent}
   * 计费贯通:传当前消息的 operationId(与路由/回复共用同 opId,step:'cmp' 辅助步骤槽位)
   * ——蒸馏调用计入该条消息的 1 积分(九轮步骤状态机:辅助步不交付 operation),不再按 llm.chat 另扣 */
  const compacting = {}; // key → 是否压缩中(防并发重复蒸馏)
  function compactChat(arr, summaryObj, key, opId) {
    const list = Array.isArray(arr) ? arr : [];
    const recent = list.slice(-12);
    const summary = String((summaryObj && summaryObj[key]) || '');
    if (list.length > 24 && summaryObj && !compacting[key] && window.API && API.isReady()) {
      compacting[key] = true;
      const lines = list.slice(0, -12).map(m2 => (m2.role === 'user' ? '用户:' : '助手:') + String(m2.text || '').replace(/\s+/g, ' ').slice(0, 120));
      API.chatJSON({
        model: (Store.state.settings || {}).defLLM || API.getConfig().model,
        system: '你是会话纪要整理器。把以下短剧创作协作对话蒸馏为≤150字的「会话纪要」,保留:用户的修改意图与偏好、已确认的决定、未完成事项。只返回 JSON {"summary":"..."}',
        messages: [{ role: 'user', content: (summary ? '此前纪要:' + summary + '\n' : '') + '对话记录:\n' + lines.join('\n') }],
        temperature: 0.2, max_tokens: 400,
        billingAction: opId ? 'llm.agent' : undefined, operationId: opId, step: 'cmp',
      }).then(out => {
        if (out && out.summary) { summaryObj[key] = String(out.summary).slice(0, 300); Store.save(); }
      }).catch(() => { /* 静默回退硬截 */ }).then(() => { compacting[key] = false; });
    }
    return { summary, recent };
  }
  /* 最近消息 → 注入 prompt 的文本行(调用方自行剔除刚发出的本条) */
  function chatLines(recent) {
    return recent.map(m2 => (m2.role === 'user' ? '用户:' : '助手:') + String(m2.text || '').replace(/\s+/g, ' ').slice(0, 100)).join('\n');
  }

  /* ---- 分镜表压缩(长则截断);offset=区间查询起始镜号-1(按需查询按绝对镜号对齐) ---- */
  function compactShots(ep, maxShots, offset) {
    maxShots = maxShots || 20;
    const off = offset || 0;
    const shots = ep.shots.slice(0, maxShots).map((s, i) => ({
      镜头: off + i + 1, 名称: (s.name || '').slice(0, 10), 剧情: (s.plot || '').slice(0, 50),
      运镜: s.camera, 机位: s.cameraSpec ? CAMERA.describe(s.cameraSpec) : '',
      提示词: (s.prompt || '').slice(0, 60), 旁白: (s.narration || '').slice(0, 30), 台词: (s.dialogue || '').slice(0, 30), 时长: (window.SB && SB.estShotDuration ? SB.estShotDuration(s) : (s.duration || 5)),
    }));
    let json = JSON.stringify(shots);
    // 二十轮:按整镜截断——此前对整个 JSON 串硬切 6000 字符,可能把最后一镜切成半截喂给模型
    if (json.length > 6000) {
      const kept = [];
      for (const s of shots) {
        if (JSON.stringify(kept.concat(s)).length > 5900) break;
        kept.push(s);
      }
      json = JSON.stringify(kept) + `\n…(镜头 ${off + kept.length + 1}~${ep.shots.length} 因长度省略,共 ${ep.shots.length} 镜,可按需查询指定区间)`;
    }
    return json;
  }

  /* ---- 当前工作台定位(索引关联):用户在脚本层聚焦的场次/节拍,或分镜表选中镜头 ----
   * 用户在哪个板块操作,导演助手就默认针对哪里思考与修改;storyboard 脚本层通过 window.__focus 上报 */
  function focusOf(p, ep) {
    if (!p || !ep) return null;
    const f = window.__focus;
    const bd = ep.scriptBoard;
    if (f && f.pid === p.id && f.eid === ep.id && bd && bd.scenes) {
      if (f.kind === 'beat' && bd.scenes[f.si] && bd.scenes[f.si].beats[f.bi]) {
        return { kind: 'beat', si: f.si, bi: f.bi, label: `@${ep.title}·场次${f.si + 1}·节拍${f.bi + 1}`, scene: bd.scenes[f.si], beat: bd.scenes[f.si].beats[f.bi] };
      }
      if (f.kind === 'scene' && bd.scenes[f.si]) {
        return { kind: 'scene', si: f.si, label: `@${ep.title}·场次${f.si + 1}`, scene: bd.scenes[f.si] };
      }
    }
    const idx = (ep.shots || []).findIndex(s => s.id === ep.uiSel);
    if (idx >= 0) return { kind: 'shot', idx, label: `@${ep.title}·镜头${idx + 1}`, shot: ep.shots[idx] };
    return null;
  }
  /* 定位 → 注入 LLM 的上下文文本(含该定位的当前内容,助手据此直接改) */
  function focusBlock(p, ep) {
    const fc = focusOf(p, ep);
    if (!fc) return '';
    let txt = `\n★ 用户当前工作台定位:${fc.label} —— 用户说的「这里/这个/当前」默认指它,修改请优先针对它。`;
    if (fc.kind === 'beat') {
      const b = fc.beat;
      txt += `\n该定位当前内容:场次${fc.si + 1}「${(fc.scene.title || '').slice(0, 30)}」 节拍${fc.si + 1}.${fc.bi + 1} 情绪[${b.emotion || '平'}] 剧情:「${(b.plot || '').slice(0, 80)}」 分镜文字:「${(b.shot || '').slice(0, 140)}」`;
    } else if (fc.kind === 'scene') {
      txt += `\n该定位当前内容:场次${fc.si + 1}「${(fc.scene.title || '').slice(0, 30)}」 场次剧情:「${(fc.scene.text || '').slice(0, 140)}」`;
    } else if (fc.kind === 'shot') {
      const s = fc.shot;
      txt += `\n该定位当前内容:镜头${fc.idx + 1} 剧情:「${(s.plot || '').slice(0, 60)}」 提示词:「${(s.prompt || '').slice(0, 90)}」`;
    }
    return txt;
  }

  /* ---- ops 应用器(update/insert/delete/move/batch) ---- */
  /* 内容字段(提示词/剧情/台词/旁白):被改写即回落确认闸 s.confirm=false(与 UI 编辑同口径,
   * sb-views.js:667/670/986),防止镜头已确认后被助手批量改写、headless 批量生成按 confirm 过滤直接放量 */
  const CONTENT_KEYS = ['prompt', 'plot', 'dialogue', 'narration'];
  function applyFields(s, fields, changes, idx, record) {
    Object.entries(fields || {}).forEach(([k, v]) => {
      const key = FIELD_MAP[k] || k;
      if (['view', 'angle', 'shotSize', 'aperture'].includes(key)) {
        s.cameraSpec = s.cameraSpec || { view: '正面', angle: '平视', shotSize: '中景', aperture: 'ƒ/4' };
        const old = s.cameraSpec[key];
        s.cameraSpec[key] = String(v);
        if (old !== s.cameraSpec[key]) changes.push(`镜头${idx + 1}:${k} ${old || '空'}→${String(v).slice(0, 12)}`);
      } else if (key === 'duration') {
        const old = s.duration;
        s.duration = Math.max(1, Math.min(60, +v || old || 5));
        if (old !== s.duration) changes.push(`镜头${idx + 1}:时长 ${old}→${s.duration}s`);
      } else if (key === 'prompt') {
        // 提示词统一走 Store.setShotPrompt 留档;预览试算(record=false,克隆对象)直接赋值,避免多余 save
        const old = s.prompt;
        if (record) Store.setShotPrompt(s, String(v));
        else s.prompt = String(v);
        if (String(old || '') !== s.prompt) { changes.push(`镜头${idx + 1}:${k} ${String(old || '').slice(0, 10) || '空'}→${String(v).slice(0, 10)}`); s.confirm = false; }
      } else {
        const old = s[key];
        s[key] = String(v);
        if (String(old || '') !== s[key]) {
          changes.push(`镜头${idx + 1}:${k} ${String(old || '').slice(0, 10) || '空'}→${String(v).slice(0, 10)}`);
          if (CONTENT_KEYS.includes(key)) s.confirm = false; // 内容修改自动回落为未确认(镜头确认闸)
        }
      }
    });
    if (record && changes._pushHistory !== false && Object.keys(fields || {}).length) {
      s.history = s.history || [];
      s.history.unshift({ type: '导演助手修改', model: '虎鲸导演助手', time: Store.now() });
    }
  }

  function mapShotFields(raw, ep) {
    const ns = window.SB.blankShot(ep.shots.length, ep.sbConfig);
    const f = raw || {};
    ns.name = String(f.名称 || f.name || '');
    ns.plot = String(f.剧情 || f.plot || '(新镜头,请完善剧情)');
    if (f.运镜) ns.camera = String(f.运镜);
    ns.prompt = String(f.提示词 || f.prompt || '');
    ns.narration = String(f.旁白 || '');
    ns.dialogue = String(f.台词 || '');
    ns.duration = Math.max(1, Math.min(60, +f.时长 || 5));
    ns.characters = Array.isArray(f.出场人物) ? f.出场人物.map(String).slice(0, 3) : [];
    ns.scene = String(f.出场场景 || f.场景 || '');
    ns.history = [{ type: '导演助手插入', model: '虎鲸导演助手', time: Store.now() }];
    return ns;
  }

  /**
   * 应用 ops 到 ep.shots,返回 changes 摘要数组
   * record=true 时给被改镜头写历史
   */
  function applyOps(ep, ops, record) {
    const changes = [];
    const dels = [], moves = [], inserts = [];
    (ops || []).forEach(op => {
      const n = (+op.shot) - 1;
      if (op.op === 'update') {
        const s = ep.shots[n];
        if (s) applyFields(s, op.fields, changes, n, record);
      } else if (op.op === 'beatupdate') {
        // 分镜脚本层:改某场次某节拍(情绪/剧情/分镜文字),场次/节拍号从 1 开始
        const sc = ep.scriptBoard && ep.scriptBoard.scenes && ep.scriptBoard.scenes[(+op.scene) - 1];
        const bt = sc && sc.beats[(+op.beat) - 1];
        if (bt) {
          const BF = { 情绪: 'emotion', 剧情: 'plot', 分镜文字: 'shot', 文字分镜: 'shot' };
          Object.entries(op.fields || {}).forEach(([k, v]) => {
            const key = BF[k] || k;
            if (!['emotion', 'plot', 'shot'].includes(key)) return;
            const old = bt[key];
            bt[key] = String(v);
            if (String(old || '') !== bt[key]) changes.push(`场次${op.scene}·节拍${op.beat}:${k} ${String(old || '空').slice(0, 10)}→${String(v).slice(0, 10)}`);
          });
        }
      } else if (op.op === 'sceneupdate') {
        // 分镜脚本层:改某场次标题/场次剧情
        const sc = ep.scriptBoard && ep.scriptBoard.scenes && ep.scriptBoard.scenes[(+op.scene) - 1];
        if (sc) {
          const SF = { 标题: 'title', 剧情: 'text', 内容: 'text' };
          Object.entries(op.fields || {}).forEach(([k, v]) => {
            const key = SF[k] || k;
            if (!['title', 'text'].includes(key)) return;
            const old = sc[key];
            sc[key] = String(v);
            if (String(old || '') !== sc[key]) changes.push(`场次${op.scene}:${k} ${String(old || '空').slice(0, 10)}→${String(v).slice(0, 10)}`);
          });
        }
      } else if (op.op === 'insert') {
        // 推迟结算:立即 splice 会让同批后续 op 的原始镜头号位移
        inserts.push({ after: Math.max(0, Math.min(ep.shots.length, +op.after || 0)), shot: op.shot });
      } else if (op.op === 'delete') {
        /* 十二轮:删除前查在飞任务(本地 + 近 2 分钟服务端任务快照,与 UI 删除同口径)——
         * Agent ops 应用器是同步路径无法 await canDeleteScope,靠 runningInScope 的快照兜底,
         * 刷新后本地已 failed 但服务端仍在生成时不删(孤儿上游成本) */
        const s = ep.shots[n];
        if (s && window.Tasks && Tasks.runningInScope({ shotId: s.id }).length) {
          changes.push(`镜头${n + 1}「${(s.plot || '').slice(0, 12)}」有生成/处理任务进行中,未删除`);
        } else dels.push(n);
      } else if (op.op === 'move') {
        moves.push({ from: n, to: (+op.to) - 1 });
      } else if (op.op === 'batch') {
        const who = op.filter && op.filter.含人物;
        let hit = 0;
        ep.shots.forEach((s, i) => {
          if (!who || (s.characters || []).includes(who)) { applyFields(s, op.fields, changes, i, record); hit++; }
        });
        if (who) changes.push(`批量:所有「${who}」出场的 ${hit} 个镜头已修改`);
      }
    });
    moves.forEach(({ from, to }) => {
      if (ep.shots[from]) {
        const [it] = ep.shots.splice(from, 1);
        const t = Math.max(0, Math.min(ep.shots.length, to));
        ep.shots.splice(t, 0, it);
        changes.push(`镜头${from + 1}移动到位置${t + 1}`);
      }
    });
    dels.sort((a, b) => b - a).forEach(n => {
      if (ep.shots[n]) { changes.push(`删除镜头${n + 1}「${(ep.shots[n].plot || '').slice(0, 12)}」`); ep.shots.splice(n, 1); }
    });
    // 删除结算完再插入:按原始 after 序号(扣除其前已删除镜头造成的左移),从小到大插入保持相对顺序
    inserts.sort((a, b) => a.after - b.after);
    let added = 0;
    inserts.forEach(ins => {
      const delBefore = dels.filter(d => d < ins.after).length;
      const pos = Math.max(0, Math.min(ep.shots.length, ins.after - delBefore + added));
      const ns = mapShotFields(ins.shot, ep);
      ep.shots.splice(pos, 0, ns);
      added++;
      changes.push(`在镜头${ins.after}后插入新镜头:「${(ns.plot || '').slice(0, 14)}」`);
    });
    ep.shots.forEach((s, i) => s.order = i);
    if (ep.uiSel && !ep.shots.some(s => s.id === ep.uiSel)) ep.uiSel = ep.shots[0] ? ep.shots[0].id : null;
    ep.composed = false;
    return changes;
  }

  /* ---- 执行闭环验证(Codex Harness 理念):applyOps 落数后逐项回读校验,结果如实反馈 ----
   * 依赖调用方在 applyOps 前已写好 ep.agentUndo 快照(两条应用路径均如此),以此获得 before 状态;act 类 ops 不在此校验(它们有自己的确认闸) */
  function verifyOps(ep, ops) {
    const fails = [];
    let total = 0;
    if (!ep) return { ok: true, total, fails };
    const list = (ops || []).filter(o => o && o.op);
    const before = ep.agentUndo && Array.isArray(ep.agentUndo.shots) ? ep.agentUndo.shots : null;
    const mixed = list.some(o => o.op === 'delete' || o.op === 'insert'); // 同批有增删时位置校验不可靠,move 退化为跳过精确校验
    const fieldHit = (s, k, v) => {
      if (!s) return false;
      const key = FIELD_MAP[k] || k;
      const cur = ['view', 'angle', 'shotSize', 'aperture'].includes(key) ? (s.cameraSpec || {})[key]
        : key === 'duration' ? s.duration : s[key];
      const want = key === 'duration' ? Math.max(1, Math.min(60, +v || cur || 5)) : String(v);
      return String(cur === undefined || cur === null ? '' : cur) === String(want);
    };
    list.forEach(op => {
      const n = (+op.shot) - 1;
      if (op.op === 'update' || op.op === 'batch') {
        const who = op.op === 'batch' && op.filter && op.filter.含人物;
        const targets = op.op === 'update' ? [[ep.shots[n], n]] : ep.shots.map((s, i) => [s, i]).filter(([s]) => !who || (s.characters || []).includes(who));
        targets.forEach(([s, i]) => Object.entries(op.fields || {}).forEach(([k, v]) => {
          total++;
          if (!fieldHit(s, k, v)) fails.push(`镜头${i + 1}:${k} 未生效`);
        }));
      } else if (op.op === 'beatupdate') {
        const BF = { 情绪: 'emotion', 剧情: 'plot', 分镜文字: 'shot', 文字分镜: 'shot' };
        const sc = ep.scriptBoard && ep.scriptBoard.scenes && ep.scriptBoard.scenes[(+op.scene) - 1];
        const bt = sc && sc.beats[(+op.beat) - 1];
        Object.entries(op.fields || {}).forEach(([k, v]) => {
          const key = BF[k] || k;
          if (!['emotion', 'plot', 'shot'].includes(key)) return;
          total++;
          if (!bt || String(bt[key] || '') !== String(v)) fails.push(`场次${op.scene}·节拍${op.beat}:${k} 未生效`);
        });
      } else if (op.op === 'sceneupdate') {
        const SF = { 标题: 'title', 剧情: 'text', 内容: 'text' };
        const sc = ep.scriptBoard && ep.scriptBoard.scenes && ep.scriptBoard.scenes[(+op.scene) - 1];
        Object.entries(op.fields || {}).forEach(([k, v]) => {
          const key = SF[k] || k;
          if (!['title', 'text'].includes(key)) return;
          total++;
          if (!sc || String(sc[key] || '') !== String(v)) fails.push(`场次${op.scene}:${k} 未生效`);
        });
      } else if (op.op === 'insert') {
        total++;
        const f = op.shot || {};
        const mark = String(f.名称 || f.name || f.剧情 || f.plot || '').slice(0, 10);
        const hit = mark ? ep.shots.some(s => (s.name || '').includes(mark) || (s.plot || '').includes(mark))
          : before ? ep.shots.length > before.length : ep.shots.length > 0;
        if (!hit) fails.push(`在镜头${op.after}后插入未生效`);
      } else if (op.op === 'delete') {
        total++;
        const old = before && before[n];
        if (old) {
          const still = old.id ? ep.shots.some(s => s.id === old.id)
            : ep.shots.some(s => (s.plot || '') === (old.plot || '') && (s.name || '') === (old.name || ''));
          if (still) fails.push(`删除镜头${n + 1} 未生效`);
        }
      } else if (op.op === 'move') {
        total++;
        const old = before && before[n];
        if (old && !mixed) {
          const t = Math.max(0, Math.min(ep.shots.length - 1, (+op.to) - 1));
          const cur = ep.shots[t];
          const same = cur && (old.id ? cur.id === old.id : (cur.plot || '') === (old.plot || '') && (cur.name || '') === (old.name || ''));
          if (!same) fails.push(`镜头${n + 1} 移动未到位`);
        }
      }
    });
    return { ok: !fails.length, total, fails };
  }
  /* 校验结果 → 消息尾注;有未生效项同时 toast 警示 */
  function verifyNote(v) {
    if (!v || !v.total) return '';
    if (v.ok) return `(✓ 已生效 ${v.total} 项)`;
    U.toast(`⚠ ${v.fails.length} 项修改未生效:${v.fails[0]}`, 'error', 3500);
    return `(⚠ ${v.fails.length} 项未生效:${v.fails.slice(0, 3).join(';')})`;
  }

  /* ================= ⚠ 并行编辑冲突(手动修改 vs 助手方案) =================
   * 基线:发送消息时对目标域打指纹(WeakMap 随消息存,会话内有效不落库;刷新后预览卡退化为原直接应用语义)。
   * 应用前 detectConflicts 比对当前指纹,命中 → openConflictPanel 逐项「保留我的/采用助手」;
   * resolveOps 按选择过滤(batch 冲突按镜拆为 update,未冲突目标不受影响)。 */
  const pendingBase = new WeakMap();
  const setPendingBase = (msg, base) => { if (msg && base) pendingBase.set(msg, base); };
  const getPendingBase = msg => (msg && pendingBase.get(msg)) || null;

  function fpShot(s) {
    return JSON.stringify([s.name, s.plot, s.prompt, s.narration, s.dialogue, s.camera, s.duration, s.voice, s.videoModel, s.genStrategy, s.cameraSpec || null]);
  }
  /* 目标域指纹基线:分镜(按 id 内容指纹 + 位置序)/脚本层场次与节拍(按序号)/主体(按 id)/分集(按 id)/项目与剧本元 */
  function fingerprint(ctx) {
    const { p, ep } = ctx || {};
    const fp = { shots: {}, order: [], scenes: {}, beats: {}, subs: {}, eps: {}, proj: '', meta: '' };
    if (ep) {
      (ep.shots || []).forEach((s, i) => { fp.shots[s.id] = fpShot(s); fp.order[i] = s.id; });
      ((ep.scriptBoard && ep.scriptBoard.scenes) || []).forEach((sc, si) => {
        fp.scenes[si] = JSON.stringify([sc.title, sc.text]);
        (sc.beats || []).forEach((b, bi) => { fp.beats[si + '_' + bi] = JSON.stringify([b.emotion, b.plot, b.shot]); });
      });
    }
    if (p) {
      (p.subjects || []).forEach(s => { fp.subs[s.id] = JSON.stringify([s.name, s.prompt, s.description]); });
      (p.episodes || []).forEach(e => { fp.eps[e.id] = JSON.stringify([e.title, e.content, (e.shots || []).length]); });
      fp.proj = JSON.stringify([p.name, p.style, p.tone, p.globalSetting, p.locale]);
      fp.meta = JSON.stringify(p.scriptMeta || null);
    }
    return fp;
  }
  function shotFieldVal(s, k) {
    const key = FIELD_MAP[k] || k;
    if (['view', 'angle', 'shotSize', 'aperture'].includes(key)) return (s.cameraSpec || {})[key] || '';
    return s[key] === undefined || s[key] === null ? '' : String(s[key]);
  }
  /* ops 目标对象当前指纹 vs 基线 → 冲突项数组(无冲突返回 [];batch 按镜逐条,带 batchShot 供拆分) */
  function detectConflicts(ops, base, ctx) {
    const { p, ep } = ctx || {};
    const out = [];
    if (!base || !ops) return out;
    const BF = { 情绪: 'emotion', 剧情: 'plot', 分镜文字: 'shot', 文字分镜: 'shot' };
    const SF = { 标题: 'title', 剧情: 'text', 内容: 'text' };
    const P_FIELDS = { 名称: 'name', 风格: 'style', 影调: 'tone', 全局设定: 'globalSetting', 目标市场: 'locale' };
    const SM_FIELDS = { 卖点: 'logline', 梗概: 'synopsis' };
    const S_FIELDS = { 名称: 'name', 提示词: 'prompt', 描述: 'description' };
    const shotRows = (op, cur) => {
      if (op.op === 'delete') return [{ f: '剧情', cur: (cur.plot || '').slice(0, 60), next: '(删除该镜)' }];
      if (op.op === 'move') return [{ f: '位置', cur: '当前位置', next: '移动到位置' + op.to }];
      return Object.entries(op.fields || {}).map(([k, v]) => ({ f: k, cur: shotFieldVal(cur, k), next: String(v) }));
    };
    (ops || []).forEach((op, oi) => {
      if (!op || !op.op) return;
      const n = (+op.shot) - 1;
      if ((op.op === 'update' || op.op === 'delete' || op.op === 'move') && ep) {
        const cur = ep.shots[n];
        const lb = `镜头${n + 1}${cur && cur.name ? '「' + cur.name + '」' : ''}`;
        if (!cur) { out.push({ key: `o${oi}`, opIdx: oi, label: lb, reason: '该镜头已不存在', rows: [{ f: '操作', cur: '(已删除)', next: op.op }] }); return; }
        if (base.shots[cur.id] === undefined || (base.order || [])[n] !== cur.id) { out.push({ key: `o${oi}`, opIdx: oi, label: lb, reason: '该位置的镜头已变化(调序/新增)', rows: shotRows(op, cur) }); return; }
        if (base.shots[cur.id] !== fpShot(cur)) out.push({ key: `o${oi}`, opIdx: oi, label: lb, reason: '你改过此镜', rows: shotRows(op, cur) });
      } else if (op.op === 'batch' && ep) {
        const who = op.filter && op.filter.含人物;
        ep.shots.forEach((s, i) => {
          if (who && !(s.characters || []).includes(who)) return;
          if (base.shots[s.id] === undefined) {
            out.push({ key: `o${oi}_${s.id}`, opIdx: oi, batchShot: s.id, label: `镜头${i + 1}${s.name ? '「' + s.name + '」' : ''}(批量${who ? '·' + who : ''})`, reason: '此镜为方案生成后新增', rows: shotRows(op, s) });
          } else if (base.shots[s.id] !== fpShot(s)) {
            out.push({ key: `o${oi}_${s.id}`, opIdx: oi, batchShot: s.id, label: `镜头${i + 1}${s.name ? '「' + s.name + '」' : ''}(批量${who ? '·' + who : ''})`, reason: '你改过此镜', rows: shotRows(op, s) });
          }
        });
      } else if (op.op === 'beatupdate' && ep) {
        const si = (+op.scene) - 1, bi = (+op.beat) - 1;
        const bt = ep.scriptBoard && ep.scriptBoard.scenes && ep.scriptBoard.scenes[si] && ep.scriptBoard.scenes[si].beats[bi];
        const curFp = bt ? JSON.stringify([bt.emotion, bt.plot, bt.shot]) : '';
        if (base.beats[si + '_' + bi] !== curFp) {
          out.push({ key: `o${oi}`, opIdx: oi, label: `场次${si + 1}·节拍${bi + 1}`, reason: bt ? '你改过此节拍' : '该节拍已不存在', rows: Object.entries(op.fields || {}).map(([k, v]) => ({ f: k, cur: bt ? String(bt[BF[k] || k] || '') : '(已删除)', next: String(v) })) });
        }
      } else if (op.op === 'sceneupdate' && ep) {
        const si = (+op.scene) - 1;
        const sc = ep.scriptBoard && ep.scriptBoard.scenes && ep.scriptBoard.scenes[si];
        const curFp = sc ? JSON.stringify([sc.title, sc.text]) : '';
        if (base.scenes[si] !== curFp) {
          out.push({ key: `o${oi}`, opIdx: oi, label: `场次${si + 1}${sc && sc.title ? '「' + sc.title + '」' : ''}`, reason: sc ? '你改过此场次' : '该场次已不存在', rows: Object.entries(op.fields || {}).map(([k, v]) => ({ f: k, cur: sc ? String(sc[SF[k] || k] || '') : '(已删除)', next: String(v) })) });
        }
      } else if (op.op === 'project' && p) {
        if (base.proj !== JSON.stringify([p.name, p.style, p.tone, p.globalSetting, p.locale])) {
          out.push({ key: `o${oi}`, opIdx: oi, label: `项目「${p.name}」`, reason: '你改过项目设置', rows: Object.entries(op.fields || {}).map(([k, v]) => ({ f: k, cur: String(p[P_FIELDS[k] || k] || ''), next: String(v) })) });
        }
      } else if (op.op === 'scriptmeta' && p) {
        if (base.meta !== JSON.stringify(p.scriptMeta || null)) {
          out.push({ key: `o${oi}`, opIdx: oi, label: '剧本卖点/梗概', reason: '你改过剧本元信息', rows: Object.entries(op.fields || {}).map(([k, v]) => ({ f: k, cur: String((p.scriptMeta || {})[SM_FIELDS[k] || k] || ''), next: String(v) })) });
        }
      } else if (op.op === 'subject' && p) {
        const s = (p.subjects || []).find(x => x.name === String(op.name || '').trim());
        if (!s) { out.push({ key: `o${oi}`, opIdx: oi, label: `主体「${op.name}」`, reason: '主体已不存在或已改名', rows: [{ f: '操作', cur: '(未找到)', next: '修改主体' }] }); return; }
        if (base.subs[s.id] !== JSON.stringify([s.name, s.prompt, s.description])) {
          out.push({ key: `o${oi}`, opIdx: oi, label: `主体「${s.name}」`, reason: '你改过此主体', rows: Object.entries(op.fields || {}).map(([k, v]) => ({ f: k, cur: String(s[S_FIELDS[k] || k] || ''), next: String(v) })) });
        }
      } else if ((op.op === 'episode' || op.op === 'delep') && p) {
        const e2 = (p.episodes || []).find(x => x.title === String(op.ep || '').trim() || x.title.includes(String(op.ep || '').trim()));
        if (!e2) { out.push({ key: `o${oi}`, opIdx: oi, label: `分集「${op.ep}」`, reason: '分集已不存在', rows: [{ f: '操作', cur: '(未找到)', next: op.op === 'delep' ? '删除分集' : '修改分集' }] }); return; }
        if (base.eps[e2.id] !== JSON.stringify([e2.title, e2.content, (e2.shots || []).length])) {
          out.push({
            key: `o${oi}`, opIdx: oi, label: `分集「${e2.title}」`, reason: '你改过此分集',
            rows: op.op === 'delep' ? [{ f: '分集', cur: `${(e2.content || '').length}字/${(e2.shots || []).length}镜`, next: '(删除该集)' }]
              : Object.entries(op.fields || {}).map(([k, v]) => ({ f: k, cur: k === '正文' ? (e2.content || '').slice(0, 60) : e2.title, next: String(v).slice(0, 60) })),
          });
        }
      }
    });
    return out;
  }
  /* 按选择过滤 ops:保留我的 → 丢弃对应 op(batch 按镜剔除后拆为逐镜 update);采用助手 → 保留 */
  function resolveOps(ops, conflicts, decisions, ctx) {
    const drop = new Set(), batchExcl = {}; // opIdx → Set(shotId)
    (conflicts || []).forEach(c => {
      if (!decisions || decisions[c.key] === 'agent') return;
      if (c.batchShot) (batchExcl[c.opIdx] = batchExcl[c.opIdx] || new Set()).add(c.batchShot);
      else drop.add(c.opIdx);
    });
    const out = [];
    (ops || []).forEach((op, oi) => {
      if (drop.has(oi)) return;
      if (op.op === 'batch' && batchExcl[oi]) {
        const eps = ctx && ctx.ep;
        if (!eps) return;
        const who = op.filter && op.filter.含人物;
        eps.shots.forEach((s, i) => {
          if (who && !(s.characters || []).includes(who)) return;
          if (batchExcl[oi].has(s.id)) return;
          out.push({ op: 'update', shot: i + 1, fields: op.fields });
        });
        return;
      }
      out.push(op);
    });
    return out;
  }
  /* 冲突面板:逐项版本选择(默认保留我的=安全侧);onDone(null)=取消(不扣费,预览卡保留),onDone(decisions)=按选择应用 */
  function openConflictPanel(conflicts, onDone) {
    const decisions = {};
    conflicts.forEach(c => { decisions[c.key] = 'mine'; });
    U.openModal({
      title: `⚠ 并行编辑冲突(${conflicts.length} 处)`,
      wide: true,
      body: `
      <div class="hint" style="margin-bottom:10px">你在助手生成方案期间手动改过以下内容。逐项选择:<b>保留我的</b>(助手该项放弃)或 <b>采用助手</b>(覆盖你的修改);未列出的方案项不受影响,照常应用。</div>
      ${conflicts.map((c, ci) => `
      <div class="card" style="padding:10px 12px;margin-bottom:8px">
        <div class="row" style="gap:6px;margin-bottom:6px;flex-wrap:wrap;align-items:center">
          <b class="small">${U.esc(c.label)}</b><span class="tag yellow" style="font-size:10px">${U.esc(c.reason)}</span>
          <span class="grow"></span>
          <div class="model-row" style="gap:4px">
            <div class="model-opt sel" data-cdec="${ci}" data-v="mine" style="padding:3px 10px">保留我的</div>
            <div class="model-opt" data-cdec="${ci}" data-v="agent" style="padding:3px 10px">采用助手</div>
          </div>
        </div>
        ${c.rows.map(r => `
        <div class="row" style="gap:8px;align-items:flex-start;margin-bottom:3px">
          <span class="tag" style="flex:none;font-size:10px">${U.esc(r.f)}</span>
          <span class="small grow" style="word-break:break-all">${U.esc(String(r.cur === undefined || r.cur === '' ? '空' : r.cur).slice(0, 90))}</span>
          <span style="flex:none">→</span>
          <span class="small grow" style="word-break:break-all;color:var(--accent)">${U.esc(String(r.next === undefined || r.next === '' ? '空' : r.next).slice(0, 90))}</span>
        </div>`).join('')}
      </div>`).join('')}`,
      footer: `<button class="btn" data-x="cancel">取消(暂不应用)</button>
        <button class="btn" data-x="allmine">全部保留我的</button>
        <button class="btn" data-x="allagent">全部采用助手</button>
        <button class="btn primary" data-x="apply">按所选应用</button>`,
      onMount(m, close) {
        m.querySelectorAll('[data-cdec]').forEach(o => o.onclick = () => {
          const ci = o.dataset.cdec;
          decisions[conflicts[+ci].key] = o.dataset.v;
          m.querySelectorAll(`[data-cdec="${ci}"]`).forEach(x => x.classList.toggle('sel', x === o));
        });
        m.querySelector('[data-x=cancel]').onclick = () => { close(); onDone(null); };
        m.querySelector('[data-x=allmine]').onclick = () => { conflicts.forEach(c => { decisions[c.key] = 'mine'; }); close(); onDone(decisions); };
        m.querySelector('[data-x=allagent]').onclick = () => { conflicts.forEach(c => { decisions[c.key] = 'agent'; }); close(); onDone(decisions); };
        m.querySelector('[data-x=apply]').onclick = () => { close(); onDone(decisions); };
      },
    });
  }

  window.AgentOps = { splitOps, opRisk, actDesc, changeLineHTML, runEpisodeActions, runGlobalActions, selfFixRound, prearrSend, prearrCardHTML, bindPrearr, bindChoices, parseChoices, choiceCardHTML, execPrearr, compactChat, chatLines, compactShots, focusOf, focusBlock, applyOps, verifyOps, verifyNote, OP_TOOLS, FIELD_MAP, setPendingBase, getPendingBase, fingerprint, detectConflicts, resolveOps, openConflictPanel, stateDigest, stateBlock, dynamicChips, openingLine, pushEvent, eventCardHTML, bindEvents, queryProtocol, answerQueries, ACT_CMD, actProtocol, cmdProtocol, sanitizeCmdArgs, cmdDigest };
  window.__AGENT_TEST = { applyOps, compactShots, FIELD_MAP, focusOf, focusBlock, OP_TOOLS, verifyOps, compactChat, fingerprint, detectConflicts, resolveOps, stateDigest, stateBlock, dynamicChips, openingLine, pushEvent, eventCardHTML, bindEvents, queryProtocol, answerQueries, subscribeBus };
})();
