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

### 現況落差（2026-08-05 實測，**尚未動工**）

上面是標準，下面是現實——動任何一款遊戲之前先知道自己站在哪裡：

| | school2 | 其餘 28 款 |
|---|---|---|
| 頁數 | 29 | 1–9 |
| 總可見字 | 213,408 | 2,258–11,428 |
| 平均／頁 | 7,359 | 610–3,928 |
| 最薄的 db 分類頁 | 1,707 | **326** |

- **全站 169 頁有 99 頁 < 1,000 可見字**（扣掉 8 個 `sim/` 這種本來就是應用程式的頁，約 90 頁是真的薄）。
- **不是預渲染壞掉**（已驗 `gen-static.js` 正常）。**是資料本身幾乎空的**：ramen 的 6 個分類各只有 3–6 列、整款 db 合計 24 列；school2 是 14 分類、29/77/65/60/50/40 列。加厚要從 `db/data.js` 的**列**下手，不是從樣板。
- **10 款單頁遊戲還沒有 `db/`**：`soccer-club`／`game-dev-story`／`stables`／`kingdom`／`grand-prix`／`dungeon-village`／`8bit-farm`／`beastie-bay`／`high-sea-saga`／`arcade`。
- 這與 AdSense 當初判「低價值內容」是同一件事——school2 已修，28 款未修。

## 適合模擬器 / 計算器 / 資料庫 的遊戲分類

- **格子擺放型 → 佈局模擬器**：口袋學院2(已有)、大江戶、都市大亨2(樓層)、溫泉、夢想小鎮、遊樂園、動物園、機場、大農場、忍者村、太空殖民地、開拓勇者村。判定規則各異(4×4 窗口 / 相鄰 / 配對 / 樓層)，引擎須參數化。
- **配方/組合型 → 計算器**：遊戲發展國(已有搜尋表)、拉麵、甜點、壽司、漢堡、客滿餐廳、時尚洋裝。
- **RPG/育成型 → 資料庫/圖鑑**：大海賊、神秘島、賽車、賽馬、足球。

## 遊戲內導覽(店中店)

進入任一款遊戲的任一頁，站台 header 下方會自動出現**該遊戲自己的功能列**(`.game-bar`)：遊戲 emoji ＋ 中／日名稱 ＋ 各分頁(攻略總覽／模擬器／資料庫／…)，並標示目前所在頁；分頁多的收進「更多」下拉。目的是讓每款遊戲像獨立的「店中店」，而不是一堆互相跳轉的散頁。

- **頁面端不需任何設定**：`shell.js` 由網址 `kairosoft/<id>/…` 推導出遊戲與所在層級，自動算出相對連結。只要照樣板呼叫 `Shell.mount({...})` 就會有。
- **資料來源**：`assets/shell.js` 裡的 `GAME_NAV` 區塊，由 `node scripts/gen-game-nav.js` **掃描實際檔案**產生(遊戲名／emoji／色系取自 `games-index.js`)。**新增或刪除子頁後要重跑這支腳本**，否則功能列不會出現新分頁。
- **新的子頁 slug** 要先在 `scripts/gen-game-nav.js` 的 `LABELS` 加中文標籤與圖示，否則產生時會警告並略過。
- **功能列版面**：`main` **最多 4 項**（含腳本硬加的第一項「攻略總覽」），其餘子頁一律收進「更多攻略▾」下拉。
  - 第 4 項幾乎一定是 `db/`——**「資料庫」跨 29 款出現在同一個位置**是一致性紅線，不要為了塞別的頁把它擠掉。
  - 4 項版**只適用子頁量足夠撐起主線的遊戲**（目前只有 school2：攻略總覽／`start/` 開局指南／`sim/` 模擬器／`db/` 資料庫）。其餘 28 款只有 `db/` 與 `sim/`，`main` 自然是 3 項，本規則對它們零影響。
  - 下拉依 `LABELS` 的 `group` 分成 `tool`（工具／查表型專題）與 `guide`（主題攻略）兩群，**群組小標由 `shell.js` 在 group 值「變動」時插入** → `LABELS` 裡同一個 group 的項目**必須連續宣告**，否則同一個小標會被插兩次。
  - **`LABELS` 的宣告順序就是排序依據**（`main` 的左右順序與下拉的上下順序都是）。改順序＝改導覽，別把新 slug 隨手加在表尾。
- **新增子頁後也要在 `scripts/gen-related.js` 的 `RELATED` 加精選連結**（game → 頁面 slug → 3 個相關頁，含 href／icon／標題／一句短描述）；沒設定就走 fallback（依 GAME_NAV 的上一頁／下一頁＋資料庫自動湊），品質較差。改標記或 RELATED 後重跑 `node scripts/gen-related.js` 即冪等蓋章。
  - **db 分類頁一定要明寫 key**（`'db/spots'` 這種）。db 頁的 slug 不在 `GAME_NAV` 裡，fallback 找不到自己 → 只會產出「資料庫」**一條**連結，那一格看起來像壞掉。
  - **有 `.next-step` 的頁（主線章節）也一定要明寫 key**：fallback 會照 `GAME_NAV` 抓上一頁／下一頁，等於讓「下一章」在 200px 內出現兩次。這些頁的 RELATED 只放**橫向**連結（資料表、工具），主線前後章交給 `.next-step`。
  - **不要把「頁面內嵌了這張表」的那一頁放進該 db 分類的 RELATED**：`gen-embed.js` 的 `usedby` 區塊已經自動列出全部內文入口，重複放等於同一畫面出現兩張一樣的卡。
- **全螢幕工具(模擬器)**：不套 `shell.css`、不注入站台 header/footer，改呼叫 `Shell.mountBar()`，只加一條自帶樣式的精簡功能列(含回站台鈕)。模擬器頁尾固定為：
  ```html
  <script src="../../../assets/shell.js?v=N"></script>
  <script data-shell>Shell.mountBar();</script>
  ```
  `data-shell` 屬性不可省略——`school2/scripts/check.js` 靠「無屬性的 `<script>`」找主程式。
- **快取**：改動 `shell.js` / `shell.css` / `db.js` / `home.js` 後，全站 `?v=N` 要一起加一號(目前 `?v=9`，含各頁對 `db.js`、首頁對 `games-index.js`／`home.js` 的引用)。改完 `grep -rn '?v=<舊號>'` 確認零殘留。
  - **版號分兩軌，不要混**：`/assets/*` 是 29 款同吃的共用資產，必須同號；`kairosoft/<game>/assets/*` 是**單一遊戲自己的資產，自帶版號**（例：school2 專屬的 `guide.css`／`guide.js`，兩者必須同號、目前 `?v=7`）。改一款遊戲自己的樣式**不要**跟著 bump 全站 `?v`——那只會讓 29 款無謂 cache miss；反過來 bump 全站時也不要順手把本地版號一起改。`link-check.js` 第 6 節就是照這兩軌各自斷言的。
  - 新增一個只有某一款引入的 CSS/JS 檔**不需要動全站 `?v`**（沒改共用檔）。

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
- **`pixel.css` ＋ `silkscreen-latin-400.woff2`**：8bit 視覺層(見下節)。放在共用 `/assets/` 因此吃共用 `?v` 軌，但**目前只有 school2 的 28 個攻略頁引入**。

### 8bit 視覺層(`assets/pixel.css`)

開羅遊戲本身是像素風，攻略頁跟著走同一路線。做法是**HUD 化，不是貼皮**：改的是「框、章、鈕、標籤」這類介面元件，**正文一個字都不動**。

- **token 層在 `assets/pixel.css`**：`--px-edge`／`--px-drop` 用 `color-mix` 從 `--ink`／`--card` 推導(深淺色都過對比，換 `--brand` 也免費)，`--font-pixel` 由自託管的 `PixelNum`(Silkscreen)履行，`unicode-range` **鎖死拉丁範圍** → CJK 永遠不可能落到像素字型上。`main.article { --radius: 2px }` 讓直角只作用在正文容器內。
- **像素字型的使用範圍是窮舉的**(`.statgrid b`／`.kpi-row b`／`.sec-num`／`.coord`／`.hero .pill`)，**刻意不用在 H1/H2/H3 與 `.prose` 的 p/li**：純 CJK 套了無效，只會讓標題裡的數字跟 CJK 打架、看起來像 bug。`font-synthesis: none` 是必要的——Silkscreen 只有 400 一個字重，`font-weight: 900` 會讓瀏覽器合成粗體把像素邊緣抹糊。
- **元件換皮寫在該遊戲自己的 `assets/guide.css`，不改 `shell.css`**：`.callout`／`.btn`／`.db-*` 都是 29 款共用的，用 `main.article` 提高特異度覆寫即可。分三層權重：Tier 1 浮起(按鈕、卡片、KPI 磚、地圖框)、Tier 2 只硬邊不給陰影(callout、目錄、手風琴、資料表)、Tier 3 不動(sticky `thead`、`.ad-slot`)。**陰影要節制**——每個框都浮起來等於沒有層級。
- **紅線：正文零改動**。改完要實測，不是目測：抓 `.prose` 的 p/li/h1/h2/h3，比對字型/字級/字重/行高/字距/顏色/margin 等屬性的簽章，開關 `pixel.css` 前後必須 0 差異(BV1 435 節點 × 14 屬性 0 差異)。
- `--radius` 目前**只覆寫到 `main.article` 內**，所以站台 header／遊戲功能列／footer 仍是 14px 圓角。這是刻意的：`pixel.css` 只有 school2 引入，把外框也改直角會讓 school2 與其他 28 款脫節。等 8bit 推廣到全部 29 款再一次改。

### 預渲染(SEO／AdSense 必要)

站台是純靜態 GitHub Pages，**內容不能只存在於瀏覽器端**——客戶端渲染的空殼頁會被 AdSense 判為 thin content。因此：

- `node scripts/gen-static.js` 會把 111 個 `db/**/index.html` 的 `#dbApp` 與首頁四個 `#*Grid` 容器**烤成靜態 HTML**，蓋在 `<!--prerender:start--> … <!--prerender:end-->` 之間並在容器上加 `data-prerendered`。冪等，可反覆重跑。
- **改動任一遊戲的 `db/data.js`、`assets/games-index.js`、`assets/db.js`、`assets/home.js`，或新增 db 分類頁／新遊戲後，必須重跑 `node scripts/gen-static.js`**，否則靜態內容會與資料脫節(瀏覽器也不會補救，因為已預渲染的容器不重建)。
- 預渲染區段內的 HTML 是**產生物，不要手改**；要改內容就改 `db/data.js` 或 render 函式再重跑。
- 例行順序（**產生器跑完接著跑檢查器**）：

  ```sh
  node scripts/gen-game-nav.js
  node scripts/gen-embed.js                        # school2 專用；db 表格／usedby／章節導覽
  node scripts/gen-related.js
  node scripts/gen-static.js
  node scripts/gen-sitemap.js
  node scripts/gen-og.js --stamp                   # 新頁面補 og:image（新增遊戲時不加 --stamp，會重烤圖）
  node scripts/link-check.js                       # 全站連結/錨點/canonical/麵包屑/sitemap/?v=
  node kairosoft/school2/scripts/check.js          # school2 模擬器＋sim↔db 一致性
  for t in health east lake valley hill; do node kairosoft/school2/scripts/layout-gen/verify.js $t page; done
  ```

### 分享預覽圖 `gen-og.js`

社群爬蟲（FB／X／LINE／Discord）不執行 JS，**也不吃 SVG 當 `og:image`**。所以每款遊戲各有一張 1200×630 PNG（`kairosoft/<game>/og-image.png`），非遊戲頁用根目錄的 `og-image.png`。

- 圖不是手繪的：`node scripts/gen-og.js` 用 headless Chrome 把 `games-index.js` 的 emoji／中日英名／`accent` 色系烤成卡片。**新增遊戲後重跑**（只烤某幾款：`node scripts/gen-og.js <id> …`）。
- **頁面專屬圖優先於遊戲卡**：五鎮完美佈局頁用 `layouts/<town>-og.png`（左側文案＋右側 `*-thumb.svg` 地圖）——那一頁分享出去該看到的是「那張圖長什麼樣」。要再加別的頁面專屬圖就擴 `imgFor()`。卡上的數字**一律取正本**（名稱／景點數←`layout-gen/towns.js` 的 `spots.target`，湖岸是 23 不是 29；日文名／尺寸／特色←`db/data.js` 的 `towns` 分類），不要在產生器裡重抄。
- `--stamp` 只做第二階段（不需 Chrome）：把每頁 `og:image` 指到該款的卡、補 `og:image:width/height`、把 `twitter:card` 升成 `summary_large_image`。**冪等**，新增頁面後重跑即補齊。
- **寄居在同網域但與攻略站無關的一次性頁面**（`kindergarten/`、`travel/`、`privacy/wealth_navigator.html`）刻意不給 `og:image`——預覽卡寫「開羅攻略站」是錯的資訊。名單在 `gen-og.js` 的 `NON_STATION`，`link-check.js` 第 3 節的豁免名單**必須同一組**，改一邊要改兩邊。

## 表格蓋章 `gen-embed.js`（目前 school2 專用）

攻略頁與 `db/` 常常需要**同一份事實**。正本永遠是 `db/data.js`；攻略頁只寫一行宣告，表格由建置期蓋章產生。腳本硬寫死只掃 `kairosoft/school2/`、寫檔前斷言路徑不逸出、只替換標記之間、**沒有標記的檔案一位元都不碰** → 對其他 28 款風險為 0。

三族標記，各自獨立：

| 標記 | 放哪 | 產生什麼 |
|---|---|---|
| `<!-- db:<cat> … -->` … `<!-- db:end -->` | 攻略頁 | `<figure class="db-embed">` 表格 ＋ figcaption（自動附筆數與「在資料庫開啟 →」連結） |
| `<!-- usedby:start -->` … `<!-- usedby:end -->` | db 分類頁 | 「哪些攻略用到這張表」卡片牆，由第一族的**反向索引**推導（錨點取標記前最近的 `id=`，說明取最近的 `<h2>`） |
| `<!-- chapter:start -->` … `<!-- chapter:end -->` | 主線章節頁 | `.next-step` 大卡（下一步 ＋ 上一步），由腳本頂端**單一 `CHAPTERS` 陣列**推導 |

**衍生分類（計算式檢視）**：有些表不是 db 的某個分類，而是**從分類算出來的**——例如 `db:spots-by-attr`（把 29 個景點的加成欄反轉成「想衝理系該蓋哪些」）與 `db:spots-hub`（把需要設施欄做反向索引，找出被最多景點共用的樞紐設施）。它們在 `gen-embed.js` 的 `derive()` 裡組成**形狀與真分類相同**的物件（`key`/`label`/`columns`/`rows`），所以蓋章、參數、`usedby` 全部原樣適用，只是 `rows` 是算出來的。要點：
- 衍生分類帶 `source` 指回正本分類 → figcaption 的「在資料庫開啟」與 `usedby` 都歸到來源那一頁（`db/spots` 的入口清單因此會列出這幾張衍生表，那正是讀者接下來想去的地方）。
- **`usedby` 那一輪必須跳過 `source` 分類**，否則它會拿自己那份空清單再蓋一次同一個檔，把來源剛蓋好的清單清空。
- 這類表**絕對不要手寫**：手寫版一旦與 `data.js` 脫鉤，讀者看不出它舊了（設施表的「校門（上下用）」就這樣停在改名前的字串很久）。

`db:` 的參數（全部選用，值可用雙引號或單引號——`rows=` 帶 JSON 時用單引號包）：

| 參數 | 作用 | 例 |
|---|---|---|
| `cols` | 選欄、重排、改顯示名（值仍取自 db，只換表頭字樣） | `cols="景點=人氣景點,需要設施,加成"` |
| `rows` | 選列。`{"keys":[…]}` 依給定順序取列（缺一列即報錯）；`{"col":…,"in":[…]}` 依某欄取值 | `rows='{"col":"教師","in":["開羅君"]}'` |
| `where` | 過濾，`;` 分隔多子句，運算子 `=` `!=` `~`（含）`!~`（不含） | `where="類別=戀愛"` |
| `sort` | 排序欄名，前置 `-` 為降冪（能轉數字就比數字） | `sort="-指導力(上限)"` |
| `limit` | 只取前 N 列 | `limit="10"` |
| `caption` | figcaption 文字（不給時取分類 `intro` 的第一句） | |
| `empty` | 空格印什麼 | `empty="—"` |
| `strip` | `strip="jp"` 去掉含日文假名的括號段 | 「公園散步（公園散策）」→「公園散步」 |
| `sep` | 分隔符替換，寫成 `來源>取代` | `sep="・> · "` |
| `num` | 區間寫法，`fw` 用全角 `～`、`ascii` 用 `~` | |
| `key` | 指定 key 欄，讓 `rows.keys` 的比對不依列序（預設第 0 欄） | |

**紅線：蓋章區段（`db:`／`usedby`／`chapter`／`related`／`prerender`）之內全部是產生物，一個字都不要手改。** 手改會在下一次重跑被覆蓋，而且中間那段時間頁面上的數字與資料庫不一致卻沒人知道。要改內容就改 `db/data.js`、改標記的參數，或改 `CHAPTERS`／`RELATED`，再重跑。

主線章序**只定義一次**（`gen-embed.js` 的 `CHAPTERS`）。它同時是 `.path-rail` 的站數與 `.next-step` 的前後關係，所以頁面**不要再手寫第二張「下一步」卡**。不在 `CHAPTERS` 裡卻留著 `chapter` 標記的頁，區塊會被清成一行註解（附錄頁的橫向去處交給 `related`）。**新章節頁記得引入該遊戲的 `assets/guide.css`**，否則蓋出來的 `.next-step` 沒有樣式。

## 表格與敘述交錯的紀律（硬約束）

把 db 表格複製進攻略頁，若沒有紀律就等於把薄內容搬上主力頁，正中 AdSense「大量表格包在少量文字裡」的典型判定。所以：

- **表格分兩型**：
  - **內嵌重點表**（3–8 列）：素表直接落在散文流裡，讀者不必離開句子。
  - **`.datablock`**（20–80 列）：標頭含表名／筆數／篩選框／「在資料庫開啟 →」，`max-height:70vh` 讓 sticky 表頭真的生效，視覺內凹讓眼睛能一眼跳過整塊。
- **兩個 `.datablock` 不可相鄰**：中間至少 2 段散文或一個章節邊界。
- **不可緊接 `h2`**：標題之後先給讀者一句「這節在幹什麼」。
- **每張表前後各要有原創文字**：前面說「看什麼」、後面說「怎麼用」。
- **沒有評註的表格就該刪掉，改成一句話連往 db**。表格本身不是內容，對它的判斷才是。
- **每頁 `.datablock` ≤ 6**。超過就是這一頁該拆，或該有幾張表只留連結。

## 對外文字的紀律（硬約束）

頁面是寫給玩家看的，**不是工作紀錄，也不是解題過程**。正文只回答兩件事：**怎麼做**，以及**遊戲裡為什麼是這樣**。以下五種一律不要出現：

- **不寫製作過程**：「初版把西半部四個街廓全給了農牧」「第一版就踩了這個坑」「中途試過把教室釘在這裡」「2026 年 8 月追加：…」。分界線是**講「這樣排會出什麼事」留著，講「上一版排錯了」刪掉**——同一個實測數字兩種寫法通常都成立，把立場從回顧改成建議即可。
- **不外洩內部工具術語**：「自動排版」「景點骨架」「排版器」「候選清單」，以及「驗證的『沒有無中生有的新水塘』會失敗」這種整句在講 `layout-gen`／`verify.js` 的話。改寫成遊戲端的說法（「實機蓋不出新水塘」）。
- **不做版本對版本的比較**：「蓋錯區從 17 棟降到 12 棟」比的是本站前後兩版草稿。要留這個數字就改寫成**方案對方案**或**階段對階段**。
- **不寫本站的驗證方式與資料來源分級**：「經程式逐格驗證」「本站標記存疑」「已實機核對 16 筆」「這是本站算的不是遊戲內數值」「本頁保證的是…」。讀者要的是數字本身，不是這個數字怎麼來的。資料出處統一放在**頁尾一行致謝**，不散在正文，也不另闢「誠實說明」區塊。
- **不寫敘述鷹架**：「所以…只有兩件事」「三個推論」「兩個容易被忽略的點」「結論很直接」「先說清楚」「好消息是」「要注意的是」「這代表兩件事」「最反直覺的是」「本站」「我們」。這些是在預告或解說自己的推理，讀者不需要。**動作直接寫成編號清單，理由用破折號跟在動作後面，不另起一段解釋。**

**保留**：`db/` 分類頁的「常見誤解」（那是玩家會踩的坑，不是製作過程）、「一處刻意偏離」這類**遊戲端的取捨說明**（但要寫成「這樣排會怎樣」而不是「本圖選了什麼」）。數值不確定時，直接寫成遊戲端的說法（「以你遊戲內的建設選單為準」），不要寫成本站的置信度聲明。

**原始碼註解不受此限**：`sim/index.html` 的技術理由註解對維護有用，單檔應用的原始碼就是交付物。只有自我辯解式的寫法（「這是結構性原因，不是粗心」）要改成純技術描述。

寫完掃一次（含 markdown 洩漏——HTML 裡的 `**粗體**` 會原樣顯示成星號）：

```sh
grep -rn -E "初版|第一版|前一版|中途試過|我們試過|已同步改寫|意外收穫|景點骨架|自動排版|排版器|候選清單|年 [0-9]+ 月追加" --include="*.html" kairosoft/ | grep -v "/sim/"
grep -rn -E "本站|經程式逐格驗證|實機核對|標記存疑|誠實說明|好消息是|要注意的是|結論很直接|三個推論|兩個容易被忽略|最反直覺|先說清楚" --include="*.html" kairosoft/ | grep -v "/sim/"
grep -rn '\*\*[^*]\{2,200\}\*\*' --include="*.html" kairosoft/ | grep -v "/sim/"
```

## 發布範圍（`_config.yml`）

repo 裡有一批**只在開發時用得到**的檔案，靠根目錄 `_config.yml` 的 `exclude` 擋在對外網站之外（GitHub Pages 走 Jekyll：無 `.nojekyll`、無 Actions workflow）：兩份 `CLAUDE.md`、`kairosoft/school2/scripts/`（檢查器、`layout-gen/`、`BASELINE.md`）、根目錄 `scripts/`、`sim/presets/README.md`。它們沒有任何執行期引用（`sim/presets/*.json` 只是 `check.js` 用的鏡像，頁面不 fetch），排除後只影響對外網址。**新增同類文件時要補進那張表**，否則內部文件會有公開網址。

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
- 實測數字全部記在 **`kairosoft/school2/scripts/BASELINE.md`**（連結數/錨點數/各頁字數表/
  8 組分享碼/TYPE_KEYS 長度/兩軌版號，以及「上線後不可逆項目 ↔ 守衛」與「已知後續項」）。數字有變動而不是刻意改的，就是回歸。
  **做完會改動那些數字的批次要重跑兩支檢查器並更新它**——過期的基線比沒有基線更糟：真的回歸會被當成正常、正常又會被當成回歸。

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
