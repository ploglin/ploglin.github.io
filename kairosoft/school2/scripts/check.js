// 口袋學院物語2 佈局模擬器——語法與遊戲資料一致性檢查
// 用法：node scripts/check.js（全部 PASS 才算改完）
const fs = require('fs');
const path = require('path');
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');

let fails = 0;
const ok = (name, pass, detail) => {
    console.log((pass ? 'PASS' : 'FAIL') + '  ' + name + (pass || !detail ? '' : '：' + detail));
    if (!pass) fails++;
};

// 1) JS 語法
let script;
try {
    script = html.match(/<script>([\s\S]*)<\/script>/)[1];
    new Function(script);
    ok('JS 語法', true);
} catch (e) {
    ok('JS 語法', false, e.message);
    process.exit(1);
}

const items = eval('(' + html.match(/const items = (\{[\s\S]*?\n        \});/)[1] + ')');
const icons = eval('(' + html.match(/const ITEM_ICONS = (\{[\s\S]*?\n        \});/)[1] + ')');
const jp = eval('(' + html.match(/const JP_NAMES = (\{[\s\S]*?\n        \});/)[1] + ')');
const SPOTS = eval(html.match(/const SPOTS = (\[[\s\S]*?\n        \]);/)[1]);
const guide = eval(html.match(/const DEV_GUIDE = (\[[\s\S]*?\n        \]);/)[1]);

// 2) 面板資料覆蓋率
const noIcon = Object.keys(items).filter(id => !items[id].hidden && !icons[id]);
ok('每個設施都有圖示', !noIcon.length, noIcon.join(','));
const noJp = Object.keys(items).filter(id => id !== 'empty' && !jp[id]);
ok('每個設施都有日文對照', !noJp.length, noJp.join(','));

// 3) 景點資料
const badReq = SPOTS.flatMap(s => s.req.flat()).filter(id => !items[id]);
ok('景點條件的設施 id 全部存在', !badReq.length, [...new Set(badReq)].join(','));
const spotIds = SPOTS.map(s => s.id);
ok('景點 id 不重複', new Set(spotIds).size === spotIds.length);
ok('景點共 29 種', SPOTS.length === 29, '目前 ' + SPOTS.length);

// 4) 發展建議
const badGuide = guide
    .flatMap(s => s.items.flatMap(e => [e.id, ...Object.keys(e.needs || {})]))
    .filter(id => !items[id]);
ok('發展建議的設施 id 全部存在', !badGuide.length, [...new Set(badGuide)].join(','));

// 5) 內建地圖資料（預設圖與進度種子）
for (const m of html.matchAll(/(PRESET_DEFAULT_DATA|PROGRESS_SEED_DATA) = \`(\[\[[\s\S]*?\]\])\`/g)) {
    const name = m[1];
    try {
        const g = JSON.parse(m[2]);
        ok(`${name} 為 26×24`, g.length === 26 && g.every(row => row.length === 24));
        const badType = [...new Set(g.flat().map(c => c.type).filter(t => t !== 'empty' && !items[t]))];
        ok(`${name} 的設施 id 全部存在`, !badType.length, badType.join(','));
    } catch (e) {
        ok(`${name} JSON 可解析`, false, e.message);
    }
}

// 6) 分享編碼往返（鏡像 encodeMap/decodeMap 的邏輯）
const TYPE_KEYS = Object.keys(items);
const grid = JSON.parse(html.match(/PRESET_DEFAULT_DATA = \`(\[\[[\s\S]*?\]\])\`/)[1]);
const R = 26, C = 24;
const parts = [];
let prev = null, count = 0;
for (let r = 0; r < R; r++) for (let c = 0; c < C; c++) {
    const key = TYPE_KEYS.indexOf(grid[r][c].type) + '.' + (grid[r][c].elevation || 1);
    if (key === prev) count++;
    else { if (prev !== null) parts.push(prev + '.' + count); prev = key; count = 1; }
}
parts.push(prev + '.' + count);
const cells = [];
for (const p of parts.join(',').split(',')) {
    const [t, e, n] = p.split('.').map(Number);
    for (let k = 0; k < n; k++) cells.push({ type: TYPE_KEYS[t] || 'empty', elevation: e || 1 });
}
let roundtrip = cells.length === R * C;
if (roundtrip) {
    for (let r = 0; r < R; r++) for (let c = 0; c < C; c++) {
        const back = cells[r * C + c];
        if (back.type !== grid[r][c].type || back.elevation !== (grid[r][c].elevation || 1)) roundtrip = false;
    }
}
ok('分享編碼往返一致', roundtrip);

console.log(fails ? `\n共 ${fails} 項未通過` : '\n全部通過 ✔');
process.exit(fails ? 1 : 0);
