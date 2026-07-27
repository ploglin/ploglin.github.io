/* 健康鎮完美佈局 — 設定檔。實際流程都在 builder.js（城鎮無關）。
   執行：node final.js  → 產生 code.txt（26×24，分享碼無尺寸前綴） */
require('./towns.js').select('health');
const E = require('./engine.js');
const D = require('./design2.js');
const B = require('./builder.js');

/* 1) 景點骨架（大型／稀有設施先卡位）
      全校唯一的校長室：蓋在既有辦公室（r16-17,c6-7）左側，讓「選舉」「學習」都能用同一間 */
const res = D.build(B.spotOrder(), { preplace: [{ t: 'principal', r: 16, c: 5 }] });
const g = res.g;

/* 1b) 街廓排不下的景點 → 滑動 4×4 窗口補位 */
B.fallbackAll(g, res);

/* 2) 分區填充：key = 街廓左上角 'r0,c0'
      教室：三個年級各 3 間，共 9 間（含健康鎮原本就有的那間舊校舍）。
      辦公室：原有 1 間 ＋ 新建 1 間 = 2 間。 */
const ZONES = {
    '11,10': { name: '3年級棟', fac: ['class', 'class'], green: 'flower', decor: true },          // ＋原有舊校舍 1 間 = 3 間
    '11,15': { name: '1年級棟', fac: ['class', 'class', 'class', 'office'], green: 'flower', decor: true },
    '16,15': { name: '2年級棟', fac: ['class', 'class', 'class', 'toilet', 'water', 'locker', 'vending'], green: 'flower', decor: true },
    '16,10': { name: '生活機能', fac: ['broadcast', 'game_corner', 'bench', 'career', 'multi_room'], green: 'grass' },
    '16,0': { name: '校門廣場', fac: ['board', 'bench', 'statue_br'], green: 'flower' },
    '21,0': { name: '農牧園區', fac: ['farm', 'chicken', 'pig', 'cow', 'rabbit', 'duck'], green: 'grass' },
    '21,5': { name: '農牧園區', fac: ['farm', 'mole', 'panda', 'koala', 'croc', 'duck'], green: 'grass' },
    '21,10': { name: '運動園區', fac: ['field', 'baseball', 'soccer', 'tennis', 'basketball', 'pool'], green: 'grass' },
    '21,15': { name: '運動園區', fac: ['gym', 'dojo', 'trampoline', 'club', 'field', 'locker'], green: 'grass' },
    '21,20': { name: '展望綠地', fac: ['bench', 'statue_br'], green: 'sakura' },
    '11,20': { name: '展望綠地', fac: [], green: 'sakura' }
};
B.fill(g, res, ZONES, 'grass');

/* 2d) 第二座校門：gate_h 是「上下用」的 2×1 版本，開在南側邊界接上 Y11 街道 */
B.addGate(g, 25, 13, 'gate_h');

/* 2e) 高地開發（每列最外側留步道接坡道，中間才蓋設施） */
B.fillPlateau(g, [
    { name: '北高地花園', rows: [0, 4], cols: [3, 10], fac: ['tea_room', 'bench', 'statue_br', 'board', 'toilet', 'vending'], green: 'sakura' },
    { name: '東高地園區', rows: [10, 22], cols: [19, 23], fac: ['pool', 'gym', 'dojo', 'club', 'locker', 'water', 'toilet', 'bench', 'giraffe', 'elephant', 'rabbit', 'statue_br'], green: 'grass' }
]);

/* 3) 驗證＋分享碼＋預覽 */
B.report(g, '健康鎮完美佈局', 'code.txt');
