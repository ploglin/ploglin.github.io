# core / store / io 公開 API（開發文件，不對外發佈）

全部是原生 ES modules，瀏覽器與 Node 測試共用。除非註明，函式都**直接修改**傳入的 `event`；UI 應透過 `store.commit(fn, {target})` 呼叫，讓修改落地。

> 注意：`ui/dom.js`、`ui/toast.js`、`ui/router.js`、`ui/stage/sync.js` 是 core agent 在分工前先寫的草稿，現歸 UI agent 所有，可保留、修改或改寫。`ui/stage/sync.js` 的 `createTabSync().heldElsewhere(eventId)` 正好可以當 `createStore(db, { lockCheck })` 的 lockCheck。

## core/model.js
- `SCHEMA_VERSION` = 1
- `PALETTE: string[8]`（扇區 8 色）、`STAGE_INK = '#0b1020'`
- `VOID_REASONS = ['absent','declined','ineligible','duplicate','misclick','other']`（數字鍵 1–6 的順序）
- `EXCLUDE_REASONS = ['probation','staff','manager','imported-zero','other']`
- `uuid()`、`nowISO()`、`clamp(v,lo,hi)`、`clampWeight(w)`（整數 1–1000）、`deepClone(o)`
- `SCENARIOS`：`{banquet|stream|classroom|host|custom: {label, allowRepeat, autoConfirm, projection, arm, flip, sound, confetti, spin}}`
- `defaultSettings(scenario)` → EventSettings（`revealFlip` 為 `'byCount'|'manual'|'auto'`）
- `defaultStage()` → StageState
- `createEvent({name, date, scenario, absentKeepsEligibility})` → Event（不存檔；要存用 `store.createEvent`）
- `createParticipant(fields)`、`createPrize(fields, order)`
- `PRIZE_TEMPLATE`：6 項範本（普獎/四/三/二/一/頭獎）
- `hostPrizes(withRecorder)`：「抽主持人」建立活動時的名額（勾記錄人 → 記錄人、主持人；否則只有主持人；各名額 1/每次 1，主持人排最後）。只由建立活動對話框呼叫
- `addLog(event, type, summary, payload?, inStage?)`
- `sortedPrizes(event)`、`renumberPrizes(event)`、`prizeById(event,id)`、`participantById(event,id)`
- `prizeAllowRepeat(event, prize)` → bool（獎項覆寫或活動規則）
- `drawsOfPrize(event, prizeId)`
- `prizeCounts(event, prize)` → `{confirmed, pending, voided, remaining}`（remaining = quantity − confirmed − pending；觀眾「還有 N 名」、主持「已抽 confirmed / quantity」）
- `unredrawnVoids(event, prizeId)` → 作廢但尚未補抽的紀錄（主按鈕「補抽 N 名」來源）
- `recomputePrizeStatuses(event)`
- `groupOrder(event)` → `Map(group → 序)`（第一次出現順序 = 寬表欄序）；`groupColorIndex(event, group, cache?)` → 0–7 或 −1
- `sameNameSet(event)`、`displayName(event, participantOrSnapshot, dupSet?)`（同名加註「（群組）」）
- `isBigPrize(event, prizeId)`（最後 armBigPrizes 個）
- `hasOfficialDraws(event)`、`eventSummary(event)` → `{people, prizes, quota, done}`

## core/rng.js
- `createCsprng()` / `await createSeededRng(seed, drawSeq)` → `{mode, next() → {unit, hex}}`
- `await rngFor(settings, drawSeq)`、`await sha256Hex(str)`
- `randomUnit()`、`randomInt(lo,hi)`（非稽核用途，仍走 csprng）、`newSeed()`

## core/pool.js
- `eligible(participant, eligibility)` → bool
- `buildPool(event, prize, excludeIds?)` → `[{id, weight}]`（依 id 排序）
- `buildPoolDetailed(event, prize, excludeIds?)` → `{pool, stats: {excluded, ineligible, winners, pending, absent, samePrize}}`（C.7-2 候選 0 的原因統計）
- `candidateCount(event, prize)`、`totalWeight(pool)`、`await poolHash(pool)`

## core/draw.js
- `pickOne(pool, unit)` → index
- `planNextDraw(event, prizeId)` → `{kind: 'redraw'|'fresh'|'none', n, redrawOf: DrawRecord[]}`（補抽優先）
- `await performDraw(event, prizeId, {wheelMode, rehearsal})` → `{batchId, records, pools, shortfall, kind}`（全部寫 pending；正式時 draft→live）
- `batchRecords(event, batchId)`
- `revealCards(event, batchId)` → `{cards: [{slot, record, fresh}], baseSize}`（補抽沿用原批版面、填回原 slot）
- `confirmBatch(event, batchId, now?)`、`voidDraws(event, ids, {reason, note})`
- `editVoid(event, id, {reason, note})`（寫 `draw.void.edit`）
- `canRestore(event, id)` → `{ok, why}`、`restoreVoid(event, id)`
- `addBonus(event, prizeId, delta, reason, byStage)`、`canRevertBonus(event, prizeId, index)`、`revertBonus(event, prizeId, index)`
- `addBonusPrize(event, fields, when: 'now'|'after'|'last', currentPrizeId, byStage)` → Prize
- `closeRemaining(event, prizeId)`（無任何抽獎的獎項改 `skipped`）
- `nextPrize(event, afterId)`、`firstOpenPrize(event)`

## core/sectors.js（轉盤幾何）
- 常數 `INFO_H=110`、`BUTTON_H=88`、`SIDEBAR_W=360`、`MIN_TEXT_ARC=20`、`TEXT_R=0.66`
- `wheelDiameter({width, height, projection, sidebar})` → Dpx
- `decideWheel(pool, settings, diameter, totalParticipants?)` → `{mode, sectorBy, fontPx, note: 'equal-auto'|'sampled-auto'|'forced-reel'|null}`
- `buildSectors(pool, resultId, event, decision, rnd?)` → `{sectors: WheelSector[], targetIndex, skip}`（skip = 只有 1 人）
- `landingAngle(sector, diameter)`、`easingPow(sectorDeg, totalDeg, durationSec)`、`rotationAt(t, totalDeg, durationSec, p)`
- `planSpin(sectors, targetIndex, diameter, durationMs)` → `{targetAngleDeg, easingPow, durationMs, landDeg}`（指針在 12 點鐘，扇區角度順時針）
- `sectorAtPointer(sectors, rotationDeg)`、`boundariesCrossedInLast(...)`、`textArcPx(D, deg)`、`autoMode(count, th)`

## core/reveal-style.js
- `revealStyle(n, revealFlip)` → `{style: 'single'|'chain'|'wall'|'grid', namePx, flip: 'none'|'manual'|'auto', pages, perPage, wheel}`
- `revealComplete(rs, reveal, freshCount)`、`styleHint(n)`（獎項頁旁註）
- 常數 `GRID_PER_PAGE=24`、`AUTO_FLIP_MS=1200`、`CHAIN_DURATION_RATIO=0.6`、`CHAIN_HOLD_MS=1500`、`STOP_HOLD_MS=1200`、`SHUFFLE_MS=2000`、`PRIZE_INTRO_MS=1500`

## core/state.js（輸入模型與狀態機）
- `COOLDOWN_MS = 600`、`PHASES`、`OVERLAYS`（含 v1.3 新增 `'batch_recall'` 以及 UI 用的 `'ask_absent'|'resume_rehearsal'|'exit_stage'|'stage_settings'`）
- `TRANSITIONS`、`canTransition(from, to)`、`phaseAfterConfirm(remaining, hasNextPrize)`、`canToggleRehearsal(phase, hasPending)`
- `resolveKey(ctx, ev)` → `{action, arg?, prevent}`
  - ctx：`{phase, overlay, cardSelect: bool, clickerMode, rehearsal, revealDone, hasLastConfirmed, fullscreen, now, phaseAt, hotkeys}`
  - ev：`{key, code, shiftKey, ctrlKey, metaKey, altKey, repeat, inInput}`
  - action：`spin`（idle/armed，由 `idleAction` 決定預備或開轉）、`advance`、`confirm`、`next`、`disarm`、`void.select`、`void.last`、`recent`、`prizeMenu`（arg `'disarm'` 表示先取消預備）、`bonus`、`quickList`、`skip`、`toggleControls`、`fullscreen`、`mute`、`help`、`card.move`（arg = 方向鍵名）、`card.toggle`、`card.void`、`card.exit`、`void.reason`（arg 1–6）、`void.note`、`void.submit`、`overlay.close`、`overlay.move`（arg ±1）、`overlay.enter`、`overlay.digit`
  - 規則：repeat 忽略；600 ms 冷卻（Space/Enter）；clickerMode 下 PageDown=Space、PageUp/F5/./Shift+F5 攔下、單按 B 無作用；`Shift+B` 任何模式皆為加碼；浮層開著只認 Esc/數字/上下/Enter/N
- `FORWARD_KEYS`（觀眾視窗轉送白名單，F.2）

## core/stage-ops.js（舞台流程，UI 負責動畫與計時）
- `enterStage(ev)` → `{recover: 'spin'|'reveal'|null}`（重新整理復原；決定目前獎項與 phase）
- `startPrizeIntro(ev, prizeId)`、`introDone(ev)`（1.5 s 後呼叫）
- `idleAction(ev)` → `{kind: 'spin'|'redraw'|'arm'|'empty'|'none', prize, plan}`（主按鈕文案來源：開轉 / 補抽 N 名 / 預備）
- `arm(ev)`、`disarm(ev)`
- `await beginSpin(ev, {diameter, rehearsal, now, reducedMotion})` → `{batchId, records, style, spins, shortfall}`；寫入 `ev.stage.spin = {startedAt, durationMs, targetAngleDeg, easingPow, sectors, chain: spins[], index}`；每個 spin：`{targetAngleDeg, easingPow, durationMs, sectors, targetIndex, mode, sectorBy, fontPx, note, participantId, slot}` 或 `{skip: true, participantId, slot}`。**呼叫端 await commit 落地後才開始動畫**
- `finishSpin(ev)`（動畫結束 + 1.2 s → reveal）
- `currentRevealStyle(ev)`、`freshCount(ev)`、`isRevealDone(ev)`、`advanceReveal(ev)`
- `confirmReveal(ev, now?)` → `{prizeId, confirmed, phase}`
- `voidInReveal(ev, ids, reason, note)`（揭曉中；整批都作廢 → idle）
- `lastConfirmedRecords(ev)`（V 鍵對象；長度 > 1 時 UI 開 `batch_recall` 浮層叫回卡片）
- `voidConfirmed(ev, ids, reason, note)` → `{voided, switchTo}`（switchTo 有值 → UI 播換獎過場後 `introDone`）
- `goNextPrize(ev)`（prize_done 的 Space）
- `applyBonus(ev, 'quota', {prizeId, delta, reason})` / `applyBonus(ev, 'prize', {fields, when})` → `{intro, label}`
- `stageExclude(ev, pid, reason)`、`stageRestore(ev, pid)`、`stageAdd(ev, name, group)`（名單快速操作，寫 log inStage）
- `remainingFor(ev, prizeId)`

## core/rehearsal.js
- `createSandbox(event)` → `{eventId, startedAt, baseUpdatedAt, baseDrawCount, event}`
- `sandboxDraws(sb)`（只算彩排期間新增，依 seq）、`sandboxDrawCount(sb)`、`sandboxHasPending(sb)`
- `officialChanged(official, sb)`、`canRestoreDiscarded(official, discarded, currentSandbox)`
- `sandboxDiff(official, sb)` → `{draws, bonus, roster}`
- `promote(official, sb, {fromIndex})` → 新 Event（不改輸入；fromIndex 之前的以 misclick 作廢後轉入）

## core/migrations.js、core/dedupe.js
- `migrateEvent(e)`（版本過新拋 `TooNewError`）、`normalizeEvent(e)`、`migrations`
- `normalize(s)`、`dedupeKey(p)`、`oneCharDiff(a,b)`、`classifyAgainst(existing, rows)` → `[{level 0–3, matchId, sameCodeDiffName}]`、`findDuplicates(list)` → `[{level, ids}]`

## store/db.js
- `await openDB()` → IDB 實作，失敗時記憶體實作（`db.degraded = true`、`db.error`）
- `openIDB()`、`createMemoryDB()`；介面：`getAllEvents, getEvent, putEvent, deleteEvent, getMeta, putMeta, deleteMeta, listMeta(prefix)`

## store/store.js
- `createStore(db, {lockCheck?: (eventId) => bool})` → store
  - `store.official` / `store.sandbox` / `store.rehearsal` / `store.event`（彩排中 = 沙盒 event）
  - `subscribe(fn) → unsubscribe`（fn(reason)；reason 可能是 `{type:'save-error', error}`）
  - `await listEvents()`（依 updatedAt 新→舊）、`await open(id)`、`await reload()`、`close()`
  - `await commit(mutator, {target: 'official'|'active', debounce?, reason?})`：設定頁用 `'official'`（預設），舞台用 `'active'`；即時寫會 await；被他分頁鎖住時拋 `LockedError`
  - `await flush()`、`await createEvent(fields)`、`await putEvent(ev)`、`await deleteEvent(id)`
  - `await autoBackup(ev?)`（保留 3 份）、`await listBackups(id)` → `[{key, at, event}]`
  - `await startRehearsal()`、`await discardRehearsal()`（有 draw 時先存 `meta.discardedRehearsal`）、`await promoteRehearsal(fromIndex)`、`await getDiscarded()`、`await restoreDiscarded(eventId)` → bool
- `LockedError`、`DEBOUNCE_MS = 300`、`BACKUP_KEEP = 3`

## store/backup.js、store/prefs.js、store/undo.js
- `makeBackup(event)`、`backupText(event)`、`parseBackup(text)` → `{event, exportedAt}`（`bad-format` / `TooNewError`）、`await detectConflict(db, event)`、`asCopy(event)`、`duplicateEvent(event, {rosterOnly})`、`relTime(iso)`
- `loadPrefs()`、`savePrefs(p)`、`updatePrefs(patch)`、`tipDismissed(id)`、`dismissTip(id)`
- `createUndo(limit=30)` → `{push(event), undo(event), redo(event), canUndo, canRedo, clear}`（快照 participants/prizes/settings/name/date）

## io/
- `csv.js`：`parseDelimited(text, delim)`、`sniffDelimiter`、`parseCSV(text)`、`decodeBytes(bytes)` → `{text, encoding}`、`parsePaste(text)` → grid、`csvCell`、`toCSV(rows, {bom})`
- `clean.js`：`cleanCell`、`splitMulti`、`isMulti`、`notName`、`looksLikeName`、`cleanGrid(raw)` → `{grid, trimmedRows, trimmedCols}`、`trimTrailing(raw)`
- `shape.js`：`FIELD_SYNONYMS`、`synonymField(h)`、`scoreLong`、`scoreWide`、`detectShape(grid)` → `{shape, long, wide, uncertain}`
- `mapping.js`：`wideToRows(grid, opts)`、`autoMap(grid)` → `{mapping, hasHeader}`、`longToRows(grid, mapping, hasHeader, opts)`、`gridToRows(grid, shape, opts)` → `{rows, groups, skipped, shape, mapping?, hasHeader?}`；row = `{name, group, code, weight, excluded, excludeReason, flags: {multi, notName, emptyName, badWeight, zero}, skip}`；`applyImport(event, rows, {conflict, sameName, source, fileName, shape}, classifyAgainst, createParticipant, addLog)` → `{added, skipped, overwritten, ids}`
  - 建議管線：`trimTrailing(raw)` → `cleanGrid()` → `detectShape()` → `gridToRows()` → `classifyAgainst()`（衝突數 > 0 才顯示選項）→ `applyImport()`
- `xlsx.js`：`SHEETJS_URL`（cdnjs xlsx 0.18.5）、`loadSheetJS()`、`await readWorkbook(arrayBuffer)` → `{sheetNames, read(name) → {grid, ref, rawRows}}`（失敗 `xlsx-offline` / `xlsx-timeout` → 提示另存 CSV）
- `export.js`：`EXCLUDE_LABEL`、`VOID_LABEL`、`STATUS_LABEL`、`participantsCSV`、`participantsWideCSV`、`winnersCSV(event, {includeVoided})`、`auditCSV`、`fileName(event, kind, ext)`、`stamp()`、`download(name, content, mime)`
