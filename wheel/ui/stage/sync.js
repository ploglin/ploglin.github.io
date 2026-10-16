// 分頁協調（C.7-7、C.8 v1.3）：BroadcastChannel，不需後端。
// - 舞台分頁每 2 s 廣播「我持有活動 X 的舞台（彩排中與否）」
// - 其他分頁：同活動第二個舞台被擋（可「接手」，原分頁變唯讀）；
//   彩排期間其他分頁不得寫入正式 Event（store.lockCheck 依此拒寫）
// - 觀眾視窗（D.11）：BroadcastChannel('wheel:' + eventId)，見 createScreenChannel。

const CH = 'wheel-tabs';
const HEARTBEAT_MS = 2000;
const STALE_MS = 5000;

export function createTabSync() {
  const tabId = (globalThis.crypto && crypto.randomUUID) ? crypto.randomUUID() : String(Math.random());
  const bc = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel(CH) : null;
  const holders = new Map();          // eventId → { tabId, rehearsal, at }
  let mine = null;                    // { eventId, rehearsal }
  let hb = null;
  const listeners = new Set();
  const emit = (m) => { for (const f of listeners) { try { f(m); } catch (e) { console.error(e); } } };

  function post(msg) { if (bc) bc.postMessage({ ...msg, from: tabId }); }

  if (bc) bc.onmessage = (e) => {
    const m = e.data || {};
    if (m.from === tabId) return;
    if (m.type === 'hold') { holders.set(m.eventId, { tabId: m.from, rehearsal: !!m.rehearsal, at: Date.now() }); emit(m); }
    else if (m.type === 'release') { const h = holders.get(m.eventId); if (h && h.tabId === m.from) holders.delete(m.eventId); emit(m); }
    else if (m.type === 'takeover' && mine && mine.eventId === m.eventId) { emit({ type: 'taken', eventId: m.eventId }); api.release(); }
    else if (m.type === 'who' && mine && mine.eventId === m.eventId) post({ type: 'hold', eventId: mine.eventId, rehearsal: mine.rehearsal });
    else if (m.type === 'changed') emit(m);
  };

  const api = {
    tabId,
    available: !!bc,
    /** 其他分頁是否持有此活動的舞台 */
    heldElsewhere(eventId) {
      const h = holders.get(eventId);
      return !!(h && Date.now() - h.at < STALE_MS);
    },
    holderInfo(eventId) { return api.heldElsewhere(eventId) ? holders.get(eventId) : null; },
    /** 舞台進場前詢問：等一下讓其他分頁回應 */
    async probe(eventId, waitMs = 350) {
      post({ type: 'who', eventId });
      await new Promise(r => setTimeout(r, waitMs));
      return api.heldElsewhere(eventId);
    },
    hold(eventId, rehearsal) {
      mine = { eventId, rehearsal: !!rehearsal };
      post({ type: 'hold', eventId, rehearsal: !!rehearsal });
      clearInterval(hb);
      hb = setInterval(() => mine && post({ type: 'hold', eventId: mine.eventId, rehearsal: mine.rehearsal }), HEARTBEAT_MS);
    },
    setRehearsal(rehearsal) { if (mine) { mine.rehearsal = !!rehearsal; post({ type: 'hold', eventId: mine.eventId, rehearsal: mine.rehearsal }); } },
    release() {
      if (mine) post({ type: 'release', eventId: mine.eventId });
      mine = null; clearInterval(hb); hb = null;
    },
    takeover(eventId) { post({ type: 'takeover', eventId }); holders.delete(eventId); },
    /** 通知其他分頁：正式 Event 已變（讓設定頁重新讀取） */
    changed(eventId) { post({ type: 'changed', eventId }); },
    on(fn) { listeners.add(fn); return () => listeners.delete(fn); },
  };
  window.addEventListener('pagehide', () => api.release());
  return api;
}

/**
 * 觀眾視窗協定（D.11）：BroadcastChannel('wheel:' + eventId)
 *   主持端 → 觀眾：state {pv}（觀眾可見畫面模型，含 spin / reveal / 作廢灰卡 / 加碼橫幅 / 預備）、pong
 *   觀眾 → 主持端：hello、ping（每 2 s）、key {key, code, shift}、ready（觀眾視窗全螢幕後）、bye
 * 轉盤、揭曉、作廢、加碼、換獎都包在 state 的 pv 裡（spin.startedAt 讓觀眾端以 Date.now() 對齊起轉）。
 */
export const SCREEN_MESSAGES = ['state', 'pong', 'hello', 'ping', 'key', 'ready', 'bye'];
export const PING_MS = 2000;
export const PONG_TIMEOUT_MS = 3000;     // 觀眾端：3 s 沒有回應 → 小點轉灰
export const SCREEN_STALE_MS = 6000;     // 主持端：6 s 沒有 ping → 視為觀眾視窗已關

/** role: 'host' | 'screen'；onMessage(msg) 只收對方角色送的訊息 */
export function createScreenChannel(eventId, role, onMessage) {
  const bc = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('wheel:' + eventId) : null;
  if (bc) bc.onmessage = (e) => {
    const m = e.data || {};
    if (!m.type || m.role === role) return;
    try { onMessage(m); } catch (err) { console.error(err); }
  };
  return {
    available: !!bc,
    post(msg) { if (bc) { try { bc.postMessage({ ...msg, role }); } catch (err) { console.error(err); } } },
    close() { if (bc) bc.close(); },
  };
}
