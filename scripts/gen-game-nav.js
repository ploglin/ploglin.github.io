/* ============================================================
   產生「遊戲內導覽列」資料，寫進 assets/shell.js 的標記區塊。
   掃描 kairosoft/<game>/ 底下實際存在的子頁，配上中文標籤，
   讓每款遊戲進站後都有一條自己的功能列（店中店）。

   用法：node scripts/gen-game-nav.js
   ============================================================ */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const KAIRO = path.join(ROOT, 'kairosoft');
const SHELL = path.join(ROOT, 'assets', 'shell.js');

/* 子頁 slug → 顯示名稱。main = 直接顯示在功能列，more = 收在「更多攻略▾」選單。
   ── 兩條硬規則 ──
   ① **宣告順序＝排序依據**，而 shell.js 的群組小標只在 group 值「變動」時插入
      → 同一個 group 的項目必須連續宣告，否則同一個小標會被插兩次。
   ② main 最多 4 項（含腳本硬加的第一項「攻略總覽」）：`''` / `start/` / `sim/` / `db/`。
      只有子頁量足夠的遊戲（目前僅 school2）撐得起 4 項；其餘 28 款只有 db/sim，
      main 自然是 3 項，不受本表順序影響。 */
const LABELS = {
    // ---- main：功能列直接顯示（順序即左到右）----
    /* now 放第 2 格：它是橫跨五章的進度索引，而讀者最常帶著的問題是
       「我玩到這裡了，接下來做什麼」。start 降到 guide 群不是因為它不重要，
       是因為它回答的是 now 的前兩段——兩個都掛在 main 等於門面上有兩個入口
       都在說「你剛開始，看這裡」。 */
    'now': { t: '你在第幾階', icon: '🧭', main: true },
    'sim': { t: '佈局模擬器', icon: '🧩', main: true },
    'db': { t: '資料庫', icon: '📚', main: true },
    // ---- more / group:'guide'（小標「主題攻略」）：主線其餘章節 ＋ 附錄，5 項 ----
    'start': { t: '開局指南', icon: '🚀', group: 'guide' },
    'layouts': { t: '佈局設計', icon: '🗺️', group: 'guide' },
    'training': { t: '育成', icon: '🎓', group: 'guide' },
    'walkthrough': { t: '經營與升級', icon: '🧭', group: 'guide' },
    'endgame': { t: '終盤', icon: '🏁', group: 'guide' },
    'glossary': { t: '中日對照', icon: '📖', group: 'guide' },
    // ---- more / group:'tool'（小標「工具」）：查表型專題 ----
    'combo': { t: '景點 combo 全解析', icon: '🎯', group: 'tool' }
};

// 讀 games-index.js 取標題／日文名／emoji／色系
const GAMES = (() => {
    const src = fs.readFileSync(path.join(ROOT, 'assets', 'games-index.js'), 'utf8');
    const sandbox = { window: {} };
    new Function('window', src)(sandbox.window);
    return sandbox.window.GAMES;
})();

const out = {};
GAMES.forEach(g => {
    const dir = path.join(KAIRO, g.id);
    if (!fs.existsSync(path.join(dir, 'index.html'))) return;

    const main = [['', '攻略總覽', '📄']];
    const more = [];
    fs.readdirSync(dir, { withFileTypes: true })
        .filter(d => d.isDirectory() && fs.existsSync(path.join(dir, d.name, 'index.html')))
        .map(d => d.name)
        .sort((a, b) => {
            // 依 LABELS 的宣告順序排，未知的排最後
            const keys = Object.keys(LABELS);
            const ia = keys.indexOf(a), ib = keys.indexOf(b);
            return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
        })
        .forEach(slug => {
            const L = LABELS[slug];
            if (!L) { console.warn('  ⚠ 未知子頁 slug（沒有中文標籤）:', g.id + '/' + slug); return; }
            if (L.main) main.push([slug + '/', L.t, L.icon]);
            else more.push([slug + '/', L.t, L.icon, L.group]);
        });

    out[g.id] = { e: g.emoji, t: g.title, j: g.jp, a: g.accent, main: main, more: more };
});

// 組成緊湊的 JS 字面值
const lines = Object.keys(out).map(id => {
    const g = out[id];
    const fmt = arr => '[' + arr.map(x => JSON.stringify(x)).join(',') + ']';
    return `        ${JSON.stringify(id)}: { e: ${JSON.stringify(g.e)}, t: ${JSON.stringify(g.t)}, j: ${JSON.stringify(g.j)}, a: ${JSON.stringify(g.a)},\n` +
        `            main: ${fmt(g.main)},\n` +
        `            more: ${fmt(g.more)} }`;
});
const block = '    var GAME_NAV = {\n' + lines.join(',\n') + '\n    };\n';

const START = '    /* <<< GAME_NAV：由 scripts/gen-game-nav.js 產生，勿手改 >>> */\n';
const END = '    /* <<< GAME_NAV 結束 >>> */\n';
let shell = fs.readFileSync(SHELL, 'utf8');
const i = shell.indexOf(START), j = shell.indexOf(END);
if (i < 0 || j < 0) { console.error('找不到 shell.js 裡的 GAME_NAV 標記區塊'); process.exit(1); }
shell = shell.slice(0, i + START.length) + block + shell.slice(j);
fs.writeFileSync(SHELL, shell);

const total = Object.values(out).reduce((n, g) => n + g.main.length + g.more.length, 0);
console.log('GAME_NAV 已寫入 assets/shell.js：' + Object.keys(out).length + ' 款遊戲、' + total + ' 個連結');
