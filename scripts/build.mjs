/**
 * dist/ を作る。
 *
 * web/ はESモジュールをそのまま読む構成なので、静的ホスティングにそのまま置ける。
 * ただし「1ファイルだけ保存してオフラインで使いたい」という需要があるので、
 * ここで src/ を1本のスクリプトにまとめ、CSSとアプリコードごとHTMLへ埋め込む。
 *
 * バンドラは入れていない。src/ の書き方（相対import・名前付きexportのみ・
 * 同名のトップレベル宣言なし）を前提に、import/export構文を落として連結するだけ。
 * 連結後は必ず読み込みテストにかけるので、前提が崩れればビルドが落ちる。
 */

import { readFileSync, writeFileSync, mkdirSync, copyFileSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DIST = join(ROOT, 'dist');

/** 依存の浅い順。連結の順番がそのまま評価順になる。 */
const MODULES = [
  'src/data/products.js',
  'src/data/tones.js',
  'src/data/hashtags.js',
  'src/data/saleEvents.js',
  'src/data/ngwords.js',
  'src/core/textLength.js',
  'src/core/rng.js',
  'src/core/validate.js',
  'src/core/roomComment.js',
  'src/core/xPost.js',
  'src/core/ideas.js',
];

/**
 * import文を落とし、export宣言を素の宣言に戻す。
 * 落とした export の名前は、まとめてグローバルへ出すために集めておく。
 */
function stripModuleSyntax(source, file) {
  const names = new Set();
  const lines = source.split('\n');
  const out = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // import文（複数行にまたがることがあるので ; まで読み飛ばす）
    if (/^\s*import\s/.test(line)) {
      let j = i;
      while (j < lines.length && !/;\s*$/.test(lines[j])) j++;
      i = j;
      continue;
    }

    // 再エクスポート（`export { a } from './x.js';`）はバンドル内では不要
    if (/^\s*export\s*\{[^}]*$/.test(line) || /^\s*export\s*\{.*\}\s*from\s/.test(line)) {
      let j = i;
      while (j < lines.length && !/;\s*$/.test(lines[j])) j++;
      i = j;
      continue;
    }

    const decl = line.match(/^\s*export\s+(const|let|var|function|class)\s+([A-Za-z0-9_$]+)/);
    if (decl) {
      names.add(decl[2]);
      out.push(line.replace(/^(\s*)export\s+/, '$1'));
      continue;
    }

    if (/^\s*export\s/.test(line)) {
      throw new Error(`未対応のexport構文があります: ${file}:${i + 1}\n  ${line.trim()}`);
    }

    out.push(line);
  }

  return { code: out.join('\n'), names: [...names] };
}

function buildBundle() {
  const parts = [];
  const allNames = [];

  for (const rel of MODULES) {
    const src = readFileSync(join(ROOT, rel), 'utf8');
    const { code, names } = stripModuleSyntax(src, rel);
    parts.push(`/* ===== ${rel} ===== */\n${code}`);
    allNames.push(...names);
  }

  const dupes = allNames.filter((n, i) => allNames.indexOf(n) !== i);
  if (dupes.length) {
    throw new Error(`モジュール間で名前が衝突しています: ${[...new Set(dupes)].join(', ')}`);
  }

  return [
    '(function () {',
    "  'use strict';",
    ...parts.map((p) => p.replace(/^/gm, '  ')),
    `  globalThis.RoomTool = { ${allNames.join(', ')} };`,
    '})();',
  ].join('\n');
}

/** 連結したコードが本当に動くか、書き出す前に確かめる。 */
async function verifyBundle(bundle) {
  const g = { globalThis: {} };
  // globalThis を差し替えた状態で評価し、公開APIが揃っているかを見る。
  const fn = new Function('globalThis', bundle);
  fn(g.globalThis);
  const RT = g.globalThis.RoomTool;

  const required = [
    'generateRoomComment', 'generateRoomVariants', 'generateXPost', 'generateXVariants',
    'validateRoomComment', 'validateXPost', 'suggestIdeas', 'suggestTheme', 'searchProducts',
    'PRODUCTS', 'CATEGORIES', 'SEASONS', 'TONE_LIST', 'X_PATTERN_LIST', 'EVENT_LIST',
    'LENGTH_PRESETS', 'LINK_PLACEMENTS', 'PR_REQUIRED_CASES', 'ROOM_MAX', 'X_MAX_WEIGHTED',
    'seasonOf', 'suggestEvents', 'EVENTS', 'TONES', 'X_PATTERNS', 'ROOM_PREVIEW',
  ];
  const missing = required.filter((k) => RT[k] === undefined);
  if (missing.length) throw new Error(`バンドルに公開されていないAPIがあります: ${missing.join(', ')}`);

  const sample = RT.generateRoomComment({
    name: 'テスト商品', cat: 'kitchen', pain: '狭くて置き場所がない',
    hook: '置くだけで片付く', merits: ['軽い', '安い'], caution: '色が選べない', seed: 'build',
  });
  if (!sample.text.includes('テスト商品') && !sample.text.length) {
    throw new Error('バンドルの生成結果が空です');
  }
  if (sample.validation.length.length > RT.ROOM_MAX) {
    throw new Error('バンドルの生成結果が500文字を超えています');
  }
  return RT.PRODUCTS.length;
}

async function main() {
  rmSync(DIST, { recursive: true, force: true });
  mkdirSync(DIST, { recursive: true });

  const bundle = buildBundle();
  const productCount = await verifyBundle(bundle);

  const css = readFileSync(join(ROOT, 'web/style.css'), 'utf8');
  const app = readFileSync(join(ROOT, 'web/app.js'), 'utf8').replace(
    /^import \* as RT from '\.\.\/src\/index\.js';$/m,
    'const RT = globalThis.RoomTool;',
  );
  if (app.includes('import ')) throw new Error('app.js のimportを置換できませんでした');

  // 単一ファイルで完結させるため、favicon も data URI にして埋め込む
  const iconSvg = readFileSync(join(ROOT, 'web/icon.svg'), 'utf8');
  const iconUri = `data:image/svg+xml;base64,${Buffer.from(iconSvg).toString('base64')}`;

  const html = readFileSync(join(ROOT, 'web/index.html'), 'utf8')
    .replace('<link rel="icon" href="./icon.svg" type="image/svg+xml">', `<link rel="icon" href="${iconUri}" type="image/svg+xml">`)
    .replace('<link rel="stylesheet" href="./style.css">', `<style>\n${css}\n</style>`)
    .replace(
      '<script type="module" src="./app.js"></script>',
      `<script>\n${bundle}\n</script>\n<script>\n${app}\n</script>`,
    );

  writeFileSync(join(DIST, 'index.html'), html);
  for (const f of ['manifest.webmanifest', 'sw.js', 'icon.svg', 'icon-180.png', 'icon-192.png', 'icon-512.png']) {
    copyFileSync(join(ROOT, 'web', f), join(DIST, f));
  }
  // 単一ファイル版のsw.jsは、分割されていたCSS/JSをもう見にいかない。
  writeFileSync(
    join(DIST, 'sw.js'),
    readFileSync(join(ROOT, 'web/sw.js'), 'utf8').replace(
      "  './style.css',\n  './app.js',\n",
      '',
    ),
  );

  const size = (readFileSync(join(DIST, 'index.html')).length / 1024).toFixed(0);
  console.log(`dist/index.html を作成しました（${size}KB・商品${productCount}件を同梱）`);
  console.log('この1ファイルだけで動きます。iPhoneのファイルアプリに保存してSafariで開いてもOK。');
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
