// F.1-1、F.1-2：匯入（長表 / 寬表偵測與清理）、真實名單（找不到就 skip）、去重
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseCSV, parseDelimited, decodeBytes, parsePaste, toCSV } from '../io/csv.js';
import { cleanCell, cleanGrid, trimTrailing, notName, looksLikeName, splitMulti } from '../io/clean.js';
import { detectShape, scoreLong, scoreWide } from '../io/shape.js';
import { gridToRows, autoMap, applyImport } from '../io/mapping.js';
import { classifyAgainst, findDuplicates, normalize, dedupeKey } from '../core/dedupe.js';
import { createEvent, createParticipant, addLog } from '../core/model.js';
import { readXlsx } from './helpers/xlsx-node.js';
import { WIDE_GROUPS, WIDE_COUNTS } from './fixtures/make-fixtures.js';

const DIR = path.dirname(fileURLToPath(import.meta.url));
const FX = (f) => path.join(DIR, 'fixtures', f);
const REAL = path.join(DIR, '..', '..', 'docs', '名單.xlsx');

/** 與瀏覽器相同的管線：原始 grid → 裁切 → 清理 → 偵測 → rows */
function pipeline(raw, forceShape) {
  const trimmed = trimTrailing(raw);
  const { grid, trimmedRows } = cleanGrid(trimmed);
  const det = detectShape(grid);
  const shape = forceShape || det.shape;
  const res = gridToRows(grid, shape, {});
  return { grid, det, res, trimmedRows, rawRows: raw.length, trimmedFromRef: raw.length - trimmed.length };
}

test('RFC 4180：引號、逗號、換行、跳脫雙引號', () => {
  const g = parseDelimited('a,"b,c","d""e"\r\n"多\n行",x,\n', ',');
  assert.deepEqual(g, [['a', 'b,c', 'd"e'], ['多\n行', 'x', '']]);
  assert.equal(toCSV([['a,b', 'c"d']], { bom: false }), '"a,b","c""d"\r\n');
});

test('F.1-1：300 人 CSV（UTF-8 BOM 與 Big5）< 2 s，內容一致', () => {
  const t0 = performance.now();
  const u = decodeBytes(fs.readFileSync(FX('names-300.csv')));
  const b = decodeBytes(fs.readFileSync(FX('big5.csv')));
  assert.equal(u.encoding, 'utf-8'); assert.equal(b.encoding, 'big5');
  const ru = pipeline(parseCSV(u.text)), rb = pipeline(parseCSV(b.text));
  const elapsed = performance.now() - t0;
  assert.ok(elapsed < 2000, `${elapsed} ms`);
  assert.equal(ru.det.shape, 'long'); assert.equal(rb.det.shape, 'long');
  const live = ru.res.rows.filter(r => !r.skip);
  assert.equal(live.length, 300);
  assert.deepEqual(rb.res.rows.map(r => r.name), ru.res.rows.map(r => r.name));
  assert.equal(ru.res.mapping[0], 'name'); assert.equal(ru.res.mapping[1], 'group'); assert.equal(ru.res.mapping[2], 'code'); assert.equal(ru.res.mapping[3], 'weight');
  assert.equal(live.filter(r => r.weight === 2).length, Math.ceil(300 / 37));
});

test('F.1-2：wide-8groups.xlsx（dimension 到第 34 列）→ 寬表、74 人 8 群組、無空白人；切長表再切回即時更新', () => {
  const x = readXlsx(fs.readFileSync(FX('wide-8groups.xlsx')));
  assert.equal(x.ref, 'A1:H34');
  assert.equal(x.grid.length, 34);
  const p = pipeline(x.grid);
  assert.equal(p.trimmedFromRef, 16);                // 已略過下方 16 列空白
  assert.equal(p.det.shape, 'wide'); assert.equal(p.det.uncertain, false);
  assert.equal(p.det.long, 0); assert.equal(p.det.wide, 1);
  const live = p.res.rows.filter(r => !r.skip);
  assert.equal(live.length, 74);
  assert.ok(live.every(r => r.name && r.name.trim()));
  assert.deepEqual(p.res.groups.map(g => g.name), WIDE_GROUPS);
  assert.deepEqual(p.res.groups.map(g => g.count), WIDE_COUNTS);
  // 切長表：第 1 欄姓名、第 2 欄群組（表頭當一般列）→ 結果不同；再切回寬表 → 與原本相同
  const asLong = gridToRows(p.grid, 'long', {});
  assert.notEqual(asLong.rows.filter(r => !r.skip).length, 74);
  const back = gridToRows(p.grid, 'wide', {});
  assert.deepEqual(back.rows.map(r => r.name), p.res.rows.map(r => r.name));
  // 步驟 ③：匯入到空名單，無衝突
  const ev = createEvent({ name: 't' });
  const cls = classifyAgainst(ev.participants, live);
  assert.equal(cls.filter(c => c.level > 0).length, 0);
});

test('真實名單 docs/名單.xlsx：8 組、各組 11/17/11/13/6/7/8/1、共 74 人（找不到檔案則略過）', { skip: !fs.existsSync(REAL) && '找不到 docs/名單.xlsx（已 gitignore，僅本機有）' }, () => {
  const x = readXlsx(fs.readFileSync(REAL));
  assert.equal(x.sheetNames.length, 1);
  const p = pipeline(x.grid);
  assert.equal(p.det.shape, 'wide');
  assert.equal(p.det.uncertain, false);
  const live = p.res.rows.filter(r => !r.skip);
  assert.equal(live.length, 74);
  assert.equal(p.res.groups.length, 8);
  assert.deepEqual(p.res.groups.map(g => g.count), [11, 17, 11, 13, 6, 7, 8, 1]);
  assert.ok(live.every(r => r.name.length >= 2 && !r.flags.notName && !r.flags.multi));
  // 寫入活動：74 人、8 群組、籤數全 1
  const ev = createEvent({ name: 't' });
  const r = applyImport(ev, p.res.rows, { source: 'xlsx', fileName: '名單.xlsx', shape: 'wide' }, classifyAgainst, createParticipant, addLog);
  assert.equal(r.added, 74);
  assert.equal(new Set(ev.participants.map(q => q.group)).size, 8);
  assert.ok(ev.participants.every(q => q.weight === 1 && !q.excluded));
  // 重複匯入同一份：全部視為完全相同 → 跳過
  const r2 = applyImport(ev, p.res.rows, { source: 'xlsx' }, classifyAgainst, createParticipant, addLog);
  assert.equal(r2.added, 0); assert.equal(r2.skipped, 74);
});

test('格子清理：NFKC、全形空白、NBSP、零寬、符號視為空、多名拆分、非姓名標記', () => {
  assert.equal(cleanCell('　王  小明​ '), '王 小明');
  assert.equal(cleanCell('ＡＢＣ１２'), 'ABC12');
  for (const s of ['-', '—', '.', 'N/A', '無', '空']) assert.equal(cleanCell(s), '');
  assert.deepEqual(splitMulti('甲甲、乙乙/丙丙'), ['甲甲', '乙乙', '丙丙']);
  assert.ok(notName('12345')); assert.ok(notName('a@b.c')); assert.ok(notName('http://x')); assert.ok(notName('x'.repeat(21)));
  assert.ok(!notName('王小明'));
  assert.ok(looksLikeName('王小明')); assert.ok(looksLikeName('John Smith')); assert.ok(!looksLikeName('A1'));
});

test('寬表：中間空格略過、空標題 → 第 n 欄、多名預設拆、非姓名預設跳過', () => {
  const raw = [['甲組', '', '丙組'], ['王一一', '李二二', '-'], ['', '張三三', '周四四、吳五五'], ['陳六六', '12345', ''], ['', '', ''], ['', '', '']];
  const p = pipeline(raw, 'wide');
  const names = p.res.rows.filter(r => !r.skip).map(r => `${r.group}:${r.name}`);
  assert.deepEqual(names, ['甲組:王一一', '甲組:陳六六', '第 2 欄:李二二', '第 2 欄:張三三', '丙組:周四四', '丙組:吳五五']);
  assert.ok(p.res.groups.find(g => g.name === '第 2 欄').unnamed);
  assert.equal(p.res.skipped, 1);
});

test('長表：表頭同義詞對應、籤數 0 → 排除(imported-zero)、非法籤數設 1、空姓名跳過；無表頭 → 第 1 欄姓名第 2 欄群組', () => {
  const g = [['姓名', '部門', '工號', '權重', '備註'], ['王一一', '業務', 'A1', '0', ''], ['李二二', '行政', 'A2', 'abc', 'x'], ['', '行政', 'A3', '1', ''], ['張三三', '工務', 'A4', '3', '']];
  const r = gridToRows(g, 'long', {});
  const [a, b, c, d] = r.rows;
  assert.equal(a.excluded, true); assert.equal(a.excludeReason, 'imported-zero'); assert.equal(a.weight, 1);
  assert.equal(b.weight, 1); assert.ok(b.flags.badWeight); assert.equal(b.note, 'x');
  assert.ok(c.skip); assert.ok(c.flags.emptyName);
  assert.equal(d.weight, 3); assert.equal(d.code, 'A4'); assert.equal(d.group, '工務');
  const nh = autoMap([['王一一', '業務'], ['李二二', '行政']]);
  assert.equal(nh.hasHeader, false); assert.deepEqual(nh.mapping, ['name', 'group']);
});

test('形狀計分：長表含同義詞與數字欄 → long；不確定時 uncertain', () => {
  assert.ok(scoreLong([['姓名', '籤數'], ['王一一', '1'], ['李二二', '2']]) >= 0.9);
  const one = detectShape([['王一一'], ['李二二'], ['張三三']]);
  assert.equal(one.shape, 'long');
  assert.ok(scoreWide([['A', 'B'], ['王一一', '李二二']]) > 0);
});

test('貼上：Tab > , > ， > 、 > 連續空白 的分隔符優先序；單欄一行一人', () => {
  assert.deepEqual(parsePaste('a\tb\nc\td'), [['a', 'b'], ['c', 'd']]);
  assert.deepEqual(parsePaste('王一一，業務\n李二二，行政'), [['王一一', '業務'], ['李二二', '行政']]);
  assert.deepEqual(parsePaste('王一一、李二二'), [['王一一', '李二二']]);
  assert.deepEqual(parsePaste('王一一  業務\n李二二  行政'), [['王一一', '業務'], ['李二二', '行政']]);
  assert.deepEqual(parsePaste('王一一\n李二二'), [['王一一'], ['李二二']]);
});

test('去重：同 code / 同名同組 → 1；同名異組 → 2（預設兩筆都留）；差一字同組 → 3', () => {
  const ex = [createParticipant({ name: '王小明', group: '北區', code: 'E1' }), createParticipant({ name: '李小華', group: '行政' })];
  const cls = classifyAgainst(ex, [
    { name: '王大明', code: 'E1' }, { name: '李小華', group: '行政' }, { name: '李小華', group: '業務' }, { name: '李小樺', group: '行政' }, { name: '新人甲', group: '行政' },
  ]);
  assert.deepEqual(cls.map(c => c.level), [1, 1, 2, 3, 0]);
  assert.ok(cls[0].sameCodeDiffName);
  assert.equal(normalize(' 王　小明 '), '王 小明');
  assert.equal(dedupeKey({ name: '王小明', group: '北區' }), 'ng:王小明|北區');
  const ev = createEvent({ name: 't' });
  ev.participants.push(...ex);
  const r = applyImport(ev, [{ name: '李小華', group: '業務', weight: 1, flags: {} }], { sameName: 'separate' }, classifyAgainst, createParticipant, addLog);
  assert.equal(r.added, 1);
  const dups = findDuplicates([...ex, createParticipant({ name: '王小明', group: '中' })]);
  assert.ok(dups.some(d => d.level === 2));
});
