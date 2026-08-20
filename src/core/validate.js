/**
 * 生成した文章のチェック。投稿ボタンを押す前に引っかかる点を洗い出す。
 *
 * 見ているのは4つ。
 *   1. 文字数（ROOM 500 / X 280重み）
 *   2. 冒頭42文字にフックがあるか（ROOMの一覧はここまでしか出ない）
 *   3. NG表現（薬機法・景表法・ROOM規約）
 *   4. ステマ規制のPR表記
 */

import { NG_RULES, PR_LABELS_OK, PR_LABELS_NG } from '../data/ngwords.js';
import { roomLength, xLength, ROOM_PREVIEW } from './textLength.js';

/** 本文に含まれるNG表現を洗い出す。 */
export function findNgWords(text) {
  const hits = [];
  for (const rule of NG_RULES) {
    let idx = text.indexOf(rule.word);
    while (idx !== -1) {
      hits.push({ ...rule, index: idx });
      idx = text.indexOf(rule.word, idx + rule.word.length);
    }
  }
  return hits.sort((a, b) => a.index - b.index);
}

/**
 * PR表記の状態を判定する。
 * needsPr が true なのに表記がなければ block、
 * 表記があってもNGな略語（AD / sponsored など）なら block を返す。
 */
export function checkPrLabel(text, needsPr) {
  const head = Array.from(text).slice(0, 60).join('');
  const hasOk = PR_LABELS_OK.some((l) => text.includes(l));
  const hasOkInHead = PR_LABELS_OK.some((l) => head.includes(l));
  const badLabel = PR_LABELS_NG.find((l) => text.includes(l));

  const issues = [];
  if (badLabel) {
    issues.push({
      severity: 'block',
      message: `「${badLabel}」はPR表記として認められていません`,
      fix: `「PR」「広告」「プロモーション」のいずれかに置き換える`,
    });
  }
  if (needsPr && !hasOk) {
    issues.push({
      severity: 'block',
      message: '商品提供・イベント参加などがある投稿にはPR表記が必須です',
      fix: '本文の冒頭に「PR」または「広告」を入れる',
    });
  }
  if (needsPr && hasOk && !hasOkInHead) {
    issues.push({
      severity: 'warn',
      message: 'PR表記が本文の後ろにあります',
      fix: 'X・ROOMでは投稿の上部に置くよう案内されているので冒頭へ移動する',
    });
  }
  return { hasPrLabel: hasOk, issues };
}

/** ROOM紹介文の総合チェック。 */
export function validateRoomComment(text, { needsPr = false } = {}) {
  const len = roomLength(text);
  const ng = findNgWords(text);
  const pr = checkPrLabel(text, needsPr);
  const issues = [...pr.issues];

  if (len.over) {
    issues.push({
      severity: 'block',
      message: `${len.length}文字。ROOMの上限500文字を${-len.remaining}文字超えています`,
      fix: 'メインのメリットを2つに削るか、使用シーンの一文を落とす',
    });
  }
  const firstLine = text.split('\n')[0] || '';
  if (Array.from(firstLine).length > ROOM_PREVIEW) {
    issues.push({
      severity: 'warn',
      message: `1行目が${Array.from(firstLine).length}文字。一覧では42文字で切れます`,
      fix: '1行目を42文字以内に収め、そこだけで内容が伝わるようにする',
    });
  }
  for (const hit of ng) {
    issues.push({
      severity: hit.severity,
      message: `「${hit.word}」：${hit.why}`,
      fix: hit.fix,
    });
  }

  return {
    ok: !issues.some((i) => i.severity === 'block'),
    length: len,
    ngWords: ng,
    issues,
  };
}

/** X投稿の総合チェック。 */
export function validateXPost(text, { needsPr = false } = {}) {
  const len = xLength(text);
  const ng = findNgWords(text);
  const pr = checkPrLabel(text, needsPr);
  const issues = [...pr.issues];

  if (len.over) {
    issues.push({
      severity: 'block',
      message: `重み${len.weighted}／280。日本語で約${Math.ceil(-len.remaining / 2)}文字オーバーです`,
      fix: '説明の一文を削るか、ハッシュタグを1つ減らす',
    });
  }
  const tagCount = (text.match(/#[^\s#]+/g) || []).length;
  if (tagCount > 4) {
    issues.push({
      severity: 'warn',
      message: `ハッシュタグが${tagCount}個あります`,
      fix: '関連の薄いタグはエンゲージメントを下げます。3個前後に絞る',
    });
  }
  for (const hit of ng) {
    issues.push({
      severity: hit.severity,
      message: `「${hit.word}」：${hit.why}`,
      fix: hit.fix,
    });
  }

  return {
    ok: !issues.some((i) => i.severity === 'block'),
    length: len,
    ngWords: ng,
    issues,
  };
}
