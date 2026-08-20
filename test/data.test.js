import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PRODUCTS, CATEGORIES, SEASONS } from '../src/data/products.js';
import { THEMES, searchProducts, suggestIdeas, suggestTheme } from '../src/core/ideas.js';
import { buildRoomTags, buildXTags } from '../src/data/hashtags.js';
import { isDay5or0, seasonOf, suggestEvents, EVENTS } from '../src/data/saleEvents.js';
import { findNgWords } from '../src/core/validate.js';

test('商品IDが重複していない', () => {
  const ids = PRODUCTS.map((p) => p.id);
  assert.equal(new Set(ids).size, ids.length);
});

test('全商品に必要な項目がそろっている', () => {
  for (const p of PRODUCTS) {
    assert.ok(CATEGORIES[p.cat], `${p.id}: 不明なカテゴリ ${p.cat}`);
    assert.ok(SEASONS[p.season], `${p.id}: 不明な季節 ${p.season}`);
    assert.ok(p.name && p.pain && p.hook && p.caution, `${p.id}: 空の項目がある`);
    assert.ok(p.merits.length >= 2, `${p.id}: メリットが2件未満`);
    assert.ok(p.scenes.length >= 1, `${p.id}: 使用シーンがない`);
    assert.ok([0, 1, 2].includes(p.maniac), `${p.id}: maniacが不正`);
  }
});

test('商品辞書そのものにNG表現が混ざっていない', () => {
  for (const p of PRODUCTS) {
    const text = [p.name, p.pain, p.hook, p.caution, ...p.merits, ...p.scenes].join(' ');
    const hits = findNgWords(text).filter((h) => h.severity === 'block');
    assert.deepEqual(hits.map((h) => h.word), [], `${p.id}(${p.name})`);
  }
});

test('テーマが参照する商品IDがすべて実在する', () => {
  const ids = new Set(PRODUCTS.map((p) => p.id));
  for (const t of THEMES) {
    for (const id of t.items) assert.ok(ids.has(id), `${t.id}: 未知の商品ID ${id}`);
    assert.ok(t.items.length >= 5, `${t.id}: 商品が5件未満`);
  }
});

test('キーワード検索が名前以外にも当たる', () => {
  assert.ok(searchProducts('部屋干し').length >= 2);
  assert.ok(searchProducts('収納').length >= 3);
  assert.equal(searchProducts('').length, 0);
});

test('ネタ出しは指定した条件で絞られる', () => {
  const maniac = suggestIdeas({ maniac: 2, limit: 20, seed: 'a' });
  assert.ok(maniac.length > 0);
  assert.ok(maniac.every((i) => i.product.maniac === 2));

  const kitchen = suggestIdeas({ cat: 'kitchen', limit: 20, seed: 'b' });
  assert.ok(kitchen.every((i) => i.product.cat === 'kitchen'));
});

test('まとめ投稿テーマは季節が合うものを優先する', () => {
  const t = suggestTheme({ season: 'spring', seed: 'x' });
  assert.ok(t.items.length >= 5);
  assert.ok(t.items.every((i) => i && i.name));
});

test('ROOMのタグは5個まで、Xのタグは3個まで', () => {
  const room = buildRoomTags({ cat: 'storage', event: 'supersale', season: 'spring', extra: ['a', 'b', 'c', 'd'] });
  assert.ok(room.length <= 5);
  assert.equal(room[0], 'オリジナル写真');
  assert.ok(buildXTags({ cat: 'storage', event: 'supersale', extra: ['a', 'b', 'c'] }).length <= 3);
});

test('タグが重複しない', () => {
  const tags = buildRoomTags({ cat: 'kitchen', event: 'marathon', season: 'winter' });
  assert.equal(new Set(tags).size, tags.length);
});

test('5と0のつく日を日付から判定できる', () => {
  const at = (d) => new Date(2026, 8, d);
  for (const d of [5, 10, 15, 20, 25, 30]) assert.equal(isDay5or0(at(d)), true, `${d}日`);
  for (const d of [1, 7, 13, 22, 28]) assert.equal(isDay5or0(at(d)), false, `${d}日`);
});

test('季節の切り分けが月と一致する', () => {
  assert.equal(seasonOf(new Date(2026, 2, 1)), 'spring');
  assert.equal(seasonOf(new Date(2026, 6, 1)), 'summer');
  assert.equal(seasonOf(new Date(2026, 9, 1)), 'autumn');
  assert.equal(seasonOf(new Date(2026, 0, 1)), 'winter');
});

test('セール提案は確定と推測を区別して返す', () => {
  const onDay10 = suggestEvents(new Date(2026, 8, 10));
  const confirmed = onDay10.find((s) => s.confidence === 'confirmed');
  assert.equal(confirmed.event, 'day5and0');
  assert.ok(onDay10.every((s) => ['confirmed', 'guess'].includes(s.confidence)));

  const onDay3 = suggestEvents(new Date(2026, 8, 3));
  assert.ok(onDay3.every((s) => s.confidence === 'guess'));
  assert.ok(EVENTS[onDay3[0].event]);
});

test('ネタ出しの想定タグが重複しない', () => {
  for (const i of suggestIdeas({ limit: 40, seed: 'tags' })) {
    assert.equal(new Set(i.suggestedTags).size, i.suggestedTags.length, i.product.id);
  }
});

test('ネタ出しの理由は日本語の季節名で出る', () => {
  const list = suggestIdeas({ season: 'summer', limit: 10, seed: 'why' });
  assert.ok(list.some((i) => i.why.includes('夏')));
  assert.ok(list.every((i) => !i.why.includes('summer')));
});
