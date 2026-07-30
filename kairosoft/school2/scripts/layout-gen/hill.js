/* 百靈山丘完美佈局 — 設定檔。實際流程都在 builder.js（城鎮無關）。
   執行：node hill.js  → 產生 code-hill.txt（26×26，分享碼帶 26x26; 前綴）＋ zones-hill.json

   百靈山丘的地形特徵與對應決策（設計文件 design-hill.md 的實作）：
   - 整個初始校園（體育館／網球場×2／籃球場／教室／辦公室／便利商店／販賣機×2＋東門）
     坐落在東北高地 elev3 上，與低地之間**全部是 2 層落差的懸崖**——全圖唯一的 16 格
     elev2 在正中央的小山丘環帶，跟高台不相鄰。因此地圖天然分成兩張互不相通的網：
       高台網＝既有東門 gate @ r8–9,c25；低地網＝沒有門，必須自己加開南門。
     模擬器／verify 的可達性是「所有校門的聯集」，兩網各自有門就 0 包圍。
   - **開局就有 4 棟被田埂路圈死**（gym / tennis×2 / basketball）：高台的 18 格 aze_path
     在模擬器裡不可通行，把球場環整個圍起來。第 0 步就是把這 18 格覆蓋成走廊（沿用原高度
     elev3），球場環才接得回東門的 asphalt。這是本鎮佈局的前提，不做就有 4 棟走不到。
   - **低地必須自帶校門**：南門 gate_h @ r25,c8–9。而且門要在 D.build 的 prepare() 裡就加，
     不能等到 fill 之後——parcels() 是用「可達性」判斷哪些格能蓋建築，沒門的話整個低地
     都會被判成 green（只能種草），design2 一棟都放不下。
   - **既有 9 棟全部原地沿用、拆除 0 棟**：4×4 景點窗口完全不檢查高度與可達性，所以可以
     「崖下開窗、借高台材料」——體育館借給熱血、辦公室借給選舉、便利商店借給購物/澀谷。
     這是五鎮裡初始資產利用率最高的一張圖。
   - **中央山丘一格都不能碰**：16 格 elev2 環帶＋高地頂外圈 8 格都是「原始地形推導出來的
     斜坡」，是黃昏景點的唯一 slope 來源兼丘頂唯一動線。路網／填充／綠化都只動 elev1，
     所以天生不會被壓到；verify 的「原始斜坡未被蓋掉」會把這 24 格逐格盯著。
   - **水塘一格不鑿**（maxCarve = 0）：水面都記錄在 elev3，鑿掉只會留下對四鄰都是崖的
     elev3 孤格，毫無收益。
   - 西北高地（rows 0–6 × c5–10）是純景觀：elev3 對 elev1 全是懸崖、又沒有 elev2 可以
     長坡道，玩家永遠上不去。但草地／森林／水塘是環境磚、不吃包圍判定，而且 4×4 窗口
     不管可達性 —— 水岸與力量就是靠崖下開窗借它的水塘／森林／草地成立的。 */
require('./towns.js').select('hill');
const E = require('./engine.js');
const D = require('./design2.js');
const B = require('./builder.js');

/* 0) 田埂路 → 走廊（保留原高度）。高台的 18 格 aze_path 不可通行，把球場環圈死；
      layRoads 只鋪 elevation === 1，所以這一步一定要自己做。 */
function coverAzePath(g) {
    const cells = [];
    for (let r = 0; r < E.gridRows; r++) for (let c = 0; c < E.gridCols; c++) {
        if (g[r][c].type !== 'aze_path') continue;
        g[r][c] = { type: 'wood_path', elevation: g[r][c].elevation };
        cells.push([r, c]);
    }
    console.log('  田埂路覆蓋成走廊：' + cells.length + ' 格（救出高台被圈死的球場環）');
    return cells;
}

/* 1) 分區設定：key = 街廓左上角 'r0,c0'
      stage = 解鎖階段（1 農村 → 4 名門），design2 用它做街廓的階段偏好與硬規則。
      mat   = 鄰接街道的鋪面（builder.paveMaterials 用）：
              教學／生活／專科／商店街／運動＝走廊 wood_path，農牧／公園／水岸＝道路 asphalt。
      ※ 只在「真的要保護的開局核心」與南半部後期區宣告 stage，其餘中立
        （健康鎮／冬郵實測：宣告太多會把階段 3 的景點全趕進南半部，棟數大跌）。 */
const ZONES = {
    // ── 低地西北：水岸區（借西北高地的水塘／森林／草地開窗）
    '0,0': { name: '北西水岸區', fac: ['toilet', 'well', 'board', 'rock', 'bench'], green: 'flower', stage: 1, mat: 'asphalt' },
    '4,0': { name: '北西水岸區', fac: ['well', 'toilet', 'bench', 'board', 'vending'], green: 'grass', stage: 1, mat: 'asphalt' },
    // 西北高地緣：只有零星幾格低地（含 r3,c8 的 1 格深坑），綠化為林
    '0,5': { name: '西北高地緣', fac: [], green: 'woods', mat: 'asphalt' },
    '4,5': { name: '西北高地緣', fac: [], green: 'woods', mat: 'asphalt' },
    // ── 低地西側機能帶（崖腳的窄長地）
    '0,10': { name: '西機能帶', fac: ['locker', 'broadcast', 'weather', 'game_corner'], green: 'grass', mat: 'wood_path' },
    '4,10': { name: '西機能帶', fac: ['career', 'multi_room', 'vending', 'water'], green: 'grass', mat: 'wood_path' },
    // ── 體育崖下（gym 的崖下借位窗 W(1,14)：游泳池＋足球場在這裡）
    '0,15': { name: '體育崖下', fac: [], green: 'grass', stage: 4, mat: 'wood_path' },
    '4,15': { name: '體育崖下', fac: [], green: 'grass', stage: 4, mat: 'wood_path' },
    // ── 高台（設施靠 preplace 手放，街廓本身沒有 elev1 可用格）
    '0,20': { name: '高台北園', fac: [], green: 'grass', mat: 'wood_path' },
    '0,25': { name: '高台北園', fac: [], green: 'grass', mat: 'wood_path' },
    '8,15': { name: '舊校舍高台', fac: [], green: 'grass', stage: 1, mat: 'wood_path' },
    '8,20': { name: '行政高台', fac: [], green: 'grass', stage: 1, mat: 'asphalt' },
    // 東緣的兩塊孤立口袋（rows 4–7 × c21–25，兩網皆不可達）→ 景觀化
    '4,20': { name: '東緣口袋', fac: [], green: 'woods', mat: 'wood_path' },
    '4,25': { name: '東緣口袋', fac: [], green: 'woods', mat: 'wood_path' },
    // ── 低地新校區：教學／生活／專科三帶
    '8,0': { name: '教學區', fac: ['class', 'class'], green: 'flower', decor: true, stage: 2, mat: 'wood_path' },
    '11,0': { name: '教學區', fac: ['class', 'class', 'class', 'class'], green: 'flower', decor: true, stage: 2, mat: 'wood_path' },
    '8,5': { name: '生活館', fac: ['water', 'nurse', 'tea_room', 'toilet'], green: 'grass', stage: 2, mat: 'wood_path' },
    '11,5': { name: '生活館', fac: ['home_ec', 'incinerator', 'water', 'nurse', 'toilet', 'locker'], green: 'grass', stage: 2, mat: 'wood_path' },
    '8,10': { name: '專科館', fac: ['music', 'science', 'incinerator', 'art'], green: 'grass', stage: 3, mat: 'wood_path' },
    '11,10': { name: '專科館', fac: ['computer', 'mole', 'multi_room', 'science', 'music', 'incinerator'], green: 'grass', stage: 3, mat: 'wood_path' },
    // ── 崖下商店街（借便利商店開窗）／崖下行政區（借辦公室開窗）
    '11,15': { name: '崖下商店街', fac: [], green: 'grass', stage: 3, mat: 'wood_path' },
    // fac 刻意留空：這個街廓 preplace 完只剩 r13–14,c22 兩格，它們是崖下行政區唯一的
    // 南北動線（茶室／宇宙火箭都靠它接到 AV r15），蓋滿就會有 2 棟走不到。
    '11,20': { name: '崖下行政區', fac: [], green: 'grass', stage: 3, mat: 'wood_path' },
    '8,25': { name: '東緣崖下', fac: [], green: 'grass', mat: 'wood_path' },
    '11,25': { name: '東緣崖下', fac: ['bench', 'vending'], green: 'grass', mat: 'wood_path' },
    // ── 低地中段：農牧／池畔／山丘公園／運動園區
    // 農牧園區與池畔綠帶宣告 stage 1：菜園與水岸都是開局景點，材料（小農場／飲水處／
    // 水井／洗手間）全部一開始就能建，宣告了「階段 × 分區」表才會把它們歸到對的分區。
    '16,0': { name: '農牧園區', fac: ['chicken', 'rabbit', 'duck', 'mole', 'water'], green: 'grass', stage: 1, mat: 'asphalt' },
    '16,5': { name: '農牧園區', fac: ['farm', 'pig', 'cow', 'chicken', 'duck', 'rabbit'], green: 'grass', mat: 'asphalt' },
    '16,10': { name: '池畔綠帶', fac: ['bench', 'board'], green: 'grass', stage: 1, mat: 'asphalt' },
    '16,15': { name: '山丘公園', fac: ['bench'], green: 'grass', mat: 'asphalt' },
    '16,20': { name: '運動園區', fac: ['dojo', 'club', 'trampoline', 'field', 'baseball', 'soccer', 'locker'], green: 'grass', stage: 3, mat: 'wood_path' },
    '16,25': { name: '東緣步道', fac: ['bench'], green: 'grass', mat: 'asphalt' },
    // ── 南帶：農牧南區／南門廣場／中央公園／名門・開羅・動物園（後期三連區）
    '22,0': { name: '農牧南區', fac: ['farm', 'chicken', 'duck', 'rabbit', 'mole', 'pig', 'cow'], green: 'grass', stage: 3, mat: 'asphalt' },
    '22,5': { name: '南門廣場', fac: ['board', 'bench', 'statue_br', 'vending'], green: 'flower', mat: 'asphalt' },
    '22,10': { name: '中央公園', fac: ['azalea', 'bench', 'statue_br'], green: 'grass', stage: 2, mat: 'asphalt' },
    '22,15': { name: '名門區', fac: ['statue_br', 'computer', 'tea_room'], green: 'grass', stage: 4, mat: 'wood_path' },
    // 開羅君三件套與動物園（青空／非洲）合成一個街廓：本鎮的 COL_BANDS 在南帶只切到 c23，
    // 再往東只剩 c25 一欄，排不下第二組三件套，所以兩個主題並置在 rows22–25 × c20–23。
    '22,20': { name: '開羅・動物園區', fac: ['panda', 'koala', 'croc'], green: 'grass', stage: 4, mat: 'asphalt' },
    '22,25': { name: '東南步道', fac: ['bench'], green: 'grass', stage: 4, mat: 'asphalt' }
};

/* 2) 手放清單（preplace）——本鎮的招牌手法「崖下借位窗」與「高台北園 7 棟」都必須精準落位，
      交給 design2 的街廓填充會落在窗口外。preplace 在 layRoads / prepare 之後、parcels()
      之前執行，所以這些格子會自動從街廓的可用名單裡消失（parcels 只收 empty 格）。
      D.place 保留該格原本的高度，所以「放在高地上」與「砍掉森林／覆蓋田埂」都是同一個動作。

      A. 高台北園 7 棟（fillPlateau 只吃 1×1、而且本圖高台不是它開的，只能手放）：
         砍 5 格森林（r0,c20／r2,c19／r3,c19／r2,c24／r3,c24），窗內留 r0,c21–22 森林當約會材料。
           約會 W(0,19)：tennis(r2–3,c20)＋woods(r0,c21–22)＋library(r0,c19–20)
           運動 W(0,19)：basketball(r2–3,c21)＋field(r2,c19)＋vending(r3,c19)
           時尚 W(0,22)：tennis(r2–3,c22)＋art(r0,c23)＋home_ec(r0,c24)
           熱情 W(1,21)：basketball＋incinerator(r2,c24)＋soccer(r3,c24)
      B. 崖下借位窗（建築全在低地 elev1，只是窗口罩到高台的既有設施）：
           熱血 W(1,14)：gym(高台 r1–2,c16–17)＋pool(r3–4,c15–16)＋soccer(r3,c14)
           選舉／學習／宇宙 都在 W(11,21)＝rows11–14 × cols21–24：
             office(高台 r11,c21–22)＋principal(r10–11,c23)＋tea_room(r13,c21)
             ＋av_room(r10–11,c24)＋library②(r12,c23–24)＋rocket(r13,c23)＋planetarium(r14,c23)
             ※ r13,c22 與 r14,c22 **必須留空**：那是崖下行政區唯一的南北動線
               （北邊 r12,c21–22 是高台的原生花壇、不可通行），蓋掉就有 2 棟走不到。
           購物 W(11,16)：convenience(高台 r11–12,c17–18)＋cafeteria(r12–13,c19–20)＋shop(r14,c19)
           特盛 W(12,16)：cafeteria＋pig(r14,c17)＋cow(r14,c18)
           吃醋 W(12,19)：cafeteria＋home_ec③(r14,c20)＋incinerator②(r14,c21)
           澀谷 W(11,15)：convenience＋soccer②(r14,c15)＋club(r14,c16)
      C. 三個「零成本窗口」（本鎮唯一必須手放的原因：水岸需要水塘，而 design2 找不到
         現成水塘的零成本窗口時會**自己蓋一格水塘**，那會違反 maxCarve = 0 的
         「不能無中生有新水塘」。把三組材料釘在現成的水塘／森林／草地旁邊，
         design2 掃到 cells = 0 就不會另外造水）：
           水岸 W(16,10)：中央山丘旁的原生水塘(r17–19,c10–11)＋toilet(r16,c10)＋well(r16,c11)
           力量 W(0,5) ：西北高地的原生草地(r1,c7–8)＋森林(r2,c8)＋well(r0,c8)
           埋伏 W(0,0) ：board(r0,c2)＋rock(r2,c2)＋toilet(r1,c3)
           菜園 W(16,0)：farm(r16,c1)＋water(r16,c2)＋grass(r16,c3)
                        （不釘的話 design2 會把小農場排進西北角的水岸街廓） */
const PREPLACE = [
    // A. 高台北園（elev3，砍 5 木）
    { t: 'library', r: 0, c: 19 },      // 2×1 → r0,c19–20
    { t: 'field', r: 2, c: 19 },
    { t: 'vending', r: 3, c: 19 },
    { t: 'art', r: 0, c: 23 },
    { t: 'home_ec', r: 0, c: 24 },
    { t: 'incinerator', r: 2, c: 24 },
    { t: 'soccer', r: 3, c: 24 },
    // B1. 體育崖下（熱血）
    { t: 'soccer', r: 3, c: 14 },
    { t: 'pool', r: 3, c: 15 },         // 2×2 → r3–4,c15–16
    // B2. 崖下行政區（選舉／學習／宇宙）
    { t: 'principal', r: 10, c: 23 },   // 1×2 → r10–11,c23（全校唯一）
    { t: 'av_room', r: 10, c: 24 },     // 1×2 → r10–11,c24
    { t: 'library', r: 12, c: 23 },     // 2×1 → r12,c23–24
    { t: 'tea_room', r: 13, c: 21 },
    { t: 'rocket', r: 13, c: 23 },
    { t: 'planetarium', r: 14, c: 23 },
    // B3. 崖下商店街（購物／特盛／吃醋／澀谷）—— 整排都靠南邊的 AV r15 崖下大道進出
    { t: 'cafeteria', r: 12, c: 19 },   // 2×2 → r12–13,c19–20
    { t: 'soccer', r: 14, c: 15 },
    { t: 'club', r: 14, c: 16 },
    { t: 'pig', r: 14, c: 17 },
    { t: 'cow', r: 14, c: 18 },
    { t: 'shop', r: 14, c: 19 },
    { t: 'home_ec', r: 14, c: 20 },
    { t: 'incinerator', r: 14, c: 21 },
    // C. 零成本窗口（擋掉 design2「自己蓋一格水塘」的衝動）
    { t: 'toilet', r: 16, c: 10 },
    { t: 'well', r: 16, c: 11 },
    { t: 'well', r: 0, c: 8 },
    { t: 'board', r: 0, c: 2 },
    { t: 'toilet', r: 1, c: 3 },
    { t: 'rock', r: 2, c: 2 },
    { t: 'farm', r: 16, c: 1 }, { t: 'water', r: 16, c: 2 }, { t: 'grass', r: 16, c: 3 },
    // 生活館一個街廓吃下好友／家庭／燒水三個景點（同窗 W(9,5)，c5 與 c8 留走道）
    { t: 'water', r: 9, c: 6 }, { t: 'nurse', r: 9, c: 7 },
    { t: 'tea_room', r: 10, c: 6 }, { t: 'home_ec', r: 10, c: 7 },
    { t: 'toilet', r: 11, c: 6 }, { t: 'incinerator', r: 11, c: 7 },
    /* D. 南半部後期三連區＋運動園區。design2 挑街廓的主排序是「要動的格數最少」，
       同格數才比階段偏好；本圖每一組都是 3 格，於是先掃到的西側街廓永遠贏，
       名門／開羅／青空／非洲會全部跑到西北角去（實測如此）。這幾組直接釘死在
       南帶，敘事（校門廣場 → 年級棟 → 農牧運動 → 南帶名門區）才站得住。 */
    { t: 'dojo', r: 16, c: 20 }, { t: 'trampoline', r: 16, c: 21 }, { t: 'club', r: 16, c: 22 },          // 動作 W(16,20)
    { t: 'azalea', r: 22, c: 10 }, { t: 'bench', r: 22, c: 11 }, { t: 'grass', r: 22, c: 12 },            // 清爽 W(22,10)
    { t: 'statue_br', r: 22, c: 15 }, { t: 'statue_gold', r: 22, c: 16 }, { t: 'computer', r: 22, c: 17 },// 名門 W(22,15)
    { t: 'kairo_gold', r: 22, c: 20 }, { t: 'kairo_statue', r: 22, c: 21 }, { t: 'kairo_room', r: 22, c: 22 }, // 開羅 W(22,20)
    { t: 'giraffe', r: 23, c: 20 }, { t: 'totem', r: 23, c: 21 },                                          // 青空／非洲 W(22,20)
    { t: 'elephant', r: 23, c: 22 }, { t: 'statue_br', r: 23, c: 23 }
];

/* 3) 景點骨架（鋪路 → 田埂覆蓋＋加開南門 → 手放 → 街廓填景點） */
const res = D.build(B.spotOrder(), {
    zones: ZONES,
    prepare(g) {
        coverAzePath(g);
        // 低地網唯一的門。一定要在 parcels() 之前加，否則整個低地會被判成走不到、
        // 一棟建築都排不下（parcels 用可達性決定哪些格是 slots）。
        if (!B.addGate(g, 25, 8, 'gate_h')) throw new Error('南門加不上去');
        console.log('  加開南門：gate_h @ X27/Y19–18（低地門網唯一入口，富人區開局多 40 萬正好付這筆）');
        /* 三個原生孤立口袋（r3,c8 深坑／c19 峽谷 r4–7／東緣 rows5–7 × c21–25，共 14 格）
           在門加好之後就能一次判出來，這時先種樹封起來。**一定要在 parcels() 之前做**：
           模擬器的包圍判定只看「鄰格是可通行且從任一校門走得到」，不看高低差，所以
           口袋裡的建築會因為隔著 2 層懸崖鄰接高台走廊而「判定合格、實際走不到」。
           實測不封的話 design2 會把音樂室／理科室排進東緣口袋（怪談跑到 X4/Y6）。 */
        landscapeDeadPockets(g, true);
    },
    preplace: PREPLACE
});
const g = res.g;

/* 3b) 街廓排不下的景點 → 滑動 4×4 窗口補位（本鎮可覆蓋田埂路／櫻花當裝飾） */
B.fallbackAll(g, res, B.DECOR_EAST);

/* 4) 分區填充 */
B.fill(g, res, ZONES, 'grass', B.DECOR_EAST);

/* 5) 丘頂展望台：中央山丘 elev3 的 9 格裡只有正中央 r18,c15 不是斜坡（其餘 8 格都
      鄰接 elev2、依規則自動判成斜坡，一蓋就毀掉登頂動線）。那一格放一張長椅當展望台。
      ※ 高地其他區塊不呼叫 fillPlateau：西北高地永遠上不去（elev3 對 elev1 全是崖、
        沒有 elev2 能長坡道），東北高台的設施已由 preplace 精準手放。 */
if (B.guarded(g, { r: 18, c: 15, w: 1, h: 1 }, 'bench')) console.log('  丘頂展望台：長椅 @ X20/Y12');

/* 6) 收尾：斷頭路改鋪草地 → 走不到的低地口袋一律種樹景觀化
      （本鎮有 14 格原生孤立口袋：r3,c8 深坑、c19 峽谷 r4–7、東緣 rows5–7 × c21–25。
        兩網都走不到，留著「看起來能走其實走不到」的草地只會誤導讀圖。
        西北高地那 16 格原生草坡刻意保留 —— 它是水岸／力量的窗內材料，
        也是玩家在遊戲裡本來就看得到、碰不到的風景，頁面會照實說明。） */
B.tidyUnreachable(g);
landscapeDeadPockets(g);

/* 走不到的低地口袋 → 種樹景觀化。withEmpty = true 時連空地也封（prepare 階段用，
   目的是讓 parcels() 根本看不到那些格子）；收尾階段只處理已經鋪成路／草的斷頭格，
   空地交給 B.fill 的死角綠化。elevation > 1 的原生高地草坡一律不動。 */
function landscapeDeadPockets(gg, withEmpty) {
    const reach = E.computeReachability(gg);
    let n = 0;
    for (let r = 0; r < E.gridRows; r++) for (let c = 0; c < E.gridCols; c++) {
        const cell = gg[r][c];
        if (cell.elevation !== 1) continue;                    // 原生高地草坡保留
        if (!E.PASSABLE.has(cell.type)) continue;
        if (!withEmpty && cell.type === 'empty') continue;
        if (reach && reach[r][c] >= 0) continue;
        const before = { spots: E.activeSpots(gg).size, blocked: E.blockedBuildings(gg).count };
        gg[r][c] = { type: 'woods', elevation: 1 };
        const after = { spots: E.activeSpots(gg).size, blocked: E.blockedBuildings(gg).count };
        if (after.spots < before.spots || after.blocked > before.blocked) gg[r][c] = cell; else n++;
    }
    if (n) console.log('  走不到的低地口袋種樹景觀化：' + n + ' 格');
}

/* 7) 材質重鋪 pass（景點中立）：幹道脊椎鋪道路、其餘街道依鄰接街廓的 mat、
      體育館／泳池／道場門前鋪水泥廣場 */
B.paveMaterials(g, { zones: ZONES, spine: E.town.spine });

/* 8) 驗證＋分享碼＋預覽＋分區產物 */
B.report(g, '百靈山丘完美佈局', 'code-hill.txt');
B.writeZones(ZONES, 'zones-hill.json');
