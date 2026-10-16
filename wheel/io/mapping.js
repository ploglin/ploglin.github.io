// grid → 待匯入列（B.7.4 寬表、B.7.5 長表）。每列附問題旗標，供預覽著色。
import { splitMulti, isMulti, notName } from './clean.js';
import { synonymField } from './shape.js';

/**
 * 寬表：每欄標題 = group（空標題 → 「第 n 欄」並標黃；同名標題合併）；往下每個非空格一人。
 * opts: { splitMulti: true, skipNotName: true }
 * 回傳 { rows, groups: [{name, count, unnamed}], skipped }
 */
export function wideToRows(grid, opts = {}) {
  const split = opts.splitMulti !== false, skipBad = opts.skipNotName !== false;
  const head = grid[0] || [];
  const width = grid.reduce((m, r) => Math.max(m, r.length), 0);
  const rows = []; const groups = new Map(); let skipped = 0;
  for (let j = 0; j < width; j++) {
    const title = (head[j] || '').trim();
    const g = title || `第 ${j + 1} 欄`;
    if (!groups.has(g)) groups.set(g, { name: g, count: 0, unnamed: !title });
    for (let i = 1; i < grid.length; i++) {
      const v = (grid[i][j] || '').trim();
      if (!v) continue;                          // 群組欄中間的空格直接略過
      const names = split && isMulti(v) ? splitMulti(v) : [v];
      for (const nm of names) {
        const bad = notName(nm);
        const row = { name: nm, group: g, weight: 1, excluded: false, flags: {} };
        if (names.length > 1) row.flags.multi = true;
        if (bad) { row.flags.notName = true; if (skipBad) { row.skip = true; skipped++; } }
        rows.push(row);
        if (!row.skip) groups.get(g).count++;
      }
    }
  }
  return { rows, groups: [...groups.values()], skipped };
}

/** 長表欄位自動對應：回傳每欄對應的欄位名（name/group/code/weight/excluded/tags/note/null） */
export function autoMap(grid) {
  const head = grid[0] || [];
  const mapped = head.map(h => synonymField(h));
  const hasHeader = mapped.some(Boolean);
  if (!hasHeader) {
    const width = grid.reduce((m, r) => Math.max(m, r.length), 0);
    const m = new Array(width).fill(null);
    if (width >= 1) m[0] = 'name';
    if (width >= 2) m[1] = 'group';
    return { mapping: m, hasHeader: false };
  }
  // 同一欄位只取第一欄
  const seen = new Set();
  return { mapping: mapped.map(f => (f && !seen.has(f) ? (seen.add(f), f) : null)), hasHeader: true };
}

function truthy(v) { return /^(1|y|yes|true|是|v|x|✓|排除)$/i.test(String(v).trim()); }

/**
 * 長表：mapping 為每欄欄位名；籤數欄遇 0 → weight 1 + excluded('imported-zero')；非法籤數設 1 並標紅。
 */
export function longToRows(grid, mapping, hasHeader, opts = {}) {
  const split = opts.splitMulti !== false, skipBad = opts.skipNotName !== false;
  const body = hasHeader ? grid.slice(1) : grid;
  const head = hasHeader ? grid[0] : [];
  const rows = []; let skipped = 0;
  const idx = (f) => mapping.indexOf(f);
  const iName = idx('name');
  for (const r of body) {
    const raw = iName >= 0 ? (r[iName] || '').trim() : '';
    const base = { flags: {}, weight: 1, excluded: false };
    if (idx('group') >= 0 && r[idx('group')]) base.group = r[idx('group')].trim();
    if (idx('code') >= 0 && r[idx('code')]) base.code = r[idx('code')].trim();
    if (idx('weight') >= 0) {
      const wv = (r[idx('weight')] || '').trim();
      if (wv !== '') {
        const n = Number(wv);
        if (n === 0) { base.weight = 1; base.excluded = true; base.excludeReason = 'imported-zero'; base.flags.zero = true; }
        else if (Number.isInteger(n) && n >= 1 && n <= 1000) base.weight = n;
        else { base.weight = 1; base.flags.badWeight = true; }
      }
    }
    if (idx('excluded') >= 0 && truthy(r[idx('excluded')] || '')) { base.excluded = true; base.excludeReason = base.excludeReason || 'other'; }
    if (idx('tags') >= 0 && r[idx('tags')]) base.tags = r[idx('tags')].split(/[、,，\s]+/).filter(Boolean);
    if (idx('note') >= 0 && r[idx('note')]) base.note = r[idx('note')];
    const extra = {};
    mapping.forEach((f, j) => { if (!f && hasHeader && r[j]) extra[head[j] || `欄${j + 1}`] = r[j]; });
    if (Object.keys(extra).length) base.extra = extra;
    if (!raw) { rows.push({ ...base, name: '', skip: true, flags: { ...base.flags, emptyName: true } }); skipped++; continue; }
    const names = split && isMulti(raw) ? splitMulti(raw) : [raw];
    for (const nm of names) {
      const row = { ...base, flags: { ...base.flags }, name: nm };
      if (names.length > 1) row.flags.multi = true;
      if (notName(nm)) { row.flags.notName = true; if (skipBad) { row.skip = true; skipped++; } }
      rows.push(row);
    }
  }
  const groups = new Map();
  for (const r of rows) if (!r.skip) { const g = r.group || ''; groups.set(g, (groups.get(g) || 0) + 1); }
  return { rows, groups: [...groups.entries()].filter(([g]) => g).map(([name, count]) => ({ name, count, unnamed: false })), skipped };
}

/** 一站式：清理後 grid + 形狀 → rows */
export function gridToRows(grid, shape, opts = {}) {
  if (shape === 'wide') return { ...wideToRows(grid, opts), shape };
  const am = opts.mapping ? { mapping: opts.mapping, hasHeader: opts.hasHeader !== false } : autoMap(grid);
  return { ...longToRows(grid, am.mapping, am.hasHeader, opts), shape, mapping: am.mapping, hasHeader: am.hasHeader };
}

/**
 * 把待匯入列寫進 event（直接修改）。
 * opts: { conflict: 'skip'|'overwrite'|'both', sameName: 'separate'|'merge', source, fileName, shape }
 * 回傳 { added, skipped, overwritten, ids }
 */
export function applyImport(event, rows, opts, classify, createParticipant, addLog) {
  const conflict = opts.conflict || 'skip';
  const sameName = opts.sameName || 'separate';
  const live = rows.filter(r => !r.skip && r.name);
  const cls = classify(event.participants, live);
  let added = 0, skipped = rows.length - live.length, overwritten = 0;
  const ids = [];
  live.forEach((r, i) => {
    const c = cls[i];
    if (c.level === 1) {
      if (conflict === 'skip') { skipped++; return; }
      if (conflict === 'overwrite') {
        const p = event.participants.find(x => x.id === c.matchId);
        if (p) {
          p.name = r.name; if (r.group) p.group = r.group; if (r.code) p.code = r.code;
          p.weight = r.weight || 1;
          if (r.excluded) { p.excluded = true; p.excludeReason = r.excludeReason || 'other'; }
          overwritten++; return;
        }
      }
    }
    if (c.level === 2 && sameName === 'merge') { skipped++; return; }
    const p = createParticipant({ ...r, source: opts.source || 'paste' });
    event.participants.push(p); ids.push(p.id); added++;
  });
  const groups = {};
  for (const r of live) if (r.group) groups[r.group] = (groups[r.group] || 0) + 1;
  addLog(event, 'participant.import', `匯入 ${added} 人`, { file: opts.fileName || '', shape: opts.shape || '', groups, added, skipped, overwritten });
  return { added, skipped, overwritten, ids };
}
