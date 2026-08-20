import { test } from 'node:test';
import assert from 'node:assert/strict';
import { xLength, roomLength, ROOM_MAX, ROOM_PREVIEW, X_MAX_WEIGHTED } from '../src/core/textLength.js';

test('日本語は1文字を重み2として数える', () => {
  assert.equal(xLength('あ').weighted, 2);
  assert.equal(xLength('あ'.repeat(140)).weighted, X_MAX_WEIGHTED);
  assert.equal(xLength('あ'.repeat(140)).over, false);
  assert.equal(xLength('あ'.repeat(141)).over, true);
});

test('半角英数は重み1として数える', () => {
  assert.equal(xLength('abc123').weighted, 6);
  assert.equal(xLength('a').weighted, 1);
});

test('URLは長さにかかわらず一律23として数える', () => {
  const short = xLength('https://a.co');
  const long = xLength('https://room.rakuten.co.jp/room_abcdef/1700000000000000?scid=we_rom_iphone');
  assert.equal(short.weighted, 23);
  assert.equal(long.weighted, 23);
  assert.equal(long.urlCount, 1);
});

test('絵文字の合字はまとめて1つとして数える', () => {
  assert.equal(xLength('👨‍👩‍👧‍👦').weighted, 2);
  assert.equal(xLength('🇯🇵').weighted, 2);
});

test('ROOMは500文字が上限で、42文字までが一覧に出る', () => {
  const text = 'あ'.repeat(100);
  const r = roomLength(text);
  assert.equal(r.length, 100);
  assert.equal(r.max, ROOM_MAX);
  assert.equal(r.preview.length, ROOM_PREVIEW);
  assert.equal(r.previewFull, true);
  assert.equal(roomLength('あ'.repeat(501)).over, true);
  assert.equal(roomLength('あ'.repeat(500)).over, false);
});

test('42文字以内なら全文が一覧に出る', () => {
  const r = roomLength('短い紹介文');
  assert.equal(r.preview, '短い紹介文');
  assert.equal(r.previewFull, false);
});
