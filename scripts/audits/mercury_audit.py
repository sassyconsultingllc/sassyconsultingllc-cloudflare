"""Send the Sassy Consulting site to Inception Mercury-2 for a security + correctness audit.

Three bundles (frontend split because the full HTML+CSS+JS payload exceeds
Mercury's request size cap):
  - worker      : src/worker.js + wrangler.jsonc + migrations/*.sql + scripts/*.mjs
  - frontend-a  : index.html + the largest product pages + styles.css + app.js
  - frontend-b  : remaining pages (smaller marketing, legal, success) + design-system.css + checkout.js + glossary.js

Each bundle is written to audits/ and POSTed to Mercury-2; reports land back
next to the bundles.

Usage:
    set INCEPTION_API_KEY=...
    python mercury_audit.py             # all three
    python mercury_audit.py worker
    python mercury_audit.py frontend-a
    python mercury_audit.py frontend-b
    python mercury_audit.py frontend    # both frontend halves
    python mercury_audit.py bundles     # write bundles only, no API call
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

WORKER_FILES = [ROOT / "src" / "worker.js"]
WORKER_CONFIGS = ["wrangler.jsonc", "package.json"]
MIGRATION_DIR = ROOT / "migrations"
SCRIPTS_DIR = ROOT / "scripts"

PUBLIC_DIR = ROOT / "public"
FRONTEND_EXTS = {".html", ".js", ".css"}
SKIP_DIR_NAMES = {"node_modules", ".git", ".wrangler", "build", "dist", ".cache"}

# Frontend split (filenames only — full paths are resolved at bundle time).
FRONTEND_A_FILES = {
    "index.html",
    "browser.html",
    "sassy-talk.html",
    "winforensics.html",
    "nda.html",
    "styles.css",
    "app.js",
}
# Everything else under public/ goes into bundle B.


def collect(dirs, exts):
    files = []
    for d in dirs:
        if not d.exists():
            continue
        for p in d.rglob("*"):
            if not p.is_file():
                continue
            if any(part in SKIP_DIR_NAMES for part in p.parts):
                continue
            if p.suffix.lower() in exts:
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


def configs_to_paths(names):
    return [ROOT / n for n in names if (ROOT / n).exists()]


SYSTEM_PROMPT = """You are a principal engineer + application-security reviewer performing a rigorous, no-punches-pulled audit of sassyconsultingllc.com — a public marketing + commerce site for Sassy Consulting LLC. The stack is:

- Static HTML/CSS/JS in public/ served by Cloudflare Workers' static-assets binding (ASSETS).
- A single Cloudflare Worker (src/worker.js) that handles: contact form, app-tester signup, Lemon Squeezy checkout (Pro/Team + one-time apps), license-key validation, R2-gated downloads (public + privacy-policy + gated), email via Resend, a Durable Object PTT relay (PttRoom), and a few JSON endpoints.
- D1 database (contact-submissions) with migrations/*.sql.
- R2 buckets (sassy-downloads, sassy-gated, sassy-privacy).
- Forms post to /api/* and use 302 redirects with ?error= for client display.

Your audit MUST cover:

1. WEB SECURITY (OWASP top-10 class)
   - XSS sinks (innerHTML, dangerous DOM write APIs, template strings injected into the DOM, server responses reflected without escaping, JSON-LD injection).
   - HTML-injection / response-splitting on 302 Location headers built from user input.
   - Open-redirect on any redirect endpoint.
   - CSRF on POST endpoints (contact, app-tester, checkout, license). Note that there is no session cookie auth, but cross-origin form posts to /api/* could still be abused for spam/scrape.
   - SSRF in any worker fetch() call built from user input.
   - SQL injection in D1 queries — verify all .prepare(...).bind(...) usage and look for string concatenation.
   - Header injection / CRLF.
   - Path traversal on R2 keys, asset paths, download endpoints.
   - Mass-assignment / unexpected fields accepted from JSON bodies.

2. SECRETS & CONFIG
   - Any secret accidentally inline in public/* (search for sk_, api keys, bearer, tokens, etc.).
   - console.log of secrets or PII.
   - CORS misconfiguration: Access-Control-Allow-Origin: * combined with credentials, or echoing request Origin without allowlist.
   - Permissive Content-Security-Policy or missing CSP entirely.

3. WORKERS RUNTIME
   - CPU-time budget. Synchronous hot loops, big regex, unbounded JSON parse.
   - Isolate global-state leaks (mutable module-level variables that bleed between requests).
   - waitUntil misuse (using it for required work that the response depends on).
   - Durable Object lifecycle: hibernation, alarm misuse, websocket leaks on PttRoom.
   - R2 / D1 / KV cost surfaces: unbounded list operations, missing pagination, repeated reads.
   - Static assets binding: run_worker_first is set — verify the worker can't shadow a public asset by accident, and the asset fall-through works.

4. INPUT VALIDATION
   - Every form field's length / type / format. The contact, app-tester, and any other forms.
   - Lemon Squeezy / payment params not constructable by the user (variant IDs must be server-side allowlists; webhook HMAC-SHA256 signature must be verified in constant time).
   - Numeric coercion, NaN, Infinity, negative quantities.

5. LICENSE / GATED-DOWNLOAD LOGIC
   - License-key shape, timing-safe compare, rate limit, brute-force.
   - The R2-gated buckets: who can read what, and is the gate effective?
   - Any way to fetch privacy/legal docs by guessing keys or via the gated endpoint.

6. EMAIL / RESEND
   - Reply-To header injection (user-supplied email reaching the header).
   - Subject-line injection (newlines).
   - From-address forgery if Resend's domain isn't locked down (review the From header construction).

7. CORRECTNESS
   - Off-by-one, broken invariants, dead code, unreachable branches, stale state, error swallowed.
   - JSON parse without try/catch where the request body isn't trusted.
   - Race conditions in Durable Object request handling.

8. HTTP HYGIENE
   - Cache-Control on dynamic responses (don't cache POST / PII).
   - Cookie flags: HttpOnly, Secure, SameSite=Strict|Lax on anything that sets a cookie.
   - Method enforcement: GET-only routes that accept POST and vice versa.

9. SEO & TRUST (light pass only)
   - robots.txt, sitemap.xml correctness.
   - JSON-LD structured data: validity, mismatched URLs, claims not matching the page.
   - Canonical / OG / Twitter meta consistency.

10. FEASIBILITY / FEATURE COMPLETENESS
    - Are advertised products on the homepage actually reachable (no 404, no orphan pages)?
    - Does the worker actually implement the endpoints the HTML forms post to?
    - Any link/route that promises a download / page that doesn't exist?

For every finding emit JSON objects in a single fenced ```json block, one per line, with keys:
  severity: one of [critical, high, medium, low, nit]
  category: one of the 10 above
  file: relative path
  symbol: function/handler/route where applicable (or null)
  issue: what is wrong (one sentence)
  why: why it matters (one sentence, concrete consequence)
  fix: suggested fix (specific, actionable, code sketch if useful)
  confidence: 0.0-1.0

After the JSON block, give a short prose "Top 5 things to fix first" summary and an overall verdict on the security posture.

Do NOT be gentle. Do NOT be generic. Every finding must be anchored to a specific file/handler and a specific consequence. Skip stylistic nits unless they cause bugs or risk. This is a commerce site that takes payments and emails; treat it accordingly."""


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
        "temperature": 0.2,
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

    worker_files = WORKER_FILES + sorted(MIGRATION_DIR.glob("*.sql")) + sorted(SCRIPTS_DIR.glob("*.mjs"))
    worker_files = [p for p in worker_files if p.exists()]
    frontend_files = collect([PUBLIC_DIR], FRONTEND_EXTS)

    frontend_a_files = [p for p in frontend_files if p.name in FRONTEND_A_FILES and p.parent == PUBLIC_DIR]
    frontend_b_files = [p for p in frontend_files if p not in frontend_a_files]

    worker_bundle = (
        bundle(configs_to_paths(WORKER_CONFIGS), "WORKER CONFIG (wrangler.jsonc + package.json)")
        + "\n\n"
        + bundle(worker_files, "WORKER + MIGRATIONS + BUILD SCRIPTS")
    )
    frontend_a_bundle = bundle(frontend_a_files, "PUBLIC SITE — PART A (large pages + global CSS + app.js)")
    frontend_b_bundle = bundle(frontend_b_files, "PUBLIC SITE — PART B (remaining pages + design-system.css + checkout/glossary JS)")

    (OUT_DIR / "mercury_sassy_worker_bundle.txt").write_text(worker_bundle, encoding="utf-8")
    (OUT_DIR / "mercury_sassy_frontend_a_bundle.txt").write_text(frontend_a_bundle, encoding="utf-8")
    (OUT_DIR / "mercury_sassy_frontend_b_bundle.txt").write_text(frontend_b_bundle, encoding="utf-8")
    print(f"Worker     bundle: {len(worker_bundle)/1024:.1f} KB ({len(worker_files)} files)")
    print(f"Frontend-A bundle: {len(frontend_a_bundle)/1024:.1f} KB ({len(frontend_a_files)} files)")
    print(f"Frontend-B bundle: {len(frontend_b_bundle)/1024:.1f} KB ({len(frontend_b_files)} files)")

    worker_user = (
        "Audit the Sassy Consulting Cloudflare Worker (src/worker.js) and its config / migrations / "
        "build scripts. The worker handles: /api/contact, /api/app-tester, /api/checkout (Lemon Squeezy), "
        "/api/verify, /api/webhook (HMAC-SHA256 via X-Signature), /api/license (key validation), "
        "R2-gated downloads, Resend email, a Durable Object PTT relay, and serves static assets via the "
        "ASSETS binding with run_worker_first=true. Be exhaustive on input validation, secret hygiene, "
        "302 redirect injection, SQL injection in D1, Lemon Squeezy variant-ID tampering, webhook "
        "signature timing-safety, CORS, license brute-force, email header injection, and CPU/cost surfaces.\n\n"
        + worker_bundle
    )
    frontend_intro = (
        "Audit this part of the Sassy Consulting public/ static site. The full site is a marketing "
        "site: home, product pages (browser, sassy-talk, winforensics, website-creator, my-best-sites), "
        "pricing, contact, app-tester signup, aboutme, legal (privacy, terms, nda), checkout pages "
        "(Lemon Squeezy), success / contact-success. Forms POST to /api/* worker endpoints. Be exhaustive on "
        "XSS via inline JS, dangerous template-string interpolation, missing CSRF tokens (or argue "
        "they're not needed and why), open-redirect on querystring-driven redirects, dead links, "
        "mismatched JSON-LD, missing noindex on private pages, accessibility regressions in forms, "
        "and any link that promises a download / page that doesn't exist.\n\n"
    )
    frontend_a_user = frontend_intro + frontend_a_bundle
    frontend_b_user = frontend_intro + frontend_b_bundle

    target = sys.argv[1] if len(sys.argv) > 1 else "all"
    if target == "bundles":
        print("bundles-only mode: skipping Mercury-2 calls")
        return

    jobs = []
    if target in ("worker", "all"):
        jobs.append(("worker", worker_user))
    if target in ("frontend-a", "frontend", "all"):
        jobs.append(("frontend_a", frontend_a_user))
    if target in ("frontend-b", "frontend", "all"):
        jobs.append(("frontend_b", frontend_b_user))

    for label, user_msg in jobs:
        report = call_mercury(user_msg, label)
        out = OUT_DIR / f"mercury_sassy_{label}_report.md"
        out.write_text(report, encoding="utf-8")
        print(f"wrote {out.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
