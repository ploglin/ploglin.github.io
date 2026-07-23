/* ============================================================
   開羅攻略站 — 遊戲索引 (games-index.js)
   全站共用的遊戲清單；Hub 首頁與各處內鏈皆讀此檔。
   status: 'live'（可用）| 'soon'（即將推出，顯示為 disabled 卡片）
   type:   'simulator' | 'guide' | 'database'
   tags:   顯示用標籤（sim / guide / combo）
   ============================================================ */
window.GAMES = [
    {
        id: 'school2', slug: 'kairosoft/school2/',
        title: '口袋學院物語2', jp: '名門ポケット学院2', en: 'Pocket Academy 2',
        emoji: '🏫', accent: '#e6f4ec',
        status: 'live', type: 'simulator',
        tags: [['sim', '模擬器'], ['combo', '景點 combo'], ['guide', '攻略']],
        desc: '校園佈局模擬器：29 種人氣景點自動判定、放置建議、發展指南與攻略手冊。',
        featured: true
    },
    {
        id: 'ooedo', slug: 'kairosoft/ooedo/',
        title: '大江戶物語', jp: '大江戸タウンズ', en: 'Oh! Edo Towns',
        emoji: '🏯', accent: '#fdeee0',
        status: 'live', type: 'guide',
        tags: [['guide', '攻略'], ['combo', '相鄰 combo']],
        desc: '江戶城下町建設攻略：相鄰 combo 一覽、設施與名產、money 與人口衝刺技巧。',
        featured: true
    },
    {
        id: 'game-dev-story', slug: 'kairosoft/game-dev-story/',
        title: '遊戲發展國++', jp: 'ゲーム発展国++', en: 'Game Dev Story',
        emoji: '🎮', accent: '#e9f0ff',
        status: 'live', type: 'database',
        tags: [['guide', '攻略'], ['combo', '組合表']],
        desc: '開羅招牌作：類型×主題最佳組合查詢表、員工育成、神作衝刺路線。',
        featured: true
    },

    /* ---- 攻略／資料表（陸續擴充） ---- */
    { id: 'hotspring', slug: 'kairosoft/hotspring/', title: '溫泉物語', jp: 'ゆけむり温泉郷', en: 'Hot Springs Story', emoji: '♨️', accent: '#e9f4f6', status: 'live', type: 'guide', tags: [['guide', '攻略'], ['combo', '相性 combo']], desc: '溫泉旅館攻略：設施相性 combo、景色與泡湯衝人氣。' },
    { id: 'mega-mall2', slug: 'kairosoft/mega-mall2/', title: '都市大亨物語2', jp: 'メガモール物語2', en: 'Mega Mall Story 2', emoji: '🛍️', accent: '#f3e9ff', status: 'live', type: 'database', tags: [['guide', '攻略'], ['combo', '樓層 combo']], desc: '百貨商場攻略：樓層＋貼合三件套 combo 43 組全表。' },
    { id: 'dream-town', slug: 'kairosoft/dream-town/', title: '夢想小鎮', jp: '夢おこ町ドリームタウン', en: 'Dream Town Story', emoji: '🏘️', accent: '#e9f0ff', status: 'live', type: 'database', tags: [['guide', '攻略'], ['combo', 'combo 城建']], desc: '城鎮建設攻略：相鄰 combo 精選表（全 184 組）與地價衝分。' },
    { id: 'dream-park', slug: 'kairosoft/dream-park/', title: '遊樂園夢物語', jp: 'ゆうえんち', en: 'Dream Park Story', emoji: '🎡', accent: '#ffeef2', status: 'live', type: 'guide', tags: [['guide', '攻略']], desc: '遊樂園攻略：裝飾加成、主題區域與衝人氣佈局。' },
    { id: 'dungeon-village', slug: 'kairosoft/dungeon-village/', title: '冒險村物語', jp: '冒険ダンジョン村', en: 'Dungeon Village', emoji: '⚔️', accent: '#f1ece2', status: 'live', type: 'guide', tags: [['guide', '攻略']], desc: '冒險村攻略：冒險者轉職養成與維護費控管。' },
    { id: 'ramen', slug: 'kairosoft/ramen/', title: '開羅拉麵店物語', jp: '大繁盛！ラーメン', en: 'The Ramen Sensei', emoji: '🍜', accent: '#fdeee0', status: 'live', type: 'database', tags: [['guide', '攻略'], ['combo', '配方表']], desc: '拉麵攻略：麵湯相性、湯頭 combo 與配料練級。' },
    { id: 'bonbon', slug: 'kairosoft/bonbon/', title: '甜點物語', jp: '洋菓子店ローズ', en: 'Bonbon Cakery', emoji: '🍰', accent: '#ffeef2', status: 'live', type: 'database', tags: [['guide', '攻略'], ['combo', '食譜表']], desc: '甜點攻略：疊料 combo 順序、卡路里上限與食譜表。' },
    { id: 'sushi', slug: 'kairosoft/sushi/', title: '海鮮壽司物語', jp: '海鮮！！すし街道', en: 'The Sushi Spinnery', emoji: '🍣', accent: '#eaf4ee', status: 'live', type: 'database', tags: [['guide', '攻略'], ['combo', '相性表']], desc: '壽司攻略：握壽司相性 A–F、招牌金策與顧問技巧。' },
    { id: 'high-sea-saga', slug: 'kairosoft/high-sea-saga/', title: '大海賊探險物語', jp: '大航海クエスト島', en: 'High Sea Saga', emoji: '🏴‍☠️', accent: '#e6f4ec', status: 'live', type: 'database', tags: [['guide', '攻略']], desc: '航海育成攻略：49 職業輪替與六色蛋孵怪配方。' },
    { id: 'beastie-bay', slug: 'kairosoft/beastie-bay/', title: '開拓神秘島', jp: '冒険とバザーとダンジョン島', en: 'Beastie Bay', emoji: '🏝️', accent: '#e9f4f6', status: 'live', type: 'database', tags: [['guide', '攻略']], desc: '荒島攻略：捕獸、五屬性相剋與礦石合成鏈表。' },
    { id: 'grand-prix', slug: 'kairosoft/grand-prix/', title: '賽車物語', jp: 'G1グランプリ', en: 'Grand Prix Story', emoji: '🏎️', accent: '#fdeee0', status: 'live', type: 'guide', tags: [['guide', '攻略']], desc: '賽車攻略：車手技師與賽車零件育成、光環與結算。' },
    { id: '8bit-farm', slug: 'kairosoft/8bit-farm/', title: '像素牧場物語', jp: '8ビットファーム', en: '8-Bit Farm', emoji: '🌾', accent: '#e6f4ec', status: 'live', type: 'guide', tags: [['guide', '攻略'], ['combo', '設施 combo']], desc: '牧場攻略：設施 combo 與作物四維、Farm Mart 解鎖。' }
];
