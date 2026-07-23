/* ============================================================
   開羅攻略站 — 資料庫瀏覽元件 (db.js)
   讀 window.GAME_DB，渲染「每分類獨立頁」的可搜尋/排序表格，
   以及該遊戲的資料庫索引頁。與各分類頁互相連結。

   資料格式（每款遊戲的 db/data.js）：
   window.GAME_DB = {
     game: { id, title },
     categories: [
       { key, slug, label, icon, intro, columns:[...], rows:[[...],[...]] }
     ]
   };

   分類頁：kairosoft/<game>/db/<slug>/index.html → DB.mountCategory('<key>')
   索引頁：kairosoft/<game>/db/index.html          → DB.mountIndex()
   ============================================================ */
(function () {
    'use strict';
    var DB = window.DB = window.DB || {};

    function el(tag, cls, html) {
        var e = document.createElement(tag);
        if (cls) e.className = cls;
        if (html != null) e.innerHTML = html;
        return e;
    }

    // 分類導覽列（分類頁彼此連結）。fromIndex=true 表示由索引頁呼叫（連結相對路徑不同）
    function catNav(activeKey, fromIndex) {
        var d = window.GAME_DB, nav = el('nav', 'db-nav');
        d.categories.forEach(function (c) {
            var a = el('a', 'db-chip' + (c.key === activeKey ? ' active' : ''));
            a.href = fromIndex ? (c.slug + '/') : ('../' + c.slug + '/');
            a.innerHTML = (c.icon ? c.icon + ' ' : '') + c.label;
            nav.appendChild(a);
        });
        return nav;
    }

    DB.mountCategory = function (catKey) {
        var d = window.GAME_DB;
        if (!d) return;
        var cat = d.categories.filter(function (c) { return c.key === catKey; })[0];
        var app = document.getElementById('dbApp');
        if (!cat || !app) return;
        app.innerHTML = '';

        app.appendChild(el('h1', null, d.game.title + '　' + cat.label + '一覽'));
        if (cat.intro) app.appendChild(el('p', 'lead', cat.intro));
        app.appendChild(catNav(catKey, false));

        var tools = el('div', 'db-tools');
        var inp = el('input', 'db-search');
        inp.type = 'search';
        inp.setAttribute('aria-label', '搜尋' + cat.label);
        inp.placeholder = '🔎 搜尋' + cat.label;
        tools.appendChild(inp);
        app.appendChild(tools);

        var cnt = el('p', 'db-cnt');
        app.appendChild(cnt);

        var wrap = el('div', 'table-wrap');
        var table = el('table', 'data db-table');
        var thead = el('thead'), htr = el('tr');
        cat.columns.forEach(function (col, i) {
            var th = el('th', 'db-th', col + '<span class="db-ar"></span>');
            th.dataset.i = i;
            htr.appendChild(th);
        });
        thead.appendChild(htr);
        table.appendChild(thead);
        var tbody = el('tbody');
        table.appendChild(tbody);
        wrap.appendChild(table);
        app.appendChild(wrap);

        var sort = { i: -1, dir: 1 };

        function render() {
            var kw = (inp.value || '').trim().toLowerCase();
            var rows = cat.rows.filter(function (r) {
                return !kw || r.join('  ').toLowerCase().indexOf(kw) >= 0;
            });
            if (sort.i >= 0) {
                rows = rows.slice().sort(function (a, b) {
                    var x = (a[sort.i] == null ? '' : a[sort.i]) + '';
                    var y = (b[sort.i] == null ? '' : b[sort.i]) + '';
                    return x.localeCompare(y, 'zh-Hant', { numeric: true }) * sort.dir;
                });
            }
            tbody.innerHTML = '';
            rows.forEach(function (r) {
                var tr = el('tr');
                r.forEach(function (c) { tr.appendChild(el('td', null, c == null ? '' : c)); });
                tbody.appendChild(tr);
            });
            cnt.textContent = '共 ' + rows.length + ' / ' + cat.rows.length + ' 筆';
            if (!rows.length) {
                tbody.innerHTML = '<tr><td colspan="' + cat.columns.length + '" style="text-align:center;color:var(--muted);padding:22px">找不到符合的資料</td></tr>';
            }
            htr.querySelectorAll('.db-ar').forEach(function (a, i) {
                a.textContent = sort.i === i ? (sort.dir > 0 ? ' ▲' : ' ▼') : '';
            });
        }

        inp.addEventListener('input', function () {
            render();
            if (window.Shell) Shell.track('db_search', { cat: catKey, q: inp.value.slice(0, 40) });
        });
        htr.querySelectorAll('.db-th').forEach(function (th) {
            th.addEventListener('click', function () {
                var i = +th.dataset.i;
                if (sort.i === i) sort.dir *= -1; else { sort.i = i; sort.dir = 1; }
                render();
            });
        });
        render();
    };

    DB.mountIndex = function () {
        var d = window.GAME_DB;
        if (!d) return;
        var app = document.getElementById('dbApp');
        if (!app) return;
        app.innerHTML = '';
        app.appendChild(el('h1', null, d.game.title + '　資料庫'));
        app.appendChild(el('p', 'lead',
            '分類查詢《' + d.game.title + '》的遊戲內資料，可搜尋與排序：' +
            d.categories.map(function (c) { return c.label; }).join('、') + '。'));

        var grid = el('div', 'db-cat-grid');
        d.categories.forEach(function (c) {
            var a = el('a', 'db-cat-card');
            a.href = c.slug + '/';
            a.innerHTML = '<span class="ic">' + (c.icon || '📄') + '</span>' +
                '<span class="lb">' + c.label + '</span>' +
                '<span class="n">' + c.rows.length + ' 筆</span>';
            grid.appendChild(a);
        });
        app.appendChild(grid);
    };
})();
