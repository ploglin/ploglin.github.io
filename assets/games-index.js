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

    /* ---- 即將推出（撐廣度與內鏈；逐步上線） ---- */
    { id: 'hotspring', slug: 'kairosoft/hotspring/', title: '溫泉物語', jp: 'ゆけむり温泉郷', en: 'Hot Springs Story', emoji: '♨️', accent: '#e9f4f6', status: 'soon', type: 'simulator', tags: [['sim', '模擬器']], desc: '溫泉旅館佈局與客源攻略（規劃中）。' },
    { id: 'dungeon-village', slug: 'kairosoft/dungeon-village/', title: '冒險村物語', jp: '冒険ダンジョン村', en: 'Dungeon Village', emoji: '⚔️', accent: '#f1ece2', status: 'soon', type: 'simulator', tags: [['sim', '模擬器']], desc: '冒險者村莊建設與店舖擺放（規劃中）。' },
    { id: 'mega-mall2', slug: 'kairosoft/mega-mall2/', title: '都市大亨物語2', jp: 'メガモール物語2', en: 'Mega Mall Story 2', emoji: '🛍️', accent: '#f3e9ff', status: 'soon', type: 'simulator', tags: [['sim', '模擬器'], ['combo', '樓層 combo']], desc: '百貨商場樓層 combo 最佳化（規劃中）。' },
    { id: 'dream-park', slug: 'kairosoft/dream-park/', title: '遊樂園夢物語', jp: 'ゆうえんち', en: 'Dream Park Story', emoji: '🎡', accent: '#ffeef2', status: 'soon', type: 'simulator', tags: [['sim', '模擬器']], desc: '遊樂園設施擺放與人氣（規劃中）。' },
    { id: 'sushi', slug: 'kairosoft/sushi/', title: '海鮮壽司物語', jp: '海鮮！！すし街道', en: 'The Sushi Spinnery', emoji: '🍣', accent: '#eaf4ee', status: 'soon', type: 'guide', tags: [['guide', '攻略']], desc: '食材與壽司配方攻略（規劃中）。' },
    { id: 'ramen', slug: 'kairosoft/ramen/', title: '開羅拉麵店物語', jp: '大繁盛！ラーメン', en: 'The Ramen Sensei', emoji: '🍜', accent: '#fdeee0', status: 'soon', type: 'database', tags: [['guide', '配方表']], desc: '湯頭與配料研發配方表（規劃中）。' }
];
