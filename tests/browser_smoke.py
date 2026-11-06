from __future__ import annotations

import os
import time
from pathlib import Path
from urllib.parse import urlencode

from playwright.sync_api import Browser, Page, sync_playwright

BASE = os.environ.get("OXY_TEST_BASE", "http://127.0.0.1:8791").rstrip("/")
HOST_BASE = os.environ.get("OXY_TEST_HOST_BASE", "http://127.0.0.1:8792").rstrip("/")
SITE_KEY = os.environ.get("OXY_TEST_SITE_KEY", "oc_dev_public")
OUT = Path("_devdocs/evidence")
OUT.mkdir(parents=True, exist_ok=True)


def embed_url(challenge_type: str | None = None, accessible: bool = False) -> str:
    query = {
        "sitekey": SITE_KEY,
        "action": "submit",
        "parentOrigin": BASE,
    }
    if challenge_type:
        query["challengeType"] = challenge_type
    if accessible:
        query["accessible"] = "1"
    query["test"] = "1"
    return f"{BASE}/embed?{urlencode(query)}"


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
        if response.status >= 400 and not response.url.endswith("/favicon.ico")
        else None,
    )
    return page, errors


def assert_no_overflow(page: Page) -> None:
    result = page.evaluate(
        """() => ({
          scrollWidth: document.documentElement.scrollWidth,
          clientWidth: document.documentElement.clientWidth,
          innerWidth: window.innerWidth,
          scrollHeight: document.documentElement.scrollHeight,
          clientHeight: document.documentElement.clientHeight
        })"""
    )
    assert result["scrollWidth"] <= result["innerWidth"] + 1, result
    assert result["scrollWidth"] <= result["clientWidth"] + 1, result
    assert result["scrollHeight"] <= max(result["clientHeight"], 720), result


def wait_for_status(page: Page, fragment: str) -> str:
    page.wait_for_function(
        "(fragment) => document.querySelector('#oc-status')?.textContent.includes(fragment)",
        arg=fragment,
    )
    return page.locator("#oc-status").inner_text()


def challenge_id(page: Page) -> str:
    value = page.locator(".oc-shell").get_attribute("data-challenge-id")
    assert value, "challenge id missing"
    return value


def challenge_state(page: Page) -> dict:
    identifier = challenge_id(page)
    return page.evaluate(
        """async (id) => {
          const response = await fetch(`/__test/challenge/${encodeURIComponent(id)}`);
          if (!response.ok) throw new Error(`test state HTTP ${response.status}`);
          return response.json();
        }""",
        identifier,
    )


def canvas_target(page: Page) -> tuple[float, float]:
    point = page.evaluate(
        """() => {
          const canvas = document.querySelector('#oc-motion-canvas');
          if (!(canvas instanceof HTMLCanvasElement)) throw new Error('canvas missing');
          const targetX = Number(canvas.dataset.targetX);
          const targetY = Number(canvas.dataset.targetY);
          if (Number.isFinite(targetX) && Number.isFinite(targetY)) {
            const rect = canvas.getBoundingClientRect();
            return {
              x: rect.left + (targetX / canvas.width) * rect.width,
              y: rect.top + (targetY / canvas.height) * rect.height
            };
          }
          const context = canvas.getContext('2d');
          if (!context) throw new Error('2d context missing');
          const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
          let sumX = 0;
          let sumY = 0;
          let count = 0;
          for (let y = 0; y < canvas.height; y += 2) {
            for (let x = 0; x < canvas.width; x += 2) {
              const index = (y * canvas.width + x) * 4;
              const red = pixels[index] ?? 0;
              const green = pixels[index + 1] ?? 0;
              const blue = pixels[index + 2] ?? 0;
              const alpha = pixels[index + 3] ?? 0;
              if (alpha > 220 && red < 110 && green < 170 && blue > 180) {
                sumX += x;
                sumY += y;
                count += 1;
              }
            }
          }
          if (count < 5) throw new Error(`target pixels not found: ${count}`);
          const rect = canvas.getBoundingClientRect();
          return {
            x: rect.left + (sumX / count / canvas.width) * rect.width,
            y: rect.top + (sumY / count / canvas.height) * rect.height
          };
        }"""
    )
    return float(point["x"]), float(point["y"])


def solve_motion(page: Page) -> None:
    x, y = canvas_target(page)
    page.mouse.move(x, y)
    page.mouse.down()
    deadline = time.monotonic() + 2.5
    while time.monotonic() < deadline:
        page.wait_for_timeout(40)
        x, y = canvas_target(page)
        page.mouse.move(x, y)
        if page.locator("#oc-submit").is_enabled():
            break
    page.mouse.up()
    assert page.locator("#oc-submit").is_enabled(), "motion coverage never unlocked submit"
    page.locator("#oc-submit").click()
    wait_for_status(page, "验证成功")


def screenshot_type(browser: Browser, challenge_type: str, viewport_name: str, viewport: dict[str, int]) -> None:
    page, errors = open_page(browser, viewport)
    page.goto(embed_url(challenge_type), wait_until="networkidle")
    page.locator("#oc-form").wait_for()
    assert_no_overflow(page)
    assert page.locator(".oc-card").evaluate(
        "(el) => getComputedStyle(el).backgroundColor"
    ) == "rgb(255, 255, 255)"
    if challenge_type == "grid_select":
        assert page.locator(".oc-tile").count() == 9
    if challenge_type == "motion_drag":
        assert page.locator("#oc-motion-canvas").is_visible()
    if challenge_type == "audio_sequence":
        assert page.locator(".oc-choice").count() == 3
        assert page.locator("#oc-play-sequence").is_visible()
    if challenge_type == "calculation":
        assert page.locator("#oc-expression").inner_text().count("×") == 2
    if challenge_type == "key_pointer":
        assert page.locator("#oc-gesture-track").is_visible()
    page.screenshot(path=str(OUT / f"{viewport_name}-{challenge_type}.png"), full_page=True)
    assert not errors, errors


def run_inverse_checks(browser: Browser) -> None:
    page, errors = open_page(browser, {"width": 390, "height": 844})
    page.goto(embed_url("inverse_occlusion"), wait_until="networkidle")
    page.locator("#oc-answer").wait_for()
    assert_no_overflow(page)

    colors = page.evaluate(
        """() => {
          const wrap = getComputedStyle(document.querySelector('.oc-image-wrap'));
          const decoyElement = document.querySelector('.oc-decoy');
          const decoy = getComputedStyle(decoyElement);
          return {
            wrap: wrap.backgroundColor,
            decoy: decoy.color,
            decoyText: decoyElement.textContent
          };
        }"""
    )
    assert colors["wrap"] == colors["decoy"], colors
    assert len(colors["decoyText"]) == 6, colors
    image_bounds = page.locator(".oc-image").bounding_box()
    submit_bounds = page.locator("#oc-submit").bounding_box()
    assert image_bounds and image_bounds["height"] > 80
    assert submit_bounds and submit_bounds["height"] >= 44

    page.locator("#oc-audio").click()
    audio_src = page.locator("#oc-player").get_attribute("src")
    assert audio_src and audio_src.endswith("/audio.wav"), audio_src

    state = challenge_state(page)
    page.locator("#oc-answer").fill(state["visibleCode"])
    page.locator("#oc-submit").click()
    wait_for_status(page, "验证成功")
    page.screenshot(path=str(OUT / "mobile-inverse-success.png"), full_page=True)
    assert not errors, errors

    honeypot, honeypot_errors = open_page(browser, {"width": 900, "height": 700})
    honeypot.goto(embed_url("inverse_occlusion"), wait_until="networkidle")
    honeypot_state = challenge_state(honeypot)
    honeypot.locator("#oc-answer").fill(honeypot_state["decoyCode"])
    honeypot.locator("#oc-submit").click()
    status = wait_for_status(honeypot, "验证失败")
    assert "验证失败" in status
    honeypot.screenshot(path=str(OUT / "desktop-inverse-honeypot.png"), full_page=True)
    assert not honeypot_errors, honeypot_errors


def run_grid_checks(browser: Browser) -> None:
    page, errors = open_page(browser, {"width": 900, "height": 760})
    page.goto(embed_url("grid_select"), wait_until="networkidle")
    assert page.locator(".oc-tile").count() == 9
    state = challenge_state(page)
    targets = set(state["grid"]["targetIndices"])
    wrong = next(index for index in range(9) if index not in targets)

    page.locator(f'.oc-tile[data-index="{wrong}"]').click()
    assert "is-selected" in page.locator(f'.oc-tile[data-index="{wrong}"]').get_attribute("class")
    page.locator("#oc-submit").click()
    wrong_status = wait_for_status(page, "验证失败")
    assert "还可尝试" in wrong_status, wrong_status

    page.locator(f'.oc-tile[data-index="{wrong}"]').click()
    for index in sorted(targets):
        page.locator(f'.oc-tile[data-index="{index}"]').click()
    page.screenshot(path=str(OUT / "desktop-grid-selected.png"), full_page=True)
    page.locator("#oc-submit").click()
    wait_for_status(page, "验证成功")
    assert not errors, errors


def run_motion_checks(browser: Browser) -> None:
    page, errors = open_page(browser, {"width": 900, "height": 760}, reduced_motion="no-preference")
    page.goto(embed_url("motion_drag"), wait_until="networkidle")
    page.locator("#oc-motion-canvas").wait_for()
    assert not page.locator("#oc-submit").is_enabled()
    solve_motion(page)
    page.screenshot(path=str(OUT / "desktop-motion-success.png"), full_page=True)
    assert not errors, errors


def run_audio_checks(browser: Browser) -> None:
    page, errors = open_page(browser, {"width": 900, "height": 760})
    page.goto(embed_url("audio_sequence"), wait_until="networkidle")
    state = challenge_state(page)
    page.locator("#oc-play-sequence").click()
    audio_src = page.locator("#oc-player").get_attribute("src")
    assert audio_src and audio_src.endswith("/sequence.wav"), audio_src
    answer = state["audioSequence"]["answerKey"]
    page.locator(f'.oc-choice[data-choice="{answer}"]').click()
    assert "is-selected" in page.locator(f'.oc-choice[data-choice="{answer}"]').get_attribute("class")
    page.locator("#oc-submit").click()
    wait_for_status(page, "验证成功")
    page.screenshot(path=str(OUT / "desktop-audio-success.png"), full_page=True)
    assert not errors, errors


def run_calculation_checks(browser: Browser) -> None:
    page, errors = open_page(browser, {"width": 900, "height": 760})
    page.goto(embed_url("calculation"), wait_until="networkidle")
    state = challenge_state(page)
    assert "×" in page.locator("#oc-expression").inner_text()
    page.locator("#oc-answer").fill(state["calculation"]["answer"])
    page.locator("#oc-submit").click()
    wait_for_status(page, "验证成功")
    page.screenshot(path=str(OUT / "desktop-calculation-success.png"), full_page=True)
    assert not errors, errors


def run_key_pointer_checks(browser: Browser) -> None:
    page, errors = open_page(browser, {"width": 900, "height": 760}, reduced_motion="no-preference")
    page.goto(embed_url("key_pointer"), wait_until="networkidle")
    state = challenge_state(page)
    required_distance = state["keyPointer"]["requiredDistance"]
    required_hold = state["keyPointer"]["requiredHoldMs"]
    track = page.locator("#oc-gesture-track").bounding_box()
    assert track
    page.keyboard.down("Space")
    page.mouse.move(track["x"] + 28, track["y"] + track["height"] / 2)
    page.mouse.down()
    page.mouse.move(
        track["x"] + min(track["width"] - 28, 30 + required_distance),
        track["y"] + track["height"] / 2,
        steps=8,
    )
    page.wait_for_timeout(required_hold + 250)
    page.mouse.up()
    page.keyboard.up("Space")
    assert page.locator("#oc-submit").is_enabled(), "key-pointer gesture never unlocked submit"
    page.locator("#oc-submit").click()
    wait_for_status(page, "验证成功")
    page.screenshot(path=str(OUT / "desktop-key-pointer-success.png"), full_page=True)
    assert not errors, errors


def run_accessible_check(browser: Browser) -> None:
    page, errors = open_page(browser, {"width": 390, "height": 844})
    page.goto(embed_url("grid_select", accessible=True), wait_until="networkidle")
    assert page.locator("body").get_attribute("data-challenge-type") == "inverse_occlusion"
    assert page.locator("#oc-answer").is_visible()
    assert_no_overflow(page)
    assert not errors, errors


def run_cross_origin_embed(browser: Browser) -> None:
    context = browser.new_context(viewport={"width": 900, "height": 760})
    host = context.new_page()
    host.route(
        f"{HOST_BASE}/**",
        lambda route: route.fulfill(
            status=200,
            content_type="text/html",
            body=f"""<!doctype html>
<html><head><meta charset="utf-8"><title>Cross-origin host</title>
<style>
body{{margin:0;background:#f5f5f7;font:16px system-ui;padding:32px}}
form{{max-width:420px;margin:auto}}
label{{display:block;margin:0 0 8px}}
input{{box-sizing:border-box;width:100%;min-height:44px;padding:0 12px}}
button{{min-height:44px;margin-top:12px}}
</style></head>
<body><form>
<label for="email">测试表单</label><input id="email" name="email" type="email">
<oxygen-challenge sitekey="{SITE_KEY}" action="submit" challenge-type="inverse_occlusion"></oxygen-challenge>
<button type="submit">提交表单</button>
</form>
<script src="{BASE}/widget.js" defer></script>
</body></html>""",
        ),
    )
    host.goto(f"{HOST_BASE}/", wait_until="networkidle")
    widget = host.locator("oxygen-challenge")
    widget.wait_for()
    iframe_src = widget.evaluate("(el) => el.shadowRoot.querySelector('iframe').src")
    assert "challengeType=inverse_occlusion" in iframe_src, iframe_src
    assert "parentOrigin=http%3A%2F%2F127.0.0.1%3A8792" in iframe_src, iframe_src

    host.wait_for_timeout(600)
    iframe_handle = widget.evaluate_handle(
        "(el) => el.shadowRoot.querySelector('iframe')"
    ).as_element()
    assert iframe_handle
    frame = iframe_handle.content_frame()
    assert frame
    frame.wait_for_selector("#oc-form", state="visible")
    identifier = frame.locator(".oc-shell").get_attribute("data-challenge-id")
    assert identifier
    state = frame.locator(".oc-shell").evaluate(
        """async (element) => {
          const id = element.dataset.challengeId;
          const response = await fetch(`/__test/challenge/${encodeURIComponent(id)}`);
          return response.json();
        }"""
    )
    frame.locator("#oc-answer").fill(state["visibleCode"])
    frame.locator("#oc-submit").click()
    frame.locator("#oc-status").wait_for()

    host.wait_for_function(
        """() => {
          const widget = document.querySelector('oxygen-challenge');
          return Boolean(widget?.querySelector('input[name="oxygen-token"]')?.value);
        }"""
    )
    token = widget.evaluate(
        "(el) => el.querySelector('input[name=\"oxygen-token\"]')?.value"
    )
    assert token and token.count(".") == 2, token
    iframe_height = widget.evaluate(
        "(el) => el.shadowRoot.querySelector('iframe').getBoundingClientRect().height"
    )
    assert 360 <= iframe_height <= 720, iframe_height
    host.screenshot(path=str(OUT / "desktop-host.png"), full_page=True)
    context.close()


with sync_playwright() as playwright:
    edge_path = os.environ.get(
        "PLAYWRIGHT_BROWSER_PATH",
        r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe",
    )
    launch_options: dict = {"headless": True}
    if Path(edge_path).exists():
        launch_options["executable_path"] = edge_path
        launch_options["args"] = [
            "--disable-web-security",
            "--disable-features=BlockInsecurePrivateNetworkRequests,PrivateNetworkAccessSendPreflights",
        ]
    browser = playwright.chromium.launch(**launch_options)
    viewports = {
        "desktop": {"width": 900, "height": 760},
        "mobile": {"width": 390, "height": 844},
    }

    for challenge_type in (
        "inverse_occlusion",
        "grid_select",
        "motion_drag",
        "audio_sequence",
        "calculation",
        "key_pointer",
    ):
        for viewport_name, viewport in viewports.items():
            screenshot_type(browser, challenge_type, viewport_name, viewport)

    run_inverse_checks(browser)
    run_grid_checks(browser)
    run_motion_checks(browser)
    run_audio_checks(browser)
    run_calculation_checks(browser)
    run_key_pointer_checks(browser)
    run_accessible_check(browser)
    run_cross_origin_embed(browser)
    browser.close()

print("browser smoke passed")
