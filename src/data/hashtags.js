/**
 * ハッシュタグ辞書。
 *
 * ROOMとXでは効くタグがまるで違う。
 *   - ROOM: 検索とピックアップ欄からの流入。#オリジナル写真 が最頻出で、Bランク以上の条件にも絡む。
 *   - X:    タイムライン上の発見。数を積むより、公式イベントタグ＋ジャンルタグを少数精鋭で。
 *
 * タグの付けすぎは「自爆タグ」と呼ばれ、読み手がタグ側に流れて自分の投稿から離脱する。
 * このツールは既定でROOM 5個・X 3個に制限している。
 */

/**
 * ROOMで常時強い基礎タグ。枠が余ったときの埋め合わせに使う。
 * #オリジナル写真 は自分で撮った写真がある投稿にだけ付けるので、ここには入れない。
 */
export const ROOM_BASE = [
  '楽天room',
  '買ってよかった',
  'ひとり暮らし',
  '一人暮らし',
];

/** カテゴリ別のROOM向けタグ。 */
export const ROOM_BY_CATEGORY = {
  kitchen: ['キッチン収納', '狭いキッチン', 'ひとり暮らしごはん', '時短レシピ'],
  cook: ['時短家電', 'コンパクト家電', 'ズボラ飯', 'ひとり暮らしごはん'],
  clean: ['掃除グッズ', '時短家事', '部屋干し', '洗濯グッズ'],
  storage: ['収納アイデア', 'デッドスペース活用', '賃貸DIY', '狭い部屋'],
  sleep: ['快眠グッズ', '寝具', 'あったかグッズ', '涼感寝具'],
  bath: ['バスグッズ', '浮かせる収納', '珪藻土', 'お風呂掃除'],
  interior: ['インテリア', '模様替え', 'ワンルーム', '狭い部屋'],
  gadget: ['ガジェット', 'スマートホーム', 'デスク環境', '在宅ワーク'],
  food: ['まとめ買い', '冷凍食品', '備蓄', 'ズボラ飯'],
  health: ['セルフケア', 'リラックスタイム', '宅トレ', '冷え対策'],
  safety: ['防災グッズ', '防犯グッズ', '備え', '一人暮らしの安心'],
};

/** セールイベント別のタグ。ROOM・X共通で使える。 */
export const EVENT_TAGS = {
  supersale: ['楽天スーパーSALE', '楽天スーパーセール', '楽天スーパーSALEで買うべきもの'],
  marathon: ['お買い物マラソン', '楽天お買い物マラソン', '買い回り'],
  day5and0: ['5と0のつく日', '楽天ポイント'],
  thanksgiving: ['楽天ご愛顧感謝デー', '楽天イベント'],
  none: [],
};

/** 季節タグ。ピックアップ欄は季節ものが並びやすい。 */
export const SEASON_TAGS = {
  spring: ['新生活', '新生活準備', '春の模様替え'],
  summer: ['夏の暑さ対策', '涼感グッズ', '梅雨対策'],
  autumn: ['秋の夜長', '防災の日', '衣替え'],
  winter: ['冬支度', 'あったかグッズ', '年末大掃除'],
  all: [],
};

/** X側の基礎タグ。ROOMのタグをそのまま持ち込むと浮くので別立て。 */
export const X_BASE = ['楽天room', '一人暮らし', '買ってよかったもの'];

/**
 * ROOM用タグを組み立てる。既定は5個まで。
 * オリジナル写真がある場合のみ #オリジナル写真 を先頭に入れる。
 */
export function buildRoomTags({ cat, event = 'none', season = 'all', hasOriginalPhoto = true, extra = [], limit = 5 }) {
  const out = [];
  const push = (t) => {
    if (t && !out.includes(t)) out.push(t);
  };

  if (hasOriginalPhoto) push('オリジナル写真');
  (EVENT_TAGS[event] || []).slice(0, 1).forEach(push);
  (ROOM_BY_CATEGORY[cat] || []).slice(0, 2).forEach(push);
  (SEASON_TAGS[season] || []).slice(0, 1).forEach(push);
  extra.forEach(push);
  ROOM_BASE.forEach(push);

  return out.slice(0, limit);
}

/**
 * X用タグを組み立てる。既定は3個まで。
 * イベントタグ（公式タグ）を最優先に置く。
 */
export function buildXTags({ cat, event = 'none', extra = [], limit = 3 }) {
  const out = [];
  const push = (t) => {
    if (t && !out.includes(t)) out.push(t);
  };

  (EVENT_TAGS[event] || []).slice(0, 1).forEach(push);
  extra.forEach(push);
  (ROOM_BY_CATEGORY[cat] || []).slice(0, 1).forEach(push);
  X_BASE.forEach(push);

  return out.slice(0, limit);
}

/** 表示用に `#タグ` の文字列へ整形する。Xは前後に半角スペースが要るので区切りは半角。 */
export function formatTags(tags) {
  return tags.map((t) => `#${t}`).join(' ');
}
