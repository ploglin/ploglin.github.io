/* 健康鎮完美佈局 — 最終版：景點骨架 → 分區填充 → 綠化 → 真實邏輯驗證 → 分享碼 */
const E = require('./engine.js');
const D = require('./design2.js');
const { items, SPOTS, gridRows, gridCols } = E;

/* 1) 景點骨架（大型／稀有設施先卡位） */
const rarity = {};
SPOTS.forEach(s => s.req.forEach(gr => (Array.isArray(gr) ? gr : [gr]).forEach(t => rarity[t] = (rarity[t] || 0) + 1)));
const cost = s => s.req.reduce((n, gr) => {
    const o = Array.isArray(gr) ? gr : [gr];
    const [w, h] = D.sizeOf(o[0]);
    return n + w * h * 3 - Math.max(...o.map(t => rarity[t] || 1));
}, 0);
const res = D.build(SPOTS.slice().sort((a, b) => cost(b) - cost(a)), {
    // 全校唯一的校長室：蓋在既有辦公室（r16-17,c6-7）左側，讓「選舉」「學習」都能用同一間
    preplace: [{ t: 'principal', r: 16, c: 5 }]
});
const g = res.g;

/* 1b) 後援：街廓排不下的景點（例如「選舉」要跟全校唯一的辦公室同框），
       改用滑動 4×4 窗口補位。可覆蓋純裝飾地形，但不動道路、水塘與既有建築。 */
const DECOR = new Set(['rock', 'special_tree', 'azalea', 'pine', 'flower', 'grass', 'woods']);
const modifiable = (r, c) => g[r][c].elevation === 1 && (g[r][c].type === 'empty' || DECOR.has(g[r][c].type));

function fallback(spot) {
    let best = null;
    for (let wr = 0; wr <= gridRows - 4; wr++) for (let wc = 0; wc <= gridCols - 4; wc++) {
        const have = D.typesInWindow(g, wr, wc);
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
                    let fits = true, served = false;
                    for (let dr = 0; dr < h && fits; dr++) for (let dc = 0; dc < w && fits; dc++) {
                        const k = (r + dr) + ',' + (c + dc);
                        if (used.has(k) || !modifiable(r + dr, c + dc)) fits = false;
                    }
                    if (!fits) continue;
                    // 整棟至少一格臨接「可通行且走得到」的地形
                    for (let dr = 0; dr < h; dr++) for (let dc = 0; dc < w; dc++)
                        for (const [ar, ac] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
                            const nr = r + dr + ar, nc = c + dc + ac;
                            if (nr < 0 || nr >= gridRows || nc < 0 || nc >= gridCols) continue;
                            if (nr >= r && nr < r + h && nc >= c && nc < c + w) continue;
                            if (used.has(nr + ',' + nc)) continue;
                            if (E.PASSABLE.has(g[nr][nc].type)) served = true;
                        }
                    if (!served) continue;
                    for (let dr = 0; dr < h; dr++) for (let dc = 0; dc < w; dc++) used.add((r + dr) + ',' + (c + dc));
                    plan.push({ t, slot: { r, c, w, h } }); done = true;
                }
                if (done) break;
            }
            if (!done) { ok = false; break; }
        }
        if (!ok) continue;
        const cells = plan.reduce((n, x) => n + x.slot.w * x.slot.h, 0);
        if (!best || cells < best.cells) best = { cells, plan };
    }
    if (!best) return false;
    best.plan.forEach(x => D.place(g, x.slot, x.t));
    // 佔用到的格子從街廓 free 名單移除，避免後面填充覆蓋
    res.freeSets.forEach(fs => best.plan.forEach(x => {
        for (let dr = 0; dr < x.slot.h; dr++) for (let dc = 0; dc < x.slot.w; dc++)
            fs.delete((x.slot.r + dr) + ',' + (x.slot.c + dc));
    }));
    return true;
}
SPOTS.filter(s => !E.activeSpots(g).has(s.id)).forEach(s => {
    if (!fallback(s)) console.log('！補位失敗：', s.name);
});

/* 2) 分區填充：key = 'r0,c0' */
/* 教室：三個年級各 3 間，共 9 間（含健康鎮原本就有的那間舊校舍）。
   辦公室：原有 1 間 ＋ 新建 1 間 = 2 間。
   decor:true 表示該街廓可覆蓋草地／花壇等純裝飾地形來騰出教室空間
   （覆蓋前會檢查不會弄壞任何已成立的景點）。 */
const ZONES = {
    '11,10': { name: '3年級棟', fac: ['class', 'class'], green: 'flower', decor: true },          // ＋原有舊校舍 1 間 = 3 間
    '11,15': { name: '1年級棟', fac: ['class', 'class', 'class', 'office'], green: 'flower', decor: true },
    '16,15': { name: '2年級棟', fac: ['class', 'class', 'class', 'toilet', 'water', 'locker', 'vending'], green: 'flower', decor: true },
    '16,10': { name: '生活機能', fac: ['broadcast', 'game_corner', 'bench', 'career', 'multi_room'], green: 'grass' },
    '16,0': { name: '校門廣場', fac: ['board', 'bench', 'statue_br'], green: 'flower' },
    '21,0': { name: '農牧園區', fac: ['farm', 'chicken', 'pig', 'cow', 'rabbit', 'duck'], green: 'grass' },
    '21,5': { name: '農牧園區', fac: ['farm', 'mole', 'panda', 'koala', 'croc', 'duck'], green: 'grass' },
    '21,10': { name: '運動園區', fac: ['field', 'baseball', 'soccer', 'tennis', 'basketball', 'pool'], green: 'grass' },
    '21,15': { name: '運動園區', fac: ['gym', 'dojo', 'trampoline', 'club', 'field', 'locker'], green: 'grass' },
    '21,20': { name: '展望綠地', fac: ['bench', 'statue_br'], green: 'sakura' },
    '11,20': { name: '展望綠地', fac: [], green: 'sakura' }
};
const DEFAULT_GREEN = 'grass';

function fill() {
    res.ps.forEach((p, i) => {
        const z = ZONES[p.r0 + ',' + p.c0] || { fac: [], green: DEFAULT_GREEN };
        const free = res.freeSets[i], served = res.servedSets[i];
        // 2a) 建築：只放在臨路格，依區域主題輪流
        const reach = E.computeReachability(g);
        const usable = (r, c) => free.has(r + ',' + c) ||
            (z.decor && g[r][c].elevation === 1 && DECOR.has(g[r][c].type));
        // 整棟至少一格臨接「街廓外、走得到的通行地形」
        const servedAt = (r, c, w, h) => {
            for (let dr = 0; dr < h; dr++) for (let dc = 0; dc < w; dc++)
                for (const [ar, ac] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
                    const nr = r + dr + ar, nc = c + dc + ac;
                    if (nr < 0 || nr >= gridRows || nc < 0 || nc >= gridCols) continue;
                    if (nr >= r && nr < r + h && nc >= c && nc < c + w) continue;
                    if (E.PASSABLE.has(g[nr][nc].type) && reach && reach[nr][nc] >= 0) return true;
                }
            return false;
        };
        for (const t of z.fac) {
            const [w, h] = D.sizeOf(t);
            // 收集所有放得下的位置，逐一嘗試（被守衛擋下就換下一個，不要直接放棄）
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
            cands.sort((a, b) => cost(a) - cost(b));
            function cost(s) {
                let n = 0;
                for (let dr = 0; dr < s.h; dr++) for (let dc = 0; dc < s.w; dc++)
                    if (!free.has((s.r + dr) + ',' + (s.c + dc))) n++;
                return n;
            }
            let placed = false;
            for (const slot of cands) {
                const snap = [];
                for (let dr = 0; dr < slot.h; dr++) for (let dc = 0; dc < slot.w; dc++) {
                    const cell = g[slot.r + dr][slot.c + dc];
                    snap.push([slot.r + dr, slot.c + dc, cell.type, cell.elevation]);
                }
                const before = { spots: E.activeSpots(g).size, blocked: E.blockedBuildings(g).count };
                D.place(g, slot, t);
                const after = { spots: E.activeSpots(g).size, blocked: E.blockedBuildings(g).count };
                if (after.spots < before.spots || after.blocked > before.blocked) {
                    snap.forEach(([r, c, ty, el]) => { g[r][c] = { type: ty, elevation: el }; });
                    continue;   // 換一個位置再試
                }
                for (let dr = 0; dr < slot.h; dr++) for (let dc = 0; dc < slot.w; dc++)
                    free.delete((slot.r + dr) + ',' + (slot.c + dc));
                placed = true; break;
            }
            if (!placed) console.log('！' + z.name + '：' + items[t].name + ' 無處可放（' + cands.length + ' 個位置都會破壞景點或動線）');
        }
        // 2b) 綠化：剩下的街廓空地。花壇／櫻花樹不是可通行地形，
        //     若擺下去會把某棟建築圍死，就改鋪草地（草地可通行）。
        [...free].forEach(key => {
            const [r, c] = key.split(',').map(Number);
            const before = E.blockedBuildings(g).count;
            g[r][c] = { type: z.green, elevation: 1 };
            if (E.blockedBuildings(g).count > before) g[r][c] = { type: 'grass', elevation: 1 };
        });
        free.clear();
    });

    // 2c) 街廓外的死角空地（走不到的口袋）→ 綠化，讓地圖看起來是刻意留白
    const reach = E.computeReachability(g);
    for (let r = 0; r < gridRows; r++) for (let c = 0; c < gridCols; c++) {
        if (g[r][c].type !== 'empty' || g[r][c].elevation !== 1) continue;
        if (reach && reach[r][c] >= 0) continue;
        g[r][c] = { type: 'woods', elevation: 1 };
    }
}
fill();

/* 2d) 第二座校門：校門可以開在地圖任一邊，多開一座能縮短南區的動線。
       gate_h 是「上下用」的 2×1 版本，開在南側邊界接上 Y11 街道。 */
function addGate(r, c, t) {
    const [w, h] = D.sizeOf(t);
    for (let dr = 0; dr < h; dr++) for (let dc = 0; dc < w; dc++)
        if (g[r + dr][c + dc].type !== 'empty') return false;
    const before = { spots: E.activeSpots(g).size, blocked: E.blockedBuildings(g).count };
    D.place(g, { r, c, w, h }, t);
    const after = { spots: E.activeSpots(g).size, blocked: E.blockedBuildings(g).count };
    if (after.spots < before.spots || after.blocked > before.blocked) {
        for (let dr = 0; dr < h; dr++) for (let dc = 0; dc < w; dc++)
            g[r + dr][c + dc] = { type: 'empty', elevation: 1 };
        console.log('！第二座校門放不下 (' + r + ',' + c + ')');
        return false;
    }
    return true;
}
addGate(25, 13, 'gate_h');

/* 2e) 高地開發：高地一樣可以蓋建築，只有「斜坡」不行（斜坡是高低差自動
       生成的地形，一旦蓋東西上去就不再是斜坡、也就上不去了）。
       作法：每一列高地的最外側留作步道（接上斜坡坡道），中間才蓋設施。 */
const PLATEAU_ZONES = [
    { name: '北高地花園', rows: [0, 4], cols: [3, 10], fac: ['tea_room', 'bench', 'statue_br', 'board', 'toilet', 'vending'], green: 'sakura' },
    // 注意:高地填充器只會放 1×1(逐格),多格設施(網球場/籃球場 1×2)不能進這份清單
    { name: '東高地園區', rows: [10, 22], cols: [19, 23], fac: ['pool', 'gym', 'dojo', 'club', 'locker', 'water', 'toilet', 'bench', 'giraffe', 'elephant', 'rabbit', 'statue_br'], green: 'grass' }
];

function fillPlateau() {
    PLATEAU_ZONES.forEach(z => {
        // 這一區裡「高地、空著、而且不是斜坡」的格＝可利用
        const rowsOf = {};
        for (let r = z.rows[0]; r <= z.rows[1]; r++) for (let c = z.cols[0]; c <= z.cols[1]; c++) {
            const cell = g[r][c];
            if (cell.elevation < 2 || cell.type !== 'empty' || E.isSlopeIn(g, r, c)) continue;
            (rowsOf[r] = rowsOf[r] || []).push(c);
        }
        // 每列最外側兩格鋪成高地步道，中間留給設施
        const slots = [];
        Object.keys(rowsOf).forEach(rk => {
            const r = Number(rk), cs = rowsOf[rk].sort((a, b) => a - b);
            const walk = new Set([cs[0], cs[cs.length - 1]]);
            cs.forEach(c => {
                if (walk.has(c)) g[r][c] = { type: 'wood_path', elevation: g[r][c].elevation };
                else slots.push([r, c]);
            });
        });
        // 設施逐一放上去，每放一次都檢查景點數與被包圍數沒有變差
        let i = 0, placed = 0;
        for (const [r, c] of slots) {
            if (g[r][c].type !== 'empty') continue;
            const t = z.fac[i % z.fac.length];
            if ((items[t].w || 1) * (items[t].h || 1) > 1) { i++; continue; }  // 多格設施不逐格放
            const before = { spots: E.activeSpots(g).size, blocked: E.blockedBuildings(g).count };
            D.place(g, { r, c, w: 1, h: 1 }, t);
            const after = { spots: E.activeSpots(g).size, blocked: E.blockedBuildings(g).count };
            if (after.spots < before.spots || after.blocked > before.blocked) {
                // 放不了就種樹／鋪草；但櫻花樹之類也不可通行，會圍死人，那就乾脆留空
                g[r][c] = { type: z.green, elevation: g[r][c].elevation };
                if (E.blockedBuildings(g).count > before.blocked)
                    g[r][c] = { type: 'empty', elevation: g[r][c].elevation };
            } else { i++; placed++; }
        }
        console.log('  ' + z.name + '：步道外的 ' + slots.length + ' 格中放了 ' + placed + ' 棟設施');
    });
}
fillPlateau();

/* 3) 驗證（全部走模擬器的真實邏輯） */
const active = E.activeSpots(g);
const blocked = E.blockedBuildings(g);
const missing = SPOTS.filter(s => !active.has(s.id));

const counts = {};
g.flat().forEach(c => { if (c.type !== 'empty') counts[c.type] = (counts[c.type] || 0) + 1; });
const facCount = Object.entries(counts).filter(([t]) => E.isBuildingType(t))
    .reduce((n, [t, v]) => n + v / ((items[t].w || 1) * (items[t].h || 1)), 0);

console.log('=== 健康鎮完美佈局 驗證報告 ===');
console.log('成立人氣景點：', active.size, '/', SPOTS.length);
console.log('未成立：', missing.map(s => s.name).join('、') || '（無）');
console.log('被包圍（走不到）的建築：', blocked.count);
console.log('建築棟數（含既有校舍）：', Math.round(facCount));
const reach2 = E.computeReachability(g);
let unreach = 0;
for (let r = 0; r < gridRows; r++) for (let c = 0; c < gridCols; c++)
    if (E.PASSABLE.has(g[r][c].type) && reach2[r][c] < 0) unreach++;
console.log('走不到的通行格：', unreach);

/* 4) 分享碼 + 往返驗證 */
const code = E.encodeMap(g);
const TYPE_KEYS = E.TYPE_KEYS;
function decodeMap(codeStr) {
    const str = Buffer.from(codeStr.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('binary');
    const cells = [];
    for (const p of str.split(',')) {
        const [t, e, n] = p.split('.').map(Number);
        for (let k = 0; k < n; k++) cells.push({ type: TYPE_KEYS[t] || 'empty', elevation: e || 1 });
    }
    if (cells.length !== gridRows * gridCols) return null;
    const grid = [];
    for (let r = 0; r < gridRows; r++) grid.push(cells.slice(r * gridCols, (r + 1) * gridCols));
    return grid;
}
const back = decodeMap(code);
const same = back && JSON.stringify(back) === JSON.stringify(g.map(r => r.map(c => ({ type: c.type, elevation: c.elevation }))));
console.log('分享碼往返一致：', same ? 'PASS' : 'FAIL');
console.log('分享碼長度：', code.length);
require('fs').writeFileSync('code.txt', code);

/* 5) 地圖預覽 + 設施清單 */
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
console.log('\n    ' + Array.from({ length: 24 }, (_, c) => c % 10).join(''));
g.forEach((row, r) => console.log(String(r).padStart(2) + ': ' + row.map(sym).join('')));

console.log('\n=== 設施統計 ===');
Object.entries(counts).sort((a, b) => b[1] - a[1]).forEach(([t, n]) => {
    const it = items[t]; const sz = (it.w || 1) * (it.h || 1);
    console.log(it.name + ' ×' + (n / sz) + (sz > 1 ? ' (' + (it.w || 1) + '×' + (it.h || 1) + ')' : ''));
});
