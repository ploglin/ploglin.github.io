// CSV / TSV（RFC 4180）解析、編碼偵測（BOM → UTF-8；UTF-8 fatal 失敗 → Big5）、貼上分隔符偵測（B.7.1）

/** RFC 4180：支援引號、跳脫雙引號、引號內換行；CRLF / LF 皆可 */
export function parseDelimited(text, delim = ',') {
  const rows = []; let row = []; let cell = ''; let i = 0; let q = false;
  const n = text.length;
  while (i < n) {
    const ch = text[i];
    if (q) {
      if (ch === '"') {
        if (text[i + 1] === '"') { cell += '"'; i += 2; continue; }
        q = false; i++; continue;
      }
      cell += ch; i++; continue;
    }
    if (ch === '"' && cell === '') { q = true; i++; continue; }
    if (ch === delim) { row.push(cell); cell = ''; i++; continue; }
    if (ch === '\r') { i++; continue; }
    if (ch === '\n') { row.push(cell); rows.push(row); row = []; cell = ''; i++; continue; }
    cell += ch; i++;
  }
  if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
  return rows;
}

export function sniffDelimiter(text) {
  const lines = text.split(/\r?\n/).filter(l => l.trim()).slice(0, 20);
  const cands = ['\t', ',', ';'];
  let best = ',', bestScore = -1;
  for (const d of cands) {
    const counts = lines.map(l => l.split(d).length - 1);
    const min = Math.min(...counts);
    const score = min > 0 ? min * 10 + (counts.every(c => c === counts[0]) ? 5 : 0) : 0;
    if (score > bestScore) { best = d; bestScore = score; }
  }
  return bestScore > 0 ? best : ',';
}

export function parseCSV(text) {
  text = text.replace(/^﻿/, '');
  return parseDelimited(text, sniffDelimiter(text));
}

/** 位元組 → 字串：BOM → UTF-8；否則 UTF-8 fatal，失敗再 Big5 */
export function decodeBytes(bytes) {
  const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  if (u8[0] === 0xEF && u8[1] === 0xBB && u8[2] === 0xBF) return { text: new TextDecoder('utf-8').decode(u8.subarray(3)), encoding: 'utf-8' };
  if (u8[0] === 0xFF && u8[1] === 0xFE) return { text: new TextDecoder('utf-16le').decode(u8.subarray(2)), encoding: 'utf-16le' };
  try {
    return { text: new TextDecoder('utf-8', { fatal: true }).decode(u8), encoding: 'utf-8' };
  } catch {
    try { return { text: new TextDecoder('big5').decode(u8), encoding: 'big5' }; }
    catch { return { text: new TextDecoder('utf-8').decode(u8), encoding: 'utf-8' }; }
  }
}

/**
 * 貼上：換行切列；列內 Tab > `,` > `，` > `、` > 連續空白 的優先序偵測分隔符。
 * 單欄無表頭 → 一行一人（仍回傳單欄 grid，交給 shape 判定）。
 */
export function parsePaste(text) {
  text = String(text || '').replace(/^﻿/, '');
  const lines = text.split(/\r?\n/);
  const nonEmpty = lines.filter(l => l.trim());
  if (!nonEmpty.length) return [];
  const has = (re) => nonEmpty.filter(l => re.test(l)).length >= Math.max(1, Math.ceil(nonEmpty.length * 0.5));
  if (has(/\t/)) return parseDelimited(text, '\t');
  if (has(/,/)) return parseDelimited(text, ',');
  if (has(/，/)) return lines.map(l => l.split('，'));
  if (has(/、/)) return lines.map(l => l.split('、'));
  if (has(/\S[ 　]{2,}\S/)) return lines.map(l => l.trim().split(/[ 　]{2,}/));
  return lines.map(l => [l]);
}

/** 以 RFC 4180 規則輸出一格 */
export function csvCell(v) {
  const s = v == null ? '' : String(v);
  return /[",\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}
export function toCSV(rows, { bom = true } = {}) {
  return (bom ? '﻿' : '') + rows.map(r => r.map(csvCell).join(',')).join('\r\n') + '\r\n';
}
