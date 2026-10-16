// 形狀自動偵測（B.7.3）：長表（一列一人）vs 寬表（一欄一群組）
// 注意：本檔的同義詞清單是「辨識匯入檔表頭」用的比對字，不是對外文案（文案 lint 排除本檔）。
import { looksLikeName } from './clean.js';

export const FIELD_SYNONYMS = {
  name: ['姓名', '名字', '名稱', 'name', '人名', '員工姓名', '學生姓名'],
  group: ['群組', '部門', '單位', '區域', '班級', 'group', 'dept', 'department', '組別', '分組'],
  code: ['編號', '工號', '員編', '員工編號', '學號', 'id', 'no', 'no.', 'code', '座號'],
  weight: ['籤數', '權重', 'weight', '支數', 'tickets'],
  excluded: ['排除', 'excluded', 'exclude'],
  tags: ['標籤', 'tag', 'tags'],
  note: ['備註', 'note', 'notes', '說明'],
};

export function synonymField(h) {
  const k = String(h || '').trim().toLowerCase();
  if (!k) return null;
  for (const [f, list] of Object.entries(FIELD_SYNONYMS)) if (list.includes(k)) return f;
  return null;
}

export function scoreLong(grid) {
  if (!grid.length) return 0;
  let s = 0;
  const head = grid[0];
  if (head.some(h => synonymField(h))) s += 0.5;
  const width = grid.reduce((m, r) => Math.max(m, r.length), 0);
  const body = grid.slice(1);
  for (let j = 0; j < width; j++) {
    const vals = body.map(r => r[j] || '').filter(Boolean);
    if (vals.length && vals.filter(v => /^\d+(\.\d+)?$/.test(v)).length / vals.length >= 0.8) { s += 0.2; break; }
  }
  const counts = grid.map(r => r.filter(Boolean).length);
  if (counts.length > 1 && counts.every(c => c === counts[0]) && counts[0] >= 2) s += 0.2;
  if (width === 1) s += 0.1;
  return Math.round(s * 100) / 100;
}

export function scoreWide(grid) {
  if (!grid.length) return 0;
  let s = 0;
  const head = grid[0];
  const width = grid.reduce((m, r) => Math.max(m, r.length), 0);
  const headFull = head.length === width && head.every(h => h && h.length <= 6);
  if (headFull && !head.some(h => synonymField(h))) s += 0.4;
  const body = grid.slice(1).flat().filter(Boolean);
  if (body.length && body.every(looksLikeName)) s += 0.3;
  const colLens = [];
  for (let j = 0; j < width; j++) colLens.push(grid.slice(1).filter(r => r[j]).length);
  const nz = colLens.filter(x => x > 0);
  if (nz.length >= 2 && Math.max(...nz) / Math.min(...nz) >= 1.5) s += 0.2;
  if (width >= 2 && grid.length > width) s += 0.1;
  return Math.round(s * 100) / 100;
}

/** 回傳 { shape: 'long'|'wide', long, wide, uncertain }（差距 < 0.2 才 uncertain） */
export function detectShape(grid) {
  const long = scoreLong(grid), wide = scoreWide(grid);
  const width = grid.reduce((m, r) => Math.max(m, r.length), 0);
  // 單欄：一律先當「一行一人」（v1.3 補充）；第 1 列像群組名時標示不確定，讓使用者可切寬表
  if (width <= 1) return { shape: 'long', long, wide, uncertain: wide >= long + 0.2 };
  return { shape: wide > long ? 'wide' : 'long', long, wide, uncertain: Math.abs(wide - long) < 0.2 };
}
