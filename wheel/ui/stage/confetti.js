// 彩帶（E.1）：自寫 canvas 粒子，2 s。減少動態時由呼叫端略過。
import { PALETTE } from '../../core/model.js';

export class Confetti {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.parts = [];
    this.raf = 0;
    this.until = 0;
  }

  resize() {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = this.canvas.clientWidth, hgt = this.canvas.clientHeight;
    this.canvas.width = Math.round(w * dpr); this.canvas.height = Math.round(hgt * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  fire(ms = 2000) {
    this.resize();
    const w = this.canvas.clientWidth;
    for (let i = 0; i < 160; i++) {
      this.parts.push({
        x: w * (0.15 + Math.random() * 0.7), y: -20 - Math.random() * 200,
        vx: (Math.random() - 0.5) * 3, vy: 2 + Math.random() * 4,
        r: 5 + Math.random() * 7, a: Math.random() * Math.PI, va: (Math.random() - 0.5) * 0.3,
        c: PALETTE[i % PALETTE.length],
      });
    }
    this.until = performance.now() + ms;
    if (!this.raf) this.raf = requestAnimationFrame(() => this.step());
  }

  step() {
    const c = this.ctx;
    const w = this.canvas.clientWidth, hgt = this.canvas.clientHeight;
    c.clearRect(0, 0, w, hgt);
    const ending = performance.now() > this.until;
    this.parts = this.parts.filter(p => p.y < hgt + 30);
    for (const p of this.parts) {
      p.x += p.vx; p.y += p.vy; p.vy += 0.05; p.a += p.va;
      c.save(); c.translate(p.x, p.y); c.rotate(p.a);
      c.fillStyle = p.c; c.fillRect(-p.r / 2, -p.r / 4, p.r, p.r / 2);
      c.restore();
    }
    if (ending) this.parts = this.parts.filter(p => p.y > -10);
    if (this.parts.length) this.raf = requestAnimationFrame(() => this.step());
    else { this.raf = 0; c.clearRect(0, 0, w, hgt); }
  }

  stop() { cancelAnimationFrame(this.raf); this.raf = 0; this.parts = []; }
}
