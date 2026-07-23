---
name: add-facility
description: 新增設施或更新設施尺寸/名稱的標準流程（items/ITEM_ICONS/JP_NAMES 同步、append-only 慣例、驗證、commit）。使用者回報「○○是2x2」「找不到○○」「○○應該叫△△」時使用。
---

使用者回報設施尺寸、譯名修正或缺少的設施時，依序處理 `index.html`：

1. **items**：
   - 尺寸：`w`＝橫向（Y 方向）格數、`h`＝縱向（X 方向）格數。使用者說「1x2」時務必確認直的還是橫的（先例：圖書室為橫 `w:2,h:1`、校長室為直 `w:1,h:2`）。
   - 名稱：一律用遊戲中文版名稱（日文名放 JP_NAMES）。`short` 為地圖上的單字標籤。
2. **append-only**：新設施只能加在該分類（env/fac/spec/sports/farm）現有項目的**尾端**——`TYPE_KEYS` 順序被分享連結編碼使用，插中間或刪除會破壞舊連結。
3. **同步兩張表**：`ITEM_ICONS`（emoji 圖示）與 `JP_NAMES`（日文原名）都要補。
4. 若設施涉及景點條件（`SPOTS` 的 req）或發展建議（`DEV_GUIDE`），確認引用的 id 存在。
5. **驗證**：`node scripts/check.js` 全 PASS。
6. **commit**：訊息格式「○○尺寸設為 WxH」或「新增設施○○」。
