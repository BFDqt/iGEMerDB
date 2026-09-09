from __future__ import annotations

import tempfile
import unittest
from datetime import datetime, timedelta, timezone
from pathlib import Path
import json

from sqlalchemy.orm import Session

from igem_scraper.config import ScraperConfig
from igem_scraper.db import get_engine, init_db
from igem_scraper.models import Competition, Team, TeamStats
from igem_scraper.validate import validate_database, validate_export


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


class ValidationTests(unittest.TestCase):
    def setUp(self) -> None:
        # The project may live on a different drive than the OS temp folder.
        # Keeping transient DBs beside the test avoids failures when C: is full.
        self.temp_dir = tempfile.TemporaryDirectory(dir=Path(__file__).parent)
        database = Path(self.temp_dir.name) / "validation.db"
        self.cfg = _config(f"sqlite:///{database.as_posix()}")
        self.engine = get_engine(self.cfg)
        init_db(self.engine)

    def tearDown(self) -> None:
        self.engine.dispose()
        self.temp_dir.cleanup()

    def _seed(self, *, complete: bool) -> None:
        fetched_at = datetime.now(timezone.utc)
        with Session(self.engine) as session:
            session.add(
                Competition(
                    uuid="00000000-0000-0000-0000-000000002025",
                    year=2025,
                    status="archived",
                )
            )
            session.add(
                Team(
                    team_id=1,
                    year=2025,
                    competition_uuid="00000000-0000-0000-0000-000000002025",
                    name="Example",
                    name_norm="example",
                    status="accepted",
                    detail_fetched=complete,
                    roster_fetched=complete,
                    awards_fetched=complete,
                    listed_at=fetched_at,
                    detail_fetched_at=fetched_at if complete else None,
                    roster_fetched_at=fetched_at if complete else None,
                    awards_fetched_at=fetched_at if complete else None,
                )
            )
            if complete:
                session.add(TeamStats(team_id=1))
            session.commit()

    def test_complete_database_passes(self) -> None:
        self._seed(complete=True)
        report = validate_database(self.cfg)
        self.assertTrue(report.ok)
        self.assertEqual(report.team_count, 1)

    def test_partial_database_reports_each_missing_phase(self) -> None:
        self._seed(complete=False)
        report = validate_database(self.cfg)
        self.assertFalse(report.ok)
        self.assertIn("2025: 1 teams missing detail_fetched", report.issues)
        self.assertIn("2025: 1 teams missing roster_fetched", report.issues)
        self.assertIn("2025: 1 teams missing awards_fetched", report.issues)
        self.assertIn("1 teams missing computed stats", report.issues)

    def test_export_validation_checks_references_and_coverage(self) -> None:
        fetched_at = datetime.now(timezone.utc).isoformat()
        payload = {
            "meta": {
                "schema_version": 3,
                "generated_at": fetched_at,
                "source": "https://api.igem.org/v1",
                "freshness": {"max_live_age_hours": 48},
                "provenance": {
                    "endpoint_templates": {
                        "team_detail": "detail",
                        "team_roster": "roster",
                        "team_awards": "awards",
                    },
                    "role_rule_version": 2,
                },
                "export_policy": {
                    "version": 1,
                    "default_visible_categories": ["accepted"],
                    "demo_test_name_allowlist": [
                        "example",
                        "registry example",
                        "testdaily-i-beijing",
                    ],
                },
                "coverage": [
                    {
                        "year": 2025,
                        "team_count": 1,
                        "detail_fetched_count": 1,
                        "roster_fetched_count": 1,
                        "awards_fetched_count": 1,
                        "fetch_error_count": 0,
                        "status_counts": {"accepted": 1},
                        "export_category_counts": {"accepted": 1},
                        "default_visible_count": 1,
                    }
                ],
            },
            "competitions": [
                {"uuid": "competition", "year": 2025, "status": "archived"}
            ],
            "teams": [
                {
                    "id": 1,
                    "year": 2025,
                    "competition_uuid": "competition",
                    "status": "accepted",
                    "name": "Real-Team",
                    "export_category": "accepted",
                    "default_visible": True,
                    "listed_at": fetched_at,
                    "detail_fetched": True,
                    "roster_fetched": True,
                    "awards_fetched": True,
                    "detail_fetched_at": fetched_at,
                    "roster_fetched_at": fetched_at,
                    "awards_fetched_at": fetched_at,
                    "fetch_error": None,
                }
            ],
            "members": [{"uuid": "person"}],
            "roster": [
                {
                    "team_id": 1,
                    "member_uuid": "person",
                    "role_api": "student",
                    "role_inferred": "Student",
                    "is_student": True,
                    "snapshot_title": "Student",
                }
            ],
            "awards": [{"competition_uuid": "competition", "uuid": "gold"}],
            "team_awards": [{"team_id": 1, "award_uuid": "gold"}],
        }
        path = Path(self.temp_dir.name) / "export.json"
        path.write_text(json.dumps(payload), encoding="utf-8")
        self.assertEqual(validate_export(path), ())

        payload["roster"].append({"team_id": 404, "member_uuid": "missing"})
        path.write_text(json.dumps(payload), encoding="utf-8")
        self.assertIn("1 orphan roster rows in export", validate_export(path))

    def test_export_validation_checks_award_and_competition_links(self) -> None:
        fetched_at = datetime.now(timezone.utc).isoformat()
        payload = {
            "meta": {
                "schema_version": 3,
                "generated_at": fetched_at,
                "source": "https://api.igem.org/v1",
                "freshness": {"max_live_age_hours": 48},
                "provenance": {
                    "endpoint_templates": {
                        "team_detail": "detail",
                        "team_roster": "roster",
                        "team_awards": "awards",
                    },
                    "role_rule_version": 2,
                },
                "export_policy": {
                    "version": 1,
                    "default_visible_categories": ["accepted"],
                    "demo_test_name_allowlist": [
                        "example",
                        "registry example",
                        "testdaily-i-beijing",
                    ],
                },
                "coverage": [
                    {
                        "year": 2025,
                        "team_count": 1,
                        "detail_fetched_count": 1,
                        "roster_fetched_count": 1,
                        "awards_fetched_count": 1,
                        "fetch_error_count": 0,
                        "status_counts": {"accepted": 1},
                        "export_category_counts": {"accepted": 1},
                        "default_visible_count": 1,
                    }
                ],
            },
            "competitions": [
                {"uuid": "competition", "year": 2025, "status": "archived"}
            ],
            "teams": [
                {
                    "id": 1,
                    "year": 2025,
                    "competition_uuid": "missing-competition",
                    "status": "accepted",
                    "name": "Real-Team",
                    "export_category": "accepted",
                    "default_visible": True,
                    "listed_at": fetched_at,
                    "detail_fetched": True,
                    "roster_fetched": True,
                    "awards_fetched": True,
                    "detail_fetched_at": fetched_at,
                    "roster_fetched_at": fetched_at,
                    "awards_fetched_at": fetched_at,
                }
            ],
            "members": [{"uuid": "person"}],
            "roster": [
                {
                    "team_id": 1,
                    "member_uuid": "person",
                    "role_api": "student",
                    "role_inferred": "Student",
                    "is_student": True,
                    "snapshot_title": "Student",
                }
            ],
            "awards": [{"competition_uuid": "competition", "uuid": "gold"}],
            "team_awards": [{"team_id": 1, "award_uuid": "missing-award"}],
        }
        path = Path(self.temp_dir.name) / "broken-export.json"
        path.write_text(json.dumps(payload), encoding="utf-8")

        issues = validate_export(path)
        self.assertIn("1 teams reference missing competitions", issues)
        self.assertIn("1 team-award rows reference missing definitions", issues)

    def test_live_database_rejects_stale_phase_timestamps(self) -> None:
        stale = datetime.now(timezone.utc) - timedelta(hours=49)
        with Session(self.engine) as session:
            session.add(
                Competition(
                    uuid="live-competition",
                    year=2026,
                    status="live",
                    fetched_at=stale,
                )
            )
            session.add(
                Team(
                    team_id=2026,
                    year=2026,
                    competition_uuid="live-competition",
                    name="Live",
                    name_norm="live",
                    status="accepted",
                    detail_fetched=True,
                    roster_fetched=True,
                    awards_fetched=True,
                    listed_at=stale,
                    detail_fetched_at=stale,
                    roster_fetched_at=stale,
                    awards_fetched_at=stale,
                )
            )
            session.add(TeamStats(team_id=2026))
            session.commit()

        report = validate_database(self.cfg)
        self.assertFalse(report.ok)
        self.assertIn("2026: competition listing is stale", report.issues)
        self.assertIn("2026: 1 teams have stale roster_fetched_at", report.issues)


if __name__ == "__main__":
    unittest.main()


class ExportIntegrityExtraTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temp_dir = tempfile.TemporaryDirectory(dir=Path(__file__).parent)

    def tearDown(self) -> None:
        import gc as _gc

        self.temp_dir.cleanup()
        _gc.collect()

    def test_export_validation_flags_duplicate_keys_and_stale_counts(self) -> None:
        base = {
            "meta": {"schema_version": 3, "generated_at": "", "source": "", "coverage": []},
            "competitions": [{"uuid": "c-2025", "year": 2025, "status": "archived"}],
            "institutions": [],
            "teams": [
                {
                    "id": 1,
                    "name": "A",
                    "year": 2025,
                    "competition_uuid": "c-2025",
                    "status": "accepted",
                    "export_category": "accepted",
                    "default_visible": True,
                    "all_member_count": 2,
                }
            ],
            "members": [
                {"uuid": "m1", "name": "One"},
                {"uuid": "m2", "name": "Two"},
            ],
            "roster": [
                {
                    "team_id": 1,
                    "member_uuid": "m1",
                    "year": 2025,
                    "role_api": "student",
                    "role_inferred": "Student",
                    "is_student": True,
                },
                # duplicate (team, member, role) key
                {
                    "team_id": 1,
                    "member_uuid": "m1",
                    "year": 2025,
                    "role_api": "student",
                    "role_inferred": "Student",
                    "is_student": True,
                },
                # wrong year for the team
                {
                    "team_id": 1,
                    "member_uuid": "m2",
                    "year": 2024,
                    "role_api": "student",
                    "role_inferred": "Student",
                    "is_student": True,
                },
            ],
            "awards": [],
            "team_awards": [
                {
                    "team_id": 1,
                    "award_uuid": "a1",
                    "title": "X",
                    "decision": "winner",
                },
                {
                    "team_id": 1,
                    "award_uuid": "a1",
                    "title": "X",
                    "decision": "winner",
                },
            ],
        }
        path = Path(self.temp_dir.name) / "dup.json"
        path.write_text(json.dumps(base), encoding="utf-8")
        issues = validate_export(path)
        joined = "\n".join(issues)
        self.assertIn("duplicate roster keys in export", joined)
        self.assertIn("duplicate team-award keys in export", joined)
        self.assertIn("roster rows reference a different year", joined)
        # roster has 2 rows but all_member_count says 2 → no stale-count issue;
        # remove one roster row to make the counts disagree
        base["roster"] = base["roster"][:1]
        path.write_text(json.dumps(base), encoding="utf-8")
        issues = validate_export(path)
        self.assertTrue(
            any("stale vs roster rows" in issue for issue in issues), issues
        )
