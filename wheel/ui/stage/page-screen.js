// 觀眾視窗（D.11，延伸模式）：同一台電腦的第二個視窗，BroadcastChannel 接收主持端的畫面模型。
// 永遠沒有操作介面；按鍵轉送主持端（白名單）；F 只切本視窗全螢幕、全螢幕後送 ready；
// 主持端斷線時保留最後一幀、角落小點轉灰，不蓋畫面。
//
// 掛載：mountScreen(root, { eventId }) → destroy()
import { h, inInput } from '../dom.js';
import { FORWARD_KEYS } from '../../core/state.js';
import { StageView } from './view.js';
import { createScreenChannel, PING_MS, PONG_TIMEOUT_MS } from './sync.js';
import { t } from './logic.js';
import { ensureStageCss } from './env.js';

export function mountScreen(root, opts = {}) {
  const eventId = opts.eventId;
  const css = ensureStageCss();
  document.body.classList.add('wstage-body');
  document.title = t('stage.screenDocTitle');
  root.replaceChildren();
  const el = h('div', { class: 'wstage is-screen theme-midnight' });
  const dot = h('div', { class: 'ws-dot', 'aria-hidden': 'true' });
  const waiting = h('div', { class: 'ws-waiting' }, t('stage.waiting'));
  root.appendChild(el);
  const view = new StageView(el, { role: 'screen' });
  el.append(waiting, dot);

  let lastPong = 0;
  let pv = null;
  let dead = false;
  const timers = {};

  const chan = createScreenChannel(eventId, 'screen', (m) => {
    if (m.type === 'state' && m.pv) {
      lastPong = Date.now();
      pv = m.pv;
      waiting.hidden = true;
      for (const th of ['midnight', 'festive', 'plain']) el.classList.toggle('theme-' + th, (pv.theme || 'midnight') === th);
      el.classList.toggle('is-rehearsal', !!pv.rehearsal);
      view.render(pv, null);
      updateDot();
    } else if (m.type === 'pong') {
      lastPong = Date.now();
      updateDot();
    }
  });

  function updateDot() {
    const ok = Date.now() - lastPong < PONG_TIMEOUT_MS;
    dot.classList.toggle('is-ok', ok);
    dot.title = ok ? '' : t('stage.waiting');
  }

  chan.post({ type: 'hello' });
  timers.ping = setInterval(() => { chan.post({ type: 'ping' }); updateDot(); }, PING_MS);

  // 按鍵：轉送主持端；F 本機全螢幕；? 忽略
  const onKey = (e) => {
    if (dead || inInput(e.target) || e.ctrlKey || e.metaKey || e.altKey) return;
    const key = e.key;
    if (key === 'f' || key === 'F') {
      e.preventDefault();
      try {
        if (document.fullscreenElement) document.exitFullscreen();
        else document.documentElement.requestFullscreen({ navigationUI: 'hide' }).catch(() => {});
      } catch { /* */ }
      return;
    }
    if (key === '?') { e.preventDefault(); return; }
    if (pv && pv.clickerMode && (key === 'F5' || key === '.' || key === 'PageUp')) { e.preventDefault(); return; }
    if (FORWARD_KEYS.has(key)) {
      e.preventDefault(); e.stopPropagation();
      chan.post({ type: 'key', key, code: e.code, shift: !!e.shiftKey, repeat: !!e.repeat });
    }
  };
  // 按住不放：主持端以 repeat 忽略；這裡直接不轉送 repeat
  const onKeyFilter = (e) => { if (e.repeat && FORWARD_KEYS.has(e.key)) { e.preventDefault(); return; } onKey(e); };
  const onKeyUp = (e) => { if (!inInput(e.target) && (e.key === ' ' || e.key === 'Enter')) e.preventDefault(); };
  document.addEventListener('keydown', onKeyFilter, true);
  document.addEventListener('keyup', onKeyUp, true);

  const onFs = () => { if (document.fullscreenElement) chan.post({ type: 'ready' }); };
  document.addEventListener('fullscreenchange', onFs);

  // 游標閒置 2 s 隱藏
  const onMove = () => {
    document.body.classList.remove('ws-cursor-hidden');
    clearTimeout(timers.cursor);
    timers.cursor = setTimeout(() => document.body.classList.add('ws-cursor-hidden'), 2000);
  };
  window.addEventListener('mousemove', onMove, { passive: true });
  onMove();

  const onUnload = () => chan.post({ type: 'bye' });
  window.addEventListener('pagehide', onUnload);

  let wake = null;
  (async () => { try { if (navigator.wakeLock) wake = await navigator.wakeLock.request('screen'); } catch { /* */ } })();

  const destroy = () => {
    if (dead) return;
    dead = true;
    chan.post({ type: 'bye' });
    clearInterval(timers.ping); clearTimeout(timers.cursor);
    document.removeEventListener('keydown', onKeyFilter, true);
    document.removeEventListener('keyup', onKeyUp, true);
    document.removeEventListener('fullscreenchange', onFs);
    window.removeEventListener('mousemove', onMove);
    window.removeEventListener('pagehide', onUnload);
    try { if (wake) wake.release(); } catch { /* */ }
    view.destroy();
    chan.close();
    document.body.classList.remove('wstage-body', 'ws-cursor-hidden');
    if (css.added) css.link.remove();
    root.replaceChildren();
  };
  destroy.destroy = destroy;
  return destroy;
}
