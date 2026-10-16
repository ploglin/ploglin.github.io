// F.1-3：加權抽選分布、批內不重複、候選池四類排除
import test from 'node:test';
import assert from 'node:assert/strict';
import { createCsprng, createSeededRng, unitFrom, sha256Hex } from '../core/rng.js';
import { pickOne, performDraw, confirmBatch, voidDraws } from '../core/draw.js';
import { buildPool, buildPoolDetailed, eligible, poolHash } from '../core/pool.js';
import { createEvent, createParticipant, createPrize } from '../core/model.js';
import { makeEvent } from './helpers/build.js';

test('unitFrom 範圍 [0,1)', () => {
  assert.equal(unitFrom(0, 0), 0);
  assert.ok(unitFrom(0xffffffff, 0xffffffff) < 1);
  const r = createCsprng();
  for (let i = 0; i < 1000; i++) { const x = r.next(); assert.ok(x.unit >= 0 && x.unit < 1); assert.match(x.hex, /^[0-9a-f]{16}$/); }
});

test('seeded：同 seed 同 drawSeq 結果相同、不同 drawSeq 不同', async () => {
  const a = await createSeededRng('abc', 1), b = await createSeededRng('abc', 1), c = await createSeededRng('abc', 2);
  const xa = a.next(), xb = b.next(), xc = c.next();
  assert.equal(xa.hex, xb.hex);
  assert.notEqual(xa.hex, xc.hex);
  assert.equal((await sha256Hex('abc')).slice(0, 8), 'ba7816bf');
});

test('籤數 1/2/7 三人抽 100,000 次比例 ±1%', () => {
  const pool = [{ id: 'a', weight: 1 }, { id: 'b', weight: 2 }, { id: 'c', weight: 7 }];
  const r = createCsprng(); const cnt = { a: 0, b: 0, c: 0 };
  const N = 100000;
  for (let i = 0; i < N; i++) cnt[pool[pickOne(pool, r.next().unit)].id]++;
  assert.ok(Math.abs(cnt.a / N - 0.1) < 0.01, `a=${cnt.a}`);
  assert.ok(Math.abs(cnt.b / N - 0.2) < 0.01, `b=${cnt.b}`);
  assert.ok(Math.abs(cnt.c / N - 0.7) < 0.01, `c=${cnt.c}`);
});

test('pickOne 邊界：unit 0 → 第一個；接近 1 → 最後一個；大池走二分', () => {
  const pool = Array.from({ length: 200 }, (_, i) => ({ id: 'p' + i, weight: 1 + (i % 3) }));
  assert.equal(pickOne(pool, 0), 0);
  assert.equal(pickOne(pool, 0.999999999), 199);
  assert.equal(pickOne([], 0.5), -1);
  // 二分與線性一致
  const total = pool.reduce((s, c) => s + c.weight, 0);
  for (let t = 0; t < total; t += 7) {
    const u = (t + 0.5) / total; let acc = 0, lin = -1;
    for (let i = 0; i < pool.length; i++) { acc += pool[i].weight; if (acc > Math.floor(u * total)) { lin = i; break; } }
    assert.equal(pickOne(pool, u), lin);
  }
});

test('perDraw=5 抽 10,000 批無批內重複', async () => {
  const ev = makeEvent({ people: 30, prizes: [{ name: '大批', quantity: 5, perDraw: 5 }] });
  const pz = ev.prizes[0];
  for (let k = 0; k < 10000; k++) {
    const r = await performDraw(ev, pz.id, { rehearsal: true });
    const ids = r.records.map(x => x.participantId);
    assert.equal(new Set(ids).size, 5);
    // 清掉這批，讓下一批從頭來
    ev.draws.length = 0;
  }
});

test('候選池：excluded / 資格不符 / 已得獎 / 未到場不保留 四類 0 次出現', async () => {
  const ev = createEvent({ name: 't' });
  const mk = (name, group, extra = {}) => { const p = createParticipant({ name, group, ...extra }); ev.participants.push(p); return p; };
  const ex = mk('甲甲', 'A', { excluded: true, excludeReason: 'staff' });
  const inel = mk('乙乙', 'B');
  const winner = mk('丙丙', 'A');
  const absent = mk('丁丁', 'A');
  const ok1 = mk('戊戊', 'A'); const ok2 = mk('己己', 'A');
  const p1 = createPrize({ name: '前獎', quantity: 3 }, 1);
  const p2 = createPrize({ name: '後獎', quantity: 1, eligibility: { mode: 'exclude', groups: ['B'] } }, 2);
  ev.prizes.push(p1, p2);
  ev.settings.rules.absentKeepsEligibility = false;
  const mkRec = (pid, prizeId, status, extra = {}) => ev.draws.push({ id: 'd' + ev.draws.length, seq: ev.draws.length + 1, batchId: 'b', slot: 0, prizeId, participantId: pid, snapshot: { name: '', weight: 1 }, status, drawnAt: '', audit: {}, ...extra });
  mkRec(winner.id, p1.id, 'confirmed');
  mkRec(absent.id, p1.id, 'voided', { void: { reason: 'absent', voidedAt: '', wasConfirmed: false } });
  const { pool, stats } = buildPoolDetailed(ev, p2);
  const ids = new Set(pool.map(c => c.id));
  assert.deepEqual([...ids].sort(), [ok1.id, ok2.id].sort());
  assert.equal(stats.excluded, 1); assert.equal(stats.ineligible, 1); assert.equal(stats.winners, 1); assert.equal(stats.absent, 1);
  // 大量抽：四類從未出現
  const bad = new Set([ex.id, inel.id, winner.id, absent.id]);
  for (let i = 0; i < 2000; i++) {
    const r = await performDraw(ev, p2.id, { rehearsal: true });
    assert.ok(!bad.has(r.records[0].participantId));
    ev.draws.pop();
  }
  // 保留資格時，未到場者回到池中（但同一獎項內不再抽到）
  ev.settings.rules.absentKeepsEligibility = true;
  assert.ok(buildPool(ev, p2).some(c => c.id === absent.id));
  assert.ok(!buildPool(ev, p1).some(c => c.id === absent.id));
});

test('eligible include/exclude 與 poolHash 決定性', async () => {
  assert.equal(eligible({ group: 'A' }, { mode: 'include', groups: ['A'] }), true);
  assert.equal(eligible({ group: 'B' }, { mode: 'include', groups: ['A'] }), false);
  assert.equal(eligible({ group: 'A', tags: ['x'] }, { mode: 'exclude', tags: ['x'] }), false);
  const h1 = await poolHash([{ id: 'a', weight: 1 }, { id: 'b', weight: 2 }]);
  const h2 = await poolHash([{ id: 'a', weight: 1 }, { id: 'b', weight: 2 }]);
  assert.equal(h1, h2); assert.equal(h1.length, 16);
});

test('performDraw 寫入 audit、seq 連號、draft→live 只在正式', async () => {
  const ev = makeEvent({ people: 12, prizes: [{ name: '獎', quantity: 3, perDraw: 3 }] });
  const r = await performDraw(ev, ev.prizes[0].id, { rehearsal: true, wheelMode: 'full' });
  assert.equal(ev.status, 'draft');
  assert.deepEqual(r.records.map(x => x.seq), [1, 2, 3]);
  assert.deepEqual(r.records.map(x => x.slot), [0, 1, 2]);
  for (const x of r.records) { assert.equal(x.status, 'pending'); assert.equal(x.audit.rngMode, 'csprng'); assert.equal(x.audit.poolHash.length, 16); }
  assert.deepEqual(r.records.map(x => x.audit.candidateCount), [12, 11, 10]);
  ev.draws.length = 0;
  await performDraw(ev, ev.prizes[0].id, { rehearsal: false });
  assert.equal(ev.status, 'live');
  assert.ok(ev.log.some(l => l.type === 'event.live'));
});

test('seeded 模式可復算：同 seed 兩個活動抽出相同結果', async () => {
  const a = makeEvent({ people: 20, prizes: [{ name: 'x', quantity: 3, perDraw: 3 }] });
  const b = JSON.parse(JSON.stringify(a));
  for (const e of [a, b]) { e.settings.rngMode = 'seeded'; e.settings.seed = 'demo-seed'; }
  const ra = await performDraw(a, a.prizes[0].id, { rehearsal: true });
  const rb = await performDraw(b, b.prizes[0].id, { rehearsal: true });
  assert.deepEqual(ra.records.map(x => x.participantId), rb.records.map(x => x.participantId));
  assert.equal(ra.records[0].audit.seed, 'demo-seed');
});

test('confirm / void 與名額', async () => {
  const ev = makeEvent({ people: 10, prizes: [{ name: 'x', quantity: 2, perDraw: 2 }] });
  const r = await performDraw(ev, ev.prizes[0].id, { rehearsal: true });
  voidDraws(ev, [r.records[0].id], { reason: 'absent' });
  confirmBatch(ev, r.batchId);
  assert.equal(r.records[0].status, 'voided');
  assert.equal(r.records[0].void.wasConfirmed, false);
  assert.equal(r.records[1].status, 'confirmed');
  assert.equal(ev.stage.lastConfirmed.batchId, r.batchId);
});
