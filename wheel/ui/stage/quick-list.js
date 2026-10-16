// 名單快速操作（L，D.5）：搜尋 → 排除 / 恢復；搜不到時「新增『王小明』到 [群組]」（遲到者，source: 'stage'）。
// 都寫 log（inStage），只影響下一次開轉。
import { h } from '../dom.js';
import { t } from './logic.js';
import { groupOrder } from '../../core/model.js';
import { fill } from './util.js';

const norm = (s) => String(s || '').normalize('NFKC').replace(/\s+/g, '').toLowerCase();

export function quickListSpec(ctl) {
  const st = { q: '', group: '' };
  let modal = null;
  const input = h('input', { type: 'search', class: 'ws-input ws-input-wide', placeholder: t('quick.search'), autocomplete: 'off', 'aria-label': t('quick.search') });
  const results = h('div', { class: 'ws-list ws-quick-list' });
  input.addEventListener('input', () => { st.q = input.value; renderResults(); });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); const f = results.querySelector('button'); if (f) f.focus(); }
    if (e.key === 'Enter') {
      e.preventDefault();
      const first = results.querySelector('button[data-primary]') || results.querySelector('button');
      if (first) first.click();
    }
  });

  function renderResults() {
    const ev = ctl.ev;
    const q = norm(st.q);
    const winners = new Set(ev.draws.filter(d => d.status === 'confirmed').map(d => d.participantId));
    const rows = [];
    if (q) {
      const hits = ev.participants.filter(p => norm(p.name).includes(q) || norm(p.group).includes(q) || norm(p.code).includes(q)).slice(0, 8);
      for (const p of hits) {
        const tags = [];
        if (p.group) tags.push(p.group);
        if (p.weight > 1) tags.push(t('quick.weight', { n: p.weight }));
        if (p.excluded) tags.push(t('quick.excludedTag'));
        if (winners.has(p.id)) tags.push(t('quick.wonTag'));
        rows.push(h('div', { class: 'ws-qrow' + (p.excluded ? ' is-excluded' : '') },
          h('span', { class: 'ws-li-main' }, p.name), h('span', { class: 'ws-small' }, tags.join(' · ')),
          h('button', {
            type: 'button', class: 'ws-mini-btn', 'data-nav': '1',
            onclick: async () => { await ctl.rosterOp(p.excluded ? 'restore' : 'exclude', { id: p.id }); renderResults(); },
          }, p.excluded ? t('quick.restore') : t('quick.exclude'))));
      }
      const exact = ev.participants.some(p => norm(p.name) === q);
      if (!exact && st.q.trim()) {
        const groups = [...groupOrder(ev).keys()];
        if (!st.group && groups.length) st.group = groups[0];
        const sel = h('select', { class: 'ws-input', 'aria-label': t('quick.add', { name: st.q.trim() }) },
          h('option', { value: '', selected: !st.group }, t('quick.noGroup')),
          groups.map(g => h('option', { value: g, selected: g === st.group }, g)));
        sel.addEventListener('change', () => { st.group = sel.value; });
        rows.push(h('div', { class: 'ws-qrow ws-qadd' },
          h('span', { class: 'ws-li-main' }, t('quick.add', { name: st.q.trim() })), sel,
          h('button', {
            type: 'button', class: 'ws-mini-btn ws-mini-primary', 'data-nav': '1', 'data-primary': '1',
            onclick: async () => {
              const name = st.q.trim().slice(0, 40);
              if (!name) return;
              await ctl.rosterOp('add', { name, group: st.group });
              renderResults();
            },
          }, t('quick.addBtn'))));
      }
      if (!rows.length) rows.push(h('p', { class: 'ws-empty' }, t('quick.none')));
    }
    fill(results, ...rows);
  }

  return {
    title: t('quick.title'), className: 'ws-modal-wide',
    body: [input, results, h('p', { class: 'ws-modal-hint' }, t('quick.note')), ctl.store.rehearsal ? h('p', { class: 'ws-modal-sub' }, t('quick.rehearsalNote')) : null],
    actions: [{ label: t('btn.close'), kind: 'primary', onClick: () => ctl.closeOverlay() }],
    onOpen: (m) => { modal = m; },
    initialFocus: () => input,
    onEnter: () => { const a = document.activeElement; if (a && a.tagName === 'BUTTON' && modal.el.contains(a)) a.click(); },
  };
}
