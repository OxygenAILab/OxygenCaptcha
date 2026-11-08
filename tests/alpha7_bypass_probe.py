from __future__ import annotations

import json
import os
from pathlib import Path
from urllib.parse import urlencode

from playwright.sync_api import sync_playwright


HARNESS = Path("_devdocs/evidence/alpha7/platform-harness.json")
OUT = Path("_devdocs/evidence/alpha7")
data = json.loads(HARNESS.read_text(encoding="utf-8"))
BASE = data["publicOrigin"].rstrip("/")
query = urlencode(
    {
        "sitekey": data["siteKey"],
        "action": "submit",
        "parentOrigin": BASE,
    }
)

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
        page = browser.new_page(viewport={"width": 900, "height": 760})
        verification_responses: list[dict] = []

        def capture(response) -> None:
            if "/v1/challenges/" in response.url and response.url.endswith("/verify"):
                try:
                    verification_responses.append(response.json())
                except Exception:
                    pass

        page.on("response", capture)
        page.goto(f"{BASE}/embed?{query}", wait_until="networkidle")
        page.wait_for_function(
            "() => document.querySelector('.oc-entry-label')?.textContent.includes('验证通过')",
            timeout=10_000,
        )
        assert page.evaluate(
            "() => document.querySelector('.oc-shell')?.dataset.bypass"
        ) == "1"
        assert verification_responses
        assert verification_responses[-1]["verified"] is True
        assert verification_responses[-1]["token"].count(".") == 2
        page.screenshot(path=str(OUT / "bypass-compact-success.png"), full_page=True)
        print("development IP browser bypass passed")
    finally:
        browser.close()
