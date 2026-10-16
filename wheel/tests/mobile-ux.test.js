// 手機版 UX 第一階段：掌上模式（舞台）與設定頁手機版面的純邏輯。
// 掌上模式只影響主持端這台手機的呈現：投影 / 觀眾視窗的欄數、字級、直徑、公開畫面模型都不能變。
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as ops from '../core/stage-ops.js';
import { wheelDiameter, INFO_H, HAND_INFO_H } from '../core/sectors.js';
import { GRID_PER_PAGE, revealStyle } from '../core/reveal-style.js';
import {
  cardColumns, handNamePx, handMainModel, barMainModel, handSecondaryItems, handHint, buildPublicView, mainAction, HANDHELD_QUERY,
} from '../ui/stage/logic.js';
import { barSideItems } from '../ui/stage/controls-bar.js';
import { recordColumns, recordMeta } from '../ui/records-model.js';
import { makeEvent } from './helpers/build.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('揭曉卡欄數：投影維持原規則；掌上模式 chain / wall ≤6 1 欄、7–12 2 欄、grid 2 欄', () => {
  // 投影（第三參數省略）與改版前相同
  assert.equal(cardColumns('single', 1), 1);
  assert.equal(cardColumns('chain', 3), 3);
  assert.equal(cardColumns('wall', 6), 3);
  assert.equal(cardColumns('wall', 12), 6);
  assert.equal(cardColumns('grid', 24), 6);
  // 掌上
  assert.equal(cardColumns('single', 1, true), 1);
  assert.equal(cardColumns('chain', 3, true), 1);
  for (const n of [4, 5, 6]) assert.equal(cardColumns('wall', n, true), 1, `wall ${n}`);
  for (const n of [7, 9, 12]) assert.equal(cardColumns('wall', n, true), 2, `wall ${n}`);
  assert.equal(cardColumns('grid', 24, true), 2);
  assert.equal(cardColumns('grid', 1, true), 1);
});

test('掌上模式字級：單人 72–96、其餘最小 28；375 寬下三字姓名放得下（3 人 chain、12 人 wall、grid）', () => {
  assert.deepEqual(handNamePx('single', 1), { max: 96, min: 72 });
  for (const [style, n] of [['chain', 3], ['wall', 6], ['wall', 12], ['grid', 24]]) assert.equal(handNamePx(style, n).min, 28);
  // 375 寬：揭曉區左右 12 px、卡片框 3 px、左右 padding 16 px、欄距 10 px
  const inner = (cols) => (375 - 24 - 10 * (cols - 1)) / cols - 6 - 32;
  const fits = (style, n) => 3 * handNamePx(style, n).max <= inner(cardColumns(style, n, true));
  assert.ok(fits('chain', 3), 'chain 3 人');
  assert.ok(fits('wall', 12), 'wall 12 人');
  assert.ok(fits('grid', 24), 'grid');
  assert.ok(3 * 96 * 1.06 <= 375 - 24 - 8 - 32, '單人卡 96 px（字距 .06em）');
});

test('掌上模式的 grid 維持每頁 24 張資料（翻頁與 revealComplete 不變，只改成可捲動 2 欄）', () => {
  assert.equal(GRID_PER_PAGE, 24);
  assert.equal(revealStyle(30).perPage, 24);
  assert.equal(revealStyle(30).pages, 2);
});

test('轉盤直徑：投影公式不變；掌上模式資訊列 64 px 另算', () => {
  assert.equal(INFO_H, 110);
  assert.equal(HAND_INFO_H, 64);
  assert.equal(wheelDiameter({ width: 1920, height: 1080, projection: true }), 892);
  assert.equal(wheelDiameter({ width: 375, height: 499, projection: true, infoH: HAND_INFO_H }), Math.floor(375 * 0.92));
  assert.equal(wheelDiameter({ width: 375, height: 400, projection: true, infoH: HAND_INFO_H }), Math.floor(336 * 0.92));
});

test('掌上模式判斷式：窄且觸控', () => {
  assert.equal(HANDHELD_QUERY, '(max-width: 700px) and (pointer: coarse)');
});

const S0 = { phase: 'idle', overlay: null, busy: false, now: 10000, phaseAt: 0, rehearsal: false, clickerMode: false, cardSelect: null };

test('掌上主鈕：沿用 barMainModel 的階段文案與 600 ms 冷卻；選卡模式改說「改為補抽 n 人」', () => {
  const ev = makeEvent({ people: 10, prizes: [{ name: '普獎', quantity: 3, perDraw: 1 }] });
  ops.enterStage(ev);
  const ma = mainAction(ev);
  const m = handMainModel(ma, { ...S0, phase: ev.stage.phase });
  assert.deepEqual(m, barMainModel(ma, { ...S0, phase: ev.stage.phase }));
  // 冷卻中不可按
  const cool = handMainModel(ma, { ...S0, phase: ev.stage.phase, now: 100, phaseAt: 0 });
  assert.equal(cool.disabled, true);
  // 選卡
  const cs0 = handMainModel(ma, { ...S0, phase: 'reveal', cardSelect: { picked: 0 } });
  assert.equal(cs0.label, '改為補抽 0 人');
  assert.equal(cs0.disabled, true);
  const cs2 = handMainModel(ma, { ...S0, phase: 'reveal', cardSelect: { picked: 2 } });
  assert.equal(cs2.label, '改為補抽 2 人');
  assert.equal(cs2.action, 'card.void');
  assert.equal(cs2.disabled, false);
});

test('掌上次要鈕依階段出現：揭曉＝作廢、30 秒內＝撤回、預備＝取消預備、選卡＝取消；浮層開著時停用', () => {
  const ids = (s) => handSecondaryItems(s).map(x => x.id);
  assert.deepEqual(ids({ phase: 'idle' }), []);
  assert.deepEqual(ids({ phase: 'reveal' }), ['void']);
  assert.deepEqual(ids({ phase: 'reveal', cardSelect: true }), ['cardExit']);
  assert.deepEqual(ids({ phase: 'prize_done', revoke: true }), ['revoke']);
  assert.deepEqual(ids({ phase: 'armed' }), ['disarm']);
  assert.ok(handSecondaryItems({ phase: 'reveal', overlay: 'void' }).every(x => x.disabled));
  assert.equal(handSecondaryItems({ phase: 'reveal' })[0].label, '作廢');
  assert.equal(handSecondaryItems({ phase: 'idle', revoke: true })[0].label, '撤回');
});

test('掌上提示不含鍵位文字', () => {
  const cases = [
    { phase: 'reveal', revealDone: false, style: 'wall' },
    { phase: 'reveal', revealDone: false, style: 'grid' },
    { phase: 'reveal', revealDone: true, style: 'wall' },
    { phase: 'reveal', cardSelect: true },
    { phase: 'reveal', autoLeft: 3 },
    { phase: 'reveal', shortfall: { got: 2, miss: 1 } },
  ];
  for (const c of cases) {
    const s = handHint(c);
    assert.ok(s, JSON.stringify(c));
    assert.ok(!/Space|Enter|Esc|PageDown|\bV\b/.test(s), s);
  }
  assert.equal(handHint({ phase: 'idle' }), '');
  assert.equal(handHint({ phase: 'idle', emptyText: '候選 0 人' }), '候選 0 人');
});

test('公開畫面模型不含掌上排法（觀眾視窗 / 投影不受影響）', () => {
  const ev = makeEvent({ people: 10, prizes: [{ name: '普獎', quantity: 3, perDraw: 1 }] });
  ops.enterStage(ev);
  const s = JSON.stringify(buildPublicView(ev, {}));
  for (const w of ['handheld', 'compact', 'hand']) assert.ok(!s.includes(w), w);
});

function fakeCtl(handheld) {
  return { handheld, store: { rehearsal: false }, ui: { cardSelect: null, overlay: null }, revokeVisible: () => false };
}

test('投影操作列：一般情況維持原樣；只有掌上模式（隱藏操作區時）才拿掉全螢幕 / 觀眾視窗 / 快捷鍵並加「顯示操作區」', () => {
  const ev = makeEvent({ people: 10, prizes: [{ name: '普獎', quantity: 3, perDraw: 1 }] });
  ops.enterStage(ev);
  const base = barSideItems(fakeCtl(false), ev).right.map(d => d.id || (d.gap ? 'gap' : 'note'));
  assert.deepEqual(base, ['fullscreen', 'screen', 'settings', 'help', 'gap', 'exit']);
  const hand = barSideItems(fakeCtl(true), ev).right.map(d => d.id || (d.gap ? 'gap' : 'note'));
  assert.deepEqual(hand, ['handDock', 'settings', 'exit']);
});

test('紀錄表欄位：編號欄位置依實際欄數（依時間多一欄獎項），colspan 不寫死', () => {
  assert.deepEqual(recordColumns(false), ['seq', 'winner', 'group', 'code', 'time', 'status', 'act']);
  assert.deepEqual(recordColumns(true), ['seq', 'prize', 'winner', 'group', 'code', 'time', 'status', 'act']);
  assert.equal(recordColumns(true).length, 8);
  // 依時間檢視：第 4 欄是群組、第 5 欄才是編號（舊的 nth-child(4) 會藏錯）
  assert.equal(recordColumns(true)[3], 'group');
  assert.equal(recordColumns(true).indexOf('code'), 4);
});

test('紀錄手機卡片第二行：依時間才帶獎項；空值略過', () => {
  const d = { snapshot: { name: '甲', group: '業務部', code: 'A01' } };
  assert.deepEqual(recordMeta(d, { showPrize: false, prizeName: '頭獎', time: '20:01:02' }), ['業務部', 'A01', '20:01:02']);
  assert.deepEqual(recordMeta(d, { showPrize: true, prizeName: '頭獎', time: '20:01:02' }), ['頭獎', '業務部', 'A01', '20:01:02']);
  assert.deepEqual(recordMeta({ snapshot: { name: '乙' } }, { showPrize: true, prizeName: '頭獎', time: '20:01:02' }), ['頭獎', '20:01:02']);
});

test('CSS：紀錄表不再用 nth-child 藏欄；手機規則都包在手機條件內', () => {
  const css = fs.readFileSync(path.join(ROOT, 'wheel.css'), 'utf8');
  assert.ok(!/wh-rec-table[^{]*nth-child/.test(css), '紀錄表仍用 nth-child 藏欄');
  const st = fs.readFileSync(path.join(ROOT, 'stage.css'), 'utf8');
  // 舞台掌上規則一律掛在 .is-handheld / 掌上作廢條 / 底部操作區自己的 class 底下
  const handBlock = st.slice(st.indexOf('掌上模式（.is-handheld'), st.indexOf('/* ---------- 動態'));
  const sels = handBlock.replace(/\/\*[\s\S]*?\*\//g, '').match(/^[^{}@]+(?=\{)/gm) || [];
  for (const sel of sels) {
    for (const part of sel.split(',')) {
      const p = part.trim();
      if (!p) continue;
      assert.ok(/is-handheld|ws-voidbar-hand|^\.ws-hand|^\.ws-vb-grid|^\.ws-vb-row/.test(p), `掌上區塊出現不限掌上的選擇器：${p}`);
    }
  }
});
