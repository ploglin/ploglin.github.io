// 籤數為贊助功能（純函式，可在 Node 測）。DESIGN.md「籤數為贊助功能」。
// 只存碼的 SHA-256；碼本身不進 repo。瀏覽器端流程（網址、sessionStorage、重載、提示）在 ui/unlock.js。
// 規則：解鎖只代表「這個分頁可以編輯籤數」；已設好的籤數在抽獎時照樣生效（core/pool.js 不看解鎖）。
import { sha256Hex } from './rng.js';

export const UNLOCK_HASH = 'd04212316cedc38f9a0c516eb1d4997b553c0c8fd8eb43d87a20baa7efc32776';
/** sessionStorage 旗標（值為 '1'）：只到關掉這個分頁 */
export const FLAG_KEY = 'wheel_tickets';

/** 從 location.hash 取出碼：'#unlock=xxx' → 'xxx'；不是解鎖連結回傳 null */
export function parseUnlockHash(hash) {
  const m = /^#?unlock=(.*)$/.exec(hash || '');
  if (!m) return null;
  let code = m[1];
  try { code = decodeURIComponent(code); } catch { /* 保留原字串 */ }
  return code.trim();
}

/** 碼的 SHA-256（hex）是否等於 expected */
export async function codeMatches(code, expected = UNLOCK_HASH) {
  if (!code) return false;
  return (await sha256Hex(String(code))) === expected;
}

/** 活動名單裡有人籤數 > 1 */
export function hasWeights(event) {
  return !!(event && Array.isArray(event.participants) && event.participants.some(p => p && p.weight > 1));
}

/**
 * 籤數介面的唯一判斷點（設定模式各頁；舞台不看這裡）：
 *   edit：可編輯（輸入框、設籤數、匯入籤數欄、範本籤數欄）
 *   show：顯示籤數相關字樣（扇區大小、籤數總和、匯出籤數欄）
 * 兩者都只看解鎖：未解鎖時即使資料裡有籤數 > 1 也不顯示（籤數照樣在抽獎時生效）。
 */
export function weightView(event, unlocked) {
  const on = !!unlocked;
  return { edit: on, show: on };
}

/** 路由是否為某活動的名單頁（tab 省略時預設名單頁） */
export function isPeopleRoute(route) {
  return !!route && route.name !== 'home' && route.name !== 'stage' && route.name !== 'screen'
    && (!route.tab || route.tab === 'participants');
}

/**
 * 解鎖只給「一次名單頁」：離開名單頁（換到別頁、別的活動、首頁、舞台）就收回。
 * prev 為名單頁、next 不是同一活動的名單頁 → true。
 */
export function leavesPeople(prev, next) {
  if (!isPeopleRoute(prev)) return false;
  return !(isPeopleRoute(next) && next.id === prev.id);
}
