/* 解鎖階段對照表：item id → 遊戲四階段（1 農村／2 發展／3 有望／4 名門）。

   為什麼要這張表：遊戲的設施是隨學園等級一階一階解鎖的，佈局如果不照階段安排，
   玩家照圖蓋到一半會發現「這棟現在還蓋不出來」。design2.js 用它做街廓的階段偏好，
   gen-assets.js 用它產「階段 × 分區」對照表。

   來源（src 欄）：
     'DEV_GUIDE'  = 直接抄 sim/index.html 的 DEV_GUIDE（攻略 Wiki 的解鎖條件），cond 亦照抄。
     '推定'       = DEV_GUIDE 沒收錄，依遊戲常識／既有地形／景點材料難度推定，cond 寫推定理由。
   推定的部分請當「頁面上要誠實標注的估計值」看，不是實機確認的資料。

   ★ 新增 item 到 sim 的 items 註冊表後，跑 `node stages.js` 會列出還沒登記階段的 id。 */

const STAGES = {
    /* ── 工具 ───────────────────────────────────────────── */
    empty: { stage: 1, src: '推定', cond: '橡皮擦，一開始就有' },

    /* ── 環境地形：鋪面與植栽 ───────────────────────────── */
    // 鋪面／植栽在遊戲裡都屬於一開始就能鋪的地形筆刷；只有硬鋪面推定要等校舍成形。
    grass: { stage: 1, src: '推定', cond: '地形筆刷，一開始就可鋪' },
    aze_path: { stage: 1, src: '推定', cond: '地圖既有地形（不可通行，等同景觀）' },
    wood_path: { stage: 1, src: '推定', cond: '地形筆刷，一開始就可鋪' },
    asphalt: { stage: 1, src: '推定', cond: '地形筆刷，一開始就可鋪' },
    concrete: { stage: 2, src: '推定', cond: '硬鋪面，推定校舍成形（發展學園）後才會想鋪' },
    flower: { stage: 1, src: '推定', cond: '地形筆刷，一開始就可鋪' },
    woods: { stage: 1, src: '推定', cond: '地形筆刷／地圖既有地形' },
    pine: { stage: 1, src: '推定', cond: '地形筆刷／地圖既有地形' },
    poplar: { stage: 1, src: '推定', cond: '地形筆刷／地圖既有地形' },
    palm: { stage: 1, src: '推定', cond: '地形筆刷／地圖既有地形' },
    azalea: { stage: 1, src: '推定', cond: '地形筆刷／地圖既有地形' },
    bamboo: { stage: 1, src: '推定', cond: '地圖既有地形（不可通行）' },
    sakura: { stage: 1, src: '推定', cond: '地形筆刷／地圖既有地形' },
    special_tree: { stage: 1, src: '推定', cond: '地圖既有地形' },
    rock: { stage: 1, src: '推定', cond: '地圖既有地形' },
    pond: { stage: 1, src: '推定', cond: '地圖既有地形（可被建設破壞）' },
    lake: { stage: 1, src: '推定', cond: '地圖既有地形' },
    slope: { stage: 1, src: '推定', cond: '高低差自動生成，不是玩家蓋的' },

    /* ── 生活與設施 ─────────────────────────────────────── */
    board: { stage: 1, src: 'DEV_GUIDE', cond: '一開始就可建' },
    well: { stage: 1, src: 'DEV_GUIDE', cond: '一開始就可建' },
    water: { stage: 1, src: 'DEV_GUIDE', cond: '一開始就可建' },
    toilet: { stage: 1, src: 'DEV_GUIDE', cond: '學生 4 人' },
    incinerator: { stage: 1, src: 'DEV_GUIDE', cond: '學生 5 人' },
    nurse: { stage: 1, src: 'DEV_GUIDE', cond: '學生 5 人' },
    tea_room: { stage: 1, src: 'DEV_GUIDE', cond: '學生 5 人' },
    broadcast: { stage: 1, src: 'DEV_GUIDE', cond: '學生 7 人' },
    bench: { stage: 2, src: 'DEV_GUIDE', cond: '升上發展學園' },
    locker: { stage: 2, src: 'DEV_GUIDE', cond: '1 年 6 月（時間到解鎖）' },
    shop: { stage: 2, src: 'DEV_GUIDE', cond: '發展學園＋學生 10 人' },
    vending: { stage: 2, src: 'DEV_GUIDE', cond: '福利社×1' },
    weather: { stage: 2, src: 'DEV_GUIDE', cond: '小農場×2' },
    game_corner: { stage: 3, src: 'DEV_GUIDE', cond: '升上有望學園' },
    cafeteria: { stage: 3, src: 'DEV_GUIDE', cond: '有望學園＋態度 75' },
    convenience: { stage: 3, src: 'DEV_GUIDE', cond: '超大型學校（學生 18＋景點 3 種＋第 4 年＋平均 300 分）' },
    // 紀念物：銅像是中期評價獎勵，金像／圖騰柱／宇宙火箭／開羅君系列是後期挑戰與活動獎勵
    statue_br: { stage: 3, src: '推定', cond: '學校評價提升後的紀念物（有望學園前後）' },
    statue_gold: { stage: 4, src: '推定', cond: '名門學園後的高階紀念物（銅像的上位）' },
    totem: { stage: 4, src: '推定', cond: '後期挑戰／活動獎勵' },
    rocket: { stage: 4, src: '推定', cond: '名門學園後的壓軸建物（與天象館同期）' },
    kairo_gold: { stage: 4, src: '推定', cond: '開羅君系列＝全遊戲最終獎勵' },
    kairo_statue: { stage: 4, src: '推定', cond: '開羅君系列＝全遊戲最終獎勵' },

    /* ── 教室與專科 ─────────────────────────────────────── */
    library: { stage: 1, src: 'DEV_GUIDE', cond: '學生 7 人' },
    multi_room: { stage: 2, src: 'DEV_GUIDE', cond: '學生 16 人' },
    home_ec: { stage: 2, src: 'DEV_GUIDE', cond: '頭腦 80' },
    music: { stage: 2, src: 'DEV_GUIDE', cond: '發展學園＋頭腦 90' },
    av_room: { stage: 3, src: 'DEV_GUIDE', cond: '升上有望學園' },
    science: { stage: 3, src: 'DEV_GUIDE', cond: '有望學園＋頭腦 90' },
    art: { stage: 3, src: 'DEV_GUIDE', cond: '音樂室×1＋頭腦 90' },
    computer: { stage: 3, src: 'DEV_GUIDE', cond: '有望學園＋理科室×1' },
    planetarium: { stage: 4, src: 'DEV_GUIDE', cond: '名門學園＋太空人 1 人' },
    // 開局就有的校舍構件
    class: { stage: 1, src: '推定', cond: '一開始就可建（開局地圖已有舊校舍教室）' },
    office: { stage: 1, src: '推定', cond: '一開始就有（開局地圖已有辦公室）' },
    principal: { stage: 1, src: '推定', cond: '一開始就有（全校唯一）' },
    gate: { stage: 1, src: '推定', cond: '一開始就有；加開第二座門要花錢' },
    gate_h: { stage: 1, src: '推定', cond: '一開始就有；加開第二座門要花錢' },
    career: { stage: 3, src: '推定', cond: '進路希望開放後（有望學園前後）' },
    kairo_room: { stage: 4, src: '推定', cond: '開羅君系列＝全遊戲最終獎勵' },

    /* ── 運動與社團 ─────────────────────────────────────── */
    tennis: { stage: 2, src: 'DEV_GUIDE', cond: '發展學園＋運動 40' },
    field: { stage: 2, src: 'DEV_GUIDE', cond: '發展學園＋運動 50' },
    trampoline: { stage: 2, src: 'DEV_GUIDE', cond: '飲水處×2' },
    basketball: { stage: 2, src: 'DEV_GUIDE', cond: '網球場×1＋運動 60' },
    gym: { stage: 3, src: 'DEV_GUIDE', cond: '有望學園＋電腦室×1＋頭腦 95' },
    baseball: { stage: 3, src: 'DEV_GUIDE', cond: '網球場×2＋運動 80' },
    soccer: { stage: 3, src: 'DEV_GUIDE', cond: '棒球場×1＋運動 105' },
    dojo: { stage: 3, src: 'DEV_GUIDE', cond: '體育館×2' },
    pool: { stage: 4, src: 'DEV_GUIDE', cond: '名門學園＋運動 110＋體育館' },
    club: { stage: 2, src: '推定', cond: '社團活動開放後（發展學園前後）' },

    /* ── 動植物農牧 ─────────────────────────────────────── */
    // 小農場是「百葉箱（發展學園）」的前置，所以一定更早；家畜依稀有度排階段，
    // 熊貓／無尾熊／鱷魚／長頸鹿／大象是後期的觀光級飼育設施。
    farm: { stage: 1, src: '推定', cond: '一開始就可建（百葉箱的前置＝小農場×2）' },
    chicken: { stage: 1, src: '推定', cond: '一開始就可建（開局地圖已有養雞小屋）' },
    rabbit: { stage: 2, src: '推定', cond: '基礎家畜，發展學園前後' },
    duck: { stage: 2, src: '推定', cond: '基礎家畜，發展學園前後' },
    pig: { stage: 2, src: '推定', cond: '基礎家畜，發展學園前後' },
    cow: { stage: 3, src: '推定', cond: '大型家畜，有望學園前後' },
    mole: { stage: 3, src: '推定', cond: '稀有飼育，與「生物」景點的理科室／電腦室同期' },
    panda: { stage: 4, src: '推定', cond: '觀光級稀有飼育，名門學園後' },
    koala: { stage: 4, src: '推定', cond: '觀光級稀有飼育，名門學園後' },
    croc: { stage: 4, src: '推定', cond: '觀光級稀有飼育，名門學園後' },
    giraffe: { stage: 4, src: '推定', cond: '觀光級稀有飼育，名門學園後' },
    elephant: { stage: 4, src: '推定', cond: '觀光級稀有飼育，名門學園後' }
};

const STAGE_NAMES = { 1: '開局（農村學園）', 2: '發展學園', 3: '有望學園', 4: '名門學園' };

/* item 的解鎖階段；沒登記的當 1（不擋任何事），呼叫端自行判斷要不要警告 */
function itemStage(id) { return (STAGES[id] && STAGES[id].stage) || 1; }
function itemCond(id) { return (STAGES[id] && STAGES[id].cond) || '—'; }
function itemSrc(id) { return (STAGES[id] && STAGES[id].src) || '未登記'; }

/* 一組 req（可能是「任一個」的陣列）裡「組內最早可用的選項」 */
function groupPick(gr) {
    const opts = Array.isArray(gr) ? gr : [gr];
    return opts.reduce((best, t) => (itemStage(t) < itemStage(best) ? t : best), opts[0]);
}

/* 景點的解鎖階段 = 每組取最早可用的選項後，取全部材料的最大值
   （＝「最晚必須等到的那一階」）。 */
function spotStage(spot) {
    return Math.max(...spot.req.map(gr => itemStage(groupPick(gr))));
}

/* 決定景點階段的那個材料（頁面表格要標「關鍵材料的解鎖條件」） */
function spotKeyItem(spot) {
    const st = spotStage(spot);
    for (const gr of spot.req) {
        const t = groupPick(gr);
        if (itemStage(t) === st) return t;
    }
    return groupPick(spot.req[0]);
}

module.exports = { STAGES, STAGE_NAMES, itemStage, itemCond, itemSrc, groupPick, spotStage, spotKeyItem };

/* 自檢：列出 sim 的 items 註冊表裡還沒登記階段的 id，以及各景點算出來的階段 */
if (require.main === module) {
    require('./towns.js').select('health');
    const E = require('./engine.js');
    const missing = Object.keys(E.items).filter(id => !STAGES[id]);
    console.log('未登記階段的 item：' + (missing.join('、') || '（無）'));
    const extra = Object.keys(STAGES).filter(id => !E.items[id]);
    console.log('表裡有但 items 沒有的 id：' + (extra.join('、') || '（無）'));
    for (let s = 1; s <= 4; s++) {
        const names = E.SPOTS.filter(sp => spotStage(sp) === s)
            .map(sp => sp.name + '(' + E.items[spotKeyItem(sp)].name + ')');
        console.log('階段 ' + s + ' ' + STAGE_NAMES[s] + '：' + names.length + ' 個 → ' + names.join('、'));
    }
    process.exit(missing.length ? 1 : 0);
}
