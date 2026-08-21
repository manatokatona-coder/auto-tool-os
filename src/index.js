/**
 * 楽天ROOM 一人暮らしSALE投稿ツールの公開API。
 * Webアプリ（web/）とCLI（src/cli.js）の両方がここから読み込む。
 */

export { PRODUCTS, CATEGORIES, SEASONS, byCategory, byManiac, bySeason } from './data/products.js';
export {
  LAYOUTS,
  LAYOUT_LIST,
  DIVIDERS,
  ACCENT_EMOJI,
  CATEGORY_EMOJI,
  CTA_TEMPLATES,
} from './data/layouts.js';
export { TONES, TONE_LIST, X_PATTERNS, X_PATTERN_LIST } from './data/tones.js';
export {
  ROOM_BASE,
  ROOM_BY_CATEGORY,
  EVENT_TAGS,
  SEASON_TAGS,
  X_BASE,
  buildRoomTags,
  buildXTags,
  formatTags,
} from './data/hashtags.js';
export {
  EVENTS,
  EVENT_LIST,
  EVENT_CLOSERS,
  isDay5or0,
  seasonOf,
  suggestEvents,
  eventLine,
} from './data/saleEvents.js';
export { NG_RULES, PR_LABELS_OK, PR_LABELS_NG, PR_REQUIRED_CASES } from './data/ngwords.js';

export {
  ROOM_MAX,
  ROOM_PREVIEW,
  X_MAX_WEIGHTED,
  X_URL_WEIGHT,
  xLength,
  roomLength,
  graphemes,
} from './core/textLength.js';
export { makeRng, seedFrom, pick, shuffle } from './core/rng.js';
export {
  parsePrice,
  formatYen,
  discountPercent,
  priceMoveVariants,
  validatePrices,
} from './core/price.js';
export { findNgWords, checkPrLabel, validateRoomComment, validateXPost } from './core/validate.js';
export { generateRoomComment, generateRoomVariants, LENGTH_PRESETS } from './core/roomComment.js';
export { generateXPost, generateXVariants, LINK_PLACEMENTS } from './core/xPost.js';
export { THEMES, searchProducts, suggestIdeas, suggestTheme, allThemes } from './core/ideas.js';
