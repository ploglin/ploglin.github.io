# 開羅攻略站 — 平台建置規範

本檔是「開羅攻略站」(Kairosoft 開羅遊戲繁體中文攻略站，部署於 `ploglin.github.io`) 的建置標準。**每款遊戲的深度與內容都要對齊 `kairosoft/school2/` 這款範本**。撰寫或擴充任何遊戲頁面時，遵循本規範；派給子 agent 的工作也應引用本規範。

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

**攻略專頁 (`index.html`)** 至少包含：H1 + lead + 更新日期、TOC 目錄、多個 `<h2>` 章節(新手玩法 / 核心機制或 combo / **主要資料表** / 進階技巧 / FAQ)、`.callout`(tip/warn/key) 重點框、`.table-wrap`+`table.data` 資料表、**至少一個 `.ad-slot`**、資料來源致謝、返回連結。字數要足(參考 school2 攻略頁的深度)。

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
- **全螢幕工具(模擬器)**：不套 `shell.css`、不注入站台 header/footer，改呼叫 `Shell.mountBar()`，只加一條自帶樣式的精簡功能列(含回站台鈕)。模擬器頁尾固定為：
  ```html
  <script src="../../../assets/shell.js?v=N"></script>
  <script data-shell>Shell.mountBar();</script>
  ```
  `data-shell` 屬性不可省略——`school2/scripts/check.js` 靠「無屬性的 `<script>`」找主程式。
- **快取**：改動 `shell.js` / `shell.css` 後，全站 `?v=N` 要一起加一號(目前 `?v=4`)。

## 共用基礎建設(assets/)

- **`shell.js`**：`Shell.mount({page, game:{id,type}, breadcrumb:[{t,href}]})` 注入站台 header/footer/麵包屑；封裝 `Shell.track(event, params)`(自動帶 `game_id`/`game_type`)；並注入 GA4(`G-EL4J27F89B`)與 AdSense(`ca-pub-5891811504833462`) 載入器。頁面**不要自加 header/footer**。
- **`shell.css`**：全站設計系統(token、卡片、`.article`/`.prose`/`.toc`/`.callout`/`.table-wrap`+`table.data`/`.ad-slot`、`.db-*` 資料庫樣式、淺/深色)。
- **`db.js`**：`DB.mountCategory('<key>')` / `DB.mountIndex()`，讀 `window.GAME_DB`。
- **`games-index.js`**：`window.GAMES = [...]` 全站遊戲索引(Hub 首頁用)。新增遊戲要在此登記(id/slug/title/jp/en/emoji/status/type/tags/desc)。

## 頁面樣板規則

- `<head>` **靜態手寫** SEO：`<title>`、description、keywords、`<link rel="canonical">`(正式網址 `https://ploglin.github.io/...`)、Open Graph、`Article`(攻略頁)或 `WebSite`/`ItemList` 的 JSON-LD。**這些不可靠 JS 注入**(社群爬蟲不執行 JS)。
- 引入 `../../assets/shell.css`(依頁面深度調整層數)。
- body 只寫 `<main class="container-narrow article">` 內容；結尾兩個 script：`shell.js` 與 `Shell.mount({...})`。
- 資料庫分類頁另引入 `db.js` 與該遊戲 `db/data.js`。

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

## 相關檔案
- 範本遊戲：`kairosoft/school2/`(攻略專頁＝`index.html`、模擬器＝`sim/index.html`、資料庫＝`db/`)。`scripts/check.js` 驗證的是 `sim/index.html`。
- 版型範本(供 agent 比照)：`kairosoft/hotspring/index.html`。
- school2 模擬器本身的內部規範見 `kairosoft/school2/CLAUDE.md`。
