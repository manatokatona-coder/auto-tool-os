/**
 * 表現チェック用の辞書。
 *
 * 楽天ROOM／楽天アフィリエイトで投稿が弾かれたり、
 * 法令上まずくなりやすい表現をまとめている。分類は3系統。
 *
 *  1. yakuji  … 薬機法。化粧品・健康食品・健康グッズで医薬品的な効能を言うとNG
 *  2. keihyo  … 景品表示法。根拠のない最上級・断定
 *  3. room    … 楽天ROOM／アフィリエイト規約側で弾かれやすい表現
 *
 * severity: 'block'（直す前提） / 'warn'（文脈次第。目視確認）
 */

export const NG_RULES = [
  // --- 薬機法 ---
  { word: '治る', kind: 'yakuji', severity: 'block', why: '医薬品的な効能効果の表現', fix: '「気分が軽くなった」など体感の記述に置き換える' },
  { word: '治療', kind: 'yakuji', severity: 'block', why: '医薬品的な効能効果の表現', fix: '「ケア」「お手入れ」に置き換える' },
  { word: '効果がある', kind: 'yakuji', severity: 'warn', why: '効能の断定にあたる可能性', fix: '「私の場合は〜と感じた」と主観に寄せる' },
  { word: '医学的', kind: 'yakuji', severity: 'block', why: '医学的根拠の標榜', fix: '根拠を示せないなら削除する' },
  { word: '副作用', kind: 'yakuji', severity: 'warn', why: '医薬品を想起させる', fix: '雑貨・化粧品では使わない' },
  { word: '痩せる', kind: 'yakuji', severity: 'block', why: '痩身効果の標榜', fix: '「続けやすい」「習慣にしやすい」に置き換える' },
  { word: 'デトックス', kind: 'yakuji', severity: 'warn', why: '身体機能への作用を想起させる', fix: '「すっきりする」など体感表現へ' },
  { word: '免疫力', kind: 'yakuji', severity: 'block', why: '身体機能への作用の標榜', fix: '削除する' },
  { word: 'アンチエイジング', kind: 'yakuji', severity: 'warn', why: '化粧品の効能範囲を超えることがある', fix: '「年齢に応じたお手入れ」の範囲に留める' },
  { word: '熱中症', kind: 'yakuji', severity: 'block', why: '楽天ROOMで弾かれる報告が多い疾病名', fix: '「暑い日の対策」など疾病名を出さない言い換えへ' },
  { word: '花粉症', kind: 'yakuji', severity: 'warn', why: '疾病名。効能を示唆すると薬機法に触れる', fix: '「この季節の対策」に言い換える' },
  { word: '不眠', kind: 'yakuji', severity: 'warn', why: '疾病名', fix: '「寝つきが気になるとき」に言い換える' },

  // --- 景品表示法 ---
  { word: '最安値', kind: 'keihyo', severity: 'block', why: '価格は変動する。裏付けのない最上級表現', fix: '「今回のセール価格」と事実だけ書く' },
  { word: '日本一', kind: 'keihyo', severity: 'block', why: '根拠のない最上級表現', fix: '出典のあるランキング名を明記するか削除' },
  { word: 'No.1', kind: 'keihyo', severity: 'warn', why: '調査主体・期間の明示が必要', fix: '「楽天ランキング◯◯部門1位（取得日）」のように出典を添える' },
  { word: '絶対', kind: 'keihyo', severity: 'warn', why: '断定表現', fix: '「私は〜だった」と体験に寄せる' },
  { word: '必ず', kind: 'keihyo', severity: 'warn', why: '断定表現', fix: '「たいてい」「多くの場合」に緩める' },
  { word: '100%', kind: 'keihyo', severity: 'warn', why: '成分表記でなければ誇大になりやすい', fix: '成分・素材の事実でなければ削除' },
  { word: '完全に', kind: 'keihyo', severity: 'warn', why: '断定表現', fix: '「ほぼ」「かなり」に緩める' },

  // --- 楽天ROOM／アフィリエイト規約 ---
  { word: '利益', kind: 'room', severity: 'warn', why: '転売・せどりを想起させる表現は規約で禁止', fix: '購入者目線の表現に変える' },
  { word: '転売', kind: 'room', severity: 'block', why: '転売関連の表現は禁止', fix: '削除する' },
  { word: 'せどり', kind: 'room', severity: 'block', why: 'せどり関連の表現は禁止', fix: '削除する' },
  { word: '仕入れ', kind: 'room', severity: 'warn', why: '転売を想起させる', fix: '「購入」に言い換える' },
  { word: '買取', kind: 'room', severity: 'warn', why: '転売を想起させる', fix: '削除する' },
  { word: '相互フォロー', kind: 'room', severity: 'warn', why: '相互フォロー目的の投稿は規約違反とみなされることがある', fix: '商品の話に絞る' },
  { word: 'フォロバ', kind: 'room', severity: 'warn', why: '相互フォロー勧誘とみなされることがある', fix: '削除する' },
  { word: 'いいね返し', kind: 'room', severity: 'warn', why: '相互行為の勧誘とみなされることがある', fix: '削除する' },
];

/** ステマ規制（景表法・2023年10月〜）で使ってよい表記。 */
export const PR_LABELS_OK = ['PR', '広告', '宣伝', 'プロモーション', '本投稿にはプロモーションが含まれます'];

/** 表記として認められにくいもの。日本語話者に伝わらない略語は不可とされている。 */
export const PR_LABELS_NG = ['AD', 'sponsored', 'Sponsored', 'Supported', 'Premium partner', 'アンバサダー'];

/**
 * PR表記が必須になるケース。
 * 通常のアフィリエイトリンクだけの投稿は「任意」だが、
 * 商品提供・イベント参加・お試しクーポンなど、成果報酬以外のやり取りがあると必須になる。
 */
export const PR_REQUIRED_CASES = [
  { id: 'gift', label: '商品を提供された（プレミアムパートナー等）', required: true },
  { id: 'event', label: '楽天や広告主のイベント・体験に参加した', required: true },
  { id: 'coupon', label: 'アフィリエイター向けのお試しクーポンを使った', required: true },
  { id: 'other', label: '成果報酬以外の金品・情報のやり取りがあった', required: true },
  { id: 'plain', label: '自分で買った商品をアフィリエイトリンクで紹介するだけ', required: false },
];
