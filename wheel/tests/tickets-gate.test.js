// 籤數為贊助功能（DESIGN.md「籤數為贊助功能」）：解鎖碼比對、編輯／顯示判斷（core/unlock.js 純函式）。
// 注意：測試內不得出現真正的碼；比對邏輯用自製雜湊驗證。
import test from 'node:test';
import assert from 'node:assert/strict';
import { sha256Hex } from '../core/rng.js';
import { buildPool } from '../core/pool.js';
import { UNLOCK_HASH, parseUnlockHash, codeMatches, hasWeights, weightView, isPeopleRoute, leavesPeople } from '../core/unlock.js';
import { participantsCSV } from '../io/export.js';
import { applyImport } from '../io/mapping.js';
import { classifyAgainst } from '../core/dedupe.js';
import { createParticipant, addLog } from '../core/model.js';
import { makeEvent } from './helpers/build.js';

test('解鎖連結解析', () => {
  assert.equal(parseUnlockHash('#unlock=abc'), 'abc');
  assert.equal(parseUnlockHash('unlock=%E4%B8%AD%20x'), '中 x');
  assert.equal(parseUnlockHash('#unlock=%E0%A4%A'), '%E0%A4%A');   // 壞編碼保留原字串
  assert.equal(parseUnlockHash('#/'), null);
  assert.equal(parseUnlockHash('#/e/1/participants'), null);
  assert.equal(parseUnlockHash(''), null);
});

test('碼比對：SHA-256 hex 相等才算', async () => {
  assert.match(UNLOCK_HASH, /^[0-9a-f]{64}$/);
  const fake = 'test-code-not-real';
  const h = await sha256Hex(fake);
  assert.equal(await codeMatches(fake, h), true);
  assert.equal(await codeMatches(fake + 'x', h), false);
  assert.equal(await codeMatches('', h), false);
  assert.equal(await codeMatches('wrong'), false);
});

test('hasWeights：名單有人籤數 > 1', () => {
  const ev = makeEvent({ people: 5 });
  assert.equal(hasWeights(ev), false);
  assert.equal(hasWeights(null), false);
  assert.equal(hasWeights({}), false);
  ev.participants[2].weight = 2;
  assert.equal(hasWeights(ev), true);
});

test('weightView：編輯與顯示都只看解鎖（資料有籤數也不顯示）', () => {
  const ones = makeEvent({ people: 5 });
  const some = makeEvent({ people: 5 }); some.participants[0].weight = 3;
  assert.deepEqual(weightView(ones, false), { edit: false, show: false });
  assert.deepEqual(weightView(ones, true), { edit: true, show: true });
  assert.deepEqual(weightView(some, false), { edit: false, show: false });
  assert.deepEqual(weightView(some, true), { edit: true, show: true });
  assert.deepEqual(weightView(null, false), { edit: false, show: false });
});

test('leavesPeople：解鎖只給一次名單頁，離開即收回', () => {
  const people = { name: 'settings', id: 'a', tab: 'participants' };
  const home = { name: 'home' };
  const prizes = { name: 'settings', id: 'a', tab: 'prizes' };
  const otherPeople = { name: 'settings', id: 'b', tab: 'participants' };
  const stage = { name: 'stage', id: 'a' };
  assert.equal(isPeopleRoute(people), true);
  assert.equal(isPeopleRoute(prizes), false);
  assert.equal(isPeopleRoute(stage), false);
  assert.equal(leavesPeople(undefined, people), false);       // 首次載入
  assert.equal(leavesPeople(home, people), false);            // 解鎖後從首頁進名單：還沒用掉
  assert.equal(leavesPeople(home, prizes), false);            // 先去別頁不算
  assert.equal(leavesPeople(people, { ...people }), false);   // 同一名單頁重畫
  assert.equal(leavesPeople(people, prizes), true);
  assert.equal(leavesPeople(people, home), true);
  assert.equal(leavesPeople(people, otherPeople), true);
  assert.equal(leavesPeople(people, stage), true);
});

test('已設好的籤數不論是否解鎖都照樣生效（組池不看解鎖）', () => {
  const ev = makeEvent({ people: 10, prizes: [{ name: 'A', quantity: 1, perDraw: 1 }] });
  ev.participants[0].weight = 5;
  const pool = buildPool(ev, ev.prizes[0]);
  assert.equal(pool.find(c => c.id === ev.participants[0].id).weight, 5);
});

test('名單 CSV：weights:false 不輸出籤數欄；預設輸出', () => {
  const ev = makeEvent({ people: 3 });
  const head = (csv) => csv.split(/\r?\n/)[0].replace(/^﻿/, '');
  assert.ok(head(participantsCSV(ev)).includes('籤數'));
  assert.equal(head(participantsCSV(ev, { weights: false })), '姓名,群組,編號,排除,排除原因,標籤,備註');
});

test('匯入覆蓋：keepWeight 時保留原籤數（未解鎖不得靠匯入改動籤數）', () => {
  for (const keep of [true, false]) {
    const ev = makeEvent({ people: 3, groups: ['業務'] });
    const p = ev.participants[0];
    p.weight = 4;
    applyImport(ev, [{ name: p.name, group: p.group, weight: 1, excluded: false, flags: {} }], { conflict: 'overwrite', keepWeight: keep }, classifyAgainst, createParticipant, addLog);
    assert.equal(ev.participants[0].weight, keep ? 4 : 1);
  }
});
