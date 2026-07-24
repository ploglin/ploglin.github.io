/* 由分享碼產生：地圖 SVG + 攻略頁要用的表格 HTML */
const fs = require('fs');
const E = require('./engine.js');
const { items, SPOTS, gridRows, gridCols, TYPE_KEYS } = E;

const code = fs.readFileSync('code.txt', 'utf8').trim();
const str = Buffer.from(code.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('binary');
const cells = [];
for (const p of str.split(',')) {
    const [t, e, n] = p.split('.').map(Number);
    for (let k = 0; k < n; k++) cells.push({ type: TYPE_KEYS[t] || 'empty', elevation: e || 1 });
}
const g = [];
for (let r = 0; r < gridRows; r++) g.push(cells.slice(r * gridCols, (r + 1) * gridCols));

/* ---------- SVG ---------- */
const S = 22, PAD = 20;
const W = gridCols * S + PAD * 2, H = gridRows * S + PAD * 2;
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const out = [];
out.push(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" font-family="'Noto Sans TC',sans-serif" role="img" aria-label="口袋學院物語2 健康鎮完美佈局地圖">`);
out.push(`<title>口袋學院物語2 健康鎮完美佈局（29 個人氣景點全成立）</title>`);
out.push(`<rect width="${W}" height="${H}" fill="#f8fafc"/>`);

for (let r = 0; r < gridRows; r++) for (let c = 0; c < gridCols; c++) {
    const cell = g[r][c];
    const it = items[cell.type] || items.empty;
    const x = PAD + c * S, y = PAD + r * S;
    const slope = cell.type === 'empty' && E.isSlopeIn(g, r, c);
    let fill = it.color;
    if (cell.type === 'empty' && cell.elevation > 1) fill = slope ? '#bef264' : '#a3a3a3';
    out.push(`<rect x="${x}" y="${y}" width="${S}" height="${S}" fill="${fill}" stroke="#ffffff" stroke-width="0.6"/>`);
    // 高地：加一圈深色內框，讓高低差一眼看得出來
    if (cell.elevation > 1) out.push(`<rect x="${x + 1}" y="${y + 1}" width="${S - 2}" height="${S - 2}" fill="none" stroke="#475569" stroke-width="1.1" stroke-dasharray="3 2"/>`);
    if (slope) out.push(`<path d="M${x} ${y + S}L${x + S} ${y}" stroke="#65a30d" stroke-width="1.6"/>`);
    const sh = (it.short || '').trim();
    if (sh && cell.type !== 'empty' && cell.type !== 'grass') {
        out.push(`<text x="${x + S / 2}" y="${y + S / 2 + 4.5}" font-size="12.5" font-weight="700" text-anchor="middle" fill="${it.textCol === 'white' ? '#ffffff' : '#1f2937'}">${esc(sh)}</text>`);
    }
}
// 座標軸（遊戲座標：X = r+2 由上而下、Y = 25-c 由左而右）
for (let r = 0; r < gridRows; r += 2) out.push(`<text x="${PAD - 5}" y="${PAD + r * S + S / 2 + 4}" font-size="10" text-anchor="end" fill="#94a3b8">${r + 2}</text>`);
for (let c = 0; c < gridCols; c += 2) out.push(`<text x="${PAD + c * S + S / 2}" y="${PAD - 6}" font-size="10" text-anchor="middle" fill="#94a3b8">${25 - c}</text>`);
out.push('</svg>');
fs.writeFileSync('health-perfect.svg', out.join('\n'));
console.log('SVG 大小：', Math.round(out.join('\n').length / 1024) + 'KB');

/* ---------- 景點位置表 ---------- */
const where = new Map();
for (let wr = 0; wr <= gridRows - 4; wr++) for (let wc = 0; wc <= gridCols - 4; wc++) {
    const ts = new Set();
    for (let dr = 0; dr < 4; dr++) for (let dc = 0; dc < 4; dc++) {
        const t = g[wr + dr][wc + dc].type;
        if (t !== 'empty') ts.add(t); else if (E.isSlopeIn(g, wr + dr, wc + dc)) ts.add('slope');
    }
    for (const s of SPOTS) if (!where.has(s.id) && s.req.every(gr => (Array.isArray(gr) ? gr : [gr]).some(t => ts.has(t)))) where.set(s.id, [wr, wc]);
}
const rows = SPOTS.map(s => {
    const [wr, wc] = where.get(s.id);
    const req = s.req.map(gr => (Array.isArray(gr) ? gr : [gr]).map(t => items[t].name).join('／')).join('＋');
    return `                        <tr><td>${s.name}</td><td>X${wr + 2} / Y${25 - wc}</td><td>${req}</td><td>${s.bonus || ''}</td></tr>`;
}).join('\n');
fs.writeFileSync('spots-table.html', rows);

/* ---------- 設施統計表 ---------- */
const cnt = {};
g.flat().forEach(c => { if (c.type !== 'empty') cnt[c.type] = (cnt[c.type] || 0) + 1; });
const CAT = { fac: '生活與設施', spec: '教室與專科', sports: '運動與社團', farm: '動植物農牧', env: '環境地形' };
const byCat = {};
Object.entries(cnt).forEach(([t, n]) => {
    const it = items[t]; const sz = (it.w || 1) * (it.h || 1);
    const cat = CAT[it.type] || '其他';
    (byCat[cat] = byCat[cat] || []).push(it.name + (n / sz > 1 ? ' ×' + (n / sz) : ''));
});
const facRows = ['生活與設施', '教室與專科', '運動與社團', '動植物農牧', '環境地形']
    .filter(k => byCat[k])
    .map(k => `                        <tr><td>${k}</td><td>${byCat[k].sort().join('、')}</td></tr>`).join('\n');
fs.writeFileSync('fac-table.html', facRows);

const bCount = Object.entries(cnt).filter(([t]) => E.isBuildingType(t))
    .reduce((n, [t, v]) => n + v / ((items[t].w || 1) * (items[t].h || 1)), 0);
console.log('建築棟數：', Math.round(bCount), '｜走廊格數：', cnt.wood_path || 0, '｜分享碼長度：', code.length);
