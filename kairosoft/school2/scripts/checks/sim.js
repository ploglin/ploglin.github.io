// 模擬器本體檢查（原 check.js 的 8 組，邏輯原封不動搬進來）
//   1) JS 語法  2) 面板資料覆蓋率  3) 景點資料  4) 發展建議
//   5) 內建地圖資料  6) 分享編碼往返  7) 多尺寸分享編碼  8) 深色覆寫層
//
// 第 6/7 組**刻意**用鏡像重寫的 encodeMap/decodeMap，不 require 引擎——
// 它是獨立實作的對照測試；共用之後編碼器出 bug 時檢查器會一起壞掉還報 PASS。
'use strict';

module.exports = function simChecks(ctx) {
    const { html, ok, bail } = ctx;

    // 1) JS 語法
    let script;
    try {
        // 取所有無屬性的 <script> 區塊，挑最大的那個當主程式
        // （頁面另有 gtag 與外殼的小 script，不能貪婪比對跨過它們）
        const blocks = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]);
        if (!blocks.length) throw new Error('找不到主程式 <script> 區塊');
        script = blocks.sort((a, b) => b.length - a.length)[0];
        new Function(script);
        ok('JS 語法', true);
    } catch (e) {
        ok('JS 語法', false, e.message);
        return bail();
    }

    const { items, icons, jp, SPOTS, guide, TYPE_KEYS } = ctx.data;

    // 2) 面板資料覆蓋率
    const noIcon = Object.keys(items).filter(id => !items[id].hidden && !icons[id]);
    ok('每個設施都有圖示', !noIcon.length, noIcon.join(','));
    const noJp = Object.keys(items).filter(id => id !== 'empty' && !jp[id]);
    ok('每個設施都有日文對照', !noJp.length, noJp.join(','));

    // 3) 景點資料
    const badReq = SPOTS.flatMap(s => s.req.flat()).filter(id => !items[id]);
    ok('景點條件的設施 id 全部存在', !badReq.length, [...new Set(badReq)].join(','));
    const spotIds = SPOTS.map(s => s.id);
    ok('景點 id 不重複', new Set(spotIds).size === spotIds.length);
    ok('景點共 29 種', SPOTS.length === 29, '目前 ' + SPOTS.length);

    // 4) 發展建議
    const badGuide = guide
        .flatMap(s => s.items.flatMap(e => [e.id, ...Object.keys(e.needs || {})]))
        .filter(id => !items[id]);
    ok('發展建議的設施 id 全部存在', !badGuide.length, [...new Set(badGuide)].join(','));

    // 5) 內建地圖資料（預設圖、進度種子、各鎮地形）——每張圖各有預期尺寸
    const MAP_SIZES = {
        PRESET_DEFAULT_DATA: [26, 24], PROGRESS_SEED_DATA: [26, 24], PRESET_EAST_DATA: [26, 26],
        PRESET_LAKE_DATA: [24, 24], PRESET_VALLEY_DATA: [26, 26], PRESET_HILL_DATA: [26, 26]
    };
    for (const m of html.matchAll(new RegExp('(' + Object.keys(MAP_SIZES).join('|') + ') = \\`(\\[\\[[\\s\\S]*?\\]\\])\\`', 'g'))) {
        const name = m[1];
        try {
            const g = JSON.parse(m[2]);
            const [R, C] = MAP_SIZES[name];
            ok(`${name} 為 ${R}×${C}`, g.length === R && g.every(row => row.length === C));
            const badType = [...new Set(g.flat().map(c => c.type).filter(t => t !== 'empty' && !items[t]))];
            ok(`${name} 的設施 id 全部存在`, !badType.length, badType.join(','));
        } catch (e) {
            ok(`${name} JSON 可解析`, false, e.message);
        }
    }

    ok('內建地圖齊全', Object.keys(MAP_SIZES).every(n => html.includes(n + ' = ')));

    // 6) 分享編碼往返（鏡像 encodeMap/decodeMap 的邏輯）
    const grid = JSON.parse(html.match(/PRESET_DEFAULT_DATA = \`(\[\[[\s\S]*?\]\])\`/)[1]);
    const R = 26, C = 24;
    const parts = [];
    let prev = null, count = 0;
    for (let r = 0; r < R; r++) for (let c = 0; c < C; c++) {
        const key = TYPE_KEYS.indexOf(grid[r][c].type) + '.' + (grid[r][c].elevation || 1);
        if (key === prev) count++;
        else { if (prev !== null) parts.push(prev + '.' + count); prev = key; count = 1; }
    }
    parts.push(prev + '.' + count);
    const cells = [];
    for (const p of parts.join(',').split(',')) {
        const [t, e, n] = p.split('.').map(Number);
        for (let k = 0; k < n; k++) cells.push({ type: TYPE_KEYS[t] || 'empty', elevation: e || 1 });
    }
    let roundtrip = cells.length === R * C;
    if (roundtrip) {
        for (let r = 0; r < R; r++) for (let c = 0; c < C; c++) {
            const back = cells[r * C + c];
            if (back.type !== grid[r][c].type || back.elevation !== (grid[r][c].elevation || 1)) roundtrip = false;
        }
    }
    ok('分享編碼往返一致', roundtrip);

    // 7) 多尺寸分享編碼（鏡像帶「RxC;」前綴的新格式；26×24 必須維持無前綴的舊格式）
    {
        // 造一張 26×26 測試圖（角落放設施、含高地），走「前綴編碼 → 解碼」往返
        const R2 = 26, C2 = 26;
        const g2 = Array(R2).fill(null).map(() => Array(C2).fill(null).map(() => ({ type: 'empty', elevation: 1 })));
        g2[0][0] = { type: 'woods', elevation: 1 };
        g2[25][25] = { type: 'pond', elevation: 1 };
        g2[13][13] = { type: 'class', elevation: 2 };
        const parts2 = [];
        let prev2 = null, count2 = 0;
        for (let r = 0; r < R2; r++) for (let c = 0; c < C2; c++) {
            const key = TYPE_KEYS.indexOf(g2[r][c].type) + '.' + (g2[r][c].elevation || 1);
            if (key === prev2) count2++;
            else { if (prev2 !== null) parts2.push(prev2 + '.' + count2); prev2 = key; count2 = 1; }
        }
        parts2.push(prev2 + '.' + count2);
        const encoded2 = R2 + 'x' + C2 + ';' + parts2.join(',');
        // 解碼（鏡像 decodeMap）
        let str2 = encoded2, rows2 = 26, cols2 = 24;
        const sm2 = /^(\d+)x(\d+);/.exec(str2);
        if (sm2) { rows2 = +sm2[1]; cols2 = +sm2[2]; str2 = str2.slice(sm2[0].length); }
        const cells2 = [];
        for (const p of str2.split(',')) {
            const [t, e, n] = p.split('.').map(Number);
            for (let k = 0; k < n; k++) cells2.push({ type: TYPE_KEYS[t] || 'empty', elevation: e || 1 });
        }
        let rt2 = rows2 === R2 && cols2 === C2 && cells2.length === R2 * C2;
        if (rt2) for (let r = 0; r < R2; r++) for (let c = 0; c < C2; c++) {
            const back = cells2[r * C2 + c];
            if (back.type !== g2[r][c].type || back.elevation !== g2[r][c].elevation) rt2 = false;
        }
        ok('多尺寸分享編碼（26×26 前綴格式）往返一致', rt2);
        // encodeMap 原始碼必須保留「26×24 無前綴」的相容規則
        ok('26×24 維持無前綴舊格式', /gridRows === 26 && gridCols === 24\) \? ''/.test(html));
    }

    // 8) 深色覆寫層（防回歸）
    //    模擬器的樣式是寫死的淺色 Tailwind utility，深色靠 <style> 尾端的覆寫層重映射。
    //    新增 UI 時很容易忘了把新的淺色 class 加進覆寫層 → 深色下會冒出一塊白。
    //    這裡把頁面實際用到的「淺色系」utility 全掃出來，逐一比對覆寫層有沒有映射到。
    {
        const styleBlocks = [...html.matchAll(/<style>([\s\S]*?)<\/style>/g)].map(m => m[1]).join('\n');
        const darkStart = styleBlocks.indexOf('深色模式覆寫層');
        ok('深色覆寫層存在', darkStart >= 0);

        if (darkStart >= 0) {
            const darkCss = styleBlocks.slice(darkStart);

            // 兩個 dark 選擇器區塊（系統偏好 / 手動 data-theme）內容必須一模一樣，
            // 否則只有一種進入方式會變深色。比對時把根選擇器抹平再比。
            const mediaBody = /@media \(prefers-color-scheme: dark\) \{([\s\S]*?)\n        \}/.exec(darkCss);
            const attrBody = darkCss.slice(darkCss.indexOf(':root[data-theme="dark"] {'));
            const flat = s => s.replace(/:root:not\(\[data-theme="light"\]\)|:root\[data-theme="dark"\]/g, 'ROOT')
                .replace(/\s+/g, ' ').trim();
            ok('深色兩套選擇器內容一致（系統偏好 vs 手動）',
                !!mediaBody && flat(mediaBody[1]) === flat(attrBody));

            // 覆寫層已映射的 class（含 hover:/focus: 變體）。CSS 內的 \: \/ 先還原成 : /
            const mapped = new Set();
            const CLS = /\.((?:hover|focus):)?((?:bg|border|text)-[a-z]+(?:-\d{2,3})?(?:\/\d{1,3})?)/g;
            for (const m of darkCss.replace(/\\([:/])/g, '$1').replace(/:not\([^)]*\)/g, '').matchAll(CLS)) {
                mapped.add((m[1] || '') + m[2]);
            }

            // 頁面實際用到的 class（靜態 HTML ＋ JS 產生的字串），排除 <style> 本身
            const markup = html.replace(/<style>[\s\S]*?<\/style>/g, '');
            const USED = /\b((?:hover|focus):)?((?:bg|border|text)-[a-z]+(?:-\d{2,3})?(?:\/\d{1,3})?)\b/g;

            // 「淺色系」判定：白/黑/50/100/200（＋border 的 300、bg 的 800）與 400–900 的文字色
            const inScope = cls => {
                const m = /^(?:(?:hover|focus):)?(bg|border|text)-([a-z]+)(?:-(\d{2,3}))?(?:\/\d{1,3})?$/.exec(cls);
                if (!m) return false;
                const [, kind, name, shade] = m;
                if (kind === 'bg') return name === 'white' || name === 'black' || ['50', '100', '200', '800'].includes(shade);
                if (kind === 'border') return name === 'white' || ['50', '100', '200', '300'].includes(shade);
                return +shade >= 400 && +shade <= 900;   // text
            };

            // 刻意不映射的例外（深色下維持原樣，各有理由）
            const ALLOW = {
                'border-white': '景點指示點的白圈，畫在地圖格子上＝地圖內容，不隨主題變',
                'text-white': '實心彩色按鈕（儲存/讀取/刪除/切換開啟態）的字色，深淺色皆適用'
            };

            const missing = [...new Set([...markup.matchAll(USED)].map(m => (m[1] || '') + m[2]))]
                .filter(inScope).filter(c => !mapped.has(c) && !ALLOW[c]).sort();
            ok('淺色 utility 都有深色映射', !missing.length, missing.join(','));

            // 覆寫層必須含這幾類關鍵規則（P0：hover 變體、開啟態排除、選中高亮、tooltip 箭頭）
            const musts = [
                ['hover 變體有深色版', /\.hover\\:bg-gray-200:hover/],
                ['切換鈕開啟態不被蓋掉', /:not\(\.bg-indigo-600\)/],
                ['選中的建築仍有高亮', /\.palette-item\.active/],
                ['tooltip 箭頭跟著換色', /\.spot-tooltip::after/],
                ['原生控件與捲軸用深色', /color-scheme: dark/]
            ];
            musts.forEach(([n, re]) => ok('深色覆寫層：' + n, re.test(darkCss)));
        }
    }
};
