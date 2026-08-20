import { test } from 'node:test';
import assert from 'node:assert/strict';
import { findNgWords, checkPrLabel, validateRoomComment, validateXPost } from '../src/core/validate.js';

test('薬機法・景表法・ROOM規約のNG表現を拾う', () => {
  const hits = findNgWords('これで肩こりが治る。最安値でせどりにも使えます。');
  const words = hits.map((h) => h.word);
  assert.ok(words.includes('治る'));
  assert.ok(words.includes('最安値'));
  assert.ok(words.includes('せどり'));
  assert.ok(hits.every((h) => h.fix && h.why));
});

test('同じNG語が複数回出たらすべて拾う', () => {
  assert.equal(findNgWords('絶対に絶対おすすめ').filter((h) => h.word === '絶対').length, 2);
});

test('PR表記が必要なのに無ければ要修正になる', () => {
  const r = checkPrLabel('提供品のレビューです', true);
  assert.equal(r.hasPrLabel, false);
  assert.ok(r.issues.some((i) => i.severity === 'block'));
});

test('ADやsponsoredはPR表記として認めない', () => {
  const r = checkPrLabel('AD 今日の一品', true);
  assert.ok(r.issues.some((i) => i.message.includes('AD')));
});

test('PR表記が本文の後ろにあるだけなら注意になる', () => {
  const body = `${'あ'.repeat(80)}\nPR`;
  const r = checkPrLabel(body, true);
  assert.equal(r.hasPrLabel, true);
  assert.ok(r.issues.some((i) => i.severity === 'warn'));
});

test('PR表記が冒頭にあれば指摘なし', () => {
  const r = checkPrLabel('PR\nこの商品は提供いただきました。', true);
  assert.deepEqual(r.issues, []);
});

test('500文字を超えたROOM紹介文は要修正', () => {
  const r = validateRoomComment('あ'.repeat(520));
  assert.equal(r.ok, false);
  assert.ok(r.issues.some((i) => i.message.includes('500')));
});

test('1行目が42文字を超えたら注意が出る', () => {
  const r = validateRoomComment(`${'あ'.repeat(60)}\n本文`);
  assert.ok(r.issues.some((i) => i.message.includes('42文字で切れます')));
});

test('280を超えたX投稿は要修正', () => {
  const r = validateXPost('あ'.repeat(200));
  assert.equal(r.ok, false);
});

test('ハッシュタグが5個以上あると注意が出る', () => {
  const r = validateXPost('本文 #a #b #c #d #e');
  assert.ok(r.issues.some((i) => i.message.includes('ハッシュタグ')));
});
