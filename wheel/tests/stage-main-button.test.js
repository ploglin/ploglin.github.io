// 主動作按鈕（隱藏主按鈕 + 投影操作列主鈕）：文字必須對應實際動作。
// 舊做法是「點主鈕 = 模擬 Space / Enter」，選卡模式下 Enter 是作廢，於是寫著「全部確認」的按鈕會開出作廢條。
import test from 'node:test';
import assert from 'node:assert/strict';
import * as ops from '../core/stage-ops.js';
import { resolveKey, COOLDOWN_MS } from '../core/state.js';
import { mainAction, mainPressAction, mainActionAvailable, barMainModel, voidBarModel } from '../ui/stage/logic.js';
import { makeEvent } from './helpers/build.js';

const LATER = { now: 10_000, phaseAt: 0 };          // 冷卻已過
const base = (ev, x = {}) => ({ phase: ev.stage.phase, overlay: null, busy: false, rehearsal: false, clickerMode: false, cardSelect: null, ...LATER, ...x });

async function revealDoneEvent() {
  const ev = makeEvent({ people: 20, prizes: [{ name: '普獎', quantity: 4, perDraw: 4 }, { name: '頭獎', quantity: 1 }] });
  ev.settings.armBigPrizes = 0;
  ops.enterStage(ev); ops.introDone(ev);
  await ops.beginSpin(ev, { diameter: 892 }); ops.finishSpin(ev);
  while (!ops.isRevealDone(ev)) ops.advanceReveal(ev);
  return ev;
}

test('選卡模式下點主鈕不會開出作廢條（也不會確認）', async () => {
  const ev = await revealDoneEvent();
  const ma = mainAction(ev);
  assert.equal(ma.label, '全部確認');
  // 舊做法的成因：選卡模式下 Enter 被解析成作廢
  const k = { key: 'Enter', code: 'Enter', shiftKey: false, ctrlKey: false, metaKey: false, altKey: false, repeat: false, inInput: false };
  assert.equal(resolveKey({ phase: 'reveal', cardSelect: true, revealDone: true, ...LATER }, k).action, 'card.void');
  // 新做法：隱藏主鈕在選卡模式下不可用，點了什麼都不做
  const sel = base(ev, { cardSelect: { picked: 2 } });
  assert.equal(mainActionAvailable(sel), false);
  assert.equal(mainPressAction(ma, sel), null);
  // 操作列主位改成「作廢所選（N）」，文字與動作一致；沒勾任何卡時停用
  const m0 = barMainModel(ma, base(ev, { cardSelect: { picked: 0 } }));
  assert.deepEqual([m0.label, m0.action, m0.disabled], ['作廢所選（0）', 'card.void', true]);
  const m2 = barMainModel(ma, sel);
  assert.deepEqual([m2.label, m2.action, m2.disabled, m2.collapse], ['作廢所選（2）', 'card.void', false, false]);
  // 離開選卡：回到「全部確認」→ confirm，點完收起
  const mc = barMainModel(ma, base(ev));
  assert.deepEqual([mc.label, mc.action, mc.disabled, mc.tone, mc.collapse], ['全部確認', 'confirm', false, 'confirm', true]);
  assert.equal(mainPressAction(ma, base(ev)), 'confirm');
});

test('主鈕：浮層、寫入中、600 ms 冷卻內不可用', async () => {
  const ev = await revealDoneEvent();
  const ma = mainAction(ev);
  assert.equal(mainPressAction(ma, base(ev, { overlay: 'help' })), null);
  assert.equal(mainPressAction(ma, base(ev, { busy: true })), null);
  assert.equal(mainPressAction(ma, base(ev, { now: 1000, phaseAt: 1000 + 1 - COOLDOWN_MS })), null);
  assert.equal(barMainModel(ma, base(ev, { now: 1000, phaseAt: 1000 - 100 })).disabled, true);
  assert.equal(mainPressAction(ma, base(ev, { now: 1000, phaseAt: 1000 - COOLDOWN_MS })), 'confirm');
});

test('主鈕：依主動作種類直接對應動作；揭曉下一張不收起操作列', async () => {
  const ev = makeEvent({ people: 20, prizes: [{ name: '普獎', quantity: 4, perDraw: 4 }, { name: '頭獎', quantity: 1 }] });
  ev.settings.armBigPrizes = 1;
  ops.enterStage(ev);
  // 介紹中：一律「獎項介紹中」（不顯示獎名），停用但保留位置
  const intro = barMainModel(mainAction(ev), base(ev));
  assert.deepEqual([intro.label, intro.disabled, intro.action], ['獎項介紹中', true, null]);
  ops.introDone(ev);
  let m = barMainModel(mainAction(ev), base(ev));
  assert.deepEqual([m.label, m.action, m.collapse, m.title, m.keys], ['開轉', 'spin', true, '開轉（Space）', 'Space']);
  assert.ok(!m.label.includes('Space'), '主鈕文字不得含鍵位');
  const ck = barMainModel(mainAction(ev), base(ev, { clickerMode: true }));
  assert.deepEqual([ck.title, ck.keys], ['開轉（Space / PageDown）', 'Space PageDown']);
  await ops.beginSpin(ev, { diameter: 892 });
  // 轉動中：停用；彩排中改成可點的「跳過動畫」
  m = barMainModel(mainAction(ev), base(ev));
  assert.deepEqual([m.label, m.disabled], ['轉動中', true]);
  m = barMainModel(mainAction(ev), base(ev, { rehearsal: true }));
  assert.deepEqual([m.label, m.action, m.disabled, m.tone, m.title], ['跳過動畫', 'skip', false, 'secondary', '跳過動畫（S）']);
  ops.finishSpin(ev);
  m = barMainModel(mainAction(ev), base(ev));
  assert.deepEqual([m.label, m.action, m.collapse], ['揭曉下一張', 'advance', false]);
  while (!ops.isRevealDone(ev)) ops.advanceReveal(ev);
  ops.confirmReveal(ev);
  m = barMainModel(mainAction(ev), base(ev));
  assert.deepEqual([m.label, m.action, m.collapse], ['下一獎：頭獎', 'next', true]);
  ops.goNextPrize(ev); ops.introDone(ev);
  m = barMainModel(mainAction(ev), base(ev));
  assert.deepEqual([m.label, m.action, m.collapse], ['預備', 'spin', true]);   // 預備 = doSpin 的 idle→armed 分支
});

test('主鈕：全部抽完 → 停用「全部抽完」', () => {
  const ev = makeEvent({ people: 5, prizes: [{ name: '普獎', quantity: 1 }] });
  ev.stage.phase = 'all_done';
  const m = barMainModel(mainAction(ev), base(ev));
  assert.deepEqual([m.label, m.disabled, m.action], ['全部抽完', true, null]);
});

test('作廢條（投影）：條尾是「確定」「取消」按鈕，不出現鍵位文字', () => {
  const m = voidBarModel({ mirror: true, confirmed: false, names: ['甲'], reason: 'absent' });
  assert.equal(m.tail, null);
  assert.equal(m.submit, '確定');
  assert.equal(m.cancel, '取消');
  const all = JSON.stringify(m);
  for (const w of ['Enter', 'Esc']) assert.ok(!all.includes(w), `投影作廢條不得出現「${w}」`);
  // 延伸模式（主持畫面）照舊顯示鍵位
  assert.ok(voidBarModel({ mirror: false, confirmed: false, names: ['甲'] }).tail.includes('Enter'));
});
