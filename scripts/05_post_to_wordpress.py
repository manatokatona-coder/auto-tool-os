"""
⑤ WordPressへの下書き投稿・予約投稿

生成した記事(Markdown)をWordPressに登録する。
※デフォルトは必ず status="draft"。人が内容を確認してから、必要に応じて
--schedule で予約公開日時を指定する(status="future"になる)運用を想定しています。

--schedule は「人がレビュー済みの内容を、指定日時に自動公開する」ためのオプションです。
レビューしていない下書きに対して安易に使わないでください。

事前準備:
    1. WordPress管理画面 → ユーザー → プロフィール → アプリケーションパスワード で発行
    2. .env に WP_URL / WP_USER / WP_APP_PASSWORD を設定

使い方:
    # 下書きとして登録(デフォルト)
    python scripts/05_post_to_wordpress.py --slug rakuten-mattress-2026

    # レビュー済みの内容を指定日時に予約公開(WordPressのタイムゾーン設定に従う)
    python scripts/05_post_to_wordpress.py --slug rakuten-mattress-2026 \
        --schedule 2026-08-05T09:00:00
"""

import argparse
import datetime
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


def create_post(
    title: str,
    html_content: str,
    categories: list[int] | None = None,
    schedule_at: str | None = None,
) -> dict:
    if not (WP_URL and WP_USER and WP_APP_PASSWORD):
        raise RuntimeError(
            "WP_URL / WP_USER / WP_APP_PASSWORD が設定されていません。.env を確認してください。"
        )

    endpoint = f"{WP_URL}/wp-json/wp/v2/posts"
    payload = {
        "title": title,
        "content": html_content,
        "status": "draft",  # デフォルトは必ず draft。予約する場合のみ future に切り替える
    }
    if categories:
        payload["categories"] = categories

    if schedule_at:
        payload["status"] = "future"
        payload["date"] = schedule_at  # WordPressサイトのタイムゾーンで解釈される

    response = requests.post(
        endpoint,
        json=payload,
        auth=(WP_USER, WP_APP_PASSWORD),
        timeout=30,
    )
    response.raise_for_status()
    return response.json()


def validate_schedule(value: str) -> str:
    try:
        dt = datetime.datetime.fromisoformat(value)
    except ValueError as e:
        raise SystemExit(
            f"エラー: --schedule の形式が不正です(例: 2026-08-05T09:00:00): {e}"
        )
    if dt <= datetime.datetime.now():
        raise SystemExit("エラー: --schedule には未来の日時を指定してください。")
    return value


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--slug", required=True)
    parser.add_argument(
        "--draft-file",
        default="03_draft.md",
        help="投稿するMarkdownファイル名(articles/<slug>/配下)。レビュー後に手直しした版を指定してもよい",
    )
    parser.add_argument("--category", type=int, action="append", help="WordPressカテゴリID(複数指定可)")
    parser.add_argument(
        "--schedule",
        help=(
            "予約公開する日時(WordPressサイトのタイムゾーンで解釈、例: 2026-08-05T09:00:00)。"
            "指定した場合のみstatus=futureで登録され、その日時に自動公開される。"
            "省略時は必ずdraft(下書き)のまま。"
        ),
    )
    args = parser.parse_args()

    schedule_at = validate_schedule(args.schedule) if args.schedule else None

    text = read_text(args.slug, args.draft_file)
    title, html = markdown_to_html(text)
    result = create_post(title, html, categories=args.category, schedule_at=schedule_at)

    write_json(args.slug, "05_wordpress.json", result)

    if schedule_at:
        print(f"予約投稿を登録しました: {result['link']} (id={result['id']}, 公開予定: {schedule_at})")
        print("公開までの間、WordPress管理画面でいつでも内容の修正・予約取り消しができます。")
    else:
        print(f"下書きを作成しました: {result['link']} (id={result['id']})")
        print("WordPress管理画面で内容を確認してから公開(または--scheduleで予約)してください。")


if __name__ == "__main__":
    main()
