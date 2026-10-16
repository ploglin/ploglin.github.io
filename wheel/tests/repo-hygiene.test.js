// repo 衛生：
// 1. 真實名單 docs/名單.xlsx 的任何姓名都不得出現在 wheel/ 內任何檔案（找不到真實檔則略過）
// 2. 所有 ES module 的相對 import 都指向存在的檔案（GitHub Pages /wheel/ 下路徑正確）
// 3. 所有 .js 通過語法檢查（以 node:vm 的 SourceTextModule 不可用，改用 --check 子程序）
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { readXlsx } from './helpers/xlsx-node.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const REAL = path.join(ROOT, '..', 'docs', '名單.xlsx');

function walk(dir, out = []) {
  for (const f of fs.readdirSync(dir)) {
    const p = path.join(dir, f);
    if (f === 'node_modules') continue;
    if (fs.statSync(p).isDirectory()) walk(p, out); else out.push(p);
  }
  return out;
}
const ALL = walk(ROOT);

test('真實名單姓名不得出現在 wheel/ 內任何檔案', { skip: !fs.existsSync(REAL) && '找不到 docs/名單.xlsx（僅本機有）' }, () => {
  const g = readXlsx(fs.readFileSync(REAL)).grid;
  const names = new Set(g.slice(1).flat().map(s => String(s).trim()).filter(s => s.length >= 2));
  assert.ok(names.size >= 70);
  const hits = [];
  for (const f of ALL) {
    let text;
    if (f.endsWith('.xlsx')) text = readXlsx(fs.readFileSync(f)).grid.flat().join('\n');
    else if (/big5/i.test(path.basename(f))) text = new TextDecoder('big5').decode(fs.readFileSync(f));
    else if (/\.(png|jpe?g|webp|gif|woff2?)$/i.test(f)) continue;
    else text = fs.readFileSync(f, 'utf8');
    for (const n of names) if (text.includes(n)) { hits.push(path.relative(ROOT, f)); break; }
  }
  assert.deepEqual(hits, [], '以下檔案含真實姓名（不印出姓名本身）');
});

test('所有相對 import 指向存在的檔案', () => {
  const bad = [];
  for (const f of ALL.filter(x => x.endsWith('.js') && !x.includes(`${path.sep}tests${path.sep}`))) {
    const t = fs.readFileSync(f, 'utf8');
    const re = /(?:import|export)\s[^'"`]*?from\s*['"](\.[^'"]+)['"]|import\(\s*['"](\.[^'"]+)['"]\s*\)|^\s*import\s*['"](\.[^'"]+)['"]/gm;
    let m;
    while ((m = re.exec(t))) {
      const spec = m[1] || m[2] || m[3];
      const target = path.resolve(path.dirname(f), spec.split('?')[0]);
      if (!fs.existsSync(target)) bad.push(`${path.relative(ROOT, f)} → ${spec}`);
    }
  }
  for (const f of ALL.filter(x => x.endsWith('.html'))) {
    const t = fs.readFileSync(f, 'utf8');
    for (const m of t.matchAll(/<script[^>]+src=["']([^"']+)["']/g)) {
      const src = m[1];
      if (/^(https?:)?\/\//.test(src)) continue;
      const target = path.resolve(path.dirname(f), src.split('?')[0]);
      if (!fs.existsSync(target)) bad.push(`${path.relative(ROOT, f)} → ${src}`);
    }
    for (const m of t.matchAll(/<link[^>]+href=["']([^"']+\.css[^"']*)["']/g)) {
      const href = m[1];
      if (/^(https?:)?\/\//.test(href)) continue;
      const target = path.resolve(path.dirname(f), href.split('?')[0]);
      if (!fs.existsSync(target)) bad.push(`${path.relative(ROOT, f)} → ${href}`);
    }
  }
  assert.deepEqual(bad, []);
});

test('沒有以「/」開頭的站內絕對路徑（GitHub Pages 子路徑 /wheel/ 下會失效時才算錯；/assets 例外指站根）', () => {
  const bad = [];
  for (const f of ALL.filter(x => /\.(js|html)$/.test(x) && !x.includes(`${path.sep}tests${path.sep}`))) {
    const t = fs.readFileSync(f, 'utf8');
    for (const m of t.matchAll(/from\s*['"](\/[^'"]*)['"]/g)) bad.push(`${path.relative(ROOT, f)} → ${m[1]}`);
  }
  assert.deepEqual(bad, []);
});

test('所有 .js 語法正確（node --check）', () => {
  const bad = [];
  for (const f of ALL.filter(x => x.endsWith('.js'))) {
    try { execFileSync(process.execPath, ['--check', f], { stdio: 'pipe' }); }
    catch (e) { bad.push(`${path.relative(ROOT, f)}: ${String(e.stderr).split('\n').slice(0, 5).join(' ')}`); }
  }
  assert.deepEqual(bad, []);
});
