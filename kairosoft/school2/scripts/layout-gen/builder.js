/* 完美佈局的共用機具（城鎮無關）。
   健康鎮 final.js 與冬郵小鎮 east.js 都只提供「設定」，流程一律走這裡：
     景點骨架 → 4×4 補位 → 分區填充 → 綠化 → 加開校門 → 高地開發 → 驗證 → 分享碼
   每一次放置都有「景點數不可變少、被包圍建築數不可變多」的守衛。 */
const fs = require('fs');
const E = require('./engine.js');
const D = require('./design2.js');
const { items, SPOTS, gridRows, gridCols } = E;

/* 純裝飾地形：可被補位／填充覆蓋（不動道路、水塘與既有建築）。
   DECOR 是保守的預設（健康鎮用）；冬郵小鎮再用 DECOR_EAST 放寬 —— 田埂路(aze_path)
   與竹林(bamboo) 在模擬器裡都不可通行、也不是任何景點的材料，等同裝飾。 */
const DECOR = new Set(['rock', 'special_tree', 'azalea', 'pine', 'flower', 'grass', 'woods']);
const DECOR_EAST = new Set([...DECOR, 'aze_path', 'bamboo', 'sakura']);

/* 高地上可以「擦掉」變成斜坡的地形（水塘與建築不在內） */
const CLEARABLE = new Set(['grass', 'bamboo', 'sakura', 'woods', 'flower', 'azalea', 'aze_path', 'rock', 'pine', 'special_tree']);

/* 景點排序：大型／稀有設施先卡位 */
function spotOrder() {
    const rarity = {};
    SPOTS.forEach(s => s.req.forEach(gr => (Array.isArray(gr) ? gr : [gr]).forEach(t => rarity[t] = (rarity[t] || 0) + 1)));
    const cost = s => s.req.reduce((n, gr) => {
        const o = Array.isArray(gr) ? gr : [gr];
        const [w, h] = D.sizeOf(o[0]);
        return n + w * h * 3 - Math.max(...o.map(t => rarity[t] || 1));
    }, 0);
    return SPOTS.slice().sort((a, b) => cost(b) - cost(a));
}

function snapshot(g, cells) {
    return cells.map(([r, c]) => [r, c, g[r][c].type, g[r][c].elevation]);
}
function restore(g, snap) {
    snap.forEach(([r, c, t, e]) => { g[r][c] = { type: t, elevation: e }; });
}
function slotCells(slot) {
    const out = [];
    for (let dr = 0; dr < slot.h; dr++) for (let dc = 0; dc < slot.w; dc++) out.push([slot.r + dr, slot.c + dc]);
    return out;
}

/* 放置守衛：試放，若景點變少或包圍變多就回復原狀並回傳 false */
function guarded(g, slot, t) {
    const snap = snapshot(g, slotCells(slot));
    const before = { spots: E.activeSpots(g).size, blocked: E.blockedBuildings(g).count };
    D.place(g, slot, t);
    const after = { spots: E.activeSpots(g).size, blocked: E.blockedBuildings(g).count };
    if (after.spots < before.spots || after.blocked > before.blocked) { restore(g, snap); return false; }
    return true;
}

/* 街廓排不下的景點（例如「選舉」要跟全校唯一的辦公室同框）→ 滑動 4×4 窗口補位。
   可覆蓋純裝飾地形，但不動道路、水塘與既有建築。
   會把所有可行的窗口依「要動的格數」排序逐一試，並套用同一組守衛
   （景點不可變少、被包圍建築不可變多），因為補位很容易一棟房子就把窄走道堵死。 */
function fallback(g, res, spot, decor) {
    const modifiable = (r, c) => g[r][c].elevation === 1 && (g[r][c].type === 'empty' || decor.has(g[r][c].type));
    const plans = [];
    for (let wr = 0; wr <= gridRows - 4; wr++) for (let wc = 0; wc <= gridCols - 4; wc++) {
        const have = E.typesInWindow(g, wr, wc);
        const missing = spot.req.filter(gr => !(Array.isArray(gr) ? gr : [gr]).some(t => have.has(t)));
        if (!missing.length) return true;
        const used = new Set();
        const plan = [];
        let ok = true;
        for (const gr of missing) {
            const opts = (Array.isArray(gr) ? gr : [gr]).filter(t => !(items[t] && items[t].hidden));
            let done = false;
            for (const t of opts) {
                if (D.UNIQUE.has(t) && D.hasType(g, t)) continue;   // 唯一設施不重複蓋
                const [w, h] = D.sizeOf(t);
                for (let r = wr; r <= wr + 4 - h && !done; r++) for (let c = wc; c <= wc + 4 - w && !done; c++) {
                    let fits = true;
                    for (const [br, bc] of slotCells({ r, c, w, h })) {
                        if (used.has(br + ',' + bc) || !modifiable(br, bc)) { fits = false; break; }
                    }
                    if (!fits) continue;
                    // 整棟至少一格臨接「可通行」的地形
                    let served = false;
                    for (const [br, bc] of slotCells({ r, c, w, h }))
                        for (const [ar, ac] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
                            const nr = br + ar, nc = bc + ac;
                            if (nr < 0 || nr >= gridRows || nc < 0 || nc >= gridCols) continue;
                            if (nr >= r && nr < r + h && nc >= c && nc < c + w) continue;
                            if (used.has(nr + ',' + nc)) continue;
                            if (E.PASSABLE.has(g[nr][nc].type)) served = true;
                        }
                    if (!served) continue;
                    for (const [br, bc] of slotCells({ r, c, w, h })) used.add(br + ',' + bc);
                    plan.push({ t, slot: { r, c, w, h } }); done = true;
                }
                if (done) break;
            }
            if (!done) { ok = false; break; }
        }
        if (!ok) continue;
        plans.push({ cells: plan.reduce((n, x) => n + x.slot.w * x.slot.h, 0), plan });
    }
    plans.sort((a, b) => a.cells - b.cells);

    for (const cand of plans) {
        const all = cand.plan.flatMap(x => slotCells(x.slot));
        const snap = snapshot(g, all);
        const before = { spots: E.activeSpots(g).size, blocked: E.blockedBuildings(g).count };
        cand.plan.forEach(x => D.place(g, x.slot, x.t));
        const after = { spots: E.activeSpots(g), blocked: E.blockedBuildings(g).count };
        if (after.spots.size <= before.spots || after.blocked > before.blocked || !after.spots.has(spot.id)) {
            restore(g, snap);
            continue;
        }
        // 佔用到的格子從街廓 free 名單移除，避免後面填充覆蓋
        res.freeSets.forEach(set => all.forEach(([r, c]) => set.delete(r + ',' + c)));
        return true;
    }
    return false;
}

function fallbackAll(g, res, decor) {
    decor = decor || DECOR;
    const failed = [];
    SPOTS.filter(s => !E.activeSpots(g).has(s.id)).forEach(s => {
        if (!fallback(g, res, s, decor)) { console.log('！補位失敗：', s.name); failed.push(s); }
    });
    return failed;
}

/* 分區填充：ZONES 的 key = 街廓左上角 'r0,c0'
   decor:true 表示該街廓可覆蓋草地／花壇等純裝飾地形來騰出空間（覆蓋前有守衛把關） */
function fill(g, res, ZONES, defaultGreen, decor) {
    decor = decor || DECOR;
    res.ps.forEach((p, i) => {
        const z = ZONES[p.r0 + ',' + p.c0] || { fac: [], green: defaultGreen };
        const free = res.freeSets[i];
        const reach = E.computeReachability(g);
        const usable = (r, c) => free.has(r + ',' + c) ||
            (z.decor && g[r][c].elevation === 1 && decor.has(g[r][c].type));
        // 整棟至少一格臨接「街廓外、走得到的通行地形」
        const servedAt = (r, c, w, h) => {
            for (const [br, bc] of slotCells({ r, c, w, h }))
                for (const [ar, ac] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
                    const nr = br + ar, nc = bc + ac;
                    if (nr < 0 || nr >= gridRows || nc < 0 || nc >= gridCols) continue;
                    if (nr >= r && nr < r + h && nc >= c && nc < c + w) continue;
                    if (E.PASSABLE.has(g[nr][nc].type) && reach && reach[nr][nc] >= 0) return true;
                }
            return false;
        };
        for (const t of (z.fac || [])) {
            const [w, h] = D.sizeOf(t);
            const cands = [];
            for (let r = p.r0; r <= p.r1 - h + 1; r++) for (let c = p.c0; c <= p.c1 - w + 1; c++) {
                // 2×2 建築對齊街廓的四個象限，一個街廓剛好排下 4 棟、四面都貼路
                if (w === 2 && h === 2 && ((r - p.r0) % 2 || (c - p.c0) % 2)) continue;
                let ok = true;
                for (let dr = 0; dr < h && ok; dr++) for (let dc = 0; dc < w && ok; dc++)
                    if (!usable(r + dr, c + dc)) ok = false;
                if (ok && servedAt(r, c, w, h)) cands.push({ r, c, w, h });
            }
            // 優先用本來就空的格，其次才覆蓋裝飾地形
            const cellCost = s => slotCells(s).filter(([r, c]) => !free.has(r + ',' + c)).length;
            cands.sort((a, b) => cellCost(a) - cellCost(b));
            let placed = false;
            for (const slot of cands) {
                if (!guarded(g, slot, t)) continue;   // 換一個位置再試
                slotCells(slot).forEach(([r, c]) => free.delete(r + ',' + c));
                placed = true; break;
            }
            if (!placed) console.log('！' + z.name + '：' + items[t].name + ' 無處可放（' + cands.length + ' 個位置都會破壞景點或動線）');
        }
        // 綠化：剩下的街廓空地。花壇／櫻花樹不可通行，若擺下去會把某棟建築圍死就改鋪草地。
        [...free].forEach(key => {
            const [r, c] = key.split(',').map(Number);
            const before = E.blockedBuildings(g).count;
            g[r][c] = { type: z.green || defaultGreen, elevation: 1 };
            if (E.blockedBuildings(g).count > before) g[r][c] = { type: 'grass', elevation: 1 };
        });
        free.clear();
    });

    // 街廓外的死角空地（走不到的口袋）→ 綠化，讓地圖看起來是刻意留白
    const reach = E.computeReachability(g);
    for (let r = 0; r < gridRows; r++) for (let c = 0; c < gridCols; c++) {
        if (g[r][c].type !== 'empty' || g[r][c].elevation !== 1) continue;
        if (reach && reach[r][c] >= 0) continue;
        g[r][c] = { type: 'woods', elevation: 1 };
    }
}

/* 加開校門：校門可以開在地圖任一邊，多開一座能縮短動線。
   gate_h 是「上下用」的 2×1 版本，gate 是「左右用」的 1×2 版本。 */
function addGate(g, r, c, t, res) {
    const [w, h] = D.sizeOf(t);
    for (const [br, bc] of slotCells({ r, c, w, h }))
        if (g[br][bc].type !== 'empty') return false;
    if (!guarded(g, { r, c, w, h }, t)) { console.log('！加開校門放不下 (' + r + ',' + c + ')'); return false; }
    // 校門若開在還沒填充的街廓裡，要把格子從 free 名單移除，否則後面綠化會把門鋪掉
    if (res) res.freeSets.forEach(set => slotCells({ r, c, w, h }).forEach(([br, bc]) => set.delete(br + ',' + bc)));
    return true;
}

function countReachable(g) {
    const reach = E.computeReachability(g);
    let n = 0;
    for (let r = 0; r < gridRows; r++) for (let c = 0; c < gridCols; c++) if (reach && reach[r][c] >= 0) n++;
    return n;
}

/* 開水道：實機確認**水塘可以被建設直接覆蓋破壞，該格變回平地**（可通行、可蓋）。
   所以被水圍死的陸地不是死地——只要鑿最少量的水塘就能接上動線。

   作法：0-1 Dijkstra 從「現在走得到的格」往外算，每經過一格水塘 +1，
   得到每一格「要破壞幾格水塘才走得到」；再對所有 dist ≤ maxCarve 的陸地目標
   實際模擬一次，挑「打通面積最大、破壞格數最少」的那條水道鑿開。

   破壞後保留原本的高度 —— 水塘沒了就是「那個高度的普通地面」，不會憑空長出斜坡。 */
function carveWaterChannel(g, opt) {
    opt = opt || {};
    const maxCarve = opt.maxCarve || 2, minGain = opt.minGain || 8;
    const fill = opt.fill || 'wood_path';       // 鑿開後直接鋪走廊當橋
    const rounds = opt.rounds || 2;
    const carved = [];

    const isWater = t => t === 'pond' || t === 'lake';
    // 破壞水塘後那格變成「該高度的平地」——不是斜坡，所以只有同高度才走得過去。
    // 兩格都是現有地形時就用模擬器真正的 canStep（吃斜坡規則）。
    const walkable = (r, c, nr, nc) => {
        const a = g[r][c], b = g[nr][nc];
        if (isWater(a.type) || isWater(b.type)) return a.elevation === b.elevation;
        return E.canStep(g, r, c, nr, nc);
    };

    for (let round = 0; round < rounds; round++) {
        const reach = E.computeReachability(g);
        if (!reach) break;
        // dist[r][c] = 走到這格要破壞幾格水塘；prev 用來回推水道路徑
        const dist = Array.from({ length: gridRows }, () => Array(gridCols).fill(Infinity));
        const prev = Array.from({ length: gridRows }, () => Array(gridCols).fill(null));
        const deque = [];
        for (let r = 0; r < gridRows; r++) for (let c = 0; c < gridCols; c++)
            if (reach[r][c] >= 0) { dist[r][c] = 0; deque.push([r, c]); }
        while (deque.length) {
            const [r, c] = deque.shift();
            for (const [dr, dc] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
                const nr = r + dr, nc = c + dc;
                if (nr < 0 || nr >= gridRows || nc < 0 || nc >= gridCols) continue;
                const t = g[nr][nc].type;
                let cost;
                if (isWater(t)) cost = 1;                                // 破壞它
                else if (E.PASSABLE.has(t)) cost = 0;
                else continue;                                           // 建築／樹林等繞不過
                if (!walkable(r, c, nr, nc)) continue;
                if (dist[r][c] + cost >= dist[nr][nc] || dist[r][c] + cost > maxCarve) continue;
                dist[nr][nc] = dist[r][c] + cost;
                prev[nr][nc] = [r, c];
                if (cost) deque.push([nr, nc]); else deque.unshift([nr, nc]);
            }
        }
        // 候選目標：要破壞 1～maxCarve 格才到得了的「陸地」
        const targets = [];
        for (let r = 0; r < gridRows; r++) for (let c = 0; c < gridCols; c++) {
            const t = g[r][c].type;
            if (isWater(t)) continue;
            if (dist[r][c] > 0 && dist[r][c] <= maxCarve) targets.push([r, c]);
        }
        const pathOf = (r, c) => {                 // 回推路徑上要破壞的水塘格
            const cells = [];
            let cur = [r, c];
            while (cur && dist[cur[0]][cur[1]] > 0) {
                if (isWater(g[cur[0]][cur[1]].type)) cells.push(cur);
                cur = prev[cur[0]][cur[1]];
            }
            return cells;
        };
        const base = countReachable(g);
        let best = null;
        for (const [r, c] of targets) {
            const cells = pathOf(r, c);
            if (!cells.length || cells.length > maxCarve) continue;
            const snap = snapshot(g, cells);
            cells.forEach(([cr, cc]) => { g[cr][cc] = { type: fill, elevation: g[cr][cc].elevation }; });
            const gain = countReachable(g) - base;
            restore(g, snap);
            if (gain < minGain) continue;
            if (!best || gain > best.gain || (gain === best.gain && cells.length < best.cells.length)) best = { cells, gain };
        }
        if (!best) break;
        best.cells.forEach(([r, c]) => { g[r][c] = { type: fill, elevation: g[r][c].elevation }; carved.push([r, c]); });
        console.log('  鑿開水道：' + best.cells.map(([r, c]) => 'X' + E.gameX(r) + '/Y' + E.gameY(c)).join('、') +
            '（打通 ' + best.gain + ' 格）');
    }
    return carved;
}

/* 打通高地：高地上的「非空地形」（草地／竹林／田埂路等）不是斜坡，若某塊高地四周
   完全沒有斜坡，學生就永遠上不去，蓋在上面的既有建築也會被判成走不到。
   把邊界那一格清成空地，遊戲規則會自動判成斜坡（isSlope 是從高低差推導的、不是存的），
   高地就通了 —— 玩家在遊戲裡就是拿橡皮擦擦掉那格草地而已。

   兩階段，避免為了 +1 格就把整片櫻花林擦掉：
     階段1「打通大片」：貪婪選可到達格數增加 ≥ bigGain 的清除。
     階段2「救援被包圍的既有建築」：對還被包圍的建築，在周圍 radius 格內窮舉
           1～maxChain 格的清除組合，找出真的能救到它、且動最少格的那組坡道鏈。 */
function openPlateaus(g, opt) {
    opt = opt || {};
    const clearable = opt.clearable || CLEARABLE;
    const bigGain = opt.bigGain || 3, radius = opt.radius || 3;
    const maxChain = opt.maxChain || 3, max = opt.max || 40;
    const opened = [];
    const canClear = (r, c) => g[r][c].elevation >= 2 && clearable.has(g[r][c].type);
    const clear = (r, c) => { g[r][c] = { type: 'empty', elevation: g[r][c].elevation }; };

    // 階段1：一次打通一大片
    for (let guard = 0; guard < max; guard++) {
        const base = countReachable(g);
        let best = null;
        for (let r = 0; r < gridRows; r++) for (let c = 0; c < gridCols; c++) {
            if (!canClear(r, c)) continue;
            const snap = snapshot(g, [[r, c]]);
            clear(r, c);
            const gain = countReachable(g) - base;
            restore(g, snap);
            if (gain >= bigGain && (!best || gain > best.gain)) best = { r, c, gain };
        }
        if (!best) break;
        clear(best.r, best.c); opened.push(best);
    }

    // 階段2：救援被包圍的既有建築（窮舉短坡道鏈）
    for (let guard = 0; guard < max; guard++) {
        const blocked = E.blockedBuildings(g);
        if (!blocked.count) break;
        let fixedAny = false;
        for (const b of blocked.blocks) {
            const cands = [];
            for (let r = 0; r < gridRows; r++) for (let c = 0; c < gridCols; c++) {
                if (!canClear(r, c)) continue;
                if (b.cells.some(([br, bc]) => Math.abs(br - r) <= radius && Math.abs(bc - c) <= radius)) cands.push([r, c]);
            }
            const base = blocked.count;
            let done = false;
            const combo = (k, start, pick) => {
                if (done) return;
                if (pick.length === k) {
                    const snap = snapshot(g, pick);
                    pick.forEach(([r, c]) => clear(r, c));
                    if (E.blockedBuildings(g).count < base) { pick.forEach(p => opened.push({ r: p[0], c: p[1] })); done = true; }
                    else restore(g, snap);
                    return;
                }
                for (let i = start; i < cands.length && !done; i++) combo(k, i + 1, pick.concat([cands[i]]));
            };
            for (let k = 1; k <= maxChain && !done; k++) combo(k, 0, []);
            if (done) { fixedAny = true; break; }
        }
        if (!fixedAny) break;
    }

    if (opened.length) console.log('  打通高地坡道：' + opened.length + ' 處 → ' +
        opened.map(o => 'X' + E.gameX(o.r) + '/Y' + E.gameY(o.c)).join('、'));
    return opened;
}

/* ── 破壞地形換動線（水塘／原生植栽）─────────────────────────────────────────────
   carveWaterChannel 的目標是「把走不到的陸地接上動線」，所以它只認**可達面積增加**；
   要把已經走得到、但只有單一出入口的盲腸接成環，它一格都不會鑿（收益 0）。
   這支就是補那一塊：明列座標、明說換到什麼，逐組驗收。

   實機依據：水塘可以被建設覆蓋破壞後變回平地（已確認）；樹木／草地用橡皮擦清掉
   是遊戲的基本操作。兩者都是玩家真金白銀的錢與操作，所以**不自動搜尋、只吃手挑清單**，
   每一組都要在設定檔裡寫明理由。

   groups = [{ why:'一句話理由', cells:[[r, c, 'path'|'empty'], …] }]
     'path'  → 破壞後鋪通行鋪面（實際材質由後面的 paveMaterials／keep 決定；
               列進 keep 的一律走廊＝木橋意象）。
     'empty' → 破壞後留空地。若該格在高地、且四鄰剛好有低一階的格子，遊戲會自動把它
               判成「斜坡」（isSlope 是從高低差推導的、不是存的）→ 多一個上坡口。
               這跟 openPlateaus 打通北丘公園用的是同一招，不新增也不改任何 elevation。

   守衛（逐組）：景點一個都不能少、被包圍建築不能變多、動線總分必須真的變好
   （cost 與 loopify 同一把尺：孤立×100 + 走不到×20 + 死路支線格×3 + 死路端點）。
   整組跑完斷言 elevation 一格未動、原本推導出來的斜坡一格未少。
   回傳實際動到的座標（'path' 的那些適合併進 keep）。 */
const BREAKABLE = new Set(['pond', 'lake', ...CLEARABLE]);
const FLOW_COST = m => m.isolated.length * 100 + m.unreach.length * 20 + m.stubCells.size * 3 + m.ends.length;

function breakTerrain(g, groups, opt) {
    opt = opt || {};
    const pathMat = opt.pathMat || 'wood_path';
    const at = (r, c) => 'X' + E.gameX(r) + '/Y' + E.gameY(c);
    const elevSig = () => g.flat().map(x => x.elevation).join('');
    const slopeSig = () => {
        const out = [];
        for (let r = 0; r < gridRows; r++) for (let c = 0; c < gridCols; c++) if (E.isSlopeIn(g, r, c)) out.push(r + ',' + c);
        return out;
    };
    const elev0 = elevSig(), slopes0 = slopeSig();
    const paths = [], all = [];

    (groups || []).forEach(gp => {
        const cells = gp.cells;
        const bad = cells.filter(([r, c]) => !BREAKABLE.has(g[r][c].type));
        if (bad.length) {
            console.log('！破壞地形跳過（不是水塘／植栽）：' + gp.why + ' @ ' +
                bad.map(([r, c]) => at(r, c) + '=' + g[r][c].type).join('、'));
            return;
        }
        const label = cells.map(([r, c, f]) => at(r, c) + ' ' + items[g[r][c].type].name +
            '→' + (f === 'empty' ? (g[r][c].elevation > 1 ? '空地(斜坡)' : '空地') : items[pathMat].name)).join('、');
        const snap = snapshot(g, cells.map(([r, c]) => [r, c]));
        const before = { spots: E.activeSpots(g), blocked: E.blockedBuildings(g).count, cost: FLOW_COST(E.flowMetrics(g)) };
        cells.forEach(([r, c, f]) => { g[r][c] = { type: f === 'empty' ? 'empty' : pathMat, elevation: g[r][c].elevation }; });
        const after = { spots: E.activeSpots(g), blocked: E.blockedBuildings(g).count, cost: FLOW_COST(E.flowMetrics(g)) };
        const lost = [...before.spots].filter(id => !after.spots.has(id));
        if (lost.length || after.blocked > before.blocked || after.cost >= before.cost) {
            restore(g, snap);
            console.log('！破壞地形被守衛退回：' + gp.why + '（掉景點 ' + lost.length +
                '｜包圍 ' + before.blocked + '→' + after.blocked + '｜動線總分 ' + before.cost + '→' + after.cost + '）');
            return;
        }
        cells.forEach(([r, c, f]) => { all.push([r, c]); if (f !== 'empty') paths.push([r, c]); });
        console.log('  破壞地形：' + gp.why + '｜' + label + '（動線總分 ' + before.cost + ' → ' + after.cost + '）');
    });

    if (elevSig() !== elev0) throw new Error('破壞地形動到 elevation');
    const now = new Set(slopeSig());
    const lostSlope = slopes0.filter(k => !now.has(k));
    if (lostSlope.length) throw new Error('破壞地形弄掉了斜坡：' + lostSlope.join('、'));
    return { cells: all, paths };
}

/* 高地開發：高地一樣可以蓋建築，只有「斜坡」不行（斜坡是高低差自動生成的
   地形，一旦蓋東西上去就不再是斜坡、也就上不去了）。
   作法：每一列高地的最外側留作步道（接上斜坡坡道），中間才蓋設施。
   ※ 逐格放置，多格設施（網球場／籃球場 1×2）不能列進 zone.fac。 */
function fillPlateau(g, zones) {
    zones.forEach(z => {
        // clear:true → 先把這一區高地上的裝飾地形（田埂路／竹林／草地…）擦成空地再規劃。
        // 擦完若剛好貼著低一階地形，遊戲會自動判成斜坡，下面的迴圈會自動跳過不蓋。
        if (z.clear) {
            for (let r = z.rows[0]; r <= z.rows[1]; r++) for (let c = z.cols[0]; c <= z.cols[1]; c++) {
                const cell = g[r][c];
                if (cell.elevation < 2 || !CLEARABLE.has(cell.type)) continue;
                // 守衛：這格地形若正好是某個景點的材料（草地→清爽／菜園、櫻花→約會…），擦掉會弄掉景點
                const before = E.activeSpots(g).size;
                g[r][c] = { type: 'empty', elevation: cell.elevation };
                if (E.activeSpots(g).size < before) g[r][c] = { type: cell.type, elevation: cell.elevation };
            }
        }
        // 步道材質：公園類高地鋪草地（自然小徑，草地本身是菜園／力量／清爽的材料，
        // 只會多景點不會少），設施類園區鋪走廊（校舍內廊道語意、連動「抹布」加速）。
        const walkMat = z.walkMat || 'wood_path';
        const rowsOf = {};
        for (let r = z.rows[0]; r <= z.rows[1]; r++) for (let c = z.cols[0]; c <= z.cols[1]; c++) {
            const cell = g[r][c];
            if (cell.elevation < 2 || cell.type !== 'empty' || E.isSlopeIn(g, r, c)) continue;
            (rowsOf[r] = rowsOf[r] || []).push(c);
        }
        const slots = [];
        Object.keys(rowsOf).forEach(rk => {
            const r = Number(rk), cs = rowsOf[rk].sort((a, b) => a - b);
            const walk = new Set([cs[0], cs[cs.length - 1]]);
            cs.forEach(c => {
                if (walk.has(c)) g[r][c] = { type: walkMat, elevation: g[r][c].elevation };
                else slots.push([r, c]);
            });
        });
        let i = 0, placed = 0;
        for (const [r, c] of slots) {
            if (g[r][c].type !== 'empty') continue;
            const t = z.fac[i % z.fac.length];
            if ((items[t].w || 1) * (items[t].h || 1) > 1) { i++; continue; }
            const beforeBlocked = E.blockedBuildings(g).count;
            if (guarded(g, { r, c, w: 1, h: 1 }, t)) { i++; placed++; continue; }
            // 放不了就種樹／鋪草；但櫻花樹之類也不可通行，會圍死人，那就乾脆留空
            g[r][c] = { type: z.green, elevation: g[r][c].elevation };
            if (E.blockedBuildings(g).count > beforeBlocked)
                g[r][c] = { type: 'empty', elevation: g[r][c].elevation };
        }
        console.log('  ' + z.name + '：步道外的 ' + slots.length + ' 格中放了 ' + placed + ' 棟設施');
    });
}

/* 收尾：把「走不到」的走廊／外通路改鋪草地。那些是被後期建築封起來的斷頭路，
   留著會讓地圖上出現看似能走、其實走不到的假動線。草地一樣可通行，
   不會讓任何建築變成被包圍，也只可能讓景點變多不會變少（草地是菜園／力量的材料）。 */
function tidyUnreachable(g) {
    const ROAD = new Set(['wood_path', 'asphalt', 'concrete']);
    const reach = E.computeReachability(g);
    let n = 0;
    for (let r = 0; r < gridRows; r++) for (let c = 0; c < gridCols; c++) {
        if (!ROAD.has(g[r][c].type) || (reach && reach[r][c] >= 0)) continue;
        const snap = snapshot(g, [[r, c]]);
        const before = E.activeSpots(g).size;
        g[r][c] = { type: 'grass', elevation: g[r][c].elevation };
        if (E.activeSpots(g).size < before) restore(g, snap); else n++;
    }
    if (n) console.log('  斷頭路改鋪草地：' + n + ' 格');
}

/* ── 材質重鋪 pass（景點中立，在 report 之前跑）────────────────────────────────
   遊戲的四種通行鋪面各有語意，全圖一律鋪走廊等於把資訊丟掉：
     走廊 wood_path（木造廊下）＝校舍內廊道，道具「抹布」在此加速，
                                「相機組／寫生」按走廊算打工收入 → 教學／生活／運動區
     道路 asphalt（外通路）      ＝室外幹道，「滑板」在道路與草地加速 → 幹道脊椎、農牧／公園／湖心
     水泥地 concrete（パネル廊下）＝硬鋪面；機制未確認，只當體育館／泳池／道場的門前廣場，不當通道
     草地 grass（芝生）          ＝自然小徑，同時是菜園／力量／清爽的材料 → 分區內部填充與公園高地步道

   四種鋪面同屬 E.PASSABLE、都不是任何景點的「負材料」，所以可達性／包圍／景點判定完全不變，
   跑完會用 activeSpots / blockedBuildings 斷言（grass 化允許景點變多）。

   opts = { zones: ZONES, spine: {av:[列], st:[欄]}, keep: [[r,c],…], defaultMat }
     spine  ＝幹道脊椎（連接兩座校門的動線＋中軸），一律鋪道路。
     keep   ＝鑿出來的水道橋，保持走廊（木橋意象；幹道規則的顯式例外）。
     街道段的材質取自「鄰接街廓的 ZONES.mat」，兩側不同時取優先序 asphalt > wood_path。
     高地步道（elevation > 1）不動，由 fillPlateau 的 walkMat 決定。 */
const PAVE_ROAD = new Set(['wood_path', 'asphalt', 'concrete']);
const PAVE_PRIORITY = ['asphalt', 'wood_path'];

/* 「這一格該鋪什麼」的唯一規則，paveMaterials 與 loopify（環化 pass）共用 ——
   環化 pass 新鋪出來的補環格必須跟旁邊的街道同材質，不然圖上會出現一格突兀的異色。
   opts = { zones, spine, keep, defaultMat }。高地（elevation > 1）不吃街廓規則：
   那是 fillPlateau 的步道，取鄰格現成步道的材質（多數決，湊不出來就草地）。 */
function matResolver(opts) {
    opts = opts || {};
    const ZONES = opts.zones || {};
    const spine = opts.spine || {};
    const spineAV = new Set(spine.av || []);
    const spineST = new Set(spine.st || []);
    const keep = new Set((opts.keep || []).map(([r, c]) => r + ',' + c));
    const defaultMat = opts.defaultMat || 'wood_path';
    const onSpine = (r, c) => spineAV.has(r) || spineST.has(c);

    // 街道格鄰接哪些街廓（往外放一圈就是夾在中間的那條路）→ 取材質優先序
    const zoneMatAt = (r, c) => {
        const mats = new Set();
        for (const [r0, r1] of D.ROW_BANDS) for (const [c0, c1] of D.COL_BANDS) {
            if (r < r0 - 1 || r > r1 + 1 || c < c0 - 1 || c > c1 + 1) continue;
            const m = (ZONES[r0 + ',' + c0] || {}).mat;
            if (m) mats.add(m);
        }
        return PAVE_PRIORITY.find(m => mats.has(m)) || null;
    };

    const matAt = (g, r, c) => {
        if (keep.has(r + ',' + c)) return 'wood_path';
        if (g[r][c].elevation > 1) {                       // 高地步道：跟鄰格的步道同材質
            const tally = {};
            for (const [dr, dc] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
                const nr = r + dr, nc = c + dc;
                if (nr < 0 || nr >= gridRows || nc < 0 || nc >= gridCols) continue;
                const t = g[nr][nc].type;
                if (PAVE_ROAD.has(t) || t === 'grass') tally[t] = (tally[t] || 0) + 1;
            }
            const best = Object.keys(tally).sort((a, b) => tally[b] - tally[a])[0];
            return best || 'grass';
        }
        if (onSpine(r, c)) return 'asphalt';
        return zoneMatAt(r, c) || defaultMat;
    };
    matAt.onSpine = onSpine;
    matAt.keep = keep;
    matAt.zones = ZONES;
    return matAt;
}

function paveMaterials(g, opts) {
    opts = opts || {};
    const matAt = matResolver(opts);
    const onSpine = matAt.onSpine, keep = matAt.keep;

    const before = { spots: E.activeSpots(g), blocked: E.blockedBuildings(g).count };

    for (let r = 0; r < gridRows; r++) for (let c = 0; c < gridCols; c++) {
        const cell = g[r][c];
        if (!PAVE_ROAD.has(cell.type) || cell.elevation !== 1) continue;
        g[r][c] = { type: matAt(g, r, c), elevation: 1 };
    }

    /* 水泥門前廣場：體育館／泳池／道場的正門前 1–2 格路面／空地。
       守衛照舊（景點不可少、包圍不可多），失敗就跳過；幹道脊椎與水道橋不動。
       PLAZA_HOST 是模組層常數 —— 環化 pass 要靠同一份名單豁免這些門面格。 */
    const reach = E.computeReachability(g);   // 鋪面互換不影響可達性，算一次就夠
    let plazas = 0, plazaCells = 0;
    for (let r = 0; r < gridRows; r++) for (let c = 0; c < gridCols; c++) {
        if (!PLAZA_HOST.has(g[r][c].type)) continue;
        const ev = g[r][c].elevation;
        const cands = [];
        for (const [dr, dc] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
            const nr = r + dr, nc = c + dc;
            if (nr < 0 || nr >= gridRows || nc < 0 || nc >= gridCols) continue;
            const t = g[nr][nc].type;
            if (g[nr][nc].elevation !== ev) continue;
            if (!reach || reach[nr][nc] < 0) continue;                 // 走不到的口袋不鋪門前廣場
            if (onSpine(nr, nc) || keep.has(nr + ',' + nc)) continue;
            if (PAVE_ROAD.has(t)) cands.push([nr, nc, 0]);
            else if (t === 'empty' && !E.isSlopeIn(g, nr, nc)) cands.push([nr, nc, 1]);  // 斜坡絕對不動
        }
        cands.sort((a, b) => a[2] - b[2]);       // 先用現成的路面，其次才是空地
        let got = 0;
        for (const [nr, nc] of cands) {
            if (got >= 2) break;
            if (g[nr][nc].type === 'concrete') { got++; continue; }
            if (!guarded(g, { r: nr, c: nc, w: 1, h: 1 }, 'concrete')) continue;
            got++; plazaCells++;
        }
        if (got) plazas++;
    }

    // 中立性斷言
    const after = { spots: E.activeSpots(g), blocked: E.blockedBuildings(g).count };
    const lost = [...before.spots].filter(id => !after.spots.has(id));
    if (lost.length || after.blocked > before.blocked)
        throw new Error('材質重鋪 pass 不中立：掉了景點 ' + lost.join('、') +
            '；被包圍建築 ' + before.blocked + ' → ' + after.blocked);

    const cnt = { wood_path: 0, asphalt: 0, concrete: 0, grass: 0 };
    g.flat().forEach(x => { if (cnt[x.type] !== undefined) cnt[x.type]++; });
    const total = cnt.wood_path + cnt.asphalt + cnt.concrete + cnt.grass;
    console.log('  材質重鋪：走廊 ' + cnt.wood_path + '｜道路 ' + cnt.asphalt + '｜水泥地 ' + cnt.concrete +
        '｜草地 ' + cnt.grass + '（合計 ' + total + ' 格，走廊占 ' +
        (total ? Math.round(cnt.wood_path / total * 100) : 0) + '%）');
    console.log('  水泥門前廣場：' + plazas + ' 處、共 ' + plazaCells + ' 格');
    return cnt;
}

/* ── 環化 pass（動線流暢優先於景點配置；paveMaterials 之後、report 之前）──────────
   前一版管線只保證「每棟走得到」，於是留下三種看起來能走、其實沒有動線價值的格子：
     ① 孤立通行格（度 0）——街廓綠化把剩餘空地鋪成「草地」，草地卻是可通行的，
        於是四面被建築圍住的那一格變成一塊誰也走不進去的假草皮。
     ② 假動線口袋 —— 度數都 ≥ 2、看起來是條路，整塊卻接不到任何校門（例如 2×2 中庭）。
     ③ 度 1 的死路端點與它後面 2–4 格的短枝 —— 門前廣場的枝椏、街廓草地口袋、
        公園木道斷頭。玩家在遊戲裡走進去只能原路折返。
   這個 pass 把①②歸零、③盡量收掉，兩種手段：

     接回成環：把端點旁「不可通行的裝飾地形」（樹林／花壇／櫻花／竹林／田埂路／巨石…）
               改鋪成通行鋪面，材質走 matResolver（幹道→道路、街廓→ZONES.mat、
               高地步道→鄰格步道材質），讓端點多一條路、變成環。
               只在「這一格接完真的度 ≥ 2」時才算接回，不然只是把死路挪一格。
     收枝綠化：長度 ≤ maxStub 的短枝整條改種綠化（不可通行）；孤立格接不回去時也改綠化。
               綠化材質取該街廓的 green（若本身不可通行），高地取櫻花，其餘取 opt.green。

   豁免（一格都不動）：
     · 門前水泥廣場 —— 體育館／泳池／道場旁的 concrete 是建築門面，天生是端點。
     · 幹道脊椎（towns.js 的 spine）與鑿出來的水道橋（keep）—— 主動線與唯一通路。
     · 校門旁的通行格 —— 那是進出口，收掉會把門封死。
     · 斜坡 —— 蓋上去高地就上不去了（斜坡是高低差推導的）。
     · 水塘／建築／校門本身，以及設定檔 exempt 列出的座標。

   每一步都有守衛：景點一個都不能少、被包圍建築不能變多、動線總分必須真的變小
   （cost = 孤立×100 + 走不到×20 + 死路支線格×3 + 死路端點）；跑完再斷言景點集合、
   包圍數、水塘格數、斜坡集合全部沒變（所以 maxCarve 不可能被這個 pass 破壞）。 */
const LOOP_PAVEABLE = new Set(['flower', 'azalea', 'sakura', 'woods', 'pine', 'rock', 'special_tree', 'bamboo', 'aze_path']);
const PLAZA_HOST = new Set(['gym', 'pool', 'dojo']);

function loopify(g, opt) {
    opt = opt || {};
    const maxStub = opt.maxStub || 4;
    const greenDefault = opt.green || 'woods';
    const plateauGreen = opt.plateauGreen || 'sakura';
    const matAt = matResolver(opt);
    const ZONES = opt.zones || {};
    const key = (r, c) => r + ',' + c;

    /* 豁免格 */
    const exempt = new Set((opt.exempt || []).map(([r, c]) => key(r, c)));
    matAt.keep.forEach(k => exempt.add(k));
    for (let r = 0; r < gridRows; r++) for (let c = 0; c < gridCols; c++) {
        if (matAt.onSpine(r, c) && g[r][c].elevation === 1) exempt.add(key(r, c));
        if (E.isSlopeIn(g, r, c)) exempt.add(key(r, c));
        for (const [dr, dc] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
            const nr = r + dr, nc = c + dc;
            if (nr < 0 || nr >= gridRows || nc < 0 || nc >= gridCols) continue;
            const nt = g[nr][nc].type;
            if (E.GATEWAY.has(nt)) exempt.add(key(r, c));                                  // 校門門面
            if (g[r][c].type === 'concrete' && PLAZA_HOST.has(nt)) exempt.add(key(r, c));  // 門前廣場
        }
    }

    /* 綠化材質：街廓宣告的 green（若本身不可通行）→ 高地櫻花 → 預設樹林 */
    const greenAt = (r, c) => {
        if (g[r][c].elevation > 1) return plateauGreen;
        for (const [r0, r1] of D.ROW_BANDS) for (const [c0, c1] of D.COL_BANDS) {
            if (r < r0 || r > r1 || c < c0 || c > c1) continue;
            const gr = (ZONES[r0 + ',' + c0] || {}).green;
            if (gr && !E.PASSABLE.has(gr)) return gr;
        }
        return greenDefault;
    };

    const ponds = () => g.flat().filter(x => x.type === 'pond' || x.type === 'lake').length;
    const slopeSig = () => {
        const out = [];
        for (let r = 0; r < gridRows; r++) for (let c = 0; c < gridCols; c++) if (E.isSlopeIn(g, r, c)) out.push(key(r, c));
        return out.join(' ');
    };
    const base = { spots: E.activeSpots(g), blocked: E.blockedBuildings(g).count, ponds: ponds(), slopes: slopeSig() };
    /* 缺陷權重：孤立格 > 走不到的假動線格 > 死路支線格 > 死路端點。
       每一步都必須讓這個總分變小，pass 才會採用 —— 所以不可能「為了收枝而多出兩個端點」。 */
    const cost = m => m.isolated.length * 100 + m.unreach.length * 20 + m.stubCells.size * 3 + m.ends.length;
    let cur = E.flowMetrics(g), curCost = cost(cur);
    const before = {
        ends: cur.ends.length, stub: cur.stubCells.size, iso: cur.isolated.length,
        un: cur.unreach.length, pct: cur.pct
    };
    let paved = 0, cutStubs = 0, cutCells = 0, greened = 0, pockets = 0;

    /* 試放一組 [[r,c,type],…]：景點不可少、包圍不可多、動線指標必須變好；
       extra 是額外條件（例如「接回後這一格的度數要 ≥ 2」）。成功回傳新的 metrics。 */
    const trial = (moves, extra) => {
        if (moves.some(([r, c]) => exempt.has(key(r, c)))) return null;
        const snap = snapshot(g, moves.map(([r, c]) => [r, c]));
        moves.forEach(([r, c, t]) => { g[r][c] = { type: t, elevation: g[r][c].elevation }; });
        const m = E.flowMetrics(g);
        // 先看便宜的動線指標，過了才去算景點與包圍（activeSpots 是全圖 4×4 掃描，最貴）
        const ok = cost(m) < curCost && (!extra || extra(m)) &&
            [...base.spots].every(id => E.activeSpots(g).has(id)) &&
            E.blockedBuildings(g).count <= base.blocked;
        if (!ok) { restore(g, snap); return null; }
        cur = m; curCost = cost(m);
        return m;
    };

    /* 這一格旁邊可以改鋪成路的裝飾地形（同高度優先，斜坡與豁免格排除） */
    const paveCands = (r, c) => {
        const out = [];
        for (const [dr, dc] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
            const nr = r + dr, nc = c + dc;
            if (nr < 0 || nr >= gridRows || nc < 0 || nc >= gridCols) continue;
            if (exempt.has(key(nr, nc)) || !LOOP_PAVEABLE.has(g[nr][nc].type)) continue;
            out.push([nr, nc, g[nr][nc].elevation === g[r][c].elevation ? 0 : 1]);
        }
        return out.sort((a, b) => a[2] - b[2]);
    };

    /* 階段 A：孤立通行格（度 0）。
       先試「接回路網」——只認「接完這一格真的度 ≥ 2」的，不然只是把死路挪一格；
       接不回去就把它自己改種綠化（那格從此不是通行格，缺陷本身消失）。 */
    const fixIsolated = () => {
        const stuck = new Set();
        for (let guard = 0; guard < 200; guard++) {
            const t = cur.isolated.find(([r, c]) => !stuck.has(key(r, c)));
            if (!t) return stuck;
            const [r, c] = t;
            let done = false;
            for (const [nr, nc] of paveCands(r, c))
                if (trial([[nr, nc, matAt(g, nr, nc)]], m => m.degree[r][c] >= 2)) { paved++; done = true; break; }
            if (!done && trial([[r, c, greenAt(r, c)]])) { greened++; done = true; }
            if (!done) stuck.add(key(r, c));
        }
        return stuck;
    };

    /* 階段 B：假動線口袋（走不到，但度數 ≥ 2，所以既不是孤立格也不是死路端點）。
       例：街廓中間被建築圈起來的 2×2 草皮中庭 —— 每格都有兩個鄰格、看起來是條路，
       實際上從校門走不進去。先試著鋪一格裝飾把它接上路網（變成真的中庭），
       接不上就一格一格改綠化。走不到的格子不可能是任何建築的門面，
       所以綠化它不可能讓包圍數變多（守衛照樣跑）。
       ※ 一定要排在階段 C 之前：拆一塊 2×2 口袋會留下 L 形短枝，
         得讓階段 C 順手收掉，不然總體指標反而變差（實測死路支線 45 → 47 格）。 */
    const fixPockets = () => {
        const stuck = new Set();
        for (let guard = 0; guard < 400; guard++) {
            const t = cur.unreach.find(([r, c]) => !stuck.has(key(r, c)));
            if (!t) return;
            const [r, c] = t;
            let done = false;
            for (const [nr, nc] of paveCands(r, c))
                if (trial([[nr, nc, matAt(g, nr, nc)]], m => m.reach && m.reach[r][c] >= 0)) { paved++; done = true; break; }
            if (!done && trial([[r, c, greenAt(r, c)]])) { pockets++; done = true; }
            if (!done) stuck.add(key(r, c));
        }
    };

    /* 階段 C：死路支線。短枝先處理（便宜），每成功一次就重算指標、重新排序。
       stuck 用「這一枝的座標串」當 key —— 枝形變了就會自動重試。 */
    const sig = s => s.cells.map(([r, c]) => key(r, c)).join('|');
    const fixStubs = () => {
        const stuck = new Set();
        for (let guard = 0; guard < 400; guard++) {
            const stub = cur.stubs.find(s => !stuck.has(sig(s)));
            if (!stub) return;
            let done = false;
            // ① 接回成環：沿著支線找可鋪的裝飾鄰格（從端點往內），讓這一枝多一個出口
            for (const [r, c] of stub.cells) {
                for (const [nr, nc] of paveCands(r, c))
                    if (trial([[nr, nc, matAt(g, nr, nc)]])) { paved++; done = true; break; }
                if (done) break;
            }
            // ② 收枝：短枝整條改綠化（包圍守衛會擋掉「這一枝是某棟建築唯一門面」的情形）
            if (!done && stub.len <= maxStub && !stub.cells.some(([r, c]) => exempt.has(key(r, c)))
                && trial(stub.cells.map(([r, c]) => [r, c, greenAt(r, c)]))) {
                cutStubs++; cutCells += stub.len; done = true;
            }
            if (!done) stuck.add(sig(stub));
        }
    };

    /* 三個階段依「缺陷嚴重度」排，整組重跑到收斂為止（sweeps）——
       收掉一塊口袋常常會讓原本救不了的短枝變成可收；總分沒再變小就提早結束。 */
    let stuckIso = new Set();
    for (let sweep = 0; sweep < (opt.sweeps || 3); sweep++) {
        const costAtSweep = curCost;
        stuckIso = fixIsolated();
        fixPockets();
        fixStubs();
        if (curCost === costAtSweep) break;
    }

    /* 中立性斷言：景點集合、包圍數、水塘格數、斜坡集合都不許變
       （水塘與斜坡一格都沒動 → 這個 pass 不可能破壞 towns.js 的 maxCarve 或高地動線） */
    const after = { spots: E.activeSpots(g), blocked: E.blockedBuildings(g).count };
    const lost = [...base.spots].filter(id => !after.spots.has(id));
    if (lost.length || after.blocked > base.blocked)
        throw new Error('環化 pass 不中立：掉了景點 ' + lost.join('、') +
            '；被包圍建築 ' + base.blocked + ' → ' + after.blocked);
    if (ponds() !== base.ponds) throw new Error('環化 pass 動到水塘：' + base.ponds + ' → ' + ponds());
    if (slopeSig() !== base.slopes) throw new Error('環化 pass 動到斜坡集合');

    const m = cur;
    console.log('  環化 pass：孤立通行格 ' + before.iso + ' → ' + m.isolated.length +
        '｜走不到的通行格 ' + before.un + ' → ' + m.unreach.length +
        '｜死路端點 ' + before.ends + ' → ' + m.ends.length +
        '｜死路支線 ' + before.stub + ' → ' + m.stubCells.size + ' 格（' + before.pct + '% → ' + m.pct + '%）');
    console.log('  手段：接回成環 ' + paved + ' 格｜收枝 ' + cutStubs + ' 枝共 ' + cutCells + ' 格｜' +
        '孤立格改綠化 ' + greened + ' 格｜假動線口袋改綠化 ' + pockets + ' 格' +
        (stuckIso.size ? '｜接不回也綠化不了的孤立格 ' + [...stuckIso].join('、') : ''));
    return m;
}

/* 把分區設定（名稱／階段／材質）寫成產物，供 gen-assets.js 產「階段 × 分區」對照表。
   gen-assets 只吃分享碼，本來看不到 ZONES，所以由設定檔在產圖時一併輸出。 */
function writeZones(ZONES, file) {
    const out = {};
    Object.keys(ZONES).forEach(k => {
        const z = ZONES[k];
        out[k] = { name: z.name || '', stage: z.stage || null, mat: z.mat || null };
    });
    fs.writeFileSync(file, JSON.stringify(out, null, 1));
}

/* 驗證＋輸出：全部走模擬器的真實邏輯 */
function report(g, title, codeFile) {
    const active = E.activeSpots(g);
    const blocked = E.blockedBuildings(g);
    const missing = SPOTS.filter(s => !active.has(s.id));

    const counts = {};
    g.flat().forEach(c => { if (c.type !== 'empty') counts[c.type] = (counts[c.type] || 0) + 1; });
    const facCount = Object.entries(counts).filter(([t]) => E.isBuildingType(t))
        .reduce((n, [t, v]) => n + v / ((items[t].w || 1) * (items[t].h || 1)), 0);

    console.log('=== ' + title + ' 驗證報告 ===');
    console.log('地圖尺寸：', gridRows + '×' + gridCols);
    console.log('成立人氣景點：', active.size, '/', SPOTS.length);
    console.log('未成立：', missing.map(s => s.name).join('、') || '（無）');
    console.log('被包圍（走不到）的建築：', blocked.count,
        blocked.blocks.map(b => items[b.type].name + '@X' + E.gameX(b.cells[0][0]) + '/Y' + E.gameY(b.cells[0][1])).join('、'));
    console.log('建築棟數（含既有校舍）：', Math.round(facCount));
    const reach2 = E.computeReachability(g);
    let unreach = 0;
    for (let r = 0; r < gridRows; r++) for (let c = 0; c < gridCols; c++)
        if (E.PASSABLE.has(g[r][c].type) && reach2[r][c] < 0) unreach++;
    console.log('走不到的通行格：', unreach);

    const code = E.encodeMap(g);
    const back = E.decodeMap(code);
    const same = back && back.rows === gridRows && back.cols === gridCols &&
        JSON.stringify(back.grid) === JSON.stringify(g.map(r => r.map(c => ({ type: c.type, elevation: c.elevation }))));
    console.log('分享碼往返一致：', same ? 'PASS' : 'FAIL');
    console.log('分享碼長度：', code.length);
    fs.writeFileSync(codeFile, code);

    const sym = c => {
        if (c.type === 'empty') return c.elevation > 1 ? '^' : '.';
        if (['wood_path', 'asphalt', 'concrete', 'aze_path'].includes(c.type)) return '=';
        if (c.type === 'grass') return ',';
        if (c.type === 'pond' || c.type === 'lake') return '~';
        if (c.type === 'gate' || c.type === 'gate_h') return 'G';
        if (['woods', 'pine', 'sakura', 'poplar', 'bamboo', 'palm'].includes(c.type)) return 'T';
        if (['flower', 'azalea'].includes(c.type)) return '*';
        return E.isBuildingType(c.type) ? '#' : 'o';
    };
    console.log('\n    ' + Array.from({ length: gridCols }, (_, c) => c % 10).join(''));
    g.forEach((row, r) => console.log(String(r).padStart(2) + ': ' + row.map(sym).join('')));

    console.log('\n=== 設施統計 ===');
    Object.entries(counts).sort((a, b) => b[1] - a[1]).forEach(([t, n]) => {
        const it = items[t]; const sz = (it.w || 1) * (it.h || 1);
        console.log(it.name + ' ×' + (n / sz) + (sz > 1 ? ' (' + (it.w || 1) + '×' + (it.h || 1) + ')' : ''));
    });
    return { active, blocked, code };
}

module.exports = {
    DECOR, DECOR_EAST, CLEARABLE, spotOrder, guarded, fallback, fallbackAll,
    fill, addGate, carveWaterChannel, openPlateaus, breakTerrain, BREAKABLE, FLOW_COST,
    fillPlateau, tidyUnreachable, countReachable,
    matResolver, paveMaterials, loopify, LOOP_PAVEABLE, PLAZA_HOST, writeZones, report
};
