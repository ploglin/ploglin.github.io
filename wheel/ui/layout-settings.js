// 設定模式外框（D.3 版面）：頂列（‹ 活動列表、活動名、狀態、進舞台按鈕）＋ 左側分頁列 ＋ 主區。
// 手機：分頁列變頂部 tab（CSS）。
import { h, icon, todayStr } from './dom.js';
import { routes, go } from './router.js';
import { ctx, isLocked } from './app-ctx.js';
import { T, STATUS_LABEL } from './i18n.js';

/** 進舞台按鈕（活動列表卡片與設定頁頂列共用）。回傳 Node 陣列。 */
export function stageButtons(ev, { size = '' } = {}) {
  const ready = ev.participants.length > 0 && ev.prizes.length > 0;
  const cls = (primary) => `btn ${primary ? 'btn-primary' : 'btn-ghost'} ${size}`;
  if (ev.status === 'closed') return [];
  if (ev.status === 'live') {
    return [h('button', { type: 'button', class: cls(true), disabled: !ready, title: ready ? null : T.needRosterPrizes, onclick: () => go(routes.stage(ev.id, 'live')) }, icon('play', 18), T.enterStage)];
  }
  const liveFirst = ev.date && ev.date === todayStr();
  const reh = h('button', { type: 'button', class: cls(!liveFirst), disabled: !ready, title: ready ? null : T.needRosterPrizes, onclick: () => go(routes.stage(ev.id, 'rehearsal')) }, T.rehearse);
  const live = h('button', { type: 'button', class: cls(liveFirst), disabled: !ready, title: ready ? null : T.needRosterPrizes, onclick: () => go(routes.stage(ev.id, 'live')) }, icon('play', 18), T.startLive);
  return liveFirst ? [live, reh] : [reh, live];
}

export function statusBadge(status) {
  return h('span', { class: `wh-badge wh-badge-${status}` }, STATUS_LABEL[status] || status);
}

const TABS = [
  { key: 'participants', label: () => T.tabParticipants, icon: 'users', count: (ev) => ev.participants.length },
  { key: 'prizes', label: () => T.tabPrizes, icon: 'gift', count: (ev) => ev.prizes.length },
  { key: 'settings', label: () => T.tabSettings, icon: 'settings', count: () => null },
  { key: 'records', label: () => T.tabRecords, icon: 'list', count: (ev) => ev.draws.filter(d => d.status === 'confirmed').length || null },
];

/**
 * renderLayout(root, tab) → { main, side, refresh(), destroy() }
 * side：分頁列下方的區塊（名單頁放群組清單與統計）。
 */
export function renderLayout(root, tab) {
  const ev = () => ctx.store.official;
  const title = h('h1', { class: 'wh-title' });
  const badge = h('span');
  const actions = h('div', { class: 'wh-top-actions' });
  const lockBar = h('div', { class: 'wh-callout wh-callout-warn wh-locked', role: 'status', hidden: true }, icon('lock', 18), h('span', null, T.lockedBanner));
  const top = h('div', { class: 'wh-top' },
    h('a', { class: 'wh-back', href: routes.home() }, icon('back', 18), T.backToList),
    h('div', { class: 'wh-top-title' }, title, badge),
    actions);
  const nav = h('nav', { class: 'wh-tabs', 'aria-label': '設定分頁' });
  const tabEls = {};
  for (const t of TABS) {
    const cnt = h('span', { class: 'wh-tab-count' });
    const a = h('a', { class: 'wh-tab' + (t.key === tab ? ' on' : ''), href: routes.tab(ev().id, t.key), 'aria-current': t.key === tab ? 'page' : null }, icon(t.icon, 18), h('span', { class: 'wh-tab-label' }, t.label()), cnt);
    tabEls[t.key] = cnt;
    nav.appendChild(a);
  }
  const side = h('div', { class: 'wh-side-extra' });
  const main = h('main', { class: 'wh-main', id: 'wh-main', tabindex: '-1' });
  const shell = h('div', { class: 'wh-shell' },
    top, lockBar,
    h('div', { class: 'wh-body' }, h('aside', { class: 'wh-side' }, nav, side), main));
  root.replaceChildren(shell);

  function refresh() {
    const e = ev();
    if (!e) return;
    title.textContent = e.name;
    badge.replaceChildren(statusBadge(e.status));
    actions.replaceChildren(...stageButtons(e));
    for (const t of TABS) { const c = t.count(e); tabEls[t.key].textContent = c == null ? '' : String(c); }
    lockBar.hidden = !isLocked(e.id);
    shell.classList.toggle('is-locked', isLocked(e.id));
  }
  refresh();
  return { main, side, refresh, destroy() { root.replaceChildren(); } };
}
