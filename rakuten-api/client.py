"""楽天市場商品検索API（IchibaItem/Search）のクライアント。

環境変数から認証情報を読み込む:
- RAKUTEN_APP_ID (必須) : Rakuten Developers で発行された applicationId
- RAKUTEN_ACCESS_KEY (任意): 追加の認証キーが必要な場合に使用

エンドポイントは https://app.rakuten.co.jp/services/api/IchibaItem/Search/20220601
を使用する。https://webservice.rakuten.co.jp/app/create で発行した applicationId が必要。
"""
from __future__ import annotations

import os
from dataclasses import dataclass

import requests

ENDPOINT = "https://app.rakuten.co.jp/services/api/IchibaItem/Search/20220601"


class RakutenApiError(RuntimeError):
    def __init__(self, error: str, error_description: str, status_code: int):
        self.error = error
        self.error_description = error_description
        self.status_code = status_code
        super().__init__(f"[{status_code}] {error}: {error_description}")


@dataclass
class RakutenItem:
    item_name: str
    item_price: int
    item_url: str
    review_count: int
    review_average: float
    availability: int
    shop_name: str

    @classmethod
    def from_api(cls, raw: dict) -> "RakutenItem":
        return cls(
            item_name=raw["itemName"],
            item_price=raw["itemPrice"],
            item_url=raw["itemUrl"],
            review_count=raw["reviewCount"],
            review_average=raw["reviewAverage"],
            availability=raw["availability"],
            shop_name=raw["shopName"],
        )


class RakutenClient:
    def __init__(self, app_id: str | None = None, access_key: str | None = None):
        self.app_id = app_id or os.environ.get("RAKUTEN_APP_ID")
        self.access_key = access_key or os.environ.get("RAKUTEN_ACCESS_KEY")
        if not self.app_id:
            raise ValueError(
                "RAKUTEN_APP_ID が設定されていません。"
                "https://webservice.rakuten.co.jp/app/create で発行した applicationId を設定してください。"
            )

    def search_items(self, keyword: str, hits: int = 5, **extra_params) -> list[RakutenItem]:
        params = {
            "applicationId": self.app_id,
            "keyword": keyword,
            "hits": hits,
            "format": "json",
            **extra_params,
        }
        if self.access_key:
            params["accessKey"] = self.access_key

        response = requests.get(ENDPOINT, params=params, timeout=10)
        body = response.json()

        if response.status_code != 200:
            raise RakutenApiError(
                error=body.get("error", "unknown_error"),
                error_description=body.get("error_description", response.text),
                status_code=response.status_code,
            )

        return [RakutenItem.from_api(item["Item"]) for item in body.get("Items", [])]
