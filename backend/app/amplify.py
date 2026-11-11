import requests
import logging

from .config import settings


API_BASE = "https://prod-api.vanderbilt.ai"
logger = logging.getLogger("hiremind.amplify")


def _headers():
    return {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {settings.amplify_api_key}",
    }


def chat(messages: list[dict], prompt: str, max_tokens: int = 1800) -> str:
    """Call Amplify using the same request contract as the provided reference app."""
    options = {
        "ragOnly": False,
        "skipRag": True,
        "model": {"id": settings.amplify_model_id},
        "prompt": prompt,
    }
    if settings.amplify_assistant_id:
        options["assistantId"] = settings.amplify_assistant_id
    payload = {
        "data": {
            "temperature": 0.45,
            "max_tokens": max_tokens,
            # The Amplify chat contract expects dataSources even when this request is not RAG-backed.
            "dataSources": [],
            "messages": messages,
            "options": options,
        }
    }
    try:
        response = requests.post(f"{API_BASE}/chat", headers=_headers(), json=payload, timeout=120)
    except requests.RequestException:
        logger.exception("Amplify request could not reach the API")
        raise
    if response.status_code >= 400:
        logger.error("Amplify returned HTTP %s: %s", response.status_code, response.text[:1000])
        response.raise_for_status()
    response_json = response.json()
    data = response_json.get("data", "")
    if not data:
        logger.error(
            "Amplify returned HTTP 200 with empty data; response keys=%s body=%s",
            list(response_json.keys()),
            response.text[:1500],
        )
        raise RuntimeError("Amplify returned an empty response")
    return data

