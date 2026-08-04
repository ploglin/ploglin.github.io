# B0 基線（上鎖時的實測數字）

量測時間：2026-08-04，B0「地基與上鎖」批次完成時。

**這份基線的用途**：B0 的前提是「引擎事實（`sim/index.html`）與 `db/data.js`、各攻略頁的手寫表格現在是零差異」。
在零差異的此刻把檢查器加上去，就能把「現狀」釘成 baseline——之後任何一次手改讓數字偏離，
都會在下一次跑檢查時立刻現形，而不是累積成「要先修 N 個 diff」才敢繼續。**先上鎖，再搬家。**

重跑方式：

```sh
node scripts/link-check.js                                  # repo 根，唯讀
node kairosoft/school2/scripts/check.js [--verbose] [--strict]
```

> ⚠ B1（`db/data.js` 與 db 分類頁擴充）與 B0 並行進行。下表的 **db 相關數字（分類數、
> 各 db 頁字數、facilities/spots 列數）會隨 B1 變動**，B1 完成後要重跑一次並更新本檔。
> 不變的是 `sim/` 側的數字（TYPE_KEYS、presets、分享碼）。

---

## `scripts/link-check.js`

28 項 PASS、0 FAIL、4 WARN。

| 項目 | 基線 |
|---|---|
| 掃描頁面 | **172** 頁（`.html`，跳過 `.git`/`.idea`/`node_modules`/`assets`/`scripts`/`scratchpad`/`.github`） |
| 內部連結 | **1,714 條 0 壞**（頁面 1,149、靜態資源 565） |
| 外部連結 | 275 條（只計數，不連網） |
| app 狀態片段 | 8 條（`sim/#m=…` 分享碼，不驗 id） |
| 逸出 repo 的相對路徑 | 0 條 |
| 錨點 | **474 條**（同頁 464、跨頁 **10**）→ **0 壞**（另 1 筆列入已知問題，見下） |
| 同頁 id 重複 | 0 頁 |
| canonical | 169 / 172 頁有；**全部等於 `https://ploglin.cc/` ＋ repo 相對目錄** |
| og:url | 169 / 172 頁有；全部等於 canonical 應有值 |
| og:image | 15 / 172 頁有；**9 筆指向不存在的檔案**（WARN，見下） |
| 麵包屑 | 160 頁 / **386 個節點**；層數＝目錄深度、每個非末項 href 可達、末項無 href，全對 |
| sitemap.xml | **172 個 URL ＝ 172 個可索引頁**；0 漏收、0 多收、0 重複、0 壞檔 |
| `?v=` 版號 | 只有 **`?v=8`**，**443 處 / 169 檔**（與 `kairosoft/CLAUDE.md` 記載相符） |
| `data.js` 引用 | **112 處**（92×`../data.js`、19×`./data.js`、1×`../db/data.js`），**0 處帶 `?v`** |

### 4 筆 WARN（都是既有狀態，不是本批造成）

1. **既有壞錨點 1 筆**：`kairosoft/clothier/index.html` 的 `href="#combo"`——該頁只有
   `#combo-female` / `#combo-male` / `#combo-cost`。修法是把該行 href 改成 `#combo-female`。
   因為它在**其他 28 款遊戲的檔案**裡（B0 明文零改動），先登記在 `link-check.js` 的
   `KNOWN_ISSUES`（比照 `check.js` 的 `ALLOW` 慣例）降級成 WARN，每次跑都會印出來。修好後刪掉那筆即可。
2. **og:image 9 筆檔案不存在**：8 個 `sim/og-image.png`（airport / dream-town / harvest /
   mega-mall2 / ooedo / school1 / school2 / zoo）＋ `kairosoft/school2/og-image.png`。
   社群分享卡目前抓不到圖。school2 的兩張屬本站範本遊戲，值得補。
3. **canonical 缺 3 頁**、4. **og:url 缺同 3 頁**：`kindergarten/20260303.html`、
   `privacy/wealth_navigator.html`、`travel/20251009.html`——三個不套 `shell.js` 的舊獨立頁面。

### 與計畫預期的差異

計畫寫「**484 連結** 0 壞、10 錨點 0 壞」。實測：

- **跨頁錨點 10 條 0 壞** ✔ 完全吻合。
- **連結 484 → 實測 1,714 條**（頁面 1,149 ＋ 資源 565）。差距是計數基準不同，不是有連結消失：
  484 應該是某個子集（例如只算 `<a href>` 且去重後的目標數）。本檔的 1,714 是
  「全站每一個 `href`/`src` 屬性各算一條」，是最嚴格的計數方式；後續以本檔為準。
- 計畫寫「canonical 1 筆錯（`layouts/east/`）」——**已在 B0 開始前修好**，實測 canonical 全對。

---

## `kairosoft/school2/scripts/check.js`

41 項 PASS、0 FAIL、1 WARN（字數）。入口未變，內部拆成：

```
scripts/check.js               入口：報告器（PASS/WARN/FAIL）＋ require 各模組 ＋ 退出碼
scripts/checks/parse.js        從 sim/index.html 抓資料區塊（共用；8 空白縮排是硬相依）
scripts/checks/sim.js          原有 8 組，邏輯原封不動
scripts/checks/consistency.js  B0 新增，全部 WARN 層級
```

`--strict` 把 WARN 升為 FAIL；`--verbose` 印出 INFO 的完整清單。

### 原有 8 組（PASS/FAIL，全數保留）

JS 語法／面板資料覆蓋率（圖示・日文）／景點資料（29 種・id 不重複）／發展建議 id／
6 張內建地圖的尺寸與 id／分享編碼往返／多尺寸分享編碼（26×26 前綴・26×24 無前綴）／
深色覆寫層（兩套選擇器一致・淺色 utility 全映射・5 條關鍵規則）。**全 PASS。**

> `sim.js` 裡對 `encodeMap`/`decodeMap` 的鏡像重寫**刻意保留**，不改成 require 引擎——
> 它是獨立實作的對照測試，共用之後編碼器出 bug 時檢查器會一起壞掉還報 PASS。

### B0 新增（WARN 層級）

| 檢查 | 基線 |
|---|---|
| `SPOTS`+`SPOT_JP` ↔ `db/spots` | **29 列 × 5 欄，0 處不同** |
| `items`+`ITEM_ICONS`+`JP_NAMES` ↔ `db/facilities` | **77 列，0 處不同**；只在 sim 0 個、只在 db 0 個 |
| `sim/presets/*.json` ↔ 內嵌 `PRESET_*_DATA` | east 26×26 / lake 24×24 / valley 26×26 / hill 26×26，**四張全部 deep-equal** |
| `typekeys.lock` 前綴（append-only） | lock **79** ↔ 現況 **79**，完全相同 |
| 站上分享碼 decode→encode 往返 | **8 組全部往返一致** |
| `DEV_GUIDE` 的 `cond` ↔ `needs` | **10 組「×N」條件全部自洽** |
| 每頁可見字數 ≥1,000 | 34 頁中 **5 頁未達標**（WARN） |

比對時的兩處**刻意容許**（都印出來，不是靜默忽略）：

- `db/facilities` 的「解鎖條件」欄不比對——它是 db 專屬欄位，`DEV_GUIDE` 的 `cond` 是分階段的不同粒度。
- 「尺寸」欄允許 db 多一個方向註記，比對前剝掉 `（…）`。目前 3 列有：
  天象館 `2×1（橫）`、網球場 `1×2（直）`、籃球場 `1×2（直）`。
- `presets/*.json` 刻意不帶 `bid`（見 `school2/CLAUDE.md`），所以只比 `type` 與 `elevation`。

### TYPE_KEYS（分享碼 ABI）

**79 個**，索引 0 = `empty`，索引 78 = `elephant`。快照在 `scripts/typekeys.lock`。
只能 append——8 組站上分享碼、外部 inbound `#m=` 連結、玩家的 `pa2_maps_v9` 存檔全部依賴索引順序。

### 站上 8 組分享碼

| 頁面 | 尺寸 | 有設施格數 | 碼長 |
|---|---|---|---|
| `layouts/index.html`（示範 A） | 26×24 健康鎮 | 9 | 120 |
| `layouts/index.html`（示範 B） | 26×24 健康鎮 | 9 | 112 |
| `layouts/index.html`（示範 C） | 26×24 健康鎮 | 6 | 84 |
| `layouts/health/index.html` | 26×24 健康鎮 | 558 | 3,286 |
| `layouts/east/index.html` | 26×26 冬郵小鎮 | 645 | 3,852 |
| `layouts/lake/index.html` | 24×24 湖岸小鎮 | 529 | 2,747 |
| `layouts/valley/index.html` | 26×26 溪谷小鎮 | 483 | 3,639 |
| `layouts/hill/index.html` | 26×26 百靈山丘 | 648 | 3,803 |

### 各頁可見字數（34 頁，不含 `sim/`；演算法比照 `gen-static.js` 的 `visibleText()`）

| 字數 | 頁 | | 字數 | 頁 |
|---:|---|---|---:|---|
| **239** | `spot-check/` | | 2,808 | `db/teachers/` |
| **720** | `db/ranks/` | | 3,160 | `db/students/` |
| **742** | `db/towns/` | | 3,257 | `glossary/` |
| **809** | `db/` | | 3,821 | `secrets/` |
| **850** | `db/achievements/` | | 4,035 | `ng-plus/` |
| 1,159 | `db/lessons/` | | 4,269 | `db/tasks/` |
| 1,303 | `db/clubs/` | | 4,390 | `maps/` |
| 1,364 | `db/items/` | | 4,782 | `students/` |
| 1,538 | `db/careers/` | | 4,847 | `challenges/` |
| 1,547 | `db/spots/` | | 5,346 | `teachers/` |
| 1,976 | `db/events/` | | 5,401 | `walkthrough/` |
| 2,310 | `db/terms/` | | 5,536 | `./`（hub） |
| 2,522 | `romance/` | | 5,729 | `activities/` |
| 2,667 | `db/facilities/` | | 5,959 | `economy/` |
| | | | 6,428 | `layouts/` |
| | | | 18,795 | `layouts/east/` |
| | | | 19,894 | `layouts/valley/` |
| | | | 22,024 | `layouts/health/` |
| | | | 23,668 | `layouts/hill/` |
| | | | 25,464 | `layouts/lake/` |

粗體 5 頁 <1,000 字（B3「db 加厚」與 B4「主線合併」的目標）。
`db/terms/` 與 `db/achievements/` 是 B1 已建出的新分類頁，數字會再變。

---

## 上線後不可逆項目 ↔ 守衛對照

| 不可逆項目 | 守衛 |
|---|---|
| `TYPE_KEYS` 順序 | `check.js` 的 `typekeys.lock` 前綴檢查 |
| `26×24` 無前綴分享碼格式 | `check.js` 第 7 組（原有）＋ 8 組站上分享碼往返 |
| item id 字串 | `typekeys.lock` ＋ 內建地圖 id 存在性 |
| localStorage keys | 尚無自動守衛（`pa2_maps_v9`/`pa2_prefs_v1`/`pa2_autosave_v1`，見 `school2/CLAUDE.md`） |
| db 分類 slug 與網址 | `link-check.js` 的內部連結＋sitemap 漏收/多收 |
| 攻略頁網址 | `link-check.js` 的內部連結、麵包屑 href、canonical 位置一致 |
| db 表格的欄數/欄名 | `check.js` 的 sim↔db 逐列逐欄比對 |
| `presets/*.json` 與內嵌地形兩份副本 | `check.js` 的 deep-equal（把 CLAUDE.md 的「keep both copies in sync」變成測試） |
