// 舞台畫面（主持端與觀眾視窗共用）：只依「觀眾可見的畫面模型」(logic.buildPublicView) 繪製。
// 主持人介面（側欄、主按鈕、操作列、作廢條、浮層）由 page-stage.js 另外疊上。
import { h } from '../dom.js';
import { WheelCanvas } from './wheel-canvas.js';
import { Confetti } from './confetti.js';
import { t, spinTimeline, segmentAt, recoverRotation, cardColumns, handNamePx } from './logic.js';
import { rotationAt, sectorAtPointer, wheelDiameter, HAND_INFO_H } from '../../core/sectors.js';
import { fill } from './util.js';

function fitName(el, maxPx, minPx = 24) {
  let size = maxPx;
  el.style.fontSize = size + 'px';
  let guard = 60;
  while (guard-- > 0 && size > minPx && el.scrollWidth > el.clientWidth + 1) {
    size = Math.max(minPx, size - Math.max(2, Math.round(size * 0.06)));
    el.style.fontSize = size + 'px';
  }
}

export class StageView {
  /** role: 'host' | 'screen' */
  constructor(container, { role = 'host' } = {}) {
    this.role = role;
    this.onTick = null;
    this.pv = null;
    this.decor = null;
    this.play = null;
    this.raf = 0;
    this.D = 0;
    this.keys = {};
    this.lastFx = null;
    this.lastAnnounce = '';
    this.compact = false;        // 掌上模式（只由主持端設定；觀眾視窗永遠 false）
    this.fit = null;

    this.titleEl = h('div', { class: 'ws-title' });
    this.wmEl = h('div', { class: 'ws-watermark', 'aria-hidden': 'true' }, t('stage.watermark'));
    this.top = h('div', { class: 'ws-top' }, this.titleEl, this.wmEl);

    this.prizeEl = h('div', { class: 'ws-prize' });
    this.subEl = h('div', { class: 'ws-sub' });
    this.info = h('div', { class: 'ws-info' }, this.prizeEl, this.subEl);

    this.canvas = h('canvas', { class: 'ws-wheel', role: 'img', 'aria-label': '' });
    this.wheel = new WheelCanvas(this.canvas);
    this.noteEl = h('div', { class: 'ws-wheelnote' });
    this.sampledEl = h('div', { class: 'ws-sampled' });
    this.wheelBox = h('div', { class: 'ws-wheelbox' }, this.canvas);
    this.calloutEl = h('div', { class: 'ws-callout', 'aria-hidden': 'true' });
    this.shuffleEl = h('div', { class: 'ws-shuffle', 'aria-hidden': 'true' });
    this.upcomingEl = h('div', { class: 'ws-upcoming' });
    this.doneEl = h('div', { class: 'ws-done' });
    this.revealEl = h('div', { class: 'ws-reveal' });
    this.area = h('div', { class: 'ws-area' },
      this.wheelBox, this.upcomingEl, this.doneEl, this.revealEl, this.shuffleEl, this.calloutEl, this.noteEl, this.sampledEl);
    this.main = h('div', { class: 'ws-main' }, this.info, this.area);

    this.introEl = h('div', { class: 'ws-intro', 'aria-hidden': 'true' });
    this.armedEl = h('div', { class: 'ws-armed', 'aria-hidden': 'true' });
    this.bannerEl = h('div', { class: 'ws-banner', 'aria-hidden': 'true' });
    this.marqueeEl = h('div', { class: 'ws-marquee', 'aria-hidden': 'true' });
    this.cornerEl = h('div', { class: 'ws-corner' });
    this.confettiCanvas = h('canvas', { class: 'ws-confetti', 'aria-hidden': 'true' });
    this.confetti = new Confetti(this.confettiCanvas);
    this.liveEl = h('div', { class: 'ws-sr', 'aria-live': 'assertive', role: 'status' });

    this.el = h('div', { class: 'ws-col' }, this.top, this.main,
      this.introEl, this.armedEl, this.bannerEl, this.marqueeEl, this.cornerEl, this.confettiCanvas, this.liveEl);
    container.appendChild(this.el);

    this.ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(() => this.layout()) : null;
    if (this.ro) this.ro.observe(this.main);
    else window.addEventListener('resize', this._onResize = () => this.layout());
  }

  destroy() {
    cancelAnimationFrame(this.raf);
    if (this.ro) this.ro.disconnect();
    if (this._onResize) window.removeEventListener('resize', this._onResize);
    this.confetti.stop();
    clearTimeout(this._bannerT); clearTimeout(this._marqT);
  }

  /** 掌上模式切換：資訊區較矮、揭曉卡改直式；清掉 setOnce 快取讓下一次 render 重畫，下一幀重算直徑 */
  setCompact(on) {
    on = !!on;
    if (this.compact === on) return;
    this.compact = on;
    this.keys = {};
    requestAnimationFrame(() => this.layout());
  }

  /** 依主區尺寸算轉盤直徑（C.3）：主按鈕區不在 main 內，所以這裡一律以投影模式公式計算（掌上模式資訊區改用 HAND_INFO_H） */
  layout() {
    const w = this.main.clientWidth, hgt = this.main.clientHeight;
    if (!w || !hgt) return;
    const D = wheelDiameter({ width: w, height: hgt, projection: true, sidebar: false, infoH: this.compact ? HAND_INFO_H : undefined });
    if (D !== this.D) {
      this.D = D;
      this.wheel.setSize(D);
      this.upcomingEl.style.setProperty('--d', D + 'px');
      if (this.onResize) this.onResize(D);
    }
    if (this.pv && this.pv.reveal) this.fitCards();
  }

  getDiameter() { if (!this.D) this.layout(); return this.D || 892; }

  // ---------- 繪製 ----------
  render(pv, decor = null) {
    this.pv = pv; this.decor = decor;
    if (!pv) return;
    if (!this.D) this.layout();
    const root = this.el;
    root.dataset.phase = pv.phase;
    root.classList.toggle('is-rehearsal', !!pv.rehearsal);
    this.titleEl.textContent = pv.title || '';
    const hostChrome = !!(decor && decor.hostChrome);

    // 資訊區
    const prizeText = pv.prize ? (pv.prize.description ? `${pv.prize.name} · ${pv.prize.description}` : pv.prize.name) : '';
    this.prizeEl.textContent = prizeText;
    let sub = '';
    if (pv.prize) {
      if (pv.phase === 'reveal' && pv.reveal) sub = [pv.reveal.seqLabel, t('stage.remaining', { n: pv.remaining })].filter(Boolean).join(' · ');
      else if (pv.phase === 'prize_done' || pv.phase === 'all_done') sub = '';
      else sub = `${t('stage.remaining', { n: pv.remaining })} · ${t('stage.candidates', { n: pv.candidates })}`;
    }
    this.subEl.textContent = sub;

    // 主區：轉盤 / 待抽卡 / 抽完 / 揭曉
    const spinning = pv.phase === 'spinning' && pv.spin;
    const pre = pv.phase === 'idle' || pv.phase === 'armed' || pv.phase === 'prize_intro';
    const wheelStyle = pv.upcoming ? pv.upcoming.wheel : true;
    const showWheel = (pre && wheelStyle && pv.wheel && !pv.wheel.empty) || (spinning && pv.spin.spins && pv.spin.spins.length > 0);
    this.wheelBox.hidden = !showWheel;
    this.upcomingEl.hidden = !(pre && pv.upcoming && !pv.upcoming.wheel);
    this.doneEl.hidden = !(pv.phase === 'prize_done' || pv.phase === 'all_done' || (pre && !pv.upcoming && pv.phase !== 'prize_intro'));
    this.revealEl.hidden = !(pv.phase === 'reveal' && pv.reveal);

    if (spinning) { if (!this.play || this.play.id !== pv.spin.id) this.startPlay(pv.spin); }
    else this.stopPlay();

    if (!this.play) {
      this.shuffleEl.hidden = true; this.calloutEl.hidden = true;
      if (showWheel) {
        const wd = pv.wheel;
        const changed = this.wheel.setData({ key: wd.key, sectors: wd.sectors, mode: wd.mode, fontPx: wd.fontPx, sectorBy: wd.sectorBy, diameter: wd.diameter });
        if (changed && (pv.phase === 'prize_intro' || pv.phase === 'idle') && !pv.reduced) { this.wheel.expand(); this.animateExpand(); }
        this.wheel.draw(this.wheel.rotation % 360, {});
        this.canvas.setAttribute('aria-label', t('stage.wheelLabel', { n: pv.candidates }));
      }
    }
    // 轉盤下方常駐說明（C.3、G-2）
    const wd = spinning && pv.spin.spins[0] && !pv.spin.spins[0].skip ? pv.spin.spins[0] : pv.wheel;
    const note = showWheel && wd ? (wd.sectorBy === 'equal' && wd.note === 'equal-auto' ? t('stage.equalNote') : '') : '';
    this.noteEl.textContent = note; this.noteEl.hidden = !note;
    let sampled = '';
    if (showWheel && pv.wheel && !spinning) {
      if (pv.wheel.mode === 'sampled') sampled = t('stage.sampledNote', { n: pv.wheel.candidates, k: pv.wheel.shown });
      else if (pv.wheel.mode === 'reel') sampled = t('stage.reelNote', { n: pv.wheel.candidates });
    } else if (spinning && pv.spin.spins[0] && pv.spin.spins[0].mode === 'sampled') {
      sampled = t('stage.sampledNote', { n: pv.candidates, k: pv.spin.spins[0].sectors.length });
    }
    this.sampledEl.textContent = sampled; this.sampledEl.hidden = !sampled;

    if (!this.upcomingEl.hidden) this.renderUpcoming(pv);
    if (!this.doneEl.hidden) this.renderDone(pv);
    if (!this.revealEl.hidden) this.renderReveal(pv.reveal, decor);
    else this.keys.reveal = '';

    // 介紹、預備、加碼橫幅
    this.introEl.hidden = pv.phase !== 'prize_intro' || !pv.prize;
    if (!this.introEl.hidden) this.setOnce('intro', pv.prize.id + '|' + pv.remaining, () => {
      fill(this.introEl, 
        h('div', { class: 'ws-intro-name' }, pv.prize.name),
        pv.prize.description ? h('div', { class: 'ws-intro-desc' }, pv.prize.description) : null,
        h('div', { class: 'ws-intro-sub' }, t('stage.remaining', { n: pv.remaining })));
    });
    this.armedEl.hidden = pv.phase !== 'armed' || !pv.prize;
    if (!this.armedEl.hidden) this.armedEl.textContent = t('stage.armed', { name: pv.prize.name });

    const now = Date.now();
    clearTimeout(this._bannerT);
    if (pv.banner && now < pv.banner.until) {
      this.bannerEl.textContent = pv.banner.text; this.bannerEl.hidden = false;
      this._bannerT = setTimeout(() => { this.bannerEl.hidden = true; }, pv.banner.until - now);
    } else this.bannerEl.hidden = true;

    clearTimeout(this._marqT);
    if (!hostChrome && pv.marquee && now < pv.marquee.until && pv.phase !== 'reveal' && pv.phase !== 'spinning') {
      this.setOnce('marq', pv.marquee.until, () => {
        fill(this.marqueeEl, h('span', { class: 'ws-marq-t' }, t('stage.marqueeTitle')),
          ...pv.marquee.names.map(n => h('span', { class: 'ws-marq-n' }, n)));
      });
      this.marqueeEl.hidden = false;
      this._marqT = setTimeout(() => { this.marqueeEl.hidden = true; }, pv.marquee.until - now);
    } else this.marqueeEl.hidden = true;

    // 觀眾視窗角落小字（D.11）
    if (this.role === 'screen' && pv.prize && pv.phase !== 'all_done') {
      this.cornerEl.textContent = t('stage.cornerInfo', { n: pv.candidates, seq: pv.reveal ? pv.reveal.seqLabel : pv.nextSeq });
      this.cornerEl.hidden = false;
    } else this.cornerEl.hidden = true;

    // 彩帶
    if (pv.fx && pv.fx.type === 'confetti' && pv.fx.id !== this.lastFx) {
      this.lastFx = pv.fx.id;
      if (now - pv.fx.at < 1500 && !pv.reduced) this.confetti.fire(2000);
    }
  }

  setOnce(name, key, fn) { if (this.keys[name] !== key) { this.keys[name] = key; fn(); } }

  animateExpand() {
    const step = () => {
      if (this.play) return;
      this.wheel.draw(this.wheel.rotation, {});
      if (this.wheel.expanding()) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }

  renderUpcoming(pv) {
    const u = pv.upcoming;
    this.setOnce('up', `${u.style}|${u.n}|${u.redraw}`, () => {
      const kids = [];
      if (u.style === 'wall') {
        const cols = cardColumns('wall', u.n, this.compact);
        const grid = h('div', { class: 'ws-up-cards', style: { '--cols': cols } });
        for (let i = 0; i < u.n; i++) grid.appendChild(h('div', { class: 'ws-up-card' }, t('stage.hidden')));
        kids.push(grid);
        kids.push(h('div', { class: 'ws-up-text' }, u.redraw ? t('stage.upcomingRedraw', { n: u.n }) : t('stage.upcomingN', { n: u.n })));
      } else {
        kids.push(h('div', { class: 'ws-up-big' }, u.redraw ? t('stage.upcomingRedraw', { n: u.n }) : t('stage.gridAll', { n: u.n })));
      }
      fill(this.upcomingEl, ...kids);
    });
  }

  renderDone(pv) {
    const key = `${pv.phase}|${pv.prize && pv.prize.id}|${pv.nextPrizeName}`;
    this.setOnce('done', key, () => {
      if (pv.phase === 'all_done') fill(this.doneEl, h('div', { class: 'ws-done-main' }, t('stage.allDone')));
      else if (pv.prize) fill(this.doneEl, 
        h('div', { class: 'ws-done-main' }, t('stage.prizeDone', { name: pv.prize.name })),
        pv.nextPrizeName ? h('div', { class: 'ws-done-sub' }, t('stage.nextPrize', { name: pv.nextPrizeName })) : null);
      else fill(this.doneEl, h('div', { class: 'ws-done-main' }, t('stage.noPrize')));
    });
  }

  /** 揭曉卡片；decor = { select: {focus, picked:Set, selectable:Set}, hostChrome }。選卡模式中可選的卡片可點擊（交給 onCardClick） */
  renderReveal(r, decor) {
    const sel = decor && decor.select;
    const key = JSON.stringify([r, sel ? [sel.focus, [...sel.picked], sel.selectable ? [...sel.selectable] : null] : null, decor && decor.hostChrome, this.compact]);
    if (this.keys.reveal === key) return;
    this.keys.reveal = key;
    let cards = r.cards;
    if (r.style === 'grid') cards = cards.slice(r.page * r.perPage, (r.page + 1) * r.perPage);
    const cols = cardColumns(r.style, cards.length, this.compact);
    this.cardCols = cols;
    this.cardOrder = cards.map(c => c.slot);
    // 掌上模式另用手機字級（只影響主持端這台手機；公開畫面模型的 namePx 不變）
    this.fit = this.compact ? handNamePx(r.style, cards.length) : { max: r.namePx, min: Math.min(r.style === 'grid' ? 24 : 28, r.namePx) };
    const box = h('div', { class: `ws-cards ws-${r.style}${this.compact && cols === 1 ? ' ws-col1' : ''}`, style: { '--cols': cols, '--name-px': this.fit.max + 'px' } });
    for (const c of cards) {
      const cls = ['ws-card', 'is-' + c.state];
      if (sel && sel.focus === c.slot) cls.push('is-focus');
      if (sel && sel.picked.has(c.slot)) cls.push('is-picked');
      const pickable = !!(sel && sel.selectable && sel.selectable.has(c.slot));
      if (pickable) cls.push('is-selectable');
      const card = h('div', { class: cls.join(' '), dataset: { slot: c.slot } });
      if (pickable) card.addEventListener('click', () => { if (this.onCardClick) this.onCardClick(c.slot); });
      if (c.state === 'shown') {
        card.append(h('div', { class: 'ws-name' }, c.name));
        if (c.group) card.append(h('div', { class: 'ws-group' }, c.group));
        if (c.code) card.append(h('div', { class: 'ws-code' }, c.code));
      } else if (c.state === 'hidden') card.append(h('div', { class: 'ws-name ws-q' }, t('stage.hidden')));
      else if (c.state === 'voided') card.append(h('div', { class: 'ws-vlabel' }, c.label));
      else card.append(h('div', { class: 'ws-vlabel' }, t('stage.short')));
      box.appendChild(card);
    }
    const kids = [box];
    if (r.style === 'grid' && r.pages > 1) kids.push(h('div', { class: 'ws-pageno' }, t('stage.pageOf', { p: r.page + 1, n: r.pages })));
    fill(this.revealEl, ...kids);
    requestAnimationFrame(() => this.fitCards());
    if (this.compact) this.scrollReveal(r);
    // aria-live：揭曉的名字
    const shown = r.cards.filter(c => c.state === 'shown' && c.fresh).map(c => c.name);
    const ann = shown.length && this.pv && this.pv.prize ? t('stage.announce', { prize: this.pv.prize.name, names: shown.join('、') }) : '';
    if (ann && ann !== this.lastAnnounce) { this.lastAnnounce = ann; this.liveEl.textContent = ann; }
  }

  /** 掌上模式揭曉區可捲動：翻頁回到頂端；新翻開的卡片捲進畫面（選卡時不動，免得勾選中跳走） */
  scrollReveal(r) {
    const pageKey = r.seqLabel + '|' + r.style + ':' + r.page;     // 換批次或翻頁都從頂端開始
    const shownN = r.cards.filter(c => c.state === 'shown').length;
    if (this._scrollPage !== pageKey) { this._scrollPage = pageKey; this._shownN = shownN; this.revealEl.scrollTop = 0; return; }
    if (shownN <= (this._shownN || 0) || r.style === 'grid') { this._shownN = shownN; return; }
    this._shownN = shownN;
    requestAnimationFrame(() => {
      const shown = this.revealEl.querySelectorAll('.ws-card.is-shown');
      const last = shown[shown.length - 1];
      if (last && last.scrollIntoView) last.scrollIntoView({ block: 'nearest' });
    });
  }

  fitCards() {
    const r = this.pv && this.pv.reveal; if (!r) return;
    const f = this.fit || { max: r.namePx, min: Math.min(r.style === 'grid' ? 24 : 28, r.namePx) };
    for (const n of this.revealEl.querySelectorAll('.ws-name')) fitName(n, f.max, f.min);
  }

  // ---------- 轉動播放 ----------
  startPlay(spin) {
    this.stopPlay();
    this.play = { id: spin.id, spin, tl: spinTimeline(spin), idx: -1, lastSector: -1, segKey: '' };
    this.canvas.setAttribute('aria-label', t('stage.wheelSpinning'));
    const frame = () => {
      if (!this.play) return;
      const more = this.frame();
      if (more) this.raf = requestAnimationFrame(frame);
    };
    this.raf = requestAnimationFrame(frame);
  }

  stopPlay() {
    if (!this.play) return;
    cancelAnimationFrame(this.raf); this.raf = 0;
    this.play = null;
    this.shuffleEl.hidden = true; this.calloutEl.hidden = true;
  }

  frame() {
    const p = this.play;
    const sp = p.spin;
    const elapsed = Date.now() - sp.startedAt;
    const seg = segmentAt(p.tl, elapsed);
    if (!seg) return false;
    if (seg.kind === 'shuffle') {
      this.shuffleEl.hidden = false; this.calloutEl.hidden = true;
      const names = sp.shuffleNames && sp.shuffleNames.length ? sp.shuffleNames : [t('stage.hidden')];
      const every = sp.reduced ? 400 : 70;
      const name = names[Math.floor(Math.max(0, elapsed) / every) % names.length];
      if (this.shuffleEl.textContent !== name) this.shuffleEl.textContent = name;
      this.shuffleEl.classList.toggle('is-reduced', !!sp.reduced);
      return !seg.done;
    }
    this.shuffleEl.hidden = true;
    const s = sp.spins[seg.index];
    if (!s) return false;
    if (p.idx !== seg.index) {
      p.idx = seg.index; p.lastSector = -1;
      if (!s.skip) this.wheel.setData({ key: `${sp.id}:${seg.index}`, sectors: s.sectors, mode: s.mode, fontPx: s.fontPx, sectorBy: s.sectorBy, diameter: sp.diameter });
    }
    if (s.skip) {
      this.calloutEl.textContent = s.winner || ''; this.calloutEl.hidden = !s.winner;
      return !seg.done;
    }
    const T = s.targetAngleDeg;
    if (seg.kind === 'spin') {
      this.calloutEl.hidden = true;
      const tt = Math.max(0, elapsed - seg.start) / 1000;
      const dur = s.durationMs / 1000;
      const rot = sp.recover ? recoverRotation(tt, T - 360, T, dur) : rotationAt(tt, T, dur, s.easingPow);
      const si = sectorAtPointer(s.sectors, rot);
      if (si !== p.lastSector) {
        if (p.lastSector >= 0 && this.onTick && !sp.reduced) this.onTick();
        p.lastSector = si;
      }
      const avg = 360 / Math.max(1, s.sectors.length);
      const lens = s.mode !== 'reel' && (T - rot) / avg <= 3;
      this.wheel.draw(rot, { lens });
    } else {
      const k = Math.min(1, Math.max(0, elapsed - seg.start) / Math.max(1, seg.end - seg.start));
      this.wheel.draw(T, { lens: s.mode !== 'reel', pulse: k });
      if (sp.spins.length > 1 || !seg.done) { this.calloutEl.textContent = s.winner || ''; this.calloutEl.hidden = !s.winner; }
    }
    return !seg.done;
  }
}
