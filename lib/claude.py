"""Claude APIへの共通アクセスラッパー。"""

import anthropic

from lib.config import ANTHROPIC_API_KEY, CLAUDE_MODEL

_client = None


def get_client() -> anthropic.Anthropic:
    global _client
    if _client is None:
        if not ANTHROPIC_API_KEY:
            raise RuntimeError(
                "ANTHROPIC_API_KEY が設定されていません。.env を確認してください。"
            )
        _client = anthropic.Anthropic(api_key=ANTHROPIC_API_KEY)
    return _client


def ask_claude(system: str, user: str, max_tokens: int = 2000) -> str:
    """systemプロンプトとuserプロンプトを渡し、テキスト応答を返す。"""
    response = get_client().messages.create(
        model=CLAUDE_MODEL,
        max_tokens=max_tokens,
        system=system,
        messages=[{"role": "user", "content": user}],
    )
    return "".join(block.text for block in response.content if block.type == "text")
