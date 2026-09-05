"""Focused visual and interaction checks for the premium archive UI."""

from __future__ import annotations

import json
import os
from pathlib import Path

from playwright.sync_api import Page, sync_playwright


BASE_URL = os.getenv("BASE_URL", "http://127.0.0.1:43178").rstrip("/")
OUTPUT = Path(os.getenv("PREMIUM_UI_ARTIFACT_DIR", "output/ui-premium"))


def settle(page: Page, path: str) -> None:
    page.goto(f"{BASE_URL}{path}", wait_until="domcontentloaded", timeout=90_000)
    page.wait_for_load_state("networkidle", timeout=90_000)
    try:
        page.locator(".site-header").wait_for(state="visible", timeout=30_000)
    except Exception:
        print(f"Failed to settle {path}:\n{page.locator('body').inner_text()}")
        raise
    page.locator("h1").first.wait_for(state="visible")


def text_size_audit(page: Page) -> dict[str, list[dict[str, str]]]:
    return page.evaluate(
        """
        () => {
          const visible = (element) => {
            const style = getComputedStyle(element);
            const rect = element.getBoundingClientRect();
            return style.display !== 'none' && style.visibility !== 'hidden' &&
              rect.width > 0 && rect.height > 0;
          };
          const directText = (element) => [...element.childNodes]
            .filter((node) => node.nodeType === Node.TEXT_NODE)
            .map((node) => node.textContent || '')
            .join(' ')
            .trim();
          const rows = [...document.querySelectorAll('body *')]
            .filter((element) => visible(element) && directText(element))
            .map((element) => ({
              tag: element.tagName.toLowerCase(),
              className: typeof element.className === 'string' ? element.className : '',
              text: directText(element).slice(0, 80),
              size: Number.parseFloat(getComputedStyle(element).fontSize),
            }));
          return {
            belowMetadataFloor: rows
              .filter((row) => row.size < 11.99)
              .map((row) => ({...row, size: `${row.size}px`})),
            belowBodyFloor: rows
              .filter((row) => ['p', 'td', 'li'].includes(row.tag) && row.size < 13.99)
              .map((row) => ({...row, size: `${row.size}px`})),
          };
        }
        """
    )


def assert_no_document_overflow(page: Page) -> None:
    dimensions = page.evaluate(
        "() => ({scroll: document.documentElement.scrollWidth, client: document.documentElement.clientWidth})"
    )
    assert dimensions["scroll"] <= dimensions["client"] + 1, dimensions


def main() -> None:
    OUTPUT.mkdir(parents=True, exist_ok=True)
    evidence: dict[str, object] = {"routes": {}, "errors": []}

    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(headless=True)
        desktop = browser.new_context(viewport={"width": 1440, "height": 1000})
        page = desktop.new_page()
        page.on("console", lambda message: evidence["errors"].append(
            {"type": f"console:{message.type}", "text": message.text}
        ) if message.type == "error" else None)
        page.on("pageerror", lambda error: evidence["errors"].append(
            {"type": "pageerror", "text": str(error)}
        ))

        settle(page, "/")
        assert page.title() == "iGEMerDB — iGEM 竞赛资料库"
        home_sizes = text_size_audit(page)
        assert not home_sizes["belowMetadataFloor"], home_sizes
        assert not home_sizes["belowBodyFloor"], home_sizes
        assert_no_document_overflow(page)
        page.screenshot(path=OUTPUT / "home-desktop.png", full_page=True)
        evidence["routes"]["home"] = {
            "title": page.title(),
            "textSizes": home_sizes,
        }

        trigger = page.get_by_role("button", name="全站检索")
        with page.expect_response(
            lambda response: response.url.endswith("/data/web/people.json"),
            timeout=90_000,
        ):
            trigger.click()
        dialog = page.get_by_role("dialog", name="全站检索")
        dialog.wait_for(state="visible")
        assert dialog.get_attribute("aria-modal") == "true"
        search_input = page.get_by_role("textbox", name="检索队伍、成员或机构")
        assert search_input.evaluate("element => element === document.activeElement")
        search_input.fill("Alexa Stermann")
        page.get_by_role("link", name="Alexa Stermann", exact=False).wait_for(
            state="visible", timeout=30_000
        )
        page.screenshot(path=OUTPUT / "search-dialog.png")
        search_input.press("Shift+Tab")
        assert dialog.evaluate(
            "element => element.contains(document.activeElement)"
        )
        page.keyboard.press("Escape")
        assert trigger.evaluate("element => element === document.activeElement")

        settle(page, "/teams")
        status_select = page.get_by_label("队伍状态")
        assert status_select.input_value() == "accepted"
        assert page.locator(".team-status.accepted").first.is_visible()
        assert_no_document_overflow(page)
        page.screenshot(path=OUTPUT / "teams-desktop.png", full_page=True)
        evidence["routes"]["teams"] = {
            "title": page.title(),
            "defaultStatus": status_select.input_value(),
            "textSizes": text_size_audit(page),
        }

        settle(page, "/about")
        assert page.title().startswith("关于与方法")
        assert page.get_by_role(
            "heading", name="隐私、纠错与撤回", exact=True
        ).is_visible()
        table_region = page.get_by_role("region", name="逐年采集请求完成情况")
        table_dimensions = table_region.evaluate(
            "element => ({scroll: element.scrollWidth, client: element.clientWidth})"
        )
        page.screenshot(path=OUTPUT / "about-desktop.png", full_page=True)
        evidence["routes"]["about"] = {
            "title": page.title(),
            "table": table_dimensions,
            "textSizes": text_size_audit(page),
        }

        mobile = browser.new_context(viewport={"width": 390, "height": 844})
        mobile_page = mobile.new_page()
        settle(mobile_page, "/teams/5587")
        assert mobile_page.title() != "iGEMerDB — iGEM 竞赛资料库"
        assert_no_document_overflow(mobile_page)
        facts_columns = mobile_page.locator(".entity-facts").evaluate(
            "element => getComputedStyle(element).gridTemplateColumns.split(' ').length"
        )
        assert facts_columns == 2, facts_columns
        mobile_sizes = text_size_audit(mobile_page)
        assert not mobile_sizes["belowMetadataFloor"], mobile_sizes
        assert not mobile_sizes["belowBodyFloor"], mobile_sizes
        mobile_page.screenshot(path=OUTPUT / "team-mobile.png", full_page=True)
        evidence["routes"]["teamMobile"] = {
            "title": mobile_page.title(),
            "factColumns": facts_columns,
            "textSizes": mobile_sizes,
        }

        settle(mobile_page, "/about")
        assert_no_document_overflow(mobile_page)
        assert mobile_page.get_by_text("窄屏下可横向滑动查看全部列", exact=False).is_visible()
        mobile_page.screenshot(path=OUTPUT / "about-mobile.png", full_page=True)
        evidence["routes"]["aboutMobile"] = {
            "title": mobile_page.title(),
            "table": mobile_page.get_by_role(
                "region", name="逐年采集请求完成情况"
            ).evaluate("element => ({scroll: element.scrollWidth, client: element.clientWidth})"),
        }

        browser.close()

    assert not evidence["errors"], evidence["errors"]
    (OUTPUT / "browser-evidence.json").write_text(
        json.dumps(evidence, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    print(json.dumps(evidence, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
