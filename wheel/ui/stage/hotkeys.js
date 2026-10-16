// 舞台鍵盤接線（D.5b）：document capture 階段攔 keydown，交給 core/state.resolveKey 判斷；
// 焦點在 input / textarea / select 時不攔。另在 keyup 攔下 Space / Enter，避免焦點所在的按鈕被瀏覽器再「點」一次。
import { inInput } from '../dom.js';

export function keyLike(e) {
  return {
    key: e.key, code: e.code, shiftKey: !!e.shiftKey, ctrlKey: !!e.ctrlKey, metaKey: !!e.metaKey, altKey: !!e.altKey,
    repeat: !!e.repeat, inInput: inInput(e.target),
  };
}

/** handler(k, e)：k = keyLike(e)。回傳解除函式 */
export function attachKeys(target, handler) {
  const down = (e) => {
    if (e.isComposing || e.keyCode === 229) return;      // 中文輸入法組字中
    if (e.key === 'Tab') return;                          // 交給瀏覽器與浮層 focus trap
    handler(keyLike(e), e);
  };
  const up = (e) => {
    if (inInput(e.target)) return;
    if (e.key === ' ' || e.code === 'Space' || e.key === 'Enter') e.preventDefault();
  };
  target.addEventListener('keydown', down, true);
  target.addEventListener('keyup', up, true);
  return () => { target.removeEventListener('keydown', down, true); target.removeEventListener('keyup', up, true); };
}
