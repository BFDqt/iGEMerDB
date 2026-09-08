from __future__ import annotations

import unittest
from unittest.mock import AsyncMock, patch

import httpx

from igem_scraper.api_client import (
    IgemApiClient,
    get_competition_awards,
    get_competition_teams,
    get_competitions,
    get_team_awards,
    get_team_detail,
    get_team_roster,
)
from igem_scraper.config import ScraperConfig


def _config() -> ScraperConfig:
    return ScraperConfig(
        database_url="sqlite://",
        user_agent="iGEMerDb-tests/1.0",
        requests_per_second=200,
        timeout_seconds=3,
        max_retries=1,
        start_year=2004,
        end_year=2026,
    )


class ApiClientTests(unittest.IsolatedAsyncioTestCase):
    @patch("igem_scraper.api_client._get_json", new_callable=AsyncMock)
    async def test_team_pagination_requests_100_rows(self, get_json: AsyncMock) -> None:
        get_json.side_effect = [
            {"data": [{"id": value} for value in range(100)], "total": 101},
            {"data": [{"id": 100}], "total": 101},
        ]
        rows = await get_competition_teams(None, None, None, "competition-id")
        self.assertEqual(len(rows), 101)
        self.assertEqual(get_json.await_args_list[0].args[-1], {"page": 1, "pageSize": 100})
        self.assertEqual(get_json.await_args_list[1].args[-1], {"page": 2, "pageSize": 100})

    @patch("igem_scraper.api_client._get_json", new_callable=AsyncMock)
    async def test_competition_pagination_uses_total(self, get_json: AsyncMock) -> None:
        get_json.side_effect = [
            {"data": [{"uuid": value} for value in range(100)], "total": 101},
            {"data": [{"uuid": 100}], "total": 101},
        ]
        rows = await get_competitions(None, None, None)
        self.assertEqual(len(rows), 101)
        self.assertIn("competitions", get_json.await_args_list[0].args[-2])

    @patch("igem_scraper.api_client._get_json", new_callable=AsyncMock)
    async def test_roster_accepts_data_envelope(self, get_json: AsyncMock) -> None:
        get_json.return_value = {"data": [{"uuid": "roster-row"}]}
        rows = await get_team_roster(None, None, None, 1)
        self.assertEqual(rows, [{"uuid": "roster-row"}])

    @patch("igem_scraper.api_client._get_json", new_callable=AsyncMock)
    async def test_roster_accepts_bare_lists(self, get_json: AsyncMock) -> None:
        get_json.return_value = [{"uuid": "row"}]
        self.assertEqual(await get_team_roster(None, None, None, 1), [{"uuid": "row"}])

    @patch("igem_scraper.api_client._get_json", new_callable=AsyncMock)
    async def test_roster_envelope_without_data_yields_empty_list(self, get_json: AsyncMock) -> None:
        get_json.return_value = {"meta": {}}
        self.assertEqual(await get_team_roster(None, None, None, 1), [])

    @patch("igem_scraper.api_client._get_json", new_callable=AsyncMock)
    async def test_roster_non_list_payload_yields_empty_list(self, get_json: AsyncMock) -> None:
        get_json.return_value = {"data": "unexpected"}
        self.assertEqual(await get_team_roster(None, None, None, 1), [])

    @patch("igem_scraper.api_client._get_json", new_callable=AsyncMock)
    async def test_team_detail_returns_payload_verbatim(self, get_json: AsyncMock) -> None:
        get_json.return_value = {"id": 5587, "name": "Aachen"}
        detail = await get_team_detail(None, None, None, 5587)
        self.assertEqual(detail, {"id": 5587, "name": "Aachen"})
        self.assertEqual(get_json.await_args.args[-1], "teams/5587")

    @patch("igem_scraper.api_client._get_json", new_callable=AsyncMock)
    async def test_awards_endpoints_accept_data_envelope(self, get_json: AsyncMock) -> None:
        get_json.return_value = {"data": [{"uuid": "gold"}]}
        team_rows = await get_team_awards(None, None, None, 1)
        catalogue = await get_competition_awards(None, None, None, "competition-id")
        self.assertEqual(team_rows[0]["uuid"], "gold")
        self.assertEqual(catalogue, [{"uuid": "gold"}])
        self.assertEqual(
            get_json.await_args_list[-1].args[-1],
            "competitions/competition-id/awards",
        )


class IgemApiClientWrapperTests(unittest.IsolatedAsyncioTestCase):
    @patch("igem_scraper.api_client.get_team_roster", new_callable=AsyncMock)
    async def test_wrapper_bundles_client_limiter_and_settings(self, roster: AsyncMock) -> None:
        roster.return_value = [{"uuid": "row"}]
        async with IgemApiClient(_config()) as client:
            rows = await client.get_team_roster(7)

        self.assertEqual(rows, [{"uuid": "row"}])
        httpx_client, _, settings, team_id = roster.await_args.args
        self.assertEqual(team_id, 7)
        self.assertIsInstance(httpx_client, httpx.AsyncClient)
        self.assertEqual(httpx_client.headers.get("user-agent"), "iGEMerDb-tests/1.0")
        self.assertEqual(settings.max_retries, 1)

    async def test_wrapper_requires_the_context_manager(self) -> None:
        client = IgemApiClient(_config())
        with self.assertRaises(AssertionError):
            await client.get_team_roster(7)


if __name__ == "__main__":
    unittest.main()
