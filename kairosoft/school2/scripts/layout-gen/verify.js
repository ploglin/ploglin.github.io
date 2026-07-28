/* 完美佈局驗證器（可重跑）。只吃分享碼，不吃產生器的中間狀態 ——
   把 code(-east).txt 解碼回地圖，再用模擬器的判定邏輯從頭驗一次。

   用法：node verify.js            → 驗健康鎮 code.txt
         node verify.js east       → 驗冬郵小鎮 code-east.txt
         node verify.js east page → 驗 layouts/index.html 上實際貼的那一串（最重要）
         node verify.js east <code> → 直接驗任意分享碼

   離開碼 0 = 全部 PASS，1 = 有 FAIL。 */
const fs = require('fs');
const path = require('path');
const townKey = (process.argv[2] || 'health').replace(/^--?/, '');
require('./towns.js').select(townKey);
const E = require('./engine.js');
const { items, SPOTS, gridRows, gridCols, town } = E;

const CODE_FILE = { health: 'code.txt', east: 'code-east.txt' }[townKey];
// 每個城鎮一個子頁：layouts/<town.page>/index.html
const PAGE = path.join(__dirname, '..', '..', 'layouts', town.page, 'index.html');
const PAGE_REL = 'layouts/' + town.page + '/index.html';
let source = CODE_FILE, arg = process.argv[3];
if (arg === 'page') {
    // 直接從該鎮的佈局頁抓「在模擬器開啟…」那顆按鈕上的分享碼，確保頁面貼的就是驗過的那張
    const html = fs.readFileSync(PAGE, 'utf8');
    const hits = [...html.matchAll(/sim\/#m=([A-Za-z0-9\-_]+)">🧩 在模擬器開啟([^<]*)</g)]
        .filter(m => m[2].includes('完美佈局'));
    if (hits.length !== 1) throw new Error(PAGE_REL + ' 裡的完美佈局分享碼數量應為 1，實際 ' + hits.length);
    arg = hits[0][1]; source = PAGE_REL;
}
const code = (arg || fs.readFileSync(path.join(__dirname, CODE_FILE), 'utf8')).trim();

let fails = 0;
const check = (name, ok, detail) => {
    if (!ok) fails++;
    console.log((ok ? '  PASS  ' : '  FAIL  ') + name + (detail ? '：' + detail : ''));
};

console.log('=== ' + town.name + '完美佈局 驗證（' + source + '，' + code.length + ' 字元）===');

/* 1) 分享碼解碼 */
const dec = E.decodeMap(code);
check('分享碼可解碼', !!dec);
if (!dec) process.exit(1);
check('尺寸 = ' + gridRows + '×' + gridCols, dec.rows === gridRows && dec.cols === gridCols, dec.rows + '×' + dec.cols);
const hasPrefix = /^\d+x\d+;/.test(Buffer.from(code.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('binary'));
check('尺寸前綴 RxC;（26×24 才可省略）', (gridRows === 26 && gridCols === 24) ? !hasPrefix : hasPrefix);
const g = dec.grid;

/* 2) 重新編碼要一模一樣（往返一致） */
check('重新編碼 = 原分享碼', E.encodeMap(g) === code);

/* 3) 地圖上不能有玩家蓋不出來的東西 */
const badTypes = new Set();
g.flat().forEach(c => { if (!items[c.type]) badTypes.add(c.type + '(不存在)'); else if (items[c.type].hidden) badTypes.add(c.type + '(hidden)'); });
check('沒有玩家蓋不出來的假地形', badTypes.size === 0, [...badTypes].join('、'));
const badElev = g.flat().filter(c => !(c.elevation >= 1 && c.elevation <= 3)).length;
check('高度都在 1–3', badElev === 0, badElev + ' 格');

/* 4) 人氣景點：29 種全成立 */
const active = E.activeSpots(g);
const where = E.spotWindows(g);
check('人氣景點 ' + active.size + ' / ' + SPOTS.length + ' 成立', active.size === SPOTS.length,
    SPOTS.filter(s => !active.has(s.id)).map(s => s.name).join('、'));

/* 5) 動線：沒有走不到的建築 */
const blocked = E.blockedBuildings(g);
check('被包圍（走不到）的建築 = 0', blocked.count === 0,
    blocked.blocks.map(b => items[b.type].name + '@X' + E.gameX(b.cells[0][0]) + '/Y' + E.gameY(b.cells[0][1])).join('、'));
const gates = [];
g.forEach((row, r) => row.forEach((c, cc) => { if (c.type === 'gate' || c.type === 'gate_h') gates.push([r, cc]); }));
check('至少有一座校門', gates.length > 0, gates.length + ' 格');

/* 6) 斜坡：不能蓋在斜坡上（蓋下去就不再是斜坡，高地會上不去）
      作法是拿原始地形推導的斜坡集合，逐格確認佈局沒有把它變成別的東西。 */
const base = E.loadTerrain();
const baseSlopes = [];
for (let r = 0; r < gridRows; r++) for (let c = 0; c < gridCols; c++) if (E.isSlopeIn(base, r, c)) baseSlopes.push([r, c]);
const lostSlopes = baseSlopes.filter(([r, c]) => !E.isSlopeIn(g, r, c));
check('原始地形的 ' + baseSlopes.length + ' 格斜坡未被蓋掉', lostSlopes.length === 0,
    lostSlopes.map(([r, c]) => 'X' + E.gameX(r) + '/Y' + E.gameY(c) + '=' + g[r][c].type).join('、'));

/* 7) 水塘：實機確認水塘可以被建設覆蓋破壞、變回平地，所以「破壞」是合法手段，
      但必須節制且說得出所以然 —— 檢查破壞格數不超過該鎮的預算（towns.js 的
      pond.maxCarve），而且不能無中生有多挖水塘。破壞的座標一律列出來。 */
const maxCarve = (town.pond && town.pond.maxCarve) || 0;
let pondBase = 0, pondAdded = 0;
const destroyed = [];
for (let r = 0; r < gridRows; r++) for (let c = 0; c < gridCols; c++) {
    if (base[r][c].type === 'pond') {
        pondBase++;
        if (g[r][c].type !== 'pond') destroyed.push('X' + E.gameX(r) + '/Y' + E.gameY(c) + '→' + items[g[r][c].type].name);
    } else if (g[r][c].type === 'pond') pondAdded++;
}
check('破壞的水塘 ' + destroyed.length + ' / 上限 ' + maxCarve + ' 格', destroyed.length <= maxCarve,
    destroyed.join('、') || '（無）');
check('沒有無中生有的新水塘', pondAdded === 0, pondAdded + ' 格');
console.log('  INFO  水塘：原始 ' + pondBase + ' 格 → 保留 ' + (pondBase - destroyed.length) + ' 格' +
    (destroyed.length ? '；鑿開水道 ' + destroyed.join('、') : ''));
// 破壞後的格子高度必須跟原本的水塘一致（水沒了就是「那個高度的平地」，不會憑空長出落差）
const badElevCarve = [];
for (let r = 0; r < gridRows; r++) for (let c = 0; c < gridCols; c++)
    if (base[r][c].type === 'pond' && g[r][c].type !== 'pond' && g[r][c].elevation !== base[r][c].elevation)
        badElevCarve.push('X' + E.gameX(r) + '/Y' + E.gameY(c));
check('鑿開的水道保持原高度', badElevCarve.length === 0, badElevCarve.join('、'));

/* 8) 既有建築：列出被拆掉的（拆遷要能說得出理由） */
const demolished = [];
const seen = Array.from({ length: gridRows }, () => Array(gridCols).fill(false));
for (let r = 0; r < gridRows; r++) for (let c = 0; c < gridCols; c++) {
    if (seen[r][c] || !E.isBuildingType(base[r][c].type)) continue;
    const t = base[r][c].type, stack = [[r, c]], cells = [];
    seen[r][c] = true;
    while (stack.length) {
        const [cr, cc] = stack.pop(); cells.push([cr, cc]);
        for (const [dr, dc] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
            const nr = cr + dr, nc = cc + dc;
            if (nr < 0 || nr >= gridRows || nc < 0 || nc >= gridCols || seen[nr][nc]) continue;
            if (base[nr][nc].type === t) { seen[nr][nc] = true; stack.push([nr, nc]); }
        }
    }
    if (!cells.some(([cr, cc]) => g[cr][cc].type === t)) demolished.push(items[t].name + '@X' + E.gameX(cells[0][0]) + '/Y' + E.gameY(cells[0][1]));
}
console.log('  INFO  拆除的既有建築：' + (demolished.join('、') || '（無）'));

/* 9) 統計 */
const counts = {};
g.flat().forEach(c => { if (c.type !== 'empty') counts[c.type] = (counts[c.type] || 0) + 1; });
const facCount = Object.entries(counts).filter(([t]) => E.isBuildingType(t))
    .reduce((n, [t, v]) => n + v / ((items[t].w || 1) * (items[t].h || 1)), 0);
const reach = E.computeReachability(g);
let unreach = 0;
for (let r = 0; r < gridRows; r++) for (let c = 0; c < gridCols; c++)
    if (E.PASSABLE.has(g[r][c].type) && reach[r][c] < 0) unreach++;
let plateauFac = 0;
for (let r = 0; r < gridRows; r++) for (let c = 0; c < gridCols; c++)
    if (g[r][c].elevation > 1 && E.isBuildingType(g[r][c].type)) plateauFac += 1 / ((items[g[r][c].type].w || 1) * (items[g[r][c].type].h || 1));
console.log('  INFO  建築 ' + Math.round(facCount) + ' 棟（其中高地上 ' + Math.round(plateauFac) + ' 棟）｜走廊 ' +
    (counts.wood_path || 0) + ' 格｜校門 ' + gates.length + ' 格｜教室 ' + Math.round((counts.class || 0) / 4) + ' 間｜走不到的通行格 ' + unreach);

/* 10) 29 個景點的成立位置（頁面表格用） */
console.log('\n景點｜座標（4×4 判定範圍左上角）｜需要設施');
SPOTS.forEach(s => {
    const w = where.get(s.id);
    console.log('  ' + s.name + '｜' + (w ? 'X' + E.gameX(w[0]) + ' / Y' + E.gameY(w[1]) : '—') + '｜' +
        s.req.map(gr => (Array.isArray(gr) ? gr : [gr]).map(t => items[t].name).join('／')).join('＋'));
});

console.log('\n' + (fails ? '✗ ' + fails + ' 項 FAIL' : '✓ 全部 PASS'));
process.exit(fails ? 1 : 0);
