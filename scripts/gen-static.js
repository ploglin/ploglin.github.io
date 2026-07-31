/* ============================================================
   靜態預渲染器：把原本靠瀏覽器 JS 才長出來的內容，在建置時
   直接烤成 HTML 寫回頁面（爬蟲／AdSense 看得到實體內容）。

   處理兩類頁面：
   1. kairosoft/<game>/db 底下所有 index.html — 用 vm 載入該遊戲 db/data.js
      取得 GAME_DB，再呼叫 assets/db.js 的 DB.categoryHtml / DB.indexHtml
      產生 #dbApp 的內容。
   2. 站台首頁 index.html — 用 vm 載入 assets/games-index.js 取得 GAMES，
      再呼叫 assets/home.js 的 HOME.gridsHtml 產生四個卡片容器的內容。

   兩支渲染邏輯都是瀏覽器端同一份檔案（db.js / home.js）的純函式，
   所以「預渲染結果」與「瀏覽器會產生的 innerHTML」是同一個字串，
   不存在兩套實作走鐘的問題。容器蓋上 data-prerendered，掛載時
   db.js / home.js 就不會重建 innerHTML（免閃爍、DOM＝原始碼）。

   重跑冪等（相同輸入→相同輸出）：整個 <!--prerender:start/end--> 區段替換。
   用法：node scripts/gen-static.js
   ============================================================ */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
const KAIRO = path.join(ROOT, 'kairosoft');
const DB = require(path.join(ROOT, 'assets', 'db.js'));
const HOME = require(path.join(ROOT, 'assets', 'home.js'));

const START = '<!--prerender:start-->';
const END = '<!--prerender:end-->';

/* ---- 用 window shim 在 vm 裡跑資料檔，取回它掛上 window 的東西 ---- */
function loadWindowScript(file) {
    const sandbox = { window: {}, console };
    sandbox.window.window = sandbox.window;
    vm.createContext(sandbox);
    vm.runInContext(fs.readFileSync(file, 'utf8'), sandbox, { filename: file });
    return sandbox.window;
}

/* ---- 容器蓋章（冪等） ------------------------------------------------- */
function reOpen(id, tail) {
    return new RegExp('<div([^>]*\\sid="' + id + '"[^>]*)>' + tail);
}
const reMarked = (id) => reOpen(id, '\\s*' + START + '[\\s\\S]*?' + END + '\\s*<\\/div>');
const reEmpty = (id) => reOpen(id, '<\\/div>');

function stamp(content, id, inner) {
    const build = (attrs) =>
        '<div' + attrs.replace(/\s+data-prerendered/g, '') + ' data-prerendered>' +
        START + inner + END + '</div>';
    const marked = reMarked(id), empty = reEmpty(id);
    if (marked.test(content)) return content.replace(marked, (m, a) => build(a));
    if (empty.test(content)) return content.replace(empty, (m, a) => build(a));
    return null; // 找不到容器
}

// 把已蓋章的區段清空，用來量「沒有預渲染時」的可見文字長度
function unstamp(content) {
    return content.replace(new RegExp(START + '[\\s\\S]*?' + END, 'g'), '');
}

/* ---- 可見文字長度（去註解/script/style/標籤/實體，收斂空白） ---------- */
function visibleText(html) {
    const b = html.indexOf('<body');
    const body = b < 0 ? html : html.slice(b);
    return body
        .replace(/<!--[\s\S]*?-->/g, ' ')
        .replace(/<script[\s\S]*?<\/script>/gi, ' ')
        .replace(/<style[\s\S]*?<\/style>/gi, ' ')
        .replace(/<[^>]+>/g, ' ')
        .replace(/&(?:[a-z]+|#\d+);/gi, ' ')
        .replace(/\s+/g, ' ')
        .trim().length;
}

/* ---- 掃描 kairosoft/<game>/db/**\/index.html -------------------------- */
function walk(dir, out) {
    for (const d of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, d.name);
        if (d.isDirectory()) walk(p, out);
        else if (d.isFile() && d.name === 'index.html') out.push(p);
    }
}

const dbPages = [];
if (fs.existsSync(KAIRO)) {
    for (const g of fs.readdirSync(KAIRO, { withFileTypes: true })) {
        if (!g.isDirectory()) continue;
        const dbDir = path.join(KAIRO, g.name, 'db');
        if (fs.existsSync(dbDir)) walk(dbDir, dbPages);
    }
}

const dbCache = new Map();
function gameDb(game) {
    if (!dbCache.has(game)) {
        const f = path.join(KAIRO, game, 'db', 'data.js');
        dbCache.set(game, fs.existsSync(f) ? loadWindowScript(f).GAME_DB : null);
    }
    return dbCache.get(game);
}

const stats = [];   // { page, before, after }
const warn = [];
let written = 0;

for (const file of dbPages) {
    const rel = path.relative(ROOT, file).split(path.sep).join('/');
    let content = fs.readFileSync(file, 'utf8');
    if (!/id="dbApp"/.test(content)) continue;

    const game = path.relative(KAIRO, file).split(path.sep)[0];
    const d = gameDb(game);
    if (!d) { warn.push(`  ⚠ ${rel}：找不到 db/data.js 的 GAME_DB`); continue; }

    const mCat = content.match(/DB\.mountCategory\(\s*['"]([^'"]+)['"]\s*\)/);
    const isIndex = /DB\.mountIndex\(\s*\)/.test(content);
    let inner;
    if (mCat) {
        inner = DB.categoryHtml(d, mCat[1]);
        if (!inner) { warn.push(`  ⚠ ${rel}：GAME_DB 沒有分類 '${mCat[1]}'`); continue; }
    } else if (isIndex) {
        inner = DB.indexHtml(d);
    } else {
        warn.push(`  ⚠ ${rel}：找不到 DB.mountCategory/DB.mountIndex 呼叫`);
        continue;
    }

    const next = stamp(content, 'dbApp', inner);
    if (next == null) { warn.push(`  ⚠ ${rel}：#dbApp 容器格式不符（略過）`); continue; }
    stats.push({ page: rel, before: visibleText(unstamp(content)), after: visibleText(next) });
    if (next !== content) { fs.writeFileSync(file, next); written++; }
}

/* ---- 站台首頁 --------------------------------------------------------- */
const homeFile = path.join(ROOT, 'index.html');
if (fs.existsSync(homeFile)) {
    const games = loadWindowScript(path.join(ROOT, 'assets', 'games-index.js')).GAMES || [];
    const grids = HOME.gridsHtml(games);
    let content = fs.readFileSync(homeFile, 'utf8');
    const before = visibleText(unstamp(content));
    let ok = true;
    for (const id of Object.keys(grids)) {
        const next = stamp(content, id, grids[id]);
        if (next == null) { warn.push(`  ⚠ index.html：找不到容器 #${id}`); ok = false; continue; }
        content = next;
    }
    if (ok) {
        stats.push({ page: 'index.html', before, after: visibleText(content) });
        const orig = fs.readFileSync(homeFile, 'utf8');
        if (content !== orig) { fs.writeFileSync(homeFile, content); written++; }
    }
}

/* ---- 摘要 ------------------------------------------------------------- */
const after = stats.map(s => s.after).sort((a, b) => a - b);
const sum = after.reduce((a, b) => a + b, 0);
console.log(`預渲染完成：處理 ${stats.length} 頁（實際改寫 ${written} 頁）`);
stats.forEach(s => console.log(`  ✓ ${s.page}：可見文字 ${s.before} → ${s.after} 字`));
if (after.length) {
    console.log('可見文字統計（預渲染後）：' +
        `min ${after[0]} · 中位 ${after[Math.floor(after.length / 2)]} · ` +
        `avg ${Math.round(sum / after.length)} · max ${after[after.length - 1]}`);
    console.log('仍不足 2000 字的頁數：' + after.filter(n => n < 2000).length + ' / ' + after.length);
}
warn.forEach(l => console.log(l));
