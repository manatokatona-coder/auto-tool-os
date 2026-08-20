/**
 * 種を指定できる擬似乱数。
 *
 * 生成した文章を「もう一度同じものを出す」「別パターンを出す」と
 * 行き来できるようにしたいので、Math.random は使わずに種で再現できるようにしている。
 */

/** 文字列を32bit整数の種に変換する（xmur3）。 */
export function seedFrom(str) {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return () => {
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    h ^= h >>> 16;
    return h >>> 0;
  };
}

/** mulberry32。種から0以上1未満の値を返す関数を作る。 */
export function makeRng(seed) {
  let a = typeof seed === 'string' ? seedFrom(seed)() : seed >>> 0;
  return function rng() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 配列から1つ選ぶ。 */
export function pick(rng, arr) {
  if (!arr || arr.length === 0) return undefined;
  return arr[Math.floor(rng() * arr.length) % arr.length];
}

/** 配列をシャッフルした新しい配列を返す。 */
export function shuffle(rng, arr) {
  const out = arr.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}
