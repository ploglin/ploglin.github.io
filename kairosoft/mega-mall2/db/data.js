window.GAME_DB = {
  game: { id: 'mega-mall2', title: '都市大亨物語2' },
  categories: [
    {
      key: 'combos', slug: 'combos', label: '組合 combo', icon: '🧩',
      intro: '全 43 組「同層貼合三件套 combo」：把三種指定店舖／設施排在同一樓層、彼此邊緣緊貼即觸發，對其加上 Rep（名聲）／Price（單價）加成，少數改加 Qual（品質）。把整塊擺到「理想樓層」可再疊加樓層相容加成；「任意」代表無共同理想樓層、可靈活安排。',
      columns: ['#', 'Combo 名稱', '三件套', '加成', '理想樓層'],
      rows: [
        ['1', 'Kids Floor', 'Capsule Machines＋Retro Candy Shop＋Vending Machine', 'Rep +10 / Price +10', '1F, 5F'],
        ['2', 'Shopping Floor', 'Butcher＋Produce Counter＋Seafood Counter', 'Rep +15 / Price +10', 'B2F, B1F, 1F'],
        ['3', 'Popular Floor', 'Noodle Shop＋Rest Area＋Bookstore', 'Rep +10 / Price +20', '任意'],
        ['4', 'Essentials Floor', 'Florist＋Retro Candy Shop＋Bakery', 'Rep +15 / Price +10', '1F'],
        ['5', 'Adorable Floor', 'Florist＋Cake Shop＋Clothing Store', 'Rep +20 / Price +10', '2F'],
        ['6', 'Amazing Floor', 'Burger Bar＋Noodle Shop＋Restaurant', 'Rep +30 / Price +15', 'B3F, B1F, 1F, 5F'],
        ['7', 'Snacks Floor', 'Bakery＋Decorative Plants＋Cafe', 'Rep +15 / Price +15', '任意'],
        ['8', 'Hype Floor', 'Capsule Machines＋Toy Shop＋Game Store', 'Rep +20 / Price +20', '2F, 5F'],
        ['9', 'Comfort Floor', '24-7 Mart＋Dollar Store＋Drugstore', 'Rep +30 / Price +20', '10F'],
        ['10', 'Electronics Floor', 'PC Shop＋Electronics Store＋Smartphone Store', 'Rep +30 / Price +15', '6F–12F'],
        ['11', 'Laid Back Floor', 'Payphone＋Vending Machine＋Rest Area', 'Qual +10 / Price +5', '1F'],
        ['12', 'Grocery Floor', 'Gourmet Deli＋Cake Shop＋Produce Counter', 'Rep +30 / Price +10', 'B2F, B1F, 1F'],
        ['13', 'Classy Floor', 'Shoe Shop＋Clock Kiosk＋Optometrists', 'Rep +35 / Price +10', 'B8F'],
        ['14', 'Lifestyle Floor', 'Produce Counter＋Service Counter＋Payphone', 'Rep +10 / Price +12', '任意'],
        ['15', 'Lucky Floor', 'Prize Draw Ticket＋Fortune Teller＋Raffle Shop', 'Rep +20 / Price +12', '10F'],
        ['16', 'Relaxation Floor', 'Rest Area＋Aromatherapy Outlet＋Vending Machine', 'Qual +30 / Price +10', '任意'],
        ['17', 'Music Floor', 'Music Store＋Stereo Shop＋Music Shop', 'Rep +20 / Price +15', '任意'],
        ['18', 'Study Floor', 'Bookstore＋Service Counter＋ATM', 'Rep +5 / Price +20', '任意'],
        ['19', 'Amusement Floor', 'Indoor Court＋Karaoke＋Tapas Bar', 'Rep +20 / Price +15', '5F'],
        ['20', 'Entertainment Floor', 'Balloon Column＋Game Arcade＋Coin Lockers', 'Rep +35 / Price +15', '任意'],
        ['21', 'Theater Floor', 'Stereo Shop＋Popcorn Machine＋Movie Theater', 'Rep +35 / Price +10', '2F–5F'],
        ['22', 'Fashion Floor', 'Shoe Store＋Clothing Store＋Luxury Boutique', 'Rep +40 / Price +15', '2F, 5F'],
        ['23', 'Fun & Games Floor', 'Game Arcade＋Go Kart Course＋Indoor Ski Slope', 'Rep +35 / Price +15', '任意'],
        ['24', 'Refined Floor', 'Sushi Restaurant＋Camera Store＋Sauna', 'Rep +40 / Price +15', 'B7F'],
        ['25', 'Jewelry Floor', 'Gift Shop＋Furniture Shop＋Jewelry Shop', 'Rep +35 / Price +15', 'B8F, 1F, 2F'],
        ['26', 'Model Floor', 'Hair Salon＋Nail Salon＋Cosmetics Counter', 'Rep +35 / Price +15', '任意'],
        ['27', 'Celebrity Floor', 'Jewelry Shop＋Luxury Boutique＋Chandelier', 'Rep +35 / Price +30', '10F'],
        ['28', 'Luxury Floor', 'Gourmet Restaurant＋Mall Hotel＋Planetarium', 'Qual +5 / Price +30', '任意'],
        ['29', 'Scenery Floor', 'Bar＋Restaurant＋Observation Deck', 'Rep +30 / Price +30', '任意'],
        ['30', 'Drinks Floor', 'Vending Machine＋Cafe＋Bar', 'Rep +30 / Price +20', '任意'],
        ['31', 'Food Floor', 'Retro Candy Shop＋Octopus Fritter Stall＋Produce Counter', 'Rep +30 / Price +20', '任意'],
        ['32', 'Academic Floor', 'Community Classes＋Fossil Exhibit＋Aquarium', 'Qual +40 / Price +20', '8F–10F'],
        ['33', 'Dating Floor', 'Rest Area＋Outdoor Pool＋Monument', 'Rep +30 / Price +30', '任意'],
        ['34', 'Scenic Floor', 'Observation Deck＋Indoor Waterfall＋Art', 'Rep +30 / Price +35', '8F, 12F'],
        ['35', 'Festival Floor', 'Octopus Fritter Stall＋Cotton Candy Machine＋Goldfish Scooper', 'Rep +30 / Price +35', '任意'],
        ['36', 'Shopping Floor（時尚）', 'Clothing Shop＋Show Window＋Hat Shop', 'Rep +30 / Price +35', '2F–5F'],
        ['37', 'Animal Floor', 'Pet Shop＋Goldfish Scooper＋Mall Farm', 'Rep +30 / Price +35', '任意'],
        ['38', 'Party Floor', 'Concert Hall＋Disco Ball＋Karaoke', 'Rep +30 / Price +35', '任意'],
        ['39', 'Sports Floor', 'Sporting Goods Store＋Baseball Emporium＋Indoor Court', 'Rep +30 / Price +35', '任意'],
        ['40', 'Medical Floor', 'Rest Area＋Clinic＋Drugstore', 'Qual +50 / Price +35', '任意'],
        ['41', 'Crafts & Trades Floor', 'Seven Eel-even＋Sushi Restaurant＋Japanese Food', 'Rep +30 / Price +40', '5F'],
        ['42', 'Buffet Floor', 'Burger Bar＋Kebab House＋Steak House', 'Rep +40 / Price +40', 'B6F, 10F, 12F'],
        ['43', 'Cutesy Floor', 'Cutie Corner＋Aromatherapy Outlet＋Block Shop', 'Qual +40 / Price +40', '任意']
      ]
    },
    {
      key: 'stores', slug: 'stores', label: '店舖分類', icon: '🏬',
      intro: '店舖是商場的評分主體，會賣東西、產生營收。依用途分為五大類再加設施類；設施多為裝飾、不一定賣東西，靠「接觸」把數值傳給緊貼的店舖。',
      columns: ['分類', '代表店舖', '備註'],
      rows: [
        ['Food 食品', 'Restaurant 餐廳・Noodle Shop 麵店・Sushi Restaurant 壽司店・Bakery 麵包店・Cake Shop 蛋糕店・Cafe 咖啡廳', 'combo 主力來源'],
        ['Electronics 電器', 'PC Shop 電腦店・Electronics Store 電器行・Smartphone Store 手機店・Camera Store 相機店・Stereo Shop 音響店', 'Electronics Floor 高樓層'],
        ['Home 居家', '24-7 Mart 便利商店・Dollar Store 均一價・Drugstore 藥妝・Furniture Shop 家具・Florist 花店', '早期現金流'],
        ['Beauty 美容時尚', 'Hair Salon 美髮・Nail Salon 美甲・Cosmetics Counter 化妝品・Clothing Store 服飾・Shoe Shop 鞋店・Luxury Boutique 精品・Jewelry Shop 珠寶', 'Fashion／Model combo'],
        ['Entertainment 娛樂', 'Movie Theater 電影院・Game Arcade 遊藝場・Karaoke・Concert Hall 演奏廳・Aquarium 水族館・Planetarium 天文館・Observation Deck 觀景台', '造價高、加成也高'],
        ['Facilities 設施', 'ATM・Decorative Plants 裝飾植栽・Lion Statue 獅子像・Restrooms 洗手間・Chandelier 吊燈', '緊貼店舖傳遞數值、不吃樓層加成']
      ]
    },
    {
      key: 'structures', slug: 'structures', label: '建築三大類', icon: '🏗️',
      intro: '商場的可放置結構分三大類。理解各類特性有助於規劃佈局：只有「店舖」有樓層相容加成，交通與設施都沒有。',
      columns: ['類別', '說明', '樓層加成'],
      rows: [
        ['移動／通道 Move/Path', '搬移／拆除、鋪走道與樓梯，以及交通工具（巴士站、地鐵、直升機坪），把遠方顧客帶進商場。屬交通、非店舖。', '無（無樓層相容性）'],
        ['店舖 Stores', '會賣東西、產生營收，是評分主體。combo 與樓層加成都堆在店舖的 Rep／Price／Qual 上。', '有（依樓層相容性）'],
        ['設施 Facilities', '多為裝飾、不一定賣東西，但會提升所有與其接觸的結構數值；靠「接觸」傳遞，沒接觸到店舖等於白蓋。', '不吃樓層加成']
      ]
    }
  ]
};
