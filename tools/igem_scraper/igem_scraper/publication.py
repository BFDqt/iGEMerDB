from __future__ import annotations

from .normalize import team_name_norm


# This is intentionally a small, explicit allowlist.  Broad substring rules
# could quarantine a legitimate team whose name happens to contain "test".
DEMO_TEST_TEAM_NAMES = frozenset(
    {
        "example",
        "registry example",
        "testdaily-i-beijing",
    }
)
EXPORT_CATEGORIES = frozenset(
    {"accepted", "withdrawn", "disqualified", "demo-test", "review"}
)


def classify_team_for_export(name: str | None, status: str | None) -> str:
    """Classify a raw official team without deleting it from the archive."""
    if team_name_norm(name) in DEMO_TEST_TEAM_NAMES:
        return "demo-test"
    if status in {"accepted", "withdrawn", "disqualified"}:
        return status
    return "review"


def is_default_visible(category: str) -> bool:
    """Only accepted competition records belong in default product totals."""
    return category == "accepted"
