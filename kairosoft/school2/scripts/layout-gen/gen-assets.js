/* 由分享碼產生：地圖 SVG ＋ 縮圖 ＋ 鎮頁上的三張表
   用法：node gen-assets.js          → 健康鎮（code.txt → health-perfect.svg）
         node gen-assets.js east     → 冬郵小鎮（code-east.txt → east-perfect.svg）

   SVG／縮圖寫到 ../../layouts/；三張表**直接蓋章進該鎮的 layouts/<town>/index.html**
   （景點座標表 → gen:spots、設施清單 → gen:fac、階段×分區 → gen:stage）。
   舊做法是把表格 HTML 另存成 spots-table-*.html 等 15 個檔案供人手貼，於是
   ㈠貼漏了沒人知道（實測冬郵三張表的第一列縮排掉到第 0 欄、五鎮設施表的
   「校門(上下用)」全都停在改成全角括號之前的舊字串）㈡頁面上的數字與分享碼
   可能不一致卻沒有守衛。改成蓋章之後那些檔案沒有存在的理由，已刪除。 */
const fs = require('fs');
const path = require('path');
const townKey = (process.argv[2] || 'health').replace(/^--?/, '');
require('./towns.js').select(townKey);
const E = require('./engine.js');
const S = require('./stages.js');
const { items, SPOTS, gridRows, gridCols, town } = E;

const CODE_FILE = { health: 'code.txt', east: 'code-east.txt', hill: 'code-hill.txt', valley: 'code-valley.txt', lake: 'code-lake.txt' }[townKey];
const OUT_DIR = path.join(__dirname, '..', '..', 'layouts');
const PAGE = path.join(OUT_DIR, town.page, 'index.html');

/* ---------- 蓋章 ----------
   標記風格比照 scripts/gen-embed.js 的 `<!-- db:x … --><!-- db:end -->`：
     <!-- gen:spots -->  …產生物…  <!-- gen:end -->
   縮排由標記那一行決定（產生的列不自帶縮排），行尾符號沿用該檔原本的
   —— valley/hill 是 LF、health/east/lake 是 CRLF，統一成一種會把整份檔案
   都算成改動，那樣 `git diff` 就看不出真正變了什麼。
   找不到標記一律 throw：漏了標記等於那張表悄悄停止更新，正是舊做法的病。 */
const stamped = [];
function stamp(name, rows) {
    const rel = path.relative(path.join(__dirname, '..', '..'), PAGE);
    if (rel.startsWith('..') || path.isAbsolute(rel)) throw new Error('拒絕寫入 school2 之外的路徑：' + PAGE);
    const orig = fs.readFileSync(PAGE, 'utf8');
    const re = new RegExp('([ \\t]*)<!--\\s*gen:' + name + '\\s*-->[\\s\\S]*?<!--\\s*gen:end\\s*-->');
    const m = re.exec(orig);
    if (!m) throw new Error(rel + ' 裡找不到 <!-- gen:' + name + ' --> … <!-- gen:end --> 標記');
    const indent = m[1];
    const nl = /\r\n/.test(orig) ? '\r\n' : '\n';
    const block = indent + '<!-- gen:' + name + ' -->' + nl +
        rows.map(r => indent + r).join(nl) + nl +
        indent + '<!-- gen:end -->';
    const next = orig.slice(0, m.index) + block + orig.slice(m.index + m[0].length);
    if (next !== orig) fs.writeFileSync(PAGE, next);
    stamped.push('gen:' + name + ' ' + rows.length + ' 列' + (next === orig ? '（未變）' : ''));
}

const code = fs.readFileSync(path.join(__dirname, CODE_FILE), 'utf8').trim();
const dec = E.decodeMap(code);
if (!dec || dec.rows !== gridRows || dec.cols !== gridCols) throw new Error('分享碼尺寸與 ' + town.name + ' 不符');
const g = dec.grid;

/* ---------- 鋪面統計（圖例與 console 用）----------
   四種通行鋪面：走廊(木造廊下)／道路(外通路)／水泥地(パネル廊下)／草地(芝生)。
   只有草地是景點材料，其餘三種對景點判定等價，分配依道具加成與美觀決定。 */
const PAVE = ['wood_path', 'asphalt', 'concrete', 'grass'];
const paveCount = {};
PAVE.forEach(t => paveCount[t] = 0);
g.flat().forEach(c => { if (paveCount[c.type] !== undefined) paveCount[c.type]++; });
const paveTotal = PAVE.reduce((n, t) => n + paveCount[t], 0);

/* ---------- SVG ---------- */
const CELL = 22, PAD = 20;
const LEGEND_H = 62;                     // 主圖下方的鋪面圖例列（色塊一行 ＋ 兩行說明）
const W = gridCols * CELL + PAD * 2, H = gridRows * CELL + PAD * 2 + LEGEND_H;
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
/* 高地空地的填色：舊版 #a3a3a3 太冷、跟水泥地／體育館的灰撞色，改暖灰 #d6d3d1 */
const PLATEAU_FILL = '#d6d3d1';
const SLOPE_FILL = '#bef264';
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
    const x = PAD + b.c * CELL, y = PAD + b.r * CELL;
    const bw = b.w * CELL, bh = b.h * CELL;
    const multi = b.w * b.h > 1;
    const slope = cell.type === 'empty' && E.isSlopeIn(g, b.r, b.c);
    let fill = it.color;
    if (cell.type === 'empty' && cell.elevation > 1) fill = slope ? SLOPE_FILL : PLATEAU_FILL;
    out.push(`<rect x="${x}" y="${y}" width="${bw}" height="${bh}" fill="${fill}" stroke="#ffffff" stroke-width="0.6"/>`);
    // 高地：整棟加一圈深色內框，讓高低差一眼看得出來
    if (cell.elevation > 1) out.push(`<rect x="${x + 1}" y="${y + 1}" width="${bw - 2}" height="${bh - 2}" fill="none" stroke="#475569" stroke-width="1.1" stroke-dasharray="3 2"/>`);
    if (slope) out.push(`<path d="M${x} ${y + bh}L${x + bw} ${y}" stroke="#65a30d" stroke-width="1.6"/>`);
    const sh = (it.short || '').trim();
    // 四種鋪面（走廊／道路／水泥地／草地）一律不逐格標字 —— 幾百個「走」「外」把圖蓋滿，
    // 讀者要看的是建築；鋪面靠顏色分辨，格數交給下方圖例。
    if (sh && cell.type !== 'empty' && paveCount[cell.type] === undefined) {
        const fs2 = multi ? 14 : 12.5;
        out.push(`<text x="${x + bw / 2}" y="${y + bh / 2 + fs2 * 0.36}" font-size="${fs2}" font-weight="700" text-anchor="middle" fill="${it.textCol === 'white' ? '#ffffff' : '#1f2937'}">${esc(sh)}</text>`);
    }
}
// 座標軸（遊戲座標：X = r+2 由上而下、Y = gridCols+1-c 由左而右遞減）
for (let r = 0; r < gridRows; r += 2) out.push(`<text x="${PAD - 5}" y="${PAD + r * CELL + CELL / 2 + 4}" font-size="10" text-anchor="end" fill="#94a3b8">${E.gameX(r)}</text>`);
for (let c = 0; c < gridCols; c += 2) out.push(`<text x="${PAD + c * CELL + CELL / 2}" y="${PAD - 6}" font-size="10" text-anchor="middle" fill="#94a3b8">${E.gameY(c)}</text>`);

/* 鋪面圖例：色塊＋中文名＋格數。四種鋪面既然不標字，就一定要有圖例才讀得懂。 */
const LEG_Y = PAD + gridRows * CELL + 14;
const legW = Math.min(140, (W - PAD * 2) / PAVE.length);
PAVE.forEach((t, i) => {
    const it = items[t];
    const lx = PAD + i * legW;
    out.push(`<rect x="${lx}" y="${LEG_Y}" width="14" height="14" fill="${it.color}" stroke="#94a3b8" stroke-width="0.6"/>`);
    out.push(`<text x="${lx + 19}" y="${LEG_Y + 11}" font-size="11" fill="#334155">${esc(it.name)} ${paveCount[t]} 格</text>`);
});
[
    '四種鋪面中只有草地是景點材料；道路／走廊／水泥地對景點判定可互換。',
    '本圖依道具加成（抹布→走廊、滑板→道路與草地）與美觀分配，預算緊可全鋪最便宜的。'
].forEach((line, i) => out.push(`<text x="${PAD}" y="${LEG_Y + 31 + i * 14}" font-size="10" fill="#64748b">${esc(line)}</text>`));
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
    if (cell.type === 'empty' && cell.elevation > 1) return E.isSlopeIn(g, r, c) ? SLOPE_FILL : PLATEAU_FILL;
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
    /* ★ 分區優先架構下景點數不再一定是 29（towns.js 的 spots.target），未成立的景點
       `spotWindows()` 查不到窗口 —— 舊版直接 `w[0]` 會 TypeError（湖岸 23/29 時踩到）。
       未成立的照實標「—（放棄）」，頁面上的表格因此仍然是完整的 29 列。 */
    const at = w ? `X${E.gameX(w[0])} / Y${E.gameY(w[1])}` : '—（放棄）';
    return `<tr><td>${s.name}</td><td>${at}</td><td>${req}</td><td>${s.bonus || ''}</td></tr>`;
});
stamp('spots', rows);

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
    .map(k => `<tr><td>${k}</td><td>${byCat[k].sort().join('、')}</td></tr>`);
stamp('fac', facRows);

/* ---------- 階段 × 分區對照表 ----------
   由分享碼反推，不手寫：
     階段     = stages.js 的 spotStage（req 各組取組內最早可用的選項，再取全部材料的最大值）
     所在分區 = 該景點成立的 4×4 窗口「左上角」落在哪個街廓 → 反查該鎮 ZONES 的分區名。
                一個景點常常在好幾個窗口都成立（材料重複蓋），所以取「有名字、而且街廓階段
                最接近景點階段」的那一個當代表；全都查不到名字就標「既有校舍／其他」。
   跨階段景點的歸屬規則：階段取材料最晚者、位置取窗口左上所在分區，頁面表格兩者都標。 */
const ZONE_FILE = path.join(__dirname, 'zones-' + townKey + '.json');
const zones = fs.existsSync(ZONE_FILE) ? JSON.parse(fs.readFileSync(ZONE_FILE, 'utf8')) : {};
if (!Object.keys(zones).length) console.log('！找不到 ' + path.basename(ZONE_FILE) + '，分區欄會全部標「既有校舍／其他」（先跑 node ' + (townKey === 'health' ? 'final.js' : townKey + '.js') + '）');
const RB = town.roads.ROW_BANDS, CB = town.roads.COL_BANDS;
const zoneAt = (r, c) => {
    const rb = RB.find(([a, b]) => r >= a && r <= b);
    const cb = CB.find(([a, b]) => c >= a && c <= b);
    return (rb && cb && zones[rb[0] + ',' + cb[0]]) || null;
};
const OTHER = '既有校舍／其他';
function pickZone(spot, st) {
    let best = null;
    for (let wr = 0; wr <= gridRows - 4; wr++) for (let wc = 0; wc <= gridCols - 4; wc++) {
        const ts = E.typesInWindow(g, wr, wc);
        if (!ts.size || !E.spotOk(spot, ts)) continue;
        const z = zoneAt(wr, wc);
        const cand = z && z.name
            ? { pen: (z.stage ? Math.abs(z.stage - st) : 2), name: z.name, wr, wc }
            : { pen: 9, name: OTHER, wr, wc };
        if (!best || cand.pen < best.pen) best = cand;
    }
    return best || { name: '—', wr: null, wc: null };
}
const stageRows = SPOTS.map(s => {
    const st = S.spotStage(s);
    return { s, st, key: S.spotKeyItem(s), z: pickZone(s, st) };
}).sort((a, b) => a.st - b.st || a.s.name.localeCompare(b.s.name, 'zh-Hant'))
    .map(x => {
        const cond = items[x.key].name + '：' + S.itemCond(x.key) + (S.itemSrc(x.key) === '推定' ? '（推定）' : '');
        const at = x.z.wr === null ? '—' : 'X' + E.gameX(x.z.wr) + ' / Y' + E.gameY(x.z.wc);
        return `<tr><td>${x.st}・${S.STAGE_NAMES[x.st]}</td><td>${x.s.name}</td><td>${x.z.name}（${at}）</td><td>${cond}</td></tr>`;
    });
stamp('stage', stageRows);
const perStage = [1, 2, 3, 4].map(n => n + '階 ' + SPOTS.filter(s => S.spotStage(s) === n).length + ' 個').join('｜');
console.log('階段分佈：' + perStage);

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
console.log('建築棟數：' + Math.round(bCount) + '（高地上 ' + Math.round(plateauFac) + '）｜教室：' +
    Math.round((cnt.class || 0) / 4) + ' 間｜校門：' + (gateCells / 2) + ' 座｜分享碼長度：' + code.length);
console.log('鋪面格數：' + PAVE.map(t => items[t].name + ' ' + paveCount[t]).join('｜') +
    '（合計 ' + paveTotal + '，走廊占 ' + (paveTotal ? Math.round(paveCount.wood_path / paveTotal * 100) : 0) + '%）');
console.log('屬性加成合計：' + Object.entries(bonus).sort((a, b) => b[1] - a[1]).map(([k, v]) => k + ' +' + v).join('、'));
console.log('蓋章：layouts/' + town.page + '/index.html ← ' + stamped.join('｜'));
