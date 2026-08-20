/**
 * ネタ出し。「今日は何を投稿するか」が決まらない時間をなくすための層。
 *
 * ROOMは投稿の絶対数が効くが、闇雲に投稿しても伸びない。
 * 「季節 × セール × 一人暮らしの具体的な悩み」で切ると、
 * 検索にもピックアップ欄にも引っかかりやすい題材が残る。
 */

import { PRODUCTS, CATEGORIES, SEASONS } from '../data/products.js';
import { ROOM_BY_CATEGORY } from '../data/hashtags.js';
import { seasonOf } from '../data/saleEvents.js';
import { makeRng, shuffle } from './rng.js';

/**
 * まとめ投稿用のテーマ束。
 * Xの「リスト型」投稿と、ROOMの連続投稿の両方で使える。
 */
export const THEMES = [
  { id: 'kitchen-narrow', title: '狭いキッチンを救う', xTitle: '1Kの狭いキッチン、これで回るようになった', season: 'all', items: ['k04', 'k05', 'k06', 's05', 'c04'] },
  { id: 'roomdry', title: '部屋干しと湿気の対策', xTitle: '部屋干しの生乾き臭、これで終わった', season: 'summer', items: ['l04', 'i03', 'b04', 'b02', 'l03'] },
  { id: 'cooking-lazy', title: '自炊が続かない人向け', xTitle: '自炊が続かなかった自分が続いたもの', season: 'all', items: ['k01', 'k03', 'c02', 'f01', 'f02'] },
  { id: 'winter-cost', title: '冬の寒さと電気代', xTitle: '暖房を上げずに冬をしのぐ', season: 'winter', items: ['p01', 'h02', 'h03', 'k02', 'p04'] },
  { id: 'summer-sleep', title: '夏の寝苦しさ対策', xTitle: '夜中に起きなくなった夏の寝具', season: 'summer', items: ['p02', 'i03', 'k08', 'b04', 'p04'] },
  { id: 'storage', title: '収納が足りない部屋へ', xTitle: '賃貸の収納不足、家具を増やさずに解決した', season: 'all', items: ['s01', 's02', 's03', 's04', 's05', 's06'] },
  { id: 'desk', title: '在宅ワークのデスク環境', xTitle: '家で働く人の肩と首を守るもの', season: 'all', items: ['g03', 'g02', 'c06', 'h01', 'i01'] },
  { id: 'safety', title: '一人暮らしの防災・防犯', xTitle: '一人暮らしこそ備えておきたいもの', season: 'autumn', items: ['y01', 'y02', 'y03', 'g06', 'f03'] },
  { id: 'cleaning', title: '掃除が続かない人向け', xTitle: '掃除のハードルを下げただけで部屋が保てた', season: 'all', items: ['l01', 'l06', 'l07', 'l08', 'l02'] },
  { id: 'newlife', title: '新生活でそろえるもの', xTitle: '一人暮らしを始める人へ、最初に買うもの', season: 'spring', items: ['c02', 's01', 'g02', 'i04', 'l05'] },
];

const byId = new Map(PRODUCTS.map((p) => [p.id, p]));

/** キーワードで商品を探す。名前・悩み・訴求・タグを横断して見る。 */
export function searchProducts(query) {
  if (!query) return [];
  const q = query.trim().toLowerCase();
  return PRODUCTS.filter((p) =>
    [p.name, p.pain, p.hook, p.caution, ...(p.tags || []), CATEGORIES[p.cat]]
      .join(' ')
      .toLowerCase()
      .includes(q),
  );
}

/**
 * 投稿ネタを提案する。
 *
 * @param {object} opts
 * @param {string}  [opts.cat]     カテゴリで絞る
 * @param {number}  [opts.maniac]  マニアック度で絞る（0/1/2）
 * @param {string}  [opts.season]  季節で絞る。省略時は今日の季節
 * @param {number}  [opts.limit]   件数
 */
export function suggestIdeas({ cat = null, maniac = null, season = null, limit = 5, seed = 'ideas', date = new Date() } = {}) {
  const targetSeason = season || seasonOf(date);
  const rng = makeRng(seed);

  let pool = PRODUCTS.slice();
  if (cat) pool = pool.filter((p) => p.cat === cat);
  if (maniac !== null && maniac !== undefined) pool = pool.filter((p) => p.maniac === maniac);

  // 季節が合うものを前に寄せる。通年ものは中間に置く。
  const score = (p) => (p.season === targetSeason ? 2 : p.season === 'all' ? 1 : 0);
  pool = shuffle(rng, pool).sort((a, b) => score(b) - score(a));

  return pool.slice(0, limit).map((p) => ({
    product: p,
    category: CATEGORIES[p.cat],
    /** そのまま紹介文のイントロに使える切り口 */
    angle: `${p.pain} → ${p.hook}`,
    why:
      p.season === targetSeason
        ? `いまの季節（${SEASONS[targetSeason] || targetSeason}）に検索が伸びる題材`
        : p.maniac === 2
          ? '競合が少なく、刺さる人には強く刺さるニッチ枠'
          : '通年で需要があり、セール時に動きやすい定番枠',
    suggestedTags: [
      ...new Set([...(ROOM_BY_CATEGORY[p.cat] || []).slice(0, 2), ...(p.tags || []).slice(0, 2)]),
    ],
  }));
}

/**
 * まとめ投稿用のテーマを1つ返す。季節が合うものを優先する。
 * 返り値の items は実際の商品オブジェクト。
 */
export function suggestTheme({ season = null, seed = 'theme', date = new Date() } = {}) {
  const targetSeason = season || seasonOf(date);
  const rng = makeRng(seed);
  const scored = shuffle(rng, THEMES).sort((a, b) => {
    const s = (t) => (t.season === targetSeason ? 2 : t.season === 'all' ? 1 : 0);
    return s(b) - s(a);
  });
  const theme = scored[0];
  return {
    ...theme,
    items: theme.items.map((id) => byId.get(id)).filter(Boolean),
  };
}

/** 全テーマを商品つきで返す。UIの一覧表示用。 */
export function allThemes() {
  return THEMES.map((t) => ({ ...t, items: t.items.map((id) => byId.get(id)).filter(Boolean) }));
}
