// 匯出（B.6）：名單長表/寬表 CSV、中獎名單 CSV、稽核 CSV、檔名
import { toCSV } from './csv.js';
import { sortedPrizes, groupOrder } from '../core/model.js';

export const EXCLUDE_LABEL = { probation: '試用期', staff: '工作人員', manager: '主管自願', 'imported-zero': '匯入籤數 0', other: '其他' };
export const VOID_LABEL = { absent: '不在場', declined: '棄權', ineligible: '不符資格', duplicate: '重複得獎', misclick: '誤觸', other: '其他' };
export const STATUS_LABEL = { pending: '待確認', confirmed: '已確認', voided: '作廢' };

function pad(n) { return String(n).padStart(2, '0'); }
export function stamp(d = new Date()) {
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}`;
}
export function safeName(s) { return String(s || '活動').replace(/[\\/:*?"<>|\s]+/g, '-').slice(0, 40); }
export function fileName(event, kind, ext) { return `wheel-${safeName(event.name)}${kind ? '-' + kind : ''}-${stamp()}.${ext}`; }

function localTime(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

/** 名單 CSV（長表）：姓名,群組,編號,籤數,排除,排除原因,標籤,備註 */
export function participantsCSV(event) {
  const rows = [['姓名', '群組', '編號', '籤數', '排除', '排除原因', '標籤', '備註']];
  for (const p of event.participants) {
    rows.push([p.name, p.group || '', p.code || '', p.weight, p.excluded ? '是' : '', p.excluded ? (EXCLUDE_LABEL[p.excludeReason] || '') : '', (p.tags || []).join('、'), p.note || '']);
  }
  return toCSV(rows);
}

/** 寬表 CSV：第 1 列群組名稱，每欄往下列名字 */
export function participantsWideCSV(event) {
  const order = [...groupOrder(event).keys()];
  const cols = order.map(g => event.participants.filter(p => p.group === g).map(p => p.name));
  const ungrouped = event.participants.filter(p => !p.group).map(p => p.name);
  if (ungrouped.length) { order.push('未分組'); cols.push(ungrouped); }
  const h = Math.max(0, ...cols.map(c => c.length));
  const rows = [order];
  for (let i = 0; i < h; i++) rows.push(cols.map(c => c[i] || ''));
  return toCSV(rows);
}

/** 中獎名單 CSV（作廢列預設不含） */
export function winnersCSV(event, { includeVoided = false } = {}) {
  const prizeName = new Map(event.prizes.map(p => [p.id, p.name]));
  const bySeq = new Map(event.draws.map(d => [d.id, d.seq]));
  const rows = [['序號', '獎項', '得獎者', '群組', '編號', '狀態', '抽出時間', '確認時間', '作廢原因', '作廢備註', '補抽序號']];
  const order = new Map(sortedPrizes(event).map((p, i) => [p.id, i]));
  const list = event.draws.filter(d => includeVoided || d.status !== 'voided')
    .sort((a, b) => (order.get(a.prizeId) - order.get(b.prizeId)) || a.seq - b.seq);
  for (const d of list) {
    rows.push([d.seq, prizeName.get(d.prizeId) || '', d.snapshot.name, d.snapshot.group || '', d.snapshot.code || '',
      STATUS_LABEL[d.status], localTime(d.drawnAt), localTime(d.confirmedAt),
      d.void ? VOID_LABEL[d.void.reason] || '' : '', d.void ? d.void.note || '' : '',
      d.void && d.void.redrawnBy ? bySeq.get(d.void.redrawnBy) || '' : (d.redrawOf ? `補抽 #${bySeq.get(d.redrawOf) || ''}` : '')]);
  }
  return toCSV(rows);
}

/** 稽核 CSV：含 audit.* */
export function auditCSV(event) {
  const prizeName = new Map(event.prizes.map(p => [p.id, p.name]));
  const rows = [['序號', '批次', '卡位', '獎項', '得獎者', '狀態', 'rngMode', 'randomHex', 'randomUnit', 'candidateCount', 'totalWeight', 'poolHash', 'seed', 'pickIndex', 'wheelMode', '抽出時間']];
  for (const d of [...event.draws].sort((a, b) => a.seq - b.seq)) {
    const a = d.audit;
    rows.push([d.seq, d.batchId, d.slot, prizeName.get(d.prizeId) || '', d.snapshot.name, STATUS_LABEL[d.status],
      a.rngMode, a.randomHex, a.randomUnit, a.candidateCount, a.totalWeight, a.poolHash, a.seed || '', a.pickIndex, a.wheelMode, d.drawnAt]);
  }
  return toCSV(rows);
}

/** 觸發瀏覽器下載（僅瀏覽器） */
export function download(name, content, mime = 'text/csv;charset=utf-8') {
  const blob = content instanceof Blob ? content : new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = name; document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 1000);
}
