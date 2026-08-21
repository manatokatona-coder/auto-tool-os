#!/usr/bin/env node
/**
 * PCから使うときの入り口。iPhoneではWebアプリ（web/）を使う。
 *
 *   node src/cli.js today
 *   node src/cli.js ideas --season summer --maniac 2
 *   node src/cli.js room --id l04 --tone real --event marathon --off 30
 *   node src/cli.js x --id l04 --url https://room.rakuten.co.jp/... --pattern empathy
 *   node src/cli.js check --file draft.txt --mode room
 */

import { parseArgs } from 'node:util';
import { readFileSync } from 'node:fs';
import * as RT from './index.js';

const HELP = `楽天ROOM 一人暮らしSALE 投稿メーカー

使い方:
  node src/cli.js <コマンド> [オプション]

コマンド:
  today                     今日の季節と狙えるセールを表示
  ideas                     投稿ネタを提案
  themes                    まとめ投稿のテーマ一覧
  room                      ROOMの紹介文を生成
  x                         X（旧Twitter）の投稿文を生成
  check                     文章をチェック

共通オプション:
  --id <商品ID>             同梱の商品辞書から引く（例: l04）
  --search <キーワード>      辞書をキーワードで探す
  --name <商品名>           商品名を直接指定
  --cat <カテゴリID>        ${Object.keys(RT.CATEGORIES).join(' / ')}
  --season <季節>           ${Object.keys(RT.SEASONS).join(' / ')}
  --event <イベントID>      ${RT.EVENT_LIST.map((e) => e.id).join(' / ')}
  --off <割引率>            例: 30
  --pr                      商品提供・イベント参加あり（PR表記を必須にする）

room 固有:
  --layout <型>             ${RT.LAYOUT_LIST.map((l) => l.id).join(' / ')}（既定 influencer）
  --signature <署名タグ>     自分のオリ写タグ（例: ちぇる。オリ写⸜❤︎⸝）
  --target <誰向けか>        区切り線の上に出る一行
  --accent <絵文字>          投稿全体で揃えるアクセント（既定 🤎）
  --keywords <検索ワード>    タグの後ろに置く平テキスト（カンマ区切り・2つまで）
  --tone <文体>             ${RT.TONE_LIST.map((t) => t.id).join(' / ')}
  --length <分量>           ${Object.keys(RT.LENGTH_PRESETS).join(' / ')}
  --variants <件数>         生成するパターン数（既定3）
  --pain / --hook / --caution / --scene / --experience / --merits（改行またはカンマ区切り）

x 固有:
  --url <URL>               投稿に載せるリンク
  --pattern <型>            ${RT.X_PATTERN_LIST.map((p) => p.id).join(' / ')}
  --link <置き方>           ${Object.keys(RT.LINK_PLACEMENTS).join(' / ')}

check 固有:
  --file <パス>             チェックする文章のファイル
  --text <文章>             文章を直接渡す
  --mode <room|x>           判定基準（既定 room）
`;

const options = {
  id: { type: 'string' },
  search: { type: 'string' },
  name: { type: 'string' },
  cat: { type: 'string' },
  season: { type: 'string' },
  event: { type: 'string' },
  off: { type: 'string' },
  pr: { type: 'boolean', default: false },
  tone: { type: 'string' },
  length: { type: 'string' },
  variants: { type: 'string' },
  maniac: { type: 'string' },
  limit: { type: 'string' },
  pain: { type: 'string' },
  hook: { type: 'string' },
  caution: { type: 'string' },
  scene: { type: 'string' },
  experience: { type: 'string' },
  merits: { type: 'string' },
  layout: { type: 'string' },
  signature: { type: 'string' },
  target: { type: 'string' },
  accent: { type: 'string' },
  keywords: { type: 'string' },
  url: { type: 'string' },
  pattern: { type: 'string' },
  link: { type: 'string' },
  file: { type: 'string' },
  text: { type: 'string' },
  mode: { type: 'string' },
  seed: { type: 'string' },
  help: { type: 'boolean', short: 'h', default: false },
};

const { values, positionals } = parseArgs({ options, allowPositionals: true });
const command = positionals[0];

if (values.help || !command) {
  console.log(HELP);
  process.exit(0);
}

/** --id / --search / 個別フラグ から、生成に渡す入力を組み立てる。 */
function resolveInput() {
  let base = {};
  if (values.id) {
    const p = RT.PRODUCTS.find((x) => x.id === values.id);
    if (!p) fail(`商品ID「${values.id}」は辞書にありません。node src/cli.js ideas で一覧を確認してください。`);
    base = { name: p.name, cat: p.cat, pain: p.pain, hook: p.hook, merits: p.merits, caution: p.caution, scene: p.scenes[0] };
  } else if (values.search) {
    const hits = RT.searchProducts(values.search);
    if (!hits.length) fail(`「${values.search}」に合う商品が辞書にありません。--name で直接指定してください。`);
    const p = hits[0];
    console.log(`辞書から「${p.name}」（id: ${p.id}）を使います。他の候補: ${hits.slice(1, 4).map((h) => h.id).join(', ') || 'なし'}\n`);
    base = { name: p.name, cat: p.cat, pain: p.pain, hook: p.hook, merits: p.merits, caution: p.caution, scene: p.scenes[0] };
  }

  const merits = values.merits
    ? values.merits.split(/[\n,、]/).map((s) => s.trim()).filter(Boolean)
    : base.merits;

  return {
    ...base,
    name: values.name ?? base.name,
    cat: values.cat ?? base.cat ?? 'kitchen',
    pain: values.pain ?? base.pain ?? '',
    hook: values.hook ?? base.hook ?? '',
    merits: merits ?? [],
    caution: values.caution ?? base.caution ?? '',
    scene: values.scene ?? base.scene ?? '',
    experience: values.experience ?? '',
    tone: values.tone ?? 'friendly',
    layout: values.layout ?? 'influencer',
    signatureTag: values.signature ?? '',
    target: values.target ?? '',
    accent: values.accent ?? '🤎',
    plainKeywords: values.keywords
      ? values.keywords.split(/[,、]/).map((s) => s.trim()).filter(Boolean)
      : [],
    length: values.length ?? 'standard',
    event: values.event ?? 'none',
    off: values.off ? Number(values.off) : null,
    season: values.season ?? RT.seasonOf(new Date()),
    needsPr: values.pr,
    seed: values.seed ?? 'cli',
  };
}

function fail(message) {
  console.error(`エラー: ${message}`);
  process.exit(1);
}

function printIssues(issues) {
  if (!issues.length) {
    console.log('  チェック: 指摘なし');
    return;
  }
  for (const i of issues) {
    console.log(`  [${i.severity === 'block' ? '要修正' : '注意'}] ${i.message}`);
    console.log(`          → ${i.fix}`);
  }
}

const commands = {
  today() {
    const now = new Date();
    console.log(`${now.getFullYear()}/${now.getMonth() + 1}/${now.getDate()}（${RT.SEASONS[RT.seasonOf(now)]}）\n`);
    for (const s of RT.suggestEvents(now)) {
      const mark = s.confidence === 'confirmed' ? '確定' : '傾向';
      console.log(`  [${mark}] ${RT.EVENTS[s.event].label}`);
      console.log(`         ${s.reason}`);
      if (RT.EVENTS[s.event].note) console.log(`         ${RT.EVENTS[s.event].note}`);
    }
  },

  ideas() {
    const list = RT.suggestIdeas({
      cat: values.cat || null,
      maniac: values.maniac === undefined ? null : Number(values.maniac),
      season: values.season || null,
      limit: values.limit ? Number(values.limit) : 6,
      seed: values.seed ?? String(Date.now()),
    });
    for (const i of list) {
      console.log(`\n[${i.product.id}] ${i.product.name}（${i.category}）`);
      console.log(`  切り口: ${i.angle}`);
      console.log(`  理由  : ${i.why}`);
      console.log(`  タグ  : ${i.suggestedTags.map((t) => `#${t}`).join(' ')}`);
    }
    console.log(`\n紹介文を作る: node src/cli.js room --id ${list[0]?.product.id ?? 'k01'}`);
  },

  themes() {
    for (const t of RT.allThemes()) {
      console.log(`\n[${t.id}] ${t.title}`);
      console.log(`  X見出し: ${t.xTitle}`);
      console.log(`  商品   : ${t.items.map((i) => i.name).join(' / ')}`);
    }
  },

  room() {
    const input = resolveInput();
    if (!input.name) fail('商品名がありません。--id / --search / --name のいずれかを指定してください。');

    const n = values.variants ? Number(values.variants) : 3;
    const variants = RT.generateRoomVariants(input, n);

    for (const [i, v] of variants.entries()) {
      const L = v.validation.length;
      console.log(`\n${'='.repeat(56)}`);
      console.log(`パターン${i + 1}（${RT.LAYOUTS[v.layout].label} / ${RT.TONES[v.tone].label} / ${L.length}文字 / 冒頭42字${v.fitsPreview ? 'OK' : '超過'}）`);
      console.log('='.repeat(56));
      console.log(v.text);
      console.log(`\n  一覧で見える範囲: ${v.preview}${L.previewFull ? '…' : ''}`);
      printIssues(v.validation.issues);
    }
  },

  x() {
    const input = resolveInput();
    if (!input.name) fail('商品名がありません。--id / --search / --name のいずれかを指定してください。');

    const patterns = values.pattern ? [values.pattern] : ['empathy', 'problem', 'spec'];
    const posts = RT.generateXVariants(
      { ...input, url: values.url ?? '', linkPlacement: values.link ?? 'inline' },
      patterns,
    );

    for (const p of posts) {
      const L = p.validation.length;
      console.log(`\n${'='.repeat(56)}`);
      console.log(`${RT.X_PATTERNS[p.pattern].label}（重み${L.weighted}/280・日本語 約${L.jpEquivalent}字）`);
      console.log('='.repeat(56));
      console.log(p.text);
      if (p.replyText) console.log(`\n  [セルフリプ用]\n  ${p.replyText.replace(/\n/g, '\n  ')}`);
      if (p.linkNote) console.log(`\n  ${p.linkNote}`);
      printIssues(p.validation.issues);
    }
  },

  check() {
    const text = values.text ?? (values.file ? readFileSync(values.file, 'utf8') : null);
    if (!text) fail('--file か --text で文章を渡してください。');

    const mode = values.mode ?? 'room';
    const r = mode === 'x'
      ? RT.validateXPost(text, { needsPr: values.pr })
      : RT.validateRoomComment(text, { needsPr: values.pr });

    if (mode === 'x') {
      console.log(`重み ${r.length.weighted}/280（日本語 約${r.length.jpEquivalent}字）`);
    } else {
      console.log(`${r.length.length}/500文字`);
      console.log(`一覧で見える範囲: ${r.length.preview}${r.length.previewFull ? '…' : ''}`);
    }
    console.log(r.ok ? '判定: 投稿できます' : '判定: 要修正');
    printIssues(r.issues);
    if (!r.ok) process.exit(1);
  },
};

const run = commands[command];
if (!run) {
  console.error(`不明なコマンド: ${command}\n`);
  console.log(HELP);
  process.exit(1);
}
run();
