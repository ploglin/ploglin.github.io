// 籤數解鎖（瀏覽器端流程）。DESIGN.md「籤數為贊助功能」。判斷邏輯在 core/unlock.js（純函式）。
//   - initUnlock()：app.js 最早同步呼叫（在路由與 GA 之前）。處理網址上的 #unlock=<碼>：
//     先同步把碼從網址清掉（GA 的 page_location 不會帶到碼），再非同步比對。
//     成功 → sessionStorage 記旗標與待顯示提示、整頁重載；重載後首頁畫完由 consumeUnlockToast() 顯示提示。
//     失敗 → 不提示；網址已是 #/，路由照常畫活動列表。
//   - 旗標存 sessionStorage：同一分頁重新整理仍有效；關掉分頁或開新分頁就回到未解鎖。
//   - weightsUI(ev)：頁面要畫籤數相關介面前呼叫，回傳 { edit, show }。
import { FLAG_KEY, parseUnlockHash, codeMatches, weightView } from '../core/unlock.js';
import { toast } from './toast.js';
import { T } from './i18n.js';

const TOAST_KEY = 'wheel_tickets_toast';
let homeShown = false;

function sessGet(k) { try { return sessionStorage.getItem(k); } catch { return null; } }
function sessSet(k, v) { try { sessionStorage.setItem(k, v); return true; } catch { return false; } }
let memFlag = false;   // sessionStorage 不可用時，本頁有效

/** 這個分頁是否可編輯籤數 */
export function canEditWeights() { return memFlag || sessGet(FLAG_KEY) === '1'; }

/** 收回解鎖（離開名單頁時由 app.js 呼叫，見 core/unlock.js leavesPeople） */
export function revokeWeights() {
  memFlag = false;
  try { sessionStorage.removeItem(FLAG_KEY); } catch { /* */ }
}

/** { edit, show }：見 core/unlock.js weightView */
export function weightsUI(ev) { return weightView(ev, canEditWeights()); }

function showToast() { toast(T.ticketsOn, { duration: 8000 }); }

/** 首頁畫完後呼叫：有待顯示的提示就顯示 */
export function consumeUnlockToast() {
  homeShown = true;
  if (sessGet(TOAST_KEY) === '1') {
    try { sessionStorage.removeItem(TOAST_KEY); } catch { /* */ }
    showToast();
  }
}

/** 網址是 #unlock=… 就處理（碼在這裡同步清掉） */
function handleHash() {
  const code = parseUnlockHash(location.hash);
  if (code == null) return;
  history.replaceState(history.state, '', location.pathname + location.search + '#/');
  codeMatches(code).then((ok) => {
    if (!ok) return;
    if (canEditWeights()) {
      // 已解鎖再點一次：不重載，直接顯示同一句（首頁還沒畫完就等首頁畫完）
      if (homeShown || !sessSet(TOAST_KEY, '1')) showToast();
      return;
    }
    if (!sessSet(FLAG_KEY, '1')) { memFlag = true; showToast(); return; }   // 私密模式等：本頁有效，不重載
    sessSet(TOAST_KEY, '1');
    location.reload();
  }).catch((e) => console.error(e));
}

/** app.js 最早同步呼叫（在路由的 hashchange 監聽與 GA 之前） */
export function initUnlock() {
  handleHash();
  // 在已開著的分頁貼上連結：popstate 先於 hashchange 觸發，兩個都掛，誰先到誰清（路由與 GA 的監聽都排在後面）
  window.addEventListener('popstate', handleHash);
  window.addEventListener('hashchange', handleHash);
}
