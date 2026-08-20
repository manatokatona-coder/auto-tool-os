/**
 * 楽天のセールイベント定義と、日付からの当たり付け。
 *
 * 開催日は毎回楽天が告知するもので、事前に確定できるのは
 * 「5と0のつく日」（毎月5/10/15/20/25/30日）だけ。
 * スーパーSALEは3・6・9・12月、お買い物マラソンは月2〜3回という傾向はあるが、
 * 日付までは断定できないので、このモジュールは
 * confidence: 'confirmed'（確定）と 'guess'（傾向からの推測）を必ず返して区別する。
 */

export const EVENTS = {
  supersale: {
    id: 'supersale',
    label: '楽天スーパーSALE',
    short: 'スーパーSALE',
    /** 3・6・9・12月に開催されるのが通例 */
    months: [3, 6, 9, 12],
    copy: ['半額商品が出る', 'ショップ買い回りでポイント最大10倍', '年4回の最大級セール'],
    note: 'エントリーは開始の1〜2日前から。買い回りはエントリー前の購入も対象になる回が多いが、毎回条件を確認する。',
  },
  marathon: {
    id: 'marathon',
    label: '楽天お買い物マラソン',
    short: 'マラソン',
    /** 月2〜3回。スーパーSALEのある月は後半に1回のことが多い */
    months: [1, 2, 4, 5, 7, 8, 10, 11],
    copy: ['1,000円以上のショップを買い回るほど倍率が上がる', '10ショップで完走', 'まとめ買いのタイミング'],
    note: '買い回り対象は1ショップ1,000円以上（税込・送料別）。ポイント上限があるので高額品は分散しない。',
  },
  day5and0: {
    id: 'day5and0',
    label: '5と0のつく日',
    short: '5と0',
    months: null,
    copy: ['楽天カード決済でポイントアップ', '毎月5・10・15・20・25・30日'],
    note: '毎回エントリーが必要。マラソンやスーパーSALEと重なる日が一番おいしい。',
  },
  thanksgiving: {
    id: 'thanksgiving',
    label: '楽天ご愛顧感謝デー',
    short: '感謝デー',
    months: null,
    copy: ['会員ランクに応じてポイントアップ'],
    note: '開催は不定期。ランクが高いほど倍率が上がる。',
  },
  none: {
    id: 'none',
    label: 'セール指定なし',
    short: '',
    months: null,
    copy: [],
    note: '',
  },
};

export const EVENT_LIST = Object.values(EVENTS);

/** 毎月5・10・15・20・25・30日か。これだけは日付から確定できる。 */
export function isDay5or0(date = new Date()) {
  const d = date.getDate();
  return d % 5 === 0 && d !== 0;
}

/** 月から季節を返す。ROOMの季節タグ・ピックアップ欄の傾向に合わせた区切り。 */
export function seasonOf(date = new Date()) {
  const m = date.getMonth() + 1;
  if (m >= 3 && m <= 5) return 'spring';
  if (m >= 6 && m <= 8) return 'summer';
  if (m >= 9 && m <= 11) return 'autumn';
  return 'winter';
}

/**
 * その日に合いそうなイベントを提案する。
 * 断定はしない。confirmed が付くのは「5と0のつく日」だけ。
 */
export function suggestEvents(date = new Date()) {
  const out = [];
  const month = date.getMonth() + 1;

  if (isDay5or0(date)) {
    out.push({ event: 'day5and0', confidence: 'confirmed', reason: `${date.getDate()}日は「5と0のつく日」（毎月固定）` });
  }
  if (EVENTS.supersale.months.includes(month)) {
    out.push({ event: 'supersale', confidence: 'guess', reason: `${month}月はスーパーSALEが開かれる月（開催日は楽天の告知で要確認）` });
  } else {
    out.push({ event: 'marathon', confidence: 'guess', reason: `${month}月はお買い物マラソン中心の月になりやすい（開催日は要確認）` });
  }
  return out;
}

/** 生成文に混ぜるセール文脈の一行。イベント未指定なら空文字。 */
export function eventLine(eventId, off) {
  const ev = EVENTS[eventId];
  if (!ev || ev.id === 'none') return '';
  if (off) return `${ev.label}で${off}%OFF`;
  return `${ev.label}開催中`;
}

/** セール文のあとに続ける締めの一言。 */
export const EVENT_CLOSERS = [
  '気になっていた人はこのタイミングで。',
  '欲しかった人は今のうちに。',
  '値段が戻る前に確保しておくのが得です。',
  'ポイント倍率が上がる日と重ねるとさらに効きます。',
];
