// 資料模型：工廠、常數、情境預設與推導函式（DESIGN.md B 章）。
// 純函式模組：瀏覽器與 Node 測試共用，不碰 DOM。

export const SCHEMA_VERSION = 1;

/** 扇區 8 色（C.3，寫死；全部對 #0b1020 ≥ 7:1） */
export const PALETTE = ['#F9DC5C', '#F6A821', '#B79CF0', '#5ED3D1', '#7FB3F5', '#F4A0C8', '#F28B82', '#7BD389'];
export const STAGE_INK = '#0b1020';

export const VOID_REASONS = ['absent', 'declined', 'ineligible', 'duplicate', 'misclick', 'other'];
export const EXCLUDE_REASONS = ['probation', 'staff', 'manager', 'imported-zero', 'other'];

export function uuid() {
  const c = globalThis.crypto;
  if (c && c.randomUUID) return c.randomUUID();
  // 後備（極舊瀏覽器）：以 getRandomValues 組 v4
  const b = new Uint8Array(16); c.getRandomValues(b);
  b[6] = (b[6] & 0x0f) | 0x40; b[8] = (b[8] & 0x3f) | 0x80;
  const h = [...b].map(x => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

export function nowISO() { return new Date().toISOString(); }

export function clamp(v, lo, hi) { return Math.min(hi, Math.max(lo, v)); }

export function clampWeight(w) {
  const n = Math.round(Number(w));
  if (!Number.isFinite(n) || n < 1) return 1;
  return Math.min(1000, n);
}

export function deepClone(o) {
  if (typeof structuredClone === 'function') return structuredClone(o);
  return JSON.parse(JSON.stringify(o));
}

/** 情境預設（D.2 表） */
export const SCENARIOS = {
  banquet: { label: '尾牙', allowRepeat: false, autoConfirm: null, projection: true, arm: 2, flip: 'byCount', sound: true, confetti: true, spin: 6000 },
  stream: { label: '直播', allowRepeat: false, autoConfirm: null, projection: true, arm: 1, flip: 'auto', sound: true, confetti: true, spin: 5000 },
  classroom: { label: '課堂點名', allowRepeat: true, autoConfirm: 0, projection: false, arm: 0, flip: 'auto', sound: false, confetti: false, spin: 6000 },
  host: { label: '抽主持人', allowRepeat: false, autoConfirm: null, projection: true, arm: 1, flip: 'byCount', sound: true, confetti: true, spin: 8000 },
  custom: { label: '自訂', allowRepeat: false, autoConfirm: null, projection: true, arm: 2, flip: 'byCount', sound: true, confetti: true, spin: 6000 },
};

export function defaultSettings(scenario = 'banquet') {
  const s = SCENARIOS[scenario] || SCENARIOS.banquet;
  return {
    rules: { allowRepeatWinners: s.allowRepeat, absentKeepsEligibility: null },
    wheelMode: 'auto',
    wheelThresholds: { full: 48, compact: 120, sampled: 400 },
    sectorBy: 'weight',
    sampledSectors: 36,
    spinDurationMs: s.spin,
    revealFlip: s.flip,                 // 'byCount' | 'manual' | 'auto'（v1.3：補上「依人數」）
    revealShowGroup: true,
    revealShowCode: false,
    disambiguateSameName: true,
    autoConfirmSeconds: s.autoConfirm,
    waitCountdownSec: null,
    projectionMode: s.projection,
    clickerMode: false,
    armBigPrizes: s.arm,
    hotkeys: true,
    sound: { enabled: s.sound, tick: 0.6, fanfare: 0.8, drumroll: 0.7 },
    confetti: s.confetti,
    motion: 'system',
    stageTheme: 'midnight',
    stageTitle: '',
    theme: 'system',
    rngMode: 'csprng',
  };
}

export function defaultStage() {
  return {
    rehearsal: false,
    phase: 'prize_intro',
    overlay: null,
    currentPrizeId: null,
    currentBatchId: null,
    controlsVisible: false,
  };
}

export function createEvent({ name, date, scenario = 'banquet', absentKeepsEligibility = null } = {}) {
  const t = nowISO();
  const ev = {
    schemaVersion: SCHEMA_VERSION,
    id: uuid(),
    name: String(name || '').trim().slice(0, 60) || '未命名活動',
    scenario,
    createdAt: t,
    updatedAt: t,
    status: 'draft',
    participants: [],
    prizes: [],
    draws: [],
    log: [],
    settings: defaultSettings(scenario),
    stage: defaultStage(),
    counters: { drawSeq: 0, batchSeq: 0 },
  };
  if (date) ev.date = date;
  if (absentKeepsEligibility === true || absentKeepsEligibility === false) ev.settings.rules.absentKeepsEligibility = absentKeepsEligibility;
  return ev;
}

export function createParticipant(f = {}) {
  const p = {
    id: f.id || uuid(),
    name: String(f.name || '').trim().slice(0, 40),
    weight: clampWeight(f.weight == null ? 1 : f.weight),
    excluded: !!f.excluded,
    createdAt: f.createdAt || nowISO(),
    source: f.source || 'manual',
  };
  if (f.group) p.group = String(f.group).trim();
  if (f.code) p.code = String(f.code).trim();
  if (p.excluded && f.excludeReason) p.excludeReason = f.excludeReason;
  if (f.excludeNote) p.excludeNote = f.excludeNote;
  if (f.tags && f.tags.length) p.tags = [...f.tags];
  if (f.note) p.note = f.note;
  if (f.extra && Object.keys(f.extra).length) p.extra = { ...f.extra };
  return p;
}

export function createPrize(f = {}, order = 1) {
  const quantity = Math.max(1, Math.round(Number(f.quantity) || 1));
  const perDraw = clamp(Math.round(Number(f.perDraw) || 1), 1, quantity);
  const pz = {
    id: f.id || uuid(),
    name: String(f.name || '').trim() || '未命名獎項',
    quantity,
    perDraw,
    order,
    eligibility: f.eligibility || { mode: 'all' },
    allowRepeatWinners: f.allowRepeatWinners === true || f.allowRepeatWinners === false ? f.allowRepeatWinners : null,
    isBonus: !!f.isBonus,
    bonusLog: [],
    status: 'pending',
    createdAt: nowISO(),
  };
  if (f.description) pz.description = f.description;
  return pz;
}

/**
 * 「抽主持人」情境建立活動時自動帶的名額（D.2）。只由建立活動對話框呼叫；
 * 不放進 createEvent()，因為複製活動（store/backup.js）與設定頁切換情境也會經過那裡。
 * 主持人排最後：armBigPrizes = 1 的兩段式落在主持人。
 */
export function hostPrizes(withRecorder = false) {
  const names = withRecorder ? ['記錄人', '主持人'] : ['主持人'];
  return names.map((name, i) => createPrize({ name, quantity: 1, perDraw: 1 }, i + 1));
}

/** 獎項範本（D.4 空狀態） */
export const PRIZE_TEMPLATE = [
  { name: '普獎', quantity: 8, perDraw: 8 },
  { name: '四獎', quantity: 5, perDraw: 1 },
  { name: '三獎', quantity: 3, perDraw: 3 },
  { name: '二獎', quantity: 2, perDraw: 1 },
  { name: '一獎', quantity: 1, perDraw: 1 },
  { name: '頭獎', quantity: 1, perDraw: 1 },
];

export function addLog(event, type, summary, payload, inStage = false) {
  const e = { at: nowISO(), type, inStage: !!inStage, rehearsal: false, summary };
  if (payload !== undefined) e.payload = payload;
  event.log.push(e);
  return e;
}

// ---------- 推導 ----------

export function sortedPrizes(event) { return [...event.prizes].sort((a, b) => a.order - b.order); }

export function renumberPrizes(event) { sortedPrizes(event).forEach((p, i) => { p.order = i + 1; }); }

export function prizeById(event, id) { return event.prizes.find(p => p.id === id) || null; }
export function participantById(event, id) { return event.participants.find(p => p.id === id) || null; }

export function prizeAllowRepeat(event, prize) {
  return prize.allowRepeatWinners == null ? !!event.settings.rules.allowRepeatWinners : !!prize.allowRepeatWinners;
}

export function drawsOfPrize(event, prizeId) { return event.draws.filter(d => d.prizeId === prizeId); }

export function prizeCounts(event, prize) {
  let confirmed = 0, pending = 0, voided = 0;
  for (const d of event.draws) {
    if (d.prizeId !== prize.id) continue;
    if (d.status === 'confirmed') confirmed++; else if (d.status === 'pending') pending++; else voided++;
  }
  return { confirmed, pending, voided, remaining: Math.max(0, prize.quantity - confirmed - pending) };
}

/** 作廢但尚未補抽的紀錄（主按鈕「補抽 N 名」的來源） */
export function unredrawnVoids(event, prizeId) {
  return event.draws.filter(d => d.prizeId === prizeId && d.status === 'voided' && d.void && !d.void.redrawnBy && !d.void.closed)
    .sort((a, b) => a.seq - b.seq);
}

/** 依 draws 推導 Prize.status 後快取（B.3） */
export function recomputePrizeStatuses(event) {
  for (const p of event.prizes) {
    const c = prizeCounts(event, p);
    if (c.confirmed >= p.quantity) p.status = 'done';
    else if (event.stage && event.stage.currentPrizeId === p.id) p.status = 'active';
    else if (p.status === 'skipped') p.status = 'skipped';
    else p.status = 'pending';
  }
}

/** 群組依第一次出現的順序（= 寬表欄序）排列；colorIndex = 序 % 8（G-20） */
export function groupOrder(event) {
  const seen = new Map();
  for (const p of event.participants) {
    const g = p.group || '';
    if (g && !seen.has(g)) seen.set(g, seen.size);
  }
  return seen;
}

export function groupColorIndex(event, group, cache) {
  const m = cache || groupOrder(event);
  return m.has(group) ? m.get(group) % PALETTE.length : -1;
}

/** 同名者（活動內）集合：normalize 後姓名出現 ≥ 2 次 */
export function sameNameSet(event) {
  const cnt = new Map();
  for (const p of event.participants) { const k = p.name.trim(); cnt.set(k, (cnt.get(k) || 0) + 1); }
  const s = new Set(); for (const [k, v] of cnt) if (v > 1) s.add(k);
  return s;
}

/** 顯示名稱：同名者加註群組（G-18）。snapshot 或 participant 皆可 */
export function displayName(event, who, dupSet) {
  if (!who) return '';
  const set = dupSet || sameNameSet(event);
  if (event.settings.disambiguateSameName !== false && who.group && set.has(who.name.trim())) return `${who.name}（${who.group}）`;
  return who.name;
}

/** 是否為大獎（最後 armBigPrizes 個獎項，依順序） */
export function isBigPrize(event, prizeId) {
  const n = event.settings.armBigPrizes || 0;
  if (!n) return false;
  const list = sortedPrizes(event);
  return list.slice(-n).some(p => p.id === prizeId);
}

export function hasOfficialDraws(event) { return event.draws.length > 0; }

export function eventSummary(event) {
  let quota = 0, done = 0;
  for (const p of event.prizes) { quota += p.quantity; done += prizeCounts(event, p).confirmed; }
  return { people: event.participants.length, prizes: event.prizes.length, quota, done };
}
