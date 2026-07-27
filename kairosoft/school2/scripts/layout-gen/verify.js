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
const PAGE = path.join(__dirname, '..', '..', 'layouts', 'index.html');
let source = CODE_FILE, arg = process.argv[3];
if (arg === 'page') {
    // 直接從佈局頁抓「在模擬器開啟…」那顆按鈕上的分享碼，確保頁面貼的就是驗過的那張
    const html = fs.readFileSync(PAGE, 'utf8');
    const hits = [...html.matchAll(/sim\/#m=([A-Za-z0-9\-_]+)">🧩 在模擬器開啟([^<]*)</g)]
        .filter(m => m[2].includes('完美佈局'));
    const eastName = require('./towns.js').TOWNS.east.name; // 鎮名以 towns.js 為準，改名不會掉
    const hit = hits.find(m => townKey === 'east' ? m[2].includes(eastName) : !m[2].includes(eastName));
    if (!hit) throw new Error('layouts/index.html 找不到 ' + townKey + ' 的完美佈局分享碼');
    arg = hit[1]; source = 'layouts/index.html';
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

/* 7) 水塘原封不動（不填不挖） */
let pondBase = 0, pondKept = 0, pondAdded = 0;
for (let r = 0; r < gridRows; r++) for (let c = 0; c < gridCols; c++) {
    if (base[r][c].type === 'pond') { pondBase++; if (g[r][c].type === 'pond') pondKept++; }
    else if (g[r][c].type === 'pond') pondAdded++;
}
check('水塘 ' + pondBase + ' 格原封不動', pondKept === pondBase && pondAdded === 0,
    '保留 ' + pondKept + '／新增 ' + pondAdded);

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
