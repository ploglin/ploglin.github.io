// 舞台的純邏輯（不碰 DOM）：文案組合、主按鈕、作廢條模型、時間軸、觀眾可見的畫面模型。
// 主持端與觀眾視窗共用；Node 測試可直接 import。
import {
  prizeById, prizeCounts, sortedPrizes, displayName, sameNameSet, isBigPrize, VOID_REASONS, groupOrder, PALETTE,
} from '../../core/model.js';
import { revealCards, planNextDraw, nextPrize } from '../../core/draw.js';
import { revealStyle, STOP_HOLD_MS, CHAIN_HOLD_MS, SHUFFLE_MS } from '../../core/reveal-style.js';
import { buildPool } from '../../core/pool.js';
import { decideWheel, buildSectors } from '../../core/sectors.js';
import * as ops from '../../core/stage-ops.js';
import S from '../i18n-stage.js';

// ---------- 文案 ----------
/** t('stage.remaining', {n: 3}) → 「還有 3 名」；找不到 key 時回傳 key 本身 */
export function t(key, vars) {
  let v = key.split('.').reduce((o, k) => (o && o[k] != null ? o[k] : undefined), S);
  if (typeof v !== 'string') return key;
  if (vars) v = v.replace(/\{(\w+)\}/g, (m, k) => (vars[k] != null ? String(vars[k]) : m));
  return v;
}

const CIRCLED = ['①', '②', '③', '④', '⑤', '⑥'];

/** 觀眾端卡片標籤：未到場／棄權 → 「未到場・補抽」，其餘 → 「補抽」（原因本身永不投影） */
export function publicVoidLabel(reason) {
  return reason === 'absent' || reason === 'declined' ? t('stage.voidAbsent') : t('stage.voidOther');
}

export function reasonLabel(reason) { return t('reason.' + reason); }

/** 多人姓名：3 人以內以「、」相連，超過則「甲 等 4 人」 */
export function joinNames(names) {
  if (names.length <= 3) return names.join('、');
  return t('void.namesMany', { first: names[0], n: names.length });
}

/**
 * 作廢條模型（D.7）。mirror = 鏡像投影版：不列原因、不高亮，只在條尾以圈數字小代號表示。
 * 回傳 { title, reasons|null, hint|null, mark|null, tail, rule|null }
 */
export function voidBarModel({ mirror, confirmed, names, reason = 'absent', absentRule = null }) {
  const title = t(confirmed ? 'void.titleConfirmed' : 'void.title', { names: joinNames(names) });
  const idx = Math.max(0, VOID_REASONS.indexOf(reason));
  if (mirror) {
    return {
      title,
      reasons: null,
      hint: reason === 'absent' ? t('void.mirrorDefault') : t('void.mirrorChosen'),
      mark: '·' + CIRCLED[idx],
      tail: t('void.tailMirror'),
      rule: null,
    };
  }
  return {
    title,
    reasons: VOID_REASONS.map((r, i) => ({ n: i + 1, reason: r, label: reasonLabel(r), selected: r === reason })),
    hint: null,
    mark: null,
    tail: t('void.tail'),
    rule: absentRule === true ? t('void.ruleKeep') : absentRule === false ? t('void.ruleDrop') : null,
  };
}

// ---------- 下一次開轉 ----------
/** 與 stage-ops.beginSpin 相同的樣式推定（補抽批沿用原批大小） */
export function nextDrawInfo(ev) {
  const p = prizeById(ev, ev.stage.currentPrizeId);
  if (!p) return null;
  const plan = planNextDraw(ev, p.id);
  if (plan.kind === 'none') return { prize: p, plan, style: null };
  let size = plan.n;
  if (plan.kind === 'redraw' && plan.redrawOf.length) {
    const b = new Set(plan.redrawOf.map(d => d.batchId));
    const base = b.size === 1 ? ev.draws.filter(d => d.batchId === plan.redrawOf[0].batchId).length : plan.redrawOf.length;
    size = Math.max(plan.n, base);
  }
  return { prize: p, plan, style: revealStyle(size, ev.settings.revealFlip) };
}

/**
 * 主按鈕（D.5b 焦點目標）：{ kind, label, key: 'Space'|'Enter'|null, disabled }
 * revealDone 由呼叫端以 ops.isRevealDone 算好傳入（避免重算）。
 */
export function mainAction(ev, revealDone = ops.isRevealDone(ev)) {
  const st = ev.stage;
  const prize = prizeById(ev, st.currentPrizeId);
  switch (st.phase) {
    case 'prize_intro': return { kind: 'wait', label: prize ? prize.name : t('btn.wait'), key: null, disabled: true };
    case 'idle': {
      const ia = ops.idleAction(ev);
      if (ia.kind === 'spin') return { kind: 'spin', label: t('btn.spin'), key: 'Space', disabled: false };
      if (ia.kind === 'arm') return { kind: 'arm', label: t('btn.arm'), key: 'Space', disabled: false };
      if (ia.kind === 'redraw') return { kind: 'redraw', label: t('btn.redraw', { n: ia.plan.n, prize: ia.prize.name }), key: 'Space', disabled: false };
      if (ia.kind === 'empty') return { kind: 'empty', label: t('btn.empty'), key: null, disabled: true };
      return { kind: 'none', label: t('btn.none'), key: null, disabled: true };
    }
    case 'armed': return { kind: 'spin', label: t('btn.spin'), key: 'Space', disabled: false };
    case 'spinning': return { kind: 'busy', label: t('btn.spinning'), key: null, disabled: true };
    case 'reveal': {
      if (revealDone) return { kind: 'confirm', label: t('btn.confirm'), key: 'Enter', disabled: false };
      const rs = ops.currentRevealStyle(ev);
      if (rs && rs.style === 'grid') return { kind: 'advance', label: t('btn.nextPage'), key: 'Space', disabled: false };
      return { kind: 'advance', label: t('btn.flip'), key: 'Space', disabled: false };
    }
    case 'prize_done': {
      const nx = prize ? nextPrize(ev, prize.id) : null;
      return nx ? { kind: 'next', label: t('btn.next', { name: nx.name }), key: 'Space', disabled: false }
        : { kind: 'none', label: t('btn.allDone'), key: null, disabled: true };
    }
    case 'all_done': return { kind: 'none', label: t('btn.allDone'), key: null, disabled: true };
    default: return { kind: 'none', label: '', key: null, disabled: true };
  }
}

// ---------- 轉動時間軸 ----------
/**
 * spin：{ style, spins: [{skip?, durationMs, ...}], recover?, reduced? }
 * 回傳 { segments: [{kind: 'spin'|'hold'|'shuffle', index, start, end}], total }（毫秒，相對 startedAt）
 * single：轉動 → 停留 1.2 s；chain：每人轉動 → 只亮該名 1.5 s；wall/grid：洗牌 2 s（減少動態 0.6 s）
 */
export function spinTimeline(spin) {
  const segs = [];
  const list = spin.spins || [];
  if (spin.style === 'wall' || spin.style === 'grid' || !list.length) {
    const d = spin.recover ? 0 : (spin.reduced ? 600 : SHUFFLE_MS);
    segs.push({ kind: 'shuffle', index: 0, start: 0, end: d });
    return { segments: segs, total: d };
  }
  const chain = list.length > 1;
  let t0 = 0;
  list.forEach((s, i) => {
    if (s.skip) {
      const hold = chain ? CHAIN_HOLD_MS : 300;
      segs.push({ kind: 'hold', index: i, start: t0, end: t0 + hold }); t0 += hold;
      return;
    }
    const d = Math.max(0, s.durationMs || 0);
    segs.push({ kind: 'spin', index: i, start: t0, end: t0 + d }); t0 += d;
    const hold = spin.recover ? 300 : (chain ? CHAIN_HOLD_MS : STOP_HOLD_MS);
    segs.push({ kind: 'hold', index: i, start: t0, end: t0 + hold }); t0 += hold;
  });
  return { segments: segs, total: t0 };
}

/** 某時刻所在的段落；超過總長回傳最後一段並標 done */
export function segmentAt(tl, elapsed) {
  for (const s of tl.segments) if (elapsed < s.end) return { ...s, done: false };
  const last = tl.segments[tl.segments.length - 1];
  return last ? { ...last, done: true } : null;
}

/** 復原用轉動角度：from → to，固定 p = 3 */
export function recoverRotation(t, from, to, durSec) {
  if (t >= durSec) return to;
  if (t <= 0) return from;
  return from + (to - from) * (1 - Math.pow(1 - t / durSec, 3));
}

// ---------- 轉盤預覽（idle 時顯示的轉盤） ----------
/** 候選池簽章：用來決定預覽要不要重建 */
export function poolSignature(pool) {
  let hsh = 0;
  for (const c of pool) {
    const s = c.id + ':' + c.weight;
    for (let i = 0; i < s.length; i++) hsh = (Math.imul(hsh, 31) + s.charCodeAt(i)) | 0;
  }
  return pool.length + ':' + (hsh >>> 0).toString(36);
}

/**
 * idle 轉盤預覽：{ key, sectors, mode, fontPx, sectorBy, note, diameter, candidates, shown }
 * 只有 1 名候選時重複排列 8 格（不補空格）。
 */
export function wheelPreview(ev, prize, diameter, rnd) {
  const pool = buildPool(ev, prize);
  const d = decideWheel(pool, ev.settings, diameter, ev.participants.length);
  const base = { mode: d.mode, fontPx: d.fontPx, sectorBy: d.sectorBy, note: d.note, diameter, candidates: pool.length };
  if (!pool.length) return { ...base, sectors: [], shown: 0, empty: true };
  let sectors;
  if (pool.length === 1) {
    const p = ev.participants.find(x => x.id === pool[0].id) || { name: '' };
    const gmap = groupOrder(ev);
    const ci = p.group && gmap.has(p.group) ? gmap.get(p.group) % PALETTE.length : 0;
    sectors = Array.from({ length: 8 }, (_, i) => ({
      participantId: p.id, label: p.name, weight: 1, startDeg: i * 45, endDeg: (i + 1) * 45,
      colorIndex: gmap.size ? ci : i % PALETTE.length, groupLabel: p.group,
    }));
    base.mode = 'full';
  } else {
    sectors = buildSectors(pool, pool[0].id, ev, d, rnd).sectors;
  }
  return { ...base, sectors, shown: sectors.length };
}

// ---------- 觀眾可見的畫面模型 ----------
function seqLabelOf(seqs) {
  if (!seqs.length) return '';
  const a = Math.min(...seqs), b = Math.max(...seqs);
  return a === b ? t('stage.seq', { n: a }) : t('stage.seqRange', { a, b });
}

/** 揭曉卡片（觀眾可見：不含作廢原因、不含稽核資料） */
export function revealPublic(ev, shortfall = 0) {
  const st = ev.stage;
  if (!st.currentBatchId) return null;
  const rs = ops.currentRevealStyle(ev);
  if (!rs) return null;
  const { cards } = revealCards(ev, st.currentBatchId);
  const dup = sameNameSet(ev);
  const flipped = st.reveal ? st.reveal.flipped : 0;
  const showGroup = ev.settings.revealShowGroup !== false;
  const showCode = !!ev.settings.revealShowCode;
  let freshIdx = 0;
  const seqs = [];
  const out = cards.map((c) => {
    const r = c.record;
    const base = { slot: c.slot, seq: r.seq, fresh: !!c.fresh };
    let i = -1;
    if (c.fresh) { i = freshIdx++; seqs.push(r.seq); }
    if (r.status === 'voided') return { ...base, state: 'voided', label: publicVoidLabel(r.void && r.void.reason) };
    if (c.fresh && rs.style === 'wall' && r.status === 'pending' && i >= flipped) return { ...base, state: 'hidden' };
    const who = { name: r.snapshot.name, group: r.snapshot.group };
    const card = { ...base, state: 'shown', name: displayName(ev, who, dup) };
    if (showGroup && r.snapshot.group) card.group = r.snapshot.group;
    if (showCode && r.snapshot.code) card.code = r.snapshot.code;
    return card;
  });
  const maxSlot = out.reduce((m, c) => Math.max(m, c.slot), -1);
  for (let k = 0; k < shortfall; k++) out.push({ slot: maxSlot + 1 + k, state: 'short', fresh: true });
  const pages = rs.style === 'grid' ? Math.max(1, Math.ceil(out.length / rs.perPage)) : 1;
  return {
    style: rs.style, namePx: rs.namePx, flip: rs.flip, perPage: rs.perPage, pages,
    page: st.reveal ? Math.min(st.reveal.page || 0, pages - 1) : 0,
    flipped, cards: out, seqLabel: seqLabelOf(seqs),
  };
}

/**
 * 組出觀眾可見的畫面模型（主持端畫面也用它繪製，再疊上主持人介面）。
 * x: { rehearsal, wheel, candidates, spin, shortfall, banner, marquee, fx, reduced }
 */
export function buildPublicView(ev, x = {}) {
  const st = ev.stage;
  const prize = prizeById(ev, st.currentPrizeId);
  const counts = prize ? prizeCounts(ev, prize) : null;
  const nx = prize ? nextPrize(ev, prize.id) : null;
  const info = st.phase === 'idle' || st.phase === 'prize_intro' || st.phase === 'armed' ? nextDrawInfo(ev) : null;
  const pv = {
    v: 1,
    title: (ev.settings.stageTitle || '').trim() || ev.name,
    theme: ev.settings.stageTheme || 'midnight',
    rehearsal: !!x.rehearsal,
    phase: st.phase,
    prize: prize ? { id: prize.id, name: prize.name, description: prize.description || '' } : null,
    big: !!(prize && isBigPrize(ev, prize.id)),
    remaining: counts ? counts.remaining : 0,
    candidates: x.candidates == null ? 0 : x.candidates,
    nextSeq: t('stage.seq', { n: ev.counters.drawSeq + 1 }),
    nextPrizeName: nx ? nx.name : '',
    upcoming: info && info.style ? { style: info.style.style, n: info.plan.n, wheel: info.style.wheel, redraw: info.plan.kind === 'redraw' } : null,
    wheel: x.wheel || null,
    spin: st.phase === 'spinning' ? (x.spin || null) : null,
    reveal: st.phase === 'reveal' ? revealPublic(ev, x.shortfall || 0) : null,
    banner: x.banner || null,
    marquee: x.marquee || null,
    fx: x.fx || null,
    reduced: !!x.reduced,
    clickerMode: !!ev.settings.clickerMode,
  };
  return pv;
}

// ---------- 最近得獎（R 抽屜、側欄） ----------
export function recentRows(ev, limit = 5) {
  const dup = sameNameSet(ev);
  const bySeq = new Map(ev.draws.map(d => [d.id, d.seq]));
  return [...ev.draws].sort((a, b) => b.seq - a.seq).slice(0, limit).map((d) => {
    const p = prizeById(ev, d.prizeId);
    const row = {
      id: d.id, seq: d.seq, prize: p ? p.name : '', name: displayName(ev, d.snapshot, dup),
      group: d.snapshot.group || '', status: d.status, canVoid: d.status === 'confirmed',
    };
    if (d.status === 'confirmed') row.statusText = t('recent.confirmed');
    else if (d.status === 'pending') row.statusText = t('recent.pending');
    else if (d.void && d.void.redrawnBy && bySeq.has(d.void.redrawnBy)) row.statusText = t('recent.redrawnTo', { n: bySeq.get(d.void.redrawnBy) });
    else row.statusText = t('recent.waitRedraw');
    return row;
  });
}

// ---------- 側欄獎項列 ----------
export function prizeRows(ev) {
  const st = ev.stage;
  return sortedPrizes(ev).map((p) => {
    const c = prizeCounts(ev, p);
    const bonus = p.bonusLog.filter(b => !b.reverted).reduce((s, b) => s + b.delta, 0);
    let mark = 'pending';
    if (p.status === 'skipped') mark = 'skipped';
    else if (c.confirmed >= p.quantity) mark = 'done';
    else if (st.currentPrizeId === p.id) mark = 'active';
    return {
      id: p.id, order: p.order, name: p.name, mark, big: isBigPrize(ev, p.id), bonus,
      drawn: t('stage.drawnOf', { c: c.confirmed, q: p.quantity }), remaining: c.remaining, current: st.currentPrizeId === p.id,
      selectable: p.status !== 'skipped',
    };
  });
}

// ---------- 選卡模式的焦點移動 ----------
/**
 * order：畫面上卡位 slot 依序；selectable：Set(slot)；cols：每列幾張（chain/single 傳 order.length）
 * 回傳新的 focus slot（無法移動時回傳原值）
 */
export function moveCardFocus(order, selectable, focus, key, cols) {
  const idx = order.indexOf(focus);
  if (idx < 0) return order.find(s => selectable.has(s)) ?? focus;
  const oneRow = cols >= order.length;
  let delta;
  if (key === 'ArrowLeft') delta = -1;
  else if (key === 'ArrowRight') delta = 1;
  else if (key === 'ArrowUp') delta = oneRow ? -1 : -cols;
  else if (key === 'ArrowDown') delta = oneRow ? 1 : cols;
  else return focus;
  let j = idx + delta;
  const step = Math.sign(delta);
  while (j >= 0 && j < order.length && !selectable.has(order[j])) j += step;
  if (j < 0 || j >= order.length) return focus;
  return order[j];
}

/** 揭曉牆每列張數：2 列；格陣每列最多 6 張 */
export function cardColumns(style, n) {
  if (style === 'wall') return Math.max(1, Math.ceil(n / 2));
  if (style === 'grid') return Math.max(1, Math.min(6, n));
  return Math.max(1, n);
}

/** 候選 0 人的原因統計（C.7-2）→ 「已得獎 60 · 排除 5 …」 */
export function emptyPoolText(stats) {
  const parts = [];
  const order = ['winners', 'excluded', 'ineligible', 'absent', 'samePrize', 'pending'];
  for (const k of order) if (stats[k]) parts.push(t('empty.' + k, { n: stats[k] }));
  return parts.length ? t('empty.reasons', { list: parts.join(' · ') }) : t('empty.noPeople');
}
