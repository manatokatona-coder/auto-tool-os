/**
 * 楽天ROOMの商品紹介文を組み立てる。
 *
 * 人気ルーマーの紹介文に共通していた骨格をそのまま型にしている。
 *   イントロ（悩みへの共感・つかみ）
 *   → メイン（メリット3点＋正直なデメリット＋使用シーン）
 *   → クロージング（買ったあとの生活が想像できる一文）
 *
 * 制約として効かせているのは2つ。
 *   - 500文字を超えると投稿できないので、超えたら自動で削る
 *   - 一覧では冒頭42文字しか出ないので、1行目は42文字に収める
 */

import { TONES } from '../data/tones.js';
import { buildRoomTags, formatTags } from '../data/hashtags.js';
import { eventLine, EVENT_CLOSERS } from '../data/saleEvents.js';
import { priceMoveVariants, discountPercent, validatePrices } from './price.js';
import { makeRng, pick, shuffle } from './rng.js';
import { validateRoomComment } from './validate.js';
import { ROOM_MAX, ROOM_PREVIEW } from './textLength.js';

/** 本文の分量プリセット。 */
export const LENGTH_PRESETS = {
  short: { label: '短め（〜200字）', merits: 2, withScene: false, withExperience: false, withEvent: false, target: 200 },
  standard: { label: '標準（〜350字）', merits: 3, withScene: true, withExperience: true, withEvent: false, target: 350 },
  long: { label: 'しっかり（〜480字）', merits: 3, withScene: true, withExperience: true, withEvent: true, target: 480 },
};

/** スロットに差し込む前に末尾の句点を落とす。テンプレート側が「。」を持っているため。 */
const clause = (s) => String(s ?? '').trim().replace(/[。．.]+$/, '');

const fill = (tpl, ctx) =>
  tpl.replace(/\{(\w+)\}/g, (_, key) => clause(ctx[key]));

const len = (s) => Array.from(s).length;

/**
 * 1行目を作る。42文字に収まる候補を優先して選ぶ。
 * どれも収まらなければ、いちばん短い候補を返す（切り詰めはしない。読み手に不自然に見えるため）。
 */
function buildHookLine(tone, ctx, rng) {
  const candidates = shuffle(rng, tone.intro).map((tpl) => fill(tpl, ctx).trim());
  const fits = candidates.filter((c) => len(c) <= ROOM_PREVIEW);
  if (fits.length > 0) return { line: fits[0], fitsPreview: true };

  const shortest = candidates.reduce((a, b) => (len(a) <= len(b) ? a : b));
  return { line: shortest, fitsPreview: false };
}

/**
 * 値引き商品の1行目を作る。冒頭に価格の変化を置くのが狙い。
 *
 * 価格表記は長さ違いで何通りかあるので、42文字に収まる組み合わせの中から選ぶ。
 * 選ぶ優先順位は「訴求（hook）が入っていること」が先で、価格表記の細かさは後。
 * 価格だけの行にして訴求が消えるより、価格表記を短くして訴求を残すほうが読まれるため。
 */
function buildSaleHookLine(tone, ctx, rng, priceVariants) {
  const candidates = [];
  for (const pv of priceVariants) {
    for (const tpl of tone.saleIntro) {
      candidates.push({
        line: fill(tpl, { ...ctx, priceMove: pv.text }).trim(),
        rank: pv.rank,
        hasHook: tpl.includes('{hook}'),
      });
    }
  }

  const fitting = candidates.filter((c) => len(c.line) <= ROOM_PREVIEW);
  if (fitting.length === 0) {
    const shortest = candidates.reduce((a, b) => (len(a.line) <= len(b.line) ? a : b));
    return { line: shortest.line, fitsPreview: false };
  }

  // 訴求（hook）が入っているものを優先する。
  // 価格だけの行にして訴求が消えるより、価格表記を短くして訴求を残すほうが読まれるため。
  const withHook = fitting.filter((c) => c.hasHook);
  const pool = withHook.length > 0 ? withHook : fitting;

  // 価格表記は詳しいほど良いが、いちばん詳しい形だけに絞ると
  // 42文字に収まる言い回しが1〜2通りしか残らず、3パターン出しても同じ文になる。
  // そこで1段階だけ簡素な価格表記も許して、言い回しの幅を確保する。
  const top = Math.max(...pool.map((c) => c.rank));
  const near = pool.filter((c) => c.rank >= top - 1);

  return { line: pick(rng, shuffle(rng, near)).line, fitsPreview: true };
}

/**
 * 楽天ROOM用の紹介文を1本生成する。
 *
 * @param {object} input 商品情報と生成条件
 * @returns {{text:string, body:string, tags:string[], hookLine:string, preview:string, validation:object, seed:string}}
 */
export function generateRoomComment(input) {
  const {
    name,
    cat = 'kitchen',
    pain = '',
    hook = '',
    merits = [],
    caution = '',
    scene = '',
    experience = '',
    tone: toneId = 'friendly',
    event = 'none',
    off = null,
    mode = 'normal',
    regularPrice = null,
    salePrice = null,
    season = 'all',
    needsPr = false,
    hasOriginalPhoto = true,
    length: lengthKey = 'standard',
    extraTags = [],
    seed = 'default',
  } = input;

  if (!name) throw new Error('商品名（name）は必須です');

  const tone = TONES[toneId] || TONES.friendly;
  const preset = LENGTH_PRESETS[lengthKey] || LENGTH_PRESETS.standard;
  const rng = makeRng(`${seed}|${name}|${toneId}|${lengthKey}`);

  const ctx = { name, pain, hook, caution, scene, merit: merits[0] || '' };

  // 値引き率は、通常価格とセール価格の両方があればそこから出す（手入力より確実なため）。
  const computedOff = discountPercent(regularPrice, salePrice) ?? off;
  const priceVariants =
    mode === 'sale' ? priceMoveVariants({ regular: regularPrice, sale: salePrice, off }) : [];

  const { line: hookLine, fitsPreview } =
    priceVariants.length > 0
      ? buildSaleHookLine(tone, ctx, rng, priceVariants)
      : buildHookLine(tone, ctx, rng);

  const blocks = [];

  // PR表記は必ず先頭。X・ROOMともに投稿の上部に置くよう案内されている。
  if (needsPr) blocks.push('PR');

  blocks.push(hookLine);

  // メイン：メリットを箇条書きに。読みやすさのため改行で区切る。
  const chosenMerits = merits.slice(0, preset.merits);
  if (chosenMerits.length > 0) {
    const bridge = pick(rng, tone.bridge);
    const bullet = tone.emoji.point || '・';
    blocks.push([bridge, ...chosenMerits.map((m) => `${bullet}${m}`)].join('\n'));
  }

  // 体験メモは書き手のオリジナリティそのものなので、加工せずそのまま入れる。
  if (preset.withExperience && experience) blocks.push(experience.trim());

  // デメリットを添えると紹介文の信頼度が上がる。対処法まで書くのが人気ルーマーの型。
  if (caution) blocks.push(fill(pick(rng, tone.cautionLead), ctx));

  if (preset.withScene && scene) blocks.push(fill(pick(rng, tone.scene), ctx));

  blocks.push(pick(rng, tone.outro));

  if (preset.withEvent) {
    const ev = eventLine(event, computedOff);
    if (ev) blocks.push(`${ev}。${pick(rng, EVENT_CLOSERS)}`);
  }

  const tags = buildRoomTags({ cat, event, season, hasOriginalPhoto, extra: extraTags });

  let body = blocks.filter(Boolean).join('\n\n');
  let text = `${body}\n\n${formatTags(tags)}`;

  // 500文字を超えたら、後ろから重要度の低いブロックを落として収める。
  let guard = 0;
  while (len(text) > ROOM_MAX && guard < 10) {
    guard++;
    const trimmed = blocks.filter(Boolean);
    // 落とす順番：セール一文 → 使用シーン → 体験メモ → メリットの3つ目
    if (preset.withEvent && trimmed.length > 3) {
      blocks.splice(blocks.length - 1, 1);
    } else if (chosenMerits.length > 2) {
      chosenMerits.pop();
      const bridge = pick(rng, tone.bridge);
      const bullet = tone.emoji.point || '・';
      const idx = blocks.findIndex((b) => b && b.includes(bullet));
      if (idx >= 0) blocks[idx] = [bridge, ...chosenMerits.map((m) => `${bullet}${m}`)].join('\n');
    } else {
      blocks.splice(2, 1);
    }
    body = blocks.filter(Boolean).join('\n\n');
    text = `${body}\n\n${formatTags(tags)}`;
  }

  const validation = validateRoomComment(text, { needsPr });
  const priceIssues = validatePrices({ mode, regular: regularPrice, sale: salePrice, off });
  if (priceIssues.length > 0) {
    validation.issues = [...priceIssues, ...validation.issues];
    validation.ok = !validation.issues.some((i) => i.severity === 'block');
  }

  return {
    text,
    body,
    tags,
    hookLine,
    fitsPreview,
    preview: Array.from(text).slice(0, ROOM_PREVIEW).join(''),
    validation,
    seed: String(seed),
    tone: tone.id,
    mode,
    /** 冒頭に使った価格表記。X投稿側でも同じものを使い回す。 */
    priceMove: priceVariants[0]?.text ?? null,
    discountPercent: computedOff,
  };
}

/**
 * 同じ商品で文面のパターンを複数出す。
 * 本文が完全に同じものは除外するので、返る数が n より少なくなることがある。
 */
export function generateRoomVariants(input, n = 3) {
  const out = [];
  const seen = new Set();
  for (let i = 0; out.length < n && i < n * 4; i++) {
    const v = generateRoomComment({ ...input, seed: `${input.seed ?? 'v'}-${i}` });
    if (seen.has(v.body)) continue;
    seen.add(v.body);
    out.push(v);
  }
  return out;
}
