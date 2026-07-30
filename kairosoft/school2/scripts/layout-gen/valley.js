/* 溪谷小鎮完美佈局 — 設定檔。實際流程都在 builder.js（城鎮無關）。
   執行：node valley.js  → 產生 code-valley.txt（26×26，分享碼帶 26x26; 前綴）＋ zones-valley.json

   溪谷小鎮是五鎮裡唯一的「三層地形」：谷底 e1 292 格／台地 e2 220 格／高地 e3 164 格，
   有 52 條高差 2 的崖線（舊校舍臺地南壁、東峽谷兩壁、南池環崖）。對應決策：

   - **開局要先擦 3 格才走得通**：原始地形從北門(X2/Y5–6)出發只走得到 16 格，
     原生教室／養雞／辦公室／多媒體／公告欄／飼育鱷魚 6 棟全被判「走不到」。
     原因是校門道路（e3 柏油）不是空地 → 推導不出斜坡，兩側又是高差 2 的裂谷。
     擦掉 X4/Y6、X4/Y5 兩格原生道路與 X9/Y20 一格原生草地後，三處各長出一道坡道，
     628 個可通行格有 613 格可達、0 棟被包圍（天然坡道 136 → 139）。這是本鎮的核心謎題。
   - **櫻並木全數保留**：X3/Y7、X5/Y7、X6/Y7、X3/Y4 四棵原生櫻花樹是「約會」的材料，
     而且全在 e3，DECOR 不含 sakura、鋪路也只鋪 e1 → 不會被動到。
   - **兩座水塘全保留**（pond.maxCarve = 0）：北池只有 6 格、緊貼舊校舍草坪，本身就是
     「水岸」的材料；南池的水面記錄在 e3 而四周是 e1，鑿掉只會留下一根對四鄰都是崖的
     e3 孤柱，毫無收益。
   - **坡道保留帶**：r13（X15）與 r15（X17）兩條全寬 e2 天然坡道帶是谷底↔南平原的唯一
     樓梯，夾在中間的 r14（X16）是換坡平台。三列都在 e2 → layRoads（只鋪 e1）與
     B.fill（只填街廓內的 e1 空地）天生不會碰；本檔也刻意不把 r13–r15 放進任何
     fillPlateau 區，讓它們整列保持空地。收尾有斷言檢查可達格數沒有崩掉。
   - **多媒體教室的唯一出入口是東峽谷**：原生多媒體(X9–10/Y8) 在 e3，西鄰的走廊口袋走不到、
     北鄰是田埂路，只剩 X9/Y7 與 X10/Y7 兩格 e1 峽谷格能「臨接」它。這兩格屬街廓 '5,20'，
     靠 builder 的放置守衛（被包圍建築不可變多）自動保住。
   - **舊校舍臺地肩（e2，19 格）**是學習／選舉／約會三個景點的共用舞台，但台地在 e2、
     切不出街廓（parcels 只吃 e1 空地）→ 校長室／圖書室／網球場／茶室用 preplace 預放。
   - **星空台**：東南丘丘頂只有 X24/Y3、X24/Y2 兩格非坡格，多媒體#2 放在丘下的 e2
     （兩格同高）→ 街廓 '25,25' 的判定窗口（X24–27/Y2–5）剛好把三件材料一次框住，
     「宇宙」因此零成本成立、不必重複蓋第二座火箭。 */
require('./towns.js').select('valley');
const E = require('./engine.js');
const D = require('./design2.js');
const B = require('./builder.js');

/* ── 0) 開局工程：橡皮擦 3 格 ────────────────────────────────────────────────
   玩家一開始就有橡皮擦，這是「動土之前的第 0 步」。擦掉後那格變成該高度的空地，
   遊戲會自動把它判成斜坡（斜坡是高低差推導的，不是存下來的）。 */
const ERASE = [
    [2, 21],  // X4/Y6  原生道路 → 對西鄰 X4/Y7(e2) 生成坡道 → 接舊校舍臺地肩
    [2, 22],  // X4/Y5  原生道路 → 對東鄰 X4/Y4(e2) 生成坡道 → 接東緣廊帶 → 下谷底
    [7, 7]    // X9/Y20 原生草地 → 對西鄰 X9/Y21(e2) 生成坡道 → 舊校舍臺地接西中台地帶
];

/* ── 1) 分區設定：key = 街廓左上角 'r0,c0' ───────────────────────────────────
   溪谷有 220+164 格在 e2/e3，切不出街廓，所以「有 e1 空地的街廓」只有 26 個。
   沒有 e1 空地的街廓（台地肩、舊校舍核心、校門口、東緣草坡…）照樣要登記名字，
   因為 gen-assets.js 的「階段 × 分區」表是用街廓帶反查分區名的。

   stage 除了「開局核心」（北門 → 舊校舍臺地 → 東峽谷 → 谷底北口）宣告 1 之外，
   谷底與南半部也照擴張敘事宣告了 2/3/4；西溪綠廊、北支谷、南緣步道、東緣草坡那些
   長條自然帶刻意留白＝中立。實測：完全不宣告南半部 → 147 棟，照下面這樣宣告 → 150 棟
   （階段偏好只是同分時的 tiebreaker，把景點推去語意對的街廓、反而讓分區的設施位空得下來）。
   mat = 鄰接街道的鋪面（builder.paveMaterials 用）：
         教學／生活／舊校舍／運動＝走廊 wood_path，農牧／公園／動物園／溪谷自然帶＝道路 asphalt。 */
const ZONES = {
    /* 開局核心（stage 1）：北門半徑 6 格內。這一帶幾乎全在 e2/e3，
       fac 一律留空（原生校舍與櫻並木保留），只宣告 stage / mat。 */
    '0,10': { name: '北高地舊教室', fac: [], green: 'grass', stage: 1, mat: 'wood_path' },
    '0,15': { name: '舊校舍臺地肩', fac: [], green: 'grass', stage: 1, mat: 'wood_path' },
    '0,20': { name: '校門口櫻並木', fac: [], green: 'grass', stage: 1, mat: 'asphalt' },
    '5,10': { name: '舊校舍臺地下', fac: ['well', 'toilet', 'water'], green: 'grass', stage: 1, mat: 'wood_path' },
    '5,15': { name: '舊校舍核心', fac: [], green: 'grass', stage: 1, mat: 'wood_path' },
    // 東峽谷：X9/Y7、X10/Y7 兩格是原生多媒體唯一的出入口，fac 留空不去擠它
    '5,20': { name: '東峽谷', fac: [], green: 'grass', stage: 1, mat: 'asphalt' },

    /* 谷底三街廓＝新市街的核心（中央谷底 67 格 e1，四面被 e2/e3 圍住） */
    '10,5': { name: '北池畔公園', fac: ['bench', 'board'], green: 'grass', mat: 'asphalt' },
    '10,10': { name: '谷底生活街', fac: ['nurse', 'toilet', 'tea_room', 'water', 'club', 'soccer'], green: 'grass', stage: 2, mat: 'wood_path' },
    '10,15': { name: '谷底商店街', fac: ['shop', 'convenience', 'cafeteria', 'home_ec', 'incinerator', 'water'], green: 'flower', stage: 3, mat: 'wood_path' },
    '10,20': { name: '農牧園區', fac: ['farm', 'pig', 'cow', 'rabbit', 'duck', 'weather', 'chicken', 'mole'], green: 'grass', stage: 2, mat: 'asphalt' },

    /* 南台地帶以南＝教學與運動的新校區（南部大平原 190 格 e1） */
    '15,10': { name: '理科名門棟', fac: ['science', 'computer', 'mole', 'music'], green: 'flower', stage: 3, mat: 'wood_path' },
    // 2×2 的教室要對齊街廓象限才排得下（builder.fill 的規則），所以放在 fac 的最前面先卡位
    '15,15': { name: '教學藝術核心', fac: ['class', 'art', 'multi_room', 'home_ec', 'tennis'], green: 'flower', decor: true, stage: 3, mat: 'wood_path' },
    '15,20': { name: '教室生活東翼', fac: ['class', 'locker', 'career', 'game_corner', 'broadcast', 'vending', 'bench'], green: 'flower', decor: true, stage: 2, mat: 'wood_path' },
    '20,0': { name: '西南動物園', fac: ['giraffe', 'elephant', 'totem', 'statue_br', 'panda', 'koala'], green: 'grass', stage: 4, mat: 'asphalt' },
    '20,5': { name: '南坡公園', fac: ['bench', 'board', 'vending'], green: 'azalea', stage: 2, mat: 'asphalt' },
    '20,10': { name: '運動園區西', fac: ['gym', 'pool', 'soccer', 'basketball'], green: 'grass', stage: 3, mat: 'wood_path' },
    '20,15': { name: '運動園區東', fac: ['dojo', 'club', 'trampoline', 'field', 'vending', 'locker'], green: 'grass', stage: 3, mat: 'wood_path' },
    '20,20': { name: '開羅廣場', fac: ['bench', 'statue_br'], green: 'sakura', stage: 4, mat: 'asphalt' },

    /* 西溪帶（Y25–27 全縱深 78 格 e1）＝南北向的溪谷走廊，是唯一「不必翻台地」就從北到南
       貫通全圖的動線，所以刻意不宣告階段（中立），讓景點骨架自由使用；
       實際跑出來它變成一條細長的機能帶（運動場 → 商店街 → 社團帶），分區名照結果命名。 */
    '0,0': { name: '西溪北口', fac: [], green: 'grass', mat: 'asphalt' },
    '5,0': { name: '西溪運動場', fac: ['bench', 'statue_br'], green: 'grass', mat: 'asphalt' },
    '10,0': { name: '西溪商店街', fac: ['bench'], green: 'grass', mat: 'asphalt' },
    '15,0': { name: '西溪社團帶', fac: ['bench', 'statue_br'], green: 'grass', mat: 'asphalt' },

    /* 北支谷：只由西側 e2 台地進入的死巷小峽谷（14 格）——反而是安靜的專科棟用地 */
    '0,5': { name: '北支谷', fac: [], green: 'grass', mat: 'asphalt' },
    '5,5': { name: '北支谷藝術棟', fac: ['bench'], green: 'grass', mat: 'asphalt' },

    /* 南緣步道（X27 一整列）＋南門 */
    '25,0': { name: '南緣步道', fac: ['bench'], green: 'grass', mat: 'asphalt' },
    '25,5': { name: '南緣步道', fac: ['statue_br'], green: 'grass', mat: 'asphalt' },
    '25,10': { name: '南緣步道', fac: ['bench'], green: 'grass', mat: 'asphalt' },
    '25,15': { name: '南門廣場', fac: ['board'], green: 'grass', mat: 'asphalt' },
    '25,20': { name: '南緣步道', fac: [], green: 'grass', mat: 'asphalt' },
    '25,25': { name: '星空台', fac: [], green: 'grass', stage: 4, mat: 'asphalt' },

    /* 沒有 e1 空地、切不出街廓，但要有名字（階段 × 分區表用） */
    '0,25': { name: '東緣廊帶', fac: [], green: 'grass', mat: 'asphalt' },
    '5,25': { name: '東緣草坡', fac: [], green: 'grass', mat: 'asphalt' },
    '10,25': { name: '東緣草坡', fac: [], green: 'grass', mat: 'asphalt' },
    '15,5': { name: '西高地黃昏園', fac: [], green: 'grass', stage: 3, mat: 'asphalt' },
    '15,25': { name: '東緣坡', fac: [], green: 'grass', mat: 'asphalt' },
    '20,25': { name: '星空台', fac: [], green: 'grass', stage: 4, mat: 'asphalt' }
};

/* ── 2) 景點骨架（鋪路 → 開局擦格 → 預放 → 街廓填景點）──────────────────────
   preplace 的三組都是「街廓切不到、但景點非它不可」的位置：
     ① 舊校舍臺地肩（e2）：校長室／圖書室／網球場／茶室 → 選舉＋學習＋約會三景點
        （窗口 X6/Y11 同時框住校長室、原生辦公室、茶室、圖書室、原生多媒體；
          窗口 X3/Y10 框住網球場、原生櫻花、圖書室）
     ② 東南丘（e3 丘頂 2 格非坡格）＋丘下 e2：宇宙火箭／天文館／多媒體#2 → 宇宙
     ③ 開羅廣場（e1）：開羅君之間／金開羅君／開羅君像 → 開羅
   ②③ 都刻意落在某個「真實存在的街廓」的 4×4 判定窗口內（'25,25' 與 '20,20'），
   這樣 design2 掃到那兩個景點時 missing 為空、成本 0，不會另外重複蓋一組。 */
const PREPLACE = [
    /* ① 舊校舍臺地肩。台地肩只有 19 格，而且 r6（X8）整列是不可通行的田埂路 ——
          r5（X7）那一排的唯一出入口就是 r4（X6）。所以四件套刻意排成
          「校長室佔 c16 的兩列、圖書室橫躺 c17–c18、茶室補 (5,17)」，
          讓 X6/Y8（4,19）→ X7/Y8（5,19）→ X7/Y9（5,18）→ X7/Y7（5,20，東峽谷上緣）
          這條 L 形步道整條保持空地，臺地肩一格死地都不留。 */
    { t: 'principal', r: 4, c: 16 },   // 1×2 → X6–7/Y11（全校唯一）
    { t: 'library', r: 4, c: 17 },     // 2×1 → X6/Y9–10
    { t: 'tea_room', r: 5, c: 17 },    // X7/Y10
    { t: 'tennis', r: 1, c: 19 },      // 1×2 → X3–4/Y8（避開 X2/Y7 那個校門旁的死角）
    // ② 星空台
    { t: 'rocket', r: 22, c: 24 },     // X24/Y3（丘頂非坡格）
    { t: 'planetarium', r: 22, c: 25 },// X24/Y2（丘頂非坡格）
    { t: 'av_room', r: 22, c: 22 },    // 1×2 → X24–25/Y5（丘下 e2，兩格同高）
    /* ①b 北池畔：水井＋洗手間。「水岸」的材料是水塘，而水塘在 items 裡是可畫的環境磚 ——
          放手讓 design2 去湊，它會**自己蓋一座新水塘**（verify 的「沒有無中生有的新水塘」
          就會 FAIL；實機也蓋不出水塘）。所以先把水井與洗手間釘在原生北池南岸，
          街廓 '10,5' 的判定窗口（X12–15/Y19–22）一次框住池水＋兩件設施，水岸零成本成立。 */
    { t: 'well', r: 11, c: 7 },        // X13/Y20
    { t: 'toilet', r: 11, c: 8 },      // X13/Y19
    /* ②b 新校區的兩棟教室（2×2）。builder.fill 要求 2×2 對齊街廓象限，而溪谷的南半部
          街廓有一整列在 e2 台地上（可用列只剩 3 列），對齊後就排不下教室了 ——
          直接預放在教學藝術核心與教室生活東翼的中央，讓分區名字對得上內容。 */
    { t: 'class', r: 16, c: 16 },      // 2×2 → X18–19/Y10–11
    { t: 'class', r: 17, c: 20 },      // 2×2 → X19–20/Y6–7
    // ③ 開羅廣場
    { t: 'kairo_room', r: 20, c: 20 }, // X22/Y7
    { t: 'kairo_gold', r: 20, c: 21 }, // X22/Y6
    { t: 'kairo_statue', r: 21, c: 20 }// X23/Y7
];

const res = D.build(B.spotOrder(), {
    zones: ZONES,
    preplace: PREPLACE,
    prepare(g) {
        // 開局的橡皮擦工程（鋪路只動 e1，這三格都在 e3，不會被路蓋掉）
        ERASE.forEach(([r, c]) => { g[r][c] = { type: 'empty', elevation: g[r][c].elevation }; });
        const reach = B.countReachable(g);
        console.log('  開局擦 3 格 → 可達格 ' + reach + '、被包圍建築 ' + E.blockedBuildings(g).count + ' 棟');
    }
});
const g = res.g;

/* 2b) 街廓排不下的景點 → 滑動 4×4 窗口補位。
      DECOR 用保守的預設（不含 sakura）：櫻並木是「約會」的材料，一棵都不能覆蓋。 */
B.fallbackAll(g, res);

/* 3) 第二座校門：原本只有北門(X2/Y5–6)，南平原走過去要繞整張圖。
      南門開在下緣 X27/Y8–9，正對 c19 縱幹道；先加門再填充，讓綠化守衛保護門口動線。 */
B.addGate(g, 25, 18, 'gate_h', res);

/* 4) 分區填充（谷底、南平原、西溪帶） */
B.fill(g, res, ZONES, 'grass');

/* 5) 高地／台地開發：每列最外側留步道接坡道，中間才蓋設施（逐格放置 → 只能列 1×1）。
      刻意不含 r13–r15（坡道保留帶）與舊校舍臺地（原生草坪＝力量／菜園的材料）。
      walkMat：公園性質＝草地小徑，校舍性質＝走廊，校門動線＝道路。 */
B.fillPlateau(g, [
    { name: '北緣台地花園', rows: [0, 3], cols: [4, 10], fac: ['tea_room', 'career', 'multi_room', 'game_corner', 'board', 'toilet', 'vending', 'water', 'locker', 'bench', 'statue_br'], green: 'sakura', walkMat: 'grass' },
    { name: '北高地舊教室', rows: [0, 2], cols: [11, 17], fac: ['broadcast', 'game_corner', 'locker', 'board'], green: 'sakura', walkMat: 'wood_path' },
    // ※ 舊校舍臺地肩刻意不開發：19 格裡有 7 格是校長室／圖書室／茶室／網球場，
    //   剩下的全是「唯一一條 L 形步道」，多蓋一棟就會把 X7 那排連同東峽谷上緣封成死地。
    // ※ 東緣廊帶只開發 r2 以南：r0–r1 的 X2–X3/Y2–Y4 夾在北門與原生櫻花之間，
    //   蓋下去就變成走不到的口袋。
    { name: '東緣廊帶', rows: [2, 5], cols: [23, 25], fac: ['board', 'vending', 'bench', 'toilet'], green: 'sakura', walkMat: 'asphalt' },
    { name: '西中台地帶', rows: [4, 12], cols: [4, 6], fac: ['statue_br', 'board', 'water', 'locker'], green: 'grass', walkMat: 'grass' },
    // 西高地＝黃昏景點的舞台（天然坡在東西兩緣＋南緣，坡格 fillPlateau 會自動跳過）
    { name: '西高地黃昏園', rows: [15, 19], cols: [4, 9], fac: ['baseball', 'field', 'trampoline', 'club', 'soccer', 'water', 'toilet', 'bench', 'statue_br'], green: 'sakura', walkMat: 'grass' },
    { name: '東南坡展望', rows: [19, 25], cols: [21, 25], fac: ['bench'], green: 'azalea', walkMat: 'grass' }
]);

/* 6) 收尾：斷頭路改鋪草地。
      ※ 溪谷不跑這一步：本鎮唯一走不到的鋪面就是舊校舍臺地上那 8 格**原生走廊口袋**
        （X9–X11/Y9–Y12，被辦公室、多媒體與高差 2 的崖夾死，結構性無解），
        把它改鋪草地並不會讓玩家多走到一格，只會把原生校舍的樣子改掉。留著照實說明。 */

/* 6b) 走不到的口袋改種樹林：分區綠化是逐格鋪草地的，偶爾會在窄長的西溪帶留下
       一格被建物圍住的草地 —— 看起來能走、其實走不到。改種樹林（不可通行）就誠實了。
       守衛照舊：景點不可少、被包圍建築不可變多，過不了就留著草地。 */
(function tidyPockets() {
    const reach = E.computeReachability(g);
    let n = 0;
    for (let r = 0; r < E.gridRows; r++) for (let c = 0; c < E.gridCols; c++) {
        if (g[r][c].elevation !== 1 || g[r][c].type !== 'grass' || reach[r][c] >= 0) continue;
        const before = { spots: E.activeSpots(g).size, blocked: E.blockedBuildings(g).count };
        g[r][c] = { type: 'woods', elevation: 1 };
        if (E.activeSpots(g).size < before.spots || E.blockedBuildings(g).count > before.blocked)
            g[r][c] = { type: 'grass', elevation: 1 };
        else n++;
    }
    if (n) console.log('  走不到的草地口袋改種樹林：' + n + ' 格');
})();

/* 7) 材質重鋪 pass（景點中立）：幹道脊椎鋪道路、其餘街道依鄰接街廓的 mat、
      體育館／泳池／道場門前鋪水泥廣場 */
B.paveMaterials(g, { zones: ZONES, spine: E.town.spine });

/* 8) 坡道保留帶斷言（設計文件的 R2 風險）：綠化與鋪面都會把空地變成非空地，而斜坡是
      「空地 ＋ 高差 1」推導出來的 —— 鋪一格草地就能殺掉一整條坡道，builder 的守衛
      只保「景點不可少、建物不可被包圍」，不保「通行格連通」。所以這裡自己斷言三件事：
        ① 原始地形的每一格天然坡道都還是坡道（r13 X15 全寬坡、r15 X17 坡、西高地兩緣…）
        ② r14（X16）換坡平台至少留一格可通行，谷底↔南平原才跨得過去
        ③ 可達通行格沒有比「擦 3 格」的基準掉太多 */
(function assertRamps() {
    const base = E.loadTerrain();
    ERASE.forEach(([r, c]) => { base[r][c] = { type: 'empty', elevation: base[r][c].elevation }; });
    const lost = [];
    let slopes = 0;
    for (let r = 0; r < E.gridRows; r++) for (let c = 0; c < E.gridCols; c++) {
        if (!E.isSlopeIn(base, r, c)) continue;
        slopes++;
        if (!E.isSlopeIn(g, r, c)) lost.push('X' + E.gameX(r) + '/Y' + E.gameY(c) + '→' + g[r][c].type);
    }
    if (lost.length) throw new Error('坡道被覆蓋 ' + lost.length + ' 格：' + lost.join('、'));
    const cross = [];
    for (let c = 0; c < E.gridCols; c++)
        if (g[14][c].elevation === 2 && E.PASSABLE.has(g[14][c].type)) cross.push('Y' + E.gameY(c));
    if (!cross.length) throw new Error('X16 換坡平台被填滿，谷底與南平原斷鏈');
    /* 「走不到的通行格」才是動線指標（建築與花壇會把通行格變不見，可達格總數本來就會降）。
       溪谷的結構性死地是 15 格：舊校舍走廊口袋 8 格（被建物與崖夾死）＋東緣草坡 7 格
       （原生草地不是空地、長不出坡道）。超過就是佈局把某條路封死了。 */
    const reachMap = E.computeReachability(g);
    const un = [];
    for (let r = 0; r < E.gridRows; r++) for (let c = 0; c < E.gridCols; c++)
        if (E.PASSABLE.has(g[r][c].type) && reachMap[r][c] < 0) un.push('X' + E.gameX(r) + '/Y' + E.gameY(c));
    console.log('  坡道斷言：' + slopes + ' 格天然坡道全數保留｜X16 換坡口 ' + cross.length +
        ' 格（' + cross.join('、') + '）｜走不到的通行格 ' + un.length + '：' + un.join('、'));
    if (un.length > 15) throw new Error('走不到的通行格 ' + un.length + ' 格（結構性死地只有 15 格）：' + un.join('、'));
})();

/* 9) 驗證＋分享碼＋預覽＋分區產物 */
B.report(g, '溪谷小鎮完美佈局', 'code-valley.txt');
B.writeZones(ZONES, 'zones-valley.json');
