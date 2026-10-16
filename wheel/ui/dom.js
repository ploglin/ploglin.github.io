// DOM 小工具：escape、html 模板、事件委派、inline SVG 圖示、kbd、對話框（focus trap）、⋯ 選單、fitText
// 圖示一律 inline SVG（不使用 emoji，見 DESIGN 0 章）

export function esc(s) {
  return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

/** 已信任的 HTML 片段（不再 escape） */
export class Raw { constructor(s) { this.s = String(s); } toString() { return this.s; } }
export const raw = (s) => new Raw(s);

/** html`...${x}...`：插值自動 escape；陣列自動 join；Raw 原樣 */
export function html(strings, ...vals) {
  let out = '';
  strings.forEach((s, i) => {
    out += s;
    if (i < vals.length) out += fmt(vals[i]);
  });
  return raw(out);
}
function fmt(v) {
  if (v == null || v === false) return '';
  if (v instanceof Raw) return v.s;
  if (Array.isArray(v)) return v.map(fmt).join('');
  return esc(v);
}

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

/** 事件委派：on(root, 'click', '[data-act]', (e, el) => …) */
export function on(root, type, selector, fn, opts) {
  const h = (e) => {
    const el = e.target.closest ? e.target.closest(selector) : null;
    if (el && root.contains(el)) fn(e, el);
  };
  root.addEventListener(type, h, opts);
  return () => root.removeEventListener(type, h, opts);
}

export function setHTML(el, h) { el.innerHTML = h instanceof Raw ? h.s : String(h); return el; }

export function el(tag, attrs = {}, inner) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k === 'class') e.className = v; else if (k === 'text') e.textContent = v; else e.setAttribute(k, v === true ? '' : v);
  }
  if (inner != null) setHTML(e, inner);
  return e;
}

// ---------- 圖示（24×24、stroke = currentColor） ----------
const P = {
  plus: '<path d="M12 5v14M5 12h14"/>',
  more: '<circle cx="5" cy="12" r="1.6" fill="currentColor"/><circle cx="12" cy="12" r="1.6" fill="currentColor"/><circle cx="19" cy="12" r="1.6" fill="currentColor"/>',
  close: '<path d="M6 6l12 12M18 6L6 18"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7"/>',
  upload: '<path d="M12 16V4M7 9l5-5 5 5M5 20h14"/>',
  download: '<path d="M12 4v12M7 11l5 5 5-5M5 20h14"/>',
  play: '<path d="M8 5l11 7-11 7z"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
  users: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0"/><path d="M16 4.5a3.5 3.5 0 0 1 0 7M18 14a6.5 6.5 0 0 1 3.5 6"/>',
  gift: '<rect x="3" y="8" width="18" height="4" rx="1"/><path d="M5 12v8h14v-8M12 8v12M12 8c-2-4-6-4-6-1.5S9.5 8 12 8zM12 8c2-4 6-4 6-1.5S14.5 8 12 8z"/>',
  list: '<path d="M8 6h13M8 12h13M8 18h13M3.5 6h.01M3.5 12h.01M3.5 18h.01"/>',
  edit: '<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="M14 6l4 4"/>',
  trash: '<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/>',
  chevronDown: '<path d="M6 9l6 6 6-6"/>',
  chevronRight: '<path d="M9 6l6 6-6 6"/>',
  chevronUp: '<path d="M6 15l6-6 6 6"/>',
  back: '<path d="M15 6l-6 6 6 6"/>',
  fullscreen: '<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>',
  sound: '<path d="M4 9v6h4l5 4V5L8 9z"/><path d="M16.5 8.5a5 5 0 0 1 0 7M19 6a8.5 8.5 0 0 1 0 12"/>',
  soundOff: '<path d="M4 9v6h4l5 4V5L8 9z"/><path d="M17 9l5 6M22 9l-5 6"/>',
  help: '<circle cx="12" cy="12" r="9"/><path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.6V14M12 17.5h.01"/>',
  printer: '<path d="M6 9V3h12v6M6 18H4v-7h16v7h-2M7 14h10v7H7z"/>',
  restore: '<path d="M4 12a8 8 0 1 0 2.4-5.7L4 8.6M4 4v4.6h4.6"/>',
  grip: '<circle cx="9" cy="6" r="1.4" fill="currentColor"/><circle cx="15" cy="6" r="1.4" fill="currentColor"/><circle cx="9" cy="12" r="1.4" fill="currentColor"/><circle cx="15" cy="12" r="1.4" fill="currentColor"/><circle cx="9" cy="18" r="1.4" fill="currentColor"/><circle cx="15" cy="18" r="1.4" fill="currentColor"/>',
  search: '<circle cx="11" cy="11" r="6.5"/><path d="M16 16l4.5 4.5"/>',
  warning: '<path d="M12 3l9.5 17h-19z"/><path d="M12 10v4.5M12 17.5h.01"/>',
  star: '<path d="M12 3.5l2.6 5.4 5.9.8-4.3 4.1 1 5.9L12 17l-5.2 2.7 1-5.9-4.3-4.1 5.9-.8z"/>',
  lock: '<rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>',
  eye: '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
  exit: '<path d="M10 4H5v16h5M14 8l4 4-4 4M18 12H9"/>',
  wheel: '<circle cx="12" cy="12" r="9"/><path d="M12 3v18M3 12h18M5.6 5.6l12.8 12.8M18.4 5.6L5.6 18.4"/>',
  arrowUp: '<path d="M12 19V5M6 11l6-6 6 6"/>',
  arrowDown: '<path d="M12 5v14M6 13l6 6 6-6"/>',
  file: '<path d="M6 3h8l4 4v14H6z"/><path d="M14 3v4h4"/>',
  copy: '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3"/>',
};
export function icon(name, size = 20, cls = '') {
  const p = P[name] || P.more;
  return raw(`<svg class="ico ${cls}" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${p}</svg>`);
}
export const ICONS = Object.keys(P);

export function kbd(k) { return raw(`<kbd class="kbd">${esc(k)}</kbd>`); }

// ---------- 焦點 ----------
const FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]):not([type="hidden"]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';
export function focusables(root) { return $$(FOCUSABLE, root).filter(e => e.offsetParent !== null || e === document.activeElement); }

/** 焦點 trap：Tab 在容器內循環；回傳解除函式 */
export function trapFocus(container) {
  const h = (e) => {
    if (e.key !== 'Tab') return;
    const f = focusables(container);
    if (!f.length) { e.preventDefault(); return; }
    const first = f[0], last = f[f.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  };
  container.addEventListener('keydown', h);
  return () => container.removeEventListener('keydown', h);
}

// ---------- 對話框 ----------
/**
 * dialog({ title, body (html/Raw/Node), actions: [{label, value, kind: 'primary'|'danger'|'ghost', focus: true}],
 *          className, onOpen(root, close), dismissable = true, stage = false })
 * → Promise<value|null>（Esc / ✕ / 點背景 = null）
 */
export function dialog(opts) {
  return new Promise((resolve) => {
    const prev = document.activeElement;
    const back = el('div', { class: 'dlg-back' + (opts.stage ? ' dlg-stage' : '') });
    const box = el('div', { class: 'dlg ' + (opts.className || ''), role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'dlg-t' });
    const acts = (opts.actions || []).map((a, i) => `<button type="button" class="btn ${a.kind ? 'btn-' + a.kind : ''}" data-i="${i}">${esc(a.label)}</button>`).join('');
    box.innerHTML = `<div class="dlg-head"><h2 id="dlg-t" class="dlg-title">${esc(opts.title || '')}</h2>${opts.dismissable === false ? '' : `<button type="button" class="icon-btn dlg-x" aria-label="關閉">${icon('close')}</button>`}</div><div class="dlg-body"></div>${acts ? `<div class="dlg-actions">${acts}</div>` : ''}`;
    const body = box.querySelector('.dlg-body');
    if (opts.body instanceof Node) body.appendChild(opts.body); else if (opts.body != null) setHTML(body, opts.body);
    back.appendChild(box);
    document.body.appendChild(back);
    const untrap = trapFocus(box);
    let done = false;
    function close(v) {
      if (done) return; done = true;
      untrap(); back.remove(); document.removeEventListener('keydown', onKey, true);
      if (prev && prev.focus && document.contains(prev)) { try { prev.focus(); } catch { /* */ } }
      resolve(v === undefined ? null : v);
    }
    function onKey(e) {
      if (e.key === 'Escape' && opts.dismissable !== false) { e.preventDefault(); e.stopPropagation(); close(null); }
    }
    document.addEventListener('keydown', onKey, true);
    box.addEventListener('click', (e) => {
      const b = e.target.closest('[data-i]');
      if (b && b.parentElement.classList.contains('dlg-actions')) {
        const a = opts.actions[+b.dataset.i];
        if (a.validate && !a.validate(box)) return;
        close(typeof a.value === 'function' ? a.value(box) : a.value);
      }
      if (e.target.closest('.dlg-x')) close(null);
    });
    back.addEventListener('mousedown', (e) => { if (e.target === back && opts.dismissable !== false) close(null); });
    if (opts.onOpen) opts.onOpen(box, close);
    const fi = (opts.actions || []).findIndex(a => a.focus);
    const target = fi >= 0 ? box.querySelector(`.dlg-actions [data-i="${fi}"]`) : (box.querySelector('[autofocus]') || focusables(body)[0] || box.querySelector('.dlg-actions .btn'));
    if (target) setTimeout(() => target.focus(), 0);
  });
}

export function confirmDialog(title, text, { ok = '確定', cancel = '取消', danger = false, focusCancel = false } = {}) {
  return dialog({
    title, body: html`<p>${text}</p>`,
    actions: [{ label: cancel, value: false, kind: 'ghost', focus: focusCancel }, { label: ok, value: true, kind: danger ? 'danger' : 'primary', focus: !focusCancel }],
  }).then(v => !!v);
}

/** 需輸入指定文字才可確定（刪除活動：輸入「刪除」） */
export function typeToConfirm(title, text, word, extraHTML = '') {
  return dialog({
    title,
    body: html`<p>${text}</p><label class="field"><span>請輸入「${word}」兩字以確認</span><input type="text" class="input" data-ttc autocomplete="off"></label>${raw(extraHTML)}`,
    actions: [{ label: '取消', value: false, kind: 'ghost' }, { label: '刪除', value: true, kind: 'danger', validate: (box) => box.querySelector('[data-ttc]').value.trim() === word }],
    onOpen(box) {
      const inp = box.querySelector('[data-ttc]'); const btn = box.querySelector('.btn-danger');
      btn.disabled = true;
      inp.addEventListener('input', () => { btn.disabled = inp.value.trim() !== word; });
      setTimeout(() => inp.focus(), 0);
    },
  }).then(v => !!v);
}

// ---------- ⋯ 選單 ----------
/** popMenu(anchor, [{label, fn, danger, disabled, sep}]) */
export function popMenu(anchor, items) {
  closeMenus();
  const m = el('div', { class: 'pop-menu', role: 'menu' });
  m.innerHTML = items.map((it, i) => it.sep ? '<div class="pop-sep" role="separator"></div>'
    : `<button type="button" role="menuitem" class="pop-item${it.danger ? ' danger' : ''}" data-i="${i}" ${it.disabled ? 'disabled' : ''}>${esc(it.label)}</button>`).join('');
  document.body.appendChild(m);
  const r = anchor.getBoundingClientRect();
  const w = m.offsetWidth, hgt = m.offsetHeight;
  let left = Math.min(window.innerWidth - w - 8, Math.max(8, r.right - w));
  let top = r.bottom + 4; if (top + hgt > window.innerHeight - 8) top = Math.max(8, r.top - hgt - 4);
  m.style.left = left + 'px'; m.style.top = top + 'px';
  const first = m.querySelector('.pop-item:not([disabled])'); if (first) first.focus();
  m.addEventListener('click', (e) => {
    const b = e.target.closest('[data-i]'); if (!b) return;
    const it = items[+b.dataset.i]; closeMenus(); anchor.focus();
    if (it && it.fn) it.fn();
  });
  m.addEventListener('keydown', (e) => {
    const list = [...m.querySelectorAll('.pop-item:not([disabled])')];
    const i = list.indexOf(document.activeElement);
    if (e.key === 'ArrowDown') { e.preventDefault(); list[(i + 1) % list.length].focus(); }
    if (e.key === 'ArrowUp') { e.preventDefault(); list[(i - 1 + list.length) % list.length].focus(); }
    if (e.key === 'Escape' || e.key === 'Tab') { e.preventDefault(); closeMenus(); anchor.focus(); }
  });
  setTimeout(() => document.addEventListener('mousedown', outside, true), 0);
  function outside(e) { if (!m.contains(e.target)) closeMenus(); }
  m._outside = outside;
  return m;
}
export function closeMenus() {
  for (const m of $$('.pop-menu')) { document.removeEventListener('mousedown', m._outside, true); m.remove(); }
}

/** 讓文字縮到容器寬度內 */
export function fitText(node, maxPx, minPx = 16) {
  let size = maxPx; node.style.fontSize = size + 'px';
  const parent = node.parentElement; if (!parent) return;
  while (size > minPx && node.scrollWidth > parent.clientWidth) { size -= 2; node.style.fontSize = size + 'px'; }
}

export function fmtTime(iso) {
  if (!iso) return '';
  const d = new Date(iso); const p = (n) => String(n).padStart(2, '0');
  return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}
export function fmtDate(iso) {
  if (!iso) return '';
  const d = new Date(iso); const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
export function todayStr() { return fmtDate(new Date().toISOString()); }

/** 讀檔 → ArrayBuffer */
export function readFileBuffer(file) {
  return new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = () => rej(r.error); r.readAsArrayBuffer(file); });
}
export function readFileText(file) {
  return new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = () => rej(r.error); r.readAsText(file); });
}

// ---------- 別名與補充（設定模式 / 舞台共用；export 名稱定案，請勿改名） ----------

/**
 * h(tag, attrs?, ...children)：建立 DOM 節點。
 * attrs：class / text / html / style（字串或物件）/ dataset（物件）/ onXxx（事件）/ 其他屬性。
 * children：Node、字串（當文字）、Raw（當 HTML）、陣列、null。
 */
export function h(tag, attrs, ...children) {
  if (attrs == null || typeof attrs !== 'object' || attrs instanceof Node || attrs instanceof Raw || Array.isArray(attrs)) {
    children.unshift(attrs); attrs = {};
  }
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k === 'class') e.className = v;
    else if (k === 'text') e.textContent = v;
    else if (k === 'html') setHTML(e, v);
    else if (k === 'style' && typeof v === 'object') Object.assign(e.style, v);
    else if (k === 'dataset') Object.assign(e.dataset, v);
    else if (k.startsWith('on') && typeof v === 'function') e.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k in e && typeof v !== 'string' && k !== 'list') e[k] = v;
    else e.setAttribute(k, v === true ? '' : v);
  }
  const add = (c) => {
    if (c == null || c === false) return;
    if (Array.isArray(c)) { c.forEach(add); return; }
    if (c instanceof Node) e.appendChild(c);
    else if (c instanceof Raw) e.insertAdjacentHTML('beforeend', c.s);
    else e.appendChild(document.createTextNode(String(c)));
  };
  children.forEach(add);
  return e;
}

/** 事件委派（on 的別名）：delegate(root, 'click', '[data-act]', (e, el) => …) → 解除函式 */
export const delegate = on;

/** 去抖動 */
export function debounce(fn, ms = 300) {
  let t = null;
  const d = (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
  d.cancel = () => clearTimeout(t);
  return d;
}

/** 焦點是否在可輸入元素上（快捷鍵判斷用） */
export function inInput(target = document.activeElement) {
  if (!target) return false;
  const tag = target.tagName || '';
  return /^(INPUT|TEXTAREA|SELECT)$/.test(tag) || !!target.isContentEditable;
}

/** 數字輸入停用滑鼠滾輪改值（B.3：籤數框） */
export function noWheel(root) {
  root.addEventListener('wheel', (e) => {
    const t = e.target;
    if (t && t.tagName === 'INPUT' && t.type === 'number' && document.activeElement === t) t.blur();
  }, { passive: true, capture: true });
}

/**
 * 單欄輸入對話框 → Promise<string|null>
 * promptDialog(title, label, { value, type: 'text'|'number', min, max, placeholder, okLabel, list: string[] })
 */
export function promptDialog(title, label, o = {}) {
  const listId = o.list ? 'pd-list-' + Math.random().toString(36).slice(2) : null;
  return dialog({
    title,
    body: html`<label class="field"><span>${label}</span><input class="input" data-pd type="${o.type || 'text'}" ${o.min != null ? raw(`min="${o.min}"`) : ''} ${o.max != null ? raw(`max="${o.max}"`) : ''} ${listId ? raw(`list="${listId}"`) : ''} placeholder="${o.placeholder || ''}" value="${o.value == null ? '' : o.value}" autocomplete="off"></label>${listId ? html`<datalist id="${listId}">${o.list.map(v => html`<option value="${v}">`)}</datalist>` : ''}`,
    actions: [{ label: '取消', value: null, kind: 'ghost' }, { label: o.okLabel || '確定', kind: 'primary', value: (box) => box.querySelector('[data-pd]').value.trim(), validate: (box) => box.querySelector('[data-pd]').value.trim() !== '' }],
    onOpen(box) {
      const inp = box.querySelector('[data-pd]');
      setTimeout(() => { inp.focus(); inp.select && inp.select(); }, 0);
      inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); box.querySelector('.btn-primary').click(); } });
    },
  });
}
