"""
③ 本文生成(Claude API)

02_outline.py が作成したアウトラインをもとに、セクションごとに本文を生成する。
1回のAPI呼び出しで全文を作らず、分割生成することで事実誤認を減らし、
レビュー・手直しをしやすくする。

使い方:
    python scripts/03_generate_article.py --slug rakuten-mattress-2026
"""

import argparse
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from lib.claude import ask_claude
from lib.store import read_json, write_text

SYSTEM_PROMPT = """あなたはSEOライターのアシスタントです。以下のルールを厳守してください。
- 効果・効能を保証するような断定表現は使わない(「必ず」「絶対に」等は避ける)
- 著者が実際に体験していない体験談は書かない。書く場合は「一般的には」「レビューでは」などの言い方にする
- 具体的な価格・スペック等の数値は仮の書き方にし、[要確認]と明記する(後で人が裏取りするため)
- 一つのセクションのみを出力し、前後の文脈は繰り返さない
- アフィリエイトリンクを想定する箇所では「(PR)」などの表示を意識した書き方にする"""


def build_prompt(meta: dict, heading: str, notes: str) -> str:
    return f"""記事タイトル: {meta['title']}
狙うキーワード: {meta['target_keyword']}
想定読者: {meta['persona']}

これから書くセクションの見出し: 「{heading}」
このセクションで書くべき要素: {notes}

この見出しの本文のみを、日本語で400〜600字程度で書いてください。見出し自体(##など)は含めず本文だけ出力してください。"""


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--slug", required=True)
    args = parser.parse_args()

    meta = read_json(args.slug, "meta.json")
    outline = read_json(args.slug, "02_outline.json")

    lines = [f"# {meta['title']}\n"]
    for section in outline:
        heading = section["heading"]
        notes = section.get("notes", "")
        print(f"生成中: {heading}")
        body = ask_claude(SYSTEM_PROMPT, build_prompt(meta, heading, notes), max_tokens=1000)
        lines.append(f"## {heading}\n\n{body}\n")

    draft = "\n".join(lines)
    path = write_text(args.slug, "03_draft.md", draft)

    print(f"\n完了: {path}")
    print("必ず人の目で事実確認・表現チェック(景品表示法/ステマ規制/薬機法など)を行ってください。")
    print("次は 04_review_article.py でClaudeにチェックさせるか、直接手直ししてください。")


if __name__ == "__main__":
    main()
