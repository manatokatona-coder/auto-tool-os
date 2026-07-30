"""
① キーワード・市場リサーチ

競合記事のタイトル・見出し構成(人がリサーチツールやSERPから収集したテキスト)を
Claudeに渡して、差別化ポイントやタイトル案を分析させる。

使い方:
    python scripts/01_research.py --slug rakuten-mattress-2026 \
        --keyword "マットレス おすすめ" \
        --competitors queue/rakuten-mattress-2026/competitors.txt
"""

import argparse
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from lib.claude import ask_claude
from lib.store import write_text

SYSTEM_PROMPT = """あなたはSEOリサーチのアシスタントです。
与えられた競合記事のタイトル・見出し構成を分析し、事実として存在しない情報
(検索順位、検索ボリュームなど)を勝手に生成しないでください。
渡されたテキストの範囲内で分析・要約してください。"""


def build_prompt(keyword: str, competitors_text: str) -> str:
    return f"""以下は「{keyword}」で上位表示されている記事のタイトルと見出し構成です。

{competitors_text}

これらを分析し、
1. 共通して扱われているトピック
2. どの記事にも書かれていない/弱い切り口(差別化ポイント)
3. 想定される検索意図(比較/購入直前/情報収集のどれか)
4. この記事で狙うべきタイトル案を3つ
を出してください。"""


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--slug", required=True, help="記事の識別スラッグ(例: rakuten-mattress-2026)")
    parser.add_argument("--keyword", required=True, help="狙うメインキーワード")
    parser.add_argument(
        "--competitors",
        required=True,
        help="競合記事のタイトル・見出しを貼り付けたテキストファイルのパス",
    )
    args = parser.parse_args()

    with open(args.competitors, encoding="utf-8") as f:
        competitors_text = f.read()

    print(f"分析中: {args.keyword}")
    result = ask_claude(SYSTEM_PROMPT, build_prompt(args.keyword, competitors_text), max_tokens=2000)

    path = write_text(args.slug, "01_research.md", result)
    print(f"完了: {path}")
    print("内容を確認し、02_outline.py に進んでください。")


if __name__ == "__main__":
    main()
