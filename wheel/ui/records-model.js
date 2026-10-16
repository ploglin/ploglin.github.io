// 紀錄頁的純資料（不碰 DOM，Node 測試可直接 import）：表格欄位順序、手機卡片第二行。

/** 紀錄表欄位（依獎項檢視不含「獎項」欄）；colspan 與「手機隱藏編號欄」都依這裡，不寫死欄號 */
export function recordColumns(showPrize) {
  return ['seq', ...(showPrize ? ['prize'] : []), 'winner', 'group', 'code', 'time', 'status', 'act'];
}

/**
 * 手機卡片第二行：獎項（只在依時間檢視）· 群組 · 編號 · 時間；空值略過。
 * d：draw 紀錄；o：{ showPrize, prizeName, time }
 */
export function recordMeta(d, { showPrize = false, prizeName = '', time = '' } = {}) {
  const snap = (d && d.snapshot) || {};
  return [showPrize ? prizeName : '', snap.group || '', snap.code || '', time].filter(Boolean);
}
