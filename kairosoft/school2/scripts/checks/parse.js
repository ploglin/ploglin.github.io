// 從 sim/index.html 抓出資料區塊（供 checks/*.js 共用）
//
// 這些 regex 依賴「8 個空白的縮排」——與 layout-gen/engine.js、gen-assets.js、verify.js 同一條硬相依。
// 重排 items / SPOTS / SPOT_JP / JP_NAMES / ITEM_ICONS / DEV_GUIDE 的宣告字面或縮排會讓四支腳本同時死。
// 詳見計畫的「紅線」一節。
'use strict';

const OBJ = name => new RegExp('const ' + name + ' = (\\{[\\s\\S]*?\\n        \\});');
const ARR = name => new RegExp('const ' + name + ' = (\\[[\\s\\S]*?\\n        \\]);');

function grabObj(html, name) {
    const m = OBJ(name).exec(html);
    if (!m) throw new Error('找不到資料區塊 const ' + name + ' = {…};（縮排是否被動過？）');
    return eval('(' + m[1] + ')');
}
function grabArr(html, name) {
    const m = ARR(name).exec(html);
    if (!m) throw new Error('找不到資料區塊 const ' + name + ' = […];（縮排是否被動過？）');
    return eval(m[1]);
}

module.exports = function parse(html) {
    const items = grabObj(html, 'items');
    return {
        items,
        icons: grabObj(html, 'ITEM_ICONS'),
        jp: grabObj(html, 'JP_NAMES'),
        spotJp: grabObj(html, 'SPOT_JP'),
        SPOTS: grabArr(html, 'SPOTS'),
        guide: grabArr(html, 'DEV_GUIDE'),
        TYPE_KEYS: Object.keys(items)
    };
};
