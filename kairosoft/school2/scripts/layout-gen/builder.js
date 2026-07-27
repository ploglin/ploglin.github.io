/* 完美佈局的共用機具（城鎮無關）。
   健康鎮 final.js 與東部小鎮 east.js 都只提供「設定」，流程一律走這裡：
     景點骨架 → 4×4 補位 → 分區填充 → 綠化 → 加開校門 → 高地開發 → 驗證 → 分享碼
   每一次放置都有「景點數不可變少、被包圍建築數不可變多」的守衛。 */
const fs = require('fs');
const E = require('./engine.js');
const D = require('./design2.js');
const { items, SPOTS, gridRows, gridCols } = E;

/* 純裝飾地形：可被補位／填充覆蓋（不動道路、水塘與既有建築）。
   DECOR 是保守的預設（健康鎮用）；東部小鎮再用 DECOR_EAST 放寬 —— 田埂路(aze_path)
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
                if (cell.elevation >= 2 && CLEARABLE.has(cell.type)) g[r][c] = { type: 'empty', elevation: cell.elevation };
            }
        }
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
                if (walk.has(c)) g[r][c] = { type: 'wood_path', elevation: g[r][c].elevation };
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
    fill, addGate, openPlateaus, fillPlateau, tidyUnreachable, countReachable, report
};
