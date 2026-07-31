/* 溪谷小鎮完美佈局 — 設定檔（分區優先 zone-first 架構）。實際流程都在 builder.js（城鎮無關）。
   執行：node valley.js  → 產生 code-valley.txt（26×26，分享碼帶 26x26; 前綴）＋ zones-valley.json

   溪谷是五鎮裡唯一的「三層地形」：谷底 e1 292 格／台地 e2 220 格／高地 e3 164 格，
   52 條高差 2 的崖線。**街廓只能從 e1 空地切出來**（parcels 只吃 e1），所以本鎮的分區
   規劃是「先按三層地形分層，再在每一層裡劃語意成塊的分區」：

     e3 高地：校門臺地（原生柏油路＝天生的玄關）／舊校舍臺地（原生校舍＋草坪）／
              北高地舊教室／西高地（運動高台）／東南丘（星空台）／東緣草坡
     e2 台地：北緣台地花園／西中台地帶／舊校舍臺地肩／東緣廊帶／r13–r15 坡道保留帶
     e1 谷底：西溪綠廊（唯一南北貫通的谷底走廊）／北支谷／中央谷底新市街／
              南平原（運動園區＋南教學區＋南池水岸＋南門）

   四種鋪面的語意（見 README「分區優先」）：
     走廊 wood_path ＝校舍內（舊校舍→谷底新市街→南教學區，全圖唯一一塊連續的室內分區）
     道路 asphalt   ＝對外（校門玄關、東峽谷外道、南門幹道脊椎）
     水泥地 concrete ＝戶外運動（南運動園區四個街廓，含西高地運動臺）
     草地 grass     ＝自然（西溪綠廊的農牧、東緣草坡、南池水岸、東南丘）

   ★ 幹道脊椎在本鎮**必然斷成兩截**：兩座校門隔著兩層台地，而 paveMaterials 只動
     elevation === 1 的格子 —— 北門那一截是**原生 e3 柏油路**（16 格，一格都不用鋪），
     南門那一截是 c19 縱幹道（r16–r24）＋ r24 橫幹道（c15–c20）。誠實記在頁面上。 */
require('./towns.js').select('valley');
const E = require('./engine.js');
const D = require('./design2.js');
const B = require('./builder.js');

/* ── 0) 開局工程：橡皮擦 6 格 ────────────────────────────────────────────────
   玩家一開始就有橡皮擦，這是「動土之前的第 0 步」。擦掉後那格變成該高度的**空地**，
   而斜坡是「空地＋高差 1」推導出來的（不是存下來的）→ 遊戲自動長出一道坡道。
   一格 elevation 都不動、也不碰水塘。

   ★ 這一版從 3 格加到 6 格，多出來的 3 格全部是為了**可達性**：
     可達性的判定在 2026-07 補上了「真的踏得進去」（canStep 落差判定），
     於是原生多媒體教室／公告欄／飼育鱷魚三棟被抓出「驗證通過、實機走不到」——
     它們貼著台地邊，鄰接的走廊在懸崖上方，學生跨不過落差。
     一格橡皮擦換一棟原生校舍真的走得到，是本鎮最划算的交易。 */
const ERASE = [
    // ① 校門西坡：原生道路 → 對西鄰 X4/Y7(e2) 生成坡道 → 舊校舍臺地肩（門內玄關）
    [2, 21],  // X4/Y6
    // ② 校門東坡：原生道路 → 對東鄰 X4/Y4(e2) 生成坡道 → 東緣廊帶 → 東峽谷 → 谷底
    [2, 22],  // X4/Y5
    // ③ 舊校舍草坪西坡：原生草地 → 對西鄰 X9/Y21(e2) 生成坡道 → 原生養雞小屋＋辦公室
    [7, 7],   // X9/Y20
    /* ④ 舊校舍走廊坡（可達性）：原生**田埂路** → 對北鄰 X7/Y9(e2) 生成坡道 →
          打通舊校舍臺地上那 8 格原生走廊口袋 → **原生多媒體教室與公告欄真的走得到**。
          舊版把這 8 格當「結構性死地」整份豁免，其實只差這一格。 */
    [6, 18],  // X8/Y9
    /* ⑤ 東南崖坡（可達性）：原生竹林 → 對北鄰 X15/Y4(e2) 生成坡道 →
          **原生飼育鱷魚真的走得到**（它四鄰只有兩格竹林同高，其餘都是差一階的崖）。 */
    [14, 23], // X16/Y4
    /* ⑥ 東緣草坡（動線）：原生草地 → 對西鄰 X11/Y3(e2) 生成坡道 →
          復活 7 格東緣草坡 → **走不到的通行格 = 0**（溪谷第一次做到）。
          舊版刻意不擦、讓擦格數停在 3，代價是頁面得長期解釋 7 格假草皮。 */
    [9, 25]   // X11/Y2
];

/* ── 1) 分區設定（zone-first）：key = 街廓左上角 'r0,c0' ───────────────────────
   街廓格線 ＝ towns.js 的 ROW_BANDS × COL_BANDS：
     R0=[0,3] R1=[5,8] R2=[10,13] R3=[15,18] R4=[20,23] R5=[25,25]
     C0=[0,3] C1=[5,8] C2=[10,13] C3=[15,18] C4=[20,23] C5=[25,25]

   ★ 分區是第一公民、鋪面是分區的表達。**每個街廓都宣告 mat**（沒有無主的街道），
     同語意街廓必須相鄰成塊。溪谷的分區配置圖（6×6 街廓）：

            C0        C1          C2          C3          C4          C5
     R0   西溪北源   北緣台地花園  北高地舊教室  舊校舍臺地肩  校門玄關     東緣廊帶
     R1   西溪農牧   北支谷專科棟  谷底北口     舊校舍核心   東峽谷外道   東緣草坡
     R2   西溪牧場   北池畔公園   谷底教學棟   谷底生活街   谷底商店街   東緣草坡
     R3   西溪綠道   西高地運動臺  南運動園區北  南教學核心   南教學東翼   東緣坡
     R4   西南動物園  南運動園區西  南運動園區東  南池水岸     開羅廣場     東南丘
     R5   南緣步道   南緣步道     南緣步道     南門玄關     南緣步道     星空台

   四塊語意各自成塊：
     · 走廊（室內）＝ 舊校舍臺地 → 谷底新市街 → 南教學區，**10 個街廓連成一整片**
     · 水泥地（運動）＝ R3C1／R3C2／R4C1／R4C2 四個街廓的 2×2 方塊
     · 草地（自然）＝ 西溪綠廊整條 C0（＋南緣步道）與 東緣崖坡→南池→東南丘 兩條帶
     · 道路（對外）＝ 校門玄關＋東緣廊帶＋東峽谷（北門）與 南門玄關（南門）

   fac = **右尺寸化**：一個 4×4 街廓 = 16 格 = 4 座 2×2（要對齊四象限）或 16 座 1×1。
         括號裡標的是該街廓實際可用的 e1 空地數與 2×2 象限數（實測值）。 */
const ZONES = {
    /* ── 北門與舊校舍（開局核心，幾乎全在 e2/e3 → 切不出街廓，fac 一律空） ── */
    // 校門 gate_h @ r0,c21–22 與門內 8 格原生柏油路都在 e3：地圖自己就寫著「玄關鋪道路」
    '0,20': { name: '校門玄關', fac: [], green: 'grass', stage: 1, mat: 'asphalt' },
    // 東緣廊帶（e2）：擦掉 X4/Y5 後長出的東坡，是北門下谷底的必經走廊
    '0,25': { name: '東緣廊帶', fac: [], green: 'grass', stage: 1, mat: 'asphalt' },
    // 舊校舍臺地肩（e2，11 格）：校長室／圖書室／茶室／網球場走 PREPLACE（見 2）
    '0,15': { name: '舊校舍臺地肩', fac: [], green: 'grass', stage: 1, mat: 'wood_path' },
    // 舊校舍核心（e3）：原生辦公室／多媒體教室／公告欄＋8 格原生走廊口袋（擦 X8/Y9 打通）
    '5,15': { name: '舊校舍核心', fac: [], green: 'grass', stage: 1, mat: 'wood_path' },
    // 北高地舊教室（e3）：原生教室 2×2；剩下的空地交給 fillPlateau（步道鋪走廊）
    '0,10': { name: '北高地舊教室', fac: [], green: 'grass', stage: 1, mat: 'wood_path' },
    /* 東峽谷外道（e1，5 格）：X9–X10/Y7 與 X8–X10/Y4 兩條**一格寬的裂谷**，
       是北門臺地下到谷底唯一的陸路。green 刻意用 wood_path（＝鋪面）而不是植栽：
       這幾格必須保持可通行，而且落在本街廓內 → 材質 pass 會直接鋪成道路（對外通路）。 */
    '5,20': { name: '東峽谷外道', fac: [], green: 'wood_path', stage: 1, mat: 'asphalt' },

    /* ── 西溪綠廊（C0 整條，Y25–Y27 全縱深 78 格 e1）─────────────────────────
       全圖唯一「不必翻台地」就從北貫通到南的谷底走廊，而且只有 3 格寬 ——
       農牧與動物設施全是 1×1，這裡是全鎮最會長棟數的分區。整條宣告草地。 */
    '0,0': { name: '西溪北源', fac: ['well', 'weather', 'farm', 'rabbit', 'duck', 'bench'], green: 'grass', mat: 'grass' },        // 12 格
    '5,0': { name: '西溪農牧', fac: ['farm', 'chicken', 'rabbit', 'duck', 'mole', 'weather', 'well', 'bench'], green: 'grass', mat: 'grass' },  // 12 格
    '10,0': { name: '西溪牧場', fac: ['pig', 'cow', 'farm', 'chicken', 'duck', 'mole', 'rabbit', 'well'], green: 'grass', mat: 'grass' },       // 12 格
    '15,0': { name: '西溪綠道', fac: ['bench', 'statue_br', 'well', 'farm', 'weather'], green: 'grass', mat: 'grass' },            // 12 格
    /* 西南動物園（14 格／3 象限）：長頸鹿＋大象＋圖騰柱＋銅像 → 青空／非洲。
       稀有動物（熊貓／無尾熊）都不是任何景點的材料，擺在最深處＝後期開發。 */
    '20,0': { name: '西南動物園', fac: ['giraffe', 'elephant', 'totem', 'statue_br', 'panda', 'koala', 'statue_gold', 'bench'], green: 'grass', stage: 4, mat: 'grass' },
    '25,0': { name: '南緣步道', fac: ['bench', 'statue_br'], green: 'grass', mat: 'grass' },

    /* ── 北緣台地／北支谷（e2 台地與只從西側 e2 進得去的死巷小峽谷）────────── */
    // rows0–3 c5–8 幾乎全是 e2 台地（只有 X5/Y19 一格 e1）→ 交給 fillPlateau
    '0,5': { name: '北緣台地花園', fac: ['bench'], green: 'grass', stage: 2, mat: 'grass' },
    // 北支谷（e1 死巷，4 格＝剛好一座 2×2）：安靜的專科棟
    '5,5': { name: '北支谷專科棟', fac: ['music'], green: 'grass', stage: 2, mat: 'wood_path' },
    // 谷底北口（6 格）：舊校舍臺地正下方的生活機能小街 → 好友（飲水處＋保健室＋茶室）
    '5,10': { name: '谷底北口', fac: ['nurse', 'water', 'tea_room', 'toilet', 'career', 'broadcast'], green: 'grass', stage: 2, mat: 'wood_path' },
    '5,25': { name: '東緣草坡', fac: [], green: 'grass', mat: 'grass' },

    /* ── 中央谷底新市街（rows 10–13，四面被 e2/e3 圍住的 67 格 e1）──────────── */
    // 北池畔公園（4 格）：原生北池 6 格緊貼在北，水井＋洗手間走 PREPLACE → 水岸
    '10,5': { name: '北池畔公園', fac: ['bench', 'board'], green: 'grass', stage: 2, mat: 'grass' },
    '10,10': { name: '谷底教學棟', fac: ['science', 'computer', 'career', 'broadcast', 'statue_br', 'statue_gold'], green: 'flower', stage: 2, mat: 'wood_path' },   // 12 格／2 象限
    '10,15': { name: '谷底生活街', fac: ['home_ec', 'multi_room', 'nurse', 'water', 'toilet', 'game_corner'], green: 'flower', stage: 3, mat: 'wood_path' },        // 12 格／2 象限
    '10,20': { name: '谷底商店街', fac: ['cafeteria', 'convenience', 'shop', 'vending', 'incinerator', 'game_corner'], green: 'flower', stage: 3, mat: 'wood_path' }, // 12 格／2 象限
    '10,25': { name: '東緣草坡', fac: [], green: 'grass', mat: 'grass' },

    /* ── 南運動園區（水泥地）：R3C1／R3C2／R4C1／R4C2 四個街廓的 2×2 方塊 ───────
       六座 2×2（操場／棒球場／足球場／體育館／道場／游泳池）就要 6 個象限，
       實測這四個街廓剛好給得出 6 個（1＋3＋2，另加西高地的高台）。 */
    // 西高地運動臺（e3，19 格非坡格）：棒球場＋櫻花走 PREPLACE → 黃昏（崖坡＋櫻花＋棒球場）
    '15,5': { name: '西高地運動臺', fac: [], green: 'grass', stage: 3, mat: 'concrete' },
    '15,10': { name: '南運動園區北', fac: ['dojo', 'club', 'trampoline', 'locker'], green: 'woods', stage: 3, mat: 'concrete' },   // 6 格／1 象限
    '20,5': { name: '南運動園區西', fac: ['field', 'basketball', 'club', 'trampoline'], green: 'woods', stage: 3, mat: 'concrete' }, // 8 格／2 象限
    '20,10': { name: '南運動園區東', fac: ['soccer', 'gym', 'pool', 'club', 'trampoline'], green: 'woods', stage: 4, mat: 'concrete' }, // 14 格／3 象限

    /* ── 南教學區（走廊）：坡道帶以南的新校舍，兩個街廓連成一塊 ─────────────── */
    '15,15': { name: '南教學核心', fac: ['art', 'career', 'broadcast', 'locker'], green: 'flower', stage: 3, mat: 'wood_path' },   // 12 格／2 象限（教室走 PREPLACE）
    '15,20': { name: '南教學東翼', fac: ['multi_room', 'game_corner', 'vending', 'bench', 'locker'], green: 'flower', stage: 3, mat: 'wood_path' }, // 12 格／2 象限

    /* ── 南池與東南丘（草地）：東緣崖坡一路接下來的自然帶 ───────────────────── */
    // 南池水岸（12 格）：原生南池 10 格的南岸與東岸 → 水岸／清爽（映山紅＋草地＋長椅）
    '20,15': { name: '南池水岸', fac: ['well', 'toilet', 'bench', 'statue_br', 'incinerator'], green: 'azalea', stage: 3, mat: 'grass' },
    // 開羅廣場（5 格）：開羅君三件套走 PREPLACE（三件都是 1×1、對分區語意中性）
    '20,20': { name: '開羅廣場', fac: ['bench'], green: 'grass', stage: 4, mat: 'grass' },
    '20,25': { name: '東南丘', fac: [], green: 'grass', stage: 4, mat: 'grass' },
    '15,25': { name: '東緣坡', fac: [], green: 'grass', mat: 'grass' },

    /* ── 南緣（X27 一整列，只有 1 格深）＋南門 ────────────────────────────── */
    '25,5': { name: '南緣步道', fac: ['bench', 'statue_br'], green: 'grass', mat: 'grass' },
    '25,10': { name: '南緣步道', fac: ['bench', 'vending'], green: 'grass', mat: 'grass' },
    '25,15': { name: '南門玄關', fac: ['board', 'bench'], green: 'grass', stage: 3, mat: 'asphalt' },
    '25,20': { name: '南緣步道', fac: ['bench'], green: 'grass', mat: 'grass' },
    '25,25': { name: '星空台', fac: [], green: 'grass', stage: 4, mat: 'grass' }
};

/* ── 2) 預放（PREPLACE）───────────────────────────────────────────────────────
   兩類非放不可：
   ① **街廓切不到的位置**（e2/e3 上的景點舞台）—— parcels 只從 e1 空地切街廓。
   ② **不是任何景點材料的建築**（教室）—— 景點骨架沒有理由蓋它，分區填充輪到時
      位置已被吃光，實測整張圖只會剩原生那一間。 */
const PREPLACE = [
    /* ①a 舊校舍臺地肩（e2，11 格）＝選舉＋學習＋約會三個景點共用一個舞台。
          校長室全校唯一，「學習」（校長室＋圖書室＋多媒體）與「選舉」（校長室＋辦公室＋茶室）
          都要它，而**原生辦公室與原生多媒體教室就在南邊的 e3 上** —— 兩個景點因此零新建。
          排法必須讓臺地肩的動線活著：X4/Y6 擦出來的坡道落在 X4/Y7，門內第一格是
          (2,20)→(2,19)→(3,19)→(3,18)→(3,17) 這條 e2 步道，網球場刻意放 c18 的
          r1–r2（不是 r2c19），不然一擦完坡道就被自己的網球場堵死。 */
    { t: 'principal', r: 4, c: 16 },    // 1×2 → X6–7/Y11（全校唯一）
    { t: 'library', r: 4, c: 17 },      // 2×1 → X6/Y9–10
    { t: 'tea_room', r: 5, c: 17 },     // X7/Y10
    { t: 'tennis', r: 1, c: 18 },       // 1×2 → X3–4/Y9（約會＝網球場＋原生櫻花＋圖書室）
    /* ①b 北池畔：水井＋洗手間。「水岸」的材料是水塘，而水塘在 items 裡是可畫的環境磚 ——
          放手讓 design2 去湊，它會**自己蓋一座新水塘**（verify 的「沒有無中生有的新水塘」
          就會 FAIL；實機也蓋不出水塘）。釘在原生北池南岸，街廓 '10,5' 的判定窗口
          （X12–15/Y19–22）一次框住池水＋兩件設施，水岸零成本成立。 */
    { t: 'well', r: 11, c: 7 },         // X13/Y20
    { t: 'toilet', r: 11, c: 8 },       // X13/Y19
    /* ①c 西高地運動臺（e3）＝黃昏（樹林／櫻花＋斜坡＋棒球場）。
          棒球場是 2×2，而 fillPlateau 逐格放置、只吃 1×1 —— 高台上的大型球場只能預放。
          西高地四緣天然全是坡道（崖坡），窗口 X18–21/Y20–23 一次框住棒球場＋崖坡＋櫻花。 */
    { t: 'baseball', r: 16, c: 6 },     // 2×2 → X18–19/Y20–21（e3 非坡格）
    { t: 'sakura', r: 18, c: 6 },       // X20/Y21 一棵櫻花（黃昏的窗內材料）
    /* ①d 東南丘星空台（e3 丘頂只有 X24/Y2–Y3 兩格非坡格）＝宇宙。
          天象館是 2×1、丘頂剛好兩格；宇宙火箭與多媒體教室#2 退到丘下的 e2 平台，
          三件材料全部落在街廓 '25,25' 夾進地圖後的判定窗口（X24–27/Y2–5）內 →
          design2 掃到「宇宙」時 missing 為空、成本 0，不會重複蓋第二座火箭。 */
    { t: 'planetarium', r: 22, c: 24 }, // 2×1 → X24/Y2–3（丘頂）
    { t: 'av_room', r: 23, c: 22 },     // 1×2 → X25–26/Y5（丘下 e2，兩格同高）
    { t: 'rocket', r: 24, c: 23 },      // X26/Y4（丘下 e2）
    /* ①e 開羅廣場（e1）：三件 1×1 落在街廓 '20,20' 的判定窗口（X22–25/Y4–7）內 */
    { t: 'kairo_room', r: 20, c: 20 },  // X22/Y7
    { t: 'kairo_gold', r: 20, c: 21 },  // X22/Y6
    { t: 'kairo_statue', r: 21, c: 20 },// X23/Y7
    /* ② 教室（2×2）。教室不是任何景點的材料，卻決定各年級容納人數 ——
          「一間教室的學校」既不合理也擋住學生上限。南教學區兩個街廓各釘一間，
          佔掉 4 個象限中的 2 個，剩下的交給景點骨架。 */
    { t: 'class', r: 17, c: 15 },       // 2×2 → X19–20/Y11–12
    { t: 'class', r: 17, c: 22 }        // 2×2 → X19–20/Y4–5
];

/* ── 3) 景點骨架（鋪路 → 開局擦格 → 預放 → 街廓填景點）──────────────────────── */
const res = D.build(B.spotOrder(), {
    zones: ZONES,
    preplace: PREPLACE,
    prepare(g) {
        // 開局的橡皮擦工程（layRoads 只鋪 e1，這 6 格都在 e3，不會先被路蓋掉）
        ERASE.forEach(([r, c]) => { g[r][c] = { type: 'empty', elevation: g[r][c].elevation }; });
        console.log('  開局擦 ' + ERASE.length + ' 格 → 可達格 ' + B.countReachable(g) +
            '、被包圍建築 ' + E.blockedBuildings(g).count + ' 棟');
    }
});
const g = res.g;

/* 3b) 街廓排不下的景點 → 滑動 4×4 窗口補位。
      DECOR 用保守的預設（不含 sakura／bamboo／aze_path）：櫻並木是「約會」的材料，
      而田埂路與竹林全在 e2/e3、補位只動 e1，本來就碰不到。 */
B.fallbackAll(g, res);

/* 4) 第二座校門：原本只有北門(X2/Y5–6)，而它在 e3 台地上、要繞兩層坡才下得到南平原。
      南門開在下緣 X27/Y8–9，正對 c19 縱幹道；先加門再填充，讓綠化守衛保護門口動線。 */
B.addGate(g, 25, 18, 'gate_h', res);

/* 5) 分區填充（西溪綠廊、谷底新市街、南平原） */
B.fill(g, res, ZONES, 'grass');

/* 6) 台地／高地開發（每列最外側留步道接坡道，中間才蓋設施；逐格放置 → 只能列 1×1）。
      刻意不含 r13–r15（坡道保留帶）與舊校舍臺地的原生草坪（＝力量／菜園的材料）。
      walkMat 跟著分區語意：公園＝草地小徑、校舍＝走廊、校門動線＝道路、運動高台＝水泥地。 */
B.fillPlateau(g, [
    { name: '北緣台地花園', rows: [0, 3], cols: [4, 10], fac: ['tea_room', 'career', 'game_corner', 'board', 'toilet', 'vending', 'water', 'locker', 'bench', 'statue_br', 'broadcast'], green: 'sakura', walkMat: 'grass' },
    { name: '北高地舊教室', rows: [0, 2], cols: [11, 17], fac: ['broadcast', 'game_corner', 'locker', 'board', 'career'], green: 'sakura', walkMat: 'wood_path' },
    // 東緣廊帶只開發 r2 以南：r0–r1 的 X2–X3/Y2–Y4 夾在北門與原生櫻花之間，蓋下去就成口袋
    { name: '東緣廊帶', rows: [2, 5], cols: [23, 25], fac: ['board', 'vending', 'bench', 'toilet', 'career'], green: 'sakura', walkMat: 'asphalt' },
    { name: '西中台地帶', rows: [4, 13], cols: [4, 6], fac: ['statue_br', 'board', 'water', 'locker', 'bench', 'weather'], green: 'grass', walkMat: 'grass' },
    // 西高地運動臺：天然坡在四緣（fillPlateau 一律跳過坡格），中間放 1×1 運動小設施
    { name: '西高地運動臺', rows: [15, 19], cols: [4, 9], fac: ['club', 'trampoline', 'locker', 'water', 'toilet', 'bench', 'vending'], green: 'sakura', walkMat: 'concrete' },
    { name: '東南坡展望', rows: [21, 25], cols: [21, 25], fac: ['bench'], green: 'azalea', walkMat: 'grass' }
]);

/* 7) 材質重鋪 pass（景點中立）：幹道脊椎鋪道路、其餘街道整段依「誰的門開在這條街上」
      決定材質。溪谷沒有跨水木棧橋，所以沒有 keep 例外。 */
B.paveMaterials(g, { zones: ZONES, spine: E.town.spine });

/* 8) 環化 pass（動線流暢優先於景點配置）：孤立通行格歸零、走不到的假動線口袋
      接上路網或改綠化、2–4 格的設計性死路支線接回成環或整條收成綠地；
      幹道脊椎／校門門面／斜坡一律豁免。開關與參數在 towns.js 的 flow。
      ★ 舊版整份豁免的 15 格「原生結構性死地」在這一版**被橡皮擦解決掉了**
        （走廊口袋 8 格靠 X8/Y9、東緣草坡 7 格靠 X11/Y2），exempt 因此清空。 */
if (E.town.flow && E.town.flow.loopify)
    B.loopify(g, Object.assign({ zones: ZONES, spine: E.town.spine }, E.town.flow));

/* 9) 坡道保留帶斷言（本鎮特有的風險，共用機具不保這一項）：
      綠化與鋪面都會把空地變成非空地，而斜坡是「空地＋高差 1」推導出來的 ——
      鋪一格草地就能殺掉一整條坡道，而 builder 的守衛只保「景點不可少、建物不可被包圍」，
      不保「通行格連通」（南邊的建築照樣各自有路，不會叫）。所以自己斷言三件事：
        ① 原始地形的每一格天然坡道都還是坡道（r13 X15 全寬坡、r15 X17 坡、西高地四緣…）
        ② r14（X16）換坡平台至少留一格可通行，谷底↔南平原才跨得過去
        ③ 擦格長出來的 6 道新坡道也一格都沒被蓋掉（不然又會有原生校舍走不到） */
(function assertRamps() {
    const base = E.loadTerrain();
    const natural = [];
    for (let r = 0; r < E.gridRows; r++) for (let c = 0; c < E.gridCols; c++)
        if (E.isSlopeIn(base, r, c)) natural.push([r, c]);
    const lost = natural.filter(([r, c]) => !E.isSlopeIn(g, r, c));
    if (lost.length) throw new Error('天然坡道被覆蓋 ' + lost.length + ' 格：' +
        lost.map(([r, c]) => 'X' + E.gameX(r) + '/Y' + E.gameY(c) + '→' + g[r][c].type).join('、'));
    const newRamps = ERASE.filter(([r, c]) => !E.isSlopeIn(g, r, c));
    if (newRamps.length) throw new Error('擦格長出來的坡道被蓋掉：' +
        newRamps.map(([r, c]) => 'X' + E.gameX(r) + '/Y' + E.gameY(c) + '→' + g[r][c].type).join('、'));
    const cross = [];
    for (let c = 0; c < E.gridCols; c++)
        if (g[14][c].elevation === 2 && E.PASSABLE.has(g[14][c].type)) cross.push('Y' + E.gameY(c));
    if (!cross.length) throw new Error('X16 換坡平台被填滿，谷底與南平原斷鏈');
    const reachMap = E.computeReachability(g);
    const un = [];
    for (let r = 0; r < E.gridRows; r++) for (let c = 0; c < E.gridCols; c++)
        if (E.PASSABLE.has(g[r][c].type) && reachMap[r][c] < 0) un.push('X' + E.gameX(r) + '/Y' + E.gameY(c));
    console.log('  坡道斷言：天然坡道 ' + natural.length + ' 格全數保留｜擦格新坡道 ' + ERASE.length +
        ' 道全數保留｜X16 換坡口 ' + cross.length + ' 格（' + cross.join('、') +
        '）｜走不到的通行格 ' + un.length + (un.length ? '：' + un.join('、') : ''));
})();

/* 10) 驗證＋分享碼＋預覽＋分區產物 */
B.report(g, '溪谷小鎮完美佈局', 'code-valley.txt');
B.writeZones(ZONES, 'zones-valley.json');
