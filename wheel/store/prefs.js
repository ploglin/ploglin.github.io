// 全域偏好（localStorage `wheel_prefs`）
const KEY = 'wheel_prefs';
const DEF = { prefsVersion: 1, theme: 'system', soundUnlocked: false, dismissedTips: [] };

export function loadPrefs() {
  try { return { ...DEF, ...(JSON.parse(localStorage.getItem(KEY) || '{}')) }; } catch { return { ...DEF }; }
}
export function savePrefs(p) {
  try { localStorage.setItem(KEY, JSON.stringify(p)); } catch { /* 私密視窗 */ }
}
export function updatePrefs(patch) { const p = { ...loadPrefs(), ...patch }; savePrefs(p); return p; }
export function tipDismissed(id) { return loadPrefs().dismissedTips.includes(id); }
export function dismissTip(id) { const p = loadPrefs(); if (!p.dismissedTips.includes(id)) { p.dismissedTips.push(id); savePrefs(p); } }
