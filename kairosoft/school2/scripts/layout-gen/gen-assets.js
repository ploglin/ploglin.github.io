/* 由分享碼產生：地圖 SVG + 攻略頁要用的表格 HTML
   用法：node gen-assets.js          → 健康鎮（code.txt → health-perfect.svg）
         node gen-assets.js east     → 冬郵小鎮（code-east.txt → east-perfect.svg）
   產出的 SVG 直接寫到 ../../layouts/，表格 HTML 留在本目錄供貼上。 */
const fs = require('fs');
const path = require('path');
const townKey = (process.argv[2] || 'health').replace(/^--?/, '');
require('./towns.js').select(townKey);
const E = require('./engine.js');
const { items, SPOTS, gridRows, gridCols, town } = E;

const CODE_FILE = { health: 'code.txt', east: 'code-east.txt' }[townKey];
const OUT_DIR = path.join(__dirname, '..', '..', 'layouts');

const code = fs.readFileSync(path.join(__dirname, CODE_FILE), 'utf8').trim();
const dec = E.decodeMap(code);
if (!dec || dec.rows !== gridRows || dec.cols !== gridCols) throw new Error('分享碼尺寸與 ' + town.name + ' 不符');
const g = dec.grid;

/* ---------- SVG ---------- */
const S = 22, PAD = 20;
const W = gridCols * S + PAD * 2, H = gridRows * S + PAD * 2;
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const out = [];
out.push(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" font-family="'Noto Sans TC',sans-serif" role="img" aria-label="口袋學院物語2 ${town.name}完美佈局地圖">`);
out.push(`<title>口袋學院物語2 ${town.name}完美佈局（29 個人氣景點全成立）</title>`);
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
// 座標軸（遊戲座標：X = r+2 由上而下、Y = gridCols+1-c 由左而右遞減）
for (let r = 0; r < gridRows; r += 2) out.push(`<text x="${PAD - 5}" y="${PAD + r * S + S / 2 + 4}" font-size="10" text-anchor="end" fill="#94a3b8">${E.gameX(r)}</text>`);
for (let c = 0; c < gridCols; c += 2) out.push(`<text x="${PAD + c * S + S / 2}" y="${PAD - 6}" font-size="10" text-anchor="middle" fill="#94a3b8">${E.gameY(c)}</text>`);
out.push('</svg>');
fs.writeFileSync(path.join(OUT_DIR, town.svg), out.join('\n'));
console.log('SVG：' + town.svg + '（' + W + '×' + H + '，' + Math.round(out.join('\n').length / 1024) + 'KB）');

/* ---------- 景點位置表 ---------- */
const where = E.spotWindows(g);
const rows = SPOTS.map(s => {
    const w = where.get(s.id);
    const req = s.req.map(gr => (Array.isArray(gr) ? gr : [gr]).map(t => items[t].name).join('／')).join('＋');
    return `                        <tr><td>${s.name}</td><td>X${E.gameX(w[0])} / Y${E.gameY(w[1])}</td><td>${req}</td><td>${s.bonus || ''}</td></tr>`;
}).join('\n');
fs.writeFileSync(path.join(__dirname, 'spots-table-' + townKey + '.html'), rows);

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
fs.writeFileSync(path.join(__dirname, 'fac-table-' + townKey + '.html'), facRows);

/* ---------- 屬性加成合計（29 景點全開） ---------- */
const bonus = {};
SPOTS.forEach(s => (s.bonus || '').split(/\s+/).forEach(tok => {
    const m = /^(.+?)\+(\d+)$/.exec(tok);
    if (m) bonus[m[1]] = (bonus[m[1]] || 0) + Number(m[2]);
}));

const bCount = Object.entries(cnt).filter(([t]) => E.isBuildingType(t))
    .reduce((n, [t, v]) => n + v / ((items[t].w || 1) * (items[t].h || 1)), 0);
let plateauFac = 0;
for (let r = 0; r < gridRows; r++) for (let c = 0; c < gridCols; c++)
    if (g[r][c].elevation > 1 && E.isBuildingType(g[r][c].type)) plateauFac += 1 / ((items[g[r][c].type].w || 1) * (items[g[r][c].type].h || 1));
let gateCells = 0;
g.flat().forEach(c => { if (c.type === 'gate' || c.type === 'gate_h') gateCells++; });
console.log('建築棟數：' + Math.round(bCount) + '（高地上 ' + Math.round(plateauFac) + '）｜走廊：' + (cnt.wood_path || 0) +
    '｜教室：' + Math.round((cnt.class || 0) / 4) + ' 間｜校門：' + (gateCells / 2) + ' 座｜分享碼長度：' + code.length);
console.log('屬性加成合計：' + Object.entries(bonus).sort((a, b) => b[1] - a[1]).map(([k, v]) => k + ' +' + v).join('、'));
console.log('表格：spots-table-' + townKey + '.html / fac-table-' + townKey + '.html');
