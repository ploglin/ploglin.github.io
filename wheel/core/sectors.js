// 轉盤幾何（C.3）：尺寸公式、四種呈現、自動降級、落點、緩動指數。純函式。
import { clamp, groupOrder, PALETTE } from './model.js';
import { randomUnit } from './rng.js';

export const INFO_H = 110;       // 資訊區高
export const BUTTON_H = 88;      // 一般模式主按鈕區
export const SIDEBAR_W = 360;
export const MIN_TEXT_ARC = 20;  // 文字處弧寬下限（px），低於此改等分 / 降級
export const TEXT_R = 0.66;      // 文字所在半徑比例

/** Dpx = min(主區寬, 主區高 − 110 − 主按鈕區) × 0.92 */
export function wheelDiameter({ width, height, projection = true, sidebar = false }) {
  const mainW = width - (sidebar ? SIDEBAR_W : 0);
  const mainH = height - INFO_H - (projection ? 0 : BUTTON_H);
  return Math.floor(Math.max(0, Math.min(mainW, mainH)) * 0.92);
}

export function textArcPx(diameter, deg) { return 2 * Math.PI * (TEXT_R * diameter / 2) * (deg / 360); }
export function compactFontPx(arc) { return clamp(Math.floor(arc - 9), 11, 14); }
export function fullFontPx(count) { return count <= 24 ? 22 : count <= 36 ? 18 : 15; }

/** 依候選人數挑模式（auto） */
export function autoMode(count, th = { full: 48, compact: 120, sampled: 400 }) {
  if (count <= th.full) return 'full';
  if (count <= th.compact) return 'compact';
  if (count <= th.sampled) return 'sampled';
  return 'reel';
}

/**
 * 決定實際呈現：{ mode, sectorBy, fontPx, note }
 * note: 'equal-auto'（自動改等分）| 'sampled-auto'（幾何不足降為抽樣）| 'forced-reel'（>5000）| null
 */
export function decideWheel(pool, settings, diameter, totalParticipants = pool.length) {
  const count = pool.length;
  const th = settings.wheelThresholds || { full: 48, compact: 120, sampled: 400 };
  let mode = settings.wheelMode && settings.wheelMode !== 'auto' ? settings.wheelMode : autoMode(count, th);
  let note = null;
  if (totalParticipants > 5000) { mode = 'reel'; note = 'forced-reel'; }
  let sectorBy = settings.sectorBy || 'weight';
  let fontPx = 20;
  if (mode === 'full' || mode === 'compact') {
    const total = pool.reduce((s, c) => s + c.weight, 0) || 1;
    const minW = pool.reduce((m, c) => Math.min(m, c.weight), Infinity);
    const visible = Math.max(count, count < 8 ? 8 : count);
    const equalDeg = 360 / visible;
    const weightDeg = count < 8 ? equalDeg : 360 * minW / total;
    let arc = textArcPx(diameter, sectorBy === 'weight' ? weightDeg : equalDeg);
    if (sectorBy === 'weight' && arc < MIN_TEXT_ARC) {
      sectorBy = 'equal'; note = 'equal-auto';
      arc = textArcPx(diameter, equalDeg);
    }
    if (arc < MIN_TEXT_ARC) {
      mode = 'sampled'; note = 'sampled-auto'; sectorBy = 'equal';
    } else if (mode === 'compact') fontPx = compactFontPx(arc);
    else fontPx = Math.min(fullFontPx(count), Math.max(11, Math.floor(arc - 6)));
  }
  if (mode === 'sampled') fontPx = 20;
  return { mode, sectorBy, fontPx, note };
}

/** 不放回加權抽樣 k 個（顯示用） */
function sampleWeighted(cands, k, rnd) {
  const arr = cands.slice(); const out = [];
  while (out.length < k && arr.length) {
    const tot = arr.reduce((s, c) => s + c.weight, 0);
    let t = rnd() * tot, i = 0;
    for (; i < arr.length - 1; i++) { t -= arr[i].weight; if (t < 0) break; }
    out.push(arr[i]); arr.splice(i, 1);
  }
  return out;
}

/**
 * 建立扇區。people：Map(id → participant)。回傳 { sectors, targetIndex, skip }
 * skip = 只有 1 名候選 → 跳過轉盤直接揭曉。
 */
export function buildSectors(pool, resultId, event, decision, rnd = randomUnit) {
  const people = new Map(event.participants.map(p => [p.id, p]));
  const gmap = groupOrder(event);
  const hasGroups = gmap.size > 0;
  const label = (id) => (people.get(id) || {}).name || '';
  const groupOf = (id) => (people.get(id) || {}).group || '';
  if (pool.length <= 1) return { sectors: [], targetIndex: -1, skip: true };

  let items;
  if (decision.mode === 'sampled') {
    const k = clamp(event.settings.sampledSectors || 36, 24, 48);
    const winner = pool.find(c => c.id === resultId);
    const others = sampleWeighted(pool.filter(c => c.id !== resultId), k - 1, rnd);
    items = others.slice();
    const pos = Math.floor(rnd() * (items.length + 1));
    items.splice(pos, 0, winner);
  } else if (decision.mode === 'reel') {
    // 滾輪：約 40 個名字，最後一個是得獎者
    const n = Math.min(40, pool.length);
    const others = sampleWeighted(pool.filter(c => c.id !== resultId), n - 1, rnd);
    items = [...others, pool.find(c => c.id === resultId)];
  } else {
    items = pool.slice();
    if (hasGroups) {
      items.sort((a, b) => {
        const ga = gmap.has(groupOf(a.id)) ? gmap.get(groupOf(a.id)) : 1e9;
        const gb = gmap.has(groupOf(b.id)) ? gmap.get(groupOf(b.id)) : 1e9;
        return ga - gb || label(a.id).localeCompare(label(b.id), 'zh-Hant');
      });
    }
    if (items.length < 8) {
      const rep = Math.ceil(8 / items.length);
      const base = items; items = [];
      for (let r = 0; r < rep; r++) items.push(...base);
    }
  }

  const equal = decision.sectorBy === 'equal' || decision.mode === 'sampled' || decision.mode === 'reel' || pool.length < 8;
  const total = items.reduce((s, c) => s + (equal ? 1 : c.weight), 0);
  let acc = 0;
  const sectors = items.map((c, i) => {
    const w = equal ? 1 : c.weight;
    const startDeg = acc / total * 360; acc += w;
    const endDeg = acc / total * 360;
    const g = groupOf(c.id);
    const colorIndex = hasGroups && gmap.has(g) ? gmap.get(g) % PALETTE.length : i % PALETTE.length;
    const s = { participantId: c.id, label: label(c.id), weight: c.weight, startDeg, endDeg, colorIndex };
    if (g) s.groupLabel = g;
    return s;
  });
  // 無群組時相鄰交替，避免首尾同色
  if (!hasGroups && sectors.length > 1 && sectors[0].colorIndex === sectors[sectors.length - 1].colorIndex) {
    sectors[sectors.length - 1].colorIndex = (sectors[sectors.length - 1].colorIndex + 1) % PALETTE.length;
  }
  let targetIndex;
  if (decision.mode === 'reel') targetIndex = sectors.length - 1;
  else {
    const hits = sectors.map((s, i) => (s.participantId === resultId ? i : -1)).filter(i => i >= 0);
    targetIndex = hits[Math.floor(rnd() * hits.length)];
  }
  return { sectors, targetIndex, skip: false };
}

/** 落點：目標扇區內隨機角度，距兩側 ≥ max(25% 扇區寬, 外圈 6 px)；放不下取正中 */
export function landingAngle(sector, diameter, rnd = randomUnit) {
  const width = sector.endDeg - sector.startDeg;
  const R = diameter / 2;
  const pxDeg = R > 0 ? (6 / R) * 180 / Math.PI : 0;
  const margin = Math.max(width * 0.25, pxDeg);
  if (width < margin * 2) return sector.startDeg + width / 2;
  return sector.startDeg + margin + rnd() * (width - 2 * margin);
}

/** 緩動指數 p（C.3 第 5 步） */
export function easingPow(sectorDeg, totalDeg, durationSec) {
  if (durationSec < 2) return 3;
  const p = Math.log(2.5 * sectorDeg / totalDeg) / Math.log(1 / durationSec);
  if (!Number.isFinite(p)) return 3;
  return clamp(p, 1.6, 3.0);
}

export function rotationAt(t, totalDeg, durationSec, p) {
  if (t >= durationSec) return totalDeg;
  if (t <= 0) return 0;
  return totalDeg * (1 - Math.pow(1 - t / durationSec, p));
}

/**
 * 組出一次轉動的參數（寫入 StageState.spin）
 * 指針在正上方；扇區角度自 12 點鐘順時針量。最終 rotation ≡ 360 − landDeg。
 */
export function planSpin(sectors, targetIndex, diameter, durationMs, rnd = randomUnit) {
  const sec = sectors[targetIndex];
  const land = landingAngle(sec, diameter, rnd);
  const turns = 4 + Math.floor(rnd() * 3);
  const T = 360 * turns + (360 - land);
  const p = easingPow(sec.endDeg - sec.startDeg, T, durationMs / 1000);
  return { targetAngleDeg: T, easingPow: p, durationMs, landDeg: land };
}

/** 某旋轉角度時指針下的扇區索引 */
export function sectorAtPointer(sectors, rotationDeg) {
  const a = ((360 - (rotationDeg % 360)) % 360 + 360) % 360;
  for (let i = 0; i < sectors.length; i++) if (a >= sectors[i].startDeg && a < sectors[i].endDeg) return i;
  return sectors.length - 1;
}

/** 最後 lastSec 秒內越過的分隔線數（驗收 8 用） */
export function boundariesCrossedInLast(sectors, totalDeg, durationSec, p, lastSec = 1) {
  const from = rotationAt(durationSec - lastSec, totalDeg, durationSec, p);
  const edges = sectors.map(s => s.startDeg);
  let n = 0;
  // 指針相對扇區的角度 = 360 − rotation；rotation 增加時指針角度遞減
  for (let turn = Math.floor(from / 360) - 1; turn <= Math.ceil(totalDeg / 360) + 1; turn++) {
    for (const e of edges) {
      const rot = 360 * turn + (360 - e) % 360; // 指針恰在 e 時的 rotation
      if (rot > from && rot <= totalDeg) n++;
    }
  }
  return n;
}
