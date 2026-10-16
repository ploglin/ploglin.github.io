// 抽獎舞台（主持人端，D.5）：組合畫面、輸入模型（D.5b）、動畫計時、投影模式、彩排、觀眾視窗同步。
// 狀態落地一律走 store.commit(fn, { target: 'active' })（彩排時自動打在沙盒上）；開轉先寫 pending 再播動畫。
//
// 掛載：mountStage(root, { eventId, mode?: 'rehearsal'|'live', store?, tabSync?, onExit?(url) }) → destroy()
//   - 由 app.js 的 #/e/:id/stage[?mode=rehearsal|live] 路由呼叫，或由 wheel/stage.html 獨立載入。
import { h, icon, kbd, inInput } from '../dom.js';
import { openDB } from '../../store/db.js';
import { createStore, LockedError } from '../../store/store.js';
import * as ops from '../../core/stage-ops.js';
import { resolveKey, canToggleRehearsal, FORWARD_KEYS, COOLDOWN_MS } from '../../core/state.js';
import { prizeById, VOID_REASONS, addLog, displayName, sameNameSet, participantById } from '../../core/model.js';
import { revealCards } from '../../core/draw.js';
import { buildPool, buildPoolDetailed } from '../../core/pool.js';
import { PRIZE_INTRO_MS, AUTO_FLIP_MS } from '../../core/reveal-style.js';
import { sandboxDrawCount, sandboxHasPending } from '../../core/rehearsal.js';
import { randomUnit } from '../../core/rng.js';
import { StageView } from './view.js';
import { createAudio } from './audio.js';
import { createTabSync, createScreenChannel, SCREEN_STALE_MS } from './sync.js';
import {
  t, mainAction, buildPublicView, wheelPreview, poolSignature, spinTimeline, emptyPoolText, moveCardFocus,
  mainPressAction, barMainModel,
} from './logic.js';
import { renderVoidBar, focusVoidBar } from './void-bar.js';
import { openModal } from './overlay.js';
import * as OV from './overlays.js';
import { bonusSpec } from './dialog-bonus.js';
import { quickListSpec } from './quick-list.js';
import { renderSidebar } from './sidebar.js';
import { buildControlsBar, renderControlsBar } from './controls-bar.js';
import { attachKeys } from './hotkeys.js';
import { ensureStageCss, appUrl, screenUrl, sessGet, sessSet, stripModeParam, prefersReducedMotion } from './env.js';
import { fill } from './util.js';

const REVOKE_WINDOW_MS = 30000;
const CONTROLS_HIDE_MS = 3000;
const CONTROLS_HIDE_TOUCH_MS = 5000;
const CURSOR_HIDE_MS = 2000;
/** 點操作列主鈕收起後，這段時間內滑鼠移動不叫出操作列；之後還要離開收起時的位置超過 SHOW_MOVE_PX 才叫出 */
const SUPPRESS_SHOW_MS = 800;
const SHOW_MOVE_PX = 24;

export function mountStage(root, opts = {}) {
  const c = new StageController(root, opts);
  c.start().catch((err) => { console.error(err); c.fatal(err); });
  const destroy = () => c.destroy();
  destroy.destroy = destroy;
  destroy.controller = c;
  return destroy;
}

class StageController {
  constructor(root, opts) {
    this.root = root;
    this.opts = opts;
    this.eventId = opts.eventId;
    this.mode = opts.mode || null;
    this.t = {};
    this.ui = this.freshUi();
    this.audience = { connected: false, ready: false, lastSeen: 0 };
    this.ready = false;
    this.dead = false;
    this.readOnly = false;
    this.fxSeq = 0;
    this.audio = createAudio(() => (this.ev ? this.ev.settings.sound : null));
  }

  freshUi() {
    return {
      overlay: null, modal: null, voidData: null, cardSelect: null,
      phaseAt: 0, lastPhase: null, lastPrize: null,
      spinPlay: null, shortfall: 0, busy: false,
      banner: null, marquee: null, fx: null,
      controlsShown: false, controlsSticky: false, flashUntil: 0,
      wheelCache: null, lastCandidates: 0, autoConfirmAt: 0, recovering: false,
    };
  }

  get ev() { return this.store ? this.store.event : null; }
  overlays() { return OV; }
  get hostChrome() { const ev = this.ev; return this.audience.connected || !!(ev && !ev.settings.projectionMode); }
  /** 作廢條、說明等文字是否以「會投影出去」為前提（沒有觀眾視窗 = 主持畫面就是投影畫面） */
  get mirror() { return !this.audience.connected; }
  get reduced() {
    const ev = this.ev; const m = ev ? ev.settings.motion : 'system';
    return m === 'reduced' || (m !== 'full' && prefersReducedMotion());
  }

  // ================= 啟動 =================
  async start() {
    this.css = ensureStageCss();
    document.body.classList.add('wstage-body');
    document.title = t('stage.docTitle');
    this.buildShell();

    if (this.opts.store) this.store = this.opts.store;
    this.tabs = this.opts.tabSync || createTabSync();
    if (!this.store) {
      const db = await openDB();
      this.store = createStore(db, { lockCheck: (id) => this.tabs.heldElsewhere(id) });
      if (db.degraded) this.toast(t('stage.degraded'), 9000);
    }
    if (this.dead) return;

    if (this.tabs.available && await this.tabs.probe(this.eventId)) {
      const choice = await this.showMessage({
        title: t('stage.heldTitle'), body: t('stage.heldBody'),
        actions: [{ label: t('stage.openAsScreen'), value: 'screen' }, { label: t('stage.takeover'), value: 'take', primary: true }],
      });
      if (choice === 'screen') { location.href = screenUrl(this.eventId); return; }
      this.tabs.takeover(this.eventId);
    }

    let official = null;
    try { official = await this.store.open(this.eventId); } catch (err) { console.error(err); }
    if (this.dead) return;
    if (!official) return this.showMessage({ title: t('stage.notFound'), actions: [{ label: t('stage.backToSettings'), href: appUrl('#/') }] });
    if (official.status === 'closed') return this.showMessage({ title: t('stage.closed'), actions: [{ label: t('stage.toRecords'), href: appUrl(`#/e/${this.eventId}/records`), primary: true }] });
    if (!official.participants.length) return this.showMessage({ title: t('stage.missingPeople'), actions: [{ label: t('stage.backToSettings'), href: appUrl(`#/e/${this.eventId}/participants`), primary: true }] });
    if (!official.prizes.length) return this.showMessage({ title: t('stage.missingPrizes'), actions: [{ label: t('stage.backToSettings'), href: appUrl(`#/e/${this.eventId}/prizes`), primary: true }] });

    this.tabs.hold(this.eventId, this.store.rehearsal);
    this.offTabs = this.tabs.on((m) => { if (m.type === 'taken' && m.eventId === this.eventId) this.setReadOnly(); });
    this.offStore = this.store.subscribe((r) => { if (r && r.type === 'save-error') this.showSaveError(); });

    // 每次進舞台（含彩排）前自動備份一份正式 Event（B.4）
    try { await this.store.autoBackup(this.store.official); } catch (err) { console.error(err); }

    const sessKey = 'wheel_stage_rh:' + this.eventId;
    let askResume = false;
    if (this.store.sandbox) {
      if (this.mode === 'rehearsal' || sessGet(sessKey) === '1') { /* 重新整理：續演（C.7-6） */ }
      else if (sandboxDrawCount(this.store.sandbox) === 0) await this.store.discardRehearsal();
      else askResume = true;                                  // C.7-31：上次彩排未結束
    } else if (this.mode === 'rehearsal') {
      await this.store.startRehearsal();
    }
    stripModeParam();

    this.setupChannel();
    this.detachKeys = attachKeys(document, (k, e) => this.onKey(k, e));
    this.bindWindow();
    this.ready = true;
    await this.enter();
    if (askResume) this.openOverlay('resume_rehearsal', OV.resumeRehearsal(this, sandboxDrawCount(this.store.sandbox)));
    if (this.audio.blocked()) this.toast(t('stage.soundBlocked'), 5000);
  }

  async enter() {
    this.clearTimers();
    if (this.ui.modal) this.ui.modal.close();
    const keep = { controlsSticky: this.ui.controlsSticky };
    this.ui = { ...this.freshUi(), ...keep };
    this.view.stopPlay();
    const r = await this.commit((ev) => ops.enterStage(ev));
    sessSet('wheel_stage_rh:' + this.eventId, this.store.rehearsal ? '1' : null);
    this.tabs.setRehearsal(this.store.rehearsal);
    if (r && r.recover === 'spin') this.recoverSpin();
  }

  buildShell() {
    this.root.replaceChildren();
    this.el = h('div', { class: 'wstage is-mirror' });
    this.colWrap = h('div', { class: 'ws-stagewrap' });
    this.view = new StageView(this.colWrap, { role: 'host' });
    this.view.onTick = () => this.audio.tick();
    this.view.onResize = () => { if (this.ready) this.render(); };
    this.view.onCardClick = (slot) => this.cardClick(slot);

    this.stripEl = h('div', { class: 'ws-strip' }, t('stage.rehearsalStrip'));
    this.statusEl = h('div', { class: 'ws-status' });
    this.mainBtn = h('button', { type: 'button', class: 'ws-main-btn', onclick: () => this.pressMain() });
    this.voidBtn = h('button', { type: 'button', class: 'ws-void-btn', onclick: () => this.act('void.select') });
    this.revokeBtn = h('button', { type: 'button', class: 'ws-revoke-btn', onclick: () => this.act('void.last') });
    this.disarmBtn = h('button', { type: 'button', class: 'ws-revoke-btn', onclick: () => this.act('disarm') });
    this.hintEl = h('div', { class: 'ws-hint' });
    this.primary = h('div', { class: 'ws-primary' }, this.stripEl,
      h('div', { class: 'ws-primary-row' }, this.mainBtn, this.voidBtn, this.revokeBtn, this.disarmBtn), this.hintEl, this.statusEl);
    this.colWrap.appendChild(this.primary);

    this.side = h('aside', { class: 'ws-side', 'aria-label': t('side.prizes') });
    this.controls = h('div', { class: 'ws-controls', role: 'toolbar', 'aria-label': t('bar.settings') });
    this.cbParts = buildControlsBar(this, this.controls);
    this.barMainBtn = this.cbParts.main;
    this.voidBar = h('div', { class: 'ws-voidbar', hidden: true });
    this.layer = h('div', { class: 'ws-layer' });
    this.toastEl = h('div', { class: 'ws-toast', role: 'status', 'aria-live': 'polite', hidden: true });
    this.errEl = h('div', { class: 'ws-error', role: 'alert', hidden: true });
    this.msgEl = h('div', { class: 'ws-msg', hidden: true });
    this.el.append(this.colWrap, this.side, this.controls, this.voidBar, this.layer, this.toastEl, this.errEl, this.msgEl);
    this.root.appendChild(this.el);
    this.controls.addEventListener('mouseenter', () => { this.overBar = true; });
    this.controls.addEventListener('mouseleave', () => { this.overBar = false; this.scheduleHideControls(); });
  }

  bindWindow() {
    // 只看真的滑鼠移動；觸控 / 觸控筆改由 pointerdown 叫出操作列（不會觸發任何舞台動作）
    this._mm = (e) => { if (!e || !e.pointerType || e.pointerType === 'mouse') this.onMouseMove(e); };
    this._md = (e) => {
      this.audio.unlock();
      if (e && (e.pointerType === 'touch' || e.pointerType === 'pen') && !this.controls.contains(e.target)) this.onMouseMove(e, true);
    };
    this._bu = (e) => {
      if (this.allowUnload || !this.store || !this.store.sandbox) return;
      if (sandboxDrawCount(this.store.sandbox) > 0) { e.preventDefault(); e.returnValue = t('rehearsal.unloadWarn'); return e.returnValue; }
    };
    this._vis = () => { if (document.visibilityState === 'visible') this.requestWakeLock(); };
    this._fs = () => this.render();
    window.addEventListener('pointermove', this._mm, { passive: true });
    window.addEventListener('pointerdown', this._md, { passive: true });
    window.addEventListener('beforeunload', this._bu);
    document.addEventListener('visibilitychange', this._vis);
    document.addEventListener('fullscreenchange', this._fs);
    this.requestWakeLock();
    this.onMouseMove();
  }

  async requestWakeLock() {
    try { if (navigator.wakeLock && document.visibilityState === 'visible') this.wake = await navigator.wakeLock.request('screen'); } catch { /* 不支援 / 被拒 */ }
  }

  destroy() {
    if (this.dead) return;
    this.dead = true;
    this.clearTimers();
    clearInterval(this.t.aud);
    this.audio.destroy();
    if (this.view) this.view.destroy();
    if (this.detachKeys) this.detachKeys();
    window.removeEventListener('pointermove', this._mm);
    window.removeEventListener('pointerdown', this._md);
    window.removeEventListener('beforeunload', this._bu);
    document.removeEventListener('visibilitychange', this._vis);
    document.removeEventListener('fullscreenchange', this._fs);
    if (this.offTabs) this.offTabs();
    if (this.offStore) this.offStore();
    if (this.tabs) this.tabs.release();
    if (this.chan) this.chan.close();
    try { if (this.wake) this.wake.release(); } catch { /* */ }
    if (this.store && this.store.flush) this.store.flush().catch(() => {});
    if (this.store && !this.opts.store) this.store.close();
    document.body.classList.remove('wstage-body', 'ws-cursor-hidden');
    if (this.css && this.css.added) this.css.link.remove();
    this.root.replaceChildren();
  }

  clearTimers() {
    for (const k of ['intro', 'flip', 'spinEnd', 'autoConfirm', 'revoke', 'ctrlHide', 'cursor', 'marq', 'flash', 'toast', 'cool']) {
      clearTimeout(this.t[k]); clearInterval(this.t[k]); this.t[k] = null;
    }
    this.audio.drumStop();
  }

  fatal(err) {
    this.showMessage({ title: t('stage.saveError'), body: String(err && err.message || err), actions: [{ label: t('stage.backToSettings'), href: appUrl('#/') }] });
  }

  setReadOnly() {
    this.readOnly = true;
    this.clearTimers();
    this.errEl.textContent = t('stage.readOnly'); this.errEl.hidden = false;
  }

  // ================= 存檔 =================
  async commit(fn, o = {}) {
    try {
      const r = await this.store.commit(fn, { target: 'active', ...o });
      this.errEl.hidden = this.readOnly ? false : this.errEl.hidden;
      this.sync();
      return r;
    } catch (err) {
      console.error(err);
      if (err instanceof LockedError) this.toast(t('stage.heldTitle'), 6000);
      else this.showSaveError();
      this.sync();
      throw err;
    }
  }

  showSaveError() { this.errEl.textContent = t('stage.saveError'); this.errEl.hidden = false; }

  /** 狀態改變後：偵測 phase / 獎項轉換 → 計時器與焦點 → 重繪 */
  sync() {
    const ev = this.ev; if (!ev || this.dead) return;
    const st = ev.stage;
    if (st.phase !== this.ui.lastPhase || st.currentPrizeId !== this.ui.lastPrize) {
      const prev = this.ui.lastPhase;
      this.ui.lastPhase = st.phase; this.ui.lastPrize = st.currentPrizeId;
      this.ui.phaseAt = Date.now();
      this.onPhaseEnter(st.phase, prev);
    }
    this.render();
  }

  onPhaseEnter(phase, prev) {
    clearTimeout(this.t.intro); this.t.intro = null;
    clearInterval(this.t.flip); this.t.flip = null;
    clearTimeout(this.t.autoConfirm); this.t.autoConfirm = null; this.ui.autoConfirmAt = 0;
    if (prev === 'armed') this.audio.drumStop();
    if (phase !== 'reveal') this.ui.cardSelect = this.ui.cardSelect && this.ui.cardSelect.recall ? this.ui.cardSelect : null;
    if (phase !== 'spinning') { clearTimeout(this.t.spinEnd); this.ui.spinPlay = null; }
    if (phase === 'prize_intro') {
      const extra = this.ui.banner ? Math.max(0, this.ui.banner.until - Date.now()) : 0;
      this.t.intro = setTimeout(() => this.finishIntro(), PRIZE_INTRO_MS + extra);
    } else if (phase === 'armed') {
      this.audio.drumStart();
    } else if (phase === 'reveal') {
      this.onRevealEnter(prev);
    }
    requestAnimationFrame(() => this.focusPrimary());
  }

  async finishIntro() {
    this.t.intro = null;
    const ev = this.ev;
    if (!ev || ev.stage.phase !== 'prize_intro' || this.ui.overlay) return;
    try { await this.commit((e) => ops.introDone(e)); } catch { /* 已顯示錯誤 */ }
  }

  onRevealEnter(prev) {
    const ev = this.ev;
    const rs = ops.currentRevealStyle(ev);
    if (!rs) return;
    const recovering = prev == null;            // 重新整理後直接進揭曉：不重播慶祝
    if (rs.style === 'wall') {
      if (rs.flip === 'auto' && !ops.isRevealDone(ev)) this.t.flip = setInterval(() => this.autoFlip(), AUTO_FLIP_MS);
    } else if (!recovering) this.celebrate();
    if (this.store.rehearsal && !this.hostChrome && !recovering) this.flashControls(2000);
    this.maybeAutoConfirm();
  }

  celebrate() {
    this.audio.fanfare();
    if (this.ev.settings.confetti !== false && !this.reduced) this.ui.fx = { id: ++this.fxSeq + ':' + Date.now(), type: 'confetti', at: Date.now() };
  }

  // ================= 繪製 =================
  publicView(ev) {
    const st = ev.stage;
    const prize = prizeById(ev, st.currentPrizeId);
    let wheel = null;
    let cand = this.ui.lastCandidates;
    if (prize && st.phase !== 'spinning' && st.phase !== 'reveal') {
      const D = this.view.getDiameter();
      const pool = buildPool(ev, prize);
      const s = ev.settings;
      const key = [prize.id, poolSignature(pool), D, s.wheelMode, s.sectorBy, s.sampledSectors, ev.participants.length, s.disambiguateSameName].join('|');
      if (!this.ui.wheelCache || this.ui.wheelCache.key !== key) {
        const wp = wheelPreview(ev, prize, D, randomUnit);
        wp.key = key;
        this.ui.wheelCache = wp;
      }
      wheel = this.ui.wheelCache;
      cand = wheel.candidates;
      this.ui.lastCandidates = cand;
    }
    return buildPublicView(ev, {
      rehearsal: this.store.rehearsal, wheel, candidates: cand, spin: this.ui.spinPlay, shortfall: this.ui.shortfall,
      banner: this.ui.banner, marquee: this.ui.marquee, fx: this.ui.fx, reduced: this.reduced,
    });
  }

  render() {
    const ev = this.ev;
    if (!ev || this.dead || !this.ready) return;
    const chrome = this.hostChrome;
    const el = this.el;
    el.classList.toggle('is-mirror', !chrome);
    el.classList.toggle('is-host', chrome);
    el.classList.toggle('is-extended', this.audience.connected);
    el.classList.toggle('is-rehearsal', this.store.rehearsal);
    el.classList.toggle('controls-on', !chrome && (this.ui.controlsShown || this.ui.controlsSticky || Date.now() < this.ui.flashUntil) && this.ui.overlay !== 'void');
    for (const th of ['midnight', 'festive', 'plain']) el.classList.toggle('theme-' + th, (ev.settings.stageTheme || 'midnight') === th);
    el.classList.toggle('is-reduced', this.reduced);
    el.classList.toggle('is-motion-full', ev.settings.motion === 'full');

    const pv = this.publicView(ev);
    this.lastPv = pv;
    this.view.render(pv, { hostChrome: chrome, select: this.selectDecor() });
    this.renderPrimary(ev, pv, chrome);
    if (chrome) renderSidebar(this, this.side, ev, pv);
    else this.side.replaceChildren();
    renderControlsBar(this, this.controls, this.cbParts, ev, chrome, barMainModel(this.mainAct, this.mainState()));
    this.renderVoid(ev);
    if (this.ui.modal) this.ui.modal.refresh();
    this.broadcast(pv);
  }

  selectDecor() {
    const cs = this.ui.cardSelect;
    if (!cs || cs.recall || !cs.active) return null;
    return { focus: cs.focus, picked: new Set(cs.picked), selectable: cs.selectable };
  }

  revokeVisible(ev) {
    const lc = ev.stage.lastConfirmed;
    if (!lc || !['idle', 'prize_done', 'all_done', 'prize_intro'].includes(ev.stage.phase)) return false;
    if (Date.now() - lc.at >= REVOKE_WINDOW_MS) return false;
    return ops.lastConfirmedRecords(ev).length > 0;
  }

  renderPrimary(ev, pv, chrome) {
    const st = ev.stage;
    const revealDone = ops.isRevealDone(ev);
    const ma = mainAction(ev, revealDone);
    this.mainAct = ma;
    fill(this.mainBtn, h('span', {}, ma.label), chrome && ma.key ? kbd(ma.key === 'Space' && ev.settings.clickerMode ? 'Space / PageDown' : ma.key) : null);
    this.mainBtn.setAttribute('aria-label', ma.label + (ma.key ? `（${ma.key}）` : ''));
    // 浮層 / 選卡 / 寫入中 / 600 ms 冷卻 → 停用樣式（點了也不會做事）；冷卻結束時重繪一次解除
    this.mainBtn.setAttribute('aria-disabled', mainPressAction(ma, this.mainState()) ? 'false' : 'true');
    this.mainBtn.classList.toggle('is-confirm', ma.kind === 'confirm');
    clearTimeout(this.t.cool); this.t.cool = null;
    const coolLeft = this.ui.phaseAt + COOLDOWN_MS - Date.now();
    if (coolLeft > 0) this.t.cool = setTimeout(() => { this.t.cool = null; this.render(); }, coolLeft + 10);

    const showVoid = chrome && st.phase === 'reveal';
    this.voidBtn.hidden = !showVoid;
    if (showVoid) fill(this.voidBtn, h('span', {}, t('btn.void')), kbd('V'));
    const rv = this.revokeVisible(ev);
    this.revokeBtn.hidden = !(chrome && rv);
    if (!this.revokeBtn.hidden) fill(this.revokeBtn, h('span', {}, t('btn.revoke')), kbd('V'));
    clearTimeout(this.t.revoke);
    if (rv) this.t.revoke = setTimeout(() => this.render(), REVOKE_WINDOW_MS - (Date.now() - st.lastConfirmed.at) + 50);
    this.disarmBtn.hidden = !(chrome && st.phase === 'armed');
    if (!this.disarmBtn.hidden) this.disarmBtn.textContent = t('btn.disarm');

    this.stripEl.hidden = !(chrome && this.store.rehearsal);

    let status = '';
    if (this.audience.connected) status = this.audience.ready ? t('stage.audienceReady') : t('stage.audienceConnected');
    this.statusEl.textContent = status; this.statusEl.hidden = !status;

    const hints = [];
    if (chrome) {
      if (st.phase === 'reveal' && !revealDone) {
        const rs = ops.currentRevealStyle(ev);
        hints.push(rs && rs.style === 'grid' ? t('stage.pageHint') : t('stage.flipHint'));
      } else if (st.phase === 'reveal') hints.push(t('stage.confirmHint'));
      if (st.phase === 'armed') hints.push(t('stage.armedHint'));
      if (this.ui.autoConfirmAt) hints.push(t('stage.autoConfirmIn', { n: Math.max(0, Math.ceil((this.ui.autoConfirmAt - Date.now()) / 1000)) }));
      if (this.ui.shortfall && st.phase === 'reveal') {
        const got = pv.reveal ? pv.reveal.cards.filter(c => c.fresh && c.state !== 'short').length : 0;
        hints.push(t('stage.shortfallHint', { got, miss: this.ui.shortfall }));
      }
      if (ma.kind === 'empty') {
        const prize = prizeById(ev, st.currentPrizeId);
        if (prize) hints.push(emptyPoolText(buildPoolDetailed(ev, prize).stats));
      }
      const wc = pv.wheel;
      if (wc && st.phase !== 'reveal') {
        if (wc.note === 'sampled-auto') hints.push(t('stage.sampledAuto'));
        else if (wc.note === 'equal-auto') hints.push(t('stage.equalAuto'));
        else if (wc.note === 'forced-reel') hints.push(t('stage.forcedReel'));
      }
    }
    fill(this.hintEl, ...hints.map(x => h('div', {}, x)));
    this.hintEl.hidden = !hints.length;
  }

  renderVoid(ev) {
    const d = this.ui.overlay === 'void' ? this.ui.voidData : null;
    if (!d) { renderVoidBar(this.voidBar, null); return; }
    const dup = sameNameSet(ev);
    const names = d.ids.map(id => { const r = ev.draws.find(x => x.id === id); return r ? displayName(ev, r.snapshot, dup) : ''; }).filter(Boolean);
    renderVoidBar(this.voidBar, d, {
      mirror: this.mirror, names, absentRule: ev.settings.rules.absentKeepsEligibility,
      onReason: (n) => this.act('void.reason', n),
      onSubmit: () => this.act('void.submit'),
      onCancel: () => this.closeOverlay(),
      onNoteInput: (v) => { d.note = v; },
    });
  }

  focusPrimary() {
    if (this.dead || !this.ready) return;
    if (this.ui.modal) { this.ui.modal.focusDefault(); return; }
    if (this.ui.overlay === 'void') { focusVoidBar(this.voidBar); return; }
    try { this.mainBtn.focus({ preventScroll: true }); } catch { /* */ }
  }

  broadcast(pv) {
    if (!this.chan) return;
    const s = JSON.stringify(pv);
    if (s === this.lastSent) return;
    this.lastSent = s;
    this.chan.post({ type: 'state', pv });
  }

  // ================= 訊息 / 提示 =================
  toast(msg, ms = 3500) {
    this.toastEl.textContent = msg; this.toastEl.hidden = false;
    clearTimeout(this.t.toast);
    this.t.toast = setTimeout(() => { this.toastEl.hidden = true; }, ms);
  }

  /** 全頁訊息（找不到活動、被另一分頁持有…）；回傳使用者選的 value */
  showMessage({ title, body, actions = [] }) {
    return new Promise((resolve) => {
      const btns = actions.map((a) => a.href
        ? h('a', { class: 'ws-btn ' + (a.primary ? 'ws-btn-primary' : ''), href: a.href }, a.label)
        : h('button', { type: 'button', class: 'ws-btn ' + (a.primary ? 'ws-btn-primary' : ''), onclick: () => { this.msgEl.hidden = true; resolve(a.value); } }, a.label));
      fill(this.msgEl, h('div', { class: 'ws-msg-box', role: 'dialog', 'aria-modal': 'true' },
        h('h1', { class: 'ws-msg-title' }, title), body ? h('p', { class: 'ws-msg-body' }, body) : null, h('div', { class: 'ws-msg-actions' }, btns)));
      this.msgEl.hidden = false;
      const f = this.msgEl.querySelector('.ws-btn-primary') || this.msgEl.querySelector('.ws-btn');
      if (f) setTimeout(() => f.focus(), 0);
    });
  }

  // ================= 投影模式：操作列與游標 =================
  /** e：pointer 事件（可為 null）；touch：觸控 / 觸控筆叫出（操作列停留較久，不處理游標） */
  onMouseMove(e, touch = false) {
    if (this.dead) return;
    if (!touch && e && e.clientX != null) {
      const pt = { x: e.clientX, y: e.clientY };
      this.lastPt = pt;
      if (Date.now() < (this.suppressShowUntil || 0)) return;     // 剛點完主鈕：游標維持隱藏、操作列不浮出
      if (this.moveAnchor) {
        if (Math.hypot(pt.x - this.moveAnchor.x, pt.y - this.moveAnchor.y) <= SHOW_MOVE_PX) return;
        this.moveAnchor = null;
      }
    }
    const ev = this.ev;
    const mirror = !this.hostChrome;
    if (!touch) {
      document.body.classList.remove('ws-cursor-hidden');
      clearTimeout(this.t.cursor);
      if (ev && mirror) this.t.cursor = setTimeout(() => { if (!this.hostChrome) document.body.classList.add('ws-cursor-hidden'); }, CURSOR_HIDE_MS);
    }
    if (ev && mirror) {
      this.hideMs = touch ? CONTROLS_HIDE_TOUCH_MS : CONTROLS_HIDE_MS;
      if (touch) { this.moveAnchor = null; this.suppressShowUntil = 0; }
      if (!this.ui.controlsShown) { this.ui.controlsShown = true; this.render(); }
      this.scheduleHideControls();
    }
  }

  scheduleHideControls() {
    clearTimeout(this.t.ctrlHide);
    this.t.ctrlHide = setTimeout(() => {
      if (this.overBar || this.ui.modal) { this.scheduleHideControls(); return; }
      if (this.ui.controlsShown) { this.ui.controlsShown = false; this.render(); }
    }, this.hideMs || CONTROLS_HIDE_MS);
  }

  /** 點完操作列主鈕（開轉、確認、下一獎…）：立刻收起並藏游標；H 鎖定時不收 */
  collapseControls() {
    if (this.ui.controlsSticky || this.hostChrome) return;
    clearTimeout(this.t.ctrlHide); this.t.ctrlHide = null;
    clearTimeout(this.t.cursor); this.t.cursor = null;
    this.ui.controlsShown = false;
    this.ui.flashUntil = 0;
    this.overBar = false;
    document.body.classList.add('ws-cursor-hidden');
    this.suppressShowUntil = Date.now() + SUPPRESS_SHOW_MS;
    this.moveAnchor = this.lastPt || null;
    this.render();
  }

  flashControls(ms) {
    this.ui.flashUntil = Date.now() + ms;
    clearTimeout(this.t.flash);
    this.t.flash = setTimeout(() => this.render(), ms + 20);
  }

  // ================= 觀眾視窗 =================
  setupChannel() {
    this.chan = createScreenChannel(this.eventId, 'host', (m) => this.onScreenMsg(m));
    this.t.aud = setInterval(() => {
      if (this.audience.connected && Date.now() - this.audience.lastSeen > SCREEN_STALE_MS) {
        this.audience = { connected: false, ready: false, lastSeen: 0 };
        this.render();
      }
    }, 1000);
  }

  onScreenMsg(m) {
    if (this.dead) return;
    const was = this.audience.connected;
    if (m.type === 'bye') { this.audience = { connected: false, ready: false, lastSeen: 0 }; this.render(); return; }
    this.audience.lastSeen = Date.now();
    if (m.type === 'hello' || m.type === 'ping') { this.audience.connected = true; this.chan.post({ type: 'pong' }); }
    if (m.type === 'ready') { this.audience.connected = true; this.audience.ready = true; }
    if (m.type === 'key' && this.ready && !this.readOnly) {
      const key = String(m.key || '');
      if (FORWARD_KEYS.has(key)) {
        this.onKey({ key, code: m.code || '', shiftKey: !!m.shift, ctrlKey: false, metaKey: false, altKey: false, repeat: false, inInput: false }, null);
      }
    }
    if (!was || m.type === 'hello' || m.type === 'ready') { this.lastSent = null; this.render(); }
  }

  openAudience() {
    const w = window.open(screenUrl(this.eventId), 'wheel-screen-' + this.eventId, 'popup=yes,width=1280,height=720');
    if (!w) { this.toast(t('stage.popupBlocked'), 6000); return; }
    this.toast(t('stage.screenHint'), 6000);
  }

  // ================= 輸入模型（D.5b） =================
  ctx() {
    const ev = this.ev; const st = ev.stage;
    return {
      phase: st.phase,
      overlay: this.ui.overlay,
      cardSelect: !!(this.ui.cardSelect && this.ui.cardSelect.active && !this.ui.cardSelect.recall),
      clickerMode: !!ev.settings.clickerMode,
      rehearsal: this.store.rehearsal,
      revealDone: ops.isRevealDone(ev),
      hasLastConfirmed: ops.lastConfirmedRecords(ev).length > 0,
      fullscreen: !!document.fullscreenElement,
      now: Date.now(),
      phaseAt: this.ui.phaseAt,
      hotkeys: ev.settings.hotkeys !== false,
    };
  }

  /** k：{ key, code, shiftKey, ctrlKey, metaKey, altKey, repeat, inInput }；e：原始 DOM 事件（轉送時為 null） */
  onKey(k, e) {
    if (this.dead || !this.ready || !this.ev) return;
    this.audio.unlock();
    if (this.readOnly || !this.msgEl.hidden) return;
    if (this.t.autoConfirm) { this.cancelAutoConfirm(); this.render(); }
    const r = resolveKey(this.ctx(), k);
    if (r.prevent && e) { e.preventDefault(); e.stopPropagation(); }
    if (r.action) this.act(r.action, r.arg);
  }

  /** 主動作的判斷依據（隱藏主按鈕與操作列主鈕共用） */
  mainState() {
    const ev = this.ev;
    const cs = this.ui.cardSelect;
    return {
      phase: ev ? ev.stage.phase : null,
      overlay: this.ui.overlay,
      busy: this.ui.busy,
      now: Date.now(),
      phaseAt: this.ui.phaseAt,
      rehearsal: !!(this.store && this.store.rehearsal),
      clickerMode: !!(ev && ev.settings.clickerMode),
      cardSelect: cs && cs.active && !cs.recall ? { picked: cs.picked.length } : null,
    };
  }

  canPress() { return !this.dead && this.ready && !!this.ev && !this.readOnly && this.msgEl.hidden; }

  cancelAutoConfirm() {
    if (!this.t.autoConfirm) return;
    clearTimeout(this.t.autoConfirm); this.t.autoConfirm = null; this.ui.autoConfirmAt = 0;
  }

  /** 點主按鈕：依主動作種類直接呼叫對應動作（不模擬按鍵；浮層、選卡、寫入中、600 ms 冷卻內一律不動作） */
  pressMain() {
    if (!this.canPress()) return;
    const a = mainPressAction(this.mainAct, this.mainState());
    if (!a) return;
    this.audio.unlock();
    this.cancelAutoConfirm();
    this.act(a);
  }

  /** 點操作列中段主鈕 */
  pressBarMain() {
    if (!this.canPress()) return;
    const m = barMainModel(this.mainAct, this.mainState());
    if (m.disabled || !m.action) return;
    this.audio.unlock();
    this.cancelAutoConfirm();
    this.act(m.action);
    if (m.collapse) this.collapseControls();
    else this.scheduleHideControls();             // 揭曉下一張 / 下一頁、選卡：不收，重新計時以便連點
    this.focusPrimary();
  }

  /** 操作列右段的次要鈕（作廢 / 取消選卡）：做完不收起，重新計時 */
  barSecondary(action) {
    if (!this.canPress()) return;
    this.act(action);
    this.scheduleHideControls();
  }

  /** 選卡模式中點卡片 = 移到那張並勾選 / 取消勾選 */
  cardClick(slot) {
    const cs = this.ui.cardSelect;
    if (!this.canPress() || !cs || !cs.active || cs.recall || this.ui.overlay || !cs.selectable.has(slot)) return;
    cs.focus = slot;
    this.cardAction('card.toggle');
  }

  act(action, arg) {
    const run = (p) => { if (p && p.catch) p.catch((err) => console.error(err)); };
    switch (action) {
      case 'toggleControls':
        this.ui.controlsSticky = !this.ui.controlsSticky; this.ui.controlsShown = this.ui.controlsSticky; this.render(); break;
      case 'fullscreen': this.toggleFullscreen(); break;
      case 'mute': run(this.toggleMute()); break;
      case 'help': this.openOverlay('help', OV.help(this)); break;
      case 'overlay.close': this.closeOverlay(); break;
      case 'overlay.move': if (this.ui.modal) this.ui.modal.onMove(arg); break;
      case 'overlay.enter': if (this.ui.modal) this.ui.modal.onEnter(); break;
      case 'overlay.digit': if (this.ui.modal) this.ui.modal.onDigit(arg); break;
      case 'card.move': case 'card.toggle': case 'card.void': case 'card.exit': this.cardAction(action, arg); break;
      case 'void.reason': if (this.ui.voidData) { this.ui.voidData.reason = VOID_REASONS[arg - 1] || 'absent'; this.render(); } break;
      case 'void.note': if (this.ui.voidData) { this.ui.voidData.noteOpen = true; this.render(); focusVoidBar(this.voidBar); } break;
      case 'void.submit': run(this.voidSubmit()); break;
      case 'spin': run(this.doSpin()); break;
      case 'advance': run(this.doAdvance()); break;
      case 'confirm': run(this.doConfirm()); break;
      case 'next': run(this.simple((ev) => ops.goNextPrize(ev))); break;
      case 'disarm': if (this.ev.stage.phase === 'armed') run(this.simple((ev) => ops.disarm(ev))); break;
      case 'void.select': if (this.ev.stage.phase === 'reveal') this.startCardSelect(); break;
      case 'void.last': this.voidLast(); break;
      case 'recent': this.openOverlay('recent', OV.recent(this)); break;
      case 'prizeMenu': run(this.openPrizeMenu(arg)); break;
      case 'bonus': if (['idle', 'prize_done', 'all_done'].includes(this.ev.stage.phase)) this.openOverlay('bonus', bonusSpec(this)); break;
      case 'quickList': if (['idle', 'prize_done'].includes(this.ev.stage.phase)) this.openOverlay('quick_list', quickListSpec(this)); break;
      case 'skip': run(this.finishSpinNow()); break;
      default: break;
    }
  }

  async simple(fn) {
    if (this.ui.busy) return;
    this.ui.busy = true;
    try { await this.commit(fn); } catch { /* 已顯示 */ } finally { this.ui.busy = false; this.render(); }
  }

  toggleFullscreen() {
    try {
      if (document.fullscreenElement) document.exitFullscreen();
      else document.documentElement.requestFullscreen({ navigationUI: 'hide' }).catch(() => {});
    } catch { /* */ }
  }

  async toggleMute() {
    const on = !(this.ev.settings.sound && this.ev.settings.sound.enabled);
    try { await this.commit((ev) => { ev.settings.sound = { ...(ev.settings.sound || {}), enabled: on }; }, { debounce: true }); } catch { return; }
    if (on) this.audio.unlock(); else this.audio.drumStop();
    this.toast(on ? t('stage.soundOn') : t('stage.soundOff'));
  }

  // ================= 浮層 =================
  openOverlay(name, spec) {
    if (this.ui.modal) { this.ui.modal.close(); this.ui.modal = null; }
    if (this.ui.overlay === 'void') this.ui.voidData = null;
    this.ui.overlay = name;
    this.ui.modal = openModal(this.layer, spec, () => this.closeOverlay());
    this.render();
  }

  closeOverlay() {
    const name = this.ui.overlay;
    if (!name) return;
    if (name === 'void') {
      this.ui.voidData = null;
      const cs = this.ui.cardSelect;
      if (cs && !cs.recall && this.ev.stage.phase === 'reveal') cs.active = true;   // 回到選卡
      else this.ui.cardSelect = null;
    } else {
      if (this.ui.modal) this.ui.modal.close();
      if (name === 'batch_recall') this.ui.cardSelect = null;
    }
    this.ui.overlay = null; this.ui.modal = null;
    const ev = this.ev;
    if (ev && ev.stage.phase === 'prize_intro' && !this.t.intro) this.finishIntro();
    this.render();
    this.focusPrimary();
  }

  async openPrizeMenu(arg) {
    if (arg === 'disarm' && this.ev.stage.phase === 'armed') await this.simple((ev) => ops.disarm(ev));
    if (!['idle', 'prize_done', 'all_done'].includes(this.ev.stage.phase)) return;
    this.openOverlay('prize_menu', OV.prizeMenu(this));
  }

  async switchPrize(id) {
    const ev = this.ev; const st = ev.stage;
    if (this.ui.overlay) this.closeOverlay();
    if (st.phase === 'armed') await this.simple((e) => ops.disarm(e));
    if (!['idle', 'prize_done', 'all_done'].includes(this.ev.stage.phase)) return;
    if (st.currentPrizeId === id && st.phase === 'idle') return;
    await this.simple((e) => ops.startPrizeIntro(e, id));
  }

  // ================= 開轉 =================
  async doSpin() {
    const ev = this.ev;
    if (this.ui.busy || !ev) return;
    const st = ev.stage;
    if (st.phase === 'idle') {
      const ia = ops.idleAction(ev);
      if (ia.kind === 'none') return;
      if (ia.kind === 'empty') { this.toast(emptyPoolText(buildPoolDetailed(ev, ia.prize).stats), 6000); return; }
      if (ia.kind === 'arm') { await this.simple((e) => ops.arm(e)); return; }
    } else if (st.phase !== 'armed') return;
    this.ui.busy = true;
    const D = this.view.getDiameter();
    let res;
    try {
      res = await this.store.commit((e) => ops.beginSpin(e, { diameter: D, rehearsal: this.store.rehearsal, reducedMotion: this.reduced, now: Date.now() }), { target: 'active' });
    } catch (err) {
      console.error(err);
      this.ui.busy = false;
      if (err && /no-quota|empty-pool/.test(err.message)) this.toast(emptyPoolText(buildPoolDetailed(ev, prizeById(ev, ev.stage.currentPrizeId)).stats), 6000);
      else this.showSaveError();                // D.5：寫入失敗 → 不開始動畫
      this.sync();
      return;
    }
    this.ui.busy = false;
    this.ui.shortfall = res.shortfall || 0;
    const names = [];
    const pool0 = res.pools && res.pools[0] ? res.pools[0] : [];
    for (let i = 0; i < Math.min(60, pool0.length); i++) {
      const p = participantById(this.ev, pool0[Math.floor(randomUnit() * pool0.length)].id);
      if (p) names.push(p.name);
    }
    this.startSpinPlayback(this.ev.stage.spin, res.style.style, { shuffleNames: names, batchId: res.batchId });
    this.sync();
  }

  startSpinPlayback(spinState, style, o = {}) {
    const ev = this.ev;
    const dup = sameNameSet(ev);
    const nameOf = (pid) => { const p = participantById(ev, pid); return p ? displayName(ev, p, dup) : ''; };
    let spins = ((spinState && spinState.chain) || []).map((s) => (s.skip
      ? { skip: true, winner: nameOf(s.participantId) }
      : { sectors: s.sectors, targetAngleDeg: s.targetAngleDeg, easingPow: s.easingPow, durationMs: s.durationMs, mode: s.mode, fontPx: s.fontPx, sectorBy: s.sectorBy, note: s.note, winner: nameOf(s.participantId) }));
    if (o.recover) {
      const last = [...spins].reverse().find(s => !s.skip);
      spins = last ? [{ ...last, durationMs: 1500 }] : [];
    }
    const play = {
      id: (o.batchId || ev.stage.currentBatchId || 'b') + ':' + Date.now(),
      startedAt: Date.now(), style, spins, recover: !!o.recover, reduced: this.reduced,
      diameter: this.view.getDiameter(), shuffleNames: o.shuffleNames || [],
    };
    this.ui.spinPlay = play;
    const tl = spinTimeline(play);
    clearTimeout(this.t.spinEnd);
    this.t.spinEnd = setTimeout(() => this.finishSpinNow(), tl.total + 30);
  }

  /** C.7-4：轉動中重新整理 → 1.5 s 短動畫到位 → 揭曉 */
  recoverSpin() {
    const ev = this.ev;
    const rs = ops.currentRevealStyle(ev);
    if (!rs) { this.finishSpinNow(); return; }
    this.startSpinPlayback(ev.stage.spin, rs.style, { recover: true });
    this.render();
  }

  async finishSpinNow() {
    clearTimeout(this.t.spinEnd); this.t.spinEnd = null;
    const ev = this.ev;
    if (!ev || ev.stage.phase !== 'spinning') return;
    this.ui.spinPlay = null;
    try { await this.commit((e) => ops.finishSpin(e)); } catch { /* 已顯示 */ }
  }

  // ================= 揭曉 =================
  async doAdvance() {
    const ev = this.ev;
    if (this.ui.busy || ev.stage.phase !== 'reveal' || ops.isRevealDone(ev)) return;
    await this.simple((e) => ops.advanceReveal(e));
    const rs = ops.currentRevealStyle(this.ev);
    if (rs && rs.style === 'wall') {
      this.audio.flip();
      if (ops.isRevealDone(this.ev)) { clearInterval(this.t.flip); this.t.flip = null; this.celebrate(); this.render(); this.focusPrimary(); }
    }
    this.maybeAutoConfirm();
  }

  autoFlip() {
    const ev = this.ev;
    if (!ev || ev.stage.phase !== 'reveal' || ops.isRevealDone(ev)) { clearInterval(this.t.flip); this.t.flip = null; return; }
    if (this.ui.overlay || this.ui.cardSelect) return;
    this.doAdvance();
  }

  maybeAutoConfirm() {
    const ev = this.ev;
    const s = ev.settings.autoConfirmSeconds;
    if (s == null || ev.stage.phase !== 'reveal' || !ops.isRevealDone(ev) || this.t.autoConfirm) return;
    const ms = s > 0 ? s * 1000 : 1500;
    this.ui.autoConfirmAt = Date.now() + ms;
    this.t.autoConfirm = setTimeout(() => {
      this.t.autoConfirm = null; this.ui.autoConfirmAt = 0;
      const e = this.ev;
      if (e && e.stage.phase === 'reveal' && ops.isRevealDone(e) && !this.ui.overlay && !this.ui.cardSelect) this.doConfirm();
    }, ms);
    this.render();
  }

  async doConfirm() {
    const ev = this.ev;
    if (this.ui.busy || ev.stage.phase !== 'reveal' || !ops.isRevealDone(ev)) return;
    clearInterval(this.t.flip); this.t.flip = null;
    const dup = sameNameSet(ev);
    const names = revealCards(ev, ev.stage.currentBatchId).cards
      .filter(c => c.fresh && c.record.status === 'pending').map(c => displayName(ev, c.record.snapshot, dup));
    this.ui.marquee = names.length ? { names: names.slice(-5), until: Date.now() + 6000 } : null;
    this.ui.cardSelect = null;
    await this.simple((e) => ops.confirmReveal(e, Date.now()));
    this.ui.shortfall = 0;
    clearTimeout(this.t.marq);
    this.t.marq = setTimeout(() => this.render(), 6100);
    this.render();
  }

  // ================= 作廢與補抽 =================
  startCardSelect() {
    const ev = this.ev; const st = ev.stage;
    const pv = this.lastPv;
    if (!pv || !pv.reveal) return;
    const { cards } = revealCards(ev, st.currentBatchId);
    const bySlot = new Map(cards.map(c => [c.slot, c]));
    const order = this.view.cardOrder || [];
    const shown = new Set(pv.reveal.cards.filter(c => c.state === 'shown').map(c => c.slot));
    const selectable = new Set(order.filter((s) => { const c = bySlot.get(s); return c && c.fresh && c.record.status === 'pending' && shown.has(s); }));
    if (!selectable.size) { this.toast(t('stage.noSelectable')); return; }
    const ids = new Map([...selectable].map(s => [s, bySlot.get(s).record.id]));
    if (selectable.size === 1) { this.openVoid([...ids.values()], false); return; }
    this.ui.cardSelect = { active: true, recall: false, order, selectable, ids, focus: order.find(s => selectable.has(s)), picked: [] };
    this.render();
  }

  cardAction(action, arg) {
    const cs = this.ui.cardSelect;
    if (!cs) return;
    if (action === 'card.move') cs.focus = moveCardFocus(cs.order, cs.selectable, cs.focus, arg, cs.cols || this.view.cardCols || cs.order.length);
    else if (action === 'card.toggle') {
      const i = cs.picked.indexOf(cs.focus);
      if (i >= 0) cs.picked.splice(i, 1); else cs.picked.push(cs.focus);
    } else if (action === 'card.void') {
      const slots = cs.picked.length ? [...cs.picked].sort((a, b) => a - b) : [cs.focus];
      this.openVoid(slots.map(s => cs.ids.get(s)).filter(Boolean), !!cs.recall);
      return;
    } else if (action === 'card.exit') { this.ui.cardSelect = null; }
    this.render();
  }

  voidLast() {
    const ev = this.ev;
    const recs = ops.lastConfirmedRecords(ev);
    if (!recs.length) return;
    if (ev.stage.phase === 'prize_intro') { clearTimeout(this.t.intro); this.t.intro = null; }
    if (recs.length === 1) { this.openVoid([recs[0].id], true); return; }
    this.ui.cardSelect = {
      active: false, recall: true, recs, order: recs.map(r => r.slot), selectable: new Set(recs.map(r => r.slot)),
      ids: new Map(recs.map(r => [r.slot, r.id])), focus: recs[0].slot, picked: [], cols: Math.min(recs.length, 6),
    };
    this.openOverlay('batch_recall', OV.batchRecall(this));
  }

  /** 開作廢條；「未到場者保留後續資格」尚未決定時先問一次（D.7、G-4） */
  openVoid(ids, confirmed) {
    const ev = this.ev;
    if (!ids.length) return;
    if (ev.settings.rules.absentKeepsEligibility == null) {
      const keepCs = this.ui.cardSelect;
      this.openOverlay('ask_absent', OV.askAbsent(this, async (v) => {
        try {
          await this.commit((e) => {
            e.settings.rules.absentKeepsEligibility = v;
            addLog(e, 'rules.set', v ? '未到場者保留後續資格' : '未到場者不保留後續資格', { absentKeepsEligibility: v }, true);
          });
        } catch { return; }
        this.ui.cardSelect = keepCs;
        this.openVoid(ids, confirmed);
      }));
      return;
    }
    if (this.ui.modal) { this.ui.modal.close(); this.ui.modal = null; }
    if (this.ui.cardSelect) this.ui.cardSelect.active = false;
    this.ui.overlay = 'void';
    this.ui.voidData = { ids, confirmed, reason: 'absent', note: '', noteOpen: false };
    this.ui.controlsShown = false;
    this.render();
    this.focusPrimary();
  }

  async voidSubmit() {
    const d = this.ui.voidData;
    if (!d || this.ui.busy) return;
    this.ui.overlay = null; this.ui.voidData = null; this.ui.cardSelect = null;
    const note = (d.note || '').trim() || undefined;
    this.ui.busy = true;
    try {
      if (d.confirmed) await this.commit((ev) => ops.voidConfirmed(ev, d.ids, d.reason, note));
      else await this.commit((ev) => ops.voidInReveal(ev, d.ids, d.reason, note));
    } catch { /* 已顯示 */ } finally { this.ui.busy = false; }
    const ev = this.ev;
    if (ev.stage.phase === 'prize_intro' && !this.t.intro) this.finishIntro();
    this.render();
    this.focusPrimary();
  }

  // ================= 加碼 =================
  async submitBonus(kind, a) {
    const ev = this.ev;
    const label = kind === 'quota' ? `${(prizeById(ev, a.prizeId) || {}).name || ''} +${a.delta}` : a.fields.name;
    if (this.ui.modal) { this.ui.modal.close(); this.ui.modal = null; }
    this.ui.overlay = null;
    this.ui.banner = { text: t('stage.bonusBanner', { label }), until: Date.now() + 2000 };
    this.audio.fanfare(true);
    try { await this.commit((e) => ops.applyBonus(e, kind, a)); } catch { this.ui.banner = null; }
    setTimeout(() => this.render(), 2050);
    this.render();
    this.focusPrimary();
  }

  // ================= 名單快速操作 =================
  async rosterOp(kind, a) {
    let p = null;
    try {
      p = await this.commit((ev) => {
        if (kind === 'exclude') { ops.stageExclude(ev, a.id, 'other'); return participantById(ev, a.id); }
        if (kind === 'restore') { ops.stageRestore(ev, a.id); return participantById(ev, a.id); }
        return ops.stageAdd(ev, a.name, a.group || undefined);
      });
    } catch { return null; }
    if (p) this.toast(t(kind === 'exclude' ? 'stage.excluded' : kind === 'restore' ? 'stage.restored' : 'stage.added', { name: p.name }));
    return p;
  }

  // ================= 彩排 =================
  async toggleRehearsal() {
    if (this.store.rehearsal) { this.requestRehearsalOff('live'); return; }
    const ev = this.ev;
    if (!canToggleRehearsal(ev.stage.phase, ev.draws.some(d => d.status === 'pending'))) { this.toast(t('stage.cannotToggle')); return; }
    try {
      await this.store.flush();
      await this.store.startRehearsal();
    } catch (err) { console.error(err); this.showSaveError(); return; }
    this.toast(t('stage.rehearsalStarted'));
    await this.enter();
  }

  /** target: 'live'（切正式）| 'exit'（退出舞台） */
  requestRehearsalOff(target) {
    const sb = this.store.sandbox;
    if (!sb) return;
    if (sandboxHasPending(sb)) { this.toast(t('stage.pendingFirst')); return; }
    const ev = this.ev;
    if (!canToggleRehearsal(ev.stage.phase, false)) { this.toast(t('stage.cannotToggle')); return; }
    const n = sandboxDrawCount(sb);
    if (n === 0) {
      if (target === 'exit') { this.discardRehearsal('exit'); return; }
      this.openOverlay('confirm_live', OV.confirmLive(this));
      return;
    }
    this.openOverlay('rehearsal_exit', OV.rehearsalExit(this, target, n));
  }

  async discardRehearsal(target) {
    if (this.ui.modal) { this.ui.modal.close(); this.ui.modal = null; }
    this.ui.overlay = null;
    try { await this.store.discardRehearsal(); } catch (err) { console.error(err); this.showSaveError(); return; }
    if (target === 'exit') { this.exitNow(); return; }
    this.toast(t('stage.liveStarted'));
    await this.enter();
  }

  async promote(fromIndex) {
    try { await this.store.promoteRehearsal(fromIndex); } catch (err) {
      console.error(err);
      this.toast(err && err.message === 'official-changed' ? t('stage.promoteFailed') : t('stage.pendingFirst'), 6000);
      return;
    }
    if (this.ui.modal) { this.ui.modal.close(); this.ui.modal = null; }
    this.ui.overlay = null;
    try { this.tabs.changed(this.eventId); } catch { /* */ }
    this.toast(t('stage.liveStarted'));
    await this.enter();
  }

  // ================= 退出 =================
  requestExit() {
    const ev = this.ev;
    if (ev.draws.some(d => d.status === 'pending')) { this.toast(t('stage.pendingFirst')); return; }
    if (this.store.rehearsal) { this.requestRehearsalOff('exit'); return; }
    this.openOverlay('exit_stage', OV.exitStage(this));
  }

  exitNow() {
    this.allowUnload = true;
    const off = this.store.official;
    const url = appUrl(off && off.draws.length ? `#/e/${this.eventId}/records` : `#/e/${this.eventId}/prizes`);
    try { this.tabs.changed(this.eventId); } catch { /* */ }
    if (this.opts.onExit) { this.opts.onExit(url); return; }
    location.href = url;
  }
}
