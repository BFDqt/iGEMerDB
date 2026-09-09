from __future__ import annotations

import asyncio
import logging
from pathlib import Path

import typer
from rich.console import Console

from igem_scraper.config import load_config
from igem_scraper.logging_ import setup_logging
from igem_scraper.db import get_engine, init_db
from igem_scraper.team_ingest import (
    fetch_competition_awards,
    fetch_competitions,
    ingest_year,
    compute_stats,
    recompute_roster_roles,
)
from igem_scraper.export_raw import export_frontend_raw
from igem_scraper.validate import validate_database, validate_export
from igem_scraper.archive import ResponseArchive, latest_payload, list_runs

app = typer.Typer(add_completion=False, help="iGEM api.igem.org scraper")
console = Console()


@app.callback()
def main(verbose: bool = typer.Option(False, "--verbose", "-v")):
    setup_logging(verbose)


@app.command("init-db")
def init_db_cmd():
    """Create all database tables (idempotent)."""
    cfg = load_config()
    engine = get_engine(cfg)
    init_db(engine)
    console.print("[green]DB schema initialized[/green]")


@app.command("fetch-competitions")
def fetch_competitions_cmd():
    """Fetch all competition years from the API and upsert into DB."""
    cfg = load_config()
    archive = ResponseArchive(cfg)
    run_id = archive.start_run("competitions")
    comps = asyncio.run(fetch_competitions(cfg, run_id=run_id))
    archive.finish_run(run_id)
    for c in sorted(comps, key=lambda x: x["year"]):
        console.print(f"  {c['year']}  {c['uuid']}")
    console.print(f"[green]Upserted {len(comps)} competitions[/green]")


@app.command("fetch-awards")
def fetch_awards_cmd():
    """Refresh the award catalogue for every iGEM competition year."""
    cfg = load_config()
    engine = get_engine(cfg)
    init_db(engine)
    archive = ResponseArchive(cfg)
    run_id = archive.start_run("awards")
    competitions = asyncio.run(fetch_competitions(cfg))
    for competition in sorted(competitions, key=lambda item: item["year"]):
        console.print(f"  → awards {competition['year']} …")
        asyncio.run(
            fetch_competition_awards(cfg, competition["uuid"], run_id=run_id)
        )
    archive.finish_run(run_id)
    console.print("[green]Award catalogues refreshed[/green]")


@app.command("fetch-teams")
def fetch_teams_cmd(
    year: int = typer.Argument(..., help="Competition year (e.g. 2024)"),
    limit: int = typer.Option(0, help="Limit number of teams per year (0=all, useful for testing)"),
    concurrency: int = typer.Option(5, min=1, max=20, help="Concurrent API requests"),
    no_resume: bool = typer.Option(
        False,
        "--no-resume",
        help="Re-fetch archived teams too (live years always refresh)",
    ),
):
    """Fetch teams, rosters, and awards for one competition year."""
    cfg = load_config()
    asyncio.run(
        ingest_year(
            cfg,
            year,
            limit=limit or None,
            resume=not no_resume,
            concurrency=concurrency,
        )
    )
    console.print(f"[green]Year {year} ingestion complete[/green]")


@app.command("fetch-all")
def fetch_all_cmd(
    start_year: int = typer.Option(None, help="First year to fetch"),
    end_year: int = typer.Option(None, help="Last year to fetch"),
    limit: int = typer.Option(0, help="Limit teams per year (0=all)"),
    concurrency: int = typer.Option(5, min=1, max=20, help="Concurrent API requests"),
    no_resume: bool = typer.Option(
        False,
        "--no-resume",
        help="Re-fetch archived teams too (live years always refresh)",
    ),
):
    """Fetch competitions then ingest all years in range."""
    cfg = load_config()
    comps = asyncio.run(fetch_competitions(cfg))
    start = start_year or cfg.start_year
    end = end_year or cfg.end_year
    years = sorted(c["year"] for c in comps if start <= c["year"] <= end)
    if not years:
        raise typer.BadParameter(
            f"No competition years found between {start} and {end}."
        )
    console.print(f"Ingesting {len(years)} years: {years[0]}–{years[-1]}")
    for yr in years:
        console.print(f"  → {yr} …")
        asyncio.run(
            ingest_year(
                cfg,
                yr,
                limit=limit or None,
                resume=not no_resume,
                concurrency=concurrency,
            )
        )
    console.print("[green]All years complete[/green]")


@app.command("compute-stats")
def compute_stats_cmd():
    """(Re-)compute TeamStats for all teams."""
    cfg = load_config()
    compute_stats(cfg)
    console.print("[green]Stats computed[/green]")


@app.command("repair-roles")
def repair_roles_cmd():
    """Re-apply role inference and rebuild team member statistics."""
    cfg = load_config()
    count = recompute_roster_roles(cfg)
    console.print(f"[green]Recomputed {count} roster roles and team stats[/green]")


@app.command("export-raw")
def export_raw_cmd(
    out: Path = typer.Option(Path("data/raw_export.json"), help="Output JSON path"),
):
    """Export full DB snapshot as frontend-compatible raw JSON."""
    cfg = load_config()
    export_frontend_raw(cfg, out)
    console.print(f"[green]Exported → {out}[/green]")


@app.command("validate")
def validate_cmd(
    export: Path | None = typer.Option(
        None, "--export", help="Also validate an exported frontend JSON"
    ),
):
    """Fail if the current database is not a complete publishable snapshot."""
    cfg = load_config()
    report = validate_database(cfg)
    console.print(
        f"competitions={report.competition_count} teams={report.team_count} "
        f"roster={report.roster_count} team_awards={report.team_award_count}"
    )
    issues = list(report.issues)
    if export is not None:
        issues.extend(validate_export(export))
        console.print(f"export={export}")
    if issues:
        for issue in issues:
            console.print(f"[red]  - {issue}[/red]")
        raise typer.Exit(code=1)
    console.print("[green]Database integrity, status, and freshness gates passed[/green]")


@app.command("validate-export")
def validate_export_cmd(
    export: Path = typer.Argument(..., help="Frontend JSON snapshot to validate"),
    ignore_stale_live: bool = typer.Option(
        False,
        "--ignore-stale-live",
        help="Skip live-year freshness findings (pull-request pipelines only; "
        "default-branch pushes must always run the full gate).",
    ),
):
    """Validate a publishable JSON snapshot without requiring the working DB."""
    issues = validate_export(export, ignore_stale_live=ignore_stale_live)
    if issues:
        for issue in issues:
            console.print(f"[red]  - {issue}[/red]")
        raise typer.Exit(code=1)
    console.print(f"[green]Export integrity, status, and freshness gates passed: {export}[/green]")


@app.command("runs")
def runs_cmd():
    """List recent archive runs (newest first) for inspection."""
    cfg = load_config()
    for run in list_runs(cfg):
        console.print(
            f"run={run['id']} kind={run['kind']} status={run['status']} "
            f"responses={run['response_count']} "
            f"started={run['started_at']} finished={run['finished_at']}"
        )


@app.command("replay")
def replay_cmd(
    endpoint: str = typer.Argument(
        ...,
        help="Archived endpoint, e.g. team_detail | team_roster | team_awards",
    ),
    team_id: int = typer.Option(None, "--team-id", help="Entity id to replay"),
    competition_uuid: str = typer.Option(
        None, "--competition-uuid", help="Competition-scoped endpoint to replay"
    ),
):
    """Replay the newest archived upstream response for one entity."""
    cfg = load_config()
    payload = latest_payload(
        cfg,
        endpoint,
        team_id=team_id,
        competition_uuid=competition_uuid,
    )
    if payload is None:
        console.print("[red]No archived response matches that entity.[/red]")
        raise typer.Exit(code=1)
    console.print(
        f"run={payload['run_id']} endpoint={payload['endpoint']} "
        f"url={payload['url']} status={payload['http_status']} "
        f"sha256={payload['sha256']}"
    )
    import json

    console.print_json(json.dumps(payload["payload"], ensure_ascii=False))


if __name__ == "__main__":
    app()
