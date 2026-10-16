// 匯入名單對話框（D.3 三步）：① 來源（檔案 / 貼上 / 範本）② 格式（寬表 / 長表偵測與切換、欄位對應、清理）③ 預覽（衝突選項只在有衝突時出現）
// 管線（core/API.md）：trimTrailing → cleanGrid → detectShape → gridToRows → classifyAgainst → applyImport
import { h, icon, dialog, readFileBuffer } from './dom.js';
import { ctx, tryEdit } from './app-ctx.js';
import { toast } from './toast.js';
import { T } from './i18n.js';
import { decodeBytes, parseCSV, parsePaste, toCSV } from '../io/csv.js';
import { readWorkbook } from '../io/xlsx.js';
import { cleanGrid, trimTrailing } from '../io/clean.js';
import { detectShape } from '../io/shape.js';
import { gridToRows, autoMap, applyImport } from '../io/mapping.js';
import { classifyAgainst } from '../core/dedupe.js';
import { createParticipant, addLog, PALETTE, groupOrder, deepClone } from '../core/model.js';
import { download } from '../io/export.js';
import { canEditWeights } from './unlock.js';

const ALL_FIELDS = ['name', 'group', 'code', 'weight', 'excluded', 'tags', 'note', ''];
/** 未解鎖時不提供「籤數」對應，匯入也不讀籤數欄（不能靠匯入取得籤數） */
const fields = () => (canEditWeights() ? ALL_FIELDS : ALL_FIELDS.filter(f => f !== 'weight'));
const PREVIEW_LIMIT = 300;

/**
 * openImportDialog({ file?, text?, onDone? })
 * file：直接從步驟 ② 開始；text：貼上的文字直接進步驟 ②。
 */
export function openImportDialog({ file = null, text = null, onDone = null } = {}) {
  const S = {
    step: 1, tab: 'file', srcName: '', srcKind: 'paste', wb: null, sheetNames: [], sheet: null, ref: '',
    raw: [], grid: [], blankSkipped: 0, detect: null, shape: 'long', wideHeader: true,
    mapping: [], hasHeader: true, split: true, skipBad: true, renames: {}, conflict: 'skip', sameName: 'separate',
    pasteText: text || '', busy: '', error: '',
  };
  const body = h('div', { class: 'wh-import' });
  let closeFn = null;

  function setGrid(raw) {
    S.raw = raw;
    const c = cleanGrid(trimTrailing(raw));
    S.grid = c.grid;
    const m = /:([A-Z]+)(\d+)$/i.exec(S.ref || '');
    const refRows = m ? +m[2] : raw.length;
    S.blankSkipped = Math.max(0, refRows - S.grid.length);
    S.detect = detectShape(S.grid);
    S.shape = S.detect.shape;
    S.wideHeader = true;
    const am = autoMap(S.grid);
    S.mapping = am.mapping.map(f => (f === 'weight' && !canEditWeights() ? '' : f || ''));
    S.hasHeader = am.hasHeader;
    S.renames = {};
  }

  async function loadFile(f) {
    S.error = ''; S.srcName = f.name;
    const ext = (f.name.split('.').pop() || '').toLowerCase();
    try {
      const buf = await readFileBuffer(f);
      if (ext === 'xlsx' || ext === 'xls') {
        S.srcKind = 'xlsx';
        S.busy = T.loadingXlsx; render();
        S.wb = await readWorkbook(buf);
        S.sheetNames = S.wb.sheetNames;
        S.sheet = S.sheetNames[0];
        readSheet();
      } else {
        S.srcKind = 'csv'; S.wb = null; S.sheetNames = []; S.ref = '';
        const { text: t } = decodeBytes(buf);
        setGrid(ext === 'txt' ? parsePaste(t) : parseCSV(t));
      }
      S.busy = '';
      if (!S.grid.length) { S.error = T.emptyGrid; S.step = 1; }
      else S.step = 2;
    } catch (e) {
      console.warn(e);
      S.busy = '';
      S.error = /xlsx-(offline|timeout|missing)/.test(String(e && e.message)) ? T.xlsxOffline : T.readFail;
      S.step = 1;
    }
    render();
  }

  function readSheet() {
    const r = S.wb.read(S.sheet);
    S.ref = r.ref;
    setGrid(r.grid);
  }

  function loadPaste() {
    S.srcKind = 'paste'; S.srcName = ''; S.ref = '';
    setGrid(parsePaste(S.pasteText));
    if (!S.grid.length) { S.error = T.emptyGrid; render(); return; }
    S.error = ''; S.step = 2; render();
  }

  /** 依目前選項算出待匯入列 */
  function compute() {
    const opts = { splitMulti: S.split, skipNotName: S.skipBad };
    let res;
    if (S.shape === 'wide') {
      const width = S.grid.reduce((m, r) => Math.max(m, r.length), 0);
      const g = S.wideHeader ? S.grid : [new Array(width).fill(''), ...S.grid];
      res = gridToRows(g, 'wide', opts);
      for (const r of res.rows) if (S.renames[r.group]) r.group = S.renames[r.group];
      res.groups = res.groups.map(x => ({ ...x, display: S.renames[x.name] || x.name }));
    } else {
      const wOn = canEditWeights();
      res = gridToRows(S.grid, 'long', { ...opts, mapping: S.mapping.map(f => (f === 'weight' && !wOn ? null : f || null)), hasHeader: S.hasHeader });
    }
    const live = res.rows.filter(r => !r.skip && r.name);
    const cls = classifyAgainst(ctx.store.official.participants, live);
    live.forEach((r, i) => { r._cls = cls[i]; });
    const c = { 1: 0, 2: 0, 3: 0 };
    for (const x of cls) if (x.level) c[x.level]++;
    return { ...res, live, conflicts: c };
  }

  // ---------- 渲染 ----------
  function stepper() {
    const st = [T.stepSource, T.stepFormat, T.stepPreview];
    return h('ol', { class: 'wh-stepper' }, ...st.map((s, i) => h('li', { class: S.step === i + 1 ? 'on' : S.step > i + 1 ? 'done' : '', 'aria-current': S.step === i + 1 ? 'step' : null }, h('span', { class: 'n' }, String(i + 1)), s)));
  }

  function footer(...btns) { return h('div', { class: 'dlg-actions wh-import-foot' }, ...btns); }
  const btn = (label, kind, fn, extra = {}) => h('button', { type: 'button', class: `btn btn-${kind}`, onclick: fn, ...extra }, label);

  function step1() {
    const tabs = [['file', T.tabFile], ['paste', T.tabPaste], ['template', T.tabTemplate]];
    const tabBar = h('div', { class: 'wh-seg wh-seg-tabs', role: 'tablist' }, ...tabs.map(([k, l]) => h('button', { type: 'button', role: 'tab', 'aria-selected': String(S.tab === k), class: S.tab === k ? 'on' : '', onclick: () => { S.tab = k; render(); } }, l)));
    let panel;
    if (S.tab === 'file') {
      const inp = h('input', { type: 'file', accept: '.xlsx,.xls,.csv,.tsv,.txt', hidden: true });
      inp.addEventListener('change', () => { if (inp.files[0]) loadFile(inp.files[0]); });
      const zone = h('div', { class: 'wh-dropzone', tabindex: '0', role: 'button', 'aria-label': T.dropHere + T.chooseFile },
        icon('upload', 36), h('p', null, T.dropHere, ' ', h('span', { class: 'link-btn' }, T.chooseFile)), h('p', { class: 'wh-hint' }, T.fileTypes), inp);
      zone.addEventListener('click', () => inp.click());
      zone.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); inp.click(); } });
      zone.addEventListener('dragover', (e) => { e.preventDefault(); zone.classList.add('is-drop'); });
      zone.addEventListener('dragleave', () => zone.classList.remove('is-drop'));
      zone.addEventListener('drop', (e) => { e.preventDefault(); zone.classList.remove('is-drop'); const f = e.dataTransfer.files[0]; if (f) loadFile(f); });
      panel = zone;
    } else if (S.tab === 'paste') {
      const ta = h('textarea', { class: 'input wh-paste', rows: 10, placeholder: T.pastePlaceholder, 'aria-label': T.tabPaste });
      ta.value = S.pasteText;
      ta.addEventListener('input', () => { S.pasteText = ta.value; });
      setTimeout(() => ta.focus(), 0);
      panel = h('div', null, ta, footer(btn(T.next, 'primary', () => { if (S.pasteText.trim()) loadPaste(); else ta.focus(); })));
    } else {
      panel = h('div', { class: 'wh-templates' },
        h('p', { class: 'wh-hint' }, T.templateNote),
        btn(T.templateLong, 'ghost', () => download('名單範本-一列一人.csv', toCSV(canEditWeights()
          ? [['姓名', '群組', '編號', '籤數'], ['王小明', '業務', 'A001', '1'], ['李小華', '業務', 'A002', '1'], ['陳美玲', '行政', 'B001', '2'], ['張大同', '行政', 'B002', '1']]
          : [['姓名', '群組', '編號'], ['王小明', '業務', 'A001'], ['李小華', '業務', 'A002'], ['陳美玲', '行政', 'B001'], ['張大同', '行政', 'B002']]))),
        btn(T.templateWide, 'ghost', () => download('名單範本-一欄一群組.csv', toCSV([['業務', '行政', '北區'], ['王小明', '陳美玲', '林志明'], ['李小華', '張大同', ''], ['吳建宏', '', '']]))));
    }
    return [tabBar, S.busy ? h('p', { class: 'wh-callout', role: 'status' }, S.busy) : '', S.error ? h('p', { class: 'wh-callout wh-callout-warn', role: 'alert' }, S.error) : '', panel];
  }

  function infoLine() {
    const width = S.grid.reduce((m, r) => Math.max(m, r.length), 0);
    const parts = [];
    if (S.srcName) parts.push(S.srcName);
    const line = h('p', { class: 'wh-import-info' }, parts.join(' · '));
    if (S.sheetNames.length > 1) {
      const sel = h('select', { class: 'input wh-select', 'aria-label': T.sheet }, ...S.sheetNames.map(n => h('option', { value: n, selected: n === S.sheet }, n)));
      sel.addEventListener('change', () => { S.sheet = sel.value; readSheet(); render(); });
      line.append(' · ', T.sheet, ' ', sel);
    } else if (S.sheet) line.append(`${parts.length ? ' · ' : ''}${T.sheet}「${S.sheet}」`);
    line.append(`${line.textContent ? ' · ' : ''}${width} 欄 × ${S.grid.length} 列${S.blankSkipped ? `（已略過下方 ${S.blankSkipped} 列空白）` : ''}`);
    return line;
  }

  function step2() {
    const res = compute();
    const nodes = [infoLine()];
    if (S.detect && S.detect.uncertain) nodes.push(h('p', { class: 'wh-callout wh-callout-warn' }, icon('warning', 18), T.uncertain));
    const radio = (val, label) => {
      const r = h('input', { type: 'radio', name: 'wh-shape', value: val, checked: S.shape === val });
      r.addEventListener('change', () => { S.shape = val; render(); });
      return h('label', { class: 'wh-check-inline' }, r, h('span', null, label));
    };
    nodes.push(h('fieldset', { class: 'wh-fmt' }, h('legend', null, '格式'), radio('wide', T.fmtWide), radio('long', T.fmtLong)));
    if (S.shape === 'wide') {
      const cb = h('input', { type: 'checkbox', checked: S.wideHeader });
      cb.addEventListener('change', () => { S.wideHeader = cb.checked; S.renames = {}; render(); });
      nodes.push(h('label', { class: 'wh-check-inline' }, cb, h('span', null, T.firstRowGroups)));
      nodes.push(widePreview(res, false));
    } else {
      const cb = h('input', { type: 'checkbox', checked: S.hasHeader });
      cb.addEventListener('change', () => { S.hasHeader = cb.checked; render(); });
      nodes.push(h('label', { class: 'wh-check-inline' }, cb, h('span', null, T.firstRowHeader)));
      nodes.push(mappingTable());
    }
    const opt = (key, label) => {
      const c = h('input', { type: 'checkbox', checked: S[key] });
      c.addEventListener('change', () => { S[key] = c.checked; render(); });
      return h('label', { class: 'wh-check-inline' }, c, h('span', null, label));
    };
    nodes.push(h('div', { class: 'wh-clean' }, h('b', null, T.cleanTitle), h('span', { class: 'wh-muted' }, T.cleanFixed), opt('split', T.cleanSplit), opt('skipBad', T.cleanSkipBad)));
    const noName = S.shape === 'long' && !S.mapping.includes('name');
    if (noName) nodes.push(h('p', { class: 'field-error' }, T.needNameCol));
    nodes.push(footer(
      btn(T.back, 'ghost', () => { S.step = 1; render(); }, { 'aria-label': T.back }),
      btn(T.previewN(res.live.length), 'primary', () => { S.step = 3; render(); }, { disabled: noName || !res.live.length })));
    return nodes;
  }

  function mappingTable() {
    const width = S.grid.reduce((m, r) => Math.max(m, r.length), 0);
    const body = S.hasHeader ? S.grid.slice(1) : S.grid;
    const rows = [];
    for (let j = 0; j < width; j++) {
      const sel = h('select', { class: 'input wh-select', 'aria-label': `第 ${j + 1} 欄對應` }, ...fields().map(f => h('option', { value: f, selected: (S.mapping[j] || '') === f }, (f === 'name' ? '姓名 *' : T.mapField[f]))));
      sel.addEventListener('change', () => {
        const v = sel.value;
        if (v) S.mapping = S.mapping.map((x, k) => (k !== j && x === v ? '' : x));   // 同一欄位只對應一欄
        S.mapping[j] = v; render();
      });
      const samples = body.slice(0, 3).map(r => r[j] || '').filter(Boolean).join('、');
      rows.push(h('tr', null, h('td', null, S.hasHeader ? (S.grid[0][j] || `第 ${j + 1} 欄`) : `第 ${j + 1} 欄`), h('td', { class: 'wh-muted wh-ellipsis' }, samples || '—'), h('td', null, sel)));
    }
    return h('div', { class: 'wh-table-wrap' }, h('table', { class: 'wh-table' }, h('thead', null, h('tr', null, h('th', null, '檔案欄位'), h('th', null, '內容示例'), h('th', null, '匯入為'))), h('tbody', null, ...rows)));
  }

  function cellClass(r) {
    if (r.skip) return 'c-bad';
    if (r._cls && r._cls.level === 1) return 'c-dup';
    if (r._cls && r._cls.level === 3) return 'c-sim';
    if (r.flags && r.flags.multi) return 'c-multi';
    return '';
  }
  function cellTitle(r) {
    if (r.skip) return r.flags.emptyName ? '空白姓名，跳過' : T.legendBad;
    if (r._cls && r._cls.level === 1) return T.legendDup;
    if (r._cls && r._cls.level === 3) return T.legendSimilar;
    if (r.flags && r.flags.multi) return T.legendMulti;
    if (r.flags && r.flags.badWeight) return '籤數不合法，已設為 1';
    if (r.flags && r.flags.zero) return '籤數 0，改為排除';
    return '';
  }

  function widePreview(res, full) {
    const existing = groupOrder(ctx.store.official);
    const cols = res.groups.map((g, i) => {
      const people = res.rows.filter(r => r.group === (S.renames[g.name] || g.name));
      const idx = existing.has(g.display) ? existing.get(g.display) : existing.size + i;
      const head = h('div', { class: 'wh-wcol-head' + (g.unnamed && !S.renames[g.name] ? ' c-multi' : '') },
        h('i', { class: 'sw', style: { background: PALETTE[idx % 8] } }));
      if (g.unnamed && !full) {
        const inp = h('input', { class: 'input input-sm', value: S.renames[g.name] || '', placeholder: g.name, 'aria-label': T.unnamedGroup, title: T.unnamedGroup });
        inp.addEventListener('change', () => { if (inp.value.trim()) S.renames[g.name] = inp.value.trim(); else delete S.renames[g.name]; render(); });
        head.append(inp);
      } else head.append(h('b', null, g.display));
      head.append(h('small', null, `${people.filter(r => !r.skip).length} 人`));
      const limit = full ? PREVIEW_LIMIT : 4;
      const cells = people.slice(0, limit).map(r => h('div', { class: 'wh-wcell ' + cellClass(r), title: cellTitle(r) || null }, r.name));
      if (people.length > limit) cells.push(h('div', { class: 'wh-wcell wh-muted' }, full ? T.moreRows(people.length - limit) : '…'));
      return h('div', { class: 'wh-wcol' }, head, ...cells);
    });
    return h('div', { class: 'wh-wide-preview' }, ...cols);
  }

  function longPreview(res) {
    const wOn = canEditWeights();
    const rows = res.rows.slice(0, PREVIEW_LIMIT).map(r => h('tr', { class: cellClass(r), title: cellTitle(r) || null },
      h('td', null, r.name || '（空白）'), h('td', null, r.group || '—'), h('td', null, r.code || '—'), wOn ? h('td', null, String(r.weight || 1)) : null, h('td', null, r.excluded ? '排除' : '')));
    const wrap = h('div', { class: 'wh-table-wrap wh-preview-scroll' }, h('table', { class: 'wh-table' },
      h('thead', null, h('tr', null, h('th', null, '姓名'), h('th', null, '群組'), h('th', null, '編號'), wOn ? h('th', null, T.weight) : null, h('th', null, T.exclude))),
      h('tbody', null, ...rows)));
    if (res.rows.length > PREVIEW_LIMIT) wrap.append(h('p', { class: 'wh-muted' }, T.moreRows(res.rows.length - PREVIEW_LIMIT)));
    return wrap;
  }

  function step3() {
    const res = compute();
    const c = res.conflicts;
    const adds = res.live.filter(r => !((r._cls.level === 1 && S.conflict !== 'both') || (r._cls.level === 2 && S.sameName === 'merge')));
    const nGroups = new Set(adds.map(r => r.group).filter(Boolean)).size;
    const willSkip = res.rows.length - res.live.length + (S.conflict === 'skip' ? c[1] : 0) + (S.sameName === 'merge' ? c[2] : 0);
    const willAdd = res.live.length - (S.conflict !== 'both' ? c[1] : 0) - (S.sameName === 'merge' ? c[2] : 0);
    const nodes = [h('p', { class: 'wh-import-sum' }, T.willAdd(Math.max(0, willAdd), nGroups, willSkip) + (S.conflict === 'overwrite' && c[1] ? ` · 覆蓋 ${c[1]}` : ''))];
    const choice = (name, cur, opts, onSet) => h('div', { class: 'wh-seg', role: 'radiogroup' }, ...opts.map(([v, l]) => h('button', { type: 'button', role: 'radio', 'aria-checked': String(cur === v), class: cur === v ? 'on' : '', onclick: () => { onSet(v); render(); } }, l)));
    if (c[1]) nodes.push(h('div', { class: 'wh-conflict' }, h('span', null, T.conflictDup(c[1])), choice('dup', S.conflict, [['skip', T.conflictSkip], ['overwrite', T.conflictOverwrite], ['both', T.conflictBoth]], (v) => { S.conflict = v; })));
    if (c[2]) nodes.push(h('div', { class: 'wh-conflict' }, h('span', null, T.conflictSameName(c[2])), choice('same', S.sameName, [['separate', T.sameSeparate], ['merge', T.sameMerge]], (v) => { S.sameName = v; })));
    if (c[3]) nodes.push(h('p', { class: 'wh-hint' }, T.conflictSimilar(c[3])));
    nodes.push(S.shape === 'wide' ? widePreview(res, true) : longPreview(res));
    nodes.push(h('div', { class: 'wh-legend' },
      h('span', { class: 'c-multi' }, T.legendMulti), h('span', { class: 'c-bad' }, T.legendBad),
      c[1] ? h('span', { class: 'c-dup' }, T.legendDup) : '', c[3] ? h('span', { class: 'c-sim' }, T.legendSimilar) : ''));
    nodes.push(footer(
      btn(T.back, 'ghost', () => { S.step = 2; render(); }),
      btn(T.doImport, 'primary', () => doImport(res), { disabled: willAdd <= 0 && !(S.conflict === 'overwrite' && c[1]) })));
    return nodes;
  }

  async function doImport(res) {
    const ev = ctx.store.official;
    const before = deepClone(ev.participants);
    const rows = res.rows.map(r => { const x = { ...r }; delete x._cls; return x; });
    const opts = { conflict: S.conflict, sameName: S.sameName, source: S.srcKind, fileName: S.srcName, shape: S.shape, keepWeight: !canEditWeights() };
    const { ok, value: out } = await tryEdit((e) => applyImport(e, rows, opts, classifyAgainst, createParticipant, addLog));
    if (!ok) return;
    if (closeFn) closeFn('done');
    const groups = new Set(rows.filter(r => !r.skip && r.group).map(r => r.group)).size;
    const { openWeightByGroup } = await import('./page-participants.js');
    toast(T.toastImported(out.added, groups), {
      undo: async () => {
        await tryEdit((e) => { e.participants = before; addLog(e, 'participant.remove', `復原匯入（移除 ${out.added} 人）`); }, { undoable: false });
        if (onDone) onDone();
      },
      actions: groups && canEditWeights() ? [{ label: T.setWeightByGroup, fn: () => openWeightByGroup(onDone) }] : [],
    });
    if (onDone) onDone();
  }

  function render() {
    const content = S.step === 1 ? step1() : S.step === 2 ? step2() : step3();
    body.replaceChildren(stepper(), ...[].concat(content).filter(Boolean));
    if (S.step !== 1) { const f = body.querySelector('.wh-import-foot .btn-primary:not([disabled])'); if (f && !body.contains(document.activeElement)) f.focus(); }
  }

  const p = dialog({ title: T.importTitle, className: 'wh-dlg-import', body, actions: [], onOpen(box, close) { closeFn = close; } });
  if (file) loadFile(file);
  else if (text) { S.tab = 'paste'; loadPaste(); }
  else render();
  return p;
}

