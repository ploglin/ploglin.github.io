/* ============================================================
   口袋學院物語2（school2）長頁閱讀行為 — guide.js?v=1

   只有 school2 的攻略頁引入，自帶版號（與共用軌的 ?v 各走各的）。
   以 `defer` 於 head 引入 → DOM 解析完、Shell.mount() 之後才跑。

   五件事，全部是**掛在既有節點上的行為強化**，不自己產內容
   （站台規範：內容不能只存在瀏覽器端；表格本體由 scripts/gen-embed.js
     於建置期蓋章成靜態 HTML）：
     1. .datablock 的篩選 ＋ 點表頭排序（＋零結果空狀態）
     2. .toc-rail 側邊目錄軌（h2 ＋ 當前 h2 底下的 h3）＋ scroll-spy
     3. shell.js 的浮動 ☰ 目錄擴充成 h2+h3 兩層
     4. 頁內捲動進度線（rAF、無狀態、量 .article 而非整份文件）
     5. .path-rail 把當前站捲到中央；details 內的錨點自動展開
   ============================================================ */
(function () {
    'use strict';

    var article = document.querySelector('main.article');
    if (!article) return;
    var OFF = 117;                       // sticky 高度 106 ＋ 呼吸 11
    var txt = function (el) { return (el.textContent || '').replace(/\s+/g, ' ').trim(); };

    /* ---------- 1. .datablock：篩選 ＋ 排序 ---------------------------- */
    [].forEach.call(document.querySelectorAll('.datablock'), function (blk) {
        var table = blk.querySelector('table.data');
        var wrap = blk.querySelector('.table-wrap');
        var head = blk.querySelector('.dbk-h');
        if (!table || !wrap) return;
        var tbody = table.tBodies[0];
        var rows = tbody ? [].slice.call(tbody.rows) : [];
        var total = rows.length;
        var cnt = head && head.querySelector('.dbk-n');
        var input = head && head.querySelector('.dbk-f');
        var empty = document.createElement('p');
        empty.className = 'dbk-empty';
        empty.hidden = true;
        wrap.appendChild(empty);

        function applyFilter(kw) {
            kw = (kw || '').trim().toLowerCase();
            var shown = 0;
            rows.forEach(function (tr) {
                var hit = !kw || txt(tr).toLowerCase().indexOf(kw) >= 0;
                tr.hidden = !hit;
                if (hit) shown++;
            });
            if (cnt) cnt.textContent = kw ? shown + ' / ' + total + ' 列' : total + ' 列';
            empty.hidden = !!shown;
            if (!shown) {
                empty.innerHTML = '沒有符合「' + kw.replace(/[<&]/g, '') + '」的列';
                var b = document.createElement('button');
                b.type = 'button'; b.textContent = '清除篩選';
                b.addEventListener('click', function () { if (input) { input.value = ''; applyFilter(''); input.focus(); } });
                empty.appendChild(b);
            }
        }
        if (input) {
            input.addEventListener('input', function () { applyFilter(input.value); });
            input.addEventListener('search', function () { applyFilter(input.value); });
        }

        // 點表頭排序（數字優先、否則中文字面）；第三次點回原始列序
        var order = rows.slice();
        [].forEach.call(table.tHead ? table.tHead.rows[0].cells : [], function (th, i) {
            th.setAttribute('data-sort', '');
            th.tabIndex = 0;
            function sort() {
                var dir = th.getAttribute('aria-sort');
                var next = dir === 'ascending' ? 'descending' : (dir === 'descending' ? '' : 'ascending');
                [].forEach.call(table.tHead.rows[0].cells, function (o) { o.removeAttribute('aria-sort'); });
                var list = order.slice();
                if (next) {
                    th.setAttribute('aria-sort', next);
                    var num = function (tr) {
                        var v = parseFloat(txt(tr.cells[i]).replace(/[^\d.\-]/g, ''));
                        return isNaN(v) ? null : v;
                    };
                    list.sort(function (a, b) {
                        var x = num(a), y = num(b);
                        var c = (x !== null && y !== null) ? x - y
                            : txt(a.cells[i]).localeCompare(txt(b.cells[i]), 'zh-Hant');
                        return next === 'descending' ? -c : c;
                    });
                }
                list.forEach(function (tr) { tbody.appendChild(tr); });
            }
            th.addEventListener('click', sort);
            th.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); sort(); } });
        });

        // 右緣淡出：只有真的橫向溢出才提示
        function xcheck() { blk.classList.toggle('can-x', wrap.scrollWidth > wrap.clientWidth + 2); }
        xcheck();
        window.addEventListener('resize', xcheck, { passive: true });
    });

    /* ---------- 2. .toc-rail ＋ scroll-spy ---------------------------- */
    var prose = article.querySelector('.prose') || article;
    var heads = [].slice.call(prose.querySelectorAll('h2[id], h3[id]'));
    var links = [];
    if (heads.filter(function (h) { return h.tagName === 'H2'; }).length >= 3) {
        var rail = document.createElement('aside');
        rail.className = 'toc-rail';
        rail.setAttribute('aria-label', '本頁章節');
        var ol = document.createElement('ol');
        heads.forEach(function (h) {
            if (h.tagName === 'H3' && h.closest('details:not([open])')) return;
            var li = document.createElement('li');
            li.className = h.tagName === 'H2' ? 'lv2' : 'lv3';
            var a = document.createElement('a');
            a.href = '#' + h.id;
            a.textContent = h.getAttribute('data-toc') || txt(h).replace(/^\d{2}\s*/, '');
            li.appendChild(a);
            ol.appendChild(li);
            links.push({ a: a, h: h });
        });
        rail.innerHTML = '<nav><div class="tr-h">本頁章節</div></nav>';
        rail.firstChild.appendChild(ol);
        article.appendChild(rail);

        // scroll-behavior:smooth 之下，程式化捲動會依序穿過每個 h2 →
        // 高亮一路跳到目的地。點連結後先鎖住 spy。
        var lock = 0;
        ol.addEventListener('click', function (e) {
            var a = e.target.closest('a');
            if (!a) return;
            lock = Date.now() + 500;
            links.forEach(function (o) { o.a.classList.toggle('on', o.a === a); });
        });
        var spy = function () {
            if (Date.now() < lock) return;
            var cur = null;
            links.forEach(function (o) {
                if (o.h.getBoundingClientRect().top - OFF <= 8) cur = o;
            });
            if (!cur) cur = links[0];
            links.forEach(function (o) { o.a.classList.toggle('on', o === cur); });
        };
        spy();
        window.addEventListener('scroll', spy, { passive: true });
    }

    /* ---------- 3. 浮動 ☰ 目錄擴充成 h2 + h3 兩層 --------------------- */
    (function extendPagenav(tries) {
        var menu = document.querySelector('.pagenav-menu');
        if (!menu) { if (tries) setTimeout(function () { extendPagenav(tries - 1); }, 120); return; }
        var byId = {};
        [].forEach.call(menu.querySelectorAll('a'), function (a) {
            byId[a.getAttribute('href')] = a;
            // shell.js 取 h2 的 textContent，章節編號會黏在標題前（「01人氣景點…」）→ 補分隔
            a.textContent = a.textContent.replace(/^(\d{2})\s*/, '$1 · ');
        });
        if (heads.length > 44) return;               // 太長就不加第二層
        heads.forEach(function (h, i) {
            if (h.tagName !== 'H3') return;
            var host = null;
            for (var j = i - 1; j >= 0; j--) { if (heads[j].tagName === 'H2') { host = byId['#' + heads[j].id]; break; } }
            if (!host) return;
            var a = document.createElement('a');
            a.className = 'lv3';
            a.href = '#' + h.id;
            a.textContent = txt(h);
            a.addEventListener('click', function () { menu.classList.remove('open'); });
            // 插在該 h2 之後、下一個 h2 之前
            var at = host.nextSibling;
            while (at && at.classList && at.classList.contains('lv3')) at = at.nextSibling;
            menu.insertBefore(a, at);
            byId['#' + h.id] = a;
        });
    })(12);

    /* ---------- 4. 捲動進度線（無狀態） ------------------------------- */
    (function () {
        var bar = document.createElement('div');
        bar.className = 'read-progress';
        bar.innerHTML = '<i></i>';
        bar.setAttribute('aria-hidden', 'true');
        document.body.appendChild(bar);
        var fill = bar.firstChild, queued = false;
        function paint() {
            queued = false;
            var top = article.offsetTop, h = article.offsetHeight;
            var span = h - window.innerHeight + OFF;
            var p = span <= 0 ? 1 : (window.pageYOffset - top + OFF) / span;
            fill.style.setProperty('--rp', Math.max(0, Math.min(1, p)).toFixed(4));
        }
        function onScroll() { if (!queued) { queued = true; requestAnimationFrame(paint); } }
        paint();
        window.addEventListener('scroll', onScroll, { passive: true });
        window.addEventListener('resize', onScroll, { passive: true });
    })();

    /* ---------- 4b. rank-rail：選中態跟著網址走 ----------------------
       狀態刻意放在 hash 而不是 localStorage：使用者是「手機玩遊戲、電腦看網站」，
       localStorage 不跨裝置，而 hash 可以書籤、可以貼給別人。
       沒有 JS 時錨點照樣跳得到，這裡只補上高亮與把當前那顆捲到中央。 */
    [].forEach.call(document.querySelectorAll('.rank-rail'), function (rail) {
        var links = rail.querySelectorAll('.rk');
        function sync() {
            var h = location.hash || '';
            var cur = null;
            [].forEach.call(links, function (a) {
                var on = h && a.getAttribute('href') === h;
                a.classList.toggle('on', !!on);
                if (on) { a.setAttribute('aria-current', 'true'); cur = a; }
                else a.removeAttribute('aria-current');
            });
            if (cur) rail.scrollLeft = cur.offsetLeft - rail.clientWidth / 2 + cur.offsetWidth / 2;
        }
        if (rail.scrollWidth > rail.clientWidth + 2) rail.classList.add('can-x');
        sync();
        window.addEventListener('hashchange', sync);
    });

    /* ---------- 5. path-rail 定位 ＋ details 內的錨點 ----------------- */
    [].forEach.call(document.querySelectorAll('.path-rail'), function (rail) {
        var cur = rail.querySelector('[aria-current="step"]');
        if (rail.scrollWidth > rail.clientWidth + 2) rail.classList.add('can-x');
        // 刻意不用 scrollIntoView：它會連帶垂直捲動整頁、把 H1 推走
        if (cur) rail.scrollLeft = cur.offsetLeft - rail.clientWidth / 2 + cur.offsetWidth / 2;
    });

    function openTarget() {
        var id = location.hash.slice(1);
        if (!id) return;
        var el = document.getElementById(id);
        if (!el) return;
        var d = el.closest('details');
        // scrollIntoView 會尊重 CSS 的 scroll-margin-top（第 0 節已修正成 117px），
        // 所以不要再自己補 scrollBy——那會與 scroll-behavior:smooth 打架。
        if (d && !d.open) { d.open = true; el.scrollIntoView(); }
    }
    openTarget();
    window.addEventListener('hashchange', openTarget);
})();
