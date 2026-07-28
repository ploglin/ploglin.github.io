# 完美佈局產生管線(內部工具)

產生並驗證各城鎮的「完美佈局」(layouts/ 頁上 29 景點全成立的地圖)。
設施尺寸、SPOTS、地形都**直接從 ../../sim/index.html 抽取**,模擬器資料改了重跑即可。

目前已產出:**健康鎮 26×24**(`health-perfect.svg`)與**冬郵小鎮 26×26**(`east-perfect.svg`),
兩張都是 29/29 景點、0 棟被包圍。

## 檔案

| 檔案 | 角色 |
|---|---|
| `towns.js` | **城鎮設定表**(尺寸／preset 變數名／SVG 檔名／`page` 子頁目錄／`pond.maxCarve` 水塘破壞預算／棋盤路網參數)。唯一的「哪個城鎮」開關。 |
| `engine.js` | 從 sim 抽 items/SPOTS/該鎮地形,複製判定邏輯(4×4 景點、斜坡推導、可達性 BFS、包圍判定、分享碼 encode/decode)。 |
| `design2.js` | 路網佈局器:鋪路 → 切 4×4 街廓 → 街廓填景點骨架(唯一設施不重複、整組放置有包圍守衛)。 |
| `builder.js` | **城鎮無關的共用機具**:4×4 補位、分區填充、綠化、加開校門、**鑿水道**、打通高地坡道、高地開發、斷頭路整理、驗證輸出。 |
| `final.js` | 健康鎮的**設定檔**(街廓分區、校長室位置、第二座校門、高地園區)。 |
| `east.js` | 冬郵小鎮的**設定檔**。 |
| `verify.js` | **可重跑的驗證器**,只吃分享碼。 |
| `gen-assets.js` | 由分享碼產生 `layouts/*.svg` 與頁面要用的表格 HTML。 |

`code.txt` / `code-east.txt` 與 `*-table-*.html` 是產物,不是輸入。

## 用法

```sh
node final.js                 # 健康鎮 → code.txt
node east.js                  # 冬郵小鎮 → code-east.txt
node gen-assets.js            # code.txt      → layouts/health-perfect.svg + spots/fac-table-health.html
node gen-assets.js east       # code-east.txt → layouts/east-perfect.svg  + spots/fac-table-east.html
node verify.js health page    # 驗「layouts/health/index.html 上實際貼的那一串分享碼」
node verify.js east page
```

## 佈局頁的結構

```
layouts/index.html          完美佈局 hub:城鎮卡片 + **共用的設計原則(只寫一次)** + 入門小範例
layouts/<town.page>/        各鎮子頁:地圖 / 分享碼 / 統計 / 景點座標表 / 設施表 / 施工順序
layouts/*-perfect.svg       兩鎮共用同一層的 SVG(子頁以 ../xxx-perfect.svg 引用)
```

各鎮子頁頁首有一排**城鎮切換 pills**(連到兄弟頁,現在所在鎮標 `.on`),
擴充到五鎮時只要在 pills 清單加一筆。子頁是**巢狀 slug**(`layouts/<鎮>/`),
`scripts/gen-game-nav.js` 只掃遊戲根目錄的第一層,所以**不會**進遊戲功能列
(也不必登記 LABELS、不會出現未知 slug 警告);橫向切換由 pills 與 hub 負責,
麵包屑則是「口袋學院物語2 → 佈局範例集 → ○○鎮完美佈局」。
`scripts/gen-related.js` 的 `RELATED` 已登記 `layouts/health` / `layouts/east`
(巢狀 key,href 要多退一層)。新增城鎮頁後重跑 `node scripts/gen-related.js`
與 `node scripts/gen-sitemap.js`。

把 `code-*.txt` 貼進該鎮子頁的「在模擬器開啟」按鈕、表格 HTML 貼進對應
`<tbody>`,然後**一定要跑 `node verify.js <town> page`**——它直接從該鎮子頁
抓分享碼解碼重驗,確保頁面上的圖就是驗過的那張。全部 PASS 才算完成。

## 加一個新城鎮

1. `sim/index.html` 要有該鎮的 `PRESET_XXX_DATA`(並鏡射到 `sim/presets/`)。
2. `towns.js` 加一筆:`rows`/`cols`(= 座標上限 − 1)、`preset` 變數名、`svg` 檔名、
   `page`(子頁目錄名)、`pond.maxCarve`(允許破壞幾格水塘)、
   `roads`(橫向大道列、縱向街道欄、街廓帶——街廓寬高盡量對齊 4,因為 4×4 就是景點窗口)。
3. 抄 `east.js` 當範本,只改分區設定;**不要複製 engine/builder**。
4. `verify.js` / `gen-assets.js` 的 `CODE_FILE` 對照表加一行。
5. 新增 `layouts/<page>/index.html`(抄現有子頁,head 靜態手寫 SEO)、
   把該鎮加進 hub 的城鎮卡片與所有子頁的 pills 清單,
   再跑 `node scripts/gen-related.js` 與 `node scripts/gen-sitemap.js`。

> ⚠️ 進入點腳本**必須**在 `require('./engine.js')` 之前先 `require('./towns.js').select(key)`——
> engine 與 design2 會在載入當下把 `gridRows`/`gridCols` 解構成常數。

## 產生器的固定假設(頁面上也要照這樣說明)

- **水塘可以破壞,但要有預算**:實機確認**水塘可被建設覆蓋、破壞成平地**(保留原高度)。
  `towns.js` 的 `pond.maxCarve` 是該鎮允許破壞的格數上限,`verify.js` 檢查
  「破壞數 ≤ 上限」「沒有無中生有的新水塘」「鑿開的格子保持原高度」,並列出破壞座標。
  目前:健康鎮 0 格、冬郵小鎮 2 格(東南湖心水道)。
- **原始斜坡一格不動**:斜坡是高低差推導出來的,蓋東西上去高地就上不去了。
- **既有校舍原則上保留**;只有卡在幹道上的小農舍(小雞／小農場／田地／百葉箱)
  與「怎麼蓋都走不到」的建築會拆遷,並在別區重建。`verify.js` 會把拆掉的清單印出來。
- **高地可以蓋房**,每列最外側留步道接坡道。
- **不放 `hidden` 磚**(例如 `slope`),地圖上不能有玩家蓋不出來的東西。

## 冬郵小鎮的三個特殊處理

- **田埂路(`aze_path`)不可通行**,等同景觀;幹道會直接鋪過去,其餘留著當地形。
- **高地鋪滿草地／竹林時沒有斜坡**——`builder.openPlateaus()` 會貪婪地把邊界格
  「擦成空地」讓遊戲自動長出坡道,並窮舉短坡道鏈救援被圍住的既有建築。
- **東南角有 39 格陸地被水塘圍住**——`builder.carveWaterChannel()` 用 0-1 Dijkstra
  (經過水塘 +1)算出最省的水道,實際模擬後挑「打通面積最大、破壞格數最少」的那條。
  冬郵只鑿 `X21/Y5`、`X21/Y4` 兩格就打通 15 格動線,**島上兩間原生養豬小屋原地保留**。

## SVG 的多格建築

`gen-assets.js` 用跟模擬器 `assignBlockIds()` 同一套貪婪配對,把同型同高的 w×h
區塊圈成**一個矩形**、名稱只標一次、高地虛線框也以整棟為單位。
分格畫的話,每格之間的白色描邊在瀏覽器非整數縮放下會出現接縫,
一棟 2×2 的辦公室會被看成上下兩塊不同顏色(使用者實際回報過)。
