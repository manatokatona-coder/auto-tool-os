/**
 * 楽天の商品URLから、投稿文の材料を取り出す層。
 *
 * やっていることは3つ。
 *   1. URLから商品コード（shopCode:itemCode）を取り出す
 *   2. 楽天市場商品検索APIをその商品コードで引く
 *   3. 返ってきた商品名・価格・商品説明を、そのままでは使えないので整えて渡す
 *
 * 3が要点になる。楽天の商品名は「【楽天1位】【送料無料】…」のように
 * 販促の飾りが前に付くことが多く、そのままでは42文字のキャッチに入らない。
 * 商品説明も改行や記号だらけなので、✔リストの候補として使える単位に割る。
 *
 * APIキーはブラウザから見える。楽天の「ウェブアプリケーション」種別は
 * それを前提に、許可ドメインで縛る設計になっている。
 */

import { PRODUCTS, CATEGORIES } from '../data/products.js';

/** 楽天市場商品検索APIのエンドポイント。 */
export const API_ENDPOINT = 'https://openapi.rakuten.co.jp/ichibams/api/IchibaItem/Search/20260701';

/**
 * 楽天の商品URLから商品コードを取り出す。
 *
 * 対応するのは item.rakuten.co.jp の商品ページ。
 * 短縮URL（a.r10.to）は展開しないと中身が分からないので、その旨を返す。
 */
export function parseRakutenUrl(input) {
  const raw = String(input || '').trim();
  if (!raw) return { ok: false, reason: 'empty', message: 'URLが空です' };

  let url;
  try {
    url = new URL(raw);
  } catch {
    return { ok: false, reason: 'invalid', message: 'URLとして読み取れませんでした' };
  }

  const host = url.hostname.replace(/^www\./, '');

  if (host === 'a.r10.to' || host === 'r10.to') {
    return {
      ok: false,
      reason: 'shortened',
      message: '短縮URLは中身が分かりません。楽天アプリで商品ページを開き直して、そのURLを貼ってください',
    };
  }

  if (host === 'room.rakuten.co.jp') {
    return {
      ok: false,
      reason: 'room',
      message: 'これはROOMの投稿URLです。楽天市場の商品ページのURLを貼ってください',
    };
  }

  if (host !== 'item.rakuten.co.jp') {
    return {
      ok: false,
      reason: 'notItem',
      message: '楽天市場の商品ページ（item.rakuten.co.jp）のURLを貼ってください',
    };
  }

  // /{shopCode}/{itemCode}/ の形
  const parts = url.pathname.split('/').filter(Boolean);
  if (parts.length < 2) {
    return { ok: false, reason: 'noItemCode', message: 'URLから商品コードを取り出せませんでした' };
  }

  const [shopCode, itemCode] = parts;
  return {
    ok: true,
    shopCode,
    itemCode,
    /** APIのitemCodeパラメータに渡す形式。 */
    itemCodeParam: `${shopCode}:${itemCode}`,
    canonicalUrl: `https://item.rakuten.co.jp/${shopCode}/${itemCode}/`,
  };
}

/** APIを叩くURLを組み立てる。callbackを渡すとJSONP用になる。 */
export function buildSearchUrl({ applicationId, accessKey, itemCode, keyword, callback = null, hits = 1 }) {
  if (!applicationId) throw new Error('applicationIdが必要です');
  if (!itemCode && !keyword) throw new Error('itemCodeかkeywordのどちらかが必要です');

  const params = new URLSearchParams({ applicationId, format: 'json', hits: String(hits) });
  if (accessKey) params.set('accessKey', accessKey);
  if (itemCode) params.set('itemCode', itemCode);
  if (keyword) params.set('keyword', keyword);
  if (callback) params.set('callback', callback);

  return `${API_ENDPOINT}?${params.toString()}`;
}

/**
 * 楽天APIのエラーを、次に何をすればいいか分かる文言へ変える。
 *
 * 「ウェブアプリケーション」種別で登録したキーは、リクエストのRefererが
 * 登録した許可ドメインと一致していないと通らない。実際に叩いて確認した
 * エラーコードをそのまま拾っている。
 */
export function describeApiError({ status = 0, errorCode = null, errorMessage = '' } = {}) {
  const code = String(errorMessage || '');

  if (code.includes('HTTP_REFERRER_MISSING')) {
    return 'リクエストにRefererが付いていません。楽天のアプリ登録が「ウェブアプリケーション」種別だと、ブラウザから開いたページ経由で呼ぶ必要があります';
  }
  if (code.includes('HTTP_REFERRER_NOT_ALLOWED')) {
    return 'このドメインが楽天アプリの許可ドメインに入っていません。楽天ウェブサービスのアプリ設定に、いま開いているサイトのドメインを追加してください';
  }
  if (code.includes('accessKey must be present')) {
    return 'アクセスキー（accessKey）が設定されていません';
  }
  if (status === 401 || errorCode === 401) {
    return 'アプリIDかアクセスキーが違います';
  }
  if (status === 429 || errorCode === 429) {
    return '楽天APIのリクエスト上限に達しました。少し待ってからもう一度試してください';
  }
  if (status === 503 || errorCode === 503) {
    return '楽天API側が一時的に応答できない状態です。少し待ってからもう一度試してください';
  }
  return errorMessage ? `楽天APIがエラーを返しました（${errorMessage}）` : `楽天APIが${status}を返しました`;
}

/** レスポンスのJSONにエラーが入っていれば取り出す。 */
export function extractApiError(json, status = 0) {
  const err = json?.errors ?? json?.error_description ?? null;
  if (!err) return null;
  if (typeof err === 'string') return describeApiError({ status, errorMessage: err });
  return describeApiError({ status, errorCode: err.errorCode, errorMessage: err.errorMessage });
}

/* -------------------------------------------------- 商品名を整える */

/**
 * 【】で囲まれた中身がこれらを含むなら、販促の飾りとみなして落とす。
 * 【2個セット】のような内容に関わるものは残す。
 */
const PROMO_WORDS = [
  '送料無料', '送料込', 'あす楽', '即納', '在庫あり', '翌日', '当日発送',
  '楽天1位', '楽天一位', 'ランキング1位', 'ランキング入賞', '1位', '受賞',
  'ポイント', 'P5倍', 'P10倍', '倍', 'クーポン', '値引', '割引', 'OFF', 'セール', 'SALE',
  '期間限定', '数量限定', 'タイムセール', '最安', '特価', 'お買い物マラソン', 'スーパーSALE',
  'メール便', 'ネコポス', '宅配便', '日時指定', 'ラッピング無料', 'レビュー特典',
];

const isPromo = (inner) => PROMO_WORDS.some((w) => inner.includes(w));

/**
 * 商品名から販促の飾りを落とす。
 * 何を落としたかも返すので、消しすぎていないか画面で確認できる。
 */
export function cleanItemName(name) {
  const original = String(name || '');
  const removed = [];

  // 【】［］[]（）で囲まれた販促表記を落とす。内容に関わるものは残す。
  let out = original.replace(/[【［\[]([^】］\]]*)[】］\]]/g, (whole, inner) => {
    if (isPromo(inner)) {
      removed.push(whole);
      return '';
    }
    return whole;
  });

  // 区切り記号のあとに続く販促の羅列を落とす（「/ 送料無料 / あす楽」など）
  out = out
    .split(/[|｜/／]/)
    .filter((chunk, i) => {
      if (i === 0) return true;
      if (isPromo(chunk)) {
        removed.push(chunk.trim());
        return false;
      }
      return true;
    })
    .join(' ');

  out = out.replace(/\s+/g, ' ').replace(/^[\s・･,、。/／|｜-]+|[\s・･,、。/／|｜-]+$/g, '').trim();

  return { name: out || original.trim(), removed, original: original.trim() };
}

/**
 * キャッチに使う短い商品名の候補を出す。
 * 楽天の商品名は説明的で長いので、前から順に区切って短い形を作る。
 */
export function nameCandidates(name, limit = 24) {
  const cleaned = cleanItemName(name).name;
  const out = [];
  const push = (v) => {
    const t = v.trim();
    if (t && !out.includes(t)) out.push(t);
  };

  push(cleaned);

  // 空白・読点で区切って、前から順に短くしていく
  const tokens = cleaned.split(/[\s　,、]+/).filter(Boolean);
  for (let n = tokens.length - 1; n >= 1; n--) {
    const joined = tokens.slice(0, n).join(' ');
    if (Array.from(joined).length <= limit) push(joined);
  }

  return out.sort((a, b) => Array.from(a).length - Array.from(b).length).slice(0, 6);
}

/* -------------------------------------------------- 商品説明を✔候補に割る */

/** 商品説明のうち、紹介文には使わない行。 */
const CAPTION_NOISE = [
  '送料', '発送', '配送', '納期', '在庫', '返品', '交換', '保証', 'メーカー', '型番', '品番',
  '生産国', '原産国', 'JAN', '規格', '注意', 'ご了承', '予告なく', '画像', 'モニター', '色味',
  '営業日', '土日', '祝日', 'お問い合わせ', 'ラッピング', 'のし', '領収書', '検索',
];

/**
 * 商品説明を、✔リストの候補になる単位へ割る。
 * 記号区切りと句点で割り、短すぎ・長すぎ・事務連絡を落とす。
 */
export function captionToPoints(caption, { min = 6, max = 34, limit = 12 } = {}) {
  const text = String(caption || '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&[a-z]+;/gi, ' ')
    .replace(/\\n/g, '\n');

  const chunks = text
    // 「保温・保冷」のように中黒は語の中でも使われるので、区切りには使わない
    .split(/[\n。！!]|[■◆●▼※]{1,}|\s{2,}/)
    .map((s) => s.replace(/^[\s◇◆■●▼★☆・:：-]+|[\s:：-]+$/g, '').trim())
    .filter(Boolean);

  const out = [];
  for (const chunk of chunks) {
    const length = Array.from(chunk).length;
    if (length < min || length > max) continue;
    if (CAPTION_NOISE.some((w) => chunk.includes(w))) continue;
    if (/^[0-9a-zA-Z\s.,-]+$/.test(chunk)) continue; // 型番だけの行
    if (out.includes(chunk)) continue;
    out.push(chunk);
    if (out.length >= limit) break;
  }
  return out;
}

/* -------------------------------------------------- カテゴリを当てる */

/** 商品辞書の名前・タグ・悩みを、カテゴリ推定のための語彙として使う。 */
const CATEGORY_VOCAB = (() => {
  const vocab = {};
  for (const p of PRODUCTS) {
    vocab[p.cat] ??= new Set();
    for (const word of [p.name, ...(p.tags || [])]) {
      for (const token of String(word).split(/[（）()・／/、\s]+/).filter((t) => Array.from(t).length >= 2)) {
        vocab[p.cat].add(token);
      }
    }
  }
  return Object.fromEntries(Object.entries(vocab).map(([k, v]) => [k, [...v]]));
})();

/**
 * 商品名と説明からカテゴリを推定する。
 * 当たらなければ null を返す（勝手に決めつけない）。
 */
export function guessCategory(text) {
  const hay = String(text || '');
  if (!hay) return null;

  let best = null;
  let bestScore = 0;
  for (const [cat, words] of Object.entries(CATEGORY_VOCAB)) {
    const score = words.reduce((acc, w) => (hay.includes(w) ? acc + Array.from(w).length : acc), 0);
    if (score > bestScore) {
      bestScore = score;
      best = cat;
    }
  }
  return bestScore >= 4 ? best : null;
}

/* -------------------------------------------------- APIの返りをフォームへ */

/**
 * APIのレスポンスから、画面のフォームに入れる形へ変換する。
 * 価格は「いまの販売価格」なので、セール価格として扱う。
 * 通常価格はAPIから取れないので、書き手が商品ページを見て入れる。
 */
export function mapItemToForm(item) {
  if (!item) return null;

  const nameInfo = cleanItemName(item.itemName);
  const points = captionToPoints(item.itemCaption);
  const cat = guessCategory(`${item.itemName} ${item.itemCaption || ''}`);

  return {
    name: nameInfo.name,
    nameOriginal: nameInfo.original,
    nameRemoved: nameInfo.removed,
    nameOptions: nameCandidates(item.itemName),
    salePrice: Number(item.itemPrice) || null,
    pointOptions: points,
    cat,
    catLabel: cat ? CATEGORIES[cat] : null,
    url: item.affiliateUrl || item.itemUrl || '',
    shopName: item.shopName || '',
    reviewCount: Number(item.reviewCount) || 0,
    reviewAverage: Number(item.reviewAverage) || 0,
    imageUrl: (item.mediumImageUrls || [])[0]?.imageUrl || (item.mediumImageUrls || [])[0] || '',
  };
}

/** レスポンス全体から最初の1件を取り出す。形が違えば null。 */
export function firstItem(response) {
  const entry = response?.Items?.[0];
  if (!entry) return null;
  return entry.Item ?? entry;
}

/* -------------------------------------------------- キーなしで使う経路 */

const PRICE_RE = /([0-9][0-9,]{2,})\s*円/g;

/**
 * 商品ページからコピーしてきたテキストを読み取る。
 * APIキーを持っていなくても、コピペだけで商品名と価格を拾えるようにするための経路。
 */
export function parsePastedText(text) {
  const raw = String(text || '').trim();
  if (!raw) return { ok: false, message: 'テキストが空です' };

  const lines = raw.split('\n').map((l) => l.trim()).filter(Boolean);

  // URLが混ざっていれば拾う
  const urlMatch = raw.match(/https?:\/\/[^\s]+/);
  const url = urlMatch ? urlMatch[0] : '';

  // 価格らしき数字を集める。多いほうが通常価格、少ないほうがセール価格。
  const prices = [...raw.matchAll(PRICE_RE)]
    .map((m) => Number(m[1].replace(/,/g, '')))
    .filter((n) => n >= 100 && n <= 10000000);
  const unique = [...new Set(prices)].sort((a, b) => b - a);

  // 商品名は、URLでも価格でもない行のうち、いちばん長いものを採る
  const nameLine = lines
    .filter((l) => !/^https?:\/\//.test(l))
    .filter((l) => !/^[0-9,]+\s*円/.test(l))
    .sort((a, b) => Array.from(b).length - Array.from(a).length)[0];

  if (!nameLine && unique.length === 0) {
    return { ok: false, message: '商品名も価格も読み取れませんでした' };
  }

  const nameInfo = cleanItemName(nameLine || '');
  return {
    ok: true,
    name: nameInfo.name,
    nameOriginal: nameInfo.original,
    nameRemoved: nameInfo.removed,
    nameOptions: nameLine ? nameCandidates(nameLine) : [],
    regularPrice: unique.length >= 2 ? unique[0] : null,
    salePrice: unique.length >= 2 ? unique[1] : (unique[0] ?? null),
    cat: guessCategory(raw),
    url,
  };
}
