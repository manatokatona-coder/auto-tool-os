/**
 * 画面まわり。生成ロジックは src/ 側にあり、ここは入出力の橋渡しだけ。
 *
 * iPhoneでの使い勝手のために気をつけている点：
 *   - 入力は localStorage に自動保存する。アプリを閉じても打ち直しにならない。
 *   - コピーは navigator.clipboard を使い、失敗したら選択状態にして手動コピーへ落とす。
 *   - iOSショートカットから ?name=... で開いたときにフォームを埋める。
 */

import * as RT from '../src/index.js';

const $ = (id) => document.getElementById(id);
const el = (tag, props = {}, children = []) => {
  const n = document.createElement(tag);
  Object.assign(n, props);
  for (const c of [].concat(children)) n.append(c);
  return n;
};

const STORE_KEY = 'room-tool.input.v1';
const KEY_STORE = 'room-tool.rakuten-keys.v1';
let seedCounter = 0;

/* ------------------------------------------------------------------ 起動 */

function init() {
  fillSelects();
  restoreInput();
  renderToday();
  // タブ切り替えを先に配線してから、クエリパラメータでの流し込み（タブ移動を伴う）を行う
  bindTabs();
  bindActions();
  applyQueryParams();
  bindAutosave();
  bindModeSwitch();
  bindLayoutSwitch();
  restoreKeys();
  registerServiceWorker();
}

function fillSelects() {
  const opt = (v, t) => el('option', { value: v, textContent: t });

  const cats = Object.entries(RT.CATEGORIES);
  $('idea-cat').append(opt('', 'すべて'), ...cats.map(([k, v]) => opt(k, v)));
  $('f-cat').append(...cats.map(([k, v]) => opt(k, v)));

  const seasons = { '': '今日の季節', ...RT.SEASONS };
  $('idea-season').append(...Object.entries(seasons).map(([k, v]) => opt(k, v)));

  $('f-tone').append(...RT.TONE_LIST.map((t) => opt(t.id, `${t.label}｜${t.desc.slice(0, 18)}`)));
  $('f-length').append(...Object.entries(RT.LENGTH_PRESETS).map(([k, v]) => opt(k, v.label)));

  const events = RT.EVENT_LIST.map((e) => opt(e.id, e.label));
  $('f-event').append(...events);
  $('f-event').value = 'none';

  $('x-link').append(...Object.values(RT.LINK_PLACEMENTS).map((p) => opt(p.id, p.label)));
  const patterns = RT.X_PATTERN_LIST.filter((p) => p.id !== 'list');
  $('x-patterns').append(...patterns.map((p) => opt(p.id, `${p.label}｜${p.desc}`)));
  for (const o of $('x-patterns').options) o.selected = ['empathy', 'problem', 'spec'].includes(o.value);

  $('f-accent').append(...RT.ACCENT_EMOJI.map((e) => opt(e, `${e}  この色で揃える`)));

  $('pr-cases').append(
    ...RT.PR_REQUIRED_CASES.map((c) =>
      el('li', { textContent: `${c.required ? '【必須】' : '【任意】'} ${c.label}` }),
    ),
  );
}

/** 今日の日付から、狙えるセールと季節を出す。断定できるのは「5と0のつく日」だけ。 */
function renderToday() {
  const now = new Date();
  const season = RT.SEASONS[RT.seasonOf(now)];
  const lines = RT.suggestEvents(now).map((s) =>
    s.confidence === 'confirmed' ? `${RT.EVENTS[s.event].label}（確定）` : `${RT.EVENTS[s.event].label}の月（要確認）`,
  );
  $('today').textContent = `${now.getMonth() + 1}/${now.getDate()}・${season}／${lines.join('・')}`;
}

/* -------------------------------------------------------------- タブ制御 */

function bindTabs() {
  const buttons = [...document.querySelectorAll('nav button')];
  for (const b of buttons) {
    b.addEventListener('click', () => {
      for (const other of buttons) other.setAttribute('aria-selected', String(other === b));
      for (const tab of ['ideas', 'room', 'x', 'check']) {
        $(`tab-${tab}`).hidden = tab !== b.dataset.tab;
      }
      window.scrollTo({ top: 0 });
    });
  }
}

function goTab(name) {
  document.querySelector(`nav button[data-tab="${name}"]`).click();
}

/* ------------------------------------------------------------ 入力の保存 */

const INPUT_IDS = [
  'f-name', 'f-cat', 'f-tone', 'f-pain', 'f-hook', 'f-merits', 'f-caution',
  'f-scene', 'f-exp', 'f-event', 'f-off', 'f-length', 'f-photo', 'f-pr',
  'f-mode-normal', 'f-mode-sale', 'f-price-regular', 'f-price-sale',
  'f-layout-influencer', 'f-layout-review', 'f-target', 'f-target-emoji',
  'f-signature', 'f-accent', 'f-keywords', 'f-cta',
  'x-url', 'x-link', 'idea-season', 'idea-cat', 'idea-maniac',
];

/** チェックボックスとラジオは checked、それ以外は value を読む。 */
const isToggle = (node) => node.type === 'checkbox' || node.type === 'radio';

function bindAutosave() {
  for (const id of INPUT_IDS) {
    $(id).addEventListener('change', saveInput);
    $(id).addEventListener('input', saveInput);
  }
}

/** 書き方の型の切り替え。型でしか使わない入力欄を出し入れする。 */
function bindLayoutSwitch() {
  const sync = () => {
    const influencer = $('f-layout-influencer').checked;
    $('influencer-fields').hidden = !influencer;
    $('layout-note').textContent = influencer
      ? 'キャッチ→✔リスト→体験談→誘導文の並びで作ります。ROOMで伸びている投稿の型です。'
      : 'イントロ→メリット→デメリット→クロージングの3段構成で作ります。';
  };
  for (const id of ['f-layout-influencer', 'f-layout-review']) {
    $(id).addEventListener('change', sync);
  }
  sync();
}

/** 通常商品／セール商品の切り替えと、価格欄の表示・割引率の自動計算。 */
function bindModeSwitch() {
  const sync = () => {
    $('sale-fields').hidden = !$('f-mode-sale').checked;
    updatePriceNote();
  };
  for (const id of ['f-mode-normal', 'f-mode-sale']) $(id).addEventListener('change', sync);
  for (const id of ['f-price-regular', 'f-price-sale', 'f-off']) {
    $(id).addEventListener('input', updatePriceNote);
  }
  sync();
}

/** 入力された価格から、実際に冒頭へ出る文字列をその場で見せる。 */
function updatePriceNote() {
  const note = $('price-note');
  const regular = RT.parsePrice($('f-price-regular').value);
  const sale = RT.parsePrice($('f-price-sale').value);
  const off = $('f-off').value ? Number($('f-off').value) : null;
  const variants = RT.priceMoveVariants({ regular, sale, off });

  if (variants.length === 0) {
    note.textContent = '通常価格とセール価格を入れると、紹介文の冒頭が「19,800円→9,900円（50%OFF）」の形になります。';
    return;
  }
  if (regular && sale && regular <= sale) {
    note.textContent = '通常価格がセール価格以下になっています。2つの欄が入れ替わっていないか確認してください。';
    return;
  }
  const saved = regular && sale ? `・${RT.formatYen(regular - sale)}お得` : '';
  note.textContent = `冒頭はこうなります：「${variants[0].text}」${saved}`;
}

function saveInput() {
  const data = {};
  for (const id of INPUT_IDS) {
    const n = $(id);
    data[id] = isToggle(n) ? n.checked : n.value;
  }
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(data));
  } catch {
    /* プライベートブラウズなどで保存できなくても動作は続ける */
  }
}

function restoreInput() {
  let data;
  try {
    data = JSON.parse(localStorage.getItem(STORE_KEY) || '{}');
  } catch {
    return;
  }
  for (const [id, v] of Object.entries(data)) {
    const n = $(id);
    if (!n) continue;
    if (isToggle(n)) n.checked = Boolean(v);
    else n.value = v;
  }
}

/** iOSショートカットなどから ?name=…&url=… で開かれたときにフォームを埋める。 */
function applyQueryParams() {
  const q = new URLSearchParams(location.search);
  const map = {
    name: 'f-name', url: 'x-url', cat: 'f-cat', off: 'f-off',
    pain: 'f-pain', hook: 'f-hook',
    price: 'f-price-regular', sale: 'f-price-sale',
  };
  let touched = false;
  for (const [key, id] of Object.entries(map)) {
    const v = q.get(key);
    if (v) {
      $(id).value = v;
      touched = true;
    }
  }
  // 価格が渡ってきたら、セール商品として開く
  if (q.get('sale') || q.get('price')) {
    $('f-mode-sale').checked = true;
    $('sale-fields').hidden = false;
    updatePriceNote();
    touched = true;
  }
  if (touched) {
    saveInput();
    goTab('room');
  }
}

/* -------------------------------------------------------------- 共通部品 */

function toast(message) {
  const t = $('toast');
  t.textContent = message;
  t.classList.add('show');
  clearTimeout(toast._timer);
  toast._timer = setTimeout(() => t.classList.remove('show'), 1600);
}

/** コピー。Clipboard APIが使えない状況では選択状態にして手動コピーに逃がす。 */
async function copyText(text, node) {
  try {
    await navigator.clipboard.writeText(text);
    toast('コピーしました');
    return;
  } catch {
    /* 下のフォールバックへ */
  }
  try {
    const range = document.createRange();
    range.selectNodeContents(node);
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
    toast('選択しました。長押しでコピーしてください');
  } catch {
    toast('コピーできませんでした');
  }
}

/** 生成のたびに結果の先頭までスクロールする。スマホでは結果が画面外に出るため。 */
function revealResults(container) {
  requestAnimationFrame(() => {
    container.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
}

function gaugeClass(ratio) {
  if (ratio > 1) return 'gauge danger';
  if (ratio > 0.92) return 'gauge warn';
  return 'gauge';
}

function issueList(issues) {
  if (!issues.length) return el('p', { className: 'sub', textContent: '指摘なし。そのまま投稿できます。' });
  const ul = el('ul', { className: 'issues' });
  for (const i of issues) {
    ul.append(
      el('li', { className: i.severity }, [
        el('span', { textContent: i.message }),
        el('span', { className: 'fix', textContent: `→ ${i.fix}` }),
      ]),
    );
  }
  return ul;
}

/** 冒頭42文字までを塗って、どこで一覧表示が切れるかを見せる。 */
function outputWithPreviewMark(text) {
  const box = el('div', { className: 'output' });
  const chars = Array.from(text);
  if (chars.length <= RT.ROOM_PREVIEW) {
    box.append(el('mark', { className: 'preview', textContent: text }));
    return box;
  }
  box.append(
    el('mark', { className: 'preview', textContent: chars.slice(0, RT.ROOM_PREVIEW).join('') }),
    el('span', { className: 'cut', textContent: '42字' }),
    document.createTextNode(chars.slice(RT.ROOM_PREVIEW).join('')),
  );
  return box;
}

function resultCard({ title, text, badges, gauge, issues, marked = false, extraButtons = [] }) {
  const card = el('div', { className: 'result' });
  const meta = el('div', { className: 'meta' }, [el('strong', { textContent: title })]);
  for (const b of badges) meta.append(el('span', { className: `badge ${b.kind || ''}`, textContent: b.text }));
  card.append(meta);

  if (gauge) {
    card.append(el('div', { className: gaugeClass(gauge.ratio) }, [
      el('i', { style: `width:${Math.min(100, gauge.ratio * 100)}%` }),
    ]));
  }

  const body = marked ? outputWithPreviewMark(text) : el('div', { className: 'output', textContent: text });
  card.append(body);

  const copyBtn = el('button', { className: 'primary', textContent: 'コピー' });
  copyBtn.addEventListener('click', () => copyText(text, body));
  card.append(copyBtn);

  for (const b of extraButtons) card.append(b);
  card.append(issueList(issues));
  return card;
}

/* -------------------------------------------------------- 入力の読み取り */

function readForm() {
  const merits = $('f-merits').value.split('\n').map((s) => s.trim()).filter(Boolean);
  return {
    name: $('f-name').value.trim(),
    cat: $('f-cat').value,
    tone: $('f-tone').value,
    pain: $('f-pain').value.trim(),
    hook: $('f-hook').value.trim(),
    merits,
    caution: $('f-caution').value.trim(),
    scene: $('f-scene').value.trim(),
    experience: $('f-exp').value.trim(),
    event: $('f-event').value,
    off: $('f-off').value ? Number($('f-off').value) : null,
    layout: $('f-layout-review').checked ? 'review' : 'influencer',
    target: $('f-target').value.trim(),
    targetEmoji: $('f-target-emoji').value.trim(),
    signatureTag: $('f-signature').value.trim(),
    accent: $('f-accent').value || '🤎',
    cta: $('f-cta').value.trim(),
    plainKeywords: $('f-keywords').value.split('\n').map((s) => s.trim()).filter(Boolean).slice(0, 2),
    mode: $('f-mode-sale').checked ? 'sale' : 'normal',
    regularPrice: RT.parsePrice($('f-price-regular').value),
    salePrice: RT.parsePrice($('f-price-sale').value),
    length: $('f-length').value,
    season: $('idea-season').value || RT.seasonOf(new Date()),
    hasOriginalPhoto: $('f-photo').checked,
    needsPr: $('f-pr').checked,
  };
}

/* ------------------------------------------------- 商品をURLから読み込む */

function loadKeys() {
  try {
    return JSON.parse(localStorage.getItem(KEY_STORE) || '{}');
  } catch {
    return {};
  }
}

function saveKeys() {
  try {
    localStorage.setItem(KEY_STORE, JSON.stringify({
      applicationId: $('imp-appid').value.trim(),
      accessKey: $('imp-key').value.trim(),
    }));
  } catch {
    /* 保存できなくても、その場の取り込みは動く */
  }
}

/**
 * 楽天のAPIを呼ぶ。まず fetch で試し、CORSで弾かれたらJSONPに切り替える。
 * JSONPはscriptタグでの読み込みなのでCORSの制限を受けない。
 */
async function callRakutenApi(itemCode, keys) {
  const direct = RT.buildSearchUrl({ ...keys, itemCode });
  try {
    const res = await fetch(direct);
    const json = await res.json().catch(() => null);
    const apiError = json && RT.extractApiError(json, res.status);
    if (apiError) throw new Error(apiError);
    if (res.ok && json) return json;
    throw new Error(RT.describeApiError({ status: res.status }));
  } catch (e) {
    if (e.message && !/Failed to fetch|NetworkError|CORS/i.test(e.message)) throw e;
    return await callRakutenJsonp(itemCode, keys);
  }
}

/** JSONPでの呼び出し。CORSに阻まれたときの逃げ道。 */
function callRakutenJsonp(itemCode, keys) {
  return new Promise((resolve, reject) => {
    const fn = `roomToolJsonp${Date.now()}`;
    const script = document.createElement('script');
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error('楽天APIから応答がありませんでした。キーと許可ドメインの設定を確認してください'));
    }, 12000);

    const cleanup = () => {
      clearTimeout(timer);
      delete window[fn];
      script.remove();
    };

    window[fn] = (data) => {
      cleanup();
      resolve(data);
    };
    script.onerror = () => {
      cleanup();
      reject(new Error('楽天APIを呼び出せませんでした。キーと許可ドメインの設定を確認してください'));
    };

    script.src = RT.buildSearchUrl({ ...keys, itemCode, callback: fn });
    document.head.append(script);
  });
}

async function importFromUrl() {
  const out = $('imp-out');
  out.replaceChildren();

  const parsed = RT.parseRakutenUrl($('imp-url').value);
  if (!parsed.ok) {
    out.append(el('p', { className: 'note', textContent: parsed.message }));
    return;
  }

  // URLだけでも先にリンク欄へ入れておく。ここまではキーがなくてもできる。
  if (!$('x-url').value) $('x-url').value = parsed.canonicalUrl;
  saveInput();

  const keys = { applicationId: $('imp-appid').value.trim(), accessKey: $('imp-key').value.trim() };
  if (!keys.applicationId) {
    out.append(el('p', { className: 'note', textContent: 'リンクは取り込みました。商品名や価格まで自動で入れるには、下の「楽天APIキーの設定」を開いてキーを入れてください。キーなしで進めるなら「コピーした文章から読み取る」が使えます。' }));
    $('imp-settings').open = true;
    return;
  }

  const button = $('btn-import');
  button.disabled = true;
  button.textContent = '読み込み中…';

  try {
    const data = await callRakutenApi(parsed.itemCodeParam, keys);
    const item = RT.firstItem(data);
    if (!item) {
      out.append(el('p', { className: 'note', textContent: 'この商品コードでは見つかりませんでした。商品ページのURLをもう一度確認してください。' }));
      return;
    }
    renderImported(RT.mapItemToForm(item), parsed.canonicalUrl);
    toast('商品を読み込みました');
  } catch (e) {
    out.append(el('p', { className: 'note', textContent: e.message }));
  } finally {
    button.disabled = false;
    button.textContent = 'この商品を読み込む';
  }
}

function importFromText() {
  const out = $('imp-out');
  out.replaceChildren();

  const parsed = RT.parsePastedText($('imp-text').value);
  if (!parsed.ok) {
    out.append(el('p', { className: 'note', textContent: parsed.message }));
    return;
  }
  renderImported({ ...parsed, pointOptions: [], catLabel: parsed.cat ? RT.CATEGORIES[parsed.cat] : null }, parsed.url);
  toast('読み取りました');
}

/**
 * 読み込んだ内容をフォームへ反映し、選ぶ余地のあるもの（短い商品名・✔の候補）は
 * その場で選べるように出す。自動で決めきらないのは、どれを使うかが投稿の質に直結するため。
 */
function renderImported(form, url) {
  const out = $('imp-out');
  out.replaceChildren();

  // すぐ決まるものは入れてしまう
  $('f-name').value = form.name || '';
  if (form.cat) $('f-cat').value = form.cat;
  if (form.salePrice) {
    $('f-mode-sale').checked = true;
    $('sale-fields').hidden = false;
    $('f-price-sale').value = form.salePrice;
    if (form.regularPrice) $('f-price-regular').value = form.regularPrice;
    updatePriceNote();
  }
  if (url && !$('x-url').value) $('x-url').value = url;
  saveInput();

  const summary = [
    form.shopName ? `ショップ: ${form.shopName}` : '',
    form.catLabel ? `カテゴリ: ${form.catLabel}` : 'カテゴリ: 判定できず（手で選んでください）',
    form.reviewCount ? `レビュー: ★${form.reviewAverage}（${form.reviewCount}件）` : '',
  ].filter(Boolean);

  const card = el('div', { className: 'result' }, [
    el('div', { className: 'meta' }, [el('strong', { textContent: '読み込みました' })]),
    ...summary.map((t) => el('p', { className: 'sub', textContent: t })),
  ]);

  if (form.nameRemoved?.length) {
    card.append(el('p', { className: 'sub', textContent: `商品名から外した販促表記: ${form.nameRemoved.join(' ')}` }));
  }

  // 商品名の短縮候補
  if (form.nameOptions?.length > 1) {
    card.append(el('p', { className: 'sub', style: 'margin-top:10px', textContent: 'キャッチに使う商品名を選ぶ' }));
    const chips = el('div', { className: 'chips' });
    for (const option of form.nameOptions) {
      const b = el('button', { type: 'button', textContent: option });
      b.setAttribute('aria-pressed', String(option === $('f-name').value));
      b.addEventListener('click', () => {
        $('f-name').value = option;
        saveInput();
        for (const other of chips.children) other.setAttribute('aria-pressed', String(other === b));
      });
      chips.append(b);
    }
    card.append(chips);
  }

  // 商品説明から拾った✔の候補
  if (form.pointOptions?.length) {
    card.append(el('p', { className: 'sub', style: 'margin-top:12px', textContent: '✔リストに入れるものを選ぶ（6つまで）' }));
    const list = el('ul', { className: 'picked' });
    for (const option of form.pointOptions) {
      const box = el('input', { type: 'checkbox' });
      const li = el('li', {}, [box, el('span', { textContent: option })]);
      list.append(li);
    }
    const apply = el('button', { className: 'secondary', textContent: '選んだものを✔リストに入れる' });
    apply.addEventListener('click', () => {
      const picked = [...list.querySelectorAll('li')]
        .filter((li) => li.querySelector('input').checked)
        .map((li) => li.querySelector('span').textContent)
        .slice(0, 6);
      if (picked.length === 0) {
        toast('入れるものを選んでください');
        return;
      }
      $('f-merits').value = picked.join('\n');
      saveInput();
      toast(`${picked.length}件を入れました`);
    });
    card.append(list, apply);
  }

  const note = el('p', {
    className: 'note',
    textContent: '通常価格はAPIから取れません。二重価格で書くなら、商品ページに出ている通常価格を自分で入れてください。',
  });
  if (form.salePrice) card.append(note);

  out.append(card);
}

/* ------------------------------------------------------------ ①ネタ出し */

function renderIdeas() {
  const out = $('ideas-out');
  out.replaceChildren();

  const q = $('idea-q').value.trim();
  const maniacRaw = $('idea-maniac').value;
  let list;

  if (q) {
    const hits = RT.searchProducts(q);
    if (!hits.length) {
      out.append(el('div', { className: 'card' }, [
        el('p', { className: 'sub', textContent: `「${q}」に合う題材が辞書にありませんでした。商品名を直接入力して「ROOM文」タブで作れます。` }),
      ]));
      return;
    }
    list = hits.slice(0, 8).map((p) => ({
      product: p,
      category: RT.CATEGORIES[p.cat],
      angle: `${p.pain} → ${p.hook}`,
      why: 'キーワード検索の結果',
      suggestedTags: (p.tags || []).slice(0, 3),
    }));
  } else {
    list = RT.suggestIdeas({
      cat: $('idea-cat').value || null,
      maniac: maniacRaw === '' ? null : Number(maniacRaw),
      season: $('idea-season').value || null,
      limit: 6,
      seed: `ideas-${seedCounter++}`,
    });
  }

  for (const idea of list) {
    const card = el('div', { className: 'idea' }, [
      el('h3', { textContent: idea.product.name }),
      el('p', { textContent: idea.angle }),
      el('p', { className: 'tagline', textContent: `${idea.category}／${idea.why}` }),
      el('p', { textContent: `想定タグ： ${idea.suggestedTags.map((t) => `#${t}`).join(' ')}` }),
    ]);
    const btn = el('button', { className: 'secondary', textContent: 'この商品で紹介文を作る' });
    btn.addEventListener('click', () => {
      prefillFromProduct(idea.product);
      goTab('room');
      toast('入力に反映しました');
    });
    card.append(btn);
    out.append(card);
  }
  revealResults(out);
}

function prefillFromProduct(p) {
  $('f-name').value = p.name;
  $('f-cat').value = p.cat;
  $('f-pain').value = p.pain;
  $('f-hook').value = p.hook;
  $('f-merits').value = (p.merits || []).join('\n');
  $('f-caution').value = p.caution || '';
  $('f-scene').value = (p.scenes || [])[0] || '';
  if (!$('f-target').value) $('f-target').value = `${p.pain}人に`;
  if (!$('f-target-emoji').value) $('f-target-emoji').value = RT.CATEGORY_EMOJI[p.cat] || '';
  saveInput();
}

function renderTheme() {
  const theme = RT.suggestTheme({ season: $('idea-season').value || null, seed: `theme-${seedCounter++}` });
  const out = $('ideas-out');
  out.replaceChildren();

  const card = el('div', { className: 'card' }, [
    el('h2', { textContent: `まとめ投稿テーマ：${theme.title}` }),
    el('p', { className: 'sub', textContent: `Xの見出し案：${theme.xTitle}` }),
  ]);

  for (const item of theme.items) {
    const row = el('div', { className: 'idea' }, [
      el('h3', { textContent: item.name }),
      el('p', { textContent: `${item.pain} → ${item.hook}` }),
    ]);
    const btn = el('button', { className: 'secondary', textContent: 'この商品で紹介文を作る' });
    btn.addEventListener('click', () => {
      prefillFromProduct(item);
      goTab('room');
      toast('入力に反映しました');
    });
    row.append(btn);
    card.append(row);
  }

  const useBtn = el('button', { className: 'primary', textContent: 'このテーマでX まとめ投稿を作る' });
  useBtn.addEventListener('click', () => {
    renderXList(theme);
    goTab('x');
  });
  card.append(useBtn);
  out.append(card);
  revealResults(out);
}

/* ---------------------------------------------------------- ②ROOM紹介文 */

function renderRoom(reroll = false) {
  const input = readForm();
  const out = $('room-out');
  out.replaceChildren();

  if (!input.name) {
    toast('商品名を入れてください');
    $('f-name').focus();
    return;
  }
  if (reroll) seedCounter++;

  const variants = RT.generateRoomVariants({ ...input, seed: `room-${seedCounter}` }, 3);

  for (const [i, v] of variants.entries()) {
    const L = v.validation.length;
    const badges = [
      { text: `${L.length}／500字`, kind: L.over ? 'danger' : L.length > 460 ? 'warn' : 'ok' },
      { text: v.fitsPreview ? '冒頭42字に収まる' : '1行目が42字を超過', kind: v.fitsPreview ? 'ok' : 'warn' },
      { text: RT.TONES[v.tone].label },
      { text: RT.LAYOUTS[v.layout].label },
    ];
    if (v.mode === 'sale' && v.discountPercent) {
      badges.splice(2, 0, { text: `${v.discountPercent}%OFF`, kind: 'warn' });
    }
    out.append(
      resultCard({
        title: `パターン${i + 1}`,
        text: v.text,
        badges,
        gauge: { ratio: L.length / RT.ROOM_MAX },
        issues: v.validation.issues,
        marked: true,
      }),
    );
  }

  out.append(
    el('div', { className: 'card' }, [
      el('h2', { textContent: '投稿するときのメモ' }),
      el('p', { className: 'sub', textContent: '塗ってある部分が、ROOMの一覧・検索結果で見える範囲です。ここだけで内容が伝わるかを確認してください。' }),
      el('p', { className: 'sub', textContent: '自分で撮った写真を添えると、ランクB以上のボーナス条件とピックアップ欄の掲載条件の両方を満たせます。' }),
    ]),
  );
  revealResults(out);
}

/* -------------------------------------------------------------- ③X投稿 */

function renderX() {
  const input = readForm();
  const out = $('x-out');
  out.replaceChildren();

  if (!input.name) {
    toast('「ROOM文」タブで商品名を入れてください');
    goTab('room');
    return;
  }

  const patterns = [...$('x-patterns').selectedOptions].map((o) => o.value);
  if (!patterns.length) {
    toast('型を1つ以上選んでください');
    return;
  }

  const posts = RT.generateXVariants(
    { ...input, url: $('x-url').value.trim(), linkPlacement: $('x-link').value, seed: `x-${seedCounter}` },
    patterns,
  );

  for (const p of posts) {
    const L = p.validation.length;
    const extras = [];
    if (p.replyText) {
      const replyBtn = el('button', { className: 'ghost', textContent: 'セルフリプ用の文をコピー' });
      replyBtn.addEventListener('click', () => copyText(p.replyText, replyBtn));
      extras.push(replyBtn);
    }
    out.append(
      resultCard({
        title: RT.X_PATTERNS[p.pattern].label,
        text: p.text,
        badges: [
          { text: `重み${L.weighted}／280`, kind: L.over ? 'danger' : L.weighted > 260 ? 'warn' : 'ok' },
          { text: `日本語 約${L.jpEquivalent}字`, kind: '' },
        ],
        gauge: { ratio: L.weighted / RT.X_MAX_WEIGHTED },
        issues: p.validation.issues,
        extraButtons: extras,
      }),
    );
  }

  const note = posts[0]?.linkNote;
  if (note) {
    out.append(el('div', { className: 'card' }, [el('p', { className: 'note', textContent: note })]));
  }
  revealResults(out);
}

function renderXList(theme) {
  const out = $('x-out');
  out.replaceChildren();

  const t = theme || RT.suggestTheme({ season: $('idea-season').value || null, seed: `theme-${seedCounter++}` });
  const post = RT.generateXPost({
    name: t.title,
    cat: t.items[0]?.cat || 'kitchen',
    pattern: 'list',
    theme: t.xTitle,
    items: t.items.map((i) => i.name),
    event: $('f-event').value,
    url: $('x-url').value.trim(),
    linkPlacement: $('x-link').value,
    needsPr: $('f-pr').checked,
    seed: `xlist-${seedCounter}`,
  });

  const L = post.validation.length;
  out.append(
    resultCard({
      title: `まとめ投稿：${t.title}`,
      text: post.text,
      badges: [{ text: `重み${L.weighted}／280`, kind: L.over ? 'danger' : 'ok' }],
      gauge: { ratio: L.weighted / RT.X_MAX_WEIGHTED },
      issues: post.validation.issues,
    }),
  );
  out.append(
    el('div', { className: 'card' }, [
      el('p', { className: 'sub', textContent: 'まとめ投稿は、各商品のROOM投稿を先に作ってからぶら下げると流れが作れます。' }),
    ]),
  );
  revealResults(out);
}

/* ------------------------------------------------------------ ④チェック */

function renderCheck() {
  const text = $('c-text').value;
  const out = $('check-out');
  out.replaceChildren();

  if (!text.trim()) {
    toast('文章を貼り付けてください');
    return;
  }

  const needsPr = $('c-pr').checked;
  const isRoom = $('c-mode').value === 'room';
  const result = isRoom
    ? RT.validateRoomComment(text, { needsPr })
    : RT.validateXPost(text, { needsPr });

  const badges = isRoom
    ? [
        { text: `${result.length.length}／500字`, kind: result.length.over ? 'danger' : 'ok' },
        { text: result.ok ? '投稿できます' : '要修正', kind: result.ok ? 'ok' : 'danger' },
      ]
    : [
        { text: `重み${result.length.weighted}／280`, kind: result.length.over ? 'danger' : 'ok' },
        { text: `日本語 約${result.length.jpEquivalent}字`, kind: '' },
        { text: result.ok ? '投稿できます' : '要修正', kind: result.ok ? 'ok' : 'danger' },
      ];

  out.append(
    resultCard({
      title: 'チェック結果',
      text,
      badges,
      gauge: {
        ratio: isRoom
          ? result.length.length / RT.ROOM_MAX
          : result.length.weighted / RT.X_MAX_WEIGHTED,
      },
      issues: result.issues,
      marked: isRoom,
    }),
  );
  revealResults(out);
}

/* ------------------------------------------------------------ イベント紐付け */

function bindActions() {
  $('btn-ideas').addEventListener('click', renderIdeas);
  $('btn-theme').addEventListener('click', renderTheme);
  $('btn-room').addEventListener('click', () => renderRoom(false));
  $('btn-room-again').addEventListener('click', () => renderRoom(true));
  $('btn-x').addEventListener('click', renderX);
  $('btn-x-list').addEventListener('click', () => renderXList(null));
  $('btn-check').addEventListener('click', renderCheck);
  $('btn-import').addEventListener('click', importFromUrl);
  $('btn-import-text').addEventListener('click', importFromText);
  for (const id of ['imp-appid', 'imp-key']) $(id).addEventListener('change', saveKeys);
}

/** APIキーを復元し、許可ドメインに入れる値を画面に出す。 */
function restoreKeys() {
  const keys = loadKeys();
  if (keys.applicationId) $('imp-appid').value = keys.applicationId;
  if (keys.accessKey) $('imp-key').value = keys.accessKey;
  $('imp-domain').textContent = `このサイトのドメイン: ${location.hostname || '(ファイルから開いています)'}`;
}

function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  if (location.protocol !== 'https:' && location.hostname !== 'localhost') return;
  navigator.serviceWorker.register('./sw.js').catch(() => {
    /* オフライン化に失敗してもアプリ自体は動く */
  });
}

init();
