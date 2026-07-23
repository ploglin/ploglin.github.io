/* ============================================================
   開羅攻略站 — 通用佈局模擬器引擎 (sim.js)
   讀 window.GAME_DB 的 combo 分類，建出「調色盤 + 格線 + 即時判定 +
   差一步提示 + 放置建議」的模擬器（比照 school2 細緻度）。

   用法（各遊戲 sim 頁）：
     <div id="simApp"></div>
     <script src="../db/data.js"></script>          // window.GAME_DB
     <script src="../../../assets/sim.js"></script>
     <script>SimEngine.mount({
        category:'combos', nameCol:0, reqCol:4, reqSep:'・',
        bonuses:[{i:2,label:'石高',sum:true,suffix:'%'},{i:3,label:'價格',sum:true,suffix:'%'}],
        dist:3, ruleText:'成員彼此 3 格內', nature:'自然物'
     });</script>

   規則：dist = 成員兩兩的 Chebyshev 距離上限（大江戶 3、相鄰型 1）。
   ============================================================ */
(function () {
    'use strict';
    var SimEngine = window.SimEngine = window.SimEngine || {};

    function el(tag, cls, html) { var e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; }
    function hue(s) { var h = 0; for (var i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0; return h % 360; }
    function num(s) { return parseInt(String(s).replace(/[^0-9\-]/g, ''), 10) || 0; }
    function cheb(a, b) { return Math.max(Math.abs(a[0] - b[0]), Math.abs(a[1] - b[1])); }

    SimEngine.mount = function (cfg) {
        var GD = window.GAME_DB;
        var app = document.getElementById(cfg.mountId || 'simApp');
        if (!GD || !app) return;
        var ROWS = cfg.rows || 12, COLS = cfg.cols || 12, DIST = cfg.dist || 3;
        var NAT = cfg.nature || null;

        // 建築類型表（供顯示分類；找不到就空）
        var typeOf = {};
        GD.categories.forEach(function (c) {
            if (!/build|store|struct|設施|建築|店舖|機台/i.test(c.key + c.label)) return;
            c.rows.forEach(function (r) { var n = (r[0] || '').replace(/（[^）]*）/g, '').trim(); if (n && !typeOf[n]) typeOf[n] = r[1] || ''; });
        });
        var NATURE_RE = /松|櫻|梅|楓|柳|銀杏|竹|杜鵑|紫陽花|向日葵|樹叢|大岩石/;
        function isNature(name) { if (!NAT) return false; if (name === NAT) return true; return /自然|環境|nature/i.test(typeOf[name] || '') || NATURE_RE.test(name); }

        // 解析 combos
        var ccat = GD.categories.filter(function (c) { return c.key === cfg.category; })[0];
        if (!ccat) { app.innerHTML = '<p class="empty-hint">找不到 combo 資料。</p>'; return; }
        var combos = ccat.rows.map(function (r) {
            var slots = [];
            String(r[cfg.reqCol] || '').split(cfg.reqSep).forEach(function (tok) {
                tok = tok.trim(); if (!tok) return;
                var m = tok.match(/^(.+?)\s*[×xX]\s*(\d+)$/);
                var bn = m ? m[1].trim() : tok, cnt = m ? +m[2] : 1;
                if (NAT && new RegExp('^' + NAT).test(bn)) bn = NAT;
                for (var i = 0; i < cnt; i++) slots.push(bn);
            });
            var bonuses = (cfg.bonuses || []).map(function (b) { return { label: b.label, val: r[b.i], sum: b.sum, suffix: b.suffix || '' }; });
            return { name: r[cfg.nameCol], slots: slots, bonuses: bonuses };
        }).filter(function (cb) { return cb.slots.length >= 2; });

        // 排序主鍵（第一個 sum 加成）取來排序
        function score(cb) { var b = cb.bonuses.filter(function (x) { return x.sum; })[0]; return b ? num(b.val) : 0; }

        // 調色盤：combos 用到的所有建築（+ 自然物）
        var pset = {}; combos.forEach(function (cb) { cb.slots.forEach(function (s) { pset[s] = 1; }); });
        var palette = Object.keys(pset).sort(function (a, b) {
            var ta = typeOf[a] || 'zz', tb = typeOf[b] || 'zz';
            if (ta !== tb) return ta.localeCompare(tb, 'zh-Hant'); return a.localeCompare(b, 'zh-Hant');
        });
        function shortLabel(n) { return n === NAT ? '🌳' : n.replace(/\s/g, '').slice(0, 2); }
        function colorOf(n) { return 'hsl(' + hue(n) + ',42%,42%)'; }

        // ---- 狀態 ----
        var grid = [], cells = [], current = null, erase = false;

        // ---- DOM ----
        app.innerHTML = '';
        var wrap = el('div', 'sim-wrap');
        // 調色盤
        var pPanel = el('div', 'sim-panel');
        pPanel.appendChild(el('h3', null, '🏗️ 建築'));
        var tools = el('div', 'pal-tools');
        var eraseBtn = el('button', null, '🧽 清除'); eraseBtn.title = '橡皮擦：點格子清除';
        var clearBtn = el('button', null, '🗑️ 全清');
        tools.appendChild(eraseBtn); tools.appendChild(clearBtn); pPanel.appendChild(tools);
        var palSearch = el('input', 'pal-search'); palSearch.type = 'search'; palSearch.placeholder = '🔎 搜尋建築';
        pPanel.appendChild(palSearch);
        var palList = el('div', 'pal-list'); pPanel.appendChild(palList);
        // 格線
        var gPanel = el('div', 'sim-panel');
        var gScroll = el('div', 'grid-scroll'); var gridEl = el('div', 'sim-grid');
        gridEl.style.gridTemplateColumns = 'repeat(' + COLS + ', 34px)';
        gScroll.appendChild(gridEl); gPanel.appendChild(gScroll);
        gPanel.appendChild(el('p', 'empty-hint', '選左側建築 → 點格子擺放。再次點同格或用「清除」移除。' +
            (cfg.ruleText ? '<br>成立條件：' + cfg.ruleText + '。' : '')));
        // 結果
        var rPanel = el('div', 'sim-panel');
        rPanel.appendChild(el('h3', null, '🎌 成立的 combo'));
        var statBox = el('div'); rPanel.appendChild(statBox);
        var comboListEl = el('ul', 'combo-list'); rPanel.appendChild(comboListEl);
        var comboEmpty = el('p', 'empty-hint', '尚未成立任何 combo。把一組的建築擺在一起試試。'); rPanel.appendChild(comboEmpty);
        rPanel.appendChild(el('h3', null, '🔧 差一步就成立')).style.marginTop = '16px';
        var nmHint = el('p', 'empty-hint', '點項目會自動選取「還差的建築」，格線標出可放位置（藍框）。'); nmHint.style.margin = '2px 0 0';
        rPanel.appendChild(nmHint);
        var nmListEl = el('ul', 'nm-list'); rPanel.appendChild(nmListEl);

        wrap.appendChild(pPanel); wrap.appendChild(gPanel); wrap.appendChild(rPanel);
        app.appendChild(wrap);

        // ---- 建格線 ----
        for (var r = 0; r < ROWS; r++) {
            grid[r] = []; cells[r] = [];
            for (var c = 0; c < COLS; c++) {
                grid[r][c] = null;
                var cell = el('div', 'cell');
                (function (rr, cc, ce) {
                    ce.addEventListener('click', function () { place(rr, cc); });
                    ce.addEventListener('mouseenter', function (e) { if (e.buttons === 1) place(rr, cc); });
                })(r, c, cell);
                gridEl.appendChild(cell); cells[r][c] = cell;
            }
        }

        // ---- 調色盤 ----
        function renderPalette(f) {
            palList.innerHTML = '';
            palette.forEach(function (name) {
                if (f && name.indexOf(f) < 0) return;
                var d = el('div', 'pal-item' + (name === current ? ' active' : ''));
                var ty = name === NAT ? '自然物（任一環境物件）' : (typeOf[name] || '');
                d.innerHTML = '<span>' + name + '</span>' + (ty ? '<span class="ty">' + ty + '</span>' : '');
                d.addEventListener('click', function () {
                    current = name; erase = false; eraseBtn.classList.remove('on');
                    renderPalette(palSearch.value.trim()); updateSuggestions();
                });
                palList.appendChild(d);
            });
        }
        palSearch.addEventListener('input', function () { renderPalette(palSearch.value.trim()); });

        function place(r, c) {
            if (erase) grid[r][c] = null;
            else if (current) grid[r][c] = (grid[r][c] === current ? null : current);
            else return;
            paintCell(r, c); recompute();
        }
        function paintCell(r, c) {
            var cell = cells[r][c], v = grid[r][c];
            if (v) { cell.textContent = shortLabel(v); cell.classList.add('filled'); cell.style.background = colorOf(v); cell.title = v; }
            else { cell.textContent = ''; cell.classList.remove('filled', 'in-combo', 'suggest'); cell.style.background = ''; cell.title = ''; }
        }

        // ---- 判定 ----
        function candidates(name) {
            var out = [];
            for (var r = 0; r < ROWS; r++) for (var c = 0; c < COLS; c++) {
                var v = grid[r][c]; if (!v) continue;
                if (name === NAT) { if (isNature(v)) out.push([r, c]); }
                else if (v === name) out.push([r, c]);
            }
            return out;
        }
        function fillSlots(slotList) {
            var n = slotList.length, cand = slotList.map(candidates);
            for (var i = 0; i < n; i++) if (!cand[i].length) return null;
            var pick = [];
            function bt(i, used) {
                if (i === n) return true;
                for (var k = 0; k < cand[i].length; k++) {
                    var rc = cand[i][k], kk = rc[0] + ',' + rc[1]; if (used[kk]) continue;
                    var ok = true; for (var j = 0; j < i; j++) if (cheb(rc, pick[j]) > DIST) { ok = false; break; }
                    if (!ok) continue; pick[i] = rc; used[kk] = 1;
                    if (bt(i + 1, used)) return true; used[kk] = 0;
                }
                return false;
            }
            return bt(0, {}) ? pick.slice() : null;
        }
        function comboActive(cb) { return fillSlots(cb.slots); }
        function comboNearMiss(cb) {
            if (comboActive(cb)) return null;
            for (var i = 0; i < cb.slots.length; i++) {
                var sub = cb.slots.slice(0, i).concat(cb.slots.slice(i + 1)); if (!sub.length) continue;
                var cells2 = fillSlots(sub); if (cells2) return { missing: cb.slots[i], cluster: cells2 };
            }
            return null;
        }
        function canFill(missing) { if (!current || erase) return false; if (missing === current) return true; if (NAT && missing === NAT && isNature(current)) return true; return false; }

        // ---- 計算與渲染 ----
        function recompute() {
            for (var r = 0; r < ROWS; r++) for (var c = 0; c < COLS; c++) cells[r][c].classList.remove('in-combo');
            var active = [];
            combos.forEach(function (cb) { var cs = comboActive(cb); if (cs) active.push({ cb: cb, cells: cs }); });
            active.sort(function (a, b) { return score(b.cb) - score(a.cb); });

            // 統計
            statBox.innerHTML = '';
            var row0 = el('div', 'stat-row', '<span>成立 combo</span><b>' + active.length + '</b>'); statBox.appendChild(row0);
            (cfg.bonuses || []).filter(function (b) { return b.sum; }).forEach(function (b) {
                var tot = active.reduce(function (s, o) { var bb = o.cb.bonuses.filter(function (x) { return x.label === b.label; })[0]; return s + (bb ? num(bb.val) : 0); }, 0);
                statBox.appendChild(el('div', 'stat-row', '<span>' + b.label + '加成合計</span><b>+' + tot + (b.suffix || '') + '</b>'));
            });

            comboListEl.innerHTML = ''; comboEmpty.style.display = active.length ? 'none' : 'block';
            active.forEach(function (o) {
                var bo = o.cb.bonuses.map(function (x) { return x.label + x.val; }).join(' / ');
                var li = el('li', null, '<span class="cb">' + o.cb.name + '</span> <span class="bo">' + bo + '</span>');
                li.addEventListener('mouseenter', function () { highlight(o.cells); });
                li.addEventListener('mouseleave', clearHi);
                comboListEl.appendChild(li);
            });

            renderNearMiss(); updateSuggestions();
            if (window.Shell) Shell.track('sim_update', { active: active.length });
        }
        function renderNearMiss() {
            var items = [];
            combos.forEach(function (cb) { var nm = comboNearMiss(cb); if (nm) items.push({ cb: cb, missing: nm.missing, cluster: nm.cluster }); });
            items.sort(function (a, b) { return score(b.cb) - score(a.cb); });
            items = items.slice(0, 14);
            nmListEl.innerHTML = ''; nmHint.style.display = items.length ? 'block' : 'none';
            if (!items.length) { nmListEl.innerHTML = '<li class="empty-hint" style="cursor:default">目前沒有「差一步」的 combo，多擺幾個建築試試。</li>'; return; }
            items.forEach(function (o) {
                var b0 = o.cb.bonuses.filter(function (x) { return x.sum; })[0];
                var li = el('li', null, '<span><b>' + o.cb.name + '</b>　還差 <span class="nm-miss">' + o.missing + '</span></span>' +
                    (b0 ? '<span class="bo">' + b0.label + b0.val + '</span>' : ''));
                li.addEventListener('mouseenter', function () { highlight(o.cluster); });
                li.addEventListener('mouseleave', clearHi);
                li.addEventListener('click', function () {
                    current = o.missing; erase = false; eraseBtn.classList.remove('on');
                    renderPalette(palSearch.value.trim()); updateSuggestions();
                    if (window.Shell) Shell.track('sim_pick_missing', { combo: o.cb.name });
                });
                nmListEl.appendChild(li);
            });
        }
        function highlight(set) { set.forEach(function (rc) { cells[rc[0]][rc[1]].classList.add('in-combo'); }); }
        function clearHi() { for (var r = 0; r < ROWS; r++) for (var c = 0; c < COLS; c++) cells[r][c].classList.remove('in-combo'); }
        function updateSuggestions() {
            for (var r = 0; r < ROWS; r++) for (var c = 0; c < COLS; c++) cells[r][c].classList.remove('suggest');
            if (!current || erase) return;
            var regions = [];
            combos.forEach(function (cb) { var nm = comboNearMiss(cb); if (nm && canFill(nm.missing)) regions.push(nm.cluster); });
            if (!regions.length) return;
            for (var r2 = 0; r2 < ROWS; r2++) for (var c2 = 0; c2 < COLS; c2++) {
                if (grid[r2][c2]) continue;
                for (var k = 0; k < regions.length; k++) {
                    var ok = true; for (var m = 0; m < regions[k].length; m++) if (cheb([r2, c2], regions[k][m]) > DIST) { ok = false; break; }
                    if (ok) { cells[r2][c2].classList.add('suggest'); break; }
                }
            }
        }

        eraseBtn.addEventListener('click', function () { erase = !erase; current = null; eraseBtn.classList.toggle('on', erase); renderPalette(palSearch.value.trim()); updateSuggestions(); });
        clearBtn.addEventListener('click', function () { if (!confirm('清空整張圖？')) return; for (var r = 0; r < ROWS; r++) for (var c = 0; c < COLS; c++) { grid[r][c] = null; paintCell(r, c); } recompute(); });

        renderPalette(''); recompute();
    };
})();
