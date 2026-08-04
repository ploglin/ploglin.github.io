// 全站連結／錨點／canonical／麵包屑／sitemap／?v= 一致性檢查
// 用法：node scripts/link-check.js
//
// 唯讀：本腳本**絕對不寫任何檔案**（沒有 fs.writeFileSync / mkdir / unlink）。
// 目的是把「現狀」釘成 baseline——之後任何手改若打壞連結、錨點或 canonical 會立刻被抓到。
// 退出碼：有 FAIL 為 1，只有 WARN 仍為 0。
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const BASE = 'https://ploglin.cc/';
// 與 scripts/gen-sitemap.js 同一份規則（掃頁面時跳過；但「連結目標」仍可落在這些目錄裡）
const SKIP_DIRS = new Set(['.git', '.idea', 'node_modules', 'assets', 'scripts', 'scratchpad', '.github']);

/* ==================== 既有已知問題（降級成 WARN） ====================
   刻意不直接修：修它要動別款遊戲的檔案，不屬於本批範圍。
   比照 school2/scripts/check.js 的 ALLOW 慣例——每筆都要有理由與修法，
   每次跑都會印出來，所以不會被忘記；修好後把該筆刪掉即可。            */
const KNOWN_ISSUES = {
    'kairosoft/clothier/index.html#combo':
        '既有壞錨點：頁面只有 #combo-female/#combo-male/#combo-cost。修法＝把 line 42 的 href 改成 #combo-female',
};

/* ==================== 報告器 ==================== */
let fails = 0, warns = 0;
const sections = [];
function section(title) { sections.push(title); console.log('\n── ' + title + ' ' + '─'.repeat(Math.max(2, 52 - title.length))); }
function ok(name, detail) { console.log('PASS  ' + name + (detail ? '：' + detail : '')); }
function warn(name, detail) { warns++; console.log('WARN  ' + name + (detail ? '：' + detail : '')); }
function fail(name, detail) { fails++; console.log('FAIL  ' + name + (detail ? '：' + detail : '')); }
function verdict(name, bad, detail, level) {
    if (!bad) ok(name, detail); else (level === 'warn' ? warn : fail)(name, detail);
}
// 壞項目太多時只印前 N 條，避免傾印
const LIST_MAX = 12;
function list(arr) {
    const shown = arr.slice(0, LIST_MAX).map(s => '        · ' + s).join('\n');
    return '\n' + shown + (arr.length > LIST_MAX ? `\n        …其餘 ${arr.length - LIST_MAX} 條` : '');
}

/* ==================== 掃描頁面 ==================== */
const pages = [];               // repo 相對路徑（/ 分隔）
(function walk(dir) {
    for (const name of fs.readdirSync(dir).sort()) {
        const full = path.join(dir, name);
        const st = fs.statSync(full);
        if (st.isDirectory()) { if (!SKIP_DIRS.has(name)) walk(full); }
        else if (name.endsWith('.html')) pages.push(path.relative(ROOT, full).split(path.sep).join('/'));
    }
})(ROOT);

const raw = new Map();          // rel -> 原始檔內容
for (const p of pages) raw.set(p, fs.readFileSync(path.join(ROOT, p), 'utf8'));

/* ---- 解析輔助 ---- */
// 只留標記：清掉 <script>/<style> 的「內容」（保留開標籤，因為 <script src> 要檢查）與 HTML 註解。
// 註解是成對的分隔標記（<!--prerender:start--> … <!--prerender:end-->），
// 非貪婪比對只吃掉標記本身，中間的預渲染內容會保留下來。
function markup(html) {
    return html
        .replace(/(<script\b[^>]*>)[\s\S]*?<\/script>/gi, '$1</script>')
        .replace(/(<style\b[^>]*>)[\s\S]*?<\/style>/gi, '$1</style>')
        .replace(/<!--[\s\S]*?-->/g, ' ');
}
function tags(html) { return html.match(/<[a-zA-Z][^>]*>/g) || []; }
function attr(tag, names) {
    const re = new RegExp('\\b(' + names.join('|') + ')\\s*=\\s*(?:"([^"]*)"|\'([^\']*)\')', 'gi');
    const out = [];
    for (const m of tag.matchAll(re)) out.push([m[1].toLowerCase(), m[2] !== undefined ? m[2] : m[3]]);
    return out;
}
function metaContent(html, key) {
    const re = new RegExp('<meta[^>]*(?:property|name)\\s*=\\s*"' + key + '"[^>]*>', 'i');
    const m = re.exec(html);
    if (!m) return null;
    const c = /content\s*=\s*"([^"]*)"/i.exec(m[0]);
    return c ? c[1] : null;
}

// 每頁的 id 集合（取自標記，不含 script 內容——JS 動態產生的 id 不在此列）
const idsOf = new Map();
for (const p of pages) {
    const set = new Set();
    for (const t of tags(markup(raw.get(p)))) {
        for (const [, v] of attr(t, ['id', 'name'])) if (v) set.add(v);
    }
    idsOf.set(p, set);
}
// JS 內出現過的 id 字面（動態產生節點用）——只用來把 FAIL 降級成 WARN，不當成通過
const jsIdsOf = new Map();
for (const p of pages) {
    const set = new Set();
    const bodies = [...raw.get(p).matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)].map(m => m[1]).join('\n');
    for (const m of bodies.matchAll(/\bid\s*[:=]\s*['"]([A-Za-z][\w-]*)['"]/g)) set.add(m[1]);
    for (const m of bodies.matchAll(/id="([A-Za-z][\w-]*)"/g)) set.add(m[1]);
    jsIdsOf.set(p, set);
}

function exists(relPath) {
    const abs = path.join(ROOT, relPath);
    return fs.existsSync(abs) && fs.statSync(abs).isFile();
}
// 解析相對連結 → repo 相對檔案路徑（目錄補 index.html）；逸出 repo 回傳 null
function resolveTarget(fromPage, url) {
    const fromDir = path.posix.dirname(fromPage) === '.' ? '' : path.posix.dirname(fromPage);
    let joined = url.startsWith('/') ? url.slice(1) : path.posix.join(fromDir, url);
    joined = path.posix.normalize(joined);
    if (joined.startsWith('..')) return null;
    if (joined === '' || joined === '.') joined = 'index.html';
    const abs = path.join(ROOT, joined);
    if (url.endsWith('/') || (fs.existsSync(abs) && fs.statSync(abs).isDirectory())) {
        joined = path.posix.join(joined, 'index.html');
    }
    return joined;
}

/* ==================== 1. 相對連結（href / src） ==================== */
section('1. 相對連結（href / src）');
{
    let internal = 0, external = 0, skipped = 0, pageLinks = 0, assetLinks = 0;
    const broken = [], escaped = [];
    const anchorRefs = [];      // 交給第 2 節
    const stateFrags = [];      // #m=… 這類 app 狀態片段

    for (const p of pages) {
        for (const t of tags(markup(raw.get(p)))) {
            for (const [, v] of attr(t, ['href', 'src'])) {
                const url = v.trim();
                if (!url) { skipped++; continue; }
                if (/^(?:https?:)?\/\//i.test(url)) { external++; continue; }
                if (/^(?:mailto|tel|javascript|data):/i.test(url)) { skipped++; continue; }
                if (url === '#') { skipped++; continue; }

                const hash = url.indexOf('#');
                const frag = hash < 0 ? '' : url.slice(hash + 1);
                // 去掉查詢字串（?v=8 這類快取版號不屬於檔案路徑）
                const pathPart = (hash < 0 ? url : url.slice(0, hash)).split('?')[0];

                let target = p;
                if (pathPart) {
                    internal++;
                    target = resolveTarget(p, pathPart);
                    if (target === null) { escaped.push(`${p} → ${url}`); continue; }
                    if (target.endsWith('.html')) pageLinks++; else assetLinks++;
                    if (!exists(target)) { broken.push(`${p} → ${url}`); continue; }
                }
                if (frag) {
                    // `#m=…`（分享碼）等 app 狀態片段不是元素 id
                    if (/^[A-Za-z_]+=/.test(frag)) stateFrags.push(`${p} → ${url.slice(0, 40)}…`);
                    else anchorRefs.push({ from: p, to: target, frag, url, cross: !!pathPart });
                }
            }
        }
    }
    verdict(`內部連結目標存在（共 ${internal} 條：頁面 ${pageLinks}、靜態資源 ${assetLinks}）`, broken.length,
        broken.length ? list(broken) : '0 壞');
    verdict('沒有逸出 repo 的相對路徑', escaped.length, escaped.length ? list(escaped) : '0 條');
    ok(`外部連結（只計數不連網）`, external + ' 條');
    ok('app 狀態片段（#m= 分享碼等，不驗 id）', stateFrags.length + ' 條');
    ok('其他（mailto/tel/js/data/空）', skipped + ' 條');
    module.exports = null;      // 明示這支不是 library
    global.__anchorRefs = anchorRefs;
}

/* ==================== 2. 錨點（同頁 + 跨頁） ==================== */
section('2. 錨點 fragment');
{
    const refs = global.__anchorRefs;
    const same = refs.filter(r => !r.cross), cross = refs.filter(r => r.cross);
    const bad = [], dyn = [], known = [];
    for (const r of refs) {
        if (idsOf.get(r.to) && idsOf.get(r.to).has(r.frag)) continue;
        if (jsIdsOf.get(r.to) && jsIdsOf.get(r.to).has(r.frag)) { dyn.push(`${r.from} → ${r.url}`); continue; }
        const key = r.from + '#' + r.frag;
        if (KNOWN_ISSUES[key]) { known.push(`${key} —— ${KNOWN_ISSUES[key]}`); continue; }
        bad.push(`${r.from} → ${r.url}（${r.to} 無 id="${r.frag}"）`);
    }
    ok(`錨點總數 ${refs.length} 條`, `同頁 ${same.length}、跨頁 ${cross.length}`);
    verdict('錨點目標 id 存在', bad.length, bad.length ? list(bad) : `0 壞（另有 ${known.length} 筆列於已知問題）`);
    if (known.length) warn('既有已知壞錨點（不在本批範圍，修法見說明）', list(known));
    if (dyn.length) warn('錨點 id 只出現在 JS（動態產生，靜態 HTML 查不到）', list(dyn));

    // 重複 id（同頁 id 撞名會讓錨點落在錯的地方）
    const dupPages = [];
    for (const p of pages) {
        const seen = new Set(), dup = new Set();
        for (const t of tags(markup(raw.get(p)))) {
            for (const [k, v] of attr(t, ['id'])) {
                if (k !== 'id' || !v) continue;
                if (seen.has(v)) dup.add(v); else seen.add(v);
            }
        }
        if (dup.size) dupPages.push(`${p}：${[...dup].join(',')}`);
    }
    verdict('同頁 id 不重複', dupPages.length, dupPages.length ? list(dupPages) : '0 頁', 'warn');
}

/* ==================== 3. canonical / og:url / og:image ==================== */
section('3. canonical / og:url / og:image');
{
    const expectedUrl = p => BASE + (p === 'index.html' ? '' :
        p.endsWith('/index.html') ? p.slice(0, -'index.html'.length) : p);

    const noCanon = [], badCanon = [], noOg = [], badOg = [], missImg = [], noImg = [];
    let canon = 0, ogu = 0, ogi = 0;
    for (const p of pages) {
        const html = raw.get(p);
        const want = expectedUrl(p);

        const cm = /<link[^>]*rel\s*=\s*"canonical"[^>]*>/i.exec(html);
        if (!cm) noCanon.push(p);
        else {
            canon++;
            const h = /href\s*=\s*"([^"]*)"/i.exec(cm[0]);
            const got = h ? h[1] : '';
            if (got !== want) badCanon.push(`${p}：canonical="${got}" 應為 "${want}"`);
        }

        const u = metaContent(html, 'og:url');
        if (u === null) noOg.push(p);
        else { ogu++; if (u !== want) badOg.push(`${p}：og:url="${u}" 應為 "${want}"`); }

        const img = metaContent(html, 'og:image');
        if (img === null) noImg.push(p);
        else {
            ogi++;
            if (img.startsWith(BASE)) {
                const rel = img.slice(BASE.length);
                if (!exists(rel)) missImg.push(`${p}：og:image → ${rel}（檔案不存在）`);
            } else if (!/^https?:\/\//i.test(img)) {
                const t = resolveTarget(p, img);
                if (!t || !exists(t)) missImg.push(`${p}：og:image → ${img}（檔案不存在）`);
            }
        }
    }
    ok(`有 canonical 的頁面 ${canon} / ${pages.length}`);
    verdict('canonical 等於 https://ploglin.cc/ ＋ 位置', badCanon.length,
        badCanon.length ? list(badCanon) : '全對');
    verdict('canonical 缺漏', noCanon.length, noCanon.length ? list(noCanon) : '0 頁', 'warn');
    ok(`有 og:url 的頁面 ${ogu} / ${pages.length}`);
    verdict('og:url 等於 canonical 應有值', badOg.length, badOg.length ? list(badOg) : '全對');
    verdict('og:url 缺漏', noOg.length, noOg.length ? list(noOg) : '0 頁', 'warn');
    ok(`有 og:image 的頁面 ${ogi} / ${pages.length}`);
    verdict('og:image 指向存在的檔案', missImg.length, missImg.length ? list(missImg) : '全部存在', 'warn');
}

/* ==================== 4. 麵包屑 ==================== */
section('4. 麵包屑（Shell.mount 的 breadcrumb）');
{
    // 預期層數：站根之下的路徑段數（kairosoft/ 這層不是麵包屑節點，因為 shell 自動補「首頁」）
    function expectedDepth(p) {
        const segs = p.split('/');
        const file = segs.pop();
        if (segs[0] === 'kairosoft') segs.shift();
        let n = segs.length + (file === 'index.html' ? 0 : 1);
        return Math.max(1, n);
    }
    const noBc = [], badDepth = [], badHref = [], lastHasHref = [], unparsed = [];
    let checked = 0, items = 0;
    for (const p of pages) {
        const html = raw.get(p);
        if (!/Shell\.mount\s*\(/.test(html)) { continue; }         // 模擬器走 mountBar，不在此列
        const m = /breadcrumb\s*:\s*(\[[\s\S]*?\])\s*[,}]/.exec(html);
        if (!m) { if (!/page\s*:\s*['"]home['"]/.test(html)) noBc.push(p); continue; }
        let bc;
        try { bc = new Function('return ' + m[1])(); } catch (e) { unparsed.push(p + '：' + e.message); continue; }
        if (!Array.isArray(bc)) { unparsed.push(p + '：不是陣列'); continue; }
        checked++; items += bc.length;

        const want = expectedDepth(p);
        if (bc.length !== want) badDepth.push(`${p}：${bc.length} 層，目錄深度需 ${want} 層`);
        bc.forEach((it, i) => {
            if (i === bc.length - 1) { if (it.href) lastHasHref.push(`${p}：最後一項「${it.t}」帶 href="${it.href}"`); return; }
            if (!it.href) { badHref.push(`${p}：第 ${i + 1} 項「${it.t}」缺 href`); return; }
            const t = resolveTarget(p, it.href);
            if (!t || !exists(t)) badHref.push(`${p}：第 ${i + 1} 項 href="${it.href}" 不存在`);
        });
    }
    ok(`檢查 ${checked} 頁、共 ${items} 個麵包屑節點`);
    verdict('層數＝目錄深度', badDepth.length, badDepth.length ? list(badDepth) : '全對');
    verdict('每個非末項的 href 可達', badHref.length, badHref.length ? list(badHref) : '全對');
    verdict('最後一項不帶 href（＝當前頁）', lastHasHref.length, lastHasHref.length ? list(lastHasHref) : '全對');
    verdict('breadcrumb 可解析', unparsed.length, unparsed.length ? list(unparsed) : '全部可解析');
    verdict('Shell.mount 有帶 breadcrumb', noBc.length, noBc.length ? list(noBc) : '全部有', 'warn');
}

/* ==================== 5. sitemap.xml ==================== */
section('5. sitemap.xml');
{
    const smPath = path.join(ROOT, 'sitemap.xml');
    if (!fs.existsSync(smPath)) fail('sitemap.xml 存在');
    else {
        const xml = fs.readFileSync(smPath, 'utf8');
        const locs = [...xml.matchAll(/<loc>([^<]*)<\/loc>/g)].map(m => m[1]);
        // 依 gen-sitemap.js 的規則算出「應收錄」清單
        const want = pages.map(p => BASE + (p.endsWith('index.html') ? p.slice(0, -'index.html'.length) : p)).sort();
        const wantSet = new Set(want), gotSet = new Set(locs);

        ok(`sitemap 收錄 ${locs.length} 個 URL；可索引頁 ${pages.length} 頁`);
        const dup = locs.filter((u, i) => locs.indexOf(u) !== i);
        verdict('沒有重複 URL', dup.length, dup.length ? list([...new Set(dup)]) : '0 條');

        const badDomain = locs.filter(u => !u.startsWith(BASE));
        verdict('全部使用 ' + BASE, badDomain.length, badDomain.length ? list(badDomain) : '全對');

        const missFile = locs.filter(u => u.startsWith(BASE)).filter(u => {
            const rel = u.slice(BASE.length);
            return !exists(rel === '' || rel.endsWith('/') ? rel + 'index.html' : rel);
        });
        verdict('每個 URL 對應存在的檔案', missFile.length, missFile.length ? list(missFile) : '全部存在');

        const missing = want.filter(u => !gotSet.has(u));
        verdict('可索引頁全部在 sitemap 裡（漏收）', missing.length, missing.length ? list(missing) : '0 頁');
        const extra = locs.filter(u => !wantSet.has(u));
        verdict('sitemap 沒有多收', extra.length, extra.length ? list(extra) : '0 條');
    }
}

/* ==================== 6. ?v= 快取版號一致性 ==================== */
section('6. ?v= 版號一致性');
{
    const files = [];
    (function walk2(dir) {
        for (const name of fs.readdirSync(dir).sort()) {
            const full = path.join(dir, name);
            const st = fs.statSync(full);
            // 只掃「會上線」的檔案：跳過 SKIP_DIRS（產生器與產物目錄自己的字面不算版號用量，
            // 否則腳本裡的註解會把自己算進去）
            if (st.isDirectory()) { if (!SKIP_DIRS.has(name)) walk2(full); }
            else if (/\.(html|js|css)$/.test(name)) files.push(full);
        }
    })(ROOT);

    const byVer = new Map();
    const dataWithV = [];
    let dataRefs = 0;
    for (const f of files) {
        const rel = path.relative(ROOT, f).split(path.sep).join('/');
        const txt = fs.readFileSync(f, 'utf8');
        for (const m of txt.matchAll(/\?v=(\d+)/g)) {
            if (!byVer.has(m[1])) byVer.set(m[1], []);
            byVer.get(m[1]).push(rel);
        }
        // db/data.js 的引用一律不帶 ?v（現有慣例）
        for (const m of txt.matchAll(/(?:src|href)\s*=\s*"([^"]*data\.js[^"]*)"/g)) {
            dataRefs++;
            if (m[1].includes('?v')) dataWithV.push(`${rel} → ${m[1]}`);
        }
    }
    const vers = [...byVer.keys()].sort();
    for (const v of vers) ok(`?v=${v}`, byVer.get(v).length + ' 處 / ' + new Set(byVer.get(v)).size + ' 檔');
    verdict('全 repo 只有一個 ?v 版號', vers.length !== 1,
        vers.length === 1 ? '?v=' + vers[0] : '出現 ' + vers.length + ' 個版號：' + vers.join(', '));
    verdict(`data.js 引用不帶 ?v（共 ${dataRefs} 處）`, dataWithV.length,
        dataWithV.length ? list(dataWithV) : '0 處帶版號');
}

/* ==================== 總結 ==================== */
console.log('\n' + '='.repeat(56));
console.log(`總結：掃描 ${pages.length} 頁，FAIL ${fails} 項、WARN ${warns} 項` + (fails ? '' : ' —— 無阻擋問題 ✔'));
process.exit(fails ? 1 : 0);
