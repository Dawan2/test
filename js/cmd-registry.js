/* ============ cmd-registry.js 统一领域命令元数据注册表(双端 UMD,二十二轮) ============
 * 10 条领域命令的共享元数据(name/label/risk/needs/desc/args)单一来源:
 *   浏览器 js/commands.js 的 REG 注册默认值与 Commands.list() 自省、CLI `exec` 用法/help 文案、
 *   mcp.js 工具描述全部由此生成;两端各自只注册 handler(commands.js REG / cli.js EXEC)。
 * meter 为各端执行侧差异(浏览器 produce 由子命令计量,CLI 按整体钱包差值),不进共享元数据。 */
(function (root, factory) {
  const R = factory();
  if (typeof module === 'object' && module.exports) module.exports = R;
  else root.CmdRegistry = R;
})(typeof self !== 'undefined' ? self : globalThis, function () {
  'use strict';
  const PID = { name: 'pid', type: 'string', required: true, desc: '项目 id' };
  const EPID = { name: 'epid', type: 'string', required: true, desc: '分集 id' };
  const UI = { name: 'ui', type: 'boolean', desc: 'UI 语境(保留确认闸/合规承诺/真人预审等决策弹窗);headless 默认' };

  const META = [
    {
      name: 'episode.preflight', label: '生产就绪检查', risk: 'read', needs: ['p', 'ep'],
      desc: 'Domain.episodeState 单源推导:缺剧本/未分镜/分镜过期/失败镜等阻塞项与下一步动作(流程条/CLI workflow 同口径)',
      args: [PID, EPID],
    },
    {
      name: 'episode.generateStoryboard', label: '智能分镜', risk: 'exec', needs: ['p', 'ep'],
      desc: 'LLM 拆镜编排:本集理解(可复用)→拆镜→评审修订(<90 分重拆),多方案自动择优写回分镜表',
      args: [PID, EPID, { name: 'shotCount', type: 'number', desc: '分镜数量 2-40(默认 8)' }, { name: 'sbPlans', type: 'number', desc: '候选方案数 1-3(默认 1)' }, UI],
    },
    {
      name: 'episode.generateVideos', label: '批量生成视频', risk: 'exec', needs: ['p', 'ep'],
      desc: '整集批量出片:headless 未确认镜跳过并如实进 skipped;失败镜已退费可重试',
      args: [PID, EPID, { name: 'shotIds', type: 'array', desc: '只跑指定镜头 id 子集(断点校准/失败镜重试)' }, { name: 'confirmAll', type: 'boolean', desc: '授权全量:自动确认未确认镜后生成' }, { name: 'noImage', type: 'boolean', desc: '跳过缺底图镜头的补图(CLI)' }, UI],
    },
    {
      name: 'shot.generateVideo', label: '单镜生成', risk: 'exec', needs: ['p', 'ep', 's'],
      desc: '单镜生成视频:终稿锁/确认闸前置,合规敏感词与真人预审拦截如实 blocked',
      args: [PID, EPID, { name: 'sid', type: 'string', required: true, desc: '镜头 id 或序号' }, UI],
    },
    {
      name: 'episode.smartReview', label: '智能审片', risk: 'exec', needs: ['p', 'ep'],
      desc: '整集逐镜评审+共性汇总+四维成片评审;不达标先修订提示词重抽,仍有待人工镜则回 needs_human(质量闸门)',
      args: [PID, EPID, { name: 'shotIds', type: 'array', desc: '只复审指定镜头 id 子集(修订重抽后复检,结果合并整集报告)' }, { name: 'quiet', type: 'boolean', desc: '评审过程不弹后台面板(headless 默认)' }, UI],
    },
    {
      name: 'episode.compose', label: '合成成片', risk: 'exec', needs: ['p', 'ep'],
      desc: '拼接成片+写回 SRT 软字幕;无分镜/失败镜前置 blocked,合成超时如实报错',
      args: [PID, EPID, UI],
    },
    {
      name: 'episode.produce', label: '一键成片', risk: 'exec', needs: ['p', 'ep'],
      desc: '编排:就绪检查→批量生成→智能审片(质量闸门)→合成成片;待人工镜默认阻断合成,riskyCompose 放行',
      args: [PID, EPID, { name: 'confirmAll', type: 'boolean', desc: '授权全量生成' }, { name: 'smartReview', type: 'boolean', desc: '审片开关(默认开)' }, { name: 'maxRetry', type: 'number', desc: '审片不达标重试上限 1-5(默认 2)' }, { name: 'riskyCompose', type: 'boolean', desc: '放行待人工/低分镜参与合成' }, UI],
    },
    {
      name: 'episode.understanding', label: '本集理解', risk: 'exec', needs: ['p', 'ep'],
      desc: 'LLM 生成本集导演理解(剧情脉络/情绪曲线/节奏规划/视觉基调/关键场面/悬念),写回 ep.understanding 并按 sourceRev 判旧',
      args: [PID, EPID],
    },
    {
      name: 'subject.generateImage', label: '主体生图', risk: 'exec', needs: ['p'],
      desc: '缺参考图主体批量 AI 生图并回填(subjectIds 可指定子集,含已有图重生);逐主体计费,失败退费;发布门 G9 一键处置同入口',
      args: [PID, { name: 'subjectIds', type: 'array', desc: '只处理指定主体 id 子集(默认全部缺图主体)' }, UI],
    },
    {
      name: 'project.extractSubjects', label: '提取主体', risk: 'exec', needs: ['p'],
      desc: 'LLM 从项目剧本提取角色/场景/道具主体合并入库(同名同类不覆盖,新主体待生图);浏览器离线回退本地启发式',
      args: [PID, { name: 'mode', type: 'string', desc: 'normal|fine(精细模式提示词/八维度人设更详尽)' }, UI],
    },
  ];

  const byName = {};
  META.forEach(m => { byName[m.name] = m; });

  /* args 速览文本:`--pid X --epid Y [--confirm-all] …`(CLI help/用法与 MCP 描述共用) */
  const PH = { pid: 'X', epid: 'Y', sid: 'Z' };
  function usageOf(m) {
    return (m.args || []).map(a => a.required ? `--${a.name} ${PH[a.name] || 'V'}` : `[--${a.name}${a.type === 'boolean' ? '' : ' ' + (PH[a.name] || 'V')}]`).join(' ');
  }

  return { META, byName, names: () => META.map(m => m.name), usageOf };
});
