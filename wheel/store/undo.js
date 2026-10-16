// 設定模式復原（C.6 復原政策）：Ctrl+Z / Ctrl+Shift+Z 多步（30 步、記憶體）；批次操作 toast 復原
import { deepClone } from '../core/model.js';

export function createUndo(limit = 30) {
  let past = [], future = [];
  return {
    /** 修改前呼叫：存一份快照（只存 participants / prizes / settings，帳本不走 undo） */
    push(event) {
      past.push(snap(event));
      if (past.length > limit) past.shift();
      future = [];
    },
    canUndo() { return past.length > 0; },
    canRedo() { return future.length > 0; },
    undo(event) { if (!past.length) return false; future.push(snap(event)); apply(event, past.pop()); return true; },
    redo(event) { if (!future.length) return false; past.push(snap(event)); apply(event, future.pop()); return true; },
    clear() { past = []; future = []; },
    get size() { return past.length; },
  };
}

function snap(e) { return { participants: deepClone(e.participants), prizes: deepClone(e.prizes), settings: deepClone(e.settings), name: e.name, date: e.date }; }
function apply(e, s) {
  e.participants = s.participants; e.prizes = s.prizes; e.settings = s.settings; e.name = s.name;
  if (s.date) e.date = s.date; else delete e.date;
}
