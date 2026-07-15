# Copyright (c) 2026 Shane Smith / Sassy Consulting LLC. All rights reserved.
# Proprietary source. This notice is Copyright Management Information (17 U.S.C. 1202); removal or alteration prohibited.
# CodeMark: SCLLC1-sassyconsultingllc_cloudflare-PBYHN5AW73U5
"""Send the Sassy Consulting public site UI to Inception Mercury-2 for a UI revamp pass.

Sibling of mercury_audit.py. Where the audit script does strict security/bug-hunting,
this one swaps the prompt for a senior-product-designer brief that produces a
concrete UI revamp of the marketing pages:

  - critique of current layout, visual hierarchy, and conversion path
  - revised HTML/CSS for the home and one product page
  - extracted-component suggestions (CSS classes / reusable blocks)
  - accessibility notes

Output: audits/mercury_sassy_revamp.md.

Usage:
    set INCEPTION_API_KEY=...
    python mercury_revamp.py
    python mercury_revamp.py bundle   # write bundle only, no API call
"""
import os
import sys
import json
import urllib.request
import urllib.error
from pathlib import Path

API_URL = "https://api.inceptionlabs.ai/v1/chat/completions"
MODEL = "mercury-2"

ROOT = Path(__file__).resolve().parent
OUT_DIR = ROOT / "audits"

PUBLIC_DIR = ROOT / "public"

# Mercury-2 rejects payloads above ~250 KB; split UI surface into A and B halves.
# Part A: home + 3 flagship product pages + shared CSS + app.js (the redesign target).
# Part B: remaining marketing/legal pages + design-system.css + smaller JS (reference for sibling-page consistency).
UI_INCLUDE_A = {
    "index.html",
    "browser.html",
    "sassy-talk.html",
    "winforensics.html",
    "styles.css",
    "app.js",
}
UI_INCLUDE_B = {
    "website-creator.html",
    "pricing.html",
    "contact.html",
    "app-testers.html",
    "aboutme.html",
    "design-system.css",
    "checkout.js",
    "glossary.js",
}
SKIP_DIR_NAMES = {"node_modules", ".git", ".wrangler", "build", "dist", ".cache"}


def collect(names):
    files = []
    for p in PUBLIC_DIR.rglob("*"):
        if not p.is_file():
            continue
        if any(part in SKIP_DIR_NAMES for part in p.parts):
            continue
        if p.parent != PUBLIC_DIR:
            continue
        if p.name in names:
            files.append(p)
    return sorted(files)


def bundle(paths, label):
    parts = [f"# {label}\n"]
    for p in sorted(paths):
        try:
            rel = p.relative_to(ROOT)
        except ValueError:
            rel = p.name
        try:
            text = p.read_text(encoding="utf-8", errors="replace")
        except Exception as e:
            text = f"<<read error: {e}>>"
        parts.append(f"\n\n===== FILE: {rel} =====\n{text}")
    return "".join(parts)


SYSTEM_PROMPT = """You are a senior product designer + front-end engineer reviewing the public marketing site for Sassy Consulting LLC (sassyconsultingllc.com). The stack is plain HTML + CSS + a small amount of vanilla JS, served as static assets from Cloudflare Workers. There is NO build step. Each HTML file is self-contained except for shared styles in public/styles.css and public/design-system.css.

The brand identity (already established, do NOT change):
- Dark theme. Background #0a0a0a / #111111 / #141414. Card #1a1a1a. Borders #222/#333.
- Accent green #22c55e (primary CTA) with secondary green #16a34a and an accent-glow rgba(34,197,94,0.15).
- Gradient brand: linear-gradient(90deg, #22c55e, #06b6d4) used on H1 highlights.
- Fonts: DM Serif Display (display), DM Sans (body), JetBrains Mono (tags/badges).
- Sharp corners aside from inputs/cards (8–16px). Rounded badges are pill-shaped.
- Pulse-dot indicator for "live" / status badges.

Your job is a REDESIGN PASS, not a bug hunt. Produce:

1. SHORT CRITIQUE of the current site — what's cluttered, where the hierarchy is wrong, what's hidden, what's clipped on narrow screens (320–360 px), where the primary CTA is weak, where the page lacks a clear "what is this and why should I care" hero. Be specific: file:line anchored.

2. REVISED HTML/CSS for the home page (public/index.html) — at minimum the hero section + the first viewport of product cards. Give the full revised HTML for the sections you touch, plus any CSS deltas (added to inline <style> blocks or to design-system.css). Don't rewrite the whole 900-line file — call out the sections you're replacing and provide drop-in replacements.

3. REVISED HTML/CSS for ONE product page of your choice (public/browser.html, sassy-talk.html, winforensics.html, or website-creator.html). Pick whichever has the weakest current design and rebuild its hero + feature grid + CTA section.

4. ONE OR TWO RECOMMENDED EXTRACTIONS — repeated patterns across pages (hero, product card, feature grid, footer, nav) that should be standardized in design-system.css. Give the CSS classes + a usage example.

5. ACCESSIBILITY NOTES — touch targets (≥44x44), labels (every form input must have an associated label), contrast (test the green-on-dark-card combos), focus rings (don't suppress outline: none without replacing it), landmark/aria.

Constraints:
- Stay on the existing dark theme. Don't switch to light. Keep the green/cyan gradient.
- Plain HTML + CSS + vanilla JS only. No frameworks, no Tailwind, no React, no build step.
- Mobile-first: layouts MUST not horizontal-scroll on 360 px.
- Preserve existing functionality: every product card still links to its page, forms still POST to the same /api/* endpoints, navigation still includes the same items.
- ALREADY IN PROGRESS (do not re-flag): there is automated link auditing (scripts/audit-links.mjs) and a recent commit fixed dead links + legal/anchor consistency. Critique the design, not the link hygiene.
- The site sells products (paid + free downloads + a beta-tester program). Make the value proposition clearer and the next action obvious.

Output FORMAT:

## Critique
... (bulleted, file:line anchored)

## Home redesign
### Hero
```html
<!-- replaces section .hero in public/index.html (lines XX–YY) -->
... full HTML
```

### Product cards section
```html
... full HTML
```

### CSS additions
```css
/* additions to inline <style> or public/design-system.css */
...
```

## Product page redesign — <choice>.html
(same structure)

## Recommended extractions / design-system additions
(one or two reusable patterns with CSS + usage)

## Accessibility notes
...

Be opinionated. The current site is dense and product-heavy. Push for one clear primary action per page, stronger heroes, and a calmer rhythm between sections."""


def call_mercury(user_content, label):
    key = os.environ.get("INCEPTION_API_KEY")
    if not key:
        raise SystemExit("INCEPTION_API_KEY env var not set")
    payload = {
        "model": MODEL,
        "messages": [
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": user_content},
        ],
        "temperature": 0.3,
        "max_tokens": 50000,
    }
    body = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(
        API_URL,
        data=body,
        headers={
            "Authorization": f"Bearer {key}",
            "Content-Type": "application/json",
        },
        method="POST",
    )
    print(f"[{label}] POST {API_URL}  payload={len(body)/1024:.1f} KB", flush=True)
    try:
        with urllib.request.urlopen(req, timeout=900) as resp:
            data = json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        err = e.read().decode("utf-8", errors="replace")
        print(f"[{label}] HTTP {e.code}: {err}", flush=True)
        raise
    msg = data["choices"][0]["message"]["content"]
    usage = data.get("usage", {})
    print(
        f"[{label}] tokens prompt={usage.get('prompt_tokens')} "
        f"completion={usage.get('completion_tokens')}",
        flush=True,
    )
    return msg


def main():
    OUT_DIR.mkdir(exist_ok=True)

    a_files = collect(UI_INCLUDE_A)
    b_files = collect(UI_INCLUDE_B)
    a_bundle = bundle(a_files, "PUBLIC UI — PART A (home + flagship product pages + styles.css + app.js)")
    b_bundle = bundle(b_files, "PUBLIC UI — PART B (remaining marketing/legal pages + design-system.css + checkout/glossary JS)")

    (OUT_DIR / "mercury_sassy_ui_a_bundle.txt").write_text(a_bundle, encoding="utf-8")
    (OUT_DIR / "mercury_sassy_ui_b_bundle.txt").write_text(b_bundle, encoding="utf-8")
    print(f"UI-A bundle: {len(a_bundle)/1024:.1f} KB ({len(a_files)} files)")
    print(f"UI-B bundle: {len(b_bundle)/1024:.1f} KB ({len(b_files)} files)")

    target = sys.argv[1] if len(sys.argv) > 1 else "all"
    if target == "bundle":
        return

    intro = (
        "Here is part of the public UI surface of sassyconsultingllc.com. Produce the redesign "
        "pass described in the system prompt — anchor critique to the files in THIS bundle, but "
        "the redesign brief still applies (hero + product-card rebuild on the home page, plus "
        "one product page rebuild from whatever pages appear in this bundle).\n\n"
    )

    jobs = []
    if target in ("a", "ui-a", "all"):
        jobs.append(("ui-revamp-a", intro + a_bundle))
    if target in ("b", "ui-b", "all"):
        jobs.append(("ui-revamp-b", intro + b_bundle))

    for label, user_msg in jobs:
        report = call_mercury(user_msg, label)
        out = OUT_DIR / f"mercury_sassy_{label.replace('-', '_')}_report.md"
        out.write_text(report, encoding="utf-8")
        print(f"wrote {out.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
