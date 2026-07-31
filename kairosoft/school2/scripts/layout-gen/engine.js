/* 從 sim/index.html 抽出 items / SPOTS / 該城鎮地形，並複製模擬器的判定邏輯（Node 版）。
   城鎮由 towns.js 決定 —— 進入點腳本要在 require 本檔之前先 select()，預設 health。 */
const fs = require('fs');
const path = require('path');
const TOWNS = require('./towns.js');

const SIM = path.join(__dirname, '..', '..', 'sim', 'index.html');
const src = fs.readFileSync(SIM, 'utf8');

function grab(startMarker, endMarker) {
    const i = src.indexOf(startMarker);
    if (i < 0) throw new Error('not found: ' + startMarker);
    const j = src.indexOf(endMarker, i);
    if (j < 0) throw new Error('end not found for ' + startMarker);
    return src.slice(i + startMarker.length, j);
}

const items = eval('({' + grab('const items = {', '\n        };') + '})');
const SPOTS = eval('([' + grab('const SPOTS = [', '\n        ];') + '])');

const town = TOWNS.current();
const PRESET_JSON = grab('const ' + town.preset + ' = `', '`;');

const gridRows = town.rows, gridCols = town.cols;
const TYPE_KEYS = Object.keys(items);
const PASSABLE = new Set(['empty', 'grass', 'wood_path', 'asphalt', 'concrete', 'slope']);

/* 地形自檢：presets 的形狀必須跟 towns.js 宣告的尺寸一致 */
const PRESET_GRID = JSON.parse(PRESET_JSON);
if (PRESET_GRID.length !== gridRows || PRESET_GRID[0].length !== gridCols) {
    throw new Error(`${town.name} 地形尺寸 ${PRESET_GRID.length}×${PRESET_GRID[0].length} 與 towns.js 的 ${gridRows}×${gridCols} 不符`);
}

function isBuildingType(t) {
    const it = items[t];
    return !!it && (it.type === 'fac' || it.type === 'spec' || it.type === 'sports' || it.type === 'farm');
}

/* 該城鎮的原始地形（每次呼叫都是新的一份） */
function loadTerrain() {
    return PRESET_GRID.map(row => row.map(c => ({ type: c.type, elevation: c.elevation })));
}

function isSlopeIn(g, r, c) {
    const cell = g[r][c];
    if (cell.type !== 'empty' || cell.elevation < 2) return false;
    return [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dr, dc]) => {
        const nr = r + dr, nc = c + dc;
        return nr >= 0 && nr < gridRows && nc >= 0 && nc < gridCols &&
            g[nr][nc].elevation === cell.elevation - 1;
    });
}

function canStep(g, r, c, nr, nc) {
    const a = g[r][c], b = g[nr][nc];
    if (a.elevation === b.elevation) return true;
    if (Math.abs(a.elevation - b.elevation) !== 1) return false;
    const hi = a.elevation > b.elevation ? [r, c] : [nr, nc];
    return isSlopeIn(g, hi[0], hi[1]);
}

function computeReachability(g) {
    const dist = Array.from({ length: gridRows }, () => Array(gridCols).fill(-1));
    const queue = [];
    for (let r = 0; r < gridRows; r++) for (let c = 0; c < gridCols; c++) {
        const t = g[r][c].type;
        if (t === 'gate' || t === 'gate_h') { dist[r][c] = 0; queue.push([r, c]); }
    }
    if (!queue.length) return null;
    let head = 0;
    while (head < queue.length) {
        const [r, c] = queue[head++];
        for (const [dr, dc] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
            const nr = r + dr, nc = c + dc;
            if (nr < 0 || nr >= gridRows || nc < 0 || nc >= gridCols) continue;
            if (dist[nr][nc] !== -1) continue;
            if (!PASSABLE.has(g[nr][nc].type)) continue;
            if (!canStep(g, r, c, nr, nc)) continue;
            dist[nr][nc] = dist[r][c] + 1;
            queue.push([nr, nc]);
        }
    }
    return dist;
}

/* 回傳 { count, blocks:[{type,cells}] } — 被包圍（無法從校門走到）的建築 */
function blockedBuildings(g) {
    const reach = computeReachability(g);
    const seen = Array.from({ length: gridRows }, () => Array(gridCols).fill(false));
    const blocks = [];
    for (let r = 0; r < gridRows; r++) for (let c = 0; c < gridCols; c++) {
        if (seen[r][c] || !isBuildingType(g[r][c].type)) continue;
        const type = g[r][c].type;
        const cells = [], stack = [[r, c]];
        seen[r][c] = true;
        let hasAccess = false;
        while (stack.length) {
            const [cr, cc] = stack.pop();
            cells.push([cr, cc]);
            for (const [dr, dc] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
                const nr = cr + dr, nc = cc + dc;
                if (nr < 0 || nr >= gridRows || nc < 0 || nc >= gridCols) continue;
                const nt = g[nr][nc].type;
                if (nt === type && !seen[nr][nc]) { seen[nr][nc] = true; stack.push([nr, nc]); }
                else if (PASSABLE.has(nt) && (!reach || reach[nr][nc] >= 0)) hasAccess = true;
            }
        }
        if (!hasAccess) blocks.push({ type, cells });
    }
    return { count: blocks.length, blocks };
}

/* ── 動線品質指標 ─────────────────────────────────────────────────────────────
   verify.js 的 INFO／PASS 與 builder.js 的環化 pass 共用同一套定義，免得兩邊各算一套。

     度數     = 四鄰中「canStep 走得過去」的通行格數。校門(gate/gate_h)雖然不在 PASSABLE，
                但它就是進出口，算一度 —— 不然門前那一格會被誤判成死路端點。
     孤立格   = 度 0 的通行格：看起來能走、其實哪裡都去不了，視同缺陷（一定走不到校門）。
     假動線   = 從任一校門走不到的通行格（unreach）。孤立格是它的特例；2×2 的封閉中庭
                每格度數都有 2、看起來是條路，其實整塊接不到校門，同樣是缺陷。
     死路端點 = 度 1 的通行格。
     死路支線 = 從每個端點沿「唯一路徑」走到第一個度 ≥ 3 的節點，路上經過的格；
                多個端點共用同一段只算一次（stubCells 是集合）。
     pct      = 死路支線格 / 通行格，動線流暢度的單一數字。

   stubs 依長度遞增排序（環化 pass 先啃便宜的短枝）。 */
const GATEWAY = new Set(['gate', 'gate_h']);

function flowMetrics(g) {
    const nbrs = (r, c) => {
        const out = [];
        for (const [dr, dc] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
            const nr = r + dr, nc = c + dc;
            if (nr < 0 || nr >= gridRows || nc < 0 || nc >= gridCols) continue;
            const t = g[nr][nc].type;
            const pass = PASSABLE.has(t);
            if (!pass && !GATEWAY.has(t)) continue;
            if (!canStep(g, r, c, nr, nc)) continue;
            out.push([nr, nc, pass]);
        }
        return out;
    };
    const degree = Array.from({ length: gridRows }, () => Array(gridCols).fill(-1));
    const reach = computeReachability(g);
    const ends = [], isolated = [], unreach = [];
    let passable = 0;
    for (let r = 0; r < gridRows; r++) for (let c = 0; c < gridCols; c++) {
        if (!PASSABLE.has(g[r][c].type)) continue;
        passable++;
        degree[r][c] = nbrs(r, c).length;
        if (reach && reach[r][c] < 0) unreach.push([r, c]);
    }
    for (let r = 0; r < gridRows; r++) for (let c = 0; c < gridCols; c++) {
        if (degree[r][c] === 0) isolated.push([r, c]);
        else if (degree[r][c] === 1) ends.push([r, c]);
    }
    const stubCells = new Set(), stubs = [];
    for (const [r0, c0] of ends) {
        const cells = [];
        let prev = null, cur = [r0, c0];
        while (cells.length < gridRows * gridCols) {
            cells.push(cur);
            // 只沿通行格往前走（校門不是節點，只是度數來源）
            const nx = nbrs(cur[0], cur[1])
                .filter(([nr, nc, pass]) => pass && !(prev && nr === prev[0] && nc === prev[1]));
            if (nx.length !== 1) break;               // 岔路或走到底
            const [nr, nc] = nx[0];
            if (degree[nr][nc] >= 3) break;           // 碰到路網節點就停
            prev = cur; cur = [nr, nc];
        }
        cells.forEach(([r, c]) => stubCells.add(r + ',' + c));
        stubs.push({ len: cells.length, cells });
    }
    stubs.sort((a, b) => a.len - b.len);
    return {
        passable, degree, reach, ends, isolated, unreach, stubCells, stubs,
        pct: passable ? Math.round(stubCells.size / passable * 100) : 0
    };
}

/* 與 sim 的 checkSpots 同邏輯：4×4 窗口，empty 且是斜坡者算 'slope' */
function typesInWindow(g, wr, wc) {
    const s = new Set();
    for (let dr = 0; dr < 4; dr++) for (let dc = 0; dc < 4; dc++) {
        const t = g[wr + dr][wc + dc].type;
        if (t !== 'empty') s.add(t);
        else if (isSlopeIn(g, wr + dr, wc + dc)) s.add('slope');
    }
    return s;
}

function spotOk(spot, typesIn) {
    return spot.req.every(gr => (Array.isArray(gr) ? gr : [gr]).some(t => typesIn.has(t)));
}

function activeSpots(g) {
    const active = new Set();
    for (let wr = 0; wr <= gridRows - 4; wr++) {
        for (let wc = 0; wc <= gridCols - 4; wc++) {
            const typesIn = typesInWindow(g, wr, wc);
            if (!typesIn.size) continue;
            for (const spot of SPOTS) {
                if (active.has(spot.id)) continue;
                if (spotOk(spot, typesIn)) active.add(spot.id);
            }
        }
    }
    return active;
}

/* 每個景點最先成立的 4×4 窗口左上角（頁面表格用） */
function spotWindows(g) {
    const where = new Map();
    for (let wr = 0; wr <= gridRows - 4; wr++) for (let wc = 0; wc <= gridCols - 4; wc++) {
        const ts = typesInWindow(g, wr, wc);
        if (!ts.size) continue;
        for (const s of SPOTS) if (!where.has(s.id) && spotOk(s, ts)) where.set(s.id, [wr, wc]);
    }
    return where;
}

/* 分享碼（與 sim 的 encodeMap / decodeMap 相同；非 26×24 帶 RxC; 前綴） */
function btoa(s) { return Buffer.from(s, 'binary').toString('base64'); }

function encodeMap(g) {
    const parts = [];
    let prev = null, count = 0;
    for (let r = 0; r < gridRows; r++) for (let c = 0; c < gridCols; c++) {
        const cell = g[r][c];
        const key = TYPE_KEYS.indexOf(cell.type) + '.' + (cell.elevation || 1);
        if (key === prev) count++;
        else { if (prev !== null) parts.push(prev + '.' + count); prev = key; count = 1; }
    }
    if (prev !== null) parts.push(prev + '.' + count);
    const prefix = (gridRows === 26 && gridCols === 24) ? '' : gridRows + 'x' + gridCols + ';';
    return btoa(prefix + parts.join(',')).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/* 回傳 { rows, cols, grid }；尺寸取自分享碼本身，不預設城鎮 */
function decodeMap(code) {
    let str = Buffer.from(String(code).replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('binary');
    let rows = 26, cols = 24;
    const sm = /^(\d+)x(\d+);/.exec(str);
    if (sm) { rows = +sm[1]; cols = +sm[2]; str = str.slice(sm[0].length); }
    if (rows < 5 || rows > 40 || cols < 5 || cols > 40) return null;
    const cells = [];
    for (const p of str.split(',')) {
        const [t, e, n] = p.split('.').map(Number);
        for (let k = 0; k < n; k++) cells.push({ type: TYPE_KEYS[t] || 'empty', elevation: e || 1 });
    }
    if (cells.length !== rows * cols) return null;
    const grid = [];
    for (let r = 0; r < rows; r++) grid.push(cells.slice(r * cols, (r + 1) * cols));
    return { rows, cols, grid };
}

/* 遊戲座標：X = r + 2（上到下）、Y = gridCols + 1 − c（左到右遞減） */
const gameX = r => r + 2;
const gameY = c => gridCols + 1 - c;

/* ── 分區語意（zone-first 架構的核心資料）────────────────────────────────────────
   使用者的原則是「走廊連接室內設施、水泥地是戶外運動、草地是農牧、道路是對外」，
   所以**鋪面本身就是分區語意**——不必再多一個欄位，`ZONES[].mat` 直接推出該區收什麼設施：

     走廊 wood_path → indoor（室內：教室／專科／辦公／室內生活機能）
     水泥地 concrete → sports（戶外運動設施）
     草地 grass     → farm  （動植物農牧、公園自然面）
     道路 asphalt   → open  （對外玄關：中性，什麼都收，不罰）

   `itemKind()` 以 items 的分類為底，再手動修正幾項：
     · 校門是 spec 但屬於玄關 → open
     · 更衣室登記在 fac，實際是運動設施的一部分 → sports
     · 紀念物／長椅／公告欄／販賣機／洗手間／飲水處／水井／茶室／焚化爐等**戶外小物**
       → open（它們在任何分區出現都合理，不該被罰）
   回傳 'open' 的設施是**語意中性**的，放哪都不算違規。 */
const ZONE_KIND_BY_MAT = { wood_path: 'indoor', concrete: 'sports', grass: 'farm', asphalt: 'open' };
const KIND_OVERRIDE = {
    gate: 'open', gate_h: 'open', locker: 'sports',
    // 戶外小物／紀念物：哪一區都合理
    toilet: 'open', water: 'open', vending: 'open', well: 'open', weather: 'open',
    board: 'open', incinerator: 'open', tea_room: 'open', bench: 'open',
    statue_br: 'open', statue_gold: 'open', totem: 'open', rocket: 'open',
    kairo_gold: 'open', kairo_statue: 'open', kairo_room: 'open'
};
const KIND_BY_CAT = { spec: 'indoor', fac: 'indoor', sports: 'sports', farm: 'farm' };
function itemKind(t) {
    if (KIND_OVERRIDE[t]) return KIND_OVERRIDE[t];
    const it = items[t];
    return (it && KIND_BY_CAT[it.type]) || 'open';
}
const zoneKind = mat => ZONE_KIND_BY_MAT[mat] || null;
/* 這一棟蓋進這個分區算不算違規？中性設施與中性／未宣告分區一律不算。 */
function zoneMismatch(t, mat) {
    const zk = zoneKind(mat);
    if (!zk) return false;
    const ik = itemKind(t);
    if (zk === 'open') return ik !== 'open';
    return ik !== 'open' && ik !== zk;
}

module.exports = {
    town, items, SPOTS, TYPE_KEYS, gridRows, gridCols, PASSABLE,
    isBuildingType, loadTerrain, loadHealth: loadTerrain, isSlopeIn, canStep, computeReachability,
    blockedBuildings, typesInWindow, spotOk, activeSpots, spotWindows, flowMetrics, GATEWAY,
    encodeMap, decodeMap, gameX, gameY,
    itemKind, zoneKind, zoneMismatch, ZONE_KIND_BY_MAT
};
