"""
①リサーチ→②アウトライン→③本文生成→④Claudeレビュー→⑤WordPress下書き投稿を
1コマンドで通しで実行する。

★重要: ⑤は常に WordPress に status="draft" で登録するだけで、公開(publish)は
一切行わない。実際にサイトへ公開するかどうかの最終判断は、必ず人がWordPress管理画面で
下書きの内容(価格等の[要確認]箇所、④のレビュー指摘、法令面の表現)を確認してから行うこと。
このスクリプトはその確認作業を代替しない。

使い方(直接引数を渡す場合):
    python scripts/run_pipeline.py \
        --slug rakuten-mattress-2026 \
        --title "【比較】マットレスおすすめ5選" \
        --keyword "マットレス おすすめ" \
        --sub-keywords "マットレス 選び方,マットレス 硬さ" \
        --persona "腰痛に悩む30代の会社員" \
        --competitors path/to/competitors.txt \
        --category 3

使い方(queue/*.yaml を渡す場合。競合情報はYAML内のcompetitorsフィールドを使う):
    python scripts/run_pipeline.py --queue-file queue/example-keyword.yaml
"""

import argparse
import os
import subprocess
import sys
import tempfile

import yaml

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from lib.config import REPO_ROOT
from lib.store import read_text

SCRIPTS_DIR = os.path.join(REPO_ROOT, "scripts")


def run(args: list[str]):
    print(f"$ {' '.join(args)}")
    subprocess.run(args, check=True)


def load_from_queue_file(path: str) -> dict:
    with open(path, encoding="utf-8") as f:
        data = yaml.safe_load(f)

    required = ["slug", "title", "keyword", "persona", "competitors"]
    missing = [k for k in required if not data.get(k)]
    if missing:
        raise SystemExit(f"エラー: {path} に必須項目が不足しています: {missing}")
    return data


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--queue-file", help="queue/*.yaml と同じ形式のファイルから設定を読み込む")
    parser.add_argument("--slug", help="記事の識別スラッグ")
    parser.add_argument("--title", help="記事タイトル")
    parser.add_argument("--keyword", help="メインキーワード")
    parser.add_argument("--sub-keywords", default="", help="サブキーワード(カンマ区切り)")
    parser.add_argument("--persona", help="想定読者")
    parser.add_argument("--competitors", help="競合記事のタイトル・見出しを貼り付けたテキストファイルのパス")
    parser.add_argument("--category", type=int, action="append", help="WordPressカテゴリID(複数指定可)")
    parser.add_argument(
        "--skip-review",
        action="store_true",
        help="④のClaudeレビューをスキップする(非推奨。デフォルトは実行する)",
    )
    args = parser.parse_args()

    competitors_tmp_path = None

    if args.queue_file:
        data = load_from_queue_file(args.queue_file)
        slug = data["slug"]
        title = data["title"]
        keyword = data["keyword"]
        sub_keywords = data.get("sub_keywords", "")
        persona = data["persona"]
        with tempfile.NamedTemporaryFile(
            "w", suffix=".txt", delete=False, encoding="utf-8"
        ) as tmp:
            tmp.write(data["competitors"])
            competitors_tmp_path = tmp.name
        competitors_path = competitors_tmp_path
        categories = data.get("categories") or args.category
    else:
        missing = [
            name
            for name, value in [
                ("--slug", args.slug),
                ("--title", args.title),
                ("--keyword", args.keyword),
                ("--persona", args.persona),
                ("--competitors", args.competitors),
            ]
            if not value
        ]
        if missing:
            raise SystemExit(
                f"エラー: --queue-file を使わない場合は次の引数が必須です: {missing}"
            )
        slug = args.slug
        title = args.title
        keyword = args.keyword
        sub_keywords = args.sub_keywords
        persona = args.persona
        competitors_path = args.competitors
        categories = args.category

    try:
        run([
            sys.executable, os.path.join(SCRIPTS_DIR, "01_research.py"),
            "--slug", slug, "--keyword", keyword, "--competitors", competitors_path,
        ])
        run([
            sys.executable, os.path.join(SCRIPTS_DIR, "02_outline.py"),
            "--slug", slug, "--title", title, "--keyword", keyword,
            "--sub-keywords", sub_keywords, "--persona", persona,
        ])
        run([
            sys.executable, os.path.join(SCRIPTS_DIR, "03_generate_article.py"),
            "--slug", slug,
        ])

        if not args.skip_review:
            run([
                sys.executable, os.path.join(SCRIPTS_DIR, "04_review_article.py"),
                "--slug", slug,
            ])

        post_cmd = [
            sys.executable, os.path.join(SCRIPTS_DIR, "05_post_to_wordpress.py"),
            "--slug", slug,
        ]
        for cat in categories or []:
            post_cmd += ["--category", str(cat)]
        run(post_cmd)
    finally:
        if competitors_tmp_path:
            os.remove(competitors_tmp_path)

    print("\n" + "=" * 60)
    print(f"articles/{slug}/ に生成物一式、WordPressに下書きを登録しました。")
    if not args.skip_review:
        print("\n--- ④ Claudeによる一次レビュー(要確認事項) ---\n")
        print(read_text(slug, "04_review.md"))
        print("\n--- レビューここまで ---")
    print(
        "\n重要: 上記は一次チェックに過ぎません。価格・スペック等の[要確認]箇所の裏取り、"
        "誇大表現・ステマ表示・薬機法/景品表示法に触れる表現がないかを必ず人が確認し、"
        "WordPress管理画面で内容を見てから公開してください。このコマンドは公開(publish)を"
        "一切行いません。"
    )
    print(
        "\n確認が終わり、日時を指定して予約公開したい場合は以下を実行してください"
        "(このコマンド自体には予約機能を含めていません。必ずレビュー後に手動で):\n"
        f"  python scripts/05_post_to_wordpress.py --slug {slug} --schedule 2026-08-05T09:00:00"
    )


if __name__ == "__main__":
    main()
