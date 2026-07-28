/* 冬郵小鎮完美佈局 — 設定檔。實際流程都在 builder.js（城鎮無關）。
   執行：node east.js  → 產生 code-east.txt（26×26，分享碼帶 26x26; 前綴）

   冬郵小鎮的地形特徵與對應決策：
   - 校門在「上緣」(gate_h @ X2/Y8-Y7)，動線是由北往南展開。
   - 田埂路(aze_path)在模擬器裡不可通行，等同景觀；主幹道會直接鋪過去。
   - 北中央有一塊高地（含水塘），東側與東南是高地草坡 —— 草地不是斜坡，
     要擦掉邊界一格才會生成坡道，openPlateaus 會自動找。
   - 東南角有一塊 39 格的陸地被水塘圍住（含一間原生養豬小屋）。
     實機確認**水塘可以被建設覆蓋破壞、變回平地**，所以那不是死地：
     carveWaterChannel 會找出最省的水道把它接上動線，原生養豬小屋原地保留。 */
require('./towns.js').select('east');
const E = require('./engine.js');
const D = require('./design2.js');
const B = require('./builder.js');

/* 1) 景點骨架（鋪路 → 鑿水道 → 打通高地 → 街廓填景點） */
const res = D.build(B.spotOrder(), {
    prepare(g) {
        // 東南湖心區：鑿最少量的水塘接上 X21 大道，島上原生養豬小屋因此走得到
        B.carveWaterChannel(g, { maxCarve: E.town.pond.maxCarve, minGain: 8 });
        B.openPlateaus(g);
    }
});
const g = res.g;

/* 1b) 街廓排不下的景點 → 滑動 4×4 窗口補位（冬郵可覆蓋田埂路／竹林） */
B.fallbackAll(g, res, B.DECOR_EAST);

/* 2) 第二座校門：原本只有北緣一座，南區走過去要繞整張圖。
      先加門再填充，讓後面的綠化守衛保護門口的動線。 */
B.addGate(g, 25, 8, 'gate_h', res);

/* 3) 分區填充：key = 街廓左上角 'r0,c0'（南半部大片平地是新校區） */
const ZONES = {
    '15,0': { name: '3年級棟', fac: ['class', 'class', 'class'], green: 'flower', decor: true },
    '15,5': { name: '1年級棟', fac: ['class', 'class', 'class'], green: 'flower', decor: true },
    '15,10': { name: '2年級棟', fac: ['class', 'class', 'water', 'locker'], green: 'flower', decor: true },
    '15,15': { name: '生活機能', fac: ['broadcast', 'game_corner', 'career', 'multi_room', 'bench', 'vending', 'toilet'], green: 'grass' },
    '15,20': { name: '南門廣場', fac: ['board', 'bench', 'statue_br'], green: 'flower' },
    '20,0': { name: '農牧園區', fac: ['farm', 'chicken', 'pig', 'cow', 'rabbit', 'duck', 'mole'], green: 'grass' },
    '20,5': { name: '農牧園區', fac: ['farm', 'panda', 'koala', 'croc', 'giraffe'], green: 'grass' },
    '20,10': { name: '運動園區', fac: ['field', 'baseball'], green: 'grass' },
    '20,15': { name: '運動園區', fac: ['gym', 'dojo', 'trampoline', 'club', 'pool', 'locker', 'soccer'], green: 'grass' },
    // 鑿通後的湖心區：水岸休憩帶（原生養豬小屋就在這一區的北端）
    '20,20': { name: '湖心休憩區', fac: ['bench'], green: 'sakura' },
    '25,0': { name: '南緣步道', fac: ['bench', 'statue_br'], green: 'grass' },
    '25,5': { name: '南緣步道', fac: [], green: 'grass' },
    '25,10': { name: '南緣步道', fac: ['bench'], green: 'grass' },
    '25,15': { name: '南緣步道', fac: ['statue_br'], green: 'grass' },
    '25,20': { name: '湖心休憩區', fac: ['bench'], green: 'grass' }
};
B.fill(g, res, ZONES, 'grass', B.DECOR_EAST);

/* 4) 高地開發（每列最外側留步道接坡道，中間才蓋設施；多格設施不能列在這） */
B.fillPlateau(g, [
    { name: '北丘公園', rows: [0, 9], cols: [8, 12], clear: true, fac: ['tea_room', 'bench', 'statue_br', 'board', 'toilet', 'vending', 'water', 'locker'], green: 'sakura' },
    { name: '湖心高台', rows: [12, 25], cols: [21, 25], fac: ['bench', 'statue_br', 'duck', 'rabbit', 'board', 'vending'], green: 'sakura' }
]);

/* 5) 收尾：斷頭路改鋪草地 */
B.tidyUnreachable(g);

/* 6) 驗證＋分享碼＋預覽 */
B.report(g, '冬郵小鎮完美佈局', 'code-east.txt');
