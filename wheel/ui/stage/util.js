// 舞台小工具：fill(el, ...kids) 以子節點取代內容（略過 null / false；支援 dom.js 的 Raw，例如 icon()、kbd()）
import { Raw } from '../dom.js';

export function fill(el, ...kids) {
  el.replaceChildren();
  const add = (c) => {
    if (c == null || c === false) return;
    if (Array.isArray(c)) { c.forEach(add); return; }
    if (c instanceof Node) el.appendChild(c);
    else if (c instanceof Raw) el.insertAdjacentHTML('beforeend', c.s);
    else el.appendChild(document.createTextNode(String(c)));
  };
  kids.forEach(add);
  return el;
}
