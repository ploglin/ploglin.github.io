/* ============================================================
   開羅攻略站 — 資料庫瀏覽元件 (db.js)
   讀 window.GAME_DB，渲染「每分類獨立頁」的可搜尋/排序表格、
   自訂比較模式，以及該遊戲的資料庫索引頁。

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
        var cmpBtn = el('button', 'db-cmp-btn', '⚖️ 比較');
        cmpBtn.type = 'button';
        cmpBtn.title = '開啟比較模式：勾選要比較的項目，並排檢視、數值高亮';
        tools.appendChild(cmpBtn);
        app.appendChild(tools);

        var cnt = el('p', 'db-cnt');
        app.appendChild(cnt);

        var cmpPanel = el('div', 'db-cmp-panel');
        cmpPanel.style.display = 'none';
        app.appendChild(cmpPanel);

        var wrap = el('div', 'table-wrap');
        var table = el('table', 'data db-table');
        var thead = el('thead'), htr = el('tr');
        var selTh = el('th', 'db-selcol', '☑');
        selTh.style.display = 'none';
        htr.appendChild(selTh);
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
        var compareMode = false, selected = [];

        function toggle(i) {
            var p = selected.indexOf(i);
            if (p < 0) selected.push(i); else selected.splice(p, 1);
            render(); renderCompare();
        }

        function render() {
            var kw = (inp.value || '').trim().toLowerCase();
            var idx = [];
            for (var n = 0; n < cat.rows.length; n++) {
                if (!kw || cat.rows[n].join('  ').toLowerCase().indexOf(kw) >= 0) idx.push(n);
            }
            if (sort.i >= 0) {
                idx.sort(function (a, b) {
                    var x = (cat.rows[a][sort.i] == null ? '' : cat.rows[a][sort.i]) + '';
                    var y = (cat.rows[b][sort.i] == null ? '' : cat.rows[b][sort.i]) + '';
                    return x.localeCompare(y, 'zh-Hant', { numeric: true }) * sort.dir;
                });
            }
            tbody.innerHTML = '';
            idx.forEach(function (i) {
                var isSel = selected.indexOf(i) >= 0;
                var tr = el('tr', compareMode ? ('db-selrow' + (isSel ? ' sel' : '')) : null);
                if (compareMode) {
                    tr.appendChild(el('td', 'db-selcol', isSel ? '✓' : ''));
                    tr.addEventListener('click', function () { toggle(i); });
                }
                cat.rows[i].forEach(function (c) { tr.appendChild(el('td', null, c == null ? '' : c)); });
                tbody.appendChild(tr);
            });
            cnt.textContent = '共 ' + idx.length + ' / ' + cat.rows.length + ' 筆' + (compareMode ? '　（點列即可加入比較）' : '');
            if (!idx.length) {
                tbody.innerHTML = '<tr><td colspan="' + (cat.columns.length + (compareMode ? 1 : 0)) + '" style="text-align:center;color:var(--muted);padding:22px">找不到符合的資料</td></tr>';
            }
            htr.querySelectorAll('.db-ar').forEach(function (a, i) {
                a.textContent = sort.i === i ? (sort.dir > 0 ? ' ▲' : ' ▼') : '';
            });
        }

        function renderCompare() {
            if (!compareMode || !selected.length) { cmpPanel.style.display = 'none'; cmpPanel.innerHTML = ''; return; }
            cmpPanel.style.display = 'block';
            var h = '<div class="db-cmp-head">⚖️ 比較（' + selected.length + '）';
            selected.forEach(function (i) { h += '<span class="db-cmp-chip" data-i="' + i + '">' + (cat.rows[i][0] == null ? '' : cat.rows[i][0]) + ' <b>×</b></span>'; });
            h += '<button type="button" class="db-cmp-clear">清除全部</button></div>';
            h += '<div class="table-wrap"><table class="data"><thead><tr><th>項目</th>';
            selected.forEach(function (i) { h += '<th>' + (cat.rows[i][0] == null ? '' : cat.rows[i][0]) + '</th>'; });
            h += '</tr></thead><tbody>';
            for (var ci = 1; ci < cat.columns.length; ci++) {
                var nums = selected.map(function (i) { var v = parseInt(String(cat.rows[i][ci]).replace(/[^0-9\-]/g, ''), 10); return isNaN(v) ? null : v; });
                var valid = nums.filter(function (v) { return v != null; });
                var mx = valid.length ? Math.max.apply(null, valid) : null;
                h += '<tr><th style="text-align:left">' + cat.columns[ci] + '</th>';
                selected.forEach(function (i, k) {
                    var v = cat.rows[i][ci];
                    var hot = mx != null && nums[k] === mx && selected.length > 1 && valid.length > 1;
                    h += '<td' + (hot ? ' class="db-cmp-max"' : '') + '>' + (v == null ? '' : v) + '</td>';
                });
                h += '</tr>';
            }
            h += '</tbody></table></div>';
            cmpPanel.innerHTML = h;
            cmpPanel.querySelector('.db-cmp-clear').addEventListener('click', function () { selected = []; render(); renderCompare(); });
            cmpPanel.querySelectorAll('.db-cmp-chip').forEach(function (ch) {
                ch.addEventListener('click', function () {
                    var i = +ch.getAttribute('data-i'), p = selected.indexOf(i);
                    if (p >= 0) selected.splice(p, 1);
                    render(); renderCompare();
                });
            });
        }

        cmpBtn.addEventListener('click', function () {
            compareMode = !compareMode;
            cmpBtn.classList.toggle('on', compareMode);
            selTh.style.display = compareMode ? '' : 'none';
            if (!compareMode) selected = [];
            render();
            renderCompare();
            if (window.Shell) Shell.track('db_compare', { cat: catKey, on: compareMode });
        });
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
            '分類查詢《' + d.game.title + '》的遊戲內資料，可搜尋、排序與自訂比較：' +
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
