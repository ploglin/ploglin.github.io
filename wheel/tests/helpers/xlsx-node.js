// 測試專用：極簡 .xlsx 讀寫（只供 Node 測試；瀏覽器端走 SheetJS，見 io/xlsx.js）。
// 讀：解 zip（stored / deflate）→ sharedStrings + 第一個工作表 → 二維字串陣列。
// 寫：產生「stored」zip 的最小 xlsx（可刻意放大 dimension，用來模擬 `!ref` 不可信、尾端空白列）。
import { inflateRawSync } from 'node:zlib';

function u16(b, o) { return b[o] | (b[o + 1] << 8); }
function u32(b, o) { return (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] << 24)) >>> 0; }

export function unzip(buf) {
  let eocd = -1;
  for (let i = buf.length - 22; i >= 0; i--) { if (u32(buf, i) === 0x06054b50) { eocd = i; break; } }
  if (eocd < 0) throw new Error('not a zip');
  const n = u16(buf, eocd + 10); let off = u32(buf, eocd + 16);
  const files = {};
  for (let k = 0; k < n; k++) {
    const method = u16(buf, off + 10), csize = u32(buf, off + 20);
    const nlen = u16(buf, off + 28), xlen = u16(buf, off + 30), clen = u16(buf, off + 32);
    const lho = u32(buf, off + 42);
    const name = buf.slice(off + 46, off + 46 + nlen).toString('utf8');
    const lnlen = u16(buf, lho + 26), lxlen = u16(buf, lho + 28);
    const start = lho + 30 + lnlen + lxlen;
    const data = buf.slice(start, start + csize);
    files[name] = method === 0 ? data : inflateRawSync(data);
    off += 46 + nlen + xlen + clen;
  }
  return files;
}

function xmlUnescape(s) {
  return s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(+d)).replace(/&amp;/g, '&');
}
function colIndex(ref) { let c = 0; for (const ch of ref.replace(/\d+/g, '')) c = c * 26 + (ch.charCodeAt(0) - 64); return c - 1; }

/** 回傳 { sheetNames, ref, grid }；grid 依 dimension 範圍補 ''（模擬 SheetJS defval:'' 未裁切時的樣子） */
export function readXlsx(buf) {
  const f = unzip(buf);
  const sst = [];
  if (f['xl/sharedStrings.xml']) {
    const x = f['xl/sharedStrings.xml'].toString('utf8');
    for (const m of x.matchAll(/<si>([\s\S]*?)<\/si>/g)) {
      sst.push(xmlUnescape([...m[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map(t => t[1]).join('')));
    }
  }
  const wbx = f['xl/workbook.xml'].toString('utf8');
  const sheetNames = [...wbx.matchAll(/<sheet [^>]*name="([^"]*)"/g)].map(m => xmlUnescape(m[1]));
  const sheetFile = Object.keys(f).filter(k => /^xl\/worksheets\/sheet\d+\.xml$/.test(k)).sort()[0];
  const sx = f[sheetFile].toString('utf8');
  const refM = sx.match(/<dimension ref="([^"]+)"/);
  const ref = refM ? refM[1] : null;
  const rows = [];
  for (const rm of sx.matchAll(/<row\b([^>]*?)(?:\/>|>([\s\S]*?)<\/row>)/g)) {
    const r = +(rm[1].match(/r="(\d+)"/) || [0, rows.length + 1])[1] - 1;
    const body = rm[2] || '';
    rows[r] = rows[r] || [];
    for (const cm of body.matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const attrs = cm[1]; const inner = cm[2] || '';
      const cref = (attrs.match(/r="([A-Z]+\d+)"/) || [])[1]; if (!cref) continue;
      const t = (attrs.match(/t="(\w+)"/) || [])[1];
      let v = '';
      if (t === 's') { const vm = inner.match(/<v>([\s\S]*?)<\/v>/); v = vm ? sst[+vm[1]] : ''; }
      else if (t === 'inlineStr') { v = xmlUnescape([...inner.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map(x => x[1]).join('')); }
      else { const vm = inner.match(/<v>([\s\S]*?)<\/v>/); v = vm ? xmlUnescape(vm[1]) : ''; }
      rows[r][colIndex(cref)] = v;
    }
  }
  let maxR = rows.length, maxC = 0;
  if (ref && ref.includes(':')) {
    const end = ref.split(':')[1]; maxR = Math.max(maxR, +end.replace(/[A-Z]+/, '')); maxC = colIndex(end) + 1;
  }
  for (const r of rows) if (r) maxC = Math.max(maxC, r.length);
  const grid = [];
  for (let i = 0; i < maxR; i++) {
    const src = rows[i] || []; const row = [];
    for (let j = 0; j < maxC; j++) row.push(src[j] == null ? '' : String(src[j]));
    grid.push(row);
  }
  return { sheetNames, ref, grid };
}

// ---------- 寫（stored zip） ----------
const CRC_T = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; }
  return t;
})();
function crc32(b) { let c = 0xffffffff; for (let i = 0; i < b.length; i++) c = CRC_T[(c ^ b[i]) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; }
function zip(entries) {
  const locals = [], centrals = []; let off = 0;
  for (const [name, str] of entries) {
    const data = Buffer.from(str, 'utf8'); const nm = Buffer.from(name, 'utf8'); const crc = crc32(data);
    const lh = Buffer.alloc(30);
    lh.writeUInt32LE(0x04034b50, 0); lh.writeUInt16LE(20, 4); lh.writeUInt16LE(0x0800, 6);
    lh.writeUInt32LE(crc, 14); lh.writeUInt32LE(data.length, 18); lh.writeUInt32LE(data.length, 22); lh.writeUInt16LE(nm.length, 26);
    locals.push(lh, nm, data);
    const ch = Buffer.alloc(46);
    ch.writeUInt32LE(0x02014b50, 0); ch.writeUInt16LE(20, 4); ch.writeUInt16LE(20, 6); ch.writeUInt16LE(0x0800, 8);
    ch.writeUInt32LE(crc, 16); ch.writeUInt32LE(data.length, 20); ch.writeUInt32LE(data.length, 24);
    ch.writeUInt16LE(nm.length, 28); ch.writeUInt32LE(off, 42);
    centrals.push(ch, nm);
    off += 30 + nm.length + data.length;
  }
  const cd = Buffer.concat(centrals); const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(entries.length, 8); end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(cd.length, 12); end.writeUInt32LE(off, 16);
  return Buffer.concat([...locals, cd, end]);
}
function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
function colName(i) { let s = ''; i++; while (i) { const m = (i - 1) % 26; s = String.fromCharCode(65 + m) + s; i = Math.floor((i - 1) / 26); } return s; }

/** grid（二維字串）→ xlsx Buffer；refRows 可刻意放大 dimension（模擬 `!ref` 不可信） */
export function writeXlsx(grid, { sheetName = 'Sheet1', refRows } = {}) {
  const cols = Math.max(...grid.map(r => r.length));
  const rowsXml = grid.map((r, i) => {
    const cells = r.map((v, j) => v === '' ? '' : `<c r="${colName(j)}${i + 1}" t="inlineStr"><is><t>${esc(v)}</t></is></c>`).join('');
    return `<row r="${i + 1}">${cells}</row>`;
  }).join('');
  const ref = `A1:${colName(cols - 1)}${refRows || grid.length}`;
  const X = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
  return zip([
    ['[Content_Types].xml', X + '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>'],
    ['_rels/.rels', X + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>'],
    ['xl/workbook.xml', X + `<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="${esc(sheetName)}" sheetId="1" r:id="rId1"/></sheets></workbook>`],
    ['xl/_rels/workbook.xml.rels', X + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>'],
    ['xl/worksheets/sheet1.xml', X + `<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><dimension ref="${ref}"/><sheetData>${rowsXml}</sheetData></worksheet>`],
  ]);
}
