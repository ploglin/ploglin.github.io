// 轉盤繪製（C.3）：靜態轉盤畫到離屏 canvas 一次，每幀 rotate + drawImage + 指針、中心鈕、lens。
// 角度慣例與 core/sectors.js 相同：扇區角度自 12 點鐘順時針量；rotation 為順時針旋轉量；指針在正上方。
// reel（滾輪）沿用同一套 rotation：指針下的扇區 = 滾輪中央那一列。
import { PALETTE, STAGE_INK } from '../../core/model.js';
import { sectorAtPointer } from '../../core/sectors.js';

const RAD = Math.PI / 180;
const FONT = '"Noto Sans TC", "PingFang TC", "Microsoft JhengHei", system-ui, sans-serif';
const LIGHT = '#f3f5fb';
const EXPAND_MS = 600;

function truncate(ctx, text, maxW) {
  if (ctx.measureText(text).width <= maxW) return text;
  let s = text;
  while (s.length > 1 && ctx.measureText(s + '…').width > maxW) s = s.slice(0, -1);
  return s + '…';
}

export class WheelCanvas {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.off = null;
    this.data = null;
    this.D = 0;
    this.dpr = 1;
    this.rotation = 0;
    this.expandAt = 0;
    this.lastOpts = {};
  }

  setSize(D) {
    D = Math.max(120, Math.floor(D));
    const dpr = Math.min(2, (typeof window !== 'undefined' && window.devicePixelRatio) || 1);
    if (D === this.D && dpr === this.dpr) return false;
    this.D = D; this.dpr = dpr;
    this.canvas.width = Math.round(D * dpr);
    this.canvas.height = Math.round(D * dpr);
    this.canvas.style.width = D + 'px';
    this.canvas.style.height = D + 'px';
    this.rebuild();
    this.draw();
    return true;
  }

  /** data: { key, sectors, mode, fontPx, sectorBy, diameter } — key 相同時不重建 */
  setData(data) {
    if (!data || !data.sectors || !data.sectors.length) { this.data = null; this.off = null; this.draw(); return true; }
    if (this.data && this.data.key === data.key) return false;
    this.data = data;
    this.rebuild();
    return true;
  }

  expand() { this.expandAt = performance.now(); }
  expanding() { return performance.now() - this.expandAt < EXPAND_MS; }

  scale() { return this.data && this.data.diameter ? this.D / this.data.diameter : 1; }

  geometry() {
    const D = this.D;
    const R = D / 2 - 2;
    const groups = this.data && this.data.mode === 'compact' && this.data.sectors.some(s => s.groupLabel);
    const label = groups ? Math.max(24, Math.round(26 * this.scale())) : 0;
    const band = groups ? Math.max(8, Math.min(10, Math.round(D * 0.011))) : 0;
    return { R, Rs: R - label - band, band, label, groups };
  }

  rebuild() {
    this.off = null;
    if (!this.data || !this.D || this.data.mode === 'reel') return;
    const D = this.D, dpr = this.dpr;
    const off = document.createElement('canvas');
    off.width = Math.round(D * dpr); off.height = Math.round(D * dpr);
    const c = off.getContext('2d');
    c.scale(dpr, dpr);
    c.translate(D / 2, D / 2);
    const { Rs, band, label, groups } = this.geometry();
    const secs = this.data.sectors;
    // 扇區
    for (const s of secs) {
      c.beginPath(); c.moveTo(0, 0);
      c.arc(0, 0, Rs, (s.startDeg - 90) * RAD, (s.endDeg - 90) * RAD);
      c.closePath();
      c.fillStyle = PALETTE[s.colorIndex % PALETTE.length] || PALETTE[0];
      c.fill();
    }
    // 分隔線 2 px 深色
    if (secs.length > 1) {
      c.strokeStyle = STAGE_INK; c.lineWidth = 2;
      c.beginPath();
      for (const s of secs) { const a = (s.startDeg - 90) * RAD; c.moveTo(0, 0); c.lineTo(Math.cos(a) * Rs, Math.sin(a) * Rs); }
      c.stroke();
    }
    c.beginPath(); c.arc(0, 0, Rs, 0, Math.PI * 2); c.lineWidth = 3; c.strokeStyle = STAGE_INK; c.stroke();
    // 文字：沿半徑、由內往外讀、靠外緣對齊、超長以 … 截斷
    const fs = Math.max(10, Math.round((this.data.fontPx || 14) * this.scale()));
    c.font = `600 ${fs}px ${FONT}`;
    c.fillStyle = STAGE_INK; c.textAlign = 'right'; c.textBaseline = 'middle';
    const maxW = Rs * 0.6;
    const equalMark = this.data.sectorBy === 'equal';
    for (const s of secs) {
      const mid = (s.startDeg + s.endDeg) / 2;
      c.save();
      c.rotate((mid - 90) * RAD);
      const txt = equalMark && s.weight > 1 ? `${s.label} ×${s.weight}` : s.label;
      c.fillText(truncate(c, txt, maxW), Rs - 10, 0);
      c.restore();
    }
    // 緊湊模式：外圈群組色帶 + 群組名
    if (groups) {
      const runs = [];
      for (const s of secs) {
        const last = runs[runs.length - 1];
        if (last && last.label === (s.groupLabel || '')) last.end = s.endDeg;
        else runs.push({ label: s.groupLabel || '', start: s.startDeg, end: s.endDeg, color: s.colorIndex });
      }
      if (runs.length > 1 && runs[0].label === runs[runs.length - 1].label) {
        const first = runs.shift(); runs[runs.length - 1].end = first.end + 360;
      }
      for (const r of runs) {
        c.beginPath();
        c.arc(0, 0, Rs + band, (r.start - 90) * RAD, (r.end - 90) * RAD);
        c.arc(0, 0, Rs, (r.end - 90) * RAD, (r.start - 90) * RAD, true);
        c.closePath();
        c.fillStyle = PALETTE[r.color % PALETTE.length]; c.fill();
        c.strokeStyle = STAGE_INK; c.lineWidth = 2; c.stroke();
      }
      const gfs = Math.max(20, Math.round(20 * this.scale()));
      c.font = `700 ${gfs}px ${FONT}`; c.fillStyle = LIGHT; c.textAlign = 'center'; c.textBaseline = 'middle';
      const rr = Rs + band + label / 2;
      for (const r of runs) {
        if (!r.label) continue;
        const arcLen = (r.end - r.start) * RAD * rr;
        if (c.measureText(r.label).width > arcLen - 6) continue;
        const mid = ((r.start + r.end) / 2 - 90) * RAD;
        c.save();
        c.translate(Math.cos(mid) * rr, Math.sin(mid) * rr);
        c.rotate(mid + Math.PI / 2);
        c.fillText(r.label, 0, 0);
        c.restore();
      }
    }
    this.off = off;
  }

  /** 指針下的扇區索引 */
  pointerIndex(rotation = this.rotation) {
    return this.data ? sectorAtPointer(this.data.sectors, rotation) : -1;
  }

  /** o: { lens, pulse (0..1) } */
  draw(rotation = this.rotation, o = this.lastOpts) {
    this.rotation = rotation; this.lastOpts = o || {};
    const c = this.ctx, D = this.D;
    if (!D) return;
    c.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    c.clearRect(0, 0, D, D);
    if (!this.data) return;
    if (this.data.mode === 'reel') { this.drawReel(rotation, o); return; }
    if (!this.off) return;
    const ex = Math.min(1, (performance.now() - this.expandAt) / EXPAND_MS);
    c.save();
    c.translate(D / 2, D / 2);
    if (ex < 1) {
      c.beginPath(); c.moveTo(0, 0);
      c.arc(0, 0, D / 2, -Math.PI / 2, -Math.PI / 2 + ex * Math.PI * 2);
      c.closePath(); c.clip();
      c.globalAlpha = 0.35 + 0.65 * ex;
    }
    c.rotate(rotation * RAD);
    c.drawImage(this.off, -D / 2, -D / 2, D, D);
    c.restore();
    const g = this.geometry();
    // 中心鈕
    const hub = Math.max(18, D * 0.065);
    c.beginPath(); c.arc(D / 2, D / 2, hub, 0, Math.PI * 2);
    c.fillStyle = STAGE_INK; c.fill();
    c.lineWidth = Math.max(3, D * 0.006); c.strokeStyle = LIGHT; c.stroke();
    c.beginPath(); c.arc(D / 2, D / 2, hub * 0.35, 0, Math.PI * 2); c.fillStyle = LIGHT; c.fill();
    if (o && o.lens) this.drawLens(rotation, g);
    this.drawPointer(g, o && o.pulse);
  }

  drawPointer(g, pulse) {
    const c = this.ctx, D = this.D;
    const k = pulse != null ? 1 + 0.14 * Math.sin(Math.min(1, pulse) * Math.PI * 4) * (1 - Math.min(1, pulse)) : 1;
    const w = Math.max(22, D * 0.04) * k;
    const top = 2;
    const tip = D / 2 - g.Rs + Math.max(16, D * 0.03) * k;
    c.save();
    c.beginPath();
    c.moveTo(D / 2 - w / 2, top); c.lineTo(D / 2 + w / 2, top); c.lineTo(D / 2, tip); c.closePath();
    c.fillStyle = LIGHT; c.fill();
    c.lineWidth = 3; c.strokeStyle = STAGE_INK; c.stroke();
    c.restore();
  }

  /** lens：在指針下方、文字所在處放大 2.5 倍 */
  drawLens(rotation, g) {
    if (!this.off) return;
    const c = this.ctx, D = this.D;
    const fs = Math.max(10, (this.data.fontPx || 14) * this.scale());
    const cx = D / 2, cy = D / 2;
    const fr = Math.max(g.Rs * 0.45, g.Rs - 10 - fs * 1.6);
    const fx = cx, fy = cy - fr;
    const L = Math.min(Math.max(fs * 2.5 * 1.8, 70), Math.max(70, D * 0.16));
    c.save();
    c.beginPath(); c.arc(fx, fy, L, 0, Math.PI * 2); c.clip();
    c.fillStyle = STAGE_INK; c.fillRect(fx - L, fy - L, L * 2, L * 2);
    c.translate(fx, fy); c.scale(2.5, 2.5); c.translate(-fx, -fy);
    c.translate(cx, cy); c.rotate(rotation * RAD);
    c.drawImage(this.off, -D / 2, -D / 2, D, D);
    c.restore();
    c.beginPath(); c.arc(fx, fy, L, 0, Math.PI * 2);
    c.lineWidth = Math.max(4, D * 0.006); c.strokeStyle = LIGHT; c.stroke();
  }

  drawReel(rotation) {
    const c = this.ctx, D = this.D;
    const secs = this.data.sectors;
    const N = secs.length;
    const unit = 360 / N;
    const a = ((360 - (rotation % 360)) % 360 + 360) % 360;
    const pos = a / unit - 0.5;                 // 中央那一列的小數索引
    const rowH = D / 5;
    const fs = Math.min(Math.round(rowH * 0.42), 64);
    const pad = D * 0.06;
    c.save();
    c.beginPath(); c.rect(pad, 0, D - pad * 2, D); c.clip();
    c.fillStyle = '#141b33'; c.fillRect(pad, 0, D - pad * 2, D);
    c.font = `700 ${fs}px ${FONT}`; c.textAlign = 'center'; c.textBaseline = 'middle';
    const base = Math.floor(pos);
    for (let k = base - 3; k <= base + 4; k++) {
      const idx = ((k % N) + N) % N;
      const s = secs[idx];
      const y = D / 2 + (k - pos) * rowH;
      c.fillStyle = PALETTE[s.colorIndex % PALETTE.length];
      c.fillRect(pad + 6, y - rowH / 2 + 3, D - pad * 2 - 12, rowH - 6);
      c.fillStyle = STAGE_INK;
      c.fillText(truncate(c, s.label, D - pad * 2 - 40), D / 2, y);
    }
    // 上下淡出
    const gt = c.createLinearGradient(0, 0, 0, D);
    gt.addColorStop(0, 'rgba(11,16,32,.92)'); gt.addColorStop(0.3, 'rgba(11,16,32,0)');
    gt.addColorStop(0.7, 'rgba(11,16,32,0)'); gt.addColorStop(1, 'rgba(11,16,32,.92)');
    c.fillStyle = gt; c.fillRect(pad, 0, D - pad * 2, D);
    c.restore();
    // 中央框
    c.lineWidth = Math.max(4, D * 0.007); c.strokeStyle = LIGHT;
    c.strokeRect(pad - 2, D / 2 - rowH / 2, D - pad * 2 + 4, rowH);
    c.fillStyle = LIGHT;
    c.beginPath(); c.moveTo(pad - 4, D / 2 - 14); c.lineTo(pad + 14, D / 2); c.lineTo(pad - 4, D / 2 + 14); c.closePath(); c.fill();
    c.beginPath(); c.moveTo(D - pad + 4, D / 2 - 14); c.lineTo(D - pad - 14, D / 2); c.lineTo(D - pad + 4, D / 2 + 14); c.closePath(); c.fill();
  }
}
