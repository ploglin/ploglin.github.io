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

/* 多格建築要畫成「一棟」而不是 w×h 個方格 —— 分格畫的話，每格之間那條白色描邊
   在瀏覽器非整數縮放下會出現接縫，一棟 2×2 的辦公室看起來像上下兩塊不同顏色。
   這裡用跟模擬器 assignBlockIds() 同一套貪婪配對把同型同高的 w×h 區塊圈起來，
   一棟只畫一個矩形、名稱只標一次、高地虛線框也以整棟為單位。 */
function groupBlocks() {
    const taken = Array.from({ length: gridRows }, () => Array(gridCols).fill(false));
    const blocks = [];
    for (let r = 0; r < gridRows; r++) for (let c = 0; c < gridCols; c++) {
        if (taken[r][c]) continue;
        const cell = g[r][c], it = items[cell.type];
        const w = (it && it.w) || 1, h = (it && it.h) || 1;
        if (w * h > 1 && r + h <= gridRows && c + w <= gridCols) {
            let ok = true;
            for (let dr = 0; dr < h && ok; dr++) for (let dc = 0; dc < w && ok; dc++) {
                const o = g[r + dr][c + dc];
                if (taken[r + dr][c + dc] || o.type !== cell.type || o.elevation !== cell.elevation) ok = false;
            }
            if (ok) {
                for (let dr = 0; dr < h; dr++) for (let dc = 0; dc < w; dc++) taken[r + dr][c + dc] = true;
                blocks.push({ r, c, w, h, cell });
                continue;
            }
        }
        taken[r][c] = true;
        blocks.push({ r, c, w: 1, h: 1, cell });
    }
    return blocks;
}

for (const b of groupBlocks()) {
    const cell = b.cell;
    const it = items[cell.type] || items.empty;
    const x = PAD + b.c * S, y = PAD + b.r * S;
    const bw = b.w * S, bh = b.h * S;
    const multi = b.w * b.h > 1;
    const slope = cell.type === 'empty' && E.isSlopeIn(g, b.r, b.c);
    let fill = it.color;
    if (cell.type === 'empty' && cell.elevation > 1) fill = slope ? '#bef264' : '#a3a3a3';
    out.push(`<rect x="${x}" y="${y}" width="${bw}" height="${bh}" fill="${fill}" stroke="#ffffff" stroke-width="0.6"/>`);
    // 高地：整棟加一圈深色內框，讓高低差一眼看得出來
    if (cell.elevation > 1) out.push(`<rect x="${x + 1}" y="${y + 1}" width="${bw - 2}" height="${bh - 2}" fill="none" stroke="#475569" stroke-width="1.1" stroke-dasharray="3 2"/>`);
    if (slope) out.push(`<path d="M${x} ${y + bh}L${x + bw} ${y}" stroke="#65a30d" stroke-width="1.6"/>`);
    const sh = (it.short || '').trim();
    if (sh && cell.type !== 'empty' && cell.type !== 'grass') {
        const fs2 = multi ? 14 : 12.5;
        out.push(`<text x="${x + bw / 2}" y="${y + bh / 2 + fs2 * 0.36}" font-size="${fs2}" font-weight="700" text-anchor="middle" fill="${it.textCol === 'white' ? '#ffffff' : '#1f2937'}">${esc(sh)}</text>`);
    }
}
// 座標軸（遊戲座標：X = r+2 由上而下、Y = gridCols+1-c 由左而右遞減）
for (let r = 0; r < gridRows; r += 2) out.push(`<text x="${PAD - 5}" y="${PAD + r * S + S / 2 + 4}" font-size="10" text-anchor="end" fill="#94a3b8">${E.gameX(r)}</text>`);
for (let c = 0; c < gridCols; c += 2) out.push(`<text x="${PAD + c * S + S / 2}" y="${PAD - 6}" font-size="10" text-anchor="middle" fill="#94a3b8">${E.gameY(c)}</text>`);
out.push('</svg>');
fs.writeFileSync(path.join(OUT_DIR, town.svg), out.join('\n'));
console.log('SVG：' + town.svg + '（' + W + '×' + H + '，' + Math.round(out.join('\n').length / 1024) + 'KB）');

/* ---------- 縮圖 SVG（hub 的城鎮卡片用） ----------
   完整版一張就有 ~700 個方塊 ＋ ~500 個字，兩張一起塞進 hub 的卡片會讓頁面卡住，
   而且縮到 150px 高的時候字本來就看不清楚。縮圖只留色塊：不畫文字、不畫座標軸、
   相鄰同色格再橫向合併成一條，檔案小一個數量級。 */
const TS = 8, TPAD = 2;
const TW = gridCols * TS + TPAD * 2, TH = gridRows * TS + TPAD * 2;
const th = [];
th.push(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${TW} ${TH}" width="${TW}" height="${TH}" role="img" aria-label="口袋學院物語2 ${town.name}完美佈局縮圖">`);
th.push(`<title>口袋學院物語2 ${town.name}完美佈局縮圖</title>`);
th.push(`<rect width="${TW}" height="${TH}" fill="#f8fafc"/>`);
const colorAt = (r, c) => {
    const cell = g[r][c], it = items[cell.type] || items.empty;
    if (cell.type === 'empty' && cell.elevation > 1) return E.isSlopeIn(g, r, c) ? '#bef264' : '#a3a3a3';
    return it.color;
};
for (let r = 0; r < gridRows; r++) {
    let c = 0;
    while (c < gridCols) {
        const col = colorAt(r, c);
        let n = 1;
        while (c + n < gridCols && colorAt(r, c + n) === col) n++;
        th.push(`<rect x="${TPAD + c * TS}" y="${TPAD + r * TS}" width="${n * TS}" height="${TS}" fill="${col}"/>`);
        c += n;
    }
}
th.push('</svg>');
const thumbName = town.svg.replace('-perfect.svg', '-thumb.svg');
fs.writeFileSync(path.join(OUT_DIR, thumbName), th.join('\n'));
console.log('縮圖：' + thumbName + '（' + TW + '×' + TH + '，' + Math.round(th.join('\n').length / 1024) + 'KB）');

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
