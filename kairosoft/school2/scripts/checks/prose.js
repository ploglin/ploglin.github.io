// 散文數字守衛 —— 表格有正本，正文沒有
//
// 站上所有數值**表格**都由 gen-embed.js 的 `db:` 標記從 db/data.js 產生，所以表格
// 永遠與正本一致。但**正文散文裡的數字是手寫的，而且從來沒有任何檢查**。
// 2026-08-11 那一輪「全站金額換算成 G」就是這樣漏掉的：表格全換好了，散文留下一批
// 萬円，於是同一頁的表格寫「1600→2760」、正文寫「16 萬漲到 27.6 萬」。
//
// 這裡驗兩件事，都是不需要語意理解就能抓的形狀：
//   ㈠ 萬円殘留 —— 全站只有「進路年收」這一欄刻意保留萬円，其餘出現「N 萬」都可疑
//   ㈡ 刻度混用 —— 同一串斜線分隔的數字裡最大值是最小值的 50 倍以上，
//                  例如「費用 4／6／8／1,000 G」（正確是 400/600/800/1000）
//
// 兩項都以 WARN 落地；--strict 升 FAIL。
'use strict';

const fs = require('fs');
const path = require('path');

const LEVEL = { manyen: 'warn', scale: 'warn' };

/* 「進路年收」是全站唯一合法的萬円欄位——db/careers 的欄名就寫著「年收(萬円)」。
   除了這幾個泛詞，還會把 db 裡 60 個進路名稱全部當白名單（「一流大學」「太空人」
   出現在附近就是在講年收，不是在講薪水），這樣就不必逐頁硬寫例外。 */
const CAREER_WORDS = /進路|年收|年收入|畢業生|出路|工場|打工族|獎金|志願|就職/;

/* 結算分數的單價也用「萬」為單位（情侶與優勝社團各 1 萬分），那是分不是錢 */
const SCORE_WORDS = /結算|單價|分數|衝分|優勝社團|情侶/;

/* 這一段刻意在講「不要有兩份正本」，舉的是假數字，不是真的金額 */
const META_ALLOW = /兩份正本|資料庫寫/;

/* 回傳 { names, incomes }：60 個進路名稱，以及它們的年收數值集合。
   數值集合是第二道白名單——「年收 500 萬以上畢業生」這種句子的 500 就在裡面，
   而老師薪水那批（16／27.6／51.8）不在，所以不必靠關鍵字距離去猜語境。 */
function careerData(S2) {
    try {
        const src = fs.readFileSync(path.join(S2, 'db', 'data.js'), 'utf8');
        const sandbox = { window: {} };
        new Function('window', src).call(sandbox, sandbox.window);
        const c = sandbox.window.GAME_DB.categories.find(x => x.key === 'careers');
        if (!c) return { names: [], incomes: new Set() };
        const iIncome = c.columns.findIndex(x => /年收/.test(x));
        const incomes = new Set();
        c.rows.forEach(r => {
            const v = String(r[iIncome] || '').replace(/[,\s]/g, '');
            if (/^\d+$/.test(v)) incomes.add(+v);
        });
        return { names: c.rows.map(r => String(r[0])).filter(n => n.length >= 2), incomes };
    } catch (e) { return { names: [], incomes: new Set() }; }
}

function visibleProse(html) {
    const b = html.indexOf('<body');
    const body = b < 0 ? html : html.slice(b);
    return body
        .replace(/<!--[\s\S]*?-->/g, ' ')        // 蓋章區塊的標記
        .replace(/<script[\s\S]*?<\/script>/gi, ' ')
        .replace(/<style[\s\S]*?<\/style>/gi, ' ')
        .replace(/<table[\s\S]*?<\/table>/gi, ' ') // 表格有正本，不在這裡驗
        .replace(/<[^>]+>/g, ' ')
        .replace(/&(?:[a-z]+|#\d+);/gi, ' ')
        .replace(/\s+/g, ' ');
}

function walkPages(dir, out) {
    for (const name of fs.readdirSync(dir)) {
        const p = path.join(dir, name);
        const st = fs.statSync(p);
        if (st.isDirectory()) {
            if (name === 'scripts' || name === 'sim' || name === 'assets') continue;
            walkPages(p, out);
        } else if (name === 'index.html') {
            out.push(p);
        }
    }
    return out;
}

module.exports = function (ctx) {
    const { S2, soft } = ctx;
    const check = (key, name, bad, detail) => soft(LEVEL[key], name, bad, detail);
    const pages = walkPages(S2, []);
    const rel = p => path.relative(S2, p).split(path.sep).join('/');

    /* ── ㈠ 萬円殘留 ────────────────────────────────────────── */
    {
        const { names: careers, incomes } = careerData(S2);
        const bad = [];
        for (const p of pages) {
            const txt = visibleProse(fs.readFileSync(p, 'utf8'));
            const re = /(.{0,75})(?<![\d.,])(\d[\d,]*(?:\.\d+)?)\s*萬(.{0,40})/g;
            let m;
            while ((m = re.exec(txt))) {
                const ctxStr = m[1] + m[2] + '萬' + m[3];
                if (CAREER_WORDS.test(ctxStr) || SCORE_WORDS.test(ctxStr) || META_ALLOW.test(ctxStr)) continue;
                if (careers.some(n => ctxStr.includes(n))) continue;
                // 數字本身就是某條進路的年收 → 在講年收，不是在講薪水或預算
                if (incomes.has(+m[2].replace(/,/g, ''))) continue;
                // 「60 萬 G」這種把 G 接在後面的是合法的中文寫法（＝600,000 G）
                if (/^\s*G/.test(m[3])) continue;
                // 「1 萬分」是結算分數不是金額
                if (/^\s*分/.test(m[3])) continue;
                bad.push(`${rel(p)}：「…${m[2]}萬${m[3].slice(0, 14)}…」`);
            }
        }
        check('manyen', `正文沒有萬円殘留（掃 ${pages.length} 頁，進路年收除外）`,
            bad.length, bad.length ? bad : '金額一律是 G');
    }

    /* ── ㈡ 同一串數字裡刻度混用 ─────────────────────────────── */
    {
        const bad = [];
        for (const p of pages) {
            const txt = visibleProse(fs.readFileSync(p, 'utf8'));
            // 三個以上以「／」或「/」分隔的數字
            const re = /(\d[\d,]*)(?:\s*[／/]\s*(\d[\d,]*)){2,}/g;
            let m;
            while ((m = re.exec(txt))) {
                const nums = m[0].split(/[／/]/).map(s => +s.replace(/[,\s]/g, '')).filter(n => n > 0);
                if (nums.length < 3) continue;
                const hi = Math.max(...nums), lo = Math.min(...nums);
                if (hi / lo < 50) continue;
                const around = txt.slice(Math.max(0, m.index - 24), m.index + m[0].length + 10);
                bad.push(`${rel(p)}：「…${around.trim()}…」（最大 ${hi} 是最小 ${lo} 的 ${Math.round(hi / lo)} 倍）`);
            }
        }
        check('scale', `正文的數字序列沒有刻度混用（掃 ${pages.length} 頁）`,
            bad.length, bad.length ? bad : '同一串數字的量級一致');
    }
};
