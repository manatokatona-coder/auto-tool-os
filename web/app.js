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
  'x-url', 'x-link', 'idea-season', 'idea-cat', 'idea-maniac',
];

function bindAutosave() {
  for (const id of INPUT_IDS) {
    $(id).addEventListener('change', saveInput);
    $(id).addEventListener('input', saveInput);
  }
}

function saveInput() {
  const data = {};
  for (const id of INPUT_IDS) {
    const n = $(id);
    data[id] = n.type === 'checkbox' ? n.checked : n.value;
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
    if (n.type === 'checkbox') n.checked = Boolean(v);
    else n.value = v;
  }
}

/** iOSショートカットなどから ?name=…&url=… で開かれたときにフォームを埋める。 */
function applyQueryParams() {
  const q = new URLSearchParams(location.search);
  const map = { name: 'f-name', url: 'x-url', cat: 'f-cat', off: 'f-off', pain: 'f-pain', hook: 'f-hook' };
  let touched = false;
  for (const [key, id] of Object.entries(map)) {
    const v = q.get(key);
    if (v) {
      $(id).value = v;
      touched = true;
    }
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
    length: $('f-length').value,
    season: $('idea-season').value || RT.seasonOf(new Date()),
    hasOriginalPhoto: $('f-photo').checked,
    needsPr: $('f-pr').checked,
  };
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
    ];
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
}

function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  if (location.protocol !== 'https:' && location.hostname !== 'localhost') return;
  navigator.serviceWorker.register('./sw.js').catch(() => {
    /* オフライン化に失敗してもアプリ自体は動く */
  });
}

init();
