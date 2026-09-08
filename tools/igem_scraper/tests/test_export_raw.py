from __future__ import annotations

import gc
import json
import tempfile
import time
import unittest
from datetime import datetime, timezone
from pathlib import Path

from sqlalchemy.orm import Session

from igem_scraper.config import ScraperConfig
from igem_scraper.db import get_engine, init_db
from igem_scraper.export_raw import export_frontend_raw
from igem_scraper.models import (
    Award,
    CanonicalTeam,
    Competition,
    Person,
    RosterEntry,
    Team,
    TeamAwardResult,
    TeamCanonicalMap,
    TeamStats,
)


def _config(database_url: str) -> ScraperConfig:
    return ScraperConfig(
        database_url=database_url,
        user_agent="iGEMerDb-tests/1.0",
        requests_per_second=10,
        timeout_seconds=5,
        max_retries=1,
        start_year=2004,
        end_year=2026,
        max_live_age_hours=48,
    )


class ExportRawTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temp_dir = tempfile.TemporaryDirectory(dir=Path(__file__).parent)
        database = Path(self.temp_dir.name) / "export.db"
        self.cfg = _config(f"sqlite:///{database.as_posix()}")
        self.engine = get_engine(self.cfg)
        init_db(self.engine)
        self.out = Path(self.temp_dir.name) / "igem.json"
        self._seed()

    def tearDown(self) -> None:
        # A live SQLite connection can survive until garbage collection on
        # Windows; collect it before removing the temporary directory.
        self.engine.dispose()
        gc.collect()
        try:
            self.temp_dir.cleanup()
        except PermissionError:
            time.sleep(0.2)
            gc.collect()
            self.temp_dir.cleanup()

    def _seed(self) -> None:
        fetched = datetime(2026, 9, 5, 12, 0, 0, tzinfo=timezone.utc)
        with Session(self.engine) as session:
            session.add(
                Competition(
                    uuid="c-2025", year=2025, status="archived", wiki_slug="2025"
                )
            )
            session.add(
                Competition(uuid="c-2026", year=2026, status="live", wiki_slug="2026")
            )
            # Award carries a composite-PK foreign key; flush the referenced
            # competition first so the unit of work does not reorder inserts.
            session.flush()
            common = dict(detail_fetched=True, roster_fetched=True, awards_fetched=True)
            session.add(
                Team(
                    team_id=1,
                    year=2025,
                    competition_uuid="c-2025",
                    name="Aachen",
                    name_norm="aachen",
                    status="accepted",
                    country="DEU",
                    city="Aachen",
                    listed_at=fetched,
                    detail_fetched_at=fetched,
                    roster_fetched_at=fetched,
                    awards_fetched_at=fetched,
                    institutions_json=[
                        {
                            "id": "Uni A",
                            "name": "Uni A",
                            "country": "DEU",
                            "city": "Aachen",
                        }
                    ],
                    **common,
                )
            )
            session.add(
                Team(
                    team_id=2,
                    year=2025,
                    competition_uuid="c-2025",
                    name="Left Team",
                    name_norm="left team",
                    status="withdrawn",
                    listed_at=fetched,
                    detail_fetched_at=fetched,
                    roster_fetched_at=fetched,
                    awards_fetched_at=fetched,
                    **common,
                )
            )
            session.add(
                Team(
                    team_id=3,
                    year=2026,
                    competition_uuid="c-2026",
                    name="Unlisted Team",
                    name_norm="unlisted team",
                    status="accepted",
                    is_listed=False,
                )
            )
            session.add(
                Team(
                    team_id=4,
                    year=2025,
                    competition_uuid="c-2025",
                    name="Registry Example",
                    name_norm="registry example",
                    status="accepted",
                    listed_at=fetched,
                    detail_fetched_at=fetched,
                    roster_fetched_at=fetched,
                    awards_fetched_at=fetched,
                    **common,
                )
            )
            # The unit of work does not order cross-table inserts inside one
            # flush for this schema; flush between dependency groups.
            session.flush()
            session.add(
                CanonicalTeam(canonical_id=77, name_norm="aachen", display_name="Aachen")
            )
            session.add(TeamCanonicalMap(team_id=1, canonical_id=77))
            session.add(TeamStats(team_id=1, all_member_count=1, student_member_count=1))
            session.flush()
            session.add(
                Person(
                    member_uuid="person-active",
                    public_name="Active Person",
                    public_name_norm="active person",
                    institution="Uni A",
                )
            )
            session.add(
                Person(
                    member_uuid="person-unlisted",
                    public_name="Unlisted Person",
                    public_name_norm="unlisted person",
                )
            )
            session.flush()
            session.add(
                RosterEntry(
                    team_id=1,
                    year=2025,
                    member_uuid="person-active",
                    role_api="student",
                    role_inferred="Student",
                    is_student=True,
                )
            )
            session.add(
                RosterEntry(
                    team_id=3,
                    year=2026,
                    member_uuid="person-unlisted",
                    role_api="student",
                    role_inferred="Student",
                    is_student=True,
                )
            )
            session.add(
                Award(
                    uuid="gold-2025",
                    competition_uuid="c-2025",
                    title="Gold",
                    award_type="medal",
                    award_subtype="gold",
                )
            )
            session.add(
                TeamAwardResult(
                    team_id=1,
                    award_uuid="gold-2025",
                    title="Gold",
                    decision="winner",
                    award_type="medal",
                    award_subtype="gold",
                )
            )
            session.commit()

    def _export(self) -> dict:
        export_frontend_raw(self.cfg, self.out)
        return json.loads(self.out.read_text(encoding="utf-8"))

    def test_exports_listed_teams_with_categories_and_visibility(self) -> None:
        payload = self._export()
        teams = {team["id"]: team for team in payload["teams"]}

        self.assertEqual(set(teams), {1, 2, 4})
        self.assertTrue(teams[1]["default_visible"])
        self.assertEqual(teams[1]["export_category"], "accepted")
        self.assertEqual(teams[1]["canonical_id"], 77)
        self.assertFalse(teams[2]["default_visible"])
        self.assertEqual(teams[2]["export_category"], "withdrawn")
        self.assertFalse(teams[4]["default_visible"])
        self.assertEqual(teams[4]["export_category"], "demo-test")
        self.assertEqual(teams[1]["all_member_count"], 1)

    def test_prunes_members_roster_and_results_of_unlisted_teams(self) -> None:
        payload = self._export()

        self.assertEqual(
            [member["uuid"] for member in payload["members"]], ["person-active"]
        )
        self.assertEqual(
            [row["team_id"] for row in payload["roster"]], [1]
        )
        self.assertEqual(
            [row["team_id"] for row in payload["team_awards"]], [1]
        )
        self.assertEqual(
            [award["uuid"] for award in payload["awards"]], ["gold-2025"]
        )

    def test_collects_institutions_from_listed_teams_only(self) -> None:
        payload = self._export()
        self.assertEqual(
            payload["institutions"],
            [{"id": "Uni A", "name": "Uni A", "country": "DEU", "city": "Aachen"}],
        )

    def test_meta_records_schema_provenance_freshness_and_coverage(self) -> None:
        payload = self._export()
        meta = payload["meta"]

        self.assertEqual(meta["schema_version"], 3)
        self.assertEqual(meta["provenance"]["role_rule_version"], 2)
        self.assertEqual(meta["freshness"]["live_years"], [2026])
        self.assertEqual(meta["freshness"]["max_live_age_hours"], 48)
        coverage = {row["year"]: row for row in meta["coverage"]}
        self.assertEqual(coverage[2025]["team_count"], 3)
        self.assertEqual(coverage[2025]["teams_with_public_roster"], 1)
        self.assertEqual(coverage[2025]["teams_with_awards"], 1)
        self.assertEqual(coverage[2025]["default_visible_count"], 1)
        self.assertEqual(coverage[2026]["team_count"], 0)
        self.assertEqual(coverage[2026]["status"], "live")
        competitions = {row["year"]: row for row in payload["competitions"]}
        self.assertEqual(competitions[2025]["status"], "archived")

    def test_writes_atomically_without_leaving_temporary_files(self) -> None:
        self._export()

        self.assertTrue(self.out.exists())
        leftovers = [
            path
            for path in self.out.parent.iterdir()
            if path.name.startswith(f".{self.out.name}.")
        ]
        self.assertEqual(leftovers, [])


if __name__ == "__main__":
    unittest.main()
