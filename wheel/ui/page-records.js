// 中獎紀錄 #/e/:id/records（D.9）：依獎項 / 依時間、顯示作廢、作廢・恢復作廢・修改作廢原因與備註、查看稽核、跳到名單、
// 撤回加碼、活動日誌、稽核資訊、匯出 CSV、列印（records?print=1）。
import { h, html, raw, icon, popMenu, on, dialog, fmtTime } from './dom.js';
import { ctx, edit } from './app-ctx.js';
import { toast } from './toast.js';
import { go, routes } from './router.js';
import { T, VOID_REASON_LABEL, DRAW_STATUS_LABEL } from './i18n.js';
import { sortedPrizes, prizeCounts, participantById, VOID_REASONS, displayName, sameNameSet, PALETTE, groupOrder, recomputePrizeStatuses } from '../core/model.js';
import { voidDraws, editVoid, canRestore, restoreVoid, canRevertBonus, revertBonus } from '../core/draw.js';
import { eligible } from '../core/pool.js';
import { weightsUI } from './unlock.js';
import { winnersCSV, auditCSV, fileName, download } from '../io/export.js';

const view = { byPrize: true, showVoided: true };
const ev = () => ctx.store.official;

export async function renderRecords(main, { route }) {
  const root = h('div', { class: 'wh-page wh-records' });
  main.replaceChildren(root);

  function rerender() {
    const e = ev(); if (!e) return;
    const seqOf = new Map(e.draws.map(d => [d.id, d.seq]));
    const prizeOf = new Map(e.prizes.map(p => [p.id, p]));
    const dup = sameNameSet(e);
    const gmap = groupOrder(e);
    const nC = e.draws.filter(d => d.status === 'confirmed').length;
    const nV = e.draws.filter(d => d.status === 'voided').length;
    const nP = e.draws.filter(d => d.status === 'pending').length;

    const expBtn = h('button', { type: 'button', class: 'btn btn-ghost', 'aria-haspopup': 'menu', disabled: !e.draws.length }, icon('download', 18), T.exportCsv, icon('chevronDown', 16));
    expBtn.addEventListener('click', () => popMenu(expBtn, [
      { label: T.exportWinners, fn: () => download(fileName(e, '中獎名單', 'csv'), winnersCSV(e)) },
      { label: T.exportWinnersAll, fn: () => download(fileName(e, '中獎名單含作廢', 'csv'), winnersCSV(e, { includeVoided: true })) },
      { label: T.exportAudit, fn: () => download(fileName(e, '稽核', 'csv'), auditCSV(e)) },
    ]));
    const head = h('div', { class: 'wh-page-head' },
      h('h2', { class: 'wh-h2' }, `${T.recordsTitle} · 已確認 ${nC} · 作廢 ${nV} · 待確認 ${nP}`),
      h('div', { class: 'wh-row-gap wh-noprint' }, expBtn, h('button', { type: 'button', class: 'btn btn-ghost', disabled: !e.draws.length, onclick: () => window.print() }, icon('printer', 18), T.print)));

    const radio = (val, label) => {
      const r = h('input', { type: 'radio', name: 'rec-view', checked: view.byPrize === val });
      r.addEventListener('change', () => { view.byPrize = val; rerender(); });
      return h('label', { class: 'wh-check-inline' }, r, h('span', null, label));
    };
    const sv = h('input', { type: 'checkbox', checked: view.showVoided });
    sv.addEventListener('change', () => { view.showVoided = sv.checked; rerender(); });
    const tools = h('div', { class: 'wh-toolbar wh-noprint' }, h('span', { class: 'wh-muted' }, '檢視'), radio(true, T.viewByPrize), radio(false, T.viewByTime), h('label', { class: 'wh-check-inline' }, sv, h('span', null, T.showVoided)));

    const nodes = [head];
    if (!e.draws.length && !e.prizes.some(p => p.bonusLog.length)) {
      nodes.push(h('div', { class: 'wh-empty' }, icon('list', 40), h('p', null, T.noRecords)));
      nodes.push(extras(e));
      root.replaceChildren(...nodes);
      return;
    }
    nodes.push(tools);

    const statusCell = (d) => {
      if (d.status === 'voided') {
        const parts = [`${T.voidAction} · ${VOID_REASON_LABEL[d.void.reason] || ''}`];
        if (d.void.redrawnBy) parts.push(`→ ${T.redrawnBy(seqOf.get(d.void.redrawnBy) || '')}`);
        return h('span', null, parts.join(' '), d.void.note ? h('small', { class: 'wh-muted' }, `（${d.void.note}）`) : '', d.void.editedAt ? h('small', { class: 'wh-tag' }, T.edited) : '');
      }
      const s = DRAW_STATUS_LABEL[d.status];
      const extra = d.redrawOf ? `（${T.redrawOf(seqOf.get(d.redrawOf) || '')}）` : '';
      const p = participantById(e, d.participantId);
      const pz = prizeOf.get(d.prizeId);
      const bad = d.status === 'confirmed' && p && pz && !eligible(p, pz.eligibility);
      return h('span', null, s + extra, bad ? h('small', { class: 'wh-tag wh-tag-warn' }, T.ineligibleNow) : '', d.restoredFrom ? h('small', { class: 'wh-tag' }, '已恢復') : '');
    };
    const row = (d, showPrize) => h('tr', { class: d.status === 'voided' ? 'is-voided' : d.status === 'pending' ? 'is-pending' : '', 'data-id': d.id },
      h('td', { class: 'num' }, String(d.seq)),
      showPrize ? h('td', null, (prizeOf.get(d.prizeId) || {}).name || '') : null,
      h('td', { class: 'who' }, h('span', { class: 'nm' }, displayName(e, d.snapshot, dup))),
      h('td', null, d.snapshot.group ? h('span', { class: 'wh-pgroup' }, h('i', { class: 'sw', style: { background: gmap.has(d.snapshot.group) ? PALETTE[gmap.get(d.snapshot.group) % 8] : 'transparent' } }), d.snapshot.group) : '—'),
      h('td', null, d.snapshot.code || '—'),
      h('td', { class: 'num' }, fmtTime(d.drawnAt)),
      h('td', null, statusCell(d)),
      h('td', { class: 'wh-noprint' }, h('button', { type: 'button', class: 'icon-btn', 'data-act': 'more', 'aria-label': `${T.more}：第 ${d.seq} 抽 ${d.snapshot.name}`, 'aria-haspopup': 'menu' }, icon('more'))));
    const thead = (showPrize) => h('thead', null, h('tr', null, h('th', null, T.colSeq), showPrize ? h('th', null, T.colPrize) : null, h('th', null, T.colWinner), h('th', null, T.colGroup), h('th', null, T.colCode), h('th', null, T.colTime), h('th', null, T.colStatus), h('th', { class: 'wh-noprint' }, h('span', { class: 'sr-only' }, '動作'))));
    const visible = (d) => view.showVoided || d.status !== 'voided';

    if (view.byPrize) {
      for (const pz of sortedPrizes(e)) {
        const list = e.draws.filter(d => d.prizeId === pz.id && visible(d)).sort((a, b) => a.seq - b.seq);
        if (!list.length && !pz.bonusLog.length && !e.draws.some(d => d.prizeId === pz.id)) continue;
        const c = prizeCounts(e, pz);
        const doneMark = c.confirmed >= pz.quantity ? icon('check', 16, 'wh-ok') : '';
        const bonus = pz.bonusLog.map((b, i) => h('span', { class: 'wh-bonus' + (b.reverted ? ' is-reverted' : '') },
          `+${b.delta} 加碼 ${fmtTime(b.at).slice(0, 5)} ${b.reason}`,
          b.reverted ? ` · ${T.bonusReverted}` : (canRevertBonus(e, pz.id, i) ? h('button', { type: 'button', class: 'link-btn wh-noprint', 'data-revert': `${pz.id}:${i}` }, T.revertBonus) : '')));
        const det = h('details', { class: 'wh-rec-prize', open: true },
          h('summary', null, h('b', null, pz.name), pz.description ? h('span', { class: 'wh-muted' }, ` · ${pz.description}`) : '', h('span', { class: 'wh-rec-count' }, `已抽 ${c.confirmed} / ${pz.quantity}`, doneMark), ...bonus),
          list.length ? h('div', { class: 'wh-table-wrap' }, h('table', { class: 'wh-table wh-rec-table' }, thead(false), h('tbody', null, ...list.map(d => row(d, false))))) : h('p', { class: 'wh-muted wh-pad' }, '尚未抽出。'));
        nodes.push(det);
      }
    } else {
      const list = [...e.draws].filter(visible).sort((a, b) => a.seq - b.seq);
      // C.7-3：舞台上名單異動標示在兩抽之間
      const changes = e.log.filter(l => l.inStage && /^participant\./.test(l.type)).map(l => l.at);
      const body = [];
      list.forEach((d, i) => {
        body.push(row(d, true));
        const nx = list[i + 1];
        if (nx && changes.some(t => t > d.drawnAt && t < nx.drawnAt)) body.push(h('tr', { class: 'wh-rec-note' }, h('td', { colspan: 8 }, icon('warning', 14), T.rosterChanged(d.seq, nx.seq))));
      });
      nodes.push(h('div', { class: 'wh-table-wrap' }, h('table', { class: 'wh-table wh-rec-table' }, thead(true), h('tbody', null, ...body))));
    }
    nodes.push(extras(e));
    root.replaceChildren(...nodes);
  }

  function extras(e) {
    const logs = [...e.log].reverse();
    const rng = e.settings.rngMode === 'seeded' ? '固定種子' : '系統安全亂數（csprng）';
    return h('div', { class: 'wh-rec-extra wh-noprint' },
      h('details', { class: 'wh-rec-prize' }, h('summary', null, `${T.logTitle}（${logs.length}）`),
        logs.length ? h('ul', { class: 'wh-log' }, ...logs.map(l => h('li', null, h('time', { class: 'wh-muted' }, new Date(l.at).toLocaleString('zh-TW', { hour12: false })), ' ', l.summary, l.inStage ? h('small', { class: 'wh-tag' }, '舞台') : ''))) : h('p', { class: 'wh-muted' }, '沒有紀錄。')),
      h('details', { class: 'wh-rec-prize' }, h('summary', null, `${T.auditTitle} · ${rng}`),
        h('p', { class: 'wh-hint' }, weightsUI(e).show ? '每一抽都記下當時的亂數、候選人數、籤數總和與候選名單雜湊，可在匯出的稽核 CSV 核對。' : '每一抽都記下當時的亂數、候選人數與候選名單雜湊，可在匯出的稽核 CSV 核對。'),
        h('button', { type: 'button', class: 'btn btn-ghost btn-sm', disabled: !e.draws.length, onclick: () => download(fileName(e, '稽核', 'csv'), auditCSV(e)) }, T.exportAudit)));
  }

  // ---------- 動作 ----------
  function reasonForm(cur = 'absent', note = '') {
    return html`<fieldset class="field"><legend>${T.fVoidReason}</legend><div class="wh-choice-grid wh-choice-grid-3">${VOID_REASONS.map((r, i) => html`<label class="wh-check-inline"><input type="radio" name="vr" value="${r}" ${raw(r === cur ? 'checked' : '')}><span><kbd class="kbd">${i + 1}</kbd> ${VOID_REASON_LABEL[r]}</span></label>`)}</div></fieldset>
      <label class="field"><span>${T.fVoidNote}</span><input class="input" name="vn" maxlength="100" autocomplete="off" value="${note}"></label>`;
  }
  const readReason = (box) => ({ reason: box.querySelector('[name=vr]:checked').value, note: box.querySelector('[name=vn]').value.trim() });
  const digitKeys = (box) => box.addEventListener('keydown', (k) => {
    if (/^[1-6]$/.test(k.key) && k.target.tagName !== 'INPUT') { const r = box.querySelectorAll('[name=vr]')[+k.key - 1]; if (r) { r.checked = true; r.focus(); } }
    if (/^[1-6]$/.test(k.key) && k.target.type === 'radio') { k.preventDefault(); const r = box.querySelectorAll('[name=vr]')[+k.key - 1]; if (r) { r.checked = true; r.focus(); } }
  });

  async function doVoid(d) {
    const v = await dialog({
      title: T.voidTitle(d.snapshot.name),
      body: html`<p>${T.voidText}</p>${reasonForm()}`,
      actions: [{ label: T.cancel, value: null, kind: 'ghost' }, { label: T.voidAction, kind: 'danger', value: readReason }],
      onOpen: digitKeys,
    });
    if (!v) return;
    await edit((x) => { voidDraws(x, [d.id], { reason: v.reason, note: v.note || undefined }); recomputePrizeStatuses(x); });
    toast(T.voidedToast(d.snapshot.name));
    rerender();
  }
  async function doEditVoid(d) {
    const v = await dialog({
      title: T.editVoidTitle,
      body: html`<p>第 ${d.seq} 抽 · ${d.snapshot.name}</p>${reasonForm(d.void.reason, d.void.note || '')}`,
      actions: [{ label: T.cancel, value: null, kind: 'ghost' }, { label: T.save, kind: 'primary', value: readReason }],
      onOpen: digitKeys,
    });
    if (!v) return;
    await edit((x) => editVoid(x, d.id, { reason: v.reason, note: v.note }));
    toast(T.saved);
    rerender();
  }
  async function doRestore(d) {
    const ok = await dialog({ title: `${T.restoreAction}：${d.snapshot.name}`, body: html`<p>第 ${d.seq} 抽恢復為已確認，名額會再扣回。</p>`, actions: [{ label: T.cancel, value: false, kind: 'ghost' }, { label: T.restoreAction, value: true, kind: 'primary', focus: true }] });
    if (!ok) return;
    await edit((x) => restoreVoid(x, d.id));
    toast(T.restoredToast(d.snapshot.name));
    rerender();
  }
  function showAudit(d) {
    const a = d.audit || {};
    const wOn = weightsUI(ctx.store.official).show;
    const rows = [['抽獎序號', d.seq], ['批次', d.batchId], ['卡位', d.slot], ['隨機來源', a.rngMode], ['亂數（hex）', a.randomHex], ['對應 [0,1)', a.randomUnit], ['候選人數', a.candidateCount], ...(wOn ? [['候選籤數總和', a.totalWeight]] : []), ['候選名單雜湊', a.poolHash], ['種子', a.seed || '—'], [wOn ? '抽中第幾支籤' : '抽中第幾位候選人', a.pickIndex], ['轉盤呈現', a.wheelMode], ['抽出時間', new Date(d.drawnAt).toLocaleString('zh-TW', { hour12: false })]];
    dialog({ title: `${T.auditAction} · 第 ${d.seq} 抽`, body: html`<table class="wh-table wh-kv">${rows.map(([k, v]) => html`<tr><th>${k}</th><td><code>${v == null ? '—' : String(v)}</code></td></tr>`)}</table>`, actions: [{ label: T.close, value: null, kind: 'primary', focus: true }] });
  }

  on(root, 'click', '[data-act=more]', (e, el) => {
    const d = ev().draws.find(x => x.id === el.closest('[data-id]').dataset.id); if (!d) return;
    const chk = d.status === 'voided' ? canRestore(ev(), d.id) : null;
    popMenu(el, [
      { label: T.voidAction, disabled: d.status !== 'confirmed', fn: () => doVoid(d) },
      { label: chk && !chk.ok ? `${T.restoreAction}（${T.restoreWhy[chk.why] || ''}）` : T.restoreAction, disabled: !chk || !chk.ok, fn: () => doRestore(d) },
      { label: T.editVoidAction, disabled: d.status !== 'voided', fn: () => doEditVoid(d) },
      { sep: true },
      { label: T.auditAction, fn: () => showAudit(d) },
      { label: T.gotoRoster, fn: () => go(`${routes.tab(ev().id, 'participants')}?q=${encodeURIComponent(d.snapshot.name)}`) },
    ]);
  });
  on(root, 'click', '[data-revert]', async (e, el) => {
    e.preventDefault();
    const [pid, idx] = el.dataset.revert.split(':');
    const ok = await dialog({ title: '撤回加碼', body: html`<p>名額會減回加碼前的數量。</p>`, actions: [{ label: T.cancel, value: false, kind: 'ghost' }, { label: T.revertBonus, value: true, kind: 'primary', focus: true }] });
    if (!ok) return;
    await edit((x) => revertBonus(x, pid, +idx));
    rerender();
  });

  rerender();
  if (route.query && route.query.print === '1') setTimeout(() => window.print(), 300);
  return () => {};
}
