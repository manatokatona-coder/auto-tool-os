/**
 * 文字数の数え方。ROOMとXでルールがまったく違うので分けている。
 *
 * ROOM:
 *   - 紹介文は500文字が上限。超えると投稿が通らない。
 *   - 一覧・検索結果では冒頭42文字までしか表示されない。つかみはここで決まる。
 *
 * X:
 *   - 上限は「重み付き280」。日本語などの全角は1文字=2、半角英数は1文字=1で数える。
 *     つまり日本語だけなら140文字だが、半角を混ぜると140文字より多く入る。
 *   - URLは実際の長さに関係なく一律23として数えられる（t.co短縮のため）。
 *   - 絵文字は結合された1つのまとまりで2として数える。
 */

/** ROOMの紹介文の上限。 */
export const ROOM_MAX = 500;
/** ROOMの一覧表示で見えるのはここまで。 */
export const ROOM_PREVIEW = 42;
/** Xの上限（重み付き）。 */
export const X_MAX_WEIGHTED = 280;
/** XでURLが占める重み。 */
export const X_URL_WEIGHT = 23;

const URL_RE = /https?:\/\/[^\s]+/g;

/** 重み1で数える範囲（それ以外は2）。twitter-textの既定設定に合わせている。 */
const LIGHT_RANGES = [
  [0x0000, 0x10ff],
  [0x2000, 0x200d],
  [0x2010, 0x201f],
  [0x2032, 0x2037],
];

function codePointWeight(cp) {
  for (const [lo, hi] of LIGHT_RANGES) {
    if (cp >= lo && cp <= hi) return 1;
  }
  return 2;
}

const segmenter =
  typeof Intl !== 'undefined' && Intl.Segmenter
    ? new Intl.Segmenter('ja', { granularity: 'grapheme' })
    : null;

/** 見た目の1文字（書記素クラスタ）に分割する。絵文字の合字を1つとして扱うため。 */
export function graphemes(text) {
  if (segmenter) return Array.from(segmenter.segment(text), (s) => s.segment);
  return Array.from(text);
}

/**
 * Xの重み付き文字数。URLは一律23として数える。
 * 返り値の weighted を X_MAX_WEIGHTED と比べれば投稿可否が分かる。
 */
export function xLength(text) {
  const urls = text.match(URL_RE) || [];
  const withoutUrls = text.replace(URL_RE, '');

  let weighted = urls.length * X_URL_WEIGHT;
  for (const g of graphemes(withoutUrls)) {
    weighted += codePointWeight(g.codePointAt(0));
  }

  return {
    weighted,
    max: X_MAX_WEIGHTED,
    remaining: X_MAX_WEIGHTED - weighted,
    over: weighted > X_MAX_WEIGHTED,
    urlCount: urls.length,
    /** 日本語だけで書いた場合の体感文字数（重み÷2）。UIの目安表示用。 */
    jpEquivalent: Math.ceil(weighted / 2),
  };
}

/** ROOM紹介文の文字数。42文字プレビューと500文字上限の両方を返す。 */
export function roomLength(text) {
  const chars = Array.from(text);
  const preview = chars.slice(0, ROOM_PREVIEW).join('');
  return {
    length: chars.length,
    max: ROOM_MAX,
    remaining: ROOM_MAX - chars.length,
    over: chars.length > ROOM_MAX,
    /** 一覧で実際に見える部分。ここで引きが作れているかを確認する。 */
    preview,
    previewFull: chars.length > ROOM_PREVIEW,
  };
}
