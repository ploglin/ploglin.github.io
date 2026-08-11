/* ============================================================
   開羅攻略站 — Open Graph 分享圖產生器 (gen-og.js)

   為什麼要這支：社群爬蟲（FB／X／LINE／Discord）不執行 JS，也不支援 SVG
   當 og:image。站上原本 16 頁宣告了 og:image，其中 9 個指向不存在的 PNG，
   剩下 5 個是 SVG（等於沒有預覽圖）。這支用 headless Chrome 把每款遊戲烤成
   一張 1200×630 PNG，資料來源是 assets/games-index.js（emoji／中日英名／色系），
   所以新增遊戲後重跑即可，不必手繪。

   產出：
     og-image.png                    站台預設（首頁與非遊戲頁用）
     kairosoft/<game>/og-image.png   每款遊戲一張（該款所有頁共用）

   兩個階段：
     1. 烤圖（需要 Chrome）
     2. 蓋 meta：把每頁的 og:image 指到該款的卡、補 og:image:width/height、
        並把 twitter:card 從 summary 升成 summary_large_image（有 1200×630 真圖了）
        —— 冪等，可反覆重跑；新增頁面或新增遊戲後重跑即補齊。

   跑法：node scripts/gen-og.js [game-id ...]     不給參數＝全部重烤＋全站蓋章
        node scripts/gen-og.js --stamp            只蓋章（不需要 Chrome）
   相依：階段 1 需要本機 Chrome（Windows 預設路徑，或設環境變數 CHROME）
   ============================================================ */
'use strict';
const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFileSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const KAIRO = path.join(ROOT, 'kairosoft');
const W = 1200, H = 630;

const STAMP_ONLY = process.argv.includes('--stamp');

/* ---------- Chrome ---------- */
const CHROME = process.env.CHROME || [
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    path.join(process.env.LOCALAPPDATA || '', 'Google\\Chrome\\Application\\chrome.exe'),
].find(p => p && fs.existsSync(p));
if (!CHROME && !STAMP_ONLY) {
    console.error('找不到 Chrome。設環境變數 CHROME 指向 chrome.exe，或用 --stamp 只蓋章。');
    process.exit(1);
}

/* ---------- 遊戲索引（與 gen-game-nav.js 同一套載入法）---------- */
const GAMES = (() => {
    const src = fs.readFileSync(path.join(ROOT, 'assets', 'games-index.js'), 'utf8');
    const sandbox = { window: {} };
    new Function('window', src)(sandbox.window);
    return sandbox.window.GAMES;
})();

/* ---------- 卡片樣板 ----------
   視覺語言對齊 shell.css：accent 當底色水洗、白卡 + --radius、ink/muted 文字階層。
   刻意不用 8bit 像素風——那目前只套在 school2 的正文，OG 圖代表整站。            */
const TOKENS = { ink: '#1c2b24', inkSoft: '#4b5b53', muted: '#7b8a82', brand: '#16794a', line: '#e2e8e4' };

function shell(inner, bg) {
    return `<meta charset="utf-8"><style>
  *{margin:0;padding:0;box-sizing:border-box}
  html,body{width:${W}px;height:${H}px;overflow:hidden}
  body{background:${bg};font-family:"Noto Sans TC","Microsoft JhengHei",system-ui,sans-serif;
       color:${TOKENS.ink};display:flex;align-items:center;justify-content:center;padding:44px}
  .emoji{font-family:"Segoe UI Emoji","Apple Color Emoji","Noto Color Emoji",sans-serif}
</style>${inner}`;
}

function gameCard(g) {
    const tags = (g.tags || []).map(t => Array.isArray(t) ? t[1] : t).slice(0, 3);
    return shell(`
<div style="width:100%;height:100%;background:#fff;border-radius:28px;
     box-shadow:0 8px 40px rgba(16,40,28,.10);display:flex;flex-direction:column;
     padding:56px 64px;position:relative;overflow:hidden">
  <div style="position:absolute;right:-90px;top:-90px;width:420px;height:420px;
       border-radius:50%;background:${g.accent};opacity:.55"></div>
  <div style="display:flex;align-items:center;gap:40px;flex:1;position:relative">
    <div style="width:210px;height:210px;flex:0 0 210px;border-radius:34px;background:${g.accent};
         display:flex;align-items:center;justify-content:center">
      <span class="emoji" style="font-size:126px;line-height:1">${g.emoji}</span>
    </div>
    <div style="min-width:0">
      <div style="font-size:${g.title.length > 8 ? 58 : 68}px;font-weight:900;letter-spacing:-.02em;
           line-height:1.12">${g.title}</div>
      <div style="font-size:30px;color:${TOKENS.inkSoft};margin-top:14px">${g.jp}</div>
      <div style="font-size:21px;color:${TOKENS.muted};margin-top:6px;letter-spacing:.06em;
           text-transform:uppercase">${g.en || ''}</div>
      <div style="display:flex;gap:10px;margin-top:22px">
        ${tags.map(t => `<span style="font-size:21px;color:${TOKENS.brand};background:#e6f4ec;
           border-radius:999px;padding:7px 18px;font-weight:700">${t}</span>`).join('')}
      </div>
    </div>
  </div>
  <div style="border-top:2px solid ${TOKENS.line};padding-top:24px;display:flex;
       align-items:baseline;justify-content:space-between;position:relative">
    <div style="font-size:30px;font-weight:900;color:${TOKENS.brand}">開羅攻略站</div>
    <div style="font-size:24px;color:${TOKENS.muted}">繁體中文攻略 · 資料庫 · 模擬器 · ploglin.cc</div>
  </div>
</div>`, g.accent);
}

function siteCard() {
    const row = GAMES.filter(g => g.status === 'live').slice(0, 9).map(g => g.emoji).join('');
    return shell(`
<div style="width:100%;height:100%;background:#fff;border-radius:28px;
     box-shadow:0 8px 40px rgba(16,40,28,.10);display:flex;flex-direction:column;
     align-items:center;justify-content:center;text-align:center;padding:56px">
  <div class="emoji" style="font-size:76px;letter-spacing:8px;line-height:1.1">${row}</div>
  <div style="font-size:92px;font-weight:900;letter-spacing:-.02em;margin-top:28px">開羅攻略站</div>
  <div style="font-size:34px;color:${TOKENS.inkSoft};margin-top:18px">
    Kairosoft 開羅遊戲 · 繁體中文攻略與模擬器</div>
  <div style="font-size:26px;color:${TOKENS.muted};margin-top:26px">
    ${GAMES.filter(g => g.status === 'live').length} 款遊戲攻略 · combo 組合表 · 佈局模擬器 · ploglin.cc</div>
</div>`, '#e6f4ec');
}

/* ---------- 五鎮完美佈局卡 ----------
   佈局頁分享出去時，該看到的是「那張圖長什麼樣」，不是通用的遊戲卡。
   地圖用 *-thumb.svg 而不是 *-perfect.svg：後者 89–128KB 的逐格標字在 630px 高
   的卡上完全讀不出來，縮圖版反而看得出佈局形狀（而那種色塊感正好對上 8bit 調性）。
   資料一律取正本，不在這裡重抄：
     名稱／景點數 → layout-gen/towns.js（spots.target，湖岸是 23 不是 29）
     日文名／尺寸／特色 → db/data.js 的 towns 分類
--------------------------------------------------------------------------- */
const LAYOUT_DIR = path.join(KAIRO, 'school2', 'layouts');

const TOWN_META = (() => {
    const townsJs = path.join(KAIRO, 'school2', 'scripts', 'layout-gen', 'towns.js');
    const dataJs = path.join(KAIRO, 'school2', 'db', 'data.js');
    if (!fs.existsSync(townsJs) || !fs.existsSync(dataJs)) return {};   // 其他遊戲沒有這套，靜靜跳過
    // towns.js 匯出 { TOWNS, select, current }。**不要對這個形狀做容錯**：抓不到就
    // 整批五鎮卡靜靜變成 0 張，而「少產出」是不會有人發現的失敗（踩過一次）。
    const mod = require(townsJs);
    const w = {};
    new Function('window', fs.readFileSync(dataJs, 'utf8'))(w);
    const cat = (w.GAME_DB.categories || []).find(c => c.key === 'towns');
    const col = (name) => cat.columns.indexOf(name);
    const out = {};
    for (const key of ['health', 'east', 'lake', 'valley', 'hill']) {
        const t = (mod.TOWNS || {})[key];
        if (!t) throw new Error(`towns.js 找不到 ${key}（export 形狀變了？keys=${Object.keys(mod)}）`);
        const row = cat.rows.find(r => r[0] === t.name) || [];
        out[key] = {
            name: t.name,
            spots: (t.spots && t.spots.target) || 29,
            jp: row[col('日文原名')] || '',
            size: row[col('尺寸')] || '',
            note: (row[col('特色')] || '').split('・')[0],
        };
    }
    return out;
})();

function townCard(key) {
    const t = TOWN_META[key];
    const svg = fs.readFileSync(path.join(LAYOUT_DIR, key + '-thumb.svg'), 'utf8').replace(/<\?xml[^>]*\?>/, '');
    const pill = (s) => `<span style="display:inline-block;font-size:20px;font-weight:700;color:${TOKENS.brand};
        background:#e6f4ec;border-radius:999px;padding:6px 16px;margin-right:8px">${s}</span>`;
    return shell(`
<div style="width:100%;height:100%;background:#fff;border-radius:28px;
     box-shadow:0 8px 40px rgba(16,40,28,.10);display:flex;align-items:center;
     padding:48px 56px;gap:48px;overflow:hidden">
  <div style="flex:1;min-width:0">
    <div style="font-size:21px;color:${TOKENS.muted};letter-spacing:.06em;font-weight:700">完美佈局</div>
    <div style="font-size:64px;font-weight:900;letter-spacing:-.02em;line-height:1.1;margin-top:6px">${t.name}</div>
    <div style="font-size:26px;color:${TOKENS.inkSoft};margin-top:10px">${t.jp}</div>
    <div style="margin-top:26px">${pill(t.spots + ' 個人氣景點')}${pill(t.size)}</div>
    <div style="font-size:23px;color:${TOKENS.inkSoft};margin-top:22px;line-height:1.5">
      9 教室＋2 辦公室滿編 · 分區優先 · 0 假路面<br>${t.note}</div>
    <div style="font-size:21px;color:${TOKENS.muted};margin-top:30px;font-weight:700">開羅攻略站 · ploglin.cc</div>
  </div>
  <div style="flex:0 0 auto;height:100%;display:flex;align-items:center">
    <div style="height:100%;display:flex;align-items:center">${svg}</div>
  </div>
</div>
<style>.card svg,div svg{height:100%;width:auto;display:block}</style>`, '#e6f4ec');
}

/* ---------- 烤圖 ---------- */
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'og-'));
function shoot(html, outAbs) {
    const src = path.join(TMP, 'card.html');
    fs.writeFileSync(src, html, 'utf8');
    fs.mkdirSync(path.dirname(outAbs), { recursive: true });
    execFileSync(CHROME, [
        '--headless', '--disable-gpu', '--hide-scrollbars', '--force-device-scale-factor=1',
        `--window-size=${W},${H}`, `--screenshot=${outAbs}`, 'file:///' + src.replace(/\\/g, '/'),
    ], { stdio: 'pipe' });
    if (!fs.existsSync(outAbs)) throw new Error('Chrome 沒吐出 ' + outAbs);
    return fs.statSync(outAbs).size;
}

const only = process.argv.slice(2).filter(a => !a.startsWith('--'));
let n = 0, bytes = 0;

if (!STAMP_ONLY) {
    console.log('【1】烤圖');
    if (!only.length) {
        bytes += shoot(siteCard(), path.join(ROOT, 'og-image.png')); n++;
        console.log('  og-image.png（站台預設）');
    }
    for (const g of GAMES) {
        if (only.length && !only.includes(g.id)) continue;
        if (!fs.existsSync(path.join(KAIRO, g.id, 'index.html'))) { console.log('  略過 ' + g.id + '（無頁面）'); continue; }
        const size = shoot(gameCard(g), path.join(KAIRO, g.id, 'og-image.png')); bytes += size; n++;
        console.log(`  kairosoft/${g.id}/og-image.png  ${(size / 1024).toFixed(0)} KB`);
    }
    if (!only.length || only.includes('school2')) {
        for (const key of Object.keys(TOWN_META)) {
            const size = shoot(townCard(key), path.join(LAYOUT_DIR, key + '-og.png')); bytes += size; n++;
            console.log(`  kairosoft/school2/layouts/${key}-og.png  ${(size / 1024).toFixed(0)} KB`);
        }
    }
    console.log(`  共 ${n} 張，合計 ${(bytes / 1024 / 1024).toFixed(2)} MB`);
}
fs.rmSync(TMP, { recursive: true, force: true });

/* ============================================================
   【2】蓋 meta
   ============================================================ */
const BASE = 'https://ploglin.cc/';
// 與 link-check.js 同一組：產生器目錄與共用資產不是頁面
const SKIP_DIRS = new Set(['.git', '.idea', 'node_modules', 'assets', 'scripts', 'scratchpad', '.github']);
// 寄居在同網域、與攻略站無關的一次性頁面：預覽卡寫「開羅攻略站」是錯的資訊，
// 所以刻意不給 og:image。link-check 的「og:image 缺漏」檢查也照這組豁免。
const NON_STATION = new Set([
    'kindergarten/20260303.html',
    'privacy/wealth_navigator.html',
    'travel/20251009.html',
]);

const pages = [];
(function walk(dir) {
    for (const name of fs.readdirSync(dir)) {
        const full = path.join(dir, name);
        if (fs.statSync(full).isDirectory()) { if (!SKIP_DIRS.has(name)) walk(full); }
        else if (name.endsWith('.html')) pages.push(path.relative(ROOT, full).split(path.sep).join('/'));
    }
})(ROOT);

const imgFor = (p) => {
    // 頁面專屬圖優先：五鎮佈局頁分享出去要看到那張圖，而不是通用遊戲卡
    // 鎮頁自己與它底下的專題子頁（例如 lake/stages/）都該分享出那張地圖
    const town = /^kairosoft\/school2\/layouts\/([^/]+)\/(?:[^/]+\/)?index\.html$/.exec(p);
    if (town && fs.existsSync(path.join(LAYOUT_DIR, town[1] + '-og.png'))) {
        return `${BASE}kairosoft/school2/layouts/${town[1]}-og.png`;
    }
    const m = /^kairosoft\/([^/]+)\//.exec(p);
    if (m && fs.existsSync(path.join(KAIRO, m[1], 'og-image.png'))) return `${BASE}kairosoft/${m[1]}/og-image.png`;
    return BASE + 'og-image.png';
};

const OG_IMG = /[ \t]*<meta\s+property="og:image"\s+content="[^"]*">\r?\n?/i;
const OG_DIM = /[ \t]*<meta\s+property="og:image:(?:width|height)"\s+content="[^"]*">\r?\n?/gi;
const st = { retarget: 0, added: 0, removed: 0, twitter: 0, eol: 0, noAnchor: [] };

/* 行尾：repo 內 CRLF／LF 兩種都有（逐檔不同，見 layout-gen 的產出）。插入時若寫死
   '\n'，CRLF 檔就變成混合行尾 —— 內容進 git 會被正規化成 LF（commit 的東西沒錯），
   但工作區會永遠掛著一堆「M」而 `git diff` 是空的，誤導以後的人以為產生物被手改。
   所以：取該檔的多數行尾，蓋章後把整檔統一。git 端的 blob 一位元都不會變。 */
const dominantEol = (s) => {
    let crlf = 0, lf = 0;
    for (let i = 0; i < s.length; i++) if (s[i] === '\n') (i > 0 && s[i - 1] === '\r') ? crlf++ : lf++;
    return crlf >= lf ? '\r\n' : '\n';
};

for (const p of pages) {
    const abs = path.join(ROOT, p);
    let s = fs.readFileSync(abs, 'utf8');
    const before = s;
    const eol = dominantEol(s);

    if (NON_STATION.has(p)) {
        if (OG_IMG.test(s)) { s = s.replace(OG_IMG, '').replace(OG_DIM, ''); st.removed++; }
    } else {
        const block = `<meta property="og:image" content="${imgFor(p)}">${eol}`
            + `    <meta property="og:image:width" content="1200">${eol}`
            + `    <meta property="og:image:height" content="630">`;
        if (OG_IMG.test(s)) {
            const cur = /content="([^"]*)"/.exec(OG_IMG.exec(s)[0])[1];
            s = s.replace(OG_IMG, '').replace(OG_DIM, '');
            if (cur !== imgFor(p)) st.retarget++;
            // 重新插回標準位置，順序永遠是 image → width → height
            s = insert(s, block, p, eol);
        } else {
            s = insert(s, block, p, eol);
            st.added++;
        }
    }

    // 有 1200×630 真圖了，摘要卡該用大圖版
    if (/name="twitter:card"\s+content="summary"/i.test(s) && !NON_STATION.has(p)) {
        s = s.replace(/(name="twitter:card"\s+content=")summary(")/i, '$1summary_large_image$2');
        st.twitter++;
    }

    // 統一行尾（含清掉前幾版蓋章留下的混合行尾）
    const normalized = s.replace(/\r?\n/g, eol);
    if (normalized !== s) st.eol++;
    s = normalized;

    if (s !== before) fs.writeFileSync(abs, s, 'utf8');
}

function insert(s, block, p, eol) {
    // 依序找 og:url → canonical → </title> 當插入點
    for (const re of [/(<meta\s+property="og:url"[^>]*>)/i, /(<link[^>]*rel="canonical"[^>]*>)/i, /(<\/title>)/i]) {
        if (re.test(s)) return s.replace(re, `$1${eol}    ${block}`);
    }
    st.noAnchor.push(p);
    return s;
}

console.log('\n【2】蓋 meta');
console.log(`  新增 og:image ${st.added} 頁 · 改指向 ${st.retarget} 頁 · 移除（非攻略站頁）${st.removed} 頁`);
console.log(`  twitter:card → summary_large_image ${st.twitter} 頁`);
console.log(`  行尾統一 ${st.eol} 頁`);
if (st.noAnchor.length) console.log('  ★ 找不到插入點：' + st.noAnchor.join(', '));
console.log(`  掃過 ${pages.length} 頁`);
