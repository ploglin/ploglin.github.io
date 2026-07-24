/* 從 sim/index.html 抽出 items / SPOTS / 健康鎮地形，並複製模擬器的判定邏輯（Node 版） */
const fs = require('fs');
const path = require('path');

const SIM = path.join('D:', 'dev', 'web', 'ploglin.github.io', 'kairosoft', 'school2', 'sim', 'index.html');
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
const PRESET_JSON = grab('const PRESET_DEFAULT_DATA = `', '`;');

const gridRows = 26, gridCols = 24;
const TYPE_KEYS = Object.keys(items);
const PASSABLE = new Set(['empty', 'grass', 'wood_path', 'asphalt', 'concrete', 'slope']);

function isBuildingType(t) {
    const it = items[t];
    return !!it && (it.type === 'fac' || it.type === 'spec' || it.type === 'sports' || it.type === 'farm');
}

function loadHealth() {
    return JSON.parse(PRESET_JSON).map(row => row.map(c => ({ type: c.type, elevation: c.elevation })));
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

/* 與 sim 的 checkSpots 同邏輯：4×4 窗口，empty 且是斜坡者算 'slope' */
function activeSpots(g) {
    const active = new Set();
    for (let wr = 0; wr <= gridRows - 4; wr++) {
        for (let wc = 0; wc <= gridCols - 4; wc++) {
            const typesIn = new Set();
            for (let dr = 0; dr < 4; dr++) for (let dc = 0; dc < 4; dc++) {
                const t = g[wr + dr][wc + dc].type;
                if (t !== 'empty') typesIn.add(t);
                else if (isSlopeIn(g, wr + dr, wc + dc)) typesIn.add('slope');
            }
            if (!typesIn.size) continue;
            for (const spot of SPOTS) {
                if (active.has(spot.id)) continue;
                const ok = spot.req.every(gr => (Array.isArray(gr) ? gr : [gr]).some(t => typesIn.has(t)));
                if (ok) active.add(spot.id);
            }
        }
    }
    return active;
}

/* 分享碼（與 sim 的 encodeMap 相同） */
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
    return btoa(parts.join(',')).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function btoa(s) { return Buffer.from(s, 'binary').toString('base64'); }

module.exports = {
    items, SPOTS, TYPE_KEYS, gridRows, gridCols, PASSABLE,
    isBuildingType, loadHealth, isSlopeIn, computeReachability,
    blockedBuildings, activeSpots, encodeMap
};
