from __future__ import annotations

import os
import time
from pathlib import Path

from playwright.sync_api import Browser, Page, sync_playwright

BASE = os.environ.get("OXY_PRODUCTION_BASE", "https://captcha.oxygenai.top").rstrip("/")
SITE_KEY = os.environ.get("OXY_TEST_SITE_KEY", "oc_public_demo")
OUT = Path("_devdocs/evidence")
OUT.mkdir(parents=True, exist_ok=True)


def open_page(
    browser: Browser,
    viewport: dict[str, int],
    reduced_motion: str = "reduce",
) -> tuple[Page, list[str]]:
    context = browser.new_context(viewport=viewport, reduced_motion=reduced_motion)
    page = context.new_page()
    errors: list[str] = []
    page.on("pageerror", lambda error: errors.append(str(error)))
    page.on(
        "response",
        lambda response: errors.append(f"HTTP {response.status} {response.url}")
        if response.status >= 400
        and not response.url.endswith("/favicon.ico")
        and "/cdn-cgi/challenge-platform/" not in response.url
        else None,
    )
    return page, errors


def assert_no_horizontal_overflow(page: Page) -> None:
    result = page.evaluate(
        """() => ({
          scrollWidth: document.documentElement.scrollWidth,
          clientWidth: document.documentElement.clientWidth,
          innerWidth: window.innerWidth
        })"""
    )
    assert result["scrollWidth"] <= result["innerWidth"] + 1, result
    assert result["scrollWidth"] <= result["clientWidth"] + 1, result


def embed_url(challenge_type: str) -> str:
    return (
        f"{BASE}/embed?sitekey={SITE_KEY}&action=submit"
        f"&parentOrigin={BASE}&challengeType={challenge_type}&launch=1"
    )


def wait_for_status(page: Page, fragment: str) -> str:
    page.wait_for_function(
        "(fragment) => document.querySelector('#oc-status')?.textContent.includes(fragment)",
        arg=fragment,
    )
    return page.locator("#oc-status").inner_text()


with sync_playwright() as playwright:
    edge_path = os.environ.get(
        "PLAYWRIGHT_BROWSER_PATH",
        r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe",
    )
    launch_options: dict = {"headless": True}
    if Path(edge_path).exists():
        launch_options["executable_path"] = edge_path
    browser = playwright.chromium.launch(**launch_options)

    for viewport_name, viewport in (
        ("desktop", {"width": 1440, "height": 900}),
        ("mobile", {"width": 390, "height": 844}),
    ):
        page, errors = open_page(browser, viewport)
        page.goto(f"{BASE}/", wait_until="networkidle")
        page.locator("h1").wait_for()
        assert page.locator("#language-banner").is_visible()
        initial = page.locator("h1").inner_text()
        assert "Verify behavior" in initial or "验证行为" in initial
        target = "en" if "验证行为" in initial else "zh"
        page.locator(f'[data-language="{target}"]').click()
        switched = page.locator("h1").inner_text()
        assert ("Verify behavior" in switched) if target == "en" else ("验证行为" in switched)
        assert page.locator(".hero-media").count() == 0
        assert page.locator(".hero-signal").is_visible()
        assert_no_horizontal_overflow(page)
        page.screenshot(
            path=str(OUT / f"production-{viewport_name}-official-site.png"),
            full_page=True,
        )
        assert not errors, errors

    captcha, captcha_errors = open_page(
        browser,
        {"width": 900, "height": 820},
        reduced_motion="no-preference",
    )
    captcha.goto(f"{BASE}/captcha", wait_until="networkidle")
    captcha.locator("#oc-entry-check").wait_for()
    captcha.screenshot(path=str(OUT / "production-captcha-entry.png"), full_page=True)
    captcha.locator("#oc-entry-check").click()
    captcha.locator(".oc-card").wait_for(timeout=10_000)
    assert captcha.locator("body").get_attribute("data-challenge-type")
    captcha.screenshot(path=str(OUT / "production-captcha-random.png"), full_page=True)
    assert not captcha_errors, captcha_errors

    human, human_errors = open_page(browser, {"width": 900, "height": 760})
    human.goto(embed_url("human_check"), wait_until="networkidle")
    minimum = int(human.locator("#oc-human-check").get_attribute("data-min-dwell") or "800")
    human.locator("#oc-human-check").click()
    human.wait_for_timeout(minimum + 250)
    human.locator("#oc-submit").click()
    human.wait_for_function(
        "() => document.querySelector('.oc-entry-label')?.textContent.includes('验证通过')",
        timeout=15_000,
    )
    scrollbar_style = human.evaluate(
        """() => ({
          scrollbarWidth: getComputedStyle(document.documentElement).scrollbarWidth,
          bodyOverflowX: getComputedStyle(document.body).overflowX
        })"""
    )
    assert scrollbar_style == {"scrollbarWidth": "none", "bodyOverflowX": "hidden"}
    human.screenshot(path=str(OUT / "production-human-success.png"), full_page=True)
    assert not human_errors, human_errors

    rotate, rotate_errors = open_page(browser, {"width": 900, "height": 760})
    rotate.goto(embed_url("rotate_align"), wait_until="networkidle")
    rotate.locator("#oc-rotate-slider").evaluate(
        """(element) => {
          element.value = "0";
          element.dispatchEvent(new Event("input", { bubbles: true }));
        }"""
    )
    rotate.locator("#oc-submit").click()
    rotate.wait_for_function(
        "() => document.querySelector('.oc-entry-label')?.textContent.includes('验证通过')",
        timeout=15_000,
    )
    rotate.screenshot(path=str(OUT / "production-rotate-success.png"), full_page=True)
    assert not rotate_errors, rotate_errors

    speech, speech_errors = open_page(browser, {"width": 900, "height": 820})
    speech.goto(embed_url("speech_wave"), wait_until="networkidle")
    assert speech.locator(".oc-speech-take").count() == 3
    assert speech.locator("#oc-speech-phrase mark").count() == 0
    assert speech.locator("#oc-speech-phrase").inner_text().strip()
    assert speech.locator("#oc-speech-record").is_visible()
    speech.screenshot(path=str(OUT / "production-speech.png"), full_page=True)
    assert not speech_errors, speech_errors

    turnstile, turnstile_errors = open_page(browser, {"width": 900, "height": 760})
    turnstile.goto(embed_url("turnstile"), wait_until="domcontentloaded")
    turnstile.locator("#oc-turnstile").wait_for()
    turnstile.wait_for_timeout(12_000)
    turnstile.screenshot(path=str(OUT / "production-turnstile.png"), full_page=True)
    turnstile_runtime = turnstile.evaluate(
        """() => ({
          status: document.querySelector("#oc-status")?.textContent,
          turnstileType: typeof window.turnstile,
          hasResponseInput: document.querySelector("#oc-turnstile")?.innerHTML.includes("cf-turnstile-response") ?? false,
          responseLength: document.querySelector('input[name="cf-turnstile-response"]')?.value?.length ?? 0,
          submitDisabled: document.querySelector("#oc-submit")?.disabled
        })"""
    )
    print(
        "turnstile",
        {
            "status": turnstile_runtime["status"],
            "hasResponseInput": turnstile_runtime["hasResponseInput"],
            "responseLength": turnstile_runtime["responseLength"],
            "submitDisabled": turnstile_runtime["submitDisabled"],
        },
    )
    assert turnstile_runtime["turnstileType"] == "object"
    assert turnstile_runtime["hasResponseInput"]
    assert not turnstile_errors, turnstile_errors

    hand, hand_errors = open_page(browser, {"width": 900, "height": 820})
    hand.goto(embed_url("hand_motion"), wait_until="networkidle")
    assert hand.locator("#oc-hand-video").is_visible()
    hand.locator("#oc-hand-start").click()
    hand.wait_for_function(
        "() => document.querySelector('#oc-status')?.textContent.includes('摄像头')",
        timeout=15_000,
    )
    hand.screenshot(path=str(OUT / "production-hand-permission.png"), full_page=True)
    assert not hand_errors, hand_errors

    platform, platform_errors = open_page(browser, {"width": 900, "height": 760})
    platform.goto(f"{BASE}/platform", wait_until="networkidle")
    assert platform.locator(".login-view").is_visible()
    platform.locator('a[href="/auth/login"]').click()
    platform.wait_for_load_state("domcontentloaded")
    assert "account.oxygenai.top" in platform.url
    platform.screenshot(path=str(OUT / "production-oauth-login.png"), full_page=True)
    assert not platform_errors, platform_errors

    for path, heading, english_heading, minimum_sections in (
        ("/privacy-policy", "隐私政策", "Privacy Policy", 12),
        ("/user-agreement", "用户协议", "User Agreement", 16),
    ):
        legal, legal_errors = open_page(browser, {"width": 900, "height": 760})
        legal.goto(f"{BASE}{path}", wait_until="networkidle")
        if legal.locator("#legal-title").inner_text() != heading:
            legal.locator('[data-language="zh"]').click()
        assert legal.locator("#legal-title").inner_text() == heading
        assert legal.locator("#legal-language-priority").is_visible()
        assert legal.locator("#legal-body section").count() >= minimum_sections
        assert legal.evaluate(
            """() => Array.from(document.querySelectorAll('#toc-links a'))
              .every(anchor => document.querySelector(anchor.getAttribute('href')))"""
        )
        legal.locator('[data-language="en"]').click()
        assert legal.locator("#legal-title").inner_text() == english_heading
        assert "authoritative legal text" in legal.locator(
            "#legal-language-priority"
        ).inner_text()
        assert_no_horizontal_overflow(legal)
        legal.screenshot(
            path=str(OUT / f"production-{path.strip('/')}.png"),
            full_page=True,
        )
        assert not legal_errors, legal_errors

    browser.close()

print("production smoke passed")
