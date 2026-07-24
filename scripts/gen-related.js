/* ============================================================
   頁尾「延伸閱讀」蓋章器：把各頁的相關連結烤成靜態 HTML，
   寫進 <!-- related:start --> 與 <!-- related:end --> 之間。
   重跑冪等（相同輸入→相同輸出）。沒有標記的頁不會被動到。

   連結來源：頂部的人工精選表 RELATED（game → 頁面 slug → 3 連結）。
   RELATED 沒設定的頁走 fallback：依 GAME_NAV（main+more 順序）
   取上一頁／下一頁＋資料庫（去重、排除自己與 sim/，不足 3 就列有的）。
   遊戲名／各頁 icon 與標題從 assets/shell.js 的 GAME_NAV 區塊解析。

   用法：node scripts/gen-related.js
   ============================================================ */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const KAIRO = path.join(ROOT, 'kairosoft');
const SHELL = path.join(ROOT, 'assets', 'shell.js');

/* ---- 人工精選表 ----------------------------------------------------------
   每個連結項：{ href, desc, icon?, label? }
   - href 為相對於「該頁」的路徑（作者手寫，已算好相對層級）。
   - 未給 icon/label 時，從 href 末段 slug 對照 GAME_NAV 自動補（例如
     ../economy/ → economy 的圖示與中文名）。
   - db 分類頁（../db/xxx/）與遊戲首頁錨點（../#xxx）不在 GAME_NAV，
     一律明寫 icon/label。desc 為 15 字內自撰短描述。
--------------------------------------------------------------------------- */
const RELATED = {
    school2: {
        'walkthrough': [
            { href: '../economy/', desc: '資金週轉與收支控管' },
            { href: '../challenges/', desc: '各關卡達成條件一覽' },
            { href: '../ng-plus/', desc: '二周目繼承與結算' }
        ],
        'teachers': [
            { href: '../students/', desc: '學生能力與升學培養' },
            { href: '../#teacher', icon: '👩‍🏫', label: '靠景點招募老師', desc: '用人氣景點招募強師' },
            { href: '../db/teachers/', icon: '🧑‍🏫', label: '老師資料庫', desc: '全老師五科數值表' }
        ],
        'students': [
            { href: '../teachers/', desc: '老師招募與能力養成' },
            { href: '../romance/', desc: '學生戀愛與告白' },
            { href: '../db/careers/', icon: '🎓', label: '進路資料庫', desc: '各進路條件與去向' }
        ],
        'economy': [
            { href: '../walkthrough/', desc: '序盤到通關的節奏' },
            { href: '../challenges/', desc: '各關卡達成條件一覽' },
            { href: '../maps/', desc: '五城鎮選圖建議' }
        ],
        'activities': [
            { href: '../students/', desc: '學生能力與升學培養' },
            { href: '../economy/', desc: '資金週轉與收支控管' },
            { href: '../db/events/', icon: '🎪', label: '行事活動資料庫', desc: '全年行事與活動表' }
        ],
        'challenges': [
            { href: '../economy/', desc: '資金週轉與收支控管' },
            { href: '../ng-plus/', desc: '二周目繼承與結算' },
            { href: '../db/tasks/', icon: '📝', label: '挑戰資料庫', desc: '全挑戰目標一覽表' }
        ],
        'glossary': [
            { href: '../#combo', icon: '🧩', label: '29 種景點 combo 總表', desc: '29 景點成立配方' },
            { href: '../db/facilities/', icon: '🏗️', label: '設施資料庫', desc: '全設施尺寸與解鎖' },
            { href: '../db/spots/', icon: '🎯', label: '景點資料庫', desc: '全人氣景點條件表' }
        ],
        'layouts': [
            { href: '../spot-check/', desc: '勾設施查可成景點' },
            { href: '../#combo', icon: '🧩', label: '29 種景點 combo 總表', desc: '29 景點成立配方' },
            { href: '../maps/', desc: '五城鎮地形比較' }
        ],
        'spot-check': [
            { href: '../layouts/', desc: '完美佈局實例參考' },
            { href: '../#combo', icon: '🧩', label: '29 種景點 combo 總表', desc: '29 景點成立配方' },
            { href: '../db/spots/', icon: '🎯', label: '景點資料庫', desc: '全人氣景點條件表' }
        ],
        'maps': [
            { href: '../economy/', desc: '資金週轉與收支控管' },
            { href: '../walkthrough/', desc: '序盤到通關的節奏' },
            { href: '../layouts/', desc: '健康鎮完美佈局' }
        ],
        'ng-plus': [
            { href: '../challenges/', desc: '各關卡達成條件一覽' },
            { href: '../romance/', desc: '學生戀愛與告白' },
            { href: '../economy/', desc: '資金週轉與收支控管' }
        ],
        'romance': [
            { href: '../ng-plus/', desc: '二周目繼承與結算' },
            { href: '../students/', desc: '學生能力與升學培養' },
            { href: '../db/items/', icon: '🎒', label: '道具資料庫', desc: '全道具效果一覽' }
        ],
        'secrets': [
            { href: '../db/spots/', icon: '🎯', label: '景點資料庫', desc: '全人氣景點條件表' },
            { href: '../teachers/', desc: '老師招募與能力養成' },
            { href: '../ng-plus/', desc: '二周目繼承與結算' }
        ]
    }
};

/* ---- 解析 shell.js 的 GAME_NAV 區塊 ---------------------------------- */
const GAME_NAV = (() => {
    const START = '/* <<< GAME_NAV：由 scripts/gen-game-nav.js 產生，勿手改 >>> */';
    const END = '/* <<< GAME_NAV 結束 >>> */';
    const src = fs.readFileSync(SHELL, 'utf8');
    const i = src.indexOf(START), j = src.indexOf(END);
    if (i < 0 || j < 0) { console.error('找不到 shell.js 裡的 GAME_NAV 標記區塊'); process.exit(1); }
    const block = src.slice(i + START.length, j);
    return (new Function(block + '\nreturn GAME_NAV;'))();
})();

// game → { slug(去尾斜線) : {label, icon} }。index 的 slug 為 ''。
function navMapFor(game) {
    const g = GAME_NAV[game];
    const m = {};
    if (!g) return m;
    [...(g.main || []), ...(g.more || [])].forEach(([slug, label, icon]) => {
        m[slug.replace(/\/$/, '')] = { label, icon, slug };
    });
    return m;
}

// 由 href 末段補上 icon/label（若精選表沒明寫）
function resolveLink(nav, link) {
    let { href, icon, label, desc } = link;
    if (!icon || !label) {
        const seg = href.replace(/\/$/, '').split('/').pop(); // '../economy/' → 'economy'
        const info = nav[seg];
        if (info) { icon = icon || info.icon; label = label || info.label; }
    }
    return { href, icon: icon || '📄', label: label || href, desc: desc || '' };
}

/* ---- fallback：依 GAME_NAV 取上一頁／下一頁＋資料庫 ------------------- */
function fallbackLinks(game, dirRel, depth) {
    const g = GAME_NAV[game];
    if (!g) return [];
    const up = '../'.repeat(depth);
    // main+more，排除首頁('')與 sim/
    const list = [...(g.main || []), ...(g.more || [])]
        .filter(([slug]) => slug !== '' && slug !== 'sim/');
    const selfSlug = dirRel + '/';
    const idx = list.findIndex(([slug]) => slug === selfSlug);
    const picks = [];
    if (idx > 0) picks.push(list[idx - 1]);
    if (idx >= 0 && idx < list.length - 1) picks.push(list[idx + 1]);
    const db = list.find(([slug]) => slug === 'db/');
    if (db) picks.push(db);
    const seen = new Set([selfSlug, 'sim/']);
    const out = [];
    for (const [slug, label, icon] of picks) {
        if (seen.has(slug)) continue;
        seen.add(slug);
        out.push({ href: up + slug, icon: icon || '📄', label, desc: '' });
        if (out.length >= 3) break;
    }
    return out;
}

/* ---- 產生 <section class="related"> HTML ----------------------------- */
function cardHtml(l) {
    const n = l.desc ? `<span class="n">${l.desc}</span>` : '';
    return `<a class="db-cat-card" href="${l.href}"><span class="ic">${l.icon}</span><span class="lb">${l.label}</span>${n}</a>`;
}

function sectionHtml(game, links, depth, nl) {
    const up = '../'.repeat(depth) || '../';
    const title = (GAME_NAV[game] && GAME_NAV[game].t) || '攻略';
    const cards = links.map(l => '                ' + cardHtml(l)).join(nl);
    return [
        '        <section class="related">',
        '            <h2>延伸閱讀</h2>',
        '            <div class="db-cat-grid">',
        cards,
        '            </div>',
        `            <p style="margin-top:14px"><a class="back-hub" href="${up}">← ${title} 攻略總覽</a></p>`,
        '        </section>'
    ].join(nl);
}

/* ---- 掃描並蓋章 ------------------------------------------------------- */
const MARK = /(<!-- related:start -->)[\s\S]*?(<!-- related:end -->)/;

function walk(dir, out) {
    for (const d of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, d.name);
        if (d.isDirectory()) walk(p, out);
        else if (d.isFile() && d.name.endsWith('.html')) out.push(p);
    }
}

const files = [];
if (fs.existsSync(KAIRO)) {
    for (const g of fs.readdirSync(KAIRO, { withFileTypes: true })) {
        if (g.isDirectory()) walk(path.join(KAIRO, g.name), files);
    }
}

let stamped = 0;
const report = [];
for (const file of files) {
    let content = fs.readFileSync(file, 'utf8');
    if (!MARK.test(content)) continue;

    const relFromKairo = path.relative(KAIRO, file).split(path.sep);
    const game = relFromKairo[0];
    // 頁面所在目錄相對於遊戲根（去掉 game 與結尾 index.html）
    const dirParts = relFromKairo.slice(1, -1); // e.g. ['teachers'] 或 ['db','teachers']
    const dirRel = dirParts.join('/');
    const depth = dirParts.length || 1;

    const nav = navMapFor(game);
    let links;
    const picked = RELATED[game] && RELATED[game][dirRel];
    let mode;
    if (picked) {
        links = picked.map(l => resolveLink(nav, l));
        mode = '精選';
    } else {
        links = fallbackLinks(game, dirRel, depth);
        mode = 'fallback';
    }
    if (!links.length) {
        report.push(`  ⚠ ${game}/${dirRel || 'index'}：無法產生連結（略過）`);
        continue;
    }

    const nl = content.includes('\r\n') ? '\r\n' : '\n';
    const section = sectionHtml(game, links, depth, nl);
    const replacement = `$1${nl}${section}${nl}        $2`;
    const next = content.replace(MARK, replacement);
    if (next !== content) fs.writeFileSync(file, next);
    stamped++;
    report.push(`  ✓ ${game}/${dirRel || 'index'}（${mode}，${links.length} 連結）`);
}

console.log('延伸閱讀已蓋章：' + stamped + ' 頁');
report.forEach(l => console.log(l));
