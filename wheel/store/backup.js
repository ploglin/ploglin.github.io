// 活動備份 JSON（B.6-1）：匯出、解析（含遷移與版本過新拒絕）、同 id 衝突偵測、複製
import { deepClone, uuid, nowISO, createEvent } from '../core/model.js';
import { migrateEvent, TooNewError } from '../core/migrations.js';

export const FORMAT = 'ploglin-wheel-event';
export const FORMAT_VERSION = 1;

export function makeBackup(event, assets = []) {
  return { format: FORMAT, formatVersion: FORMAT_VERSION, exportedAt: nowISO(), app: 'https://ploglin.cc/wheel/', event: deepClone(event), assets };
}

export function backupText(event) { return JSON.stringify(makeBackup(event), null, 2); }

/** 解析備份檔：回傳 { event }；錯誤：Error('bad-format') 或 TooNewError */
export function parseBackup(text) {
  let obj;
  try { obj = JSON.parse(text); } catch { throw new Error('bad-format'); }
  if (!obj || obj.format !== FORMAT || !obj.event) throw new Error('bad-format');
  if ((obj.formatVersion || 1) > FORMAT_VERSION) throw new TooNewError(obj.formatVersion);
  return { event: migrateEvent(obj.event), exportedAt: obj.exportedAt || null };
}

/** 同 id 衝突：回傳 null 或 { existing, backup } 供對話框顯示時間 */
export async function detectConflict(db, event) {
  const existing = await db.getEvent(event.id);
  return existing ? { existing, backup: event } : null;
}

/** 另存一份：換新 id（名單、獎項、紀錄原樣保留） */
export function asCopy(event, suffix = '（副本）') {
  const e = deepClone(event);
  e.id = uuid();
  e.name = (e.name + suffix).slice(0, 60);
  e.createdAt = e.updatedAt = nowISO();
  return e;
}

/** 複製活動：rosterOnly = 只帶名單（「複製名單建立新活動」） */
export function duplicateEvent(event, { rosterOnly = false } = {}) {
  if (!rosterOnly) {
    const e = asCopy(event);
    e.draws = []; e.log = []; e.status = 'draft';
    e.counters = { drawSeq: 0, batchSeq: 0 };
    e.stage = createEvent().stage;
    for (const p of e.prizes) { p.status = 'pending'; }
    return e;
  }
  const e = createEvent({ name: event.name + '（新）', scenario: event.scenario });
  e.participants = deepClone(event.participants).map(p => ({ ...p, id: uuid() }));
  return e;
}

/** 相對時間（「3 天前」） */
export function relTime(iso, now = Date.now()) {
  const s = Math.max(0, (now - new Date(iso).getTime()) / 1000);
  if (s < 60) return '剛剛';
  if (s < 3600) return `${Math.floor(s / 60)} 分鐘前`;
  if (s < 86400) return `${Math.floor(s / 3600)} 小時前`;
  return `${Math.floor(s / 86400)} 天前`;
}
