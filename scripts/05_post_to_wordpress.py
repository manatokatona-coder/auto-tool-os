"""
⑤ WordPressへの下書き投稿

生成した記事(Markdown)をWordPressに「下書き」として登録する。
※必ず status="draft" で登録し、人が最終確認してから公開に変更する運用を推奨します。

事前準備:
    1. WordPress管理画面 → ユーザー → プロフィール → アプリケーションパスワード で発行
    2. .env に WP_URL / WP_USER / WP_APP_PASSWORD を設定

使い方:
    python scripts/05_post_to_wordpress.py --slug rakuten-mattress-2026
"""

import argparse
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import markdown as md
import requests

from lib.config import WP_APP_PASSWORD, WP_URL, WP_USER
from lib.store import read_text, write_json


def markdown_to_html(text: str) -> tuple[str, str]:
    lines = text.splitlines()
    title = lines[0].lstrip("# ").strip() if lines and lines[0].startswith("#") else "無題"
    body_md = "\n".join(lines[1:])
    html = md.markdown(body_md)
    return title, html


def create_draft_post(title: str, html_content: str, categories: list[int] | None = None) -> dict:
    if not (WP_URL and WP_USER and WP_APP_PASSWORD):
        raise RuntimeError(
            "WP_URL / WP_USER / WP_APP_PASSWORD が設定されていません。.env を確認してください。"
        )

    endpoint = f"{WP_URL}/wp-json/wp/v2/posts"
    payload = {
        "title": title,
        "content": html_content,
        "status": "draft",  # 必ず draft から始める。公開はレビュー後に手動で切り替える
    }
    if categories:
        payload["categories"] = categories

    response = requests.post(
        endpoint,
        json=payload,
        auth=(WP_USER, WP_APP_PASSWORD),
        timeout=30,
    )
    response.raise_for_status()
    return response.json()


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--slug", required=True)
    parser.add_argument(
        "--draft-file",
        default="03_draft.md",
        help="投稿するMarkdownファイル名(articles/<slug>/配下)。レビュー後に手直しした版を指定してもよい",
    )
    parser.add_argument("--category", type=int, action="append", help="WordPressカテゴリID(複数指定可)")
    args = parser.parse_args()

    text = read_text(args.slug, args.draft_file)
    title, html = markdown_to_html(text)
    result = create_draft_post(title, html, categories=args.category)

    write_json(args.slug, "05_wordpress.json", result)

    print(f"下書きを作成しました: {result['link']} (id={result['id']})")
    print("WordPress管理画面で内容を確認してから公開してください。")


if __name__ == "__main__":
    main()
