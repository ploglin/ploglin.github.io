// .xlsx 讀取（B.7.1、E.1）：只在使用者選 .xlsx/.xls 時動態載入 SheetJS CE（版本鎖死 0.18.5）。
// cdnjs 提供的是 UMD 版，因此以 <script> 注入後取 window.XLSX（效果等同 import() 動態載入）。
import { trimTrailing } from './clean.js';

export const SHEETJS_URL = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';
let loading = null;

export function loadSheetJS(timeoutMs = 20000) {
  if (globalThis.XLSX) return Promise.resolve(globalThis.XLSX);
  if (loading) return loading;
  loading = new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = SHEETJS_URL; s.async = true; s.crossOrigin = 'anonymous';
    const timer = setTimeout(() => { loading = null; reject(new Error('xlsx-timeout')); }, timeoutMs);
    s.onload = () => { clearTimeout(timer); globalThis.XLSX ? resolve(globalThis.XLSX) : (loading = null, reject(new Error('xlsx-missing'))); };
    s.onerror = () => { clearTimeout(timer); loading = null; s.remove(); reject(new Error('xlsx-offline')); };
    document.head.appendChild(s);
  });
  return loading;
}

/** ArrayBuffer → { sheetNames, read(name) → grid }；grid 已依最後非空格裁切（`!ref` 不可信） */
export async function readWorkbook(buf) {
  const XLSX = await loadSheetJS();
  const wb = XLSX.read(new Uint8Array(buf), { type: 'array' });
  return {
    sheetNames: wb.SheetNames.slice(),
    read(name) {
      const ws = wb.Sheets[name || wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '', blankrows: false, raw: false });
      const ref = ws['!ref'] || '';
      const trimmed = trimTrailing(rows.map(r => r.map(v => (v == null ? '' : String(v)))));
      return { grid: trimmed, ref, rawRows: rows.length };
    },
  };
}
