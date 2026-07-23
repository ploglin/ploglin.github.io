/* ============================================================
   開羅攻略站 — 佈局模擬器引擎 v2 (sim2.js)
   school2 等級：多格建築(footprint) + emoji/分類色 + 合併棟 +
   ◆ 等角視角 + 拆整棟 + 即時 combo 判定 + 差一步提示 + 建議。

   讀 window.GAME_DB(combo 分類) 與 window.SIM_BUILDINGS(建築尺寸/圖示/色)。
   用法：
     <div id="simApp"></div>
     <script src="../db/data.js"></script>
     <script src="./buildings.js"></script>
     <script src="../../../assets/sim2.js"></script>
     <script>SimEngine2.mount({ category:'combos', nameCol:0, reqCol:4,
        reqSep:'・', nature:'自然物',
        bonuses:[{i:2,label:'石高',sum:true,suffix:'%'},{i:3,label:'價格',sum:true,suffix:'%'}],
        dist:3, ruleText:'成員彼此 3 格內', rows:18, cols:18 });</script>
   ============================================================ */
(function () {
    'use strict';
    var E = window.SimEngine2 = window.SimEngine2 || {};
    function el(t, cls, html) { var e = document.createElement(t); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; }
    function hue(s) { var h = 0; for (var i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0; return h % 360; }
    function num(s) { return parseInt(String(s).replace(/[^0-9\-]/g, ''), 10) || 0; }
    function cheb(a, b) { return Math.max(Math.abs(a[0] - b[0]), Math.abs(a[1] - b[1])); }

    E.mount = function (cfg) {
        var GD = window.GAME_DB, META = window.SIM_BUILDINGS || {};
        var app = document.getElementById(cfg.mountId || 'simApp');
        if (!GD || !app) return;
        var ROWS = cfg.rows || 18, COLS = cfg.cols || 18, DIST = cfg.dist || 3;
        var NAT = cfg.nature || null, ORSEP = cfg.orSep || null;

        function metaOf(n) { return META[n] || { w: 1, h: 1, e: '', c: 'hsl(' + hue(n) + ',42%,45%)', cat: '' }; }
        var NATURE_RE = /松|櫻|梅|楓|柳|銀杏|竹|杜鵑|紫陽花|向日葵|樹叢|大岩石/;
        function isNature(n) { if (!NAT) return false; if (n === NAT) return true; return (metaOf(n).cat || '').indexOf('自然') >= 0 || NATURE_RE.test(n); }

        function parseToken(tok) {
            var m = tok.match(/^(.+?)\s*[×xX]\s*(\d+)$/), body = m ? m[1].trim() : tok, cnt = m ? +m[2] : 1;
            var parts = ORSEP ? body.split(ORSEP) : [body], names = [], nat = false;
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
                tok = tok.trim(); if (!tok) return; var pt = parseToken(tok);
                for (var i = 0; i < pt.count; i++) slots.push(pt.slot);
            });
            return { name: r[cfg.nameCol], slots: slots, bonuses: (cfg.bonuses || []).map(function (b) { return { label: b.label, val: r[b.i], sum: b.sum, suffix: b.suffix || '' }; }) };
        }).filter(function (cb) { return cb.slots.length >= 2; });
        function score(cb) { var b = cb.bonuses.filter(function (x) { return x.sum; })[0]; return b ? num(b.val) : 0; }

        // 調色盤（依分類分組）
        var pset = {};
        combos.forEach(function (cb) { cb.slots.forEach(function (s) { s.names.forEach(function (n) { pset[n] = 1; }); if (s.nat) pset[NAT] = 1; }); });
        var palette = Object.keys(pset).sort(function (a, b) {
            var ca = metaOf(a).cat || 'zz', cb2 = metaOf(b).cat || 'zz';
            if (ca !== cb2) return ca.localeCompare(cb2, 'zh-Hant'); return a.localeCompare(b, 'zh-Hant');
        });

        // 狀態
        var occ = [], cells = [], placed = [], bidc = 0, current = null, erase = false, iso = false;
        for (var r = 0; r < ROWS; r++) { occ[r] = []; for (var c = 0; c < COLS; c++) occ[r][c] = null; }

        // DOM
        app.innerHTML = '';
        var wrap = el('div', 'sim-wrap');
        var pPanel = el('div', 'sim-panel');
        pPanel.appendChild(el('h3', null, '🏗️ 建築'));
        var ptools = el('div', 'pal-tools');
        var eraseBtn = el('button', null, '🧽 拆除'); eraseBtn.title = '拆除模式：點建築整棟移除';
        var clearBtn = el('button', null, '🗑️ 全清');
        ptools.appendChild(eraseBtn); ptools.appendChild(clearBtn); pPanel.appendChild(ptools);
        var palSearch = el('input', 'pal-search'); palSearch.type = 'search'; palSearch.placeholder = '🔎 搜尋建築';
        pPanel.appendChild(palSearch);
        var palList = el('div', 'pal-list'); pPanel.appendChild(palList);

        var gPanel = el('div', 'sim-panel');
        var gbar = el('div', 'sim-gbar');
        var isoBtn = el('button', 'sim-viewbtn', '◆ 等角視角');
        gbar.appendChild(isoBtn);
        var sel = el('span', 'sim-selname', '未選建築');
        gbar.appendChild(sel);
        gPanel.appendChild(gbar);
        var gScroll = el('div', 'grid-scroll'); var gridWrap = el('div', 'sim-gridwrap');
        var gridEl = el('div', 'sim-grid'); gridEl.style.gridTemplateColumns = 'repeat(' + COLS + ', 30px)';
        gridWrap.appendChild(gridEl); gScroll.appendChild(gridWrap); gPanel.appendChild(gScroll);
        gPanel.appendChild(el('p', 'empty-hint', '選建築 → 點格子擺放（大型建築往右下延伸）。點既有建築或用「拆除」移除。' + (cfg.ruleText ? '<br>成立條件：' + cfg.ruleText + '。' : '')));

        var rPanel = el('div', 'sim-panel');
        rPanel.appendChild(el('h3', null, '🎌 成立的 combo'));
        var statBox = el('div'); rPanel.appendChild(statBox);
        var comboListEl = el('ul', 'combo-list'); rPanel.appendChild(comboListEl);
        var comboEmpty = el('p', 'empty-hint', '尚未成立任何 combo。把一組建築擺在一起試試。'); rPanel.appendChild(comboEmpty);
        rPanel.appendChild(el('h3', null, '🔧 差一步就成立')).style.marginTop = '16px';
        var nmHint = el('p', 'empty-hint', '點項目自動選取「還差的建築」，格線標出可放位置（藍框）。'); nmHint.style.margin = '2px 0 0';
        rPanel.appendChild(nmHint);
        var nmListEl = el('ul', 'nm-list'); rPanel.appendChild(nmListEl);

        wrap.appendChild(pPanel); wrap.appendChild(gPanel); wrap.appendChild(rPanel);
        app.appendChild(wrap);

        for (var r2 = 0; r2 < ROWS; r2++) {
            cells[r2] = [];
            for (var c2 = 0; c2 < COLS; c2++) {
                var cell = el('div', 'cell');
                (function (rr, cc, ce) {
                    ce.addEventListener('click', function () { cellClick(rr, cc); });
                    ce.addEventListener('mouseenter', function (e2) { if (e2.buttons === 1 && !erase) cellClick(rr, cc); });
                })(r2, c2, cell);
                gridEl.appendChild(cell); cells[r2][c2] = cell;
            }
        }

        // 調色盤渲染
        function renderPalette(f) {
            palList.innerHTML = '';
            var lastCat = null;
            palette.forEach(function (name) {
                if (f && name.indexOf(f) < 0) return;
                var m = metaOf(name), cat = name === NAT ? '自然物' : (m.cat || '其他');
                if (cat !== lastCat) { var hd = el('div', 'pal-cat', cat); palList.appendChild(hd); lastCat = cat; }
                var d = el('div', 'pal-item' + (name === current ? ' active' : ''));
                var size = (m.w > 1 || m.h > 1) ? ' <span class="ty">' + m.w + '×' + m.h + '</span>' : '';
                d.innerHTML = '<span><span class="pal-e">' + (name === NAT ? '🌳' : (m.e || '▪')) + '</span>' + name + '</span>' + size;
                d.addEventListener('click', function () {
                    current = name; erase = false; eraseBtn.classList.remove('on');
                    sel.textContent = '已選：' + name; renderPalette(palSearch.value.trim()); updateSuggestions();
                });
                palList.appendChild(d);
            });
        }
        palSearch.addEventListener('input', function () { renderPalette(palSearch.value.trim()); });

        function fits(r, c, m) {
            if (r + m.h > ROWS || c + m.w > COLS) return false;
            for (var i = 0; i < m.h; i++) for (var j = 0; j < m.w; j++) if (occ[r + i][c + j] != null) return false;
            return true;
        }
        function cellClick(r, c) {
            if (erase) { removeAt(r, c); return; }
            if (occ[r][c] != null) { removeAt(r, c); return; }
            if (!current) return;
            var m = metaOf(current);
            if (!fits(r, c, m)) return;
            var bid = ++bidc;
            for (var i = 0; i < m.h; i++) for (var j = 0; j < m.w; j++) occ[r + i][c + j] = bid;
            placed.push({ bid: bid, name: current, r: r, c: c, w: m.w, h: m.h });
            paintAll(); recompute();
        }
        function removeAt(r, c) {
            var bid = occ[r][c]; if (bid == null) return;
            placed = placed.filter(function (b) { return b.bid !== bid; });
            for (var i = 0; i < ROWS; i++) for (var j = 0; j < COLS; j++) if (occ[i][j] === bid) occ[i][j] = null;
            paintAll(); recompute();
        }

        function paintAll() {
            for (var r = 0; r < ROWS; r++) for (var c = 0; c < COLS; c++) {
                var cell = cells[r][c]; cell.className = 'cell'; cell.innerHTML = ''; cell.style.background = '';
            }
            placed.forEach(function (b) {
                var m = metaOf(b.name);
                for (var i = 0; i < b.h; i++) for (var j = 0; j < b.w; j++) {
                    var cell = cells[b.r + i][b.c + j];
                    cell.classList.add('filled'); cell.style.background = m.c;
                }
                var a = cells[b.r][b.c];
                a.innerHTML = '<span class="ic">' + (b.name === NAT ? '🌳' : (m.e || b.name.slice(0, 1))) + '</span>';
            });
        }

        // 判定（以建築錨點為位置）
        function candidates(slot) {
            var out = [];
            placed.forEach(function (b) { if (slot.names.indexOf(b.name) >= 0 || (slot.nat && isNature(b.name))) out.push([b.r, b.c]); });
            return out;
        }
        function find(slots) {
            var n = slots.length, cand = slots.map(candidates);
            for (var i = 0; i < n; i++) if (!cand[i].length) return null;
            var pick = [];
            function bt(i, used) {
                if (i === n) return true;
                for (var k = 0; k < cand[i].length; k++) {
                    var rc = cand[i][k], kk = rc[0] + ',' + rc[1]; if (used[kk]) continue;
                    var ok = true; for (var j = 0; j < i; j++) if (cheb(rc, pick[j]) > DIST) { ok = false; break; }
                    if (!ok) continue; pick[i] = rc; used[kk] = 1; if (bt(i + 1, used)) return true; used[kk] = 0;
                }
                return false;
            }
            return bt(0, {}) ? pick.slice() : null;
        }
        function comboActive(cb) { return find(cb.slots); }
        function comboNearMiss(cb) {
            if (comboActive(cb)) return null;
            for (var i = 0; i < cb.slots.length; i++) {
                var sub = cb.slots.slice(0, i).concat(cb.slots.slice(i + 1)); if (!sub.length) continue;
                var cs = find(sub); if (cs) return { missing: cb.slots[i], cluster: cs };
            }
            return null;
        }
        function canFill(slot) { if (!current || erase) return false; if (slot.names.indexOf(current) >= 0) return true; if (slot.nat && (current === NAT || isNature(current))) return true; return false; }

        function recompute() {
            document.querySelectorAll('.cell.in-combo').forEach(function (c) { c.classList.remove('in-combo'); });
            var active = [];
            combos.forEach(function (cb) { var cs = comboActive(cb); if (cs) active.push({ cb: cb, cells: cs }); });
            active.sort(function (a, b) { return score(b.cb) - score(a.cb); });
            statBox.innerHTML = '';
            statBox.appendChild(el('div', 'stat-row', '<span>成立 combo</span><b>' + active.length + '</b>'));
            (cfg.bonuses || []).filter(function (b) { return b.sum; }).forEach(function (b) {
                var tot = active.reduce(function (s, o) { var bb = o.cb.bonuses.filter(function (x) { return x.label === b.label; })[0]; return s + (bb ? num(bb.val) : 0); }, 0);
                statBox.appendChild(el('div', 'stat-row', '<span>' + b.label + '合計</span><b>+' + tot + (b.suffix || '') + '</b>'));
            });
            comboListEl.innerHTML = ''; comboEmpty.style.display = active.length ? 'none' : 'block';
            active.forEach(function (o) {
                var bo = o.cb.bonuses.map(function (x) { return x.label + x.val; }).join(' / ');
                var li = el('li', null, '<span class="cb">' + o.cb.name + '</span> <span class="bo">' + bo + '</span>');
                li.addEventListener('mouseenter', function () { hi(o.cells); });
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
            if (!items.length) { nmListEl.innerHTML = '<li class="empty-hint" style="cursor:default">目前沒有「差一步」的 combo。</li>'; return; }
            items.forEach(function (o) {
                var b0 = o.cb.bonuses.filter(function (x) { return x.sum; })[0];
                var li = el('li', null, '<span><b>' + o.cb.name + '</b>　還差 <span class="nm-miss">' + slotLabel(o.missing) + '</span></span>' + (b0 ? '<span class="bo">' + b0.label + b0.val + '</span>' : ''));
                li.addEventListener('mouseenter', function () { hi(o.cluster); });
                li.addEventListener('mouseleave', clearHi);
                li.addEventListener('click', function () {
                    current = slotPick(o.missing); erase = false; eraseBtn.classList.remove('on');
                    sel.textContent = '已選：' + current; renderPalette(palSearch.value.trim()); updateSuggestions();
                });
                nmListEl.appendChild(li);
            });
        }
        function hi(set) { set.forEach(function (rc) { cells[rc[0]][rc[1]].classList.add('in-combo'); }); }
        function clearHi() { document.querySelectorAll('.cell.in-combo').forEach(function (c) { c.classList.remove('in-combo'); }); }
        function updateSuggestions() {
            for (var r = 0; r < ROWS; r++) for (var c = 0; c < COLS; c++) cells[r][c].classList.remove('suggest');
            if (!current || erase) return;
            var m = metaOf(current);
            combos.forEach(function (cb) {
                var nm = comboNearMiss(cb);
                if (!nm || !canFill(nm.missing)) return;
                for (var r = 0; r < ROWS; r++) for (var c = 0; c < COLS; c++) {
                    if (!fits(r, c, m)) continue;
                    var ok = true;
                    for (var k = 0; k < nm.cluster.length; k++) if (cheb([r, c], nm.cluster[k]) > DIST) { ok = false; break; }
                    if (ok) cells[r][c].classList.add('suggest');
                }
            });
        }

        eraseBtn.addEventListener('click', function () { erase = !erase; current = null; sel.textContent = erase ? '拆除模式' : '未選建築'; this.classList.toggle('on', erase); renderPalette(palSearch.value.trim()); updateSuggestions(); });
        clearBtn.addEventListener('click', function () { if (!confirm('清空整張圖？')) return; placed = []; for (var i = 0; i < ROWS; i++) for (var j = 0; j < COLS; j++) occ[i][j] = null; paintAll(); recompute(); });
        isoBtn.addEventListener('click', function () { iso = !iso; gridWrap.classList.toggle('iso', iso); this.classList.toggle('on', iso); });

        renderPalette(''); paintAll(); recompute();
    };
})();
