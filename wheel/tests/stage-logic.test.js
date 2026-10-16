// 舞台純邏輯（ui/stage/logic.js）：作廢條文字（D.7）、觀眾可見模型不外洩原因與稽核、主按鈕、時間軸、選卡移動。
import test from 'node:test';
import assert from 'node:assert/strict';
import * as ops from '../core/stage-ops.js';
import { resolveKey } from '../core/state.js';
import {
  t, voidBarModel, publicVoidLabel, spinTimeline, segmentAt, moveCardFocus, cardColumns,
  buildPublicView, mainAction, recentRows, wheelPreview, emptyPoolText, joinNames,
} from '../ui/stage/logic.js';
import S from '../ui/i18n-stage.js';
import { makeEvent } from './helpers/build.js';

test('作廢條：鏡像版不列原因文字，只換圈數字小代號；按非 1 的鍵後改為「原因已選」', () => {
  const m1 = voidBarModel({ mirror: true, confirmed: false, names: ['甲乙丙'], reason: 'absent' });
  assert.equal(m1.reasons, null);
  assert.equal(m1.title, '改為補抽：甲乙丙');
  assert.equal(m1.hint, '原因預設「不在場」，可在紀錄頁修改');
  assert.equal(m1.mark, '·①');
  const m3 = voidBarModel({ mirror: true, confirmed: false, names: ['甲乙丙'], reason: 'ineligible' });
  assert.equal(m3.hint, '原因已選');
  assert.equal(m3.mark, '·③');
  const all = JSON.stringify(m3);
  for (const w of ['不符資格', '棄權', '重複得獎', '誤觸']) assert.ok(!all.includes(w), `鏡像作廢條不得出現「${w}」`);
});

test('作廢條：延伸版列 1–6 原因並高亮所選；已確認者標題加註', () => {
  const m = voidBarModel({ mirror: false, confirmed: true, names: ['甲', '乙'], reason: 'declined', absentRule: true });
  assert.equal(m.title, '改為補抽（已確認）：甲、乙');
  assert.deepEqual(m.reasons.map(r => r.label), ['不在場', '棄權', '不符資格', '重複得獎', '誤觸', '其他']);
  assert.equal(m.reasons.find(r => r.selected).n, 2);
  assert.equal(m.rule, '未到場者保留後續資格 · 設定頁可改');
  assert.equal(joinNames(['a', 'b', 'c', 'd']), 'a 等 4 人');
});

test('觀眾卡片標籤：未到場／棄權 →「未到場・補抽」，其餘 →「補抽」', () => {
  assert.equal(publicVoidLabel('absent'), '未到場・補抽');
  assert.equal(publicVoidLabel('declined'), '未到場・補抽');
  for (const r of ['ineligible', 'duplicate', 'misclick', 'other']) assert.equal(publicVoidLabel(r), '補抽');
});

test('觀眾可見模型：作廢卡只帶公開標籤，不含原因、備註、稽核資料；名額只有「還有 N 名」', async () => {
  const ev = makeEvent({ people: 20, prizes: [{ name: '三獎', quantity: 5, perDraw: 5 }] });
  ev.settings.armBigPrizes = 0;
  ops.enterStage(ev); ops.introDone(ev);
  await ops.beginSpin(ev, { diameter: 892 });
  ops.finishSpin(ev);
  for (let i = 0; i < 5; i++) ops.advanceReveal(ev);
  const id = ev.draws[1].id;
  ops.voidInReveal(ev, [id], 'duplicate', '私人備註');
  const pv = buildPublicView(ev, { rehearsal: false });
  const s = JSON.stringify(pv);
  assert.ok(!s.includes('duplicate') && !s.includes('私人備註') && !s.includes('randomHex') && !s.includes('poolHash'));
  assert.ok(!s.includes('已抽'));
  const card = pv.reveal.cards.find(c => c.slot === ev.draws[1].slot);
  assert.equal(card.state, 'voided'); assert.equal(card.label, '補抽');
  assert.equal(pv.reveal.style, 'wall');
  assert.equal(pv.remaining, 1);
});

test('揭曉牆未翻卡只有「？？？」狀態（hidden，不帶姓名）', async () => {
  const ev = makeEvent({ people: 20, prizes: [{ name: '三獎', quantity: 5, perDraw: 5 }] });
  ev.settings.armBigPrizes = 0;
  ops.enterStage(ev); ops.introDone(ev);
  await ops.beginSpin(ev, { diameter: 892 });
  ops.finishSpin(ev);
  ops.advanceReveal(ev);
  const pv = buildPublicView(ev, {});
  assert.equal(pv.reveal.cards.filter(c => c.state === 'shown').length, 1);
  for (const c of pv.reveal.cards.filter(c => c.state === 'hidden')) assert.equal(c.name, undefined);
  assert.equal(pv.reveal.seqLabel, '第 1–5 抽');
});

test('主按鈕：開轉 / 預備 / 補抽 N 名 / 揭曉下一張 / 全部確認 / 下一獎', async () => {
  const ev = makeEvent({ people: 20, prizes: [{ name: '普獎', quantity: 4, perDraw: 4 }, { name: '頭獎', quantity: 1 }] });
  ev.settings.armBigPrizes = 1;
  ops.enterStage(ev); ops.introDone(ev);
  assert.equal(mainAction(ev).label, '開轉');
  await ops.beginSpin(ev, { diameter: 892 }); ops.finishSpin(ev);
  assert.equal(mainAction(ev).label, '揭曉下一張');
  for (let i = 0; i < 4; i++) ops.advanceReveal(ev);
  const m = mainAction(ev);
  assert.equal(m.label, '全部確認'); assert.equal(m.key, 'Enter');
  ops.voidInReveal(ev, [ev.draws[0].id], 'absent');
  ops.confirmReveal(ev);
  assert.equal(mainAction(ev).label, '補抽 1 名（普獎）');
  await ops.beginSpin(ev, { diameter: 892 }); ops.finishSpin(ev); ops.advanceReveal(ev); ops.confirmReveal(ev);
  assert.equal(mainAction(ev).label, '下一獎：頭獎');
  ops.goNextPrize(ev); ops.introDone(ev);
  assert.equal(mainAction(ev).label, '預備');
});

test('時間軸：single = 轉動 + 1.2 s；chain = 每人轉動 + 1.5 s；wall/grid = 洗牌 2 s（減少動態 0.6 s）', () => {
  assert.equal(spinTimeline({ style: 'single', spins: [{ durationMs: 6000 }] }).total, 7200);
  assert.equal(spinTimeline({ style: 'chain', spins: [{ durationMs: 3600 }, { durationMs: 3600 }, { skip: true }] }).total, 3600 * 2 + 1500 * 3);
  assert.equal(spinTimeline({ style: 'wall', spins: [] }).total, 2000);
  assert.equal(spinTimeline({ style: 'grid', spins: [], reduced: true }).total, 600);
  const tl = spinTimeline({ style: 'single', spins: [{ durationMs: 1000 }] });
  assert.equal(segmentAt(tl, 500).kind, 'spin');
  assert.equal(segmentAt(tl, 1500).kind, 'hold');
  assert.equal(segmentAt(tl, 5000).done, true);
});

test('選卡模式：方向鍵在可選卡之間移動，跳過已作廢；揭曉牆上下鍵換列', () => {
  const order = [0, 1, 2, 3, 4, 5];
  const sel = new Set([0, 2, 3, 4, 5]);
  const cols = cardColumns('wall', 6);
  assert.equal(cols, 3);
  assert.equal(moveCardFocus(order, sel, 0, 'ArrowRight', cols), 2);
  assert.equal(moveCardFocus(order, sel, 0, 'ArrowDown', cols), 3);
  assert.equal(moveCardFocus(order, sel, 3, 'ArrowUp', cols), 0);
  assert.equal(moveCardFocus(order, sel, 5, 'ArrowRight', cols), 5);
  assert.equal(moveCardFocus([0, 1, 2], new Set([0, 1, 2]), 0, 'ArrowDown', 3), 1);   // chain：上下鍵也是左右移動
});

test('輸入模型接線：揭曉中 Space 不確認、Esc 在 spinning 無效、clickerMode 單按 B 無作用而 Shift+B 加碼', () => {
  const base = { overlay: null, now: 1e9, phaseAt: 0, hotkeys: true };
  assert.equal(resolveKey({ ...base, phase: 'reveal', revealDone: true }, { key: ' ', code: 'Space' }).action, null);
  assert.equal(resolveKey({ ...base, phase: 'spinning' }, { key: 'Escape' }).action, null);
  assert.equal(resolveKey({ ...base, phase: 'idle', clickerMode: true }, { key: 'b' }).action, null);
  assert.equal(resolveKey({ ...base, phase: 'idle', clickerMode: true }, { key: 'B', shiftKey: true }).action, 'bonus');
  assert.equal(resolveKey({ ...base, phase: 'idle', clickerMode: true }, { key: 'PageDown' }).action, 'spin');
});

test('轉盤預覽：74 人 1080p 投影 → compact；只有 1 名候選時重複排列 8 格', () => {
  const groups = ['一部', '二部', '三部', '東區', '西區', '山', '海', '離島'];
  const ev = makeEvent({ people: 74, groups, prizes: [{ name: '甲', quantity: 1 }] });
  const wp = wheelPreview(ev, ev.prizes[0], 892, Math.random);
  assert.equal(wp.mode, 'compact'); assert.equal(wp.sectors.length, 74); assert.equal(wp.candidates, 74);
  const one = makeEvent({ people: 1, prizes: [{ name: '甲', quantity: 1 }] });
  const w1 = wheelPreview(one, one.prizes[0], 892, Math.random);
  assert.equal(w1.sectors.length, 8);
});

test('最近得獎與候選 0 文案：中性用詞、不含作廢原因', async () => {
  const ev = makeEvent({ people: 5, prizes: [{ name: '甲', quantity: 1 }, { name: '乙', quantity: 1 }] });
  ev.settings.armBigPrizes = 0;
  ops.enterStage(ev); ops.introDone(ev);
  await ops.beginSpin(ev, { diameter: 892 }); ops.finishSpin(ev); ops.confirmReveal(ev);
  ops.voidConfirmed(ev, [ev.draws[0].id], 'misclick');
  const rows = recentRows(ev);
  assert.equal(rows[0].statusText, '待補抽');
  assert.ok(!JSON.stringify(rows).includes('誤觸'));
  assert.equal(emptyPoolText({ winners: 3, excluded: 2, ineligible: 0, absent: 0, samePrize: 0, pending: 0 }), '候選 0 人（已得獎 3 · 排除 2）');
});

test('i18n-stage：t() 取值與插值；文案無驚嘆號、無「重抽」「權重」「不參加」', () => {
  assert.equal(t('stage.remaining', { n: 4 }), '還有 4 名');
  assert.equal(t('no.such.key'), 'no.such.key');
  const s = JSON.stringify(S);
  for (const w of ['重抽', '權重', '不參加', '！', '!']) assert.ok(!s.includes(w), w);
  assert.ok(s.includes('Shift+B'));
});
