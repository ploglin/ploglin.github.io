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

    /* ---------- GA4 ---------- */
    function ensureGtag() {
        if (window.__gtagLoaded) return;
        window.__gtagLoaded = true;
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

    /* ---------- mount ---------- */
    Shell.mount = function (opts) {
        opts = opts || {};
        Shell.game = opts.game || null;
        ensureGtag();
        ensureAdsense();

        // header 置於 body 最前
        var header = buildHeader(opts.page || (Shell.game ? 'guide' : 'home'));
        document.body.insertBefore(header, document.body.firstChild);

        // 麵包屑（緊接 header 後）
        var bc = buildBreadcrumb(opts.breadcrumb);
        if (bc) header.insertAdjacentElement('afterend', bc);

        // footer 置於 body 最後（除非頁面自帶 [data-no-footer]）
        if (!document.body.hasAttribute('data-no-footer')) {
            document.body.appendChild(buildFooter());
        }

        // 送出頁面瀏覽事件（帶 game_id）
        Shell.track('page_engage', { page: opts.page || 'home' });
    };
})();
