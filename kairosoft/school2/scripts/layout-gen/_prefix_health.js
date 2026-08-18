/* 健康鎮 code.txt 的前置修復（地形修正後的一次性搬遷）：
   ㈠ 全圖高度改成修正後的地形（PRESET_DEFAULT_DATA 正本）
   ㈡ 清掉轉角上的鋪面/裝飾（轉角連鋪面都不能放）
   ㈢ 把壓在轉角/斜坡上的建築搬到最近的合法空格（保證 29 景點不變，否則中止）
   跑完寫回 code.txt；鋪面連通修復交給 fix-connectivity.js。 */
require('./towns.js').select('health');
const E = require('./engine.js');
const fs = require('fs');
const path = require('path');

const CODE = path.join(__dirname, 'code.txt');
const { grid: layout } = E.decodeMap(fs.readFileSync(CODE, 'utf8').trim());
const base = E.loadTerrain();
const { gridRows, gridCols } = E;

const spotsBefore = E.activeSpots(layout).size;

// ㈠ 高度全面對齊修正後的地形
for (let r = 0; r < gridRows; r++) for (let c = 0; c < gridCols; c++) {
    layout[r][c].elevation = base[r][c].elevation;
}

const xy2rc = ([x, y]) => [x - 2, 25 - y];
const CORNERS = [[23, 2], [16, 2], [23, 5], [17, 4], [17, 5], [16, 4], [24, 6], [23, 6], [23, 7], [17, 7], [17, 6], [14, 6], [14, 4], [12, 4], [3, 17], [3, 14], [5, 22], [5, 21], [6, 21], [6, 17]].map(xy2rc);
const SLOPES = [[22, 2], [21, 2], [20, 2], [19, 2], [18, 2], [17, 2], [23, 3], [23, 4], [22, 5], [21, 5], [20, 5], [19, 5], [18, 5], [16, 3], [24, 2], [24, 3], [24, 4], [24, 5], [22, 7], [21, 7], [20, 7], [19, 7], [18, 7], [16, 6], [14, 5], [13, 4], [12, 3], [12, 2]].map(xy2rc);
const cornerSet = new Set(CORNERS.map(([r, c]) => r + ',' + c));
const slopeSet = new Set(SLOPES.map(([r, c]) => r + ',' + c));
// engine 自己判得出來的轉角也併入；但使用者實機確認是「斜坡」的格子
// 優先於演算法推測（引擎的邊界特例會誤判 X12/Y2、X2/Y22、X2/Y14 等格）。
for (let r = 0; r < gridRows; r++) for (let c = 0; c < gridCols; c++) {
    if (E.isSlopeCorner(base, r, c)) cornerSet.add(r + ',' + c);
}
for (const key of slopeSet) cornerSet.delete(key);

// ㈡ 清掉轉角上的鋪面/裝飾
for (const key of cornerSet) {
    const [r, c] = key.split(',').map(Number);
    const t = layout[r][c].type;
    if (t !== 'empty' && !E.isBuildingType(t)) {
        layout[r][c] = { type: 'empty', elevation: base[r][c].elevation };
    }
}

// ㈢-0 指定搬遷：熱血三件套（足球場/體育館/游泳池）連動平移。
//   體育館原本半壓在 Y7 斜坡環帶上（實機蓋不出來），全圖又沒有空的 2×2 落點，
//   唯一解是三座一起重排成 X17-22 × Y10-Y9 的純平地帶（蓋在原有水泥地上）：
//   足球場 X17-18、體育館 X19-20、游泳池 X21-22。「熱血」窗口 X18-21/Y10-Y7
//   同時含到三種型別，景點不掉。
{
    const moves = [
        { t: 'soccer', from: [[16, 15], [16, 16], [17, 15], [17, 16]], to: [[15, 15], [15, 16], [16, 15], [16, 16]] },
        { t: 'gym', from: [[16, 17], [16, 18], [17, 17], [17, 18]], to: [[17, 15], [17, 16], [18, 15], [18, 16]] },
        { t: 'pool', from: [[18, 15], [18, 16], [19, 15], [19, 16]], to: [[19, 15], [19, 16], [20, 15], [20, 16]] }
    ];
    for (const m of moves) for (const [r, c] of m.from) {
        if (layout[r][c].type !== m.t) { console.error(`指定搬遷來源不符：(${r},${c}) 是 ${layout[r][c].type} 不是 ${m.t}`); process.exit(1); }
        layout[r][c] = { type: 'empty', elevation: base[r][c].elevation };
    }
    for (const m of moves) for (const [r, c] of m.to) {
        if (E.isBuildingType(layout[r][c].type)) { console.error(`指定搬遷落點被佔用：(${r},${c}) 是 ${layout[r][c].type}`); process.exit(1); }
        layout[r][c] = { type: m.t, elevation: base[r][c].elevation };
    }
    console.log('熱血三件套已重排：足球場 X17-18/Y10-Y9、體育館 X19-20/Y10-Y9、游泳池 X21-22/Y10-Y9');
}

// ㈢ 搬遷壓在轉角/斜坡上的建築
function noBuild(r, c) {
    const key = r + ',' + c;
    if (cornerSet.has(key) || slopeSet.has(key)) return true;
    if (E.isSlopeIn(base, r, c)) return true; // engine 判的斜坡（含北高地）也不放建築
    if (base[r][c].type === 'pond') return true;
    return false;
}
function itemSize(t) { const it = E.items[t]; return [it && it.w || 1, it && it.h || 1]; }

// 找出所有「至少一格壓在轉角/斜坡上」的建築（依 w×h 切棟）
const seen = new Set();
const toMove = [];
for (let r = 0; r < gridRows; r++) for (let c = 0; c < gridCols; c++) {
    const t = layout[r][c].type;
    if (!E.isBuildingType(t) || seen.has(r + ',' + c)) continue;
    const [w, h] = itemSize(t);
    const cells = [];
    let anchor = true;
    // 這格是不是這棟的左上角：左與上不同型即是（近似，資料本身 footprint 完整）
    if (r > 0 && layout[r - 1][c].type === t) anchor = false;
    if (c > 0 && layout[r][c - 1].type === t) anchor = false;
    if (!anchor) continue;
    for (let dr = 0; dr < h; dr++) for (let dc = 0; dc < w; dc++) {
        const nr = r + dr, nc = c + dc;
        if (nr < gridRows && nc < gridCols && layout[nr][nc].type === t) { cells.push([nr, nc]); seen.add(nr + ',' + nc); }
    }
    if (cells.some(([cr, cc]) => noBuild(cr, cc))) toMove.push({ type: t, w, h, cells, origin: [r, c] });
}
console.log('要搬遷的建築：' + toMove.map(b => b.type + '@X' + E.gameX(b.origin[0]) + '/Y' + E.gameY(b.origin[1])).join('、'));

// 先全部拆掉
for (const b of toMove) for (const [r, c] of b.cells) layout[r][c] = { type: 'empty', elevation: base[r][c].elevation };

// 逐棟找最近的合法落點（w×h 全空、全不 noBuild、同一高度成塊）
function tryPlace(b) {
    const [or_, oc] = b.origin;
    const spotsGuard = E.activeSpots(layout).size;
    const cand = [];
    for (let r = 0; r + b.h <= gridRows; r++) for (let c = 0; c + b.w <= gridCols; c++) {
        let ok = true;
        const e0 = base[r][c].elevation;
        const OVERWRITABLE = new Set(['empty', 'flower', 'woods', 'pine', 'sakura', 'azalea', 'palm', 'poplar']);
        for (let dr = 0; dr < b.h && ok; dr++) for (let dc = 0; dc < b.w && ok; dc++) {
            const nr = r + dr, nc = c + dc;
            if (!OVERWRITABLE.has(layout[nr][nc].type)) ok = false;
            else if (noBuild(nr, nc)) ok = false;
            else if (base[nr][nc].elevation !== e0) ok = false;
        }
        if (ok) cand.push([r, c, Math.abs(r - or_) + Math.abs(c - oc)]);
    }
    cand.sort((a, b2) => a[2] - b2[2]);
    for (const [r, c] of cand) {
        const backup = [];
        for (let dr = 0; dr < b.h; dr++) for (let dc = 0; dc < b.w; dc++) {
            backup.push(layout[r + dr][c + dc]);
            layout[r + dr][c + dc] = { type: b.type, elevation: base[r + dr][c + dc].elevation };
        }
        if (E.activeSpots(layout).size >= spotsGuard) {
            console.log('  ' + b.type + ' → X' + E.gameX(r) + '/Y' + E.gameY(c) + '（距離 ' + (Math.abs(r - b.origin[0]) + Math.abs(c - b.origin[1])) + '）');
            return true;
        }
        let i = 0;
        for (let dr = 0; dr < b.h; dr++) for (let dc = 0; dc < b.w; dc++) {
            layout[r + dr][c + dc] = backup[i++];
        }
    }
    return false;
}
/* 落點手動指定：自動找「最近空格」會把唯一的上山走廊（西側 X18 縱列與東側
   X25/Y5→X24 環帶）堵死。指定的落點都避開走廊：
     口袋區空格（X17/Y8 原水泥、X19/Y8 原體育館半格）、高地核心空格（X17/Y4
     原洗手間位）、路邊裝飾格（X26/Y10 原花壇）。 */
const FIXED_TARGETS = {
    'shop@X3/Y14': [2, 15],        // 北高地實心（購物窗口 X2-5/Y15-Y12 仍含福利社+便利商店+餐廳）
    'board@X16/Y3': null,          // 重複填充（別處另有公告欄），拆除——X16/Y5 要留成火箭口袋的走廊
    'toilet@X17/Y4': null,         // 重複填充（X6/Y10 等另有洗手間），拆除——X15/Y5 要留成走廊
    'incinerator@X20/Y7': [19, 8],
    'locker@X21/Y7': [25, 7],      // 東南口袋內（門面靠 X25/Y6 既有水泥）
    'club@X23/Y7': [17, 8],
    'club@X23/Y3': [26, 7]         // 東南口袋內（門面靠 X26/Y6 既有水泥）
};
for (const b of toMove) {
    const key = b.type + '@X' + E.gameX(b.origin[0]) + '/Y' + E.gameY(b.origin[1]);
    if (!(key in FIXED_TARGETS)) { console.error('沒有指定落點：' + key); process.exit(1); }
    const target = FIXED_TARGETS[key];
    if (target === null) { console.log('  拆除 ' + key + '（棟數 -1）'); continue; }
    const [tx, ty] = target;
    const [r, c] = [tx - 2, 25 - ty];
    if (E.isBuildingType(layout[r][c].type)) { console.error('落點被佔用：' + key + ' → X' + tx + '/Y' + ty + '（' + layout[r][c].type + '）'); process.exit(1); }
    if (noBuild(r, c)) { console.error('落點在斜坡/轉角上：' + key + ' → X' + tx + '/Y' + ty); process.exit(1); }
    layout[r][c] = { type: b.type, elevation: base[r][c].elevation };
    console.log('  ' + b.type + ' → X' + tx + '/Y' + ty);
}

/* ㈣ 高地2層核心（X17-22 × Y4-Y3）重排。
   真實地形下核心被 Y5/Y2 兩圈斜坡環帶包住、環帶兩端都是轉角（不可鋪、不可走），
   Y2 環帶因此整段是死區——Y3 排的六棟建築唯一的門面就沒了。唯一可行的配置：
     Y4 排清空鋪成走廊（連到東側 X23/Y4 水泥台肩，再接 X24 環帶下山）
     Y3 排六棟原地保留（門面＝北側 Y4 走廊）
   Y4 排原本的五棟動物/設施遷到山下有門面的格子。 */
{
    const CORE_MOVES = [
        { t: 'water', from: [16, 21] /* X18/Y4 */, to: [22, 15] /* X24/Y10（原樹林） */ },
        { t: 'giraffe', from: [17, 21] /* X19/Y4 */, to: [23, 15] /* X25/Y10（原樹林） */ },
        { t: 'rabbit', from: [18, 21] /* X20/Y4 */, to: [24, 15] /* X26/Y10（原花壇） */ },
        { t: 'koala', from: [19, 21] /* X21/Y4 */, to: [6, 4] /* X8/Y21（原樹林，門面接既有鋪面） */ },
        { t: 'farm', from: [20, 21] /* X22/Y4 */, to: [14, 12] /* X16/Y13（原花壇，門面已接既有走廊） */ }
    ];
    for (const m of CORE_MOVES) {
        const [fr, fc] = [m.from[0], m.from[1]];
        if (layout[fr][fc].type !== m.t) { console.error(`核心重排來源不符：(${fr},${fc}) 是 ${layout[fr][fc].type} 不是 ${m.t}`); process.exit(1); }
        const [tr, tc] = [m.to[0], m.to[1]];
        if (E.isBuildingType(layout[tr][tc].type)) { console.error(`核心重排落點被佔用：${m.t} → (${tr},${tc}) ${layout[tr][tc].type}`); process.exit(1); }
        layout[fr][fc] = { type: 'empty', elevation: base[fr][fc].elevation };
        layout[tr][tc] = { type: m.t, elevation: base[tr][tc].elevation };
        console.log('  核心遷出 ' + m.t + ' → X' + E.gameX(tr) + '/Y' + E.gameY(tc));
    }
    // Y4 排（X18-22）鋪成走廊——X17/Y4 是實機凹角（連鋪面都不能放），留空
    for (let x = 18; x <= 22; x++) {
        const [r, c] = [x - 2, 25 - 4];
        if (E.isBuildingType(layout[r][c].type)) { console.error('Y4 走廊格仍有建築：X' + x + '/Y4'); process.exit(1); }
        layout[r][c] = { type: 'wood_path', elevation: base[r][c].elevation };
    }
    console.log('  核心 Y4 排已鋪成走廊（X18-22；X17/Y4 凹角留空）');
    // X17/Y3 販賣機：東=茶室、南=凹角、北=Y2 死區、西=密閉斜坡口袋——實機無門可開，拆除
    if (layout[15][22].type === 'vending') {
        layout[15][22] = { type: 'empty', elevation: base[15][22].elevation };
        console.log('  拆除 vending@X17/Y3（實機無門面可開，棟數 -1）');
    }
}

/* ㈤ 中部走廊疏通與死區清理。
   ・小農場（直2格，X11-12/Y11）壓在 Y11 走廊正中——挪到西鄰的草地（X10-11/Y12），
     原格鋪回走廊，中部整套廊網（X7 草列、Y11 走廊、Y6 木道）恢復原設計的連接。
   ・高地2層北環帶（X17-22/Y2）的草皮：兩端都是轉角、實機永遠走不到，
     留著就是 6 格孤立通行格——改回空地（不是通行面就不算孤立）。 */
{
    const farmCells = [[9, 14], [10, 14]];   // X11/Y11、X12/Y11
    for (const [r, c] of farmCells) {
        if (layout[r][c].type !== 'farm') { console.error('Y11 小農場位置不符：(' + r + ',' + c + ') 是 ' + layout[r][c].type); process.exit(1); }
    }
    const farmTo = [[8, 13], [9, 13]];       // X10/Y12、X11/Y12（門面靠 Y11 走廊；同格局曾過守衛）
    for (const [r, c] of farmTo) {
        if (E.isBuildingType(layout[r][c].type)) { console.error('小農場新位置被佔用：(' + r + ',' + c + ')'); process.exit(1); }
    }
    for (const [r, c] of farmCells) layout[r][c] = { type: 'wood_path', elevation: base[r][c].elevation };
    for (const [r, c] of farmTo) layout[r][c] = { type: 'farm', elevation: base[r][c].elevation };
    console.log('  小農場 X11-12/Y11 → X10-11/Y12，Y11 走廊鋪回');

    for (let x = 17; x <= 22; x++) {
        const [r, c] = [x - 2, 25 - 2];
        if (layout[r][c].type === 'grass') layout[r][c] = { type: 'empty', elevation: base[r][c].elevation };
    }
    console.log('  高地北環帶（X17-22/Y2）死區草皮已清除');
}

/* ㈥ 最後一批疏通搬遷（各留出唯一的走廊/門面）：
   ・statue X11/Y3→X10/Y3、totem X11/Y4→X11/Y3：轉出東中動物群的門面（青空/非洲窗口不變）
   ・career X16/Y7→X13/Y2：讓出火箭/茶室口袋唯一的開口
   ・locker X24/Y7→X14/Y2：四面轉角+足球場封死，遷到已連通草地
   ・weather X5/Y19→X15/Y2、vending X4/Y20→X13/Y3：讓出北高地內部走廊（兩者的原窗口有替代棟）
   ・X15/Y4 死區草皮清除（四面是轉角+建築，實機到不了） */
{
    const singles = [
        { t: 'statue_br', from: [9, 22], to: [10, 20] }, // X12/Y5（可達草地；X10/Y2-Y3 整條留成長頸鹿門面走廊）
        { t: 'totem', from: [9, 21], to: [9, 22] },
        { t: 'career', from: [14, 18], to: null },      // 全圖唯一進路室：比照湖岸讓位先例拆除，讓出火箭口袋開口
        { t: 'locker', from: [22, 18], to: null },      // X24/Y7 更衣室：四面封死且另有兩座，拆除
        { t: 'weather', from: [3, 6], to: [12, 6] },    // X14/Y19（原樹林，門面已連通）
        { t: 'vending', from: [2, 5], to: [0, 12] }     // X2/Y13（門面靠 X2/Y14 斜坡補鋪）
    ];
    for (const m of singles) {
        const [fr, fc] = m.from;
        if (layout[fr][fc].type !== m.t) { console.error(`㈥ 來源不符：(${fr},${fc}) 是 ${layout[fr][fc].type} 不是 ${m.t}`); process.exit(1); }
        layout[fr][fc] = { type: 'empty', elevation: base[fr][fc].elevation };
        if (m.to === null) { console.log('  拆除 ' + m.t + '@X' + E.gameX(fr) + '/Y' + E.gameY(fc) + '（棟數 -1）'); continue; }
        const [tr, tc] = m.to;
        if (E.isBuildingType(layout[tr][tc].type)) { console.error(`㈥ 落點被佔用：${m.t} → (${tr},${tc})`); process.exit(1); }
        layout[tr][tc] = { type: m.t, elevation: base[tr][tc].elevation };
        console.log('  ' + m.t + ' → X' + E.gameX(tr) + '/Y' + E.gameY(tc));
    }
    // 中部 X10-11/Y13：街塊外側沒有門面（北=操場、東西=教室/養雞），
    // 而南側 Y12 要讓給小農場——這兩棟是重複填充（百葉箱另有一座、販賣機另有多座），拆除。
    for (const [r, c, t] of [[8, 12, 'vending'], [9, 12, 'weather']]) {
        if (layout[r][c].type !== t) { console.error(`㈥ 拆除來源不符：(${r},${c}) 是 ${layout[r][c].type} 不是 ${t}`); process.exit(1); }
        layout[r][c] = { type: 'empty', elevation: base[r][c].elevation };
        console.log('  拆除 ' + t + '@X' + E.gameX(r) + '/Y' + E.gameY(c) + '（棟數 -1）');
    }
    const dead = [13, 21]; // X15/Y4
    if (layout[dead[0]][dead[1]].type === 'grass') {
        layout[dead[0]][dead[1]] = { type: 'empty', elevation: base[dead[0]][dead[1]].elevation };
        console.log('  X15/Y4 死區草皮已清除');
    }
}

const spotsAfter = E.activeSpots(layout).size;
console.log(`景點：${spotsBefore} → ${spotsAfter}`);
if (spotsAfter < spotsBefore) { console.error('景點掉了，中止'); process.exit(1); }

fs.writeFileSync(CODE, E.encodeMap(layout) + '\n');
console.log('已寫回 code.txt。接著跑 node fix-connectivity.js health --write 補鋪面。');
