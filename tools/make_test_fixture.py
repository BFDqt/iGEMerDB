"""Deterministically regenerate the frontend test fixture from the production snapshot.

The fixture must exercise the paths the old single-year fixture could not:
multi-year facets, schema-v3 metadata, quarantine categories, per-team awards,
cross-year members, and the full role spectrum. Keep the three anchors that
existing tests rely on: team 5587 (Aachen), team 5540 (Stony-Brook), and the
member "Alexa Stermann" on 5587.

Usage: python tools/make_test_fixture.py
"""
from __future__ import annotations

import json
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SNAPSHOT = ROOT / "public" / "data" / "igem.json"
TARGET = ROOT / "src" / "app" / "test" / "fixtures" / "test_export.json"

ROLES = ("Student", "Undergrad", "Graduate", "PI", "Advisor", "Other")


def main() -> None:
    snap = json.loads(SNAPSHOT.read_text(encoding="utf-8"))
    teams = snap["teams"]
    roster = snap["roster"]
    team_by_id = {t["id"]: t for t in teams}

    selected: set[int] = set()

    def add(team_id: int) -> None:
        if team_id in team_by_id:
            selected.add(team_id)

    # Anchors required by existing tests.
    add(5587)
    add(5540)  # Stony-Brook 2025

    # Accepted teams across three years, deterministic by id.
    for year, limit in ((2026, 6), (2025, 8), (2024, 5)):
        accepted = sorted(
            (
                t
                for t in teams
                if t["year"] == year and t.get("export_category") == "accepted"
            ),
            key=lambda t: t["id"],
        )
        for team in accepted[:limit]:
            add(team["id"])

    # Quarantine categories from the live year.
    for category, limit in (
        ("withdrawn", 1),
        ("disqualified", 1),
        ("demo-test", 2),
    ):
        rows = sorted(
            (
                t
                for t in teams
                if t["year"] == 2026 and t.get("export_category") == category
            ),
            key=lambda t: t["id"],
        )
        for team in rows[:limit]:
            add(team["id"])

    # Institution dedup cases (word order / cross-country).
    for name in (
        "University of Miami",
        "Miami University",
        "Newcastle University",
        "University of Newcastle",
    ):
        team = next(
            (
                t
                for t in teams
                if any(
                    item.get("name") == name
                    for item in (t.get("institutions") or [])
                )
            ),
            None,
        )
        if team is not None:
            add(team["id"])

    # A member with the widest cross-year footprint, for timeline tests.
    membership_counts = Counter(row["member_uuid"] for row in roster)
    if membership_counts:
        prolific = max(membership_counts, key=lambda u: (membership_counts[u], u))
        for team_id in sorted(
            {r["team_id"] for r in roster if r["member_uuid"] == prolific}
        )[:3]:
            add(team_id)

    # Guarantee the full derived-role spectrum.
    def selected_roles() -> set[str]:
        return {
            row.get("role_inferred") or "Unknown"
            for row in roster
            if row["team_id"] in selected
        }

    for role in ROLES:
        if role in selected_roles():
            continue
        row = next(r for r in roster if r.get("role_inferred") == role)
        add(row["team_id"])

    fixture_teams = sorted(
        (json.loads(json.dumps(team_by_id[team_id])) for team_id in selected),
        key=lambda t: (t["year"], t["id"]),
    )
    team_ids = {t["id"] for t in fixture_teams}

    fixture_roster = sorted(
        (r for r in roster if r["team_id"] in team_ids),
        key=lambda r: (r["team_id"], r["member_uuid"]),
    )
    member_uuids = {r["member_uuid"] for r in fixture_roster}
    fixture_members = sorted(
        (m for m in snap["members"] if m["uuid"] in member_uuids),
        key=lambda m: m["uuid"],
    )

    fixture_results = sorted(
        (a for a in snap["team_awards"] if a["team_id"] in team_ids),
        key=lambda a: (a["team_id"], a["award_uuid"]),
    )
    used_award_uuids = {a["award_uuid"] for a in fixture_results}
    fixture_awards = sorted(
        (a for a in snap["awards"] if a["uuid"] in used_award_uuids),
        key=lambda a: a["uuid"],
    )

    referenced_names = {
        item["name"]
        for team in fixture_teams
        for item in (team.get("institutions") or [])
        if item.get("name")
    }
    fixture_institutions = sorted(
        (i for i in snap["institutions"] if i["name"] in referenced_names),
        key=lambda i: i["name"],
    )

    years = {t["year"] for t in fixture_teams}
    meta = json.loads(json.dumps(snap["meta"]))
    meta["coverage"] = [
        row for row in meta.get("coverage") or [] if row.get("year") in years
    ]

    visible_ids = {
        t["id"] for t in fixture_teams if t.get("default_visible") is True
    }
    visible_roster = [r for r in fixture_roster if r["team_id"] in visible_ids]
    visible_people = len({r["member_uuid"] for r in visible_roster})
    meta["entity_counts"] = {
        "teams": len(visible_ids),
        "members": visible_people,
        "roster": len(visible_roster),
        "institutions": len(fixture_institutions),
        "awards": len(fixture_awards),
        "team_awards": len(
            [a for a in fixture_results if a["team_id"] in visible_ids]
        ),
        "raw_teams": len(fixture_teams),
        "raw_members": len(fixture_members),
        "raw_roster": len(fixture_roster),
        "raw_team_awards": len(fixture_results),
    }

    fixture = {
        "meta": meta,
        "competitions": sorted(
            (
                c
                for c in snap["competitions"]
                if c["year"] in years
            ),
            key=lambda c: c["year"],
        ),
        "institutions": fixture_institutions,
        "teams": fixture_teams,
        "members": fixture_members,
        "roster": fixture_roster,
        "awards": fixture_awards,
        "team_awards": fixture_results,
    }

    TARGET.parent.mkdir(parents=True, exist_ok=True)
    payload = json.dumps(fixture, ensure_ascii=False)
    TARGET.write_text(payload, encoding="utf-8", newline="\n")

    print(f"teams={len(fixture_teams)} years={sorted(years)}")
    print(
        "members=%d roster=%d awards=%d results=%d institutions=%d"
        % (
            len(fixture_members),
            len(fixture_roster),
            len(fixture_awards),
            len(fixture_results),
            len(fixture_institutions),
        )
    )
    print(f"roles={sorted(selected_roles())}")
    print(f"bytes={TARGET.stat().st_size:,}")
    print(f"entity_counts={meta['entity_counts']}")


if __name__ == "__main__":
    main()
