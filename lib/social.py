"""Instagram / Threads への投稿(Meta Graph API)。

どちらも「コンテナ作成 → publish」の2段階方式。
- Instagram: 画像必須(image_urlは外部から取得可能な公開URLである必要がある)
- Threads: テキストのみの投稿が可能

事前準備(Meta for Developersでアプリを作成し、該当アカウントと連携):
    INSTAGRAM_USER_ID / INSTAGRAM_ACCESS_TOKEN
    THREADS_USER_ID(省略時は "me") / THREADS_ACCESS_TOKEN
"""

import time

import requests

from lib.config import (
    INSTAGRAM_ACCESS_TOKEN,
    INSTAGRAM_USER_ID,
    THREADS_ACCESS_TOKEN,
    THREADS_USER_ID,
)

GRAPH_BASE = "https://graph.facebook.com/v21.0"
THREADS_BASE = "https://graph.threads.net/v1.0"


def post_to_instagram(caption: str, image_url: str, poll_interval: int = 3, max_polls: int = 20) -> dict:
    """Instagramに画像+キャプションを投稿する(即時公開。下書き機能はAPI上存在しない)。"""
    if not (INSTAGRAM_USER_ID and INSTAGRAM_ACCESS_TOKEN):
        raise RuntimeError(
            "INSTAGRAM_USER_ID / INSTAGRAM_ACCESS_TOKEN が設定されていません。.env を確認してください。"
        )

    create_resp = requests.post(
        f"{GRAPH_BASE}/{INSTAGRAM_USER_ID}/media",
        params={
            "image_url": image_url,
            "caption": caption,
            "access_token": INSTAGRAM_ACCESS_TOKEN,
        },
        timeout=30,
    )
    create_resp.raise_for_status()
    creation_id = create_resp.json()["id"]

    for _ in range(max_polls):
        status_resp = requests.get(
            f"{GRAPH_BASE}/{creation_id}",
            params={"fields": "status_code", "access_token": INSTAGRAM_ACCESS_TOKEN},
            timeout=30,
        )
        status_resp.raise_for_status()
        status_code = status_resp.json().get("status_code")
        if status_code == "FINISHED":
            break
        if status_code == "ERROR":
            raise RuntimeError(f"Instagramのコンテナ作成に失敗しました: {status_resp.json()}")
        time.sleep(poll_interval)
    else:
        raise RuntimeError("Instagramのコンテナ処理がタイムアウトしました。時間をおいて再試行してください。")

    publish_resp = requests.post(
        f"{GRAPH_BASE}/{INSTAGRAM_USER_ID}/media_publish",
        params={"creation_id": creation_id, "access_token": INSTAGRAM_ACCESS_TOKEN},
        timeout=30,
    )
    publish_resp.raise_for_status()
    return publish_resp.json()


def post_to_threads(text: str, wait_before_publish: int = 30) -> dict:
    """Threadsにテキストを投稿する(即時公開。下書き機能はAPI上存在しない)。"""
    if not THREADS_ACCESS_TOKEN:
        raise RuntimeError("THREADS_ACCESS_TOKEN が設定されていません。.env を確認してください。")

    user_id = THREADS_USER_ID or "me"

    create_resp = requests.post(
        f"{THREADS_BASE}/{user_id}/threads",
        params={
            "media_type": "TEXT",
            "text": text,
            "access_token": THREADS_ACCESS_TOKEN,
        },
        timeout=30,
    )
    create_resp.raise_for_status()
    creation_id = create_resp.json()["id"]

    # Threads APIの仕様上、作成後すぐには公開できないため一定時間待つ
    time.sleep(wait_before_publish)

    publish_resp = requests.post(
        f"{THREADS_BASE}/{user_id}/threads_publish",
        params={"creation_id": creation_id, "access_token": THREADS_ACCESS_TOKEN},
        timeout=30,
    )
    publish_resp.raise_for_status()
    return publish_resp.json()
