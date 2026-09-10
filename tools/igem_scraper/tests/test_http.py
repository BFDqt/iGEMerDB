from __future__ import annotations

import time
import unittest
from unittest.mock import patch

import httpx

from igem_scraper.http import HttpSettings, RateLimiter, fetch_bytes, fetch_text


def _settings(max_retries: int = 3) -> HttpSettings:
    return HttpSettings(
        user_agent="iGEMerDb-tests/1.0",
        requests_per_second=1000,
        timeout_seconds=5,
        max_retries=max_retries,
    )


class RateLimiterTests(unittest.IsolatedAsyncioTestCase):
    async def test_wait_enforces_the_configured_minimum_interval(self) -> None:
        limiter = RateLimiter(50)  # 20 ms minimum interval

        await limiter.wait()  # first call is immediate
        started = time.monotonic()
        await limiter.wait()
        elapsed = time.monotonic() - started

        # Wall-clock timing jitters on CI; anything well below the 20 ms
        # interval means the limiter is not sleeping at all.
        self.assertGreaterEqual(elapsed, 0.008)


class FetchTextTests(unittest.IsolatedAsyncioTestCase):
    async def test_returns_body_and_sends_the_configured_user_agent(self) -> None:
        seen: dict[str, str] = {}

        def handler(request: httpx.Request) -> httpx.Response:
            seen["user_agent"] = request.headers.get("user-agent") or ""
            return httpx.Response(200, text="payload")

        async with httpx.AsyncClient(
            transport=httpx.MockTransport(handler)
        ) as client:
            body = await fetch_text(
                client, RateLimiter(1000), "https://example.test/x", _settings()
            )

        self.assertEqual(body, "payload")
        self.assertEqual(seen["user_agent"], "iGEMerDb-tests/1.0")

    async def test_retries_rate_limit_and_server_errors_then_succeeds(self) -> None:
        calls = {"count": 0}

        def handler(request: httpx.Request) -> httpx.Response:
            calls["count"] += 1
            if calls["count"] == 1:
                return httpx.Response(503)
            return httpx.Response(200, text="recovered")

        async def fake_sleep(seconds: float) -> None:
            return None

        async with httpx.AsyncClient(
            transport=httpx.MockTransport(handler)
        ) as client:
            with patch("igem_scraper.http.asyncio.sleep", new=fake_sleep):
                body = await fetch_text(
                    client, RateLimiter(1000), "https://example.test/x", _settings()
                )

        self.assertEqual(body, "recovered")
        self.assertEqual(calls["count"], 2)

    async def test_exhausts_retries_with_exponential_backoff(self) -> None:
        calls = {"count": 0}
        backoff_sleeps: list[float] = []

        def handler(request: httpx.Request) -> httpx.Response:
            calls["count"] += 1
            return httpx.Response(500)

        async def fake_sleep(seconds: float) -> None:
            backoff_sleeps.append(seconds)

        async with httpx.AsyncClient(
            transport=httpx.MockTransport(handler)
        ) as client:
            with patch("igem_scraper.http.asyncio.sleep", new=fake_sleep):
                with self.assertRaises(RuntimeError) as ctx:
                    await fetch_text(
                        client,
                        RateLimiter(1000),
                        "https://example.test/x",
                        _settings(max_retries=3),
                    )

        self.assertEqual(calls["count"], 3)
        self.assertIn("https://example.test/x", str(ctx.exception))
        exponential = [delay for delay in backoff_sleeps if delay >= 0.5]
        self.assertEqual(len(exponential), 3)
        self.assertLess(exponential[0], exponential[1])
        self.assertLess(exponential[1], exponential[2])

    async def test_missing_pages_are_retried_and_then_reported(self) -> None:
        calls = {"count": 0}

        def handler(request: httpx.Request) -> httpx.Response:
            calls["count"] += 1
            return httpx.Response(404)

        async def fake_sleep(seconds: float) -> None:
            return None

        async with httpx.AsyncClient(
            transport=httpx.MockTransport(handler)
        ) as client:
            with patch("igem_scraper.http.asyncio.sleep", new=fake_sleep):
                with self.assertRaises(RuntimeError):
                    await fetch_text(
                        client,
                        RateLimiter(1000),
                        "https://example.test/missing",
                        _settings(max_retries=2),
                    )

        self.assertEqual(calls["count"], 2)


class FetchBytesTests(unittest.IsolatedAsyncioTestCase):
    async def test_returns_binary_content_verbatim(self) -> None:
        def handler(request: httpx.Request) -> httpx.Response:
            return httpx.Response(200, content=b"\x89PNG-bytes")

        async with httpx.AsyncClient(
            transport=httpx.MockTransport(handler)
        ) as client:
            payload = await fetch_bytes(
                client, RateLimiter(1000), "https://example.test/i", _settings()
            )

        self.assertEqual(payload, b"\x89PNG-bytes")


if __name__ == "__main__":
    unittest.main()
