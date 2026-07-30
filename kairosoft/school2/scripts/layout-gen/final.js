/* 健康鎮完美佈局 — 設定檔。實際流程都在 builder.js（城鎮無關）。
   執行：node final.js  → 產生 code.txt（26×24，分享碼無尺寸前綴）＋ zones-health.json */
require('./towns.js').select('health');
const E = require('./engine.js');
const D = require('./design2.js');
const B = require('./builder.js');

/* 1) 分區設定：key = 街廓左上角 'r0,c0'
      教室：三個年級各 3 間，共 9 間（含健康鎮原本就有的那間舊校舍）。
      辦公室：原有 1 間 ＋ 新建 1 間 = 2 間。

      stage = 該街廓的解鎖階段（1 農村 → 4 名門）。design2 挑街廓時會偏好
              「景點階段與街廓階段相近」的組合，並禁止階段 3 以上的景點把新材料
              蓋進 stage 1 的開局核心區（無處可放時放寬並 log）。
      mat   = 鄰接街道的鋪面（builder.paveMaterials 用）：
              教學／生活／舊校舍／運動＝走廊 wood_path，農牧／公園／湖心＝道路 asphalt。
      健康鎮的分區本來就大致符合階段邏輯（校門廣場→年級棟→運動農牧→高地園區），
      所以這一版只補 stage / mat，分區內容不動。 */
const ZONES = {
    '16,0': { name: '校門廣場', fac: ['board', 'bench', 'statue_br'], green: 'flower', stage: 1, mat: 'wood_path' },
    '11,10': { name: '3年級棟', fac: ['class', 'class'], green: 'flower', decor: true, stage: 2, mat: 'wood_path' },   // ＋原有舊校舍 1 間 = 3 間
    '11,15': { name: '1年級棟', fac: ['class', 'class', 'class', 'office'], green: 'flower', decor: true, stage: 2, mat: 'wood_path' },
    '16,15': { name: '2年級棟', fac: ['class', 'class', 'class', 'toilet', 'water', 'locker', 'vending'], green: 'flower', decor: true, stage: 2, mat: 'wood_path' },
    '16,10': { name: '生活機能', fac: ['broadcast', 'game_corner', 'bench', 'career', 'multi_room'], green: 'grass', stage: 2, mat: 'wood_path' },
    '21,0': { name: '農牧園區', fac: ['farm', 'chicken', 'pig', 'cow', 'rabbit', 'duck'], green: 'grass', stage: 3, mat: 'asphalt' },
    '21,5': { name: '農牧園區', fac: ['farm', 'mole', 'panda', 'koala', 'croc', 'duck'], green: 'grass', stage: 3, mat: 'asphalt' },
    '21,10': { name: '運動園區', fac: ['field', 'baseball', 'soccer', 'tennis', 'basketball', 'pool'], green: 'grass', stage: 3, mat: 'wood_path' },
    '21,15': { name: '運動園區', fac: ['gym', 'dojo', 'trampoline', 'club', 'field', 'locker'], green: 'grass', stage: 3, mat: 'wood_path' },
    '21,20': { name: '展望綠地', fac: ['bench', 'statue_br'], green: 'sakura', stage: 4, mat: 'asphalt' },
    '11,20': { name: '展望綠地', fac: [], green: 'sakura', stage: 4, mat: 'asphalt' }
};

/* 1b) 其餘街廓（北緣舊校舍、池畔、中央舊校舍、東高地）只補「名字 ＋ 鄰接街道材質」：
      fac 空、green 與 B.fill 的預設 'grass' 相同 → 對填充完全中立，
      也刻意**不宣告 stage** → design2 的階段偏好與硬規則對它們完全不動作（保住 29/29）。
      名字是「階段 × 分區」對照表要用的（不然大半景點只能標「既有校舍／其他」）。 */
Object.assign(ZONES, {
    '1,0': { name: '北緣舊校舍', fac: [], green: 'grass', mat: 'wood_path' },
    '1,5': { name: '北高地花園', fac: [], green: 'grass', mat: 'asphalt' },
    '1,10': { name: '北緣舊校舍', fac: [], green: 'grass', mat: 'wood_path' },
    '1,15': { name: '北緣舊校舍', fac: [], green: 'grass', mat: 'wood_path' },
    '1,20': { name: '北緣舊校舍', fac: [], green: 'grass', mat: 'wood_path' },
    '6,0': { name: '池畔帶', fac: [], green: 'grass', mat: 'wood_path' },
    '6,5': { name: '池畔帶', fac: [], green: 'grass', mat: 'wood_path' },
    '6,10': { name: '池畔帶', fac: [], green: 'grass', mat: 'wood_path' },
    '6,15': { name: '池畔帶', fac: [], green: 'grass', mat: 'wood_path' },
    '6,20': { name: '池畔帶', fac: [], green: 'grass', mat: 'wood_path' },
    '11,0': { name: '舊校舍帶', fac: [], green: 'grass', mat: 'wood_path' },
    '11,5': { name: '舊校舍帶', fac: [], green: 'grass', mat: 'wood_path' },
    '16,5': { name: '舊校舍帶', fac: [], green: 'grass', mat: 'wood_path' },   // 校長室＋既有辦公室
    '16,20': { name: '東高地園區', fac: [], green: 'grass', mat: 'wood_path' }
});

/* 2) 景點骨架（大型／稀有設施先卡位）
      全校唯一的校長室：蓋在既有辦公室（r16-17,c6-7）左側，讓「選舉」「學習」都能用同一間 */
const res = D.build(B.spotOrder(), { preplace: [{ t: 'principal', r: 16, c: 5 }], zones: ZONES });
const g = res.g;

/* 2b) 街廓排不下的景點 → 滑動 4×4 窗口補位 */
B.fallbackAll(g, res);

/* 3) 分區填充 */
B.fill(g, res, ZONES, 'grass');

/* 3d) 第二座校門：gate_h 是「上下用」的 2×1 版本，開在南側邊界接上 Y11 街道 */
B.addGate(g, 25, 13, 'gate_h');

/* 3e) 高地開發（每列最外側留步道接坡道，中間才蓋設施）
       walkMat：公園類高地鋪草地當自然小徑，設施類園區鋪走廊 */
B.fillPlateau(g, [
    { name: '北高地花園', rows: [0, 4], cols: [3, 10], fac: ['tea_room', 'bench', 'statue_br', 'board', 'toilet', 'vending'], green: 'sakura', walkMat: 'grass' },
    // ※ fillPlateau 是逐格放置，多格設施會被跳過 → 游泳池／體育館改成 2×2 之後
    //   不能再列在這裡（列了等於白佔一輪、步道外的格子只會被綠化掉）。
    //   高地的運動性質改由 1×1 的操場／彈跳床代表，泳池與體育館留在南區運動園區。
    { name: '東高地園區', rows: [10, 22], cols: [19, 23], fac: ['field', 'trampoline', 'dojo', 'club', 'locker', 'water', 'toilet', 'bench', 'giraffe', 'elephant', 'rabbit', 'statue_br'], green: 'grass', walkMat: 'wood_path' }
]);

/* 4) 材質重鋪 pass（景點中立）：幹道脊椎鋪道路、其餘街道依鄰接街廓的 mat、
      體育館／泳池／道場門前鋪水泥廣場 */
B.paveMaterials(g, { zones: ZONES, spine: E.town.spine });

/* 5) 驗證＋分享碼＋預覽＋分區產物 */
B.report(g, '健康鎮完美佈局', 'code.txt');
B.writeZones(ZONES, 'zones-health.json');
