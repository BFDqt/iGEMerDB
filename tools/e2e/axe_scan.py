"""Strict axe-core accessibility scan across every application route.

The scan injects the local axe-core bundle, runs ALL rules with the full
WCAG 2.1 A/AA tag set on every route at desktop and mobile widths, and
fails on any violation. Machine-readable evidence lands in
output/e2e/axe.json. Genuine false positives must be documented in the
DISABLED_RULES list below with a reason, never silently ignored.
"""

from __future__ import annotations

import json
import os
from pathlib import Path

from playwright.sync_api import Page, sync_playwright

BASE_URL = os.getenv("BASE_URL", "http://127.0.0.1:4173").rstrip("/")
ROOT = Path(__file__).resolve().parents[2]
AXE_SOURCE = ROOT / "node_modules" / "axe-core" / "axe.min.js"
OUTPUT = ROOT / "output" / "e2e" / "axe.json"

SNAPSHOT = json.loads(
    (ROOT / "public" / "data" / "igem.json").read_text(encoding="utf-8")
)
VISIBLE_TEAM_IDS = {
    team["id"] for team in SNAPSHOT["teams"] if team.get("default_visible", True)
}

# Every route the SPA serves. Parameterised ids are resolved from the
# published snapshot so the scan survives data refreshes.
def build_routes() -> list[tuple[str, str]]:
    routes = [
        ("/", "home"),
        ("/teams", "teams"),
        ("/people", "people"),
        ("/institutions", "institutions"),
        ("/competition?year=2025", "competition-2025"),
        ("/awards?year=2025&decision=winner", "awards-2025-winners"),
        ("/about", "about"),
        ("/record-that-does-not-exist", "not-found"),
    ]
    team = next(t for t in SNAPSHOT["teams"] if t["id"] == 5587)
    routes.append((f"/teams/{team['id']}", "team-detail"))

    membership_counts: dict[str, int] = {}
    for entry in SNAPSHOT["roster"]:
        if entry["team_id"] in VISIBLE_TEAM_IDS:
            membership_counts[entry["member_uuid"]] = (
                membership_counts.get(entry["member_uuid"], 0) + 1
            )
    person_uuid = sorted(membership_counts.items(), key=lambda item: (-item[1], item[0]))[0][0]
    routes.append((f"/people/{person_uuid}", "person-detail"))

    institution_teams: dict[str, int] = {}
    for team in SNAPSHOT["teams"]:
        if team["id"] not in VISIBLE_TEAM_IDS:
            continue
        for item in team.get("institutions") or []:
            if item.get("name"):
                institution_teams[item["name"]] = (
                    institution_teams.get(item["name"], 0) + 1
                )
    institution_name = sorted(
        institution_teams.items(), key=lambda item: (-item[1], item[0])
    )[0][0]
    from urllib.parse import quote

    routes.append((f"/institutions/{quote(institution_name)}", "institution-detail"))
    return routes


VIEWPORTS = {
    "desktop-1440": {"width": 1440, "height": 1000},
    "mobile-390": {"width": 390, "height": 844},
}


def run_axe(page: Page, path: str) -> dict:
    page.goto(f"{BASE_URL}{path}", wait_until="domcontentloaded", timeout=60_000)
    page.wait_for_load_state("networkidle", timeout=60_000)
    page.locator("#main-content h1").first.wait_for(state="visible", timeout=60_000)
    page.add_script_tag(content=AXE_SOURCE.read_text(encoding="utf-8"))
    return page.evaluate(
        """async () => {
          const axe = window.axe;
          axe.reset();
          return await axe.run(document, {
            runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] },
            resultTypes: ['violations'],
          });
        }"""
    )


def main() -> None:
    routes = build_routes()
    evidence: dict[str, object] = {
        "baseUrl": BASE_URL,
        "engine": "axe-core",
        "tags": ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"],
        "strictMode": True,
        "scans": [],
    }
    failures: list[str] = []

    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(headless=True)
        for viewport_name, viewport in VIEWPORTS.items():
            context = browser.new_context(viewport=viewport)
            page = context.new_page()
            for path, name in routes:
                result = run_axe(page, path)
                violations = [
                    {
                        "id": violation["id"],
                        "impact": violation.get("impact"),
                        "help": violation["help"],
                        "nodes": len(violation["nodes"]),
                    }
                    for violation in result["violations"]
                ]
                evidence["scans"].append(
                    {
                        "viewport": viewport_name,
                        "route": path,
                        "name": name,
                        "violations": violations,
                        "passes": len(result.get("passes", [])),
                    }
                )
                for violation in result["violations"]:
                    failures.append(
                        f"[{viewport_name}] {path}: {violation['id']} "
                        f"({violation.get('impact')}) x{len(violation['nodes'])} — {violation['help']}"
                    )
            context.close()
        browser.close()

    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT.write_text(
        json.dumps(evidence, ensure_ascii=False, indent=2), encoding="utf-8"
    )

    if failures:
        raise AssertionError(
            f"axe found {len(failures)} violations:\n" + "\n".join(failures)
        )
    print(
        f"axe strict scan passed: {len(evidence['scans'])} scans, "
        "0 violations (evidence: output/e2e/axe.json)."
    )


if __name__ == "__main__":
    main()
