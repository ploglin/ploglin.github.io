/* ============================================================
   開羅攻略站 — 資料庫瀏覽元件 (db.js)
   讀 window.GAME_DB，渲染「每分類獨立頁」的可搜尋/排序表格、
   自訂比較（晶片挑選 + 並排比較），以及資料庫索引頁。
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
        cmpBtn.title = '比較模式：從上方點選要比較的項目，下方並排檢視';
        tools.appendChild(cmpBtn);
        app.appendChild(tools);

        var cnt = el('p', 'db-cnt');
        app.appendChild(cnt);

        // ---- 一般檢視：表格 ----
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

        // ---- 比較檢視：晶片挑選 + 並排表 ----
        var cmpView = el('div', 'db-cmpview');
        cmpView.style.display = 'none';
        var cmpTip = el('p', 'db-cnt', '點下方項目加入比較（可多選）；再點一次取消。');
        var chipCloud = el('div', 'db-chipcloud');
        var cmpArea = el('div', 'db-cmp-area');
        cmpView.appendChild(cmpTip);
        cmpView.appendChild(chipCloud);
        cmpView.appendChild(cmpArea);
        app.appendChild(cmpView);

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
            tbody.innerHTML = '';
            idx.forEach(function (i) {
                var tr = el('tr');
                cat.rows[i].forEach(function (c) { tr.appendChild(el('td', null, c == null ? '' : c)); });
                tbody.appendChild(tr);
            });
            cnt.textContent = '共 ' + idx.length + ' / ' + cat.rows.length + ' 筆';
            if (!idx.length) tbody.innerHTML = '<tr><td colspan="' + cat.columns.length + '" style="text-align:center;color:var(--muted);padding:22px">找不到符合的資料</td></tr>';
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
            if (window.Shell) Shell.track('db_compare', { cat: catKey, on: on });
        }

        cmpBtn.addEventListener('click', function () { setMode(!compareMode); });
        inp.addEventListener('input', function () {
            if (compareMode) renderChips(); else render();
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
