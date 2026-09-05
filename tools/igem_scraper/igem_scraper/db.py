from __future__ import annotations

from sqlalchemy import create_engine, event, inspect, text
from sqlalchemy.engine import Engine
from sqlalchemy.orm import sessionmaker

from .models import Award, Base

# Module-level engine cache: database_url → Engine
# Prevents creating multiple engines / connection pools for the same DB.
_ENGINE_CACHE: dict[str, Engine] = {}


def create_engine_from_url(database_url: str) -> Engine:
    """Create a SQLAlchemy engine from a raw connection URL string."""
    kwargs = {"pool_pre_ping": True}
    if database_url.startswith("sqlite:"):
        kwargs["connect_args"] = {"timeout": 60}
    engine = create_engine(database_url, **kwargs)
    if database_url.startswith("sqlite:") and ":memory:" not in database_url:
        @event.listens_for(engine, "connect")
        def _configure_sqlite(dbapi_connection, _connection_record):
            cursor = dbapi_connection.cursor()
            cursor.execute("PRAGMA journal_mode=WAL")
            cursor.execute("PRAGMA synchronous=NORMAL")
            cursor.execute("PRAGMA foreign_keys=ON")
            cursor.close()
    return engine


def get_engine(cfg) -> Engine:
    """Return a cached engine for cfg.database_url (one pool per URL per process)."""
    url = cfg.database_url
    if url not in _ENGINE_CACHE:
        _ENGINE_CACHE[url] = create_engine_from_url(url)
    return _ENGINE_CACHE[url]


def create_session_factory(engine: Engine):
    return sessionmaker(bind=engine, autoflush=False, autocommit=False)


def init_db(engine: Engine) -> None:
    Base.metadata.create_all(engine)
    migrate_schema(engine)


def migrate_schema(engine: Engine) -> None:
    """Apply the small set of backwards-compatible migrations we own."""
    inspector = inspect(engine)
    if "team" in inspector.get_table_names():
        team_columns = {column["name"] for column in inspector.get_columns("team")}
        if "is_listed" not in team_columns:
            with engine.begin() as connection:
                if engine.dialect.name in ("sqlite", "postgresql"):
                    connection.exec_driver_sql(
                        "ALTER TABLE team ADD COLUMN is_listed BOOLEAN NOT NULL DEFAULT 1"
                    )
                    if engine.dialect.name == "sqlite":
                        connection.exec_driver_sql(
                            "CREATE INDEX IF NOT EXISTS ix_team_is_listed ON team (is_listed)"
                        )
                    else:
                        connection.exec_driver_sql(
                            "CREATE INDEX IF NOT EXISTS ix_team_is_listed ON team (is_listed)"
                        )
                else:
                    raise RuntimeError(
                        f"Automatic team migration is unsupported for {engine.dialect.name}"
                    )

        team_columns = {column["name"] for column in inspect(engine).get_columns("team")}
        timestamp_type = (
            "TIMESTAMP WITH TIME ZONE"
            if engine.dialect.name == "postgresql"
            else "DATETIME"
        )
        phase_columns = {
            "listed_at": timestamp_type,
            "detail_fetched_at": timestamp_type,
            "roster_fetched_at": timestamp_type,
            "awards_fetched_at": timestamp_type,
            "detail_fetch_error": "TEXT",
            "roster_fetch_error": "TEXT",
            "awards_fetch_error": "TEXT",
        }
        with engine.begin() as connection:
            for name, sql_type in phase_columns.items():
                if name not in team_columns:
                    connection.exec_driver_sql(
                        f"ALTER TABLE team ADD COLUMN {name} {sql_type}"
                    )

            # Legacy booleans did not retain when a phase last succeeded.  Use
            # the closest honest timestamp we have instead of pretending the
            # migration time was a fresh upstream fetch.
            connection.exec_driver_sql(
                "UPDATE team SET listed_at = COALESCE(listed_at, created_at) "
                "WHERE is_listed = 1"
            )
            connection.exec_driver_sql(
                "UPDATE team SET listed_at = created_at "
                "WHERE listed_at = updated_at AND created_at IS NOT NULL"
            )
            for phase in ("detail", "roster", "awards"):
                connection.exec_driver_sql(
                    f"UPDATE team SET {phase}_fetched_at = "
                    f"COALESCE({phase}_fetched_at, updated_at) "
                    f"WHERE {phase}_fetched = 1"
                )
                connection.exec_driver_sql(
                    f"UPDATE team SET {phase}_fetch_error = fetch_error "
                    f"WHERE {phase}_fetch_error IS NULL AND fetch_error IS NOT NULL"
                )

    inspector = inspect(engine)
    if "award" not in inspector.get_table_names():
        return
    primary_key = set(inspector.get_pk_constraint("award").get("constrained_columns") or [])
    expected = {"uuid", "competition_uuid"}
    if primary_key not in (expected, {"uuid"}):
        raise RuntimeError(f"Unsupported award primary key: {sorted(primary_key)}")

    if primary_key == {"uuid"} and engine.dialect.name == "sqlite":
        with engine.begin() as connection:
            connection.exec_driver_sql("ALTER TABLE award RENAME TO award_legacy")
            connection.exec_driver_sql("DROP INDEX IF EXISTS ix_award_competition_uuid")
            Award.__table__.create(connection)
            connection.exec_driver_sql(
                """
                INSERT OR IGNORE INTO award
                    (uuid, competition_uuid, title, description, icon_url, scraped_at)
                SELECT uuid, competition_uuid, title, description, icon_url,
                       CURRENT_TIMESTAMP
                FROM award_legacy
                """
            )
            connection.exec_driver_sql("DROP TABLE award_legacy")
    elif primary_key == {"uuid"} and engine.dialect.name == "postgresql":
        constraint_name = inspector.get_pk_constraint("award").get("name") or "award_pkey"
        with engine.begin() as connection:
            connection.execute(
                text(f'ALTER TABLE award DROP CONSTRAINT "{constraint_name}"')
            )
            connection.exec_driver_sql(
                "ALTER TABLE award ADD PRIMARY KEY (uuid, competition_uuid)"
            )
    elif primary_key == {"uuid"}:
        raise RuntimeError(
            f"Automatic award-key migration is unsupported for {engine.dialect.name}"
        )

    inspector = inspect(engine)
    award_columns = {column["name"] for column in inspector.get_columns("award")}
    optional_columns = {
        "award_type": "VARCHAR(32)",
        "award_subtype": "VARCHAR(64)",
        "village_uuid": "VARCHAR(64)",
        "scraped_at": (
            "TIMESTAMP WITH TIME ZONE"
            if engine.dialect.name == "postgresql"
            else "DATETIME"
        ),
    }
    with engine.begin() as connection:
        for name, sql_type in optional_columns.items():
            if name not in award_columns:
                connection.exec_driver_sql(
                    f"ALTER TABLE award ADD COLUMN {name} {sql_type}"
                )
        connection.exec_driver_sql(
            "UPDATE award SET scraped_at = CURRENT_TIMESTAMP WHERE scraped_at IS NULL"
        )
    inspector = inspect(engine)
    if "team_award_result" in inspector.get_table_names():
        result_columns = {
            column["name"] for column in inspector.get_columns("team_award_result")
        }
        with engine.begin() as connection:
            if "scraped_at" not in result_columns:
                timestamp_type = (
                    "TIMESTAMP WITH TIME ZONE"
                    if engine.dialect.name == "postgresql"
                    else "DATETIME"
                )
                connection.exec_driver_sql(
                    "ALTER TABLE team_award_result ADD COLUMN "
                    f"scraped_at {timestamp_type}"
                )
            connection.exec_driver_sql(
                "UPDATE team_award_result SET scraped_at = CURRENT_TIMESTAMP "
                "WHERE scraped_at IS NULL"
            )

