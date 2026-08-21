import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  parsePrice, formatYen, discountPercent, priceMoveVariants, validatePrices,
} from '../src/core/price.js';
import { PRODUCTS } from '../src/data/products.js';
import { TONE_LIST, TONES } from '../src/data/tones.js';
import { generateRoomComment, generateRoomVariants } from '../src/core/roomComment.js';
import { generateXPost } from '../src/core/xPost.js';
import { ROOM_MAX, ROOM_PREVIEW, X_MAX_WEIGHTED } from '../src/core/textLength.js';

test('価格の入力ゆれを吸収する', () => {
  assert.equal(parsePrice('4,980円'), 4980);
  assert.equal(parsePrice('￥12800'), 12800);
  assert.equal(parsePrice(' 980 '), 980);
  assert.equal(parsePrice(''), null);
  assert.equal(parsePrice('abc'), null);
  assert.equal(parsePrice('0'), null);
  assert.equal(parsePrice('-100'), null);
});

test('金額に3桁区切りが入る', () => {
  assert.equal(formatYen(980), '980円');
  assert.equal(formatYen(19800), '19,800円');
  assert.equal(formatYen(1234567), '1,234,567円');
});

test('割引率は切り捨てで、実際より大きく出ない', () => {
  assert.equal(discountPercent(1000, 500), 50);
  // 49.9% を四捨五入すると50%になるが、切り捨てなので49%
  assert.equal(discountPercent(1000, 501), 49);
  assert.equal(discountPercent(3980, 2986), 24);
  assert.equal(discountPercent(1000, 1000), null);
  assert.equal(discountPercent(500, 1000), null);
  assert.equal(discountPercent(null, 500), null);
});

test('価格表記は情報量の多い順に返る', () => {
  const v = priceMoveVariants({ regular: 19800, salePrice: null, sale: 9900 });
  assert.equal(v[0].text, '19,800円→9,900円（50%OFF）');
  assert.equal(v[0].rank, 3);
  assert.ok(v.some((x) => x.text === '半額の9,900円'));
  assert.ok(v.every((x, i) => i === 0 || x.rank <= v[i - 1].rank));
});

test('半額と半額以下を言い分ける', () => {
  assert.ok(priceMoveVariants({ regular: 1000, sale: 500 }).some((v) => v.text.startsWith('半額の')));
  assert.ok(priceMoveVariants({ regular: 1000, sale: 300 }).some((v) => v.text.startsWith('半額以下の')));
  assert.ok(!priceMoveVariants({ regular: 1000, sale: 800 }).some((v) => v.text.includes('半額')));
});

test('価格がなく割引率だけでも表記を作れる', () => {
  assert.deepEqual(priceMoveVariants({ off: 30 }).map((v) => v.text), ['30%OFF']);
  assert.equal(priceMoveVariants({ sale: 2480, off: 30 })[0].text, '30%OFFの2,480円');
  assert.deepEqual(priceMoveVariants({}), []);
});

test('通常価格とセール価格が逆なら要修正', () => {
  const issues = validatePrices({ mode: 'sale', regular: 2000, sale: 3000 });
  assert.equal(issues[0].severity, 'block');
});

test('通常商品では価格のチェックをしない', () => {
  assert.deepEqual(validatePrices({ mode: 'normal', regular: 2000, sale: 3000 }), []);
});

test('セール商品なのに価格が空なら注意が出る', () => {
  const issues = validatePrices({ mode: 'sale' });
  assert.ok(issues.some((i) => i.severity === 'warn' && i.message.includes('価格が入力されていません')));
});

test('極端な割引率には注意が出る', () => {
  assert.ok(validatePrices({ mode: 'sale', regular: 10000, sale: 500 }).some((i) => i.message.includes('95%')));
});

// ---- 生成側 ----

const asInput = (p) => ({
  name: p.name, cat: p.cat, pain: p.pain, hook: p.hook,
  merits: p.merits, caution: p.caution, scene: p.scenes[0],
});

test('セール商品では冒頭が必ず価格から始まる', () => {
  // 価格表記の形（矢印・半額・%OFF）は種によって変わるが、
  // 1文字目が価格であることと、セール価格が入っていることは常に満たす。
  for (let i = 0; i < 30; i++) {
    const r = generateRoomComment({
      ...asInput(PRODUCTS[0]), mode: 'sale', regularPrice: 4980, salePrice: 2480, seed: `p${i}`,
    });
    assert.match(r.hookLine, /^(\d|半額)/, r.hookLine);
    assert.ok(r.hookLine.includes('2,480円'), r.hookLine);
    assert.ok(r.text.startsWith(r.hookLine));
    assert.equal(r.discountPercent, 50);
  }
});

test('冒頭の言い回しが1通りに固まらない', () => {
  const lines = new Set();
  for (let i = 0; i < 30; i++) {
    lines.add(generateRoomComment({
      ...asInput(PRODUCTS[0]), mode: 'sale', regularPrice: 4980, salePrice: 2480, seed: `var${i}`,
    }).hookLine);
  }
  assert.ok(lines.size >= 3, `冒頭が${lines.size}通りしかない`);
});

test('通常商品では価格を一切書かない', () => {
  const r = generateRoomComment({
    ...asInput(PRODUCTS[0]), mode: 'normal', regularPrice: 4980, salePrice: 2480, seed: 'p',
  });
  assert.ok(!r.text.includes('4,980円'));
  assert.ok(!r.text.includes('2,480円'));
  assert.equal(r.priceMove, null);
});

test('全商品 × 全文体で、セール時の1行目が42文字に収まる', () => {
  for (const p of PRODUCTS) {
    for (const tone of TONE_LIST) {
      for (const [regular, sale] of [[1280, 680], [19800, 9900], [128000, 98000]]) {
        const r = generateRoomComment({
          ...asInput(p), tone: tone.id, mode: 'sale',
          regularPrice: regular, salePrice: sale, seed: `sale-${p.id}`,
        });
        assert.ok(
          Array.from(r.hookLine).length <= ROOM_PREVIEW,
          `${p.name}/${tone.id}/${regular}→${sale}: ${r.hookLine}`,
        );
        assert.ok(r.validation.length.length <= ROOM_MAX);
      }
    }
  }
});

test('価格表記の直後に助詞がつながらない', () => {
  // 「（50%OFF）になってた」のような崩れた接続が出ないこと
  for (const tone of TONE_LIST) {
    for (const tpl of tone.saleIntro) {
      const after = tpl.slice(tpl.indexOf('{priceMove}') + '{priceMove}'.length, tpl.indexOf('{priceMove}') + '{priceMove}'.length + 1);
      assert.ok(['。', '！', '／', "'", ''].includes(after), `${tone.id}: ${tpl}`);
    }
  }
});

test('セール時も3パターンの本文が重複しない', () => {
  const vs = generateRoomVariants({
    ...asInput(PRODUCTS[10]), mode: 'sale', regularPrice: 5000, salePrice: 3000, seed: 'v',
  }, 3);
  assert.equal(vs.length, 3);
  assert.equal(new Set(vs.map((v) => v.body)).size, 3);
});

test('通常価格が逆でも500文字を超えず、要修正として返る', () => {
  const r = generateRoomComment({
    ...asInput(PRODUCTS[2]), mode: 'sale', regularPrice: 1000, salePrice: 2000, seed: 'q',
  });
  assert.equal(r.validation.ok, false);
  assert.ok(r.validation.issues.some((i) => i.severity === 'block' && i.message.includes('通常価格')));
});

test('X投稿にも価格の変化が入り、280に収まる', () => {
  const url = 'https://room.rakuten.co.jp/room_abcdefgh/1700000000000000';
  for (const p of PRODUCTS) {
    for (const pattern of ['news', 'empathy', 'problem', 'spec']) {
      const post = generateXPost({
        ...asInput(p), pattern, url, event: 'supersale',
        mode: 'sale', regularPrice: 19800, salePrice: 9900,
      });
      assert.ok(post.validation.length.weighted <= X_MAX_WEIGHTED, `${p.name}/${pattern}`);
      assert.ok(post.text.includes('19,800円→9,900円'), `${p.name}/${pattern}: 価格がない`);
    }
  }
});

test('X投稿で価格の行が二重に入らない', () => {
  const post = generateXPost({
    ...asInput(PRODUCTS[0]), pattern: 'news', event: 'supersale',
    mode: 'sale', regularPrice: 4980, salePrice: 2480,
  });
  assert.equal(post.text.split('4,980円→2,480円').length - 1, 1);
});

test('通常商品のX投稿には価格が入らない', () => {
  const post = generateXPost({
    ...asInput(PRODUCTS[0]), pattern: 'empathy', mode: 'normal',
    regularPrice: 4980, salePrice: 2480,
  });
  assert.ok(!post.text.includes('4,980円'));
  assert.equal(post.priceMove, null);
});

test('価格が分からなくても割引率だけでセール文が作れる', () => {
  const r = generateRoomComment({
    ...asInput(PRODUCTS[4]), mode: 'sale', off: 40, seed: 'r',
  });
  assert.ok(r.hookLine.startsWith('40%OFF'), r.hookLine);
});

test('セール文体テンプレートが全トーンにそろっている', () => {
  for (const tone of Object.values(TONES)) {
    assert.ok(Array.isArray(tone.saleIntro) && tone.saleIntro.length >= 3, tone.id);
    assert.ok(tone.saleIntro.some((t) => t.includes('{hook}')), `${tone.id}: 訴求入りの型がない`);
  }
});
