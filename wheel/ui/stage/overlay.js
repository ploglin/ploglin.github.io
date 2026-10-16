// 舞台浮層外殼：深色半透明、置中、focus trap。鍵盤由 page-stage 的輸入模型分派到 onMove / onEnter / onDigit。
import { h, icon, trapFocus, focusables } from '../dom.js';
import { t } from './logic.js';
import { fill } from './util.js';

/**
 * spec: { title, body: Node|Node[], actions: [{label, kind, onClick, focus, id}], className,
 *         onMove(d), onEnter(), onDigit(n), refresh(), onClose(), initialFocus: () => Node }
 * onRequestClose：使用者按 ✕ 或點背景時呼叫（由 page-stage 統一處理 overlay 狀態）
 */
export function openModal(layer, spec, onRequestClose) {
  const titleId = 'wsm-' + Math.random().toString(36).slice(2, 8);
  const body = h('div', { class: 'ws-modal-body' });
  const actions = h('div', { class: 'ws-modal-actions' });
  const close = h('button', { type: 'button', class: 'ws-icon-btn', 'aria-label': t('btn.close'), onclick: () => onRequestClose() }, icon('close', 22));
  const box = h('div', { class: 'ws-modal ' + (spec.className || ''), role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': titleId },
    h('div', { class: 'ws-modal-head' }, h('h2', { class: 'ws-modal-title', id: titleId }, spec.title || ''), close),
    body, actions);
  const back = h('div', { class: 'ws-modal-back' }, box);
  back.addEventListener('mousedown', (e) => { if (e.target === back) onRequestClose(); });
  layer.appendChild(back);
  const untrap = trapFocus(box);

  const m = {
    el: box, body, actions, spec, closed: false,
    setBody(nodes) { fill(body, ...[].concat(nodes).filter(Boolean)); },
    setActions(list) {
      fill(actions, ...(list || []).map((a) => {
        const b = h('button', { type: 'button', class: 'ws-btn ' + (a.kind ? 'ws-btn-' + a.kind : ''), onclick: () => a.onClick && a.onClick() }, a.label);
        if (a.disabled) b.disabled = true;
        if (a.focus) b.dataset.focus = '1';
        if (a.id) b.dataset.id = a.id;
        return b;
      }));
    },
    focusDefault() {
      const want = (spec.initialFocus && spec.initialFocus()) || box.querySelector('[data-focus="1"]') || box.querySelector('[autofocus]') || focusables(body)[0] || actions.querySelector('button:not([disabled])') || close;
      if (want && !box.contains(document.activeElement)) want.focus({ preventScroll: true });
    },
    onMove(d) {
      if (spec.onMove) return spec.onMove(d);
      const items = [...box.querySelectorAll('[data-nav]:not([disabled])')];
      if (!items.length) return;
      const i = items.indexOf(document.activeElement);
      const j = i < 0 ? (d > 0 ? 0 : items.length - 1) : Math.max(0, Math.min(items.length - 1, i + d));
      items[j].focus();
    },
    onEnter() {
      if (spec.onEnter) return spec.onEnter();
      const a = document.activeElement;
      if (a && box.contains(a) && (a.tagName === 'BUTTON' || a.getAttribute('role') === 'button') && !a.disabled) { a.click(); return; }
      const primary = actions.querySelector('.ws-btn-primary:not([disabled])');
      if (primary) primary.click();
    },
    onDigit(n) { if (spec.onDigit) spec.onDigit(n); },
    refresh() { if (spec.refresh) spec.refresh(m); },
    close() {
      if (m.closed) return;
      m.closed = true; untrap(); back.remove();
      if (spec.onClose) spec.onClose();
    },
  };
  m.setBody(spec.body || []);
  m.setActions(spec.actions || []);
  if (spec.onOpen) spec.onOpen(m);
  setTimeout(() => { if (!m.closed) m.focusDefault(); }, 0);
  return m;
}
