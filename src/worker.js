// Copyright (c) 2026 Shane Smith / Sassy Consulting LLC. All rights reserved.
// Proprietary source. This notice is Copyright Management Information (17 U.S.C. 1202); removal or alteration prohibited.
// CodeMark: SCLLC1-sassyconsultingllc_cloudflare-XZBSPDS6DWRR
import { EmailMessage } from "cloudflare:email";

const DATACENTER_ASNS = new Set([
  13335, 14618, 15169, 8075, 16509, 14061, 20473, 46606, 63949, 54825,
  398101, 13213, 32934, 19551, 36351, 30633, 21859
]);

const VPN_KEYWORDS = [
  "vpn", "proxy", "hosting", "datacenter", "data center", "cloud", "server",
  "vps", "dedicated", "colocation", "aws", "amazon", "google", "microsoft",
  "azure", "digitalocean", "linode", "vultr", "ovh", "hetzner", "cloudflare", "akamai"
];

// Product catalog. Pricing lives in the Lemon Squeezy dashboard; the worker only
// resolves a (product, billing) pair to a variant ID via env vars of the form
//   LS_VARIANT_<PRODUCT>            for one-time / monthly default
//   LS_VARIANT_<PRODUCT>_MONTHLY    for explicit monthly subscription
//   LS_VARIANT_<PRODUCT>_ANNUAL     for annual subscription
const PRODUCTS = {
  "sassy-talk": {
    name: "Sassy-Talk",
    mode: "payment",
    description: "Encrypted walkie-talkie app for Android",
    // priceCents + lsFallbackOk: while this SKU has no dedicated LS product,
    // checkout rides the LS_FALLBACK_VARIANT with a custom_price override.
    // License delivery doesn't depend on LS (relay mints the key), so the
    // fallback is safe. Setting LS_VARIANT_SASSY_TALK disables the fallback.
    priceCents: 399,
    lsFallbackOk: true
  },
  "winforensics": {
    name: "WinForensics",
    mode: "payment",
    description: "Digital forensics toolkit for Windows",
    priceCents: 200,
    lsFallbackOk: true
  },
  "website-creator": {
    name: "Website Creator",
    mode: "payment",
    description: "AI-powered WordPress builder with security hardening",
    // No shippable artifact exists yet (no plugin zip in any repo or R2).
    // Checkout is refused until there is something to deliver.
    available: false
  },
  // SassyMCP SKUs activate via Lemon Squeezy's native license keys
  // (sassymcp/_lemonsqueezy.py calls /v1/licenses/activate), so they can NOT
  // ride the fallback variant — LS only generates keys on variants that have
  // "Generate license keys" enabled, which is a dashboard-only setting.
  // Until those products exist in the LS dashboard, checkout returns the
  // `pending` message below instead of a dead error.
  "mcp-pro": {
    name: "SassyMCP Pro",
    mode: "payment",
    description: "One MCP server replacing 75+ — all 270 tools, one-time perpetual license",
    priceCents: 4900
  },
  "mcp-forensics": {
    name: "SassyMCP Forensics",
    mode: "payment",
    description: "Forensics add-on: security audit + registry modules, stacks on Free or Pro",
    priceCents: 2900
  },
  "mcp-team": {
    name: "SassyMCP Team",
    mode: "payment",
    description: "SassyMCP site license — Pro + Forensics for up to 10 machines",
    priceCents: 19900
  }
};

// SHA-256 hash of the NDA PDF — update when PDF changes
const NDA_DOC_HASH = "TO_BE_COMPUTED_ON_DEPLOY";

// Allowed origins for browser POST requests (lightweight CSRF defense).
const ALLOWED_ORIGINS = new Set([
  "https://sassyconsultingllc.com",
  "https://www.sassyconsultingllc.com",
]);

// Strip control characters from a string used in an email header/subject or
// any other context where CR/LF could enable injection.
function sanitizeHeaderValue(s, max = 200) {
  if (typeof s !== "string") return "";
  return s
    .replace(/[\x00-\x1F\x7F]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

// Reject path segments that could escape the intended R2 prefix.
const SAFE_SEGMENT = /^[A-Za-z0-9._-]+$/;
function isSafeSegment(s) {
  return typeof s === "string" && s.length > 0 && s.length <= 100 && SAFE_SEGMENT.test(s) && s !== "." && s !== "..";
}

// Origin-based CSRF defense: requires browser POSTs to come from a known origin.
// Allows no-Origin requests (server-to-server, curl) since they can't carry a victim's cookies anyway.
function isAllowedOrigin(request) {
  const origin = request.headers.get("Origin");
  if (!origin) return true;
  return ALLOWED_ORIGINS.has(origin);
}

// Per-isolate rate limiter (Map of key -> {count, resetAt}). Not global — each
// isolate counts separately — but cheap and enough to blunt brute-force loops
// against license validation. Entries expire lazily on next check.
const rateBuckets = new Map();
function isRateLimited(key, limit = 10, windowMs = 60_000) {
  const now = Date.now();
  const bucket = rateBuckets.get(key);
  if (!bucket || now >= bucket.resetAt) {
    rateBuckets.set(key, { count: 1, resetAt: now + windowMs });
    if (rateBuckets.size > 10_000) rateBuckets.clear(); // memory backstop
    return false;
  }
  bucket.count++;
  return bucket.count > limit;
}

// Headers applied to every dynamic response (JSON + redirect) for defense in depth.
const SECURITY_HEADERS = {
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Strict-Transport-Security": "max-age=31536000; includeSubDomains",
  "X-Frame-Options": "DENY",
};

// CSP applied to HTML asset responses. Inline scripts/styles are pervasive in
// public/*.html, so 'unsafe-inline' stays for now; the rest is locked down.
// Payment processor: Lemon Squeezy (Stripe was suspended -- do not re-add Stripe origins).
const HTML_CSP = "default-src 'self'; " +
  "script-src 'self' 'unsafe-inline' https://app.lemonsqueezy.com https://assets.lemonsqueezy.com https://cdn.tailwindcss.com https://cdn.jsdelivr.net https://cdnjs.cloudflare.com https://challenges.cloudflare.com; " +
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://cdnjs.cloudflare.com; " +
  "font-src 'self' https://fonts.gstatic.com https://cdnjs.cloudflare.com data:; " +
  "img-src 'self' data: https:; " +
  "connect-src 'self' https://api.lemonsqueezy.com https://app.lemonsqueezy.com https://challenges.cloudflare.com https://api.github.com; " +
  "frame-src https://app.lemonsqueezy.com https://challenges.cloudflare.com; " +
  "object-src 'none'; " +
  "base-uri 'self'; " +
  "form-action 'self' https://app.lemonsqueezy.com";

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;
    const method = request.method;

    const origin = request.headers.get("Origin") || "";
    const corsOrigin = ALLOWED_ORIGINS.has(origin) ? origin : "https://sassyconsultingllc.com";
    const corsHeaders = {
      "Access-Control-Allow-Origin": corsOrigin,
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, X-Signature",
      "Vary": "Origin",
      ...SECURITY_HEADERS,
    };

    if (method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders });
    }

    try {
      if (path === "/api/analyze" && method === "POST") {
        return await handleAnalyze(request, env, corsHeaders);
      }
      if (path === "/api/contact" && method === "POST") {
        return await handleContact(request, env, corsHeaders);
      }
      if (path === "/api/app-tester" && method === "POST") {
        return await handleAppTester(request, env, corsHeaders);
      }
      if (path === "/api/checkout" && method === "POST") {
        return await handleCheckout(request, env, corsHeaders);
      }
      if (path === "/api/verify" && method === "POST") {
        return await handleVerify(request, env, corsHeaders);
      }
      if (path === "/api/webhook" && method === "POST") {
        return await handleWebhook(request, env, corsHeaders);
      }
      // Release-pipeline upload into the GATED bucket (winforensics/ prefix
      // only). Exists because the wrangler OAuth token lacks the r2 scope
      // and wrangler 4.60-4.98 truncated large PUTs on Windows anyway.
      if (path === "/api/admin/gated-upload" && method === "PUT") {
        return await handleGatedUpload(request, url, env, corsHeaders);
      }
      if (path === "/api/validate" && method === "POST") {
        return await handleValidateLicense(request, env, corsHeaders);
      }
      // Alias baked into shipped clients: SassyMCP's legacy weekly check
      // GETs /api/license/validate?key=... (sassymcp/license.py VALIDATE_URL).
      // Same D1-backed validation as /api/validate.
      if (path === "/api/license/validate" && (method === "GET" || method === "POST")) {
        return await handleValidateLicense(request, env, corsHeaders);
      }
      if (path === "/api/vpn-recommendations") {
        return await handleVPNRecommendations(corsHeaders);
      }
      // Donate redirect -- single env var holds the Lemon Squeezy donate variant URL
      // so we never need to ship the storefront URL in HTML.
      if (path === "/donate") {
        const target = env.LEMONSQUEEZY_DONATE_URL || "https://sassyconsultingllc.lemonsqueezy.com";
        return Response.redirect(target, 302);
      }
      if (path === "/api/downloads") {
        return await handleDownloadsList(env, corsHeaders);
      }
      if (path === "/api/nda/verify-code" && method === "POST") {
        return await handleNdaVerifyCode(request, env, corsHeaders);
      }
      if (path === "/api/nda/sign" && method === "POST") {
        return await handleNdaSign(request, env, corsHeaders);
      }
      if (path === "/api/nda/download" && method === "POST") {
        return await handleNdaDownload(request, env, corsHeaders);
      }
      // PTT relay moved to relay.sassy-consults.com (sassytalk-relay worker)
      if (path === "/api/ptt/ws" || path === "/api/ptt/room-info") {
        return Response.redirect("https://relay.sassy-consults.com/ws" + url.search, 301);
      }

      // File-serving routes are GET/HEAD only — anything else gets a 405.
      const isRead = method === "GET" || method === "HEAD";
      if (path.startsWith("/download/") || path.startsWith("/scrub/") || path.startsWith("/privacy/")) {
        if (!isRead) {
          return new Response("Method not allowed", { status: 405, headers: { ...SECURITY_HEADERS, "Allow": "GET, HEAD" } });
        }
      }

      if (path.startsWith("/download/")) {
        return await handleDownload(path, url, env, corsHeaders);
      }

      if (path.startsWith("/scrub/")) {
        return await handleScrubFetch(path, env, corsHeaders);
      }

      if (path.startsWith("/privacy/")) {
        const r2Response = await handlePrivacy(path, env);
        if (r2Response) return r2Response;
      }

      // Static assets are served automatically by Cloudflare [assets] config
      // If we reach here, no API route matched and no static asset exists
      const assetResponse = await env.ASSETS.fetch(request);
      return withSecurityHeaders(assetResponse);
    } catch (error) {
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }
  }
};

async function handleAnalyze(request, env, corsHeaders) {
  const body = await request.json();
  const zipCode = (body.zip_code || "").trim();

  // ── Pull data from Cloudflare's request.cf object (available on ALL plans) ──
  const cf = request.cf || {};
  const ip = request.headers.get("CF-Connecting-IP") || "unknown";
  const country = cf.country || request.headers.get("CF-IPCountry") || "XX";
  const city = cf.city || "Unknown";
  const region = cf.region || cf.regionCode || "";
  const lat = cf.latitude || "0";
  const lon = cf.longitude || "0";
  const postalCode = cf.postalCode || "";
  const asn = String(cf.asn || "");
  const asnOrg = cf.asOrganization || "Unknown ISP";
  const colo = cf.colo || "";            // Cloudflare datacenter (e.g. "ORD")
  const tlsVersion = cf.tlsVersion || "";
  const httpProtocol = cf.httpProtocol || "";
  const timezone = cf.timezone || getTimezone(country, region);

  // ── ZIP Code Verification — compare client-given ZIP to Cloudflare-detected postal code ──
  let zipMatch = "unknown";
  let zipVerified = false;
  if (zipCode && postalCode) {
    if (zipCode === postalCode) {
      zipMatch = "exact";
      zipVerified = true;
    } else if (zipCode.substring(0, 3) === postalCode.substring(0, 3)) {
      zipMatch = "region";   // Same sectional center (first 3 digits match)
      zipVerified = true;
    } else {
      zipMatch = "mismatch"; // User ZIP doesn't match IP geolocation — possible VPN/proxy
    }
  } else if (zipCode && !postalCode) {
    zipMatch = "no_cf_data"; // Cloudflare didn't return a postal code for this IP
  }

  const vpnDetection = detectVPN(asn, asnOrg, request.headers);

  // If ZIP mismatches and we didn't already flag VPN, mark as suspicious
  if (zipMatch === "mismatch" && !vpnDetection.isVPN) {
    vpnDetection.zipMismatch = true;
  }

  const maskedIP = maskIP(ip);

  // Measure latency to an external endpoint
  const pingStart = Date.now();
  try { await fetch("https://1.1.1.1/cdn-cgi/trace", { method: "GET", signal: AbortSignal.timeout(3000) }); } catch (e) {}
  const pingMs = Date.now() - pingStart;

  // Log to D1 if available
  if (env.DB) {
    const hashedIP = await hashIP(ip, env.LICENSE_SALT || "default-salt");
    try {
      await env.DB.prepare(
        "INSERT INTO connection_logs (ip_hash, zip_code, country, region, asn, is_vpn, created_at) VALUES (?, ?, ?, ?, ?, ?, datetime('now'))"
      ).bind(hashedIP, zipCode, country, region, asn, vpnDetection.isVPN ? 1 : 0).run();
    } catch (e) {}
  }

  // ── Determine overall connection status ──
  let connectionStatus = "safe";
  let statusMessage = "Connection appears secure";

  if (vpnDetection.isVPN) {
    connectionStatus = "protected";
    statusMessage = "VPN or proxy detected — your traffic is being routed through a third party";
  } else if (zipMatch === "mismatch") {
    connectionStatus = "warning";
    statusMessage = `ZIP code ${zipCode} doesn't match your detected location (${postalCode || city || country}) — possible VPN or proxy`;
  } else if (country !== "US") {
    connectionStatus = "warning";
    statusMessage = "International connection detected";
  } else if (zipVerified) {
    statusMessage = "Connection secure — ZIP code verified against Cloudflare geolocation";
  }

  return jsonResponse({
    connection_status: connectionStatus,
    status_message: statusMessage,
    ip: maskedIP,
    ip_full_masked: maskedIP,
    location: {
      city,
      region,
      country,
      postal: postalCode || "N/A",
      latitude: parseFloat(lat),
      longitude: parseFloat(lon),
      timezone
    },
    isp: { name: asnOrg, asn: asn ? `AS${asn}` : "Unknown" },
    vpn: vpnDetection,
    ping_ms: pingMs,
    input_zip: zipCode,
    // Verification: client ZIP vs Cloudflare-detected postal code
    verification: {
      zip_match: zipMatch,
      zip_verified: zipVerified,
      cf_postal: postalCode || null,
      cf_colo: colo,
      tls: tlsVersion,
      http: httpProtocol
    }
  }, 200, corsHeaders);
}

async function handleContact(request, env, corsHeaders) {
  if (!isAllowedOrigin(request)) {
    return jsonResponse({ error: "Cross-origin request rejected" }, 403, corsHeaders);
  }
  const contentType = request.headers.get("content-type") || "";
  let name, email, message;
  if (contentType.includes("application/x-www-form-urlencoded")) {
    const formData = await request.formData();
    name = formData.get("name"); email = formData.get("email"); message = formData.get("message");
  } else {
    const body = await request.json();
    name = body.name; email = body.email; message = body.message;
  }
  const redirectError = (err) => new Response(null, {
    status: 302,
    headers: { ...SECURITY_HEADERS, "Location": `/#contact?error=${encodeURIComponent(err)}` },
  });
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!name || name.length < 2 || name.length > 100) return redirectError("name");
  if (!email || !emailRegex.test(email)) return redirectError("email");
  if (!message || message.length < 10 || message.length > 1000) return redirectError("message");
  // Strip CR/LF from anything we'll put in an email header/subject.
  const safeName = sanitizeHeaderValue(name, 100);
  const safeEmail = sanitizeHeaderValue(email, 254);
  if (!safeName || !safeEmail) return redirectError("name");
  if (env.DB) {
    try { await env.DB.prepare("INSERT INTO contact_submissions (name, email, message, created_at) VALUES (?, ?, ?, datetime('now'))").bind(safeName, safeEmail, message).run(); } catch (e) { console.error("DB error:", e); }
  }
  await sendEmailViaCF(env, {
    from: "contact@sassyconsultingllc.com",
    senderLabel: "Sassy Consulting",
    to: "info@sassyconsultingllc.com",
    replyTo: safeEmail,
    subject: `Contact Form: ${safeName}`,
    text: `New contact form submission:\n\nName: ${safeName}\nEmail: ${safeEmail}\n\nMessage:\n${message}\n\n---\nSent from sassyconsultingllc.com contact form`,
  });
  return new Response(null, { status: 302, headers: { ...SECURITY_HEADERS, "Location": "/contact-success.html" } });
}

async function handleAppTester(request, env, corsHeaders) {
  if (!isAllowedOrigin(request)) {
    return jsonResponse({ error: "Cross-origin request rejected" }, 403, corsHeaders);
  }
  const contentType = request.headers.get("content-type") || "";
  // QA-rubric fields are only populated when "Advanced Review" is unlocked
  // (install duration >= 7 days) and the tester opts in. All optional.
  const RUBRIC_KEYS = ["rubric_stability","rubric_performance","rubric_functionality","rubric_ux","rubric_visual","rubric_accessibility","rubric_onboarding","rubric_engagement"];
  const ADVANCED_KEYS = ["install_duration","advanced_review","bug_severity","bug_repro","bug_steps","most_loved","most_broken","ship_readiness", ...RUBRIC_KEYS];
  let name, email, device, deviceSecond, experience, notes, apps, submissionType, appRating, wantsReply;
  let scrubText, scrubOriginalName;
  const advanced = {};
  if (contentType.includes("application/x-www-form-urlencoded")) {
    const formData = await request.formData();
    name = formData.get("name");
    email = formData.get("email") || "";
    device = formData.get("device");
    deviceSecond = formData.get("device_2") || "";
    experience = formData.get("experience") || "";
    notes = formData.get("notes") || "";
    apps = formData.getAll("apps");
    submissionType = formData.get("submission_type") || "become-tester";
    appRating = formData.get("app_rating") || "";
    wantsReply = (formData.get("wants_reply") || "") === "yes";
    scrubText = formData.get("scrub_text") || "";
    scrubOriginalName = formData.get("scrub_original_name") || "";
    for (const k of ADVANCED_KEYS) advanced[k] = formData.get(k) || "";
  } else {
    const body = await request.json();
    name = body.name; email = body.email || ""; device = body.device;
    deviceSecond = body.device_2 || body.deviceSecond || "";
    experience = body.experience || ""; notes = body.notes || "";
    apps = Array.isArray(body.apps) ? body.apps : (body.apps ? [body.apps] : []);
    submissionType = body.submission_type || body.submissionType || "become-tester";
    appRating = body.app_rating || body.appRating || "";
    wantsReply = body.wants_reply === "yes" || body.wantsReply === true;
    scrubText = body.scrub_text || body.scrubText || "";
    scrubOriginalName = body.scrub_original_name || body.scrubOriginalName || "";
    for (const k of ADVANCED_KEYS) advanced[k] = body[k] || "";
  }

  const normalizedType = submissionType === "already-testing" ? "already-testing" : "become-tester";
  const redirectWithError = (error) => new Response(null, {
    status: 302,
    headers: { ...SECURITY_HEADERS, "Location": `/app-testers?error=${encodeURIComponent(error)}&form=${encodeURIComponent(normalizedType)}` },
  });

  const ratingLabels = {
    "1": "1 - terrible",
    "2": "2 - moderately okay",
    "3": "3 - half alright",
    "4": "4 - I might replace my current workflow with this app",
    "5": "5 - I'm going to use this app regularly"
  };

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!name || name.length < 2 || name.length > 100) return redirectWithError("name");
  // Email is now optional. Required only if the user opted in to a reply.
  // If a value is provided regardless of the toggle, it must be a valid format.
  if (wantsReply && !email) return redirectWithError("email");
  if (email && !emailRegex.test(email)) return redirectWithError("email");
  // Device is only required for "already-testing" submissions. New testers
  // can't report on a device they haven't tested yet.
  if (normalizedType === "already-testing" && !device) return redirectWithError("device");
  if (!apps || apps.length === 0) return redirectWithError("apps");
  if (normalizedType === "already-testing" && !ratingLabels[appRating]) return redirectWithError("rating");

  const safeName = sanitizeHeaderValue(name, 100);
  // safeEmail may be "" — that's the no-reply case. We only fail on name being empty.
  const safeEmail = email ? sanitizeHeaderValue(email, 254) : "";
  if (!safeName) return redirectWithError("name");
  if (email && !safeEmail) return redirectWithError("email");

  const submissionLabel = normalizedType === "already-testing" ? "Already testing" : "Become an App Tester";
  const ratingText = ratingLabels[appRating] || "not provided";
  const appsStr = apps.join(", ");
  const replyStatus = wantsReply ? "reply requested" : "no reply requested";
  const deviceStr = deviceSecond ? `${device} | Device 2: ${deviceSecond}` : (device || "(none)");

  // Compose the advanced-review (Bethesda-style QA rubric) block when present.
  // Tester must have advanced_review=yes AND at least one rubric score filled.
  const hasAdvanced = advanced.advanced_review === "yes" &&
    RUBRIC_KEYS.some((k) => advanced[k]);
  let advancedDb = "";
  let advancedEmail = "";
  if (hasAdvanced) {
    const RUBRIC_WEIGHTS = {
      rubric_stability: 1.4, rubric_performance: 1.2, rubric_functionality: 1.4,
      rubric_ux: 1.1, rubric_visual: 0.7, rubric_accessibility: 0.9,
      rubric_onboarding: 0.8, rubric_engagement: 1.1,
    };
    let weighted = 0, totalWeight = 0, filled = 0;
    for (const k of RUBRIC_KEYS) {
      const raw = advanced[k];
      const v = raw ? parseFloat(raw) : NaN;
      if (!isNaN(v)) {
        weighted += v * RUBRIC_WEIGHTS[k];
        totalWeight += RUBRIC_WEIGHTS[k];
        filled++;
      }
    }
    const composite = totalWeight > 0 ? (weighted / totalWeight).toFixed(2) : "n/a";
    const scoreLine = RUBRIC_KEYS.map((k) => {
      const label = k.replace("rubric_", "").replace(/^./, (c) => c.toUpperCase());
      return `${label}: ${advanced[k] || "—"}`;
    }).join(" | ");
    advancedDb = ` | ADV[install:${advanced.install_duration}|composite:${composite}/5|${filled}/8 scored|sev:${advanced.bug_severity || "—"}|repro:${advanced.bug_repro || "—"}|ship:${advanced.ship_readiness || "—"}|${scoreLine}|loved:${(advanced.most_loved || "").slice(0, 120)}|broken:${(advanced.most_broken || "").slice(0, 120)}|steps:${(advanced.bug_steps || "").slice(0, 240)}]`;
    advancedEmail =
      `\n\n── ADVANCED REVIEW (Bethesda-style QA rubric) ──\n` +
      `Install duration: ${advanced.install_duration}\n` +
      `Composite score:  ${composite} / 5   (${filled} of 8 categories scored)\n\n` +
      RUBRIC_KEYS.map((k) => {
        const label = k.replace("rubric_", "").replace(/^./, (c) => c.toUpperCase()).padEnd(16);
        return `  ${label} ${advanced[k] || "—"}`;
      }).join("\n") +
      `\n\nWorst bug observed:\n` +
      `  Severity:         ${advanced.bug_severity || "—"}\n` +
      `  Reproducibility:  ${advanced.bug_repro || "—"}\n` +
      `  Steps:\n${(advanced.bug_steps || "(none)").split("\n").map((l) => "    " + l).join("\n")}\n` +
      `\nTester verdict:\n` +
      `  Loved feature:    ${advanced.most_loved || "(none)"}\n` +
      `  Broken feature:   ${advanced.most_broken || "(none)"}\n` +
      `  Ship readiness:   ${advanced.ship_readiness || "—"}\n`;
  }

  const baseInstall = advanced.install_duration ? ` | Install: ${advanced.install_duration}` : "";

  if (env.DB) {
    try {
      // contact_submissions.email is NOT NULL — store "" when no reply requested.
      await env.DB.prepare(
        "INSERT INTO contact_submissions (name, email, message, created_at) VALUES (?, ?, ?, datetime('now'))"
      ).bind(safeName, safeEmail, `[APP TESTER] Type: ${submissionLabel} | Reply: ${replyStatus} | Apps: ${appsStr} | Device: ${deviceStr}${baseInstall} | Rating: ${ratingText} | Experience: ${experience || "not specified"} | Notes: ${notes || "none"}${advancedDb}`).run();
    } catch (e) { console.error("DB error:", e); }
  }
  const subjectTag = hasAdvanced ? " [ADV-REVIEW]" : "";
  await sendEmailViaCF(env, {
    from: "contact@sassyconsultingllc.com",
    senderLabel: "Sassy Consulting",
    to: "info@sassyconsultingllc.com",
    replyTo: safeEmail || undefined,
    subject: `${normalizedType === "already-testing" ? "App Tester Feedback" : "App Tester Signup"}: ${safeName}${wantsReply ? "" : " [no reply requested]"}${subjectTag}`,
    text:
      `New app tester submission:\n\n` +
      `Type: ${submissionLabel}\n` +
      `Reply requested: ${wantsReply ? "yes" : "no"}\n` +
      `Email: ${safeEmail || "(not provided)"}\n` +
      `Device: ${device || "(not provided)"}${deviceSecond ? `\nSecond Device: ${deviceSecond}` : ""}\n` +
      `Apps: ${appsStr}\n` +
      `App Rating: ${ratingText}\n` +
      (advanced.install_duration ? `Install duration: ${advanced.install_duration}\n` : "") +
      `Experience: ${experience || "not specified"}\n` +
      `Notes: ${notes || "none"}` +
      advancedEmail +
      `\n\n---\nSent from sassyconsultingllc.com/app-testers`,
  });

  // ── Scrubbed-file pipeline ──────────────────────────────────────────
  // If the tester used the in-browser file scrubber, the hidden
  // scrub_text field carries the cleaned ASCII output. PDF-wrap it,
  // park it in R2 GATED (worker-routed via /scrub/<uuid>.pdf), then
  // send a separate email with the PDF attached and a re-download link.
  // Non-fatal: any failure here is logged but never affects the tester's
  // primary submission success (302 below still fires).
  if (scrubText && env.GATED && env.CONTACT_EMAIL) {
    try {
      const pdf = buildPdfFromText(
        scrubText,
        `Scrubbed: ${scrubOriginalName || "unnamed"} (tester: ${safeName})`
      );
      const uuid = crypto.randomUUID();
      const r2Key = `app-tester-scrubs/${uuid}.pdf`;
      await env.GATED.put(r2Key, pdf.bytes, {
        httpMetadata: { contentType: "application/pdf" },
        customMetadata: {
          tester_name: safeName.slice(0, 100),
          tester_email: (safeEmail || "").slice(0, 254),
          original_filename: (scrubOriginalName || "unknown").slice(0, 200),
          line_count: String(pdf.lineCount),
          page_count: String(pdf.pageCount),
          truncated: String(pdf.truncated),
          submitted_at: new Date().toISOString(),
        },
      });
      const siteUrl = env.SITE_URL || "https://sassyconsultingllc.com";
      const downloadUrl = `${siteUrl}/scrub/${uuid}.pdf`;
      const attachmentBase = (scrubOriginalName || "scrub")
        .replace(/\.[^.]+$/, "") // drop original extension
        .replace(/[^A-Za-z0-9._-]/g, "_")
        .slice(0, 60) || "scrub";
      await sendEmailWithAttachment(env, {
        from: "contact@sassyconsultingllc.com",
        senderLabel: "Sassy Consulting (Scrubbed File)",
        to: "info@sassyconsultingllc.com",
        replyTo: safeEmail || undefined,
        subject: `[Scrubbed file] ${safeName}: ${scrubOriginalName || "unnamed"}${pdf.truncated ? " [TRUNCATED]" : ""}`,
        text:
          `Tester ${safeName} attached a scrubbed file alongside their app-tester submission.\n\n` +
          `Original filename: ${scrubOriginalName || "(none)"}\n` +
          `Lines: ${pdf.lineCount}${pdf.truncated ? " (truncated at hard cap)" : ""}\n` +
          `Pages: ${pdf.pageCount}\n` +
          `Tester email: ${safeEmail || "(not provided — no reply requested)"}\n\n` +
          `Re-download link (capability URL — keep private):\n${downloadUrl}\n\n` +
          `The PDF is also attached to this email. The link above stays valid as long as the R2 object exists.\n\n` +
          `---\nSent from sassyconsultingllc.com/app-testers (scrubbed-file pipeline)`,
        attachment: {
          filename: `scrub-${attachmentBase}.pdf`,
          contentType: "application/pdf",
          bytes: pdf.bytes,
        },
      });
    } catch (e) {
      console.error("Scrubbed-file pipeline failed (non-fatal):", e);
    }
  }

  return new Response(null, { status: 302, headers: { ...SECURITY_HEADERS, "Location": "/contact-success.html" } });
}

// ─────────────────────────────────────────────────────────────────────────────
// Lemon Squeezy checkout / verify / webhook
//
// Flow:
//   1. /api/checkout  -- generates a one-time `ref` (UUID), creates a Lemon
//      Squeezy checkout via the API with that ref embedded as custom data, and
//      returns the hosted checkout URL. The success URL is
//      `${SITE_URL}/success?session_id=<ref>` so the existing success.html JS
//      keeps working without changes.
//   2. /api/webhook   -- Lemon Squeezy posts `order_created` /
//      `subscription_created` here, signed via HMAC-SHA256 in the `X-Signature`
//      header. We verify, generate the license, and persist by `ref`.
//   3. /api/verify    -- success.html polls this with the `ref`. We look up the
//      license row; if the webhook hasn't landed yet, we retry briefly.
// ─────────────────────────────────────────────────────────────────────────────

const LS_API = "https://api.lemonsqueezy.com/v1";

function lsHeaders(env) {
  return {
    "Authorization": `Bearer ${env.LEMONSQUEEZY_API_KEY}`,
    "Accept": "application/vnd.api+json",
    "Content-Type": "application/vnd.api+json",
  };
}

// Resolve a (product, billing) pair to a Lemon Squeezy variant ID via env vars.
function resolveVariantId(env, product, isSubscription, billing) {
  const base = `LS_VARIANT_${product.toUpperCase().replace(/-/g, "_")}`;
  if (isSubscription) {
    const suffix = billing === "annual" ? "_ANNUAL" : "_MONTHLY";
    return env[base + suffix] || env[base];
  }
  return env[base];
}

async function handleCheckout(request, env, corsHeaders) {
  if (!isAllowedOrigin(request)) {
    return jsonResponse({ error: "Cross-origin request rejected" }, 403, corsHeaders);
  }
  const body = await request.json();
  const { product, email, billing, success_url, cancel_url } = body;
  if (!product || !PRODUCTS[product]) return jsonResponse({ error: "Invalid product" }, 400, corsHeaders);
  if (PRODUCTS[product].available === false) {
    return jsonResponse({ error: `${PRODUCTS[product].name} isn't available for purchase yet. Check back soon.` }, 409, corsHeaders);
  }
  if (!email) return jsonResponse({ error: "Email required" }, 400, corsHeaders);
  if (!env.LEMONSQUEEZY_API_KEY || !env.LEMONSQUEEZY_STORE_ID) {
    return jsonResponse({ error: "Payment processor not configured" }, 500, corsHeaders);
  }

  const productInfo = PRODUCTS[product];
  const isSubscription = productInfo.mode === "subscription";

  let variantId = resolveVariantId(env, product, isSubscription, billing);
  // Interim wiring: SKUs whose license chain doesn't depend on LS-generated
  // keys can check out against a shared fallback variant with an LS
  // custom_price + display-name override. A dedicated LS_VARIANT_* secret
  // always wins once the real product exists in the LS dashboard.
  let customPriceCents = null;
  if (!variantId && productInfo.lsFallbackOk && productInfo.priceCents && env.LS_FALLBACK_VARIANT) {
    variantId = env.LS_FALLBACK_VARIANT;
    customPriceCents = productInfo.priceCents;
  }
  if (!variantId) {
    return jsonResponse({
      error: `${productInfo.name} checkout is briefly offline while payment wiring is finished. ` +
             `Email info@sassyconsultingllc.com and we'll send you a direct checkout link.`,
    }, 503, corsHeaders);
  }

  // Our own short-lived correlation ID -- echoed back in the webhook so we can
  // match the order to the success page without trusting a client-supplied key.
  const ref = crypto.randomUUID();
  const cancelUrl = cancel_url || (isSubscription
    ? `${env.SITE_URL}/checkout/${product.replace("mcp-", "")}.html`
    : `${env.SITE_URL}/${product}.html`);
  const successUrl = success_url || `${env.SITE_URL}/success?session_id=${ref}`;

  // JSON:API payload. `checkout_data.custom` is echoed back inside
  // meta.custom_data on every webhook for the resulting order/subscription.
  const payload = {
    data: {
      type: "checkouts",
      attributes: {
        checkout_data: {
          email,
          custom: {
            ref,
            product,
            product_name: productInfo.name,
            billing: billing || "",
          },
        },
        checkout_options: {
          embed: false,
          media: false,
          logo: true,
        },
        product_options: {
          redirect_url: successUrl,
          receipt_button_text: "Get my license",
          receipt_link_url: successUrl,
          // On fallback checkouts the underlying variant belongs to a
          // different product, so override what the buyer sees.
          ...(customPriceCents ? { name: productInfo.name, description: productInfo.description } : {}),
        },
        ...(customPriceCents ? { custom_price: customPriceCents } : {}),
      },
      relationships: {
        store:   { data: { type: "stores",   id: String(env.LEMONSQUEEZY_STORE_ID) } },
        variant: { data: { type: "variants", id: String(variantId) } },
      },
    },
  };

  const lsResponse = await fetch(`${LS_API}/checkouts`, {
    method: "POST",
    headers: lsHeaders(env),
    body: JSON.stringify(payload),
  });
  const session = await lsResponse.json();
  if (!lsResponse.ok) {
    const msg = session?.errors?.[0]?.detail || session?.errors?.[0]?.title || "Lemon Squeezy error";
    return jsonResponse({ error: msg }, 400, corsHeaders);
  }
  const checkoutUrl = session?.data?.attributes?.url;
  if (!checkoutUrl) return jsonResponse({ error: "Checkout URL missing in response" }, 500, corsHeaders);

  // Stash the pending intent so /api/verify has something to look up even if
  // the webhook is delayed; the license_key column stays NULL until then.
  if (env.DB) {
    try {
      await env.DB.prepare(
        "INSERT OR IGNORE INTO licenses (license_key, email, product, payment_ref, created_at) VALUES (?, ?, ?, ?, datetime('now'))"
      ).bind(`PENDING-${ref}`, email, product, ref).run();
    } catch (e) { /* table may not exist on first deploy */ }
  }

  // Response shape is preserved for backwards compatibility with success.html
  // and the checkout pages: `checkout_url` is what they redirect to.
  return jsonResponse({ checkout_url: checkoutUrl, session_id: ref }, 200, corsHeaders);
}

async function handleVerify(request, env, corsHeaders) {
  if (!isAllowedOrigin(request)) {
    return jsonResponse({ error: "Cross-origin request rejected" }, 403, corsHeaders);
  }
  const body = await request.json();
  const { session_id } = body;
  if (!session_id) return jsonResponse({ error: "Session ID required" }, 400, corsHeaders);
  if (!env.DB) return jsonResponse({ error: "Database unavailable" }, 500, corsHeaders);

  // The webhook may land a beat after the user hits the success page; give it
  // a short window before reporting "not paid yet". Each retry waits 500ms.
  for (let attempt = 0; attempt < 6; attempt++) {
    const row = await env.DB.prepare(
      "SELECT license_key, email, product FROM licenses WHERE payment_ref = ?"
    ).bind(session_id).first();

    if (row && row.license_key && !row.license_key.startsWith("PENDING-")) {
      return jsonResponse({
        success: true,
        license_key: row.license_key,
        product: row.product,
        product_name: PRODUCTS[row.product]?.name || row.product,
        email: row.email,
      }, 200, corsHeaders);
    }
    await new Promise(r => setTimeout(r, 500));
  }

  return jsonResponse({
    error: "License not ready yet. Check your email -- a confirmation is on its way.",
    pending: true,
  }, 202, corsHeaders);
}

// Verify Lemon Squeezy webhook signature (HMAC-SHA256 hex of the raw body).
async function verifyLsSignature(rawBody, signatureHex, secret) {
  if (!signatureHex || !secret) return false;
  const keyData = new TextEncoder().encode(secret);
  const msgData = new TextEncoder().encode(rawBody);
  const key = await crypto.subtle.importKey("raw", keyData, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sigBuf = await crypto.subtle.sign("HMAC", key, msgData);
  const expected = Array.from(new Uint8Array(sigBuf)).map(b => b.toString(16).padStart(2, "0")).join("");
  // Constant-time compare.
  if (expected.length !== signatureHex.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ signatureHex.charCodeAt(i);
  return diff === 0;
}

async function handleWebhook(request, env, corsHeaders) {
  const rawBody = await request.text();
  const signature = request.headers.get("X-Signature") || "";

  const ok = await verifyLsSignature(rawBody, signature, env.LEMONSQUEEZY_WEBHOOK_SECRET);
  if (!ok) return jsonResponse({ error: "Invalid signature" }, 401, corsHeaders);

  let event;
  try { event = JSON.parse(rawBody); } catch (_) {
    return jsonResponse({ error: "Invalid JSON" }, 400, corsHeaders);
  }

  const eventName = event?.meta?.event_name || "";
  const custom    = event?.meta?.custom_data || {};
  const attrs     = event?.data?.attributes || {};
  const orderId   = event?.data?.id || "";

  // Only act on creation events. Updates/refunds/cancellations are intentionally
  // ignored at this layer; license revocation happens manually for now.
  const isCreate = eventName === "order_created" || eventName === "subscription_created";
  if (!isCreate) return jsonResponse({ received: true, ignored: eventName }, 200, corsHeaders);

  const ref     = custom.ref || orderId;
  const product = custom.product || "";
  const email   = attrs.user_email || attrs.customer_email || "";

  if (!product || !email || !PRODUCTS[product]) {
    // Bad metadata -- log but don't 500 (Lemon Squeezy would retry forever).
    console.error("Webhook missing product/email:", { eventName, ref, product, email });
    return jsonResponse({ received: true, error: "Missing metadata" }, 200, corsHeaders);
  }

  // Sassy-Talk keys must exist in the relay license DB so the direct APK can
  // activate via /license/activate. WinForensics keys must exist in the
  // winforensics-license-api D1 (WFP- format) — the desktop app validates
  // against that worker, not this one. SassyMCP activates against Lemon
  // Squeezy's own license API (sassymcp/_lemonsqueezy.py), so mcp-* buyers
  // need the LS-issued key — a SASSY- key cannot activate the app. Other
  // products keep the legacy website key.
  let licenseKey = null;
  if (product === "sassy-talk") {
    licenseKey = await issueRelayLicense(env, {
      email,
      note: `lemonsqueezy:${orderId || ref}`,
    });
  } else if (product === "winforensics") {
    licenseKey = await issueWinforensicsLicense(env, {
      email,
      note: `lemonsqueezy:${orderId || ref}`,
    });
  } else if (product.startsWith("mcp-") && orderId) {
    licenseKey = await fetchLsLicenseKey(env, orderId);
  }
  if (!licenseKey) {
    licenseKey = await generateLicenseKey(email, product, ref, env.LICENSE_SALT);
  }

  if (env.DB) {
    try {
      // Replace any PENDING-* placeholder row written by /api/checkout.
      await env.DB.prepare(
        "UPDATE licenses SET license_key = ?, email = ?, product = ? WHERE payment_ref = ?"
      ).bind(licenseKey, email, product, ref).run();
      // If no row existed (rare: webhook before checkout response persisted), insert.
      await env.DB.prepare(
        "INSERT OR IGNORE INTO licenses (license_key, email, product, payment_ref, created_at) VALUES (?, ?, ?, ?, datetime('now'))"
      ).bind(licenseKey, email, product, ref).run();
    } catch (e) { console.error("License DB write failed:", e); }
  }

  const total = attrs.total_formatted || (attrs.total != null ? `$${(attrs.total / 100).toFixed(2)}` : "n/a");
  await sendBuyerLicenseEmail(env, { email, product, licenseKey });
  await sendNotification(env,
    `Payment Confirmed: ${PRODUCTS[product]?.name || product}`,
    `Lemon Squeezy ${eventName}!\n\nProduct: ${PRODUCTS[product]?.name || product}\nEmail: ${email}\nLicense: ${licenseKey}\nOrder ID: ${orderId}\nRef: ${ref}\nAmount: ${total}`
  );

  return jsonResponse({ received: true }, 200, corsHeaders);
}

// Deliver the license key to the buyer. The Cloudflare Email binding can
// only send to verified destination addresses (that's why sendNotification
// targets info@ only), so buyer mail goes out through the Resend API.
// Without RESEND_API_KEY this is a logged no-op and delivery falls back to
// the success page + the Lemon Squeezy receipt.
async function sendBuyerLicenseEmail(env, { email, product, licenseKey }) {
  if (!env.RESEND_API_KEY) {
    console.warn("RESEND_API_KEY unset — buyer license email skipped");
    return;
  }
  const name = PRODUCTS[product]?.name || product;
  const keyParam = encodeURIComponent(licenseKey);
  const mcpActivate = (seats) =>
    `Download SassyMCP (free installer, your key unlocks the paid tiers):\n` +
    `https://github.com/sassyconsultingllc/SassyMCP/releases/latest\n\n` +
    `Activate: run the setup wizard (or the "activate license" tool in any MCP client),\n` +
    `paste your key when prompted. Works on ${seats}.`;
  const downloadLines = {
    "winforensics": `Download (Windows):\n${env.SITE_URL}/download/winforensics/windows/WinForensicsPro-GUI-latest.exe?key=${keyParam}\n\nActivate: Settings > License Management > paste your key > Activate.\nUpdates: Settings > Updates — checks are gated by this same key.`,
    "sassy-talk":   `Download (Android):\n${env.SITE_URL}/download/sassy-talk/android/sassytalkie.apk\n\nActivate in-app with your key.`,
    "mcp-pro":      mcpActivate("2 machines you own"),
    "mcp-forensics":mcpActivate("2 machines — stacks on Free or Pro"),
    "mcp-team":     mcpActivate("up to 10 machines"),
    "website-creator": `Getting started: ${env.SITE_URL}/website-creator.html`,
  };
  const text = [
    `Thanks for buying ${name}.`,
    ``,
    `Your license key:`,
    `${licenseKey}`,
    ``,
    downloadLines[product] || `Getting started: ${env.SITE_URL}/store`,
    ``,
    `Keep this email — the key is your lifetime license.`,
    `Questions or refunds (14 days, no questions asked): info@sassyconsultingllc.com`,
    ``,
    `— Sassy Consulting LLC`,
  ].join("\n");
  try {
    const resp = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: env.EMAIL_FROM || "Sassy Consulting <notifications@sassyconsultingllc.com>",
        to: [email],
        subject: `Your ${sanitizeHeaderValue(name, 60)} license key`,
        text,
      }),
    });
    if (!resp.ok) {
      console.error("Buyer license email failed:", resp.status, await resp.text());
    }
  } catch (e) {
    console.error("Buyer license email error:", e);
  }
}

// True when `key` is a WFP- license the winforensics-license-api accepts.
// No machine_id is passed, so "valid but not activated on this machine"
// still counts — a buyer must be able to download before first activation.
async function validateWinfKey(env, key) {
  if (!key || !key.startsWith("WFP-")) return false;
  const base = (env.WINF_LICENSE_URL || "https://winforensics-license-api.sassyconsultingllc.workers.dev").replace(/\/$/, "");
  try {
    const resp = await fetch(`${base}/api/license/validate?key=${encodeURIComponent(key)}`, {
      signal: AbortSignal.timeout(10000),
    });
    if (!resp.ok) return false;
    const data = await resp.json();
    return data.valid === true;
  } catch (e) {
    console.error("WinForensics key validation error:", e);
    return false;
  }
}

// Compare secrets by SHA-256 digest so string-compare timing reveals nothing.
async function secretsMatch(a, b) {
  const enc = new TextEncoder();
  const [da, db] = await Promise.all([
    crypto.subtle.digest("SHA-256", enc.encode(a)),
    crypto.subtle.digest("SHA-256", enc.encode(b)),
  ]);
  const va = new Uint8Array(da), vb = new Uint8Array(db);
  let diff = 0;
  for (let i = 0; i < va.length; i++) diff |= va[i] ^ vb[i];
  return diff === 0;
}

// PUT /api/admin/gated-upload?path=winforensics/windows/<file>
// Streams the request body into the GATED bucket. Auth: the same bearer
// token the webhook uses to mint WinForensics licenses — ops-internal,
// never shipped to clients. Path is confined to the winforensics/ prefix;
// every segment must pass isSafeSegment so nothing can escape it.
async function handleGatedUpload(request, url, env, corsHeaders) {
  const token = (request.headers.get("Authorization") || "").replace(/^Bearer /, "");
  if (!env.WINF_LICENSE_ADMIN_TOKEN || !token || !(await secretsMatch(token, env.WINF_LICENSE_ADMIN_TOKEN))) {
    return jsonResponse({ error: "Unauthorized" }, 401, corsHeaders);
  }
  const key = url.searchParams.get("path") || "";
  const segments = key.split("/");
  const UPLOAD_PREFIXES = new Set(["winforensics", "sassymcp", "website-creator"]);
  if (!UPLOAD_PREFIXES.has(segments[0]) || segments.length < 2 || !segments.every(isSafeSegment)) {
    return jsonResponse({ error: "path must be <winforensics|sassymcp|website-creator>/<safe segments>" }, 400, corsHeaders);
  }
  if (!env.GATED) return jsonResponse({ error: "GATED bucket unavailable" }, 500, corsHeaders);
  const contentType = request.headers.get("Content-Type") || "application/octet-stream";
  const object = await env.GATED.put(key, request.body, {
    httpMetadata: { contentType },
  });
  return jsonResponse({ ok: true, key, size: object?.size ?? null, etag: object?.etag ?? null }, 200, corsHeaders);
}

async function handleValidateLicense(request, env, corsHeaders) {
  if (!isAllowedOrigin(request)) {
    return jsonResponse({ error: "Cross-origin request rejected" }, 403, corsHeaders);
  }
  const ip = request.headers.get("CF-Connecting-IP") || "unknown";
  if (isRateLimited(`validate:${ip}`)) {
    return jsonResponse({ valid: false, error: "Too many attempts. Try again in a minute." }, 429, corsHeaders);
  }
  // POST takes {license_key} (or {key}); the GET alias takes ?key= to match
  // the URL shape shipped in SassyMCP's legacy weekly check.
  let license_key;
  if (request.method === "GET") {
    const q = new URL(request.url).searchParams;
    license_key = q.get("key") || q.get("license_key") || "";
  } else {
    const body = await request.json();
    license_key = body.license_key || body.key || "";
  }
  if (!license_key) return jsonResponse({ valid: false, error: "License key required" }, 400, corsHeaders);
  if (!license_key.startsWith("SASSY-")) return jsonResponse({ valid: false, reason: "invalid_format", error: "Invalid license format" }, 200, corsHeaders);
  if (env.DB) {
    // SELECT * so a missing `revoked` column (prod schema predates migration
    // 0005) reads as undefined -> not revoked, instead of a SQLITE_ERROR.
    const result = await env.DB.prepare("SELECT * FROM licenses WHERE license_key = ?").bind(license_key).first();
    if (result) {
      if (result.revoked) return jsonResponse({ valid: false, reason: "revoked", error: "License has been revoked. Contact support." }, 200, corsHeaders);
      return jsonResponse({ valid: true, product: result.product, created_at: result.created_at }, 200, corsHeaders);
    }
  }
  return jsonResponse({ valid: false, reason: "not_found", error: "License not found" }, 200, corsHeaders);
}

async function handleVPNRecommendations(corsHeaders) {
  return jsonResponse([
    { name: "ProtonVPN", description: "Swiss-based, strict no-log policy, open source apps", website: "https://protonvpn.com", free_tier: true },
    { name: "Windscribe", description: "10GB free per month, browser extension included", website: "https://windscribe.com", free_tier: true },
    { name: "Cloudflare WARP", description: "Fast and lightweight, built into 1.1.1.1 app", website: "https://1.1.1.1", free_tier: true },
    { name: "TunnelBear", description: "Simple interface, 2GB free per month", website: "https://tunnelbear.com", free_tier: true }
  ], 200, corsHeaders);
}

async function handleDownloadsList(env, corsHeaders) {
  return jsonResponse([
    { product: "sassy-talk", name: "Sassy-Talk", platforms: [{ platform: "android", filename: "sassytalkie.apk", size: "15MB" }, { platform: "windows", filename: "sassy-talk-setup.msi", size: "25MB" }] },
    { product: "sassy-brain", name: "Sassy Brain", platforms: [{ platform: "windows", filename: "SassyBrain_Installer-v0.2.1.exe", size: "92MB" }, { platform: "windows", filename: "SassyBrain_Portable-v0.2.1.exe", size: "92MB" }] }
  ], 200, corsHeaders);
}

async function handlePrivacy(path, env) {
  // Map /privacy/<product>[/<file>] to R2 key in the PRIVACY bucket.
  // Missing file defaults to index.html. Return null if not found so the
  // caller can fall back to the static ASSETS bundle (existing in-tree policies).
  if (!env.PRIVACY) return null;
  const rest = path.replace(/^\/privacy\//, "").replace(/^\/+|\/+$/g, "");
  if (!rest) return null;
  // Reject any segment that could escape the prefix (e.g. "..", absolute paths, backslashes).
  const segments = rest.split("/");
  for (const seg of segments) {
    if (!isSafeSegment(seg)) return null;
  }
  const hasExt = /\.[a-z0-9]+$/i.test(rest);
  const key = hasExt ? rest : `${rest}/index.html`;
  const object = await env.PRIVACY.get(key);
  if (!object) return null;
  const ext = key.split(".").pop().toLowerCase();
  const mime = {
    html: "text/html; charset=utf-8",
    css: "text/css; charset=utf-8",
    js: "application/javascript; charset=utf-8",
    json: "application/json; charset=utf-8",
    png: "image/png",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    svg: "image/svg+xml",
    pdf: "application/pdf",
    txt: "text/plain; charset=utf-8"
  }[ext] || object.httpMetadata?.contentType || "application/octet-stream";
  return new Response(object.body, {
    headers: {
      "Content-Type": mime,
      "Cache-Control": "public, max-age=300",
      "X-Content-Type-Options": "nosniff"
    }
  });
}

async function handleDownload(path, url, env, corsHeaders) {
  const parts = path.replace("/download/", "").split("/");
  if (parts.length < 3) return new Response("Not found", { status: 404 });
  const [product, platform, filename] = parts;

  // Reject anything that could escape the intended R2 prefix.
  if (!isSafeSegment(product) || !isSafeSegment(platform) || !isSafeSegment(filename)) {
    return new Response("Not found", { status: 404 });
  }

  // Gated products require a valid SASSY- license key (except /demo/ which is public).
  // The license must match the requested product and not be revoked. Gated objects live
  // in env.GATED (no public custom domain) so the only way to reach them is through this
  // worker. Public objects live in env.DOWNLOADS (sassy-downloads), which is exposed as
  // sassycreates.sassyconsultingllc.com -- DO NOT put gated content there.
  const GATED_PRODUCTS = {
    sassytalk: "/sassy-talk.html",
    sassymcp:  "/store",
    winforensics: "/store",
  };
  const isGated = GATED_PRODUCTS[product] && platform !== "demo";
  if (isGated && product === "winforensics") {
    // WinForensics keys are WFP- format, minted into (and validated by)
    // the winforensics-license-api worker — not this worker's D1. This
    // same gate serves both the store download and the app's updater
    // (update.json + versioned exe live under the winforensics/ prefix).
    const licenseKey = url.searchParams.get("key");
    if (!(await validateWinfKey(env, licenseKey))) {
      return jsonResponse({ error: `Valid license key required. Purchase at ${GATED_PRODUCTS[product]}` }, 403, corsHeaders);
    }
  } else if (isGated) {
    const licenseKey = url.searchParams.get("key");
    if (!licenseKey || !licenseKey.startsWith("SASSY-")) {
      return jsonResponse({ error: `Valid license key required. Purchase at ${GATED_PRODUCTS[product]}` }, 403, corsHeaders);
    }
    if (env.DB) {
      // SELECT * — see handleValidateLicense; prod may lack `revoked`.
      const result = await env.DB.prepare("SELECT * FROM licenses WHERE license_key = ?").bind(licenseKey).first();
      if (!result) {
        return jsonResponse({ error: "Invalid license key" }, 403, corsHeaders);
      }
      if (result.revoked) {
        return jsonResponse({ error: "License has been revoked. Contact support." }, 403, corsHeaders);
      }
      // Require the license's product to match the gated bucket prefix. Legacy keys may
      // store product slugs that differ from the R2 prefix (e.g. "sassy-talk" vs "sassytalk"),
      // so compare with dashes/spaces stripped. All SassyMCP SKUs (mcp-pro /
      // mcp-forensics / mcp-team) entitle the shared sassymcp prefix.
      const norm = (s) => String(s || "").toLowerCase().replace(/[-_\s]/g, "");
      const productMatches = norm(result.product) === norm(product) ||
        (norm(product) === "sassymcp" && String(result.product || "").startsWith("mcp-"));
      if (!productMatches) {
        return jsonResponse({ error: "License does not match this product." }, 403, corsHeaders);
      }
    }
  }

  // v2.7.x canonical-key alias. The public `sassytalkie.apk` URL stays stable
  // across releases (baked into QR codes, posters, install scripts) but the
  // R2 key it actually serves from rotates per release. The mapping is driven
  // by wrangler env vars so a new ship is one `wrangler secret put` away from
  // being live — no app code or QR re-prints.
  //
  // Why this exists: wrangler 4.60-4.98 on Windows silently truncates large
  // PUTs to the literal canonical APK key (writes 0 bytes, reports "Upload
  // complete"). Versioned-filename keys upload reliably, so we serve from
  // those and rebind the canonical via this alias. Fallback to the original
  // key keeps non-aliased downloads (sassy-browser, scrubs, etc.) unchanged.
  const requestedKey = `${product}/${platform}/${filename}`;
  const aliasMap = {
    "sassy-talk/android/sassytalkie.apk":      env.LATEST_ANDROID_APK,
    "sassy-talk/android/sassytalkie.aab":      env.LATEST_ANDROID_AAB,
    "sassy-talk/windows/sassy-talk-setup.msi": env.LATEST_WINDOWS_MSI,
    "sassy-talk/windows/sassy-talk-setup.exe": env.LATEST_WINDOWS_EXE,
    "winforensics/windows/WinForensicsPro-GUI-latest.exe": env.LATEST_WINFORENSICS_EXE,
  };
  const r2Key = aliasMap[requestedKey] || requestedKey;
  const bucket = isGated ? env.GATED : env.DOWNLOADS;
  const object = await bucket.get(r2Key);
  if (!object) return new Response("File not found", { status: 404 });
  if (env.DB) { try { await env.DB.prepare("UPDATE downloads SET download_count = download_count + 1 WHERE r2_key = ?").bind(r2Key).run(); } catch (e) {} }
  const headers = new Headers(corsHeaders);
  // Derive content-type from extension (R2 metadata often missing)
  const ext = filename.split('.').pop()?.toLowerCase();
  const mimeTypes = {
    apk: "application/vnd.android.package-archive",
    msi: "application/x-msi",
    exe: "application/x-msdownload",
    zip: "application/zip",
    pdf: "application/pdf",
  };
  headers.set("Content-Type", mimeTypes[ext] || object.httpMetadata?.contentType || "application/octet-stream");
  headers.set("Content-Disposition", `attachment; filename="${filename}"`);
  return new Response(object.body, { headers });
}

// ═══════════════════════════════════════════════════
// NDA: VERIFY ACCESS CODE
// ═══════════════════════════════════════════════════
async function handleNdaVerifyCode(request, env, corsHeaders) {
  if (!isAllowedOrigin(request)) {
    return jsonResponse({ error: "Cross-origin request rejected" }, 403, corsHeaders);
  }
  const body = await request.json();
  const { code } = body;
  if (!code) return jsonResponse({ valid: false, error: "Access code required." }, 400, corsHeaders);
  const expectedCode = env.NDA_ACCESS_CODE || "sassy-nda-2026";
  const valid = code === expectedCode;
  const ip = request.headers.get("CF-Connecting-IP") || "unknown";
  if (env.DB) { try { await env.DB.prepare("INSERT INTO nda_access_log (ip, action, success, created_at) VALUES (?, 'verify_code', ?, datetime('now'))").bind(ip, valid ? 1 : 0).run(); } catch(e) {} }
  if (!valid) return jsonResponse({ valid: false, error: "Invalid access code." }, 403, corsHeaders);
  return jsonResponse({ valid: true }, 200, corsHeaders);
}

// ═══════════════════════════════════════════════════
// NDA: SIGN AGREEMENT
// ═══════════════════════════════════════════════════
async function handleNdaSign(request, env, corsHeaders) {
  if (!isAllowedOrigin(request)) {
    return jsonResponse({ error: "Cross-origin request rejected" }, 403, corsHeaders);
  }
  const body = await request.json();
  const required = ["name", "address", "jurisdiction", "email", "title", "initials", "signature_data"];
  for (const field of required) {
    if (!body[field] || !body[field].trim()) return jsonResponse({ success: false, error: `Missing required field: ${field}` }, 400, corsHeaders);
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.email)) return jsonResponse({ success: false, error: "Invalid email address." }, 400, corsHeaders);
  const consents = body.consents || {};
  if (!consents.read || !consents.electronic || !consents.bind || !consents.retention) return jsonResponse({ success: false, error: "All consent checkboxes must be checked." }, 400, corsHeaders);
  if (body.signature_mode === "draw" && !body.signature_data.startsWith("data:image/png")) return jsonResponse({ success: false, error: "Invalid signature data." }, 400, corsHeaders);
  if (body.signature_mode === "type" && body.signature_data.replace("typed:", "").trim().length < 3) return jsonResponse({ success: false, error: "Typed signature must be at least 3 characters." }, 400, corsHeaders);
  const now = new Date();
  const agreementNo = `NDA-${now.getFullYear()}${String(now.getMonth()+1).padStart(2,"0")}${String(now.getDate()).padStart(2,"0")}-${crypto.randomUUID().substring(0,8).toUpperCase()}`;
  const ip = request.headers.get("CF-Connecting-IP") || "unknown";
  const country = request.headers.get("CF-IPCountry") || "XX";
  const signedAt = now.toISOString();
  const tokenHash = await sha256(`${agreementNo}:${body.email}:${signedAt}:${env.LICENSE_SALT || "nda-salt"}`);
  const downloadToken = tokenHash.substring(0, 32);
  const docHash = NDA_DOC_HASH !== "TO_BE_COMPUTED_ON_DEPLOY" ? NDA_DOC_HASH : await sha256(`nda-sassy-browser-mutual-v1-${agreementNo}`);
  if (env.DB) {
    try {
      await env.DB.prepare(`INSERT INTO nda_signatures (agreement_no, signer_name, signer_org, signer_address, signer_jurisdiction, signer_email, signer_title, signer_initials, signature_mode, signature_data, consent_read, consent_electronic, consent_bind, consent_retention, ip_address, country, user_agent, timezone, screen_res, doc_hash, download_token, token_expires_at, signed_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now', '+24 hours'), ?, datetime('now'))`).bind(
        agreementNo, body.name.trim(), (body.organization || "").trim(), body.address.trim(), body.jurisdiction.trim(), body.email.trim(), body.title.trim(), body.initials.trim().toUpperCase(),
        body.signature_mode, body.signature_data, consents.read ? 1 : 0, consents.electronic ? 1 : 0, consents.bind ? 1 : 0, consents.retention ? 1 : 0,
        ip, country, (body.user_agent || "").substring(0, 500), body.timezone || "", body.screen || "", docHash, downloadToken, signedAt
      ).run();
    } catch(e) { console.error("NDA DB error:", e); return jsonResponse({ success: false, error: "Failed to record signature. Please try again." }, 500, corsHeaders); }
  }
  if (env.DB) { try { await env.DB.prepare("INSERT INTO nda_access_log (ip, action, success, metadata, created_at) VALUES (?, 'sign', 1, ?, datetime('now'))").bind(ip, agreementNo).run(); } catch(e) {} }
  // Notify: NDA signed
  await sendNotification(env,
    `NDA Signed: ${agreementNo}`,
    `New NDA signature!\n\nAgreement: ${agreementNo}\nName: ${body.name.trim()}\nEmail: ${body.email.trim()}\nTitle: ${body.title.trim()}\nOrg: ${(body.organization || "N/A").trim()}\nJurisdiction: ${body.jurisdiction.trim()}\nCountry: ${country}\nSigned: ${signedAt}`
  );
  return jsonResponse({ success: true, agreement_no: agreementNo, signed_at: signedAt, doc_hash: docHash, token: downloadToken }, 200, corsHeaders);
}

// ═══════════════════════════════════════════════════
// NDA: DOWNLOAD (token-gated)
// ═══════════════════════════════════════════════════
async function handleNdaDownload(request, env, corsHeaders) {
  if (!isAllowedOrigin(request)) {
    return jsonResponse({ error: "Cross-origin request rejected" }, 403, corsHeaders);
  }
  const body = await request.json();
  const { token, platform } = body;
  if (!token || !platform) return jsonResponse({ error: "Token and platform are required." }, 400, corsHeaders);
  if (!["windows", "macos"].includes(platform)) return jsonResponse({ error: "Invalid platform." }, 400, corsHeaders);
  if (!env.DB) return jsonResponse({ error: "Database unavailable." }, 500, corsHeaders);
  const record = await env.DB.prepare("SELECT agreement_no, signer_email, token_expires_at, download_count FROM nda_signatures WHERE download_token = ?").bind(token).first();
  if (!record) return jsonResponse({ error: "Invalid or expired download token." }, 403, corsHeaders);
  if (new Date() > new Date(record.token_expires_at)) return jsonResponse({ error: "Download token has expired. Contact Sassy Consulting LLC." }, 403, corsHeaders);
  if (record.download_count >= 5) return jsonResponse({ error: "Download limit reached. Contact Sassy Consulting LLC." }, 429, corsHeaders);
  const filename = platform === "windows" ? "sassybrowser.exe" : "sassybrowser.dmg";
  const r2Key = `sassy-browser/${filename}`;
  if (env.DOWNLOADS) { const obj = await env.DOWNLOADS.head(r2Key); if (!obj) return jsonResponse({ error: `Build not found: ${filename}. Contact Sassy Consulting LLC.` }, 404, corsHeaders); }
  try { await env.DB.prepare("UPDATE nda_signatures SET download_count = download_count + 1 WHERE download_token = ?").bind(token).run(); } catch(e) {}
  const ip = request.headers.get("CF-Connecting-IP") || "unknown";
  try { await env.DB.prepare("INSERT INTO nda_access_log (ip, action, success, metadata, created_at) VALUES (?, 'download', 1, ?, datetime('now'))").bind(ip, `${record.agreement_no}:${platform}:${filename}`).run(); } catch(e) {}
  return jsonResponse({ download_url: `/download/sassy-browser/${platform}/${filename}`, filename, agreement_no: record.agreement_no, downloads_remaining: 5 - (record.download_count + 1) }, 200, corsHeaders);
}

// ═══════════════════════════════════════════════════
// UTILITIES
// ═══════════════════════════════════════════════════

/**
 * Send an email via the Cloudflare Email Workers send_email binding.
 * Binding name: CONTACT_EMAIL (declared in wrangler.jsonc).
 * The `to` address must be a verified destination on the account.
 * Non-blocking: failures are logged but never propagated.
 */
async function sendEmailViaCF(env, { from, to, subject, text, replyTo, senderLabel }) {
  if (!env.CONTACT_EMAIL) return;
  try {
    const headers = [
      `From: ${senderLabel ? `${senderLabel} <${from}>` : from}`,
      `To: ${to}`,
      replyTo ? `Reply-To: ${replyTo}` : null,
      `Subject: ${subject}`,
      `MIME-Version: 1.0`,
      `Content-Type: text/plain; charset=utf-8`,
      `Date: ${new Date().toUTCString()}`,
      ``,
    ].filter(Boolean);
    const raw = headers.join("\r\n") + "\r\n" + text;
    const msg = new EmailMessage(from, to, raw);
    await env.CONTACT_EMAIL.send(msg);
  } catch (e) {
    console.error("CF email failed:", e);
  }
}

/**
 * Backwards-compatible notification helper used by webhook + NDA flows.
 * Sender is the "notifications@" alias to differentiate from form replies.
 */
async function sendNotification(env, subject, bodyText) {
  await sendEmailViaCF(env, {
    from: "notifications@sassyconsultingllc.com",
    senderLabel: "Sassy Consulting",
    to: "info@sassyconsultingllc.com",
    subject: subject,
    text: bodyText + "\n\n---\nAutomated notification from sassyconsultingllc.com",
  });
}

function jsonResponse(data, status, corsHeaders) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      ...corsHeaders,
      ...SECURITY_HEADERS,
      "Content-Type": "application/json",
      "Cache-Control": "private, no-store",
    },
  });
}

// Wrap a static-asset response with security headers. Adds CSP to HTML pages
// and no-sniff/HSTS/Referrer-Policy/X-Frame-Options to everything.
function withSecurityHeaders(response) {
  const headers = new Headers(response.headers);
  for (const [k, v] of Object.entries(SECURITY_HEADERS)) {
    if (!headers.has(k)) headers.set(k, v);
  }
  const contentType = headers.get("Content-Type") || "";
  if (contentType.includes("text/html") && !headers.has("Content-Security-Policy")) {
    headers.set("Content-Security-Policy", HTML_CSP);
  }
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

function detectVPN(asn, asnOrg, headers) {
  const asnNum = parseInt(asn);
  const orgLower = asnOrg.toLowerCase();
  if (DATACENTER_ASNS.has(asnNum)) return { isVPN: true, confidence: "high", reason: "Known datacenter ASN" };
  for (const keyword of VPN_KEYWORDS) { if (orgLower.includes(keyword)) return { isVPN: true, confidence: "medium", reason: `ISP name contains "${keyword}"` }; }
  for (const header of ["X-Forwarded-For", "Via", "X-Proxy-ID", "Forwarded"]) { if (headers.get(header)) return { isVPN: true, confidence: "medium", reason: "Proxy headers detected" }; }
  return { isVPN: false, confidence: "high", reason: "Direct connection" };
}

function maskIP(ip) {
  if (!ip || ip === "unknown") return "xxx.xxx";
  const parts = ip.split(".");
  return parts.length === 4 ? `${parts[0]}.${parts[1]}.xxx.xxx` : "xxx.xxx";
}

async function hashIP(ip, salt) {
  const data = new TextEncoder().encode(ip + salt);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, "0")).join("");
}

async function sha256(str) {
  const data = new TextEncoder().encode(str);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, "0")).join("");
}

/** Issue a relay-side license key for the direct APK (Play uses Billing). */
async function issueRelayLicense(env, { email, note }) {
  const base = (env.RELAY_LICENSE_URL || "https://relay.sassyconsultingllc.com").replace(/\/$/, "");
  const token = env.LICENSE_RELAY_ADMIN_TOKEN;
  if (!token) {
    console.warn("LICENSE_RELAY_ADMIN_TOKEN unset — sassy-talk keys will not activate in the app");
    return null;
  }
  try {
    const resp = await fetch(`${base}/license/issue`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ count: 1, email, note, max_devices: 3 }),
    });
    const data = await resp.json();
    if (!resp.ok || !data.ok || !data.keys?.[0]) {
      console.error("Relay license issue failed:", resp.status, data);
      return null;
    }
    return data.keys[0];
  } catch (e) {
    console.error("Relay license issue error:", e);
    return null;
  }
}

/**
 * Fetch the Lemon Squeezy-generated license key for an order. Used for
 * SassyMCP SKUs, whose variants have "Generate license keys" enabled —
 * the app's activation flow calls LS /v1/licenses/activate, so only the
 * LS-native key works. Keys are minted with the order, but give LS a
 * short grace window in case the webhook races key creation.
 */
async function fetchLsLicenseKey(env, orderId) {
  if (!env.LEMONSQUEEZY_API_KEY) return null;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const resp = await fetch(`${LS_API}/license-keys?filter[order_id]=${encodeURIComponent(orderId)}`, {
        headers: lsHeaders(env),
        signal: AbortSignal.timeout(10000),
      });
      if (resp.ok) {
        const data = await resp.json();
        const key = data?.data?.[0]?.attributes?.key;
        if (key) return key;
      } else {
        console.error("LS license-key fetch failed:", resp.status);
      }
    } catch (e) {
      console.error("LS license-key fetch error:", e);
    }
    await new Promise(r => setTimeout(r, 1500));
  }
  console.error("LS license key not found for order", orderId, "— falling back to SASSY- key");
  return null;
}

async function issueWinforensicsLicense(env, { email, note }) {
  const base = (env.WINF_LICENSE_URL || "https://winforensics-license-api.sassyconsultingllc.workers.dev").replace(/\/$/, "");
  const token = env.WINF_LICENSE_ADMIN_TOKEN;
  if (!token) {
    console.warn("WINF_LICENSE_ADMIN_TOKEN unset — winforensics keys will not activate in the app");
    return null;
  }
  try {
    const resp = await fetch(`${base}/api/license/issue`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ email, note, tier: "professional", billing_type: "lifetime" }),
    });
    const data = await resp.json();
    if (!resp.ok || !data.ok || !data.key) {
      console.error("WinForensics license issue failed:", resp.status, data);
      return null;
    }
    return data.key;
  } catch (e) {
    console.error("WinForensics license issue error:", e);
    return null;
  }
}

async function generateLicenseKey(email, product, orderId, salt) {
  const raw = `${email}:${product}:${orderId}:${salt || "default"}`;
  const data = new TextEncoder().encode(raw);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hex = Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, "0")).join("").toUpperCase();
  const productCode = product.toUpperCase().replace("-", "").substring(0, 4);
  return `SASSY-${productCode}-${hex.substring(0, 4)}-${hex.substring(4, 8)}-${hex.substring(8, 12)}`;
}

function getTimezone(country, region) {
  const timezones = { "US": { "CA": "America/Los_Angeles", "NY": "America/New_York", "TX": "America/Chicago", "WI": "America/Chicago", "default": "America/New_York" }, "default": "UTC" };
  const countryTz = timezones[country] || timezones["default"];
  return typeof countryTz === "object" ? (countryTz[region] || countryTz["default"]) : countryTz;
}

// ═══════════════════════════════════════════════════════════════════════════
// SCRUBBED-FILE PDF PIPELINE
//
// The /app-testers page lets testers drop a file. JS in the browser strips
// it to printable ASCII and defangs shell/batch syntax, then posts the
// scrubbed text in the existing form. Here we:
//   1. Wrap the text in a minimal, valid PDF (Courier, no embedded fonts).
//   2. Save it to env.GATED under app-tester-scrubs/<uuid>.pdf.
//   3. Build a multipart/mixed email with the PDF attached *and* a
//      worker-routed link the recipient can re-download from.
// Reusing GATED (not DOWNLOADS) keeps these PDFs off the public custom
// domain — only this worker can hand them out, via /scrub/<uuid>.pdf.
// ═══════════════════════════════════════════════════════════════════════════

// Minimal PDF generator for ASCII-only text. Uses the standard Type1 Courier
// font (no embedding required), letter paper, 9pt mono. Output is a valid
// PDF 1.4 with a proper xref table — opens in any PDF reader.
function buildPdfFromText(text, header) {
  const FONT_SIZE = 9;
  const LINE_HEIGHT = 11;
  const PAGE_W = 612;       // 8.5" * 72
  const PAGE_H = 792;       // 11"  * 72
  const MARGIN_L = 50;
  const MARGIN_T = 60;
  const CHARS_PER_LINE = 94;
  const LINES_PER_PAGE = 60;
  const MAX_PAGES = 500;    // ~30k lines hard cap

  // PDF string literals must escape \, (, )
  const escPdf = (s) => s.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");

  // Hard-wrap to CHARS_PER_LINE while preserving existing line breaks.
  // Tabs expanded to 4 spaces so we don't lean on a tab-stop the font lacks.
  const wrapped = [];
  for (const rl of String(text || "").split("\n")) {
    if (rl.length === 0) { wrapped.push(""); continue; }
    const expanded = rl.replace(/\t/g, "    ");
    if (expanded.length <= CHARS_PER_LINE) { wrapped.push(expanded); continue; }
    for (let i = 0; i < expanded.length; i += CHARS_PER_LINE) {
      wrapped.push(expanded.slice(i, i + CHARS_PER_LINE));
    }
  }
  // Truncate if absurdly long, leaving a marker line.
  const maxLines = MAX_PAGES * LINES_PER_PAGE;
  let truncated = false;
  if (wrapped.length > maxLines) {
    wrapped.length = maxLines - 1;
    wrapped.push("... [output truncated at " + maxLines + " lines]");
    truncated = true;
  }
  if (wrapped.length === 0) wrapped.push("(empty)");

  // Group into pages.
  const pages = [];
  for (let i = 0; i < wrapped.length; i += LINES_PER_PAGE) {
    pages.push(wrapped.slice(i, i + LINES_PER_PAGE));
  }
  const N = pages.length;

  // Object IDs: 1=Catalog, 2=Pages, 3..2+N=Page objs, 3+N..2+2N=Contents, 3+2N=Font
  const pageObj = (i) => 3 + i;
  const contentObj = (i) => 3 + N + i;
  const fontObj = 3 + 2 * N;

  const objects = [];
  objects.push("<</Type /Catalog /Pages 2 0 R>>");
  const kids = [];
  for (let i = 0; i < N; i++) kids.push(`${pageObj(i)} 0 R`);
  objects.push(`<</Type /Pages /Kids [${kids.join(" ")}] /Count ${N}>>`);
  for (let i = 0; i < N; i++) {
    objects.push(
      `<</Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_W} ${PAGE_H}] ` +
      `/Contents ${contentObj(i)} 0 R ` +
      `/Resources <</Font <</F1 ${fontObj} 0 R>>>>>>`
    );
  }
  for (let i = 0; i < N; i++) {
    let stream = "";
    // Page header line
    const safeHeader = escPdf(`${header || "Scrubbed output"} - page ${i + 1} of ${N}`);
    stream += `BT /F1 ${FONT_SIZE} Tf ${MARGIN_L} ${PAGE_H - 30} Td (${safeHeader}) Tj ET\n`;
    // Body
    stream += `BT /F1 ${FONT_SIZE} Tf ${MARGIN_L} ${PAGE_H - MARGIN_T} Td ${LINE_HEIGHT} TL `;
    for (let j = 0; j < pages[i].length; j++) {
      stream += `(${escPdf(pages[i][j])}) Tj T* `;
    }
    stream += "ET";
    // Stream is fully ASCII, so JS char count == byte count.
    objects.push(`<</Length ${stream.length}>>\nstream\n${stream}\nendstream`);
  }
  objects.push("<</Type /Font /Subtype /Type1 /BaseFont /Courier /Encoding /WinAnsiEncoding>>");

  // Assemble PDF body with xref.
  let pdf = "%PDF-1.4\n";
  const offsets = [];
  for (let i = 0; i < objects.length; i++) {
    offsets.push(pdf.length);
    pdf += `${i + 1} 0 obj\n${objects[i]}\nendobj\n`;
  }
  const xrefStart = pdf.length;
  const totalEntries = objects.length + 1; // includes the free entry
  pdf += `xref\n0 ${totalEntries}\n`;
  pdf += "0000000000 65535 f \n";
  for (const off of offsets) {
    pdf += `${String(off).padStart(10, "0")} 00000 n \n`;
  }
  pdf += `trailer\n<</Size ${totalEntries} /Root 1 0 R>>\nstartxref\n${xrefStart}\n%%EOF\n`;

  const bytes = new Uint8Array(pdf.length);
  for (let i = 0; i < pdf.length; i++) bytes[i] = pdf.charCodeAt(i) & 0xff;
  return { bytes, pageCount: N, lineCount: wrapped.length, truncated };
}

// Chunked btoa — avoids stack overflow on multi-MB inputs.
function uint8ToBase64(bytes) {
  let bin = "";
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    bin += String.fromCharCode.apply(null, bytes.subarray(i, Math.min(i + CHUNK, bytes.length)));
  }
  return btoa(bin);
}

// Send a Cloudflare Email Workers message with one binary attachment.
// Builds a multipart/mixed RFC 5322 message by hand (the binding takes a raw string).
async function sendEmailWithAttachment(env, { from, to, subject, text, replyTo, senderLabel, attachment }) {
  if (!env.CONTACT_EMAIL) return;
  try {
    const boundary = "=_SassyMail_" + crypto.randomUUID().replace(/-/g, "");
    const headers = [
      `From: ${senderLabel ? `${senderLabel} <${from}>` : from}`,
      `To: ${to}`,
      replyTo ? `Reply-To: ${replyTo}` : null,
      `Subject: ${subject}`,
      `MIME-Version: 1.0`,
      `Date: ${new Date().toUTCString()}`,
      `Content-Type: multipart/mixed; boundary="${boundary}"`,
    ].filter(Boolean);

    // Wrap base64 at 76 cols per RFC 2045.
    const b64 = uint8ToBase64(attachment.bytes);
    const b64Lines = [];
    for (let i = 0; i < b64.length; i += 76) b64Lines.push(b64.slice(i, i + 76));

    const safeFilename = String(attachment.filename || "attachment.pdf").replace(/[^A-Za-z0-9._-]/g, "_").slice(0, 100);

    const parts = [
      "",
      "This is a multi-part message in MIME format.",
      "",
      `--${boundary}`,
      `Content-Type: text/plain; charset=utf-8`,
      `Content-Transfer-Encoding: 7bit`,
      "",
      text,
      "",
      `--${boundary}`,
      `Content-Type: ${attachment.contentType || "application/octet-stream"}; name="${safeFilename}"`,
      `Content-Disposition: attachment; filename="${safeFilename}"`,
      `Content-Transfer-Encoding: base64`,
      "",
      b64Lines.join("\r\n"),
      "",
      `--${boundary}--`,
      "",
    ];

    const raw = headers.join("\r\n") + "\r\n" + parts.join("\r\n");
    const msg = new EmailMessage(from, to, raw);
    await env.CONTACT_EMAIL.send(msg);
  } catch (e) {
    console.error("CF email-with-attachment failed:", e);
  }
}

// Worker-routed fetch for /scrub/<uuid>.pdf. UUIDs are unguessable, so this
// acts as a capability link — the email recipient can re-download by URL.
async function handleScrubFetch(path, env, corsHeaders) {
  const m = path.match(/^\/scrub\/([a-f0-9-]{36})\.pdf$/i);
  if (!m) return new Response("Not found", { status: 404 });
  if (!env.GATED) return new Response("Storage unavailable", { status: 503 });
  const uuid = m[1].toLowerCase();
  const key = `app-tester-scrubs/${uuid}.pdf`;
  const obj = await env.GATED.get(key);
  if (!obj) return new Response("Not found", { status: 404 });
  return new Response(obj.body, {
    headers: {
      ...SECURITY_HEADERS,
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="scrubbed-${uuid.slice(0, 8)}.pdf"`,
      "Cache-Control": "private, no-store",
    },
  });
}

