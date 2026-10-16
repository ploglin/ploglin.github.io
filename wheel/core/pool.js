// 候選池（C.1）：資格、已得獎、pending、未到場規則；poolHash；篩除原因統計（C.7-2）。
import { prizeAllowRepeat } from './model.js';
import { sha256Hex } from './rng.js';

const ABSENT = new Set(['absent', 'declined']);
/** 同一獎項內不再抽到的作廢原因（v1.3 C.1 補充）：誤觸以外都視為「這個獎不再給他」 */
const SAME_PRIZE_BLOCK = new Set(['absent', 'declined', 'ineligible', 'duplicate', 'other']);

export function eligible(p, elig) {
  if (!elig || elig.mode === 'all') return true;
  const groups = elig.groups || [];
  const tags = elig.tags || [];
  const hit = (p.group && groups.includes(p.group)) || (p.tags || []).some(t => tags.includes(t));
  return elig.mode === 'include' ? !!hit : !hit;
}

/**
 * 回傳 { pool: [{id, weight}] (依 id 排序), stats: 篩除原因統計 }
 * excludeIds：本批已抽者（不放回）等額外排除。
 */
export function buildPoolDetailed(event, prize, excludeIds = []) {
  const allowRepeat = prizeAllowRepeat(event, prize);
  const rules = event.settings.rules;
  const winners = new Set(), pendings = new Set(), absentVoided = new Set(), samePrizeVoided = new Set();
  for (const d of event.draws) {
    if (d.status === 'confirmed') winners.add(d.participantId);
    else if (d.status === 'pending') pendings.add(d.participantId);
    else if (d.status === 'voided' && d.void) {
      if (ABSENT.has(d.void.reason)) absentVoided.add(d.participantId);
      if (d.prizeId === prize.id && SAME_PRIZE_BLOCK.has(d.void.reason)) samePrizeVoided.add(d.participantId);
    }
  }
  const ex = new Set(excludeIds);
  const stats = { excluded: 0, ineligible: 0, winners: 0, pending: 0, absent: 0, samePrize: 0 };
  const pool = [];
  for (const p of event.participants) {
    if (p.excluded) { stats.excluded++; continue; }
    if (!eligible(p, prize.eligibility)) { stats.ineligible++; continue; }
    if (!allowRepeat && winners.has(p.id)) { stats.winners++; continue; }
    if (pendings.has(p.id) || ex.has(p.id)) { stats.pending++; continue; }
    if (rules.absentKeepsEligibility === false && absentVoided.has(p.id)) { stats.absent++; continue; }
    if (samePrizeVoided.has(p.id)) { stats.samePrize++; continue; }
    pool.push({ id: p.id, weight: p.weight });
  }
  pool.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  return { pool, stats };
}

export function buildPool(event, prize, excludeIds) { return buildPoolDetailed(event, prize, excludeIds).pool; }

export function totalWeight(pool) { let t = 0; for (const c of pool) t += c.weight; return t; }

/** SHA-256(候選 id:weight 以 id 排序 join(',')) 前 16 hex */
export async function poolHash(pool) {
  const s = pool.map(c => `${c.id}:${c.weight}`).join(',');
  return (await sha256Hex(s)).slice(0, 16);
}

/** 候選數（即時顯示用，不含 pending 以外的額外排除） */
export function candidateCount(event, prize) { return buildPool(event, prize).length; }
