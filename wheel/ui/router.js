// hash 路由（D.1）
//   #/                      活動列表
//   #/e/:id/participants    名單 ┐
//   #/e/:id/prizes          獎項 │ 設定模式
//   #/e/:id/settings        設定 │
//   #/e/:id/records         紀錄 ┘
//   #/e/:id/stage[?mode=rehearsal|live]   舞台
//   #/e/:id/screen          觀眾視窗（第二階段）

export const SETTINGS_TABS = ['participants', 'prizes', 'settings', 'records'];

export function parseHash(hash = location.hash) {
  const h = (hash || '').replace(/^#/, '') || '/';
  const [path, qs] = h.split('?');
  const query = Object.fromEntries(new URLSearchParams(qs || ''));
  const seg = path.split('/').filter(Boolean);
  if (!seg.length) return { name: 'home', query };
  if (seg[0] === 'e' && seg[1]) {
    const tab = seg[2] || 'participants';
    if (tab === 'stage') return { name: 'stage', id: seg[1], query };
    if (tab === 'screen') return { name: 'screen', id: seg[1], query };
    if (SETTINGS_TABS.includes(tab)) return { name: 'settings', id: seg[1], tab, query };
  }
  return { name: 'home', query };
}

export function go(hash, { replace = false } = {}) {
  if (!hash.startsWith('#')) hash = '#' + hash;
  if (replace) { history.replaceState(null, '', hash); window.dispatchEvent(new HashChangeEvent('hashchange')); }
  else if (location.hash === hash) window.dispatchEvent(new HashChangeEvent('hashchange'));
  else location.hash = hash;
}

export const routes = {
  home: () => '#/',
  tab: (id, tab) => `#/e/${id}/${tab}`,
  stage: (id, mode) => `#/e/${id}/stage${mode ? '?mode=' + mode : ''}`,
};
