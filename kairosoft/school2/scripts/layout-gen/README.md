# 完美佈局產生管線(內部工具)

產生並驗證「健康鎮完美佈局」(layouts/ 頁的 29 景點全成立地圖)。設施尺寸、
SPOTS、地形都**直接從 ../../sim/index.html 抽取**,模擬器資料改了重跑即可。

- `engine.js` — 從 sim 抽 items/SPOTS/地形,複製判定邏輯(4×4 景點、斜坡推導、
  可達性 BFS、包圍判定、分享碼編碼)。※ SIM 路徑為絕對路徑,換機器要改。
- `design2.js` — 路網+街廓佈局器(先鋪路、街廓填景點,唯一設施不重複)。
- `final.js` — 主流程:景點骨架→補位→分區填充→高地開發→第二校門→綠化→
  驗證→輸出 code.txt。每次放置都有「景點數/包圍數不變差」守衛。
- `gen-assets.js` — 由 code.txt 產生 health-perfect.svg 與頁面表格 HTML。

用法:`node final.js` → `node gen-assets.js`,再把 code.txt / SVG / 表格
注入 layouts/index.html(佈局頁的分享碼與統計要同步更新並解碼重驗)。
東部小鎮地形完成後,擴充 engine.js 讀取 presets/east-wip.json 即可做東部版。
