// 口袋學院物語2——模擬器語法／遊戲資料／跨檔一致性檢查
//
// 用法：node scripts/check.js            （FAIL 為 0 才算改完；WARN 不擋工作）
//       node scripts/check.js --strict   （把 WARN 一併升成 FAIL，供收尾把關）
//
// 入口不可換：/pa2-check 技能與兩份 CLAUDE.md 都寫「跑 node scripts/check.js」。
// 本檔只負責「報告器 + require 各模組 + 退出碼」，檢查邏輯在 scripts/checks/ 下：
//   checks/parse.js        從 sim/index.html 抓資料區塊（共用）
//   checks/sim.js          模擬器本體 8 組（原有，PASS/FAIL）
//   checks/consistency.js  sim↔db／presets／typekeys.lock／分享碼／字數（B0 新增，WARN）
'use strict';

const fs = require('fs');
const path = require('path');

const S2 = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(S2, 'sim', 'index.html'), 'utf8');
const STRICT = process.argv.includes('--strict');
const VERBOSE = process.argv.includes('--verbose') || process.argv.includes('-v');

let fails = 0, warns = 0;
const LIST_MAX = 10;

function render(detail, max) {
    if (detail == null || detail === '') return '';
    if (!Array.isArray(detail)) return '：' + detail;
    const cap = max || LIST_MAX;
    const shown = detail.slice(0, cap).map(s => '\n        · ' + s).join('');
    return '：' + shown + (detail.length > cap ? `\n        …其餘 ${detail.length - cap} 項` : '');
}

// 原有介面：ok(name, pass, detail) —— 不通過就是 FAIL
function ok(name, pass, detail) {
    console.log((pass ? 'PASS' : 'FAIL') + '  ' + name + (pass ? '' : render(detail)));
    if (!pass) fails++;
}

// 新增的 WARN 層級：soft(level, name, bad, detail)
//   level 'warn' → 不通過印 WARN（--strict 時升為 FAIL）
//   level 'fail' → 不通過印 FAIL
function soft(level, name, bad, detail) {
    if (!bad) { console.log('PASS  ' + name + render(detail)); return; }
    const asFail = level === 'fail' || STRICT;
    console.log((asFail ? 'FAIL' : 'WARN') + '  ' + name + render(detail));
    if (asFail) fails++; else warns++;
}

// 純資訊（基線用的數字表）；預設收摺，--verbose 才全印
function info(name, lines) {
    const arr = Array.isArray(lines) ? lines : [lines];
    if (VERBOSE) console.log('INFO  ' + name + render(arr, Infinity));
    else console.log('INFO  ' + name + '：' + arr.length + ' 項（--verbose 看全部）');
}

function bail() {
    console.log('\nJS 語法沒過，後續檢查全部跳過');
    process.exit(1);
}

/* ---- 抓資料區塊 ---- */
let data;
try {
    data = require('./checks/parse.js')(html);
} catch (e) {
    ok('sim/index.html 的資料區塊可解析', false, e.message);
    process.exit(1);
}

const ctx = { html, S2, data, strict: STRICT, ok, soft, info, bail };

console.log('── 模擬器本體 ' + '─'.repeat(38));
require('./checks/sim.js')(ctx);

console.log('\n── 跨檔一致性（B0 新增，WARN 層級） ' + '─'.repeat(18));
require('./checks/consistency.js')(ctx);

console.log('\n' + '='.repeat(52));
if (fails) console.log(`共 ${fails} 項未通過` + (warns ? `、${warns} 項警告` : ''));
else if (warns) console.log(`全部通過 ✔（另有 ${warns} 項 WARN；--strict 會把它們當 FAIL）`);
else console.log('全部通過 ✔');
process.exit(fails ? 1 : 0);
