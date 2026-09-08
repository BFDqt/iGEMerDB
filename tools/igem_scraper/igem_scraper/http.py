from __future__ import annotations

import asyncio
import hashlib
import logging
import random
import time
from dataclasses import dataclass
from datetime import datetime, timezone

import httpx

logger = logging.getLogger(__name__)


@dataclass
class HttpSettings:
    user_agent: str
    requests_per_second: float
    timeout_seconds: float
    max_retries: int


@dataclass
class FetchResult:
    text: str
    url: str
    status: int
    content_type: str | None
    fetched_at: datetime
    sha256: str


class RateLimiter:
    def __init__(self, requests_per_second: float):
        self._min_interval = 1.0 / max(0.1, requests_per_second)
        self._lock = asyncio.Lock()
        self._last = 0.0

    async def wait(self) -> None:
        async with self._lock:
            now = time.monotonic()
            sleep_for = self._min_interval - (now - self._last)
            if sleep_for > 0:
                await asyncio.sleep(sleep_for)
            self._last = time.monotonic()


async def fetch_text_with_meta(
    client: httpx.AsyncClient,
    limiter: RateLimiter,
    url: str,
    settings: HttpSettings,
) -> FetchResult:
    headers = {"User-Agent": settings.user_agent}
    last_err: Exception | None = None

    for attempt in range(settings.max_retries):
        try:
            await limiter.wait()
            r = await client.get(url, headers=headers, timeout=settings.timeout_seconds)
            if r.status_code in (429, 500, 502, 503, 504):
                raise httpx.HTTPStatusError(
                    f"HTTP {r.status_code}", request=r.request, response=r
                )
            r.raise_for_status()
            body = r.text
            return FetchResult(
                text=body,
                url=str(r.request.url),
                status=r.status_code,
                content_type=r.headers.get("content-type"),
                fetched_at=datetime.now(timezone.utc),
                sha256=hashlib.sha256(body.encode("utf-8")).hexdigest(),
            )
        except Exception as e:  # noqa: BLE001
            last_err = e
            backoff = (2**attempt) + random.random()
            logger.warning("Fetch failed (%s) url=%s attempt=%d backoff=%.2fs", type(e).__name__, url, attempt + 1, backoff)
            await asyncio.sleep(backoff)

    raise RuntimeError(f"Failed to fetch {url}: {last_err}")


async def fetch_text(
    client: httpx.AsyncClient,
    limiter: RateLimiter,
    url: str,
    settings: HttpSettings,
) -> str:
    return (await fetch_text_with_meta(client, limiter, url, settings)).text


async def fetch_bytes(
    client: httpx.AsyncClient,
    limiter: RateLimiter,
    url: str,
    settings: HttpSettings,
) -> bytes:
    headers = {"User-Agent": settings.user_agent}
    last_err: Exception | None = None

    for attempt in range(settings.max_retries):
        try:
            await limiter.wait()
            r = await client.get(url, headers=headers, timeout=settings.timeout_seconds)
            if r.status_code in (429, 500, 502, 503, 504):
                raise httpx.HTTPStatusError(
                    f"HTTP {r.status_code}", request=r.request, response=r
                )
            r.raise_for_status()
            return r.content
        except Exception as e:  # noqa: BLE001
            last_err = e
            backoff = (2**attempt) + random.random()
            logger.warning("Fetch failed (%s) url=%s attempt=%d backoff=%.2fs", type(e).__name__, url, attempt + 1, backoff)
            await asyncio.sleep(backoff)

    raise RuntimeError(f"Failed to fetch {url}: {last_err}")
