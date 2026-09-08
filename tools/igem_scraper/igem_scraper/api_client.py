"""
iGEM API client — wraps api.igem.org/v1 with polite rate-limiting & retries.

All methods are async and accept an httpx.AsyncClient + RateLimiter.
"""
from __future__ import annotations

import logging
from typing import Any

import httpx

from .http import FetchResult, HttpSettings, RateLimiter, fetch_text_with_meta
import json

logger = logging.getLogger(__name__)

_API = "https://api.igem.org/v1"
_PAGE_SIZE = 100


async def _get_json_with_meta(
    client: httpx.AsyncClient,
    limiter: RateLimiter,
    settings: HttpSettings,
    path: str,
    params: dict | None = None,
) -> tuple[Any, FetchResult]:
    url = f"{_API}/{path.lstrip('/')}"
    if params:
        from urllib.parse import urlencode
        url += "?" + urlencode(params)
    result = await fetch_text_with_meta(client, limiter, url, settings)
    return json.loads(result.text), result


async def _get_json(
    client: httpx.AsyncClient,
    limiter: RateLimiter,
    settings: HttpSettings,
    path: str,
    params: dict | None = None,
) -> Any:
    data, _ = await _get_json_with_meta(client, limiter, settings, path, params)
    return data


async def get_competitions(
    client: httpx.AsyncClient,
    limiter: RateLimiter,
    settings: HttpSettings,
) -> list[dict]:
    """Return all iGEM competitions, paginating automatically."""
    results = []
    page = 1
    while True:
        data = await _get_json(
            client, limiter, settings, "competitions", {"page": page, "pageSize": _PAGE_SIZE}
        )
        batch = data.get("data", data) if isinstance(data, dict) else data
        if not batch:
            break
        results.extend(batch)
        total = data.get("total") if isinstance(data, dict) else None
        if total is not None and len(results) >= total:
            break
        if len(batch) < _PAGE_SIZE:
            break
        page += 1
    return results


async def get_competition_teams(
    client: httpx.AsyncClient,
    limiter: RateLimiter,
    settings: HttpSettings,
    competition_uuid: str,
) -> list[dict]:
    """Return all teams for a competition, paginating."""
    results = []
    page = 1
    while True:
        data = await _get_json(
            client, limiter, settings,
            f"competitions/{competition_uuid}/teams",
            {"page": page, "pageSize": _PAGE_SIZE},
        )
        batch = data.get("data", data) if isinstance(data, dict) else data
        if not batch:
            break
        results.extend(batch)
        total = data.get("total") if isinstance(data, dict) else None
        if total is not None and len(results) >= total:
            break
        if len(batch) < _PAGE_SIZE:
            break
        page += 1
    return results


async def get_team_detail(
    client: httpx.AsyncClient,
    limiter: RateLimiter,
    settings: HttpSettings,
    team_id: int,
) -> dict:
    return await _get_json(client, limiter, settings, f"teams/{team_id}")


async def get_team_roster(
    client: httpx.AsyncClient,
    limiter: RateLimiter,
    settings: HttpSettings,
    team_id: int,
) -> list[dict]:
    """
    Each entry shape:
    {
      "uuid": "<roster-entry-uuid>",
      "role": "student" | "pi" | "instructor" | "advisor",
      "status": "accepted" | ...,
      "member": {
        "uuid": "<STABLE PERSON UUID>",
        "since": 2025,
        "username": "...",
        "user": {
          "id": 96039,
          "publicName": "Changning Fu",
          "institution": "Jilin University",
          "title": "Student",
          "affiliation": "academia",
          "country": "CHN",
          ...
        }
      }
    }
    """
    result = await _get_json(client, limiter, settings, f"teams/{team_id}/roster")
    if isinstance(result, dict):
        result = result.get("data", [])
    return result if isinstance(result, list) else []


async def get_team_awards(
    client: httpx.AsyncClient,
    limiter: RateLimiter,
    settings: HttpSettings,
    team_id: int,
) -> list[dict]:
    """Return public award decisions for a team, including medals."""
    result = await _get_json(client, limiter, settings, f"teams/{team_id}/awards")
    if isinstance(result, dict):
        result = result.get("data", [])
    return result if isinstance(result, list) else []


async def get_competition_awards(
    client: httpx.AsyncClient,
    limiter: RateLimiter,
    settings: HttpSettings,
    competition_uuid: str,
) -> list[dict]:
    """Award categories for a competition (not per-team results)."""
    result = await _get_json(
        client, limiter, settings,
        f"competitions/{competition_uuid}/awards",
    )
    if isinstance(result, dict):
        result = result.get("data", [])
    return result if isinstance(result, list) else []


# ─── Metadata-aware variants (raw-response archiving) ───────────────────────


async def get_team_roster_with_meta(
    client: httpx.AsyncClient,
    limiter: RateLimiter,
    settings: HttpSettings,
    team_id: int,
) -> tuple[list[dict], FetchResult]:
    result, meta = await _get_json_with_meta(
        client, limiter, settings, f"teams/{team_id}/roster"
    )
    if isinstance(result, dict):
        result = result.get("data", [])
    return (result if isinstance(result, list) else []), meta


async def get_team_awards_with_meta(
    client: httpx.AsyncClient,
    limiter: RateLimiter,
    settings: HttpSettings,
    team_id: int,
) -> tuple[list[dict], FetchResult]:
    result, meta = await _get_json_with_meta(
        client, limiter, settings, f"teams/{team_id}/awards"
    )
    if isinstance(result, dict):
        result = result.get("data", [])
    return (result if isinstance(result, list) else []), meta


async def get_team_detail_with_meta(
    client: httpx.AsyncClient,
    limiter: RateLimiter,
    settings: HttpSettings,
    team_id: int,
) -> tuple[dict, FetchResult]:
    return await _get_json_with_meta(client, limiter, settings, f"teams/{team_id}")


async def get_competition_teams_with_meta(
    client: httpx.AsyncClient,
    limiter: RateLimiter,
    settings: HttpSettings,
    competition_uuid: str,
) -> tuple[list[dict], FetchResult]:
    results: list[dict] = []
    metas: list[FetchResult] = []
    page = 1
    while True:
        data, meta = await _get_json_with_meta(
            client,
            limiter,
            settings,
            f"competitions/{competition_uuid}/teams",
            {"page": page, "pageSize": _PAGE_SIZE},
        )
        metas.append(meta)
        batch = data.get("data", data) if isinstance(data, dict) else data
        if not batch:
            break
        results.extend(batch)
        total = data.get("total") if isinstance(data, dict) else None
        if total is not None and len(results) >= total:
            break
        if len(batch) < _PAGE_SIZE:
            break
        page += 1
    return results, metas[-1] if metas else None


# ─── Convenience class wrapper ───────────────────────────────────────────────

class IgemApiClient:
    """Async context manager that bundles httpx.AsyncClient + RateLimiter.

    Usage::

        async with IgemApiClient(cfg) as client:
            comps = await client.get_competitions()
            teams = await client.get_competition_teams(uuid)
    """

    def __init__(self, cfg) -> None:
        self._settings = HttpSettings(
            user_agent=cfg.user_agent,
            requests_per_second=cfg.requests_per_second,
            timeout_seconds=cfg.timeout_seconds,
            max_retries=cfg.max_retries,
        )
        self._limiter = RateLimiter(cfg.requests_per_second)
        self._client: httpx.AsyncClient | None = None

    async def __aenter__(self) -> "IgemApiClient":
        self._client = httpx.AsyncClient(
            headers={"User-Agent": self._settings.user_agent},
            timeout=self._settings.timeout_seconds,
            follow_redirects=True,
        )
        return self

    async def __aexit__(self, *_) -> None:
        if self._client:
            await self._client.aclose()
            self._client = None

    def _c(self) -> tuple[httpx.AsyncClient, RateLimiter, HttpSettings]:
        assert self._client is not None, "Use inside `async with IgemApiClient(cfg) as c:`"
        return self._client, self._limiter, self._settings

    async def get_competitions(self) -> list[dict]:
        return await get_competitions(*self._c())

    async def get_competition_teams(self, competition_uuid: str) -> list[dict]:
        return await get_competition_teams(*self._c(), competition_uuid)

    async def get_team_detail(self, team_id: int) -> dict:
        return await get_team_detail(*self._c(), team_id)

    async def get_team_roster(self, team_id: int) -> list[dict]:
        return await get_team_roster(*self._c(), team_id)

    async def get_team_awards(self, team_id: int) -> list[dict]:
        return await get_team_awards(*self._c(), team_id)

    async def get_competition_awards(self, competition_uuid: str) -> list[dict]:
        return await get_competition_awards(*self._c(), competition_uuid)

    async def get_team_detail_with_meta(self, team_id: int):
        return await get_team_detail_with_meta(*self._c(), team_id)

    async def get_team_roster_with_meta(self, team_id: int):
        return await get_team_roster_with_meta(*self._c(), team_id)

    async def get_team_awards_with_meta(self, team_id: int):
        return await get_team_awards_with_meta(*self._c(), team_id)
