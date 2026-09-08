"""
team_ingest.py  —  orchestrates the full API-based data ingestion pipeline.

Pipeline order:
  1. fetch_competitions()       →  upsert Competition rows
  2. fetch_competition_teams()  →  upsert Team rows + CanonicalTeam mapping
  3. fetch_team_details()       →  update Team.wiki_url / medal / institutions_json
  4. fetch_team_rosters()       →  upsert Person + RosterEntry rows
  5. fetch_team_award_results() →  store nominations, winners and medals
  6. compute_stats()            →  fill TeamStats
"""
from __future__ import annotations

import asyncio
import logging
from datetime import datetime
from typing import Optional

from sqlalchemy import delete, select, func
from sqlalchemy.orm import Session

from .upsert import get_insert

from .api_client import IgemApiClient
from .archive import ResponseArchive
from .config import ScraperConfig
from .db import get_engine
from .models import (
    Competition,
    Team,
    CanonicalTeam,
    TeamCanonicalMap,
    Person,
    RosterEntry,
    Award,
    TeamAwardResult,
    TeamStats,
    utc_now,
)
from .normalize import team_name_norm, normalize_name

log = logging.getLogger(__name__)

_API_BASE = "https://api.igem.org/v1"
_PHASE_ERROR_COLUMNS = {
    "detail": Team.detail_fetch_error,
    "roster": Team.roster_fetch_error,
    "awards": Team.awards_fetch_error,
}


# ─── Role mapping ────────────────────────────────────────────────────────────

def _infer_role(role_api: str, title: str | None) -> tuple[str, bool]:
    """Return a conservative ``(display role, is_student)`` pair.

    The official roster role establishes whether somebody is a student, but it
    does not establish their education level.  Undergrad/Graduate therefore
    require explicit evidence in the public profile title.
    """
    r = (role_api or "").lower()
    t = (title or "").lower()
    if r in ("pi", "primary-pi", "secondary-pi"):
        return "PI", False
    if r in ("instructor", "advisor"):
        return "Advisor", False
    if r in ("student", "student-leader"):
        if any(
            marker in t
            for marker in (
                "undergrad",
                "under graduate",
                "undegraduate",
                "udergraduate",
                "bachelor",
                "b.sc",
                "bsc",
            )
        ):
            return "Undergrad", True
        if any(
            marker in t
            for marker in ("graduate", "phd", "postdoc", "doctoral", "master", "msc", "m.sc")
        ):
            return "Graduate", True
        return "Student", True
    return "Other", False


def _mark_team_phase(
    session: Session,
    team_id: int,
    phase: str,
    *,
    fetched_at: datetime | None = None,
    error: str | None = None,
    values: dict | None = None,
) -> None:
    """Record one phase without allowing a success to hide another error."""
    if phase not in _PHASE_ERROR_COLUMNS:
        raise ValueError(f"Unknown ingestion phase: {phase}")

    update_values = dict(values or {})
    update_values[f"{phase}_fetch_error"] = error
    if error is None:
        update_values[f"{phase}_fetched"] = True
        update_values[f"{phase}_fetched_at"] = fetched_at or utc_now()
    session.execute(
        Team.__table__.update()
        .where(Team.team_id == team_id)
        .values(**update_values)
    )
    session.flush()

    errors = session.execute(
        select(
            Team.detail_fetch_error,
            Team.roster_fetch_error,
            Team.awards_fetch_error,
        ).where(Team.team_id == team_id)
    ).one()
    summary = "; ".join(
        f"{name}: {message}"
        for name, message in zip(("detail", "roster", "awards"), errors)
        if message
    )
    session.execute(
        Team.__table__.update()
        .where(Team.team_id == team_id)
        .values(fetch_error=summary or None)
    )


def recompute_roster_roles(cfg: ScraperConfig) -> int:
    """Re-apply the current role mapping to every stored roster row."""
    engine = get_engine(cfg)
    with Session(engine) as session:
        rows = session.execute(
            select(RosterEntry.id, RosterEntry.role_api, RosterEntry.snapshot_title)
        ).all()
        mappings = []
        for row in rows:
            role_inferred, is_student = _infer_role(row.role_api, row.snapshot_title)
            mappings.append(
                {
                    "id": row.id,
                    "role_inferred": role_inferred,
                    "is_student": is_student,
                }
            )
        if mappings:
            session.bulk_update_mappings(RosterEntry, mappings)
        session.commit()
    compute_stats(cfg)
    log.info("Recomputed roles for %d roster rows", len(rows))
    return len(rows)


# ─── 1. Competitions ─────────────────────────────────────────────────────────

async def fetch_competitions(cfg: ScraperConfig) -> list[dict]:
    """Fetch all competition years from API and upsert into DB."""
    engine = get_engine(cfg)
    async with IgemApiClient(cfg) as client:
        competitions = await client.get_competitions()

    rows = []
    fetched_at = utc_now()
    _insert = get_insert(engine)
    with Session(engine) as session:
        for comp in competitions:
            # The API also exposes Venture Foundry competitions. This archive is
            # intentionally the iGEM Competition dataset, whose year is unique.
            if comp.get("type") not in (None, "igem"):
                continue
            row = {
                "uuid": comp["uuid"],
                "year": int(comp["year"]),
                "wiki_slug": comp.get("wikiSlug") or comp.get("slug"),
                "status": comp.get("status"),
                "fetched_at": fetched_at,
            }
            stmt = (
                _insert(Competition)
                .values(**row)
                .on_conflict_do_update(
                    index_elements=["uuid"],
                    set_={k: v for k, v in row.items() if k != "uuid"},
                )
            )
            session.execute(stmt)
            rows.append(row)
        session.commit()

    log.info("Upserted %d competitions", len(rows))
    return rows


# ─── 2. Teams for a competition ───────────────────────────────────────────────

async def fetch_competition_teams(
    cfg: ScraperConfig,
    competition_uuid: str,
    year: int,
    run_id: int | None = None,
) -> list[int]:
    """Fetch all teams for one competition year and upsert Team + CanonicalTeam rows."""
    engine = get_engine(cfg)
    async with IgemApiClient(cfg) as client:
        teams_data, teams_meta = await client.get_competition_teams_with_meta(
            competition_uuid
        )
    if teams_meta is not None:
        ResponseArchive(cfg).record(
            run_id=run_id,
            endpoint="competition_teams",
            url=teams_meta.url,
            http_status=teams_meta.status,
            body=teams_meta.text,
            content_type=teams_meta.content_type,
            fetched_at=teams_meta.fetched_at,
            competition_uuid=competition_uuid,
        )
    if not teams_data:
        raise RuntimeError(f"API returned no teams for competition year {year}")

    team_ids: list[int] = []
    listed_at = utc_now()
    _insert = get_insert(engine)
    with Session(engine) as session:
        # Preserve historical rows in the database, but only publish teams still
        # present in the official competition listing on the latest sync.
        session.execute(
            Team.__table__.update().where(Team.year == year).values(is_listed=False)
        )
        for t in teams_data:
            norm = team_name_norm(t.get("name", ""))
            team_row = {
                "team_id": int(t["id"]),
                "year": year,
                "competition_uuid": competition_uuid,
                "name": t.get("name", ""),
                "name_norm": norm,
                "is_listed": True,
                "listed_at": listed_at,
                "slug": t.get("slug"),
                "status": t.get("status"),
                "region": t.get("region"),
                "country": t.get("country"),
                "city": t.get("city"),
                "section": t.get("section"),
                "organiser_type": t.get("organiserType"),
                "program": t.get("program"),
                "village_uuid": t.get("villageUUID"),
                "is_remote": t.get("isRemote"),
            }
            stmt = (
                _insert(Team)
                .values(**team_row)
                .on_conflict_do_update(
                    index_elements=["team_id"],
                    set_={k: v for k, v in team_row.items() if k != "team_id"},
                )
            )
            session.execute(stmt)

            # CanonicalTeam (by norm name)
            can_stmt = (
                _insert(CanonicalTeam)
                .values(name_norm=norm, display_name=t.get("name", ""), needs_review=False)
                .on_conflict_do_nothing(index_elements=["name_norm"])
            )
            session.execute(can_stmt)

            team_ids.append(int(t["id"]))

        session.commit()

    # TeamCanonicalMap: build AFTER canonical rows are committed (separate session)
    with Session(engine) as session2:
        # Bulk load canonical ids by norm name to avoid N+1 SELECTs
        norms = list({team_name_norm(t.get("name", "")) for t in teams_data})
        canon_rows = session2.execute(
            select(CanonicalTeam.name_norm, CanonicalTeam.canonical_id)
            .where(CanonicalTeam.name_norm.in_(norms))
        ).all()
        canon_by_norm = {r.name_norm: r.canonical_id for r in canon_rows}

        _insert2 = get_insert(engine)
        for t in teams_data:
            norm = team_name_norm(t.get("name", ""))
            cid = canon_by_norm.get(norm)
            if cid is not None:
                map_stmt = (
                    _insert2(TeamCanonicalMap)
                    .values(team_id=int(t["id"]), canonical_id=cid)
                    .on_conflict_do_update(
                        index_elements=["team_id"],
                        set_={"canonical_id": cid},
                    )
                )
                session2.execute(map_stmt)
        session2.commit()

    log.info("Upserted %d teams for year %d", len(team_ids), year)
    return team_ids


# ─── 3. Team details ──────────────────────────────────────────────────────────

async def fetch_team_details(
    cfg: ScraperConfig,
    team_ids: list[int],
    concurrency: int = 5,
    resume: bool = True,
    run_id: int | None = None,
) -> None:
    """For each team ID, fetch detail JSON and update wiki_url/medal/institutions.

    Args:
        resume: Skip teams where detail_fetched=True (default: True).
    """
    engine = get_engine(cfg)

    # Resume: filter out already-fetched teams in one bulk query
    if resume and team_ids:
        with Session(engine) as s:
            fetched = set(
                s.scalars(
                    select(Team.team_id)
                    .where(Team.team_id.in_(team_ids), Team.detail_fetched.is_(True))
                ).all()
            )
        if fetched:
            log.info("Resume: skipping %d already-detailed teams", len(fetched))
            team_ids = [tid for tid in team_ids if tid not in fetched]
    if not team_ids:
        return

    sem = asyncio.Semaphore(concurrency)

    async def _fetch_one(client: IgemApiClient, tid: int) -> None:
        async with sem:
            try:
                data, meta = await client.get_team_detail_with_meta(tid)
            except Exception as exc:
                log.warning("Detail fetch failed for team %d: %s", tid, exc)
                with Session(engine) as s:
                    _mark_team_phase(s, tid, "detail", error=str(exc))
                    s.commit()
                return

            if run_id is not None and meta is not None:
                ResponseArchive(cfg).record(
                    run_id=run_id,
                    endpoint="team_detail",
                    url=meta.url,
                    http_status=meta.status,
                    body=meta.text,
                    content_type=meta.content_type,
                    fetched_at=meta.fetched_at,
                    team_id=tid,
                )

            year = int(data.get("year") or 0)
            slug = data.get("slug")
            if data.get("wikiURL"):
                wiki_url = data["wikiURL"]
            elif slug and year >= 2021:
                wiki_url = f"https://{year}.igem.wiki/{slug}"
            elif year:
                wiki_url = f"https://{year}.igem.org/Team:{data.get('name') or slug or tid}"
            else:
                wiki_url = None

            with Session(engine) as s:
                _mark_team_phase(
                    s,
                    tid,
                    "detail",
                    fetched_at=utc_now(),
                    values={
                        "slug": slug,
                        "status": data.get("status"),
                        "wiki_url": wiki_url,
                        "institutions_json": data.get("institutions"),
                    },
                )
                s.commit()

    async with IgemApiClient(cfg) as client:
        await asyncio.gather(*[_fetch_one(client, tid) for tid in team_ids])

    log.info("Fetched details for %d teams", len(team_ids))


# ─── 4. Rosters ───────────────────────────────────────────────────────────────

async def fetch_team_rosters(
    cfg: ScraperConfig,
    team_ids: list[int],
    year: int,
    concurrency: int = 5,
    resume: bool = True,
    run_id: int | None = None,
) -> None:
    """Fetch roster for each team and upsert Person + RosterEntry rows.

    Args:
        resume: Skip teams where roster_fetched=True (default: True).
    """
    engine = get_engine(cfg)

    # Resume: filter out already-fetched teams in one bulk query
    if resume and team_ids:
        with Session(engine) as s:
            fetched = set(
                s.scalars(
                    select(Team.team_id)
                    .where(Team.team_id.in_(team_ids), Team.roster_fetched.is_(True))
                ).all()
            )
        if fetched:
            log.info("Resume: skipping %d already-rostered teams", len(fetched))
            team_ids = [tid for tid in team_ids if tid not in fetched]
    if not team_ids:
        return

    sem = asyncio.Semaphore(concurrency)

    async def _fetch_one(client: IgemApiClient, tid: int) -> None:
        async with sem:
            try:
                entries, meta = await client.get_team_roster_with_meta(tid)
            except Exception as exc:
                log.warning("Roster fetch failed for team %d: %s", tid, exc)
                with Session(engine) as s:
                    _mark_team_phase(s, tid, "roster", error=str(exc))
                    s.commit()
                return

            if run_id is not None and meta is not None:
                ResponseArchive(cfg).record(
                    run_id=run_id,
                    endpoint="team_roster",
                    url=meta.url,
                    http_status=meta.status,
                    body=meta.text,
                    content_type=meta.content_type,
                    fetched_at=meta.fetched_at,
                    team_id=tid,
                )

            fetched_at = utc_now()
            accepted_entries: dict[tuple[str, str], tuple[dict, dict]] = {}
            for entry in entries:
                if entry.get("status") not in (None, "accepted"):
                    continue
                member = entry.get("member") or {}
                member_uuid = member.get("uuid")
                if not member_uuid:
                    continue
                role_api = (entry.get("role") or "unknown").lower()
                accepted_entries[(member_uuid, role_api)] = (member, member.get("user") or {})

            _insert = get_insert(engine)
            with Session(engine) as s:
                previous_members = set(
                    s.scalars(
                        select(RosterEntry.member_uuid).where(RosterEntry.team_id == tid)
                    ).all()
                )
                # A successful response is authoritative for this team.  Delete
                # first inside the same transaction so upstream removals do not
                # survive forever as ghost memberships.
                s.execute(delete(RosterEntry).where(RosterEntry.team_id == tid))

                for (muuid, role_api), (member, user) in accepted_entries.items():
                    title = user.get("title") or ""
                    role_inferred, is_student = _infer_role(role_api, title)

                    pub_name = user.get("publicName") or member.get("username") or ""
                    inst = user.get("institution") or ""

                    # Upsert Person
                    since_val = member.get("since")
                    person_row = {
                        "member_uuid": muuid,
                        "username": member.get("username"),
                        "public_name": pub_name,
                        "public_name_norm": normalize_name(pub_name),
                        "institution": inst,
                        "title": title,
                        "affiliation": user.get("affiliation"),
                        "country": user.get("country"),
                        "igem_since": int(since_val) if since_val else None,
                        "first_seen_year": year,
                        "last_seen_year": year,
                    }
                    p_stmt = (
                        _insert(Person)
                        .values(**person_row)
                        .on_conflict_do_update(
                            index_elements=["member_uuid"],
                            set_={
                                "username": person_row["username"],
                                "public_name": person_row["public_name"],
                                "public_name_norm": person_row["public_name_norm"],
                                "institution": person_row["institution"],
                                "title": person_row["title"],
                                "affiliation": person_row["affiliation"],
                                "country": person_row["country"],
                                "igem_since": person_row["igem_since"],
                            },
                        )
                    )
                    s.execute(p_stmt)

                    re_row = {
                        "team_id": tid,
                        "year": year,
                        "member_uuid": muuid,
                        "role_api": role_api,
                        "role_inferred": role_inferred,
                        "is_student": is_student,
                        "snapshot_institution": inst,
                        "snapshot_title": title,
                        "scraped_at": fetched_at,
                    }
                    s.execute(_insert(RosterEntry).values(**re_row))

                # Recompute the derived seen range for both retained and removed
                # members after replacement.  A person with no remaining roster
                # relationship is retained as raw history but no longer exported.
                affected_members = previous_members | {
                    key[0] for key in accepted_entries
                }
                for member_uuid in affected_members:
                    year_range = s.execute(
                        select(
                            func.min(RosterEntry.year),
                            func.max(RosterEntry.year),
                        ).where(RosterEntry.member_uuid == member_uuid)
                    ).one()
                    s.execute(
                        Person.__table__.update()
                        .where(Person.member_uuid == member_uuid)
                        .values(
                            first_seen_year=year_range[0],
                            last_seen_year=year_range[1],
                        )
                    )

                _mark_team_phase(
                    s,
                    tid,
                    "roster",
                    fetched_at=fetched_at,
                )
                s.commit()

    async with IgemApiClient(cfg) as client:
        await asyncio.gather(*[_fetch_one(client, tid) for tid in team_ids])

    log.info("Fetched rosters for %d teams", len(team_ids))


# ─── 5. Team award results ──────────────────────────────────────────────────

async def fetch_team_award_results(
    cfg: ScraperConfig,
    team_ids: list[int],
    concurrency: int = 5,
    resume: bool = True,
    run_id: int | None = None,
) -> None:
    """Fetch public nominations, winners and medals for every team."""
    engine = get_engine(cfg)
    if resume and team_ids:
        with Session(engine) as s:
            fetched = set(
                s.scalars(
                    select(Team.team_id).where(
                        Team.team_id.in_(team_ids), Team.awards_fetched.is_(True)
                    )
                ).all()
            )
        team_ids = [tid for tid in team_ids if tid not in fetched]
    if not team_ids:
        return

    sem = asyncio.Semaphore(concurrency)

    async def _fetch_one(client: IgemApiClient, tid: int) -> None:
        async with sem:
            try:
                results, meta = await client.get_team_awards_with_meta(tid)
            except Exception as exc:
                log.warning("Award fetch failed for team %d: %s", tid, exc)
                with Session(engine) as s:
                    _mark_team_phase(s, tid, "awards", error=str(exc))
                    s.commit()
                return

            if run_id is not None and meta is not None:
                ResponseArchive(cfg).record(
                    run_id=run_id,
                    endpoint="team_awards",
                    url=meta.url,
                    http_status=meta.status,
                    body=meta.text,
                    content_type=meta.content_type,
                    fetched_at=meta.fetched_at,
                    team_id=tid,
                )

            _insert = get_insert(engine)
            medal = None
            fetched_at = utc_now()
            with Session(engine) as s:
                # Replace only after a successful response.  An empty response
                # is authoritative and must clear awards removed upstream.
                s.execute(
                    delete(TeamAwardResult).where(TeamAwardResult.team_id == tid)
                )
                results_by_uuid = {
                    result.get("uuid"): result
                    for result in results
                    if result.get("uuid")
                }
                for award_uuid, result in results_by_uuid.items():
                    row = {
                        "team_id": tid,
                        "award_uuid": award_uuid,
                        "title": result.get("title") or "",
                        "decision": result.get("decision") or "",
                        "group": result.get("group"),
                        "award_type": result.get("type"),
                        "award_subtype": result.get("subType"),
                        "icon_url": result.get("iconUrl") or result.get("icon"),
                        "village_uuid": result.get("villageUUID"),
                        "scraped_at": fetched_at,
                    }
                    s.execute(_insert(TeamAwardResult).values(**row))
                    if row["award_type"] == "medal" and row["decision"] == "winner":
                        medal = row["award_subtype"] or row["title"]

                _mark_team_phase(
                    s,
                    tid,
                    "awards",
                    fetched_at=fetched_at,
                    values={"medal": medal},
                )
                s.commit()

    async with IgemApiClient(cfg) as client:
        await asyncio.gather(*[_fetch_one(client, tid) for tid in team_ids])

    log.info("Fetched award results for %d teams", len(team_ids))


# ─── 6. Award catalogue ──────────────────────────────────────────────────────

async def fetch_competition_awards(
    cfg: ScraperConfig,
    competition_uuid: str,
) -> None:
    """Fetch and transactionally replace one competition's award catalogue."""
    engine = get_engine(cfg)
    async with IgemApiClient(cfg) as client:
        awards_data = await client.get_competition_awards(competition_uuid)

    _insert = get_insert(engine)
    fetched_at = utc_now()
    with Session(engine) as session:
        session.execute(
            delete(Award).where(Award.competition_uuid == competition_uuid)
        )
        for a in awards_data:
            award_uuid = a.get("uuid")
            if not award_uuid:
                continue
            row = {
                "uuid": award_uuid,
                "competition_uuid": competition_uuid,
                "title": a.get("title") or a.get("name") or "",
                "description": a.get("description"),
                "icon_url": a.get("iconUrl") or a.get("icon"),
                "award_type": a.get("type"),
                "award_subtype": a.get("subType"),
                "village_uuid": a.get("villageUUID"),
                "scraped_at": fetched_at,
            }
            session.execute(_insert(Award).values(**row))
        session.commit()

    log.info("Upserted %d awards for competition %s", len(awards_data), competition_uuid)


# ─── 7. Compute stats ────────────────────────────────────────────────────────

def compute_stats(cfg: ScraperConfig, team_ids: Optional[list[int]] = None) -> None:
    """Compute TeamStats for teams using bulk queries (O(3) SQL instead of O(N×S)).

    Algorithm:
      1. One query: all roster entries for target teams.
      2. One query: earliest year each relevant student appears globally.
      3. Python aggregation + bulk upsert.
    """
    from collections import defaultdict

    engine = get_engine(cfg)
    _insert = get_insert(engine)

    with Session(engine) as s:
        q = select(Team.team_id, Team.year).where(Team.is_listed.is_(True))
        if team_ids:
            q = q.where(Team.team_id.in_(team_ids))
        teams = s.execute(q).all()

        if not teams:
            log.info("compute_stats: no teams to process")
            return

        all_tids = [r.team_id for r in teams]
        team_year = {r.team_id: r.year for r in teams}

        # Bulk fetch all roster entries for these teams (one query)
        roster_rows = s.execute(
            select(
                RosterEntry.team_id,
                RosterEntry.member_uuid,
                RosterEntry.is_student,
            ).where(RosterEntry.team_id.in_(all_tids))
        ).all()

        # Aggregate in Python
        team_all: dict[int, int] = defaultdict(int)
        team_students: dict[int, set[str]] = defaultdict(set)
        all_student_uuids: set[str] = set()

        for r in roster_rows:
            team_all[r.team_id] += 1
            if r.is_student:
                team_students[r.team_id].add(r.member_uuid)
                all_student_uuids.add(r.member_uuid)

        # Earliest year each student appears in ANY roster (one query)
        earliest_year_by_uuid: dict[str, int] = {}
        if all_student_uuids:
            year_rows = s.execute(
                select(
                    RosterEntry.member_uuid,
                    func.min(RosterEntry.year).label("min_year"),
                )
                # Aggregate in SQL instead of passing tens of thousands of
                # member UUIDs through an IN clause (SQLite variable limit).
                .where(RosterEntry.is_student.is_(True))
                .group_by(RosterEntry.member_uuid)
            ).all()
            earliest_year_by_uuid = {r.member_uuid: r.min_year for r in year_rows}

        # Upsert stats per team
        for team in teams:
            tid = team.team_id
            yr = team_year[tid]
            students = team_students.get(tid, set())

            past_exp_count = sum(
                1 for uuid in students
                if earliest_year_by_uuid.get(uuid, yr) < yr
            )

            stat_row = {
                "team_id": tid,
                "all_member_count": team_all.get(tid, 0),
                "student_member_count": len(students),
                "student_past_experience_count": past_exp_count,
            }
            stmt = (
                _insert(TeamStats)
                .values(**stat_row)
                .on_conflict_do_update(
                    index_elements=["team_id"],
                    set_={k: v for k, v in stat_row.items() if k != "team_id"},
                )
            )
            s.execute(stmt)

        s.commit()

    log.info("Computed stats for %d teams", len(teams))


# ─── Full-year pipeline ───────────────────────────────────────────────────────

async def ingest_year(
    cfg: ScraperConfig,
    year: int,
    limit: Optional[int] = None,
    resume: bool = True,
    concurrency: int = 5,
) -> None:
    """Run full ingestion pipeline for one competition year.

    Args:
        resume: Skip already-successful teams for archived competitions.  Live
            competitions are always refreshed so resume cannot freeze a season.
        concurrency: Maximum concurrent team-detail and roster requests.
    """
    engine = get_engine(cfg)
    with Session(engine) as s:
        comp = s.execute(
            select(Competition).where(Competition.year == year)
        ).scalar_one_or_none()

    if not comp:
        raise ValueError(
            f"Competition year {year} not found in DB. Run fetch-competitions first."
        )

    is_live = (comp.status or "").lower() == "live"
    phase_resume = resume and not is_live
    log.info(
        "Ingesting year %d (uuid=%s, status=%s, resume=%s)",
        year,
        comp.uuid,
        comp.status,
        phase_resume,
    )

    archive = ResponseArchive(cfg)
    run_id = archive.start_run(f"teams:{year}")

    team_ids = await fetch_competition_teams(cfg, comp.uuid, year, run_id=run_id)
    await fetch_competition_awards(cfg, comp.uuid)

    if limit:
        team_ids = team_ids[:limit]
        log.info("Limiting to %d teams (--limit flag)", limit)

    await fetch_team_details(
        cfg, team_ids, concurrency=concurrency, resume=phase_resume, run_id=run_id
    )
    await fetch_team_rosters(
        cfg,
        team_ids,
        year,
        concurrency=concurrency,
        resume=phase_resume,
        run_id=run_id,
    )
    await fetch_team_award_results(
        cfg,
        team_ids,
        concurrency=concurrency,
        resume=phase_resume,
        run_id=run_id,
    )
    compute_stats(cfg, team_ids)
    archive.finish_run(run_id)

    log.info("Year %d ingestion complete (archive run %d)", year, run_id)
