from __future__ import annotations

import json
import os
from pathlib import Path

from playwright.sync_api import sync_playwright


BASE = os.environ.get("OXY_TEST_BASE", "http://127.0.0.1:8897").rstrip("/")
HOST_BASE = os.environ.get("OXY_TEST_HOST_BASE", "http://127.0.0.1:8899").rstrip("/")
HOST_PATH = os.environ.get("OXY_TEST_HOST_PATH", "/")
SITE_KEY = os.environ.get("OXY_TEST_SITE_KEY", "oc_dev_public")
OUT = Path("_devdocs/evidence/alpha7")
OUT.mkdir(parents=True, exist_ok=True)


def no_overflow(page) -> None:
    sizes = page.evaluate(
        """() => ({
          scrollWidth: document.documentElement.scrollWidth,
          clientWidth: document.documentElement.clientWidth,
          innerWidth: window.innerWidth
        })"""
    )
    assert sizes["scrollWidth"] <= sizes["innerWidth"] + 1, sizes
    assert sizes["scrollWidth"] <= sizes["clientWidth"] + 1, sizes


with sync_playwright() as playwright:
    launch_options = {
        "headless": True,
        "args": [
            "--disable-gpu-sandbox",
            "--disable-web-security",
            "--disable-features=BlockInsecurePrivateNetworkRequests,PrivateNetworkAccessSendPreflights",
        ],
    }
    edge_path = os.environ.get(
        "PLAYWRIGHT_BROWSER_PATH",
        r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe",
    )
    if Path(edge_path).exists():
        launch_options["executable_path"] = edge_path
    browser = playwright.chromium.launch(**launch_options)
    try:
        context = browser.new_context(viewport={"width": 900, "height": 760})
        host = context.new_page()
        console_messages: list[str] = []
        host.on("console", lambda message: console_messages.append(message.text))
        host.on("pageerror", lambda error: console_messages.append(str(error)))
        host.route(
            f"{HOST_BASE}{HOST_PATH}",
            lambda route: route.fulfill(
                status=200,
                content_type="text/html",
                body=f"""<!doctype html>
<html><head><meta charset="utf-8"><title>Animation host</title>
<style>
body{{margin:0;background:#f5f5f7;font:16px system-ui;padding:48px}}
form{{max-width:420px;margin:auto}}button{{min-height:44px;margin-top:12px}}
</style></head><body><form>
<oxygen-challenge sitekey="{SITE_KEY}" action="submit" challenge-type="human_check"></oxygen-challenge>
<button type="submit">Continue</button>
</form><script src="{BASE}/widget.js" defer></script></body></html>""",
            ),
        )
        host.goto(f"{HOST_BASE}{HOST_PATH}", wait_until="networkidle")
        widget = host.locator("oxygen-challenge")
        widget.wait_for(state="attached")
        try:
            host.wait_for_function(
                "() => Boolean(document.querySelector('oxygen-challenge')?.shadowRoot)"
            )
        except Exception as error:
            print("console", console_messages)
            print("page", host.content())
            raise error
        host.evaluate(
            """() => {
              window.__events = { verified: [], complete: [] };
              const widget = document.querySelector('oxygen-challenge');
              widget.addEventListener('oxygenchallenge:verified', event => {
                window.__events.verified.push(event.detail);
              });
              widget.addEventListener('oxygenchallenge:complete', event => {
                window.__events.complete.push(event.detail);
              });
            }"""
        )
        iframe_handle = widget.evaluate_handle(
            "(el) => el.shadowRoot.querySelector('iframe')"
        ).as_element()
        assert iframe_handle
        iframe_src = widget.evaluate(
            "(el) => el.shadowRoot.querySelector('iframe').src"
        )
        assert "apiVersion=2" in iframe_src
        assert "clientContext=" in iframe_src
        frame = iframe_handle.content_frame()
        assert frame
        frame.wait_for_selector("#oc-entry-check", state="visible")
        initial_height = widget.evaluate(
            "(el) => el.shadowRoot.querySelector('iframe').getBoundingClientRect().height"
        )
        assert 90 <= initial_height <= 110, initial_height
        host.evaluate(
            """() => {
              window.__ocMessages = [];
              window.addEventListener('message', event => {
                window.__ocMessages.push({
                  origin: event.origin,
                  type: event.data?.type,
                  height: event.data?.height
                });
              });
              window.__expansionHeights = [];
              const start = performance.now();
              const sample = () => {
                const frame = document.querySelector('oxygen-challenge')
                  ?.shadowRoot?.querySelector('iframe');
                if (frame) window.__expansionHeights.push(frame.getBoundingClientRect().height);
                if (performance.now() - start < 1800) requestAnimationFrame(sample);
              };
              sample();
            }"""
        )
        frame.locator("#oc-entry-check").click()
        try:
            frame.wait_for_selector("#oc-form", state="visible")
        except Exception:
            print("frame-state", {"url": frame.url, "body": frame.content()[:1200]})
            raise
        scrollbar_style = frame.evaluate(
            """() => ({
              scrollbarWidth: getComputedStyle(document.documentElement).scrollbarWidth,
              bodyOverflowX: getComputedStyle(document.body).overflowX
            })"""
        )
        assert scrollbar_style == {"scrollbarWidth": "none", "bodyOverflowX": "hidden"}
        host.wait_for_timeout(900)
        expansion_heights = host.evaluate("window.__expansionHeights")
        expanded_height = max(expansion_heights)
        if expanded_height <= initial_height + 100:
            print(
                "expansion-debug",
                host.evaluate(
                    """() => ({
                      messages: window.__ocMessages,
                      src: document.querySelector('oxygen-challenge')
                        ?.shadowRoot?.querySelector('iframe')?.src
                    })"""
                ),
                {"frameUrl": frame.url, "frameBody": frame.content()[:400]},
            )
        assert expanded_height > initial_height + 100, expansion_heights
        expansion_mid = {
            round(value)
            for value in expansion_heights
            if initial_height + 8 < value < expanded_height - 8
        }
        assert len(expansion_mid) >= 3, expansion_heights

        assert frame.locator("body").get_attribute("data-challenge-type") == "human_check"
        minimum = int(
            frame.locator("#oc-human-check").get_attribute("data-min-dwell") or "800"
        )
        frame.locator("#oc-human-check").click()
        assert frame.locator("#oc-human-input").is_checked()
        frame.wait_for_timeout(minimum + 180)
        assert frame.locator("#oc-submit").is_enabled()
        host.evaluate(
            """() => {
              window.__collapseHeights = [];
              const start = performance.now();
              const timer = setInterval(() => {
                const frame = document.querySelector('oxygen-challenge')
                  ?.shadowRoot?.querySelector('iframe');
                if (frame) window.__collapseHeights.push(frame.getBoundingClientRect().height);
                if (performance.now() - start >= 1800) clearInterval(timer);
              }, 16);
            }"""
        )
        frame.locator("#oc-submit").click()
        try:
            host.wait_for_function(
                """() => document.querySelector('oxygen-challenge')
                  ?.shadowRoot?.querySelector('.oc-success-label')
                  ?.textContent.includes('验证通过')"""
            )
        except Exception:
            print(
                "widget-state",
                host.evaluate(
                    """() => ({
                      events: window.__events,
                      hidden: document.querySelector('form input[name="oxygen-token"]')?.value,
                      html: document.querySelector('oxygen-challenge')?.shadowRoot?.innerHTML
                    })"""
                ),
            )
            raise
        host.wait_for_timeout(500)
        collapse_heights = host.evaluate("window.__collapseHeights")
        final_height = widget.bounding_box()["height"]
        assert max(collapse_heights) > final_height + 100, collapse_heights
        collapse_mid = {
            round(value)
            for value in collapse_heights
            if final_height + 8 < value < max(collapse_heights) - 8
        }
        assert len(collapse_mid) >= 3, collapse_heights
        assert host.evaluate("window.__events.verified.length") == 1
        assert host.evaluate("window.__events.complete.length") == 1
        token = widget.evaluate(
            """(el) => el.closest('form')
              ?.querySelector('input[name="oxygen-token"]')?.value"""
        )
        assert token and token.count(".") == 2
        assert widget.evaluate("(el) => el.querySelector('input') === null")
        assert widget.evaluate(
            "(el) => el.shadowRoot.querySelector('.oc-success-label')?.textContent"
        ) == "验证通过"
        assert widget.evaluate(
            "(el) => Boolean(el.shadowRoot.querySelector('svg.oc-success-mark'))"
        )
        assert widget.evaluate("(el) => el.shadowRoot.querySelector('iframe') === null")
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
        host.evaluate(
            """() => {
              const current = document.querySelector('oxygen-challenge');
              const replacement = document.createElement('oxygen-challenge');
              for (const attribute of current.attributes) {
                replacement.setAttribute(attribute.name, attribute.value);
              }
              current.replaceWith(replacement);
            }"""
        )
        host.wait_for_timeout(300)
        restored_widget = host.locator("oxygen-challenge")
        assert restored_widget.evaluate(
            "(el) => el.shadowRoot.querySelector('.oc-success-label')?.textContent"
        ) == "验证通过"
        assert restored_widget.evaluate(
            "(el) => Boolean(el.shadowRoot.querySelector('svg.oc-success-mark'))"
        )
        assert restored_widget.evaluate(
            "(el) => el.shadowRoot.querySelector('iframe') === null"
        )
        assert host.locator('input[name="oxygen-token"]').input_value() == token
        host.screenshot(path=str(OUT / "host-compact-success.png"), full_page=True)
        context.close()

        docs_context = browser.new_context(viewport={"width": 900, "height": 760})
        docs = docs_context.new_page()
        docs_results = {}
        for path, fragment in (
            ("/docs", "OxygenChallenge Developer Docs"),
            ("/docs/embed", "Embed the widget"),
            ("/docs/integration", "Server integration"),
            ("/docs/platform", "Open Platform"),
        ):
            docs.goto(f"{BASE}{path}", wait_until="networkidle")
            assert docs.locator("#docs-language-banner").is_visible()
            docs.locator('[data-docs-language="en"]').click()
            docs.wait_for_function(
                "() => document.documentElement?.dataset.lang === 'en'"
            )
            heading = docs.locator("h1").inner_text()
            assert fragment in heading, (path, heading)
            no_overflow(docs)
            docs_results[path] = heading
            docs.screenshot(
                path=str(OUT / f"docs-{path.strip('/').replace('/', '-')}.png"),
                full_page=True,
            )
        docs_context.close()

        platform_context = browser.new_context(viewport={"width": 900, "height": 760})
        platform = platform_context.new_page()
        platform.goto(f"{BASE}/platform", wait_until="networkidle")
        assert platform.locator(".panel").is_visible()
        brand_style = platform.locator(".topbar .brand").evaluate(
            """element => ({
              decoration: getComputedStyle(element).textDecorationLine,
              color: getComputedStyle(element).color
            })"""
        )
        assert brand_style["decoration"] == "none", brand_style
        no_overflow(platform)
        platform.screenshot(path=str(OUT / "platform-entry.png"), full_page=True)
        platform_context.close()

        print(
            json.dumps(
                {
                    "initialHeight": initial_height,
                    "expandedHeight": expanded_height,
                    "expansionSamples": len(expansion_mid),
                    "finalHeight": final_height,
                    "collapseSamples": len(collapse_mid),
                    "docs": docs_results,
                },
                ensure_ascii=False,
                indent=2,
            )
        )
    finally:
        browser.close()
