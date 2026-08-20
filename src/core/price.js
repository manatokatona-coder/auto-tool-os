/**
 * セール価格まわりの計算と、冒頭に置く「価格の変化」の言い回し。
 *
 * 値引き商品は、何がいくらからいくらになったのかが冒頭にあるほど強い。
 * ただしROOMの一覧に出るのは42文字までなので、価格表記に使える文字数は限られる。
 * そこで同じ内容を長さ違いで何通りか用意して、42文字に収まる中でいちばん
 * 情報量の多いものを生成側が選べるようにしている。
 *
 * 割引率は必ず切り捨てで出す。四捨五入だと実際より大きい数字が出ることがあり、
 * 値引き率を実態より大きく見せる表示は景品表示法の問題になりうるため。
 */

/** "4,980" や "4980円" のような入力から数値を取り出す。取れなければ null。 */
export function parsePrice(value) {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(String(value).replace(/[,，\s円¥￥]/g, ''));
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.round(n);
}

/** 4980 → "4,980円" */
export function formatYen(n) {
  return `${String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',')}円`;
}

/** 割引率（%）。切り捨てなので、実際の値引きより大きく出ることはない。 */
export function discountPercent(regular, sale) {
  if (!regular || !sale || regular <= sale) return null;
  return Math.floor((1 - sale / regular) * 100);
}

/**
 * 冒頭に置く価格表記の候補。長い（情報量が多い）ものから並べて返す。
 * rank が高いほど情報量が多い。
 */
export function priceMoveVariants({ regular = null, sale = null, off = null } = {}) {
  const out = [];
  const pct = discountPercent(regular, sale);

  if (regular && sale && pct !== null) {
    out.push({ text: `${formatYen(regular)}→${formatYen(sale)}（${pct}%OFF）`, rank: 3 });
    out.push({ text: `${formatYen(regular)}→${formatYen(sale)}`, rank: 2 });
    if (pct > 50) out.push({ text: `半額以下の${formatYen(sale)}`, rank: 2 });
    else if (pct === 50) out.push({ text: `半額の${formatYen(sale)}`, rank: 2 });
    out.push({ text: `${pct}%OFFの${formatYen(sale)}`, rank: 1 });
  } else if (sale && off) {
    out.push({ text: `${off}%OFFの${formatYen(sale)}`, rank: 2 });
    out.push({ text: `${off}%OFF`, rank: 1 });
  } else if (off) {
    out.push({ text: `${off}%OFF`, rank: 1 });
  } else if (sale) {
    out.push({ text: `${formatYen(sale)}`, rank: 1 });
  }

  return out;
}

/**
 * 価格の入力を検査する。
 * 入力ミスと、桁を間違えたときの極端な割引率だけを見る。
 * 通常価格そのものが正しいかは機械には分からないので、そこはUI側の注意書きに任せる。
 */
export function validatePrices({ mode = 'normal', regular = null, sale = null, off = null } = {}) {
  const issues = [];
  if (mode !== 'sale') return issues;

  if (regular && sale && regular <= sale) {
    issues.push({
      severity: 'block',
      message: `通常価格（${formatYen(regular)}）がセール価格（${formatYen(sale)}）以下になっています`,
      fix: '2つの欄が入れ替わっていないか確認する',
    });
    return issues;
  }

  const pct = discountPercent(regular, sale) ?? off;
  if (pct !== null && pct >= 90) {
    issues.push({
      severity: 'warn',
      message: `割引率が${pct}%になっています`,
      fix: '桁の入力ミスでなければ、商品ページの表示と一致しているか確認する',
    });
  }

  if (!regular && !sale && !off) {
    issues.push({
      severity: 'warn',
      message: 'セール商品を選んでいますが、価格が入力されていません',
      fix: '通常価格とセール価格を入れると、冒頭に価格の変化を出せます',
    });
  } else if (!regular && sale) {
    issues.push({
      severity: 'warn',
      message: '通常価格が入っていないため、値下がり幅を書けません',
      fix: '商品ページに出ている通常価格を入れると、冒頭が強くなります',
    });
  }

  return issues;
}
