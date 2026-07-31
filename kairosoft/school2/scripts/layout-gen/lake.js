/* 湖岸小鎮完美佈局 — 設定檔。實際流程都在 builder.js（城鎮無關）。
   執行：node lake.js  → 產生 code-lake.txt（24×24，分享碼帶 24x24; 前綴）＋ zones-lake.json

   湖岸小鎮的地形特徵與對應決策（設計文件 design-lake.md 的實作）：
   - **全圖最小、水最多**：576 格裡 146 格是水面（西大湖 r9–13 西半＋西南湖 r18–23、
     山中湖兩片 e3 水面、東北角湖），陸地只有 430 格。但**水塘一格都不鑿**（maxCarve = 0）：
     山中湖的水面記在 e3，鑿掉只會留下接不上 e1 動線的 e3 平台；東北角湖圈住的那兩格
     空地四面全水，鑿它才走得到，收益一格。
   - **南北鎖喉走廊**：北半部（北高地＋北岸帶＋中央半島）與南半部校區之間，天然只有
     r14 的 c4–c7 四格；其中 (14,4) 販賣機、(14,5) 飲水處是原生設施，真正可走的只有
     **(14,6)、(14,7)** 兩格。它們在 r14＝AV 上會被 layRoads 鋪成路、之後不再是 parcel
     的可用格，所以自動受保護；北側銜接的 **(13,6)/(13,7)** 卻落在中央半島街廓裡，
     必須手放走廊釘住，不然填充會把整條南北動線封死。
   - **第二條南北通道＝清 (13,14) 一格樹墩**：那是一格 e2 樹林，夾在 (13,13)/(12,14)/(14,14)
     三格 e1 之間。清成空地後遊戲規則自動判成斜坡（斜坡是高低差推導的），
     e1↔e2↔e1 變成一座天然踏石橋，同時打通「水井口袋」（(12,14)–(12,17)/(13,15)–(13,17)
     七格＋原生水井）並多一條南北動線。不鑿湖能達成 29/29 的關鍵就是這一格。
   - **原生鱷魚池 (7,23) 被東北角湖圈死**：四鄰是水塘與竹林，兩格空地 (5,23)/(6,22)
     彼此還是斜角、互不相鄰，玩家永遠走不到 → 判定為「被包圍的建築」。maxCarve = 0
     的前提下唯一解是拆遷，連同熊貓／無尾熊一起在北高地重建成「高原動物園」
     （這三種都不是任何景點的材料，搬家對 29/29 零風險）。
   - **北高地是一整片 e2 大高原（rows 0–6，145 格）**，南緣 r6 幾乎整列都是原生斜坡，
     天生就走得上去（不必 openPlateaus 硬開）。高原內部照 fillPlateau 的規矩開發：
     切成四條縱帶，每帶左右兩欄留草徑接坡道，中間才蓋 1×1 設施。
   - **原生游泳池是 2×2、佔 (16–17,15–16)**（2026-07 實機確認，地形資料已補正；
     初版抄錄只記了 (16,15) 一格）。它把「泳池體育館區」街廓的可用格從 10 格砍到 7 格，
     所以體育館改排在**東南側的 (17–18,17–18)**（不與泳池重疊），足球場與社團教室
     退到 r18 的 c15/c16。熱血仍在同一個街廓窗口 W(15,15) 成立（泳池＋體育館＋足球場）。
   - **埋伏的巨石可由玩家自行放置**（2026-07 實機確認）。本圖沒有原生 rock，
     巨石靠玩家在東岸步道 (12,22) 放一顆，埋伏因此照 29/29 成立。 */
require('./towns.js').select('lake');
const E = require('./engine.js');
const D = require('./design2.js');
const B = require('./builder.js');

/* 0) 整地：清掉三處卡動線的樹墩＋拆遷被湖圈死的鱷魚池。
      ※ 一定要在 parcels() 之前（也就是 prepare 裡）做完，parcels 是用可達性決定
        哪些格能蓋建築，(13,14) 沒清的話整個水井口袋都算走不到。 */
function prepareTerrain(g) {
    /* (13,14) e2 樹林 → 空地：遊戲自動判成斜坡，e1↔e2↔e1 成為踏石橋，
       一次打通「水井口袋」七格＋水井，並多開一條南北通道。 */
    g[13][14] = { type: 'empty', elevation: 2 };
    console.log('  清 (13,14) 樹墩 → e2 斜坡踏石橋：打通水井口袋＋第二條南北通道（X15/Y11）');

    /* (16,7) 樹林 → 走廊：它把舊校舍 r16 的原生走廊切成兩段。
       （(16,9)／(18,9) 兩處樹墩剛好在 ST c9 上，layRoads 已經鋪掉了；
         (16,12) 那株直接讓社團教室蓋上去，見 PREPLACE。） */
    g[16][7] = { type: 'wood_path', elevation: 1 };
    console.log('  清 (16,7) 樹墩 → 走廊：接回舊校舍 r16 走廊（X18/Y18）');

    /* 原生鱷魚池 (7,23)：四鄰是東北角湖與竹林，(5,23)/(6,22) 兩格空地互為斜角、
       彼此不相鄰，兩網都走不到 → 拆遷（改在北高地的高原動物園重建，見 fillPlateau）。 */
    g[7][23] = { type: 'woods', elevation: 1 };
    console.log('  拆遷原生鱷魚池 @X9/Y2（被東北角湖圈死，maxCarve=0 下無法接上動線）→ 北高地動物園重建');
}

/* 1) 分區設定：key = 街廓左上角 'r0,c0'
      stage = 解鎖階段（1 農村 → 4 名門），design2 用它做街廓的階段偏好與硬規則。
      mat   = 鄰接街道的鋪面（builder.paveMaterials 用）：
              教學／生活／專科／商店街／運動＝走廊 wood_path，農牧／公園／湖岸＝道路 asphalt。
      ※ 只在「真的要保護的開局核心」宣告 stage，其餘中立（健康鎮／冬郵實測：
        宣告太多會把階段 3 的景點全趕進同一帶，把設施位擠光、棟數大跌）。 */
const ZONES = {
    // ── 北高地（rows 0–4 全在 e2／e3，沒有 e1 可用格 → parcels 直接略過；
    //    列在這裡只是為了讓「階段 × 分區」表查得到分區名）
    '0,0': { name: '北高地公園', fac: [], green: 'grass', mat: 'asphalt' },
    '0,5': { name: '北高地公園', fac: [], green: 'grass', mat: 'asphalt' },
    '0,10': { name: '北高地公園', fac: [], green: 'grass', mat: 'asphalt' },
    '0,15': { name: '北高地展望台', fac: [], green: 'grass', mat: 'asphalt' },
    '0,20': { name: '東北湖岸', fac: [], green: 'woods', mat: 'asphalt' },
    // ── 北岸運動帶（r7–8，高原腳下兩列平地；黃昏就靠 r6 的原生斜坡開窗）
    '5,0': { name: '北岸運動帶', fac: ['field', 'vending', 'locker'], green: 'grass', stage: 2, mat: 'asphalt' },
    '5,5': { name: '北岸運動帶', fac: ['baseball', 'field', 'vending', 'bench'], green: 'grass', stage: 2, mat: 'asphalt' },
    '5,10': { name: '北岸運動帶', fac: [], green: 'grass', stage: 2, mat: 'asphalt' },
    '5,15': { name: '北岸運動帶', fac: ['soccer', 'bench', 'board', 'vending'], green: 'grass', stage: 2, mat: 'asphalt' },
    '5,20': { name: '東北湖岸', fac: [], green: 'woods', mat: 'asphalt' },
    // ── 中央理科半島（夾在西大湖與山中湖之間的一條 e1 陸橋）
    '10,0': { name: '西大湖', fac: [], green: 'grass', mat: 'asphalt' },
    '10,5': { name: '中央理科半島', fac: ['science', 'music', 'computer', 'mole', 'incinerator', 'multi_room'], green: 'grass', stage: 3, mat: 'wood_path' },
    '10,10': { name: '中央理科半島', fac: ['art', 'home_ec', 'tennis', 'career'], green: 'grass', stage: 3, mat: 'wood_path' },
    // 山中湖水岸＝水井口袋：水岸／力量兩個景點的窗口，材料手放（見 PREPLACE），
    // fac 刻意留空 —— 口袋只有四格餘裕，蓋滿就沒有迴轉空間了。
    '10,15': { name: '山中湖水岸', fac: [], green: 'grass', stage: 1, mat: 'asphalt' },
    // 東岸步道：埋伏三件套手放在 c22，c23 整欄留給步道（(13,22)→(14,22) 是東岸唯一出入口）
    '10,20': { name: '東岸步道', fac: [], green: 'grass', stage: 1, mat: 'asphalt' },
    // ── 校區帶
    '15,0': { name: '校門廣場', fac: [], green: 'flower', stage: 1, mat: 'asphalt' },
    '15,5': { name: '西舊校舍・生活棟', fac: ['nurse', 'tea_room', 'home_ec', 'water'], green: 'grass', stage: 1, mat: 'wood_path' },
    '15,10': { name: '東校舍運動區', fac: ['dojo', 'trampoline', 'club'], green: 'grass', decor: true, stage: 3, mat: 'wood_path' },
    // 泳池／體育館／足球場／社團教室全部手放，只剩 r16 的 c16–18 三格交給填充
    '15,15': { name: '泳池體育館區', fac: ['locker'], green: 'grass', stage: 4, mat: 'wood_path' },
    // 學術翼 16 格全部手放（見 PREPLACE），fac 留空
    '15,20': { name: '東行政學術翼', fac: [], green: 'grass', mat: 'wood_path' },
    // ── 南部帶
    '20,0': { name: '西南湖岸', fac: [], green: 'grass', mat: 'asphalt' },
    '20,5': { name: '南農牧帶', fac: ['water', 'bench', 'rabbit', 'duck', 'mole'], green: 'grass', stage: 1, mat: 'asphalt' },
    '20,10': { name: '南商業街', fac: [], green: 'grass', stage: 3, mat: 'asphalt' },
    // 名門三件套（銅像／金像／電腦室）由填充補在 c18 那一排，剛好與青空共用銅像
    '20,15': { name: '稀有動物角', fac: ['statue_gold', 'computer', 'bench'], green: 'grass', stage: 4, mat: 'asphalt' },
    '20,20': { name: '東南高台（開羅台）', fac: [], green: 'grass', stage: 4, mat: 'asphalt' }
};

/* 2) 手放清單（preplace）——三組必須精準落位的東西。
      preplace 在 layRoads / prepare 之後、parcels() 之前執行，所以這些格子會自動從
      街廓的可用名單裡消失（parcels 只收 empty 格）。

   A. 南北鎖喉走廊的北側銜接格 (13,6)/(13,7)：r14 的 (14,6)/(14,7) 因為在 AV 上會被
      鋪成路而自動受保護，但 (13,6)/(13,7) 落在中央理科半島街廓裡，不釘住就會被
      音樂室／理科室蓋掉，北半部 12 個景點的動線一次斷光。
      (13,13) 同理：它是踏石橋 (13,14) 的西側橋頭，也是半島往南的第二條出口。
   B. 水井口袋（水岸＋力量兩個景點的共用窗口 W(10,15)＝rows10–13 × c15–18）：
        水岸 pond：山中湖 (10,15)–(10,18) 原生 e3 水面
        水岸 toilet：手放 (12,15)
        水岸／力量 well：原生水井 (13,18)
        力量 woods：原生 e2 樹林 (12,18)
        力量 grass：手放 (13,16)
      不手放的話 design2 找不到「零成本水塘窗口」時會自己蓋一格水塘，
      那會違反 maxCarve = 0 的「不能無中生有新水塘」。
   C. 埋伏三件套釘在東岸步道 W(10,20)：board (10,22)／toilet (11,22)／rock (12,22)。
      c23 整欄與 (13,22) 留成草徑 —— 東岸唯一的出路是 (13,23)→(14,23)→(15,23) 再沿
      學術翼的 c23 走廊南下接 r19 橫幹道，蓋掉任一格公告欄／洗手間就走不到。
      本圖沒有原生巨石，rock 靠玩家放置（見檔頭說明）。
   D–E. 東行政學術翼／南商業街／稀有動物角／泳池體育館區／東校舍／北岸運動帶六組
      「同窗多景點」的建材：這些窗口動輒要 6–13 格，design2 的街廓填充排不出來
      （實測會把宇宙火箭、長頸鹿之類全丟到北岸去），一律手放。 */
const PREPLACE = [
    // A. 鎖喉走廊北側銜接格＋踏石橋西橋頭
    { t: 'wood_path', r: 13, c: 6 }, { t: 'wood_path', r: 13, c: 7 }, { t: 'wood_path', r: 13, c: 13 },
    // B. 水井口袋（水岸／力量）
    { t: 'toilet', r: 12, c: 15 }, { t: 'grass', r: 13, c: 16 },
    // C. 東岸步道（埋伏）
    { t: 'board', r: 10, c: 22 }, { t: 'toilet', r: 11, c: 22 }, { t: 'rock', r: 12, c: 22 },
    // c23 整欄＋(13,22) 手鋪草徑：東岸唯一的南北動線（(13,22)→(14,22)→南校區），
    // 不釘住就會被填充蓋掉，公告欄與洗手間立刻變成走不到
    { t: 'grass', r: 10, c: 23 }, { t: 'grass', r: 11, c: 23 }, { t: 'grass', r: 12, c: 23 },
    { t: 'grass', r: 13, c: 22 }, { t: 'grass', r: 13, c: 23 },
    // 水井口袋的草徑：踏石橋 (13,14) → (13,15) → 水井 (13,18) 的參道
    { t: 'grass', r: 13, c: 15 }, { t: 'grass', r: 13, c: 17 },
    /* D. 東行政學術翼 W(15,20)＝rows15–18 × c20–23：選舉／學習／宇宙三個景點共用一個窗口，
       共 13 格建材（辦公室 2×2＋校長室 1×2＋圖書室 2×1＋多媒體 1×2＋茶室＋火箭＋天象館），
       16 格裡只剩 3 格走道。逐格算過每一棟的臨路面：
         r15 靠 r14 的橫向道路、c20 靠 c19 的縱街、r18 靠 r19 的南區橫幹道，
         (15,22)/(15,23) 兩格走道從 r14 進來，正好餵給多媒體與校長室的內側格。
       這一組交給 design2 一定失敗（同窗要 13 格，任何街廓都排不出來），必須手放。 */
    { t: 'library', r: 15, c: 20 },      // 2×1 → (15,20)–(15,21)
    { t: 'av_room', r: 15, c: 22 },      // 1×2 → (15–16,22)
    { t: 'office', r: 16, c: 20 },       // 2×2 → (16–17,20–21)
    { t: 'principal', r: 17, c: 22 },    // 1×2 → (17–18,22) 全校唯一
    { t: 'tea_room', r: 18, c: 20 },
    /* c23 整欄手鋪走廊：這是全圖最關鍵的一條「不能被蓋掉的四格」——
       東岸步道（含埋伏三件套）唯一的出路是 (13,23)→(14,23)→(15,23)，
       再沿 c23 南下接 r19 橫幹道；學術翼一填滿，公告欄／洗手間／圖書室／
       校長室／多媒體五棟會同時變成走不到（實測如此）。 */
    { t: 'wood_path', r: 15, c: 23 }, { t: 'wood_path', r: 16, c: 23 },
    { t: 'wood_path', r: 17, c: 23 }, { t: 'wood_path', r: 18, c: 23 },
    /* E. 南商業街 W(20,10)＝rows20–23 × c10–13：購物／特盛／吃醋三個景點共用一個窗口。
       餐廳 2×2＋便利商店 2×2 就吃掉 8 格，加福利社／豬／牛／焚化爐／家政共 13 格，
       (23,12) 留給南門的門前走道。臨路面：c9 縱街餵西側、c14 縱街餵東側、
       r19 橫幹道餵北側、(23,9) 的空地餵 (23,10)。 */
    { t: 'cafeteria', r: 20, c: 10 },    // 2×2 → (20–21,10–11)
    { t: 'convenience', r: 20, c: 12 },  // 2×2 → (20–21,12–13)
    { t: 'shop', r: 22, c: 10 },
    { t: 'pig', r: 22, c: 12 }, { t: 'cow', r: 22, c: 13 },
    { t: 'incinerator', r: 23, c: 10 }, { t: 'home_ec', r: 23, c: 11 },
    { t: 'wood_path', r: 23, c: 12 },    // 南門門前走道
    /* E2. 稀有動物角 W(20,15)＝rows20–23 × c15–18：青空（長頸鹿＋銅像＋圖騰柱）與
       非洲（長頸鹿＋大象＋圖騰柱）共用同一組材料，四棟全排在 r20，正北就是 r19 橫幹道，
       臨路面不必另外留走道。design2 挑街廓時這兩個景點會被更便宜的西側街廓搶走，
       實測會跑到北岸去，所以直接釘死在南帶動物角。 */
    { t: 'giraffe', r: 20, c: 15 }, { t: 'totem', r: 20, c: 16 },
    { t: 'elephant', r: 20, c: 17 }, { t: 'statue_br', r: 20, c: 18 },
    /* 宇宙（火箭＋天象館＋多媒體教室）搬到動物角同一個窗口：學術翼 16 格塞不下
       第 13、14 棟，這裡的 r21–r22 剛好排得開，多媒體教室蓋第二座（1×2）。 */
    { t: 'rocket', r: 21, c: 15 }, { t: 'planetarium', r: 21, c: 16 },
    { t: 'av_room', r: 22, c: 16 },      // 1×2 → (22–23,16)
    /* E3. 泳池體育館區 W(15,15)＋澀谷借位窗 W(18,13)：
         熱血＝**原生泳池 2×2 (16–17,15–16)**＋體育館 2×2 (17–18,17–18)＋足球場 (18,15)
         澀谷＝便利商店 (20–21,12–13)＋足球場 (18,15)＋社團教室② (18,16)
       ※ 泳池實機確認是 2×2、佔 (16–17,15–16)，所以體育館**只能往東南擺**：
         (17,17)–(18,18) 是這個街廓裡唯一不壓到泳池、又四面貼得到路的 2×2
         （東邊 c19 縱街、南邊 r19 橫幹道各餵兩格；(18,18) 那株原生樹林直接蓋上去）。
       ※ r16 的 c17–c18 兩格北面全是山中湖、唯一出入口在 (16,19)，留給填充鋪草徑，
         不然 (16,17) 一定走不到。 */
    { t: 'gym', r: 17, c: 17 },          // 2×2 → (17–18,17–18)
    { t: 'soccer', r: 18, c: 15 }, { t: 'club', r: 18, c: 16 },
    /* E4. 東校舍運動區 W(15,10)：動作＝道場＋彈跳床＋社團教室①，三格橫排在 r16，
       南面就是 r17 的原生長廊。(16,12) 那株原生樹林直接讓社團教室蓋上去。 */
    { t: 'dojo', r: 16, c: 10 }, { t: 'trampoline', r: 16, c: 11 }, { t: 'club', r: 16, c: 12 },
    /* E5. 北岸運動帶 W(5,10)＝rows5–8 × c10–13：運動（操場＋籃球場＋販賣機）與
       熱情（足球場＋籃球場＋焚化爐）共用同一座籃球場，六格剛好排滿。
       籃球場是 1×2（縱向），排在 c10 靠 ST c9 的縱街；(7,11)/(7,12) 北面就是
       r6 那一整列原生斜坡（也是黃昏的 slope 來源），不必另外留走道。 */
    { t: 'basketball', r: 7, c: 10 },    // 1×2 → (7–8,10)
    { t: 'field', r: 7, c: 11 }, { t: 'vending', r: 7, c: 12 },
    { t: 'soccer', r: 7, c: 13 }, { t: 'incinerator', r: 8, c: 12 },
    /* F. 西舊校舍・生活棟 W(15,5)＝rows15–18 × c5–8：好友／家庭／燒水三個景點共用一個窗口
       （洗手間用原生的 (18,8)）。**(15,6) 一定要留成走廊** —— 它是鎖喉走廊 (14,6)/(14,7)
       唯一的南向出口，蓋掉就把北半部 12 個景點的動線全斷。 */
    { t: 'incinerator', r: 15, c: 5 }, { t: 'nurse', r: 15, c: 7 },
    { t: 'water', r: 16, c: 7 }, { t: 'tea_room', r: 16, c: 8 }, { t: 'home_ec', r: 17, c: 8 }
];

/* 3) 景點骨架（鋪路 → 整地 → 手放 → 街廓填景點） */
const res = D.build(B.spotOrder(), {
    zones: ZONES,
    prepare(g) {
        prepareTerrain(g);
        /* 第二座校門：原本只有西緣一座 (15–16,0)，南商業街／動物角走過去要繞整張圖。
           南門開在 (23,13)–(23,14)，正好接上 ST c14 這條從北岸一路下來的縱脊。
           ※ 一定要在 parcels() 之前加，不然南商業街的街廓一填滿就沒有空地放門了。 */
        if (!B.addGate(g, 23, 13, 'gate_h')) throw new Error('南門加不上去');
        console.log('  加開南門：gate_h @ X25/Y12–11（接 ST c14 縱脊，南商業街與動物角不必繞西門）');
        /* 北高地 r6 幾乎整列都是原生斜坡、本來就走得上去，所以 openPlateaus 這裡
           只是保險（若有哪塊高地圍死才會動作）。它也會順手處理清完 (13,14) 之後
           還剩的被包圍建築。 */
        B.openPlateaus(g);
    },
    preplace: PREPLACE
});
const g = res.g;

/* 3b) 街廓排不下的景點 → 滑動 4×4 窗口補位（可覆蓋竹林／櫻花等純景觀） */
B.fallbackAll(g, res, B.DECOR_EAST);

/* 4) 分區填充 */
B.fill(g, res, ZONES, 'grass', B.DECOR_EAST);

/* 6) 高地開發
      北高地（rows 0–6，145 格 e2／e3）刻意切成四條縱帶：fillPlateau 是「每一列的
      最外側留步道」，一條 20 格寬的橫帶會讓步道只剩最左最右兩格、中間整排建築彼此
      圍死。切成四帶後步道自然變成 c0／c4／c5／c9／c10／c14／c15／c19 幾條縱向草徑，
      每棟都貼得到步道。walkMat 用草地＝公園性質的自然小徑（草地本身是菜園／力量／
      清爽的材料，只會多景點不會少）。
      ※ fillPlateau 逐格放置、多格設施會被 sizeOf 判掉，所以 fac 只列 1×1。
      ※ 東南高台（rows 20–23 × c20–23）：16 格裡 7 格是原生斜坡（唯一登台動線，
        一格都不能蓋），扣掉每列左右步道後剛好剩 c22 三格 → 開羅君三件套。 */
B.fillPlateau(g, [
    { name: '北高地公園（西）', rows: [0, 6], cols: [0, 4], fac: ['bench', 'statue_br', 'board', 'tea_room', 'vending', 'rabbit', 'duck'], green: 'sakura', walkMat: 'grass' },
    /* 高原動物園：原生鱷魚池被東北角湖圈死、只能拆遷，連同熊貓／無尾熊一起在北高地
       重建成「高原動物園」（這三種都不是任何景點的材料，搬家對 29/29 零風險）。 */
    { name: '北高地公園（中西）', rows: [0, 6], cols: [5, 9], fac: ['croc', 'panda', 'koala', 'bench', 'water', 'toilet', 'statue_br', 'board', 'weather'], green: 'sakura', walkMat: 'grass' },
    { name: '北高地公園（中東）', rows: [0, 6], cols: [10, 14], fac: ['bench', 'tea_room', 'game_corner', 'broadcast', 'statue_br', 'vending', 'board'], green: 'sakura', walkMat: 'grass' },
    { name: '北高地展望台', rows: [0, 6], cols: [15, 19], fac: ['bench', 'statue_br', 'board', 'tea_room'], green: 'sakura', walkMat: 'grass' },
    { name: '東南高台（開羅台）', rows: [20, 23], cols: [20, 23], fac: ['kairo_gold', 'kairo_statue', 'kairo_room', 'bench'], green: 'grass', walkMat: 'grass' }
]);

/* 7) 收尾：斷頭路改鋪草地 → 走不到的草地口袋種樹景觀化
      （被後期建築封起來的小口袋，留著「看起來能走其實走不到」的草地只會誤導讀圖。
        草地本身是菜園／力量／清爽的材料，所以每一格都要守衛：換成樹林後景點變少就退回。） */
B.tidyUnreachable(g);
landscapeDeadPockets(g);

function landscapeDeadPockets(gg) {
    const reach = E.computeReachability(gg);
    let n = 0;
    for (let r = 0; r < E.gridRows; r++) for (let c = 0; c < E.gridCols; c++) {
        const cell = gg[r][c];
        if (cell.type !== 'grass' || reach[r][c] >= 0) continue;
        const before = { spots: E.activeSpots(gg).size, blocked: E.blockedBuildings(gg).count };
        gg[r][c] = { type: 'woods', elevation: cell.elevation };
        const after = { spots: E.activeSpots(gg).size, blocked: E.blockedBuildings(gg).count };
        if (after.spots < before.spots || after.blocked > before.blocked) gg[r][c] = cell; else n++;
    }
    if (n) console.log('  走不到的草地口袋種樹景觀化：' + n + ' 格');
}

/* 8) 材質重鋪 pass（景點中立）：幹道脊椎鋪道路、其餘街道依鄰接街廓的 mat、
      體育館／泳池／道場門前鋪水泥廣場 */
B.paveMaterials(g, { zones: ZONES, spine: E.town.spine });

/* 8b) 環化 pass（動線流暢優先於景點配置）：孤立通行格歸零、短死路支線接回成環或收枝。
       湖岸的死路大半是湖泊半島地形天生的（鎖喉走廊、中央半島死巷、東岸步道），
       towns.js 的 flow.exempt 把這些地形性死路整條釘住，pass 只收設計性的
       街廓草地口袋與門前短枝。本鎮沒有鑿水道，所以不傳 keep。 */
if (E.town.flow && E.town.flow.loopify)
    B.loopify(g, Object.assign({ zones: ZONES, spine: E.town.spine }, E.town.flow));

/* 9) 驗證＋分享碼＋預覽＋分區產物 */
B.report(g, '湖岸小鎮完美佈局', 'code-lake.txt');
B.writeZones(ZONES, 'zones-lake.json');
