"""
⑥ 効果測定・改善サイクル

Google Search ConsoleからエクスポートしたCSV(url,impressions,clicks,position)を読み込み、
「掲載順位10位以内なのにCTRが低い記事」を抽出してClaudeに改善案を出させる。

CSVフォーマット(ヘッダー必須):
    url,impressions,clicks,position

使い方:
    python scripts/06_analyze_performance.py --input gsc_export.csv --ctr-threshold 0.02 --position-threshold 10
"""

import argparse
import csv
import datetime
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from lib.claude import ask_claude
from lib.config import REPORTS_DIR

SYSTEM_PROMPT = """あなたはSEO分析のアシスタントです。
与えられたデータの範囲内で分析し、実在しない検索順位や事実を作り出さないでください。"""


def build_prompt(rows: list[dict]) -> str:
    table = "\n".join(
        f"- {r['url']} | 表示回数:{r['impressions']} | クリック数:{r['clicks']} "
        f"| CTR:{r['ctr']:.2%} | 平均掲載順位:{r['position']:.1f}"
        for r in rows
    )
    return f"""以下はGoogle Search Consoleの記事別データです(CTRが低いのに掲載順位が高い記事を抽出済み)。

{table}

これらの記事について、
1. タイトルの改善案(記事URLごとに1〜2案)
2. メタディスクリプションの改善案
3. なぜCTRが低いと考えられるか(推測でよいが、断定はしない)
を出してください。"""


def load_rows(path: str) -> list[dict]:
    with open(path, encoding="utf-8") as f:
        reader = csv.DictReader(f)
        rows = []
        for row in reader:
            impressions = int(row["impressions"])
            clicks = int(row["clicks"])
            rows.append(
                {
                    "url": row["url"],
                    "impressions": impressions,
                    "clicks": clicks,
                    "ctr": (clicks / impressions) if impressions else 0.0,
                    "position": float(row["position"]),
                }
            )
        return rows


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", required=True, help="GSCエクスポートCSVのパス")
    parser.add_argument("--ctr-threshold", type=float, default=0.02, help="このCTR未満を対象とする(デフォルト2%%)")
    parser.add_argument(
        "--position-threshold", type=float, default=10.0, help="この掲載順位以内を対象とする(デフォルト10位)"
    )
    args = parser.parse_args()

    rows = load_rows(args.input)
    targets = [
        r for r in rows if r["ctr"] < args.ctr_threshold and r["position"] <= args.position_threshold
    ]

    if not targets:
        print("改善提案の対象となる記事はありませんでした(条件に合致する記事なし)。")
        return

    print(f"対象記事: {len(targets)}件。改善案を生成中...")
    suggestions = ask_claude(SYSTEM_PROMPT, build_prompt(targets), max_tokens=2000)

    os.makedirs(REPORTS_DIR, exist_ok=True)
    date_str = datetime.date.today().isoformat()
    out_path = os.path.join(REPORTS_DIR, f"{date_str}_improvement.md")
    with open(out_path, "w", encoding="utf-8") as f:
        f.write(f"# 改善提案 ({date_str})\n\n対象: CTR < {args.ctr_threshold:.0%} かつ 掲載順位 <= {args.position_threshold:.0f}位\n\n")
        f.write(suggestions)

    print(f"完了: {out_path}")


if __name__ == "__main__":
    main()
