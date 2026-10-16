// F.1-15 文案 lint：對外可見文案只用「作廢」「補抽」「籤數」；無「重抽」「權重」「不參加」、無驚嘆號、無 emoji。
// 掃描範圍：wheel/ 下所有 .js / .html / .css（排除 tests/、DESIGN.md、API.md、io/shape.js）。
// io/shape.js 的同義詞表是「辨識匯入檔表頭」的比對字（例如有人的 Excel 欄名寫「權重」），不是對外文案。
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SKIP_DIRS = new Set(['tests', 'node_modules']);
const SKIP_FILES = new Set(['io/shape.js']);

function walk(dir, out = []) {
  for (const f of fs.readdirSync(dir)) {
    const p = path.join(dir, f);
    const rel = path.relative(ROOT, p).replace(/\\/g, '/');
    if (fs.statSync(p).isDirectory()) { if (!SKIP_DIRS.has(f)) walk(p, out); continue; }
    if (!/\.(js|html|css)$/.test(f) || SKIP_FILES.has(rel)) continue;
    out.push({ rel, text: fs.readFileSync(p, 'utf8') });
  }
  return out;
}

/** 去掉 JS / CSS 註解，只檢查實際會輸出的字（註解裡引用禁用詞做說明是允許的） */
function stripComments(rel, t) {
  if (rel.endsWith('.html')) return t.replace(/<!--[\s\S]*?-->/g, '');
  return t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:"'`\\])\/\/.*$/gm, '$1');
}

const files = walk(ROOT);
const FORBIDDEN = ['重抽', '權重', '不參加', '！', '剛才那位不在場'];

test('有掃到檔案', () => { assert.ok(files.length > 10, `files=${files.length}`); });

test('禁用詞 = 0（重抽 / 權重 / 不參加 / 全形驚嘆號 / 剛才那位不在場）', () => {
  const hits = [];
  for (const f of files) {
    const t = stripComments(f.rel, f.text);
    for (const w of FORBIDDEN) if (t.includes(w)) hits.push(`${f.rel}: ${w}`);
  }
  assert.deepEqual(hits, []);
});

test('中文文案後不接半形驚嘆號', () => {
  const hits = [];
  for (const f of files) {
    const t = stripComments(f.rel, f.text);
    const m = t.match(/[㐀-鿿＀-￯]\s*!(?!=)/g);
    if (m) hits.push(`${f.rel}: ${m.slice(0, 3).join(' | ')}`);
  }
  assert.deepEqual(hits, []);
});

test('emoji = 0（圖示一律 inline SVG）', () => {
  const re = /\p{Extended_Pictographic}/u;
  const hits = [];
  for (const f of files) {
    const t = stripComments(f.rel, f.text);
    const lines = t.split('\n');
    lines.forEach((l, i) => { const m = l.match(re); if (m) hits.push(`${f.rel}:${i + 1} U+${m[0].codePointAt(0).toString(16)}`); });
  }
  assert.deepEqual(hits, []);
});

test('加碼鍵位提示含 Shift+B（i18n 檔存在時）', (t) => {
  const i18n = files.filter(f => /^ui\/i18n[^/]*\.js$/.test(f.rel));
  if (!i18n.length) { t.skip('ui/i18n*.js 尚未建立'); return; }
  const all = i18n.map(f => f.text).join('\n') + files.filter(f => f.rel.startsWith('ui/')).map(f => f.text).join('\n');
  assert.ok(all.includes('Shift+B'), '找不到 Shift+B 加碼提示');
});

test('用詞：對外文案使用「作廢」「補抽」「籤數」', (t) => {
  const ui = files.filter(f => f.rel.startsWith('ui/') || f.rel.endsWith('.html'));
  if (!files.some(f => /^ui\/i18n[^/]*\.js$/.test(f.rel))) { t.skip('UI 文案檔（ui/i18n*.js）尚未建立'); return; }
  const all = ui.map(f => f.text).join('\n');
  for (const w of ['作廢', '補抽', '籤數']) assert.ok(all.includes(w), `UI 未出現「${w}」`);
});
