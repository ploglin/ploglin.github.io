// 產生測試 fixtures（全部假名）。用法：node tests/fixtures/make-fixtures.js
// - wide-8groups.xlsx：仿真實名單形狀（8 群組欄、各欄 11/17/11/13/6/7/8/1、共 74 人、dimension 刻意到第 34 列）
// - names-300.csv：長表 300 人（UTF-8 BOM）
// - big5.csv：同形狀長表 300 人，Big5 編碼
// - event-v1.json：schemaVersion 1 的活動備份
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { writeXlsx } from '../helpers/xlsx-node.js';

const DIR = path.dirname(fileURLToPath(import.meta.url));

// 決定性亂數（mulberry32），讓 fixture 每次產生都相同
function rng(seed) { return () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const SUR = '甄卜伍言祁苗巫柏符卓殷牛溫湛';
const G1 = '芷澄昕岑莞霽沂翎翊苡筠琛';
const G2 = '禾汐檸瑜嵐璟澈蔚棠柚霏楠';

export function fakeNames(n, seed = 7) {
  const r = rng(seed); const out = new Set();
  while (out.size < n) out.add(SUR[Math.floor(r() * SUR.length)] + G1[Math.floor(r() * G1.length)] + G2[Math.floor(r() * G2.length)]);
  return [...out];
}

export const WIDE_GROUPS = ['一部', '二部', '三部', '東區', '西區', '山', '海', '離島'];
export const WIDE_COUNTS = [11, 17, 11, 13, 6, 7, 8, 1];

export function wideGrid() {
  const names = fakeNames(74, 11);
  const cols = []; let k = 0;
  for (const c of WIDE_COUNTS) { cols.push(names.slice(k, k + c)); k += c; }
  const h = Math.max(...WIDE_COUNTS);
  const grid = [WIDE_GROUPS.slice()];
  for (let i = 0; i < h; i++) grid.push(cols.map(c => c[i] || ''));
  return grid;
}

function big5Encoder() {
  const dec = new TextDecoder('big5'); const map = new Map();
  for (let a = 0x81; a <= 0xFE; a++) {
    for (const range of [[0x40, 0x7E], [0xA1, 0xFE]]) {
      for (let b = range[0]; b <= range[1]; b++) {
        const ch = dec.decode(new Uint8Array([a, b]));
        if (ch.length === 1 && ch !== '�' && !map.has(ch)) map.set(ch, [a, b]);
      }
    }
  }
  return (str) => {
    const out = [];
    for (const ch of str) { const c = ch.codePointAt(0); if (c < 0x80) out.push(c); else { const m = map.get(ch); if (!m) throw new Error('no big5 for ' + ch); out.push(...m); } }
    return Buffer.from(out);
  };
}

function longRows() {
  const names = fakeNames(300, 23);
  const groups = ['研發', '業務', '客服', '財務', '總務', '倉儲'];
  const rows = [['姓名', '部門', '員編', '籤數']];
  names.forEach((n, i) => rows.push([n, groups[i % groups.length], 'E' + String(1001 + i), i % 37 === 0 ? '2' : '1']));
  return rows;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  fs.writeFileSync(path.join(DIR, 'wide-8groups.xlsx'), writeXlsx(wideGrid(), { sheetName: '聯絡名單', refRows: 34 }));
  const csv = longRows().map(r => r.join(',')).join('\r\n') + '\r\n';
  fs.writeFileSync(path.join(DIR, 'names-300.csv'), '﻿' + csv, 'utf8');
  fs.writeFileSync(path.join(DIR, 'big5.csv'), big5Encoder()(csv));
  // event-v1.json：schemaVersion 1 備份（含一筆確認、一筆作廢 + 補抽）
  const { createEvent, createParticipant, createPrize } = await import('../../core/model.js');
  const { performDraw, confirmBatch, voidDraws } = await import('../../core/draw.js');
  const { makeBackup } = await import('../../store/backup.js');
  const ev = createEvent({ name: '範例尾牙', date: '2026-01-20', scenario: 'banquet', absentKeepsEligibility: true });
  fakeNames(12, 5).forEach((n, i) => ev.participants.push(createParticipant({ name: n, group: ['一部', '二部', '三部'][i % 3], source: 'xlsx' })));
  ev.prizes.push(createPrize({ name: '普獎', quantity: 2, perDraw: 2 }, 1), createPrize({ name: '頭獎', quantity: 1 }, 2));
  const r = await performDraw(ev, ev.prizes[0].id, { wheelMode: 'none' });
  voidDraws(ev, [r.records[0].id], { reason: 'absent' });
  confirmBatch(ev, r.batchId);
  const r2 = await performDraw(ev, ev.prizes[0].id, { wheelMode: 'none' });
  confirmBatch(ev, r2.batchId);
  fs.writeFileSync(path.join(DIR, 'event-v1.json'), JSON.stringify(makeBackup(ev), null, 2) + '\n', 'utf8');
  console.log('fixtures written');
}
