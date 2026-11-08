from __future__ import annotations

import os
from pathlib import Path

from playwright.sync_api import sync_playwright


BASE = os.environ.get("OXY_TEST_BASE", "http://127.0.0.1:8897").rstrip("/")
SITE_KEY = os.environ.get("OXY_TEST_SITE_KEY", "oc_dev_public")
OUT = Path("_devdocs/evidence/alpha10")
OUT.mkdir(parents=True, exist_ok=True)


def no_overflow(page) -> None:
    widths = page.evaluate(
        """() => ({
          scroll: document.documentElement.scrollWidth,
          client: document.documentElement.clientWidth,
          inner: window.innerWidth
        })"""
    )
    assert widths["scroll"] <= widths["client"] + 1, widths
    assert widths["scroll"] <= widths["inner"] + 1, widths


with sync_playwright() as playwright:
    edge_path = os.environ.get(
        "PLAYWRIGHT_BROWSER_PATH",
        r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe",
    )
    launch_options = {"headless": True}
    if Path(edge_path).exists():
        launch_options["executable_path"] = edge_path
    browser = playwright.chromium.launch(**launch_options)
    try:
        page = browser.new_page(viewport={"width": 390, "height": 844})
        url = (
            f"{BASE}/embed?sitekey={SITE_KEY}&action=submit"
            f"&parentOrigin={BASE}&challengeType=grid_select"
        )
        page.goto(url, wait_until="networkidle")
        page.locator("#oc-entry-accessibility").click()
        page.locator("#oc-accessibility-panel").wait_for(state="visible")
        start = page.locator("#oc-accessibility-start")
        assert start.is_disabled()
        boxes = page.locator("#oc-accessibility-panel input[type=checkbox]")
        for index in range(5):
            boxes.nth(index).check()
        assert start.is_disabled()
        boxes.nth(4).uncheck()
        assert start.is_enabled()
        page.screenshot(path=str(OUT / "accessible-reasons.png"), full_page=True)
        start.click()
        page.locator("#oc-form").wait_for(timeout=10_000)
        challenge_type = page.locator("body").get_attribute("data-challenge-type")
        total_steps = page.locator(".oc-progress").inner_text().strip().split("/")[1]
        assert challenge_type != "inverse_occlusion"
        assert int(total_steps) >= 3
        no_overflow(page)
        page.screenshot(path=str(OUT / "accessible-composed-challenge.png"), full_page=True)
        print("alpha.10 accessibility probe passed")
    finally:
        browser.close()
