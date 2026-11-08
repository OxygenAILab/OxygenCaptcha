from __future__ import annotations

import os
from pathlib import Path

from playwright.sync_api import sync_playwright


BASE = os.environ.get("OXY_PLATFORM_TEST_BASE", "http://127.0.0.1:8896").rstrip("/")
OUT = Path("_devdocs/evidence/alpha7")
OUT.mkdir(parents=True, exist_ok=True)

with sync_playwright() as playwright:
    launch_options = {"headless": True}
    edge_path = os.environ.get(
        "PLAYWRIGHT_BROWSER_PATH",
        r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe",
    )
    if Path(edge_path).exists():
        launch_options["executable_path"] = edge_path
    browser = playwright.chromium.launch(**launch_options)
    try:
        page = browser.new_page(viewport={"width": 1100, "height": 900})
        page.goto(f"{BASE}/platform", wait_until="networkidle")
        page.get_by_role("link", name="使用 OxygenAccount 登录").click()
        page.wait_for_url(f"{BASE}/platform")
        page.locator(".app-row").wait_for()
        page.locator(".bypass-panel").wait_for()
        assert page.locator(".bypass-rule").filter(has_text="203.0.113.10").count() == 1
        assert page.locator('[data-bypass-form] input[name="ip"]').input_value() == "127.0.0.1"
        page.screenshot(path=str(OUT / "platform-authenticated.png"), full_page=True)

        form = page.locator("[data-bypass-form]").first
        form.locator('input[name="ip"]').fill("198.51.100.20")
        form.locator('input[name="durationMinutes"]').fill("5")
        form.get_by_role("button", name="添加规则").click()
        page.locator(".bypass-rule").filter(has_text="198.51.100.20").wait_for()
        page.screenshot(path=str(OUT / "platform-bypass-added.png"), full_page=True)

        page.locator('[data-bypass-delete="198.51.100.20"]').click()
        page.wait_for_function(
            """() => !Array.from(document.querySelectorAll('.bypass-rule'))
              .some(rule => rule.textContent.includes('198.51.100.20'))"""
        )
        assert page.locator(".bypass-rule").filter(has_text="203.0.113.10").count() == 1
        assert page.locator('a[href="/docs/platform"]').count() == 1
        print("platform bypass UI passed")
    finally:
        browser.close()
