/* ============================================================
   表格蓋章產生器（school2 專用，第五支產生器）

   把 kairosoft/school2/db/data.js 當唯一正本，把攻略頁裡「與資料庫
   重複的表格」改成建置期蓋章。頁面只留一行宣告，內容由這支腳本產生：

       <!-- db:events cols="名稱,必要預算(萬円)" caption="…" empty="—" -->
          …產生物，勿手改…
       <!-- db:end -->

   同一次掃描順手做三件事（三族標記，各自獨立、沒有標記的檔案不會被動到）：
     1. db:<cat>          攻略頁的表格
     2. usedby:start/end  db 分類頁的「哪些攻略用到這張表」（由 1 的反向索引推導）
     3. chapter:start/end 主線章節的上一章／下一章（由單一 CHAPTERS 陣列推導）
   方向 1→2 由同一份對照表推導，結構上不可能走鐘。

   四道安全保證（寫進腳本，不靠自律）：
     ① 掃描根目錄硬寫成 kairosoft/school2，不吃 argv 路徑
     ② 寫檔前斷言目標路徑相對 school2 不以 '..' 開頭
     ③ 只改寫含有標記的檔案，且只替換標記之間
     ④ 資料來源用 vm 沙箱跑 db/data.js（loadWindowScript 是刻意從
        gen-static.js 複製的 12 行，不共用——共用等於把 school2 的
        每次微調放進 29 款遊戲的風險半徑）

   重跑冪等（相同輸入→相同輸出）。
   用法：node scripts/gen-embed.js
   ============================================================ */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
/* 保證①：掃描根目錄硬寫死，不吃 process.argv */
const SCHOOL2 = path.join(__dirname, '..', 'kairosoft', 'school2');
const DATA_JS = path.join(SCHOOL2, 'db', 'data.js');
const SHELL = path.join(ROOT, 'assets', 'shell.js');

/* ---- 主線章節：章序只定義一次 ---------------------------------------------
   本批先填「現況已存在」的頁當骨架；B4 建 combo/start/training/endgame 時
   把它們插進這個陣列即可，六頁的上一章／下一章會同時更新，永不脫節。
--------------------------------------------------------------------------- */
const CHAPTERS = [
    { slug: 'layouts/', t: '佈局設計原則', icon: '🗺️', why: '先把路網與 4×4 窗口的規則讀懂' },
    { slug: 'walkthrough/', t: '經營與升級', icon: '🧭', why: '照學園規模門檻決定每年要蓋什麼' },
    { slug: 'glossary/', t: '中日對照附錄', icon: '📖', why: '查日文攻略或實機畫面時當字典' }
];

/* ---- 資料來源（刻意複製 gen-static.js 的 loadWindowScript） --------------- */
function loadWindowScript(file) {
    const sandbox = { window: {}, console };
    sandbox.window.window = sandbox.window;
    vm.createContext(sandbox);
    vm.runInContext(fs.readFileSync(file, 'utf8'), sandbox, { filename: file });
    return sandbox.window;
}

const GAME_DB = loadWindowScript(DATA_JS).GAME_DB;
if (!GAME_DB || !GAME_DB.categories) {
    console.error('讀不到 school2 的 GAME_DB：' + DATA_JS);
    process.exit(1);
}
const CATS = {};
GAME_DB.categories.forEach(c => { CATS[c.key] = c; });

/* ---- GAME_NAV（頁面中文名與圖示；同樣刻意複製而非共用） ------------------- */
const NAV = (() => {
    const S = '/* <<< GAME_NAV：由 scripts/gen-game-nav.js 產生，勿手改 >>> */';
    const E = '/* <<< GAME_NAV 結束 >>> */';
    const src = fs.readFileSync(SHELL, 'utf8');
    const i = src.indexOf(S), j = src.indexOf(E);
    if (i < 0 || j < 0) return {};
    const g = (new Function(src.slice(i + S.length, j) + '\nreturn GAME_NAV;'))().school2 || {};
    const m = {};
    [...(g.main || []), ...(g.more || [])].forEach(([slug, label, icon]) => { m[slug] = { label, icon }; });
    return m;
})();
const pageLabel = (slug) => (NAV[slug] && NAV[slug].label) || slug.replace(/\/$/, '') || '攻略總覽';
const pageIcon = (slug) => (NAV[slug] && NAV[slug].icon) || '📄';

/* ---- 標記屬性解析 -------------------------------------------------------
   值支援雙引號與單引號（rows= 帶 JSON 時要用單引號包）。
------------------------------------------------------------------------- */
function parseAttrs(s) {
    const out = {};
    const re = /([A-Za-z][\w-]*)\s*=\s*("([^"]*)"|'([^']*)')/g;
    let m;
    while ((m = re.exec(s))) out[m[1]] = m[3] !== undefined ? m[3] : m[4];
    return out;
}

/* ---- 儲存格轉換 --------------------------------------------------------- */
// strip="jp"：去掉內容含日文假名的（）括號段，例如「公園散步（公園散策）」→「公園散步」
const RE_JP_PAREN = /[（(][^（()）]*[぀-ゟ゠-ヿー][^（()）]*[）)]/g;

function transform(v, o) {
    let s = v == null ? '' : String(v);
    if (o.strip === 'jp') s = s.replace(RE_JP_PAREN, '').trim();
    if (o.sepFrom != null) s = s.split(o.sepFrom).join(o.sepTo);
    if (o.num === 'fw') s = s.replace(/~/g, '～');
    else if (o.num === 'ascii') s = s.replace(/～/g, '~');
    if (o.empty != null && s === '') s = o.empty;
    return s;
}

/* ---- 選列 --------------------------------------------------------------- */
function colIndex(cat, name, ctx, warn) {
    const i = cat.columns.indexOf(name);
    if (i < 0) warn.push(`  ⚠ ${ctx}：分類 '${cat.key}' 沒有欄位「${name}」`);
    return i;
}

function pickRows(cat, a, ctx, warn) {
    let rows = cat.rows.map(r => r.slice());
    const keyCol = a.key ? colIndex(cat, a.key, ctx, warn) : 0;
    if (keyCol < 0) return null;

    if (a.rows) {
        let spec;
        try { spec = JSON.parse(a.rows); }
        catch (e) { warn.push(`  ⚠ ${ctx}：rows= 不是合法 JSON（${e.message}）`); return null; }
        if (Array.isArray(spec.keys)) {
            // 依 keys 給定的順序取列（不依 db 的列序，缺一列就報錯）
            const byKey = new Map();
            rows.forEach(r => { if (!byKey.has(r[keyCol])) byKey.set(r[keyCol], r); });
            const out = [];
            for (const k of spec.keys) {
                if (!byKey.has(k)) { warn.push(`  ⚠ ${ctx}：rows.keys 找不到「${k}」`); return null; }
                out.push(byKey.get(k));
            }
            rows = out;
        } else if (spec.col && Array.isArray(spec.in)) {
            const ci = colIndex(cat, spec.col, ctx, warn);
            if (ci < 0) return null;
            rows = rows.filter(r => spec.in.indexOf(r[ci]) >= 0);
        } else {
            warn.push(`  ⚠ ${ctx}：rows= 需要 {"keys":[…]} 或 {"col":…,"in":[…]}`);
            return null;
        }
    }

    if (a.where) {
        for (const clause of a.where.split(';').map(s => s.trim()).filter(Boolean)) {
            const m = clause.match(/^(.+?)(!~|~|!=|=)(.*)$/);
            if (!m) { warn.push(`  ⚠ ${ctx}：where 子句看不懂「${clause}」`); return null; }
            const ci = colIndex(cat, m[1].trim(), ctx, warn);
            if (ci < 0) return null;
            const op = m[2], val = m[3].trim();
            rows = rows.filter(r => {
                const v = r[ci] == null ? '' : String(r[ci]);
                if (op === '=') return v === val;
                if (op === '!=') return v !== val;
                if (op === '~') return v.indexOf(val) >= 0;
                return v.indexOf(val) < 0;
            });
        }
    }

    if (a.sort) {
        const desc = a.sort.charAt(0) === '-';
        const ci = colIndex(cat, desc ? a.sort.slice(1) : a.sort, ctx, warn);
        if (ci < 0) return null;
        const numOf = (v) => {
            const n = parseFloat(String(v == null ? '' : v).replace(/[^\d.\-]/g, ''));
            return isNaN(n) ? null : n;
        };
        rows.sort((x, y) => {
            const nx = numOf(x[ci]), ny = numOf(y[ci]);
            const c = (nx != null && ny != null)
                ? nx - ny
                : String(x[ci]).localeCompare(String(y[ci]), 'zh-Hant');
            return desc ? -c : c;
        });
    }

    if (a.limit) {
        const n = parseInt(a.limit, 10);
        if (!isNaN(n)) rows = rows.slice(0, n);
    }
    return rows;
}

/* ---- 產生 <figure class="db-embed"> ------------------------------------
   cell 不轉義（與 assets/db.js 的 cell() 一致）：資料裡的 emoji 與「／」
   分隔符在攻略頁與資料庫頁要有完全相同的表現。
   縮排刻意對齊既有手寫表格（table-wrap/table 與標記同層、<tr> 再縮 8 格），
   讓「內容沒變的表格」蓋章後 <tbody> 逐位元不動。
------------------------------------------------------------------------ */
function tableHtml(cat, a, indent, depth, ctx, warn) {
    // cols="A,B=別名,C"：選欄、重排、改顯示名（值仍取自 db，只換表頭字樣）
    let sel;
    if (a.cols) {
        sel = [];
        for (const spec of a.cols.split(',').map(s => s.trim()).filter(Boolean)) {
            const k = spec.indexOf('=');
            const name = k < 0 ? spec : spec.slice(0, k).trim();
            const label = k < 0 ? name : spec.slice(k + 1).trim();
            const ci = colIndex(cat, name, ctx, warn);
            if (ci < 0) return null;
            sel.push({ ci, label });
        }
    } else {
        sel = cat.columns.map((c, ci) => ({ ci, label: c }));
    }

    const rows = pickRows(cat, a, ctx, warn);
    if (!rows) return null;

    const o = { strip: a.strip, num: a.num, empty: a.empty };
    if (a.sep) {
        const k = a.sep.indexOf('>');
        if (k < 0) { warn.push(`  ⚠ ${ctx}：sep 要寫成 "來源>取代"`); return null; }
        o.sepFrom = a.sep.slice(0, k);
        o.sepTo = a.sep.slice(k + 1);
    }

    const I = indent, I4 = indent + '    ', I8 = indent + '        ';
    const up = '../'.repeat(depth);
    const cap = a.caption || (cat.intro || '').split(/[。！]/)[0];
    const L = [];
    // figure/figcaption 帶行內樣式：`shell.css` 沒有 figure 的 reset，瀏覽器預設
    // `margin: 1em 40px` 會把表格整塊縮進 40px。B4 的 guide.css 接手 `.db-embed`／
    // `.db-embed figcaption` 之後，把這兩處行內樣式從本函式刪掉再重跑即可。
    L.push(I + '<figure class="db-embed" style="margin:0">');
    L.push(I + '<div class="table-wrap">');
    L.push(I + '<table class="data">');
    L.push(I4 + '<thead><tr>' + sel.map(s => '<th>' + s.label + '</th>').join('') + '</tr></thead>');
    L.push(I4 + '<tbody>');
    rows.forEach(r => {
        L.push(I8 + '<tr>' + sel.map(s => '<td>' + transform(r[s.ci], o) + '</td>').join('') + '</tr>');
    });
    L.push(I4 + '</tbody>');
    L.push(I + '</table>');
    L.push(I + '</div>');
    L.push(I + '<figcaption style="font-size:13px;color:var(--muted);margin-top:6px">' +
        cap + '　共 ' + rows.length + ' 筆 · ' +
        '<a href="' + up + 'db/' + cat.slug + '/">在資料庫開啟「' + cat.label + '」→</a></figcaption>');
    L.push(I + '</figure>');
    return L.join('\n');
}

/* ---- 掃描 school2 底下所有 html ---------------------------------------- */
function walk(dir, out) {
    for (const d of fs.readdirSync(dir, { withFileTypes: true })) {
        if (d.name === 'node_modules' || d.name === '.claude') continue;
        const p = path.join(dir, d.name);
        if (d.isDirectory()) walk(p, out);
        else if (d.isFile() && d.name.endsWith('.html')) out.push(p);
    }
}

/* 保證②：寫檔前斷言路徑沒有逸出 school2 */
function writeSafe(file, content) {
    const rel = path.relative(SCHOOL2, file);
    if (rel.startsWith('..') || path.isAbsolute(rel)) {
        throw new Error('拒絕寫入 school2 之外的路徑：' + file);
    }
    fs.writeFileSync(file, content);
}

const files = [];
walk(SCHOOL2, files);

const warn = [];
const usedBy = {};        // catKey → [{ slug, anchor, h2 }]
const embedReport = [];
let written = 0;

/* ---- 第一輪：db:<cat> 表格蓋章 ＋ 建反向索引 --------------------------- */
const RE_EMBED = /([ \t]*)<!--\s*db:([a-z][\w-]*)([\s\S]*?)-->[\s\S]*?<!--\s*db:end\s*-->/g;

for (const file of files) {
    const orig = fs.readFileSync(file, 'utf8');
    if (!/<!--\s*db:[a-z]/.test(orig)) continue;      // 保證③：無標記一位元都不碰

    const nl = orig.includes('\r\n') ? '\r\n' : '\n';
    const src = orig.split('\r\n').join('\n');
    const dirParts = path.relative(SCHOOL2, path.dirname(file)).split(path.sep).filter(p => p && p !== '.');
    const slug = dirParts.length ? dirParts.join('/') + '/' : '';
    const depth = dirParts.length;

    let touched = 0;
    const next = src.replace(RE_EMBED, (whole, indent, catKey, attrStr, offset) => {
        const ctx = slug + 'index.html → db:' + catKey;
        const cat = CATS[catKey];
        if (!cat) { warn.push(`  ⚠ ${ctx}：GAME_DB 沒有分類 '${catKey}'`); return whole; }
        const a = parseAttrs(attrStr);
        const body = tableHtml(cat, a, indent, depth, ctx, warn);
        if (body == null) return whole;

        // 反向索引：錨點取標記之前最近的 id=，h2 取最近的 <h2>
        const before = src.slice(0, offset);
        const ids = before.match(/\sid="([^"]+)"/g) || [];
        const anchor = ids.length ? ids[ids.length - 1].match(/id="([^"]+)"/)[1] : '';
        const h2s = before.match(/<h2[^>]*>([\s\S]*?)<\/h2>/g) || [];
        const h2 = h2s.length
            ? h2s[h2s.length - 1].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').replace(/^\d{2}\s*/, '').trim()
            : '';
        (usedBy[catKey] = usedBy[catKey] || []).push({ slug, anchor, h2 });

        touched++;
        return indent + '<!-- db:' + catKey + attrStr.replace(/\s+$/, '') + ' -->\n' +
            body + '\n' + indent + '<!-- db:end -->';
    });

    embedReport.push(`  ✓ ${slug || 'index.html'}：${touched} 張表`);
    const outStr = next.split('\n').join(nl);
    if (outStr !== orig) { writeSafe(file, outStr); written++; }
}

/* ---- 第二輪：usedby 蓋進 db 分類頁 ------------------------------------- */
function cardHtml(href, icon, lb, n) {
    return '<a class="db-cat-card" href="' + href + '"><span class="ic">' + icon + '</span>' +
        '<span class="lb">' + lb + '</span>' + (n ? '<span class="n">' + n + '</span>' : '') + '</a>';
}

function stampBlock(file, name, sectionLines) {
    const orig = fs.readFileSync(file, 'utf8');
    const re = new RegExp('([ \\t]*)(<!--\\s*' + name + ':start\\s*-->)[\\s\\S]*?(<!--\\s*' + name + ':end\\s*-->)');
    if (!re.test(orig)) return null;                  // 保證③
    const nl = orig.includes('\r\n') ? '\r\n' : '\n';
    const src = orig.split('\r\n').join('\n');
    const next = src.replace(re, (whole, indent, open, close) =>
        indent + open + '\n' + sectionLines.map(l => indent + l).join('\n') + '\n' + indent + close);
    const outStr = next.split('\n').join(nl);
    if (outStr !== orig) { writeSafe(file, outStr); return true; }
    return false;
}

const usedByReport = [];
for (const catKey of Object.keys(CATS)) {
    const cat = CATS[catKey];
    const file = path.join(SCHOOL2, 'db', cat.slug, 'index.html');
    if (!fs.existsSync(file)) continue;
    const list = usedBy[catKey] || [];
    let lines;
    if (list.length) {
        lines = [
            '<section class="related">',
            '    <h2>哪些攻略用到這張表</h2>',
            '    <div class="db-cat-grid">'
        ];
        list.forEach(u => {
            const href = '../../' + u.slug + (u.anchor ? '#' + u.anchor : '');
            lines.push('        ' + cardHtml(href, pageIcon(u.slug), pageLabel(u.slug), u.h2));
        });
        lines.push('    </div>', '</section>');
    } else {
        lines = ['<!-- 目前沒有攻略頁蓋這張表 -->'];
    }
    const r = stampBlock(file, 'usedby', lines);
    if (r === null) continue;
    if (r) written++;
    usedByReport.push(`  ✓ db/${cat.slug}：${list.length} 個內文入口`);
}

/* ---- 第三輪：章節導覽 -------------------------------------------------- */
const chapterReport = [];
CHAPTERS.forEach((ch, i) => {
    const file = path.join(SCHOOL2, ch.slug, 'index.html');
    if (!fs.existsSync(file)) { warn.push(`  ⚠ CHAPTERS 的 '${ch.slug}' 沒有實體目錄`); return; }
    const depth = ch.slug.replace(/\/$/, '').split('/').length;
    const up = '../'.repeat(depth);
    const prev = CHAPTERS[i - 1], next = CHAPTERS[i + 1];
    const lines = ['<nav class="related chapter-nav">',
        `    <h2>第 ${i + 1} / ${CHAPTERS.length} 章 · 接著讀</h2>`,
        '    <div class="db-cat-grid">'];
    if (next) lines.push('        ' + cardHtml(up + next.slug, next.icon, '下一章：' + next.t + ' →', next.why));
    if (prev) lines.push('        ' + cardHtml(up + prev.slug, prev.icon, '← 上一章：' + prev.t, prev.why));
    lines.push('    </div>', '</nav>');
    const r = stampBlock(file, 'chapter', lines);
    if (r === null) return;
    if (r) written++;
    chapterReport.push(`  ✓ ${ch.slug}（第 ${i + 1} 章）`);
});

/* ---- 摘要 ------------------------------------------------------------- */
const total = Object.values(usedBy).reduce((n, l) => n + l.length, 0);
console.log(`表格蓋章完成：${total} 張表 · ${Object.keys(usedBy).length} 個分類（實際改寫 ${written} 個檔案）`);
embedReport.forEach(l => console.log(l));
if (usedByReport.length) { console.log('反向索引（usedby）：'); usedByReport.forEach(l => console.log(l)); }
if (chapterReport.length) { console.log('章節導覽（chapter）：'); chapterReport.forEach(l => console.log(l)); }
if (warn.length) { console.log('警告：'); warn.forEach(l => console.log(l)); process.exitCode = 1; }
