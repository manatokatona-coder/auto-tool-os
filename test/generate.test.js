import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PRODUCTS } from '../src/data/products.js';
import { TONE_LIST } from '../src/data/tones.js';
import { LENGTH_PRESETS, generateRoomComment, generateRoomVariants } from '../src/core/roomComment.js';
import { generateXPost, generateXVariants } from '../src/core/xPost.js';
import { ROOM_MAX, X_MAX_WEIGHTED } from '../src/core/textLength.js';

const asInput = (p) => ({
  name: p.name, cat: p.cat, pain: p.pain, hook: p.hook,
  merits: p.merits, caution: p.caution, scene: p.scenes[0],
});

test('商品名がなければエラーになる', () => {
  assert.throws(() => generateRoomComment({ name: '' }), /商品名/);
});

test('全商品 × 全文体 × 全分量で、500文字を超えない', () => {
  for (const p of PRODUCTS) {
    for (const tone of TONE_LIST) {
      for (const length of Object.keys(LENGTH_PRESETS)) {
        const r = generateRoomComment({
          ...asInput(p), tone: tone.id, length,
          event: 'supersale', off: 50, season: 'spring',
          experience: 'あ'.repeat(60), seed: `t-${p.id}`,
        });
        assert.ok(
          r.validation.length.length <= ROOM_MAX,
          `${p.name}/${tone.id}/${length} が ${r.validation.length.length} 文字`,
        );
      }
    }
  }
});

test('全商品 × 全文体で、文法が壊れる連結が起きない', () => {
  const broken = /。。|、。|。ので|。こと。|人、これで終わり/;
  for (const p of PRODUCTS) {
    for (const tone of TONE_LIST) {
      for (let seed = 0; seed < 5; seed++) {
        const r = generateRoomComment({ ...asInput(p), tone: tone.id, seed: `g-${seed}` });
        assert.ok(!broken.test(r.text), `${p.name}/${tone.id}: ${r.hookLine}`);
      }
    }
  }
});

test('全商品で、生成した紹介文に要修正の指摘が出ない', () => {
  for (const p of PRODUCTS) {
    const r = generateRoomComment({ ...asInput(p), seed: 'clean' });
    const blocks = r.validation.issues.filter((i) => i.severity === 'block');
    assert.deepEqual(blocks, [], `${p.name}: ${JSON.stringify(blocks)}`);
  }
});

test('PR表記が必要なときは本文の先頭に入る', () => {
  const r = generateRoomComment({ ...asInput(PRODUCTS[0]), needsPr: true });
  assert.ok(r.text.startsWith('PR'));
  assert.equal(r.validation.ok, true);
});

test('同じ種を渡せば同じ文章が出る', () => {
  const a = generateRoomComment({ ...asInput(PRODUCTS[3]), seed: 'same' });
  const b = generateRoomComment({ ...asInput(PRODUCTS[3]), seed: 'same' });
  assert.equal(a.text, b.text);
});

test('パターン生成は本文が重複しない', () => {
  const vs = generateRoomVariants({ ...asInput(PRODUCTS[5]), seed: 'v' }, 3);
  assert.equal(new Set(vs.map((v) => v.body)).size, vs.length);
});

test('オリジナル写真を使わない指定なら #オリジナル写真 を付けない', () => {
  const r = generateRoomComment({ ...asInput(PRODUCTS[1]), hasOriginalPhoto: false });
  assert.ok(!r.tags.includes('オリジナル写真'));
});

test('全商品 × 全型で、X投稿が280（重み）を超えない', () => {
  const url = 'https://room.rakuten.co.jp/room_abcdefgh/1700000000000000?scid=we_rom_iphone_share';
  for (const p of PRODUCTS) {
    for (const post of generateXVariants({ ...asInput(p), url, event: 'supersale', off: 50 })) {
      assert.ok(
        post.validation.length.weighted <= X_MAX_WEIGHTED,
        `${p.name}/${post.pattern} が 重み${post.validation.length.weighted}`,
      );
    }
  }
});

test('長すぎるときはタグから削り、1行目のフックは残す', () => {
  const p = PRODUCTS.find((x) => x.id === 'l04');
  const post = generateXPost({
    ...asInput(p), pattern: 'spec',
    merits: ['あ'.repeat(50), 'い'.repeat(50), 'う'.repeat(50)],
    url: 'https://example.com/very/long/url/that/gets/shortened',
    event: 'supersale',
  });
  assert.ok(post.validation.length.weighted <= X_MAX_WEIGHTED);
  assert.ok(post.text.startsWith(p.name));
});

test('セルフリプ指定ならリプ用の文と規約の注意が返る', () => {
  const post = generateXPost({
    ...asInput(PRODUCTS[0]), url: 'https://room.rakuten.co.jp/x/1', linkPlacement: 'selfReply',
  });
  assert.ok(post.replyText.includes('https://room.rakuten.co.jp/x/1'));
  assert.ok(!post.text.includes('https://room.rakuten.co.jp/x/1'));
  assert.match(post.linkNote, /他人の投稿/);
});
