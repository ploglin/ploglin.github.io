// 「以投影尺寸預覽轉盤」（C.3、D.10、G-3）：選解析度與幕寬，依實際投影像素繪製轉盤後縮小顯示，並標示可讀距離。
// 只做靜態預覽（不轉動）；舞台實際繪製在 ui/stage/wheel-canvas.js。
import { h, dialog } from './dom.js';
import { ctx } from './app-ctx.js';
import { T, WHEEL_MODE_LABEL } from './i18n.js';
import { PALETTE, STAGE_INK, sortedPrizes } from '../core/model.js';
import { buildPool } from '../core/pool.js';
import { decideWheel, wheelDiameter, buildSectors } from '../core/sectors.js';

const RES = [[1920, 1080], [1280, 720], [1024, 768], [1366, 768], [2560, 1440], [3840, 2160]];
const LENS_PX = 35;

/** 可讀距離（字高 × 200 舒適、× 300 極限；D.3 表） */
export function readability(fontPx, resW, screenM) {
  const mmPerPx = (screenM * 1000) / resW;
  const hMm = fontPx * mmPerPx;
  return { cm: +(hMm / 10).toFixed(1), comfortM: +(hMm * 0.2).toFixed(1), limitM: +(hMm * 0.3).toFixed(1) };
}

export function openWheelPreview() {
  const e = ctx.store.official;
  const st = { res: 0, screen: 3, projection: true, pool: 'all' };
  const canvas = h('canvas', { class: 'wh-preview-canvas', role: 'img' });
  const info = h('div', { class: 'wh-preview-info', 'aria-live': 'polite' });
  const resSel = h('select', { class: 'input wh-select', 'aria-label': T.pvRes }, ...RES.map(([w, hh], i) => h('option', { value: i }, `${w}×${hh}`)));
  const scr = h('input', { type: 'number', class: 'input input-num', min: 1, max: 20, step: 0.5, value: st.screen, 'aria-label': T.pvScreen });
  const proj = h('input', { type: 'checkbox', checked: true });
  const poolSel = h('select', { class: 'input wh-select', 'aria-label': T.pvPool }, h('option', { value: 'all' }, T.pvAll), ...sortedPrizes(e).map(p => h('option', { value: p.id }, p.name)));
  resSel.addEventListener('change', () => { st.res = +resSel.value; draw(); });
  scr.addEventListener('input', () => { st.screen = Math.max(1, Math.min(20, +scr.value || 3)); draw(); });
  proj.addEventListener('change', () => { st.projection = proj.checked; draw(); });
  poolSel.addEventListener('change', () => { st.pool = poolSel.value; draw(); });

  function pool() {
    if (st.pool === 'all') return e.participants.filter(p => !p.excluded).map(p => ({ id: p.id, weight: p.weight })).sort((a, b) => (a.id < b.id ? -1 : 1));
    const pz = e.prizes.find(p => p.id === st.pool);
    return pz ? buildPool(e, pz) : [];
  }

  function draw() {
    const [W, H] = RES[st.res];
    const D = wheelDiameter({ width: W, height: H, projection: st.projection });
    const pl = pool();
    const d = decideWheel(pl, e.settings, D, e.participants.length);
    const lines = [T.pvDiameter(D), T.pvMode(WHEEL_MODE_LABEL[d.mode])];
    if (d.note === 'equal-auto') lines.push(T.pvEqualAuto);
    if (d.note === 'sampled-auto') lines.push(T.pvSampledAuto);
    if (d.note === 'forced-reel') lines.push(T.pvForcedReel);
    const c2 = canvas.getContext('2d');
    if (pl.length < 2) { canvas.width = canvas.height = 10; c2.clearRect(0, 0, 10, 10); info.replaceChildren(...[T.pvTooFew].map(t => h('p', null, t))); canvas.setAttribute('aria-label', T.pvTooFew); return; }
    if (d.mode === 'reel') { canvas.width = canvas.height = 10; c2.clearRect(0, 0, 10, 10); lines.push(T.pvReel); info.replaceChildren(...lines.map(t => h('p', null, t))); canvas.setAttribute('aria-label', T.pvReel); return; }
    let seed = 7; const rnd = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
    const { sectors } = buildSectors(pl, pl[0].id, e, d, rnd);
    const r = readability(d.fontPx, W, st.screen);
    const lens = readability(LENS_PX, W, st.screen);
    const key = T.pvRead(r.cm, r.comfortM, r.limitM);
    lines.push(T.pvFont(d.fontPx), key, T.pvLens(lens.comfortM), T.pvNote);
    info.replaceChildren(...lines.map((t) => h('p', { class: t === key ? 'wh-strong' : t === T.pvNote ? 'wh-hint' : '' }, t)));
    canvas.setAttribute('aria-label', `轉盤預覽：${sectors.length} 格，${WHEEL_MODE_LABEL[d.mode]}，扇區姓名 ${d.fontPx} px`);
    render(c2, sectors, D, d);
  }

  function render(g, sectors, D, d) {
    const pad = 24;
    const size = D + pad * 2;
    canvas.width = size; canvas.height = size;
    g.fillStyle = STAGE_INK; g.fillRect(0, 0, size, size);
    const cx = size / 2, cy = size / 2, R = D / 2;
    const band = d.mode === 'compact' ? 10 : 0;
    const rad = (deg) => (deg - 90) * Math.PI / 180;
    for (const s of sectors) {
      g.beginPath(); g.moveTo(cx, cy); g.arc(cx, cy, R - band, rad(s.startDeg), rad(s.endDeg)); g.closePath();
      g.fillStyle = PALETTE[s.colorIndex % 8]; g.fill();
    }
    // 分隔線
    g.strokeStyle = STAGE_INK; g.lineWidth = 2;
    for (const s of sectors) { g.beginPath(); g.moveTo(cx, cy); const a = rad(s.startDeg); g.lineTo(cx + Math.cos(a) * (R - band), cy + Math.sin(a) * (R - band)); g.stroke(); }
    // 緊湊：外圈群組色帶與群組名
    if (band) {
      let i = 0;
      while (i < sectors.length) {
        let j = i; while (j + 1 < sectors.length && sectors[j + 1].groupLabel === sectors[i].groupLabel) j++;
        const a0 = rad(sectors[i].startDeg), a1 = rad(sectors[j].endDeg);
        g.beginPath(); g.arc(cx, cy, R - band / 2, a0, a1); g.lineWidth = band; g.strokeStyle = PALETTE[sectors[i].colorIndex % 8]; g.stroke();
        if (sectors[i].groupLabel) {
          const mid = (a0 + a1) / 2;
          g.save(); g.translate(cx + Math.cos(mid) * (R + 12), cy + Math.sin(mid) * (R + 12));
          g.fillStyle = '#ffffff'; g.font = `700 20px "Noto Sans TC", system-ui, sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
          g.fillText(sectors[i].groupLabel, 0, 0); g.restore();
        }
        i = j + 1;
      }
    }
    // 姓名：沿半徑、從中心往外讀，靠外圈對齊
    g.fillStyle = STAGE_INK; g.textBaseline = 'middle'; g.textAlign = 'right';
    g.font = `700 ${d.fontPx}px "Noto Sans TC", system-ui, sans-serif`;
    const outer = R - band - 10, inner = R * 0.28, avail = outer - inner;
    for (const s of sectors) {
      const mid = rad((s.startDeg + s.endDeg) / 2);
      let label = s.label || '';
      if (d.sectorBy === 'equal' && s.weight > 1 && d.mode !== 'sampled') label += ` ×${s.weight}`;
      while (label.length > 1 && g.measureText(label).width > avail) label = label.slice(0, -2) + '…';
      g.save(); g.translate(cx, cy); g.rotate(mid); g.fillText(label, outer, 0); g.restore();
    }
    // 中心鈕與指針（12 點鐘）
    g.beginPath(); g.arc(cx, cy, Math.max(18, R * 0.08), 0, Math.PI * 2); g.fillStyle = '#ffffff'; g.fill();
    g.beginPath(); g.moveTo(cx, pad + 26); g.lineTo(cx - 14, pad - 6); g.lineTo(cx + 14, pad - 6); g.closePath(); g.fillStyle = '#ffffff'; g.fill();
  }

  const body = h('div', { class: 'wh-preview' },
    h('div', { class: 'wh-preview-ctl' },
      h('label', { class: 'field' }, h('span', null, T.pvRes), resSel),
      h('label', { class: 'field' }, h('span', null, `${T.pvScreen}（${T.pvMeters}）`), scr),
      h('label', { class: 'field' }, h('span', null, T.pvPool), poolSel),
      h('label', { class: 'wh-check-inline' }, proj, h('span', null, T.pvProjection))),
    h('div', { class: 'wh-preview-stage' }, canvas),
    info);
  draw();
  return dialog({ title: T.pvTitle, className: 'wh-dlg-preview', body, actions: [{ label: T.close, value: null, kind: 'primary' }] });
}
