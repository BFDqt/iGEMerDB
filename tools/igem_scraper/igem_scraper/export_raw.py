"""
export_raw.py  —  Export DB contents as frontend-compatible raw JSON.

Target shape consumed by frontend processData(raw):
{
  "meta": {schema_version, generated_at, source, coverage},
  "competitions": [{uuid, year, wiki_slug, status}],
  "institutions": [{id, name, country, city}],
  "teams": [{id, name, year, section, country, city, region, wiki_url, medal,
             canonical_id, institutions, all_member_count, student_member_count,
             student_past_experience_count}],
  "members": [{uuid, name, name_norm, username, institution, country,
                igem_since, first_seen_year, last_seen_year}],
  "roster": [{team_id, member_uuid, year, role_inferred, is_student}],
  "awards": [{uuid, competition_uuid, title, description}],
  "team_awards": [{team_id, award_uuid, title, decision, award_type, ...}]
}
"""
from __future__ import annotations

import json
import logging
import os
from pathlib import Path
from datetime import datetime, timezone

from sqlalchemy import func, select
from sqlalchemy.orm import Session as OrmSession

from .models import (
    Competition,
    Team,
    TeamCanonicalMap,
    Person,
    RosterEntry,
    Award,
    TeamAwardResult,
    TeamStats,
)
from .db import get_engine, init_db
from .models import RawResponse, ScrapeRun
from .config import ScraperConfig
from .publication import (
    DEMO_TEST_TEAM_NAMES,
    classify_team_for_export,
    is_default_visible,
)

log = logging.getLogger(__name__)


def _iso(value: datetime | None) -> str | None:
    if value is None:
        return None
    if value.tzinfo is None:
        value = value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc).isoformat()


def export_frontend_raw(cfg: ScraperConfig, out: Path) -> None:
    """Query all tables and write a single JSON file for the frontend."""
    engine = get_engine(cfg)
    # Idempotent: guarantees the replay-archive tables exist on databases
    # created before phase 1, so the provenance query below cannot fail.
    init_db(engine)

    with OrmSession(engine) as s:
        competitions = list(s.execute(select(Competition).order_by(Competition.year)).scalars())
        teams = list(s.execute(select(Team).where(Team.is_listed.is_(True))).scalars())
        team_canonical_map = {m.team_id: m.canonical_id for m in s.execute(select(TeamCanonicalMap)).scalars()}
        persons_all = list(s.execute(select(Person)).scalars())
        roster_entries_all = list(s.execute(select(RosterEntry)).scalars())
        awards = list(s.execute(select(Award)).scalars())
        team_awards_all = list(s.execute(select(TeamAwardResult)).scalars())
        stats_map = {st.team_id: st for st in s.execute(select(TeamStats)).scalars()}

    active_team_ids = {team.team_id for team in teams}
    roster_entries = [row for row in roster_entries_all if row.team_id in active_team_ids]
    active_member_ids = {row.member_uuid for row in roster_entries}
    persons = [person for person in persons_all if person.member_uuid in active_member_ids]
    team_awards = [row for row in team_awards_all if row.team_id in active_team_ids]

    # Collect institution names from teams.institutions_json
    inst_set: dict[str, dict] = {}
    for t in teams:
        if t.institutions_json:
            for inst in t.institutions_json:
                inst_id = str(inst.get("id") or inst.get("uuid") or inst.get("name", ""))
                if inst_id and inst_id not in inst_set:
                    inst_set[inst_id] = {
                        "id": inst_id,
                        "name": inst.get("name") or inst_id,
                        "country": inst.get("country") or t.country or "",
                        "city": inst.get("city") or t.city or "",
                    }

    raw_teams = []
    for t in teams:
        stats = stats_map.get(t.team_id)
        export_category = classify_team_for_export(t.name, t.status)
        raw_teams.append({
            "id": t.team_id,
            "name": t.name,
            "year": t.year,
            "competition_uuid": t.competition_uuid,
            "status": t.status,
            "section": t.section,
            "region": t.region,
            "country": t.country,
            "city": t.city,
            "organiser_type": t.organiser_type,
            "wiki_url": t.wiki_url,
            "medal": t.medal,
            "canonical_id": team_canonical_map.get(t.team_id),
            "institutions": t.institutions_json or [],
            "all_member_count": stats.all_member_count if stats else 0,
            "student_member_count": stats.student_member_count if stats else 0,
            "student_past_experience_count": stats.student_past_experience_count if stats else 0,
            "detail_fetched": t.detail_fetched,
            "roster_fetched": t.roster_fetched,
            "awards_fetched": t.awards_fetched,
            "listed_at": _iso(t.listed_at),
            "detail_fetched_at": _iso(t.detail_fetched_at),
            "roster_fetched_at": _iso(t.roster_fetched_at),
            "awards_fetched_at": _iso(t.awards_fetched_at),
            "fetch_error": t.fetch_error,
            "export_category": export_category,
            "default_visible": is_default_visible(export_category),
        })

    raw_members = [
        {
            "uuid": p.member_uuid,
            "name": p.public_name,
            "username": p.username,
            "institution": p.institution,
            "title": p.title,
            "affiliation": p.affiliation,
            "country": p.country,
            "igem_since": p.igem_since,
        }
        for p in persons
    ]

    raw_roster = [
        {
            "team_id": r.team_id,
            "member_uuid": r.member_uuid,
            "role_api": r.role_api,
            "role_inferred": r.role_inferred,
            "is_student": r.is_student,
            "snapshot_institution": r.snapshot_institution,
            "snapshot_title": r.snapshot_title,
        }
        for r in roster_entries
    ]

    raw_awards = [
        {
            "uuid": a.uuid,
            "competition_uuid": a.competition_uuid,
            "title": a.title,
            "description": a.description,
            "icon_url": a.icon_url,
            "award_type": a.award_type,
            "award_subtype": a.award_subtype,
            "village_uuid": a.village_uuid,
        }
        for a in awards
    ]

    raw_team_awards = [
        {
            "team_id": a.team_id,
            "award_uuid": a.award_uuid,
            "title": a.title,
            "decision": a.decision,
            "group": a.group,
            "award_type": a.award_type,
            "award_subtype": a.award_subtype,
            "icon_url": a.icon_url,
            "village_uuid": a.village_uuid,
        }
        for a in team_awards
    ]

    roster_team_ids = {r.team_id for r in roster_entries}
    award_team_ids = {a.team_id for a in team_awards}
    coverage = []
    for competition in competitions:
        year_teams = [t for t in teams if t.year == competition.year]
        year_team_ids = {t.team_id for t in year_teams}
        status_counts: dict[str, int] = {}
        export_category_counts: dict[str, int] = {}
        for team in year_teams:
            status = team.status or "unknown"
            status_counts[status] = status_counts.get(status, 0) + 1
            category = classify_team_for_export(team.name, team.status)
            export_category_counts[category] = (
                export_category_counts.get(category, 0) + 1
            )
        coverage.append({
            "year": competition.year,
            "competition_uuid": competition.uuid,
            "status": competition.status,
            "team_count": len(year_teams),
            "detail_fetched_count": sum(t.detail_fetched for t in year_teams),
            "roster_fetched_count": sum(t.roster_fetched for t in year_teams),
            "teams_with_public_roster": len(year_team_ids & roster_team_ids),
            "awards_fetched_count": sum(t.awards_fetched for t in year_teams),
            "teams_with_awards": len(year_team_ids & award_team_ids),
            "fetch_error_count": sum(bool(t.fetch_error) for t in year_teams),
            "status_counts": status_counts,
            "export_category_counts": export_category_counts,
            "default_visible_count": sum(
                count
                for category, count in export_category_counts.items()
                if is_default_visible(category)
            ),
        })

    with OrmSession(engine) as s:
        archive_run_count = s.scalar(
            select(ScrapeRun.id).order_by(ScrapeRun.id.desc()).limit(1)
        )
        archive_response_count = s.scalar(
            select(func.count()).select_from(RawResponse)
        )

    generated_at = datetime.now(timezone.utc)
    live_years = [
        competition.year
        for competition in competitions
        if competition.status == "live"
    ]
    payload = {
        "meta": {
            "schema_version": 3,
            "generated_at": generated_at.isoformat(),
            "source": "https://api.igem.org/v1",
            "provenance": {
                "endpoint_templates": {
                    "team_detail": "https://api.igem.org/v1/teams/{team_id}",
                    "team_roster": "https://api.igem.org/v1/teams/{team_id}/roster",
                    "team_awards": "https://api.igem.org/v1/teams/{team_id}/awards",
                },
                "retrieval_timestamp_fields": {
                    "team_detail": "teams.detail_fetched_at",
                    "team_roster": "teams.roster_fetched_at",
                    "team_awards": "teams.awards_fetched_at",
                },
                "role_rule_version": 2,
                "role_rule": (
                    "The official roster role determines student status; "
                    "Undergrad/Graduate require explicit public-title evidence."
                ),
                "response_archive": {
                    "latest_run_id": archive_run_count or 0,
                    "archived_responses": archive_response_count or 0,
                    "replay": (
                        "Every upstream response is archived gzip-compressed "
                        "with its URL, HTTP status and SHA-256; run "
                        "`cli.py replay <endpoint> --team-id <id>` to replay it."
                    ),
                },
            },
            "freshness": {
                "live_years": live_years,
                "max_live_age_hours": cfg.max_live_age_hours,
            },
            "status_policy": {
                "team_statuses": ["accepted", "withdrawn", "disqualified"],
                "note": "Status is preserved from the official team record; it is not an endorsement.",
            },
            "export_policy": {
                "version": 1,
                "default_visible_categories": ["accepted"],
                "quarantined_categories": [
                    "withdrawn",
                    "disqualified",
                    "demo-test",
                    "review",
                ],
                "demo_test_name_allowlist": sorted(DEMO_TEST_TEAM_NAMES),
                "note": (
                    "Quarantined records remain in the export for audit, but are "
                    "excluded from default product directories and totals."
                ),
            },
            "coverage": coverage,
        },
        "competitions": [
            {
                "uuid": c.uuid,
                "year": c.year,
                "wiki_slug": c.wiki_slug,
                "status": c.status,
                "fetched_at": _iso(c.fetched_at),
            }
            for c in competitions
        ],
        "institutions": list(inst_set.values()),
        "teams": raw_teams,
        "members": raw_members,
        "roster": raw_roster,
        "awards": raw_awards,
        "team_awards": raw_team_awards,
    }

    out.parent.mkdir(parents=True, exist_ok=True)
    temporary = out.with_name(f".{out.name}.{os.getpid()}.tmp")
    temporary.write_text(
        json.dumps(payload, ensure_ascii=False, separators=(",", ":")),
        encoding="utf-8",
    )
    temporary.replace(out)
    log.info(
        "Exported: teams=%d members=%d roster=%d awards=%d results=%d → %s",
        len(raw_teams),
        len(raw_members),
        len(raw_roster),
        len(raw_awards),
        len(raw_team_awards),
        out,
    )
