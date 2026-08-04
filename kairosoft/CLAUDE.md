# 開羅攻略站 — 平台建置規範

本檔是「開羅攻略站」(Kairosoft 開羅遊戲繁體中文攻略站，正式網域 `https://ploglin.cc`，由 GitHub Pages 部署，repo 名仍為 ploglin.github.io) 的建置標準。**每款遊戲的深度與內容都要對齊 `kairosoft/school2/` 這款範本**。撰寫或擴充任何遊戲頁面時，遵循本規範；派給子 agent 的工作也應引用本規範。

## 目標定位

網站主要目的是 **SEO + 讓 Google AdSense 視為內容豐富的站台**。因此：
- **內容(攻略文字)為主體**：每頁要有大量原創繁中文字，適度搭配圖/示意。
- **模擬器/工具為輔**：是「進入遊戲專頁後才點擊進去」的次級功能，不是入口。
- 原創性：參考 Kairosoft Wiki 等公開資料後**重寫**，勿整段照抄；譯名盡量對齊 Steam 官方繁體中文；附「資料來源致謝」。**全站不放 email。**

## 每款遊戲的資訊架構(IA)

```
kairosoft/<game>/            index.html = 內容豐富的攻略專頁(SEO 主力，該遊戲入口)
        ├── sim/             模擬器(僅格子/佈局型遊戲；從專頁點入)
        └── db/              資料庫(wiki 式，每分類獨立頁)
             ├── index.html            資料庫索引(DB.mountIndex)
             └── <category>/index.html 各分類頁(DB.mountCategory)
```

- 遊戲專頁(index)是內容主力，須連到該遊戲的 `sim/`(若有)與 `db/`。
- 每款都要有 `db/`；模擬器只有格子/佈局型才有(見下)。

## 內容深度標準(對齊 school2)

**攻略專頁 (`index.html`)** 至少包含：H1 + lead + 更新日期、TOC 目錄、多個 `<h2>` 章節(新手玩法 / 核心機制或 combo / **主要資料表** / 進階技巧 / FAQ)、`.callout`(tip/warn/key) 重點框、`.table-wrap`+`table.data` 資料表、資料來源致謝、返回連結。字數要足(參考 school2 攻略頁的深度)。

**資料庫 (`db/`)**：把該遊戲的遊戲內資料拆成多個可查詢分類(例如 school2：人氣景點/設施/老師/社團/進路/行事活動/特別授業/學校排名/道具/挑戰)。每分類一個獨立可索引頁，具專屬 SEO。

**模擬器 (`sim/`)**：格子擺放型遊戲適用(見下分類)。互動、即時判定 combo。

## 適合模擬器 / 計算器 / 資料庫 的遊戲分類

- **格子擺放型 → 佈局模擬器**：口袋學院2(已有)、大江戶、都市大亨2(樓層)、溫泉、夢想小鎮、遊樂園、動物園、機場、大農場、忍者村、太空殖民地、開拓勇者村。判定規則各異(4×4 窗口 / 相鄰 / 配對 / 樓層)，引擎須參數化。
- **配方/組合型 → 計算器**：遊戲發展國(已有搜尋表)、拉麵、甜點、壽司、漢堡、客滿餐廳、時尚洋裝。
- **RPG/育成型 → 資料庫/圖鑑**：大海賊、神秘島、賽車、賽馬、足球。

## 遊戲內導覽(店中店)

進入任一款遊戲的任一頁，站台 header 下方會自動出現**該遊戲自己的功能列**(`.game-bar`)：遊戲 emoji ＋ 中／日名稱 ＋ 各分頁(攻略總覽／模擬器／資料庫／…)，並標示目前所在頁；分頁多的收進「更多」下拉。目的是讓每款遊戲像獨立的「店中店」，而不是一堆互相跳轉的散頁。

- **頁面端不需任何設定**：`shell.js` 由網址 `kairosoft/<id>/…` 推導出遊戲與所在層級，自動算出相對連結。只要照樣板呼叫 `Shell.mount({...})` 就會有。
- **資料來源**：`assets/shell.js` 裡的 `GAME_NAV` 區塊，由 `node scripts/gen-game-nav.js` **掃描實際檔案**產生(遊戲名／emoji／色系取自 `games-index.js`)。**新增或刪除子頁後要重跑這支腳本**，否則功能列不會出現新分頁。
- **新的子頁 slug** 要先在 `scripts/gen-game-nav.js` 的 `LABELS` 加中文標籤與圖示，否則產生時會警告並略過。
- **功能列版面**：`main` 固定**最多 4 個 tab**（攻略總覽／模擬器／資料庫／更多攻略▾），其餘子頁一律收進「更多攻略▾」下拉；下拉依 `LABELS` 的 `group` 欄位分成 `tool`（工具：佈局範例、景點檢查器…）與 `guide`（攻略：流程、老師、學生…）兩群顯示。要進 main 的子頁在 `LABELS` 標 `main:true`，其餘標 `group:'tool'` 或 `group:'guide'`。
- **新增子頁後也要在 `scripts/gen-related.js` 的 `RELATED` 加精選連結**（game → 頁面 slug → 3 個相關頁，含 href／icon／標題／一句短描述）；沒設定就走 fallback（依 GAME_NAV 的上一頁／下一頁＋資料庫自動湊），品質較差。改標記或 RELATED 後重跑 `node scripts/gen-related.js` 即冪等蓋章。
- **全螢幕工具(模擬器)**：不套 `shell.css`、不注入站台 header/footer，改呼叫 `Shell.mountBar()`，只加一條自帶樣式的精簡功能列(含回站台鈕)。模擬器頁尾固定為：
  ```html
  <script src="../../../assets/shell.js?v=N"></script>
  <script data-shell>Shell.mountBar();</script>
  ```
  `data-shell` 屬性不可省略——`school2/scripts/check.js` 靠「無屬性的 `<script>`」找主程式。
- **快取**：改動 `shell.js` / `shell.css` / `db.js` / `home.js` 後，全站 `?v=N` 要一起加一號(目前 `?v=8`，含各頁對 `db.js`、首頁對 `games-index.js`／`home.js` 的引用)。改完 `grep -rn '?v=<舊號>'` 確認零殘留。

## 導覽分層原則

每一層導覽各司其職，**頁面不得再手寫頂部返回列或導覽按鈕列**——麵包屑＋遊戲功能列已涵蓋「往上」與「橫向切換」：

- **站台 header**(shell.js 注入)＝站級：回首頁、全站識別。
- **麵包屑**＝往上：回遊戲首頁／資料庫索引等上層節點。
- **遊戲功能列(`.game-bar`)**＝橫向切換：在同款遊戲的各分頁間跳。
- **index 店面區(`.db-cat-grid` 卡片)**＝往下全覽：從遊戲首頁點進 sim／db／各攻略。
- **頁尾「延伸閱讀」**(`gen-related.js` 蓋章於 `<!-- related:start/end -->`)＝橫向推薦：3 張相關頁卡片＋一顆回遊戲總覽的 `.back-hub`。
- **內文連結**＝語境引用：在句子裡自然帶出相關頁。

因此各頁**只**保留：index 店面區指向自家 sim／db 的主要 CTA、db 分類頁底部統一的一行 `<p style="margin-top:22px"><a class="back-hub" href="../">← 資料庫索引</a> · <a class="back-hub" href="../../">攻略總覽</a></p>`、以及 gen-related 蓋章的延伸閱讀。**不要**再出現 `← 回攻略站`／`← 回○○`／`← 回資料庫` 這類手寫返回鈕，或 h1 附近連 sim/db 的 `.btn` 導覽列（該功能已由 `.game-bar` 取代）。

## 共用基礎建設(assets/)

- **`shell.js`**：`Shell.mount({page, game:{id,type}, breadcrumb:[{t,href}]})` 注入站台 header/footer/麵包屑；封裝 `Shell.track(event, params)`(自動帶 `game_id`/`game_type`)；並注入 GA4(`G-EL4J27F89B`)與 AdSense(`ca-pub-5891811504833462`) 載入器。頁面**不要自加 header/footer**。
- **`shell.css`**：全站設計系統(token、卡片、`.article`/`.prose`/`.toc`/`.callout`/`.table-wrap`+`table.data`/`.ad-slot`、`.db-*` 資料庫樣式、淺/深色)。
- **`db.js`**：`DB.mountCategory('<key>')` / `DB.mountIndex()`，讀 `window.GAME_DB`。產 HTML 的部分是**純函式** `DB.categoryHtml(db, key)` / `DB.indexHtml(db)`(不碰 DOM)，`scripts/gen-static.js` 以 `require('assets/db.js')` 吃同一份 → 建置期預渲染與瀏覽器渲染保證同字串。掛載時若 `#dbApp` 已帶 `data-prerendered` 就不重建 innerHTML，只把搜尋／排序／比較的事件接到既有節點上。
- **`games-index.js`**：`window.GAMES = [...]` 全站遊戲索引(Hub 首頁用)。新增遊戲要在此登記(id/slug/title/jp/en/emoji/status/type/tags/desc)。
- **`home.js`**：Hub 首頁四個卡片區(精選／模擬器／攻略與資料表／全部)的區塊定義與卡片 HTML。純函式 `HOME.cardHtml` / `HOME.gridsHtml(GAMES)` 同樣被 `gen-static.js` require；瀏覽器端 `HOME.mount()`，容器已帶 `data-prerendered` 就只補點擊追蹤。首頁**不要**再把渲染邏輯寫成 inline script。

### 預渲染(SEO／AdSense 必要)

站台是純靜態 GitHub Pages，**內容不能只存在於瀏覽器端**——客戶端渲染的空殼頁會被 AdSense 判為 thin content。因此：

- `node scripts/gen-static.js` 會把 111 個 `db/**/index.html` 的 `#dbApp` 與首頁四個 `#*Grid` 容器**烤成靜態 HTML**，蓋在 `<!--prerender:start--> … <!--prerender:end-->` 之間並在容器上加 `data-prerendered`。冪等，可反覆重跑。
- **改動任一遊戲的 `db/data.js`、`assets/games-index.js`、`assets/db.js`、`assets/home.js`，或新增 db 分類頁／新遊戲後，必須重跑 `node scripts/gen-static.js`**，否則靜態內容會與資料脫節(瀏覽器也不會補救，因為已預渲染的容器不重建)。
- 預渲染區段內的 HTML 是**產生物，不要手改**；要改內容就改 `db/data.js` 或 render 函式再重跑。
- 例行順序（**產生器跑完接著跑檢查器**）：

  ```sh
  node scripts/gen-game-nav.js
  node scripts/gen-related.js
  node scripts/gen-static.js
  node scripts/gen-sitemap.js
  node scripts/link-check.js                       # 全站連結/錨點/canonical/麵包屑/sitemap/?v=
  node kairosoft/school2/scripts/check.js          # school2 模擬器＋sim↔db 一致性
  for t in health east lake valley hill; do node kairosoft/school2/scripts/layout-gen/verify.js $t page; done
  ```

## 檢查器

兩支都是**唯讀**的，跑完不改任何檔案；有 FAIL 就退出碼 1。

- **`scripts/link-check.js`**（repo 根，跨全站 29 款）：相對 `href`/`src` 目標存在性、同頁與跨頁錨點的
  `id` 存在性、`canonical`／`og:url` 必須等於 `https://ploglin.cc/` ＋ repo 相對目錄、`og:image`
  指向存在的檔案、麵包屑層數＝目錄深度且每個 href 可達、`sitemap.xml` 與可索引頁互相對得上（漏收/多收都報）、
  全 repo `?v=` 同號且 `data.js` 引用不帶 `?v`。**新增/搬移/刪除任何頁面後必跑。**
  既有無法立刻修的問題登記在檔頂的 `KNOWN_ISSUES`（每筆要寫理由與修法），降級成 WARN 但每次都會印出來。
- **`kairosoft/school2/scripts/check.js`**：入口不可換（`/pa2-check` 技能依賴），內部拆
  `scripts/checks/{parse,sim,consistency}.js`。除原有 8 組模擬器檢查外，另驗 `sim` 的
  `SPOTS`/`items`/`ITEM_ICONS`/`JP_NAMES` ↔ `db/data.js` 逐列相等、`sim/presets/*.json` ↔ 內嵌地形
  deep-equal、`typekeys.lock`（分享碼 ABI 的 append-only 守衛）、站上 8 組分享碼往返一致、
  `DEV_GUIDE` 的 `cond`↔`needs` 自洽、每頁可見字數 ≥1,000。
  三個層級：**PASS / WARN / FAIL**；`--strict` 把 WARN 升為 FAIL、`--verbose` 印完整清單。
  新加的檢查一律先以 WARN 落地（不擋工作），確認穩定後再在 `checks/consistency.js` 的 `LEVEL` 表升成 `fail`。
- 上鎖當時的實測數字全部記在 **`kairosoft/school2/scripts/BASELINE.md`**（連結數/錨點數/各頁字數表/
  8 組分享碼/TYPE_KEYS 長度，以及「上線後不可逆項目 ↔ 守衛」對照）。數字有變動而不是刻意改的，就是回歸。

## 頁面樣板規則

- `<head>` **靜態手寫** SEO：`<title>`、description、keywords、`<link rel="canonical">`(正式網址 `https://ploglin.cc/...`)、Open Graph、`Article`(攻略頁)或 `WebSite`/`ItemList` 的 JSON-LD。**這些不可靠 JS 注入**(社群爬蟲不執行 JS)。
- 引入 `../../assets/shell.css`(依頁面深度調整層數)。
- body 只寫 `<main class="container-narrow article">` 內容；結尾兩個 script：`shell.js` 與 `Shell.mount({...})`。
- 資料庫分類頁另引入 `db.js` 與該遊戲 `db/data.js`；body 的 `<div id="dbApp"></div>` 內容由 `node scripts/gen-static.js` 預渲染蓋章(見「預渲染」)，手寫時留空即可。
- **H1 採前綴式**「遊戲名 ○○攻略」(例：`口袋學院物語2 老師育成攻略`)；子頁 H1 也帶遊戲名前綴，與麵包屑一致、利於 SEO。
- **更新日期用 `.meta`**：`<p class="meta">最後更新：YYYY 年 M 月 · 繁體中文原創整理</p>`，緊接 lead 之後。
- **頁尾埋延伸閱讀標記**：內容主體結束、`</main>` 之前放一組空的 `<!-- related:start --><!-- related:end -->`，由 `node scripts/gen-related.js` 蓋章；**不要**手寫該區塊或手寫返回列(見「導覽分層原則」)。

### db/data.js 格式
```js
window.GAME_DB = {
  game: { id, title },
  categories: [
    { key, slug, label, icon, intro, columns:[...], rows:[[...],[...]] }
  ]
};
```
rows 為純文字(多值用「／」或「・」分隔，勿放 HTML)。分類頁 assets 路徑為四層 `../../../../`，資料庫索引頁為三層 `../../../`，data.js 於索引為 `./data.js`、於分類頁為 `../data.js`。

**改完 `data.js` 一定要重跑 `node scripts/gen-static.js`**(頁面上的表格是預渲染的靜態 HTML，不重跑就不會更新)。新增分類頁時，body 先寫空的 `<div id="dbApp"></div>`，跑一次 gen-static 就會被蓋上內容。`intro` 欄位是該分類頁唯一的原創敘述文字，直接影響頁面字數與 SEO，請寫足 1–3 句。

## 相關檔案
- 範本遊戲：`kairosoft/school2/`(攻略專頁＝`index.html`、模擬器＝`sim/index.html`、資料庫＝`db/`)。`scripts/check.js` 驗證的是 `sim/index.html`。
- 版型範本(供 agent 比照)：`kairosoft/hotspring/index.html`。
- school2 模擬器本身的內部規範見 `kairosoft/school2/CLAUDE.md`。
