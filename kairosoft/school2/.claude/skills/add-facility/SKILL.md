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
5. **`scripts/typekeys.lock`**：把新 id **追加到檔尾**（一行一個，順序＝索引）。這是分享碼 ABI 的機器守衛，
   `check.js` 會驗「當前 `TYPE_KEYS` 必須以 lock 為前綴」。只 append，不要重排或刪行。
6. **`db/data.js` 的 `facilities` 分類**：同一列資料也存在於資料庫（設施／日文／分類／尺寸／解鎖條件／地圖標籤），
   位置要與 `items` 同序。改完 `db/data.js` **一定要重跑 `node ../../scripts/gen-static.js`**（表格是預渲染的）。
   `check.js` 會逐列比對 sim↔db，漏改會被抓到。
7. **驗證**：`node scripts/check.js` 全 PASS（WARN 也要看過；`--strict` 可把 WARN 當 FAIL 跑一次）。
8. **commit**：訊息格式「○○尺寸設為 WxH」或「新增設施○○」。
