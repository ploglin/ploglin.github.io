// 一次抽多名的唯一分級表（C.4）
export const GRID_PER_PAGE = 24;

/**
 * n → { style, namePx, flip: 'none'|'manual'|'auto', pages, perPage, wheel: bool }
 * revealFlip: 'byCount'（≤6 手動、7–12 自動）| 'manual' | 'auto'
 */
export function revealStyle(n, revealFlip = 'byCount') {
  if (n <= 1) return { style: 'single', namePx: 120, flip: 'none', pages: 1, perPage: 1, wheel: true };
  if (n <= 3) return { style: 'chain', namePx: 96, flip: 'none', pages: 1, perPage: n, wheel: true };
  if (n <= 12) {
    const byCount = n <= 6 ? 'manual' : 'auto';
    const flip = revealFlip === 'manual' || revealFlip === 'auto' ? revealFlip : byCount;
    return { style: 'wall', namePx: n <= 6 ? 96 : 64, flip, pages: 1, perPage: n, wheel: false };
  }
  return { style: 'grid', namePx: 40, flip: 'none', pages: Math.ceil(n / GRID_PER_PAGE), perPage: GRID_PER_PAGE, wheel: false };
}

export const AUTO_FLIP_MS = 1200;
export const CHAIN_DURATION_RATIO = 0.6;
export const CHAIN_HOLD_MS = 1500;
export const STOP_HOLD_MS = 1200;
export const SHUFFLE_MS = 2000;
export const PRIZE_INTRO_MS = 1500;

/** 揭曉是否已完成（可按 Enter） */
export function revealComplete(rs, reveal, freshCount) {
  if (!reveal) return false;
  if (rs.style === 'wall') return reveal.flipped >= freshCount;
  if (rs.style === 'grid') return reveal.page >= rs.pages - 1;
  return true;
}

/** 設定頁 / 獎項頁旁註 */
export function styleHint(n) {
  if (n <= 1) return '單抽：轉盤一次';
  if (n <= 3) return '連轉：每人各轉一次';
  if (n <= 6) return '揭曉牆：手動翻牌';
  if (n <= 12) return '揭曉牆：自動翻牌';
  return '格陣：一次揭曉';
}
