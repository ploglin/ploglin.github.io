// 去重與同名（B.3 去重鍵、B.7.6 三層）
export function normalize(s) {
  if (s == null) return '';
  return String(s).normalize('NFKC').replace(/[​﻿]/g, '').replace(/[\s　 ]+/g, ' ').trim();
}

export function dedupeKey(p) {
  if (p.code && normalize(p.code)) return 'code:' + normalize(p.code);
  return 'ng:' + normalize(p.name) + '|' + normalize(p.group);
}

/** 名字是否只差一字（同長、恰一字不同；簡繁/異體常見情形） */
export function oneCharDiff(a, b) {
  a = normalize(a); b = normalize(b);
  if (a === b || a.length !== b.length || a.length < 2) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i] && ++diff > 1) return false;
  return diff === 1;
}

/**
 * 把待匯入列對照既有名單分類。
 * 回傳每列 { level: 0|1|2|3, matchId?, sameCodeDiffName? }
 * 1 完全相同（同 code / 同 name+group）、2 同名不同群組、3 疑似同人（差一字且同群組）
 */
export function classifyAgainst(existing, rows) {
  const byKey = new Map(), byName = new Map(), byGroup = new Map();
  for (const p of existing) {
    byKey.set(dedupeKey(p), p);
    const n = normalize(p.name);
    if (!byName.has(n)) byName.set(n, []);
    byName.get(n).push(p);
    const g = normalize(p.group);
    if (!byGroup.has(g)) byGroup.set(g, []);
    byGroup.get(g).push(p);
  }
  return rows.map(r => {
    const hit = byKey.get(dedupeKey(r));
    if (hit) {
      const out = { level: 1, matchId: hit.id };
      if (r.code && normalize(hit.name) !== normalize(r.name)) out.sameCodeDiffName = true;
      return out;
    }
    const same = byName.get(normalize(r.name));
    if (same && same.some(p => normalize(p.group) !== normalize(r.group))) return { level: 2, matchId: same[0].id };
    const peers = byGroup.get(normalize(r.group)) || [];
    const sim = peers.find(p => oneCharDiff(p.name, r.name));
    if (sim) return { level: 3, matchId: sim.id };
    return { level: 0 };
  });
}

/** 名單內部重複（去重頁用）：回傳 [{level, ids:[...]}] */
export function findDuplicates(list) {
  const groups = [];
  const byKey = new Map();
  for (const p of list) { const k = dedupeKey(p); if (!byKey.has(k)) byKey.set(k, []); byKey.get(k).push(p.id); }
  for (const ids of byKey.values()) if (ids.length > 1) groups.push({ level: 1, ids });
  const byName = new Map();
  for (const p of list) { const n = normalize(p.name); if (!byName.has(n)) byName.set(n, []); byName.get(n).push(p); }
  for (const arr of byName.values()) {
    const gs = new Set(arr.map(p => normalize(p.group)));
    if (arr.length > 1 && gs.size > 1) groups.push({ level: 2, ids: arr.map(p => p.id) });
  }
  const byGroup = new Map();
  for (const p of list) { const g = normalize(p.group); if (!byGroup.has(g)) byGroup.set(g, []); byGroup.get(g).push(p); }
  for (const arr of byGroup.values()) {
    for (let i = 0; i < arr.length; i++) for (let j = i + 1; j < arr.length; j++) {
      if (oneCharDiff(arr[i].name, arr[j].name)) groups.push({ level: 3, ids: [arr[i].id, arr[j].id] });
    }
  }
  return groups;
}
