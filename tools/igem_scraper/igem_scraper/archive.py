"""Scrape archive — persist every upstream response so any published row can
be traced back to, and replayed from, its source payload.

A run groups the responses of one ingestion command. Each response is stored
gzip-compressed together with its URL, HTTP status, content type, SHA-256 and
the entity ids it belongs to. ``latest_payload`` answers the phase-1
completion criterion: any displayed record can locate and replay the
response it came from.
"""

from __future__ import annotations

import gzip
import hashlib
from datetime import datetime, timezone

from sqlalchemy import desc, select
from sqlalchemy.orm import Session as OrmSession

from .db import get_engine
from .models import RawResponse, ScrapeRun


class ResponseArchive:
    """Record upstream responses grouped into runs."""

    def __init__(self, cfg) -> None:
        self._cfg = cfg

    def start_run(self, kind: str) -> int:
        engine = get_engine(self._cfg)
        with OrmSession(engine) as session:
            run = ScrapeRun(kind=kind, status="open")
            session.add(run)
            session.commit()
            return int(run.id)

    def finish_run(self, run_id: int) -> None:
        engine = get_engine(self._cfg)
        with OrmSession(engine) as session:
            run = session.get(ScrapeRun, run_id)
            if run is not None:
                run.status = "complete"
                run.finished_at = datetime.now(timezone.utc)
                session.commit()

    def record(
        self,
        run_id: int,
        *,
        endpoint: str,
        url: str,
        http_status: int,
        body: str | bytes,
        content_type: str | None = None,
        team_id: int | None = None,
        competition_uuid: str | None = None,
        fetched_at: datetime | None = None,
    ) -> None:
        if isinstance(body, str):
            body = body.encode("utf-8")
        engine = get_engine(self._cfg)
        with OrmSession(engine) as session:
            session.add(
                RawResponse(
                    run_id=run_id,
                    endpoint=endpoint,
                    url=url,
                    http_status=http_status,
                    content_type=content_type,
                    fetched_at=fetched_at or datetime.now(timezone.utc),
                    sha256=hashlib.sha256(body).hexdigest(),
                    payload=gzip.compress(body),
                    team_id=team_id,
                    competition_uuid=competition_uuid,
                )
            )
            run = session.get(ScrapeRun, run_id)
            if run is not None:
                run.response_count = (run.response_count or 0) + 1
            session.commit()


def latest_payload(
    cfg,
    endpoint: str,
    *,
    team_id: int | None = None,
    competition_uuid: str | None = None,
) -> dict | None:
    """Return the newest archived response for an entity, decompressed.

    This is the replay primitive behind ``cli.py replay``: the returned
    mapping is the upstream payload a published row was built from.
    """
    engine = get_engine(cfg)
    with OrmSession(engine) as session:
        statement = (
            select(RawResponse)
            .where(RawResponse.endpoint == endpoint)
        )
        if team_id is not None:
            statement = statement.where(RawResponse.team_id == team_id)
        if competition_uuid is not None:
            statement = statement.where(
                RawResponse.competition_uuid == competition_uuid
            )
        row = session.scalar(statement.order_by(desc(RawResponse.id)).limit(1))
        if row is None:
            return None
        return {
            "id": row.id,
            "run_id": row.run_id,
            "endpoint": row.endpoint,
            "url": row.url,
            "http_status": row.http_status,
            "content_type": row.content_type,
            "fetched_at": row.fetched_at.isoformat() if row.fetched_at else None,
            "sha256": row.sha256,
            "team_id": row.team_id,
            "competition_uuid": row.competition_uuid,
            "payload": json_loads(gzip.decompress(row.payload)),
        }


def json_loads(body: bytes):
    import json

    return json.loads(body.decode("utf-8"))
