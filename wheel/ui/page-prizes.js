// 獎項管理 #/e/:id/prizes（D.4）：抽獎順序（拖拉 / 上下移）、即時候選人數與 0 人原因、揭曉樣式旁註、範本、刪除 toast 復原。
import { h, icon, popMenu, on, dialog, html } from './dom.js';
import { ctx, edit, editWithUndoToast } from './app-ctx.js';
import { toast } from './toast.js';
import { T, PRIZE_STATUS_LABEL, POOL_STAT_LABEL } from './i18n.js';
import { openPrizeDrawer } from './drawer-prize.js';
import { sortedPrizes, prizeCounts, isBigPrize, createPrize, PRIZE_TEMPLATE, addLog, deepClone, uuid, nowISO } from '../core/model.js';
import { buildPoolDetailed } from '../core/pool.js';
import { styleHint } from '../core/reveal-style.js';
import { closeRemaining } from '../core/draw.js';

const ev = () => ctx.store.official;

/** 資格文字 */
export function eligText(elig) {
  if (!elig || elig.mode === 'all' || !(elig.groups && elig.groups.length)) return T.eligAll;
  return `${elig.mode === 'include' ? T.eligInclude : T.eligExclude} ${elig.groups.join('、')}`;
}

/** 候選 0 人的原因（C.7-2）：依篩除人數由多到少 */
export function zeroReason(e, prize, stats) {
  const parts = Object.entries(stats).filter(([k, n]) => n > 0 && POOL_STAT_LABEL[k]).sort((a, b) => b[1] - a[1]).map(([k, n]) => `${POOL_STAT_LABEL[k]} ${n}`);
  if (!e.participants.length) return '名單是空的';
  const el = prize.eligibility;
  const pre = el && el.mode !== 'all' && el.groups && el.groups.length ? `資格「${eligText(el)}」；` : '';
  return pre + (parts.join('、') || '沒有符合的人');
}

export async function renderPrizes(main, { layout }) {
  const root = h('div', { class: 'wh-page wh-prizes' });
  main.replaceChildren(root);
  let dragId = null;

  function rerender(focusSel) {
    const e = ev(); if (!e) return;
    const list = sortedPrizes(e);
    let quota = 0, done = 0;
    for (const p of list) { quota += p.quantity; done += prizeCounts(e, p).confirmed; }
    const hasDraws = e.draws.length > 0;
    const more = h('button', { type: 'button', class: 'btn btn-ghost', 'aria-haspopup': 'menu' }, icon('more', 18), T.more);
    more.addEventListener('click', () => popMenu(more, [{ label: T.applyTemplate, fn: applyTemplate }]));
    const head = h('div', { class: 'wh-page-head' },
      h('h2', { class: 'wh-h2' }, `${T.tabPrizes} · ${list.length} 項 · ${quota} 名額${hasDraws ? ` · 已抽 ${done}` : ''}`),
      h('div', { class: 'wh-row-gap' },
        h('button', { type: 'button', class: 'btn btn-primary', onclick: () => openPrizeDrawer(null, rerender) }, icon('plus', 18), T.addPrize),
        more));
    if (!list.length) {
      root.replaceChildren(head, h('div', { class: 'wh-empty' },
        icon('gift', 40), h('h2', { class: 'wh-h2' }, T.emptyPrizes), h('p', { class: 'wh-hint' }, T.templateHint),
        h('div', { class: 'wh-row-gap wh-center' },
          h('button', { type: 'button', class: 'btn btn-primary', onclick: applyTemplate }, T.applyTemplate),
          h('button', { type: 'button', class: 'btn btn-ghost', onclick: () => openPrizeDrawer(null, rerender) }, icon('plus', 18), T.addPrize))));
      return;
    }
    const ul = h('ol', { class: 'wh-prize-list', 'aria-label': T.prizeOrderNote });
    list.forEach((p, i) => ul.appendChild(prizeRow(e, p, i, list.length)));
    root.replaceChildren(head, h('p', { class: 'wh-hint' }, T.prizeOrderNote), ul);
    if (focusSel) { const f = root.querySelector(focusSel); if (f) f.focus(); }
  }

  function prizeRow(e, p, i, n) {
    const c = prizeCounts(e, p);
    const bonus = p.bonusLog.filter(b => !b.reverted).reduce((s, b) => s + b.delta, 0);
    const status = p.status === 'skipped' ? 'skipped' : c.confirmed >= p.quantity ? 'done' : p.status === 'active' || c.confirmed > 0 ? 'active' : 'pending';
    const meta = [
      `${T.quota} ${p.quantity}${bonus ? `（${T.bonusTag(bonus)}）` : ''}`,
      `${T.perDraw} ${p.perDraw}（${styleHint(p.perDraw)}）`,
      `${T.eligibility}：${eligText(p.eligibility)}`,
    ];
    if (c.confirmed || c.pending) meta.push(`已抽 ${c.confirmed} / ${p.quantity}`);
    if (p.allowRepeatWinners === true) meta.push('允許重複得獎');
    let cand = null;
    if (status !== 'done' && status !== 'skipped') {
      const { pool, stats } = buildPoolDetailed(e, p);
      cand = pool.length
        ? h('span', { class: 'wh-cand' + (pool.length < Math.min(p.perDraw, Math.max(1, c.remaining)) ? ' is-warn' : '') }, T.candidates(pool.length))
        : h('span', { class: 'wh-cand is-zero' }, icon('warning', 16), `${T.candidatesZero}：${zeroReason(e, p, stats)}`);
    }
    const li = h('li', { class: 'wh-prize', 'data-id': p.id, draggable: 'false' },
      h('button', { type: 'button', class: 'wh-grip icon-btn', 'data-act': 'grip', 'aria-label': `拖拉排序：${p.name}（也可用上下方向鍵）`, title: '拖拉排序' }, icon('grip')),
      h('span', { class: 'wh-prize-no' }, String(i + 1)),
      h('div', { class: 'wh-prize-main' },
        h('div', { class: 'wh-prize-line1' },
          h('button', { type: 'button', class: 'wh-prize-name', 'data-act': 'edit' }, p.name, p.description ? h('span', { class: 'wh-muted' }, ` · ${p.description}`) : ''),
          h('span', { class: `wh-badge wh-badge-p-${status}` }, PRIZE_STATUS_LABEL[status]),
          isBigPrize(e, p.id) ? h('span', { class: 'wh-tag wh-tag-accent' }, T.bigPrize) : '',
          p.isBonus ? h('span', { class: 'wh-tag' }, '加碼獎項') : ''),
        h('div', { class: 'wh-prize-meta' }, meta.join(' · ')),
        cand),
      h('div', { class: 'wh-prize-acts' },
        h('button', { type: 'button', class: 'icon-btn', 'data-act': 'edit', 'aria-label': `${T.edit}：${p.name}` }, icon('edit')),
        h('button', { type: 'button', class: 'icon-btn', 'data-act': 'more', 'aria-label': `${T.more}：${p.name}`, 'aria-haspopup': 'menu' }, icon('more'))));
    return li;
  }

  // ---------- 動作 ----------
  async function move(id, delta) {
    await edit((e) => {
      const list = sortedPrizes(e);
      const i = list.findIndex(p => p.id === id); const j = i + delta;
      if (i < 0 || j < 0 || j >= list.length) return;
      [list[i], list[j]] = [list[j], list[i]];
      list.forEach((p, k) => { p.order = k + 1; });
    });
    rerender(`[data-id="${id}"] [data-act=grip]`);
  }
  async function moveTo(id, beforeId) {
    await edit((e) => {
      const list = sortedPrizes(e);
      const item = list.find(p => p.id === id);
      const rest = list.filter(p => p.id !== id);
      const at = beforeId ? rest.findIndex(p => p.id === beforeId) : rest.length;
      rest.splice(at < 0 ? rest.length : at, 0, item);
      rest.forEach((p, k) => { p.order = k + 1; });
    });
    rerender();
  }
  async function applyTemplate() {
    await editWithUndoToast((e) => {
      const base = e.prizes.length;
      PRIZE_TEMPLATE.forEach((t, i) => e.prizes.push(createPrize(t, base + i + 1)));
      addLog(e, 'prize.add', '套用獎項範本（6 項）');
    }, T.templateApplied, ['prizes'], { onUndo: rerender });
    rerender();
  }
  async function duplicate(p) {
    await edit((e) => {
      const c = deepClone(p);
      Object.assign(c, { id: uuid(), name: `${p.name}（副本）`, bonusLog: [], isBonus: false, status: 'pending', createdAt: nowISO() });
      const list = sortedPrizes(e);
      list.splice(list.findIndex(x => x.id === p.id) + 1, 0, c);
      e.prizes.push(c);
      list.forEach((x, k) => { x.order = k + 1; });
      addLog(e, 'prize.add', `複製獎項「${p.name}」`, { prizeId: c.id });
    });
    rerender();
  }
  async function remove(p) {
    if (ev().draws.some(d => d.prizeId === p.id)) { toast(T.cannotDeletePrize, { kind: 'error' }); return; }
    await editWithUndoToast((e) => {
      e.prizes = e.prizes.filter(x => x.id !== p.id);
      sortedPrizes(e).forEach((x, k) => { x.order = k + 1; });
      addLog(e, 'prize.remove', `刪除獎項「${p.name}」`, { prizeId: p.id });
    }, T.prizeDeleted(p.name), ['prizes'], { onUndo: rerender });
    rerender();
  }
  async function closeRest(p) {
    const ok = await dialog({ title: `${T.closeRemaining}：${p.name}`, body: html`<p>${T.closeRemainingConfirm}</p>`, actions: [{ label: T.cancel, value: false, kind: 'ghost' }, { label: T.closeRemaining, value: true, kind: 'primary', focus: true }] });
    if (!ok) return;
    await edit((e) => closeRemaining(e, p.id));
    rerender();
  }

  on(root, 'click', '[data-act]', (e, el) => {
    const li = el.closest('[data-id]'); if (!li) return;
    const id = li.dataset.id;
    const p = ev().prizes.find(x => x.id === id); if (!p) return;
    const act = el.dataset.act;
    if (act === 'edit') openPrizeDrawer(p, rerender);
    else if (act === 'more') {
      const list = sortedPrizes(ev()); const i = list.findIndex(x => x.id === id);
      const has = ev().draws.some(d => d.prizeId === id);
      const c = prizeCounts(ev(), p);
      popMenu(el, [
        { label: T.edit, fn: () => openPrizeDrawer(p, rerender) },
        { label: T.moveUp, disabled: i === 0, fn: () => move(id, -1) },
        { label: T.moveDown, disabled: i === list.length - 1, fn: () => move(id, 1) },
        { label: T.duplicatePrize, fn: () => duplicate(p) },
        { sep: true },
        { label: T.closeRemaining, disabled: !has || c.remaining <= 0, fn: () => closeRest(p) },
        { label: T.deletePrize, danger: true, disabled: has, fn: () => remove(p) },
      ]);
    }
  });
  // 鍵盤排序：焦點在把手上按上下鍵
  on(root, 'keydown', '[data-act=grip]', (e, el) => {
    const id = el.closest('[data-id]').dataset.id;
    if (e.key === 'ArrowUp') { e.preventDefault(); move(id, -1); }
    if (e.key === 'ArrowDown') { e.preventDefault(); move(id, 1); }
  });
  // 拖拉排序：只有按住把手時整列可拖
  on(root, 'pointerdown', '[data-act=grip]', (e, el) => { el.closest('[data-id]').setAttribute('draggable', 'true'); });
  root.addEventListener('dragstart', (e) => {
    const li = e.target.closest && e.target.closest('[data-id]'); if (!li) return;
    dragId = li.dataset.id; li.classList.add('is-dragging');
    e.dataTransfer.effectAllowed = 'move';
    try { e.dataTransfer.setData('text/plain', dragId); } catch { /* */ }
  });
  root.addEventListener('dragover', (e) => {
    if (!dragId) return;
    const li = e.target.closest && e.target.closest('[data-id]'); if (!li || li.dataset.id === dragId) return;
    e.preventDefault();
    const r = li.getBoundingClientRect();
    const after = e.clientY > r.top + r.height / 2;
    root.querySelectorAll('.drop-before,.drop-after').forEach(x => x.classList.remove('drop-before', 'drop-after'));
    li.classList.add(after ? 'drop-after' : 'drop-before');
  });
  root.addEventListener('drop', (e) => {
    if (!dragId) return;
    e.preventDefault();
    const target = root.querySelector('.drop-before,.drop-after');
    let beforeId = null;
    if (target) {
      if (target.classList.contains('drop-before')) beforeId = target.dataset.id;
      else { const nx = target.nextElementSibling; beforeId = nx && nx.dataset.id !== dragId ? nx.dataset.id : (nx ? (nx.nextElementSibling || {}).dataset?.id || null : null); }
      moveTo(dragId, beforeId);
    }
    dragId = null;
  });
  root.addEventListener('dragend', () => {
    dragId = null;
    root.querySelectorAll('.is-dragging,.drop-before,.drop-after').forEach(x => x.classList.remove('is-dragging', 'drop-before', 'drop-after'));
    root.querySelectorAll('[draggable=true]').forEach(x => x.setAttribute('draggable', 'false'));
  });

  rerender();
  return () => {};
}
