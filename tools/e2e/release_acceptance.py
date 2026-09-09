"""Quantitative product acceptance against the gzip production build."""

from __future__ import annotations

import gzip
import json
import os
from pathlib import Path
import re
import time
import unicodedata

from playwright.sync_api import Page, expect, sync_playwright


BASE_URL = os.getenv("BASE_URL", "http://127.0.0.1:43180").rstrip("/")
ROOT = Path(__file__).resolve().parents[2]
OUTPUT = ROOT / "output" / "final-product"
SNAPSHOT = json.loads(
    (ROOT / "public" / "data" / "igem.json").read_text(encoding="utf-8")
)
CORE = json.loads(
    (ROOT / "public" / "data" / "web" / "core.json").read_text(encoding="utf-8")
)
VISIBLE_TEAMS = [
    team for team in SNAPSHOT["teams"] if team.get("default_visible", True)
]
RAW_TEAMS = SNAPSHOT["teams"]
STATUS_COUNTS = {
    status: sum(team.get("status") == status for team in RAW_TEAMS)
    for status in {team.get("status") for team in RAW_TEAMS}
}

def pick_showcase_team(snapshot: dict) -> dict:
    """Deterministically pick a visible gold-medal winner (Best Wiki first).

    Never hardcodes a team id: upstream can retire any given team at any
    time; the showcase assertions derive from the picked team's own results.
    """
    visible = {t["id"]: t for t in snapshot["teams"] if t.get("default_visible", True)}
    best_wiki: list[dict] = []
    gold: list[dict] = []
    seen: set[int] = set()
    for result in snapshot.get("team_awards", []):
        team = visible.get(result["team_id"])
        if team is None or result.get("decision") != "winner":
            continue
        if result.get("award_type") != "medal" or result.get("award_subtype") != "gold":
            continue
        if team["id"] not in visible:
            continue
        title = (result.get("title") or "").lower()
        if team["id"] not in seen:
            seen.add(team["id"])
            gold.append(team)
        if "best wiki" in title:
            best_wiki.append(team)
    candidates = sorted(best_wiki or gold, key=lambda t: t["id"])
    if not candidates:
        raise RuntimeError("no visible gold-medal team found for e2e fixtures")
    return candidates[0]


SHOWCASE = pick_showcase_team(SNAPSHOT)


INVALID_INSTITUTION_NAMES = {
    "college",
    "company",
    "high school",
    "highschool",
    "igem",
    "independent",
    "individual",
    "institute",
    "institution",
    "n a",
    "na",
    "nan",
    "nil",
    "no",
    "none",
    "not applicable",
    "not available",
    "null",
    "school",
    "student",
    "student team",
    "team",
    "undefined",
    "university",
    "unknown",
    "个人",
    "公司",
    "学生",
    "学校",
    "高中",
    "脱产",
}


def normalize_text(value: str | None) -> str:
    """Mirror src/app/data.ts normalizeText()."""
    text = unicodedata.normalize("NFKD", value or "")
    text = "".join(ch for ch in text if not unicodedata.combining(ch))
    text = text.lower()
    text = re.sub(r"[_\u2013\u2014-]+", " ", text)
    text = re.sub(r"[^\w]+|_", " ", text, flags=re.UNICODE)
    return text.strip()


def is_meaningful_institution_name(value: str) -> bool:
    """Mirror src/app/data.ts isMeaningfulInstitutionName()."""
    normalized = normalize_text(value)
    if not normalized or normalized in INVALID_INSTITUTION_NAMES:
        return False
    if not any(ch.isalpha() for ch in normalized):
        return False
    if "igem" in normalized and "igem foundation" not in normalized:
        return False
    semantic = [
        token
        for token in normalized.split(" ")
        if token != "igem" and not re.fullmatch(r"\d{4}", token)
    ]
    return bool(semantic) and " ".join(semantic) not in INVALID_INSTITUTION_NAMES


def institution_input(item: dict) -> dict | None:
    """Mirror src/app/data.ts institutionInput()."""
    raw_id = item.get("id", item.get("uuid"))
    name = (item.get("name") or "").strip() or (
        "" if raw_id is None else str(raw_id).strip()
    )
    name = re.sub(r"^[\s.,;:|/\\-]+|[\s.,;:|/\\-]+$", "", name).strip()
    if not is_meaningful_institution_name(name):
        return None
    return {
        "id": "" if raw_id is None else str(raw_id).strip(),
        "name": name,
        "country": (item.get("country") or "").strip().upper(),
        "city": item.get("city") or "",
    }


def visible_institution_count() -> int:
    """Mirror the frontend official-institution entity rules on core.json."""
    entities: list[dict] = []
    by_id: dict[str, dict] = {}
    by_name_country: dict[str, dict | None] = {}
    by_name: dict[str, dict | None] = {}
    fallback_by_identity: dict[str, dict] = {}

    def index_unique(index, key: str, entity: dict) -> None:
        if not key:
            return
        if key not in index:
            index[key] = entity
        elif index[key] is not entity:
            index[key] = None

    def register(item: dict) -> dict | None:
        normalized = institution_input(item)
        if normalized is None:
            return None
        explicit_id = normalized["id"]
        name_key = normalize_text(normalized["name"])
        name_country_key = f"{normalized['country'] or 'unknown'}\x00{name_key}"
        if explicit_id:
            existing = by_id.get(explicit_id)
            if existing is not None:
                return existing
        else:
            country_match = by_name_country.get(name_country_key)
            if country_match is not None:
                return country_match
            if not normalized["country"]:
                unique_match = by_name.get(name_key)
                if unique_match is not None:
                    return unique_match
            fallback_match = fallback_by_identity.get(name_country_key)
            if fallback_match is not None:
                return fallback_match

        entity = {"teams": []}
        entities.append(entity)
        if explicit_id:
            by_id[explicit_id] = entity
        else:
            fallback_by_identity[name_country_key] = entity
        index_unique(by_name_country, name_country_key, entity)
        index_unique(by_name, name_key, entity)
        return entity

    for item in CORE.get("institutions") or []:
        register(item)
    for team in CORE.get("teams") or []:
        if not team.get("default_visible", True):
            continue
        for item in team.get("institutions") or []:
            if not item.get("name") and not item.get("id") and not item.get("uuid"):
                continue
            entity = register(item)
            if entity is None:
                continue
            if team["id"] not in entity["teams"]:
                entity["teams"].append(team["id"])
    return sum(1 for entity in entities if entity["teams"])


def attach_diagnostics(page: Page, issues: list[str]) -> None:
    page.on(
        "console",
        lambda message: issues.append(f"console {message.type}: {message.text}")
        if message.type in {"error", "warning"}
        else None,
    )
    page.on("pageerror", lambda error: issues.append(f"page error: {error}"))
    page.on(
        "requestfailed",
        lambda request: issues.append(
            f"request failed: {request.method} {request.url} ({request.failure})"
        ),
    )


def apply_slow_profile(context, page: Page) -> None:
    session = context.new_cdp_session(page)
    session.send("Network.enable")
    session.send(
        "Network.emulateNetworkConditions",
        {
            "offline": False,
            "latency": 150,
            "downloadThroughput": 512 * 1024,
            "uploadThroughput": 256 * 1024,
            "connectionType": "cellular4g",
        },
    )
    session.send("Emulation.setCPUThrottlingRate", {"rate": 4})


def navigate_to_heading(page: Page, path: str, name: str, timeout: int = 60_000) -> int:
    started = time.perf_counter()
    page.goto(f"{BASE_URL}{path}", wait_until="domcontentloaded", timeout=timeout)
    page.get_by_role("heading", name=name, exact=True).wait_for(
        state="visible", timeout=timeout
    )
    return round((time.perf_counter() - started) * 1000)


def resource_entries(page: Page) -> list[dict[str, object]]:
    return page.evaluate(
        """() => performance.getEntriesByType('resource').map((entry) => ({
          name: entry.name,
          encodedBodySize: entry.encodedBodySize,
          decodedBodySize: entry.decodedBodySize,
          duration: Math.round(entry.duration),
        }))"""
    )


def no_overflow(page: Page) -> bool:
    return page.evaluate(
        "document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1"
    )


def run_slow_route(browser, path: str, heading: str) -> dict[str, object]:
    context = browser.new_context(viewport={"width": 1440, "height": 1000})
    page = context.new_page()
    apply_slow_profile(context, page)
    requested: list[str] = []
    page.on("request", lambda request: requested.append(request.url))
    ready_ms = navigate_to_heading(page, path, heading, timeout=90_000)
    page.wait_for_load_state("networkidle", timeout=90_000)
    entries = resource_entries(page)
    context.close()
    return {
        "readyMs": ready_ms,
        "resources": entries,
        "requestedFullSnapshot": any(
            url.endswith("/data/igem.json") for url in requested
        ),
    }


def main() -> None:
    OUTPUT.mkdir(parents=True, exist_ok=True)
    issues: list[str] = []
    core_bytes = (ROOT / "public" / "data" / "web" / "core.json").read_bytes()
    people_bytes = (ROOT / "public" / "data" / "web" / "people.json").read_bytes()
    evidence: dict[str, object] = {
        "networkProfile": {
            "downloadBytesPerSecond": 512 * 1024,
            "uploadBytesPerSecond": 256 * 1024,
            "latencyMs": 150,
            "cpuThrottle": 4,
        },
        "dataset": {
            "visibleTeams": len(VISIBLE_TEAMS),
            "rawTeams": len(RAW_TEAMS),
            "withdrawnTeams": STATUS_COUNTS.get("withdrawn", 0),
        },
        "bundles": {
            "coreGzipBytes": len(gzip.compress(core_bytes, mtime=0)),
            "peopleGzipBytes": len(gzip.compress(people_bytes, mtime=0)),
        },
    }

    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(headless=True)
        evidence["slow4g"] = {
            "home": run_slow_route(
                browser, "/", "让竞赛记录，成为可以查证的公共档案。"
            ),
            "teamDetail": run_slow_route(
                browser, f"/teams/{SHOWCASE['id']}", SHOWCASE["name"]
            ),
            "people": run_slow_route(browser, "/people", "公开成员"),
        }

        slow = evidence["slow4g"]
        assert slow["home"]["readyMs"] < 12_000, slow
        assert slow["teamDetail"]["readyMs"] < 12_000, slow
        assert slow["people"]["readyMs"] < 45_000, slow
        assert not slow["home"]["requestedFullSnapshot"], slow
        assert not slow["teamDetail"]["requestedFullSnapshot"], slow
        assert not slow["people"]["requestedFullSnapshot"], slow

        context = browser.new_context(viewport={"width": 1440, "height": 1000})
        page = context.new_page()
        attach_diagnostics(page, issues)

        navigate_to_heading(page, "/teams", "队伍目录")
        status = page.get_by_label("队伍状态")
        assert status.input_value() == "accepted"
        expect(page.locator(".record-count")).to_have_text(
            f"{len(VISIBLE_TEAMS):,} 条记录"
        )
        status.select_option("all")
        expect(page.locator(".record-count")).to_have_text(
            f"{len(RAW_TEAMS):,} 条记录"
        )
        assert "status=all" in page.url
        status.select_option("withdrawn")
        expect(page.locator(".record-count")).to_have_text(
            f"{STATUS_COUNTS.get('withdrawn', 0)} 条记录"
        )
        expect(page.locator(".team-status.withdrawn").first).to_be_visible()
        page.screenshot(path=OUTPUT / "withdrawn-audit.png", full_page=False)

        navigate_to_heading(page, "/institutions", "机构名称索引")
        expect(page.locator(".record-count")).to_have_text(
            f"{visible_institution_count():,} 条记录"
        )
        expect(page.get_by_text("按“名称记录”使用本目录。", exact=False)).to_be_visible()
        page.screenshot(path=OUTPUT / "institutions-desktop.png", full_page=False)

        navigate_to_heading(page, "/competition?year=2026", "2026 年度概览")
        expect(page.get_by_text("未分类", exact=True)).to_be_visible()
        expect(page.get_by_text("未公开 / 无返回", exact=True)).to_be_visible()
        page.screenshot(path=OUTPUT / "competition-desktop.png", full_page=False)

        navigate_to_heading(page, f"/teams/{SHOWCASE['id']}", SHOWCASE["name"])
        expect(page.get_by_text("来源与更新", exact=True)).to_be_visible()
        expect(page.get_by_text("GOLD", exact=True)).to_be_visible()
        page.screenshot(path=OUTPUT / "team-desktop.png", full_page=True)
        assert no_overflow(page)

        mobile = browser.new_context(viewport={"width": 390, "height": 844})
        mobile_page = mobile.new_page()
        attach_diagnostics(mobile_page, issues)
        navigate_to_heading(mobile_page, "/", "让竞赛记录，成为可以查证的公共档案。")
        assert no_overflow(mobile_page)
        mobile_page.screenshot(path=OUTPUT / "home-mobile.png", full_page=True)
        responsive: dict[str, bool] = {"390": no_overflow(mobile_page)}
        for width, height in ((768, 1024), (1024, 900)):
            responsive_context = browser.new_context(
                viewport={"width": width, "height": height}
            )
            responsive_page = responsive_context.new_page()
            attach_diagnostics(responsive_page, issues)
            navigate_to_heading(responsive_page, "/teams", "队伍目录")
            responsive[str(width)] = no_overflow(responsive_page)
            responsive_context.close()
        assert all(responsive.values()), responsive
        evidence["interaction"] = {
            "defaultTeamStatus": "accepted",
            "allStatusCount": len(RAW_TEAMS),
            "withdrawnStatusCount": STATUS_COUNTS.get("withdrawn", 0),
            "desktopOverflow": False,
            "mobileOverflow": False,
            "responsiveNoOverflow": responsive,
            "consoleOrRequestIssues": issues,
        }

        mobile.close()
        context.close()
        browser.close()

    assert not issues, issues
    (OUTPUT / "release-evidence.json").write_text(
        json.dumps(evidence, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    print(json.dumps(evidence, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
