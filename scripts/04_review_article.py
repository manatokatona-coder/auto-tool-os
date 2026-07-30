"""
④ ファクトチェック・SEO調整(Claudeによる一次レビュー)

Claudeに下書きをレビューさせ、誇大表現・ステマ規制上の指摘・メタディスクリプション案・
内部リンク候補を出させる。この結果はあくまで一次チェックであり、最終判断は必ず人が行う。

使い方:
    python scripts/04_review_article.py --slug rakuten-mattress-2026
"""

import argparse
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from lib.claude import ask_claude
from lib.store import read_text, write_text

SYSTEM_PROMPT = """あなたはSEO記事のレビュアーです。指摘は具体的に、該当箇所を引用しながら行ってください。
断定はせず、あくまで「確認が必要な候補」としてリストアップしてください。"""


def build_prompt(draft: str) -> str:
    return f"""以下の記事本文をレビューしてください。

{draft}

1. 誇大・断定的すぎる表現(効果を保証するような文言)がないか、該当箇所を引用して指摘
2. アフィリエイトリンクである旨の表示が必要な箇所を指摘(ステマ規制対応)
3. 薬機法・景品表示法に触れる可能性のある表現がないか指摘
4. メタディスクリプション案を120字程度で3案
5. 内部リンクを入れるべき箇所を3つ提案"""


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--slug", required=True)
    args = parser.parse_args()

    draft = read_text(args.slug, "03_draft.md")

    print("レビュー中...")
    review = ask_claude(SYSTEM_PROMPT, build_prompt(draft), max_tokens=2000)

    path = write_text(args.slug, "04_review.md", review)
    print(f"完了: {path}")
    print("この結果は一次チェックです。最終的な事実確認・表現の妥当性は必ず人が判断してください。")


if __name__ == "__main__":
    main()
