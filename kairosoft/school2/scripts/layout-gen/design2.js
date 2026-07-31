/* 路網佈局器 v2：先鋪路網 → 街廓填設施 → 真實邏輯驗證。
   路網參數(大道/街道/街廓帶)取自 towns.js 的該城鎮設定，非健康鎮專用。 */
const E = require('./engine.js');
const S = require('./stages.js');
const { items, SPOTS, gridRows, gridCols } = E;

const ROADS = E.town.roads;
const AV = ROADS.AV;                 // 橫向大道（列）
const ST = ROADS.ST;                 // 縱向街道（欄）
const ROW_BANDS = ROADS.ROW_BANDS;   // 街廓的列區間
const COL_BANDS = ROADS.COL_BANDS;   // 街廓的欄區間

/* 可被道路覆蓋的地形。除了自然景觀，也包含原本散落在路線上的小農舍
   （小雞、小農場、田地、百葉箱）——它們卡在幹道上會讓動線只剩一條草地，
   非常脆弱；拆掉改鋪路，農牧設施之後在農牧園區重建。
   ※ 冬郵小鎮的『田埂路(aze_path)』與竹林在模擬器裡都不可通行，等同景觀，
     鋪成走廊才有動線可言，因此也列入。教室／辦公室／網球場等既有校舍不動。 */
const PAVEABLE = new Set(['empty', 'grass', 'woods', 'flower', 'azalea', 'pine', 'rock', 'special_tree', 'sakura', 'wood_path', 'asphalt',
    'aze_path', 'bamboo', 'chicken', 'farm', 'field', 'weather']);

function clone(g) { return g.map(r => r.map(c => ({ type: c.type, elevation: c.elevation }))); }
function sizeOf(t) { const it = items[t] || {}; return [it.w || 1, it.h || 1]; }

/* 鋪路：這一步只管「哪些格是路」,材質先統一鋪走廊當佔位；
   真正的材質分配交給最後的 builder.paveMaterials()（幹道脊椎＋分區 mat＋門前廣場）。 */
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
            /* 與「街廓外的、已連到校門的可通行格」相鄰 → 可蓋建築。
               ★ 三個條件都要:可通行 ＋ 從校門走得到 ＋ **真的踏得進來**(canStep 吃落差)。
               第三個條件原本漏掉,於是隔著一階落差的草地也被當成出入口,
               在那種位置切出 slot、蓋下去就是「驗證通過、實機走不到」的建築
               (冬郵湖心島的長頸鹿就是這樣被放進一格死口袋的)。
               engine.blockedBuildings() 已補同一條件,這裡要跟它一致,否則
               「排得下」與「走得到」兩套標準會打架。 */
            let served = false;
            for (const [dr, dc] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
                const nr = r + dr, nc = c + dc;
                if (nr < 0 || nr >= gridRows || nc < 0 || nc >= gridCols) continue;
                if (nr >= r0 && nr <= r1 && nc >= c0 && nc <= c1) continue; // 街廓內不算
                if (E.PASSABLE.has(g[nr][nc].type) && reach && reach[nr][nc] >= 0
                    && E.canStep(g, r, c, nr, nc)) served = true;
            }
            (served ? slots : green).push([r, c]);
        }
        if (slots.length || green.length) out.push({ r0, c0, r1, c1, slots, green });
    }
    return out;
}

const typesInWindow = E.typesInWindow;

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
    const g = layRoads(E.loadTerrain());
    // 鋪路後、切街廓前的整地鉤子（冬郵小鎮用它打通高地坡道，讓 parcels 算到正確的可達性）
    if (opts.prepare) opts.prepare(g);
    // 預先卡位（唯一設施要蓋在對的地方，例如校長室緊鄰辦公室，讓「學習」與「選舉」共用）
    (opts.preplace || []).forEach(x => {
        const [w, h] = sizeOf(x.t);
        place(g, { r: x.r, c: x.c, w, h }, x.t);
    });
    const ps = parcels(g);
    const freeSets = ps.map(p => new Set(p.slots.concat(p.green).map(([r, c]) => r + ',' + c)));
    const servedSets = ps.map(p => new Set(p.slots.map(([r, c]) => r + ',' + c)));
    const log = [];

    /* 街廓的解鎖階段：由城鎮設定檔的 ZONES 宣告（key = 街廓左上角 'r0,c0'）。
       沒宣告的街廓＝不限階段。 */
    const ZONES = opts.zones || {};
    const parcelStage = ps.map(p => (ZONES[p.r0 + ',' + p.c0] || {}).stage || null);
    /* ★ 分區優先（zone-first）：街廓的鋪面就是它的語意（走廊＝室內／水泥地＝運動／
       草地＝農牧／道路＝中性玄關），見 engine.zoneMismatch。
       zonePenalty ＝這一組計畫裡「蓋錯區」的棟數 —— 例如把辦公室排進農牧區、
       把操場排進行政區。舊版排序的主鍵是「要動的格數最少」，於是景點骨架完全無視
       分區語意，產出「農牧區裡有校長室與操場」這種圖，頁面上的分區名就變成謊話。
       新原則是「先有好的分區，再去滿足最大可以建造出來的景點」，所以**分區完整性
       升為主鍵**，格數退為次鍵、階段偏好第三 —— 代價是可能少幾個景點，這是刻意的。 */
    const parcelMat = ps.map(p => (ZONES[p.r0 + ',' + p.c0] || {}).mat || null);
    const zonePenalty = (pi, plan) =>
        plan.reduce((n, x) => n + (E.zoneMismatch(x.t, parcelMat[pi]) ? 1 : 0), 0);
    /* 階段偏好的懲罰值 = |景點階段 − 街廓階段|；「不限階段」的街廓算 0（中立）。
       故意不給沒宣告階段的街廓懲罰 —— 若讓它們吃懲罰，13 個階段 3 的景點會全部湧進
       南半部那 4 個 stage 3 街廓，把 ZONES 要填的設施位擠光（實測 29→28、棟數 147→115）。
       這樣一來階段機制的作用是「不要蓋進明顯不對的分區」，而不是「硬把景點吸進對的分區」。 */
    const stagePenalty = (pi, sStage) => parcelStage[pi] === null ? 0 : Math.abs(sStage - parcelStage[pi]);

    for (const spot of spotOrder) {
        const sStage = S.spotStage(spot);
        /* strict = 套用階段硬規則：階段 3 以上的景點不得把「新蓋的材料」放進 stage 1 的
           開局核心街廓（既有材料共用不算，因為 plan 是空的）。
           找不到任何街廓時會放寬重跑一次並 log —— 29/29 與 0 包圍優先於階段約束。 */
        const scan = strict => {
            let best = null;
            ps.forEach((p, pi) => {
                // 街廓左上角當 4×4 判定窗口的原點；貼邊的窄街廓要往內夾，才不會超出地圖
                const have = typesInWindow(g, Math.min(p.r0, gridRows - 4), Math.min(p.c0, gridCols - 4));
                const missing = spot.req.filter(gr => !(Array.isArray(gr) ? gr : [gr]).some(t => have.has(t)));
                // 排序鍵（字典序）：分區完整性 → 要動的格數 → 階段偏好
                const better = cand => !best || cand.zpen < best.zpen ||
                    (cand.zpen === best.zpen && (cand.cells < best.cells ||
                        (cand.cells === best.cells && cand.pen < best.pen)));
                if (!missing.length) {
                    // 材料已經齊了（純共用既有設施）→ 沒有新建築，分區與階段硬規則都不適用
                    const cand = { pi, plan: [], cells: 0, zpen: 0, pen: stagePenalty(pi, sStage) };
                    if (better(cand)) best = cand;
                    return;
                }
                if (strict && parcelStage[pi] === 1 && sStage >= 3) return;   // 硬規則
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
                const cand = {
                    pi, plan, cells: plan.reduce((n, x) => n + x.slot.w * x.slot.h, 0),
                    zpen: zonePenalty(pi, plan), pen: stagePenalty(pi, sStage)
                };
                if (better(cand)) best = cand;
            });
            return best;
        };
        let best = scan(true);
        if (!best) {
            best = scan(false);
            if (best) console.log('！階段硬規則放寬：' + spot.name + '（階段 ' + sStage +
                '）只能蓋進 stage 1 的開局核心街廓 ' + ps[best.pi].r0 + ',' + ps[best.pi].c0);
        }
        if (!best) { log.push({ spot: spot.name, fail: true }); continue; }
        // 守衛：整組放下去若把某棟建築圍死（例如卡住高地上唯一的一條走道）就整組作廢，
        // 該景點交給 builder 的 4×4 補位另找地方。
        const snap = [];
        for (const x of best.plan) for (let dr = 0; dr < x.slot.h; dr++) for (let dc = 0; dc < x.slot.w; dc++) {
            const cell = g[x.slot.r + dr][x.slot.c + dc];
            snap.push([x.slot.r + dr, x.slot.c + dc, cell.type, cell.elevation]);
        }
        const blockedBefore = E.blockedBuildings(g).count;
        best.plan.forEach(x => place(g, x.slot, x.t));
        if (E.blockedBuildings(g).count > blockedBefore) {
            snap.forEach(([r, c, t, e]) => { g[r][c] = { type: t, elevation: e }; });
            log.push({ spot: spot.name, fail: true, reason: 'blocked' });
            continue;
        }
        // 分區優先是主鍵，真的排不進對的區時會印出來（誠實記錄，頁面要交代）
        if (best.zpen) console.log('！分區語意妥協：' + spot.name + ' 有 ' + best.zpen +
            ' 棟蓋進語意不合的分區（' + (ZONES[ps[best.pi].r0 + ',' + ps[best.pi].c0] || {}).name + '）');
        for (const x of best.plan) {
            for (let dr = 0; dr < x.slot.h; dr++) for (let dc = 0; dc < x.slot.w; dc++)
                freeSets[best.pi].delete((x.slot.r + dr) + ',' + (x.slot.c + dc));
            log.push({ spot: spot.name, t: x.t, at: [x.slot.r, x.slot.c] });
        }
    }
    return { g, ps, freeSets, servedSets, log, zones: ZONES };
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
