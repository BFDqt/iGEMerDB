from __future__ import annotations

import unittest
from unittest.mock import AsyncMock, patch

from igem_scraper.api_client import (
    get_competition_teams,
    get_team_awards,
    get_team_roster,
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
    async def test_roster_accepts_data_envelope(self, get_json: AsyncMock) -> None:
        get_json.return_value = {"data": [{"uuid": "roster-row"}]}
        rows = await get_team_roster(None, None, None, 1)
        self.assertEqual(rows, [{"uuid": "roster-row"}])

    @patch("igem_scraper.api_client._get_json", new_callable=AsyncMock)
    async def test_team_awards_accept_data_envelope(self, get_json: AsyncMock) -> None:
        get_json.return_value = {
            "data": [{"uuid": "gold", "decision": "winner", "type": "medal"}]
        }
        rows = await get_team_awards(None, None, None, 1)
        self.assertEqual(rows[0]["decision"], "winner")


if __name__ == "__main__":
    unittest.main()
