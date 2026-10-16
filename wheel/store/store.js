// 應用狀態與持久化（B.4）：正式 Event 與彩排沙盒；即時寫 / 防抖 300 ms；自動備份 3 份。
import { deepClone, nowISO, createEvent as makeEvent } from '../core/model.js';
import { migrateEvent } from '../core/migrations.js';
import { createSandbox, promote, canRestoreDiscarded, sandboxDrawCount } from '../core/rehearsal.js';

export const DEBOUNCE_MS = 300;
export const BACKUP_KEEP = 3;

export class LockedError extends Error { constructor() { super('locked-elsewhere'); } }

export function createStore(db, opts = {}) {
  const lockCheck = opts.lockCheck || (() => false);
  let official = null, sandbox = null;
  const listeners = new Set();
  let timer = null, dirty = { official: false, sandbox: false };

  function emit(reason) { for (const fn of [...listeners]) { try { fn(reason); } catch (e) { console.error(e); } } }

  async function writeOfficial() { dirty.official = false; await db.putEvent(official); }
  async function writeSandbox() { dirty.sandbox = false; if (sandbox) await db.putMeta('rehearsal:' + sandbox.eventId, sandbox); }

  async function flush() {
    clearTimeout(timer); timer = null;
    if (dirty.official && official) await writeOfficial();
    if (dirty.sandbox) await writeSandbox();
  }

  const api = {
    db,
    get official() { return official; },
    get sandbox() { return sandbox; },
    get rehearsal() { return !!sandbox; },
    /** 舞台操作的對象：彩排中 = 沙盒，否則 = 正式 */
    get event() { return sandbox ? sandbox.event : official; },

    subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    emit,

    async listEvents() {
      const all = await db.getAllEvents();
      const out = [];
      for (const e of all) { try { out.push(migrateEvent(e)); } catch { /* 忽略壞資料 */ } }
      return out.sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));
    },

    async open(id) {
      if (official && official.id === id) return official;
      await flush();
      const e = await db.getEvent(id);
      official = e ? migrateEvent(e) : null;
      sandbox = official ? await db.getMeta('rehearsal:' + id) : null;
      if (sandbox) sandbox.event = migrateEvent(sandbox.event);
      emit('open');
      return official;
    },

    /** 重新從資料庫讀入（其他分頁改過、或還原之後） */
    async reload() {
      if (!official) return null;
      const id = official.id; official = null; sandbox = null;
      return api.open(id);
    },

    close() { official = null; sandbox = null; },

    /**
     * 修改並存檔。mutator(event) 直接修改。
     * opts.target: 'active'（舞台：彩排時打在沙盒）| 'official'（設定頁）
     * opts.debounce: true → 300 ms 防抖（名單、設定編輯）；否則即時寫並 await
     */
    async commit(mutator, o = {}) {
      const target = o.target || 'official';
      const toSandbox = target === 'active' && !!sandbox;
      const ev = toSandbox ? sandbox.event : official;
      if (!ev) throw new Error('no-event');
      if (!toSandbox && lockCheck(ev.id)) throw new LockedError();
      const result = await mutator(ev);
      ev.updatedAt = nowISO();
      if (toSandbox) dirty.sandbox = true; else dirty.official = true;
      if (o.debounce) {
        clearTimeout(timer);
        timer = setTimeout(() => { flush().catch(err => emit({ type: 'save-error', error: err })); }, DEBOUNCE_MS);
      } else {
        await flush();
      }
      emit(o.reason || 'commit');
      return result;
    },

    flush,

    async createEvent(fields) {
      const ev = makeEvent(fields);
      await db.putEvent(ev);
      return ev;
    },

    async putEvent(ev) {
      await db.putEvent(ev);
      if (official && official.id === ev.id) { official = migrateEvent(deepClone(ev)); emit('replace'); }
    },

    async deleteEvent(id) {
      await db.deleteEvent(id);
      await db.deleteMeta('rehearsal:' + id);
      for (const r of await db.listMeta('autoBackup:' + id + ':')) await db.deleteMeta(r.key);
      const disc = await db.getMeta('discardedRehearsal');
      if (disc && disc.eventId === id) await db.deleteMeta('discardedRehearsal');
      if (official && official.id === id) { official = null; sandbox = null; }
    },

    // ---------- 自動備份 ----------
    async autoBackup(ev = official) {
      if (!ev) return;
      const key = `autoBackup:${ev.id}:${Date.now()}`;
      await db.putMeta(key, { at: nowISO(), event: deepClone(ev) });
      const list = (await db.listMeta(`autoBackup:${ev.id}:`)).sort((a, b) => (a.key < b.key ? 1 : -1));
      for (const r of list.slice(BACKUP_KEEP)) await db.deleteMeta(r.key);
    },
    async listBackups(id) {
      return (await db.listMeta(`autoBackup:${id}:`)).sort((a, b) => (a.key < b.key ? 1 : -1)).map(r => ({ key: r.key, ...r.value }));
    },

    // ---------- 彩排 ----------
    async startRehearsal() {
      if (!official) throw new Error('no-event');
      if (sandbox) return sandbox;
      await flush();
      sandbox = createSandbox(official);
      await writeSandbox();
      emit('rehearsal');
      return sandbox;
    },

    /** 丟棄：先把沙盒存到 meta.discardedRehearsal（只留最近 1 份），再刪除 */
    async discardRehearsal() {
      if (!sandbox) return;
      clearTimeout(timer); dirty.sandbox = false;
      if (sandboxDrawCount(sandbox) > 0) await db.putMeta('discardedRehearsal', { ...sandbox, discardedAt: nowISO() });
      await db.deleteMeta('rehearsal:' + sandbox.eventId);
      sandbox = null;
      emit('rehearsal');
    },

    /** promote：自動備份正式 Event → 以沙盒取代 → 刪沙盒 */
    async promoteRehearsal(fromIndex = 0) {
      if (!sandbox || !official) throw new Error('no-sandbox');
      await flush();
      const fresh = migrateEvent(await db.getEvent(official.id));
      const next = promote(fresh, sandbox, { fromIndex });
      await api.autoBackup(fresh);
      await db.putEvent(next);
      await db.deleteMeta('rehearsal:' + sandbox.eventId);
      official = next; sandbox = null;
      emit('promote');
      return next;
    },

    async getDiscarded() { return db.getMeta('discardedRehearsal'); },

    /** 還原最近丟棄的彩排（活動列表 ⋯）；成功回傳 true */
    async restoreDiscarded(eventId) {
      const disc = await db.getMeta('discardedRehearsal');
      const off = await db.getEvent(eventId);
      const cur = await db.getMeta('rehearsal:' + eventId);
      if (!canRestoreDiscarded(off, disc, cur)) return false;
      const { discardedAt, ...sb } = disc;
      await db.putMeta('rehearsal:' + eventId, sb);
      await db.deleteMeta('discardedRehearsal');
      if (official && official.id === eventId) { sandbox = sb; sandbox.event = migrateEvent(sandbox.event); emit('rehearsal'); }
      return true;
    },
  };
  return api;
}
