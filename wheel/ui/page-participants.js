// 名單管理 #/e/:id/participants（D.3）
// 依群組分組（預設）/ 清單檢視、群組清單與統計、籤數（編輯入口只在解鎖時出現、唯讀顯示依資料，見 core/unlock.js weightView）、排除＋原因、批次操作（toast 6 s 復原）、去重、匯出、拖放匯入。
// 手機（≤ 720 px）：每人一行（勾選｜姓名＋小字｜狀態標籤｜⋯），列內不放可改值的控制項，改值一律點姓名開編輯面板；
// 群組清單與統計收進「篩選」面板與頁標題下的小字；新增 / 匯入收成右下浮動 ＋；批次列固定在底部分頁列上方。
// 手機專用節點以 .wh-only-m 標示（桌機不顯示），桌機專用以 .wh-only-d 標示（手機不顯示）。
import { h, html, raw, icon, on, popMenu, dialog, promptDialog, noWheel, isPhone } from './dom.js';
import { ctx, edit, editWithUndoToast } from './app-ctx.js';
import { toast } from './toast.js';
import { T, excludeReasonLabel, EXCLUDE_REASON_CHOICES } from './i18n.js';
import { openImportDialog } from './dialog-import.js';
import { PALETTE, groupOrder, sameNameSet, clampWeight, createParticipant } from '../core/model.js';
import { findDuplicates, normalize } from '../core/dedupe.js';
import { weightsUI } from './unlock.js';
import { participantsCSV, participantsWideCSV, fileName, download } from '../io/export.js';

// 檢視狀態（同一活動內切頁後保留）
const state = { eventId: null, view: 'group', q: '', filter: 'all', collapsed: new Set(), selected: new Set(), sort: { key: 'group', dir: 1 } };

function resetFor(id) {
  if (state.eventId === id) return;
  Object.assign(state, { eventId: id, view: 'group', q: '', filter: 'all', collapsed: new Set(), selected: new Set(), sort: { key: 'group', dir: 1 } });
}

const ev = () => ctx.store.official;

/** 群組統計與衍生資料 */
function derive(e) {
  const gmap = groupOrder(e);
  const groups = [...gmap.keys()];
  const counts = new Map(groups.map(g => [g, 0]));
  let ungrouped = 0;
  for (const p of e.participants) { if (p.group) counts.set(p.group, counts.get(p.group) + 1); else ungrouped++; }
  const prizeName = new Map(e.prizes.map(p => [p.id, p.name]));
  const won = new Map(); const hasDraw = new Set();
  for (const d of e.draws) {
    hasDraw.add(d.participantId);
    if (d.status === 'confirmed' || d.status === 'pending') {
      if (!won.has(d.participantId)) won.set(d.participantId, []);
      won.get(d.participantId).push(prizeName.get(d.prizeId) || '');
    }
  }
  // 同名異組：同姓名、群組不同
  const byName = new Map();
  for (const p of e.participants) { const k = normalize(p.name); if (!byName.has(k)) byName.set(k, new Set()); byName.get(k).add(p.group || ''); }
  const sameName = new Set(e.participants.filter(p => byName.get(normalize(p.name)).size > 1).map(p => p.id));
  return { gmap, groups, counts, ungrouped, won, hasDraw, sameName, dup: sameNameSet(e), w: weightsUI(e) };
}

function color(d, g) { return d.gmap.has(g) ? PALETTE[d.gmap.get(g) % PALETTE.length] : 'transparent'; }

function matches(p, d) {
  const f = state.filter;
  if (f === 'eligible' && p.excluded) return false;
  if (f === 'excluded' && !p.excluded) return false;
  if (f === 'winners' && !d.won.has(p.id)) return false;
  if (f === 'samename' && !d.sameName.has(p.id)) return false;
  const q = normalize(state.q).toLowerCase();
  if (!q) return true;
  return [p.name, p.group, p.code].some(v => v && normalize(v).toLowerCase().includes(q));
}

export async function renderParticipants(main, { layout, route }) {
  const e0 = ev();
  resetFor(e0.id);
  if (route.query && route.query.q != null) { state.q = route.query.q; state.view = 'list'; state.filter = 'all'; }
  const root = h('div', { class: 'wh-page wh-participants' });
  main.replaceChildren(root);
  noWheel(root);

  function rerender(focusSel) {
    const e = ev(); if (!e) return;
    const d = derive(e);
    // 清掉已不存在的選取
    const ids = new Set(e.participants.map(p => p.id));
    for (const id of [...state.selected]) if (!ids.has(id)) state.selected.delete(id);
    root.classList.toggle('wh-noweight', !d.w.show);   // 不顯示籤數：格線用不含籤數欄的版本
    renderSide(layout.side, e, d, rerender);
    batchClass();
    if (!e.participants.length) { root.replaceChildren(emptyRoster()); return; }
    root.replaceChildren(header(e, d), toolbar(), listView(e, d), batchBar(e, d), fab());
    if (focusSel) { const f = root.querySelector(focusSel); if (f) f.focus(); }
  }

  /** 手機：有勾選時 toast 要再往上讓出批次列（CSS 看 html.wh-batch-on） */
  function batchClass() { document.documentElement.classList.toggle('wh-batch-on', state.selected.size > 0); }

  // ---------- 頁首 ----------
  function header(e, d) {
    const nGroups = d.groups.length;
    const more = h('button', { type: 'button', class: 'btn btn-ghost', 'aria-haspopup': 'menu' }, icon('more', 18), T.more);
    more.addEventListener('click', () => popMenu(more, [
      { label: T.exportLong, fn: () => download(fileName(e, '名單', 'csv'), participantsCSV(e, { weights: weightsUI(e).show })) },
      { label: T.exportWide, fn: () => download(fileName(e, '名單寬表', 'csv'), participantsWideCSV(e)) },
      { sep: true },
      { label: T.dedupe, fn: () => openDedupe(rerender) },
      { label: state.selected.size ? T.selectNone : T.selectAll, fn: () => {
        if (state.selected.size) state.selected.clear(); else for (const p of e.participants) if (matches(p, d)) state.selected.add(p.id);
        rerender();
      } },
    ]));
    more.classList.add('wh-more-btn');
    more.lastChild.replaceWith(h('span', { class: 'wh-more-t' }, T.more));
    const excluded = e.participants.filter(p => p.excluded).length;
    return h('div', { class: 'wh-page-head' },
      h('h2', { class: 'wh-h2 wh-only-d' }, `${T.tabParticipants} · ${e.participants.length} 人${nGroups ? ` · ${nGroups} 群組` : ''}`),
      h('div', { class: 'wh-mhead wh-only-m' },
        h('h2', { class: 'wh-h2' }, T.tabParticipants),
        h('p', { class: 'wh-page-sub' }, T.peopleSub(e.participants.length, nGroups, e.participants.length - excluded, d.won.size, excluded))),
      h('div', { class: 'wh-row-gap' },
        h('button', { type: 'button', class: 'btn btn-ghost wh-only-d', onclick: () => openImportDialog({ onDone: rerender }) }, icon('upload', 18), T.import),
        h('button', { type: 'button', class: 'btn btn-primary wh-only-d', onclick: () => personDialog(null, rerender) }, icon('plus', 18), T.addPerson),
        more));
  }

  /** 手機：右下浮動 ＋（新增一人 / 匯入）；有勾選時讓位給批次列 */
  function fab() {
    const b = h('button', { type: 'button', class: 'wh-fab wh-only-m', 'aria-label': T.addMenu, 'aria-haspopup': 'menu', hidden: state.selected.size > 0 }, icon('plus', 26));
    b.addEventListener('click', () => popMenu(b, [
      { label: T.addOne, fn: () => personDialog(null, rerender) },
      { label: T.importRoster, fn: () => openImportDialog({ onDone: rerender }) },
    ]));
    return b;
  }

  /** 手機：篩選面板（檢視切換、狀態篩選、跳到群組） */
  function openFilter() {
    const e = ev(); const d = derive(e);
    const seg = h('div', { class: 'wh-seg', role: 'group', 'aria-label': T.filterView });
    const paintSeg = () => seg.replaceChildren(...[['group', T.viewByGroup], ['list', T.viewList]].map(([k, l]) => h('button', {
      type: 'button', class: state.view === k ? 'on' : '', 'aria-pressed': String(state.view === k),
      onclick: () => { state.view = k; paintSeg(); rerender(); },
    }, l)));
    paintSeg();
    const radios = h('div', { class: 'wh-choice-col', role: 'radiogroup', 'aria-label': T.filterStatus },
      ...FILTERS().map(([k, l]) => {
        const r = h('input', { type: 'radio', name: 'wh-pf', value: k, checked: state.filter === k });
        r.addEventListener('change', () => { state.filter = k; rerender(); });
        return h('label', { class: 'wh-check-inline' }, r, h('span', null, l));
      }));
    const items = [...d.groups.map(g => [g, d.counts.get(g)]), ...(d.ungrouped ? [['', d.ungrouped]] : [])];
    let closeFn = null;
    const jump = items.length > 1 || d.groups.length ? h('ul', { class: 'wh-glist wh-glist-sheet' }, ...items.map(([g, n]) => h('li', null,
      h('button', { type: 'button', class: 'wh-gitem', onclick: () => { if (closeFn) closeFn(null); jumpToGroup(g, rerender); } },
        h('i', { class: 'sw', style: { background: color(d, g) } }), h('span', { class: 'gname' }, g || T.ungrouped), h('span', { class: 'gcount' }, String(n)))))) : null;
    const body = h('div', { class: 'wh-filter' },
      h('div', { class: 'field' }, h('span', { class: 'wh-label' }, T.filterView), seg),
      h('fieldset', { class: 'field' }, h('legend', { class: 'wh-label' }, T.filterStatus), radios),
      jump ? h('div', { class: 'field' }, h('span', { class: 'wh-label' }, T.filterJump), jump) : null);
    dialog({ title: T.filterTitle, body, actions: [{ label: T.filterDone, value: null, kind: 'primary', focus: true }], onOpen(box, close) { closeFn = close; } });
  }

  function toolbar() {
    const s = h('input', { type: 'search', class: 'input', placeholder: T.searchPeople, 'aria-label': T.searchPeople, value: state.q });
    let t = null;
    s.addEventListener('input', () => { clearTimeout(t); t = setTimeout(() => { state.q = s.value; rerender('.wh-toolbar input[type=search]'); }, 150); });
    const seg = h('div', { class: 'wh-seg wh-only-d', role: 'group', 'aria-label': '檢視' },
      ...[['group', T.viewByGroup], ['list', T.viewList]].map(([k, l]) => h('button', { type: 'button', class: state.view === k ? 'on' : '', 'aria-pressed': String(state.view === k), onclick: () => { state.view = k; rerender(); } }, l)));
    const sel = h('select', { class: 'input wh-select', 'aria-label': '狀態' },
      ...FILTERS().map(([k, l]) => h('option', { value: k, selected: state.filter === k }, l)));
    sel.addEventListener('change', () => { state.filter = sel.value; rerender(); });
    const filtered = state.filter !== 'all';
    const fbtn = h('button', { type: 'button', class: 'btn btn-ghost wh-filter-btn wh-only-m' + (filtered ? ' is-on' : ''), 'aria-haspopup': 'dialog', onclick: openFilter },
      icon('filter', 18), h('span', null, T.filter), filtered ? h('i', { class: 'wh-dot', 'aria-hidden': 'true' }) : null);
    return h('div', { class: 'wh-toolbar' }, h('div', { class: 'wh-search-wrap' }, icon('search', 18), s), seg, h('label', { class: 'wh-inline-field wh-only-d' }, h('span', null, '狀態'), sel), fbtn);
  }

  // ---------- 列 ----------
  function rowHTML(p, d, showGroup) {
    const won = d.won.get(p.id);
    const reason = p.excluded ? html`<select class="input wh-reason" data-reason aria-label="${T.excludeReason}：${p.name}">${[...EXCLUDE_REASON_CHOICES, ...(p.excludeReason === 'imported-zero' ? ['imported-zero'] : [])].map(r => html`<option value="${r}" ${raw(p.excludeReason === r ? 'selected' : '')}>${excludeReasonLabel(r, d.w.show)}</option>`)}</select>` : '';
    const dupTag = d.sameName.has(p.id) ? html`<span class="wh-tag wh-only-d">同名異組</span>` : '';
    // 手機：姓名下一行小字（清單檢視含群組）、右側狀態小標籤（排除 / 得獎 / ×n 籤數，籤數依 weightView）
    const sub = [showGroup ? (p.group || T.ungrouped) : '', p.code || ''].filter(Boolean).join(' · ');
    const tags = [p.excluded ? html`<span class="wh-tag wh-tag-warn">${T.tagExcluded}</span>` : '', won ? html`<span class="wh-tag wh-tag-accent">${T.tagWon}</span>` : '',
      d.w.show && p.weight > 1 ? html`<span class="wh-tag">×${p.weight}</span>` : ''];
    return html`<div class="wh-prow${p.excluded ? ' is-excluded' : ''}${state.selected.has(p.id) ? ' is-selected' : ''}" data-id="${p.id}" role="row">
      <label class="wh-check" title="選取"><input type="checkbox" data-sel ${raw(state.selected.has(p.id) ? 'checked' : '')} aria-label="選取 ${p.name}"></label>
      <button type="button" class="wh-pname" data-act="edit" aria-label="${T.edit} ${p.name}"><span class="nm">${p.name}</span>${p.code ? html`<small class="wh-only-d">${p.code}</small>` : ''}${dupTag}${sub ? html`<small class="wh-psub wh-only-m">${sub}</small>` : ''}</button>
      <span class="wh-pstat wh-only-m">${tags}</span>
      ${showGroup ? html`<span class="wh-pgroup"><i class="sw" style="background:${color(d, p.group)}"></i>${p.group || T.ungrouped}</span>` : ''}
      ${d.w.edit ? html`<label class="wh-weight"><span>${T.weight}</span><input type="number" class="input" data-weight min="1" max="1000" step="1" inputmode="numeric" value="${p.weight}" aria-label="${T.weight}：${p.name}"></label>`
        : d.w.show ? html`<span class="wh-weight wh-weight-ro" aria-label="${T.weight}：${p.name} ${p.weight}"><span>${T.weight}</span><b>×${p.weight}</b></span>` : ''}
      <span class="wh-excl"><label class="wh-check-inline"><input type="checkbox" data-excl ${raw(p.excluded ? 'checked' : '')} aria-label="${T.exclude}：${p.name}"><span>${T.exclude}</span></label>${reason}</span>
      <span class="wh-won">${won ? won.join('、') : raw('<span class="wh-muted">—</span>')}</span>
      <button type="button" class="icon-btn" data-act="row-more" aria-label="${T.more}：${p.name}" aria-haspopup="menu">${icon('more')}</button>
    </div>`;
  }

  function listView(e, d) {
    const wrap = h('div', { class: 'wh-plist' });
    if (state.view === 'list') {
      const people = e.participants.filter(p => matches(p, d));
      const wOn = d.w.show;
      if (!wOn && state.sort.key === 'weight') state.sort = { key: 'name', dir: 1 };
      const k = state.sort.key, dir = state.sort.dir;
      const val = (p) => k === 'name' ? p.name : k === 'group' ? (d.gmap.has(p.group) ? String(d.gmap.get(p.group)).padStart(5, '0') : 'zzzz') + p.name
        : k === 'weight' ? String(p.weight).padStart(5, '0') : k === 'excluded' ? (p.excluded ? '1' : '0') : k === 'won' ? (d.won.has(p.id) ? '0' : '1') : (p.code || '');
      people.sort((a, b) => val(a).localeCompare(val(b), 'zh-Hant') * dir);
      const th = (key, label) => html`<button type="button" class="wh-sort${k === key ? ' on' : ''}" data-sort="${key}" aria-label="依${label}排序">${label}${k === key ? icon(dir > 0 ? 'chevronUp' : 'chevronDown', 14) : ''}</button>`;
      wrap.insertAdjacentHTML('beforeend', html`<div class="wh-prow wh-prow-head wh-prow-list" role="row"><span></span>${th('name', '姓名')}${th('group', '群組')}${wOn ? th('weight', T.weight) : ''}${th('excluded', T.exclude)}${th('won', T.won)}<span></span></div>`.s);
      wrap.insertAdjacentHTML('beforeend', html`<div class="wh-prows wh-prows-list">${people.map(p => rowHTML(p, d, true))}</div>`.s);
      if (!people.length) wrap.appendChild(h('p', { class: 'wh-muted wh-pad' }, '沒有符合的人。'));
      return wrap;
    }
    const sections = [...d.groups, ...(d.ungrouped ? [''] : [])];
    let any = false;
    for (const g of sections) {
      const people = e.participants.filter(p => (p.group || '') === g && matches(p, d));
      if (!people.length && (state.q || state.filter !== 'all')) continue;
      any = true;
      const open = !state.collapsed.has(g);
      const wOn = d.w.show;
      const ws = new Set(e.participants.filter(p => (p.group || '') === g).map(p => p.weight));
      const wNote = wOn && ws.size === 1 && [...ws][0] > 1 ? `籤數 ×${[...ws][0]}` : '';
      const sec = h('section', { class: 'wh-group', 'data-group': g, id: 'grp-' + encodeURIComponent(g || '_') });
      sec.insertAdjacentHTML('beforeend', html`<div class="wh-group-head">
        <button type="button" class="wh-group-toggle" data-act="toggle" aria-expanded="${String(open)}">${icon(open ? 'chevronDown' : 'chevronRight', 18)}<i class="sw" style="background:${color(d, g)}"></i><b>${g || T.ungrouped}</b>${wNote ? html`<span class="wh-tag">${wNote}</span>` : ''}</button>
        <div class="wh-group-acts">
          ${d.w.edit ? html`<button type="button" class="btn btn-ghost btn-sm wh-only-d" data-act="g-weight">${T.groupSetWeight}</button>` : ''}
          <button type="button" class="btn btn-ghost btn-sm wh-only-d" data-act="g-exclude" aria-haspopup="menu">${T.groupExcludeAll}</button>
          <button type="button" class="icon-btn" data-act="g-more" aria-label="${T.more}：${g || T.ungrouped}" aria-haspopup="menu">${icon('more')}</button>
        </div></div>`.s);
      if (open) sec.insertAdjacentHTML('beforeend', html`<div class="wh-prows">${people.map(p => rowHTML(p, d, false))}</div>`.s);
      wrap.appendChild(sec);
    }
    if (!any) wrap.appendChild(h('p', { class: 'wh-muted wh-pad' }, '沒有符合的人。'));
    return wrap;
  }

  // ---------- 批次列 ----------
  function batchBar(e, d) {
    const n = state.selected.size;
    const bar = h('div', { class: 'wh-batch', hidden: !n, role: 'region', 'aria-label': '批次操作' });
    if (!n) return bar;
    const ids = () => [...state.selected];
    const b = (label, fn, extra = {}) => { const x = h('button', { type: 'button', class: 'btn btn-ghost btn-sm', ...extra }, label); x.addEventListener('click', () => fn(x)); return x; };
    const doRestore = () => setExcluded(ids(), false, null, '');
    const doMove = (x) => groupMenu(x, d, (g) => moveTo(ids(), g));
    const doTag = async () => { const t = await promptDialog(T.batchTag, '標籤'); if (t) addTag(ids(), t); };
    const doDelete = () => removePeople(ids());
    // 手機單行：已選 n [排除][設籤數][⋯][✕]；取消排除、移到群組、加標籤、刪除收進 ⋯（CSS order 排序）
    const more = b(T.more, (x) => popMenu(x, [
      { label: T.batchRestore, fn: doRestore },
      { label: T.batchMove, fn: () => doMove(x) },
      { label: T.batchTag, fn: doTag },
      { sep: true },
      { label: T.batchDelete, danger: true, fn: doDelete },
    ]), { class: 'icon-btn wh-batch-more wh-only-m', 'aria-label': T.more, 'aria-haspopup': 'menu' });
    more.replaceChildren(); more.insertAdjacentHTML('beforeend', icon('more').s);
    bar.append(
      h('b', { class: 'wh-batch-n' }, T.batchSelected(n)),
      d.w.edit ? b(T.batchWeight, (x) => weightMenu(x, (w) => setWeight(ids(), w, '')), { class: 'btn btn-ghost btn-sm wh-batch-w', 'aria-haspopup': 'menu' }) : null,
      b(T.batchExclude, (x) => reasonMenu(x, (r) => setExcluded(ids(), true, r, '')), { class: 'btn btn-ghost btn-sm wh-batch-x', 'aria-haspopup': 'menu' }),
      b(T.batchRestore, doRestore, { class: 'btn btn-ghost btn-sm wh-only-d' }),
      b(T.batchMove, doMove, { class: 'btn btn-ghost btn-sm wh-only-d', 'aria-haspopup': 'menu' }),
      b(T.batchTag, doTag, { class: 'btn btn-ghost btn-sm wh-only-d' }),
      h('span', { class: 'wh-batch-gap wh-only-d' }),
      b(T.batchDelete, doDelete, { class: 'btn btn-danger btn-sm wh-only-d' }),
      more,
      h('button', { type: 'button', class: 'icon-btn wh-batch-close', 'aria-label': T.selectNone, onclick: () => { state.selected.clear(); rerender(); } }, icon('close')));
    return bar;
  }

  // ---------- 動作 ----------
  const nameOf = (g) => (g === '' ? `${T.ungrouped} ` : `${g} `);

  function setWeight(ids, w, who, onlyOne = false) {
    const set = new Set(ids);
    let n = 0;
    return editWithUndoToast((e) => { for (const p of e.participants) if (set.has(p.id) && (!onlyOne || p.weight === 1)) { p.weight = clampWeight(w); n++; } }, () => T.toastWeight(who, n, clampWeight(w)), ['participants'], { onUndo: rerender })
      .then(() => rerender());
  }
  function setExcluded(ids, flag, reason, who) {
    const set = new Set(ids);
    let n = 0;
    return editWithUndoToast((e) => {
      for (const p of e.participants) if (set.has(p.id) && p.excluded !== flag) {
        p.excluded = flag; n++;
        if (flag) p.excludeReason = reason || 'other'; else { delete p.excludeReason; delete p.excludeNote; }
      }
    }, () => (flag ? T.toastExcluded(who, n) : T.toastRestored(n)), ['participants'], { onUndo: rerender }).then(() => rerender());
  }
  function moveTo(ids, g) {
    const set = new Set(ids);
    return editWithUndoToast((e) => { for (const p of e.participants) if (set.has(p.id)) { if (g) p.group = g; else delete p.group; } }, T.toastMoved(ids.length, g || T.ungrouped), ['participants'], { onUndo: rerender })
      .then(() => rerender());
  }
  function addTag(ids, t) {
    const set = new Set(ids);
    return editWithUndoToast((e) => { for (const p of e.participants) if (set.has(p.id)) { p.tags = [...new Set([...(p.tags || []), t])]; } }, T.toastTagged(ids.length, t), ['participants'], { onUndo: rerender })
      .then(() => rerender());
  }
  async function removePeople(ids) {
    const d = derive(ev());
    const blocked = ids.filter(id => d.hasDraw.has(id));
    const ok = ids.filter(id => !d.hasDraw.has(id));
    if (blocked.length) toast(T.cannotDeleteWinner(blocked.length), { kind: 'error' });
    if (!ok.length) return;
    const set = new Set(ok);
    await editWithUndoToast((e) => { e.participants = e.participants.filter(p => !set.has(p.id)); }, T.toastDeleted(ok.length), ['participants'], { onUndo: rerender });
    for (const id of ok) state.selected.delete(id);
    rerender();
  }

  function weightMenu(anchor, fn) {
    popMenu(anchor, [...[1, 2, 3, 5].map(w => ({ label: `籤數 ${w}`, fn: () => fn(w) })), { sep: true },
      { label: '自訂…', fn: async () => { const v = await promptDialog(T.batchWeight, `${T.weight}（1–1000）`, { type: 'number', min: 1, max: 1000, value: 2 }); if (v) fn(clampWeight(v)); } }]);
  }
  function reasonMenu(anchor, fn) {
    popMenu(anchor, EXCLUDE_REASON_CHOICES.map(r => ({ label: `${T.exclude}：${excludeReasonLabel(r)}`, fn: () => fn(r) })));
  }
  function groupMenu(anchor, d, fn) {
    popMenu(anchor, [...d.groups.map(g => ({ label: g, fn: () => fn(g) })), { sep: true },
      { label: T.newGroup, fn: async () => { const g = await promptDialog(T.batchMove, '群組名稱', { list: d.groups }); if (g) fn(g); } }]);
  }

  function groupWeightDialog(g) {
    const e = ev();
    const people = e.participants.filter(p => (p.group || '') === g);
    dialog({
      title: `${T.groupSetWeight}：${g || T.ungrouped}`,
      body: html`<div class="wh-row-gap wh-align-center"><span>${g || T.ungrouped} ${people.length} 人 →</span><label class="wh-weight"><span>${T.weight}</span><input type="number" class="input" data-w min="1" max="1000" step="1" value="2"></label></div>
        <label class="wh-check-inline wh-mt"><input type="checkbox" data-one><span>${T.onlyWeightOne}</span></label>`,
      actions: [{ label: T.cancel, value: null, kind: 'ghost' }, { label: T.ok, kind: 'primary', value: (box) => ({ w: clampWeight(box.querySelector('[data-w]').value), one: box.querySelector('[data-one]').checked }) }],
      onOpen(box) { const i = box.querySelector('[data-w]'); setTimeout(() => { i.focus(); i.select(); }, 0); i.addEventListener('keydown', (ev2) => { if (ev2.key === 'Enter') box.querySelector('.btn-primary').click(); }); },
    }).then(v => { if (v) setWeight(people.map(p => p.id), v.w, nameOf(g), v.one); });
  }

  async function renameGroup(g) {
    const name = await promptDialog(T.groupRename, '新名稱', { value: g });
    if (!name || name === g) return;
    await editWithUndoToast((e) => {
      for (const p of e.participants) if (p.group === g) p.group = name;
      for (const z of e.prizes) if (z.eligibility && z.eligibility.groups) z.eligibility.groups = z.eligibility.groups.map(x => (x === g ? name : x));
    }, `已把「${g}」改名為「${name}」`, ['participants', 'prizes'], { onUndo: rerender });
    if (state.collapsed.has(g)) { state.collapsed.delete(g); state.collapsed.add(name); }
    rerender();
  }

  // ---------- 事件委派 ----------
  on(root, 'click', '[data-act]', (e, el) => {
    const act = el.dataset.act;
    const row = el.closest('[data-id]');
    const sec = el.closest('[data-group]');
    const g = sec ? sec.dataset.group : null;
    const evt = ev();
    if (act === 'edit' && row) personDialog(evt.participants.find(p => p.id === row.dataset.id), rerender);
    else if (act === 'row-more' && row) {
      const p = evt.participants.find(x => x.id === row.dataset.id);
      const d = derive(evt);
      popMenu(el, [
        { label: T.edit, fn: () => personDialog(p, rerender) },
        { label: p.excluded ? T.batchRestore : T.exclude, fn: () => setExcluded([p.id], !p.excluded, 'other', '') },
        { sep: true },
        { label: T.del, danger: true, disabled: d.hasDraw.has(p.id), fn: () => removePeople([p.id]) },
      ]);
    } else if (act === 'toggle' && g != null) {
      if (state.collapsed.has(g)) state.collapsed.delete(g); else state.collapsed.add(g);
      rerender(`[data-group="${CSS.escape(g)}"] [data-act=toggle]`);
    } else if (act === 'g-weight' && weightsUI(evt).edit) groupWeightDialog(g);
    else if (act === 'g-exclude') {
      const ids = evt.participants.filter(p => (p.group || '') === g).map(p => p.id);
      reasonMenu(el, (r) => setExcluded(ids, true, r, nameOf(g)));
    } else if (act === 'g-more') {
      const ids = evt.participants.filter(p => (p.group || '') === g).map(p => p.id);
      // 手機：「設籤數」「排除全組」兩顆按鈕收進這個選單
      const phoneItems = isPhone() ? [
        ...(weightsUI(evt).edit ? [{ label: T.groupSetWeight, fn: () => groupWeightDialog(g) }] : []),
        { label: T.groupExcludeAll, fn: () => reasonMenu(el, (r) => setExcluded(ids, true, r, nameOf(g))) },
      ] : [];
      popMenu(el, [
        ...phoneItems,
        { label: T.groupRestoreAll, fn: () => setExcluded(ids, false, null, nameOf(g)) },
        { label: '全選本組', fn: () => { ids.forEach(id => state.selected.add(id)); rerender(); } },
        ...(g ? [{ label: T.groupRename, fn: () => renameGroup(g) }] : []),
      ]);
    }
  });
  on(root, 'click', '[data-sort]', (e, el) => {
    const k = el.dataset.sort;
    if (state.sort.key === k) state.sort.dir *= -1; else state.sort = { key: k, dir: 1 };
    rerender(`[data-sort="${k}"]`);
  });
  on(root, 'change', '[data-sel]', (e, el) => {
    const id = el.closest('[data-id]').dataset.id;
    if (el.checked) state.selected.add(id); else state.selected.delete(id);
    el.closest('[data-id]').classList.toggle('is-selected', el.checked);
    const old = root.querySelector('.wh-batch');
    if (old) old.replaceWith(batchBar(ev(), derive(ev())));
    const f = root.querySelector('.wh-fab');
    if (f) f.hidden = state.selected.size > 0;
    batchClass();
  });
  on(root, 'change', '[data-weight]', (e, el) => {
    if (!weightsUI(ev()).edit) return;
    const id = el.closest('[data-id]').dataset.id;
    const w = clampWeight(el.value);
    el.value = w;
    edit((ev2) => { const p = ev2.participants.find(x => x.id === id); if (p) p.weight = w; }, { debounce: true });
  });
  on(root, 'change', '[data-excl]', async (e, el) => {
    const id = el.closest('[data-id]').dataset.id;
    const flag = el.checked;
    await edit((ev2) => {
      const p = ev2.participants.find(x => x.id === id); if (!p) return;
      p.excluded = flag;
      if (flag) p.excludeReason = p.excludeReason || 'other'; else { delete p.excludeReason; delete p.excludeNote; }
    });
    rerender(flag ? `[data-id="${id}"] [data-reason]` : `[data-id="${id}"] [data-excl]`);
  });
  on(root, 'change', '[data-reason]', (e, el) => {
    const id = el.closest('[data-id]').dataset.id;
    edit((ev2) => { const p = ev2.participants.find(x => x.id === id); if (p) p.excludeReason = el.value; });
  });

  // 拖放檔案 → 匯入
  root.addEventListener('dragover', (e) => { if (e.dataTransfer && [...e.dataTransfer.types].includes('Files')) { e.preventDefault(); root.classList.add('is-drop'); } });
  root.addEventListener('dragleave', (e) => { if (e.target === root) root.classList.remove('is-drop'); });
  root.addEventListener('drop', (e) => {
    root.classList.remove('is-drop');
    const f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
    if (f) { e.preventDefault(); openImportDialog({ file: f, onDone: rerender }); }
  });

  // ---------- 空狀態 ----------
  function emptyRoster() {
    const ta = h('textarea', { class: 'input wh-paste', rows: 6, placeholder: T.pastePlaceholder, 'aria-label': T.tabPaste });
    const fileInp = h('input', { type: 'file', accept: '.xlsx,.xls,.csv,.tsv,.txt', hidden: true });
    fileInp.addEventListener('change', () => { const f = fileInp.files[0]; if (f) openImportDialog({ file: f, onDone: rerender }); fileInp.value = ''; });
    return h('div', { class: 'wh-dropzone wh-empty' },
      icon('upload', 40),
      h('h2', { class: 'wh-h2' }, T.emptyRosterTitle),
      h('p', { class: 'wh-hint' }, T.emptyRosterNote),
      h('div', { class: 'wh-row-gap wh-center' },
        h('button', { type: 'button', class: 'btn btn-primary', onclick: () => fileInp.click() }, icon('file', 18), T.chooseFile),
        h('button', { type: 'button', class: 'btn btn-ghost', onclick: () => personDialog(null, rerender) }, icon('plus', 18), T.addPerson),
        fileInp),
      ta,
      h('div', { class: 'wh-row-gap wh-center' },
        h('button', { type: 'button', class: 'btn btn-ghost', onclick: () => { if (ta.value.trim()) openImportDialog({ text: ta.value, onDone: rerender }); else ta.focus(); } }, T.pasteNext)));
  }

  rerender();
  return () => { layout.side.replaceChildren(); document.documentElement.classList.remove('wh-batch-on'); };
}

const FILTERS = () => [['all', T.filterAll], ['eligible', T.filterEligible], ['excluded', T.filterExcluded], ['winners', T.filterWinners], ['samename', T.filterSameName]];

/** 跳到某群組（左欄群組清單與手機篩選面板共用） */
function jumpToGroup(g, rerender) {
  state.view = 'group'; state.collapsed.delete(g); state.q = ''; state.filter = 'all';
  rerender();
  setTimeout(() => { const s = document.getElementById('grp-' + encodeURIComponent(g || '_')); if (s) { s.scrollIntoView({ block: 'start', behavior: 'smooth' }); const t = s.querySelector('[data-act=toggle]'); if (t) t.focus({ preventScroll: true }); } }, 60);
}

// ---------- 左欄：群組清單與統計 ----------
function renderSide(side, e, d, rerender) {
  if (!e.participants.length) { side.replaceChildren(); return; }
  const excluded = e.participants.filter(p => p.excluded).length;
  const winners = d.won.size;
  const items = [...d.groups.map(g => [g, d.counts.get(g)]), ...(d.ungrouped ? [['', d.ungrouped]] : [])];
  const list = h('ul', { class: 'wh-glist' }, ...items.map(([g, n]) => h('li', null,
    h('button', { type: 'button', class: 'wh-gitem', onclick: () => jumpToGroup(g, rerender) }, h('i', { class: 'sw', style: { background: color(d, g) } }), h('span', { class: 'gname' }, g || T.ungrouped), h('span', { class: 'gcount' }, String(n))))));
  const stat = (label, n) => h('div', { class: 'wh-stat' }, h('span', null, label), h('b', null, String(n)));
  side.replaceChildren(
    items.length > 1 || d.groups.length ? h('div', { class: 'wh-side-block' }, h('h3', { class: 'wh-side-h' }, T.groupsTitle), list) : '',
    h('div', { class: 'wh-side-block wh-stats' }, h('h3', { class: 'wh-side-h' }, T.statsTitle),
      stat(T.statEligible, e.participants.length - excluded), stat(T.statWinners, winners), stat(T.statExcluded, excluded), stat(T.statSameName, d.sameName.size)));
}

// ---------- 新增 / 編輯參加者 ----------
export function personDialog(p, after) {
  const e = ev();
  const groups = [...groupOrder(e).keys()];
  const isNew = !p;
  const hasDraw = p && e.draws.some(d => d.participantId === p.id);
  const actions = isNew
    ? [{ label: T.cancel, value: null, kind: 'ghost' }, { label: T.addAndNext, value: 'next', kind: 'ghost' }, { label: T.addPerson, value: 'add', kind: 'primary' }]
    : [...(hasDraw ? [] : [{ label: T.del, value: 'delete', kind: 'danger' }]), { label: T.cancel, value: null, kind: 'ghost' }, { label: T.save, value: 'save', kind: 'primary' }];
  const listId = 'grp-list-' + Math.random().toString(36).slice(2);
  const wOn = weightsUI(e).edit;   // 未解鎖：不出現籤數欄，存檔時保留原籤數
  // 手機：列內不再有排除勾選與原因下拉，改在編輯面板裡設定（桌機維持原樣，不畫這組欄位）
  const exclOn = !isNew && isPhone();
  const reasons = p ? [...EXCLUDE_REASON_CHOICES, ...(p.excludeReason === 'imported-zero' ? ['imported-zero'] : [])] : [];
  dialog({
    title: isNew ? T.personTitleAdd : T.personTitleEdit,
    body: html`<form class="wh-form" data-pf onsubmit="return false">
      <label class="field"><span>${T.fPersonName} <b class="req" aria-hidden="true">*</b></span><input class="input" name="name" maxlength="40" autocomplete="off" value="${p ? p.name : ''}"></label>
      <p class="field-error" data-err hidden>請輸入姓名</p>
      <div class="wh-form-row${wOn ? '' : ' wh-form-row-2'}">
        <label class="field"><span>${T.fGroup}</span><input class="input" name="group" list="${listId}" autocomplete="off" value="${p ? p.group || '' : ''}"></label>
        <label class="field"><span>${T.fCode}</span><input class="input" name="code" autocomplete="off" value="${p ? p.code || '' : ''}"></label>
        ${wOn ? html`<label class="field wh-field-narrow"><span>${T.weight}</span><input class="input" type="number" name="weight" min="1" max="1000" step="1" value="${p ? p.weight : 1}"></label>` : ''}
      </div>
      <label class="field"><span>${T.fTags}</span><input class="input" name="tags" autocomplete="off" value="${p ? (p.tags || []).join('、') : ''}"></label>
      <label class="field"><span>${T.fNote}</span><input class="input" name="note" autocomplete="off" value="${p ? p.note || '' : ''}"></label>
      ${exclOn ? html`<div class="field wh-excl-field"><label class="wh-check-inline"><input type="checkbox" name="excluded" ${raw(p.excluded ? 'checked' : '')}><span>${T.exclude}</span></label>
        <select class="input" name="excludeReason" aria-label="${T.excludeReason}" ${raw(p.excluded ? '' : 'disabled')}>${reasons.map(r => html`<option value="${r}" ${raw((p.excludeReason || 'other') === r ? 'selected' : '')}>${excludeReasonLabel(r, weightsUI(e).show)}</option>`)}</select></div>` : ''}
      <datalist id="${listId}">${groups.map(g => html`<option value="${g}">`)}</datalist>
      ${hasDraw ? html`<p class="wh-hint">已有抽獎紀錄的人不能刪除，可改用排除。</p>` : ''}
    </form>`,
    actions,
    onOpen(box, close) {
      const f = box.querySelector('[data-pf]');
      const name = f.elements.name;
      noWheel(box);
      setTimeout(() => name.focus(), 0);
      if (exclOn) f.elements.excluded.addEventListener('change', () => { f.elements.excludeReason.disabled = !f.elements.excluded.checked; });
      const read = () => ({
        name: name.value.trim(), group: f.elements.group.value.trim(), code: f.elements.code.value.trim(),
        weight: wOn ? clampWeight(f.elements.weight.value) : (p ? p.weight : 1), note: f.elements.note.value.trim(),
        tags: f.elements.tags.value.split(/[、,，]+/).map(s => s.trim()).filter(Boolean),
      });
      const btns = box.querySelectorAll('.dlg-actions .btn');
      btns.forEach((b, i) => b.addEventListener('click', async (ev2) => {
        const a = actions[i];
        if (!a.value) return;                         // 取消：交給 dialog
        ev2.stopPropagation();
        if (a.value === 'delete') {
          close(null);
          const id = p.id;
          await editWithUndoToast((x) => { x.participants = x.participants.filter(q => q.id !== id); }, T.toastDeleted(1), ['participants'], { onUndo: after });
          after(); return;
        }
        const v = read();
        if (!v.name) { box.querySelector('[data-err]').hidden = false; name.setAttribute('aria-invalid', 'true'); name.focus(); return; }
        if (isNew) {
          await edit((x) => { x.participants.push(createParticipant({ ...v, source: 'manual' })); });
          toast(T.added(v.name));
          if (a.value === 'next') { name.value = ''; f.elements.code.value = ''; f.elements.note.value = ''; f.elements.tags.value = ''; box.querySelector('[data-err]').hidden = true; name.focus(); after(); return; }
        } else {
          await edit((x) => {
            const q = x.participants.find(z => z.id === p.id); if (!q) return;
            q.name = v.name; q.weight = v.weight;
            for (const k of ['group', 'code', 'note']) { if (v[k]) q[k] = v[k]; else delete q[k]; }
            if (v.tags.length) q.tags = v.tags; else delete q.tags;
            if (exclOn) {
              const flag = f.elements.excluded.checked;
              if (flag) { q.excluded = true; q.excludeReason = f.elements.excludeReason.value || 'other'; }
              else if (q.excluded) { q.excluded = false; delete q.excludeReason; delete q.excludeNote; }
            }
          });
        }
        close(null); after();
      }, true));
      f.addEventListener('keydown', (ev2) => { if (ev2.key === 'Enter' && ev2.target.tagName === 'INPUT') { ev2.preventDefault(); box.querySelector('.btn-primary').click(); } });
    },
  });
}

// ---------- 依群組設籤數（匯入後 toast 的捷徑） ----------
export function openWeightByGroup(after) {
  const e = ev();
  const groups = [...groupOrder(e).keys()];
  if (!weightsUI(e).edit) return;
  if (!groups.length) { toast('名單還沒有群組。'); return; }
  const gmap = groupOrder(e);
  dialog({
    title: T.setWeightByGroup,
    body: html`<p class="wh-hint">同一群組的人一次設定；之後也可在名單頁的群組標題按「${T.groupSetWeight}」。</p>
      <div class="wh-wgrid">${groups.map((g, i) => {
        const ws = new Set(e.participants.filter(p => p.group === g).map(p => p.weight));
        const n = e.participants.filter(p => p.group === g).length;
        return html`<label class="wh-wrow"><i class="sw" style="background:${PALETTE[gmap.get(g) % 8]}"></i><span>${g} <small class="wh-muted">${n} 人</small></span><input type="number" class="input" min="1" max="1000" step="1" data-g="${i}" value="${ws.size === 1 ? [...ws][0] : ''}" placeholder="不變" aria-label="${g} ${T.weight}"></label>`;
      })}</div>`,
    actions: [{ label: T.cancel, value: null, kind: 'ghost' }, { label: T.ok, kind: 'primary', value: (box) => [...box.querySelectorAll('[data-g]')].map(i => [groups[+i.dataset.g], i.value === '' ? null : clampWeight(i.value)]) }],
    onOpen(box) { noWheel(box); },
  }).then(async (v) => {
    if (!v) return;
    const map = new Map(v.filter(([, w]) => w != null));
    await editWithUndoToast((x) => { for (const p of x.participants) if (map.has(p.group)) p.weight = map.get(p.group); }, '已依群組設定籤數', ['participants'], { onUndo: after });
    if (after) after();
  });
}

// ---------- 去重 ----------
function openDedupe(after) {
  const e = ev();
  const found = findDuplicates(e.participants);
  const byId = new Map(e.participants.map(p => [p.id, p]));
  const hasDraw = new Set(e.draws.map(d => d.participantId));
  const actionable = found.filter(g => g.level !== 2);
  const info = found.filter(g => g.level === 2);
  const label = { 1: T.dedupeL1, 2: T.dedupeL2, 3: T.dedupeL3 };
  const person = (p) => `${p.name}${p.group ? `（${p.group}）` : ''}${p.code ? ` #${p.code}` : ''}`;
  dialog({
    title: T.dedupeTitle,
    className: 'wh-dlg-wide',
    body: found.length ? html`
      ${actionable.map((g, gi) => html`<fieldset class="wh-dup"><legend>${label[g.level]}</legend>
        <label class="wh-check-inline"><input type="radio" name="dup${gi}" value="all" ${raw(g.level === 3 ? 'checked' : '')}><span>${T.dedupeKeepAll}</span></label>
        ${g.ids.map((id, k) => html`<label class="wh-check-inline"><input type="radio" name="dup${gi}" value="${id}" ${raw(g.level === 1 && k === 0 ? 'checked' : '')}><span>${T.dedupeKeep}：${person(byId.get(id))}${hasDraw.has(id) ? '（有抽獎紀錄）' : ''}</span></label>`)}
      </fieldset>`)}
      ${info.length ? html`<fieldset class="wh-dup"><legend>${label[2]}</legend><ul>${info.map(g => html`<li>${g.ids.map(id => person(byId.get(id))).join('、')}</li>`)}</ul></fieldset>` : ''}`
      : html`<p>${T.dedupeNone}</p>`,
    actions: actionable.length ? [{ label: T.cancel, value: null, kind: 'ghost' }, { label: T.dedupeApply, kind: 'primary', value: (box) => actionable.map((g, gi) => ({ g, keep: (box.querySelector(`[name=dup${gi}]:checked`) || {}).value || 'all' })) }]
      : [{ label: T.close, value: null, kind: 'primary' }],
  }).then(async (v) => {
    if (!v) return;
    const remove = new Set();
    for (const { g, keep } of v) if (keep !== 'all') for (const id of g.ids) if (id !== keep && !hasDraw.has(id)) remove.add(id);
    if (!remove.size) return;
    await editWithUndoToast((x) => { x.participants = x.participants.filter(p => !remove.has(p.id)); }, T.dedupeDone(remove.size), ['participants'], { onUndo: after });
    after();
  });
}

