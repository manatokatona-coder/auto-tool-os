"""
SNS(Instagram / Threads)への告知投稿。

記事タイトルとURL(WordPress投稿済みの場合はそのリンク)から、Claudeに
プラットフォームごとの告知文を生成させる。

★重要: Instagram/Threadsの投稿APIには「下書き」という概念がなく、publishすると
即座に一般公開される。そのためこのスクリプトはデフォルトで dry-run(生成した文面を
表示するだけで投稿しない)。内容を確認したうえで --publish を明示的に付けたときだけ
実際に投稿する。

事前準備:
    Meta for Developers でアプリを作成し、対象のInstagram/Threadsアカウントと連携。
    .env に INSTAGRAM_USER_ID / INSTAGRAM_ACCESS_TOKEN、
    THREADS_USER_ID(任意、省略時は"me") / THREADS_ACCESS_TOKEN を設定。

使い方:
    # まずは文面だけ確認(投稿しない)
    python scripts/07_post_to_social.py --slug rakuten-mattress-2026 --platforms instagram,threads

    # 確認後、実際に投稿する(Instagramは--image-urlが必須)
    python scripts/07_post_to_social.py --slug rakuten-mattress-2026 --platforms threads --publish
    python scripts/07_post_to_social.py --slug rakuten-mattress-2026 --platforms instagram \
        --image-url https://example.com/wp-content/uploads/2026/08/eyecatch.jpg --publish
"""

import argparse
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from lib.claude import ask_claude
from lib.social import post_to_instagram, post_to_threads
from lib.store import exists, read_json, write_text

SYSTEM_PROMPT = """あなたはSNS運用のアシスタントです。以下のルールを厳守してください。
- 効果・効能を保証するような断定表現は使わない(「必ず」「絶対に」等は避ける)
- アフィリエイト・広告を含む投稿であることが伝わるよう、文頭または文末に必ず「[PR]」
  もしくは「#PR」を明記する(ステルスマーケティング規制対応のため必須)
- 記事の内容を誇張しない
- 出力は投稿文のみとし、説明や前置きは付けない"""


def build_prompt(platform: str, title: str, url: str) -> str:
    if platform == "instagram":
        return f"""次のブログ記事をInstagramで告知する投稿文を作成してください。

記事タイトル: {title}
記事URL: {url}(Instagramの投稿本文にはリンクを貼れないため、
「プロフィールのリンクから」等、URLの案内方法を工夫した文にしてください)

条件:
- 150字程度
- 関連ハッシュタグを3〜5個、文末に付ける
- 絵文字は控えめに"""
    else:  # threads
        return f"""次のブログ記事をThreadsで告知する投稿文を作成してください。

記事タイトル: {title}
記事URL: {url}

条件:
- 200字程度
- 記事URLを本文に含める(Threadsはリンクをそのまま貼れる)
- カジュアルで読みやすいトーン"""


def get_article_url(slug: str) -> str:
    if exists(slug, "05_wordpress.json"):
        wp = read_json(slug, "05_wordpress.json")
        return wp.get("link", "")
    return "(WordPress未投稿。手動でURLを補ってください)"


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--slug", required=True)
    parser.add_argument(
        "--platforms",
        default="instagram,threads",
        help="カンマ区切りで instagram,threads のいずれかを指定",
    )
    parser.add_argument("--image-url", help="Instagram投稿に使う画像の公開URL(instagramを含む場合は必須)")
    parser.add_argument(
        "--publish",
        action="store_true",
        help="実際にSNSへ投稿する。省略時は文面を生成・表示するだけで投稿しない(dry-run)",
    )
    args = parser.parse_args()

    platforms = [p.strip() for p in args.platforms.split(",") if p.strip()]
    invalid = [p for p in platforms if p not in ("instagram", "threads")]
    if invalid:
        raise SystemExit(f"エラー: 未対応のプラットフォームです: {invalid}(instagram/threadsのみ対応)")

    if "instagram" in platforms and args.publish and not args.image_url:
        raise SystemExit("エラー: --publish でInstagramに投稿する場合は --image-url が必須です。")

    meta = read_json(args.slug, "meta.json")
    title = meta["title"]
    url = get_article_url(args.slug)

    captions = {}
    for platform in platforms:
        print(f"文面生成中: {platform}")
        caption = ask_claude(SYSTEM_PROMPT, build_prompt(platform, title, url), max_tokens=500)
        captions[platform] = caption
        write_text(args.slug, f"07_social_{platform}.md", caption)
        print(f"\n--- {platform} 投稿文案 ---\n{caption}\n")

    if not args.publish:
        print(
            "dry-runモードのため投稿していません。内容を確認し、問題なければ "
            "--publish を付けて再実行してください(Instagram/Threadsには下書き機能が"
            "APIに存在しないため、--publishすると即座に一般公開されます)。"
        )
        return

    for platform, caption in captions.items():
        if platform == "instagram":
            result = post_to_instagram(caption, args.image_url)
        else:
            result = post_to_threads(caption)
        print(f"投稿完了({platform}): {result}")


if __name__ == "__main__":
    main()
