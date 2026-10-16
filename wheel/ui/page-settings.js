// 設定 #/e/:id/settings（D.10）：活動、規則（有正式紀錄後鎖定）、舞台、轉盤（進階收合、以投影尺寸預覽）、揭曉、氣氛、資料。
import { h, html, icon, dialog, noWheel } from './dom.js';
import { ctx, edit, isLocked } from './app-ctx.js';
import { toast } from './toast.js';
import { go, routes } from './router.js';
import { T, SCENARIO_LABEL, WHEEL_MODE_LABEL, STAGE_THEME_LABEL, VOID_REASON_LABEL } from './i18n.js';
import { openWheelPreview } from './wheel-preview.js';
import { exportBackup, carryDialog, closeEvent, reopenEvent, deleteEvent } from './page-home.js';
import { SCENARIOS, VOID_REASONS, addLog, hasOfficialDraws, clamp } from '../core/model.js';
import { newSeed } from '../core/rng.js';
import { decideWheel, wheelDiameter } from '../core/sectors.js';
import { weightsUI } from './unlock.js';
import { relTime } from '../store/backup.js';
import { migrateEvent } from '../core/migrations.js';

const ev = () => ctx.store.official;

export async function renderSettings(main) {
  const root = h('div', { class: 'wh-page wh-settings' });
  main.replaceChildren(root);
  noWheel(root);

  /** 設定修改：防抖存檔；規則類寫 log */
  const set = (fn, { log, rerender: rr = false } = {}) => edit((e) => { fn(e.settings, e); if (log) addLog(e, log.type, log.summary); }, { debounce: !log }).then(() => { if (rr) rerender(); else refreshWheelNote(); });

  let wheelNoteEl = null;
  function refreshWheelNote() {
    if (!wheelNoteEl) return;
    const e = ev();
    const pool = e.participants.filter(p => !p.excluded).map(p => ({ id: p.id, weight: p.weight }));
    const d = decideWheel(pool, e.settings, wheelDiameter({ width: 1920, height: 1080, projection: true }), e.participants.length);
    let m = WHEEL_MODE_LABEL[d.mode];
    if (d.note === 'equal-auto') m += '・扇區等分';
    if (d.note === 'sampled-auto') m += '（幾何不足自動降級）';
    wheelNoteEl.textContent = pool.length > 1 ? T.wheelNow(pool.length, m) : '';
  }

  // ---------- 控制項工廠 ----------
  const row = (label, control, hint, id) => h('div', { class: 'wh-set-row' },
    h('div', { class: 'wh-set-label' }, id ? h('label', { for: id }, label) : h('span', null, label), hint ? h('small', { class: 'wh-hint' }, hint) : ''),
    h('div', { class: 'wh-set-ctl' }, control));
  const sw = (label, get, put, hint, { disabled = false, log } = {}) => {
    const b = h('button', { type: 'button', role: 'switch', class: 'wh-switch', 'aria-checked': String(!!get()), 'aria-label': label, disabled });
    b.addEventListener('click', () => { const v = b.getAttribute('aria-checked') !== 'true'; b.setAttribute('aria-checked', String(v)); set((s, e) => put(s, v, e), log ? { log: log(v) } : {}); });
    return row(label, b, hint);
  };
  const radios = (label, name, opts, cur, put, hint, { disabled = false, log } = {}) => {
    const box = h('div', { class: 'wh-seg', role: 'radiogroup', 'aria-label': label },
      ...opts.map(([v, l]) => {
        const b = h('button', { type: 'button', role: 'radio', 'aria-checked': String(cur === v), class: cur === v ? 'on' : '', disabled });
        b.textContent = l;
        b.addEventListener('click', () => {
          box.querySelectorAll('[role=radio]').forEach(x => { x.setAttribute('aria-checked', 'false'); x.classList.remove('on'); });
          b.setAttribute('aria-checked', 'true'); b.classList.add('on');
          set((s, e) => put(s, v, e), log ? { log: log(v), rerender: true } : {});
        });
        return b;
      }));
    box.addEventListener('keydown', (k) => {
      if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(k.key)) return;
      const bs = [...box.querySelectorAll('[role=radio]:not([disabled])')]; const i = bs.indexOf(document.activeElement);
      if (i < 0) return; k.preventDefault();
      const n = bs[(i + (k.key === 'ArrowLeft' || k.key === 'ArrowUp' ? -1 : 1) + bs.length) % bs.length]; n.focus(); n.click();
    });
    return row(label, box, hint);
  };
  const select = (label, opts, cur, put, hint) => {
    const id = 'set-' + Math.random().toString(36).slice(2);
    const s = h('select', { class: 'input wh-select', id }, ...opts.map(([v, l]) => h('option', { value: String(v), selected: String(cur) === String(v) }, l)));
    s.addEventListener('change', () => set((st, e) => put(st, s.value, e)));
    return row(label, s, hint, id);
  };
  const section = (title, ...rows) => h('section', { class: 'wh-set-sec' }, h('h3', { class: 'wh-set-h' }, title), ...rows);

  function rerender() {
    const e = ev(); if (!e) return;
    const s = e.settings;
    const locked = hasOfficialDraws(e);
    const ro = isLocked(e.id);

    // 活動
    const name = h('input', { class: 'input', id: 'set-name', maxlength: 60, value: e.name });
    name.addEventListener('change', () => { const v = name.value.trim(); if (!v) { name.value = e.name; return; } edit((x) => { x.name = v; }).then(() => { document.title = `${v}｜轉盤抽獎`; }); });
    const date = h('input', { class: 'input', id: 'set-date', type: 'date', value: e.date || '' });
    date.addEventListener('change', () => edit((x) => { if (date.value) x.date = date.value; else delete x.date; }));
    const scen = h('select', { class: 'input wh-select', id: 'set-scen' }, ...Object.keys(SCENARIOS).map(k => h('option', { value: k, selected: e.scenario === k }, SCENARIO_LABEL[k])));
    scen.addEventListener('change', () => changeScenario(scen.value, locked));
    const title = h('input', { class: 'input', id: 'set-title', maxlength: 60, placeholder: T.sameAsName, value: s.stageTitle || '' });
    title.addEventListener('change', () => set((st) => { st.stageTitle = title.value.trim(); }));
    const secEvent = section(T.secEvent,
      row(T.fName, name, null, 'set-name'), row(T.fDate, date, null, 'set-date'), row(T.fScenario, scen, null, 'set-scen'), row(T.fStageTitle, title, null, 'set-title'));

    // 規則
    const rulesHead = locked ? h('p', { class: 'wh-lock-note' }, icon('lock', 16), T.rulesLocked) : '';
    const absentCur = s.rules.absentKeepsEligibility === true ? 'keep' : s.rules.absentKeepsEligibility === false ? 'drop' : null;
    const seedIn = h('input', { class: 'input input-mono', value: s.seed || '', 'aria-label': T.seed, disabled: locked, readonly: locked });
    seedIn.addEventListener('change', () => set((st) => { st.seed = seedIn.value.trim(); }));
    const seedRow = s.rngMode === 'seeded' ? row(T.seed, h('div', { class: 'wh-row-gap' }, seedIn,
      h('button', { type: 'button', class: 'btn btn-ghost btn-sm', disabled: locked, onclick: () => { seedIn.value = newSeed(); set((st) => { st.seed = seedIn.value; }); } }, T.newSeed),
      h('button', { type: 'button', class: 'btn btn-ghost btn-sm', onclick: () => { navigator.clipboard && navigator.clipboard.writeText(seedIn.value).then(() => toast(T.copied)); } }, icon('copy', 16), T.copy))) : '';
    const secRules = section(T.secRules, rulesHead,
      sw(T.sAllowRepeat, () => s.rules.allowRepeatWinners, (st, v) => { st.rules.allowRepeatWinners = v; }, T.sAllowRepeatHint, { disabled: locked, log: (v) => ({ type: 'rules.set', summary: `允許重複得獎：${v ? '是' : '否'}` }) }),
      radios(T.sAbsentKeep, 'absent', [['keep', T.keep], ['drop', T.drop]], absentCur, (st, v) => { st.rules.absentKeepsEligibility = v === 'keep'; },
        absentCur ? T.sAbsentKeepHint : `${T.sAbsentKeepHint}。${T.sAbsentUndecided}`, { disabled: locked, log: (v) => ({ type: 'rules.set', summary: `未到場者保留後續資格：${v === 'keep' ? '保留' : '不保留'}` }) }),
      radios(T.sRng, 'rng', [['csprng', T.rngCsprng], ['seeded', T.rngSeeded]], s.rngMode, (st, v) => { st.rngMode = v; if (v === 'seeded' && !st.seed) st.seed = newSeed(); }, null,
        { disabled: locked, log: (v) => ({ type: 'rules.set', summary: `隨機來源：${v === 'seeded' ? '固定種子' : '系統安全亂數'}` }) }),
      seedRow);

    // 舞台
    const keyMap = h('ol', { class: 'wh-keymap' }, ...VOID_REASONS.map((r, i) => h('li', null, h('kbd', { class: 'kbd' }, String(i + 1)), ' ', VOID_REASON_LABEL[r])));
    const secStage = section(T.secStage,
      sw(T.sProjection, () => s.projectionMode, (st, v) => { st.projectionMode = v; }, T.sProjectionHint),
      sw(T.sClicker, () => s.clickerMode, (st, v) => { st.clickerMode = v; }, T.sClickerHint),
      row(T.sVoidKeys, keyMap, T.sVoidKeysHint),
      select(T.sArm, [[0, T.armOff], [1, T.armLast(1)], [2, T.armLast(2)], [3, T.armLast(3)]], s.armBigPrizes, (st, v) => { st.armBigPrizes = +v; }, T.sArmHint),
      select(T.sWait, [['', T.off], [10, T.seconds(10)], [15, T.seconds(15)], [30, T.seconds(30)]], s.waitCountdownSec == null ? '' : s.waitCountdownSec, (st, v) => { st.waitCountdownSec = v === '' ? null : +v; }));

    // 轉盤
    wheelNoteEl = h('small', { class: 'wh-hint', 'aria-live': 'polite' });
    const spin = h('input', { type: 'range', min: 3, max: 10, step: 1, value: Math.round(s.spinDurationMs / 1000), 'aria-label': T.sSpin, class: 'wh-range' });
    const spinOut = h('output', { class: 'wh-range-out' }, `${Math.round(s.spinDurationMs / 1000)} 秒`);
    spin.addEventListener('input', () => { spinOut.textContent = `${spin.value} 秒`; });
    spin.addEventListener('change', () => set((st) => { st.spinDurationMs = clamp(+spin.value, 3, 10) * 1000; }));
    const th = s.wheelThresholds;
    const num = (val, min, max, put, label) => { const i = h('input', { type: 'number', class: 'input input-num', min, max, step: 1, value: val, 'aria-label': label }); i.addEventListener('change', () => { const v = clamp(Math.round(+i.value || min), min, max); i.value = v; set((st) => put(st, v)); }); return i; };
    const adv = h('details', { class: 'wh-adv' }, h('summary', null, T.advanced),
      row(T.thresholds, h('div', { class: 'wh-row-gap' },
        num(th.full, 8, 120, (st, v) => { st.wheelThresholds.full = v; }, '完整門檻'),
        num(th.compact, 24, 400, (st, v) => { st.wheelThresholds.compact = v; }, '緊湊門檻'),
        num(th.sampled, 48, 5000, (st, v) => { st.wheelThresholds.sampled = v; }, '抽樣門檻'))),
      row(T.sampledSectors, num(s.sampledSectors, 24, 48, (st, v) => { st.sampledSectors = v; }, T.sampledSectors), '24–48'));
    const modeSel = select(T.sWheelMode, Object.entries(WHEEL_MODE_LABEL), s.wheelMode, (st, v) => { st.wheelMode = v; });
    modeSel.querySelector('.wh-set-ctl').appendChild(wheelNoteEl);
    const secWheel = section(T.secWheel,
      modeSel,
      // 扇區大小：名單沒有籤數 > 1 且未解鎖時不顯示（全員 1 籤時兩種選項結果相同）
      weightsUI(ev()).show ? radios(T.sSectorBy, 'sector', [['weight', T.sectorWeight], ['equal', T.sectorEqual]], s.sectorBy, (st, v) => { st.sectorBy = v; }) : null,
      row(T.sSpin, h('div', { class: 'wh-row-gap wh-align-center' }, spin, spinOut)),
      row('', h('button', { type: 'button', class: 'btn btn-ghost', onclick: () => openWheelPreview() }, icon('eye', 18), T.previewWheel)),
      adv);

    // 揭曉
    const secReveal = section(T.secReveal,
      sw(T.sShowGroup, () => s.revealShowGroup, (st, v) => { st.revealShowGroup = v; }),
      sw(T.sShowCode, () => s.revealShowCode, (st, v) => { st.revealShowCode = v; }),
      sw(T.sDisamb, () => s.disambiguateSameName, (st, v) => { st.disambiguateSameName = v; }),
      radios(T.sFlip, 'flip', [['byCount', T.flipByCount], ['manual', T.flipManual], ['auto', T.flipAuto]], s.revealFlip, (st, v) => { st.revealFlip = v; }),
      select(T.sAutoConfirm, [['', T.off], [0, T.autoConfirmNone], [3, T.seconds(3)], [5, T.seconds(5)], [10, T.seconds(10)]], s.autoConfirmSeconds == null ? '' : s.autoConfirmSeconds, (st, v) => { st.autoConfirmSeconds = v === '' ? null : +v; }, T.sAutoConfirmHint));

    // 氣氛
    const vol = (label, key) => { const r = h('input', { type: 'range', min: 0, max: 1, step: 0.1, value: s.sound[key], class: 'wh-range', 'aria-label': `${label}音量` }); r.addEventListener('change', () => set((st) => { st.sound[key] = +r.value; })); return h('label', { class: 'wh-vol' }, h('span', null, label), r); };
    const secMood = section(T.secMood,
      sw(T.sSound, () => s.sound.enabled, (st, v) => { st.sound.enabled = v; }),
      row('音量', h('div', { class: 'wh-row-gap' }, vol(T.sTick, 'tick'), vol(T.sFanfare, 'fanfare'), vol(T.sDrum, 'drumroll'))),
      sw(T.sConfetti, () => s.confetti, (st, v) => { st.confetti = v; }),
      radios(T.sMotion, 'motion', [['system', T.motionSystem], ['full', T.motionFull], ['reduced', T.motionReduced]], s.motion, (st, v) => { st.motion = v; }),
      select(T.sTheme, Object.entries(STAGE_THEME_LABEL), s.stageTheme, (st, v) => { st.stageTheme = v; }));

    // 資料
    const backupsBtn = h('button', { type: 'button', class: 'btn btn-ghost', onclick: () => openBackups() }, T.restoreBackup);
    const backupsLabel = h('span', { class: 'wh-muted' });
    ctx.store.listBackups(e.id).then(list => { backupsLabel.textContent = T.autoBackups(list.length); });
    const secData = section(T.secData,
      h('div', { class: 'wh-row-gap' },
        h('button', { type: 'button', class: 'btn btn-ghost', onclick: () => exportBackup(ev()) }, icon('download', 18), T.exportBackup),
        h('button', { type: 'button', class: 'btn btn-ghost', onclick: () => carryDialog(ev()) }, T.carry),
        backupsLabel, backupsBtn),
      h('div', { class: 'wh-row-gap wh-data-danger' },
        e.status === 'closed'
          ? h('button', { type: 'button', class: 'btn btn-ghost', onclick: () => reopenEvent(ev(), () => { ctx.store.reload().then(rerender); }) }, T.reopenEvent)
          : e.status === 'live' ? h('button', { type: 'button', class: 'btn btn-ghost', onclick: () => closeEvent(ev(), () => { ctx.store.reload().then(rerender); }) }, T.closeEvent) : '',
        h('span', { class: 'wh-spacer' }),
        h('button', { type: 'button', class: 'btn btn-danger', onclick: () => deleteEvent(ev(), () => go(routes.home())) }, icon('trash', 18), T.deleteEvent)));

    root.replaceChildren(h('div', { class: 'wh-page-head' }, h('h2', { class: 'wh-h2' }, T.tabSettings)), secEvent, secRules, secStage, secWheel, secReveal, secMood, secData);
    if (ro) root.querySelectorAll('input,select,button.wh-switch,[role=radio]').forEach(x => { x.disabled = true; });
    refreshWheelNote();
  }

  async function changeScenario(v, locked) {
    const choice = await dialog({
      title: T.scenarioApplyQ(SCENARIO_LABEL[v]),
      body: html`<p>${T.scenarioApplyText}</p>${locked ? html`<p class="wh-hint">${T.scenarioApplyText2}</p>` : ''}`,
      actions: [{ label: T.keepCurrent, value: 'name', kind: 'ghost' }, { label: T.applyDefaults, value: 'apply', kind: 'primary', focus: true }],
    });
    if (!choice) { rerender(); return; }
    await edit((x) => {
      x.scenario = v;
      if (choice === 'apply') {
        const sc = SCENARIOS[v], st = x.settings;
        Object.assign(st, { spinDurationMs: sc.spin, autoConfirmSeconds: sc.autoConfirm, projectionMode: sc.projection, armBigPrizes: sc.arm, revealFlip: sc.flip, confetti: sc.confetti });
        st.sound.enabled = sc.sound;
        if (!locked) st.rules.allowRepeatWinners = sc.allowRepeat;
        addLog(x, 'settings.change', `套用「${SCENARIO_LABEL[v]}」情境預設值`);
      }
    });
    rerender();
  }

  async function openBackups() {
    const e = ev();
    const list = await ctx.store.listBackups(e.id);
    const v = await dialog({
      title: T.backupsTitle,
      body: list.length ? html`<p class="wh-hint">${T.backupsNote}</p><ul class="wh-backups">${list.map((b, i) => html`<li><span>${new Date(b.at).toLocaleString('zh-TW', { hour12: false })}（${relTime(b.at)}）· ${b.event.participants.length} 人 · ${b.event.draws.length} 筆紀錄</span><button type="button" class="btn btn-ghost btn-sm" data-i="${i}" data-restore>${T.restoreThis}</button></li>`)}</ul>` : html`<p>${T.noBackups}</p>`,
      actions: [{ label: T.close, value: null, kind: 'ghost' }],
      onOpen(box, close) { box.querySelectorAll('[data-restore]').forEach(b => b.addEventListener('click', (k) => { k.stopPropagation(); close(+b.dataset.i); })); },
    });
    if (v == null) return;
    const b = list[v];
    const ok = await dialog({ title: T.restoreThis, body: html`<p>${T.restoreConfirm}</p>`, actions: [{ label: T.cancel, value: false, kind: 'ghost' }, { label: T.restoreThis, value: true, kind: 'danger' }] });
    if (!ok) return;
    if (isLocked(e.id)) { toast(T.lockedElsewhere, { kind: 'error' }); return; }
    await ctx.store.putEvent(migrateEvent(b.event));
    await ctx.store.reload();
    toast(T.restoredBackup);
    rerender();
  }

  rerender();
  return () => {};
}
