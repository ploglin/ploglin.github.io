/* 冬郵小鎮完美佈局 — 設定檔。實際流程都在 builder.js（城鎮無關）。
   執行：node east.js  → 產生 code-east.txt（26×26，分享碼帶 26x26; 前綴）＋ zones-east.json

   冬郵小鎮的地形特徵與對應決策：
   - 校門在「上緣」(gate_h @ X2/Y8-Y7)，動線是由北往南展開。
   - 田埂路(aze_path)在模擬器裡不可通行，等同景觀；主幹道會直接鋪過去。
   - 北中央有一塊高地（含水塘），東側與東南是高地草坡 —— 草地不是斜坡，
     要擦掉邊界一格才會生成坡道，openPlateaus 會自動找。
   - 東南角有一塊 39 格的陸地被水塘圍住（東緣高地上還有兩間原生養豬小屋）。
     實機確認**水塘可以被建設覆蓋破壞、變回平地**，所以那不是死地：
     carveWaterChannel 會找出最省的水道把它接上動線，原生養豬小屋原地保留。
   - 五鎮裡**只有冬郵開放「破壞原生地形換動線」**（步驟 8b 的 breakTerrain 手挑清單）：
     鑿 4 格水塘（2 接進湖心 ＋ 2 補環）、砍 3 格原生植栽開坡口，死路支線 15% → 7%。
   - 稀有動物（熊貓／無尾熊／鱷魚／長頸鹿）擺在鑿通後的湖心島＝「後期動物島」，
     跟階段敘事一致（基礎農牧留西側）；這四種都不是任何景點的材料，搬島零風險。 */
require('./towns.js').select('east');
const E = require('./engine.js');
const D = require('./design2.js');
const B = require('./builder.js');

/* ── 1) 分區設定（zone-first）────────────────────────────────────────────────
   key = 街廓左上角 'r0,c0'。街廓格線是 towns.js 的 ROW_BANDS × COL_BANDS：
     R0=[0,3] R1=[5,8] R2=[10,13] R3=[15,18] R4=[20,23] R5=[25,25]
     C0=[0,3] C1=[5,8] C2=[10,13] C3=[15,18] C4=[20,23] C5=[25,25]

   ★ 新架構：**分區是第一公民**。先按地形劃出語意清楚、成塊的分區，再讓
     builder.paveMaterials 的「臨街面投票」自動把每條街鋪成對應材質。
     禁止同語意街廓被別語意夾成不相鄰的兩塊。

   mat  = 該分區的鋪面語意（四種鋪面的解鎖階段剛好對得上分區的開發階段，見 builder.js）：
            走廊 wood_path（階段 1・校舍內）＝教室／辦公室／專科／生活機能等**室內**設施
            道路 asphalt  （階段 2・對外）  ＝校門玄關與串起兩座校門的幹道脊椎
            草地 grass    （階段 3・自然）  ＝農牧／公園／水岸／稀有飼育
            水泥地 concrete（階段 4・硬鋪面）＝戶外運動園區
   stage = 解鎖階段（1 農村 → 4 名門），design2 用它做街廓的階段偏好與硬規則。
   fac   = **右尺寸化**：一個 4×4 街廓 = 16 格 = 只放得下 4 座 2×2（要對齊四象限），
           或 16 座 1×1。舊版一個街廓列 7 項（多半 2×2＝需要 28 格），於是每輪印一堆
           「無處可放」、白佔位置。設施尺寸大修正後（操場／棒球場／足球場／道場／
           電腦室／理科室／音樂室／美術室／家政室／多功能室全是 2×2）這件事變致命。

   分區配置圖（6×6 街廓）：
            C0        C1        C2        C3        C4        C5
     R0   北農牧    北農牧    北丘公園   北門玄關   北門玄關   東緣高地
     R1   北農牧    北農牧    北丘公園   舊校舍     舊校舍     東緣高地
     R2   中央教學  中央教學  中央教學   舊校舍     舊校舍     東緣高地
     R3   南運動    南運動    南運動     中央生活   中央生活   東緣高地
     R4   西南水岸  南運動    南農牧     南緣步道   湖心飼育   湖心飼育
     R5   南緣步道  南門玄關  南門玄關   南緣步道   湖心飼育   湖心飼育          */
const ZONES = {};
const zone = (keys, z) => keys.forEach(k => { ZONES[k] = Object.assign({}, z); });

/* 北門玄關（道路）：校門在 r0/c19–20，門內 r1–3/c18–20 是**原生道路** ——
   地圖自己就告訴我們「玄關該鋪道路」。只放 1×1 紀念物，不擋門。 */
zone(['0,15'], { name: '北門玄關', fac: ['board', 'bench', 'statue_br'], green: 'flower', stage: 1, mat: 'asphalt' });
zone(['0,20'], { name: '北門玄關', fac: ['bench', 'vending', 'toilet'], green: 'flower', stage: 1, mat: 'asphalt' });

/* 舊校舍（走廊）：既有校舍**全部集中在東北**四個街廓 —— 辦公室 r4–5/c21–22、
   教室 r9–10/c18–19、飲水處 r7/c17、彈跳床 r8/c22、販賣機 r9/c22、公告欄 r10/c22。
   舊版把「rows 0–3 整列六個街廓」都叫舊校舍帶，但 r0–3 的 C0/C1/C2 其實是空地與
   北丘高地，跟舊校舍無關 —— 這次按地形收斂到真正的位置。
   ※ stage 1 只給玄關＋舊校舍這 6 個街廓（跟舊版同量）：標太多的話階段 3 的景點會
     全被趕去南半部，把分區的設施位擠光（README 有實測帳）。 */
/* ※ 這兩個街廓幾乎沒有空地：滿是原生田埂路／花壇／原生道路與既有小設施，
      所以 decor:true（可覆蓋田埂路與花壇）＋只列 1×1。 */
zone(['5,15'], { name: '舊校舍', fac: ['career', 'water'], green: 'flower', decor: true, stage: 1, mat: 'wood_path' });
zone(['5,20'], { name: '舊校舍', fac: ['toilet', 'nurse'], green: 'flower', decor: true, stage: 1, mat: 'wood_path' });
zone(['10,15'], { name: '舊校舍', fac: ['class', 'computer'], green: 'flower', decor: true, stage: 2, mat: 'wood_path' });
zone(['10,20'], { name: '舊校舍', fac: ['science'], green: 'flower', decor: true, stage: 2, mat: 'wood_path' });

/* 中央教學（走廊）：R2 整列是全圖第二大片連續空地，新校舍主體 —— 專科教室幾乎
   全是 2×2，所以每個街廓只列 4 項（＝4 個象限）。 */
zone(['10,0'], { name: '中央教學', fac: ['music', 'art'], green: 'flower', decor: true, stage: 2, mat: 'wood_path' });
zone(['10,10'], { name: '中央教學', fac: ['home_ec', 'multi_room'], green: 'flower', decor: true, stage: 3, mat: 'wood_path' });

/* 中央行政（走廊）：「學習」＝校長室(1×2)＋圖書室(2×1)＋多媒體教室(1×2)，
   三件共 6 格**必須同框在一個 4×4 窗口**。舊校舍那四個街廓塞滿原生設施、
   空地零星（'5,20' 只剩 1 格），排不出這種同框；所以在中央校舍區獨立切一個
   行政街廓，把校長室／圖書室／多媒體＋進路／保健／廣播集中在一起。
   這三件都是室內設施 → 走廊，與兩側的中央教學同材質，分區不會被切碎。
   ※ 這三件走 PREPLACE 手放（見 1d），不放在 fac 裡：交給分區填充的話，景點骨架會先
     把這個街廓佔掉（實測音樂室＋理科室＋足球場＋籃球場排了進來），三件套就散到不同
     街廓、「學習」不成立。fac 只留剩下的 1×1 行政小設施。 */
zone(['10,5'], { name: '中央行政', fac: ['nurse', 'broadcast', 'career', 'toilet'], green: 'flower', decor: true, stage: 2, mat: 'wood_path' });

/* 中央生活（走廊）：校舍南翼的室內生活機能。餐廳／便利商店是 2×2，先列它們再列 1×1。 */
zone(['15,15'], { name: '中央生活', fac: ['cafeteria', 'convenience', 'shop', 'game_corner', 'vending', 'toilet'], green: 'flower', stage: 3, mat: 'wood_path' });
zone(['15,20'], { name: '中央生活', fac: ['multi_room', 'broadcast', 'tea_room', 'water', 'bench'], green: 'flower', decor: true, stage: 3, mat: 'wood_path' });

/* 南運動（水泥地）：R3 整列 rows 15–18 × cols 0–13 是全圖最大片連續空地，
   六座 2×2（操場／棒球場／足球場／體育館／道場／游泳池）就吃 24 格，需要 3 個街廓；
   再加 R4C1 放球場與更衣室。水泥地是階段 4 才解鎖的鋪面，剛好對上體育館(3)／游泳池(4)。 */
zone(['15,0'], { name: '南運動園區', fac: ['field', 'baseball', 'tennis', 'club'], green: 'flower', decor: true, stage: 3, mat: 'concrete' });
zone(['15,5'], { name: '南運動園區', fac: ['gym', 'dojo', 'locker', 'club'], green: 'flower', decor: true, stage: 3, mat: 'concrete' });
zone(['15,10'], { name: '南運動園區', fac: ['soccer', 'pool', 'basketball', 'trampoline'], green: 'flower', decor: true, stage: 4, mat: 'concrete' });
zone(['20,5'], { name: '南運動園區', fac: ['basketball', 'tennis', 'locker', 'club'], green: 'flower', decor: true, stage: 3, mat: 'concrete' });
/* R4C2：原本劃給農牧，但那樣「農牧」就插在 R4C1 與 R3C2 兩塊運動街廓中間、
   把運動區從中切斷。改成運動之後 R3C0–C2 ＋ R4C1 ＋ R4C2 連成一整塊，
   街廓之間的 r19（c0–13）與 c4／c9 就都是分區內部 → 整片鋪水泥地。
   代價是原生小農場（X24/Y14）留在運動區裡，那是保留既有建築的必然，照實記錄。 */
zone(['20,10'], { name: '南運動園區', fac: ['field', 'baseball', 'club', 'trampoline'], green: 'flower', decor: true, stage: 3, mat: 'concrete' });

/* 北農牧（草地）：離校門最遠的西北兩個街廓。所有農牧設施都是 1×1，
   一個 4×4 街廓塞得下 16 座 —— 這是全圖最省地、最會長棟數的分區。
   ※ 只給 2 個街廓（初版給 4 個）：室內設施才是這張圖的大宗（7 間教室＋十來間
     2×2 專科教室＋生活機能），初版把西半部四個街廓都劃給農牧，結果**走廊分區塞爆、
     景點骨架只好把保健室／家政室／操場一路塞進農牧區**，分區名就變成謊話
     （實測 143 棟裡有 21 棟語意不合）。把 R1 那兩個街廓還給教學區之後才平衡。 */
zone(['0,0'], { name: '北農牧區', fac: ['farm', 'chicken', 'rabbit', 'duck', 'mole', 'cow'], green: 'grass', decor: true, stage: 1, mat: 'grass' });
zone(['0,5'], { name: '北農牧區', fac: ['farm', 'chicken', 'pig', 'mole', 'weather', 'well'], green: 'grass', decor: true, stage: 2, mat: 'grass' });

/* 西教學（走廊）：R1C0／R1C1 ＋ R2C0 連成一塊 2×2 的校舍街區 ——
   兩個街廓之間的大道（r9 的 c0–8）與縱街（c4 的 r5–13）因此都是**分區內部**，
   會鋪成走廊，這就是使用者說的「走廊連接教室、辦公室或其它室內設施」。
   R1C0 有西北水塘（r6–7/c0–3，8 格），實際可用約 8 格 → 只列 1×1 與少量 2×2。 */
zone(['5,0'], { name: '西教學', fac: ['science', 'nurse', 'toilet'], green: 'flower', decor: true, stage: 2, mat: 'wood_path' });
zone(['5,5'], { name: '西教學', fac: ['computer', 'home_ec', 'multi_room', 'shop'], green: 'flower', decor: true, stage: 2, mat: 'wood_path' });

/* 北丘公園（草地）：R0C2／R1C2 整片是 e2 高地（含水塘與田埂路），
   B.fillPlateau 另外處理，這裡只宣告語意與材質。 */
zone(['0,10', '5,10'], { name: '北丘公園', fac: [], green: 'sakura', mat: 'grass' });

/* 東緣高地（草地）：e2 高地帶，上面有原生百葉箱／小農場×2／養豬小屋，原地保留不新增。 */
zone(['0,25', '5,25', '10,25', '15,25'], { name: '東緣高地', fac: [], green: 'grass', mat: 'grass' });

/* 西南水岸（草地）：R4C0 被水塘與樹林占了大半（r20–22/c3 是池、r19–20/c3–4 是樹），
   地形本身就是水岸 —— 水井＋長椅擺在池畔，同時是「水岸／力量」的材料。 */
zone(['20,0'], { name: '西南水岸', fac: ['well', 'bench', 'statue_br', 'toilet'], green: 'grass', decor: true, stage: 3, mat: 'grass' });

/* 南農牧（草地）：R4C3。原本放在 R4C2，但那樣運動區會被農牧從中間切開；
   換到 R4C3 之後農牧與湖心飼育（R4C4）、南緣步道（R5C3）連成一片草地區，
   運動區也補成完整一塊（見上）。東緣 c18 是水塘，實際可用約 13 格，剛好放 1×1 農牧。 */
zone(['20,15'], { name: '南農牧區', fac: ['farm', 'chicken', 'pig', 'rabbit', 'duck', 'mole', 'cow'], green: 'grass', decor: true, stage: 3, mat: 'grass' });

/* 南門玄關（道路）：南門自開在 r25/c8–9（見步驟 3），玄關街廓給它門面。 */
zone(['25,5'], { name: '南門玄關', fac: ['board', 'bench'], green: 'flower', decor: true, stage: 2, mat: 'asphalt' });
zone(['25,10'], { name: '南門玄關', fac: ['bench', 'vending'], green: 'flower', decor: true, stage: 2, mat: 'asphalt' });

/* 南緣步道（草地）：最南那一排只有 1 格深（R5），鋪成散步道放長椅與銅像。
   ※ R4C3 已改劃給南農牧區（見上），這裡只剩 R5C0 與 R5C3 兩段。 */
zone(['25,0'], { name: '南緣步道', fac: ['bench', 'statue_br', 'incinerator'], green: 'grass', decor: true, stage: 3, mat: 'grass' });
zone(['25,15'], { name: '南緣步道', fac: ['bench', 'statue_br'], green: 'grass', decor: true, stage: 3, mat: 'grass' });

/* 湖心稀有飼育區（草地）：鑿 2 格水道打通的湖心島＋湖心高台。
   熊貓／無尾熊／鱷魚／長頸鹿都**不是任何景點的材料**，搬島對景點零風險。
   舊版這一區的 mat 是「道路」（因為舊規則只有道路／走廊可選）；新版改草地 ——
   動物區屬自然面，正是「草地比較像是前往農場或養豬場」的語意，
   而草地是階段 3 解鎖、稀有動物是階段 4，整島讀起來就是後期開發。 */
zone(['20,20'], { name: '湖心稀有飼育區', fac: ['panda', 'koala', 'croc'], green: 'sakura', decor: true, stage: 4, mat: 'grass' });
zone(['25,20'], { name: '湖心稀有飼育區', fac: ['giraffe', 'bench', 'statue_gold'], green: 'sakura', decor: true, stage: 4, mat: 'grass' });
zone(['20,25', '25,25'], { name: '湖心高台', fac: [], green: 'sakura', mat: 'grass' });

/* 1d) 教室要**先卡位**。教室是 2×2，而且**不是任何景點的材料** ——
      景點骨架完全沒有理由蓋教室，分區填充輪到它時位置又已經被景點材料吃光，
      實測整張圖只會剩 1 間（原生那間）。可是「一間教室的學校」既不合理、
      也擋住學生上限（教室決定各年級容納人數）。
      所以把 6 間教室（每年級 2 間）用 preplace 釘在**中央教學區**的兩個街廓上，
      佔掉 8 個象限中的 6 個，剩下的交給景點骨架。
      ※ preplace 跑在 layRoads／prepare 之後、parcels 之前，所以這些格子不會被切成
        街廓 slot，景點骨架會自動繞開；每一棟都貼著街廓外緣的街道，不會被圍死。 */
const PREPLACE = [
    // 中央教學西棟（X12–X15 / Y27–Y24）：3 間
    { t: 'class', r: 10, c: 0 }, { t: 'class', r: 10, c: 2 }, { t: 'class', r: 12, c: 0 },
    // 中央教學東棟（X12–X15 / Y17–Y14）：3 間
    { t: 'class', r: 10, c: 10 }, { t: 'class', r: 12, c: 10 }, { t: 'class', r: 12, c: 12 },
    /* 中央行政（X12–X15 / Y22–Y19）＝**兩個景點共用一個 4×4 窗口 (10,5)**：
         學習 ＝ 校長室(1×2) ＋ 圖書室(2×1) ＋ 多媒體教室(1×2)
         選舉 ＝ 校長室(1×2) ＋ 辦公室(2×2) ＋ 茶室(1×1)
       校長室全校唯一，兩個景點都要它 —— 所以整組 6 棟一起釘在同一個窗口裡，
       校長室、辦公室與茶室相鄰，一間校長室同時餵兩個景點（這是全圖最省的一組）。
       排法：c5–c6 放校長室＋多媒體（各 1×2 並排）、圖書室(2×1) 橫躺在下面 r12；
             c7–c8 放辦公室(2×2)，茶室補在 r12/c7。共 11 格，全落在窗口 (10,5) 內，
             且每一棟都貼得到 c4／c9 兩條縱街或 r9／r14 兩條大道，不會被圍死。 */
    { t: 'principal', r: 10, c: 5 }, { t: 'av_room', r: 10, c: 6 }, { t: 'library', r: 12, c: 5 },
    { t: 'office', r: 10, c: 7 }, { t: 'tea_room', r: 12, c: 7 },
    /* 湖心島（X24/Y7–Y5）＝稀有動物三隻。島上鑿通後只有 6 格平地，而 4×4 景點窗口
       罩得到那裡 —— 不釘的話「名門」（銅像＋金像＋電腦室）會把 3 格全吃掉，
       熊貓／無尾熊／鱷魚就「無處可放」，整座動物島只剩一隻熊貓（實測）。
       這三隻都不是任何景點的材料，釘在這裡對景點零風險，「名門」會自己搬去別的窗口。 */
];

/* 2) 景點骨架（鋪路 → 鑿水道 → 打通高地 → 教室卡位 → 街廓填景點） */
let carved = [];
const res = D.build(B.spotOrder(), {
    zones: ZONES,
    preplace: PREPLACE,
    prepare(g) {
        /* ★ 湖心島登島坡道（必要工程，兩格）。
           湖心島的可建平地在 X24–X27/Y7–Y5（e1），但它被一圈 **e2 的水塘**包住：
           鑿掉 e2 水塘後那格是「e2 的平地」，跟島上的 e1 差一階，**鋪成路也走不過去**。
           而 carveWaterChannel 只會把鑿開的格鋪成走廊（同高度才算通），
           所以它找不到這條路，只沿著 X21 那排 e1 往東打通 15 格就停手。

           更麻煩的是：`blockedBuildings` 的包圍判定**只看「鄰格可通行且走得到」、不看高低差**
           （百靈山丘那一頁也記過這個「假通過」），於是島上蓋的東西會通過驗證、
           實機卻永遠走不到 —— 實測初版就在島上放了電腦室與熊貓，兩者都是假的。

           解法用的是本管線的招牌手法：**把 e2 水塘鑿成「空地」而不是鋪路**。
           空地只要旁邊有低一階的格子，遊戲就自動判成**斜坡**：
             X22/Y7（r20,c20）e2 空地 → 貼著 X21/Y7（r19,c20）e1 → 斜坡
             X23/Y7（r21,c20）e2 空地 → 貼著 X24/Y7（r22,c20）e1 → 斜坡
           兩格同為 e2 所以互通，於是 e1 → e2 → e2 → e1 接成一道登島階梯。
           一格都不改 elevation，只是把水換成空地。 */
        [[20, 20], [21, 20]].forEach(([r, c]) => {
            if (g[r][c].type !== 'pond') throw new Error('登島坡道的落點不是水塘：' + r + ',' + c);
            g[r][c] = { type: 'empty', elevation: g[r][c].elevation };
            carved.push([r, c]);
        });
        // 東南湖心區：再鑿最少量的水塘接上 X21 大道，島上原生養豬小屋因此走得到
        carved = carved.concat(B.carveWaterChannel(g, { maxCarve: E.town.pond.channel, minGain: 8 }));
        /* openPlateaus 的階段 2（救援被包圍的既有建築）會自己處理**原生百葉箱 X6/Y3**：
           它在 e2 高地上，四鄰是小農場（建築）、水塘、一格低一階的草地（差一階又不是
           斜坡，跨不過去）與不可通行的田埂路 —— 所以它本來就走不到。
           ※ 這一棟長年被 blockedBuildings 的盲點遮住（舊版只檢查「鄰格可通行且從校門
             走得到」，沒檢查「從那格踏不踏得進來」）。engine 補上 canStep 之後，
             openPlateaus 才「看見」它是被包圍的，於是自動把 X5/Y4、X6/Y4 兩格田埂路
             擦成空地 → 兩格斜坡 → 百葉箱接上動線。**不必手動鋪參道。**
           這正是「把可達性判定修對，救援邏輯就自己會動」的例子。 */
        B.openPlateaus(g);
    }
});
const g = res.g;

/* 2b) 街廓排不下的景點 → 滑動 4×4 窗口補位（冬郵可覆蓋田埂路／竹林） */
B.fallbackAll(g, res, B.DECOR_EAST);

/* 3) 第二座校門：原本只有北緣一座，南區走過去要繞整張圖。
      先加門再填充，讓後面的綠化守衛保護門口的動線。 */
B.addGate(g, 25, 8, 'gate_h', res);

/* 4) 分區填充 */
B.fill(g, res, ZONES, 'grass', B.DECOR_EAST);

/* 5) 高地開發（每列最外側留步道接坡道，中間才蓋設施；多格設施不能列在這）
      walkMat：兩塊都是公園性質的高地 → 步道鋪草地當自然小徑 */
B.fillPlateau(g, [
    { name: '北丘公園', rows: [0, 9], cols: [8, 12], clear: true, fac: ['tea_room', 'bench', 'statue_br', 'board', 'toilet', 'vending', 'water', 'locker'], green: 'sakura', walkMat: 'grass' },
    // 湖心高台：整片是原生草地（不是空地），算不出建築 slot，所以實際只當草徑展望台用。
    // 試過 clear:true 把草地擦成空地，但草地是菜園／力量／清爽的材料，守衛幾乎全部退回，
    // 只多出 1 格卻讓走不到的通行格從 12 增到 18，不值得。
    { name: '湖心高台', rows: [12, 25], cols: [21, 25], fac: ['bench', 'statue_br', 'board', 'vending'], green: 'sakura', walkMat: 'grass' }
]);

/* 6) 收尾：斷頭路改鋪草地 */
B.tidyUnreachable(g);

/* 7) 材質重鋪 pass（景點中立）：幹道脊椎鋪道路、其餘街道依鄰接街廓的 mat、
      體育館／泳池／道場門前鋪水泥廣場；鑿出來的水道橋保持走廊（木橋意象） */
B.paveMaterials(g, { zones: ZONES, spine: E.town.spine, keep: carved });

const loop = () => {
    if (E.town.flow && E.town.flow.loopify)
        B.loopify(g, Object.assign({ zones: ZONES, spine: E.town.spine, keep: carved }, E.town.flow));
};

/* 8) 環化 pass（動線流暢優先於景點配置）：孤立通行格歸零、2–4 格的設計性死路支線
      接回成環或整條收成綠地；門前水泥廣場／幹道脊椎／水道橋／校門門面／斜坡一律豁免。
      開關與參數在 towns.js 的 flow（只有已重排的鎮宣告）。 */
loop();

/* 8b) 破壞地形換動線（builder.breakTerrain）——★ 這一版**一組都不採用，整段拿掉**。

   舊版（124 棟）為了把死路支線從 21% 壓到 7%，花了 4 格水塘 ＋ 3 棵原生植栽開三條環。
   分區優先重排後，同一把尺（動線總分 ＝ 孤立×100 ＋ 走不到×20 ＋ 支線格×3 ＋ 端點）
   重新算，那三組**全部被自己的守衛退回**：

     · 東緣湖岸北橋 [[13,23,'path'],[13,24,'empty']]：舊圖值 −10 格支線；新圖 180 → 186（變差）。
     · 西側櫻花坡上坡口 [[13,4,'empty']]：新圖 180 → 180（完全沒變），不值得砍原生櫻花。
     · 北丘公園西坡道 [[1,7,'empty'],[2,7,'empty']]：新圖 180 → 180（完全沒變）。
     ·（本來就不採用）西岸／南岸終端環：鑿出來的是「走進去繞一圈再原路出來」的迴轉盤，
       只是把死路端點藏進小圈圈裡騙指標，玩家一步路都沒省。

   為什麼會反轉：分區優先把建築密度從 124 棟拉到 145 棟，而**死路支線的大宗變成
   「建築的唯一門面」**——那是動線的目的地，不是缺陷。這種支線補環補不掉（橋接上去
   反而長出更多門面短枝），所以「花原生地形換指標」的邊際效益整條歸零。

   結論寫進頁面：**這一版只破壞 2 格水塘（湖心島登島坡道，不鑿就走不到），
   原生樹木一棵都沒砍**，代價是死路支線 7% → 20%。這是誠實的取捨，不是退步 ——
   舊版那 7% 是拿原生地形買來的。 */

/* 8c) 再跑一輪環化（收斂用；沒有破壞地形，這一輪通常只微調） */
loop();

/* 9) 驗證＋分享碼＋預覽＋分區產物 */
B.report(g, '冬郵小鎮完美佈局', 'code-east.txt');
B.writeZones(ZONES, 'zones-east.json');
