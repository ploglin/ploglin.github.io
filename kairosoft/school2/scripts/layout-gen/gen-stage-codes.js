/* 從完美佈局反推「第 1～3 階蓋完時」的中途分享碼（第 4 階＝完美佈局本身，不重算）。

   規則：完美佈局逐格比對 stages.js 的 item 解鎖階段——
     那一格的 item 階段 <= N  → 該格維持完美佈局的內容（已經蓋好了）
     否則                    → 退回開局起始地形（PRESET_<TOWN>_DATA），也就是「這一格還沒蓋」

   起始地形取自 sim/index.html 對應城鎮的 PRESET 常數（town.preset），
   跟 checks/sim.js 讀 PRESET_DEFAULT_DATA 驗證分享碼往返時用的是同一個正則。

   產出後用 engine.js 的 blockedBuildings() 逐階自我檢查：任何一階冒出「被包圍的建築」
   都會印出來——那代表某條動線的鋪面本身解鎖階段比它服務的建築晚，需要人工在
   對應城鎮的 stages/ 頁面寫一條「這幾格提前鋪」的規則（湖岸 stages 頁「第 0 步」
   就是這樣手動保留鎖喉走廊的先例），不是這支腳本能自動決定的設計取捨。

   用法：node gen-stage-codes.js health
         node gen-stage-codes.js health --write   （驗證全過才寫進頁面，見下方 STAMP）
*/
const fs = require('fs');
const path = require('path');

const townKey = (process.argv[2] || 'health').replace(/^--?/, '');
const WRITE = process.argv.includes('--write');

require('./towns.js').select(townKey);
const E = require('./engine.js');
const S = require('./stages.js');
const { town, gridRows, gridCols, decodeMap, encodeMap, blockedBuildings, computeReachability, PASSABLE, canStep } = E;

const ROOT = path.join(__dirname, '..', '..', '..', '..');
const CODE_FILE = { health: 'code.txt', east: 'code-east.txt', hill: 'code-hill.txt', valley: 'code-valley.txt', lake: 'code-lake.txt' }[townKey];
if (!CODE_FILE) throw new Error('未知城鎮：' + townKey);

const perfectCode = fs.readFileSync(path.join(__dirname, CODE_FILE), 'utf8').trim();
const decoded = decodeMap(perfectCode);
if (!decoded || decoded.rows !== gridRows || decoded.cols !== gridCols) {
    throw new Error(CODE_FILE + ' 解碼失敗或尺寸與 towns.js 不符');
}
const perfect = decoded.grid;

const simHtml = fs.readFileSync(path.join(__dirname, '..', '..', 'sim', 'index.html'), 'utf8');
const presetRe = new RegExp(town.preset + ' = `(\\[\\[[\\s\\S]*?\\]\\])`');
const pm = presetRe.exec(simHtml);
if (!pm) throw new Error('sim/index.html 裡找不到 ' + town.preset);
const starting = JSON.parse(pm[1]);
if (starting.length !== gridRows || starting[0].length !== gridCols) {
    throw new Error(town.preset + ' 尺寸與 towns.js 不符');
}

/* 完美佈局本身 0 被包圍（否則它就不是完美佈局），所以從校門出發的距離場
   涵蓋了完美佈局裡每一格可通行格。中途快照缺的只是「這一段還沒解鎖」，
   路徑本身在完美佈局裡一定存在——順著距離場往回走就能找到它。 */
const reachPerfect = computeReachability(perfect);

/* 把某棟建築修到走得到：從它的鄰居裡挑一個在完美佈局裡有效、且離校門最近的
   「門口候選」，再沿著距離場逐格往校門走，把沿途所有格子提前promote成完美
   佈局的內容。這是把湖岸 stages 頁「第 0 步：保護渡口」那種手動判斷改成
   自動找最短的必要提前鋪面，只提前「這一棟現在需要」的最少幾格，不整條路網提前。 */
function repairBuilding(g, cells) {
    let best = null;
    for (const [cr, cc] of cells) {
        for (const [dr, dc] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
            const nr = cr + dr, nc = cc + dc;
            if (nr < 0 || nc < 0 || nr >= gridRows || nc >= gridCols) continue;
            if (!PASSABLE.has(perfect[nr][nc].type)) continue;
            if (reachPerfect[nr][nc] < 0) continue;
            if (!canStep(perfect, cr, cc, nr, nc)) continue;
            if (!best || reachPerfect[nr][nc] < best.dist) best = { r: nr, c: nc, dist: reachPerfect[nr][nc] };
        }
    }
    if (!best) return false;
    // 提前鋪面時，晚解鎖的鋪面（草地/水泥地/道路）在這一階還鋪不出來，改鋪走廊。
    // 只動可通行格——路徑會一路走到 reach=0 的校門格，非鋪面（校門本身）不能複製。
    function promote(g, r, c, n) {
        const p = perfect[r][c];
        if (!PASSABLE.has(p.type)) return;
        g[r][c] = cellStage(p.type) > n ? { type: 'wood_path', elevation: p.elevation } : p;
    }
    let r = best.r, c = best.c;
    let guard = gridRows * gridCols;
    while (reachPerfect[r][c] > 0 && guard-- > 0) {
        promote(g, r, c, repairBuilding.stageN);
        let moved = false;
        for (const [dr, dc] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
            const nr = r + dr, nc = c + dc;
            if (nr < 0 || nc < 0 || nr >= gridRows || nc >= gridCols) continue;
            if (reachPerfect[nr][nc] === reachPerfect[r][c] - 1 && canStep(perfect, r, c, nr, nc)) {
                r = nr; c = nc; moved = true; break;
            }
        }
        if (!moved) break;
    }
    promote(g, r, c, repairBuilding.stageN);   // 校門那一格也補上（迴圈在 dist===0 時提前跳出）
    return true;
}

function repairStage(g, n) {
    repairBuilding.stageN = n;
    for (let round = 0; round < 40; round++) {
        const bl = blockedBuildings(g);
        if (!bl || bl.count === 0) return bl;
        let any = false;
        for (const b of bl.blocks) any = repairBuilding(g, b.cells) || any;
        if (!any) return bl;   // 修不動了，回報現況讓人工介入
    }
    return blockedBuildings(g);
}

/* 鋪面的解鎖階段：stages.js 把地形筆刷全記成 1，但攻略頁的解鎖階梯是
   走廊最初就有 → 道路發展學園(2) → 草地有望學園(3) → 水泥地超大型(3)。
   快照要照這個階梯，否則第 1 階的圖會出現實機還鋪不出來的鋪面。
   （不直接改 stages.js：design2 拿它做街廓階段偏好，動了會牽動產生器。） */
const PAVE_STAGE = {
    wood_path: 1, aze_path: 1, asphalt: 2, grass: 3, concrete: 3,
    // 校門配額每升一階學園規模 +1：開局那座在起始地形裡，加開的第二座要等發展學園
    gate: 2, gate_h: 2
};
function cellStage(t) { return PAVE_STAGE[t] !== undefined ? PAVE_STAGE[t] : S.itemStage(t); }

/* 遞延表：某一階修不到路的建築，順延到下一階再蓋（頁面照實寫「這幾棟等下一階」）。 */
const deferred = new Map();   // 'r,c' → 最早可蓋的階
function stageGrid(n) {
    const g = [];
    for (let r = 0; r < gridRows; r++) {
        const row = [];
        for (let c = 0; c < gridCols; c++) {
            const p = perfect[r][c];
            const s = starting[r][c] || { type: 'empty', elevation: 1 };
            // 起始地形本來就有的內容不受解鎖階段限制（原生道路/草地/建築）
            if (p.type === s.type) { row.push(p); continue; }
            const okStage = cellStage(p.type) <= n && (deferred.get(r + ',' + c) || 0) <= n;
            row.push(okStage ? p : { type: s.type, elevation: p.elevation });
        }
        g.push(row);
    }
    return g;
}

/* ---- 統計（--stats 印完整報表，供分階段頁面撰寫） ------------------------- */
const STATS = process.argv.includes('--stats');

// db 的設置費/維持費（設施名去掉 emoji 前綴 ↔ sim item name）
const dbSrc = fs.readFileSync(path.join(ROOT, 'kairosoft', 'school2', 'db', 'data.js'), 'utf8');
const sandbox = { window: {} };
new Function('window', dbSrc)(sandbox.window);
const facRows = sandbox.window.GAME_DB.categories.find(c => c.key === 'facilities').rows;
const COST = {};   // name → { build, upkeep }
for (const row of facRows) {
    const name = row[0].replace(/^[^一-鿿]+/, '').trim();
    const build = parseInt(String(row[6]).replace(/,/g, ''), 10);
    const upkeep = parseInt(String(row[7]).replace(/,/g, ''), 10);
    COST[name] = { build: isNaN(build) ? 0 : build, upkeep: isNaN(upkeep) ? 0 : upkeep };
}
function costOf(t) {
    const it = E.items[t];
    return (it && COST[it.name]) || { build: 0, upkeep: 0 };
}
function parseBonus(s) {
    let sum = 0;
    for (const m of String(s).matchAll(/\+(\d+)/g)) sum += +m[1];
    return sum;
}
// 逐棟清點：格數 ÷ (w×h)（footprint 完整性由 verify 把關，這裡直接換算）
function countUnits(g) {
    const cells = new Map();
    for (let r = 0; r < gridRows; r++) for (let c = 0; c < gridCols; c++) {
        const t = g[r][c].type;
        if (E.isBuildingType(t)) cells.set(t, (cells.get(t) || 0) + 1);
    }
    const out = new Map();
    for (const [t, n] of cells) {
        const it = E.items[t];
        out.set(t, Math.round(n / ((it.w || 1) * (it.h || 1))));
    }
    return out;
}
function countPave(g) {
    const out = {};
    for (let r = 0; r < gridRows; r++) for (let c = 0; c < gridCols; c++) {
        const t = g[r][c].type;
        if (PASSABLE.has(t)) out[t] = (out[t] || 0) + 1;
    }
    return out;
}

const results = [];
let allOk = true;
let prevGrid = starting.map(row => row.map(c => ({ type: c.type, elevation: c.elevation })));
for (const n of [1, 2, 3, 4]) {
    let g, before = null, blocked = null;
    if (n < 4) {
        g = stageGrid(n);
        before = blockedBuildings(g);
        blocked = repairStage(g, n);
        // 這一階修不到路的建築／孤立的鋪面 → 順延到下一階，重建網格再修（最多迭代 6 輪）
        for (let iter = 0; iter < 6; iter++) {
            let changed = false;
            if (blocked && blocked.count > 0) {
                const names = [];
                for (const b of blocked.blocks) {
                    for (const [r, c] of b.cells) deferred.set(r + ',' + c, n + 1);
                    names.push(E.items[b.type].name + '@X' + E.gameX(b.cells[0][0]) + '/Y' + E.gameY(b.cells[0][1]));
                }
                console.log(`  第 ${n} 階接不到路，順延下一階：` + names.join('、'));
                changed = true;
            }
            const reach = computeReachability(g);
            const iso = [];
            for (let r = 0; r < gridRows; r++) for (let c = 0; c < gridCols; c++) {
                if (PASSABLE.has(g[r][c].type) && (!reach || reach[r][c] < 0) &&
                    g[r][c].type !== (starting[r][c] || {}).type) iso.push([r, c]);
            }
            if (iso.length) {
                for (const [r, c] of iso) deferred.set(r + ',' + c, n + 1);
                console.log(`  第 ${n} 階孤立鋪面 ${iso.length} 格順延下一階`);
                changed = true;
            }
            if (!changed) break;
            g = stageGrid(n);
            blocked = repairStage(g, n);
        }
    } else {
        g = perfect;
        blocked = blockedBuildings(g);
    }
    const code = n === 4 ? perfectCode : encodeMap(g);
    const ok = !blocked || blocked.count === 0;
    if (!ok) allOk = false;
    // 逐階統計
    const spots = E.activeSpots(g);
    const bonus = [...spots].reduce((s, id) => {
        const sp = E.SPOTS.find(x => x.id === id);
        return s + (sp ? parseBonus(sp.bonus) : 0);
    }, 0);
    const units = countUnits(g);
    const prevUnits = countUnits(prevGrid);
    const added = [];
    let buildCost = 0;
    for (const [t, cnt] of units) {
        const diff = cnt - (prevUnits.get(t) || 0);
        if (diff > 0) { added.push(E.items[t].name + '×' + diff); buildCost += costOf(t).build * diff; }
    }
    // 新增鋪面（格）
    const pv = countPave(g), pvPrev = countPave(prevGrid);
    for (const t of Object.keys(pv)) {
        const diff = pv[t] - (pvPrev[t] || 0);
        if (diff > 0) buildCost += costOf(t).build * diff;
    }
    let upkeep = 0;
    for (const [t, cnt] of units) upkeep += costOf(t).upkeep * cnt;
    let totalUnits = 0; for (const cnt of units.values()) totalUnits += cnt;
    results.push({ n, code, blocked, spots: [...spots], bonus, totalUnits, added, buildCost, upkeep, pave: pv });
    console.log(`第 ${n} 階：${code.length} 字元，被包圍 ${before ? before.count : '-'} → ${blocked ? blocked.count : 0} 棟｜` +
        `景點 ${spots.size}｜加成 ${bonus}｜棟數 ${totalUnits}｜本階建置 ${buildCost.toLocaleString()} G｜月維持 ${upkeep.toLocaleString()} G` +
        (ok ? '' : '  ⚠ 仍卡住：' + blocked.blocks.map(b => b.type).join('、')));
    prevGrid = g;
}

if (!allOk) { console.log('\n有階段出現被包圍的建築，需要人工介入。'); process.exit(1); }

if (STATS) {
    for (const r of results) {
        console.log(`\n===== 第 ${r.n} 階 =====`);
        console.log('景點：' + r.spots.map(id => E.SPOTS.find(x => x.id === id).name).join('、'));
        console.log('本階新增：' + (r.added.join('、') || '（無）'));
        console.log('鋪面：' + Object.entries(r.pave).map(([t, n2]) => E.items[t].name + ' ' + n2).join('／'));
        console.log('分享碼：' + r.code);
    }
}
