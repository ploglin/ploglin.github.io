// 投影模式（鏡像）底部操作列：平常隱藏，滑鼠移動或 H 才浮出。
// 會投影出去，所以按鈕上不放鍵位文字（鍵位只放在 title 提示）。
import { h, icon } from '../dom.js';
import { t } from './logic.js';
import { fill } from './util.js';

export function renderControlsBar(ctl, bar, ev, pv, chrome) {
  if (chrome) { bar.replaceChildren(); bar.hidden = true; return; }
  bar.hidden = false;
  const phase = ev.stage.phase;
  const reh = ctl.store.rehearsal;
  const clicker = !!ev.settings.clickerMode;
  const can = (list) => list.includes(phase);
  const b = (label, title, fn, enabled = true, cls = '', ic = null) => h('button', {
    type: 'button', class: 'ws-cb ' + cls, title: title || null, disabled: !enabled,
    onclick: () => { fn(); },
  }, ic ? icon(ic, 18) : null, h('span', {}, label));

  const items = [
    reh
      ? b(t('bar.rehearsalOn'), t('bar.rehearsalOnTitle'), () => ctl.toggleRehearsal(), true, 'ws-cb-reh', null)
      : b(t('bar.rehearsalOff'), t('bar.rehearsalOffTitle'), () => ctl.toggleRehearsal(), true, 'ws-cb-rehoff', null),
    b(t('bar.prizes'), 'P', () => ctl.act('prizeMenu', phase === 'armed' ? 'disarm' : undefined), can(['idle', 'armed', 'prize_done', 'all_done']), '', 'list'),
    b(t('bar.roster'), 'L', () => ctl.act('quickList'), can(['idle', 'prize_done']), '', 'users'),
    b(t('bar.recent'), 'R', () => ctl.act('recent'), can(['idle', 'prize_done', 'all_done']), '', 'restore'),
    b(t('bar.bonus'), clicker ? 'Shift+B' : 'B', () => ctl.act('bonus'), can(['idle', 'prize_done', 'all_done']), '', 'plus'),
  ];
  if (ctl.revokeVisible(ev)) items.push(b(t('bar.revoke'), 'V', () => ctl.act('void.last'), true, 'ws-cb-revoke'));
  if (phase === 'armed') {
    items.push(h('span', { class: 'ws-cb-note' }, t('stage.armedHintMirror')));
    items.push(b(t('bar.disarm'), 'P', () => ctl.act('disarm'), true, 'ws-cb-revoke'));
  }
  items.push(
    b(t('bar.fullscreen'), 'F', () => ctl.toggleFullscreen(), true, '', 'fullscreen'),
    b(t('bar.screen'), '', () => ctl.openAudience(), true, '', 'eye'),
    b(t('bar.settings'), '', () => ctl.openOverlay('stage_settings', ctl.overlays().stageSettings(ctl)), true, '', 'settings'),
    b(t('bar.help'), '?', () => ctl.act('help'), true, '', 'help'),
    h('span', { class: 'ws-cb-gap' }),
    b(t('bar.exit'), '', () => ctl.requestExit(), true, 'ws-cb-exit', 'exit'),
  );
  fill(bar, ...items);
}
