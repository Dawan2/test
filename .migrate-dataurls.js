/* 一次性迁移:state 树中的大 dataURL 图片转存 uploads/,替换为短路径,给 localStorage 减负 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = __dirname;
const STATES = path.join(ROOT, 'data', 'states');
const UPLOADS = path.join(ROOT, 'uploads');
const MIN = 30000; // >30KB 的 dataURL 才迁移

let totalFiles = 0, totalSaved = 0;
for (const f of fs.readdirSync(STATES)) {
  if (!f.endsWith('.json') || f.endsWith('.bak')) continue;
  const uid = f.replace('.json', '');
  const file = path.join(STATES, f);
  const doc = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (!doc.state) continue;
  const dir = path.join(UPLOADS, uid);
  fs.mkdirSync(dir, { recursive: true });
  const dedup = new Map(); // 相同 dataURL 复用同一文件
  let count = 0, saved = 0;

  function walk(node) {
    if (typeof node === 'string') {
      if (node.length > MIN && node.startsWith('data:image/')) {
        if (!dedup.has(node)) {
          const mime = node.slice(5).split(';')[0];
          const ext = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp' }[mime] || '.png';
          const name = 'mig_' + crypto.createHash('sha1').update(node.slice(0, 200) + node.length).digest('hex').slice(0, 12) + ext;
          fs.writeFileSync(path.join(dir, name), Buffer.from(node.split(',')[1], 'base64'));
          dedup.set(node, `/uploads/${uid}/${name}`);
          count++;
          saved += node.length;
        }
        return dedup.get(node);
      }
      return node;
    }
    if (Array.isArray(node)) { node.forEach((v, i) => node[i] = walk(v)); return node; }
    if (node && typeof node === 'object') { Object.keys(node).forEach(k => node[k] = walk(node[k])); return node; }
    return node;
  }
  walk(doc.state);
  if (count) {
    doc.rev = (doc.rev || 0) + 1; // 触发前端 409 重拉
    fs.writeFileSync(file, JSON.stringify(doc));
    console.log(`${f}: 迁移 ${count} 个图片,释放 ${(saved / 1024 / 1024).toFixed(2)} MB → 新大小 ${(fs.statSync(file).size / 1024).toFixed(0)} KB`);
    totalFiles += count; totalSaved += saved;
  }
}
console.log(`完成:共迁移 ${totalFiles} 个图片,释放 ${(totalSaved / 1024 / 1024).toFixed(2)} MB`);
