import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PRODUCTS } from '../src/data/products.js';
import { TONE_LIST } from '../src/data/tones.js';
import { LAYOUTS, DIVIDERS, POINT_MARK } from '../src/data/layouts.js';
import { generateRoomComment, generateRoomVariants } from '../src/core/roomComment.js';
import { ROOM_MAX, ROOM_PREVIEW } from '../src/core/textLength.js';

/** 参考にした実例と同じ材料。 */
const TUMBLER = {
  name: 'タンブラー',
  cat: 'kitchen',
  hook: '大容量で可愛すぎた…',
  pain: '見た目も機能性もどっちも欲しい',
  target: '見た目も機能性もどっちも欲しい人に',
  targetEmoji: '🥤',
  signatureTag: 'ちぇる。オリ写⸜❤︎⸝',
  accent: '🤎',
  merits: [
    '保冷・保温OKで飲み頃キープ',
    'セラミック加工だからコーヒーや牛乳も入れられる',
    'ストロー付きで飲みやすい',
    'しっかり閉まるフタで傾けても漏れにくい',
    '車のドリンクホルダーにも入る',
    'カラバリも可愛くてインテリアにも馴染む',
  ],
  experience:
    '最近は家でも車でもこればっかり🥹🤎\n\nバッグに入れたり車で持ち運ぶことも多いんだけど、\n傾けても漏れにくいから安心感が全然違った…\n\n朝入れた飲み物をそのまま持ち歩けるし、\n大容量だから水分補給もラクになった🤎',
  extraTags: ['タンブラー', '水筒', '保冷タンブラー', 'マイボトル'],
  plainKeywords: ['暑さ対策', '車内を快適に'],
};

test('既定はインフルエンサー型', () => {
  assert.equal(generateRoomComment({ name: 'テスト', hook: 'いい' }).layout, 'influencer');
});

test('実例と同じ並びで組み立てられる', () => {
  const r = generateRoomComment({ ...TUMBLER, layout: 'influencer', seed: 'ref' });
  const lines = r.text.split('\n').filter((l) => l !== '');

  // 1行目はキャッチ、2行目は署名タグ、3行目は誰向けか、4行目は区切り線
  assert.ok(lines[0].includes('タンブラー') || lines[0].includes('大容量'), lines[0]);
  assert.equal(lines[1], '#ちぇる。オリ写⸜❤︎⸝');
  assert.ok(lines[2].startsWith('🥤'), lines[2]);
  assert.ok(DIVIDERS.includes(lines[3]), lines[3]);

  // ✔リストが続く
  const points = lines.filter((l) => l.startsWith(POINT_MARK));
  assert.equal(points.length, 6);

  // 誘導文とタグ行が末尾にある
  assert.ok(r.text.includes('楽天市場で詳細を見る'));
  assert.ok(lines[lines.length - 1].startsWith('#オリジナル写真'));
  assert.ok(lines[lines.length - 1].endsWith('暑さ対策 車内を快適に'));
});

test('署名タグの # は付いていても付いていなくてもよい', () => {
  const withHash = generateRoomComment({ ...TUMBLER, signatureTag: '#ちぇる。オリ写', seed: 's' });
  const without = generateRoomComment({ ...TUMBLER, signatureTag: 'ちぇる。オリ写', seed: 's' });
  assert.ok(withHash.text.includes('\n#ちぇる。オリ写\n'));
  assert.ok(without.text.includes('\n#ちぇる。オリ写\n'));
});

test('署名タグが空なら、その行ごと出さない', () => {
  const r = generateRoomComment({ ...TUMBLER, signatureTag: '', seed: 'n' });
  const lines = r.text.split('\n').filter((l) => l !== '');
  assert.ok(DIVIDERS.includes(lines[2]), `署名なしなら3行目が区切り線になるはず: ${lines[2]}`);
});

test('誰向けかが空なら悩みから作る', () => {
  const r = generateRoomComment({ ...TUMBLER, target: '', targetEmoji: '', seed: 'd' });
  assert.ok(r.text.includes('見た目も機能性もどっちも欲しい。そんな人に'), r.text.slice(0, 120));
});

test('行頭の絵文字は指定がなければカテゴリの既定を使う', () => {
  const r = generateRoomComment({ ...TUMBLER, targetEmoji: '', cat: 'clean', seed: 'e' });
  assert.ok(r.text.includes('🧺見た目も機能性'), r.text.slice(0, 120));
});

test('✔リストの飾りが全行には付かない', () => {
  const r = generateRoomComment({ ...TUMBLER, seed: 'decor' });
  const points = r.text.split('\n').filter((l) => l.startsWith(POINT_MARK));
  const decorated = points.filter((l) => !/[ぁ-んァ-ヶ一-龠ー…、。ぁ-ゖa-zA-Z0-9]$/.test(l));
  assert.ok(decorated.length > 0, '飾りが1つも付いていない');
  assert.ok(decorated.length < points.length, '全行に飾りが付いている');
});

test('体験メモは空行で段落に割れる', () => {
  const r = generateRoomComment({ ...TUMBLER, seed: 'para' });
  assert.ok(r.text.includes('最近は家でも車でもこればっかり🥹🤎\n\nバッグに入れたり'));
});

test('体験メモに空行がなければ1行ずつを段落にする', () => {
  const r = generateRoomComment({ ...TUMBLER, experience: '一行目です\n二行目です', seed: 'p2' });
  assert.ok(r.text.includes('一行目です\n\n二行目です'));
});

test('全商品 × 全文体で、インフルエンサー型が500文字を超えない', () => {
  const longExp = ['あ'.repeat(60), 'い'.repeat(60), 'う'.repeat(60), 'え'.repeat(60)].join('\n\n');
  for (const p of PRODUCTS) {
    for (const tone of TONE_LIST) {
      const r = generateRoomComment({
        name: p.name, cat: p.cat, pain: p.pain, hook: p.hook,
        merits: [...p.merits, ...p.merits].slice(0, 6),
        caution: p.caution, experience: longExp,
        layout: 'influencer', tone: tone.id,
        signatureTag: 'テスト。オリ写⸜❤︎⸝',
        plainKeywords: ['夏の暑さ対策', 'ひとり暮らしの味方'],
        extraTags: ['タグ1', 'タグ2', 'タグ3'],
        seed: `inf-${p.id}`,
      });
      assert.ok(
        r.validation.length.length <= ROOM_MAX,
        `${p.name}/${tone.id}: ${r.validation.length.length}文字`,
      );
      assert.ok(
        Array.from(r.hookLine).length <= ROOM_PREVIEW,
        `${p.name}/${tone.id}: 1行目 ${r.hookLine}`,
      );
    }
  }
});

test('あふれたときは飾りから削り、✔は3つ以上残す', () => {
  const r = generateRoomComment({
    ...TUMBLER,
    experience: ['あ'.repeat(90), 'い'.repeat(90), 'う'.repeat(90), 'え'.repeat(90)].join('\n\n'),
    seed: 'trim',
  });
  assert.ok(r.validation.length.length <= ROOM_MAX);
  const points = r.text.split('\n').filter((l) => l.startsWith(POINT_MARK));
  assert.ok(points.length >= 3, `✔が${points.length}件まで削られた`);
  assert.ok(r.text.includes('楽天市場で詳細を見る'), '誘導文が消えている');
});

test('セール商品はキャッチが価格から始まる', () => {
  const r = generateRoomComment({
    ...TUMBLER, mode: 'sale', regularPrice: 3980, salePrice: 1990, seed: 'sale',
  });
  assert.match(r.hookLine, /^(\d|半額)/, r.hookLine);
  assert.ok(r.hookLine.includes('1,990円'));
  assert.ok(Array.from(r.hookLine).length <= ROOM_PREVIEW);
});

test('レビュー型は従来どおりの3段構成のまま', () => {
  const r = generateRoomComment({
    ...TUMBLER, layout: 'review', caution: '容量が大きいぶん重い', seed: 'rev',
  });
  assert.equal(r.layout, 'review');
  assert.ok(!r.text.includes('楽天市場で詳細を見る'), '誘導文はレビュー型には入らない');
  assert.ok(!r.text.includes(POINT_MARK), '✔リストはレビュー型には入らない');
  assert.ok(!DIVIDERS.some((d) => r.text.includes(d)), '区切り線はレビュー型には入らない');
  assert.ok(r.tags.length <= LAYOUTS.review.maxTags);
});

test('型ごとにタグの上限が変わる', () => {
  const many = ['a', 'b', 'c', 'd', 'e', 'f', 'g'];
  const inf = generateRoomComment({ ...TUMBLER, layout: 'influencer', extraTags: many, seed: 't' });
  const rev = generateRoomComment({ ...TUMBLER, layout: 'review', extraTags: many, seed: 't' });
  assert.ok(inf.tags.length <= 8 && inf.tags.length > rev.tags.length);
  assert.ok(rev.tags.length <= 5);
});

test('検索ワードは2つまでで、ハッシュを付けずに末尾へ置く', () => {
  const r = generateRoomComment({
    ...TUMBLER, plainKeywords: ['暑さ対策', '車内を快適に', '三つ目は無視'], seed: 'kw',
  });
  const last = r.text.split('\n').filter(Boolean).pop();
  assert.ok(last.endsWith('暑さ対策 車内を快適に'), last);
  assert.ok(!last.includes('三つ目'), '3つ目が入っている');
  assert.ok(!last.includes('#暑さ対策'), 'ハッシュが付いている');
});

test('PR表記はインフルエンサー型でも先頭に出る', () => {
  const r = generateRoomComment({ ...TUMBLER, needsPr: true, seed: 'pr' });
  assert.ok(r.text.startsWith('PR'));
  assert.equal(r.validation.ok, true);
});

test('3パターンの本文が重複しない', () => {
  const vs = generateRoomVariants({ ...TUMBLER, seed: 'v' }, 3);
  assert.equal(vs.length, 3);
  assert.equal(new Set(vs.map((v) => v.body)).size, 3);
});
