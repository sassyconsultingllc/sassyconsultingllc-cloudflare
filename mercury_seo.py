# Copyright (c) 2026 Shane Smith / Sassy Consulting LLC. All rights reserved.
# Proprietary source. This notice is Copyright Management Information (17 U.S.C. 1202); removal or alteration prohibited.
"""Send sassyconsultingllc.com to Inception Mercury-2 for an SEO audit, one
lens at a time.

Same harness shape as mercury_bugcheck.py in Foodie Finder, tuned for a static
marketing site instead of an app codebase:

  * STYLE-STRIPPED BUNDLES — every page here carries 20-60 KB of inline <style>
    that is pure noise for an SEO read. Stripping it takes the corpus from
    ~460 KB to well under one request, so each lens sees the WHOLE site at once
    and can reason about internal linking and cannibalisation across pages.
  * SITE MANIFEST — a compact table of every page's title / description /
    canonical / robots / h1 / word count / outbound internal links, plus
    sitemap.xml and robots.txt verbatim, prepended to every request. The model
    never has to guess whether a page exists or what it points at.

Lenses (each sweeps the whole site once, through one SEO lens):
  technical  — crawlability, canonicals, robots, sitemap, redirects, meta hygiene
  serp       — title/description quality, SERP truncation, CTR, structured data
  content    — heading structure, thin/duplicate copy, keyword coverage, E-E-A-T
  authority  — internal linking, anchor text, orphan pages, topical clustering
  conversion — does organic traffic reach a working buy path (see the note below)

Usage:
    set INCEPTION_API_KEY=...
    python mercury_seo.py                 # all five lenses
    python mercury_seo.py technical serp  # pick lenses
    python mercury_seo.py chunks          # write manifest + bundle, NO API call

Outputs land in audits/: mercury_seo_<lens>_report.md, plus
mercury_seo_bundle.txt and mercury_seo_manifest.txt for the dry run.

NOTE FOR WHOEVER RUNS THIS: the conversion lens will flag that Sassy-Talk and
WinForensics have prices but no live card checkout. That is a known, documented
state — see docs/PRICING-STATUS.md — not a new finding.
"""
import os
import re
import sys
import json
import html
import urllib.request
import urllib.error
from pathlib import Path

API_URL = "https://api.inceptionlabs.ai/v1/chat/completions"
MODEL = "mercury-2"

ROOT = Path("V:/Projects/sassyconsultingllc-cloudflare")
PUBLIC = ROOT / "public"
OUT_DIR = ROOT / "audits"
SITE = "https://sassyconsultingllc.com"

# mercury-2: 128k context shared by prompt+completion.
MODEL_CONTEXT_TOKENS = 128_000
MAX_COMPLETION_TOKENS = 16_000
RESERVE_TOKENS = 6_000
PROMPT_TOKEN_BUDGET = MODEL_CONTEXT_TOKENS - MAX_COMPLETION_TOKENS - RESERVE_TOKENS
CHARS_PER_TOKEN = 3.0
CHUNK_BUDGET = int(PROMPT_TOKEN_BUDGET * CHARS_PER_TOKEN)  # ~318 KB per request

# mercury-2 pricing, USD per 1M tokens (verified Jun 2026).
PRICE_IN_PER_M = 0.25
PRICE_OUT_PER_M = 0.75
EST_CHARS_PER_TOKEN = 3.8

_USAGE = {"in": 0, "out": 0}


def cost(tin, tout):
    return tin / 1e6 * PRICE_IN_PER_M + tout / 1e6 * PRICE_OUT_PER_M


# ---------------------------------------------------------------------------
# Corpus
# ---------------------------------------------------------------------------
EXCLUDE_PARTS = ("/_DELETE_/", "/audits/", "/node_modules/", "/.git/")


def pages():
    out = []
    for p in sorted(PUBLIC.rglob("*.html")):
        posix = p.as_posix()
        if any(x in posix for x in EXCLUDE_PARTS):
            continue
        out.append(p)
    return out


# Keep the whole corpus inside one request. The head and the top of the body
# carry essentially all the SEO signal, so a page that blows past this gets its
# tail cut rather than being dropped from the audit entirely.
PER_PAGE_CAP = 22_000


def strip_style(s):
    """Strip everything an SEO reviewer cannot use. Inline CSS, behavioural JS,
    inline SVG path data and HTML comments are ~70% of this site's bytes and
    0% of its search signal. JSON-LD scripts are kept — they ARE the signal."""
    s = re.sub(r"<style\b.*?</style>", "\n<!-- [css stripped] -->\n", s, flags=re.S | re.I)
    s = re.sub(
        r'<script(?![^>]*application/ld\+json)\b.*?</script>',
        "\n<!-- [js stripped] -->\n",
        s,
        flags=re.S | re.I,
    )
    # Inline SVG: keep the tag so alt/aria review still works, drop the geometry.
    s = re.sub(r"<svg\b[^>]*>.*?</svg>", "<svg><!-- [svg stripped] --></svg>", s, flags=re.S | re.I)
    # HTML comments, except the copyright/CodeMark header we want preserved.
    s = re.sub(
        r"<!--(?!\s*(?:Copyright|\[)).*?-->", "", s, flags=re.S
    )
    s = re.sub(r"[ \t]+\n", "\n", s)
    s = re.sub(r"\n{3,}", "\n\n", s)
    return s


def capped(s, path):
    if len(s) <= PER_PAGE_CAP:
        return s
    return (
        s[:PER_PAGE_CAP]
        + f"\n\n<!-- [{path}: truncated at {PER_PAGE_CAP:,} chars — "
        f"{len(s):,} total. Head and above-the-fold body retained. -->\n"
    )


def field(s, pattern, group=1):
    m = re.search(pattern, s, re.I | re.S)
    return html.unescape(m.group(group).strip()) if m else ""


def text_of(s):
    body = re.sub(r"<(script|style)\b.*?</\1>", " ", s, flags=re.S | re.I)
    body = re.sub(r"<[^>]+>", " ", body)
    return re.sub(r"\s+", " ", html.unescape(body)).strip()


def rel_path(p):
    return p.relative_to(PUBLIC).as_posix()


def manifest():
    """Compact whole-site SEO surface. Rides along with every request."""
    lines = [
        "=== SITE MANIFEST (every page, SEO surface only) ===",
        "cols: path | title_len | desc_len | canonical? | robots | h1 | words | internal_links_out",
        "",
    ]
    for p in pages():
        s = p.read_text(encoding="utf-8", errors="replace")
        title = field(s, r"<title>(.*?)</title>")
        desc = field(s, r'<meta\s+name="description"\s+content="(.*?)"')
        canon = field(s, r'<link\s+rel="canonical"\s+href="(.*?)"')
        robots = field(s, r'<meta\s+name="robots"[^>]*content="(.*?)"') or "(default)"
        h1s = re.findall(r"<h1\b[^>]*>(.*?)</h1>", s, re.S | re.I)
        h1 = re.sub(r"<[^>]+>", "", h1s[0]).strip()[:60] if h1s else "(none)"
        words = len(text_of(s).split())
        links = set()
        for m in re.finditer(r'href="(/[^"#?]*)"', s):
            links.add(m.group(1))
        lines.append(
            f"{rel_path(p)} | T{len(title)} | D{len(desc)} | "
            f"{'yes' if canon else 'NO'} | {robots} | h1={len(h1s)} | {words}w | {len(links)} out"
        )
        lines.append(f"    title: {title}")
        lines.append(f"    desc : {desc[:180]}")
        if links:
            lines.append(f"    links: {' '.join(sorted(links)[:24])}")
    for extra in ("robots.txt", "sitemap.xml"):
        f = PUBLIC / extra
        if f.exists():
            lines += ["", f"=== {extra} ===", f.read_text(encoding="utf-8", errors="replace")]
    return "\n".join(lines)


def bundle():
    parts = [manifest(), "", "=== FULL PAGE SOURCE (inline CSS + behavioural JS stripped) ==="]
    for p in pages():
        s = capped(strip_style(p.read_text(encoding="utf-8", errors="replace")), rel_path(p))
        parts.append(f"\n\n----- FILE: {rel_path(p)} -----\n{s}")
    return "\n".join(parts)


# ---------------------------------------------------------------------------
# Lenses
# ---------------------------------------------------------------------------
SYSTEM = (
    "You are a senior technical SEO consultant auditing a small veteran-owned "
    "software company's marketing site. You are blunt and specific. You never "
    "pad a report with generic best-practice filler — every finding must cite "
    "the exact file and the exact string you are objecting to, and propose the "
    "replacement text or markup verbatim. If something is already correct, say "
    "so in one line and move on. Rank findings by expected organic impact, not "
    "by how easy they are to describe."
)

LENSES = {
    "technical": """TECHNICAL SEO lens.
Crawlability and indexation only. Look for: missing/duplicate/conflicting canonicals;
robots meta vs sitemap disagreements; pages in the sitemap that noindex themselves;
orphaned or unreachable pages; meta-refresh redirect stubs that should be 301s at the
worker; trailing-slash and .html-vs-extensionless duplication (the worker serves both
/store and /store.html — say whether that is a duplicate-content problem and how to
fix it); hreflang/lang correctness; image alt coverage; render-blocking third-party
requests (Google Fonts, cdnjs Font Awesome) and their Core Web Vitals cost.""",
    "serp": """SERP APPEARANCE lens.
Titles and descriptions as they will actually render in Google. Flag every title over
~60 chars or description over ~160 that will truncate mid-sentence, and rewrite it.
Judge each against real search intent for that page. Then audit the JSON-LD: is every
block valid, are the types right, is any of it eligible for a rich result that is
currently being missed (FAQPage, SoftwareApplication, Product, BreadcrumbList,
Organization)? Flag any structured data that contradicts the visible page copy —
Google penalises that.""",
    "content": """CONTENT lens.
Heading hierarchy (h1 uniqueness, h2/h3 nesting, headings used for styling instead of
structure). Thin pages that will never rank and either need real content or should be
consolidated. Duplicate or near-duplicate copy across pages. Keyword coverage for the
terms this business could plausibly win — "MCP server", "Windows forensics tool",
"encrypted walkie talkie app", "Rust browser", "Chrome alternative" — and where the
copy is talking about itself instead of about what a searcher typed. E-E-A-T signals:
is the veteran-founder story, the named author, and the proof of expertise doing SEO
work or just sitting there decoratively?""",
    "authority": """INTERNAL LINKING / AUTHORITY lens.
Map the internal link graph from the manifest. Find orphan pages (in the sitemap but
linked from nowhere), pages that receive link equity but pass none on, generic anchor
text ("click here", "learn more") that should be keyword-bearing, and missing links
between topically-related pages. Recommend a concrete hub-and-spoke structure: which
page should be the pillar for each topic cluster and exactly which links to add,
given as "add link on FILE from ANCHOR TEXT to PATH".""",
    "conversion": """ORGANIC CONVERSION lens.
Follow the path from a cold search visitor to a completed purchase. Where does the
journey break, stall, or ask for trust it has not earned? Judge above-the-fold clarity
on each landing page, CTA specificity, price transparency, and whether the honesty
framing on this site (documented gaps, "checkout temporarily offline", Done/Partial/
Planned matrices) builds trust or leaks conversions — argue both sides before you
conclude. Ignore the known checkout-wiring gap itself; critique how it is COMMUNICATED.""",
}


def call(prompt_body, lens):
    key = os.environ.get("INCEPTION_API_KEY")
    if not key:
        sys.exit("INCEPTION_API_KEY is not set. export/set it and re-run.")
    payload = {
        "model": MODEL,
        "max_tokens": MAX_COMPLETION_TOKENS,
        "messages": [
            {"role": "system", "content": SYSTEM},
            {"role": "user", "content": prompt_body},
        ],
    }
    req = urllib.request.Request(
        API_URL,
        data=json.dumps(payload).encode(),
        headers={"Authorization": f"Bearer {key}", "Content-Type": "application/json"},
    )
    try:
        with urllib.request.urlopen(req, timeout=600) as r:
            data = json.loads(r.read())
    except urllib.error.HTTPError as e:
        sys.exit(f"[{lens}] HTTP {e.code}: {e.read()[:800].decode('utf-8', 'replace')}")
    u = data.get("usage", {})
    _USAGE["in"] += u.get("prompt_tokens", 0)
    _USAGE["out"] += u.get("completion_tokens", 0)
    return data["choices"][0]["message"]["content"]


def main():
    args = [a.lower() for a in sys.argv[1:]]
    OUT_DIR.mkdir(exist_ok=True)

    body = bundle()
    est_in = len(body) / EST_CHARS_PER_TOKEN

    if "chunks" in args:
        (OUT_DIR / "mercury_seo_manifest.txt").write_text(manifest(), encoding="utf-8")
        (OUT_DIR / "mercury_seo_bundle.txt").write_text(body, encoding="utf-8")
        print(f"bundle: {len(body):,} chars  (~{est_in:,.0f} tokens)")
        print(f"budget: {CHUNK_BUDGET:,} chars — {'OK, fits one request' if len(body) <= CHUNK_BUDGET else 'OVER BUDGET, split needed'}")
        print(f"wrote {OUT_DIR/'mercury_seo_bundle.txt'}")
        return

    if len(body) > CHUNK_BUDGET:
        sys.exit(
            f"bundle is {len(body):,} chars, over the {CHUNK_BUDGET:,} budget.\n"
            "Split by page group before sending — run `python mercury_seo.py chunks` to inspect."
        )

    lenses = [a for a in args if a in LENSES] or list(LENSES)
    per = cost(est_in, MAX_COMPLETION_TOKENS)
    print(f"{len(lenses)} lens(es) x ~{est_in:,.0f} in tokens — estimated ${per*len(lenses):.2f} total\n")

    for lens in lenses:
        print(f"[{lens}] sending {len(body):,} chars ...")
        prompt = (
            f"{LENSES[lens]}\n\n"
            f"Site root is {SITE}. The worker serves extensionless paths (/store -> public/store.html).\n"
            "Return markdown: a ranked findings table (impact / effort / file), then one section per "
            "finding with the exact current string and the exact replacement.\n\n"
            f"{body}"
        )
        out = call(prompt, lens)
        dest = OUT_DIR / f"mercury_seo_{lens}_report.md"
        dest.write_text(out, encoding="utf-8")
        print(f"[{lens}] -> {dest}")

    print(
        f"\nspent: {_USAGE['in']:,} in / {_USAGE['out']:,} out "
        f"= ${cost(_USAGE['in'], _USAGE['out']):.2f}"
    )


if __name__ == "__main__":
    main()
