// 舞台流程：F.1-10（wall 作廢補抽填回 slot）、F.1-11（已確認者改為補抽）、F.1-12（大獎兩段式）、
// F.1-16（只用鍵盤抽完 3 個獎項：含作廢補抽、加碼）、C.4 候選不足
import test from 'node:test';
import assert from 'node:assert/strict';
import * as ops from '../core/stage-ops.js';
import { resolveKey } from '../core/state.js';
import { prizeCounts, prizeById } from '../core/model.js';
import { revealCards } from '../core/draw.js';
import { makeEvent, prizeNamed } from './helpers/build.js';

/** 以「按鍵 → 動作」驅動舞台（不含動畫），模擬 page-stage 的分派 */
async function press(ev, key, extra = {}) {
  const st = ev.stage;
  const ctx = {
    phase: st.phase, overlay: st.overlay, cardSelect: !!(st.cardSelect && st.cardSelect.active), clickerMode: ev.settings.clickerMode,
    rehearsal: false, revealDone: ops.isRevealDone(ev), hasLastConfirmed: ops.lastConfirmedRecords(ev).length > 0,
    fullscreen: false, now: 1e9, phaseAt: 0, hotkeys: true,
  };
  const r = resolveKey(ctx, { key, code: key === ' ' ? 'Space' : '', shiftKey: !!extra.shift, ctrlKey: false, metaKey: false, altKey: false, repeat: false, inInput: false });
  const a = r.action;
  switch (a) {
    case 'spin': {
      if (st.phase === 'idle') {
        const ia = ops.idleAction(ev);
        if (ia.kind === 'arm') { ops.arm(ev); return 'armed'; }
        if (ia.kind === 'none' || ia.kind === 'empty') return ia.kind;
      }
      await ops.beginSpin(ev, { diameter: 892, rehearsal: false });
      ops.finishSpin(ev);
      return 'reveal';
    }
    case 'advance': ops.advanceReveal(ev); return a;
    case 'confirm': return ops.confirmReveal(ev).phase;
    case 'next': ops.goNextPrize(ev); if (ev.stage.phase === 'prize_intro') ops.introDone(ev); return ev.stage.phase;
    case 'disarm': ops.disarm(ev); return a;
    case 'void.select': {
      const cards = revealCards(ev, st.currentBatchId).cards.filter(c => c.record.status === 'pending');
      st.cardSelect = { active: true, focus: 0, picked: [] };
      st._cards = cards;
      if (cards.length === 1) { st.cardSelect.picked = [0]; st.overlay = 'void'; st.cardSelect.active = false; }
      return a;
    }
    case 'card.move': st.cardSelect.focus = Math.min(st._cards.length - 1, st.cardSelect.focus + (key === 'ArrowRight' || key === 'ArrowDown' ? 1 : -1)); return a;
    case 'card.toggle': { const f = st.cardSelect.focus; const i = st.cardSelect.picked.indexOf(f); if (i >= 0) st.cardSelect.picked.splice(i, 1); else st.cardSelect.picked.push(f); return a; }
    case 'card.void': if (!st.cardSelect.picked.length) st.cardSelect.picked = [st.cardSelect.focus]; st.cardSelect.active = false; st.overlay = 'void'; return a;
    case 'void.last': {
      const recs = ops.lastConfirmedRecords(ev);
      st._cards = recs.map(r2 => ({ record: r2 }));
      st._confirmed = true;
      if (recs.length > 1) { st.overlay = 'batch_recall'; st.cardSelect = { active: false, focus: 0, picked: [] }; }
      else { st.cardSelect = { active: false, focus: 0, picked: [0] }; st.overlay = 'void'; }
      return a;
    }
    case 'void.submit': {
      const ids = st.cardSelect.picked.map(i => st._cards[i].record.id);
      st.overlay = null;
      if (st._confirmed) {
        st._confirmed = false;
        const r2 = ops.voidConfirmed(ev, ids, extra.reason || 'absent');
        if (r2.switchTo) ops.introDone(ev);
        return 'voided-confirmed';
      }
      ops.voidInReveal(ev, ids, extra.reason || 'absent');
      return 'voided';
    }
    case 'bonus': st.overlay = 'bonus'; return a;
    case 'overlay.close': st.overlay = null; return a;
    default: return a;
  }
}

test('F.1-10：wall 中 V 選第一張 → 作廢 → 虛線 → Enter → 補抽 1 名 → Space → 填回同 slot', async () => {
  const ev = makeEvent({ people: 20, prizes: [{ name: '三獎', quantity: 5, perDraw: 5 }] });
  ev.settings.armBigPrizes = 0;
  ops.enterStage(ev); ops.introDone(ev);
  assert.equal(await press(ev, ' '), 'reveal');
  assert.equal(ev.stage.reveal.style, 'wall');
  // 手動翻牌：翻完前 Enter 無效
  assert.equal(await press(ev, 'Enter'), null);
  for (let i = 0; i < 5; i++) await press(ev, ' ');
  assert.equal(ops.isRevealDone(ev), true);
  await press(ev, 'v');
  assert.equal(ev.stage.cardSelect.focus, 0);        // 預設選中第一張未作廢卡
  await press(ev, 'ArrowRight');                     // 移到第二張
  await press(ev, 'Enter');                          // 開作廢條
  assert.equal(ev.stage.overlay, 'void');
  const target = ev.stage._cards[1].record;
  assert.equal(await press(ev, 'Enter'), 'voided');  // 預設不在場
  assert.equal(target.status, 'voided'); assert.equal(target.void.reason, 'absent');
  assert.equal(ev.stage.reveal.pendingRedraw, 1);
  // 其餘 Enter 確認 → idle，主按鈕「補抽 1 名」
  assert.equal(await press(ev, 'Enter'), 'idle');
  const ia = ops.idleAction(ev);
  assert.equal(ia.kind, 'redraw'); assert.equal(ia.plan.n, 1);
  await press(ev, ' ');
  const cards = revealCards(ev, ev.stage.currentBatchId);
  assert.equal(cards.baseSize, 5);
  const fresh = cards.cards.find(c => c.fresh);
  assert.equal(fresh.slot, target.slot);
  assert.equal(fresh.record.redrawOf, target.id);
  assert.equal(target.void.redrawnBy, fresh.record.id);
  assert.equal(ev.stage.reveal.style, 'wall');
  await press(ev, ' ');                               // 翻開補抽那張
  assert.equal(await press(ev, 'Enter'), 'all_done');
  assert.equal(prizeCounts(ev, ev.prizes[0]).confirmed, 5);
});

test('F.1-11：名額 1 的獎確認後，prize_done 與 all_done 按 V 都能作廢並切回該獎；對其他獎開轉後 V 失效', async () => {
  const ev = makeEvent({ people: 10, prizes: [{ name: '甲', quantity: 1, perDraw: 1 }, { name: '乙', quantity: 1, perDraw: 1 }] });
  ev.settings.armBigPrizes = 0;
  ops.enterStage(ev); ops.introDone(ev);
  await press(ev, ' '); assert.equal(await press(ev, 'Enter'), 'prize_done');
  // prize_done 按 V
  assert.equal(await press(ev, 'v'), 'void.last');
  assert.equal(ev.stage.overlay, 'void');
  assert.equal(await press(ev, 'Enter'), 'voided-confirmed');
  assert.equal(ev.stage.phase, 'idle');
  assert.equal(ops.idleAction(ev).kind, 'redraw');
  const jia = prizeNamed(ev, '甲');
  assert.equal(jia.status, 'active');
  await press(ev, ' '); await press(ev, 'Enter');
  // 下一獎、抽完 → all_done
  assert.equal(await press(ev, ' '), 'idle');
  assert.equal(ev.stage.currentPrizeId, prizeNamed(ev, '乙').id);
  await press(ev, ' ');                       // 對「乙」開轉 → 甲的 lastConfirmed 清空
  assert.equal(ops.lastConfirmedRecords(ev)[0], undefined);
  assert.equal(await press(ev, 'Enter'), 'all_done');
  // all_done 按 V：作廢乙 → 切回乙（同獎、但 all_done 需過場）
  assert.equal(await press(ev, 'v'), 'void.last');
  await press(ev, 'Enter');
  assert.equal(ev.stage.currentPrizeId, prizeNamed(ev, '乙').id);
  assert.equal(ev.stage.phase, 'idle');
  assert.equal(ops.idleAction(ev).kind, 'redraw');
});

test('V 在 prize_intro：中斷介紹、切回前一獎', async () => {
  const ev = makeEvent({ people: 10, prizes: [{ name: '甲', quantity: 1 }, { name: '乙', quantity: 1 }] });
  ev.settings.armBigPrizes = 0;
  ops.enterStage(ev); ops.introDone(ev);
  await press(ev, ' '); await press(ev, 'Enter');
  ops.goNextPrize(ev);
  assert.equal(ev.stage.phase, 'prize_intro');
  assert.equal(await press(ev, 'v'), 'void.last');
  await press(ev, 'Enter');
  assert.equal(ev.stage.currentPrizeId, prizeNamed(ev, '甲').id);
});

test('多名批次在 idle / prize_done 按 V：先叫回那批卡片（batch_recall）再選卡', async () => {
  const ev = makeEvent({ people: 20, prizes: [{ name: '三獎', quantity: 3, perDraw: 3 }, { name: '頭獎', quantity: 1 }] });
  ev.settings.armBigPrizes = 0;
  ops.enterStage(ev); ops.introDone(ev);
  await press(ev, ' ');
  assert.equal(ev.stage.reveal.style, 'chain');
  assert.equal(await press(ev, 'Enter'), 'prize_done');
  await press(ev, 'v');
  assert.equal(ev.stage.overlay, 'batch_recall');
  await press(ev, 'ArrowDown'); await press(ev, ' ');      // 勾第二張
  await press(ev, 'Enter');                                // 開作廢條
  assert.equal(ev.stage.overlay, 'void');
  await press(ev, 'Enter');
  assert.equal(prizeCounts(ev, prizeNamed(ev, '三獎')).voided, 1);
  assert.equal(ev.stage.phase, 'idle');
});

test('F.1-12：大獎兩段式：第一次 Space armed、第二次開轉；P / Esc 取消；不自動逾時', async () => {
  const ev = makeEvent({ people: 10, prizes: [{ name: '普', quantity: 1 }, { name: '二獎', quantity: 1 }, { name: '頭獎', quantity: 1 }] });
  assert.equal(ev.settings.armBigPrizes, 2);
  ops.enterStage(ev); ops.introDone(ev);
  assert.equal(await press(ev, ' '), 'reveal');          // 普獎不需預備
  await press(ev, 'Enter'); await press(ev, ' ');       // 下一獎（倒數第 2）
  assert.equal(await press(ev, ' '), 'armed');
  assert.equal(ev.stage.phase, 'armed');
  assert.equal(await press(ev, 'Escape'), 'disarm');
  assert.equal(ev.stage.phase, 'idle');
  await press(ev, ' ');
  const r = resolveKey({ phase: 'armed', overlay: null, now: 1e9, phaseAt: 0 }, { key: 'p' });
  assert.equal(r.action, 'prizeMenu'); assert.equal(r.arg, 'disarm');
  assert.equal(await press(ev, ' '), 'reveal');
});

test('F.1-16：只用鍵盤抽完 3 個獎項（含一次作廢補抽、一次加碼）', async () => {
  const ev = makeEvent({ people: 30, prizes: [{ name: '普獎', quantity: 3, perDraw: 3 }, { name: '四獎', quantity: 1 }, { name: '頭獎', quantity: 1 }] });
  ev.settings.armBigPrizes = 1;
  ops.enterStage(ev); ops.introDone(ev);
  await press(ev, ' ');                               // chain 3 名
  await press(ev, 'v'); await press(ev, 'Enter'); await press(ev, 'Enter');   // 作廢第一張（不在場）
  assert.equal(await press(ev, 'Enter'), 'idle');     // 確認其餘
  await press(ev, ' ');                               // 補抽 1 名
  assert.equal(await press(ev, 'Enter'), 'prize_done');
  // 加碼：B → 套用 +2（浮層內 Enter 由 UI 執行）
  assert.equal(await press(ev, 'b'), 'bonus');
  ops.applyBonus(ev, 'quota', { prizeId: prizeNamed(ev, '普獎').id, delta: 2, reason: '老闆加碼' });
  ev.stage.overlay = null;
  assert.equal(ev.stage.phase, 'idle');
  assert.equal(prizeById(ev, prizeNamed(ev, '普獎').id).quantity, 5);
  await press(ev, ' ');                               // 2 名 → chain
  assert.equal(await press(ev, 'Enter'), 'prize_done');
  await press(ev, ' ');                               // 下一獎 四獎
  await press(ev, ' '); assert.equal(await press(ev, 'Enter'), 'prize_done');
  await press(ev, ' ');                               // 頭獎
  assert.equal(await press(ev, ' '), 'armed');
  await press(ev, ' ');
  assert.equal(await press(ev, 'Enter'), 'all_done');
  const confirmed = ev.draws.filter(d => d.status === 'confirmed');
  assert.equal(confirmed.length, 7);
  assert.equal(new Set(confirmed.map(d => d.participantId)).size, 7);
  assert.ok(ev.log.some(l => l.type === 'prize.bonus'));
});

test('候選不足：抽滿池內人數；候選 0 → empty', async () => {
  const ev = makeEvent({ people: 3, prizes: [{ name: '大', quantity: 5, perDraw: 5 }, { name: '空', quantity: 1 }] });
  ev.settings.armBigPrizes = 0;
  ops.enterStage(ev); ops.introDone(ev);
  const res = await ops.beginSpin(ev, { diameter: 892 });
  assert.equal(res.records.length, 3); assert.equal(res.shortfall, 2);
  ops.finishSpin(ev);
  for (let i = 0; i < 3; i++) ops.advanceReveal(ev);
  ops.confirmReveal(ev);
  ops.startPrizeIntro(ev, prizeNamed(ev, '空').id); ops.introDone(ev);
  assert.equal(ops.idleAction(ev).kind, 'empty');
});

test('加碼新增臨時獎項「現在就抽」→ prize_intro；all_done 加名額 → 切到該獎', async () => {
  const ev = makeEvent({ people: 10, prizes: [{ name: '甲', quantity: 1 }] });
  ev.settings.armBigPrizes = 0;
  ops.enterStage(ev); ops.introDone(ev);
  await press(ev, ' '); assert.equal(await press(ev, 'Enter'), 'all_done');
  const r = ops.applyBonus(ev, 'prize', { fields: { name: '董事長加碼獎', quantity: 2, perDraw: 1 }, when: 'now' });
  assert.equal(ev.stage.phase, 'prize_intro');
  assert.equal(ev.stage.currentPrizeId, r.intro);
  assert.ok(prizeById(ev, r.intro).isBonus);
  ops.introDone(ev); await press(ev, ' '); await press(ev, 'Enter'); await press(ev, ' '); await press(ev, 'Enter');
  assert.equal(ev.stage.phase, 'all_done');
  ops.applyBonus(ev, 'quota', { prizeId: prizeNamed(ev, '甲').id, delta: 1, reason: 'x' });
  assert.equal(ev.stage.phase, 'prize_intro');
  assert.equal(ev.stage.currentPrizeId, prizeNamed(ev, '甲').id);
});

test('重新整理復原：spinning → recover spin；reveal → 全展開', async () => {
  const ev = makeEvent({ people: 20, prizes: [{ name: 'w', quantity: 5, perDraw: 5 }] });
  ops.enterStage(ev); ops.introDone(ev);
  await ops.beginSpin(ev, { diameter: 892 });
  const copy = JSON.parse(JSON.stringify(ev));
  assert.equal(ops.enterStage(copy).recover, 'spin');
  ops.finishSpin(ev);
  const copy2 = JSON.parse(JSON.stringify(ev));
  assert.equal(ops.enterStage(copy2).recover, 'reveal');
  assert.equal(copy2.stage.reveal.flipped, 5);
  assert.equal(ops.isRevealDone(copy2), true);
});

test('wall 補抽後再作廢、再補抽：仍沿用原批版面（wall、無轉盤），audit 不記轉盤', async () => {
  const ev = makeEvent({ people: 20, prizes: [{ name: '三獎', quantity: 5, perDraw: 5 }] });
  ev.settings.armBigPrizes = 0;
  ops.enterStage(ev); ops.introDone(ev);
  await press(ev, ' ');
  for (let i = 0; i < 5; i++) await press(ev, ' ');
  await press(ev, 'v'); await press(ev, 'Enter'); await press(ev, 'Enter');   // 作廢第一張
  await press(ev, 'Enter');                                                   // 確認其餘 → idle
  await press(ev, ' ');                                                       // 第一次補抽
  await press(ev, ' ');                                                       // 翻開
  await press(ev, 'v');                                                       // 只剩一張 pending → 直接開作廢條
  assert.equal(await press(ev, 'Enter'), 'voided');
  assert.equal(ev.stage.phase, 'idle');                                       // 整批作廢 → 直接回 idle
  await press(ev, ' ');                                                       // 第二次補抽
  const cards = revealCards(ev, ev.stage.currentBatchId);
  assert.equal(cards.baseSize, 5);
  assert.equal(ev.stage.reveal.style, 'wall');
  const fresh = cards.cards.find(c => c.fresh).record;
  assert.equal(fresh.audit.wheelMode, 'none');
});
