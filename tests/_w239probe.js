/* 临时 live 探针生成器(W239):把 unit.js 的夹具原样切下来,接一段自己的打印。跑完即删。 */
const fs = require('fs'), path = require('path');
const src = fs.readFileSync(path.join(__dirname, 'unit.js'), 'utf8');
const head = src.slice(0, src.indexOf('const SUITES = {'));
const probe = `
(async () => {
  const pending = { confirm: true, image: 'i.png', video: { status: 'none' } };
  const rows = () => [
    makeShot(0, Object.assign({ id: 'dup', plot: '首行' }, pending)),
    makeShot(1, Object.assign({ id: 'solo', plot: '不重复的那一镜' }, pending)),
    makeShot(2, Object.assign({ id: 'dup', plot: '第二行' }, pending)),
    makeShot(3, Object.assign({ id: 'dup', plot: '第三行' }, pending)),
  ];
  const show = (tag, sb, r) => {
    console.log('=== ' + tag + ' ===');
    console.log('引擎实收:', JSON.stringify(sb.__genShots || sb.__called));
    console.log('回执:', JSON.stringify(r));
    console.log('digest toasts:', JSON.stringify(sb.__toasts || []));
  };

  // 浏览器那一端(js/commands.js),headless 档
  let sb = loadPipelineFix();
  let ctx = cmdCtx(sb, { shots: rows() });
  let r = await sb.Commands.execute('episode.generateVideos', { pid: ctx.p.id, epid: ctx.ep.id, shotIds: ['dup'] });
  sb.Commands.digest(r);
  show('浏览器 headless:点名 ["dup"](表里 dup 三行)', sb, r);

  sb = loadPipelineFix();
  ctx = cmdCtx(sb, { shots: [makeShot(0, pending), makeShot(1, pending), makeShot(2, pending)] });
  r = await sb.Commands.execute('episode.generateVideos', { pid: ctx.p.id, epid: ctx.ep.id, shotIds: ['sh0', 'sh1', 'sh2'] });
  sb.Commands.digest(r);
  show('浏览器 headless 对照:点名三个不同 id', sb, r);

  // ui 档
  sb = loadPipelineFix();
  ctx = cmdCtx(sb, { shots: rows() });
  r = await sb.Commands.execute('episode.generateVideos', { pid: ctx.p.id, epid: ctx.ep.id, ui: true, shotIds: ['dup'] });
  sb.Commands.digest(r);
  show('浏览器 ui:点名 ["dup"]', sb, r);

  // 一键成片编排:真跑一趟(点名重复 id),看 W228 那个 idle 冒泡会不会被这句话误触
  sb = loadPipelineFix();
  ctx = cmdCtx(sb, { shots: rows() });
  r = await sb.Commands.execute('episode.produce', { pid: ctx.p.id, epid: ctx.ep.id, shotIds: ['dup'], smartReview: false, riskyCompose: true });
  console.log('=== 一键成片(点名 ["dup"]) ===');
  console.log('顶层 note:', JSON.stringify(r.result && r.result.note));
  console.log('子步:', JSON.stringify((r.result.steps || []).map(x => ({ step: x.step, ok: x.ok, note: x.result && x.result.note, fresh: x.result && x.result.fresh }))));
  console.log('引擎实收:', JSON.stringify(sb.__genShots), 'toasts:', JSON.stringify(sb.__toasts));
})().catch(e => { console.error('探针出错:', e); process.exit(1); });
`;
fs.writeFileSync(path.join(__dirname, '_w239probe-run.js'), head + probe);
console.log('written');
