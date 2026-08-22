/* ============ ziputil.js 零依赖最小 ZIP 写入器(STORE 无压缩 + CRC32) ============ */
(function () {
  /* CRC32 表 */
  const CRC_TABLE = (() => {
    const t = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
      t[n] = c >>> 0;
    }
    return t;
  })();
  function crc32(bytes) {
    let c = 0xFFFFFFFF;
    for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xFF] ^ (c >>> 8);
    return (c ^ 0xFFFFFFFF) >>> 0;
  }

  const te = new TextEncoder();
  const toBytes = data => typeof data === 'string' ? te.encode(data) : data;

  /* dataURL(base64) 或 http URL → Promise<Uint8Array>
     H3 修复:登录后换图存的是 /uploads/ URL,原实现按 dataURL 解析产生 0 字节空文件 */
  async function dataURLtoBytes(dataURL) {
    if (!String(dataURL).startsWith('data:')) {
      const res = await fetch(dataURL);
      if (!res.ok) throw new Error('素材抓取失败(' + res.status + '):' + String(dataURL).slice(0, 60));
      return new Uint8Array(await res.arrayBuffer());
    }
    const b64 = String(dataURL).split(',')[1] || '';
    const bin = atob(b64);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }

  /**
   * 生成 ZIP(STORE 模式)
   * files: [{name:'path/in.zip', data:string|Uint8Array}]
   * 返回 Uint8Array
   */
  function create(files) {
    const chunks = [];
    const central = [];
    let offset = 0;
    const u16 = v => new Uint8Array([v & 0xFF, (v >>> 8) & 0xFF]);
    const u32 = v => new Uint8Array([v & 0xFF, (v >>> 8) & 0xFF, (v >>> 16) & 0xFF, (v >>> 24) & 0xFF]);
    const dosDateTime = (() => {
      const d = new Date();
      const time = (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1);
      const date = (((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate());
      return { time, date };
    })();

    files.forEach(f => {
      const nameBytes = te.encode(f.name.replace(/\\/g, '/').replace(/^\/+/, ''));
      const data = toBytes(f.data);
      const crc = crc32(data);
      // Local File Header
      const lfh = [
        u32(0x04034b50), u16(20), u16(0x0800), u16(0), // 签名/版本/UTF-8标志/STORE
        u16(dosDateTime.time), u16(dosDateTime.date),
        u32(crc), u32(data.length), u32(data.length),
        u16(nameBytes.length), u16(0), nameBytes,
      ];
      lfh.forEach(c => chunks.push(c));
      chunks.push(data);
      central.push({ nameBytes, crc, size: data.length, offset });
      offset += 30 + nameBytes.length + data.length;
    });

    const cdStart = offset;
    central.forEach(e => {
      const cdh = [
        u32(0x02014b50), u16(20), u16(20), u16(0x0800), u16(0),
        u16(dosDateTime.time), u16(dosDateTime.date),
        u32(e.crc), u32(e.size), u32(e.size),
        u16(e.nameBytes.length), u16(0), u16(0), u16(0), u16(0),
        u32(0), u32(e.offset), e.nameBytes,
      ];
      cdh.forEach(c => chunks.push(c));
      offset += 46 + e.nameBytes.length;
    });
    const cdSize = offset - cdStart;
    // EOCD
    chunks.push(u32(0x06054b50), u16(0), u16(0), u16(central.length), u16(central.length), u32(cdSize), u32(cdStart), u16(0));

    let total = 0;
    chunks.forEach(c => total += c.length);
    const out = new Uint8Array(total);
    let pos = 0;
    chunks.forEach(c => { out.set(c, pos); pos += c.length; });
    return out;
  }

  function download(filename, files) {
    const bytes = create(files);
    const blob = new Blob([bytes], { type: 'application/zip' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 3000);
  }

  window.ZipUtil = { create, download, dataURLtoBytes, crc32 };
})();
