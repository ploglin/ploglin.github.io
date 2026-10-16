// 應用共用狀態（設定模式與舞台共用同一個 store 實例）。
// app.js 啟動時填入；其他模組 import { ctx } 取用。舞台模組也可以直接用 ctx.store / ctx.tabs。
import { LockedError } from '../store/store.js';
import { deepClone } from '../core/model.js';
import { toast } from './toast.js';
import { T } from './i18n.js';

export const ctx = {
  db: null,          // store/db.js 實作（db.degraded = true 表示記憶體模式）
  store: null,       // store/store.js createStore()
  tabs: null,        // ui/stage/sync.js createTabSync()
  undo: null,        // store/undo.js createUndo()（設定模式 Ctrl+Z）
  undoEventId: null,
  route: null,
};

export function isLocked(id) {
  const s = ctx.store && ctx.store.official;
  const eid = id || (s && s.id);
  return !!(eid && ctx.tabs && ctx.tabs.heldElsewhere(eid));
}

function ensureUndo(ev) {
  if (ctx.undoEventId !== ev.id) { ctx.undo.clear(); ctx.undoEventId = ev.id; }
}

/**
 * 設定模式的修改入口：存 undo 快照 → commit 到正式 Event。
 * opts: { debounce, undoable = true, reason }
 * 被他分頁鎖住時顯示提示並回傳 undefined。
 */
export async function edit(mutator, opts = {}) {
  return (await tryEdit(mutator, opts)).value;
}

/** 同 edit，但回傳 { ok, value } 讓呼叫端知道是否成功 */
export async function tryEdit(mutator, opts = {}) {
  const ev = ctx.store.official;
  if (!ev) return { ok: false };
  if (isLocked(ev.id)) { toast(T.lockedElsewhere, { kind: 'error' }); return { ok: false }; }
  ensureUndo(ev);
  if (opts.undoable !== false) ctx.undo.push(ev);
  try {
    const r = await ctx.store.commit(mutator, { target: 'official', debounce: !!opts.debounce, reason: opts.reason || 'edit' });
    if (ctx.tabs) ctx.tabs.changed(ev.id);
    return { ok: true, value: r };
  } catch (e) {
    if (e instanceof LockedError) { toast(T.lockedElsewhere, { kind: 'error' }); return { ok: false }; }
    console.error(e);
    toast(T.saveError, { kind: 'error' });
    return { ok: false };
  }
}

/**
 * 批次／破壞性操作：先存目前名單（或指定欄位）快照，完成後 toast 6 s 附「復原」。
 * keys：要能復原的欄位，例如 ['participants'] 或 ['prizes']。
 */
export async function editWithUndoToast(mutator, message, keys = ['participants'], extra = {}) {
  const ev = ctx.store.official;
  if (!ev) return undefined;
  const before = {};
  for (const k of keys) before[k] = deepClone(ev[k]);
  const { ok, value: res } = await tryEdit(mutator, extra);
  if (!ok) return undefined;
  const msg = typeof message === 'function' ? message(res) : message;
  if (msg) {
    toast(msg, {
      undo: async () => {
        await edit((e) => { for (const k of keys) e[k] = before[k]; }, { undoable: false, reason: 'undo' });
        if (extra.onUndo) extra.onUndo();
      },
      actions: extra.actions || [],
    });
  }
  return res;
}

/** Ctrl+Z / Ctrl+Shift+Z（設定模式；焦點在輸入框時交給原生） */
export async function undoRedo(redo = false) {
  const ev = ctx.store.official;
  if (!ev || !ctx.undo) return false;
  ensureUndo(ev);
  if (redo ? !ctx.undo.canRedo() : !ctx.undo.canUndo()) return false;
  if (isLocked(ev.id)) { toast(T.lockedElsewhere, { kind: 'error' }); return false; }
  await ctx.store.commit((e) => { if (redo) ctx.undo.redo(e); else ctx.undo.undo(e); }, { target: 'official', reason: 'undo' });
  return true;
}
