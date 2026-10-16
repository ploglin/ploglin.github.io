// 彩排沙盒（C.8）：建立、續演、丟棄（保留最近 1 份可還原）、promote（可選起點）。純函式。
import { deepClone, nowISO, addLog, recomputePrizeStatuses } from './model.js';
import { voidDraws } from './draw.js';

/** 進入彩排：深拷貝正式 Event；baseUpdatedAt 用來確認正式 Event 在彩排期間未被改動 */
export function createSandbox(event) {
  const copy = deepClone(event);
  copy.stage = { ...copy.stage, rehearsal: true, overlay: null, phase: 'prize_intro', controlsVisible: false };
  delete copy.stage.spin; delete copy.stage.reveal; delete copy.stage.cardSelect;
  return { eventId: event.id, startedAt: nowISO(), baseUpdatedAt: event.updatedAt, baseDrawCount: event.draws.length, event: copy };
}

/** 沙盒中「彩排期間新增」的抽獎（live 活動中途彩排時，沙盒也含原本的正式 draws） */
export function sandboxDraws(sb) {
  const base = sb.baseDrawCount || 0;
  return [...sb.event.draws].sort((a, b) => a.seq - b.seq).slice(base);
}
export function sandboxDrawCount(sb) { return sb ? sandboxDraws(sb).length : 0; }
export function sandboxHasPending(sb) { return !!sb && sb.event.draws.some(d => d.status === 'pending'); }

/** 正式 Event 在彩排期間是否被改動過（被改動則不可 promote / 還原） */
export function officialChanged(official, sb) { return !official || official.updatedAt !== sb.baseUpdatedAt; }

/** 還原最近丟棄的彩排：條件 = 同活動、正式 Event 未變動、目前沒有其他沙盒 */
export function canRestoreDiscarded(official, discarded, currentSandbox) {
  if (!discarded || !official || discarded.eventId !== official.id) return false;
  if (currentSandbox) return false;
  return !officialChanged(official, discarded);
}

/** 彩排中的加碼數、名單異動數（promote log 與確認文案用） */
export function sandboxDiff(official, sb) {
  const ev = sb.event;
  const bonus = ev.prizes.reduce((s, p) => s + p.bonusLog.length, 0) - official.prizes.reduce((s, p) => s + p.bonusLog.length, 0)
    + ev.prizes.filter(p => p.isBonus && !official.prizes.some(o => o.id === p.id)).length;
  const offMap = new Map(official.participants.map(p => [p.id, p]));
  let roster = 0;
  for (const p of ev.participants) {
    const o = offMap.get(p.id);
    if (!o || o.excluded !== p.excluded || o.weight !== p.weight) roster++;
  }
  roster += official.participants.filter(o => !ev.participants.some(p => p.id === o.id)).length;
  return { draws: sandboxDrawCount(sb), bonus, roster };
}

/**
 * promote：以沙盒整份 Event 取代正式 Event。
 * fromIndex：沙盒抽獎（依 seq 排序、只算彩排期間新增的）從第幾筆（0 起）才算正式；
 *            之前的幾筆以 misclick 作廢後一併轉入留痕（v1.3）。
 * 回傳新的正式 Event（不修改輸入）。
 */
export function promote(official, sb, { fromIndex = 0 } = {}) {
  if (officialChanged(official, sb)) throw new Error('official-changed');
  if (sandboxHasPending(sb)) throw new Error('has-pending');
  const ev = deepClone(sb.event);
  const list = sandboxDraws({ ...sb, event: ev });
  const before = list.slice(0, Math.max(0, fromIndex)).filter(d => d.status !== 'voided');
  if (before.length) {
    voidDraws(ev, before.map(d => d.id), { reason: 'misclick', note: '彩排轉正式時未列入' });
  }
  const diff = sandboxDiff(official, sb);
  ev.stage = { ...ev.stage, rehearsal: false, overlay: null, phase: 'prize_intro' };
  delete ev.stage.spin; delete ev.stage.reveal; delete ev.stage.cardSelect; delete ev.stage.lastConfirmed;
  const wasDraft = ev.status === 'draft';
  if (wasDraft && list.length) {
    ev.status = 'live';
    addLog(ev, 'event.live', '彩排轉為正式紀錄', undefined, true);
  }
  addLog(ev, 'rehearsal.promote', `彩排轉為正式紀錄：${diff.draws} 筆抽獎${fromIndex > 0 ? `（前 ${fromIndex} 筆作廢）` : ''}`, {
    draws: diff.draws, bonus: diff.bonus, roster: diff.roster, startedAt: sb.startedAt, fromIndex, voidedBefore: before.length,
  }, true);
  ev.updatedAt = nowISO();
  recomputePrizeStatuses(ev);
  return ev;
}
