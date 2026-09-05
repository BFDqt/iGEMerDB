from __future__ import annotations

import os
import unittest
from unittest.mock import patch

from sqlalchemy import inspect, text

from igem_scraper.db import create_engine_from_url, init_db
from igem_scraper.config import SCRAPER_ROOT, load_config
from igem_scraper.normalize import (
    normalize_affiliation,
    normalize_name,
    normalize_text,
    person_uid,
    team_name_norm,
)
from igem_scraper.upsert import get_insert
from igem_scraper.team_ingest import _infer_role
from igem_scraper.publication import classify_team_for_export, is_default_visible


class NormalizationTests(unittest.TestCase):
    def test_text_and_name_normalization(self) -> None:
        self.assertEqual(normalize_text("  Alice\u00a0  Chen "), "Alice Chen")
        self.assertEqual(normalize_name("  Alice Chen "), "alice chen")
        self.assertEqual(normalize_name("清华大学"), "清华大学")

    def test_team_dash_and_underscore_normalization(self) -> None:
        self.assertEqual(team_name_norm("Aalto–Helsinki"), "aalto-helsinki")
        self.assertEqual(team_name_norm(" Team_Name "), "team name")

    def test_affiliation_and_uid_are_stable(self) -> None:
        affiliation = normalize_affiliation(" Student（Undergrad）， 2025 ")
        self.assertEqual(affiliation, "student(undergrad), 2025")
        self.assertEqual(
            person_uid("alice chen", affiliation),
            person_uid("alice chen", affiliation),
        )
        self.assertEqual(len(person_uid("alice chen", affiliation)), 40)

    def test_official_roster_roles_are_mapped(self) -> None:
        self.assertEqual(_infer_role("primary-pi", "Professor"), ("PI", False))
        self.assertEqual(_infer_role("secondary-pi", "Professor"), ("PI", False))
        self.assertEqual(
            _infer_role("student-leader", "Master Student"), ("Graduate", True)
        )
        self.assertEqual(_infer_role("student", "Undergraduate"), ("Undergrad", True))
        self.assertEqual(
            _infer_role("student", "Under graduate student"), ("Undergrad", True)
        )
        self.assertEqual(
            _infer_role("student", "Undegraduate Student"), ("Undergrad", True)
        )
        self.assertEqual(_infer_role("student", "Student"), ("Student", True))
        self.assertEqual(_infer_role("student-leader", ""), ("Student", True))
        self.assertEqual(_infer_role("unknown", "Student"), ("Other", False))

    def test_non_competition_records_are_quarantined_without_deletion(self) -> None:
        self.assertEqual(classify_team_for_export("Example", "accepted"), "demo-test")
        self.assertEqual(
            classify_team_for_export("Registry_Example", "accepted"), "demo-test"
        )
        self.assertEqual(
            classify_team_for_export("TestDaily-I-Beijing", "accepted"), "demo-test"
        )
        self.assertEqual(classify_team_for_export("Real-Team", "withdrawn"), "withdrawn")
        self.assertTrue(is_default_visible("accepted"))
        self.assertFalse(is_default_visible("demo-test"))


class DatabaseTests(unittest.TestCase):
    def test_sqlite_schema_and_upsert_dialect(self) -> None:
        engine = create_engine_from_url("sqlite:///:memory:")
        init_db(engine)
        tables = set(inspect(engine).get_table_names())
        self.assertTrue(
            {
                "competition",
                "team",
                "person",
                "roster_entry",
                "award",
                "team_award_result",
                "team_stats",
            }.issubset(tables)
        )
        team_columns = {column["name"] for column in inspect(engine).get_columns("team")}
        self.assertIn("is_listed", team_columns)
        self.assertTrue(
            {
                "listed_at",
                "detail_fetched_at",
                "roster_fetched_at",
                "awards_fetched_at",
                "detail_fetch_error",
                "roster_fetch_error",
                "awards_fetch_error",
            }.issubset(team_columns)
        )
        self.assertEqual(get_insert(engine).__module__, "sqlalchemy.dialects.sqlite.dml")

    def test_legacy_award_key_is_migrated_without_losing_rows(self) -> None:
        engine = create_engine_from_url("sqlite:///:memory:")
        with engine.begin() as connection:
            connection.execute(
                text(
                    """
                    CREATE TABLE competition (
                        uuid VARCHAR(64) PRIMARY KEY,
                        year INTEGER NOT NULL UNIQUE,
                        wiki_slug VARCHAR(32),
                        status VARCHAR(32),
                        fetched_at DATETIME NOT NULL
                    )
                    """
                )
            )
            connection.execute(
                text(
                    """
                    CREATE TABLE award (
                        uuid VARCHAR(64) PRIMARY KEY,
                        competition_uuid VARCHAR(64) NOT NULL,
                        title VARCHAR(256) NOT NULL,
                        description TEXT,
                        icon_url VARCHAR(512)
                    )
                    """
                )
            )
            connection.execute(
                text(
                    """
                    INSERT INTO competition
                        (uuid, year, wiki_slug, status, fetched_at)
                    VALUES ('competition', 2025, '2025', 'archived', CURRENT_TIMESTAMP)
                    """
                )
            )
            connection.execute(
                text(
                    """
                    INSERT INTO award
                        (uuid, competition_uuid, title)
                    VALUES ('gold', 'competition', 'Gold')
                    """
                )
            )

        init_db(engine)
        pk = set(inspect(engine).get_pk_constraint("award")["constrained_columns"])
        self.assertEqual(pk, {"uuid", "competition_uuid"})
        with engine.connect() as connection:
            self.assertEqual(
                connection.execute(text("SELECT COUNT(*) FROM award")).scalar_one(),
                1,
            )


class ConfigTests(unittest.TestCase):
    def test_relative_sqlite_path_is_stable_across_working_directories(self) -> None:
        with patch.dict(os.environ, {"DATABASE_URL": "sqlite:///data/archive.db"}):
            config = load_config()

        expected = (SCRAPER_ROOT / "data" / "archive.db").resolve().as_posix()
        self.assertEqual(config.database_url, f"sqlite:///{expected}")

    def test_memory_sqlite_url_is_unchanged(self) -> None:
        with patch.dict(os.environ, {"DATABASE_URL": "sqlite:///:memory:"}):
            config = load_config()

        self.assertEqual(config.database_url, "sqlite:///:memory:")


if __name__ == "__main__":
    unittest.main()
