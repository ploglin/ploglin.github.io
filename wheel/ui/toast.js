// Toast（6 s）：可帶 [復原] 等動作；顯示期間按 Z（無修飾鍵、焦點不在輸入框）= 復原
import { esc } from './dom.js';

let host = null, current = null;

function ensureHost() {
  if (host && document.body.contains(host)) return host;
  host = document.createElement('div');
  host.className = 'toast-host';
  host.setAttribute('role', 'status');
  host.setAttribute('aria-live', 'polite');
  document.body.appendChild(host);
  return host;
}

/**
 * toast(msg, { actions: [{label, fn}], undo: fn, duration = 6000, kind: 'info'|'error' })
 * undo 會自動成為第一個動作「復原」，並綁定 Z 鍵。
 */
export function toast(msg, opts = {}) {
  dismiss();
  const h = ensureHost();
  const actions = [...(opts.undo ? [{ label: '復原', fn: opts.undo, undo: true }] : []), ...(opts.actions || [])];
  const t = document.createElement('div');
  t.className = 'toast' + (opts.kind === 'error' ? ' toast-error' : '');
  t.innerHTML = `<span class="toast-msg">${esc(msg)}</span>${actions.map((a, i) => `<button type="button" class="toast-btn" data-i="${i}">${esc(a.label)}${a.undo ? ' <kbd class="kbd">Z</kbd>' : ''}</button>`).join('')}`;
  h.appendChild(t);
  const run = (i) => { const a = actions[i]; dismiss(); if (a && a.fn) a.fn(); };
  t.addEventListener('click', (e) => { const b = e.target.closest('[data-i]'); if (b) run(+b.dataset.i); });
  const onKey = (e) => {
    if (!opts.undo) return;
    const tag = (e.target && e.target.tagName) || '';
    if (/INPUT|TEXTAREA|SELECT/.test(tag) || e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.key === 'z' || e.key === 'Z') { e.preventDefault(); run(0); }
  };
  document.addEventListener('keydown', onKey);
  const timer = setTimeout(dismiss, opts.duration || 6000);
  current = { t, timer, onKey };
  return dismiss;
}

export function dismiss() {
  if (!current) return;
  clearTimeout(current.timer);
  document.removeEventListener('keydown', current.onKey);
  current.t.remove();
  current = null;
}
