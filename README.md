# auto-tool-os

Claudeを使ったアフィリエイトブログの「リサーチ→記事生成→投稿→改善」を半自動化するツール群です。
設計思想と各ステップの詳しい解説は [`docs/guide.md`](docs/guide.md) を参照してください。

**全自動で記事を公開する仕組みではありません。** ①〜③(リサーチ・アウトライン・本文生成)は
自動化しますが、④(ファクトチェック・表現チェック)と実際の公開判断は必ず人が行う設計です。
WordPressへの投稿も常に `status: draft` で登録され、最終公開は人がWordPress管理画面で行います。

## パイプライン

```
① キーワード・競合リサーチ        scripts/01_research.py
② アウトライン設計                scripts/02_outline.py
③ 本文生成(セクション分割)        scripts/03_generate_article.py
④ Claudeによる一次レビュー ★人の最終確認が必須  scripts/04_review_article.py
⑤ WordPressへ下書き投稿           scripts/05_post_to_wordpress.py
⑥ GSCデータから改善提案            scripts/06_analyze_performance.py
```

記事ごとの中間成果物は `articles/<slug>/` に蓄積されます(`01_research.md` → `02_outline.json`
/ `meta.json` → `03_draft.md` → `04_review.md` → `05_wordpress.json`)。

## セットアップ

```bash
pip install -r requirements.txt
cp .env.example .env
# .env に ANTHROPIC_API_KEY / WP_URL / WP_USER / WP_APP_PASSWORD を設定
```

WordPressのアプリケーションパスワードは 管理画面 → ユーザー → プロフィール →
「アプリケーションパスワード」から発行できます。

## 使い方(手動で1記事ずつ)

```bash
# ① リサーチ(競合のタイトル・見出しをテキストファイルに貼り付けておく)
python scripts/01_research.py --slug rakuten-mattress-2026 \
  --keyword "マットレス おすすめ" \
  --competitors path/to/competitors.txt

# 内容を確認してから ②
python scripts/02_outline.py --slug rakuten-mattress-2026 \
  --title "【比較】マットレスおすすめ5選" \
  --keyword "マットレス おすすめ" \
  --sub-keywords "マットレス 選び方,マットレス 硬さ" \
  --persona "腰痛に悩む30代の会社員"

# アウトライン(articles/rakuten-mattress-2026/02_outline.json)を確認・編集してから ③
python scripts/03_generate_article.py --slug rakuten-mattress-2026

# 下書き(03_draft.md)を必ず人が読んで事実確認・表現修正。任意で④のClaudeレビューを併用
python scripts/04_review_article.py --slug rakuten-mattress-2026

# レビュー・修正が終わったらWordPressへ下書き投稿(status=draftで登録される)
python scripts/05_post_to_wordpress.py --slug rakuten-mattress-2026
```

## 使い方(キュー投入によるバッチ/半自動運用)

1. `queue/example-keyword.yaml` をコピーして `queue/<slug>.yaml` を作成し、
   `slug` / `title` / `keyword` / `persona` / `competitors`(競合記事の見出し等)を記入
2. ローカルでまとめて処理する場合:
   ```bash
   python scripts/run_queue.py --all-new
   ```
   `articles/<slug>/` が未生成のキューだけを対象に①〜③を自動実行します。
3. GitHubにpushすると `.github/workflows/generate_drafts.yml` が
   (手動実行 / 週1回のスケジュール / `queue/*.yaml` の変更をトリガーに)
   同じ処理を実行し、生成された下書きをPRとして提出します。
   **PRの内容は必ず人がレビューしてからマージしてください。**
   マージ後、④のレビューを経て⑤でWordPressに投稿する運用を想定しています。

GitHub Actionsで使う場合は、リポジトリの Settings → Secrets and variables → Actions に
`ANTHROPIC_API_KEY` を登録してください。

## 改善サイクル(⑥)

Google Search Consoleから `url,impressions,clicks,position` 形式でCSVをエクスポートし、

```bash
python scripts/06_analyze_performance.py --input gsc_export.csv
```

CTRが低いのに掲載順位が高い記事を抽出し、タイトル・メタディスクリプションの改善案を
`reports/` 配下にMarkdownで出力します。

## ディレクトリ構成

```
lib/                共通モジュール(Claude APIラッパー、設定、ファイルIO)
scripts/             各ステップのCLIスクリプト
queue/                キュー投入用YAML(半自動運用の入力)
articles/<slug>/      記事ごとの中間成果物
reports/              ⑥の改善提案レポート
docs/guide.md         設計思想・各ステップの詳しい解説
.github/workflows/    GitHub Actionsによる半自動下書き生成
```

## 重要な注意点

- Claude単体はリアルタイムの検索順位・検索ボリュームを把握できません。①のリサーチは
  実際のSERP・キーワードツールのデータを人が貼り付けて「分析・要約」させる使い方が前提です。
- 本文生成時、価格・スペックなど時事性の高い数値は `[要確認]` として仮置きされます。
  公開前に必ず一次情報で人が裏取りしてください。
- 景品表示法・薬機法・ステルスマーケティング規制(アフィリエイトである旨の表示)への対応は
  Claudeのレビュー(④)はあくまで一次チェックであり、最終判断は人が行ってください。
  判断に迷う場合は専門家(弁護士等)に確認してください。
- 競合記事の文章をそのまま複製させることは著作権侵害になり得ます。あくまで構成の参考・
  差別化ポイントの分析に使ってください。
- 詳しくは [`docs/guide.md`](docs/guide.md) の「重要な注意点」を参照してください。
