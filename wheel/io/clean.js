// 格子清理（B.7.2）
const SYMBOL_EMPTY = new Set(['-', '—', '–', '.', '..', '...', 'n/a', 'na', '無', '空', '／', '/', '_']);

/** NFKC、去頭尾空白（含 NBSP、U+200B/U+FEFF、U+3000）、內部連續空白合併為一 */
export function cleanCell(v) {
  if (v == null) return '';
  let s = String(v).normalize('NFKC').replace(/[​﻿]/g, '');
  s = s.replace(/[\s 　]+/g, ' ').trim();
  if (SYMBOL_EMPTY.has(s.toLowerCase())) return '';
  return s;
}

/** 一格多名：「、」「/」「／」「,」「，」分隔 */
export function splitMulti(s) {
  if (!s) return [];
  const parts = s.split(/[、\/／，,;；]+/).map(x => x.trim()).filter(Boolean);
  return parts;
}
export function isMulti(s) { return splitMulti(s).length > 1; }

/** 不像名字：純數字、長度 > 20、含 @ / http */
export function notName(s) {
  if (!s) return false;
  if (/^[\d\s.\-+]+$/.test(s)) return true;
  if (s.length > 20) return true;
  if (/@|https?:/i.test(s)) return true;
  return false;
}

/** 像名字（形狀偵測用）：2–4 CJK 字，或 1–3 個拉丁單字且無數字 */
export function looksLikeName(s) {
  if (!s) return false;
  if (/\d/.test(s)) return false;
  if (/^[㐀-鿿豈-﫿·・]{2,4}$/.test(s)) return true;
  const words = s.split(' ');
  return words.length >= 1 && words.length <= 3 && words.every(w => /^[A-Za-z][A-Za-z'.\-]*$/.test(w));
}

/**
 * 清理整張 grid：每格 cleanCell，丟掉完全空白的列與欄（含 `!ref` 誤報的尾端空白），
 * 回傳 { grid, trimmedRows, trimmedCols }
 */
export function cleanGrid(raw) {
  const g = (raw || []).map(r => (r || []).map(cleanCell));
  const rowsBefore = g.length;
  const colsBefore = g.reduce((m, r) => Math.max(m, r.length), 0);
  let rows = g.filter(r => r.some(c => c !== ''));
  const width = rows.reduce((m, r) => Math.max(m, r.length), 0);
  const keepCol = [];
  for (let j = 0; j < width; j++) keepCol.push(rows.some(r => (r[j] || '') !== ''));
  rows = rows.map(r => { const out = []; for (let j = 0; j < width; j++) if (keepCol[j]) out.push(r[j] || ''); return out; });
  return { grid: rows, trimmedRows: rowsBefore - rows.length, trimmedCols: colsBefore - keepCol.filter(Boolean).length };
}

/** 依「最後一個非空格」裁切（`!ref` 不可信） */
export function trimTrailing(raw) {
  let lastR = -1, lastC = -1;
  raw.forEach((r, i) => (r || []).forEach((c, j) => { if (String(c ?? '').trim() !== '') { lastR = Math.max(lastR, i); lastC = Math.max(lastC, j); } }));
  return raw.slice(0, lastR + 1).map(r => { const out = []; for (let j = 0; j <= lastC; j++) out.push(r[j] == null ? '' : String(r[j])); return out; });
}
