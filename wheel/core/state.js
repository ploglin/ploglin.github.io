// 舞台狀態機（C.5）與輸入模型（D.5b）：純函式，UI（ui/stage/hotkeys.js）只負責把 keydown 交給這裡。

export const COOLDOWN_MS = 600;

export const PHASES = ['prize_intro', 'idle', 'armed', 'spinning', 'reveal', 'prize_done', 'all_done'];
export const OVERLAYS = [null, 'void', 'bonus', 'prize_menu', 'quick_list', 'recent', 'confirm_live', 'rehearsal_exit', 'help', 'batch_recall', 'ask_absent', 'resume_rehearsal', 'exit_stage', 'stage_settings'];

/** 允許的 phase 轉換（C.5 狀態圖） */
export const TRANSITIONS = {
  prize_intro: ['idle', 'prize_intro', 'all_done'],
  idle: ['armed', 'spinning', 'idle', 'prize_intro', 'prize_done', 'all_done'],
  armed: ['spinning', 'idle', 'prize_intro'],
  spinning: ['reveal'],
  reveal: ['reveal', 'idle', 'prize_done', 'all_done'],
  prize_done: ['idle', 'prize_intro', 'all_done'],
  all_done: ['prize_intro', 'idle'],
};

export function canTransition(from, to) { return !!(TRANSITIONS[from] && TRANSITIONS[from].includes(to)); }

/** 確認後的下一個 phase */
export function phaseAfterConfirm(remaining, hasNextPrize) {
  if (remaining > 0) return 'idle';
  return hasNextPrize ? 'prize_done' : 'all_done';
}

/** 正式 ↔ 彩排切換條件（C.5 末段、C.8 限制） */
export function canToggleRehearsal(phase, hasPending) {
  return ['idle', 'prize_done', 'all_done', 'prize_intro'].includes(phase) && !hasPending;
}

const LETTER = (ev) => (ev.key && ev.key.length === 1 ? ev.key.toLowerCase() : '');

function isSpace(ev) { return ev.code === 'Space' || ev.key === ' ' || ev.key === 'Spacebar'; }
function isArrow(ev) { return ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(ev.key); }

/**
 * 把一次 keydown 解析成舞台動作。
 * ctx: { phase, overlay, cardSelect, clickerMode, rehearsal, revealDone, hasLastConfirmed,
 *        fullscreen, now, phaseAt, hotkeys }
 * ev:  { key, code, shiftKey, ctrlKey, metaKey, altKey, repeat, inInput }
 * 回傳 { action: string|null, arg?, prevent: boolean }
 */
export function resolveKey(ctx, ev) {
  const none = { action: null, prevent: false };
  const eat = { action: null, prevent: true };
  const act = (action, arg) => ({ action, arg, prevent: true });
  const phase = ctx.phase;
  const letter = LETTER(ev);
  const hotkeys = ctx.hotkeys !== false;

  // 焦點在輸入框：不攔（只有 Esc 讓浮層可關）
  if (ev.inInput) {
    if (ev.key === 'Escape' && ctx.overlay) return act('overlay.close');
    return none;
  }
  // 修飾鍵組合：Ctrl+Z 攔下無作用；其他交還瀏覽器
  if (ev.ctrlKey || ev.metaKey || ev.altKey) {
    if (letter === 'z') return eat;
    return none;
  }

  let space = isSpace(ev);
  // 簡報筆模式
  if (ctx.clickerMode) {
    if (ev.key === 'PageDown') space = true;
    if (ev.key === 'PageUp' || ev.key === 'F5' || ev.key === '.') return eat;
  }
  // 按住不放的重複事件一律忽略（仍攔下以免捲動）
  if (ev.repeat) return (space || ev.key === 'Enter' || isArrow(ev)) ? eat : none;

  // ← → PageUp 永遠不切獎項
  if (!space && (ev.key === 'PageUp' || ev.key === 'PageDown')) return eat;

  // 全域鍵（任何狀態）
  if (hotkeys && !ctx.overlay) {
    if (letter === 'h') return act('toggleControls');
    if (letter === 'f') return act('fullscreen');
    if (letter === 'm') return act('mute');
    if (ev.key === '?') return act('help');
  }

  // 浮層：只有 Esc、數字鍵（作廢條）、上下 Enter（選單/抽屜）、N（備註）有效
  if (ctx.overlay) {
    if (ev.key === 'Escape') return act('overlay.close');
    if (ctx.overlay === 'batch_recall') {
      if (isArrow(ev)) return act('card.move', ev.key);
      if (space) return act('card.toggle');
      if (ev.key === 'Enter') return act('card.void');
      return eat;
    }
    if (ctx.overlay === 'void') {
      if (/^[1-6]$/.test(ev.key)) return act('void.reason', Number(ev.key));
      if (letter === 'n') return act('void.note');
      if (ev.key === 'Enter') return act('void.submit');
      return space ? eat : none;
    }
    if (ev.key === 'ArrowUp' || ev.key === 'ArrowDown') return act('overlay.move', ev.key === 'ArrowUp' ? -1 : 1);
    if (ev.key === 'Enter') return act('overlay.enter');
    if (/^[1-6]$/.test(ev.key)) return act('overlay.digit', Number(ev.key));
    return space ? eat : none;
  }

  // 選卡模式（揭曉中按 V）
  if (ctx.cardSelect) {
    if (isArrow(ev)) return act('card.move', ev.key);
    if (space) return act('card.toggle');
    if (ev.key === 'Enter') return act('card.void');
    if (ev.key === 'Escape') return act('card.exit');
    return eat;
  }

  const cooling = ctx.now - (ctx.phaseAt || 0) < COOLDOWN_MS;

  if (space) {
    if (cooling) return eat;
    if (phase === 'idle' || phase === 'armed') return act('spin');
    if (phase === 'reveal') return ctx.revealDone ? eat : act('advance');
    if (phase === 'prize_done') return act('next');
    return eat;
  }
  if (ev.key === 'Enter') {
    if (cooling) return eat;
    if (phase === 'reveal' && ctx.revealDone) return act('confirm');
    return eat;
  }
  if (ev.key === 'Escape') {
    if (phase === 'armed' && !ctx.fullscreen) return act('disarm');
    return none;
  }
  if (isArrow(ev)) return eat;
  if (!hotkeys) return none;

  if (letter === 'v') {
    if (phase === 'reveal') return act('void.select');
    if (['idle', 'prize_done', 'all_done', 'prize_intro'].includes(phase) && ctx.hasLastConfirmed) return act('void.last');
    return eat;
  }
  if (letter === 'r') return ['idle', 'prize_done', 'all_done'].includes(phase) ? act('recent') : eat;
  if (letter === 'p') {
    if (phase === 'armed') return act('prizeMenu', 'disarm');
    return ['idle', 'prize_done', 'all_done'].includes(phase) ? act('prizeMenu') : eat;
  }
  if (letter === 'b') {
    if (ctx.clickerMode && !ev.shiftKey) return eat;   // 簡報筆的 b（黑畫面）不觸發加碼
    return ['idle', 'prize_done', 'all_done'].includes(phase) ? act('bonus') : eat;
  }
  if (letter === 'l') return ['idle', 'prize_done'].includes(phase) ? act('quickList') : eat;
  if (letter === 's') return (ctx.rehearsal && phase === 'spinning') ? act('skip') : eat;
  return none;
}

/** 觀眾視窗轉送白名單（F.2 使用；MVP 先定義） */
export const FORWARD_KEYS = new Set([' ', 'Enter', 'Escape', 'PageDown', 'v', 'V', 'r', 'R', 'p', 'P', 'b', 'B', 'l', 'L', 'h', 'H', '1', '2', '3', '4', '5', '6', 'n', 'N', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 's', 'S', 'm', 'M']);
