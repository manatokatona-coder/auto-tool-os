# rakuten-api

楽天市場商品検索API（IchibaItem/Search）を呼び出し、商品の価格・レビュー件数・在庫状況を取得するクライアントです。
`rakuten-room/` の投稿プラン（Day 1・Day 2）で「取得できません」としていた価格・在庫・レビュー件数を、実データで埋めるために使います。

## セットアップ

1. https://webservice.rakuten.co.jp/ にログインし、右上の「＋アプリID発行」からアプリを作成する
2. 発行された `applicationId`（19桁程度の数字）を控える
3. 環境変数を設定する

```bash
export RAKUTEN_APP_ID=<developers.rakuten.co.jp で発行した applicationId>
# 現時点の IchibaItem/Search API は applicationId のみで認証できます。
# 追加の accessKey が案内されている場合のみ設定してください（任意）。
export RAKUTEN_ACCESS_KEY=<accessKey（任意）>
```

4. 依存パッケージをインストール

```bash
pip install -r requirements.txt
```

## 使い方

```bash
python fetch_item.py "マグネットフック" --hits 3
```

商品名・価格・商品URL・レビュー件数・レビュー平均・在庫有無・ショップ名をJSONで出力します。

## 動作確認メモ（2026-08-05）

- エンドポイントは `https://app.rakuten.co.jp/services/api/IchibaItem/Search/20220601` を使用しています。このドメインへの疎通は確認済みで、不正な `applicationId` を渡すと楽天から正規のエラー `{"error":"wrong_parameter","error_description":"specify valid applicationId"}` が返ってきます（ブロックやbot対策による遮断ではありません）。
- `https://openapi.rakuten.co.jp/...` への切り替えは、実際に叩くと汎用的な `{"statusCode":404,"message":"Resource not found"}` が返り、実在するAPIパスとして機能していないことを確認しています。このドメインへの移行案内は確認できませんでした。
- 現在 `RAKUTEN_APP_ID` に設定されている値はUUID形式（例: `7c109ce3-...`）で、楽天公式の applicationId（19桁程度の数字）とは形式が異なります。実データ取得にはRakuten Developersで発行した正式な applicationId への差し替えが必要です。
