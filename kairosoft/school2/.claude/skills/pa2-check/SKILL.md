---
name: pa2-check
description: 驗證 index.html 的 JS 語法與遊戲資料一致性（圖示、日文對照、景點條件、發展建議、內建地圖、分享編碼往返）。任何程式或資料修改後都應執行。
---

在專案根目錄執行：

```
node scripts/check.js
```

- 全部 PASS 才算完成修改；FAIL 會列出缺漏的項目或 id。
- 常見 FAIL 原因：新增設施漏補 `ITEM_ICONS` 或 `JP_NAMES`；SPOTS/DEV_GUIDE 引用了不存在的 id。
- 修改 items 時注意 **TYPE_KEYS append-only** 慣例：新設施只能加在該分類尾端，插入中間或刪除會讓舊的分享連結載出錯的地圖。
