// 亂數來源（C.2）：csprng（crypto.getRandomValues）與 seeded（SHA-256 子種子 → xoshiro128**）。
// 每個 rng 物件提供 next() → { unit: [0,1), hex: 16 位 hex }，供 DrawAudit 記錄。

const TWO53 = 2 ** 53;
const TWO26 = 2 ** 26;

function toHex32(n) { return (n >>> 0).toString(16).padStart(8, '0'); }

/** 兩個 uint32 → [0,1) 的 53-bit 均勻數 */
export function unitFrom(hi, lo) { return ((hi >>> 5) * TWO26 + (lo >>> 6)) / TWO53; }

export function createCsprng() {
  const buf = new Uint32Array(2);
  return {
    mode: 'csprng',
    next() {
      globalThis.crypto.getRandomValues(buf);
      return { unit: unitFrom(buf[0], buf[1]), hex: toHex32(buf[0]) + toHex32(buf[1]) };
    },
  };
}

export async function sha256Hex(str) {
  const data = new TextEncoder().encode(str);
  const d = await globalThis.crypto.subtle.digest('SHA-256', data);
  return [...new Uint8Array(d)].map(b => b.toString(16).padStart(2, '0')).join('');
}

function rotl(x, k) { return ((x << k) | (x >>> (32 - k))) >>> 0; }

/** xoshiro128** — state 為 4 個 uint32（不可全為 0） */
export function xoshiro128ss(s) {
  const st = Uint32Array.from(s);
  if (!(st[0] | st[1] | st[2] | st[3])) st[0] = 1;
  return function () {
    const result = Math.imul(rotl(Math.imul(st[1], 5) >>> 0, 7), 9) >>> 0;
    const t = (st[1] << 9) >>> 0;
    st[2] ^= st[0]; st[3] ^= st[1]; st[1] ^= st[2]; st[0] ^= st[3];
    st[2] ^= t; st[3] = rotl(st[3], 11);
    return result;
  };
}

/** 固定種子：子種子 = SHA-256(seed + ':' + drawSeq) 前 128 bit（第三方可用匯出 JSON 復算） */
export async function createSeededRng(seed, drawSeq) {
  const h = await sha256Hex(`${seed}:${drawSeq}`);
  const s = [0, 1, 2, 3].map(i => parseInt(h.slice(i * 8, i * 8 + 8), 16) >>> 0);
  const gen = xoshiro128ss(s);
  return {
    mode: 'seeded',
    next() { const hi = gen(), lo = gen(); return { unit: unitFrom(hi, lo), hex: toHex32(hi) + toHex32(lo) }; },
  };
}

/** 依活動設定取得某一抽（drawSeq）要用的 rng */
export async function rngFor(settings, drawSeq) {
  if (settings.rngMode === 'seeded' && settings.seed) return createSeededRng(settings.seed, drawSeq);
  return createCsprng();
}

/** 非稽核用途（洗牌過場、抽樣扇區排列）的均勻亂數，仍走 csprng */
export function randomUnit() { return createCsprng().next().unit; }
export function randomInt(lo, hi) { return lo + Math.floor(randomUnit() * (hi - lo + 1)); }

export function newSeed() {
  const b = new Uint8Array(8); globalThis.crypto.getRandomValues(b);
  const h = [...b].map(x => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 4)}-${h.slice(4, 8)}-${h.slice(8, 12)}-${h.slice(12)}`;
}
