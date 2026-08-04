// 一致性檢查（B0 新增）——把「兩份正本」的同步從註解變成測試
//
// 全部以 WARN 落地（不擋工作）；`node scripts/check.js --strict` 會把 WARN 升為 FAIL。
// 逐項確認乾淨之後就可以在下面的 LEVEL 表把該項改成 'fail'。
'use strict';

const fs = require('fs');
const path = require('path');

// 每項檢查的嚴重度。B0 一律 warn；確認穩定後逐項改 'fail'。
const LEVEL = {
    spots: 'warn', facilities: 'warn', presets: 'warn',
    typekeys: 'warn', sharecodes: 'warn', devguide: 'warn', wordcount: 'warn'
};

const TOWN_SIZES = { '26x24': '健康鎮', '24x24': '湖岸小鎮', '26x26': '冬郵／溪谷／百靈' };
const PRESET_FILES = { east: 'PRESET_EAST_DATA', lake: 'PRESET_LAKE_DATA', valley: 'PRESET_VALLEY_DATA', hill: 'PRESET_HILL_DATA' };
// items[].type → db/data.js 的「分類」欄字面
const TYPE_LABEL = { env: '環境地形', fac: '生活與設施', spec: '教室與專科', sports: '運動與社團', farm: '動植物農牧' };

/* ---- 可見字數（演算法比照 scripts/gen-static.js 的 visibleText()） ---- */
function visibleText(html) {
    const b = html.indexOf('<body');
    const body = b < 0 ? html : html.slice(b);
    return body
        .replace(/<!--[\s\S]*?-->/g, ' ')
        .replace(/<script[\s\S]*?<\/script>/gi, ' ')
        .replace(/<style[\s\S]*?<\/style>/gi, ' ')
        .replace(/<[^>]+>/g, ' ')
        .replace(/&(?:[a-z]+|#\d+);/gi, ' ')
        .replace(/\s+/g, ' ')
        .trim().length;
}

function loadDb(S2) {
    const src = fs.readFileSync(path.join(S2, 'db', 'data.js'), 'utf8');
    const sandbox = { window: {} };
    new Function('window', src).call(sandbox, sandbox.window);
    return sandbox.window.GAME_DB;
}

function b64urlEncode(bin) {
    return Buffer.from(bin, 'binary').toString('base64')
        .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function b64urlDecode(code) {
    return Buffer.from(code.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('binary');
}

module.exports = function consistencyChecks(ctx) {
    const { html, S2, soft } = ctx;
    const { items, icons, jp, spotJp, SPOTS, guide, TYPE_KEYS } = ctx.data;
    const check = (key, name, bad, detail) => soft(LEVEL[key], name, bad, detail);

    const db = loadDb(S2);
    const cat = k => db.categories.find(c => c.key === k);

    /* ================= 1) SPOTS + SPOT_JP ↔ db/spots ================= */
    {
        const c = cat('spots');
        const nm = id => (items[id] ? items[id].name : '⟨未知:' + id + '⟩');
        const reqStr = s => s.req.map(r => Array.isArray(r) ? r.map(nm).join('／') : nm(r)).join('・');
        const diffs = [];
        if (!c) diffs.push('db 沒有 spots 分類');
        else {
            if (c.rows.length !== SPOTS.length) diffs.push(`列數不同：sim=${SPOTS.length} db=${c.rows.length}`);
            SPOTS.forEach((s, i) => {
                const row = c.rows[i];
                if (!row) { diffs.push(`${s.name}: db 缺這一列`); return; }
                const mine = [s.name, spotJp[s.id] || '', reqStr(s), s.bonus, s.teacher || ''];
                mine.forEach((v, j) => {
                    if (v !== row[j]) diffs.push(`${s.name}/${c.columns[j]}: sim="${v}" db="${row[j]}"`);
                });
            });
        }
        check('spots', `sim 的 SPOTS+SPOT_JP ↔ db/spots 逐列逐欄相等（${SPOTS.length} 列 × 5 欄）`,
            diffs.length, diffs.length ? diffs : '0 處不同');
    }

    /* ================= 2) items + ITEM_ICONS + JP_NAMES ↔ db/facilities ================= */
    {
        const c = cat('facilities');
        // sim 面板上看得到的設施（排除清除工具與 hidden 的 slope——它是推導出來的，不可放置）
        const simIds = TYPE_KEYS.filter(id => id !== 'empty' && !items[id].hidden);
        const diffs = [], notes = [];
        if (!c) diffs.push('db 沒有 facilities 分類');
        else {
            const dbName = r => r[0].replace(/^\S+\s/, '');   // 去掉列首 emoji
            const dbNames = c.rows.map(dbName);
            const simNames = simIds.map(id => items[id].name);
            const onlySim = simNames.filter(n => !dbNames.includes(n));
            const onlyDb = dbNames.filter(n => !simNames.includes(n));
            check('facilities', `只在 sim 的設施（${onlySim.length}）／只在 db 的設施（${onlyDb.length}）`,
                onlySim.length + onlyDb.length,
                (onlySim.length + onlyDb.length) ? [
                    '只在 sim：' + (onlySim.join('、') || '（無）'),
                    '只在 db：' + (onlyDb.join('、') || '（無）')
                ] : '兩邊 id 集合相同');

            if (c.rows.length !== simIds.length) diffs.push(`列數不同：sim=${simIds.length} db=${c.rows.length}`);
            simIds.forEach((id, i) => {
                const row = c.rows[i];
                if (!row) { diffs.push(`${id}: db 缺這一列`); return; }
                const size = (items[id].w || 1) + '×' + (items[id].h || 1);
                // db 的「尺寸」欄允許附一個方向註記（例：2×1（橫））——那是 db 專屬的附加資訊，
                // 比對時剝掉括號內容，但把有註記的列記下來，避免它變成看不見的分歧。
                const dbSize = String(row[3]).replace(/（[^）]*）\s*$/, '');
                if (dbSize !== row[3]) notes.push(`${items[id].name}: db 尺寸帶方向註記「${row[3]}」`);
                const pairs = [
                    ['設施', (icons[id] ? icons[id] + ' ' : '') + items[id].name, row[0]],
                    ['日文', jp[id] || '', row[1]],
                    ['分類', TYPE_LABEL[items[id].type] || items[id].type, row[2]],
                    ['尺寸', size, dbSize],
                    ['地圖標籤', items[id].short, row[5]]
                ];
                // 「解鎖條件」（row[4]）是 db 專屬欄位，sim 的 DEV_GUIDE 是分階段的不同粒度，不在此比對。
                for (const [col, a, b] of pairs) {
                    if (a !== b) diffs.push(`${items[id].name}/${col}: sim="${a}" db="${b}"`);
                }
            });
        }
        check('facilities', `sim 的 items+ITEM_ICONS+JP_NAMES ↔ db/facilities 逐列相等（${simIds.length} 列）`,
            diffs.length, diffs.length ? diffs : '0 處不同' + (notes.length ? `（${notes.length} 列帶方向註記，已容許）` : ''));
        if (notes.length) ctx.info('db 尺寸欄的方向註記', notes);
    }

    /* ================= 3) sim/presets/*.json ↔ 內嵌 PRESET_*_DATA ================= */
    {
        for (const town of Object.keys(PRESET_FILES)) {
            const varName = PRESET_FILES[town];
            const file = path.join(S2, 'sim', 'presets', town + '.json');
            const m = new RegExp(varName + ' = `(\\[\\[[\\s\\S]*?\\]\\])`').exec(html);
            const bad = [];
            if (!m) bad.push(`sim 內找不到 ${varName}`);
            else if (!fs.existsSync(file)) bad.push(`找不到 ${town}.json`);
            else {
                const emb = JSON.parse(m[1]);
                const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
                const g = Array.isArray(raw) ? raw : raw.data;
                if (emb.length !== g.length) bad.push(`列數不同：內嵌 ${emb.length} / 檔案 ${g.length}`);
                let n = 0, first = null;
                for (let r = 0; r < emb.length && bad.length === 0; r++) {
                    for (let cc = 0; cc < emb[r].length; cc++) {
                        const a = emb[r][cc], b = ((g[r] || [])[cc]) || {};
                        // presets/*.json 刻意不帶 bid（見 CLAUDE.md），只比 type 與 elevation
                        const sa = a.type + '@' + (a.elevation || 1);
                        const sb = b.type + '@' + (b.elevation || 1);
                        if (sa !== sb) { n++; if (!first) first = `[${r}][${cc}] 內嵌="${sa}" 檔案="${sb}"`; }
                    }
                }
                if (n) bad.push(`${n} 格不同，第一個：${first}`);
            }
            check('presets', `sim/presets/${town}.json ↔ ${varName} deep-equal`, bad.length, bad.length ? bad : '完全相同');
        }
    }

    /* ================= 4) typekeys.lock：TYPE_KEYS 必須以 lock 為前綴（append-only） ================= */
    {
        const lockFile = path.join(__dirname, '..', 'typekeys.lock');
        const bad = [];
        let lock = [];
        if (!fs.existsSync(lockFile)) bad.push('找不到 scripts/typekeys.lock');
        else {
            lock = fs.readFileSync(lockFile, 'utf8').split(/\r?\n/)
                .map(s => s.trim()).filter(s => s && !s.startsWith('#'));
            if (TYPE_KEYS.length < lock.length) {
                bad.push(`TYPE_KEYS 只有 ${TYPE_KEYS.length} 個，比 lock 的 ${lock.length} 個少 —— 有 id 被刪掉了`);
            }
            for (let i = 0; i < lock.length; i++) {
                if (TYPE_KEYS[i] !== lock[i]) {
                    bad.push(`索引 ${i} 不符：lock="${lock[i]}" 現況="${TYPE_KEYS[i]}" —— 分享碼與玩家存檔會全部錯位`);
                    break;
                }
            }
        }
        const added = TYPE_KEYS.slice(lock.length);
        check('typekeys', `typekeys.lock：TYPE_KEYS 以 lock 為前綴（lock ${lock.length} → 現況 ${TYPE_KEYS.length}）`,
            bad.length, bad.length ? bad : (added.length ? `已 append ${added.length} 個新 id：${added.join(',')}（記得同步 lock）` : '完全相同'));
    }

    /* ================= 5) 站上分享碼：decode → 驗證 → 重新 encode 必須字串相同 ================= */
    {
        const found = [];
        (function walk(dir) {
            for (const name of fs.readdirSync(dir).sort()) {
                const full = path.join(dir, name);
                const st = fs.statSync(full);
                if (st.isDirectory()) { if (name !== 'sim' && name !== 'scripts') walk(full); }
                else if (name.endsWith('.html')) {
                    const txt = fs.readFileSync(full, 'utf8');
                    const rel = path.relative(S2, full).split(path.sep).join('/');
                    for (const m of txt.matchAll(/href="[^"]*sim\/#m=([A-Za-z0-9_\-]+)"/g)) found.push({ page: rel, code: m[1] });
                }
            }
        })(S2);

        const bad = [], rows = [];
        for (const { page, code } of found) {
            let str;
            try { str = b64urlDecode(code); }
            catch (e) { bad.push(`${page}: base64 解不開（${e.message}）`); continue; }
            let rows_ = 26, cols_ = 24, body = str;
            const sm = /^(\d+)x(\d+);/.exec(body);
            if (sm) { rows_ = +sm[1]; cols_ = +sm[2]; body = body.slice(sm[0].length); }
            const size = rows_ + 'x' + cols_;
            if (!TOWN_SIZES[size]) { bad.push(`${page}: 尺寸 ${size} 不屬於五鎮之一`); continue; }

            const cells = [];
            let badType = null;
            for (const p of body.split(',')) {
                const [t, e, n] = p.split('.').map(Number);
                if (!(t >= 0 && t < TYPE_KEYS.length)) { badType = `type 索引 ${t} 超出 TYPE_KEYS（0..${TYPE_KEYS.length - 1}）`; break; }
                for (let k = 0; k < n; k++) cells.push({ type: TYPE_KEYS[t], elevation: e || 1 });
            }
            if (badType) { bad.push(`${page}: ${badType}`); continue; }
            if (cells.length !== rows_ * cols_) { bad.push(`${page}: 格數 ${cells.length} ≠ ${rows_}×${cols_}`); continue; }
            const missing = [...new Set(cells.map(c => c.type))].filter(t => !items[t]);
            if (missing.length) { bad.push(`${page}: 用到不存在的設施 ${missing.join(',')}`); continue; }

            // 重新 encode（鏡像 encodeMap）→ 必須與原字串完全相同
            const parts = [];
            let prev = null, count = 0;
            for (const cell of cells) {
                const key = TYPE_KEYS.indexOf(cell.type) + '.' + (cell.elevation || 1);
                if (key === prev) count++;
                else { if (prev !== null) parts.push(prev + '.' + count); prev = key; count = 1; }
            }
            if (prev !== null) parts.push(prev + '.' + count);
            const prefix = (rows_ === 26 && cols_ === 24) ? '' : rows_ + 'x' + cols_ + ';';
            const re = b64urlEncode(prefix + parts.join(','));
            if (re !== code) bad.push(`${page}: 重新 encode 後字串不同（原 ${code.length} 字元、新 ${re.length} 字元）`);
            const built = cells.filter(c => c.type !== 'empty').length;
            rows.push(`${page} · ${size}（${TOWN_SIZES[size]}）· ${built} 格有設施 · 碼長 ${code.length}`);
        }
        check('sharecodes', `站上分享碼 decode→encode 往返一致（找到 ${found.length} 組）`,
            bad.length || !found.length, bad.length ? bad : (found.length ? '全部往返一致' : '一組都沒找到（regex 失效？）'));
        if (rows.length) ctx.info('分享碼清單', rows);
    }

    /* ================= 6) DEV_GUIDE 的 cond 與 needs 自洽 ================= */
    {
        const bad = [];
        let pairs = 0;
        guide.forEach(st => st.items.forEach(e => {
            const needs = e.needs || {}, cond = e.cond || '';
            // 正向：cond 寫「網球場×2」時 needs 必須有對應設施且數量相同
            for (const m of cond.matchAll(/([一-鿿]+)×(\d+)/g)) {
                pairs++;
                const ids = Object.keys(needs).filter(k => items[k] && items[k].name === m[1]);
                if (!ids.length) bad.push(`${e.id}: cond 寫「${m[0]}」但 needs 沒有對應設施（needs=${JSON.stringify(needs)}）`);
                else if (needs[ids[0]] !== +m[2]) bad.push(`${e.id}: cond 寫「${m[0]}」但 needs.${ids[0]} = ${needs[ids[0]]}`);
            }
            // 反向：needs 列的設施，cond 至少要提到它的名字（否則使用者看不到這個前置條件）
            for (const k of Object.keys(needs)) {
                const nm = items[k] ? items[k].name : k;
                if (!cond.includes(nm)) bad.push(`${e.id}: needs 有 ${nm}×${needs[k]} 但 cond「${cond}」完全沒提到`);
            }
        }));
        check('devguide', `DEV_GUIDE 的 cond 與 needs 自洽（${pairs} 組「×N」條件）`, bad.length, bad.length ? bad : '全部自洽');
    }

    /* ================= 7) 每頁可見字數 <1,000 報警 ================= */
    {
        const pages = [];
        (function walk(dir) {
            for (const name of fs.readdirSync(dir).sort()) {
                const full = path.join(dir, name);
                const st = fs.statSync(full);
                if (st.isDirectory()) { if (name !== 'scripts' && name !== 'sim') walk(full); }
                else if (name === 'index.html') pages.push(full);
            }
        })(S2);
        const counts = pages.map(f => ({
            page: path.relative(S2, f).split(path.sep).join('/').replace(/index\.html$/, '') || './',
            n: visibleText(fs.readFileSync(f, 'utf8'))
        })).sort((a, b) => a.n - b.n);
        const thin = counts.filter(c => c.n < 1000);
        check('wordcount', `每頁可見字數 ≥1,000（${pages.length} 頁，不含 sim/）`, thin.length,
            thin.length ? thin.map(c => `${c.page}：${c.n} 字`) : '全部達標');
        ctx.info('字數分佈（少→多）', counts.map(c => `${c.n}\t${c.page}`));
    }
};
