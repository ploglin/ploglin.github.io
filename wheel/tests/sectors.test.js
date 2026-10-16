// F.1-8 轉盤幾何、F.1-9 色彩對比、F.1-10 揭曉分級
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  wheelDiameter, decideWheel, buildSectors, landingAngle, easingPow, planSpin, sectorAtPointer,
  boundariesCrossedInLast, textArcPx, autoMode,
} from '../core/sectors.js';
import { revealStyle, revealComplete } from '../core/reveal-style.js';
import { PALETTE, defaultSettings } from '../core/model.js';
import { makeEvent } from './helpers/build.js';

const GROUPS8 = ['一部', '二部', '三部', '東區', '西區', '山', '海', '離島'];
const COUNTS = [11, 17, 11, 13, 6, 7, 8, 1];
function event74() {
  const ev = makeEvent({ people: 74 });
  let k = 0; COUNTS.forEach((c, gi) => { for (let i = 0; i < c; i++) ev.participants[k++].group = GROUPS8[gi]; });
  return ev;
}
const poolOf = (ev) => ev.participants.map(p => ({ id: p.id, weight: p.weight })).sort((a, b) => (a.id < b.id ? -1 : 1));

test('轉盤直徑公式符合 C.3 表', () => {
  assert.equal(wheelDiameter({ width: 1920, height: 1080, projection: true }), 892);
  assert.equal(wheelDiameter({ width: 1920, height: 1080, projection: false, sidebar: true }), 811);
  assert.equal(wheelDiameter({ width: 1280, height: 720, projection: true }), 561);
  assert.equal(wheelDiameter({ width: 1280, height: 720, projection: false, sidebar: true }), 480);
  assert.equal(wheelDiameter({ width: 1024, height: 768, projection: true }), 605);
  assert.equal(wheelDiameter({ width: 1024, height: 768, projection: false, sidebar: true }), 524);
});

test('74 人 1080p 投影 → compact、字 14 px、落點距分隔線 ≥ 9 px', () => {
  const ev = event74(); const pool = poolOf(ev);
  const d = decideWheel(pool, ev.settings, 892);
  assert.equal(d.mode, 'compact'); assert.equal(d.fontPx, 14); assert.equal(d.sectorBy, 'weight'); assert.equal(d.note, null);
  const b = buildSectors(pool, pool[5].id, ev, d);
  assert.equal(b.sectors.length, 74);
  const R = 446;
  for (let i = 0; i < 200; i++) {
    const s = b.sectors[b.targetIndex];
    const land = landingAngle(s, 892);
    const distDeg = Math.min(land - s.startDeg, s.endDeg - land);
    assert.ok(distDeg * Math.PI / 180 * R >= 9, `dist ${distDeg}`);
  }
  // 依群組排序上色：同群組相鄰，顏色 = 群組序 % 8
  const firstGroup = b.sectors.slice(0, 11).map(s => s.groupLabel);
  assert.ok(firstGroup.every(g => g === '一部'));
  assert.equal(b.sectors[0].colorIndex, 0);
});

test('北區籤數 ×2（總籤 87）→ 最小格字 12 px；某群組 ×3（總籤 100）→ 自動 equal', () => {
  const ev = event74(); const pool = poolOf(ev);
  const w2 = pool.map(c => ({ ...c, weight: ev.participants.find(p => p.id === c.id).group === '東區' ? 2 : 1 }));
  assert.equal(w2.reduce((s, c) => s + c.weight, 0), 87);
  const d2 = decideWheel(w2, ev.settings, 892);
  assert.equal(d2.mode, 'compact'); assert.equal(d2.sectorBy, 'weight'); assert.equal(d2.fontPx, 12);
  const w3 = pool.map(c => ({ ...c, weight: ev.participants.find(p => p.id === c.id).group === '東區' ? 3 : 1 }));
  assert.equal(w3.reduce((s, c) => s + c.weight, 0), 100);
  const d3 = decideWheel(w3, ev.settings, 892);
  assert.equal(d3.mode, 'compact'); assert.equal(d3.sectorBy, 'equal'); assert.equal(d3.note, 'equal-auto');
});

test('74 人 1024×768 投影（D=605）→ 自動 sampled 並附原因', () => {
  const ev = event74(); const pool = poolOf(ev);
  const D = wheelDiameter({ width: 1024, height: 768, projection: true });
  assert.ok(textArcPx(D, 360 / 74) < 20);
  const d = decideWheel(pool, ev.settings, D);
  assert.equal(d.mode, 'sampled'); assert.equal(d.note, 'sampled-auto');
  const b = buildSectors(pool, pool[3].id, ev, d);
  assert.equal(b.sectors.length, 36);
  assert.ok(b.sectors.some(s => s.participantId === pool[3].id));
  assert.equal(new Set(b.sectors.map(s => s.participantId)).size, 36);
});

test('模式門檻與 < 8 人重複排列、1 人跳過轉盤', () => {
  assert.equal(autoMode(48), 'full'); assert.equal(autoMode(49), 'compact'); assert.equal(autoMode(121), 'sampled'); assert.equal(autoMode(401), 'reel');
  const ev = makeEvent({ people: 3 }); const pool = poolOf(ev);
  const d = decideWheel(pool, ev.settings, 892);
  const b = buildSectors(pool, pool[1].id, ev, d);
  assert.ok(b.sectors.length >= 8);
  assert.equal(b.sectors[b.targetIndex].participantId, pool[1].id);
  const one = buildSectors(pool.slice(0, 1), pool[0].id, ev, d);
  assert.equal(one.skip, true);
});

test('easingPow：74 格 6 s ≈ 2.8；12 格 ≈ 1.8；Dsec < 2 固定 3；chain 3.6 s clamp', () => {
  const T74 = 1800, T12 = 1800;
  const p74 = easingPow(360 / 74, T74, 6); assert.ok(Math.abs(p74 - 2.79) < 0.05, String(p74));
  const p12 = easingPow(30, T12, 6); assert.ok(Math.abs(p12 - 1.8) < 0.1, String(p12));
  assert.equal(easingPow(30, 1800, 1.2), 3);
  assert.equal(easingPow(30, 1800, 1.99), 3);
  assert.equal(easingPow(360 / 74, 1800, 3.6), 3);
  const p12c = easingPow(30, 1800, 3.6); assert.ok(p12c >= 1.6 && p12c <= 3);
});

test('Dsec = 6 時最後 1 s 內指針越過 ≥ 2 條邊界；停點落在目標扇區', () => {
  for (const n of [12, 30, 74]) {
    const ev = makeEvent({ people: n }); const pool = poolOf(ev);
    const d = decideWheel(pool, { ...ev.settings, wheelMode: n > 48 ? 'compact' : 'full' }, 892);
    for (let k = 0; k < 30; k++) {
      const b = buildSectors(pool, pool[k % n].id, ev, d);
      const sp = planSpin(b.sectors, b.targetIndex, 892, 6000);
      assert.ok(boundariesCrossedInLast(b.sectors, sp.targetAngleDeg, 6, sp.easingPow, 1) >= 2);
      assert.equal(sectorAtPointer(b.sectors, sp.targetAngleDeg), b.targetIndex);
    }
  }
});

function lum(hex) {
  const c = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255).map(v => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}
test('8 色對 #0b1020 對比全部 ≥ 7:1（WCAG 公式）', () => {
  const bg = lum('#0b1020');
  for (const c of PALETTE) {
    const ratio = (lum(c) + 0.05) / (bg + 0.05);
    assert.ok(ratio >= 7, `${c} ${ratio.toFixed(2)}`);
  }
  // 舞台白字 ≥ 15:1
  assert.ok((1.05) / (bg + 0.05) >= 15);
});

test('揭曉分級：perDraw 1/3/5/9/30 → single/chain/wall(96)/wall(64,auto)/grid(2 頁)', () => {
  assert.equal(revealStyle(1).style, 'single');
  assert.equal(revealStyle(3).style, 'chain');
  const w5 = revealStyle(5); assert.equal(w5.style, 'wall'); assert.equal(w5.namePx, 96); assert.equal(w5.flip, 'manual');
  const w9 = revealStyle(9); assert.equal(w9.style, 'wall'); assert.equal(w9.namePx, 64); assert.equal(w9.flip, 'auto');
  const g = revealStyle(30); assert.equal(g.style, 'grid'); assert.equal(g.pages, 2);
  assert.equal(revealStyle(20).pages, 1);
  assert.equal(revealStyle(5, 'auto').flip, 'auto');
  assert.equal(revealStyle(9, 'manual').flip, 'manual');
  assert.equal(revealComplete(w5, { flipped: 4 }, 5), false);
  assert.equal(revealComplete(w5, { flipped: 5 }, 5), true);
  assert.equal(revealComplete(g, { page: 0 }, 30), false);
  assert.equal(revealComplete(g, { page: 1 }, 30), true);
});

test('settings 預設值', () => {
  const s = defaultSettings('classroom');
  assert.equal(s.rules.allowRepeatWinners, true); assert.equal(s.autoConfirmSeconds, 0); assert.equal(s.projectionMode, false);
});
