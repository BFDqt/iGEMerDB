from __future__ import annotations

import asyncio
import tempfile
import unittest
from pathlib import Path
from unittest.mock import AsyncMock, patch

from sqlalchemy import select
from sqlalchemy.orm import Session

from igem_scraper.config import ScraperConfig
from igem_scraper.db import get_engine, init_db
from igem_scraper.models import (
    Competition,
    Person,
    RosterEntry,
    Team,
    TeamAwardResult,
)
from igem_scraper.team_ingest import (
    fetch_team_award_results,
    fetch_team_details,
    fetch_team_rosters,
    ingest_year,
)


def _config(database_url: str) -> ScraperConfig:
    return ScraperConfig(
        database_url=database_url,
        user_agent="iGEMerDb-tests/1.0",
        requests_per_second=100,
        timeout_seconds=5,
        max_retries=1,
        start_year=2004,
        end_year=2026,
        max_live_age_hours=48,
    )


def _member(uuid: str, *, title: str = "Student") -> dict:
    return {
        "status": "accepted",
        "role": "student",
        "member": {
            "uuid": uuid,
            "username": uuid,
            "since": 2026,
            "user": {
                "publicName": uuid.title(),
                "title": title,
                "institution": "Example University",
                "country": "GBR",
            },
        },
    }


class _FakeClient:
    def __init__(
        self,
        *,
        roster: list[dict] | None = None,
        awards: list[dict] | None = None,
        detail: dict | None = None,
    ) -> None:
        self.roster = roster or []
        self.awards = awards or []
        self.detail = detail or {}

    async def __aenter__(self):
        return self

    async def __aexit__(self, *_):
        return None

    async def get_team_roster(self, _team_id: int) -> list[dict]:
        return self.roster

    async def get_team_awards(self, _team_id: int) -> list[dict]:
        return self.awards

    async def get_team_detail(self, _team_id: int) -> dict:
        return self.detail


class _FailingRosterClient(_FakeClient):
    async def get_team_roster(self, _team_id: int) -> list[dict]:
        raise RuntimeError("upstream unavailable")


class RefreshSemanticsTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temp_dir = tempfile.TemporaryDirectory(dir=Path(__file__).parent)
        database = Path(self.temp_dir.name) / "refresh.db"
        self.cfg = _config(f"sqlite:///{database.as_posix()}")
        self.engine = get_engine(self.cfg)
        init_db(self.engine)
        with Session(self.engine) as session:
            session.add(
                Competition(uuid="competition-2026", year=2026, status="live")
            )
            session.add(
                Team(
                    team_id=1,
                    year=2026,
                    competition_uuid="competition-2026",
                    name="Example",
                    name_norm="example",
                    status="accepted",
                )
            )
            session.commit()

    def tearDown(self) -> None:
        self.engine.dispose()
        self.temp_dir.cleanup()

    def test_roster_v2_removes_member_missing_upstream(self) -> None:
        with patch(
            "igem_scraper.team_ingest.IgemApiClient",
            return_value=_FakeClient(roster=[_member("alice"), _member("bob")]),
        ):
            asyncio.run(
                fetch_team_rosters(self.cfg, [1], 2026, resume=False, concurrency=1)
            )

        with patch(
            "igem_scraper.team_ingest.IgemApiClient",
            return_value=_FakeClient(roster=[_member("alice")]),
        ):
            asyncio.run(
                fetch_team_rosters(self.cfg, [1], 2026, resume=False, concurrency=1)
            )

        with Session(self.engine) as session:
            rows = list(session.scalars(select(RosterEntry)).all())
            self.assertEqual([row.member_uuid for row in rows], ["alice"])
            self.assertEqual(rows[0].role_inferred, "Student")
            self.assertTrue(rows[0].is_student)
            bob = session.get(Person, "bob")
            self.assertIsNotNone(bob)
            self.assertIsNone(bob.first_seen_year)
            team = session.get(Team, 1)
            self.assertIsNotNone(team.roster_fetched_at)

    def test_failed_roster_refresh_preserves_last_successful_set(self) -> None:
        with patch(
            "igem_scraper.team_ingest.IgemApiClient",
            return_value=_FakeClient(roster=[_member("alice")]),
        ):
            asyncio.run(
                fetch_team_rosters(self.cfg, [1], 2026, resume=False, concurrency=1)
            )

        with patch(
            "igem_scraper.team_ingest.IgemApiClient",
            return_value=_FailingRosterClient(),
        ):
            asyncio.run(
                fetch_team_rosters(self.cfg, [1], 2026, resume=False, concurrency=1)
            )

        with Session(self.engine) as session:
            member_ids = list(session.scalars(select(RosterEntry.member_uuid)).all())
            self.assertEqual(member_ids, ["alice"])
            team = session.get(Team, 1)
            self.assertIn("upstream unavailable", team.roster_fetch_error)
            self.assertIn("roster: upstream unavailable", team.fetch_error)

    def test_awards_v2_removes_result_missing_upstream(self) -> None:
        v1 = [
            {"uuid": "gold", "title": "Gold", "type": "medal", "decision": "winner"},
            {"uuid": "special", "title": "Special", "decision": "winner"},
        ]
        with patch(
            "igem_scraper.team_ingest.IgemApiClient",
            return_value=_FakeClient(awards=v1),
        ):
            asyncio.run(
                fetch_team_award_results(self.cfg, [1], resume=False, concurrency=1)
            )

        with patch(
            "igem_scraper.team_ingest.IgemApiClient",
            return_value=_FakeClient(
                awards=[
                    {
                        "uuid": "gold",
                        "title": "Gold medal",
                        "type": "medal",
                        "decision": "winner",
                    }
                ]
            ),
        ):
            asyncio.run(
                fetch_team_award_results(self.cfg, [1], resume=False, concurrency=1)
            )

        with Session(self.engine) as session:
            rows = list(session.scalars(select(TeamAwardResult)).all())
            self.assertEqual([(row.award_uuid, row.title) for row in rows], [("gold", "Gold medal")])
            team = session.get(Team, 1)
            self.assertEqual(team.medal, "Gold medal")
            self.assertIsNotNone(team.awards_fetched_at)

    def test_detail_v2_clears_removed_institutions(self) -> None:
        with patch(
            "igem_scraper.team_ingest.IgemApiClient",
            return_value=_FakeClient(
                detail={
                    "year": 2026,
                    "name": "Example",
                    "status": "accepted",
                    "institutions": [{"name": "Example University"}],
                }
            ),
        ):
            asyncio.run(fetch_team_details(self.cfg, [1], resume=False, concurrency=1))

        with patch(
            "igem_scraper.team_ingest.IgemApiClient",
            return_value=_FakeClient(
                detail={
                    "year": 2026,
                    "name": "Example",
                    "status": "accepted",
                    "institutions": [],
                }
            ),
        ):
            asyncio.run(fetch_team_details(self.cfg, [1], resume=False, concurrency=1))

        with Session(self.engine) as session:
            team = session.get(Team, 1)
            self.assertEqual(team.institutions_json, [])
            self.assertIsNotNone(team.detail_fetched_at)

    def test_live_year_disables_phase_resume(self) -> None:
        with (
            patch(
                "igem_scraper.team_ingest.fetch_competition_teams",
                new=AsyncMock(return_value=[1]),
            ),
            patch(
                "igem_scraper.team_ingest.fetch_competition_awards",
                new=AsyncMock(),
            ),
            patch(
                "igem_scraper.team_ingest.fetch_team_details",
                new=AsyncMock(),
            ) as details,
            patch(
                "igem_scraper.team_ingest.fetch_team_rosters",
                new=AsyncMock(),
            ) as rosters,
            patch(
                "igem_scraper.team_ingest.fetch_team_award_results",
                new=AsyncMock(),
            ) as awards,
            patch("igem_scraper.team_ingest.compute_stats"),
        ):
            asyncio.run(ingest_year(self.cfg, 2026, resume=True, concurrency=1))

        self.assertFalse(details.await_args.kwargs["resume"])
        self.assertFalse(rosters.await_args.kwargs["resume"])
        self.assertFalse(awards.await_args.kwargs["resume"])


if __name__ == "__main__":
    unittest.main()
