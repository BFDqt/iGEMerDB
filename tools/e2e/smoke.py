from __future__ import annotations

import json
import os
from pathlib import Path
import time
from urllib.parse import quote

from playwright.sync_api import Page, expect, sync_playwright


BASE_URL = os.getenv("BASE_URL", "http://127.0.0.1:4173").rstrip("/")
# Subpath deployments (GitHub Pages) 404 the slash-less form instead of
# redirecting, so the initial home navigation goes to BASE_URL + '/'.
# Every other goto composes f"{BASE_URL}/path" — keep BASE_URL slash-free.
from urllib.parse import urlsplit
URL_PATH_BASE = urlsplit(BASE_URL).path.rstrip('/')
ARTIFACT_DIR = Path(os.getenv("E2E_ARTIFACT_DIR", "output/e2e"))
ARTIFACT_DIR.mkdir(parents=True, exist_ok=True)
PROJECT_ROOT = Path(__file__).resolve().parents[2]


def load_expected() -> dict[str, int]:
    snapshot = json.loads(
        (PROJECT_ROOT / "public" / "data" / "igem.json").read_text(encoding="utf-8")
    )
    team_year = {team["id"]: team["year"] for team in snapshot["teams"]}
    visible_teams = [
        team for team in snapshot["teams"] if team.get("default_visible", True)
    ]
    visible_team_ids = {team["id"] for team in visible_teams}
    visible_roster = [
        entry for entry in snapshot["roster"] if entry["team_id"] in visible_team_ids
    ]
    visible_results = [
        result
        for result in snapshot.get("team_awards", [])
        if result["team_id"] in visible_team_ids
    ]
    return {
        "teams": len(visible_teams),
        "people": len({entry["member_uuid"] for entry in visible_roster}),
        "results": len(visible_results),
        "teams_2004": sum(team["year"] == 2004 for team in visible_teams),
        "teams_2025": sum(team["year"] == 2025 for team in visible_teams),
        "winners_2025": sum(
            result.get("decision") == "winner"
            and team_year.get(result["team_id"]) == 2025
            for result in visible_results
        ),
    }



def pick_showcase_team(snapshot: dict) -> dict:
    """Deterministically pick the demo detail team from the live snapshot.

    Prefers a visible team holding BOTH a gold medal and a Best Wiki result
    (the long-standing smoke assertions: name, GOLD, Best Wiki); falls back
    to any visible gold winner. Never hardcodes a team id: upstream can
    retire any given team at any time.
    """
    visible = {t["id"]: t for t in snapshot["teams"] if t.get("default_visible", True)}
    stats: dict[int, dict] = {}
    for result in snapshot.get("team_awards", []):
        team = visible.get(result["team_id"])
        if team is None or result.get("decision") != "winner":
            continue
        entry = stats.setdefault(team["id"], {"gold": False, "best_wiki": False, "team": team})
        if result.get("award_type") == "medal" and result.get("award_subtype") == "gold":
            entry["gold"] = True
        if "best wiki" in (result.get("title") or "").lower():
            entry["best_wiki"] = True
    candidates = sorted(
        (info["team"] for info in stats.values() if info["gold"] and info["best_wiki"]),
        key=lambda t: t["id"],
    ) or sorted(
        (info["team"] for info in stats.values() if info["gold"]),
        key=lambda t: t["id"],
    )
    if not candidates:
        raise RuntimeError("no visible gold-medal team found for e2e fixtures")
    return candidates[0]


EXPECTED = load_expected()


def load_detail_fixtures() -> dict[str, object]:
    snapshot = json.loads(
        (PROJECT_ROOT / "public" / "data" / "igem.json").read_text(encoding="utf-8")
    )
    visible_team_ids = {
        team["id"] for team in snapshot["teams"] if team.get("default_visible", True)
    }
    membership_counts: dict[str, int] = {}
    for entry in snapshot["roster"]:
        if entry["team_id"] in visible_team_ids:
            membership_counts[entry["member_uuid"]] = (
                membership_counts.get(entry["member_uuid"], 0) + 1
            )
    person_uuid, person_team_count = sorted(
        membership_counts.items(), key=lambda item: (-item[1], item[0])
    )[0]
    person = next(
        member
        for member in snapshot["members"]
        if member["uuid"] == person_uuid
    )

    institution_teams: dict[str, int] = {}
    for team in snapshot["teams"]:
        if team["id"] not in visible_team_ids:
            continue
        for item in team.get("institutions") or []:
            if item.get("name"):
                institution_teams[item["name"]] = (
                    institution_teams.get(item["name"], 0) + 1
                )
    institution_name, institution_team_count = sorted(
        institution_teams.items(), key=lambda item: (-item[1], item[0])
    )[0]

    withdrawn = next(
        team
        for team in snapshot["teams"]
        if team.get("export_category") == "withdrawn"
    )
    return {
        "person_uuid": person_uuid,
        "person_name": person["name"],
        "person_team_count": person_team_count,
        "institution_name": institution_name,
        "institution_team_count": institution_team_count,
        "withdrawn_id": withdrawn["id"],
        "withdrawn_name": withdrawn["name"],
    }


DETAILS = load_detail_fixtures()
SHOWCASE = pick_showcase_team(json.loads(
    (PROJECT_ROOT / "public" / "data" / "igem.json").read_text(encoding="utf-8")
))


def attach_diagnostics(page: Page, issues: list[str]) -> None:
    page.on(
        "console",
        lambda message: issues.append(
            f"console {message.type}: {message.text}"
        )
        if message.type in {"error", "warning"}
        else None,
    )
    page.on("pageerror", lambda error: issues.append(f"page error: {error}"))
    page.on(
        "requestfailed",
        lambda request: issues.append(
            f"request failed: {request.method} {request.url} "
            f"({request.failure or 'unknown error'})"
        ),
    )


def wait_for_app(page: Page) -> None:
    page.wait_for_load_state("networkidle", timeout=60_000)
    page.locator("#main-content h1").first.wait_for(state="visible", timeout=60_000)


def assert_no_horizontal_overflow(page: Page) -> None:
    dimensions = page.evaluate(
        """() => ({
          viewport: window.innerWidth,
          document: document.documentElement.scrollWidth,
        })"""
    )
    assert dimensions["document"] <= dimensions["viewport"], dimensions


def run_desktop(browser, issues: list[str]) -> dict[str, int]:
    page = browser.new_page(viewport={"width": 1440, "height": 1000})
    attach_diagnostics(page, issues)
    data_requests: list[str] = []
    page.on("request", lambda request: data_requests.append(request.url))
    started = time.perf_counter()
    page.goto(BASE_URL + '/', wait_until="domcontentloaded", timeout=60_000)
    wait_for_app(page)
    ready_ms = round((time.perf_counter() - started) * 1000)

    expect(
        page.get_by_role(
            "heading", name="让竞赛记录，成为可以查证的公共档案。", exact=True
        )
    ).to_be_visible()
    body = page.locator("body").inner_text()
    for expected in (
        f'{EXPECTED["teams"]:,}',
        f'{EXPECTED["people"]:,}',
        f'{EXPECTED["results"]:,}',
    ):
        assert expected in body, f"homepage is missing count {expected}"
    assert any(url.endswith("/data/web/core.json") for url in data_requests)
    assert not any(url.endswith("/data/igem.json") for url in data_requests)
    assert ready_ms < 5_000, f"local core route took {ready_ms} ms"
    assert_no_horizontal_overflow(page)

    page.get_by_role("link", name="队伍", exact=True).first.click()
    expect(page.get_by_role("heading", name="队伍目录", exact=True)).to_be_visible()
    page.get_by_label("年份", exact=True).select_option("2004")
    expect(page.locator(".record-count")).to_have_text(
        f'{EXPECTED["teams_2004"]} 条记录'
    )
    assert "year=2004" in page.url

    with page.expect_response(
        lambda response: response.url.endswith("/data/web/people.json"),
        timeout=60_000,
    ):
        page.keyboard.press("Control+K")
    search = page.get_by_placeholder("输入队伍、成员或机构名称…")
    expect(search).to_be_focused()
    expect(page.get_by_text("按 Esc 关闭", exact=True)).to_be_visible(
        timeout=60_000
    )
    search.fill(SHOWCASE["name"])
    result = page.locator(
        f'.search-results a[href="{URL_PATH_BASE}/teams/{SHOWCASE["id"]}"]'
    )
    expect(result).to_be_visible()
    print("RESULT DOM HREF:", result.get_attribute("href"))
    print("URL BEFORE CLICK:", page.url)
    result.click()
    print("URL AFTER CLICK:", page.url)
    expect(
        page.get_by_role("heading", name=SHOWCASE["name"], exact=True)
    ).to_be_visible()
    assert "/teams/" in page.url

    page.goto(f"{BASE_URL}/teams/{SHOWCASE['id']}")
    wait_for_app(page)
    expect(
        page.get_by_role("heading", name=SHOWCASE["name"], exact=True)
    ).to_be_visible()
    detail_text = page.locator("#main-content").inner_text()
    assert "GOLD" in detail_text
    assert "Best Wiki" in detail_text

    page.goto(f"{BASE_URL}/awards?year=2025&decision=winner")
    wait_for_app(page)
    expect(
        page.get_by_role("heading", name="奖项与获奖队伍", exact=True)
    ).to_be_visible()
    expect(page.locator(".record-count")).to_have_text(
        f'{EXPECTED["winners_2025"]} 条队伍结果'
    )
    expect(page.get_by_text("Gold", exact=True).first).to_be_visible()

    page.goto(f"{BASE_URL}/record-that-does-not-exist")
    wait_for_app(page)
    expect(
        page.get_by_role("heading", name="这里没有可显示的记录。", exact=True)
    ).to_be_visible()

    page.screenshot(path=ARTIFACT_DIR / "desktop-404.png", full_page=True)
    page.close()
    return {"desktop_ready_ms": ready_ms}


def run_detail_routes(browser, issues: list[str]) -> None:
    page = browser.new_page(viewport={"width": 1440, "height": 1000})
    attach_diagnostics(page, issues)

    # Person detail: the member with the widest cross-year footprint.
    page.goto(
        f"{BASE_URL}/people/{DETAILS['person_uuid']}", wait_until="domcontentloaded"
    )
    wait_for_app(page)
    expect(
        page.get_by_role("heading", name=DETAILS["person_name"], exact=True)
    ).to_be_visible()
    expect(page.get_by_role("heading", name="参赛记录", exact=True)).to_be_visible()
    expect(page.get_by_role("heading", name="公开资料", exact=True)).to_be_visible()
    assert DETAILS["person_team_count"] >= 1
    assert_no_horizontal_overflow(page)

    # Institution detail: the official institution with the most linked teams.
    page.goto(
        f"{BASE_URL}/institutions/{quote(str(DETAILS['institution_name']))}",
        wait_until="domcontentloaded",
    )
    wait_for_app(page)
    expect(
        page.get_by_role(
            "heading", name=str(DETAILS["institution_name"]), exact=True
        )
    ).to_be_visible()
    expect(
        page.get_by_role("heading", name="官方字段关联队伍", exact=True)
    ).to_be_visible()
    expect(
        page.get_by_text(f'{DETAILS["institution_team_count"]} 条', exact=True)
    ).to_be_visible()
    assert_no_horizontal_overflow(page)

    # A withdrawn team reached by direct URL keeps its quarantine warning.
    page.goto(
        f"{BASE_URL}/teams/{DETAILS['withdrawn_id']}", wait_until="domcontentloaded"
    )
    wait_for_app(page)
    expect(
        page.get_by_role("heading", name=str(DETAILS["withdrawn_name"]), exact=True)
    ).to_be_visible()
    expect(page.locator(".team-status-alert")).to_be_visible()
    expect(page.locator(".team-status.prominent")).to_have_text("已撤回")

    page.screenshot(path=ARTIFACT_DIR / "detail-routes.png", full_page=False)
    page.close()


def run_mobile(browser, issues: list[str]) -> None:
    page = browser.new_page(viewport={"width": 390, "height": 844})
    attach_diagnostics(page, issues)
    page.goto(f"{BASE_URL}/teams?year=2025", wait_until="domcontentloaded")
    wait_for_app(page)

    expect(page.get_by_role("heading", name="队伍目录", exact=True)).to_be_visible()
    expect(page.locator(".record-count")).to_have_text(
        f'{EXPECTED["teams_2025"]} 条记录'
    )
    assert_no_horizontal_overflow(page)

    menu = page.get_by_role("button", name="打开导航", exact=True)
    expect(menu).to_be_visible()
    menu.click()
    expect(page.get_by_role("navigation", name="移动端导航")).to_be_visible()
    expect(page.get_by_role("link", name="关于与方法", exact=True)).to_be_visible()

    page.screenshot(path=ARTIFACT_DIR / "mobile-teams.png", full_page=False)
    page.close()


def main() -> None:
    issues: list[str] = []
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(headless=True)
        try:
            metrics = run_desktop(browser, issues)
            run_detail_routes(browser, issues)
            run_mobile(browser, issues)
        except Exception:
            # Failure diagnostics: keep the last known page state.
            for context in browser.contexts:
                for page in context.pages:
                    try:
                        print("FAILURE URL:", page.url)
                        body = page.locator("body").inner_text()[:200]
                        print("FAILURE BODY:", body.replace("\n", " | "))
                        links = page.evaluate(
                            """() => [...document.querySelectorAll('a')]
                              .filter((a) => a.href.includes('/teams/1351'))
                              .map((a) => a.getAttribute('href'))"""
                        )
                        print("1351 LINK HREFS:", links)
                        print("FAILURE H1S:", page.evaluate("() => [...document.querySelectorAll('#main-content h1')].map(h => h.textContent)"))
                        page.screenshot(
                            path=str(ARTIFACT_DIR / "failure.png"),
                            full_page=True,
                        )
                    except Exception:
                        pass
            raise
        browser.close()

    if issues:
        raise AssertionError("Browser diagnostics failed:\n" + "\n".join(issues))
    print(
        "E2E smoke passed: homepage, filters, search, team awards, person, "
        "institution and withdrawn details, 404, mobile navigation and "
        f"overflow ({metrics['desktop_ready_ms']} ms ready)."
    )


if __name__ == "__main__":
    main()
