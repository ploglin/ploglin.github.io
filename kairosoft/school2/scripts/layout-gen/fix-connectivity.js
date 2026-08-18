/* 直接在完美佈局的分享碼上「補鋪面」，修好 2026-08-11 移動規則變更（engine.js:26-29，
   學生只走鋪好的四種路面）留下的被包圍建築——比照湖岸第一輪的做法（手動改 code-lake.txt
   補 32 格鋪面），只加鋪面、不搬動任何既有建築，所以景點組合／棟數／分區配置全部不變。

   演算法：對每一棟被包圍的建築，在整張圖上找一條「代價最低」的路徑接到已經連通校門的
   路網——已經是可通行鋪面的格子代價 0，「可以鋪成走廊但目前還沒鋪」的空地/裝飾格代價 1，
   建築與水面代價無限（不可能鋪）。用 0-1 BFS 找最短路徑，把路徑上代價 1 的格子鋪成
   wood_path，其餘什麼都不動。反覆到 0 棟被包圍或修不動為止。

   用法：node fix-connectivity.js health          → 只跑、印出會補幾格在哪裡，不寫檔
         node fix-connectivity.js health --write   → 驗證後把結果寫回 code.txt
*/
const fs = require('fs');
const path = require('path');

const townKey = (process.argv[2] || 'health').replace(/^--?/, '');
const WRITE = process.argv.includes('--write');

require('./towns.js').select(townKey);
const E = require('./engine.js');
const { town, gridRows, gridCols, decodeMap, encodeMap, blockedBuildings, isBuildingType, PASSABLE, canStep, gameX, gameY } = E;

const CODE_FILE = { health: 'code.txt', east: 'code-east.txt', hill: 'code-hill.txt', valley: 'code-valley.txt', lake: 'code-lake.txt' }[townKey];
const codeFilePath = path.join(__dirname, CODE_FILE);
const original = fs.readFileSync(codeFilePath, 'utf8').trim();
const decoded = decodeMap(original);
if (!decoded || decoded.rows !== gridRows || decoded.cols !== gridCols) throw new Error(CODE_FILE + ' 解碼失敗或尺寸不符');
const g = decoded.grid;

/* 「可以鋪成走廊」的格子：不是建築、不是水面，而且目前不是已可通行的鋪面
   （已可通行的不必花代價）。裝飾地形（樹木/花壇/巨石/竹林等）可以被鋪面覆蓋——
   跟 builder.js 既有 pass 對「非建築、非水面地形」的處理假設一致。 */
const baseTerrain = E.loadTerrain();

/* 斜坡轉角是「連鋪面都不准放」的死格，Infinity（繞不過就報錯，不硬鋪）。
   來源＝engine.isSlopeCorner（湖岸驗證過的凸角規則）＋ towns.js 的 terrainOverride
   （實機逐格核對：corners 補引擎認不出的凹角/樞紐格、slopes 剔除引擎的邊界誤判）。 */
const ov = town.terrainOverride || {};
const ovKey = ([x, y]) => (x - 2) + ',' + (gridCols + 1 - y);
const banned = new Set((ov.corners || []).map(ovKey));
for (let r = 0; r < gridRows; r++) for (let c = 0; c < gridCols; c++) {
    if (E.isSlopeCorner(baseTerrain, r, c)) banned.add(r + ',' + c);
}
for (const k of (ov.slopes || []).map(ovKey)) banned.delete(k);

function paveCost(cell, r, c) {
    if (banned.has(r + ',' + c)) return Infinity;
    if (isBuildingType(cell.type)) return Infinity;
    if (cell.type === 'pond' || cell.type === 'lake') return Infinity;
    if (PASSABLE.has(cell.type)) return 0;
    // 空地成本 1；裝飾地形（樹林/櫻花/花壇等可能是景點材料）成本 5——
    // 能繞就繞，真的沒路才鋪掉，最後有景點守衛把關。
    return cell.type === 'empty' ? 1 : 5;
}

function repairOne(cells) {
    // 權重有 0/1/CORNER_PENALTY 三種，用簡單 Dijkstra（線性掃描取最小值——
    // 格數 <1000，O(V^2) 完全夠快，不必上堆積）。
    const dist = Array.from({ length: gridRows }, () => Array(gridCols).fill(Infinity));
    const prev = Array.from({ length: gridRows }, () => Array(gridCols).fill(null));
    const done = Array.from({ length: gridRows }, () => Array(gridCols).fill(false));
    const inCells = new Set(cells.map(([r, c]) => r + ',' + c));
    for (const [r, c] of cells) dist[r][c] = 0;
    let goal = null;
    for (let iter = 0; iter < gridRows * gridCols; iter++) {
        let br = -1, bc = -1, bd = Infinity;
        for (let r = 0; r < gridRows; r++) for (let c = 0; c < gridCols; c++) {
            if (!done[r][c] && dist[r][c] < bd) { bd = dist[r][c]; br = r; bc = c; }
        }
        if (br < 0) break;
        done[br][bc] = true;
        const r = br, c = bc;
        // 終點：已連上路網的鋪面格，或「貼著校門的可鋪格」——校門本身不可通行，
        // 但 computeReachability 以校門為源頭，鋪到門口那一格就等於接上路網。
        const nearGate = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dr, dc]) => {
            const nr = r + dr, nc = c + dc;
            if (nr < 0 || nc < 0 || nr >= gridRows || nc >= gridCols) return false;
            const t = g[nr][nc].type;
            return t === 'gate' || t === 'gate_h';
        });
        if (!inCells.has(r + ',' + c) &&
            ((PASSABLE.has(g[r][c].type) && reach[r][c] >= 0) ||
                (nearGate && paveCost(g[r][c], r, c) < Infinity))) {
            goal = [r, c]; break;
        }
        for (const [dr, dc] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
            const nr = r + dr, nc = c + dc;
            if (nr < 0 || nc < 0 || nr >= gridRows || nc >= gridCols || done[nr][nc]) continue;
            if (inCells.has(nr + ',' + nc)) continue; // 建築內部不當通路
            // 高低差：只有原本地形上「isSlopeIn 允許」的一階差可以走，其餘一律不可跨
            const a = g[r][c], b = g[nr][nc];
            if (a.elevation !== b.elevation) {
                const diff = Math.abs(a.elevation - b.elevation);
                if (diff !== 1) continue;
                const hi = a.elevation > b.elevation ? [r, c] : [nr, nc];
                if (!E.isSlopeIn(g, hi[0], hi[1])) continue;
            }
            const w = paveCost(b, nr, nc);
            if (w === Infinity) continue;
            const nd = dist[r][c] + w;
            if (nd < dist[nr][nc]) { dist[nr][nc] = nd; prev[nr][nc] = [r, c]; }
        }
    }
    if (!goal) return false;
    // 沿 prev 往回走，把代價 1（目前非鋪面）的格子鋪成 wood_path
    let cur = goal;
    let paved = 0;
    while (cur && !inCells.has(cur[0] + ',' + cur[1])) {
        const [r, c] = cur;
        if (!PASSABLE.has(g[r][c].type) && !isBuildingType(g[r][c].type) && g[r][c].type !== 'pond' && g[r][c].type !== 'lake') {
            g[r][c] = { type: 'wood_path', elevation: g[r][c].elevation };
            paved++;
        }
        cur = prev[r][c];
    }
    return paved > 0 || true;
}

let reach = null;
function recomputeReach() { reach = E.computeReachability(g); }

/* 孤立鋪面島：可通行但從校門走不到的連通群。verify 要求 0 孤立格，
   而建築的門面常常只貼著這些島——先把島接回網，建築自然就通了。 */
function isolatedIslands() {
    const seen = new Set();
    const groups = [];
    for (let r = 0; r < gridRows; r++) for (let c = 0; c < gridCols; c++) {
        if (!PASSABLE.has(g[r][c].type) || reach[r][c] >= 0 || seen.has(r + ',' + c)) continue;
        const grp = []; const st = [[r, c]]; seen.add(r + ',' + c);
        while (st.length) {
            const [cr, cc] = st.pop(); grp.push([cr, cc]);
            for (const [dr, dc] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
                const nr = cr + dr, nc = cc + dc;
                if (nr < 0 || nc < 0 || nr >= gridRows || nc >= gridCols || seen.has(nr + ',' + nc)) continue;
                if (!PASSABLE.has(g[nr][nc].type)) continue;
                if (!canStep(g, cr, cc, nr, nc)) continue;
                seen.add(nr + ',' + nc); st.push([nr, nc]);
            }
        }
        groups.push(grp);
    }
    return groups;
}

/* 把一座孤島接回網：跟 repairOne 同一套 Dijkstra，起點是整座島（w=0 內部通行）。 */
function connectIsland(cells) {
    const dist = Array.from({ length: gridRows }, () => Array(gridCols).fill(Infinity));
    const prev = Array.from({ length: gridRows }, () => Array(gridCols).fill(null));
    const done = Array.from({ length: gridRows }, () => Array(gridCols).fill(false));
    for (const [r, c] of cells) dist[r][c] = 0;
    let goal = null;
    for (let iter = 0; iter < gridRows * gridCols; iter++) {
        let br = -1, bc = -1, bd = Infinity;
        for (let r = 0; r < gridRows; r++) for (let c = 0; c < gridCols; c++) {
            if (!done[r][c] && dist[r][c] < bd) { bd = dist[r][c]; br = r; bc = c; }
        }
        if (br < 0) break;
        done[br][bc] = true;
        const r = br, c = bc;
        const nearGate = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dr, dc]) => {
            const nr = r + dr, nc = c + dc;
            if (nr < 0 || nc < 0 || nr >= gridRows || nc >= gridCols) return false;
            const t = g[nr][nc].type;
            return t === 'gate' || t === 'gate_h';
        });
        if ((PASSABLE.has(g[r][c].type) && reach[r][c] >= 0) ||
            (nearGate && dist[r][c] > 0 && paveCost(g[r][c], r, c) < Infinity)) {
            goal = [r, c]; break;
        }
        for (const [dr, dc] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
            const nr = r + dr, nc = c + dc;
            if (nr < 0 || nc < 0 || nr >= gridRows || nc >= gridCols || done[nr][nc]) continue;
            const a = g[r][c], b = g[nr][nc];
            if (a.elevation !== b.elevation) {
                const diff = Math.abs(a.elevation - b.elevation);
                if (diff !== 1) continue;
                const hi = a.elevation > b.elevation ? [r, c] : [nr, nc];
                if (!E.isSlopeIn(g, hi[0], hi[1])) continue;
            }
            const w = paveCost(b, nr, nc);
            if (w === Infinity) continue;
            const nd = dist[r][c] + w;
            if (nd < dist[nr][nc]) { dist[nr][nc] = nd; prev[nr][nc] = [r, c]; }
        }
    }
    if (!goal) return false;
    let cur = goal, paved = false;
    while (cur) {
        const [r, c] = cur;
        if (!PASSABLE.has(g[r][c].type) && !isBuildingType(g[r][c].type) && g[r][c].type !== 'pond' && g[r][c].type !== 'lake') {
            g[r][c] = { type: 'wood_path', elevation: g[r][c].elevation };
            paved = true;
        }
        cur = prev[r][c];
    }
    return paved;
}

function repairToConvergence() {
    let round = 0;
    recomputeReach();
    let bl = blockedBuildings(g);
    while (round < 200) {
        round++;
        let progressed = false;
        // ㈠ 孤島接網
        recomputeReach();
        for (const grp of isolatedIslands()) {
            if (connectIsland(grp)) { progressed = true; recomputeReach(); }
        }
        // ㈡ 被包圍建築找路
        bl = blockedBuildings(g);
        for (const b of (bl ? bl.blocks : [])) {
            recomputeReach();
            const before = JSON.stringify(g.flat());
            const ok = repairOne(b.cells);
            const after = JSON.stringify(g.flat());
            if (ok && before !== after) progressed = true;
        }
        recomputeReach();
        bl = blockedBuildings(g);
        const iso = isolatedIslands().length;
        if ((!bl || bl.count === 0) && iso === 0) break;
        if (!progressed) break;
    }
    return bl;
}

const origDecoded = decodeMap(original).grid;
let bl = repairToConvergence();

/* 保險絲：banned 名單（轉角）絕不該出現在被改動的格子裡——出現代表上面的邏輯有洞 */
const cornerViolations = [];
for (let r = 0; r < gridRows; r++) for (let c = 0; c < gridCols; c++) {
    if (g[r][c].type !== origDecoded[r][c].type && banned.has(r + ',' + c)) cornerViolations.push([r, c]);
}
if (cornerViolations.length) {
    console.log(`⚠ BUG：${cornerViolations.length} 格禁用轉角被鋪到：` +
        cornerViolations.map(([r, c]) => `X${gameX(r)}/Y${gameY(c)}`).join('、'));
    process.exit(1);
}

// 景點守衛：補鋪面不准弄掉任何景點（鋪掉材料裝飾就會在這裡現形）
{
    const spotsOrig = E.activeSpots(origDecoded).size;
    const spotsNow = E.activeSpots(g).size;
    if (spotsNow < spotsOrig) {
        console.error(`景點從 ${spotsOrig} 掉到 ${spotsNow}，鋪面鋪掉了材料——中止`);
        process.exit(1);
    }
}

// 統計實際跟原圖不同的格子（= 這次補了哪些鋪面）
const pavedLog = [];
for (let r = 0; r < gridRows; r++) for (let c = 0; c < gridCols; c++) {
    if (origDecoded[r][c].type !== g[r][c].type) {
        pavedLog.push(`X${gameX(r)}/Y${gameY(c)}（原 ${origDecoded[r][c].type} → ${g[r][c].type}）`);
    }
}

console.log(`${town.name}：修復前 ${blockedBuildings(origDecoded) ? blockedBuildings(origDecoded).count : '?'} 棟被包圍，修復後 ${bl ? bl.count : 0} 棟`);
console.log(`補了 ${pavedLog.length} 格鋪面：`);
pavedLog.forEach(l => console.log('  ' + l));

if (bl && bl.count > 0) {
    console.log(`\n仍有 ${bl.count} 棟修不動：` + bl.blocks.map(b => b.type).join('、'));
}

const isoReach = (() => {
    // 孤立通行格：可通行但 reach<0
    let n = 0;
    for (let r = 0; r < gridRows; r++) for (let c = 0; c < gridCols; c++) {
        if (PASSABLE.has(g[r][c].type) && reach[r][c] < 0) n++;
    }
    return n;
})();
console.log(`孤立通行格：${isoReach}`);

if (process.env.FIX_DEBUG) {
    fs.writeFileSync(path.join(__dirname, 'code-debug.txt'), encodeMap(g) + '\n');
    console.log('（FIX_DEBUG：中間結果已寫到 code-debug.txt）');
}
if (WRITE) {
    if (bl && bl.count > 0) { console.log('\n還有 FAIL，不寫檔。'); process.exit(1); }
    const newCode = encodeMap(g);
    fs.writeFileSync(codeFilePath, newCode + '\n');
    console.log(`\n已寫回 ${CODE_FILE}（${newCode.length} 字元）。記得跑 gen-assets.js 蓋章、verify.js 收尾。`);
}
