// 底部作廢條（D.7）：取代對話框。鏡像版不列原因（只在條尾顯示圈數字小代號）、條尾是「確定」「取消」兩顆按鈕（不寫鍵位）；
// 延伸版列出 1–6 原因，條尾保留鍵位文字。
import { h } from '../dom.js';
import { voidBarModel, t } from './logic.js';
import { fill } from './util.js';

/**
 * bar：容器元素；d：{ ids, confirmed, reason, note, noteOpen }
 * opts：{ mirror, names, absentRule, onReason(n), onSubmit(), onCancel(), onNoteInput(v) }
 */
export function renderVoidBar(bar, d, opts) {
  if (!d) { bar.hidden = true; bar.replaceChildren(); bar._key = ''; return; }
  const m = voidBarModel({ mirror: opts.mirror, confirmed: d.confirmed, names: opts.names, reason: d.reason, absentRule: opts.absentRule });
  const key = JSON.stringify([m, d.noteOpen]);
  bar.hidden = false;
  if (bar._key === key) return;
  bar._key = key;
  const parts = [h('span', { class: 'ws-vb-title' }, m.title)];
  if (m.reasons) {
    parts.push(h('span', { class: 'ws-vb-reasons' }, m.reasons.map(r => h('button', {
      type: 'button', class: 'ws-vb-reason' + (r.selected ? ' is-sel' : ''), 'aria-pressed': r.selected ? 'true' : 'false',
      onclick: () => opts.onReason(r.n),
    }, h('span', { class: 'ws-vb-n' }, String(r.n)), ' ', r.label))));
    if (m.rule) parts.push(h('span', { class: 'ws-vb-rule' }, m.rule));
  } else {
    parts.push(h('span', { class: 'ws-vb-hint' }, m.hint, h('span', { class: 'ws-vb-mark' }, m.mark)));
  }
  if (d.noteOpen) {
    const inp = h('input', { type: 'text', class: 'ws-vb-note', maxlength: '200', placeholder: t('void.notePlaceholder'), value: d.note || '' });
    inp.addEventListener('input', () => opts.onNoteInput(inp.value));
    inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); opts.onSubmit(); } });
    parts.push(inp);
  }
  if (!m.tail) {
    // 鏡像（投影）版：兩顆按鈕，鍵位只放 title
    parts.push(h('span', { class: 'ws-vb-tail ws-vb-btns' },
      h('button', { type: 'button', class: 'ws-vb-act ws-vb-btn is-primary', title: `${m.submit}（Enter）`, 'aria-keyshortcuts': 'Enter', onclick: () => opts.onSubmit() }, m.submit),
      h('button', { type: 'button', class: 'ws-vb-act ws-vb-btn', title: `${m.cancel}（Esc）`, 'aria-keyshortcuts': 'Escape', onclick: () => opts.onCancel() }, m.cancel)));
    fill(bar, ...parts);
    return;
  }
  const [enterTxt, escTxt] = splitTail(m.tail);
  parts.push(h('span', { class: 'ws-vb-tail' },
    enterTxt.pre ? h('span', {}, enterTxt.pre) : null,
    h('button', { type: 'button', class: 'ws-vb-act', onclick: () => opts.onSubmit() }, enterTxt.act),
    h('span', {}, ' · '),
    h('button', { type: 'button', class: 'ws-vb-act', onclick: () => opts.onCancel() }, escTxt)));
  fill(bar, ...parts);
}

/** 「N 備註 · Enter 確定 · Esc 取消」→ 前段文字 + 可點的「Enter 確定」「Esc 取消」 */
function splitTail(tail) {
  const segs = tail.split(' · ');
  const esc = segs.pop();
  const act = segs.pop();
  return [{ pre: segs.length ? segs.join(' · ') + ' · ' : '', act }, esc];
}

export function focusVoidBar(bar) {
  const inp = bar.querySelector('.ws-vb-note');
  if (inp) { inp.focus(); return; }
  const b = bar.querySelector('.ws-vb-act');
  if (b) b.focus({ preventScroll: true });
}
