// B.5 遷移、B.6 匯出 / 匯入備份（同 id 衝突）、中獎名單 CSV、修改作廢原因 / 恢復 / 撤回加碼
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { migrateEvent, TooNewError } from '../core/migrations.js';
import { parseBackup, backupText, detectConflict, asCopy, duplicateEvent, relTime } from '../store/backup.js';
import { createMemoryDB } from '../store/db.js';
import { winnersCSV, participantsCSV, participantsWideCSV, auditCSV, fileName } from '../io/export.js';
import { planNextDraw, editVoid, restoreVoid, canRestore, addBonus, revertBonus, canRevertBonus, closeRemaining } from '../core/draw.js';
import { prizeCounts } from '../core/model.js';

const DIR = path.dirname(fileURLToPath(import.meta.url));
const fixture = () => fs.readFileSync(path.join(DIR, 'fixtures', 'event-v1.json'), 'utf8');

test('event-v1.json fixture 可解析、遷移後欄位齊全', () => {
  const { event } = parseBackup(fixture());
  assert.equal(event.schemaVersion, 1);
  assert.equal(event.participants.length, 12);
  assert.equal(event.draws.length, 3);
  assert.ok(event.settings.wheelThresholds && event.stage);
});

test('版本過新 → 拒絕（TooNewError）；格式錯誤 → bad-format', () => {
  const o = JSON.parse(fixture());
  o.event.schemaVersion = 99;
  assert.throws(() => parseBackup(JSON.stringify(o)), TooNewError);
  assert.throws(() => parseBackup('{"format":"x"}'), /bad-format/);
  assert.throws(() => parseBackup('not json'), /bad-format/);
  assert.throws(() => migrateEvent({ schemaVersion: 2 }), TooNewError);
});

test('缺欄位的舊資料：normalize 補齊、不覆蓋既有值', () => {
  const e = migrateEvent({ id: 'x', name: 'n', settings: { spinDurationMs: 8000 }, draws: [{ seq: 4 }] });
  assert.equal(e.settings.spinDurationMs, 8000);
  assert.equal(e.settings.wheelMode, 'auto');
  assert.equal(e.counters.drawSeq, 4);
  assert.deepEqual(e.participants, []);
});

test('匯入同 id：偵測衝突；另存一份換新 id', async () => {
  const db = createMemoryDB();
  const { event } = parseBackup(fixture());
  assert.equal(await detectConflict(db, event), null);
  await db.putEvent(event);
  const c = await detectConflict(db, event);
  assert.ok(c && c.existing.id === event.id);
  const cp = asCopy(event);
  assert.notEqual(cp.id, event.id);
  assert.equal(cp.draws.length, event.draws.length);
  const round = parseBackup(backupText(event));
  assert.deepEqual(round.event.draws, event.draws);
  const dup = duplicateEvent(event, { rosterOnly: true });
  assert.equal(dup.participants.length, 12); assert.equal(dup.draws.length, 0);
  assert.notEqual(dup.participants[0].id, event.participants[0].id);
  assert.equal(relTime(new Date(Date.now() - 3 * 86400e3).toISOString()), '3 天前');
});

test('中獎名單 CSV：BOM、表頭、作廢列預設不含、勾選含；補抽序號', () => {
  const { event } = parseBackup(fixture());
  const csv = winnersCSV(event);
  assert.ok(csv.startsWith('﻿序號,獎項,得獎者,群組,編號,狀態,抽出時間,確認時間,作廢原因,作廢備註,補抽序號'));
  const lines = csv.trim().split('\r\n');
  assert.equal(lines.length, 1 + 2);
  const all = winnersCSV(event, { includeVoided: true }).trim().split('\r\n');
  assert.equal(all.length, 1 + 3);
  assert.ok(all.some(l => l.includes('作廢') && l.includes('不在場')));
  assert.ok(participantsCSV(event).startsWith('﻿姓名,群組,編號,籤數,排除,排除原因,標籤,備註'));
  const wide = participantsWideCSV(event).replace('﻿', '').split('\r\n');
  assert.equal(wide[0], '一部,二部,三部');
  assert.ok(auditCSV(event).includes('poolHash'));
  assert.match(fileName(event, '', 'json'), /^wheel-範例尾牙-\d{8}-\d{4}\.json$/);
});

test('修改作廢原因 → void.reason 更新、log 含 draw.void.edit；恢復作廢條件', () => {
  const { event } = parseBackup(fixture());
  const v = event.draws.find(d => d.status === 'voided');
  editVoid(event, v.id, { reason: 'declined', note: '事後更正' });
  assert.equal(v.void.reason, 'declined'); assert.ok(v.void.editedAt);
  const log = event.log.find(l => l.type === 'draw.void.edit');
  assert.equal(log.payload.old.reason, 'absent'); assert.equal(log.payload.new.reason, 'declined');
  // 補抽筆已確認 → 不能恢復
  assert.equal(canRestore(event, v.id).ok, false);
  // 加名額後補抽仍有效 → 仍不能恢復（補抽筆生效中）
  addBonus(event, v.prizeId, 1, '測試');
  assert.equal(canRestore(event, v.id).why, 'redraw-active');
});

test('撤回加碼條件 quantity − n ≥ 已用名額；關閉剩餘名額', () => {
  const { event } = parseBackup(fixture());
  const pz = event.prizes[0];
  addBonus(event, pz.id, 2, '老闆加碼');
  assert.equal(pz.quantity, 4);
  assert.ok(canRevertBonus(event, pz.id, 0));
  revertBonus(event, pz.id, 0);
  assert.equal(pz.quantity, 2);
  assert.ok(event.log.some(l => l.type === 'bonus.revert'));
  const p2 = event.prizes[1];
  closeRemaining(event, p2.id);
  assert.equal(p2.status, 'skipped');
  assert.equal(planNextDraw(event, p2.id).kind, 'none');
});

test('恢復作廢：補抽筆也作廢、名額足 → 可恢復，補抽鏈不再要求補抽', async () => {
  const { event } = parseBackup(fixture());
  const v = event.draws.find(d => d.status === 'voided');
  const redraw = event.draws.find(d => d.id === v.void.redrawnBy);
  redraw.status = 'voided'; redraw.void = { reason: 'misclick', voidedAt: '', wasConfirmed: true };
  assert.equal(canRestore(event, v.id).ok, true);
  restoreVoid(event, v.id);
  assert.equal(v.status, 'confirmed');
  assert.ok(redraw.void.closed);
  assert.ok(event.log.some(l => l.type === 'draw.restore'));
});
