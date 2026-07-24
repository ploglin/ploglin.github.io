/* ============================================================
   開羅攻略站 — 共用外殼 (shell.js)
   注入站台 header / footer；封裝 GA4 事件（自動帶 game_id）。
   SEO meta（title/description/canonical/OG/JSON-LD）仍由各頁靜態手寫，
   本檔不負責注入那些（社群爬蟲不執行 JS）。
   用法：頁面底部
     <script src="/assets/shell.js"></script>
     <script>Shell.mount({ page:'guide', game:{id:'school2',type:'simulator'},
                            breadcrumb:[{t:'口袋學院物語2'}] });</script>
   ============================================================ */
(function () {
    'use strict';

    var GA_ID = 'G-EL4J27F89B';
    var ADS_CLIENT = 'ca-pub-5891811504833462';
    var SITE = '開羅攻略站';

    // 依頁面深度推導站根相對路徑（根 = '', kairosoft/school2/ = '../../'）
    function rootPrefix() {
        var p = location.pathname;
        // 去掉檔名
        var dir = p.replace(/[^\/]*$/, '');
        var depth = dir.split('/').filter(Boolean).length;
        return depth ? new Array(depth + 1).join('../') : './';
    }

    var Shell = window.Shell = window.Shell || {};
    Shell.game = null;
    Shell.root = rootPrefix();

    function href(path) { return Shell.root + path; }

    /* ---------- 深/淺色（手動覆蓋系統，記在 localStorage） ---------- */
    function currentTheme() {
        var t = document.documentElement.getAttribute('data-theme');
        if (t === 'dark' || t === 'light') return t;
        return (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) ? 'dark' : 'light';
    }
    function applyTheme() {
        var t = null;
        try { t = localStorage.getItem('kairo_theme'); } catch (e) { }
        if (t === 'dark' || t === 'light') document.documentElement.setAttribute('data-theme', t);
    }
    function updateThemeBtn() {
        var b = document.getElementById('themeBtn');
        if (b) { var dark = currentTheme() === 'dark'; b.textContent = dark ? '☀️' : '🌙'; b.title = dark ? '切換為淺色' : '切換為深色'; }
    }
    Shell.toggleTheme = function () {
        var next = currentTheme() === 'dark' ? 'light' : 'dark';
        document.documentElement.setAttribute('data-theme', next);
        try { localStorage.setItem('kairo_theme', next); } catch (e) { }
        updateThemeBtn();
        if (window.Shell && Shell.track) Shell.track('theme_toggle', { theme: next });
    };
    applyTheme();

    /* ---------- GA4 ---------- */
    function ensureGtag() {
        if (window.__gtagLoaded) return;
        window.__gtagLoaded = true;
        // 若頁面已靜態載入 gtag（例如首頁 <head>），不重複初始化，避免重複計數
        if (document.querySelector('script[src*="googletagmanager.com/gtag/js"]')) return;
        window.dataLayer = window.dataLayer || [];
        window.gtag = window.gtag || function () { window.dataLayer.push(arguments); };
        var s = document.createElement('script');
        s.async = true;
        s.src = 'https://www.googletagmanager.com/gtag/js?id=' + GA_ID;
        document.head.appendChild(s);
        gtag('js', new Date());
        gtag('config', GA_ID);
    }

    /* ---------- Google AdSense ---------- */
    function ensureAdsense() {
        if (window.__adsenseLoaded || !ADS_CLIENT) return;
        // 若頁面已靜態放了 AdSense 代碼（例如首頁），不重複載入
        if (document.querySelector('script[src*="adsbygoogle.js"]')) { window.__adsenseLoaded = true; return; }
        window.__adsenseLoaded = true;
        var s = document.createElement('script');
        s.async = true;
        s.src = 'https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=' + ADS_CLIENT;
        s.crossOrigin = 'anonymous';
        document.head.appendChild(s);
    }

    // 統一事件封裝：自動帶 game_id / game_type
    Shell.track = function (event, params) {
        try {
            if (!window.gtag) return;
            var base = {
                game_id: (Shell.game && Shell.game.id) || 'site',
                game_type: (Shell.game && Shell.game.type) || 'site'
            };
            gtag('event', event, Object.assign(base, params || {}));
        } catch (e) { /* 靜默 */ }
    };

    /* ---------- header ---------- */
    function buildHeader(active) {
        var nav = [
            { key: 'home', t: '首頁', href: href('index.html') },
            { key: 'sim', t: '模擬器', href: href('index.html') + '#simulators' },
            { key: 'guide', t: '攻略', href: href('index.html') + '#guides' },
            { key: 'about', t: '關於', href: href('about.html') }
        ];
        var links = nav.map(function (n) {
            var cls = (n.key === active) ? ' class="active"' : '';
            return '<a href="' + n.href + '"' + cls + '>' + n.t + '</a>';
        }).join('');

        var el = document.createElement('header');
        el.className = 'site-header';
        el.innerHTML =
            '<div class="bar">' +
            '<a class="site-logo" href="' + href('index.html') + '">' +
            '<span class="mark">🕹️</span><span>' + SITE + '</span></a>' +
            '<nav class="site-nav">' + links + '</nav>' +
            '<button class="theme-btn" id="themeBtn" type="button" aria-label="切換深淺色">🌙</button>' +
            '</div>';
        return el;
    }

    /* ---------- footer ---------- */
    function buildFooter() {
        var el = document.createElement('footer');
        el.className = 'site-footer';
        el.innerHTML =
            '<div class="container">' +
            '<div class="cols">' +
            '<div class="fcol" style="max-width:320px">' +
            '<div class="h">' + SITE + '</div>' +
            '<div style="color:var(--ink-soft);font-size:13px">非官方粉絲攻略站，整理開羅遊戲（カイロソフト／Kairosoft）各作的繁體中文攻略與互動模擬器。遊戲名稱與內容之著作權均屬 Kairosoft Co., Ltd. 所有。</div>' +
            '</div>' +
            '<div class="fcol"><div class="h">網站</div>' +
            '<a href="' + href('index.html') + '">首頁</a>' +
            '<a href="' + href('about.html') + '">關於本站</a>' +
            '<a href="' + href('privacy/index.html') + '">隱私權政策</a>' +
            '</div>' +
            '<div class="fcol"><div class="h">熱門攻略</div>' +
            '<a href="' + href('kairosoft/school2/') + '">口袋學院物語2</a>' +
            '<a href="' + href('kairosoft/ooedo/') + '">大江戶物語</a>' +
            '<a href="' + href('kairosoft/game-dev-story/') + '">遊戲發展國++</a>' +
            '</div>' +
            '</div>' +
            '<div class="legal">© ' + siteYear() + ' ' + SITE + '。本站為玩家自製之非官方攻略，與 Kairosoft Co., Ltd. 無隸屬關係。' +
            '資料參考自官方遊戲、Kairosoft Wiki 等公開來源並經重新整理。本站使用 Cookie 進行流量分析（Google Analytics）；詳見<a href="' + href('privacy/index.html') + '">隱私權政策</a>。</div>' +
            '</div>';
        return el;
    }

    // 固定年份字串（避免逐年手改；此值僅顯示用）
    function siteYear() { return '2026'; }

    /* ---------- 遊戲內功能列（店中店）----------
       進入任何一款遊戲的任一頁，都會在站台 header 下方出現這款遊戲自己的
       功能列：遊戲名 ＋ 攻略／模擬器／資料庫…等分頁，並標出目前所在頁。
       資料由 scripts/gen-game-nav.js 掃描實際檔案產生，頁面端不需任何設定。 */

    /* <<< GAME_NAV：由 scripts/gen-game-nav.js 產生，勿手改 >>> */
    var GAME_NAV = {
        "school2": { e: "🏫", t: "口袋學院物語2", j: "名門ポケット学院2", a: "#e6f4ec",
            main: [["","攻略總覽","📄"],["sim/","佈局模擬器","🧩"],["db/","資料庫","📚"]],
            more: [["layouts/","佈局範例","🗺️","tool"],["spot-check/","景點檢查器","🔎","tool"],["walkthrough/","流程攻略","🧭","guide"],["teachers/","老師培育","👩‍🏫","guide"],["students/","學生養成","🎓","guide"],["economy/","經營與資金","💰","guide"],["activities/","行事與活動","🎪","guide"],["challenges/","挑戰目標","🏆","guide"],["maps/","五城鎮地圖","🗾","guide"],["ng-plus/","二周目與結算","🔁","guide"],["romance/","戀愛與告白","💘","guide"],["secrets/","隱藏要素","🛸","guide"],["glossary/","中日對照","📖","guide"]] },
        "ooedo": { e: "🏯", t: "大江戶物語", j: "大江戸タウンズ", a: "#fdeee0",
            main: [["","攻略總覽","📄"],["sim/","佈局模擬器","🧩"],["db/","資料庫","📚"]],
            more: [] },
        "game-dev-story": { e: "🎮", t: "遊戲發展國++", j: "ゲーム発展国++", a: "#e9f0ff",
            main: [["","攻略總覽","📄"]],
            more: [] },
        "hotspring": { e: "♨️", t: "溫泉物語", j: "ゆけむり温泉郷", a: "#e9f4f6",
            main: [["","攻略總覽","📄"],["db/","資料庫","📚"]],
            more: [] },
        "mega-mall2": { e: "🛍️", t: "都市大亨物語2", j: "メガモール物語2", a: "#f3e9ff",
            main: [["","攻略總覽","📄"],["sim/","佈局模擬器","🧩"],["db/","資料庫","📚"]],
            more: [] },
        "dream-town": { e: "🏘️", t: "夢想小鎮", j: "夢おこ町ドリームタウン", a: "#e9f0ff",
            main: [["","攻略總覽","📄"],["sim/","佈局模擬器","🧩"],["db/","資料庫","📚"]],
            more: [] },
        "dream-park": { e: "🎡", t: "遊樂園夢物語", j: "ゆうえんち", a: "#ffeef2",
            main: [["","攻略總覽","📄"],["db/","資料庫","📚"]],
            more: [] },
        "dungeon-village": { e: "⚔️", t: "冒險村物語", j: "冒険ダンジョン村", a: "#f1ece2",
            main: [["","攻略總覽","📄"]],
            more: [] },
        "ramen": { e: "🍜", t: "開羅拉麵店物語", j: "大繁盛！ラーメン", a: "#fdeee0",
            main: [["","攻略總覽","📄"],["db/","資料庫","📚"]],
            more: [] },
        "bonbon": { e: "🍰", t: "甜點物語", j: "洋菓子店ローズ", a: "#ffeef2",
            main: [["","攻略總覽","📄"],["db/","資料庫","📚"]],
            more: [] },
        "sushi": { e: "🍣", t: "海鮮壽司物語", j: "海鮮！！すし街道", a: "#eaf4ee",
            main: [["","攻略總覽","📄"],["db/","資料庫","📚"]],
            more: [] },
        "high-sea-saga": { e: "🏴‍☠️", t: "大海賊探險物語", j: "大航海クエスト島", a: "#e6f4ec",
            main: [["","攻略總覽","📄"]],
            more: [] },
        "beastie-bay": { e: "🏝️", t: "開拓神秘島", j: "冒険とバザーとダンジョン島", a: "#e9f4f6",
            main: [["","攻略總覽","📄"]],
            more: [] },
        "grand-prix": { e: "🏎️", t: "賽車物語", j: "G1グランプリ", a: "#fdeee0",
            main: [["","攻略總覽","📄"]],
            more: [] },
        "8bit-farm": { e: "🌾", t: "像素牧場物語", j: "8ビットファーム", a: "#e6f4ec",
            main: [["","攻略總覽","📄"]],
            more: [] },
        "ninja-village": { e: "🥷", t: "忍者村物語", j: "忍者村", a: "#f1ece2",
            main: [["","攻略總覽","📄"],["db/","資料庫","📚"]],
            more: [] },
        "astro": { e: "🚀", t: "太空殖民地物語", j: "ワンダープラネット", a: "#e9f0ff",
            main: [["","攻略總覽","📄"],["db/","資料庫","📚"]],
            more: [] },
        "zoo": { e: "🦁", t: "動物園物語", j: "動物園", a: "#e6f4ec",
            main: [["","攻略總覽","📄"],["sim/","佈局模擬器","🧩"],["db/","資料庫","📚"]],
            more: [] },
        "airport": { e: "✈️", t: "機場物語", j: "ジャンボ空港物語", a: "#e9f4f6",
            main: [["","攻略總覽","📄"],["sim/","佈局模擬器","🧩"],["db/","資料庫","📚"]],
            more: [] },
        "burger": { e: "🍔", t: "漢堡店物語", j: "創作ハンバーガー堂", a: "#fdeee0",
            main: [["","攻略總覽","📄"],["db/","資料庫","📚"]],
            more: [] },
        "cafeteria": { e: "🍱", t: "客滿餐廳物語", j: "大盛りグルメ食堂", a: "#fff2e0",
            main: [["","攻略總覽","📄"],["db/","資料庫","📚"]],
            more: [] },
        "convenience": { e: "🏪", t: "便利商店開業日記", j: "ザ・コンビニ", a: "#eaf4ee",
            main: [["","攻略總覽","📄"],["db/","資料庫","📚"]],
            more: [] },
        "clothier": { e: "👗", t: "時尚洋裝店物語", j: "ポケットファッション", a: "#ffeef2",
            main: [["","攻略總覽","📄"],["db/","資料庫","📚"]],
            more: [] },
        "stables": { e: "🐎", t: "賽馬牧場物語", j: "G1牧場ステークス", a: "#f1ece2",
            main: [["","攻略總覽","📄"]],
            more: [] },
        "soccer-club": { e: "⚽", t: "足球俱樂部物語", j: "サッカークラブ物語", a: "#e6f4ec",
            main: [["","攻略總覽","📄"]],
            more: [] },
        "kingdom": { e: "🏰", t: "開拓勇者村", j: "開拓ぼくらの勇者村", a: "#fdeee0",
            main: [["","攻略總覽","📄"]],
            more: [] },
        "harvest": { e: "🚜", t: "大農場物語", j: "ポケット大農園", a: "#e6f4ec",
            main: [["","攻略總覽","📄"],["sim/","佈局模擬器","🧩"],["db/","資料庫","📚"]],
            more: [] },
        "school1": { e: "🏫", t: "口袋學院物語", j: "名門ポケット学院", a: "#e6f4ec",
            main: [["","攻略總覽","📄"],["sim/","佈局模擬器","🧩"],["db/","資料庫","📚"]],
            more: [] },
        "arcade": { e: "🕹️", t: "遊戲中心物語加強版", j: "ゲームセンター倶楽部DX", a: "#e9f0ff",
            main: [["","攻略總覽","📄"]],
            more: [] }
    };
    /* <<< GAME_NAV 結束 >>> */

    // 由網址推導：目前在哪一款遊戲、位於遊戲根目錄下的哪一層
    function detectGame() {
        var p = location.pathname.replace(/\\/g, '/');
        var m = p.match(/kairosoft\/([^\/]+)\//);
        if (!m) return null;
        var cfg = GAME_NAV[m[1]];
        if (!cfg) return null;
        var after = p.slice(m.index + m[0].length);   // 例：db/spots/index.html
        var dir = after.replace(/[^\/]*$/, '');       // 例：db/spots/
        var segs = dir.split('/').filter(Boolean);
        return {
            id: m[1], cfg: cfg,
            up: segs.length ? new Array(segs.length + 1).join('../') : './',
            active: segs.length ? segs[0] + '/' : ''
        };
    }

    function buildGameBar(g, compact) {
        var el = document.createElement('div');
        el.className = 'game-bar' + (compact ? ' gb-compact' : '');

        function link(item, cls) {
            var on = item[0] === g.active ? ' on' : '';
            return '<a class="' + cls + on + '" href="' + g.up + item[0] + '">' +
                '<span class="gb-i">' + (item[2] || '') + '</span>' + item[1] + '</a>';
        }

        var tabs = g.cfg.main.map(function (it) { return link(it, 'gb-tab'); }).join('');
        var more = '';
        if (g.cfg.more.length) {
            var GH = { tool: '工具', guide: '主題攻略' };
            var prev = null;
            var menu = g.cfg.more.map(function (it) {
                var h = '', grp = it[3];
                // group 換組且屬已知群組 → 先插群組小標（未知/缺欄不插，向下相容）
                if (grp && grp !== prev && GH[grp]) h = '<div class="gb-mh">' + GH[grp] + '</div>';
                prev = grp;
                return h + link(it, 'gb-mitem');
            }).join('');
            // 當前頁在下拉內時，「更多攻略」鈕本身加 .on（它有 gb-tab class，樣式直接生效）
            var moreOn = g.cfg.more.some(function (it) { return it[0] === g.active; }) ? ' on' : '';
            more = '<div class="gb-more">' +
                '<button type="button" class="gb-tab gb-morebtn' + moreOn + '" aria-expanded="false">更多攻略 ▾</button>' +
                '<div class="gb-menu">' + menu + '</div>' +
                '</div>';
        }

        // 全螢幕工具（模擬器）自己沒有站台 header，這裡補一個回站台的入口
        var home = compact
            ? '<a class="gb-home" href="' + g.up + '../../index.html" title="回到' + SITE + '">🕹️</a>'
            : '';

        el.innerHTML =
            '<div class="gb-inner">' + home +
            '<a class="gb-title" href="' + g.up + '">' +
            '<span class="gb-emoji">' + g.cfg.e + '</span>' +
            '<span class="gb-name"><b>' + g.cfg.t + '</b><i>' + (g.cfg.j || '') + '</i></span></a>' +
            '<nav class="gb-nav">' + tabs + '</nav>' + more +
            '</div>';

        // 「更多」下拉
        var btn = el.querySelector('.gb-morebtn');
        if (btn) {
            var menu = el.querySelector('.gb-menu');
            btn.addEventListener('click', function (e) {
                e.stopPropagation();
                var open = menu.classList.toggle('open');
                btn.setAttribute('aria-expanded', open ? 'true' : 'false');
            });
            document.addEventListener('click', function () {
                menu.classList.remove('open'); btn.setAttribute('aria-expanded', 'false');
            });
        }
        // 目前分頁捲進視野（手機上功能列可橫向捲動）
        var cur = el.querySelector('.gb-tab.on');
        if (cur && cur.scrollIntoView) {
            try { cur.scrollIntoView({ block: 'nearest', inline: 'center' }); } catch (err) { }
        }
        return el;
    }

    /* ---------- 給全螢幕工具用的精簡功能列 ----------
       模擬器是 h-screen flex 版面、用 Tailwind 而非 shell.css，
       所以這裡不注入站台 header/footer，也自帶樣式，不去動它原本的排版。 */
    var BAR_CSS =
        '.game-bar{flex-shrink:0;background:#f4f8f5;border-bottom:1px solid #dde5e0;font-family:"Noto Sans TC","Inter",system-ui,sans-serif}' +
        '.game-bar .gb-inner{display:flex;align-items:center;gap:12px;padding:6px 14px}' +
        '.game-bar a{text-decoration:none}' +
        '.gb-home{display:inline-grid;place-items:center;width:32px;height:32px;border-radius:8px;background:#16794a;color:#fff;font-size:16px;flex-shrink:0}' +
        '.gb-title{display:inline-flex;align-items:center;gap:8px;color:#1c2b24;flex-shrink:0}' +
        '.gb-emoji{display:inline-grid;place-items:center;width:30px;height:30px;border-radius:8px;background:#fff;border:1px solid #dde5e0;font-size:17px}' +
        '.gb-name{display:flex;flex-direction:column;line-height:1.15}' +
        '.gb-name b{font-size:14px;font-weight:900}' +
        '.gb-name i{font-style:normal;font-size:10.5px;color:#7b8a82;font-weight:700}' +
        '.gb-nav{display:flex;align-items:center;gap:3px;margin-left:auto;overflow-x:auto;scrollbar-width:none}' +
        '.gb-nav::-webkit-scrollbar{display:none}' +
        '.gb-tab{display:inline-flex;align-items:center;gap:5px;padding:6px 11px;border-radius:8px;font-size:13px;font-weight:800;color:#4b5b53;white-space:nowrap;border:1px solid transparent;background:none;font-family:inherit;cursor:pointer}' +
        '.gb-tab:hover{background:#fff;color:#0f5d38}' +
        '.gb-tab.on{background:#fff;color:#0f5d38;border-color:#a8cfba}' +
        '.gb-more{position:relative;flex-shrink:0}' +
        '.gb-menu{display:none;position:absolute;right:0;top:calc(100% + 6px);min-width:170px;max-height:70vh;overflow-y:auto;padding:6px;background:#fff;border:1px solid #dde5e0;border-radius:12px;box-shadow:0 10px 30px rgba(0,0,0,.14);z-index:60}' +
        '.gb-menu.open{display:block}' +
        '.gb-mh{font-size:11px;font-weight:800;color:#7b8a82;padding:6px 10px 2px}' +
        '.gb-mitem + .gb-mh{margin-top:4px;border-top:1px solid #dde5e0;padding-top:8px}' +
        '.gb-mitem{display:flex;align-items:center;gap:8px;padding:8px 10px;border-radius:8px;font-size:13px;font-weight:700;color:#4b5b53;white-space:nowrap}' +
        '.gb-mitem:hover{background:#e6f4ec;color:#0f5d38}' +
        '@media(max-width:720px){.gb-name i{display:none}.gb-tab{padding:5px 9px;font-size:12.5px}}';

    Shell.mountBar = function (opts) {
        opts = opts || {};
        var g = detectGame();
        if (!g) return;
        var st = document.createElement('style');
        st.textContent = BAR_CSS;
        document.head.appendChild(st);
        document.body.insertBefore(buildGameBar(g, true), document.body.firstChild);
        Shell.game = opts.game || { id: g.id, type: 'simulator' };
        // 版面高度變了，讓工具自己重算（模擬器用 resize 觸發 fitGrid）
        try { window.dispatchEvent(new Event('resize')); } catch (e) { }
    };

    /* ---------- 麵包屑 ---------- */
    function buildBreadcrumb(items) {
        if (!items || !items.length) return null;
        var parts = ['<a href="' + href('index.html') + '">首頁</a>'];
        items.forEach(function (it) {
            parts.push('<span class="sep">›</span>');
            parts.push(it.href ? '<a href="' + it.href + '">' + it.t + '</a>' : '<span>' + it.t + '</span>');
        });
        var wrap = document.createElement('div');
        wrap.className = 'container';
        wrap.innerHTML = '<nav class="breadcrumb">' + parts.join('') + '</nav>';
        return wrap;
    }

    /* ---------- 章節浮動導覽（☰ 目錄 + ↑ 回頂端），自動由 h2[id] 生成 ---------- */
    function buildPageNav() {
        var heads = [].slice.call(document.querySelectorAll('.prose h2[id], main.article h2[id]'))
            .filter(function (h) { return h.id; });
        if (heads.length < 2) return;

        var box = document.createElement('div'); box.className = 'pagenav';
        var menu = document.createElement('div'); menu.className = 'pagenav-menu';
        menu.innerHTML = '<div class="pagenav-h">章節目錄</div>';
        heads.forEach(function (h) {
            var a = document.createElement('a');
            a.href = '#' + h.id;
            a.textContent = h.textContent.replace(/\s+/g, ' ').trim();
            a.addEventListener('click', function () { menu.classList.remove('open'); });
            menu.appendChild(a);
        });

        var tocBtn = document.createElement('button');
        tocBtn.className = 'pagenav-btn'; tocBtn.type = 'button'; tocBtn.title = '章節目錄'; tocBtn.textContent = '☰';
        var topBtn = document.createElement('button');
        topBtn.className = 'pagenav-btn pagenav-top'; topBtn.type = 'button'; topBtn.title = '回到頂端'; topBtn.textContent = '↑';
        topBtn.style.display = 'none';

        box.appendChild(menu); box.appendChild(topBtn); box.appendChild(tocBtn);
        document.body.appendChild(box);

        tocBtn.addEventListener('click', function (e) { e.stopPropagation(); menu.classList.toggle('open'); });
        topBtn.addEventListener('click', function () { window.scrollTo({ top: 0, behavior: 'smooth' }); if (window.Shell) Shell.track('nav_top', {}); });
        document.addEventListener('click', function (e) { if (!box.contains(e.target)) menu.classList.remove('open'); });
        function onScroll() { topBtn.style.display = window.pageYOffset > 400 ? '' : 'none'; }
        onScroll(); window.addEventListener('scroll', onScroll, { passive: true });
    }

    /* ---------- mount ---------- */
    Shell.mount = function (opts) {
        opts = opts || {};
        Shell.game = opts.game || null;
        ensureGtag();
        ensureAdsense();

        // header 置於 body 最前
        var header = buildHeader(opts.page || (Shell.game ? 'guide' : 'home'));
        document.body.insertBefore(header, document.body.firstChild);
        var tb = document.getElementById('themeBtn');
        if (tb) tb.addEventListener('click', Shell.toggleTheme);
        updateThemeBtn();

        // 量測 header 實際高度 → --hdr-h，供功能列 sticky 定位與錨點捲動偏移使用
        // （導覽會換行，高度不是固定值，不能寫死）
        function syncHeaderH() {
            document.documentElement.style.setProperty('--hdr-h', header.offsetHeight + 'px');
        }
        syncHeaderH();
        window.addEventListener('resize', syncHeaderH, { passive: true });
        if (window.requestAnimationFrame) requestAnimationFrame(syncHeaderH);

        // 遊戲功能列（緊接 header 後）；並把遊戲色系掛到 <body> 上
        var anchor = header;
        var gm = detectGame();
        if (gm) {
            document.body.setAttribute('data-game', gm.id);
            if (gm.cfg.a) document.body.style.setProperty('--game-accent', gm.cfg.a);
            var gbar = buildGameBar(gm);
            header.insertAdjacentElement('afterend', gbar);
            anchor = gbar;
        }

        // 麵包屑（接在功能列或 header 之後）
        var bc = buildBreadcrumb(opts.breadcrumb);
        if (bc) anchor.insertAdjacentElement('afterend', bc);

        // footer 置於 body 最後（除非頁面自帶 [data-no-footer]）
        if (!document.body.hasAttribute('data-no-footer')) {
            document.body.appendChild(buildFooter());
        }

        // 章節浮動導覽（攻略頁）
        buildPageNav();

        // 送出頁面瀏覽事件（帶 game_id）
        Shell.track('page_engage', { page: opts.page || 'home' });
    };
})();
