/* 健康鎮完美佈局 v2：先鋪路網 → 街廓填設施 → 真實邏輯驗證 */
const E = require('./engine.js');
const { items, SPOTS, gridRows, gridCols } = E;

const AV = [5, 10, 15, 20];        // 橫向大道
const ST = [4, 9, 14, 19];         // 縱向街道
const ROW_BANDS = [[1, 4], [6, 9], [11, 14], [16, 19], [21, 24]];
const COL_BANDS = [[0, 3], [5, 8], [10, 13], [15, 18], [20, 23]];

/* 可被道路覆蓋的地形。除了自然景觀，也包含健康鎮原本散落在路線上的小農舍
   （小雞、小農場、田地、百葉箱）——它們卡在幹道上會讓南北動線只剩中間一條
   草地，非常脆弱；拆掉改鋪路，農牧設施之後在南區的農牧園區重建。 */
const PAVEABLE = new Set(['empty', 'grass', 'woods', 'flower', 'azalea', 'pine', 'rock', 'special_tree', 'sakura', 'wood_path', 'asphalt',
    'chicken', 'farm', 'field', 'weather']);

function clone(g) { return g.map(r => r.map(c => ({ type: c.type, elevation: c.elevation }))); }
function sizeOf(t) { const it = items[t] || {}; return [it.w || 1, it.h || 1]; }

function layRoads(g) {
    const pave = (r, c) => {
        if (r < 0 || r >= gridRows || c < 0 || c >= gridCols) return;
        const cell = g[r][c];
        if (cell.elevation !== 1) return;          // 高地不鋪路（留斜坡與展望地形）
        if (!PAVEABLE.has(cell.type)) return;      // 水塘與既有建築不動
        g[r][c] = { type: 'wood_path', elevation: 1 };
    };
    AV.forEach(r => { for (let c = 0; c < gridCols; c++) pave(r, c); });
    ST.forEach(c => { for (let r = 1; r < gridRows - 1; r++) pave(r, c); }); // 不在最外圈留斷頭路
    return g;
}

/* 街廓：回傳每個 parcel 的 { r0,c0, slots:[可蓋建築的格], green:[只放景觀的格] } */
function parcels(g) {
    const reach = E.computeReachability(g);
    const out = [];
    for (const [r0, r1] of ROW_BANDS) for (const [c0, c1] of COL_BANDS) {
        const slots = [], green = [];
        for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) {
            if (g[r][c].type !== 'empty' || g[r][c].elevation !== 1) continue;
            // 與「街廓外的、已連到校門的可通行格」相鄰 → 可蓋建築
            let served = false;
            for (const [dr, dc] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
                const nr = r + dr, nc = c + dc;
                if (nr < 0 || nr >= gridRows || nc < 0 || nc >= gridCols) continue;
                if (nr >= r0 && nr <= r1 && nc >= c0 && nc <= c1) continue; // 街廓內不算
                if (E.PASSABLE.has(g[nr][nc].type) && reach && reach[nr][nc] >= 0) served = true;
            }
            (served ? slots : green).push([r, c]);
        }
        if (slots.length || green.length) out.push({ r0, c0, r1, c1, slots, green });
    }
    return out;
}

function typesInWindow(g, wr, wc) {
    const s = new Set();
    for (let dr = 0; dr < 4; dr++) for (let dc = 0; dc < 4; dc++) {
        const t = g[wr + dr][wc + dc].type;
        if (t !== 'empty') s.add(t);
        else if (E.isSlopeIn(g, wr + dr, wc + dc)) s.add('slope');
    }
    return s;
}

/* 在 parcel 裡找放得下 t 的位置。
   規則：所有格都要空著；若 t 是「建築」，整棟只需至少一格臨路（served）即可。 */
function findSlot(g, p, t, freeSet, servedSet) {
    const [w, h] = sizeOf(t);
    const needServe = E.isBuildingType(t);
    for (let r = p.r0; r <= p.r1 - h + 1; r++) for (let c = p.c0; c <= p.c1 - w + 1; c++) {
        let ok = true, served = false;
        for (let dr = 0; dr < h && ok; dr++) for (let dc = 0; dc < w && ok; dc++) {
            const k = (r + dr) + ',' + (c + dc);
            if (!freeSet.has(k)) ok = false;
            else if (servedSet.has(k)) served = true;
        }
        if (!ok) continue;
        if (needServe && !served) continue;
        return { r, c, w, h };
    }
    return null;
}
function place(g, slot, t) {
    // 保留該格原本的高度：高地上一樣可以蓋建築，只有斜坡不行
    for (let dr = 0; dr < slot.h; dr++) for (let dc = 0; dc < slot.w; dc++) {
        const cur = g[slot.r + dr][slot.c + dc];
        g[slot.r + dr][slot.c + dc] = { type: t, elevation: slot.elevation || cur.elevation };
    }
}

// 遊戲中只會有一間的設施 → 不重複蓋（校長室、辦公室）
const UNIQUE = new Set(['principal']);   // 全校只有一間校長室；校門、辦公室、教室都可以有多個
function hasType(g, t) {
    for (let r = 0; r < gridRows; r++) for (let c = 0; c < gridCols; c++) if (g[r][c].type === t) return true;
    return false;
}

function build(spotOrder, opts) {
    opts = opts || {};
    const g = layRoads(E.loadHealth());
    // 預先卡位（唯一設施要蓋在對的地方，例如校長室緊鄰辦公室，讓「學習」與「選舉」共用）
    (opts.preplace || []).forEach(x => {
        const [w, h] = sizeOf(x.t);
        place(g, { r: x.r, c: x.c, w, h }, x.t);
    });
    const ps = parcels(g);
    const freeSets = ps.map(p => new Set(p.slots.concat(p.green).map(([r, c]) => r + ',' + c)));
    const servedSets = ps.map(p => new Set(p.slots.map(([r, c]) => r + ',' + c)));
    const log = [];

    for (const spot of spotOrder) {
        let best = null;
        ps.forEach((p, pi) => {
            const have = typesInWindow(g, p.r0, p.c0);
            const missing = spot.req.filter(gr => !(Array.isArray(gr) ? gr : [gr]).some(t => have.has(t)));
            if (!missing.length) { if (!best || best.cells > 0) best = { pi, plan: [], cells: 0 }; return; }
            const tmpFree = new Set(freeSets[pi]);
            const plan = [];
            let ok = true;
            for (const gr of missing) {
                const opts2 = Array.isArray(gr) ? gr : [gr];
                let done = false;
                for (const t of opts2) {
                    // 玩家蓋不出來的隱藏磚（如 slope 斜坡是地形推導出來的）一律不放
                    if (items[t] && items[t].hidden) continue;
                    // 全遊戲唯一的設施不重複蓋
                    if (UNIQUE.has(t) && hasType(g, t)) continue;
                    const slot = findSlot(g, p, t, tmpFree, servedSets[pi]);
                    if (!slot) continue;
                    for (let dr = 0; dr < slot.h; dr++) for (let dc = 0; dc < slot.w; dc++)
                        tmpFree.delete((slot.r + dr) + ',' + (slot.c + dc));
                    plan.push({ t, slot }); done = true; break;
                }
                if (!done) { ok = false; break; }
            }
            if (!ok) return;
            const cells = plan.reduce((n, x) => n + x.slot.w * x.slot.h, 0);
            if (!best || cells < best.cells) best = { pi, plan, cells };
        });
        if (!best) { log.push({ spot: spot.name, fail: true }); continue; }
        for (const x of best.plan) {
            place(g, x.slot, x.t);
            for (let dr = 0; dr < x.slot.h; dr++) for (let dc = 0; dc < x.slot.w; dc++)
                freeSets[best.pi].delete((x.slot.r + dr) + ',' + (x.slot.c + dc));
            log.push({ spot: spot.name, t: x.t, at: [x.slot.r, x.slot.c] });
        }
    }
    return { g, ps, freeSets, servedSets, log };
}

module.exports = { UNIQUE, hasType, build, layRoads, parcels, place, findSlot, sizeOf, typesInWindow, clone, ROW_BANDS, COL_BANDS, AV, ST };

if (require.main === module) {
    const rarity = {};
    SPOTS.forEach(s => s.req.forEach(gr => (Array.isArray(gr) ? gr : [gr]).forEach(t => rarity[t] = (rarity[t] || 0) + 1)));
    const cost = s => s.req.reduce((n, gr) => {
        const o = Array.isArray(gr) ? gr : [gr];
        const [w, h] = sizeOf(o[0]);
        return n + w * h * 3 - Math.max(...o.map(t => rarity[t] || 1));
    }, 0);
    const order = SPOTS.slice().sort((a, b) => cost(b) - cost(a));
    const res = build(order);
    const active = E.activeSpots(res.g);
    const blocked = E.blockedBuildings(res.g);
    console.log('街廓數:', res.ps.length, '可蓋格總數:', res.ps.reduce((n, p) => n + p.slots.length, 0));
    console.log('成立景點:', active.size, '/', SPOTS.length);
    console.log('未成立:', SPOTS.filter(s => !active.has(s.id)).map(s => s.name).join('、') || '（無）');
    console.log('被包圍建築:', blocked.count, blocked.blocks.map(b => items[b.type].name).join('、'));
    console.log('失敗紀錄:', res.log.filter(x => x.fail).map(x => x.spot).join('、') || '（無）');
}
