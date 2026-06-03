#!/usr/bin/env python3
"""
Test whether CSS selectors used by the ShareLM extension still match
the live DOM of each supported LLM platform.

Selectors are loaded from extension/selectors.js (single source of truth).

The test is semi-automated: a headed browser opens for each platform so you
can solve captchas or log in if needed, then the script checks selectors
automatically.

Usage:
    python scripts/test_selectors.py              # Test all platforms
    python scripts/test_selectors.py -p chatgpt   # Test single platform
    python scripts/test_selectors.py -p chatgpt -p claude  # Test multiple
    python scripts/test_selectors.py --setup       # Login-only (save auth state)
    python scripts/test_selectors.py --inspect -p claude  # Inspect DOM to find new selectors

Dependencies:
    pip install playwright json5 && playwright install chromium
"""

from __future__ import annotations

import argparse
import json
import re
import select
import sys
import threading
from pathlib import Path

import json5
from playwright.sync_api import sync_playwright, TimeoutError as PlaywrightTimeout

SCRIPT_DIR = Path(__file__).parent
REPO_ROOT = SCRIPT_DIR.parent
SELECTORS_JS_PATH = REPO_ROOT / "extension" / "selectors.js"
AUTH_STATE_DIR = SCRIPT_DIR / "auth_state"
SCREENSHOTS_DIR = SCRIPT_DIR / "screenshots"

# Platforms that use only URL-based detection (no fixed URL for testing)
SKIP_PLATFORMS = {"gradio", "chatui"}

DETECTION_TIMEOUT = 15_000  # ms
MESSAGE_TIMEOUT = 10_000  # ms


def load_selectors() -> dict:
    """Parse SHARELM_SELECTORS from extension/selectors.js using json5."""
    js_source = SELECTORS_JS_PATH.read_text()
    match = re.search(
        r"var\s+SHARELM_SELECTORS\s*=\s*(\{.*\})\s*;", js_source, re.DOTALL
    )
    if not match:
        print(f"ERROR: Could not parse SHARELM_SELECTORS from {SELECTORS_JS_PATH}")
        sys.exit(1)
    return json5.loads(match.group(1))


def build_platforms(selectors: dict) -> dict:
    """Build a PLATFORMS dict for testing from the parsed selectors config."""
    platforms = {}
    for key, cfg in selectors["platforms"].items():
        if key in SKIP_PLATFORMS:
            continue
        url_pattern = cfg.get("url_pattern")
        if not url_pattern:
            continue
        # Build a testable URL from the url_pattern (+ optional test_path)
        test_path = cfg.get("test_path", "")
        url = f"https://{url_pattern}{test_path}"
        platforms[key] = {
            "name": cfg["name"],
            "url": url,
            "detection": cfg.get("detection"),
            "user_msg": cfg["user_msg"],
            "bot_msg": cfg["bot_msg"],
        }
    return platforms


def get_auth_state_path(platform_key: str) -> Path:
    return AUTH_STATE_DIR / f"{platform_key}.json"


def _launch_persistent_context(playwright, key: str):
    """Launch a persistent headed browser context for interactive use."""
    user_data_dir = AUTH_STATE_DIR / f"{key}_profile"
    user_data_dir.mkdir(parents=True, exist_ok=True)
    return playwright.chromium.launch_persistent_context(
        str(user_data_dir),
        headless=False,
        channel="chrome",
        args=["--disable-blink-features=AutomationControlled"],
    )


def setup_auth(platforms: dict, platforms_to_setup: list[str] | None):
    """Open a headed browser for each platform so the user can log in manually."""
    keys = platforms_to_setup or list(platforms.keys())
    AUTH_STATE_DIR.mkdir(parents=True, exist_ok=True)

    with sync_playwright() as p:
        for key in keys:
            cfg = platforms.get(key)
            if cfg is None:
                print(f"Unknown platform: {key}")
                continue

            print(f"\n--- Setting up auth for {cfg['name']} ({cfg['url']}) ---")
            context = _launch_persistent_context(p, key)
            page = context.new_page()
            page.goto(cfg["url"], wait_until="domcontentloaded")

            input(
                f"Log in to {cfg['name']} in the browser window, then press Enter here to save state..."
            )

            state_path = get_auth_state_path(key)
            context.storage_state(path=str(state_path))
            print(f"Auth state saved to {state_path}")
            context.close()

    print("\nSetup complete.")


def check_selector(page, selector: str, timeout: int) -> tuple[str, int]:
    """Try to find a selector on the page. Returns (status, count)."""
    try:
        page.wait_for_selector(selector, timeout=timeout)
        count = len(page.query_selector_all(selector))
        return ("PASS", count)
    except PlaywrightTimeout:
        return ("FAIL", 0)
    except Exception as e:
        return (f"ERROR: {e}", 0)


class _SkipFlag:
    """Thread-safe flag that is set when the user presses Enter to skip."""

    def __init__(self):
        self._event = threading.Event()

    def request_skip(self):
        self._event.set()

    @property
    def skipped(self) -> bool:
        return self._event.is_set()

    def reset(self):
        self._event.clear()


def _wait_for_enter(skip_flag: _SkipFlag):
    """Background thread: blocks on stdin, sets the skip flag on Enter."""
    try:
        input()
        skip_flag.request_skip()
    except EOFError:
        pass


def check_selector_skippable(
    page, selector: str, timeout_ms: int, skip_flag: _SkipFlag
) -> tuple[str, int]:
    """Poll for a selector in short intervals, checking the skip flag between polls."""
    poll_ms = 2000  # check every 2s
    elapsed = 0
    while elapsed < timeout_ms:
        if skip_flag.skipped:
            return ("SKIP", 0)
        try:
            page.wait_for_selector(selector, timeout=poll_ms)
            count = len(page.query_selector_all(selector))
            return ("PASS", count)
        except PlaywrightTimeout:
            elapsed += poll_ms
        except Exception as e:
            return (f"ERROR: {e}", 0)
    return ("FAIL", 0)


def test_platform(playwright, key: str, cfg: dict) -> dict:
    """Test a single platform's selectors using a headed persistent browser.

    Opens a real browser window so the user can solve captchas if needed,
    waits for the detection selector (or a timeout), then checks all selectors.
    Press Enter in the terminal to skip to the next platform.
    """
    result = {
        "platform": cfg["name"],
        "detection": "SKIP",
        "user_msg": "SKIP",
        "bot_msg": "SKIP",
        "notes": [],
    }

    skip_flag = _SkipFlag()

    AUTH_STATE_DIR.mkdir(parents=True, exist_ok=True)
    context = _launch_persistent_context(playwright, key)
    page = context.new_page()

    try:
        page.goto(cfg["url"], wait_until="domcontentloaded", timeout=30_000)

        # Start a background thread that listens for Enter to skip
        skip_thread = threading.Thread(
            target=_wait_for_enter, args=(skip_flag,), daemon=True
        )
        skip_thread.start()

        # Wait for the detection selector — this gives the user time to solve
        # any captcha that appears.  If the site has no detection selector
        # (URL-only) we just wait for network idle instead.
        if cfg["detection"] is None:
            result["detection"] = "SKIP"
            result["notes"].append("No detection selector (URL-based)")
            print(
                f"  {cfg['name']}: waiting for page to settle "
                f"(press Enter to skip)...",
                flush=True,
            )
            try:
                page.wait_for_load_state("networkidle", timeout=30_000)
            except PlaywrightTimeout:
                result["notes"].append("Network did not fully idle")
        else:
            print(
                f"  {cfg['name']}: waiting for detection selector "
                f"(solve captcha if needed, press Enter to skip)...",
                flush=True,
            )
            status, count = check_selector_skippable(
                page, cfg["detection"], DETECTION_TIMEOUT * 4, skip_flag  # 60s
            )
            if skip_flag.skipped:
                result["detection"] = "SKIP"
                result["notes"].append("Skipped by user")
            else:
                result["detection"] = (
                    status if status in ("PASS", "FAIL") else "ERROR"
                )
                if status == "FAIL":
                    result["notes"].append("Detection selector not found")
                elif status not in ("PASS", "FAIL"):
                    result["notes"].append(status)

        if not skip_flag.skipped:
            # Check message selectors (WARN instead of FAIL — messages need an open conversation)
            for msg_type in ("user_msg", "bot_msg"):
                selector = cfg[msg_type]
                status, count = check_selector(page, selector, MESSAGE_TIMEOUT)
                if status == "PASS":
                    result[msg_type] = f"PASS({count})"
                elif status == "FAIL":
                    result[msg_type] = "WARN"
                else:
                    result[msg_type] = "ERROR"
                    result["notes"].append(f"{msg_type}: {status}")

        # Save screenshot
        SCREENSHOTS_DIR.mkdir(parents=True, exist_ok=True)
        screenshot_path = SCREENSHOTS_DIR / f"{key}.png"
        page.screenshot(path=str(screenshot_path), full_page=False)

    except PlaywrightTimeout:
        result["notes"].append("Page load timed out")
    except Exception as e:
        result["notes"].append(f"Error: {e}")
    finally:
        context.close()

    return result


def inspect_platform(playwright, key: str, cfg: dict):
    """Open a platform in a headed browser and dump DOM info to help find new selectors.

    Usage: python scripts/test_selectors.py --inspect -p claude
    """
    AUTH_STATE_DIR.mkdir(parents=True, exist_ok=True)
    context = _launch_persistent_context(playwright, key)
    page = context.new_page()

    print(f"\n--- Inspecting {cfg['name']} ({cfg['url']}) ---")
    page.goto(cfg["url"], wait_until="domcontentloaded", timeout=30_000)

    input("Solve captcha / log in if needed, then press Enter to inspect...")

    info = page.evaluate(r'''() => {
        const results = {};

        // Body > div structure
        const bodyChildren = Array.from(document.body.children)
            .filter(el => el.tagName === 'DIV');
        results.body_divs = bodyChildren.map((d, i) => ({
            index: i,
            tag: d.tagName,
            id: d.id || null,
            className: d.className.substring(0, 150),
            children: d.children.length,
        }));

        // All data-testid values on the page
        const testIds = new Set();
        document.querySelectorAll('[data-testid]').forEach(el => {
            testIds.add(el.getAttribute('data-testid'));
        });
        results.data_testids = Array.from(testIds).sort();

        // All data-* attributes (deduplicated by name)
        const dataAttrs = new Set();
        document.querySelectorAll('*').forEach(el => {
            for (const attr of el.attributes) {
                if (attr.name.startsWith('data-') && attr.name !== 'data-tracked') {
                    dataAttrs.add(attr.name);
                }
            }
        });
        results.data_attributes = Array.from(dataAttrs).sort();

        // Check current selectors from config
        const currentSelectors = {};
        const selectorsToCheck = JSON.parse(
            document.body.getAttribute('data-inspect-selectors') || '[]'
        );
        for (const [label, sel] of selectorsToCheck) {
            try {
                currentSelectors[label] = document.querySelectorAll(sel).length;
            } catch (e) {
                currentSelectors[label] = 'error: ' + e.message;
            }
        }
        results.current_selectors = currentSelectors;

        // Find elements with substantial text that look like messages
        const messageCandidates = [];
        const walker = document.createTreeWalker(
            document.body, NodeFilter.SHOW_ELEMENT
        );
        while (walker.nextNode()) {
            const el = walker.currentNode;
            const text = el.textContent || '';
            // Skip huge containers, look for leaf-ish elements with text
            if (text.length > 10 && text.length < 2000 && el.children.length < 20) {
                const isNearLeaf = Array.from(el.children).every(
                    c => (c.textContent || '').length < text.length
                );
                if (!isNearLeaf) continue;
                // Skip script/style
                if (['SCRIPT', 'STYLE', 'NOSCRIPT'].includes(el.tagName)) continue;

                const entry = {
                    tag: el.tagName,
                    id: el.id || null,
                    className: (el.className || '').substring(0, 100),
                    testid: el.getAttribute('data-testid'),
                    role: el.getAttribute('role'),
                    textPreview: text.substring(0, 80).replace(/\s+/g, ' '),
                };
                // Build a CSS path hint
                const parts = [];
                let cur = el;
                for (let i = 0; i < 4 && cur && cur !== document.body; i++) {
                    let part = cur.tagName.toLowerCase();
                    if (cur.id) part += '#' + cur.id;
                    else if (cur.getAttribute('data-testid'))
                        part += '[data-testid="' + cur.getAttribute('data-testid') + '"]';
                    else if (cur.className) {
                        const cls = cur.className.split(' ')[0];
                        if (cls) part += '.' + cls;
                    }
                    parts.unshift(part);
                    cur = cur.parentElement;
                }
                entry.path_hint = parts.join(' > ');
                messageCandidates.push(entry);
            }
        }

        // Deduplicate by path_hint, keep first 30
        const seen = new Set();
        results.message_candidates = messageCandidates
            .filter(c => {
                if (seen.has(c.path_hint)) return false;
                seen.add(c.path_hint);
                return true;
            })
            .slice(0, 30);

        return results;
    }''')

    # Pass the current selectors into the page for checking
    selectors_to_check = [
        ["detection", cfg["detection"] or ""],
        ["user_msg", cfg["user_msg"]],
        ["bot_msg", cfg["bot_msg"]],
    ]
    page.evaluate(
        f"document.body.setAttribute('data-inspect-selectors', {repr(json.dumps(selectors_to_check))})"
    )
    # Re-run the selector check part
    selector_results = page.evaluate(r'''() => {
        const selectorsToCheck = JSON.parse(
            document.body.getAttribute('data-inspect-selectors') || '[]'
        );
        const results = {};
        for (const [label, sel] of selectorsToCheck) {
            if (!sel) { results[label] = 'N/A'; continue; }
            try {
                results[label] = document.querySelectorAll(sel).length;
            } catch (e) {
                results[label] = 'error: ' + e.message;
            }
        }
        return results;
    }''')
    info["current_selectors"] = selector_results

    import json as json_mod
    print("\n=== Current Selector Results ===")
    for label, count in info["current_selectors"].items():
        status = "PASS" if isinstance(count, int) and count > 0 else "FAIL"
        print(f"  {label}: {status} (matches: {count})")

    print(f"\n=== Body > div structure ({len(info['body_divs'])} divs) ===")
    for d in info["body_divs"]:
        print(f"  [{d['index']}] id={d['id']}  class=\"{d['className']}\"  children={d['children']}")

    print(f"\n=== data-testid values ({len(info['data_testids'])}) ===")
    for tid in info["data_testids"]:
        print(f"  {tid}")

    print(f"\n=== Message-like elements ({len(info['message_candidates'])}) ===")
    for c in info["message_candidates"]:
        testid_str = f"  data-testid=\"{c['testid']}\"" if c["testid"] else ""
        print(f"  {c['path_hint']}{testid_str}")
        print(f"    text: {c['textPreview']}")

    # Save screenshot
    SCREENSHOTS_DIR.mkdir(parents=True, exist_ok=True)
    screenshot_path = SCREENSHOTS_DIR / f"{key}_inspect.png"
    page.screenshot(path=str(screenshot_path), full_page=False)
    print(f"\nScreenshot saved to {screenshot_path}")

    context.close()


def print_results(results: list[dict]) -> bool:
    """Print a formatted results table. Returns True if all detection selectors passed/skipped."""
    col_widths = {
        "platform": max(len(r["platform"]) for r in results),
        "detection": max(len(r["detection"]) for r in results),
        "user_msg": max(len(r["user_msg"]) for r in results),
        "bot_msg": max(len(r["bot_msg"]) for r in results),
    }
    # Ensure minimum widths for headers
    col_widths["platform"] = max(col_widths["platform"], 11)
    col_widths["detection"] = max(col_widths["detection"], 9)
    col_widths["user_msg"] = max(col_widths["user_msg"], 9)
    col_widths["bot_msg"] = max(col_widths["bot_msg"], 8)

    header = (
        f"{'Platform':<{col_widths['platform']}} | "
        f"{'Detection':<{col_widths['detection']}} | "
        f"{'User Msgs':<{col_widths['user_msg']}} | "
        f"{'Bot Msgs':<{col_widths['bot_msg']}} | "
        f"Notes"
    )
    separator = (
        f"{'-' * col_widths['platform']}-+-"
        f"{'-' * col_widths['detection']}-+-"
        f"{'-' * col_widths['user_msg']}-+-"
        f"{'-' * col_widths['bot_msg']}-+-"
        f"{'-' * 30}"
    )

    print()
    print(header)
    print(separator)

    all_passed = True
    for r in results:
        notes = "; ".join(r["notes"]) if r["notes"] else ""
        print(
            f"{r['platform']:<{col_widths['platform']}} | "
            f"{r['detection']:<{col_widths['detection']}} | "
            f"{r['user_msg']:<{col_widths['user_msg']}} | "
            f"{r['bot_msg']:<{col_widths['bot_msg']}} | "
            f"{notes}"
        )
        if r["detection"] not in ("PASS", "SKIP"):
            all_passed = False

    print()
    return all_passed


def main():
    # Load selectors and build platform configs
    selectors = load_selectors()
    platforms = build_platforms(selectors)
    valid_keys = list(platforms.keys())

    parser = argparse.ArgumentParser(
        description="Test ShareLM extension CSS selectors against live LLM platforms."
    )
    parser.add_argument(
        "--setup",
        action="store_true",
        help="Login-only mode: open a browser for each platform to log in and save auth state.",
    )
    parser.add_argument(
        "--inspect",
        action="store_true",
        help="Inspect mode: open a platform and dump DOM info to help find new selectors.",
    )
    parser.add_argument(
        "-p",
        "--platform",
        action="append",
        dest="platforms",
        choices=valid_keys,
        help=f"Test specific platform(s). Can be repeated. Default: all. Choices: {', '.join(valid_keys)}",
    )
    args = parser.parse_args()

    if args.setup:
        setup_auth(platforms, args.platforms)
        return

    if args.inspect:
        if not args.platforms:
            parser.error("--inspect requires at least one -p <platform>")
        with sync_playwright() as p:
            for key in args.platforms:
                inspect_platform(p, key, platforms[key])
        return

    keys = args.platforms or valid_keys
    results = []

    with sync_playwright() as p:
        for key in keys:
            cfg = platforms[key]
            print(f"Testing {cfg['name']}...", flush=True)
            result = test_platform(p, key, cfg)
            results.append(result)

    all_passed = print_results(results)
    sys.exit(0 if all_passed else 1)


if __name__ == "__main__":
    main()
