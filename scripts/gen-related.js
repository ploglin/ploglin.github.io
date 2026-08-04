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
            { href: '../ng-plus/', desc: '二周目繼承與結算' },
            { href: '../db/tasks/', icon: '📝', label: '挑戰資料庫', desc: '9 科 40 級逐級明細' },
            { href: '../db/achievements/', icon: '🏆', label: '成就資料庫', desc: '全成就解除條件' }
        ],
        'glossary': [
            { href: '../#combo', icon: '🧩', label: '29 種景點 combo 總表', desc: '29 景點成立配方' },
            { href: '../db/facilities/', icon: '🏗️', label: '設施資料庫', desc: '全設施尺寸與解鎖' },
            { href: '../db/terms/', icon: '📖', label: '中日名詞資料庫', desc: '50 條日文名詞對照' }
        ],
        'layouts': [
            { href: 'health/', icon: '🏫', label: '健康鎮完美佈局', desc: '26×24 · 29 景點 · 164 棟' },
            { href: 'east/', icon: '🏞️', label: '冬郵小鎮完美佈局', desc: '26×26 · 29 景點 · 144 棟' },
            { href: '../spot-check/', desc: '勾設施查可成景點' }
        ],
        // 各鎮子頁在 layouts/<鎮>/，相對路徑要多退一層（gen-game-nav 只掃第一層，
        // 所以這些子頁不進遊戲功能列，橫向切換由各鎮頁上方的城鎮 pills 負責）
        // 五鎮互推：每鎮推「地形最相近的 2 鎮」＋佈局設計原則。
        // 相近度依 db/towns 的尺寸／段差／水場排：health 標準少水、east 26×26 水多段差已設通道、
        // lake 24×24 三分之一水面、valley 26×26 多層、hill 26×26 斜面最少。
        // 排完每一鎮都至少被推薦一次（舊設定只推 health 與 east，lake/valley/hill 永遠不被推薦）。
        'layouts/health': [
            { href: '../hill/', icon: '⛰️', label: '百靈山丘完美佈局', desc: '同樣斜面最少、好排 4×4' },
            { href: '../east/', icon: '🏞️', label: '冬郵小鎮完美佈局', desc: '段差只有 1 處且已設通道' },
            { href: '../', icon: '🗺️', label: '佈局設計原則', desc: '五鎮共用的排法通則' }
        ],
        'layouts/east': [
            { href: '../lake/', icon: '🏞️', label: '湖岸小鎮完美佈局', desc: '同樣 4 處水場要繞' },
            { href: '../hill/', icon: '⛰️', label: '百靈山丘完美佈局', desc: '同樣 26×26、段差極少' },
            { href: '../', icon: '🗺️', label: '佈局設計原則', desc: '五鎮共用的排法通則' }
        ],
        'layouts/lake': [
            { href: '../east/', icon: '🏞️', label: '冬郵小鎮完美佈局', desc: '同樣 4 處水場要繞' },
            { href: '../health/', icon: '🏫', label: '健康鎮完美佈局', desc: '尺寸最接近的標準圖' },
            { href: '../', icon: '🗺️', label: '佈局設計原則', desc: '五鎮共用的排法通則' }
        ],
        'layouts/valley': [
            { href: '../hill/', icon: '⛰️', label: '百靈山丘完美佈局', desc: '同樣 26×26 的丘陵地形' },
            { href: '../east/', icon: '🏞️', label: '冬郵小鎮完美佈局', desc: '同樣 26×26、可比對通道做法' },
            { href: '../', icon: '🗺️', label: '佈局設計原則', desc: '五鎮共用的排法通則' }
        ],
        'layouts/hill': [
            { href: '../east/', icon: '🏞️', label: '冬郵小鎮完美佈局', desc: '同樣 26×26、段差極少' },
            { href: '../valley/', icon: '🏔️', label: '溪谷小鎮完美佈局', desc: '同樣 26×26 的丘陵地形' },
            { href: '../', icon: '🗺️', label: '佈局設計原則', desc: '五鎮共用的排法通則' }
        ],
        'spot-check': [
            { href: '../layouts/', desc: '完美佈局實例參考' },
            { href: '../#combo', icon: '🧩', label: '29 種景點 combo 總表', desc: '29 景點成立配方' },
            { href: '../db/spots/', icon: '🎯', label: '景點資料庫', desc: '全人氣景點條件表' }
        ],
        'maps': [
            { href: '../economy/', desc: '資金週轉與收支控管' },
            { href: '../walkthrough/', desc: '序盤到通關的節奏' },
            { href: '../layouts/', desc: '五鎮的完整佈局規劃圖' }
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
        ],

        /* ---- db 分類頁（14 個）------------------------------------------------
           必須明寫：db 頁的 slug（'db/spots'）不在 GAME_NAV 裡，fallbackLinks()
           找不到 selfSlug → idx = -1 → 只會產出「資料庫」一條連結。
           每頁 3 條按**任務**選而非按主題：教你怎麼用這張表的攻略頁／消費它的
           工具／下一張會用到的表。相對路徑：攻略頁 '../../x/'、同層 db 分類 '../x/'。
        ---------------------------------------------------------------------- */
        // 注意：不要把「頁面內嵌這張表」的那一頁再放進 RELATED——gen-embed.js 的
        // usedby 區塊已經自動列出全部內文入口，重覆放等於同一畫面出現兩張一樣的卡。
        'db/spots': [
            { href: '../../sim/', icon: '🧩', label: '佈局模擬器', desc: '擺上去即時判定成立' },
            { href: '../facilities/', icon: '🏗️', label: '設施資料庫', desc: '查三種設施的佔地尺寸' },
            { href: '../../layouts/', icon: '🗺️', label: '佈局範例集', desc: '29 個一次全開的實例' }
        ],
        'db/facilities': [
            { href: '../../layouts/', icon: '🗺️', label: '佈局範例集', desc: '尺寸怎麼影響 4×4 排法' },
            { href: '../../sim/', icon: '🧩', label: '佈局模擬器', desc: '照尺寸實際排一次' },
            { href: '../spots/', icon: '🎯', label: '人氣景點資料庫', desc: '反查這棟能湊哪些景點' }
        ],
        'db/teachers': [
            { href: '../../teachers/', icon: '👩‍🏫', label: '老師培育攻略', desc: '怎麼挑、怎麼養、何時裁' },
            { href: '../spots/', icon: '🎯', label: '人氣景點資料庫', desc: '哪個景點才招得到他' },
            { href: '../lessons/', icon: '📚', label: '特別授業資料庫', desc: '老師產的 P 開什麼課' }
        ],
        'db/students': [
            { href: '../../students/', icon: '🎓', label: '學生養成攻略', desc: '五科初期值怎麼補' },
            { href: '../careers/', icon: '🎓', label: '進路資料庫', desc: '這批學生能推到哪' },
            { href: '../items/', icon: '🎒', label: '道具資料庫', desc: '用題本補缺的屬性' }
        ],
        'db/clubs': [
            { href: '../../teachers/', icon: '👩‍🏫', label: '老師培育攻略', desc: '靠老師勸誘學生入社' },
            { href: '../ranks/', icon: '🏅', label: '學校排名資料庫', desc: '常春藤要 8 社優勝' },
            { href: '../facilities/', icon: '🏗️', label: '設施資料庫', desc: '成立條件要蓋哪幾棟' }
        ],
        'db/careers': [
            { href: '../../students/', icon: '🎓', label: '學生養成攻略', desc: '把志願推上高年收' },
            { href: '../students/', icon: '🧑‍🎓', label: '學生名冊資料庫', desc: '看初期值決定推誰' },
            { href: '../tasks/', icon: '📝', label: '挑戰資料庫', desc: '學力靠課題逐級堆' }
        ],
        'db/events': [
            { href: '../items/', icon: '🎒', label: '道具資料庫', desc: '首辦褒賞的長期用法' },
            { href: '../ranks/', icon: '🏅', label: '學校排名資料庫', desc: '規模才是解鎖鑰匙' },
            { href: '../../economy/', icon: '💰', label: '經營與資金攻略', desc: '行事預算從哪裡來' }
        ],
        'db/lessons': [
            { href: '../teachers/', icon: '🧑‍🏫', label: '老師資料庫', desc: '研究P 全靠老師產' },
            { href: '../tasks/', icon: '📝', label: '挑戰資料庫', desc: '學力拉高就去過課題' },
            { href: '../ranks/', icon: '🏅', label: '學校排名資料庫', desc: '哪一階解鎖哪批授業' }
        ],
        'db/ranks': [
            { href: '../spots/', icon: '🎯', label: '人氣景點資料庫', desc: '種數是最常卡的一欄' },
            { href: '../clubs/', icon: '🎽', label: '社團資料庫', desc: '常春藤的 8 社優勝' },
            { href: '../facilities/', icon: '🏗️', label: '設施資料庫', desc: '每一階解鎖哪些設施' }
        ],
        'db/items': [
            { href: '../events/', icon: '🎪', label: '行事活動資料庫', desc: '移動與賺錢道具的來源' },
            { href: '../students/', icon: '🧑‍🎓', label: '學生名冊資料庫', desc: '決定題本要餵給誰' },
            { href: '../../romance/', icon: '💘', label: '戀愛與告白攻略', desc: '天使弓箭怎麼用' }
        ],
        'db/tasks': [
            { href: '../../challenges/', icon: '🏆', label: '挑戰目標攻略', desc: '每月 2 次怎麼排' },
            { href: '../facilities/', icon: '🏗️', label: '設施資料庫', desc: '發現條件要先蓋什麼' },
            { href: '../ranks/', icon: '🏅', label: '學校排名資料庫', desc: '後段課題要規模才開' }
        ],
        'db/towns': [
            { href: '../../maps/', icon: '🗾', label: '五城鎮地圖選擇', desc: '開局選哪張圖' },
            { href: '../../layouts/', icon: '🗺️', label: '佈局範例集', desc: '五鎮各有一張完美佈局' },
            { href: '../facilities/', icon: '🏗️', label: '設施資料庫', desc: '初期設施是什麼' }
        ],
        'db/achievements': [
            { href: '../../challenges/', icon: '🏆', label: '挑戰目標攻略', desc: '課題等級怎麼練滿' },
            { href: '../tasks/', icon: '📝', label: '挑戰資料庫', desc: '5 科全滿的逐級明細' },
            { href: '../clubs/', icon: '🎽', label: '社團資料庫', desc: '優勝成就從社團來' }
        ],
        'db/terms': [
            { href: '../../glossary/', icon: '📖', label: '中日對照表', desc: '設施與景點的中日名' },
            { href: '../facilities/', icon: '🏗️', label: '設施資料庫', desc: '77 種設施的日文原名' },
            { href: '../spots/', icon: '🎯', label: '人氣景點資料庫', desc: '29 種景點的日文原名' }
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
