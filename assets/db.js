/* ============================================================
   開羅攻略站 — 資料庫瀏覽元件 (db.js)
   讀 window.GAME_DB，渲染「每分類獨立頁」的可搜尋/排序表格、
   自訂比較（晶片挑選 + 並排比較），以及資料庫索引頁。

   本檔同時被 scripts/gen-static.js 以 require() 載入：
   ── 產 HTML 的純函式（DB.categoryHtml / DB.indexHtml）完全不碰 DOM，
      建置期預渲染與瀏覽器掛載吃同一份程式碼，兩邊永遠不會走鐘。
   ── 掛載時若 #dbApp 已帶 data-prerendered（gen-static.js 蓋章過），
      就不重建 innerHTML，只把事件接到既有節點上（免閃爍、DOM=原始碼）。
   ============================================================ */
(function (root) {
    'use strict';
    var DB = root.DB = root.DB || {};

    /* ---- 純函式：產 HTML 字串（Node 與瀏覽器共用，不可使用 document） ---- */

    // 屬性值轉義；儲存格與標籤內容沿用 innerHTML 語意（不轉義）
    function attr(v) {
        return String(v == null ? '' : v).replace(/&/g, '&amp;').replace(/"/g, '&quot;');
    }
    function cell(v) { return v == null ? '' : v; }

    function catOf(d, catKey) {
        return d && d.categories ? d.categories.filter(function (c) { return c.key === catKey; })[0] : null;
    }

    function cntText(shown, total) { return '共 ' + shown + ' / ' + total + ' 筆'; }

    // 分類切換晶片列
    function catNavHtml(d, activeKey, fromIndex) {
        return '<nav class="db-nav">' + d.categories.map(function (c) {
            var href = fromIndex ? (c.slug + '/') : ('../' + c.slug + '/');
            return '<a class="db-chip' + (c.key === activeKey ? ' active' : '') + '" href="' + attr(href) + '">' +
                (c.icon ? c.icon + ' ' : '') + c.label + '</a>';
        }).join('') + '</nav>';
    }

    // tbody 內容（idx = 要顯示的列索引，已過濾/排序）
    function rowsHtml(cat, idx) {
        if (!idx.length) {
            return '<tr><td colspan="' + cat.columns.length +
                '" style="text-align:center;color:var(--muted);padding:22px">找不到符合的資料</td></tr>';
        }
        return idx.map(function (i) {
            return '<tr>' + cat.rows[i].map(function (c) { return '<td>' + cell(c) + '</td>'; }).join('') + '</tr>';
        }).join('');
    }

    // 分類頁 #dbApp 的初始 HTML（＝瀏覽器首次 render() 完成後的樣子）
    DB.categoryHtml = function (d, catKey) {
        var cat = catOf(d, catKey);
        if (!d || !cat) return '';
        var all = cat.rows.map(function (_, i) { return i; });
        var h = '<h1>' + d.game.title + '　' + cat.label + '一覽</h1>';
        if (cat.intro) h += '<p class="lead">' + cat.intro + '</p>';
        h += catNavHtml(d, catKey, false);
        h += '<div class="db-tools">' +
            '<input class="db-search" type="search" aria-label="' + attr('搜尋' + cat.label) + '"' +
            ' placeholder="' + attr('🔎 搜尋' + cat.label) + '">' +
            '<button class="db-cmp-btn" type="button"' +
            ' title="比較模式：從上方點選要比較的項目，下方並排檢視">⚖️ 比較</button>' +
            '</div>';
        h += '<p class="db-cnt">' + cntText(all.length, cat.rows.length) + '</p>';
        h += '<div class="table-wrap"><table class="data db-table"><thead><tr>' +
            cat.columns.map(function (col, i) {
                return '<th class="db-th" data-i="' + i + '">' + col + '<span class="db-ar"></span></th>';
            }).join('') +
            '</tr></thead><tbody>' + rowsHtml(cat, all) + '</tbody></table></div>';
        h += '<div class="db-cmpview" style="display:none">' +
            '<p class="db-cnt">點下方項目加入比較（可多選）；再點一次取消。</p>' +
            '<div class="db-chipcloud"></div>' +
            '<div class="db-cmp-area"></div>' +
            '</div>';
        return h;
    };

    // 資料庫索引頁 #dbApp 的初始 HTML
    DB.indexHtml = function (d) {
        if (!d) return '';
        var h = '<h1>' + d.game.title + '　資料庫</h1>';
        h += '<p class="lead">分類查詢《' + d.game.title + '》的遊戲內資料，可搜尋、排序與自訂比較：' +
            d.categories.map(function (c) { return c.label; }).join('、') + '。</p>';
        // 導讀（data.js 的 game.intro：字串或字串陣列，每段一個 <p>）——
        // 讓索引頁有實質內容，而不是只有標題與卡片格
        if (d.game.intro) {
            var paras = Array.isArray(d.game.intro) ? d.game.intro : [d.game.intro];
            h += paras.map(function (p) { return '<p>' + p + '</p>'; }).join('');
        }
        h += '<div class="db-cat-grid">' + d.categories.map(function (c) {
            return '<a class="db-cat-card" href="' + attr(c.slug + '/') + '">' +
                '<span class="ic">' + (c.icon || '📄') + '</span>' +
                '<span class="lb">' + c.label + '</span>' +
                '<span class="n">' + c.rows.length + ' 筆</span></a>';
        }).join('') + '</div>';
        return h;
    };

    /* ---- 以下為瀏覽器端掛載（用到 document） ---------------------------- */

    function el(tag, cls, html) {
        var e = document.createElement(tag);
        if (cls) e.className = cls;
        if (html != null) e.innerHTML = html;
        return e;
    }

    // 取容器並確保有內容：已預渲染就沿用，否則用同一份純函式現建
    function prepare(html) {
        var app = typeof document === 'undefined' ? null : document.getElementById('dbApp');
        if (!app) return null;
        if (app.getAttribute('data-prerendered') == null) app.innerHTML = html;
        return app;
    }

    DB.mountCategory = function (catKey) {
        var d = root.GAME_DB;
        if (!d) return;
        var cat = catOf(d, catKey);
        if (!cat) return;
        var app = prepare(DB.categoryHtml(d, catKey));
        if (!app) return;

        // 抓既有節點（預渲染或現建都是同一份 HTML，結構固定）
        var inp = app.querySelector('.db-search');
        var cmpBtn = app.querySelector('.db-cmp-btn');
        var cnts = app.querySelectorAll('.db-cnt');   // [0]=筆數列，[1]=比較檢視的提示
        var cnt = cnts[0];
        var wrap = app.querySelector('.table-wrap');
        var table = app.querySelector('table.db-table');
        var htr = table ? table.querySelector('thead tr') : null;
        var tbody = table ? table.querySelector('tbody') : null;
        var cmpView = app.querySelector('.db-cmpview');
        var chipCloud = app.querySelector('.db-chipcloud');
        var cmpArea = app.querySelector('.db-cmp-area');
        if (!inp || !cmpBtn || !cnt || !wrap || !htr || !tbody || !cmpView) return;

        var sort = { i: -1, dir: 1 };
        var compareMode = false, selected = [];

        function toggle(i) {
            var p = selected.indexOf(i);
            if (p < 0) selected.push(i); else selected.splice(p, 1);
            renderChips(); renderCompare();
        }

        // 一般表格
        function render() {
            var kw = (inp.value || '').trim().toLowerCase();
            var idx = [];
            for (var n = 0; n < cat.rows.length; n++) if (!kw || cat.rows[n].join('  ').toLowerCase().indexOf(kw) >= 0) idx.push(n);
            if (sort.i >= 0) {
                idx.sort(function (a, b) {
                    var x = (cat.rows[a][sort.i] == null ? '' : cat.rows[a][sort.i]) + '';
                    var y = (cat.rows[b][sort.i] == null ? '' : cat.rows[b][sort.i]) + '';
                    return x.localeCompare(y, 'zh-Hant', { numeric: true }) * sort.dir;
                });
            }
            tbody.innerHTML = rowsHtml(cat, idx);
            cnt.textContent = cntText(idx.length, cat.rows.length);
            htr.querySelectorAll('.db-ar').forEach(function (a, i) { a.textContent = sort.i === i ? (sort.dir > 0 ? ' ▲' : ' ▼') : ''; });
        }

        // 比較晶片雲（依搜尋過濾）
        function renderChips() {
            var kw = (inp.value || '').trim().toLowerCase();
            chipCloud.innerHTML = '';
            for (var n = 0; n < cat.rows.length; n++) {
                if (kw && cat.rows[n].join('  ').toLowerCase().indexOf(kw) < 0) continue;
                (function (i) {
                    var on = selected.indexOf(i) >= 0;
                    var b = el('button', 'db-pick' + (on ? ' on' : ''), (on ? '✓ ' : '') + (cat.rows[i][0] == null ? '' : cat.rows[i][0]));
                    b.type = 'button';
                    b.addEventListener('click', function () { toggle(i); });
                    chipCloud.appendChild(b);
                })(n);
            }
        }

        // 並排比較表（屬性為列、選取項為欄，數值最大高亮）
        function renderCompare() {
            if (!selected.length) { cmpArea.innerHTML = '<p class="empty-hint">尚未選取。點上方項目開始比較。</p>'; return; }
            var h = '<div class="db-cmp-bar"><b>已選 ' + selected.length + ' 項</b><button type="button" class="db-cmp-clear">清除</button></div>';
            h += '<div class="table-wrap"><table class="data db-cmp-table"><thead><tr><th>項目</th>';
            selected.forEach(function (i) { h += '<th>' + (cat.rows[i][0] == null ? '' : cat.rows[i][0]) + '</th>'; });
            h += '</tr></thead><tbody>';
            for (var ci = 1; ci < cat.columns.length; ci++) {
                var nums = selected.map(function (i) { var v = parseInt(String(cat.rows[i][ci]).replace(/[^0-9\-]/g, ''), 10); return isNaN(v) ? null : v; });
                var valid = nums.filter(function (v) { return v != null; });
                var mx = valid.length > 1 ? Math.max.apply(null, valid) : null;
                h += '<tr><th>' + cat.columns[ci] + '</th>';
                selected.forEach(function (i, k) {
                    var v = cat.rows[i][ci], hot = mx != null && nums[k] === mx;
                    h += '<td' + (hot ? ' class="db-cmp-max"' : '') + '>' + (v == null ? '' : v) + '</td>';
                });
                h += '</tr>';
            }
            h += '</tbody></table></div>';
            cmpArea.innerHTML = h;
            cmpArea.querySelector('.db-cmp-clear').addEventListener('click', function () { selected = []; renderChips(); renderCompare(); });
        }

        function setMode(on) {
            compareMode = on;
            cmpBtn.classList.toggle('on', on);
            cmpBtn.textContent = on ? '✖ 關閉比較' : '⚖️ 比較';
            wrap.style.display = on ? 'none' : '';
            cnt.style.display = on ? 'none' : '';
            cmpView.style.display = on ? 'block' : 'none';
            inp.placeholder = on ? '🔎 搜尋要比較的' + cat.label : '🔎 搜尋' + cat.label;
            if (on) { renderChips(); renderCompare(); } else render();
            if (root.Shell) Shell.track('db_compare', { cat: catKey, on: on });
        }

        cmpBtn.addEventListener('click', function () { setMode(!compareMode); });
        inp.addEventListener('input', function () {
            if (compareMode) renderChips(); else render();
            if (root.Shell) Shell.track('db_search', { cat: catKey, q: inp.value.slice(0, 40) });
        });
        htr.querySelectorAll('.db-th').forEach(function (th) {
            th.addEventListener('click', function () {
                var i = +th.dataset.i;
                if (sort.i === i) sort.dir *= -1; else { sort.i = i; sort.dir = 1; }
                render();
            });
        });
        // 預渲染的表格已等於初次 render() 的結果，不必重建（免閃爍）
        if (app.getAttribute('data-prerendered') == null) render();
    };

    DB.mountIndex = function () {
        var d = root.GAME_DB;
        if (!d) return;
        prepare(DB.indexHtml(d));
    };

    if (typeof module === 'object' && module && module.exports) module.exports = DB;
})(typeof window !== 'undefined' ? window : globalThis);
