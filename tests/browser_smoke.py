from __future__ import annotations

import os
import math
import struct
import time
import wave
from pathlib import Path
from urllib.parse import quote, urlencode

from playwright.sync_api import Browser, Page, sync_playwright

BASE = os.environ.get("OXY_TEST_BASE", "http://127.0.0.1:8791").rstrip("/")
HOST_BASE = os.environ.get("OXY_TEST_HOST_BASE", "http://127.0.0.1:8792").rstrip("/")
SITE_KEY = os.environ.get("OXY_TEST_SITE_KEY", "oc_dev_public")
OUT = Path("_devdocs/evidence")
OUT.mkdir(parents=True, exist_ok=True)


def fake_speech_audio() -> Path:
    path = OUT / "fake-speech.wav"
    if path.exists():
        return path
    sample_rate = 48_000
    with wave.open(str(path), "wb") as output:
        output.setnchannels(1)
        output.setsampwidth(2)
        output.setframerate(sample_rate)
        frames = bytearray()
        for index in range(sample_rate * 6):
            seconds = index / sample_rate
            syllable = max(0.0, math.sin(2 * math.pi * 2.7 * seconds))
            carrier = (
                0.42 * math.sin(2 * math.pi * 180 * seconds)
                + 0.24 * math.sin(2 * math.pi * 360 * seconds)
                + 0.12 * math.sin(2 * math.pi * 720 * seconds)
            )
            value = int(12_000 * syllable * carrier)
            frames.extend(struct.pack("<h", value))
        output.writeframes(frames)
    return path


def embed_url(
    challenge_type: str | None = None,
    accessible: bool = False,
    risk: str | None = None,
    entry: bool = False,
) -> str:
    query = {
        "sitekey": SITE_KEY,
        "action": "submit",
        "parentOrigin": BASE,
    }
    if challenge_type:
        query["challengeType"] = challenge_type
    if accessible:
        query["accessible"] = "1"
    if risk:
        query["risk"] = risk
    query["test"] = "1"
    if not entry:
        query["launch"] = "1"
    return f"{BASE}/embed?{urlencode(query)}"


def open_page(
    browser: Browser,
    viewport: dict[str, int],
    reduced_motion: str = "reduce",
    permissions: list[str] | None = None,
) -> tuple[Page, list[str]]:
    context = browser.new_context(
        viewport=viewport,
        reduced_motion=reduced_motion,
        permissions=permissions or [],
    )
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


def wait_for_status(page: Page, fragment: str) -> str:
    page.wait_for_function(
        """(fragment) => {
          const status = document.querySelector('#oc-status')?.textContent ?? "";
          const compact = document.querySelector('.oc-entry-label')?.textContent ?? "";
          return status.includes(fragment) || compact.includes("验证通过");
        }""",
        arg=fragment,
    )
    if page.locator(".oc-entry-label").count():
        return page.locator(".oc-entry-label").inner_text()
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


def solve_motion(page: Page, submit: bool = True) -> None:
    page.wait_for_function(
        "() => Number.isFinite(Number(document.querySelector('#oc-motion-canvas')?.dataset.targetX))",
        timeout=5_000,
    )
    x, y = canvas_target(page)
    page.mouse.move(x, y)
    page.mouse.down()
    started = time.monotonic()
    deadline = time.monotonic() + 8.0
    while time.monotonic() < deadline:
        page.wait_for_timeout(40)
        x, y = canvas_target(page)
        page.mouse.move(x, y)
        if (
            page.locator("#oc-submit").is_enabled()
            and time.monotonic() - started >= 4.4
        ):
            break
    page.mouse.up()
    assert page.locator("#oc-submit").is_enabled(), "motion coverage never unlocked submit"
    if submit:
        page.locator("#oc-submit").click()
        wait_for_status(page, "验证成功")


def pattern_sequence(seed: int, length: int) -> list[int]:
    value = seed & 0xFFFFFFFF
    result = []
    for _ in range(length):
        value = (value * 1664525 + 1013904223) & 0xFFFFFFFF
        result.append(int((value / 4294967296) * 4))
    return result


def solve_pattern(page: Page, state: dict, submit: bool = True) -> None:
    pattern = state["patternMemory"]
    sequence = pattern_sequence(pattern["seed"], pattern["sequenceLength"])
    page.locator("#oc-pattern-play").click()
    page.wait_for_function(
        "() => [...document.querySelectorAll('.oc-pattern-button')].every((button) => !button.disabled)",
        timeout=15_000,
    )
    for index in sequence:
        page.locator(f'.oc-pattern-button[data-index="{index}"]').click()
        page.wait_for_timeout(60)
    assert page.locator("#oc-submit").is_enabled()
    if submit:
        page.locator("#oc-submit").click()
        wait_for_status(page, "验证成功")


def solve_key_pointer(page: Page, state: dict, submit: bool = True) -> None:
    required_distance = state["keyPointer"]["requiredDistance"]
    required_hold = state["keyPointer"]["requiredHoldMs"]
    required_key = state["keyPointer"]["requiredKey"]
    keyboard_key = "Space" if required_key == "Space" else required_key.removeprefix("Key")
    track = page.locator("#oc-gesture-track").bounding_box()
    assert track
    page.keyboard.down(keyboard_key)
    page.mouse.move(track["x"] + 28, track["y"] + track["height"] / 2)
    page.mouse.down()
    page.mouse.move(
        track["x"] + min(track["width"] - 28, 30 + required_distance),
        track["y"] + track["height"] / 2,
        steps=8,
    )
    page.wait_for_timeout(required_hold + 250)
    page.mouse.up()
    page.keyboard.up(keyboard_key)
    assert page.locator("#oc-submit").is_enabled()
    if submit:
        page.locator("#oc-submit").click()
        wait_for_status(page, "验证成功")


def solve_count(page: Page, state: dict, submit: bool = True) -> None:
    page.locator("#oc-count-start").click()
    page.wait_for_timeout(state["countFlash"]["revealMs"] + 250)
    assert page.locator("#oc-answer").is_enabled()
    page.locator("#oc-answer").fill(str(state["countFlash"]["count"]))
    if submit:
        page.locator("#oc-submit").click()
        wait_for_status(page, "验证成功")


def solve_market(page: Page, state: dict, submit: bool = True) -> None:
    market = state["marketTrade"]
    canvas = page.locator("#oc-market-canvas").bounding_box()
    assert canvas
    padding = 18
    count = len(market["prices"])
    ratio = market["buyBandRatio"]
    sorted_prices = sorted(market["prices"])
    buy_limit = sorted_prices[max(0, math.floor(count * ratio) - 1)]
    sell_limit = sorted_prices[min(count - 1, math.ceil(count * (1 - ratio)))]
    trades: list[tuple[int, int]] = []
    capital = float(market.get("initialCapital") or 1000)
    target = float(market.get("targetCapital") or 0)
    previous_sell = -1
    for buy_index, buy_price in enumerate(market["prices"]):
        if buy_index <= previous_sell or buy_price > buy_limit:
            continue
        for sell_index in range(buy_index + 1, count):
            sell_price = market["prices"][sell_index]
            if sell_price < sell_limit:
                continue
            trades.append((buy_index, sell_index))
            capital *= sell_price / buy_price
            previous_sell = sell_index
            break
        if market["mode"] == "single" or (
            market["mode"] == "target" and capital >= target
        ):
            break
    if market["mode"] == "single":
        trades = trades[:1]
    assert trades, "market seed has no valid trade"
    if market["mode"] == "target":
        assert capital >= target, (capital, target)

    page.wait_for_function(
        "(count) => Number(document.querySelector('#oc-market-canvas')?.dataset.visibleTo) === count - 1",
        arg=count,
        timeout=18_000,
    )
    metrics = page.locator("#oc-market-canvas").evaluate(
        """(canvas) => ({
          width: Number(canvas.dataset.canvasWidth),
          step: Number(canvas.dataset.step),
          padding: Number(canvas.dataset.padding)
        })"""
    )

    def x_for(index: int) -> float:
        internal_x = metrics["padding"] + index * metrics["step"]
        return canvas["x"] + (internal_x / metrics["width"]) * canvas["width"]

    for buy_index, sell_index in trades:
        page.locator("#oc-market-buy").click()
        page.mouse.click(x_for(buy_index), canvas["y"] + canvas["height"] / 2)
        page.mouse.click(x_for(sell_index), canvas["y"] + canvas["height"] / 2)
        page.wait_for_timeout(80)
    assert page.locator("#oc-submit").is_enabled()
    if submit:
        page.locator("#oc-submit").click()
        wait_for_status(page, "验证成功")


def synthetic_speech_takes() -> list[list[list[float]]]:
    takes = []
    for take_index in range(1, 4):
        frames = []
        for frame in range(96):
            bands = []
            for band in range(7):
                signal = math.sin(
                    frame * (0.07 + band * 0.013) + take_index * 1.7 + band * 0.9
                )
                jitter = ((((frame * 17 + band * 31 + take_index * 13) % 23) - 11) / 220)
                bands.append(0.5 + signal * 0.24 + jitter)
            frames.append(bands)
        takes.append(frames)
    return takes


def solve_human(page: Page, state: dict, submit: bool = True) -> None:
    minimum = state["humanCheck"]["minDwellMs"]
    page.locator("#oc-human-check").click()
    assert page.locator("#oc-human-input").is_checked()
    page.wait_for_timeout(minimum + 180)
    assert page.locator("#oc-submit").is_enabled()
    if submit:
        page.locator("#oc-submit").click()
        wait_for_status(page, "验证成功")


def solve_rotate(page: Page, state: dict, submit: bool = True) -> None:
    slider = page.locator("#oc-rotate-slider")
    slider.evaluate(
        """(element) => {
          element.value = "0";
          element.dispatchEvent(new Event("input", { bubbles: true }));
        }"""
    )
    assert page.locator("#oc-rotate-value").inner_text().strip() == "0°"
    if submit:
        page.locator("#oc-submit").click()
        wait_for_status(page, "验证成功")


def solve_semantic(page: Page, state: dict, submit: bool = True) -> None:
    answer = state["semanticPick"]["answer"]
    page.locator(f'.oc-choice[data-choice="{answer}"]').click()
    assert "is-selected" in page.locator(f'.oc-choice[data-choice="{answer}"]').get_attribute(
        "class"
    )
    if submit:
        page.locator("#oc-submit").click()
        wait_for_status(page, "验证成功")


def solve_hand(page: Page, state: dict, submit: bool = True) -> None:
    motion = state["handMotion"]
    evidence = [
        {"action": action, "durationMs": motion["holdMs"]}
        for action in motion["sequence"]
    ]
    page.evaluate(
        "(observations) => window.__oxygenHandTest(observations)",
        evidence,
    )
    assert page.locator("#oc-submit").is_enabled()
    if submit:
        page.locator("#oc-submit").click()
        wait_for_status(page, "验证成功")


def solve_speech(page: Page, state: dict, submit: bool = True) -> None:
    page.evaluate(
        "(takes) => window.__oxygenSpeechTest(takes)",
        synthetic_speech_takes(),
    )
    assert page.locator("#oc-submit").is_enabled()
    if submit:
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
        assert page.locator(".oc-choice").count() == 4
        assert page.locator("#oc-play-sequence").is_visible()
    if challenge_type == "calculation":
        assert page.locator("#oc-expression").inner_text().count("×") == 2
    if challenge_type == "key_pointer":
        assert page.locator("#oc-gesture-track").is_visible()
    if challenge_type == "pattern_memory":
        assert page.locator(".oc-pattern-button").count() == 4
        assert page.locator("#oc-pattern-play").is_visible()
    if challenge_type == "count_flash":
        assert page.locator("#oc-count-canvas").is_visible()
        assert page.locator("#oc-count-start").is_visible()
    if challenge_type == "market_trade":
        assert page.locator("#oc-market-canvas").is_visible()
        assert page.locator("#oc-market-buy").is_visible()
    if challenge_type == "human_check":
        assert page.locator("#oc-human-input").is_visible()
    if challenge_type == "rotate_align":
        assert page.locator("#oc-rotate-slider").is_visible()
    if challenge_type == "semantic_pick":
        assert page.locator(".oc-semantic-choice").count() == 4
    if challenge_type == "turnstile":
        assert page.locator("#oc-turnstile").is_visible()
    if challenge_type == "hand_motion":
        assert page.locator("#oc-hand-video").is_visible()
        assert page.locator("#oc-hand-start").is_visible()
    if challenge_type == "speech_wave":
        assert page.locator(".oc-speech-take").count() == 3
        assert page.locator("#oc-speech-phrase mark").count() == 0
        assert page.locator("#oc-speech-phrase").inner_text().strip()
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
    page.locator(".oc-choice-preview").first.click()
    preview_src = page.locator("#oc-player").get_attribute("src")
    assert preview_src and "/v1/animal-sounds/" in preview_src, preview_src
    answer = state["audioSequence"]["answerKey"]
    page.locator(f'.oc-choice[data-choice="{answer}"] .oc-choice-select').click()
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
    solve_key_pointer(page, state, submit=True)
    page.screenshot(path=str(OUT / "desktop-key-pointer-success.png"), full_page=True)
    assert not errors, errors


def run_pattern_checks(browser: Browser) -> None:
    page, errors = open_page(browser, {"width": 900, "height": 820}, reduced_motion="no-preference")
    page.goto(embed_url("pattern_memory"), wait_until="networkidle")
    state = challenge_state(page)
    solve_pattern(page, state, submit=False)
    page.locator("#oc-submit").click()
    wait_for_status(page, "验证成功")
    page.screenshot(path=str(OUT / "desktop-pattern-success.png"), full_page=True)
    assert not errors, errors


def run_count_checks(browser: Browser) -> None:
    page, errors = open_page(browser, {"width": 900, "height": 820}, reduced_motion="no-preference")
    page.goto(embed_url("count_flash"), wait_until="networkidle")
    state = challenge_state(page)
    solve_count(page, state, submit=False)
    page.locator("#oc-submit").click()
    wait_for_status(page, "验证成功")
    page.screenshot(path=str(OUT / "desktop-count-success.png"), full_page=True)
    assert not errors, errors


def run_market_checks(browser: Browser) -> None:
    page, errors = open_page(browser, {"width": 900, "height": 820}, reduced_motion="no-preference")
    page.goto(embed_url("market_trade"), wait_until="networkidle")
    state = challenge_state(page)
    solve_market(page, state, submit=False)
    page.locator("#oc-submit").click()
    wait_for_status(page, "验证成功")
    page.screenshot(path=str(OUT / "desktop-market-success.png"), full_page=True)
    assert not errors, errors


def run_basic_checks(browser: Browser) -> None:
    for challenge_type, solver in (
        ("human_check", solve_human),
        ("rotate_align", solve_rotate),
        ("semantic_pick", solve_semantic),
    ):
        page, errors = open_page(browser, {"width": 900, "height": 760}, reduced_motion="no-preference")
        page.goto(embed_url(challenge_type), wait_until="networkidle")
        state = challenge_state(page)
        solver(page, state, submit=True)
        page.screenshot(
            path=str(OUT / f"desktop-{challenge_type}-success.png"),
            full_page=True,
        )
        assert not errors, errors


def run_media_checks(browser: Browser) -> None:
    camera, camera_errors = open_page(
        browser,
        {"width": 900, "height": 820},
        reduced_motion="no-preference",
        permissions=["camera"],
    )
    camera.goto(embed_url("hand_motion"), wait_until="networkidle")
    camera.locator("#oc-hand-start").click()
    camera.wait_for_function(
        "() => document.querySelector('#oc-status')?.textContent.includes('请按顺序完成手势')",
        timeout=60_000,
    )
    camera_runtime = camera.evaluate(
        """() => ({
          progress: document.querySelector('#oc-hand-progress-value')?.value,
          hasStream: Boolean(document.querySelector('#oc-hand-video')?.srcObject),
          videoReady: document.querySelector('#oc-hand-video')?.readyState
        })"""
    )
    assert camera_runtime["progress"] == "100%", camera_runtime
    assert camera_runtime["hasStream"], camera_runtime
    assert camera_runtime["videoReady"] >= 2, camera_runtime
    camera.screenshot(path=str(OUT / "desktop-hand-model-ready.png"), full_page=True)
    assert not camera_errors, camera_errors

    mobile_speech, mobile_speech_errors = open_page(
        browser,
        {"width": 390, "height": 844},
        reduced_motion="no-preference",
        permissions=["microphone"],
    )
    mobile_payloads: list[int] = []
    mobile_responses: list[int] = []
    mobile_speech.on(
        "request",
        lambda request: mobile_payloads.append(len(request.post_data or ""))
        if request.url.endswith("/verify")
        else None,
    )
    mobile_speech.on(
        "response",
        lambda response: mobile_responses.append(response.status)
        if response.url.endswith("/verify")
        else None,
    )
    mobile_speech.goto(embed_url("speech_wave"), wait_until="networkidle")
    for _ in range(3):
        mobile_speech.locator("#oc-speech-record").click()
        mobile_speech.wait_for_timeout(2200)
        mobile_speech.locator("#oc-speech-record").click()
        mobile_speech.wait_for_timeout(420)
    assert mobile_speech.locator("#oc-submit").is_enabled()
    mobile_speech.locator("#oc-submit").click()
    mobile_speech.wait_for_timeout(4_000)
    assert mobile_payloads and mobile_payloads[-1] < 256 * 1024, mobile_payloads
    assert mobile_responses and mobile_responses[-1] == 200, mobile_responses
    mobile_speech.screenshot(
        path=str(OUT / "mobile-speech-submitted.png"),
        full_page=True,
    )
    assert not mobile_speech_errors, mobile_speech_errors

    hand, hand_errors = open_page(browser, {"width": 900, "height": 820}, reduced_motion="no-preference")
    hand.goto(embed_url("hand_motion"), wait_until="networkidle")
    hand_state = challenge_state(hand)
    solve_hand(hand, hand_state, submit=False)
    hand.locator("#oc-submit").click()
    wait_for_status(hand, "验证成功")
    hand.screenshot(path=str(OUT / "desktop-hand-motion-success.png"), full_page=True)
    assert not hand_errors, hand_errors

    denied, denied_errors = open_page(browser, {"width": 900, "height": 820})
    denied.goto(embed_url("hand_motion"), wait_until="networkidle")
    denied.locator("#oc-hand-start").click()
    denied.wait_for_function(
        "() => document.querySelector('#oc-status')?.textContent.includes('摄像头')",
        timeout=15_000,
    )
    assert "摄像头" in denied.locator("#oc-status").inner_text()
    denied.screenshot(path=str(OUT / "desktop-hand-camera-denied.png"), full_page=True)
    assert not denied_errors, denied_errors

    speech, speech_errors = open_page(browser, {"width": 900, "height": 820}, reduced_motion="no-preference")
    speech.goto(embed_url("speech_wave"), wait_until="networkidle")
    speech_state = challenge_state(speech)
    assert speech.locator("#oc-speech-phrase mark").count() == 0
    assert speech.locator("#oc-speech-phrase").inner_text() == speech_state["speechWave"]["phrase"]
    solve_speech(speech, speech_state, submit=False)
    speech.locator("#oc-submit").click()
    wait_for_status(speech, "验证成功")
    speech.screenshot(path=str(OUT / "desktop-speech-wave-success.png"), full_page=True)
    assert not speech_errors, speech_errors


def run_accessible_check(browser: Browser) -> None:
    page, errors = open_page(browser, {"width": 390, "height": 844})
    page.goto(embed_url("grid_select", accessible=True), wait_until="networkidle")
    assert page.locator("body").get_attribute("data-challenge-type") == "inverse_occlusion"
    assert page.locator("#oc-answer").is_visible()
    assert_no_overflow(page)
    assert not errors, errors


def run_site_checks(browser: Browser) -> None:
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
        brand_style = page.locator(".site-nav .brand").evaluate(
            "(element) => ({ decoration: getComputedStyle(element).textDecorationLine, color: getComputedStyle(element).color })"
        )
        assert brand_style["decoration"] == "none", brand_style
        assert_no_horizontal_overflow(page)
        page.screenshot(path=str(OUT / f"{viewport_name}-official-site.png"), full_page=True)
        assert not errors, errors

    captcha, captcha_errors = open_page(browser, {"width": 900, "height": 820}, reduced_motion="no-preference")
    captcha.goto(f"{BASE}/captcha", wait_until="networkidle")
    captcha.locator("#oc-entry-check").wait_for()
    check_box = captcha.locator(".oc-entry-check-box").bounding_box()
    assert check_box
    assert 27 <= check_box["width"] <= 31, check_box
    assert 27 <= check_box["height"] <= 31, check_box
    captcha.screenshot(path=str(OUT / "desktop-captcha-entry.png"), full_page=True)
    captcha.locator("#oc-entry-check").click()
    captcha.locator(".oc-card").wait_for(timeout=10_000)
    challenge_type = captcha.locator("body").get_attribute("data-challenge-type")
    assert challenge_type
    captcha.screenshot(path=str(OUT / "desktop-captcha-random.png"), full_page=True)
    assert not captcha_errors, captcha_errors

    platform, platform_errors = open_page(browser, {"width": 900, "height": 760})
    platform.goto(f"{BASE}/platform", wait_until="networkidle")
    assert platform.locator(".panel").is_visible()
    platform_brand_style = platform.locator(".topbar .brand").evaluate(
        "(element) => ({ decoration: getComputedStyle(element).textDecorationLine, color: getComputedStyle(element).color })"
    )
    assert platform_brand_style["decoration"] == "none", platform_brand_style
    platform.screenshot(path=str(OUT / "desktop-platform.png"), full_page=True)
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
        assert legal.locator("#legal-banner").is_visible()
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
            path=str(OUT / f"desktop-{path.strip('/')}.png"),
            full_page=True,
        )
        assert not legal_errors, legal_errors

    for path, fragment in (
        ("/docs", "OxygenChallenge Developer Docs"),
        ("/docs/embed", "Embed the widget"),
        ("/docs/integration", "Server integration"),
        ("/docs/platform", "Open Platform"),
    ):
        docs_page, docs_errors = open_page(browser, {"width": 900, "height": 760})
        docs_page.goto(f"{BASE}{path}", wait_until="networkidle")
        assert docs_page.locator("#docs-language-banner").is_visible()
        docs_page.locator('[data-docs-language="en"]').click()
        docs_page.wait_for_function(
            "() => document.documentElement?.dataset.lang === 'en'"
        )
        assert fragment in docs_page.locator("h1").inner_text()
        assert_no_horizontal_overflow(docs_page)
        docs_page.screenshot(
            path=str(OUT / f"desktop-{path.strip('/').replace('/', '-')}.png"),
            full_page=True,
        )
        assert not docs_errors, docs_errors


def solve_current(page: Page, state: dict, submit: bool = True) -> None:
    challenge_type = state["type"]
    if challenge_type == "inverse_occlusion":
        page.locator("#oc-answer").fill(state["visibleCode"])
    elif challenge_type == "grid_select":
        for index in state["grid"]["targetIndices"]:
            page.locator(f'.oc-tile[data-index="{index}"]').click()
    elif challenge_type == "motion_drag":
        solve_motion(page, submit=False)
    elif challenge_type == "audio_sequence":
        answer = state["audioSequence"]["answerKey"]
        page.locator(f'.oc-choice[data-choice="{answer}"] .oc-choice-select').click()
    elif challenge_type == "calculation":
        page.locator("#oc-answer").fill(state["calculation"]["answer"])
    elif challenge_type == "key_pointer":
        solve_key_pointer(page, state, submit=False)
    elif challenge_type == "pattern_memory":
        solve_pattern(page, state, submit=False)
    elif challenge_type == "count_flash":
        solve_count(page, state, submit=False)
    elif challenge_type == "market_trade":
        solve_market(page, state, submit=False)
    elif challenge_type == "human_check":
        solve_human(page, state, submit=False)
    elif challenge_type == "rotate_align":
        solve_rotate(page, state, submit=False)
    elif challenge_type == "semantic_pick":
        solve_semantic(page, state, submit=False)
    elif challenge_type == "hand_motion":
        solve_hand(page, state, submit=False)
    elif challenge_type == "speech_wave":
        solve_speech(page, state, submit=False)
    else:
        raise AssertionError(f"unsupported type {challenge_type}")
    if submit:
        page.locator("#oc-submit").click()
        wait_for_status(page, "验证成功")


def run_risk_session(browser: Browser) -> None:
    page, errors = open_page(browser, {"width": 900, "height": 820}, reduced_motion="no-preference")
    page.goto(embed_url(risk="medium"), wait_until="networkidle")
    first_progress = page.locator(".oc-progress").inner_text()
    total_steps = int(first_progress.strip().split("/")[1])
    assert total_steps >= 3, first_progress
    assert first_progress.strip() == f"1 / {total_steps}", first_progress

    for step in range(1, total_steps + 1):
        state = challenge_state(page)
        assert state["stepIndex"] + 1 == step, state
        solve_current(page, state, submit=False)
        previous_id = state["id"]
        page.locator("#oc-submit").click()
        if step < total_steps:
            page.wait_for_function(
                "(previousId) => document.querySelector('.oc-shell')?.getAttribute('data-challenge-id') !== previousId",
                arg=previous_id,
                timeout=15_000,
            )
            page.locator("#oc-form").wait_for()
            page.wait_for_load_state("networkidle")
        else:
            page.wait_for_function(
                "() => document.querySelector('.oc-entry-label')?.textContent.includes('验证通过')",
                timeout=15_000,
            )
    assert page.locator(".oc-entry-label").inner_text().strip() == "验证通过"
    page.screenshot(path=str(OUT / "desktop-risk-session-success.png"), full_page=True)
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
    host.evaluate(
        """() => {
          window.__ocVerifiedEvents = [];
          window.__ocCompleteEvents = [];
          document.querySelector('oxygen-challenge').addEventListener(
            'oxygenchallenge:verified',
            (event) => window.__ocVerifiedEvents.push(event.detail),
          );
          document.querySelector('oxygen-challenge').addEventListener(
            'oxygenchallenge:complete',
            (event) => window.__ocCompleteEvents.push(event.detail),
          );
        }"""
    )
    iframe_src = widget.evaluate("(el) => el.shadowRoot.querySelector('iframe').src")
    assert "challengeType=inverse_occlusion" in iframe_src, iframe_src
    assert f"parentOrigin={quote(HOST_BASE, safe='')}" in iframe_src, iframe_src

    host.wait_for_timeout(600)
    iframe_handle = widget.evaluate_handle(
        "(el) => el.shadowRoot.querySelector('iframe')"
    ).as_element()
    assert iframe_handle
    frame = iframe_handle.content_frame()
    assert frame
    frame.wait_for_selector("#oc-entry-check", state="visible")
    initial_iframe_height = widget.evaluate(
        "(el) => el.shadowRoot.querySelector('iframe').getBoundingClientRect().height"
    )
    assert 90 <= initial_iframe_height <= 110, initial_iframe_height
    host.evaluate(
        """() => {
          window.__ocHeights = [];
          const started = performance.now();
          const sample = () => {
            const frame = document.querySelector('oxygen-challenge')
              ?.shadowRoot?.querySelector('iframe');
            if (frame) window.__ocHeights.push(frame.getBoundingClientRect().height);
            if (performance.now() - started < 1_500) requestAnimationFrame(sample);
          };
          sample();
        }"""
    )
    frame.locator("#oc-entry-check").click()
    frame.wait_for_selector("#oc-form", state="visible")
    scrollbar_style = frame.evaluate(
        """() => ({
          scrollbarWidth: getComputedStyle(document.documentElement).scrollbarWidth,
          bodyOverflowX: getComputedStyle(document.body).overflowX
        })"""
    )
    assert scrollbar_style == {"scrollbarWidth": "none", "bodyOverflowX": "hidden"}
    host.wait_for_timeout(700)
    expansion_heights = host.evaluate("window.__ocHeights")
    assert max(expansion_heights) > initial_iframe_height + 80, expansion_heights
    intermediate = {
        round(height)
        for height in expansion_heights
        if initial_iframe_height + 8 < height < max(expansion_heights) - 8
    }
    assert len(intermediate) >= 3, expansion_heights
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
          return Boolean(widget?.closest('form')
            ?.querySelector('input[name="oxygen-token"]')?.value);
        }"""
    )
    token = widget.evaluate(
        """(el) => el.closest('form')
          ?.querySelector('input[name="oxygen-token"]')?.value"""
    )
    assert token and token.count(".") == 2, token
    assert widget.evaluate("(el) => el.querySelector('input') === null")
    assert host.evaluate("window.__ocVerifiedEvents.length") == 1
    assert host.evaluate("window.__ocCompleteEvents.length") == 1
    host.wait_for_function(
        """() => document.querySelector('oxygen-challenge')
          ?.shadowRoot?.querySelector('.oc-success-label')
          ?.textContent.includes('验证通过')"""
    )
    assert widget.evaluate(
        "(el) => el.shadowRoot.querySelector('.oc-success-label')?.textContent"
    ) == "验证通过"
    assert widget.evaluate("(el) => el.shadowRoot.querySelector('iframe') === null")
    assert 90 <= widget.bounding_box()["height"] <= 110
    host.evaluate(
        """() => {
          const widget = document.querySelector('oxygen-challenge');
          const parent = widget.parentElement;
          widget.remove();
          parent.appendChild(widget);
        }"""
    )
    host.wait_for_timeout(300)
    assert widget.evaluate(
        "(el) => el.shadowRoot.querySelector('.oc-success-label')?.textContent"
    ) == "验证通过"
    assert host.evaluate(
        """() => Boolean(document.querySelector('form')
          ?.querySelector('input[name="oxygen-token"]')?.value)"""
    )
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
            "--use-fake-device-for-media-stream",
            f"--use-file-for-fake-audio-capture={fake_speech_audio()}",
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
        "pattern_memory",
        "count_flash",
        "market_trade",
        "human_check",
        "rotate_align",
        "semantic_pick",
        "hand_motion",
        "speech_wave",
    ):
        for viewport_name, viewport in viewports.items():
            if viewport_name == "mobile" and challenge_type == "key_pointer":
                continue
            screenshot_type(browser, challenge_type, viewport_name, viewport)

    run_inverse_checks(browser)
    run_grid_checks(browser)
    run_motion_checks(browser)
    run_audio_checks(browser)
    run_calculation_checks(browser)
    run_key_pointer_checks(browser)
    run_pattern_checks(browser)
    run_count_checks(browser)
    run_market_checks(browser)
    run_basic_checks(browser)
    run_media_checks(browser)
    run_accessible_check(browser)
    run_site_checks(browser)
    browser.close()
    browser = playwright.chromium.launch(**launch_options)
    run_risk_session(browser)
    run_cross_origin_embed(browser)
    browser.close()

print("browser smoke passed")
