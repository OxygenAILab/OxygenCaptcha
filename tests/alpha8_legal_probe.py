from __future__ import annotations

import os
from pathlib import Path

from playwright.sync_api import sync_playwright


BASE = os.environ.get("OXY_TEST_BASE", "http://127.0.0.1:8897").rstrip("/")
OUT = Path("_devdocs/evidence/alpha8")
OUT.mkdir(parents=True, exist_ok=True)


def no_overflow(page) -> None:
    result = page.evaluate(
        """() => ({
          scrollWidth: document.documentElement.scrollWidth,
          clientWidth: document.documentElement.clientWidth,
          innerWidth: window.innerWidth
        })"""
    )
    assert result["scrollWidth"] <= result["innerWidth"] + 1, result
    assert result["scrollWidth"] <= result["clientWidth"] + 1, result


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
        for viewport_name, viewport in (
            ("desktop", {"width": 900, "height": 760}),
            ("mobile", {"width": 390, "height": 844}),
        ):
            context = browser.new_context(viewport=viewport, locale="zh-CN")
            page = context.new_page()
            page.goto(BASE, wait_until="domcontentloaded")
            for path, heading, en_heading, minimum_sections in (
                ("/privacy-policy", "隐私政策", "Privacy Policy", 12),
                ("/user-agreement", "用户协议", "User Agreement", 16),
            ):
                page.evaluate(
                    "() => localStorage.setItem('oxygenchallenge-language', 'zh')"
                )
                page.goto(f"{BASE}{path}", wait_until="networkidle")
                assert page.locator("#legal-banner").is_visible()
                assert page.locator("#legal-title").inner_text() == heading
                assert page.locator("#legal-language-priority").is_visible()
                assert page.locator("#legal-body section").count() >= minimum_sections
                assert "contact@oxygenai.top" in page.locator("#legal-foot").inner_text()
                assert "support@oxygenai.top" not in page.locator("#legal-foot").inner_text()
                assert page.evaluate(
                    """() => Array.from(document.querySelectorAll('#toc-links a'))
                      .every(anchor => document.querySelector(anchor.getAttribute('href')))"""
                )
                no_overflow(page)
                page.screenshot(
                    path=str(
                        OUT
                        / f"{viewport_name}-{path.strip('/')}-zh.png"
                    ),
                    full_page=True,
                )
                page.locator('[data-language="en"]').click()
                assert page.locator("#legal-title").inner_text() == en_heading
                assert "authoritative legal text" in page.locator(
                    "#legal-language-priority"
                ).inner_text()
                no_overflow(page)
                page.screenshot(
                    path=str(
                        OUT
                        / f"{viewport_name}-{path.strip('/')}-en.png"
                    ),
                    full_page=True,
                )
            context.close()
        print("alpha.8 legal probe passed")
    finally:
        browser.close()
