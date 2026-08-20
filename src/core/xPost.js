/**
 * X（旧Twitter）用の投稿文を組み立てる。
 *
 * ROOM本文をそのまま貼っても伸びない。Xでは、
 *   - 1行目で止められるか
 *   - 重み280（日本語だけなら140文字）に収まっているか
 *   - タグを絞れているか
 * の3点がほぼすべてなので、この3つを機械的に担保する。
 *
 * リンクの扱いには規約上の注意が1つある。2025年8月の楽天アフィリエイト規約改定で、
 * 他人の投稿への返信やコメント欄にアフィリエイトリンクを貼る行為が禁止と明記された。
 * 自分の投稿へのセルフリプはこれに当たらないが、他人の投稿には貼らないこと。
 */

import { X_PATTERNS } from '../data/tones.js';
import { buildXTags, formatTags } from '../data/hashtags.js';
import { EVENTS } from '../data/saleEvents.js';
import { makeRng } from './rng.js';
import { priceMoveVariants, discountPercent } from './price.js';
import { validateXPost } from './validate.js';
import { xLength, X_MAX_WEIGHTED } from './textLength.js';

/** リンクの置き方。それぞれ規約上の扱いが違う。 */
export const LINK_PLACEMENTS = {
  inline: {
    id: 'inline',
    label: '本文にリンクを入れる',
    note: 'いちばん素直。URLは23文字ぶんの重みを取る',
  },
  selfReply: {
    id: 'selfReply',
    label: '本文はリンクなし＋セルフリプに貼る',
    note: '本文の文字数を使い切れる。自分の投稿へのリプなので規約上の問題はない',
  },
  profile: {
    id: 'profile',
    label: 'プロフィールのROOMへ誘導',
    note: 'リンクを踏ませる導線は弱くなるが、投稿がリンクだらけにならない',
  },
};

/**
 * X投稿を1本生成する。
 *
 * @returns {{text:string, replyText:string|null, tags:string[], validation:object, pattern:string}}
 */
export function generateXPost(input) {
  const {
    name,
    cat = 'kitchen',
    pain = '',
    hook = '',
    merits = [],
    event = 'none',
    off = null,
    url = '',
    pattern: patternId = 'empathy',
    needsPr = false,
    linkPlacement = 'inline',
    extraTags = [],
    theme = '',
    items = [],
    mode = 'normal',
    regularPrice = null,
    salePrice = null,
    seed = 'default',
  } = input;

  const pattern = X_PATTERNS[patternId] || X_PATTERNS.empathy;
  const rng = makeRng(`${seed}|${name}|${patternId}`);
  const eventLabel = EVENTS[event]?.label || '';

  const computedOff = discountPercent(regularPrice, salePrice) ?? off;
  const priceMove =
    mode === 'sale'
      ? priceMoveVariants({ regular: regularPrice, sale: salePrice, off })[0]?.text ?? null
      : null;

  let lines = pattern
    .build({ name, pain, hook, merits, event: eventLabel, off: computedOff, theme, items, priceMove })
    .filter(Boolean);

  // 値引き商品は、型にかかわらず価格の変化を上のほうに置く。
  // 「セール速報型」のように本文へ既に入っている場合は重ねない。
  if (priceMove && !lines.some((l) => l.includes(priceMove))) {
    lines.splice(1, 0, priceMove);
  }

  if (needsPr) lines = ['PR', ...lines];

  const tags = buildXTags({ cat, event, extra: extraTags });

  const assemble = (bodyLines, withUrl, tagList) => {
    const parts = [bodyLines.join('\n')];
    if (withUrl && url) parts.push(url);
    if (tagList.length) parts.push(formatTags(tagList));
    return parts.join('\n\n');
  };

  const inlineUrl = linkPlacement === 'inline';
  let workingLines = lines.slice();
  let workingTags = tags.slice();
  let text = assemble(workingLines, inlineUrl, workingTags);

  // 280（重み）に収まるまで、影響の小さいところから削る。
  // 順番：タグを1つ減らす → 箇条書きの末尾を落とす。1行目のフックは最後まで残す。
  let guard = 0;
  while (xLength(text).weighted > X_MAX_WEIGHTED && guard < 20) {
    guard++;
    if (workingTags.length > 1) {
      workingTags.pop();
    } else if (workingLines.length > 2) {
      workingLines.pop();
    } else {
      break;
    }
    text = assemble(workingLines, inlineUrl, workingTags);
  }

  // セルフリプ用の一文。本文をリンクなしにした場合の受け皿。
  let replyText = null;
  if (linkPlacement === 'selfReply' && url) {
    replyText = `詳細はこちら👇\n${url}`;
  } else if (linkPlacement === 'profile') {
    replyText = 'プロフィールのROOMにまとめています。';
  }

  const validation = validateXPost(text, { needsPr });

  return {
    text,
    replyText,
    tags: workingTags,
    validation,
    pattern: pattern.id,
    priceMove,
    linkPlacement,
    /** リンクの置き方によって注意点が変わるので、UIでそのまま出せるように返す。 */
    linkNote:
      linkPlacement === 'selfReply'
        ? '自分の投稿へのセルフリプはOK。他人の投稿のリプ欄にアフィリエイトリンクを貼るのは2025年8月の規約改定で禁止されています。'
        : LINK_PLACEMENTS[linkPlacement]?.note || '',
  };
}

/** 型を変えて複数パターン出す。投稿前に見比べる用。 */
export function generateXVariants(input, patterns = ['empathy', 'problem', 'spec']) {
  return patterns.map((p) => generateXPost({ ...input, pattern: p }));
}
