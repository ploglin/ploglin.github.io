// 舞台操作（C.4–C.6 的程式流程）：把「按下某鍵」轉成對 event / event.stage 的修改。
// 不碰 DOM、不管動畫計時；UI（ui/stage/page-stage.js）負責動畫與 600 ms 冷卻。
import {
  prizeById, prizeCounts, isBigPrize, recomputePrizeStatuses, addLog, createParticipant,
  participantById, unredrawnVoids,
} from './model.js';
import { buildPool } from './pool.js';
import { performDraw, planNextDraw, confirmBatch, voidDraws, revealCards, nextPrize, firstOpenPrize, addBonus, addBonusPrize } from './draw.js';
import { revealStyle, revealComplete, CHAIN_DURATION_RATIO } from './reveal-style.js';
import { decideWheel, buildSectors, planSpin } from './sectors.js';
import { phaseAfterConfirm } from './state.js';
import { randomUnit } from './rng.js';

function setPhase(ev, phase) { ev.stage.phase = phase; }

/** 進入舞台：決定目前獎項與 phase；回傳 { recover: 'spin'|'reveal'|null } */
export function enterStage(ev) {
  const st = ev.stage;
  st.overlay = null; delete st.cardSelect;
  if (st.phase === 'spinning' && st.currentBatchId) return { recover: 'spin' };
  if (st.phase === 'reveal' && st.currentBatchId) {
    // 揭曉中重新整理：卡片全展開
    const rs = currentRevealStyle(ev);
    if (st.reveal && rs) { st.reveal.flipped = freshCount(ev); st.reveal.page = Math.max(0, rs.pages - 1); }
    return { recover: 'reveal' };
  }
  // 有 pending 但 phase 不一致（異常中斷）→ 回到揭曉
  const pend = ev.draws.find(d => d.status === 'pending');
  if (pend) {
    st.currentBatchId = pend.batchId; st.currentPrizeId = pend.prizeId;
    const rs = currentRevealStyle(ev);
    st.reveal = { style: rs.style, flipped: freshCount(ev), page: Math.max(0, rs.pages - 1), pendingRedraw: 0 };
    setPhase(ev, 'reveal');
    return { recover: 'reveal' };
  }
  let cur = st.currentPrizeId && prizeById(ev, st.currentPrizeId);
  if (!cur || prizeCounts(ev, cur).confirmed >= cur.quantity && !unredrawnVoids(ev, cur.id).length) cur = firstOpenPrize(ev);
  if (!cur) { setPhase(ev, ev.prizes.length ? 'all_done' : 'idle'); recomputePrizeStatuses(ev); return { recover: null }; }
  st.currentPrizeId = cur.id;
  setPhase(ev, 'prize_intro');
  delete st.spin; delete st.reveal;
  recomputePrizeStatuses(ev);
  return { recover: null };
}

export function startPrizeIntro(ev, prizeId) {
  const st = ev.stage;
  st.currentPrizeId = prizeId; st.currentBatchId = null; st.overlay = null;
  delete st.spin; delete st.reveal; delete st.cardSelect;
  setPhase(ev, 'prize_intro');
  recomputePrizeStatuses(ev);
}

/** 介紹結束：該獎還有名額 → idle；否則 prize_done */
export function introDone(ev) {
  const p = prizeById(ev, ev.stage.currentPrizeId);
  if (!p) { setPhase(ev, 'idle'); return; }
  const plan = planNextDraw(ev, p.id);
  setPhase(ev, plan.kind === 'none' ? (nextPrize(ev, p.id) ? 'prize_done' : 'all_done') : 'idle');
}

/** 主按鈕 / Space 在 idle 的意義 */
export function idleAction(ev) {
  const p = prizeById(ev, ev.stage.currentPrizeId);
  if (!p) return { kind: 'none' };
  const plan = planNextDraw(ev, p.id);
  if (plan.kind === 'none') return { kind: 'none', prize: p };
  const pool = buildPool(ev, p);
  if (!pool.length) return { kind: 'empty', prize: p, plan };
  if (plan.kind === 'fresh' && isBigPrize(ev, p.id)) return { kind: 'arm', prize: p, plan };
  return { kind: plan.kind === 'redraw' ? 'redraw' : 'spin', prize: p, plan };
}

export function arm(ev) { setPhase(ev, 'armed'); }
export function disarm(ev) { setPhase(ev, 'idle'); }

export function currentRevealStyle(ev) {
  const st = ev.stage;
  if (!st.currentBatchId) return null;
  const { baseSize } = revealCards(ev, st.currentBatchId);
  return revealStyle(baseSize, ev.settings.revealFlip);
}
export function freshCount(ev) {
  const st = ev.stage;
  if (!st.currentBatchId) return 0;
  return revealCards(ev, st.currentBatchId).cards.filter(c => c.fresh).length;
}

/**
 * 開轉：先寫 pending 與 spin 參數（呼叫端 await 存檔後才開始動畫）。
 * env: { diameter, rehearsal, now, reducedMotion }
 * 回傳 { batchId, records, style, spins: [...], shortfall }
 */
export async function beginSpin(ev, env = {}) {
  const st = ev.stage;
  const prize = prizeById(ev, st.currentPrizeId);
  const plan = planNextDraw(ev, prize.id);
  const pool0 = buildPool(ev, prize);
  const diameter = env.diameter || 892;
  const decision = decideWheel(pool0, ev.settings, diameter, ev.participants.length);
  // 補抽批若沿用原批版面，樣式依原批大小；轉盤只在 single/chain 轉
  const probeSize = plan.kind === 'redraw' ? Math.max(plan.n, baseSizeOf(ev, plan.redrawOf)) : plan.n;
  const style0 = revealStyle(probeSize, ev.settings.revealFlip);
  const wheel = style0.wheel;
  const res = await performDraw(ev, prize.id, { wheelMode: wheel ? decision.mode : 'none', rehearsal: !!env.rehearsal });
  const { baseSize } = revealCards(ev, res.batchId);
  const rs = revealStyle(baseSize, ev.settings.revealFlip);
  const reduced = !!env.reducedMotion;
  const baseMs = reduced ? 1200 : ev.settings.spinDurationMs;
  const spins = [];
  if (rs.wheel) {
    const n = res.records.length;
    const dur = n > 1 ? Math.round(baseMs * CHAIN_DURATION_RATIO) : baseMs;
    res.records.forEach((rec, i) => {
      const pool = res.pools[i];
      const d = decideWheel(pool, ev.settings, diameter, ev.participants.length);
      const built = buildSectors(pool, rec.participantId, ev, d, randomUnit);
      if (built.skip) { spins.push({ skip: true, participantId: rec.participantId, slot: rec.slot }); return; }
      const sp = planSpin(built.sectors, built.targetIndex, diameter, dur, randomUnit);
      spins.push({ ...sp, sectors: built.sectors, targetIndex: built.targetIndex, mode: d.mode, sectorBy: d.sectorBy, fontPx: d.fontPx, note: d.note, participantId: rec.participantId, slot: rec.slot });
    });
  }
  st.spin = { startedAt: env.now || Date.now(), durationMs: spins[0] ? spins[0].durationMs || baseMs : 0, targetAngleDeg: spins[0] ? spins[0].targetAngleDeg || 0 : 0, easingPow: spins[0] ? spins[0].easingPow || 3 : 3, sectors: spins[0] ? spins[0].sectors || [] : [], chain: spins, index: 0 };
  st.reveal = { style: rs.style, flipped: 0, page: 0, pendingRedraw: 0 };
  delete st.cardSelect;
  setPhase(ev, 'spinning');
  return { ...res, style: rs, spins };
}

function baseSizeOf(ev, redrawOf) {
  if (!redrawOf.length) return 0;
  const b = new Set(redrawOf.map(d => d.batchId));
  if (b.size !== 1) return redrawOf.length;
  // 追溯到最初那一批（與 revealCards 同一判定），避免「補抽後又作廢再補抽」被誤判成單抽
  return revealCards(ev, redrawOf[0].batchId).baseSize;
}

/** 動畫結束 → reveal；single/chain/grid 直接全展開（grid 由翻頁控制），wall 從 0 張開始翻 */
export function finishSpin(ev) {
  const st = ev.stage;
  const rs = currentRevealStyle(ev);
  if (!st.reveal) st.reveal = { style: rs.style, flipped: 0, page: 0, pendingRedraw: 0 };
  st.reveal.flipped = rs.style === 'wall' ? 0 : freshCount(ev);
  setPhase(ev, 'reveal');
}

export function isRevealDone(ev) {
  const st = ev.stage;
  if (st.phase !== 'reveal') return false;
  const rs = currentRevealStyle(ev);
  return revealComplete(rs, st.reveal, freshCount(ev));
}

/** Space 於揭曉中：翻一張 / 翻一頁 */
export function advanceReveal(ev) {
  const st = ev.stage; const rs = currentRevealStyle(ev);
  if (rs.style === 'wall') st.reveal.flipped = Math.min(freshCount(ev), st.reveal.flipped + 1);
  else if (rs.style === 'grid') st.reveal.page = Math.min(rs.pages - 1, st.reveal.page + 1);
}

/** Enter：確認全部 → idle / prize_done / all_done */
export function confirmReveal(ev, now = Date.now()) {
  const st = ev.stage;
  const batchId = st.currentBatchId;
  const r = confirmBatch(ev, batchId, now);
  const p = prizeById(ev, r.prizeId);
  const plan = planNextDraw(ev, p.id);
  const remaining = plan.kind === 'none' ? 0 : plan.n;
  setPhase(ev, phaseAfterConfirm(remaining, !!nextPrize(ev, p.id)));
  delete st.reveal; delete st.spin; delete st.cardSelect;
  return { ...r, phase: st.phase };
}

/** 揭曉中作廢某幾張卡（pending）：卡位變「待補抽」；整批都作廢了 → idle */
export function voidInReveal(ev, ids, reason, note) {
  const st = ev.stage;
  const out = voidDraws(ev, ids, { reason, note });
  if (st.reveal) st.reveal.pendingRedraw = (st.reveal.pendingRedraw || 0) + out.length;
  delete st.cardSelect;
  const stillPending = ev.draws.some(d => d.batchId === st.currentBatchId && d.status === 'pending');
  if (!stillPending) {
    st.currentBatchId = null; delete st.reveal; delete st.spin;
    setPhase(ev, 'idle');
  }
  return out;
}

/** 最後確認那批中仍為 confirmed 的紀錄（V 鍵對象） */
export function lastConfirmedRecords(ev) {
  const lc = ev.stage.lastConfirmed;
  if (!lc) return [];
  return ev.draws.filter(d => d.batchId === lc.batchId && d.status === 'confirmed').sort((a, b) => a.slot - b.slot);
}

/**
 * 事後作廢（已確認者）：名額退回；不在該獎 → 回傳 switchTo（UI 播換獎過場後進 idle）
 * 回傳 { voided, switchTo: prizeId|null }
 */
export function voidConfirmed(ev, ids, reason, note) {
  const st = ev.stage;
  const out = voidDraws(ev, ids, { reason, note });
  if (!out.length) return { voided: [], switchTo: null };
  const prizeId = out[0].prizeId;
  delete st.cardSelect;
  if (st.currentPrizeId !== prizeId || st.phase === 'all_done' || st.phase === 'prize_intro') {
    const needIntro = st.currentPrizeId !== prizeId || st.phase === 'all_done';
    st.currentPrizeId = prizeId;
    delete st.reveal; delete st.spin;
    if (needIntro) { setPhase(ev, 'prize_intro'); recomputePrizeStatuses(ev); return { voided: out, switchTo: prizeId }; }
    setPhase(ev, 'idle');
  } else if (st.phase === 'prize_done') {
    setPhase(ev, 'idle');
  }
  recomputePrizeStatuses(ev);
  return { voided: out, switchTo: null };
}

/** prize_done 的 Space：下一獎（有）→ prize_intro；無 → all_done */
export function goNextPrize(ev) {
  const nx = nextPrize(ev, ev.stage.currentPrizeId);
  if (nx) { startPrizeIntro(ev, nx.id); return nx; }
  setPhase(ev, 'all_done');
  return null;
}

/**
 * 加碼（D.8）。kind: 'quota' {prizeId, delta, reason} | 'prize' {fields, when}
 * 回傳 { intro: prizeId|null, label }
 */
export function applyBonus(ev, kind, a) {
  const st = ev.stage;
  if (kind === 'quota') {
    const r = addBonus(ev, a.prizeId, a.delta, a.reason, true);
    if (st.phase === 'all_done') { startPrizeIntro(ev, a.prizeId); return { intro: a.prizeId, label: `${r.prize.name} +${a.delta}` }; }
    if (st.currentPrizeId === a.prizeId && st.phase === 'prize_done') setPhase(ev, 'idle');
    return { intro: null, label: `${r.prize.name} +${a.delta}` };
  }
  const pz = addBonusPrize(ev, a.fields, a.when, st.currentPrizeId, true);
  if (a.when === 'now' || st.phase === 'all_done') { startPrizeIntro(ev, pz.id); return { intro: pz.id, label: pz.name }; }
  if (st.phase === 'prize_done' && !nextPrize(ev, st.currentPrizeId)) setPhase(ev, 'prize_done');
  return { intro: null, label: pz.name };
}

// ---------- 名單快速操作（L） ----------
export function stageExclude(ev, pid, reason = 'other') {
  const p = participantById(ev, pid); if (!p) return;
  p.excluded = true; p.excludeReason = reason;
  addLog(ev, 'participant.exclude', `排除 ${p.name}`, { id: pid, reason, afterSeq: ev.counters.drawSeq }, true);
}
export function stageRestore(ev, pid) {
  const p = participantById(ev, pid); if (!p) return;
  p.excluded = false; delete p.excludeReason; delete p.excludeNote;
  addLog(ev, 'participant.restore', `恢復 ${p.name}`, { id: pid, afterSeq: ev.counters.drawSeq }, true);
}
export function stageAdd(ev, name, group) {
  const p = createParticipant({ name, group, source: 'stage' });
  ev.participants.push(p);
  addLog(ev, 'participant.add', `舞台新增 ${p.name}${group ? '（' + group + '）' : ''}`, { id: p.id, afterSeq: ev.counters.drawSeq }, true);
  return p;
}

/** 觀眾/鏡像可見的名額文案用：「還有 N 名」 */
export function remainingFor(ev, prizeId) {
  const p = prizeById(ev, prizeId); if (!p) return 0;
  return prizeCounts(ev, p).remaining;
}
