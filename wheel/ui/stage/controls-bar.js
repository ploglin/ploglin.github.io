// 投影模式（鏡像）底部操作列：平常隱藏，滑鼠移動、觸控或 H 才浮出。
// 三段式：左＝彩排標籤與抽獎工具、中＝主動作鈕（固定在正中）、右＝依階段的次要鈕＋視窗工具＋退出。
// 會投影出去，所以按鈕上不放鍵位文字（鍵位只放在 title「動作名（鍵）」與 aria-keyshortcuts）。
// 主鈕只在 buildControlsBar 建一次，renderMainBtn 就地更新；左右兩段以內容 key 比對，沒變就不重建，
// 避免滑鼠正指著的按鈕在每次重繪時被換掉。
import { h, icon } from '../dom.js';
import { t } from './logic.js';
import { fill } from './util.js';

/** 在 bar 內建出三段與主鈕；回傳各段元素 */
export function buildControlsBar(ctl, bar) {
  const left = h('div', { class: 'ws-cb-grp ws-cb-left' });
  const mid = h('div', { class: 'ws-cb-grp ws-cb-mid' });
  const right = h('div', { class: 'ws-cb-grp ws-cb-right' });
  const label = h('span', { class: 'ws-cb-main-label' });
  const main = h('button', { type: 'button', class: 'ws-cb-main', onclick: () => ctl.pressBarMain() }, label);
  mid.appendChild(main);
  bar.append(left, mid, right);
  return { left, mid, right, main, label };
}

/** 主鈕就地更新。m = logic.barMainModel() */
export function renderMainBtn(parts, m) {
  const b = parts.main;
  if (parts.label.textContent !== m.label) parts.label.textContent = m.label;
  setAttr(b, 'title', m.title);
  setAttr(b, 'aria-label', m.label);
  setAttr(b, 'aria-keyshortcuts', m.keys);
  setAttr(b, 'aria-disabled', m.disabled ? 'true' : 'false');
  b.classList.toggle('is-confirm', m.tone === 'confirm');
  b.classList.toggle('is-secondary', m.tone === 'secondary');
  b.classList.toggle('is-void', m.tone === 'void');
}

function setAttr(el, k, v) {
  if (v == null || v === '') { if (el.hasAttribute(k)) el.removeAttribute(k); return; }
  if (el.getAttribute(k) !== v) el.setAttribute(k, v);
}

/** 點擊左右段按鈕時執行的動作（點擊當下才讀 phase） */
const ACTIONS = {
  rehearsal: (c) => c.toggleRehearsal(),
  prizes: (c) => c.act('prizeMenu', c.ev.stage.phase === 'armed' ? 'disarm' : undefined),
  roster: (c) => c.act('quickList'),
  recent: (c) => c.act('recent'),
  bonus: (c) => c.act('bonus'),
  void: (c) => c.barSecondary('void.select'),
  cardExit: (c) => c.barSecondary('card.exit'),
  revoke: (c) => c.act('void.last'),
  disarm: (c) => c.act('disarm'),
  fullscreen: (c) => c.toggleFullscreen(),
  screen: (c) => c.openAudience(),
  settings: (c) => c.openOverlay('stage_settings', c.overlays().stageSettings(c)),
  help: (c) => c.act('help'),
  exit: (c) => c.requestExit(),
  handDock: (c) => c.setHandDock(true),
};

/** 左右段的內容描述（純資料，用來比對要不要重建） */
export function barSideItems(ctl, ev) {
  const phase = ev.stage.phase;
  const reh = ctl.store.rehearsal;
  const clicker = !!ev.settings.clickerMode;
  const can = (list) => list.includes(phase);
  const btn = (id, label, key, aria, enabled = true, cls = '', ic = null, tool = false) => ({
    id, label, title: key ? `${label}（${key}）` : (id === 'rehearsal' ? (reh ? t('bar.rehearsalOnTitle') : t('bar.rehearsalOffTitle')) : label),
    keys: aria || null, enabled, cls, ic, tool,
  });
  const left = [
    reh ? btn('rehearsal', t('bar.rehearsalOn'), null, null, true, 'ws-cb-reh')
      : btn('rehearsal', t('bar.rehearsalOff'), null, null, true, 'ws-cb-rehoff'),
    btn('prizes', t('bar.prizes'), 'P', 'P', can(['idle', 'armed', 'prize_done', 'all_done']), '', 'list'),
    btn('roster', t('bar.roster'), 'L', 'L', can(['idle', 'prize_done']), '', 'users'),
    btn('recent', t('bar.recent'), 'R', 'R', can(['idle', 'prize_done', 'all_done']), '', 'restore'),
    btn('bonus', t('bar.bonus'), clicker ? 'Shift+B' : 'B', clicker ? 'Shift+B' : 'B', can(['idle', 'prize_done', 'all_done']), '', 'plus'),
  ];
  const sec = [];
  const cs = ctl.ui.cardSelect;
  if (cs && cs.active && !cs.recall) sec.push(btn('cardExit', t('btn.cancel'), 'Esc', 'Escape', true, 'ws-cb-line'));
  else if (phase === 'reveal') sec.push(btn('void', t('btn.void'), 'V', 'V', !ctl.ui.overlay, 'ws-cb-void'));
  if (ctl.revokeVisible(ev)) sec.push(btn('revoke', t('bar.revoke'), 'V', 'V', true, 'ws-cb-line'));
  if (phase === 'armed') {
    sec.push({ note: t('stage.armedHintMirror') });
    sec.push(btn('disarm', t('bar.disarm'), 'Esc', 'Escape', true, 'ws-cb-line'));
  }
  const right = [...sec];
  if (sec.length) right.push({ gap: 32 });
  right.push(
    btn('fullscreen', t('bar.fullscreen'), 'F', 'F', true, '', 'fullscreen', true),
    btn('screen', t('bar.screen'), null, null, true, '', 'eye', true),
    btn('settings', t('bar.settings'), null, null, true, '', 'settings', true),
    btn('help', t('bar.help'), '?', '?', true, '', 'help', true),
    { gap: 48 },
    btn('exit', t('bar.exit'), null, null, true, 'ws-cb-exit', 'exit'),
  );
  // 掌上模式隱藏了底部操作區（投影用）：這列才會出現；不放全螢幕、觀眾視窗、快捷鍵，多一顆「顯示操作區」
  if (ctl.handheld) {
    const drop = new Set(['fullscreen', 'screen', 'help']);
    return { left, right: [btn('handDock', t('hand.showDock'), null, null, true, 'ws-cb-line'), ...right.filter(d => !d.gap && !drop.has(d.id))] };
  }
  return { left, right };
}

function renderGroup(ctl, el, items) {
  const key = JSON.stringify(items);
  if (el._key === key) return;
  el._key = key;
  fill(el, items.map((d) => {
    if (d.gap) return h('span', { class: 'ws-cb-gap', style: { width: d.gap + 'px' }, 'aria-hidden': 'true' });
    if (d.note) return h('span', { class: 'ws-cb-note' }, d.note);
    return h('button', {
      type: 'button', class: 'ws-cb ' + (d.tool ? 'ws-cb-tool ' : '') + d.cls, title: d.title, 'aria-label': d.label,
      'aria-keyshortcuts': d.keys, disabled: !d.enabled,
      onclick: () => { const f = ACTIONS[d.id]; if (f) f(ctl); },
    }, d.ic ? icon(d.ic, 18) : null, h('span', { class: 'ws-cb-text' }, d.label));
  }));
}

/** 每次 render 呼叫；chrome（延伸模式 / 主持畫面）不顯示操作列 */
export function renderControlsBar(ctl, bar, parts, ev, chrome, mainModel) {
  if (chrome) { bar.hidden = true; return; }
  bar.hidden = false;
  renderMainBtn(parts, mainModel);
  const { left, right } = barSideItems(ctl, ev);
  renderGroup(ctl, parts.left, left);
  renderGroup(ctl, parts.right, right);
}
