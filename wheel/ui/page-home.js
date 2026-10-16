// 活動列表 #/（D.2）：建立（情境預設）、匯入備份（同 id 衝突）、卡片（彩排 / 正式開始 / 進入舞台）、
// ⋯ 複製 / 匯出 / 帶到另一台電腦 / 還原最近丟棄的彩排 / 結束 / 重新開啟 / 刪除。
import { h, icon, dialog, popMenu, html, raw, readFileText } from './dom.js';
import { go, routes } from './router.js';
import { ctx } from './app-ctx.js';
import { toast } from './toast.js';
import { T, SCENARIO_LABEL, SCENARIO_HINT } from './i18n.js';
import { stageButtons, statusBadge } from './layout-settings.js';
import { eventSummary, addLog, nowISO, createEvent, hostPrizes } from '../core/model.js';
import { canRestoreDiscarded } from '../core/rehearsal.js';
import { backupText, parseBackup, detectConflict, asCopy, duplicateEvent, relTime } from '../store/backup.js';
import { TooNewError } from '../core/migrations.js';
import { fileName, download } from '../io/export.js';

let search = '';

export async function renderHome(root) {
  const page = h('div', { class: 'wh-page wh-home' });
  root.replaceChildren(page);
  let alive = true;
  async function draw() {
    if (!alive) return;
    const store = ctx.store;
    const events = await store.listEvents();
    const sandboxes = new Set((await ctx.db.listMeta('rehearsal:')).map(r => r.key.slice('rehearsal:'.length)));
    const discarded = await store.getDiscarded();
    const head = h('div', { class: 'wh-home-head' },
      h('h1', { class: 'wh-h1' }, T.homeTitle),
      h('p', { class: 'wh-lead' }, T.homeNote));
    const nodes = [head];
    if (ctx.db.degraded) nodes.push(h('p', { class: 'wh-callout wh-callout-warn', role: 'alert' }, icon('warning', 18), h('span', null, T.degraded)));
    const tools = h('div', { class: 'wh-home-tools' },
      h('button', { type: 'button', class: 'btn btn-primary', onclick: () => openCreate() }, icon('plus', 18), T.createEvent),
      h('button', { type: 'button', class: 'btn btn-ghost', onclick: () => pickBackup(draw) }, icon('upload', 18), T.importBackup));
    if (events.length >= 8) {
      const s = h('input', { type: 'search', class: 'input wh-search', placeholder: T.searchEvents, 'aria-label': T.searchEvents, value: search });
      s.addEventListener('input', () => { search = s.value; renderList(); s.focus(); });
      tools.appendChild(s);
    }
    nodes.push(tools);
    const list = h('div', { class: 'wh-event-list' });
    nodes.push(list);
    function renderList() {
      const q = search.trim().toLowerCase();
      const shown = events.length >= 8 && q ? events.filter(e => e.name.toLowerCase().includes(q)) : events;
      list.replaceChildren(...shown.map(ev => card(ev, { sandbox: sandboxes.has(ev.id), discarded, redraw: draw })));
    }
    if (!events.length) nodes.push(emptyState(draw));
    else renderList();
    page.replaceChildren(...nodes);
  }
  await draw();
  return () => { alive = false; };
}

function emptyState(redraw) {
  return h('div', { class: 'wh-empty' },
    raw(`<svg class="wh-empty-art" viewBox="0 0 120 120" width="120" height="120" aria-hidden="true"><circle cx="60" cy="62" r="46" fill="none" stroke="currentColor" stroke-width="3" opacity=".35"/><path d="M60 62 L60 16 A46 46 0 0 1 99.8 39 Z" fill="#F9DC5C"/><path d="M60 62 L99.8 39 A46 46 0 0 1 99.8 85 Z" fill="#5ED3D1"/><path d="M60 62 L99.8 85 A46 46 0 0 1 60 108 Z" fill="#F4A0C8"/><path d="M60 62 L60 108 A46 46 0 0 1 20.2 85 Z" fill="#7FB3F5"/><path d="M60 62 L20.2 85 A46 46 0 0 1 20.2 39 Z" fill="#7BD389"/><path d="M60 62 L20.2 39 A46 46 0 0 1 60 16 Z" fill="#F6A821"/><circle cx="60" cy="62" r="8" fill="currentColor"/><path d="M60 4 l-7 12 h14 z" fill="currentColor"/></svg>`),
    h('h2', { class: 'wh-h2' }, T.emptyTitle),
    h('ol', { class: 'wh-steps' }, T.emptySteps.map(s => h('li', null, s))),
    h('div', { class: 'wh-row-gap' },
      h('button', { type: 'button', class: 'btn btn-primary', onclick: () => openCreate() }, icon('plus', 18), T.emptyTitle),
      h('button', { type: 'button', class: 'btn btn-ghost', onclick: () => pickBackup(redraw) }, icon('upload', 18), T.importBackup)));
}

function card(ev, { sandbox, discarded, redraw }) {
  const s = eventSummary(ev);
  const meta = [ev.date || T.noDate, `${s.people} 人`, `${s.prizes} 個獎項`];
  if (ev.status !== 'draft' || s.done) meta.push(`已抽 ${s.done} / ${s.quota} 名額`);
  const btns = ev.status === 'closed'
    ? [h('a', { class: 'btn btn-primary', href: routes.tab(ev.id, 'records') }, T.viewRecords)]
    : [...stageButtons(ev), h('a', { class: 'btn btn-ghost', href: routes.tab(ev.id, 'participants') }, icon('edit', 18), T.edit)];
  const moreBtn = h('button', { type: 'button', class: 'icon-btn', 'aria-label': `${T.more}：${ev.name}`, 'aria-haspopup': 'menu' }, icon('more'));
  moreBtn.addEventListener('click', () => popMenu(moreBtn, menuItems(ev, { discarded, redraw, sandbox })));
  const ready = ev.participants.length > 0 && ev.prizes.length > 0;
  return h('article', { class: 'wh-card wh-event-card' },
    h('div', { class: 'wh-card-head' },
      h('h2', { class: 'wh-card-title' }, h('a', { href: routes.tab(ev.id, ev.status === 'closed' ? 'records' : 'participants') }, ev.name)),
      statusBadge(ev.status)),
    h('p', { class: 'wh-card-meta' }, meta.join(' · ')),
    sandbox ? h('p', { class: 'wh-card-note' }, T.unfinishedRehearsal) : null,
    !ready && ev.status !== 'closed' ? h('p', { class: 'wh-card-note wh-muted' }, T.needRosterPrizes) : null,
    h('div', { class: 'wh-card-actions' }, ...btns, moreBtn));
}

function menuItems(ev, { discarded, redraw, sandbox }) {
  const items = [
    { label: T.menuDuplicate, fn: async () => { const c = duplicateEvent(ev); await ctx.store.putEvent(c); toast(`已建立「${c.name}」`); redraw(); } },
    { label: T.menuDuplicateRoster, fn: async () => { const c = duplicateEvent(ev, { rosterOnly: true }); await ctx.store.putEvent(c); go(routes.tab(c.id, 'participants')); } },
    { sep: true },
    { label: T.menuExport, fn: () => exportBackup(ev) },
    { label: T.menuCarry, fn: () => carryDialog(ev) },
  ];
  // v1.3：只在丟棄的沙盒屬於此活動、正式 Event 未變動、且目前沒有沙盒時出現
  if (discarded && canRestoreDiscarded(ev, discarded, sandbox ? {} : null)) {
    items.push({ label: T.menuRestoreRehearsal, fn: async () => {
      const ok = await ctx.store.restoreDiscarded(ev.id);
      toast(ok ? T.restoredRehearsal : T.cannotRestoreRehearsal, { kind: ok ? 'info' : 'error' });
      redraw();
    } });
  }
  items.push({ sep: true });
  if (ev.status === 'live') items.push({ label: T.menuClose, fn: () => closeEvent(ev, redraw) });
  if (ev.status === 'closed') items.push({ label: T.menuReopen, fn: () => reopenEvent(ev, redraw) });
  items.push({ label: T.menuDelete, danger: true, fn: () => deleteEvent(ev, redraw) });
  return items;
}

// ---------- 共用動作（設定頁「資料」區也用） ----------

export function exportBackup(ev) {
  download(fileName(ev, '', 'json'), backupText(ev), 'application/json');
}

export function carryDialog(ev) {
  return dialog({
    title: T.carryTitle,
    body: html`<ol class="wh-steps">${T.carrySteps.map(s => html`<li>${s}</li>`)}</ol>`,
    actions: [{ label: T.close, value: null, kind: 'ghost' }, { label: T.carryBtn, value: 'dl', kind: 'primary', focus: true }],
  }).then(v => { if (v === 'dl') exportBackup(ev); });
}

export async function closeEvent(ev, after) {
  const ok = await dialog({ title: `${T.menuClose}：${ev.name}`, body: html`<p>${T.closeConfirm}</p>`, actions: [{ label: T.cancel, value: false, kind: 'ghost' }, { label: T.menuClose, value: true, kind: 'primary', focus: true }] });
  if (!ok) return;
  await mutateById(ev.id, (e) => { e.status = 'closed'; addLog(e, 'event.close', '結束活動'); });
  toast(T.closed); if (after) after();
}

export async function reopenEvent(ev, after) {
  await mutateById(ev.id, (e) => { e.status = e.draws.length ? 'live' : 'draft'; addLog(e, 'event.reopen', '重新開啟活動'); });
  toast(T.reopened); if (after) after();
}

export async function deleteEvent(ev, after) {
  const ok = await dialog({
    title: T.deleteTitle(ev.name),
    body: html`<p>${T.deleteText}</p><p><button type="button" class="link-btn" data-export>${T.exportFirst}</button></p><label class="field"><span>請輸入「${T.deleteWord}」兩字以確認</span><input type="text" class="input" data-ttc autocomplete="off"></label>`,
    actions: [{ label: T.cancel, value: false, kind: 'ghost' }, { label: T.del, value: true, kind: 'danger', validate: (box) => box.querySelector('[data-ttc]').value.trim() === T.deleteWord }],
    onOpen(box) {
      const inp = box.querySelector('[data-ttc]'); const btn = box.querySelector('.btn-danger');
      btn.disabled = true;
      inp.addEventListener('input', () => { btn.disabled = inp.value.trim() !== T.deleteWord; });
      inp.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !btn.disabled) btn.click(); });
      box.querySelector('[data-export]').addEventListener('click', () => exportBackup(ev));
      setTimeout(() => inp.focus(), 0);
    },
  });
  if (!ok) return;
  await ctx.store.deleteEvent(ev.id);
  toast(T.deleted(ev.name));
  if (after) after();
}

/** 修改任一活動（不必先 open）：若剛好是目前開啟的活動就走 store.commit */
async function mutateById(id, fn) {
  const store = ctx.store;
  if (store.official && store.official.id === id) { await store.commit(fn); return; }
  const e = await store.open(id);
  if (!e) return;
  await store.commit(fn);
  store.close();
}

// ---------- 建立活動（兩頁） ----------

export function openCreate() {
  const scenarios = ['banquet', 'stream', 'classroom', 'host', 'custom'];
  return dialog({
    title: T.createTitle,
    className: 'wh-dlg-create',
    body: html`
      <div data-page="1">
        <label class="field"><span>${T.fName} <b class="req" aria-hidden="true">*</b></span><input class="input" name="name" maxlength="60" required autocomplete="off" placeholder="2026 公司尾牙"></label>
        <p class="field-error" data-err hidden>${T.nameRequired}</p>
        <label class="field"><span>${T.fDate}</span><input class="input" type="date" name="date"></label>
        <fieldset class="field"><legend>${T.fScenario}</legend>
          <div class="wh-choice-grid">${scenarios.map((s, i) => html`<label class="wh-choice"><input type="radio" name="scenario" value="${s}" ${i === 0 ? raw('checked') : ''}><span><b>${SCENARIO_LABEL[s]}</b><small>${SCENARIO_HINT[s]}</small></span></label>`)}</div>
          <label class="wh-check-line wh-host-recorder" hidden><input type="checkbox" name="withRecorder"><span>${T.hostWithRecorder}</span></label>
          <p class="wh-hint">${T.scenarioNote}</p>
        </fieldset>
      </div>
      <div data-page="2" hidden>
        <fieldset class="field"><legend>${T.absentQ}</legend>
          <div class="wh-choice-col">
            <label class="wh-choice"><input type="radio" name="absent" value="keep" checked><span><b>${T.absentKeep}</b><small>${T.absentKeepHint}</small></span></label>
            <label class="wh-choice"><input type="radio" name="absent" value="drop"><span><b>${T.absentDrop}</b><small>${T.absentDropHint}</small></span></label>
            <label class="wh-choice"><input type="radio" name="absent" value="later"><span><b>${T.absentLater}</b><small>${T.absentLaterHint}</small></span></label>
          </div>
        </fieldset>
      </div>`,
    actions: [
      { label: T.cancel, value: null, kind: 'ghost' },
      { label: T.back, value: null, kind: 'ghost' },
      { label: T.next, value: null, kind: 'primary' },
    ],
    onOpen(box, close) {
      const p1 = box.querySelector('[data-page="1"]'), p2 = box.querySelector('[data-page="2"]');
      const [bCancel, bBack, bNext] = box.querySelectorAll('.dlg-actions .btn');
      const name = box.querySelector('[name=name]');
      const err = box.querySelector('[data-err]');
      // 「抽主持人」才顯示「同時抽一位記錄人」；切走只隱藏，切回保留先前勾選
      const recLine = box.querySelector('.wh-host-recorder');
      const recBox = recLine.querySelector('input');
      const syncRecorder = () => { recLine.hidden = box.querySelector('[name=scenario]:checked').value !== 'host'; };
      box.querySelectorAll('[name=scenario]').forEach(r => r.addEventListener('change', syncRecorder));
      syncRecorder();
      let pg = 1;
      const sync = () => {
        p1.hidden = pg !== 1; p2.hidden = pg !== 2; bBack.hidden = pg === 1;
        bNext.textContent = pg === 1 ? T.next : T.createBtn;
      };
      sync();
      setTimeout(() => name.focus(), 0);
      // 取代 dialog 預設的關閉行為
      const stop = (e) => { e.stopImmediatePropagation(); };
      bCancel.addEventListener('click', (e) => { stop(e); close(null); }, true);
      bBack.addEventListener('click', (e) => { stop(e); pg = 1; sync(); name.focus(); }, true);
      bNext.addEventListener('click', async (e) => {
        stop(e);
        if (pg === 1) {
          if (!name.value.trim()) { err.hidden = false; name.setAttribute('aria-invalid', 'true'); name.focus(); return; }
          err.hidden = true; pg = 2; sync(); box.querySelector('[name=absent]:checked').focus(); return;
        }
        const scenario = box.querySelector('[name=scenario]:checked').value;
        const a = box.querySelector('[name=absent]:checked').value;
        const ev = createEvent({
          name: name.value.trim(), date: box.querySelector('[name=date]').value || undefined, scenario,
          absentKeepsEligibility: a === 'keep' ? true : a === 'drop' ? false : null,
        });
        // 只在這條建立路徑自動建名額（複製活動、設定頁切換情境都不建）
        if (scenario === 'host') {
          ev.prizes.push(...hostPrizes(recBox.checked));
          addLog(ev, 'prize.add', `建立活動時自動新增獎項：${ev.prizes.map(p => p.name).join('、')}`);
        }
        await ctx.store.putEvent(ev);
        close(ev.id);
        go(routes.tab(ev.id, 'participants'));
      }, true);
      name.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); bNext.click(); } });
    },
  });
}

// ---------- 匯入備份 ----------

export function pickBackup(after) {
  const inp = h('input', { type: 'file', accept: '.json,application/json', hidden: true });
  document.body.appendChild(inp);
  inp.addEventListener('change', async () => {
    const f = inp.files && inp.files[0]; inp.remove();
    if (f) await importBackupFile(f, after);
  });
  inp.click();
}

export async function importBackupFile(file, after) {
  let parsed;
  try { parsed = parseBackup(await readFileText(file)); }
  catch (e) { toast(e instanceof TooNewError ? T.tooNew : T.badBackup, { kind: 'error' }); return; }
  const ev = parsed.event;
  const conflict = await detectConflict(ctx.db, ev);
  let toSave = ev;
  if (conflict) {
    const ex = conflict.existing;
    const bakAt = parsed.exportedAt || ev.updatedAt;
    const v = await dialog({
      title: T.conflictTitle,
      body: html`<p>這台電腦已有「${ex.name}」（最後編輯 ${relTime(ex.updatedAt)}），備份檔是 ${relTime(bakAt)} 匯出的。</p><p class="wh-hint">以備份取代：這台電腦上的版本會被備份檔覆蓋。另存一份：兩份都保留，備份檔會成為新的一場活動。</p>`,
      actions: [{ label: T.cancel, value: null, kind: 'ghost' }, { label: T.conflictCopy, value: 'copy', kind: 'ghost' }, { label: T.conflictReplace, value: 'replace', kind: 'primary', focus: true }],
    });
    if (!v) return;
    if (v === 'copy') toSave = asCopy(ev);
    else toSave = { ...ev, updatedAt: nowISO() };
  }
  await ctx.store.putEvent(toSave);
  toast(T.imported(toSave.name), { actions: [{ label: T.edit, fn: () => go(routes.tab(toSave.id, 'participants')) }] });
  if (after) after();
}

