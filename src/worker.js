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

const PRODUCTS = {
  "sassy-talk": {
    name: "Sassy-Talk",
    amount: 200,
    description: "Encrypted walkie-talkie app for Android and Windows"
  },
  "winforensics": {
    name: "WinForensics",
    amount: 200,
    description: "Digital forensics toolkit for Windows"
  },
  "website-creator": {
    name: "Website Creator",
    amount: 200,
    description: "AI-powered WordPress builder with security hardening"
  }
};

// SHA-256 hash of the NDA PDF — update when PDF changes
const NDA_DOC_HASH = "TO_BE_COMPUTED_ON_DEPLOY";

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;
    const method = request.method;

    const corsHeaders = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, stripe-signature"
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
      if (path === "/api/checkout" && method === "POST") {
        return await handleCheckout(request, env, corsHeaders);
      }
      if (path === "/api/verify" && method === "POST") {
        return await handleVerify(request, env, corsHeaders);
      }
      if (path === "/api/webhook" && method === "POST") {
        return await handleWebhook(request, env, corsHeaders);
      }
      if (path === "/api/validate" && method === "POST") {
        return await handleValidateLicense(request, env, corsHeaders);
      }
      if (path === "/api/vpn-recommendations") {
        return await handleVPNRecommendations(corsHeaders);
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
      if (path.startsWith("/download/")) {
        return await handleDownload(path, env, corsHeaders);
      }
      return env.ASSETS.fetch(request);
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
  const zipCode = body.zip_code || "";
  const ip = request.headers.get("CF-Connecting-IP") || "unknown";
  const country = request.headers.get("CF-IPCountry") || "XX";
  const city = request.headers.get("CF-IPCity") || "Unknown";
  const region = request.headers.get("CF-Region") || "";
  const lat = request.headers.get("CF-IPLatitude") || "0";
  const lon = request.headers.get("CF-IPLongitude") || "0";
  const asn = request.headers.get("CF-IPAsn") || "";
  const asnOrg = request.headers.get("CF-IPAsnOrg") || "Unknown ISP";
  const vpnDetection = detectVPN(asn, asnOrg, request.headers);
  const maskedIP = maskIP(ip);
  const pingStart = Date.now();
  try { await fetch("https://bitdefender.com", { method: "HEAD", signal: AbortSignal.timeout(3000) }); } catch (e) {}
  const pingMs = Date.now() - pingStart;
  if (env.DB) {
    const hashedIP = await hashIP(ip, env.LICENSE_SALT || "default-salt");
    try {
      await env.DB.prepare("INSERT INTO connection_logs (ip_hash, zip_code, country, region, asn, is_vpn, created_at) VALUES (?, ?, ?, ?, ?, ?, datetime('now'))").bind(hashedIP, zipCode, country, region, asn, vpnDetection.isVPN ? 1 : 0).run();
    } catch (e) {}
  }
  let connectionStatus = "safe";
  let statusMessage = "Connection appears secure";
  if (vpnDetection.isVPN) { connectionStatus = "protected"; statusMessage = "VPN or proxy detected - your traffic is being routed"; }
  else if (country !== "US") { connectionStatus = "warning"; statusMessage = "International connection detected"; }
  return jsonResponse({
    connection_status: connectionStatus, status_message: statusMessage, ip: maskedIP, ip_full_masked: maskedIP,
    location: { city, region, country, postal: zipCode, latitude: parseFloat(lat), longitude: parseFloat(lon), timezone: getTimezone(country, region) },
    isp: { name: asnOrg, asn: asn ? `AS${asn}` : "Unknown" },
    vpn: vpnDetection, ping_ms: pingMs, input_zip: zipCode
  }, 200, corsHeaders);
}

async function handleContact(request, env, corsHeaders) {
  const contentType = request.headers.get("content-type") || "";
  let name, email, message;
  if (contentType.includes("application/x-www-form-urlencoded")) {
    const formData = await request.formData();
    name = formData.get("name"); email = formData.get("email"); message = formData.get("message");
  } else {
    const body = await request.json();
    name = body.name; email = body.email; message = body.message;
  }
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!name || name.length < 2 || name.length > 100) return new Response(null, { status: 302, headers: { "Location": "/#contact?error=name" } });
  if (!email || !emailRegex.test(email)) return new Response(null, { status: 302, headers: { "Location": "/#contact?error=email" } });
  if (!message || message.length < 10 || message.length > 1000) return new Response(null, { status: 302, headers: { "Location": "/#contact?error=message" } });
  if (env.DB) {
    try { await env.DB.prepare("INSERT INTO contact_submissions (name, email, message, created_at) VALUES (?, ?, ?, datetime('now'))").bind(name, email, message).run(); } catch (e) { console.error("DB error:", e); }
  }
  if (env.CONTACT_EMAIL) {
    try {
      const emailBody = [`From: Info@sassyconsultingllc.com`,`To: Info@sassyconsultingllc.com`,`Reply-To: ${email}`,`Subject: Contact Form: ${name}`,`Content-Type: text/plain; charset=utf-8`,``,`New contact form submission:`,``,`Name: ${name}`,`Email: ${email}`,``,`Message:`,`${message}`,``,`---`,`Sent from sassyconsultingllc.com contact form`].join("\r\n");
      const msg = new EmailMessage("Info@sassyconsultingllc.com", "Info@sassyconsultingllc.com", emailBody);
      await env.CONTACT_EMAIL.send(msg);
    } catch (e) { console.error("Email error:", e); }
  }
  return new Response(null, { status: 302, headers: { "Location": "/contact-success.html" } });
}

async function handleCheckout(request, env, corsHeaders) {
  const body = await request.json();
  const { product, email, success_url, cancel_url } = body;
  if (!product || !PRODUCTS[product]) return jsonResponse({ error: "Invalid product" }, 400, corsHeaders);
  if (!email) return jsonResponse({ error: "Email required" }, 400, corsHeaders);
  const productInfo = PRODUCTS[product];
  const priceId = env[`STRIPE_PRICE_${product.toUpperCase().replace("-", "_")}`];
  const stripeResponse = await fetch("https://api.stripe.com/v1/checkout/sessions", {
    method: "POST",
    headers: { "Authorization": `Bearer ${env.STRIPE_SECRET_KEY}`, "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      "payment_method_types[]": "card", "line_items[0][price]": priceId, "line_items[0][quantity]": "1",
      "mode": "payment", "success_url": success_url || `${env.SITE_URL}/success?session_id={CHECKOUT_SESSION_ID}`,
      "cancel_url": cancel_url || `${env.SITE_URL}/${product}.html`, "customer_email": email,
      "metadata[product]": product, "metadata[product_name]": productInfo.name
    })
  });
  const session = await stripeResponse.json();
  if (session.error) return jsonResponse({ error: session.error.message }, 400, corsHeaders);
  return jsonResponse({ checkout_url: session.url, session_id: session.id }, 200, corsHeaders);
}

async function handleVerify(request, env, corsHeaders) {
  const body = await request.json();
  const { session_id } = body;
  if (!session_id) return jsonResponse({ error: "Session ID required" }, 400, corsHeaders);
  const stripeResponse = await fetch(`https://api.stripe.com/v1/checkout/sessions/${session_id}`, {
    headers: { "Authorization": `Bearer ${env.STRIPE_SECRET_KEY}` }
  });
  const session = await stripeResponse.json();
  if (session.error) return jsonResponse({ error: session.error.message }, 400, corsHeaders);
  if (session.payment_status !== "paid") return jsonResponse({ error: "Payment not completed" }, 400, corsHeaders);
  const product = session.metadata.product;
  const email = session.customer_email;
  const licenseKey = await generateLicenseKey(email, product, session_id, env.LICENSE_SALT);
  if (env.DB) {
    try { await env.DB.prepare("INSERT INTO licenses (license_key, email, product, stripe_session_id, created_at) VALUES (?, ?, ?, ?, datetime('now'))").bind(licenseKey, email, product, session_id).run(); } catch (e) {}
  }
  return jsonResponse({ success: true, license_key: licenseKey, product, product_name: PRODUCTS[product]?.name || product, email }, 200, corsHeaders);
}

async function handleWebhook(request, env, corsHeaders) {
  const payload = await request.text();
  const event = JSON.parse(payload);
  if (event.type === "checkout.session.completed") {
    const session = event.data.object;
    const product = session.metadata.product;
    const email = session.customer_email;
    const licenseKey = await generateLicenseKey(email, product, session.id, env.LICENSE_SALT);
    if (env.DB) {
      try { await env.DB.prepare("INSERT OR IGNORE INTO licenses (license_key, email, product, stripe_session_id, created_at) VALUES (?, ?, ?, ?, datetime('now'))").bind(licenseKey, email, product, session.id).run(); } catch (e) {}
    }
  }
  return jsonResponse({ received: true }, 200, corsHeaders);
}

async function handleValidateLicense(request, env, corsHeaders) {
  const body = await request.json();
  const { license_key } = body;
  if (!license_key) return jsonResponse({ valid: false, error: "License key required" }, 400, corsHeaders);
  if (!license_key.startsWith("SASSY-")) return jsonResponse({ valid: false, error: "Invalid license format" }, 200, corsHeaders);
  if (env.DB) {
    const result = await env.DB.prepare("SELECT product, email, created_at FROM licenses WHERE license_key = ?").bind(license_key).first();
    if (result) return jsonResponse({ valid: true, product: result.product, created_at: result.created_at }, 200, corsHeaders);
  }
  return jsonResponse({ valid: false, error: "License not found" }, 200, corsHeaders);
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
    { product: "winforensics", name: "WinForensics", platforms: [{ platform: "windows", filename: "winforensics-setup.msi", size: "18MB" }] }
  ], 200, corsHeaders);
}

async function handleDownload(path, env, corsHeaders) {
  const parts = path.replace("/download/", "").split("/");
  if (parts.length < 3) return new Response("Not found", { status: 404 });
  const [product, platform, filename] = parts;
  const r2Key = `${product}/${platform}/${filename}`;
  const object = await env.DOWNLOADS.get(r2Key);
  if (!object) return new Response("File not found", { status: 404 });
  if (env.DB) { try { await env.DB.prepare("UPDATE downloads SET download_count = download_count + 1 WHERE r2_key = ?").bind(r2Key).run(); } catch (e) {} }
  const headers = new Headers(corsHeaders);
  headers.set("Content-Type", object.httpMetadata?.contentType || "application/octet-stream");
  headers.set("Content-Disposition", `attachment; filename="${filename}"`);
  return new Response(object.body, { headers });
}

// ═══════════════════════════════════════════════════
// NDA: VERIFY ACCESS CODE
// ═══════════════════════════════════════════════════
async function handleNdaVerifyCode(request, env, corsHeaders) {
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
  return jsonResponse({ success: true, agreement_no: agreementNo, signed_at: signedAt, doc_hash: docHash, token: downloadToken }, 200, corsHeaders);
}

// ═══════════════════════════════════════════════════
// NDA: DOWNLOAD (token-gated)
// ═══════════════════════════════════════════════════
async function handleNdaDownload(request, env, corsHeaders) {
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
function jsonResponse(data, status, corsHeaders) {
  return new Response(JSON.stringify(data), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
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
