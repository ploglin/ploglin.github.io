/* 冬郵小鎮完美佈局 — 設定檔。實際流程都在 builder.js（城鎮無關）。
   執行：node east.js  → 產生 code-east.txt（26×26，分享碼帶 26x26; 前綴）＋ zones-east.json

   冬郵小鎮的地形特徵與對應決策：
   - 校門在「上緣」(gate_h @ X2/Y8-Y7)，動線是由北往南展開。
   - 田埂路(aze_path)在模擬器裡不可通行，等同景觀；主幹道會直接鋪過去。
   - 北中央有一塊高地（含水塘），東側與東南是高地草坡 —— 草地不是斜坡，
     要擦掉邊界一格才會生成坡道，openPlateaus 會自動找。
   - 東南角有一塊 39 格的陸地被水塘圍住（含一間原生養豬小屋）。
     實機確認**水塘可以被建設覆蓋破壞、變回平地**，所以那不是死地：
     carveWaterChannel 會找出最省的水道把它接上動線，原生養豬小屋原地保留。
   - 稀有動物（熊貓／無尾熊／鱷魚／長頸鹿）擺在鑿通後的湖心島＝「後期動物島」，
     跟階段敘事一致（基礎農牧留西側）；這四種都不是任何景點的材料，搬島零風險。 */
require('./towns.js').select('east');
const E = require('./engine.js');
const D = require('./design2.js');
const B = require('./builder.js');

/* 1) 分區設定：key = 街廓左上角 'r0,c0'（南半部大片平地是新校區）
      stage = 解鎖階段（1 農村 → 4 名門），design2 用它做街廓的階段偏好與硬規則。
      mat   = 鄰接街道的鋪面（builder.paveMaterials 用）：
              教學／生活／舊校舍／運動＝走廊 wood_path，農牧／公園／湖心＝道路 asphalt。 */
const ZONES = {
    '15,0': { name: '3年級棟', fac: ['class', 'class', 'class'], green: 'flower', decor: true, stage: 2, mat: 'wood_path' },
    '15,5': { name: '1年級棟', fac: ['class', 'class', 'class'], green: 'flower', decor: true, stage: 2, mat: 'wood_path' },
    '15,10': { name: '2年級棟', fac: ['class', 'class', 'water', 'locker'], green: 'flower', decor: true, stage: 2, mat: 'wood_path' },
    '15,15': { name: '生活機能', fac: ['broadcast', 'game_corner', 'career', 'multi_room', 'bench', 'vending', 'toilet'], green: 'grass', stage: 2, mat: 'wood_path' },
    '15,20': { name: '南門廣場', fac: ['board', 'bench', 'statue_br'], green: 'flower', stage: 2, mat: 'wood_path' },
    '20,0': { name: '農牧園區', fac: ['farm', 'chicken', 'pig', 'cow', 'rabbit', 'duck', 'mole'], green: 'grass', stage: 3, mat: 'asphalt' },
    // 這裡的 giraffe 只是保底候位，實際上放不出來：全圖唯一的長頸鹿由景點骨架
    // 放在中北過渡帶 X15/Y12（青空＋非洲共用材料，必須留在那個 4×4 窗口）
    '20,5': { name: '農牧園區', fac: ['farm', 'chicken', 'rabbit', 'duck', 'mole', 'giraffe'], green: 'grass', stage: 3, mat: 'asphalt' },
    '20,10': { name: '運動園區', fac: ['field', 'baseball'], green: 'grass', stage: 3, mat: 'wood_path' },
    '20,15': { name: '運動園區', fac: ['gym', 'dojo', 'trampoline', 'club', 'pool', 'locker', 'soccer'], green: 'grass', stage: 3, mat: 'wood_path' },
    /* 鑿通後的湖心區＝後期「動物島」（原生養豬小屋在東緣高地 X13–X14/Y2）。
       熊貓／無尾熊／鱷魚都不是任何景點的材料，搬島對 29/29 零風險；
       島上的平地只有 3 格排得下建築（其餘是水塘與高台草坡），剛好放這 3 隻。
       長頸鹿不在島上：牠是青空＋非洲的共用材料，由景點骨架放在中北過渡帶 X15/Y12。 */
    '20,20': { name: '湖心動物島', fac: ['panda', 'koala', 'croc', 'giraffe'], green: 'sakura', stage: 4, mat: 'asphalt' },
    '25,0': { name: '南緣步道', fac: ['bench', 'statue_br'], green: 'grass', stage: 3, mat: 'asphalt' },
    '25,5': { name: '南緣步道', fac: [], green: 'grass', stage: 3, mat: 'asphalt' },
    '25,10': { name: '南緣步道', fac: ['bench'], green: 'grass', stage: 3, mat: 'asphalt' },
    '25,15': { name: '南緣步道', fac: ['statue_br'], green: 'grass', stage: 3, mat: 'asphalt' },
    '25,20': { name: '湖心動物島', fac: ['croc', 'giraffe', 'bench'], green: 'grass', stage: 4, mat: 'asphalt' }
};

/* 1b) 最北那一帶（校門所在的 rows 0–3）＝舊校舍帶，開局核心。這些街廓不新增設施
      （fac 空、green 與預設的 grass 相同 → 對 B.fill 完全中立），只宣告 stage / mat，
      讓 design2 的階段硬規則知道「階段 3 以上的景點不要往這裡塞新材料」。
      ※ 只標最北一帶：實測連 rows 5–13 也標成 stage 1／2 的話，13 個階段 3 的景點會
        全部被趕進南半部，把 ZONES 的設施位擠光（棟數 136 → 108）。 */
[0, 5, 10, 15, 20, 25].forEach(c0 => {
    ZONES['0,' + c0] = { name: '舊校舍帶', fac: [], green: 'grass', stage: 1, mat: 'wood_path' };
});

/* 1c) 其餘街廓（rows 5–13 的舊校舍延伸帶、北丘公園、東緣高地）只補「名字 ＋ 街道材質」，
      刻意**不宣告 stage** → design2 的階段偏好與硬規則對它們完全不動作（保住 29/29 與棟數）。
      名字是「階段 × 分區」對照表要用的。 */
Object.assign(ZONES, {
    '5,0': { name: '舊校舍帶', fac: [], green: 'grass', mat: 'wood_path' },
    '5,5': { name: '舊校舍帶', fac: [], green: 'grass', mat: 'wood_path' },
    '5,10': { name: '北丘公園', fac: [], green: 'grass', mat: 'asphalt' },
    '5,15': { name: '舊校舍帶', fac: [], green: 'grass', mat: 'wood_path' },
    '5,20': { name: '舊校舍帶', fac: [], green: 'grass', mat: 'wood_path' },
    '5,25': { name: '東緣高地', fac: [], green: 'grass', mat: 'asphalt' },
    '10,0': { name: '中北過渡帶', fac: [], green: 'grass', mat: 'wood_path' },
    '10,5': { name: '中北過渡帶', fac: [], green: 'grass', mat: 'wood_path' },
    '10,10': { name: '中北過渡帶', fac: [], green: 'grass', mat: 'wood_path' },
    '10,15': { name: '中北過渡帶', fac: [], green: 'grass', mat: 'wood_path' },
    '10,20': { name: '中北過渡帶', fac: [], green: 'grass', mat: 'wood_path' },
    '10,25': { name: '東緣高地', fac: [], green: 'grass', mat: 'asphalt' },
    '15,25': { name: '東緣高地', fac: [], green: 'grass', mat: 'asphalt' },
    '20,25': { name: '湖心高台', fac: [], green: 'grass', mat: 'asphalt' },
    '25,25': { name: '湖心高台', fac: [], green: 'grass', mat: 'asphalt' }
});

/* 2) 景點骨架（鋪路 → 鑿水道 → 打通高地 → 街廓填景點） */
let carved = [];
const res = D.build(B.spotOrder(), {
    zones: ZONES,
    prepare(g) {
        // 東南湖心區：鑿最少量的水塘接上 X21 大道，島上原生養豬小屋因此走得到
        carved = B.carveWaterChannel(g, { maxCarve: E.town.pond.maxCarve, minGain: 8 });
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

/* 8) 驗證＋分享碼＋預覽＋分區產物 */
B.report(g, '冬郵小鎮完美佈局', 'code-east.txt');
B.writeZones(ZONES, 'zones-east.json');
