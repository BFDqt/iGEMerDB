from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
import json
from pathlib import Path

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from .config import ScraperConfig
from .db import get_engine
from .models import Competition, RosterEntry, Team, TeamAwardResult, TeamStats
from .publication import (
    DEMO_TEST_TEAM_NAMES,
    EXPORT_CATEGORIES,
    classify_team_for_export,
    is_default_visible,
)


_COMPETITION_STATUSES = {"archived", "live"}
_TEAM_STATUSES = {"accepted", "withdrawn", "disqualified"}


def _utc(value: datetime | None) -> datetime | None:
    if value is None:
        return None
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


def _parse_timestamp(value: object) -> datetime | None:
    if not isinstance(value, str) or not value:
        return None
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return None
    return _utc(parsed)


@dataclass(frozen=True)
class ValidationReport:
    competition_count: int
    team_count: int
    roster_count: int
    team_award_count: int
    issues: tuple[str, ...]

    @property
    def ok(self) -> bool:
        return not self.issues


def validate_database(cfg: ScraperConfig) -> ValidationReport:
    """Check whether a scrape is complete enough to publish."""
    engine = get_engine(cfg)
    issues: list[str] = []
    with Session(engine) as session:
        competitions = list(
            session.scalars(select(Competition).order_by(Competition.year)).all()
        )
        teams = list(
            session.scalars(select(Team).where(Team.is_listed.is_(True))).all()
        )
        team_count = len(teams)
        team_ids = {team.team_id for team in teams}

        if not competitions:
            issues.append("no competitions")
        if not teams:
            issues.append("no teams")

        for competition in competitions:
            if competition.status not in _COMPETITION_STATUSES:
                issues.append(
                    f"{competition.year}: unknown competition status "
                    f"{competition.status!r}"
                )
            year_teams = [team for team in teams if team.year == competition.year]
            if not year_teams:
                issues.append(f"{competition.year}: no teams")
                continue
            for field in ("detail_fetched", "roster_fetched", "awards_fetched"):
                missing = sum(not bool(getattr(team, field)) for team in year_teams)
                if missing:
                    issues.append(f"{competition.year}: {missing} teams missing {field}")
                timestamp_field = f"{field}_at"
                missing_timestamps = sum(
                    bool(getattr(team, field)) and not getattr(team, timestamp_field)
                    for team in year_teams
                )
                if missing_timestamps:
                    issues.append(
                        f"{competition.year}: {missing_timestamps} teams missing "
                        f"{timestamp_field} provenance"
                    )

            if competition.status == "live":
                cutoff = datetime.now(timezone.utc) - timedelta(
                    hours=cfg.max_live_age_hours
                )
                if not _utc(competition.fetched_at) or _utc(competition.fetched_at) < cutoff:
                    issues.append(f"{competition.year}: competition listing is stale")
                for timestamp_field in (
                    "listed_at",
                    "detail_fetched_at",
                    "roster_fetched_at",
                    "awards_fetched_at",
                ):
                    stale = sum(
                        not _utc(getattr(team, timestamp_field))
                        or _utc(getattr(team, timestamp_field)) < cutoff
                        for team in year_teams
                    )
                    if stale:
                        issues.append(
                            f"{competition.year}: {stale} teams have stale "
                            f"{timestamp_field}"
                        )

        unknown_team_statuses = sorted(
            {team.status for team in teams if team.status not in _TEAM_STATUSES},
            key=lambda value: str(value),
        )
        if unknown_team_statuses:
            issues.append(f"unknown team statuses: {unknown_team_statuses!r}")

        fetch_errors = [team for team in teams if team.fetch_error]
        if fetch_errors:
            issues.append(f"{len(fetch_errors)} teams have fetch errors")

        stat_ids = set(session.scalars(select(TeamStats.team_id)).all())
        missing_stats = team_ids - stat_ids
        if missing_stats:
            issues.append(f"{len(missing_stats)} teams missing computed stats")

        roster_count = int(session.scalar(select(func.count()).select_from(RosterEntry)) or 0)
        from .team_ingest import _infer_role

        roster_roles = session.execute(
            select(
                RosterEntry.role_api,
                RosterEntry.snapshot_title,
                RosterEntry.role_inferred,
                RosterEntry.is_student,
            )
        ).all()
        role_mismatches = sum(
            _infer_role(row.role_api, row.snapshot_title)
            != (row.role_inferred, row.is_student)
            for row in roster_roles
        )
        if role_mismatches:
            issues.append(f"{role_mismatches} roster rows use stale role mappings")
        team_award_count = int(
            session.scalar(select(func.count()).select_from(TeamAwardResult)) or 0
        )

    return ValidationReport(
        competition_count=len(competitions),
        team_count=team_count,
        roster_count=roster_count,
        team_award_count=team_award_count,
        issues=tuple(issues),
    )


def validate_export(path: Path, ignore_stale_live: bool = False) -> tuple[str, ...]:
    """Validate referential integrity and coverage metadata in an exported JSON.

    ``ignore_stale_live`` downgrades live-year freshness findings to nothing.
    It exists for pull-request pipelines: contributors validate an aging
    snapshot's structure, while pushes to the default branch always run the
    full freshness gate before anything can ship.
    """
    if not path.is_file():
        return (f"export does not exist: {path}",)

    payload = json.loads(path.read_text(encoding="utf-8"))
    issues: list[str] = []
    meta = payload.get("meta", {})
    if meta.get("schema_version") != 3:
        issues.append("export schema_version is not 3")

    teams = payload.get("teams", [])
    members = payload.get("members", [])
    roster = payload.get("roster", [])
    team_awards = payload.get("team_awards", [])
    awards = payload.get("awards", [])
    competitions = payload.get("competitions", [])
    team_ids = [row.get("id") for row in teams]
    member_ids = [row.get("uuid") for row in members]
    competition_ids = [row.get("uuid") for row in competitions]
    competition_years = [int(row.get("year") or 0) for row in competitions]
    unknown_competition_statuses = sorted(
        {
            row.get("status")
            for row in competitions
            if row.get("status") not in _COMPETITION_STATUSES
        },
        key=lambda value: str(value),
    )
    if unknown_competition_statuses:
        issues.append(
            f"unknown competition statuses: {unknown_competition_statuses!r}"
        )

    for label, rows in (
        ("competitions", competitions),
        ("teams", teams),
        ("members", members),
        ("roster", roster),
    ):
        if not rows:
            issues.append(f"no {label} in export")

    if len(team_ids) != len(set(team_ids)):
        issues.append("duplicate team ids in export")
    if len(member_ids) != len(set(member_ids)):
        issues.append("duplicate member ids in export")
    if len(competition_ids) != len(set(competition_ids)):
        issues.append("duplicate competition ids in export")
    if len(competition_years) != len(set(competition_years)):
        issues.append("duplicate competition years in export")
    team_id_set = set(team_ids)
    member_id_set = set(member_ids)
    competition_id_set = set(competition_ids)
    team_by_id = {row.get("id"): row for row in teams}

    orphan_team_competitions = sum(
        row.get("competition_uuid") not in competition_id_set for row in teams
    )
    if orphan_team_competitions:
        issues.append(
            f"{orphan_team_competitions} teams reference missing competitions"
        )
    orphan_roster = sum(
        row.get("team_id") not in team_id_set
        or row.get("member_uuid") not in member_id_set
        for row in roster
    )
    if orphan_roster:
        issues.append(f"{orphan_roster} orphan roster rows in export")
    orphan_results = sum(row.get("team_id") not in team_id_set for row in team_awards)
    if orphan_results:
        issues.append(f"{orphan_results} orphan team-award rows in export")

    award_keys = [(row.get("competition_uuid"), row.get("uuid")) for row in awards]
    if len(award_keys) != len(set(award_keys)):
        issues.append("duplicate competition/award keys in export")
    award_key_set = set(award_keys)

    # JSON has no unique constraints: catch duplicate relationship keys that
    # would silently double-count memberships and award results.
    roster_keys = [
        (row.get("team_id"), row.get("member_uuid"), row.get("role_api") or "")
        for row in roster
    ]
    if len(roster_keys) != len(set(roster_keys)):
        issues.append(
            f"{len(roster_keys) - len(set(roster_keys))} duplicate roster keys in export"
        )
    result_keys = [(row.get("team_id"), row.get("award_uuid")) for row in team_awards]
    if len(result_keys) != len(set(result_keys)):
        issues.append(
            f"{len(result_keys) - len(set(result_keys))} duplicate team-award keys in export"
        )

    # Roster rows must agree with the per-team member counts the stats run
    # computed; a mismatch means stats are stale relative to the roster.
    roster_count_by_team: dict = {}
    roster_year_mismatches = 0
    for row in roster:
        team = team_by_id.get(row.get("team_id"))
        if team is None:
            continue
        roster_count_by_team[row["team_id"]] = (
            roster_count_by_team.get(row["team_id"], 0) + 1
        )
        if row.get("year") is not None and team.get("year") not in (None, row.get("year")):
            roster_year_mismatches += 1
    stale_member_counts = sum(
        (team_by_id.get(team_id) or {}).get("all_member_count") not in (None, count)
        for team_id, count in roster_count_by_team.items()
    )
    if stale_member_counts:
        issues.append(
            f"{stale_member_counts} teams have all_member_count stale vs roster rows"
        )
    if roster_year_mismatches:
        issues.append(
            f"{roster_year_mismatches} roster rows reference a different year than their team"
        )

    missing_award_definitions = 0
    for result in team_awards:
        team = team_by_id.get(result.get("team_id"))
        if team and (
            team.get("competition_uuid"),
            result.get("award_uuid"),
        ) not in award_key_set:
            missing_award_definitions += 1
    if missing_award_definitions:
        issues.append(
            f"{missing_award_definitions} team-award rows reference missing definitions"
        )

    teams_by_year: dict[int, int] = {}
    for team in teams:
        year = int(team.get("year") or 0)
        teams_by_year[year] = teams_by_year.get(year, 0) + 1
        if team.get("fetch_error"):
            issues.append(f"team {team.get('id')} has a fetch error in export")
        if team.get("status") not in _TEAM_STATUSES:
            issues.append(
                f"team {team.get('id')} has unknown status {team.get('status')!r}"
            )
        expected_category = classify_team_for_export(
            team.get("name"), team.get("status")
        )
        if team.get("export_category") != expected_category:
            issues.append(
                f"team {team.get('id')} has incorrect export_category"
            )
        if team.get("default_visible") is not is_default_visible(expected_category):
            issues.append(
                f"team {team.get('id')} has incorrect default_visible"
            )
        for field in ("detail_fetched", "roster_fetched", "awards_fetched"):
            if team.get(field) is False:
                issues.append(f"team {team.get('id')} is missing {field} in export")
            timestamp_field = f"{field}_at"
            if team.get(field) is not False and not _parse_timestamp(
                team.get(timestamp_field)
            ):
                issues.append(
                    f"team {team.get('id')} is missing valid {timestamp_field}"
                )

    coverage = payload.get("meta", {}).get("coverage", [])
    coverage_years = [int(row.get("year") or 0) for row in coverage]
    if len(coverage_years) != len(set(coverage_years)):
        issues.append("duplicate coverage years in export")
    if set(coverage_years) != set(competition_years):
        issues.append("coverage years do not match competitions")
    for row in coverage:
        year = int(row.get("year") or 0)
        team_count = int(row.get("team_count") or 0)
        if team_count != teams_by_year.get(year, 0):
            issues.append(f"{year}: coverage team_count does not match export")
        for field in (
            "detail_fetched_count",
            "roster_fetched_count",
            "awards_fetched_count",
        ):
            if int(row.get(field) or 0) != team_count:
                issues.append(f"{year}: {field} is incomplete")
        if int(row.get("fetch_error_count") or 0):
            issues.append(f"{year}: coverage reports fetch errors")
        status_counts = row.get("status_counts") or {}
        if sum(int(value or 0) for value in status_counts.values()) != team_count:
            issues.append(f"{year}: status_counts do not sum to team_count")
        if set(status_counts) - _TEAM_STATUSES:
            issues.append(f"{year}: status_counts contain unknown statuses")
        category_counts = row.get("export_category_counts") or {}
        if sum(int(value or 0) for value in category_counts.values()) != team_count:
            issues.append(
                f"{year}: export_category_counts do not sum to team_count"
            )
        if set(category_counts) - EXPORT_CATEGORIES:
            issues.append(f"{year}: export_category_counts contain unknown categories")
        visible_count = sum(
            int(count or 0)
            for category, count in category_counts.items()
            if is_default_visible(category)
        )
        if int(row.get("default_visible_count") or 0) != visible_count:
            issues.append(f"{year}: default_visible_count is incorrect")

    generated_at = meta.get("generated_at")
    source = meta.get("source")
    if not _parse_timestamp(generated_at):
        issues.append("export is missing a valid generated_at")
    if source != "https://api.igem.org/v1":
        issues.append("export source is not the official API base URL")

    provenance = meta.get("provenance") or {}
    endpoint_templates = provenance.get("endpoint_templates") or {}
    required_endpoints = {"team_detail", "team_roster", "team_awards"}
    if set(endpoint_templates) < required_endpoints:
        issues.append("export provenance is missing endpoint templates")
    if provenance.get("role_rule_version") != 2:
        issues.append("export role provenance is not rule version 2")

    export_policy = meta.get("export_policy") or {}
    if export_policy.get("version") != 1:
        issues.append("export quarantine policy is not version 1")
    if export_policy.get("default_visible_categories") != ["accepted"]:
        issues.append("export default-visible categories are not explicit")
    if set(export_policy.get("demo_test_name_allowlist") or []) != set(
        DEMO_TEST_TEAM_NAMES
    ):
        issues.append("export demo/test allowlist does not match classifier")

    competition_by_year = {
        int(row.get("year") or 0): row for row in competitions
    }
    max_live_age = int((meta.get("freshness") or {}).get("max_live_age_hours") or 0)
    if max_live_age <= 0:
        issues.append("export freshness policy is missing max_live_age_hours")
    else:
        cutoff = datetime.now(timezone.utc) - timedelta(hours=max_live_age)
        for team in teams:
            competition = competition_by_year.get(int(team.get("year") or 0), {})
            if competition.get("status") != "live":
                continue
            for timestamp_field in (
                "listed_at",
                "detail_fetched_at",
                "roster_fetched_at",
                "awards_fetched_at",
            ):
                timestamp = _parse_timestamp(team.get(timestamp_field))
                if not timestamp or timestamp < cutoff:
                    issues.append(
                        f"live team {team.get('id')} has stale {timestamp_field}"
                    )

    from .team_ingest import _infer_role

    stale_roles = sum(
        _infer_role(row.get("role_api") or "", row.get("snapshot_title"))
        != (row.get("role_inferred"), bool(row.get("is_student")))
        for row in roster
    )
    if stale_roles:
        issues.append(f"{stale_roles} roster rows use stale role mappings")

    if ignore_stale_live:
        issues = [
            issue
            for issue in issues
            if "has stale " not in issue and "competition listing is stale" not in issue
        ]
    return tuple(issues)
