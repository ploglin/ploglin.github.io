// 加碼浮層（D.8）：現有獎項加名額 / 新增臨時獎項。兩個分頁都是最常見情境 2 次操作。
// 鍵位：B（簡報筆模式改用 Shift+B）開啟；數字鍵 1–6 = 加幾名；Enter 送出；Esc 取消。
import { h } from '../dom.js';
import { t } from './logic.js';
import { sortedPrizes, prizeCounts, groupOrder, prizeById } from '../../core/model.js';
import { candidateCount } from '../../core/pool.js';

export function bonusSpec(ctl) {
  const ev0 = ctl.ev;
  const list0 = sortedPrizes(ev0);
  const st = {
    tab: 'quota',
    prizeId: (prizeById(ev0, ev0.stage.currentPrizeId) || list0[0] || {}).id,
    delta: 1, custom: '', reason: t('bonus.reasonDefault'),
    name: '', quantity: 1, perDraw: 1, eligMode: 'all', eligGroup: '', repeat: 'inherit', when: 'now',
    err: '',
  };
  let modal = null;

  const field = (label, ...kids) => h('label', { class: 'ws-field' }, h('span', { class: 'ws-field-l' }, label), ...kids);

  function quotaBody() {
    const ev = ctl.ev;
    const sel = h('select', { class: 'ws-input' }, sortedPrizes(ev).map((p) => {
      const c = prizeCounts(ev, p);
      const lab = ctl.hostChrome ? `${p.name}（${t('stage.drawnOf', { c: c.confirmed, q: p.quantity })}）` : `${p.name}（${t('stage.remaining', { n: c.remaining })}）`;
      return h('option', { value: p.id, selected: p.id === st.prizeId }, lab);
    }));
    sel.addEventListener('change', () => { st.prizeId = sel.value; rebuild(); });
    const chips = h('div', { class: 'ws-seg' }, [1, 2, 3, 5].map(n => h('button', {
      type: 'button', class: 'ws-seg-btn' + (!st.custom && st.delta === n ? ' is-on' : ''), 'aria-pressed': !st.custom && st.delta === n ? 'true' : 'false',
      onclick: () => { st.delta = n; st.custom = ''; rebuild(); },
    }, '+' + n)));
    const custom = h('input', { type: 'number', class: 'ws-input ws-input-s', min: '1', max: '999', step: '1', value: st.custom, 'aria-label': t('bonus.custom') });
    custom.addEventListener('input', () => { st.custom = custom.value; updatePreview(); });
    const reason = h('input', { type: 'text', class: 'ws-input', maxlength: '60', value: st.reason });
    reason.addEventListener('input', () => { st.reason = reason.value; });
    return [
      field(t('bonus.prize'), sel),
      h('div', { class: 'ws-field' }, h('span', { class: 'ws-field-l' }, t('bonus.delta')), chips, h('span', { class: 'ws-small' }, t('bonus.custom')), custom),
      field(t('bonus.reason'), reason),
      h('p', { class: 'ws-preview', dataset: { preview: '1' } }, previewText()),
    ];
  }

  function deltaValue() {
    if (st.custom !== '') { const n = Number(st.custom); return Number.isInteger(n) && n >= 1 ? n : NaN; }
    return st.delta;
  }

  function previewText() {
    const ev = ctl.ev;
    const p = prizeById(ev, st.prizeId);
    const d = deltaValue();
    if (!p || !Number.isFinite(d)) return '';
    const c = prizeCounts(ev, p);
    const n = candidateCount(ev, p);
    const pool = n >= c.remaining + d ? t('bonus.poolOk', { n }) : t('bonus.poolLow', { n });
    return t('bonus.preview', { name: p.name, from: p.quantity, to: p.quantity + d, pool });
  }
  function updatePreview() { const el = modal && modal.body.querySelector('[data-preview]'); if (el) el.textContent = previewText(); }

  function prizeBody() {
    const ev = ctl.ev;
    const groups = [...groupOrder(ev).keys()];
    const name = h('input', { type: 'text', class: 'ws-input', maxlength: '40', value: st.name, required: true, autofocus: true });
    name.addEventListener('input', () => { st.name = name.value; });
    const qty = h('input', { type: 'number', class: 'ws-input ws-input-s', min: '1', max: '999', step: '1', value: String(st.quantity) });
    qty.addEventListener('input', () => { st.quantity = qty.value; });
    const per = h('input', { type: 'number', class: 'ws-input ws-input-s', min: '1', max: '999', step: '1', value: String(st.perDraw) });
    per.addEventListener('input', () => { st.perDraw = per.value; });
    const elig = h('select', { class: 'ws-input' },
      h('option', { value: 'all', selected: st.eligMode === 'all' }, t('bonus.eligAll')),
      groups.length ? h('option', { value: 'include', selected: st.eligMode === 'include' }, t('bonus.eligInclude')) : null,
      groups.length ? h('option', { value: 'exclude', selected: st.eligMode === 'exclude' }, t('bonus.eligExclude')) : null);
    const grp = h('select', { class: 'ws-input', hidden: st.eligMode === 'all' }, groups.map(g => h('option', { value: g, selected: g === st.eligGroup }, g)));
    elig.addEventListener('change', () => { st.eligMode = elig.value; grp.hidden = st.eligMode === 'all'; if (!st.eligGroup) st.eligGroup = groups[0] || ''; });
    grp.addEventListener('change', () => { st.eligGroup = grp.value; });
    const rep = h('select', { class: 'ws-input' },
      [['inherit', t('bonus.repeatInherit')], ['allow', t('bonus.repeatAllow')], ['deny', t('bonus.repeatDeny')]].map(([v, l]) => h('option', { value: v, selected: v === st.repeat }, l)));
    rep.addEventListener('change', () => { st.repeat = rep.value; });
    const whens = [['now', t('bonus.whenNow')], ['after', t('bonus.whenAfter')], ['last', t('bonus.whenLast')]].map(([v, l]) => {
      const r = h('input', { type: 'radio', name: 'ws-bonus-when', value: v, checked: st.when === v });
      r.addEventListener('change', () => { st.when = v; modal.setActions(actions()); });
      return h('label', { class: 'ws-radio' }, r, h('span', {}, l));
    });
    return [
      field(t('bonus.name') + ' *', name),
      h('div', { class: 'ws-field' }, h('span', { class: 'ws-field-l' }, t('bonus.quantity') + ' *'), qty, h('span', { class: 'ws-small' }, t('bonus.perDraw')), per),
      h('div', { class: 'ws-field' }, h('span', { class: 'ws-field-l' }, t('bonus.eligibility')), elig, grp, h('span', { class: 'ws-small' }, t('bonus.repeat')), rep),
      h('div', { class: 'ws-field' }, h('span', { class: 'ws-field-l' }, t('bonus.when')), h('div', { class: 'ws-radios ws-radios-row' }, whens)),
    ];
  }

  function body() {
    const tabs = h('div', { class: 'ws-tabs', role: 'tablist' },
      [['quota', t('bonus.tabQuota')], ['prize', t('bonus.tabPrize')]].map(([v, l]) => h('button', {
        type: 'button', role: 'tab', class: 'ws-tab' + (st.tab === v ? ' is-on' : ''), 'aria-selected': st.tab === v ? 'true' : 'false', dataset: { tab: v },
        onclick: () => { st.tab = v; st.err = ''; rebuild(true); },
      }, l)));
    const form = h('div', { class: 'ws-form' }, st.tab === 'quota' ? quotaBody() : prizeBody());
    form.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && e.target.tagName !== 'SELECT' && e.target.tagName !== 'BUTTON') { e.preventDefault(); submit(); }
    });
    return [tabs, form, st.err ? h('p', { class: 'ws-err', role: 'alert' }, st.err) : null, ctl.hostChrome ? h('p', { class: 'ws-modal-hint' }, t('bonus.keyHint')) : null];
  }

  function actions() {
    return [
      { label: t('btn.cancel'), kind: 'ghost', id: 'cancel', onClick: () => ctl.closeOverlay() },
      { label: st.tab === 'quota' ? t('bonus.submitQuota') : (st.when === 'now' ? t('bonus.submitPrizeNow') : t('bonus.submitPrize')), kind: 'primary', id: 'ok', onClick: submit },
    ];
  }

  function rebuild(focusTab) {
    if (!modal) return;
    const a = document.activeElement;
    const keepIdx = a && modal.body.contains(a) ? [...modal.body.querySelectorAll('button,input,select')].indexOf(a) : -1;
    modal.setBody(body());
    modal.setActions(actions());
    const all = [...modal.body.querySelectorAll('button,input,select')];
    if (focusTab) { const tb = modal.body.querySelector('.ws-tab.is-on'); if (tb) tb.focus(); }
    else if (keepIdx >= 0 && all[keepIdx]) all[keepIdx].focus();
  }

  function submit() {
    if (st.tab === 'quota') {
      const d = deltaValue();
      if (!Number.isInteger(d) || d < 1) { st.err = t('bonus.errDelta'); rebuild(); return; }
      ctl.submitBonus('quota', { prizeId: st.prizeId, delta: d, reason: (st.reason || '').trim() || t('bonus.reasonDefault') });
      return;
    }
    const name = (st.name || '').trim();
    const q = Number(st.quantity), per = Number(st.perDraw);
    if (!name) { st.err = t('bonus.errName'); rebuild(); return; }
    if (!Number.isInteger(q) || q < 1 || !Number.isInteger(per) || per < 1 || per > q) { st.err = t('bonus.errQty'); rebuild(); return; }
    const eligibility = st.eligMode === 'all' || !st.eligGroup ? { mode: 'all' } : { mode: st.eligMode, groups: [st.eligGroup] };
    const allowRepeatWinners = st.repeat === 'allow' ? true : st.repeat === 'deny' ? false : null;
    ctl.submitBonus('prize', { fields: { name, quantity: q, perDraw: per, eligibility, allowRepeatWinners }, when: st.when });
  }

  return {
    title: t('bonus.title'), className: 'ws-modal-wide',
    body: [], actions: [],
    onOpen: (m) => { modal = m; m.setBody(body()); m.setActions(actions()); },
    initialFocus: () => (st.tab === 'quota'
      ? document.querySelector('.ws-modal .ws-btn-primary')
      : document.querySelector('.ws-modal input[type=text]')),
    onDigit: (n) => { if (st.tab === 'quota' && n >= 1) { st.delta = n; st.custom = ''; rebuild(); } },
    onEnter: () => {
      const a = document.activeElement;
      if (a && modal && modal.el.contains(a) && (a.classList.contains('ws-tab') || a.dataset.id === 'cancel' || a.classList.contains('ws-icon-btn'))) { a.click(); return; }
      submit();
    },
  };
}
