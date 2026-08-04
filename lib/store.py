"""記事ごとの作業ディレクトリ(articles/<slug>/)に対する読み書きヘルパー。"""

import json
import os

from lib.config import ARTICLES_DIR


def article_dir(slug: str) -> str:
    path = os.path.join(ARTICLES_DIR, slug)
    os.makedirs(path, exist_ok=True)
    return path


def write_text(slug: str, filename: str, content: str) -> str:
    path = os.path.join(article_dir(slug), filename)
    with open(path, "w", encoding="utf-8") as f:
        f.write(content)
    return path


def read_text(slug: str, filename: str) -> str:
    path = os.path.join(article_dir(slug), filename)
    with open(path, encoding="utf-8") as f:
        return f.read()


def write_json(slug: str, filename: str, data) -> str:
    path = os.path.join(article_dir(slug), filename)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    return path


def read_json(slug: str, filename: str):
    path = os.path.join(article_dir(slug), filename)
    with open(path, encoding="utf-8") as f:
        return json.load(f)


def exists(slug: str, filename: str) -> bool:
    return os.path.exists(os.path.join(article_dir(slug), filename))
