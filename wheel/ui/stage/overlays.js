// 舞台浮層內容：獎項選單（P）、最近得獎抽屜（R）、叫回最近確認的一批、未到場規則詢問、
// 切正式確認、結束彩排三選一（含 promote 起點）、上次彩排未結束、退出舞台、舞台設定、快捷鍵說明。
// 鏡像投影時這些浮層會被觀眾看到：文字中性、不出現作廢原因；主持人介面可見時才顯示鍵位提示。
import { h, kbd } from '../dom.js';
import { t, prizeRows, recentRows } from './logic.js';
import { sandboxDraws, sandboxDiff } from '../../core/rehearsal.js';
import { prizeById, displayName, sameNameSet } from '../../core/model.js';
import S from '../i18n-stage.js';

const hint = (ctl, text) => (ctl.hostChrome ? h('p', { class: 'ws-modal-hint' }, text) : null);

// ---------- P 獎項選單 ----------
export function prizeMenu(ctl) {
  const build = () => {
    const ev = ctl.ev;
    return [
      h('div', { class: 'ws-list', role: 'list' }, prizeRows(ev).map(r => h('button', {
        type: 'button', class: 'ws-list-item' + (r.current ? ' is-current' : ''), 'data-nav': '1', dataset: { id: r.id },
        disabled: !r.selectable, onclick: () => ctl.switchPrize(r.id),
      },
      h('span', { class: 'ws-li-main' }, `${r.order}　${r.name}`),
      h('span', { class: 'ws-li-side' },
        r.mark === 'skipped' ? t('prizeMenu.skipped')
          : r.mark === 'done' ? t('prizeMenu.done')
            : ctl.hostChrome ? r.drawn : t('stage.remaining', { n: r.remaining }))))),
      hint(ctl, t('prizeMenu.hint')),
    ];
  };
  return {
    title: t('prizeMenu.title'), className: 'ws-modal-list', body: build(),
    initialFocus: () => document.querySelector('.ws-modal .ws-list-item.is-current:not([disabled])'),
  };
}

// ---------- R 最近得獎抽屜 ----------
export function recent(ctl) {
  const ev = ctl.ev;
  const rows = recentRows(ev, 5);
  const list = rows.length ? rows.map(r => h('button', {
    type: 'button', class: 'ws-list-item ws-recent-item', 'data-nav': '1', disabled: !r.canVoid,
    onclick: () => { if (r.canVoid) ctl.openVoid([r.id], true); },
  },
  h('span', { class: 'ws-li-seq' }, '#' + r.seq),
  h('span', { class: 'ws-li-main' }, `${r.prize}　${r.name}`),
  h('span', { class: 'ws-li-side' }, r.statusText),
  r.canVoid ? h('span', { class: 'ws-li-act' }, t('recent.action')) : null))
    : [h('p', { class: 'ws-empty' }, t('recent.empty'))];
  return {
    title: t('recent.title'), className: 'ws-modal-list',
    body: [h('div', { class: 'ws-list' }, list)],
    initialFocus: () => document.querySelector('.ws-modal .ws-recent-item:not([disabled])'),
  };
}

// ---------- V（多名批次）：叫回最近確認的一批 ----------
export function batchRecall(ctl) {
  const build = () => {
    const ev = ctl.ev;
    const cs = ctl.ui.cardSelect;
    if (!cs) return [];
    const dup = sameNameSet(ev);
    const cards = cs.recs.map(r => h('button', {
      type: 'button',
      class: 'ws-card is-shown ws-recall-card' + (cs.focus === r.slot ? ' is-focus' : '') + (cs.picked.includes(r.slot) ? ' is-picked' : ''),
      onclick: () => { cs.focus = r.slot; ctl.cardAction('card.toggle'); },
    }, h('div', { class: 'ws-name' }, displayName(ev, r.snapshot, dup)), r.snapshot.group ? h('div', { class: 'ws-group' }, r.snapshot.group) : null));
    const p = prizeById(ev, cs.recs[0].prizeId);
    return [
      p ? h('p', { class: 'ws-modal-sub' }, p.name) : null,
      h('div', { class: 'ws-recall', style: { '--cols': cs.cols } }, cards),
      hint(ctl, t('recall.hint')),
    ];
  };
  return {
    title: t('recall.title'), className: 'ws-modal-wide', body: build(),
    actions: [
      { label: t('btn.cancel'), kind: 'ghost', onClick: () => ctl.closeOverlay() },
      { label: t('btn.revoke'), kind: 'primary', onClick: () => ctl.cardAction('card.void') },
    ],
    initialFocus: () => document.querySelector('.ws-modal .ws-btn-primary'),
    refresh: (m) => m.setBody(build()),
  };
}

// ---------- 未到場者保留資格（第一次作廢前問一次） ----------
export function askAbsent(ctl, done) {
  return {
    title: t('absent.title'),
    body: [h('p', {}, t('absent.body'))],
    actions: [
      { label: t('absent.drop'), kind: 'ghost', onClick: () => done(false) },
      { label: t('absent.keep'), kind: 'primary', focus: true, onClick: () => done(true) },
    ],
  };
}

// ---------- 彩排 → 正式（沙盒沒有抽獎） ----------
export function confirmLive(ctl) {
  return {
    title: t('rehearsal.liveTitle'),
    body: [h('p', {}, t('rehearsal.liveBody'))],
    actions: [
      { label: t('btn.cancel'), kind: 'ghost', onClick: () => ctl.closeOverlay() },
      { label: t('rehearsal.liveGo'), kind: 'primary', focus: true, onClick: () => ctl.discardRehearsal('live') },
    ],
  };
}

/** promote 起點選擇（C.8 v1.3）：fromIndex 之前的彩排抽獎以「誤觸」作廢後一併轉入 */
function promotePanel(ctl, m) {
  const sb = ctl.store.sandbox;
  const ev = sb.event;
  const dup = sameNameSet(ev);
  const list = sandboxDraws(sb);
  let from = 0;
  const radios = list.map((d, i) => {
    const p = prizeById(ev, d.prizeId);
    const label = i === 0 ? t('rehearsal.promoteAll')
      : t('rehearsal.promoteFrom', { i: i + 1, seq: t('stage.seq', { n: d.seq }), prize: p ? p.name : '', name: displayName(ev, d.snapshot, dup) });
    const inp = h('input', { type: 'radio', name: 'ws-promote-from', value: String(i), checked: i === 0 });
    inp.addEventListener('change', () => { from = i; });
    inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); go(); } });
    return h('label', { class: 'ws-radio' }, inp, h('span', {}, label));
  });
  const go = () => ctl.promote(from);
  m.setBody([h('p', {}, t('rehearsal.promoteBody')), h('div', { class: 'ws-radios' }, radios)]);
  m.setActions([
    { label: t('btn.cancel'), kind: 'ghost', focus: true, onClick: () => ctl.closeOverlay() },
    { label: t('rehearsal.promoteGo'), kind: 'primary', onClick: go },
  ]);
  m.el.querySelector('.ws-modal-title').textContent = t('rehearsal.promoteTitle');
  setTimeout(() => m.focusDefault(), 0);
}

// ---------- 結束彩排三選一（預設焦點：取消） ----------
export function rehearsalExit(ctl, target, n) {
  const sb = ctl.store.sandbox;
  const diff = sb && ctl.store.official ? sandboxDiff(ctl.store.official, sb) : { bonus: 0, roster: 0 };
  let modal = null;
  return {
    title: t('rehearsal.exitTitle'),
    body: [h('p', {}, t('rehearsal.exitBody', { n })), diff.bonus || diff.roster ? h('p', { class: 'ws-modal-sub' }, t('rehearsal.exitExtra')) : null],
    actions: [
      { label: t('rehearsal.discard'), kind: 'danger', onClick: () => ctl.discardRehearsal(target) },
      { label: t('rehearsal.promote'), kind: 'ghost', onClick: () => promotePanel(ctl, modal) },
      { label: t('btn.cancel'), kind: 'primary', focus: true, onClick: () => ctl.closeOverlay() },
    ],
    onOpen: (m) => { modal = m; },
  };
}

// ---------- 上次彩排未結束（C.7-31） ----------
export function resumeRehearsal(ctl, n) {
  let modal = null;
  return {
    title: t('rehearsal.resumeTitle'),
    body: [h('p', {}, t('rehearsal.resumeBody', { n }))],
    actions: [
      { label: t('rehearsal.resume'), kind: 'primary', focus: true, onClick: () => ctl.closeOverlay() },
      { label: t('rehearsal.discard'), kind: 'danger', onClick: () => ctl.discardRehearsal('live') },
      { label: t('rehearsal.promote'), kind: 'ghost', onClick: () => promotePanel(ctl, modal) },
    ],
    onOpen: (m) => { modal = m; },
  };
}

// ---------- 退出舞台 ----------
export function exitStage(ctl) {
  return {
    title: t('exit.title'),
    body: [h('p', {}, t('exit.body'))],
    actions: [
      { label: t('btn.cancel'), kind: 'ghost', focus: true, onClick: () => ctl.closeOverlay() },
      { label: t('exit.go'), kind: 'primary', onClick: () => ctl.exitNow() },
    ],
  };
}

// ---------- 舞台設定（音效 / 動畫 / 主題） ----------
export function stageSettings(ctl) {
  const save = (fn) => ctl.commit(fn, { debounce: true }).catch(() => {});
  const seg = (name, value, options, onPick) => h('div', { class: 'ws-seg', role: 'radiogroup', 'aria-label': name },
    options.map(([v, label]) => h('button', {
      type: 'button', class: 'ws-seg-btn' + (v === value ? ' is-on' : ''), role: 'radio', 'aria-checked': v === value ? 'true' : 'false',
      onclick: () => onPick(v),
    }, label)));
  const build = () => {
    const s = ctl.ev.settings;
    const snd = !!(s.sound && s.sound.enabled);
    return [
      h('div', { class: 'ws-field' }, h('span', { class: 'ws-field-l' }, t('settings.sound')),
        seg(t('settings.sound'), snd, [[true, t('settings.on')], [false, t('settings.off')]], (v) => { save((e) => { e.settings.sound = { ...(e.settings.sound || {}), enabled: v }; }); if (v) ctl.audio.unlock(); })),
      h('div', { class: 'ws-field' }, h('span', { class: 'ws-field-l' }, t('settings.confetti')),
        seg(t('settings.confetti'), s.confetti !== false, [[true, t('settings.on')], [false, t('settings.off')]], (v) => save((e) => { e.settings.confetti = v; }))),
      h('div', { class: 'ws-field' }, h('span', { class: 'ws-field-l' }, t('settings.motion')),
        seg(t('settings.motion'), s.motion || 'system', [['system', t('settings.motionSystem')], ['full', t('settings.motionFull')], ['reduced', t('settings.motionReduced')]], (v) => save((e) => { e.settings.motion = v; }))),
      h('div', { class: 'ws-field' }, h('span', { class: 'ws-field-l' }, t('settings.theme')),
        seg(t('settings.theme'), s.stageTheme || 'midnight', [['midnight', t('settings.themeMidnight')], ['festive', t('settings.themeFestive')], ['plain', t('settings.themePlain')]], (v) => save((e) => { e.settings.stageTheme = v; }))),
    ];
  };
  return {
    title: t('settings.title'), body: build(),
    actions: [{ label: t('btn.close'), kind: 'primary', onClick: () => ctl.closeOverlay() }],
    refresh: (m) => {
      const a = document.activeElement;
      const idx = a ? [...m.body.querySelectorAll('button')].indexOf(a) : -1;
      m.setBody(build());
      if (idx >= 0) { const b = m.body.querySelectorAll('button')[idx]; if (b) b.focus(); }
    },
  };
}

// ---------- 掌上模式「⋯ 功能」底部選單 ----------
// 不放全螢幕、觀眾視窗、快捷鍵；每一項先關掉選單再執行（多半會再開另一個浮層）。
export function handMenu(ctl) {
  const items = () => {
    const ev = ctl.ev;
    const ph = ev.stage.phase;
    const can = (list) => list.includes(ph);
    const reh = ctl.store.rehearsal;
    const snd = !!(ev.settings.sound && ev.settings.sound.enabled);
    return [
      { id: 'prizes', label: t('hand.prizes'), on: can(['idle', 'armed', 'prize_done', 'all_done']), fn: () => ctl.act('prizeMenu', ph === 'armed' ? 'disarm' : undefined) },
      { id: 'roster', label: t('hand.roster'), on: can(['idle', 'prize_done']), fn: () => ctl.act('quickList') },
      { id: 'recent', label: t('hand.recent'), on: can(['idle', 'prize_done', 'all_done']), fn: () => ctl.act('recent') },
      { id: 'bonus', label: t('hand.bonus'), on: can(['idle', 'prize_done', 'all_done']), fn: () => ctl.act('bonus') },
      { id: 'sound', label: t('hand.sound'), side: snd ? t('settings.on') : t('settings.off'), on: true, fn: () => ctl.act('mute') },
      reh ? { id: 'skip', label: t('hand.skip'), on: ph === 'spinning', fn: () => ctl.act('skip') } : null,
      { id: 'settings', label: t('hand.settings'), on: true, fn: () => ctl.openOverlay('stage_settings', stageSettings(ctl)) },
      { id: 'rehearsal', label: reh ? t('bar.rehearsalOnTitle') : t('bar.rehearsalOffTitle'), on: true, fn: () => ctl.toggleRehearsal() },
      { id: 'dock', label: t('hand.hideDock'), side: t('settings.off'), on: true, fn: () => ctl.setHandDock(false) },
      { id: 'exit', label: t('hand.exit'), on: true, fn: () => ctl.requestExit() },
    ].filter(Boolean);
  };
  let key = '';
  const build = (list) => [h('div', { class: 'ws-list' }, list.map(it => h('button', {
    type: 'button', class: 'ws-list-item', 'data-nav': '1', disabled: !it.on,
    onclick: () => { ctl.closeOverlay(); it.fn(); },
  }, h('span', { class: 'ws-li-main' }, it.label), it.side ? h('span', { class: 'ws-li-side' }, it.side) : null)))];
  const first = items();
  key = JSON.stringify(first.map(it => [it.id, it.label, it.side, it.on]));
  return {
    title: t('hand.menuTitle'), className: 'ws-modal-list', body: build(first),
    // 舞台每次重繪都會呼叫：內容沒變就不重建，免得手指按下時按鈕被換掉
    refresh: (m) => {
      const list = items();
      const k = JSON.stringify(list.map(it => [it.id, it.label, it.side, it.on]));
      if (k !== key) { key = k; m.setBody(build(list)); }
    },
  };
}

// ---------- ? 快捷鍵說明（鏡像模式不含作廢原因對照） ----------
export function help(ctl) {
  const ev = ctl.ev;
  const rows = [...helpRows()];
  if (ctl.store.rehearsal) rows.push(helpExtra('rehearsalRow'));
  if (ev.settings.clickerMode) rows.push(helpExtra('clickerRow'));
  const body = [h('table', { class: 'ws-help' }, h('tbody', {}, rows.map(([k, d]) => h('tr', {}, h('th', {}, kbd(k)), h('td', {}, d)))))];
  if (!ctl.mirror) body.push(h('h3', { class: 'ws-help-h' }, t('help.reasonsTitle')), h('p', {}, t('help.reasons')));
  return { title: t('help.title'), body, className: 'ws-modal-wide', actions: [{ label: t('btn.close'), kind: 'primary', onClick: () => ctl.closeOverlay() }] };
}

function helpRows() { return (S.help && S.help.rows) || []; }
function helpExtra(k) { return (S.help && S.help[k]) || ['', '']; }
