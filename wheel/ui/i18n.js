// 文案集中檔（zh-TW）——文案 lint 的目標（E.1、F.1 驗收 15）。
// 規則：不用「重抽」「權重」「不參加」、不用全形驚嘆號、不用 emoji；用「作廢」「補抽」「籤數」「排除」。
// 舞台文案在 ./i18n-stage.js（舞台 agent 維護），這裡合併後一併輸出，讓 lint 只需掃一處入口。
import * as stageMod from './i18n-stage.js';

/** 舞台文案（default export 物件與具名 export 都收） */
export const STAGE = { ...(stageMod.default || {}), ...Object.fromEntries(Object.entries(stageMod).filter(([k]) => k !== 'default')) };

export const APP_NAME = '轉盤抽獎';

export const SCENARIO_LABEL = { banquet: '尾牙', stream: '直播', classroom: '課堂點名', host: '抽主持人', custom: '自訂' };
export const SCENARIO_HINT = {
  banquet: '不重複得獎、主持人確認、大獎兩段式、音效與彩帶',
  stream: '不重複得獎、自動翻牌、轉動 5 秒',
  classroom: '可重複點到、免確認、無音效',
  host: '自動建好主持人名額、開轉前先打鼓、轉動 8 秒',
  custom: '從尾牙的預設值開始自己調',
};

export const STATUS_LABEL = { draft: '草稿', live: '進行中', closed: '已結束' };
export const PRIZE_STATUS_LABEL = { pending: '待抽', active: '進行中', done: '已抽完', skipped: '已跳過' };
export const DRAW_STATUS_LABEL = { pending: '待確認', confirmed: '已確認', voided: '作廢' };

export const EXCLUDE_REASON_LABEL = { probation: '試用期', staff: '工作人員', manager: '主管自願', 'imported-zero': '匯入籤數 0', other: '其他' };
/** 排除原因顯示文字：不顯示籤數時（showWeights = false），「匯入籤數 0」改說「匯入時標為不抽」 */
export function excludeReasonLabel(r, showWeights = true) { return r === 'imported-zero' && !showWeights ? '匯入時標為不抽' : (EXCLUDE_REASON_LABEL[r] || ''); }
/** 名單頁可選的排除原因（imported-zero 只由匯入產生） */
export const EXCLUDE_REASON_CHOICES = ['probation', 'staff', 'manager', 'other'];

export const VOID_REASON_LABEL = { absent: '不在場', declined: '棄權', ineligible: '不符資格', duplicate: '重複得獎', misclick: '誤觸', other: '其他' };

export const WHEEL_MODE_LABEL = { auto: '自動', full: '完整', compact: '緊湊', sampled: '抽樣', reel: '滾輪' };
export const STAGE_THEME_LABEL = { midnight: '午夜', festive: '喜慶', plain: '素色' };

export const POOL_STAT_LABEL = {
  winners: '已得獎', excluded: '排除', ineligible: '資格不符', absent: '未到場不保留', pending: '待確認中', samePrize: '此獎已作廢過',
};

export const T = {
  // 共用
  cancel: '取消', ok: '確定', save: '儲存', close: '關閉', next: '下一步', back: '上一步', del: '刪除', edit: '編輯', more: '更多動作',
  undo: '復原', saved: '已儲存',
  saveError: '存檔失敗，請匯出備份以免資料遺失',
  lockedElsewhere: '這場活動正在另一個分頁的舞台中，設定暫時不能修改。請在舞台分頁操作，或先退出舞台。',
  lockedBanner: '這場活動正在另一個分頁的舞台中，這裡暫時唯讀。',
  degraded: '這個瀏覽器目前無法長期保存資料（可能是私密視窗或封鎖了網站資料），關閉分頁後資料就會消失。請記得匯出備份。',
  notFound: '找不到這場活動，可能已被刪除。',
  genericError: '發生錯誤，請重新整理頁面再試一次',

  // 活動列表
  homeTitle: '我的活動',
  themeToDark: '切換為深色', themeToLight: '切換為淺色',
  homeNote: '資料只存在這台電腦的瀏覽器裡，換電腦或清除瀏覽紀錄就會不見，記得匯出備份。',
  createEvent: '建立活動', importBackup: '匯入備份', searchEvents: '搜尋活動',
  emptyTitle: '建立第一場活動',
  emptySteps: ['匯入名單：Excel、CSV 或直接貼上', '設好獎項與名額', '先彩排一遍，再正式開始'],
  rehearse: '彩排', startLive: '正式開始', enterStage: '進入舞台', viewRecords: '查看紀錄',
  needRosterPrizes: '名單與獎項都設好後才能進舞台',
  unfinishedRehearsal: '有未結束的彩排',
  menuDuplicate: '複製活動', menuDuplicateRoster: '複製名單建立新活動', menuExport: '匯出備份', menuCarry: '帶到另一台電腦',
  menuRestoreRehearsal: '還原最近丟棄的彩排', menuClose: '結束活動', menuReopen: '重新開啟', menuDelete: '刪除',
  noDate: '未設日期',

  // 建立活動
  createTitle: '建立活動', fName: '名稱', fDate: '日期', fScenario: '情境',
  hostWithRecorder: '同時抽一位記錄人（先抽記錄人，最後抽主持人）',
  scenarioNote: '情境只是一次帶好預設值，之後都能在設定裡改。',
  absentQ: '未到場或棄權而作廢的人，之後的獎項還能被抽到嗎？',
  absentKeep: '保留資格（建議）', absentKeepHint: '例如抽到時剛好去洗手間，之後的獎項仍有機會',
  absentDrop: '不保留', absentDropHint: '作廢後本場不再抽到他',
  absentLater: '之後再決定', absentLaterHint: '第一次作廢時再問',
  createBtn: '建立', nameRequired: '請輸入活動名稱',

  // 匯入備份
  badBackup: '這不是轉盤抽獎的備份檔，或檔案已損壞。',
  tooNew: '這份備份來自較新的版本，請重新整理頁面更新後再匯入。',
  conflictTitle: '這台電腦已有同一場活動',
  conflictReplace: '以備份取代', conflictCopy: '另存一份',
  imported: (name) => `已匯入「${name}」`,

  // 帶到另一台電腦
  carryTitle: '帶到另一台電腦',
  carrySteps: ['下載備份檔，用隨身碟、雲端硬碟或寄信帶過去。', '在新電腦打開 ploglin.cc/wheel，按「匯入備份」選這個檔案。'],
  carryBtn: '下載備份檔',

  // 刪除
  deleteTitle: (name) => `刪除「${name}」`,
  deleteText: '名單、獎項與中獎紀錄都會一起刪除，而且無法復原。',
  deleteWord: '刪除', exportFirst: '先匯出備份',
  deleted: (name) => `已刪除「${name}」`,

  closeConfirm: '結束後活動變成唯讀，之後仍可重新開啟。',
  closed: '活動已結束', reopened: '活動已重新開啟',
  restoredRehearsal: '已還原最近丟棄的彩排，下次進舞台可以接續',
  cannotRestoreRehearsal: '無法還原：彩排丟棄後活動內容已有變動',

  // 設定模式外框
  backToList: '活動列表',
  tabParticipants: '名單', tabPrizes: '獎項', tabSettings: '設定', tabRecords: '紀錄',

  // 名單
  addPerson: '新增', import: '匯入', exportLong: '匯出名單 CSV（一列一人）', exportWide: '匯出寬表 CSV（一欄一群組）',
  dedupe: '檢查重複', selectAll: '全選', selectNone: '取消全選',
  searchPeople: '搜尋姓名、群組或編號', viewByGroup: '依群組', viewList: '清單',
  filterAll: '全部', filterEligible: '可抽', filterExcluded: '排除', filterWinners: '已得獎', filterSameName: '同名異組',
  weight: '籤數', exclude: '排除', excludeReason: '排除原因', won: '得獎',
  groupSetWeight: '設籤數', groupExcludeAll: '排除全組', groupRestoreAll: '取消排除全組', groupRename: '重新命名群組',
  onlyWeightOne: '僅套用到籤數為 1 的人',
  statsTitle: '統計', groupsTitle: '群組',
  statEligible: '可抽', statWinners: '已得獎', statExcluded: '排除', statSameName: '同名異組',
  ungrouped: '未分組',
  batchSelected: (n) => `已選 ${n} 人`,
  batchWeight: '設籤數', batchExclude: '排除', batchRestore: '取消排除', batchMove: '移到群組', batchTag: '加標籤', batchDelete: '刪除',
  newGroup: '新群組…',
  emptyRosterTitle: '把 Excel / CSV 拖到這裡，或貼上名單',
  emptyRosterNote: 'Excel 兩種排法都可以：一列一人，或一欄一個群組往下列名字。',
  pastePlaceholder: '每行一個名字；也可以從 Excel 直接複製貼上',
  pasteNext: '下一步',
  chooseFile: '選擇檔案',
  personTitleAdd: '新增參加者', personTitleEdit: '編輯參加者',
  fPersonName: '姓名', fGroup: '群組', fCode: '編號', fNote: '備註', fTags: '標籤（以頓號分隔）',
  addAndNext: '新增並繼續', added: (n) => `已新增 ${n}`,
  cannotDeleteWinner: (n) => `${n} 人已有抽獎紀錄，不能刪除，可改用排除`,
  toastExcluded: (who, n) => `已排除 ${who}${n} 人`,
  toastRestored: (n) => `已取消排除 ${n} 人`,
  toastWeight: (who, n, w) => `已把 ${who}${n} 人的籤數設為 ${w}`,
  toastMoved: (n, g) => `已把 ${n} 人移到「${g}」`,
  toastTagged: (n, t) => `已為 ${n} 人加上標籤「${t}」`,
  toastDeleted: (n) => `已刪除 ${n} 人`,
  toastImported: (n, g) => `已匯入 ${n} 人${g ? `、${g} 個群組` : ''}`,
  setWeightByGroup: '依群組設籤數',
  ticketsOn: '已啟用籤數：在名單頁可為每個人或整個群組設定籤數',
  dedupeTitle: '檢查重複',
  dedupeNone: '沒有發現重複的人。',
  dedupeL1: '完全相同（同編號，或同姓名同群組）',
  dedupeL2: '同名不同群組：會視為兩個人，舞台上自動顯示群組',
  dedupeL3: '疑似同一人（姓名只差一字、同群組）',
  dedupeKeepAll: '都保留', dedupeKeep: '保留這位',
  dedupeApply: '套用',
  dedupeDone: (n) => `已移除 ${n} 筆重複`,

  // 匯入對話框
  importTitle: '匯入名單',
  stepSource: '來源', stepFormat: '格式', stepPreview: '預覽',
  tabFile: '檔案', tabPaste: '貼上', tabTemplate: '範本',
  dropHere: '把檔案拖到這裡，或',
  fileTypes: '支援 .xlsx、.xls、.csv、.tsv、.txt',
  loadingXlsx: '正在載入 Excel 解析元件（約 400 KB）',
  xlsxOffline: '無法載入 Excel 解析元件，可能是離線中。請在 Excel 選「另存新檔 → CSV UTF-8」，再匯入 CSV 檔。',
  readFail: '讀不到檔案內容，請確認檔案格式。',
  emptyGrid: '檔案裡沒有找到任何名字。',
  sheet: '工作表',
  uncertain: '不確定，請確認格式',
  fmtWide: '寬表：第 1 列是群組名稱，每欄往下是名字',
  fmtLong: '長表：一列一人（需欄位對應）',
  firstRowGroups: '第 1 列是群組名稱',
  firstRowHeader: '第 1 列是欄位名稱',
  cleanTitle: '清理',
  cleanFixed: '去頭尾空白 · 略過空白格',
  cleanSplit: '拆分「、」「/」等一格多名',
  cleanSkipBad: '跳過不像姓名的格（純數字、網址、過長）',
  mapField: { name: '姓名', group: '群組', code: '編號', weight: '籤數', excluded: '排除', tags: '標籤', note: '備註', '': '不匯入' },
  needNameCol: '請指定哪一欄是姓名',
  unnamedGroup: '這欄沒有標題，請命名',
  previewN: (n) => `預覽 ${n} 人`,
  willAdd: (n, g, s) => `將新增 ${n} 人${g ? `（${g} 群組）` : ''} · 跳過 ${s}`,
  conflictDup: (n) => `與現有名單重複 ${n} 人`,
  conflictSkip: '跳過', conflictOverwrite: '覆蓋', conflictBoth: '都留',
  conflictSameName: (n) => `同名不同群組 ${n} 人`,
  sameSeparate: '視為不同人', sameMerge: '合併',
  conflictSimilar: (n) => `疑似同一人 ${n} 人（已標黃，會照常新增）`,
  doImport: '匯入',
  legendMulti: '一格多名，已拆開', legendBad: '不像姓名，已跳過', legendDup: '與現有名單重複', legendSimilar: '疑似同一人',
  moreRows: (n) => `另有 ${n} 筆未顯示`,
  templateLong: '長表範本 CSV（一列一人）', templateWide: '寬表範本 CSV（一欄一群組）',
  templateNote: '範本是示範用的假名，下載後把名字換成自己的名單即可。',

  // 獎項
  addPrize: '新增獎項', applyTemplate: '套用範本',
  prizeOrderNote: '抽獎順序（拖拉排序，由小獎到大獎；舞台可用 P 隨時切換）',
  emptyPrizes: '還沒有獎項',
  templateHint: '套用範本：普獎 / 四獎 / 三獎 / 二獎 / 一獎 / 頭獎，一鍵建好 6 項，之後再改名稱與名額。',
  bigPrize: '大獎（兩段式）',
  quota: '名額', perDraw: '每次抽', eligibility: '資格',
  eligAll: '全部', eligInclude: '只有', eligExclude: '排除',
  candidates: (n) => `候選 ${n} 人`,
  candidatesZero: '候選 0 人',
  bonusTag: (n) => `+${n} 加碼`,
  moveUp: '上移', moveDown: '下移', duplicatePrize: '複製', closeRemaining: '關閉剩餘名額', deletePrize: '刪除獎項',
  cannotDeletePrize: '已有抽獎紀錄的獎項不能刪除，可改用「關閉剩餘名額」',
  prizeDeleted: (n) => `已刪除「${n}」`,
  templateApplied: '已建立 6 個獎項',
  closeRemainingConfirm: '剩餘名額會關閉，舞台上不再抽這個獎。之後仍可在紀錄頁或舞台加碼。',

  // 獎項抽屜
  drawerAdd: '新增獎項', drawerEdit: '編輯獎項',
  fPrizeName: '名稱', fDesc: '說明', fQuota: '名額', fPerDraw: '每次抽幾名',
  fElig: '參加資格', fRepeat: '重複得獎',
  eligModeAll: '所有人', eligModeInclude: '只有這些群組', eligModeExclude: '排除這些群組',
  noGroups: '名單還沒有群組。',
  eligibleNow: (n) => `符合且可抽 ${n} 人`,
  repeatInherit: (on) => `沿用活動規則（目前：${on ? '允許' : '不允許'}）`,
  repeatAllow: '允許', repeatDeny: '不允許',
  hasRecordsQuota: (min) => `已有抽獎紀錄，名額不能少於 ${min}`,
  hasRecordsElig: '已有得獎紀錄；改資格不會影響已抽出的結果，不符的人會在紀錄頁標示。',
  bonusLogTitle: '加碼紀錄',
  discardChanges: '放棄尚未儲存的修改？',
  discard: '放棄修改',
  prizeNameRequired: '請輸入獎項名稱',

  // 紀錄
  recordsTitle: '中獎紀錄',
  exportCsv: '匯出 CSV', exportWinners: '中獎名單 CSV', exportWinnersAll: '中獎名單 CSV（含作廢）', exportAudit: '稽核 CSV',
  print: '列印',
  viewByPrize: '依獎項', viewByTime: '依時間', showVoided: '顯示作廢',
  colSeq: '#', colWinner: '得獎者', colGroup: '群組', colCode: '編號', colTime: '時間', colStatus: '狀態', colPrize: '獎項',
  noRecords: '還沒有中獎紀錄。進舞台正式抽獎後，結果會出現在這裡。',
  voidAction: '作廢', restoreAction: '恢復作廢', editVoidAction: '修改作廢原因・備註', auditAction: '查看稽核', gotoRoster: '跳到名單',
  voidTitle: (name) => `作廢：${name}`,
  voidText: '這筆得獎改為無效，紀錄會保留。名額退回後，可在舞台補抽。',
  editVoidTitle: '修改作廢原因・備註',
  fVoidReason: '原因', fVoidNote: '備註',
  edited: '已修改',
  redrawnBy: (seq) => `補抽 #${seq}`,
  redrawOf: (seq) => `補抽 #${seq}`,
  restoreWhy: { 'redraw-active': '補抽的那一筆仍有效，請先作廢補抽那筆', 'no-quota': '這個獎已沒有名額', 'won-elsewhere': '此人已在其他獎項得獎', 'no-prize': '獎項已不存在', 'not-voided': '這筆沒有作廢' },
  ineligibleNow: '不符目前資格',
  revertBonus: '撤回', bonusReverted: '已撤回',
  logTitle: '活動日誌', auditTitle: '稽核資訊',
  rosterChanged: (a, b) => `第 ${a} 與 ${b} 抽之間名單有異動`,
  voidedToast: (name) => `已作廢 ${name}，可在舞台補抽`,
  restoredToast: (name) => `已恢復 ${name}`,

  // 設定
  secEvent: '活動', secRules: '規則', secStage: '舞台', secWheel: '轉盤', secReveal: '揭曉', secMood: '氣氛', secData: '資料',
  rulesLocked: '有正式紀錄後鎖定',
  fStageTitle: '舞台標題', sameAsName: '同名稱',
  sAllowRepeat: '允許重複得獎', sAllowRepeatHint: '每個獎項可在獎項頁單獨覆寫',
  sAbsentKeep: '未到場者保留後續資格', sAbsentKeepHint: '作廢（不在場、棄權）的人之後仍可被抽到',
  sAbsentUndecided: '尚未決定，第一次作廢時會問',
  keep: '保留', drop: '不保留',
  sRng: '隨機來源', rngCsprng: '系統安全亂數', rngSeeded: '固定種子（可驗證）', seed: '種子', newSeed: '換一組', copy: '複製', copied: '已複製',
  sProjection: '投影模式', sProjectionHint: '進舞台即隱藏操作介面，滑鼠閒置 2 秒隱藏游標',
  sClicker: '簡報筆模式', sClickerHint: 'PageDown 等同 Space；F5 與 . 會被攔下；加碼改用 Shift+B。簡報筆沒有 Enter，確認請用筆電鍵盤。',
  sVoidKeys: '作廢原因鍵位對照', sVoidKeysHint: '鏡像投影時作廢條不顯示原因文字，請在此記住。',
  sArm: '大獎兩段式', sArmHint: '第一次 Space 預備、第二次開轉',
  armOff: '關', armLast: (n) => `最後 ${n} 個獎項`,
  sWait: '等人上台倒數', off: '關', seconds: (n) => `${n} 秒`,
  sWheelMode: '模式', wheelNow: (n, m) => `目前名單 ${n} 人 → ${m}（1080p 投影）`,
  sSectorBy: '扇區大小', sectorWeight: '依籤數', sectorEqual: '等分（標 ×n）',
  sSpin: '轉動時間',
  previewWheel: '以投影尺寸預覽轉盤',
  advanced: '進階', thresholds: '門檻（完整 / 緊湊 / 抽樣）', sampledSectors: '抽樣格數',
  sShowGroup: '顯示群組', sShowCode: '顯示編號', sDisamb: '同名者加註群組',
  sFlip: '揭曉牆翻牌', flipByCount: '依人數（6 名以下手動、7–12 自動）', flipManual: '一律手動', flipAuto: '一律自動',
  sAutoConfirm: '自動確認', sAutoConfirmHint: '倒數只在主持端顯示',
  autoConfirmNone: '免確認',
  sSound: '音效', sTick: '轉動', sFanfare: '中獎', sDrum: '鼓聲', sConfetti: '彩帶',
  sMotion: '動態效果', motionSystem: '跟隨系統', motionFull: '完整', motionReduced: '減少',
  sTheme: '舞台主題',
  exportBackup: '匯出備份', carry: '帶到另一台電腦',
  autoBackups: (n) => `自動備份 ${n} 份`, restoreBackup: '還原…',
  backupsTitle: '自動備份',
  backupsNote: '每次進舞台（含彩排）前會自動存一份，保留最近 3 份。還原會以備份取代目前內容。',
  noBackups: '還沒有自動備份。第一次進舞台時會建立。',
  restoreThis: '還原這份',
  restoreConfirm: '目前的名單、獎項與紀錄會被這份備份取代。',
  restoredBackup: '已還原備份',
  closeEvent: '結束活動', reopenEvent: '重新開啟', deleteEvent: '刪除活動',
  scenarioApplyQ: (n) => `要套用「${n}」情境的預設值嗎？`,
  scenarioApplyText: '轉動時間、自動確認、投影模式、大獎兩段式、翻牌、音效與彩帶會改成這個情境的預設值。',
  scenarioApplyText2: '規則已鎖定，不會變動。',
  applyDefaults: '套用預設值', keepCurrent: '只改情境名稱',

  // 轉盤預覽
  pvTitle: '以投影尺寸預覽轉盤',
  pvRes: '解析度', pvScreen: '幕寬', pvMeters: '公尺', pvProjection: '投影模式（無操作介面）', pvPool: '候選範圍',
  pvAll: '整份名單（排除者除外）',
  pvMode: (m) => `呈現：${m}`,
  pvFont: (px) => `扇區姓名 ${px} px`,
  pvRead: (cm, m, lim) => `名字高約 ${cm} cm，約 ${m} m 內可舒適閱讀（極限約 ${lim} m）`,
  pvLens: (m) => `放大鏡中的姓名約 ${m} m 內可讀；揭曉畫面的姓名全場可讀`,
  pvEqualAuto: '扇區太窄，已自動改為等分顯示；中獎機會仍依籤數',
  pvSampledAuto: '這個尺寸放不下所有名字，已自動改為抽樣 36 格',
  pvForcedReel: '名單超過 5000 人，固定使用滾輪',
  pvReel: '滾輪模式：單一垂直滾輪減速停在得獎者，這裡不另外預覽',
  pvTooFew: '候選少於 2 人時舞台會跳過轉盤直接揭曉',
  pvDiameter: (d) => `轉盤直徑 ${d} px`,
  pvNote: '預覽以實際投影像素繪製後縮小顯示；可讀距離以「字高 × 200」估算。',

  // 舞台入口
  stageMissing: '舞台模組尚未就緒，請稍後重新整理。',

  // 手機版（≤ 720 px）
  filter: '篩選', filterTitle: '篩選與檢視', filterView: '檢視', filterStatus: '狀態', filterJump: '跳到群組', filterDone: '完成',
  addMenu: '新增或匯入', addOne: '新增一人', importRoster: '匯入名單',
  peopleSub: (n, g, ok, won, ex) => `${n} 人${g ? ` · ${g} 群組` : ''} · 可抽 ${ok} · 已得獎 ${won}${ex ? ` · 排除 ${ex}` : ''}`,
  tagExcluded: '排除', tagWon: '得獎',
  exportMenu: '匯出',
  recordsSub: (c, v, p) => `已確認 ${c} · 作廢 ${v} · 待確認 ${p}`,
};

/** 文案 lint 用：本檔所有字串（含舞台文案） */
export function allStrings() {
  const out = [];
  const walk = (v) => {
    if (typeof v === 'string') out.push(v);
    else if (typeof v === 'function') out.push(String(v));
    else if (Array.isArray(v)) v.forEach(walk);
    else if (v && typeof v === 'object') Object.values(v).forEach(walk);
  };
  walk({ T, STAGE, SCENARIO_LABEL, SCENARIO_HINT, STATUS_LABEL, PRIZE_STATUS_LABEL, DRAW_STATUS_LABEL, EXCLUDE_REASON_LABEL, VOID_REASON_LABEL, WHEEL_MODE_LABEL, STAGE_THEME_LABEL, POOL_STAT_LABEL });
  return out;
}

export default T;
