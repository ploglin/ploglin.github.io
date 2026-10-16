// F.1-6 輸入模型、C.5 狀態機
import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveKey, COOLDOWN_MS, canTransition, phaseAfterConfirm, canToggleRehearsal } from '../core/state.js';

const base = { phase: 'idle', overlay: null, cardSelect: false, clickerMode: false, rehearsal: false, revealDone: false, hasLastConfirmed: false, fullscreen: false, now: 10000, phaseAt: 0, hotkeys: true };
const K = (key, extra = {}) => ({ key, code: key === ' ' ? 'Space' : '', shiftKey: false, ctrlKey: false, metaKey: false, altKey: false, repeat: false, inInput: false, ...extra });
const A = (ctx, ev) => resolveKey({ ...base, ...ctx }, ev).action;

test('按住 Space：repeat 事件全部忽略（只觸發一次）', () => {
  assert.equal(A({}, K(' ')), 'spin');
  for (let i = 0; i < 30; i++) {
    const r = resolveKey(base, K(' ', { repeat: true }));
    assert.equal(r.action, null); assert.equal(r.prevent, true);
  }
});

test('phase 轉換後 600 ms 內 Space / Enter 被忽略', () => {
  assert.equal(A({ now: 1000 + COOLDOWN_MS - 1, phaseAt: 1000 }, K(' ')), null);
  assert.equal(A({ now: 1000 + COOLDOWN_MS, phaseAt: 1000 }, K(' ')), 'spin');
  assert.equal(A({ phase: 'reveal', revealDone: true, now: 1200, phaseAt: 1000 }, K('Enter')), null);
  assert.equal(A({ phase: 'reveal', revealDone: true, now: 1700, phaseAt: 1000 }, K('Enter')), 'confirm');
});

test('Space 與 Enter 分工：揭曉中 Space 不確認；Enter 只在翻完後', () => {
  assert.equal(A({ phase: 'reveal', revealDone: true }, K(' ')), null);
  assert.equal(A({ phase: 'reveal', revealDone: false }, K(' ')), 'advance');
  assert.equal(A({ phase: 'reveal', revealDone: false }, K('Enter')), null);
  assert.equal(A({ phase: 'idle' }, K('Enter')), null);
  assert.equal(A({ phase: 'prize_done' }, K(' ')), 'next');
  assert.equal(A({ phase: 'armed' }, K(' ')), 'spin');
  assert.equal(A({ phase: 'prize_intro' }, K(' ')), null);
});

test('Esc 在 spinning 無效；armed 非全螢幕可取消、全螢幕不綁', () => {
  assert.equal(A({ phase: 'spinning' }, K('Escape')), null);
  assert.equal(A({ phase: 'armed' }, K('Escape')), 'disarm');
  assert.equal(A({ phase: 'armed', fullscreen: true }, K('Escape')), null);
});

test('← → PageUp 無效（不切獎項）；方向鍵只在選卡模式移動', () => {
  for (const k of ['ArrowLeft', 'ArrowRight', 'PageUp', 'ArrowUp', 'ArrowDown']) assert.equal(A({}, K(k)), null);
  assert.equal(A({ phase: 'reveal', cardSelect: true }, K('ArrowRight')), 'card.move');
  assert.equal(A({ phase: 'reveal', cardSelect: true }, K(' ')), 'card.toggle');
  assert.equal(A({ phase: 'reveal', cardSelect: true }, K('Enter')), 'card.void');
  assert.equal(A({ phase: 'reveal', cardSelect: true }, K('Escape')), 'card.exit');
  assert.equal(A({ overlay: 'batch_recall' }, K('ArrowDown')), 'card.move');
});

test('clickerMode：PageDown 開轉、F5/Shift+F5/. 攔下、單按 B 無作用、Shift+B 加碼', () => {
  const c = { clickerMode: true };
  assert.equal(A(c, K('PageDown')), 'spin');
  for (const ev of [K('F5'), K('F5', { shiftKey: true }), K('.'), K('PageUp')]) {
    const r = resolveKey({ ...base, ...c }, ev); assert.equal(r.action, null); assert.equal(r.prevent, true);
  }
  assert.equal(A(c, K('b')), null);
  assert.equal(A(c, K('B', { shiftKey: true })), 'bonus');
  // 非簡報筆模式：B 與 Shift+B 都可；PageDown 不開轉、F5 不攔
  assert.equal(A({}, K('b')), 'bonus');
  assert.equal(A({}, K('B', { shiftKey: true })), 'bonus');
  assert.equal(A({}, K('PageDown')), null);
  assert.equal(resolveKey(base, K('F5')).prevent, false);
});

test('V：揭曉中進選卡；其他 phase 需有最後確認那批', () => {
  assert.equal(A({ phase: 'reveal' }, K('v')), 'void.select');
  for (const ph of ['idle', 'prize_done', 'all_done', 'prize_intro']) {
    assert.equal(A({ phase: ph, hasLastConfirmed: true }, K('v')), 'void.last');
    assert.equal(A({ phase: ph, hasLastConfirmed: false }, K('v')), null);
  }
  assert.equal(A({ phase: 'spinning', hasLastConfirmed: true }, K('v')), null);
});

test('各鍵有效 phase（鍵位總表）', () => {
  assert.equal(A({ phase: 'idle' }, K('r')), 'recent');
  assert.equal(A({ phase: 'reveal' }, K('r')), null);
  assert.equal(A({ phase: 'armed' }, K('p')), 'prizeMenu');
  assert.equal(A({ phase: 'spinning' }, K('p')), null);
  assert.equal(A({ phase: 'spinning' }, K('b')), null);
  assert.equal(A({ phase: 'reveal' }, K('b')), null);
  assert.equal(A({ phase: 'armed' }, K('b')), null);
  assert.equal(A({ phase: 'idle' }, K('l')), 'quickList');
  assert.equal(A({ phase: 'all_done' }, K('l')), null);
  assert.equal(A({ phase: 'spinning', rehearsal: true }, K('s')), 'skip');
  assert.equal(A({ phase: 'spinning', rehearsal: false }, K('s')), null);
  assert.equal(A({ phase: 'spinning' }, K('h')), 'toggleControls');
  assert.equal(A({ phase: 'spinning' }, K('f')), 'fullscreen');
  assert.equal(A({ phase: 'spinning' }, K('m')), 'mute');
  assert.equal(A({}, K('?')), 'help');
  assert.equal(resolveKey(base, K('z', { ctrlKey: true })).prevent, true);
});

test('浮層開著：只有 Esc、數字、上下、Enter、N 有效', () => {
  assert.equal(A({ overlay: 'void' }, K('3')), 'void.reason');
  assert.equal(A({ overlay: 'void' }, K('n')), 'void.note');
  assert.equal(A({ overlay: 'void' }, K('Enter')), 'void.submit');
  assert.equal(A({ overlay: 'void' }, K(' ')), null);
  assert.equal(A({ overlay: 'void' }, K('Escape')), 'overlay.close');
  assert.equal(A({ overlay: 'recent' }, K('ArrowDown')), 'overlay.move');
  assert.equal(A({ overlay: 'recent' }, K('Enter')), 'overlay.enter');
  assert.equal(A({ overlay: 'recent' }, K('v')), null);
  assert.equal(A({ overlay: 'prize_menu' }, K('h')), null);
  // 焦點在輸入框：不攔；Esc 仍可關浮層
  assert.equal(resolveKey({ ...base, overlay: 'quick_list' }, K(' ', { inInput: true })).prevent, false);
  assert.equal(A({ overlay: 'quick_list' }, K('Escape', { inInput: true })), 'overlay.close');
});

test('狀態圖轉換表', () => {
  assert.ok(canTransition('idle', 'armed'));
  assert.ok(canTransition('armed', 'spinning'));
  assert.ok(canTransition('spinning', 'reveal'));
  assert.ok(!canTransition('spinning', 'idle'));
  assert.ok(canTransition('prize_done', 'idle'));
  assert.ok(canTransition('all_done', 'prize_intro'));
  assert.equal(phaseAfterConfirm(2, true), 'idle');
  assert.equal(phaseAfterConfirm(0, true), 'prize_done');
  assert.equal(phaseAfterConfirm(0, false), 'all_done');
  assert.ok(canToggleRehearsal('idle', false));
  assert.ok(!canToggleRehearsal('idle', true));
  assert.ok(!canToggleRehearsal('spinning', false));
});
