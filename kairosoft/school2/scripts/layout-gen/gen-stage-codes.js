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
    let r = best.r, c = best.c;
    let guard = gridRows * gridCols;
    while (reachPerfect[r][c] > 0 && guard-- > 0) {
        g[r][c] = perfect[r][c];
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
    g[r][c] = perfect[r][c];   // 校門那一格也補上（迴圈條件在 dist===0 時提前跳出）
    return true;
}

function repairStage(g) {
    for (let round = 0; round < 40; round++) {
        const bl = blockedBuildings(g);
        if (!bl || bl.count === 0) return bl;
        let any = false;
        for (const b of bl.blocks) any = repairBuilding(g, b.cells) || any;
        if (!any) return bl;   // 修不動了，回報現況讓人工介入
    }
    return blockedBuildings(g);
}

function stageGrid(n) {
    const g = [];
    for (let r = 0; r < gridRows; r++) {
        const row = [];
        for (let c = 0; c < gridCols; c++) {
            const p = perfect[r][c];
            row.push(S.itemStage(p.type) <= n ? p : (starting[r][c] || { type: 'empty', elevation: 1 }));
        }
        g.push(row);
    }
    return g;
}

const results = [];
let allOk = true;
for (const n of [1, 2, 3]) {
    const g = stageGrid(n);
    const before = blockedBuildings(g);
    const blocked = repairStage(g);
    const code = encodeMap(g);
    const ok = !blocked || blocked.count === 0;
    if (!ok) allOk = false;
    results.push({ n, code, blocked });
    console.log(`第 ${n} 階：${code.length} 字元，被包圍建築 ${before ? before.count : 0} → 修復後 ${blocked ? blocked.count : 0} 棟` +
        (ok ? '' : '  ⚠ 仍卡住：' + blocked.blocks.map(b => b.type).join('、')));
}
console.log(`\n第 4 階＝完美佈局本身：${perfectCode.length} 字元（沿用 ${CODE_FILE}，不重算）`);

if (!allOk) {
    console.log('\n有階段出現被包圍的建築，需要人工在該城鎮的 stages 頁補「提前鋪面」規則後再 --write。');
    process.exit(1);
}
console.log('\n三階皆 0 被包圍建築。');

if (WRITE) {
    console.log('\n--write 目前只印出來，尚未接上頁面蓋章（見 README 待辦）。');
    results.forEach(r => console.log(`stage ${r.n}: ${r.code}`));
}
