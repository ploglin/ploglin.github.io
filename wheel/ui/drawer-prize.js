// 獎項編輯抽屜（D.4）：名稱、說明、名額、每次抽幾名（揭曉樣式旁註）、資格（所有人 / 只有群組 / 排除群組）＋ 即時「符合且可抽 N 人」與 0 人原因、
// 重複得獎（沿用 / 允許 / 不允許）、加碼紀錄。有紀錄時名額只能調大、資格改動黃標。
import { h, html, raw, icon, trapFocus, focusables, dialog, noWheel } from './dom.js';
import { ctx, edit } from './app-ctx.js';
import { T } from './i18n.js';
import { createPrize, prizeCounts, sortedPrizes, groupOrder, PALETTE, addLog, clamp, recomputePrizeStatuses } from '../core/model.js';
import { buildPoolDetailed } from '../core/pool.js';
import { styleHint } from '../core/reveal-style.js';
import { zeroReason } from './page-prizes.js';

let openDrawer = null;

/** openPrizeDrawer(prize | null, after) */
export function openPrizeDrawer(prize, after) {
  if (openDrawer) openDrawer.close(true);
  const e = ctx.store.official;
  const isNew = !prize;
  const c = prize ? prizeCounts(e, prize) : { confirmed: 0, pending: 0, remaining: 0 };
  const used = c.confirmed + c.pending;
  const hasRecords = prize ? e.draws.some(d => d.prizeId === prize.id) : false;
  const groups = [...groupOrder(e).keys()];
  const gmap = groupOrder(e);
  const el0 = prize ? prize.eligibility : { mode: 'all' };
  const f = {
    name: prize ? prize.name : '', description: prize ? prize.description || '' : '',
    quantity: prize ? prize.quantity : 1, perDraw: prize ? prize.perDraw : 1,
    eligMode: el0.mode || 'all', eligGroups: new Set(el0.groups || []),
    repeat: prize ? (prize.allowRepeatWinners == null ? 'inherit' : prize.allowRepeatWinners ? 'allow' : 'deny') : 'inherit',
  };
  const initial = JSON.stringify({ ...f, eligGroups: [...f.eligGroups] });
  const dirty = () => JSON.stringify({ ...f, eligGroups: [...f.eligGroups] }) !== initial;
  const prev = document.activeElement;
  const minQty = Math.max(1, used);

  const back = h('div', { class: 'wh-drawer-back' });
  const panel = h('aside', { class: 'wh-drawer', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'drw-t' });
  back.appendChild(panel);

  panel.innerHTML = html`
    <div class="dlg-head"><h2 id="drw-t" class="dlg-title">${isNew ? T.drawerAdd : T.drawerEdit}</h2><button type="button" class="icon-btn" data-close aria-label="${T.close}">${icon('close')}</button></div>
    <form class="wh-drawer-body wh-form" onsubmit="return false">
      <label class="field"><span>${T.fPrizeName} <b class="req" aria-hidden="true">*</b></span><input class="input" name="name" maxlength="40" autocomplete="off" placeholder="例如：頭獎 · 手機" value="${f.name}"></label>
      <p class="field-error" data-err hidden>${T.prizeNameRequired}</p>
      <label class="field"><span>${T.fDesc}</span><input class="input" name="description" maxlength="60" autocomplete="off" value="${f.description}"></label>
      <div class="wh-form-row">
        <label class="field"><span>${T.fQuota} <b class="req" aria-hidden="true">*</b></span><input class="input" type="number" name="quantity" min="${minQty}" max="9999" step="1" value="${f.quantity}"></label>
        <label class="field"><span>${T.fPerDraw}</span><input class="input" type="number" name="perDraw" min="1" step="1" value="${f.perDraw}"></label>
      </div>
      <p class="wh-hint" data-style></p>
      ${hasRecords ? html`<p class="wh-hint">${T.hasRecordsQuota(minQty)}</p>` : ''}
      <fieldset class="field"><legend>${T.fElig}</legend>
        <select class="input wh-select" name="eligMode">
          <option value="all" ${raw(f.eligMode === 'all' ? 'selected' : '')}>${T.eligModeAll}</option>
          <option value="include" ${raw(f.eligMode === 'include' ? 'selected' : '')}>${T.eligModeInclude}</option>
          <option value="exclude" ${raw(f.eligMode === 'exclude' ? 'selected' : '')}>${T.eligModeExclude}</option>
        </select>
        <div class="wh-elig-groups" data-groups ${raw(f.eligMode === 'all' ? 'hidden' : '')}>
          ${groups.length ? groups.map(g => html`<label class="wh-chip-check"><input type="checkbox" name="g" value="${g}" ${raw(f.eligGroups.has(g) ? 'checked' : '')}><i class="sw" style="background:${PALETTE[gmap.get(g) % 8]}"></i><span>${g}</span></label>`) : html`<p class="wh-muted">${T.noGroups}</p>`}
        </div>
        <p class="wh-cand" data-cand aria-live="polite"></p>
        <p class="wh-callout wh-callout-warn" data-elig-warn hidden>${T.hasRecordsElig}</p>
      </fieldset>
      <label class="field"><span>${T.fRepeat}</span>
        <select class="input wh-select" name="repeat">
          <option value="inherit" ${raw(f.repeat === 'inherit' ? 'selected' : '')}>${T.repeatInherit(!!e.settings.rules.allowRepeatWinners)}</option>
          <option value="allow" ${raw(f.repeat === 'allow' ? 'selected' : '')}>${T.repeatAllow}</option>
          <option value="deny" ${raw(f.repeat === 'deny' ? 'selected' : '')}>${T.repeatDeny}</option>
        </select></label>
      ${prize && prize.bonusLog.length ? html`<div class="field"><span class="wh-label">${T.bonusLogTitle}</span><ul class="wh-bonus-log">${prize.bonusLog.map(b => html`<li>${new Date(b.at).toLocaleString('zh-TW', { hour12: false })} · +${b.delta} · ${b.reason}${b.reverted ? '（已撤回）' : ''}</li>`)}</ul></div>` : ''}
    </form>
    <div class="dlg-actions"><button type="button" class="btn btn-ghost" data-close>${T.cancel}</button><button type="button" class="btn btn-primary" data-save>${T.save}</button></div>`.s;

  document.body.appendChild(back);
  noWheel(panel);
  const form = panel.querySelector('form');
  const els = form.elements;
  const candEl = panel.querySelector('[data-cand]');
  const styleEl = panel.querySelector('[data-style]');
  const warnEl = panel.querySelector('[data-elig-warn]');
  const groupsEl = panel.querySelector('[data-groups]');

  function read() {
    f.name = els.name.value.trim();
    f.description = els.description.value.trim();
    f.quantity = Math.max(minQty, Math.round(Number(els.quantity.value) || 1));
    f.perDraw = clamp(Math.round(Number(els.perDraw.value) || 1), 1, f.quantity);
    f.eligMode = els.eligMode.value;
    f.eligGroups = new Set([...form.querySelectorAll('[name=g]:checked')].map(x => x.value));
    f.repeat = els.repeat.value;
  }
  function eligibility() {
    if (f.eligMode === 'all' || !f.eligGroups.size) return { mode: 'all' };
    return { mode: f.eligMode, groups: [...f.eligGroups] };
  }
  function update() {
    read();
    els.perDraw.max = String(f.quantity);
    styleEl.textContent = `每次抽 ${f.perDraw} 名：${styleHint(f.perDraw)}`;
    groupsEl.hidden = f.eligMode === 'all';
    const temp = { id: prize ? prize.id : '__new__', eligibility: eligibility(), allowRepeatWinners: f.repeat === 'inherit' ? null : f.repeat === 'allow' };
    const { pool, stats } = buildPoolDetailed(e, temp);
    candEl.classList.toggle('is-zero', !pool.length);
    candEl.textContent = pool.length ? T.eligibleNow(pool.length) : `${T.candidatesZero}：${zeroReason(e, temp, stats)}`;
    warnEl.hidden = !(hasRecords && JSON.stringify(eligibility()) !== JSON.stringify(el0.mode === 'all' ? { mode: 'all' } : el0));
  }
  form.addEventListener('input', update);
  form.addEventListener('change', (ev2) => {
    if (ev2.target.name === 'quantity' && Number(els.quantity.value) < minQty) els.quantity.value = minQty;
    if (ev2.target.name === 'perDraw') els.perDraw.value = clamp(Math.round(Number(els.perDraw.value) || 1), 1, Math.max(1, Number(els.quantity.value) || 1));
    update();
  });
  update();

  const untrap = trapFocus(panel);
  const api = {
    async close(force = false) {
      if (!force && dirty()) {
        const ok = await dialog({ title: T.discardChanges, body: '', actions: [{ label: T.cancel, value: false, kind: 'ghost', focus: true }, { label: T.discard, value: true, kind: 'danger' }] });
        if (!ok) return;
      }
      untrap(); document.removeEventListener('keydown', onKey, true); back.remove(); openDrawer = null;
      if (prev && document.contains(prev)) prev.focus();
    },
  };
  openDrawer = api;
  function onKey(ev2) {
    if (ev2.key === 'Escape' && !document.querySelector('.dlg-back')) { ev2.preventDefault(); api.close(); }
    if (ev2.key === 'Enter' && ev2.target.tagName === 'INPUT' && panel.contains(ev2.target) && ev2.target.type !== 'checkbox') { ev2.preventDefault(); save(); }
  }
  document.addEventListener('keydown', onKey, true);
  back.addEventListener('mousedown', (ev2) => { if (ev2.target === back) api.close(); });
  panel.querySelectorAll('[data-close]').forEach(b => b.addEventListener('click', () => api.close()));
  panel.querySelector('[data-save]').addEventListener('click', save);
  setTimeout(() => { (els.name || focusables(panel)[0]).focus(); }, 0);

  async function save() {
    read();
    if (!f.name) { panel.querySelector('[data-err]').hidden = false; els.name.setAttribute('aria-invalid', 'true'); els.name.focus(); return; }
    const repeat = f.repeat === 'inherit' ? null : f.repeat === 'allow';
    await edit((x) => {
      if (isNew) {
        const pz = createPrize({ name: f.name, description: f.description, quantity: f.quantity, perDraw: f.perDraw, eligibility: eligibility(), allowRepeatWinners: repeat }, sortedPrizes(x).length + 1);
        x.prizes.push(pz);
        addLog(x, 'prize.add', `新增獎項「${pz.name}」名額 ${pz.quantity}`, { prizeId: pz.id });
      } else {
        const pz = x.prizes.find(z => z.id === prize.id); if (!pz) return;
        const old = { name: pz.name, quantity: pz.quantity, perDraw: pz.perDraw, eligibility: pz.eligibility, allowRepeatWinners: pz.allowRepeatWinners };
        pz.name = f.name;
        if (f.description) pz.description = f.description; else delete pz.description;
        pz.quantity = f.quantity; pz.perDraw = f.perDraw; pz.eligibility = eligibility(); pz.allowRepeatWinners = repeat;
        addLog(x, 'prize.edit', `修改獎項「${pz.name}」`, { prizeId: pz.id, old });
        recomputePrizeStatuses(x);
      }
    });
    await api.close(true);
    if (after) after();
  }
  return api;
}
