"""
② 記事構成(アウトライン)設計

01_research.py の分析結果をもとに、Claudeに見出し構成(H2ごとの執筆メモ)を
JSON形式で作らせる。E-E-A-T(比較表・体験談・デメリット)の挿入位置を明示させる。

使い方:
    python scripts/02_outline.py --slug rakuten-mattress-2026 \
        --title "【比較】マットレスおすすめ5選" \
        --keyword "マットレス おすすめ" \
        --sub-keywords "マットレス 選び方,マットレス 硬さ" \
        --persona "腰痛に悩む30代の会社員"
"""

import argparse
import json
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from lib.claude import ask_claude
from lib.store import read_text, write_json

SYSTEM_PROMPT = """あなたはSEO記事の構成作家です。
出力は必ず有効なJSON配列のみとし、説明文やコードフェンスは付けないでください。
各要素は {"heading": "見出し", "notes": "このセクションで書くべき要素"} の形式です。
notesには、比較表を入れる箇所、著者の使用体験を入れる箇所、デメリット・注意点、
CTA(購入リンク誘導)の位置などを具体的に指示してください。"""


def build_prompt(title, keyword, sub_keywords, persona, research_notes) -> str:
    return f"""テーマ: {title}
想定読者: {persona}
狙うキーワード: {keyword}、{sub_keywords}

前段のリサーチ結果:
{research_notes}

以下条件でアウトラインを作成してください。
- H2は5〜7個
- 各H2のnotesに、そのH2で扱うH3相当のポイント、比較表を入れる箇所、
  著者の使用体験を入れる箇所、デメリット・注意点を具体的に書く
- 記事末尾のH2にはCTA(購入リンク誘導)の位置を明示する
- 競合との差別化ポイント(リサーチ結果)を必ず1つ以上どこかのnotesに反映する
- 出力はJSON配列のみ"""


def parse_outline(raw: str):
    text = raw.strip()
    text = re.sub(r"^```(?:json)?\n?", "", text)
    text = re.sub(r"\n?```$", "", text)
    return json.loads(text)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--slug", required=True)
    parser.add_argument("--title", required=True, help="記事タイトル")
    parser.add_argument("--keyword", required=True, help="メインキーワード")
    parser.add_argument("--sub-keywords", default="", help="サブキーワード(カンマ区切り)")
    parser.add_argument("--persona", required=True, help="想定読者")
    args = parser.parse_args()

    research_notes = read_text(args.slug, "01_research.md")

    print("アウトライン生成中...")
    raw = ask_claude(
        SYSTEM_PROMPT,
        build_prompt(args.title, args.keyword, args.sub_keywords, args.persona, research_notes),
        max_tokens=2000,
    )
    outline = parse_outline(raw)

    meta = {
        "title": args.title,
        "target_keyword": args.keyword,
        "sub_keywords": args.sub_keywords,
        "persona": args.persona,
    }
    write_json(args.slug, "meta.json", meta)
    path = write_json(args.slug, "02_outline.json", outline)

    print(f"完了: {path} ({len(outline)}セクション)")
    print("内容を確認し、03_generate_article.py に進んでください。")


if __name__ == "__main__":
    main()
