// 抽選與帳本操作（C.2、C.4、C.6）。全部直接修改傳入的 event（呼叫端負責先 clone / 存檔）。
import {
  uuid, nowISO, addLog, prizeById, participantById, prizeCounts, unredrawnVoids,
  recomputePrizeStatuses, renumberPrizes, sortedPrizes, createPrize, prizeAllowRepeat,
} from './model.js';
import { buildPool, totalWeight, poolHash } from './pool.js';
import { rngFor } from './rng.js';

/** 加權抽一名：回傳索引（第一個 cumulative > target） */
export function pickOne(pool, unit) {
  const total = totalWeight(pool);
  if (!pool.length || total <= 0) return -1;
  const target = Math.floor(unit * total);
  // 二分搜尋前綴和
  let lo = 0, hi = pool.length - 1, acc = 0;
  if (pool.length < 64) {
    for (let i = 0; i < pool.length; i++) { acc += pool[i].weight; if (acc > target) return i; }
    return pool.length - 1;
  }
  const pref = new Array(pool.length);
  for (let i = 0; i < pool.length; i++) { acc += pool[i].weight; pref[i] = acc; }
  while (lo < hi) { const mid = (lo + hi) >> 1; if (pref[mid] > target) hi = mid; else lo = mid + 1; }
  return lo;
}

/**
 * 下一次開轉的規劃：補抽優先（C.4）。
 * 回傳 { kind: 'redraw'|'fresh'|'none', n, redrawOf: DrawRecord[] }
 */
export function planNextDraw(event, prizeId) {
  const prize = prizeById(event, prizeId);
  if (!prize || prize.status === 'skipped') return { kind: 'none', n: 0, redrawOf: [] };
  const c = prizeCounts(event, prize);
  if (c.pending > 0 || c.remaining <= 0) return { kind: 'none', n: 0, redrawOf: [] };
  const voids = unredrawnVoids(event, prizeId);
  if (voids.length) {
    const k = Math.min(voids.length, c.remaining);
    return { kind: 'redraw', n: k, redrawOf: voids.slice(0, k) };
  }
  return { kind: 'fresh', n: Math.min(prize.perDraw, c.remaining), redrawOf: [] };
}

/**
 * 執行一批抽選：全部寫成 pending 才回傳（C.3 第 6 步：先寫結果再動畫）。
 * opts: { wheelMode: 'full'|'compact'|'sampled'|'reel'|'none', rehearsal: bool, inStage: bool }
 * 回傳 { batchId, records, pools: [pool at each pick], shortfall }
 */
export async function performDraw(event, prizeId, opts = {}) {
  const prize = prizeById(event, prizeId);
  if (!prize) throw new Error('prize-not-found');
  const plan = planNextDraw(event, prizeId);
  if (plan.kind === 'none' || plan.n <= 0) throw new Error('no-quota');
  const batchId = uuid();
  event.counters.batchSeq++;
  const records = [], pools = [];
  let shortfall = 0;
  const pickedIds = [];
  const freshSlots = [];
  if (plan.kind === 'fresh') for (let i = 0; i < plan.n; i++) freshSlots.push(i);
  for (let i = 0; i < plan.n; i++) {
    const pool = buildPool(event, prize, pickedIds);
    if (!pool.length) { shortfall = plan.n - i; break; }
    const seq = event.counters.drawSeq + 1;
    const rng = await rngFor(event.settings, seq);
    const r = rng.next();
    const idx = pickOne(pool, r.unit);
    const cand = pool[idx];
    const p = participantById(event, cand.id);
    const hash = await poolHash(pool);
    event.counters.drawSeq = seq;
    const rec = {
      id: uuid(), seq, batchId,
      slot: plan.kind === 'redraw' ? plan.redrawOf[i].slot : freshSlots[i],
      prizeId, participantId: p.id,
      snapshot: { name: p.name, weight: p.weight },
      status: 'pending', drawnAt: nowISO(),
      audit: {
        rngMode: rng.mode, randomHex: r.hex, randomUnit: r.unit,
        candidateCount: pool.length, totalWeight: totalWeight(pool), poolHash: hash,
        pickIndex: idx, wheelMode: opts.wheelMode || 'none',
      },
    };
    if (p.group) rec.snapshot.group = p.group;
    if (p.code) rec.snapshot.code = p.code;
    if (rng.mode === 'seeded') rec.audit.seed = event.settings.seed;
    if (plan.kind === 'redraw') {
      const orig = plan.redrawOf[i];
      rec.redrawOf = orig.id;
      orig.void.redrawnBy = rec.id;
    }
    event.draws.push(rec);
    records.push(rec); pools.push(pool); pickedIds.push(p.id);
  }
  if (!records.length) throw new Error('empty-pool');
  // stage 與活動狀態
  const st = event.stage;
  if (st.lastConfirmed && st.lastConfirmed.prizeId !== prizeId) delete st.lastConfirmed;
  st.currentPrizeId = prizeId;
  st.currentBatchId = batchId;
  if (!opts.rehearsal && event.status === 'draft') {
    event.status = 'live';
    addLog(event, 'event.live', '第一次正式開轉', undefined, true);
  }
  recomputePrizeStatuses(event);
  return { batchId, records, pools, shortfall, kind: plan.kind };
}

export function batchRecords(event, batchId) {
  return event.draws.filter(d => d.batchId === batchId).sort((a, b) => a.slot - b.slot);
}

/**
 * 揭曉畫面的卡片組合：補抽批若全部來自同一原批，沿用原批版面並把結果填回原 slot。
 * 回傳 { cards: [{slot, record, fresh}], baseSize }
 */
export function revealCards(event, batchId) {
  const recs = batchRecords(event, batchId);
  if (!recs.length) return { cards: [], baseSize: 0 };
  const byId = new Map(event.draws.map(d => [d.id, d]));
  const rootBatch = (r) => { let x = r; while (x.redrawOf && byId.get(x.redrawOf)) x = byId.get(x.redrawOf); return x.batchId; };
  const roots = new Set(recs.map(r => (r.redrawOf ? rootBatch(r) : r.batchId)));
  if (recs.every(r => r.redrawOf) && roots.size === 1) {
    const root = [...roots][0];
    // 原批每個 slot 的「最新一筆」
    const slots = new Map();
    for (const d of event.draws) {
      if (rootBatch(d) !== root) continue;
      const cur = slots.get(d.slot);
      if (!cur || d.seq > cur.seq) slots.set(d.slot, d);
    }
    const cards = [...slots.entries()].sort((a, b) => a[0] - b[0])
      .map(([slot, record]) => ({ slot, record, fresh: record.batchId === batchId }));
    return { cards, baseSize: cards.length };
  }
  return { cards: recs.map(r => ({ slot: r.slot, record: r, fresh: true })), baseSize: recs.length };
}

/** Enter：確認本批所有 pending */
export function confirmBatch(event, batchId, now = Date.now()) {
  const t = nowISO();
  let prizeId = null, n = 0;
  for (const d of event.draws) {
    if (d.batchId === batchId && d.status === 'pending') { d.status = 'confirmed'; d.confirmedAt = t; prizeId = d.prizeId; n++; }
  }
  if (!prizeId) {
    const any = event.draws.find(d => d.batchId === batchId);
    prizeId = any ? any.prizeId : null;
  }
  if (n > 0) event.stage.lastConfirmed = { batchId, prizeId, at: now };
  event.stage.currentBatchId = null;
  recomputePrizeStatuses(event);
  return { prizeId, confirmed: n };
}

/** 作廢（當場 pending 或事後 confirmed）；原因選一次套用到所有 ids */
export function voidDraws(event, ids, { reason = 'absent', note } = {}) {
  const t = nowISO();
  const out = [];
  for (const id of ids) {
    const d = event.draws.find(x => x.id === id);
    if (!d || d.status === 'voided') continue;
    const wasConfirmed = d.status === 'confirmed';
    d.status = 'voided';
    d.void = { reason, voidedAt: t, wasConfirmed };
    if (note) d.void.note = note;
    out.push(d);
  }
  recomputePrizeStatuses(event);
  return out;
}

/** 紀錄頁修改作廢原因 / 備註 */
export function editVoid(event, id, { reason, note }) {
  const d = event.draws.find(x => x.id === id);
  if (!d || d.status !== 'voided') throw new Error('not-voided');
  const old = { reason: d.void.reason, note: d.void.note || '' };
  if (reason) d.void.reason = reason;
  if (note !== undefined) { if (note) d.void.note = note; else delete d.void.note; }
  d.void.editedAt = nowISO();
  addLog(event, 'draw.void.edit', `修改第 ${d.seq} 抽的作廢原因`, { drawId: id, old, new: { reason: d.void.reason, note: d.void.note || '' } });
  return d;
}

/** 恢復作廢的可行性（C.6）：該獎尚有名額、補抽筆未生效（不存在或已作廢）、此人未在他處中獎（或允許重複） */
export function canRestore(event, id) {
  const d = event.draws.find(x => x.id === id);
  if (!d || d.status !== 'voided') return { ok: false, why: 'not-voided' };
  const prize = prizeById(event, d.prizeId);
  if (!prize) return { ok: false, why: 'no-prize' };
  if (d.void.redrawnBy) {
    const r = event.draws.find(x => x.id === d.void.redrawnBy);
    if (r && r.status !== 'voided') return { ok: false, why: 'redraw-active' };
  }
  if (prizeCounts(event, prize).remaining <= 0) return { ok: false, why: 'no-quota' };
  if (!prizeAllowRepeat(event, prize) && event.draws.some(x => x.participantId === d.participantId && x.status === 'confirmed')) {
    return { ok: false, why: 'won-elsewhere' };
  }
  return { ok: true };
}

export function restoreVoid(event, id) {
  const chk = canRestore(event, id);
  if (!chk.ok) throw new Error(chk.why);
  const d = event.draws.find(x => x.id === id);
  const prev = d.void;
  // 補抽鏈上已作廢的後續筆不再需要補抽
  let nx = prev.redrawnBy;
  while (nx) {
    const r = event.draws.find(x => x.id === nx);
    if (!r || !r.void) break;
    r.void.closed = true; nx = r.void.redrawnBy;
  }
  d.status = 'confirmed';
  if (!d.confirmedAt) d.confirmedAt = nowISO();
  delete d.void;
  d.restoredFrom = { reason: prev.reason, voidedAt: prev.voidedAt };
  addLog(event, 'draw.restore', `恢復第 ${d.seq} 抽`, { drawId: id, prevReason: prev.reason });
  recomputePrizeStatuses(event);
  return d;
}

/** 加碼：現有獎項加名額 */
export function addBonus(event, prizeId, delta, reason = '老闆加碼', byStage = true) {
  const p = prizeById(event, prizeId);
  if (!p) throw new Error('prize-not-found');
  const n = Math.round(Number(delta));
  if (!(n >= 1)) throw new Error('bad-delta');
  const wasDone = p.status === 'done';
  const before = p.quantity;
  p.quantity += n;
  p.bonusLog.push({ at: nowISO(), delta: n, reason: reason || '加碼', byStage: !!byStage });
  addLog(event, 'prize.bonus', `${p.name} 名額 ${before} → ${p.quantity}（${reason || '加碼'}）`, { prizeId, delta: n }, byStage);
  recomputePrizeStatuses(event);
  return { prize: p, wasDone, before };
}

/** 撤回加碼（紀錄頁）：條件 quantity − n ≥ confirmed + pending */
export function canRevertBonus(event, prizeId, index) {
  const p = prizeById(event, prizeId);
  const b = p && p.bonusLog[index];
  if (!b || b.reverted) return false;
  const c = prizeCounts(event, p);
  return p.quantity - b.delta >= c.confirmed + c.pending && p.quantity - b.delta >= 1;
}
export function revertBonus(event, prizeId, index) {
  if (!canRevertBonus(event, prizeId, index)) throw new Error('cannot-revert');
  const p = prizeById(event, prizeId);
  const b = p.bonusLog[index];
  p.quantity -= b.delta;
  b.reverted = nowISO();
  addLog(event, 'bonus.revert', `撤回 ${p.name} 加碼 +${b.delta}`, { prizeId, index });
  recomputePrizeStatuses(event);
}

/** 加碼：新增臨時獎項。when: 'now' | 'after' | 'last' */
export function addBonusPrize(event, fields, when = 'now', currentPrizeId = null, byStage = true) {
  const list = sortedPrizes(event);
  const pz = createPrize({ ...fields, isBonus: true }, list.length + 1);
  const curIdx = list.findIndex(p => p.id === currentPrizeId);
  let insertAt = list.length;
  if (when === 'now' || when === 'after') insertAt = curIdx >= 0 ? curIdx + 1 : list.length;
  list.splice(insertAt, 0, pz);
  list.forEach((p, i) => { p.order = i + 1; });
  event.prizes.push(pz);
  addLog(event, 'prize.add', `新增臨時獎項「${pz.name}」名額 ${pz.quantity}`, { prizeId: pz.id, when }, byStage);
  recomputePrizeStatuses(event);
  return pz;
}

/** 關閉剩餘名額（候選不足 / 刪除有紀錄的獎項時的替代） */
export function closeRemaining(event, prizeId) {
  const p = prizeById(event, prizeId);
  const c = prizeCounts(event, p);
  const before = p.quantity;
  const used = c.confirmed + c.pending;
  if (used === 0) p.status = 'skipped';          // 名額至少 1：一筆都沒抽的獎項改為「跳過」
  else p.quantity = used;
  addLog(event, 'prize.close', `${p.name} 關閉剩餘名額 ${before} → ${used}`, { prizeId, before });
  recomputePrizeStatuses(event);
}

/** 下一個尚未抽完、未跳過的獎項（依順序，從 afterId 之後找） */
export function nextPrize(event, afterId) {
  const list = sortedPrizes(event);
  const idx = list.findIndex(p => p.id === afterId);
  const open = (p) => p.status !== 'skipped' && prizeCounts(event, p).confirmed < p.quantity;
  for (let i = idx + 1; i < list.length; i++) if (open(list[i])) return list[i];
  return null;
}
export function firstOpenPrize(event) {
  const list = sortedPrizes(event);
  return list.find(p => p.status !== 'skipped' && prizeCounts(event, p).confirmed < p.quantity) || null;
}

export { renumberPrizes };
