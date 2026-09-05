from __future__ import annotations

from dataclasses import dataclass
import os
from pathlib import Path

from dotenv import load_dotenv


SCRAPER_ROOT = Path(__file__).resolve().parent.parent


def _resolve_database_url(database_url: str) -> str:
    """Anchor relative SQLite paths to the scraper, not the caller's CWD."""
    prefix = "sqlite:///"
    if not database_url.startswith(prefix):
        return database_url

    raw_path = database_url.removeprefix(prefix)
    if raw_path == ":memory:" or raw_path.startswith("file:"):
        return database_url

    sqlite_path = Path(raw_path)
    if sqlite_path.is_absolute():
        return database_url
    resolved = (SCRAPER_ROOT / sqlite_path).resolve().as_posix()
    return f"{prefix}{resolved}"


@dataclass(frozen=True)
class ScraperConfig:
    database_url: str
    user_agent: str
    requests_per_second: float
    timeout_seconds: float
    max_retries: int
    start_year: int
    end_year: int
    max_live_age_hours: int = 48


def load_config() -> ScraperConfig:
    load_dotenv(SCRAPER_ROOT / ".env")

    database_url = os.getenv("DATABASE_URL", "").strip()
    if not database_url:
        raise RuntimeError("DATABASE_URL is required (see tools/igem_scraper/.env.example)")
    database_url = _resolve_database_url(database_url)

    return ScraperConfig(
        database_url=database_url,
        user_agent=os.getenv("USER_AGENT", "iGEMerDbScraper/0.1").strip(),
        requests_per_second=float(os.getenv("REQUESTS_PER_SECOND", "1.5")),
        timeout_seconds=float(os.getenv("TIMEOUT_SECONDS", "30")),
        max_retries=int(os.getenv("MAX_RETRIES", "4")),
        start_year=int(os.getenv("START_YEAR", "2004")),
        end_year=int(os.getenv("END_YEAR", "2026")),
        max_live_age_hours=int(os.getenv("MAX_LIVE_AGE_HOURS", "48")),
    )
