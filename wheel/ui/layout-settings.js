// 設定模式外框（D.3 版面）：頂列（‹ 活動列表、活動名、狀態、進舞台按鈕）＋ 左側分頁列 ＋ 主區。
// 手機（≤ 720 px，CSS）：品牌頂列收起、活動頂列壓成單行（只留主要舞台鈕，其餘收進 ⋯）、分頁列固定在底部。
import { h, icon, todayStr, popMenu } from './dom.js';
import { routes, go } from './router.js';
import { ctx, isLocked } from './app-ctx.js';
import { T, STATUS_LABEL } from './i18n.js';

/** 進舞台的動作（第一個是主要動作）：[{ label, icon, primary, mode }]；活動已結束回傳空陣列 */
export function stageActions(ev) {
  if (ev.status === 'closed') return [];
  if (ev.status === 'live') return [{ label: T.enterStage, icon: 'play', primary: true, mode: 'live' }];
  const liveFirst = ev.date && ev.date === todayStr();
  const reh = { label: T.rehearse, icon: null, primary: !liveFirst, mode: 'rehearsal' };
  const live = { label: T.startLive, icon: 'play', primary: !!liveFirst, mode: 'live' };
  return liveFirst ? [live, reh] : [reh, live];
}

export const stageReady = (ev) => ev.participants.length > 0 && ev.prizes.length > 0;

/** 進舞台按鈕（活動列表卡片與設定頁頂列共用）。回傳 Node 陣列。 */
export function stageButtons(ev, { size = '' } = {}) {
  const ready = stageReady(ev);
  return stageActions(ev).map(a => h('button', {
    type: 'button', class: `btn ${a.primary ? 'btn-primary' : 'btn-ghost'} ${size}`, disabled: !ready, title: ready ? null : T.needRosterPrizes,
    onclick: () => go(routes.stage(ev.id, a.mode)),
  }, a.icon ? icon(a.icon, 18) : null, a.label));
}

/** 設定模式外觀目前是否深色（與 app.js 的主題切換同一判斷） */
function isDark() {
  const t = document.documentElement.getAttribute('data-theme');
  if (t === 'dark' || t === 'light') return t === 'dark';
  try { return window.matchMedia('(prefers-color-scheme: dark)').matches; } catch { return false; }
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
  // 手機：⋯ 收另一顆舞台鈕與深淺色切換（品牌頂列在活動頁收起）；停用原因寫成一行字（桌機用 title）
  const more = h('button', { type: 'button', class: 'icon-btn wh-top-more wh-only-m', 'aria-label': T.more, 'aria-haspopup': 'menu' }, icon('more'));
  more.addEventListener('click', () => {
    const e = ev();
    const ready = stageReady(e);
    const extra = stageActions(e).slice(1).map(a => ({ label: a.label, disabled: !ready, fn: () => go(routes.stage(e.id, a.mode)) }));
    const themeBtn = document.getElementById('wh-theme-btn');
    popMenu(more, [
      ...extra, ...(extra.length ? [{ sep: true }] : []),
      ...(themeBtn ? [{ label: isDark() ? T.themeToLight : T.themeToDark, fn: () => themeBtn.click() }] : []),
      { label: T.backToList, fn: () => go(routes.home()) },
    ]);
  });
  const why = h('p', { class: 'wh-top-why wh-only-m', hidden: true }, T.needRosterPrizes);
  const top = h('div', { class: 'wh-top' },
    h('a', { class: 'wh-back', href: routes.home(), 'aria-label': T.backToList }, icon('back', 18), h('span', { class: 'wh-back-t' }, T.backToList)),
    h('div', { class: 'wh-top-title' }, title, badge),
    actions, more);
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
    top, why, lockBar,
    h('div', { class: 'wh-body' }, h('aside', { class: 'wh-side' }, nav, side), main));
  root.replaceChildren(shell);
  document.documentElement.classList.add('wh-in-event');   // 手機：收起品牌頂列、底部分頁列（CSS）

  function refresh() {
    const e = ev();
    if (!e) return;
    title.textContent = e.name;
    badge.replaceChildren(statusBadge(e.status));
    actions.replaceChildren(...stageButtons(e));
    why.hidden = e.status === 'closed' || stageReady(e);
    for (const t of TABS) { const c = t.count(e); tabEls[t.key].textContent = c == null ? '' : String(c); }
    lockBar.hidden = !isLocked(e.id);
    shell.classList.toggle('is-locked', isLocked(e.id));
  }
  refresh();
  return { main, side, refresh, destroy() { document.documentElement.classList.remove('wh-in-event'); root.replaceChildren(); } };
}
