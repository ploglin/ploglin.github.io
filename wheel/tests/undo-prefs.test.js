// 設定模式復原（30 步）
import test from 'node:test';
import assert from 'node:assert/strict';
import { createUndo } from '../store/undo.js';
import { makeEvent } from './helpers/build.js';

test('undo / redo 多步、上限 30、新編輯清空 redo', () => {
  const ev = makeEvent({ people: 5 });
  const u = createUndo(30);
  const names = [];
  for (let i = 0; i < 35; i++) { u.push(ev); ev.name = 'n' + i; names.push(ev.name); }
  assert.equal(u.size, 30);
  assert.ok(u.undo(ev)); assert.equal(ev.name, 'n33');
  assert.ok(u.redo(ev)); assert.equal(ev.name, 'n34');
  u.undo(ev); u.push(ev); ev.name = 'x';
  assert.equal(u.canRedo(), false);
  // 批次排除後整批復原
  u.push(ev);
  ev.participants.forEach(p => { p.excluded = true; });
  u.undo(ev);
  assert.ok(ev.participants.every(p => !p.excluded));
});
