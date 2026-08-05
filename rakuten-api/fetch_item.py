"""CLI: 楽天市場の商品をキーワード検索し、価格・レビュー件数・在庫状況を出力する。

使い方:
    RAKUTEN_APP_ID=xxx python fetch_item.py "マグネットフック" --hits 3
"""
from __future__ import annotations

import argparse
import json
import sys

from client import RakutenApiError, RakutenClient


def main() -> int:
    parser = argparse.ArgumentParser(description="楽天市場商品検索")
    parser.add_argument("keyword", help="検索キーワード")
    parser.add_argument("--hits", type=int, default=5, help="取得件数 (既定: 5)")
    args = parser.parse_args()

    try:
        client = RakutenClient()
        items = client.search_items(args.keyword, hits=args.hits)
    except (ValueError, RakutenApiError) as exc:
        print(f"エラー: {exc}", file=sys.stderr)
        return 1

    results = [
        {
            "item_name": item.item_name,
            "item_price": item.item_price,
            "item_url": item.item_url,
            "review_count": item.review_count,
            "review_average": item.review_average,
            "in_stock": item.availability == 1,
            "shop_name": item.shop_name,
        }
        for item in items
    ]
    print(json.dumps(results, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
