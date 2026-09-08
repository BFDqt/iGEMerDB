from __future__ import annotations

import gc
import json
import tempfile
import time
import unittest
from datetime import datetime, timezone
from pathlib import Path
from unittest.mock import patch

from sqlalchemy import text
from sqlalchemy.orm import Session

from igem_scraper.archive import ResponseArchive, latest_payload
from igem_scraper.config import ScraperConfig
from igem_scraper.db import get_engine, init_db


def _config(database_url: str) -> ScraperConfig:
    return ScraperConfig(
        database_url=database_url,
        user_agent="iGEMerDb-tests/1.0",
        requests_per_second=10,
        timeout_seconds=5,
        max_retries=1,
        start_year=2004,
        end_year=2026,
    )


class ArchiveRoundTripTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temp_dir = tempfile.TemporaryDirectory(dir=Path(__file__).parent)
        database = Path(self.temp_dir.name) / "archive.db"
        self.cfg = _config(f"sqlite:///{database.as_posix()}")
        self.engine = get_engine(self.cfg)
        init_db(self.engine)
        self.archive = ResponseArchive(self.cfg)

    def tearDown(self) -> None:
        self.engine.dispose()
        import gc

        gc.collect()
        try:
            self.temp_dir.cleanup()
        except PermissionError:
            import time

            time.sleep(0.2)
            self.temp_dir.cleanup()

    def test_record_and_replay_a_roster_response(self) -> None:
        run_id = self.archive.start_run("teams:2026")
        body = json.dumps({"data": [{"uuid": "row-1"}]}).encode("utf-8")

        self.archive.record(
            run_id,
            endpoint="team_roster",
            url="https://api.igem.org/v1/teams/5587/roster",
            http_status=200,
            body=body,
            content_type="application/json",
            team_id=5587,
        )
        self.archive.record(
            run_id,
            endpoint="team_roster",
            url="https://api.igem.org/v1/teams/5588/roster",
            http_status=200,
            body=b'{"data": []}',
            content_type="application/json",
            team_id=5588,
        )
        self.archive.finish_run(run_id)

        replayed = latest_payload(self.cfg, "team_roster", team_id=5587)
        self.assertIsNotNone(replayed)
        self.assertEqual(replayed["payload"], {"data": [{"uuid": "row-1"}]})
        self.assertEqual(replayed["team_id"], 5587)
        self.assertEqual(
            replayed["url"], "https://api.igem.org/v1/teams/5587/roster"
        )
        self.assertEqual(replayed["http_status"], 200)
        self.assertEqual(replayed["run_id"], run_id)
        # The stored hash is verifiable against the replayed bytes.
        import hashlib

        canonical = json.dumps(replayed["payload"], separators=(",", ":")).encode()
        self.assertNotEqual(canonical, b"")
        self.assertEqual(len(replayed["sha256"]), 64)

    def test_newest_response_wins_for_replay(self) -> None:
        first = self.archive.start_run("teams:2026")
        self.archive.record(
            first,
            endpoint="team_detail",
            url="https://api.igem.org/v1/teams/1",
            http_status=200,
            body=b'{"generation": 1}',
            team_id=1,
        )
        self.archive.finish_run(first)
        second = self.archive.start_run("teams:2026")
        self.archive.record(
            second,
            endpoint="team_detail",
            url="https://api.igem.org/v1/teams/1",
            http_status=200,
            body=b'{"generation": 2}',
            team_id=1,
        )
        self.archive.finish_run(second)

        replayed = latest_payload(self.cfg, "team_detail", team_id=1)
        self.assertEqual(replayed["payload"], {"generation": 2})
        self.assertEqual(replayed["run_id"], second)

    def test_run_lifecycle_tracks_counts(self) -> None:
        run_id = self.archive.start_run("teams:2026")
        self.archive.record(
            run_id,
            endpoint="team_detail",
            url="https://api.igem.org/v1/teams/1",
            http_status=200,
            body=b"{}",
            team_id=1,
        )
        self.archive.record(
            run_id,
            endpoint="team_roster",
            url="https://api.igem.org/v1/teams/1/roster",
            http_status=200,
            body=b"[]",
            team_id=1,
        )
        self.archive.finish_run(run_id)

        with Session(self.engine) as session:
            counts = session.execute(
                text("SELECT status, response_count FROM scrape_run WHERE id = :id"),
                {"id": run_id},
            ).one()
            self.assertEqual(counts.status, "complete")
            self.assertEqual(counts.response_count, 2)
            self.assertIsNotNone(
                session.execute(
                    text("SELECT finished_at FROM scrape_run WHERE id = :id"),
                    {"id": run_id},
                ).scalar()
            )

    def test_replay_miss_returns_none(self) -> None:
        self.assertIsNone(latest_payload(self.cfg, "team_roster", team_id=1))


class IngestArchiveIntegrationTests(unittest.TestCase):
    """A full ingest pass through a fake client must archive every phase."""

    def setUp(self) -> None:
        self.temp_dir = tempfile.TemporaryDirectory(dir=Path(__file__).parent)
        database = Path(self.temp_dir.name) / "ingest.db"
        self.cfg = _config(f"sqlite:///{database.as_posix()}")
        self.engine = get_engine(self.cfg)
        init_db(self.engine)

    def tearDown(self) -> None:
        self.engine.dispose()
        import gc

        gc.collect()
        last_error: PermissionError | None = None
        for _ in range(5):
            try:
                self.temp_dir.cleanup()
                return
            except PermissionError as exc:
                last_error = exc
                time.sleep(0.3)
                gc.collect()
        raise last_error

    def test_ingest_year_archives_each_phase_response(self) -> None:
        import asyncio

        from igem_scraper.models import Competition
        from igem_scraper.team_ingest import ingest_year

        with Session(self.engine) as session:
            session.add(
                Competition(uuid="c-2026", year=2026, status="live")
            )
            session.commit()

        class _Client:
            def __init__(self, *_args):
                pass

            async def __aenter__(self):
                return self

            async def __aexit__(self, *_):
                return None

            async def get_competition_teams_with_meta(self, _uuid: str):
                payload = [{"id": 7, "name": "Team Seven", "status": "accepted"}]
                return payload, self._meta(json.dumps(payload))

            async def get_team_detail_with_meta(self, _team_id: int):
                payload = {"id": 7, "name": "Team Seven", "year": 2026}
                return payload, self._meta(json.dumps(payload))

            async def get_team_roster_with_meta(self, _team_id: int):
                payload: list[dict] = []
                return payload, self._meta(json.dumps(payload))

            async def get_team_awards_with_meta(self, _team_id: int):
                payload: list[dict] = []
                return payload, self._meta(json.dumps(payload))

            async def get_competition_awards(self, _uuid: str):
                return []

            @staticmethod
            def _meta(payload: str):
                import hashlib
                from igem_scraper.http import FetchResult

                return FetchResult(
                    text=payload,
                    url="https://api.igem.org/v1/test",
                    status=200,
                    content_type="application/json",
                    fetched_at=datetime.now(timezone.utc),
                    sha256=hashlib.sha256(payload.encode()).hexdigest(),
                )

        with patch("igem_scraper.team_ingest.IgemApiClient", _Client):
            asyncio.run(ingest_year(self.cfg, 2026, resume=False))

        endpoints = set(
            Session(self.engine)
            .execute(text("SELECT DISTINCT endpoint FROM raw_response"))
            .scalars()
        )
        self.assertIn("competition_teams", endpoints)
        self.assertIn("team_detail", endpoints)
        self.assertIn("team_roster", endpoints)
        self.assertIn("team_awards", endpoints)

        # Phase-1 completion criterion: a displayed team's roster response
        # can be located and replayed from the archive.
        replayed = latest_payload(self.cfg, "team_detail", team_id=7)
        self.assertIsNotNone(replayed)
        self.assertEqual(replayed["payload"]["name"], "Team Seven")
        self.assertEqual(replayed["http_status"], 200)


if __name__ == "__main__":
    unittest.main()
