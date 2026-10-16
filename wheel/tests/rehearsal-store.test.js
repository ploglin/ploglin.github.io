// F.1-4（重新整理復原）、F.1-5（彩排：丟棄位元組相同、promote、可選起點、丟棄可還原）、持久化與自動備份
import test from 'node:test';
import assert from 'node:assert/strict';
import { createMemoryDB } from '../store/db.js';
import { createStore, LockedError } from '../store/store.js';
import * as ops from '../core/stage-ops.js';
import { sandboxDrawCount, sandboxDraws, canRestoreDiscarded } from '../core/rehearsal.js';
import { makeEvent } from './helpers/build.js';

async function setup(opts = {}) {
  const db = createMemoryDB();
  const ev = makeEvent({ people: 20, prizes: [{ name: '普獎', quantity: 3, perDraw: 1 }, { name: '頭獎', quantity: 1 }], ...opts });
  ev.settings.armBigPrizes = 0;
  await db.putEvent(ev);
  const store = createStore(db, opts.lockCheck ? { lockCheck: opts.lockCheck } : {});
  await store.open(ev.id);
  return { db, store, id: ev.id };
}

/** 在 store.event（彩排時 = 沙盒）上完成一次抽 + 確認 */
async function spinConfirm(store) {
  await store.commit(async (ev) => { if (ev.stage.phase === 'prize_intro') ops.introDone(ev); await ops.beginSpin(ev, { diameter: 892, rehearsal: store.rehearsal }); }, { target: 'active' });
  await store.commit((ev) => { ops.finishSpin(ev); ops.confirmReveal(ev); }, { target: 'active' });
}

test('彩排：開轉/作廢/補抽/加碼後 [丟棄] → events 位元組相同、status 仍 draft；丟棄的沙盒可還原', async () => {
  const { db, store, id } = await setup();
  const before = JSON.stringify(db._raw.events.get(id));
  await store.autoBackup();
  await store.startRehearsal();
  await store.commit((ev) => { ops.enterStage(ev); }, { target: 'active' });
  await spinConfirm(store);
  // 作廢已確認那筆 → 補抽
  await store.commit((ev) => { ops.voidConfirmed(ev, ops.lastConfirmedRecords(ev).map(r => r.id), 'absent'); }, { target: 'active' });
  await spinConfirm(store);
  await store.commit((ev) => { ops.applyBonus(ev, 'quota', { prizeId: ev.stage.currentPrizeId, delta: 2, reason: '老闆加碼' }); }, { target: 'active' });
  assert.equal(sandboxDrawCount(store.sandbox), 2);
  assert.equal(JSON.stringify(db._raw.events.get(id)), before, '彩排中正式 Event 一筆不動');
  await store.discardRehearsal();
  assert.equal(JSON.stringify(db._raw.events.get(id)), before);
  assert.equal(JSON.parse(before).status, 'draft');
  assert.equal(store.sandbox, null);
  assert.equal(await db.getMeta('rehearsal:' + id), null);
  // 丟棄前已存到 meta.discardedRehearsal（只留 1 份）→ 可還原
  const disc = await db.getMeta('discardedRehearsal');
  assert.equal(disc.eventId, id);
  assert.ok(canRestoreDiscarded(store.official, disc, null));
  assert.equal(await store.restoreDiscarded(id), true);
  assert.equal(sandboxDrawCount(store.sandbox), 2);
  assert.equal(await db.getMeta('discardedRehearsal'), null);
});

test('還原被拒：正式 Event 在丟棄後被改過', async () => {
  const { db, store, id } = await setup();
  await store.startRehearsal();
  await store.commit((ev) => { ops.enterStage(ev); }, { target: 'active' });
  await spinConfirm(store);
  await store.discardRehearsal();
  await store.commit((ev) => { ev.name = '改名'; });
  assert.equal(await store.restoreDiscarded(id), false);
  assert.ok(await db.getMeta('discardedRehearsal'));
});

test('沙盒無 draw 時丟棄：不留存 discardedRehearsal', async () => {
  const { db, store } = await setup();
  await store.startRehearsal();
  await store.discardRehearsal();
  assert.equal(await db.getMeta('discardedRehearsal'), null);
});

test('[轉為正式紀錄] → 正式 draws = 沙盒 draws、status live、log 含 rehearsal.promote、autoBackup 多一份', async () => {
  const { db, store, id } = await setup();
  await store.startRehearsal();
  await store.commit((ev) => { ops.enterStage(ev); }, { target: 'active' });
  await spinConfirm(store); await spinConfirm(store);
  const sbDraws = JSON.stringify(store.sandbox.event.draws);
  const backupsBefore = (await store.listBackups(id)).length;
  const next = await store.promoteRehearsal(0);
  assert.equal(JSON.stringify(next.draws), sbDraws);
  assert.equal(next.status, 'live');
  assert.ok(next.log.some(l => l.type === 'rehearsal.promote'));
  assert.equal((await store.listBackups(id)).length, backupsBefore + 1);
  const saved = await db.getEvent(id);
  assert.equal(saved.draws.length, 2);
  assert.equal(saved.stage.rehearsal, false);
  assert.equal(await db.getMeta('rehearsal:' + id), null);
});

test('promote 可選起點：從第 3 筆起才算正式，前 2 筆以 misclick 作廢後轉入', async () => {
  const { store } = await setup({ prizes: [{ name: '普獎', quantity: 5, perDraw: 1 }] });
  await store.startRehearsal();
  await store.commit((ev) => { ops.enterStage(ev); }, { target: 'active' });
  for (let i = 0; i < 4; i++) await spinConfirm(store);
  const list = sandboxDraws(store.sandbox);
  assert.equal(list.length, 4);
  const next = await store.promoteRehearsal(2);
  const bySeq = [...next.draws].sort((a, b) => a.seq - b.seq);
  assert.equal(bySeq[0].status, 'voided'); assert.equal(bySeq[0].void.reason, 'misclick'); assert.equal(bySeq[0].void.wasConfirmed, true);
  assert.equal(bySeq[1].status, 'voided');
  assert.equal(bySeq[2].status, 'confirmed'); assert.equal(bySeq[3].status, 'confirmed');
  const log = next.log.find(l => l.type === 'rehearsal.promote');
  assert.equal(log.payload.fromIndex, 2); assert.equal(log.payload.voidedBefore, 2);
});

test('live 活動中途彩排：沙盒含原正式 draws；promote 只計彩排期間新增；正式被他處改過 → 拒絕', async () => {
  const { store } = await setup({ prizes: [{ name: '普獎', quantity: 5, perDraw: 1 }] });
  await store.commit((ev) => { ops.enterStage(ev); }, { target: 'active' });
  await spinConfirm(store);
  assert.equal(store.official.status, 'live');
  await store.startRehearsal();
  await spinConfirm(store);
  assert.equal(sandboxDrawCount(store.sandbox), 1);
  assert.equal(store.sandbox.event.draws.length, 2);
  // 模擬另一分頁寫入正式 Event（應被雙分頁機制擋下；這裡驗證 promote 的最後防線）
  const off = await store.db.getEvent(store.official.id);
  off.updatedAt = new Date(Date.now() + 1000).toISOString();
  await store.db.putEvent(off);
  await assert.rejects(store.promoteRehearsal(0), /official-changed/);
});

test('彩排中重新整理：重新 open 讀回沙盒續演，draws 長度不變', async () => {
  const { db, store, id } = await setup();
  await store.startRehearsal();
  await store.commit((ev) => { ops.enterStage(ev); }, { target: 'active' });
  await spinConfirm(store);
  const n = store.sandbox.event.draws.length;
  const store2 = createStore(db);
  await store2.open(id);
  assert.ok(store2.rehearsal);
  assert.equal(store2.event.draws.length, n);
  assert.equal(store2.official.draws.length, 0);
});

test('轉動中重新整理：pending 已落地，復原後同一得獎者、帳本僅一筆', async () => {
  const { db, store, id } = await setup();
  await store.commit((ev) => { ops.enterStage(ev); ops.introDone(ev); }, { target: 'active' });
  await store.commit(async (ev) => { await ops.beginSpin(ev, { diameter: 892 }); }, { target: 'active' });
  const winner = store.event.draws[0].participantId;
  const store2 = createStore(db);
  await store2.open(id);
  let rec;
  await store2.commit((ev) => { rec = ops.enterStage(ev); }, { target: 'active' });
  assert.equal(rec.recover, 'spin');
  assert.ok(store2.event.stage.spin && store2.event.stage.spin.sectors.length);
  await store2.commit((ev) => { ops.finishSpin(ev); }, { target: 'active' });
  assert.equal(store2.event.draws.length, 1);
  assert.equal(store2.event.draws[0].participantId, winner);
});

test('自動備份保留 3 份；雙分頁鎖：被他處持有時寫正式 Event 拋 LockedError', async () => {
  const { store, id } = await setup();
  for (let i = 0; i < 5; i++) { await store.autoBackup(); await new Promise(r => setTimeout(r, 2)); }
  assert.equal((await store.listBackups(id)).length, 3);
  let locked = true;
  const { store: s2 } = await setup({ lockCheck: () => locked });
  await assert.rejects(s2.commit((ev) => { ev.name = 'x'; }), LockedError);
  locked = false;
  await s2.commit((ev) => { ev.name = 'x'; });
  assert.equal(s2.official.name, 'x');
});

test('防抖寫入：debounce 300 ms 後才落地；flush 立即落地', async () => {
  const { db, store, id } = await setup();
  await store.commit((ev) => { ev.name = '防抖'; }, { debounce: true });
  assert.notEqual((await db.getEvent(id)).name, '防抖');
  await store.flush();
  assert.equal((await db.getEvent(id)).name, '防抖');
});
