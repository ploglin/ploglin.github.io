# 基線（實測數字）

量測時間：**2026-08-05**，school2 全站重整 ＋ 8bit 視覺化 ＋ 全站命中區這一輪完成後（`2d58d50`）。

**這份基線的用途**：把「現狀」釘成數字。之後任何一次手改讓數字偏離，都會在下一次跑檢查時現形，
而不是累積成「要先修 N 個 diff」才敢繼續。**數字有變動而不是刻意改的，就是回歸。**

**過期的基線比沒有基線更糟**——真的回歸會被當成正常、正常又會被當成回歸。
所以做完會改動這些數字的批次，請重跑下面兩支並更新本檔（上一次就是整份數字全錯：
記著 174 頁、og:image 15/174 且 9 筆指向不存在的檔、4 筆 WARN、以及已經刪掉的 `spot-check/`）。

重跑方式：

```sh
node scripts/link-check.js                                  # repo 根，唯讀
node kairosoft/school2/scripts/check.js [--verbose] [--strict]
```

---

## `scripts/link-check.js`

**33 項 PASS、0 FAIL、0 WARN**（`KNOWN_ISSUES` 是空的——沒有任何項目靠免死金牌通過）。

| 項目 | 基線 |
|---|---|
| 掃描頁面 | **169** 頁（`.html`，跳過 `.git`/`.idea`/`node_modules`/`assets`/`scripts`/`scratchpad`/`.github`） |
| 內部連結 | **2,047 條 0 壞**（頁面 1,400、靜態資源 647） |
| 外部連結 | 270 條（只計數，不連網） |
| app 狀態片段 | 8 條（`sim/#m=…` 分享碼，不驗 id） |
| 逸出 repo 的相對路徑 | 0 條 |
| 錨點 | **584 條**（同頁 505、跨頁 **79**）→ **0 壞** |
| 同頁 id 重複 | 0 頁 |
| canonical | **169 / 169**；全部等於 `https://ploglin.cc/` ＋ repo 相對目錄 |
| og:url | **169 / 169**；全部等於 canonical 應有值 |
| og:image | **166 / 169**，全部指向存在的檔案。缺的 3 頁是**刻意**的（見下「刻意的例外」） |
| 麵包屑 | 157 頁 / **381 個節點**；層數＝目錄深度、每個非末項 href 可達、末項無 href，全對 |
| sitemap.xml | **168 個 URL**；可索引頁 169 頁（差的 1 頁是 `404.html`，兩邊用同一份 `SKIP_FILES`）；0 漏收、0 多收、0 重複、0 壞檔 |
| `?v=` 版號 | 共用軌（`/assets/*`）**只有一個版號**：**`?v=9`，467 處 / 166 檔**。本地軌（school2 的 `guide.css`／`guide.js`）自帶版號、兩者同號：**`?v=7`，55 處 / 28 檔** |
| `data.js` 引用 | **115 處**，**0 處帶 `?v`**（含 14 個 db 分類頁＋db 索引＋sim 速查表） |

### 刻意的例外（不是待辦）

- **3 頁沒有 `og:image`**：`kindergarten/20260303.html`、`privacy/wealth_navigator.html`、`travel/20251009.html`——
  寄居在同網域但與攻略站無關的一次性頁面，預覽卡寫「開羅攻略站」是**錯的資訊**。
  豁免名單同時寫在 `scripts/gen-og.js` 的 `NON_STATION` 與 `scripts/link-check.js` 第 3 節，**改一邊要改兩邊**。
- **`404.html` 不進 sitemap**：Search Console 會報「已提交但未收錄」。`gen-sitemap.js` 與 `link-check.js` 共用同一份 skip。

---

## `kairosoft/school2/scripts/check.js`

**44 項 PASS、0 FAIL、0 WARN**（`--strict` 也全通過——WARN 升 FAIL 之後仍然乾淨）。
入口固定（`/pa2-check` 依賴），邏輯在 `scripts/checks/{parse,sim,consistency}.js`。

| 項目 | 基線 |
|---|---|
| 景點 | **29 種**，id 不重複、條件設施 id 全部存在 |
| 設施 | **77 種**，每一種都有圖示與日文對照 |
| 內建地形 | 健康鎮 26×24、冬郵 26×26、湖岸 24×24、溪谷 26×26、百靈 26×26，設施 id 全部存在 |
| `sim/presets/*.json` ↔ 內嵌 `PRESET_*_DATA` | 四鎮 deep-equal 完全相同 |
| sim ↔ `db/data.js` | `SPOTS`+`SPOT_JP` ↔ `db/spots` **29 列 × 5 欄 0 處不同**；`items`+`ITEM_ICONS`+`JP_NAMES` ↔ `db/facilities` **77 列 0 處不同**（3 列帶方向註記，已容許）；兩邊 id 集合相同 |
| `typekeys.lock` | lock **79** → 現況 **79**，且現況以 lock 為前綴（append-only 守衛） |
| 分享碼往返 | 26×24 無前綴舊格式、26×26 帶 `RxC;` 前綴，往返一致 |
| 站上分享碼 | **8 組**全部 decode→encode 往返一致 |
| 來源徽章 `SITE_LAYOUTS` | 表 8 筆 ↔ 站上 8 組，每組都認得出是哪一頁的哪一張 |
| 深色覆寫層 | 兩套選擇器（系統偏好 `:root:not([data-theme="light"])` 與手動 `:root[data-theme="dark"]`）**內容逐字一致**；淺色 utility 全部有深色映射 |
| `DEV_GUIDE` | 10 組「×N」條件的 `cond` ↔ `needs` 自洽 |
| sim 速查表 | 3 個分頁全部讀 `db/data.js` 正本、11 條交接連結覆蓋 14 個 db 分類、**手寫副本沒有復活** |
| 每頁可見字數 | **28 頁全部 ≥1,000**（不含 `sim/`） |

### 各頁可見字數（少→多）

最少 **1,707**（`db/ranks/`）、最多 **25,497**（`layouts/lake/`）。門檻是 1,000，最薄的一頁還有 1.7 倍餘裕。

```
1707 db/ranks/        1745 db/towns/       1848 db/achievements/  2171 db/lessons/
2227 db/             2301 db/clubs/        2369 db/items/         2500 db/careers/
2701 db/spots/       2996 db/events/       3213 db/terms/         3238 ./
3345 glossary/       3723 db/facilities/   3954 db/teachers/      4152 db/students/
5234 db/tasks/       7779 combo/           7883 layouts/         11689 start/
12454 endgame/      17548 layouts/east/   19323 layouts/valley/  20714 layouts/health/
21011 walkthrough/  22831 training/       23122 layouts/hill/     25497 layouts/lake/
```

---

## 上線後不可逆的項目 ↔ 守衛

| 不可逆的東西 | 為什麼不可逆 | 守衛 |
|---|---|---|
| `TYPE_KEYS` 的順序 | 分享碼 ABI。重排會讓所有既存分享連結解出**別的建築** | `scripts/typekeys.lock`（只准 append） |
| 26×24 分享碼無前綴 | 舊連結沒有 `RxC;` 前綴，加了就解不開 | check.js「26×24 維持無前綴舊格式」 |
| 三個 localStorage key | `pa2_maps_v9`／`pa2_prefs_v1`／`pa2_autosave_v1`——改名等於清掉玩家的存檔 | 無自動守衛，靠 CLAUDE.md 明寫 |
| 站上 8 組分享碼 | 佈局頁的「🧩 在模擬器開啟」按鈕；改了地圖就要重新產生 | check.js 往返檢查 ＋ `layout-gen/verify.js <town> page` |
| canonical／og:url | 已被 Google 收錄，改動等於換網址 | link-check 第 3 節 |

---

## 已知的後續項（不擋任何事，但別忘）

1. **`assets/shell.css:237` 的 `scroll-margin-top: calc(var(--hdr-h) + 68px)` 裡那個 68 是硬寫的功能列高度。**
   功能列實測 **51px**，**餘裕只剩 17px**——哪天有人把功能列改高就會撞到，錨點落點又會躲到列後面
   （那正是 `guide.css` 第 0 節修過一次的老問題）。正解是讓 `shell.js` 量測後寫進 CSS 變數，
   但那要動共用 JS 並再 bump 一次全站版號，留給下次有共用改動時一起做。
2. **`kairosoft/airport/sim/index.html` 的 `fitGrid()` 有 `Math.max(10, …)` 下限，加上該頁沒有手機平移**
   → 390px 下仍有約 6 行地圖點不到。school2 的 sim 已有雙指平移／捏合，其餘 sim 沒有。
3. **`shell.css` 仍有 38 個 `<44px` 的互動元素**（390px 實測）。全部落在書面豁免清單：正文行內連結、
   `.legal a`、`figcaption a`、`.gb-title`，以及命中區靠 `::after` 疊出、`getBoundingClientRect`
   量不到偽元素的麵包屑。**這 38 個是刻意的，不是漏掉的**——下次量到 38 以外的數字才要查。
