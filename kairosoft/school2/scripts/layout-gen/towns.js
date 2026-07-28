/* 城鎮設定表 — 完美佈局管線的唯一「哪個城鎮」開關。
   遊戲座標一律從 [2,2] 起算，格數 = 座標上限 − 1。

   ★ 用法：進入點腳本要在 require('./engine.js') **之前** 呼叫 select()，
     因為 engine / design2 會在載入當下把 gridRows / gridCols 解構成常數。

       require('./towns.js').select('east');
       const E = require('./engine.js');
*/

const TOWNS = {
    health: {
        key: 'health',
        name: '健康鎮',
        rows: 26, cols: 24,                 // 座標 [2,2]–[27,25]
        preset: 'PRESET_DEFAULT_DATA',      // sim/index.html 內的變數名
        svg: 'health-perfect.svg',
        page: 'health',                     // layouts/<page>/ 子頁目錄名
        // 水塘可以被建設覆蓋破壞（實機確認）。maxCarve = 本鎮允許破壞的水塘格數上限，
        // verify.js 會檢查「實際破壞數 ≤ maxCarve 且沒有無中生有的新水塘」。
        pond: { maxCarve: 0 },              // 健康鎮的水塘都在動線內側，不必動
        // 棋盤路網：橫向大道(列) / 縱向街道(欄) / 街廓帶
        roads: {
            AV: [5, 10, 15, 20],
            ST: [4, 9, 14, 19],
            ROW_BANDS: [[1, 4], [6, 9], [11, 14], [16, 19], [21, 24]],
            COL_BANDS: [[0, 3], [5, 8], [10, 13], [15, 18], [20, 23]]
        }
    },
    east: {
        key: 'east',
        name: '冬郵小鎮',
        rows: 26, cols: 26,                 // 座標 [2,2]–[27,27]
        preset: 'PRESET_EAST_DATA',
        svg: 'east-perfect.svg',
        page: 'east',
        // 東南湖心區被水塘圍住，鑿 2 格水道就能把 39 格陸地（含原生養豬小屋）接上動線
        pond: { maxCarve: 2 },
        // 冬郵小鎮的校門在「上緣」(gate_h @ r0,c19-20)，所以路網要讓
        // 縱向街道穿過 c19/c20 才接得到校門；水塘與高地由 layRoads 自行避開。
        roads: {
            AV: [4, 9, 14, 19, 24],
            ST: [4, 9, 14, 19, 24],
            ROW_BANDS: [[0, 3], [5, 8], [10, 13], [15, 18], [20, 23], [25, 25]],
            COL_BANDS: [[0, 3], [5, 8], [10, 13], [15, 18], [20, 23], [25, 25]]
        }
    }
};

let cur = 'health';

module.exports = {
    TOWNS,
    select(key) {
        if (!TOWNS[key]) throw new Error('unknown town: ' + key);
        cur = key;
        return TOWNS[key];
    },
    current() { return TOWNS[cur]; }
};
