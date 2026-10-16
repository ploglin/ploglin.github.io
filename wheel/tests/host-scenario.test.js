// 情境「抽主持人」（D.2）：預設值、自動名額、記錄人與主持人不重複、作廢補抽、複製活動不多建
import test from 'node:test';
import assert from 'node:assert/strict';
import { SCENARIOS, defaultSettings, createEvent, createParticipant, hostPrizes, sortedPrizes, isBigPrize } from '../core/model.js';
import { performDraw, confirmBatch, voidDraws, planNextDraw, canRestore } from '../core/draw.js';
import { duplicateEvent } from '../store/backup.js';
import { fakeNames } from './fixtures/make-fixtures.js';

function hostEvent({ people = 12, withRecorder = true } = {}) {
  const ev = createEvent({ name: '例會', scenario: 'host', absentKeepsEligibility: true });
  fakeNames(people, 7).forEach(n => ev.participants.push(createParticipant({ name: n })));
  ev.prizes.push(...hostPrizes(withRecorder));
  return ev;
}

async function drawConfirm(ev, prizeId) {
  const r = await performDraw(ev, prizeId, { rehearsal: false });
  confirmBatch(ev, r.batchId);
  return r.records;
}

test('host 情境預設值', () => {
  const s = SCENARIOS.host;
  assert.equal(s.label, '抽主持人');
  const d = defaultSettings('host');
  assert.equal(d.rules.allowRepeatWinners, false);
  assert.equal(d.autoConfirmSeconds, null);
  assert.equal(d.projectionMode, true);
  assert.equal(d.armBigPrizes, 1);
  assert.equal(d.revealFlip, 'byCount');
  assert.equal(d.sound.enabled, true);
  assert.equal(d.confetti, true);
  assert.equal(d.spinDurationMs, 8000);
  // createEvent 本身不建獎項（複製活動也走這裡）
  assert.equal(createEvent({ scenario: 'host' }).prizes.length, 0);
});

test('hostPrizes：勾記錄人 → 記錄人、主持人（主持人最後且為兩段式）；不勾 → 只有主持人', () => {
  const a = hostPrizes(true);
  assert.deepEqual(a.map(p => [p.name, p.quantity, p.perDraw, p.order]), [['記錄人', 1, 1, 1], ['主持人', 1, 1, 2]]);
  const b = hostPrizes(false);
  assert.deepEqual(b.map(p => [p.name, p.quantity, p.perDraw, p.order]), [['主持人', 1, 1, 1]]);
  const ev = hostEvent();
  const last = sortedPrizes(ev).at(-1);
  assert.equal(last.name, '主持人');
  assert.equal(isBigPrize(ev, last.id), true);
  assert.equal(isBigPrize(ev, sortedPrizes(ev)[0].id), false);
});

test('記錄人＋主持人：兩人必不同（200 次）', async () => {
  for (let k = 0; k < 200; k++) {
    const ev = hostEvent({ people: 3 });
    const [rec, host] = sortedPrizes(ev);
    const a = (await drawConfirm(ev, rec.id))[0];
    const b = (await drawConfirm(ev, host.id))[0];
    assert.notEqual(a.participantId, b.participantId);
  }
});

test('記錄人作廢後補抽，不會抽到已是主持人的人；被作廢的記錄人若已成主持人則不可恢復（won-elsewhere）', async () => {
  for (let k = 0; k < 100; k++) {
    const ev = hostEvent({ people: 3 });
    const [rec, host] = sortedPrizes(ev);
    const a = (await drawConfirm(ev, rec.id))[0];
    const b = (await drawConfirm(ev, host.id))[0];
    voidDraws(ev, [a.id], { reason: 'absent' });
    assert.equal(planNextDraw(ev, rec.id).kind, 'redraw');
    const c = (await drawConfirm(ev, rec.id))[0];
    assert.notEqual(c.participantId, b.participantId);
    assert.equal(c.redrawOf, a.id);
  }
  // 只有 2 人：記錄人 A、主持人 B；A 作廢後 → 補抽候選池空（不會抽到 B）
  const ev = hostEvent({ people: 2 });
  const [rec, host] = sortedPrizes(ev);
  const a = (await drawConfirm(ev, rec.id))[0];
  await drawConfirm(ev, host.id);
  voidDraws(ev, [a.id], { reason: 'absent' });
  await assert.rejects(performDraw(ev, rec.id, { rehearsal: false }), /empty-pool/);
  // 記錄人 X 先作廢、之後抽主持人：若 X 當上主持人，恢復 X 的記錄人紀錄會撞 won-elsewhere
  const ev2 = hostEvent({ people: 2 });
  const [rec2, host2] = sortedPrizes(ev2);
  const x = (await drawConfirm(ev2, rec2.id))[0];
  voidDraws(ev2, [x.id], { reason: 'absent' });
  const y = (await drawConfirm(ev2, host2.id))[0];
  if (y.participantId === x.participantId) assert.deepEqual(canRestore(ev2, x.id), { ok: false, why: 'won-elsewhere' });
  else assert.equal(canRestore(ev2, x.id).ok, true);
});

test('複製活動（backup.js）不會多出獎項', () => {
  const ev = hostEvent();
  const full = duplicateEvent(ev);
  assert.deepEqual(full.prizes.map(p => p.name), ['記錄人', '主持人']);
  const roster = duplicateEvent(ev, { rosterOnly: true });
  assert.equal(roster.scenario, 'host');
  assert.equal(roster.prizes.length, 0);
  const one = duplicateEvent(hostEvent({ withRecorder: false }));
  assert.deepEqual(one.prizes.map(p => p.name), ['主持人']);
});
