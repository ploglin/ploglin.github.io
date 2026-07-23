/* ============================================================
   開羅攻略站 — 通用佈局模擬器引擎 (sim.js)
   讀 window.GAME_DB 的 combo 分類，建出「調色盤 + 格線 + 即時判定 +
   差一步提示 + 放置建議」的模擬器（比照 school2 細緻度）。

   規則兩種：
     rule:{type:'radius', dist:N}  成員兩兩 Chebyshev 距離 ≤ N（大江戶 3、相鄰 1）
     rule:{type:'window', size:M}  所有成員落在同一個 M×M 視窗內（口袋學院 4×4）

   選項：nature（萬用自然物 token）、orSep（「擇一」分隔，如「樹林／櫻花樹」）。

   用法：
     <div id="simApp"></div>
     <script src="../db/data.js"></script>
     <script src="../../../assets/sim.js"></script>
     <script>SimEngine.mount({
        category:'spots', nameCol:0, reqCol:1, reqSep:'・', orSep:'／',
        bonuses:[{i:2,label:'加成'}], rule:{type:'window',size:4},
        ruleText:'三種設施落在同一個 4×4 範圍內'
     });</script>
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
        var ROWS = cfg.rows || 12, COLS = cfg.cols || 12;
        var RULE = cfg.rule || { type: 'radius', dist: 3 };
        var DIST = RULE.dist || 3, WSIZE = RULE.size || 4, WINDOW = RULE.type === 'window';
        var NAT = cfg.nature || null, ORSEP = cfg.orSep || null;

        // 建築類型表（供顯示分類）
        var typeOf = {};
        GD.categories.forEach(function (c) {
            if (!/build|store|struct|facil|設施|建築|店舖|機台/i.test(c.key + c.label)) return;
            c.rows.forEach(function (r) { var n = (r[0] || '').replace(/（[^）]*）/g, '').trim(); if (n && !typeOf[n]) typeOf[n] = r[1] || ''; });
        });
        var NATURE_RE = /松|櫻|梅|楓|柳|銀杏|竹|杜鵑|紫陽花|向日葵|樹叢|大岩石/;
        function isNature(name) { if (!NAT) return false; if (name === NAT) return true; return /自然|環境|nature/i.test(typeOf[name] || '') || NATURE_RE.test(name); }

        // slot = { names:[...], nat:bool }；label 用於顯示；pick 用於點選補位
        function parseToken(tok) {
            var m = tok.match(/^(.+?)\s*[×xX]\s*(\d+)$/), body = m ? m[1].trim() : tok, cnt = m ? +m[2] : 1;
            var parts = ORSEP ? body.split(ORSEP) : [body];
            var names = [], nat = false;
            parts.forEach(function (p) { p = p.trim(); if (!p) return; if (NAT && new RegExp('^' + NAT).test(p)) nat = true; else names.push(p); });
            return { slot: { names: names, nat: nat }, count: cnt };
        }
        function slotLabel(s) { var a = s.names.slice(); if (s.nat) a.push(NAT); return a.join('／'); }
        function slotPick(s) { return s.names[0] || NAT; }

        var ccat = GD.categories.filter(function (c) { return c.key === cfg.category; })[0];
        if (!ccat) { app.innerHTML = '<p class="empty-hint">找不到 combo 資料。</p>'; return; }
        var combos = ccat.rows.map(function (r) {
            var slots = [];
            String(r[cfg.reqCol] || '').split(cfg.reqSep).forEach(function (tok) {
                tok = tok.trim(); if (!tok) return;
                var pt = parseToken(tok);
                for (var i = 0; i < pt.count; i++) slots.push(pt.slot);
            });
            var bonuses = (cfg.bonuses || []).map(function (b) { return { label: b.label, val: r[b.i], sum: b.sum, suffix: b.suffix || '' }; });
            return { name: r[cfg.nameCol], slots: slots, bonuses: bonuses };
        }).filter(function (cb) { return cb.slots.length >= 2; });

        function score(cb) { var b = cb.bonuses.filter(function (x) { return x.sum; })[0]; return b ? num(b.val) : 0; }

        // 調色盤：所有 slot 用到的具名建築（+ 自然物）
        var pset = {};
        combos.forEach(function (cb) { cb.slots.forEach(function (s) { s.names.forEach(function (n) { pset[n] = 1; }); if (s.nat) pset[NAT] = 1; }); });
        var palette = Object.keys(pset).sort(function (a, b) {
            var ta = typeOf[a] || 'zz', tb = typeOf[b] || 'zz';
            if (ta !== tb) return ta.localeCompare(tb, 'zh-Hant'); return a.localeCompare(b, 'zh-Hant');
        });
        function shortLabel(n) { return n === NAT ? '🌳' : n.replace(/\s/g, '').slice(0, 2); }
        function colorOf(n) { return 'hsl(' + hue(n) + ',42%,42%)'; }

        var grid = [], cells = [], current = null, erase = false;

        // ---- DOM ----
        app.innerHTML = '';
        var wrap = el('div', 'sim-wrap');
        var pPanel = el('div', 'sim-panel');
        pPanel.appendChild(el('h3', null, '🏗️ 建築 / 設施'));
        var tools = el('div', 'pal-tools');
        var eraseBtn = el('button', null, '🧽 清除'); eraseBtn.title = '橡皮擦：點格子清除';
        var clearBtn = el('button', null, '🗑️ 全清');
        tools.appendChild(eraseBtn); tools.appendChild(clearBtn); pPanel.appendChild(tools);
        var palSearch = el('input', 'pal-search'); palSearch.type = 'search'; palSearch.placeholder = '🔎 搜尋';
        pPanel.appendChild(palSearch);
        var palList = el('div', 'pal-list'); pPanel.appendChild(palList);
        var gPanel = el('div', 'sim-panel');
        var gScroll = el('div', 'grid-scroll'); var gridEl = el('div', 'sim-grid');
        gridEl.style.gridTemplateColumns = 'repeat(' + COLS + ', 34px)';
        gScroll.appendChild(gridEl); gPanel.appendChild(gScroll);
        gPanel.appendChild(el('p', 'empty-hint', '選左側 → 點格子擺放。再次點同格或用「清除」移除。' + (cfg.ruleText ? '<br>成立條件：' + cfg.ruleText + '。' : '')));
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

        function renderPalette(f) {
            palList.innerHTML = '';
            palette.forEach(function (name) {
                if (f && name.indexOf(f) < 0) return;
                var d = el('div', 'pal-item' + (name === current ? ' active' : ''));
                var ty = name === NAT ? '自然物（任一環境物件）' : (typeOf[name] || '');
                d.innerHTML = '<span>' + name + '</span>' + (ty ? '<span class="ty">' + ty + '</span>' : '');
                d.addEventListener('click', function () { current = name; erase = false; eraseBtn.classList.remove('on'); renderPalette(palSearch.value.trim()); updateSuggestions(); });
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
        function candidates(slot) {
            var out = [];
            for (var r = 0; r < ROWS; r++) for (var c = 0; c < COLS; c++) {
                var v = grid[r][c]; if (!v) continue;
                if (slot.names.indexOf(v) >= 0 || (slot.nat && isNature(v))) out.push([r, c]);
            }
            return out;
        }
        function findRadius(slots) {
            var n = slots.length, cand = slots.map(candidates);
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
        function findWindow(slots) {
            var n = slots.length, cand = slots.map(candidates);
            for (var i = 0; i < n; i++) if (!cand[i].length) return null;
            for (var r0 = 0; r0 <= ROWS - WSIZE; r0++) for (var c0 = 0; c0 <= COLS - WSIZE; c0++) {
                var used = {}, pick = [], ok = true;
                for (var s = 0; s < n && ok; s++) {
                    var f = null;
                    for (var k = 0; k < cand[s].length; k++) {
                        var rc = cand[s][k], kk = rc[0] + ',' + rc[1]; if (used[kk]) continue;
                        if (rc[0] >= r0 && rc[0] < r0 + WSIZE && rc[1] >= c0 && rc[1] < c0 + WSIZE) { f = rc; break; }
                    }
                    if (f) { pick.push(f); used[f[0] + ',' + f[1]] = 1; } else ok = false;
                }
                if (ok) return pick;
            }
            return null;
        }
        function find(slots) { return WINDOW ? findWindow(slots) : findRadius(slots); }
        function comboActive(cb) { return find(cb.slots); }
        function comboNearMiss(cb) {
            if (comboActive(cb)) return null;
            for (var i = 0; i < cb.slots.length; i++) {
                var sub = cb.slots.slice(0, i).concat(cb.slots.slice(i + 1)); if (!sub.length) continue;
                var cs = find(sub); if (cs) return { missing: cb.slots[i], cluster: cs };
            }
            return null;
        }
        function canFill(slot) {
            if (!current || erase) return false;
            if (slot.names.indexOf(current) >= 0) return true;
            if (slot.nat && (current === NAT || isNature(current))) return true;
            return false;
        }
        function suggestRegion(cluster) {
            var out = [], seen = {};
            if (WINDOW) {
                var rs = cluster.map(function (c) { return c[0]; }), cs = cluster.map(function (c) { return c[1]; });
                var minR = Math.min.apply(null, rs), maxR = Math.max.apply(null, rs), minC = Math.min.apply(null, cs), maxC = Math.max.apply(null, cs);
                for (var r0 = Math.max(0, maxR - WSIZE + 1); r0 <= Math.min(minR, ROWS - WSIZE); r0++)
                    for (var c0 = Math.max(0, maxC - WSIZE + 1); c0 <= Math.min(minC, COLS - WSIZE); c0++)
                        for (var rr = r0; rr < r0 + WSIZE; rr++) for (var cc = c0; cc < c0 + WSIZE; cc++) {
                            if (grid[rr][cc]) continue; var kk = rr + ',' + cc; if (seen[kk]) continue; seen[kk] = 1; out.push([rr, cc]);
                        }
            } else {
                for (var r2 = 0; r2 < ROWS; r2++) for (var c2 = 0; c2 < COLS; c2++) {
                    if (grid[r2][c2]) continue; var ok = true;
                    for (var m = 0; m < cluster.length; m++) if (cheb([r2, c2], cluster[m]) > DIST) { ok = false; break; }
                    if (ok) out.push([r2, c2]);
                }
            }
            return out;
        }

        function recompute() {
            for (var r = 0; r < ROWS; r++) for (var c = 0; c < COLS; c++) cells[r][c].classList.remove('in-combo');
            var active = [];
            combos.forEach(function (cb) { var cs = comboActive(cb); if (cs) active.push({ cb: cb, cells: cs }); });
            active.sort(function (a, b) { return score(b.cb) - score(a.cb); });

            statBox.innerHTML = '';
            statBox.appendChild(el('div', 'stat-row', '<span>成立 combo</span><b>' + active.length + '</b>'));
            (cfg.bonuses || []).filter(function (b) { return b.sum; }).forEach(function (b) {
                var tot = active.reduce(function (s, o) { var bb = o.cb.bonuses.filter(function (x) { return x.label === b.label; })[0]; return s + (bb ? num(bb.val) : 0); }, 0);
                statBox.appendChild(el('div', 'stat-row', '<span>' + b.label + '加成合計</span><b>+' + tot + (b.suffix || '') + '</b>'));
            });

            comboListEl.innerHTML = ''; comboEmpty.style.display = active.length ? 'none' : 'block';
            active.forEach(function (o) {
                var bo = o.cb.bonuses.map(function (x) { return x.label ? x.label + x.val : x.val; }).join('　');
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
            if (!items.length) { nmListEl.innerHTML = '<li class="empty-hint" style="cursor:default">目前沒有「差一步」的 combo，多擺幾個試試。</li>'; return; }
            items.forEach(function (o) {
                var b0 = o.cb.bonuses.filter(function (x) { return x.sum; })[0];
                var li = el('li', null, '<span><b>' + o.cb.name + '</b>　還差 <span class="nm-miss">' + slotLabel(o.missing) + '</span></span>' + (b0 ? '<span class="bo">' + b0.label + b0.val + '</span>' : ''));
                li.addEventListener('mouseenter', function () { highlight(o.cluster); });
                li.addEventListener('mouseleave', clearHi);
                li.addEventListener('click', function () {
                    current = slotPick(o.missing); erase = false; eraseBtn.classList.remove('on');
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
            combos.forEach(function (cb) {
                var nm = comboNearMiss(cb);
                if (nm && canFill(nm.missing)) suggestRegion(nm.cluster).forEach(function (rc) { cells[rc[0]][rc[1]].classList.add('suggest'); });
            });
        }

        eraseBtn.addEventListener('click', function () { erase = !erase; current = null; eraseBtn.classList.toggle('on', erase); renderPalette(palSearch.value.trim()); updateSuggestions(); });
        clearBtn.addEventListener('click', function () { if (!confirm('清空整張圖？')) return; for (var r = 0; r < ROWS; r++) for (var c = 0; c < COLS; c++) { grid[r][c] = null; paintCell(r, c); } recompute(); });

        renderPalette(''); recompute();
    };
})();
