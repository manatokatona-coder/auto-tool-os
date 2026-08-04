"""
queue/ 配下のYAMLファイルを読み込み、①リサーチ→②アウトライン→③本文生成を自動実行する。
既に articles/<slug>/ が存在するキューはスキップする(重複生成を防ぐ)。

GitHub Actions からの半自動実行、またはローカルでのバッチ実行を想定。
④(レビュー)・⑤(WordPress投稿)は人の確認を挟むため、このスクリプトには含めない。

使い方:
    python scripts/run_queue.py --all-new
    python scripts/run_queue.py --queue-file queue/example-keyword.yaml
"""

import argparse
import glob
import os
import subprocess
import sys
import tempfile

import yaml

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from lib.config import ARTICLES_DIR, QUEUE_DIR, REPO_ROOT

SCRIPTS_DIR = os.path.join(REPO_ROOT, "scripts")


def run(args: list[str]):
    print(f"$ {' '.join(args)}")
    subprocess.run(args, check=True)


def process_one(queue_path: str):
    with open(queue_path, encoding="utf-8") as f:
        data = yaml.safe_load(f)

    required = ["slug", "title", "keyword", "persona", "competitors"]
    missing = [k for k in required if not data.get(k)]
    if missing:
        print(f"スキップ: {queue_path} に必須項目が不足しています: {missing}")
        return

    slug = data["slug"]
    article_dir = os.path.join(ARTICLES_DIR, slug)
    if os.path.exists(article_dir):
        print(f"スキップ: articles/{slug} は既に存在します。")
        return

    with tempfile.NamedTemporaryFile(
        "w", suffix=".txt", delete=False, encoding="utf-8"
    ) as tmp:
        tmp.write(data["competitors"])
        competitors_path = tmp.name

    try:
        run([
            sys.executable,
            os.path.join(SCRIPTS_DIR, "01_research.py"),
            "--slug", slug,
            "--keyword", data["keyword"],
            "--competitors", competitors_path,
        ])
        run([
            sys.executable,
            os.path.join(SCRIPTS_DIR, "02_outline.py"),
            "--slug", slug,
            "--title", data["title"],
            "--keyword", data["keyword"],
            "--sub-keywords", data.get("sub_keywords", ""),
            "--persona", data["persona"],
        ])
        run([
            sys.executable,
            os.path.join(SCRIPTS_DIR, "03_generate_article.py"),
            "--slug", slug,
        ])
    finally:
        os.remove(competitors_path)

    print(f"完了: articles/{slug}/03_draft.md (人によるレビュー待ち)")


def main():
    parser = argparse.ArgumentParser()
    group = parser.add_mutually_exclusive_group(required=True)
    group.add_argument("--queue-file", help="単一のキューファイルのパス")
    group.add_argument(
        "--all-new", action="store_true", help="未処理(articles/未生成)のキューを全て処理"
    )
    args = parser.parse_args()

    if args.queue_file:
        process_one(args.queue_file)
        return

    queue_files = sorted(glob.glob(os.path.join(QUEUE_DIR, "*.yaml")))
    if not queue_files:
        print("queue/ にYAMLファイルがありません。")
        return

    for path in queue_files:
        process_one(path)


if __name__ == "__main__":
    main()
