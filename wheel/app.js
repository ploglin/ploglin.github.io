// 啟動、hash 路由、全域錯誤、設定模式頂列（主題切換）與 GA4。DESIGN.md D.1、E.2、E.3。
// 本工具是獨立小程序：不掛站台外殼、不載站台共用腳本，只沿用 ../assets/shell.css 的 token。
//
// 路由（ui/router.js）：
//   #/                               活動列表
//   #/e/:id/participants|prizes|settings|records   設定模式（極簡頂列）
//   #/e/:id/stage?mode=rehearsal|live              舞台（無頂列、無廣告）→ 動態載入 ui/stage/page-stage.js
//   #/e/:id/screen                                 觀眾視窗 → 動態載入 ui/stage/page-screen.js
import { openDB } from './store/db.js';
import { createStore } from './store/store.js';
import { createUndo } from './store/undo.js';
import { loadPrefs, updatePrefs } from './store/prefs.js';
import { createTabSync } from './ui/stage/sync.js';
import { parseHash, go, routes } from './ui/router.js';
import { ctx, isLocked, undoRedo } from './ui/app-ctx.js';
import { toast } from './ui/toast.js';
import { inInput, h } from './ui/dom.js';
import { T } from './ui/i18n.js';
import { renderHome } from './ui/page-home.js';
import { renderLayout } from './ui/layout-settings.js';
import { renderParticipants } from './ui/page-participants.js';
import { renderPrizes } from './ui/page-prizes.js';
import { renderSettings } from './ui/page-settings.js';
import { renderRecords } from './ui/page-records.js';
import { initUnlock, consumeUnlockToast, revokeWeights } from './ui/unlock.js';
import { leavesPeople } from './core/unlock.js';

// 最早同步執行：清掉網址上的 #unlock=…（在路由的 hashchange 監聽與 GA 之前），見 ui/unlock.js
initUnlock();

const PAGES = { participants: renderParticipants, prizes: renderPrizes, settings: renderSettings, records: renderRecords };

const root = document.getElementById('app');
let topbarReady = false;
let cleanup = null;          // 目前頁面的解除函式
let renderSeq = 0;
let stageKey = null;     // 目前掛著的舞台（name:id）

function setMode(mode) {
  document.documentElement.classList.toggle('wh-stage-mode', mode === 'stage');
  document.documentElement.classList.toggle('wh-settings-mode', mode === 'settings');
  if (mode === 'settings' && !topbarReady) {
    topbarReady = true;
    ensureGtag();
    initThemeToggle();
  }
}

// ---------- GA4（只在設定模式載入；舞台不載，見 DESIGN.md 0 章「分析」） ----------
const GA_ID = 'G-EL4J27F89B';
function ensureGtag() {
  if (window.__gtagLoaded) return;
  window.__gtagLoaded = true;
  if (document.querySelector('script[src*="googletagmanager.com/gtag/js"]')) return;   // 已載入就不重複計數
  window.dataLayer = window.dataLayer || [];
  window.gtag = window.gtag || function () { window.dataLayer.push(arguments); };
  const s = document.createElement('script');
  s.async = true;
  s.src = 'https://www.googletagmanager.com/gtag/js?id=' + GA_ID;
  document.head.appendChild(s);
  window.gtag('js', new Date());
  window.gtag('config', GA_ID);
}

// ---------- 主題切換（兩態：淺 ↔ 深；未存值時跟隨系統；key 與站台共用 kairo_theme） ----------
// 只管設定模式外觀（html[data-theme]），舞台主題（settings.stageTheme）不受影響。
const SUN = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>';
const MOON = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z"/></svg>';
function currentTheme() {
  const t = document.documentElement.getAttribute('data-theme');
  if (t === 'dark' || t === 'light') return t;
  return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}
function initThemeToggle() {
  const btn = document.getElementById('wh-theme-btn');
  if (!btn) return;
  const paint = () => {
    const dark = currentTheme() === 'dark';
    btn.innerHTML = dark ? SUN : MOON;
    btn.setAttribute('aria-label', dark ? T.themeToLight : T.themeToDark);
    btn.title = dark ? T.themeToLight : T.themeToDark;
  };
  btn.addEventListener('click', () => {
    const next = currentTheme() === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    try { localStorage.setItem('kairo_theme', next); } catch { /* 隱私模式 */ }
    paint();
  });
  // 未存值時跟著系統切換更新圖示
  try { window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', paint); } catch { /* 舊瀏覽器 */ }
  paint();
}

async function render() {
  const seq = ++renderSeq;
  const route = parseHash();
  if (leavesPeople(ctx.route, route)) revokeWeights();   // 解鎖只給一次名單頁
  ctx.route = route;
  if (route.name !== 'stage' && route.name !== 'screen') {
    if (cleanup) { try { cleanup(); } catch (e) { console.error(e); } cleanup = null; }
    stageKey = null;
  }

  if (route.name === 'stage' || route.name === 'screen') {
    // 同一個舞台（例如只改了 ?mode）不重掛
    const key = route.name + ':' + route.id;
    if (stageKey === key && cleanup) return;
    if (cleanup) { try { cleanup(); } catch (e) { console.error(e); } cleanup = null; }
    stageKey = key;
    setMode('stage');
    await mountStage(route, seq);
    return;
  }

  setMode('settings');
  document.getElementById('wh-intro')?.toggleAttribute('hidden', route.name !== 'home');

  if (route.name === 'home') {
    ctx.store.close();
    document.title = '線上轉盤抽獎｜尾牙春酒抽獎工具';
    root.replaceChildren();
    cleanup = await renderHome(root);
    if (seq === renderSeq) consumeUnlockToast();
    return;
  }

  // 設定模式頁
  let ev = null;
  try { ev = await ctx.store.open(route.id); } catch (e) { console.error(e); }
  if (seq !== renderSeq) return;
  if (!ev) { toast(T.notFound, { kind: 'error' }); go(routes.home(), { replace: true }); return; }
  updatePrefs({ lastEventId: ev.id });
  document.title = `${ev.name}｜轉盤抽獎`;
  const layout = renderLayout(root, route.tab);
  const page = PAGES[route.tab] || renderParticipants;
  const pageCleanup = await page(layout.main, { layout, route });
  const unsub = ctx.store.subscribe((reason) => {
    if (reason && reason.type === 'save-error') toast(T.saveError, { kind: 'error' });
    layout.refresh();
  });
  cleanup = () => { unsub(); layout.destroy(); if (typeof pageCleanup === 'function') pageCleanup(); };
}

async function mountStage(route, seq) {
  root.replaceChildren();
  const file = route.name === 'stage' ? './ui/stage/page-stage.js' : './ui/stage/page-screen.js';
  let mod = null;
  try { mod = await import(file); } catch (e) { console.warn('stage module', e); }
  if (seq !== renderSeq) return;
  const fn = mod && (mod.mount || mod.mountStage || mod.mountScreen || mod.render || mod.default);
  if (typeof fn !== 'function') {
    // 舞台若改用獨立入口頁（stage.html / screen.html），轉過去；否則顯示提示
    const alt = route.name === 'stage' ? 'stage.html' : 'screen.html';
    try {
      const r = await fetch(alt, { method: 'HEAD' });
      if (r.ok) { location.replace(alt + location.hash); return; }
    } catch { /* 離線 */ }
    root.replaceChildren(h('div', { class: 'wh-page wh-narrow' }, h('p', { class: 'wh-callout' }, T.stageMissing), h('a', { class: 'btn btn-ghost', href: routes.home() }, T.backToList)));
    return;
  }
  const hadCss = !!document.querySelector('link[data-wstage]');
  const res = await fn(root, {
    eventId: route.id, mode: route.query.mode || null, store: ctx.store, tabSync: ctx.tabs, db: ctx.db, route,
    onExit: (url) => { const i = String(url).indexOf('#'); go(i >= 0 ? String(url).slice(i) : routes.home()); },
  });
  const destroy = typeof res === 'function' ? res : (res && typeof res.destroy === 'function' ? () => res.destroy() : (typeof mod.unmount === 'function' ? () => mod.unmount() : () => {}));
  cleanup = () => {
    destroy();
    // 回設定模式：拿掉舞台動態加的樣式表與 body class，避免影響設定頁
    if (!hadCss) document.querySelectorAll('link[data-wstage]').forEach(l => l.remove());
    document.body.classList.remove('wstage-body');
    root.replaceChildren();
  };
}

function onKey(e) {
  const route = ctx.route;
  if (!route || route.name !== 'settings') return;
  if (!(e.ctrlKey || e.metaKey) || (e.key !== 'z' && e.key !== 'Z' && e.key !== 'y')) return;
  if (inInput(e.target) || document.querySelector('.dlg-back')) return;   // 輸入框交給原生；對話框開著不動
  e.preventDefault();
  const redo = e.key === 'y' || e.shiftKey;
  undoRedo(redo).then((done) => { if (done) render(); });
}

async function boot() {
  const db = await openDB();
  ctx.db = db;
  ctx.tabs = createTabSync();
  ctx.store = createStore(db, { lockCheck: (id) => ctx.tabs.heldElsewhere(id) });
  ctx.undo = createUndo(30);
  // 首次進站：申請持久保存
  try {
    const p = loadPrefs();
    if (!p.persistAsked && navigator.storage && navigator.storage.persist) { navigator.storage.persist(); updatePrefs({ persistAsked: true }); }
  } catch { /* */ }
  // 其他分頁改了正式 Event（例如舞台寫入）→ 設定頁重新讀取
  ctx.tabs.on((m) => {
    const r = ctx.route;
    if (!r || r.name === 'stage' || r.name === 'screen') return;
    if (m.type === 'changed' || m.type === 'hold' || m.type === 'release') {
      if (r.name === 'settings' && m.eventId === r.id) {
        if (m.type === 'changed') ctx.store.reload().then(() => render());
        else if (m.type === 'release' || (m.type === 'hold' && document.querySelector('.wh-locked[hidden]'))) render();
      } else if (r.name === 'home' && m.type !== 'hold') render();
    }
  });
  window.addEventListener('hashchange', render);
  document.addEventListener('keydown', onKey);
  window.addEventListener('error', (e) => { console.error(e.error || e.message); });
  window.addEventListener('unhandledrejection', (e) => { console.error(e.reason); toast(T.genericError, { kind: 'error' }); });
  window.addEventListener('pagehide', () => { ctx.store.flush().catch(() => {}); });
  await render();
}

export { isLocked };

boot().catch((e) => {
  console.error(e);
  root.replaceChildren(h('div', { class: 'wh-page wh-narrow' }, h('p', { class: 'wh-callout wh-callout-warn' }, T.genericError)));
});
