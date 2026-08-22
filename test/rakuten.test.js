import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseRakutenUrl, buildSearchUrl, cleanItemName, nameCandidates,
  captionToPoints, guessCategory, mapItemToForm, firstItem, parsePastedText,
  describeApiError, extractApiError,
  API_ENDPOINT,
} from '../src/core/rakuten.js';

/* ---------------------------------------------------------------- URL */

test('商品ページのURLから商品コードを取り出す', () => {
  const r = parseRakutenUrl('https://item.rakuten.co.jp/mystore/tumbler-500/');
  assert.equal(r.ok, true);
  assert.equal(r.shopCode, 'mystore');
  assert.equal(r.itemCode, 'tumbler-500');
  assert.equal(r.itemCodeParam, 'mystore:tumbler-500');
});

test('クエリやwwwが付いていても読み取れる', () => {
  const a = parseRakutenUrl('https://www.item.rakuten.co.jp/mystore/abc123/?variantId=xyz&scid=we');
  assert.equal(a.itemCodeParam, 'mystore:abc123');
  assert.equal(a.canonicalUrl, 'https://item.rakuten.co.jp/mystore/abc123/');
});

test('短縮URL・ROOMのURL・その他は理由つきで断る', () => {
  assert.equal(parseRakutenUrl('https://a.r10.to/hAbc').reason, 'shortened');
  assert.equal(parseRakutenUrl('https://room.rakuten.co.jp/room_x/17000').reason, 'room');
  assert.equal(parseRakutenUrl('https://example.com/item/1').reason, 'notItem');
  assert.equal(parseRakutenUrl('これはURLではない').reason, 'invalid');
  assert.equal(parseRakutenUrl('').reason, 'empty');
});

test('商品コードが足りないURLは断る', () => {
  assert.equal(parseRakutenUrl('https://item.rakuten.co.jp/mystore/').reason, 'noItemCode');
});

/* ------------------------------------------------------------ API URL */

test('APIのURLを組み立てる', () => {
  const url = new URL(buildSearchUrl({
    applicationId: 'APPID', accessKey: 'AKEY', itemCode: 'mystore:tumbler-500',
  }));
  assert.equal(`${url.origin}${url.pathname}`, API_ENDPOINT);
  assert.equal(url.searchParams.get('applicationId'), 'APPID');
  assert.equal(url.searchParams.get('accessKey'), 'AKEY');
  assert.equal(url.searchParams.get('itemCode'), 'mystore:tumbler-500');
  assert.equal(url.searchParams.get('format'), 'json');
});

test('JSONP用のcallbackを足せる', () => {
  const url = new URL(buildSearchUrl({ applicationId: 'A', itemCode: 'a:b', callback: 'cb1' }));
  assert.equal(url.searchParams.get('callback'), 'cb1');
});

test('必要なパラメータが欠けていればエラーにする', () => {
  assert.throws(() => buildSearchUrl({ itemCode: 'a:b' }), /applicationId/);
  assert.throws(() => buildSearchUrl({ applicationId: 'A' }), /itemCode/);
});

/* -------------------------------------------------------------- 商品名 */

test('商品名から販促の飾りを落とす', () => {
  const r = cleanItemName('【楽天1位】【送料無料】【あす楽】ステンレスタンブラー 蓋付き 500ml / ポイント10倍');
  assert.equal(r.name, 'ステンレスタンブラー 蓋付き 500ml');
  assert.ok(r.removed.includes('【楽天1位】'));
  assert.ok(r.removed.includes('【送料無料】'));
});

test('内容に関わる【】は残す', () => {
  const r = cleanItemName('【2個セット】珪藻土バスマット【送料無料】');
  assert.ok(r.name.includes('【2個セット】'));
  assert.ok(!r.name.includes('【送料無料】'));
});

test('落とす対象がなければ元のまま', () => {
  const r = cleanItemName('シンプルな商品名');
  assert.equal(r.name, 'シンプルな商品名');
  assert.deepEqual(r.removed, []);
});

test('全部落ちてしまう場合は元の名前に戻す', () => {
  const r = cleanItemName('【送料無料】');
  assert.equal(r.name, '【送料無料】');
});

test('短い商品名の候補を短い順に出す', () => {
  const options = nameCandidates('ステンレスタンブラー 蓋付き 500ml 保温 保冷');
  assert.ok(options.length >= 2);
  assert.equal(options[0], 'ステンレスタンブラー');
  const lengths = options.map((o) => Array.from(o).length);
  assert.deepEqual(lengths, [...lengths].sort((a, b) => a - b));
});

/* ------------------------------------------------------------ 商品説明 */

test('商品説明を✔の候補に割る', () => {
  const points = captionToPoints(
    '■真空二重構造で保温・保冷どちらもOK。◆蓋付きなので倒しても漏れにくい設計です。'
    + '・食洗機対応でお手入れがラクラク。※送料無料キャンペーン中です。メーカー品番:TB-500。',
  );
  assert.ok(points.includes('真空二重構造で保温・保冷どちらもOK'), points.join(' / '));
  assert.ok(points.includes('食洗機対応でお手入れがラクラク'));
});

test('中黒は語の区切りとして扱わない', () => {
  assert.ok(captionToPoints('保温・保冷どちらもできて便利です').some((p) => p.includes('保温・保冷')));
});

test('送料や品番などの事務連絡は候補から外す', () => {
  const points = captionToPoints(
    '送料無料でお届けします。発送は営業日3日以内です。返品は承っておりません。'
    + '在庫状況により遅れる場合があります。使うたびに気分が上がるデザインです。',
  );
  assert.deepEqual(points, ['使うたびに気分が上がるデザインです']);
});

test('HTMLタグが混ざっていても外す', () => {
  const points = captionToPoints('<p>軽くて持ち運びしやすいサイズです</p><br>');
  assert.ok(points.some((p) => p.includes('軽くて持ち運びしやすい')));
});

test('短すぎ・長すぎる行は候補にしない', () => {
  const points = captionToPoints(`短い。${'あ'.repeat(60)}。ちょうどよい長さの説明文です`);
  assert.deepEqual(points, ['ちょうどよい長さの説明文です']);
});

/* ---------------------------------------------------------- カテゴリ */

test('商品名からカテゴリを当てる', () => {
  assert.equal(guessCategory('衣類乾燥除湿機 部屋干し 梅雨対策'), 'clean');
  assert.equal(guessCategory('珪藻土バスマット お風呂'), 'bath');
  assert.equal(guessCategory('キャスター付きワゴン 3段 収納'), 'storage');
});

test('自信がなければ当てずに null を返す', () => {
  assert.equal(guessCategory('よく分からない何か'), null);
  assert.equal(guessCategory(''), null);
});

/* -------------------------------------------------- レスポンスの変換 */

const RESPONSE = {
  Items: [{
    Item: {
      itemName: '【楽天1位】【送料無料】衣類乾燥除湿機 部屋干し 梅雨対策 コンパクト',
      itemPrice: 9900,
      itemCaption: '■部屋干しの洗濯物が数時間で乾きます。◆タイマー付きで寝ている間に乾燥できます。送料無料でお届け。',
      itemUrl: 'https://item.rakuten.co.jp/mystore/dry-01/',
      affiliateUrl: 'https://hb.afl.rakuten.co.jp/abc',
      shopName: 'マイストア楽天市場店',
      reviewCount: 1284,
      reviewAverage: 4.52,
      mediumImageUrls: [{ imageUrl: 'https://thumbnail.image.rakuten.co.jp/x.jpg' }],
    },
  }],
};

test('レスポンスからフォームの中身を作る', () => {
  const form = mapItemToForm(firstItem(RESPONSE));
  assert.equal(form.name, '衣類乾燥除湿機 部屋干し 梅雨対策 コンパクト');
  assert.equal(form.salePrice, 9900);
  assert.equal(form.cat, 'clean');
  assert.equal(form.catLabel, '掃除・洗濯');
  assert.equal(form.reviewCount, 1284);
  assert.equal(form.url, 'https://hb.afl.rakuten.co.jp/abc');
  assert.ok(form.pointOptions.some((p) => p.includes('数時間で乾きます')));
  assert.ok(!form.pointOptions.some((p) => p.includes('送料無料')));
});

test('Itemの入れ子がなくても読める', () => {
  assert.ok(firstItem({ Items: [{ itemName: 'そのまま' }] }).itemName === 'そのまま');
  assert.equal(firstItem({ Items: [] }), null);
  assert.equal(firstItem({}), null);
  assert.equal(mapItemToForm(null), null);
});

/* ------------------------------------------------ 貼り付けから読み取る */

test('コピーした文章から商品名と2つの価格を読み取る', () => {
  const r = parsePastedText(
    '【送料無料】ステンレスタンブラー 蓋付き 500ml\n通常価格 3,980円\nセール価格 2,480円\n'
    + 'https://item.rakuten.co.jp/mystore/tumbler-500/',
  );
  assert.equal(r.ok, true);
  assert.equal(r.name, 'ステンレスタンブラー 蓋付き 500ml');
  assert.equal(r.regularPrice, 3980);
  assert.equal(r.salePrice, 2480);
  assert.equal(r.url, 'https://item.rakuten.co.jp/mystore/tumbler-500/');
});

test('価格が1つだけならセール価格として扱う', () => {
  const r = parsePastedText('珪藻土バスマット\n2,980円');
  assert.equal(r.regularPrice, null);
  assert.equal(r.salePrice, 2980);
});

test('読み取れるものがなければ断る', () => {
  assert.equal(parsePastedText('').ok, false);
  assert.equal(parsePastedText('   ').ok, false);
});

test('桁の小さすぎる数字は価格として拾わない', () => {
  const r = parsePastedText('マグカップ 2個セット\n50円分のポイント\n1,980円');
  assert.equal(r.salePrice, 1980);
});

/* ---------------------------------------------------- APIエラーの説明 */

test('実際に返るエラーコードを、次にやることが分かる文言にする', () => {
  // 楽天APIに実際に投げて確認したコード
  assert.match(
    describeApiError({ status: 403, errorMessage: 'REQUEST_CONTEXT_BODY_HTTP_REFERRER_MISSING' }),
    /Referer/,
  );
  assert.match(
    describeApiError({ status: 403, errorMessage: 'HTTP_REFERRER_NOT_ALLOWED' }),
    /許可ドメイン/,
  );
  assert.match(
    describeApiError({ status: 400, errorMessage: 'accessKey must be present as a query parameter or in the header' }),
    /アクセスキー/,
  );
  assert.match(describeApiError({ status: 429 }), /上限/);
  assert.match(describeApiError({ status: 503 }), /一時的/);
});

test('レスポンスの中のエラーを取り出す', () => {
  const msg = extractApiError({ errors: { errorCode: 403, errorMessage: 'HTTP_REFERRER_NOT_ALLOWED' } }, 403);
  assert.match(msg, /許可ドメイン/);
  assert.equal(extractApiError({ Items: [] }, 200), null);
  assert.equal(extractApiError(null, 200), null);
});
