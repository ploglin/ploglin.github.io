// Schema 遷移（B.5）：載入與匯入共用。migrations[n] 把 schemaVersion n → n+1。
import { SCHEMA_VERSION, defaultSettings, defaultStage } from './model.js';

export const migrations = {
  // 例：1: (e) => { ...; e.schemaVersion = 2; return e; }
};

export class TooNewError extends Error {
  constructor(v) { super('schema-too-new'); this.version = v; }
}

/** 補齊缺漏欄位（舊備份或手改 JSON），不改既有值 */
export function normalizeEvent(e) {
  const d = defaultSettings(e.scenario || 'banquet');
  e.settings = e.settings || {};
  for (const k of Object.keys(d)) if (e.settings[k] === undefined) e.settings[k] = d[k];
  e.settings.rules = { ...d.rules, ...(e.settings.rules || {}) };
  e.settings.sound = { ...d.sound, ...(e.settings.sound || {}) };
  e.settings.wheelThresholds = { ...d.wheelThresholds, ...(e.settings.wheelThresholds || {}) };
  if (e.settings.revealFlip === 'auto-by-count') e.settings.revealFlip = 'byCount';
  e.stage = { ...defaultStage(), ...(e.stage || {}) };
  e.participants = e.participants || [];
  e.prizes = e.prizes || [];
  e.draws = e.draws || [];
  e.log = e.log || [];
  e.counters = e.counters || { drawSeq: e.draws.reduce((m, x) => Math.max(m, x.seq || 0), 0), batchSeq: 0 };
  for (const p of e.prizes) { p.bonusLog = p.bonusLog || []; if (!p.eligibility) p.eligibility = { mode: 'all' }; }
  return e;
}

export function migrateEvent(e) {
  if (!e || typeof e !== 'object') throw new Error('bad-event');
  let v = e.schemaVersion || 1;
  if (v > SCHEMA_VERSION) throw new TooNewError(v);
  while (v < SCHEMA_VERSION) {
    const m = migrations[v];
    if (!m) throw new Error('missing-migration-' + v);
    e = m(e); v = e.schemaVersion;
  }
  e.schemaVersion = SCHEMA_VERSION;
  return normalizeEvent(e);
}
