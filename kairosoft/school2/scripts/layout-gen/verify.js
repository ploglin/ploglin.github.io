/* 完美佈局驗證器（可重跑）。只吃分享碼，不吃產生器的中間狀態 ——
   把 code(-east).txt 解碼回地圖，再用模擬器的判定邏輯從頭驗一次。

   用法：node verify.js            → 驗健康鎮 code.txt
         node verify.js east       → 驗冬郵小鎮 code-east.txt
         node verify.js east page → 驗 layouts/index.html 上實際貼的那一串（最重要）
         node verify.js east <code> → 直接驗任意分享碼

   離開碼 0 = 全部 PASS，1 = 有 FAIL。 */
const fs = require('fs');
const path = require('path');
const townKey = (process.argv[2] || 'health').replace(/^--?/, '');
require('./towns.js').select(townKey);
const E = require('./engine.js');
const { items, SPOTS, gridRows, gridCols, town } = E;

const CODE_FILE = { health: 'code.txt', east: 'code-east.txt', hill: 'code-hill.txt', valley: 'code-valley.txt', lake: 'code-lake.txt' }[townKey];
// 每個城鎮一個子頁：layouts/<town.page>/index.html
const PAGE = path.join(__dirname, '..', '..', 'layouts', town.page, 'index.html');
const PAGE_REL = 'layouts/' + town.page + '/index.html';
let source = CODE_FILE, arg = process.argv[3];
if (arg === 'page') {
    // 直接從該鎮的佈局頁抓「在模擬器開啟…」那顆按鈕上的分享碼，確保頁面貼的就是驗過的那張
    const html = fs.readFileSync(PAGE, 'utf8');
    const hits = [...html.matchAll(/sim\/#m=([A-Za-z0-9\-_]+)">🧩 在模擬器開啟([^<]*)</g)]
        .filter(m => m[2].includes('完美佈局'));
    if (hits.length !== 1) throw new Error(PAGE_REL + ' 裡的完美佈局分享碼數量應為 1，實際 ' + hits.length);
    arg = hits[0][1]; source = PAGE_REL;
}
const code = (arg || fs.readFileSync(path.join(__dirname, CODE_FILE), 'utf8')).trim();

let fails = 0;
const check = (name, ok, detail) => {
    if (!ok) fails++;
    console.log((ok ? '  PASS  ' : '  FAIL  ') + name + (detail ? '：' + detail : ''));
};

console.log('=== ' + town.name + '完美佈局 驗證（' + source + '，' + code.length + ' 字元）===');

/* 1) 分享碼解碼 */
const dec = E.decodeMap(code);
check('分享碼可解碼', !!dec);
if (!dec) process.exit(1);
check('尺寸 = ' + gridRows + '×' + gridCols, dec.rows === gridRows && dec.cols === gridCols, dec.rows + '×' + dec.cols);
const hasPrefix = /^\d+x\d+;/.test(Buffer.from(code.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('binary'));
check('尺寸前綴 RxC;（26×24 才可省略）', (gridRows === 26 && gridCols === 24) ? !hasPrefix : hasPrefix);
const g = dec.grid;

/* 2) 重新編碼要一模一樣（往返一致） */
check('重新編碼 = 原分享碼', E.encodeMap(g) === code);

/* 3) 地圖上不能有玩家蓋不出來的東西 */
const badTypes = new Set();
g.flat().forEach(c => { if (!items[c.type]) badTypes.add(c.type + '(不存在)'); else if (items[c.type].hidden) badTypes.add(c.type + '(hidden)'); });
check('沒有玩家蓋不出來的假地形', badTypes.size === 0, [...badTypes].join('、'));
const badElev = g.flat().filter(c => !(c.elevation >= 1 && c.elevation <= 3)).length;
check('高度都在 1–3', badElev === 0, badElev + ' 格');

/* 4) 人氣景點：達到該鎮宣告的目標值。
      ★ 分區優先（zone-first）架構下，29/29 從**硬指標降級為「良好分區前提下的最大可成立數」**：
        景點窗口只有 4×4＝16 格，而操場／棒球場／足球場／體育館／道場／游泳池／各專科教室
        全是 2×2，硬湊三座 2×2 同框只能靠打散分區、亂鋪材質換來。
        所以各鎮在 towns.js 宣告 spots.target（未宣告＝29，四鎮照舊），
        未成立的景點一律列出來，頁面要誠實交代放棄了哪些、為什麼。 */
const active = E.activeSpots(g);
const where = E.spotWindows(g);
const spotTarget = (town.spots && town.spots.target) || SPOTS.length;
check('人氣景點 ' + active.size + ' / ' + SPOTS.length + ' 成立（本鎮宣告目標 ' + spotTarget + '）',
    active.size >= spotTarget, SPOTS.filter(s => !active.has(s.id)).map(s => s.name).join('、'));
if (active.size < SPOTS.length)
    console.log('  INFO  放棄的景點：' + SPOTS.filter(s => !active.has(s.id)).map(s => s.name).join('、') +
        '（分區優先：不為湊景點破壞分區或亂鋪材質）');

/* 4.5) 校舍規模：每張圖都要能容納「滿編」的學校。
       遊戲裡 1～3 年級各可開 3 個班 ＝ **教室固定 9 間**；辦公室上限 **2 間**。
       兩者都不是景點材料，正因如此最容易在排景點時被擠光（湖岸曾只剩 1 間教室），
       所以列為硬指標：規劃時先把 9×4 ＋ 2×4 ＝ 44 格釘好，再去排景點。 */
const roomCount = t => {
    const it = items[t], unit = (it.w || 1) * (it.h || 1);
    let n = 0;
    g.forEach(row => row.forEach(c => { if (c.type === t) n++; }));
    return n / unit;
};
const classN = roomCount('class'), officeN = roomCount('office');
check('教室 9 間（1–3 年級各 3 班）', classN === 9, classN + ' 間');
check('辦公室 2 間（遊戲上限）', officeN === 2, officeN + ' 間');

/* 5) 動線：沒有走不到的建築 */
const blocked = E.blockedBuildings(g);
check('被包圍（走不到）的建築 = 0', blocked.count === 0,
    blocked.blocks.map(b => items[b.type].name + '@X' + E.gameX(b.cells[0][0]) + '/Y' + E.gameY(b.cells[0][1])).join('、'));
const gates = [];
g.forEach((row, r) => row.forEach((c, cc) => { if (c.type === 'gate' || c.type === 'gate_h') gates.push([r, cc]); }));
check('至少有一座校門', gates.length > 0, gates.length + ' 格');

/* 6) 斜坡：不能蓋在斜坡上（蓋下去就不再是斜坡，高地會上不去）
      作法是拿原始地形推導的斜坡集合，逐格確認佈局沒有把它變成別的東西。 */
const base = E.loadTerrain();
const baseSlopes = [];
for (let r = 0; r < gridRows; r++) for (let c = 0; c < gridCols; c++) if (E.isSlopeIn(base, r, c)) baseSlopes.push([r, c]);
const lostSlopes = baseSlopes.filter(([r, c]) => !E.isSlopeIn(g, r, c));
check('原始地形的 ' + baseSlopes.length + ' 格斜坡未被蓋掉', lostSlopes.length === 0,
    lostSlopes.map(([r, c]) => 'X' + E.gameX(r) + '/Y' + E.gameY(c) + '=' + g[r][c].type).join('、'));

/* 6.5) 斜坡轉角：實機不能蓋任何東西（含鋪面），連走廊/道路都不行——跟一般斜坡不同。
        用原始地形推導轉角座標（轉角判定只看高度，不受佈局影響），逐格確認佈局沒有把它變成空地以外的東西。
        towns.js 的 terrainOverride（實機逐格核對）優先於演算法：slopes 從轉角集合剔除
        （引擎的地圖邊界特例會誤判）、corners 額外加入（引擎認不出的凹角/樞紐格）。 */
const ov = E.town.terrainOverride || {};
const ovKey = ([x, y]) => (x - 2) + ',' + (gridCols + 1 - y);
const ovSlopes = new Set((ov.slopes || []).map(ovKey));
const ovCorners = new Set((ov.corners || []).map(ovKey));
const cornerKeys = new Set();
for (let r = 0; r < gridRows; r++) for (let c = 0; c < gridCols; c++) if (E.isSlopeCorner(base, r, c)) cornerKeys.add(r + ',' + c);
for (const k of ovSlopes) cornerKeys.delete(k);
for (const k of ovCorners) cornerKeys.add(k);
const cornerCells = [...cornerKeys].map(k => k.split(',').map(Number));
const violatedCorners = cornerCells.filter(([r, c]) => g[r][c].type !== 'empty');
check('斜坡轉角（' + cornerCells.length + ' 格）沒有被放置任何東西', violatedCorners.length === 0,
    violatedCorners.map(([r, c]) => 'X' + E.gameX(r) + '/Y' + E.gameY(c) + '=' + g[r][c].type).join('、'));

/* 7) 水塘：實機確認水塘可以被建設覆蓋破壞、變回平地，所以「破壞」是合法手段，
      但必須節制且說得出所以然 —— 檢查破壞格數不超過該鎮的預算（towns.js 的
      pond.maxCarve），而且不能無中生有多挖水塘。破壞的座標一律列出來。 */
const maxCarve = (town.pond && town.pond.maxCarve) || 0;
let pondBase = 0, pondAdded = 0;
const destroyed = [];
for (let r = 0; r < gridRows; r++) for (let c = 0; c < gridCols; c++) {
    if (base[r][c].type === 'pond') {
        pondBase++;
        if (g[r][c].type !== 'pond') destroyed.push('X' + E.gameX(r) + '/Y' + E.gameY(c) + '→' + items[g[r][c].type].name);
    } else if (g[r][c].type === 'pond') pondAdded++;
}
check('破壞的水塘 ' + destroyed.length + ' / 上限 ' + maxCarve + ' 格', destroyed.length <= maxCarve,
    destroyed.join('、') || '（無）');
check('沒有無中生有的新水塘', pondAdded === 0, pondAdded + ' 格');
console.log('  INFO  水塘：原始 ' + pondBase + ' 格 → 保留 ' + (pondBase - destroyed.length) + ' 格' +
    (destroyed.length ? '；鑿開水道 ' + destroyed.join('、') : ''));
// 破壞後的格子高度必須跟原本的水塘一致（水沒了就是「那個高度的平地」，不會憑空長出落差）
const badElevCarve = [];
for (let r = 0; r < gridRows; r++) for (let c = 0; c < gridCols; c++)
    if (base[r][c].type === 'pond' && g[r][c].type !== 'pond' && g[r][c].elevation !== base[r][c].elevation)
        badElevCarve.push('X' + E.gameX(r) + '/Y' + E.gameY(c));
check('鑿開的水道保持原高度', badElevCarve.length === 0, badElevCarve.join('、'));

/* 8) 既有建築：列出被拆掉的（拆遷要能說得出理由）
      ★ 同型別相鄰要逐棟切開再比對。原本把相鄰同型別 flood fill 成一整塊，
        只要塊裡還有一格是那個型別就算「沒拆」—— 兩間並排的原生豬舍拆掉一間
        會完全不被報告，頁面上的「拆除 N 棟」因此可能少算（冬郵踩過）。 */
const demolished = [];
const seen = Array.from({ length: gridRows }, () => Array(gridCols).fill(false));
for (let r = 0; r < gridRows; r++) for (let c = 0; c < gridCols; c++) {
    if (seen[r][c] || !E.isBuildingType(base[r][c].type)) continue;
    const t = base[r][c].type, stack = [[r, c]], region = [];
    seen[r][c] = true;
    while (stack.length) {
        const [cr, cc] = stack.pop(); region.push([cr, cc]);
        for (const [dr, dc] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
            const nr = cr + dr, nc = cc + dc;
            if (nr < 0 || nr >= gridRows || nc < 0 || nc >= gridCols || seen[nr][nc]) continue;
            if (base[nr][nc].type === t) { seen[nr][nc] = true; stack.push([nr, nc]); }
        }
    }
    // 按 w×h 切回一棟一棟，逐棟看那一棟是不是整棟消失了
    const w = items[t].w || 1, h = items[t].h || 1;
    const own = new Set(region.map(([cr, cc]) => cr + ',' + cc));
    const used = new Set();
    for (const [cr, cc] of region.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1])) {
        if (used.has(cr + ',' + cc)) continue;
        const unit = [];
        for (let dr = 0; dr < h; dr++) for (let dc = 0; dc < w; dc++) {
            const k = (cr + dr) + ',' + (cc + dc);
            if (own.has(k) && !used.has(k)) unit.push([cr + dr, cc + dc]);
        }
        unit.forEach(([ur, uc]) => used.add(ur + ',' + uc));
        if (unit.length && !unit.some(([ur, uc]) => g[ur][uc].type === t))
            demolished.push(items[t].name + '@X' + E.gameX(unit[0][0]) + '/Y' + E.gameY(unit[0][1]));
    }
}
console.log('  INFO  拆除的既有建築：' + (demolished.join('、') || '（無）'));

/* 8.5) 多格建築的 footprint 完整性
      舊漏洞:景點判定只看「4×4 窗口裡出現哪些磚型」,棟數只看「格數 ÷ w×h」,
      所以一座 2×2 被切成兩半、或兩座重疊共用一格,兩邊都驗不出來
      (實機的湖岸泳池就是這樣溜過去的)。這裡逐個同型別連通塊檢查:
      塊的外框長寬必須是 h／w 的整數倍,且塊內每一格都被填滿
      —— 亦即這一塊剛好能被 h×w 的磚無縫鋪滿。 */
const badFootprint = [];
{
    const seen2 = Array.from({ length: gridRows }, () => Array(gridCols).fill(false));
    for (let r = 0; r < gridRows; r++) for (let c = 0; c < gridCols; c++) {
        const t = g[r][c].type;
        if (seen2[r][c] || !E.isBuildingType(t)) continue;
        const w = items[t].w || 1, h = items[t].h || 1;
        const stack = [[r, c]], cells = [];
        seen2[r][c] = true;
        while (stack.length) {
            const [cr, cc] = stack.pop(); cells.push([cr, cc]);
            for (const [dr, dc] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
                const nr = cr + dr, nc = cc + dc;
                if (nr < 0 || nr >= gridRows || nc < 0 || nc >= gridCols || seen2[nr][nc]) continue;
                if (g[nr][nc].type === t) { seen2[nr][nc] = true; stack.push([nr, nc]); }
            }
        }
        if (w === 1 && h === 1) continue;
        /* 貪婪鋪磚:同型別相鄰的多座建築會連成一塊(例:三間 2×2 教室拼成 L 形 12 格,
           那是合法的),所以不能只看外框是不是矩形 —— 要問「這塊能不能被 h×w 的磚
           無縫鋪滿」。由左上往右下掃,遇到還沒鋪到的格就要求以它為左上角的整塊磚
           完整存在;鋪不滿就是有缺角或重疊。 */
        const own = new Set(cells.map(([cr, cc]) => cr + ',' + cc));
        const used = new Set();
        let ok = true;
        for (const [cr, cc] of cells.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1])) {
            if (used.has(cr + ',' + cc)) continue;
            for (let dr = 0; dr < h && ok; dr++) for (let dc = 0; dc < w; dc++) {
                const k = (cr + dr) + ',' + (cc + dc);
                if (!own.has(k) || used.has(k)) { ok = false; break; }
            }
            if (!ok) break;
            for (let dr = 0; dr < h; dr++) for (let dc = 0; dc < w; dc++) used.add((cr + dr) + ',' + (cc + dc));
        }
        if (!ok) badFootprint.push(items[t].name + '@X' + E.gameX(cells[0][0]) + '/Y' + E.gameY(cells[0][1]) +
            '(' + cells.length + ' 格,鋪不滿 ' + h + '×' + w + ')');
    }
}
check('多格建築都是完整的 ' + '(w×h 無缺角、無重疊)', badFootprint.length === 0, badFootprint.join('、'));

/* 9) 統計 */
const counts = {};
g.flat().forEach(c => { if (c.type !== 'empty') counts[c.type] = (counts[c.type] || 0) + 1; });
const facCount = Object.entries(counts).filter(([t]) => E.isBuildingType(t))
    .reduce((n, [t, v]) => n + v / ((items[t].w || 1) * (items[t].h || 1)), 0);
let plateauFac = 0;
for (let r = 0; r < gridRows; r++) for (let c = 0; c < gridCols; c++)
    if (g[r][c].elevation > 1 && E.isBuildingType(g[r][c].type)) plateauFac += 1 / ((items[g[r][c].type].w || 1) * (items[g[r][c].type].h || 1));
console.log('  INFO  建築 ' + Math.round(facCount) + ' 棟（其中高地上 ' + Math.round(plateauFac) + ' 棟）｜走廊 ' +
    (counts.wood_path || 0) + ' 格｜校門 ' + gates.length + ' 格｜教室 ' + Math.round((counts.class || 0) / 4) + ' 間');

/* 10) 動線品質（新設計優先序：動線流暢 > 景點配置）
      度數＝四鄰中 canStep 走得過去的通行格（校門算一度，門前那格才不會被當成死路）。
      孤立通行格（度 0）視同缺陷 —— 看起來能走、其實哪裡都去不了。死路占比只出 INFO
      不設門檻：各鎮地形差異太大（湖泊／斷崖天生就會長出長支線），一刀切會逼出爛決策。
      「孤立通行格 = 0」是 PASS 檢查，但由 towns.js 的 flow.check 開關控制 ——
      只有跑過 builder 環化 pass 的鎮才開，其餘四鎮先只看 INFO。 */
const fm = E.flowMetrics(g);
const at = ([r, c]) => 'X' + E.gameX(r) + '/Y' + E.gameY(c);
console.log('  INFO  動線：通行格 ' + fm.passable + '｜死路端點 ' + fm.ends.length +
    '｜死路支線 ' + fm.stubCells.size + '/' + fm.passable + ' 格（占 ' + fm.pct + '%）｜孤立通行格 ' +
    fm.isolated.length + '｜走不到的通行格 ' + fm.unreach.length);
console.log('  INFO  最長的死路支線：' + (fm.stubs.slice(-3).reverse()
    .map(s => s.len + ' 格@' + at(s.cells[0])).join('、') || '（無）'));
if (town.flow && town.flow.check)
    check('孤立通行格 = 0', fm.isolated.length === 0, fm.isolated.map(at).join('、') || '（無）');
else
    console.log('  INFO  孤立通行格：' + (fm.isolated.map(at).join('、') || '（無）') +
        '（本鎮尚未套用環化 pass，towns.js 未開 flow.check，只出 INFO）');

/* 11) 29 個景點的成立位置（頁面表格用） */
console.log('\n景點｜座標（4×4 判定範圍左上角）｜需要設施');
SPOTS.forEach(s => {
    const w = where.get(s.id);
    console.log('  ' + s.name + '｜' + (w ? 'X' + E.gameX(w[0]) + ' / Y' + E.gameY(w[1]) : '—') + '｜' +
        s.req.map(gr => (Array.isArray(gr) ? gr : [gr]).map(t => items[t].name).join('／')).join('＋'));
});

console.log('\n' + (fails ? '✗ ' + fails + ' 項 FAIL' : '✓ 全部 PASS'));
process.exit(fails ? 1 : 0);
