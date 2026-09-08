from __future__ import annotations

from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column
from sqlalchemy import String, Integer, Boolean, DateTime, Text, ForeignKey, UniqueConstraint, Index, JSON, LargeBinary
from datetime import datetime, timezone


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


class Base(DeclarativeBase):
    pass


# ─── Competition (year ↔ UUID) ──────────────────────────────────────────────────

class Competition(Base):
    """One row per iGEM competition year.  Provides the stable UUID used in all API calls."""
    __tablename__ = "competition"

    uuid: Mapped[str] = mapped_column(String(64), primary_key=True)
    year: Mapped[int] = mapped_column(Integer, unique=True, index=True)
    wiki_slug: Mapped[str | None] = mapped_column(String(32), nullable=True)
    status: Mapped[str | None] = mapped_column(String(32), nullable=True)
    fetched_at: Mapped[datetime] = mapped_column(DateTime, default=utc_now)


class Team(Base):
    """One row per team per competition year (using the team_id from API)."""
    __tablename__ = "team"

    team_id: Mapped[int] = mapped_column(Integer, primary_key=True)
    year: Mapped[int] = mapped_column(Integer, index=True)
    competition_uuid: Mapped[str] = mapped_column(String(64), ForeignKey("competition.uuid"), index=True)
    name: Mapped[str] = mapped_column(String(256))
    name_norm: Mapped[str] = mapped_column(String(256), index=True)
    is_listed: Mapped[bool] = mapped_column(Boolean, default=True, index=True)
    slug: Mapped[str | None] = mapped_column(String(256), nullable=True)
    status: Mapped[str | None] = mapped_column(String(32), nullable=True)
    region: Mapped[str | None] = mapped_column(String(64), nullable=True)
    country: Mapped[str | None] = mapped_column(String(8), nullable=True)
    city: Mapped[str | None] = mapped_column(String(128), nullable=True)
    section: Mapped[str | None] = mapped_column(String(64), nullable=True)
    organiser_type: Mapped[str | None] = mapped_column(String(64), nullable=True)
    program: Mapped[str | None] = mapped_column(String(64), nullable=True)
    village_uuid: Mapped[str | None] = mapped_column(String(64), nullable=True)
    is_remote: Mapped[bool | None] = mapped_column(Boolean, nullable=True)
    wiki_url: Mapped[str | None] = mapped_column(String(512), nullable=True)
    medal: Mapped[str | None] = mapped_column(String(32), nullable=True)
    institutions_json: Mapped[list | None] = mapped_column(JSON, nullable=True)
    detail_fetched: Mapped[bool] = mapped_column(Boolean, default=False)
    roster_fetched: Mapped[bool] = mapped_column(Boolean, default=False)
    awards_fetched: Mapped[bool] = mapped_column(Boolean, default=False)
    # A boolean only says that a phase succeeded once.  The timestamps make the
    # claim auditable and let publication validation reject a stale live year.
    listed_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    detail_fetched_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    roster_fetched_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    awards_fetched_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    detail_fetch_error: Mapped[str | None] = mapped_column(Text, nullable=True)
    roster_fetch_error: Mapped[str | None] = mapped_column(Text, nullable=True)
    awards_fetch_error: Mapped[str | None] = mapped_column(Text, nullable=True)
    fetch_error: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utc_now)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=utc_now, onupdate=utc_now)


class CanonicalTeam(Base):
    """Cross-year same-name team grouping."""
    __tablename__ = "canonical_team"

    canonical_id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    name_norm: Mapped[str] = mapped_column(String(256), unique=True)
    display_name: Mapped[str] = mapped_column(String(256))
    needs_review: Mapped[bool] = mapped_column(Boolean, default=False)


class TeamCanonicalMap(Base):
    __tablename__ = "team_canonical_map"

    team_id: Mapped[int] = mapped_column(Integer, ForeignKey("team.team_id"), primary_key=True)
    canonical_id: Mapped[int] = mapped_column(Integer, ForeignKey("canonical_team.canonical_id"), index=True)


class Person(Base):
    """Unique iGEM participant, keyed by official member UUID from API."""
    __tablename__ = "person"

    member_uuid: Mapped[str] = mapped_column(String(64), primary_key=True)
    username: Mapped[str | None] = mapped_column(String(128), nullable=True, index=True)
    public_name: Mapped[str] = mapped_column(String(256))
    public_name_norm: Mapped[str] = mapped_column(String(256), index=True)
    institution: Mapped[str | None] = mapped_column(String(512), nullable=True)
    title: Mapped[str | None] = mapped_column(String(128), nullable=True)
    affiliation: Mapped[str | None] = mapped_column(String(128), nullable=True)
    country: Mapped[str | None] = mapped_column(String(8), nullable=True)
    igem_since: Mapped[int | None] = mapped_column(Integer, nullable=True)
    first_seen_year: Mapped[int | None] = mapped_column(Integer, nullable=True)
    last_seen_year: Mapped[int | None] = mapped_column(Integer, nullable=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=utc_now, onupdate=utc_now)


class RosterEntry(Base):
    """One roster membership record: a person in a team for a given year."""
    __tablename__ = "roster_entry"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    team_id: Mapped[int] = mapped_column(Integer, ForeignKey("team.team_id"), index=True)
    year: Mapped[int] = mapped_column(Integer, index=True)
    member_uuid: Mapped[str] = mapped_column(String(64), ForeignKey("person.member_uuid"), index=True)
    role_api: Mapped[str] = mapped_column(String(32))   # raw value from API: student/pi/instructor/advisor
    # Student is deliberately neutral.  Undergrad/Graduate are emitted only
    # when an explicit profile title supports that education level.
    role_inferred: Mapped[str] = mapped_column(String(32))  # PI/Advisor/Student/Undergrad/Graduate/Other
    is_student: Mapped[bool] = mapped_column(Boolean, default=False, index=True)
    snapshot_institution: Mapped[str | None] = mapped_column(String(512), nullable=True)
    snapshot_title: Mapped[str | None] = mapped_column(String(128), nullable=True)
    scraped_at: Mapped[datetime] = mapped_column(DateTime, default=utc_now)

    __table_args__ = (
        UniqueConstraint("team_id", "member_uuid", "role_api", name="uq_roster_entry"),
        Index("ix_roster_person_year", "member_uuid", "year"),
    )


class Award(Base):
    """Award category for a competition year (from competitions/{uuid}/awards)."""
    __tablename__ = "award"

    uuid: Mapped[str] = mapped_column(String(64), primary_key=True)
    competition_uuid: Mapped[str] = mapped_column(
        String(64), ForeignKey("competition.uuid"), primary_key=True, index=True
    )
    title: Mapped[str] = mapped_column(String(256))
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    icon_url: Mapped[str | None] = mapped_column(String(512), nullable=True)
    award_type: Mapped[str | None] = mapped_column(String(32), nullable=True)
    award_subtype: Mapped[str | None] = mapped_column(String(64), nullable=True)
    village_uuid: Mapped[str | None] = mapped_column(String(64), nullable=True)
    scraped_at: Mapped[datetime] = mapped_column(DateTime, default=utc_now)


class TeamAwardResult(Base):
    """One public award decision attached to a team (winner, nominee or medal)."""
    __tablename__ = "team_award_result"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    team_id: Mapped[int] = mapped_column(Integer, ForeignKey("team.team_id"), index=True)
    award_uuid: Mapped[str] = mapped_column(String(64), index=True)
    title: Mapped[str] = mapped_column(String(256))
    decision: Mapped[str] = mapped_column(String(32))
    group: Mapped[str | None] = mapped_column(String(64), nullable=True)
    award_type: Mapped[str | None] = mapped_column(String(32), nullable=True)
    award_subtype: Mapped[str | None] = mapped_column(String(64), nullable=True)
    icon_url: Mapped[str | None] = mapped_column(String(512), nullable=True)
    village_uuid: Mapped[str | None] = mapped_column(String(64), nullable=True)
    scraped_at: Mapped[datetime] = mapped_column(DateTime, default=utc_now)

    __table_args__ = (
        UniqueConstraint("team_id", "award_uuid", name="uq_team_award_result"),
    )


class TeamStats(Base):
    """Pre-computed statistics per team (student count, past-experience count)."""
    __tablename__ = "team_stats"

    team_id: Mapped[int] = mapped_column(Integer, ForeignKey("team.team_id"), primary_key=True)
    all_member_count: Mapped[int] = mapped_column(Integer, default=0)
    student_member_count: Mapped[int] = mapped_column(Integer, default=0)
    student_past_experience_count: Mapped[int] = mapped_column(Integer, default=0)
    computed_at: Mapped[datetime] = mapped_column(DateTime, default=utc_now)


# ─── Replayable scrape archive (phase 1) ────────────────────────────────────────


class ScrapeRun(Base):
    """One ingestion session whose raw responses are archived for replay."""

    __tablename__ = "scrape_run"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    kind: Mapped[str] = mapped_column(String(64))  # e.g. "teams:2026"
    started_at: Mapped[datetime] = mapped_column(DateTime, default=utc_now)
    finished_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    status: Mapped[str] = mapped_column(String(16), default="open")  # open|complete
    response_count: Mapped[int] = mapped_column(Integer, default=0)


class RawResponse(Base):
    """An archived upstream response: the source of truth a display row can
    point back to and replay byte-for-byte."""

    __tablename__ = "raw_response"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    run_id: Mapped[int] = mapped_column(ForeignKey("scrape_run.id"), index=True)
    endpoint: Mapped[str] = mapped_column(String(128), index=True)  # e.g. team_roster
    url: Mapped[str] = mapped_column(Text)
    http_status: Mapped[int] = mapped_column(Integer)
    content_type: Mapped[str | None] = mapped_column(String(128), nullable=True)
    fetched_at: Mapped[datetime] = mapped_column(DateTime, default=utc_now)
    sha256: Mapped[str] = mapped_column(String(64))
    # gzip-compressed response body; replay = decompress + json.loads
    payload: Mapped[bytes] = mapped_column(LargeBinary)
    team_id: Mapped[int | None] = mapped_column(Integer, nullable=True, index=True)
    competition_uuid: Mapped[str | None] = mapped_column(
        String(64), nullable=True, index=True
    )

    __table_args__ = (
        Index("ix_raw_response_lookup", "endpoint", "team_id", "id"),
    )
