/* ============================================================
   開羅攻略站 — Hub 首頁遊戲卡片渲染 (home.js)
   讀 window.GAMES（assets/games-index.js），把四個區塊的遊戲卡片
   長出來：精選 / 互動模擬器 / 攻略與資料表 / 全部遊戲。

   本檔同時被 scripts/gen-static.js 以 require() 載入：
   ── 產 HTML 的純函式（HOME.cardHtml / HOME.gridsHtml）完全不碰 DOM，
      建置期預渲染與瀏覽器掛載吃同一份程式碼，兩邊永遠不會走鐘。
   ── 掛載時若卡片容器已帶 data-prerendered（gen-static.js 蓋章過），
      就不重建 innerHTML，只把點擊追蹤接到既有卡片上。
   ============================================================ */
(function (root) {
    'use strict';
    var HOME = root.HOME = root.HOME || {};

    function attr(v) {
        return String(v == null ? '' : v).replace(/&/g, '&amp;').replace(/"/g, '&quot;');
    }

    /* ---- 四個區塊的定義（篩選條件＝首頁的資訊架構，只寫一次） ---- */
    HOME.SECTIONS = [
        { id: 'featuredGrid', filter: function (g) { return g.featured; } },
        // 模擬器區：凡有模擬器(sim 或 type=simulator)者，卡片直接連到 /sim/
        {
            id: 'simGrid',
            filter: function (g) { return g.sim || g.type === 'simulator'; },
            hrefFn: function (g) { return g.slug + 'sim/'; },
            badge: '🧩 佈局模擬器'
        },
        { id: 'guideGrid', filter: function (g) { return g.type === 'guide' || g.type === 'database'; } },
        { id: 'allGrid', filter: function () { return true; } }
    ];

    HOME.listFor = function (sec, games) { return (games || []).filter(sec.filter); };

    /* ---- 純函式：產 HTML 字串 ---- */

    // hrefOverride：模擬器區用來直連 /sim/；badge：額外標籤（如「模擬器」）
    HOME.cardHtml = function (g, hrefOverride, badge) {
        var live = g.status === 'live';
        var tags = (g.tags || []).map(function (t) {
            return '<span class="tag ' + t[0] + '">' + t[1] + '</span>';
        }).join('');
        if (badge) tags = '<span class="tag sim">' + badge + '</span>' + tags;
        if (!live) tags += '<span class="tag soon">即將推出</span>';

        var inner =
            '<div class="cover" style="--accent-bg:' + attr(g.accent || '') + '">' + (g.emoji || '🎮') + '</div>' +
            '<div class="body">' +
            '<div class="title">' + g.title + '</div>' +
            '<div class="jp">' + (g.jp || '') + (g.en ? '　·　' + g.en : '') + '</div>' +
            '<div class="desc">' + (g.desc || '') + '</div>' +
            '<div class="tags">' + tags + '</div>' +
            '</div>';

        if (live) return '<a class="game-card" href="' + attr(hrefOverride || g.slug) + '">' + inner + '</a>';
        return '<div class="game-card soon">' + inner + '</div>';
    };

    // { 容器 id : 該區塊卡片 HTML }（＝瀏覽器掛載後各容器的 innerHTML）
    HOME.gridsHtml = function (games) {
        var out = {};
        HOME.SECTIONS.forEach(function (sec) {
            out[sec.id] = HOME.listFor(sec, games).map(function (g) {
                return HOME.cardHtml(g, sec.hrefFn ? sec.hrefFn(g) : null, sec.badge);
            }).join('');
        });
        return out;
    };

    /* ---- 瀏覽器端掛載 ---- */
    HOME.mount = function () {
        var games = root.GAMES || [];
        HOME.SECTIONS.forEach(function (sec) {
            var box = document.getElementById(sec.id);
            if (!box) return;
            var list = HOME.listFor(sec, games);
            if (!list.length) { box.parentNode.style.display = 'none'; return; }
            if (box.getAttribute('data-prerendered') == null) {
                box.innerHTML = list.map(function (g) {
                    return HOME.cardHtml(g, sec.hrefFn ? sec.hrefFn(g) : null, sec.badge);
                }).join('');
            }
            // 卡片與 list 同序，逐一綁點擊追蹤（預渲染或現建都要綁）
            list.forEach(function (g, i) {
                var node = box.children[i];
                if (!node || node.tagName !== 'A') return;
                node.addEventListener('click', function () {
                    if (root.Shell) Shell.track('open_game', {
                        target_game: g.id,
                        game_type_target: sec.hrefFn ? 'simulator' : g.type
                    });
                });
            });
        });
    };

    if (typeof module === 'object' && module && module.exports) module.exports = HOME;
})(typeof window !== 'undefined' ? window : globalThis);
