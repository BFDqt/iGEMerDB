"""
upsert.py  —  Dialect-aware upsert helper.

Provides get_insert(engine) which returns the correct dialect-specific
insert function supporting on_conflict_do_update / on_conflict_do_nothing.

Supported: PostgreSQL, SQLite (both via SQLAlchemy 2.x dialects).
"""
from __future__ import annotations

from sqlalchemy.engine import Engine


def get_insert(engine: Engine):
    """Return the dialect-appropriate insert function."""
    name = engine.dialect.name
    if name == "postgresql":
        from sqlalchemy.dialects.postgresql import insert
    elif name == "sqlite":
        from sqlalchemy.dialects.sqlite import insert
    else:
        # Fallback: try postgresql-style, most compatible
        from sqlalchemy.dialects.postgresql import insert
    return insert
