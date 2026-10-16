// 舞台頁環境：網址、樣式表、sessionStorage 小工具。
export const WHEEL_BASE = new URL('../../', import.meta.url);

/** 舞台樣式表（掛在 index.html 的路由下時動態插入；stage.html 已自帶） */
export function ensureStageCss() {
  let l = document.querySelector('link[data-wstage]');
  if (l) return { link: l, added: false };
  l = document.createElement('link');
  l.rel = 'stylesheet';
  l.href = new URL('stage.css', WHEEL_BASE).href;
  l.dataset.wstage = '1';
  document.head.appendChild(l);
  return { link: l, added: true };
}

/** 設定模式頁（index.html + hash） */
export function appUrl(hash) { return new URL('./' + hash, WHEEL_BASE).href; }

/** 觀眾視窗：一律用無 shell、無廣告的 stage.html */
export function screenUrl(eventId) { return new URL('stage.html#/e/' + encodeURIComponent(eventId) + '/screen', WHEEL_BASE).href; }
export function stageUrl(eventId) { return new URL('stage.html#/e/' + encodeURIComponent(eventId) + '/stage', WHEEL_BASE).href; }

export function sessGet(k) { try { return sessionStorage.getItem(k); } catch { return null; } }
export function sessSet(k, v) { try { if (v == null) sessionStorage.removeItem(k); else sessionStorage.setItem(k, v); } catch { /* 私密視窗 */ } }

/** 進場後把 ?mode= 從網址拿掉，避免重新整理時又開一次彩排（不觸發 hashchange） */
export function stripModeParam() {
  try {
    const hsh = location.hash || '';
    if (hsh.includes('?')) history.replaceState(history.state, '', location.pathname + location.search + hsh.replace(/\?.*$/, ''));
  } catch { /* */ }
}

export function prefersReducedMotion() {
  try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { return false; }
}
