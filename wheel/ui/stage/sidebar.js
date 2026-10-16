// 主持端側欄（延伸模式 / 非投影模式）：獎項（已抽 x / y）、最近得獎（可作廢）、快速動作。
import { h, icon, kbd } from '../dom.js';
import { t, prizeRows, recentRows } from './logic.js';
import { fill } from './util.js';

function markEl(mark) {
  if (mark === 'done') return h('span', { class: 'ws-mark is-done' }, icon('check', 18));
  return h('span', { class: 'ws-mark is-' + mark, 'aria-hidden': 'true' });
}

export function renderSidebar(ctl, side, ev, pv) {
  const phase = ev.stage.phase;
  const canSwitch = ['idle', 'prize_done', 'all_done'].includes(phase);
  const reh = ctl.store.rehearsal;
  const clicker = !!ev.settings.clickerMode;

  const prizes = prizeRows(ev).map(r => h('li', {},
    h('button', {
      type: 'button', class: `ws-prow is-${r.mark}${r.current ? ' is-current' : ''}`,
      disabled: !r.selectable || !canSwitch, onclick: () => ctl.switchPrize(r.id),
      'aria-current': r.current ? 'true' : null,
    },
    markEl(r.mark),
    h('span', { class: 'ws-prow-n' }, `${r.order}  ${r.name}`),
    r.big ? h('span', { class: 'ws-prow-big', title: t('side.bigPrize') }, icon('star', 16)) : null,
    r.bonus ? h('span', { class: 'ws-badge' }, t('side.bonusBadge', { n: r.bonus })) : null,
    reh ? h('span', { class: 'ws-small' }, t('side.rehearsalSmall')) : null,
    h('span', { class: 'ws-prow-c' }, r.drawn))));

  const canVoidRecent = ['idle', 'prize_done', 'all_done'].includes(phase);
  const recent = recentRows(ev, 5);
  const recentList = recent.length ? recent.map(r => h('li', { class: 'ws-rrow is-' + r.status },
    h('span', { class: 'ws-rrow-seq' }, '#' + r.seq),
    h('span', { class: 'ws-rrow-main' }, `${r.prize} ${r.name}`, r.group && !r.name.includes('（') ? h('span', { class: 'ws-small' }, ' ' + r.group) : null),
    reh ? h('span', { class: 'ws-small' }, t('side.rehearsalSmall')) : null,
    r.canVoid
      ? h('button', { type: 'button', class: 'ws-mini-btn', disabled: !canVoidRecent, onclick: () => ctl.openVoid([r.id], true) }, t('btn.void'))
      : h('span', { class: 'ws-small' }, r.statusText)))
    : [h('li', { class: 'ws-empty' }, t('side.noRecent'))];

  const can = (list) => list.includes(phase);
  const actBtn = (label, key, fn, enabled = true, ic = null) => h('button', { type: 'button', class: 'ws-side-act', disabled: !enabled, onclick: fn },
    ic ? icon(ic, 18) : null, h('span', {}, label), key ? kbd(key) : null);

  fill(side, 
    h('section', { class: 'ws-side-sec' },
      h('h3', { class: 'ws-side-h' }, h('span', {}, t('side.prizes')), kbd('P')),
      h('ul', { class: 'ws-plist' }, prizes)),
    h('section', { class: 'ws-side-sec' },
      h('h3', { class: 'ws-side-h' }, h('span', {}, t('side.recent')), kbd('R')),
      h('ul', { class: 'ws-rlist' }, recentList)),
    h('section', { class: 'ws-side-sec ws-side-acts' },
      actBtn(t('side.roster'), 'L', () => ctl.act('quickList'), can(['idle', 'prize_done']), 'users'),
      actBtn(clicker ? t('side.bonusClicker') : t('side.bonus'), clicker ? 'Shift+B' : 'B', () => ctl.act('bonus'), can(['idle', 'prize_done', 'all_done']), 'plus'),
      actBtn(t('bar.screen'), null, () => ctl.openAudience(), true, 'eye'),
      actBtn(reh ? t('bar.rehearsalOnTitle') : t('bar.rehearsalOffTitle'), null, () => ctl.toggleRehearsal(), true, 'restore'),
      actBtn(t('bar.settings'), null, () => ctl.openOverlay('stage_settings', ctl.overlays().stageSettings(ctl)), true, 'settings'),
      actBtn(t('bar.help'), '?', () => ctl.act('help'), true, 'help'),
      actBtn(t('bar.fullscreen'), 'F', () => ctl.toggleFullscreen(), true, 'fullscreen'),
      h('div', { class: 'ws-side-gap' }),
      actBtn(t('bar.exit'), null, () => ctl.requestExit(), true, 'exit')),
  );
}
